import { useMemo, useState } from 'react'
import {
  Area,
  Bar,
  Cell,
  ComposedChart,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import type { CpModel, PowerPoint, Section, WellnessDay } from '@shared/types'
import type { PmcPoint } from '@shared/metrics'
import { flatten, zoneIndex, ZONES, wbalSeries, perSecond } from '@shared/metrics'
import { addDays, fmtDate, fmtDuration, round, today } from '@shared/util'
import { useColors, zoneColor, formState } from '../lib/theme'

// ─────────────────────────────────────────────────────────────
// PMC: fitness / vermoeidheid met projectie + vorm eronder
// ─────────────────────────────────────────────────────────────

interface Row {
  date: string
  ctl?: number
  atl?: number
  tsb?: number
  ctlP?: number
  atlP?: number
  tsbP?: number
  load?: number
}

export function PmcChart({
  wellness,
  projection,
  planRange,
  defaultRange = 120,
  compact = false,
}: {
  wellness: WellnessDay[]
  projection?: PmcPoint[]
  planRange?: { from: string; to: string }
  defaultRange?: number
  compact?: boolean
}) {
  const c = useColors()
  const [range, setRange] = useState(defaultRange)

  const data = useMemo<Row[]>(() => {
    const from = addDays(today(), -range)
    const hist: Row[] = wellness
      .filter((w) => w.date >= from)
      .map((w) => ({ date: w.date, ctl: w.ctl, atl: w.atl, tsb: round(w.ctl - w.atl, 1) }))
    if (projection?.length && hist.length) {
      const last = hist[hist.length - 1]
      last.ctlP = last.ctl
      last.atlP = last.atl
      for (const p of projection) {
        if (p.date <= last.date) continue
        hist.push({ date: p.date, ctlP: p.ctl, atlP: p.atl, tsbP: p.tsb, load: p.load })
      }
    }
    return hist
  }, [wellness, projection, range])

  const end = data.at(-1)
  const tickFmt = (d: string) => fmtDate(d)
  const h = compact ? 190 : 250

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-[12px] text-muted">
        <LegendKey color={c['chart-ctl']} label="Fitness (CTL)" />
        <LegendKey color={c['chart-atl']} label="Vermoeidheid (ATL)" />
        {projection?.length ? <LegendKey color={c.text} label="Projectie met plan" dashed /> : null}
        <div className="ml-auto flex gap-1" role="group" aria-label="Periode">
          {[42, 90, 120, 180].map((r) => (
            <button
              key={r}
              className={`btn btn-sm ${r === range ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setRange(r)}
              aria-pressed={r === range}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: h }}>
        <ResponsiveContainer>
          <ComposedChart data={data} syncId="pmc" margin={{ top: 6, right: 44, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.line} strokeDasharray="0" vertical={false} />
            <XAxis dataKey="date" tickFormatter={tickFmt} stroke={c['text-muted']} tickLine={false} axisLine={{ stroke: c.line }} minTickGap={48} hide={!compact && false} />
            <YAxis stroke={c['text-muted']} tickLine={false} axisLine={false} width={34} />
            {planRange && (
              <ReferenceArea x1={planRange.from} x2={planRange.to} fill={c['chart-plan']} fillOpacity={0.08} ifOverflow="extendDomain" />
            )}
            <ReferenceLine x={today()} stroke={c['text-muted']} strokeDasharray="2 3" label={{ value: 'vandaag', position: 'insideTopRight', fill: c['text-muted'], fontSize: 11 }} />
            <Area type="monotone" dataKey="ctl" stroke={c['chart-ctl']} strokeWidth={2} fill={c['chart-ctl']} fillOpacity={0.1} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="atl" stroke={c['chart-atl']} strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="ctlP" stroke={c['chart-ctl']} strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="atlP" stroke={c['chart-atl']} strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
            <Tooltip content={<PmcTooltip />} cursor={{ stroke: c['text-muted'], strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {end && (
        <div className="flex justify-end gap-4 text-[11px] text-muted -mt-1 pr-2 num">
          <span>
            eind: CTL <b className="text-ink">{end.ctlP ?? end.ctl}</b>
          </span>
          <span>
            ATL <b className="text-ink">{end.atlP ?? end.atl}</b>
          </span>
        </div>
      )}
      <div className="flex items-center gap-3 mt-3 mb-1">
        <span className="eyebrow">Vorm (TSB)</span>
        <span className="text-[11px] text-muted">boven 0 = fris · −10 tot −30 = productieve belasting · onder −30 = risico</span>
      </div>
      <div style={{ height: compact ? 90 : 110 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} syncId="pmc" margin={{ top: 4, right: 44, left: 0, bottom: 0 }}>
            <ReferenceArea y1={-80} y2={-30} fill={c['delta-neg']} fillOpacity={0.06} ifOverflow="hidden" />
            <ReferenceArea y1={-30} y2={-10} fill={c['delta-pos']} fillOpacity={0.06} ifOverflow="hidden" />
            <XAxis dataKey="date" hide />
            <YAxis stroke={c['text-muted']} tickLine={false} axisLine={false} width={34} ticks={[-30, -10, 0, 20]} interval={0} domain={[(min: number) => Math.min(-35, Math.floor(min / 10) * 10), (max: number) => Math.max(25, Math.ceil(max / 10) * 10)]} />
            <ReferenceLine y={0} stroke={c.line} />
            <ReferenceLine x={today()} stroke={c['text-muted']} strokeDasharray="2 3" />
            <Bar dataKey="tsb" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={(d.tsb ?? 0) >= 0 ? c['chart-tsb-pos'] : c['chart-tsb-neg']} />
              ))}
            </Bar>
            <Bar dataKey="tsbP" isAnimationActive={false} radius={[2, 2, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={(d.tsbP ?? 0) >= 0 ? c['chart-tsb-pos'] : c['chart-tsb-neg']} fillOpacity={0.45} />
              ))}
            </Bar>
            <Tooltip content={() => null} cursor={{ stroke: c['text-muted'], strokeWidth: 1 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function PmcTooltip({ active, payload }: { active?: boolean; payload?: { payload: Row }[] }) {
  if (!active || !payload?.length) return null
  const r = payload[0].payload
  const proj = r.ctl == null
  const ctl = r.ctl ?? r.ctlP
  const atl = r.atl ?? r.atlP
  const tsb = r.tsb ?? r.tsbP ?? (ctl != null && atl != null ? round(ctl - atl, 1) : undefined)
  const st = tsb != null ? formState(tsb) : null
  return (
    <div className="tt">
      <div className="flex justify-between gap-3 mb-1.5">
        <b>{fmtDate(r.date, true)}</b>
        {proj && <span className="text-muted">projectie</span>}
      </div>
      <TtRow color="var(--chart-ctl)" label="Fitness" value={ctl} />
      <TtRow color="var(--chart-atl)" label="Vermoeidheid" value={atl} />
      <TtRow label="Vorm" value={tsb} extra={st?.label} />
      {proj && r.load != null && <TtRow label="Geplande TSS" value={r.load} />}
    </div>
  )
}

function TtRow({ color, label, value, extra }: { color?: string; label: string; value?: number; extra?: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color ? <span className="w-2 h-2 rounded-full" style={{ background: color }} /> : <span className="w-2" />}
      <span className="text-muted">{label}</span>
      <span className="num ml-auto text-ink">{value ?? '–'}</span>
      {extra && <span className="text-muted text-[11px]">{extra}</span>}
    </div>
  )
}

export function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <svg width="18" height="8" aria-hidden>
        <line x1="1" y1="4" x2="17" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? '4 3' : undefined} strokeLinecap="round" />
      </svg>
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// Power-duration curve met CP-model
// ─────────────────────────────────────────────────────────────

const PD_TICKS = [5, 15, 60, 300, 1200, 3600]
const fmtSecs = (s: number) => (s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${round(s / 3600, 1)}u`)

export function PdChart({ curve, model, weightKg }: { curve: PowerPoint[]; model: CpModel | null; weightKg?: number }) {
  const c = useColors()
  const [wkg, setWkg] = useState(false)
  const div = wkg && weightKg ? weightKg : 1
  const data = useMemo(
    () =>
      curve
        .filter((p) => p.secs >= 1)
        .map((p) => ({
          secs: p.secs,
          mmp: round(p.watts / div, wkg ? 2 : 0),
          model: model && p.secs >= 120 && p.secs <= 2400 ? round((model.cp + model.wPrime / p.secs) / div, wkg ? 2 : 0) : undefined,
        })),
    [curve, model, div, wkg],
  )
  if (!curve.length) return <p className="text-muted text-sm py-8 text-center">Nog geen vermogensdata.</p>
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-3 text-[12px] text-muted">
        <LegendKey color={c['chart-ctl']} label="Beste vermogen (90 d)" />
        {model && <LegendKey color={c['chart-wbal']} label="CP-model" dashed />}
        {weightKg ? (
          <div className="ml-auto flex gap-1" role="group" aria-label="Eenheid">
            <button className={`btn btn-sm ${!wkg ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setWkg(false)} aria-pressed={!wkg}>
              W
            </button>
            <button className={`btn btn-sm ${wkg ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setWkg(true)} aria-pressed={wkg}>
              W/kg
            </button>
          </div>
        ) : null}
      </div>
      <div style={{ height: 250 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={c.line} vertical={false} />
            <XAxis dataKey="secs" type="number" scale="log" domain={[1, 'dataMax']} ticks={PD_TICKS} tickFormatter={fmtSecs} stroke={c['text-muted']} tickLine={false} axisLine={{ stroke: c.line }} allowDataOverflow />
            <YAxis stroke={c['text-muted']} tickLine={false} axisLine={false} width={40} />
            {model && (
              <ReferenceLine
                y={round(model.cp / div, wkg ? 2 : 0)}
                stroke={c['chart-wbal']}
                strokeDasharray="2 3"
                label={{ value: `CP ${round(model.cp / div, wkg ? 2 : 0)}`, position: 'insideTopRight', fill: c['text-muted'], fontSize: 11 }}
              />
            )}
            <Line type="monotone" dataKey="mmp" stroke={c['chart-ctl']} strokeWidth={2} dot={{ r: 2.5, fill: c['chart-ctl'], strokeWidth: 0 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="model" stroke={c['chart-wbal']} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="tt">
                    <b>{fmtSecs(payload[0].payload.secs)}</b>
                    <TtRow color="var(--chart-ctl)" label="Beste" value={payload[0].payload.mmp} />
                    {payload[0].payload.model != null && <TtRow color="var(--chart-wbal)" label="Model" value={payload[0].payload.model} />}
                  </div>
                ) : null
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Workoutprofiel (zones) + W′-balans
// ─────────────────────────────────────────────────────────────

export function WorkoutProfile({
  sections,
  ftp,
  model,
  height = 110,
  showWbal = true,
  mini = false,
}: {
  sections: Section[]
  ftp: number
  model?: Pick<CpModel, 'cp' | 'wPrime'> | null
  height?: number
  showWbal?: boolean
  mini?: boolean
}) {
  const c = useColors()
  const [hover, setHover] = useState<number | null>(null)
  const segs = useMemo(() => flatten(sections), [sections])
  const total = segs.reduce((a, s) => a + s.dur, 0)
  const maxPct = Math.max(1.3, ...segs.map((s) => Math.max(s.from, s.to))) * 1.05
  const wbal = useMemo(() => {
    if (!showWbal || !model?.cp || mini) return null
    const w = wbalSeries(perSecond(segs), ftp, model.cp, model.wPrime)
    const step = Math.max(1, Math.floor(w.length / 400))
    const pts: [number, number][] = []
    for (let i = 0; i < w.length; i += step) pts.push([i, w[i]])
    return { pts, min: Math.min(...w) }
  }, [segs, ftp, model, showWbal, mini])

  if (!total) return <div style={{ height }} className="grid place-items-center text-muted text-xs">Geen stappen</div>
  const W = 1000
  const H = 100
  const x = (t: number) => (t / total) * W
  const y = (f: number) => H - (f / maxPct) * H
  const hs = hover != null ? segs[hover] : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height, display: 'block' }} role="img" aria-label="Workoutprofiel">
        {!mini && [0.5, 1].map((f) => <line key={f} x1={0} x2={W} y1={y(f)} y2={y(f)} stroke={c.line} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={f === 1 ? '4 3' : undefined} />)}
        {model?.cp && !mini ? (
          <line x1={0} x2={W} y1={y(model.cp / ftp)} y2={y(model.cp / ftp)} stroke={c['chart-wbal']} strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray="2 3" />
        ) : null}
        {segs.map((s, i) => {
          const x0 = x(s.start)
          const x1 = x(s.start + s.dur)
          const gap = mini ? 0 : Math.min(1.2, (x1 - x0) * 0.15)
          const mid = (s.from + s.to) / 2
          return (
            <polygon
              key={i}
              points={`${x0 + gap / 2},${H} ${x0 + gap / 2},${y(s.from)} ${x1 - gap / 2},${y(s.to)} ${x1 - gap / 2},${H}`}
              fill={s.kind === 'freeride' ? c['chart-plan'] : zoneColor(c, zoneIndex(mid))}
              opacity={hover == null || hover === i ? 1 : 0.55}
              onMouseEnter={() => !mini && setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          )
        })}
      </svg>
      {!mini && (
        <div className="flex justify-between text-[10.5px] text-muted num mt-1">
          <span>0</span>
          <span>{fmtDuration(total / 2)}</span>
          <span>{fmtDuration(total)}</span>
        </div>
      )}
      {hs && (
        <div className="tt absolute pointer-events-none" style={{ left: `min(calc(${(x(hs.start + hs.dur / 2) / W) * 100}% - 70px), calc(100% - 170px))`, top: -8, transform: 'translateY(-100%)' }}>
          <b>{hs.sectionName}</b>
          <div className="text-muted num">
            {fmtDuration(hs.dur)} ·{' '}
            {hs.kind === 'freeride'
              ? 'vrij'
              : hs.kind === 'ramp'
                ? `${Math.round(hs.from * 100)}→${Math.round(hs.to * 100)}%`
                : `${Math.round(hs.from * 100)}%`}{' '}
            · {hs.kind === 'freeride' ? '' : `${Math.round(((hs.from + hs.to) / 2) * ftp)} W`}
          </div>
          <div className="text-muted">{ZONES[zoneIndex((hs.from + hs.to) / 2)].key} {ZONES[zoneIndex((hs.from + hs.to) / 2)].name}</div>
        </div>
      )}
      {wbal && model && (
        <div className="mt-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="eyebrow">W′-balans</span>
            <span className="text-[11px] text-muted num">
              min {round(Math.max(0, wbal.min) / 1000, 1)} / {round(model.wPrime / 1000, 1)} kJ
            </span>
          </div>
          <svg viewBox={`0 0 ${W} 40`} preserveAspectRatio="none" style={{ width: '100%', height: 40, display: 'block' }} aria-label="W′-balans">
            <line x1={0} x2={W} y1={39} y2={39} stroke={c.line} vectorEffect="non-scaling-stroke" />
            <polyline
              fill="none"
              stroke={c['chart-wbal']}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              points={wbal.pts.map(([t, v]) => `${x(t)},${38 - (v / model.wPrime) * 36}`).join(' ')}
            />
          </svg>
        </div>
      )}
    </div>
  )
}

export function ZoneBars({ timeInZone }: { timeInZone: number[] }) {
  const c = useColors()
  const total = timeInZone.reduce((a, b) => a + b, 0) || 1
  return (
    <div className="grid gap-1">
      {ZONES.map((z, i) =>
        timeInZone[i] > 0 ? (
          <div key={z.key} className="grid grid-cols-[88px_1fr_52px] items-center gap-2 text-[11.5px]">
            <span className="text-muted">
              {z.key} {z.name}
            </span>
            <div className="h-2 rounded-full bg-raised overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${(timeInZone[i] / total) * 100}%`, background: zoneColor(c, i) }} />
            </div>
            <span className="num text-right text-muted">{fmtDuration(timeInZone[i])}</span>
          </div>
        ) : null,
      )}
    </div>
  )
}
