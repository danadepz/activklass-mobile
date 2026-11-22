/**
 * Per-class evidence for the student dashboard's standing forecast.
 *
 * The dashboard used to render one forecast from a grade and attendance rate
 * averaged across every class, with no quiz evidence at all -- so quiz average,
 * quiz trend and the quiz half of missing work were always absent and the model
 * always answered insufficient_data. The web shows this forecast per class (the
 * student's class page), and its inputs are per class; this builds exactly
 * those inputs, one class at a time, from documents the student may already
 * read. Nothing is pooled across classes and nothing missing is filled in.
 *
 * Reads (all already permitted to a student by firestore.rules):
 *   quiz_attempts           where student_id == me       (once, all classes)
 *   quizzes                 where class_ids array-contains c, and legacy class_id == c
 *   classes/c/quiz_excusals where student_id == me       (own rows only)
 * The entry (gradebooks/c/entries/me) and attendance are the ones the
 * dashboard already loads through loadOverallStanding.
 */
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import { isPointScale } from './gradeDisplay';
import { quizAverageOf, ScoredAttempt } from './riskSignals';
import type { AttendanceSummary, EntryAssessment, StudentEntry } from './studentData';

/** The record column a published quiz becomes: `quiz-{quizId}` (web quizToRecord.assessmentIdForQuiz). */
const QUIZ_COLUMN = /^quiz-(.+)$/;

/**
 * The student's entry copies each record column's id and date_given but not
 * its source_quiz_id. A quiz's column id is deterministic, so the link is
 * recovered from the id -- the date_given fallback then works from the one
 * gradebook document a student may read, with no new read and no rules change.
 * A hand-entered column (random id) or task column (`task-…`) is not a quiz.
 */
export function withQuizLinks(assessments: EntryAssessment[] | undefined): EntryAssessment[] {
  return (assessments ?? []).map((a) => {
    if (a?.source_quiz_id) return a;
    const m = typeof a?.id === 'string' ? QUIZ_COLUMN.exec(a.id) : null;
    return m ? { ...a, source_quiz_id: m[1] } : a;
  });
}

/** Students never see drafts; `assigned_to` may target a subset of the class. */
export function visibleQuizzesFor(quizzes: any[] | undefined, studentId: string): any[] {
  return (quizzes ?? []).filter((q) => {
    if (q?.status !== 'published' && q?.status !== 'closed') return false;
    const a = q.assigned_to;
    return !a || a === 'all' || (Array.isArray(a) && a.includes(studentId));
  });
}

export interface ClassQuizEvidence {
  /** undefined = the read failed or has not run: unknown, never "no quizzes". */
  quizzes?: any[];
  attempts?: ScoredAttempt[];
  excused?: Set<string>;
}

export interface ForecastInputs {
  classId: string;
  studentId: string;
  grade: number | null;
  attendanceRate: number | null;
  attendanceLog: AttendanceSummary['log'];
  quizAverage: number | null;
  attempts: ScoredAttempt[] | undefined;
  quizzes: any[] | undefined;
  assessments: EntryAssessment[];
  attemptedQuizIds: Set<string> | undefined;
  /** undefined = the excusal read failed: unknown, never "none excused". */
  excusedQuizIds: Set<string> | undefined;
}

/**
 * The forecast props for ONE class. Attempts are this student's and this
 * class's only (an attempt names its class; a quiz assigned to two classes
 * keeps each class's attempts apart, as the web's class page does).
 */
export function forecastInputsFor({
  classId,
  studentId,
  entry,
  attendance,
  evidence,
}: {
  classId: string;
  studentId: string;
  entry: StudentEntry | null | undefined;
  attendance: AttendanceSummary | null | undefined;
  evidence: ClassQuizEvidence | null | undefined;
}): ForecastInputs {
  const attempts = evidence?.attempts?.filter(
    (a: any) => a?.class_id === classId && a?.student_id === studentId
  );
  const byQuiz: Record<string, ScoredAttempt[]> = {};
  for (const a of attempts ?? []) {
    if (a.quiz_id) (byQuiz[a.quiz_id] ??= []).push(a);
  }
  const log = attendance?.log ?? [];
  return {
    classId,
    studentId,
    // A 1.0-5.0 point grade read as a percent is a certain fail: withheld, as on the web.
    grade: entry && !isPointScale(entry.mode) ? entry.final_grade ?? null : null,
    // This class's recorded rate, the figure the web student page passes (see report).
    attendanceRate: attendance?.rate ?? null,
    attendanceLog: log,
    // Unknown attempts give no average -- never a zero.
    quizAverage: attempts ? quizAverageOf(byQuiz) : null,
    attempts,
    quizzes: evidence?.quizzes ? visibleQuizzesFor(evidence.quizzes, studentId) : undefined,
    assessments: withQuizLinks(entry?.assessments),
    attemptedQuizIds: attempts ? new Set(Object.keys(byQuiz)) : undefined,
    excusedQuizIds: evidence?.excused,
  };
}

/**
 * The quiz evidence for each of the student's classes. One attempts query in
 * total, two quiz queries and one excusal query per class, all one-shot (the
 * forecast does not need live updates). A failed read leaves that piece
 * undefined -- the forecast then reports insufficient data rather than a
 * figure built on a guess.
 */
export async function loadQuizEvidence(
  classIds: string[],
  studentId: string
): Promise<Record<string, ClassQuizEvidence>> {
  const docsOf = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
  const attemptsP = getDocs(query(collection(db, 'quiz_attempts'), where('student_id', '==', studentId)))
    .then(docsOf)
    .catch(() => undefined);
  const perClass = classIds.map(async (classId) => {
    const quizzes = await Promise.all([
      getDocs(query(collection(db, 'quizzes'), where('class_ids', 'array-contains', classId))),
      getDocs(query(collection(db, 'quizzes'), where('class_id', '==', classId))),
    ])
      .then(([arr, scalar]) => {
        const byId = new Map<string, any>();
        [...docsOf(arr), ...docsOf(scalar)].forEach((q: any) => byId.set(q.id, q));
        return [...byId.values()];
      })
      .catch(() => undefined);
    // A failed read is UNKNOWN, not "none excused": counting none would turn an
    // excused quiz into missed work. missedQuizCountsIfKnown then withholds the
    // missing-work rate wherever an excusal could have mattered.
    const excused = await getDocs(
      query(collection(db, 'classes', classId, 'quiz_excusals'), where('student_id', '==', studentId))
    )
      .then((snap: any) => new Set<string>(docsOf(snap).filter((r: any) => r.excused).map((r: any) => r.quiz_id)))
      .catch(() => undefined);
    return [classId, { quizzes, excused }] as const;
  });
  const [attempts, classes] = await Promise.all([attemptsP, Promise.all(perClass)]);
  const out: Record<string, ClassQuizEvidence> = {};
  for (const [classId, ev] of classes) out[classId] = { ...ev, attempts };
  return out;
}
