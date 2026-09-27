# Koersplan Coach: prototype

Een trainingstool voor coaches. Koersplan haalt de data van je atleten uit **intervals.icu**. Daarmee schrijft de **AI (Claude)** of een ingebouwde regelgenerator een concept-trainingsblok. Jij past het blok aan in de editor en publiceert het met één klik naar de **intervals.icu-kalender** van de atleet. Vanaf daar synct het naar Garmin, Wahoo en Zwift. De atleet heeft een eigen portaal met het schema, jouw uitleg en een feedbackformulier per training.

## Snel starten

```bash
npm install
cp .env.example .env      # vul in wat je hebt; zonder sleutels draait alles op demo-data
npm run dev               # API op :8787, app op http://localhost:5173
```

Zonder sleutels zie je drie demo-atleten met realistische, verzonnen data. Je kunt dan wel blokken genereren, bewerken en "publiceren", maar dat publiceren wordt alleen gesimuleerd. Er gaat niets naar buiten.

| Wat | Waar zet je het | Effect |
|---|---|---|
| `INTERVALS_API_KEY` | intervals.icu → Settings → Developer Settings | Via **Atleet koppelen** voeg je atleten toe op athlete id. Als coach heb je ook toegang tot atleten die jou als coach hebben toegevoegd. Met id `0` open je je eigen account. |
| `INTERVALS_CLIENT_ID` / `_SECRET` | aanvragen via https://intervals.icu/oauth/apply | Hiermee krijg je de knop "Koppel een atleet" en een uitnodigingslink. De atleet logt in bij intervals.icu en geeft toestemming. |
| `ANTHROPIC_API_KEY` (+ optioneel `ANTHROPIC_MODEL`) | console.anthropic.com | Claude schrijft het blok. Zonder deze key gebruikt de app de regelgebaseerde generator. |

Overige commando's: `npm test` voor de unit-tests van de trainingslogica, `npm run typecheck`, `npm run build` gevolgd door `npm start` voor productie (één Node-proces), en `npm run build:demo` voor een statische demo zonder server.

## Werken op localhost (zonder domein)

Voor de API-key-modus heb je geen domein en geen OAuth-app nodig.

1. Kopieer `.env.example` naar `.env` en vul `INTERVALS_API_KEY` in. Laat `INTERVALS_ATHLETE_IDS=0` staan; `0` ben jijzelf.
2. Draai `npm run check`. Die leest je profiel, FTP, wellness, ritten, power curve en kalender, en laat zien wat werkt.
3. Draai `npm run check -- 0 --write`. Die zet één testworkout voor morgen in je kalender en haalt hem daarna weer weg. Zo weet je dat publiceren werkt.
4. Start de app met `npm run dev` en open http://localhost:5173. Je eigen account staat nu tussen de atleten.
5. Wil je proefatleten toevoegen? Laat ze jou in intervals.icu als coach toevoegen. Zet daarna hun athlete ids (`i123456`) in `INTERVALS_ATHLETE_IDS`, of gebruik **Atleet koppelen**.

Heb je later wel een domein? Zet dan bij je OAuth-app een extra redirect-URL, bijvoorbeeld `https://jouwdomein.nl/auth/intervals/callback`. Wildcards werken niet bij intervals.icu, dus elke URL moet je exact opgeven.

## Hoe het werkt

```
intervals.icu ──(OAuth / API-key)──▶ server/intervals.ts ──▶ AthleteOverview
   wellness (CTL/ATL/HRV)                                       │
   activiteiten (TSS, IF, NP)                                   ▼
   power-curve (90 d)          shared/metrics.ts: CP-model, PMC-projectie, TSS/IF, W′-balans
   sport-settings (FTP)                                         │
                                                                ▼
                     server/ai.ts (Claude, tool-use → JSON)  of  shared/generator.ts (regels)
                                                                │
                                          shared/normalize.ts (valideren en begrenzen)
                                                                ▼
                                   Editor (coach) ──▶ shared/intervalsText.ts
                                                                │
                              POST /athlete/{id}/events/bulk?upsert=true  (external_id per workout)
                                                                ▼
                                   intervals.icu-kalender ──▶ Garmin / Wahoo / Zwift
```

