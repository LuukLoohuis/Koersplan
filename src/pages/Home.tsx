import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { pmcFromLoads } from '@shared/metrics'
import { Wordmark } from '../components/ui'
import banner from '../../design-system/assets/Banner/veloriq-banner.jpg'
import './Home.css'

// Homepage uit design-system/components/Homepage, in het lichte thema (ivoor, diep teal, goud uit het logo).
// Alleen de mini-vormgrafiek in de hero staat op het donkere paneel: grafieken altijd op donker.

export function HomePage() {
  return (
    <div className="home">
      <header className="hm-nav">
        <div className="hm-wrap hm-nav-in">
          <Link to="/" aria-label="VELORIQ, naar boven">
            <Wordmark className="text-[18px]" />
          </Link>
          <nav className="hm-links" aria-label="Homepage">
            <a href="#hoe">Hoe het werkt</a>
            <a href="#coaches">Coaches</a>
            <a href="#prijzen">Prijzen</a>
          </nav>
          <span className="hm-sp" />
          <Link to="/app" className="hm-login">
            Inloggen
          </Link>
          <Link className="btn btn-primary btn-sm no-underline" to="/app/koppelen">
            Start je koers
          </Link>
        </div>
      </header>

      <main>
        <section className="hm-hero contour">
          <div className="hm-wrap hm-hero-in">
            <div>
              <div className="eyebrow hm-hero-eyebrow">Trainen met AI én een echte coach</div>
              <h1 className="hm-hero-h">
                AI rekent.
                <br />
                Je coach beslist.
              </h1>
              <p className="hm-hero-p">
                Koppel Intervals.icu. De AI leest je belasting, vorm en herstel en zet je koers voor de week uit. Je coach stuurt bij,
                bevestigt, en de training staat op je fietscomputer.
              </p>
              <div className="hm-cta">
                <Link className="btn btn-primary btn-lg no-underline" to="/app/koppelen">
                  Start je koers
                </Link>
                <a className="btn btn-lg no-underline" href="#prijzen">
                  Bekijk prijzen
                </a>
              </div>
              <div className="hm-meta num">Werkt met Intervals.icu · Garmin · Wahoo · Zwift</div>
            </div>
            <HeroDemo />
          </div>
        </section>

        <section className="hm-banner">
          <img src={banner} alt="VELORIQ — AI Coaching met persoonlijke benadering. Betere koersen beginnen bij jou." width={2172} height={724} />
        </section>

        <section className="hm-sec" id="hoe">
          <div className="hm-wrap">
            <h2 className="hm-sec-h">Hoe het werkt</h2>
            <p className="hm-sec-p">Vier waypoints, elke week opnieuw.</p>
            <ol className="hm-how">
              <Step k="01 · Koppel" title="Koppel Intervals.icu" text="Daarmee ook Garmin, Wahoo en Zwift. Activiteiten, belasting, conditie, vermoeidheid, vorm en FTP komen automatisch binnen. Eén keer koppelen, daarna nooit meer uploaden.">
                <div className="hm-row">
                  <span className="chip chip-good">
                    <Icon.Check /> Verbonden
                  </span>
                  <span className="num hm-small">laatste sync 07:42 · 1.284 ritten</span>
                </div>
                <div className="num hm-small hm-mt">FTP 292 W · 68 kg · 4,29 W/kg</div>
              </Step>
              <Step k="02 · Analyse" title="De AI leest je data" text="Belasting, vorm, herstel en je doelen. Niet alleen wat je reed, maar wat het met je conditie deed en wat er nog in zit richting je A-koers.">
                <div className="voice-ai">
                  Vorm −13 (Optimaal) · helling +4,1/wk · 34 dagen tot Amstel Gold Race. Ruimte voor één drempelsessie; herstel op woensdag houdt de
                  vermoeidheid onder 75.
                </div>
              </Step>
              <Step k="03 · Koers" title="Je koers voor de week wordt uitgezet" text={'Zeven waypoints, met per training de duur, de intensiteit en de onderbouwing. Uitklapbaar: "Waarom deze koers".'}>
                <svg viewBox="0 0 320 60" className="hm-route" aria-hidden="true">
                  <path d="M12 44 C 50 40, 70 16, 110 22 S 180 50, 220 30 S 280 10, 308 18" />
                  {[
                    [12, 44],
                    [60, 30],
                    [110, 22],
                    [160, 38],
                    [220, 30],
                    [268, 16],
                    [308, 18],
                  ].map(([cx, cy]) => (
                    <circle key={cx} cx={cx} cy={cy} r={4} />
                  ))}
                </svg>
                <span className="chip chip-ai hm-mt">
                  <Icon.Dots /> Uitgezet · 7 trainingen · <span className="num">502 TSS</span>
                </span>
              </Step>
              <Step k="04 · Bevestigd" title="Je coach stuurt bij en bevestigt" text="Een echte coach bekijkt elke koers, schuift wat moet schuiven en bevestigt. Pas dan staat het in je schema en gaat het naar je fietscomputer.">
                <div className="voice-coach">
                  <div className="avatar">RV</div>
                  <div>
                    <div className="who">Ruud stuurde bij · za 27 sep</div>
                    <div className="note">VO2 naar zaterdag, donderdag rustig duur. Je slaap was matig.</div>
                  </div>
                </div>
                <div className="hm-row hm-mt">
                  <span className="chip chip-coach-solid">
                    <Icon.Check /> Bevestigd
                  </span>
                  <span className="chip">
                    <Icon.Device /> Op je fietscomputer
                  </span>
                </div>
              </Step>
            </ol>
          </div>
        </section>

        <section className="hm-sec hm-alt" id="coaches">
          <div className="hm-wrap">
            <h2 className="hm-sec-h">Onze coaches</h2>
            <p className="hm-sec-p">Echte mensen, met een eigen kijk. Je kiest zelf.</p>
            <div className="hm-coaches">
              {COACHES.map((c) => (
                <article key={c.name} className="panel hm-coach">
                  {/* Plaatshouder tot er echte coachfoto's zijn */}
                  <div className="hm-coach-ph" aria-hidden="true">
                    {c.initials}
                  </div>
                  <div>
                    <h3 className="hm-coach-n">{c.name}</h3>
                    <div className="hm-coach-loc">
                      <Icon.Pin /> {c.city}
                    </div>
                    <div className="hm-row hm-wrap-row">
                      {c.tags.map((t) => (
                        <span key={t} className="chip">
                          {t}
                        </span>
                      ))}
                    </div>
                    <p className="hm-coach-q">“{c.quote}”</p>
                    <div className="hm-coach-f">
                      <span className={c.full ? 'chip' : 'chip chip-accent'}>{c.spots}</span>
                      <Link className="btn btn-sm no-underline" to="/app/koppelen">
                        {c.full ? 'Bekijk profiel' : `Train met ${c.name.split(' ')[0]}`}
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="hm-sec" id="prijzen">
          <div className="hm-wrap">
            <h2 className="hm-sec-h">Prijzen</h2>
            <p className="hm-sec-p">Maandelijks opzegbaar. Eerste koers gratis.</p>
            <div className="hm-pricing">
              <Price
                name="VELORIQ AI"
                price="€9,99"
                intro="Voor wie zelf stuurt, met een AI die elke rit meeleest."
                items={['AI analyseert na elke rit', 'Wekelijks een nieuwe koers, met "Waarom deze koers"', 'Je bevestigt en schuift zelf', 'Automatisch naar Intervals.icu en je fietscomputer', 'Vormgrafiek met doelprojectie']}
                cta={
                  <Link className="btn btn-lg no-underline" to="/app/koppelen">
                    Start met AI
                  </Link>
                }
              />
              <Price
                coach
                name="VELORIQ Coach"
                price="€29,99"
                intro="Alles van AI, plus een coach die elke koers checkt, bijstuurt en bevestigt."
                items={['Alles van VELORIQ AI', 'Elke koers gecheckt, bijgestuurd en bevestigd door je eigen coach', 'Zelf je coach kiezen', 'Wekelijkse check-in via chat', 'Coachnotities bij je trainingen']}
                cta={
                  <a className="btn btn-coach btn-lg no-underline" href="#coaches">
                    Kies je coach
                  </a>
                }
              />
            </div>
          </div>
        </section>

        <section className="hm-sec hm-faq-sec" aria-labelledby="faq-h">
          <div className="hm-wrap">
            <h2 className="hm-sec-h" id="faq-h">
              Veelgestelde vragen
            </h2>
            <div className="hm-faq">
              {FAQ.map(([q, a]) => (
                <details key={q}>
                  <summary>{q}</summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="hm-foot">
        <div className="hm-wrap hm-foot-in">
          <div>
            <Wordmark className="text-[17px] text-ink" />
            <p>AI rekent. Je coach beslist.</p>
            <span className="num">© 2026 · Utrecht</span>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><a href="#hoe">Hoe het werkt</a></li>
              <li><a href="#coaches">Coaches</a></li>
              <li><a href="#prijzen">Prijzen</a></li>
            </ul>
          </div>
          <div>
            <h4>App</h4>
            <ul>
              <li><Link to="/app">Inloggen</Link></li>
              <li><Link to="/app/koppelen">Intervals.icu koppelen</Link></li>
            </ul>
          </div>
          <div>
            <h4>Over</h4>
            <ul>
              <li><a href="/privacy.html">Privacy</a></li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  )
}

function Step({ k, title, text, children }: { k: string; title: string; text: string; children: ReactNode }) {
  return (
    <li className="hm-step">
      <div>
        <div className="hm-step-k">{k}</div>
        <h3 className="hm-step-t">{title}</h3>
        <p className="hm-step-p">{text}</p>
      </div>
      <div className="hm-step-vis">{children}</div>
    </li>
  )
}

function Price({ name, price, intro, items, cta, coach = false }: { name: string; price: string; intro: string; items: string[]; cta: ReactNode; coach?: boolean }) {
  return (
    <div className={`panel hm-price${coach ? ' hm-price-coach' : ''}`}>
      {coach && <span className="chip chip-coach-solid hm-price-pill">Meest gekozen</span>}
      <div className={`eyebrow${coach ? ' hm-coach-eyebrow' : ''}`}>{name}</div>
      <div className="hm-price-n">
        <span className="num">{price}</span>
        <span className="hm-price-u">p/m</span>
      </div>
      <p className="hm-price-p">{intro}</p>
      <ul className="hm-price-l">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
      {cta}
    </div>
  )
}

const COACHES = [
  { initials: 'RV', name: 'Ruud Verhoeven', city: 'Utrecht', tags: ['weg', 'gravel', 'tijdrijden'], quote: 'Rustig opbouwen, de vorm komt vanzelf.', spots: '3 plekken vrij', full: false },
  { initials: 'MK', name: 'Marieke Kok', city: 'Nijmegen', tags: ['MTB', 'gravel', 'triatlon'], quote: 'Data vertelt wat er gebeurde. Jij vertelt hoe het voelde.', spots: '1 plek vrij', full: false },
  { initials: 'JB', name: 'Jasper de Boer', city: 'Groningen', tags: ['weg', 'klimmen'], quote: 'Een goede week heeft één harde dag te weinig, nooit één te veel.', spots: 'Vol · wachtlijst', full: true },
]

const FAQ: [string, string][] = [
  ['Werkt het zonder Intervals.icu?', 'Nee. Intervals.icu is de databron en de weg naar je fietscomputer. Een gratis account volstaat; Garmin, Wahoo en Zwift koppel je daar.'],
  ['Wat doet de coach precies?', 'Bij VELORIQ Coach bekijkt je coach elk voorstel van de AI vóór het in je schema komt. Wat verandert zie je als "was → wordt", met een korte notitie. Eén keer per week is er een check-in via chat.'],
  ['Hoe snel is een koers bevestigd?', 'Uiterlijk de volgende dag. Zolang de koers bij je coach ligt zie je dat in de app, en blijft je vorige koers staan.'],
  ['Wat gebeurt er met mijn gezondheidsgegevens?', 'Hartslag, HRV en slaap zijn gezondheidsgegevens. We vragen expliciete toestemming, hosten in de EU en trainen geen modellen op jouw data. Opzeggen kan elke maand.'],
]

// ─── Hero: de koers in vier stappen (AI rekent → uitgezet → coach stuurt bij → bevestigd) ───

/** 60 dagen belasting in een 3:1-ritme, vast patroon zodat de grafiek altijd gelijk is. */
const DEMO_LOADS = Array.from({ length: 60 }, (_, i) => {
  const wobble = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1
  return [0, 86, 66, 38, 94, 120, 66][i % 7] * (Math.floor(i / 7) % 4 === 3 ? 0.6 : 1) * (0.92 + wobble * 0.16)
})
const DEMO_PMC = pmcFromLoads('2026-08-01', DEMO_LOADS, 46, 46)
const yMax = Math.max(...DEMO_PMC.map((d) => d.atl)) * 1.05
const px = (i: number) => 16 + (i / 59) * 314
const py = (v: number) => 150 - (v / yMax) * 120
const linePath = (key: 'ctl' | 'atl') => DEMO_PMC.map((d, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(d[key]).toFixed(1)}`).join(' ')
const CTL_PATH = linePath('ctl')
const ATL_PATH = linePath('atl')
const ROUTE = 'M340 112 C 360 100, 372 84, 392 86 S 424 118, 448 100 S 480 70, 504 78'
const WAYPOINTS = [
  [340, 112],
  [366, 96],
  [392, 86],
  [420, 104],
  [448, 100],
  [476, 76],
  [504, 78],
]
const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
const PLAN = [
  ['Rust', ''],
  ['Drempel', 'TSS 88'],
  ['Duur Z2', 'TSS 68'],
  ['VO2max', 'TSS 96'],
  ['Herstel', 'TSS 38'],
  ['Lang', 'TSS 150'],
  ['Duur Z2', 'TSS 66'],
]

type Phase = 0 | 1 | 2 | 3 | 4
/** Wanneer (ms) elke stap begint; daarna begint de lus opnieuw. */
const TIMELINE: [Phase, number][] = [
  [1, 1700],
  [2, 3500],
  [3, 5000],
  [4, 6000],
]
const LOOP_MS = 10200

function HeroDemo() {
  const reduce = useReducedMotion()
  const [cycle, setCycle] = useState(0)
  const [phase, setPhase] = useState<Phase>(0)

  useEffect(() => {
    // Zonder beweging direct de eindstand
    if (reduce) return setPhase(4)
    setPhase(0)
    const timers = TIMELINE.map(([p, ms]) => setTimeout(() => setPhase(p), ms))
    timers.push(setTimeout(() => setCycle((c) => c + 1), LOOP_MS))
    return () => timers.forEach(clearTimeout)
  }, [cycle, reduce])

  const coach = phase >= 2
  const status =
    phase === 0 ? (
      <span className="chip chip-ai">
        <Icon.Dots /> AI rekent…
      </span>
    ) : phase === 1 ? (
      <span className="chip chip-ai">
        <Icon.Dots /> Koers uitgezet
      </span>
    ) : phase < 4 ? (
      <span className="chip chip-coach">
        <Icon.Shift /> Ruud stuurt bij
      </span>
    ) : (
      <span className="chip chip-coach-solid">
        <Icon.Check /> Bevestigd
      </span>
    )
  const caption = ['', 'Koers uitgezet voor week 40 · 7 trainingen · 502 TSS', 'Ruud stuurde bij: donderdag rustiger, je slaap was matig.', 'Ruud stuurde bij: donderdag rustiger, je slaap was matig.', 'Bevestigd door Ruud · za 27 sep · staat op je fietscomputer'][phase]

  return (
    <div className="panel hm-demo" data-theme="dark">
      <div className="hm-demo-top">
        <span className="eyebrow">Sanne · week 40</span>
        <span aria-live="polite">{status}</span>
      </div>
      <svg viewBox="0 0 520 250" className="hm-demo-svg" role="img" aria-label="Voorbeeld: de AI zet de koers voor week 40 uit, coach Ruud schuift donderdag naar een rustige duurrit en bevestigt.">
        <defs>
          <linearGradient id="hm-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".4" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity=".02" />
          </linearGradient>
        </defs>
        <g className="hm-grid">
          {[40, 80, 120].map((y) => (
            <line key={y} x1={16} x2={504} y1={y} y2={y} />
          ))}
        </g>
        <g key={cycle}>
          <path className="hm-area" d={`${CTL_PATH} L330 150 L16 150 Z`} fill="url(#hm-area)" />
          <path className="hm-draw hm-glow" d={CTL_PATH} pathLength={1} fill="none" stroke="var(--accent)" strokeWidth={2} />
          <path className="hm-draw" d={ATL_PATH} pathLength={1} fill="none" stroke="var(--fatigue)" strokeWidth={1.5} />
        </g>
        <line x1={330} x2={330} y1={20} y2={150} className="hm-today-l" />
        <text x={334} y={30} className="hm-today-t">
          vandaag
        </text>

        <g className="hm-fade" style={{ opacity: phase >= 1 ? 1 : 0 }}>
          <path d={ROUTE} fill="none" stroke="var(--ai)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
          <path
            d={ROUTE}
            fill="none"
            stroke="var(--coach)"
            strokeWidth={2.5}
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            className={phase >= 3 ? 'hm-coach-route is-on' : 'hm-coach-route'}
          />
          {WAYPOINTS.map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={4.5} className={`hm-wp${phase === 4 ? ' is-coach' : ''}${i === 3 && coach ? ' is-moved' : ''}`} />
              <text x={x} y={y - 10} className="hm-wl">
                {DAYS[i]}
              </text>
            </g>
          ))}
          <g className="hm-fade" style={{ opacity: coach ? 1 : 0 }}>
            <circle cx={420} cy={104} r={11} fill="var(--coach)" className="hm-glow-c" />
            <text x={420} y={108} textAnchor="middle" className="hm-av-t">
              RV
            </text>
          </g>
        </g>

        <g className="hm-fade" style={{ opacity: phase >= 1 ? 1 : 0 }}>
          {PLAN.map(([name, tss], i) => {
            const x = 16 + i * 70
            const changed = i === 3 && coach
            return (
              <g key={i}>
                <text x={x} y={176} className="hm-wk-d">
                  {DAYS[i]}
                </text>
                <text x={x} y={192} className="hm-wk-n">
                  {changed ? (
                    <>
                      <tspan className="hm-was">VO2</tspan> <tspan className="hm-wordt">Duur</tspan>
                    </>
                  ) : (
                    name
                  )}
                </text>
                <text x={x} y={206} className="hm-wk-ai">
                  {changed ? (
                    <>
                      <tspan className="hm-was">96</tspan> <tspan className="hm-wordt">TSS 70</tspan>
                    </>
                  ) : (
                    tss
                  )}
                </text>
              </g>
            )
          })}
        </g>
        <text x={16} y={242} className={`hm-cap${coach ? ' is-coach' : ''}`}>
          {caption}
        </text>
      </svg>
    </div>
  )
}

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)'
  const [reduce, setReduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches)
  useEffect(() => {
    const m = matchMedia(query)
    const onChange = () => setReduce(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])
  return reduce
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const
const Icon = {
  Dots: () => (
    <svg {...svgProps}>
      <path d="M4 12h2M9 12h2M14 12h2M19 12h1" />
    </svg>
  ),
  Check: () => (
    <svg {...svgProps} strokeWidth={2.5}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  Shift: () => (
    <svg {...svgProps}>
      <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
    </svg>
  ),
  Device: () => (
    <svg {...svgProps}>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M9 8h6M9 12h6" />
    </svg>
  ),
  Pin: () => (
    <svg {...svgProps} strokeWidth={1.5}>
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  ),
}
