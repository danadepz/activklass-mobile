import React from 'react';
import { act, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { renderScreen } from '../renderScreen';
import LoginScreen from '../../../app/login';

describe('login screen', () => {
  it('clears a repeated validation warning three seconds after the last attempt', async () => {
    jest.useFakeTimers();
    try {
      await renderScreen(<LoginScreen />);
      const submit = screen.getByText('Sign In');
      await fireEvent.press(submit);
      await act(async () => { jest.advanceTimersByTime(2500); });
      await fireEvent.press(submit);
      await act(async () => { jest.advanceTimersByTime(2999); });
      expect(screen.getByText('Please fill in all fields.')).toBeTruthy();
      await act(async () => { jest.advanceTimersByTime(1); });
      expect(screen.queryByText('Please fill in all fields.')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('mounts without crashing', () => {
    expect(() => renderScreen(<LoginScreen />)).not.toThrow();
  });

  it('displays unified Email or Student Login ID input with guidance', async () => {
    renderScreen(<LoginScreen />);
    await waitFor(() => {
      expect(screen.getByText('Email or Student Login ID')).toBeTruthy();
      expect(screen.getByPlaceholderText('snhs-123456 or you@example.com')).toBeTruthy();
      expect(screen.getByText('Students:')).toBeTruthy();
      expect(screen.getByText('Parents:')).toBeTruthy();
    });
  });

  it('toggles password visibility with Show/Hide button', async () => {
    renderScreen(<LoginScreen />);
    await waitFor(() => {
      expect(screen.getByText('Show')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Show'));
    await waitFor(() => {
      expect(screen.getByText('Hide')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Hide'));
    await waitFor(() => {
      expect(screen.getByText('Show')).toBeTruthy();
    });
  });
});
