/**
 * Does the student change password screen mount?
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../../renderScreen';
import StudentChangePassScreen from '../../../../app/student/change-pass';

describe('student change password screen', () => {
  it('mounts without crashing', async () => {
    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => expect(screen.toJSON()).toBeTruthy());
  });

  it('renders a tree, not nothing', async () => {
    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => expect(screen.toJSON()).not.toBeNull());
  });

  it('provides Show/Hide toggle buttons for new password fields', async () => {
    renderScreen(<StudentChangePassScreen />);
    await waitFor(() => {
      const showButtons = screen.getAllByText('Show');
      expect(showButtons.length).toBe(2);
    });
  });
});
