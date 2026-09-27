# Taken voor Claude Code — design system in de app

Drie taken, in deze volgorde, elk als eigen branch + PR. Lees eerst `CLAUDE.md` en `design-system/USAGE.md`.

---

## Taak 1 · Tokens live in de app

**Doel:** de app gebruikt de VELORIQ-tokens (teal, goud, brons, ijs-teal) in plaats van het blauwe prototype-palet. Geen visuele herbouw; alle bestaande schermen kleuren mee.

**Stappen**
1. In `src/styles.css`: vervang het hele tokenblok (`:root {…}`, `@media (prefers-color-scheme: dark)`, `:root[data-theme='dark']`, regels ~5–113) door `@import '../design-system/tokens.css';` direct onder `@import 'tailwindcss';`.
   - `tokens.css` heeft **donker als `:root`** en licht als `[data-theme="light"]`; de code had licht als standaard. Zet in `index.html` `data-theme="light"` op `<html>` voor de coachschermen en laat het atletenportaal (`src/pages/Portal.tsx`) de wrapper `data-theme="dark"` geven. `prefers-color-scheme` mag vervallen.
2. Pas het `@theme inline`-blok aan (regels ~115–136) naar de nieuwe namen:
   - `--color-bg: var(--bg)`, `--color-surface: var(--surface)`, `--color-raised: var(--surface-raised)`, `--color-line: var(--line)`, `--color-ink: var(--text)`, `--color-muted: var(--text-muted)`
   - `--color-accent: var(--accent)`, `--color-accent-soft: var(--accent-soft)`, `--color-on-accent: var(--on-accent)`, `--color-accent-text: var(--accent-text)`
   - nieuw: `--color-ai: var(--ai)`, `--color-ai-text`, `--color-ai-soft`, `--color-coach`, `--color-coach-text`, `--color-coach-soft`, `--color-on-coach`
   - `--color-good: var(--delta-pos)`, `--color-crit: var(--delta-neg)`, `--color-warn: var(--warn)`, de `*-soft` ongewijzigd
   - fonts: `--font-display: var(--font-display)`, `--font-sans`, `--font-mono`, `--font-serif`
   - `--color-ink-2`, `--color-line-strong`, `--color-primary`, `--color-on-primary` vervallen: `text-ink-2` → `text-muted`, `border-line-strong` → `border-line`, `bg-primary text-on-primary` → `bg-accent text-on-accent`.
3. Vervang het `@layer components`-blok door de klassen uit `design-system/components/bundle.css` (zelfde namen: `.btn`, `.panel`, `.chip`, `.field`, `.tab`, `table.data`, `.tt`, `.num`, `.eyebrow`; nieuw: `.btn-coach`, `.chip-ai`, `.chip-coach`, `.chip-coach-solid`, `.chip-accent`, `.voice-ai`, `.voice-coach`, `.correction`, `.koerslijn`, `.contour`). `.chip-accent` (blauw) → `.chip-ai`; `.btn-primary` is nu goud.
4. `src/lib/theme.ts`: `KEYS` wordt `['text','text-muted','line','surface','surface-raised','chart-ctl','chart-atl','chart-wbal','chart-plan','chart-tsb-pos','chart-tsb-neg','delta-pos','warn','delta-neg','zone-1'…'zone-7','ai','coach']`; pas `Colors`, `zoneColor` (nu `zone-${z+1}`) en de gebruikers in `charts.tsx` aan (`c.ctl` → `c['chart-ctl']` enz.). `formState` krijgt de zonelabels uit het design system: > +20 Overgang, +5…+20 Fris, −10…+5 Grijze zone, −30…−10 Optimaal, < −30 Hoog risico (tone: '', 'good', '', 'accent', 'crit').
5. Fonts: kopieer `design-system/fonts/*.woff2` naar `public/fonts/` en zet in `tokens.css` de `url(./fonts/…)` om naar `url(/fonts/…)` (of laat Vite de import oplossen); verwijder de Google Fonts-`<link>` uit `index.html`.
6. Laad in `index.html` de titel "VELORIQ" en het favicon uit `design-system/assets/Logos/veloriq-mark-light.png` (tijdelijk, tot er een SVG is).

**Klaar als:** `npm run typecheck` en `npm test` groen; app oogt teal/goud in beide thema's; geen `--accent`-blauw meer; `grep -r "line-strong\|ink-2\|primary-bg" src` leeg.

---

## Taak 2 · Vormgrafiek als React-component

**Doel:** `src/components/FormChart.tsx` vervangt de PMC in `src/components/charts.tsx`, met de kwaliteit en interactie van `design-system/components/FormChart/preview.html` (variant A) en `FormChartMobile` op < 640px.

