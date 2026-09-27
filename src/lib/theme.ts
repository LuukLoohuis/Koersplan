import { useEffect, useState } from 'react'

const KEYS = ['text', 'text-2', 'muted', 'line', 'surface', 'raised', 'ctl', 'atl', 'wbal', 'plan', 'tsb-pos', 'tsb-neg', 'good', 'warn', 'crit', 'z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7'] as const
export type Colors = Record<(typeof KEYS)[number], string>

function read(): Colors {
  const cs = getComputedStyle(document.documentElement)
  return Object.fromEntries(KEYS.map((k) => [k, cs.getPropertyValue(`--${k}`).trim()])) as Colors
}

/** Leest de themakleuren (licht/donker) voor Recharts/SVG en volgt wijzigingen. */
export function useColors(): Colors {
  const [c, setC] = useState<Colors>(read)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const update = () => setC(read())
    mq.addEventListener('change', update)
    const mo = new MutationObserver(update)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', update)
      mo.disconnect()
    }
  }, [])
  return c
}

export const zoneColor = (c: Colors, z: number) => c[`z${Math.min(7, Math.max(1, z + 1))}` as keyof Colors]

/** Vorm (TSB) als status, zoals op een PMC. */
export function formState(tsb: number): { label: string; tone: 'good' | 'warn' | 'crit' | 'accent' | '' } {
  if (tsb < -30) return { label: 'Overbelast', tone: 'crit' }
  if (tsb < -10) return { label: 'Productief', tone: 'good' }
  if (tsb <= 5) return { label: 'Neutraal', tone: '' }
  if (tsb <= 25) return { label: 'Fris', tone: 'accent' }
  return { label: 'Detraining', tone: 'warn' }
}
