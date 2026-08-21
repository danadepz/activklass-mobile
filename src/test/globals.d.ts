import type { UserProfile } from '../context/AuthContext'

/**
 * Test-only globals declared in jest.setup.js.
 *
 * They live on globalThis rather than in a module because a jest.mock()
 * factory may not close over module scope -- babel rejects it as an
 * out-of-scope variable -- but globals are permitted. That constraint is the
 * only reason for the shape; nothing here is used outside the screen tests.
 */
declare global {
  // eslint-disable-next-line no-var
  var __authState: {
    user: { uid: string; email: string } | null
    profile: UserProfile | null
    loading: boolean
    logout: () => void
  }

  /** Sign the next render in as someone else. Call before renderScreen(). */
  // eslint-disable-next-line no-var
  var signedInAs: (profile: Partial<UserProfile> & { id: string; email: string }) => void
}

export {}
