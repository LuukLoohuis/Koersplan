import { useEffect, useState } from 'react'

// Koerslijn (design-system/components/Koerslijn): de route met een waypoint per dag.
// Uitgezet = gestippeld ijs-teal; een bijgestuurde dag wordt brons; bij Bevestigen
// tekent de bronslijn zichzelf over de gestippelde heen en landt de coach op de route.

const W = 520
const H = 52
const WAVE = [32, 25, 29, 21, 27, 20, 25]

function pathThrough(pts: [number, number][]) {
  let d = `M${pts[0][0]} ${pts[0][1]}`
  for (let k = 0; k < pts.length - 1; k++) {
    const p0 = pts[k - 1] ?? pts[k]
    const p1 = pts[k]
    const p2 = pts[k + 1]
    const p3 = pts[k + 2] ?? p2
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]} ${p2[1]}`
  }
  return d
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function Koerslijn({
  labels,
  changed,
  confirmed,
  animate = false,
  coachInitials,
  by = 'ai',
}: {
  labels: string[]
  changed: boolean[]
  confirmed: boolean
  /** Bij de overgang naar bevestigd: de bronslijn tekent zichzelf (±1,1 s) */
  animate?: boolean
  coachInitials?: string
  /** Wie de koers uitzette: de AI (ijs-teal) of de regelgenerator (neutraal) */
  by?: 'ai' | 'regels'
}) {
  // alleen een koers van de AI krijgt de AI-stem; een voorstel van de regels is neutraal
  const proposal = by === 'regels' ? 'var(--chart-plan)' : undefined
  const n = labels.length
  const pts = labels.map((_, i) => [22 + (i * (W - 44)) / Math.max(1, n - 1), WAVE[i % WAVE.length]] as [number, number])
  const d = pathThrough(pts)
  const instant = !animate || reducedMotion()
  // avatar landt pas na de lijn
  const [landed, setLanded] = useState(confirmed)
  useEffect(() => {
    if (!confirmed) return setLanded(false)
    if (instant) return setLanded(true)
    const t = setTimeout(() => setLanded(true), 1000)
    return () => clearTimeout(t)
  }, [confirmed, instant])
  const last = pts[pts.length - 1]

  return (
    <svg className="koerslijn block w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={confirmed ? 'Koers bevestigd' : `Koers uitgezet, ${changed.filter(Boolean).length} dagen bijgestuurd`}>
      <path className="route-ai" d={d} style={proposal ? { stroke: proposal } : undefined} />
      <path
        className="route-coach"
        d={d}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={confirmed ? 0 : 1}
        style={{ transition: instant ? 'none' : 'stroke-dashoffset 1.1s ease-in-out' }}
      />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle
            className={`wp ${confirmed || changed[i] ? 'wp-done' : ''}`}
            cx={x}
            cy={y}
            r={5}
            style={{ transition: instant ? 'none' : 'fill .3s, stroke .3s', ...(proposal && !(confirmed || changed[i]) ? { stroke: proposal } : {}) }}
          />
          <text className="wp-label" x={x} y={y - 11}>
            {labels[i]}
          </text>
        </g>
      ))}
      {coachInitials && (
        <g opacity={landed ? 1 : 0} style={{ transition: instant ? 'none' : 'opacity .3s' }}>
          <circle cx={last[0]} cy={last[1]} r={11} fill="var(--coach)" style={{ filter: 'drop-shadow(0 0 5px var(--coach))' }} />
          <text x={last[0]} y={last[1] + 3.5} textAnchor="middle" className="font-sans text-[10px] font-semibold" fill="var(--on-coach)">
            {coachInitials}
          </text>
        </g>
      )}
    </svg>
  )
}
