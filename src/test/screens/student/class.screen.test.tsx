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

/**
 * T-253: a teacher's announcement "never reached" a student. The tab was
 * called "Bulletins" while the Teacher Portal calls them Announcements, and a
 * refused read rendered the same empty list as a class with none -- so the
 * student could not tell "nothing posted" from "could not load".
 */
describe('student class announcements tab (T-253)', () => {
  const firestore = require('firebase/firestore')
  // Tag each query with its collection so the listener can answer per query.
  const listen = (onAnnouncements: (next: any, fail: any) => void) => {
    firestore.collection.mockImplementation((_db: any, name: string) => ({ name }))
    firestore.query.mockImplementation((ref: any) => ref)
    firestore.onSnapshot.mockImplementation((ref: any, next: any, fail: any) => {
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
