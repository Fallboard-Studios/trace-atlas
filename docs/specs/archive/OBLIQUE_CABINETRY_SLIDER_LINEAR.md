# Phase Spec: Oblique Cabinetry — SliderLinear (Voxel-Track Foundation) (Roadmap Phase 11.1.3)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-slider-linear.md](../intent/oblique-cabinetry-slider-linear.md) (confirmed via `/interview-me`, 2026-09-08). Source of scope: [docs/todo/roadmap.md § 11.1.3](../todo/roadmap.md#1113-oblique-cabinetry-sliderlinear-voxel-track-foundation) — the first of the voxel-track items (11.1.3–11.1.5), and the first genuinely new rendering shape after `Button`/`Toggle`'s single-box mechanism. Prior art this spec follows directly: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md` and `docs/specs/OBLIQUE_CABINETRY_TOGGLE.md` in full — `CabinetBox.tsx`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `useCabinetBoxHeight.ts`, `cabinetBreakpoints.ts` are all reused, most unmodified; `SliderCenteredZero.tsx`/`.css` — the "keep Radix's `Range` in the DOM, visually hidden, render a custom fill element alongside it" pattern this spec reuses directly for the voxel-track overlay; `useAutoSliderOrientation.ts` — the "observe the *parent*, never the element's own box" `ResizeObserver` convention this spec's own box-count-fitting hook mirrors exactly, including its test suite's `MockResizeObserver` convention. This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `SliderLinearSchema`/`ControlSchema` are unchanged (box count is derived, never schema-authored, confirmed intent).

---

## 1. Overview & Claude Explanation

The intent doc resolves every user-facing question already (box size/gap fixed per breakpoint, count self-fits live to the container, composes with existing orientation rather than replacing it, floors at 3 with scroll). Ten implementation-shape questions remain, resolved below with real code rather than left to Tasks — more than either prior item in this series, because this is the first genuinely new rendering shape (a row of boxes, not one) rather than a thin reapplication of an already-solved mechanism.

### 1.1 `CabinetBox`'s `popped` prop widens from `boolean` to `boolean | number` — required for extrusion-falloff, not previously needed

