import { afterEach, describe, expect, it, vi } from 'vitest'
import { fitCpModel, projectPmc, workoutMetrics } from './metrics'
import { sec, st, ramp, TEMPLATES } from './library'
import { sectionsToText, toIntervalsEvents, sanitizeNote } from './intervalsText'
import { generateRuleBased, mainSectionIndex, mainStepSec, setMainDuration } from './generator'
import { allFeedback, changedDates, confirmedDays, confirmPlan, editStatus, fmtHm, keepFeedback, mergePlanUpdate, nextPlanDue, overlapMessage, overlapping, parseMinutes, planDiff, planForDate, planRange, planState, plannedVsRidden, recordFeedback, rosterExtras, trainingStatus } from './review'
import { seedDemoConcept, seedDemoPlan } from './seed'
import { demoOverview, DEMO_IDS } from './demoData'
import { normalizeAiPlan } from './normalize'
import { addDays, fmtDuration, mondayOf, today } from './util'

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
  afterEach(() => vi.useRealTimers())

  // De demo rekent terug vanaf vandaag en rustdagen hangen aan de weekdag: elke dag van de week proberen
  const week = Array.from({ length: 7 }, (_, i) => addDays('2026-09-28', i))

  it.each(week)('Joris is vermoeid, Mila heeft een gat (vandaag %s)', (d) => {
    vi.setSystemTime(new Date(`${d}T12:00:00`))
    const j = demoOverview('demo-joris')!.athlete
    const m = demoOverview('demo-mila')!.athlete
    expect(j.tsb).toBeLessThan(-20)
    expect(m.flags.join(' ')).toMatch(/geen training/)
  })
})

describe('Koers reviewen: was → wordt', () => {
  const athlete = demoOverview('demo-sanne')!.athlete
  const req = { goal: 'x', startDate: '2026-10-05', weeks: 1, hoursPerWeek: 10, availableDays: [1, 3, 5, 6], longRideDay: 6, focus: 'drempel' as const, notes: '' }
  const fresh = () => generateRuleBased(req, athlete)

  it('het voorstel wordt vastgelegd; zonder bijsturing geen wijzigingen', () => {
    const p = fresh()
    expect(p.aiWorkouts).toEqual(p.workouts)
    expect(p.aiWorkouts).not.toBe(p.workouts)
    expect(p.request).toEqual(req)
    expect(planDiff(p.aiWorkouts, p.workouts, athlete.ftp)).toEqual([])
  })

  it('andere training op een dag: training, duur en TSS als was → wordt', () => {
    const p = fresh()
    const key = p.workouts.find((w) => w.stimulus !== 'Duur')!
    const t = TEMPLATES.duur
    Object.assign(key, { name: t.name, stimulus: t.stimulus, sections: t.build(1, 60) })
    const d = planDiff(p.aiWorkouts, p.workouts, athlete.ftp)
    expect(d).toHaveLength(1)
    expect(d[0].date).toBe(key.date)
    expect(d[0].kind).toBe('gewijzigd')
    expect(d[0].fields.map((f) => f.label)).toEqual(expect.arrayContaining(['Training', 'Duur', 'TSS']))
    const tr = d[0].fields.find((f) => f.label === 'Training')!
    expect(tr.was).toBe(p.aiWorkouts!.find((w) => w.date === key.date)!.name)
    expect(tr.wordt).toBe('Duurrit Z2')
  })

  it('verplaatsen geeft een wijziging op beide dagen; verwijderen en toevoegen apart', () => {
    const p = fresh()
    const [a, b] = p.workouts
    ;[a.date, b.date] = [b.date, a.date]
    expect(planDiff(p.aiWorkouts, p.workouts, athlete.ftp).map((x) => x.date).sort()).toEqual([a.date, b.date].sort())

    const q = fresh()
    const gone = q.workouts.pop()!
    const extra = { ...q.workouts[0], id: 'nieuw', date: '2026-10-11' }
    q.workouts.push(extra)
    const d = planDiff(q.aiWorkouts, q.workouts, athlete.ftp)
    expect(d.find((x) => x.date === gone.date)).toMatchObject({ kind: gone.date === '2026-10-11' ? 'gewijzigd' : 'verwijderd' })
    expect(d.find((x) => x.date === '2026-10-11')?.fields.some((f) => f.wordt === extra.name)).toBe(true)
  })

  it('alleen de duur korter: duur en TSS wijzigen, de training niet', () => {
    const p = fresh()
    const long = p.workouts.find((w) => w.name === 'Lange duurrit')!
    long.sections = setMainDuration(long.sections, mainStepSec(long.sections) / 60 - 30)
    const d = planDiff(p.aiWorkouts, p.workouts, athlete.ftp)
    expect(d).toHaveLength(1)
    expect(d[0].fields.map((f) => f.label)).toEqual(['Duur', 'TSS'])
  })

  it('zonder vastgelegd voorstel (oude plannen) geen diff', () => {
    expect(planDiff(undefined, fresh().workouts, athlete.ftp)).toEqual([])
  })
})

