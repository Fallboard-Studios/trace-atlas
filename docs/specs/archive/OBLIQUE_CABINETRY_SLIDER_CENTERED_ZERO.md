# Phase Spec: Oblique Cabinetry — SliderCenteredZero (Roadmap Phase 11.1.5)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-slider-centered-zero.md](../intent/oblique-cabinetry-slider-centered-zero.md)
(confirmed via `/interview-me`, 2026-09-09). Source of scope:
[docs/todo/roadmap.md § 11.1.5](../todo/roadmap.md#1115-oblique-cabinetry-slidercenteredzero) —
the last of the 3 voxel-track sliders (11.1.3–11.1.5), and the one the roadmap itself flagged as
unlikely to be a straightforward wiring pass. Prior art this spec reuses directly, unmodified
except where §1.3 below documents a small, additive extension: `VoxelTrack.tsx`,
`voxelTrackMath.ts`'s existing exports (`computeVoxelBoxStates`, `computeVoxelBoxPopDistance`,
`computeVoxelBoxZIndex`, `computeVoxelFillBackground`, `computeVoxelStraddleSizeFraction`,
`computeFittedBoxCount`, `computeVoxelTrackLength`, `computeVoxelTrackTrailingReserve`,
`VOXEL_TRACK_MIN_BOX_COUNT`, `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`), `useCabinetBoxHeight`/
`useVoxelTrackGap`, `useVoxelTrackBoxCount`, `CabinetBox.tsx`. This phase touches presentation
only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `SliderCenteredZeroSchema`/
`ControlSchema` are unchanged.

**A note on grounding:** every code reference and current-behavior claim below is checked directly
against the actual files on `main` as of this writing (`src/utils/voxelTrackMath.ts`,
`src/components/ui/controls/{VoxelTrack,CabinetBox,SliderCenteredZero,SliderLog,SliderLinear,
useVoxelTrackSlider,useVoxelTrackBoxCount,useCabinetBoxHeight}.{ts,tsx}` and their test files,
`src/utils/cabinetGeometry.ts`), not against the intent doc's own narrative — where the two differ
(§1.3), the live source and this spec's own resolution win.

---

## 1. Overview & Claude Explanation

The intent doc resolved the conceptual shape (a fixed dead-center seam, forced-even box count,
per-side independent fill/falloff, fully-flat at `value === 0`) but explicitly left the exact
function names, parameter shapes, and file placement open. Four implementation-shape questions are
resolved below, plus one real correction to the intent doc's own phrasing, found while working
through exactly how per-side extrusion-falloff has to reach `VoxelTrack.tsx`.

### 1.1 Where the new box-state math lives: `voxelTrackMath.ts`, not a revived `sliderCenteredZeroMath.ts`

The intent doc left this open. `sliderCenteredZeroMath.ts` today holds only the pre-Cabinetry fill
math (`computeFillRect`/`zeroPointPercent`/`valuePercent`) — all three retired by this item (§1.5).
The new per-side box-state function is a genuine sibling of `computeVoxelBoxStates`: same return
type (`VoxelBoxState[]`), same "no DOM, no GSAP, no React" purity, and — per `voxelTrackMath.ts`'s
own existing file-header comment — that file already declares itself "shared by SliderLinear...
and its two thin follow-ups, SliderLog/SliderCenteredZero." Adding `computeVoxelBoxStatesCenteredZero`
there, alongside the function it directly calls twice internally (`computeVoxelBoxStates`), keeps
every voxel-track box-state function in one place rather than splitting the family across two files
for no structural reason. With `computeFillRect`/`zeroPointPercent`/`valuePercent` removed,
`sliderCenteredZeroMath.ts` would hold nothing at all — so the file itself is deleted, not left
behind empty (§1.5, §2).

### 1.2 The per-side computation: `computeVoxelBoxStatesCenteredZero`

The seam is always `Math.floor(boxCount / 2)` — dead-center, never the schema's own proportional
`zeroPointPercent` (retired). This splits the row into a negative side (global indices
`0..seamIndex-1`, `negativeCount = seamIndex` boxes) and a positive side (global indices
`seamIndex..boxCount-1`, `positiveCount = boxCount - seamIndex` boxes).

Only the side matching `value`'s sign is ever computed with real fill; the other side is uniformly
flat. At `value === 0` exactly, both sides are flat — no exception, no marker.

The genuinely new piece is the **negative side's index direction**. `computeVoxelBoxStates`
always fills its own conceptual index `0` *first* (at any small magnitude) and its last index
*last* (only at the extreme). For the positive side, conceptual index `0` = nearest zero = nearest
the seam — which is also its lowest *global* index on that side (`seamIndex`), so no remapping is
needed; `computeVoxelBoxStates(value, 0, max, positiveCount)`'s output drops straight into global
indices `seamIndex..boxCount-1` in the order it's returned.

For the negative side, "nearest the seam" (the box that must fill *first*, at any small negative
magnitude) is the *highest* global index on that side (`seamIndex - 1`), not the lowest. Calling
`computeVoxelBoxStates(Math.abs(value), 0, Math.abs(min), negativeCount)` still fills its own
conceptual index `0` first — but conceptual index `0` must now land at global index
`seamIndex - 1`, and conceptual index `negativeCount - 1` (fills last, only at `value === min`)
must land at global index `0` (nearest min). This is a straight reversal:
`computeVoxelBoxStates(...).slice().reverse()`, then assigned to global indices `0..negativeCount-1`
in that reversed order.

Hand-derived check (`min: -50, max: 50, boxCount: 4, value: -5`, so `negativeCount: 2,
positiveCount: 2`): `computeVoxelBoxStates(5, 0, 50, 2)` → `t = 0.1`, `rawPosition = 0.2`,
`straddlingIndex = 0` → `[{fillPercent: 20, popT: 1, isStraddling: true}, {fillPercent: 0, popT: 0,
isStraddling: false}]`. Reversed → `[{fillPercent: 0, ...flat}, {fillPercent: 20, ...straddling}]`.
Assigned to global `[0, 1]`: global index `0` (nearest min) is flat/empty; global index `1` (nearest
the seam) is the 20%-filled straddler. This is the intended physical read — at a small negative
value, the box right next to the seam shows the live position, and the box further toward `min`
stays untouched until the value's magnitude actually reaches that far.

