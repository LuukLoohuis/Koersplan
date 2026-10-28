import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import { Panel } from '../components/ui'
import { fmtDate } from '@shared/util'

export function ConnectPage() {
  const { config, reloadAthletes } = useApp()
  const nav = useNavigate()
  const [remoteId, setRemoteId] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const demo = config?.mode === 'static-demo'

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr(null)
    try {
      const { id } = await api.addAthlete({ remoteId, apiKey: apiKey || undefined, name: name || undefined })
      reloadAthletes()
      nav(`/app/atleet/${id}`)
    } catch (e2) {
      setErr((e2 as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Via de API: dan weet de server welke coach de atleet koppelt
  const [oauthBusy, setOauthBusy] = useState(false)
  const [oauthErr, setOauthErr] = useState<string | null>(null)
  const [invite, setInvite] = useState<{ url: string; expiresAt?: string } | null>(null)
  const connect = async () => {
    setOauthBusy(true)
    setOauthErr(null)
    try {
      location.href = (await api.intervalsConnect()).url
    } catch (e2) {
      setOauthErr((e2 as Error).message)
      setOauthBusy(false)
    }
  }
  const makeInvite = async () => {
    setOauthErr(null)
    try {
      setInvite(await api.intervalsInvite())
    } catch (e2) {
      setOauthErr((e2 as Error).message)
    }
  }

  return (
    <div className="grid gap-6 max-w-[900px]">
      <header>
        <div className="eyebrow">intervals.icu</div>
        <h1 className="text-[26px] font-semibold tracking-tight m-0 mt-1">Atleet koppelen</h1>
        <p className="text-muted max-w-[70ch]">
          Koersplan leest activiteiten, wellness en fitness uit intervals.icu en zet goedgekeurde workouts in de kalender van de atleet. Garmin, Wahoo en Zwift synchroniseren vanaf daar.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="Via OAuth (aanbevolen)">
          <p className="text-[13px] text-muted mt-0">De atleet logt in bij intervals.icu en geeft toestemming voor: activiteiten lezen, wellness lezen, kalender schrijven.</p>
          {config?.oauthEnabled ? (
            <div className="grid gap-3">
              <button className="btn btn-primary justify-self-start" onClick={() => void connect()} disabled={oauthBusy}>
                {oauthBusy ? 'Naar intervals.icu…' : 'Koppel een atleet'}
              </button>
              <div>
                <div className="eyebrow mb-1">Uitnodigingslink voor atleten</div>
                {invite ? (
                  <>
                    <code className="num text-[11.5px] break-all bg-raised rounded px-2 py-1 block select-all">{invite.url}</code>
                    {invite.expiresAt && <p className="text-[12px] text-muted m-0 mt-1">Geldig tot {fmtDate(invite.expiresAt.slice(0, 10), true)}. Wie hem gebruikt, wordt jouw atleet.</p>}
                  </>
                ) : (
                  <button className="btn btn-sm" onClick={() => void makeInvite()}>
                    Maak uitnodigingslink
                  </button>
                )}
              </div>
              {oauthErr && <p className="text-crit text-[13px] m-0">{oauthErr}</p>}
            </div>
          ) : (
            <ol className="text-[13px] text-muted pl-4 m-0 grid gap-1.5">
              <li>
                Vraag een OAuth-app aan op <a href="https://intervals.icu/oauth/apply" target="_blank" rel="noreferrer">intervals.icu/oauth/apply</a>.
              </li>
              <li>
                Redirect-URI: <code className="num text-[12px]">http://localhost:8787/auth/intervals/callback</code>
              </li>
              <li>
                Zet <code className="num text-[12px]">INTERVALS_CLIENT_ID</code> en <code className="num text-[12px]">INTERVALS_CLIENT_SECRET</code> in <code>.env</code> en herstart.
              </li>
            </ol>
          )}
        </Panel>

        <Panel title="Via API-key (snel testen)">
          {demo ? (
            <p className="text-[13px] text-muted mt-0">In deze demo kun je geen echte atleten koppelen. Draai de app lokaal met je eigen intervals.icu API-key.</p>
          ) : (
            <form onSubmit={add} className="grid gap-3">
              <p className="text-[13px] text-muted m-0">
                Gebruik je eigen key (intervals.icu → Settings → Developer). Als coach kun je zo ook atleten openen die jou als coach hebben toegevoegd. Athlete id <code className="num">0</code> = jezelf.
              </p>
              <label className="grid gap-1.5">
                <span className="eyebrow">Athlete id</span>
                <input id="c-id" className="field num" placeholder="bv. i123456 of 0" value={remoteId} onChange={(e) => setRemoteId(e.target.value)} required />
              </label>
              <label className="grid gap-1.5">
                <span className="eyebrow">API-key {config?.apiKeyEnabled && <span className="normal-case tracking-normal">(leeg = key uit .env)</span>}</span>
                <input id="c-key" className="field num" type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required={!config?.apiKeyEnabled} />
              </label>
              <label className="grid gap-1.5">
                <span className="eyebrow">Naam (optioneel)</span>
                <input id="c-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {err && <p className="text-crit text-[13px] m-0">{err}</p>}
              <button className="btn btn-primary justify-self-start" disabled={busy}>
                {busy ? 'Controleren…' : 'Koppel atleet'}
              </button>
            </form>
          )}
        </Panel>
      </div>

      <Panel title="Waarom geen Strava?">
        <p className="text-[13px] text-muted m-0 max-w-[80ch]">
          De Strava API-voorwaarden verbieden het gebruik van Strava-data in AI-toepassingen en het tonen van iemands data aan een ander (zoals een coach). Laat atleten Garmin of Wahoo daarom
          rechtstreeks aan intervals.icu koppelen. Ritten die alleen via Strava binnenkomen zijn vaak niet via de API beschikbaar.
        </p>
      </Panel>
    </div>
  )
}
