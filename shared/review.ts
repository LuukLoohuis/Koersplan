import type { Activity, FeedbackEntry, FeedbackRecord, TrainingPlan, TrainingStatus, Workout } from './types'
import { workoutMetrics } from './metrics'
import { workoutDescription } from './intervalsText'
import { addDays, fmtDate, mondayOf, round } from './util'

// Koers reviewen: "was → wordt" tussen het uitgezette voorstel en de koers van de coach,
// het statusmodel per training en de cijfers voor Mijn atleten.

export const cloneWorkouts = (ws: Workout[]): Workout[] => JSON.parse(JSON.stringify(ws))

/** Duur als u:mm, zoals op de fietscomputer (eerst afgerond op hele minuten, dus nooit ":60"). */
export const fmtHm = (sec: number) => {
  const m = Math.round(sec / 60)
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Duur → minuten; iets anders → null.
 * - u:mm zoals op de fietscomputer: "1:15", "1u15", "1.45" (twee cijfers, onder de 60)
 * - uren: "1u", "1,5", "1.5u" (één cijfer achter de komma)
 * - minuten: "75", "75 min"
 * "1,25" is dubbelzinnig (1:25 of 1¼ uur) en telt niet.
 */
export function parseMinutes(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, '')
  const hm = /^(\d{1,2})[:uh.](\d{2})$/.exec(t)
  if (hm) return Number(hm[2]) < 60 ? Number(hm[1]) * 60 + Number(hm[2]) : null
  const h = /^(\d{1,2})(?:[.,](\d))?(?:u|uur|h)$/.exec(t) ?? /^(\d{1,2})[.,](\d)$/.exec(t)
  if (h) return Math.round((Number(h[1]) + Number(h[2] ?? 0) / 10) * 60)
  const m = /^(\d{1,3})(?:m|min)?$/.exec(t)
  return m ? Number(m[1]) : null
}

export const planEnd = (p: Pick<TrainingPlan, 'startDate' | 'weeks'>) => addDays(mondayOf(p.startDate), Math.max(1, p.weeks.length) * 7 - 1)

// ── was → wordt ─────────────────────────────────────────────

export interface FieldChange {
  label: 'Training' | 'Duur' | 'TSS' | 'Intensiteit' | 'Opbouw'
  was?: string
  wordt?: string
}

export interface DayChange {
  date: string
  kind: 'gewijzigd' | 'toegevoegd' | 'verwijderd'
  fields: FieldChange[]
}

/** Een rit: een training die naar Intervals.icu gaat (geen rustdag, niet leeg). */
export const isRide = (w?: Workout) => (w && w.stimulus !== 'Rust' && w.sections.length ? w : undefined)
const byDate = (ws: Workout[]) => new Map(ws.filter((w) => isRide(w)).map((w) => [w.date, w]))
const shape = (w: Workout) =>
  JSON.stringify(w.sections.map((s) => ({ n: s.name, r: s.repeat, st: s.steps.map(({ id: _id, ...x }) => x) })))
const fmtIf = (v: number) => v.toFixed(2).replace('.', ',')

/**
 * Wijzigingen per dag tussen het uitgezette voorstel (AI of regels) en de koers na de coach.
 * Een verplaatste training geeft op beide dagen een wijziging, zoals de coach het ziet.
 */
