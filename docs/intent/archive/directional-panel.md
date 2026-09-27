# Intent: `DirectionalPanel` Primitive

Confirmed via `interview-me` on 2026-09-04, triggered by seeing the Audio Rig's EQ Low/Mid/High bands still render stacked (block) rather than side-by-side (inline), despite `docs/specs/VERTICAL_SLIDERS.md`'s vertical-slider work already shipping `inline-flex` on the slider's own wrapper.

## Outcome

A new `ControlSchema` primitive, `DirectionalPanel` (`src/components/ui/controls/DirectionalPanel.tsx`/`.css`/`.test.tsx`, `sc-directional-panel` CSS class prefix — matching every other primitive's file/class convention):

- **Schema:** `DirectionalPanelSchema extends ControlSchemaBase { type: 'directionalPanel'; orientation?: 'row' | 'column' }` — `loreLabel`/`humanLabel` come from the shared `ControlSchemaBase`, both optional, same as every other primitive. `orientation` defaults to `'row'` when omitted.
- **Props:** `{ schema: DirectionalPanelSchema; children: ReactNode }` — no `value`/`onChange` (pure layout container, no domain value being edited), same shape `AccordionContainer` already establishes for a schema-driven container with no value.
- **Rendering:** `DualLabel` (composed internally, reading `schema.loreLabel`/`schema.humanLabel` — identical convention to every other primitive) renders above the content; content renders inside a flex container whose `flex-direction` is set by `orientation`, exposed via a `data-orientation` attribute (matching the `data-orientation`-driven CSS pattern the 3 slider components already established in `docs/specs/VERTICAL_SLIDERS.md`).
- Added to the `ControlSchema` union in `src/types/controls.ts` and to `CONTROL_SCHEMA_TYPES` (the runtime-testable "every variant covered, no duplicates" array).

## User

The developer (Crawford) — building toward regrouping the drawers' multi-slider rows (EQ bands, LPF/HPF Frequency/Resonance pairs, Delay/Reverb/Compressor's multiple sliders, drift pairs, Ping Controls, Ping Contour, Signature Array) that currently each sit in their own separate block-level `param-row` `<div>`, one slider per row.

## Why now

Diagnosed directly from the running app: `AudioRigDrawer.tsx`'s `eq3` block renders each band (Low/Mid/High) in its own `<div className="audio-rig-drawer__param-row">` ([AudioRigDrawer.tsx:178](../../src/components/panels/screen/console/AudioRigDrawer.tsx#L178)), and `.audio-rig-drawer__param-row` sets no `display` ([AudioRigDrawer.css:31](../../src/components/panels/screen/console/AudioRigDrawer.css#L31)), so each defaults to `display: block`. Since each EQ slider is the *sole child* of its own separate block box, the slider's own `inline-flex` (from the vertical-sliders work) has no sibling to sit beside — three block boxes stack regardless of what `display` value the single child inside each one uses. `DirectionalPanel` is the fix: a single shared flex container multiple sliders (or other controls) can sit inside together.

## Success

- `DirectionalPanel` renders correctly in both orientations (`'row'`: content flexes horizontally; `'column'`: content flexes vertically), defaulting to `'row'` when `schema.orientation` is omitted.
- Label rendering matches `DualLabel`'s existing behavior exactly — renders neither, one, or both of `loreLabel`/`humanLabel`, nothing extra when both are absent (same "renders nothing" precedent every other primitive already relies on).
- `DirectionalPanelSchema` is a full `ControlSchema` union member; `CONTROL_SCHEMA_TYPES`'s closed-set assertion (`src/types/controls.test.ts`) is updated to the new total count, no duplicates.
- Documented in `docs/COMPONENT_LIBRARY.md`'s primitive table.
- Full Vitest + Testing Library coverage, `npm run build:types`/`npm run lint`/`npm test`/`npm run build` all clean.

## Constraint

Stays a pure layout container — no value/onChange, no interactive/ephemeral state (unlike `AccordionContainer`'s open/closed `useState`, `DirectionalPanel` has no state of its own at all). Minimal props: exactly what was asked for (label pair via schema, orientation, children) — no gap override, no alignment option, no additional configurability beyond `'row' | 'column'` unless asked for later.

`'row'` orientation is `flex-nowrap` — confirmed during design discussion (2026-09-04), not left as an unstated default. If a real drawer ever overflows a row, the fix is an explicit second-level `DirectionalPanel` around the group that needs to break, or revisiting this decision — not a `wrap` prop added speculatively now.

## Design discussion (2026-09-04)

Two things raised during review, both confirmed rather than changed:

- **Composes standalone, no `AccordionContainer` dependency.** Same props shape as every other primitive (`{ schema, children }`) — usable directly in a drawer's top-level JSX, an `AccordionContainer`'s children, or nested inside another `DirectionalPanel`. Nothing couples it to accordions.
- **Nesting (`DirectionalPanel` inside `DirectionalPanel`) is expected, not a smell.** This is the standard way 1D layout primitives (flexbox itself, `HStack`/`VStack`-style design-system stacks) build 2D shapes — the alternative (CSS Grid `grid-template-areas`) is the heavier, more-configuration path this component is meant to avoid, not a simpler one. Checked against the real wiring targets in "Why now": actual nesting depth stays shallow (EQ3 is 1 `row` inside 1 `AccordionContainer`; Signature Array is at most a `row` inside a `column`) — nothing on the list needs 3+ levels.

## Out of scope (this round)

- Wiring `DirectionalPanel` into any real drawer (`AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, `PingControlsDrawer.tsx`, `PingContourDrawer.tsx`, etc.) to actually fix the EQ row or any other multi-slider grouping — the component lands alone this round, no consumer wired yet, following the same "component first, consumers later" sequencing `useAutoSliderOrientation` used in `docs/specs/VERTICAL_SLIDERS.md`.
- The full list of where `DirectionalPanel` should apply across the app — the user has a fuller list and will provide it separately for a follow-up wiring pass.

## Downstream

Next step: hand this confirmed intent to `spec-driven-development` to produce the written spec, then `planning-and-task-breakdown` for the task list — matching the process `docs/specs/VERTICAL_SLIDERS.md`/`docs/tasks/VERTICAL_SLIDERS.md` already followed for the sibling feature.
