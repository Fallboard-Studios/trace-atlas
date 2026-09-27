# Phase Spec: SliderLinear Read-Only Mode

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/slider-linear-read-only.md](../intent/slider-linear-read-only.md) (confirmed via `/interview-me`, 2026-09-13). Covers [Roadmap Phase 15.1](../todo/roadmap.md#151-component-sliderlinear-read-only-mode). Related prior art: [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (the `SliderLinear` contract and orientation system this phase extends) and `src/components/selection/AudioStatusBadge.tsx` (the existing "value display that looks like a control, marked `role=\"status\"`" precedent this phase follows). This phase touches presentation only — no `AudioEngine`/`BeatClock` change, no new Zustand field, no change to any existing consumer's rendered output (`disabled={false}`/`readOnly` omitted is byte-for-byte identical to today).

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`SliderLinear` (`src/components/ui/controls/SliderLinear.tsx`) always renders a Radix `Slider.Root`/`Slider.Track`/`Slider.Thumb` — a real, focusable, draggable widget — with a `VoxelTrack` fill rendered as an absolutely-positioned sibling inside `Slider.Track` for the visible boxes. `disabled` (the only non-interactive state it has today) keeps that same Radix widget shape, just with `data-disabled`/no tab stop/no `onValueChange` — it still reads to assistive tech as "a slider, currently disabled."

Roadmap 15.2 and 15.3 both need to show Battery/Power as a live value using this exact visual (same `VoxelTrack` fill, same colors, same orientation system) but with **no widget semantics at all** — not a locked form control, a status readout. This phase adds a `readOnly` prop that renders a second, distinct branch inside the same component: no Radix import touched, no `Slider.Root`/`Track`/`Thumb`, no `onValueChange`, no tab stop — a plain `<div role="status">` wrapping the identical `DualLabel` + `VoxelTrack` + value-label markup the interactive branch already produces.

### 1.2 Why a second render branch, not a `disabled` variant

Confirmed during `/interview-me`: `readOnly` is not "a disabled slider." A disabled Radix `Slider.Root` still carries `role="slider"`/`aria-valuenow`/`aria-disabled` — appropriate for "you can't edit this right now" (e.g. a company bulk-edit panel with no company selected), wrong for "this is a live, always-accurate readout that was never editable in the first place" (Battery/Power). Per the confirmed intent, the read-only branch drops the widget role entirely, following the same precedent `AudioStatusBadge` already set for "a value display that happens to look like a control."

### 1.3 What stays shared between both branches

Both branches call `useAutoSliderOrientation`, `useVoxelTrackSlider`, and `computeVoxelBoxStates` identically — none of that logic is Radix-specific (`useVoxelTrackSlider` computes `rootStyle`/`boxCount` from `wrapperRef`'s own measured box, never from a Radix element), so the read-only branch gets full orientation support (`horizontal`/`vertical`/`auto`) and correct box-fitting with zero new sizing logic. The only things the read-only branch omits are the three Radix elements (`Slider.Root`/`Track`/`Thumb`) and the decorative hidden `Slider.Range`.

```typescript
// SliderLinear.tsx — shared setup, unchanged, feeds both branches
const wrapperRef = useRef<HTMLDivElement>(null);
const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
const isVertical = orientation === 'vertical';
const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight);
const states = computeVoxelBoxStates(value, schema.min, schema.max, boxCount);
const valueLabel = <span className="sc-slider-linear__value">{formatDisplayValue(value)}{schema.unit}</span>;
```

### 1.4 Accessible name — a deviation from the intent doc's own wording, reasoned through here

The confirmed intent doc says the read-only element's "accessible name composes the schema's label with the current formatted value... mirroring `AudioStatusBadge`'s own `aria-label` composition." Implementing that literally (an explicit `aria-label` on the wrapper) while *also* rendering the visible `DualLabel`/value-label text as real DOM content would double up: a screen reader would announce the wrapper's `aria-label` string, then separately encounter the same label/value again as ordinary visible text underneath it (`AudioStatusBadge` has no such conflict — it renders no visible text at all, just a colored dot, so its `aria-label` is the *only* accessible content).

Resolution used in §4 below: **no explicit `aria-label`** on the read-only wrapper. `role="status"` is applied for its `aria-live="polite"` announcement behavior (so a live-updating Battery/Power value gets announced on change without needing focus), and the accessible name/description is left to resolve naturally from the wrapper's own visible text content (`DualLabel`'s human label + the value span) — which already says e.g. "Power" and "72%" as real text, exactly the information the intent doc's composed string would have contained, without a duplicate announcement. Flagged here per this skill's "surface assumptions immediately" step; confirm during Plan/Tasks if a real screen-reader pass (Roadmap 18) finds this reads wrong.

### 1.5 `disabled`/`readOnly` precedence

Not addressed during `/interview-me` (both props existing simultaneously wasn't asked about). Resolved here: `readOnly` takes precedence — when `readOnly` is `true`, the component renders the read-only branch regardless of `disabled`'s value, since the read-only branch has no Radix widget for `disabled` to apply to in the first place. `disabled` is simply ignored (not type-errored, not warned) when `readOnly` is `true`. In practice the two are never passed together by any real consumer this phase introduces.

---

## 2. Target File Structure

```text
src/
└── components/
    └── ui/controls/
        ├── SliderLinear.tsx        # MODIFIED — new `readOnly?: boolean` prop, new render branch (§4)
        ├── SliderLinear.css        # MODIFIED — one new rule (read-only wrapper cursor), see §4
        └── SliderLinear.test.tsx   # MODIFIED — new `describe('readOnly')` block, see §5
docs/
└── COMPONENT_LIBRARY.md   # MODIFIED — SliderLinear's prop-table row gains `readOnly?: boolean`;
                             #   new subsection documenting the role="status" rendering divergence
                             #   directly under "SliderLinear's Oblique Cabinetry rendering"
```

**Explicitly not touched, and why:**

- `src/components/ui/controls/SliderLog.tsx`, `SliderCenteredZero.tsx` — not requested, not part of this phase's intent (confirmed Out of scope). Both share `useVoxelTrackSlider` with `SliderLinear`, but neither gains a `readOnly` prop here.
- `src/components/ui/controls/VoxelTrack.tsx`, `useVoxelTrackSlider.ts`, `useAutoSliderOrientation.ts`, `useCabinetBoxHeight.ts`, `@/utils/voxelTrackMath.ts` — reused completely as-is; none of this sizing/fill logic is Radix-specific (§1.3), so none of it needs to change for a non-Radix render branch to use it.
- `src/types/controls.ts` (`SliderLinearSchema`) — unchanged. `readOnly` is a rendering-only prop on `SliderLinearProps`, exactly like `disabled`/`verticalHeight` already are — not part of the schema, since it's a per-render-context choice (a company bulk-edit panel doesn't stop being editable at the schema level), not a property of the parameter itself.
- Every existing `SliderLinear` consumer (`AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, `AudioSettingSection.tsx`, `PingControlsDrawer.tsx`, `Lfo.tsx`, etc.) — none pass `readOnly`, so none change behavior. Wiring an actual `readOnly` consumer (Battery on 15.2's card, Power on 15.3's detail page) is each of those items' own scope, not this one's.

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Zero behavior change when `readOnly` is omitted or `false`.** Every existing test in `SliderLinear.test.tsx` must continue passing unmodified — this phase is strictly additive to the interactive branch.
* **No Radix element rendered in the `readOnly` branch.** Not `Slider.Root` with `disabled`, not a `Slider.Root` with `pointer-events: none` — a plain `<div>` tree, so there is no `role="slider"` anywhere in the read-only output (verified by test, §5).
* **No new visual distinction between interactive and read-only fill.** Same `VoxelTrack` states/colors/box sizing — confirmed intent explicitly rules out any disabled-style desaturation (`getDisabledTraitColorStyle` or similar) for this mode.
* **`onChange` stays required in `SliderLinearProps` in all modes** — no conditional/discriminated prop type. A `readOnly` consumer passes a no-op (e.g. `() => {}`); it is simply never called by the read-only branch.
* **Full orientation support retained** (`horizontal`/`vertical`/`auto`) — the read-only branch is not restricted to horizontal-only rendering, even though its first two known consumers (15.2, 15.3) are expected to use it horizontally.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`** — this is a pure render-branch change; no new timing behavior of any kind.
* **`sc-` class-name convention preserved.** The read-only branch reuses the exact existing class names (`sc-slider-linear`, `sc-slider-linear__root`, `sc-slider-linear__track`, `sc-slider-linear__value`) with `data-orientation` set manually (mirroring what Radix would otherwise set) so every existing CSS selector in `SliderLinear.css` applies unchanged — no parallel `--readonly` class variants are needed for layout/sizing.

---

## 4. Code Style & Architecture Conventions

**`SliderLinear.tsx`** (full new shape — the shared setup from §1.3 is unchanged above this point):

```tsx
interface SliderLinearProps {
  schema: SliderLinearSchema;
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  verticalHeight?: number;
  /**
   * Roadmap 15.1: renders as a live, non-interactive value readout instead
   * of an interactive slider — role="status", no Slider.Root/Track/Thumb,
   * no drag/keyboard interaction, not a tab stop. Visually identical
   * VoxelTrack fill/colors to the interactive rendering (never desaturated
   * the way a functionally-disabled section is elsewhere in this app).
   * `onChange` is still required but is never called in this mode.
   * Takes precedence over `disabled` if both are somehow passed — see
   * docs/specs/SLIDER_LINEAR_READ_ONLY.md §1.5.
   */
  readOnly?: boolean;
}

export function SliderLinear({ schema, value, onChange, disabled, verticalHeight, readOnly }: SliderLinearProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const orientation = useAutoSliderOrientation(wrapperRef, schema.orientation);
  const isVertical = orientation === 'vertical';
  const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight);
  const states = computeVoxelBoxStates(value, schema.min, schema.max, boxCount);

  const valueLabel = (
    <span className="sc-slider-linear__value">{formatDisplayValue(value)}{schema.unit}</span>
  );

  if (readOnly) {
    return (
      <div ref={wrapperRef} className="sc-slider-linear" data-orientation={orientation} data-readonly="true" role="status">
        <DualLabel loreLabel={schema.loreLabel} humanLabel={schema.humanLabel} />
        {isVertical && valueLabel}
        <div className="sc-slider-linear__root" data-orientation={orientation} style={rootStyle}>
          <div className="sc-slider-linear__track" data-orientation={orientation}>
            <VoxelTrack
              states={states}
              boxSize={boxSize}
              gap={gap}
              axis={orientation}
              timelineKeyPrefix={`cabinet-voxel-${schema.id}`}
            />
          </div>
        </div>
        {!isVertical && valueLabel}
      </div>
    );
  }

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

Note the `data-readonly="true"` attribute on the wrapper — a plain inspection/test hook (§5), not a new styling variant; no CSS currently keys off it.

**`SliderLinear.css`** (one addition, directly under the existing `.sc-slider-linear__root` rule):

```css
.sc-slider-linear[data-readonly='true'] {
  cursor: default;
}
```

Nothing else changes — every `data-orientation`-keyed rule already in the file applies identically to the read-only branch's plain `<div>`s, since they're selected by attribute, not by element type or Radix-specific class.

* **Naming conventions:** `readOnly` (camelCase prop, matches `disabled`/`verticalHeight`'s own naming). No new file, no new component name.
* **Formatting:** Matches `SliderLinear.tsx`'s existing style exactly — plain named function export, explicit prop interface, no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library (matching the existing `SliderLinear.test.tsx` exactly, including its `MockResizeObserver` convention).
* **Test File Location:** `src/components/ui/controls/SliderLinear.test.tsx` (existing file, new `describe('readOnly')` block).
* **New tests:**
  1. Renders with `role="status"` and `data-readonly="true"` when `readOnly` is true.
  2. Renders **no** `role="slider"` element at all when `readOnly` is true (`screen.queryByRole('slider')` is null) — confirms no Radix widget leaks into this branch.
  3. Shows the formatted value + unit as visible text, identical to the interactive branch's own value-label test (`'{value}{unit}'` / bare value when `unit` is absent, both already covered for the interactive branch — mirror both cases here).
  4. Renders its own schema labels via `DualLabel`, identical to the interactive branch's existing coverage.
  5. Renders `VoxelTrack` with `states` matching `computeVoxelBoxStates` for the fitted box count — same assertion shape as the interactive branch's existing "renders VoxelTrack with states matching..." test, proving the read-only branch shares the identical fill logic.
  6. All three orientations (`horizontal`/`vertical`/`auto`) resolve and size identically to their interactive-branch counterparts — reuse the existing orientation `describe` block's assertions against a `readOnly` instance for at least the `data-orientation` propagation and the vertical/horizontal value-label ordering cases.
  7. `onChange` is never called under any interaction attempt (there's nothing to fire a Radix `onValueChange` from, so this is really an absence-of-crash/absence-of-call check — render, then assert `onChange` has zero calls with no further action needed).
  8. `disabled` has no effect when `readOnly` is also `true` — render with both `disabled` and `readOnly` set, confirm the output is identical to `readOnly` alone (no `role="slider"`, no `data-disabled` anywhere).
* **Unmodified — must still pass exactly as-is:** every existing test in the file (interactive-branch behavior, orientation handling, disabled handling, VoxelTrack states) — none of these should need updating; if any does, that's a signal the shared setup in §1.3 was accidentally changed.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every currently-passing `SliderLinear.test.tsx` case unmodified.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** Not meaningfully checkable in isolation — this phase adds no real consumer of `readOnly` yet (15.2/15.3 wire it up). Defer the visual/screen-reader manual check to whichever of those items lands first; note this explicitly in that item's own spec rather than inventing a throwaway harness here.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:**
  - The `SliderLinear` prop-table row (currently `{ schema: SliderLinearSchema; value: number; onChange: (value: number) => void; disabled?: boolean; verticalHeight?: number }`) gains `readOnly?: boolean`.
  - A new short subsection directly after "`SliderLinear`'s Oblique Cabinetry rendering (Roadmap Phase 11.1.3)" — titled something like "`SliderLinear`'s `readOnly` mode (Roadmap Phase 15.1)" — states that `readOnly` renders a plain `role="status"` readout (no Radix widget, no thumb, no interaction) rather than a disabled slider, and points at this spec for the full reasoning (§1.2, §1.4).
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/slider-linear-read-only`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `SliderLinear.tsx`/`.css` + test additions, (2) `docs/COMPONENT_LIBRARY.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, or reasoned through above — not left open):

- ~~Should `readOnly` reuse Radix's `disabled` wiring or drop widget semantics entirely?~~ **Resolved: drop widget semantics entirely** — plain `role="status"`, no `Slider.Root` (intent doc, confirmed via interview).
- ~~One component with a branch, or a separate component?~~ **Resolved: one component, `readOnly` prop, branch inside `SliderLinear.tsx`** (intent doc, confirmed).
- ~~Visual treatment — identical or muted/disabled-looking?~~ **Resolved: visually identical, no desaturation** (intent doc, confirmed).
- ~~`onChange` required or optional in read-only mode?~~ **Resolved: always required, no conditional prop types** (intent doc, confirmed).
- ~~Orientation support scope?~~ **Resolved: full support, all three orientations** (intent doc, confirmed).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **§1.4's accessible-name deviation from the intent doc's literal wording** (composed `aria-label` vs. relying on visible text + `role="status"`'s live-region behavior). This spec picks the no-`aria-label` approach for a concrete, reasoned reason (avoiding double announcement), but it wasn't itself asked about during `/interview-me`. Confirm it reads correctly once Roadmap 18 (Cabinetry Accessibility Verification) does a real screen-reader pass, or sooner if Crawford wants to check it manually once 15.2/15.3 wire up a real consumer.
2. **`disabled`+`readOnly` passed together (§1.5)** — resolved here as "`readOnly` wins, `disabled` is ignored," but this combination has no real caller today and wasn't discussed in the interview. Low risk (two-callsite feature, straightforward precedence), noted in case a future consumer trips over it.
3. **No manual visual check is possible within this phase's own scope** (§5) since it introduces no real consumer — the first real manual verification happens naturally as part of 15.2 or 15.3, whichever implements first. Not a defect in this spec, just a sequencing note so it isn't mistaken for a skipped step.
