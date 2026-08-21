/**
 * The life of one quiz attempt: may it start, how long is left, and what
 * counts as reopening it.
 *
 * This is a port of activklass-web src/lib/quizAttempts.js. The deadline, the
 * allowance and the reopen rules all have to be identical on both clients --
 * a student who runs out of time in a browser must not be handed a fresh
 * clock by opening the phone app. Keep the two files in step; the web copy is
 * the original.
 *
 * Why it exists: the countdown used to be device state seeded from
 * `time_limit_minutes` when the screen mounted, so leaving and returning
 * restarted it. The attempt is now created when Start is pressed, stamped with
 * the server clock, and the deadline is derived from that stamp.
 */

export const IN_PROGRESS = 'in_progress';
export const SUBMITTED = 'submitted';
export const GRADED = 'graded';

/**
 * An attempt the teacher ended without a submission.
 *
 * A status rather than a deletion: deleting would also destroy the reopen
 * history and the away-events attached to it. A discarded attempt is inert --
 * neither open nor used -- so the student's slot is freed.
 */
export const DISCARDED = 'discarded';

export interface Attempt {
  id?: string;
  status?: string;
  attempt_number?: number;
  total_score?: number | null;
  expires_at_ms?: number | null;
  reopen_count?: number;
  focus_events?: Record<string, any>[];
  focus_events_dropped?: number;
  expired_at_submit?: boolean;
  [key: string]: any;
}

export interface AttemptQuiz {
  status?: string;
  assigned_to?: string | string[] | null;
  opens_at?: string | null;
  closes_at?: string | null;
  attempts_allowed?: number | string;
  extra_attempts?: Record<string, number>;
  time_limit_minutes?: number | string | null;
  prevent_backtracking?: boolean;
  [key: string]: any;
}

/** Attempts that are over, however they ended. */
const FINISHED = new Set([SUBMITTED, GRADED]);

/**
 * Attempts that count against the student's allowance.
 *
 * An `in_progress` attempt is deliberately excluded -- a student who is *in*
 * their second sitting has not yet used a third, and counting the open one
 * would lock them out of the attempt they are currently taking.
 */
export function finishedAttempts(attempts: Attempt[] = []): Attempt[] {
  return attempts
    .filter((a) => FINISHED.has(a?.status as string))
    .sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0));
}

/**
 * The attempt this student has open, if any.
 *
 * The earliest, not the newest: more than one is a data error, and picking the
 * newest would let a bug that created duplicates quietly hand out fresh time.
 */
export function openAttempt(attempts: Attempt[] = []): Attempt | null {
  const open = attempts
    .filter((a) => a?.status === IN_PROGRESS)
    .sort((a, b) => (a.attempt_number ?? 0) - (b.attempt_number ?? 0));
  return open[0] ?? null;
}

/**
 * How many attempts this student may take.
 *
 * `extra_attempts` is the per-student grant a teacher makes when a connection
 * drops or a student asks to retake. Additive, so raising the class-wide
 * allowance later does not silently revoke an individual grant.
 */
export function attemptsAllowedFor(quiz: AttemptQuiz | null | undefined, studentId?: string): number {
  const base = Number(quiz?.attempts_allowed) || 1;
  const extra = Number(studentId ? quiz?.extra_attempts?.[studentId] : 0) || 0;
  return Math.max(base + extra, 0);
}

/**
 * Attempt number a new sitting would be given.
 *
 * Every attempt ever numbered counts, discarded ones included. The number is a
 * label, not an allowance: reusing 2 would put two sittings under one label.
 */
export function nextAttemptNumber(attempts: Attempt[] = []): number {
  return (attempts ?? []).reduce((max, a) => Math.max(max, Number(a?.attempt_number) || 0), 0) + 1;
}

/** Attempts a teacher ended without a submission. */
export function discardedAttempts(attempts: Attempt[] = []): Attempt[] {
  return attempts.filter((a) => a?.status === DISCARDED);
}

/**
 * How long an attempt has been open, in milliseconds, or null.
 *
 * The figure a teacher needs before discarding one: a sitting opened four
 * minutes ago is someone still working, one opened yesterday is not.
 */
export function openForMs(attempt: Attempt | null | undefined, now: number = Date.now()): number | null {
  const started = (attempt as any)?.started_at?.toMillis?.() ?? (attempt as any)?.started_at_ms;
  if (!Number.isFinite(started)) return null;
  return Math.max(0, now - started);
}

