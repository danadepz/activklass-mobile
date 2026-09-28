/**
 * Does the student class detail screen mount?
 */
import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import StudentClassDetail from '../../../../app/student/class/[classId]'

describe('student class detail screen', () => {
  it('mounts without throwing', async () => {
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders a tree, not nothing', async () => {
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.toJSON()).not.toBeNull())
  })
})
