/**
 * Only the newest class snapshot may write the dashboard (2026-11-23).
 *
 * The snapshot callback reads each class's teacher name before it writes the
 * class list. If an older snapshot's reads resolve after a newer snapshot's,
 * the older one used to overwrite the class list and then start the newest
 * evidence load -- so the dashboard settled on stale classes. Every async
 * boundary is driven by a deferred promise here and resolved in reverse.
 */
import React from 'react'
import { act, screen } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void }
const deferred = <T,>(): Deferred<T> => {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

const mockForecastProps: any[] = []
jest.mock('../../../../src/components/ClassStandingForecast', () => {
  const { Text } = require('react-native')
  return (props: any) => {
    mockForecastProps.push(props)
    return <Text>{`forecast:${props.label}`}</Text>
  }
})
const mockTeacherName = jest.fn()
jest.mock('../../../../src/lib/teachers', () => ({ teacherNameFor: (id: string) => mockTeacherName(id) }))
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

import StudentDashboard from '../../../../app/student/dashboard'

const fs = jest.requireMock('firebase/firestore')
const listener: { next?: (s: any) => void; error?: (e: any) => void } = {}
const snap = (...classes: [string, string, string][]) => ({
  docs: classes.map(([id, subject, teacher_id]) => ({ id, data: () => ({ subject, teacher_id }) })),
})
const standing = { average: 80, attendanceRate: 90, entries: [], attendance: [] }
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)) })

beforeEach(() => {
  mockForecastProps.length = 0
  mockTeacherName.mockReset()
  mockLoadStanding.mockReset()
  mockLoadEvidence.mockReset()
  fs.collection.mockImplementation((_db: any, ...path: string[]) => ({ path: path.join('/') }))
  fs.query.mockImplementation((col: any) => col)
  fs.onSnapshot.mockImplementation((q: any, next: any, error: any) => {
    if (q?.path === 'classes') Object.assign(listener, { next, error })
    return () => {}
  })
})

afterAll(() => {
  fs.collection.mockImplementation(() => ({}))
  fs.query.mockImplementation(() => ({}))
  fs.onSnapshot.mockImplementation(() => () => {})
})

const labels = () => screen.queryAllByText(/^forecast:/).map((n) => n.props.children)

describe('dashboard snapshot generations', () => {
  it('two snapshots whose teacher-name reads resolve in reverse: only the newest writes', async () => {
    const oldName = deferred<string>()
    const newName = deferred<string>()
    mockTeacherName.mockImplementation((id: string) => (id === 't-old' ? oldName.promise : newName.promise))
    mockLoadStanding.mockResolvedValue(standing)
    mockLoadEvidence.mockResolvedValue({})

    await renderScreen(<StudentDashboard />)
    await act(async () => { listener.next!(snap(['c-old', 'Old', 't-old'])) }) // older snapshot
    await act(async () => { listener.next!(snap(['c-new', 'New', 't-new'])) }) // newer snapshot

    await act(async () => { newName.resolve('Ms New') })
    await flush()
    await act(async () => { oldName.resolve('Mr Old') }) // the older one finishes LAST
    await flush()

    expect(labels()).toEqual(['forecast:New'])
    expect(mockLoadEvidence.mock.calls.map(([ids]) => ids)).toEqual([['c-new']]) // the old list never loaded
    expect(mockForecastProps.some((p) => p.label === 'Old')).toBe(false)
  })

  it('two evidence loads resolving in reverse: the older load cannot replace the newer forecast', async () => {
    mockTeacherName.mockResolvedValue('T')
    const first = deferred<any>()
    const second = deferred<any>()
    mockLoadStanding.mockResolvedValue(standing)
    mockLoadEvidence.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)

    await renderScreen(<StudentDashboard />)
    await act(async () => { listener.next!(snap(['c1', 'Math', 't'])) })
    await flush()
    await act(async () => { listener.next!(snap(['c1', 'Math', 't'], ['c2', 'Science', 't'])) })
    await flush()

    await act(async () => { second.resolve({}) })
    await flush()
    await act(async () => { first.resolve({}) }) // the older load finishes last
    await flush()

    expect(labels()).toEqual(['forecast:Math', 'forecast:Science'])
  })

  it('a listener error after a successful load does not clear what loaded', async () => {
    mockTeacherName.mockResolvedValue('T')
    mockLoadStanding.mockResolvedValue(standing)
    mockLoadEvidence.mockResolvedValue({})

    await renderScreen(<StudentDashboard />)
    await act(async () => { listener.next!(snap(['c1', 'Math', 't'])) })
    await flush()
    expect(labels()).toEqual(['forecast:Math'])

    await act(async () => { listener.error!(new Error('listener ended')) })
    await flush()
    expect(labels()).toEqual(['forecast:Math'])
  })

  it('a listener error before anything loaded stops the loading line', async () => {
    await renderScreen(<StudentDashboard />)
    expect(screen.getByText('Loading your class evidence…')).toBeTruthy()
    await act(async () => { listener.error!(new Error('denied')) })
    expect(screen.queryByText('Loading your class evidence…')).toBeNull()
  })
})
