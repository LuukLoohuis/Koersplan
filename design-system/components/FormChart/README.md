Vormgrafiek, variant A "Gelaagd": het belangrijkste component van VELORIQ. KPI-strip, hoofdpaneel met conditie en vermoeidheid, vormband met zones, belastingstaafjes, projecties, doelen en annotaties in één gescrubde weergave.

- **KPI-strip** (Stat): Conditie, Vermoeidheid, Vorm + zonelabel, Helling, eFTP (W en W/kg); `kpi`-cijfers als tekst, delta t.o.v. 7 dagen (▲ `delta-pos` / ▼ `delta-neg`), sparkline 72×20.
- **Hoofdpaneel** staat altijd op de donkere `surface` (ook in het lichte thema): conditie als `chart-ctl`-vlak met verticale gradient (.42 → .02) en `shadow-glow-accent` op de lijn (2px); vermoeidheid als 1,5px `chart-atl`-lijn; raster `line`; gestippelde lijn "vandaag" in `text-muted`.
- **Vormband** eronder: zones Overgang (> +20), Fris (+5…+20, `delta-pos`), Grijze zone (−10…+5), Optimaal (−30…−10, `accent`), Hoog risico (< −30, `delta-neg`) als zachte banden (opacity .05–.12) met het label in de band aan de rechterrand; de vormlijn kleurt per zone; de huidige waarde is een gloeiende stip.
- **Toekomst**: rechts van vandaag gestippeld (`2 5`): `chart-projection-ai` voor de AI-koers, `chart-projection-coach` na bijsturing; beide via de legenda aan/uit.
- **Doelen** als vlaggetjes op de tijdas (A in `accent`, B/C in `surface-raised`); hover/tap toont naam, verwachte vorm en zone.
- **Annotaties**: genummerde pinnen — AI in `ai`/mono, coach in `coach`/serif met naam — met uitleg in de zijkolom (desktop rechts, mobiel eronder).
- **Belastingstaafjes** (TSS/dag) op de basislijn, gekleurd naar prikkel met `zone-1…7`; geplande dagen als gestippelde omtrek in de kleur van de gekozen projectie.
- **Interactie**: één crosshair over alle panelen, tooltip (`tt`) met datum, alle waarden en de training; bereik-chips 6 wk / 3 mnd / 6 mnd / 1 jaar / seizoen; series aan/uit via de legenda; op mobiel scrubben met de duim en pinch-zoom voor het bereik. Lijnen tekenen zichzelf bij laden; onder `prefers-reduced-motion` niet.
- **Secundaire panelen** (inklapbaar): eFTP-verloop, helling per week met de veilige zone 3–7 gemarkeerd, uren/TSS per week.
- Voorbeelddata: 120 dagen historie + 21 dagen planning; conditie en vermoeidheid écht als exponentieel gewogen gemiddelde (42 en 7 dagen) berekend uit een dagelijkse TSS-reeks. Atleet Sanne Visser, FTP 292 W, 68 kg → conditie 58, vermoeidheid 71, vorm −13.
- De consumer levert de dagelijkse reeks (datum, TSS, training, gereden/gepland), de AI- en coachplanning, doelen, annotaties en de coach. In code: visx/d3 of Recharts, mits het deze kwaliteit haalt.

Handgeschreven uit de ontwerpbrief; de code (`src/components/charts.tsx`, Recharts) toont dezelfde data in een eenvoudiger PMC.
