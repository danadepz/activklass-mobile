import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

/**
 * Sign out, but ask first.
 *
 * Logout sat directly on `onPress` in three places, one of them a small button
 * in a header next to Profile — a stray tap ended the session with no warning
 * and no undo, and on a phone the two are a thumb-width apart.
 *
 * Shared rather than repeated so the wording cannot drift between the student
 * header, the student profile and the guardian profile.
 */
export function useConfirmLogout() {
  const { logout } = useAuth();

  return useCallback(() => {
    Alert.alert(
      'Sign out?',
      'You will need your email and password to sign back in.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
      ],
      { cancelable: true }
    );
  }, [logout]);
}
