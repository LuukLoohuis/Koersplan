import type { CpModel, PowerPoint, Section, Step, WellnessDay, Workout } from './types'
import { addDays, round } from './util'

// ─────────────────────────────────────────────────────────────
// Workout-tijdlijn
// ─────────────────────────────────────────────────────────────

/** Aanname voor 'freeride' (ERG uit) bij het schatten van belasting. */
export const FREERIDE_INTENSITY = 0.65

export interface Segment {
  start: number
  dur: number
  from: number // fractie FTP bij start
  to: number // fractie FTP bij eind
  kind: Step['kind']
  sectionName: string
  stepId: string
}

export function stepMid(s: Step): number {
  if (s.kind === 'freeride') return FREERIDE_INTENSITY
  return (s.lo + s.hi) / 2
}

/** Vlakt secties × herhalingen af tot een tijdlijn. */
export function flatten(sections: Section[]): Segment[] {
  const out: Segment[] = []
  let t = 0
  for (const sec of sections) {
    const reps = Math.max(1, Math.round(sec.repeat || 1))
    for (let r = 0; r < reps; r++) {
      for (const st of sec.steps) {
        const dur = Math.max(0, Math.round(st.durationSec))
        if (!dur) continue
        const from = st.kind === 'ramp' ? st.lo : stepMid(st)
        const to = st.kind === 'ramp' ? st.hi : stepMid(st)
        out.push({ start: t, dur, from, to, kind: st.kind, sectionName: sec.name, stepId: st.id })
        t += dur
      }
    }
  }
  return out
}

/** Intensiteit (fractie FTP) per seconde. */
export function perSecond(segs: Segment[]): Float32Array {
  const total = segs.reduce((a, s) => a + s.dur, 0)
  const arr = new Float32Array(total)
  for (const s of segs) {
    for (let i = 0; i < s.dur; i++) {
      arr[s.start + i] = s.from + ((s.to - s.from) * (i + 0.5)) / s.dur
    }
  }
  return arr
}

export interface WorkoutMetrics {
  durationSec: number
  tss: number
  intensityFactor: number
  kj: number
  avgWatts: number
  normWatts: number
  timeInZone: number[] // seconden in Z1..Z7
  /** Laagste W'-balans (J) volgens Skiba, alleen als CP/W' bekend is */
  minWbal?: number
  wbalEmptied?: boolean
}

export const ZONES = [
  { key: 'Z1', name: 'Herstel', max: 0.55 },
  { key: 'Z2', name: 'Duur', max: 0.75 },
  { key: 'Z3', name: 'Tempo', max: 0.9 },
  { key: 'Z4', name: 'Drempel', max: 1.05 },
  { key: 'Z5', name: 'VO2max', max: 1.2 },
  { key: 'Z6', name: 'Anaeroob', max: 1.5 },
  { key: 'Z7', name: 'Neuromusculair', max: Infinity },
]

export function zoneIndex(frac: number): number {
  return ZONES.findIndex((z) => frac < z.max)
}

/**
 * Belasting zoals TrainingPeaks/intervals.icu: NP via 30s-voortschrijdend gemiddelde,
 * IF = NP/FTP, TSS = uren × IF² × 100.
 */
export function workoutMetrics(
  sections: Section[],
  ftp: number,
  model?: Pick<CpModel, 'cp' | 'wPrime'> | null,
): WorkoutMetrics {
  const segs = flatten(sections)
  const p = perSecond(segs)
  const n = p.length
  const timeInZone = new Array(ZONES.length).fill(0)
  if (!n) return { durationSec: 0, tss: 0, intensityFactor: 0, kj: 0, avgWatts: 0, normWatts: 0, timeInZone }

  let sum = 0
  for (let i = 0; i < n; i++) {
    sum += p[i]
    timeInZone[zoneIndex(p[i])]++
  }
  // 30s rolling average ^4
  let win = 0
  let acc4 = 0
  let cnt = 0
  for (let i = 0; i < n; i++) {
    win += p[i]
    if (i >= 30) win -= p[i - 30]
    const avg = win / Math.min(i + 1, 30)
    acc4 += avg ** 4
    cnt++
  }
  const npFrac = (acc4 / cnt) ** 0.25
  const hours = n / 3600
  const metrics: WorkoutMetrics = {
    durationSec: n,
    tss: round(hours * npFrac * npFrac * 100),
    intensityFactor: round(npFrac, 2),
    kj: round(((sum / n) * ftp * n) / 1000),
    avgWatts: round((sum / n) * ftp),
    normWatts: round(npFrac * ftp),
    timeInZone,
  }
  if (model && model.cp > 0 && model.wPrime > 0) {
    const w = wbalSeries(p, ftp, model.cp, model.wPrime)
    let min = model.wPrime
    for (let i = 0; i < w.length; i++) if (w[i] < min) min = w[i]
    metrics.minWbal = round(min)
    metrics.wbalEmptied = min <= 0.05 * model.wPrime
  }
  return metrics
}

/**
 * W'-balans volgens Skiba (2012, differentiële vorm):
 *  boven CP: W'bal -= (P − CP)·dt
 *  onder CP: W'bal herstelt met τ = 546·e^(−0,01·(CP − P)) + 316
 */
