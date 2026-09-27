# Phase Spec: Header & Hub Consolidation + Temperature

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/header-hub-consolidation.md](../intent/header-hub-consolidation.md) (confirmed via `/interview-me`, 2026-09-11). Not part of the roadmap. Prior art reused directly: `audioStore.volume`/`setVolume`/`isMuted`/`setMuted` (already shipped — [GLOBAL_VOLUME_CONTROL.md](GLOBAL_VOLUME_CONTROL.md)), `AttenuationStyleView.tsx`'s existing 1s tick/`computeLocaleHour` pattern, `getSeededVal`/`getLocaleNoiseMap` (`localeBpmSeed.ts`'s single-value-per-locale shape is the direct template for temperature), `CabinetBox`'s existing override-prop pattern (`boxHeight`/`frontWidth`/`frontHeight`), `RadioButton`/`Toggle` (roadmap 11.1.2/11.1.6), and `useVoxelTrackBoxCount`'s `ResizeObserver`-driven self-fit shape (the direct template for the new header row-merge hook).

---

## 1. Overview & Claude Explanation

`TransportBar.tsx` is deleted and replaced by a new `Header.tsx` — a 3-row, always-visible header living in the same slot inside `ScreenViewport`'s `.screen-content`. `HubNav.tsx` (the tile grid) is deleted outright; its 3 navigation targets move into Header's row 3 as a `RadioButton` group bound directly to `uiStore.activeHubTile`. `ConsolePanel.tsx`'s `activeHubTile === null` branch renders nothing — no tile grid, no back button, just `WorldView`'s robots showing through the now-empty `Console`. A new pure function, `computeLocaleTemperature`, seeds row 2's temperature readout the same way `generateLocaleBpm` already seeds BPM, but continuously (offset = the live in-world hour) rather than once per locale.

Two changes go beyond straightforward relocation and are the real engineering substance of this spec: **(1)** the power-switch deadzone clearance that `Console.css` computes via the fixed `--power-corner-height` constant no longer safely covers the header, because a 3-row header is very likely taller than the 100px corner it used to hide under (§1.6) — this needs a real fix, not a copy-paste of the old value. **(2)** neither `Toggle` nor `RadioButton` currently exposes a way to force an exact box size — `Toggle` is hardcoded to 32×32px, `RadioButton`'s per-option boxes follow the viewport-tiered 32/40/48px `useCabinetBoxHeight()` default — but the confirmed intent's self-fit threshold is a literal 44×44px, which matches neither (§1.4).

### 1.1 What's reused vs. what's new

