import type { AthleteSummary, GenerateRequest, Section, Step, StepKind, Stimulus, TrainingPlan, Workout } from './types'
import { workoutMetrics } from './metrics'
import { addDays, clamp, mondayOf, round, uid } from './util'
import { cloneWorkouts } from './review'

/** Vorm waarin de AI (Claude) een blok teruggeeft. Percentages als gehele getallen. */
export interface AiPlan {
  title: string
  rationale: string
  weeks: { index: number; focus: string }[]
  workouts: {
    date: string
    name: string
    stimulus: string
    coachNote: string
    sections: {
      name: string
      repeat: number
      steps: { kind: string; durationSec: number; lowPct: number; highPct: number; cadence?: number; cue?: string }[]
    }[]
  }[]
}

const STIMULI: Stimulus[] = ['Herstel', 'Duur', 'Tempo', 'Sweetspot', 'Drempel', 'VO2max', 'Anaeroob', 'Sprint', 'Duurvermogen', 'Rust']

/**
 * Maakt AI-output veilig: datums binnen het blok, geldige stappen, intensiteit
 * begrensd (30–250% FTP), duur begrensd, geen dubbele datums.
 * Gooit een fout als er te weinig overblijft, zodat de server kan terugvallen.
 */
export function normalizeAiPlan(ai: AiPlan, req: GenerateRequest, athlete: AthleteSummary): TrainingPlan {
  const start = req.startDate
  const end = addDays(mondayOf(start), req.weeks * 7 - 1)
  const seen = new Set<string>()
  const workouts: Workout[] = []

  for (const w of ai.workouts ?? []) {
    const date = String(w.date).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < start || date > end || seen.has(date)) continue
    if (req.eventDate && date >= req.eventDate) continue
    const sections: Section[] = (w.sections ?? [])
      .map((s) => ({
        id: uid('x'),
        name: String(s.name || 'Blok').slice(0, 40),
        repeat: clamp(Math.round(Number(s.repeat) || 1), 1, 30),
        steps: (s.steps ?? [])
          .map((x) => {
            const kind: StepKind = x.kind === 'ramp' || x.kind === 'freeride' ? x.kind : 'steady'
            let lo = clamp(Number(x.lowPct) || 60, 30, 250) / 100
            let hi = clamp(Number(x.highPct ?? x.lowPct) || lo * 100, 30, 250) / 100
            if (kind === 'steady' && lo > hi) [lo, hi] = [hi, lo]
            const step: Step = {
              id: uid('s'),
              kind,
              durationSec: clamp(Math.round(Number(x.durationSec) || 0), 5, 6 * 3600),
              lo,
              hi,
              cadence: x.cadence ? clamp(Math.round(x.cadence), 50, 130) : undefined,
              cue: x.cue ? String(x.cue).slice(0, 60) : undefined,
            }
            return step
          })
          .filter((x) => x.durationSec >= 5),
      }))
      .filter((s) => s.steps.length)
    const stimulus = (STIMULI.includes(w.stimulus as Stimulus) ? w.stimulus : 'Duur') as Stimulus
    if (!sections.length && stimulus !== 'Rust') continue
    const m = workoutMetrics(sections, athlete.ftp)
    if (m.durationSec > 7 * 3600) continue
    seen.add(date)
    workouts.push({
      id: uid('w'),
      date,
      name: String(w.name || stimulus).slice(0, 60),
      sport: 'Ride',
      stimulus,
      coachNote: String(w.coachNote || '').slice(0, 1200),
      sections,
    })
  }
  if (workouts.length < Math.max(2, req.weeks)) throw new Error('AI-blok bevat te weinig geldige workouts')
  workouts.sort((a, b) => a.date.localeCompare(b.date))

  const weekStart0 = mondayOf(start)
  const weeks = Array.from({ length: req.weeks }, (_, i) => {
    const from = addDays(weekStart0, i * 7)
    const to = addDays(from, 6)
    const tss = workouts
      .filter((w) => w.date >= from && w.date <= to)
      .reduce((a, w) => a + workoutMetrics(w.sections, athlete.ftp).tss, 0)
    return { index: i, focus: ai.weeks?.find((x) => x.index === i)?.focus ?? `Week ${i + 1}`, targetTss: round(tss) }
  })

  return {
    id: uid('p'),
    athleteId: athlete.id,
    title: String(ai.title || `${req.weeks}-weeks blok`).slice(0, 80),
    goal: req.goal,
    startDate: start,
    weeks,
    rationale: String(ai.rationale || '').slice(0, 2000),
    workouts,
    status: 'concept',
    source: 'ai',
    createdAt: new Date().toISOString(),
    aiWorkouts: cloneWorkouts(workouts),
    request: req,
  }
}