export function planDiff(ai: Workout[] | undefined, cur: Workout[], ftp: number): DayChange[] {
  if (!ai) return []
  const a = byDate(ai)
  const c = byDate(cur)
  const out: DayChange[] = []
  for (const date of [...new Set([...a.keys(), ...c.keys()])].sort()) {
    const was = a.get(date)
    const wordt = c.get(date)
    const mw = was && workoutMetrics(was.sections, ftp)
    const mc = wordt && workoutMetrics(wordt.sections, ftp)
    if (was && !wordt && mw) {
      out.push({ date, kind: 'verwijderd', fields: [{ label: 'Training', was: was.name }, { label: 'Duur', was: fmtHm(mw.durationSec) }, { label: 'TSS', was: String(mw.tss) }] })
    } else if (!was && wordt && mc) {
      out.push({ date, kind: 'toegevoegd', fields: [{ label: 'Training', wordt: wordt.name }, { label: 'Duur', wordt: fmtHm(mc.durationSec) }, { label: 'TSS', wordt: String(mc.tss) }] })
    } else if (was && wordt && mw && mc) {
      const fields: FieldChange[] = []
      if (was.name !== wordt.name) fields.push({ label: 'Training', was: was.name, wordt: wordt.name })
      if (Math.round(mw.durationSec / 60) !== Math.round(mc.durationSec / 60)) fields.push({ label: 'Duur', was: fmtHm(mw.durationSec), wordt: fmtHm(mc.durationSec) })
      if (mw.tss !== mc.tss) fields.push({ label: 'TSS', was: String(mw.tss), wordt: String(mc.tss) })
      if (mw.intensityFactor !== mc.intensityFactor) fields.push({ label: 'Intensiteit', was: `IF ${fmtIf(mw.intensityFactor)}`, wordt: `IF ${fmtIf(mc.intensityFactor)}` })
      if (!fields.length && shape(was) !== shape(wordt)) fields.push({ label: 'Opbouw', was: 'uitgezet', wordt: 'aangepast' })
      if (fields.length) out.push({ date, kind: 'gewijzigd', fields })
    }
  }
  return out
}

// ── statusmodel ─────────────────────────────────────────────

/** Status van de koers als geheel. */
export function planState(plan: Pick<TrainingPlan, 'status' | 'syncedAt'>): TrainingStatus {
  if (plan.status === 'concept') return 'bij-coach'
  if (plan.status === 'gewijzigd') return 'bijgestuurd'
  return plan.syncedAt ? 'op-fietscomputer' : 'bevestigd'
}

/**
 * Status van één dag binnen een koers, of null voor een rustdag zonder verhaal.
 * - hasRide: er staat nu een rit; confirmedRide: er stond een rit in de bevestigde versie
 *   (die staat op de fietscomputer; standaard gelijk aan hasRide)
 * - changed: wijkt af van het uitgezette voorstel (telt zolang de koers een concept is)
 * - changedSinceConfirm: wijkt af van wat de coach bevestigde (telt na bevestigen)
 * Gereden/gemist gaan alleen over bevestigde ritten; een rit die vandaag al gereden is, is gereden.
 */
export function trainingStatus(
  plan: Pick<TrainingPlan, 'status' | 'syncedAt'>,
  date: string,
  o: { hasRide: boolean; confirmedRide?: boolean; changed: boolean; changedSinceConfirm?: boolean; rode: boolean; today: string },
): TrainingStatus | null {
  if (plan.status === 'concept') return o.changed ? 'bijgestuurd' : o.hasRide ? 'uitgezet' : null
  const onDevice = o.confirmedRide ?? o.hasRide
  const edited = plan.status === 'gewijzigd' && !!o.changedSinceConfirm
  if (date <= o.today && onDevice && o.rode) return 'gereden'
  if (date < o.today) return onDevice ? 'gemist' : edited ? 'bijgestuurd' : null
  if (edited) return 'bijgestuurd'
  if (!o.hasRide) return null
  return plan.syncedAt ? 'op-fietscomputer' : 'bevestigd'
}

/** Per dag wat de atleet op de fietscomputer krijgt: sport, naam en beschrijving (notitie + stappen). */
function dayKeys(ws: Workout[]): Map<string, string> {
  const per = new Map<string, string[]>()
  for (const w of ws) {
    if (!isRide(w)) continue
    const k = `${w.sport}|${w.name}|${workoutDescription(w)}`
    per.set(w.date, [...(per.get(w.date) ?? []), k])
  }
  return new Map([...per].map(([d, ks]) => [d, ks.sort().join('\n')]))
}

/**
 * Dagen waarop wat naar Intervals.icu gaat verschilt tussen twee versies van een koers.
 * Interne id's en de Prikkel tellen niet: die ziet de atleet niet.
 */
export function changedDates(before: Workout[], after: Workout[]): Set<string> {
  const a = dayKeys(before)
  const b = dayKeys(after)
  return new Set([...new Set([...a.keys(), ...b.keys()])].filter((d) => a.get(d) !== b.get(d)))
}

/**
 * De bevestigde versie van een koers: de snapshot, of bij oudere koersen zonder snapshot de
 * trainingen van een ongewijzigde bevestigde koers. Onbekend bij een concept of een oude gewijzigde koers.
 */
