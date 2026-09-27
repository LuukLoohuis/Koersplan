Auth (Supabase): Inloggen, Account aanmaken, Wachtwoord vergeten, Nieuw wachtwoord en "Check je mail" delen dit split-screen.

- **Links** (donker, `contour`): tekst-woordmerk, een mini-vormgrafiek van een echte atleet (goud, gloed, zones) en een coachcitaat in `coach-quote` met naam in mono. Dit paneel verandert niet per scherm.
- **Rechts** (licht, `bg` ivoor): formulier van 360px met `h1` in Bricolage 30px. Volgorde: Google (`btn btn-lg`), scheiding "of", e-mail, wachtwoord (met "Vergeten?"), primaire knop (`btn-primary btn-lg`), magic link als ghost, wissel naar Account aanmaken.
- **States** (wissel met de chips in de preview): standaard; laden (knop disabled met spinner en "Bezig met inloggen…"); fout (veld `aria-invalid`, rand `delta-neg`, hint met wat je kunt doen); verstuurd ("Check je mail": `panel contour` met envelop-icoon, het adres in `text`, "Opnieuw versturen", geldigheid 15 minuten).
- Account aanmaken heeft dezelfde opbouw plus naam en akkoord met privacy; Wachtwoord vergeten alleen e-mail; Nieuw wachtwoord twee velden met sterkte-hint.
- De consumer levert de Supabase-handlers en de foutmeldingen in het Nederlands.

Handgeschreven uit de ontwerpbrief; de repo heeft nog geen login (README: "Nu heeft de app nog geen login").
