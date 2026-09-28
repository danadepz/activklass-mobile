import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentConfirmScreen from '../../../../app/parent/confirm'

describe('guardian confirmation screen', () => {
  it('mounts without throwing', async () => {
    expect(() => renderScreen(<ParentConfirmScreen />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders status information and action button', async () => {
    renderScreen(<ParentConfirmScreen />)
    await waitFor(() => {
      expect(screen.getByText('Go to Dashboard')).toBeTruthy()
      expect(screen.getByText('Sign in with')).toBeTruthy()
    })
  })
})