Reused, unchanged: `CabinetBox` itself (no changes to its own geometry/animation logic — only new callers passing its existing `boxHeight`/`frontWidth`/`frontHeight` override props), `audioStore.volume`/`setVolume`/`isMuted`/`setMuted` (Header's slider/mute wiring is a straight port of `TransportBar.tsx`'s existing `handleVolumeChange`/`handleMuteClick`), `getSeededVal`/`getLocaleNoiseMap`, `computeLocaleHour`/`DAY_DURATION_MS`, `uiStore.activeHubTile`/`setActiveHubTile`/`selectedRobotId`/`selectRobot` (no store shape changes), `SectorSettingsDrawer`/`AudioRigDrawer`/`RobotsTab`/`RobotOptionsTab` (untouched — still reached via `ConsolePanel.tsx`'s existing `TILE_CONTENT` map).

New: `Header.tsx`/`.css` (+ test), `useHeaderRowFit.ts` (the row-merge self-fit hook, §1.5), `src/utils/localeTemperature.ts` (+ test), `src/data/headerNavConfig.ts` (replaces `hubNavConfig.ts`), an optional `boxSize` override prop on both `Toggle.tsx` and `RadioButton.tsx` (§1.4), and a `--header-height` custom property written by `Header.tsx` and read by `Console.css` (§1.6).

Removed: `TransportBar.tsx`/`.css`/`.test.tsx`, `HubNav.tsx`/`.css`/`.test.tsx`, `src/data/hubNavConfig.ts`, `HubNavItem` (`src/types/hub.ts`), `Console.css`'s `.console--grid`/pointer-events dance (§1.7), the Attenuation-Style-name/coordinates/BPM readouts.

### 1.2 Row 1 — Volume

A direct relocation of `TransportBar.tsx`'s existing bare `@radix-ui/react-slider` block (`min={0} max={1} step={0.01}`, bound to `audioStore.volume`/`setVolume`, `disabled={!isPoweredOn}`) into `Header.tsx`'s own first row, stretching to fill the row after the deadzone offset (§1.6's horizontal clearance, carried forward unchanged in mechanism). **No behavior change** — same store fields, same taper, same disabled condition. Label CSS polish is explicitly out of scope (confirmed intent) — the slider keeps its current label-less, icon-adjacent-free presentation for this pass.

### 1.3 Row 2 — Time + Temperature

A short, non-merging row (§1.5) rendering `HH:MM -XX°C`. Time is `TransportBar.tsx`'s existing `hh`/`mm` computation (`activeLocaleLocalTime`, clamped/padded), carried over unchanged.

**Temperature** is new. `src/utils/localeTemperature.ts`:

```typescript
import { getLocaleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';

/** Purely decorative — no gameplay/audio effect, read by nothing else.
 *  docs/intent/header-hub-consolidation.md. */
export const LOCALE_TEMPERATURE_RANGE = { min: -120, max: -30 };

/**
 * Seeded, continuously-drifting decorative temperature (°C) for a locale.
 * Mirrors generateLocaleBpm's shape (localeBpmSeed.ts) but samples at the
 * LIVE in-world hour (a continuous float, 0-24, from computeLocaleHour) as
 * the noise offset instead of a fixed 0 — BPM is one static value per
 * locale; temperature drifts continuously because simplex noise is
 * continuous along the axis it's sampled on. Rounded to the nearest whole
 * degree for display. A pure function — never stored on the Locale object,
 * called fresh on every tick (AttenuationStyleView.tsx).
 */
export function computeLocaleTemperature(localeId: string, x: number, y: number, hour: number): number {
  const noiseMap = getLocaleNoiseMap(localeId, x, y);
  const raw = getSeededVal(noiseMap, 'locale.temperature', hour, LOCALE_TEMPERATURE_RANGE.min, LOCALE_TEMPERATURE_RANGE.max);
  return Math.round(raw);
}
```

`AttenuationStyleView.tsx`'s existing 1s `tick()` (its `useEffect`, currently computing `hour` and calling `setActiveLocaleLocalTime(hour)`) gains one more line: read the current locale's `coordinates` (already fetched via `useLocaleStore.getState().locales[localeId]`, same object `dayStartTimestamp` already comes from) and call `useUIStore.getState().setActiveLocaleTemperature(computeLocaleTemperature(localeId, coordinates.x, coordinates.y, hour))`. `uiStore` gains a plain `activeLocaleTemperature: number | null` field + `setActiveLocaleTemperature` setter — same shape and placement as `activeLocaleLocalTime` immediately above it, same "plain number, no persistence" convention.

`Header.tsx` reads `activeLocaleTemperature` and renders `−XX°C` (always negative per the confirmed [-120, -30] range, so no explicit sign-formatting branch is needed — `${temp}°C` on an already-negative integer is correct as-is).

### 1.4 Row 3 — Four buttons, and the 44×44 box-size override

**Mute** becomes a `Toggle` (`ToggleSchema { id: 'headerMute', humanLabel: 'Mute' }`), `value={isMuted}`, `onChange={(v) => useAudioStore.getState().setMuted(v)}`. Its own `DualLabel` (rendered by `Toggle.tsx` next to the switch, per `humanLabel`) is visible today for every other `Toggle` consumer, but a "Mute" text label sitting next to the switch doesn't match this row's icon-first, `Button`-face-carries-its-own-label style the other 3 buttons use — **resolved by omitting `humanLabel`/`loreLabel` from the schema entirely** (`DualLabel` renders `null` when both are absent — `DualLabel.tsx`), accepting `resolveAccessibleName`'s fallback to `schema.id` (`'headerMute'`) as the switch's `aria-label`. Flagged in §7 — a real if minor a11y-label quality trade-off, not silently made.

**Robots / Audio Rig / Sector Settings** become one `RadioButton` group. `src/data/headerNavConfig.ts` (replaces `src/data/hubNavConfig.ts`):

```typescript
import type { RadioButtonSchema } from '@/types/controls';

/** Header row 3's nav group (docs/intent/header-hub-consolidation.md).
 *  option.value IS the HubTile string directly — no separate target field
 *  (unlike the old HubNavItem/HUB_NAV_ITEMS this replaces), since
 *  RadioButton's value/onChange already round-trips through activeHubTile
 *  one-for-one. */
export const HEADER_NAV_SCHEMA: RadioButtonSchema = {
  id: 'headerHubNav',
  options: [
    { value: 'robots', label: 'Robots' },
    { value: 'audioRig', label: 'Audio Rig' },
    { value: 'settings', label: 'Sector Settings' },
  ],
};
```

No `loreLabel`/`humanLabel` on the schema either, for the same reason as Mute (no group heading above the 3 boxes, matching today's plain tile grid's lack of one) — same `resolveAccessibleName` id-fallback trade-off, same §7 flag. This also means each option shows only its `label` on the box face — `HUB_NAV_ITEMS`' old per-tile `loreLabel` flavor text (`'UNIT ROSTER'`, `'SIGNAL CHAIN'`, `'SECTOR CONTROL'`) is dropped, since `RadioButtonSchema.options` entries are `{ value, label }` only (no lore/human split per option, unlike `Button`'s schema-level pair) — extending that shared type for one consumer wasn't judged worth the ripple into every other `RadioButton` (§7).

`Header.tsx`'s wiring:

```typescript
const activeHubTile = useUIStore((s) => s.activeHubTile);
const selectedRobotId = useUIStore((s) => s.selectedRobotId);

const handleNavChange = (next: string) => {
  const tile = (next || null) as HubTile | null;
  useUIStore.getState().setActiveHubTile(tile);
  // Selecting robots fresh while deep in a robot's detail screen drops to
  // the list, matching the interview's confirmed behavior — RadioButton's
  // deselect-to-empty guard (next === '') already handles "re-click the
  // active option → blank" for free; this only needs to additionally clear
  // selectedRobotId whenever 'robots' is (re-)selected, so a detail-view
  // click lands on the list rather than being a no-op re-selection of an
  // already-'robots' activeHubTile.
  if (tile === 'robots') useUIStore.getState().selectRobot(null);
};

<RadioButton schema={HEADER_NAV_SCHEMA} value={activeHubTile ?? ''} onChange={handleNavChange} boxSize={TOUCH_TARGET_SIZE} />
```

**The 44×44 box-size override.** Neither primitive can produce an exact 44px box today: `Toggle`'s `CABINET_TOGGLE_BOX_SIZE` is a hardcoded `32`; `RadioButton`'s per-option `CabinetBox` calls pass no size overrides at all, falling through to `useCabinetBoxHeight()`'s tiered 32/40/48px. Both gain a new optional `boxSize?: number` prop, threaded to `CabinetBox`'s existing override props — additive, zero behavior change for every other consumer that omits it:

```typescript
// Toggle.tsx
interface ToggleProps {
  schema: ToggleSchema;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /** Optional fixed box size overriding CABINET_TOGGLE_BOX_SIZE (32px).
   *  Header's Mute instance passes touch-target-size (44) so the header's
   *  row-fit math (useHeaderRowFit) can assume an exact, literal 44px per
   *  button — docs/specs/HEADER_HUB_CONSOLIDATION.md §1.4. */
  boxSize?: number;
}
// ...
<CabinetBox popped={value} boxHeight={boxSize ?? CABINET_TOGGLE_BOX_SIZE} timelineKey={`cabinet-toggle-${schema.id}`} />
```

```typescript
// RadioButton.tsx
interface RadioButtonProps {
  schema: RadioButtonSchema;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Optional fixed square size for every option's CabinetBox, overriding
   *  the responsive useCabinetBoxHeight() tier RadioButton otherwise
   *  inherits by omitting boxHeight/frontWidth/frontHeight entirely. Every
   *  existing consumer (Audio Setting, Decay Mode, per-layer Type,
   *  CompanyButtonRow, ...) omits this and is unaffected.
   *  docs/specs/HEADER_HUB_CONSOLIDATION.md §1.4. */
  boxSize?: number;
}
// ...
<CabinetBox
  popped={...}
  timelineKey={...}
  {...(boxSize !== undefined ? { boxHeight: boxSize, frontWidth: boxSize, frontHeight: boxSize } : {})}
>
  {option.label}
</CabinetBox>
```

`TOUCH_TARGET_SIZE` (44) is read from the existing `--touch-target-size` CSS custom property's own numeric source of truth — there isn't currently a JS-side constant for it (`--touch-target-size: 44px` lives only in `src/index.css`). This spec adds one small shared constant (`src/utils/constants.ts` or colocated in `Header.tsx` — Plan to decide) rather than hardcoding the literal `44` twice (once for the prop, once for `useHeaderRowFit`'s own box-size assumption, §1.5) or parsing the CSS variable at runtime.

### 1.5 Responsive: `useHeaderRowFit`, and row 2's exemption

New hook, `src/components/panels/screen/useHeaderRowFit.ts`, directly mirroring `useVoxelTrackBoxCount`'s `ResizeObserver`-on-a-ref shape but answering a boolean ("does the merged row fit?") instead of a count:

```typescript
import { useEffect, useRef, useState } from 'react';

/**
 * True once the header's available width can fit `buttonCount` buttons at
 * `boxSize`px each (plus `gap` between them) — the threshold for merging
 * row 1 (volume) and row 3 (buttons) into one inline row. Ref target is the
 * header's own top-level wrapper (its width is externally determined by its
 * containing block, never inflated by its own content — same non-circular
 * reasoning useVoxelTrackBoxCount's horizontal case already documents).
 * docs/intent/header-hub-consolidation.md.
 */
export function useHeaderRowFit(
  ref: React.RefObject<HTMLElement | null>,
  buttonCount: number,
  boxSize: number,
  gap: number,
): boolean {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => setWidth(entries[0].contentRect.width));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  const buttonsRowMinWidth = buttonCount * boxSize + (buttonCount - 1) * gap;
  // Volume needs *some* room too, not just the buttons — a fixed minimum
  // reserve (not itself user-configurable in this pass) keeps the slider
  // from being crushed to 0 the instant the buttons alone technically fit.
  // Exact reserve value left to Plan/Implement (§7) — flagged, not a design
  // gap in the mechanism itself.
  return width >= buttonsRowMinWidth + MIN_VOLUME_RESERVE_PX;
}
```

`Header.tsx` uses the returned boolean to toggle a modifier class (e.g. `header--inline`) that CSS keys off to lay rows 1 and 3 side-by-side instead of stacked. **Row 2 (time+temp) never participates** — it stays its own row, own markup position, in both layouts (confirmed intent), so this hook is never consulted for row 2's own layout at all.

### 1.6 The deadzone: horizontal (unchanged mechanism) and vertical (the real fix)

**Horizontal** — `padding-left: var(--sleeve-bar-width)` moves from `.screen-content .transport-bar` to `.screen-content .header` (whatever `Header.tsx`'s root class ends up being), applied once on the whole 3-row wrapper rather than per-row — the same "one clearance value for the whole obstacle-adjacent element, even where a lower row technically doesn't overlap the corner" simplification `Console.css`'s own comment already uses for its vertical clearance (§ below). Low risk, unchanged mechanism, just a wider element inheriting it (confirmed default from the interview's Q&A, restated in the intent doc's "Known implementation notes").

**Vertical — the part that actually needs new work.** `Console.css`'s `.console { margin-top: var(--power-corner-height); }` (100px, `:root` in `index.css`) is not derived from the header's real height — it's a static constant that happens to safely clear `TransportBar.tsx`'s one-row, 48px (`--transport-height`) layout today, per that rule's own comment ("Using the taller of the two... for the whole width is a deliberate simplicity trade-off"). **A 3-row header is very likely taller than 100px** (row 1/3 at `--touch-target-size` 44px each, plus row 2, plus inter-row gaps, easily 120–160px depending on breakpoint) — if `Console`'s `margin-top` isn't updated, `Console`'s content (every drawer/tab) starts rendering underneath the header's own lower rows, exactly the "something gets hidden" failure the confirmed intent explicitly called out to avoid.

Fix: `Header.tsx` measures its own real rendered height (another `ResizeObserver` on its root — same instance already driving `useHeaderRowFit`'s width read can report height too, or a second small observer; Plan to decide which) and writes it as a `--header-height` custom property on `.screen-content` (the shared ancestor `Header` and `Console` are both siblings under — `ScreenViewport.tsx` owns that div already). `Console.css`'s rule becomes:

```css
.console {
  margin-top: max(var(--header-height, var(--power-corner-height)), var(--power-corner-height));
  /* ...unchanged... */
}
```

The `max(...)` preserves the original rule's own "clear the taller of the two real obstacles" intent (restated, not replaced) even if a future narrow/degenerate header layout ever came in under 100px; the `var(--header-height, var(--power-corner-height))` fallback covers the one frame before `Header`'s `ResizeObserver` has fired at all (mirrors `CabinetBox.tsx`'s own documented "real, same-paint value instead of a hardcoded 0" concern — here solved by falling back to the already-correct old constant instead of 0, so there's no zero-margin flash even on that first frame).

Where exactly to write `--header-height` (a plain inline style on `ScreenViewport.tsx`'s `.screen-content` div, driven by a ref+`ResizeObserver` at that level observing `Header`'s own DOM node, vs. `Header.tsx` reaching up via a callback prop) is left open for Plan — flagged in §7 as this spec's one genuinely new cross-component-communication shape (every existing custom-property-from-JS write in this codebase, `CabinetBox`'s own `--cabinet-box-height`/`--cabinet-glow`, is scoped to the producing element's own subtree; this is the first case of a producer's measured size needing to reach a *sibling*).

### 1.7 `ConsolePanel`/`Console` simplify: no more hub-grid special case

`ConsolePanel.tsx`'s `activeHubTile === null` branch currently renders `<div className="console-panel" ...><HubNav /></div>`. With `HubNav` deleted, that branch returns `null` outright — no wrapper div, no back button (there's nothing to back out of). This makes `Console.css`'s `.console--grid`/`.console--grid .sc-button` pointer-events-passthrough rule (and `Console.tsx`'s conditional `console--grid` class) **dead code**: that mechanism existed specifically to let clicks reach `WorldView`'s robots through the empty space around `HubNav`'s tiles while still catching clicks ON the tiles themselves. A `ConsolePanel` that renders `null` has zero footprint to catch or pass through anything — `.console`'s own `position: absolute; inset: 0` box would still be present (it's `Console.tsx`'s own wrapper div, not `ConsolePanel`'s), so **`Console.tsx` needs its own small change**: when `activeHubTile === null`, don't render the `.console` wrapper's `inset: 0` box at all (or give it `pointer-events: none` unconditionally in that state, with no tile-specific override needed since nothing inside it is ever interactive) — Plan to pick the simpler of "conditionally skip the wrapper entirely" vs. "keep the wrapper, drop the now-single-purpose pointer-events rule down to a plain always-on rule for the null-tile case." Either resolves the same way; not a design fork worth blocking on.

