import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { scaleLinear } from '@visx/scale'
import { Area, BarRounded, LinePath } from '@visx/shape'
import { curveCatmullRom } from '@visx/curve'
import { localPoint } from '@visx/event'
import type { Annotation, EftpPoint, Goal } from '@shared/types'
import { buildFormSeries, weeklyLoad, weeklyRamp, type FormDay, type HistoryDay, type PlannedDay, type Projected } from '@shared/formSeries'
import { clamp, daysBetween, fmtDate } from '@shared/util'
import { formState } from '../lib/theme'
import { Delta, Sparkline, Stat } from './ui'
import './FormChart.css'

// Vormgrafiek (design-system/components/FormChart, variant A): KPI-strip, toolbar,
// hoofdpaneel met conditie/vermoeidheid, vormband met zones, belasting, projecties
// van AI en coach, doelen, annotaties, crosshair en secundaire panelen.

export interface FormChartProps {
  history: HistoryDay[]
  planAi?: PlannedDay[]
  planCoach?: PlannedDay[]
  goals?: Goal[]
  annotations?: Annotation[]
  ftp: number
  weightKg?: number
  eftp?: EftpPoint[]
  /** Naam van de coach in legenda en tooltip ("Na Ruud"); standaard "coach" */
  coachName?: string
  /** Kleine versie zonder KPI's, zijkolom en secundaire panelen */
  compact?: boolean
  /** Zichtbaar bereik in dagen (historie + planning) */
  defaultRange?: number
}

type Pt = [number, number]
type Tip = { kind: 'day'; i: number; keyboard?: boolean } | { kind: 'goal'; k: number } | { kind: 'note'; k: number }
type Vals = { ctl: number; atl: number; tsb: number; tss: number; workoutName?: string }

const CURVE = curveCatmullRom.alpha(0)
const RANGES: [number, string][] = [
  [42, '6 wk'],
  [91, '3 mnd'],
  [182, '6 mnd'],
  [365, '1 jaar'],
  [Infinity, 'seizoen'],
]
/** Minstens zoveel dagen historie in beeld */
const MIN_PAST = 21
/** Doelen tot zo ver vooruit verlengen de tijdas */
const GOAL_AHEAD = 35
const TONE_COLOR = { '': 'var(--text-muted)', good: 'var(--delta-pos)', accent: 'var(--accent)', crit: 'var(--delta-neg)' } as const
const zoneOf = (tsb: number) => {
  const s = formState(tsb)
  return { label: s.label, color: TONE_COLOR[s.tone] }
}
/** Zones van de vormband: bovengrens, ondergrens, dekking */
const BANDS: [number, number, number][] = [
  [Infinity, 20, 0.05],
  [20, 5, 0.09],
  [5, -10, 0.04],
  [-10, -30, 0.09],
  [-30, -Infinity, 0.11],
]

const f0 = (v: number) => (Math.round(v) < 0 ? '−' : '') + Math.abs(Math.round(v))
const f1 = (v: number) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1).replace('.', ',')
const fs = (v: number) => {
  const r = Math.round(v)
  return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r)
}

/** Breedte van een element (callback-ref, zodat het ook werkt als het element later verschijnt). */
function useWidth<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!el) return
    setW(Math.round(el.clientWidth))
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return [setEl, w] as const
}

const CHIP =
  'shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full border border-line bg-surface text-muted text-[11.5px] font-medium cursor-pointer whitespace-nowrap aria-pressed:text-ink aria-pressed:border-muted'

function Swatch({ color, dashed, on }: { color: string; dashed?: boolean; on: boolean }) {
  return <span aria-hidden className="w-3.5 border-t-2" style={{ borderColor: color, borderTopStyle: dashed ? 'dashed' : 'solid', opacity: on ? 1 : 0.35 }} />
}

