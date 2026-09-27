# Intent: Oblique Cabinetry — SliderCenteredZero (Roadmap Phase 11.1.5)

Confirmed via `/interview-me`, 2026-09-09. Scopes the fifth item of the
[11.1.1–11.1.9 Oblique Cabinetry series](../todo/roadmap.md#1115-oblique-cabinetry-slidercenteredzero),
wiring `SliderCenteredZero` into the shared voxel-track system
[11.1.3](oblique-cabinetry-slider-linear.md) built and
[11.1.4](oblique-cabinetry-slider-log.md) generalized to a second consumer. Unlike 11.1.4, this is
not a drop-in — the roadmap flags it as the one genuine adaptation of the mechanism, and the
interview surfaced a real, previously-unaddressed architecture question: how a *dual-directional*
fill (zero-anchored, filling outward toward either the min or max end depending on the value's
sign) generalizes from `voxelTrackMath.ts`'s existing single-directional (min-anchored) fill.

## Outcome

`SliderCenteredZero`'s track+handle is replaced by the same `VoxelTrack` row of `CabinetBox`
facades `SliderLinear`/`SliderLog` already render — but the row is split into two independent
halves at a **fixed dead-center seam**, not a seam placed proportionally at the schema's actual
zero point. Box **count** is forced to always be **even** (a new even-only floor of `4`, replacing
the existing odd `VOXEL_TRACK_MIN_BOX_COUNT` floor of `3` for this component only) specifically so
that seam always lands exactly at `boxCount / 2`, cleanly between two boxes — never inside one.
This means the zero point's true proportional position (`sliderCenteredZeroMath.ts`'s existing
`zeroPointPercent`, general and asymmetric-bounds-aware) is **not** carried into box placement at
all: every real schema shipped today (Detune ±50 cents, EQ3 Low/Mid/High ±12dB, LFO Rate/Depth
Drift ±100%) is symmetric anyway, so a proportional seam and a dead-center seam already coincide
for every live consumer — the simplification costs nothing observable today and removes an entire
class of "value and zero land in the same box" edge case that a proportional seam would otherwise
create.

Each half then runs its own **independent** straddle/fill/extrusion-falloff computation, growing
outward **from the seam** toward that side's own physical end (min or max) as the value's
magnitude grows on that side — mirroring `computeVoxelBoxStates`'s existing min-anchored logic,
but reflected for the negative side so that the box nearest the seam fills first (at any small
negative value) and the box nearest `schema.min` fills last (only at `value === schema.min`
exactly). Only the side matching the current value's sign ever shows filled or straddling boxes;
the other side renders every one of its boxes fully flat. At `value === 0` exactly, **both** sides
render fully flat — no straddling box, no minimal-visibility marker anywhere — matching how a flat/
recessed box already reads as "off"/neutral everywhere else in the series (`Toggle`'s off state,
any voxel box's own 0%-filled state).

Per-side **extrusion-falloff** reuses `computeVoxelBoxPopDistance` completely unmodified, called
with a **locally-remapped index** (a box's distance from the seam within its own side, not its raw
global row index) so pop depth ramps shallow-at-the-seam → full-depth-at-that-side's-own-physical-
end, independently on each side — resolving the roadmap's own "applied relative to that filled
span rather than the track's min end" framing literally, not just for the fill percentage but for
the pop-distance ceiling too. Per-box **z-index** (`computeVoxelBoxZIndex`) is reused globally and
completely unmodified — it's purely a function of screen adjacency along the fixed 2:1 oblique
vector, unrelated to which side of the seam a box sits on or which way its fill grows.

`sliderCenteredZeroMath.ts`'s existing `computeFillRect`/`zeroPointPercent`/`valuePercent` — the
pre-Cabinetry custom fill-rectangle math — become dead code once `VoxelTrack` is the only visible
fill mechanism (the same fate `Slider.Range`'s own visible fill met in `SliderLinear`/`SliderLog`)
and are removed as part of this item, not left in place unused.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of the
console leans on. Every real `SliderCenteredZero` consumer (Detune, EQ3 Low/Mid/High, LFO Rate/
Depth Drift) switches over the moment this ships — no flag, no partial rollout, matching every
prior Cabinetry item's rollout posture.

## Why this scope first

`SliderCenteredZero` is the last of the 3 voxel-track sliders and the one the roadmap itself
flagged as unlikely to be a straightforward wiring pass. The interview's central finding is that
the mechanism's real complexity was never the math (`zeroPointPercent`'s general, asymmetric-safe
formula already existed pre-Cabinetry) — it was the *box-grid* consequences of a fill that can grow
in either of two directions from a point that isn't fixed at a box boundary. Deciding to force the
seam to a fixed, always-even, dead-center position collapses that entire class of ambiguity (a
value and the zero point sharing one box, an asymmetric proportional seam landing at a fractional
box position) into a much smaller, already-solved problem: two independent copies of the exact
single-direction straddle logic `SliderLinear` proved out in 11.1.3.

## Success

- `useVoxelTrackSlider` (`src/components/ui/controls/`) gains a new **optional** parameter (exact
  name/shape left to the spec pass, e.g. `{ forceEven?: boolean }`) that, when set, rounds the
  fitted box count down to the nearest even number with its own floor of `4` (2 boxes per side)
  **before** deriving `trackLength`/`rootStyle` — so both stay consistent with the box count
  actually rendered. Default/omitted behavior is **byte-identical** to today for `SliderLinear` and
  `SliderLog` — this is a strictly additive, opt-in extension, not a behavior change to either
  existing consumer. Both existing consumers' full test suites must pass unmodified, the same
  discipline 11.1.4's own retrofit of `SliderLinear` already established.
- A new per-side box-state computation (exact function name/shape/file location — `voxelTrackMath.ts`
  vs. `sliderCenteredZeroMath.ts` — left open to the spec pass) produces one `VoxelBoxState[]`
  spanning the whole row: the seam index is always `boxCount / 2`; boxes on the side matching the
  value's sign get real fill/straddle/pop-distance values (computed via the side's own local index,
  reflected for the negative side so fill/falloff both grow outward from the seam); boxes on the
  other side are uniformly flat (`fillPercent: 0, popT: 0, isStraddling: false`); at `value === 0`,
  every box on both sides is flat.
