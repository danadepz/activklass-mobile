/**
 * The dashboard forecast's per-class evidence (2026-11-23): what each class's
 * forecast is fed, and what the loader is allowed to read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const getDocs = vi.fn()
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...path) => ({ path: path.join('/') })),
  query: vi.fn((col, ...filters) => ({ ...col, filters })),
  where: vi.fn((field, op, value) => [field, op, value]),
  getDocs: (...args: any[]) => getDocs(...args),
}))
vi.mock('../config/firebase', () => ({ db: {} }))

const { forecastInputsFor, loadQuizEvidence, withQuizLinks, visibleQuizzesFor } = await import('./studentForecast')
const { quizDueDates, quizTrendFromAttempts, missedQuizCounts, missedQuizCountsIfKnown, missingRate, missingWorkCountsFromEntry, quizIdOfColumn } = await import('./riskSignals')

const ME = 'me'
const att = (quiz_id: string, total_score: number | null, extra: any = {}) =>
  ({ quiz_id, total_score, total_possible: 10, class_id: 'c1', student_id: ME, status: 'graded', submitted_at: '2026-03-20', ...extra })
const quiz = (id: string, closes_at: string | null, extra: any = {}) => ({ id, status: 'closed', closes_at, ...extra })
const entry = (assessments: any[] = [], extra: any = {}) =>
  ({ class_id: 'c1', final_grade: 82, mode: 'deped_k12', assessments, components: [], periods: [], passing_percent: null, point_scale_direction: null, ...extra })
const attendance = (statuses: string[]) => ({
  log: statuses.map((status, i) => ({ date: `2026-03-${String(i + 1).padStart(2, '0')}`, status, remarks: null, excuse_url: null })),
  tally: { present: 0, late: 0, absent: 0, excused: 0 }, rate: 99,
})

/** The forecast component's own quiz-trend computation, from the props it is given. */
const trendOf = (f: any) => quizTrendFromAttempts(f.attempts, quizDueDates(f.quizzes, f.assessments))

const build = (evidence: any, e: any = entry(), a: any = attendance(['present'])) =>
  forecastInputsFor({ classId: 'c1', studentId: ME, entry: e, attendance: a, evidence })

