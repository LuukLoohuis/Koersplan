import { createContext, useContext, useEffect, useState } from 'react'

const KEYS = [
  'text',
  'text-muted',
  'line',
  'surface',
  'surface-raised',
  'chart-ctl',
  'chart-atl',
  'chart-wbal',
  'chart-plan',
  'chart-tsb-pos',
  'chart-tsb-neg',
  'delta-pos',
  'warn',
  'delta-neg',
  'zone-1',
  'zone-2',
  'zone-3',
  'zone-4',
  'zone-5',
  'zone-6',
  'zone-7',
  'ai',
  'coach',
] as const
export type Colors = Record<(typeof KEYS)[number], string>

export type Theme = 'light' | 'dark'

/** Thema van een subboom met eigen data-theme (bv. het donkere atletenportaal). Leeg = het thema van <html>. */
export const ThemeContext = createContext<Theme | null>(null)

const probes = new Map<Theme, HTMLElement>()

/** Een onzichtbaar element met data-theme, zodat we de tokens van dat thema kunnen uitlezen. */
function probe(theme: Theme): HTMLElement {
  let el = probes.get(theme)
  if (!el || !el.isConnected) {
    el = document.createElement('div')
    el.dataset.theme = theme
    el.hidden = true
    document.body.appendChild(el)
    probes.set(theme, el)
  }
  return el
}

function read(scope: Theme | null): Colors {
  const cs = getComputedStyle(scope ? probe(scope) : document.documentElement)
  return Object.fromEntries(KEYS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()])) as Colors
}

/** Leest de themakleuren (licht/donker) voor Recharts/SVG en volgt wijzigingen van data-theme op <html>. */
export function useColors(): Colors {
  const scope = useContext(ThemeContext)
  const [c, setC] = useState<Colors>(() => read(scope))
  useEffect(() => {
    const update = () => setC(read(scope))
    update()
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [scope])
  return c
}

export const zoneColor = (c: Colors, z: number) => c[`zone-${Math.min(7, Math.max(1, z + 1))}` as keyof Colors]

/** Vorm (TSB) als status, met de zones uit het design system. */
export function formState(tsb: number): { label: string; tone: 'good' | 'accent' | 'crit' | '' } {
  if (tsb > 20) return { label: 'Overgang', tone: '' }
  if (tsb > 5) return { label: 'Fris', tone: 'good' }
  if (tsb > -10) return { label: 'Grijze zone', tone: '' }
  if (tsb >= -30) return { label: 'Optimaal', tone: 'accent' } // −30…−10; Hoog risico is < −30
  return { label: 'Hoog risico', tone: 'crit' }
}
