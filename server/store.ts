import fs from 'node:fs'
import path from 'node:path'
import type { TrainingPlan } from '../shared/types'
import { decrypt, encrypt } from './crypto'
import { check, sb, supabaseEnabled } from './supabase'

/**
 * Opslag van koppelingen en koersen. Met Supabase in .env: Postgres, tokens
 * versleuteld (server/crypto.ts). Zonder: een JSON-bestand voor lokaal
 * proberen, tokens onversleuteld.
 */

export interface Connection {
  id: string // lokale id, bv. "icu-2049151"
  remoteId: string // intervals.icu athlete id
  name: string
  source: 'oauth' | 'apikey' | 'demo'
  token?: string // OAuth bearer
  apiKey?: string // eigen key; leeg = INTERVALS_API_KEY uit .env
  coachId?: string // profiel van de coach die de atleet begeleidt
  userId?: string // profiel van de atleet zelf (inloggen)
  connectedAt: string
}

export interface PlanRecord extends TrainingPlan {
  publishedExternalIds?: string[]
}

export interface Store {
  kind: 'bestand' | 'supabase'
  /** Echte koppelingen, zonder demo-atleten. */
  connections(): Promise<Connection[]>
  connection(id: string): Promise<Connection | undefined>
  upsertConnection(c: Connection): Promise<void>
  removeConnection(id: string): Promise<void>
  /** Demo-atleten als rij, zodat hun koersen een eigenaar hebben. */
  ensureDemo(athletes: { id: string; name: string }[]): Promise<void>
  plans(athleteId?: string): Promise<PlanRecord[]>
  plan(id: string): Promise<PlanRecord | undefined>
  savePlan(p: PlanRecord): Promise<void>
  deletePlan(id: string): Promise<void>
}

const byNewest = (a: PlanRecord, b: PlanRecord) => b.createdAt.localeCompare(a.createdAt)

// ── JSON-bestand (zonder Supabase) ──────────────────────────────────────────
function fileStore(): Store {
  const FILE = path.resolve(process.cwd(), 'data/db.json')
  interface Db {
    connections: Connection[]
    plans: PlanRecord[]
  }
  let db: Db
  try {
    db = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Db
  } catch {
    db = { connections: [], plans: [] }
  }
  const save = () => {
    fs.mkdirSync(path.dirname(FILE), { recursive: true })
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
  }
  return {
    kind: 'bestand',
    connections: async () => db.connections.filter((c) => c.source !== 'demo'),
    connection: async (id) => db.connections.find((c) => c.id === id),
    async upsertConnection(c) {
      db.connections = [...db.connections.filter((x) => x.id !== c.id), c]
      save()
    },
    async removeConnection(id) {
      db.connections = db.connections.filter((c) => c.id !== id)
      db.plans = db.plans.filter((p) => p.athleteId !== id)
      save()
    },
    async ensureDemo() {},
    plans: async (athleteId) => db.plans.filter((p) => !athleteId || p.athleteId === athleteId).sort(byNewest),
    plan: async (id) => db.plans.find((p) => p.id === id),
    async savePlan(p) {
      db.plans = [...db.plans.filter((x) => x.id !== p.id), p]
      save()
    },
    async deletePlan(id) {
      db.plans = db.plans.filter((p) => p.id !== id)
      save()
    },
  }
}

// ── Supabase ────────────────────────────────────────────────────────────────
interface AthleteRow {
  id: string
  intervals_id: string | null
  name: string
  source: Connection['source']
  coach_id: string | null
  user_id: string | null
  token_enc: string | null
  api_key_enc: string | null
  connected_at: string
}

const toConnection = (r: AthleteRow): Connection => ({
  id: r.id,
  remoteId: r.intervals_id ?? '',
  name: r.name,
  source: r.source,
  token: r.token_enc ? decrypt(r.token_enc) : undefined,
  apiKey: r.api_key_enc ? decrypt(r.api_key_enc) : undefined,
  coachId: r.coach_id ?? undefined,
  userId: r.user_id ?? undefined,
  connectedAt: r.connected_at,
})

const toRow = (c: Connection): AthleteRow => ({
  id: c.id,
  intervals_id: c.remoteId || null,
  name: c.name,
  source: c.source,
  coach_id: c.coachId ?? null,
  user_id: c.userId ?? null,
  token_enc: c.token ? encrypt(c.token) : null,
  api_key_enc: c.apiKey ? encrypt(c.apiKey) : null,
  connected_at: c.connectedAt,
})

function supabaseStore(): Store {
  const athletes = () => sb().from('athletes')
  const plans = () => sb().from('plans')
  return {
    kind: 'supabase',
    async connections() {
      const rows = check(await athletes().select('*').neq('source', 'demo').order('connected_at'), 'atleten lezen')
      return (rows as AthleteRow[]).map(toConnection)
    },
    async connection(id) {
      const row = check(await athletes().select('*').eq('id', id).maybeSingle(), 'atleet lezen')
      return row ? toConnection(row as AthleteRow) : undefined
    },
    async upsertConnection(c) {
      check(await athletes().upsert(toRow(c)), 'atleet opslaan')
    },
    async removeConnection(id) {
      check(await athletes().delete().eq('id', id), 'atleet verwijderen') // koersen gaan mee (on delete cascade)
    },
    async ensureDemo(list) {
      const rows = list.map((a) => ({ id: a.id, name: a.name, source: 'demo' as const }))
      check(await athletes().upsert(rows, { onConflict: 'id', ignoreDuplicates: true }), 'demo-atleten opslaan')
    },
    async plans(athleteId) {
      let q = plans().select('data').order('created_at', { ascending: false })
      if (athleteId) q = q.eq('athlete_id', athleteId)
      return (check(await q, 'koersen lezen') as { data: PlanRecord }[]).map((r) => r.data)
    },
    async plan(id) {
      const row = check(await plans().select('data').eq('id', id).maybeSingle(), 'koers lezen')
      return (row as { data: PlanRecord } | null)?.data
    },
    async savePlan(p) {
      const row = { id: p.id, athlete_id: p.athleteId, status: p.status, data: p, created_at: p.createdAt, updated_at: new Date().toISOString() }
      check(await plans().upsert(row), 'koers opslaan')
    },
    async deletePlan(id) {
      check(await plans().delete().eq('id', id), 'koers verwijderen')
    },
  }
}

export const store: Store = supabaseEnabled() ? supabaseStore() : fileStore()
