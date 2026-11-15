# Implementation Plan: Control Layout

Source spec: [docs/specs/CONTENT_LAYOUT.md](../specs/CONTENT_LAYOUT.md). Source intent:
[docs/intent/control-layout.md](../intent/control-layout.md). Layout sheets:
[Layout - Params.csv](../reference/Layout%20-%20Params.csv),
[Layout - Robots.csv](../reference/Layout%20-%20Robots.csv). Roadmap slot: none yet; Task 19 adds the
entry under the next free number.

## Overview

Nineteen tasks in five phases. Phase 1 is the independent foundations: the `featured` flag and the ten
renames (the intro panels' removal was built and reversed: they stay). Phase 2 turns the effect panel's five hand-written branches into
one walk over a layout table, then moves the seventeen effects to their new rows. Phase 3 builds the
World tab and re-boxes Pacing, Settings and the lanes. Phase 4 gives every robot tab its sub-tabs and
re-boxes Source. Phase 5 is docs. Every task leaves the app working, and no task changes what a control
does.

## Architecture Decisions

- **The spec's four open questions are built on their defaults**, each kept in one place so a different
  answer is a small change: headings (spec assumption 2) live in the panel-schema builders of Tasks 5,
  11, 17 and 18; help-text renames (assumption 9) are one criterion of Task 2; the opening tab
  (assumption 8) is one constant, untouched; Settings' row order (assumption 5) is Task 10.
- **Effect layout becomes data before any effect moves.** Task 4 replaces the five branches of
  `AudioRigEffectPanel` with one walk that draws today's layout, so the risky change (a perf-sensitive
  component) is proven against the existing tests before Tasks 5 to 7 edit the tables.
- **Box and row ids follow the sheets:** `<owner>.p<n>` for a box and `<owner>.p<n>.r<m>` for a shared
  row (`audioRig.phaser.p1.r2`, `robotOptions.mix.p2`, `fleetParams.pacing.p1`). Tests find a box by
  `data-panel-id`. A row of one control has no nested panel.
- **A link is its own cell.** `'<field>.link'` puts an `LfoLink` in the row under its slider, so the
  slider's cell can be featured without wrapping the link.
- **Robot sections split before they are wired.** Tasks 13 to 15 each split one section component in
  two and have the renderers show both halves under the old id; Task 16 then gives each half its own
  sub-tab. This keeps every task at five source files or fewer.
- **Stacked boxes are spaced by their component's own root wrapper** (a flex column with the gap the
  Fleet Params section uses), never by `DirectionalPanel.css` or `index.css`.
- **The intro panels stay** (Crawford, 2026-11-15; Task 3). A tab's intro sits first in its panel,
  above the sub-tab row, so a new tab needs an intro entry (World, Task 8), and an intro that describes
  a section's layout is kept true as the layout moves (open question 2).

## Dependency Graph

```
Task 1 (featured helper)      Task 2 (renames)      Task 3 (intros: reversed, they stay)
      │
      ├── Task 4 (effect layout as data, today's shape)
      │        ├── Task 5 (EQ & filters: boxes, link cells, headings)
      │        │        └── Task 7 (Auto Wah, Phaser, Chorus, Compressor)
      │        └── Task 6 (the ten single-box effects)
      │
      ├── Task 8 (World tab) ── Task 9 (Pacing) ── Task 10 (Settings)
      ├── Task 11 (lanes; needs 5, 6, 7, 9 for the fleet featured list)
      │
      ├── Task 12 (robot section config reshape)
      │        └── Tasks 13, 14, 15 (Levels, Composition, Envelope split)
      │                 └── Task 16 (sub-tabs wired)
      └── Task 17 (oscillators) ── Task 18 (filter; robot featured list)

Task 19 (docs) ── after everything
```

## Task List

Every task names its Proof. Tests render or import what they check; none reads a sheet, a stylesheet or
a source file. Where a task's tests replace layout assertions, they replace only those: wiring, swell
and re-render tests stay unedited and green.

### Phase 1: Foundation

