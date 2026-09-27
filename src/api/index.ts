import type {
  AppConfig,
  AthleteOverview,
  AthleteSummary,
  FeedbackEntry,
  GenerateRequest,
  PublishResult,
  TrainingPlan,
} from '@shared/types'
import { localApi } from './local'

export interface Api {
  config(): Promise<AppConfig>
  athletes(): Promise<AthleteSummary[]>
  overview(id: string, fresh?: boolean): Promise<AthleteOverview>
  addAthlete(input: { remoteId: string; apiKey?: string; name?: string }): Promise<{ id: string }>
  plans(athleteId: string): Promise<TrainingPlan[]>
  generate(athleteId: string, req: GenerateRequest): Promise<{ plan: TrainingPlan; warning?: string }>
  savePlan(plan: TrainingPlan): Promise<TrainingPlan>
  deletePlan(id: string): Promise<void>
  publish(planId: string): Promise<{ result: PublishResult; plan: TrainingPlan }>
  feedback(planId: string, workoutId: string, fb: Omit<FeedbackEntry, 'at'>): Promise<TrainingPlan>
}

async function j<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error || `Serverfout ${res.status}`)
  return data as T
}

const httpApi: Api = {
  config: () => j('GET', '/api/config'),
  athletes: () => j('GET', '/api/athletes'),
  overview: (id, fresh) => j('GET', `/api/athletes/${id}/overview${fresh ? '?fresh=1' : ''}`),
  addAthlete: (input) => j('POST', '/api/athletes', input),
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
