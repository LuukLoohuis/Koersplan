import type { Activity, AthleteOverview, PowerPoint, WellnessDay } from './types'
import { fitCpModel, pmcFromLoads } from './metrics'
import { addDays, round, today, weekday } from './util'
import { summarize } from './summary'

// Synthetische, maar realistische atleten voor de demo-modus.
// Alle namen zijn verzonnen.

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface Persona {
  id: string
  name: string
  seed: number
  ftp: number
  weightKg: number
  cp: number
  wPrime: number
  pmax: number
  /** gemiddelde dagbelasting aan het begin → eind van de 180 dagen */
  loadFrom: number
  loadTo: number
  /** laatste N dagen extra zwaar (vermoeidheid) of leeg (geen data) */
  tail?: { days: number; factor: number }
  goal: string
  restDays: number[]
}

const PERSONAS: Persona[] = [
  {
    id: 'demo-sanne',
    name: 'Sanne de Vries',
    seed: 11,
    ftp: 248,
    weightKg: 61,
    cp: 242,
    wPrime: 17800,
    pmax: 860,
    loadFrom: 45,
    loadTo: 68,
    goal: 'Gran Fondo Limburg (160 km), eind oktober',
    restDays: [0, 4],
  },
  {
    id: 'demo-joris',
    name: 'Joris Bakker',
    seed: 23,
    ftp: 312,
    weightKg: 77,
    cp: 305,
    wPrime: 21400,
    pmax: 1240,
    loadFrom: 70,
    loadTo: 88,
    tail: { days: 10, factor: 1.55 },
    goal: 'Clubkampioenschap tijdrit',
    restDays: [0],
  },
  {
    id: 'demo-mila',
    name: 'Mila Jansen',
    seed: 37,
    ftp: 206,
    weightKg: 58,
    cp: 199,
    wPrime: 14200,
    pmax: 720,
    loadFrom: 28,
    loadTo: 42,
    tail: { days: 6, factor: 0 },
    goal: 'Eerste 200 km-brevet in het voorjaar',
    restDays: [0, 2, 4],
  },
]

const DAYS = 180

function powerCurve(p: Persona, r: () => number): PowerPoint[] {
  const secs = [1, 2, 5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 420, 600, 720, 900, 1200, 1800, 2400, 3600, 5400, 7200]
  return secs.map((s) => {
    // 3-parameter model (Morton) met afname voor lange duur
    let w = p.wPrime / (s + p.wPrime / (p.pmax - p.cp)) + p.cp
    if (s > 1200) w *= 1 - 0.075 * Math.log(s / 1200)
    return { secs: s, watts: round(w * (0.97 + r() * 0.035)) }
  })
}

const NAMES: Record<string, string[]> = {
  duur: ['Duurrit', 'Rondje Heuvelrug', 'Koffierit', 'Z2 langs de Vecht'],
  lang: ['Lange duurrit', 'Clubrit zaterdag', 'Rondje Veluwe'],
  kern: ['Sweetspot 3×12', 'Drempel 2×20', 'VO2 5×4', 'Over-unders', 'Zwift race'],
  herstel: ['Herstelrit', 'Rustig rollen'],
}

export function demoOverview(id: string): AthleteOverview | null {
  const p = PERSONAS.find((x) => x.id === id)
  if (!p) return null
  const r = rng(p.seed)
  const end = today()
  const start = addDays(end, -(DAYS - 1))
  const loads: number[] = []
  const activities: Activity[] = []

  for (let i = 0; i < DAYS; i++) {
    const date = addDays(start, i)
    const wd = weekday(date)
    const base = p.loadFrom + ((p.loadTo - p.loadFrom) * i) / DAYS
    const blockWeek = Math.floor(i / 7) % 4 // 3:1-ritme
    let factor = blockWeek === 3 ? 0.6 : 1 + blockWeek * 0.06
    if (p.tail && i >= DAYS - p.tail.days) factor *= p.tail.factor
    let load = 0
    let kind: keyof typeof NAMES = 'duur'
    if (!p.restDays.includes(wd) && r() > 0.06) {
      const weekly = base * 7 * factor
      const share = wd === 5 || wd === 6 ? 0.26 : wd === 1 || wd === 3 ? 0.17 : 0.1
      load = weekly * share * (0.8 + r() * 0.4)
      kind = wd === 5 || wd === 6 ? 'lang' : wd === 1 || wd === 3 ? 'kern' : r() > 0.5 ? 'duur' : 'herstel'
    }
    load = round(load)
    loads.push(load)
    if (load > 0) {
      const intensity = kind === 'kern' ? 0.84 + r() * 0.08 : kind === 'herstel' ? 0.55 + r() * 0.05 : 0.66 + r() * 0.07
      const hours = load / (intensity * intensity * 100)
      const names = NAMES[kind]
      activities.push({
        id: `${p.id}-a${i}`,
        date,
        name: names[Math.floor(r() * names.length)],
        type: kind === 'kern' && r() > 0.5 ? 'VirtualRide' : 'Ride',
        movingTimeSec: round(hours * 3600),
        distanceKm: round(hours * (kind === 'kern' ? 31 : 28 + r() * 4), 1),
        load,
        intensity: round(intensity, 2),
        avgWatts: round(p.ftp * intensity * 0.93),
        normWatts: round(p.ftp * intensity),
      })
    }
  }

  const wellness: WellnessDay[] = pmcFromLoads(start, loads, p.loadFrom * 0.9, p.loadFrom * 0.9).map((d, i) => {
    const fatigue = Math.max(0, d.atl - d.ctl)
    return {
      ...d,
      hrv: round(62 + (p.seed % 7) - fatigue * 0.35 + (r() - 0.5) * 8),
      restingHR: round(48 + fatigue * 0.12 + (r() - 0.5) * 3),
      sleepHours: round(7.2 + (r() - 0.5) * 1.4 - (i > DAYS - 5 && fatigue > 20 ? 0.8 : 0), 1),
    }
  })

  const curve = powerCurve(p, r)
  const model = fitCpModel(curve)
  const recent = activities.filter((a) => a.date >= addDays(end, -89)).reverse()

  return {
    athlete: summarize({
      id: p.id,
      name: p.name,
      source: 'demo',
      ftp: p.ftp,
      weightKg: p.weightKg,
      wellness,
      activities: recent,
      model,
      goal: p.goal,
    }),
    wellness,
    activities: recent,
    powerCurve: curve,
    model,
    plannedLoad: [],
  }
}

export const DEMO_IDS = PERSONAS.map((p) => p.id)
