/**
 * Parent notification feed — FRONT-END ONLY.
 *
 * There is no push or notifications backend, so nothing here is "delivered".
 * The feed is derived on the device from the records the dashboard has already
 * read from Firestore (ChildRecords), and is rebuilt each time they refresh.
 * Only the set of ids the parent has read is stored, in AsyncStorage.
 *
 * Three kinds, matching what a parent asked to hear about: a quiz score,
 * attendance, and a grade at or below the pass mark.
 */
// Type-only: parentData.ts pulls in Firebase, which the logic tests can't load.
import type { ChildClassGrade, ChildRecords } from './parentData';
import { gradePolicy, isPassingGrade, POINT_SCALE } from './gradeDisplay';

const classLabel = (row: ChildClassGrade): string => row.subject ?? row.subject_code ?? 'Class';

export type NotificationKind = 'score' | 'attendance' | 'low_grade';

export interface ParentNotification {
  /** Stable across rebuilds, so "read" survives a refresh. */
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  /** ISO timestamp when the source record carries one, else null. */
  at: string | null;
}

/** Attendance below this share is worth a heads-up. */
export const ATTENDANCE_ALERT_RATE = 0.85;
const MAX_SCORE_ITEMS = 5;

/*
 * Pass or fail by the class's own policy (mode, teacher's pass mark, point-scale
 * direction), exactly as the grades screen decides it. An older entry with no
 * mode falls back to the dashboard ring's inference: 5 or below is the point scale.
 */
type Graded = ChildClassGrade & { final_grade: number };
const policyOf = (c: Graded) => ({ passing_percent: c.passing_percent, point_scale_direction: c.point_scale_direction });
const modeOf = (c: Graded): string => c.mode ?? (c.final_grade <= 5 ? POINT_SCALE : 'ched_percentage');

function isFailing(c: Graded): boolean {
  return isPassingGrade(c.final_grade, modeOf(c), policyOf(c)) === false;
}

function fmtGrade(c: Graded): string {
  return modeOf(c) === POINT_SCALE ? c.final_grade.toFixed(2) : String(Math.round(c.final_grade));
}

/** How far below passing, on one scale: percentages and point grades read 1.0-best. */
function badness(c: Graded): number {
  if (modeOf(c) !== POINT_SCALE) return 100 - c.final_grade;
  const g = gradePolicy(policyOf(c)).point_scale_direction === 'inverted' ? 6 - c.final_grade : c.final_grade;
  return g * 20;
}

function pct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export function buildNotifications(
  childUid: string,
  childName: string,
  records: ChildRecords | null
): ParentNotification[] {
  if (!records) return [];
  const out: ParentNotification[] = [];

  // Lowest grade: every failing class is flagged; the single worst one says so.
  const graded = records.classes.filter((c): c is Graded => typeof c.final_grade === 'number');
  const failing = graded.filter(isFailing);
  const worst = [...failing].sort((a, b) => badness(b) - badness(a))[0];
  for (const c of failing) {
    out.push({
      id: `${childUid}:low:${c.class_id}:${fmtGrade(c)}`,
      kind: 'low_grade',
      title: c === worst && failing.length > 1 ? 'Lowest grade' : 'Grade below passing',
      body: `${childName} has ${fmtGrade(c)} in ${classLabel(c)}, which is below the passing mark.`,
      at: null,
    });
  }

  // Attendance, per class, only when it is worth raising.
  for (const a of records.attendance) {
    if (a.rate == null || a.rate >= ATTENDANCE_ALERT_RATE) continue;
    const cls = records.classes.find((c) => c.class_id === a.class_id);
    const label = cls ? classLabel(cls) : 'a class';
    out.push({
      id: `${childUid}:att:${a.class_id}:${a.tally.absent}:${a.tally.late}`,
      kind: 'attendance',
      title: 'Attendance alert',
      body: `${childName}'s attendance in ${label} is ${pct(a.rate)} (${a.tally.absent} absent, ${a.tally.late} late).`,
      at: null,
    });
  }

  // Newest scored quizzes.
  const scored = records.attempts
    .filter((q) => q.total_score != null && q.total_possible)
    .sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''))
    .slice(0, MAX_SCORE_ITEMS);
  for (const q of scored) {
    out.push({
      id: `${childUid}:score:${q.attempt_id}`,
      kind: 'score',
      title: 'New quiz score',
      body: `${childName} scored ${q.total_score}/${q.total_possible} on ${q.quiz_title ?? 'a quiz'}.`,
      at: q.submitted_at,
    });
  }

  return out;
}
