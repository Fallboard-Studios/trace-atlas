# Intent: Oblique Cabinetry — RadioButton (Roadmap Phase 11.1.6)

Confirmed via `/interview-me`, 2026-09-10. Scopes
[11.1.6](../todo/roadmap.md#1116-oblique-cabinetry-radiobutton), wiring `RadioButton` into the
shared cabinet-box mechanism [11.1.1](oblique-cabinetry-foundation.md) built, reusing
[11.1.2](oblique-cabinetry-toggle.md)'s state-keyed (not momentary-click) pop precedent — but
generalized from one box to N.

## Outcome

`RadioButton` re-renders each `schema.options` entry as its own `CabinetBox`, popped for the
currently-selected option and flat for every other — the fourth consumer of 11.1.1's foundation
and the first with more than one box per control. Today's single bordered/rounded pill container
(`RadioButton.css`'s shared border, flush touching segments, `overflow: hidden`) is dropped
entirely in favor of independently-spaced gapped boxes, since a popped box's wall/glow needs room
on its low side to read correctly — the same reason no other Cabinetry item lets its boxes touch.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of the
console leans on.

## Scope: covers every real consumer, not just the roadmap draft's fixed-option-count cases

The roadmap's own 11.1.6 section only discusses small, fixed-option consumers (Audio Setting: 4
options, Decay Mode: 2, Layer Type: ~4). Surfaced during the interview: `CompanyButtonRow`
(`companyConfig.ts`) already reuses the `RadioButton` primitive for an unrelated purpose —
selecting a company from a row of 2–8 options (`None`/`All` plus up to `MAX_COMPANIES` = 6
user-named companies, arbitrary label length) — and was not mentioned in the roadmap draft.
Confirmed in scope: since every consumer renders through the same `RadioButton` component
unconditionally, whatever this item builds must hold up for both shapes at once, not just the
short-fixed-list case.

## Success

- One `CabinetBox` per `schema.options` entry, keyed off whether it's the currently-selected
  `value` — popped for the selected option, flat for every other. Generalizes 11.1.2's value-keyed
  (not momentary-click) pop rule from one box to N; no hover/focus partial-pop on unselected
  options, same as Toggle.
- **Content-sized boxes**, not a fixed square — each box's width fits its own label, matching
  `Button`'s content-driven box (11.1.1) and today's existing `RadioButton.css` behavior
  (`padding: 4px 10px`, no fixed width). A fixed square (Toggle's approach) would make longer
  labels like "Highlight" or a user-typed company name illegible/truncated.
- **Breakpoint-driven height** — 32/40/48px via the same `useCabinetBoxHeight()` default Button
  uses, not a fixed size regardless of viewport (Toggle's approach). RadioButton rows sit inline in
  a drawer's normal content flow the same way Button does, not fixed next to one `DualLabel` row
  the way Toggle is.
- **Only the selected box is accent-tinted** (`--color-accent`); every unselected box stays
  surface-tinted (`--color-surface`) — matches today's existing `[data-state='on']` color swap in
  `RadioButton.css`. Color and pop-depth both signal the selected option together, a second cue
  that matters once a row has more than the one box Button/Toggle ever had to distinguish.
- Same fixed 2:1 vector, `CABINET_POP_DISTANCE`, pop-proportional glow, and sharp (no
  `border-radius`) front-face corners as every prior item — inherited for free from the shared
  `CabinetBox` primitive, nothing RadioButton-specific to build for any of these.
- **Row container**: today's single bordered/rounded pill (shared border, flush segments,
  `overflow: hidden`) is removed. Options render as independently-spaced `CabinetBox`es with real
  gaps between them, mirroring `VoxelTrack`'s spacing precedent (11.1.3) — needed so a popped box's
  wall/glow doesn't clip into its neighbor. Exact gap values and any `zIndex` bleed handling between
  adjacent popped boxes are left to this item's own spec-driven-development pass, the same way
  11.1.1–11.1.5 each left their own fine geometry to their spec rather than the roadmap/interview
  level.
- **Overflow**: a row of content-sized boxes that doesn't fit its container width wraps to a new
  line (`flex-wrap`), rather than a scroll/clamp fallback (the sliders' 11.1.3 approach). Relevant
  mainly to `CompanyButtonRow`'s longer, user-generated lists — Audio Setting/Decay Mode/Layer Type
  are short enough this rarely if ever triggers.
- `ToggleGroup.Root`/`ToggleGroup.Item` keep 100% of the real interaction — role, keyboard,
  disabled state, focus ring, the existing deselect-to-empty guard (Radix's single-mode
  `ToggleGroup` emitting `''` when the active item is clicked again, already guarded in
  `RadioButton.tsx`) — `CabinetBox` is rendered inside each item as pure visual. The "stationary hit
  box" rule from 11.1.1 applies unchanged.
- Same `schema`/`value`/`onChange`/`disabled` contract as today. `disabled` continues to disable
  the whole `ToggleGroup.Root` at once — no per-item disabled, unchanged from today.
- Every real `RadioButton` call site (`AUDIO_SETTING_SCHEMA`, `DECAY_MODE_SCHEMA`, per-layer
  `LAYER_TYPE_OPTIONS`, `CompanyButtonRow`) renders through the new cabinet boxes the moment this
  ships — no flag, no partial rollout, matching every prior 11.1.x item's own rollout.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: each box's GSAP pop/glow timeline drives only the
  cosmetic pop/morph and never calls `AudioEngine`; `onChange` still fires straight from Radix's
  `ToggleGroup.Root`, never from a cabinet timeline.
- Every cabinet pop/collapse is a GSAP timeline registered in `timelineMap`
  (`setTimeline`/`killTimeline`), keyed per-option (not one timeline for the whole row) — no
  timeline state in Zustand or React state.
- `prefers-reduced-motion` snaps pop/flat transitions instantly instead of tweening — inherited for
  free from `CabinetBox`/`cabinetAnimation.ts`, nothing new to build.

## Out of scope

- Per-item `disabled` — stays whole-group only, unchanged from today.
- Any new hover/partial-pop mechanism on unselected options — they stay fully inert except for the
  existing focus-visible outline, same as Toggle's flat state.
- The deselect-to-empty guard's own behavior — unchanged, already correct in `RadioButton.tsx`.
- Exact pixel gap/spacing values between boxes and any `zIndex` overlap handling — left to this
  item's own spec-driven-development pass.
- `Stepper`/`StepperWithToggle` (dropped from Cabinetry scope entirely — see 11.1.1), WorldView/
  terrain/sky styling, robot visuals, the power rocker switch and the rest of the Sleeve casing —
  same exclusions as every prior item.
- Accessibility/performance verification — deferred to 11.2, once every 11.1.x item has shipped.
- `AccordionContainer`, `Select`, `TextInput`/`CoordsInput` — 11.1.7–11.1.9, not this item.

## Forward Note

`CompanyButtonRow`'s inclusion means this item's spec pass should verify against a real long/many-
company list (approaching `MAX_COMPANIES` = 6, plus the `None`/`All` meta-options), not just the
short fixed lists (Audio Setting, Decay Mode, Layer Type) the roadmap draft originally described —
the wrap behavior and gapped-row layout need to actually be seen against that shape, the same way
11.1.5.1–11.1.5.3 caught a real bug only visible against genuine vertical consumers.