/** Millisecond deadline for an attempt, or null when the quiz is untimed. */
export function deadlineOf(attempt: Attempt | null | undefined): number | null {
  const ms = Number(attempt?.expires_at_ms);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * Seconds left on an open attempt.
 *
 * Returns null for an untimed quiz -- distinct from 0, which means the time is
 * gone. Never negative.
 */
export function secondsRemaining(attempt: Attempt | null | undefined, now: number = Date.now()): number | null {
  const deadline = deadlineOf(attempt);
  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** Whether an attempt's time has run out. Untimed attempts never expire. */
export function hasExpired(attempt: Attempt | null | undefined, now: number = Date.now()): boolean {
  const deadline = deadlineOf(attempt);
  return deadline != null && now >= deadline;
}

/**
 * The deadline to stamp on a new attempt, from the server's start time.
 *
 * Taking the start from the server rather than the device is the point: a
 * phone with its clock wound back would otherwise buy itself extra time on
 * every attempt.
 */
export function expiryFrom(
  startedAtMs: number,
  timeLimitMinutes: number | string | null | undefined,
): number | null {
  const minutes = Number(timeLimitMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (!Number.isFinite(startedAtMs)) return null;
  return startedAtMs + minutes * 60 * 1000;
}

export interface StartDecision {
  ok: boolean;
  reason?: string;
  resuming?: boolean;
}

/**
 * Whether this student may begin a new attempt, and why not.
 *
 * Reasons are codes rather than sentences, so the two clients can word them in
 * their own voice while agreeing on the decision.
 */
export function canStart({
  quiz,
  attempts = [],
  studentId,
  now = Date.now(),
}: {
  quiz?: AttemptQuiz | null;
  attempts?: Attempt[];
  studentId?: string;
  now?: number;
} = {}): StartDecision {
  if (quiz?.status && quiz.status !== 'published') {
    return { ok: false, reason: 'not_published' };
  }
  const assignedTo = quiz?.assigned_to;
  if (
    assignedTo &&
    assignedTo !== 'all' &&
    !(Array.isArray(assignedTo) && studentId && assignedTo.includes(studentId))
  ) {
    return { ok: false, reason: 'not_assigned' };
  }
  if (quiz?.opens_at && now < new Date(quiz.opens_at).getTime()) {
    return { ok: false, reason: 'not_open' };
  }
  if (quiz?.closes_at && now > new Date(quiz.closes_at).getTime()) {
    return { ok: false, reason: 'closed' };
  }
  // Checked before the allowance: someone mid-attempt is resuming, not
  // starting, and refusing them would leave their open attempt unsubmittable.
  if (openAttempt(attempts)) {
    return { ok: true, resuming: true };
  }
  if (finishedAttempts(attempts).length >= attemptsAllowedFor(quiz, studentId)) {
    return { ok: false, reason: 'no_attempts_left' };
  }
  return { ok: true, resuming: false };
}

export interface BriefingRule {
  key: string;
  label: string;
  detail: string;
}

/**
 * The rules to put in front of a student before they commit to starting.
 *
 * Data, not markup, so both clients show the same list in the same words. This
 * is the screen that makes the timer fair: once Start is pressed the clock runs
 * whether or not the app stays open.
 */
export function startBriefing({
  quiz,
  attempts = [],
  studentId,
  drawCount = null,
}: {
  quiz?: AttemptQuiz | null;
  attempts?: Attempt[];
  studentId?: string;
  drawCount?: number | null;
} = {}): BriefingRule[] {
  const allowed = attemptsAllowedFor(quiz, studentId);
  const used = finishedAttempts(attempts).length;
  const rules: BriefingRule[] = [];

  const minutes = Number(quiz?.time_limit_minutes);
  if (Number.isFinite(minutes) && minutes > 0) {
    rules.push({
      key: 'time',
      label: `${minutes} minute${minutes === 1 ? '' : 's'}`,
      detail: 'The clock starts when you press Start and keeps running if you close this page.',
    });
  } else {
    rules.push({ key: 'time', label: 'No time limit', detail: 'Take as long as you need.' });
  }

  if (quiz?.prevent_backtracking) {
    rules.push({
      key: 'backtracking',
      label: 'No going back',
      detail: 'Once you move on from a question you cannot return to it.',
    });
  }

  if (drawCount) {
    rules.push({
      key: 'draw',
      label: `${drawCount} questions`,
      detail: 'Drawn for you from a larger set, so your paper differs from your classmates.',
    });
  }

  rules.push({
    key: 'attempts',
    label: `Attempt ${used + 1} of ${allowed}`,
    detail:
      used + 1 >= allowed
        ? 'This is your last attempt. Ask your teacher if you need another.'
        : `You have ${allowed - used - 1} more after this one.`,
  });

  rules.push({
    key: 'reopen',
    label: 'Leaving is recorded',
    detail: 'You can come back and carry on, but your teacher sees that the quiz was reopened.',
  });

  return rules;
}

/**
 * Where a quiz sits in its own life, for the teacher's tabs.
 *
 * Derived rather than stored: `opens_at` and `closes_at` already say it.
 */
export function lifecycleOf(quiz: AttemptQuiz | null | undefined, now: number = Date.now()): string {
  if (!quiz?.status || quiz.status === 'draft') return 'draft';
  if (quiz.status === 'closed') return 'past';
  if (quiz.closes_at && now > new Date(quiz.closes_at).getTime()) return 'past';
  if (quiz.opens_at && now < new Date(quiz.opens_at).getTime()) return 'scheduled';
  return 'ongoing';
}

export const LIFECYCLE_TABS = [
  { id: 'ongoing', label: 'Ongoing', hint: 'Open to students right now' },
  { id: 'scheduled', label: 'Scheduled', hint: 'Published, waiting for its opening time' },
  { id: 'draft', label: 'Drafts', hint: 'Not published' },
  { id: 'past', label: 'Past', hint: 'Closed, or past their closing time' },
];

/**
 * One line describing an in-progress or reopened attempt, for the teacher.
 *
 * Reopening is not misconduct and is not worded as though it were -- a dropped
 * connection looks exactly the same.
 */
export function describeAttemptActivity(attempt: Attempt | null | undefined): string {
  if (!attempt) return '';
  const reopens = Number(attempt.reopen_count) || 0;
  if (attempt.status === DISCARDED) {
    return 'Attempt discarded by you';
  }
  if (attempt.status === IN_PROGRESS) {
    return reopens ? `In progress · reopened ${reopens} time${reopens === 1 ? '' : 's'}` : 'In progress';
  }
  if (attempt.expired_at_submit) {
    return reopens ? `Time ran out · reopened ${reopens}×` : 'Time ran out';
  }
  return reopens ? `Reopened ${reopens} time${reopens === 1 ? '' : 's'}` : '';
}

/* ------------------------------------------------------------------ focus

   Leaving the quiz -- switching app, or the screen locking -- is recorded per
   event, with the question that was on screen.

   What this can and cannot see, stated here because the teacher's screen must
   not overclaim it: it detects THIS app losing foreground. It cannot see what
   the student switched to, and it is blind to a second device, a laptop on the
   desk, or a person in the room. A student reading notes on paper produces no
   events at all. It is evidence of attention leaving the app, not evidence of
   cheating, and the wording everywhere downstream reflects that.

   Nothing is blocked on the strength of it. */

/** More than this many events and the tail is counted rather than stored. */
export const FOCUS_EVENT_CAP = 100;

export interface FocusEvent {
  at: string;
  question_index: number | null;
  question_id: string | null;
  away_ms: number;
}

/**
 * One away-and-back event, ready to append.
 *
 * `at` is an ISO string, not a server timestamp: Firestore refuses sentinel
 * values inside array elements. The attempt's own `started_at` is
 * server-stamped, so the trustworthy anchor is still there to compare against.
 */
export function focusEvent({
  at,
  questionIndex,
  questionId,
  awayMs,
}: {
  at: string;
  questionIndex?: number | null;
  questionId?: string | null;
  awayMs?: number;
}): FocusEvent {
  return {
    at,
    question_index: Number.isFinite(questionIndex as number) ? (questionIndex as number) : null,
    question_id: questionId ?? null,
    away_ms: Math.max(0, Math.round(Number(awayMs) || 0)),
  };
}

/**
 * Roll up an attempt's away events for the teacher.
 *
 * Grouped by question as well as totalled: "left 9 times" and "left 9 times,
 * all on question 7" are different observations.
 */
export function summariseFocus(attempt: Attempt | null | undefined) {
  const events = Array.isArray(attempt?.focus_events) ? (attempt!.focus_events as FocusEvent[]) : [];
  const overflow = Number(attempt?.focus_events_dropped) || 0;
  const count = events.length + overflow;
  const totalAwayMs = events.reduce((sum, e) => sum + (Number(e?.away_ms) || 0), 0);

  const byQuestion = new Map<number, { questionIndex: number; count: number; awayMs: number }>();
  for (const event of events) {
    const key = event?.question_index ?? -1;
    const row = byQuestion.get(key) ?? { questionIndex: key, count: 0, awayMs: 0 };
    row.count += 1;
    row.awayMs += Number(event?.away_ms) || 0;
    byQuestion.set(key, row);
  }

  const worst = [...byQuestion.values()].sort((a, b) => b.count - a.count || b.awayMs - a.awayMs)[0] ?? null;

  return { count, totalAwayMs, events, overflow, byQuestion: [...byQuestion.values()], worst };
}

/** Human duration for a span of milliseconds, at second resolution. */
export function formatAway(ms: number): string {
  const total = Math.round((Number(ms) || 0) / 1000);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

/**
 * One neutral line about an attempt's away events, or '' when there were none.
 *
 * Deliberately descriptive. "Left the page" is what was observed; "cheated" is
 * an inference this data cannot support.
 */
export function describeFocus(attempt: Attempt | null | undefined): string {
  const { count, totalAwayMs, worst } = summariseFocus(attempt);
  if (!count) return '';
  const base = `Left the page ${count} time${count === 1 ? '' : 's'} · ${formatAway(totalAwayMs)} away`;
  if (worst && worst.count > 1 && worst.questionIndex >= 0) {
    return `${base} · most on Q${worst.questionIndex + 1}`;
  }
  return base;
}