describe('statusmodel en bevestigen', () => {
  const t = '2026-10-07'
  it('per training: uitgezet → bijgestuurd → bevestigd → op fietscomputer → gereden/gemist', () => {
    const o = (x: Partial<{ hasRide: boolean; changed: boolean; changedSinceConfirm: boolean; rode: boolean }>) => ({ hasRide: true, changed: false, rode: false, today: t, ...x })
    expect(trainingStatus({ status: 'concept' }, '2026-10-08', o({}))).toBe('uitgezet')
    expect(trainingStatus({ status: 'concept' }, '2026-10-08', o({ changed: true }))).toBe('bijgestuurd')
    expect(trainingStatus({ status: 'gepubliceerd' }, '2026-10-08', o({ changed: true }))).toBe('bevestigd')
    expect(trainingStatus({ status: 'gepubliceerd', syncedAt: 'x' }, '2026-10-08', o({}))).toBe('op-fietscomputer')
    expect(trainingStatus({ status: 'gepubliceerd' }, '2026-10-06', o({ rode: true }))).toBe('gereden')
    expect(trainingStatus({ status: 'gepubliceerd' }, '2026-10-06', o({}))).toBe('gemist')
    expect(planState({ status: 'concept' })).toBe('bij-coach')
    expect(planState({ status: 'gewijzigd' })).toBe('bijgestuurd')
  })

  it('een dag zonder rit is nooit gemist, gereden of op de fietscomputer', () => {
    const empty = { hasRide: false, changed: true, rode: false, today: t }
    expect(trainingStatus({ status: 'concept' }, '2026-10-08', empty)).toBe('bijgestuurd')
    expect(trainingStatus({ status: 'concept' }, '2026-10-08', { ...empty, changed: false })).toBeNull()
    expect(trainingStatus({ status: 'gepubliceerd', syncedAt: 'x' }, '2026-10-06', empty)).toBeNull()
    expect(trainingStatus({ status: 'gepubliceerd', syncedAt: 'x' }, '2026-10-08', empty)).toBeNull()
    expect(trainingStatus({ status: 'gewijzigd' }, '2026-10-08', { ...empty, changedSinceConfirm: true })).toBe('bijgestuurd')
  })

  it('na bevestigen telt de afwijking van de bevestigde koers, niet van het voorstel', () => {
    const o = { hasRide: true, changed: true, rode: false, today: t }
    expect(trainingStatus({ status: 'gewijzigd' }, '2026-10-08', { ...o, changedSinceConfirm: false })).toBe('bevestigd')
    expect(trainingStatus({ status: 'gewijzigd' }, '2026-10-08', { ...o, changedSinceConfirm: true })).toBe('bijgestuurd')
  })

  it('bevestigen legt coach en tijd vast; alleen echt gesynct = op de fietscomputer', () => {
    const p = generateRuleBased({ goal: '', startDate: t, weeks: 1, hoursPerWeek: 8, availableDays: [1, 3, 5], longRideDay: 5, focus: 'basis', notes: '' }, demoOverview('demo-sanne')!.athlete)
    const c = confirmPlan(p, 'Ruud', '2026-10-07T10:00:00.000Z', false)
    expect(c).toMatchObject({ status: 'gepubliceerd', confirmedBy: 'Ruud', confirmedAt: '2026-10-07T10:00:00.000Z', syncedAt: undefined })
    expect(c.confirmedWorkouts).toEqual(p.workouts)
    expect(planState(c)).toBe('bevestigd')
    expect(planState(confirmPlan(p, 'Ruud', 'x', true))).toBe('op-fietscomputer')
    expect(confirmPlan(p, undefined, 'x', false).confirmedBy).toBeUndefined()
  })

  it('titel of notitie aanpassen houdt een koers bevestigd; een andere training niet; terugdraaien wel', () => {
    const p = generateRuleBased({ goal: '', startDate: t, weeks: 1, hoursPerWeek: 8, availableDays: [1, 3, 5], longRideDay: 5, focus: 'basis', notes: '' }, demoOverview('demo-sanne')!.athlete)
    const c = confirmPlan(p, 'Ruud', 'x', false)
    expect(mergePlanUpdate(c, { ...c, title: 'Nieuw', note: 'Rustig aan' }).status).toBe('gepubliceerd')
    const edited = c.workouts.map((w, i) => (i === 0 ? { ...w, sections: setMainDuration(w.sections, 30) } : w))
    const g = mergePlanUpdate(c, { ...c, workouts: edited })
    expect(g.status).toBe('gewijzigd')
    expect(g.confirmedWorkouts).toEqual(c.confirmedWorkouts)
    expect(mergePlanUpdate(g, { ...g, workouts: c.workouts }).status).toBe('gepubliceerd')
    // feedback van de atleet is geen bijsturing
    const withFb = c.workouts.map((w, i) => (i === 0 ? { ...w, feedback: { rpe: 6, feel: 'goed' as const, comment: '', at: 'x' } } : w))
    expect(mergePlanUpdate(c, { ...c, workouts: withFb }).status).toBe('gepubliceerd')
  })

  it('opslaan vanuit de app kan het voorstel, de bevestiging en de publicatie niet overschrijven', () => {
    const p = { ...generateRuleBased({ goal: '', startDate: t, weeks: 1, hoursPerWeek: 8, availableDays: [1, 3, 5], longRideDay: 5, focus: 'basis', notes: '' }, demoOverview('demo-sanne')!.athlete), publishedExternalIds: ['koersplan:a'] }
    const c = { ...confirmPlan(p, 'Ruud', 'x', true), publishedExternalIds: ['koersplan:a'] }
    const hack = { ...c, aiWorkouts: [], confirmedWorkouts: [], confirmedBy: 'iemand', syncedAt: undefined, status: 'concept' as const, publishedExternalIds: ['kalender:alles'], note: 'nieuw', title: 'Nieuwe titel' }
    const m = mergePlanUpdate(c, hack)
    expect(m.aiWorkouts).toEqual(p.aiWorkouts)
    expect(m.confirmedWorkouts).toEqual(c.confirmedWorkouts)
    expect(m).toMatchObject({ confirmedBy: 'Ruud', syncedAt: 'x', status: 'gepubliceerd', note: 'nieuw', title: 'Nieuwe titel', publishedExternalIds: ['koersplan:a'] })
    expect(mergePlanUpdate(p, { ...p, status: 'gepubliceerd' }).status).toBe('concept')
  })
})

