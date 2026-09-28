import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentDetailsScreen from '../../../../app/parent/details'

describe('guardian registration details screen', () => {
  it('mounts without throwing', async () => {
    expect(() => renderScreen(<ParentDetailsScreen />)).not.toThrow()
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders required form inputs', async () => {
    renderScreen(<ParentDetailsScreen />)
    await waitFor(() => {
      expect(screen.getByText('Guardian Details')).toBeTruthy()
      expect(screen.getByText('First name *')).toBeTruthy()
      expect(screen.getByText('Last name *')).toBeTruthy()
      expect(screen.getByText('Email *')).toBeTruthy()
      expect(screen.getByText('Password *')).toBeTruthy()
    })
  })
})
