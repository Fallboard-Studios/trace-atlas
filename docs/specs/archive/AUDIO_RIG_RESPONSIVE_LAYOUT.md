# Phase Spec: Audio Rig — Responsive Layout Rework

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/audio-rig-responsive-layout.md](../intent/audio-rig-responsive-layout.md) (confirmed via `/interview-me`, 2026-09-10). Related prior art: [docs/specs/DIRECTIONAL_PANEL.md](DIRECTIONAL_PANEL.md) and [docs/specs/DIRECTIONAL_PANEL_WIRING.md](DIRECTIONAL_PANEL_WIRING.md) (the primitive and its first Audio Rig wiring), [docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md](OBLIQUE_CABINETRY_FOUNDATION.md) §1.3/§7 (the mobile/tablet/desktop breakpoint tiers this phase reuses), [docs/specs/VERTICAL_SLIDERS.md](VERTICAL_SLIDERS.md) (the `'auto'` slider-orientation classification this phase partially reverses for `filterLPF`/`filterHPF`). This phase is layout-only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; no new `ControlSchema` variant beyond one new `PanelOrientation` literal (§4.1); every existing control's `value`/`onChange` contract is untouched.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

`AudioRigDrawer.tsx`/`audioRigConfig.ts` resolve almost every panel and slider orientation at render time via two `ResizeObserver`-driven hooks — `useAutoPanelOrientation` (measures a `DirectionalPanel`'s own parent, flips at a fixed 640px threshold) and `useAutoSliderOrientation` (measures a slider's own parent, flips on whichever axis is longer). Both were the source of a real resize/overflow bug fixed earlier this session (`DirectionalPanel.css`'s `flex-wrap`/`flex-basis` regression, plus `filterLPF`/`filterHPF` sliders being briefly set to `'auto'` to satisfy `VERTICAL_SLIDERS.md`'s classification). This phase goes further than that bugfix: it removes `'auto'` from every panel and slider *inside the Audio Rig specifically*, replacing each with either a single fixed value or a new tier-driven `'responsive'` panel orientation, keyed off the same fixed viewport-width tiers `CabinetBox` already defines (`cabinetBreakpoints.ts`: mobile ≤640px / tablet 641–1024px / desktop >1024px) — not a per-panel parent measurement.

### 1.2 The one new mechanism: `'responsive'` panel orientation

`PanelOrientation` (`src/types/controls.ts`) gains a 4th literal: `'responsive'`. Unlike `'auto'` (measures a panel's own parent, resolves independently per-instance based on however much room *that* panel happens to have), `'responsive'` reads the same *global* viewport tier every other `'responsive'` panel reads — `'column'` on mobile/tablet, `'row'` on desktop, always, for every consumer, with no per-instance threshold to tune. This is deliberately simpler than `'auto'`: every place this phase needs tier-driven switching (Transport & Composition, the flattened EQ & Filters row, the Time & Space row, Compressor's two paired sub-rows) wants the *identical* mobile/tablet-column, desktop-row mapping — no consumer needs a different tier boundary or a three-way mapping, so `'responsive'` takes no configuration beyond the literal itself.