- Extrusion-falloff calls `computeVoxelBoxPopDistance(localIndex, sideBoxCount)` per side —
  `localIndex` is distance-from-seam within that side (`0` = adjacent to the seam), `sideBoxCount`
  is that side's own box count (always `boxCount / 2`) — not the whole row's global index/count.
  `computeVoxelBoxPopDistance` itself is not modified.
- `computeVoxelBoxZIndex` is called exactly as `SliderLinear`/`SliderLog` already call it — global
  index, whole-row `boxCount`, unmodified — since it depends only on screen adjacency, not on
  which side of the seam a box belongs to.
- `sliderCenteredZeroMath.ts`'s `computeFillRect`/`zeroPointPercent`/`valuePercent` and their
  existing test coverage are removed as dead code, not left unused alongside the new mechanism.
- `SliderCenteredZero` (`src/components/ui/controls/`) keeps its existing `{ schema; value;
  onChange; disabled?; verticalHeight? }` contract — no call site (Detune/EQ3/LFO Drift config)
  needs to change.
- `VoxelTrack.tsx`, `CabinetBox.tsx`, and every other `voxelTrackMath.ts` export not named above
  (`computeFittedBoxCount`, `computeVoxelTrackLength`, `computeVoxelTrackTrailingReserve`,
  `computeVoxelFillBackground`, `computeVoxelStraddleSizeFraction`, `VOXEL_TRACK_MIN_BOX_COUNT`,
  `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`) are untouched, reused exactly as `SliderLinear`/`SliderLog`
  already do.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: every cabinet pop/collapse and box-count refit
  stays a GSAP timeline registered in `timelineMap` (inherited unmodified via `CabinetBox`/
  `VoxelTrack`) — no timeline state in Zustand or React state, and the timeline drives only the
  cosmetic pop/fill/refit, never calls `AudioEngine`. `onChange` still fires straight from Radix's
  `Slider.Root` drag/keyboard handling, unchanged.
- `useVoxelTrackSlider`'s extension must not change `SliderLinear`'s or `SliderLog`'s own resolved
  `boxSize`/`gap`/`boxCount`/`trackLength`/`rootStyle` values for any input already covered by their
  existing tests — this is a strictly additive, opt-in capability, not a revision of the hook's
  existing default behavior.
- The seam is **always** `boxCount / 2` — the schema's actual `zeroPointPercent` value is not
  consulted for box placement, regardless of how asymmetric `min`/`max` might be. This is a
  deliberate, confirmed simplification, not an oversight to flag in review.
- `VoxelTrack.tsx`, `CabinetBox.tsx`, `computeVoxelBoxPopDistance`, and `computeVoxelBoxZIndex`
  themselves are not modified by this item — all four are already correct, shared infrastructure,
  consumed with recomputed *inputs* (a locally-remapped index, a per-side count) rather than
  changed *implementations*.

## Out of scope

- **Exact new function/parameter name, shape, and file location** for both the per-side box-state
  computation and `useVoxelTrackSlider`'s even-forcing option — left to this item's own
  spec-driven-development pass, the same way 11.1.3/11.1.4 each left their own new
  hook/function's implementation details open at the intent stage.
- **Asymmetric-bounds box placement.** The dead-center seam is the final answer, not a fallback for
  a future proportional-seam mode — if an asymmetric `SliderCenteredZeroSchema` ever ships live,
  its box row still splits exactly in half; only the underlying value math (`t`, fill magnitude per
  side) reflects the true asymmetric range, never the seam's own screen position.
- Any change to `sliderLogMath.ts`, `sliderLinearMath`-equivalent logic, `SliderLinear.tsx`, or
  `SliderLog.tsx` themselves — this item touches only `SliderCenteredZero.tsx`,
  `sliderCenteredZeroMath.ts`, and `useVoxelTrackSlider.ts`.
- Any new `ControlSchema`/`SliderCenteredZeroSchema` field.
- `Stepper`/`StepperWithToggle` (dropped from Cabinetry scope entirely, see 11.1.1),
  WorldView/terrain/sky styling, robot visuals (locked to audio attributes per CLAUDE.md), and the
  power rocker switch/`SleeveContainer` — same exclusions as every prior item.
- Accessibility/performance verification — deferred to 11.2, once every 11.1.x item has shipped.

## Forward Note

This is the last of the 3 voxel-track sliders — 11.1.6 (`RadioButton`) is the next item in the
series, but it doesn't depend on or extend anything built here: it reuses 11.1.1's single-box
cabinet mechanism and 11.1.2's state-keyed (not click-keyed) pop precedent, one `CabinetBox` per
`ToggleGroup.Item`, with no voxel-track involved. Once this item ships, `VoxelTrack`/
`voxelTrackMath.ts`'s core exports are exercised by all 3 intended consumers and should be
considered stable, closed infrastructure going forward rather than still-settling.
