/**
 * The student's own reads must land on the same documents the web reads.
 *
 * The syllabus case is the one the web workspace flagged: a syllabus lives in
 * two places, and a remediation's topic id can come from either. Reading only
 * the per-class document meant a review guide's "Where this fits" card could
 * not find its module while the browser showed it fine.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDoc = vi.fn()
const getDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args) => args),
  doc: vi.fn((_db, ...path) => path.join('/')),
  getDoc: (...args: any[]) => getDoc(...args),
  getDocs: (...args: any[]) => getDocs(...args),
}))
vi.mock('../config/firebase', () => ({ db: {} }))

const { loadSyllabus, loadStudentAttendance, loadStudentEntry } = await import('./studentData')

const snap = (data: any | null) => ({ exists: () => data != null, data: () => data })

beforeEach(() => {
  getDoc.mockReset()
  getDocs.mockReset()
})

describe('loadSyllabus', () => {
  const published = { modules: [{ id: 'm1', title: 'A', topics: [] }, { id: 'm2', title: 'B', published: false, topics: [] }] }

  it('reads syllabi/{syllabus_id} first when the class names one', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'classes/c1') return snap({ syllabus_id: 'syl-9' })
      if (path === 'syllabi/syl-9') return snap(published)
      return snap(null)
    })
    const s = await loadSyllabus('c1')
    expect(s?.modules?.map((m: any) => m.id)).toEqual(['m1'])
    expect(getDoc.mock.calls.map((c) => c[0])).toEqual(['classes/c1', 'syllabi/syl-9'])
  })

  it('falls back to classes/{id}/syllabus/current when there is no syllabus_id', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'classes/c1') return snap({ subject: 'Science 9' })
      if (path === 'classes/c1/syllabus/current') return snap(published)
      return snap(null)
    })
    const s = await loadSyllabus('c1')
    expect(s?.modules?.map((m: any) => m.id)).toEqual(['m1'])
    expect(getDoc.mock.calls.map((c) => c[0])).toEqual(['classes/c1', 'classes/c1/syllabus/current'])
  })

  it('falls back when syllabus_id points at a document that is gone', async () => {
    getDoc.mockImplementation(async (path: string) => {
      if (path === 'classes/c1') return snap({ syllabus_id: 'deleted' })
      if (path === 'classes/c1/syllabus/current') return snap(published)
      return snap(null)
    })
    expect((await loadSyllabus('c1'))?.modules).toHaveLength(1)
  })

  it('is null, not a throw, when nothing exists or the read is denied', async () => {
    getDoc.mockResolvedValue(snap(null))
    expect(await loadSyllabus('c1')).toBeNull()
    getDoc.mockRejectedValue(new Error('permission-denied'))
    expect(await loadSyllabus('c1')).toBeNull()
  })
})

describe('loadStudentEntry', () => {
  it('carries the pass mark and scale direction the record stamped', async () => {
    getDoc.mockResolvedValue(snap({
      final_grade: 62, mode: 'ched_percentage', passing_percent: 60, point_scale_direction: 'ched',
      periods: [{ id: 'p1', name: 'Prelim', grade: 62 }],
      assessments: [{ id: 'a1', title: 'Quiz 1', status: 'graded', raw_score: 6, total_points: 10 }],
      components: [{ id: 'c1', name: 'Quizzes', weight_percent: 40 }],
    }))
    const e = await loadStudentEntry('c1', 's1')
    expect(e?.passing_percent).toBe(60)
    expect(e?.mode).toBe('ched_percentage')
    expect(e?.assessments).toHaveLength(1)
    expect(e?.components[0].name).toBe('Quizzes')
  })

  it('leaves the policy null when an older entry has none, so the defaults apply', async () => {
    getDoc.mockResolvedValue(snap({ final_grade: 83, periods: [] }))
    const e = await loadStudentEntry('c1', 's1')
    expect(e?.passing_percent).toBeNull()
    expect(e?.assessments).toEqual([])
  })
})

describe('loadStudentAttendance', () => {
  it('lists only the days this student has a record for, newest first', async () => {
    getDocs.mockResolvedValue({
      forEach: (fn: any) => {
        fn({ id: '2026-03-01', data: () => ({ records: { s1: { status: 'present' } } }) })
        fn({ id: '2026-03-02', data: () => ({ records: { s2: { status: 'absent' } } }) })
        fn({ id: '2026-03-03', data: () => ({ records: { s1: { status: 'late', remarks: 'bus' } } }) })
      },
    })
    const a = await loadStudentAttendance('c1', 's1')
    expect(a.log.map((d) => d.date)).toEqual(['2026-03-03', '2026-03-01'])
    expect(a.tally).toEqual({ present: 1, late: 1, absent: 0, excused: 0 })
    expect(a.rate).toBe(50)
  })
})
