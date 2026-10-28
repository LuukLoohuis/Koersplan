import crypto from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { decrypt, encrypt, sign, verify } from './crypto'

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64')
})

describe('encrypt/decrypt', () => {
  it('geeft de oorspronkelijke waarde terug', () => {
    const box = encrypt('geheim-token')
    expect(box.startsWith('v1:')).toBe(true)
    expect(box).not.toContain('geheim-token')
    expect(decrypt(box)).toBe('geheim-token')
  })

  it('maakt elke keer een andere versleuteling', () => {
    expect(encrypt('x')).not.toBe(encrypt('x'))
  })

  it('weigert een aangepaste waarde', () => {
    const [v, iv, tag, data] = encrypt('geheim').split(':')
    const flipped = Buffer.from(data, 'base64')
    flipped[0] ^= 1
    expect(() => decrypt([v, iv, tag, flipped.toString('base64')].join(':'))).toThrow()
  })
})

describe('sign/verify', () => {
  it('leest een geldige uitnodiging', () => {
    expect(verify<{ coachId: string }>(sign({ coachId: 'c1' }, 60_000))?.coachId).toBe('c1')
  })

  it('weigert een verlopen of aangepaste uitnodiging', () => {
    expect(verify(sign({ coachId: 'c1' }, -1))).toBeNull()
    const [, sig] = sign({ coachId: 'c1' }, 60_000).split('.')
    const forged = Buffer.from(JSON.stringify({ coachId: 'c2', exp: Date.now() + 60_000 })).toString('base64url')
    expect(verify(`${forged}.${sig}`)).toBeNull()
    expect(verify('rommel')).toBeNull()
  })
})