export function FormChart({
  history,
  planAi = [],
  planCoach = [],
  goals = [],
  annotations = [],
  ftp,
  weightKg,
  eftp = [],
  coachName = 'coach',
  compact = false,
  defaultRange = 42,
}: FormChartProps) {
  const uid = useId().replace(/:/g, '')
  const [rootRef, rootW] = useWidth<HTMLDivElement>()
  const [panelRef, W] = useWidth<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  const mobile = rootW > 0 && rootW < 640

  const [range, setRange] = useState(defaultRange)
  const [show, setShow] = useState({ ctl: true, atl: true, tsb: true })
  const [showProj, setShowProj] = useState({ ai: true, coach: true })
  const [tip, setTip] = useState<Tip | null>(null)
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 1900)
    return () => clearTimeout(t)
  }, [])

  const series = useMemo(() => {
    const last = history.reduce((m, h) => (h.date > m ? h.date : m), '')
    const ahead = goals.map((g) => daysBetween(last, g.date)).filter((d) => d > 0 && d <= GOAL_AHEAD)
    return buildFormSeries(history, planAi, planCoach, ahead.length ? Math.max(...ahead) + 2 : 0)
  }, [history, planAi, planCoach, goals])
  const notes = useMemo(() => [...annotations].sort((a, b) => a.date.localeCompare(b.date)), [annotations])

  // pinch: twee vingers veranderen het bereik
  const pointers = useRef(new Map<number, number>())
  const pinch = useRef<{ d0: number; r0: number } | null>(null)

  const { days, past: H, horizon: P, hasAi, hasCoach } = series
  if (days.length < 2) return <div className="text-muted text-sm py-10 text-center">Nog geen conditiedata.</div>

  const day = (i: number): FormDay | undefined => days[H + i]
  const T = day(0)!
  const T7 = day(-7) ?? days[0]
  const aiOn = hasAi && showProj.ai
  const coachOn = hasCoach && showProj.coach
  const sel: 'ai' | 'coach' = coachOn ? 'coach' : aiOn ? 'ai' : hasCoach ? 'coach' : 'ai'
  const selLabel = sel === 'ai' ? 'AI-koers' : `na ${coachName}`
  const vals = (d: FormDay): Vals | undefined => {
    if (!d.planned) return { ctl: d.ctl!, atl: d.atl!, tsb: d.tsb!, tss: d.tss ?? 0, workoutName: d.workoutName }
    return d[sel]
  }

  // ── maatvoering ──────────────────────────────────────────
  const lay = compact
    ? { L: 34, R: 12, main: 150, form: 80, bars: 36 }
    : mobile
      ? { L: 10, R: 10, main: 170, form: 100, bars: 44 }
      : { L: 44, R: 60, main: 220, form: 110, bars: 56 }
  const TOP = 8
  const GAP = 10
  const HH = TOP + lay.main + GAP + lay.form + GAP + lay.bars + 22
  const mainTop = TOP
  const formTop = mainTop + lay.main + GAP
  const barTop = formTop + lay.form + GAP
  const x0 = lay.L
  const x1 = Math.max(x0 + 10, W - lay.R)

  const from = Math.max(-H, Math.min(-MIN_PAST, -(range - P)))
  const vis = days.slice(H + from)
  const hist = vis.filter((d) => !d.planned)
  const fut = vis.filter((d) => d.planned)

  const projVals = (d: FormDay) => [aiOn ? d.ai : undefined, coachOn ? d.coach : undefined].filter((v): v is Projected => !!v)
  const maxV = Math.max(10, ...vis.flatMap((d) => [d.ctl ?? 0, d.atl ?? 0, ...projVals(d).flatMap((p) => [p.ctl, p.atl])])) * 1.08
  const tsbs = vis.flatMap((d) => [...(d.tsb != null ? [d.tsb] : []), ...projVals(d).map((p) => p.tsb)])
  const tsbMin = Math.min(-40, Math.floor((Math.min(...tsbs) - 5) / 10) * 10)
  const tsbMax = Math.max(30, Math.ceil((Math.max(...tsbs) + 5) / 10) * 10)
  const maxT = Math.max(1, ...vis.map((d) => vals(d)?.tss ?? 0))

  const x = scaleLinear<number>({ domain: [from, P], range: [x0, x1] })
  const yM = scaleLinear<number>({ domain: [0, maxV], range: [mainTop + lay.main, mainTop] })
  const yF = scaleLinear<number>({ domain: [tsbMin, tsbMax], range: [formTop + lay.form, formTop] })

  const pts = (arr: FormDay[], get: (d: FormDay) => number | undefined, y: (v: number) => number): Pt[] =>
    arr.flatMap((d) => {
      const v = get(d)
      return v == null ? [] : [[x(d.i), y(v)] as Pt]
    })
  const bridge = (who: 'ai' | 'coach', f: 'ctl' | 'atl' | 'tsb', y: (v: number) => number): Pt[] => [[x(0), y(T[f]!)], ...pts(fut, (d) => d[who]?.[f], y)]
  const ctlPts = pts(hist, (d) => d.ctl, yM)
  const atlPts = pts(hist, (d) => d.atl, yM)
  const tsbPts = pts(hist, (d) => d.tsb, yF)
  const projOn: ('ai' | 'coach')[] = [...(aiOn ? (['ai'] as const) : []), ...(coachOn ? (['coach'] as const) : [])]
  const projColor = (w: 'ai' | 'coach') => (w === 'ai' ? 'var(--chart-projection-ai)' : 'var(--chart-projection-coach)')
  const drawCls = intro ? 'fc-draw' : undefined
  const drawLen = intro ? 1 : undefined
  const zNow = zoneOf(T.tsb!)
  const bandTop = (t: number) => yF(Math.min(t, tsbMax))
  const bandBot = (b: number) => yF(Math.max(b, tsbMin))
  const bw = Math.max(2, Math.min(10, (x1 - x0) / vis.length - 2))
  // datumlabels minstens ~56px uit elkaar, in hele weken
  const step = [7, 14, 28, 56, 91].find((n) => (n * (x1 - x0)) / vis.length >= 56) ?? 182
  const noteY = (n: Annotation) => {
    const d = day(daysBetween(T.date, n.date))
    const c = d?.planned ? (d.coach?.ctl ?? d.ai?.ctl ?? T.ctl!) : (d?.ctl ?? T.ctl!)
    return yM(c) - 16
  }
  const inView = (date: string) => {
    const i = daysBetween(T.date, date)
    return i >= from && i <= P ? i : null
  }

  // ── interactie ───────────────────────────────────────────
  const dayAtPointer = (e: PointerEvent<SVGSVGElement>) => {
    const p = svgRef.current && localPoint(svgRef.current, e)
    return p ? clamp(Math.round(x.invert(p.x)), from, P) : null
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, e.clientX)
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.abs(a - b)
      if (d > 0) setRange(clamp(Math.round((pinch.current.r0 * pinch.current.d0) / d), MIN_PAST, H + P))
      return
    }
    const hit = (e.target as Element).closest?.('[data-tip]')?.getAttribute('data-tip')
    if (hit) {
      const [kind, k] = hit.split(':')
      return setTip({ kind: kind as 'goal' | 'note', k: Number(k) })
    }
    const i = dayAtPointer(e)
    if (i != null) setTip((t) => (t?.kind === 'day' && t.i === i && !t.keyboard ? t : { kind: 'day', i }))
  }
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.set(e.pointerId, e.clientX)
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = { d0: Math.abs(a - b), r0: Math.min(range, H + P) }
    }
    onMove(e)
  }
  const onUp = (e: PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const cur = tip?.kind === 'day' ? tip.i : 0
    const next = e.key === 'ArrowLeft' ? cur - 1 : e.key === 'ArrowRight' ? cur + 1 : e.key === 'Home' ? from : e.key === 'End' ? P : null
    if (e.key === 'Escape') return setTip(null)
    if (next == null) return
    e.preventDefault()
    setTip({ kind: 'day', i: clamp(next, from, P), keyboard: true })
  }

  const tipDay = tip?.kind === 'day' ? day(tip.i) : undefined
  const tipX = tip?.kind === 'day' ? x(tip.i) : tip?.kind === 'goal' ? x(daysBetween(T.date, goals[tip.k].date)) : tip?.kind === 'note' ? x(daysBetween(T.date, notes[tip.k].date)) : 0
  const dayText = (d: FormDay) => {
    const v = vals(d)
    if (!v) return `${fmtDate(d.date, true)}: nog geen planning`
    return `${fmtDate(d.date, true)}${d.planned ? `, ${selLabel}` : ''}: conditie ${f1(v.ctl)}, vermoeidheid ${f1(v.atl)}, vorm ${fs(v.tsb)} ${zoneOf(v.tsb).label}${v.tss ? `, ${v.workoutName ?? 'training'} ${v.tss} TSS` : ''}`
  }

  // ── KPI's ────────────────────────────────────────────────
  const last28 = days.slice(Math.max(0, H - 27), H + 1)
  const ramp = T.ctl! - T7.ctl!
  const eftpNow = [...eftp].filter((e) => e.date <= T.date).at(-1)
  const kpis: ReactNode[] = [
    <Stat
      key="ctl"
      label="Conditie"
      value={f0(T.ctl!)}
      aside={<Delta value={T.ctl! - T7.ctl!} />}
      spark={<Sparkline values={last28.map((d) => d.ctl!)} color="var(--chart-ctl)" />}
    />,
    <Stat
      key="atl"
      label="Vermoeidheid"
      value={f0(T.atl!)}
      aside={<Delta value={T.atl! - T7.atl!} />}
      spark={<Sparkline values={last28.map((d) => d.atl!)} color="var(--chart-atl)" />}
    />,
    <Stat
      key="tsb"
      label="Vorm"
      value={fs(T.tsb!)}
      aside={<ZoneChip tsb={T.tsb!} />}
      spark={<Sparkline values={last28.map((d) => d.tsb!)} color="var(--text-muted)" />}
    />,
    <Stat
      key="ramp"
      label="Helling"
      value={(ramp > 0 ? '+' : ramp < 0 ? '−' : '') + Math.abs(ramp).toFixed(1).replace('.', ',')}
      unit="/wk"
      sub={
        <span className="num">
          veilig 3–7{ramp > 8 && <span className="text-warn"> · ⚠ fors</span>}
        </span>
      }
    />,
    <Stat
      key="eftp"
      label={eftpNow ? 'eFTP' : 'FTP'}
      value={eftpNow?.w ?? ftp}
      unit="W"
      sub={
        <span className="num">
          {weightKg ? `${((eftpNow?.w ?? ftp) / weightKg).toFixed(2).replace('.', ',')} W/kg` : ''}
          {eftpNow && ` · FTP ${ftp}`}
        </span>
      }
    />,
  ]

  const sideBelow = mobile || rootW < 880
  const hasSide = !compact && notes.length > 0

  return (
    <div ref={rootRef} className="@container text-[13px]">
      {!compact &&
        (mobile ? (
          <div className="fc-scroll flex gap-2 overflow-x-auto px-4 mb-3">
            {kpis.map((k, n) => (
              <div key={n} className="panel shrink-0 min-w-[118px] px-3 py-2.5">
                {k}
              </div>
            ))}
          </div>
        ) : (
          <div className="panel grid grid-cols-3 @2xl:grid-cols-5 gap-x-6 gap-y-4 px-4 py-3.5 mb-3">{kpis}</div>
        ))}

      <div className={`fc-scroll flex items-center gap-1.5 pb-2.5 ${mobile ? 'px-4 overflow-x-auto' : 'flex-wrap'}`}>
        <div role="group" aria-label="Bereik" className="flex shrink-0 gap-1.5">
          {(compact ? RANGES.slice(0, 2) : RANGES).map(([r, label]) => (
            <button key={label} type="button" className={CHIP} aria-pressed={range === r} onClick={() => setRange(r)}>
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <div role="group" aria-label="Lijnen" className="flex shrink-0 gap-1.5">
          {!compact &&
            (
              [
                ['ctl', 'Conditie', 'var(--chart-ctl)'],
                ['atl', 'Vermoeidheid', 'var(--chart-atl)'],
                ['tsb', 'Vorm', 'var(--text)'],
              ] as const
            ).map(([k, label, color]) => (
              <button key={k} type="button" className={CHIP} aria-pressed={show[k]} onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}>
                <Swatch color={color} on={show[k]} />
                {label}
              </button>
            ))}
          {hasAi && (
            <button type="button" className={CHIP} aria-pressed={showProj.ai} onClick={() => setShowProj((s) => ({ ...s, ai: !s.ai }))}>
              <Swatch color="var(--ai)" dashed on={showProj.ai} />
              AI-koers
            </button>
          )}
          {hasCoach && (
            <button type="button" className={CHIP} aria-pressed={showProj.coach} onClick={() => setShowProj((s) => ({ ...s, coach: !s.coach }))}>
              <Swatch color="var(--coach)" dashed on={showProj.coach} />
              Na {coachName}
            </button>
          )}
        </div>
      </div>

      <div className={hasSide && !sideBelow ? 'grid grid-cols-[1fr_240px] gap-3' : 'grid gap-3'}>
        <div
          ref={panelRef}
          data-theme="dark"
          className={`relative overflow-hidden bg-surface text-ink border border-line ${mobile ? 'border-x-0' : 'rounded-[var(--radius-card)]'}`}
        >
          {W > 0 && (
            <svg
              ref={svgRef}
              className="fc-svg"
              viewBox={`0 0 ${W} ${HH}`}
              height={HH}
              role="img"
              aria-label={`Vormgrafiek. Vandaag conditie ${f0(T.ctl!)}, vermoeidheid ${f0(T.atl!)}, vorm ${fs(T.tsb!)} (${zNow.label}). Gebruik de pijltjestoetsen om per dag te lezen.`}
              tabIndex={0}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setTip(null)}
              onKeyDown={onKey}
              onBlur={() => setTip(null)}
            >
              <defs>
                <linearGradient id={`${uid}-gl`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-ctl)" stopOpacity={0.42} />
                  <stop offset="0.55" stopColor="var(--chart-ctl)" stopOpacity={0.1} />
                  <stop offset="1" stopColor="var(--chart-ctl)" stopOpacity={0.02} />
                </linearGradient>
                <filter id={`${uid}-gw`} x="-10%" y="-50%" width="120%" height="200%">
                  <feGaussianBlur stdDeviation="3" />
                </filter>
                <clipPath id={`${uid}-cp`}>
                  <rect x={x0} y={0} width={x1 - x0} height={HH} />
                </clipPath>
                {BANDS.map(([t, b], k) => (
                  <clipPath key={k} id={`${uid}-z${k}`}>
                    <rect x={x0} y={bandTop(t)} width={x1 - x0} height={bandBot(b) - bandTop(t)} />
                  </clipPath>
                ))}
              </defs>

              {/* raster */}
              {[1 / 3, 2 / 3, 1].map((f) => (
                <line key={f} x1={x0} x2={x1} y1={yM(maxV * f)} y2={yM(maxV * f)} stroke="var(--line)" opacity={0.7} />
              ))}

              {/* vormband met zones, label in de band */}
              {BANDS.map(([t, b, op], k) => {
                const yt = bandTop(t)
                const yb = bandBot(b)
                const z = zoneOf((Math.min(t, 30) + Math.max(b, -40)) / 2)
                const lw = z.label.length * 6.4 + 12
                return (
                  <g key={k}>
                    <rect x={x0} y={yt} width={x1 - x0} height={yb - yt} fill={z.color} opacity={op} />
                    <line x1={x0} x2={x1} y1={yt} y2={yt} stroke="var(--line)" opacity={0.7} />
                    {yb - yt >= 14 && (
                      <>
                        <rect x={x1 - lw - 4} y={(yt + yb) / 2 - 8} width={lw} height={16} rx={8} fill="var(--surface)" opacity={0.85} />
                        <text x={x1 - 10} y={(yt + yb) / 2 + 3.5} textAnchor="end" className="font-mono text-[10.5px]" fill="var(--text-muted)">
                          {z.label}
                        </text>
                      </>
                    )}
                  </g>
                )
              })}

              <g clipPath={`url(#${uid}-cp)`}>
                {show.ctl && (
                  <>
                    <Area<Pt> data={ctlPts} x={(p) => p[0]} y0={mainTop + lay.main} y1={(p) => p[1]} curve={CURVE} fill={`url(#${uid}-gl)`} />
                    <LinePath<Pt> data={ctlPts} x={(p) => p[0]} y={(p) => p[1]} curve={CURVE} fill="none" stroke="var(--chart-ctl)" strokeWidth={6} opacity={0.45} filter={`url(#${uid}-gw)`} />
                    <LinePath<Pt>
                      data={ctlPts}
                      x={(p) => p[0]}
                      y={(p) => p[1]}
                      curve={CURVE}
                      fill="none"
                      stroke="var(--chart-ctl)"
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className={drawCls}
                      pathLength={drawLen}
                    />
                    {projOn.map((w) => (
                      <LinePath<Pt> key={w} data={bridge(w, 'ctl', yM)} x={(p) => p[0]} y={(p) => p[1]} curve={CURVE} fill="none" stroke={projColor(w)} strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" />
                    ))}
                  </>
                )}
                {show.atl && (
                  <>
                    <LinePath<Pt>
                      data={atlPts}
                      x={(p) => p[0]}
                      y={(p) => p[1]}
                      curve={CURVE}
                      fill="none"
                      stroke="var(--chart-atl)"
                      strokeWidth={1.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={0.9}
                      className={drawCls}
                      pathLength={drawLen}
                    />
                    {projOn.map((w) => (
                      <LinePath<Pt> key={w} data={bridge(w, 'atl', yM)} x={(p) => p[0]} y={(p) => p[1]} curve={CURVE} fill="none" stroke={projColor(w)} strokeWidth={1} strokeDasharray="2 5" opacity={0.8} />
                    ))}
                  </>
                )}
                {show.tsb && (
                  <>
                    {BANDS.map(([t, b], k) => (
                      <LinePath<Pt>
                        key={k}
                        data={tsbPts}
                        x={(p) => p[0]}
                        y={(p) => p[1]}
                        curve={CURVE}
                        fill="none"
                        stroke={zoneOf((Math.min(t, 30) + Math.max(b, -40)) / 2).color}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        clipPath={`url(#${uid}-z${k})`}
                        className={drawCls}
                        pathLength={drawLen}
                      />
                    ))}
                    {projOn.map((w) => (
                      <LinePath<Pt> key={w} data={bridge(w, 'tsb', yF)} x={(p) => p[0]} y={(p) => p[1]} curve={CURVE} fill="none" stroke={projColor(w)} strokeWidth={1.5} strokeDasharray="2 5" />
                    ))}
                    <circle cx={x(0)} cy={yF(T.tsb!)} r={9} fill={zNow.color} opacity={0.25} className={intro ? 'fc-fade' : 'fc-pulse'} />
                    <circle
                      cx={x(0)}
                      cy={yF(T.tsb!)}
                      r={4.5}
                      fill={zNow.color}
                      stroke="var(--surface)"
                      strokeWidth={2}
                      className={intro ? 'fc-fade' : undefined}
                      style={{ filter: `drop-shadow(0 0 4px ${zNow.color})` }}
                    />
                  </>
                )}
              </g>

              {/* belasting per dag; gepland gestippeld in de kleur van de gekozen koers */}
              <line x1={x0} x2={x1} y1={barTop + lay.bars + 0.5} y2={barTop + lay.bars + 0.5} stroke="var(--line)" />
              {vis.map((d) => {
                const v = vals(d)
                if (!v?.tss || (d.planned && !aiOn && !coachOn)) return null
                const h = Math.max(2, (v.tss / maxT) * (lay.bars - 4))
                const col = d.planned ? (sel === 'ai' ? 'var(--ai)' : 'var(--coach)') : d.zone ? `var(--zone-${d.zone})` : 'var(--text-muted)'
                return (
                  <BarRounded
                    key={d.date}
                    x={x(d.i) - bw / 2}
                    y={barTop + lay.bars - h}
                    width={bw}
                    height={h}
                    radius={Math.min(3, bw / 2)}
                    top
                    fill={col}
                    fillOpacity={d.planned ? 0.22 : 0.9}
                    stroke={d.planned ? col : 'none'}
                    strokeDasharray={d.planned ? '2 2' : undefined}
                  />
                )
              })}

              {/* vandaag */}
              <line x1={x(0)} x2={x(0)} y1={TOP} y2={barTop + lay.bars} stroke="var(--text-muted)" opacity={0.6} />
              <rect x={x(0) - 26} y={TOP - 2} width={52} height={16} rx={8} fill="var(--surface-raised)" />
              <text x={x(0)} y={TOP + 9.5} textAnchor="middle" className="font-mono text-[10.5px]" fill="var(--text-muted)">
                vandaag
              </text>

              {/* assen */}
              <g className="font-mono text-[11px]" fill="var(--text-muted)">
                {vis
                  .filter((d) => (d.i - from) % step === 0 && x(d.i) > 18 && x(d.i) < W - 18)
                  .map((d) => (
                    <text key={d.date} x={x(d.i)} y={HH - 6} textAnchor="middle">
                      {fmtDate(d.date)}
                    </text>
                  ))}
                {!mobile && (
                  <>
                    {[1 / 3, 2 / 3, 1].map((f) => (
                      <text key={f} x={x0 - 6} y={yM(maxV * f) + 4} textAnchor="end">
                        {Math.round(maxV * f)}
                      </text>
                    ))}
                    {[20, 5, -10, -30].map((v) => (
                      <text key={v} x={x0 - 6} y={yF(v) + 4} textAnchor="end">
                        {fs(v)}
                      </text>
                    ))}
                  </>
                )}
              </g>

              {/* doelen als vlaggetjes */}
              {goals.map((g, k) => {
                const i = inView(g.date)
                if (i == null) return null
                const gx = x(i)
                const a = g.label === 'A'
                return (
                  <g key={k} data-tip={`goal:${k}`} className="cursor-pointer">
                    <title>{`${g.label}-koers: ${g.name}, ${fmtDate(g.date, true)}`}</title>
                    <line x1={gx} x2={gx} y1={TOP} y2={barTop + lay.bars} stroke="var(--text-muted)" opacity={0.5} />
                    <path d={`M${gx} ${TOP} h14 l-4 5 l4 5 h-14 z`} fill={a ? 'var(--accent)' : 'var(--surface-raised)'} stroke="var(--text-muted)" strokeWidth={a ? 0 : 1} />
                    <text x={gx + 4} y={TOP + 8.5} className="font-mono text-[9px] font-semibold" fill={a ? 'var(--on-accent)' : 'var(--text)'}>
                      {g.label}
                    </text>
                  </g>
                )
              })}

              {/* genummerde annotaties */}
              {!compact &&
                notes.map((n, k) => {
                  const i = inView(n.date)
                  if (i == null) return null
                  const ay = noteY(n)
                  return (
                    <g key={k} data-tip={`note:${k}`} className="cursor-pointer">
                      <title>{`${k + 1}. ${n.text}`}</title>
                      <circle cx={x(i)} cy={ay} r={8} fill={n.kind === 'ai' ? 'var(--ai)' : 'var(--coach)'} />
                      <text x={x(i)} y={ay + 3.5} textAnchor="middle" className="font-mono text-[10px] font-semibold" fill="var(--on-accent)">
                        {k + 1}
                      </text>
                    </g>
                  )
                })}

              {tip?.kind === 'day' && <line x1={tipX} x2={tipX} y1={TOP} y2={barTop + lay.bars} stroke="var(--text)" opacity={0.5} pointerEvents="none" />}
            </svg>
          )}

          {tip && W > 0 && (
            <div
              aria-hidden
              className="tt absolute pointer-events-none z-[2] min-w-[170px]"
              style={tipX > W / 2 ? { right: W - tipX + 12, top: 24 } : { left: tipX + 12, top: 24 }}
            >
              {tip.kind === 'day' && tipDay && <DayTip d={tipDay} v={vals(tipDay)} planLabel={selLabel} />}
              {tip.kind === 'goal' && <GoalTip g={goals[tip.k]} v={vals(day(daysBetween(T.date, goals[tip.k].date)) ?? T)} />}
              {tip.kind === 'note' && <NoteTip n={notes[tip.k]} k={tip.k} />}
            </div>
          )}
          <div className="sr-only" aria-live="polite">
            {tip?.kind === 'day' && tip.keyboard && tipDay ? dayText(tipDay) : ''}
          </div>
        </div>

        {hasSide && (
          <aside aria-label="Toelichting" className={`grid gap-2 content-start ${mobile ? 'px-4' : ''}`}>
            {notes.map((n, k) => (
              <Note key={k} n={n} k={k} />
            ))}
          </aside>
        )}
      </div>

      {!compact && <Secondary series={series} eftp={eftp} width={mobile ? rootW : rootW - 16} mobile={mobile} L={lay.L} R={lay.R} />}
    </div>
  )
}

function ZoneChip({ tsb }: { tsb: number }) {
  const s = formState(tsb)
  return <span className={`chip ${s.tone ? `chip-${s.tone}` : ''} !h-[18px] !text-[10.5px] !px-[7px]`}>{s.label}</span>
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 num text-[12px]">
      <span>
        <i className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: color }} />
        {label}
      </span>
      <b className="font-medium">{value}</b>
    </div>
  )
}

