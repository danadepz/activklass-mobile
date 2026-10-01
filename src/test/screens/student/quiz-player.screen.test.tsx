/**
 * Does the quiz player mount?
 *
 * The highest-consequence screen in the project. A crash here does not cost a
 * page view; it costs a student their exam, on a clock that is anchored to the
 * server and does not stop while they restart the app.
 *
 * It is also the least-verified code by history. Two real bugs were found here
 * in one day, both invisible to `tsc`:
 *
 *   90e9e9d  the expired timer graded an EMPTY answer set -- a stale closure
 *            meant a student who ran out of time got a zero and lost every
 *            answer they had typed.
 *   8169c02  the expired timer waited for a tap before submitting anything,
 *            so walking away at the wrong moment saved nothing at all.
 *
 * Neither would have been caught by a mount test. That is the honest limit of
 * this file and it is worth writing down: these check that the screen renders,
 * not that the clock is right. The clock is covered by quizAttempts.test.ts,
 * which is where the logic lives and where it is cheap to test properly.
 *
 * What this DOES catch is the failure that would follow either fix going
 * wrong: a screen that throws on mount and never shows the student a question.
 */
import React from 'react'
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native'
import { getDoc, getDocs } from 'firebase/firestore'
import { renderScreen } from '../../renderScreen'
import QuizPlayer from '../../../../app/student/quiz-player'

beforeEach(() => {
  (globalThis as any).__searchParams = {}
  jest.restoreAllMocks()
})

describe('quiz player', () => {
  it('mounts when the quiz cannot be loaded', async () => {
    // Firestore is stubbed to return nothing, so this is the "quiz missing or
    // unreadable" path -- a deleted quiz, a revoked assignment, a bad link.
    // It must render a state, not throw.
    expect(() => renderScreen(<QuizPlayer />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('survives the first frame, before the quiz or attempt resolve', async () => {
    // The assertion is the synchronous mount. Everything this screen shows
    // depends on two async reads; rendering before either lands is the normal
    // first frame, not an edge case.
    expect(() => renderScreen(<QuizPlayer />)).not.toThrow()

    // Then settle before finishing, so React does not flush the act queue
    // into a torn-down environment and exit non-zero on a passing suite.
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('advances through all three questions and allows submission', async () => {
    ;(globalThis as any).__searchParams = { quizId: 'quiz-atomic' }

    const sampleQuiz = {
      id: 'quiz-atomic',
      title: 'Quiz 1 - Atomic Models',
      status: 'published',
      questions: [
        {
          id: 'q1',
          text: 'What is the correct spelling of Atomic?',
          qtype: 'mcq',
          options: [
            { id: 'opt1', text: 'Atomic', is_correct: true },
            { id: 'opt2', text: 'Atommic', is_correct: false },
          ],
          points: 1,
        },
        {
          id: 'q2',
          text: 'What is the correct spelling of Model?',
          qtype: 'mcq',
          options: [
            { id: 'opt3', text: 'Model', is_correct: true },
            { id: 'opt4', text: 'Moddel', is_correct: false },
          ],
          points: 1,
        },
        {
          id: 'q3',
          text: 'What is the title of our Topic?',
          qtype: 'mcq',
          options: [
            { id: 'opt5', text: 'Atomic Model', is_correct: true },
            { id: 'opt6', text: 'Models of Atomic', is_correct: false },
          ],
          points: 1,
        },
      ],
    }

    const sampleAttempt = {
      id: 'att-1',
      quiz_id: 'quiz-atomic',
      student_id: 'test-student',
      status: 'in_progress',
      attempt_number: 1,
      question_ids: ['q1', 'q2', 'q3'],
    }

    ;(getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => sampleQuiz,
    })

    ;(getDocs as jest.Mock).mockResolvedValue({
      empty: false,
      docs: [
        {
          id: 'att-1',
          data: () => sampleAttempt,
        },
      ],
    })

    renderScreen(<QuizPlayer />)

    // Wait for the quiz to load asynchronously and render Question 1
    await waitFor(() => {
      expect(screen.getByText('Question 1 of 3')).toBeTruthy()
    }, { timeout: 3000 })
    expect(screen.getByText('What is the correct spelling of Atomic?')).toBeTruthy()

    // Answer Q1 and advance to Q2
    await act(async () => {
      fireEvent.press(screen.getByText('Atomic'))
    })
    await act(async () => {
      fireEvent.press(screen.getByText('Next Question'))
    })

    // Wait for Question 2
    await waitFor(() => {
      expect(screen.getByText('Question 2 of 3')).toBeTruthy()
    })
    expect(screen.getByText('What is the correct spelling of Model?')).toBeTruthy()

    // Answer Q2 and advance to Q3
    await act(async () => {
      fireEvent.press(screen.getByText('Model'))
    })
    await act(async () => {
      fireEvent.press(screen.getByText('Next Question'))
    })

    // Wait for Question 3
    await waitFor(() => {
      expect(screen.getByText('Question 3 of 3')).toBeTruthy()
    })
    expect(screen.getByText('What is the title of our Topic?')).toBeTruthy()

    // Verify Submit Quiz button is present and Next Question is gone
    expect(screen.queryByText('Next Question')).toBeNull()
    const submitBtn = screen.getByText('Submit Quiz')
    expect(submitBtn).toBeTruthy()
  })
})
