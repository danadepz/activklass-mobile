import { describe, expect, it, vi } from 'vitest'
const getDoc = vi.fn()
vi.mock('firebase/firestore', () => ({ collection: vi.fn(), doc: vi.fn(), getDoc: (...args: any[]) => getDoc(...args), getDocs: vi.fn(), query: vi.fn(), where: vi.fn() }))
vi.mock('../config/firebase', () => ({ db: {} }))
const { loadClassPerformance } = await import('./parentRecords')
describe('TC-GRADE-27: guardian assessment scores', () => {
  it.each([16, 0, null])('maps a stored score of %s into the screen payload', async (raw_score) => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ assessments: [{ id: 'a', raw_score, total_points: 20 }] }) })
    const result = await loadClassPerformance('student', 'class')
    expect(result?.assessments[0].student_score).toBe(raw_score)
  })
})
