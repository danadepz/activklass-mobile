import React from 'react';
import { renderHook } from '@testing-library/react-native';
import { screen, waitFor, fireEvent, act } from '@testing-library/react-native';
import { renderScreen } from '../renderScreen';
import StudentChangePassScreen from '../../../app/student/change-pass';
import ParentChangePassScreen from '../../../app/parent/change-pass';
import { api, ApiError } from '../../lib/api';
import { auth } from '../../config/firebase';
import { BackHandler, Alert } from 'react-native';

// Require the actual implementation of useRequireAuth for gating tests
const actualUseRequireAuth = jest.requireActual('../../hooks/useRequireAuth').useRequireAuth;
const { useRouter } = require('expo-router');

describe('First-Login Enforcement & Password Change Architecture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // 1. Student cannot access dashboard when must_change_password is true
  it('1. redirects student away from protected screens to /student/change-pass when is_temp_password is true', async () => {
    const router = useRouter();
    (globalThis as any).__authState = {
      status: 'signed_in',
      profile: { id: 's-1', role: 'student', is_temp_password: true },
      firebaseUser: { getIdTokenResult: jest.fn().mockResolvedValue({ claims: { must_change_password: true } }) },
    };

    renderHook(() => actualUseRequireAuth());
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/student/change-pass');
    });
  });

  // 2. Parent cannot access dashboard when must_change_password is true
  it('2. redirects parent away from protected screens to /parent/change-pass when is_temp_password is true', async () => {
    const router = useRouter();
    (globalThis as any).__authState = {
      status: 'signed_in',
      profile: { id: 'p-1', role: 'parent', is_temp_password: true },
      firebaseUser: { getIdTokenResult: jest.fn().mockResolvedValue({ claims: { must_change_password: true } }) },
    };

    renderHook(() => actualUseRequireAuth());
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/parent/change-pass');
    });
  });

  // 3. Student cannot bypass password change by navigation
  it('3. attaches hardware back press listener that blocks back navigation when student password change is forced', async () => {
    const backHandlerSpy = jest.spyOn(BackHandler, 'addEventListener');
    (globalThis as any).signedInAs({
      id: 'test-student',
      role: 'student',
      is_temp_password: true,
    });

    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      expect(backHandlerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    });

    const handler = backHandlerSpy.mock.calls[backHandlerSpy.mock.calls.length - 1][1] as () => boolean;
    expect(handler()).toBe(true);
    backHandlerSpy.mockRestore();
  });

  // 4. Parent cannot bypass password change by navigation
  it('4. attaches hardware back press listener that blocks back navigation when parent password change is forced', async () => {
    const backHandlerSpy = jest.spyOn(BackHandler, 'addEventListener');
    (globalThis as any).signedInAs({
      id: 'test-parent',
      role: 'parent',
      is_temp_password: true,
    });

    renderScreen(<ParentChangePassScreen />);
    await waitFor(() => {
      expect(backHandlerSpy).toHaveBeenCalledWith('hardwareBackPress', expect.any(Function));
    });

    const handler = backHandlerSpy.mock.calls[backHandlerSpy.mock.calls.length - 1][1] as () => boolean;
    expect(handler()).toBe(true);
    backHandlerSpy.mockRestore();
  });

  // 5. Valid initial password submission calls correct backend endpoint
  it('5. calls POST /api/auth/initial-password with correct payload on valid submission', async () => {
    (api as jest.Mock).mockResolvedValueOnce({});
    (globalThis as any).signedInAs({
      id: 'test-student',
      role: 'student',
      is_temp_password: true,
    });

    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
        'ValidNewPass#2026'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Re-enter new password'),
        'ValidNewPass#2026'
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Update Password & Continue'));
    });

    expect(api).toHaveBeenCalledWith('/api/auth/initial-password', {
      method: 'POST',
      body: {
        new_password: 'ValidNewPass#2026',
        confirm_password: 'ValidNewPass#2026',
      },
    });
  });

  // 6. Malformed/missing endpoint does not cause false 404
  it('6. surfaces explicit server error message and status code on failure', async () => {
    (api as jest.Mock).mockRejectedValueOnce(
      new ApiError('Backend service temporarily unavailable', 'unknown', 503)
    );
    (globalThis as any).signedInAs({
      id: 'test-student',
      role: 'student',
      is_temp_password: true,
    });

    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
        'ValidNewPass#2026'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Re-enter new password'),
        'ValidNewPass#2026'
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Update Password & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Backend service temporarily unavailable')).toBeTruthy();
    });
  });

  // 7. Failed password submission displays correct server error message
  it('7. displays server-returned password policy or validation error', async () => {
    (api as jest.Mock).mockRejectedValueOnce(
      new ApiError('New password cannot match your current temporary password', 'forbidden', 400)
    );
    (globalThis as any).signedInAs({
      id: 'test-parent',
      role: 'parent',
      is_temp_password: true,
    });

    renderScreen(<ParentChangePassScreen />);
    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
        'TempParent#2026'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Re-enter new password'),
        'TempParent#2026'
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Update Password & Continue'));
    });

    await waitFor(() => {
      expect(
        screen.getByText('New password cannot match your current temporary password')
      ).toBeTruthy();
    });
  });

  // 8. Successful password change navigates correctly
  it('8. navigates to student dashboard upon successful forced password change', async () => {
    const router = useRouter();
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, msg, buttons: any) => {
      buttons?.[0]?.onPress?.();
    });
    (api as jest.Mock).mockResolvedValueOnce({});
    (globalThis as any).signedInAs({
      id: 'test-student',
      role: 'student',
      is_temp_password: true,
    });

    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
        'NewSuccessPass#2026'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Re-enter new password'),
        'NewSuccessPass#2026'
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Update Password & Continue'));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Password Changed Successfully',
        expect.stringContaining('student dashboard'),
        expect.any(Array),
        { cancelable: false }
      );
      expect(router.replace).toHaveBeenCalledWith('/student/dashboard');
    });
    alertSpy.mockRestore();
  });

  // 9. First-login state is cleared only after successful response
  it('9. does not navigate or refresh state if the backend returns an error', async () => {
    const router = useRouter();
    (api as jest.Mock).mockRejectedValueOnce(
      new ApiError('Request failed (500)', 'unknown', 500)
    );
    (globalThis as any).signedInAs({
      id: 'test-student',
      role: 'student',
      is_temp_password: true,
    });

    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
        'ValidNewPass#2026'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Re-enter new password'),
        'ValidNewPass#2026'
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Update Password & Continue'));
    });

    await waitFor(() => {
      expect(screen.getByText('Request failed (500)')).toBeTruthy();
    });
    expect(router.replace).not.toHaveBeenCalledWith('/student/dashboard');
  });

  // 10. Refresh token/claims are updated after password change
  it('10. calls getIdToken(true) to force token refresh after backend success', async () => {
    (api as jest.Mock).mockResolvedValueOnce({});
    const getIdTokenSpy = auth.currentUser!.getIdToken as jest.Mock;
    getIdTokenSpy.mockClear();

    (globalThis as any).signedInAs({
      id: 'test-student',
      role: 'student',
      is_temp_password: true,
    });

    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      expect(screen.getByText('Set New Password')).toBeTruthy();
    });

    await act(async () => {
      fireEvent.changeText(
        screen.getByPlaceholderText('8+ chars with uppercase, lowercase, number & symbol'),
        'RefreshedPass#2026'
      );
      fireEvent.changeText(
        screen.getByPlaceholderText('Re-enter new password'),
        'RefreshedPass#2026'
      );
    });

    await act(async () => {
      fireEvent.press(screen.getByText('Update Password & Continue'));
    });

    await waitFor(() => {
      expect(getIdTokenSpy).toHaveBeenCalledWith(true);
    });
  });
});
