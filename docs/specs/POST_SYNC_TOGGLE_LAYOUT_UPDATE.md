# Phase Spec: Post-Sync-Toggle Layout Update (row reshuffle across Params, EQ & Filters, Time & Space, Probes, Settings)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: Crawford's checklist, pasted 2026-10-03 and reproduced verbatim in §0 (no interview pass — every item is a concrete placement instruction, so the spec's job is the mechanism, the assumptions and the tests, not the what). Branch: to be cut from `feature/sync-toggle` (HEAD 1366fe39) or from `main` once Free | Sync merges — see §6. Roadmap slot: **Phase 34** (§6).

Survey basis (2026-10-03, against the current tree):

- **One layout primitive does rows.** `DirectionalPanel` (`src/components/ui/controls/DirectionalPanel.tsx`) is a flex box with `orientation: 'row' | 'column' | 'auto' | 'responsive'`. A *nested* instance (inside another panel's children) renders unframed; a top-level one gets the Cabinetry facade. `'row'` never wraps and gives every child `flex: 1 1 0; min-width: 0` (equal halves). `'responsive'` resolves through `useResponsivePanelOrientation()` to `'row'` on desktop (viewport ≥ 1024 px, `CABINET_BREAKPOINT_TABLET_MAX`) and `'column'` on mobile/tablet — the shape the Compressor's three paired sub-rows (`COMPRESSOR_TOP_ROW_SCHEMA` etc., `AudioRigDrawer.tsx`), `AudioLoadPanel`'s two rows and Ping Controls' rows already use.
- **Params → LFO Bank lane** (`LfoBankLanePanel.tsx`, schemas `LFO_BANK_LANE_SCHEMAS` in `audioRigConfig.ts`): a `'column'` panel with four `.audio-rig-drawer__param-row` divs — Shape (`RadioButton`, 5 options), Rate (`TempoSyncSlider`, which already stacks the Rate slider over its Tempo Sync toggle), Rate Drift, Depth Drift — then `HeldOffNote` when drift is held off. Pinned by `LfoBankLanePanel.test.tsx` ("exactly four param-rows").
- **EQ & Filters** (`AudioRigEffectPanel` generic branch): `eq3` / `filterLPF` / `filterHPF` block panels are `'row'`; their sliders are **vertical** (`orientation: 'vertical', verticalHeight: 256`) so the bands sit side by side; each param-row holds the slider then its `LfoLink`. `LfoLink` (`LfoLink.tsx/.css`) is a **column**: an optional `DualLabel` (both call sites pass no labels, so it renders nothing), the Lane `RadioButton` (Off + a–d), the Depth `SliderLinear`. It is used in exactly two places: here and the probe layers. Pinned by `audioRigConfig.test.ts` ("3-Band EQ is vertical", "LPF/HPF is vertical", "eq3/filterLPF/filterHPF are row-orientation panels") and `AudioRigEffectPanel.test.tsx` (row-orientation panel; LfoLink directly after each slider).
- **Time & Space**: Delay and Reverb block panels are `'column'`. Delay is a hand-composed branch (`TempoSyncSlider` row, then Repeats and Delay Amount via `paramRow`); Reverb falls through the generic map (Reverb Length `sliderLog`, Pre-Delay, Reverb Amount). Both are pinned as "3 direct param-rows, no nested row wrapper" (`AudioRigEffectPanel.test.tsx` lines 127–145, 731–760) — the archived `AUDIO_RIG_RESPONSIVE_LAYOUT.md` §1.7 decision ("every slider own row, at every breakpoint"), which this pass deliberately reverses for these two blocks.
- **Probes → Source** (`SignatureArrayLayer` in `SignatureArrayDrawer.tsx`; schemas `SIGNATURE_ARRAY_CONFIG` in `robotOptionsConfig.ts`; mounted per layer by `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx` and the drawer itself): each layer's panel is `'row'` with one child, `.signature-array-drawer__layer` (a CSS column): Type `RadioButton`, then `.signature-array-drawer__param` wrappers for Gain (+ `LfoLink`), Detune (+ `LfoLink`), Phase, and Interval (`pulseWidth`, only when `layer.type === 'pulse'`). All four sliders are **vertical** at 256 px. Pinned by `robotOptionsConfig.test.ts` ("Signature Array is vertical on every layer", verticalHeight budget, "panel … row orientation") and `SignatureArrayDrawer.test.tsx`.
- **Settings → Seeds** (`SectorSettingsDrawer.tsx/.css`): the Retransmit `Button` sits in `.sector-settings-drawer__retransmit { display: flex; justify-content: flex-end }`.
- **Settings → Save & Share** (`SessionsPanel.tsx` → `SessionListItem.tsx/.css`): each row is a wrapping flex line: `.session-list-item__label` (`flex: 1`, ellipsis), `.session-list-item__saved-at`, then Load / Share / Delete buttons. Because the label is `flex: 1`, the timestamp is pushed to the far end of the label's space, beside the buttons rather than beside the title.
- **After this pass no consumer renders a vertical slider.** The only vertical schemas in the app are the seven EQ/filter params and the twelve probe-layer params listed above. The primitives' vertical mode (roadmap 11.1.5.x, 13) stays in place, untouched and unused.

ASSUMPTIONS I'm making beyond the checklist (correct now or I'll proceed with these):

