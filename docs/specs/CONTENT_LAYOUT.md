# Phase Spec: Control Layout (tabs, sub-tabs, panels and rows for Params and Probes)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types`
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/control-layout.md](../intent/control-layout.md) (confirmed 2026-11-15), and
Crawford's two sheets, [Layout - Params.csv](../reference/Layout%20-%20Params.csv) and
[Layout - Robots.csv](../reference/Layout%20-%20Robots.csv). §1.2 and §1.3 restate the sheets as the
tables the build and its tests follow. If a table and a sheet disagree, that is a conflict to surface,
not a choice to make while building.

Survey basis (2026-11-15, against `main`):

- **Tabs.** `SectionTabs` (`src/components/ui/controls/SectionTabs.tsx`) is Radix Tabs with one tab in
  the DOM at a time; `variant="sub"` nests a second row. Each item carries `id`, `content` (a content
  key), `trait` and `render`.
- **Fleet Params** (`FleetParamsScreen.tsx`): eight tabs from `SECTIONS`, keyed by `FleetParamsGroup`
  (`uiStore.ts`). `pacing` and `quality` are single panels (`SINGLE_PANEL`); the other six read their
  sub-tabs from `FLEET_PARAMS_SUBSECTIONS` (`navActions.ts`), which the breadcrumb reads too.
  `DEFAULT_FLEET_PARAMS_SECTION` is `lfoBank`.
- **Effect panels** (`AudioRigEffectPanel` in `AudioRigDrawer.tsx`): one framed `DirectionalPanel` per
  effect, with five hand-composed branches (compressor, delay, the four synced-rate pedals, reverb, and
  a generic map). The param list and the panel heading come from `AUDIO_RIG_CONFIG`
  (`audioRigConfig.ts`).
- **Robot, company and All Probes** all render `RobotSectionTabs` (`RobotScreen.tsx`) over
  `ROBOT_SECTIONS_CONFIG` (`robotSubsectionConfig.ts`). Only Source has sub-tabs today. The five
  section components (`AudioSettingSection`, `PingControlsCompositionSection`, `PingContourDrawer`,
  `SignatureArrayLayer`, `BusFilterDrawer`) are shared with `CompanyOptionsSection.tsx`.
- **Boxes and rows.** A top-level `DirectionalPanel` draws a cabinetry box; a nested one is unframed.
  `orientation: 'responsive'` is a row on desktop (1024 px and wider) and a column on tablet and phone.
  Composition and Pacing already stack several top-level boxes in one view.
- **Intro panels** render in five places: `FleetParamsScreen.tsx` (the screen's, and one per tab),
  `RobotSectionTabs` (one per tab), `CompanyScreen.tsx` (one above the tabs) and `RosterBoard.tsx`.
- **Tab state is not saved.** `fleetParamsSection`, `fleetParamsSubsection`, `selectedSection` and
  `selectedSubsection` are read only by `uiStore`, the nav files and the screens; no session or link
  code touches them, so their ids can change freely.
- **Content guard.** `content.test.ts` fails a key nothing references, and fails two same-area entries
  with the same human and lore pair. A bare human word with no lore may recur.

ASSUMPTIONS I'm making beyond the intent (correct now or I'll proceed with these):

1. **"Stack on phones" is the house tier:** rows are `'responsive'`, so they also stack on tablet (below
   1024 px). No new breakpoint.
2. **Headings.** A box keeps today's heading when it still holds everything the heading names: Settings
   (Audio Load), Reverb, Delay, Distortion, Chebyshev, Bit Crusher, Tremolo, Vibrato, Shifter, Width,
   Limiter and Contour. Where one sub-tab is now several boxes, no box takes the heading and the sub-tab
   names the group: the four lanes, 3-Band EQ, both filters, Auto Wah, Phaser, Chorus, Compressor, the
   three oscillators and the robot Filter. Every control's own label stays with it inside its box.
