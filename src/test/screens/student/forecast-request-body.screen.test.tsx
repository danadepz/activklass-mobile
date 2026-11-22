/**
 * What the phone's forecast card puts in the /api/predict body (2026-11-23):
 * the real predictRisk runs, only the API is stubbed.
 *
 *  - attendance is a PERCENTAGE in and the model's FRACTION out -- 1% is 0.01,
 *    never 100% attendance;
 *  - the attendance trend counts held sessions only, like the rate and the
 *    teacher panel; a day with no session_status is a legacy held day.
 */
import React from 'react'
import { screen } from '@testing-library/react-native'
import { renderScreen } from '../../renderScreen'

const mockApi = jest.fn()
jest.mock('../../../../src/lib/api', () => ({ api: (...args: unknown[]) => mockApi(...args) }))

import ClassStandingForecast from '../../../../src/components/ClassStandingForecast'

const day = (date: string, status: string, session_status?: string) =>
  ({ date, status, ...(session_status ? { session_status } : {}) })
const sixHeld = ['01', '02', '03', '04', '05', '06'].map((d) => day(`2026-03-${d}`, 'present', 'held'))
const body = () => mockApi.mock.calls.at(-1)?.[1]?.body?.indicators

beforeEach(() => {
  mockApi.mockReset()
  mockApi.mockResolvedValue({ status: 'insufficient_data', missing_features: [], supplied_features: [] })
})

async function card(props: Record<string, unknown>) {
  await renderScreen(<ClassStandingForecast studentId="me" grade={80} {...props} />)
  await screen.findByText(/Not enough recorded academic information/)
  return body()
}

describe('forecast request body', () => {
  it.each([
    [0, 0], [0.5, 0.005], [1, 0.01], [50, 0.5], [100, 1], [500 / 7, 5 / 7],
  ])('attendance %s%% is sent as %s', async (pct, fraction) => {
    expect((await card({ attendanceRate: pct })).attendance_rate).toBeCloseTo(fraction, 12)
  })

  it('attendance trend: cancelled and moved-away marks are out, legacy days without a status count', async () => {
    expect((await card({ attendanceLog: [...sixHeld, day('2026-03-07', 'absent', 'cancelled')] })).attendance_trend).toBe(0)
    expect((await card({ attendanceLog: [...sixHeld, day('2026-03-07', 'absent', 'rescheduled')] })).attendance_trend).toBe(0)
    expect((await card({ attendanceLog: [...sixHeld, day('2026-03-07', 'absent')] })).attendance_trend).toBe(-0.5)
  })
})