describe('duur en koersen per dag', () => {
  it('fmtHm rondt eerst af op minuten: nooit ":60"', () => {
    expect(fmtHm(7170)).toBe('2:00')
    expect(fmtHm(3570)).toBe('1:00')
    expect(fmtHm(3900)).toBe('1:05')
  })

  it('een rustdag in de nieuwste bevestigde koers blijft een rustdag, ook als een oudere koers er iets had', () => {
    const ath = demoOverview('demo-sanne')!.athlete
    const req = { goal: '', startDate: '2026-09-28', weeks: 1, hoursPerWeek: 8, availableDays: [1, 3], longRideDay: 3, focus: 'basis' as const, notes: '' }
    // overlap kan alleen in het verleden of bij oudere data: dan telt per dag de nieuwste koers
    const old = { ...confirmPlan(generateRuleBased(req, ath), 'Ruud', '2026-09-20T00:00:00.000Z', false), createdAt: '2026-09-19T00:00:00.000Z' }
    const nieuw = { ...confirmPlan(generateRuleBased({ ...req, availableDays: [3], longRideDay: 3 }, ath), 'Ruud', '2026-09-25T00:00:00.000Z', false), createdAt: '2026-09-24T00:00:00.000Z' }
    const rows = plannedVsRidden([], [old, nieuw], '2026-09-28', 7, 250)
    expect(rows.find((r) => r.date === '2026-09-29')!.planned).toBe(0)
    expect(rows.find((r) => r.date === '2026-10-01')!.planned).toBeGreaterThan(0)
  })
})