```typescript
export function computeVoxelBoxStatesCenteredZero(
  value: number,
  min: number,
  max: number,
  boxCount: number,
): VoxelBoxState[] {
  const seamIndex = Math.floor(boxCount / 2);
  const negativeCount = seamIndex;
  const positiveCount = boxCount - seamIndex;

  const flatState = (): VoxelBoxState => ({ fillPercent: 0, popT: 0, isStraddling: false });

  const negativeFill =
    value < 0
      ? computeVoxelBoxStates(-value, 0, -min, negativeCount).slice().reverse()
      : Array.from({ length: negativeCount }, flatState);

  const positiveFill =
    value > 0
      ? computeVoxelBoxStates(value, 0, max, positiveCount)
      : Array.from({ length: positiveCount }, flatState);

  const negativeStates = negativeFill.map((state, i) => ({
    ...state,
    popDistanceLocalIndex: negativeCount - 1 - i,
    popDistanceLocalCount: negativeCount,
  }));

  const positiveStates = positiveFill.map((state, i) => ({
    ...state,
    popDistanceLocalIndex: i,
    popDistanceLocalCount: positiveCount,
  }));

  return [...negativeStates, ...positiveStates];
}
```

`boxCount` is expected to already be even (§1.4 guarantees this for every real caller); an odd
count still degrades reasonably (`Math.floor` gives the negative side the extra box) but making
that graceful isn't this function's job to guarantee — `useVoxelTrackSlider`'s `forceEven` option
is what actually promises it.

### 1.3 Post-implementation-style correction, found while deriving §1.2's falloff: `VoxelTrack.tsx` needs a small, additive, backward-compatible extension after all

The intent doc's own Constraint section states `VoxelTrack.tsx`... is not modified by this item"
and separately describes falloff as "consumed with recomputed inputs... rather than changed
implementations." Working through the mechanism concretely shows those two statements are in
tension: `VoxelTrack.tsx` computes `computeVoxelBoxPopDistance(i, states.length)` **itself**, inside
its own `.map` loop, using the array's raw position/length — there is no existing prop through
which a caller can substitute a different index/count pair without either touching that file or
duplicating the entire component.

A duplicate `VoxelTrack` was considered and rejected: rendering the two sides as two independent
`VoxelTrack` instances would make each side's own `computeVoxelBoxZIndex` calls **wrong**. Z-index
must stay computed from each box's true *global* row position (`computeVoxelBoxZIndex`'s own
comment: "up/left of a neighbor outranks down/right of it," purely about screen adjacency along the
fixed oblique vector) — two separate per-side numbering scales would make the negative side's own
seam-adjacent box (which needs a *high* global z to correctly paint over its right neighbor) carry
a low index in its own local scale instead, breaking the paint-order guarantee exactly at the one
seam boundary that matters. Pop-distance and z-index therefore need *different* index scopes — local
for one, global for the other — which only a single shared array threaded through one `VoxelTrack`
instance can give both at once.

The resolution: `VoxelBoxState` gains two new **optional** fields, and `VoxelTrack.tsx` gains a
2-line change that prefers them when present and falls back to today's exact behavior when absent
(`SliderLinear`/`SliderLog` never set them, so their own rendering is provably unaffected —
`VoxelTrack.test.tsx`'s existing pop-distance assertion, §5, requires no edit). This is the same
"opt-in, byte-identical-by-default" shape 11.1.4 already used for its own risky touch to shared
infrastructure (there, `useVoxelTrackSlider`'s extraction was required to leave `SliderLinear`'s
20+ existing tests passing unmodified) — applied here to a 2-field/2-line change instead of a whole
new hook. Z-index (`computeVoxelBoxZIndex`) is untouched and uncalled-with-anything-different: it
keeps using the box's real global `i`/`states.length`, exactly as `SliderLinear`/`SliderLog` already
do, since it depends only on screen adjacency, never on which side of a seam a box belongs to.

```typescript
export interface VoxelBoxState {
  fillPercent: number;
  popT: number;
  isStraddling: boolean;
  /**
   * SliderCenteredZero only (roadmap 11.1.5). When set, VoxelTrack computes
   * this box's popDistance ceiling from THIS local index/count pair —
   * distance from the zero seam within this box's own side of the track —
   * instead of the box's raw position in the whole row. Both fields are
   * always set together or not at all (computeVoxelBoxStatesCenteredZero
   * always sets both; computeVoxelBoxStates, used by SliderLinear/SliderLog,
   * never sets either, so their falloff is completely unaffected — this is
   * an additive, opt-in extension of VoxelBoxState, not a revision to its
   * existing meaning). z-index (computeVoxelBoxZIndex) is NOT affected by
   * either field — it always uses the box's real global index/boxCount,
   * since it depends only on screen adjacency, not fill semantics. See
   * docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.3.
   */
  popDistanceLocalIndex?: number;
  popDistanceLocalCount?: number;
}
```

`VoxelTrack.tsx`'s one changed line (inside the existing `states.map((state, i) => { ... })`):

```typescript
// was: const popDistance = computeVoxelBoxPopDistance(i, states.length);
const popDistance = computeVoxelBoxPopDistance(
  state.popDistanceLocalIndex ?? i,
  state.popDistanceLocalCount ?? states.length,
);
```

Nothing else in `VoxelTrack.tsx` changes — the straddling slot's own two `CabinetBox` pieces
already share this same `popDistance` variable (computed once, above the `if (!state.isStraddling)`
branch), so both the ordinary-box path and the straddle path pick up the override automatically.

### 1.4 `useVoxelTrackSlider` gains an opt-in `forceEven` option

`SliderCenteredZero.tsx` needs its box count rounded down to the nearest even number, floored at a
new `4` (2 per side) rather than the existing odd `VOXEL_TRACK_MIN_BOX_COUNT` of `3` — so the
dead-center seam always lands exactly on a box boundary. `useVoxelTrackSlider`'s existing
`trackLength`/`rootStyle` are derived *from* its resolved `boxCount`, so the even-rounding must
happen *before* those are computed, inside the hook itself — not as a transform `SliderCenteredZero`
applies afterward to the hook's already-returned values, which would leave `trackLength`/`rootStyle`
sized for the wrong (odd) count.

```typescript
export const VOXEL_TRACK_MIN_BOX_COUNT_EVEN = 4;

/**
 * Rounds a fitted box count down to the nearest even number, floored at
 * VOXEL_TRACK_MIN_BOX_COUNT_EVEN (4) rather than the odd VOXEL_TRACK_MIN_BOX_COUNT
 * (3) — SliderCenteredZero's own requirement (roadmap 11.1.5) so its
 * dead-center seam (Math.floor(boxCount / 2)) always lands exactly on a box
 * boundary, never inside one. An already-even count is returned unchanged.
 */
export function computeEvenBoxCount(rawBoxCount: number): number {
  const rounded = rawBoxCount - (rawBoxCount % 2);
  return Math.max(VOXEL_TRACK_MIN_BOX_COUNT_EVEN, rounded);
}
```

```typescript
export interface VoxelTrackSliderOptions {
  /**
   * Forces the fitted box count down to the nearest even number (floored at
   * VOXEL_TRACK_MIN_BOX_COUNT_EVEN, 4) before deriving trackLength/rootStyle.
   * Omitted or false preserves SliderLinear/SliderLog's exact existing
   * behavior — this is a strictly additive, opt-in extension.
   */
  forceEven?: boolean;
}

export function useVoxelTrackSlider(
  wrapperRef: RefObject<HTMLElement | null>,
  orientation: 'horizontal' | 'vertical',
  verticalHeight?: number,
  options?: VoxelTrackSliderOptions,
): VoxelTrackSliderLayout {
  const boxSize = useCabinetBoxHeight();
  const gap = useVoxelTrackGap();
  const isVertical = orientation === 'vertical';
  const explicitLength = isVertical ? (verticalHeight ?? VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT) : undefined;
  const trailingReserve = computeVoxelTrackTrailingReserve(orientation);
  const rawBoxCount = useVoxelTrackBoxCount(wrapperRef, orientation, boxSize, gap, explicitLength, trailingReserve);
  const boxCount = options?.forceEven ? computeEvenBoxCount(rawBoxCount) : rawBoxCount;
  const trackLength = computeVoxelTrackLength(boxCount, boxSize, gap) + trailingReserve;

  const rootStyle = useMemo<CSSProperties>(
    () => (isVertical ? { height: trackLength, width: boxSize } : { width: trackLength, height: boxSize }),
    [isVertical, trackLength, boxSize],
  );

  return { boxSize, gap, boxCount, trackLength, rootStyle };
}
```

This means `verticalHeight`'s existing fitting-budget behavior (11.1.4 §1.4's own already-shipped
change) now composes with even-rounding for `SliderCenteredZero`: the budget is fitted first
(`computeFittedBoxCount` against the budget), then that raw count is rounded down to the nearest
even number — so the actually-rendered height can be one box-and-gap shorter than the tightest
even-safe fit, the same "sometimes the layout is forced narrower than it strictly needs to be"
trade-off confirmed during the interview.

