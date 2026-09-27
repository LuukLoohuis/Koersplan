# VELORIQ design system — in de code

Bron: het Design System-artifact in Claude (Cowork). Dit is een export; de bron van waarheid is het artifact, `tokens.json` de bron voor code.

- `tokens.json` — alle tokens (kleur per thema, typografie, spacing, radius, schaduw) plus `meta` met herkomst.
- `tokens.css` — dezelfde tokens als CSS-variabelen (`:root` = donker, `[data-theme="light"]` = licht), `@font-face` voor de vier fonts en een class per tekststijl. Vervangt op termijn het tokenblok bovenin `src/styles.css`; in Tailwind v4: `@import "../design-system/tokens.css";` en de variabelen in `@theme inline` mappen (`--color-bg: var(--bg)` …).
- `components/bundle.css` — de componentklassen (`.btn`, `.panel`, `.chip`, `.field`, `.tab`, `table.data`, `.voice-ai`, `.voice-coach`, `.correction`, `.koerslijn`, `.contour`).
- `components/<Naam>/preview.html` + `README.md` — per component een werkende referentie (HTML/SVG/JS) en de richtlijnen. De vormgrafiek (`FormChart*`) bevat de volledige rekenlogica (EWMA 42/7) en interactie als voorbeeld voor de React-implementatie.
- `assets/` — logo (lockup, beeldmerk, woordmerk), banner. `fonts/` — Bricolage Grotesque, Geist, Geist Mono, Instrument Serif (woff2, OFL).
- `README.md` — het brand book.

Let op: de previews zijn geen React-componenten; ze zijn geschreven als statische referentie en gebruiken `var(--…)` uit `tokens.css`.
