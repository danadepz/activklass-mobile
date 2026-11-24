import React from 'react'
import { screen, waitFor } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'
import StudentClassDetail from '../../../../app/student/class/[classId]'

/**
 * The student class screen's Announcements tab against the rules contract.
 *
 * firestore.rules refuses a class_id-only announcements query for every
 * student; the screen must pin teacher_id to the class's own teacher. These
 * drive the real screen with a fake Firestore: the class document comes in,
 * the announcements listener is answered (posts, nothing, or a refusal), and
 * the tab must show the posts, the empty state, or the could-not-load state --
 * the same synthetic scenario the web rules suite runs (class-1, teacher-1).
 */

const fs = jest.requireMock('firebase/firestore')

type Answer =
  | { docs: { id: string; data: Record<string, unknown> }[] }
  | { error: { code: string } }

let classDoc: Record<string, unknown> | null
let announcementsAnswer: Answer
let announcementQueries: { field: string; op: string; value: unknown }[][]

const emptySnap = { exists: () => false, data: () => undefined, docs: [], forEach: () => {}, empty: true }

beforeEach(() => {
  ;(globalThis as any).__searchParams = { classId: 'class-1', tab: 'announcements' }
  classDoc = { teacher_id: 'teacher-1', student_ids: ['test-student'], subject: 'Science 9', section: 'Newton' }
  announcementsAnswer = { docs: [] }
  announcementQueries = []

  fs.doc.mockImplementation((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }))
  fs.collection.mockImplementation((_db: unknown, ...segments: string[]) => ({ coll: segments.join('/') }))
  fs.where.mockImplementation((field: string, op: string, value: unknown) => ({ field, op, value }))
  fs.query.mockImplementation((base: { coll?: string }, ...filters: unknown[]) => ({ coll: base.coll, filters }))
  fs.onSnapshot.mockImplementation((target: any, next: (s: unknown) => void, onError?: (e: unknown) => void) => {
    if (target?.path === 'classes/class-1') {
      next(classDoc
        ? { exists: () => true, data: () => classDoc, id: 'class-1' }
        : { exists: () => false, data: () => undefined })
    } else if (target?.coll === 'announcements') {
      announcementQueries.push(target.filters)
      if ('error' in announcementsAnswer) onError?.(announcementsAnswer.error)
      else next({ docs: announcementsAnswer.docs.map((d) => ({ id: d.id, data: () => d.data })) })
    } else {
      next(emptySnap)
    }
    return () => {}
  })
})

afterEach(() => {
  ;(globalThis as any).__searchParams = {}
})

const ann = (id: string, title: string, seconds: number) =>
  ({ id, data: { class_id: 'class-1', teacher_id: 'teacher-1', title, body: `${title} body`, created_at: { seconds } } })

describe('student class screen — announcements', () => {
  it('queries by class_id and the class teacher, never class_id alone', async () => {
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(announcementQueries.length).toBeGreaterThan(0), { timeout: 5000 })
    for (const filters of announcementQueries) {
      expect(filters).toEqual([
        { field: 'class_id', op: '==', value: 'class-1' },
        { field: 'teacher_id', op: '==', value: 'teacher-1' },
      ])
    }
  })

  it('shows the posts, newest first', async () => {
    announcementsAnswer = { docs: [ann('a-old', 'Older post', 100), ann('a-new', 'Newer post', 200)] }
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.getByText('Newer post')).toBeTruthy())
    const titles = screen.getAllByText(/^(Older|Newer) post$/).map((n) => n.props.children)
    expect(titles).toEqual(['Newer post', 'Older post'])
  })

  it('shows the empty state when the class genuinely has none', async () => {
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.getByText('No announcements published in this class yet.')).toBeTruthy())
    expect(screen.queryByText(/Couldn't load announcements/)).toBeNull()
  })

  it('shows the could-not-load state on a permission error, not the empty state', async () => {
    announcementsAnswer = { error: { code: 'permission-denied' } }
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.getByText(/Couldn't load announcements/)).toBeTruthy())
    expect(screen.queryByText('No announcements published in this class yet.')).toBeNull()
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['malformed', 'users/teacher-1'],
  ])('fails safely with a %s teacher id: no query, could-not-load state', async (_label, teacherId) => {
    classDoc = { ...classDoc, teacher_id: teacherId }
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.getByText(/Couldn't load announcements/)).toBeTruthy())
    expect(announcementQueries).toEqual([])
  })

  it('does not spin forever when the class document is missing', async () => {
    classDoc = null
    renderScreen(<StudentClassDetail />)
    await waitFor(() => expect(screen.getByText(/Couldn't load announcements/)).toBeTruthy())
    expect(announcementQueries).toEqual([])
  })
})