3. **Boxes stack** in number order on every tier, spaced as today's stacked boxes are.
4. **Featured is a class on the control's cell**, the wrapper that holds the control and its label, with
   no CSS rule yet. The flag is `featured` on the control's schema.
5. **"Description" on Settings is the live limits readout** (`.audio-load-panel__readout`), now left of
   Preset, as the sheet orders them.
6. **Pan and Auto stay side by side on every tier**, as today: the row is a fixed `'row'` because the
   toggle holds a 44 px box.
7. **World wears Pacing's trait** (Composition). Inside it, Pacing's boxes keep Composition and
   Settings' box keeps Seed, so no box changes colour.
8. **Fleet Params still opens on LFOs** (`DEFAULT_FLEET_PARAMS_SECTION` unchanged), not on World.
9. **Renames reach copy that names the label.** Where help text names a renamed label word for word,
   that mention changes with it. Nothing else in the copy changes.
10. **New names get no lore yet.** World, Mix, Sends, Rhythm & Melody, Details and Character are
    entries with a `human` only; lore is the content sweep's.
11. **Unchanged, as the intent's two open label groups:** Auto stays "Auto", and the oscillator controls
    keep "Core Type", "Core Gain" and so on.

---

## 1. Overview & Claude Explanation

A layout pass with no behaviour change. Fleet Params goes from eight tabs to seven, every robot tab
gains sub-tabs, and every sub-tab becomes one or more cabinetry boxes whose rows match Crawford's
sheets. Thirty-two controls gain a `featured` class, ten labels are renamed, and the intro panels
stay (§1.6). No store action, audio call, schema range or saved value changes. The mechanism is
the one the code already has: `SectionTabs` for tabs, a top-level `DirectionalPanel` per box, and a
nested `'responsive'` one per shared row.

### 1.1 Reading the tables

`P` is a panel (one box), `R` a row. `A | B` share a row: side by side on desktop, stacked below it.
`★` is featured. `(sync)` carries the Free | Sync toggle, unchanged. `link` is the control's `LfoLink`
(Lane | Depth), unchanged.

### 1.2 Fleet Params

Tabs, in order: **World, LFOs, EQ & Filters, Time & Space, Color, Modulation, Output.**

| Sub-tab | Panels and rows |
|---|---|
| World > Pacing | P1: R1 Tempo★ · R2 Humanize. P2: R1 Automation Rate★ · R2 Automation Length \| Automation Range |
| World > Settings | P1: R1 Description \| Preset · R2 Voice Limit \| Effects Limit |
| LFOs > each lane | P1: R1 Shape \| Rate★ (sync). P2: R1 Rate Drift \| Depth Drift |
| 3-Band EQ | P1: R1 Bass★ · R2 link. P2: R1 Mid★ · R2 link. P3: R1 Treble★ · R2 link |
| High-Pass Filter | P1: R1 Cutoff★ · R2 link. P2: R1 Resonance · R2 link |
| Low-Pass Filter | P1: R1 Cutoff★ · R2 link. P2: R1 Resonance · R2 link |
| Reverb | P1: R1 Reverb Amount★ · R2 Reverb Length \| Pre-Delay |
| Delay | P1: R1 Delay Amount★ · R2 Delay Time (sync) \| Repeats |
| Distortion | P1: R1 Mix★ · R2 Drive |
| Chebyshev | P1: R1 Mix★ · R2 Harmonics |
| Bit Crusher | P1: R1 Mix★ · R2 Bit Depth |
| Auto Wah | P1: R1 Mix★ · R2 Base Frequency \| Octaves. P2: R1 Sensitivity \| Resonance · R2 Peak \| Follow |
| Phaser | P1: R1 Mix★ · R2 Base Frequency \| Rate (sync) · R3 Octaves. P2: R1 Stages \| Resonance |
| Chorus | P1: R1 Return★ · R2 Rate (sync) \| Depth. P2: R1 Delay \| Spread · R2 Feedback |
| Tremolo | P1: R1 Mix★ · R2 Rate (sync) \| Depth · R3 Spread |
| Vibrato | P1: R1 Mix★ · R2 Rate (sync) \| Depth |
| Shifter | P1: R1 Return★ · R2 Shift |
| Compressor | P1: R1 Threshold \| Ratio · R2 Knee. P2: R1 Attack Time \| Release Time · R2 Decay |
| Width | P1: R1 Width★ |
| Limiter | P1: R1 Ceiling★ |