1. **"Share a row" means `orientation: 'responsive'`**, the house tiering: side by side on desktop (≥ 1024 px), stacked on mobile/tablet. Horizontal voxel-track sliders have a 3-box overflow floor (~156 px) and the nav panel is narrow below desktop, so two sliders forced side by side there would clip or push the unlit boxes under their neighbour (the Tempo Sync toggle's own layout notes record exactly this failure). Every paired row in this spec — Shape | Rate, Rate Drift | Depth Drift, Lane | Depth, Length | Pre-Delay, Delay Time | Repeats, Type | Gain, Phase | Interval — follows this one rule. Alternative if you want it: `'row'` on every tier for the compact pairs only (Lane | Depth, Shape | Rate).
2. **`LfoLink` becomes a row internally**, Lane left and Depth right, for both of its call sites (EQ/filters and probe Gain/Detune — there is no third). It reads the same viewport tier (`useResponsivePanelOrientation()`) and sets `data-orientation` on its own root, with CSS mirroring `DirectionalPanel.css`'s row rule (`flex: 1 1 0; min-width: 0` on the two children, which also neutralises `RadioButton`'s `width: 100%`). It does **not** wrap itself in a `DirectionalPanel`: a primitive stays a primitive, and no `.sc-directional-panel` appears inside a control. Its (currently unused) `DualLabel` stays first and still renders nothing when no labels are passed.
3. **The probes' Lane | Depth rows are full-width rows under their slider's row**, not tucked into the Gain half of the Type | Gain row. The checklist says "Gain's Lane and Depth share a row" as its own item (2), unlike the LFO Bank item where it explicitly puts Rate and Tempo Sync in "a column" on the right half. Taken literally: row 1 Type | Gain, row 2 Lane | Depth (Gain's), row 3 Detune, row 4 Lane | Depth (Detune's), row 5 Phase | Interval or Phase alone.
4. **Nesting uses `DirectionalPanel` exactly as the Compressor does**: one nested panel per paired row, declared as a module-scope schema constant next to the Compressor's (ids `audioRig.delay.topRow`, `audioRig.reverb.topRow`) or on the per-lane / per-layer schema objects where the id must carry the lane/layer key (`audioRig.lfoBank.${lane}.topRow`, `.driftRow`; `robotOptions.${key}.typeGainRow`, `.phaseIntervalRow`). Every leaf control keeps its `.audio-rig-drawer__param-row` (Audio Rig) or `.signature-array-drawer__param` (probes) wrapper, so spacing and the existing "control lives in a param-row" tests keep their shape.
5. **"Horizontal" is a config edit**: `orientation: 'vertical'` → `'horizontal'` and `verticalHeight` removed on the seven EQ/filter params and the twelve probe-layer params; the matching `verticalHeight` prop pass-throughs in the two components go too. No primitive changes.
6. **The EQ bands and filter params need no new wrapper.** With a horizontal slider and a row-shaped `LfoLink`, today's `paramRow` output (one div: slider, then `LfoLink`) is already "top row the slider, bottom row Lane | Depth". The only EQ/filter change beyond the sliders is the block panel going `'row'` → `'column'` so the bands stack.
7. **Delay keeps `TempoSyncSlider` as its top-left column** — the composition already stacks Delay Time over Tempo Sync, so "top row left is two rows" is satisfied by placing it as the left child of the new responsive top row with Repeats as the right child. Delay Amount keeps its own full-width row. Reverb mirrors it: Length | Pre-Delay, then Amount.
8. **The `'responsive'` top row inside a `'column'` block panel is the Compressor's exact shape**, so no new CSS is needed for Delay/Reverb/the lane panel; the probe layer needs its panel's single-child `'row'` orientation changed to `'column'` (or the nested rows placed inside the existing `.signature-array-drawer__layer` column, which is what §1.4 does — the outer panel orientation becomes irrelevant and is set to `'column'` for honesty).
9. **Save & Share**: the title and its timestamp become one group (`.session-list-item__title`: name, then timestamp after a small gap) that takes the `flex: 1`; the three buttons follow. The timestamp keeps its muted small style and `white-space: nowrap`; the name keeps its ellipsis. No copy or `formatSessionTimestamp` change.
10. **Seeds**: Retransmit is left-aligned by changing the existing wrapper's `justify-content` to `flex-start`. Nothing else in that drawer moves.
11. **Shape at half width wraps its five option boxes** onto two lines on narrower desktops (`RadioButton` already wraps against its available width). Accepted; no option-count or label change.
12. **No content changes.** Every label involved already exists; `src/content/` is untouched and the literal guard stays green with no exemptions.
13. **No `index.css`, `DirectionalPanel`, `RadioButton` or slider primitive changes.** If a measured layout needs one, that is a conflict to surface, not a quiet fix.

