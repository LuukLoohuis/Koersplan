import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import type { AthleteOverview, FeedbackEntry, TrainingPlan, Workout } from '@shared/types'
import { flatten, workoutMetrics } from '@shared/metrics'
import { addDays, fmtDate, fmtDuration, mondayOf, today, DAY_LONG, weekday } from '@shared/util'
import { api } from '../api'
import { historyFromOverview, plansForForm } from '@shared/formSeries'
import { WorkoutProfile } from '../components/charts'
import { FormChart } from '../components/FormChart'
import { TabBar, Toast, tabPanelProps } from '../components/ui'
import { ThemeContext } from '../lib/theme'

/** Portaal van de atleet: schema, uitleg van de coach en feedback per training. Altijd in het donkere thema. */
export function PortalPage() {
  return (
    <ThemeContext.Provider value="dark">
      <div data-theme="dark" className="min-h-screen bg-bg text-ink">
        <Portal />
      </div>
    </ThemeContext.Provider>
  )
}

function Portal() {
  const { id = '' } = useParams()
  const [ov, setOv] = useState<AthleteOverview | null>(null)
  const [plans, setPlans] = useState<TrainingPlan[]>([])
  const [plan, setPlan] = useState<TrainingPlan | null>(null)
  const [search, setSearch] = useSearchParams()
  const tab = search.get('tab') === 'vorm' ? 'vorm' : 'schema'
  const setTab = (t: 'schema' | 'vorm') => setSearch(t === 'schema' ? {} : { tab: t }, { replace: true })
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [week, setWeek] = useState(0)
  const [thanks, setThanks] = useState(false)

  useEffect(() => {
    Promise.all([api.overview(id), api.plans(id)])
      .then(([o, ps]) => {
        setOv(o)
        setPlans(ps)
        const pub = ps.find((p) => p.status !== 'concept') ?? null
        setPlan(pub)
        const t = pub?.workouts.find((w) => w.date >= today())
        setOpen(t?.id ?? null)
      })
      .catch((e) => setErr((e as Error).message))
  }, [id])

  const weekStart = addDays(mondayOf(today()), week * 7)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const form = useMemo(() => (ov ? { history: historyFromOverview(ov, today()), ...plansForForm(ov, plans) } : null), [ov, plans])

  if (err) return <div className="p-6 text-crit">{err}</div>
  if (!ov) return <div className="p-6 text-muted">Laden…</div>
  const a = ov.athlete
  const ftp = a.ftp
  const nextW = plan?.workouts.find((w) => w.date >= today())

  const sendFeedback = async (w: Workout, fb: Omit<FeedbackEntry, 'at'>) => {
    if (!plan) return
    const p = await api.feedback(plan.id, w.id, fb)
    setPlan(p)
    setThanks(true)
  }

  return (
    <div>
      <div className="max-w-[680px] mx-auto px-4 py-6 grid gap-5">
        <header className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="eyebrow">Jouw trainingsschema</div>
            <h1 className="text-[22px] font-semibold tracking-tight m-0 mt-0.5 truncate">Hoi {a.name.split(' ')[0]}</h1>
          </div>
          <Link to={`/atleet/${a.id}`} className="btn btn-sm ml-auto no-underline">
            Coachweergave
          </Link>
        </header>

        <TabBar
          id="portaal"
          tabs={[
            ['schema', 'Schema'],
            ['vorm', 'Vorm'],
          ]}
          value={tab}
          onChange={setTab}
        />

        {tab === 'vorm' && form && (
          <div {...tabPanelProps('portaal', 'vorm')} className="-mx-4 sm:mx-0">
            <FormChart {...form} goals={ov.goals} annotations={ov.annotations} eftp={ov.eftp} ftp={ftp} weightKg={a.weightKg} />
          </div>
        )}

        {tab === 'schema' && (
          <div {...tabPanelProps('portaal', 'schema')} className="grid gap-5">
          {!plan ? (
            <div className="panel p-6 text-center text-muted">Je coach heeft nog geen schema gepubliceerd.</div>
          ) : (
            <>
              <div className="panel p-4 grid gap-1">
                <div className="eyebrow">{plan.title}</div>
                {nextW ? (
                  <>
                    <div className="text-[13px] text-muted">
                      {nextW.date === today() ? 'Vandaag' : `Volgende: ${DAY_LONG[weekday(nextW.date)]} ${fmtDate(nextW.date)}`}
                    </div>
                    <div className="text-[18px] font-semibold">{nextW.name}</div>
                    <div className="text-[12.5px] text-muted num">
                      {fmtDuration(workoutMetrics(nextW.sections, ftp).durationSec)} · {workoutMetrics(nextW.sections, ftp).tss} TSS
                    </div>
                  </>
                ) : (
                  <div className="text-muted">Dit blok is afgerond.</div>
                )}
                <p className="text-[12px] text-muted m-0 mt-2">Workouts staan in je intervals.icu-kalender en synchroniseren naar je Garmin, Wahoo of Zwift.</p>
              </div>

              {thanks && (
                <Toast tone="good" onClose={() => setThanks(false)}>
                  Bedankt, je coach ziet je feedback.
                </Toast>
              )}

              <div className="flex items-center gap-2">
                <button className="btn btn-sm" onClick={() => setWeek((w) => w - 1)} aria-label="Vorige week">
                  ←
                </button>
                <div className="text-[13px] font-medium">
                  {week === 0 ? 'Deze week' : week === 1 ? 'Volgende week' : week === -1 ? 'Vorige week' : `Week van ${fmtDate(weekStart)}`}
                </div>
                <button className="btn btn-sm" onClick={() => setWeek((w) => w + 1)} aria-label="Volgende week">
                  →
                </button>
                <span className="ml-auto text-[12px] text-muted">
                  {fmtDate(days[0])} – {fmtDate(days[6])}
                </span>
              </div>

              <div className="grid gap-2">
                {days.map((d) => {
                  const w = plan.workouts.find((x) => x.date === d)
                  if (!w)
                    return (
                      <div key={d} className="flex items-center gap-3 px-4 py-2.5 rounded-lg border border-dashed border-line text-[12.5px] text-muted">
                        <span className="w-20">{DAY_LONG[weekday(d)]}</span>
                        <span>Rust</span>
                      </div>
                    )
                  return <PortalWorkout key={d} w={w} ftp={ftp} open={open === w.id} onToggle={() => setOpen(open === w.id ? null : w.id)} onFeedback={(fb) => sendFeedback(w, fb)} />
                })}
              </div>
            </>
          )}
          </div>
        )}
      </div>
    </div>
  )
}

