/**
 * Group 7 (audit F-06): the phone player works without ever holding the key.
 *
 * The answers moved out of `quizzes/{quizId}` into `quiz_keys/{quizId}`, which
 * no student rule grants (activklass-backend/firestore.rules). Nothing on this
 * app is a teacher, so mobile never writes or merges a key -- it only has to
 * keep working when the quiz document no longer contains one. That is what
 * these tests pin, on both sides of the migration:
 *
 *   taking a quiz        matching rows and choices off `question.matching`
 *   reviewing an attempt the correct answers off
 *                        `GET /api/quiz_attempts/{id}/review`
 *
 * The split itself lives on the server and in the web client
 * (activklass-web/src/lib/quizAnswerKey.js); its tests are there.
 */
import { describe, expect, it } from 'vitest';
import {
  correctAnswerText,
  gradeQuiz,
  matchingChoices,
  matchingLefts,
  normaliseLegacyAnswers,
  studentAnswerText,
} from './quizGrading';

/** A matching question as it reaches a student AFTER the split: unpaired. */
const SEPARATED = {
  id: 'q4',
  qtype: 'matching',
  text: 'Match.',
  points: 2,
  matching: { lefts: ['Rizal', 'Bonifacio'], rights: ['Katipunan', 'Noli'] },
};

/** The same question BEFORE the migration reaches it: key still inline. */
const LEGACY = {
  id: 'q4',
  qtype: 'matching',
  text: 'Match.',
  points: 2,
  answer_key: { pairs: [{ left: 'Rizal', right: 'Noli' }, { left: 'Bonifacio', right: 'Katipunan' }] },
};

describe('the quiz player on a separated quiz', () => {
  it('draws one row per left-hand term, in ask order', () => {
    expect(matchingLefts(SEPARATED)).toEqual(['Rizal', 'Bonifacio']);
  });

  it('offers every right-hand term as a choice', () => {
    expect(matchingChoices(SEPARATED)).toEqual(['Katipunan', 'Noli']);
  });

  it('cannot recover the pairing from what it was given', () => {
    // The whole point: rights are sorted, not left in pair order, so choice n
    // does not answer row n. Reading them in order gives Rizal -> Katipunan,
    // which is wrong.
    expect(SEPARATED.matching.rights[0]).not.toBe('Noli');
    expect(JSON.stringify(SEPARATED)).not.toContain('pairs');
  });

  it('renders the student’s own answer off the public question', () => {
    expect(studentAnswerText(SEPARATED, { 0: 'Noli', 1: 'Katipunan' }))
      .toBe('Rizal → Noli; Bonifacio → Katipunan');
  });

  it('normalises an old label-keyed answer without the key', () => {
    // A mobile attempt written before the index-keyed parity fix keyed matching
    // answers by the left-hand label; this path used to read those labels out
    // of answer_key.pairs, which a separated quiz no longer has.
    const out = normaliseLegacyAnswers(
      { questions: [SEPARATED] },
      { q4: { Rizal: 'Noli', Bonifacio: 'Katipunan' } },
    );
    expect(out.q4).toEqual({ 0: 'Noli', 1: 'Katipunan' });
  });

  it('reveals no correct answer when the key is absent, for any type', () => {
    // true_false is the one that mattered: it used to fall through to 'False'
    // here -- a wrong answer stated as confidently as a right one, and the
    // normal case on this app once the key moved out of the quiz document.
    expect(correctAnswerText(SEPARATED)).toBe('—');
    expect(correctAnswerText({ id: 'q1', qtype: 'mcq', options: [{ id: 'o1', text: 'Manila' }] }))
      .toBe('—');
    expect(correctAnswerText({ id: 'q2', qtype: 'true_false' })).toBe('—');
    expect(correctAnswerText({ id: 'q3', qtype: 'short_answer' })).toBe('—');
  });

  it('scores nothing locally, which is why the server grades', () => {
    // gradeQuiz is only still here for a legacy attempt with no per_question.
    // On a separated quiz it has no key, so it cannot award marks -- and the
    // real score comes from POST /api/quiz_attempts/{id}/submit regardless.
    const result = gradeQuiz({ questions: [SEPARATED] }, { q4: { 0: 'Noli', 1: 'Katipunan' } });
    expect(result.total_score).toBe(0);
    expect(result.per_question).toHaveLength(1);
  });
});

describe('the quiz player on a legacy quiz (pre-migration)', () => {
  it('falls back to answer_key for the rows', () => {
    expect(matchingLefts(LEGACY)).toEqual(['Rizal', 'Bonifacio']);
  });

  it('falls back to answer_key for the choices', () => {
    expect(matchingChoices(LEGACY)).toEqual(['Noli', 'Katipunan']);
  });

  it('still grades and still names the correct answer', () => {
    expect(gradeQuiz({ questions: [LEGACY] }, { q4: { 0: 'Noli', 1: 'Katipunan' } }).total_score).toBe(2);
    expect(correctAnswerText(LEGACY)).toBe('Rizal → Noli; Bonifacio → Katipunan');
  });
});