### 1.8 What's removed from the header, and why nothing else needs to change

Attenuation Style name, coordinates, and BPM readouts are deleted from `Header.tsx` entirely, not relocated — `SectorSettingsDrawer.tsx` already independently displays Attenuation Style name and coordinates (`currentAttenuationStyle?.name`, `currentLocale?.coordinates`, its own line ~76), confirmed by direct inspection, so no doc or content gap opens up. `AudioEngine`/`audioStore.bpm` themselves are entirely untouched — only the readout of `bpm` in the header disappears; BPM remains a live, real audio parameter, still editable in `AudioRigDrawer`.

---

## 2. Target File Structure

```text
src/
├── components/panels/screen/
│   ├── TransportBar.tsx             # DELETED
│   ├── TransportBar.css             # DELETED
│   ├── TransportBar.test.tsx        # DELETED
│   ├── Header.tsx                   # NEW — 3-row header (§1.2-§1.6); replaces TransportBar
│   ├── Header.css                   # NEW
│   ├── Header.test.tsx              # NEW
│   ├── useHeaderRowFit.ts           # NEW — row 1+3 merge threshold (§1.5)
│   ├── useHeaderRowFit.test.ts      # NEW
│   ├── worldView/
│   │   └── AttenuationStyleView.tsx # MODIFIED — tick() also computes/stores temperature (§1.3)
│   └── console/
│       ├── HubNav.tsx               # DELETED
│       ├── HubNav.css               # DELETED
│       ├── HubNav.test.tsx          # DELETED
│       ├── ConsolePanel.tsx         # MODIFIED — null-tile branch returns null (§1.7)
│       ├── ConsolePanel.test.tsx    # MODIFIED
│       ├── Console.tsx              # MODIFIED — drops console--grid conditional (§1.7)
│       └── Console.css              # MODIFIED — margin-top fix (§1.6); drops .console--grid rules
├── components/ui/controls/
│   ├── Toggle.tsx                   # MODIFIED — optional boxSize prop (§1.4)
│   ├── Toggle.test.tsx              # MODIFIED — new boxSize case
│   ├── RadioButton.tsx              # MODIFIED — optional boxSize prop (§1.4)
│   └── RadioButton.test.tsx         # MODIFIED — new boxSize case
├── components/panels/physical/
│   ├── ScreenViewport.tsx           # MODIFIED — <TransportBar /> → <Header />; owns --header-height (§1.6)
│   └── ScreenViewport.css           # MODIFIED — .transport-bar selector → .header
├── data/
│   ├── hubNavConfig.ts              # DELETED
│   └── headerNavConfig.ts           # NEW — HEADER_NAV_SCHEMA (§1.4)
├── types/
│   └── hub.ts                       # MODIFIED — HubNavItem removed; HubTile unchanged
├── stores/
│   └── uiStore.ts                   # MODIFIED — activeLocaleTemperature field + setter (§1.3)
└── utils/
    ├── localeTemperature.ts         # NEW (§1.3)
    └── localeTemperature.test.ts    # NEW

docs/
├── UI_SHELL.md      # MODIFIED — TransportBar/HubNav description replaced with Header's (§1)
└── COMPONENT_LIBRARY.md  # MODIFIED — Toggle/RadioButton gain a short "boxSize override" note
```