describe('Mijn atleten: cijfers uit de koersen', () => {
  const t = '2026-10-07'
  const base = generateRuleBased({ goal: '', startDate: '2026-09-28', weeks: 2, hoursPerWeek: 8, availableDays: [0, 2, 4], longRideDay: 4, focus: 'basis', notes: '' }, demoOverview('demo-sanne')!.athlete)
  const confirmed = confirmPlan(base, 'Ruud', 'x', false)
  const planned = confirmed.workouts.filter((w) => w.date >= '2026-09-30' && w.date < t)

  it('op koers %, gemist en volgende koers', () => {
    // rijdt alleen de eerste geplande training van de afgelopen 7 dagen, precies volgens plan
    const first = planned[0]
    const acts = [{ id: 'a', date: first.date, name: 'rit', type: 'Ride', movingTimeSec: 3600, load: workoutMetrics(first.sections, 250).tss }]
    const x = rosterExtras(acts, [confirmed], t, 250)
    const total = planned.reduce((a, w) => a + workoutMetrics(w.sections, 250).tss, 0)
    expect(x.onCourse7d).toBe(Math.round((acts[0].load / total) * 100))
    expect(x.missed7d).toBe(planned.length - 1)
    expect(x.nextPlanDue).toBe('2026-10-12')
    expect(x.openProposals).toBe(0)
  })

  it('zonder bevestigde koers: vandaag aan de beurt, concept telt als open voorstel', () => {
    const x = rosterExtras([], [base], t, 250)
    expect(x.nextPlanDue).toBe(t)
    expect(x.openProposals).toBe(1)
    expect(x.onCourse7d).toBeUndefined()
  })

  it('demo: Sanne heeft een bevestigde koers met één bijsturing, Joris een uitgezette koers', () => {
    const sanne = seedDemoPlan(demoOverview('demo-sanne')!.athlete)
    expect(planState(sanne)).toBe('bevestigd')
    expect(sanne.confirmedBy).toBe('Ruud')
    expect(planDiff(sanne.aiWorkouts, sanne.workouts, 248)).toHaveLength(1)
    const joris = seedDemoConcept(demoOverview('demo-joris')!.athlete)
    expect(planState(joris)).toBe('bij-coach')
    expect(planDiff(joris.aiWorkouts, joris.workouts, 312)).toEqual([])
  })
})

