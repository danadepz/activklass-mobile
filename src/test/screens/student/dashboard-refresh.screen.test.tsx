/**
 * The dashboard re-reads forecast evidence when the student returns to it --
 * after sitting a quiz, or once a teacher has graded -- throttled to one
 * refresh per 30 s, with no new listener (2026-11-23).
 */
import React from 'react'
import { act, screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'

// Every focus callback a render registers, by hook position, so a refocus fires them all.
const mockFocus: { cbs: (() => void)[]; i: number } = { cbs: [], i: 0 }
const refocus = () => mockFocus.cbs.forEach((cb) => cb())
jest.mock('expo-router', () => {
  const React = require('react')
  const stub = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() }
  return {
    useRouter: () => stub,
    useLocalSearchParams: () => ({}),
    useFocusEffect: (cb: () => void) => {
      const slot = React.useRef(-1)
      if (slot.current < 0) slot.current = mockFocus.i++
      mockFocus.cbs[slot.current] = cb
      React.useEffect(() => cb(), [])
    },
  }
})
const mockForecastProps: any[] = []
jest.mock('../../../../src/components/ClassStandingForecast', () => {
  const { Text } = require('react-native')
  return (props: any) => {
    mockForecastProps.push(props)
    return <Text>{`avg:${props.quizAverage}`}</Text>
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
const att = (quiz_id: string, total_score: number) =>
  ({ class_id: 'c1', quiz_id, total_score, total_possible: 100, student_id: 'test-student', status: 'graded' })
const evidence = (attempts: any[]) => ({ c1: { quizzes: [], attempts, excused: new Set() } })

let now = 1_000_000
beforeEach(() => {
  mockForecastProps.length = 0
  mockFocus.cbs = []
  mockFocus.i = 0
  mockLoadEvidence.mockReset()
  mockLoadStanding.mockReset()
  mockLoadStanding.mockResolvedValue({ average: 80, attendanceRate: 90, entries: [], attendance: [] })
  jest.spyOn(Date, 'now').mockImplementation(() => now)
  fs.collection.mockImplementation((_db: any, ...path: string[]) => ({ path: path.join('/') }))
  fs.query.mockImplementation((col: any) => col)
  fs.onSnapshot.mockImplementation((q: any, cb: any) => {
    if (q?.path === 'classes') cb({ docs: [{ id: 'c1', data: () => ({ subject: 'Math', teacher_id: 't' }) }] })
    return () => {}
  })
})

afterAll(() => {
  jest.restoreAllMocks()
  fs.collection.mockImplementation(() => ({}))
  fs.query.mockImplementation(() => ({}))
  fs.onSnapshot.mockImplementation(() => () => {})
})

describe('dashboard evidence freshness', () => {
  it('re-reads on return after a quiz, but not on every focus', async () => {
    mockLoadEvidence.mockResolvedValue(evidence([att('q1', 80)]))
    await renderScreen(<StudentDashboard />)
    expect(await screen.findByText('avg:80')).toBeTruthy()
    expect(mockLoadEvidence).toHaveBeenCalledTimes(1) // the first focus is not a second load

    // Back on the tab 10 s later: within the throttle, no extra reads.
    now += 10_000
    await act(async () => { refocus() })
    expect(mockLoadEvidence).toHaveBeenCalledTimes(1)

    // A quiz was sat in the meantime; back on the tab after 30 s: fresh figures.
    mockLoadEvidence.mockResolvedValue(evidence([att('q1', 80), att('q2', 90)]))
    now += 25_000
    await act(async () => { refocus() })
    expect(mockLoadEvidence).toHaveBeenCalledTimes(2)
    expect(mockLoadStanding).toHaveBeenCalledTimes(2) // a teacher's grading reaches the entry the same way
    await waitFor(() => expect(screen.getByText('avg:85')).toBeTruthy())
  })
})