**Explicitly not touched, and why:** `AudioEngine.ts`/`audioStore.ts` (Mute/Volume wiring is a pure relocation of already-shipped code — §1.2/§1.4). `SectorSettingsDrawer.tsx`/`AudioRigDrawer.tsx`/`RobotsTab.tsx`/`RobotOptionsTab.tsx` (reached identically via `ConsolePanel.tsx`'s existing `TILE_CONTENT` map — only how their tile is *selected* changes). `CabinetBox.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `cabinetBreakpoints.ts` (no primitive-level geometry change — `boxSize` is a thin pass-through to props `CabinetBox` already supports). `WorldView.css` (full-bleed, no top offset today — confirmed by direct inspection — nothing here changes that). `computeLocaleHour`/`constants/time.ts` (temperature reuses the existing hour value; the day-length/hour math itself is untouched — the intent doc's own "moving time in a moment" rework is explicitly a separate, later task).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Temperature has zero effect on audio or gameplay** — `computeLocaleTemperature`'s only consumer is `Header.tsx`'s display. Do not wire it into `AudioEngine`, any noise-map-consuming system (`spawnSystem.ts`, `robotSystems.ts`, etc.), or any other store.
* **No `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` introduced for temperature specifically** — it piggybacks on `AttenuationStyleView.tsx`'s existing 1s `setInterval` (already justified there as "wall-clock UI display tick, not musical timing," CLAUDE.md's guardrail is about *musical* scheduling) rather than adding a second timer. Do not add a new interval/rAF loop for this feature.
* **`activeLocaleTemperature` is a plain `number | null` in `uiStore`** — no persistence, no derived-object, matching `activeLocaleLocalTime`'s exact shape immediately beside it.
* **`boxSize` on `Toggle`/`RadioButton` is optional and additive only** — every existing consumer (Audio Rig, Robot Options, Company Manager, Sector Settings, ...) must render byte-for-byte identically when it's omitted. Do not change either primitive's default sizing behavior.
* **`RadioButtonSchema`/`ToggleSchema`/`ControlSchemaBase` (`src/types/controls.ts`) option shape is untouched** — no per-option lore/human split added to `RadioButtonSchema.options` for this feature (§1.4's flagged trade-off).
* **`HubTile` (`src/types/hub.ts`) keeps its exact 3-value union** — `activeHubTile`'s type doesn't change, only what sets it.
* **Row 2 (time+temp) never merges into the inline layout** — `useHeaderRowFit`'s result must never affect row 2's own row placement.
* **`Console.css`'s `margin-top` fix must not regress the original "clear the taller of the two obstacles" guarantee** — the `max(...)` form (§1.6) is required, not a straight swap to `var(--header-height)` alone (which would under-clear on a hypothetical narrow-header edge case below 100px).
* **`prefers-reduced-motion` handling already inside `CabinetBox`/Toggle/RadioButton is untouched** — this feature adds no new animated transitions of its own (the row-merge layout change via `useHeaderRowFit` is a CSS layout toggle, not a GSAP timeline — do not add one for it unless a real animated transition is separately requested).

---

## 4. Code Style & Architecture Conventions

**`src/stores/uiStore.ts`** (diff shape):

```typescript
export interface UIStore {
  // ...existing fields unchanged...
  activeLocaleLocalTime: number | null;
  /** Live decorative temperature (°C) for the active locale — Header's row 2
   *  readout. Purely cosmetic, never read by any other system. Same shape/
   *  placement/no-persistence convention as activeLocaleLocalTime.
   *  docs/specs/HEADER_HUB_CONSOLIDATION.md §1.3. */
  activeLocaleTemperature: number | null;
  setActiveLocaleLocalTime: (t: number | null) => void;
  setActiveLocaleTemperature: (t: number | null) => void;
  // ...rest unchanged...
}

export const useUIStore = create<UIStore>((set) => ({
  // ...existing fields unchanged...
  activeLocaleLocalTime: null,
  activeLocaleTemperature: null,
  // ...
  setActiveLocaleLocalTime: (t) => set({ activeLocaleLocalTime: t }),
  setActiveLocaleTemperature: (t) => set({ activeLocaleTemperature: t }),
  // ...rest unchanged...
}));
```

**`src/components/panels/screen/worldView/AttenuationStyleView.tsx`** (diff shape, inside the existing `tick()`):

```typescript
const tick = () => {
  const locale = useLocaleStore.getState().locales[localeId];
  if (!locale) return;
  const hour = computeLocaleHour(locale.dayStartTimestamp);
  setCurrentHour(hour);
  useUIStore.getState().setActiveLocaleLocalTime(hour);
  // New — same locale object, same tick, no second effect/interval.
  useUIStore.getState().setActiveLocaleTemperature(
    computeLocaleTemperature(localeId, locale.coordinates.x, locale.coordinates.y, hour),
  );
};
```

**`src/components/panels/screen/Header.tsx`** (structural shape — not a full listing):

```typescript
function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const isPoweredOn = useUIStore((s) => s.isPoweredOn);
  const volume = useAudioStore((s) => s.volume);
  const isMuted = useAudioStore((s) => s.isMuted);
  const hhmm = /* existing TransportBar hh/mm derivation, unchanged */;
  const temperature = useUIStore((s) => s.activeLocaleTemperature);
  const activeHubTile = useUIStore((s) => s.activeHubTile);

  const inline = useHeaderRowFit(headerRef, HEADER_NAV_SCHEMA.options.length, TOUCH_TARGET_SIZE, ROW_GAP);

  return (
    <header ref={headerRef} className={`header${inline ? ' header--inline' : ''}`}>
      <div className="header__row header__row--volume">
        <Slider.Root /* ...ported from TransportBar.tsx unchanged... */ />
      </div>
      <div className="header__row header__row--status">
        <span className="header__time">{hh}:{mm}</span>
        <span className="header__temp">{temperature !== null ? `${temperature}°C` : '—'}</span>
      </div>
      <div className="header__row header__row--nav">
        <Toggle schema={MUTE_SCHEMA} value={isMuted} onChange={(v) => useAudioStore.getState().setMuted(v)} disabled={!isPoweredOn} boxSize={TOUCH_TARGET_SIZE} />
        <RadioButton schema={HEADER_NAV_SCHEMA} value={activeHubTile ?? ''} onChange={handleNavChange} disabled={!isPoweredOn} boxSize={TOUCH_TARGET_SIZE} />
      </div>
    </header>
  );
}
```

`MUTE_SCHEMA`/`TOUCH_TARGET_SIZE`/`ROW_GAP` are small module-scope constants in `Header.tsx` (or `headerNavConfig.ts` alongside `HEADER_NAV_SCHEMA`) — exact placement is Plan's call, not a design question.

**`src/components/panels/screen/console/ConsolePanel.tsx`** (diff shape):

```typescript
if (activeHubTile === null) {
  return null; // was: <div className="console-panel" ...><HubNav /></div>
}
```

* **Naming Conventions:** `Header`/`header__row`/`header__row--volume` etc. — BEM-ish double-underscore, matching `transport-bar__*`'s existing convention it replaces. `useHeaderRowFit`/`computeLocaleTemperature`/`activeLocaleTemperature` — same `camelCase` convention as every sibling hook/util/store field.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`localeTemperature.test.ts` (new):** mirrors `localeBpmSeed.test.ts`'s shape — deterministic for a given `(localeId, x, y, hour)` tuple; two different `hour` values for the same locale/coordinates produce different (but both in-range) results, proving the continuous-offset behavior (not a flat per-locale constant like BPM); result always falls within `[-120, -30]`; integer-rounded.
* **`uiStore.test.ts` (modified):** `setActiveLocaleTemperature` sets `activeLocaleTemperature`; defaults to `null`.
* **`AttenuationStyleView.test.tsx` (modified):** the 1s tick also calls `setActiveLocaleTemperature` with `computeLocaleTemperature`'s result for the current locale/hour (mock/spy `computeLocaleTemperature`, assert it's called with the same `hour` value `setActiveLocaleLocalTime` received in the same tick).
* **`Header.test.tsx` (new):** port every still-relevant case from the deleted `TransportBar.test.tsx` (volume slider render/drag/disabled — §1.2's "no behavior change" claim; mute toggle reflects/drives `isMuted`) plus: renders `HH:MM -XX°C` from store fixtures; renders exactly one `RadioButton` group with 3 options; selecting an option calls `setActiveHubTile`; re-selecting the active option clears `activeHubTile` (deselect-to-empty, unmodified `RadioButton` behavior — regression guard, not new logic); selecting `'robots'` while `selectedRobotId` is set also clears it (§1.4's `handleNavChange`); `header--inline` class presence tracks `useHeaderRowFit`'s mocked return value.
* **`useHeaderRowFit.test.ts` (new):** mirrors `useVoxelTrackBoxCount.test.ts`'s `ResizeObserver`-mocking shape — returns `false` below the computed threshold width, `true` at/above it; recomputes on a simulated resize.
* **`Toggle.test.tsx` (modified):** new case — `boxSize={44}` renders a `CabinetBox` with `boxHeight={44}` (mock `CabinetBox`, assert its received props, same pattern the file already uses); omitting `boxSize` still passes `CABINET_TOGGLE_BOX_SIZE` (regression guard).
* **`RadioButton.test.tsx` (modified):** new case — `boxSize={44}` passes `boxHeight`/`frontWidth`/`frontHeight` all `44` to every option's `CabinetBox`; omitting it passes none of the three (regression guard, matches every existing consumer's current behavior).
* **`ConsolePanel.test.tsx` (modified):** `activeHubTile === null` renders nothing (was: renders `HubNav`) — update/remove the old grid-state assertions; every other tile's existing back-button behavior is unchanged and must keep passing.
* **`Console.test.tsx` / `Console.css` manual check:** no `HubNav`-click-through test to port (mechanism removed, §1.7) — if `Console.test.tsx` exists and has grid-state-specific cases, they're deleted, not ported.
* **`HubNav.test.tsx`/`TransportBar.test.tsx`:** deleted alongside their components.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (also catches every stale `HubNavItem`/`hubNavConfig`/`TransportBar` import automatically).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated, flag for Crawford — same convention every Oblique Cabinetry item's own task doc used):**
  1. Confirm no header content — at any breakpoint, powered on or off — renders under/behind the power-switch corner (the core "deadzone" requirement).
  2. Confirm `Console`'s content (each drawer/tab) never starts underneath the header's own lower row(s) at any breakpoint — the §1.6 vertical-clearance fix, not exercisable by jsdom (no real layout).
  3. Confirm the volume+buttons row genuinely merges inline once there's room for the buttons at 44×44, and time+temp stays on its own row at every width.
  4. Confirm selecting Robots/Audio Rig/Sector Settings, re-clicking the active one, using each screen's own Back button, and clicking Robots from deep in a robot's detail view, all behave as specified in §1.4.
  5. Confirm the temperature reading visibly drifts over real time (watch it across ~30s) rather than sitting static or jumping discretely at hour boundaries.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/header-hub-consolidation` (new branch off `main`).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `uiStore.ts` + `localeTemperature.ts`(+tests) + `AttenuationStyleView.tsx`(+test) — temperature plumbing, independent of everything else. (2) `Toggle.tsx`/`RadioButton.tsx`(+tests) — the `boxSize` override, independent of Header itself. (3) `Header.tsx`/`.css`/`.test.tsx` + `useHeaderRowFit.ts`(+test) + `headerNavConfig.ts` + `ScreenViewport.tsx`/`.css` — the header itself, depends on (1) and (2). (4) `ConsolePanel.tsx`/`Console.tsx`/`.css`(+tests) + deletion of `HubNav.*`/`TransportBar.*`/`hubNavConfig.ts`/`HubNavItem` — the hub-side cleanup, depends on (3) being live (the nav buttons need somewhere to dispatch to). (5) Docs last.

---

## 7. Open Questions & Risks

Resolved during the pre-spec `interview-me` pass (`docs/intent/header-hub-consolidation.md`), not re-litigated here:

- ~~Attenuation Style display?~~ **Resolved: dropped entirely.**
- ~~Temperature update mechanic?~~ **Resolved: continuous sampling off the live hour, not discrete per-hour snapping.**
- ~~Row-merge implementation?~~ **Resolved: `ResizeObserver` self-fit, not a guessed breakpoint.**
- ~~Row 2's participation in the merge?~~ **Resolved: never merges, always its own row.**
- ~~Button styling/primitive choice?~~ **Resolved: Cabinetry `Toggle` (Mute) + `RadioButton` (nav), variable-width.**
- ~~Nav deselect/re-click and robot-detail-view behavior?~~ **Resolved (§1.4).**

Resolved during this Specify pass, worth a second look before/during Implement:

1. **The vertical deadzone fix (§1.6) is this spec's most load-bearing new mechanism and its riskiest** — writing a measured height from `Header.tsx` to a sibling-visible `--header-height` custom property has no existing precedent in this codebase (every other JS→CSS-custom-property write is scoped to the producing element's own subtree, e.g. `CabinetBox`'s `--cabinet-box-height`). The `max(var(--header-height, var(--power-corner-height)), var(--power-corner-height))` fallback chain is designed to fail safe (never under-clear) even before the first `ResizeObserver` callback fires, but the exact plumbing (which component's ref hosts the observer, where the inline style actually gets applied) is left to Plan, not fully pinned down here.
2. **No group-level accessible name for the row-3 `Toggle`/`RadioButton`** (§1.4) — both fall back to their raw `schema.id` (`'headerMute'`, `'headerHubNav'`) for `aria-label` rather than a real phrase, because giving either a real `humanLabel` would also force a visible `DualLabel` row that doesn't fit the icon-first aesthetic. Each individual `RadioButton` option still has its own real `aria-label` (`option.label`) — this only affects the *group* root's name, read by a screen reader as context when entering the group, not per-option navigation. Worth a second look/decision by a human before this is called fully accessible, per CLAUDE.md's a11y checklist expectation.
3. **Dropping per-option lore-label flavor text** (`'UNIT ROSTER'`, `'SIGNAL CHAIN'`, `'SECTOR CONTROL'`) when the 3 hub tiles move from `Button` (schema-level lore+human pair, both rendered on the face) to `RadioButton` (single `label` string per option) is this spec's own engineering default, not something the confirmed intent addressed either way — low risk (pure flavor text, no functional loss), reversible later by extending `RadioButtonSchema.options`' shape if wanted.
4. **`MIN_VOLUME_RESERVE_PX`'s exact value** (§1.5, the inline-merge threshold's reserved width for the volume slider) is an unconfirmed engineering default, same category as `GLOBAL_VOLUME_CONTROL.md`'s own flagged-but-unconfirmed slider width — worth a quick visual sanity check during Implement, not a blocking decision now.
5. **Whether `ConsolePanel.tsx` returning `null` vs. `Console.tsx` conditionally skipping its own wrapper** is the cleaner way to retire the `.console--grid` pointer-events mechanism (§1.7) is left to Plan — both converge on the same end behavior (empty space passes clicks through to `WorldView`), so this is an implementation-shape choice, not a design fork.
