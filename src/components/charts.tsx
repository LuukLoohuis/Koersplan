import { useMemo, useState } from 'react'
import { Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import type { CpModel, PowerPoint, Section } from '@shared/types'
import { flatten, zoneIndex, ZONES, wbalSeries, perSecond } from '@shared/metrics'
import { fmtDuration, round } from '@shared/util'
import { useColors, zoneColor } from '../lib/theme'

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
