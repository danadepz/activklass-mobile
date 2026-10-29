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
 *
 * T-208 (audit F-06): that same rule now also requires the attempt to STAY
 * `in_progress` through any client-written update, so finishing one is no
 * longer a direct write -- see finishAttempt() below.
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
import { api } from './api';
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
  questions: { id: string }[];
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
 *
 * T-208 (audit F-06): this used to grade the attempt client-side
 * (src/lib/quizGrading's gradeQuiz) and write the result straight to
 * Firestore -- nothing stopped a student submitting any score they liked.
 * It now POSTs the raw answers to the server, which re-reads the quiz's
 * own answer key through the Admin SDK and grades authoritatively
 * (app/services/quiz_attempt_grading.py in activklass-backend);
 * firestore.rules refuses a direct client write that tries to finish the
 * attempt itself, so this endpoint is now the only path. Ported from
 * activklass-web's useAttemptSession.js -- same endpoint, same body shape.
 */
export function finishAttempt(
  attemptId: string,
  { answers, expired = false }: { answers: Record<string, any>; expired?: boolean },
) {
  return api(`/quiz_attempts/${attemptId}/submit`, {
    method: 'POST',
    body: { answers, expired },
  });
}

/**
 * Bank the answers so far WITHOUT finishing the attempt.
 *
 * Until this existed, no answer reached Firestore until submit. The attempt
 * document recorded expires_at_ms, reopen_count and focus_events -- it knew
 * the student had left, and not one thing they had written. An OS low-memory
 * kill, an incoming call or a flat battery cost them everything typed so far,
 * while the deadline, anchored to the server clock, kept running.
 *
 * Deliberately does NOT touch status, score or submitted_at. This is a draft,
 * not a submission: an attempt saved this way is still in_progress and still
 * the student's to finish. finishAttempt overwrites `answers` with the final
 * set, so a save that lands late cannot resurrect a stale one.
 *
 * Best effort by design -- every caller swallows the rejection. A failed
 * background save must never interrupt someone mid-exam.
 */
export function saveAnswers(attemptId: string, answers: Record<string, any>) {
  return updateDoc(doc(db, 'quiz_attempts', attemptId), {
    answers,
    answers_saved_at: serverTimestamp(),
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
