import type { Section, Step, Stimulus } from './types'
import { uid } from './util'

// Kleine DSL om workouts leesbaar op te bouwen. Intensiteit in % FTP.
export const st = (min: number, lo: number, hi = lo, opts: Partial<Step> = {}): Step => ({
  id: uid('s'),
  kind: 'steady',
  durationSec: Math.round(min * 60),
  lo: lo / 100,
  hi: hi / 100,
  ...opts,
})
export const ramp = (min: number, from: number, to: number, cadence?: number): Step => ({
  id: uid('s'),
  kind: 'ramp',
  durationSec: Math.round(min * 60),
  lo: from / 100,
  hi: to / 100,
  cadence,
})
export const sec = (name: string, steps: Step[], repeat = 1): Section => ({ id: uid('x'), name, repeat, steps })

const warmup = (min = 12) => sec('Warming-up', [ramp(min, 50, 72, 90)])
const warmupOpeners = () => sec('Warming-up', [ramp(12, 50, 72, 90), st(1, 100), st(2, 55), st(1, 110), st(3, 55)])
const cooldown = (min = 8) => sec('Cooling-down', [ramp(min, 60, 45, 85)])

export interface Template {
  stimulus: Stimulus
  name: string
  build: (p: number, mainMin?: number) => Section[]
  note: (p: number) => string
}

