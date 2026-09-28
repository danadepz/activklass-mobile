/**
 * The forecast's inputs and its sentences. Mirrors the cases the web's
 * riskSignals.test.js and ai.risk.test.js cover, so the phone and the browser
 * hand the model the same vector and tell the student the same thing.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  attendanceTrendFromLog,
  missedQuizCounts,
  missingRate,
  missingWorkCountsFromEntry,
  quizAverageOf,
  quizTrendFromAttempts,
  splitTrend,
} from './riskSignals'
import { buildRiskIndicators, riskReasons, shapeRiskResult } from './risk'

vi.mock('./api', () => ({ api: vi.fn() }))

describe('trends', () => {
  it('needs enough history before it claims a trend', () => {
    expect(splitTrend([1, 1, 1], 6)).toBeUndefined()
    expect(splitTrend([1, 1, 1, 1, 1, 1], 6)).toBe(0)
  })

  it('reads attendance in date order whatever order the log arrives in', () => {
    const log = [
      { date: '2026-03-06', status: 'absent' },
      { date: '2026-03-01', status: 'present' },
      { date: '2026-03-05', status: 'absent' },
      { date: '2026-03-02', status: 'present' },
      { date: '2026-03-03', status: 'present' },
      { date: '2026-03-04', status: 'present' },
    ]
    // last third (2 days) = 0, first two thirds (4 days) = 1 -> -1
    expect(attendanceTrendFromLog(log)).toBe(-1)
    expect(attendanceTrendFromLog([...log].reverse())).toBe(-1)
  })

  it('leaves excused days out of the attendance trend', () => {
    const log = Array.from({ length: 6 }, (_, i) => ({ date: `2026-03-0${i + 1}`, status: 'excused' }))
    expect(attendanceTrendFromLog(log)).toBeUndefined()
  })

  it('walks quiz attempts in submission order, not by best', () => {
    const attempts = [
      { total_score: 5, total_possible: 10, submitted_at: '2026-03-03' },
      { total_score: 9, total_possible: 10, submitted_at: '2026-03-01' },
      { total_score: 9, total_possible: 10, submitted_at: '2026-03-02' },
    ]
    expect(quizTrendFromAttempts(attempts)).toBe(-40)
  })
})

describe('work not done', () => {
  it('counts missing assessments from the entry and skips excused ones', () => {
    const counts = missingWorkCountsFromEntry([
      { status: 'graded' }, { status: 'missing' }, { status: 'excused' }, {},
    ])
    expect(counts).toEqual({ notDone: 1, expected: 2 })
  })

  it('counts only quizzes whose window has closed without an attempt', () => {
    const now = new Date('2026-04-10T09:00:00Z').getTime()
    const quizzes = [
      { id: 'closed', status: 'closed' },
      { id: 'past', status: 'published', closes_at: '2026-04-09T09:00:00Z' },
      { id: 'open', status: 'published' },
      { id: 'future', status: 'published', closes_at: '2026-04-11T09:00:00Z' },
      { id: 'draft', status: 'draft' },
      { id: 'other', status: 'closed', assigned_to: ['s2'] },
    ]
    expect(missedQuizCounts(quizzes, new Set(['past']), 's1', now)).toEqual({ notDone: 1, expected: 2 })
  })

  it('pools counts and is unknown when nothing was expected', () => {
    expect(missingRate({ notDone: 1, expected: 1 }, { notDone: 0, expected: 3 })).toBe(0.25)
    expect(missingRate({ notDone: 0, expected: 0 }, null)).toBeUndefined()
  })

  it('averages the best attempt per quiz', () => {
    expect(quizAverageOf({
      q1: [{ total_score: 4, total_possible: 10 }, { total_score: 8, total_possible: 10 }],
      q2: [{ total_score: 6, total_possible: 10 }],
      q3: [{ total_score: null, total_possible: 10 }],
    })).toBe(70)
    expect(quizAverageOf({})).toBeNull()
  })
})

describe('indicators', () => {
  it('normalises a percentage attendance rate and drops what was not measured', () => {
    expect(buildRiskIndicators({ attendanceRate: 45, priorAverageGrade: 70 }))
      .toEqual({ attendance_rate: 0.45, prior_average_grade: 70 })
    expect(buildRiskIndicators({ attendanceRate: null, quizAverage: undefined })).toEqual({})
  })

  it('does not halve a trend', () => {
    expect(buildRiskIndicators({ attendanceTrend: -0.26 })).toEqual({ attendance_trend: -0.26 })
  })

  it('reports coverage from what was supplied', () => {
    const shaped = shapeRiskResult(
      { risk_flag: 'high_risk', risk_probability: 0.81, signals: [{ code: 'attendance_falling', value: -0.26 }] },
      { prior_average_grade: 70, attendance_trend: -0.26 },
    )
    expect(shaped.atRisk).toBe(true)
    expect(shaped.coverage).toBe(0.47)
    expect(shaped.missing).toContain('quiz_trend')
  })
})

describe('what the student is told', () => {
  it('names what is slipping and by how much, never a flat verdict', () => {
    const reasons = riskReasons([
      { code: 'attendance_falling', value: -0.26 },
      { code: 'work_not_submitted', value: 0.4 },
      { code: 'quiz_scores_falling', value: -12.4 },
      { code: 'grade_low', value: 68.2 },
      { code: 'unknown_code', value: 1 },
    ])
    expect(reasons).toEqual([
      'your attendance has dropped about 26 points recently',
      'you have not turned in 40% of your work so far',
      'your recent quiz scores are about 12 points below your earlier ones',
      'your current grade is 68',
    ])
    for (const r of reasons) expect(r).not.toMatch(/at risk/i)
  })
})
