import { useEffect, useMemo, useRef, useState } from 'react'
import type { AthleteOverview, GenerateRequest, PublishResult, TrainingPlan, Workout } from '@shared/types'
import { projectPmc, workoutMetrics } from '@shared/metrics'
import { TEMPLATES } from '@shared/library'
import { historyFromOverview, plannedDays } from '@shared/formSeries'
import { addDays, DAY_LONG, DAY_SHORT, fmtDate, fmtDuration, mondayOf, round, today, uid } from '@shared/util'
import { api } from '../api'
import { useApp } from '../App'
import { WorkoutProfile } from '../components/charts'
import { FormChart } from '../components/FormChart'
import { Empty, Panel, Toast } from '../components/ui'
import { WorkoutEditor } from '../components/WorkoutEditor'

export function PlanTab({ ov, plans, setPlans }: { ov: AthleteOverview; plans: TrainingPlan[]; setPlans: (p: TrainingPlan[]) => void }) {
  const [selId, setSelId] = useState<string | null>(plans[0]?.id ?? null)
  const [creating, setCreating] = useState(plans.length === 0)
  const [notice, setNotice] = useState<{ tone: 'good' | 'warn' | 'crit'; text: string } | null>(null)
  const plan = plans.find((p) => p.id === selId) ?? null

  const update = (p: TrainingPlan) => setPlans(plans.map((x) => (x.id === p.id ? p : x)))

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
          onCreated={(p, warning) => {
            setPlans([p, ...plans])
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
          onChange={update}
          onDelete={async () => {
            await api.deletePlan(plan.id)
            const rest = plans.filter((p) => p.id !== plan.id)
            setPlans(rest)
            setSelId(rest[0]?.id ?? null)
            if (!rest.length) setCreating(true)
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

function GeneratorForm({ ov, onCreated }: { ov: AthleteOverview; onCreated: (p: TrainingPlan, warning?: string) => void }) {
  const { config } = useApp()
  const nextMonday = addDays(mondayOf(today()), 7)
  // Standaard uren = gemiddelde van de laatste 4 weken (afgerond op een half uur)
  const recentHours = ov.activities.filter((x) => x.date >= addDays(today(), -28)).reduce((s, x) => s + x.movingTimeSec, 0) / 3600 / 4
  const defaultHours = Math.max(4, Math.min(25, Math.round(recentHours * 2) / 2 || 8))
  const [req, setReq] = useState<GenerateRequest>({
    goal: ov.athlete.goal ?? '',
    eventDate: '',
    startDate: nextMonday,
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
// Blokweergave + editor
// ─────────────────────────────────────────────────────────────

function PlanView({ ov, plan, onChange, onDelete }: { ov: AthleteOverview; plan: TrainingPlan; onChange: (p: TrainingPlan) => void; onDelete: () => void }) {
  const ftp = ov.athlete.ftp
  const [editing, setEditing] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'publish' | 'delete' | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<PublishResult | null>(null)
  const [pubErr, setPubErr] = useState<string | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timer = useRef<number | undefined>(undefined)

  // Autosave (debounced)
  const change = (p: TrainingPlan) => {
    const next = { ...p, status: p.status === 'gepubliceerd' ? ('gewijzigd' as const) : p.status }
    onChange(next)
    setSaving('saving')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(async () => {
      try {
        await api.savePlan(next)
        setSaving('saved')
      } catch {
        setSaving('idle')
      }
    }, 600)
  }
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const metrics = useMemo(() => new Map(plan.workouts.map((w) => [w.id, workoutMetrics(w.sections, ftp, ov.model)])), [plan.workouts, ftp, ov.model])
  const weekStart0 = mondayOf(plan.startDate)
  const planEnd = addDays(weekStart0, plan.weeks.length * 7 - 1)

  const projection = useMemo(() => {
    const last = ov.wellness.at(-1)
    if (!last) return []
    const loads = new Map<string, number>()
    for (const p of ov.plannedLoad) loads.set(p.date, (loads.get(p.date) ?? 0) + p.load)
    for (const w of plan.workouts) if (w.date > last.date) loads.set(w.date, (loads.get(w.date) ?? 0) + (metrics.get(w.id)?.tss ?? 0))
    const days = Math.max(14, Math.round((new Date(planEnd).getTime() - new Date(last.date).getTime()) / 86400000) + 7)
    return projectPmc({ date: last.date, ctl: last.ctl, atl: last.atl }, loads, days)
  }, [ov, plan.workouts, metrics, planEnd])

  const history = useMemo(() => historyFromOverview(ov, today()), [ov])
  const planned = useMemo(() => plannedDays(plan.workouts, ftp, ov.plannedLoad), [plan.workouts, ftp, ov.plannedLoad])
  const endPoint = projection.find((p) => p.date === planEnd) ?? projection.at(-1)
  const totals = plan.workouts.reduce((a, w) => ({ tss: a.tss + (metrics.get(w.id)?.tss ?? 0), sec: a.sec + (metrics.get(w.id)?.durationSec ?? 0) }), { tss: 0, sec: 0 })
  const editingWorkout = plan.workouts.find((w) => w.id === editing) ?? null
  const minRamp = projection.length ? round(((endPoint?.ctl ?? 0) - ov.athlete.ctl) / Math.max(1, plan.weeks.length), 1) : 0

  const setWorkout = (w: Workout) => change({ ...plan, workouts: plan.workouts.map((x) => (x.id === w.id ? w : x)).sort((a, b) => a.date.localeCompare(b.date)) })
  const removeWorkout = (id: string) => {
    change({ ...plan, workouts: plan.workouts.filter((x) => x.id !== id) })
    setEditing(null)
  }
  const addWorkout = (date: string, key: keyof typeof TEMPLATES) => {
    const t = TEMPLATES[key]
    const w: Workout = { id: uid('w'), date, name: t.name, sport: 'Ride', stimulus: t.stimulus, coachNote: t.note(1), sections: t.build(1) }
    change({ ...plan, workouts: [...plan.workouts, w].sort((a, b) => a.date.localeCompare(b.date)) })
    setEditing(w.id)
  }

  const publish = async () => {
    setPublishing(true)
    setPubErr(null)
    try {
      window.clearTimeout(timer.current)
      await api.savePlan(plan)
      const r = await api.publish(plan.id)
      onChange(r.plan)
      setResult(r.result)
      setConfirm(null)
    } catch (e) {
      setPubErr((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="grid gap-5">
      {/* Kop */}
      <section className="panel p-4 grid gap-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className={`chip ${plan.status === 'gepubliceerd' ? 'chip-good' : plan.status === 'gewijzigd' ? 'chip-warn' : ''}`}>
                {plan.status === 'gepubliceerd' ? 'Gepubliceerd' : plan.status === 'gewijzigd' ? 'Gewijzigd na publiceren' : 'Concept'}
              </span>
              {plan.source === 'ai' ? <span className="chip chip-ai">AI-concept</span> : <span className="chip">Regelgebaseerd</span>}
              <span className="text-[11.5px] text-muted">{saving === 'saving' ? 'Opslaan…' : saving === 'saved' ? 'Opgeslagen' : ''}</span>
            </div>
            <input
              id="plan-title"
              aria-label="Titel van het blok"
              className="w-full bg-transparent border-0 p-0 text-[20px] font-semibold tracking-tight text-ink focus:outline-none"
              value={plan.title}
              onChange={(e) => change({ ...plan, title: e.target.value })}
            />
            <div className="text-[12.5px] text-muted mt-1">
              {fmtDate(weekStart0)} – {fmtDate(planEnd)} · {plan.workouts.length} trainingen · <span className="num">{fmtDuration(totals.sec)}</span> ·{' '}
              <span className="num">{round(totals.tss)}</span> TSS
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={() => setConfirm('delete')}>
              Verwijder
            </button>
            <button className="btn btn-primary" onClick={() => setConfirm('publish')}>
              {plan.status === 'concept' ? 'Publiceer naar intervals.icu' : 'Opnieuw publiceren'}
            </button>
          </div>
        </div>

        {confirm === 'publish' && (
          <div className="rounded-lg border border-line p-3.5 grid gap-2 bg-raised">
            <div className="text-[13px]">
              <b>{plan.workouts.filter((w) => w.stimulus !== 'Rust').length} workouts</b> naar de intervals.icu-kalender van {ov.athlete.name}. Bestaande Koersplan-workouts van dit blok worden bijgewerkt;
              verwijderde worden uit de kalender gehaald. Van daaruit synct intervals.icu naar Garmin, Wahoo en Zwift.
            </div>
            {pubErr && <div className="text-crit text-[13px]">{pubErr}</div>}
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={publish} disabled={publishing}>
                {publishing ? 'Publiceren…' : 'Bevestig publiceren'}
              </button>
              <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
                Annuleer
              </button>
            </div>
          </div>
        )}
        {confirm === 'delete' && (
          <div className="rounded-lg border border-line p-3.5 flex flex-wrap items-center gap-3 bg-raised">
            <span className="text-[13px]">Blok verwijderen uit Koersplan? Workouts die al in intervals.icu staan blijven daar staan.</span>
            <button className="btn" onClick={onDelete}>
              Verwijder blok
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirm(null)}>
              Annuleer
            </button>
          </div>
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

        {plan.rationale && (
          <details open className="text-[13px]">
            <summary className="cursor-pointer eyebrow !text-muted">Waarom dit blok</summary>
            <p className="text-muted leading-relaxed mt-2 mb-0 max-w-[80ch]">{plan.rationale}</p>
          </details>
        )}
      </section>

      {/* Projectie */}
      <Panel
        title="Projectie: waar staat de atleet na dit blok?"
        action={
          endPoint && (
            <span className="text-[12px] text-muted num">
              eind: CTL {endPoint.ctl} ({endPoint.ctl - ov.athlete.ctl >= 0 ? '+' : ''}
              {round(endPoint.ctl - ov.athlete.ctl, 1)}) · vorm {endPoint.tsb > 0 ? '+' : ''}
              {endPoint.tsb} · gem. {minRamp > 0 ? '+' : ''}
              {minRamp}/week
            </span>
          )
        }
      >
        <FormChart
          compact
          history={history}
          planAi={plan.status === 'concept' ? planned : []}
          planAiSource={plan.source}
          planCoach={plan.status === 'concept' ? [] : planned}
          goals={ov.goals}
          ftp={ftp}
          weightKg={ov.athlete.weightKg}
        />
      </Panel>

      {/* Weekrooster */}
      <div className="grid gap-4">
        {plan.weeks.map((wk, wi) => {
          const from = addDays(weekStart0, wi * 7)
          const ws = plan.workouts.filter((w) => w.date >= from && w.date <= addDays(from, 6))
          const tss = ws.reduce((a, w) => a + (metrics.get(w.id)?.tss ?? 0), 0)
          const sec = ws.reduce((a, w) => a + (metrics.get(w.id)?.durationSec ?? 0), 0)
          return (
            <section key={wi} className="panel">
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3 pb-2 border-b border-line">
                <h3 className="m-0 text-[13px] font-semibold">Week {wi + 1}</h3>
                <span className="text-[12.5px] text-muted">{wk.focus}</span>
                <span className="ml-auto text-[12px] text-muted num">
                  {fmtDate(from)} · {fmtDuration(sec)} · {round(tss)} TSS
                </span>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-px bg-line rounded-b-[10px] overflow-hidden">
                {Array.from({ length: 7 }, (_, d) => {
                  const date = addDays(from, d)
                  const w = ws.find((x) => x.date === date)
                  const m = w ? metrics.get(w.id) : undefined
                  const past = date < today()
                  return (
                    <div key={d} className={`bg-surface min-h-[118px] p-2 flex flex-col ${past ? 'opacity-70' : ''}`}>
                      <div className="flex items-center justify-between text-[11px] text-muted mb-1.5">
                        <span>
                          {DAY_SHORT[d]} {fmtDate(date).split(' ')[0]}
                        </span>
                        {w?.feedback && <span className="chip !h-4 !px-1.5 !text-[10px]">RPE {w.feedback.rpe}</span>}
                      </div>
                      {w && m ? (
                        <button
                          onClick={() => setEditing(w.id)}
                          className={`text-left flex-1 flex flex-col gap-1 rounded-md p-1.5 -m-0.5 cursor-pointer border ${editing === w.id ? 'border-ink bg-raised' : 'border-transparent hover:bg-raised'}`}
                        >
                          <span className="text-[10.5px] text-muted uppercase tracking-wide">{w.stimulus}</span>
                          <span className="text-[12.5px] font-medium leading-snug text-ink line-clamp-2">{w.name}</span>
                          <WorkoutProfile sections={w.sections} ftp={ftp} height={28} mini />
                          <span className="text-[11px] text-muted num">
                            {fmtDuration(m.durationSec)} · {m.tss} TSS
                            {m.wbalEmptied && <span className="text-crit"> · W′ leeg</span>}
                          </span>
                        </button>
                      ) : (
                        <AddWorkout onAdd={(k) => addWorkout(date, k)} />
                      )}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>

      {editingWorkout && (
        <WorkoutEditor
          key={editingWorkout.id}
          workout={editingWorkout}
          ftp={ftp}
          model={ov.model}
          minDate={weekStart0}
          maxDate={planEnd}
          takenDates={plan.workouts.filter((w) => w.id !== editingWorkout.id).map((w) => w.date)}
          onChange={setWorkout}
          onDelete={() => removeWorkout(editingWorkout.id)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

function AddWorkout({ onAdd }: { onAdd: (k: keyof typeof TEMPLATES) => void }) {
  const [open, setOpen] = useState(false)
  if (!open)
    return (
      <button className="flex-1 rounded-md border border-dashed border-line text-muted text-[12px] cursor-pointer bg-transparent hover:bg-raised" onClick={() => setOpen(true)} aria-label="Training toevoegen">
        + training
      </button>
    )
  return (
    <select
      autoFocus
      className="field field-sm"
      defaultValue=""
      onBlur={() => setOpen(false)}
      onChange={(e) => {
        if (e.target.value) onAdd(e.target.value as keyof typeof TEMPLATES)
        setOpen(false)
      }}
    >
      <option value="" disabled>
        Kies type…
      </option>
      {Object.entries(TEMPLATES).map(([k, t]) => (
        <option key={k} value={k}>
          {t.name}
        </option>
      ))}
    </select>
  )
}