/** p = progressiestap binnen het blok (0, 1, 2 …). */
export const TEMPLATES: Record<string, Template> = {
  herstel: {
    stimulus: 'Herstel',
    name: 'Herstelrit',
    build: (_p, mainMin = 45) => [sec('Rustig rollen', [st(mainMin, 50, 55, { cadence: 90 })])],
    note: () => 'Echt rustig: hartslag laag houden, soepel trappen. Dit is een herstelprikkel, geen training.',
  },
  duur: {
    stimulus: 'Duur',
    name: 'Duurrit Z2',
    build: (_p, mainMin = 75) => [warmup(10), sec('Duur', [st(mainMin, 65, 75, { cadence: 88 })]), cooldown(5)],
    note: () =>
      'Aerobe basis. Gelijkmatig in Z2, praten moet kunnen. Eet elk half uur iets en drink regelmatig.',
  },
  lang: {
    stimulus: 'Duur',
    name: 'Lange duurrit',
    build: (_p, mainMin = 150) => [warmup(15), sec('Duur', [st(mainMin, 62, 72, { cadence: 88 })]), cooldown(5)],
    note: () =>
      'Lange rit voor aerobe capaciteit en vetverbranding. Vlak vermogen, niet harder bergop. Oefen je voeding: 60–80 g koolhydraten per uur.',
  },
  duurvermogen: {
    stimulus: 'Duurvermogen',
    name: 'Duurvermogen: tempo op vermoeide benen',
    build: (p, mainMin = 150) => [
      warmup(15),
      sec('Duur (kJ opbouwen)', [st(Math.max(60, mainMin - 45), 62, 72, { cadence: 88 })]),
      sec('Tempo op vermoeide benen', [st(12 + p * 3, 82, 88, { cadence: 85 }), st(4, 55)], 2 + (p > 1 ? 1 : 0)),
      cooldown(8),
    ],
    note: () =>
      'Durability-prikkel: eerst kilojoules opbouwen, daarna tempo-blokken. Het doel is vermogen vasthouden als de vermoeidheid oploopt, precies zoals in de finale van een koers.',
  },
  tempo: {
    stimulus: 'Tempo',
    name: 'Tempo-blokken',
    build: (p) => [warmup(), sec('Tempo', [st(15 + p * 5, 80, 86, { cadence: 90 }), st(5, 55)], 2), cooldown()],
    note: () => 'Stevig maar beheerst, net onder sweetspot. Houd je cadans rond 90 en rijd de blokken gelijkmatig.',
  },
  sweetspot: {
    stimulus: 'Sweetspot',
    name: 'Sweetspot',
    build: (p) => {
      const [reps, min] = [
        [3, 10],
        [3, 12],
        [3, 15],
        [2, 20],
      ][Math.min(p, 3)]
      return [warmup(), sec('Sweetspot', [st(min, 88, 93, { cadence: 88 }), st(5, 55)], reps), cooldown()]
    },
    note: (p) =>
      `Sweetspot bouwt drempelvermogen met beperkte vermoeidheid. ${p > 1 ? 'Langere blokken deze week: blijf onder 94%.' : 'Rijd de blokken gelijkmatig, niet harder aan het eind.'}`,
  },
  drempel: {
    stimulus: 'Drempel',
    name: 'Drempel over-unders',
    build: (p) => {
      const reps = [3, 3, 4, 4][Math.min(p, 3)]
      return [
        warmupOpeners(),
        sec('Over-unders', [st(3, 95), st(1, 105, 105, { cadence: 95 }), st(3, 95), st(1, 105, 105, { cadence: 95 }), st(4, 55)], reps),
        cooldown(),
      ]
    },
    note: () =>
      'Over-unders trainen lactaatklaring: de "overs" net boven drempel, de "unders" net eronder. Niet stoppen tussen de wissels.',
  },
  drempelLang: {
    stimulus: 'Drempel',
    name: 'Drempel lang',
    build: (p) => {
      const [reps, min] = [
        [3, 10],
        [3, 12],
        [2, 20],
        [2, 20],
      ][Math.min(p, 3)]
      return [warmupOpeners(), sec('Drempel', [st(min, 97, 102, { cadence: 90 }), st(5, 55)], reps), cooldown()]
    },
    note: () => 'Aan de drempel: zwaar maar vol te houden. Start op 97%, versnel alleen als het na de helft nog goed voelt.',
  },
  vo2: {
    stimulus: 'VO2max',
    name: 'VO2max-intervallen',
    build: (p) => {
      const [reps, min] = [
        [5, 3],
        [6, 3],
        [5, 4],
        [6, 4],
      ][Math.min(p, 3)]
      return [warmupOpeners(), sec('VO2max', [st(min, 112, 118, { cadence: 100 }), st(min, 50)], reps), cooldown(10)]
    },
    note: () =>
      'Maximale zuurstofopname. De eerste herhaling voelt makkelijk: niet overpacen. Hoge cadans en volledig herstel tussen de blokken.',
  },
  vo2kort: {
    stimulus: 'VO2max',
    name: '30/15 microintervallen',
    build: (p) => {
      const sets = p > 1 ? 3 : 2
      return [
        warmupOpeners(),
        sec('30/15', [st(0.5, 125, 125, { cadence: 105 }), st(0.25, 50)], 13),
        sec('Herstel', [st(6, 55)]),
        ...(sets > 2 ? [sec('30/15 (set 3)', [st(0.5, 125, 125, { cadence: 105 }), st(0.25, 50)], 13)] : []),
        sec('30/15 (slot)', [st(0.5, 125, 125, { cadence: 105 }), st(0.25, 50)], 13),
        cooldown(10),
      ]
    },
    note: () => 'Rønnestad-stijl 30/15: veel tijd dicht bij VO2max met korte herstelmomenten. Alles gelijk, geen sprintjes.',
  },
  anaeroob: {
    stimulus: 'Anaeroob',
    name: 'Anaerobe capaciteit',
    build: (p) => [
      warmupOpeners(),
      sec('1-minuut efforts', [st(1, 140, 150, { cadence: 105 }), st(4, 50)], 5 + Math.min(p, 2)),
      sec('Duur', [st(15, 65, 72)]),
      cooldown(),
    ],
    note: () => 'Traint W′: diep in de reserve en herstellen. Kwaliteit boven kwantiteit, stop als het vermogen >10% daalt.',
  },
  sprint: {
    stimulus: 'Sprint',
    name: 'Sprints',
    build: (p) => [
      warmupOpeners(),
      sec('Sprints', [st(0.25, 200, 200, { cue: 'Vol gas', cadence: 110 }), st(4.75, 55)], 6 + Math.min(p, 2) * 2),
      sec('Duur', [st(20, 65, 72)]),
      cooldown(),
    ],
    note: () => 'Maximale sprints van 15 seconden, zittend of staand. Volledig herstel ertussen: het gaat om piekvermogen.',
  },
  openers: {
    stimulus: 'VO2max',
    name: 'Openers',
    build: () => [warmup(15), sec('Openers', [st(1, 110), st(3, 55)], 3), sec('Rustig', [st(10, 60)]), cooldown(5)],
    note: () => 'Korte openers om de benen wakker te maken voor het doel. Kort en scherp, daarna rustig naar huis.',
  },
}

export type TemplateKey = keyof typeof TEMPLATES
