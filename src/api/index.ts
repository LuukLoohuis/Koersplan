import type {
  AppConfig,
  AthleteOverview,
  AthleteSummary,
  FeedbackEntry,
  GenerateRequest,
  Me,
  PublishResult,
  TrainingPlan,
} from '@shared/types'
import { localApi } from './local'

export interface Api {
  config(): Promise<AppConfig>
  me(): Promise<Me>
  athletes(): Promise<AthleteSummary[]>
  overview(id: string, fresh?: boolean): Promise<AthleteOverview>
  addAthlete(input: { remoteId: string; apiKey?: string; name?: string }): Promise<{ id: string }>
  /** Adres van het toestemmingsscherm van intervals.icu; de atleet wordt van de ingelogde coach */
  intervalsConnect(): Promise<{ url: string }>
  /** Uitnodigingslink voor een atleet (met login 14 dagen geldig) */
  intervalsInvite(): Promise<{ url: string; expiresAt?: string }>
  plans(athleteId: string): Promise<TrainingPlan[]>
  /** Met `replaces`: vervang dat voorstel, alleen als het nog een concept is (anders 409) */
  generate(athleteId: string, req: GenerateRequest & { replaces?: string }): Promise<{ plan: TrainingPlan; warning?: string; replaced?: string }>
  savePlan(plan: TrainingPlan): Promise<TrainingPlan>
  deletePlan(id: string): Promise<void>
  publish(planId: string): Promise<{ result: PublishResult; plan: TrainingPlan }>
  feedback(planId: string, workoutId: string, fb: Omit<FeedbackEntry, 'at'>): Promise<TrainingPlan>
}

// Met login: token meesturen, en bij 401 (sessie verlopen) uitloggen
let auth: { token: () => Promise<string | undefined>; onUnauthorized: () => void } = { token: async () => undefined, onUnauthorized: () => {} }
export const setApiAuth = (a: typeof auth) => {
  auth = a
}

async function j<T>(method: string, url: string, body?: unknown): Promise<T> {
  const token = await auth.token()
  const headers: Record<string, string> = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) auth.onUnauthorized()
  if (!res.ok) throw new Error((data as { error?: string }).error || `Serverfout ${res.status}`)
  return data as T
}

const httpApi: Api = {
  config: () => j('GET', '/api/config'),
  me: () => j('GET', '/api/me'),
  athletes: () => j('GET', '/api/athletes'),
  overview: (id, fresh) => j('GET', `/api/athletes/${id}/overview${fresh ? '?fresh=1' : ''}`),
  addAthlete: (input) => j('POST', '/api/athletes', input),
  intervalsConnect: () => j('POST', '/api/intervals/connect'),
  intervalsInvite: () => j('GET', '/api/intervals/invite'),
  plans: (id) => j('GET', `/api/athletes/${id}/plans`),
  generate: (id, req) => j('POST', `/api/athletes/${id}/generate`, req),
  savePlan: (p) => j('PUT', `/api/plans/${p.id}`, p),
  deletePlan: async (id) => {
    await j('DELETE', `/api/plans/${id}`)
  },
  publish: (id) => j('POST', `/api/plans/${id}/publish`),
  feedback: (pid, wid, fb) => j('POST', `/api/plans/${pid}/workouts/${wid}/feedback`, fb),
}

export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === 'true'
export const api: Api = STATIC_DEMO ? localApi : httpApi