- **Tab state.** `FleetParamsGroup` becomes `'world' | 'lfoBank' | 'eqFilters' | 'timeSpace' | 'colour' |
  'modulation' | 'output'`. `SelectedFleetParamsEffect` gains `'pacing'` and `'quality'`, and
  `FLEET_PARAMS_SUBSECTIONS.world` lists them. `SINGLE_PANEL` goes: every tab is a sub-tab row. The
  breadcrumb needs no new code and reads Root / Fleet Params / World / Pacing.
- **Effect layout is data.** `AudioRigEffectBlock` gains `layout`: panels, each a list of rows, each a
  list of cell tokens (a param `field`, `'<field>.link'` for its `LfoLink`, or `'decayMode'`). The
  panel and row schemas are built once at module load from it. `AudioRigEffectPanel`'s five branches
  become one walk over `layout`; a cell still renders through `paramRow`, `TempoSyncSlider` for `rate`
  and `delayTime`, and the Decay radio. Its selectors, memo maps and handlers do not change.
- **Held-off notes stay with their control:** the Mix or Amount row's note moves with it to row 1, a
  filter link's note stays under its link, and the lanes' drift note stays in the drift box.
- **Lanes, Pacing and Settings** stay hand-composed in `LfoBankLanePanel`, `PacingPanel` and
  `AudioLoadPanel`.

### 1.3 Robot, company and All Probes

Tabs, unchanged: **Levels, Composition, Envelope, Source.** The screen still opens on Source.

| Sub-tab | Panels and rows |
|---|---|
| Levels > Mix | P1: R1 Volume★ · R2 Monitor Mode \| Dynamics. P2: R1 Pan \| Auto |
| Levels > Sends | P1: R1 Reverb \| Delay · R2 Grit \| Shimmer · R3 Double |
| Composition > Rhythm & Melody | P1: R1 Note Density \| Phrase Length · R2 Pitch Repeat Chance \| Note Variance · R3 Click Track (dev only) |
| Composition > Details | P1: R1 Rests \| Accents · R2 Octave Min \| Octave Max |
| Envelope > Contour | P1: R1 Attack \| Decay · R2 Sustain \| Release |
| Envelope > Character | P1: R1 Portamento · R2 Attack Shape · R3 Release Shape |
| Source > each oscillator | P1: R1 Type \| Gain★ · R2 Gain link. P2: R1 Detune★ · R2 Detune link. P3: R1 Phase · R2 Interval (pulse only) |
| Source > Filter | P1: R1 Cutoff★ · R2 Cutoff link. P2: R1 Resonance \| Type |

- **Tab state.** `RobotSubsection` becomes `'mix' | 'sends' | 'rhythmMelody' | 'details' | 'pingContour'
  | 'envelopeCharacter'` plus the three oscillators and `'busFilter'`. In `ROBOT_SECTIONS_CONFIG` a
  section carries its tab's content key and each subsection its sub-tab's; `mergedInto` and the
  separate `accordion` key go. `sectionSubTabs` returns every section's sub-tabs.
- **Section components split by sub-tab,** in their current files and still memoised: Mix and Sends
  from `AudioSettingSection`, Rhythm & Melody and Details from `PingControlsCompositionSection`,
  Contour and Character from `PingContourDrawer`. `SignatureArrayLayer` and `BusFilterDrawer` keep
  their names and render three and two boxes. The robot and company renderers switch on the new ids
  and pass the same values and handlers.