### 1.5 `sliderCenteredZeroMath.ts` is deleted, not emptied

`computeFillRect`/`zeroPointPercent`/`valuePercent` have no remaining caller once `VoxelTrack`
is the only visible fill mechanism (mirroring how `Slider.Range`'s own visible fill was retired for
`SliderLinear`/`SliderLog`) — nothing about `SliderCenteredZero`'s new rendering needs the schema's
*proportional* zero position (the seam is always dead-center, §1.2). The file is removed entirely,
along with `sliderCenteredZeroMath.test.tsx`... except there is no such separate file: this
component's math tests live inline inside `SliderCenteredZero.test.tsx`'s own `describe
('sliderCenteredZeroMath', ...)` block (§5), which is deleted along with the three functions it
tests.

### 1.6 `SliderCenteredZero.tsx` and `.css` — the same full-rewrite shape `SliderLinear`/`SliderLog` already took

`SliderCenteredZero.tsx` becomes a near-exact copy of `SliderLog.tsx`'s own 11.1.3/11.1.4 shape
(§4), minus the `t`-curve conversion (`SliderCenteredZero` has no logarithmic curve — `Slider.Root`
keeps using the schema's literal `min`/`max`/`value`, exactly as it does today), plus passing
`{ forceEven: true }` to `useVoxelTrackSlider` and calling `computeVoxelBoxStatesCenteredZero`
instead of `computeVoxelBoxStates`. `SliderCenteredZero.css` needs every change `SliderLog.css`
already made for its own voxel-track conversion (`Range` hidden, `Thumb` fill transparent, overflow
rules on the wrapper) — **and, proactively, the `Track`/`Root` height fix 11.1.4 §1.5 only found
after shipping** (a literal `3px` `Track` height, unnoticed by any automated test since jsdom
applies no real layout, let a `VoxelTrack` row overflow into a later DOM sibling's hit area and
intercept real clicks). Starting `SliderCenteredZero.css` from the *already-corrected* shape avoids
repeating that exact regression a third time. The pre-Cabinetry `.sc-slider-centered-zero__fill`
rule (the custom fill `<div>`'s own styling) is deleted outright — nothing renders that element
anymore.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── voxelTrackMath.ts        # MODIFIED — new VoxelBoxState optional fields (§1.3), new
│   │                             #   VOXEL_TRACK_MIN_BOX_COUNT_EVEN + computeEvenBoxCount (§1.4),
│   │                             #   new computeVoxelBoxStatesCenteredZero (§1.2). Every existing
│   │                             #   export's own behavior is unchanged.
│   ├── voxelTrackMath.test.ts   # MODIFIED — new describe blocks for the 3 additions above (§5)
│   └── cabinetGeometry.ts        # UNCHANGED
└── components/ui/controls/
    ├── VoxelTrack.tsx            # MODIFIED — 2-line popDistance change (§1.3); no other line
    │                             #   changes; z-index/rendering/straddle logic all untouched
    ├── VoxelTrack.test.tsx       # MODIFIED — 1 new test for the override (§5); all existing cases
    │                             #   pass unmodified (none of them set the new optional fields)
    ├── useVoxelTrackSlider.ts    # MODIFIED — new optional 4th param, VoxelTrackSliderOptions (§1.4)
    ├── useVoxelTrackSlider.test.ts # MODIFIED — new forceEven cases (§5); all existing cases pass
    │                             #   unmodified (they never pass the new 4th argument)
    ├── SliderCenteredZero.tsx    # MODIFIED — full rewrite, mirroring SliderLog.tsx's own shape
    │                             #   minus the t-curve, plus forceEven: true (§1.6)
    ├── SliderCenteredZero.css    # MODIFIED — full rewrite (§1.6, §4); .__fill rule removed
    ├── SliderCenteredZero.test.tsx # MODIFIED — see §5 for exactly which of the 28 existing cases
    │                             #   are preserved vs. removed vs. rewritten
    ├── sliderCenteredZeroMath.ts # DELETED (§1.5) — computeFillRect/zeroPointPercent/valuePercent
    │                             #   have no remaining caller
    ├── CabinetBox.tsx, useCabinetBoxHeight.ts, useVoxelTrackBoxCount.ts, SliderLinear.tsx,
    │   SliderLog.tsx, sliderLogMath.ts
    │                             # UNCHANGED — reused exactly as 11.1.3/11.1.4 shipped them
    └── (no other file in this directory changes)

docs/
├── COMPONENT_LIBRARY.md    # MODIFIED — "internal rendering changed, contract didn't" note for
│                            #   SliderCenteredZero, mirroring SliderLinear/SliderLog's own; the
│                            #   "SliderCenteredZero's zero-anchored fill" subsection (describing
│                            #   the now-deleted computeFillRect mechanism) is removed/replaced
├── CONSOLE_THEMING.md       # MODIFIED — "Voxel-track sliders" section gains the zero-anchored
│                            #   dead-center-seam/per-side-falloff rules; its closing "SliderLog
│                            #   shipped, SliderCenteredZero pending" line is updated
└── todo/roadmap.md       # MODIFIED (at Task-list time, not this spec) — gains the "Done"
                              #   marker for 11.1.5 once implementation lands
```

**Explicitly not touched, and why:**

- `CabinetBox.tsx`, `useCabinetBoxHeight.ts`, `useVoxelTrackBoxCount.ts` — none of this item's
  changes touch box geometry, breakpoint resolution, or the live-fitting measurement itself; only
  what's *done* with the fitted count (rounded to even) and how per-box states are *computed*
  (dead-center split) change.
- `computeVoxelBoxStates`, `computeVoxelBoxPopDistance`, `computeVoxelBoxZIndex`,
  `computeVoxelFillBackground`, `computeVoxelStraddleSizeFraction`, `computeFittedBoxCount`,
  `computeVoxelTrackLength`, `computeVoxelTrackTrailingReserve`, `VOXEL_TRACK_MIN_BOX_COUNT`,
  `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` — every one of these keeps its exact existing signature and
  behavior; `computeVoxelBoxStatesCenteredZero` *calls* `computeVoxelBoxStates` twice but doesn't
  change it.
- `SliderLinear.tsx`, `SliderLog.tsx`, `sliderLogMath.ts` — no call site of either component
  changes; `useVoxelTrackSlider`'s 4th parameter is optional and both continue calling the hook
  with 2 or 3 arguments exactly as they do today.
- `src/types/controls.ts` — `SliderCenteredZeroSchema`/`ControlSchema` unchanged; no new field.
- Any domain config (`audioRigConfig.ts`'s EQ3/Drift entries, `robotOptionsConfig.ts`'s Detune
  entry) or drawer component — `SliderCenteredZero`'s props contract (`{ schema; value; onChange;
  disabled?; verticalHeight? }`) is unchanged, so no call site needs to change.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `SliderCenteredZero.css`'s existing
  `--slider-vertical-height` reference is superseded the same way `SliderLinear.css`'s/
  `SliderLog.css`'s were (the global custom property itself stays defined — nothing else in this
  codebase still reads it after this item ships, but removing it is a separate, unrelated cleanup
  not required by this spec).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **The seam is always `Math.floor(boxCount / 2)`.** The schema's actual `min`/`max` ratio is never
  consulted for box *placement* — only for each side's own fill magnitude once a side is known to
  be active. This is a deliberate, confirmed simplification (interview transcript, `/interview-me`
  2026-09-09), not an oversight to flag in review.
* **`useVoxelTrackSlider`'s `forceEven` option must not change `SliderLinear`'s or `SliderLog`'s own
  resolved `boxSize`/`gap`/`boxCount`/`trackLength`/`rootStyle` values for any input already covered
  by their existing tests.** Neither component passes a 4th argument; if implementing this item
  requires editing `SliderLinear.test.tsx`, `SliderLog.test.tsx`, `SliderLinear.tsx`, or
  `SliderLog.tsx` at all, that is a signal something in §1.4 went wrong, not a signal those files
  were stale.
* **`VoxelTrack.tsx`'s 2 new optional `VoxelBoxState` fields must not change `SliderLinear`'s or
  `SliderLog`'s own rendering.** Neither's `computeVoxelBoxStates` output ever sets
  `popDistanceLocalIndex`/`popDistanceLocalCount`, so `?? i` / `?? states.length` must resolve to
  today's exact values for both. `VoxelTrack.test.tsx`'s existing pop-distance assertion (§5) must
  pass unmodified — if it requires an edit, the fallback logic is wrong.
* **z-index (`computeVoxelBoxZIndex`) is never called with anything other than the box's real
  global index and the row's real total `boxCount`.** Do not introduce a per-side z-index scheme —
  §1.3 explains why that breaks paint order exactly at the seam.
* **`computeVoxelBoxStatesCenteredZero` reuses `computeVoxelBoxStates` for both sides' fill math —
  it does not reimplement the straddle/fill-percent logic independently.** The negative side's
  result is reversed after the call, not computed via some other reversed formula.
* **At `value === 0`, both sides are 100% flat — no exception path, no minimum-visibility floor.**
  Do not apply `VOXEL_STRADDLE_MIN_SIZE_FRACTION`-style flooring to manufacture a visible marker at
  the seam; the confirmed design is "reads as fully at rest," matching `Toggle`'s own off state.
* **No new `ControlSchema`/`SliderCenteredZeroSchema` field.** `SliderCenteredZero`'s `{ schema,
  value, onChange, disabled?, verticalHeight? }` props contract is byte-for-byte unchanged.
* **GSAP never calls `AudioEngine`.** Unaffected by this item (no new timeline mechanism — every
  voxel box's `CabinetBox` timeline behavior is inherited unchanged), restated per CLAUDE.md's
  Strict Separation guardrail for completeness.
* **Out of scope, per the intent doc:** asymmetric-bounds box *placement* support beyond the
  dead-center seam (the underlying per-side value math stays asymmetric-safe; the seam's screen
  position does not); any change to `CabinetBox.tsx`, `computeVoxelBoxPopDistance`, or
  `computeVoxelBoxZIndex`'s own implementations; `Stepper`/`StepperWithToggle` (dropped, see
  11.1.1); WorldView/terrain/sky styling; robot visuals (locked to audio attributes per CLAUDE.md);
  the power rocker switch/`SleeveContainer`; 11.2's accessibility/performance verification pass.

---

## 4. Code Style & Architecture Conventions

**`src/utils/voxelTrackMath.ts`** (modified — additions only; every existing export's body is
unchanged):

```typescript
export interface VoxelBoxState {
  fillPercent: number;
  popT: number;
  isStraddling: boolean;
  /**
   * SliderCenteredZero only (roadmap 11.1.5). When set, VoxelTrack computes
   * this box's popDistance ceiling from THIS local index/count pair —
   * distance from the zero seam within this box's own side of the track —
   * instead of the box's raw position in the whole row. Both fields are
   * always set together or not at all. Omitted (the default for
   * SliderLinear/SliderLog's computeVoxelBoxStates output) preserves their
   * exact existing whole-row falloff. z-index (computeVoxelBoxZIndex) is NOT
   * affected by either field — see docs/specs/
   * OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.3.
   */
  popDistanceLocalIndex?: number;
  popDistanceLocalCount?: number;
}

// ... computeVoxelBoxStates, computeVoxelBoxPopDistance, computeVoxelBoxZIndex,
// computeVoxelTrackTrailingReserve, computeVoxelFillBackground,
// VOXEL_STRADDLE_MIN_SIZE_FRACTION, computeVoxelStraddleSizeFraction — all unchanged.

/**
 * A container too even-numbered-narrow... see VOXEL_TRACK_MIN_BOX_COUNT's own
 * comment for the odd-count precedent this mirrors.
 */
export const VOXEL_TRACK_MIN_BOX_COUNT_EVEN = 4;

/**
 * Rounds a fitted box count down to the nearest even number, floored at
 * VOXEL_TRACK_MIN_BOX_COUNT_EVEN (4) rather than the odd VOXEL_TRACK_MIN_BOX_COUNT
 * (3) — SliderCenteredZero's own requirement (roadmap 11.1.5) so its
 * dead-center seam (Math.floor(boxCount / 2)) always lands exactly on a box
 * boundary, never inside one. An already-even count is returned unchanged.
 */
export function computeEvenBoxCount(rawBoxCount: number): number {
  const rounded = rawBoxCount - (rawBoxCount % 2);
  return Math.max(VOXEL_TRACK_MIN_BOX_COUNT_EVEN, rounded);
}

/**
 * Zero-anchored dual-fill (roadmap 11.1.5). See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.2 for the full
 * derivation, including the negative side's reversal.
 */
export function computeVoxelBoxStatesCenteredZero(
  value: number,
  min: number,
  max: number,
  boxCount: number,
): VoxelBoxState[] {
  const seamIndex = Math.floor(boxCount / 2);
  const negativeCount = seamIndex;
  const positiveCount = boxCount - seamIndex;

  const flatState = (): VoxelBoxState => ({ fillPercent: 0, popT: 0, isStraddling: false });

  const negativeFill =
    value < 0
      ? computeVoxelBoxStates(-value, 0, -min, negativeCount).slice().reverse()
      : Array.from({ length: negativeCount }, flatState);

  const positiveFill =
    value > 0
      ? computeVoxelBoxStates(value, 0, max, positiveCount)
      : Array.from({ length: positiveCount }, flatState);

  const negativeStates = negativeFill.map((state, i) => ({
    ...state,
    popDistanceLocalIndex: negativeCount - 1 - i,
    popDistanceLocalCount: negativeCount,
  }));

  const positiveStates = positiveFill.map((state, i) => ({
    ...state,
    popDistanceLocalIndex: i,
    popDistanceLocalCount: positiveCount,
  }));

  return [...negativeStates, ...positiveStates];
}
```

(The `VOXEL_TRACK_MIN_BOX_COUNT_EVEN` doc comment above has a placeholder ellipsis in this spec for
brevity — the real implementation writes it out in full, matching `VOXEL_TRACK_MIN_BOX_COUNT`'s own
comment register: what it's for, why it's floored rather than allowed to reach 0, and that it's
`SliderCenteredZero`-specific.)

**`src/components/ui/controls/VoxelTrack.tsx`** (modified — one changed statement, inside the
existing `states.map((state, i) => { ... })`, plus its own updated comment; nothing else in the
file changes):

```typescript
// Each box's own pop distance ceiling is fixed by its row position (index i
// of states.length total) by default, never by the slider's current value —
// a box near the minimum end tops out shallow even while it's the one
// currently popped. SliderCenteredZero (roadmap 11.1.5) overrides this with
// a LOCAL index/count pair — distance from its own side's zero seam, not the
// box's raw row position — via VoxelBoxState's own optional
// popDistanceLocalIndex/popDistanceLocalCount fields; SliderLinear/SliderLog
// never set either, so their own falloff is unaffected. See
// computeVoxelBoxPopDistance and docs/specs/
// OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.3.
const popDistance = computeVoxelBoxPopDistance(
  state.popDistanceLocalIndex ?? i,
  state.popDistanceLocalCount ?? states.length,
);
```

**`src/components/ui/controls/useVoxelTrackSlider.ts`** (modified — full file):

```typescript
import { useMemo, type CSSProperties, type RefObject } from 'react';
import { useCabinetBoxHeight, useVoxelTrackGap } from './useCabinetBoxHeight';
import { useVoxelTrackBoxCount } from './useVoxelTrackBoxCount';
import {
  computeEvenBoxCount,
  computeVoxelTrackLength,
  computeVoxelTrackTrailingReserve,
  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT,
} from '@/utils/voxelTrackMath';

export interface VoxelTrackSliderLayout {
  boxSize: number;
  gap: number;
  boxCount: number;
  trackLength: number;
  rootStyle: CSSProperties;
}

export interface VoxelTrackSliderOptions {
  /**
   * Forces the fitted box count down to the nearest even number (floored at
   * VOXEL_TRACK_MIN_BOX_COUNT_EVEN, 4) before deriving trackLength/rootStyle
   * — SliderCenteredZero's own requirement (roadmap 11.1.5) so its
   * dead-center seam always lands exactly on a box boundary. Omitted or
   * false preserves SliderLinear/SliderLog's exact existing behavior — this
   * is a strictly additive, opt-in extension of this hook's contract.
   */
  forceEven?: boolean;
}

export function useVoxelTrackSlider(
  wrapperRef: RefObject<HTMLElement | null>,
  orientation: 'horizontal' | 'vertical',
  verticalHeight?: number,
  options?: VoxelTrackSliderOptions,
): VoxelTrackSliderLayout {
  const boxSize = useCabinetBoxHeight();
  const gap = useVoxelTrackGap();
  const isVertical = orientation === 'vertical';
  const explicitLength = isVertical ? (verticalHeight ?? VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT) : undefined;
  const trailingReserve = computeVoxelTrackTrailingReserve(orientation);
  const rawBoxCount = useVoxelTrackBoxCount(wrapperRef, orientation, boxSize, gap, explicitLength, trailingReserve);
  const boxCount = options?.forceEven ? computeEvenBoxCount(rawBoxCount) : rawBoxCount;
  const trackLength = computeVoxelTrackLength(boxCount, boxSize, gap) + trailingReserve;

  const rootStyle = useMemo<CSSProperties>(
    () => (isVertical ? { height: trackLength, width: boxSize } : { width: trackLength, height: boxSize }),
    [isVertical, trackLength, boxSize],
  );

  return { boxSize, gap, boxCount, trackLength, rootStyle };
}
```

**`src/components/ui/controls/SliderCenteredZero.tsx`** (full replacement):

```tsx
import { useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { computeVoxelBoxStatesCenteredZero } from '@/utils/voxelTrackMath';
import type { SliderCenteredZeroSchema } from '@/types/controls';
import './SliderCenteredZero.css';

interface SliderCenteredZeroProps {
  schema: SliderCenteredZeroSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length) the — always even, see useVoxelTrackSlider's forceEven
   *  option — box count fits within. Omit to fit against the fixed
   *  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT budget. */
  verticalHeight?: number;
}

/**
 * Zero-anchored slider (Detune, EQ3 bands, LFO Rate/Depth Drift), rendering
 * through the shared voxel-track system (roadmap 11.1.3-11.1.5) — a row of
 * uniform CabinetBox facades split into two independent halves at a fixed
 * dead-center seam (never the schema's own proportional zero point), each
 * filling outward from the seam toward its own physical end. See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md for the full
 * derivation. Unlike SliderLog, there's no t-curve here — Slider.Root keeps
 * using the schema's literal min/max/value, exactly as before this item.
 */
export function SliderCenteredZero({ schema, value, onChange, disabled, verticalHeight }: SliderCenteredZeroProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight, {
    forceEven: true,
  });
  const states = computeVoxelBoxStatesCenteredZero(value, schema.min, schema.max, boxCount);

  const valueLabel = (
    <span className="sc-slider-centered-zero__value">{formatDisplayValue(value)}{schema.unit}</span>
  );

  return (
    <div ref={wrapperRef} className="sc-slider-centered-zero" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-centered-zero__root"
        orientation={orientation}
        min={schema.min}
        max={schema.max}
        step={1}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
        disabled={disabled}
        style={rootStyle}
      >
        <Slider.Track className="sc-slider-centered-zero__track">
          <Slider.Range className="sc-slider-centered-zero__range" />
          <VoxelTrack
            states={states}
            boxSize={boxSize}
            gap={gap}
            axis={orientation}
            timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
          />
        </Slider.Track>
        <Slider.Thumb className="sc-slider-centered-zero__thumb" aria-label={resolveAccessibleName(schema)} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}
```

**`src/components/ui/controls/SliderCenteredZero.css`** (full replacement — mirrors
`SliderLog.css`'s own shape exactly, applying its Track/Root height fix proactively per §1.6, and
dropping the now-dead `.__fill` rule entirely):

```css
.sc-slider-centered-zero {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sc-slider-centered-zero[data-orientation='vertical'] {
  display: inline-flex;
  align-items: center;
}

/* Only the box row (Slider.Root) is ever wider/taller than its container —
   engages only for the 4-box overflow floor (voxelTrackMath.ts's own
   VOXEL_TRACK_MIN_BOX_COUNT_EVEN). Mirrors SliderLinear.css's/SliderLog.css's
   own precedent — scoped to the existing data-orientation attribute, no new
   wrapper element. */
.sc-slider-centered-zero[data-orientation='horizontal'] {
  overflow-x: auto;
  overflow-y: visible;
}

.sc-slider-centered-zero[data-orientation='vertical'] {
  overflow-y: auto;
  overflow-x: visible;
}

.sc-slider-centered-zero__root {
  position: relative;
  display: flex;
  align-items: center;
  /* Slider.Root's own inline width AND height (set in SliderCenteredZero.tsx,
     via useVoxelTrackSlider's rootStyle) now supersede both of these; kept
     only as a same-paint fallback for the instant before that inline style
     applies. Mirrors SliderLinear.css's/SliderLog.css's own precedent. */
  width: 100%;
  height: 20px;
  touch-action: none;
  user-select: none;
}

.sc-slider-centered-zero__track {
  position: relative;
  flex-grow: 1;
  /* Always exactly Slider.Root's own cross-axis size. Applied here
     proactively (not discovered live) — SliderLog.css's own equivalent rule
     started at a literal 3px and needed a post-implementation fix once
     VoxelTrack's real 32-48px box row started overflowing that 3px container
     into a DOM-later sibling's hit area (docs/specs/
     OBLIQUE_CABINETRY_SLIDER_LOG.md §1.5); starting from the already-fixed
     shape here avoids repeating that regression a third time. */
  height: 100%;
  border-radius: 999px;
}

/* Radix's own Range fill is kept in the DOM for structural/a11y parity but
   not shown — VoxelTrack (an absolutely-positioned sibling inside
   Slider.Track) renders the real visible zero-anchored fill instead. */
.sc-slider-centered-zero__range {
  visibility: hidden;
}

.sc-slider-centered-zero__range[data-orientation='vertical'] {
  width: 100%;
  height: auto;
}

.sc-slider-centered-zero__root[data-orientation='vertical'] {
  flex-direction: column;
  width: 20px;
  height: var(--slider-vertical-height, 256px);
}

.sc-slider-centered-zero__track[data-orientation='vertical'] {
  width: 100%;
  height: 100%;
}

.sc-slider-centered-zero__thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  /* was background-color: var(--color-text-primary) — the voxel boxes now
     carry all visible fill/position information. */
  background-color: transparent;
}

.sc-slider-centered-zero__thumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.sc-slider-centered-zero__value {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
```

* **Naming conventions:** `computeVoxelBoxStatesCenteredZero`/`computeEvenBoxCount`/
  `VOXEL_TRACK_MIN_BOX_COUNT_EVEN`/`VoxelTrackSliderOptions` all match `voxelTrackMath.ts`'s/
  `useVoxelTrackSlider.ts`'s own existing naming register. No new `sc-` CSS class —
  `SliderCenteredZero.css`'s existing class names are reused as-is (minus `.__fill`, removed).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the
  lines actually changing (except the two full-rewrite files, `SliderCenteredZero.tsx`/`.css`,
  where the whole file is new).

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.

**`voxelTrackMath.test.ts` (modified)** — every existing `describe` block stays unmodified; new
blocks added:

* `describe('VOXEL_TRACK_MIN_BOX_COUNT_EVEN', ...)`: is `4`.
* `describe('computeEvenBoxCount', ...)`:
  1. Rounds an odd count down to the nearest even number (`7 → 6`).
  2. Leaves an already-even count unchanged (`6 → 6`).
  3. Floors at `4`, not `2` — an input of `3` (the *odd* minimum a plain `useVoxelTrackBoxCount`
     call would return) produces `4`, not `2`.
  4. An input of `0` (or any non-positive number) also floors to `4`.
* `describe('computeVoxelBoxStatesCenteredZero', ...)`:
  1. At `value === 0` (any symmetric or asymmetric `min`/`max`, `boxCount: 4`): every one of the 4
     returned entries is `{ fillPercent: 0, popT: 0, isStraddling: false }` (ignoring the two
     `popDistanceLocal*` fields for this particular assertion, or asserting them via
     `expect.objectContaining`).
  2. Positive value, hand-derived (`min: -50, max: 50, boxCount: 4, value: 25`): negative-side
     entries (indices 0-1) are both flat; positive-side entries (indices 2-3) equal
     `computeVoxelBoxStates(25, 0, 50, 2)`'s own output exactly, on `fillPercent`/`popT`/
     `isStraddling`.
  3. Negative value, hand-derived (`min: -50, max: 50, boxCount: 4, value: -5`) — the §1.2 worked
     example: `states[0]` is flat (`fillPercent: 0`), `states[1]` is the straddler at
     `fillPercent: 20`, `states[2]`/`states[3]` (positive side) are both flat.
  4. The seam is always `boxCount / 2` regardless of asymmetric bounds: for `min: -20, max: 50,
     boxCount: 6`, both `negativeCount` and `positiveCount` (inferred from which indices are ever
     non-flat across a sweep of representative negative and positive values) are 3, not a split
     proportional to `zeroPointPercent(-20, 50)`'s own ≈28.57%.
  5. `popDistanceLocalIndex`/`popDistanceLocalCount` correctness, hand-derived for `boxCount: 4`,
     any value: positive-side entries carry `popDistanceLocalIndex` ascending `0, 1` away from the
     seam with `popDistanceLocalCount: 2`; negative-side entries carry `popDistanceLocalIndex`
     descending `1, 0` (index 0 = flattest/global-min-adjacent gets `1`; index 1 = seam-adjacent
     gets `0`) with `popDistanceLocalCount: 2` — i.e. the box physically nearest the seam on either
     side always has `popDistanceLocalIndex: 0`.
  6. Exactly one `isStraddling: true` entry across the whole 4 (or more)-box array, for a sweep of
     representative non-zero values on both sides (mirrors `computeVoxelBoxStates`'s own "exactly
     one straddler" test).
  7. Zero `isStraddling: true` entries when `value === 0`.
  8. Delegates out-of-range clamping to `computeVoxelBoxStates` rather than reimplementing it: a
     `value` below `min` or above `max` produces the same result as `value === min`/`value === max`
     respectively (spot-checked for one value on each side).

**`VoxelTrack.test.tsx` (modified)** — every existing case stays unmodified (none of `STATES`'s
fixtures set the two new optional fields, so `?? i` / `?? states.length` keep resolving to exactly
what those tests already assert); one new case added:

* "when a state carries `popDistanceLocalIndex`/`popDistanceLocalCount`, `computeVoxelBoxPopDistance`
  is called with THOSE values instead of the box's row index/`states.length` — while its z-index
  still uses the real row index/length unaffected." A 3-entry `states` fixture where at least one
  entry sets `popDistanceLocalIndex: 0, popDistanceLocalCount: 2` at a row position where the real
  index/length would differ (e.g. row index `2` of `3`); assert the rendered `data-pop-distance`
  equals `computeVoxelBoxPopDistance(0, 2)` (not `computeVoxelBoxPopDistance(2, 3)`), while
  `data-z-index` still equals `computeVoxelBoxZIndex(2, 3, 'horizontal')`.

**`useVoxelTrackSlider.test.ts` (modified)** — every existing case stays unmodified (none passes a
4th argument); new cases added:

1. `forceEven: true`, horizontal, before any measurement: `boxCount` is
   `VOXEL_TRACK_MIN_BOX_COUNT_EVEN` (`4`), not `VOXEL_TRACK_MIN_BOX_COUNT` (`3`).
2. `forceEven: true`, horizontal, a fired measurement whose raw fitted count is odd (choose a width
   that fits exactly 5 boxes without `forceEven`): `boxCount` is `4`, and `trackLength`/`rootStyle`
   are computed from `4`, not `5` — asserted against `computeVoxelTrackLength(4, BOX_SIZE, GAP) +
   reserve`, not a value derived from the raw fitted count.
3. `forceEven: true`, horizontal, a fired measurement whose raw fitted count is already even
   (choose a width that fits exactly 6): `boxCount` stays `6`, unchanged — `forceEven` never reduces
   an already-even count.
4. `forceEven` omitted, and separately `forceEven: false`: `boxCount`/`trackLength`/`rootStyle` are
   identical to the existing (odd-count-permitting) behavior for at least one of the existing
   fixtures already covered above (re-run, e.g., the "before any ResizeObserver fires" and "exact
   multiple width" cases with the options argument explicitly supplied as `{ forceEven: false }` and
   confirm no change from the already-passing 3-argument call).
5. Vertical, `forceEven: true`, `verticalHeight` omitted: fits against
   `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` synchronously, then rounds down to the nearest even count
   — no `ResizeObserver` needs to fire.

**`SliderCenteredZero.test.tsx` (modified)** — of the 28 existing cases, the split is:

*Removed entirely (6)* — the whole `describe('sliderCenteredZeroMath', ...)` block: `zeroPointPercent`/
`computeFillRect` no longer exist.

*Kept, unmodified (16)* — every case that doesn't reference `.sc-slider-centered-zero__fill` or
`computeFillRect`: `DualLabel` rendering, `{value}{unit}` display, the no-unit/3-decimal-cap display
cases, `aria-valuemin`/`valuemax`/`valuenow` reflecting `schema.min`/`max`/`value` directly (`Slider.Root`
still uses these literally — unaffected by the internal rendering change), accessible-name fallback,
not-disabled-by-default, disabled attribute + tabindex removal, no-`onChange`-when-disabled, both
`data-orientation` cases (root and wrapper), the 2 DOM-order cases for the value label, the `'auto'`-
defaults-to-horizontal case.

*Rewritten (3)* — the identical named behavior change 11.1.4 §5 already made for `SliderLog.test.tsx`,
now composed with even-rounding:

1. *(was "does not set an inline height when verticalHeight is omitted")* → now: sets an inline
   height fitted against `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`, then rounded to the nearest even
   count — `root.style.height` equals `computeVoxelTrackLength(computeEvenBoxCount
   (computeFittedBoxCount(VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, BOX_SIZE, GAP)), BOX_SIZE, GAP)`,
   present synchronously.
2. *(was "sets an inline height from the verticalHeight prop when provided")* → now: `verticalHeight`
   is a fitting budget, additionally forced even — using a `verticalHeight` fixture whose raw fitted
   count is odd (so the even-rounding is actually exercised, not accidentally already-even),
   `root.style.height` is the box-quantized, forced-even `computeVoxelTrackLength` output, not
   `verticalHeight` verbatim and not the raw (odd) fitted count's length either.
3. *(was "horizontal ignores a verticalHeight prop entirely")* → still holds structurally (no inline
   `height` on a horizontal root) but now additionally asserts an inline `width` IS set, from the
   fitted-then-forced-even box count plus the horizontal trailing reserve.

*Removed (3, superseded by new coverage below)* — "still renders the correct zero-anchored fill when
disabled," "horizontal: the fill's inline style uses left/width," "vertical: the fill's inline style
uses bottom/height": all three assert against `.sc-slider-centered-zero__fill`/`computeFillRect`,
neither of which exists anymore.

*Removed and replaced (1)* — "vertical: a negative value's fill still spans from the zero point
(asymmetric bounds)": its original purpose (proportional zero anchoring for asymmetric bounds) is
retired by the dead-center simplification. Replaced by a new test in the added coverage below that
locks down the *opposite*, now-confirmed behavior for the same asymmetric fixture.

*New coverage (beyond the 3 rewritten):*

4. Renders a `VoxelTrack` (mocked, mirroring `SliderLog.test.tsx`'s own `vi.mock('./VoxelTrack',
   ...)` precedent) with `states` matching `computeVoxelBoxStatesCenteredZero(value, schema.min,
   schema.max, boxCount)` for the currently-fitted (forced-even) `boxCount` — for a positive value,
   a negative value, and `value: 0`.
5. `disabled` does not change the computed `states` passed to `VoxelTrack` — the visual read stays
   identical whether or not the control is disabled (mirrors the removed "fill unaffected by
   disabled" case's intent, via the new mechanism).
6. For the existing asymmetric fixture (`min: -20, max: 50`) at a representative `boxCount`, the
   seam split is confirmed dead-center (`Math.floor(boxCount / 2)` boxes on each side) — **not**
   proportional to this schema's own `zeroPointPercent(-20, 50)` (≈28.57%) — locking down §1.2's
   confirmed simplification directly, replacing the removed test's opposite assumption.
7. `Slider.Thumb`'s rendered `background-color` is `transparent`. Not asserted via a unit test (this
   jsdom/vitest setup injects no `<style>` tags, per `SliderLinear.test.tsx`'s/`SliderLog.test.tsx`'s
   own Task 6 finding) — confirmed instead by reading the shipped `SliderCenteredZero.css` directly.
8. `screen.getByRole('slider')` still resolves to exactly one element.

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `SliderLinear.test.tsx`/
     `SliderLog.test.tsx` **unmodified** (proves the `useVoxelTrackSlider`/`VoxelTrack` extensions
     are genuinely additive) and every other real `SliderCenteredZero` consumer's own test file
     (e.g. `AudioRigDrawer.test.tsx`, `SignatureArrayDrawer.test.tsx`), unmocked against the real
     components.
  4. `npm run build` — production bundle builds cleanly (confirms `sliderCenteredZeroMath.ts`'s
     deletion leaves no dangling import anywhere in the app).
* **Manual check:** load the app, open a drawer with a real `SliderCenteredZero` (Detune, on all 3
  robot signature layers; EQ3 Low/Mid/High; LFO Rate/Depth Drift) at each of the 3 breakpoints:
  confirm the track renders as a row of square boxes matching `SliderLinear`/`SliderLog`'s own
  look, always an even count; confirm dragging/keyboard-stepping through zero cleanly switches
  which side shows fill, with the box row reading as fully flat/at-rest exactly at the center
  detent; confirm extrusion depth is shallow near the center and deepest at each far end,
  independently on both sides; confirm the focus ring renders clearly on top of the box row;
  confirm a narrow container clamps to 4 boxes (2 per side) and scrolls rather than shrinking or
  going odd; confirm "reduce motion" makes transitions snap instead of animate. Also spot-check
  that `SliderLinear`/`SliderLog` elsewhere in the same drawers still look and behave identically to
  before this item.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** the same "internal rendering changed, contract didn't"
  note `SliderLinear`/`SliderLog`'s rows already carry, added to `SliderCenteredZero`'s row; the
  existing "SliderCenteredZero's zero-anchored fill" subsection (describing `computeFillRect`) is
  removed and replaced with a short description of the dead-center-seam/per-side mechanism,
  pointing to this spec rather than restating it.
* **`docs/CONSOLE_THEMING.md` update:** the "Voxel-track sliders" section gains the zero-anchored
  adaptation (dead-center seam, per-side falloff) and its own closing "SliderLog shipped,
  SliderCenteredZero pending" line is updated to reflect this item having shipped — the last of the
  3 sliders, so that line can note all 3 are now complete.
* **`docs/todo/roadmap.md`:** gains the "Done" marker for 11.1.5 at implementation time (this
  spec doesn't add it — mirrors how 11.1.3/11.1.4's own specs didn't either, only their
  task-completion passes did).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** a new feature branch (e.g. `feature/cabinetry-slider-centered-zero`) — per
  this series' established one-branch-per-item convention.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping, each independently reviewable: (1) `voxelTrackMath.ts`'s additions
  + `voxelTrackMath.test.ts` (new math, no consumer yet); (2) `VoxelTrack.tsx`'s 2-line extension +
  its 1 new test (verified against its own unmodified existing suite first); (3)
  `useVoxelTrackSlider.ts`'s `forceEven` option + its new tests (verified against its own unmodified
  existing suite first); (4) `SliderCenteredZero.tsx`/`.css`/`.test.tsx` + `sliderCenteredZeroMath.ts`'s
  deletion (the real consumer, all at once since the rewrite and the deletion are inseparable); (5)
  docs.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own
precedents, not left open):

- ~~Where does the new per-side box-state function live?~~ **Resolved:
  `computeVoxelBoxStatesCenteredZero` in `src/utils/voxelTrackMath.ts`, alongside the
  `computeVoxelBoxStates` it calls twice — `sliderCenteredZeroMath.ts` is deleted, not repurposed**
  (§1.1, §1.5).
- ~~Can `VoxelTrack.tsx`/`computeVoxelBoxPopDistance` really stay untouched, as the intent doc's
  Constraint section states?~~ **Resolved: no, not literally — `VoxelTrack.tsx` needs 2 new optional
  `VoxelBoxState` fields and a 2-line change, both purely additive and default-preserving. This is a
  correction to the intent doc's own overly strict phrasing, found while deriving exactly how
  per-side falloff has to reach the component that actually renders it** (§1.3).
- ~~Does `useVoxelTrackSlider` need a new parameter, and does it change existing behavior?~~
  **Resolved: yes, an optional `options?: VoxelTrackSliderOptions` 4th parameter with a single
  `forceEven` field, fully backward-compatible** (§1.4).
- ~~How does the negative side's fill direction actually work, mechanically?~~ **Resolved: reuse
  `computeVoxelBoxStates` unmodified against the side's own magnitude bounds, then reverse the
  result array before assembly — no reimplementation of the straddle logic** (§1.2).

Carried forward, not blocking this spec:

1. **N-timelines-per-slider performance** (11.1.3 §1.2/§7's own "real risk, not fully resolvable at
   spec time") — unchanged by this item (no new timeline mechanism beyond what `VoxelTrack`/
   `CabinetBox` already do), still carried forward to 11.2.
2. **`--slider-vertical-height`'s global CSS custom property** now has no remaining reader once this
   item ships (`SliderLinear.css`/`SliderLog.css` already stopped reading it in 11.1.3/11.1.4;
   `SliderCenteredZero.css`'s own vertical rule is a same-paint fallback only, same as the other
   two) — removing the now-dead custom property from `src/index.css` is a small, unrelated cleanup
   this spec doesn't require but a future pass could pick up.
3. **All 3 voxel-track sliders now share `useVoxelTrackSlider`.** Once this item ships,
   `voxelTrackMath.ts`/`VoxelTrack.tsx`/`useVoxelTrackSlider.ts` are exercised by every intended
   consumer and should be considered stable, closed infrastructure — any further change to any of
   the three should be treated as a deliberate, reviewed modification to shared infrastructure, not
   a routine follow-up the way 11.1.4's own extraction was.

**No new risk introduced by this item beyond what 11.1.3/11.1.4 already accepted**, with one
addition worth flagging explicitly in review: this is the first item in the series where the
intent doc's own Constraint section turned out to be wrong about a specific file staying untouched
(§1.3). The correction is small and well-contained, but it's a genuine deviation from what was
confirmed during `/interview-me` — worth a deliberate look during review, not a silent pass-through.
