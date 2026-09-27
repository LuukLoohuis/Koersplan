import type { Section, Step, TrainingPlan, Workout } from './types'
import { workoutMetrics } from './metrics'

/**
 * Zet het neutrale workoutformaat om naar de plain-text syntax van intervals.icu.
 * intervals.icu parseert dit uit `description` naar een gestructureerde workout
 * en synct die naar Garmin, Wahoo, Zwift enz.
 *
 *   Warmup
 *   - 10m ramp 50-75% 90rpm
 *
 *   Main Set 4x
 *   - 8m 95-100%
 *   - 4m 55%
 */
export function fmtStepDuration(sec: number): string {
  const s = Math.max(1, Math.round(sec))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  if (r === 0) return `${m}m`
  return `${m}m${String(r).padStart(2, '0')}`
}

const pct = (f: number) => Math.round(f * 100)

export function stepToText(st: Step): string {
  const parts: string[] = ['-']
  if (st.cue) parts.push(sanitizeCue(st.cue))
  parts.push(fmtStepDuration(st.durationSec))
  if (st.kind === 'freeride') {
    parts.push('freeride')
  } else if (st.kind === 'ramp') {
    parts.push(`ramp ${pct(st.lo)}-${pct(st.hi)}%`)
  } else {
    const lo = pct(Math.min(st.lo, st.hi))
    const hi = pct(Math.max(st.lo, st.hi))
    parts.push(lo === hi ? `${lo}%` : `${lo}-${hi}%`)
  }
  if (st.cadence) parts.push(`${Math.round(st.cadence)}rpm`)
  return parts.join(' ')
}

/** Cues mogen geen getallen+eenheid bevatten, anders leest intervals.icu ze als duur/doel. */
function sanitizeCue(c: string): string {
  return c
    .replace(/[\r\n]+/g, ' ')
    .replace(/\d+[a-z%'"]*/gi, '') // getallen in een cue zou intervals.icu als duur/doel lezen
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 60)
}

function sectionHeader(sec: Section): string {
  const name = (sec.name || 'Blok').replace(/[\r\n]+/g, ' ').replace(/\s\d+x$/i, '').trim()
  return sec.repeat > 1 ? `${name} ${Math.round(sec.repeat)}x` : name
}

export function sectionsToText(sections: Section[]): string {
  return sections
    .filter((s) => s.steps.length)
    .map((sec) => [sectionHeader(sec), ...sec.steps.map(stepToText)].join('\n'))
    .join('\n\n')
}

/**
 * Coachnotitie als proza bovenaan de beschrijving. Regels die op een herhaling
 * ("3x") of stap ("- …") lijken worden onschadelijk gemaakt.
 */
export function sanitizeNote(note: string): string {
  return note
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*-\s*/, '• ').replace(/(\d+)x\s*$/i, '$1×'))
    .join('\n')
    .trim()
}

export function workoutDescription(w: Workout): string {
  const note = sanitizeNote(w.coachNote || '')
  const text = sectionsToText(w.sections)
  return note ? `${note}\n\n${text}` : text
}

export function externalId(planId: string, workoutId: string) {
  return `koersplan:${planId}:${workoutId}`
}

export interface IntervalsEventPayload {
  category: 'WORKOUT'
  start_date_local: string
  type: string
  name: string
  description: string
  moving_time: number
  icu_training_load: number
  external_id: string
}

export function toIntervalsEvents(plan: TrainingPlan, ftp: number): IntervalsEventPayload[] {
  return plan.workouts
    .filter((w) => w.sections.length && w.stimulus !== 'Rust')
    .map((w) => {
      const m = workoutMetrics(w.sections, ftp)
      return {
        category: 'WORKOUT',
        start_date_local: `${w.date}T00:00:00`,
        type: w.sport,
        name: w.name,
        description: workoutDescription(w),
        moving_time: m.durationSec,
        icu_training_load: Math.round(m.tss),
        external_id: externalId(plan.id, w.id),
      }
    })
}
