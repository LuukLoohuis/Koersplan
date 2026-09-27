import { describe, expect, it } from 'vitest'
import { fitCpModel, projectPmc, workoutMetrics } from './metrics'
import { sec, st, ramp, TEMPLATES } from './library'
import { sectionsToText, toIntervalsEvents, sanitizeNote } from './intervalsText'
import { generateRuleBased } from './generator'
import { demoOverview, DEMO_IDS } from './demoData'
import { normalizeAiPlan } from './normalize'
import { addDays, mondayOf, today } from './util'

describe('belasting', () => {
  it('1 uur op FTP = 100 TSS, IF 1.0', () => {
    const m = workoutMetrics([sec('x', [st(60, 100)])], 250)
    expect(m.tss).toBeCloseTo(100, 0)
    expect(m.intensityFactor).toBeCloseTo(1, 2)
    expect(m.kj).toBe(900)
  })
  it('1 uur op 70% ≈ 49 TSS', () => {
    expect(workoutMetrics([sec('x', [st(60, 70)])], 250).tss).toBeCloseTo(49, 0)
  })
  it("W'bal raakt leeg bij 6 × 3 min op 130% met kort herstel", () => {
    const m = workoutMetrics([sec('x', [st(3, 130), st(1, 50)], 6)], 300, { cp: 290, wPrime: 20000 })
    expect(m.wbalEmptied).toBe(true)
    const easy = workoutMetrics([sec('x', [st(60, 70)])], 300, { cp: 290, wPrime: 20000 })
    expect(easy.minWbal).toBe(20000)
  })
})

describe('CP-model', () => {
  it('haalt CP en W′ terug uit een 2-parameter curve', () => {
    const curve = [120, 180, 300, 600, 900, 1200].map((s) => ({ secs: s, watts: 280 + 20000 / s }))
    const m = fitCpModel(curve)!
    expect(m.cp).toBeCloseTo(280, 0)
    expect(m.wPrime).toBeCloseTo(20000, -1)
    expect(m.r2).toBeCloseTo(1, 3)
  })
})

describe('PMC-projectie', () => {
  it('zonder belasting daalt CTL met factor e^(−1/42) per dag', () => {
    const p = projectPmc({ date: '2026-01-01', ctl: 60, atl: 60 }, new Map(), 42)
    expect(p[41].ctl).toBeCloseTo(60 * Math.exp(-1), 0)
    expect(p[0].tsb).toBeGreaterThan(0)
  })
})

describe('intervals.icu-tekst', () => {
  it('schrijft secties, herhalingen, ramps en cadans', () => {
    const txt = sectionsToText([sec('Warming-up', [ramp(10, 50, 75, 90)]), sec('Main Set', [st(8, 95, 100), st(4, 55)], 4)])
    expect(txt).toBe('Warming-up\n- 10m ramp 50-75% 90rpm\n\nMain Set 4x\n- 8m 95-100%\n- 4m 55%')
  })
  it('haalt getallen uit cues en schrijft seconden correct', () => {
    const txt = sectionsToText([sec('Sprint', [st(0.25, 200, 200, { cue: 'Vol gas 15s' }), st(1.5, 50)])])
    // cue 'Vol gas 15s' → 'Vol gas'; '15s' daarna is de stapduur
    expect(txt).toBe('Sprint\n- Vol gas 15s 200%\n- 1m30 50%')
  })
  it('neutraliseert notitieregels die op stappen of herhalingen lijken', () => {
    expect(sanitizeNote('Vandaag 3x\n- let op')).toBe('Vandaag 3×\n• let op')
  })
})

describe('regelgebaseerde generator', () => {
  const ov = demoOverview(DEMO_IDS[0])!
  const start = addDays(mondayOf(today()), 7)
  const plan = generateRuleBased(
    { goal: 'test', startDate: start, weeks: 4, hoursPerWeek: 9, availableDays: [1, 2, 3, 5, 6], longRideDay: 6, focus: 'drempel', notes: '' },
    ov.athlete,
  )
  it('maakt 4 weken met workouts op beschikbare dagen', () => {
    expect(plan.weeks).toHaveLength(4)
    expect(plan.workouts.length).toBe(20)
    expect(plan.workouts.every((w) => w.date >= start)).toBe(true)
  })
  it('herstelweek heeft duidelijk minder belasting', () => {
    expect(plan.weeks[3].targetTss).toBeLessThan(plan.weeks[2].targetTss * 0.8)
  })
  it('blijft binnen de urenlimiet (±10%)', () => {
    for (let i = 0; i < 4; i++) {
      const from = addDays(mondayOf(start), i * 7)
      const to = addDays(from, 6)
      const sec = plan.workouts
        .filter((w) => w.date >= from && w.date <= to)
        .reduce((a, w) => a + workoutMetrics(w.sections, ov.athlete.ftp).durationSec, 0)
      expect(sec / 3600).toBeLessThanOrEqual(9 * 1.1)
    }
  })
  it('levert geldige intervals.icu-events', () => {
    const ev = toIntervalsEvents(plan, ov.athlete.ftp)
    expect(ev[0].category).toBe('WORKOUT')
    expect(ev[0].start_date_local).toMatch(/T00:00:00$/)
    expect(ev[0].external_id).toContain(plan.id)
    expect(ev[0].description).toMatch(/\n- \d+m/)
  })
  it('alle templates bouwen', () => {
    for (const t of Object.values(TEMPLATES)) expect(workoutMetrics(t.build(1), 250).durationSec).toBeGreaterThan(600)
  })
})

describe('AI-normalisatie', () => {
  const ov = demoOverview(DEMO_IDS[1])!
  const start = addDays(mondayOf(today()), 7)
  const req = { goal: 'x', startDate: start, weeks: 1, hoursPerWeek: 8, availableDays: [1, 3, 5], longRideDay: 5, focus: 'vo2max' as const, notes: '' }
  it('filtert ongeldige datums en klemt intensiteit', () => {
    const plan = normalizeAiPlan(
      {
        title: 't',
        rationale: 'r',
        weeks: [{ index: 0, focus: 'f' }],
        workouts: [
          { date: start, name: 'a', stimulus: 'VO2max', coachNote: '', sections: [{ name: 's', repeat: 5, steps: [{ kind: 'steady', durationSec: 180, lowPct: 999, highPct: 120 }] }] },
          { date: addDays(start, 2), name: 'b', stimulus: 'Onzin', coachNote: '', sections: [{ name: 's', repeat: 1, steps: [{ kind: 'steady', durationSec: 3600, lowPct: 70, highPct: 70 }] }] },
          { date: '2020-01-01', name: 'oud', stimulus: 'Duur', coachNote: '', sections: [{ name: 's', repeat: 1, steps: [{ kind: 'steady', durationSec: 3600, lowPct: 70, highPct: 70 }] }] },
        ],
      },
      req,
      ov.athlete,
    )
    expect(plan.workouts).toHaveLength(2)
    expect(plan.workouts[0].sections[0].steps[0].hi).toBe(2.5)
    expect(plan.workouts[1].stimulus).toBe('Duur')
  })
})

describe('demo', () => {
  it('Joris is vermoeid, Mila heeft een gat', () => {
    const j = demoOverview('demo-joris')!.athlete
    const m = demoOverview('demo-mila')!.athlete
    expect(j.tsb).toBeLessThan(-20)
    expect(m.flags.join(' ')).toMatch(/geen training/)
  })
})
