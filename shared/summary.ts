import type { Activity, AthleteSummary, CpModel, WellnessDay } from './types'
import { daysBetween, round, today } from './util'

interface Input {
  id: string
  name: string
  source: AthleteSummary['source']
  ftp: number
  weightKg?: number
  wellness: WellnessDay[]
  activities: Activity[] // nieuwste eerst
  model: CpModel | null
  goal?: string
}

/** Samenvatting + aandachtspunten per atleet (de "wat vraagt aandacht"-kolom). */
export function summarize(i: Input): AthleteSummary {
  const last = [...i.wellness].reverse().find((w) => w.ctl != null) ?? { ctl: 0, atl: 0, rampRate: 0 }
  const ctl = round(last.ctl ?? 0, 1)
  const atl = round(last.atl ?? 0, 1)
  const tsb = round(ctl - atl, 1)
  const rampRate = round(last.rampRate ?? 0, 1)
  const lastActivity = i.activities[0]?.date
  const flags: string[] = []

  // gelijk aan de vormzone "Hoog risico" (design system: < −30); −30…−10 is "Optimaal"
  if (tsb < -30) flags.push('Hoge vermoeidheid')
  else if (tsb > 15) flags.push('Fris: ruimte voor prikkel')
  if (rampRate > 8) flags.push('Snelle opbouw')
  if (lastActivity && daysBetween(lastActivity, today()) >= 5) flags.push(`${daysBetween(lastActivity, today())} dagen geen training`)
  if (!lastActivity) flags.push('Nog geen activiteiten')

  const hrv = i.wellness.filter((w) => w.hrv).map((w) => w.hrv as number)
  if (hrv.length >= 28) {
    const recent = avg(hrv.slice(-3))
    const base = avg(hrv.slice(-28))
    if (recent < base * 0.9) flags.push('HRV onder baseline')
  }
  if (i.model && i.ftp && Math.abs(i.model.cp - i.ftp) / i.ftp > 0.06) {
    flags.push(i.model.cp > i.ftp ? 'FTP lijkt te laag' : 'FTP lijkt te hoog')
  }

  return {
    id: i.id,
    name: i.name,
    source: i.source,
    ftp: i.ftp,
    weightKg: i.weightKg,
    ctl,
    atl,
    tsb,
    rampRate,
    cp: i.model?.cp,
    wPrime: i.model?.wPrime,
    lastActivity,
    flags,
    goal: i.goal,
  }
}

const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)
