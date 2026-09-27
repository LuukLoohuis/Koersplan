import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { AthleteOverview, TrainingPlan } from '@shared/types'
import { fmtDate, fmtDuration, round } from '@shared/util'
import { api } from '../api'
import { PdChart, PmcChart } from '../components/charts'
import { Empty, FlagChips, KpiStrip, Panel } from '../components/ui'
import { PlanTab } from './PlanTab'

type Tab = 'analyse' | 'plan' | 'feedback'

export function AthletePage() {
  const { id = '' } = useParams()
  const [ov, setOv] = useState<AthleteOverview | null>(null)
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('analyse')
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (fresh = false) => {
      setLoading(true)
      setErr(null)
      try {
        const [o, p] = await Promise.all([api.overview(id, fresh), api.plans(id)])
        setOv(o)
        setPlans(p)
      } catch (e) {
        setErr((e as Error).message)
      } finally {
        setLoading(false)
      }
    },
    [id],
  )
  useEffect(() => {
    setOv(null)
    setTab('analyse')
    load()
  }, [load])

  if (err)
    return (
      <div className="panel p-6">
        <h2 className="mt-0">Kan atleet niet laden</h2>
        <p className="text-ink-2">{err}</p>
        <button className="btn" onClick={() => load(true)}>
          Opnieuw proberen
        </button>
      </div>
    )
  if (!ov) return <div className="text-muted">Data ophalen uit intervals.icu…</div>
  const a = ov.athlete

  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{a.source === 'demo' ? 'Demo-atleet' : 'intervals.icu'} · {a.goal ?? 'geen doel ingesteld'}</div>
          <h1 className="text-[26px] font-semibold tracking-tight m-0 mt-1">{a.name}</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <Link className="btn no-underline" to={`/portaal/${a.id}`}>
            Portaal van atleet
          </Link>
          <button className="btn" onClick={() => load(true)} disabled={loading}>
            {loading ? 'Verversen…' : 'Ververs data'}
          </button>
        </div>
      </header>

      <KpiStrip a={a} />
      {a.flags.length > 0 && (
        <div className="flex items-center gap-2 -mt-1">
          <span className="eyebrow">Aandacht</span>
          <FlagChips flags={a.flags} />
        </div>
      )}

      <div role="tablist" className="border-b border-line flex">
        {(
          [
            ['analyse', 'Analyse'],
            ['plan', `Plannen${plans.length ? ` (${plans.length})` : ''}`],
            ['feedback', 'Feedback'],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className="tab" onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'analyse' && <Analyse ov={ov} />}
      {tab === 'plan' && <PlanTab ov={ov} plans={plans} setPlans={setPlans} />}
      {tab === 'feedback' && <FeedbackList plans={plans} />}
    </div>
  )
}

