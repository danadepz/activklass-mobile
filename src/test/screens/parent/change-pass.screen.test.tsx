/**
 * Does the guardian change password screen mount?
 */
import React from 'react';
import { screen, waitFor } from '@testing-library/react-native';
import { renderScreen } from '../../renderScreen';
import ParentChangePassScreen from '../../../../app/parent/change-pass';

describe('guardian change password screen', () => {
  it('mounts without crashing', async () => {
    renderScreen(<ParentChangePassScreen />);
    await waitFor(() => expect(screen.toJSON()).toBeTruthy());
  });

  it('renders a tree, not nothing', async () => {
    renderScreen(<ParentChangePassScreen />);
    await waitFor(() => expect(screen.toJSON()).not.toBeNull());
  });

  it('provides Show/Hide toggle buttons for new password fields', async () => {
    renderScreen(<ParentChangePassScreen />);
    await waitFor(() => {
      const showButtons = screen.getAllByText('Show');
      expect(showButtons.length).toBe(2);
    });
  });
});