11.1.1 §3 and 11.1.2 (implicitly, by never introducing an alternative) both ruled `popped` strictly binary — "no distinct partial-pop state," confirmed intent for both `Button` and `Toggle`. Extrusion-falloff (roadmap 11.1.3's own Create bullet) needs the *opposite*: boxes below the straddling one "step down in equal decrements... to 0%," a genuinely intermediate pop value no prior consumer needed. Rather than fork a second, near-duplicate box component, `CabinetBoxProps.popped` widens to `boolean | number`, normalized to a `0–1` number on entry:

```typescript
const poppedT = typeof popped === 'number' ? popped : (popped ? 1 : 0);
```

`Button`/`Toggle` keep passing a plain `boolean` — **zero changes to either file** — while `VoxelTrack` (this item) is the first consumer to pass a real fractional value. Every internal computation (the geometry call, the `isTransition` comparison, the dependency array) switches from `popped` to `poppedT`. This also requires generalizing the tween's own `from` value (§4, `CabinetBox.tsx`), which today hardcodes the binary opposite:

```typescript
// Today (binary-only):
const from = computeCabinetGeometry(width, boxHeight, popped ? 0 : 1);
```

The natural generalization — "animate in from whatever the box's own last-known state was, or the numeric opposite (`1 - poppedT`) on the very first run" — reproduces today's Button/Toggle behavior exactly when `poppedT` is `0` or `1` (`1 - 0 = 1`, `1 - 1 = 0`, matching the old ternary bit-for-bit) and generalizes correctly for fractional values:

```typescript
const previousPopped = prevPoppedRef.current; // captured BEFORE being overwritten below
const isTransition = previousPopped === null || previousPopped !== poppedT;
prevPoppedRef.current = poppedT;
const target = computeCabinetGeometry(width, boxHeight, poppedT); // no more ternary — poppedT already IS the t value
...
const from = computeCabinetGeometry(width, boxHeight, previousPopped ?? (1 - poppedT));
```

One genuinely new consequence, not just plumbing: the pop-proportional glow (11.1.1 §1.8) — already named for tracking "how far the box has popped" — now actually tracks a continuous value for the first time; a half-extruded voxel box glows at half intensity, not a coincidence but the same mechanism finally exercised at more than its two endpoints.

### 1.2 Voxel-track boxes reuse `CabinetBox` unmodified in mechanism — N independent instances, not one coordinated timeline

Each fitted box renders as its own `<CabinetBox>`, each with a unique `timelineKey` (`` `cabinet-voxel-${schema.id}-${i}` ``) and its own independent GSAP timeline in `timelineMap`, exactly like every other Cabinetry consumer — no new "coordinate N boxes in one timeline" mechanism. This keeps `CabinetBox` itself the one shared primitive every 11.1.x item reuses (per 11.1.1's own Create bullet), at the cost of N timelines per slider instead of one; accepted here, and named explicitly as something for 11.2's performance pass to weigh against 10.2's own "70–100+ primaries in a typical session" ceiling, now multiplied by a slider's own box count.

### 1.3 A fixed per-breakpoint square footprint — `useCabinetBoxHeight()`'s existing resolved value, reused unchanged, not a new constant

The roadmap's box sizes (32/40/48px) are *identical* to `CABINET_BOX_HEIGHT`'s existing tiers (`cabinetBreakpoints.ts`) — no new size constant is needed. Each voxel box passes `useCabinetBoxHeight()`'s already-resolved value as `CabinetBox`'s `boxHeight` override (the same prop 11.1.2 added for `Toggle`'s fixed 32px), and a CSS rule scoped to the voxel-track wrapper forces the front face to an exact square, mirroring 11.1.2 §1.2's own technique precisely:

```css
.sc-voxel-track .sc-cabinet-box__front {
  width: var(--voxel-box-size);
  height: var(--voxel-box-size);
  padding: 0;
}
```

`SliderLinear.tsx` resolves `useCabinetBoxHeight()` once and passes the same numeric value both to `CabinetBox`'s `boxHeight` prop (per box) and into `--voxel-box-size` — an explicit, single computed value threaded through, not N independent hook calls inside N `CabinetBox` instances that could theoretically read different breakpoint tiers mid-resize. Read as an explicit-override pattern, not a redundant one: 11.1.2 §1.2 already established that `useCabinetBoxHeight()` keeps running unconditionally inside `CabinetBox` even when an override is supplied (Rules of Hooks); the override just wins.

### 1.4 A new breakpoint-driven gap value — extending `cabinetBreakpoints.ts`, sharing tier-resolution rather than duplicating it

Box *gap* (8/10/12px) has no existing constant. Added directly alongside `CABINET_BOX_HEIGHT`:

```typescript
export const CABINET_VOXEL_GAP = { mobile: 8, tablet: 10, desktop: 12 } as const;
```

Naively, resolving this live would mean a second `useCabinetBoxHeight`-shaped hook running its own pair of `matchMedia` listeners — the exact "two independently hand-synced sources" class of bug 11.1.1 §1.3/§1.9 already found and fixed once for this same file's breakpoint numbers, and the kind of duplication `docs/DUPLICATE_VALUE_AUDIT.md` tracks generally. Resolved instead by factoring the shared tier-detection logic `useCabinetBoxHeight` already has into one private hook, with both `useCabinetBoxHeight` (unchanged export, unchanged signature) and a new `useVoxelTrackGap` reading off the same resolved tier:

```typescript
function useCabinetTier(): CabinetTier { /* the existing matchMedia logic, unchanged, just renamed to return the tier instead of a height */ }
export function useCabinetBoxHeight(): number { return CABINET_BOX_HEIGHT[useCabinetTier()]; }
export function useVoxelTrackGap(): number { return CABINET_VOXEL_GAP[useCabinetTier()]; }
```

One `matchMedia` listener pair, two derived values — not two listener pairs that could theoretically resolve to different tiers for one frame during a fast resize.

### 1.5 Self-fitting box count — a new hook, measurement target amended post-implementation (see below)

> **Amendment (post-implementation, found via a real running-app regression):** This section originally specified "always observe the parent, mirroring `useAutoSliderOrientation`'s exact convention," reasoning that rendering more boxes would widen the wrapper, feeding back into a self-observed measurement unboundedly. That reasoning doesn't actually hold for **horizontal** orientation as shipped: `.sc-slider-linear` is a plain block box (its width comes from its containing block, not its own children) with `overflow-x: auto` (which contains any oversized child content rather than letting it inflate the wrapper) — so self-observation carries none of the circularity `'auto'` orientation genuinely has (there, the element's own size *is* a direct consequence of the very orientation decision being measured). Observing the parent instead meant every ancestor in a control's layout chain had to be individually, correctly non-content-dependent for the measurement to come out right — which two real, separate pre-existing bugs in this app's own `DirectionalPanel.css` and `AudioRigDrawer.tsx` violated, only surfacing once boxes large enough to make the resulting overflow visible existed. **Shipped fix:** `useVoxelTrackBoxCount` observes `ref.current` directly for horizontal, and still observes `ref.current?.parentElement` for vertical (`.sc-slider-linear[data-orientation='vertical']` is `display: inline-flex`, which *does* shrink-wrap height to content by default — no real vertical `SliderLinear` consumer exists yet to verify a self-observing fix against, so that axis stayed conservative). The rest of this section (the formula, the floor) is unchanged and still accurate.

`useVoxelTrackBoxCount` observes the slider wrapper's *parent* via `ResizeObserver` for vertical, and the wrapper's own box directly for horizontal (see amendment above). It reads `width` or `height` from that observation depending on the *already-resolved* axis (never `'auto'` — orientation resolves first, per confirmed intent §1.6 below), and floors to the largest count that fits without overflowing, clamped to a minimum of 3 (`VOXEL_TRACK_MIN_BOX_COUNT`, confirmed intent):

```typescript
export function computeFittedBoxCount(availableLength: number, boxSize: number, gap: number): number {
  if (boxSize <= 0) return VOXEL_TRACK_MIN_BOX_COUNT;
  const fitted = Math.floor((availableLength + gap) / (boxSize + gap));
  return Math.max(VOXEL_TRACK_MIN_BOX_COUNT, fitted);
}
```

(Derivation: `N` boxes of size `s` with `N−1` gaps `g` occupy `N·s + (N−1)·g = N·(s+g) − g` px; solving `N·(s+g) − g ≤ available` gives `N ≤ (available + g)/(s + g)`, floored.) Before the first real measurement, `computeFittedBoxCount` is called with `availableLength = 0`, which floors to `0` and clamps to the `3`-box minimum — the same "safe minimum before real data arrives" posture `useAutoSliderOrientation` already takes by defaulting to `'horizontal'` pre-measurement, not a new convention.

### 1.6 Composes with orientation, doesn't replace it — resolves axis first, fits boxes second

Confirmed intent, restated as the concrete composition: `SliderLinear.tsx` calls `useAutoSliderOrientation` exactly as it does today (unchanged), then feeds the *resolved* `'horizontal' | 'vertical'` result into `useVoxelTrackBoxCount` as its measurement axis. `useVoxelTrackBoxCount` never itself decides orientation and is never called with `'auto'` — two independent hooks answering two independent questions, composed by `SliderLinear.tsx`, not collapsed into one.

### 1.7 Vertical + `verticalHeight`: a budget the box count fits within, not a literal applied height — resolved by reasoning, not directly interviewed

The interview settled live-refit-from-the-parent for the general case but didn't separately address `verticalHeight` (an existing prop letting a caller override the CSS-default vertical track length). Resolved here, flagged explicitly rather than silently assumed: **when `verticalHeight` is supplied on a vertical slider, box count fits within that fixed number instead of a live `ResizeObserver` measurement** — `useVoxelTrackBoxCount` accepts an optional `explicitAvailableLength` that, when present, skips the observer entirely (no listener attached, `availableLength` is exactly the supplied number). This means `verticalHeight` becomes a **budget the box count fits within**, not a value applied verbatim: 3 boxes at 48px + 2×12px gaps = 168px total, so a `verticalHeight={150}` on desktop still renders a 168px-tall track (the 3-box floor, scrolling) — `verticalHeight` is never quite literally honored to the pixel once box quantization applies, the same way a CSS `height` on a table row is a target, not a guarantee, once the row's own content has a minimum. This is a genuine, user-visible behavior change from today (where `verticalHeight` was applied to `Slider.Root` byte-for-byte) — named explicitly in §7, not left implicit.

### 1.8 Dual-fill and extrusion-falloff — one pure function, no new `CabinetBox` prop

Given `value`/`min`/`max`/`boxCount`, boxes are indexed `0` (nearest `min`) through `boxCount − 1` (nearest `max`) — matching the roadmap's own "the box nearest the minimum end" wording and Radix's own horizontal min-at-left convention (vertical reuses the same indexing with min-at-bottom, per `SliderCenteredZero.tsx`'s own already-established "Radix's vertical slider already places min at the bottom" precedent):

```typescript
export interface VoxelBoxState {
  fillPercent: number; // 0-100; only the straddling box is fractional
  popT: number;        // 0-1, fed straight into CabinetBox's popped prop
}

export function computeVoxelBoxStates(value: number, min: number, max: number, boxCount: number): VoxelBoxState[] {
  const t = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const rawPosition = t * boxCount;
  const straddlingIndex = Math.min(boxCount - 1, Math.floor(rawPosition));
  const localFraction = rawPosition - straddlingIndex;

  return Array.from({ length: boxCount }, (_, i) => {
    if (i < straddlingIndex) return { fillPercent: 100, popT: straddlingIndex === 0 ? 0 : i / straddlingIndex };
    if (i > straddlingIndex) return { fillPercent: 0, popT: 0 };
    return { fillPercent: localFraction * 100, popT: 1 };
  });
}
```

Verified against the roadmap's own wording directly: the straddling box is always `popT: 1` (pops fully); box `0` (nearest min) is always `popT: 0` ("does not extrude at all") whenever it's below the straddling box; every box strictly between steps down in *equal* decrements (`i / straddlingIndex`, a linear ramp) — not a curve, not scaled by `boxCount` beyond that. `max === min` is guarded (would otherwise divide by zero) even though no real schema currently has an equal min/max; a defensive floor, not a scenario expected to occur.

**Revision, 2026-09-08:** the `i / straddlingIndex` taper above is removed. Every filled box (`i <= straddlingIndex`) is now flatly `popT: 1` — `computeVoxelBoxStates` no longer decides pop *depth* at all, only pop *state* (popped vs. flat). The problem the original taper never solved: it scaled a box's pop relative to *how many boxes were currently filled*, so a box near the minimum end still reached the same full pop distance as a box near the maximum, the instant it became the straddling box (e.g. nudging the slider a hair above `min` immediately popped box `0` to the row's full depth). Depth now comes from a fixed, value-independent per-box ceiling instead — `computeVoxelBoxPopDistance(index, boxCount)`, exported alongside `computeVoxelBoxStates`:

```typescript
export function computeVoxelBoxPopDistance(index: number, boxCount: number): number {
  const span = Math.max(1, boxCount - 1);
  const positionFraction = Math.min(1, Math.max(0, index / span));
  const minDistance = VOXEL_TRACK_POP_DISTANCE * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO;
  return minDistance + (VOXEL_TRACK_POP_DISTANCE - minDistance) * positionFraction;
}
```

Linear by fixed row position (`index / (boxCount - 1)`), not by proximity to the straddling box: box `0` tops out at `VOXEL_TRACK_POP_DISTANCE_MIN_RATIO` (`0.125`, i.e. ~1px at the current 8px `VOXEL_TRACK_POP_DISTANCE`) of the max distance regardless of value; the last box tops out at the full distance. `VoxelTrack.tsx` calls this per box (`computeVoxelBoxPopDistance(i, states.length)`) and passes the result as that `CabinetBox`'s `popDistance` prop, replacing the flat `VOXEL_TRACK_POP_DISTANCE` every box previously shared — the straddling slot's glow/flat sub-pieces both use the straddling box's own index. Both constants live in `cabinetGeometry.ts`, next to `VOXEL_TRACK_POP_DISTANCE` itself. `docs/CONSOLE_THEMING.md`'s still-pending dual-fill/extrusion-falloff notes (Task 7) should document this revised shape, not the original taper.

**Addendum, 2026-09-08 — cross-box z-index:** the above revision surfaced a stacking bug that a flat, shared pop distance had always masked: `CabinetBox`'s walls extend past its own footprint along the fixed 2:1 oblique vector (down-right, regardless of axis — `computeCabinetGeometry`), bleeding into whichever neighbor sits in that direction. With every box popping to the same depth this bled by the same small amount everywhere and was never noticed; once depth varies by row position, a deep box's walls bleed further into a shallow neighbor's space, and plain DOM order (the only ordering any voxel-track box had) got it backwards for roughly half of every row. Fixed with a new `computeVoxelBoxZIndex(index, boxCount, axis)` (`voxelTrackMath.ts`, alongside `computeVoxelBoxPopDistance`) and a new optional `CabinetBox` prop, `zIndex?: number` (applied as an inline style on `.sc-cabinet-box`, `undefined` leaves CSS's own default — every Button/Toggle usage is unaffected). Direction is axis-dependent because index-to-screen-position is (`VoxelTrack.css`): horizontal (box `0` leftmost) descends as index rises, so the leftmost box always outranks its right neighbor; vertical (box `0` bottommost, per `column-reverse`) ascends as index rises, so the topmost box always outranks the one below it — in both cases, "up/left of a neighbor" outranks "down/right of it." `VoxelTrack.tsx` computes this once per box (`computeVoxelBoxZIndex(i, states.length, axis)`) and applies it to the ordinary-box `CabinetBox` instance directly, or to the straddling slot's own `.sc-voxel-track__straddle` wrapper (inline `style={{ zIndex }}`, replacing the wrapper's previous hardcoded `z-index: 0` — its two glow/flat sub-pieces still receive no `zIndex` prop of their own, so the pre-existing `:last-child { z-index: -1 }` internal ordering is untouched). `.sc-voxel-track` itself gained an explicit `z-index: 0` to establish its own stacking context, containing these values to the row/column exactly as `.sc-voxel-track__straddle` already did for its own two children.