- [x] **Task 1: `featured` flag and `withFeaturedClass`**

  **Description:** Add `featured?: boolean` to `ControlSchemaBase` and `withFeaturedClass(base, schema)`
  beside `withHeldOffClass`. No caller yet.

  **Proof:** RED test — `activeClass.test.ts` (create if absent): the class is added only when the
  schema is featured.

  **Acceptance criteria:**
  - [ ] `withFeaturedClass('x', { featured: true })` returns `'x sc-featured'`; without the flag, `'x'`.
  - [ ] It composes with `withHeldOffClass` in either order.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/activeClass.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/components/ui/controls/activeClass.ts`, its test

  **Estimated scope:** XS

- [x] **Task 2: Rename ten labels**

  **Description:** Change `human` on the ten existing entries in spec §1.5 (`fleet.quality`,
  `fleet.lfoBank`, `fleet.colour`, `fleet.output.decayMode`, the two octave sliders, the four envelope
  sliders). Where help or intro copy names one of those labels word for word, change that mention too.
  The six new names land with their consumers (Tasks 8 and 16), because the guard fails an unused key.

  **Proof:** Read — the diff of the two copy files against §1.5. No test: copy only.

  **Acceptance criteria:**
  - [ ] Each of the ten reads as its "New" column in the running app.
  - [ ] No help or intro sentence still names an old label; nothing else in the copy changed.
  - [ ] A test that pinned an old name as a literal is updated to the new one, and nothing else in it.

  **Verification:**
  - [ ] `npm test` passes (the content guard included).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/content/copy/fleet.ts`, `src/content/copy/probe.ts`

  **Estimated scope:** S

- [x] **Task 3: ~~Take the intro panels out of the views~~ — reversed: the intros stay**

  Built 2026-11-15 (3f41e098: four of the five intros out; the company screen's kept, because removing
  it orphaned `company.profile`), then reversed the same day. **Decision (Crawford, 2026-11-15):** all
  five intros stay, for visual separation until a later pass changes them. The four sites and their
  intro tests are restored exactly as they were before 3f41e098. Spec §1.6 records it.

  **Proof:** the restored intro tests in `FleetParamsScreen.test.tsx`, `RobotScreen.test.tsx` and
  `RosterBoard.test.tsx` pass unedited.

  **Files:** `FleetParamsScreen.tsx`, `RobotScreen.tsx`, `RosterBoard.tsx`, their tests

- [x] **Task 3a: The Settings intro names its sliders**

  **Description:** The returning Settings intro (`fleet.quality`) said "Robot Load" and "Effects Load";
  the sliders are Voice Limit and Effects Limit. Its sentence names them as they read (open question 2).

  **Proof:** Read — the one-sentence diff. No test: copy only.

  **Files:** `src/content/copy/fleet.ts`

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] The app looks as before except for the ten names and the Settings intro's two slider names.
- [ ] Reviewed with Crawford before Phase 2.

---

### Phase 2: Effect panels

- [ ] **Task 4: Effect layout as data, drawing today's layout**

  **Description:** Add `layout` (panels > rows > cell tokens) to `AudioRigEffectBlock`, filled in so
  each effect draws exactly as today, and build the box and row schemas from it at module load.
  Replace the five branches of `AudioRigEffectPanel` with one walk: a cell renders through `paramRow`
  (with `withFeaturedClass`), `TempoSyncSlider` for `rate` and `delayTime`, or the Decay radio. Every
  selector, memo map and handler stays as it is.

  **Proof:** RED test — `audioRigConfig.test.ts`: every param of every effect appears exactly once in
  its `layout`, and Decay once in the Compressor's.

  **Acceptance criteria:**
  - [ ] All seventeen effects render the same controls in the same order and rows as before.
  - [ ] The existing `AudioRigEffectPanel` tests pass with only the panel and row ids they select by
        changed; no wiring, swell or re-render assertion is edited.
  - [ ] No branch on `block.key` remains in the component's render.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/console` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: open Reverb, Delay, Phaser and Compressor; nothing moved.

  **Dependencies:** Task 1.

  **Files:** `src/data/audioRigConfig.ts`, `AudioRigDrawer.tsx`, their tests

  **Estimated scope:** M

- [ ] **Task 5: EQ and filters — a box per slider**

  **Description:** Add the `'<field>.link'` cell and multi-box support to the walk, then set the EQ's
  and both filters' layouts to spec §1.2: one box per band or param, slider on row 1, link on row 2.
  A sub-tab of several boxes shows no effect heading; a single box keeps it. Flag the five featured
  sliders. The block's root wrapper gains the gap between boxes.

  **Proof:** RED test — `AudioRigEffectPanel.test.tsx`: the EQ renders three boxes, each holding its
  slider then its link, and the three slider cells carry `sc-featured`.

  **Acceptance criteria:**
  - [ ] 3-Band EQ, High-Pass Filter and Low-Pass Filter match §1.2 box for box.
  - [ ] Bass, Mid, Treble and both Cutoffs are featured; the Resonances and all links are not.
  - [ ] A filter link's held-off note still sits under its link.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: the boxes have a gap between them; Lane and Depth sit side by side on desktop.

  **Dependencies:** Task 4.

  **Files:** `src/data/audioRigConfig.ts`, `AudioRigDrawer.tsx`, `AudioRigDrawer.css`, their tests

  **Estimated scope:** M