---

## 0. The checklist (verbatim, Crawford 2026-10-03)

```
Params
LFO bank:
1) Shape should take up half a row
2) The right half of that row should be a column consisting of two rows, Rate above Tempo Sync.
3) Rate Drift and Depth Drift should share a row.

EQ & Filters
Eq:
1) This becomes three rows, one per band
2) Each band row has two rows
2a) Top row: the eq, but horizontally now instead of vertically.
2b) Bottom row: Lane on the left, Depth on the right.

HPF & LPF:
1) Similarly, this become 2 rows, one for cutoff, one for resonance
2) Each of those has two rows
2a) Top row: the main slider (so Cutoff or Resonance, depending on the main row we're in)
2b) Bottom row: Lane on the left, Depth on the right.

Time & Space
Reverb:
1) Reverb Length and Pre-Delay should split a row
2) Reverb Amount still gets its own row
Delay:
1) This will become two rows
2) top row left is two rows, Delay Time on top of Tempo Sync
2a) top right is just Repeats
3) bottom row is just Delay Amount

PROBES
Source
Each oscillator:
1) Gain becomes horizontal and shares a row with Type.
2) Gain's Lane and Depth share a row
3) Detune becomes Horizontal
4) Detune's Lane and Depth share a row
5) Phase and Interval become horizontal
5a) If Interval is present, they share a row
5b) if Interval is not present, Phase takes up a row by itself

SETTINGS
Seeds
1) Retransmit should be aligned left

Save & Share
1) saved sessions timestamp should be aligned next to the session title
```

---

## 1. Overview & Claude Explanation

