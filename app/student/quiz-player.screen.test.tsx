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
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../src/test/renderScreen'
import QuizPlayer from './quiz-player'

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
})
