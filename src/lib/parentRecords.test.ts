/**
 * What a guardian sees for one class.
 *
 * These exist because of a bug that shipped: the Flask endpoint recomputed the
 * grade from raw scores while the teacher's Class Record computed and stored
 * it, and the two disagreed. A learner the teacher saw as 83 "Satisfactory"
 * reached their guardian as 73.8, which the app rendered as failing -- same
 * child, same moment, opposite verdicts, because DepEd transmutation lived in
 * only one of the two implementations.
 *
 * Teaching the server the missing rule fixed that instance. Reading the stored
 * entry removes the second implementation entirely, which is what these pin:
 * the number a guardian sees is the number the teacher saved, not a number
 * derived again on the way past.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDoc = vi.fn()
const getDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn((...args) => args),
  query: vi.fn((...args) => args),
  where: vi.fn((f, op, v) => ({ f, op, v })),
  getDoc: (...args: any[]) => getDoc(...args),
  getDocs: (...args: any[]) => getDocs(...args),
}))
vi.mock('../config/firebase', () => ({ db: {} }))

const { loadClassAttendance, loadClassPerformance } = await import('./parentRecords')

const entry = (over: Record<string, any> = {}) => ({
  exists: () => true,
  data: () => ({
    class_id: 'demo-sci9-newton',
    subject: 'Science 9',
    section: 'Newton',
    mode: 'deped_k12',
    final_grade: 83,
    periods: [{ id: 'q1', name: 'Quarter 1', grade: 83 }],
    assessments: [{ id: 'a1', title: 'WW1', raw_score: 16, total_points: 20, class_average: 16.14 }],
    ...over,
  }),
})

beforeEach(() => {
  getDoc.mockReset()
  getDocs.mockReset()
})

describe('loadClassPerformance', () => {
  it('returns the STORED grade, untouched', async () => {
    // The whole point. 83 is what the teacher's Class Record computed and
    // saved. Anything that derives a number here reintroduces the drift.
    getDoc.mockResolvedValue(entry())
    const p = await loadClassPerformance('student-1', 'demo-sci9-newton')
    expect(p?.final_grade).toBe(83)
  })

  it('maps the entry\'s `mode` onto `grading_mode`', async () => {
    // The screen branches on grading_mode to decide whether 3.0 or 75 is the
    // pass mark. The entry spells it `mode`; a silent undefined here would
    // make a CHED point score of 1.5 read as a failing percentage.
    getDoc.mockResolvedValue(entry({ mode: 'ched_point', final_grade: 1.5 }))
    const p = await loadClassPerformance('student-1', 'c1')
    expect(p?.grading_mode).toBe('ched_point')
  })

  it('defaults the mode rather than leaving it undefined', async () => {
    getDoc.mockResolvedValue(entry({ mode: undefined }))
    expect((await loadClassPerformance('student-1', 'c1'))?.grading_mode).toBe('deped_k12')
  })

  it('carries the per-assessment rows, class average included', async () => {
    // These come from the entry rather than the assessments subcollection,
    // which holds every student's raw scores and is closed to guardians.
    getDoc.mockResolvedValue(entry())
    const p = await loadClassPerformance('student-1', 'c1')
    expect(p?.assessments[0].class_average).toBe(16.14)
  })

  it('is null when no entry exists, rather than an empty grade', async () => {
    // A class the teacher has not saved a record for. Null lets the screen
    // show "—"; a fabricated zero would read as a real mark of zero.
    getDoc.mockResolvedValue({ exists: () => false, data: () => undefined })
    expect(await loadClassPerformance('student-1', 'c1')).toBeNull()
  })

  it('survives an entry missing its arrays', async () => {
    getDoc.mockResolvedValue(entry({ periods: undefined, assessments: undefined }))
    const p = await loadClassPerformance('student-1', 'c1')
    expect(p?.periods).toEqual([])
    expect(p?.assessments).toEqual([])
  })
})

const summaries = (rows: any[]) => ({ docs: rows.map((r) => ({ data: () => r })) })

describe('loadClassAttendance', () => {
  const row = {
    class_id: 'c1',
    student_id: 'student-1',
    rate: 75,
    tally: { present: 9, late: 1, absent: 1, excused: 1 },
    days: {
      '2026-07-09': { status: 'present', remarks: null, excuse_url: null },
      '2026-07-11': { status: 'absent', remarks: 'fever', excuse_url: null },
      '2026-07-10': { status: 'late', remarks: null, excuse_url: null },
    },
  }

  it('turns the days map into a list, newest first', async () => {
    // Stored as a map keyed by date because that is how it is written. The
    // screen wants a list in reading order.
    getDocs.mockResolvedValue(summaries([row]))
    const a = await loadClassAttendance('student-1', 'c1')
    expect(a?.attendance_logs.map((l) => l.date)).toEqual(['2026-07-11', '2026-07-10', '2026-07-09'])
  })

  it('keeps the remark attached to the right day', async () => {
    getDocs.mockResolvedValue(summaries([row]))
    const a = await loadClassAttendance('student-1', 'c1')
    expect(a?.attendance_logs.find((l) => l.date === '2026-07-11')?.remarks).toBe('fever')
  })

  it('picks the summary for THIS class', async () => {
    // The query filters by student only -- two equality filters would need a
    // composite index for a handful of documents -- so the class filter here
    // is load-bearing, not decoration.
    getDocs.mockResolvedValue(summaries([{ ...row, class_id: 'other' }, { ...row, rate: 42 }]))
    const a = await loadClassAttendance('student-1', 'c1')
    expect(a?.attendance_rate).toBe(42)
  })

  it('is null when this student has no summary for the class', async () => {
    getDocs.mockResolvedValue(summaries([{ ...row, class_id: 'somewhere-else' }]))
    expect(await loadClassAttendance('student-1', 'c1')).toBeNull()
  })

  it('fills a missing tally with zeroes rather than undefined', async () => {
    // The screen renders these straight into counters.
    getDocs.mockResolvedValue(summaries([{ ...row, tally: undefined }]))
    const a = await loadClassAttendance('student-1', 'c1')
    expect(a?.tally).toEqual({ present: 0, late: 0, absent: 0, excused: 0 })
  })
})