- [ ] **Task 6: The ten single-box effects**

  **Description:** Set the layouts of Reverb, Delay, Distortion, Chebyshev, Bit Crusher, Tremolo,
  Vibrato, Shifter, Width and Limiter to §1.2 and flag their featured control. A table edit only.

  **Proof:** RED test — `AudioRigEffectPanel.test.tsx`: Reverb's order is Amount, then Length beside
  Pre-Delay, and Amount's cell is featured.

  **Acceptance criteria:**
  - [ ] Each of the ten matches its row in §1.2, with its Mix, Amount, Return, Width or Ceiling first
        and featured.
  - [ ] A held-off note still sits with the Mix or Amount control it belongs to.
  - [ ] A shared row is `row` with the tier mocked to desktop and `column` on tablet.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/data/audioRigConfig.ts`, its test, `AudioRigEffectPanel.test.tsx`

  **Estimated scope:** S

- [ ] **Task 7: Auto Wah, Phaser, Chorus and Compressor — two boxes each**

  **Description:** Set the four two-box layouts to §1.2 and flag the three pedals' Mix or Return. The
  Compressor has no featured control.

  **Proof:** RED test — `AudioRigEffectPanel.test.tsx`: the Phaser's first box is Mix, then Base
  Frequency beside Rate, then Octaves; its second is Stages beside Resonance.

  **Acceptance criteria:**
  - [ ] The four match §1.2 box for box, and none shows an effect heading.
  - [ ] The Free | Sync toggle still works on the Phaser's and Chorus's Rate in their new rows.
  - [ ] Decay is the last row of the Compressor's second box and still switches the mode.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/data/audioRigConfig.ts`, its test, `AudioRigEffectPanel.test.tsx`

  **Estimated scope:** S

### Checkpoint: Effect panels
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Mutation check: swap two cells in the Phaser's `layout` and the order test goes red; drop one
      `featured` flag and its test goes red. Restore both.
- [ ] Look, desktop and phone: all seventeen effect sub-tabs against §1.2. At 1024 px, the Phaser's
      Rate beside Base Frequency keeps its toggle's size and no slider drops under three boxes.
- [ ] Reviewed with Crawford before Phase 3.

---

### Phase 3: Fleet Params tabs

- [ ] **Task 8: The World tab**

  **Description:** `FleetParamsGroup` loses `pacing` and `quality` and gains `world`;
  `SelectedFleetParamsEffect` gains `'pacing'` and `'quality'`; `FLEET_PARAMS_SUBSECTIONS.world` lists
  them; `SINGLE_PANEL` goes. World is first and wears Composition; Settings' box keeps Seed. Add the
  `fleet.world` entry.

  **Proof:** RED test — `navActions.test.ts`: the trail for World with no stored sub-tab is Root /
  Fleet Params / World / Pacing.

  **Acceptance criteria:**
  - [ ] Fleet Params shows seven tabs in §1.2's order; World shows the sub-tabs Pacing and Settings.
  - [ ] A stale or missing sub-tab falls back to the section's first; the screen still opens on LFOs.
  - [ ] Pacing's and Settings' boxes keep the colours they have today.

  **Verification:**
  - [ ] `npx vitest run src/stores/uiStore.test.ts src/components/panels/screen/nav src/components/panels/screen/screens/FleetParamsScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/stores/uiStore.ts`, `navActions.ts`, `FleetParamsScreen.tsx`,
  `src/content/copy/fleet.ts`, their tests

  **Estimated scope:** M

