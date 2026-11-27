/**
 * The forecast's inputs and its sentences. Mirrors the cases the web's
 * riskSignals.test.js and ai.risk.test.js cover, so the phone and the browser
 * hand the model the same vector and tell the student the same thing.
 */
import { describe, expect, it, vi } from 'vitest'
import { api } from './api'
import {
  attendanceTrendFromLog,
  missedQuizCounts,
  missingRate,
  missingWorkCountsFromEntry,
  quizAverageOf,
  quizDueDates,
  quizTrendFromAttempts,
  splitTrend,
} from './riskSignals'
import { buildRiskIndicators, predictRisk, riskReasons, shapeRiskResult } from './risk'

vi.mock('./api', () => ({ api: vi.fn() }))

describe('single-student backend compatibility', () => {
  it('opts into explicit incomplete results and suppresses an older backend score', async () => {
    vi.mocked(api).mockResolvedValue({
      risk_flag: 'on_track', risk_probability: 0.16, model: 'random_forest',
    })
    const result = await predictRisk({ attendanceRate: 92 })

    expect(vi.mocked(api)).toHaveBeenCalledWith('/api/predict', {
      method: 'POST',
      body: {
        indicators: { attendance_rate: 0.92 },
        accepts_insufficient_data: true,
      },
    })
    // The current backend ignores the extra request field and can return a
    // default-imputed score. New client shaping still hides that score.
    expect(result.status).toBe('insufficient_data')
    expect(result.flag).toBeNull()
    expect(result.probability).toBeNull()
  })

  it('uses the updated backend explicit insufficient-data response', async () => {
    vi.mocked(api).mockResolvedValue({
      status: 'insufficient_data', risk_flag: null, risk_probability: null,
      missing_features: ['quiz_trend'],
    })
    const result = await predictRisk({ attendanceRate: 92 })
    expect(result.status).toBe('insufficient_data')
    expect(result.flag).toBeNull()
    expect(result.probability).toBeNull()
    expect(result.missing).toContain('quiz_trend')
  })
})

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

  it('walks quizzes in due-date order, not submission order (A3)', () => {
    const attempts = [
      { quiz_id: 'qc', total_score: 5, total_possible: 10, submitted_at: '2026-03-01' },
      { quiz_id: 'qa', total_score: 9, total_possible: 10, submitted_at: '2026-03-09' },
      { quiz_id: 'qb', total_score: 9, total_possible: 10, submitted_at: '2026-03-05' },
    ]
    const due = { qa: '2026-03-01', qb: '2026-03-02', qc: '2026-03-03' }
    expect(quizTrendFromAttempts(attempts, due)).toBe(-40)
    // Without authoritative dates there is no trend -- none is invented.
    expect(quizTrendFromAttempts(attempts)).toBeUndefined()
  })
  it('dates a quiz by its due date, else its record column, else not at all', () => {
    expect(quizDueDates(
      [{ id: 'a', closes_at: '2026-11-03T17:00' }, { id: 'b' }, { id: 'c' }],
      [{ source_quiz_id: 'b', date_given: '2026-11-04' }],
    )).toEqual({ a: '2026-11-03', b: '2026-11-04' })
  })
  it('trends distinct quizzes, so retakes of one quiz cannot make a trend', () => {
    const retakes = [
      { quiz_id: 'q1', total_score: 9, total_possible: 10, submitted_at: '2026-03-01' },
      { quiz_id: 'q1', total_score: 5, total_possible: 10, submitted_at: '2026-03-02' },
      { quiz_id: 'q1', total_score: 2, total_possible: 10, submitted_at: '2026-03-03' },
    ]
    expect(quizTrendFromAttempts(retakes)).toBeUndefined()
    const distinct = [
      { quiz_id: 'q3', total_score: 4, total_possible: 10, submitted_at: '2026-03-09' },
      { quiz_id: 'q1', total_score: 9, total_possible: 10, submitted_at: '2026-03-02' },
      { quiz_id: 'q2', total_score: 8, total_possible: 10, submitted_at: '2026-03-05' },
      { quiz_id: 'q1', total_score: 10, total_possible: 10, submitted_at: '2026-03-10' },
    ]
    expect(quizTrendFromAttempts(distinct, { q1: '2026-03-02', q2: '2026-03-05', q3: '2026-03-09' })).toBe(-50)
  })
  it('excludes only trusted staged remediation attempts from trends', () => {
    const attempts = [
      { quiz_id: 'q1', total_score: 8, total_possible: 10 },
      { quiz_id: 'q2', total_score: 8, total_possible: 10 },
      { quiz_id: 'q3', total_score: 8, total_possible: 10 },
      { quiz_id: 'staged', total_score: 0, total_possible: 10, remediation_stage: 'guided_practice' },
    ]
    const due = { q1: '2026-03-01', q2: '2026-03-02', q3: '2026-03-03', staged: '2026-03-04' }
    expect(quizTrendFromAttempts(attempts, due)).toBe(0)
    expect(quizTrendFromAttempts([
      { quiz_id: 'legacy', total_score: 0, total_possible: 10 }, ...attempts.slice(0, 2),
    ], { legacy: '2026-03-01', q1: '2026-03-02', q2: '2026-03-03' })).toBe(40)
  })
})

