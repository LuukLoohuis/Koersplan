import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type Dispatch, type SetStateAction } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, CloudOff, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react'
import type { AthleteOverview, GenerateRequest, PublishResult, TrainingPlan, Workout } from '@shared/types'
import { workoutMetrics } from '@shared/metrics'
import { TEMPLATES } from '@shared/library'
import { mainStepSec, setMainDuration } from '@shared/generator'
import { buildFormSeries, historyFromOverview, plannedDays } from '@shared/formSeries'
import { changedDates, confirmedBase, editStatus, FEEL_SCALE, fmtHm, isRide as rides, parseMinutes, latestFeedback, nextPlanDue, onCoursePct, overlapMessage, overlapping, planDiff, planEnd, plannedVsRidden, planState, trainingStatus } from '@shared/review'
import { addDays, clamp, DAY_LONG, DAY_SHORT, daysBetween, fmtDate, fmtDuration, isoDate, mondayOf, round, today, uid } from '@shared/util'
import { api } from '../api'
import { useApp } from '../App'
import { formState } from '../lib/theme'
import { WorkoutProfile } from '../components/charts'
import { FormChart } from '../components/FormChart'
import { Koerslijn } from '../components/Koerslijn'
import { Correction, Empty, initialsOf, Panel, StatusChip, Toast } from '../components/ui'
import { WorkoutEditor } from '../components/WorkoutEditor'