export function wbalSeries(p: Float32Array, ftp: number, cp: number, wPrime: number): Float32Array {
  const out = new Float32Array(p.length)
  let bal = wPrime
  for (let i = 0; i < p.length; i++) {
    const watts = p[i] * ftp
    if (watts > cp) {
      bal -= watts - cp
    } else {
      const tau = 546 * Math.exp(-0.01 * (cp - watts)) + 316
      bal = wPrime - (wPrime - bal) * Math.exp(-1 / tau)
    }
    out[i] = Math.max(bal, 0)
  }
  return out
}

/** Downsampled profiel voor grafieken. */
export function workoutProfile(
  sections: Section[],
  ftp: number,
  model?: Pick<CpModel, 'cp' | 'wPrime'> | null,
  resolution = 10,
) {
  const p = perSecond(flatten(sections))
  const w = model && model.cp > 0 ? wbalSeries(p, ftp, model.cp, model.wPrime) : null
  const pts: { t: number; pct: number; watts: number; wbal?: number; zone: number }[] = []
  for (let i = 0; i < p.length; i += resolution) {
    pts.push({
      t: i,
      pct: round(p[i] * 100),
      watts: round(p[i] * ftp),
      wbal: w ? round(w[i] / 1000, 1) : undefined,
      zone: zoneIndex(p[i]),
    })
  }
  return pts
}

export function planTotals(workouts: Workout[], ftp: number) {
  let tss = 0
  let sec = 0
  for (const w of workouts) {
    const m = workoutMetrics(w.sections, ftp)
    tss += m.tss
    sec += m.durationSec
  }
  return { tss: round(tss), durationSec: sec }
}

// ─────────────────────────────────────────────────────────────
// Fitness / vermoeidheid / vorm (Banister, zoals intervals.icu)
// ─────────────────────────────────────────────────────────────

export const CTL_DAYS = 42
export const ATL_DAYS = 7

export interface PmcPoint {
  date: string
  ctl: number
  atl: number
  tsb: number
  load?: number
  projected?: boolean
}

/**
 * Projecteert CTL/ATL vooruit met geplande belasting per datum.
 * Vorm (TSB) = CTL − ATL op dezelfde dag, gelijk aan de historische reeks.
 */
export function projectPmc(
  start: { date: string; ctl: number; atl: number },
  loads: Map<string, number>,
  days: number,
): PmcPoint[] {
  const kc = 1 - Math.exp(-1 / CTL_DAYS)
  const ka = 1 - Math.exp(-1 / ATL_DAYS)
  let ctl = start.ctl
  let atl = start.atl
  const out: PmcPoint[] = []
  for (let i = 1; i <= days; i++) {
    const date = addDays(start.date, i)
    const load = loads.get(date) ?? 0
    ctl += (load - ctl) * kc
    atl += (load - atl) * ka
    out.push({ date, ctl: round(ctl, 1), atl: round(atl, 1), tsb: round(ctl - atl, 1), load, projected: true })
  }
  return out
}

/** Berekent een PMC uit dagelijkse belasting (gebruikt voor demo-data). */
export function pmcFromLoads(startDate: string, loads: number[], ctl0 = 30, atl0 = 30): WellnessDay[] {
  const kc = 1 - Math.exp(-1 / CTL_DAYS)
  const ka = 1 - Math.exp(-1 / ATL_DAYS)
  let ctl = ctl0
  let atl = atl0
  const out: WellnessDay[] = []
  loads.forEach((load, i) => {
    ctl += (load - ctl) * kc
    atl += (load - atl) * ka
    out.push({ date: addDays(startDate, i), ctl: round(ctl, 1), atl: round(atl, 1) })
  })
  // ramp rate = CTL-verandering over 7 dagen
  out.forEach((d, i) => {
    d.rampRate = i >= 7 ? round(d.ctl - out[i - 7].ctl, 1) : 0
  })
  return out
}

// ─────────────────────────────────────────────────────────────
// Critical Power-model
// ─────────────────────────────────────────────────────────────

/**
 * 2-parameter CP-model uit de power-duration curve: arbeid W = CP·t + W'.
 * Lineaire regressie over maximale inspanningen tussen 2 en 20 minuten.
 */
export function fitCpModel(curve: PowerPoint[]): CpModel | null {
  const pts = curve.filter((p) => p.secs >= 120 && p.secs <= 1200 && p.watts > 0)
  if (pts.length < 3) return null
  const xs = pts.map((p) => p.secs)
  const ys = pts.map((p) => p.watts * p.secs)
  const n = xs.length
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  const cp = sxy / sxx
  const wPrime = my - cp * mx
  if (!(cp > 50) || !(wPrime > 1000)) return null
  const pmax = Math.max(0, ...curve.filter((p) => p.secs <= 5).map((p) => p.watts))
  return {
    cp: round(cp),
    wPrime: round(wPrime),
    pmax: pmax || undefined,
    r2: round((sxy * sxy) / (sxx * syy), 3),
    points: n,
  }
}

/** Modelcurve P(t) = CP + W'/t (alleen zinvol tussen ~2 en ~30 min). */
export function cpCurve(model: CpModel, secs: number[]): PowerPoint[] {
  return secs.map((s) => ({ secs: s, watts: round(model.cp + model.wPrime / s) }))
}
