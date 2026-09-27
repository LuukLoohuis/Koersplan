Tabbalk voor de hoofdnavigatie van atleet en coach.

- Tab 36px hoog, `body-medium`, `text-muted`; actief `text` met 2px onderlijn in `text`. Afstand tussen tabs `space-5`.
- Labels blijven gewoon (Vandaag, Vorm, Schema, Voorstellen, Check-in; coach: Mijn atleten, Check-ins). Koers-taal hoort in microcopy, niet in navigatie.
- Een badge op een tab is een `chip-coach` (iets van de coach wacht) of `chip-ai` (nieuwe koers uitgezet).
- Toetsenbord: pijltjes wisselen van tab, focusring `focus`. De consumer levert `role="tablist"`, `aria-selected` en de panelen.

Handgeschreven uit `.tab` in `src/styles.css`.
