import crypto from 'node:crypto'

/**
 * Versleuteling van Intervals-tokens en API-keys in de database (AES-256-GCM).
 * Sleutel: TOKEN_ENCRYPTION_KEY, 32 bytes als base64. Wie de database leest
 * zonder deze sleutel, ziet alleen "v1:…".
 */

function key(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY ontbreekt in .env')
  const k = Buffer.from(raw, 'base64')
  if (k.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY moet 32 bytes zijn (base64)')
  return k
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':')
}

export function decrypt(box: string): string {
  const [v, iv, tag, data] = box.split(':')
  if (v !== 'v1' || !iv || !tag || data === undefined) throw new Error('Onbekend formaat voor versleutelde waarde')
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  d.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
}

/** Ondertekende, verlopende waarde (voor uitnodigingslinks). Sleutel afgeleid van TOKEN_ENCRYPTION_KEY. */
export function sign(payload: object, ttlMs: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs })).toString('base64url')
  return `${body}.${mac(body)}`
}

export function verify<T>(token: string): T | null {
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const want = Buffer.from(mac(body))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null
  const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number }
  return data.exp > Date.now() ? data : null
}

function mac(body: string) {
  const k = crypto.createHmac('sha256', key()).update('veloriq:uitnodiging').digest()
  return crypto.createHmac('sha256', k).update(body).digest('base64url')
}
