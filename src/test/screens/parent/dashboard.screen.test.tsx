import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentDashboard from '../../../../app/parent/dashboard'
import * as guardianCodes from '../../../../src/lib/guardianCodes'
import * as parentData from '../../../../src/lib/parentData'

beforeEach(() => {
  globalThis.signedInAs({
    id: 'test-parent', role: 'parent',
    first_name: 'Test', last_name: 'Parent', email: 'parent@test.dev',
  })
  jest.restoreAllMocks()
})

describe('guardian dashboard', () => {
  it('mounts for a guardian with no children linked', async () => {
    renderScreen(<ParentDashboard />)
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('survives the first frame, before any read resolves', async () => {
    renderScreen(<ParentDashboard />)
    await waitFor(() => expect(screen.toJSON()).toBeTruthy())
  })

  it('renders child metrics when child is approved', async () => {
    jest.spyOn(guardianCodes, 'listMyChildren').mockResolvedValueOnce([
      {
        link_id: 'link-1',
        student_uid: 'student-carlo',
        guardian_uid: 'test-parent',
        guardian_name: 'Test Parent',
        guardian_email: 'parent@test.dev',
        relationship_type: 'Father',
        status: 'approved',
        scopes: guardianCodes.ALL_SCOPES_ON,
        is_minor: false,
        student_name: 'Carlo Dela Cruz',
        student_number: '2024-0012',
        grade_level: 'Grade 10',
      },
    ])

    jest.spyOn(guardianCodes, 'fetchStudentProfiles').mockResolvedValueOnce({
      'student-carlo': {
        first_name: 'Carlo',
        last_name: 'Dela Cruz',
        student_number: '2024-0012',
        grade_level: 'Grade 10',
      },
    })

    jest.spyOn(parentData, 'loadChildRecords').mockResolvedValueOnce({
      classes: [
        {
          class_id: 'class-sci-10',
          subject: 'Science 10',
          subject_code: 'SCI10',
          section: 'Section Rizal',
          final_grade: 84,
          periods: [],
        },
      ],
      attempts: [],
      attendance: [],
      attendanceRate: 95,
      overallAverage: 84,
      partial: false,
    })

    renderScreen(<ParentDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Carlo Dela Cruz')).toBeTruthy()
      expect(screen.getByText('Child Grade Standing')).toBeTruthy()
      expect(screen.getByText('Science 10')).toBeTruthy()
      expect(screen.getByText('84 average')).toBeTruthy()
    })
  })

  it('renders access restriction gate when child is pending', async () => {
    jest.spyOn(guardianCodes, 'listMyChildren').mockResolvedValueOnce([
      {
        link_id: 'link-2',
        student_uid: 'student-maria',
        guardian_uid: 'test-parent',
        guardian_name: 'Test Parent',
        guardian_email: 'parent@test.dev',
        relationship_type: 'Mother',
        status: 'pending',
        scopes: guardianCodes.ALL_SCOPES_OFF,
        is_minor: false,
        student_name: 'Maria Santos',
        student_number: '2024-0099',
        grade_level: 'Grade 11',
      },
    ])

    jest.spyOn(guardianCodes, 'fetchStudentProfiles').mockResolvedValueOnce({})

    renderScreen(<ParentDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Access Gate Restricted')).toBeTruthy()
      expect(screen.getByText('RA 10173 — Data Privacy Act of 2012')).toBeTruthy()
      expect(screen.getByText('Refresh Status')).toBeTruthy()
    })
  })

  it('supports child switching when multiple children are linked', async () => {
    jest.spyOn(guardianCodes, 'listMyChildren').mockResolvedValueOnce([
      {
        link_id: 'link-carlo',
        student_uid: 'student-carlo',
        guardian_uid: 'test-parent',
        guardian_name: 'Test Parent',
        guardian_email: 'parent@test.dev',
        relationship_type: 'Father',
        status: 'approved',
        scopes: guardianCodes.ALL_SCOPES_ON,
        is_minor: false,
        student_name: 'Carlo Dela Cruz',
        student_number: '2024-0012',
        grade_level: 'Grade 10',
      },
      {
        link_id: 'link-ana',
        student_uid: 'student-ana',
        guardian_uid: 'test-parent',
        guardian_name: 'Test Parent',
        guardian_email: 'parent@test.dev',
        relationship_type: 'Father',
        status: 'approved',
        scopes: guardianCodes.ALL_SCOPES_ON,
        is_minor: false,
        student_name: 'Ana Dela Cruz',
        student_number: '2024-0013',
        grade_level: 'Grade 8',
      },
    ])

    jest.spyOn(guardianCodes, 'fetchStudentProfiles').mockResolvedValueOnce({
      'student-carlo': { first_name: 'Carlo', last_name: 'Dela Cruz' },
      'student-ana': { first_name: 'Ana', last_name: 'Dela Cruz' },
    })

    jest.spyOn(parentData, 'loadChildRecords').mockImplementation(async (studentUid) => ({
      classes: [],
      attempts: [],
      attendance: [],
      attendanceRate: 98,
      overallAverage: studentUid === 'student-carlo' ? 88 : 92,
      partial: false,
    }))

    renderScreen(<ParentDashboard />)

    await waitFor(() => {
      expect(screen.getByText('Ana Dela Cruz')).toBeTruthy()
    })

    // Open switch sheet
    const switchTrigger = screen.getByText('Ana Dela Cruz')
    fireEvent.press(switchTrigger)

    await waitFor(() => {
      expect(screen.getByText('Switch Linked Student')).toBeTruthy()
    })
  })
})