function PortalWorkout({ w, ftp, open, onToggle, onFeedback }: { w: Workout; ftp: number; open: boolean; onToggle: () => void; onFeedback: (fb: Omit<FeedbackEntry, 'at'>) => void }) {
  const m = workoutMetrics(w.sections, ftp)
  const isToday = w.date === today()
  const canFeedback = w.date <= today()
  return (
    <section className={`panel ${isToday ? 'border-ink' : ''}`}>
      <button className="w-full text-left flex items-center gap-3 px-4 py-3 bg-transparent border-0 cursor-pointer text-ink" onClick={onToggle} aria-expanded={open}>
        <span className="w-20 text-[12.5px] text-muted">
          {DAY_LONG[weekday(w.date)]}
          {isToday && <span className="block text-[10.5px] text-accent-text font-medium">vandaag</span>}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block font-medium truncate">{w.name}</span>
          <span className="block text-[12px] text-muted num">
            {w.stimulus} · {fmtDuration(m.durationSec)} · {m.tss} TSS
          </span>
        </span>
        {w.feedback && <span className="chip chip-good">RPE {w.feedback.rpe}</span>}
        <span className="text-muted">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 grid gap-4">
          {w.coachNote && (
            <div className="rounded-lg bg-raised px-3.5 py-3">
              <div className="eyebrow mb-1">Van je coach</div>
              <p className="m-0 text-[13.5px] leading-relaxed">{w.coachNote}</p>
            </div>
          )}
          <WorkoutProfile sections={w.sections} ftp={ftp} height={90} showWbal={false} />
          <StepList w={w} ftp={ftp} />
          {canFeedback && <FeedbackForm initial={w.feedback} onSubmit={onFeedback} />}
        </div>
      )}
    </section>
  )
}

function StepList({ w, ftp }: { w: Workout; ftp: number }) {
  return (
    <ol className="m-0 p-0 list-none grid gap-2">
      {w.sections.map((s) => (
        <li key={s.id} className="text-[13px]">
          <div className="font-medium">
            {s.name}
            {s.repeat > 1 && <span className="text-muted font-normal"> · {s.repeat}×</span>}
          </div>
          {s.steps.map((x) => (
            <div key={x.id} className="flex gap-3 text-muted num text-[12.5px] pl-3">
              <span className="w-14">{fmtDuration(x.durationSec)}</span>
              <span>
                {x.kind === 'freeride'
                  ? 'vrij rijden'
                  : x.kind === 'ramp'
                    ? `${Math.round(x.lo * ftp)} → ${Math.round(x.hi * ftp)} W`
                    : x.lo === x.hi
                      ? `${Math.round(x.lo * ftp)} W`
                      : `${Math.round(x.lo * ftp)}–${Math.round(x.hi * ftp)} W`}
              </span>
              {x.cadence && <span className="text-muted">{x.cadence} rpm</span>}
            </div>
          ))}
        </li>
      ))}
      <li className="text-[11.5px] text-muted">{flatten(w.sections).length} stappen · op basis van FTP {ftp} W</li>
    </ol>
  )
}

const FEELS: FeedbackEntry['feel'][] = ['sterk', 'goed', 'normaal', 'zwaar', 'kapot']

function FeedbackForm({ initial, onSubmit }: { initial?: FeedbackEntry; onSubmit: (fb: Omit<FeedbackEntry, 'at'>) => void }) {
  const [rpe, setRpe] = useState(initial?.rpe ?? 6)
  const [feel, setFeel] = useState<FeedbackEntry['feel']>(initial?.feel ?? 'normaal')
  const [comment, setComment] = useState(initial?.comment ?? '')
  return (
    <form
      className="grid gap-3 border-t border-line pt-4"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ rpe, feel, comment })
      }}
    >
      <div className="eyebrow">Hoe ging het?</div>
      <label className="grid gap-1.5">
        <span className="flex text-[12.5px] text-muted">
          Zwaarte (RPE) <b className="num ml-auto text-ink">{rpe}/10</b>
        </span>
        <input id="fb-rpe" type="range" min={1} max={10} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
      </label>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Gevoel">
        {FEELS.map((f) => (
          <button type="button" key={f} className={`btn btn-sm ${feel === f ? 'btn-primary' : ''}`} aria-pressed={feel === f} onClick={() => setFeel(f)}>
            {f}
          </button>
        ))}
      </div>
      <textarea id="fb-comment" className="field" rows={2} placeholder="Opmerking voor je coach (optioneel)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn btn-primary justify-self-start">{initial ? 'Feedback bijwerken' : 'Stuur feedback'}</button>
    </form>
  )
}
