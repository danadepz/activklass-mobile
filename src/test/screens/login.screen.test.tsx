import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react-native';
import { renderScreen } from '../renderScreen';
import LoginScreen from '../../../app/login';

describe('login screen', () => {
  it('mounts without crashing', async () => {
    renderScreen(<LoginScreen />);
    await waitFor(() => expect(screen.toJSON()).toBeTruthy());
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
