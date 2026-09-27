import 'dotenv/config'
import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs'
import express, { type NextFunction, type Request, type Response } from 'express'
import type { AppConfig, AthleteOverview, FeedbackEntry, GenerateRequest, PublishResult, TrainingPlan } from '../shared/types'
import { demoOverview, DEMO_IDS } from '../shared/demoData'
import { generateRuleBased } from '../shared/generator'
import { toIntervalsEvents } from '../shared/intervalsText'
import { aiEnabled, aiModel, generateWithClaude } from './ai'
import { fetchOverview, IntervalsClient } from './intervals'
import { store, type PlanRecord } from './store'
import { seedDemoPlan } from '../shared/seed'

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = Number(process.env.PORT || 8787)
const APP_URL = process.env.APP_URL || `http://localhost:5173`
const showDemo = () => process.env.DEMO_ATHLETES !== 'false'
const oauthEnabled = () => Boolean(process.env.INTERVALS_CLIENT_ID && process.env.INTERVALS_CLIENT_SECRET)

// ── Overzichten (met korte cache om de API te sparen) ───────────────────────
const cache = new Map<string, { at: number; data: AthleteOverview }>()
const TTL = 5 * 60_000

async function overview(id: string, fresh = false): Promise<AthleteOverview> {
  if (DEMO_IDS.includes(id)) return demoOverview(id)!
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.data
  const conn = store.connection(id)
  if (!conn) throw httpError(404, 'Atleet niet gevonden')
  const data = await fetchOverview(conn)
  cache.set(id, { at: Date.now(), data })
  return data
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status })
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

// ── Config ──────────────────────────────────────────────────────────────────
app.get('/api/config', (_req, res) => {
  const cfg: AppConfig = {
    mode: 'server',
    oauthEnabled: oauthEnabled(),
    apiKeyEnabled: Boolean(process.env.INTERVALS_API_KEY),
    aiEnabled: aiEnabled(),
    aiModel: aiEnabled() ? aiModel() : undefined,
  }
  res.json(cfg)
})

// ── Atleten ─────────────────────────────────────────────────────────────────
app.get(
  '/api/athletes',
  wrap(async (_req, res) => {
    const ids = [...(showDemo() ? DEMO_IDS : []), ...store.connections().map((c) => c.id)]
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          return (await overview(id)).athlete
        } catch (e) {
          const c = store.connection(id)
          return {
            id,
            name: c?.name ?? id,
            source: c?.source ?? 'apikey',
            ftp: 0,
            ctl: 0,
            atl: 0,
            tsb: 0,
            rampRate: 0,
            flags: [`Koppeling faalt: ${(e as Error).message.slice(0, 80)}`],
          }
        }
      }),
    )
    res.json(results)
  }),
)

app.get(
  '/api/athletes/:id/overview',
  wrap(async (req, res) => res.json(await overview(req.params.id, req.query.fresh === '1'))),
)

/** API-key-modus: voeg een atleet toe op basis van intervals.icu athlete id. */
app.post(
  '/api/athletes',
  wrap(async (req, res) => {
    const { remoteId, apiKey, name } = req.body as { remoteId?: string; apiKey?: string; name?: string }
    const rid = String(remoteId || '0').trim()
    const key = apiKey?.trim() || process.env.INTERVALS_API_KEY
    if (!key) throw httpError(400, 'Geef een API-key op of zet INTERVALS_API_KEY in .env')
    const client = new IntervalsClient({ apiKey: key }, rid)
    const a = await client.athlete() // valideert toegang
    const id = `icu-${a.id ?? rid}`
    store.upsertConnection({
      id,
      remoteId: String(a.id ?? rid),
      name: name || a.name || `Atleet ${rid}`,
      source: 'apikey',
      apiKey: apiKey?.trim() || undefined,
      role: 'athlete',
      connectedAt: new Date().toISOString(),
    })
    cache.delete(id)
    res.json({ id })
  }),
)

app.delete('/api/athletes/:id', (req, res) => {
  store.removeConnection(req.params.id)
  cache.delete(req.params.id)
  res.json({ ok: true })
})

