# Phase Spec: Oblique Cabinetry — SliderLog (Roadmap Phase 11.1.4)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/oblique-cabinetry-slider-log.md](../intent/oblique-cabinetry-slider-log.md) (confirmed via `/interview-me`, 2026-09-09). Source of scope: [docs/todo/roadmap.md § 11.1.4](../todo/roadmap.md#1114-oblique-cabinetry-sliderlog) — the second of the voxel-track items (11.1.3–11.1.5), and the first genuine test of whether 11.1.3's shared infrastructure (`VoxelTrack.tsx`, `voxelTrackMath.ts`) generalizes to a second consumer without copy-pasting the container-fitting glue a second time. Prior art this spec reuses directly, unmodified: `VoxelTrack.tsx`, `voxelTrackMath.ts` (`computeFittedBoxCount`, `computeVoxelTrackLength`, `computeVoxelBoxStates`, `computeVoxelBoxPopDistance`, `computeVoxelBoxZIndex`, `computeVoxelTrackTrailingReserve`, `computeVoxelFillBackground`, `computeVoxelStraddleSizeFraction`, `VOXEL_TRACK_MIN_BOX_COUNT`, `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`), `useCabinetBoxHeight`/`useVoxelTrackGap`, `useVoxelTrackBoxCount`, `CabinetBox.tsx`, `sliderLogMath.ts` (`sliderLogValueToT`/`sliderLogTToValue`, unchanged). This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; `SliderLogSchema`/`ControlSchema` are unchanged.

**A note on grounding:** 11.1.3's own spec (`docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md`) went through several post-implementation corrections (§1.8's revision/addenda, §1.13, §1.14) as the real shipped code diverged from its original draft. Every code reference and current-behavior claim in this spec is checked directly against the actual files on `main` as of this writing (`src/utils/voxelTrackMath.ts`, `src/components/ui/controls/{VoxelTrack,CabinetBox,SliderLinear,SliderLog,useCabinetBoxHeight,useVoxelTrackBoxCount}.{ts,tsx}`, `src/utils/cabinetGeometry.ts`), not against that spec's own narrative — where the two differ (they mostly don't, by this point), the live source wins.

---

## 1. Overview & Claude Explanation

The intent doc resolves the two questions that actually mattered: box placement uses `SliderLog`'s own normalized `t`, and the container-fitting glue gets extracted into one shared hook used by **both** `SliderLinear` and `SliderLog`, retrofitting the former in this same pass. Everything else is direct reuse — no new visual mechanism, no change to `VoxelTrack`/`voxelTrackMath.ts`. Four implementation-shape questions remain, resolved below.

### 1.1 The shared hook: `useVoxelTrackSlider` — name, shape, and file location

`SliderLinear.tsx`'s current (11.1.3-shipped) body has five lines of real logic between resolving orientation and rendering that have nothing to do with `SliderLinear` specifically — they're generic "given a resolved axis and an optional vertical budget, produce a fitted box count, a track length, and a `Slider.Root` style object":

```typescript
const boxSize = useCabinetBoxHeight();
const gap = useVoxelTrackGap();
const explicitLength = isVertical ? (verticalHeight ?? VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT) : undefined;
const trailingReserve = computeVoxelTrackTrailingReserve(orientation);
const boxCount = useVoxelTrackBoxCount(wrapperRef, orientation, boxSize, gap, explicitLength, trailingReserve);
const trackLength = computeVoxelTrackLength(boxCount, boxSize, gap) + trailingReserve;
// ...
const rootStyle: CSSProperties = isVertical
  ? { height: trackLength, width: boxSize }
  : { width: trackLength, height: boxSize };
```

This becomes a new hook, `useVoxelTrackSlider`, in `src/components/ui/controls/useVoxelTrackSlider.ts` — same directory and naming register as `useCabinetBoxHeight.ts`/`useVoxelTrackBoxCount.ts`/`useAutoSliderOrientation.ts` (flat `useX.ts` hook modules, not nested under a feature folder). It takes the slider's own wrapper ref, its already-resolved orientation (never `'auto'` — same precondition `useVoxelTrackBoxCount` already documents), and the optional `verticalHeight` budget; it returns everything a consumer needs to render `Slider.Root` and `VoxelTrack`:

```typescript
export interface VoxelTrackSliderLayout {
  boxSize: number;
  gap: number;
  boxCount: number;
  trackLength: number;
  rootStyle: CSSProperties;
}

export function useVoxelTrackSlider(
  wrapperRef: RefObject<HTMLElement | null>,
  orientation: 'horizontal' | 'vertical',
  verticalHeight?: number,
): VoxelTrackSliderLayout
```