**Addendum, 2026-09-09 — straddle-boundary remount flash, and a new `skipMountAnimation` prop:** `VoxelTrack.tsx` renders box index `i` as *either* a plain `<CabinetBox key={i}>` (ordinary box, `state.popT !== 1`) *or* a `<div key={i} className="sc-voxel-track__straddle">` wrapping two `CabinetBox` children (the straddling slot, §1.8's own two-piece design). Both branches share the key `i`, but the element **type** changes between them — and every time the straddling index moves as the slider value changes, exactly the two boxes at the old/new boundary flip branches. React's reconciliation doesn't reuse a fiber across a type change at the same key; it unmounts the old one and mounts a fresh one. That fresh mount resets `CabinetBox`'s internal `prevPoppedRef` to `null`, which its geometry effect (`CabinetBox.tsx`) reads as "a genuinely new element, animate in from the numeric opposite of the target state" — correct for `Button`/`Toggle`, where a first mount really is a new element, but wrong here: the box was already visible a frame earlier (as the other role's corresponding piece), so it visibly flattened back toward zero pop and re-popped, flashing the top/side walls open for no real transition. Confirmed directly by Crawford against the running app, then diagnosed from the code (React's own same-key/different-type remount semantics), not from a test failure — no existing test exercised the straddle boundary across a value change in a way that would have caught it.

Fixed with a new optional `CabinetBox` prop, `skipMountAnimation?: boolean` (`CabinetBox.tsx`): when true, the geometry effect's very-first run positions directly at the target geometry via `gsap.set()` (the same instant path the existing dependency-only-rerun branch already uses) instead of tweening in from the opposite state, and registers no timeline (there's no tween to track). `Button`/`Toggle` omit it and keep the pop-in flourish unchanged. `VoxelTrack.tsx` passes it on **every** `CabinetBox` instance it renders (all three call sites: the ordinary box, and both the straddling slot's glow and flat pieces) — not only the two boxes at the boundary — since which specific boxes remount on any given value change isn't something `VoxelTrack` tracks or needs to; unconditionally skipping the mount flourish for every voxel-track box is simpler and has no downside; a voxel box was never meant to announce itself with a flourish the way a `Button` appearing for the first time is. A genuine, later `popped` transition on an already-mounted instance is unaffected by the flag and animates exactly as before — the skip applies only to that instance's own very first effect run. See `CabinetBox.tsx`'s own `CabinetBoxProps.skipMountAnimation` comment and `VoxelTrack.tsx`'s own component-level comment for the full mechanism.

**Second addendum, same day — a narrower residual flicker survived this fix, reported directly by Crawford: the *top wall specifically* (not the whole box) of whichever box sits one index below/left of the straddling boundary, on every crossing.** `skipMountAnimation` fixed the wall scale/position on a fresh mount, but the top-face div's own *width* comes from a separate `useState(0)`, corrected only once the front face's `ResizeObserver` fires its first (asynchronous) callback — the same remount that `skipMountAnimation` addresses resets this state too, so the top wall rendered fully scaled/positioned but at zero width for a frame. Fixed by initializing that state from an already-known value (`frontWidth` when given, `boxHeight` otherwise) instead of `0` — full rationale and TDD detail live with `CabinetBox`'s own home doc: `docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md`'s "Residual straddle-boundary flicker, 2026-09-09" section.

### 1.9 Fill rendering — a plain child inside `CabinetBox`'s existing `children` slot, no new `CabinetBox` prop

`CabinetBox` stays completely unaware of "fill" the same way it's unaware of "checked" — `VoxelTrack` renders its own colored `<div>` as `children` (the same optional slot 11.1.2 added for `Toggle`, here finally given real content again). Filled/unfilled boxes get a solid color; the straddling box gets a **hard-stop** two-color `linear-gradient` (not a smooth blend — "hard-split... at the local percentage," confirmed intent), split along whichever axis the value travels:

```typescript
export function computeVoxelFillBackground(fillPercent: number, axis: 'horizontal' | 'vertical'): string {
  if (fillPercent >= 100) return 'var(--color-accent)';
  if (fillPercent <= 0) return 'var(--color-surface)';
  const direction = axis === 'vertical' ? 'to top' : 'to right'; // box 0 = min = bottom/left = the filled side
  return `linear-gradient(${direction}, var(--color-accent) 0%, var(--color-accent) ${fillPercent}%, var(--color-surface) ${fillPercent}%, var(--color-surface) 100%)`;
}
```

No new CSS custom property: `--color-accent`/`--color-surface` are the exact same two tokens 11.1.1 §1.4 already established as Cabinetry's own "filled" and "resting" colors (the walls' face-shading and the front face's own default background, respectively) — reused here for a new purpose, not a new pair invented for it.

### 1.10 Radix stays fully in charge; the box row is a `pointer-events: none` overlay — `Range`/`Thumb` visually hidden but present

Directly reuses `SliderCenteredZero.tsx`'s already-shipped pattern: `Slider.Range` stays in the DOM, `visibility: hidden` (decorative, no interaction, kept only for structural/a11y parity — exact precedent). `Slider.Thumb`, unlike `Range`, **must stay hit-testable and focusable** (it's the actual thing dragged and tabbed to) — so it can't use `visibility: hidden` (which also removes focusability in most browsers) or `opacity: 0` (which would also hide its own `:focus-visible` outline, since opacity applies to an element's entire paint including outlines). Instead its **fill alone** goes transparent, leaving the outline rule untouched — the identical "the real interactive element's focus ring survives regardless of what's drawn on top of/instead of it" reasoning 11.1.1 §1.7 already establishes for `Button`'s own `<button>`:

```css
.sc-slider-linear__thumb {
  /* was background-color: var(--color-text-primary) — now transparent so the
     voxel-track boxes read as the only visible fill/position indicator, but
     the element itself (and its :focus-visible outline, below, untouched)
     stays exactly where it was: real, hit-testable, focusable. */
  background-color: transparent;
}
.sc-slider-linear__thumb:focus-visible {
  outline: 2px solid var(--color-accent); /* unchanged */
  outline-offset: 2px;
}
```

`VoxelTrack` itself renders `position: absolute; inset: 0; pointer-events: none` inside `Slider.Track` (`position: relative`, unchanged) — the same "decorative overlay, real element stays in charge" structural split `CabinetBox`'s own walls SVG already uses relative to its front face's real interactive ancestor.

`Slider.Root`'s own size stops being `width: 100%`/CSS-default and becomes the computed voxel-track length directly, satisfying the roadmap's own "a slider's rendered length becomes a fixed function of its box count" line literally: `Slider.Root` gets an inline `width` (horizontal) or `height` (vertical) of `computeVoxelTrackLength(boxCount, boxSize, gap)` px. The floor-clamped-and-scrolling case (§1.11) needs `.sc-slider-linear` itself — not a new wrapper element — to actually clip/scroll, since `Slider.Root`'s own size is exactly its content's size and has nothing of its own to overflow.

### 1.11 Scrolling on `.sc-slider-linear` itself, not a new wrapper element — avoids a DOM-structure change that would break existing DOM-order tests

An earlier draft of this section wrapped `Slider.Root` in a new scroll container. Rejected once checked against `SliderLinear.test.tsx`'s two existing DOM-order tests (`wrapper.children`, direct children of `.sc-slider-linear` only) — a new intermediate wrapper would make `.sc-slider-linear__root` a *grandchild* instead of a *child*, silently breaking both. Resolved instead: `overflow-x`/`overflow-y: auto` (scoped by the existing `data-orientation` attribute, already present on `.sc-slider-linear`) apply directly to the wrapper itself. Since `DualLabel`/the value label are never wider than the box row, only the box row ever triggers the scrollbar in practice — no new element, no DOM-order change, both existing tests keep passing unmodified.

```css
.sc-slider-linear[data-orientation='horizontal'] { overflow-x: auto; overflow-y: visible; }
.sc-slider-linear[data-orientation='vertical']   { overflow-y: auto; overflow-x: visible; }
```

### 1.12 Correcting a stale claim already present in the roadmap's own 11.1.3 Create bullet

11.1.3's own Create bullet (written before this spec pass) describes the straddling box's pop as "+100% of the **box-height-scaled** 2:1 vector 11.1.1 defines" — language that predates 11.1.1's own post-implementation correction (`OBLIQUE_CABINETRY_FOUNDATION.md` §1.2), which replaced height-scaling with the **fixed** `CABINET_POP_DISTANCE` constant well before this spec was written. This spec uses the corrected, fixed-distance behavior uniformly: `popT: 1` for the straddling box means the exact same fixed `CABINET_POP_DISTANCE`/2:1 vector every other Cabinetry item already uses, not a height-scaled amount. `docs/todo/roadmap.md` is corrected in the same pass as this spec (§6).

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── cabinetBreakpoints.ts        # MODIFIED — adds CABINET_VOXEL_GAP (§1.4). CABINET_BOX_HEIGHT,
│   │                                 #   the breakpoint constants, and CabinetTier are unchanged.
│   ├── cabinetBreakpoints.test.ts   # MODIFIED — 1 new case (CABINET_VOXEL_GAP ordering)
│   ├── voxelTrackMath.ts            # NEW — VOXEL_TRACK_MIN_BOX_COUNT, computeFittedBoxCount,
│   │                                 #   computeVoxelTrackLength, computeVoxelBoxStates,
│   │                                 #   computeVoxelFillBackground (§1.5, §1.8, §1.9). No DOM, no GSAP.
│   └── voxelTrackMath.test.ts       # NEW
└── components/ui/controls/
    ├── CabinetBox.tsx                # MODIFIED — popped: boolean | number (was boolean); the
    │                                 #   from/target geometry calls generalize to a continuous t (§1.1).
    │                                 #   No other logic change.
    ├── CabinetBox.test.tsx           # MODIFIED — every existing test stays passing (they all pass a
    │                                 #   boolean, which normalizes identically to before); new cases
    │                                 #   for a fractional popped value (§5)
    ├── cabinetBreakpoints.ts, cabinetGeometry.ts, cabinetAnimation.ts — see src/utils/ above; the
    │   latter two are reused with NO changes.
    ├── useCabinetBoxHeight.ts        # MODIFIED — internal tier-resolution factored into a private
    │                                 #   useCabinetTier() hook; useCabinetBoxHeight()'s own export
    │                                 #   signature is unchanged; adds useVoxelTrackGap() (§1.4)
    ├── useCabinetBoxHeight.test.ts   # MODIFIED — every existing case stays passing; new cases for
    │                                 #   useVoxelTrackGap() resolving/re-resolving per tier
    ├── useVoxelTrackBoxCount.ts      # NEW — the self-fitting ResizeObserver-on-parent hook (§1.5, §1.7)
    ├── useVoxelTrackBoxCount.test.ts # NEW
    ├── VoxelTrack.tsx                 # NEW — renders N CabinetBox instances from precomputed
    │                                 #   VoxelBoxState[] (§1.2, §1.3, §1.9, §1.10)
    ├── VoxelTrack.css                 # NEW
    ├── VoxelTrack.test.tsx            # NEW
    ├── SliderLinear.tsx               # MODIFIED — renders through VoxelTrack in place of the plain
    │                                 #   track+handle; same schema/value/onChange/disabled/
    │                                 #   verticalHeight contract
    ├── SliderLinear.css               # MODIFIED — thumb fill goes transparent (§1.10); scroll rules
    │                                 #   added to the existing data-orientation selectors (§1.11)
    └── SliderLinear.test.tsx          # MODIFIED — see §5 for exactly which existing cases are
                                        #   preserved vs. must be rewritten (3 of 17 change; the rest
                                        #   are untouched)