function Analyse({ ov }: { ov: AthleteOverview }) {
  const last7 = ov.wellness.slice(-7)
  const prev28 = ov.wellness.slice(-35, -7)
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 1) : null
  }
  const week = useMemo(() => {
    const from = ov.wellness.at(-7)?.date ?? ''
    const acts = ov.activities.filter((x) => x.date >= from)
    return { tss: round(acts.reduce((s, x) => s + x.load, 0)), sec: acts.reduce((s, x) => s + x.movingTimeSec, 0), n: acts.length }
  }, [ov])

  const well = [
    { label: 'HRV', unit: 'ms', now: avg(last7.map((w) => w.hrv)), base: avg(prev28.map((w) => w.hrv)), higherIsBetter: true },
    { label: 'Rusthartslag', unit: 'bpm', now: avg(last7.map((w) => w.restingHR)), base: avg(prev28.map((w) => w.restingHR)), higherIsBetter: false },
    { label: 'Slaap', unit: 'u', now: avg(last7.map((w) => w.sleepHours)), base: avg(prev28.map((w) => w.sleepHours)), higherIsBetter: true },
  ]

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <Panel title="Belasting: fitness, vermoeidheid en vorm">
          <PmcChart wellness={ov.wellness} />
        </Panel>
        <div className="grid gap-5 content-start">
          <Panel title="Laatste 7 dagen">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="eyebrow">TSS</div>
                <div className="num text-lg">{week.tss}</div>
              </div>
              <div>
                <div className="eyebrow">Tijd</div>
                <div className="num text-lg">{fmtDuration(week.sec)}</div>
              </div>
              <div>
                <div className="eyebrow">Ritten</div>
                <div className="num text-lg">{week.n}</div>
              </div>
            </div>
          </Panel>
          <Panel title="Herstel (7 d vs. 4 wk ervoor)">
            <div className="grid gap-2.5">
              {well.map((w) => {
                if (w.now == null) return null
                const diff = w.base ? round(((w.now - w.base) / w.base) * 100) : 0
                const bad = w.higherIsBetter ? diff < -7 : diff > 7
                return (
                  <div key={w.label} className="flex items-baseline gap-2">
                    <span className="text-ink-2 text-[13px]">{w.label}</span>
                    <span className="num ml-auto">
                      {w.now} <span className="text-muted text-[11px]">{w.unit}</span>
                    </span>
                    <span className={`num text-[11.5px] w-12 text-right ${bad ? 'text-crit' : 'text-muted'}`}>
                      {diff > 0 ? '+' : ''}
                      {diff}%
                    </span>
                  </div>
                )
              })}
              {well.every((w) => w.now == null) && <span className="text-muted text-xs">Geen wellness-data in intervals.icu.</span>}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Power-duration en CP-model"
          action={ov.model && <span className="text-[11.5px] text-muted num">R² {ov.model.r2} · {ov.model.points} punten (2–20 min)</span>}
        >
          <PdChart curve={ov.powerCurve} model={ov.model} weightKg={ov.athlete.weightKg} />
        </Panel>
        <Panel title="Recente activiteiten" pad={false}>
          <div className="overflow-auto max-h-[330px]">
            <table className="data">
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Rit</th>
                  <th className="text-right">Tijd</th>
                  <th className="text-right">TSS</th>
                  <th className="text-right">IF</th>
                  <th className="text-right">NP</th>
                </tr>
              </thead>
              <tbody>
                {ov.activities.slice(0, 40).map((x) => (
                  <tr key={x.id}>
                    <td className="text-ink-2">{fmtDate(x.date, true)}</td>
                    <td className="max-w-[200px] truncate">{x.name}</td>
                    <td className="num text-right">{fmtDuration(x.movingTimeSec)}</td>
                    <td className="num text-right">{round(x.load)}</td>
                    <td className="num text-right">{x.intensity != null ? x.intensity.toFixed(2) : '–'}</td>
                    <td className="num text-right">{x.normWatts ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ov.activities.length && <Empty>Geen activiteiten in de laatste 90 dagen.</Empty>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function FeedbackList({ plans }: { plans: TrainingPlan[] }) {
  const items = plans.flatMap((p) => p.workouts.filter((w) => w.feedback).map((w) => ({ p, w })))
  if (!items.length) return <Empty>Nog geen feedback. Atleten geven RPE en een opmerking per training in hun portaal.</Empty>
  return (
    <Panel title="Feedback van de atleet" pad={false}>
      <table className="data">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Training</th>
            <th className="text-right">RPE</th>
            <th>Gevoel</th>
            <th>Opmerking</th>
          </tr>
        </thead>
        <tbody>
          {items.map(({ w }) => (
            <tr key={w.id}>
              <td className="text-ink-2">{fmtDate(w.date, true)}</td>
              <td>{w.name}</td>
              <td className={`num text-right ${w.feedback!.rpe >= 9 ? 'text-crit' : ''}`}>{w.feedback!.rpe}</td>
              <td>
                <span className={`chip ${w.feedback!.feel === 'kapot' ? 'chip-crit' : w.feedback!.feel === 'zwaar' ? 'chip-warn' : 'chip-good'}`}>{w.feedback!.feel}</span>
              </td>
              <td className="whitespace-normal text-ink-2 max-w-[420px]">{w.feedback!.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
