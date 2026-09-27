Statuschip voor een training, een signaal of een vormzone: pil met icoon, kleur én woord, nooit alleen kleur.

Volgorde van een training: **Uitgezet** (`chip-ai`, mono) → **Bij coach** (neutraal) → **Bijgestuurd** (`chip-coach`) → **Bevestigd** (`chip-coach-solid`, massief brons) → **Op je fietscomputer** (neutraal) → **Gereden** (`chip-good`, met "op koers %") of **Gemist** (`chip-crit`).

- Hoogte 22px, radius `radius-pill`, tekst `micro`, icoon lucide 12px stroke 2 links.
- `chip-warn` voor signalen (helling > 8, check-in open, sync-fout), `chip-accent` voor de vormzone "Optimaal", `chip-good`/`chip-crit` ook voor delta's.
- IJs-teal en brons blijven strikt semantisch: `chip-ai` alleen voor wat de AI uitzette, `chip-coach*` alleen voor wat de coach deed.
- De consumer levert status (enum) en label; het icoon volgt de status.

Handgeschreven uit `.chip`/`FormChip`/`FlagChips` in de code plus de statuslijst uit de brief. De code kende `chip-accent` (blauw) — vervangen door `chip-ai`.