A pure layout pass, no behaviour change: nineteen sliders turn horizontal, eight pairs of controls move onto shared (responsive) rows, `LfoLink` lays its Lane and Depth side by side, and two Settings alignments change. Every store action, schema id, label, value range and test of *behaviour* is untouched; what changes is DOM structure, slider orientation in config, and a few CSS rules. The mechanism is one the codebase already has — nested `DirectionalPanel`s with `'responsive'` orientation — so the work is mostly moving JSX and flipping config, then re-pinning the layout tests that encode today's shapes.

### 1.1 Params → LFO Bank lane (`LfoBankLanePanel.tsx`)

```
┌ lane panel ('column', framed) ──────────────────────────────┐
│ ┌ topRow ('responsive') ───────────────────────────────────┐ │
│ │ [ Shape (RadioButton)      ] [ Rate (TempoSyncSlider)   ] │ │
│ │                              [   Tempo Sync toggle       ] │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌ driftRow ('responsive') ─────────────────────────────────┐ │
│ │ [ Rate Drift               ] [ Depth Drift              ] │ │
│ └──────────────────────────────────────────────────────────┘ │
│ (HeldOffNote when driftHeldOff)                              │
└──────────────────────────────────────────────────────────────┘
```

- `LfoBankLaneSchema` gains `topRow` and `driftRow` (`DirectionalPanelSchema`, `orientation: 'responsive'`, ids `audioRig.lfoBank.${lane}.topRow` / `.driftRow`, no labels).
- Each of the four controls keeps its own `.audio-rig-drawer__param-row` div (the drift pair keep `withHeldOffClass`); the two nested panels wrap those divs. `HeldOffNote` stays after the drift row, a direct child of the lane panel.
- `TempoSyncSlider` is unchanged: it already renders Rate over the toggle in a column, which is the checklist's "right half … a column … Rate above Tempo Sync".

### 1.2 EQ & Filters (`audioRigConfig.ts`, generic branch of `AudioRigEffectPanel`)

- `eq3.low/mid/high`, `filterLPF.frequency/Q`, `filterHPF.frequency/Q`: `orientation: 'horizontal'`, `verticalHeight` removed.
- `panelSchema('eq3' | 'filterLPF' | 'filterHPF', …, 'column')` (was `'row'`).
- Nothing in the component changes for these blocks: the generic `block.params.map(paramRow(…, <LfoLink/>))` already yields, per band, one param-row holding the slider then the `LfoLink`. With the slider horizontal and `LfoLink` a row (§1.5), that *is* "top row: the slider; bottom row: Lane | Depth".
- `renderParamControl` stops forwarding `verticalHeight` (the prop is still accepted by the primitives; nothing in the config carries it any more).

### 1.3 Time & Space (`AudioRigDrawer.tsx`)

**Delay** — the existing `block.key === 'delay'` branch becomes:

```tsx
<DirectionalPanel schema={DELAY_TOP_ROW_SCHEMA}>           {/* 'responsive' */}
  <div className="audio-rig-drawer__param-row">
    <TempoSyncSlider … />                                     {/* Delay Time over Tempo Sync, as today */}
  </div>
  {paramRow(findParam(block.params, 'feedback'), …)}          {/* Repeats */}
</DirectionalPanel>
{paramRow(findParam(block.params, 'wet'), …)}                 {/* Delay Amount, full width */}
```

**Reverb** — a new `block.key === 'reverb'` branch beside it:

```tsx
<DirectionalPanel schema={REVERB_TOP_ROW_SCHEMA}>          {/* 'responsive' */}
  {paramRow(findParam(block.params, 'decay'), …)}             {/* Reverb Length */}
  {paramRow(findParam(block.params, 'preDelay'), …)}
</DirectionalPanel>
{paramRow(findParam(block.params, 'wet'), …)}                 {/* Reverb Amount, full width */}
```

