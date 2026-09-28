/**
 * Mirror of activklass-web/src/routes/student/scaffolding.test.js, plus the
 * mastery arithmetic the web covers elsewhere. If a case here disagrees with
 * the web's, the port has drifted -- fix the port, not the test.
 */
import { describe, expect, it } from 'vitest'
import {
  BUCKETS,
  bucketOf,
  findTopic,
  markdownToPlain,
  masteryOf,
  quizTotalPoints,
  remediationQuizzes,
  resourceState,
  topicLocation,
  topicMastery,
  topicRoute,
} from './scaffolding'

const syllabus = {
  modules: [
    { id: 'm1', title: 'Number Sense', topics: [{ id: 't1', title: 'Fractions' }] },
    {
      id: 'm2',
      title: 'Data Structures',
      topics: [
        { id: 't2', title: 'Arrays', resources: [] },
        {
          id: 't3',
          title: 'Linked Lists',
          resources: [
            { id: 'r1', resource_type: 'link', url: 'https://x' },
            { id: 'r2', resource_type: 'rich_text', content_markdown: 'hi' },
          ],
        },
      ],
    },
  ],
}

describe('scaffolding — where a scaffolded topic sits in the modules', () => {
  it('finds the topic with its module and 1-based positions', () => {
    const found = findTopic(syllabus, 't3')!
    expect(found.module.id).toBe('m2')
    expect(found.topic.id).toBe('t3')
    expect(found.moduleNo).toBe(2)
    expect(found.topicNo).toBe(2)
  })

  it('labels the location the way the Modules tab does', () => {
    const loc = topicLocation(syllabus, 't3')!
    expect(loc.moduleLabel).toBe('Module 2')
    expect(loc.moduleTitle).toBe('Data Structures')
    expect(loc.topicLabel).toBe('Sub-module 2')
    expect(loc.topicTitle).toBe('Linked Lists')
    expect(loc.resourceCount).toBe(2)
  })

  it('falls back to the positional name when a title is blank', () => {
    const syl = { modules: [{ id: 'm', title: '', topics: [{ id: 't', title: '' }] }] }
    const loc = topicLocation(syl, 't')!
    expect(loc.moduleTitle).toBe('Module 1')
    expect(loc.topicTitle).toBe('Sub-module 1')
  })

  it('is null for a missing topic, a missing syllabus, or no topic id', () => {
    expect(topicLocation(syllabus, 'nope')).toBeNull()
    expect(topicLocation(null, 't1')).toBeNull()
    expect(topicLocation(syllabus, null)).toBeNull()
  })

  it('numbers modules as the student sees them, after unpublished ones are filtered', () => {
    const filtered = { modules: syllabus.modules.filter((m) => m.id !== 'm1') }
    expect(topicLocation(filtered, 't2')!.moduleLabel).toBe('Module 1')
  })

  it('builds the route the class screen reads', () => {
    expect(topicRoute('c9', 't3')).toEqual({ pathname: '/student/class/c9', params: { tab: 'topics', topic: 't3' } })
    expect(topicRoute('c9', null)).toEqual({ pathname: '/student/class/c9', params: { tab: 'topics' } })
  })
})

describe('scaffolding — whether a resource opens', () => {
  it('opens an uploaded file by its download URL, and explains one that never uploaded', () => {
    expect(resourceState({ resource_type: 'file', url: 'https://firebasestorage.googleapis.com/x.pdf' })).toEqual({ available: true })
    const dead = resourceState({ resource_type: 'file', url: '' })
    expect(dead.available).toBe(false)
    expect(dead.reason).toMatch(/never uploaded/)
  })

  it('needs an address for a link and text for a study note', () => {
    expect(resourceState({ resource_type: 'link', url: 'https://x' }).available).toBe(true)
    expect(resourceState({ resource_type: 'link', url: '' }).available).toBe(false)
    expect(resourceState({ resource_type: 'rich_text', content_markdown: ' ' }).available).toBe(false)
    expect(resourceState({ resource_type: 'video' }).available).toBe(false)
  })
})

describe('scaffolding — mastery is derived from attempts, never stored', () => {
  const quiz = (id: string, topic_id: string | null, points = 5, n = 2) => ({
    id,
    topic_id,
    title: `Quiz ${id}`,
    status: 'published',
    questions: Array.from({ length: n }, () => ({ points })),
  })

  it('buckets at 60 and 80, and treats no attempt as its own state', () => {
    expect(bucketOf(null)).toBe('none')
    expect(bucketOf(0)).toBe('needs')
    expect(bucketOf(59)).toBe('needs')
    expect(bucketOf(60)).toBe('developing')
    expect(bucketOf(79)).toBe('developing')
    expect(bucketOf(80)).toBe('mastered')
    expect(BUCKETS.developing.label).toBe('Developing')
    expect(BUCKETS.none.label).toBe('Not attempted')
  })

  it('takes the best scored attempt across every quiz linked to the topic', () => {
    const quizzes = [quiz('q1', 't3'), quiz('q2', 't3'), quiz('q3', 't1')]
    const attempts = {
      q1: [{ total_score: 4 }, { total_score: 7 }], // 40%, 70%
      q2: [{ total_score: 8 }], // 80%
      q3: [{ total_score: 10 }], // another topic
    }
    const m = topicMastery('t3', quizzes, attempts)
    expect(m.pct).toBe(80)
    expect(m.attempts).toBe(3)
    expect(m.bucket).toBe('mastered')
    expect(m.quizzes.map((q) => q.id)).toEqual(['q1', 'q2'])
  })

  it('ignores open and unmarked attempts, and a quiz with no points', () => {
    const quizzes = [quiz('q1', 't3'), { ...quiz('q0', 't3'), questions: [] }]
    const m = topicMastery('t3', quizzes, { q1: [{ total_score: null }, { total_score: 6 }], q0: [{ total_score: 3 }] })
    expect(m.pct).toBe(60)
    expect(m.attempts).toBe(1)
  })

  it('falls back to total_possible when the questions carry no points', () => {
    expect(quizTotalPoints({ id: 'q', questions: [{}, {}], total_possible: 20 })).toBe(20)
    expect(quizTotalPoints({ id: 'q', questions: [{ points: 3 }, { points: 2 }], total_possible: 20 })).toBe(5)
  })

  it('reads 76% as Developing, the figure the brief quotes', () => {
    const q = quiz('q1', 't3', 1, 100)
    const m = masteryOf([q], { q1: [{ total_score: 76 }] })
    expect(`${BUCKETS[m.bucket].label} · ${m.pct}%`).toBe('Developing · 76%')
  })

  it('offers the pinned quiz first when it is not linked by topic', () => {
    const quizzes = [quiz('q1', 't3'), quiz('q9', null)]
    const r = { topic_id: 't3', recommended_quiz_id: 'q9' }
    expect(remediationQuizzes(r, quizzes).map((q) => q.id)).toEqual(['q9', 'q1'])
    expect(remediationQuizzes({ topic_id: 't3', recommended_quiz_id: 'q1' }, quizzes).map((q) => q.id)).toEqual(['q1'])
    expect(remediationQuizzes({ topic_id: null, recommended_quiz_id: null }, quizzes)).toEqual([])
  })
})

describe('markdownToPlain', () => {
  it('strips the markup and keeps the words', () => {
    const md = '# Reading the table\n\nEvery box carries **two** numbers.\n\n- protons\n- [link](https://x)'
    expect(markdownToPlain(md)).toBe('Reading the table\n\nEvery box carries two numbers.\n\n• protons\n• link (https://x)')
  })
})
