import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom'
import type { AppConfig, AthleteSummary, Me } from '@shared/types'
import { api, setApiAuth } from './api'
import { RosterPage } from './pages/Roster'
import { AthletePage } from './pages/Athlete'
import { PortalPage } from './pages/Portal'
import { ConnectPage } from './pages/Connect'
import { HomePage } from './pages/Home'
import { LoginPage } from './pages/Login'
import { accessToken, initAuth, signOut } from './lib/auth'
import { formState } from './lib/theme'
import { Wordmark } from './components/ui'

/** laden: nog onbekend · uit: geen login nodig (lokaal, demo) · ingelogd · uitgelogd */
export type AuthState = 'laden' | 'uit' | 'ingelogd' | 'uitgelogd'

interface Ctx {
  config: AppConfig | null
  auth: AuthState
  me: Me | null
  /** Ingelogd, maar de API weigert (bv. nog geen profiel) */
  meError: string | null
  athletes: AthleteSummary[] | null
  reloadAthletes: () => void
}
const AppCtx = createContext<Ctx>({ config: null, auth: 'laden', me: null, meError: null, athletes: null, reloadAthletes: () => {} })
export const useApp = () => useContext(AppCtx)

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [auth, setAuth] = useState<AuthState>('laden')
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState<string | null>(null)
  const [athletes, setAthletes] = useState<AthleteSummary[] | null>(null)
  // één verzoek tegelijk; een mislukte herlaadpoging laat de bestaande lijst staan
  const inflight = useRef<Promise<void> | null>(null)
  const reloadAthletes = () => {
    inflight.current ??= api
      .athletes()
      .then(setAthletes)
      .catch(() => setAthletes((prev) => prev ?? []))
      .finally(() => {
        inflight.current = null
      })
  }

  useEffect(() => {
    let unsub = () => {}
    api
      .config()
      .then(async (cfg) => {
        setConfig(cfg)
        if (!cfg.auth) return setAuth('uit')
        const sb = initAuth(cfg.auth)
        setApiAuth({ token: accessToken, onUnauthorized: () => void signOut() })
        // wacht ook op het inwisselen van een inloglink (?code=… in de URL)
        const { data } = await sb.auth.getSession()
        setAuth(data.session ? 'ingelogd' : 'uitgelogd')
        unsub = sb.auth.onAuthStateChange((_e, s) => setAuth(s ? 'ingelogd' : 'uitgelogd')).data.subscription.unsubscribe
      })
      .catch(() => {
        setConfig(null)
        setAuth('uit')
      })
    return () => unsub()
  }, [])

  // Pas na het inloggen (of zonder login) de atleten en de gebruiker ophalen
  useEffect(() => {
    if (auth !== 'ingelogd' && auth !== 'uit') {
      setAthletes(null)
      setMe(null)
      setMeError(null)
      return
    }
    reloadAthletes()
    api
      .me()
      .then((m) => {
        setMe(m)
        setMeError(null)
      })
      .catch((e) => setMeError((e as Error).message))
  }, [auth])

  // Homepagina op /, de app onder /app. Op Vercel vangt vercel.json /app/* op (SPA-fallback).
  return (
    <AppCtx.Provider value={{ config, auth, me, meError, athletes, reloadAthletes }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/app/inloggen" element={<LoginPage />} />
          <Route
            path="/app/portaal/:id"
            element={
              <RequireLogin>
                <PortalPage />
              </RequireLogin>
            }
          />
          <Route
            path="/app/*"
            element={
              <RequireLogin>
                <Shell>
                  <Routes>
                    <Route index element={<RosterPage />} />
                    <Route path="atleet/:id" element={<AthleteRoute />} />
                    <Route path="koppelen" element={<ConnectPage />} />
                  </Routes>
                </Shell>
              </RequireLogin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppCtx.Provider>
  )
}

/** Met login: eerst inloggen, daarna terug naar deze pagina. */
function RequireLogin({ children }: { children: ReactNode }) {
  const { auth } = useApp()
  const loc = useLocation()
  if (auth === 'laden') return <div className="p-6 text-muted">Laden…</div>
  if (auth === 'uitgelogd') return <Navigate to={`/app/inloggen?terug=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

/** Per atleet een nieuwe pagina: late antwoorden van de vorige atleet komen zo nooit bij de volgende terecht. */
function AthleteRoute() {
  const { id } = useParams()
  return <AthletePage key={id} />
}

const ROLE_LABEL: Record<Me['role'], string> = { admin: 'admin', coach: 'coach', athlete: 'atleet' }

function Shell({ children }: { children: ReactNode }) {
  const { athletes, config, auth, me, meError } = useApp()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [loc.pathname])

  // Een atleet heeft geen coachweergave: meteen naar het eigen portaal
  if (me?.role === 'athlete' && athletes?.length) return <Navigate to={`/app/portaal/${athletes[0].id}`} replace />

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-line bg-surface md:sticky md:top-0 md:h-screen flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 md:h-16">
          <NavLink to="/app" className="flex items-center gap-2.5 no-underline text-ink">
            <Wordmark />
            <span className="chip !h-5 !text-[10.5px]">{me && me.role !== 'coach' ? ROLE_LABEL[me.role] : 'coach'}</span>
          </NavLink>
          <button className="btn btn-sm btn-ghost md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Atleten
          </button>
        </div>
        <nav className={`${open ? 'block' : 'hidden'} md:flex flex-col flex-1 min-h-0 px-2 pb-3`}>
          <NavLink to="/app" end className={navCls}>
            Mijn atleten
          </NavLink>
          <div className="eyebrow px-3 mt-4 mb-1.5">Atleten</div>
          <div className="flex-1 overflow-auto">
            {athletes === null && <div className="px-3 text-muted text-xs">Laden…</div>}
            {athletes?.map((a) => {
              const st = formState(a.tsb)
              return (
                <NavLink key={a.id} to={`/app/atleet/${a.id}`} className={navCls}>
                  <span className="truncate">{a.name}</span>
                  <span className="ml-auto flex items-center gap-1.5">
                    {a.flags.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-warn" title={a.flags.join(', ')} />}
                    <span className={`num text-[11.5px] ${st.tone === 'crit' ? 'text-crit' : 'text-muted'}`}>{a.tsb > 0 ? '+' : ''}{Math.round(a.tsb)}</span>
                  </span>
                </NavLink>
              )
            })}
          </div>
          <NavLink to="/app/koppelen" className={navCls}>
            + Atleet koppelen
          </NavLink>
          <div className="px-3 pt-3 mt-2 border-t border-line text-[11px] text-muted leading-relaxed">
            {config?.mode === 'static-demo' ? (
              <>Demo met voorbeelddata. Publiceren wordt gesimuleerd.</>
            ) : (
              <>
                intervals.icu: {config?.oauthEnabled ? 'OAuth' : config?.apiKeyEnabled ? 'API-key' : 'niet gekoppeld'}
                <br />
                AI: {config?.aiEnabled ? config.aiModel : 'regelgebaseerd'}
              </>
            )}
          </div>
          {auth === 'ingelogd' && (
            <div className="px-3 pt-3 mt-3 border-t border-line flex items-center gap-2 text-[12px]">
              <span className="truncate text-muted" title={me?.email}>
                {me?.name ?? me?.email ?? '…'}
              </span>
              <button className="btn btn-sm btn-ghost ml-auto shrink-0" onClick={() => void signOut()}>
                Uitloggen
              </button>
            </div>
          )}
        </nav>
      </aside>
      <main className="min-w-0 px-4 md:px-8 py-6 md:py-8 max-w-[1400px]">
        {meError ? (
          <div className="panel p-6 grid gap-3 max-w-[560px]">
            <h1 className="text-[20px] font-semibold m-0">Geen toegang</h1>
            <p className="text-muted m-0">{meError}</p>
            <button className="btn justify-self-start" onClick={() => void signOut()}>
              Uitloggen
            </button>
          </div>
        ) : (
          children
        )}
      </main>
    </div>
  )
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] no-underline ${isActive ? 'bg-raised text-ink font-medium' : 'text-muted hover:bg-raised'}`