`DELAY_TOP_ROW_SCHEMA` / `REVERB_TOP_ROW_SCHEMA` are module-scope constants next to the Compressor's three (`{ id: 'audioRig.delay.topRow' | 'audioRig.reverb.topRow', type: 'directionalPanel', orientation: 'responsive' }`). The `findParam` doc comment already anticipates a reverb branch. The archived §1.7 "no nested row" rule is reversed here on purpose (assumption 7 / survey).

### 1.4 Probes → Source (`SignatureArrayDrawer.tsx`, `robotOptionsConfig.ts`)

```
┌ layer panel ('column', framed) ─────────────────────────────┐
│ .signature-array-drawer__layer (CSS column)                 │
│ ┌ typeGainRow ('responsive') ──────────────────────────────┐│
│ │ [ Type (RadioButton)       ] [ Gain (horizontal)        ] ││
│ └──────────────────────────────────────────────────────────┘│
│ [ Gain LfoLink: Lane | Depth                               ] │
│ [ Detune (horizontal)                                      ] │
│ [ Detune LfoLink: Lane | Depth                             ] │
│ ┌ phaseIntervalRow ('responsive'), only when type = pulse ─┐│
│ │ [ Phase (horizontal)       ] [ Interval (horizontal)    ] ││
│ └──────────────────────────────────────────────────────────┘│
│   …otherwise: [ Phase (horizontal), own row               ] │
└──────────────────────────────────────────────────────────────┘
```

- `gain`, `detune`, `phase`, `pulseWidth` on all three layers: `orientation: 'horizontal'`, `verticalHeight` removed. The layer `panel` orientation becomes `'column'` (it has one child; `'row'` was never doing anything).
- `SignatureArrayLayerBlock` gains `rows: { typeGain: DirectionalPanelSchema; phaseInterval: DirectionalPanelSchema }` (ids `robotOptions.${key}.typeGainRow` / `.phaseIntervalRow`, `'responsive'`, no labels).
- Gain's `LfoLink` leaves Gain's `.signature-array-drawer__param` wrapper and becomes the next sibling, in its own wrapper; same for Detune's. Each slider keeps a `__param` wrapper of its own.
- When `showPulseWidth` is false, Phase renders in a plain `__param` wrapper with no nested panel around it (5b) — not an empty right half.
- `.signature-array-drawer__param` CSS stays a column (it now holds one control each); no other CSS change.

### 1.5 `LfoLink` becomes a row (`LfoLink.tsx/.css`)

- The root gains `data-orientation={useResponsivePanelOrientation()}`.
- CSS: `.sc-lfo-link[data-orientation='row'] { flex-direction: row; align-items: flex-start; }` and `.sc-lfo-link[data-orientation='row'] > * { flex: 1 1 0; min-width: 0; }` (the `DirectionalPanel.css` row rule, restated — equal halves, content-independent, and it overrides `RadioButton`'s `width: 100%` basis). Column stays the default (today's rule, unchanged, for mobile/tablet).
- The `DualLabel` stays the first child. When present it would take a third equal share, which no caller wants today; the spec records this as a known limitation rather than adding a `grid-column` rule for a case with zero consumers. The `heldOff` behaviour, `sc-held-off` / active classes, handlers and memoisation are untouched.
- The `sc-control` inline-size container on the root stays: the Depth slider's own readout container query already keys off its own `SliderLinear` container, not this one.

### 1.6 Settings

- **Seeds**: `.sector-settings-drawer__retransmit { justify-content: flex-start; }` (was `flex-end`). Nothing else.
- **Save & Share** (`SessionListItem.tsx/.css`):

