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

- **The spec's four open questions are answered** (Crawford, 2026-11-15), each kept in one place:
  every heading stays, a multi-box sub-tab's on its first box (assumption 2; the panel-schema builders
  of Tasks 5, 7, 11, 17 and 18); no wrong info on screen, so copy that names or describes what a task
  moves changes in that task (assumption 9; Tasks 2, 3a, 8, 14, 16); Fleet Params opens on World
  (assumption 8; Task 8); Settings keeps Preset first (assumption 5; Task 10).
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

### Checkpoint: Foundation — passed 2026-11-15 (next: Task 4)
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (but for 7 RobotGem/RobotBody line-width
      cases that fail on `main` too: fa2b854a's hand-set widths, outside this plan).
- [x] The app looks as before except for the ten names and the Settings intro's two slider names.
- [x] Reviewed with Crawford before Phase 2.

---

### Phase 2: Effect panels

- [x] **Task 4: Effect layout as data, drawing today's layout** (5839adcc)

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

- [x] **Task 5: EQ and filters — a box per slider** (2d6bb9e9)

  **Description:** Add the `'<field>.link'` cell and multi-box support to the walk, then set the EQ's
  and both filters' layouts to spec §1.2: one box per band or param, slider on row 1, link on row 2.
  The effect's heading stays, on its first box only (spec assumption 2). Flag the five featured
  sliders. The block's root wrapper gains the gap between boxes.

  **Proof:** RED test — `AudioRigEffectPanel.test.tsx`: the EQ renders three boxes, each holding its
  slider then its link, the heading on the first box alone, and the three slider cells carry
  `sc-featured`.

  **Acceptance criteria:**
  - [ ] 3-Band EQ, High-Pass Filter and Low-Pass Filter match §1.2 box for box, each heading on P1.
  - [ ] Bass, Mid, Treble and both Cutoffs are featured; the Resonances and all links are not.
  - [ ] A filter link's held-off note still sits under its link.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: the boxes have a gap between them; Lane and Depth sit side by side on desktop.

  **Dependencies:** Task 4.

  **Files:** `src/data/audioRigConfig.ts`, `AudioRigDrawer.tsx`, `AudioRigDrawer.css`, their tests

  **Estimated scope:** M

- [x] **Task 6: The ten single-box effects** (937dd02f)

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

- [x] **Task 7: Auto Wah, Phaser, Chorus and Compressor — two boxes each** (72e011b1)

  **Description:** Set the four two-box layouts to §1.2 and flag the three pedals' Mix or Return. The
  Compressor has no featured control.

  **Proof:** RED test — `AudioRigEffectPanel.test.tsx`: the Phaser's first box is Mix, then Base
  Frequency beside Rate, then Octaves; its second is Stages beside Resonance.

  **Acceptance criteria:**
  - [ ] The four match §1.2 box for box, each with its effect heading on its first box only.
  - [ ] The Free | Sync toggle still works on the Phaser's and Chorus's Rate in their new rows.
  - [ ] Decay is the last row of the Compressor's second box and still switches the mode.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/data/audioRigConfig.ts`, its test, `AudioRigEffectPanel.test.tsx`

  **Estimated scope:** S

**As built (Phase 2, 2026-11-15):** `AudioRigEffectBlock`'s single `panel` field became `heading` (the content
key) plus `boxes`, built from `layout` at module load by `effect()` in `audioRigConfig.ts`; a layout token that
names no param, or links a param with no LFO target, throws at load. A link cell's wrapper is
`.audio-rig-drawer__link-row` (no stylesheet names it). Tests that pinned the old shapes were re-pinned in the
task that moved them; the three Knee-beside-Decay cases were removed in Task 7 (§1.2 splits the pair across
the Compressor's boxes), and two wiring describes' `rowOf` helper now selects the param's box (Task 5, a
selector change only). Every task's manual check is folded into the look below.

### Checkpoint: Effect panels — passed 2026-11-15 (with the Fleet Params look below)
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (14,352 tests, 0 failed; lint's 4
      pre-existing Scenery/gemShape warnings).
