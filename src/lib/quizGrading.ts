/**
 * Client-side objective auto-grading for the student Quiz Player.
 *
 * This is a port of activklass-web src/lib/quizGrading.js. Both players write
 * into the SAME quiz_attempts collection and the web quiz-feedback page renders
 * its breakdown from `per_question` regardless of which client produced the
 * attempt -- so the grading, the point maths and the answer encoding have to
 * agree exactly. Keep the two files in step; the web copy is the original.
 *
 * Question shapes (mirroring the teacher quiz builder's toPayload):
 *   mcq:          options: [{ id, text, is_correct }]      answer = option id
 *   true_false:   answer_key: { value: bool }              answer = bool
 *   short_answer: answer_key: { answers: [str] }           answer = string
 *   matching:     answer_key: { pairs: [{ left, right }] } answer = { [pairIndex]: right }
 *   essay:        rubric: string                           answer = string (teacher-graded)
 *
 * Grades are deterministic and never decided by an LLM (essays are queued for
 * the teacher).
 *
 * Group 7 (audit F-06) closed the note that used to be here. Answer keys are no
 * longer in the quiz document a student reads -- they live in
 * `quiz_keys/{quizId}`, which no student rule grants. A student's score comes
 * from `POST /api/quiz_attempts/{id}/submit` and the answers on their feedback
 * screen from `GET /api/quiz_attempts/{id}/review`, so gradeAnswer, gradeQuiz
 * and correctAnswerText below now only ever answer for a LEGACY quiz the
 * migration has not reached.
 *
 * `matchingChoices` and `matchingLefts` are the exceptions, and the reason a
 * `matching` field exists on the public question: the player has to draw the
 * rows and the choices, so the left and right terms are denormalised onto the
 * quiz document UNPAIRED. Both read that first and fall back to `answer_key`.
 */

/** One row of the `per_question` array stored on a quiz attempt. */
export interface PerQuestion {
  id: string;
  qtype: string;
  earned: number;
  possible: number;
  /** null for essays -- nobody has judged it yet. */
  correct: boolean | null;
  pending: boolean;
}