- **Neutraal workoutformaat** (`shared/types.ts`): secties met herhalingen en stappen. Een stap is vast, een ramp of vrij, met een doel in % FTP. Bij publiceren zet `intervalsText.ts` dit om naar de tekstsyntax van intervals.icu (`Main Set 4x` / `- 8m 95-100%`). Een export naar Garmin, Wahoo of .zwo kun je later als extra converter toevoegen.
- **Opnieuw publiceren is veilig.** Elke workout krijgt de `external_id` `koersplan:{plan}:{workout}`. Een upsert werkt bestaande workouts bij, en workouts die je hebt verwijderd gaan via `bulk-delete` uit de kalender.
- **Logica in de stijl van Vekta:**
  - Het **CP-model** (CP en W′) komt uit een regressie op de power-duration curve (2–20 min).
  - De **W′-balans** per workout volgt het Skiba-model. De editor waarschuwt als W′ leegloopt.
  - De **PMC-projectie** (CTL/ATL/TSB) werkt live bij terwijl je bewerkt.
  - Een 3:1-periodisering begrenst de ramp op 3–7 CTL per week en begint met een herstelweek als de vorm (TSB) onder −25 ligt.
  - Sessies zijn benoemd naar hun prikkel (Drempel, VO2max, Duurvermogen …).
  - Het coachoverzicht toont aandachtspunten: vermoeidheid, snelle opbouw, HRV onder baseline, dagen zonder training en een FTP die niet bij de CP past.
- **AI** (`server/ai.ts`): Claude krijgt de CTL/ATL/TSB, het CP-model, 8 weken belasting, recente ritten, wellness, beschikbare dagen, uren en jouw instructies. Via een geforceerde tool call levert het een blok als gestructureerde JSON. `normalize.ts` controleert de datums, begrenst intensiteit en duur en haalt dubbele dagen weg. Valideert het resultaat niet, dan valt de server terug op de regelgenerator en krijg je een melding.

## Belangrijk om te weten

- **Strava valt af als databron.** De API-voorwaarden verbieden AI-gebruik en het tonen van data aan een ander, zoals een coach. Laat atleten Garmin of Wahoo daarom rechtstreeks aan intervals.icu koppelen. Ritten die alleen via Strava binnenkomen zijn niet via de API beschikbaar.
- **OAuth-scopes:** `ACTIVITY:READ,WELLNESS:READ,CALENDAR:WRITE,SETTINGS:READ`. intervals.icu werkt alleen met access tokens, zonder refresh tokens.
- **Niet live getest:** de sandbox waarin dit is gebouwd kon intervals.icu en de Claude API niet bereiken. De koppelingen volgen de officiële documentatie en de veldnamen van bestaande open-source clients. Test ze dus eerst met je eigen API-key (athlete id `0`) voordat je atleten uitnodigt.

## Naar productie (fase 1 → echt product)

1. **Opslag en login:** vervang `server/store.ts` (een JSON-bestand) door Supabase. Maak tabellen voor `coaches`, `athletes` (met versleutelde tokens), `plans`, `workouts` en `feedback`. Gebruik Supabase Auth, zodat coaches en atleten alleen hun eigen data zien. Nu heeft de app nog geen login.
2. **Hosting:** zet de Express-routes om naar Vercel-functies, of draai de server op Fly.io of Railway.
3. **Webhooks van intervals.icu** (`ACTIVITY_UPLOADED`, `CALENDAR_UPDATED`): na elke rit de analyse bijwerken en afwijkingen melden, zoals een gemiste training of een RPE van 9 of hoger.
4. **AVG:** HRV, hartslag en slaap zijn gezondheidsgegevens. Je hebt nodig: expliciete toestemming, een verwerkersovereenkomst (Anthropic, hosting), hosting in de EU en een privacyverklaring. Train geen modellen op gebruikersdata.
5. **Eigen workoutbibliotheek** per coach en "AI, pas deze week aan"-acties, bijvoorbeeld na feedback of gemiste trainingen.
