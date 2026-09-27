Knop in vijf varianten: primair (goud), coach (brons), standaard, ghost en klein.

- `btn-primary`: één per scherm, de hoofdactie van de atleet of de marketing ("Start je koers"). Vulling `accent`, tekst `on-accent`.
- `btn-coach`: uitsluitend het signatuurmoment **Bevestigen** van de coach. Vulling `coach`, tekst `on-coach`. Nooit elders brons op een knop.
- `btn` (standaard) op `surface` met rand `line`; hover `surface-raised`. Secundaire acties: "Opnieuw laten uitzetten", "Past vandaag niet".
- `btn-ghost`: tertiair ("Later", sluiten). `btn-sm` 28px in tabellen en kaarten, `btn-lg` 44px in de hero.
- Hoogte 34px, radius `radius-control`, tekst `body-medium`; icoon lucide 16px, stroke 1.5, links van het label.
- De consumer levert label, `onClick`, `disabled` (opacity .5) en eventueel een icoon. Focus: `outline 2px var(--focus)`, offset 1px.

Handgeschreven uit `src/styles.css` (.btn, .btn-primary, .btn-ghost, .btn-sm); code had de primaire knop in `primary-bg` (grafiet/wit), de brief maakt hem lime.