// ── OAuth met intervals.icu ─────────────────────────────────────────────────
// Registreer je app via https://intervals.icu/oauth/apply
const states = new Map<string, { role: 'coach' | 'athlete'; at: number }>()
const SCOPES = 'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:READ'

app.get('/auth/intervals/start', (req, res) => {
  if (!oauthEnabled()) return res.status(400).send('OAuth niet geconfigureerd: zet INTERVALS_CLIENT_ID/SECRET in .env')
  const state = crypto.randomBytes(16).toString('hex')
  states.set(state, { role: req.query.role === 'coach' ? 'coach' : 'athlete', at: Date.now() })
  const url = new URL('https://intervals.icu/oauth/authorize')
  url.searchParams.set('client_id', process.env.INTERVALS_CLIENT_ID!)
  url.searchParams.set('redirect_uri', process.env.INTERVALS_REDIRECT_URI || `http://localhost:${PORT}/auth/intervals/callback`)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  res.redirect(url.toString())
})

app.get(
  '/auth/intervals/callback',
  wrap(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>
    if (error) return res.redirect(`${APP_URL}/?koppeling=geweigerd`)
    const st = states.get(state)
    states.delete(state)
    if (!st || Date.now() - st.at > 15 * 60_000) throw httpError(400, 'Ongeldige of verlopen OAuth-state')
    const body = new URLSearchParams({
      client_id: process.env.INTERVALS_CLIENT_ID!,
      client_secret: process.env.INTERVALS_CLIENT_SECRET!,
      code,
    })
    const r = await fetch('https://intervals.icu/api/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!r.ok) throw httpError(502, `Token-uitwisseling mislukt (${r.status})`)
    const tok = (await r.json()) as { access_token: string; athlete: { id: string; name: string } }
    const id = `icu-${tok.athlete.id}`
    store.upsertConnection({
      id,
      remoteId: String(tok.athlete.id),
      name: tok.athlete.name,
      source: 'oauth',
      token: tok.access_token,
      role: st.role,
      connectedAt: new Date().toISOString(),
    })
    cache.delete(id)
    res.redirect(st.role === 'athlete' ? `${APP_URL}/portaal/${id}?gekoppeld=1` : `${APP_URL}/atleet/${id}`)
  }),
)

// ── Plannen ─────────────────────────────────────────────────────────────────
app.get('/api/athletes/:id/plans', (req, res) => res.json(store.plans(req.params.id)))

app.post(
  '/api/athletes/:id/generate',
  wrap(async (req, res) => {
    const ov = await overview(req.params.id)
    const body = req.body as GenerateRequest
    let plan: TrainingPlan
    let warning: string | undefined
    if (aiEnabled()) {
      try {
        plan = await generateWithClaude(ov, body)
      } catch (e) {
        warning = `AI-generatie mislukt (${(e as Error).message}); regelgebaseerd concept gemaakt.`
        plan = generateRuleBased(body, ov.athlete)
      }
    } else {
      plan = generateRuleBased(body, ov.athlete)
    }
    store.savePlan(plan)
    res.json({ plan, warning })
  }),
)

app.get('/api/plans/:planId', (req, res) => {
  const p = store.plan(req.params.planId)
  return p ? res.json(p) : res.status(404).json({ error: 'Plan niet gevonden' })
})

app.put('/api/plans/:planId', (req, res) => {
  const prev = store.plan(req.params.planId)
  if (!prev) return res.status(404).json({ error: 'Plan niet gevonden' })
  const next = req.body as TrainingPlan
  const plan: PlanRecord = {
    ...prev,
    ...next,
    id: prev.id,
    athleteId: prev.athleteId,
    status: prev.status === 'concept' ? 'concept' : 'gewijzigd',
  }
  store.savePlan(plan)
  res.json(plan)
})

app.delete('/api/plans/:planId', (req, res) => {
  store.deletePlan(req.params.planId)
  res.json({ ok: true })
})