export function confirmedBase(plan: Pick<TrainingPlan, 'status' | 'workouts' | 'confirmedWorkouts'>): Workout[] | undefined {
  if (plan.status === 'concept') return undefined
  return plan.confirmedWorkouts ?? (plan.status === 'gepubliceerd' ? plan.workouts : undefined)
}

/** Wat de atleet ziet en wat meetelt: bij een gewijzigde koers de bevestigde versie, tot de coach opnieuw bevestigt. */
export function visibleWorkouts(plan: Pick<TrainingPlan, 'status' | 'workouts' | 'confirmedWorkouts'>): Workout[] {
  return (plan.status === 'gewijzigd' ? plan.confirmedWorkouts : undefined) ?? plan.workouts
}

/**
 * Status na een bewerking. Titel, notitie of Prikkel aanpassen verandert niets aan wat op de
 * fietscomputer staat; alleen andere ritten maken een bevestigde koers "gewijzigd". Terug naar de
 * bevestigde versie = weer bevestigd.
 */
export function editStatus(prevStatus: TrainingPlan['status'], base: Workout[] | undefined, workouts: Workout[]): TrainingPlan['status'] {
  if (prevStatus === 'concept') return 'concept'
  if (!base) return 'gewijzigd'
  return changedDates(base, workouts).size ? 'gewijzigd' : 'gepubliceerd'
}

/**
 * Bevestigen door de coach: de koers is daarna van de coach en gaat naar Intervals.icu.
 * De bevestigde trainingen worden vastgelegd (basis voor latere bijsturing). `by` blijft leeg
 * als er geen coachnaam bekend is; de app toont dan "je coach".
 */
export function confirmPlan<T extends TrainingPlan>(plan: T, by: string | undefined, at: string, synced: boolean): T {
  return {
    ...plan,
    status: 'gepubliceerd',
    publishedAt: at,
    confirmedAt: at,
    confirmedBy: by,
    syncedAt: synced ? at : undefined,
    confirmedWorkouts: cloneWorkouts(plan.workouts),
  }
}

/** Velden die alleen de server zet; een opslag vanuit de app mag ze niet overschrijven. */
const SERVER_OWNED = [
  'id',
  'athleteId',
  'status',
  'source',
  'createdAt',
  'publishedAt',
  'aiWorkouts',
  'request',
  'rationale',
  'confirmedAt',
  'confirmedBy',
  'syncedAt',
  'confirmedWorkouts',
  'feedbackLog',
] as const

/**
 * De atleet is eigenaar van zijn feedback: een opslag van de coach (met een oude kopie) wist die niet.
 * Alleen op dezelfde rit (zelfde id en dag), zodat feedback niet met een verplaatste training meereist.
 */
function feedbackOnto(from: Workout[], ws: Workout[]): Workout[] {
  const key = (w: Workout) => `${w.id}|${w.date}`
  const fb = new Map(from.filter((w) => w.feedback).map((w) => [key(w), w.feedback]))
  return ws.map((w) => (fb.has(key(w)) ? { ...w, feedback: fb.get(key(w)) } : { ...w, feedback: undefined }))
}

/** Feedback die de atleet gaf terwijl de server met `plan` bezig was (bv. publiceren), uit de nieuwste versie. */
export function keepFeedback<T extends TrainingPlan>(plan: T, latest: TrainingPlan): T {
  return { ...plan, feedbackLog: latest.feedbackLog, workouts: feedbackOnto(latest.workouts, plan.workouts) }
}

export function mergePlanUpdate<T extends TrainingPlan & { publishedExternalIds?: string[] }>(prev: T, next: Partial<T>): T {
  const out = { ...prev, ...next } as T
  for (const k of SERVER_OWNED) (out as Record<string, unknown>)[k] = prev[k]
  out.publishedExternalIds = prev.publishedExternalIds
  if (!Array.isArray(out.workouts)) out.workouts = prev.workouts
  out.workouts = feedbackOnto(prev.workouts, out.workouts)
  // oudere bevestigde koersen krijgen bij de eerste opslag alsnog een snapshot
  if (prev.status === 'gepubliceerd' && !prev.confirmedWorkouts) out.confirmedWorkouts = cloneWorkouts(prev.workouts)
  out.status = editStatus(prev.status, confirmedBase(prev), out.workouts)
  return out
}

