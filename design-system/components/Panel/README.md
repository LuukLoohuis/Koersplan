Kaart of paneel: het basisoppervlak voor data, trainingen en formulieren.

- Grond `surface`, rand 1px `line`, radius `radius-card` (16px); grote kaarten (prijzen, coachportret) `radius-card-lg`.
- Header: titel 13px/600 in Geist, optionele actie rechts; body padding `space-4`. Zet op licht de grafiekpanelen tóch op de donkere `surface` (data is altijd donker).
- `contour` voegt de topografische hoogtelijnen toe (kleur `contour`): alleen op hero, lege states en coachkaarten. Nooit onder een grafiek of tabel.
- Lege states (Intervals niet gekoppeld, te weinig historie, rustdag, AI zet koers uit, sync mislukt) zijn een `panel contour` met kop in `h2`, een regel `text-muted` en één knop.
- De consumer levert `title`, `action`, `children` en `pad` (code: `Panel` in `src/components/ui.tsx`).

Handgeschreven uit `src/components/ui.tsx` (Panel, Empty) en `.panel`; de radius gaat van 10px (code) naar 16px (brief).
