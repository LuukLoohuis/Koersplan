Homepage van VELORIQ: één lange, rijke pagina met hero-variant A, Hoe het werkt, Onze coaches, Prijzen, FAQ en footer.

- **Hero A** (donker, `contour`): kernbelofte in `display-hero`, twee CTA's (`btn-primary btn-lg` "Start je koers", `btn btn-lg` "Bekijk prijzen"), rechts een `panel` met de animatie: (1) een mini-vormgrafiek tekent zichzelf, (2) een ijs-teale gestippelde route met 7 waypoints en de weekplanning verschijnt ("Koers uitgezet"), (3) de avatar van Ruud landt, donderdag schuift als was → wordt naar brons, de route trekt door en de statuschip wordt "Bevestigd". Loopt in een lus; onder `prefers-reduced-motion` staat direct de eindstand.
- **Hoe het werkt** (licht): scroll-verhaal langs een verticale koerslijn — gestippeld `ai` met drie waypoints, het vierde waypoint en het laatste stuk lijn in `coach`. Per stap: nummer in `label`, kop in `h1`-maat Bricolage, tekst in `body`, rechts een klein voorbeeld (chip, Voice-blok, route, coachnotitie).
- **Onze coaches** (donker): CoachCard ×3 in een grid van drie.
- **Prijzen** (licht, anker `#prijzen`): Pricing; daaronder de **FAQ** als `<details>`-lijst op `surface` en de **footer** (donker) met vier kolommen.
- Secties wisselen donker/licht via `data-theme` op de sectie; `bg`/`surface`/`text` volgen mee. Breekpunten: gebouwd op 1440; voor 390 stapelen hero, stappen en kaarten onder elkaar (nog niet in deze preview).
- Copy: je-vorm, koers-taal in microcopy ("Koers uitgezet voor week 40", "Ruud stuurde bij"), navigatie gewoon.

Handgeschreven uit de ontwerpbrief; de repo heeft geen marketingpagina.
