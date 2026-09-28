import type { AthleteSummary, GenerateRequest, PlanWeek, Section, TrainingPlan, Workout } from './types'
import { TEMPLATES, type TemplateKey } from './library'
import { workoutMetrics } from './metrics'
import { addDays, clamp, DAY_LONG, mondayOf, round, today, uid } from './util'
import { cloneWorkouts } from './review'

/**
 * Regelgebaseerde blokgenerator. Wordt gebruikt als er geen Claude API-key is,
 * en als fallback wanneer de AI-output niet valideert.
 *
 * Logica:
 *  - Belastingsweken in 3:1 (3 opbouw, 1 herstel); bij "piek" is de laatste week taper.
 *  - Weekbelasting uit huidige CTL: om CTL met r per week te laten stijgen is de
 *    gemiddelde dagbelasting ≈ CTL + 6·r (42-daags gemiddelde), dus week = 7·(CTL + 6r).
 *  - Begrensd door beschikbare uren (±60 TSS per uur).
 *  - 2 kernsessies per opbouwweek (1 in herstelweek), lange rit op de lange-ritdag,
 *    overige dagen duur/herstel die de rest van de belasting opvullen.
 */

const KEY_SESSIONS: Record<GenerateRequest['focus'], [TemplateKey, TemplateKey]> = {
  basis: ['tempo', 'sweetspot'],
  drempel: ['sweetspot', 'drempel'],
  vo2max: ['vo2', 'drempelLang'],
  duurvermogen: ['sweetspot', 'tempo'],
  sprint: ['sprint', 'vo2kort'],
  piek: ['vo2kort', 'drempelLang'],
}

const FOCUS_LABEL: Record<GenerateRequest['focus'], string> = {
  basis: 'aerobe basis',
  drempel: 'drempelvermogen',
  vo2max: 'VO2max',
  duurvermogen: 'duurvermogen (durability)',
  sprint: 'sprint en anaerobe capaciteit',
  piek: 'piekvorm richting het doel',
}

export function weekPattern(weeks: number, focus: GenerateRequest['focus']): ('opbouw' | 'herstel' | 'taper')[] {
  return Array.from({ length: weeks }, (_, i) => {
    if (focus === 'piek' && i === weeks - 1) return 'taper'
    if ((i + 1) % 4 === 0) return 'herstel'
    return 'opbouw'
  })
}

function pickKeyDays(days: number[], longDay: number, count: number): number[] {
  const candidates = days.filter((d) => d !== longDay)
  const pref = [1, 3, 2, 4, 0, 5, 6] // di, do, wo, vr, ma, za, zo
  const chosen: number[] = []
  for (const d of pref) {
    if (chosen.length >= count) break
    if (!candidates.includes(d)) continue
    const nearLong = Math.abs(d - longDay) === 1 || Math.abs(d - longDay) === 6
    const nearOther = chosen.some((c) => Math.abs(c - d) <= 1)
    if (!nearOther && (!nearLong || candidates.length <= 3)) chosen.push(d)
  }
  for (const d of candidates) {
    if (chosen.length >= count) break
    if (!chosen.includes(d)) chosen.push(d)
  }
  return chosen.sort((a, b) => a - b)
}

function makeWorkout(date: string, key: TemplateKey, p: number, mainMin?: number): Workout {
  const t = TEMPLATES[key]
  return {
    id: uid('w'),
    date,
    name: t.name,
    sport: 'Ride',
    stimulus: t.stimulus,
    coachNote: t.note(p),
    sections: t.build(p, mainMin),
  }
}

/**
 * De hoofdmoot van een duurachtige rit: de langste sectie met één constante stap die geen
 * warming-up of cooling-down is. Zo kan het aanpassen van de duur nooit de warming-up oprekken.
 */
export function mainSectionIndex(sections: Section[]): number {
  let best = -1
  let bestDur = 0
  sections.forEach((s, i) => {
    const st = s.steps[0]
    if (s.repeat !== 1 || s.steps.length !== 1 || st.kind !== 'steady' || /warm|cool|inrij|uitrij/i.test(s.name)) return
    if (st.durationSec > bestDur) {
      best = i
      bestDur = st.durationSec
    }
  })
  return best
}

/** Duur van de hoofdmoot in seconden (0 als er geen is). */
export function mainStepSec(sections: Section[]): number {
  const i = mainSectionIndex(sections)
  return i < 0 ? 0 : sections[i].steps[0].durationSec
}