function DayTip({ d, v, planLabel }: { d: FormDay; v?: Vals; planLabel: string }) {
  return (
    <>
      <div className="num text-[11px] text-muted mb-1">
        {fmtDate(d.date, true)}
        {d.planned && ` · ${planLabel}`}
      </div>
      {v ? (
        <>
          <TipRow color="var(--chart-ctl)" label="Conditie" value={f1(v.ctl)} />
          <TipRow color="var(--chart-atl)" label="Vermoeidheid" value={f1(v.atl)} />
          <TipRow color={zoneOf(v.tsb).color} label="Vorm" value={`${fs(v.tsb)} · ${zoneOf(v.tsb).label}`} />
          <div className="mt-1.5 pt-1.5 border-t border-line">
            {v.tss ? `${v.workoutName ?? 'Training'} · TSS ${v.tss}` : d.planned ? 'Rustdag' : 'Geen training'}
            {d.planned && v.tss ? <span className="text-muted"> (gepland)</span> : null}
          </div>
        </>
      ) : (
        <div className="text-muted">Nog geen planning</div>
      )}
    </>
  )
}

function GoalTip({ g, v }: { g: Goal; v?: Vals }) {
  return (
    <>
      <div className="num text-[11px] text-muted mb-1">
        {g.label}-koers · {fmtDate(g.date, true)}
      </div>
      <div>{g.name}</div>
      <div className="num text-[12px] mt-1 text-muted">{v ? `verwachte vorm ${fs(v.tsb)} · ${zoneOf(v.tsb).label}` : 'nog geen planning tot deze koers'}</div>
    </>
  )
}