A new hook, `useResponsivePanelOrientation()` (`src/components/ui/controls/useResponsivePanelOrientation.ts`), reads the viewport tier via `useCabinetTier()` (currently a private function in `useCabinetBoxHeight.ts` — exported for this reuse, mirroring that file's own precedent of factoring out shared tier detection for `useVoxelTrackGap`) and returns `'column'` for `'mobile'`/`'tablet'`, `'row'` for `'desktop'`. It takes no `ref` — unlike `useAutoPanelOrientation`, it observes nothing about the panel itself, only the viewport, via the same `matchMedia` listener pair `useCabinetTier()` already sets up.

`DirectionalPanel.tsx` calls both `useAutoPanelOrientation` and `useResponsivePanelOrientation` unconditionally (Rules of Hooks — the same "always call, sometimes ignore the result" shape `CabinetBox.tsx` already uses for `useCabinetBoxHeight()` when `boxHeight` is overridden), then picks whichever result applies:

```typescript
// src/components/ui/controls/DirectionalPanel.tsx — resolution shape
const autoInput = schema.orientation === 'responsive' ? 'row' : (schema.orientation ?? 'row');
const autoResolved = useAutoPanelOrientation(ref, autoInput);
const responsiveResolved = useResponsivePanelOrientation();
const orientation = schema.orientation === 'responsive' ? responsiveResolved : autoResolved;
```

Passing `'row'` as `autoInput` when the schema says `'responsive'` is deliberate, not a placeholder: `useAutoPanelOrientation` only constructs a `ResizeObserver` when its own `orientation` argument is literally `'auto'` (§ its own doc comment) — passing `'row'` short-circuits it to the cheap literal-passthrough branch, so a `'responsive'` panel never pays for an unused parent-measurement observer.

### 1.3 Slider orientation: no new mechanism, just fixed values

No slider gains tier-awareness — every slider in scope becomes one fixed `SliderOrientation` value (`'horizontal'` or `'vertical'`), never `'auto'`, and never varies by breakpoint:

| Slider(s) | File | Was | Becomes |
|---|---|---|---|
| LFO Rate/Depth (`Lfo.tsx`, every consumer) | `src/components/ui/controls/Lfo.tsx` | `'auto'` | `'horizontal'` |
| LFO Rate Drift/Depth Drift (`LFO_DRIFT_GROUPS`, all 4 groups) | `src/data/audioRigConfig.ts` | `'auto'` | `'horizontal'` |
| `filterLPF.frequency`/`.Q`, `filterHPF.frequency`/`.Q` | `src/data/audioRigConfig.ts` | `'auto'` (set earlier this session) | `'vertical'` (reverts to the pre-session value) |
| Compressor: threshold/ratio/attack/release/knee | `src/data/audioRigConfig.ts` | `'auto'` | `'horizontal'` |
| Limiter: threshold | `src/data/audioRigConfig.ts` | `'auto'` | `'horizontal'` |

EQ's Low/Mid/High sliders are **not** in this table — they stay `'vertical'`, exactly as they are today; nothing about them changes.

### 1.4 `filterLPF`/`filterHPF`'s "never stack, always row together" falls out for free

`AudioRigLfoGroup`'s existing `slidersOrientation` heuristic (`AudioRigDrawer.tsx`, unchanged by this phase) already reads: "row if any param's own schema is `orientation: 'vertical'`, column otherwise." Reverting `filterLPF`/`filterHPF`'s Frequency/Resonance to `'vertical'` (§1.3) makes this heuristic resolve to `'row'` for both automatically — **no code change to the heuristic itself is needed**, only the schema-value revert. This is the same heuristic that made `eq3`'s Low/Mid/High row-orient today; it is not being touched.

This is a deliberate reversal of `docs/tasks/DIRECTIONAL_PANEL_WIRING.md`'s own follow-up fix and the two tests it added, both changed earlier this session to make `filterLPF`/`filterHPF` `'auto'`/`'column'` per `VERTICAL_SLIDERS.md`'s classification table. Confirmed directly in the intent doc — not a silent contradiction, but it does leave stale prose in two historical phase specs (§6).

### 1.5 EQ & Filters: de-nesting the row

Today: `EQ_FILTERS_ROW_PANEL_SCHEMA` (orientation `'auto'`) wraps `eq3`'s block beside `FILTERS_COLUMN_PANEL_SCHEMA` (orientation `'row'`, always), which itself wraps `filterLPF`'s block beside `filterHPF`'s — two nesting levels for what the intent doc wants as one flat row of three. `FILTERS_COLUMN_PANEL_SCHEMA` is **removed entirely** (deleted export, deleted from `audioRigConfig.ts`, deleted from every test that asserts its shape — §5). `EQ_FILTERS_ROW_PANEL_SCHEMA` becomes the single wrapper around all three blocks directly, orientation `'responsive'`:

```tsx
// AudioRigDrawer.tsx — EQ & Filters, before/after shape
// BEFORE:
<DirectionalPanel schema={EQ_FILTERS_ROW_PANEL_SCHEMA}>
  {renderBlock('eq3')}
  <DirectionalPanel schema={FILTERS_COLUMN_PANEL_SCHEMA}>
    {renderBlock('filterLPF')}
    {renderBlock('filterHPF')}
  </DirectionalPanel>
</DirectionalPanel>

// AFTER:
<DirectionalPanel schema={EQ_FILTERS_ROW_PANEL_SCHEMA}>
  {(['eq3', 'filterLPF', 'filterHPF'] as const).map((key) => renderBlock(key, EQ_FILTERS_DESKTOP_SHARE[key]))}
</DirectionalPanel>
```

**Amendment, 2026-09-10 (post-ship — "Separate facades"):** After shipping, Crawford reported live in the
browser that the gap between eq3/filterLPF/filterHPF (and, by the same shape, Delay/Reverb and
Compressor/Limiter) didn't actually show, even after a follow-up widened `EQ_FILTERS_ROW_PANEL_SCHEMA`'s
own internal flex gap — confirmed via DevTools that the CSS was matching correctly. Root cause: wrapping
all 3 blocks in one shared `DirectionalPanel` makes each block's own inner `DirectionalPanel`
(`block.panel`) *nested*, not top-level, so per `DirectionalPanel.tsx`'s own facade rule (§1 of
`docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md`) none of the three blocks renders its own Cabinetry
facade — all three paint onto the one shared outer facade instead, so any gap between them is internal
padding on one continuous surface, not a boundary between two distinct boxes. Confirmed goal: "each
section should look like its own separate box, with a real gap between distinct boxes."

