import fs from 'node:fs'
import path from 'node:path'
import type { TrainingPlan } from '../shared/types'

/**
 * Minimale JSON-opslag voor het prototype. Vervang door Supabase/Postgres
 * (tabellen: connections, plans, workouts, feedback) voor productie.
 * Tokens staan hier onversleuteld: prima lokaal, niet in productie.
 */

export interface Connection {
  id: string // lokale id, bv. "icu-2049151"
  remoteId: string // intervals.icu athlete id
  name: string
  source: 'oauth' | 'apikey'
  token?: string // OAuth bearer
  apiKey?: string // eigen key; leeg = INTERVALS_API_KEY uit .env
  role: 'coach' | 'athlete'
  connectedAt: string
}

export interface PlanRecord extends TrainingPlan {
  publishedExternalIds?: string[]
}

interface Db {
  connections: Connection[]
  plans: PlanRecord[]
}

const FILE = path.resolve(process.cwd(), 'data/db.json')

function load(): Db {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Db
  } catch {
    return { connections: [], plans: [] }
  }
}

let db = load()

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true })
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2))
}

export const store = {
  connections: () => db.connections,
  connection: (id: string) => db.connections.find((c) => c.id === id),
  upsertConnection(c: Connection) {
    db.connections = [...db.connections.filter((x) => x.id !== c.id), c]
    save()
  },
  removeConnection(id: string) {
    db.connections = db.connections.filter((c) => c.id !== id)
    save()
  },
  plans: (athleteId?: string) =>
    db.plans.filter((p) => !athleteId || p.athleteId === athleteId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  plan: (id: string) => db.plans.find((p) => p.id === id),
  savePlan(p: PlanRecord) {
    db.plans = [...db.plans.filter((x) => x.id !== p.id), p]
    save()
  },
  deletePlan(id: string) {
    db.plans = db.plans.filter((p) => p.id !== id)
    save()
  },
  reload() {
    db = load()
  },
}
