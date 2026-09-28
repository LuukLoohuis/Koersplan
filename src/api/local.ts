import type { Api } from './index'
import type { TrainingPlan } from '@shared/types'
import { demoOverview, DEMO_IDS } from '@shared/demoData'
import { generateRuleBased } from '@shared/generator'
import { toIntervalsEvents } from '@shared/intervalsText'
import { seedDemoConcept, seedDemoPlan } from '@shared/seed'
import { confirmPlan, mergePlanUpdate, overlapMessage, overlapping, recordFeedback, rosterExtras } from '@shared/review'
import { today } from '@shared/util'

/**
 * Volledig in-browser implementatie voor de statische demo (geen server,
 * geen intervals.icu, regelgebaseerde generator). Publiceren wordt gesimuleerd.
 */
const plans = new Map<string, TrainingPlan>()
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))
const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms))

const seeded = seedDemoPlan(demoOverview('demo-sanne')!.athlete)
plans.set(seeded.id, seeded)
const concept = seedDemoConcept(demoOverview('demo-joris')!.athlete)
plans.set(concept.id, concept)
const plansOf = (athleteId: string) => [...plans.values()].filter((p) => p.athleteId === athleteId)

export const localApi: Api = {
  async config() {
    return { mode: 'static-demo', oauthEnabled: false, apiKeyEnabled: false, aiEnabled: false, coachName: 'Ruud' }
  },
  async athletes() {
    return DEMO_IDS.map((id) => {
      const o = demoOverview(id)!
      return { ...o.athlete, ...rosterExtras(o.activities, plansOf(id), today(), o.athlete.ftp) }
    })
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
    return plansOf(athleteId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(clone)
  },
  async generate(athleteId, { replaces, ...req }) {
    const replaceable = () => {
      const old = replaces ? plans.get(replaces) : undefined
      if (replaces && (!old || old.athleteId !== athleteId)) throw new Error('Dit voorstel is al vervangen of verwijderd; er is geen nieuw voorstel gemaakt.')
      if (old && old.status !== 'concept') throw new Error('Deze koers is intussen bevestigd; er is geen nieuw voorstel gemaakt.')
      return old
    }
    replaceable()
    await wait(700)
    const plan = generateRuleBased(req, demoOverview(athleteId)!.athlete)
    const old = replaceable()
    if (old) {
      plan.note = old.note
      plans.delete(old.id)
    }
    plans.set(plan.id, plan)
    return {
      plan: clone(plan),
      warning: 'Demo: dit concept komt uit de regelgebaseerde generator. Met een Claude API-key schrijft de AI het blok.',
      replaced: old?.id,
    }
  },
  async savePlan(p) {
    const prev = plans.get(p.id)
    if (!prev) throw new Error('Plan niet gevonden')
    const next = mergePlanUpdate(prev, clone(p))
    plans.set(p.id, next)
    return clone(next)
  },
  async deletePlan(id) {
    plans.delete(id)
  },
  async publish(planId) {
    await wait(600)
    // na het wachten kijken (daarna gebeurt alles in één keer): de koers kan intussen weg of bevestigd zijn
    const p = plans.get(planId)
    if (!p) throw new Error('Deze koers is tijdens het bevestigen verwijderd.')
    const clash = overlapping(plansOf(p.athleteId), p, today())
    if (clash.length) throw new Error(overlapMessage(clash))
    const ftp = demoOverview(p.athleteId)!.athlete.ftp
    const events = toIntervalsEvents(p, ftp)
    const by = demoOverview(p.athleteId)!.athlete.subscription === 'ai' ? undefined : 'Ruud'
    const next = { ...confirmPlan(p, by, new Date().toISOString(), false), publishedExternalIds: events.map((e) => e.external_id) }
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
    const p = plans.get(planId)
    const next = p && recordFeedback(p, wid, { ...fb, at: new Date().toISOString() })
    if (!next) throw new Error('Workout niet gevonden')
    plans.set(planId, next)
    return clone(next)
  },
}
