/**
 * Wie mag wat. Eén plek, zonder database, zodat de regels te testen zijn.
 *
 * - admin: alles.
 * - coach: eigen atleten (coach_id) en de demo-atleten.
 * - atleet: alleen zichzelf, en geen voorstellen die nog bij de coach liggen.
 */

import type { Me } from '../shared/types'

export type AuthUser = Me
export type Role = Me['role']

/** Wat de regels van een atleet moeten weten. */
export interface Owned {
  coachId?: string
  userId?: string
  demo?: boolean
}

/** Zonder Supabase (lokaal, zonder login) is iedereen admin. */
export const LOCAL_USER: AuthUser = { id: 'lokaal', email: 'lokaal', role: 'admin' }

/** Mag de gebruiker de atleet zien: data, koersen, portaal. */
export function canView(u: AuthUser, a: Owned): boolean {
  if (u.role === 'admin') return true
  if (u.role === 'coach') return a.demo === true || (!!a.coachId && a.coachId === u.id)
  return !a.demo && !!a.userId && a.userId === u.id
}

/** Mag de gebruiker voor de atleet koersen uitzetten, bijsturen, bevestigen en de koppeling beheren. */
export function canCoach(u: AuthUser, a: Owned): boolean {
  if (u.role === 'admin') return true
  return u.role === 'coach' && canView(u, a)
}

/** Een atleet ziet alleen koersen die de coach heeft bevestigd. */
export function visiblePlans<T extends { status: string }>(u: AuthUser, plans: T[]): T[] {
  return u.role === 'athlete' ? plans.filter((p) => p.status !== 'concept') : plans
}

/** Adressen uit ADMIN_EMAILS, genormaliseerd. */
export function adminEmails(raw = process.env.ADMIN_EMAILS ?? ''): string[] {
  return raw
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
}