Fix: `EQ_FILTERS_ROW_PANEL_SCHEMA` (and its Time & Space / Output counterparts, §1.7/§1.8) are **removed**,
replaced by a new shared component, `PanelGroup` (`src/components/ui/controls/PanelGroup.tsx`/`.css`) — a
plain row/column flex wrapper with a fixed gap that does **not** provide `DirectionalPanel`'s own nesting
context. A `DirectionalPanel` rendered as `PanelGroup`'s child therefore stays top-level, exactly as it
would with no wrapper at all, and keeps its own independent facade:

```tsx
// AudioRigDrawer.tsx — EQ & Filters, final shape
<PanelGroup orientation="responsive">
  {(['eq3', 'filterLPF', 'filterHPF'] as const).map((key) => renderBlock(key))}
</PanelGroup>
```

The row/column-per-breakpoint *behavior* this section specifies is unchanged — only the wrapper providing
it. See `docs/tasks/AUDIO_RIG_RESPONSIVE_LAYOUT.md`'s second "Reopened" note for the full task-level
record.

### 1.6 The 40/30/30 desktop split: an inline `flexBasis` override, not a `DirectionalPanel` API change

**Amendment, 2026-09-10 (post-ship):** Crawford changed the desktop split from 40/30/30 to a straight
equal-thirds split immediately after this shipped. Since equal shares are exactly what
`DirectionalPanel.css`'s own default already gives every row child for free, the entire mechanism this
section describes — `EQ_FILTERS_DESKTOP_SHARE`, `renderBlock()`'s `desktopSharePercent` parameter, the
`useCabinetTier()` call in `AudioRigDrawer.tsx`, and the inline `flexBasis` style — was removed rather than
retuned to `33`/`33`/`33`. The rest of this section is left as a record of the mechanism that existed
between those two states, not a description of the current code.

`.sc-directional-panel__content > *` already gives every row child `flex: 1 1 0` (equal shares, content-independent — `DirectionalPanel.css`'s own documented fix for the voxel-track `ResizeObserver` feedback loop, §4.2). A percentage-basis inline style on a specific child overrides only that child's `flex-basis` component of that shorthand (inline style always wins over an external-stylesheet longhand it targets); `flex-grow`/`flex-shrink: 1` from the CSS rule are unaffected but become moot once three children's bases already sum to exactly 100% of the row, since desktop is the only tier this applies in (the row exists at all) so there is zero leftover space for a still-active `flex-grow: 1` to distribute:

```typescript
// AudioRigDrawer.tsx — desktop-only share, applied to each EQ/Filters block's
// existing outer .audio-rig-drawer__effect-block wrapper div
const EQ_FILTERS_DESKTOP_SHARE: Record<'eq3' | 'filterLPF' | 'filterHPF', number> = {
  eq3: 40,
  filterLPF: 30,
  filterHPF: 30,
};

const tier = useCabinetTier(); // AudioRigDrawer.tsx-level call, new import

function renderBlock(key: AudioRigEffectKey, desktopSharePercent?: number) {
  // ...existing body...
  const style: CSSProperties | undefined =
    desktopSharePercent !== undefined && tier === 'desktop'
      ? { flexBasis: `${desktopSharePercent}%` }
      : undefined;
  return (
    <div className="audio-rig-drawer__effect-block" key={block.key} style={style}>
      {/* ...unchanged... */}
    </div>
  );
}
```

`style={undefined}` on every other `renderBlock` call site (Delay, Reverb, Compressor, Limiter — all still called as `renderBlock(key)` with no second argument) and on mobile/tablet for EQ/Filters too — the wrapper falls back to `DirectionalPanel.css`'s own `flex: 1 1 0` default, which is irrelevant anyway once the panel is `'column'`-oriented (flex-basis governs the cross-main-axis dimension only in the direction flex actually flows; a column panel's children are naturally full-width block-level flex items regardless of `flex-basis`'s numeric value). This is the one place in this phase that reaches past `DirectionalPanel`'s own schema-driven contract — confirmed with Crawford as an acceptable "outlier," not a pattern to repeat casually (§3).

### 1.7 Time & Space: de-nesting the paired sub-rows, not the block row itself

`TIME_SPACE_COLUMN_PANEL_SCHEMA` (already a flat, single-level wrapper around the `delay`/`reverb` blocks — no change to its nesting depth) goes from fixed `'row'` to `'responsive'`. Delay's and Reverb's own `block.panel` orientation stays `'column'` (unchanged) — the actual de-nesting here is *inside* each block: the hand-composed `topRow` (`Time`+`Feedback` for Delay, `Decay`+`Pre-Delay` for Reverb) is deleted outright, and both blocks collapse into the same flat `block.params.map((param) => paramRow(param, effect, updateParam))` shape the final `else` branch already uses for every non-special-cased block:

```tsx
// AudioRigDrawer.tsx renderBlock() — delay/reverb, before/after shape
// BEFORE: a dedicated branch per key, each with its own nested topRow DirectionalPanel
// AFTER: delay/reverb no longer need their own branch at all — they fall through
// to the existing generic branch:
) : (
  block.params.map((param) => paramRow(param, effect, updateParam))
)
```

This removes the `block.key === 'delay'` and `block.key === 'reverb'` branches from `renderBlock()` entirely (§2) — Compressor's own two branches (`topRow`/`bottomRow`) stay, since Compressor keeps pairing on desktop (§1.8).

### 1.8 Output: Compressor's sub-rows become `'responsive'`, Limiter is untouched

Compressor's two inline, anonymous `DirectionalPanel` schemas (`audioRig.compressor.topRow`, `audioRig.compressor.bottomRow` — both currently hardcoded `orientation: 'row'` literals inside `AudioRigDrawer.tsx`'s `renderBlock()`) become `orientation: 'responsive'`. `AUDIO_RIG_ACCORDION_GROUPS`'s `'output'` entry itself, and Limiter's single-param flat rendering, are unaffected — Limiter's Threshold already renders as its own row today (one param, flat map) and continues to.

