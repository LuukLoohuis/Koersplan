Onboarding van de atleet in zes stappen, met waypoints op een koerslijn als voortgang.

- **Voortgang**: horizontale koerslijn — gestippeld `ai` vooruit, doorgetrokken `coach` achter je; afgeronde stappen als bronzen waypoint, de huidige als gouden waypoint met rand `accent-text`, komende stappen als open `ai`-waypoint. Labels in mono: Abonnement · Account · Intervals.icu · Doelen · Coach · Eerste koers.
- **Stap 3 · Koppel Intervals.icu**: één primaire OAuth-knop met uitleg van de toestemmingen; daaronder ingeklapt de fallback met API-sleutel + atleet-ID en een genummerde stap-voor-stap uitleg. Strava wordt expliciet uitgesloten.
- **Stap 4 · Doelen**: A-koers + datum, uren per week (veld + slider), ervaring, beschikbare dagen als toggle-tags (`tag[aria-pressed]`).
- **Stap 5 · Kies je coach** (alleen Coach): CoachCard-grid met beschikbaarheid.
- **Stap 6 · "Je eerste koers wordt uitgezet"**: `card contour` met chip "AI rekent", een checklist in mono die vult terwijl de data binnenkomt (ritten, FTP, conditie/vermoeidheid/vorm), spinner op de huidige regel, "Naar Ruud voor bevestiging" als laatste.
- Knoppen onderaan elke stap: Terug (ghost) en Verder (primair). Stap 1 en 2 volgen Pricing en Auth.

Handgeschreven uit de ontwerpbrief en de koppelstappen uit de repo-README.