describe('forecast inputs for one class', () => {
  const quizzes = [quiz('q1', '2026-03-01T17:00'), quiz('q2', '2026-03-02T17:00'), quiz('q3', '2026-03-03T17:00')]

  it('1. three dated scored quizzes give a due-date-ordered trend and an average', () => {
    // Submitted in reverse; the trend still follows the due dates.
    const f = build({ quizzes, attempts: [att('q3', 2, { submitted_at: '2026-03-01' }), att('q2', 8), att('q1', 8, { submitted_at: '2026-03-30' })] })
    expect(trendOf(f)).toBe(-60)
    expect(f.quizAverage).toBe(60)
  })

  it('2. fewer than three dated quizzes give no trend', () => {
    expect(trendOf(build({ quizzes, attempts: [att('q1', 9), att('q2', 3)] }))).toBeUndefined()
  })

  it('3. several attempts at one quiz count once, at their best', () => {
    const f = build({ quizzes, attempts: [att('q1', 2), att('q1', 8), att('q2', 8), att('q3', 3), att('q3', 1)] })
    expect(trendOf(f)).toBe(-50)
    expect(f.quizAverage).toBeCloseTo(190 / 3, 10) // mean(80, 80, 30), unrounded
  })

  it('4. a scored zero is a real result', () => {
    const f = build({ quizzes, attempts: [att('q1', 10), att('q2', 10), att('q3', 0)] })
    expect(trendOf(f)).toBe(-100)
    expect(f.quizAverage).toBeCloseTo(200 / 3, 10)
  })

  it('5. ungraded and in-progress attempts are no score (but do count as attempted)', () => {
    const f = build({ quizzes, attempts: [att('q1', 9), att('q2', 9), att('q3', null, { status: 'in_progress' })] })
    expect(trendOf(f)).toBeUndefined()
    expect(f.quizAverage).toBe(90)
    expect([...(f.attemptedQuizIds ?? [])].sort()).toEqual(['q1', 'q2', 'q3'])
  })

  it('6. a quiz with no due date and no dated record column is left out of the chronology', () => {
    const undated = [...quizzes.slice(0, 2), quiz('q3', null)]
    expect(trendOf(build({ quizzes: undated, attempts: [att('q1', 9), att('q2', 9), att('q3', 1)] }))).toBeUndefined()
  })

  it('7. the record column date is the fallback, linked through the quiz-{id} column id', () => {
    const undated = [...quizzes.slice(0, 2), quiz('q3', null)]
    const e = entry([
      { id: 'quiz-q3', title: 'Q3', date_given: '2026-03-04', status: 'graded' },
      { id: 'task-t1', title: 'Task', date_given: '2026-03-05', status: 'graded' },
      { id: 'Xy7randomId', title: 'Hand-entered', date_given: '2026-03-06', status: 'graded' },
    ])
    const f = build({ quizzes: undated, attempts: [att('q1', 9), att('q2', 9), att('q3', 1)] }, e)
    expect(f.assessments.map((a: any) => a.source_quiz_id ?? null)).toEqual(['q3', null, null])
    expect(trendOf(f)).toBe(-80)
    // The due date still wins over the record date when both exist.
    expect(quizDueDates([quiz('q3', '2026-03-09T08:00')], withQuizLinks(e.assessments))).toEqual({ q3: '2026-03-09' })
  })

  it('8. evidence from another class or another student never enters this class', () => {
    const f = build({
      quizzes,
      attempts: [
        att('q1', 9), att('q2', 9), att('q3', 1),
        att('q1', 0, { class_id: 'c2' }), // same quiz assigned to another class
        att('q9', 0, { class_id: 'c2' }),
        att('q2', 0, { student_id: 'someone-else' }),
        att('q3', 10, { class_id: undefined }), // legacy, class unknown: not guessed
      ],
    })
    expect(f.attempts?.length).toBe(3)
    expect(f.quizAverage).toBeCloseTo(190 / 3, 10)
    expect(trendOf(f)).toBe(-80)
  })

  it('9. unreadable quiz data is unknown, never zero', () => {
    const noAttempts = build({ quizzes, attempts: undefined })
    expect(noAttempts.quizAverage).toBeNull()
    expect(noAttempts.attempts).toBeUndefined()
    expect(noAttempts.attemptedQuizIds).toBeUndefined()
    expect(trendOf(noAttempts)).toBeUndefined()
    const noQuizzes = build({ quizzes: undefined, attempts: [att('q1', 9), att('q2', 9), att('q3', 1)] })
    expect(noQuizzes.quizzes).toBeUndefined()
    expect(trendOf(noQuizzes)).toBeUndefined() // no dates known -> no chronology
    const nothing = build(null, null, null)
    expect(nothing).toMatchObject({ grade: null, attendanceRate: null, quizAverage: null, attempts: undefined, quizzes: undefined })
    expect(nothing.assessments).toEqual([])
  })

  it('an empty class (no quizzes, no attempts) is known-empty, not unknown', () => {
    const f = build({ quizzes: [], attempts: [] })
    expect(f.quizAverage).toBeNull()
    expect(f.attemptedQuizIds?.size).toBe(0)
  })

  it('uses the class grade, but withholds a 1.0-5.0 point grade', () => {
    expect(build({}).grade).toBe(82)
    expect(build({}, entry([], { mode: 'ched_point', final_grade: 2.25 })).grade).toBeNull()
  })

  it('model attendance is the weighted rate over held sessions, not the display rate (owner decision 2026-11-23)', () => {
    // 4 present, 2 late, 1 absent, 1 excused -> 100 * 5 / 7 = 71.428571…, not 4/8 = 50.
    const a = attendance(['present', 'present', 'present', 'present', 'late', 'late', 'absent', 'excused'])
    expect(build({}, entry(), a).attendanceRate).toBeCloseTo(500 / 7, 10)
    // Marks on cancelled and moved-away meetings never count.
    a.log.push(
      { date: '2026-03-20', status: 'absent', remarks: null, excuse_url: null, session_status: 'cancelled' } as any,
      { date: '2026-03-21', status: 'absent', remarks: null, excuse_url: null, session_status: 'rescheduled' } as any,
    )
    const f = build({}, entry(), a)
    expect(f.attendanceRate).toBeCloseTo(500 / 7, 10)
    expect(f.attendanceLog).toHaveLength(10) // the log itself is untouched (trend and display read it)
    // Nothing counted (only excused) is missing, not zero; the display rate is not used.
    expect(build({}, entry(), attendance(['excused'])).attendanceRate).toBeNull()
  })

  it('drafts and quizzes assigned to other students are not expected of this student', () => {
    expect(visibleQuizzesFor([
      quiz('a', null, { status: 'draft' }), quiz('b', null), quiz('c', null, { assigned_to: ['other'] }),
      quiz('d', null, { assigned_to: [ME] }), quiz('e', null, { status: 'published', assigned_to: 'all' }),
    ], ME).map((q) => q.id)).toEqual(['b', 'd', 'e'])
  })

  it('an excused closed quiz leaves the missed-work count entirely (A4)', () => {
    const closed = [quiz('q1', null), quiz('q2', null)]
    expect(missedQuizCounts(closed, new Set(), ME)).toEqual({ notDone: 2, expected: 2 })
    expect(missedQuizCounts(closed, new Set(), ME, undefined, new Set(['q2']))).toEqual({ notDone: 1, expected: 1 })
  })
})

