Tekstveld en textarea voor auth, onboarding, coachprofiel en de workout-editor.

- Hoogte 34px, padding 0 10px, radius `radius-control`, rand `line` op `surface`; tekst `body`, placeholder `text-muted`.
- `field-sm` (28px, radius `radius-sm`, 12px) voor inline getallen in de editor (duur, % FTP).
- Focus: `outline 2px var(--focus)`; fout: rand `delta-neg` plus een `hint hint-error` met het waarom, nooit alleen een rode rand.
- Label boven het veld in 12px/500; teller ("62 / 280") rechts in `num`.
- Formulieren staan op het lichte thema (`bg` ivoor); de consumer levert label, waarde, `aria-invalid` en hint.

Handgeschreven uit `.field`, `.field-sm` en de focusregels in `src/styles.css`.
