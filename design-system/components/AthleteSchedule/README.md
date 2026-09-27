Schema op desktop: de week in zeven kolommen, met een koerslijn-variant achter de toggle.

- **Weekkop**: week en datumbereik, toggle Kolommen / Koerslijn (`seg`), rechts gepland vs gereden TSS en uren, op koers %, verwachte conditie-delta (▲ `delta-pos`).
- **Kolommen**: per dag een `dayc`-kaart met dag/datum, training, duur · TSS, mini-intensiteitsprofiel (`zone-1…7`), StatusChip; verleden dagen tonen "gereden 84 / 88 · 1:28 · op koers 95%". Vandaag krijgt rand `accent-text`.
- **Koerslijn**: de week als één doorgetrokken bronslijn (bevestigd) met een waypoint per dag — gereden `delta-pos`, vandaag `accent` (groter), gepland `coach`, rust `surface-raised`; het stuk na vandaag gestippeld. Labels in mono boven, naam en metadata onder het waypoint.
- Klik op een dag opent Training-detail. Een koers die bij de coach ligt staat als chip in de topbalk.
- De consumer levert de weekdata (gepland + gereden per dag) en de statussen.

Handgeschreven uit de ontwerpbrief.
