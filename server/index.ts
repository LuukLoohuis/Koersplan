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
import { store, type Connection, type PlanRecord } from './store'
import { seedDemoConcept, seedDemoPlan } from '../shared/seed'
import { confirmPlan, keepFeedback, mergePlanUpdate, overlapMessage, overlapping, recordFeedback, rosterExtras } from '../shared/review'
import { today } from '../shared/util'
import { canCoach, canView, visiblePlans, type AuthUser, type Owned } from './access'
import { ensureAdmins, requireRole, requireUser } from './auth'
import { sign, verify } from './crypto'
import { supabaseEnabled } from './supabase'

// Zonder login ziet iedereen alles: dat mag lokaal, niet op een server
if (process.env.NODE_ENV === 'production' && !supabaseEnabled()) {
  console.error('Productie zonder Supabase: zet SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY en SUPABASE_SECRET_KEY. Zonder login kan iedereen alle atleten zien.')
  process.exit(1)
}

const app = express()
app.use(express.json({ limit: '2mb' }))

const PORT = Number(process.env.PORT || 8787)
const APP_URL = process.env.APP_URL || `http://localhost:5173`
const showDemo = () => process.env.DEMO_ATHLETES !== 'false'
// Naam van de coach voor "Bevestigd door …". Alleen de demo-atleten hebben een vaste demo-coach.
const coachName = () => process.env.COACH_NAME || undefined
// alleen-AI-abonnees hebben geen persoonlijke coach: dan geen naam
const coachFor = (user: AuthUser, athleteId: string, subscription?: 'coach' | 'ai') =>
  subscription === 'ai' ? undefined : DEMO_IDS.includes(athleteId) ? (coachName() ?? 'Ruud') : (user.name ?? coachName())
const oauthEnabled = () => Boolean(process.env.INTERVALS_CLIENT_ID && process.env.INTERVALS_CLIENT_SECRET)
// De coach van een nieuwe koppeling: met login de ingelogde coach of admin, lokaal niemand
const coachIdOf = (user: AuthUser) => (supabaseEnabled() && user.role !== 'athlete' ? user.id : undefined)

// ── Overzichten (met korte cache om de API te sparen) ───────────────────────
const cache = new Map<string, { at: number; data: AthleteOverview }>()
const TTL = 5 * 60_000

