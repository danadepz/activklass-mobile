/**
 * T-202 (audit F-09): the public setup/tester docs published the literal
 * demo password `pass1234` next to real account identifiers, in a public
 * GitHub repo, for about a month. The accounts have since been rotated, but
 * nothing stops someone pasting the old value back in later thinking it is
 * still a harmless default -- this pins the docs shut against that.
 *
 * Widened for audit F-03. Pinning two .txt files shut was too narrow: the same
 * literal was still being published by
 *   - `app/login.tsx`, which printed "Default password: pass1234" directly on
 *     the sign-in screen, and
 *   - therefore `index.android.bundle`, so every release APK carried it next
 *     to the login-ID format -- the other half of the credential -- readable
 *     by anyone who installed the app.
 * The docs check alone could never have caught either.
 *
 * Deliberately NOT a repo-wide ban. `src/lib/validation.ts` names the value in
 * a comment explaining why `tempPasswordError` is length-only, and
 * `validation.test.ts` asserts that behaviour with it. Those are internal and
 * correct. What must never carry it is anything a user or an outsider can
 * read: the published docs, the screens, and the shipped bundle.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO = join(__dirname, '../..')
const DOCS = ['MOBILE_SETUP_INSTRUCTIONS.txt', 'TESTER_APK_AND_MIRRORING_GUIDE.txt']
const LEAKED_PASSWORD = 'pass1234'

/** Every screen file under app/ -- the only place user-visible copy lives. */
function screenFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return screenFiles(path)
    return /\.(tsx|ts)$/.test(entry.name) ? [path] : []
  })
}

/**
 * The release JS bundle, when a release build has been made. Gradle writes it
 * to several places on the way into the APK; any copy carrying the literal
 * means the artifact does too.
 */
const BUNDLE_PATHS = [
  'android/app/build/generated/assets/react/release/index.android.bundle',
  'android/app/build/intermediates/assets/release/mergeReleaseAssets/index.android.bundle',
].map((p) => join(REPO, p))

describe('public demo docs (T-202, audit F-09)', () => {
  for (const doc of DOCS) {
    it(`${doc} does not publish the leaked demo password`, () => {
      const text = readFileSync(join(REPO, doc), 'utf8')
      expect(text).not.toContain(LEAKED_PASSWORD)
    })
  }
})

describe('shipped surfaces never state a starting password (audit F-03)', () => {
  it('no screen under app/ prints the default password', () => {
    const offenders = screenFiles(join(REPO, 'app'))
      .filter((path) => readFileSync(path, 'utf8').includes(LEAKED_PASSWORD))
      .map((path) => path.slice(REPO.length + 1))
    // app/login.tsx was the original offender: the hint it rendered shipped in
    // every APK. The teacher hands the password over in person.
    expect(offenders).toEqual([])
  })

  for (const bundle of BUNDLE_PATHS) {
    const label = bundle.slice(REPO.length + 1)
    it(`the release bundle at ${label} does not carry it`, () => {
      if (!existsSync(bundle)) {
        // No release build in this tree -- nothing shipped, nothing to check.
        expect(true).toBe(true)
        return
      }
      const text = readFileSync(bundle, 'latin1')
      expect(
        text.includes(LEAKED_PASSWORD),
        `${label} still contains the starting password. It was built ` +
          `${statSync(bundle).mtime.toISOString()}, before the app/login.tsx fix. ` +
          `Rebuild the release bundle and re-release the APK -- editing the source ` +
          `does not change an artifact that has already been built.`,
      ).toBe(false)
    })
  }
})