### 1.9 Transport & Composition

`SPEED_AUTOMATION_PANEL_SCHEMA` goes from fixed `'row'` to `'responsive'`. No other change to the Transport & Composition accordion — `SliderLinear`'s own `BPM_SCHEMA`/`PING_VARIANCE_AUTOMATION_SCHEMA` orientations are already `'horizontal'` (unaffected, not in §1.3's table because they were never `'auto'`).

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── controls.ts                       # MODIFIED — PanelOrientation gains 'responsive' (§4.1)
│   └── controls.test.ts                  # MODIFIED, if it enumerates PanelOrientation's literals exhaustively — verify during implementation (§7)
├── components/ui/controls/
│   ├── useCabinetBoxHeight.ts            # MODIFIED — useCabinetTier exported (was private)
│   ├── useResponsivePanelOrientation.ts  # NEW — the tier-driven hook (§1.2)
│   ├── useResponsivePanelOrientation.test.ts # NEW — mirrors useAutoPanelOrientation.test.ts's shape, using useCabinetBoxHeight.test.ts's stubMatchMedia pattern
│   ├── DirectionalPanel.tsx              # MODIFIED — resolves 'responsive' alongside 'auto' (§1.2)
│   ├── DirectionalPanel.test.tsx         # MODIFIED — new 'responsive' resolution assertions
│   └── Lfo.tsx                           # MODIFIED — rateSchema/depthSchema orientation: 'auto' → 'horizontal'
├── data/
│   ├── audioRigConfig.ts                 # MODIFIED — see §4.2
│   └── audioRigConfig.test.ts            # MODIFIED — see §5
└── components/panels/screen/console/
    ├── AudioRigDrawer.tsx                # MODIFIED — see §1.5–§1.9, §4.3
    ├── AudioRigDrawer.css                # MODIFIED, if any rule references the removed FILTERS_COLUMN grouping by class name — verify during implementation
    └── AudioRigDrawer.test.tsx           # MODIFIED — see §5

