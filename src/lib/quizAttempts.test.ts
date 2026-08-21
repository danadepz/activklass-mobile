/**
 * The exam clock and the attempt allowance.
 *
 * First tests in this repo. The mobile app had none, which left `tsc` as its
 * only automated check -- and typechecking proves the shapes line up, not that
 * a student gets the time they are owed.
 *
 * This module is the right place to start: it is pure, it takes `now` as a
 * parameter so nothing here depends on the wall clock, and every function in
 * it decides something a student cannot appeal. Getting `secondsRemaining`
 * wrong by a sign shortens an exam; getting `finishedAttempts` wrong locks a
 * student out of the sitting they are in the middle of.
 *
 * The cases below are boundaries, not happy paths. The happy path was never
 * the thing that was going to break.
 */
import { describe, expect, it } from 'vitest';
import {
  attemptsAllowedFor,
  canStart,
  deadlineOf,
  DISCARDED,
  expiryFrom,
  finishedAttempts,
  hasExpired,
  IN_PROGRESS,
  nextAttemptNumber,
  openAttempt,
  secondsRemaining,
  SUBMITTED,
} from './quizAttempts';

const T0 = 1_700_000_000_000; // fixed epoch; nothing here reads the real clock
const timed = (expires: number | null) => ({ status: IN_PROGRESS, expires_at_ms: expires });

describe('deadlineOf', () => {
  it('is null for an untimed quiz', () => {
    expect(deadlineOf(timed(null))).toBeNull();
    expect(deadlineOf({})).toBeNull();
  });

  // A malformed deadline must read as "untimed", never as "already expired" --
  // the second would submit a student's paper the moment they opened it.
  it('treats a zero, negative or unparseable deadline as untimed', () => {
    expect(deadlineOf(timed(0))).toBeNull();
    expect(deadlineOf(timed(-1))).toBeNull();
    expect(deadlineOf({ expires_at_ms: 'soon' } as any)).toBeNull();
    expect(deadlineOf({ expires_at_ms: NaN })).toBeNull();
  });
});

describe('secondsRemaining', () => {
  it('separates untimed (null) from out of time (0)', () => {
    // The distinction the countdown UI depends on: null hides the timer,
    // 0 submits the paper. Collapsing them would do one of those wrongly.
    expect(secondsRemaining(timed(null), T0)).toBeNull();
    expect(secondsRemaining(timed(T0), T0)).toBe(0);
  });

  it('never goes negative once the deadline has passed', () => {
    expect(secondsRemaining(timed(T0 - 60_000), T0)).toBe(0);
  });

  it('rounds up, so a part second is still time on the clock', () => {
    expect(secondsRemaining(timed(T0 + 1_500), T0)).toBe(2);
    expect(secondsRemaining(timed(T0 + 1), T0)).toBe(1);
  });

  it('counts down as now advances', () => {
    const deadline = T0 + 60_000;
    expect(secondsRemaining(timed(deadline), T0)).toBe(60);
    expect(secondsRemaining(timed(deadline), T0 + 30_000)).toBe(30);
  });
});

describe('hasExpired', () => {
  it('never expires an untimed attempt', () => {
    expect(hasExpired(timed(null), T0 + 10 ** 9)).toBe(false);
  });

  it('expires exactly at the deadline, not a tick later', () => {
    expect(hasExpired(timed(T0), T0 - 1)).toBe(false);
    expect(hasExpired(timed(T0), T0)).toBe(true);
  });
});

describe('expiryFrom', () => {
  it('measures from the SERVER start time', () => {
    // The whole point of the field: a phone with its clock wound back would
    // otherwise buy itself extra time on every attempt.
    expect(expiryFrom(T0, 30)).toBe(T0 + 30 * 60_000);
  });

  it('is untimed when there is no usable limit', () => {
    for (const limit of [0, -5, null, undefined, '', 'thirty']) {
      expect(expiryFrom(T0, limit as any)).toBeNull();
    }
  });

  it('is untimed when the start time itself is unusable', () => {
    expect(expiryFrom(NaN, 30)).toBeNull();
  });

  it('accepts a numeric string, since Firestore fields are loosely typed', () => {
    expect(expiryFrom(T0, '15')).toBe(T0 + 15 * 60_000);
  });
});

