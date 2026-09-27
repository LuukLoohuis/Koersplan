Toast of inline melding voor sync, bevestiging en fouten.

- Drie tonen: `toast-good` (bevestigd, verstuurd), `toast-warn` (wacht op coach, kalibreert nog), `toast-crit` (sync mislukt, ongeldig ID). Achtergrond de bijpassende `*-soft`, tekst `delta-pos` / `warn` / `delta-neg`.
- Tekst 13px, radius `radius-control`, padding 10px 14px; sluitknop of één actie rechts.
- Zeg altijd wat er gebeurde én wat de gebruiker kan doen ("Koppel opnieuw in Account"). `role="status"`.
- De consumer levert `tone`, inhoud en `onClose`.

Handgeschreven uit `Toast` in `src/components/ui.tsx`.