export interface GradeResult {
  total_score: number;
  total_possible: number;
  score_ratio: number;
  has_essays: boolean;
  per_question: PerQuestion[];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Grade one objective question -> { earned, correct }. Essays handled by caller.
 *
 * Every comparison coerces to string first. Answer keys reach us from the
 * builder, the AI draft path and the API, and a single non-string entry (a
 * number in answers[], say) used to throw `a.trim is not a function` mid-grade
 * -- which loses the student's whole submission, not just that question.
 */
export function gradeAnswer(q: any, answer: any): { earned: number; correct: boolean } {
  const points = Number(q.points) || 0;
  switch (q.qtype) {
    case 'mcq': {
      const correctOpt = (q.options ?? []).find((o: any) => o.is_correct);
      const correct = answer != null && correctOpt != null && answer === correctOpt.id;
      return { earned: correct ? points : 0, correct };
    }
    case 'true_false': {
      const correct = typeof answer === 'boolean' && answer === q.answer_key?.value;
      return { earned: correct ? points : 0, correct };
    }
    case 'short_answer': {
      const accepted = (q.answer_key?.answers ?? [])
        .map((a: any) => String(a ?? '').trim().toLowerCase())
        .filter(Boolean);
      const given = String(answer ?? '').trim().toLowerCase();
      const correct = given !== '' && accepted.includes(given);
      return { earned: correct ? points : 0, correct };
    }
    case 'matching': {
      const pairs = q.answer_key?.pairs ?? [];
      if (pairs.length === 0) return { earned: 0, correct: false };
      let hit = 0;
      pairs.forEach((p: any, i: number) => {
        if (String(answer?.[i] ?? '') === String(p.right ?? '')) hit += 1;
      });
      return { earned: round2((points * hit) / pairs.length), correct: hit === pairs.length };
    }
    default:
      return { earned: 0, correct: false };
  }
}

/**
 * Grade a whole quiz against an answers map { [questionId]: answer }.
 * Returns score totals plus a per-question breakdown for the feedback page.
 */
export function gradeQuiz(quiz: any, answers: any): GradeResult {
  let total_score = 0;
  let total_possible = 0;
  let has_essays = false;
  const submitted = answers ?? {};
  const per_question: PerQuestion[] = (quiz.questions ?? []).map((q: any) => {
    const possible = Number(q.points) || 0;
    total_possible += possible;
    if (q.qtype === 'essay') {
      has_essays = true;
      return { id: q.id, qtype: 'essay', earned: 0, possible, correct: null, pending: true };
    }
    const { earned, correct } = gradeAnswer(q, submitted[q.id]);
    total_score += earned;
    return { id: q.id, qtype: q.qtype, earned, possible, correct, pending: false };
  });
  return {
    total_score: round2(total_score),
    total_possible,
    score_ratio: total_possible ? round2(total_score / total_possible) : 0,
    has_essays,
    per_question,
  };
}

/**
 * Has this question been answered at all? (Web keeps this in the player file.)
 *
 * `false` is a real true_false answer, so a truthiness test is wrong here --
 * that is what made the old unanswered-count treat "False" as a skip.
 */
export function isAnswered(q: any, a: any): boolean {
  switch (q.qtype) {
    case 'mcq': return a != null;
    case 'true_false': return typeof a === 'boolean';
    case 'short_answer':
    case 'essay': return typeof a === 'string' && a.trim() !== '';
    case 'matching': return a != null && Object.keys(a).length > 0;
    default: return false;
  }
}

/** Human-readable correct answer for the feedback breakdown. */
export function correctAnswerText(q: any): string {
  switch (q.qtype) {
    case 'mcq':
      return (q.options ?? []).find((o: any) => o.is_correct)?.text ?? '—';
    case 'true_false':
      // No key at all is not an answer of False. Same guard as the web copy.
      if (q.answer_key?.value === undefined) return '—';
      return q.answer_key.value ? 'True' : 'False';
    case 'short_answer':
      return (q.answer_key?.answers ?? []).join('  /  ') || '—';
    case 'matching':
      return (q.answer_key?.pairs ?? []).map((p: any) => `${p.left} → ${p.right}`).join('; ') || '—';
    case 'essay':
      return q.rubric ? `Rubric: ${q.rubric}` : 'Graded by your teacher';
    default:
      return '—';
  }
}

/** Human-readable version of the student's submitted answer. */
export function studentAnswerText(q: any, answer: any): string {
  switch (q.qtype) {
    case 'mcq':
      return (q.options ?? []).find((o: any) => o.id === answer)?.text ?? '— (no answer)';
    case 'true_false':
      return typeof answer === 'boolean' ? (answer ? 'True' : 'False') : '— (no answer)';
    case 'short_answer':
      return String(answer ?? '').trim() ? String(answer) : '— (no answer)';
    case 'matching':
      return matchingLefts(q)
        .map((left: string, i: number) => `${left} → ${answer?.[i] || '?'}`)
        .join('; ');
    case 'essay':
      return String(answer ?? '').trim() ? String(answer) : '— (no answer)';
    default:
      return '— (no answer)';
  }
}

/** Right-hand options for a matching question (deduped). */
export function matchingChoices(q: any): string[] {
  if (q?.matching?.rights) return q.matching.rights as string[];
  return [...new Set((q.answer_key?.pairs ?? []).map((p: any) => p.right))] as string[];
}

/**
 * Left-hand terms of a matching question, in the order they are asked.
 *
 * The player renders one row per entry and the student's answer is keyed by
 * index, so this order IS the answer's shape. One source for it, so the player
 * and studentAnswerText cannot disagree about which row is row 3.
 */
export function matchingLefts(q: any): string[] {
  if (q?.matching?.lefts) return q.matching.lefts as string[];
  return (q.answer_key?.pairs ?? []).map((p: any) => p.left) as string[];
}

/**
 * READ PATH ONLY -- not part of the shape shared with web.
 *
 * Mobile attempts written before this parity fix encoded true_false as the
 * strings 'True'/'False' and keyed matching answers by the left-hand label
 * instead of the pair index. Grading those raw against the canonical grader
 * would mark a correct old answer wrong, so the feedback screen normalises
 * them first. New attempts pass through untouched.
 */
export function normaliseLegacyAnswers(quiz: any, answers: any): Record<string, any> {
  const out: Record<string, any> = { ...(answers ?? {}) };
  (quiz.questions ?? []).forEach((q: any) => {
    const a = out[q.id];
    if (a == null) return;
    if (q.qtype === 'true_false' && typeof a === 'string') {
      if (a === 'True') out[q.id] = true;
      else if (a === 'False') out[q.id] = false;
    }
    if (q.qtype === 'matching' && typeof a === 'object') {
      const lefts = matchingLefts(q);
      const byIndex: Record<number, any> = {};
      lefts.forEach((left: string, i: number) => {
        byIndex[i] = a[i] ?? a[left];
      });
      out[q.id] = byIndex;
    }
  });
  return out;
}
