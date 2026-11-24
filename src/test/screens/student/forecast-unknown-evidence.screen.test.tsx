/**
 * A failed excusal or attempt read must reach the model as an ABSENT
 * missing-work rate (so the result is Insufficient Data), never as a rate that
 * counts an excused or attempted quiz as missed (2026-11-23).
 */
import React from 'react'
import { screen } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'

const mockPredictRisk = jest.fn()
jest.mock('../../../../src/lib/risk', () => ({
  predictRisk: (...args: unknown[]) => mockPredictRisk(...args),
  riskReasons: () => [],
  READABLE_FEATURE: { missing_work_rate: 'how much of your work is missing' },
}))

import ClassStandingForecast from '../../../../src/components/ClassStandingForecast'

const closed = [{ id: 'q1', status: 'closed' }, { id: 'q2', status: 'closed' }]
const sent = () => mockPredictRisk.mock.calls.at(-1)?.[0]

beforeEach(() => {
  mockPredictRisk.mockReset()
  mockPredictRisk.mockResolvedValue({
    status: 'insufficient_data', flag: null, atRisk: false, probability: null,
    supplied: [], missing: ['missing_work_rate'], coverage: 0.5, signals: [], globalFactors: [], training: null,
  })
})

describe('forecast with unknown quiz evidence', () => {
  it('excusal read failed: no missing-work rate is sent, and the card says insufficient data', async () => {
    await renderScreen(
      <ClassStandingForecast studentId="me" grade={80} quizzes={closed} attemptedQuizIds={new Set(['q1'])}
        assessments={[]} excusedQuizIds={undefined} />
    )
    expect(await screen.findByText(/Not enough recorded academic information/)).toBeTruthy()
    expect(sent().missingWorkRate).toBeUndefined()
    expect(screen.queryByText('Needs attention')).toBeNull()
  })

  it('excusals known: q2 excused sends 0, not 0.5', async () => {
    await renderScreen(
      <ClassStandingForecast studentId="me" grade={80} quizzes={closed} attemptedQuizIds={new Set(['q1'])}
        assessments={[]} excusedQuizIds={new Set(['q2'])} />
    )
    await screen.findByText(/Not enough recorded academic information/)
    expect(sent().missingWorkRate).toBe(0)
  })

  it('attempt read failed: no rate, rather than every closed quiz counted as missed', async () => {
    await renderScreen(
      <ClassStandingForecast studentId="me" grade={80} quizzes={closed} attemptedQuizIds={undefined}
        assessments={[]} excusedQuizIds={new Set()} />
    )
    await screen.findByText(/Not enough recorded academic information/)
    expect(sent().missingWorkRate).toBeUndefined()
  })
})