- **Pitch Repeat Chance** is still disabled while Phrase Length is 0, now beside it on one sub-tab.
- **Click Track** renders only under `DEV_TUNING`, as the last row of the Rhythm & Melody box.
- **Interval** is a second row in P3 while the type is `pulse`; otherwise P3 is Phase alone.
- **The Articulation panel goes**; Rests and Accents are a plain row. The sends' held-off note stays at
  the foot of the Sends box.

### 1.4 Featured

`ControlSchemaBase` gains `featured?: boolean`. A cell whose control's schema has it adds `sc-featured`,
through `withFeaturedClass(base, schema)` beside `withHeldOffClass` in `activeClass.ts`. No stylesheet
names the class in this pass. The thirty-two:

- **Fleet (24):** `audioRig.bpm`, `audioRig.swellFrequency`, the four lanes' `rate`, `eq3.low`,
  `eq3.mid`, `eq3.high`, `filterHPF.frequency`, `filterLPF.frequency`, `reverb.wet`, `delay.wet`,
  `distortion.wet`, `chebyshev.wet`, `bitCrusher.wet`, `autoWah.wet`, `phaser.wet`, `chorus.wet`,
  `tremolo.wet`, `vibrato.wet`, `frequencyShifter.wet`, `stereoWidener.width`, `limiter.threshold`.
- **Robot (8):** `robotOptions.volume`, each layer's `gain` and `detune`, `robotOptions.busFilter.cutoff`.

### 1.5 Names

| Key | Today | New |
|---|---|---|
| `fleet.world` (new) | | World |
| `fleet.quality` | Audio Quality | Settings |
| `fleet.lfoBank` | LFO Bank | LFOs |
| `fleet.colour` | Colour | Color |
| `fleet.output.decayMode` | Decay Mode | Decay |
| `probe.levels.mix`, `probe.levels.sends` (new) | | Mix, Sends |
| `probe.composition.rhythmMelody`, `probe.composition.details` (new) | | Rhythm & Melody, Details |
| `probe.envelope.character` (new) | | Character |
| `probe.composition.lowestOctave`, `.highestOctave` | Lowest Octave, Highest Octave | Octave Min, Octave Max |
| `probe.envelope.attack`, `.decay`, `.sustain`, `.release` | Attack Time, Decay Time, Sustain Level, Release Time | Attack, Decay, Sustain, Release |

Keys stay as they are; only `human` changes. An entry left with no consumer is deleted, because the
guard fails an orphan. The plan checks each of `probe.dynamics`, `probe.dynamics.levelControl`,
`probe.composition.rhythm`, `probe.composition.pitches` and `probe.composition.articulation`.

### 1.6 Intro panels

**The intro panels stay, at all five render sites** (Crawford, 2026-11-15: they give the screens some
visual separation for now and will change later). An earlier draft removed them; Task 3 did, and was
reversed the same day. A tab's intro still sits first in its panel, above any sub-tab row, so World
needs an intro of its own (Task 8). `IntroPanel.tsx`, its CSS and tests, `intro()`, `introProps()` and
every `intro` field in `src/content/copy/` stay, and the copy is kept accurate as the layout moves
(assumption 9).

---

## 2. Target File Structure

