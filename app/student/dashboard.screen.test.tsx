/**
 * Does the student dashboard mount?
 *
 * That is the whole assertion, and it is worth more than it looks. Before
 * these existed, the only automated check over 9,000 lines of app code was
 * `tsc` -- which happily compiles a screen that reads `.length` off an
 * undefined roster and white-screens the instant a student opens it. That
 * class of failure reached the phone or it reached nobody.
 *
 * Firestore returns EMPTY here, which is the state most likely to break a
 * screen and least likely to be tested by hand: a brand-new student with no
 * classes, no quizzes, no attempts. "Works on my account, which has data" is
 * exactly how an empty-state crash ships.
 */
import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../src/test/renderScreen'
import StudentDashboard from './dashboard'

describe('student dashboard', () => {
  it('mounts for a student with no data at all', async () => {
    expect(() => renderScreen(<StudentDashboard />)).not.toThrow()
    // Let the focus-effect load settle, so a rejected promise surfaces here
    // rather than as an unhandled rejection after the test has passed.
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders a tree, not nothing', async () => {
    renderScreen(<StudentDashboard />)
    await waitFor(() => expect(screen.toJSON()).not.toBeNull())
  })
})
