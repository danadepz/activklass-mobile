/**
 * The Firestore half of an attempt's life: opening one, keeping it, closing it.
 *
 * Port of activklass-web src/hooks/useAttemptSession.js. Both clients write
 * into the same `quiz_attempts` documents, so the field names and the shape of
 * a reopen or an away-event have to match exactly -- a teacher's screen reads
 * them without knowing which app produced them.
 *
 * The shape change: an attempt used to be created at *submit* time in one
 * `addDoc`. It is now created when Start is pressed, as `in_progress`, and
 * updated on submit. That is what makes a timed quiz timed -- the deadline
 * comes from a server-stamped `started_at`, so leaving the app no longer hands
 * back the full clock.
 *
 * firestore.rules was widened to match, narrowly: a student may update their
 * own attempt only while it is still `in_progress`, and may not change
 * `student_id`, `quiz_id` or `started_at`.
 */
import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../config/firebase';
import { FOCUS_EVENT_CAP, expiryFrom, type FocusEvent } from './quizAttempts';

/**
 * Open an attempt and return it.
 *
 * Two writes and a read, once per sitting. The read is the point: a server
 * timestamp cannot be read back from the value you just wrote, so the document
 * is created, read, and then stamped with a deadline derived from the time the
 * *server* recorded. Computing it from `Date.now()` on the device would let a
 * phone with a wound-back clock award itself extra time on every attempt.
 */
export async function startAttempt({
  quiz,
  classId,
  studentId,
  questions,
  attemptNumber,
}: {
  quiz: any;
  classId?: string | null;
  studentId: string;
  questions: Array<{ id: string }>;
  attemptNumber: number;
}) {
  const ref = await addDoc(collection(db, 'quiz_attempts'), {
    quiz_id: quiz.id,
    class_id: classId ?? quiz.class_id ?? null,
    student_id: studentId,
    module_id: quiz.module_id ?? null,
    attempt_number: attemptNumber,
    question_ids: questions.map((q) => q.id),
    status: 'in_progress',
    started_at: serverTimestamp(),
    reopen_count: 0,
    focus_events: [],
    focus_events_dropped: 0,
  });

  const snap = await getDoc(ref);
  const startedAtMs = snap.data()?.started_at?.toMillis?.() ?? Date.now();
  const expiresAtMs = expiryFrom(startedAtMs, quiz.time_limit_minutes ?? quiz.time_limit ?? null);
  if (expiresAtMs) await updateDoc(ref, { expires_at_ms: expiresAtMs });

  return { id: ref.id, ...snap.data(), expires_at_ms: expiresAtMs ?? null } as any;
}

/**
 * Note that the student came back to an attempt they had left.
 *
 * Counted, not punished. A dropped connection, a flat battery and a deliberate
 * walk-away are indistinguishable from here.
 */
export function recordReopen(
  attemptId: string,
  { questionIndex = null, remainingSeconds = null }: { questionIndex?: number | null; remainingSeconds?: number | null } = {},
) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    reopen_count: increment(1),
    last_reopened_at: serverTimestamp(),
    reopens: arrayUnion({
      at: new Date().toISOString(),
      question_index: questionIndex,
      remaining_seconds: remainingSeconds,
    }),
  });
}

/**
 * Record one away-and-back: the student left this app and returned.
 *
 * Past the cap the event is counted instead of stored -- an attempt where
 * someone toggled away two hundred times is fully described by "200 times",
 * and an unbounded array on a document every teacher view reads is a cost with
 * no reader.
 *
 * Fire-and-forget by design: the student is mid-quiz, and a failed write here
 * must never interrupt them or lose an answer.
 */
export function recordFocusEvent(attemptId: string, event: FocusEvent, storedCount = 0) {
  const ref = doc(db, 'quiz_attempts', attemptId);
  if (storedCount >= FOCUS_EVENT_CAP) {
    return updateDoc(ref, { focus_events_dropped: increment(1) });
  }
  return updateDoc(ref, { focus_events: arrayUnion(event) });
}

/**
 * Close the attempt with its marks.
 *
 * `expired` records that the clock ran out rather than the student pressing
 * Submit. Both produce a real, graded attempt; a teacher looking at a low score
 * should be able to see which happened.
 */
export function finishAttempt(
  attemptId: string,
  { result, answers, expired = false }: { result: any; answers: Record<string, any>; expired?: boolean },
) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    answers,
    per_question: result.per_question,
    // Both names are required: `score` is the documented field, `total_score`
    // is what every teacher-side view actually reads.
    total_score: result.total_score,
    score: result.total_score,
    total_possible: result.total_possible,
    score_ratio: result.score_ratio,
    has_essays_pending: result.has_essays,
    status: result.has_essays ? 'submitted' : 'graded',
    expired_at_submit: expired,
    submitted_at: serverTimestamp(),
  });
}

/**
 * End an attempt the student never submitted.
 *
 * Teacher-side; ported so the two apps write the same shape if a teacher tool
 * ever lands on the phone. Marked, not deleted: the reopen history and the
 * away-events on this document are the only explanation anyone will have for
 * why the sitting was abandoned.
 */
export function discardAttempt(
  attemptId: string,
  { teacherId, reason = null }: { teacherId?: string | null; reason?: string | null } = {},
) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    status: 'discarded',
    discarded_at: serverTimestamp(),
    discarded_by: teacherId ?? null,
    discard_reason: reason,
  });
}
