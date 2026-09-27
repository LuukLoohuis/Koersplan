Koerslijn: de dunne route met waypoints die door het product loopt, en het signatuurmoment waarop een gestippelde koers doorgetrokken wordt.

- **Uitgezet** (AI): `route-ai` — 2px `ai`, dash `2 6`, waypoints 5px met rand `ai` en vulling `surface`, daglabels in `axis`/`text-muted`.
- **Bevestigd** (coach): `route-coach` — 2,5px `coach`, doorgetrokken; waypoints vullen zich `coach`; de avatar van de coach (22px, `coach`, `shadow-glow-coach`) landt op de route; onderschrift "Bevestigd door Ruud · za 27 sep" in `coach-text`.
- Animatie bij **Bevestigen**: de bronslijn tekent zichzelf over de gestippelde heen (`stroke-dashoffset` 1 → 0, ±1,1 s ease-in-out), dan landt de avatar (0,3 s). Onder `prefers-reduced-motion` gebeurt alles in één stap.
- Ook als voortgang in onboarding (waypoint per stap), in "Hoe het werkt" (4 waypoints) en als weekvariant van het Schema (waypoint per dag).
- De consumer levert de punten (dagen/stappen), de status per punt en de coach (naam, foto, datum).

Handgeschreven uit de ontwerpbrief; geen equivalent in de code.