export function PlanTab({ ov, plans, setPlans }: { ov: AthleteOverview; plans: TrainingPlan[]; setPlans: Dispatch<SetStateAction<TrainingPlan[]>> }) {
  const { reloadAthletes } = useApp()
  const [selId, setSelId] = useState<string | null>(plans[0]?.id ?? null)
  const [creating, setCreating] = useState(plans.length === 0)
  const [notice, setNotice] = useState<{ tone: 'good' | 'warn' | 'crit'; text: string } | null>(null)
  const plan = plans.find((p) => p.id === selId) ?? null

  const update = (p: TrainingPlan) => setPlans((all) => all.map((x) => (x.id === p.id ? p : x)))
  // als de gekozen koers verdwijnt (verwijderd of vervangen): de eerstvolgende, of de generator
  useEffect(() => {
    if (creating || (selId && plans.some((p) => p.id === selId))) return
    setSelId(plans[0]?.id ?? null)
    if (!plans.length) setCreating(true)
  }, [plans, selId, creating])

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {plans.map((p) => (
          <button
            key={p.id}
            className={`btn btn-sm ${p.id === selId && !creating ? 'btn-primary' : ''}`}
            onClick={() => {
              setSelId(p.id)
              setCreating(false)
            }}
          >
            {p.title.length > 34 ? p.title.slice(0, 32) + '…' : p.title}
            <span className="opacity-60 text-[11px]">{fmtDate(p.startDate)}</span>
          </button>
        ))}
        <button className={`btn btn-sm ${creating ? 'btn-primary' : ''}`} onClick={() => setCreating(true)}>
          + Nieuw blok
        </button>
      </div>

      {notice && (
        <Toast tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Toast>
      )}

      {creating ? (
        <GeneratorForm
          ov={ov}
          plans={plans}
          onCreated={(p, warning) => {
            setPlans((all) => [p, ...all])
            reloadAthletes()
            setSelId(p.id)
            setCreating(false)
            setNotice(warning ? { tone: 'warn', text: warning } : { tone: 'good', text: 'Concept klaar. Controleer het blok, pas aan waar nodig en publiceer.' })
          }}
        />
      ) : plan ? (
        <PlanView
          key={plan.id}
          ov={ov}
          plan={plan}
          plans={plans}
          onChange={update}
          onConfirmed={reloadAthletes}
          onReplace={(next, replacedId, warning) => {
            // functioneel: de lijst kan tijdens het uitzetten (30–90 s) veranderd zijn
            setPlans((all) => [next, ...all.filter((p) => p.id !== replacedId)])
            reloadAthletes()
            // alleen meespringen als de coach nog naar het vervangen voorstel keek
            setSelId((cur) => (cur === replacedId ? next.id : cur))
            setNotice(warning ? { tone: 'warn', text: warning } : { tone: 'good', text: 'Nieuwe koers uitgezet. Kijk hem na en bevestig.' })
          }}
          onDelete={async () => {
            await api.deletePlan(plan.id)
            setPlans((all) => all.filter((p) => p.id !== plan.id))
            reloadAthletes()
          }}
        />
      ) : (
        <Empty>Nog geen blok voor deze atleet.</Empty>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Generator
// ─────────────────────────────────────────────────────────────

const FOCUS: { v: GenerateRequest['focus']; label: string; hint: string }[] = [
  { v: 'basis', label: 'Basis', hint: 'Aerobe basis, tempo en sweetspot' },
  { v: 'drempel', label: 'Drempel', hint: 'Sweetspot en over-unders' },
  { v: 'vo2max', label: 'VO2max', hint: 'Intervallen boven CP' },
  { v: 'duurvermogen', label: 'Duurvermogen', hint: 'Vermogen houden na veel kJ' },
  { v: 'sprint', label: 'Sprint / W′', hint: 'Piekvermogen en anaerobe capaciteit' },
  { v: 'piek', label: 'Piek', hint: 'Laatste weken voor een doel, met taper' },
]

function GeneratorForm({ ov, plans, onCreated }: { ov: AthleteOverview; plans: TrainingPlan[]; onCreated: (p: TrainingPlan, warning?: string) => void }) {
  const { config } = useApp()
  // standaard na de bevestigde koersen: twee koersen op dezelfde dagen kan niet
  const defaultStart = nextPlanDue(plans, addDays(mondayOf(today()), 7))
  // Standaard uren = gemiddelde van de laatste 4 weken (afgerond op een half uur)
  const recentHours = ov.activities.filter((x) => x.date >= addDays(today(), -28)).reduce((s, x) => s + x.movingTimeSec, 0) / 3600 / 4
  const defaultHours = Math.max(4, Math.min(25, Math.round(recentHours * 2) / 2 || 8))
  const [req, setReq] = useState<GenerateRequest>({
    goal: ov.athlete.goal ?? '',
    eventDate: '',
    startDate: defaultStart,
    weeks: 4,
    hoursPerWeek: defaultHours,
    availableDays: [1, 2, 3, 5, 6],
    longRideDay: 6,
    focus: ov.athlete.tsb < -25 ? 'basis' : 'drempel',
    notes: '',
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const set = <K extends keyof GenerateRequest>(k: K, v: GenerateRequest[K]) => setReq((r) => ({ ...r, [k]: v }))
  const toggleDay = (d: number) =>
    set('availableDays', req.availableDays.includes(d) ? req.availableDays.filter((x) => x !== d) : [...req.availableDays, d].sort())

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (req.availableDays.length < 2) return setErr('Kies minstens twee trainingsdagen.')
    setBusy(true)
    setErr(null)
    try {
      const { plan, warning } = await api.generate(ov.athlete.id, { ...req, eventDate: req.eventDate || undefined })
      onCreated(plan, warning)
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ai = config?.aiEnabled
  return (
    <form onSubmit={submit} className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Panel title="Nieuw trainingsblok">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="eyebrow">Doel</span>
            <input id="gen-goal" className="field" value={req.goal} onChange={(e) => set('goal', e.target.value)} placeholder="bv. Gran Fondo, clubkampioenschap tijdrit" />
          </label>
          <label className="grid gap-1.5">
            <span className="eyebrow">Start blok</span>
            <input id="gen-start" type="date" className="field" value={req.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="eyebrow">Doeldatum (optioneel)</span>
            <input id="gen-event" type="date" className="field" value={req.eventDate} onChange={(e) => set('eventDate', e.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="eyebrow">Weken</span>
            <select id="gen-weeks" className="field" value={req.weeks} onChange={(e) => set('weeks', Number(e.target.value))}>
              {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                <option key={n} value={n}>
                  {n} {n === 1 ? 'week' : 'weken'}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="eyebrow">Max uren per week</span>
            <input id="gen-hours" type="number" min={3} max={30} step={0.5} className="field num" value={req.hoursPerWeek} onChange={(e) => set('hoursPerWeek', Number(e.target.value))} />
          </label>
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="eyebrow">Focus</span>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {FOCUS.map((f) => (
                <button
                  type="button"
                  key={f.v}
                  onClick={() => set('focus', f.v)}
                  aria-pressed={req.focus === f.v}
                  className={`text-left rounded-lg border px-3 py-2 cursor-pointer ${req.focus === f.v ? 'border-ink bg-raised' : 'border-line bg-surface hover:bg-raised'}`}
                >
                  <div className="font-medium text-[13px] text-ink">{f.label}</div>
                  <div className="text-[11.5px] text-muted">{f.hint}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <span className="eyebrow">Trainingsdagen</span>
            <div className="flex flex-wrap gap-1.5">
              {DAY_SHORT.map((d, i) => (
                <button type="button" key={d} className={`btn btn-sm w-11 justify-center ${req.availableDays.includes(i) ? 'btn-primary' : ''}`} onClick={() => toggleDay(i)} aria-pressed={req.availableDays.includes(i)}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          <label className="grid gap-1.5">
            <span className="eyebrow">Lange rit op</span>
            <select id="gen-long" className="field" value={req.longRideDay} onChange={(e) => set('longRideDay', Number(e.target.value))}>
              {req.availableDays.map((d) => (
                <option key={d} value={d}>
                  {DAY_LONG[d]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 sm:col-span-2">
            <span className="eyebrow">Instructies voor de AI</span>
            <textarea id="gen-notes" className="field" rows={3} value={req.notes} onChange={(e) => set('notes', e.target.value)} placeholder="bv. woensdag max 1 uur binnen op de trainer; kniepijn na lange klimmen, geen lage cadans" />
          </label>
        </div>
        {err && <p className="text-crit text-sm">{err}</p>}
        <div className="flex items-center gap-3 mt-5">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? (ai ? 'Claude schrijft het blok…' : 'Blok opbouwen…') : ai ? 'Genereer concept met AI' : 'Genereer concept'}
          </button>
          <span className="text-[12px] text-muted">{busy && ai ? 'Dit duurt meestal 30–90 seconden.' : ai ? `Model: ${config?.aiModel}` : 'Geen Claude API-key: regelgebaseerde generator.'}</span>
        </div>
      </Panel>
      <Panel title="Wat de generator meeneemt">
        <ul className="m-0 pl-4 grid gap-2 text-[13px] text-muted">
          <li>
            Fitness <b className="num text-ink">{round(ov.athlete.ctl)}</b>, vorm <b className="num text-ink">{round(ov.athlete.tsb)}</b>, ramp{' '}
            <b className="num text-ink">{ov.athlete.rampRate}</b>/week
          </li>
          <li>
            CP <b className="num text-ink">{ov.athlete.cp ?? '–'} W</b> en W′ <b className="num text-ink">{ov.athlete.wPrime ? round(ov.athlete.wPrime / 1000, 1) : '–'} kJ</b> uit de power-duration curve
          </li>
          <li>Weekbelasting van de laatste 8 weken en recente ritten</li>
          <li>HRV, rusthartslag en slaap</li>
          <li>3:1-opbouw, maximaal 3–7 CTL per week, geen twee harde dagen achter elkaar</li>
          {ov.athlete.tsb < -25 && <li className="text-crit">Vorm is laag: het blok start met herstel</li>}
        </ul>
        <p className="text-[12px] text-muted mt-4 mb-0">Je krijgt altijd eerst een concept. Niets gaat naar de atleet voordat jij publiceert.</p>
      </Panel>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────
// Koers reviewen (design-system/components/ReviewScreen)
// Links context, midden de uitgezette week (bewerkbaar, was → wordt), rechts actie.
// ─────────────────────────────────────────────────────────────

/** Lopende acties per koers (uitzetten, bevestigen): blijven zichtbaar en op slot als het scherm tussendoor wisselt. */
type Flight = { kind: 'uitzetten' | 'bevestigen'; athleteId: string }
const inflight = new Map<string, Flight>()
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}
const setInflight = (id: string, v?: Flight) => {
  if (v) inflight.set(id, v)
  else inflight.delete(id)
  listeners.forEach((l) => l())
}
const useInflight = (id: string) => useSyncExternalStore(subscribe, () => inflight.get(id)?.kind)

/**
 * Een scherm dat opent terwijl een actie van een eerder scherm nog loopt (weg en terug tijdens het
 * uitzetten), krijgt de uitkomst niet mee: haal de koersen daarna opnieuw op.
 */
export function useRefetchAfterInflight(athleteId: string, refetch: () => void) {
  useEffect(() => {
    const waiting = new Set([...inflight].filter(([, f]) => f.athleteId === athleteId).map(([id]) => id))
    if (!waiting.size) return
    return subscribe(() => {
      const done = [...waiting].filter((id) => !inflight.has(id))
      if (!done.length) return
      done.forEach((id) => waiting.delete(id))
      refetch()
    })
    // alleen bij het openen van het scherm: refetch hoeft niet stabiel te zijn
  }, [athleteId])
}

const TEMPLATE_OPTIONS = Object.entries(TEMPLATES)
const templateKeyOf = (w?: Workout) => (w ? (TEMPLATE_OPTIONS.find(([, t]) => t.name === w.name)?.[0] ?? '__eigen') : 'rust')
/** Tonen in de week: alles behalve een rustdag, ook een (nog) lege training */
const isRide = (w: Workout) => w.stimulus !== 'Rust'
const signed = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', ',')}`
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Alleen bij duur-, herstel- en duurvermogenritten is één stap de hoofdmoot; bij intervallen gaat dat via Bewerk. */
const canSetDuration = (w: Workout) => ['Duur', 'Herstel', 'Duurvermogen'].includes(w.stimulus) && mainStepSec(w.sections) > 0
/** Tijdstempel als lokale dag ("ma 28 sep"), niet de UTC-datum uit de ISO-string. */
const localDay = (ts: string) => fmtDate(isoDate(new Date(ts)), true)


function PlanView({
  ov,
  plan,
  plans,
  onChange,
  onDelete,
  onReplace,
  onConfirmed,
}: {
  ov: AthleteOverview
  plan: TrainingPlan
  plans: TrainingPlan[]
  onChange: (p: TrainingPlan) => void
  onDelete: () => void
  onReplace: (next: TrainingPlan, replacedId: string | undefined, warning?: string) => void
  onConfirmed: () => void
}) {
  const { config } = useApp()
  const nav = useNavigate()
  // "Bevestigd door …": de echte coach, of de demo-coach bij demo-atleten; anders "je coach"
  const aiOnly = ov.athlete.subscription === 'ai'
  const coachName = plan.confirmedBy ?? (aiOnly ? undefined : (config?.coachName ?? (ov.athlete.source === 'demo' ? 'Ruud' : undefined)))
  const byCoach = coachName ? ` door ${coachName}` : aiOnly ? '' : ' door je coach'
  const first = ov.athlete.name.split(' ')[0]
  const ftp = ov.athlete.ftp
  const now = today()
  const [editing, setEditing] = useState<string | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'fout'>('idle')
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [pubErr, setPubErr] = useState<string | null>(null)
  const [askDelete, setAskDelete] = useState(false)
  const [instr, setInstr] = useState('')
  const [regenErr, setRegenErr] = useState<string | null>(null)
  const flight = useInflight(plan.id)
  const publishing = flight === 'bevestigen'
  const regenBusy = flight === 'uitzetten'
  const timer = useRef<number | undefined>(undefined)
  const pending = useRef<TrainingPlan | null>(null)
  // de bevestigde versie: de snapshot, of bij een oudere koers de trainingen zoals ze geladen werden
  const loadedBase = useRef(confirmedBase(plan))
  const base = plan.confirmedWorkouts ?? loadedBase.current

  // Autosave (debounced); de server houdt voorstel, bevestiging en publicatie vast
  const flush = async () => {
    window.clearTimeout(timer.current)
    const toSave = pending.current
    pending.current = null
    if (!toSave) return
    setSaving('saving')
    try {
      await api.savePlan(toSave)
      setSaving('saved')
    } catch {
      // niet stil laten verdwijnen: de volgende wijziging, "Opnieuw" of weggaan probeert het nog eens
      pending.current ??= toSave
      setSaving('fout')
    }
  }
  const change = (p: TrainingPlan) => {
    // zelfde regel als de server: alleen andere ritten dan bevestigd maken een koers "gewijzigd"
    const next = { ...p, confirmedWorkouts: p.confirmedWorkouts ?? base, status: editStatus(plan.status, base, p.workouts) }
    onChange(next)
    setSaving('saving')
    pending.current = next
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 600)
  }
  // weggaan (andere koers, tab of pagina) verstuurt een openstaande opslag alsnog
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (pending.current) void api.savePlan(pending.current).catch(() => {})
    },
    [],
  )

  const weekStart0 = mondayOf(plan.startDate)
  const nWeeks = Math.max(1, plan.weeks.length)
  const end = planEnd(plan)
  const [week, setWeek] = useState(() => clamp(Math.floor(daysBetween(weekStart0, now > plan.startDate ? now : plan.startDate) / 7), 0, nWeeks - 1))
  const from = addDays(weekStart0, week * 7)
  const dates = Array.from({ length: 7 }, (_, i) => addDays(from, i))

  const metrics = useMemo(() => new Map(plan.workouts.map((w) => [w.id, workoutMetrics(w.sections, ftp, ov.model)])), [plan.workouts, ftp, ov.model])
  const diff = useMemo(() => planDiff(plan.aiWorkouts, plan.workouts, ftp), [plan.aiWorkouts, plan.workouts, ftp])
  const changes = new Map(diff.map((d) => [d.date, d]))
  const sinceConfirm = useMemo(
    () => (base ? changedDates(base, plan.workouts) : plan.status === 'gewijzigd' ? new Set(plan.workouts.filter(isRide).map((w) => w.date)) : new Set<string>()),
    [base, plan.workouts, plan.status],
  )
  const baseRides = useMemo(() => (base ? new Set(base.filter((w) => rides(w)).map((w) => w.date)) : undefined), [base])
  const byDate = new Map(plan.workouts.filter(isRide).map((w) => [w.date, w]))
  const rode = useMemo(() => new Set(ov.activities.filter((a) => a.load > 0).map((a) => a.date)), [ov.activities])

  // projecties: het voorstel en de koers na de coach; die tweede beweegt live mee
  const history = useMemo(() => historyFromOverview(ov, now), [ov, now])
  const aiPlanned = useMemo(() => plannedDays(plan.aiWorkouts ?? plan.workouts, ftp, ov.plannedLoad), [plan.aiWorkouts, plan.workouts, ftp, ov.plannedLoad])
  const curPlanned = useMemo(() => plannedDays(plan.workouts, ftp, ov.plannedLoad), [plan.workouts, ftp, ov.plannedLoad])
  const series = useMemo(() => buildFormSeries(history, aiPlanned, curPlanned), [history, aiPlanned, curPlanned])
  const dayOf = (date: string) => series.days.find((d) => d.date === date)
  const ctlAt = (date: string) => {
    const d = dayOf(date)
    return d?.planned ? (d.coach?.ctl ?? d.ai?.ctl) : d?.ctl
  }
  const concept = plan.status === 'concept'
  const changed = diff.length > 0
  const showAi = concept || changed
  const showCoach = !concept || changed
  const lastAi = [...series.days].reverse().find((d) => d.ai)?.ai
  const lastCoach = [...series.days].reverse().find((d) => d.coach)?.coach
  const c0 = ctlAt(addDays(from, -1))
  const c1 = ctlAt(addDays(from, 6))
  const goal = (ov.goals ?? []).filter((g) => g.date >= now).sort((a, b) => a.date.localeCompare(b.date))[0]
  const goalDay = goal ? dayOf(goal.date) : undefined
  const goalForm = goalDay ? (showCoach ? goalDay.coach?.tsb : goalDay.ai?.tsb) : undefined

  const prevWeek = useMemo(() => plannedVsRidden(ov.activities, plans, addDays(mondayOf(now), -7), 7, ftp), [ov.activities, plans, now, ftp])
  const onCourse = onCoursePct(prevWeek)
  const fb = latestFeedback(plans)

  const weekWs = dates.map((d) => byDate.get(d))
  const tssOf = (w?: Workout) => (w ? (metrics.get(w.id)?.tss ?? 0) : 0)
  const weekTss = weekWs.reduce((a, w) => a + tssOf(w), 0)
  const weekSec = weekWs.reduce((a, w) => a + (w ? (metrics.get(w.id)?.durationSec ?? 0) : 0), 0)
  const aiWeekTss = dates.reduce((a, d) => {
    const w = plan.aiWorkouts?.find((x) => x.date === d && isRide(x))
    return a + (w ? workoutMetrics(w.sections, ftp).tss : 0)
  }, 0)
  const totals = plan.workouts.reduce((a, w) => ({ tss: a.tss + tssOf(w), sec: a.sec + (metrics.get(w.id)?.durationSec ?? 0) }), { tss: 0, sec: 0 })

  // ── bewerken per dag ──────────────────────────────────────
  const setWorkouts = (ws: Workout[]) => change({ ...plan, workouts: [...ws].sort((a, b) => a.date.localeCompare(b.date)) })
  const pick = (date: string, key: string) => {
    if (!inPlan(date)) return
    const cur = byDate.get(date)
    if (key === 'rust') return cur && remove(cur.id)
    if (key === '__eigen') return
    const t = TEMPLATES[key]
    const body = { name: t.name, stimulus: t.stimulus, coachNote: t.note(1), sections: t.build(1) }
    // een bestaande training houdt id, feedback van de atleet en remoteId
    if (cur) setWorkouts(plan.workouts.map((w) => (w.id === cur.id ? { ...cur, ...body } : w)))
    else setWorkouts([...plan.workouts, { id: uid('w'), date, sport: 'Ride', ...body }])
  }
  /** Past de totale duur aan via de hoofdmoot; false als er niets veranderde (dan zet het veld zich terug). */
  const setDuration = (w: Workout, text: string): boolean => {
    const total = parseMinutes(text)
    const m = metrics.get(w.id)
    const main = mainStepSec(w.sections) / 60
    if (total == null || !m || !main || !canSetDuration(w)) return false
    // alleen focussen en weer verlaten verandert niets
    if (total === Math.round(m.durationSec / 60)) return false
    const overhead = m.durationSec / 60 - main
    const nextMain = Math.round(clamp(total - overhead, 10, 420))
    if (nextMain === Math.round(main)) return false
    setWorkouts(plan.workouts.map((x) => (x.id === w.id ? { ...x, sections: setMainDuration(x.sections, nextMain) } : x)))
    return true
  }
  const inPlan = (d: string) => d >= plan.startDate && d <= end
  /** Uit de editor: datum binnen het blok en niet op een dag waar al een rit staat. */
  const fromEditor = (w: Workout) => {
    const cur = plan.workouts.find((x) => x.id === w.id)
    const taken = plan.workouts.some((x) => x.id !== w.id && x.date === w.date && isRide(x))
    const date = inPlan(w.date) && !taken ? w.date : (cur?.date ?? w.date)
    setWorkouts(plan.workouts.map((x) => (x.id === w.id ? { ...w, date } : x)))
  }
  const move = (date: string, dir: -1 | 1) => {
    const target = addDays(date, dir)
    if (!inPlan(target)) return
    setWorkouts(plan.workouts.map((w) => (w.date === date ? { ...w, date: target } : w.date === target ? { ...w, date } : w)))
  }
  const remove = (id: string) => {
    setWorkouts(plan.workouts.filter((w) => w.id !== id))
    if (id === editing) setEditing(null)
  }
  const editingWorkout = plan.workouts.find((w) => w.id === editing) ?? null

  // ── bevestigen, opnieuw uitzetten ─────────────────────────
  const confirm = async () => {
    setPubErr(null)
    setInflight(plan.id, { kind: 'bevestigen', athleteId: plan.athleteId })
    setConfirming(true)
    window.clearTimeout(timer.current)
    pending.current = null
    try {
      await api.savePlan(plan)
      setSaving('idle')
      // de bronslijn tekent zichzelf; daarna gaat de koers naar Intervals.icu
      // lijn 1,1 s, daarna landt de coach (0,3 s)
      const [r] = await Promise.all([api.publish(plan.id), new Promise((res) => setTimeout(res, reducedMotion() ? 0 : 1450))])
      onChange(r.plan)
      setResult(r.result)
      onConfirmed()
    } catch (e) {
      setPubErr((e as Error).message)
    } finally {
      // de bevestigde look komt daarna uit de status; een latere bijsturing maakt de lijn weer gestippeld
      setConfirming(false)
      setInflight(plan.id)
    }
  }
  // opnieuw uitzetten kan alleen voor een voorstel dat nog niet begonnen is
  const canRegen = concept && !!plan.request && plan.startDate > now
  const regenerate = async () => {
    if (!plan.request || !canRegen) return
    setInflight(plan.id, { kind: 'uitzetten', athleteId: plan.athleteId })
    setRegenErr(null)
    try {
      // eerst een openstaande opslag (bv. de notitie) wegschrijven: die gaat mee naar het nieuwe voorstel
      window.clearTimeout(timer.current)
      if (pending.current) {
        const toSave = pending.current
        pending.current = null
        await api.savePlan(toSave)
      }
      const { plan: next, warning, replaced } = await api.generate(ov.athlete.id, { ...plan.request, instructions: instr.trim() || undefined, replaces: plan.id })
      const ignored = instr.trim() && next.source === 'regels' ? 'De regelgenerator leest geen instructies: het voorstel is opnieuw opgebouwd, pas het zelf aan waar nodig.' : undefined
      onReplace(next, replaced, [warning, ignored].filter(Boolean).join(' ') || undefined)
    } catch (e) {
      setRegenErr((e as Error).message)
    } finally {
      setInflight(plan.id)
    }
  }

  const confirmedLook = confirming || plan.status === 'gepubliceerd'
  // tijdens bevestigen of opnieuw uitzetten staat bewerken op slot
  const locked = publishing || regenBusy
  const byAi = plan.source === 'ai'
  const rideCount = plan.workouts.filter((w) => rides(w)).length
  // twee bevestigde koersen op dezelfde dagen kan niet (dan twee trainingen op één dag)
  const clash = plan.status !== 'gepubliceerd' ? overlapping(plans, plan, now) : []

  return (
    <div className="grid gap-4">
      {/* kop */}
      <section className="panel px-4 py-3 flex flex-wrap items-center gap-3">
        <fieldset disabled={locked} className="contents">
        <div className="min-w-0 flex-1">
          <input
            id="plan-title"
            aria-label="Titel van het blok"
            className="w-full bg-transparent border-0 p-0 text-[18px] font-semibold tracking-tight text-ink focus:outline-none font-display"
            value={plan.title}
            onChange={(e) => change({ ...plan, title: e.target.value })}
          />
          <div className="text-[12px] text-muted mt-0.5">
            {fmtDate(plan.startDate)} – {fmtDate(end)} · {rideCount} trainingen · <span className="num">{fmtDuration(totals.sec)}</span> · <span className="num">{round(totals.tss)}</span> TSS
            {saving === 'fout' ? (
              <span className="ml-2 inline-flex items-center gap-1 text-crit" role="alert">
                <CloudOff size={12} aria-hidden />
                Opslaan mislukt ·
                <button type="button" className="underline bg-transparent border-0 p-0 text-inherit cursor-pointer" onClick={flush}>
                  opnieuw
                </button>
              </span>
            ) : (
              saving !== 'idle' && <span className="ml-2">{saving === 'saving' ? 'Opslaan…' : 'Opgeslagen'}</span>
            )}
          </div>
        </div>
        {askDelete ? (
          <span className="flex flex-wrap items-center gap-2 text-[13px]">
            Blok verwijderen? Workouts in intervals.icu blijven staan.
            <button className="btn btn-sm" onClick={onDelete}>
              Verwijder
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setAskDelete(false)}>
              Annuleer
            </button>
          </span>
        ) : (
          <button className="btn btn-sm btn-ghost" onClick={() => setAskDelete(true)}>
            <Trash2 size={14} aria-hidden />
            Verwijder blok
          </button>
        )}
        </fieldset>
      </section>

      <div className="grid gap-4 xl:grid-cols-[290px_minmax(0,1fr)_300px] items-start">
        {/* ── midden: de uitgezette week ── */}
        <section aria-label="De week" className="grid gap-3 xl:col-start-2 xl:row-start-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="h2">
              Week {week + 1} · {fmtDate(from)} – {fmtDate(addDays(from, 6))}
            </h2>
            <StatusChip status={planState(plan)} />
            {nWeeks > 1 && (
              <span className="ml-auto flex items-center gap-1">
                <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => setWeek((w) => w - 1)} disabled={week === 0} aria-label="Vorige week">
                  <ChevronLeft size={16} aria-hidden />
                </button>
                <span className="num text-[12px] text-muted">
                  {week + 1}/{nWeeks}
                </span>
                <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => setWeek((w) => w + 1)} disabled={week === nWeeks - 1} aria-label="Volgende week">
                  <ChevronRight size={16} aria-hidden />
                </button>
              </span>
            )}
          </div>
          {plan.weeks[week]?.focus && <div className="text-[12.5px] text-muted -mt-1.5">{plan.weeks[week].focus}</div>}

          <div>
            <Koerslijn
              labels={[...DAY_SHORT]}
              changed={dates.map((d) => (concept ? changes.has(d) : sinceConfirm.has(d)))}
              confirmed={confirmedLook}
              animate={confirming}
              coachInitials={coachName ? initialsOf(coachName) : undefined}
              by={plan.source}
            />
            <div className={`text-[12.5px] ${concept && !confirming ? (byAi ? 'font-mono text-ai-text' : 'text-muted') : 'coach-note !text-[14px] !text-coach-text'}`}>
              {confirming
                ? 'Bevestigen…'
                : plan.status === 'gepubliceerd'
                  ? `Bevestigd${byCoach}${plan.confirmedAt ? ` · ${localDay(plan.confirmedAt)}` : ''}`
                  : plan.status === 'gewijzigd'
                    ? `Bijgestuurd na bevestiging${byCoach}: opnieuw bevestigen`
                    : `${byAi ? 'Uitgezet door AI' : 'Voorstel van de regelgenerator'} · ${localDay(plan.createdAt)}`}
            </div>
          </div>

          <fieldset disabled={locked} className="contents">
          <div className="grid gap-2">
            {dates.map((date, i) => {
              const w = byDate.get(date)
              const m = w ? metrics.get(w.id) : undefined
              const ch = changes.get(date)
              const was = (label: string) => ch?.fields.find((f) => f.label === label)?.was
              const key = templateKeyOf(w)
              const adjustable = !!w && canSetDuration(w)
              const status = trainingStatus(plan, date, {
                hasRide: !!rides(w),
                confirmedRide: baseRides?.has(date),
                changed: !!ch,
                changedSinceConfirm: sinceConfirm.has(date),
                rode: rode.has(date),
                today: now,
              })
              return (
                <div
                  key={date}
                  className={`panel !rounded-[var(--radius-card)] px-3 py-2.5 grid grid-cols-[46px_minmax(0,1fr)] gap-x-3 items-start transition-colors ${ch ? '!border-coach' : ''} ${!w ? 'opacity-80' : ''}`}
                >
                  <div className="font-mono text-[11px] uppercase tracking-[.06em] text-muted pt-1.5">
                    {DAY_SHORT[i]}
                    <small className="block normal-case tracking-normal text-[10.5px]">{fmtDate(date)}</small>
                  </div>
                  <div className="grid gap-1.5 min-w-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_76px_72px] gap-2 items-start">
                      <div className="min-w-0">
                        <select
                          className="field field-sm"
                          aria-label={`Training op ${DAY_LONG[i]} ${fmtDate(date)}`}
                          value={key}
                          onChange={(e) => pick(date, e.target.value)}
                          disabled={!inPlan(date)}
                          title={inPlan(date) ? undefined : 'Buiten dit blok'}
                        >
                          <option value="rust">Rustdag</option>
                          {key === '__eigen' && w && <option value="__eigen">{w.name}</option>}
                          {TEMPLATE_OPTIONS.map(([k, t]) => (
                            <option key={k} value={k}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                        {was('Training') && <Correction was={was('Training')} by={plan.source} />}
                      </div>
                      <div>
                        {w && m ? (
                          <input
                            key={`${w.id}-${m.durationSec}`}
                            className="field field-sm num"
                            aria-label={`Duur op ${DAY_LONG[i]}`}
                            defaultValue={fmtHm(m.durationSec)}
                            readOnly={!adjustable}
                            title={adjustable ? 'Totale duur (u:mm)' : 'Intervaltraining: pas de stappen aan via Bewerk'}
                            onBlur={(e) => {
                              if (!setDuration(w, e.target.value)) e.target.value = fmtHm(m.durationSec)
                            }}
                            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                          />
                        ) : (
                          <span className="text-muted leading-7">—</span>
                        )}
                        {was('Duur') && <Correction was={was('Duur')} by={plan.source} />}
                      </div>
                      <div className="num text-[12.5px] leading-7">
                        {m ? (
                          <>
                            TSS <b className="font-medium">{m.tss}</b>
                          </>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                        {was('TSS') && (
                          <div className="leading-normal">
                            <Correction was={was('TSS')} by={plan.source} />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex-1 min-w-0">{w && <WorkoutProfile sections={w.sections} ftp={ftp} height={18} mini />}</div>
                      {status && <StatusChip status={status} by={plan.source} />}
                      <span className="flex gap-0.5">
                        <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => move(date, -1)} disabled={!w || !inPlan(addDays(date, -1))} aria-label={`${DAY_LONG[i]}: naar de vorige dag`} title="Naar vorige dag">
                          <ArrowUp size={14} aria-hidden />
                        </button>
                        <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => move(date, 1)} disabled={!w || !inPlan(addDays(date, 1))} aria-label={`${DAY_LONG[i]}: naar de volgende dag`} title="Naar volgende dag">
                          <ArrowDown size={14} aria-hidden />
                        </button>
                        <button
                          className={`btn btn-sm btn-ghost !px-1.5 ${editing === w?.id ? '!bg-raised' : ''}`}
                          onClick={() => w && setEditing(editing === w.id ? null : w.id)}
                          disabled={!w}
                          aria-label={`${DAY_LONG[i]}: stappen bewerken`}
                          aria-pressed={!!w && editing === w.id}
                          title="Stappen bewerken"
                        >
                          <SlidersHorizontal size={14} aria-hidden />
                        </button>
                        <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => w && remove(w.id)} disabled={!w} aria-label={`${DAY_LONG[i]}: training verwijderen`} title="Verwijderen">
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          </fieldset>

          <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 font-mono text-[12px] text-muted px-1">
            <span>
              Gepland <b className="text-ink font-medium">{round(weekTss)} TSS</b>
              {plan.aiWorkouts && round(aiWeekTss) !== round(weekTss) && (
                <>
                  {' '}
                  <Correction was={round(aiWeekTss)} by={plan.source} />
                </>
              )}
            </span>
            <span>
              <b className="text-ink font-medium">{(weekSec / 3600).toFixed(1).replace('.', ',')} u</b>
            </span>
            {c0 != null && c1 != null && (
              <span>
                Verwachte conditie-delta <b className="text-ink font-medium">{signed(c1 - c0, 1)}</b>
              </span>
            )}
          </div>

          {editingWorkout && (
            <fieldset disabled={locked} className="contents">
            <WorkoutEditor
              key={editingWorkout.id}
              workout={editingWorkout}
              ftp={ftp}
              model={ov.model}
              minDate={plan.startDate}
              maxDate={end}
              takenDates={plan.workouts.filter((w) => w.id !== editingWorkout.id).map((w) => w.date)}
              onChange={fromEditor}
              onDelete={() => remove(editingWorkout.id)}
              onClose={() => setEditing(null)}
            />
            </fieldset>
          )}
        </section>

        {/* ── links: context ── */}
        <aside aria-label="Context" className="grid gap-3 xl:col-start-1 xl:row-start-1 min-w-0">
          <section className="panel p-3">
            <h3 className="eyebrow mb-2">Vorm · projectie beweegt mee</h3>
            <FormChart
              compact
              history={history}
              planAi={showAi ? aiPlanned : []}
              planAiSource={plan.source}
              planCoach={showCoach ? curPlanned : []}
              coachName={plan.status === 'gepubliceerd' ? (coachName ?? (aiOnly ? 'bevestiging' : 'je coach')) : 'jouw bijsturing'}
              goals={ov.goals}
              ftp={ftp}
              weightKg={ov.athlete.weightKg}
            />
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 font-mono text-[11px]">
              {showAi && lastAi && <span className={byAi ? 'text-ai-text' : 'text-muted'}>{byAi ? 'AI-koers' : 'Voorstel'}: vorm {signed(lastAi.tsb)}</span>}
              {showCoach && lastCoach && (
                <span className="text-coach-text">
                  {plan.status === 'gepubliceerd' ? 'Bevestigd' : 'Na bijsturing'}: vorm {signed(lastCoach.tsb)}
                </span>
              )}
            </div>
          </section>

          <section className="panel p-3.5">
            <h3 className="eyebrow mb-2.5">Vorige week · gepland vs gereden</h3>
            <PrevWeek rows={prevWeek} />
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 mt-3 text-[12px] m-0">
              <dt className="text-muted">Op koers</dt>
              <dd className="num m-0 text-right">{onCourse != null ? `${onCourse}%` : '—'}</dd>
              <dt className="text-muted">Gereden</dt>
              <dd className="num m-0 text-right">
                {round(prevWeek.reduce((a, r) => a + r.ridden, 0))} / {round(prevWeek.reduce((a, r) => a + r.planned, 0))} TSS
              </dd>
            </dl>
          </section>

          <section className="panel p-3.5">
            <h3 className="eyebrow mb-2.5">Gevoel en notities van {first}</h3>
            {fb ? (
              <>
                <div className="flex items-center gap-1.5" role="img" aria-label={`Gevoel ${FEEL_SCALE[fb.feedback.feel]} van 5 (${fb.feedback.feel})`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span
                      key={n}
                      aria-hidden
                      className={`w-[22px] h-[22px] rounded-full grid place-items-center font-mono text-[11px] font-medium ${n === FEEL_SCALE[fb.feedback.feel] ? 'bg-accent text-on-accent' : 'bg-raised text-muted'}`}
                    >
                      {n}
                    </span>
                  ))}
                  <span className="ml-1.5 text-[12px] text-muted">
                    {fb.feedback.feel} · RPE {fb.feedback.rpe} · {fmtDate(fb.date, true)}
                  </span>
                </div>
                {fb.feedback.comment && <p className="m-0 mt-2.5 leading-[1.45]">“{fb.feedback.comment}”</p>}
              </>
            ) : (
              <p className="m-0 text-muted text-[12.5px]">Nog geen feedback op een training.</p>
            )}
          </section>

          <section className="panel p-3.5">
            <h3 className="eyebrow mb-2.5">Eerstvolgende koers</h3>
            {goal ? (
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[12px] m-0">
                <dt>
                  {goal.label} · {goal.name}
                </dt>
                <dd className="num m-0 text-right">{daysBetween(now, goal.date)} d</dd>
                <dt className="text-muted">Verwachte vorm</dt>
                <dd className="num m-0 text-right">{goalForm != null ? `${signed(goalForm)} · ${formState(goalForm).label}` : 'nog geen planning'}</dd>
              </dl>
            ) : (
              <p className="m-0 text-muted text-[12.5px]">Geen doelkoers in intervals.icu.</p>
            )}
          </section>
        </aside>

        {/* ── rechts: actie ── */}
        <aside aria-label="Actie" className="grid gap-3 xl:col-start-3 xl:row-start-1 min-w-0">
          {plan.rationale &&
            (byAi ? (
              <details className="voice-ai" open>
                <summary>Waarom deze koers</summary>
                <p className="m-0">{plan.rationale}</p>
              </details>
            ) : (
              <details className="panel px-3.5 py-3 text-[13px]" open>
                <summary className="eyebrow cursor-pointer">Waarom dit voorstel · regels</summary>
                <p className="m-0 mt-2 text-muted leading-[1.5]">{plan.rationale}</p>
              </details>
            ))}

          <fieldset disabled={locked} className="panel p-3.5 min-w-0">
            <label htmlFor="plan-note" className="eyebrow block mb-2">
              Notitie aan {first}
            </label>
            <textarea
              id="plan-note"
              className="field font-serif italic !text-[15px] !leading-[1.45] !text-coach-text min-h-24"
              placeholder={`Wat geef je ${first} mee bij deze koers?`}
              value={plan.note ?? ''}
              onChange={(e) => change({ ...plan, note: e.target.value })}
            />
          </fieldset>

          <div className="grid gap-2">
            <button
              className="btn btn-coach btn-lg w-full justify-center"
              onClick={confirm}
              disabled={publishing || regenBusy || plan.status === 'gepubliceerd' || clash.length > 0}
              aria-describedby={plan.status !== 'gepubliceerd' ? 'confirm-hint' : undefined}
            >
              <Check size={16} aria-hidden />
              {publishing ? 'Bevestigen…' : plan.status === 'gepubliceerd' ? (plan.syncedAt ? 'Bevestigd · op de fietscomputer' : 'Bevestigd') : plan.status === 'gewijzigd' ? 'Opnieuw bevestigen' : 'Bevestigen'}
            </button>
            {plan.status !== 'gepubliceerd' &&
              (clash.length > 0 ? (
                <p id="confirm-hint" className="m-0 text-[11.5px] text-crit">
                  {overlapMessage(clash)}
                </p>
              ) : (
                <p id="confirm-hint" className="m-0 text-[11.5px] text-muted">
                  Zet {rideCount} trainingen in de Intervals.icu-kalender van {first}; daarvandaan naar Garmin, Wahoo of Zwift.
                </p>
              ))}
            {pubErr && (
              <Toast tone="crit" onClose={() => setPubErr(null)}>
                {pubErr}
              </Toast>
            )}
            {result && (
              <Toast tone="good" onClose={() => setResult(null)}>
                <div>{result.message}</div>
                <details className="mt-1.5 text-muted">
                  <summary className="cursor-pointer text-[12px]">Bekijk wat naar intervals.icu gaat</summary>
                  <pre className="num text-[11px] bg-surface text-ink rounded-md p-2.5 mt-2 overflow-auto max-h-72 whitespace-pre-wrap">{JSON.stringify(result.payloadPreview.slice(0, 2), null, 2)}</pre>
                </details>
              </Toast>
            )}

            <section className="panel px-3 py-2.5">
              <label htmlFor="plan-instr" className="eyebrow block mb-1.5">
                Opnieuw laten uitzetten
              </label>
              <input
                id="plan-instr"
                className="field field-sm"
                placeholder="bijv. minder volume, examenweek"
                value={instr}
                onChange={(e) => setInstr(e.target.value)}
                disabled={!canRegen || regenBusy}
              />
              <button className="btn btn-sm mt-2" onClick={regenerate} disabled={!canRegen || regenBusy || publishing}>
                <RefreshCw size={14} aria-hidden />
                {regenBusy ? 'Uitzetten…' : 'Opnieuw uitzetten'}
              </button>
              {concept && plan.startDate <= now ? (
                <p className="m-0 mt-1.5 text-[11.5px] text-muted">Dit voorstel is al begonnen: stuur het hier bij, of maak een nieuw blok.</p>
              ) : !concept ? (
                <p className="m-0 mt-1.5 text-[11.5px] text-muted">
                  {plan.status === 'gewijzigd' ? 'Deze koers is al bevestigd: bevestig je bijsturing opnieuw, of maak een nieuw blok.' : 'Deze koers is bevestigd: stuur hem hier bij, of maak een nieuw blok.'}
                </p>
              ) : (
                !plan.request && <p className="m-0 mt-1.5 text-[11.5px] text-muted">Dit blok heeft geen bewaard verzoek; maak een nieuw blok.</p>
              )}
              {regenErr && <p className="m-0 mt-1.5 text-[12px] text-crit">{regenErr}</p>}
            </section>

            <button className="btn btn-ghost justify-center" onClick={() => nav('/app')}>
              Later
            </button>
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Vorige week: gepland (gestippelde omtrek) tegen gereden, gemist in rood. */
function PrevWeek({ rows }: { rows: { date: string; planned: number; ridden: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.planned, r.ridden)))
  return (
    <div className="grid gap-1.5">
      {rows.map((r, i) => (
        <div key={r.date} className="grid grid-cols-[24px_1fr_52px] items-center gap-2 font-mono text-[11px]">
          <span className="text-muted">{DAY_SHORT[i]}</span>
          <span className="relative h-2 rounded bg-raised overflow-hidden" aria-hidden>
            {r.planned > 0 && <i className="absolute inset-y-0 left-0 rounded border border-dashed border-muted" style={{ width: `${(r.planned / max) * 100}%` }} />}
            <i
              className="absolute inset-y-0 left-0 rounded"
              style={{ width: `${(Math.max(r.ridden, r.planned && !r.ridden ? r.planned * 0.04 : 0) / max) * 100}%`, background: r.planned > 0 && !r.ridden ? 'var(--delta-neg)' : 'var(--zone-3)' }}
            />
          </span>
          <span className="text-right">{r.planned || r.ridden ? `${round(r.ridden)}/${round(r.planned)}` : '—'}</span>
        </div>
      ))}
    </div>
  )
}
