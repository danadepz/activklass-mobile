/**
 * Pure derivation of the model's three leading indicators — the trends that let
 * /api/predict fire before the gradebook does.
 *
 * Port of activklass-web/src/lib/riskSignals.js. Keep them in step: the
 * student's own forecast on the phone, the same forecast in the browser and
 * the teacher's panel must agree, or a student is told they are fine while
 * their teacher is looking at a flag — or the reverse, which is worse.
 *
 * No I/O; the quiz-deadline logic takes `now` as an argument so "was this
 * missed?" is testable at all.
 */

/** present = 1, late = 0.5, absent = 0. Excused days are left out entirely
 *  rather than counted as present -- an excused absence is not attendance. */
export const DAY_WEIGHT: Record<string, number> = { present: 1, late: 0.5, absent: 0 };

/**
 * Below these counts a difference is noise, not a trend.
 *
 * Both helpers return undefined rather than 0 when short of history. 0 means
 * "measured, and flat", a reassuring claim we would not have earned in week
 * two, and the backend would score it as a steady student instead of an
 * unknown one.
 */
export const MIN_ATTENDANCE_DAYS = 6;
export const MIN_ATTEMPTS = 3;

/** Firestore dates arrive as Timestamps or as 'YYYY-MM-DD' doc ids. */
export const sortKey = (v: any): string =>
  v && typeof v.toDate === 'function' ? v.toDate().toISOString() : String(v ?? '');

/**
 * Mean of the trailing third minus the mean of the leading two thirds.
 * `values` must already be in chronological order.
 */
export function splitTrend(values: number[] | undefined, minimum: number): number | undefined {
  if (!Array.isArray(values) || values.length < minimum) return undefined;
  const cut = Math.max(1, Math.floor(values.length / 3));
  const recent = values.slice(-cut);
  const earlier = values.slice(0, -cut);
  if (!recent.length || !earlier.length) return undefined;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return mean(recent) - mean(earlier);
}

export interface AttendanceRecord {
  date: any;
  status?: string | null;
}

/** Attendance trend (-1..1) from a log of `{ date, status }`, in any order. */
export function attendanceTrendFromLog(log: AttendanceRecord[] | undefined): number | undefined {
  const marks = [...(log ?? [])]
    .sort((a, b) => sortKey(a.date).localeCompare(sortKey(b.date)))
    .map((r) => DAY_WEIGHT[r?.status ?? ''])
    .filter((w) => w != null);
  return splitTrend(marks, MIN_ATTENDANCE_DAYS);
}

export interface ScoredAttempt {
  total_score?: number | null;
  total_possible?: number | null;
  submitted_at?: any;
}

/**
 * Quiz trend in percentage points from attempts carrying `submitted_at`.
 * Walks attempts in submission order, unlike the quiz *average*, which stays
 * best-per-student; a student whose scores are falling still has their one
 * good early attempt sitting in the maximum.
 */
export function quizTrendFromAttempts(attempts: ScoredAttempt[] | undefined): number | undefined {
  const scored = (attempts ?? [])
    .filter((a) => a?.total_score != null && a?.total_possible)
    .map((a) => ({ pct: (a.total_score! / a.total_possible!) * 100, at: sortKey(a.submitted_at) }))
    .sort((x, y) => x.at.localeCompare(y.at));
  return splitTrend(scored.map((a) => a.pct), MIN_ATTEMPTS);
}

export interface WorkCounts {
  notDone: number;
  expected: number;
}

/**
 * Missing assessments from the shape a student's own gradebook entry uses:
 * that student's assessments already flattened, each carrying its own status.
 * 'excused' is excluded; no record at all is not yet evidence of anything.
 */
export function missingWorkCountsFromEntry(entryAssessments: { status?: string | null }[] | undefined): WorkCounts {
  let expected = 0;
  let notDone = 0;
  for (const assessment of entryAssessments ?? []) {
    if (!assessment?.status || assessment.status === 'excused') continue;
    expected += 1;
    if (assessment.status === 'missing') notDone += 1;
  }
  return { notDone, expected };
}

function assignedTo(quiz: any, studentId: string): boolean {
  const a = quiz?.assigned_to;
  return !a || a === 'all' || (Array.isArray(a) && a.includes(studentId));
}

/**
 * Can this quiz still be attempted? Only a quiz a student can no longer sit
 * counts against them. An open quiz they have not started yet is homework.
 */
function windowClosed(quiz: any, now: number): boolean {
  if (quiz?.status === 'closed') return true;
  if (quiz?.status !== 'published') return false; // drafts are not expected work
  const closesAt = quiz?.closes_at;
  if (!closesAt) return false; // open-ended: never overdue
  const closes = new Date(closesAt).getTime();
  return Number.isFinite(closes) && closes < now;
}

/**
 * Quizzes this student was assigned, could no longer take, and never attempted.
 * This is the blind spot the rest of the model cannot see: a student who never
 * opened a quiz has no attempt document at all.
 */
export function missedQuizCounts(
  quizzes: any[] | undefined,
  attemptedQuizIds: Set<string> | undefined,
  studentId: string,
  now: number = Date.now()
): WorkCounts {
  const attempted = attemptedQuizIds ?? new Set<string>();
  let expected = 0;
  let notDone = 0;
  for (const quiz of quizzes ?? []) {
    if (!assignedTo(quiz, studentId) || !windowClosed(quiz, now)) continue;
    expected += 1;
    if (!attempted.has(quiz.id)) notDone += 1;
  }
  return { notDone, expected };
}

/**
 * Pool any number of {notDone, expected} counts into one 0-1 rate.
 * undefined when nothing was expected of the student yet.
 */
export function missingRate(...counts: (WorkCounts | null | undefined)[]): number | undefined {
  let notDone = 0;
  let expected = 0;
  for (const part of counts) {
    if (!part) continue;
    notDone += part.notDone ?? 0;
    expected += part.expected ?? 0;
  }
  return expected ? notDone / expected : undefined;
}

/**
 * Best percentage per quiz, averaged — one input to the standing forecast.
 * Best rather than latest, matching how the teacher's mastery figures read
 * attempts. Mirrors the inline computation on the web's class page.
 */
export function quizAverageOf(attemptsByQuiz: Record<string, ScoredAttempt[]>): number | null {
  const bests = Object.values(attemptsByQuiz)
    .map((attempts) => {
      const scored = attempts.filter((a) => a.total_score != null && a.total_possible);
      if (!scored.length) return null;
      return Math.max(...scored.map((a) => (a.total_score! / a.total_possible!) * 100));
    })
    .filter((v): v is number => v != null);
  return bests.length ? Math.round(bests.reduce((s, v) => s + v, 0) / bests.length) : null;
}