/** Past de hoofdmoot van een duur-/herstelworkout aan. */
export function setMainDuration(sections: Section[], minutes: number): Section[] {
  const best = mainSectionIndex(sections)
  if (best < 0) return sections
  return sections.map((s, i) => (i === best ? { ...s, steps: [{ ...s.steps[0], durationSec: Math.round(minutes) * 60 }] } : s))
}

export function generateRuleBased(req: GenerateRequest, athlete: AthleteSummary): TrainingPlan {
  const start = req.startDate || addDays(mondayOf(today()), 7)
  const weeksN = clamp(Math.round(req.weeks || 4), 1, 12)
  // Bij hoge vermoeidheid (TSB < −25) begint het blok met een herstelweek
  const fatigued = athlete.tsb < -25 && weeksN > 1
  const pattern = fatigued ? (['herstel', ...weekPattern(weeksN - 1, req.focus)] as const) : weekPattern(weeksN, req.focus)
  const days = [...new Set(req.availableDays)].filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  const longDay = days.includes(req.longRideDay) ? req.longRideDay : days[days.length - 1] ?? 5
  const ftp = athlete.ftp || 250
  const rampPerWeek = athlete.ctl < 40 ? 4 : athlete.ctl < 75 ? 5 : 4
  const hourCapTss = req.hoursPerWeek * 60

  let ctl = athlete.ctl
  let capped = false
  let buildTarget = 0
  let buildActual = 0
  let buildIdx = 0
  const weeks: PlanWeek[] = []
  const workouts: Workout[] = []
  const weekStart0 = mondayOf(start)

  pattern.forEach((kind, wi) => {
    const weekStart = addDays(weekStart0, wi * 7)
    let target =
      kind === 'opbouw' ? 7 * (ctl + 6 * rampPerWeek) : kind === 'herstel' ? 7 * ctl * 0.6 : 7 * ctl * 0.55
    const cap = kind === 'opbouw' ? hourCapTss : hourCapTss * 0.7
    if (kind === 'opbouw' && target > cap) capped = true
    target = Math.min(target, cap)
    target = round(target / 5) * 5

    const p = kind === 'opbouw' ? buildIdx : Math.max(0, buildIdx - 1)
    const keyCount = kind === 'opbouw' ? Math.min(2, Math.max(1, days.length - 2)) : 1
    const keyDays = pickKeyDays(days, longDay, keyCount)
    const [k1, k2] = KEY_SESSIONS[req.focus]
    const weekWorkouts: Workout[] = []

    for (const d of days) {
      const date = addDays(weekStart, d)
      if (date < start) continue
      if (req.eventDate && date >= req.eventDate) continue
      if (keyDays.includes(d)) {
        const key = kind === 'taper' ? 'openers' : keyDays.indexOf(d) === 0 ? k1 : k2
        weekWorkouts.push(makeWorkout(date, key, p))
      } else if (d === longDay) {
        const key: TemplateKey = req.focus === 'duurvermogen' && kind === 'opbouw' ? 'duurvermogen' : 'lang'
        weekWorkouts.push(makeWorkout(date, key, p, 120))
      } else {
        const prevIsKey = keyDays.includes((d + 6) % 7) || (d + 6) % 7 === longDay
        weekWorkouts.push(makeWorkout(date, prevIsKey && kind !== 'opbouw' ? 'herstel' : 'duur', p, 60))
      }
    }

    // Vul duur-/lange ritten zodat de weekbelasting het doel benadert
    const fixed = weekWorkouts.filter((w) => !['Duur', 'Herstel'].includes(w.stimulus))
    const flexible = weekWorkouts.filter((w) => !fixed.includes(w))
    const fixedTss = fixed.reduce((a, w) => a + workoutMetrics(w.sections, ftp).tss, 0)
    const remaining = Math.max(0, target - fixedTss)
    if (flexible.length) {
      // lange rit krijgt het grootste aandeel
      const weights = flexible.map((w) => (w.name === 'Lange duurrit' ? 2.2 : w.stimulus === 'Herstel' ? 0.5 : 1))
      const wsum = weights.reduce((a, b) => a + b, 0)
      flexible.forEach((w, i) => {
        const share = (remaining * weights[i]) / wsum
        // Z2 ≈ 50 TSS/u, herstel ≈ 30 TSS/u; minus warming-up/cooling-down
        const perHour = w.stimulus === 'Herstel' ? 30 : 50
        const overhead = w.stimulus === 'Herstel' ? 0 : 15
        const min = clamp((share / perHour) * 60 - overhead, w.stimulus === 'Herstel' ? 30 : 40, w.name === 'Lange duurrit' ? 330 : 180)
        w.sections = setMainDuration(w.sections, round(min / 5) * 5)
      })
    }

    // Harde urenlimiet: kort duur-/herstelritten in (langste eerst) tot binnen de limiet
    const capSec = req.hoursPerWeek * 3600
    const secOf = (w: Workout) => workoutMetrics(w.sections, ftp).durationSec
    let excess = weekWorkouts.reduce((a, w) => a + secOf(w), 0) - capSec
    for (const w of [...flexible].sort((a, b) => secOf(b) - secOf(a))) {
      if (excess <= 0) break
      const minSec = (w.stimulus === 'Herstel' ? 30 : 40) * 60
      const main = mainStepSec(w.sections)
      const cut = Math.min(excess, Math.max(0, main - minSec))
      if (cut > 0) {
        w.sections = setMainDuration(w.sections, Math.floor((main - cut) / 300) * 5)
        excess -= main - mainStepSec(w.sections)
      }
    }

    const totalTss = weekWorkouts.reduce((a, w) => a + workoutMetrics(w.sections, ftp).tss, 0)
    if (kind === 'opbouw') {
      buildTarget += target
      buildActual += totalTss
    }
    // CTL-schatting voor de volgende week
    ctl = ctl + (totalTss / 7 - ctl) * (1 - Math.exp(-7 / 42))
    if (kind === 'opbouw') buildIdx++

    weeks.push({
      index: wi,
      focus:
        kind === 'opbouw'
          ? `Opbouw ${buildIdx}: ${FOCUS_LABEL[req.focus]}`
          : kind === 'herstel'
            ? 'Herstelweek: belasting omlaag, frisheid terug'
            : 'Taper: volume omlaag, intensiteit kort houden',
      targetTss: round(totalTss),
    })
    workouts.push(...weekWorkouts)
  })

  const dayNames = days.map((d) => DAY_LONG[d]).join(', ')
  return {
    id: uid('p'),
    athleteId: athlete.id,
    title: `${weeksN}-weeks blok: ${FOCUS_LABEL[req.focus]}`,
    goal: req.goal,
    startDate: start,
    weeks,
    rationale:
      `Startpunt: fitness (CTL) ${round(athlete.ctl)}, vorm ${round(athlete.tsb)}, FTP ${ftp} W` +
      (athlete.cp ? `, CP ${athlete.cp} W / W′ ${round((athlete.wPrime ?? 0) / 1000, 1)} kJ` : '') +
      `. ${fatigued ? `Vorm is ${round(athlete.tsb)}: daarom start het blok met een herstelweek. ` : ''}Streefwaarde: +${rampPerWeek} CTL per opbouwweek (veilig: 3–7), ` +
      `in een 3:1-ritme met ${pattern.filter((p) => p === 'herstel').length} herstelweek. ` +
      `Kernsessies op ${keyDaysLabel(days, longDay)}, lange rit op ${DAY_LONG[longDay]}. ` +
      `Trainingsdagen: ${dayNames}; maximaal ${req.hoursPerWeek} uur per week. ` +
      `Verwachte fitness aan het eind: ~${round(ctl)} CTL (${ctl - athlete.ctl >= 0 ? '+' : ''}${round(ctl - athlete.ctl)}).` +
      (capped ? ` De urenlimiet begrenst de opbouw; met meer uren per week kan de stijging groter.` : '') +
      (!capped && buildTarget && buildActual < buildTarget * 0.85
        ? ` Met ${days.length} trainingsdagen is de streefbelasting (${round(buildTarget / Math.max(1, pattern.filter((p) => p === 'opbouw').length))} TSS/week) niet haalbaar: voeg een dag toe of verleng de duurritten.`
        : ''),
    workouts,
    status: 'concept',
    source: 'regels',
    createdAt: new Date().toISOString(),
    aiWorkouts: cloneWorkouts(workouts),
    request: req,
  }
}

function keyDaysLabel(days: number[], longDay: number) {
  return pickKeyDays(days, longDay, 2)
    .map((d) => DAY_LONG[d])
    .join(' en ')
}

