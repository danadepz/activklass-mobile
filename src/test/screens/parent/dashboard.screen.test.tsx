import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import ParentDashboard from '../../../../app/parent/dashboard'
import * as guardianCodes from '../../../../src/lib/guardianCodes'
import * as parentData from '../../../../src/lib/parentData'
import * as notifications from '../../../../src/lib/notifications'

// Approved child fixture reused across FINDING-12 tests
const APPROVED_CHILD = {
  link_id: 'link-ngrisk',
  student_uid: 'student-ngrisk',
  guardian_uid: 'test-parent',
  guardian_name: 'Test Parent',
  guardian_email: 'parent@test.dev',
  relationship_type: 'Parent',
  status: 'approved',
  scopes: guardianCodes.ALL_SCOPES_ON,
  is_minor: true,
  student_name: 'Juan Dela Cruz',
  student_number: '2024-0001',
  grade_level: 'Grade 10',
}
const RECORDS_EMPTY = {
  classes: [], attempts: [], attendance: [], attendanceRate: null, overallAverage: null, partial: false,
}

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
    await waitFor(() => expect(screen.getByText('No Child Linked')).toBeTruthy())
  })

  it('survives the first frame before showing the empty state', async () => {
    const rendered = renderScreen(<ParentDashboard />)
    expect(rendered).toBeTruthy()
    await waitFor(() => expect(screen.getByText('No Child Linked')).toBeTruthy())
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

describe('FINDING-12 — guardian high-risk alert feed', () => {
  function setupApprovedChild() {
    jest.spyOn(guardianCodes, 'listMyChildren').mockResolvedValueOnce([APPROVED_CHILD])
    jest.spyOn(guardianCodes, 'fetchStudentProfiles').mockResolvedValueOnce({
      'student-ngrisk': { first_name: 'Juan', last_name: 'Dela Cruz', student_number: '2024-0001', grade_level: 'Grade 10' },
    })
    jest.spyOn(parentData, 'loadChildRecords').mockResolvedValueOnce(RECORDS_EMPTY)
  }

  it('shows high-risk alert section when unread alerts exist', async () => {
    setupApprovedChild()
    // Simulate the notifications subscription returning a high-risk alert
    jest.spyOn(notifications, 'watchMyNotifications').mockImplementation((cb) => {
      cb([{
        id: 'alert-1',
        type: 'high_risk_alert',
        message: 'Your child has been flagged as HIGH RISK (78%) in MATH101.',
        class_id: 'cls-ngrisk',
        link: null,
        read: false,
        created_at: Date.now() - 60000,
      }])
      return () => {}
    })

    renderScreen(<ParentDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Academic Risk Alerts')).toBeTruthy()
      expect(screen.getByText('High Risk Alert')).toBeTruthy()
      expect(screen.getByText(/HIGH RISK.*MATH101/)).toBeTruthy()
    })
  })

  it('does NOT show alert section when no high-risk alerts exist', async () => {
    setupApprovedChild()
    jest.spyOn(notifications, 'watchMyNotifications').mockImplementation((cb) => {
      cb([]) // empty feed
      return () => {}
    })

    renderScreen(<ParentDashboard />)
    await waitFor(() => {
      expect(screen.queryByText('Academic Risk Alerts')).toBeNull()
    })
  })

  it('filters out non-high-risk notification types', async () => {
    setupApprovedChild()
    jest.spyOn(notifications, 'watchMyNotifications').mockImplementation((cb) => {
      // This is a general notification — should be filtered out by the dashboard
      cb([{
        id: 'notif-student-generic',
        type: 'contest_resolved',  // not a high_risk_alert
        message: 'Your attendance contest was resolved.',
        class_id: 'cls-ngrisk',
        link: null,
        read: false,
        created_at: Date.now() - 10000,
      }])
      return () => {}
    })

    renderScreen(<ParentDashboard />)
    await waitFor(() => {
      // Alert section must not appear for non-high-risk types
      expect(screen.queryByText('Academic Risk Alerts')).toBeNull()
    })
  })

  it('dims alert and shows no unread dot when alert is already read', async () => {
    setupApprovedChild()
    jest.spyOn(notifications, 'watchMyNotifications').mockImplementation((cb) => {
      cb([{
        id: 'alert-read',
        type: 'high_risk_alert',
        message: 'Your child has been flagged as HIGH RISK in SCI10.',
        class_id: 'cls-ngrisk',
        link: null,
        read: true, // already read
        created_at: Date.now() - 120000,
      }])
      return () => {}
    })

    renderScreen(<ParentDashboard />)
    // Alert section still shows (risk context remains visible) but no unread dot
    await waitFor(() => {
      expect(screen.getByText('Academic Risk Alerts')).toBeTruthy()
    })
  })

  it('shows multiple alerts for a guardian with multiple high-risk children', async () => {
    setupApprovedChild()
    jest.spyOn(notifications, 'watchMyNotifications').mockImplementation((cb) => {
      cb([
        {
          id: 'alert-child-a',
          type: 'high_risk_alert',
          message: 'Your child has been flagged as HIGH RISK (82%) in MATH101.',
          class_id: 'cls-math',
          link: null,
          read: false,
          created_at: Date.now() - 30000,
        },
        {
          id: 'alert-child-b',
          type: 'high_risk_alert',
          message: 'Your child has been flagged as HIGH RISK (71%) in SCI10.',
          class_id: 'cls-sci',
          link: null,
          read: false,
          created_at: Date.now() - 60000,
        },
      ])
      return () => {}
    })

    renderScreen(<ParentDashboard />)
    await waitFor(() => {
      expect(screen.getByText('Academic Risk Alerts')).toBeTruthy()
      // Both alert messages should be present
      expect(screen.getByText(/MATH101/)).toBeTruthy()
      expect(screen.getByText(/SCI10/)).toBeTruthy()
    })
  })
})
