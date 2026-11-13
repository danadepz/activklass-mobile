/**
 * T-237: per-student quiz access parity with web (97b25e0, mobile cfb3351).
 *
 * A teacher can close a quiz for one student or reopen it for one student
 * after the class-wide window has shut. These cases pin both overrides, plus
 * the lock and resume rules that sit in front of them.
 */
import { describe, expect, it } from 'vitest';
import { canStart, hasIndividualAccessOverride, studentAccessStatus } from './quizAttempts';

const NOW = 1_700_000_000_000;
const publishedQuiz = {
  id: 'q1',
  status: 'published',
  assigned_to: 'all',
  attempts_allowed: 1,
};

describe('T-237 per-student quiz access', () => {
  it('lets an eligible student start an available quiz', () => {
    expect(canStart({ quiz: publishedQuiz, studentId: 's1', now: NOW })).toEqual({ ok: true, resuming: false });
    expect(studentAccessStatus({ quiz: publishedQuiz, studentId: 's1', now: NOW })).toBe('open');
  });

  it('an individual closed override blocks that student only', () => {
    const quiz = { ...publishedQuiz, student_access: { s1: 'closed' } };
    expect(canStart({ quiz, studentId: 's1', now: NOW })).toEqual({ ok: false, reason: 'access_closed' });
    expect(studentAccessStatus({ quiz, studentId: 's1', now: NOW })).toBe('closed');

    expect(canStart({ quiz, studentId: 's2', now: NOW })).toEqual({ ok: true, resuming: false });
    expect(studentAccessStatus({ quiz, studentId: 's2', now: NOW })).toBe('open');
  });

  it('refuses a locked attempt but resumes an in-progress one', () => {
    const locked = [{ id: 'att-1', status: 'locked', attempt_number: 1 }];
    expect(canStart({ quiz: publishedQuiz, attempts: locked, studentId: 's1', now: NOW })).toEqual({
      ok: false,
      reason: 'locked',
    });
    expect(studentAccessStatus({ quiz: publishedQuiz, attempts: locked, studentId: 's1', now: NOW })).toBe('locked');

    const inProgress = [{ id: 'att-2', status: 'in_progress', attempt_number: 1 }];
    expect(canStart({ quiz: publishedQuiz, attempts: inProgress, studentId: 's1', now: NOW })).toEqual({
      ok: true,
      resuming: true,
    });
  });

  it('a class-wide closed or expired quiz denies ordinary access', () => {
    const closed = { ...publishedQuiz, status: 'closed' };
    expect(canStart({ quiz: closed, studentId: 's1', now: NOW })).toEqual({ ok: false, reason: 'closed' });
    expect(studentAccessStatus({ quiz: closed, studentId: 's1', now: NOW })).toBe('closed');

    const expired = { ...publishedQuiz, closes_at: new Date(NOW - 60_000).toISOString() };
    expect(canStart({ quiz: expired, studentId: 's1', now: NOW })).toEqual({ ok: false, reason: 'closed' });
    expect(studentAccessStatus({ quiz: expired, studentId: 's1', now: NOW })).toBe('closed');
  });

  it('an individual open override admits that student past a closed, expired quiz', () => {
    const quiz = {
      ...publishedQuiz,
      status: 'closed',
      closes_at: new Date(NOW - 60_000).toISOString(),
      student_access: { s1: 'open' },
    };
    expect(canStart({ quiz, studentId: 's1', now: NOW })).toEqual({ ok: true, resuming: false });
    expect(studentAccessStatus({ quiz, studentId: 's1', now: NOW })).toBe('open');

    expect(canStart({ quiz, studentId: 's2', now: NOW })).toEqual({ ok: false, reason: 'closed' });
    expect(studentAccessStatus({ quiz, studentId: 's2', now: NOW })).toBe('closed');

    expect(hasIndividualAccessOverride(quiz, 's1')).toBe(true);
    expect(hasIndividualAccessOverride(quiz, 's2')).toBe(false);
  });

  it('handles missing or malformed access metadata safely', () => {
    expect(() => canStart({ quiz: null, now: NOW })).not.toThrow();
    expect(canStart({ quiz: { ...publishedQuiz, student_access: null }, studentId: 's1', now: NOW })).toEqual({
      ok: true,
      resuming: false,
    });
    expect(canStart({ quiz: { ...publishedQuiz, student_access: 'invalid' }, studentId: 's1', now: NOW })).toEqual({
      ok: true,
      resuming: false,
    });
    expect(hasIndividualAccessOverride(null, 's1')).toBe(false);
    expect(hasIndividualAccessOverride({ student_access: null }, 's1')).toBe(false);
  });
});
