import type { KeyboardEvent, ReactNode } from 'react'
import type { AthleteSummary } from '@shared/types'
import { round } from '@shared/util'
import { formState } from '../lib/theme'

export function Panel({ title, action, children, className = '', pad = true }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="flex items-center gap-3 px-4 pt-3.5 pb-1">
          {title && <h3 className="text-[13px] font-semibold m-0">{title}</h3>}
          {action && <div className="ml-auto">{action}</div>}
        </header>
      )}
      <div className={pad ? 'p-4 pt-2' : ''}>{children}</div>
    </section>
  )
}

/** KPI-cijfer: label (mono), cijfer als tekst (kpi), optioneel delta/chip ernaast en sparkline of subregel eronder. */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
  aside,
  spark,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  tone?: string
  aside?: ReactNode
  spark?: ReactNode
}) {
  return (
    <div className="min-w-0">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className={`kpi tabular-nums ${tone ?? ''}`}>{value}</span>
        {unit && <span className="num text-muted text-[12px]">{unit}</span>}
        {aside}
      </div>
      {spark && <div className="mt-1.5">{spark}</div>}
      {sub && <div className="text-[11.5px] text-muted mt-1.5 truncate">{sub}</div>}
    </div>
  )
}

/** Delta t.o.v. een eerdere waarde: teken én kleur (▲ delta-pos, ▼ delta-neg). Het getal staat in `text` voor contrast op licht. */
export function Delta({ value, digits = 1 }: { value: number; digits?: number }) {
  const up = value >= 0
  return (
    <span className="num text-[12px] text-ink">
      <span aria-hidden className={up ? 'text-good' : 'text-crit'}>
        {up ? '▲' : '▼'}
      </span>
      <span className="sr-only">{up ? 'plus' : 'min'}</span> {Math.abs(value).toFixed(digits).replace('.', ',')}
    </span>
  )
}

/** Mini-lijn 72×20 in de kleur van de serie. */
export function Sparkline({ values, color, width = 72, height = 20, label }: { values: number[]; color: string; width?: number; height?: number; label?: string }) {
  if (values.length < 2) return null
  const mn = Math.min(...values)
  const r = Math.max(...values) - mn || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * width).toFixed(1)} ${(height - 2 - ((v - mn) / r) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

export function FormChip({ tsb }: { tsb: number }) {
  const st = formState(tsb)
  return <span className={`chip ${st.tone ? `chip-${st.tone}` : ''}`}>{st.label}</span>
}

export function FlagChips({ flags }: { flags: string[] }) {
  if (!flags.length) return <span className="text-muted text-xs">–</span>
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className={`chip ${/vermoeid|HRV|Koppeling|te hoog/.test(f) ? 'chip-crit' : /Fris/.test(f) ? 'chip-good' : 'chip-warn'}`}>
          {f}
        </span>
      ))}
    </span>
  )
}

export function KpiStrip({ a }: { a: AthleteSummary }) {
  const wkg = a.weightKg ? round(a.ftp / a.weightKg, 2) : null
  return (
    <div className="panel grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-5 p-4">
      <Stat label="Fitness · CTL" value={round(a.ctl)} sub={`ramp ${a.rampRate > 0 ? '+' : ''}${a.rampRate} /week`} tone={a.rampRate > 8 ? 'text-warn' : ''} />
      <Stat label="Vermoeidheid · ATL" value={round(a.atl)} />
      <Stat label="Vorm · TSB" value={`${a.tsb > 0 ? '+' : ''}${round(a.tsb)}`} sub={<FormChip tsb={a.tsb} />} tone={a.tsb < -30 ? 'text-crit' : ''} />
      <Stat label="Critical Power" value={a.cp ?? '–'} unit="W" sub={a.weightKg && a.cp ? `${round(a.cp / a.weightKg, 2)} W/kg` : 'uit power-duration curve'} />
      <Stat label="W′ (anaerobe reserve)" value={a.wPrime ? round(a.wPrime / 1000, 1) : '–'} unit="kJ" />
      <Stat label="FTP (intervals.icu)" value={a.ftp || '–'} unit="W" sub={wkg ? `${wkg} W/kg` : undefined} />
    </div>
  )
}

/** Tabbalk (role=tablist) met pijltjesnavigatie; het paneel krijgt id `${id}-${value}` via tabPanelProps. */
export function TabBar<K extends string>({ id, tabs, value, onChange }: { id: string; tabs: readonly (readonly [K, ReactNode])[]; value: K; onChange: (k: K) => void }) {
  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const i = tabs.findIndex(([k]) => k === value)
    const next = tabs[(i + d + tabs.length) % tabs.length][0]
    onChange(next)
    document.getElementById(`${id}-tab-${next}`)?.focus()
  }
  return (
    <div role="tablist" className="tabs" onKeyDown={move}>
      {tabs.map(([k, label]) => (
        <button
          key={k}
          id={`${id}-tab-${k}`}
          role="tab"
          type="button"
          aria-selected={value === k}
          aria-controls={`${id}-${k}`}
          tabIndex={value === k ? 0 : -1}
          className="tab"
          onClick={() => onChange(k)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

export const tabPanelProps = (id: string, value: string) => ({ role: 'tabpanel', id: `${id}-${value}`, 'aria-labelledby': `${id}-tab-${value}` }) as const

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-center text-muted text-sm py-10">{children}</div>
}

const TONES = { good: 'bg-good-soft text-good', warn: 'bg-warn-soft text-warn', crit: 'bg-crit-soft text-crit' }

export function Toast({ tone = 'good', children, onClose }: { tone?: 'good' | 'warn' | 'crit'; children: ReactNode; onClose?: () => void }) {
  return (
    <div className={`flex items-start gap-3 rounded-lg px-3.5 py-2.5 text-[13px] ${TONES[tone]}`} role="status">
      <div className="flex-1">{children}</div>
      {onClose && (
        <button className="btn btn-sm btn-ghost !h-6 !px-1.5" onClick={onClose} aria-label="Sluiten">
          ✕
        </button>
      )}
    </div>
  )
}
