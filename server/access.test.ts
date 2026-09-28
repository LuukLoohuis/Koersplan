import { describe, expect, it } from 'vitest'
import { adminEmails, canCoach, canView, visiblePlans, type AuthUser } from './access'

const admin: AuthUser = { id: 'a', email: 'a@x.nl', role: 'admin' }
const ruud: AuthUser = { id: 'ruud', email: 'ruud@x.nl', role: 'coach' }
const kees: AuthUser = { id: 'kees', email: 'kees@x.nl', role: 'coach' }
const sanne: AuthUser = { id: 'sanne', email: 'sanne@x.nl', role: 'athlete' }

const vanRuud = { coachId: 'ruud', userId: 'sanne' }
const zonderCoach = {}
const demo = { demo: true }

describe('canView', () => {
  it('admin ziet alles', () => {
    for (const a of [vanRuud, zonderCoach, demo]) expect(canView(admin, a)).toBe(true)
  })

  it('coach ziet eigen atleten en de demo, niet die van een ander', () => {
    expect(canView(ruud, vanRuud)).toBe(true)
    expect(canView(ruud, demo)).toBe(true)
    expect(canView(kees, vanRuud)).toBe(false)
    expect(canView(ruud, zonderCoach)).toBe(false)
  })

  it('atleet ziet alleen zichzelf', () => {
    expect(canView(sanne, vanRuud)).toBe(true)
    expect(canView(sanne, { coachId: 'ruud', userId: 'joris' })).toBe(false)
    expect(canView(sanne, demo)).toBe(false)
    expect(canView(sanne, zonderCoach)).toBe(false)
  })
})

describe('canCoach', () => {
  it('alleen admin en de eigen coach sturen bij', () => {
    expect(canCoach(admin, vanRuud)).toBe(true)
    expect(canCoach(ruud, vanRuud)).toBe(true)
    expect(canCoach(kees, vanRuud)).toBe(false)
    expect(canCoach(sanne, vanRuud)).toBe(false)
  })
})

describe('visiblePlans', () => {
  const plans = [{ status: 'concept' }, { status: 'gepubliceerd' }, { status: 'gewijzigd' }]

  it('atleet ziet geen voorstellen die nog bij de coach liggen', () => {
    expect(visiblePlans(sanne, plans).map((p) => p.status)).toEqual(['gepubliceerd', 'gewijzigd'])
  })

  it('coach ziet alles', () => {
    expect(visiblePlans(ruud, plans)).toHaveLength(3)
  })
})

describe('adminEmails', () => {
  it('normaliseert de lijst', () => {
    expect(adminEmails(' Luuk@Voorbeeld.nl, ,b@x.nl ')).toEqual(['luuk@voorbeeld.nl', 'b@x.nl'])
    expect(adminEmails('')).toEqual([])
  })
})