- [ ] **Task 9: Pacing — two boxes**

  **Description:** Re-box `PacingPanel` to §1.2: Tempo over Humanize, then Automation Rate over Length
  beside Range. Flag Tempo and Automation Rate. A wrapper spaces the two boxes.

  **Proof:** RED test — `FleetParamsScreen.test.tsx`: Pacing's first box holds Tempo then Humanize, and
  Tempo's cell is featured.

  **Acceptance criteria:**
  - [ ] Pacing matches §1.2; Length and Range share a row on desktop and stack below it.
  - [ ] All five sliders still write the values they wrote.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/screens/FleetParamsScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 8.

  **Files:** `FleetParamsScreen.tsx`, `FleetParamsScreen.css`, `src/data/audioRigConfig.ts`, tests

  **Estimated scope:** S

- [ ] **Task 10: Settings — the readout before Preset**

  **Description:** In `AudioLoadPanel`, put the limits readout left of Preset on row 1 and move the
  box and row ids to the sheet scheme. The Audio Load heading stays.

  **Proof:** RED test — `AudioLoadPanel.test.tsx`: in row 1 the readout comes before the Preset radio.

  **Acceptance criteria:**
  - [ ] Row 1 is the readout then Preset; row 2 is Voice Limit then Effects Limit.
  - [ ] Choosing a preset and dragging either slider behave as before.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioLoadPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 8.

  **Files:** `AudioLoadPanel.tsx`, its test

  **Estimated scope:** XS

- [ ] **Task 11: LFO lanes — two boxes**

  **Description:** Each lane becomes two boxes: Shape beside Rate, then Rate Drift beside Depth Drift,
  with the drift held-off note in the second. The lane heading goes (the sub-tab names the lane). Flag
  Rate. Add the fleet-wide featured test.

  **Proof:** RED test — `LfoBankLanePanel.test.tsx`: a lane renders two boxes, and Rate's cell is
  featured.

  **Acceptance criteria:**
  - [ ] All four lanes match §1.2; the Free | Sync toggle and the drift held-off note behave as before.
  - [ ] `audioRigConfig.test.ts`: the featured Fleet schema ids are exactly the twenty-four of spec §1.4.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/LfoBankLanePanel.test.tsx src/data/audioRigConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 6, 7, 9.

  **Files:** `LfoBankLanePanel.tsx`, `src/data/audioRigConfig.ts`, their tests

  **Estimated scope:** S

### Checkpoint: Fleet Params
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Mutation check: put `quality` back as a top-level tab and the tab-order test goes red. Restore.
- [ ] Look, phone, tablet and desktop: all seven tabs and every sub-tab against §1.2; the breadcrumb
      names World and its sub-tab.
- [ ] Reviewed with Crawford before Phase 4.

---

### Phase 4: Robot, company and All Probes

- [ ] **Task 12: Reshape the robot section config**

  **Description:** In `ROBOT_SECTIONS_CONFIG`, a section carries its tab's content key and each
  subsection its sub-tab's; `accordion`, `mergedInto` and the `frequency` subsection go. Nothing on
  screen changes. Delete the content entries this leaves unused (expected: `probe.dynamics`,
  `probe.dynamics.levelControl`, `probe.composition.rhythm`, `probe.composition.pitches`).

  **Proof:** RED test — `robotSubsectionConfig.test.ts`: every section's `content` is its tab's name
  and no entry has `accordion` or `mergedInto`.

  **Acceptance criteria:**
  - [ ] The four tabs, Source's four sub-tabs and the breadcrumb read exactly as before.
  - [ ] The content guard passes with the unused entries deleted and no other entry touched.

  **Verification:**
  - [ ] `npx vitest run src/data/robotSubsectionConfig.test.ts src/components/panels/screen` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/data/robotSubsectionConfig.ts`, `src/stores/uiStore.ts`, `RobotScreen.tsx`,
  `src/content/copy/probe.ts`, their tests

  **Estimated scope:** M

- [ ] **Task 13: Levels — split into Mix and Sends**

  **Description:** Split `AudioSettingSection` into two memoised components in the same file, boxed to
  spec §1.3: Mix (Volume; Monitor Mode beside Dynamics; then Pan beside Auto in a second box) and
  Sends (three rows in one box, the held-off note at its foot). Flag Volume. Both renderers show Mix
  then Sends under the existing id.

  **Proof:** RED test — `AudioSettingSection.test.tsx`: Mix renders two boxes with Volume first and
  featured; Sends renders Reverb beside Delay, Grit beside Shimmer, then Double.

  **Acceptance criteria:**
  - [ ] Both halves match §1.3; Pan and Auto stay side by side on every tier.
  - [ ] Volume, Monitor Mode, Pan, Auto, the five sends and Dynamics behave as before, for a robot and
        for a company broadcast.
  - [ ] A held-off send is still dimmed with its value kept.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/company` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `AudioSettingSection.tsx`, `src/data/robotOptionsConfig.ts`, `RobotScreen.tsx`,
  `CompanyOptionsSection.tsx`, their tests

  **Estimated scope:** M

