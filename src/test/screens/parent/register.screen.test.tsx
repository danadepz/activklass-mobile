import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentRegisterCodeScreen from '../../../../app/parent/register'

describe('guardian registration code screen', () => {
  it('mounts without throwing', async () => {
    expect(() => renderScreen(<ParentRegisterCodeScreen />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders invitation code prompt', async () => {
    renderScreen(<ParentRegisterCodeScreen />)
    await waitFor(() => {
      expect(screen.getByText('Parent Connection')).toBeTruthy()
      expect(screen.getByText('Invitation Code')).toBeTruthy()
    })
  })
})