describe('bevestigde koers: één regel voor wat op de fietscomputer staat', () => {
  const ath = demoOverview('demo-sanne')!.athlete
  const req = { goal: '', startDate: '2026-10-05', weeks: 1, hoursPerWeek: 10, availableDays: [1, 3, 5, 6], longRideDay: 6, focus: 'drempel' as const, notes: '' }
  const confirmed = () => confirmPlan(generateRuleBased(req, ath), 'Ruud', 'x', true)

  it('id\'s en Prikkel tellen niet, de notitie voor de atleet wel', () => {
    const c = confirmed()
    const key = c.workouts.find((w) => w.stimulus !== 'Duur')!
    const tpl = Object.values(TEMPLATES).find((t) => t.name === key.name)!
    // zelfde training opnieuw kiezen: nieuwe interne id's, zelfde inhoud
    const same = c.workouts.map((w) => (w.id === key.id ? { ...w, sections: tpl.build(0) } : w))
    expect(changedDates(c.confirmedWorkouts!, same).has(key.date)).toBe(changedDates(c.confirmedWorkouts!, c.workouts).has(key.date))
    const prikkel = c.workouts.map((w) => (w.id === key.id ? { ...w, stimulus: 'Tempo' as const } : w))
    expect(editStatus('gepubliceerd', c.confirmedWorkouts, prikkel)).toBe('gepubliceerd')
    const note = c.workouts.map((w) => (w.id === key.id ? { ...w, coachNote: 'Rustig opbouwen.' } : w))
    expect([...changedDates(c.confirmedWorkouts!, note)]).toEqual([key.date])
    expect(editStatus('gepubliceerd', c.confirmedWorkouts, note)).toBe('gewijzigd')
  })

  it('opslaan: feedback van de atleet blijft, workouts moet een lijst zijn, oude koersen krijgen een snapshot', () => {
    const c = confirmed()
    const withFb = { ...c, workouts: c.workouts.map((w, i) => (i === 0 ? { ...w, feedback: { rpe: 8, feel: 'zwaar' as const, comment: 'pittig', at: 'x' } } : w)) }
    const stale = { ...withFb, workouts: c.workouts, title: 'Andere titel' }
    expect(mergePlanUpdate(withFb, stale).workouts[0].feedback?.comment).toBe('pittig')
    expect(mergePlanUpdate(c, { workouts: null } as unknown as Partial<typeof c>).workouts).toEqual(c.workouts)
    const legacy = { ...c, confirmedWorkouts: undefined }
    const saved = mergePlanUpdate(legacy, { ...legacy, title: 'x' })
    expect(saved.confirmedWorkouts).toEqual(c.workouts)
    expect(saved.status).toBe('gepubliceerd')
  })

  it('verleden en vandaag: gereden/gemist alleen voor bevestigde ritten', () => {
    const g = { status: 'gewijzigd' as const }
    // na bevestigen toegevoegd op een dag die voorbij is: niet gemist, maar bijgestuurd
    expect(trainingStatus(g, '2026-10-05', { hasRide: true, confirmedRide: false, changed: true, changedSinceConfirm: true, rode: false, today: '2026-10-08' })).toBe('bijgestuurd')
    // bevestigd en daarna weggehaald, niet gereden: dat stond op de fietscomputer, dus gemist
    expect(trainingStatus(g, '2026-10-05', { hasRide: false, confirmedRide: true, changed: true, changedSinceConfirm: true, rode: false, today: '2026-10-08' })).toBe('gemist')
    // vandaag al gereden
    expect(trainingStatus({ status: 'gepubliceerd', syncedAt: 'x' }, '2026-10-08', { hasRide: true, changed: false, rode: true, today: '2026-10-08' })).toBe('gereden')
  })

  it('op koers en gemist tellen bij een gewijzigde koers de bevestigde versie', () => {
    const c = confirmed()
    const first = c.workouts[0]
    const g = mergePlanUpdate(c, { ...c, workouts: c.workouts.filter((w) => w.id !== first.id) })
    expect(g.status).toBe('gewijzigd')
    const rows = plannedVsRidden([], [g], first.date, 1, 250)
    expect(rows[0].planned).toBeGreaterThan(0)
  })

  it('wekelijkse koersen volgen elkaar op: per dag de koers die die dag dekt', () => {
    const a = { ...confirmPlan(generateRuleBased({ ...req, startDate: '2026-09-28' }, ath), 'Ruud', 'x', false), createdAt: '2026-09-25T00:00:00.000Z' }
    const b = { ...confirmPlan(generateRuleBased({ ...req, startDate: '2026-10-05' }, ath), 'Ruud', 'x', false), createdAt: '2026-10-02T00:00:00.000Z' }
    const days = confirmedDays([b, a])
    expect(days.some((d) => d.plan.id === a.id && d.workout.date < '2026-10-05')).toBe(true)
    expect(days.some((d) => d.plan.id === b.id && d.workout.date >= '2026-10-05')).toBe(true)
    expect(planForDate([a, b], '2026-09-30')?.id).toBe(a.id)
  })
})