Both `SliderLinear.tsx` and `SliderLog.tsx` call `useAutoSliderOrientation` themselves first (unchanged — orientation resolution stays each component's own concern, per 11.1.3's own §1.6 "resolves axis first, fits boxes second" split) and pass the resolved value in. The hook does not itself decide orientation, does not compute `VoxelBoxState[]` (that still depends on each consumer's own value-mapping — raw `value`/`min`/`max` for `SliderLinear`, `t`/`0`/`1` for `SliderLog`), and does not render anything. Full code: §4.

### 1.2 `SliderLinear.tsx` retrofit — a behavior-preserving refactor, not a rewrite

`SliderLinear.tsx` swaps its five inline lines above for one `useVoxelTrackSlider(wrapperRef, orientation, verticalHeight)` call, destructuring `{ boxSize, gap, boxCount, trackLength, rootStyle }`. Everything downstream — `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)`, the `VoxelTrack` render, `Slider.Root`'s `style={rootStyle}` — is otherwise unchanged. This is required to be **byte-identical in observable output** to the current file: every one of `SliderLinear.test.tsx`'s existing 23 cases (§5) must pass **unmodified** — no rewriting, no new assertions needed to prove correctness, since nothing about what the component *does* changes, only where the logic that decides it lives. This is a materially lower-risk retrofit than 11.1.3's own `CabinetBox` widening (§1.1 there) or `SliderLinear` rewrite (Task 6 there): both of those introduced real new behavior; this one introduces none.

### 1.3 `SliderLog.tsx` — the first real behavior change, and where `t` comes from

`SliderLog.tsx` currently computes `t = sliderLogValueToT(value, schema.min, schema.max)` once, feeding it to Radix's own `Slider.Root value={[t]} min={0} max={1} step={0.001}`. That `t` is exactly what `VoxelTrack`'s box placement needs too — `computeVoxelBoxStates(t, 0, 1, boxCount)`, not `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)`. Feeding the raw value against the schema's real `min`/`max` would place the straddling box using *linear* spacing between two log-scaled endpoints — wrong the instant the curve compresses values (e.g. for Attack/Decay/Release's `0–10s` range, a `value` of `1s` and `9s` sit at very different fractions of the *log* curve than they would of a linear one, but `voxelTrackMath.ts` has no way to know that; it only ever assumes uniform linear spacing between whatever `min`/`max` it's given). Feeding it `(t, 0, 1, boxCount)` places boxes exactly where Radix's own thumb already travels, since both consume the identical `t`.

The rest of the file follows `SliderLinear.tsx`'s own 11.1.3 shape directly: `useVoxelTrackSlider` resolves `{ boxSize, gap, boxCount, trackLength, rootStyle }`; `Slider.Track` gets `VoxelTrack` as an absolutely-positioned sibling of `Slider.Range`; `Slider.Range` goes `visibility: hidden`; `Slider.Thumb`'s fill goes transparent, its `:focus-visible` outline untouched; horizontal/vertical overflow rules are added to `.sc-slider-log`'s existing `data-orientation` selectors. `sliderLogMath.ts` itself — the actual curve, the epsilon floor — is untouched; this item only changes what consumes its output.

### 1.4 `verticalHeight`'s meaning changes for `SliderLog` too — the same named behavior change 11.1.3 already made for `SliderLinear`

Today, `SliderLog`'s `verticalHeight` prop is applied to `Slider.Root` byte-for-byte (`style={isVertical && verticalHeight !== undefined ? { height: verticalHeight } : undefined}`), and omitting it falls back to `--slider-vertical-height`'s CSS default (256px). Once `SliderLog` renders through `useVoxelTrackSlider`, this becomes the identical fitting-budget behavior 11.1.3 §1.7/§1.14 already established for `SliderLinear`: `verticalHeight` (or the `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` constant when omitted) is the budget the box count fits *within*, and the actually-rendered height is `computeVoxelTrackLength`'s box-quantized output — not necessarily the literal number supplied. This is a real, user-visible behavior change from today's `SliderLog`, exactly mirroring the change already made and already reviewed once for `SliderLinear` — not a new open question, a known-quantity repeat. `SliderLog.test.tsx`'s existing 3 `verticalHeight` cases (lines 157–177) must be rewritten the same way `SliderLinear.test.tsx`'s equivalent 3 already were in 11.1.3's own Task 6 (§5 below has the exact rewrite).

### 1.5 Post-implementation correction, found in the manual running-app check — `Slider.Track`/`Slider.Root`'s own CSS never got the treatment `SliderLinear.css` already has

Task 3's implementation replaced `Slider.Range`/`Slider.Thumb`'s CSS and added the horizontal/vertical overflow rules per §1.3/§4, but left `.sc-slider-log__track`/`.sc-slider-log__root` on their pre-Cabinetry values (`Track` at a literal `height: 3px` plus a `background-color`; `Root` at a literal `height: 20px`/`width: 100%` with no fallback framing) — `SliderLinear.css` had already been corrected to `height: 100%` on `Track` (matching `Root`'s own cross-axis size) and to treat `Root`'s literal dimensions as a same-paint fallback only, once `Slider.Root`'s real size started coming from an inline `rootStyle`. This spec's own §1.3/§4 description of `SliderLog.css` didn't call this out explicitly as one of the rules to change, and the implementation missed it as a result — an oversight in this spec's own drafting, not a late-breaking design change.

Reported directly by Crawford: clicking near the value label intercepted clicks meant for the slider. With `Track` pinned to a literal 3px height (vertically centered inside `Root` via `align-items: center`), `VoxelTrack`'s `position: absolute; inset: 0` sized itself to that same 3px box; its own `CabinetBox` row, rendered at its real 32–48px height, then painted `overflow: visible` well outside that 3px container, unclipped, into the flex gap toward the sibling value-label span. `pointer-events: none` on `.sc-voxel-track` (inherited by its descendants) meant the overflowing boxes themselves never captured a click — but the value label, a normal, later-painting DOM sibling with default `pointer-events: auto`, sat visually on top of that overflow region and intercepted the click before it could reach `Slider.Root`'s real (still only 3px-tall) hit area underneath.

Fixed by applying the exact same `height: 100%` (horizontal) / `width: 100%` (vertical) treatment `SliderLinear.css` already uses for `.sc-slider-linear__track`, removing the stale `background-color`, and adding the identical same-paint-fallback comments to `.sc-slider-log__root` that `SliderLinear.css` already carries. The two files' functional CSS (selectors and property values, comments aside) is now identical modulo the class-name prefix. `SliderLog.test.tsx`'s existing 27 cases all pass unmodified — jsdom applies no real layout, so this class of bug is invisible to the automated suite by construction, which is exactly why the manual running-app check mattered here rather than being a formality.

---

## 2. Target File Structure

```text
src/
├── utils/
│   └── voxelTrackMath.ts, cabinetGeometry.ts   # UNCHANGED — no new export, no modified function.
│                                                 #   Confirmed against the intent doc's own Constraint.
└── components/ui/controls/
    ├── useVoxelTrackSlider.ts        # NEW — the shared box-count/track-length/rootStyle hook (§1.1)
    ├── useVoxelTrackSlider.test.ts   # NEW
    ├── SliderLinear.tsx              # MODIFIED — retrofit to call useVoxelTrackSlider (§1.2); zero
    │                                 #   change to computeVoxelBoxStates call, VoxelTrack render, or
    │                                 #   any prop/behavior a test can observe
    ├── SliderLinear.test.tsx         # UNCHANGED — all 23 existing cases must pass unmodified (§5)
    ├── SliderLog.tsx                 # MODIFIED — full rewrite, mirroring SliderLinear.tsx's own
    │                                 #   11.1.3 shape; box placement via t, not raw value (§1.3)
    ├── SliderLog.css                 # MODIFIED — Range hidden, Thumb fill transparent, scroll rules
    │                                 #   added to existing data-orientation selectors (mirrors
    │                                 #   SliderLinear.css's own 11.1.3 changes exactly)
    ├── SliderLog.test.tsx            # MODIFIED — see §5 for exactly which of the 25 existing cases
    │                                 #   are preserved vs. must be rewritten (3 change; 17 untouched)
    ├── CabinetBox.tsx, VoxelTrack.tsx/.css, useCabinetBoxHeight.ts, useVoxelTrackBoxCount.ts
    │                                 # UNCHANGED — reused exactly as 11.1.3 shipped them
    └── (no other file in this directory changes)

docs/
├── COMPONENT_LIBRARY.md   # MODIFIED — "internal rendering changed, contract didn't" note for
│                           #   SliderLog (mirroring SliderLinear's own 11.1.3 note); a one-line
│                           #   addition to SliderLinear's existing note flagging the hook extraction
├── CONSOLE_THEMING.md      # MODIFIED — one-line update: the "Voxel-track sliders" section's closing
│                           #   line currently reads "Shared unchanged by SliderLog/SliderCenteredZero
│                           #   (11.1.4/11.1.5) once they ship" — updated to reflect SliderLog having
│                           #   shipped, SliderCenteredZero still pending
└── todo/roadmap.md      # MODIFIED (at Task-list time, not this spec) — gains the "Done" marker
                             #   for 11.1.4 once implementation lands, mirroring 11.1.2/11.1.3's own
                             #   pattern
```

**Explicitly not touched, and why:**

- `voxelTrackMath.ts`, `cabinetGeometry.ts`, `CabinetBox.tsx`, `VoxelTrack.tsx`/`.css`, `useCabinetBoxHeight.ts`, `useVoxelTrackBoxCount.ts` — all already correct, shared infrastructure; this item is entirely additive (one new hook) plus two consumer-side rewires. Confirmed against the intent doc's own Constraint.
- `sliderLogMath.ts` — the curve itself (`sliderLogValueToT`/`sliderLogTToValue`, the epsilon floor) is unchanged; this item only changes what consumes its output (§1.3).
- `src/types/controls.ts` — `SliderLogSchema`/`ControlSchema` unchanged; no new field, no schema-authored box count (same rule 11.1.3 established).
- Any domain config (`robotOptionsConfig.ts`'s Attack/Decay/Release entries, or anywhere else `SliderLog` is consumed) or drawer component — `SliderLog`'s props contract (`{ schema; value; onChange; disabled?; verticalHeight? }`) is unchanged, so no call site needs to change.
- `SliderCenteredZero.tsx`/`.css` — 11.1.5's own job. It reuses `VoxelTrack`/`voxelTrackMath.ts` and, per the intent doc's Forward Note, should evaluate reusing `useVoxelTrackSlider` too, but that item's own spec pass makes that call — not assumed here.
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change.
- `src/index.css` — no new global custom property; `SliderLog.css`'s existing `--slider-vertical-height` reference is superseded the same way `SliderLinear.css`'s was in 11.1.3 (the global custom property itself stays defined, for `SliderCenteredZero` which still reads it until 11.1.5 ships).

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`SliderLinear.tsx`'s retrofit must not change its observable behavior in any way.** All 23 existing `SliderLinear.test.tsx` cases must pass **unmodified** — not rewritten, not extended. If a case cannot pass unmodified, that is a signal the retrofit introduced a real behavior change and needs to be fixed, not a signal the test needs updating.
* **`useVoxelTrackSlider` does not decide orientation.** It takes an already-resolved `'horizontal' | 'vertical'` — never `'auto'` — matching `useVoxelTrackBoxCount`'s own existing precondition. Do not fold `useAutoSliderOrientation`'s own resolution into this hook.
* **`useVoxelTrackSlider` does not compute `VoxelBoxState[]`.** Box-state computation depends on each consumer's own value-mapping (`value`/`min`/`max` vs. `t`/`0`/`1`) and stays in each component itself, calling `computeVoxelBoxStates` directly — the hook only produces sizing/layout values common to both.
* **`SliderLog`'s box placement uses `t`, not raw value** (§1.3) — `computeVoxelBoxStates(t, 0, 1, boxCount)`, where `t` is the exact same value already passed to Radix's own `Slider.Root value={[t]}`. Do not derive a second, independently-computed `t` for box placement — one `t`, two consumers.
* **No change to `voxelTrackMath.ts`, `cabinetGeometry.ts`, `VoxelTrack.tsx`/`.css`, `CabinetBox.tsx`, `useCabinetBoxHeight.ts`, or `useVoxelTrackBoxCount.ts`.** Every one of these is already correct and shared; if an apparent gap surfaces during implementation, treat it as a signal to re-read this spec and the intent doc first, not license to modify shared infrastructure as a side effect of this item.
* **No change to `sliderLogMath.ts`'s curve/epsilon-floor math.** This item consumes its existing output; it does not adjust it.
* **`verticalHeight` becomes a fitting budget for `SliderLog` too** (§1.4) — a deliberate, named behavior change mirroring 11.1.3's own for `SliderLinear`. Do not attempt to force `Slider.Root`'s rendered height to exactly equal `verticalHeight`.
* **No new `ControlSchema` variant, no schema field addition.** `SliderLog`'s `{ schema, value, onChange, disabled?, verticalHeight? }` props contract is byte-for-byte unchanged.
* **GSAP never calls `AudioEngine`.** Unaffected by this item (no new timeline mechanism — every voxel box's `CabinetBox` timeline behavior is inherited unchanged), restated per CLAUDE.md's Strict Separation guardrail for completeness.
* **Out of scope, per the intent doc:** `SliderCenteredZero`'s own wiring (11.1.5) and whether it reuses `useVoxelTrackSlider`; any change to `CabinetBox.tsx`/`VoxelTrack.tsx`/`voxelTrackMath.ts`; the two lingering 11.1.3 checkpoint items (the manual browser check, Crawford's explicit `verticalHeight` sign-off — unrelated prior-item housekeeping); `Stepper`/`StepperWithToggle` (dropped from Cabinetry entirely, per 11.1.1); WorldView/terrain/sky styling; robot visuals (locked to audio attributes per CLAUDE.md); the power rocker switch/`SleeveContainer`; and 11.2's accessibility/performance verification pass.

---

## 4. Code Style & Architecture Conventions

**`src/components/ui/controls/useVoxelTrackSlider.ts`** (new, full file):

```typescript
import { useMemo, type CSSProperties, type RefObject } from 'react';
import { useCabinetBoxHeight, useVoxelTrackGap } from './useCabinetBoxHeight';
import { useVoxelTrackBoxCount } from './useVoxelTrackBoxCount';
import {
  computeVoxelTrackLength,
  computeVoxelTrackTrailingReserve,
  VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT,
} from '@/utils/voxelTrackMath';

export interface VoxelTrackSliderLayout {
  boxSize: number;
  gap: number;
  boxCount: number;
  trackLength: number;
  /** Ready to spread directly onto Slider.Root's own `style` prop. */
  rootStyle: CSSProperties;
}

/**
 * Shared voxel-track slider layout (roadmap Phase 11.1.4) — the box-count/
 * track-length/Slider.Root-sizing glue SliderLinear.tsx first wrote inline
 * (roadmap 11.1.3), extracted so SliderLog.tsx (this item's own new
 * consumer) doesn't need a second copy, and SliderLinear.tsx itself
 * retrofitted to call this instead of repeating the logic. See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.1.
 *
 * `orientation` must already be resolved ('horizontal' | 'vertical', never
 * 'auto') — each consumer calls useAutoSliderOrientation itself first, same
 * precondition useVoxelTrackBoxCount already documents. `verticalHeight`,
 * on a vertical slider, is a fitting BUDGET the box count fits within, not
 * a literal applied length — omitted, it falls back to the fixed
 * VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT rather than a live parent measurement
 * (see that constant's own comment for why: a live measurement is
 * genuinely circular for any container whose height auto-sizes to its
 * content).
 */
export function useVoxelTrackSlider(
  wrapperRef: RefObject<HTMLElement | null>,
  orientation: 'horizontal' | 'vertical',
  verticalHeight?: number,
): VoxelTrackSliderLayout {
  const boxSize = useCabinetBoxHeight();
  const gap = useVoxelTrackGap();
  const isVertical = orientation === 'vertical';
  const explicitLength = isVertical ? (verticalHeight ?? VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT) : undefined;
  const trailingReserve = computeVoxelTrackTrailingReserve(orientation);
  const boxCount = useVoxelTrackBoxCount(wrapperRef, orientation, boxSize, gap, explicitLength, trailingReserve);
  const trackLength = computeVoxelTrackLength(boxCount, boxSize, gap) + trailingReserve;

  const rootStyle = useMemo<CSSProperties>(
    () => (isVertical ? { height: trackLength, width: boxSize } : { width: trackLength, height: boxSize }),
    [isVertical, trackLength, boxSize],
  );

  return { boxSize, gap, boxCount, trackLength, rootStyle };
}
```

`useMemo` on `rootStyle` is new relative to `SliderLinear.tsx`'s current inline (non-memoized) object literal — a deliberate, minor addition: `SliderLinear.tsx` computed `rootStyle` fresh every render today with no consumer depending on referential stability, so this isn't fixing an observed bug, but a shared hook returning an object on every call (rather than a component computing it inline for its own immediate JSX use) is exactly the shape where an unnecessary new reference on every render becomes a habit worth not forming as a second consumer is added. No test should assert on `rootStyle`'s object identity either way — only its contents (`§5`).

**`src/components/ui/controls/SliderLinear.tsx`** (modified — only the block between resolving `orientation` and computing `states` changes; imports, props, and everything else are otherwise identical to the current file):

```tsx
import { useRef, type CSSProperties } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { computeVoxelBoxStates } from '@/utils/voxelTrackMath';
import type { SliderLinearSchema } from '@/types/controls';
import './SliderLinear.css';

interface SliderLinearProps {
  schema: SliderLinearSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  verticalHeight?: number;
}

export function SliderLinear({ schema, value, onChange, disabled, verticalHeight }: SliderLinearProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight);
  const states = computeVoxelBoxStates(value, schema.min, schema.max, boxCount);

  const valueLabel = (
    <span className="sc-slider-linear__value">{formatDisplayValue(value)}{schema.unit}</span>
  );

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

Note what disappeared from the current file's imports: `useCabinetBoxHeight`/`useVoxelTrackGap`, `useVoxelTrackBoxCount`, and 3 of `voxelTrackMath.ts`'s exports (`computeVoxelTrackLength`, `computeVoxelTrackTrailingReserve`, `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`) — all now internal to `useVoxelTrackSlider`. `computeVoxelBoxStates` is the one `voxelTrackMath.ts` export `SliderLinear.tsx` still calls directly, since box-state computation stays each consumer's own concern (§3). The unused `CSSProperties` import from `SliderLinearProps`'s own type annotations is dropped along with the now-hook-owned `rootStyle` computation — confirm with `npm run lint` that nothing else in the file still needs it.

**`src/components/ui/controls/SliderLog.tsx`** (full replacement):

```tsx
import { useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { VoxelTrack } from './VoxelTrack';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { sliderLogTToValue, sliderLogValueToT } from './sliderLogMath';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import { useVoxelTrackSlider } from './useVoxelTrackSlider';
import { computeVoxelBoxStates } from '@/utils/voxelTrackMath';
import type { SliderLogSchema } from '@/types/controls';
import './SliderLog.css';

interface SliderLogProps {
  schema: SliderLogSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** On a vertical slider, the box-count-fitting BUDGET (not a literal
   *  applied length — see docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.4)
   *  box count fits within, instead of a live ResizeObserver measurement of
   *  the parent. Omit to fit against the fixed VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT
   *  budget. */
  verticalHeight?: number;
}

/**
 * Logarithmic-scale slider (Attack/Decay/Release: 0s-10s "Logarithmic
 * scaling"), rendering through the shared voxel-track system (roadmap
 * 11.1.3/11.1.4) — a row of uniform CabinetBox facades in place of the
 * traditional track+handle, self-fitting its own box count live to
 * whatever space its container gives it, same as SliderLinear. Box
 * placement uses this component's own normalized t (the same value already
 * fed to Radix's own Slider.Root), not the raw log-scaled value — see
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_LOG.md §1.3. sliderLogMath's actual
 * curve is unchanged.
 */
export function SliderLog({ schema, value, onChange, disabled, verticalHeight }: SliderLogProps) {
  const t = sliderLogValueToT(value, schema.min, schema.max);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight);
  const states = computeVoxelBoxStates(t, 0, 1, boxCount);

  const valueLabel = (
    <span className="sc-slider-log__value">{formatDisplayValue(value)}{schema.unit}</span>
  );

  return (
    <div ref={wrapperRef} className="sc-slider-log" data-orientation={orientation}>
      <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
      {isVertical && valueLabel}
      <Slider.Root
        className="sc-slider-log__root"
        orientation={orientation}
        min={0}
        max={1}
        step={0.001}
        value={[t]}
        onValueChange={(values) => onChange(sliderLogTToValue(values[0], schema.min, schema.max))}
        disabled={disabled}
        style={rootStyle}
      >
        <Slider.Track className="sc-slider-log__track">
          <Slider.Range className="sc-slider-log__range" />
          <VoxelTrack
            states={states}
            boxSize={boxSize}
            gap={gap}
            axis={orientation}
            timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
          />
        </Slider.Track>
        <Slider.Thumb className="sc-slider-log__thumb" aria-label={resolveAccessibleName(schema)} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}
```

**`src/components/ui/controls/SliderLog.css`** (modified — mirrors `SliderLinear.css`'s own 11.1.3 changes exactly; only the 3 rules below differ from the current file, everything else — `.sc-slider-log`, `.sc-slider-log__track`, the vertical `data-orientation` sizing, `.sc-slider-log__value` — is untouched):

```css
/* was: position: absolute; height: 100%; border-radius: 999px;
        background-color: var(--color-accent);
   Decorative only now, kept in the DOM for structural/a11y parity — the
   voxel track (an absolutely-positioned sibling inside Slider.Track)
   renders the real visible fill. Mirrors SliderLinear.css's/
   SliderCenteredZero.css's own .__range rule exactly. */
.sc-slider-log__range {
  visibility: hidden;
}

.sc-slider-log__thumb {
  display: block;
  width: 14px;
  height: 14px;
  border-radius: 999px;
  /* was background-color: var(--color-text-primary) — the voxel boxes now
     carry all visible fill/position information; the thumb itself stays
     real, hit-testable, and focusable (never visibility:hidden/opacity:0,
     which would also hide the :focus-visible outline below). */
  background-color: transparent;
}

/* Only the box row (Slider.Root) is ever wider/taller than its container —
   engages only for the 3-box overflow floor (voxelTrackMath.ts's
   VOXEL_TRACK_MIN_BOX_COUNT). Mirrors SliderLinear.css's own §1.11
   precedent — scoped to the existing data-orientation attribute, no new
   wrapper element. */
.sc-slider-log[data-orientation='horizontal'] {
  overflow-x: auto;
  overflow-y: visible;
}

.sc-slider-log[data-orientation='vertical'] {
  overflow-y: auto;
  overflow-x: visible;
}
```

* **Naming conventions:** `useVoxelTrackSlider`/`VoxelTrackSliderLayout` (camelCase hook, PascalCase return-type interface, matching `useVoxelTrackBoxCount`'s own naming register exactly). No new `sc-` CSS class — `SliderLog.css`'s existing class names are reused as-is.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`useVoxelTrackSlider.test.ts` (new)**, using the same `MockResizeObserver` convention `SliderLinear.test.tsx`/`useVoxelTrackBoxCount.test.ts` already establish:
  1. Returns `boxCount: VOXEL_TRACK_MIN_BOX_COUNT` before any `ResizeObserver` callback fires (horizontal, `verticalHeight` omitted).
  2. Horizontal: `rootStyle` is `{ width: trackLength, height: boxSize }` after a fired measurement — asserted against `computeVoxelTrackLength`/`computeVoxelTrackTrailingReserve`'s own real output for that measurement, not a hand-derived number.
  3. Vertical, `verticalHeight` omitted: `boxCount` fits against `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` synchronously — no `ResizeObserver` needs to fire for a correct result (mirrors `SliderLinear.test.tsx`'s own "omitting verticalHeight fits synchronously" case, one level down).
  4. Vertical, `verticalHeight` supplied (not an exact multiple of `boxSize + gap`): `trackLength` is the box-quantized `computeVoxelTrackLength` output, not `verticalHeight` verbatim; `rootStyle` is `{ height: trackLength, width: boxSize }`.
  5. Horizontal: a container width landing on an exact multiple of `(boxSize + gap)` still leaves `trackLength` room for `computeVoxelTrackTrailingReserve('horizontal')` beyond the tight box-row length — the exact regression 11.1.3 §1.13 fixed, re-verified at the hook level now that `SliderLinear.tsx` no longer computes this inline itself.
* **`SliderLinear.test.tsx` — UNCHANGED, zero edits.** All 23 existing cases (§2's own file-structure note) must pass exactly as they do today, proving the retrofit (§1.2) preserved every observable behavior: rendering, ARIA attributes, value formatting, disabled state, the `VoxelTrack` states/box-size/gap assertions, both orientation's DOM-order/sizing cases, the exact-multiple-width trailing-reserve regression, and the vertical-default/`verticalHeight`-budget cases. If implementing this item requires touching this file at all, that is itself a signal something in §1.2 went wrong.
* **`SliderLog.test.tsx` (modified)** — of the 25 existing cases, **22 stay unchanged and passing**: every `sliderLogTToValue`/`sliderLogValueToT` math case (untouched — `sliderLogMath.ts` itself doesn't change), `DualLabel` rendering, `{value}{unit}` display, the no-unit/3-decimal-cap display cases, the `onChange`-receives-mapped-value case, accessible-name fallback, not-disabled-by-default, disabled attribute + tabindex removal, no-`onChange`-when-disabled, both `data-orientation` cases on root and wrapper, the 2 DOM-order cases for the value label, the `'auto'`-defaults-to-horizontal case, and the orientation-has-no-effect-on-the-curve case. **3 must be rewritten** (lines 157–177 of the current file), the identical named behavior change 11.1.3's own Task 6 already made for `SliderLinear.test.tsx`:
  1. *(was "does not set an inline height when verticalHeight is omitted — the default comes from the `--slider-vertical-height` CSS custom property")* → **now: sets an inline height fitted against the fixed `VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT` budget** — asserted the same way `SliderLinear.test.tsx`'s equivalent case is: `root.style.height` equals `computeVoxelTrackLength(computeFittedBoxCount(VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT, BOX_SIZE, GAP), BOX_SIZE, GAP)`, present synchronously with no `ResizeObserver` firing required.
  2. *(was "sets an inline height from the verticalHeight prop when provided, overriding the CSS default")* → **now: `verticalHeight` is a fitting budget** — asserted with a `verticalHeight` deliberately not an exact multiple of `(boxSize + gap)` (mirroring `SliderLinear.test.tsx`'s own `310` fixture), confirming `root.style.height` is the box-quantized `computeVoxelTrackLength` output, not `verticalHeight` verbatim.
  3. *(was "horizontal ignores a verticalHeight prop entirely (no inline height set)")* → **still holds structurally (no inline `height` on a horizontal root) but now additionally asserts an inline `width` IS set** from the fitted box count plus the horizontal trailing reserve — extended, not just preserved, mirroring `SliderLinear.test.tsx`'s equivalent case exactly (a fired `MockResizeObserver` measurement feeding a known available width).
  New coverage, beyond the 3 rewritten (2 genuinely new test cases — the thumb-transparency item below is verified by reading the shipped CSS directly, not a 3rd new test, matching `SliderLinear.test.tsx`'s own Task 6 precedent):
  4. Renders a `VoxelTrack` (mocked, mirroring `SliderLinear.test.tsx`'s own `vi.mock('./VoxelTrack', ...)` precedent) with `states` matching `computeVoxelBoxStates(t, 0, 1, boxCount)` for the currently-fitted `boxCount`, where `t` is `sliderLogValueToT(value, schema.min, schema.max)` — **not** `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)`, confirming §1.3's placement choice directly rather than merely "doesn't throw."
  5. `Slider.Thumb`'s rendered `background-color` is `transparent`. **Not asserted via a unit test**, same "this jsdom/vitest setup injects no `<style>` tags" finding `SliderLinear.test.tsx`'s own Task 6 already made — confirmed instead by reading the shipped `SliderLog.css` directly.
  6. `screen.getByRole('slider')` still resolves to exactly one element.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including `SliderLinear.test.tsx` **unmodified** (proves the retrofit is genuinely behavior-preserving, not just type-compatible) and every other real `SliderLog`/`SliderLinear` consumer's own test file (e.g. `AudioRigDrawer.test.tsx`, `RobotOptionsTab`-adjacent suites), unmocked against the real components.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** load the app, open a drawer with a real `SliderLog` (Ping Contour's Attack/Decay/Release) at each of the 3 breakpoints: confirm the track renders as a row of square boxes, matching `SliderLinear`'s own already-verified look; confirm dragging/keyboard-stepping moves the straddling box along the *log* curve — small drags near the low end of the range should visibly move further along the track than equal-sized drags near the high end, unlike a linear slider; confirm the focus ring renders clearly on top of the box row; confirm a narrow container clamps to 3 boxes and scrolls rather than shrinking; confirm "reduce motion" makes transitions snap instead of animate. Also spot-check that `SliderLinear` in the same drawer (e.g. Audio Rig's EQ3 Gain) still looks and behaves identically to before this item — the retrofit's whole point is that nothing here should look different.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** the same "internal rendering changed, contract didn't" note `SliderLinear`'s row already carries, added to `SliderLog`'s row; plus a short addition to `SliderLinear`'s existing note mentioning that its own container-fitting logic moved into the shared `useVoxelTrackSlider` hook this item introduced (so a reader of `SliderLinear`'s note isn't left thinking that logic still lives inline there).
* **`docs/CONSOLE_THEMING.md` update:** the "Voxel-track sliders (Phase 11.1.3)" section's own closing framing ("Shared unchanged by `SliderLog`/`SliderCenteredZero` (11.1.4/11.1.5) once they ship") is updated once this item ships — `SliderLog` has now shipped; `SliderCenteredZero` remains the pending one.
* **`docs/todo/roadmap.md`:** gains the "Done" marker for 11.1.4 at implementation time (this spec doesn't add it — mirrors how 11.1.3's own spec didn't either, only its task-completion pass did).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** a new feature branch (e.g. `feature/cabinetry-slider-log`) — smaller footprint than 11.1.3's own branch (1 new hook module, 1 retrofitted component with zero behavior change, 1 rewired component), but still its own branch per this series' established one-branch-per-item convention.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `useVoxelTrackSlider.ts` + test (new, no consumer yet); (2) `SliderLinear.tsx`'s retrofit — verified against its own unmodified 20-case test file before moving on; (3) `SliderLog.tsx`/`.css`/`.test.tsx` (the new real consumer, including the 3 rewritten tests); (4) docs.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and this codebase's own precedents, not left open):

- ~~What does the shared hook's name/shape/file location look like?~~ **Resolved: `useVoxelTrackSlider`, `src/components/ui/controls/useVoxelTrackSlider.ts`, returning `{ boxSize, gap, boxCount, trackLength, rootStyle }`** (§1.1) — matching `useVoxelTrackBoxCount`'s own naming/location register.
- ~~Does the hook decide orientation or compute box states?~~ **Resolved: neither — it takes an already-resolved orientation and leaves `computeVoxelBoxStates` to each consumer, since that call's inputs genuinely differ per consumer** (§1.1, §3).
- ~~Does `SliderLog`'s box placement use raw value or `t`?~~ **Resolved: `t` — the same normalized value already fed to Radix's own `Slider.Root`, since `voxelTrackMath.ts` assumes linear spacing and only `t`-space is actually linear for a log-curve slider** (§1.3).
- ~~Is `SliderLinear.tsx`'s retrofit expected to change any observable behavior?~~ **Resolved: no — all 23 existing tests must pass unmodified; any required test edit is a sign the retrofit went wrong, not a sign the test was stale** (§1.2, §5).

Carried forward from the intent doc, not blocking this spec:

1. **Whether `SliderCenteredZero` (11.1.5) reuses `useVoxelTrackSlider`** — left to that item's own spec pass, per the intent doc's Forward Note; `SliderCenteredZero`'s zero-anchored fill is a genuine adaptation of `computeVoxelBoxStates` itself (or a zero-anchored sibling function), which is orthogonal to whether it also benefits from this hook's box-count/track-length/`rootStyle` plumbing. Likely yes, but not assumed here.
2. **N-timelines-per-slider performance** (11.1.3 §1.2/§7's own "real risk, not fully resolvable at spec time") — unchanged by this item (no new timeline mechanism), still carried forward to 11.2.

**No new risk introduced by this item beyond what 11.1.3 already accepted.** The one thing worth flagging explicitly: this is the first time a shared Cabinetry hook has been extracted *after* one of its two consumers already shipped and accumulated real test coverage — if the retrofit (§1.2) turns out to require any `SliderLinear.test.tsx` edit at all during implementation, treat that as a stop-and-reassess signal rather than pushing through, per §3's own constraint.