// ── koersen per dag ─────────────────────────────────────────

/** Welke dagen een koers dekt: van start tot eind, uitgebreid met eigen ritten daarbuiten (oudere koersen). */
export function planRange(p: Pick<TrainingPlan, 'startDate' | 'weeks' | 'workouts' | 'status' | 'confirmedWorkouts'>): { from: string; to: string } {
  const dates = visibleWorkouts(p).filter((w) => isRide(w)).map((w) => w.date)
  const from = dates.reduce((a, d) => (d < a ? d : a), p.startDate)
  const to = dates.reduce((a, d) => (d > a ? d : a), planEnd(p))
  return { from, to }
}

/**
 * De nieuwste bevestigde koers die een dag dekt. Bevestigde koersen overlappen vanaf vandaag niet
 * (zie `overlapping`); in het verleden kan een oudere koers nog doorlopen, dan wint de nieuwste.
 */
export function planForDate<P extends TrainingPlan>(plans: P[], date: string): P | undefined {
  return plans
    .filter((p) => {
      if (p.status === 'concept') return false
      const r = planRange(p)
      return date >= r.from && date <= r.to
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

/**
 * Andere bevestigde koersen die vanaf vandaag dezelfde dagen dekken als `plan`. Bevestigen zou dan
 * dubbel plannen: twee trainingen op één dag op de fietscomputer. Dat mag niet.
 */
export function overlapping<P extends TrainingPlan>(plans: P[], plan: P, today: string): { plan: P; from: string; to: string }[] {
  const r = planRange(plan)
  const out: { plan: P; from: string; to: string }[] = []
  for (const p of plans) {
    if (p.id === plan.id || p.status === 'concept') continue
    const o = planRange(p)
    const from = [r.from, o.from, today].reduce((a, d) => (d > a ? d : a))
    const to = r.to < o.to ? r.to : o.to
    if (from <= to) out.push({ plan: p, from, to })
  }
  return out
}

/** Waarom bevestigen niet kan, en wat de coach wel kan doen. */
export function overlapMessage(clash: { plan: Pick<TrainingPlan, 'title'>; from: string; to: string }[]): string {
  const c = clash[0]
  const days = c.from === c.to ? fmtDate(c.from, true) : `${fmtDate(c.from, true)} – ${fmtDate(c.to, true)}`
  return `Overlapt met '${c.plan.title}' (${days}): twee koersen op dezelfde dagen kan niet. Stuur '${c.plan.title}' bij, of verwijder een van beide.`
}

/**
 * Alle ritten per dag uit de koers die die dag dekt. `atleet`: wat de atleet heeft staan (bij een
 * gewijzigde koers de bevestigde versie); `coach`: de huidige versie, inclusief nog niet bevestigde bijsturing.
 */
export function confirmedDays<P extends TrainingPlan>(plans: P[], view: 'atleet' | 'coach' = 'atleet'): { plan: P; workout: Workout }[] {
  const out: { plan: P; workout: Workout }[] = []
  for (const p of plans) {
    if (p.status === 'concept') continue
    for (const w of view === 'atleet' ? visibleWorkouts(p) : p.workouts) if (isRide(w) && planForDate(plans, w.date) === p) out.push({ plan: p, workout: w })
  }
  return out.sort((a, b) => a.workout.date.localeCompare(b.workout.date))
}

// ── gepland vs gereden ──────────────────────────────────────

export interface PlannedRidden {
  date: string
  planned: number
  ridden: number
  name?: string
}

/**
 * Per dag de geplande belasting uit de nieuwste bevestigde koers die die dag dekt (een rustdag in de
 * nieuwe koers blijft een rustdag, ook als een oudere koers er iets had) en de gereden belasting.
 * Alle sporten tellen mee in de gereden belasting.
 */
export function plannedVsRidden(activities: Activity[], plans: TrainingPlan[], from: string, days: number, ftp: number): PlannedRidden[] {
  const confirmed = plans.filter((p) => p.status !== 'concept')
  const rows: PlannedRidden[] = []
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i)
    const plan = planForDate(confirmed, date)
    const ws = plan ? visibleWorkouts(plan).filter((w) => w.date === date && isRide(w)) : []
    const planned = ws.reduce((a, w) => a + workoutMetrics(w.sections, ftp).tss, 0)
    const ridden = activities.filter((a) => a.date === date).reduce((a, x) => a + x.load, 0)
    rows.push({ date, planned: round(planned), ridden: round(ridden), name: ws.map((w) => w.name).join(' + ') || undefined })
  }
  return rows
}

/** Op koers %: gereden belasting op geplande dagen (per dag afgetopt op het plan) t.o.v. het plan. */
export function onCoursePct(rows: PlannedRidden[]): number | undefined {
  const planned = rows.reduce((a, r) => a + r.planned, 0)
  if (!planned) return undefined
  return Math.round((rows.reduce((a, r) => a + Math.min(r.ridden, r.planned), 0) / planned) * 100)
}

/** Eerste dag vanaf vandaag waarvoor nog geen bevestigde koers staat. */
export function nextPlanDue(plans: TrainingPlan[], today: string): string {
  const ranges = plans.filter((p) => p.status !== 'concept').map((p) => planRange(p))
  let d = today
  for (let i = 0; i < 400 && ranges.some((r) => d >= r.from && d <= r.to); i++) d = addDays(d, 1)
  return d
}

/** Cijfers voor Mijn atleten die uit de koersen komen. */
export function rosterExtras(activities: Activity[], plans: TrainingPlan[], today: string, ftp: number) {
  const rows = plannedVsRidden(activities, plans, addDays(today, -7), 7, ftp)
  return {
    onCourse7d: onCoursePct(rows),
    missed7d: rows.filter((r) => r.planned > 0 && r.ridden === 0).length,
    nextPlanDue: nextPlanDue(plans, today),
    openProposals: plans.filter((p) => p.status === 'concept').length,
  }
}

// ── feedback ────────────────────────────────────────────────

/** Gevoel op een schaal van 1 (kapot) tot 5 (sterk). */
export const FEEL_SCALE: Record<FeedbackEntry['feel'], number> = { kapot: 1, zwaar: 2, normaal: 3, goed: 4, sterk: 5 }

/**
 * Feedback van de atleet op de rit die hij had staan (bij een gewijzigde koers de bevestigde versie).
 * Komt in het logboek van de koers en op de kopieën van dezelfde rit (zelfde id en dag).
 * null als de atleet die rit niet had staan.
 */
export function recordFeedback<T extends TrainingPlan>(plan: T, workoutId: string, feedback: FeedbackEntry): T | null {
  const ride = visibleWorkouts(plan).find((w) => w.id === workoutId)
  if (!ride) return null
  const rec: FeedbackRecord = { workoutId, date: ride.date, name: ride.name, feedback }
  const log = [...(plan.feedbackLog ?? []).filter((r) => !(r.workoutId === workoutId && r.date === ride.date)), rec]
  const tag = (ws?: Workout[]) => ws?.map((w) => (w.id === workoutId && w.date === ride.date ? { ...w, feedback } : w))
  return { ...plan, feedbackLog: log, workouts: tag(plan.workouts)!, confirmedWorkouts: tag(plan.confirmedWorkouts) }
}

/** Feedback bij een rit: uit het logboek (zelfde rit en dag), anders oudere feedback op de training. */
export function feedbackFor(plan: Pick<TrainingPlan, 'feedbackLog'>, w: Workout): FeedbackEntry | undefined {
  return plan.feedbackLog?.find((r) => r.workoutId === w.id && r.date === w.date)?.feedback ?? w.feedback
}

/** Alle feedback van een atleet, nieuwste eerst: het logboek plus oudere feedback op trainingen. */
export function allFeedback(plans: TrainingPlan[]): FeedbackRecord[] {
  const out: FeedbackRecord[] = []
  for (const p of plans) {
    const seen = new Set((p.feedbackLog ?? []).map((r) => `${r.workoutId}|${r.date}`))
    out.push(...(p.feedbackLog ?? []))
    for (const w of [...p.workouts, ...(p.confirmedWorkouts ?? [])]) {
      const k = `${w.id}|${w.date}`
      if (!w.feedback || seen.has(k)) continue
      seen.add(k)
      out.push({ workoutId: w.id, date: w.date, name: w.name, feedback: w.feedback })
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.feedback.at.localeCompare(a.feedback.at))
}

export function latestFeedback(plans: TrainingPlan[]): FeedbackRecord | undefined {
  return allFeedback(plans)[0]
}
