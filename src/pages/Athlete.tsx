import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { AthleteOverview, TrainingPlan } from '@shared/types'
import { historyFromOverview, plansForForm } from '@shared/formSeries'
import { allFeedback } from '@shared/review'
import { fmtDate, fmtDuration, round, today } from '@shared/util'
import { api } from '../api'
import { PdChart } from '../components/charts'
import { FormChart } from '../components/FormChart'
import { Empty, FlagChips, KpiStrip, Panel, TabBar, tabPanelProps } from '../components/ui'
import { PlanTab, useRefetchAfterInflight } from './PlanTab'

type Tab = 'analyse' | 'plan' | 'feedback'

export function AthletePage() {
  const { id = '' } = useParams()
  const [ov, setOv] = useState<AthleteOverview | null>(null)
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [err, setErr] = useState<string | null>(null)
  // tab in de URL, zodat "Koers wacht" in Mijn atleten direct naar Koers reviewen gaat (?tab=plan)
  const [search, setSearch] = useSearchParams()
  const tab: Tab = search.get('tab') === 'plan' ? 'plan' : search.get('tab') === 'feedback' ? 'feedback' : 'analyse'
  const setTab = (t: Tab) => setSearch(t === 'analyse' ? {} : { tab: t }, { replace: true })
  const [loading, setLoading] = useState(false)
  // alleen het laatst gevraagde lijstje koersen telt: een trage eerdere lading overschrijft geen nieuwere
  const plansReq = useRef(0)

  const load = useCallback(
    async (fresh = false) => {
      setLoading(true)
      setErr(null)
      const n = ++plansReq.current
      try {
        const [o, p] = await Promise.all([api.overview(id, fresh), api.plans(id)])
        setOv(o)
        if (n === plansReq.current) setPlans(p)
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
    load()
  }, [load])
  useRefetchAfterInflight(id, () => {
    const n = ++plansReq.current
    api.plans(id).then(
      (p) => n === plansReq.current && setPlans(p),
      () => {},
    )
  })

  if (err)
    return (
      <div className="panel p-6">
        <h2 className="mt-0">Kan atleet niet laden</h2>
        <p className="text-muted">{err}</p>
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
          <Link className="btn no-underline" to={`/app/portaal/${a.id}`}>
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
          <FlagChips flags={a.flags} rampRate={a.rampRate} />
        </div>
      )}

      <TabBar
        id="atleet"
        tabs={[
          ['analyse', 'Analyse'],
          ['plan', `Plannen${plans.length ? ` (${plans.length})` : ''}`],
          ['feedback', 'Feedback'],
        ]}
        value={tab}
        onChange={setTab}
      />

      <div {...tabPanelProps('atleet', tab)}>
        {tab === 'analyse' && <Analyse ov={ov} plans={plans} />}
        {tab === 'plan' && <PlanTab ov={ov} plans={plans} setPlans={setPlans} />}
        {tab === 'feedback' && <FeedbackList plans={plans} />}
      </div>
    </div>
  )
}

function Analyse({ ov, plans }: { ov: AthleteOverview; plans: TrainingPlan[] }) {
  const last7 = ov.wellness.slice(-7)
  const prev28 = ov.wellness.slice(-35, -7)
  const avg = (xs: (number | undefined)[]) => {
    const v = xs.filter((x): x is number => x != null)
    return v.length ? round(v.reduce((a, b) => a + b, 0) / v.length, 1) : null
  }
  const form = useMemo(() => ({ history: historyFromOverview(ov, today()), ...plansForForm(ov, plans) }), [ov, plans])
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
      <FormChart {...form} goals={ov.goals} annotations={ov.annotations} eftp={ov.eftp} ftp={ov.athlete.ftp} weightKg={ov.athlete.weightKg} />
      <div className="grid gap-5 md:grid-cols-2">
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
                  <span className="text-muted text-[13px]">{w.label}</span>
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
                    <td className="text-muted">{fmtDate(x.date, true)}</td>
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
  // uit het logboek: ook feedback op ritten die de coach na bevestigen verplaatste of weghaalde
  const items = allFeedback(plans)
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
          {items.map((r) => (
            <tr key={`${r.workoutId}|${r.date}`}>
              <td className="text-muted">{fmtDate(r.date, true)}</td>
              <td>{r.name}</td>
              <td className={`num text-right ${r.feedback.rpe >= 9 ? 'text-crit' : ''}`}>{r.feedback.rpe}</td>
              <td>
                <span className={`chip ${r.feedback.feel === 'kapot' ? 'chip-crit' : r.feedback.feel === 'zwaar' ? 'chip-warn' : 'chip-good'}`}>{r.feedback.feel}</span>
              </td>
              <td className="whitespace-normal text-muted max-w-[420px]">{r.feedback.comment}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}