docs/
├── COMPONENT_LIBRARY.md                  # MODIFIED — "Panel orientation" subsection gains a short note on the new 'responsive' literal (§6)
├── specs/VERTICAL_SLIDERS.md             # MODIFIED — short amendment note only, table left as historical record (§6)
└── tasks/DIRECTIONAL_PANEL_WIRING.md     # MODIFIED — short amendment note only (§6)
```

**Explicitly not touched, and why:**

- `src/utils/cabinetBreakpoints.ts`, `cabinetGeometry.ts` — the tier constants themselves are reused verbatim, not redefined.
- `useAutoPanelOrientation.ts`/`.test.ts`, `useAutoSliderOrientation.ts`/`.test.ts` — neither hook's own behavior changes; they simply stop being *reached* by Audio Rig schemas (§3). Robot Options still uses both.
- `src/data/robotOptionsConfig.ts` and every Robot Options drawer (`PingControlsDrawer.tsx`, `PingContourDrawer.tsx`, `SignatureArrayDrawer.tsx`, `AudioSettingSection.tsx`) — explicitly out of scope per the intent doc.
- `src/engine/`, `src/stores/`, `src/systems/` — no behavior, state-shape, or wiring change. Every `onChange`/action call stays exactly as it is; only orientation/layout changes.
- `src/animation/timelineMap.ts` — no new timeline; this phase is pure CSS/orientation, no GSAP involvement.
- `VoxelTrack.tsx`, `useVoxelTrackSlider.ts`, `useVoxelTrackBoxCount.ts`, `CabinetBox.tsx` — no change; sliders keep rendering through the exact same voxel-track machinery, just with a different (now-fixed, never `'auto'`) `orientation` value flowing into `useAutoSliderOrientation`'s literal-passthrough branch instead of its measurement branch.

No new dependency.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No behavior change beyond layout/orientation.** Every slider's min/max/step/unit, every handler, every `setGlobalAudio`/`setGlobalLfo`/`setBPM`/etc. call stays exactly as-is.
* **`useAutoSliderOrientation`/`useAutoPanelOrientation` are not modified, deprecated, or removed.** Per the intent doc's Constraint — Robot Options still depends on both for its own, separate, future conversion. Do not "clean up" either hook as unused; they are used, just not by Audio Rig after this phase.
* **The `flexBasis` inline-style override (§1.6) is the one deliberate departure from "everything through `DirectionalPanel`'s own schema contract."** Confirmed with Crawford as an acceptable outlier for percentage-width shares, which nothing in `DirectionalPanel.css` supports today (every row child gets an equal `flex: 1 1 0` share, by design, to avoid the voxel-track `ResizeObserver` feedback loop `DirectionalPanel.css`'s own comments document). Do not generalize this into a new `DirectionalPanelSchema` field (e.g. a `shares`/`weights` array) as part of this phase — if a second consumer needs unequal shares later, that's a new, separately-scoped decision, not an extension to make speculatively here.
* **De-nesting is the default, not an afterthought.** Per the intent doc's general principle: prefer flattening a `DirectionalPanel` structure over preserving intermediate grouping panels whenever the new layout no longer needs them (EQ & Filters' `FILTERS_COLUMN_PANEL_SCHEMA` removal, Delay/Reverb's `topRow` removal). Do not introduce a *new* nesting layer to solve a problem this phase's own layout doesn't strictly require one for.
* **Compressor's paired sub-rows are the one place pairing survives** — confirmed scoped to desktop only (`'responsive'`, not flattened to always-one-per-row like Delay/Reverb). Do not flatten Compressor's `topRow`/`bottomRow` to match Delay/Reverb's treatment; that was explicitly *not* what was confirmed.
* **EQ's Low/Mid/High sliders and `eq3`'s own block-level row orientation are untouched.** Nothing in §1 changes how `eq3`'s own three sliders lay out relative to each other — only its position relative to `filterLPF`/`filterHPF` as sibling blocks changes.
* **`filterLPF`/`filterHPF`'s own `block.panel` orientation (currently `'row'`, wrapping a single `AudioRigLfoGroup` child) is left as-is.** Its value is inert today (a `'row'`-vs-`'column'` `DirectionalPanel` wrapping exactly one child renders identically either way) and touching it is out of scope for this phase — flagged, not acted on (§7).
* **No `DirectionalPanel`/`AccordionContainer` prop-contract change** beyond the new `PanelOrientation` schema literal itself (`'responsive'`) — neither component's `{ schema, children }` shape changes.
* **CLAUDE.md's audio/animation rules are not implicated.** No `Tone` synth, no `AudioEngine` call, no new GSAP timeline, no `setTimeout`/`setInterval`/`requestAnimationFrame`. `useResponsivePanelOrientation`'s `matchMedia` listener is not a timer — same category as `useCabinetTier`'s own existing listener, already accepted precedent.

---

## 4. Code Style & Architecture Conventions

### 4.1 `src/types/controls.ts`

```typescript
// was: export type PanelOrientation = 'row' | 'column' | 'auto';
export type PanelOrientation = 'row' | 'column' | 'auto' | 'responsive';
```

Doc comment above the type gets one added sentence distinguishing `'auto'` (per-instance parent measurement) from `'responsive'` (global viewport tier, no measurement) — matching the file's existing per-literal doc-comment density (`SliderOrientation`'s own three-way doc comment is the model).

### 4.2 `src/data/audioRigConfig.ts`

Existing helper-function style (`panelSchema()`, `accordionSchema()`, `driftGroupSchema()`) is preserved — no new helper needed, since `'responsive'` is just another literal passed to the same call sites:

- `SPEED_AUTOMATION_PANEL_SCHEMA.orientation`: `'row'` → `'responsive'`.
- `TIME_SPACE_COLUMN_PANEL_SCHEMA.orientation`: `'row'` → `'responsive'`.
- `EQ_FILTERS_ROW_PANEL_SCHEMA.orientation`: `'auto'` → `'responsive'`.
- **Remove** `FILTERS_COLUMN_PANEL_SCHEMA` entirely — no remaining consumer after §1.5.
- `filterLPF.frequency`/`.Q`, `filterHPF.frequency`/`.Q` schemas: `orientation: 'auto'` → `orientation: 'vertical'`.
- Compressor param schemas (`threshold`, `ratio`, `attack`, `release`, `knee`) and Limiter's `threshold`: `orientation: 'auto'` → `orientation: 'horizontal'`.
- `LFO_DRIFT_GROUPS`' `driftGroupSchema()`-produced `rateSchema`/`depthSchema`, all 4 groups (`eq3`, `filterLPF`, `filterHPF`, `robots`): `orientation: 'auto'` → `orientation: 'horizontal'`. This likely means adding an `orientation` parameter to `driftGroupSchema()`'s own construction (currently hardcodes `'auto'` inline per its own comment) or simply hardcoding `'horizontal'` in the same spot — whichever keeps the function's existing signature stable is preferred; verify against the function's current shape during implementation before choosing.
- **Add** `EQ_FILTERS_DESKTOP_SHARE: Record<'eq3' | 'filterLPF' | 'filterHPF', number>` (§1.6) — a plain exported const, `{ eq3: 40, filterLPF: 30, filterHPF: 30 }`, adjacent to `EQ_FILTERS_ROW_PANEL_SCHEMA`.

### 4.3 `src/components/panels/screen/console/AudioRigDrawer.tsx`

- Import `useCabinetTier` from `useCabinetBoxHeight.ts` and `EQ_FILTERS_DESKTOP_SHARE` from `audioRigConfig.ts`.
- `renderBlock()` gains an optional second parameter, `desktopSharePercent?: number` (§1.6) — every existing call site except the three EQ & Filters ones (`renderBlock('eq3', EQ_FILTERS_DESKTOP_SHARE.eq3)`, etc.) stays a single-argument call.
- Compressor's two inline `DirectionalPanel` schemas: `orientation: 'row'` → `orientation: 'responsive'` (both, literal object changes in place — no extraction into `audioRigConfig.ts` needed, matching their existing "inline, anonymous, drawer-local" style).
- Delete the `block.key === 'delay'` and `block.key === 'reverb'` branches from `renderBlock()`'s conditional (§1.7) — both fall through to the existing final `else` branch.
- EQ & Filters render call: replace the two-level nested JSX with the flattened `.map()` shown in §1.5.

### 4.4 `src/components/ui/controls/useResponsivePanelOrientation.ts` (new file)

Matches `useAutoPanelOrientation.ts`'s doc-comment density and export shape:

```typescript
import { useCabinetTier } from './useCabinetBoxHeight';

