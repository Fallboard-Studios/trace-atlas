# Intent: Oblique Cabinetry — SliderLog (Roadmap Phase 11.1.4)

Confirmed via `/interview-me`, 2026-09-09. Scopes the fourth item of the
[11.1.1–11.1.9 Oblique Cabinetry series](../todo/roadmap.md#1114-oblique-cabinetry-sliderlog),
wiring `SliderLog` into the shared voxel-track system
[11.1.3](oblique-cabinetry-slider-linear.md) built for `SliderLinear`.

## Outcome

`SliderLog`'s track+handle is replaced by the same `VoxelTrack` row of `CabinetBox` facades
`SliderLinear` already renders — same box size/gap per breakpoint, same self-fitting live box
count, same dual-fill/extrusion-falloff math (`voxelTrackMath.ts`, unmodified). The one real
question the roadmap left unaddressed — and the one thing the interview actually resolved,
beyond confirming the roadmap's own framing — is architectural, not visual: the non-trivial
"wire it all together" glue (`boxSize`/`gap` resolution, `useVoxelTrackBoxCount` call, vertical-
budget fallback, `trackLength`/`rootStyle` computation) currently lives inline in
`SliderLinear.tsx`. Rather than copy that glue into `SliderLog.tsx` as a second inline copy,
this item extracts it into one shared hook both components call — and retrofits the
already-shipped `SliderLinear.tsx` to use it in the same pass, rather than leaving the two
components on diverging copies of the same logic.

Box placement itself is driven by `SliderLog`'s own existing normalized `t ∈ [0, 1]`
(`sliderLogValueToT`/`sliderLogTToValue`, `sliderLogMath.ts`, unchanged) rather than the raw
log-scaled value: `computeVoxelBoxStates(t, 0, 1, boxCount)`, not
`computeVoxelBoxStates(value, schema.min, schema.max, boxCount)`. `voxelTrackMath.ts` assumes
uniform linear spacing between the min/max it's given — feeding it the raw log-scaled value
against the schema's real min/max would place the straddling box at the wrong visual position
(bunched away from wherever the log curve compresses values), since boxes are laid out evenly
along the track, matching exactly where Radix's own thumb already travels along `t`, not where
the underlying value happens to fall.

## User

Crawford (solo dev) — same "field equipment reporting what it's tuned to" fiction the rest of
the console leans on. Every real `SliderLog` consumer (Attack, Decay, Release) switches over the
moment this ships — no flag, no partial rollout, matching every prior Cabinetry item's rollout
posture.

## Why this scope first

`SliderLinear` (11.1.3) proved the voxel-track mechanism works and shipped it as genuinely
shared infrastructure (`VoxelTrack.tsx`, `voxelTrackMath.ts`) — but the *component-level* wiring
around that infrastructure was written once, for one consumer, with no reason yet to generalize
it. `SliderLog` is the second consumer and the first real test of whether that wiring
generalizes cleanly to a different `t → value` curve without copy-pasting the container-fitting
logic a second time. Doing the extraction now — rather than deferring it to `SliderCenteredZero`,
11.1.5 — means 11.1.5 arrives to a hook with two real call sites already proving it out, not a
third copy to reconcile after the fact.

## Success

- `SliderLog`'s traditional track+handle (`Slider.Track`/`Slider.Range`) is replaced by
  `VoxelTrack`, exactly as `SliderLinear` already renders it — same breakpoint-driven box
  size/gap, same live self-fitting box count, same trailing-reserve overflow guard, same
  vertical-budget fallback (`VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` when `verticalHeight` is
  omitted) `SliderLinear.tsx` already resolved for its own vertical case.
- A new shared hook (exact name/shape left to the spec pass, e.g. `useVoxelTrackSlider`) is
  extracted from `SliderLinear.tsx`'s existing inline glue, covering: resolving `boxSize`/`gap`
  via `useCabinetBoxHeight`/`useVoxelTrackGap`, resolving the box count via
  `useVoxelTrackBoxCount` (including the trailing-reserve subtraction and the vertical
  fixed-budget-vs-live-measurement branch), and computing `trackLength`/the `Slider.Root` inline
  `rootStyle`. **Both `SliderLinear.tsx` and `SliderLog.tsx` call this hook** — the retrofit is
  in scope for this item, not deferred.
- `SliderLog.tsx` computes its `VoxelTrack` `states` via
  `computeVoxelBoxStates(t, 0, 1, boxCount)`, where `t` is the same `sliderLogValueToT(value,
  schema.min, schema.max)` result already feeding Radix's own `Slider.Root value={[t]}` today —
  one `t` computation, two consumers (Radix's own thumb position and the voxel-track box
  placement), not two independently-derived values that could drift apart.
- `sliderLogMath.ts`'s actual curve (`sliderLogValueToT`/`sliderLogTToValue`, epsilon-floor
  behavior) is untouched — this item feeds its existing output into 11.1.3's box-placement math,
  it doesn't change what that output is.
