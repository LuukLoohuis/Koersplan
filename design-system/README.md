VELORIQ is een trainingsplatform voor duursporters. Het merk komt uit het logo: diep teal, warm goud en een geometrisch, wijd gespatieerd woordmerk met een gouden Q. De AI zet de koers voor de week uit, de coach stuurt bij en bevestigt. Kernbelofte: **"AI rekent. Je coach beslist."** Een precisie-instrument voor sporters: donker, strak en technisch, warm waar de coach in beeld komt. Alle UI-tekst in het Nederlands.

## Het idee: uitzetten en bijsturen

Twee stemmen, altijd herkenbaar. Houd `ai` (ijs-teal) en `coach` (brons) strikt semantisch; gebruik ze nergens decoratief.

| | AI = uitgezet | Coach = bijgestuurd en bevestigd |
| --- | --- | --- |
| Kleur | `ai` / `ai-text`, grond `ai-soft` | `coach` / `coach-text`, grond `coach-soft` |
| Lijn | gestippeld (`2 6`) | doorgetrokken |
| Letter | `ai-voice` (Geist Mono) | `coach-note`, `coach-quote` (Instrument Serif italic) |
| Beeld | waypoints op een route | echte foto en naam van de coach |
| Component | Voice (AI-blok "Waarom deze koers") | Voice (coachnotitie), Correction, Koerslijn |

Wat de coach wijzigt toon je als **was → wordt** (Correction): de AI-waarde dun en doorgestreept in `ai-text`, de nieuwe waarde in `coach-text`, met een korte notitie. **Bevestigen** is het signatuurmoment: de gestippelde route trekt zich door tot een massieve bronslijn, de avatar van de coach landt als waypoint, en "Bevestigd door Ruud · za 27 sep" verschijnt (Koerslijn).

## Toon en tekst

Direct, deskundig, menselijk. Je-vorm, geen uitroeptekens, geen emoji. Microcopy mag met koers- en navigatietaal spelen: "Op koers: 92%", "Koers uitgezet voor week 40", "Ruud stuurde bij". Navigatielabels blijven gewoon: Vandaag, Vorm, Schema, Voorstellen, Check-in. Getallen met komma als decimaalteken ("+4,1"), tijden als "1:30", datums kort ("za 27 sep"). Zeg bij een fout altijd wat er gebeurde én wat de gebruiker kan doen.

## Kleur

Twee thema's. **Donker** (`bg` teal-zwart, `surface` logo-teal) is standaard voor data, de hero en de atleet-app; **licht** (`bg` ivoor, `surface` wit) voor coach-werkschermen, marketingsecties en formulieren. Grafieken staan ook op licht in een donker paneel.