async function overview(id: string, fresh = false): Promise<AthleteOverview> {
  if (DEMO_IDS.includes(id)) return demoOverview(id)!
  const hit = cache.get(id)
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.data
  const conn = await store.connection(id)
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

/** De atleet, als de gebruiker hem mag zien (of bijsturen). Anders 404: niemand kan raden wie er bestaat. */
async function athleteFor(user: AuthUser, id: string, need: 'view' | 'coach'): Promise<Owned> {
  const owned: Owned | undefined = DEMO_IDS.includes(id) ? (showDemo() ? { demo: true } : undefined) : await store.connection(id)
  if (!owned || !canView(user, owned)) throw httpError(404, 'Atleet niet gevonden')
  if (need === 'coach' && !canCoach(user, owned)) throw httpError(403, 'Alleen de coach van deze atleet kan dit.')
  return owned
}

/** De koers, als de gebruiker hem mag zien (of bijsturen). Een atleet ziet geen voorstellen. */
async function planFor(user: AuthUser, planId: string, need: 'view' | 'coach'): Promise<PlanRecord> {
  const plan = await store.plan(planId)
  if (!plan || !visiblePlans(user, [plan]).length) throw httpError(404, 'Plan niet gevonden')
  await athleteFor(user, plan.athleteId, need)
  return plan
}

// ── Config (openbaar: de browser heeft hem nodig om te kunnen inloggen) ──────
app.get('/api/config', (_req, res) => {
  const cfg: AppConfig = {
    mode: 'server',
    oauthEnabled: oauthEnabled(),
    apiKeyEnabled: Boolean(process.env.INTERVALS_API_KEY),
    aiEnabled: aiEnabled(),
    aiModel: aiEnabled() ? aiModel() : undefined,
    coachName: coachName(),
    // de publishable key is bedoeld voor de browser; de secret key blijft hier
    auth: supabaseEnabled() ? { url: process.env.SUPABASE_URL!, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY! } : undefined,
  }
  res.json(cfg)
})

// Alles hieronder alleen met login (lokaal zonder Supabase: iedereen admin)
app.use('/api', requireUser)

app.get('/api/me', (req, res) => res.json(req.user))

// ── Atleten ─────────────────────────────────────────────────────────────────
app.get(
  '/api/athletes',
  wrap(async (req, res) => {
    const user = req.user!
    const conns = (await store.connections()).filter((c) => canView(user, c))
    const ids = [...(showDemo() && user.role !== 'athlete' ? DEMO_IDS : []), ...conns.map((c) => c.id)]
    const results = await Promise.all(
      ids.map(async (id) => {
        try {
          const ov = await overview(id)
          return { ...ov.athlete, ...rosterExtras(ov.activities, visiblePlans(user, await store.plans(id)), today(), ov.athlete.ftp) }
        } catch (e) {
          const c = conns.find((x) => x.id === id)
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
  wrap(async (req, res) => {
    await athleteFor(req.user!, req.params.id, 'view')
    res.json(await overview(req.params.id, req.query.fresh === '1'))
  }),
)

/** API-key-modus: voeg een atleet toe op basis van intervals.icu athlete id. */
app.post(
  '/api/athletes',
  requireRole('admin', 'coach'),
  wrap(async (req, res) => {
    const user = req.user!
    const { remoteId, apiKey, name } = req.body as { remoteId?: string; apiKey?: string; name?: string }
    const rid = String(remoteId || '0').trim()
    // de key uit .env is van de eigenaar van de server: alleen de admin mag die gebruiken
    const key = apiKey?.trim() || (user.role === 'admin' ? process.env.INTERVALS_API_KEY : undefined)
    if (!key) throw httpError(400, user.role === 'admin' ? 'Geef een API-key op of zet INTERVALS_API_KEY in .env' : 'Geef de API-key van de atleet op.')
    const client = new IntervalsClient({ apiKey: key }, rid)
    const a = await client.athlete() // valideert toegang
    const id = `icu-${a.id ?? rid}`
    const existing = await store.connection(id)
    if (existing && !canCoach(user, existing)) throw httpError(409, 'Deze atleet is al gekoppeld bij een andere coach.')
    await store.upsertConnection({
      id,
      remoteId: String(a.id ?? rid),
      name: name || a.name || `Atleet ${rid}`,
      source: 'apikey',
      apiKey: apiKey?.trim() || undefined,
      coachId: existing?.coachId ?? coachIdOf(user),
      userId: existing?.userId,
      connectedAt: new Date().toISOString(),
    })
    cache.delete(id)
    res.json({ id })
  }),
)

app.delete(
  '/api/athletes/:id',
  wrap(async (req, res) => {
    const owned = await athleteFor(req.user!, req.params.id, 'coach')
    if (owned.demo) throw httpError(400, 'Demo-atleten kun je niet verwijderen.')
    await store.removeConnection(req.params.id)
    cache.delete(req.params.id)
    res.json({ ok: true })
  }),
)

// ── OAuth met intervals.icu ─────────────────────────────────────────────────
// Registreer je app via https://intervals.icu/oauth/apply
const states = new Map<string, { coachId?: string; invited: boolean; at: number }>()
const SCOPES = 'ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:READ'
const INVITE_TTL = 14 * 24 * 3600_000

function authorizeUrl(st: { coachId?: string; invited: boolean }): string {
  if (!oauthEnabled()) throw httpError(400, 'OAuth niet geconfigureerd: zet INTERVALS_CLIENT_ID/SECRET in .env')
  const state = crypto.randomBytes(16).toString('hex')
  states.set(state, { ...st, at: Date.now() })
  const url = new URL('https://intervals.icu/oauth/authorize')
  url.searchParams.set('client_id', process.env.INTERVALS_CLIENT_ID!)
  url.searchParams.set('redirect_uri', process.env.INTERVALS_REDIRECT_URI || `http://localhost:${PORT}/auth/intervals/callback`)
  url.searchParams.set('scope', SCOPES)
  url.searchParams.set('state', state)
  return url.toString()
}

/** De coach koppelt een atleet in zijn eigen browser: de atleet wordt van deze coach. */
app.post(
  '/api/intervals/connect',
  requireRole('admin', 'coach'),
  wrap(async (req, res) => res.json({ url: authorizeUrl({ coachId: coachIdOf(req.user!), invited: false }) })),
)

/** Uitnodigingslink voor een atleet, 14 dagen geldig; wie hem gebruikt, wordt atleet van deze coach. */
app.get(
  '/api/intervals/invite',
  requireRole('admin', 'coach'),
  wrap(async (req, res) => {
    const base = `${APP_URL}/auth/intervals/start`
    if (!supabaseEnabled()) return res.json({ url: base })
    const expiresAt = new Date(Date.now() + INVITE_TTL).toISOString()
    res.json({ url: `${base}?uitnodiging=${sign({ coachId: coachIdOf(req.user!) }, INVITE_TTL)}`, expiresAt })
  }),
)

app.get('/auth/intervals/start', (req, res) => {
  if (!oauthEnabled()) return res.status(400).send('OAuth niet geconfigureerd: zet INTERVALS_CLIENT_ID/SECRET in .env')
  let coachId: string | undefined
  if (supabaseEnabled()) {
    const invite = verify<{ coachId?: string }>(String(req.query.uitnodiging ?? ''))
    if (!invite) return res.redirect(`${APP_URL}/app/inloggen?koppeling=verlopen`)
    coachId = invite.coachId
  }
  res.redirect(authorizeUrl({ coachId, invited: true }))
})

app.get(
  '/auth/intervals/callback',
  wrap(async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>
    const st = states.get(state)
    states.delete(state)
    // met login komt een uitgenodigde atleet (nog zonder account) terug op de inlogpagina
    const invitedBack = (k: string) => (supabaseEnabled() ? `${APP_URL}/app/inloggen?koppeling=${k}` : `${APP_URL}/app?koppeling=${k}`)
    if (error) return res.redirect(st && !st.invited ? `${APP_URL}/app/koppelen?koppeling=geweigerd` : invitedBack('geweigerd'))
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
    const existing = await store.connection(id)
    const conn: Connection = {
      id,
      remoteId: String(tok.athlete.id),
      name: tok.athlete.name,
      source: 'oauth',
      token: tok.access_token,
      // wie de uitnodiging van een coach gebruikt, kiest die coach
      coachId: st.coachId ?? existing?.coachId,
      userId: existing?.userId,
      connectedAt: new Date().toISOString(),
    }
    await store.upsertConnection(conn)
    cache.delete(id)
    if (!st.invited) return res.redirect(`${APP_URL}/app/atleet/${id}`)
    res.redirect(supabaseEnabled() ? invitedBack('gelukt') : `${APP_URL}/app/portaal/${id}?gekoppeld=1`)
  }),
)

// ── Plannen ─────────────────────────────────────────────────────────────────
// Koersen die nu gepubliceerd worden: die mag opnieuw uitzetten niet vervangen
const publishing = new Set<string>()
app.get(
  '/api/athletes/:id/plans',
  wrap(async (req, res) => {
    await athleteFor(req.user!, req.params.id, 'view')
    res.json(visiblePlans(req.user!, await store.plans(req.params.id)))
  }),
)

app.post(
  '/api/athletes/:id/generate',
  wrap(async (req, res) => {
    await athleteFor(req.user!, req.params.id, 'coach')
    const ov = await overview(req.params.id)
    const { replaces, ...body } = req.body as GenerateRequest & { replaces?: string }
    // Opnieuw uitzetten vervangt alleen een voorstel dat nog op de coach wacht
    const replaceable = async () => {
      const old = replaces ? await store.plan(replaces) : undefined
      if (replaces && (!old || old.athleteId !== req.params.id)) throw httpError(409, 'Dit voorstel is al vervangen of verwijderd; er is geen nieuw voorstel gemaakt.')
      if (old && (old.status !== 'concept' || publishing.has(old.id))) throw httpError(409, 'Deze koers is intussen bevestigd; er is geen nieuw voorstel gemaakt.')
      return old
    }
    const before = await replaceable()
    let plan: TrainingPlan
    let warning: string | undefined
    if (aiEnabled()) {
      try {
        plan = await generateWithClaude(ov, body, before)
      } catch (e) {
        warning = `AI-generatie mislukt (${(e as Error).message}); regelgebaseerd concept gemaakt.`
        plan = generateRuleBased(body, ov.athlete)
      }
    } else {
      plan = generateRuleBased(body, ov.athlete)
    }
    // uitzetten duurt even: opnieuw kijken, dan pas het oude voorstel vervangen (de notitie gaat mee)
    const old = await replaceable()
    if (old) {
      plan.note = old.note
      await store.deletePlan(old.id)
    }
    await store.savePlan(plan)
    res.json({ plan, warning, replaced: old?.id })
  }),
)

app.get(
  '/api/plans/:planId',
  wrap(async (req, res) => res.json(await planFor(req.user!, req.params.planId, 'view'))),
)

app.put(
  '/api/plans/:planId',
  wrap(async (req, res) => {
    const prev = await planFor(req.user!, req.params.planId, 'coach')
    // tijdens bevestigen gaat precies deze versie naar Intervals.icu: een wijziging zou daarna verloren gaan
    if (publishing.has(prev.id)) throw httpError(409, 'Deze koers wordt net bevestigd; je wijziging is niet opgeslagen.')
    // Alleen wat de coach mag wijzigen: het voorstel, de bevestiging en de publicatie blijven van de server
    const plan = mergePlanUpdate(prev, req.body as Partial<PlanRecord>)
    await store.savePlan(plan)
    res.json(plan)
  }),
)

app.delete(
  '/api/plans/:planId',
  wrap(async (req, res) => {
    await planFor(req.user!, req.params.planId, 'coach')
    if (publishing.has(req.params.planId)) throw httpError(409, 'Deze koers wordt net bevestigd; verwijder hem daarna.')
    await store.deletePlan(req.params.planId)
    res.json({ ok: true })
  }),
)

app.post(
  '/api/plans/:planId/publish',
  wrap(async (req, res) => {
    const user = req.user!
    const found = await planFor(user, req.params.planId, 'coach')
    if (publishing.has(found.id)) throw httpError(409, 'Deze koers wordt al bevestigd.')
    // bevestigde koersen (ook die nu bevestigd worden) delen geen dagen: anders twee trainingen op één dag
    const others = (await store.plans(found.athleteId)).map((p) => (publishing.has(p.id) ? { ...p, status: 'gepubliceerd' as const } : p))
    const clash = overlapping(others, found, today())
    if (clash.length) throw httpError(409, overlapMessage(clash))
    publishing.add(found.id)
    try {
      const plan = found
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
        const conn = await store.connection(plan.athleteId)
        if (!conn) throw httpError(404, 'Atleet niet gevonden')
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
      // opnieuw kijken: verwijderen kan niet tijdens het bevestigen, maar de atleet kan intussen feedback geven
      const latest = await store.plan(plan.id)
      if (!latest) throw httpError(409, 'Deze koers is tijdens het bevestigen verwijderd.')
      await store.savePlan({ ...confirmPlan(keepFeedback(plan, latest), coachFor(user, plan.athleteId, ov.athlete.subscription), new Date().toISOString(), !result.simulated), publishedExternalIds: ids })
      res.json({ result, plan: await store.plan(plan.id) })
    } finally {
      publishing.delete(found.id)
    }
  }),
)

// ── Feedback van de atleet ──────────────────────────────────────────────────
app.post(
  '/api/plans/:planId/workouts/:wid/feedback',
  wrap(async (req, res) => {
    const plan = await planFor(req.user!, req.params.planId, 'view')
    const fb = req.body as Omit<FeedbackEntry, 'at'>
    const feedback = { rpe: Math.max(1, Math.min(10, Number(fb.rpe) || 5)), feel: fb.feel, comment: String(fb.comment || '').slice(0, 1000), at: new Date().toISOString() }
    // op de rit die de atleet had staan (bij een gewijzigde koers de bevestigde versie), in het logboek
    const next = recordFeedback(plan, req.params.wid, feedback)
    if (!next) throw httpError(404, 'Workout niet gevonden')
    await store.savePlan(next)
    res.json(await store.plan(next.id))
  }),
)

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

// Admins aanmaken, demo-atleten klaarzetten: bevestigde koers voor Sanne (portaal gevuld)
// en een uitgezette koers voor Joris (Koers reviewen)
async function boot() {
  await ensureAdmins()
  if (!showDemo()) return
  await store.ensureDemo(DEMO_IDS.map((id) => ({ id, name: demoOverview(id)!.athlete.name })))
  if (!(await store.plans('demo-sanne')).length) {
    const sanne = demoOverview('demo-sanne')!.athlete
    await store.savePlan(seedDemoPlan(sanne, sanne.subscription === 'ai' ? undefined : (coachName() ?? 'Ruud')))
  }
  if (!(await store.plans('demo-joris')).length) await store.savePlan(seedDemoConcept(demoOverview('demo-joris')!.athlete))
}

// API-key-modus: koppel atleten uit INTERVALS_ATHLETE_IDS automatisch bij het opstarten
async function autoConnect() {
  const key = process.env.INTERVALS_API_KEY
  if (!key) return
  const ids = (process.env.INTERVALS_ATHLETE_IDS || '0').split(',').map((x) => x.trim()).filter(Boolean)
  for (const rid of ids) {
    try {
      const a = await new IntervalsClient({ apiKey: key }, rid).athlete()
      const id = `icu-${a.id ?? rid}`
      if (!(await store.connection(id))) {
        await store.upsertConnection({ id, remoteId: String(a.id ?? rid), name: a.name || `Atleet ${rid}`, source: 'apikey', connectedAt: new Date().toISOString() })
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
  console.log(`  Opslag: ${store.kind} · Login: ${supabaseEnabled() ? 'aan (Supabase)' : 'uit (lokaal, iedereen admin)'}`)
  boot()
    .then(autoConnect)
    .catch((e) => console.log(`  opstarten: ${(e as Error).message}`))
})