describe('finishedAttempts', () => {
  it('does NOT count the attempt the student is sitting right now', () => {
    // Counting it would lock a student out of the attempt they are taking.
    const attempts = [
      { status: SUBMITTED, attempt_number: 1 },
      { status: IN_PROGRESS, attempt_number: 2 },
    ];
    expect(finishedAttempts(attempts)).toHaveLength(1);
  });

  it('does not count a discarded attempt against the allowance', () => {
    expect(finishedAttempts([{ status: DISCARDED, attempt_number: 1 }])).toHaveLength(0);
  });
});

describe('openAttempt', () => {
  it('picks the EARLIEST open attempt, not the newest', () => {
    // More than one open attempt is a data error. Picking the newest would let
    // a bug that created duplicates quietly hand out a fresh clock.
    const attempts = [
      { status: IN_PROGRESS, attempt_number: 3, id: 'newer' },
      { status: IN_PROGRESS, attempt_number: 2, id: 'earlier' },
    ];
    expect(openAttempt(attempts)?.id).toBe('earlier');
  });

  it('is null when nothing is open', () => {
    expect(openAttempt([{ status: SUBMITTED, attempt_number: 1 }])).toBeNull();
    expect(openAttempt([])).toBeNull();
  });
});

describe('nextAttemptNumber', () => {
  it('never reuses a number, including a discarded one', () => {
    // The number is a label, not an allowance. Reusing 2 would put two
    // sittings under one label and double-count in the teacher's averages.
    const attempts = [
      { status: SUBMITTED, attempt_number: 1 },
      { status: DISCARDED, attempt_number: 2 },
    ];
    expect(nextAttemptNumber(attempts)).toBe(3);
  });

  it('starts at 1 with no history', () => {
    expect(nextAttemptNumber([])).toBe(1);
  });
});

describe('attemptsAllowedFor', () => {
  it('defaults to one attempt', () => {
    expect(attemptsAllowedFor({})).toBe(1);
  });

  it('adds a per-student grant rather than replacing the class allowance', () => {
    // Additive, so raising the class-wide allowance later cannot silently
    // revoke an individual grant a teacher made after a dropped connection.
    const quiz = { attempts_allowed: 2, extra_attempts: { alice: 1 } };
    expect(attemptsAllowedFor(quiz, 'alice')).toBe(3);
    expect(attemptsAllowedFor(quiz, 'bob')).toBe(2);
  });
});

describe('canStart', () => {
  const published = { status: 'published', attempts_allowed: 1 };

  it('lets a student resume even with no attempts left', () => {
    // Checked before the allowance: someone mid-attempt is resuming, not
    // starting. Refusing them would leave the open attempt unsubmittable --
    // the student would have answered a paper they could never hand in.
    const decision = canStart({
      quiz: published,
      attempts: [{ status: IN_PROGRESS, attempt_number: 1 }],
      now: T0,
    });
    expect(decision).toMatchObject({ ok: true, resuming: true });
  });

  it('refuses once the allowance is spent', () => {
    const decision = canStart({
      quiz: published,
      attempts: [{ status: SUBMITTED, attempt_number: 1 }],
      now: T0,
    });
    expect(decision).toMatchObject({ ok: false, reason: 'no_attempts_left' });
  });

  it('refuses an unpublished quiz', () => {
    expect(canStart({ quiz: { status: 'draft' }, now: T0 }).reason).toBe('not_published');
  });

  it('refuses a student the quiz was not assigned to, and allows one it was', () => {
    const quiz = { ...published, assigned_to: ['alice'] };
    expect(canStart({ quiz, studentId: 'bob', now: T0 }).reason).toBe('not_assigned');
    expect(canStart({ quiz, studentId: 'alice', now: T0 }).ok).toBe(true);
  });

  it('honours the open and close windows', () => {
    const opens = new Date(T0 + 60_000).toISOString();
    const closes = new Date(T0 - 60_000).toISOString();
    expect(canStart({ quiz: { ...published, opens_at: opens }, now: T0 }).reason).toBe('not_open');
    expect(canStart({ quiz: { ...published, closes_at: closes }, now: T0 }).reason).toBe('closed');
  });
});