export type ResolvedPanelOrientation = 'row' | 'column';

/**
 * Resolves the global viewport tier (mobile/tablet/desktop — cabinetBreakpoints.ts,
 * the same tiers CabinetBox sizing already uses) to a concrete 'row' | 'column' for
 * DirectionalPanel's 'responsive' orientation. Unlike useAutoPanelOrientation's 'auto'
 * (which measures one panel's own parent and can resolve differently per instance),
 * every 'responsive' panel reads the same tier and resolves identically: 'column' on
 * mobile/tablet, 'row' on desktop. No ref, no ResizeObserver — this only reads
 * useCabinetTier()'s existing matchMedia listener pair.
 */
export function useResponsivePanelOrientation(): ResolvedPanelOrientation {
  const tier = useCabinetTier();
  return tier === 'desktop' ? 'row' : 'column';
}
```

### 4.5 Naming conventions

- `EQ_FILTERS_DESKTOP_SHARE`: `SCREAMING_SNAKE_CASE`, matching every existing config constant in `audioRigConfig.ts`.
- `useResponsivePanelOrientation`: `useX` hook naming, matching `useAutoPanelOrientation`/`useAutoSliderOrientation`/`useCabinetTier` exactly.
- **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing (the same discipline the `flex-wrap`/`flex-basis` regression earlier this session shows the cost of violating).

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, colocated test files.
* **New test file:** `useResponsivePanelOrientation.test.ts` — mirrors `useAutoPanelOrientation.test.ts`'s hook-testing shape, but stubs `window.matchMedia` the way `useCabinetBoxHeight.test.ts` already does (mobile/tablet query control + `fireChange`), not a mock `ResizeObserver`. Coverage: resolves `'column'` when mobile matches, `'column'` when tablet matches, `'row'` when neither matches (desktop), and re-resolves on a `matchMedia` `'change'` event without remount.
* **`DirectionalPanel.test.tsx`:** add assertions that `schema.orientation: 'responsive'` renders `data-orientation` matching `useResponsivePanelOrientation`'s current resolution (mock/stub the same way), and that `'row'`/`'column'`/`'auto'` literal behavior is completely unaffected by the new branch (regression coverage — the `autoInput` sanitization in §1.2 is the one piece of new logic actually touching the pre-existing `'auto'` path).
* **`controls.test.ts`:** verify whether this file enumerates `PanelOrientation`'s literals exhaustively (the way `CONTROL_SCHEMA_TYPES` does for `ControlSchema` discriminants) — if so, add `'responsive'`; if `PanelOrientation` isn't independently enumerated there, no change needed. Check before assuming either way.
* **`audioRigConfig.test.ts`:**
  - Rename/rewrite "Low-Pass/High-Pass Filter (Frequency/Resonance) is auto" to assert `'vertical'` instead (the test that was changed to `'auto'` earlier this session gets reverted, with an updated name).
  - Rewrite the Compressor "is auto" and Limiter "is auto" tests to assert `'horizontal'`.
  - Rewrite the "all 4 `LFO_DRIFT_GROUPS`... are auto" test to assert `'horizontal'`.
  - Rewrite `SPEED_AUTOMATION_PANEL_SCHEMA`'s "is a row-orientation directionalPanel" test to assert `'responsive'`.
  - Delete every test in the `EQ_FILTERS_ROW_PANEL_SCHEMA / FILTERS_COLUMN_PANEL_SCHEMA` describe block that asserts `FILTERS_COLUMN_PANEL_SCHEMA`'s own shape (the export no longer exists); rewrite `EQ_FILTERS_ROW_PANEL_SCHEMA`'s own "is an auto-orientation directionalPanel" test to assert `'responsive'`.
  - Verify the existing "`eq3`/`filterLPF`/`filterHPF` are row-orientation panels — delay/reverb/compressor/limiter are column" test (block-level `panel.orientation`) still passes unmodified — no `block.panel` orientation value changes in this phase, only what's nested inside/beside each block.
  - Add a test for the new `EQ_FILTERS_DESKTOP_SHARE` constant's shape (`{ eq3: 40, filterLPF: 30, filterHPF: 30 }`, sums to 100).
* **`AudioRigDrawer.test.tsx`:**
  - Rewrite the "3-Band EQ's own sliders render in a row-orientation panel — ...`filterLPF`/`filterHPF`... are column" test: all three groups' own `${groupId}.sliders` panel now resolve `'row'` (the heuristic reversal, §1.4) — update both the assertion and the test's own title, which currently asserts the opposite.
  - Add assertions that the EQ & Filters accordion's content is a single flat `DirectionalPanel` containing `eq3`/`filterLPF`/`filterHPF`'s effect-blocks directly as siblings — no intermediate `FILTERS_COLUMN_PANEL_SCHEMA`-shaped wrapper in the DOM.
  - Add assertions (stubbing `matchMedia` for the desktop tier) that `eq3`/`filterLPF`/`filterHPF`'s effect-block wrapper divs carry `style.flexBasis` of `'40%'`/`'30%'`/`'30%'` respectively at desktop, and no inline `flexBasis` (or an unset one) at mobile/tablet.
  - Remove/rewrite any existing assertion of Delay's/Reverb's `topRow` nested `DirectionalPanel` (Time+Feedback / Decay+Pre-Delay sharing a row) — replace with an assertion that every one of Delay's/Reverb's params renders as its own direct `.audio-rig-drawer__param-row` inside the block's own panel, with no intermediate row wrapper, at every tier.
  - Add/verify assertions that Compressor's `topRow`/`bottomRow` resolve `'row'` at desktop and `'column'` at mobile/tablet (stubbed `matchMedia`), while Limiter's single param is unaffected.
* **Verification Steps** (re-run in full after every task, not just the touched file's own suite — this phase touches enough shared config that a change in one file can silently break another's assumptions, same lesson as `DIRECTIONAL_PANEL_WIRING.md`'s own §5):
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (required):** Open `AudioRigDrawer` in the running app at mobile (~375px), tablet (~800px), and desktop (~1280px+) widths, and drag the window across each of the 640px/1024px thresholds live. Confirm: Transport & Composition is 2 rows below 1024px, 1 row above; EQ/LPF/HPF stack one-per-row below 1024px and share one row (visually ~40/30/30) above; LPF's and HPF's own Frequency/Resonance sliders are vertical and side-by-side at every width, never stacked; Delay and Reverb stack below 1024px, sit side-by-side above, and every one of their own sliders is always its own full-width row; Compressor's Threshold/Ratio and Attack/Release pairs are one-per-row below 1024px and paired above; nothing overflows horizontally at any width in between the tiers (the original bug report).

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md`:** add one short line to the existing "Panel orientation (`PanelOrientation`)" subsection introducing `'responsive'` alongside `'auto'`/`'row'`/`'column'`, pointing at this spec.
* **`docs/specs/VERTICAL_SLIDERS.md`:** the classification table's `filterLPF`/`filterHPF` row (currently `'auto'`) is now stale — add a short dated amendment note pointing at this spec rather than rewriting the historical table itself (the same "record what was decided, then note what superseded it" convention `docs/CONSOLE_THEMING.md` uses for its own cut Phase 11 section).
* **`docs/tasks/DIRECTIONAL_PANEL_WIRING.md`:** same treatment — a short amendment note near the follow-up fix's own description of `filterLPF`/`filterHPF` resolving to `'column'`.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Not yet opened as of this spec — suggest `feature/audio-rig-responsive-layout` or continuing on `bug/resize-issues` if that branch is still active from this session's earlier fix.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable:
  1. `types/controls.ts` — add `'responsive'` to `PanelOrientation`.
  2. `useCabinetBoxHeight.ts` (export `useCabinetTier`) + new `useResponsivePanelOrientation.ts`/`.test.ts`.
  3. `DirectionalPanel.tsx`/`.test.ts` — wire in `'responsive'` resolution.
  4. `audioRigConfig.ts`/`.test.ts` — schema value changes (§4.2), `FILTERS_COLUMN_PANEL_SCHEMA` removal, `EQ_FILTERS_DESKTOP_SHARE` addition.
  5. `Lfo.tsx` — Rate/Depth fixed horizontal.
  6. `AudioRigDrawer.tsx`/`.test.tsx` — EQ & Filters flattening + desktop shares, Delay/Reverb de-nesting, Compressor responsive sub-rows.
  7. Docs sync (`COMPONENT_LIBRARY.md`, `VERTICAL_SLIDERS.md`, `DIRECTIONAL_PANEL_WIRING.md` amendment notes).

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed against the intent doc, not left open):

