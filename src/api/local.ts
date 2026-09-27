import type { Api } from './index'
import type { TrainingPlan } from '@shared/types'
import { demoOverview, DEMO_IDS } from '@shared/demoData'
import { generateRuleBased } from '@shared/generator'
import { toIntervalsEvents } from '@shared/intervalsText'
import { seedDemoPlan } from '@shared/seed'

/**
 * Volledig in-browser implementatie voor de statische demo (geen server,
 * geen intervals.icu, regelgebaseerde generator). Publiceren wordt gesimuleerd.
 */
const plans = new Map<string, TrainingPlan>()
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms))

const seeded = seedDemoPlan(demoOverview('demo-sanne')!.athlete)
plans.set(seeded.id, seeded)

export const localApi: Api = {
  async config() {
    return { mode: 'static-demo', oauthEnabled: false, apiKeyEnabled: false, aiEnabled: false }
  },
  async athletes() {
    return DEMO_IDS.map((id) => demoOverview(id)!.athlete)
  },
  async overview(id) {
    const o = demoOverview(id)
    if (!o) throw new Error('Atleet niet gevonden')
    return o
  },
  async addAthlete() {
    throw new Error('In de demo kun je geen echte atleten koppelen. Draai de app lokaal met je intervals.icu-gegevens.')
  },
  async plans(athleteId) {
    return [...plans.values()].filter((p) => p.athleteId === athleteId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone)
  },
  async generate(athleteId, req) {
    await wait(700)
    const plan = generateRuleBased(req, demoOverview(athleteId)!.athlete)
    plans.set(plan.id, plan)
    return {
      plan: clone(plan),
      warning: 'Demo: dit concept komt uit de regelgebaseerde generator. Met een Claude API-key schrijft de AI het blok.',
    }
  },
  async savePlan(p) {
    const prev = plans.get(p.id)
    const next = { ...clone(p), status: prev?.status === 'concept' ? 'concept' : 'gewijzigd' } as TrainingPlan
    plans.set(p.id, next)
    return clone(next)
  },
  async deletePlan(id) {
    plans.delete(id)
  },
  async publish(planId) {
    await wait(600)
    const p = plans.get(planId)!
    const ftp = demoOverview(p.athleteId)!.athlete.ftp
    const events = toIntervalsEvents(p, ftp)
    const next = { ...p, status: 'gepubliceerd' as const, publishedAt: new Date().toISOString() }
    plans.set(planId, next)
    return {
      plan: clone(next),
      result: {
        ok: true,
        simulated: true,
        created: events.length,
        message: `Demo: ${events.length} workouts klaargezet (gesimuleerd). In de echte app gaan ze naar de intervals.icu-kalender van de atleet.`,
        payloadPreview: events,
      },
    }
  },
  async feedback(planId, wid, fb) {
    const p = plans.get(planId)!
    const w = p.workouts.find((x) => x.id === wid)!
    w.feedback = { ...fb, at: new Date().toISOString() }
    return clone(p)
  },
}
