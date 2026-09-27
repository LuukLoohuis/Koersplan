Datatabel voor de coach-cockpit "Mijn atleten" en het weekschema op desktop.

- Koppen in `label` (mono, uppercase, `text-muted`) met onderlijn `line`; cellen 9px 10px, rijen gescheiden door `line`; hover `surface-raised`.
- Alle getallen in `num` (tabular-nums) zodat kolommen uitlijnen; delta's met ▲/▼ in `delta-pos`/`delta-neg`.
- Vormzone, abonnement en signalen zijn chips (StatusChip), nooit een gekleurde cel.
- Verpak de tabel in een `panel` met `overflow:hidden`; op mobiel scrollt de tabel zelf horizontaal (code: `.grid > * { min-width: 0 }`).
- De consumer levert kolommen, rijen, sortering en filters.

Handgeschreven uit `table.data` in `src/styles.css` en `src/pages/Roster.tsx`.
