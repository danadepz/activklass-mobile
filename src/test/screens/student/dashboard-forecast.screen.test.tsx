/**
 * The dashboard gives each enrolled class its own forecast, fed that class's
 * grade, attendance and quiz evidence (2026-11-23). Before this, one forecast
 * got a cross-class grade and no quiz evidence, so it could never be scored.
 */
import React from 'react'
import { act, screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'

const mockForecastProps: any[] = []
jest.mock('../../../../src/components/ClassStandingForecast', () => {
  const { Text } = require('react-native')
  return (props: any) => {
    mockForecastProps.push(props)
    return <Text>{`forecast:${props.label}`}</Text>
  }
})
const mockLoadStanding = jest.fn()
jest.mock('../../../../src/lib/studentData', () => ({
  ...jest.requireActual('../../../../src/lib/studentData'),
  loadOverallStanding: (...a: any[]) => mockLoadStanding(...a),
}))
const mockLoadEvidence = jest.fn()
jest.mock('../../../../src/lib/studentForecast', () => ({
  ...jest.requireActual('../../../../src/lib/studentForecast'),
  loadQuizEvidence: (...a: any[]) => mockLoadEvidence(...a),
}))
jest.mock('../../../../src/lib/teachers', () => ({ teacherNameFor: async () => 'Teacher' }))

import StudentDashboard from '../../../../app/student/dashboard'

const fs = jest.requireMock('firebase/firestore')
const ME = 'test-student'
const classDoc = (id: string, subject: string) => ({ id, data: () => ({ subject, teacher_id: 't' }) })
const att = (class_id: string, quiz_id: string, total_score: number, student_id = ME) =>
  ({ class_id, quiz_id, total_score, total_possible: 10, student_id, status: 'graded' })

beforeEach(() => {
  mockForecastProps.length = 0
  mockLoadStanding.mockReset()
  mockLoadEvidence.mockReset()
  fs.collection.mockImplementation((_db: any, ...path: string[]) => ({ path: path.join('/') }))
  fs.query.mockImplementation((col: any) => col)
  fs.onSnapshot.mockImplementation((q: any, cb: any) => {
    if (q?.path === 'classes') cb({ docs: [classDoc('c1', 'Math'), classDoc('c2', 'Science')] })
    return () => {}
  })
})

afterAll(() => {
  fs.collection.mockImplementation(() => ({}))
  fs.query.mockImplementation(() => ({}))
  fs.onSnapshot.mockImplementation(() => () => {})
})

describe('student dashboard forecast', () => {
  it('11. one forecast per class, each with only that class\'s evidence', async () => {
    mockLoadStanding.mockResolvedValue({
      average: 85, attendanceRate: 90,
      entries: [
        { class_id: 'c2', final_grade: 70, mode: 'deped_k12', assessments: [{ id: 'quiz-s1', date_given: '2026-03-04', status: 'graded' }] },
        { class_id: 'c1', final_grade: 90, mode: 'deped_k12', assessments: [] },
      ],
      attendance: [
        { log: [{ date: '2026-03-01', status: 'present' }], tally: {}, rate: 100 },
        { log: [{ date: '2026-03-01', status: 'absent' }], tally: {}, rate: 0 },
      ],
    })
    const attempts = [att('c1', 'm1', 9), att('c2', 's1', 4), att('c2', 'm1', 0), att('c1', 'm2', 1, 'other-student')]
    mockLoadEvidence.mockResolvedValue({
      c1: { quizzes: [{ id: 'm1', status: 'closed' }], attempts, excused: new Set() },
      c2: { quizzes: [{ id: 's1', status: 'closed' }, { id: 'd', status: 'draft' }], attempts, excused: new Set(['s9']) },
    })

    await renderScreen(<StudentDashboard />)
    expect(await screen.findByText('forecast:Math')).toBeTruthy()
    expect(screen.getByText('forecast:Science')).toBeTruthy()
    expect(mockLoadEvidence).toHaveBeenCalledWith(['c1', 'c2'], ME)

    const last = (label: string) => [...mockForecastProps].reverse().find((p) => p.label === label)
    const math = last('Math')
    const sci = last('Science')
    expect(math).toMatchObject({ studentId: ME, grade: 90, attendanceRate: 100, quizAverage: 90 })
    expect(math.attempts.map((a: any) => a.quiz_id)).toEqual(['m1'])
    expect(sci).toMatchObject({ grade: 70, attendanceRate: 0, quizAverage: 20 })
    expect(sci.attempts.map((a: any) => `${a.class_id}/${a.quiz_id}`)).toEqual(['c2/s1', 'c2/m1'])
    expect(sci.quizzes.map((q: any) => q.id)).toEqual(['s1'])
    expect(sci.assessments[0].source_quiz_id).toBe('s1')
    expect([...sci.excusedQuizIds]).toEqual(['s9'])
    // Never another student's attempt, in any class.
    for (const p of mockForecastProps) expect(p.attempts?.every((a: any) => a.student_id === ME)).toBe(true)
  })

  it('10. shows a loading line, and requests no forecast, until the evidence arrives', async () => {
    let release: (v: any) => void = () => {}
    mockLoadStanding.mockResolvedValue({ average: null, attendanceRate: null, entries: [], attendance: [] })
    mockLoadEvidence.mockReturnValue(new Promise((r) => { release = r }))
    await renderScreen(<StudentDashboard />)
    expect(await screen.findByText('Loading your class evidence…')).toBeTruthy()
    expect(mockForecastProps.length).toBe(0)
    await act(async () => { release({ c1: {}, c2: {} }) })
    await waitFor(() => expect(screen.queryByText('Loading your class evidence…')).toBeNull())
    // Denied/unread evidence reaches the forecast as unknown, never as zeros.
    const math = [...mockForecastProps].reverse().find((p) => p.label === 'Math')
    expect(math).toMatchObject({ grade: null, attendanceRate: null, quizAverage: null, attempts: undefined, quizzes: undefined })
  })
})