docs/
├── CONSOLE_THEMING.md      # MODIFIED — gains the voxel-track dual-fill/extrusion-falloff rules
│                            #   (roadmap 11.1.3's own Docs bullet)
├── COMPONENT_LIBRARY.md    # MODIFIED — "internal rendering changed, contract didn't" note for
│                            #   SliderLinear, plus a pointer to the shared voxel-track mechanism
│                            #   for 11.1.4/11.1.5 to reference
└── todo/roadmap.md      # MODIFIED — corrects the stale "box-height-scaled" wording (§1.12)
```

**Explicitly not touched, and why:**

- `Button.tsx`, `Toggle.tsx` (and their `.css`/`.test.tsx`) — both pass a plain `boolean` to `popped`, which normalizes identically before and after §1.1's widening. Zero behavioral or textual change to either file.
- `cabinetGeometry.ts`, `cabinetAnimation.ts` — reused exactly as 11.1.1 shipped them; `computeCabinetGeometry` already took a continuous `t: number`, it was only `CabinetBox.tsx`'s own call sites that hardcoded binary inputs.
- `CabinetBox.css` — no new class, no new rule. The square-footprint override lives entirely in `VoxelTrack.css`, scoped to `.sc-voxel-track`, mirroring exactly how `Toggle.css`'s own 32×32px override stayed scoped to `.sc-toggle__root` rather than touching the shared stylesheet.
- `SliderLog.tsx`/`.css`, `SliderCenteredZero.tsx`/`.css` — 11.1.4/11.1.5's job; both reuse `VoxelTrack`/`voxelTrackMath.ts`/`useVoxelTrackBoxCount.ts` unchanged, swapping in only their own `t → value` curve. `SliderCenteredZero.css`'s existing `--slider-vertical-height` CSS-default reference stays live for that component even after this phase (only `SliderLinear.css` stops consulting it).
- `src/types/controls.ts` — `SliderLinearSchema`/`ControlSchema` are unchanged (confirmed intent; box count is derived, never schema-authored).
- Any domain config (`robotOptionsConfig.ts`, `audioRigConfig.ts`, `companyConfig.ts`, `sectorSettingsConfig.ts`) or drawer component — `SliderLinear`'s props contract is unchanged, so no call site (e.g. `AudioRigDrawer.tsx`'s EQ3 gain sliders) needs to change.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `--voxel-box-size`/`--voxel-gap` are `SliderLinear.tsx`-local inline styles (mirroring `Toggle.tsx`'s own `--cabinet-toggle-box-size` precedent), and fill colors reuse the existing `--color-accent`/`--color-surface` tokens unchanged.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`Slider.Root`/`Slider.Thumb` keep 100% of the actual interaction.** `VoxelTrack`'s boxes carry `pointer-events: none` (the wrapper) and are never given their own `onPointerDown`/click handling. Do not make any voxel box itself hit-testable.
* **No timer-based animation.** `ResizeObserver` and `window.matchMedia`'s `change` listener are event-driven, not polling, consistent with CLAUDE.md's forbidden-pattern list. Do not introduce `setTimeout`/`setInterval`/`requestAnimationFrame` anywhere in this phase's files.
* **GSAP never calls `AudioEngine`.** Every voxel box's `CabinetBox` timeline drives only its own cosmetic pop/glow — per CLAUDE.md's Strict Separation guardrail. `onChange` continues to fire straight from Radix's `Slider.Root` drag/keyboard handling, entirely independent of any box's GSAP timeline.
* **Every GSAP timeline is registered in `timelineMap`**, keyed uniquely per box (`` `cabinet-voxel-${schema.id}-${i}` ``) — this is `CabinetBox`'s own existing behavior, unmodified; `VoxelTrack` only needs to supply unique keys.
* **`CabinetBox.tsx`'s `popped` widening (§1.1) must not change `Button`/`Toggle`'s rendered output or `timelineMap` behavior in any way.** The normalization (`typeof popped === 'number' ? popped : (popped ? 1 : 0)`) must produce byte-identical `computeCabinetGeometry` calls for a boolean input as today's code produces — verified by keeping every existing `CabinetBox.test.tsx` case passing unmodified (§5), not just by inspection.
* **No new `CabinetBox` prop for fill.** Fill is rendered entirely through the existing optional `children` slot (§1.9) — do not add a `fillPercent`/`fillColor` prop to `CabinetBoxProps`.
* **Box count is never schema-authored.** Do not add a `boxCount` field to `SliderLinearSchema` — the whole point of this item, per confirmed intent, is that it self-fits.
* **`useVoxelTrackBoxCount` observes the slider wrapper's *parent*, never its own rendered box** (§1.5) — the same feedback-loop guard `useAutoSliderOrientation` already enforces. Do not observe `Slider.Root`'s or `.sc-slider-linear`'s own element.
* **No new `ControlSchema` variant, no schema field addition.** `SliderLinear`'s `{ schema, value, onChange, disabled?, verticalHeight? }` props contract is byte-for-byte unchanged.
* **`verticalHeight` becomes a fitting budget, not a literal applied value (§1.7)** — a deliberate, named behavior change. Do not attempt to force `Slider.Root`'s rendered height to exactly equal `verticalHeight`; the box-quantized `computeVoxelTrackLength` output is correct even when it doesn't match that number exactly.
* **Out of scope, per the intent doc:** exact hook internals beyond what's specified here were left open by the intent doc but are resolved by this spec (§1) rather than deferred further; `SliderLog`/`SliderCenteredZero`'s own wiring (11.1.4/11.1.5); a drawer's own CSS grid/flex sizing of the space a slider sits in; `Stepper`/`StepperWithToggle` (dropped from Cabinetry entirely, per 11.1.1); WorldView/terrain/sky styling; robot visuals (locked to audio attributes per CLAUDE.md); the power rocker switch/`SleeveContainer`; and 11.2's accessibility/performance verification pass.

---

## 4. Code Style & Architecture Conventions

**`src/utils/cabinetBreakpoints.ts`** (modified — one new export, everything else byte-for-byte unchanged):

```typescript
export const CABINET_BREAKPOINT_MOBILE_MAX = 640;
export const CABINET_BREAKPOINT_TABLET_MAX = 1024;

export const CABINET_BOX_HEIGHT = {
  mobile: 32,
  tablet: 40,
  desktop: 48,
} as const;

/**
 * Voxel-track box gap (roadmap Phase 11.1.3) — the same 3 breakpoint tiers
 * CABINET_BOX_HEIGHT already uses, resolved by the same shared tier
 * detection (useCabinetTier, useCabinetBoxHeight.ts) rather than a second,
 * independently hand-synced set of matchMedia listeners. See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.4.
 */
export const CABINET_VOXEL_GAP = {
  mobile: 8,
  tablet: 10,
  desktop: 12,
} as const;

export type CabinetTier = keyof typeof CABINET_BOX_HEIGHT;
```

**`src/components/ui/controls/useCabinetBoxHeight.ts`** (full replacement — `useCabinetBoxHeight`'s own export signature is unchanged; the file gains a private tier hook and one new export):

```typescript
import { useEffect, useState } from 'react';
import {
  CABINET_BOX_HEIGHT,
  CABINET_VOXEL_GAP,
  CABINET_BREAKPOINT_MOBILE_MAX,
  CABINET_BREAKPOINT_TABLET_MAX,
  type CabinetTier,
} from '@/utils/cabinetBreakpoints';

function resolveTier(): CabinetTier {
  if (typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_MOBILE_MAX}px)`).matches) return 'mobile';
  if (window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_TABLET_MAX}px)`).matches) return 'tablet';
  return 'desktop';
}

/**
 * Live current breakpoint tier — one matchMedia listener pair, shared by
 * every hook below rather than each resolving its own. Factored out of
 * useCabinetBoxHeight (roadmap 11.1.1) when useVoxelTrackGap (11.1.3) needed
 * the same tier for a second, independent value — see
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.4 for why this wasn't
 * simply a second copy of the same listener logic.
 */
function useCabinetTier(): CabinetTier {
  const [tier, setTier] = useState(resolveTier);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mobileQuery = window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_MOBILE_MAX}px)`);
    const tabletQuery = window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_TABLET_MAX}px)`);
    const update = () => setTier(resolveTier());
    mobileQuery.addEventListener('change', update);
    tabletQuery.addEventListener('change', update);
    return () => {
      mobileQuery.removeEventListener('change', update);
      tabletQuery.removeEventListener('change', update);
    };
  }, []);

  return tier;
}

/**
 * Live numeric cabinet box height for the current viewport tier — for the
 * wall-geometry math (cabinetGeometry.ts) and, since 11.1.3, the exact
 * square footprint voxel-track boxes use too (see that item's own spec §1.3
 * — the roadmap's box sizes are these same 3 numbers, not a new constant).
 */
export function useCabinetBoxHeight(): number {
  return CABINET_BOX_HEIGHT[useCabinetTier()];
}

/**
 * Live numeric voxel-track box gap for the current viewport tier (roadmap
 * Phase 11.1.3). See docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.4.
 */
export function useVoxelTrackGap(): number {
  return CABINET_VOXEL_GAP[useCabinetTier()];
}
```

**`src/utils/voxelTrackMath.ts`** (new, full file):

```typescript
/**
 * Pure voxel-track math shared by SliderLinear (roadmap 11.1.3) and its two
 * thin follow-ups, SliderLog/SliderCenteredZero (11.1.4/11.1.5) — no DOM, no
 * GSAP, no React. See docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.5,
 * §1.8, §1.9 for the derivations.
 */

/** A container too narrow for even this many boxes clamps to this count and
 *  scrolls, rather than shrinking boxes below their fixed per-breakpoint
 *  size. Confirmed via /interview-me. */
export const VOXEL_TRACK_MIN_BOX_COUNT = 3;

/**
 * How many fixed-size boxes fit in `availableLength` px without overflowing,
 * floored, clamped to VOXEL_TRACK_MIN_BOX_COUNT. N boxes of size `boxSize`
 * with (N-1) gaps of `gap` occupy N*(boxSize+gap) - gap px; solving for the
 * largest N that fits gives this formula. See §1.5.
 */
