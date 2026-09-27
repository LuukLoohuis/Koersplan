Vandaag: het startscherm van de atleet, mobile-first op het donkere thema.

- Kop met woordmerk, chip "Op koers · 92%" (`chip-accent`) en avatar; titel `h1` "Vandaag" met datum en weeknummer in `sub` (mono).
- **Banner** (brons, `coach-soft`) zodra een koers bij de coach ligt: "Je nieuwe koers ligt bij Ruud — uiterlijk morgen bevestigd".
- **Trainingskaart**: naam in Bricolage 20px, metadata in mono (duur · TSS · IF), intensiteitsprofiel als blokjes in `zone-1…7` met tijdas, StatusChip, knoppen "Bekijk training" (`btn-primary`) en "Waarom".
- **Vormsnapshot**: conditie, vermoeidheid, vorm als `kpi`-cijfers met delta; daaronder een compacte vormband met de vijf zones en de huidige positie als gloeiende streep (`shadow-glow-accent`).
- **Weekstrip**: 7 dagen met stip (gereden `delta-pos`, vandaag `accent`, gepland `ai`, rust `line`) en TSS.
- **Laatste coachnotitie** (Voice) en **laatste rit** uit Intervals met gepland vs gereden als balkjes (duur, TSS, NP) en "op koers %".
- Tabbalk onderaan: Vandaag, Vorm, Schema, Voorstellen (bronzen stip bij een open voorstel), Check-in; actieve tab met goud icoon.

Handgeschreven uit de ontwerpbrief; de repo heeft een eenvoudiger atletenportaal (`src/pages/Portal.tsx`).