- [ ] **Task 14: Composition — split into Rhythm & Melody and Details**

  **Description:** Split `PingControlsCompositionSection` in two, each one box, to §1.3. Click Track
  becomes the last row of Rhythm & Melody. The Articulation panel, its schema and its content entry go.
  Both renderers show the two halves under the existing id.

  **Proof:** RED test — `PingControlsDrawer.test.tsx`: Rhythm & Melody holds Note Density beside
  Phrase Length then Pitch Repeat Chance beside Note Variance; Details holds Rests beside Accents then
  the two octave sliders.

  **Acceptance criteria:**
  - [ ] Both halves match §1.3 and no Articulation heading renders.
  - [ ] Pitch Repeat Chance is disabled while Phrase Length is 0.
  - [ ] Click Track renders only under `DEV_TUNING`, below the sliders.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx src/data/robotOptionsConfig.test.ts` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `PingControlsDrawer.tsx`, `src/data/robotOptionsConfig.ts`, `RobotScreen.tsx`,
  `CompanyOptionsSection.tsx`, `src/content/copy/probe.ts`, their tests

  **Estimated scope:** M

- [ ] **Task 15: Envelope — split into Contour and Character**

  **Description:** Split `PingContourDrawer` in two, each one box: Contour (Attack beside Decay,
  Sustain beside Release, keeping its heading) and Character (Portamento, Attack Shape, Release Shape,
  one per row). Both renderers show the two halves under the existing id.

  **Proof:** RED test — `PingContourDrawer.test.tsx`: Character renders Portamento, Attack Shape and
  Release Shape as three rows of one.

  **Acceptance criteria:**
  - [ ] Both halves match §1.3.
  - [ ] An envelope edit still cancels that field's swell; the shapes and Portamento write as before.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingContourDrawer.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `PingContourDrawer.tsx`, `src/data/robotOptionsConfig.ts`, `RobotScreen.tsx`,
  `CompanyOptionsSection.tsx`, their tests

  **Estimated scope:** M

- [ ] **Task 16: Give each half its sub-tab**

  **Description:** `RobotSubsection` becomes `mix`, `sends`, `rhythmMelody`, `details`, `pingContour`,
  `envelopeCharacter`, the three oscillators and `busFilter`. The config lists two sub-tabs under
  Levels, Composition and Envelope, and both renderers return one half per id. Add the five new
  content entries (spec §1.5).

  **Proof:** RED test — `RobotScreen.test.tsx`: Levels shows the sub-tabs Mix and Sends, and opening
  Sends shows the five sends and not Volume.

  **Acceptance criteria:**
  - [ ] Every tab shows §1.3's sub-tabs by name and order, on the robot, company and All Probes screens.
  - [ ] The breadcrumb still names the tab; a stale sub-tab falls back to the tab's first.
  - [ ] Only one sub-tab's controls are in the DOM at a time.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen src/components/company src/data/robotSubsectionConfig.test.ts` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 12, 13, 14, 15.

  **Files:** `src/stores/uiStore.ts`, `src/data/robotSubsectionConfig.ts`, `RobotScreen.tsx`,
  `CompanyOptionsSection.tsx`, `src/content/copy/probe.ts`, their tests

  **Estimated scope:** M

### Checkpoint: Robot sub-tabs
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Look: a robot, a company and All Probes each show the six new sub-tabs; an edit on a company
      still reaches every member once.
- [ ] Reviewed with Crawford before Tasks 17 and 18.

- [ ] **Task 17: Oscillators — three boxes**

  **Description:** `SignatureArrayLayer` renders three boxes per §1.3: Type beside Gain over Gain's
  link; Detune over its link; Phase with Interval on a second row while the type is `pulse`. The layer
  heading goes. Flag Gain and Detune on all three layers.

  **Proof:** RED test — `SignatureArrayDrawer.test.tsx`: a `pulse` layer's third box holds Phase then
  Interval as two rows; any other type holds Phase alone.

  **Acceptance criteria:**
  - [ ] All three oscillators match §1.3; Gain and Detune are featured and nothing else is.
  - [ ] The link wiring, disabled state and memo bail-out tests pass unedited.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx src/data/robotOptionsConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: switch a layer to and from `pulse`; the third box grows and shrinks by one row.

  **Dependencies:** Task 1.

  **Files:** `SignatureArrayDrawer.tsx`, `SignatureArrayDrawer.css`, `src/data/robotOptionsConfig.ts`,
  their tests

  **Estimated scope:** M