function NoteTip({ n, k }: { n: Annotation; k: number }) {
  return (
    <>
      <div className="num text-[11px] text-muted mb-1">
        {k + 1} · {fmtDate(n.date, true)}
      </div>
      <div className={n.kind === 'coach' ? 'coach-note text-coach-text' : 'num text-[12px] text-ai-text'}>{n.text}</div>
    </>
  )
}

function Note({ n, k }: { n: Annotation; k: number }) {
  const ai = n.kind === 'ai'
  return (
    <div
      className={`grid grid-cols-[20px_1fr] gap-2 px-3 py-2.5 rounded-[var(--radius-card)] border text-[12px] leading-[1.45] ${
        ai ? 'border-dashed border-ai bg-ai-soft font-mono text-ai-text' : 'border-coach bg-coach-soft'
      }`}
    >
      <span className={`w-[18px] h-[18px] rounded-full grid place-items-center font-mono text-[10px] font-semibold ${ai ? 'bg-ai text-on-accent' : 'bg-coach text-on-coach'}`}>{k + 1}</span>
      <div>
        {n.who && <div className="text-[11px] text-coach-text font-medium mb-0.5 font-sans">{n.who}</div>}
        <div className={ai ? '' : 'coach-note !text-[14px] !leading-[1.4]'}>{n.text}</div>
        <div className={`font-mono text-[10.5px] mt-1 ${ai ? 'text-ai-text' : 'text-coach-text'}`}>{fmtDate(n.date, true)}</div>
      </div>
    </div>
  )
}

