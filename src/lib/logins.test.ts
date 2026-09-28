/**
 * The sign-in field takes two kinds of identifier, and the demo student is the
 * second kind: `srnhs-200012`, not an email. These pin what the screen does
 * with each, so the '@'-only check that locked every issued account out
 * cannot come back.
 */
import { describe, expect, it } from 'vitest'
import { INTERNAL_LOGIN_SUFFIX, isIssuedLoginId, toAuthEmail, wrongCredentialMessage } from './logins'

describe('toAuthEmail', () => {
  it('appends the internal suffix to an issued login', () => {
    expect(toAuthEmail('srnhs-200012')).toBe(`srnhs-200012${INTERNAL_LOGIN_SUFFIX}`)
  })

  it('lower-cases and trims an issued login, so a phone keyboard cannot break it', () => {
    expect(toAuthEmail('  SRNHS-200012 ')).toBe(`srnhs-200012${INTERNAL_LOGIN_SUFFIX}`)
  })

  it('passes a real email through untouched apart from trimming', () => {
    expect(toAuthEmail(' demo.parent.mendoza@gmail.com ')).toBe('demo.parent.mendoza@gmail.com')
  })
})

describe('isIssuedLoginId', () => {
  it('recognises the shape the school mints', () => {
    expect(isIssuedLoginId('srnhs-200012')).toBe(true)
    expect(isIssuedLoginId('SNHS-123456')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isIssuedLoginId('carlo')).toBe(false)
    expect(isIssuedLoginId('s-12345')).toBe(false)
    expect(isIssuedLoginId('a@b.c')).toBe(false)
    expect(isIssuedLoginId('')).toBe(false)
  })
})

describe('wrongCredentialMessage', () => {
  it('blames the credentials when the identifier is a plausible login or email', () => {
    expect(wrongCredentialMessage('srnhs-200012')).toMatch(/^Incorrect login or password\./)
    expect(wrongCredentialMessage('x@y.z')).toMatch(/^Incorrect login or password\./)
  })

  it('says the identifier is the problem when it is neither', () => {
    expect(wrongCredentialMessage('carlo')).toMatch(/^That is not an email address or a login ID\./)
  })

  it('never names a vendor', () => {
    for (const id of ['carlo', 'srnhs-200012', 'x@y.z']) {
      expect(wrongCredentialMessage(id)).not.toMatch(/firebase|firestore/i)
    }
  })
})
