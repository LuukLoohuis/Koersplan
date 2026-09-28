import type { AthleteSummary, TrainingPlan, Workout } from './types'
import { generateRuleBased } from './generator'
import { toIntervalsEvents } from './intervalsText'
import { TEMPLATES } from './library'
import { confirmPlan, recordFeedback } from './review'
import { addDays, DAY_LONG, mondayOf, today, weekday } from './util'

/**
 * Voorbeeldblok voor de demo: loopt vanaf maandag van deze week en is door coach
 * Ruud bevestigd. Eén kernsessie is bijgestuurd naar rustig duur (was → wordt),
 * en de eerste training heeft feedback, zodat portaal en reviewscherm meteen iets laten zien.
 */
export function seedDemoPlan(athlete: AthleteSummary, coach: string | undefined = 'Ruud'): TrainingPlan & { publishedExternalIds: string[] } {
  const plan = generateRuleBased(
    {
      goal: athlete.goal ?? 'Gran Fondo',
      startDate: mondayOf(today()),
      weeks: 4,
      hoursPerWeek: 10,
      availableDays: [1, 2, 3, 5, 6],
      longRideDay: 6,
      focus: 'duurvermogen',
      notes: '',
    },
    athlete,
  )
  plan.title = 'Opbouw richting Gran Fondo Limburg'
  // bijsturing van de coach: de eerstvolgende kernsessie wordt rustig duur
  const key = plan.workouts.find((w) => w.date > today() && !['Duur', 'Herstel', 'Rust'].includes(w.stimulus))
  if (key) {
    const t = TEMPLATES.duur
    Object.assign(key, { name: t.name, stimulus: t.stimulus, coachNote: t.note(1), sections: t.build(1, 60) } satisfies Partial<Workout>)
    plan.note = `${DAY_LONG[weekday(key.date)][0].toUpperCase()}${DAY_LONG[weekday(key.date)].slice(1)} rustig duur in plaats van de kernsessie: je slaap was matig. Houd het soepel, de opbouw blijft staan.`
  }
  const at = new Date().toISOString()
  // bevestigd via dezelfde weg als in de app, dus met een snapshot van de bevestigde koers
  let confirmed = confirmPlan(plan, coach, at, false)
  const first = confirmed.workouts.find((w) => w.date < today())
  if (first) {
    const feedback = { rpe: 7, feel: 'goed' as const, comment: 'Blokken voelden gecontroleerd. Laatste herhaling was zwaar, maar vermogen bleef staan.', at }
    confirmed = recordFeedback(confirmed, first.id, feedback) ?? confirmed
  }
  return { ...confirmed, publishedExternalIds: toIntervalsEvents(confirmed, athlete.ftp).map((e) => e.external_id) }
}

/** Uitgezette koers voor volgende week die op de coach wacht (Koers reviewen). */
export function seedDemoConcept(athlete: AthleteSummary): TrainingPlan {
  const plan = generateRuleBased(
    {
      goal: athlete.goal ?? '',
      startDate: addDays(mondayOf(today()), 7),
      weeks: 2,
      hoursPerWeek: 12,
      availableDays: [1, 2, 3, 5, 6],
      longRideDay: 6,
      focus: 'drempel',
      notes: '',
    },
    athlete,
  )
  // uitgezet op de vrijdag ervoor
  plan.createdAt = new Date(`${addDays(mondayOf(today()), -3)}T07:00:00`).toISOString()
  return plan
}
