/**
 * Does the guardian dashboard mount?
 *
 * The screen a parent opens to see their child. It is also the RA 10173
 * surface: everything a guardian is permitted to see is reached from here, and
 * mobile is the ONLY place guardians exist -- the web /parent route is a
 * notice pointing at this app.
 *
 * Two states are covered because they fail differently:
 *
 *   no children yet   a guardian who has registered but not redeemed a code.
 *                     Every list on this screen is empty, which is the shape
 *                     that breaks a screen written against a populated one.
 *   loading           the first frame, before any read resolves.
 *
 * Neither is reachable by hand once your own test account has a child linked,
 * which is exactly why they are the ones worth pinning.
 */
import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentDashboard from '../../../../app/parent/dashboard'

beforeEach(() => {
  globalThis.signedInAs({
    id: 'test-parent', role: 'parent',
    first_name: 'Test', last_name: 'Parent', email: 'parent@test.dev',
  })
})

describe('guardian dashboard', () => {
  it('mounts for a guardian with no children linked', async () => {
    expect(() => renderScreen(<ParentDashboard />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('survives the first frame, before any read resolves', async () => {
    // The assertion is the SYNCHRONOUS mount: a screen that only works once
    // data arrives crashes on every cold open.
    expect(() => renderScreen(<ParentDashboard />)).not.toThrow()

    // Then settle before finishing. Without this the test passes and the
    // worker exits NON-ZERO: React flushes the act queue after teardown and
    // the effects still in flight throw into a torn-down environment. A green
    // suite that fails CI anyway is worse than a red one.
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })
})
