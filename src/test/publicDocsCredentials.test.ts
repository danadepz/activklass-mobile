/**
 * T-202 (audit F-09): the public setup/tester docs published the literal
 * demo password `pass1234` next to real account identifiers, in a public
 * GitHub repo, for about a month. The accounts have since been rotated, but
 * nothing stops someone pasting the old value back in later thinking it is
 * still a harmless default -- this pins the docs shut against that.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOCS = ['MOBILE_SETUP_INSTRUCTIONS.txt', 'TESTER_APK_AND_MIRRORING_GUIDE.txt']
const LEAKED_PASSWORD = 'pass1234'

describe('public demo docs (T-202, audit F-09)', () => {
  for (const doc of DOCS) {
    it(`${doc} does not publish the leaked demo password`, () => {
      const text = readFileSync(join(__dirname, '../..', doc), 'utf8')
      expect(text).not.toContain(LEAKED_PASSWORD)
    })
  }
})
