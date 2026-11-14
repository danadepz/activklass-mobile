/**
 * T-263 (maykel_64440-345): quiz feedback named the right answer and nothing else.
 *
 * A wrong objective item now has "Explain my answer". Tapping it asks the
 * server for an explanation of THIS student's answer, and what comes back
 * opens with that answer ("Why “2/6” is wrong"). A null explanation (the model
 * disagreed with the teacher's key, the daily limit is spent) shows nothing.
 */
import React from 'react'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import QuizFeedback from '../../../../app/student/quiz-feedback'

const EXPLANATION = {
  why_yours_is_wrong: '2/6 is about 0.33, not 0.75.',
  why_correct_is_right: '3 divided by 4 is 0.75.',
  concept: 'A fraction is a division.',
  takeaway: 'Divide to check.',
}

describe('explaining a wrong quiz answer (T-263)', () => {
  const firestore = require('firebase/firestore')
  const { api } = require('../../../lib/api')

  beforeEach(() => {
    (globalThis as any).__searchParams = { attemptId: 'att-1' }
    firestore.doc.mockImplementation((_db: any, col: string, id: string) => ({ path: `${col}/${id}` }))
    firestore.getDoc.mockImplementation(async (ref: any) => {
      const docs: Record<string, any> = {
        'quiz_attempts/att-1': {
          quiz_id: 'quiz-1', student_id: 's1', class_id: 'c1', status: 'graded', attempt_number: 1,
          total_score: 1, total_possible: 2, score_ratio: 0.5,
          answers: { q1: 'a', q2: 'c' },
          per_question: [
            { id: 'q1', correct: false, earned: 0, possible: 1 },
            { id: 'q2', correct: true, earned: 1, possible: 1 },
          ],
        },
        'quizzes/quiz-1': {
          title: 'Fractions',
          questions: [
            { id: 'q1', qtype: 'mcq', points: 1, text: 'Which equals 0.75?', options: [{ id: 'a', text: '2/6' }, { id: 'b', text: '3/4' }] },
            { id: 'q2', qtype: 'mcq', points: 1, text: 'Which equals 0.5?', options: [{ id: 'c', text: '1/2' }, { id: 'd', text: '1/3' }] },
          ],
        },
      }
      const data = docs[ref?.path]
      return { exists: () => Boolean(data), data: () => data }
    })
    firestore.getDocs.mockImplementation(async () => ({ docs: [] }))
    api.mockImplementation(async (path: string) =>
      path.endsWith('/review')
        ? { correct_answers: { q1: '3/4', q2: '1/2' } }
        : { explanation: EXPLANATION, reason: 'generated' })
  })
  afterEach(() => {
    (globalThis as any).__searchParams = {}
    api.mockImplementation(async () => ({}))
  })

  it("offers it once, on the wrong item, and the answer starts from the student's own answer", async () => {
    await renderScreen(<QuizFeedback />)
    const buttons = await screen.findAllByText('Explain my answer')
    expect(buttons).toHaveLength(1)

    await act(async () => { fireEvent.press(buttons[0]) })

    expect(api).toHaveBeenCalledWith('/api/quiz_attempts/att-1/explain', {
      method: 'POST',
      body: { question_id: 'q1' },
    })
    expect(await screen.findByText(/Why “2\/6” is wrong/)).toBeTruthy()
    expect(screen.getByText(/2\/6 is about 0\.33/)).toBeTruthy()
    expect(screen.getByText(/Divide to check\./)).toBeTruthy()
  })

  it('shows nothing when the server declines to explain', async () => {
    api.mockImplementation(async (path: string) =>
      path.endsWith('/review') ? { correct_answers: { q1: '3/4', q2: '1/2' } } : { explanation: null, reason: 'disagreed' })
    await renderScreen(<QuizFeedback />)
    await act(async () => { fireEvent.press(await screen.findByText('Explain my answer')) })
    expect(screen.queryByText('Explain my answer')).toBeNull()
    expect(screen.queryByText(/is wrong/)).toBeNull()
    expect(screen.getByText('3/4')).toBeTruthy()
  })
})
