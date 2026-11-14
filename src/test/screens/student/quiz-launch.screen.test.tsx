/**
 * T-254: a quiz taken on mobile never reached the teacher.
 *
 * Quizzes carry their classes only as `class_ids`. Opening one from the class
 * page without saying which class left the attempt with `class_id: null`, and
 * every teacher read (Results tab, Class Record sync) filters on class_id -- so
 * the submission looked as if it had never happened, before and after a retake.
 */
import React from 'react'
import { act, fireEvent, screen } from '@testing-library/react-native'
import { useRouter } from 'expo-router'
import { renderScreen } from '../../renderScreen'
import StudentClassDetail from '../../../../app/student/class/[classId]'

describe('opening a quiz from the class page (T-254)', () => {
  const firestore = require('firebase/firestore')

  beforeEach(() => {
    (globalThis as any).__searchParams = { classId: 'class-1' }
    firestore.collection.mockImplementation((_db: any, name: string) => ({ name }))
    firestore.query.mockImplementation((ref: any) => ref)
    firestore.onSnapshot.mockImplementation((ref: any, next: any) => {
      if (ref?.name === 'quizzes') {
        next({ docs: [{ id: 'quiz-1', data: () => ({ title: 'Atomic Models Quiz', status: 'published', class_ids: ['class-1'] }) }] })
      }
      if (ref?.name === 'announcements') next({ docs: [] })
      return () => {}
    })
    ;(useRouter().push as jest.Mock).mockClear()
  })
  afterEach(() => {
    (globalThis as any).__searchParams = {}
    firestore.collection.mockImplementation(() => ({}))
    firestore.query.mockImplementation(() => ({}))
    firestore.onSnapshot.mockImplementation(() => () => {})
  })

  it('tells the quiz player which class the student opened it from', async () => {
    await renderScreen(<StudentClassDetail />)
    const quiz = await screen.findByText('Atomic Models Quiz')
    await act(async () => { fireEvent.press(quiz) })
    expect(useRouter().push).toHaveBeenCalledWith({
      pathname: '/student/quiz-player',
      params: { quizId: 'quiz-1', classId: 'class-1' },
    })
  })
})
