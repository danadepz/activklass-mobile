import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';

/**
 * Send a signed-out user back to the landing screen.
 *
 * Signing out clears the Firebase session and the profile, but nothing was
 * navigating: the student dashboard stayed mounted and re-rendered with a null
 * profile, so tapping Logout left "Good morning, Student" on screen over the
 * previous user's grades. It looked like the button had failed, and the stale
 * numbers were the last account's.
 *
 * Guards SCREENS, not the whole app: /login and the guardian sign-up flow are
 * legitimately reached while signed out, so a root-level redirect would bounce
 * a parent out of registration halfway through creating their account.
 *
 * 'loading' is deliberately not treated as signed out. On a cold start the
 * context is loading before Firebase restores the session from AsyncStorage,
 * and redirecting then would throw out a user who is in fact signed in.
 */
export function useRequireAuth() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'signed_out' || status === 'not_registered') {
      router.replace('/');
    }
  }, [status, router]);

  return status;
}
