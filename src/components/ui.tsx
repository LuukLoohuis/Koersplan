import type { KeyboardEvent, ReactNode } from 'react'
import { Check, CircleCheck, Clock, CloudOff, PencilLine, Route, Smartphone, Sun, TriangleAlert, X, type LucideIcon } from 'lucide-react'
import type { AthleteSummary, TrainingStatus } from '@shared/types'
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

// ── statussen en signalen: altijd icoon + kleur + woord ──────────────────────

const STATUS: Record<TrainingStatus, { label: string; cls: string; Icon: LucideIcon }> = {
  uitgezet: { label: 'Uitgezet', cls: 'chip-ai', Icon: Route },
  'bij-coach': { label: 'Bij coach', cls: '', Icon: Clock },
  bijgestuurd: { label: 'Bijgestuurd', cls: 'chip-coach', Icon: PencilLine },
  bevestigd: { label: 'Bevestigd', cls: 'chip-coach-solid', Icon: Check },
  'op-fietscomputer': { label: 'Op je fietscomputer', cls: '', Icon: Smartphone },
  gereden: { label: 'Gereden', cls: 'chip-good', Icon: CircleCheck },
  gemist: { label: 'Gemist', cls: 'chip-crit', Icon: X },
}

/**
 * Status van een training of koers. "Uitgezet" krijgt alleen de AI-stem als de AI
 * uitzette; een voorstel van de regelgenerator is neutraal.
 */
export function StatusChip({ status, by = 'ai', label, suffix }: { status: TrainingStatus; by?: 'ai' | 'regels'; label?: string; suffix?: ReactNode }) {
  const m = STATUS[status]
  const regels = status === 'uitgezet' && by === 'regels'
  return (
    <span className={`chip ${regels ? '' : m.cls}`}>
      <m.Icon size={12} aria-hidden />
      {label ?? (regels ? 'Uitgezet (regels)' : m.label)}
      {suffix}
    </span>
  )
}

export interface Signal {
  text: string
  tone: 'warn' | 'crit' | 'good'
  sync?: boolean
}

/** Signalen van een atleet uit de vlaggen en de koers (gemiste trainingen). */
export function signalsOf(a: Pick<AthleteSummary, 'flags' | 'missed7d'> & { rampRate?: number }, withFris = false): Signal[] {
  const out: Signal[] = []
  for (const f of a.flags) {
    if (/Koppeling faalt/.test(f)) out.push({ text: 'Sync-fout', tone: 'crit', sync: true })
    else if (/Snelle opbouw/.test(f)) out.push({ text: a.rampRate != null ? `Helling +${String(a.rampRate).replace('.', ',')}` : f, tone: 'warn' })
    else if (/Fris/.test(f)) {
      if (withFris) out.push({ text: f, tone: 'good' })
    }
    else out.push({ text: f, tone: /vermoeid|HRV|te hoog/.test(f) ? 'crit' : 'warn' })
  }
  if (a.missed7d) out.push({ text: `${a.missed7d} gemist`, tone: 'warn' })
  return out
}

export function SignalChip({ s }: { s: Signal }) {
  const Icon = s.sync ? CloudOff : s.tone === 'good' ? Sun : TriangleAlert
  return (
    <span className={`chip chip-${s.tone}`}>
      <Icon size={12} aria-hidden />
      {s.text}
    </span>
  )
}

export function FlagChips({ flags, rampRate }: { flags: string[]; rampRate?: number }) {
  const signals = signalsOf({ flags, rampRate }, true)
  if (!signals.length) return <span className="text-muted text-xs">–</span>
  return (
    <span className="flex flex-wrap gap-1">
      {signals.map((s) => (
        <SignalChip key={s.text} s={s} />
      ))}
    </span>
  )
}

/**
 * "was → wordt": de uitgezette waarde dun doorgestreept, de nieuwe waarde van de coach.
 * De oude waarde krijgt alleen de AI-stem als de AI hem uitzette; van de regelgenerator is hij neutraal.
 */
export function Correction({ was, wordt, by = 'ai' }: { was?: ReactNode; wordt?: ReactNode; by?: 'ai' | 'regels' }) {
  return (
    <span className="correction">
      {was != null && (
        <span className={`was ${by === 'regels' ? '!text-muted' : ''}`}>
          <span className="sr-only">was </span>
          {was}
        </span>
      )}
      {was != null && wordt != null && (
        <span className="arrow" aria-hidden>
          →
        </span>
      )}
      {wordt != null && (
        <span className="wordt">
          <span className="sr-only">wordt </span>
          {wordt}
        </span>
      )}
    </span>
  )
}

/** Initialen van een naam: "Sanne de Vries" → "SV", "Ruud" → "R". */
export const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^\p{Lu}/u.test(w))
    .map((w) => [...w][0])
    .slice(0, 2)
    .join('') || [...name][0]?.toUpperCase() || ''

/** Initialen tot er echte foto's zijn. Neutraal: brons en ijs-teal zijn voor de twee stemmen. */
export function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  const ini = initialsOf(name)
  return (
    <span
      aria-hidden
      className="grid place-items-center rounded-full bg-raised text-ink border border-line font-semibold shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {ini}
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

/** Woordmerk in tekst tot er een SVG-logo is (de PNG's hebben een grijzige grond): kapitalen, tracking .18em, de Q in goud. */
export function Wordmark({ className = 'text-[15px]' }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-[0.18em] ${className}`}>
      VELORI<span className="text-accent-text">Q</span>
    </span>
  )
}
