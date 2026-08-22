import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { AttendanceLog, AttendancePayload, PerformancePayload } from './parent';

/**
 * A guardian's view of one class, read straight from Firestore.
 *
 * Replaces GET /api/parent/student/{id}/classes/{cid}/performance and the
 * matching attendance endpoint. Same payload shapes, so the screen does not
 * change: only where the data comes from.
 *
 * WHY THIS IS A CORRECTNESS FIX, NOT A REFACTOR
 *
 * The Flask endpoint RECOMPUTED the grade from raw scores on every request.
 * The web Class Record computes it once and stores the result. Two
 * computations of the same number is two chances to disagree, and they did:
 * until 2026-08-21 the parent app applied no DepEd transmutation, so a learner
 * the teacher saw as 83 "Satisfactory" reached their guardian as 73.8, which
 * the app then rendered as failing. That was fixed by teaching the server the
 * same rules -- but the second implementation is still there, and so is the
 * next drift.
 *
 * Reading the stored entry removes the second implementation. One computation,
 * one answer, every screen shows it.
 *
 * WHY THIS IS ALLOWED, AND WHY NO PROJECTION HAD TO BE BUILT
 *
 * gradebooks/{classId}/entries/{studentId} is guardian-readable by design --
 * firestore.rules says so, with a comment explaining that the document holds
 * ONE student's computed grade, unlike the assessments subcollection beside it
 * which carries every student's raw scores and is closed to guardians.
 *
 * The entry already carries everything this screen needs: subject, section and
 * grading mode denormalised (so no read of classes/{classId}, which a guardian
 * cannot read either), the period grades, and the per-assessment rows with
 * class_average already computed. Written by the teacher's client on save --
 * see gradebook.js syncEntries.
 */
export async function loadClassPerformance(
  studentUid: string,
  classId: string,
): Promise<PerformancePayload | null> {
  const snap = await getDoc(doc(db, 'gradebooks', classId, 'entries', studentUid));
  if (!snap.exists()) return null;
  const e = snap.data() as any;

  return {
    class_id: e.class_id ?? classId,
    subject: e.subject ?? null,
    section: e.section ?? null,
    // The entry stores this as `mode`; the payload has always called it
    // `grading_mode`, and the screen branches on it to decide whether 3.0 or
    // 75 is the pass mark. Defaulting to deped_k12 matches the server.
    grading_mode: e.mode ?? 'deped_k12',
    final_grade: e.final_grade ?? null,
    periods: Array.isArray(e.periods) ? e.periods : [],
    assessments: Array.isArray(e.assessments) ? e.assessments : [],
  };
}

/**
 * Attendance for one class.
 *
 * attendance_summaries is the projection the teacher writes; a guardian may
 * read it with the can_view_attendance scope. `days` is a map keyed by date,
 * which is how it is stored -- the screen wants a sorted list, so the shaping
 * happens here rather than in the component.
 *
 * Filtered by class in memory rather than with a second `where`. Two equality
 * filters would need a composite index for a handful of documents per student,
 * and parentData.ts already queries this collection the same single-filter way.
 */
export async function loadClassAttendance(
  studentUid: string,
  classId: string,
): Promise<AttendancePayload | null> {
  const snap = await getDocs(
    query(collection(db, 'attendance_summaries'), where('student_id', '==', studentUid)),
  );
  const row = snap.docs.map((d) => d.data() as any).find((d) => d.class_id === classId);
  if (!row) return null;

  const days: Record<string, any> = row.days ?? {};
  const attendance_logs: AttendanceLog[] = Object.entries(days)
    .map(([date, v]) => ({
      date,
      status: (v as any)?.status ?? 'present',
      remarks: (v as any)?.remarks ?? null,
      excuse_url: (v as any)?.excuse_url ?? null,
    }))
    // Newest first, matching what the endpoint returned. Dates are ISO
    // yyyy-mm-dd, so a string compare is a date compare.
    .sort((a, b) => b.date.localeCompare(a.date));

  return {
    class_id: row.class_id ?? classId,
    attendance_logs,
    tally: {
      present: row.tally?.present ?? 0,
      late: row.tally?.late ?? 0,
      absent: row.tally?.absent ?? 0,
      excused: row.tally?.excused ?? 0,
    },
    attendance_rate: row.rate ?? null,
  };
}

/** One assigned study guide, as the insights tab renders it. */
export interface StudyGuide {
  id: string;
  class_id: string | null;
  topic: string | null;
  status: string | null;
  /** 'YYYY-MM-DD', the shape the endpoint returned and the tab prints raw. */
  created_at: string | null;
}

/**
 * The study guides assigned to this student in this class.
 *
 * Replaces GET /api/parent/student/{id}/analytics, the last call this app made
 * to Flask. That endpoint already read `remediations` from Firestore through
 * the Admin SDK -- so the move is not about where the data lives but about who
 * resolves the guardian link. It resolved it from the backend's own SQL table,
 * which knows nothing about a link created in this app, and answered
 * `not_linked` for a connection the dashboard was showing as live. The rules
 * resolve it from the link document itself, so this one works.
 *
 * A draft is invisible here for the same reason it is invisible to the student:
 * a plan carries `target_student_ids` and no `student_id` until it is published
 * (see activklass-web features/classes/remediation.js), so neither the query
 * nor the rule matches it.
 *
 * Two payload fields are not rebuilt. `active_study_guides` was a count no
 * screen read, and `subjects` recomputed each class's grade from raw scores --
 * the second implementation this migration exists to remove. The dashboard
 * already gets that list from the stored entries, in parentData.ts.
 *
 * Filtered by class in memory, like loadClassAttendance above and for the same
 * reason: a second equality filter would need a composite index for a handful
 * of documents per student.
 */
export async function loadClassStudyGuides(
  studentUid: string,
  classId: string,
): Promise<StudyGuide[]> {
  const snap = await getDocs(
    query(collection(db, 'remediations'), where('student_id', '==', studentUid)),
  );

  return snap.docs
    .map((d) => {
      const data = d.data() as any;
      return {
        id: d.id,
        class_id: data.class_id ?? null,
        // Records written by /api/remediate before plans existed carry a title
        // and no topic. The endpoint fell back the same way.
        topic: data.topic || data.title || null,
        status: data.status ?? null,
        created_at: toDateKey(data.created_at),
      };
    })
    .filter((g) => g.class_id === classId)
    // Newest first, nulls last -- what the endpoint's sort produced. Dates are
    // ISO yyyy-mm-dd, so a string compare is a date compare.
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
}

/**
 * A Firestore Timestamp as 'YYYY-MM-DD'.
 *
 * The endpoint sent this string and the tab prints it as "Assigned {date}", so
 * handing the screen a Timestamp object would render [object Object]. Strings
 * pass through: the AI-logged records store a server timestamp, but an older
 * row may already hold a date.
 */
function toDateKey(value: any): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  const date = value?.toDate?.();
  return date instanceof Date && !isNaN(date.getTime())
    ? date.toISOString().slice(0, 10)
    : null;
}
