/**
 * What one student sees when they open a quiz: which questions, in what order,
 * with options in what order.
 *
 * This is a port of activklass-web src/lib/quizPool.js. Both players draw from
 * the SAME quiz document, and a student may start a quiz on the web and finish
 * it on their phone -- so the draw has to be byte-for-byte the same on both, or
 * they sit two different papers and the answers they already gave belong to
 * questions no longer in front of them. Keep the two files in step; the web
 * copy is the original.
 *
 * The seeded generator below is why that is possible at all: the draw depends
 * only on (quiz id, student id, attempt number), so it is identical on every
 * device and stable across a refresh, without anything being written before
 * the attempt is submitted.
 */

export interface PoolQuestion {
  id: string;
  qtype?: string;
  points?: number | string;
  options?: { id: string; text?: string; is_correct?: boolean }[];
  [key: string]: any;
}

export interface PoolQuiz {
  id?: string;
  questions?: PoolQuestion[];
  pool_enabled?: boolean;
  pool_draw_count?: number | string | null;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  [key: string]: any;
}

/**
 * FNV-1a over a string, as an unsigned 32-bit int.
 *
 * Not a cryptographic hash and does not need to be: a student who works out
 * their own seed learns the order of their own paper, which they can see.
 */
export function hashSeed(value: unknown): number {
  let hash = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 -- small, fast, and identical across JS engines. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates against a seeded generator. Returns a new array. */
export function shuffleSeeded<T>(items: T[] | undefined, seed: number): T[] {
  const out = [...(items ?? [])];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The seed for one student's sitting of one quiz. */
export function seedFor({
  quizId,
  studentId,
  attemptNumber = 1,
}: {
  quizId?: string;
  studentId?: string;
  attemptNumber?: number;
}): number {
  return hashSeed(`${quizId}::${studentId}::${attemptNumber}`);
}

/**
 * Why a pooled quiz cannot be sat, or null.
 *
 * Equal points across the pool is a hard requirement: if item A is worth 5 and
 * item B worth 1, two students drawing different subsets sit papers marked out
 * of different totals, and the class record has one `total_points` column to
 * put them in. The teacher editor blocks publishing on this, so the player
 * should never meet it -- it is ported so both clients agree on what a valid
 * pool is.
 */
export function poolProblem(quiz: PoolQuiz | null | undefined): string | null {
  if (!quiz?.pool_enabled) return null;
  const questions = quiz.questions ?? [];
  const draw = Number(quiz.pool_draw_count);

  if (!Number.isFinite(draw) || draw < 1) {
    return 'Set how many questions to draw from the pool.';
  }
  if (draw > questions.length) {
    return `The pool has ${questions.length} question(s) but draws ${draw}. Add more questions or lower the draw.`;
  }
  if (!questions.length) return 'A pooled quiz needs questions in its pool.';

  const points = new Set(questions.map((q) => Number(q.points) || 0));
  if (points.size > 1) {
    return `Every question in a pool must be worth the same points, so that each student's paper is marked out of the same total. This pool has ${[...points]
      .sort((a, b) => a - b)
      .join(', ')}.`;
  }
  return null;
}

/** What a pooled quiz is marked out of; the whole paper when it is not pooled. */
export function drawTotalPoints(quiz: PoolQuiz | null | undefined): number {
  const questions = quiz?.questions ?? [];
  if (!quiz?.pool_enabled) {
    return questions.reduce((sum, q) => sum + (Number(q.points) || 0), 0);
  }
  const per = Number(questions[0]?.points) || 0;
  return per * (Number(quiz.pool_draw_count) || 0);
}

/**
 * The paper this student sits.
 *
 * Order of operations matters and must match the web copy exactly. The draw
 * happens first, on the pool in its stored order, so the *set* a student gets
 * does not depend on whether shuffling is on; shuffling then decides the order
 * of that set.
 */
export function questionsForStudent(
  quiz: PoolQuiz | null | undefined,
  { studentId, attemptNumber = 1 }: { studentId?: string; attemptNumber?: number } = {},
): PoolQuestion[] {
  const all = quiz?.questions ?? [];
  const seed = seedFor({ quizId: quiz?.id, studentId, attemptNumber });

  let questions = all;
  if (quiz?.pool_enabled) {
    const draw = Number(quiz.pool_draw_count) || all.length;
    questions = shuffleSeeded(all, seed).slice(0, Math.min(draw, all.length));
  }

  if (quiz?.shuffle_questions) {
    // A second, different seed: with the same one, a pooled quiz would draw and
    // then order by the identical permutation.
    questions = shuffleSeeded(questions, seed ^ 0x9e3779b9);
  }

  if (quiz?.shuffle_options) {
    questions = questions.map((q) =>
      q.qtype === 'mcq' && (q.options ?? []).length
        ? { ...q, options: shuffleSeeded(q.options, seed ^ hashSeed(q.id)) }
        : q,
    );
  }

  return questions;
}

/** The ids of the questions an attempt was actually sat against. */
export function questionIdsOf(questions: PoolQuestion[] | undefined): string[] {
  return (questions ?? []).map((q) => q.id).filter(Boolean);
}

/**
 * The questions an existing attempt was sat against, for review.
 *
 * Attempts written before pooling existed carry no `question_ids`; those sat
 * the whole quiz, so falling back to every question is the correct reading of
 * them rather than a guess.
 */
export function questionsOfAttempt(
  quiz: PoolQuiz | null | undefined,
  attempt: { question_ids?: string[] } | null | undefined,
): PoolQuestion[] {
  const all = quiz?.questions ?? [];
  const ids = attempt?.question_ids;
  if (!Array.isArray(ids) || !ids.length) return all;
  const byId = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter(Boolean) as PoolQuestion[];
}

/**
 * The paper an *open* attempt is sitting, rebuilt from what was stored.
 *
 * Different from `questionsForStudent`: that one derives the paper from the
 * quiz as it is right now, this one reads the ids the attempt recorded when
 * Start was pressed. If the teacher edits the quiz while someone is halfway
 * through it, the student keeps the paper they were given.
 */
export function questionsForAttempt(
  quiz: PoolQuiz | null | undefined,
  attempt: { question_ids?: string[]; attempt_number?: number } | null | undefined,
  { studentId }: { studentId?: string } = {},
): PoolQuestion[] {
  const base = questionsOfAttempt(quiz, attempt);
  if (!quiz?.shuffle_options) return base;
  const seed = seedFor({
    quizId: quiz?.id,
    studentId,
    attemptNumber: attempt?.attempt_number ?? 1,
  });
  return base.map((q) =>
    q.qtype === 'mcq' && (q.options ?? []).length
      ? { ...q, options: shuffleSeeded(q.options, seed ^ hashSeed(q.id)) }
      : q,
  );
}
