/**
 * Zet koppelingen en koersen uit data/db.json (opslag zonder Supabase) over naar
 * Supabase. Tokens worden daarbij versleuteld. Veilig om vaker te draaien: het
 * overschrijft op id. Echte atleten krijgen de eerste admin als coach.
 *
 *   npm run import:lokaal
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { DEMO_IDS, demoOverview } from '../shared/demoData'
import { adminEmails } from '../server/access'
import { ensureAdmins } from '../server/auth'
import { store, type Connection, type PlanRecord } from '../server/store'
import { check, sb } from '../server/supabase'

if (store.kind !== 'supabase') {
  console.log('Supabase staat niet aan in .env: er is niets om naartoe te zetten.')
  process.exit(1)
}

const file = path.resolve(process.cwd(), 'data/db.json')
const db = JSON.parse(fs.readFileSync(file, 'utf8')) as { connections: Connection[]; plans: PlanRecord[] }

await ensureAdmins()
const [first] = adminEmails()
const admin = first ? (check(await sb().from('profiles').select('id').eq('email', first).maybeSingle(), 'admin lezen') as { id: string } | null) : null

await store.ensureDemo(DEMO_IDS.map((id) => ({ id, name: demoOverview(id)!.athlete.name })))
for (const c of db.connections) {
  const { id, remoteId, name, source, token, apiKey, connectedAt } = c
  await store.upsertConnection({ id, remoteId, name, source, token, apiKey, connectedAt, coachId: c.coachId ?? admin?.id, userId: c.userId })
  console.log(`  ✓ atleet ${name} (${id})${token ? ', token versleuteld' : ''}`)
}

const known = new Set([...DEMO_IDS, ...db.connections.map((c) => c.id)])
for (const p of db.plans) {
  if (!known.has(p.athleteId)) {
    console.log(`  · koers ${p.id} overgeslagen: atleet ${p.athleteId} bestaat niet meer`)
    continue
  }
  await store.savePlan(p)
  console.log(`  ✓ koers ${p.id} (${p.athleteId}, ${p.status})`)
}
console.log(`Klaar. data/db.json kun je bewaren als back-up; de server gebruikt nu Supabase.`)