describe('de hoofdmoot en afronden', () => {
  it('de hoofdmoot is nooit de warming-up, ook niet na twee keer inkorten', () => {
    const lang = TEMPLATES.lang.build(0, 150)
    const kort = setMainDuration(lang, 10)
    const weer = setMainDuration(kort, 90)
    expect(weer[0]).toEqual(lang[0])
    expect(mainStepSec(weer)).toBe(90 * 60)
    expect(mainSectionIndex(TEMPLATES.sweetspot.build(0))).toBe(-1)
  })

  it('fmtDuration rondt eerst af op minuten', () => {
    expect(fmtDuration(7170)).toBe('2:00 u')
    expect(fmtDuration(3570)).toBe('1:00 u')
    expect(fmtDuration(1500)).toBe('25 min')
  })
})

describe('feedback, overlap en dekking', () => {
  const ath = demoOverview('demo-sanne')!.athlete
  const req = { goal: '', startDate: '2026-10-05', weeks: 1, hoursPerWeek: 10, availableDays: [1, 3, 5, 6], longRideDay: 6, focus: 'drempel' as const, notes: '' }
  const fb = (comment: string) => ({ rpe: 6, feel: 'goed' as const, comment, at: '2026-10-06T18:00:00.000Z' })

  it('feedback op een rit die de coach na bevestigen weghaalde blijft zichtbaar, ook na opnieuw bevestigen', () => {
    const c = confirmPlan(generateRuleBased(req, ath), 'Ruud', 'x', true)
    const ride = c.workouts[0]
    const g = mergePlanUpdate(c, { ...c, workouts: c.workouts.filter((w) => w.id !== ride.id) })
    const withFb = recordFeedback(g, ride.id, fb('gereden zoals gepland'))!
    expect(withFb).not.toBeNull()
    expect(allFeedback([withFb])[0]).toMatchObject({ workoutId: ride.id, date: ride.date, name: ride.name })
    const again = confirmPlan(withFb, 'Ruud', 'y', true)
    expect(allFeedback([again]).map((r) => r.feedback.comment)).toContain('gereden zoals gepland')
  })

  it('feedback reist niet mee met een verplaatste training', () => {
    const c = confirmPlan(generateRuleBased(req, ath), 'Ruud', 'x', true)
    const ride = c.workouts[0]
    const withFb = recordFeedback(c, ride.id, fb('op dinsdag'))!
    const moved = mergePlanUpdate(withFb, { ...withFb, workouts: withFb.workouts.map((w) => (w.id === ride.id ? { ...w, date: addDays(w.date, 1) } : w)) })
    expect(moved.workouts.find((w) => w.id === ride.id)!.feedback).toBeUndefined()
    expect(allFeedback([moved])[0].date).toBe(ride.date)
    expect(recordFeedback(c, 'bestaat-niet', fb('x'))).toBeNull()
  })

  it('bevestigde koersen delen geen dagen: bevestigen kan pas als die vrij zijn', () => {
    const blok = { ...confirmPlan(generateRuleBased({ ...req, startDate: '2026-09-28', weeks: 3 }, ath), 'Ruud', '2026-09-27T10:00:00.000Z', true), createdAt: '2026-09-20T00:00:00.000Z' }
    const week = { ...generateRuleBased({ ...req, startDate: '2026-10-05' }, ath), createdAt: '2026-10-01T00:00:00.000Z' }
    // een concept telt nergens mee
    expect(planForDate([blok, week], '2026-10-06')?.id).toBe(blok.id)
    expect(overlapping([blok, week], blok, '2026-10-01')).toEqual([])
    const clash = overlapping([blok, week], week, '2026-10-01')
    expect(clash).toHaveLength(1)
    expect(clash[0]).toMatchObject({ from: '2026-10-05', to: '2026-10-11' })
    expect(overlapMessage(clash)).toContain(`'${blok.title}'`)
    // alleen vanaf vandaag: wat al voorbij is, blokkeert niet
    expect(overlapping([blok, week], week, '2026-10-12')).toEqual([])
    // een nieuw blok begint standaard na de bevestigde koers
    expect(nextPlanDue([blok, week], '2026-10-05')).toBe('2026-10-19')
  })

  it('bevestigen houdt feedback die de atleet intussen gaf', () => {
    const c = confirmPlan(generateRuleBased(req, ath), 'Ruud', 'x', true)
    const ride = c.workouts[0]
    const latest = recordFeedback(c, ride.id, fb('tijdens het bevestigen'))!
    const kept = keepFeedback(c, latest)
    expect(kept.feedbackLog?.map((r) => r.feedback.comment)).toEqual(['tijdens het bevestigen'])
    expect(kept.workouts.find((w) => w.id === ride.id)!.feedback?.comment).toBe('tijdens het bevestigen')
  })

  it('een koers dekt ook zijn eigen ritten vóór de start (oudere koersen)', () => {
    const c = confirmPlan(generateRuleBased({ ...req, startDate: '2026-10-07' }, ath), 'Ruud', 'x', false)
    const early = { ...c.workouts[0], id: 'vroeg', date: '2026-10-06' }
    const p = { ...c, workouts: [early, ...c.workouts], confirmedWorkouts: [early, ...(c.confirmedWorkouts ?? [])] }
    expect(planRange(p).from).toBe('2026-10-06')
    expect(planForDate([p], '2026-10-06')?.id).toBe(p.id)
  })

  it('duur invoeren: u:mm (ook 1.45 en 1u45), hele of halve uren en minuten', () => {
    expect(parseMinutes('1:15')).toBe(75)
    expect(parseMinutes('1u45')).toBe(105)
    expect(parseMinutes('1h30')).toBe(90)
    // twee cijfers na de punt zijn minuten, zoals op de fietscomputer
    expect(parseMinutes('0.45')).toBe(45)
    expect(parseMinutes('1.45')).toBe(105)
    expect(parseMinutes('2.15')).toBe(135)
    expect(parseMinutes('2u')).toBe(120)
    expect(parseMinutes('1,5')).toBe(90)
    expect(parseMinutes('1.5')).toBe(90)
    expect(parseMinutes('1,5u')).toBe(90)
    expect(parseMinutes('75')).toBe(75)
    expect(parseMinutes('75 min')).toBe(75)
    expect(parseMinutes('1:75')).toBeNull()
    expect(parseMinutes('1.60')).toBeNull()
    // 1:25 of 1¼ uur? dan liever niets
    expect(parseMinutes('1,25')).toBeNull()
    expect(parseMinutes('abc')).toBeNull()
  })
})
