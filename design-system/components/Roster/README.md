Mijn atleten: de cockpit van de coach, licht thema, desktop-first.

- **Te doen-strook** bovenaan: "4 koersen wachten" (`chip-coach`), "2 check-ins open" (`chip-warn`), "1 sync-fout" (`chip-crit`), rechts het aantal atleten en vrije plekken.
- **Filters** als chips (Alle, Koers wacht, Signalen, Coach, AI), zoekveld en sorteerkeuze (Urgentie, Vorm, Helling, Op koers %, Naam).
- **Tabel** (DataTable): foto + naam + FTP; abonnement als `chip-coach`/`chip-ai`; vorm als cijfer in Bricolage, sparkline van 28 dagen (kleur van de zone, nullijn in `line`) en zonechip; conditie met ▲/▼ helling; op koers % (7 dagen); open voorstellen (`chip-coach` "1 wacht"); volgende koers als aftelling ("vandaag" in `coach-text`); signalen als chips (⚠ helling > 8, gemiste trainingen, check-in open, sync-fout in `chip-crit`).
- Rijen zijn klikbaar naar Atleet-detail; de koers-badge opent Koers reviewen.
- De consumer levert de atletenlijst met 28-daagse vormreeks, signalen en tellers.

Handgeschreven uit de ontwerpbrief en `src/pages/Roster.tsx` (flags en tabel uit de code).
