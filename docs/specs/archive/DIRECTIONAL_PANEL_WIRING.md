# Phase Spec: Wire `DirectionalPanel` into the Audio Rig and Robot Effects Drawers

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/directional-panel-wiring.md](../intent/directional-panel-wiring.md) (confirmed via `/interview-me`, 2026-09-04). Related prior art: [docs/specs/DIRECTIONAL_PANEL.md](DIRECTIONAL_PANEL.md) (the primitive this phase gives its first consumers), [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (primitive inventory, `AccordionContainer`/`DirectionalPanel` contracts). This phase is presentation-only — no `AudioEngine`, `BeatClock`, or Zustand-shape change; no new `ControlSchema` variant; every existing control's `value`/`onChange` contract is untouched. It is purely *where* already-working controls render, not *how* they work.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today, and what's changing

Two drawer areas each render a flat list of `AccordionContainer`s, one per logical group, with every control inside stacked one-per-row in an unlabeled block `<div>`:

- **`AudioRigDrawer.tsx`** renders `AUDIO_RIG_CONFIG`'s 7 effect blocks (`eq3`, `filterLPF`, `filterHPF`, `delay`, `reverb`, `compressor`, `limiter`) as 7 top-level accordions, plus a standalone `Robot Drift` accordion, plus two bare sliders (`Automatic Effects`, `Tempo`) with no wrapper at all.
- **Robot Options** (`RobotOptionsTab.tsx` for a single robot, `CompanyOptionsSection.tsx` for a company/all-robots broadcast) each render `AudioSettingSection` (bare, no accordion — mixed into `RobotDisplaySection`'s meta-data card in the single-robot case), then 3 top-level accordions: `PingControlsDrawer` ("Ping Controls" — 6 sliders + a dev toggle + a button), `PingContourDrawer` ("Ping Contour" — 4 sliders), `SignatureArrayDrawer` ("Signature Array" — 3 layer sub-sections).

This phase regroups both into a 2-level structure — `AccordionContainer` (top level, new groupings) → `DirectionalPanel` (nested, one per moved-in old accordion or new logical group) → existing controls (untouched) — per the exact structure confirmed in the intent doc:

**Audio Rig**, 4 accordions replacing the 7+1+2-bare structure:

| # | Accordion (`humanLabel`) | Panels inside (orientation) |
|---|---|---|
| 1 | Transport & Composition | *Speed & Automation* (`column`: Automatic Effects, Tempo — new panel, no prior accordion); *Robot Drift* (`column`: today's standalone `'robots'` `LFO_DRIFT_GROUPS` entry) |
| 2 | EQ & Filters | *3-Band EQ* (`row`: Low/Mid/High + shared LFO display + EQ Drift); *Low-Pass Filter* (`column`: Frequency/Resonance + shared LFO display + Low-Pass Drift); *High-Pass Filter* (`column`, same shape, High-Pass Drift) |
| 3 | Time & Space | *Delay* (`column`: Time/Feedback/Mix); *Reverb* (`column`: Decay/Pre-Delay/Mix) |
| 4 | Output | *Compressor* (`column`: Threshold/Ratio/Attack/Release/Knee + Decay Mode radio); *Limiter* (`column`: Threshold) |

**Robot Effects**, identical at both call sites — one bare panel + 3 accordions:

| Placement | Panel/Accordion (`humanLabel`) | Content |
|---|---|---|
| Above the accordions, no wrapper | **Output** (`column`) | Audio Setting, Volume (+ shared LFO display) |
| Accordion 1 | Melody | *Phrasing* (`column`: Density, Motif Length, Pitch Repeat, Click Track, Reset Melody); *Frequency* (`column`: Octave Min, Octave Max, Note Variance) |
| Accordion 2 | Envelope | *Ping Contour* (`column`: Attack/Decay/Sustain/Release — keeps its old accordion's label) |
| Accordion 3 | Source | *Baseline*, *Coaxial*, *Harmonic* (each `column`: Type/Gain/Detune/Phase/Interval + that layer's shared LFO display) |

Every panel/accordion inheriting from an existing schema keeps that schema's `loreLabel`/`humanLabel` **verbatim** (`3-Band EQ`, `Low-Pass Filter`, `High-Pass Filter`, `Delay`, `Reverb`, `Compressor`, `Limiter`, `Robot Drift`, `Ping Contour`). The 8 new labels (4 new Audio Rig accordions + `Speed & Automation` panel + `Melody`/`Envelope`/`Source` accordions + `Phrasing`/`Frequency` panels — 9 total, see §4) get invented `loreLabel`s in house style (confirmed low-stakes, draft-and-eyeball).

### 1.2 Key structural insight: most of this is self-contained inside existing components

Every one of `PingControlsDrawer`, `PingContourDrawer`, and `SignatureArrayDrawer` already wraps *itself* in its own `AccordionContainer` — the accordion is internal to the component, not applied by the caller (`docs/COMPONENT_LIBRARY.md`'s established pattern for these 3 drawers). That means:

- **Melody** (Phrasing + Frequency) is entirely internal to `PingControlsDrawer.tsx` — its accordion changes from wrapping 8 flat controls to wrapping 2 `DirectionalPanel`s, but its **props interface (`PingControlsDrawerProps`) does not change at all**. Neither call site's JSX changes.
- **Envelope** (Ping Contour) is entirely internal to `PingContourDrawer.tsx` — same shape, 1 panel instead of 4 flat sliders. Props unchanged.
- **Source** (Baseline/Coaxial/Harmonic) is entirely internal to `SignatureArrayDrawer.tsx` — 3 panels instead of 3 unlabeled layer divs. Props unchanged.
- **Output** becomes `AudioSettingSection.tsx` wrapping itself in a `DirectionalPanel` (matching the same "component wraps itself" precedent — `AudioSettingSection` today is the one drawer-ish component that *doesn't* self-wrap, which this phase corrects). Props unchanged.

**Consequence:** `CompanyOptionsSection.tsx` needs **zero JSX changes** — it already renders `AudioSettingSection`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer` in exactly that order, already outside any accordion of its own. All 4 components restructure themselves internally; the call site is unaffected.

`RobotOptionsTab.tsx`/`RobotDisplaySection.tsx` are the one call-site pair that *does* need a structural change, because `AudioSettingSection` is currently rendered *inside* `RobotDisplaySection` (mixed into the avatar/meta-data card) instead of as a sibling — see §1.3.

The Audio Rig side has no such shortcut: `AudioRigDrawer.tsx` itself owns the top-level accordion loop (`AUDIO_RIG_CONFIG.map(...)`), so its own render function changes — see §1.4.

### 1.3 Robot Effects: extracting `AudioSettingSection` from `RobotDisplaySection`

Today, `RobotDisplaySection.tsx` builds `audioSettingValue` from `robot`/`localeId` and renders `<AudioSettingSection>` as its last child, mixed in with the avatar and Name/Job/Battery/Docking/Company rows. Per the confirmed intent, Output must sit as its own panel "beneath the robot meta data section," not inside that same card:

- `RobotDisplaySection.tsx` **loses**: the `AudioSettingSection` import, the `audioSettingValue` construction, the `applyAudioMode`/`applyVolume`/`applyVolumeLfo`/`VOLUME_LFO_TARGET`/`DEFAULT_LFO_SETTINGS`/`LfoValue` imports it only used for that, and the `<AudioSettingSection>` JSX itself. It keeps the avatar + 4 `DualLabel` rows + company `Select` — pure read-only meta-data display, as its own doc comment already frames it.
- `RobotOptionsTab.tsx` **gains**: the `audioSettingValue` construction (moved verbatim from `RobotDisplaySection`) and a new `<AudioSettingSection value={audioSettingValue} onAudioModeChange={...} onVolumeChange={...} onVolumeLfoChange={...} />` call, rendered directly after `<RobotDisplaySection robot={robot} />` and before `<PingControlsDrawer ... />`.
- `CompanyOptionsSection.tsx` is unaffected (§1.2) — it never used `RobotDisplaySection` in the first place.

### 1.4 Audio Rig: restructuring `AudioRigDrawer.tsx`'s render loop

Unlike the robot side, there's no self-wrapping shortcut here — `AudioRigDrawer.tsx` owns its own top-level accordion loop today, and that loop changes shape. New render structure (replacing the current `AUDIO_RIG_CONFIG.map(...)` loop, the standalone `'robots'`-drift loop, and the two bare `master-row` sliders):

```
<div className="audio-rig-drawer">
  <AccordionContainer schema={TRANSPORT_COMPOSITION_ACCORDION_SCHEMA}>
    <DirectionalPanel schema={SPEED_AUTOMATION_PANEL_SCHEMA}>
      <SliderLinear schema={PING_VARIANCE_AUTOMATION_SCHEMA} .../>
      <SliderLinear schema={BPM_SCHEMA} .../>
    </DirectionalPanel>
    <DirectionalPanel schema={robotsDriftGroup.panel}>
      <SliderCenteredZero schema={robotsDriftGroup.rateSchema} .../>
      <SliderCenteredZero schema={robotsDriftGroup.depthSchema} .../>
    </DirectionalPanel>
  </AccordionContainer>

  {AUDIO_RIG_ACCORDION_GROUPS.map((group) => (
    <AccordionContainer key={group.accordion.id} schema={group.accordion}>
      {group.blockKeys.map((key) => {
        const block = AUDIO_RIG_CONFIG.find((b) => b.key === key)!;
        // existing per-block body (AudioRigLfoGroup-or-plain-params-map,
        // + the compressor-only Decay Mode radio) is unchanged — only the
        // wrapper changes, from <AccordionContainer schema={block.accordion}>
        // to <DirectionalPanel schema={block.panel}>.
        return (
          <div className="audio-rig-drawer__effect-block" key={block.key}>
            <DirectionalPanel schema={block.panel}>
              {/* ...unchanged body... */}
            </DirectionalPanel>
          </div>
        );
      })}
    </AccordionContainer>
  ))}
</div>
```

`AudioRigLfoGroup`'s own internals (the `useLfoTargetGroup` call, the per-field `onClick`/`onFocus`/active-class rows, the shared `Lfo` display) are **completely untouched** — `DirectionalPanel` wraps around that existing content exactly as `docs/specs/DIRECTIONAL_PANEL.md` §1.3 describes for `LfoTargetGroup`'s own rows, it never replaces any of it.

### 1.5 `SignatureArrayDrawer`: the same "wrap around, don't replace" rule applies to its per-layer div

Today each layer renders `<div className="signature-array-drawer__layer" data-layer-key={block.key}>` containing its `RadioButton` + `LfoTargetGroup`. Because `DirectionalPanel`'s props are locked to `{ schema, children }` (no prop passthrough — `docs/specs/DIRECTIONAL_PANEL.md` §3), it cannot carry `data-layer-key` itself. So `DirectionalPanel` wraps **around** the existing `signature-array-drawer__layer` div, not in place of it:

```tsx
<DirectionalPanel schema={block.panel} key={block.key}>
  <div className="signature-array-drawer__layer" data-layer-key={block.key}>
    <RadioButton ... />
    <LfoTargetGroup ... />
  </div>
</DirectionalPanel>
```

### 1.6 The two "Output" labels are not a conflict

The Audio Rig's *Output* is an `AccordionContainer` (Compressor + Limiter panels), in `audioRigConfig.ts`/`AudioRigDrawer.tsx`. The Robot Effects' *Output* is a bare `DirectionalPanel` (Audio Setting + Volume, no accordion), in `robotOptionsConfig.ts`/`AudioSettingSection.tsx`. Same `humanLabel`, different shape, different files, different constant names (`AUDIO_OUTPUT_ACCORDION_SCHEMA` vs. `ROBOT_OUTPUT_PANEL_SCHEMA` — see §4). Do not "fix" this into one shared schema during implementation; it's confirmed intentional (intent doc, Design discussion).

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── audioRigConfig.ts            # MODIFIED — see §4.1
│   ├── audioRigConfig.test.ts       # MODIFIED — new schema shape assertions
│   ├── robotOptionsConfig.ts        # MODIFIED — see §4.2
│   └── robotOptionsConfig.test.ts   # MODIFIED — new schema shape assertions
├── components/
│   ├── panels/screen/console/
│   │   ├── AudioRigDrawer.tsx       # MODIFIED — see §1.4
│   │   ├── AudioRigDrawer.css       # MODIFIED — see §4.3
│   │   ├── AudioRigDrawer.test.tsx  # MODIFIED — new accordion/panel nesting assertions
│   │   ├── RobotOptionsTab.tsx      # MODIFIED — see §1.3
│   │   └── RobotOptionsTab.test.tsx # MODIFIED — Output panel now a direct sibling
│   ├── robot/
│   │   ├── RobotDisplaySection.tsx       # MODIFIED — see §1.3 (trimmed)
│   │   ├── RobotDisplaySection.css       # MODIFIED — drop now-unused rules if any
│   │   ├── RobotDisplaySection.test.tsx  # MODIFIED — AudioSettingSection assertions removed
│   │   ├── AudioSettingSection.tsx       # MODIFIED — self-wraps in DirectionalPanel
│   │   ├── AudioSettingSection.css       # MODIFIED — see §4.3
│   │   ├── AudioSettingSection.test.tsx  # MODIFIED — panel-wrapper assertions
│   │   ├── PingControlsDrawer.tsx        # MODIFIED — Melody accordion, Phrasing/Frequency panels
│   │   ├── PingControlsDrawer.css        # MODIFIED — see §4.3
│   │   ├── PingControlsDrawer.test.tsx   # MODIFIED — new nesting assertions
│   │   ├── PingContourDrawer.tsx         # MODIFIED — Envelope accordion, Ping Contour panel
│   │   ├── PingContourDrawer.css         # MODIFIED — see §4.3
│   │   ├── PingContourDrawer.test.tsx    # MODIFIED — new nesting assertions
│   │   ├── SignatureArrayDrawer.tsx      # MODIFIED — Source accordion, 3 layer panels
│   │   ├── SignatureArrayDrawer.css      # MODIFIED — see §4.3
│   │   └── SignatureArrayDrawer.test.tsx # MODIFIED — new nesting assertions
│   └── company/
│       ├── CompanyOptionsSection.tsx      # UNCHANGED — see §1.2
│       └── CompanyOptionsSection.test.tsx # MODIFIED only if it asserts old DOM shape directly
└── (no changes to src/types/controls.ts — no new ControlSchema variant, §1 above)

docs/
└── COMPONENT_LIBRARY.md             # MODIFIED — "Panel orientation" section gets a short
                                      #   "first real consumers" note pointing at this spec;
                                      #   no contract change to document (schemas unchanged)
```

**Explicitly not touched, and why:**

- `src/components/ui/controls/DirectionalPanel.tsx`/`.css`/`.test.tsx`, `AccordionContainer.tsx` — the primitives themselves are unchanged (§3).
- `src/types/controls.ts`/`controls.test.ts` — no new `ControlSchema` variant; every control used here already exists.
- `src/engine/`, `src/stores/`, `src/systems/robotOptionsActions.ts`, `src/systems/companyOptions.ts` — no behavior, state-shape, or wiring change. Every `onChange`/action call stays exactly as it is; only *where* the control renders changes.
- `src/components/company/CompanyOptionsSection.tsx` — no JSX change (§1.2); its test file only changes if any assertion happens to inspect the old flat DOM shape of a child component (verify during implementation, don't assume).
- `src/animation/timelineMap.ts` — no new timeline; `AccordionContainer`'s existing GSAP expand/collapse animation is reused unmodified for every accordion, new or old.

No new dependency. No file is renamed except where §4 says a schema constant is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No behavior change.** Every slider's min/max/step/unit, every handler, every `robotOptionsActions`/`audioStore` call stays exactly as-is. This is a pure regroup-and-relabel pass.
* **No `DirectionalPanel`/`AccordionContainer` API change.** Neither primitive gains a prop. If a `row` panel turns out to overflow in practice, the fix is reconsidering that one panel's orientation or nesting, never adding a `wrap` prop (confirmed out of scope, `docs/specs/DIRECTIONAL_PANEL.md` §3).
* **Orientation is fixed per §1's tables — EQ is the only `row` panel, everything else is `column`** (confirmed, intent doc's Design discussion — derived mechanically from each contained slider's actual schema `orientation`, not a per-panel judgment call). Treat this as provisional per the intent doc — Crawford may ask to flip individual panels after seeing them rendered; don't resist a later correction as "inconsistent with the rule."
* **Labels on moved content are verbatim.** Any panel that inherits from an existing `AccordionSchema` (3-Band EQ, Low-Pass Filter, High-Pass Filter, Delay, Reverb, Compressor, Limiter, Robot Drift, Ping Contour) reuses that schema's exact `loreLabel`/`humanLabel` text — do not reword during the schema-type change from `AccordionSchema` to `DirectionalPanelSchema`.
* **New labels' `humanLabel`s are fixed by the intent doc** (Transport & Composition, EQ & Filters, Time & Space, Output ×2, Speed & Automation, Melody, Envelope, Source, Phrasing, Frequency) — do not rename. `loreLabel`s for these are invented in-house style (§4) — free to iterate on wording, the `humanLabel`s are not.
* **`DirectionalPanel` never gets prop passthrough.** Where a control needs a DOM hook `DirectionalPanel` can't carry (e.g. `SignatureArrayDrawer`'s `data-layer-key`), wrap `DirectionalPanel` *around* the existing element that already carries it (§1.5) — never move that attribute onto `DirectionalPanel` itself, never add a passthrough prop to the primitive.
* **`AudioRigLfoGroup`/`LfoTargetGroup`'s click/focus targeting is untouched.** Both compose fine inside a `DirectionalPanel` today (`docs/specs/DIRECTIONAL_PANEL.md` §1.3, already validated for the EQ3 case this phase now actually exercises) — no change to either component's internals.
* **`CompanyOptionsSection.tsx` gets no JSX change** (§1.2) — if an implementer finds themselves editing this file's render structure, stop and re-check against §1.2; the restructuring belongs inside the 4 leaf components.
* **CLAUDE.md's audio/animation rules are not implicated.** No `Tone` synth, no `AudioEngine` call, no new GSAP timeline (accordion expand/collapse reuses `AccordionContainer`'s existing one), no `setTimeout`/`setInterval`/`requestAnimationFrame`.

---

## 4. Code Style & Architecture Conventions

### 4.1 `src/data/audioRigConfig.ts`

Each file's existing style is preserved — `audioRigConfig.ts` already uses helper functions (`accordionSchema()`, `driftGroupSchema()`), so this file keeps that shape:

- **Rename** `AudioRigEffectBlock.accordion: AccordionSchema` → **`panel: DirectionalPanelSchema`**. Add an `orientation: PanelOrientation` field to the block's own panel-construction call (not a new field on the interface — baked into the schema like every other panel).
- **Rename** the `accordionSchema(key, loreLabel, humanLabel)` helper → **`panelSchema(key, loreLabel, humanLabel, orientation)`**, returning a `DirectionalPanelSchema` (`id: `audioRig.${key}``, `type: 'directionalPanel'`) instead of an `AccordionSchema`. Every existing call site's `loreLabel`/`humanLabel` arguments are unchanged (verbatim label preservation, §3) — only the return type and the new trailing `orientation` argument change. `eq3` passes `'row'`; every other block passes `'column'`.
- **Add a new, more general accordion helper** (loosen `accordionSchema`'s old `key: AudioRigEffectKey` param to `id: string`, since the 4 new top-level accordions aren't `AudioRigEffectKey`s) — reused for both the 4 new top-level accordions and nowhere else in this file:
  ```ts
  function accordionSchema(id: string, loreLabel: string, humanLabel: string): AccordionSchema {
    return { id: `audioRig.${id}`, type: 'accordion', loreLabel, humanLabel };
  }
  ```
- **Add** `AUDIO_RIG_ACCORDION_GROUPS: { accordion: AccordionSchema; blockKeys: AudioRigEffectKey[] }[]`, the 3 effect-block-keyed top-level accordions, in order:
  ```ts
  export const AUDIO_RIG_ACCORDION_GROUPS: { accordion: AccordionSchema; blockKeys: AudioRigEffectKey[] }[] = [
    { accordion: accordionSchema('eqFilters', /* invented lore */, 'EQ & Filters'), blockKeys: ['eq3', 'filterLPF', 'filterHPF'] },
    { accordion: accordionSchema('timeSpace', /* invented lore */, 'Time & Space'), blockKeys: ['delay', 'reverb'] },
    { accordion: accordionSchema('output', /* invented lore */, 'Output'), blockKeys: ['compressor', 'limiter'] },
  ];
  ```
- **Add** `TRANSPORT_COMPOSITION_ACCORDION_SCHEMA: AccordionSchema` (the 4th top-level accordion, not keyed to any effect block — built via the same `accordionSchema()` helper, `id: 'transportComposition'`).
- **Add** `SPEED_AUTOMATION_PANEL_SCHEMA: DirectionalPanelSchema` (`orientation: 'column'`, new invented lore, `humanLabel: 'Speed & Automation'`) — wraps `PING_VARIANCE_AUTOMATION_SCHEMA` + `BPM_SCHEMA`, which are themselves unchanged.
- **`driftGroupSchema()`**: rename its returned `accordion: AccordionSchema` field → `panel: DirectionalPanelSchema` (`type: 'directionalPanel'`, `orientation: 'column'` — matches §1's table; `rateSchema`/`depthSchema` are both `orientation: 'auto'`, resolving per §1 of the intent doc's Design discussion). Only the `'robots'` entry's `.panel` is actually read by `AudioRigDrawer.tsx` post-change (same as today, where only `'robots'`'s `.accordion` is read) — the `eq3`/`filterLPF`/`filterHPF` entries keep the field for schema-shape consistency across `LFO_DRIFT_GROUPS`, unused by the drawer exactly as today.
- **Rename** `AUDIO_RIG_CONFIG`'s constant name is unchanged (still the flat 7-block array — it's now looked up by key from within `AUDIO_RIG_ACCORDION_GROUPS`'s render loop instead of mapped directly).

### 4.2 `src/data/robotOptionsConfig.ts`

This file's existing style is literal exported `const` schema objects (no helper functions, unlike `audioRigConfig.ts`) — new schemas follow that same literal-object convention, matching the surrounding code in this file specifically (not `audioRigConfig.ts`'s helper style):

- **Add** `ROBOT_OUTPUT_PANEL_SCHEMA: DirectionalPanelSchema` (`id: 'robotOptions.output'`, `orientation: 'column'`, new invented lore, `humanLabel: 'Output'`) — consumed by `AudioSettingSection.tsx`.
- **Add** `MELODY_ACCORDION_SCHEMA`, `ENVELOPE_ACCORDION_SCHEMA`, `SOURCE_ACCORDION_SCHEMA` (all `AccordionSchema`, new invented lore, `humanLabel`s `'Melody'`/`'Envelope'`/`'Source'`).
- **Add** `PHRASING_PANEL_SCHEMA`, `FREQUENCY_PANEL_SCHEMA` (`DirectionalPanelSchema`, `orientation: 'column'`, new invented lore, `humanLabel`s `'Phrasing'`/`'Frequency'`) — new labels, not inherited from `PING_CONTROLS_ACCORDION_SCHEMA` (that whole accordion is being split into two differently-labeled panels, not moved as one unit).
- **Remove** `PING_CONTROLS_ACCORDION_SCHEMA` — fully superseded by `MELODY_ACCORDION_SCHEMA` + the 2 new panels; no consumer needs the old accordion shape once `PingControlsDrawer.tsx` is updated.
- **Rename** `PING_CONTOUR_ACCORDION_SCHEMA` → **`PING_CONTOUR_PANEL_SCHEMA`** (`type: 'directionalPanel'`, `orientation: 'column'`, **same `loreLabel`/`humanLabel` text unchanged** — verbatim label preservation, this one panel keeps its old accordion's exact copy per §1's table). `ENVELOPE_ACCORDION_SCHEMA` (new, above) becomes the accordion that now wraps it.
- **Remove** `SIGNATURE_ARRAY_ACCORDION_SCHEMA` — superseded by `SOURCE_ACCORDION_SCHEMA`; each layer's own panel comes from `SIGNATURE_ARRAY_CONFIG[i].panel` (below), not a shared accordion schema.
- **`makeLayerBlock()`**: add a `panel: DirectionalPanelSchema` field to `SignatureArrayLayerBlock`, built inline in this existing helper function (it already builds several inline literal `ControlSchema` objects — matches its own local style) from the same `key`/`humanLabel`/`loreLabel` arguments the function already receives:
  ```ts
  panel: { id: `robotOptions.${key}.panel`, type: 'directionalPanel', loreLabel, humanLabel, orientation: 'column' },
  ```
  No new lore/human copy needed here — `Baseline`/`Coaxial`/`Harmonic` and their existing lore strings (`'BASELINE'`/`'COAXIAL'`/`'HARMONIC'`) are reused verbatim, since these 3 already have exactly the right label per §3's verbatim rule (they were never their own top-level accordion before, but they're clearly "the content of the old Signature Array accordion, split 3 ways, each keeping the name it already had for that layer").

### 4.3 CSS — `.audio-rig-drawer__effect-block`-style boxing

Every existing drawer's `.css` file gives its component's own outer wrapper a `flex; column; gap` shape and nothing more elaborate — `DirectionalPanel.css` already supplies its own `sc-directional-panel`/`sc-directional-panel__content` rules (label-to-content gap, row/column flex, `nowrap`), so no new CSS class is needed purely to make panels render. The one existing visual you'd otherwise lose is `AudioRigDrawer.css`'s `.audio-rig-drawer__effect-block` bordered/backgrounded box (currently drawn once per effect block, at the same nesting level as its accordion). Under the new nesting, keep drawing that same box around each block's `DirectionalPanel` (i.e. the `<div className="audio-rig-drawer__effect-block">` wrapper from §1.4's sketch stays, now one level deeper inside the new top-level accordion, instead of one level higher around the block's own accordion). This is an inferred visual detail, not dictated by the intent doc — flagged in §7, confirm by eye during manual check rather than treated as load-bearing.

No other CSS file needs a new class — `PingControlsDrawer.css`/`PingContourDrawer.css`/`SignatureArrayDrawer.css`/`AudioSettingSection.css`/`RobotDisplaySection.css` keep their existing outer-wrapper rules; only `SignatureArrayDrawer.css`'s `.signature-array-drawer__layer` rule stays exactly as-is (§1.5 — that div still exists, just now nested one level deeper inside its own `DirectionalPanel`).

### 4.4 Naming conventions

- New `AccordionSchema`/`DirectionalPanelSchema` constants: `SCREAMING_SNAKE_CASE` ending in `_ACCORDION_SCHEMA`/`_PANEL_SCHEMA`, matching every existing schema constant in both config files exactly (e.g. `PING_CONTOUR_PANEL_SCHEMA`, not `pingContourPanelSchema` or `PingContourPanel`).
- Schema `id`s: `audioRig.<camelCaseId>` / `robotOptions.<camelCaseId>` prefix, matching every existing id in each file (e.g. `audioRig.transportComposition`, `robotOptions.output`, `robotOptions.layer0.panel`).
- **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, colocated test files (matching every file in §2).
* **No new test file** — every test file in §2 already exists for the component it tests; this phase updates their assertions to match the new DOM nesting, it doesn't add new suites.
* **Per-file testing focus:**
  - `audioRigConfig.test.ts` / `robotOptionsConfig.test.ts`: assert the new/renamed schema constants' shape (`type: 'directionalPanel'` vs `'accordion'`, `orientation`, and — critically — that every relabeled-verbatim constant's `loreLabel`/`humanLabel` text is byte-identical to what it was before the rename, guarding against an accidental copy change during the type swap).
  - `AudioRigDrawer.test.tsx`: replace the "renders all 7 effect accordions" style assertions with assertions against the new 4-accordion structure — each of the 7 old block labels (`3-Band EQ`, `Low-Pass Filter`, etc.) is now findable as `DirectionalPanel` content *inside* its new parent accordion (`.sc-accordion__content-inner .sc-directional-panel`), not as its own `.sc-accordion`. The existing "renders as a bare control, outside any accordion" assertions for Automatic Effects/Tempo (`AudioRigDrawer.test.tsx:413`, `:446`) are now **false** under the new structure and must be rewritten to assert the opposite: both now live inside the Transport & Composition accordion's Speed & Automation panel. Same for the standalone "renders exactly one standalone Drift accordion — Robot Drift" assertion (`:294`) — Robot Drift is no longer its own `AccordionContainer`, it's a `DirectionalPanel` nested in Transport & Composition.
  - `RobotDisplaySection.test.tsx`: remove any assertion that `AudioSettingSection`'s content (Audio Setting radio, Volume slider) renders inside `RobotDisplaySection`'s own output — it no longer does.
  - `RobotOptionsTab.test.tsx`: add/adjust assertions that Audio Setting + Volume render as a direct sibling between `RobotDisplaySection` and `PingControlsDrawer`, wrapped in a `DirectionalPanel` (not an accordion).
  - `AudioSettingSection.test.tsx`: assert the component now renders its own `DirectionalPanel` wrapper (`sc-directional-panel`) around its existing content, with `data-orientation="column"`.
  - `PingControlsDrawer.test.tsx`/`PingContourDrawer.test.tsx`/`SignatureArrayDrawer.test.tsx`: assert the new nested shape (1 accordion containing N panels) instead of 1 accordion containing flat controls; assert every existing per-field behavior (disabled states, LFO wiring, click/focus targeting) is unchanged — these are regression assertions, not new behavior to test.
  - `CompanyOptionsSection.test.tsx`: verify whether any assertion currently reaches into a child component's internal DOM shape (accordion vs. panel) — if so, update to match; if it only asserts values/callbacks (the established pattern per this file's own doc comment), no change needed.
* **Verification Steps** (every task in the eventual task list re-runs all of these, not just the modified file's own suite — this phase touches enough shared config that a change in one file can silently break another's assumptions):
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (required, unlike the sibling `DirectionalPanel` spec which had no live consumer to check):** Open both `AudioRigDrawer` (global chain) and Robot Options (single robot + company broadcast) in the running app. Confirm: EQ's Low/Mid/High render side-by-side and don't overflow their container; every `column` panel's grouped label reads clearly above its stacked controls; Output (robot side) visually sits above Melody, not inside any accordion; nothing regresses `AudioRigLfoGroup`/`LfoTargetGroup`'s click/focus-to-select-for-LFO behavior on any control that has it.

---

## 6. Documentation & Git/Workflow Context

* **`docs/COMPONENT_LIBRARY.md` update:** Add one short line to the existing "Panel orientation (`PanelOrientation`)" subsection noting `DirectionalPanel` now has real consumers (Audio Rig + Robot Effects drawers) and pointing at this spec — no contract change to document, since neither primitive's props changed.
* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/panels` (already checked out).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable, following the dependency order in §7 of the eventual task list: (1) `audioRigConfig.ts` + its test — schema restructuring, no consumer change yet; (2) `AudioRigDrawer.tsx`/`.css` + its test — the actual Audio Rig re-render; (3) `robotOptionsConfig.ts` + its test — schema restructuring; (4) `AudioSettingSection.tsx`/`.css` + `RobotDisplaySection.tsx`/`.css` + `RobotOptionsTab.tsx` + their tests — the Output extraction; (5) `PingControlsDrawer.tsx`/`.css` + its test — Melody; (6) `PingContourDrawer.tsx`/`.css` + its test — Envelope; (7) `SignatureArrayDrawer.tsx`/`.css` + its test — Source; (8) `docs/COMPONENT_LIBRARY.md`.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Which primitive is "Accordion" and which is "Panel"?~~ **Resolved: `AccordionContainer` / `DirectionalPanel` respectively** (intent doc, confirmed).
- ~~What orientation does each panel get?~~ **Resolved: EQ is the one `row` panel, everything else `column`**, derived mechanically from each contained slider's actual schema `orientation` (intent doc's Design discussion) — provisional, may be adjusted per-panel after visual review.
- ~~Where do Decay Mode / Click Track+Reset Melody / Interval land?~~ **Resolved:** Decay Mode → Compressor panel; Click Track + Reset Melody → Phrasing panel; Interval → stays with its layer's panel (§1 intent doc).
- ~~Does Output get extracted out of `RobotDisplaySection`?~~ **Resolved: yes**, into its own top-level panel at both call sites (§1.3).
- ~~Do the 2 "Output" labels (Audio Rig vs. Robot Effects) need to be reconciled?~~ **Resolved: no — confirmed intentional, different shapes, not a naming bug** (§1.6).
- ~~One combined pass, or split by side?~~ **Resolved: one combined pass** ("it's all the same work," intent doc).

Still open — flag for Plan/Tasks, not blocking this spec:

1. **The `.audio-rig-drawer__effect-block` bordered-box treatment moving one nesting level deeper (§4.3) is an inferred visual detail**, not dictated by the intent doc. Low risk (it's a boundary/background box, not a structural claim), but worth a visual confirmation during the manual check (§5) alongside the already-flagged gap-value inference from `docs/specs/DIRECTIONAL_PANEL.md` §7.
2. **9 new `loreLabel`s need drafting** (§4.1, §4.2) — first-pass copy, same "confirm during manual check" treatment `LFO_DRIFT_GROUPS`' own labels already got; not blocking, but flag for a copy pass during review same as that precedent.
3. **`docs/specs/DIRECTIONAL_PANEL.md` §7 item 3's flagged `ResizeObserver` risk for `'auto'`-orientation sliders nested in a `DirectionalPanel`** is sidestepped by this phase's all-`column`-except-EQ orientation choice (intent doc's Design discussion already explains why), but if Crawford later flips any `'auto'`-slider panel to `row`, that risk becomes live and needs its own check at that time — not a blocker now, just don't forget it exists when a future orientation tweak happens.
4. **Whether any `CompanyOptionsSection.test.tsx` assertion reaches into child-component DOM shape** (§2, §5) needs a direct check during implementation rather than an assumption — flagged rather than guessed, since this spec was written by reading the component's own source, not by running its test suite.
