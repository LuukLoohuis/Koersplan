import type { AthleteOverview, TrainingPlan, Workout } from './types'
import { projectPmc, workoutMetrics, zoneIndex } from './metrics'
import { addDays, daysBetween, round } from './util'

// Dagreeks voor de vormgrafiek: historie (conditie/vermoeidheid/vorm + belasting)
// en vanaf vandaag de projecties van de AI-koers en van de koers na de coach.

export interface HistoryDay {
  date: string
  ctl: number
  atl: number
  tss: number
  workoutName?: string
  /** Prikkel van de training, 1–7 (Z1–Z7) */
  zone?: number
  durationSec?: number
}

export interface PlannedDay {
  date: string
  tss: number
  workoutName: string
}

export interface Projected {
  ctl: number
  atl: number
  tsb: number
  tss: number
  workoutName?: string
}

export interface FormDay {
  date: string
  /** Dagen ten opzichte van vandaag: 0 = vandaag, negatief = verleden */
  i: number
  planned: boolean
  ctl?: number
  atl?: number
  tsb?: number
  tss?: number
  workoutName?: string
  zone?: number
  durationSec?: number
  ai?: Projected
  coach?: Projected
}

export interface FormSeries {
  days: FormDay[]
  /** Dagen historie vóór vandaag */
  past: number
  /** Dagen na vandaag in de reeks */
  horizon: number
  hasAi: boolean
  hasCoach: boolean
}

function loadsOf(plan: PlannedDay[], after: string) {
  const loads = new Map<string, number>()
  const names = new Map<string, string>()
  for (const p of plan) {
    if (p.date <= after) continue
    loads.set(p.date, (loads.get(p.date) ?? 0) + p.tss)
    names.set(p.date, names.has(p.date) ? `${names.get(p.date)} + ${p.workoutName}` : p.workoutName)
  }
  return { loads, names }
}

/**
 * Bouwt de reeks. Vandaag is de laatste dag met historie; projecties starten daar
 * (shared/metrics projectPmc) en lopen tot de laatste geplande dag van die koers.
 * `minHorizon` verlengt alleen de tijdas (bv. tot een doel).
 */
export function buildFormSeries(history: HistoryDay[], planAi: PlannedDay[] = [], planCoach: PlannedDay[] = [], minHorizon = 0): FormSeries {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date))
  if (!sorted.length) return { days: [], past: 0, horizon: 0, hasAi: false, hasCoach: false }
  // aaneengesloten dagen: een ontbrekende dag neemt conditie/vermoeidheid van de vorige over, zonder belasting
  const hist: HistoryDay[] = [sorted[0]]
  for (const h of sorted.slice(1)) {
    const prev = hist[hist.length - 1]
    if (h.date === prev.date) continue
    for (let d = addDays(prev.date, 1); d < h.date; d = addDays(d, 1)) hist.push({ date: d, ctl: prev.ctl, atl: prev.atl, tss: 0 })
    hist.push(h)
  }
  const t = hist[hist.length - 1]
  const ai = loadsOf(planAi, t.date)
  const coach = loadsOf(planCoach, t.date)
  const lastOf = (m: Map<string, number>) => [...m.keys()].reduce((a, d) => (d > a ? d : a), t.date)
  const aiDays = daysBetween(t.date, lastOf(ai.loads))
  const coachDays = daysBetween(t.date, lastOf(coach.loads))
  const horizon = Math.max(aiDays, coachDays, minHorizon)
  const start = { date: t.date, ctl: t.ctl, atl: t.atl }
  // elke projectie stopt op de laatste geplande dag van die koers; daarna geen aanname over rust
  const projAi = aiDays ? projectPmc(start, ai.loads, aiDays) : []
  const projCoach = coachDays ? projectPmc(start, coach.loads, coachDays) : []

  const days: FormDay[] = hist.map((h) => ({
    date: h.date,
    i: daysBetween(t.date, h.date),
    planned: false,
    ctl: h.ctl,
    atl: h.atl,
    tsb: round(h.ctl - h.atl, 1),
    tss: h.tss,
    workoutName: h.workoutName,
    zone: h.zone,
    durationSec: h.durationSec,
  }))
  for (let k = 0; k < horizon; k++) {
    const date = addDays(t.date, k + 1)
    const day: FormDay = { date, i: k + 1, planned: true }
    const a = projAi[k]
    const c = projCoach[k]
    if (a) day.ai = { ctl: a.ctl, atl: a.atl, tsb: a.tsb, tss: a.load ?? 0, workoutName: ai.names.get(date) }
    if (c) day.coach = { ctl: c.ctl, atl: c.atl, tsb: c.tsb, tss: c.load ?? 0, workoutName: coach.names.get(date) }
    days.push(day)
  }
  return { days, past: hist.length - 1, horizon, hasAi: projAi.length > 0, hasCoach: projCoach.length > 0 }
}