- [ ] **Task 18: Robot filter — two boxes**

  **Description:** `BusFilterDrawer` renders Cutoff over its link, then Resonance beside Type in a
  second box. The Filter heading goes. Flag Cutoff. Add the robot-wide featured test.

  **Proof:** RED test — `BusFilterDrawer.test.tsx`: two boxes, Cutoff's cell featured, Resonance
  before Type in the second.

  **Acceptance criteria:**
  - [ ] The filter matches §1.3 and its link's held-off behaviour is unchanged.
  - [ ] `robotOptionsConfig.test.ts`: the featured robot schema ids are exactly the eight of spec §1.4.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/BusFilterDrawer.test.tsx src/data/robotOptionsConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 13, 17.

  **Files:** `BusFilterDrawer.tsx`, `BusFilterDrawer.css`, `src/data/robotOptionsConfig.ts`, their tests

  **Estimated scope:** S

### Checkpoint: Robots
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Mutation check: move Pitch Repeat Chance's row into Details and its order test goes red. Restore.
- [ ] Look, phone, tablet and desktop: every robot sub-tab against §1.3, then the same on a company and
      on All Probes. Nothing in the avatar column, the roster or the nav panel moved.
- [ ] Reviewed with Crawford before docs.

---

### Phase 5: Docs

- [ ] **Task 19: Document the shipped layout**

  **Description:** Update `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md` and `docs/CONTENT_LAYER.md`
  where they name the eight tabs, the intro panels, a renamed label or the featured flag; add the
  roadmap entry under the next free number; mark the intent and spec shipped. Check every name against
  the final source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No doc names eight Fleet Params tabs, an intro on these screens, or an old label as current.
  - [ ] The roadmap entry states what shipped and what did not (featured styling, the content sweep).

  **Verification:**
  - [ ] Every named identifier spot-checked against the shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** All prior tasks.

  **Files:** `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md`, `docs/CONTENT_LAYER.md`,
  `docs/todo/roadmap.md`, `docs/intent/control-layout.md`, `docs/specs/CONTENT_LAYOUT.md`

  **Estimated scope:** S (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] The eight success criteria of spec §7 are met.
- [ ] Crawford's manual pass at three widths is done, or flagged here as outstanding.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The data-driven walk breaks a stable reference and a swell tick re-renders a whole effect panel again | High | Task 4 changes only the render shape and must pass the existing re-render tests unedited before any layout moves |
| A half-width Free \| Sync slider near 1024 px drops under its three-box floor (Phaser's Rate, Delay Time) | Medium | Measured at the Effect panels checkpoint; the fallback is a full row, asked first |
| A renderer shows both halves of a split section for three tasks, so Levels, Composition and Envelope are long single tabs in between | Low | Interim only, inside one branch; Task 16 ends it and the checkpoint after it looks at all three |
| Deleting an unused content entry removes copy someone wanted | Low | Only entries the guard reports unused go, named in Tasks 12 and 14; the diff is reviewed at the checkpoint |
| A heading answer different from the default arrives after Phase 2 | Medium | Headings are set in four builders (Tasks 5, 11, 17, 18); changing the rule is those four places and their tests |
| Tests pinned to today's box ids or row shapes fail in bulk | Medium | Each is re-pinned in the task that changes its component, never ahead of it; behaviour assertions are not edited |

## Open Questions

1. **Headings on multi-box sub-tabs.** **Open** — built on the spec's default (single-box sub-tabs keep
   their heading, multi-box ones show none). Crawford decides; best answered before Task 5.
2. **Renames in help text.** **Open** — built on the default (a renamed label changes where copy names
   it). Best answered before Task 2.
3. **Where Fleet Params opens.** **Open** — built on the default (still LFOs). A one-line change at any
   point.
4. **Settings row 1 order.** **Open** — built on the sheet's order (readout, then Preset). Best
   answered before Task 10.
5. **Branch and roadmap number.** The spec proposes `feature/control-layout` from `main`; Crawford cuts
   it. Task 19 takes the next free roadmap number at that time.