- [x] Mutation check: swap two cells in the Phaser's `layout` and the order test goes red; drop one
      `featured` flag and its test goes red. Restore both. (Base Frequency and Rate swapped: three order
      tests red; the Chorus's flag dropped: its featured test red.)
- [x] Look, desktop and phone: all seventeen effect sub-tabs against §1.2. At 1024 px, the Phaser's
      Rate beside Base Frequency keeps its toggle's size and no slider drops under three boxes. (Crawford,
      2026-11-15, after Phase 3: "fleet params look good"; the effects are Fleet Params' sub-tabs.)
- [x] Reviewed with Crawford (2026-11-15, after Phase 3, with the Fleet Params look).

---

### Phase 3: Fleet Params tabs

- [x] **Task 8: The World tab** (c4568f3b)

  **Description:** `FleetParamsGroup` loses `pacing` and `quality` and gains `world`;
  `SelectedFleetParamsEffect` gains `'pacing'` and `'quality'`; `FLEET_PARAMS_SUBSECTIONS.world` lists
  them; `SINGLE_PANEL` goes. World is first and wears Composition; Settings' box keeps Seed.
  `DEFAULT_FLEET_PARAMS_SECTION` becomes `world` (spec assumption 8). Add the `fleet.world` entry with
  an intro, since World's panel opens with one like every tab's (§1.6): drafted from Pacing's and
  Settings' intros, naming only what World holds, and flagged in the commit for Crawford's copy pass.
  Pacing's and Settings' own intros stop rendering (they are sub-tabs now) and stay in the copy.

  **Proof:** RED test — `navActions.test.ts`: the trail for World with no stored sub-tab is Root /
  Fleet Params / World / Pacing.

  **Acceptance criteria:**
  - [ ] Fleet Params shows seven tabs in §1.2's order; World shows the sub-tabs Pacing and Settings.
  - [ ] A stale or missing sub-tab falls back to the section's first; the screen opens on World > Pacing.
  - [ ] World's panel opens with its intro; the per-tab intro test covers World in place of Pacing and
        Settings.
  - [ ] Pacing's and Settings' boxes keep the colours they have today.

  **Verification:**
  - [ ] `npx vitest run src/stores/uiStore.test.ts src/components/panels/screen/nav src/components/panels/screen/screens/FleetParamsScreen.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/stores/uiStore.ts`, `navActions.ts`, `FleetParamsScreen.tsx`,
  `src/content/copy/fleet.ts`, their tests

  **Estimated scope:** M

- [x] **Task 9: Pacing — two boxes** (c93a1c41)

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

- [x] **Task 10: Settings — box and row ids on the sheet scheme** (b0067c69)

  **Description:** In `AudioLoadPanel`, move the box and row ids to the sheet scheme
  (`fleetParams.settings.p1`, `.p1.r1`, `.p1.r2`). The order stays as today, Preset then the readout
  (spec assumption 5: the sheet's order was only the order the rows were typed in). The Audio Load
  heading stays.

  **Proof:** RED test — `AudioLoadPanel.test.tsx`: the box `fleetParams.settings.p1` holds row 1,
  Preset then the readout, and row 2, Voice Limit then Effects Limit.

  **Acceptance criteria:**
  - [ ] Row 1 is Preset then the readout; row 2 is Voice Limit then Effects Limit.
  - [ ] Choosing a preset and dragging either slider behave as before.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioLoadPanel.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 8.

  **Files:** `AudioLoadPanel.tsx`, its test

  **Estimated scope:** XS

- [x] **Task 11: LFO lanes — two boxes** (ae1fee83)

  **Description:** Each lane becomes two boxes: Shape beside Rate, then Rate Drift beside Depth Drift,
  with the drift held-off note in the second. The lane heading stays, on the first box (spec
  assumption 2). Flag Rate. Add the fleet-wide featured test.

  **Proof:** RED test — `LfoBankLanePanel.test.tsx`: a lane renders two boxes, the lane heading on the
  first alone, and Rate's cell is featured.

  **Acceptance criteria:**
  - [ ] All four lanes match §1.2; the Free | Sync toggle and the drift held-off note behave as before.
  - [ ] `audioRigConfig.test.ts`: the featured Fleet schema ids are exactly the twenty-four of spec §1.4.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/LfoBankLanePanel.test.tsx src/data/audioRigConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 6, 7, 9.

  **Files:** `LfoBankLanePanel.tsx`, `src/data/audioRigConfig.ts`, their tests

  **Estimated scope:** S

**As built (Phase 3, 2026-11-15):**

- **World (Task 8).** `SINGLE_PANEL` is gone; World's two sub-tabs render `PacingPanel` and a `SettingsPanel`
  that wraps `AudioLoadPanel` in Seed's trait style, so Settings' box keeps its colour while its trigger wears
  World's Composition like every sub-tab trigger. Pacing's boxes sit in a `.fleet-params-screen__boxes` wrapper,
  added in Task 8 rather than 9 because Pacing's rows lost the section's flex gap the moment they became a
  sub-tab. `fleet.world`'s intro is a **draft** from Pacing's and Settings' own, flagged for Crawford's copy pass.
  Pacing's and Settings' intro entries stay (their `human` names the sub-tabs).
- **Settings (Task 10)** moved `AUDIO_LOAD_PANEL_SCHEMA.id` in `audioRigConfig.ts` (a file the task did not
  list) and re-pinned `audioRigConfig.test.ts`'s `audioRig.*` namespace case to `fleetParams.settings.p1`.
- **Lanes (Task 11).** `LfoBankLaneSchema.panel` became `p1` (the heading) and `p2`; `topRow` and `driftRow`
  keep their names with the ids `.p1.r1` and `.p2.r1`. A new co-located `LfoBankLanePanel.css` spaces the two
  boxes. The fleet-wide featured test walks every export of `audioRigConfig.ts` at any depth, so a flag added
  anywhere in the module is caught.
- Tests pinned to the old default tab (LFO Bank), to Pacing and Audio Quality as tabs, or to the old one-box
  lane and two-row Pacing shapes were re-pinned in the task that moved them; no wiring, value, swell or
  re-render case was edited.

### Checkpoint: Fleet Params — passed 2026-11-15 (next: Task 12)
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (14,374 tests, 0 failed; lint's 4
      pre-existing warnings; the build's usual chunk-size notice).
- [x] Mutation check: put `quality` back as a top-level tab and the tab-order test goes red. Restore. (Seven
      cases red across `navActions.test.ts` and `FleetParamsScreen.test.tsx`; restored from git.)
- [x] Look, phone, tablet and desktop: all seven tabs and every sub-tab against §1.2; the breadcrumb
      names World and its sub-tab. (Crawford, 2026-11-15: "fleet params look good".)
- [x] Reviewed with Crawford before Phase 4. The draft World intro stays as built until his copy pass.

---

### Phase 4: Robot, company and All Probes

- [x] **Task 12: Reshape the robot section config** (eaa98561)

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

- [x] **Task 13: Levels — split into Mix and Sends** (ed2228e2)

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

- [x] **Task 14: Composition — split into Rhythm & Melody and Details** (a9601ff8)

  **Description:** Split `PingControlsCompositionSection` in two, each one box, to §1.3. Click Track
  becomes the last row of Rhythm & Melody. The Articulation panel, its schema and its content entry go.
  Both renderers show the two halves under the existing id. The Composition intro, which describes the
  controls under Rhythm, Articulation and Pitches, is regrouped under Rhythm & Melody and Details so it
  names no group that is gone (spec assumption 9).

  **Proof:** RED test — `PingControlsDrawer.test.tsx`: Rhythm & Melody holds Note Density beside
  Phrase Length then Pitch Repeat Chance beside Note Variance; Details holds Rests beside Accents then
  the two octave sliders.

  **Acceptance criteria:**
  - [ ] Both halves match §1.3 and no Articulation heading renders.
  - [ ] The Composition intro names Rhythm & Melody and Details, not Rhythm, Articulation or Pitches.
  - [ ] Pitch Repeat Chance is disabled while Phrase Length is 0.
  - [ ] Click Track renders only under `DEV_TUNING`, below the sliders.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx src/data/robotOptionsConfig.test.ts` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `PingControlsDrawer.tsx`, `src/data/robotOptionsConfig.ts`, `RobotScreen.tsx`,
  `CompanyOptionsSection.tsx`, `src/content/copy/probe.ts`, their tests

  **Estimated scope:** M

- [x] **Task 15: Envelope — split into Contour and Character** (0275f26a)

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

- [x] **Task 16: Give each half its sub-tab** (61a8aecc)

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
  - [ ] No Levels, Composition or Envelope intro or help sentence names a sub-tab or group that is not
        on screen (spec assumption 9); the section intros still sit above the sub-tab row.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen src/components/company src/data/robotSubsectionConfig.test.ts` passes.
  - [ ] `npm test`, `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 12, 13, 14, 15.

  **Files:** `src/stores/uiStore.ts`, `src/data/robotSubsectionConfig.ts`, `RobotScreen.tsx`,
  `CompanyOptionsSection.tsx`, `src/content/copy/probe.ts`, their tests

  **Estimated scope:** M

**As built (Tasks 12–16, 2026-11-15):**

- **Config (Task 12).** A section's `content` is its tab's key and a subsection's its sub-tab's; `accordion`,
  `mergedInto`, `frequency` and `sectionTabContent` went (callers read `section.content`, `navActions.ts` among
  them, a file the task did not list). `sectionSubTabs` went in Task 16, once every section had a sub-tab row.
- **The halves (Tasks 13–15)** are memoised exports beside the old component in its file: `LevelsMixSection` /
  `LevelsSendsSection`, `CompositionRhythmMelodySection` / `CompositionDetailsSection`, `EnvelopeContourSection` /
  `EnvelopeCharacterSection`. Ids on the sheet scheme: `robotOptions.mix.p1` (`.p1.r2`), `.mix.p2` (`.p2.r1`, a fixed
  row), `robotOptions.sends.p1` (`.r1`, `.r2`, laid out by `SENDS_LAYOUT`), `robotOptions.rhythmMelody.p1`,
  `robotOptions.details.p1`, `robotOptions.contour.p1` (was `robotOptions.pingContour`), `robotOptions.character.p1`
  (`CHARACTER_PANEL_SCHEMA` replaced `CURVE_ROW_PANEL_SCHEMA`). Removed: `VOLUME_ROW_PANEL_SCHEMA`,
  `VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA`, `PAN_ROW_PANEL_SCHEMA`, `ARTICULATION_PANEL_SCHEMA` and the content entries
  `probe.dynamics`, `probe.dynamics.levelControl`, `probe.composition.rhythm`, `probe.composition.pitches`,
  `probe.composition.articulation`.
- **The old components stay as composites.** Through Tasks 13–15 `AudioSettingSection`,
  `PingControlsCompositionSection` and `PingContourDrawer` rendered both halves, so the renderers needed no change
  until Task 16. Since Task 16 no screen renders them; only their own tests do. **Open for Crawford:** delete them
  (and move those tests onto the halves), or keep them.
- **Screen tests (Task 16).** The section stubs became one stub per half, each showing only the props its half
  receives. On the robot and company screens a section's two halves share its stub id (one is mounted at a time);
  `CompanyOptionsSection.test.tsx` mounts several ids at once, so there the second halves have their own ids. Cases
  that read Volume's swell flag beside the send flags now read the send flags only.
- Full suite at Task 16: 14,409 passed, 0 failed; types and lint clean (lint's 4 known warnings).

### Checkpoint: Robot sub-tabs — passed 2026-11-15 (the look folded into the Robots checkpoint's)
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (14,409 tests, 0 failed).
- [ ] Look: a robot, a company and All Probes each show the six new sub-tabs; an edit on a company
      still reaches every member once. **Folded into the Robots checkpoint's look below**, which covers
      every robot sub-tab on all three screens.
- [x] Reviewed with Crawford before Tasks 17 and 18 (2026-11-15: "Build 17 + 18, then 19", asked when Phase 5
      was requested with this checkpoint unticked).

- [x] **Task 17: Oscillators — three boxes** (6cdd0bc4)

  **Description:** `SignatureArrayLayer` renders three boxes per §1.3: Type beside Gain over Gain's
  link; Detune over its link; Phase with Interval on a second row while the type is `pulse`. The layer
  heading stays, on the first box (spec assumption 2). Flag Gain and Detune on all three layers.

  **Proof:** RED test — `SignatureArrayDrawer.test.tsx`: a `pulse` layer's third box holds Phase then
  Interval as two rows; any other type holds Phase alone; the layer heading is on the first box alone.

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

- [x] **Task 18: Robot filter — two boxes** (bc9c01b4)

  **Description:** `BusFilterDrawer` renders Cutoff over its link, then Resonance beside Type in a
  second box. The Filter heading stays, on the first box (spec assumption 2). Flag Cutoff. Add the
  robot-wide featured test.

  **Proof:** RED test — `BusFilterDrawer.test.tsx`: two boxes, the Filter heading on the first alone,
  Cutoff's cell featured, Resonance before Type in the second.

  **Acceptance criteria:**
  - [ ] The filter matches §1.3 and its link's held-off behaviour is unchanged.
  - [ ] `robotOptionsConfig.test.ts`: the featured robot schema ids are exactly the eight of spec §1.4.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/BusFilterDrawer.test.tsx src/data/robotOptionsConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 13, 17.

  **Files:** `BusFilterDrawer.tsx`, `BusFilterDrawer.css`, `src/data/robotOptionsConfig.ts`, their tests

  **Estimated scope:** S

**As built (Tasks 17–18, 2026-11-15):**

- **Oscillators (Task 17).** `SignatureArrayLayerBlock.panel` became `panels: { p1, p2, p3 }` (`robotOptions.<layer>.p1`
  to `.p3`, the heading on `p1` only), `rows.typeGain`'s id became `.p1.r1`, and `rows.phaseInterval` went: Interval
  is P3's second row of one. The `data-layer-key` div is now the root wrapper stacking the three boxes
  (`var(--spacing-md)`); its old divider line between layers went, since the boxes separate them. The Gain and Detune
  cell classes are built before the hooks: built inline in the JSX, they made the React-compiler lint report
  "existing memoization could not be preserved" on the link handlers. The `linkRow` test helper now finds a link's row
  inside its box (a selector-only change); `content.test.ts`'s "not a panel" id became `robotOptions.layer0.p1`.
- **Filter (Task 18).** `BUS_FILTER_PANEL_SCHEMA` / `BUS_FILTER_ROW_PANEL_SCHEMA` became `BUS_FILTER_P1_PANEL_SCHEMA`,
  `BUS_FILTER_P2_PANEL_SCHEMA` and `BUS_FILTER_P2_R1_PANEL_SCHEMA`. Cutoff had no cell of its own, so it gained one
  (`.bus-filter-drawer__cutoff`) to carry `sc-featured`; Resonance and Type stay bare in their row.
  `content.test.ts`'s filter id became `robotOptions.busFilter.p1`. The robot-wide featured test walks every
  `robotOptionsConfig` export, as the fleet one does.
- Mutants killed: Detune unfeatured, P2 given the layer heading, Interval moved into P2 (Task 17); Resonance featured,
  the link moved into P2 (Task 18).

### Checkpoint: Robots — tests passed 2026-11-15; the look is outstanding
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (359 files, 14,423 passed, 2 skipped,
      0 failed; lint's 4 pre-existing warnings; the build's usual chunk-size notice). The run also reported one
      Vitest `onTaskUpdate` RPC timeout, an unhandled error outside any test (backlog 66's startup-burst cause), not a
      failure.
- [x] Mutation check: move Pitch Repeat Chance's row into Details and its order test goes red. Restore. (Seven cases
      red in `PingControlsDrawer.test.tsx`, the order test among them; restored.)
- [ ] Look, phone, tablet and desktop: every robot sub-tab against §1.3, then the same on a company and
      on All Probes. Nothing in the avatar column, the roster or the nav panel moved. **Outstanding:** no browser
      pass this session; it is Crawford's.
- [x] Reviewed with Crawford before docs: waived (2026-11-15, Crawford asked for Tasks 17, 18 and 19 in one run).

---

### Phase 5: Docs

- [x] **Task 19: Document the shipped layout** (923ab1a4)

  **Description:** Update `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md` and `docs/CONTENT_LAYER.md`
  where they name the eight tabs, the intro panels, a renamed label or the featured flag; add the
  roadmap entry under the next free number; mark the intent and spec shipped. Check every name against
  the final source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No doc names eight Fleet Params tabs, LFOs as the opening tab, or an old label as current; the
        intro panels are described as kept.
  - [ ] The roadmap entry states what shipped and what did not (featured styling, the content sweep).

  **Verification:**
  - [ ] Every named identifier spot-checked against the shipped code.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** All prior tasks.

  **Files:** `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md`, `docs/CONTENT_LAYER.md`,
  `docs/todo/roadmap.md`, `docs/intent/control-layout.md`, `docs/specs/CONTENT_LAYOUT.md`

  **Estimated scope:** S (docs only)

**As built (Task 19, 2026-11-15):** the roadmap entry is [91](../todo/roadmap.md#91-control-layout-tabs-sub-tabs-boxes-and-rows-for-fleet-params-and-the-probes)
(the backlog's next free number is now 92). Beyond the three docs the task names, `AUDIO_SYSTEM.md` named the old
labels as current UI in four places (Fleet Params → LFO Bank twice, the in-app "Decay Mode" copy, Fleet Params >
Pacing) and `COMPONENT_LIBRARY.md`'s side-by-side note still put Phase beside Interval; all fixed. Left as found:
`AUDIO_SYSTEM.md`'s "Three master controls — Intensity, Frequency, Duration" heading predates this pass (today's
labels are Automation Rate, Length and Range), and a code comment in `src/content/copy/fleet.ts` (above
`fleet.quality`) still calls it "Audio Quality, Fleet Params' last tab". Dated specs, plans and archives keep the old
names as history.

### Checkpoint: Complete — built; Crawford's manual pass outstanding
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (the Robots checkpoint's run; Task
      19 changed docs only, and types and lint were re-run after it).
- [ ] The eight success criteria of spec §7 are met: 1–7 by the tests, the featured walks and the docs read; **8 is
      Crawford's manual pass**, below.
- [x] Crawford's manual pass at three widths is done, or flagged here as outstanding. **Flagged outstanding**: the
      robot, company and All Probes sub-tabs (the Robots checkpoint's look). Fleet Params passed its look on 2026-11-15.
- [x] Ready for Crawford's PR, once that look passes. Open for him: delete or keep the three old composites
      (roadmap 91 Open).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The data-driven walk breaks a stable reference and a swell tick re-renders a whole effect panel again | High | Task 4 changes only the render shape and must pass the existing re-render tests unedited before any layout moves |
| A half-width Free \| Sync slider near 1024 px drops under its three-box floor (Phaser's Rate, Delay Time) | Medium | Measured at the Effect panels checkpoint; the fallback is a full row, asked first |
| A renderer shows both halves of a split section for three tasks, so Levels, Composition and Envelope are long single tabs in between | Low | Interim only, inside one branch; Task 16 ends it and the checkpoint after it looks at all three |
| Deleting an unused content entry removes copy someone wanted | Low | Only entries the guard reports unused go, named in Tasks 12 and 14; the diff is reviewed at the checkpoint |
| The heading rule changes again when the headings are revisited | Medium | Headings are set in five builders (Tasks 5, 7, 11, 17, 18); changing the rule is those places and their tests |
| Tests pinned to today's box ids or row shapes fail in bulk | Medium | Each is re-pinned in the task that changes its component, never ahead of it; behaviour assertions are not edited |

## Open Questions

1. **Headings on multi-box sub-tabs.** **Answered (Crawford, 2026-11-15):** keep them all for now; a
   multi-box sub-tab's heading sits on its first box. Tasks 5, 7, 11, 17, 18. Composition's Rhythm,
   Pitches and Articulation headings are not kept: they match no new box and go as Tasks 12 and 14
   say (Crawford, 2026-11-15).
2. **Renames in help text.** **Answered:** make the changes so there's no wrong info on screen. Task 2
   did the renames; Task 3a fixed the returning Settings intro; Tasks 8, 14 and 16 keep the intros true
   as tabs and sub-tabs move.
3. **Where Fleet Params opens.** **Answered:** World. Task 8.
4. **Settings row 1 order.** **Answered:** the sheet's order was only the order the rows were typed in;
   Preset stays first. Task 10 now only moves the ids.
5. **Branch and roadmap number.** Built on `features/slider-layout-update` (Crawford's branch). Task 19
   takes the next free roadmap number at that time.