describe('quiz trend parity with the web (A3, 2026-11-23)', () => {
  // Same fixtures as the web's riskSignals.js; dates are the quizzes' own.
  const att = (quiz_id: string | null, total_score: number | null, total_possible = 10, submitted_at = '2026-03-20') =>
    ({ quiz_id, total_score, total_possible, submitted_at })
  const due = { q1: '2026-03-01', q2: '2026-03-02', q3: '2026-03-03', q4: '2026-03-04' }

  it('orders by due date even when submissions arrive in the opposite order', () => {
    const late = [att('q3', 2, 10, '2026-03-01'), att('q2', 8, 10, '2026-03-02'), att('q1', 8, 10, '2026-03-03')]
    expect(quizTrendFromAttempts(late, due)).toBe(-60) // 20 vs mean(80, 80)
  })

  it('takes the best scored attempt per quiz, whatever order the retakes came in', () => {
    const a = [att('q1', 4), att('q1', 8), att('q2', 8), att('q3', 3), att('q3', 2)]
    expect(quizTrendFromAttempts(a, due)).toBe(-50) // q3 best 30 vs mean(80, 80)
  })

  it('keeps a scored zero as a real result', () => {
    const a = [att('q1', 10), att('q2', 10), att('q3', 0)]
    expect(quizTrendFromAttempts(a, due)).toBe(-100)
  })

  it('leaves undated quizzes out of the chronology instead of guessing a place', () => {
    const a = [att('q1', 9), att('q2', 9), att('q3', 3), att('qx', 0)]
    expect(quizTrendFromAttempts(a, due)).toBe(-60) // qx has no date: not part of it
  })

  it('gives no trend with fewer than three dated distinct scored quizzes', () => {
    expect(quizTrendFromAttempts([att('q1', 9), att('q2', 3)], due)).toBeUndefined()
    expect(quizTrendFromAttempts([att('q1', 9), att('q2', 3), att('qx', 1), att('qy', 1)], due)).toBeUndefined()
    expect(quizTrendFromAttempts([att('q1', 9), att('q1', 3), att('q1', 1)], due)).toBeUndefined()
  })

  it('treats missing or unusable data as no evidence, never as zero', () => {
    expect(quizTrendFromAttempts(undefined, due)).toBeUndefined()
    expect(quizTrendFromAttempts([], due)).toBeUndefined()
    // ungraded (no total_score), unusable (total_possible 0), legacy (no quiz_id)
    const noise = [att('q1', null), att('q2', 5, 0), att(null, 9), att('q3', 7)]
    expect(quizTrendFromAttempts(noise, due)).toBeUndefined()
    expect(quizDueDates(undefined, undefined)).toEqual({})
    expect(quizDueDates([{ id: 'q1', closes_at: 'soon' }], [{ source_quiz_id: 'q1', date_given: null }])).toEqual({})
  })

  it('an absent quiz trend keeps the six-input vector incomplete, so no score is shown', () => {
    const indicators = buildRiskIndicators({
      priorAverageGrade: 70, attendanceRate: 80, quizAverage: 60, attendanceTrend: -0.1,
      quizTrend: quizTrendFromAttempts([att('q1', 9), att('q2', 3)], due), missingWorkRate: 0.2,
    })
    expect(indicators).not.toHaveProperty('quiz_trend')
    const shaped = shapeRiskResult({ status: 'scored', risk_flag: 'high_risk', risk_score: 0.8 }, indicators)
    expect(shaped.status).toBe('insufficient_data')
    expect(shaped.atRisk).toBe(false)
    expect(shaped.probability).toBeNull()
    expect(shaped.missing).toEqual(['quiz_trend'])
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

  // Owner decision 2026-11-23: the unrounded mean of the best scored attempt per
  // distinct quiz, on web and mobile alike. Expected values were produced by the
  // web's quizAverageFromAttempts (2a4dee8) on the same attempts.
  describe('unrounded quiz average (web parity)', () => {
    const q = (...scores: (number | null)[]) => scores.map((s) => ({ total_score: s, total_possible: 100 }))
    it('keeps the fraction', () => {
      expect(quizAverageOf({ a: q(81), b: q(82) })).toBe(81.5)
      expect(quizAverageOf({ a: q(75), b: q(80), c: q(90) })).toBeCloseTo(245 / 3, 12)
      expect(quizAverageOf({ a: q(75), b: q(80), c: q(90) })).not.toBe(82)
      expect(quizAverageOf({ a: q(0), b: q(85) })).toBe(42.5)
    })
    it('best attempt per quiz, zeros kept, ungraded ignored, nothing scored is unknown', () => {
      expect(quizAverageOf({ a: q(40, 81, 60), b: q(82) })).toBe(81.5)
      expect(quizAverageOf({ a: q(0, 0), b: q(85) })).toBe(42.5)
      expect(quizAverageOf({ a: q(null, 81), b: q(82), c: q(null) })).toBe(81.5)
      expect(quizAverageOf({ a: [{ total_score: 9, total_possible: 0 }], b: q(null) })).toBeNull()
      expect(quizAverageOf({})).toBeNull()
    })
    it('excludes trusted staged remediation scores while retaining legacy unmarked remediation', () => {
      const withStages = {
        regular: q(80),
        guided: [{ ...q(0)[0], remediation_stage: 'guided_practice' }],
        independent: [{ ...q(0)[0], remediation_stage: 'independent_practice' }],
        reassessment: [{ ...q(0)[0], remediation_stage: 'reassessment' }],
        legacyRemediation: q(60),
      }
      expect(quizAverageOf(withStages)).toBe(70)
      expect(quizAverageOf({ guided: withStages.guided, independent: withStages.independent, reassessment: withStages.reassessment })).toBeNull()
    })
    it('reaches the prediction request unrounded', async () => {
      vi.mocked(api).mockResolvedValue({ status: 'insufficient_data', missing: [], supplied: ['quiz_average'] })
      await predictRisk({ quizAverage: quizAverageOf({ a: q(75), b: q(80), c: q(90) }) })
      const body = vi.mocked(api).mock.calls.at(-1)?.[1] as any
      expect(JSON.stringify(body)).toContain('"quiz_average":81.66666666666667')
    })
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
    expect(shaped.atRisk).toBe(false)
    expect(shaped.status).toBe('insufficient_data')
    expect(shaped.probability).toBeNull()
    expect(shaped.flag).toBeNull()
    expect(shaped.signals).toEqual([])
    expect(shaped.coverage).toBe(0.47)
    expect(shaped.missing).toContain('quiz_trend')
  })

  it('accepts a legacy scored response only when all six features were sent', () => {
    const full = {
      prior_average_grade: 70, attendance_rate: 0.9, quiz_average: 60,
      attendance_trend: -0.1, quiz_trend: -5, missing_work_rate: 0.2,
    }
    const scored = shapeRiskResult({ risk_flag: 'high_risk', risk_probability: 0.75 }, full)
    expect(scored.status).toBe('scored')
    expect(scored.atRisk).toBe(true)
    expect(scored.probability).toBeNull()

    const partial = shapeRiskResult({ risk_flag: 'high_risk', risk_probability: 0.75 }, {
      prior_average_grade: 70,
    })
    expect(partial.status).toBe('insufficient_data')
    expect(partial.flag).toBeNull()
    expect(partial.atRisk).toBe(false)
    expect(partial.probability).toBeNull()
  })

  it('does not show a stale score when the backend marks data insufficient', () => {
    const full = {
      prior_average_grade: 70, attendance_rate: 0.9, quiz_average: 60,
      attendance_trend: -0.1, quiz_trend: -5, missing_work_rate: 0.2,
    }
    const result = shapeRiskResult({
      status: 'insufficient_data', risk_flag: 'high_risk', risk_probability: 0.75,
    }, full)
    expect(result.status).toBe('insufficient_data')
    expect(result.probability).toBeNull()
    expect(result.atRisk).toBe(false)
  })

  it('marks unavailable model responses separately', () => {
    const result = shapeRiskResult({ status: 'model_unavailable', risk_flag: null }, {})
    expect(result.status).toBe('model_unavailable')
    expect(result.probability).toBeNull()
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

describe('attendance unit contract (2026-11-23): percentage in, fraction out', () => {
  it.each([[0, 0], [0.5, 0.005], [1, 0.01], [50, 0.5], [100, 1], [500 / 7, 5 / 7]])(
    '%s%% -> %s', (pct, fraction) => {
      expect(buildRiskIndicators({ attendanceRate: pct }).attendance_rate).toBeCloseTo(fraction, 12)
    })
})
