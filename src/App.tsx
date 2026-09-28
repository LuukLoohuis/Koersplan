import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import type { AppConfig, AthleteSummary } from '@shared/types'
import { api } from './api'
import { RosterPage } from './pages/Roster'
import { AthletePage } from './pages/Athlete'
import { PortalPage } from './pages/Portal'
import { ConnectPage } from './pages/Connect'
import { formState } from './lib/theme'
import { Wordmark } from './components/ui'

interface Ctx {
  config: AppConfig | null
  athletes: AthleteSummary[] | null
  reloadAthletes: () => void
}
const AppCtx = createContext<Ctx>({ config: null, athletes: null, reloadAthletes: () => {} })
export const useApp = () => useContext(AppCtx)

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [athletes, setAthletes] = useState<AthleteSummary[] | null>(null)
  const reloadAthletes = () => api.athletes().then(setAthletes).catch(() => setAthletes([]))
  useEffect(() => {
    api.config().then(setConfig).catch(() => setConfig(null))
    reloadAthletes()
  }, [])

  // De app onder /app. Op Vercel vangt vercel.json /app/* op (SPA-fallback).
  return (
    <AppCtx.Provider value={{ config, athletes, reloadAthletes }}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/app" replace />} />
          <Route path="/app/portaal/:id" element={<PortalPage />} />
          <Route
            path="/app/*"
            element={
              <Shell>
                <Routes>
                  <Route index element={<RosterPage />} />
                  <Route path="atleet/:id" element={<AthletePage />} />
                  <Route path="koppelen" element={<ConnectPage />} />
                </Routes>
              </Shell>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppCtx.Provider>
  )
}

function Shell({ children }: { children: ReactNode }) {
  const { athletes, config } = useApp()
  const loc = useLocation()
  const [open, setOpen] = useState(false)
  useEffect(() => setOpen(false), [loc.pathname])

  return (
    <div className="min-h-screen md:grid md:grid-cols-[248px_1fr]">
      <aside className="border-b md:border-b-0 md:border-r border-line bg-surface md:sticky md:top-0 md:h-screen flex flex-col">
        <div className="flex items-center justify-between px-4 h-14 md:h-16">
          <NavLink to="/app" className="flex items-center gap-2.5 no-underline text-ink">
            <Wordmark />
            <span className="chip !h-5 !text-[10.5px]">coach</span>
          </NavLink>
          <button className="btn btn-sm btn-ghost md:hidden" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            Atleten
          </button>
        </div>
        <nav className={`${open ? 'block' : 'hidden'} md:flex flex-col flex-1 min-h-0 px-2 pb-3`}>
          <NavLink to="/app" end className={navCls}>
            Overzicht
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
        </nav>
      </aside>
      <main className="min-w-0 px-4 md:px-8 py-6 md:py-8 max-w-[1400px]">{children}</main>
    </div>
  )
}

const navCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 h-9 px-3 rounded-lg text-[13px] no-underline ${isActive ? 'bg-raised text-ink font-medium' : 'text-muted hover:bg-raised'}`
