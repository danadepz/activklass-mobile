/**
 * The pass mark is the teacher's, read off the entry (T-45). The grades tab
 * used to paint "Passing" in green over every grade and colour every bar at
 * a hard-coded 75; these pin the policy-aware replacements.
 */
import { describe, expect, it } from 'vitest'
import {
  formatGrade,
  gradePolicy,
  gradeTone,
  gradeToneKey,
  isPassingGrade,
  itemPasses,
  passNote,
  passes,
} from './gradeDisplay'

describe('gradePolicy', () => {
  it('defaults to 75 and 1.0-is-highest when the entry carries nothing', () => {
    expect(gradePolicy(null)).toEqual({ passing_percent: 75, point_scale_direction: 'ched' })
    expect(gradePolicy({})).toEqual({ passing_percent: 75, point_scale_direction: 'ched' })
  })

  it('reads the fields the record stamps and ignores nonsense', () => {
    expect(gradePolicy({ passing_percent: 60, point_scale_direction: 'inverted' }))
      .toEqual({ passing_percent: 60, point_scale_direction: 'inverted' })
    expect(gradePolicy({ passing_percent: '65' }).passing_percent).toBe(65)
    expect(gradePolicy({ passing_percent: 0 }).passing_percent).toBe(75)
    expect(gradePolicy({ passing_percent: 100 }).passing_percent).toBe(75)
    expect(gradePolicy({ point_scale_direction: 'sideways' }).point_scale_direction).toBe('ched')
  })
})

describe('isPassingGrade', () => {
  it('honours a college pass mark on the percentage scale', () => {
    const entry = { passing_percent: 60 }
    expect(isPassingGrade(62, 'ched_percentage', entry)).toBe(true)
    expect(isPassingGrade(62, 'ched_percentage', null)).toBe(false)
  })

  it('keeps DepEd K-12 at 75 whatever the entry says', () => {
    expect(isPassingGrade(74, 'deped_k12', { passing_percent: 60 })).toBe(false)
    expect(isPassingGrade(75, 'deped_k12', { passing_percent: 60 })).toBe(true)
  })

  it('passes at 3.0 in either direction on the point scale', () => {
    expect(isPassingGrade(3.0, 'ched_point', null)).toBe(true)
    expect(isPassingGrade(3.25, 'ched_point', null)).toBe(false)
    expect(isPassingGrade(3.25, 'ched_point', { point_scale_direction: 'inverted' })).toBe(true)
    expect(isPassingGrade(2.75, 'ched_point', { point_scale_direction: 'inverted' })).toBe(false)
  })

  it('is null without a grade', () => {
    expect(isPassingGrade(null, 'deped_k12')).toBeNull()
    expect(passes(null, 'deped_k12')).toBeNull()
  })
})

describe('display', () => {
  it('formats a point grade to two places and everything else to a whole number', () => {
    expect(formatGrade(1.25, 'ched_point')).toBe('1.25')
    expect(formatGrade(82.6, 'deped_k12')).toBe('83')
    expect(formatGrade(null, 'deped_k12')).toBe('—')
  })

  it('says what passing means in the scale\'s own units', () => {
    expect(passNote('deped_k12', null)).toBe('75 passes')
    expect(passNote('ched_percentage', { passing_percent: 60 })).toBe('60 passes')
    expect(passNote('ched_point', null)).toBe('1.00 is highest · 3.00 passes')
    expect(passNote('ched_point', { point_scale_direction: 'inverted' })).toBe('5.00 is highest · 3.00 passes')
  })

  it('does not paint a passing college student red', () => {
    expect(gradeToneKey(1.25, 'ched_point', null)).toBe('success')
    expect(gradeToneKey(3.0, 'ched_point', null)).toBe('warning')
    expect(gradeToneKey(4.0, 'ched_point', null)).toBe('danger')
    expect(gradeToneKey(4.75, 'ched_point', { point_scale_direction: 'inverted' })).toBe('success')
  })

  it('moves the amber band with the pass mark', () => {
    expect(gradeToneKey(70, 'ched_percentage', { passing_percent: 60 })).toBe('warning')
    expect(gradeToneKey(70, 'ched_percentage', null)).toBe('danger')
    expect(gradeTone(70, 'ched_percentage', { passing_percent: 60 }).label).toBe('Satisfactory')
    expect(gradeTone(70, 'ched_percentage', null).label).toBe('Needs work')
  })
})

describe('itemPasses', () => {
  it('reads the pass mark off the entry, not 75', () => {
    expect(itemPasses(13, 20, { passing_percent: 60 })).toBe(true) // 65%
    expect(itemPasses(13, 20, null)).toBe(false)
    expect(itemPasses(null, 20, null)).toBeNull()
    expect(itemPasses(5, 0, null)).toBeNull()
  })
})
