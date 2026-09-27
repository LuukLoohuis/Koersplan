export const uid = (prefix = '') =>
  prefix + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)

/** Datum als YYYY-MM-DD in lokale tijd. */
export function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d, 12) // 12:00 voorkomt DST-randgevallen
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000)
}

/** 0 = maandag … 6 = zondag */
export function weekday(s: string): number {
  return (parseDate(s).getDay() + 6) % 7
}

export function mondayOf(s: string): string {
  return addDays(s, -weekday(s))
}

export function today(): string {
  return isoDate(new Date())
}

export const DAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
export const DAY_LONG = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

export function fmtDate(s: string, withDay = false): string {
  const d = parseDate(s)
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return withDay ? `${DAY_SHORT[weekday(s)]} ${base}` : base
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h}:${String(m).padStart(2, '0')} u`
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d