- `SliderLog` (`src/components/ui/controls/`) keeps its existing `{ schema; value; onChange;
  disabled?; verticalHeight? }` contract — no call site (Attack/Decay/Release in
  `robotOptionsConfig.ts`/wherever else `SliderLog` is used) needs to change.
- `SliderLinear.tsx`'s own existing test coverage stays green after the retrofit — the hook
  extraction is required to be behavior-preserving for the already-shipped consumer, the same
  "acceptance criteria require the existing suite to pass unmodified" discipline 11.1.3's own
  Task 3 (widening `CabinetBox`) already used for a similarly risky touch to a shipped primitive.
  A comparable new `SliderLog.test.tsx` voxel-track suite is added for the new consumer.

## Constraint

- Per CLAUDE.md's Strict Separation guardrail: every cabinet pop/collapse and box-count refit
  stays a GSAP timeline registered in `timelineMap` (inherited for free via `CabinetBox`/
  `VoxelTrack`, unmodified) — no timeline state in Zustand or React state, and the timeline
  drives only the cosmetic pop/fill/refit, never calls `AudioEngine`. `onChange` still fires
  straight from Radix's `Slider.Root` drag/keyboard handling, unchanged.
- The hook extraction must not change `SliderLinear`'s own resolved `boxSize`/`gap`/`boxCount`/
  `trackLength`/`rootStyle` values for any input that already has test coverage — this is a
  refactor of *where* the logic lives, not a change to *what it computes* for the existing
  consumer.
- `VoxelTrack.tsx`/`voxelTrackMath.ts` themselves are not modified by this item — both are
  already correct, shared infrastructure; `SliderLog` and the retrofitted `SliderLinear` both
  consume them exactly as `SliderLinear` already does today.

## Out of scope

- **Exact hook name/shape/file location** — left to this item's own spec-driven-development
  pass, the same way 11.1.3 itself left its own box-count-hook implementation details open at
  the intent stage.
- `SliderCenteredZero` (11.1.5) — its own future `/interview-me` pass. Flagged in the roadmap
  itself as the one genuine adaptation (zero-anchored fill, not min-anchored), so this item's
  `t`-space placement approach should inform but not be assumed to transfer unmodified.
- Any change to `sliderLogMath.ts`'s curve/epsilon-floor math, `CabinetBox.tsx`, or
  `VoxelTrack.tsx`/`voxelTrackMath.ts` themselves.
- Any new `ControlSchema`/`SliderLogSchema` field.
- The two lingering 11.1.3 checkpoint items (the manual browser check, Crawford's explicit
  sign-off on `verticalHeight`'s fitting-budget semantics) — unrelated housekeeping from the
  prior item, not this one's concern.
- `Stepper`/`StepperWithToggle` (dropped from Cabinetry scope entirely, see 11.1.1),
  WorldView/terrain/sky styling, robot visuals (locked to audio attributes per CLAUDE.md), and
  the power rocker switch/`SleeveContainer` — same exclusions as every prior item.
- Accessibility/performance verification — deferred to 11.2, once every 11.1.x item has shipped.

## Forward Note

`SliderCenteredZero` (11.1.5) inherits both the voxel-track mechanism and the new shared hook
this item builds — its own spec pass should confirm the hook generalizes to a zero-anchored fill
rather than assuming it does, since 11.1.5 is flagged as the one genuine value-mapping
adaptation in the series, not a drop-in like this item.
