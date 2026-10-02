/**
 * Student change password screen tests.
 * Covers both voluntary change (from Profile) and forced change (first sign-in).
 */
import React from 'react';
import { screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { renderScreen } from '../../renderScreen';
import StudentChangePassScreen from '../../../../app/student/change-pass';
import { reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { PASSWORD_RULE } from '../../../../src/lib/validation';

describe('student change password screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('voluntary password change (from Profile)', () => {
    beforeEach(() => {
      (globalThis as any).signedInAs({
        id: 'test-student',
        role: 'student',
        email: 'student@test.dev',
        is_temp_password: false,
      });
    });

    it('mounts without crashing and displays voluntary change title & password rule hint', async () => {
      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByText('Change Password')).toBeTruthy();
        expect(screen.getByText(PASSWORD_RULE)).toBeTruthy();
      });
    });

    it('renders current password, new password, and confirm password fields with Show toggles', async () => {
      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your current password')).toBeTruthy();
        expect(
          screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol')
        ).toBeTruthy();
        expect(screen.getByPlaceholderText('Re-enter new password')).toBeTruthy();
        expect(screen.getAllByText('Show').length).toBe(3);
      });
    });

    it('rejects submit without current password and does not call reauth or update', async () => {
      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your current password')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
          'ValidNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('Re-enter new password'),
          'ValidNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Update Password & Continue'));
      });

      await waitFor(() => {
        expect(screen.getByText('Please enter your current password.')).toBeTruthy();
      });
      expect(reauthenticateWithCredential).not.toHaveBeenCalled();
      expect(updatePassword).not.toHaveBeenCalled();
    });

    it('rejects wrong current password and does not call updatePassword', async () => {
      (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce({
        code: 'auth/wrong-password',
        message: 'Firebase: Error (auth/wrong-password).',
      });

      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your current password')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('Enter your current password'),
          'WrongCurrentPass123!'
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
          'ValidNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('Re-enter new password'),
          'ValidNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Update Password & Continue'));
      });

      await waitFor(() => {
        expect(screen.getByText('Current password is incorrect.')).toBeTruthy();
      });
      expect(reauthenticateWithCredential).toHaveBeenCalled();
      expect(updatePassword).not.toHaveBeenCalled();
    });

    it('reauthenticates before updating password when current password is valid', async () => {
      const callOrder: string[] = [];
      (reauthenticateWithCredential as jest.Mock).mockImplementationOnce(async () => {
        callOrder.push('reauthenticate');
      });
      (updatePassword as jest.Mock).mockImplementationOnce(async () => {
        callOrder.push('updatePassword');
      });

      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your current password')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('Enter your current password'),
          'CorrectPass123!'
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
          'ValidNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('Re-enter new password'),
          'ValidNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Update Password & Continue'));
      });

      await waitFor(() => {
        expect(callOrder).toEqual(['reauthenticate', 'updatePassword']);
      });
      expect(updatePassword).toHaveBeenCalledWith(expect.anything(), 'ValidNewPass123!');
    });
  });

  describe('forced password change (first-time sign in)', () => {
    beforeEach(() => {
      (globalThis as any).signedInAs({
        id: 'test-student',
        role: 'student',
        email: 'student@test.dev',
        is_temp_password: true,
      });
    });

    it('renders first-time setup banner and does NOT render current password input', async () => {
      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByText('Set New Password')).toBeTruthy();
        expect(screen.queryByPlaceholderText('Enter your current password')).toBeNull();
        expect(screen.getAllByText('Show').length).toBe(2);
      });
    });

    it('completes in one step without calling reauthenticateWithCredential', async () => {
      renderScreen(<StudentChangePassScreen />);
      await waitFor(() => {
        expect(screen.getByText('Set New Password')).toBeTruthy();
      });

      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
          'BrandNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.changeText(
          screen.getByPlaceholderText('Re-enter new password'),
          'BrandNewPass123!'
        );
      });
      await act(async () => {
        fireEvent.press(screen.getByText('Update Password & Continue'));
      });

      await waitFor(() => {
        expect(updatePassword).toHaveBeenCalledWith(expect.anything(), 'BrandNewPass123!');
      });
      expect(reauthenticateWithCredential).not.toHaveBeenCalled();
    });
  });
});
