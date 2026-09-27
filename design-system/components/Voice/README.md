De twee stemmen in het product: de AI die uitzet en de coach die bijstuurt en bevestigt. Altijd herkenbaar, nooit verwisseld.

**AI-blok** (`voice-ai`): grond `ai-soft`, gestippelde rand `ai`, tekst `ai-voice` (Geist Mono) in `ai-text`. Een `<details>` met als summary "Waarom deze koers"; standaard ingeklapt in de atleet-app, open in het reviewscherm van de coach. Ook voor projecties en AI-annotaties in de vormgrafiek.

**Coachnotitie** (`voice-coach`): grond `coach-soft`, doorgetrokken rand `coach`, echte foto (avatar 32px, `radius-pill`) en naam in `coach-text`, de notitie in `coach-note` (Instrument Serif italic, `text`). Ook voor citaten op het coachprofiel (`coach-quote`) en check-in-antwoorden.

- IJs-teal en brons zijn uitsluitend deze twee stemmen; gebruik ze nergens decoratief.
- De consumer levert de tekst, en voor de coach: naam, foto en datum ("Bevestigd door Ruud · za 27 sep").

Handgeschreven uit de ontwerpbrief; de code heeft hier nog geen equivalent (de AI-uitleg staat als platte tekst in `src/pages/PlanTab.tsx`).
