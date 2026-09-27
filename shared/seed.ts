import type { AthleteSummary, TrainingPlan } from './types'
import { generateRuleBased } from './generator'
import { toIntervalsEvents } from './intervalsText'
import { mondayOf, today } from './util'

/**
 * Voorbeeldblok voor de demo: loopt vanaf maandag van deze week, is al
 * gepubliceerd en heeft feedback op de eerste training, zodat het
 * atletenportaal meteen iets laat zien.
 */
export function seedDemoPlan(athlete: AthleteSummary): TrainingPlan & { publishedExternalIds: string[] } {
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
  plan.status = 'gepubliceerd'
  plan.publishedAt = new Date().toISOString()
  const first = plan.workouts.find((w) => w.date < today())
  if (first) {
    first.feedback = {
      rpe: 7,
      feel: 'goed',
      comment: 'Blokken voelden gecontroleerd. Laatste herhaling was zwaar, maar vermogen bleef staan.',
      at: new Date().toISOString(),
    }
  }
  return { ...plan, publishedExternalIds: toIntervalsEvents(plan, athlete.ftp).map((e) => e.external_id) }
}
