import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentProfileScreen from '../../../../app/parent/profile'

beforeEach(() => {
  globalThis.signedInAs({
    id: 'test-parent',
    role: 'parent',
    first_name: 'Maria',
    last_name: 'Santos',
    email: 'maria.santos@test.dev',
    contact_number: '09171234567',
  })
})

describe('guardian profile screen', () => {
  it('mounts without throwing', async () => {
    expect(() => renderScreen(<ParentProfileScreen />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders profile details and security options', async () => {
    renderScreen(<ParentProfileScreen />)
    await waitFor(() => {
      expect(screen.getByText('Profile & Settings')).toBeTruthy()
      expect(screen.getByText('Guardian Account')).toBeTruthy()
      expect(screen.getByText('Change Password')).toBeTruthy()
      expect(screen.getByText('Log Out of Account')).toBeTruthy()
    })
  })
})
