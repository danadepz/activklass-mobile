import { describe, expect, it } from 'vitest'
import { buildNotifications } from './parentNotifications'
import type { ChildRecords } from './parentData'

const base: ChildRecords = {
  classes: [], attempts: [], attendance: [],
  attendanceRate: null, overallAverage: null, partial: false,
}
const cls = (id: string, grade: number | null) => ({
  class_id: id, subject: id.toUpperCase(), subject_code: null, section: null,
  final_grade: grade, periods: [],
})

describe('buildNotifications', () => {
  it('returns nothing without records', () => {
    expect(buildNotifications('s1', 'Ana', null)).toEqual([])
  })

  it('flags failing percentage and point-scale grades, not passing ones', () => {
    const n = buildNotifications('s1', 'Ana', {
      ...base, classes: [cls('math', 60), cls('sci', 90), cls('eng', 3.5), cls('art', 1.5), cls('pe', null)],
    })
    expect(n.filter((x) => x.kind === 'low_grade').map((x) => x.id.split(':')[2]).sort())
      .toEqual(['eng', 'math'])
  })

  it("follows the class's own pass policy, not a fixed 75 or 3.0", () => {
    const n = buildNotifications('s1', 'Ana', {
      ...base, classes: [
        { ...cls('pct60', 70), mode: 'ched_percentage', passing_percent: 60 },   // passes at 60
        { ...cls('pct80', 78), mode: 'ched_percentage', passing_percent: 80 },   // fails at 80
        { ...cls('deped', 74), mode: 'deped_k12', passing_percent: 60 },         // DepEd stays 75
        { ...cls('inv', 2.0), mode: 'ched_point', point_scale_direction: 'inverted' }, // 5.0 best: fails
        { ...cls('ched', 2.0), mode: 'ched_point' },                             // 1.0 best: passes
      ],
    })
    expect(n.filter((x) => x.kind === 'low_grade').map((x) => x.id.split(':')[2]).sort())
      .toEqual(['deped', 'inv', 'pct80'])
  })

  it('titles the single worst grade "Lowest grade"', () => {
    const n = buildNotifications('s1', 'Ana', { ...base, classes: [cls('math', 60), cls('sci', 70)] })
    expect(n.find((x) => x.id.includes(':math:'))?.title).toBe('Lowest grade')
    expect(n.find((x) => x.id.includes(':sci:'))?.title).toBe('Grade below passing')
  })

  it('raises attendance only below the threshold', () => {
    const t = { present: 5, late: 1, absent: 4, excused: 0 }
    const n = buildNotifications('s1', 'Ana', {
      ...base, classes: [cls('math', 90)],
      attendance: [{ class_id: 'math', tally: t, rate: 0.5 }, { class_id: 'sci', tally: t, rate: 0.95 }],
    })
    expect(n.filter((x) => x.kind === 'attendance')).toHaveLength(1)
  })

  it('lists the newest scored quizzes and skips unscored ones', () => {
    const a = (id: string, score: number | null, at: string) => ({
      attempt_id: id, quiz_id: 'q', quiz_title: id, class_id: 'c',
      total_score: score, total_possible: 10, status: 'graded', submitted_at: at,
    })
    const n = buildNotifications('s1', 'Ana', {
      ...base, attempts: [a('old', 5, '2026-01-01'), a('new', 9, '2026-02-01'), a('none', null, '2026-03-01')],
    })
    expect(n.map((x) => x.id)).toEqual(['s1:score:new', 's1:score:old'])
  })
})
