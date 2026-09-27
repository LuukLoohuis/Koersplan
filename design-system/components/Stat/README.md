KPI-cijfer met label, delta en mini-sparkline; vijf ervan vormen de KPI-strip boven de vormgrafiek.

- Label in `label` (mono, uppercase, `text-muted`); cijfer in `kpi` (Bricolage 700, 22px, tabular-nums), altijd als tekst, nooit in een afbeelding.
- Delta t.o.v. 7 dagen geleden in `num` 12px: ▲ in `delta-pos`, ▼ in `delta-neg`; het teken hoort erbij, kleur alleen is niet genoeg.
- Sparkline 72×20 met de kleur van de serie (`chart-ctl`, `chart-atl`); de vormwaarde krijgt in plaats daarvan het zonelabel als `chip-accent`.
- Op mobiel horizontaal scrollbaar in chips; op desktop een `panel` met 5 kolommen, gap `space-5`/`space-6`.
- De consumer levert `label`, `value`, `unit`, `sub`/delta en de reeks voor de sparkline (code: `Stat`, `KpiStrip`).

Handgeschreven uit `src/components/ui.tsx` (Stat, KpiStrip): de code toont CTL/ATL/TSB/CP/W′/FTP; de brief herbenoemt naar Conditie/Vermoeidheid/Vorm/Helling/eFTP.
