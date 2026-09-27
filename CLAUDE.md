# VELORIQ (repo: koersplan)

Trainingsplatform voor wielrenners. De AI zet de koers voor de week uit, een echte coach stuurt bij en bevestigt; daarna gaat de training via Intervals.icu naar de fietscomputer. Kernbelofte: **"AI rekent. Je coach beslist."** Alle UI-tekst in het Nederlands.

## Stack
React 18 + Vite + TypeScript, Tailwind CSS v4 (`@tailwindcss/vite`, tokens als CSS-variabelen), Recharts, Express-server (`server/`), gedeelde logica in `shared/` (CTL/ATL/TSB, CP-model, workoutformaat, Intervals-tekstsyntax). `npm run dev` start API (:8787) en app (:5173) samen; `npm test` (vitest), `npm run typecheck`.

## Design system — bron van waarheid
`design-system/` is de export van het VELORIQ Design System-artifact (Claude). Lees eerst `design-system/USAGE.md`, daarna `design-system/README.md` (brand book).

- Tokens: `design-system/tokens.json` (bron) en `design-system/tokens.css` (gecompileerd: `:root` = donker, `[data-theme="light"]` = licht, `@font-face`, een class per tekststijl).
- Componentklassen: `design-system/components/bundle.css`.
- Per component een werkende HTML-referentie + richtlijnen: `design-system/components/<Naam>/preview.html` en `README.md`. De vormgrafiek (`FormChart`, `FormChartB`, `FormChartMobile`) bevat de complete reken- en interactielogica als voorbeeld.
- Logo en banner: `design-system/assets/`. Fonts: `design-system/fonts/`.

Regels die altijd gelden:
- **Twee stemmen.** AI = `--ai` (ijs-teal), gestippeld, Geist Mono. Coach = `--coach` (brons), doorgetrokken, Instrument Serif italic, echte foto + naam. Gebruik die kleuren nergens decoratief.
- **Goud (`--accent`)** is de primaire actie en de conditielijn; nooit als tekst op licht (dan `--accent-text`).
- Grafieken staan altijd op het donkere paneel (`--surface` donker), ook in het lichte thema.
- Statussen altijd icoon + kleur + woord. Getallen als tekst met `tabular-nums`. `prefers-reduced-motion` respecteren.
- Trainingsstatus: Uitgezet → Bij coach → Bijgestuurd → Bevestigd → Op je fietscomputer → Gereden / Gemist.
- Wat de coach wijzigt toon je als "was → wordt" (AI-waarde dun doorgestreept in `--ai-text`, nieuwe waarde in `--coach-text`).

## Werkafspraken
- Kleine, gerichte commits; per taak uit `design-system/TASKS.md` één PR.
- Bestaande `shared/`-logica (metrics, normalize, intervalsText) hergebruiken, niet dupliceren.
- Geen nieuwe UI-bibliotheek toevoegen zonder overleg; shadcn/Radix is de afgesproken basis voor formulier-primitives als dat nodig wordt.
- Typecheck en tests moeten groen zijn voor een PR.
