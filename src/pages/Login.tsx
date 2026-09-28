import { useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Check, LoaderCircle, Mail } from 'lucide-react'
import { demoOverview } from '@shared/demoData'
import { useApp } from '../App'
import { sendLoginLink } from '../lib/auth'
import { Wordmark } from '../components/ui'

/** Alleen terug naar een pagina in de app, nooit naar een ander domein. */
const safeBack = (v: string | null) => (v && /^\/app(\/|$|\?)/.test(v) ? v : '/app')

// Terug van intervals.icu na een uitnodiging (de atleet heeft dan nog geen account)
const KOPPELING: Record<string, { tone: 'good' | 'warn'; text: string }> = {
  gelukt: { tone: 'good', text: 'Je intervals.icu-account hangt nu aan VELORIQ. Je coach ziet je ritten en zet je eerste koers uit.' },
  geweigerd: { tone: 'warn', text: 'Je gaf bij intervals.icu geen toestemming. Er is niets gekoppeld.' },
  verlopen: { tone: 'warn', text: 'Deze uitnodiging is verlopen of ongeldig. Vraag je coach om een nieuwe link.' },
}

/** Inloggen met een e-maillink. Split-screen volgens design-system/components/Auth. */
export function LoginPage() {
  const { auth } = useApp()
  const [search] = useSearchParams()
  const back = safeBack(search.get('terug'))
  const koppeling = KOPPELING[search.get('koppeling') ?? '']
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle')
  const [err, setErr] = useState<string | null>(null)

  if (auth === 'ingelogd' || auth === 'uit') return <Navigate to={back} replace />

  const send = async (e?: FormEvent) => {
    e?.preventDefault()
    setState('busy')
    setErr(null)
    try {
      await sendLoginLink(email.trim(), back)
      setState('sent')
    } catch (e2) {
      setErr((e2 as Error).message)
      setState('idle')
    }
  }

  return (
    <div className="min-h-screen md:grid md:grid-cols-2">
      <aside data-theme="dark" className="contour bg-bg text-ink px-6 py-6 md:px-12 md:py-10 flex flex-col">
        <Wordmark className="text-[18px]" />
        <div className="hidden md:block mt-10 max-w-[440px]">
          <MiniForm />
        </div>
        <figure className="hidden md:block mt-auto m-0 max-w-[420px]">
          <blockquote className="m-0 font-serif italic text-[22px] leading-[1.3] text-coach">“De AI ziet wat je reed. Ik zie wat je nodig hebt.”</blockquote>
          <figcaption className="font-mono text-[12px] text-muted mt-2.5">Ruud Verhoeven · coach in Utrecht</figcaption>
        </figure>
      </aside>

      <main data-theme="light" className="bg-bg text-ink grid place-items-center px-4 py-10 md:p-10">
        <div className="w-full max-w-[360px] grid gap-4">
          {koppeling && (
            <Notice tone={koppeling.tone}>{koppeling.text}</Notice>
          )}

          {state === 'sent' ? (
            <div className="panel contour p-7 text-center">
              <div className="w-11 h-11 rounded-full bg-accent-soft text-accent-text grid place-items-center mx-auto mb-3.5">
                <Mail size={20} strokeWidth={1.5} aria-hidden />
              </div>
              <h1 className="text-[24px] font-bold tracking-[-0.02em]">Check je mail</h1>
              <p className="text-muted mt-1.5 mb-4">
                We stuurden een inloglink naar <b className="text-ink">{email.trim()}</b>. Open hem in deze browser.
              </p>
              <div className="flex justify-center gap-2">
                <button className="btn" onClick={() => void send()}>
                  Opnieuw versturen
                </button>
                <button className="btn btn-ghost" onClick={() => setState('idle')}>
                  Ander adres
                </button>
              </div>
              <p className="font-mono text-[11px] text-muted mt-3 mb-0">Niets ontvangen? Kijk in je spam.</p>
            </div>
          ) : (
            <form onSubmit={send} className="grid gap-3" noValidate>
              <div>
                <h1 className="text-[30px] font-bold tracking-[-0.02em]">Inloggen</h1>
                <p className="text-muted mt-1.5 mb-2">
                  {search.get('koppeling') === 'gelukt' ? 'Heb je al een account? Log dan in. Anders kun je dit venster sluiten.' : 'Welkom terug. Je koers staat klaar.'}
                </p>
              </div>
              <div>
                <label className="label" htmlFor="login-email">
                  E-mail
                </label>
                <input
                  id="login-email"
                  className="field"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={err ? true : undefined}
                  aria-describedby={err ? 'login-err' : undefined}
                />
                {err && (
                  <div id="login-err" className="hint hint-error" role="alert">
                    {err}
                  </div>
                )}
              </div>
              <button className="btn btn-primary btn-lg justify-center" disabled={state === 'busy' || !/.+@.+\..+/.test(email.trim())}>
                {state === 'busy' ? (
                  <>
                    <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden />
                    Link versturen…
                  </>
                ) : (
                  'Stuur me een inloglink'
                )}
              </button>
              <p className="text-[12.5px] text-muted text-center m-0">Geen wachtwoord nodig. Nog geen account? Je coach nodigt je uit.</p>
            </form>
          )}
        </div>
      </main>
    </div>
  )
}

function Notice({ tone, children }: { tone: 'good' | 'warn'; children: ReactNode }) {
  const Icon = tone === 'good' ? Check : AlertTriangle
  return (
    <div className={`flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px] ${tone === 'good' ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`} role="status">
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        <b>{tone === 'good' ? 'Gekoppeld.' : 'Niet gekoppeld.'}</b> {children}
      </span>
    </div>
  )
}

/** Vorm van een demo-atleet over 28 dagen, met de zones Optimaal en Fris. Op het donkere paneel. */
function MiniForm() {
  const values = demoOverview('demo-sanne')?.athlete.formSeries28 ?? []
  if (values.length < 2) return null
  const W = 416
  const H = 120
  const x = (i: number) => 8 + (i / (values.length - 1)) * (W - 16)
  const y = (v: number) => 10 + ((20 - v) / 50) * (H - 20)
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const last = values[values.length - 1]
  return (
    <div className="panel p-3">
      <div className="eyebrow mb-2">Sanne · vorm deze maand</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Vormlijn over 28 dagen, nu ${Math.round(last)}`}>
        <rect x={8} y={y(-10)} width={W - 16} height={y(-30) - y(-10)} fill="var(--accent)" opacity={0.09} />
        <rect x={8} y={y(20)} width={W - 16} height={y(5) - y(20)} fill="var(--delta-pos)" opacity={0.08} />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(values.length - 1)} cy={y(last)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />
      </svg>
    </div>
  )
}
