/**
 * Does the student class detail screen mount?
 */
import React from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react-native'
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

/**
 * T-253: a teacher's announcement "never reached" a student. The tab was
 * called "Bulletins" while the Teacher Portal calls them Announcements, and a
 * refused read rendered the same empty list as a class with none -- so the
 * student could not tell "nothing posted" from "could not load".
 */
// Every listener-driven test serves the class document: the announcements
// query is built from its teacher_id (class_id alone is refused by the rules),
// so a fake that never answers the class listener leaves the screen loading.
const CLASS_PATH = 'classes/class-1'
const classSnap = { exists: () => true, id: 'class-1', data: () => ({ teacher_id: 'teacher-1', student_ids: ['test-student'] }) }

describe('student class announcements tab (T-253)', () => {
  const firestore = require('firebase/firestore')
  // Tag each query with its collection so the listener can answer per query.
  const listen = (onAnnouncements: (next: any, fail: any) => void) => {
    firestore.collection.mockImplementation((_db: any, name: string) => ({ name }))
    firestore.query.mockImplementation((ref: any) => ref)
    firestore.doc.mockImplementation((_db: any, ...segments: string[]) => ({ path: segments.join('/') }))
    firestore.onSnapshot.mockImplementation((ref: any, next: any, fail: any) => {
      if (ref?.path === CLASS_PATH) next(classSnap)
      if (ref?.name === 'announcements') onAnnouncements(next, fail)
      return () => {}
    })
  }

  beforeEach(() => {
    (globalThis as any).__searchParams = { classId: 'class-1', tab: 'announcements' }
  })
  afterEach(() => {
    (globalThis as any).__searchParams = {}
    firestore.collection.mockImplementation(() => ({}))
    firestore.doc.mockImplementation(() => ({}))
    firestore.query.mockImplementation(() => ({}))
    firestore.onSnapshot.mockImplementation(() => () => {})
  })

  it('names the tab Announcements, as the Teacher Portal does', async () => {
    listen((next) => next({ docs: [] }))
    await renderScreen(<StudentClassDetail />)
    expect(await screen.findByText('Announcements')).toBeTruthy()
    expect(screen.queryByText('Bulletins')).toBeNull()
  })

  it('shows a published announcement', async () => {
    listen((next) =>
      next({ docs: [{ id: 'a1', data: () => ({ title: 'Quiz moved to Friday', body: 'Bring a pen.' }) }] }),
    )
    await renderScreen(<StudentClassDetail />)
    expect(await screen.findByText('Quiz moved to Friday')).toBeTruthy()
  })

  it('says loading failed instead of showing an empty list when the read is refused', async () => {
    listen((_next, fail) => fail(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })))
    await renderScreen(<StudentClassDetail />)
    expect(await screen.findByText(/couldn't load announcements/i)).toBeTruthy()
    expect(screen.queryByText(/no announcements published/i)).toBeNull()
  })
})

/**
 * T-252: the class screen had no Quizzes tab, though it already listened to
 * the class's quizzes. The tab must say what the web class page says for the
 * same quiz (state from the deliverables port) and only start a quiz the
 * player would accept.
 */
describe('student class quizzes tab (T-252)', () => {
  const firestore = require('firebase/firestore')
  const router = require('expo-router').useRouter()
  // 'YYYY-MM-DDTHH:mm' local, the shape a quiz stores, `days` from now.
  const at = (days: number) => {
    const d = new Date(Date.now() + days * 86_400_000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }
  const serve = (byCollection: Record<string, any[]>) => {
    firestore.collection.mockImplementation((_db: any, name: string) => ({ name }))
    firestore.query.mockImplementation((ref: any) => ref)
    firestore.doc.mockImplementation((_db: any, ...segments: string[]) => ({ path: segments.join('/') }))
    firestore.onSnapshot.mockImplementation((ref: any, next: any) => {
      if (ref?.path === CLASS_PATH) next(classSnap)
      const rows = byCollection[ref?.name]
      if (rows) next({ docs: rows.map(({ id, ...data }) => ({ id, data: () => data })) })
      return () => {}
    })
  }

  beforeEach(() => {
    ;(globalThis as any).__searchParams = { classId: 'class-1', tab: 'quizzes' }
    router.push.mockClear()
  })
  afterEach(() => {
    ;(globalThis as any).__searchParams = {}
    firestore.collection.mockImplementation(() => ({}))
    firestore.doc.mockImplementation(() => ({}))
    firestore.query.mockImplementation(() => ({}))
    firestore.onSnapshot.mockImplementation(() => () => {})
  })

  it('has a Quizzes tab that says when a class has none', async () => {
    serve({ quizzes: [], quiz_attempts: [], announcements: [] })
    await renderScreen(<StudentClassDetail />)
    expect(await screen.findByText('Quizzes')).toBeTruthy()
    expect(screen.getByText('No Quizzes Yet')).toBeTruthy()
  })

  it('lists each quiz with the state the web list gives it, and starts only an open one', async () => {
    serve({
      quizzes: [
        { id: 'open', title: 'Open quiz', status: 'published', closes_at: at(3), time_limit_minutes: 20 },
        { id: 'past', title: 'Past quiz', status: 'published', closes_at: at(-3) },
        { id: 'soon', title: 'Soon quiz', status: 'published', opens_at: at(5) },
        { id: 'done', title: 'Done quiz', status: 'published', closes_at: at(3) },
      ],
      quiz_attempts: [{ id: 'att-1', quiz_id: 'done', status: 'graded', attempt_number: 1 }],
      announcements: [],
    })
    await renderScreen(<StudentClassDetail />)
    expect(await screen.findByText('Open quiz')).toBeTruthy()

    expect(screen.getByText(/^Due \d\d-\d\d-\d\d, /)).toBeTruthy() // open
    expect(screen.getByText(/^Closed \d\d-\d\d-\d\d$/)).toBeTruthy() // past closes_at
    expect(screen.getByText('Not taken')).toBeTruthy()
    expect(screen.getByText(/^Opens \d\d-\d\d-\d\d, /)).toBeTruthy() // not open yet
    expect(screen.getByText('Opens later')).toBeTruthy()
    expect(screen.getByText('Done')).toBeTruthy()

    // Exactly one quiz is startable, and starting it goes to the player.
    const take = screen.getAllByText('Take quiz')
    expect(take).toHaveLength(1)
    fireEvent.press(take[0])
    expect(router.push).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/student/quiz-player', params: expect.objectContaining({ quizId: 'open' }) }),
    )

    // A finished quiz opens its result through the feedback screen.
    fireEvent.press(screen.getByText('View result'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/student/quiz-feedback', params: { attemptId: 'att-1' } })
  })
})
