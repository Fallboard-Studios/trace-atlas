# Intent: SliderLinear Read-Only Mode

Confirmed via `/interview-me`, 2026-09-13. Covers [Roadmap Phase 15.1](../todo/roadmap.md#151-component-sliderlinear-read-only-mode) — split out of the original item 15 (Redesign: Robot Cards) once Crawford's written notes made clear the robot-card (15.2) and robot-detail (15.3) redesigns both need a live, non-interactive value readout that looks like the existing slider rather than bespoke markup. This item is the primitive-level prerequisite; it does not touch 15.2/15.3's own layouts.

## Outcome

`SliderLinear` (`src/components/ui/controls/SliderLinear.tsx`) gains an optional `readOnly` prop:

- When `readOnly` is true, the component renders the same `DualLabel` row, `VoxelTrack` fill, and formatted value label as the interactive slider — full color, no desaturation, all three orientations (`horizontal`/`vertical`/`auto`) still supported via the existing `useAutoSliderOrientation`/`useVoxelTrackSlider` hooks feeding `VoxelTrack`.
- It renders **without** Radix's `Slider.Root`/`Slider.Track`/`Slider.Thumb` at all — no thumb, no drag/keyboard interaction, not a tab stop, no hover/focus interaction cues.
- The wrapper is a plain `role="status"` element instead of a slider widget — the same precedent `AudioStatusBadge` already established in this codebase for "a value display that happens to look like a control." Its accessible name composes the schema's label with the current formatted value (e.g. "Power: 72%"), mirroring `AudioStatusBadge`'s own `aria-label` composition.
- This is a branch inside the existing `SliderLinear.tsx`/`readOnly` prop — one component, one import, for both interactive and read-only consumers — not a new sibling component.
- `onChange` stays a required prop on `SliderLinearProps` regardless of mode; a read-only consumer passes a no-op. No conditional/discriminated prop type is introduced — every other primitive in the Design System's fixed inventory (`docs/COMPONENT_LIBRARY.md`) takes a flat, unconditional prop shape, and this is a two-call-site feature, not worth becoming the first exception.

## User

Crawford (solo dev), building 15.2 (Robot Cards redesign) and 15.3 (Robot Detail Top Card redesign), both of which need to show Battery/Power as a live readout using the slider's existing visual language.

## Why now

15.3 is blocked on this — its Power display is specced as this read-only slider, not custom markup. Building it as its own item first means 15.3 has no primitive work left to do when it starts.

## Success

- `SliderLinear` accepts `readOnly?: boolean`; when true, it shows the current value via the identical `VoxelTrack` visual (same fill logic, same colors, all orientations), with no thumb and no way to change the value via pointer or keyboard.
- The read-only element is `role="status"`, not focusable, and its accessible name states both the param's label and its current value.
- `docs/COMPONENT_LIBRARY.md`'s `SliderLinear` contract entry is updated to document the new prop and its rendering divergence.
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean, with new test coverage for the read-only branch (`SliderLinear.test.tsx`).

## Constraint

- No conditional/discriminated prop types — `onChange` remains required in all modes.
- No visual "disabled" treatment (no desaturation, no dimming) — a full battery reading should look full, not muted.
- Reuses `VoxelTrack`/`DualLabel`/`formatDisplayValue` exactly as the interactive slider does; no new visual sub-component.
- No `setTimeout`/`setInterval`/`requestAnimationFrame` — this is a pure render-branch change, no new timing behavior.

## Out of scope

- Any change to `SliderLog` or `SliderCenteredZero` — not requested, not touched.
- Wiring this into 15.2's or 15.3's actual card layouts — that's each item's own scope.
- Restricting orientation support (e.g. horizontal-only) — full orientation support is retained even though the only known consumers so far are horizontal.
- Any change to the interactive (non-`readOnly`) rendering path's behavior or appearance.
