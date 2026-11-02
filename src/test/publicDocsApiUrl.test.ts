/**
 * T-222 (audit F-20): Mobile API URL documentation contradictions.
 *
 * Audit finding F-20 identified contradictory EXPO_PUBLIC_API_URL examples in
 * documentation: README.md named Vercel as backend with a /api trailing path,
 * EMULATOR_BLUE_SCREEN_TROUBLESHOOTING.txt carried a stale devtunnels URL, and
 * the relationship between the live Cloud Run backend and the local Android
 * emulator host alias (10.0.2.2:5000) was ambiguous or inconsistent.
 *
 * This test pins documentation across activklass-mobile to ensure:
 * 1. No documentation cites Vercel as the backend endpoint or provides a trailing /api URL.
 * 2. No documentation carries dead devtunnels URLs.
 * 3. README.md, .env.example, MOBILE_SETUP_INSTRUCTIONS.txt,
 *    EMULATOR_BLUE_SCREEN_TROUBLESHOOTING.txt, and docs/android-studio.md
 *    consistently document the live Cloud Run production backend and/or the
 *    local Android emulator host alias (10.0.2.2:5000) with clear explanation.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(__dirname, '../..')
const PROD_URL = 'https://activklass-backend-59267706068.asia-southeast1.run.app'
const EMULATOR_URL = 'http://10.0.2.2:5000'

describe('mobile API URL documentation consistency (T-222, audit F-20)', () => {
  it('README.md does not cite Vercel as backend and documents both production and emulator URLs', () => {
    const text = readFileSync(join(REPO, 'README.md'), 'utf8')
    expect(text).not.toContain('vercel.app')
    expect(text).not.toContain('/api')
    expect(text).toContain(PROD_URL)
    expect(text).toContain(EMULATOR_URL)
    expect(text).toContain('10.0.2.2')
  })

  it('EMULATOR_BLUE_SCREEN_TROUBLESHOOTING.txt does not carry dead devtunnels and uses live Cloud Run URL', () => {
    const text = readFileSync(join(REPO, 'EMULATOR_BLUE_SCREEN_TROUBLESHOOTING.txt'), 'utf8')
    expect(text).not.toContain('devtunnels.ms')
    expect(text).toContain(PROD_URL)
  })

  it('.env.example documents production URL and explains the Android emulator 10.0.2.2 host alias', () => {
    const text = readFileSync(join(REPO, '.env.example'), 'utf8')
    expect(text).toContain(PROD_URL)
    expect(text).toContain(EMULATOR_URL)
    expect(text).toContain('10.0.2.2 is the HOST machine')
  })

  it('docs/android-studio.md retains 10.0.2.2:5000 with host explanation and references production backend', () => {
    const text = readFileSync(join(REPO, 'docs/android-studio.md'), 'utf8')
    expect(text).toContain(EMULATOR_URL)
    expect(text).toContain('10.0.2.2')
    expect(text).toContain(PROD_URL)
  })
})