describe('loadQuizEvidence reads only what this student may read', () => {
  const snap = (rows: any[]) => ({ docs: rows.map(({ id, ...d }) => ({ id, data: () => d })) })
  // Braces matter: a returned function is run as teardown, and mockReset returns the mock.
  beforeEach(() => { getDocs.mockReset() })

  it('12. every query is scoped: own attempts, own excusals, the class quizzes', async () => {
    getDocs.mockResolvedValue(snap([]))
    await loadQuizEvidence(['c1', 'c2'], ME)
    const calls = getDocs.mock.calls.map(([q]: any) => `${q.path} ${JSON.stringify(q.filters)}`)
    expect(calls).toContain(`quiz_attempts [["student_id","==","${ME}"]]`)
    expect(calls.filter((c: string) => c.startsWith('quiz_attempts')).length).toBe(1) // once, not per class
    for (const c of ['c1', 'c2']) {
      expect(calls).toContain(`quizzes [["class_ids","array-contains","${c}"]]`)
      expect(calls).toContain(`quizzes [["class_id","==","${c}"]]`)
      expect(calls).toContain(`classes/${c}/quiz_excusals [["student_id","==","${ME}"]]`)
    }
    // Nothing else: no gradebook assessments, no other students' attempts.
    expect(calls.length).toBe(1 + 2 * 3)
    expect(calls.some((c: string) => c.includes('assessments') || c.includes('entries'))).toBe(false)
  })

  it('merges the array and legacy quiz queries by id and keeps only excused rows', async () => {
    getDocs.mockImplementation(async (q: any) => {
      if (q.path === 'quiz_attempts') return snap([{ id: 'a1', quiz_id: 'q1', class_id: 'c1', student_id: ME }])
      if (q.path === 'quizzes') return snap([{ id: 'q1', status: 'closed' }])
      return snap([{ id: 'q1_me', quiz_id: 'q1', student_id: ME, excused: true }, { id: 'q2_me', quiz_id: 'q2', student_id: ME, excused: false }])
    })
    const ev = await loadQuizEvidence(['c1'], ME)
    expect(ev.c1.quizzes?.map((q: any) => q.id)).toEqual(['q1'])
    expect(ev.c1.attempts?.length).toBe(1)
    expect([...(ev.c1.excused ?? [])]).toEqual(['q1'])
  })

  it('10. a refused or failed read leaves that evidence unknown -- excusals included', async () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
    getDocs.mockImplementation(async (q: any) => {
      if (q.path === 'quiz_attempts') throw denied
      if (q.path === 'quizzes' && q.filters[0][0] === 'class_id') throw new Error('network')
      if (q.path.endsWith('quiz_excusals')) throw denied
      return snap([{ id: 'q1', status: 'closed' }])
    })
    const ev = await loadQuizEvidence(['c1'], ME)
    expect(ev.c1.attempts).toBeUndefined()
    expect(ev.c1.quizzes).toBeUndefined()
    expect(ev.c1.excused).toBeUndefined() // unknown, not "none excused"
    const f = forecastInputsFor({ classId: 'c1', studentId: ME, entry: entry(), attendance: attendance(['present']), evidence: ev.c1 })
    expect(f.quizAverage).toBeNull()
    expect(trendOf(f)).toBeUndefined()
  })
})

/**
 * Task 2 (2026-11-23): a failed read must never be scored as confirmed evidence.
 * The missing-work rate the forecast sends is the one built here.
 */
