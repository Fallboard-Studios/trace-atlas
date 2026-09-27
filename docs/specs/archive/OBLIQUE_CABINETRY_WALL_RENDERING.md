# Phase Spec: Oblique Cabinetry — Compositor-Driven Wall Rendering

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: this conversation, 2026-09-09 — a rendering-performance defect diagnosed live against the running app (dragging a `SliderLinear` voxel-track box: the top wall visibly "fills in" *after* the front facade has already reached its position, most noticeable under a full row of simultaneously-animating boxes), root-caused from the code rather than a separate `/interview-me` pass, and confirmed with Crawford directly. Source of scope: not a new roadmap item — a rendering-mechanism fix to `CabinetBox`, the already-shipped shared primitive every Oblique Cabinetry consumer (`Button`, `Toggle`, `VoxelTrack` and therefore `SliderLinear`) depends on (roadmap [11.1.1](../todo/roadmap.md#1111-oblique-cabinetry-foundation--button)). Prior art this spec follows directly: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.2` (the original oblique-projection derivation this spec re-derives in compositor-friendly form) and `§1.9` (the `prevPoppedRef` transition-tracking this spec's own effect keeps unchanged) — both untouched by this spec, since the *when*/*why* of the animation isn't changing, only *what* GSAP tweens and *how* the walls are painted.

---

## 1. Overview & Claude Explanation

### 1.1 The defect, and why it's structural, not incidental

`CabinetBox`'s front face moves via a GSAP `x`/`y` tween — a `transform: translate()`, fully compositor-driven: once the browser starts the animation, it can run smoothly on its own thread regardless of what the main thread is doing. The walls, by contrast, are two `<polygon>` elements whose `points` attribute GSAP tweens directly (`computeCabinetGeometry`'s topFacePoints/leftFacePoints strings, interpolated frame by frame). SVG attribute animation is **not compositable** — every tick, the browser reparses the points string, recomputes the polygon's geometry, and repaints it on the main thread. With a `VoxelTrack` row of many boxes animating at once (each also driving a `filter: drop-shadow` off `--cabinet-glow`, itself paint-bound), the main thread congests; the compositor-driven front face keeps moving smoothly while the main-thread-bound walls fall behind and catch up in bursts. That's the observed symptom exactly: the top wall reads as filling in *after* the facade has already arrived.

This isn't a tuning problem (shorter duration, different ease) — it's a consequence of animating an SVG attribute at all. The fix is to stop doing that.

### 1.2 Both walls are a fixed-angle skew of a scaling rectangle — no per-frame geometry needed

`computeCabinetGeometry`'s own derivation (`OBLIQUE_CABINETRY_FOUNDATION.md §1.2`) already shows the wall polygons as a function of a single fixed vector `(2·popDistance, popDistance)` scaled by `t`. Worked through algebraically, each wall is exactly a plain rectangle, **skewed by a constant angle independent of `t`**, scaled along one axis by `t` itself:

**Top face** — rectangle `W × popDistance` (top-left origin). Apply `scaleY(t)` then `skewX(θ)` (CSS applies the rightmost function first):
```
(0,0)        → (0,0)
(W,0)        → (W,0)
(0,D)        --scaleY(t)--> (0,Dt)   --skewX(θ)--> (Dt·tanθ, Dt)
(W,D)        --scaleY(t)--> (W,Dt)   --skewX(θ)--> (W+Dt·tanθ, Dt)
```
Matching the target corner `(2Dt, Dt)` requires `Dt·tanθ = 2Dt`, i.e. `tanθ = 2` — **`θ = atan(2) ≈ 63.435°`, independent of `t` or `D`.**

**Left face** — rectangle `2·popDistance × H` (top-left origin). Apply `scaleX(t)` then `skewY(φ)`:
```
(2D,0) --scaleX(t)--> (2Dt,0) --skewY(φ)--> (2Dt, 2Dt·tanφ)
```
Matching the target corner `(2Dt, Dt)` requires `2Dt·tanφ = Dt`, i.e. `tanφ = 0.5` — **`φ = atan(0.5) ≈ 26.565°`, likewise fixed.** (`atan(2) + atan(0.5) = 90°` — the two walls' stationary edges are perpendicular, sharing one projection vector, not a coincidence.)

The practical consequence: **the wall's scale factor at pop progress `t` is exactly `t` itself** — `scaleY: t` for the top face, `scaleX: t` for the left face. No function call, no string generation, nothing computed per frame. The skew angle is set **once, on mount, and never animated** — only the two scale values tween, alongside the front face's existing `x`/`y` and the existing `--cabinet-glow`. All four are `transform`/custom-property writes GSAP already knows how to composite efficiently; none require SVG or attribute mutation.

### 1.3 `computeCabinetGeometry` shrinks to `computeCabinetFrontFaceOffset` — renamed, not just modified

The front face's own offset **never depended on box width/height** — only `t` and `popDistance` (`frontFaceOffsetX = 2·popDistance·t`, `frontFaceOffsetY = popDistance·t`). Only the now-retired polygon math needed `width`/`height`. Renaming (not just narrowing the signature of) `computeCabinetGeometry` → `computeCabinetFrontFaceOffset(t, popDistance)` makes the reduced scope obvious to anyone reading a call site or a diff, rather than leaving a geometry-sounding name that quietly stopped computing geometry. `cabinetGeometry.ts` keeps `CABINET_POP_DISTANCE`, `VOXEL_TRACK_POP_DISTANCE`, and `VOXEL_TRACK_POP_DISTANCE_MIN_RATIO` unchanged, and gains the two new fixed skew-angle constants.

```typescript
export const CABINET_TOP_FACE_SKEW_DEG = Math.atan(2) * (180 / Math.PI);   // ≈ 63.435
export const CABINET_LEFT_FACE_SKEW_DEG = Math.atan(0.5) * (180 / Math.PI); // ≈ 26.565

export interface CabinetFrontFaceOffset {
  frontFaceOffsetX: number;
  frontFaceOffsetY: number;
}

export function computeCabinetFrontFaceOffset(
  t: number,
  popDistance: number = CABINET_POP_DISTANCE,
): CabinetFrontFaceOffset {
  return { frontFaceOffsetX: 2 * popDistance * t, frontFaceOffsetY: popDistance * t };
}
```

### 1.4 The walls become two `<div>`s — GSAP must own their whole `transform`, not just part of it

`.sc-cabinet-box__top-face`/`.sc-cabinet-box__left-face` become plain `<div>`s (sized via inline `width`/`height` — top face `width` tracks the same `ResizeObserver`-measured front-face width already read today, `height` is the fixed `resolvedPopDistance`; left face is the mirror: fixed `2 × resolvedPopDistance` wide, `boxHeight` tall), inside a `.sc-cabinet-box__walls` **`<div>`** (was `<svg>`) that keeps its existing `position: absolute; inset: 0; pointer-events: none;` plus the existing glow `filter`/`opacity` (unchanged — applied once to the whole wall group exactly as it is today, since `filter` composites a stacking context's full rendered output as one operation regardless of how many children it has).

This is the one genuinely delicate part: **a GSAP-driven element's `transform` must be owned by GSAP alone.** GSAP tracks each transform component (`x`, `y`, `scaleX`, `scaleY`, `skewX`, `skewY`, `rotation`, …) independently per element and composites them into one `transform` string on every write — but if a CSS rule also declares `transform: skewX(...)`, GSAP's own inline write fully replaces it (inline style always wins, and `transform` isn't a property two separate declarations can merge), silently dropping the skew the instant GSAP sets anything else. So the skew must be set **via `gsap.set()`, once, on mount** — never as a CSS `transform:` rule on `.sc-cabinet-box__top-face`/`__left-face`:

```typescript
useEffect(() => {
  if (!topFaceRef.current || !leftFaceRef.current) return;
  gsap.set(topFaceRef.current, { skewX: CABINET_TOP_FACE_SKEW_DEG });
  gsap.set(leftFaceRef.current, { skewY: CABINET_LEFT_FACE_SKEW_DEG });
}, []);
```

After that, the existing geometry effect's three branches (dependency-only `gsap.set()` reposition, `skipMountAnimation`'s instant `gsap.set()`, and the animated `gsap.timeline().fromTo()` transition) each swap their two wall `points`-attribute calls for `scaleY`/`scaleX` calls using `poppedT`/`fromPopped` **directly** — no `computeCabinetFrontFaceOffset` call needed for the walls at all, only for the front face's `x`/`y`:

```typescript
// Animated transition branch (was: two .fromTo() calls animating `attr: { points }`):
tl.fromTo(topFaceRef.current, { scaleY: fromPopped }, { scaleY: poppedT, duration, ease: 'power2.out' }, 0)
  .fromTo(leftFaceRef.current, { scaleX: fromPopped }, { scaleX: poppedT, duration, ease: 'power2.out' }, 0)
  .fromTo(frontRef.current,
    { x: from.frontFaceOffsetX, y: from.frontFaceOffsetY },
    { x: to.frontFaceOffsetX, y: to.frontFaceOffsetY, duration, ease: 'power2.out' }, 0)
  .fromTo(wrapperRef.current, { '--cabinet-glow': fromPopped }, { '--cabinet-glow': poppedT, duration, ease: 'power2.out' }, 0);
```

The `!isTransition` (dependency-only) and `isFirstRun && skipMountAnimation` branches follow the same swap, using `gsap.set()` with `poppedT` directly for both wall scales.

### 1.5 A free bug-class elimination: the SVG intrinsic-size fix becomes moot

`CabinetBox.css`'s existing comment on `.sc-cabinet-box__walls` documents a real, previously-found bug: an `<svg>` with `inset: 0` but no `viewBox`/explicit size falls back to its browser-default 300×150 intrinsic size as a replaced element, silently inflating `.sc-slider-linear`'s scrollable-overflow region. A plain `<div>` has no "replaced element" intrinsic-size concept at all — this entire bug class, and the explicit-`width`/`height`-alongside-`inset:0` workaround it required, becomes structurally impossible once the walls are `<div>`s. That comment and the extra sizing rule are removed, not carried forward.

### 1.6 Nothing outside `CabinetBox.tsx`/`.css`/`cabinetGeometry.ts` changes

`CabinetBoxProps`'s public contract — `popped`, `timelineKey`, `boxHeight`, `popDistance`, `frontWidth`/`frontHeight`, `zIndex`, `skipMountAnimation`, `children` — is byte-for-byte unchanged; only the internal rendering mechanism moves. `Button.tsx`/`.css`, `Toggle.tsx`/`.css`, `VoxelTrack.tsx`/`.css`, and `SliderLinear.tsx`/`.css` need **no changes** — the same "internal rendering changed, contract didn't" pattern `docs/COMPONENT_LIBRARY.md` already records for `Button`'s and `Toggle`'s own Cabinetry rewrites. If implementation turns up a reason one of them *does* need to change, that's a signal to stop and reconfirm this assumption rather than push through.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── cabinetGeometry.ts        # MODIFIED — computeCabinetGeometry renamed to
│   │                              #   computeCabinetFrontFaceOffset(t, popDistance), drops
│   │                              #   width/height params and topFacePoints/leftFacePoints
│   │                              #   entirely; gains CABINET_TOP_FACE_SKEW_DEG,
│   │                              #   CABINET_LEFT_FACE_SKEW_DEG. CABINET_POP_DISTANCE,
│   │                              #   VOXEL_TRACK_POP_DISTANCE(_MIN_RATIO) unchanged.
│   └── cabinetGeometry.test.ts   # MODIFIED — polygon-point tests replaced with
│                                  #   computeCabinetFrontFaceOffset tests; new cases for
│                                  #   the two skew constants (§1.3, §5)
└── components/ui/controls/
    ├── CabinetBox.tsx             # MODIFIED — walls become two <div> refs (was
    │                              #   SVGPolygonElement), a new one-time skew-set effect,
    │                              #   and the geometry effect's wall branches swap
    │                              #   points-attribute tweening for scaleY/scaleX (§1.2, §1.4)
    ├── CabinetBox.css             # MODIFIED — .sc-cabinet-box__walls becomes a <div>
    │                              #   (drops the SVG-intrinsic-size fix, §1.5);
    │                              #   .sc-cabinet-box__top-face/__left-face's `fill` becomes
    │                              #   `background-color`, gain position/transform-origin rules
    └── CabinetBox.test.tsx        # MODIFIED — wall-related cases (polygon structure, `attr:
                                   #   { points }` tween assertions, computeCabinetGeometry
                                   #   mock/call-signature) rewritten for the div/scale
                                   #   mechanism; every other existing case (glow, timeline
                                   #   registration, skipMountAnimation, frontWidth/frontHeight,
                                   #   zIndex, popDistance) is expected to keep passing with at
                                   #   most a mock-signature update, not a behavior change (§5)

docs/
├── CONSOLE_THEMING.md            # MODIFIED — the Oblique Cabinetry section's projection-vector
│                                  #   paragraph currently describes SVG polygon-points tweening;
│                                  #   updated to describe the fixed-skew/scaled-div mechanism
└── specs/OBLIQUE_CABINETRY_FOUNDATION.md  # MODIFIED — a short post-implementation correction
                                   #   note pointing here, since §1.2/§4's original SVG-polygon
                                   #   code blocks are superseded for rendering purposes (the
                                   #   oblique-projection algebra they derive is NOT superseded
                                   #   — this spec re-expresses it, doesn't replace it)
```

**Explicitly not touched, and why:**

- `Button.tsx`/`.css`/`.test.tsx`, `Toggle.tsx`/`.css`/`.test.tsx`, `VoxelTrack.tsx`/`.css`/`.test.tsx`, `SliderLinear.tsx`/`.css`/`.test.tsx` — `CabinetBoxProps`'s contract is unchanged (§1.6). None of these files reference `computeCabinetGeometry`, `topFacePoints`/`leftFacePoints`, or any wall-internal detail directly.
- `cabinetAnimation.ts`, `useCabinetBoxHeight.ts`, `cabinetBreakpoints.ts` — untouched; duration/breakpoint resolution isn't part of this fix.
- `docs/specs/OBLIQUE_CABINETRY_TOGGLE.md`, `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md` — both describe `CabinetBox` at the *contract* level (props, behavior), not its internal wall-rendering mechanism; nothing in either needs correcting.
- `src/types/controls.ts`, any domain config, `src/engine/`, `src/stores/` — presentation-only, no schema/state/audio change.

No new dependency. No file is renamed except `cabinetGeometry.ts`'s own exported function (§1.3).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless implementation turns up a genuine need elsewhere — treat that as a signal to stop and reconfirm (§1.6), not to quietly expand scope.
* **`CabinetBoxProps`'s public contract must not change.** No prop added, removed, or renamed; no consumer file touched.
* **GSAP must own the entire `transform` on `.sc-cabinet-box__top-face`/`__left-face`.** Never author `transform:` (including `skewX`/`skewY`) as a CSS rule on either class — it will be silently clobbered the first time GSAP writes anything else to that element's transform (§1.4). The skew is set exactly once, via `gsap.set()`, in a mount-only effect (`[]` dependency array) — never inside the main geometry effect, and never re-set on every render.
* **No per-frame or per-transition geometry computation for the walls.** `poppedT`/`fromPopped` are used directly as `scaleY`/`scaleX` targets — do not reintroduce a function call (`computeCabinetFrontFaceOffset` or otherwise) to derive the wall scale; it's already exactly `t`.
* **`computeCabinetFrontFaceOffset` takes no `width`/`height` parameters.** Do not thread box dimensions through it "for consistency" with the old signature — they were never used by the front-face-offset math, only by the now-removed polygon math.
* **Preserve the existing `isTransition`/`isFirstRun`/`skipMountAnimation` control flow untouched.** Only *what* each branch animates/sets changes (points → scale); the *when* (dependency-only vs. first-mount vs. real transition) is `docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s own recently-fixed logic and out of scope here.
* **No timer-based animation; every timeline still registers in `timelineMap`** exactly as today — this spec changes GSAP's *target properties*, not its lifecycle management, consistent with CLAUDE.md's forbidden-pattern list and Strict Separation guardrail.
* **Visual output must match the existing oblique-projection geometry at every `t`, not just at the endpoints** — verify this empirically (§5), not only by trusting the algebra in §1.2, given this codebase's own history of CSS/SVG sign-convention surprises found only once actually rendered (`OBLIQUE_CABINETRY_FOUNDATION.md §1.2`'s own height-scaling correction, §1.9's resize-flicker bug).

---

## 4. Code Style & Architecture Conventions

**`src/utils/cabinetGeometry.ts`** (full file):

```typescript
/**
 * Pure oblique-projection math for a single cabinet box's front-face offset
 * — no DOM, no GSAP. Both wall parallelograms (Top Face, Left Face) are,
 * geometrically, a plain rectangle skewed by a FIXED angle (independent of
 * pop progress t) and scaled along one axis by t itself — CabinetBox.tsx
 * renders them as two CSS-transformed <div>s (skew set once via gsap.set()
 * on mount, never animated; only scaleY/scaleX, equal to t directly, tween)
 * instead of SVG <polygon>s tweening a `points` attribute string. This file
 * no longer computes wall geometry at all, only the front face's own
 * translate offset, which never depended on box width/height in the first
 * place. See docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md §1.2/§1.3 for
 * the full derivation, and docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md §1.2
 * for the original oblique-projection vector this re-expresses.
 */

export const CABINET_POP_DISTANCE = 2;
export const VOXEL_TRACK_POP_DISTANCE = 8;
export const VOXEL_TRACK_POP_DISTANCE_MIN_RATIO = 0.125;

/**
 * Fixed skew angles (degrees) for the top/left wall divs, derived directly
 * from the 2:1 oblique projection vector — independent of t or popDistance,
 * set exactly once per CabinetBox instance and never animated. Their sum is
 * 90°: the top face's stationary edge (horizontal) and the left face's
 * (vertical) are perpendicular, sharing one projection vector.
 */
export const CABINET_TOP_FACE_SKEW_DEG = Math.atan(2) * (180 / Math.PI);
export const CABINET_LEFT_FACE_SKEW_DEG = Math.atan(0.5) * (180 / Math.PI);

export interface CabinetFrontFaceOffset {
  frontFaceOffsetX: number;
  frontFaceOffsetY: number;
}

/**
 * The front face's translate offset at pop progress t. `popDistance`
 * defaults to CABINET_POP_DISTANCE (Button/Toggle's own value); VoxelTrack
 * passes VOXEL_TRACK_POP_DISTANCE or a computeVoxelBoxPopDistance result.
 */
export function computeCabinetFrontFaceOffset(
  t: number,
  popDistance: number = CABINET_POP_DISTANCE,
): CabinetFrontFaceOffset {
  return {
    frontFaceOffsetX: 2 * popDistance * t,
    frontFaceOffsetY: popDistance * t,
  };
}
```

**`src/components/ui/controls/CabinetBox.tsx`** (relevant excerpts — everything not shown, e.g. the width-measurement `ResizeObserver` effect, the timeline-cleanup effect, and `CabinetBoxProps` itself, is unchanged):

```tsx
import { computeCabinetFrontFaceOffset, CABINET_POP_DISTANCE, CABINET_TOP_FACE_SKEW_DEG, CABINET_LEFT_FACE_SKEW_DEG } from '@/utils/cabinetGeometry';

// topFaceRef/leftFaceRef are now HTMLDivElement refs, not SVGPolygonElement.
const topFaceRef = useRef<HTMLDivElement>(null);
const leftFaceRef = useRef<HTMLDivElement>(null);

// One-time: the skew is a fixed property of the projection, never animated —
// set it once via GSAP (which must own the whole `transform`, §1.4) and
// never touch it again.
useEffect(() => {
  if (!topFaceRef.current || !leftFaceRef.current) return;
  gsap.set(topFaceRef.current, { skewX: CABINET_TOP_FACE_SKEW_DEG });
  gsap.set(leftFaceRef.current, { skewY: CABINET_LEFT_FACE_SKEW_DEG });
}, []);

// ...inside the existing geometry effect, each branch swaps its two wall
// `attr: { points }` calls for scaleY/scaleX, using poppedT/fromPopped
// DIRECTLY — no function call needed, the wall scale IS t:

// (dependency-only reposition branch)
gsap.set(topFaceRef.current, { scaleY: poppedT });
gsap.set(leftFaceRef.current, { scaleX: poppedT });
gsap.set(frontRef.current, { x: target.frontFaceOffsetX, y: target.frontFaceOffsetY });
gsap.set(wrapperRef.current, { '--cabinet-glow': poppedT });

// (skipMountAnimation first-run branch — same shape as above)

// (animated transition branch)
const from = computeCabinetFrontFaceOffset(fromPopped, resolvedPopDistance);
const to = target; // = computeCabinetFrontFaceOffset(poppedT, resolvedPopDistance)

const tl = gsap.timeline();
tl.fromTo(topFaceRef.current, { scaleY: fromPopped }, { scaleY: poppedT, duration, ease: 'power2.out' }, 0)
  .fromTo(leftFaceRef.current, { scaleX: fromPopped }, { scaleX: poppedT, duration, ease: 'power2.out' }, 0)
  .fromTo(frontRef.current,
    { x: from.frontFaceOffsetX, y: from.frontFaceOffsetY },
    { x: to.frontFaceOffsetX, y: to.frontFaceOffsetY, duration, ease: 'power2.out' }, 0)
  .fromTo(wrapperRef.current, { '--cabinet-glow': fromPopped }, { '--cabinet-glow': poppedT, duration, ease: 'power2.out' }, 0);
setTimeline(timelineKey, tl);

// JSX — walls become two sized <div>s inside a <div> (was <svg>):
return (
  <div ref={wrapperRef} className="sc-cabinet-box" style={cabinetTokens}>
    <div className="sc-cabinet-box__backing" aria-hidden="true" />
    <div className="sc-cabinet-box__walls" aria-hidden="true">
      <div
        ref={topFaceRef}
        className="sc-cabinet-box__top-face"
        style={{ width: `${width}px`, height: `${resolvedPopDistance}px` }}
      />
      <div
        ref={leftFaceRef}
        className="sc-cabinet-box__left-face"
        style={{ width: `${2 * resolvedPopDistance}px`, height: `${boxHeight}px` }}
      />
    </div>
    <div ref={frontRef} className="sc-cabinet-box__front" style={frontStyle}>
      {children}
    </div>
  </div>
);
```

**`src/components/ui/controls/CabinetBox.css`** (relevant excerpts):

```css
.sc-cabinet-box__walls {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Same glow filter/opacity as today, unchanged — applies once to the
     whole wall group's composited output regardless of how many children
     it has, so switching from <svg>+2 <polygon>s to <div>+2 <div>s costs
     nothing extra here. */
  filter: drop-shadow(0 0 calc(var(--cabinet-glow, 0) * 20px) var(--color-accent));
  opacity: calc(1 - var(--cabinet-glow, 0) * 0.5);
}

.sc-cabinet-box__top-face,
.sc-cabinet-box__left-face {
  position: absolute;
  top: 0;
  left: 0;
  /* Must match the (0,0) origin the offset math in cabinetGeometry.ts
     assumes — GSAP's skewX/skewY/scaleY/scaleX all apply relative to this. */
  transform-origin: top left;
  /* NEVER add `transform:` here — GSAP owns it entirely (skew set once on
     mount, scale tweened per-transition). See CabinetBox.tsx's own comment
     and docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md §1.4/§3. */
}

.sc-cabinet-box__top-face {
  background-color: color-mix(in srgb, var(--color-accent) 100%, white 20%);
}

.sc-cabinet-box__left-face {
  background-color: color-mix(in srgb, var(--color-accent) 100%, black 25%);
}
```

* **Naming Conventions:** `computeCabinetFrontFaceOffset` (camelCase function, matching `computeCabinetGeometry`'s own prior naming), `CABINET_TOP_FACE_SKEW_DEG`/`CABINET_LEFT_FACE_SKEW_DEG` (SCREAMING_SNAKE_CASE constants, matching `CABINET_POP_DISTANCE`'s own precedent). Class names (`sc-cabinet-box__top-face`, `sc-cabinet-box__left-face`, `sc-cabinet-box__walls`) are unchanged — only the element type behind them changes.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **`cabinetGeometry.test.ts` (modified):**
  1. Every existing polygon-point test (`t=0` collapse, `t=1` full offset, intermediate-`t` linearity, purity) is **replaced**, not kept alongside — `topFacePoints`/`leftFacePoints` no longer exist. Equivalent cases against `computeCabinetFrontFaceOffset`: `t=0` → `{0,0}`; `t=1` → `{2·popDistance, popDistance}`; intermediate `t` (e.g. `0.5`) matches the formula directly; pure function (same inputs → identical output).
  2. New cases for `CABINET_TOP_FACE_SKEW_DEG`/`CABINET_LEFT_FACE_SKEW_DEG`: each matches `Math.atan(2)`/`Math.atan(0.5)` converted to degrees directly (derive the expected value from the same formula, not a hardcoded literal, so a future retune of the *projection ratio* — unlikely, but `CABINET_POP_DISTANCE` itself has been retuned three times — wouldn't silently desync a hardcoded test constant); their sum is `90` (within floating-point tolerance).
* **`CabinetBox.test.tsx` (modified):**
  1. **Wall-structure tests rewritten:** "renders exactly one top-face and one left-face polygon inside an aria-hidden svg" → renders exactly one `.sc-cabinet-box__top-face` and one `.sc-cabinet-box__left-face` `<div>` inside an `aria-hidden` `.sc-cabinet-box__walls` `<div>` (no more `focusable` assertion — that was SVG-specific).
  2. **Tween-target tests rewritten:** every existing assertion against `fromToMock` calls with `attr: { points: ... }` becomes an assertion against `scaleY`/`scaleX` calls with the raw `poppedT`/`fromPopped` number — e.g. "tweens the top face's scaleY from the numeric opposite to poppedT on first mount" (mirrors the existing `--cabinet-glow` tween tests' own shape, §5's existing `it('on the very first render at a fractional popped value, animates in from the numeric opposite (1 - poppedT)', ...)`).
  3. **The skew-set effect gets its own new tests:** `skewX`/`skewY` are set via `gsap.set()` exactly once per mount, with the exact `CABINET_TOP_FACE_SKEW_DEG`/`CABINET_LEFT_FACE_SKEW_DEG` values; a `popped` change afterward does **not** re-call `gsap.set()` with a `skewX`/`skewY` key (guards against a future edit accidentally re-authoring the skew inside the main geometry effect, which would still work today by coincidence but signals a boundary violation per §3).
  4. **`computeCabinetGeometry` mock/import updated to `computeCabinetFrontFaceOffset`** throughout the file (`vi.mock('@/utils/cabinetGeometry', ...)`) — every existing assertion that checked its call arguments as `(width, height, t, popDistance)` becomes `(t, popDistance)`; the width/height values those tests fed in move to asserting the top/left-face `<div>`'s own inline `style.width`/`style.height` instead (a **new**, more direct assertion than existed before, since width/height are no longer routed through a mocked function call at all).
  5. **Every other existing describe block** (`--cabinet-glow` tweening, timeline registration/cleanup, `prefers-reduced-motion`, the dependency-only-reposition fix, `skipMountAnimation`, `frontWidth`/`frontHeight`, `zIndex`, `popDistance`, fractional `popped`) is expected to need at most a mock-signature update (item 4) — none of their actual *assertions* describe behavior this spec changes, and none should need rewriting beyond that.
* **Empirical geometry verification (new, not optional) — per §3's own risk flag:** render a `CabinetBox` fully popped (`popped={1}`) in a real browser (or via a `getComputedStyle`/matrix-decomposition assertion in a test, if that proves reliable in jsdom), and confirm the top face's bottom-right corner and the left face's bottom-right corner both land at the same `(2·popDistance, popDistance)` point the front face itself translates to — i.e., the three pieces' corners still meet exactly, matching the pre-rewrite polygon output pixel-for-pixel. This is the one place this spec's algebra (§1.2) could be right on paper and wrong on screen (a skew-direction sign flip is a classic CSS footgun) — verify it before calling this done, the same way `OBLIQUE_CABINETRY_FOUNDATION.md §1.2`'s own height-scaling mistake was only caught by actually looking at the rendered box.
* **Success criteria (ties back to the original complaint):** dragging a multi-box `SliderLinear` no longer shows the top wall visibly filling in after the front facade — front face and both walls should read as moving together, indistinguishably, even under a full row of simultaneously-animating boxes. Confirm manually against the real running app (a slider with 15+ boxes, e.g. a desktop-width EQ gain slider), not only via unit tests — this defect was found live and unit tests alone (even the new ones above) can't prove a *perceptual* sync issue is gone, only that the underlying mechanism changed correctly.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — full suite passes, including the rewritten/new cases above.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual check per the success-criteria bullet above, at more than one breakpoint (mobile/tablet/desktop box sizes) and both `SliderLinear` orientations.

---

## 6. Documentation & Git/Workflow Context

* **`docs/CONSOLE_THEMING.md` update:** the Oblique Cabinetry section's projection-vector paragraph (which currently describes `computeCabinetGeometry`'s polygon-string output tweened by GSAP) is updated to describe the fixed-skew/scaled-`<div>` mechanism instead — the underlying oblique-projection vector itself (`(2·popDistance, popDistance)` at `t=1`) is unchanged and shouldn't be re-derived, only how it's rendered.
* **`docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md` update:** a short post-implementation correction note (matching that doc's own established pattern) pointing to this spec — §1.2's oblique-projection derivation and §1.8's glow mechanism are both still accurate; only §4's SVG/`<polygon>`-based code block is superseded for rendering purposes.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** a dedicated branch off the current `feature/cabinetry-slider-linear` work (or its own `feature/cabinetry-wall-rendering`, human's call) — this is a rendering-mechanism fix to an already-shipped shared primitive, not new roadmap scope, so it doesn't need its own `docs/tasks/` plan unless the human wants one broken out separately.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping: (1) `cabinetGeometry.ts`/`.test.ts` (the pure math rename + new constants); (2) `CabinetBox.tsx`/`.css`/`.test.tsx` (the rendering swap); (3) docs.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against this codebase's own precedents, not left open):

- ~~Keep `computeCabinetGeometry`'s name with a narrowed signature, or rename?~~ **Resolved: rename to `computeCabinetFrontFaceOffset`** (§1.3) — the scope shrank enough (no more width/height, no more polygon output) that keeping the old name would misdescribe what the function does.
- ~~Does the skew need to be re-set on every geometry-effect run, or once?~~ **Resolved: once, on mount, via its own effect** (§1.4) — it's a fixed property of the projection, never a function of `t`.
- ~~Do any consumer files (`Button`, `Toggle`, `VoxelTrack`, `SliderLinear`) need to change?~~ **Resolved: no** (§1.6) — `CabinetBoxProps`'s contract is unchanged; treat any discovered need to touch one as a signal to stop and reconfirm, not proceed.

Still open — flag for Tasks, not blocking this spec:

1. **Skew sign convention is algebraically derived here, not yet empirically confirmed against a real browser** (§1.2, §5) — the single highest-risk item in this spec. If `skewX(63.435deg)`/`skewY(26.565deg)` turn out to shear the wrong direction (a real possibility — CSS skew sign conventions are a known footgun), the fix is trivial (negate the angle or swap which corner is "stationary"), but it must be checked against the rendered result before this is considered done, not assumed correct from the algebra alone.
2. **Whether to keep a `cabinetGeometry.test.ts` case asserting the *removed* `topFacePoints`/`leftFacePoints` shape somewhere (e.g. commented, or in a changelog) for future readers wondering where the polygon math went** — left as a Tasks-time judgment call; this spec's own §1.1–§1.3 narrative and the git history should already be sufficient, so no dedicated compatibility shim is required.
3. **11.2's performance pass** should treat this as its baseline "before" data point where useful (the original motivation was a real, felt jank during drag) — no specific metric is defined here since no profiling was done before writing this spec, only a qualitative diagnosis (§1.1).
