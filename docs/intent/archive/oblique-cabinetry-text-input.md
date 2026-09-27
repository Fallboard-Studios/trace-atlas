# Intent: Oblique Cabinetry — TextInput / CoordsInput

Confirmed via `/interview-me`, 2026-09-10. Scopes
[11.1.9](../todo/roadmap.md#1119-oblique-cabinetry-textinput--coordsinput), wiring `TextInput` into the
shared cabinet-box mechanism [11.1.1](oblique-cabinetry-foundation.md) built. Settles the question the
roadmap draft's own 11.1.9 section left open ("the actual pop-trigger mechanism is left open here") — raised
directly by Crawford, reusing [DirectionalPanel](oblique-cabinetry-directional-panel.md)'s facade *boundary*
but deliberately rejecting its nesting-context *mechanism*, see Design discussion below.

## Outcome

Every `TextInput` instance renders through a single, permanently-popped, non-animating `CabinetBox` facade —
`popped={true}` (a literal, never a variable) plus `skipMountAnimation`, the same mechanism
[AccordionContainer](oblique-cabinetry-accordion-container.md)'s own static facade and
[DirectionalPanel](oblique-cabinetry-directional-panel.md)'s facade both already use, so `CabinetBox`'s own
unmodified mount/transition logic never actually produces a tween for this instance. The facade wraps
`DualLabel` + the `<input>` together as one framed unit — `DirectionalPanel`'s own label-inside boundary, not
`RadioButton`/`Toggle`'s label-beside-the-box convention. The native `<input>` itself is entirely untouched:
typing, focus, caret, text selection, and `disabled`'s own existing styling all behave exactly as they do
today. The box itself never reacts to `disabled` (or anything else) — always popped, purely decorative.

**Unconditional and self-contained, by deliberate contrast with `DirectionalPanel`**: every `TextInput`
instance always renders its own facade, with zero awareness of what composes it — no
`DirectionalPanelNestingContext`-style mechanism, no per-instance opt-out, no "top-level" concept at all.
`CoordsInput` (which composes two `TextInput` instances for its X/Y fields) needs no Create item of its own
and no code change — it naturally ends up with two independent popped boxes side by side as a side effect of
`TextInput`'s own change, not a deliberate design choice about `CoordsInput` specifically.

## User

Crawford (solo dev) — the same "field equipment reporting what it's tuned to" visual language the rest of the
console leans on, extended to the one remaining primitive that never got it. Explicitly framed around more
than just today's two consumers: Crawford is planning further standalone `TextInput` fields (a robot-detail
name field among them), and wants each one to be simple and self-contained rather than needing to reason
about nesting/composition context the way `DirectionalPanel` does.

## Success

- Every real and future `TextInput` consumer — Company name (`CompanyCrudControls`), Sector Settings AS name
  (`SectorSettingsDrawer`), `CoordsInput`'s X and Y fields, and any later standalone field — renders through
  the same single facade with zero special-casing per call site.
- `CoordsInput.tsx` itself needs no edit — its two-box appearance falls out of `TextInput`'s own change with
  no call-site changes anywhere.
- The facade never obscures the native `<input>`'s own text/caret — `CabinetBox`'s existing
  `pointer-events: none` overlay convention (11.1.1) already guarantees this structurally, the same
  caret-cursor concern already resolved once for `Toggle`'s own empty box
  ([oblique-cabinetry-toggle.md](oblique-cabinetry-toggle.md)) — confirmed explicitly for a real text-entry
  element during this item's own spec pass, not assumed to transfer automatically.
- Same fixed 2:1 vector, `CABINET_POP_DISTANCE`, and sharp (no `border-radius`) front-face corners as every
  prior item — inherited for free from the shared `CabinetBox` primitive. No accent tint, matching
  `DirectionalPanel`'s/`AccordionContainer`'s own facades' `--color-surface` default.
