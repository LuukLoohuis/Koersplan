import { describe, expect, it } from 'vitest'
import { buildFormSeries, historyFromOverview, plannedDays, plansForForm, weeklyLoad, weeklyRamp, type HistoryDay } from './formSeries'
import { projectPmc } from './metrics'
import { demoOverview } from './demoData'
import { generateRuleBased } from './generator'
import { addDays, mondayOf, today } from './util'

const hist = (n: number, ctl = 50, atl = 60): HistoryDay[] =>
  Array.from({ length: n }, (_, i) => ({ date: addDays('2026-09-27', i - n + 1), ctl: ctl + i * 0.1, atl, tss: i % 7 ? 60 : 0 }))

describe('vormreeks', () => {
  it('vandaag is de laatste historiedag; projecties starten daar met projectPmc', () => {
    const h = hist(30)
    const plan = [
      { date: '2026-09-29', tss: 90, workoutName: 'Drempel 2×20' },
      { date: '2026-10-01', tss: 60, workoutName: 'Duur' },
    ]
    const s = buildFormSeries(h, plan, [])
    expect(s.past).toBe(29)
    expect(s.horizon).toBe(4)
    expect(s.days[s.past].i).toBe(0)
    expect(s.days[s.past].date).toBe('2026-09-27')
    expect(s.hasAi).toBe(true)
    expect(s.hasCoach).toBe(false)
    const t = h[h.length - 1]
    const ref = projectPmc({ date: t.date, ctl: t.ctl, atl: t.atl }, new Map(plan.map((p) => [p.date, p.tss])), 4)
    const fut = s.days.filter((d) => d.planned)
    expect(fut.map((d) => d.ai!.ctl)).toEqual(ref.map((r) => r.ctl))
    expect(fut[1].ai!.workoutName).toBe('Drempel 2×20')
    expect(fut[1].ai!.tss).toBe(90)
  })

  it('AI- en coachkoers lopen apart; geplande dagen vóór vandaag tellen niet', () => {
    const s = buildFormSeries(hist(10), [{ date: '2026-09-28', tss: 100, workoutName: 'VO2' }], [
      { date: '2026-09-20', tss: 500, workoutName: 'oud' },
      { date: '2026-09-28', tss: 40, workoutName: 'Herstel' },
    ])
    const d = s.days.find((x) => x.date === '2026-09-28')!
    expect(d.ai!.atl).toBeGreaterThan(d.coach!.atl)
    expect(s.horizon).toBe(1)
  })

  it('minHorizon verlengt de tijdas zonder projectie', () => {
    const s = buildFormSeries(hist(10), [], [], 14)
    expect(s.horizon).toBe(14)
    expect(s.days.at(-1)!.ai).toBeUndefined()
  })

  it('week-aggregaten: helling = CTL-verschil per 7 dagen, belasting = som TSS', () => {
    const s = buildFormSeries(hist(35))
    expect(weeklyRamp(s, 4)).toEqual([0.7, 0.7, 0.7, 0.7])
    expect(weeklyLoad(s, 4).map((w) => w.tss)).toEqual([360, 360, 360, 360])
  })
})

describe('vormreeks uit de app-data', () => {
  it('historie telt activiteiten per dag op en kiest de prikkel van de zwaarste', () => {
    const ov = {
      wellness: [{ date: '2026-09-27', ctl: 50, atl: 55 }],
      activities: [
        { id: 'a', date: '2026-09-27', name: 'Herstel', type: 'Ride', movingTimeSec: 1800, load: 20, intensity: 0.5 },
        { id: 'b', date: '2026-09-27', name: 'Drempel', type: 'Ride', movingTimeSec: 3600, load: 80, intensity: 0.95 },
      ],
    }
    const [d] = historyFromOverview(ov)
    expect(d.tss).toBe(100)
    expect(d.zone).toBe(4)
    expect(d.durationSec).toBe(5400)
    expect(d.workoutName).toBe('Herstel + Drempel')
  })

  it('concept = AI-koers, gepubliceerd = na de coach', () => {
    const ov = demoOverview('demo-sanne')!
    const req = { goal: 'x', startDate: mondayOf(today()), weeks: 2, hoursPerWeek: 8, availableDays: [1, 3, 5, 6], longRideDay: 6, focus: 'basis' as const, notes: '' }
    const concept = generateRuleBased(req, ov.athlete)
    const published = { ...generateRuleBased(req, ov.athlete), status: 'gepubliceerd' as const }
    const { planAi, planCoach } = plansForForm(ov, [concept, published])
    expect(planAi).toEqual(plannedDays(concept.workouts, ov.athlete.ftp))
    expect(planCoach.length).toBeGreaterThan(0)
    expect(plansForForm(ov, [published]).planAi).toEqual([])
  })
})

describe('vormreeks met gaten', () => {
  it('vult ontbrekende dagen aan zodat index = dag', () => {
    const s = buildFormSeries([
      { date: '2026-09-20', ctl: 40, atl: 50, tss: 50 },
      { date: '2026-09-23', ctl: 42, atl: 55, tss: 80 },
    ])
    expect(s.days.map((d) => d.i)).toEqual([-3, -2, -1, 0])
    expect(s.days[1]).toMatchObject({ ctl: 40, atl: 50, tss: 0 })
  })
})

describe('projectie stopt bij het einde van de planning', () => {
  it('geen projectie na de laatste geplande dag, ook als de tijdas verder loopt', () => {
    const s = buildFormSeries(hist(10), [{ date: '2026-09-30', tss: 80, workoutName: 'Duur' }], [], 10)
    expect(s.horizon).toBe(10)
    expect(s.days.find((d) => d.date === '2026-09-30')!.ai).toBeDefined()
    expect(s.days.find((d) => d.date === '2026-10-01')!.ai).toBeUndefined()
  })
})
