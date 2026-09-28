import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Check, CloudOff, PencilLine, Search } from 'lucide-react'
import type { AthleteSummary } from '@shared/types'
import { daysBetween, today } from '@shared/util'
import { useApp } from '../App'
import { formState } from '../lib/theme'
import { Avatar, Delta, FormChip, SignalChip, signalsOf } from '../components/ui'

// Mijn atleten (design-system/components/Roster): de cockpit van de coach.

type Filter = 'alle' | 'wacht' | 'signalen' | 'coach' | 'ai'
type Sort = 'urgentie' | 'vorm' | 'helling' | 'koers' | 'naam'

const FILTERS: [Filter, string][] = [
  ['alle', 'Alle'],
  ['wacht', 'Koers wacht'],
  ['signalen', 'Signalen'],
  ['coach', 'Coach'],
  ['ai', 'AI'],
]
const SORTS: [Sort, string][] = [
  ['urgentie', 'Urgentie'],
  ['vorm', 'Vorm'],
  ['helling', 'Helling'],
  ['koers', 'Op koers %'],
  ['naam', 'Naam'],
]

const TONE_COLOR = { '': 'var(--text-muted)', good: 'var(--delta-pos)', accent: 'var(--accent-text)', crit: 'var(--delta-neg)' } as const
const signed = (v: number, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d).replace('.', ',')}`
const dueIn = (a: AthleteSummary) => (a.nextPlanDue ? Math.max(0, daysBetween(today(), a.nextPlanDue)) : undefined)

/** Hoe dringend: open koersen, sync-fouten, kritieke signalen en een koers die vandaag afloopt. */
function urgency(a: AthleteSummary) {
  const s = signalsOf(a)
  const due = dueIn(a)
  return (
    (a.openProposals ?? 0) * 5 +
    s.filter((x) => x.sync).length * 6 +
    s.filter((x) => x.tone === 'crit' && !x.sync).length * 3 +
    s.filter((x) => x.tone === 'warn').length +
    (due === 0 ? 4 : due != null && due <= 2 ? 2 : 0)
  )
}

const SORT_FN: Record<Sort, (a: AthleteSummary, b: AthleteSummary) => number> = {
  urgentie: (a, b) => urgency(b) - urgency(a) || a.name.localeCompare(b.name),
  vorm: (a, b) => a.tsb - b.tsb,
  helling: (a, b) => b.rampRate - a.rampRate,
  koers: (a, b) => (a.onCourse7d ?? 101) - (b.onCourse7d ?? 101),
  naam: (a, b) => a.name.localeCompare(b.name),
}

export function RosterPage() {
  const { athletes, reloadAthletes } = useApp()
  const nav = useNavigate()
  // koersen wachten, op koers en volgende koers veranderen in de app zelf: vers ophalen bij openen
  useEffect(() => {
    reloadAthletes()
  }, []) // eenmalig bij openen
  const [filter, setFilter] = useState<Filter>('alle')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('urgentie')
  const all = athletes ?? []

  const waiting = all.reduce((n, a) => n + (a.openProposals ?? 0), 0)
  const syncErrors = all.filter((a) => signalsOf(a).some((s) => s.sync)).length

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return all
      .filter((a) => !needle || a.name.toLowerCase().includes(needle))
      .filter((a) =>
        filter === 'wacht'
          ? (a.openProposals ?? 0) > 0
          : filter === 'signalen'
            ? signalsOf(a).length > 0
            : filter === 'coach' || filter === 'ai'
              ? (a.subscription ?? 'coach') === filter
              : true,
      )
      .sort(SORT_FN[sort])
  }, [all, q, filter, sort])

  const sortCol: Partial<Record<Sort, string>> = { vorm: 'vorm', helling: 'conditie', koers: 'koers', naam: 'atleet' }
  const ariaSort = (col: string) => (sortCol[sort] === col ? (sort === 'naam' ? 'ascending' : sort === 'vorm' || sort === 'koers' ? 'ascending' : 'descending') : undefined)
  const chip =
    'shrink-0 inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-full border border-line bg-surface text-muted text-[12px] font-medium cursor-pointer aria-pressed:text-ink aria-pressed:border-muted'

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-end gap-4">
        <h1 className="h1">Mijn atleten</h1>
        <Link to="/app/koppelen" className="btn ml-auto no-underline">
          + Atleet koppelen
        </Link>
      </header>

      <section aria-label="Te doen" className="panel flex flex-wrap items-center gap-2.5 px-3.5 py-3">
        <span className="eyebrow mr-1.5">Te doen</span>
        {waiting > 0 && (
          <button type="button" className="chip chip-coach cursor-pointer" onClick={() => setFilter('wacht')}>
            <PencilLine size={12} aria-hidden />
            {waiting} {waiting === 1 ? 'koers wacht' : 'koersen wachten'}
          </button>
        )}
        {syncErrors > 0 && (
          <span className="chip chip-crit">
            <CloudOff size={12} aria-hidden />
            {syncErrors} sync-{syncErrors === 1 ? 'fout' : 'fouten'}
          </span>
        )}
        {!waiting && !syncErrors && (
          <span className="chip chip-good">
            <Check size={12} aria-hidden />
            Niets dat wacht
          </span>
        )}
        <span className="flex-1" />
        <span className="num text-[11.5px] text-muted">{athletes ? `${all.length} ${all.length === 1 ? 'atleet' : 'atleten'}` : 'Laden…'}</span>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filter" className="flex flex-wrap gap-2">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" className={chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {label}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <label className="relative">
          <span className="sr-only">Zoek atleet</span>
          <Search size={14} aria-hidden className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input className="field field-sm !pl-7 !w-[180px]" placeholder="Zoek atleet" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-[12px] text-muted">
          Sorteer op
          <select className="field field-sm !w-[140px]" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            {SORTS.map(([s, label]) => (
              <option key={s} value={s}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="panel overflow-x-auto">
        <table className="data">
          <thead>
            <tr>
              <th aria-sort={ariaSort('atleet')}>Atleet</th>
              <th>Abo</th>
              <th aria-sort={ariaSort('vorm')}>Vorm · 28 d</th>
              <th aria-sort={ariaSort('conditie')}>Conditie</th>
              <th aria-sort={ariaSort('koers')}>Op koers 7d</th>
              <th>Voorstellen</th>
              <th>Volgende koers</th>
              <th>Signalen</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <Row key={a.id} a={a} onOpen={() => nav(`/app/atleet/${a.id}`)} />
            ))}
          </tbody>
        </table>
        {athletes && !list.length && (
          <div className="p-8 text-center text-muted">
            {all.length ? (
              'Geen atleten met dit filter.'
            ) : (
              <>
                Nog geen atleten. <Link to="/app/koppelen">Koppel de eerste via intervals.icu</Link>.
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ a, onOpen }: { a: AthleteSummary; onOpen: () => void }) {
  const st = formState(a.tsb)
  const signals = signalsOf(a)
  const due = dueIn(a)
  const sub = a.subscription ?? 'coach'
  return (
    <tr className="cursor-pointer" onClick={onOpen}>
      <td>
        <div className="flex items-center gap-2.5">
          <Avatar name={a.name} />
          <span>
            <Link to={`/app/atleet/${a.id}`} className="block font-medium text-ink no-underline hover:underline" onClick={(e) => e.stopPropagation()}>
              {a.name}
            </Link>
            <span className="num text-[11px] text-muted">FTP {a.ftp || '–'} W</span>
          </span>
        </div>
      </td>
      <td>
        <span className={`chip ${sub === 'coach' ? 'chip-coach' : 'chip-ai'}`}>{sub === 'coach' ? 'Coach' : 'AI'}</span>
      </td>
      <td>
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-[15px] tabular-nums min-w-8">{signed(Math.round(a.tsb))}</span>
          {a.formSeries28 && a.formSeries28.length > 1 && <FormSpark values={a.formSeries28} color={TONE_COLOR[st.tone]} />}
          <FormChip tsb={a.tsb} />
        </div>
      </td>
      <td className="num">
        {Math.round(a.ctl)} <Delta value={a.rampRate} />
      </td>
      <td className="num">{a.onCourse7d != null ? `${a.onCourse7d}%` : <span className="text-muted">—</span>}</td>
      <td>
        {a.openProposals ? (
          <Link to={`/app/atleet/${a.id}?tab=plan`} className="chip chip-coach no-underline" onClick={(e) => e.stopPropagation()}>
            <PencilLine size={12} aria-hidden />
            {a.openProposals} wacht
          </Link>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className={`num ${due === 0 ? 'text-coach-text font-medium' : ''}`}>{due == null ? '—' : due === 0 ? 'vandaag' : `over ${due} d`}</td>
      <td className="!whitespace-normal">
        {signals.length ? (
          <div className="flex flex-wrap gap-1">
            {signals.map((s) => (
              <SignalChip key={s.text} s={s} />
            ))}
          </div>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  )
}

/** Vorm over 28 dagen, in de kleur van de huidige zone, met de nullijn. */
function FormSpark({ values, color }: { values: number[]; color: string }) {
  const w = 80
  const h = 22
  const mn = Math.min(0, ...values)
  const r = Math.max(0, ...values) - mn || 1
  const y = (v: number) => h - 2 - ((v - mn) / r) * (h - 4)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="block shrink-0 overflow-visible">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
      <circle cx={w} cy={y(values[values.length - 1])} r={2.5} fill={color} />
    </svg>
  )
}