describe('missing work is withheld when the quiz half is unknown', () => {
  const closed = [quiz('q1', null), quiz('q2', null)] // both closed, assigned to everyone
  const rateFor = (f: any) => {
    const quizWork = missedQuizCountsIfKnown(f.quizzes, f.attemptedQuizIds, ME, f.excusedQuizIds)
    return quizWork ? missingRate(missingWorkCountsFromEntry(f.assessments), quizWork) : undefined
  }

  it('excusals unknown + a closed quiz expected -> no rate (not an excused quiz counted as missed)', () => {
    const f = build({ quizzes: closed, attempts: [att('q1', 9)], excused: undefined })
    expect(f.excusedQuizIds).toBeUndefined()
    expect(rateFor(f)).toBeUndefined()
    // The same student with the excusal known: q2 excused, nothing missed.
    expect(rateFor(build({ quizzes: closed, attempts: [att('q1', 9)], excused: new Set(['q2']) }))).toBe(0)
    // Known none excused: q2 really is missed.
    expect(rateFor(build({ quizzes: closed, attempts: [att('q1', 9)], excused: new Set() }))).toBe(0.5)
  })

  it('excusals unknown but no quiz expected -> the rate stands (an excusal could change nothing)', () => {
    const e = entry([{ id: 'w1', title: 'W1', status: 'missing' }, { id: 'w2', title: 'W2', status: 'graded' }])
    expect(rateFor(build({ quizzes: [quiz('o', null, { status: 'published', closes_at: '2999-01-01T00:00' })], attempts: [], excused: undefined }, e))).toBe(0.5)
  })

  it('attempts unknown -> no rate (not every closed quiz counted as missed)', () => {
    const f = build({ quizzes: closed, attempts: undefined, excused: new Set() })
    expect(missedQuizCounts(f.quizzes, f.attemptedQuizIds, ME)).toEqual({ notDone: 2, expected: 2 }) // the old trap
    expect(rateFor(f)).toBeUndefined()
  })

  it('quizzes unknown -> no rate (not "no quiz was ever due")', () => {
    const e = entry([{ id: 'w1', title: 'W1', status: 'graded' }])
    expect(rateFor(build({ quizzes: undefined, attempts: [], excused: new Set() }, e))).toBeUndefined()
  })

  it('the loader end to end: a refused excusal read withholds the rate instead of flagging the quiz', async () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
    const snap = (rows: any[]) => ({ docs: rows.map(({ id, ...d }) => ({ id, data: () => d })) })
    getDocs.mockReset()
    getDocs.mockImplementation(async (q: any) => {
      if (q.path === 'quiz_attempts') return snap([{ id: 'a1', quiz_id: 'q1', class_id: 'c1', student_id: ME, total_score: 9, total_possible: 10 }])
      if (q.path === 'quizzes') return snap([{ id: 'q1', status: 'closed' }, { id: 'q2', status: 'closed' }])
      throw denied
    })
    const ev = await loadQuizEvidence(['c1'], ME)
    expect(rateFor(forecastInputsFor({ classId: 'c1', studentId: ME, entry: entry(), attendance: null, evidence: ev.c1 }))).toBeUndefined()
  })
})

describe('identified quizzes only, and malformed column ids (2026-11-23)', () => {
  const quizzes = [quiz('q1', '2026-03-01T17:00'), quiz('q2', '2026-03-02T17:00'), quiz('q3', '2026-03-03T17:00')]

  it('scored attempts without a valid quiz_id are left out of the average, trend and attempted set', () => {
    const f = build({
      quizzes,
      attempts: [
        att('q1', 8), att('q2', 8), att('q3', 2),
        att(undefined as any, 10), att(null as any, 10), att('', 10), att('   ', 10),
      ],
    })
    expect(f.quizAverage).toBe(60)
    expect(trendOf(f)).toBe(-60)
    expect([...(f.attemptedQuizIds ?? [])].sort()).toEqual(['q1', 'q2', 'q3'])
    expect(f.attempts?.length).toBe(7) // the attempts themselves are kept, untouched
  })

  it('only unidentified scored attempts -> no average (unknown, never zero)', () => {
    expect(build({ quizzes, attempts: [att(undefined as any, 9), att('', 9)] }).quizAverage).toBeNull()
  })

  it('malformed column ids link to no quiz', () => {
    for (const id of ['quiz-', 'quiz-   ', 'quiz', 'Quiz-abc', 'task-abc', 'Xy7random', 'xquiz-abc', '', null, undefined, 42]) {
      expect(quizIdOfColumn({ id })).toBeNull()
    }
    expect(quizIdOfColumn({ id: 'quiz-abc' })).toBe('abc')
    expect(quizIdOfColumn({ id: 'quiz-abc', source_quiz_id: 'xyz' })).toBe('xyz')
    expect(withQuizLinks([{ id: 'quiz-   ', title: 'x', date_given: '2026-03-01' }])[0].source_quiz_id).toBeUndefined()
  })

  it('quizDueDates links a column by its id alone, closes_at still first', () => {
    const cols = [{ id: 'quiz-q2', date_given: '2026-03-09' }, { id: 'quiz-q4', date_given: '2026-03-10' }]
    expect(quizDueDates([quiz('q2', '2026-03-02T17:00'), quiz('q4', null), quiz('q5', null)], cols))
      .toEqual({ q2: '2026-03-02', q4: '2026-03-10' })
  })
})