// ── secundaire panelen ─────────────────────────────────────

function Secondary({ series, eftp, width, mobile, L, R }: { series: ReturnType<typeof buildFormSeries>; eftp: EftpPoint[]; width: number; mobile: boolean; L: number; R: number }) {
  const sh = 90
  const w = Math.max(200, width)
  const ramps = weeklyRamp(series)
  // weken zonder data aan het begin (activiteiten reiken minder ver terug dan de conditie) weglaten
  const all = weeklyLoad(series)
  const loads = all.slice(Math.max(0, all.findIndex((l) => l.tss > 0)))
  const inner = w - L - R
  const cls = `fc-sec mt-2.5 bg-surface text-ink border border-line ${mobile ? 'border-x-0' : 'rounded-[var(--radius-card)]'}`
  const summary = 'cursor-pointer flex items-center gap-2 px-3.5 py-2.5 text-[12px] font-medium text-muted'
  const axis = 'font-mono text-[11px]'

  const e0 = eftp[0]?.w
  const e1 = eftp.at(-1)?.w
  const eLo = Math.min(...eftp.map((e) => e.w))
  const eHi = Math.max(...eftp.map((e) => e.w))
  const eMin = Math.min(eLo, (eLo + eHi) / 2 - 10) - 4
  const eMax = Math.max(eHi, (eLo + eHi) / 2 + 10) + 4
  const eY = scaleLinear<number>({ domain: [eMin, eMax], range: [sh - 16, 8] })
  const eX = scaleLinear<number>({ domain: [0, Math.max(1, eftp.length - 1)], range: [L, w - R] })

  const rMin = Math.min(-2, ...ramps)
  const rMax = Math.max(8, ...ramps)
  const rY = scaleLinear<number>({ domain: [rMin, rMax], range: [sh - 6, 8] })
  const slot = inner / Math.max(1, ramps.length)

  const lMax = Math.max(1, ...loads.map((l) => l.tss))
  const lY = scaleLinear<number>({ domain: [0, lMax], range: [sh - 16, 14] })
  const lslot = inner / Math.max(1, loads.length)

  return (
    <div data-theme="dark">
      {eftp.length > 1 && (
        <details className={cls}>
          <summary className={summary}>
            eFTP-verloop · {e0} → {e1} W
          </summary>
          <div className="px-2 pb-2">
            <svg viewBox={`0 0 ${w} ${sh}`} height={sh} className="fc-svg" role="img" aria-label={`eFTP van ${e0} naar ${e1} watt`}>
              {[eLo, eHi].map((v, k) => (
                <g key={k}>
                  <line x1={L} x2={w - R} y1={eY(v)} y2={eY(v)} stroke="var(--line)" />
                  {!mobile && (
                    <text x={L - 6} y={eY(v) + 4} textAnchor="end" className={axis} fill="var(--text-muted)">
                      {Math.round(v)}
                    </text>
                  )}
                </g>
              ))}
              <LinePath<EftpPoint> data={eftp} x={(_, i) => eX(i)} y={(e) => eY(e.w)} curve={CURVE} fill="none" stroke="var(--chart-ctl)" strokeWidth={2} />
            </svg>
          </div>
        </details>
      )}
      {ramps.length > 0 && (
        <details className={cls}>
          <summary className={summary}>Helling per week · veilige zone 3–7</summary>
          <div className="px-2 pb-2">
            <svg viewBox={`0 0 ${w} ${sh}`} height={sh} className="fc-svg" role="img" aria-label={`Helling per week, laatste ${ramps.length} weken: ${ramps.map((r) => f1(r)).join(', ')}`}>
              <rect x={L} y={rY(7)} width={inner} height={rY(3) - rY(7)} fill="var(--accent)" opacity={0.12} />
              <line x1={L} x2={w - R} y1={rY(0)} y2={rY(0)} stroke="var(--line)" />
              {!mobile && (
                <text x={L - 6} y={rY(5) + 4} textAnchor="end" className={axis} fill="var(--text-muted)">
                  3–7
                </text>
              )}
              {ramps.map((v, i) => (
                <rect
                  key={i}
                  x={L + i * slot + 3}
                  y={v >= 0 ? rY(v) : rY(0)}
                  width={Math.max(2, slot - 6)}
                  height={Math.abs(rY(v) - rY(0))}
                  rx={2}
                  fill={v > 8 ? 'var(--warn)' : v >= 0 ? 'var(--chart-ctl)' : 'var(--chart-atl)'}
                />
              ))}
            </svg>
          </div>
        </details>
      )}
      {loads.length > 0 && (
        <details className={cls}>
          <summary className={summary}>Uren en TSS per week</summary>
          <div className="px-2 pb-2">
            <svg viewBox={`0 0 ${w} ${sh}`} height={sh} className="fc-svg" role="img" aria-label={`TSS per week, laatste ${loads.length} weken`}>
              {loads.map((l, i) => (
                <g key={i}>
                  <rect x={L + i * lslot + 3} y={lY(l.tss)} width={Math.max(2, lslot - 6)} height={lY(0) - lY(l.tss)} rx={2} fill="var(--zone-3)" />
                  {!mobile && i % 4 === 0 && (
                    <text x={L + i * lslot + lslot / 2} y={lY(l.tss) - 4} textAnchor="middle" className="font-mono text-[10.5px]" fill="var(--text-muted)">
                      {l.tss}
                      {l.durationSec ? ` · ${(l.durationSec / 3600).toFixed(1).replace('.', ',')}u` : ''}
                    </text>
                  )}
                </g>
              ))}
              <line x1={L} x2={w - R} y1={lY(0)} y2={lY(0)} stroke="var(--line)" />
            </svg>
          </div>
        </details>
      )}
    </div>
  )
}
