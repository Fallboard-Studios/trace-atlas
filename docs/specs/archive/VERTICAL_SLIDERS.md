# Phase Spec: Vertical Slider Orientation

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/vertical-sliders.md](../intent/vertical-sliders.md) (confirmed via `/interview-me`, 2026-09-04). Related prior art: [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (the `ControlSchema` primitive inventory `SliderLinear`/`SliderLog`/`SliderCenteredZero` belong to, and `SliderCenteredZero`'s existing zero-anchored fill math this phase extends to a second axis). This phase touches presentation only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; every touched schema's `value`/`onChange` contract is unchanged.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`SliderLinear`, `SliderLog`, and `SliderCenteredZero` ([src/components/ui/controls/](../../src/components/ui/controls/)) each wrap `@radix-ui/react-slider` in the same fixed horizontal shape: `Slider.Root` (`width: 100%`, `height: 20px`) → `Track` → `Range` → `Thumb`, with an internally-composed `DualLabel` above and a `{value}{unit}` readout span after. Radix's own `Slider.Root` supports `orientation="vertical"` natively (stamping `data-orientation` on `Root`/`Track`/`Range` for free) but nothing in this codebase uses it yet.

This phase adds a required `orientation: SliderOrientation` field (`'horizontal' | 'vertical' | 'auto'`) to all three schema types and teaches all three components to render each value:

- **`'horizontal'`** — unchanged from today.
- **`'vertical'`** — Radix vertical orientation, track height defaults to **256px** via a new `--slider-vertical-height` CSS custom property, overridable per-instance through an optional `verticalHeight?: number` prop. Layout order top-to-bottom: `DualLabel` → value readout → track (value sits *above* the track so a dragging thumb can never cover it — confirmed during interview, the one deliberate deviation from "rotate the existing stack as a unit").
- **`'auto'`** — resolved at render time by a new shared hook, `useAutoSliderOrientation`, which measures the **parent** of the component's own wrapper element via `ResizeObserver` (never the wrapper's own box — see §1.2) and picks whichever axis, width or height, is longer.

Every real slider schema in `audioRigConfig.ts`, `robotOptionsConfig.ts`, and `Lfo.tsx`'s two internally-built sliders (Rate, Depth) gets the correct `orientation` value per the table below — verified field-for-field against the live config files during `/interview-me`, not assumed from a label:

| File | Schema(s) | `orientation` |
|---|---|---|
| `audioRigConfig.ts` | `PING_VARIANCE_AUTOMATION_SCHEMA` (Automatic Effects), `BPM_SCHEMA` (Tempo) | `'horizontal'` |
| `audioRigConfig.ts` | `eq3.low` / `eq3.mid` / `eq3.high` | `'vertical'` |
| `audioRigConfig.ts` | `filterLPF.frequency` / `.Q`, `filterHPF.frequency` / `.Q` | `'auto'` |
| `audioRigConfig.ts` | `delay.delayTime` / `.feedback` / `.wet` | `'auto'` |
| `audioRigConfig.ts` | `reverb.decay` / `.preDelay` / `.wet` | `'auto'` |
| `audioRigConfig.ts` | `compressor.threshold` / `.attack` / `.release` / `.knee` (not `.ratio` — that's a `StepperSchema`, out of scope) | `'auto'` |
| `audioRigConfig.ts` | `limiter.threshold` | `'auto'` |
| `audioRigConfig.ts` | `LFO_DRIFT_GROUPS`' `rateSchema`/`depthSchema`, all 4 groups (`eq3`, `filterLPF`, `filterHPF`, `robots`) | `'auto'` |
| `robotOptionsConfig.ts` | `VOLUME_SCHEMA` | `'horizontal'` |
| `robotOptionsConfig.ts` | `DENSITY_SCHEMA`, `PITCH_REPEAT_SCHEMA` (Ping Controls) | `'auto'` |
| `robotOptionsConfig.ts` | `ATTACK_SCHEMA`, `DECAY_SCHEMA`, `SUSTAIN_SCHEMA`, `RELEASE_SCHEMA` (Ping Contour) | `'auto'` |
| `robotOptionsConfig.ts` | `SIGNATURE_ARRAY_CONFIG`'s `gain`/`detune`/`phase`/`pulseWidth`, all 3 layers | `'auto'` |
| `Lfo.tsx` | internal `rateSchema`, `depthSchema` (built per-render, not config-file data) | `'auto'` |

No `'vertical'` entries exist on the robot/company side (confirmed — Signature Array etc. are all `'auto'`, not `'vertical'`, per the classification list).

**Amendment, docs/specs/AUDIO_RIG_RESPONSIVE_LAYOUT.md (2026-09-10):** the table above is a historical record of this phase's own classification pass and is left as-is, not rewritten — but every `audioRigConfig.ts` row's `'auto'` value has since been superseded by a fixed literal: `filterLPF`/`filterHPF`'s Frequency/Resonance reverted to `'vertical'` (a deliberate reversal, not a bug — they now always share one row together, never stacking, at every breakpoint); `delay`/`reverb`/`compressor`/`limiter`/`LFO_DRIFT_GROUPS` all became fixed `'horizontal'`. `Lfo.tsx`'s own `rateSchema`/`depthSchema` (used by every `Lfo` display, Audio Rig and Robot Options alike) also became fixed `'horizontal'` — that row below is stale too. `'auto'` slider orientation is retired from the Audio Rig entirely as of that spec, though `useAutoSliderOrientation` itself is unchanged and still used by the `robotOptionsConfig.ts` rows below, which remain current as written.

**Amendment, docs/specs/ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md (2026-09-10):** the prior amendment above said the `robotOptionsConfig.ts` rows "remain current as written" — no longer true. `DENSITY_SCHEMA`/`PITCH_REPEAT_SCHEMA`/`MOTIF_LENGTH_SCHEMA`/`OCTAVE_RANGE_MIN_SCHEMA`/`OCTAVE_RANGE_MAX_SCHEMA`/`NOTE_VARIANCE_SCHEMA` (row 39, which was also missing 2 of its 6 real members even at the time it was written) and `ATTACK_SCHEMA`/`DECAY_SCHEMA`/`SUSTAIN_SCHEMA`/`RELEASE_SCHEMA` (row 40) all became fixed `'horizontal'`. Separately, row 41 (`SIGNATURE_ARRAY_CONFIG`'s Gain/Detune/Phase/Interval) was already stale independent of this phase — the real source has been `orientation: 'vertical'` on all 4 fields for some time, not `'auto'` as this table still says; confirmed by reading `makeLayerBlock()` directly, not changed by this phase (Signature Array is explicitly out of scope for `ROBOT_OPTIONS_RESPONSIVE_LAYOUT.md`). `useAutoSliderOrientation`/`useAutoPanelOrientation` themselves are unchanged — as of this phase, a repo-wide grep for `orientation: 'auto'` finds nothing left in either `audioRigConfig.ts` or `robotOptionsConfig.ts`; whether that makes retiring either hook a fair question to raise is a decision for Crawford, not resolved here.

**Correction made while grounding this spec against the real code (not caught during `/interview-me`):** the classification list's "Global effects → Horizontal → Volume" does not correspond to a `SliderLinearSchema` anywhere. The Rig's master volume slider is rendered in [TransportBar.tsx](../../src/components/panels/screen/TransportBar.tsx#L61-L74) as a **raw, hand-rolled `@radix-ui/react-slider` instance** — it never went through the `ControlSchema`/`SliderLinear` system `docs/COMPONENT_LIBRARY.md` describes, unlike robot Volume (`VOLUME_SCHEMA`, real, in the table below). Since it's classified Horizontal — already its only appearance today — there is no behavior change to make, so this phase makes **no edit to `TransportBar.tsx`** and does not migrate it onto `SliderLinear`. Flagged again in §7 in case the user wants that migration as a explicit followup rather than a silent non-action.

### 1.2 The `'auto'` measurement target, and why it isn't the slider's own box

An `'auto'` slider cannot measure its own rendered box: switching from horizontal (short/wide) to vertical (tall/narrow) changes that box's own dimensions, which can flip the width-vs-height comparison right back — an oscillation. `useAutoSliderOrientation` instead observes `ref.current.parentElement` — a box the *caller's* layout is responsible for sizing, not something this component's own orientation choice can perturb.

**This phase does not give any real call site a sized parent.** Per the confirmed intent, reworking drawer layouts (EQ row, LFO/filter/delay/reverb/compressor param rows, Ping Controls/Contour, Signature Array) into real side-by-side groupings is explicit **out of scope**, deferred to a later session. Today's drawer rows are full-width, auto-height blocks, so `'auto'` sliders will keep measuring wider-than-tall and rendering horizontally in every real drawer — expected, not a bug (§7 covers the residual risk once real layout work starts observing a height-unconstrained parent).

### 1.3 `SliderCenteredZero`'s fill math on the vertical axis

`sliderCenteredZeroMath.ts`'s `computeFillRect`/`zeroPointPercent`/`valuePercent` already return **axis-agnostic percentages** along the value's own range (0% = `min`, 100% = `max`) — nothing in that file assumes "left". Radix's vertical slider already places `min` at the bottom and `max` at the top by default, which is also the standard fader-up-means-more convention this phase's `'vertical'`-classified EQ sliders want. So the same `{ left, width }` percentages `computeFillRect` already returns are reused unchanged for the vertical axis — a vertical fill only needs to render them against `bottom`/`height` instead of `left`/`width`. **No change to `sliderCenteredZeroMath.ts`'s math**, only a doc-comment note and a conditional style-prop mapping inside `SliderCenteredZero.tsx` (§4).

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── controls.ts                  # MODIFIED — new `SliderOrientation` type;
│   │                                 #   `orientation: SliderOrientation` added (required) to
│   │                                 #   SliderLinearSchema/SliderLogSchema/SliderCenteredZeroSchema
│   └── controls.test.ts             # MODIFIED — the 3 slider literal fixtures gain `orientation`
├── components/ui/controls/
│   ├── useAutoSliderOrientation.ts       # NEW — the shared resolver hook, §1.2/§4
│   ├── useAutoSliderOrientation.test.ts  # NEW — see §5
│   ├── SliderLinear.tsx / .css / .test.tsx           # MODIFIED — §4
│   ├── SliderLog.tsx / .css / .test.tsx              # MODIFIED — §4
│   ├── SliderCenteredZero.tsx / .css / .test.tsx      # MODIFIED — §4
│   ├── sliderCenteredZeroMath.ts    # MODIFIED — doc comment only (§1.3), zero behavior change
│   └── Lfo.tsx                      # MODIFIED — internal rateSchema/depthSchema literals gain
│                                     #   `orientation: 'auto'`
├── data/
│   ├── audioRigConfig.ts            # MODIFIED — `orientation` added to every slider schema
│   │                                 #   literal per §1.1's table
│   └── robotOptionsConfig.ts        # MODIFIED — same, per §1.1's table
└── index.css                        # MODIFIED — new `--slider-vertical-height: 256px` token,
                                      #   alongside the existing --color-*/--spacing-* tokens
```

**Explicitly not touched, and why:**

- `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.tsx`, `src/components/robot/AudioSettingSection.tsx`, `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingContourDrawer.tsx`, `src/components/company/CompanyOptionsSection.tsx`, `src/components/panels/screen/console/RobotOptionsTab.tsx` — every one of these renders sliders by importing schemas from `audioRigConfig.ts`/`robotOptionsConfig.ts` and passing them straight through to `SliderLinear`/`SliderLog`/`SliderCenteredZero` unchanged. They need zero code changes for this phase: the new `orientation` field flows through automatically once the config files set it, and no drawer's own grid/flex layout changes (§1.2, out of scope).
- `src/engine/`, `src/stores/` (any) — no audio-engine, scheduling, or Zustand-shape change. No new store field.
- `docs/COMPONENT_LIBRARY.md` — deferred to §6 (a small addition, not a structural rewrite).
- Their own test files (`AudioRigDrawer.test.tsx`, `SignatureArrayDrawer.test.tsx`, etc.) — none of them construct a `SliderLinearSchema`/`SliderLogSchema`/`SliderCenteredZeroSchema` object literal directly (verified: only the 9 files listed in `Target File Structure` do, via `grep -rln "type: 'sliderLinear'\|type: 'sliderLog'\|type: 'sliderCenteredZero'"`), and their existing schema assertions use `toMatchObject` (partial match), which tolerates the new field without modification.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`orientation` is required, not optional, on all 3 schema types.** No default value in the type itself — every existing schema literal across `audioRigConfig.ts`/`robotOptionsConfig.ts`/`Lfo.tsx` must set one deliberately (confirmed during interview: the classification list covers every real slider with no "unclassified" bucket).
* **`'auto'` measures the parent element, never the slider's own wrapper box** (§1.2). Do not "simplify" this to a self-observing `ResizeObserver` — that reintroduces the feedback-loop risk the design was built to avoid.
* **No drawer layout changes.** Do not add grid/flex wrapper markup to `AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, or any other consumer to make `'auto'`/`'vertical'` sliders visually group side-by-side — explicitly deferred (confirmed intent's Out of Scope).
* **`sliderCenteredZeroMath.ts`'s exported functions keep their exact current signatures and return values.** The vertical axis reuses the same percentages (§1.3); do not add a parallel `computeFillRectVertical` or change what `computeFillRect` returns.
* **Inline style objects stay limited to the two existing documented exceptions plus one new one:** `SliderCenteredZero`'s fill positioning (existing), and the new `verticalHeight` override on `Slider.Root` when `'vertical'` and a caller passes a non-default height — both are computed/dynamic per-instance values, not static styling, consistent with this codebase's "no inline style objects unless calculating dynamic transform/attr values" rule. The 256px *default* comes from the `--slider-vertical-height` CSS custom property, not an inline style — only an explicit override needs one.
* **No new dependency.** `@radix-ui/react-slider` (already installed, `^1.3.6`) supports `orientation="vertical"` natively; `ResizeObserver` is a browser global already polyfilled for tests (`vitest.setup.ts`, added for Radix's own internal `useSize` hook) — no new package for either.
* **CLAUDE.md's animation/timing rules are not implicated.** `useAutoSliderOrientation` uses `ResizeObserver`, not `setTimeout`/`setInterval`/`requestAnimationFrame` — this is layout measurement, not musical timing or animation, so the "no timers for musical timing" and "GSAP owns animation" rules don't apply here.

---

## 4. Code Style & Architecture Conventions

**`components/ui/controls/useAutoSliderOrientation.ts`** (new — full shape):

```typescript
import { useEffect, useState, type RefObject } from 'react';
import type { SliderOrientation } from '@/types/controls';

export type ResolvedSliderOrientation = 'horizontal' | 'vertical';

/**
 * Resolves a schema's SliderOrientation to a concrete 'horizontal' | 'vertical'
 * for rendering. 'horizontal'/'vertical' pass through unchanged, no
 * observation. 'auto' measures the *parent* of `ref`'s element — never the
 * element's own box, since flipping orientation changes the slider's own
 * rendered size and a self-observed measurement would feed back into itself
 * (docs/specs/VERTICAL_SLIDERS.md §1.2) — via ResizeObserver, resolving to
 * whichever axis (width or height) is longer. Defaults to 'horizontal'
 * before the first measurement and whenever no parent element exists yet.
 */
export function useAutoSliderOrientation(
  ref: RefObject<HTMLElement | null>,
  orientation: SliderOrientation,
): ResolvedSliderOrientation {
  const [resolved, setResolved] = useState<ResolvedSliderOrientation>(
    orientation === 'vertical' ? 'vertical' : 'horizontal',
  );

  useEffect(() => {
    if (orientation !== 'auto') {
      setResolved(orientation);
      return;
    }
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const next: ResolvedSliderOrientation = height > width ? 'vertical' : 'horizontal';
      // Bail on an unchanged value so a same-orientation resize doesn't
      // trigger a re-render — one more guard against feedback churn.
      setResolved((prev) => (prev === next ? prev : next));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [orientation, ref]);

  return resolved;
}
```

**`types/controls.ts`** (diff):

```typescript
export type SliderOrientation = 'horizontal' | 'vertical' | 'auto';

export interface SliderLinearSchema extends ControlSchemaBase {
  type: 'sliderLinear';
  min: number;
  max: number;
  step?: number;
  unit?: string;
  orientation: SliderOrientation;
}

export interface SliderLogSchema extends ControlSchemaBase {
  type: 'sliderLog';
  min: number;
  max: number;
  unit?: string;
  orientation: SliderOrientation;
}

export interface SliderCenteredZeroSchema extends ControlSchemaBase {
  type: 'sliderCenteredZero';
  min: number;
  max: number;
  unit?: string;
  orientation: SliderOrientation;
}
```

**`components/ui/controls/SliderLinear.tsx`** (full shape — `SliderLog`/`SliderCenteredZero` follow the identical wrapper/ordering/height pattern, each keeping its own existing internal math):

```tsx
import { useRef } from 'react';
import * as Slider from '@radix-ui/react-slider';

import { DualLabel } from './DualLabel';
import { resolveAccessibleName } from './accessibleName';
import { formatDisplayValue } from './formatDisplayValue';
import { useAutoSliderOrientation } from './useAutoSliderOrientation';
import type { SliderLinearSchema } from '@/types/controls';
import './SliderLinear.css';

interface SliderLinearProps {
  schema: SliderLinearSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  /** Vertical track height in px, used only when the resolved orientation is
   *  'vertical'. Omit to use the --slider-vertical-height default (256px). */
  verticalHeight?: number;
}

/** Linear-scale slider wrapping @radix-ui/react-slider, all 3 SliderOrientation values. */
export function SliderLinear({ schema, value, onChange, disabled, verticalHeight }: SliderLinearProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';

  const valueLabel = (
    <span className="sc-slider-linear__value">{formatDisplayValue(value)}{schema.unit}</span>
  );

  return (
    <div ref={wrapperRef} className="sc-slider-linear">
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
        style={isVertical && verticalHeight !== undefined ? { height: verticalHeight } : undefined}
      >
        <Slider.Track className="sc-slider-linear__track">
          <Slider.Range className="sc-slider-linear__range" />
        </Slider.Track>
        <Slider.Thumb className="sc-slider-linear__thumb" aria-label={resolveAccessibleName(schema)} />
      </Slider.Root>
      {!isVertical && valueLabel}
    </div>
  );
}
```

**`components/ui/controls/SliderLinear.css`** (diff — append; unchanged rules omitted):

```css
.sc-slider-linear__root[data-orientation='vertical'] {
  flex-direction: column;
  width: 20px;
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
```

(`SliderLog.css` gets the identical block under its own `.sc-slider-log__*` class names; no math/behavior differs from `SliderLinear` for orientation — only the existing `t`-mapping stays untouched.)

**`components/ui/controls/SliderCenteredZero.tsx`** (diff — the fill's axis mapping, §1.3):

```tsx
const fill = computeFillRect(value, schema.min, schema.max);
const fillStyle = isVertical
  ? { bottom: `${fill.left}%`, height: `${fill.width}%` }
  : { left: `${fill.left}%`, width: `${fill.width}%` };
// ...
<div className="sc-slider-centered-zero__fill" style={fillStyle} />
```

**`components/ui/controls/SliderCenteredZero.css`** (diff — append):

```css
.sc-slider-centered-zero__root[data-orientation='vertical'] {
  flex-direction: column;
  width: 20px;
  height: var(--slider-vertical-height, 256px);
}

.sc-slider-centered-zero__track[data-orientation='vertical'] {
  width: 3px;
  height: 100%;
}

.sc-slider-centered-zero__fill {
  position: absolute;
  border-radius: 999px;
  background-color: var(--color-accent);
}
```

(Horizontal's `top: 0; height: 100%;` for `.__fill` moves from a static rule to the `fillStyle`'s own `left`/`width`/`top`/`height` combination computed in JS above — the element no longer needs orientation-specific CSS beyond shared appearance, since both axes are now fully driven by inline style.)

**`index.css`** (diff — alongside the existing `--spacing-*`/`--color-*` tokens):

```css
--slider-vertical-height: 256px;
```

**`components/ui/controls/Lfo.tsx`** (diff — 2 lines):

```typescript
const rateSchema: SliderLinearSchema = { id: `${schema.id}.rate`, type: 'sliderLinear', humanLabel: 'Rate', min: LFO_RATE_MIN, max: LFO_RATE_MAX, step: RATE_STEP, unit: 'Hz', orientation: 'auto' };
const depthSchema: SliderLinearSchema = { id: `${schema.id}.depth`, type: 'sliderLinear', humanLabel: 'Depth', min: LFO_DEPTH_MIN, max: LFO_DEPTH_MAX, unit: '%', orientation: 'auto' };
```

* **Naming conventions:** `useAutoSliderOrientation` (camelCase hook file/export, `use`-prefixed per React convention), `SliderOrientation` (PascalCase type, alongside `ControlSchema` in `controls.ts`), `verticalHeight` prop (camelCase, matches existing `disabled?`/`numeric?` optional-prop precedent on other primitives).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest (+ React Testing Library for every `.tsx` test below).
* **Test File Location:** Colocate, matching every file in §2.
* **`useAutoSliderOrientation.test.ts` (new):**
  1. `orientation: 'horizontal'` always resolves to `'horizontal'`, no `ResizeObserver` constructed.
  2. `orientation: 'vertical'` always resolves to `'vertical'`, no `ResizeObserver` constructed.
  3. `orientation: 'auto'` resolves to `'horizontal'` before any measurement (default state, matches §1.2's "today's rows are wide/short" expectation).
  4. `orientation: 'auto'`: stub `globalThis.ResizeObserver` with a controllable mock that captures its callback; render the hook against a ref/parent pair (via `renderHook` + a small wrapper DOM), invoke the captured callback with a `contentRect` where `height > width`, assert the hook's returned value flips to `'vertical'`; invoke again with `width > height`, assert it flips back to `'horizontal'`.
  5. `orientation: 'auto'` observes `ref.current.parentElement`, not `ref.current` itself — assert the mock's `observe()` was called with the parent element, not the ref's own element.
  6. Unmounting calls the mock observer's `disconnect()`.
  7. No parent element (`ref.current.parentElement` is `null`): resolves to the default `'horizontal'`, no throw.
* **`SliderLinear.test.tsx` / `SliderLog.test.tsx` / `SliderCenteredZero.test.tsx` (modified):** every existing schema literal fixture gains `orientation: 'horizontal'` (existing tests are all orientation-agnostic assertions — value/label/disabled/a11y — so this is the only change needed to keep them compiling and passing), plus new cases per component:
  - `orientation: 'vertical'`: `Slider.Root` receives `orientation="vertical"`; the value readout renders *before* the track in DOM order (assert via `container.querySelectorAll` order or `compareDocumentPosition`), not after; the root's rendered height reflects `--slider-vertical-height` by default.
  - `orientation: 'vertical'` with an explicit `verticalHeight` prop: the root's inline `height` style reflects the passed value, not the default.
  - `orientation: 'auto'`: renders without throwing and defaults to horizontal-looking output before any `ResizeObserver` callback fires (integration-level smoke test — the resolution logic itself is `useAutoSliderOrientation.test.ts`'s job, not re-tested per component).
  - `SliderCenteredZero` only: with `orientation: 'vertical'`, the `.__fill` element's inline style uses `bottom`/`height` (not `left`/`width`), and the values match `computeFillRect`'s existing `{ left, width }` numbers reinterpreted on the new axis (§1.3) — reuse the existing `computeFillRect` fixture math directly in the assertion, don't hand-compute a second expected value.
* **`controls.test.ts` (modified):** the 3 slider literal fixtures (`sliderLinear`, `sliderLog`, `sliderCenteredZero`) each gain `orientation: 'horizontal'`; add one assertion that `SliderOrientation` accepts all 3 of `'horizontal' | 'vertical' | 'auto'` as literal values (mirrors this file's existing "one literal object per variant" pattern).
* **`audioRigConfig.test.ts` / `robotOptionsConfig.test.ts` (unmodified, verify only):** run the existing suite unchanged — every existing schema assertion uses `toMatchObject`, which tolerates the new required field without edits (§2). Add one new assertion group per file confirming the `orientation` table in §1.1 is actually set correctly on the real exported config objects (e.g. `expect(findParam('eq3', 'low').schema.orientation).toBe('vertical')`, `expect(findParam('filterLPF', 'frequency').schema.orientation).toBe('auto')`) — this is the actual regression guard for the classification list, since nothing else in the test suite checks it.
* **`Lfo.test.tsx` (verify only, no assertion changes expected):** confirm the existing suite still passes now that `Lfo.tsx`'s internal `rateSchema`/`depthSchema` carry `orientation: 'auto'` — these are internal to the component and not asserted on directly today.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (surfaces every schema literal across the 9 files in §2 that's missing the now-required `orientation` field).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** Open the Audio Rig, expand 3-Band EQ — confirm Low/Mid/High render as vertical faders, 256px tall, value above the track, thumb draggable up/down with `max` at the top; confirm the zero-anchored fill still visibly anchors at 0dB rather than the bottom edge. Confirm Volume (global and robot) and Tempo/Automatic Effects still render horizontal, unchanged from today. Confirm every `'auto'`-classified slider (LPF/HPF, Delay, Reverb, Compressor, Limiter, drift pairs, Ping Controls/Contour, Signature Array) still renders and behaves correctly — it will look horizontal today (§1.2), which is expected, not a regression.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** extend the existing `SliderLinear`/`SliderLog`/`SliderCenteredZero` rows' descriptions (or add one short subsection after "Primitives") noting the new required `orientation: SliderOrientation` field, the 3 resolved values, the `verticalHeight` override prop, and a pointer to this spec for the `'auto'`/`ResizeObserver` design and the parent-vs-self measurement rationale.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/vertical-sliders` (already checked out).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `types/controls.ts` + its test — the new `SliderOrientation` type and required field, (2) `useAutoSliderOrientation.ts` + its test, standalone with no consumer wired yet, (3) `SliderLinear`/`SliderLog`/`SliderCenteredZero` (`.tsx`/`.css`/`.test.tsx`) + `index.css`'s new token — the 3 components actually rendering all orientations, (4) `audioRigConfig.ts` + `robotOptionsConfig.ts` + `Lfo.tsx` — applying the real classification, (5) `docs/COMPONENT_LIBRARY.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~Separate `*Vertical` components, or orientation on the existing three?~~ **Resolved: orientation prop/schema field on the existing three** (intent doc, confirmed).
- ~~Where does `orientation` live — schema data or a render-time prop?~~ **Resolved: required schema field**, mirroring how `min`/`max`/`unit` already work (intent doc, confirmed).
- ~~What does `'auto'` measure?~~ **Resolved: a stable parent wrapper, not the slider's own box** (intent doc, confirmed; §1.2/§4 are the direct implementation).
- ~~Vertical layout order (label/value/track)?~~ **Resolved: label, then value, then track** — value never covered by a dragging thumb (intent doc, confirmed; deviates from the initial "rotate the stack as-is" guess).
- ~~Fixed height for explicit `'vertical'` sliders?~~ **Resolved: 256px default, optional per-instance override** (intent doc, confirmed).
- ~~Is drawer layout rework part of this pass?~~ **Resolved: no, explicitly deferred** (intent doc, confirmed).
- ~~Is it acceptable that `'auto'` sliders render horizontally in real drawers until that later layout pass?~~ **Resolved: yes, acceptable — verify via a mocked-`ResizeObserver` unit test, not by eyeballing a real drawer** (intent doc, confirmed).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **The residual feedback-loop/instability risk once real drawer layout work begins.** §1.2 fixes the *self*-observation loop, but a future drawer row that wraps an `'auto'` slider with no independent height constraint (e.g. a plain block-level `<div>` whose height is determined by its own children) still risks an unstable measurement once that row *does* get a taller/narrower shape from real layout work — because the row's own height would still be partly determined by the slider's rendered content, one level removed rather than eliminated. This spec does not solve that; it's flagged here so the later drawer-layout session designs each `'auto'` container with an externally-fixed height (e.g. CSS `grid-template-rows`/`aspect-ratio`) rather than shrink-wrapping its child, and treats it as a design constraint on that session's own containers, not something `useAutoSliderOrientation` can guarantee on its own.
2. **`SliderCenteredZero`'s `.__fill` element's CSS** (§4) drops its two static horizontal-only rules (`top: 0; height: 100%`) in favor of both axes being fully inline-style-driven. Confirm during implementation this doesn't regress the horizontal case's visual result (it shouldn't — `{ top: 0, left, width }`-via-JS for horizontal is a superset of what the static rule did) — a quick visual diff of an unchanged horizontal `SliderCenteredZero` (e.g. Detune) is worth doing alongside the new vertical EQ check in §5's manual step.
3. **`verticalHeight`'s unit and clamping.** Spec'd as a bare `number` (px, matching `--slider-vertical-height`'s own px value) with no min/max validation — if a caller ever passes something absurd (0, negative, NaN), no guard exists. Not wired into any real config in this phase (§1.1 has no call site overriding the default yet), so low risk; add a guard only if a future consumer actually needs a validated override.
4. **`TransportBar.tsx`'s master Volume slider is hand-rolled, not `SliderLinear`-based** (§1.1's correction note) — it stays untouched, still always horizontal, unaffected by this phase. Not resolved: whether a later phase should migrate it onto `SliderLinear`/`SliderLinearSchema` for consistency with every other slider in the app. Out of scope here either way since its current (horizontal) appearance already matches its classification.