- Tekst: `text` op `bg`, `surface` en `surface-raised`; gedempt `text-muted`. Rasters en randen `line`.
- `accent` (goud, uit het logo) is de primaire actie (Button) en de conditielijn (`chart-ctl`). Als tekst en focusring `accent-text` (op licht #7c5e2a).
- `ai` (ijs-teal) uitsluitend de AI-stem; `coach` (brons, dieper en warmer dan het goud) uitsluitend de coach-stem en bevestigingen. Op licht als tekst `ai-text` en `coach-text`.
- `fatigue` (staalblauw) alleen de lijn vermoeidheid; `delta-pos` ▲ en `delta-neg` ▼ voor delta's en risico, altijd met teken of icoon; `warn` voor signalen.
- `zone-1` … `zone-7` voor intensiteitsprofielen (Z1–Z7).
- Contrast: elk tekstpaar in de notes haalt AA in beide thema's, behalve `delta-pos` op licht (4,4:1) en `warn` op licht (3,6:1): die alleen met teken of icoon.

## Typografie

- Koppen en grote cijfers: Bricolage Grotesque (`display-hero`, `display-lg`, `h1`, `h2`, `kpi`), strak gespatieerd; op grote maten mag hij iets smaller.
- UI en lopende tekst: Geist (`body`, `body-medium`, `caption`, `micro`).
- Labels, álle data en de AI-stem: Geist Mono met `tabular-nums` (`label`, `num`, `ai-voice`, `axis`). Cijfers altijd als tekst.
- De coach: Instrument Serif italic (`coach-quote`, `coach-note`).

## Vorm, ruimte, beweging

- Kaarten `radius-card` (16px) en `radius-card-lg` (20px), knoppen en velden `radius-control` (8px), chips `radius-pill`. Randen 1px `line`; schaduw alleen op tooltips (`shadow-tooltip`) en als gloed in grafieken (`shadow-glow-accent`, `shadow-glow-coach`).
- 4px-grid: `space-4` (16px) paneelpadding, `space-6` kaartafstand, `space-10`/`space-16` sectieafstand. Veel lucht, heldere hiërarchie.
- Textuur: subtiele hoogtelijnen (`contour`, class `contour`) op de hero, lege states en coachkaarten. Nooit onder data.
- Motief: de Koerslijn met waypoints door stappen, weken en onboarding.
- Beweging: lijnen die zichzelf tekenen, cijfers die optellen, gestippeld → doorgetrokken bij bevestigen. Respecteer `prefers-reduced-motion` (alles in één stap).
- Niet: retro, papier, stempels, handschrift, neon-gradients, glassmorphism, stockfoto's, AI-sterretjes.

## Iconografie

Lucide, stroke 1.5, 16px in knoppen en 12px (stroke 2) in chips; inline SVG met `currentColor`. Statussen krijgen altijd icoon + kleur + woord (StatusChip). Geen emoji in de UI; ▲/▼ als tekstteken voor delta's.

## Logo

Het logo is aangeleverd: een V in diep teal met een sprintende wielrenner en een gouden baan met drie waypoints, het woordmerk VELORIQ in geometrische kapitalen met een gouden Q, tagline "AI Coaching met persoonlijke benadering." De bestanden staan in `assets/Logos` (lockup, beeldmerk, woordmerk) op lichte grond. Op donkere grond ontbreekt nog een versie: zet daar het woordmerk in tekst (`text`, tracking .18em, de Q in `accent`) tot het vectorbestand er is. De gouden waypoint-baan uit het beeldmerk is dezelfde vorm als de koerslijn in de UI.

## De vormgrafiek

Het belangrijkste component, nog te bouwen (visx/d3 of Recharts). KPI-strip (Stat) erboven; hoofdpaneel op `surface` donker met conditie als `chart-ctl`-vlak met verticale gradient en `shadow-glow-accent`, vermoeidheid als dunne `chart-atl`-lijn, fijn raster `line`, verticale lijn "vandaag". Vormband eronder met zones Overgang (> +20), Fris (+5 tot +20), Grijze zone (−10 tot +5), Optimaal (−30 tot −10), Hoog risico (< −30); de vormlijn kleurt mee. Rechts van vandaag gestippelde projecties: `chart-projection-ai` en `chart-projection-coach`. Belastingstaafjes op de basislijn in zone-kleuren. Eén crosshair over alle panelen, tooltip in `tt`.

## Niet gesynchroniseerd

- Uit de code niet overgenomen: het blauwe accent (#2f5fd0) en `--accent-soft`, `--primary-bg/fg`, `--line-strong`, `--ctl` (blauw) — vervangen door goud, ijs-teal en brons uit het logo (de brief had lime, ijsblauw en koper; het logo bepaalt). `--raised` is als `surface-raised` in de nieuwe palet afgeleid.
- Toegevoegd zonder bron in de code: `ai-*`, `coach-*`, `accent-*`, `fatigue*`, `contour`, de gloed-schaduwen, `radius-card(-lg)`, alle Bricolage- en Instrument Serif-stijlen, en de componenten Voice, Correction en Koerslijn (uit de brief).
- Componenten zijn handgeschreven statische previews (read-only route); de repo heeft geen componentbibliotheek of bundle. Niet gebouwd: WorkoutEditor (`src/components/WorkoutEditor.tsx`), de Recharts-grafieken (`src/components/charts.tsx`) en de pagina's.
- Fontbestanden komen uit de @fontsource-pakketten (latin, OFL), niet uit de repo (die laadt Geist via Google Fonts).