/** Historie uit een overzicht: CTL/ATL uit wellness, belasting en prikkel uit de activiteiten van die dag. */
export function historyFromOverview(ov: Pick<AthleteOverview, 'wellness' | 'activities'>, until?: string): HistoryDay[] {
  const byDate = new Map<string, { tss: number; names: string[]; dur: number; top: number; zone?: number }>()
  for (const a of ov.activities) {
    const d = byDate.get(a.date) ?? { tss: 0, names: [], dur: 0, top: -1 }
    d.tss += a.load
    d.dur += a.movingTimeSec
    d.names.push(a.name)
    if (a.load > d.top) {
      d.top = a.load
      d.zone = a.intensity != null ? zoneIndex(a.intensity) + 1 : undefined
    }
    byDate.set(a.date, d)
  }
  return ov.wellness
    .filter((w) => !until || w.date <= until)
    .map((w) => {
      const d = byDate.get(w.date)
      return {
        date: w.date,
        ctl: w.ctl,
        atl: w.atl,
        tss: round(d?.tss ?? 0),
        workoutName: d?.names.join(' + '),
        zone: d?.zone,
        durationSec: d?.dur,
      }
    })
}

/** Geplande dagen uit workouts (TSS via workoutMetrics) plus reeds geplande belasting uit intervals.icu. */
export function plannedDays(workouts: Workout[], ftp: number, extra: AthleteOverview['plannedLoad'] = []): PlannedDay[] {
  const out: PlannedDay[] = workouts
    .filter((w) => w.stimulus !== 'Rust')
    .map((w) => ({ date: w.date, tss: workoutMetrics(w.sections, ftp).tss, workoutName: w.name }))
  for (const e of extra) out.push({ date: e.date, tss: e.load, workoutName: e.name })
  return out.filter((p) => p.tss > 0)
}

/**
 * Welke koers is van wie. Een concept is een voorstel dat nog niet bevestigd is;
 * `planAiSource` zegt wie het maakte (AI of de regelgenerator). Een gepubliceerd blok
 * is door de coach bevestigd. De atleet ziet alleen bevestigde koersen: concepten
 * gaan pas naar de atleet als de coach publiceert. Beide koersen krijgen de reeds
 * geplande intervals.icu-belasting erbij.
 */
export function plansForForm(ov: AthleteOverview, plans: TrainingPlan[], audience: 'coach' | 'atleet' = 'coach') {
  const concept = audience === 'coach' ? plans.find((p) => p.status === 'concept') : undefined
  const confirmed = plans.find((p) => p.status !== 'concept')
  const ftp = ov.athlete.ftp
  return {
    planAi: concept ? plannedDays(concept.workouts, ftp, ov.plannedLoad) : [],
    planAiSource: concept?.source ?? 'ai',
    planCoach: confirmed ? plannedDays(confirmed.workouts, ftp, ov.plannedLoad) : [],
  }
}

/** Helling (CTL-verandering) per week, oudste eerst; de laatste week eindigt vandaag. */
export function weeklyRamp(s: FormSeries, weeks = 17): number[] {
  const out: number[] = []
  const t = s.past
  for (let w = weeks; w >= 1; w--) {
    const a = s.days[t - w * 7]
    const b = s.days[t - (w - 1) * 7]
    if (a?.ctl != null && b?.ctl != null) out.push(round(b.ctl - a.ctl, 1))
  }
  return out
}

/** TSS en duur per week (gereden), oudste eerst. */
export function weeklyLoad(s: FormSeries, weeks = 17): { tss: number; durationSec: number }[] {
  const out: { tss: number; durationSec: number }[] = []
  const t = s.past
  for (let w = weeks; w >= 1; w--) {
    const from = t - w * 7 + 1
    if (from < 0) continue
    let tss = 0
    let durationSec = 0
    for (let q = 0; q < 7; q++) {
      const d = s.days[from + q]
      tss += d?.tss ?? 0
      durationSec += d?.durationSec ?? 0
    }
    out.push({ tss: round(tss), durationSec })
  }
  return out
}
