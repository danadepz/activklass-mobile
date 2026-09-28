/**
 * Does the student remediation screen mount?
 */
import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import StudentRemediationIndex from '../../../../app/student/remediation'

describe('student remediation screen', () => {
  it('mounts for a student with no remediations', async () => {
    renderScreen(<StudentRemediationIndex />)
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders a tree, not nothing', async () => {
    renderScreen(<StudentRemediationIndex />)
    await waitFor(() => expect(screen.toJSON()).not.toBeNull())
  })
})
