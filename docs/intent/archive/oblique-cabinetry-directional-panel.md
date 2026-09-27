# Intent: Oblique Cabinetry — DirectionalPanel

Confirmed via `/interview-me`, 2026-09-10. Extends the Oblique Cabinetry visual language
([11.1.1](oblique-cabinetry-foundation.md) onward, most recently
[AccordionContainer](oblique-cabinetry-accordion-container.md)) to `DirectionalPanel` — a component the
roadmap's own 11.1.9 section explicitly called out of scope for the original 11.1.x series ("`DualLabel`/
`DirectionalPanel` are pure layout/display with no interactive hit box of their own and were never in
scope"). Not a numbered roadmap item; raised directly by Crawford after AccordionContainer shipped.

## Outcome

Every **top-level** `DirectionalPanel` — one rendered directly by a drawer/`AccordionContainer`, not one
nested inside another `DirectionalPanel` for sub-layout — renders through a permanently-popped, non-
animating `CabinetBox` facade, the same mechanism [AccordionContainer's own facade](oblique-cabinetry-accordion-container.md)
uses: `popped={true}` (a literal, never a variable) plus `skipMountAnimation`, so `CabinetBox`'s own
unmodified mount/transition logic never actually produces a tween for this instance. Unlike
AccordionContainer's facade (a fixed-height, 2-line-label-sized box), this one wraps the **whole panel** —
`DualLabel` plus the full row/column of already-individually-`CabinetBox`ed child controls (sliders,
buttons, toggles, radio buttons) — so its height genuinely varies per instance rather than being one tuned
constant.

## User

Crawford (solo dev), continuing the same "field equipment reporting what it's tuned to" visual language the
rest of the console leans on — now extended to the layout groups controls sit inside, not just the controls
themselves.

## Scope: "top-level" is a render-time property, not a per-schema one

Audited every real `DirectionalPanel` call site (20 total, `src/components/robot/`,
`src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/ui/controls/LfoTargetGroup.tsx`)
against actual DOM ancestry, not just schema names:

- **Top-level today**: `AudioSettingSection`'s `ROBOT_OUTPUT_PANEL_SCHEMA`; `PingContourDrawer`'s
  `PING_CONTOUR_PANEL_SCHEMA`; `PingControlsDrawer`'s `PHRASING_PANEL_SCHEMA` and `FREQUENCY_PANEL_SCHEMA`
  (siblings, both direct children of the drawer, not of each other); `SignatureArrayDrawer`'s
  `ROBOTS_DRIFT_GROUP.panel` and each mapped `block.panel`; `AudioRigDrawer`'s
  `SPEED_AUTOMATION_PANEL_SCHEMA`, `EQ_FILTERS_ROW_PANEL_SCHEMA`, and `TIME_SPACE_COLUMN_PANEL_SCHEMA`.
- **Nested today (no facade)**: `PingControlsDrawer`'s `RHYTHM_PANEL_SCHEMA` (inside `PHRASING_PANEL_SCHEMA`);
  `LfoTargetGroup`'s own 2 anonymous panels (`${groupId}.group`/`${groupId}.sliders`); `AudioRigDrawer`'s
  `FILTERS_COLUMN_PANEL_SCHEMA` (inside `EQ_FILTERS_ROW_PANEL_SCHEMA`) and the delay/reverb/compressor
  top-row/bottom-row anonymous panels (all inside `renderBlock()`'s own panel, below).
- **The same call site is top-level in one context and nested in another**: `AudioRigDrawer`'s
  `renderBlock()` always wraps its content in `<DirectionalPanel schema={block.panel}>` — for most groups
  (Output, Compressor, Limiter, Delay, Reverb) that's a direct child of `AccordionContainer` (top-level), but
  for the `eqFilters`/`timeSpace` groups the exact same call site renders **nested** inside
  `EQ_FILTERS_ROW_PANEL_SCHEMA`/`TIME_SPACE_COLUMN_PANEL_SCHEMA`. Whether a given `DirectionalPanel`
  instance gets the facade cannot be a static property of its schema or call site — it depends on real
  render-time ancestry, confirming a React Context flag (each `DirectionalPanel` checks "is there already an
  ancestor `DirectionalPanel` context marking itself as inside one?") is the only mechanism that can express
  this correctly, not a per-call-site `topLevel` prop that would need to vary by caller.

## Success

- **Facade wraps the whole panel** — `DualLabel` plus the full content area (row or column of child
  controls) — as one framed visual unit, not just the label. Reads as "this is one grouped section," filling
  the framing role AccordionContainer's own pre-11.1.7 bordered box used to serve before that item replaced
  it with a facade.
- **Nested `DirectionalPanel`s stay plain** — no facade-inside-facade stacking, determined automatically at
  render time (Context-based), not by auditing/flagging each of the 20 call sites by hand.
- **No accent tint** — matches `AccordionContainer`'s facade, `CabinetBox.css`'s plain `--color-surface`
  default.
- **The facade's own default horizontal padding is accepted**, not specially zeroed — a fixed, deterministic
  ~28px reduction in the width some child sliders measure for their own voxel-track box-count fitting
  (`ResizeObserver`-driven, documented in `DirectionalPanel.css`'s own comments) is an acceptable minor
  quantization difference, not something this item works around.
- **`CabinetBox` gains live height measurement** — a second `ResizeObserver`, mirroring the width one it
  already has — since this facade's content height genuinely varies per instance (a one-slider row vs. a
  multi-row EQ block), unlike every fixed-height consumer before it (Button/Toggle/RadioButton/
  AccordionContainer's own facade). Purely additive: existing fixed-height consumers are unaffected.
- Same fixed 2:1 vector, `CABINET_POP_DISTANCE`, and sharp (no `border-radius`) front-face corners as every
  prior item — inherited for free from the shared `CabinetBox` primitive.
- Same `{ schema, children }` props contract — no call site needs to change.
- Every real top-level `DirectionalPanel` renders through the new facade the moment this ships — no flag,
  matching every prior Cabinetry item's own rollout.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: the facade's own (non-existent, since it never transitions)
  timeline drives nothing beyond its own static geometry; `DirectionalPanel` has no `onChange`/interaction of
  its own to protect, but the principle still applies to `CabinetBox`'s own internals, unmodified in this
  regard.
- `CabinetBox`'s new height-measurement capability is purely additive (a new optional/internal behavior) —
  no existing consumer's rendering changes as a result.
- No new timer-based animation of any kind — the facade never transitions, by design.

## Out of scope

- The exact mechanism for "top-level" detection (Context shape, provider placement, naming) — an
  implementation-shape decision for this item's own spec-driven-development pass, not resolved here beyond
  "it must be render-time/ancestry-based, not a per-call-site flag."
- Any change to `DirectionalPanel`'s own orientation/wrap/`auto`-resolution logic
  (`useAutoPanelOrientation`), or to the `flex-basis: 0`/`min-width: 0` box-fitting fix its own CSS already
  documents.
- Zero-padding the facade to avoid the ~28px measured-width reduction — explicitly accepted, not worked
  around (see Success).
- Any animation on the facade itself — it stays permanently popped, identical in spirit to
  AccordionContainer's.
- `Select`, `TextInput`/`CoordsInput` (roadmap 11.1.8–11.1.9) — unrelated, separate items.

## Forward Note

This is the first Cabinetry item whose content height isn't knowable ahead of render, and the first to
require a shared-primitive change beyond AccordionContainer's own additive `skipMountAnimation`/
`boxHeight`-override pattern. The new height-`ResizeObserver` capability should be built generically enough
that a future consumer with the same "static facade around variable-height content" shape doesn't need its
own bespoke measurement logic.