```text
src/
├── stores/uiStore.ts                       FleetParamsGroup, SelectedFleetParamsEffect, RobotSubsection
├── types/controls.ts                       ControlSchemaBase.featured
├── content/copy/fleet.ts, probe.ts         §1.5
├── data/
│   ├── audioRigConfig.ts                   layout per effect; featured flags; headings per assumption 2
│   ├── robotOptionsConfig.ts               panel and row schemas per §1.3; featured flags; Articulation schema removed
│   └── robotSubsectionConfig.ts            sub-tabs for all four sections
└── components/
    ├── ui/controls/activeClass.ts          withFeaturedClass
    ├── panels/screen/
    │   ├── nav/navActions.ts               world's sub-tabs, group content
    │   ├── screens/FleetParamsScreen.tsx   seven tabs, World's sub-tabs, PacingPanel's two boxes
    │   ├── screens/RobotScreen.tsx         renderer on the new ids
    │   └── console/AudioRigDrawer.tsx, LfoBankLanePanel.tsx, AudioLoadPanel.tsx
    ├── robot/AudioSettingSection.tsx, PingControlsDrawer.tsx, PingContourDrawer.tsx,
    │         SignatureArrayDrawer.tsx, BusFilterDrawer.tsx
    └── company/CompanyOptionsSection.tsx   renderer on the new ids
docs/
├── UI_SHELL.md, COMPONENT_LIBRARY.md, CONTENT_LAYER.md   where they name the tabs, intros or renamed labels
└── todo/roadmap.md                                       the phase entry
```

Each file's co-located test and CSS file is in scope with it. Not touched: every store but `uiStore`,
the engine, every primitive, `IntroPanel`, `SectionTabs`, `DirectionalPanel`, `index.css`, session and
link code, the avatar column, the nav panel.

---

## 3. Implementation Boundaries & Constraints

- **Always:** keep every leaf control in a cell wrapper of its own; keep `React.memo` and the stable
  handler and schema references each component has today; build shared rows as nested `'responsive'`
  `DirectionalPanel`s; read every string through `labels()`; run lint, types and tests before each
  commit.
- **Layout only.** No store action, handler wiring, schema id of a control, range, step or default
  changes. A behaviour test that goes red is a bug in the change.
- **Ask first:** any change to a primitive, `SectionTabs`, `DirectionalPanel` or `index.css`; a CSS rule
  for `sc-featured`; a new dependency; changing a `'responsive'` row to a fixed one; deleting a content
  entry not listed in §1.5.
- **Never:** delete `IntroPanel` or intro copy; add or remove a control; write a display string in a
  component or config; relax a CLAUDE.md guardrail; touch `.env*` or build output.

---

## 4. Code Style & Architecture Conventions

An effect's layout, as data that reads like its row in §1.2:

```typescript
// audioRigConfig.ts — the Phaser's block
key: 'phaser',
/** Panels > rows > cells (docs/specs/CONTENT_LAYOUT.md §1.2). A row of two is a nested 'responsive' panel. */
layout: [
  [['wet'], ['baseFrequency', 'rate'], ['octaves']],
  [['stages', 'Q']],
],
```

Ids follow the sheet so a test can find a box by number: `audioRig.phaser.p1` for a box and
`audioRig.phaser.p1.r2` for a shared row, the same `p<n>` and `r<m>` under `robotOptions.*` and
`fleetParams.*`. A cell is the existing wrapper plus the featured class:

```tsx
<div className={withFeaturedClass(withHeldOffClass('audio-rig-drawer__param-row', heldOff), param.schema)}>
```

Conventions: named exports, memo-wrapped components stay memo-wrapped, module-scope schema constants,
co-located CSS and tests, doc comments that cite this spec's section.

---

## 5. Testing & Verification Requirements

Vitest and Testing Library, co-located, RED first, one commit per task. Tests render what they check.
No test reads a sheet, a stylesheet or a source file.

- **Tab state** (`uiStore`, `navActions`, `robotSubsectionConfig`): the seven groups and their
  sub-tabs; the stale-value fallback to a section's first sub-tab; the breadcrumb trail for World >
  Pacing and for a robot's Levels > Sends.
- **Config** (`audioRigConfig`, `robotOptionsConfig`): every param of every effect appears exactly once
  in its `layout`; the set of featured schema ids equals §1.4's list; each renamed label resolves to
  its new name.
- **Screens** (`FleetParamsScreen`, `RobotScreen`, `CompanyScreen`): the tabs and sub-tabs by name and
  order; the company screen shows the robot's sub-tabs.