export function computeFittedBoxCount(availableLength: number, boxSize: number, gap: number): number {
  if (boxSize <= 0) return VOXEL_TRACK_MIN_BOX_COUNT;
  const fitted = Math.floor((availableLength + gap) / (boxSize + gap));
  return Math.max(VOXEL_TRACK_MIN_BOX_COUNT, fitted);
}

/** Total rendered length of `boxCount` boxes — the inverse of the packing
 *  math above, used to size Slider.Root itself to a fixed function of box
 *  count (confirmed intent). */
export function computeVoxelTrackLength(boxCount: number, boxSize: number, gap: number): number {
  return boxCount * boxSize + Math.max(0, boxCount - 1) * gap;
}

export interface VoxelBoxState {
  /** 0-100. Only the straddling box is ever fractional. */
  fillPercent: number;
  /** 0-1, fed directly into CabinetBox's popped prop. */
  popT: number;
}

/**
 * Dual-fill + extrusion-falloff, per box. Boxes are indexed 0 (nearest min)
 * through boxCount-1 (nearest max) — Radix's own horizontal min-at-left /
 * vertical min-at-bottom convention (SliderCenteredZero.tsx's own existing
 * precedent). See §1.8 for the roadmap-wording cross-check.
 */
export function computeVoxelBoxStates(value: number, min: number, max: number, boxCount: number): VoxelBoxState[] {
  const t = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const rawPosition = t * boxCount;
  const straddlingIndex = Math.min(boxCount - 1, Math.floor(rawPosition));
  const localFraction = rawPosition - straddlingIndex;

  return Array.from({ length: boxCount }, (_, i) => {
    if (i < straddlingIndex) {
      return { fillPercent: 100, popT: straddlingIndex === 0 ? 0 : i / straddlingIndex };
    }
    if (i > straddlingIndex) {
      return { fillPercent: 0, popT: 0 };
    }
    return { fillPercent: localFraction * 100, popT: 1 };
  });
}

/**
 * A box's front-face background: solid accent when fully filled, solid
 * surface when fully empty, a HARD-STOP two-color gradient (not a blend) for
 * the straddling box's local split. Reuses the same --color-accent/
 * --color-surface tokens CabinetBox's own face-shading and default front
 * face already use — no new CSS custom property. See §1.9.
 */
export function computeVoxelFillBackground(fillPercent: number, axis: 'horizontal' | 'vertical'): string {
  if (fillPercent >= 100) return 'var(--color-accent)';
  if (fillPercent <= 0) return 'var(--color-surface)';
  const direction = axis === 'vertical' ? 'to top' : 'to right';
  return `linear-gradient(${direction}, var(--color-accent) 0%, var(--color-accent) ${fillPercent}%, var(--color-surface) ${fillPercent}%, var(--color-surface) 100%)`;
}
```

**`src/components/ui/controls/useVoxelTrackBoxCount.ts`** (new, full file):

```typescript
import { useEffect, useState, type RefObject } from 'react';
import { computeFittedBoxCount } from '@/utils/voxelTrackMath';

/**
 * Live, self-fitting voxel-track box count. Mirrors useAutoSliderOrientation's
 * exact measurement convention: observes `ref`'s *parent*, never `ref`'s own
 * rendered box (rendering more boxes would otherwise widen the wrapper,
 * which would widen a self-observed measurement, unboundedly). `axis` must
 * already be resolved ('horizontal' | 'vertical', never 'auto') — orientation
 * resolves first, box count fits second (docs/specs/
 * OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.6).
 *
 * `explicitAvailableLength`, when provided, skips live measurement entirely
 * and fits against that fixed number instead — SliderLinear's own
 * verticalHeight prop, on a vertical slider, becomes a fitting BUDGET rather
 * than a literal applied length this way (§1.7).
 */
export function useVoxelTrackBoxCount(
  ref: RefObject<HTMLElement | null>,
  axis: 'horizontal' | 'vertical',
  boxSize: number,
  gap: number,
  explicitAvailableLength?: number,
): number {
  const [measuredLength, setMeasuredLength] = useState(0);

  useEffect(() => {
    if (explicitAvailableLength !== undefined) return;
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const next = axis === 'vertical' ? height : width;
      setMeasuredLength((prev) => (prev === next ? prev : next));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [ref, axis, explicitAvailableLength]);

  const availableLength = explicitAvailableLength ?? measuredLength;
  return computeFittedBoxCount(availableLength, boxSize, gap);
}
```

**`src/components/ui/controls/VoxelTrack.tsx`** (new, full file):

```tsx
import type { CSSProperties } from 'react';
import { CabinetBox } from './CabinetBox';
import { computeVoxelFillBackground, type VoxelBoxState } from '@/utils/voxelTrackMath';
import './VoxelTrack.css';

interface VoxelTrackProps {
  states: VoxelBoxState[];
  boxSize: number;
  gap: number;
  axis: 'horizontal' | 'vertical';
  /** Unique per-slider-instance prefix; each box gets `${timelineKeyPrefix}-${i}`. */
  timelineKeyPrefix: string;
}

/**
 * Shared voxel-track rendering (roadmap Phase 11.1.3) — a row (or, vertical,
 * a bottom-to-top column) of uniform CabinetBox facades standing in for a
 * slider's traditional track+handle. Purely a pointer-events: none visual
 * overlay; SliderLinear.tsx (and, unchanged, SliderLog/SliderCenteredZero in
 * 11.1.4/11.1.5) keeps Radix's own Slider.Root/Track/Thumb fully in charge
 * of interaction — see docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.10.
 */
export function VoxelTrack({ states, boxSize, gap, axis, timelineKeyPrefix }: VoxelTrackProps) {
  const tokens = {
    '--voxel-box-size': `${boxSize}px`,
    '--voxel-gap': `${gap}px`,
  } as CSSProperties;

  return (
    <div className="sc-voxel-track" data-axis={axis} style={tokens} aria-hidden="true">
      {states.map((state, i) => (
        <CabinetBox
          key={i}
          popped={state.popT}
          boxHeight={boxSize}
          timelineKey={`${timelineKeyPrefix}-${i}`}
        >
          <div
            className="sc-voxel-track__fill"
            style={{ background: computeVoxelFillBackground(state.fillPercent, axis) }}
          />
        </CabinetBox>
      ))}
    </div>
  );
}
```

**`src/components/ui/controls/VoxelTrack.css`** (new, full file):

```css
.sc-voxel-track {
  position: absolute;
  inset: 0;
  display: flex;
  gap: var(--voxel-gap);
  pointer-events: none;
}

/* Box 0 (nearest min) renders leftmost. */
.sc-voxel-track[data-axis='horizontal'] {
  flex-direction: row;
}

/* Box 0 (nearest min) renders bottommost — matches Radix's own vertical
   min-at-bottom convention (SliderCenteredZero's own existing precedent). */
.sc-voxel-track[data-axis='vertical'] {
  flex-direction: column-reverse;
}

/* Forces every box to an exact square at the current breakpoint's size —
   CabinetBox's front face is otherwise content-driven (Button) or a
   caller-forced fixed size (Toggle); this scopes the same override
   technique to voxel-track boxes specifically, mirroring
   docs/specs/OBLIQUE_CABINETRY_TOGGLE.md §1.2 exactly. See this item's own
   §1.3. */
.sc-voxel-track .sc-cabinet-box__front {
  width: var(--voxel-box-size);
  height: var(--voxel-box-size);
  padding: 0;
}

.sc-voxel-track__fill {
  width: 100%;
  height: 100%;
}
```

**`src/components/ui/controls/CabinetBox.tsx`** (modified — only the props interface and the geometry effect's `popped`/`from`/`target` handling change; walls/front-face JSX, the `ResizeObserver` width-measurement effect, and the glow mechanism are otherwise byte-for-byte identical to the 11.1.2-shipped file):

```tsx
interface CabinetBoxProps {
  /** Whether/how far the box should be popped. `true`/`1` is fully popped,
   *  `false`/`0` is flat — Button and Toggle pass a boolean (no intermediate
   *  state, per 11.1.1 §3/11.1.2). VoxelTrack (roadmap 11.1.3) is the first
   *  consumer needing a genuine fractional value, for extrusion-falloff's
   *  per-box step-down. Normalized to a 0-1 number immediately on entry —
   *  everything downstream uses that normalized value only. See
   *  docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.1. */
  popped: boolean | number;
  timelineKey: string;
  boxHeight?: number;
  children?: ReactNode;
}

export function CabinetBox({ popped, timelineKey, boxHeight: boxHeightOverride, children }: CabinetBoxProps) {
  const poppedT = typeof popped === 'number' ? popped : (popped ? 1 : 0);
  // ...wrapperRef/frontRef/topFaceRef/leftFaceRef/width/boxHeight/prevPoppedRef
  // and the width-measurement ResizeObserver effect are UNCHANGED from the
  // 11.1.2-shipped file...

  useEffect(() => {
    if (!frontRef.current || !topFaceRef.current || !leftFaceRef.current || !wrapperRef.current || width === 0) return;
    killTimeline(timelineKey);

    const previousPopped = prevPoppedRef.current; // captured before being overwritten
    const isTransition = previousPopped === null || previousPopped !== poppedT;
    prevPoppedRef.current = poppedT;

    const target = computeCabinetGeometry(width, boxHeight, poppedT);

    if (!isTransition) {
      gsap.set(topFaceRef.current, { attr: { points: target.topFacePoints } });
      gsap.set(leftFaceRef.current, { attr: { points: target.leftFacePoints } });
      gsap.set(frontRef.current, { x: target.frontFaceOffsetX, y: target.frontFaceOffsetY });
      gsap.set(wrapperRef.current, { '--cabinet-glow': poppedT });
      return;
    }

    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getCabinetPopDuration(prefersReducedMotion);
    // On the very first run (previousPopped === null), animate in from the
    // numeric opposite — reproduces today's Button/Toggle "opposite of the
    // binary state" behavior exactly when poppedT is 0 or 1, and generalizes
    // sensibly for a fractional starting value.
    const from = computeCabinetGeometry(width, boxHeight, previousPopped ?? (1 - poppedT));
    const to = target;

    const tl = gsap.timeline();
    tl.fromTo(topFaceRef.current,
      { attr: { points: from.topFacePoints } },
      { attr: { points: to.topFacePoints }, duration, ease: 'power2.out' }, 0)
      .fromTo(leftFaceRef.current,
        { attr: { points: from.leftFacePoints } },
        { attr: { points: to.leftFacePoints }, duration, ease: 'power2.out' }, 0)
      .fromTo(frontRef.current,
        { x: from.frontFaceOffsetX, y: from.frontFaceOffsetY },
        { x: to.frontFaceOffsetX, y: to.frontFaceOffsetY, duration, ease: 'power2.out' }, 0)
      .fromTo(wrapperRef.current,
        { '--cabinet-glow': previousPopped ?? (1 - poppedT) },
        { '--cabinet-glow': poppedT, duration, ease: 'power2.out' }, 0);
    setTimeline(timelineKey, tl);
  }, [poppedT, width, boxHeight, timelineKey]);

  // ...cabinetTokens and the returned JSX (walls SVG + front face) are
  // UNCHANGED from the 11.1.2-shipped file...
}
```

**`src/components/ui/controls/SliderLinear.tsx`** (full replacement):

```tsx
import { useRef, type CSSProperties } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useCabinetBoxHeight, useVoxelTrackGap } from './useCabinetBoxHeight';
import { useVoxelTrackBoxCount } from './useVoxelTrackBoxCount';
import { computeVoxelTrackLength, computeVoxelBoxStates } from '@/utils/voxelTrackMath';
import type { SliderLinearSchema } from '@/types/controls';
import './SliderLinear.css';