- ~~Tier-based or parent-measured ('auto')?~~ **Resolved: fixed viewport tiers, a new `'responsive'` `PanelOrientation` literal** (interview, confirmed).
- ~~Does `'auto'` get removed from the codebase?~~ **Resolved: no — stays for Robot Options' own future conversion** (interview, confirmed).
- ~~How does the EQ 40/30/30 split get built?~~ **Resolved: an inline `flexBasis` override at the call site, applied only at the desktop tier** — the one confirmed exception to "everything through `DirectionalPanel`'s schema contract" (§1.6, §3).
- ~~Nested or flattened EQ/LPF/HPF structure?~~ **Resolved: flattened — `FILTERS_COLUMN_PANEL_SCHEMA` removed** (interview, confirmed).
- ~~Does "each slider own row" for Delay/Reverb apply at every breakpoint, or just mobile/tablet?~~ **Resolved: every breakpoint — the paired `topRow` is deleted, not just collapsed on narrow widths** (interview, confirmed). Delay and Reverb themselves (as blocks) still go side-by-side on desktop.
- ~~Does Compressor's pairing survive on desktop?~~ **Resolved: yes — Output is scoped to "mobile and tablet" only, unlike Time & Space's unscoped rule** (interview, confirmed).
- ~~Does the general LFO-slider rule reach EQ's Low/Mid/High or the Filters' Frequency/Resonance?~~ **Resolved: no — those are modulation targets with their own separate rules, not "LFO sliders"** (interview, confirmed).
- ~~Compressor/Limiter's fixed slider orientation?~~ **Resolved: horizontal** (interview, confirmed — unaddressed by the original instructions, closed during interview).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **`driftGroupSchema()`'s exact signature change (§4.2)** for moving `rateSchema`/`depthSchema` off a hardcoded `'auto'` — whether it takes a new parameter or just hardcodes `'horizontal'` inline depends on the function's current shape, which should be read directly during implementation rather than guessed here.
2. **Whether `controls.test.ts` exhaustively enumerates `PanelOrientation`'s literals** (§5) needs a direct check, not an assumption — this spec was written by reading `types/controls.ts`'s type definition, not by running the test suite against the proposed change.
3. **Whether `AudioRigDrawer.css` references the removed `FILTERS_COLUMN_PANEL_SCHEMA` grouping by a class name tied to its old nesting depth** (§2) — verify during implementation; if the CSS only targets `.audio-rig-drawer__effect-block`/`.audio-rig-drawer__param-row` (as the rest of this spec assumes), no change is needed there at all.
4. **`filterLPF`/`filterHPF`'s own `block.panel` orientation being inert (`'row'` wrapping a single child)** is a pre-existing structural redundancy, not introduced by this phase — flagged (§3) but deliberately not touched, since neither the intent doc nor the interview examined it and it isn't a visible bug.
5. **EQ's own Low/Mid/High row (inside `eq3`, unaffected by this phase) may itself be tight at mobile widths** now that it sits as a standalone flattened sibling rather than nested beside the filters — this wasn't raised in the interview and isn't in scope here, but worth a glance during the manual check (§5) in case it surfaces a genuinely new overflow case distinct from the one this phase fixes.
