import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentClassDetail from '../../../../app/parent/class/[classId]'

beforeEach(() => {
  globalThis.signedInAs({
    id: 'test-parent',
    role: 'parent',
    first_name: 'Maria',
    last_name: 'Santos',
    email: 'maria.santos@test.dev',
  })
})

describe('guardian class detail screen', () => {
  it('mounts without throwing', async () => {
    expect(() => renderScreen(<ParentClassDetail />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders class monitoring header and tabs', async () => {
    renderScreen(<ParentClassDetail />)
    await waitFor(() => {
      expect(screen.getByText('grades')).toBeTruthy()
      expect(screen.getByText('attendance')).toBeTruthy()
      expect(screen.getByText('insights')).toBeTruthy()
      expect(screen.getByText('announcements')).toBeTruthy()
      expect(screen.getByText('Read-Only Access')).toBeTruthy()
    })
  })
})