```tsx
<div className="session-list-item">
  <span className="session-list-item__title">
    <span className="session-list-item__label">{label}</span>
    <span className="session-list-item__saved-at">{formatSessionTimestamp(entry.savedAt)}</span>
  </span>
  <Button … Load /> <Button … Share /> <Button … Delete />
  …
</div>
```

  `.session-list-item__title { flex: 1; display: flex; align-items: baseline; gap: 0.5rem; min-width: 0; }`; `.session-list-item__label` drops `flex: 1` (keeps `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`, and gets `min-width: 0` so it still ellipsises inside the group); `__saved-at` unchanged (`white-space: nowrap`, muted, small).

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── audioRigConfig.ts / .test.ts            eq3 + filter params → horizontal, no verticalHeight; their block panels → 'column';
│   │                                           LfoBankLaneSchema + topRow/driftRow ('responsive')
│   └── robotOptionsConfig.ts / .test.ts        gain/detune/phase/pulseWidth → horizontal, no verticalHeight; layer panel → 'column';
│                                               SignatureArrayLayerBlock + rows.typeGain/.phaseInterval ('responsive')
├── components/
│   ├── ui/controls/
│   │   ├── LfoLink.tsx / .css / .test.tsx       data-orientation from the tier hook; row rule (§1.5); + LfoLink.css.test.ts (CSS source scan)
│   │   └── (DirectionalPanel, RadioButton, sliders — untouched)
│   ├── panels/screen/console/
│   │   ├── LfoBankLanePanel.tsx / .test.tsx     two nested responsive rows (§1.1)
│   │   ├── AudioRigDrawer.tsx                   DELAY_TOP_ROW_SCHEMA / REVERB_TOP_ROW_SCHEMA; delay branch restructured; reverb branch added;
│   │   │                                        renderParamControl no longer forwards verticalHeight
│   │   ├── AudioRigEffectPanel.test.tsx         §1.7-era "3 direct param-rows" / "row-orientation" tests re-pinned to §1.2–1.3
│   │   ├── SectorSettingsDrawer.css / .test.tsx retransmit left-aligned (+ CSS scan assertion)
│   │   └── SessionListItem.tsx / .css / .test.tsx  title group (§1.6)
│   └── robot/
│       └── SignatureArrayDrawer.tsx / .css / .test.tsx   rows per §1.4
docs/
├── COMPONENT_LIBRARY.md                        LfoLink entry (row layout, tier-driven); slider "Used by" columns and the 'vertical' paragraph
│                                               (no live consumer; mode retained); the §1.2/§7 "side-by-side groupings deferred" note resolved
├── AUDIO_SYSTEM.md                             LfoLink paragraph ("beneath the field", Lane | Depth row)
├── reference/GLOBAL_CHAIN_GRID.md              UI column: EQ/filter rows horizontal, Delay/Reverb pairs (only if the grid states orientation — the plan verifies)
├── reference/ROBOT_DATA_GRID.md                same, for Gain/Detune/Phase/Interval
└── todo/roadmap.md                             Phase 34 entry (§6)
```

Not touched: every store, every seeder, `TempoSyncSlider` / `TempoSyncToggle` / `ToggleFacade`, `DirectionalPanel`, `RadioButton`, the three slider primitives and their vertical mode, `index.css`, `src/content/`, Compressor / Limiter / Pacing / Audio Load panels, `SessionsPanel.tsx`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface.
- **Layout only.** No store action, handler wiring, schema id, label, min/max/step or default changes. A behaviour test that goes red is a bug in the change, not a test to edit.
- **Nested rows are `DirectionalPanel`s with `'responsive'`**, never ad-hoc flex divs with their own breakpoints, and never `'auto'` (the per-parent ResizeObserver path).
- **No `DirectionalPanel` inside a primitive.** `LfoLink`'s row is its own CSS driven by the tier hook (assumption 2).
- **Keep the param-row wrappers.** Every leaf control stays inside `.audio-rig-drawer__param-row` / `.signature-array-drawer__param`.
- **Schema ids stay unique and dot-namespaced** under the owning panel's id; the nested-row ids follow the Compressor's `…topRow` naming.
- **Content:** no new strings, no guard exemptions.
- **Ask first:** any primitive or `index.css` change; removing the sliders' vertical mode (out of scope — it merely becomes unused); changing a `'responsive'` row to `'row'` for mobile.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail.

---

## 4. Code Style & Architecture Conventions

A nested paired row, the Compressor's own shape:

```tsx
// AudioRigDrawer.tsx — module scope, beside COMPRESSOR_KNEE_DECAY_ROW_SCHEMA
/** Delay Time (over its Tempo Sync toggle) beside Repeats — side by side on desktop, stacked on
 *  mobile/tablet (docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.3). Delay Amount keeps its own row. */