**Stappen**
1. Lees `design-system/components/FormChart/README.md` en de `<script>` in `preview.html`: datamodel, EWMA (42/7) voor de projectie, zones, kleuring per zone via clip-paths, Catmull-Rom-smoothing, crosshair/tooltip, bereik-chips, legenda-toggles, pinch-zoom, secundaire panelen.
2. Kies **visx** (`@visx/scale`, `@visx/shape`, `@visx/curve`, `@visx/event`) — Recharts haalt het gloed/clip-path-detail niet. Voeg alleen de visx-pakketten toe die je gebruikt.
3. Props: `history: {date, ctl, atl, tss, workoutName?, zone?}[]`, `planAi` en `planCoach: {date, tss, workoutName}[]`, `goals: {date, label:'A'|'B'|'C', name}[]`, `annotations: {date, kind:'ai'|'coach', text, who?}[]`, `ftp`, `weightKg`, `eftp?: {date, w}[]`. De projecties berekent het component zelf met `shared/metrics.ts` (hergebruik `projectPmc` / `pmcFromLoads` uit `shared/metrics.ts`).
4. Opbouw exact als de preview: KPI-strip (Stat) · toolbar (bereik, legenda, AI-koers / Na coach) · hoofdpaneel (conditievlak goud met gradient + gloed, vermoeidheid staalblauw) · vormband met zones en labels in de band · belastingstaafjes in zone-kleuren, gepland gestippeld · "vandaag" · doelen als vlaggetjes · genummerde annotatiepinnen met zijkolom · één crosshair + tooltip met kleurstippen · secundaire `<details>`-panelen (eFTP, helling per week met veilige zone 3–7, uren/TSS per week).
5. Mobiel (< 640px): KPI's als scrollbare chips, paneel full-bleed, zijkolom eronder, pointer-scrub + pinch (zie `FormChartMobile`).
6. `prefers-reduced-motion`: geen draw-animatie, geen puls.
7. Zet het component in `Portal.tsx` (tab Vorm) en in `Athlete.tsx` (coachblik) en verwijder de oude PMC-code uit `charts.tsx` zodra beide werken.

**Klaar als:** demo-atleten tonen dezelfde beelden als de preview; tooltip, bereik en toggles werken; Lighthouse a11y ≥ 95 op de Vorm-tab; typecheck/tests groen.

---

## Taak 3 · Coachschermen: Koers reviewen en Mijn atleten

**Doel:** `src/pages/Roster.tsx` wordt de cockpit uit `design-system/components/Roster/`, en `src/pages/PlanTab.tsx` + `WorkoutEditor.tsx` worden het reviewscherm uit `design-system/components/ReviewScreen/`.

**Stappen**
1. **Mijn atleten** (`Roster.tsx`): "Te doen"-strook (koersen wachten · check-ins open · sync-fouten), filterchips en sorteer-select, tabel met foto/naam/FTP, abonnementschip (`chip-coach`/`chip-ai`), vorm als cijfer + 28-daagse sparkline in zonekleur + zonechip, conditie met ▲/▼ helling, op koers % (7 d), open voorstellen, aftelling volgende koers ("vandaag" in `coach-text`), signalen als chips. Data uit `AthleteSummary` (`shared/types.ts`); voeg `formSeries28`, `onCourse7d`, `nextPlanDue` en `openProposals` toe aan de server-summary als ze ontbreken.
2. **Koers reviewen** (`PlanTab.tsx`): drie kolommen.
   - Links: mini-vormgrafiek (hergebruik FormChart in `compact`-modus of een klein component) met de AI-projectie en de coachprojectie die **live** meebeweegt bij elke wijziging; vorige week gepland vs gereden; gevoel/notities van de atleet; eerstvolgende koers met verwachte vorm.
   - Midden: de week als rijen (dag, training-select uit de bibliotheek, intensiteitsprofiel, duur, TSS, status, verplaatsen ↑↓, verwijderen). Elke afwijking van het AI-voorstel als **Correction** (was → wordt) met rijrand `coach`; koerslijn met 7 waypoints erboven die per dag brons worden. Bewaar `WorkoutEditor.tsx` voor het bewerken van één training (stappen), open via de rij.
   - Rechts: Voice (AI) "Waarom deze koers" uit `server/ai.ts` (rationale-veld), notitie aan de atleet (serif), **Bevestigen** (`btn-coach`) met de gestippeld → doorgetrokken animatie en daarna de bestaande publish-flow naar Intervals (`POST …/events/bulk`), "Opnieuw laten uitzetten" met instructieveld (stuurt `instructions` mee naar de generator), "Later".
3. Statusmodel in `shared/types.ts`: `'uitgezet' | 'bij-coach' | 'bijgestuurd' | 'bevestigd' | 'op-fietscomputer' | 'gereden' | 'gemist'`; StatusChip-component in `src/components/ui.tsx` met icoon per status (lucide-react toevoegen).
4. Tests: normalize/bevestig-flow in `shared/core.test.ts` uitbreiden met "was → wordt"-diff (ai-plan vs coach-plan → lijst van wijzigingen per dag).

**Klaar als:** een demo-koers kan worden bijgestuurd en bevestigd; de projectie links beweegt mee; de publish naar Intervals (gesimuleerd zonder key) werkt onveranderd; typecheck/tests groen.

---

Na deze drie: atleet-schermen (`design-system/components/AthleteToday`, `AthleteSchedule*`, `WorkoutDetail`), auth + onboarding (Supabase), check-in, coachprofiel, admin — allemaal met referentie in `design-system/components/`.