app.post(
  '/api/plans/:planId/publish',
  wrap(async (req, res) => {
    const plan = store.plan(req.params.planId)
    if (!plan) throw httpError(404, 'Plan niet gevonden')
    const ov = await overview(plan.athleteId)
    const events = toIntervalsEvents(plan, ov.athlete.ftp)
    const ids = events.map((e) => e.external_id)
    const stale = (plan.publishedExternalIds ?? []).filter((x) => !ids.includes(x))

    let result: PublishResult
    if (DEMO_IDS.includes(plan.athleteId)) {
      result = {
        ok: true,
        simulated: true,
        created: events.length,
        message: `Demo-atleet: ${events.length} workouts klaargezet (gesimuleerd, niets verstuurd).`,
        payloadPreview: events,
      }
    } else {
      const conn = store.connection(plan.athleteId)!
      const client = IntervalsClient.forConnection(conn)
      if (stale.length) await client.deleteEvents(stale)
      const created = await client.upsertEvents(events)
      for (const c of created) {
        const w = plan.workouts.find((w) => c.external_id?.endsWith(`:${w.id}`))
        if (w) w.remoteId = c.id
      }
      cache.delete(plan.athleteId)
      result = {
        ok: true,
        simulated: false,
        created: created.length,
        message: `${created.length} workouts in de intervals.icu-kalender gezet${stale.length ? `, ${stale.length} verwijderd` : ''}. Garmin/Wahoo/Zwift synct vanaf daar.`,
        payloadPreview: events,
      }
    }
    store.savePlan({ ...plan, status: 'gepubliceerd', publishedAt: new Date().toISOString(), publishedExternalIds: ids })
    res.json({ result, plan: store.plan(plan.id) })
  }),
)

// ── Feedback van de atleet ──────────────────────────────────────────────────
app.post('/api/plans/:planId/workouts/:wid/feedback', (req, res) => {
  const plan = store.plan(req.params.planId)
  const w = plan?.workouts.find((x) => x.id === req.params.wid)
  if (!plan || !w) return res.status(404).json({ error: 'Workout niet gevonden' })
  const fb = req.body as Omit<FeedbackEntry, 'at'>
  w.feedback = { rpe: Math.max(1, Math.min(10, Number(fb.rpe) || 5)), feel: fb.feel, comment: String(fb.comment || '').slice(0, 1000), at: new Date().toISOString() }
  store.savePlan(plan)
  res.json(plan)
})

// ── Productie: serveer de gebouwde frontend ─────────────────────────────────
const dist = path.resolve(process.cwd(), 'dist')
if (process.env.NODE_ENV === 'production' && fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message)
  res.status(err.status ?? 500).json({ error: err.message })
})

// Demo: voorbeeldblok voor Sanne zodat het portaal meteen gevuld is
if (showDemo() && !store.plans('demo-sanne').length) store.savePlan(seedDemoPlan(demoOverview('demo-sanne')!.athlete))

// API-key-modus: koppel atleten uit INTERVALS_ATHLETE_IDS automatisch bij het opstarten
async function autoConnect() {
  const key = process.env.INTERVALS_API_KEY
  if (!key) return
  const ids = (process.env.INTERVALS_ATHLETE_IDS || '0').split(',').map((x) => x.trim()).filter(Boolean)
  for (const rid of ids) {
    try {
      const a = await new IntervalsClient({ apiKey: key }, rid).athlete()
      const id = `icu-${a.id ?? rid}`
      if (!store.connection(id)) {
        store.upsertConnection({ id, remoteId: String(a.id ?? rid), name: a.name || `Atleet ${rid}`, source: 'apikey', role: 'athlete', connectedAt: new Date().toISOString() })
      }
      console.log(`  gekoppeld: ${a.name ?? rid} (${id})`)
    } catch (e) {
      console.log(`  kon athlete ${rid} niet koppelen: ${(e as Error).message.slice(0, 120)}`)
    }
  }
}

app.listen(PORT, () => {
  console.log(`Koersplan API op http://localhost:${PORT}`)
  console.log(`  OAuth: ${oauthEnabled() ? 'aan' : 'uit'} · API-key: ${process.env.INTERVALS_API_KEY ? 'aan' : 'uit'} · AI: ${aiEnabled() ? aiModel() : 'uit (regelgebaseerd)'}`)
  void autoConnect()
})