- Same `{ schema, value, onChange, numeric?, disabled? }` props contract on `TextInput` — no call site needs
  to change.
- Every real `TextInput` call site renders through the new facade the moment this ships — no flag, matching
  every prior Cabinetry item's own rollout.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: the facade's own (non-existent, since it never transitions)
  timeline drives nothing beyond its own static geometry; `TextInput`'s real `onChange` continues to fire
  directly from the native `<input>`'s own event, entirely independent of `CabinetBox`.
- No new timer-based animation of any kind, and no new interaction of any kind — the facade never
  transitions and never responds to hover, focus, or `disabled`, by design.
- No shared-primitive change to `CabinetBox` itself expected — `DirectionalPanel`'s own facade already proved
  the literal-`popped`/`skipMountAnimation` static-facade pattern works unmodified; `TextInput`'s content
  (one `DualLabel` + one `<input>`) is fixed-height, unlike `DirectionalPanel`'s variable-height content, so
  `autoHeight` is not expected to be needed either — to be confirmed, not assumed, during this item's own
  spec pass.

## Design discussion (2026-09-10, via `/interview-me`)

- **CoordsInput's box count — the central question.** `CoordsInput` composing two `TextInput` instances is
  structurally the same shape `DirectionalPanel` solved with its nesting-context (a `ControlSchema`-driven
  component composing another). Initially proposed reusing that exact mechanism — one shared facade around
  the whole X/Y row, with the two inner `TextInput`s rendering bare when nested. **Corrected by Crawford**:
  no, every `TextInput` should be boxed "per input," independently, with `CoordsInput` simply ending up with
  two boxes as a natural consequence — not because `DirectionalPanel`'s nesting problem doesn't structurally
  exist here, but because `TextInput` will keep gaining new standalone consumers (confirmed: more are coming,
  including a robot-detail-page field), and a context-aware/nesting-sensitive `TextInput` would make every
  future consumer's behavior depend on what it happens to be composed inside — the opposite of "just act like
  an input."
- **Disabled state.** Confirmed the box stays unconditionally popped regardless of `disabled` — no reactive
  "flattens when disabled" behavior — matching `DirectionalPanel`'s own total absence of a disabled concept
  (it has none) rather than `Button`'s disabled-blocks-pop behavior. The native `<input>`'s own existing
  disabled styling (dimmed text, `not-allowed` cursor) is the only signal, unchanged from today.
- **"No other additions" clarified.** Crawford's own framing: "the inputs should just act like inputs, no
  other additions for animations etc" — read as covering both the native `<input>`'s own behavior (already
  covered by the base ask) *and* the facade box's own behavior (no reactive states of any kind beyond the
  permanent pop), which is what settled the disabled-state question above the same way.

## Out of scope

- The `DirectionalPanelNestingContext`-style mechanism itself — explicitly rejected for `TextInput`, not
  merely deferred. A future item should not assume this rejection generalizes to some other primitive without
  its own confirmation; it's specific to `TextInput` having no real "box inside a box" problem the way
  `DirectionalPanel` does.
- Any reactive box behavior keyed off `disabled`, hover, or focus — the box is permanently popped, full stop.
- Any change to `TextInput`'s own validation, `numeric` rendering, or `CoordsInput`'s rounding/blank-guard
  logic.
- Exact CSS/selector mechanics for a facade box wrapping `DualLabel` + a native `<input>` specifically (as
  opposed to `DirectionalPanel`'s arbitrary child content) — left to this item's own spec-driven-development
  pass, the same way prior items left their own fine implementation shape to spec rather than the roadmap or
  interview level.
- `Select` (roadmap 11.1.8, cut) — unrelated, separate item.

## Downstream

Hand this confirmed intent to `spec-driven-development` to produce the written spec, then
`planning-and-task-breakdown` for the task list — following the same process every other Oblique Cabinetry
item in `docs/specs/`/`docs/tasks/` used, whenever Crawford is ready to move past the roadmap-planning stage
for this item.
