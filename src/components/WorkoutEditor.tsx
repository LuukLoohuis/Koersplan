import { useEffect, useMemo, useState } from 'react'
import type { CpModel, Section, Step, Stimulus, Workout } from '@shared/types'
import { workoutMetrics } from '@shared/metrics'
import { TEMPLATES, sec, st } from '@shared/library'
import { workoutDescription } from '@shared/intervalsText'
import { fmtDuration, round, uid } from '@shared/util'
import { WorkoutProfile, ZoneBars } from './charts'

const STIMULI: Stimulus[] = ['Herstel', 'Duur', 'Tempo', 'Sweetspot', 'Drempel', 'VO2max', 'Anaeroob', 'Sprint', 'Duurvermogen']

const toClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
function parseClock(v: string): number | null {
  const t = v.trim()
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t) * 60) // alleen minuten
  const m = t.match(/^(\d+):(\d{1,2})$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  const s = t.match(/^(\d+)\s*s$/i)
  if (s) return Number(s[1])
  return null
}

export function WorkoutEditor({
  workout,
  ftp,
  model,
  minDate,
  maxDate,
  takenDates,
  onChange,
  onDelete,
  onClose,
}: {
  workout: Workout
  ftp: number
  model: CpModel | null
  minDate: string
  maxDate: string
  takenDates: string[]
  onChange: (w: Workout) => void
  onDelete: () => void
  onClose: () => void
}) {
  const w = workout
  const m = useMemo(() => workoutMetrics(w.sections, ftp, model), [w.sections, ftp, model])
  const set = (patch: Partial<Workout>) => onChange({ ...w, ...patch })
  const setSections = (sections: Section[]) => set({ sections })
  const setSection = (i: number, s: Section) => setSections(w.sections.map((x, j) => (j === i ? s : x)))
  const setStep = (si: number, ti: number, patch: Partial<Step>) => {
    const s = w.sections[si]
    setSection(si, { ...s, steps: s.steps.map((x, j) => (j === ti ? { ...x, ...patch } : x)) })
  }
  const move = (i: number, d: -1 | 1) => {
    const arr = [...w.sections]
    const j = i + d
    if (j < 0 || j >= arr.length) return
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    setSections(arr)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dateTaken = takenDates.includes(w.date)

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`Bewerk ${w.name}`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[620px] h-full overflow-y-auto bg-bg border-l border-line shadow-2xl" style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}>
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-line px-5 py-3 flex items-center gap-3">
          <span className="eyebrow">Training bewerken</span>
          <button className="btn btn-sm btn-ghost ml-auto" onClick={onDelete}>
            Verwijder
          </button>
          <button className="btn btn-sm btn-primary" onClick={onClose}>
            Klaar
          </button>
        </div>

        <div className="p-5 grid gap-5">
          <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
            <label className="grid gap-1.5">
              <span className="eyebrow">Naam</span>
              <input id="wo-name" className="field" value={w.name} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="eyebrow">Datum</span>
              <input id="wo-date" type="date" className="field" min={minDate} max={maxDate} value={w.date} onChange={(e) => e.target.value && set({ date: e.target.value })} />
            </label>
            {dateTaken && <p className="text-warn text-[12px] m-0 sm:col-span-2">Op deze dag staat al een andere training.</p>}
            <label className="grid gap-1.5">
              <span className="eyebrow">Prikkel</span>
              <select id="wo-stim" className="field" value={w.stimulus} onChange={(e) => set({ stimulus: e.target.value as Stimulus })}>
                {STIMULI.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="eyebrow">Vervang door</span>
              <select
                id="wo-template"
                className="field"
                value=""
                onChange={(e) => {
                  const t = TEMPLATES[e.target.value]
                  if (t) set({ sections: t.build(1), name: t.name, stimulus: t.stimulus, coachNote: t.note(1) })
                }}
              >
                <option value="">Sjabloon…</option>
                {Object.entries(TEMPLATES).map(([k, t]) => (
                  <option key={k} value={k}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="eyebrow">Uitleg voor de atleet</span>
            <textarea id="wo-note" className="field" rows={3} value={w.coachNote} onChange={(e) => set({ coachNote: e.target.value })} />
          </label>

          {/* Kerncijfers */}
          <div className="panel p-3.5 grid grid-cols-3 sm:grid-cols-6 gap-3">
            {[
              ['Duur', fmtDuration(m.durationSec)],
              ['TSS', m.tss],
              ['IF', m.intensityFactor.toFixed(2)],
              ['NP', `${m.normWatts} W`],
              ['Arbeid', `${m.kj} kJ`],
              ["W′ min", m.minWbal != null ? `${round(m.minWbal / 1000, 1)} kJ` : '–'],
            ].map(([k, v]) => (
              <div key={k}>
                <div className="eyebrow">{k}</div>
                <div className="num text-[15px]">{v}</div>
              </div>
            ))}
          </div>
          {m.wbalEmptied && (
            <p className="text-crit text-[12.5px] m-0 -mt-2">
              W′ raakt volgens het CP-model leeg. Verleng het herstel, verkort de blokken of verlaag de intensiteit, anders haalt de atleet de laatste herhalingen waarschijnlijk niet.
            </p>
          )}

          <div className="panel p-4">
            <WorkoutProfile sections={w.sections} ftp={ftp} model={model} height={120} />
          </div>

          {/* Secties */}
          <div className="grid gap-3">
            <div className="flex items-center">
              <span className="eyebrow">Opbouw</span>
              <span className="text-[11.5px] text-muted ml-2">duur als m:ss · doel in % FTP ({ftp} W)</span>
            </div>
            {w.sections.map((s, si) => (
              <div key={s.id} className="panel">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
                  <input className="field field-sm flex-1 min-w-0 font-medium" aria-label="Naam sectie" value={s.name} onChange={(e) => setSection(si, { ...s, name: e.target.value })} />
                  <label className="flex items-center gap-1 text-[12px] text-ink-2">
                    <input
                      className="field field-sm w-14 num text-right"
                      type="number"
                      min={1}
                      max={30}
                      aria-label="Herhalingen"
                      value={s.repeat}
                      onChange={(e) => setSection(si, { ...s, repeat: Math.max(1, Math.min(30, Number(e.target.value) || 1)) })}
                    />
                    ×
                  </label>
                  <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => move(si, -1)} aria-label="Sectie omhoog" disabled={si === 0}>
                    ↑
                  </button>
                  <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => move(si, 1)} aria-label="Sectie omlaag" disabled={si === w.sections.length - 1}>
                    ↓
                  </button>
                  <button className="btn btn-sm btn-ghost !px-1.5" onClick={() => setSections(w.sections.filter((_, j) => j !== si))} aria-label="Sectie verwijderen">
                    ✕
                  </button>
                </div>
                <div className="px-3 py-2 grid gap-1.5 overflow-x-auto">
                  <div className="grid grid-cols-[88px_64px_56px_56px_56px_24px] gap-1.5 text-[10.5px] text-muted uppercase tracking-wide min-w-[380px]">
                    <span>Type</span>
                    <span>Duur</span>
                    <span>{'Van %'}</span>
                    <span>{'Tot %'}</span>
                    <span>rpm</span>
                    <span />
                  </div>
                  {s.steps.map((x, ti) => (
                    <StepRow
                      key={x.id}
                      step={x}
                      onChange={(p) => setStep(si, ti, p)}
                      onDelete={() => setSection(si, { ...s, steps: s.steps.filter((_, j) => j !== ti) })}
                    />
                  ))}
                  <button
                    className="btn btn-sm btn-ghost justify-self-start !px-1"
                    onClick={() => setSection(si, { ...s, steps: [...s.steps, { ...st(5, 60), id: uid('s') }] })}
                  >
                    + stap
                  </button>
                </div>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-sm" onClick={() => setSections([...w.sections, sec('Blok', [st(10, 70)])])}>
                + sectie
              </button>
              <button className="btn btn-sm" onClick={() => setSections(insertBeforeCooldown(w.sections, sec('Intervallen', [st(4, 110), st(4, 55)], 4)))}>
                + intervalset
              </button>
            </div>
          </div>

          <div className="panel p-4">
            <div className="eyebrow mb-2">Tijd in zone</div>
            <ZoneBars timeInZone={m.timeInZone} />
          </div>

          <details className="panel p-4">
            <summary className="cursor-pointer text-[13px] font-medium">Zo komt het in intervals.icu</summary>
            <pre className="num text-[11.5px] whitespace-pre-wrap mt-3 mb-0 text-ink-2">{workoutDescription(w)}</pre>
          </details>
        </div>
      </div>
    </div>
  )
}

function insertBeforeCooldown(sections: Section[], s: Section): Section[] {
  const i = sections.findIndex((x) => /cool/i.test(x.name))
  if (i < 0) return [...sections, s]
  return [...sections.slice(0, i), s, ...sections.slice(i)]
}

function StepRow({ step, onChange, onDelete }: { step: Step; onChange: (p: Partial<Step>) => void; onDelete: () => void }) {
  const [dur, setDur] = useState(toClock(step.durationSec))
  useEffect(() => setDur(toClock(step.durationSec)), [step.durationSec])
  const commitDur = () => {
    const v = parseClock(dur)
    if (v && v > 0) onChange({ durationSec: v })
    else setDur(toClock(step.durationSec))
  }
  const pctInput = (key: 'lo' | 'hi', label: string) => (
    <input
      className="field field-sm num text-right"
      type="number"
      min={30}
      max={250}
      aria-label={label}
      disabled={step.kind === 'freeride'}
      value={Math.round(step[key] * 100)}
      onChange={(e) => {
        const v = Math.max(30, Math.min(250, Number(e.target.value) || 0)) / 100
        onChange(key === 'lo' && step.kind === 'steady' && step.lo === step.hi ? { lo: v, hi: v } : { [key]: v })
      }}
    />
  )
  return (
    <div className="grid grid-cols-[88px_64px_56px_56px_56px_24px] gap-1.5 items-center min-w-[380px]">
      <select className="field field-sm" aria-label="Type stap" value={step.kind} onChange={(e) => onChange({ kind: e.target.value as Step['kind'] })}>
        <option value="steady">vast</option>
        <option value="ramp">ramp</option>
        <option value="freeride">vrij</option>
      </select>
      <input className="field field-sm num text-right" aria-label="Duur" value={dur} onChange={(e) => setDur(e.target.value)} onBlur={commitDur} onKeyDown={(e) => e.key === 'Enter' && commitDur()} />
      {pctInput('lo', 'Van %')}
      {pctInput('hi', 'Tot %')}
      <input
        className="field field-sm num text-right"
        type="number"
        min={0}
        max={130}
        aria-label="Cadans"
        value={step.cadence ?? ''}
        onChange={(e) => onChange({ cadence: e.target.value ? Number(e.target.value) : undefined })}
      />
      <button className="btn btn-sm btn-ghost !px-1 !h-7" onClick={onDelete} aria-label="Stap verwijderen">
        ✕
      </button>
    </div>
  )
}
