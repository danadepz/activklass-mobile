import React from 'react'
import { screen } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'

const mockPredictRisk = jest.fn()
jest.mock('../../../../src/lib/risk', () => ({
  predictRisk: (...args: unknown[]) => mockPredictRisk(...args),
  riskReasons: () => [],
  READABLE_FEATURE: { quiz_trend: 'how your quiz scores have changed' },
}))

import ClassStandingForecast from '../../../../src/components/ClassStandingForecast'

describe('student risk forecast screen', () => {
  it('shows insufficient data without an on-track verdict or percentage', async () => {
    mockPredictRisk.mockResolvedValue({
      status: 'insufficient_data', flag: null, atRisk: false, probability: null,
      supplied: ['prior_average_grade'], missing: ['quiz_trend'], coverage: 0.26,
      signals: [], globalFactors: [], training: null,
    })
    await renderScreen(<ClassStandingForecast studentId="student-1" grade={80} />)

    expect(await screen.findByText(/Not enough recorded academic information/)).toBeTruthy()
    expect(screen.getByText(/Still needed: how your quiz scores have changed/)).toBeTruthy()
    expect(screen.queryByText('On track')).toBeNull()
    expect(screen.queryByText('Needs attention')).toBeNull()
    expect(screen.queryByText(/\d+%/)).toBeNull()
  })
})
