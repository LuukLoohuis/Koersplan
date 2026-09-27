import type { Activity, AthleteOverview, Goal, PowerPoint, WellnessDay } from '../shared/types'
import type { IntervalsEventPayload } from '../shared/intervalsText'
import { fitCpModel } from '../shared/metrics'
import { summarize } from '../shared/summary'
import { addDays, round, today } from '../shared/util'
import type { Connection } from './store'

const BASE = 'https://intervals.icu/api/v1'

/**
 * Dunne client voor de intervals.icu REST API.
 * Auth: OAuth bearer token, óf basic auth met gebruikersnaam "API_KEY".
 * Docs: https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090
 */
export class IntervalsClient {
  constructor(
    private auth: { bearer?: string; apiKey?: string },
    public athleteId: string,
  ) {}

  static forConnection(c: Connection): IntervalsClient {
    if (c.token) return new IntervalsClient({ bearer: c.token }, c.remoteId)
    const key = c.apiKey || process.env.INTERVALS_API_KEY
    if (!key) throw new Error('Geen API-key: zet INTERVALS_API_KEY in .env of koppel via OAuth')
    return new IntervalsClient({ apiKey: key }, c.remoteId)
  }

  private headers(): Record<string, string> {
    if (this.auth.bearer) return { Authorization: `Bearer ${this.auth.bearer}` }
    return { Authorization: 'Basic ' + Buffer.from(`API_KEY:${this.auth.apiKey}`).toString('base64') }
  }

  async request<T>(method: string, pathname: string, body?: unknown): Promise<T> {
    const res = await fetch(BASE + pathname, {
      method,
      headers: { ...this.headers(), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const hint =
        res.status === 401
          ? 'Toegang geweigerd: controleer token/API-key.'
          : res.status === 403
            ? 'Geen rechten voor deze atleet of scope ontbreekt (bv. CALENDAR:WRITE).'
            : ''
      throw new Error(`intervals.icu ${method} ${pathname} → ${res.status}. ${hint} ${text.slice(0, 200)}`.trim())
    }
    const ct = res.headers.get('content-type') || ''
    return (ct.includes('json') ? await res.json() : await res.text()) as T
  }

  private a(p: string) {
    return `/athlete/${encodeURIComponent(this.athleteId)}${p}`
  }

  athlete() {
    return this.request<{ id: string; name?: string; icu_weight?: number; weight?: number }>('GET', this.a(''))
  }
  sportSettings() {
    return this.request<{ types: string[]; ftp?: number; indoor_ftp?: number }[]>('GET', this.a('/sport-settings'))
  }
  wellness(oldest: string, newest: string) {
    return this.request<Record<string, unknown>[]>('GET', this.a(`/wellness?oldest=${oldest}&newest=${newest}`))
  }
  activities(oldest: string, newest: string) {
    return this.request<Record<string, unknown>[]>('GET', this.a(`/activities?oldest=${oldest}&newest=${newest}`))
  }
  powerCurve(oldest: string, newest: string, type = 'Ride') {
    return this.request<{ list?: { secs: number[]; values: number[] }[] }>(
      'GET',
      this.a(`/power-curves?type=${type}&curves=r.${oldest}.${newest}`),
    )
  }
  events(oldest: string, newest: string) {
    return this.request<Record<string, unknown>[]>('GET', this.a(`/events?oldest=${oldest}&newest=${newest}`))
  }
  /** Upsert op external_id: opnieuw publiceren werkt bestaande workouts bij. */
  upsertEvents(events: IntervalsEventPayload[]) {
    return this.request<{ id: number; external_id?: string }[]>('POST', this.a('/events/bulk?upsert=true'), events)
  }
  deleteEvents(externalIds: string[]) {
    return this.request<unknown>(
      'PUT',
      this.a('/events/bulk-delete'),
      externalIds.map((external_id) => ({ external_id })),
    )
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Haalt alles op wat het dashboard nodig heeft en zet het om naar het Koersplan-model. */
export async function fetchOverview(conn: Connection): Promise<AthleteOverview> {
  const c = IntervalsClient.forConnection(conn)
  const end = today()
  const start = addDays(end, -179)
  const [athlete, settings, wellnessRaw, activitiesRaw, curveRaw, eventsRaw] = await Promise.all([
    c.athlete().catch(() => null),
    c.sportSettings().catch(() => []),
    c.wellness(start, end),
    c.activities(addDays(end, -89), end),
    c.powerCurve(addDays(end, -89), end).catch(() => ({ list: [] })),
    c.events(end, addDays(end, 90)).catch(() => []),
  ])

  const ride = settings.find((s) => s.types?.includes('Ride')) ?? settings[0]
  const ftp = ride?.ftp || ride?.indoor_ftp || 250

  const wellness: WellnessDay[] = wellnessRaw
    .map((w) => ({
      date: String(w.id).slice(0, 10),
      ctl: num(w.ctl) ?? 0,
      atl: num(w.atl) ?? 0,
      rampRate: num(w.rampRate),
      hrv: num(w.hrv),
      restingHR: num(w.restingHR),
      sleepHours: num(w.sleepSecs) ? round((w.sleepSecs as number) / 3600, 1) : undefined,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const activities: Activity[] = activitiesRaw
    .map((a) => ({
      id: String(a.id),
      date: String(a.start_date_local).slice(0, 10),
      name: String(a.name ?? a.type ?? 'Activiteit'),
      type: String(a.type ?? ''),
      movingTimeSec: num(a.moving_time) ?? 0,
      distanceKm: num(a.distance) ? round((a.distance as number) / 1000, 1) : undefined,
      load: num(a.icu_training_load) ?? 0,
      intensity: num(a.icu_intensity) ? round((a.icu_intensity as number) / 100, 2) : undefined,
      avgWatts: num(a.icu_average_watts) ?? num(a.average_watts),
      normWatts: num(a.icu_weighted_avg_watts),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))

  const curve0 = curveRaw.list?.[0]
  const powerCurve: PowerPoint[] = curve0
    ? curve0.secs.map((s, i) => ({ secs: s, watts: curve0.values[i] })).filter((p) => p.watts > 0)
    : []
  const model = fitCpModel(powerCurve)

  const plannedLoad = eventsRaw
    .filter((e) => e.category === 'WORKOUT' && !String(e.external_id ?? '').startsWith('koersplan:'))
    .map((e) => ({
      date: String(e.start_date_local).slice(0, 10),
      load: num(e.icu_training_load) ?? 0,
      name: String(e.name ?? 'Workout'),
    }))

  const goals: Goal[] = eventsRaw
    .filter((e) => /^RACE_[ABC]$/.test(String(e.category)))
    .map((e) => ({
      date: String(e.start_date_local).slice(0, 10),
      label: String(e.category).slice(-1) as Goal['label'],
      name: String(e.name ?? 'Koers'),
    }))

  return {
    athlete: summarize({
      id: conn.id,
      name: athlete?.name || conn.name,
      source: conn.source,
      ftp,
      weightKg: athlete?.icu_weight ?? athlete?.weight,
      wellness,
      activities,
      model,
    }),
    wellness,
    activities,
    powerCurve,
    model,
    plannedLoad,
    goals,
  }
}
