/**
 * A guardian's view of their child's records, read straight from Firestore.
 *
 * Replaces the Flask calls the dashboard used to make for grades, classes and
 * quiz scores. Those endpoints exist and work, but they resolve the guardian
 * link from the backend's own Postgres table, which knows nothing about a link
 * created in this app — so every one of them answered `not_linked` and the
 * dashboard fell back to "records unavailable" for a connection that was live.
 *
 * What makes this safe is that the rules already scoped these documents per
 * student, and per SCOPE:
 *
 *   gradebooks/{classId}/entries/{studentId}
 *       One student's computed grade. Peer scores are never written into it —
 *       they live in the assessments subcollection, which stays teacher-only.
 *       Gated on can_view_grades.
 *   quiz_attempts/{id}
 *       Gated on can_view_quiz_scores.
 *
 *   attendance_summaries/{classId}_{studentId}
 *       Gated on can_view_attendance.
 *
 * That last one exists because a day of attendance is ONE document holding the
 * records map for the WHOLE class, and a rule can only allow or deny an entire
 * document -- so a guardian could never be handed the class sheet. The
 * teacher's save now also writes a per-student projection of it (see
 * activklass-web src/lib/attendanceMirror.js), which is the same answer the
 * gradebook reached with its per-student entries.
 *
 * Why the class list comes from the entries rather than `classes`
 * --------------------------------------------------------------
 * A class document carries `student_ids`, the whole roster, so guardians are
 * not granted read on it. The teacher's save stamps the subject and section
 * onto each entry instead (see activklass-web record.jsx `syncEntries`), which
 * makes the entry self-describing and keeps the roster private. Entries written
 * before that change have no subject; `classLabel` falls back rather than
 * showing a blank row, and they fix themselves the next time a teacher saves.
 */
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { GuardianScopes } from './parent';

export interface ChildClassGrade {
  class_id: string;
  subject: string | null;
  subject_code: string | null;
  section: string | null;
  final_grade: number | null;
  periods: { id: string; name: string | null; grade: number | null }[];
}

export interface ChildQuizAttempt {
  attempt_id: string;
  quiz_id: string | null;
  quiz_title: string | null;
  class_id: string | null;
  total_score: number | null;
  total_possible: number | null;
  status: string | null;
  submitted_at: string | null;
}

export interface ChildAttendance {
  class_id: string;
  tally: { present: number; late: number; absent: number; excused: number };
  rate: number | null;
}

export interface ChildRecords {
  classes: ChildClassGrade[];
  attempts: ChildQuizAttempt[];
  attendance: ChildAttendance[];
  /** Pooled across classes, so a class with two recorded days does not weigh
   *  the same as one with forty. null when nothing is recorded. */
  attendanceRate: number | null;
  /** Mean of the classes that have a final grade, or null when none do. */
  overallAverage: number | null;
  /** True when a read was denied or failed, so the UI can say so honestly. */
  partial: boolean;
}

/** A row's heading when the entry predates the denormalised subject. */
export function classLabel(row: ChildClassGrade): string {
  return row.subject ?? row.subject_code ?? 'Class';
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : (value as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/**
 * Every class this student has a computed grade in.
 *
 * A collection-group query, which needs its own rule — the nested one under
 * gradebooks/{classId} governs single-document reads only. The class id is
 * recovered from the document path, since it is the grandparent of the entry.
 */
async function loadGrades(studentUid: string): Promise<ChildClassGrade[]> {
  const snap = await getDocs(
    query(collectionGroup(db, 'entries'), where('student_id', '==', studentUid))
  );
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      // gradebooks/{classId}/entries/{studentId} — the grandparent is the class.
      class_id: data.class_id ?? d.ref.parent.parent?.id ?? '',
      subject: data.subject ?? null,
      subject_code: data.subject_code ?? null,
      section: data.section ?? null,
      final_grade: toNumber(data.final_grade),
      periods: Array.isArray(data.periods)
        ? data.periods.map((p: any) => ({
            id: String(p.id ?? ''),
            name: p.name ?? null,
            grade: toNumber(p.grade),
          }))
        : [],
    };
  });
}

/** One student's attendance across every class, from the projection. */
async function loadAttendance(studentUid: string): Promise<ChildAttendance[]> {
  const snap = await getDocs(
    query(collection(db, 'attendance_summaries'), where('student_id', '==', studentUid))
  );
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      class_id: data.class_id ?? '',
      tally: {
        present: data.tally?.present ?? 0,
        late: data.tally?.late ?? 0,
        absent: data.tally?.absent ?? 0,
        excused: data.tally?.excused ?? 0,
      },
      rate: typeof data.rate === 'number' ? data.rate : null,
    };
  });
}

async function loadAttempts(studentUid: string): Promise<ChildQuizAttempt[]> {
  const snap = await getDocs(
    query(collection(db, 'quiz_attempts'), where('student_id', '==', studentUid))
  );
  return snap.docs.map((d) => {
    const data = d.data() as any;
    return {
      attempt_id: d.id,
      quiz_id: data.quiz_id ?? null,
      quiz_title: data.quiz_title ?? null,
      class_id: data.class_id ?? null,
      // total_score, not score: the two writers disagreed once and mobile
      // attempts vanished from the teacher's view. See activklass-web BACKLOG.
      total_score: toNumber(data.total_score),
      total_possible: toNumber(data.total_possible),
      status: data.status ?? null,
      submitted_at: data.submitted_at?.toDate?.()?.toISOString?.() ?? data.submitted_at ?? null,
    };
  });
}

/**
 * Everything the dashboard shows for one child.
 *
 * Each read is independent: a denied or failing one degrades that section only.
 * The scopes are honoured before asking, so a student who switched grades off
 * produces no denied read to explain — the rules would refuse it anyway, and
 * this keeps the failure out of the log where it would look like a defect.
 */
export async function loadChildRecords(
  studentUid: string,
  scopes: GuardianScopes
): Promise<ChildRecords> {
  let partial = false;

  const [classes, attempts, attendance] = await Promise.all([
    scopes.can_view_grades
      ? loadGrades(studentUid).catch(() => {
          partial = true;
          return [] as ChildClassGrade[];
        })
      : Promise.resolve([] as ChildClassGrade[]),
    scopes.can_view_quiz_scores
      ? loadAttempts(studentUid).catch(() => {
          partial = true;
          return [] as ChildQuizAttempt[];
        })
      : Promise.resolve([] as ChildQuizAttempt[]),
    scopes.can_view_attendance
      ? loadAttendance(studentUid).catch(() => {
          partial = true;
          return [] as ChildAttendance[];
        })
      : Promise.resolve([] as ChildAttendance[]),
  ]);

  const graded = classes.map((c) => c.final_grade).filter((g): g is number => g != null);
  const overallAverage = graded.length
    ? Math.round((graded.reduce((a, b) => a + b, 0) / graded.length) * 100) / 100
    : null;

  const pooled = attendance.reduce(
    (acc, a) => {
      acc.present += a.tally.present;
      acc.counted += a.tally.present + a.tally.late + a.tally.absent + a.tally.excused;
      return acc;
    },
    { present: 0, counted: 0 }
  );
  const attendanceRate = pooled.counted
    ? Math.round((pooled.present / pooled.counted) * 100)
    : null;

  return { classes, attempts, attendance, attendanceRate, overallAverage, partial };
}