- **Panels:** for each sub-tab, the boxes by `data-panel-id` and the controls in each by accessible
  name, in §1.2 and §1.3's order; a shared row is `row` with the tier mocked to desktop and `column`
  on tablet; featured cells carry `sc-featured` and no other cell does.
- **Carried behaviour:** Pitch Repeat Chance disabled at Phrase Length 0; Click Track only under
  `DEV_TUNING`; Interval only for `pulse`; held-off notes beside their control; every existing wiring,
  swell and re-render test green and unedited.
- **Intros:** the existing intro tests stay; World's intro joins the per-tab intro case when World
  becomes a tab (Task 8).
- **No test for:** the renames or any other copy edit, spacing, or any CSS. Those are a look in the
  browser or a read, named on the task's Proof line.

**Manual (Crawford, final checkpoint, real Chrome at phone, tablet and desktop widths):** every sub-tab
against its row in §1.2 and §1.3; pairs side by side on desktop and stacked below it; no slider under
its three-box floor in a half-width cell; the Tempo Sync toggle holding its size in its new rows; the
oscillator's third box growing and shrinking with Interval; nothing else in the app moved.

---

## 6. Git & Workflow Context

- Branch: `feature/control-layout` from `main`. One commit per task, imperative subject, body citing
  the spec section. Crawford opens the PR.
- The intent file, this spec and the two sheets are untracked on `main` today; they go in the branch's
  first commit.
- Roadmap: a new phase entry under the next free number. Docs land in the last task.

---

## 7. Success Criteria

1. Fleet Params shows seven tabs in §1.2's order, and every sub-tab matches its row there.
2. The robot, company and All Probes screens show §1.3's sub-tabs and rows, identically.
3. Exactly the thirty-two cells of §1.4 carry `sc-featured`.
4. Every name in §1.5 reads as its "New" column in tabs, sub-tabs, labels and the breadcrumb.
5. Every screen that had an intro panel still has it, World included, and no intro or help sentence
   names a control, tab or sub-tab that is not on screen (§1.6, assumption 9).
6. Every control still reads and writes the value it did; no behaviour test was edited to pass.
7. `npm run lint`, `npm run build:types`, `npm test` and `npm run build` are clean.
8. Crawford's manual pass at three widths finds each pair side by side on desktop and stacked below it.

---

## 8. Open Questions & Risks

**For Crawford, before planning:**

1. **Headings (assumption 2).** Twelve single-box sub-tabs keep their heading and fifteen multi-box ones
   lose it, so Reverb has a heading and the EQ does not. The alternative is no box heading anywhere,
   with the sub-tab as the only name. Which?
2. **Renames in help text (assumption 9).** Is it right to change a renamed label where help copy names
   it, or should every word of help wait for the content sweep?
3. **Where Fleet Params opens (assumption 8).** It opens on LFOs today. Should it open on World now
   that World is first?
4. **Settings row 1 (assumption 5).** The readout moves to the left of Preset, following the sheet's
   order. Intended, or just the order the rows were typed in?

**Risks:**

1. **`AudioRigEffectPanel` is perf-sensitive.** Its per-effect selectors and stable maps exist because
   a swell tick once re-rendered the whole panel. The data-driven walk must keep every reference
   stable; the existing re-render tests are the gate.
2. **Half-width cells near 1024 px.** A Free | Sync slider in half a row is the tightest case (Phaser's
   Rate beside Base Frequency). The manual pass measures it; the fallback, ask first, is a full row.
3. **Test churn.** The layout tests of every file in §2 encode today's shapes. Each is replaced in the
   same task as its component, never ahead of it.
4. **Orphaned content.** Dropping the Rhythm, Pitches and Articulation names may leave keys the guard
   then fails; deleting them is forced, and is the only content removed.
5. **Fewer controls mounted.** Sub-tabs mean a smaller DOM per view than today, so no perf cost is
   expected; `npm run perf` is not a gate here.