const DELAY_TOP_ROW_SCHEMA: DirectionalPanelSchema = { id: 'audioRig.delay.topRow', type: 'directionalPanel', orientation: 'responsive' };
```

`LfoLink`'s row rule, restating `DirectionalPanel.css` so the two children share the row equally:

```css
/* Lane left, Depth right on desktop; stacked below it (the same tier every 'responsive'
   DirectionalPanel reads — docs/specs/POST_SYNC_TOGGLE_LAYOUT_UPDATE.md §1.5). flex: 1 1 0 +
   min-width: 0 is DirectionalPanel.css's own row rule: equal, content-independent halves, and it
   is what stops RadioButton's width: 100% from claiming the whole row. */
.sc-lfo-link[data-orientation='row'] { flex-direction: row; align-items: flex-start; }
.sc-lfo-link[data-orientation='row'] > * { flex: 1 1 0; min-width: 0; }
```

Conventions: named exports, `memo`-wrapped components stay memo-wrapped, co-located CSS and tests, doc comments that cite this spec's section, CSS source-scan tests for layout rules (`tempoSyncSliderLayout.test.ts` / `ToggleFacade.css.test.ts` precedent), tier mocking in component tests the way `AudioRigEffectPanel.test.tsx`'s Compressor sub-row tests already do it.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, co-located; RED first, one commit per task, mutation check at the named gates. jsdom cannot measure, so structure and config are pinned in tests and the look is a manual checkpoint in real Chrome at the three tiers.

- **Config** (`audioRigConfig.test.ts`, `robotOptionsConfig.test.ts`): the vertical-classification tests flip to horizontal and the verticalHeight-budget tests become "declares no verticalHeight"; eq3/filter block panels are `'column'`; lane `topRow`/`driftRow` and layer `rows.*` are `'responsive'` `directionalPanel`s with the stated ids and no labels; **no schema anywhere in either config is `'vertical'`** (one test, so the "no live vertical consumer" fact is pinned).
- **LFO Bank lane** (`LfoBankLanePanel.test.tsx`): the panel's content has exactly two direct nested panels (top, drift) and the held-off note; the top row's children are Shape then the Rate composition (slider + Tempo Sync switch), the drift row's are Rate Drift then Depth Drift; `data-orientation` is `row` with the tier mocked to desktop and `column` on tablet; every existing behaviour test (Free/Sync wiring, drift held-off) unchanged and green.
- **EQ & Filters** (`AudioRigEffectPanel.test.tsx`): eq3/filter panels are column-orientation; each band/param row holds its slider (horizontal — Radix `aria-orientation="horizontal"`) and then its `LfoLink`; the `LfoLink` row's first child is the Lane radio and the second the Depth slider.
- **Time & Space**: Delay content = one nested `responsive` panel (Tempo Sync composition first, Repeats second) plus one direct param-row (Delay Amount); Reverb content = one nested panel (Length, Pre-Delay) plus one direct row (Amount); `row`/`column` under mocked tiers; the "3 direct param-rows" tests are replaced, not kept. All Tempo Sync, swell-isolation and re-render tests unchanged and green.
- **Probes** (`SignatureArrayDrawer.test.tsx`): per layer, the order is typeGain row (Type, Gain) → Gain `LfoLink` → Detune → Detune `LfoLink` → Phase/Interval; with a `pulse` layer the last is a nested panel holding Phase then Interval, with any other type Phase stands alone in a `__param` with no nested panel; every slider is horizontal; the existing LfoLink wiring, disabled and memo-bailout tests unchanged and green.
- **`LfoLink`** (`LfoLink.test.tsx`, new `LfoLink.css.test.ts`): `data-orientation` follows the mocked tier; the CSS scan pins the two row rules (`flex-direction: row`, `flex: 1 1 0` + `min-width: 0` on children) and that the column default is untouched.
- **Settings**: `SectorSettingsDrawer.test.tsx` gains a CSS scan that `.sector-settings-drawer__retransmit` is `justify-content: flex-start`; `SessionListItem.test.tsx` asserts the timestamp is inside the same `__title` group as the name, immediately after it, and that the three buttons are outside it; the delete-confirm and share-status tests unchanged.
- **Content / lint / types / build** clean at every checkpoint; `content.test.ts` unchanged.
- **Mutation checks:** set a paired row to `'row'` and watch the tablet `column` assertion go red; put Gain's `LfoLink` back inside Gain's half and watch the probe order test go red; restore `flex: 1` on `__label` and watch the title-group test go red.

**Manual (Crawford, final checkpoint, real Chrome at ~360 / ~800 / ≥1024 px):** each pair sits side by side on desktop and stacks below it with no slider under its 3-box floor; Shape's five boxes wrap cleanly in their half; the Tempo Sync toggle still holds its size in both modes in its new half-width home (lane and Delay); EQ/filter bands read top-to-bottom with Lane | Depth under each; Phase alone vs Phase | Interval when switching a layer to and from `pulse`; Retransmit on the left; the session timestamp beside its title with long names still ellipsising; nothing else in the app moved.

---

## 6. Git & Workflow Context

- Branch: `layout/post-sync-toggle`, cut from `feature/sync-toggle` at 1366fe39 (it restructures the Delay row Free | Sync just shipped, so it must build on it); rebase onto `main` once Free | Sync merges. One commit per task, imperative subject, body cites the spec section, co-author trailer. Crawford merges.
- Roadmap: **Phase 34 — Layout Updates Pass 2: Post-Sync-Toggle Row Reshuffle** in `docs/todo/roadmap.md` (33 is the last entry). Its "About" summarises §1; "Not Doing": the vertical slider mode's removal (unused after this, kept), `'row'`-on-every-tier variants, any Levels/Composition/Envelope changes, the Phase 30 open items.
- Docs land in the last task.

---

## 7. Open Questions & Risks

**For Crawford — answer before planning if any assumption is wrong:** 1 (responsive vs always-row), 2 (row inside `LfoLink` itself, both call sites), 3 (probe Lane | Depth rows full-width, not inside Gain's half). Everything else is mechanical.

**Risks:**

1. **Half-width horizontal sliders on small desktops.** Just above 1024 px the nav panel's content width may leave each half near the 3-box floor; the Tempo Sync composition in a half is the tightest case (slider + 84 px toggle box + label). Mitigation: the manual checkpoint measures at exactly 1024 px; the fallback (ask first) is `'column'` for that one row below a wider cut.
2. **`RadioButton` inside a flex row.** Its `width: 100%` + inline-size containment is the same trap the Tempo Sync toggle hit; `flex: 1 1 0; min-width: 0` on the row children (DirectionalPanel's rule, restated in `LfoLink`) is the known fix, pinned by the CSS scans.
3. **Vertical mode goes dark.** With no consumer, regressions in the primitives' vertical path would be invisible. Recorded in COMPONENT_LIBRARY.md; its unit tests remain.
4. **Test churn.** About a dozen layout tests encode the archived §1.7 / vertical decisions; each is replaced by its §5 counterpart in the same task as the component change, never deleted ahead of it.
5. **Perf-neutral by construction**: no new subscriptions; `LfoLink` adds one `useCabinetTier` read (a shared matchMedia listener), the same cost every `'responsive'` panel already pays.
