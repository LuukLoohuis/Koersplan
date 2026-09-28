import type { NextFunction, Request, Response } from 'express'
import { adminEmails, LOCAL_USER, type AuthUser, type Role } from './access'
import { check, sb, supabaseEnabled } from './supabase'

/**
 * Inloggen via Supabase Auth (e-maillink). De browser stuurt het access token
 * mee als Bearer; de server controleert het tegen de JWKS van het project en
 * zoekt de rol op in public.profiles. Zonder Supabase is iedereen admin (lokaal).
 */

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser
    }
  }
}

interface ProfileRow {
  id: string
  email: string
  name: string | null
  role: Role
}

const toUser = (p: ProfileRow): AuthUser => ({ id: p.id, email: p.email, role: p.role, name: p.name ?? undefined })

// Rol per gebruiker kort onthouden: anders elke API-aanroep een extra query
const profiles = new Map<string, { at: number; user: AuthUser | null }>()
const TTL = 60_000

async function profileFor(id: string, email: string): Promise<AuthUser | null> {
  const hit = profiles.get(id)
  if (hit && Date.now() - hit.at < TTL) return hit.user
  const row = check(await sb().from('profiles').select('id, email, name, role').eq('id', id).maybeSingle(), 'profiel lezen') as ProfileRow | null
  let user = row ? toUser(row) : null
  // admin uit ADMIN_EMAILS die nog geen profiel heeft (bv. net in het dashboard aangemaakt)
  if (!user && adminEmails().includes(email.toLowerCase())) {
    const made = check(await sb().from('profiles').upsert({ id, email: email.toLowerCase(), role: 'admin' }).select('id, email, name, role').single(), 'profiel aanmaken')
    user = toUser(made as ProfileRow)
  }
  profiles.set(id, { at: Date.now(), user })
  return user
}

/** Zet req.user, of antwoordt 401 (niet ingelogd) / 403 (geen profiel). */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  if (!supabaseEnabled()) {
    req.user = LOCAL_USER
    return next()
  }
  const jwt = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
  if (!jwt) return res.status(401).json({ error: 'Log in om verder te gaan.' })
  sb()
    .auth.getClaims(jwt)
    .then(async ({ data, error }) => {
      const claims = data?.claims as { sub?: string; email?: string } | undefined
      if (error || !claims?.sub) return res.status(401).json({ error: 'Je sessie is verlopen. Log opnieuw in.' })
      const user = await profileFor(claims.sub, claims.email ?? '')
      if (!user) return res.status(403).json({ error: 'Dit account heeft nog geen toegang tot VELORIQ. Vraag je coach om een uitnodiging.' })
      req.user = user
      next()
    })
    .catch(next)
}

/** Alleen voor deze rollen; anders 403. Na requireUser. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) =>
    req.user && roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Dit mag je rol niet.' })

/**
 * Bij het opstarten: elk adres uit ADMIN_EMAILS krijgt een bevestigd account
 * (zonder wachtwoord, inloggen gaat met een e-maillink) en de rol admin.
 */
export async function ensureAdmins() {
  if (!supabaseEnabled()) return
  const emails = adminEmails()
  if (!emails.length) return console.log('  Let op: ADMIN_EMAILS is leeg, niemand kan beheren.')
  const { data, error } = await sb().auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Supabase gebruikers lezen: ${error.message}`)
  for (const email of emails) {
    let user = data.users.find((u) => u.email?.toLowerCase() === email)
    if (!user) {
      const made = await sb().auth.admin.createUser({ email, email_confirm: true })
      if (made.error || !made.data.user) throw new Error(`Admin ${email} aanmaken: ${made.error?.message}`)
      user = made.data.user
      console.log(`  admin-account aangemaakt: ${email}`)
    }
    check(await sb().from('profiles').upsert({ id: user.id, email, role: 'admin' }), 'admin-profiel opslaan')
  }
}