interface SliderLinearProps {
  schema: SliderLinearSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length — see docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md
   *  §1.7) box count fits within, instead of a live ResizeObserver
   *  measurement of the parent. Omit to fit live against the parent. */
  verticalHeight?: number;
}

/**
 * Linear-scale slider, rendering through the shared voxel-track system
 * (roadmap Phase 11.1.3) — a row of uniform CabinetBox facades in place of
 * the traditional track+handle, self-fitting its own box count live to
 * whatever space its container gives it. All 3 SliderOrientation values.
 * See docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md for the full derivation.
 */
export function SliderLinear({ schema, value, onChange, disabled, verticalHeight }: SliderLinearProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const boxSize = useCabinetBoxHeight();
  const gap = useVoxelTrackGap();
  const explicitLength = isVertical ? verticalHeight : undefined;
  const boxCount = useVoxelTrackBoxCount(wrapperRef, orientation, boxSize, gap, explicitLength);
  const trackLength = computeVoxelTrackLength(boxCount, boxSize, gap);
  const states = computeVoxelBoxStates(value, schema.min, schema.max, boxCount);

  const valueLabel = (
    <span className="sc-slider-linear__value">{formatDisplayValue(value)}{schema.unit}</span>
  );

  const rootStyle: CSSProperties = isVertical ? { height: trackLength } : { width: trackLength };

  return (
    <div ref={wrapperRef} className="sc-slider-linear" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-linear__root"
        orientation={orientation}
        min={schema.min}
        max={schema.max}
        step={schema.step ?? 1}
        value={[value]}
        onValueChange={(values) => onChange(values[0])}
        disabled={disabled}
        style={rootStyle}
      >
        <Slider.Track className="sc-slider-linear__track">
          <Slider.Range className="sc-slider-linear__range" />
          <VoxelTrack
            states={states}
            boxSize={boxSize}
            gap={gap}
            axis={orientation}
            timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
          />
        </Slider.Track>
        <Slider.Thumb className="sc-slider-linear__thumb" aria-label={resolveAccessibleName(schema)} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}
```

**`src/components/ui/controls/SliderLinear.css`** (full replacement):

```css
.sc-slider-linear {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sc-slider-linear[data-orientation='vertical'] {
  display: inline-flex;
  align-items: center;
}

/* Only the box row (Slider.Root) is ever wider/taller than its container —
   the label/value are always narrower in practice, so this scrollbar only
   ever engages for the 3-box overflow floor (voxelTrackMath.ts's
   VOXEL_TRACK_MIN_BOX_COUNT). No separate wrapper element — see
   docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.11 for why one was
   deliberately avoided. */
.sc-slider-linear[data-orientation='horizontal'] {
  overflow-x: auto;
  overflow-y: visible;
}

.sc-slider-linear[data-orientation='vertical'] {
  overflow-y: auto;
  overflow-x: visible;
}

.sc-slider-linear__root {
  position: relative;
  display: flex;
  align-items: center;
  /* was width: 100% — Slider.Root's own inline width/height (set in
     SliderLinear.tsx from computeVoxelTrackLength) now supersedes this;
     kept only as a same-paint fallback for the instant before that inline
     style applies, mirroring CabinetBox.css's own :root fallback precedent. */
  width: 100%;
  height: 20px;
  touch-action: none;
  user-select: none;
}

.sc-slider-linear__track {
  position: relative;
  flex-grow: 1;
  height: 3px;
  border-radius: 999px;
  background-color: var(--color-border);
}

/* Decorative only, kept in the DOM for structural/a11y parity — the voxel
   track (an absolutely-positioned sibling inside Slider.Track) renders the
   real visible fill. Mirrors SliderCenteredZero.css's own .__range rule
   exactly. */
.sc-slider-linear__range {
  visibility: hidden;
}

.sc-slider-linear__thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  /* was background-color: var(--color-text-primary) — the voxel boxes now
     carry all visible fill/position information; the thumb itself stays
     real, hit-testable, and focusable (never visibility:hidden/opacity:0,
     which would also hide the :focus-visible outline below). See §1.10. */
  background-color: transparent;
}

.sc-slider-linear__thumb:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.sc-slider-linear__root[data-orientation='vertical'] {
  flex-direction: column;
  width: 20px;
  /* Slider.Root's own inline height (from computeVoxelTrackLength) always
     supersedes this now — the old --slider-vertical-height fallback stays
     defined globally for SliderCenteredZero/SliderLog (which don't consult
     it until 11.1.4/11.1.5), but SliderLinear no longer reads it live. */
  height: var(--slider-vertical-height, 256px);
}

.sc-slider-linear__track[data-orientation='vertical'] {
  width: 3px;
  height: 100%;
}

.sc-slider-linear__range[data-orientation='vertical'] {
  width: 100%;
  height: auto;
}

.sc-slider-linear__value {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
```

* **Naming conventions:** `VoxelTrack`/`VoxelBoxState` (PascalCase component/type), `sc-voxel-track`/`sc-voxel-track__fill` (`sc-` prefix + BEM element suffix, matching every other primitive), `voxelTrackMath.ts`/`useVoxelTrackBoxCount.ts` (flat-function/hook modules, mirroring `cabinetGeometry.ts`/`useAutoSliderOrientation.ts`'s own naming precedent), `computeFittedBoxCount`/`computeVoxelTrackLength`/`computeVoxelBoxStates`/`computeVoxelFillBackground` (verb-first pure functions, matching `computeCabinetGeometry`/`computeFillRect`).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`cabinetBreakpoints.test.ts` (modified, 1 new case):** every existing assertion (`CABINET_BOX_HEIGHT` ordering, breakpoint-max ordering) stays unchanged and passing; new case: `CABINET_VOXEL_GAP.mobile < .tablet < .desktop`.
* **`useCabinetBoxHeight.test.ts` (modified)** — every existing `useCabinetBoxHeight()` case (32/40/48 resolution per stubbed tier, re-resolution on a stubbed `change` event) stays unchanged and passing, since its export signature and behavior are identical; new cases for `useVoxelTrackGap()`: resolves `8`/`10`/`12` for the same 3 stubbed tiers, and re-resolves when a stubbed query's `change` listener fires — mirroring the existing `useCabinetBoxHeight` cases exactly, one level down.
* **`voxelTrackMath.test.ts` (new):**
  1. `computeFittedBoxCount`: exact-fit, under-fit-by-one-gap, and over-generous-space cases against the hand-derived formula; `boxSize <= 0` returns `VOXEL_TRACK_MIN_BOX_COUNT`; a space too small even for 3 boxes still returns exactly `3` (the floor, not fewer).
  2. `computeVoxelTrackLength`: inverse-checked directly against `computeFittedBoxCount` — for any `(boxSize, gap)` pair and a generous `availableLength`, `computeVoxelTrackLength(computeFittedBoxCount(availableLength, boxSize, gap), boxSize, gap) <= availableLength` (the fitted count never overflows what was asked for). `boxCount: 1` returns exactly `boxSize` (no gap term).
  3. `computeVoxelBoxStates`: `value === min` → every box `fillPercent: 0`, box `0`'s `popT: 1` (it's the straddling box) and (for `boxCount > 1`) every other box `popT: 0`; `value === max` → every box `fillPercent: 100` except none extrude at `t=1` past the last index... **explicitly verify the `t=1` edge**: `rawPosition = boxCount` before clamping, `straddlingIndex` clamps to `boxCount - 1` (the last box), so the last box is the straddling one at `fillPercent: 100`, `popT: 1`, and every prior box is `fillPercent: 100` with a stepped-down `popT`, never `fillPercent: 0` — a case worth a named test since the clamp is exactly the kind of off-by-one a boundary like this invites. A mid-range value against a small `boxCount` (e.g. `4`) is hand-verified against the exact expected per-box `{fillPercent, popT}` array, not just spot-checked. `min === max` returns every box `fillPercent: 0`/`popT` per the `t=0` case, without throwing.
  4. `computeVoxelFillBackground`: `100`/`0` return the two solid `var(...)` strings exactly (no gradient syntax); a mid-value (e.g. `37`) returns a `linear-gradient` containing both color stops at the same `37%`/`37%` boundary (hard stop, not a range); `axis: 'vertical'` uses `to top`, `axis: 'horizontal'` uses `to right`.
* **`useVoxelTrackBoxCount.test.ts` (new)**, using the `MockResizeObserver` convention from `useAutoSliderOrientation.test.ts`:
  1. Returns `VOXEL_TRACK_MIN_BOX_COUNT` before any `ResizeObserver` callback fires.
  2. Observes the `ref`'s **parent**, never `ref.current` itself — asserted the same way `useAutoSliderOrientation.test.ts` already asserts this for orientation (inspecting `MockResizeObserver.instances[0].observedTargets`).
  3. Reads `width` when `axis: 'horizontal'`, `height` when `axis: 'vertical'`, from the same fired entry — two separate cases, not inferred from one.
  4. Re-computes (a re-render reflecting a new box count) when the observer fires a new size — not just on mount.
  5. **`explicitAvailableLength` provided:** no `ResizeObserver` is constructed at all (`MockResizeObserver.instances` stays empty for that render), and the returned count is computed directly from the supplied number, ignoring the (unfired) observer entirely.
* **`VoxelTrack.test.tsx` (new)**, mocking `CabinetBox` directly (mirroring `Button.test.tsx`'s own precedent):
  1. Renders exactly `states.length` `CabinetBox` instances.
  2. Passes each instance a `popped` equal to that index's `state.popT` (a `number`, not a `boolean` — asserted via `typeof`, guarding against an accidental `!!` coercion creeping in).
  3. Passes each instance a `timelineKey` of `` `${timelineKeyPrefix}-${i}` ``, unique per box.
  4. The rendered `background` of each box's fill child matches `computeVoxelFillBackground(state.fillPercent, axis)` exactly (spying on the real `voxelTrackMath` module via `importOriginal`, not re-deriving the expected string independently).
  5. The root element carries `aria-hidden="true"` and `data-axis` matching the `axis` prop.
* **`CabinetBox.test.tsx` (modified)** — every existing case (11.1.1/11.1.2's full suite: `children` rendering, timeline registration/kill, reduced-motion, wall/face rendering, border-box measurement, glow tween direction, the width-only-reposition-doesn't-replay fix, the `boxHeight`/optional-`children` additive props) stays unchanged and passing — every one of them passes a `boolean` `popped`, which normalizes identically before and after §1.1's widening. New cases:
  1. A fractional `popped` (e.g. `0.4`) computes geometry at `t = 0.4` directly (spying on `computeCabinetGeometry`'s call arguments, not just asserting "doesn't throw").
  2. `--cabinet-glow` tweens to exactly `0.4` (not `0` or `1`) for a fractional `popped` value — extends the existing glow-direction test (item 7 in `OBLIQUE_CABINETRY_FOUNDATION.md`'s own §5) to a non-boundary value.
  3. Transitioning from one fractional value to another (e.g. `0.4 → 0.7`, no boundary crossing) animates `from: 0.4` directly — not `from: 1` or `from: 0` — confirming `previousPopped` (not the binary-opposite fallback) drives the tween once a real prior value exists.
  4. The very first render at a fractional `popped` (e.g. `0.4`, `previousPopped === null`) animates `from: 0.6` (`1 - 0.4`) — confirming the numeric-opposite fallback generalizes correctly, not just at `0`/`1`.
* **`SliderLinear.test.tsx` (modified)** — of the 17 existing cases, **14 stay unchanged and passing** (ARIA min/max/now, unit/no-unit value rendering, the 3-decimal display cap vs. full-precision `aria-valuenow`, `DualLabel` rendering, accessible-name fallback, not-disabled-by-default, disabled attribute + tabindex removal, no `onChange` on a disabled keyboard step, the `'vertical'`/`'horizontal'` `data-orientation` cases on both root and wrapper, the 2 DOM-order cases for the value label — deliberately preserved via §1.11's no-new-wrapper decision, and the `'auto'`-defaults-to-horizontal-before-measurement case) — none of them assert against `Slider.Root`'s inline height/width or any track-internal markup that changed. **3 must be rewritten**, a deliberate, named behavior change (§1.7), not a regression:
  1. *(was "does not set an inline height when verticalHeight is omitted")* → **now: sets an inline height computed from the live-measured/fitted box count**, even when `verticalHeight` is omitted — asserted via a fired `MockResizeObserver` entry feeding a known available height, then checking `root.style.height` equals `computeVoxelTrackLength(...)` for the resulting fitted count, not empty string.
  2. *(was "sets an inline height from the verticalHeight prop when provided, overriding the CSS default")* → **now: `verticalHeight` is a fitting budget** — asserted with a `verticalHeight` deliberately not an exact multiple of `(boxSize + gap)`, confirming `root.style.height` is the box-quantized `computeVoxelTrackLength` output, not `verticalHeight` verbatim.
  3. *(was "horizontal ignores a verticalHeight prop entirely — no inline height set")* → **still holds structurally (no inline `height` on a horizontal root) but now additionally asserts an inline `width` IS set** (from the same box-count-fitting mechanism, along the horizontal axis instead) — extended, not just preserved.
  New coverage, beyond the rewritten 3:
  4. Renders a `VoxelTrack` (mocked, mirroring `Button.test.tsx`'s `CabinetBox`-mocking precedent) with `states` matching `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)` for the currently-fitted `boxCount`.
  5. `Slider.Thumb`'s rendered `background-color` is `transparent` (or unset, resolving to transparent) — guards against a future edit accidentally restoring a visible thumb fill that would visually duplicate the voxel track's own position indicator.
  6. `screen.getByRole('slider')` still resolves to exactly one element — confirms the voxel boxes (rendered `aria-hidden`, no ARIA role) introduce no accessibility-tree ambiguity.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `Button.test.tsx`/`Toggle.test.tsx` (unmodified — confirms §1.1's widening is genuinely behavior-preserving for both, not just type-compatible).
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app, open a drawer with a real `SliderLinear` (e.g. Audio Rig's EQ3 Gain, or Robot Options' Ping Controls Density) at each of the 3 breakpoints: confirm the track renders as a row of square boxes, not a thin line+dot; confirm dragging/keyboard-stepping the value moves which box is "straddling" and updates the hard-split fill correctly; confirm the straddling box pops fully while boxes below it (toward min) show a visibly graded partial pop, and boxes above (toward max) stay flat; confirm the focus ring (from keyboard `Tab`) renders clearly on top of the box row, not hidden behind it; confirm resizing the window/rotating a tablet emulation live-changes the box count without a full remount glitch; confirm a narrow container (e.g. devtools-emulated small width) clamps to 3 boxes and scrolls horizontally rather than shrinking the boxes; confirm "reduce motion" makes box pop/glow transitions snap instead of animate.

---

## 6. Documentation & Git/Workflow Context

* **`docs/CONSOLE_THEMING.md` update:** add the voxel-track dual-fill/extrusion-falloff rules (§1.8) alongside 11.1.1's existing cabinet geometry/face-shading notes — per roadmap 11.1.3's own Docs bullet.
* **`docs/COMPONENT_LIBRARY.md` update:** the same "internal rendering changed, contract didn't" note `Button`/`Toggle`'s rows already carry, added to `SliderLinear`'s row, plus a pointer to `VoxelTrack`/`voxelTrackMath.ts` for 11.1.4/11.1.5 to reference rather than restate.
* **`docs/todo/roadmap.md` correction:** 11.1.3's own Create bullet's "box-height-scaled 2:1 vector" phrase corrected to match 11.1.1's already-shipped fixed-`CABINET_POP_DISTANCE` behavior (§1.12) — a pre-existing stale claim found during this spec pass, not a scope change.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** a new feature branch (e.g. `feature/cabinetry-slider-linear`) — this phase's implementation footprint (2 new hook/math modules, 1 new shared component, `CabinetBox.tsx`'s widening, `SliderLinear.tsx`/`.css`'s rewrite) is larger than 11.1.2's, so it gets its own branch rather than reusing any prior item's.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `cabinetBreakpoints.ts`/`useCabinetBoxHeight.ts` (the shared-tier refactor + `CABINET_VOXEL_GAP`, no consumer yet) + tests; (2) `voxelTrackMath.ts` (pure math, no consumer yet) + test; (3) `CabinetBox.tsx`'s `popped` widening + test — verified against `Button.test.tsx`/`Toggle.test.tsx` staying green before moving on; (4) `useVoxelTrackBoxCount.ts` + test; (5) `VoxelTrack.tsx`/`.css`/`.test.tsx` (the shared primitive, no real consumer yet); (6) `SliderLinear.tsx`/`.css`/`.test.tsx` (the first real consumer, including the 3 rewritten tests); (7) docs + roadmap correction last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own precedents, not left open):

- ~~Does `CabinetBox` need a new component for intermediate pop states, or does the existing one generalize?~~ **Resolved: the existing `CabinetBox` generalizes — `popped` widens to `boolean | number`, zero behavior change for `Button`/`Toggle`** (§1.1).
- ~~Is voxel-track box size a new constant, or does it reuse an existing one?~~ **Resolved: reuses `useCabinetBoxHeight()`'s existing 32/40/48 tiers exactly — no new size constant** (§1.3).
- ~~Does box-gap resolution duplicate `useCabinetBoxHeight`'s own matchMedia listeners?~~ **Resolved: no — factored into one shared private tier hook, avoiding the exact duplicate-source class of bug 11.1.1 §1.3/§1.9 already found once** (§1.4).
- ~~Does fill rendering need a new `CabinetBox` prop?~~ **Resolved: no — reuses the existing optional `children` slot** (§1.9), same technique `Toggle` used to render nothing at all.
- ~~Does the floor-clamp-and-scroll case need a new wrapper element?~~ **Resolved: no — `overflow` applies directly to `.sc-slider-linear` via its existing `data-orientation` attribute, preserving 2 existing DOM-order tests untouched** (§1.11).

Resolved by direct reasoning during Specify — flagged explicitly since the interview didn't ask this one directly, not silently assumed:

1. **What does `verticalHeight` mean once box count is quantized?** **Resolved: a fitting budget, not a literal applied value** (§1.7) — a real, user-visible behavior change from today's byte-for-byte application. Flagged for Crawford's review specifically: if the intended behavior was actually "force the exact pixel height regardless of box quantization" (e.g. by shrinking box size instead of box count when the numbers don't divide evenly), that's a materially different design not built here — surfaced now rather than discovered live.
2. **What happens to `Slider.Thumb`'s own visible fill?** **Resolved: goes transparent, stays real/hit-testable/focusable, keeps its own `:focus-visible` outline** (§1.10) — not `visibility: hidden`/`opacity: 0`, both of which would have also hidden the focus ring, a correctness requirement (11.1.1 §1.7's own precedent) not just a style choice.
3. **Does `useVoxelTrackBoxCount` re-fit when `boxSize`/`gap` change (a breakpoint crossing) even without the parent's own pixel size changing?** **Resolved: yes** — both are in the hook's effect dependency array, so a breakpoint crossing (which changes `boxSize`/`gap` even if the parent's own width happens not to move) re-subscribes and re-measures. Not separately interviewed, but the only sensible behavior given `useAutoSliderOrientation`'s own precedent of reacting to every dependency change, not just the ones most likely to matter.

**Real risk, not fully resolvable at spec time:** N independent `CabinetBox` timelines per slider (§1.2) — a drawer with several multi-box sliders (Audio Rig's EQ3 alone has 3 gain sliders) could plausibly register dozens of `timelineMap` entries from voxel-track boxes alone, on top of every other primitive's own timeline, compounding 10.2's own already-flagged "70-100+ primaries" concern. Not a blocker for this spec (no measurement exists yet to act on), but named explicitly as the first concrete thing 11.2's performance pass should measure once this item and 11.1.4/11.1.5 have all shipped — a coordinated-single-timeline-per-track redesign is a plausible follow-up if that measurement comes back bad, but isn't attempted speculatively here.

**Forward note for 11.1.4 (`SliderLog`) and 11.1.5 (`SliderCenteredZero`):** both reuse `VoxelTrack`, `voxelTrackMath.ts`, and `useVoxelTrackBoxCount.ts` completely unchanged — neither needs its own container-measurement logic, only its own `t → value` curve (`sliderLogMath.ts`'s existing epsilon-floor curve; `sliderCenteredZeroMath.ts`'s existing zero-anchored math) feeding `computeVoxelBoxStates`' same `value/min/max/boxCount` inputs. `SliderCenteredZero` is flagged in the roadmap itself as the one genuine adaptation (a zero-anchored "filled span," not a min-anchored one) — read that item's own spec for how `computeVoxelBoxStates` (or a zero-anchored sibling function) needs to change, rather than assuming this phase's boxes-from-min logic carries forward unmodified.

### 1.13 Post-implementation correction, 2026-09-09 — trailing-edge overflow at value === max

Reported directly by Crawford: the Limiter, Tempo, and Automatic Effects sliders visibly overflowed their own container at value 100%. Traced to a real gap in this spec's own §1.5/§1.6, not to the same session's separate `OBLIQUE_CABINETRY_FOUNDATION.md` §1.6 hit-area-padding removal — that removal only ever affected `Button`/`Toggle`; `.sc-voxel-track .sc-cabinet-box { padding: 0; }` (`VoxelTrack.css`) had already zeroed the equivalent reservation for every voxel-track box since commit `44a1a2e`, well before this session, so removing the base rule changed nothing here. Same root *category* of bug (a popped footprint's own bleed left unreserved), different specific spot.

`SliderLinear.tsx` sizes `Slider.Root`/`Track` to exactly `computeVoxelTrackLength(boxCount, boxSize, gap)` — a tight fit, with no allowance for a popped box's own bleed (§1.2's fixed 2:1 vector, up to `2×popDistance` right / `popDistance` down). For a box in the *middle* of the row this bleed lands inside the *next* box's own slot — invisible, already contained by `computeVoxelBoxZIndex`'s own stacking scheme (§1.8's addendum). The **last** box (nearest max) has no next slot to bleed into, and — per §1.8's own revision — it's the one box guaranteed to reach the *full* `VOXEL_TRACK_POP_DISTANCE`. At value === max its bleed exits `Slider.Root`/`Track`'s own right edge outright.

Why only some sliders showed it: `computeFittedBoxCount` floors the box count to fit the container, so most containers happen to leave a few px of unused trailing slack that absorbs the bleed by luck. Limiter/Tempo/Automatic Effects' particular container widths landed close enough to an exact multiple of `(boxSize + gap)` to leave none.

Fixed with a new `computeVoxelTrackTrailingReserve(axis)` (`voxelTrackMath.ts`, beside `computeVoxelBoxZIndex`): `2 × VOXEL_TRACK_POP_DISTANCE` for horizontal, `0` for vertical — the fixed 2:1 vector always bleeds right *and down* regardless of axis (§1.8's own addendum), so a vertical track's last (topmost, per `column-reverse`) box bleeds down *into* the column, never past its own top edge; there is no equivalent main-axis gap to reserve there today. `useVoxelTrackBoxCount` gained an optional `reserve` parameter (default `0`, zero behavior change for an omitted call), subtracted from the measured/explicit available length *before* fitting a box count — real slack always exists regardless of the container's exact width, rather than being left to chance. `SliderLinear.tsx` passes `computeVoxelTrackTrailingReserve(orientation)` into that call, then adds the same reserve back on top of `computeVoxelTrackLength`'s own tight result when sizing `Slider.Root` — the reserved slack is actually rendered as real trailing space (`VoxelTrack`'s own boxes are default flex-start within it), not merely excluded from the fit and then dropped.

Shipped with real TDD coverage: `voxelTrackMath.test.ts` gained a `computeVoxelTrackTrailingReserve` describe block; `useVoxelTrackBoxCount.test.ts` gained reserve-subtraction/default/clamp cases (RED confirmed against the pre-fix hook); `SliderLinear.test.tsx`'s existing box-count and inline-width assertions were updated to fit against the reserve-adjusted length, plus a new regression case asserting a container width that's an exact multiple of `(boxSize + gap)` — the previously-broken case — still leaves real trailing slack ≥ the reserve. Full suite (122 files / 2084 tests), lint, and type-check verified green before considering this done.

### 1.14 Post-implementation correction, 2026-09-09 — vertical resolution looped for real (`auto`/`vertical`) sliders with no explicitly-sized container

Reported directly by Crawford: any slider resolving to vertical orientation (hit first via `orientation: 'auto'`, since that's the path that unpredictably lands a slider in a container never built to hold a vertical one) froze the app in an infinite resize loop. Root cause traced to a real regression, not a new gap: `docs/specs/VERTICAL_SLIDERS.md` (the original spec introducing `SliderOrientation`) resolved the vertical-height question as **"256px default, optional per-instance override"** — a pure CSS fallback (`--slider-vertical-height`, `index.css`), no live measurement at all. `SliderLog`/`SliderCenteredZero` still work exactly that way today. This spec's own voxel-track rewrite (§1.6/§1.7 above) replaced that mechanism for `SliderLinear` specifically with `useVoxelTrackBoxCount`'s live `ResizeObserver` fallback whenever `verticalHeight` is omitted — silently dropping the original non-measuring default in the process. `SliderLinear.test.tsx`'s own pre-fix test name said as much: *"always sets an inline height computed from the live-fitted box count, even when verticalHeight is omitted — no longer the old `--slider-vertical-height` CSS default."*

For any real container whose own height is auto/shrink-wrapped to its content — a plain block `<div>` (e.g. `AudioRigDrawer.tsx`'s `.audio-rig-drawer__param-row`, `height` unset in `AudioRigDrawer.css`), not a fixed-height grid/flex cell — that live measurement is genuinely circular: the parent's height depends on `SliderLinear`'s own rendered height (`Slider.Root`'s inline `height`, main axis), which — via `useVoxelTrackBoxCount`'s vertical branch observing `ref.current?.parentElement` — depends on measuring that same parent. Every real production schema (`audioRigConfig.ts`'s compressor/limiter/filter params at `orientation: 'auto'`; `robotOptionsConfig.ts`'s per-layer gain/phase/pulseWidth at `orientation: 'vertical'`) hits this whenever it lands somewhere with no externally-fixed height — none of them pass `verticalHeight` today, so none had a safe fallback once the CSS-only default was dropped.

Fixed by restoring the original design as `SliderLinear`'s own default, rather than reinventing it: a new `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT = 256` (`voxelTrackMath.ts`, matching `--slider-vertical-height` exactly) is used as the fitting budget whenever `verticalHeight` is omitted on a vertical-resolving slider — `explicitLength = isVertical ? (verticalHeight ?? VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT) : undefined`. Because `useVoxelTrackBoxCount` already treats a defined `explicitAvailableLength` as "skip live measurement entirely, fit against this fixed number instead" (§1.5), this one-line change removes the `ResizeObserver` construction outright for every vertical slider that doesn't explicitly opt into a real live-measured budget — there is no such caller today, so this closes the loop for the whole app, not just `orientation: 'auto'` specifically. `orientation: 'auto'`'s own resolution logic (`useAutoSliderOrientation`, measuring the parent to pick width-vs-height) is unchanged and untouched by this fix — it was never itself the circular part; it only ever fed a *stable* comparison (a block's externally-determined width vs. what used to be a runaway height).

Shipped with real TDD coverage: `SliderLinear.test.tsx`'s existing "always sets an inline height from the live-fitted box count... no longer the old CSS default" test was rewritten to assert the opposite (RED confirmed against the pre-fix component — it returned the 3-box-minimum-derived height, not the 256px-budget-derived one, proving the assertion actually exercises the fix rather than passing vacuously); a new end-to-end case renders an `orientation: 'auto'` schema, fires its own orientation-resolution observer to flip it to vertical, and asserts the box count still fits against the fixed default rather than trying to live-measure the same parent — the exact scenario that looped in the running app. Full suite (122 files / 2085 tests), lint, and type-check verified green.
