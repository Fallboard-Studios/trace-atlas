# Implementation Plan: Robot Options (Roadmap Phase 9)

Source spec: [docs/specs/ROBOT_OPTIONS.md](../specs/ROBOT_OPTIONS.md). Source intent:
[docs/intent/robot-options.md](../intent/robot-options.md).

## Overview

Build the shared-ADSR engine plumbing first (types → `compositeVoice.ts` → `AudioEngine.ts` →
`spawnSystem.ts`), since every drawer depends on robots actually having the new single-envelope,
fixed-3-layer shape before their UI can be meaningfully tested. Then build `robotOptionsConfig.ts`
(parallel-safe with the engine work — it has no runtime dependency on it) and the four new
components on top of both. Finally rewire `RobotEditorTab.tsx` into the renamed `RobotOptionsTab.tsx`,
remove the three legacy tab files it replaces, and update docs last. The scope matches spec §2's
file list exactly; every one of spec §7's decisions is treated as already resolved (not
re-litigated here), with one additional implementation-level refinement recorded below under
Architecture Decisions.

## Architecture Decisions

Spec §7 already resolved all 7 of this phase's product/design questions via a follow-up
`/interview-me` pass — nothing from that list is re-opened here. One additional engineering-level
refinement, discovered while sequencing tasks, is recorded below:

- **The active-layer filter lives inside `reserveVoice` itself, not only `reReserveVoice`.** Spec
  §2 phrased the filter as living on `reReserveVoice` ("`reReserveVoice` additionally filters
  `layers.filter(l => l.active)`"). Sequencing Task 4/5 surfaced a gap in that phrasing: a robot's
  *very first* voice reservation happens in `spawnSystem.ts`'s `spawnRobot`, calling
  `AudioEngine.reserveVoice` directly — never `reReserveVoice`. Since generation can seed Coaxial or
  Harmonic as inactive from the start, filtering only in `reReserveVoice` would let an
  inactive-from-spawn layer sound until the first edit forced a re-reservation. Putting the
  `active`-filter inside `reserveVoice` itself (applied to the `descriptor` before it reaches
  `createCompositeVoice`) covers both call sites automatically, since `reReserveVoice` already just
  calls `reserveVoice` internally — no caller needs to remember to filter.
- **Task ordering follows the real compile dependency chain**, not the spec §6 commit-message
  order (which is a suggested narrative, not a build order): `layeredAudio.ts`'s type changes must
  land before `compositeVoice.ts` can stop reading `layer.adsr`; `compositeVoice.ts`'s
  `createCompositeVoice` signature change must land before `AudioEngine.ts` can pass `adsr` through
  it; both must land before `spawnSystem.ts` can call the new `reserveVoice` shape.

## Dependency Graph

```
Task 1 (Robot.ts: lfoSettings active flag)      Task 2 (layeredAudio.ts: remove adsr/ADSTRaw/
        │                                                'noise', add active field)
        │                                                        │
        │                                                        └──→ Task 3 (compositeVoice.ts:
        │                                                                adsr param, drop noise
        │                                                                branch)
        │                                                                        │
        │                                                                        └──→ Task 4
        │                                                                        (AudioEngine.ts:
        │                                                                        reserveVoice/
        │                                                                        reReserveVoice
        │                                                                        adsr + active-
        │                                                                        filter,
        │                                                                        updateVoiceEnvelope)
        │                                                                                │
        └──────────────────────────────────────────────────────────────────────────────→ Task 5
                                                                                   (spawnSystem.ts:
                                                                                   fixed 3-layer gen,
                                                                                   unified ADSR range,
                                                                                   active + LFO
                                                                                   active seeding)
                                                                                           │
                                                                                           └──→
                                                                              Checkpoint: Foundation

Task 6 (robotOptionsConfig.ts + test) ── independent; parallel-safe with Tasks 1–5

Checkpoint: Foundation + Data (Tasks 1–6 all landed)
        │
        ├──→ Task 7  (RobotDisplaySection + test)   ┐
        ├──→ Task 8  (PingControlsDrawer + test)     │ parallel-safe
        ├──→ Task 9  (PingContourDrawer + test)      │ with each other
        └──→ Task 10 (SignatureArrayDrawer + test)   ┘
                    │
                    └──→ Checkpoint: Components
                    │
Tasks 7–10 ──→ Task 11 (RobotEditorTab.tsx → RobotOptionsTab.tsx rename + rewire + test,
                         ConsolePanel.tsx one-line import update)
                    │
                    └──→ Checkpoint: Screen Wired In
                    │
Task 11 ──→ Task 12 (remove RobotMetaTab/RobotAudioTab/RobotOscillatorsTab + their tests)
                    │
                    └──→ Checkpoint: Legacy Removed
                    │
Tasks 1–12 ──→ Task 13 (docs: ROBOT_DATA_GRID.md, ROBOT_DESIGN.md, AUDIO_SYSTEM.md, UI_SHELL.md,
                         roadmap.md)
                    │
                    └──→ Checkpoint: Complete
```

Tasks 1 and 2 are parallel-safe with each other (no shared file, no compile dependency between
them). Task 6 has no dependency on the engine chain at all and can be built any time after this
plan is approved, in parallel with Tasks 1–5. Tasks 7–10 are parallel-safe with each other once
Task 6 and the Foundation checkpoint both land.

## Task List

### Phase 1: Types

- [ ] **Task 1: `src/types/Robot.ts` — `lfoSettings` gains the `active` flag**

  **Description:** Widen the per-robot LFO settings map so each target carries its own on/off
  state, mirroring `audioStore.ts`'s existing `globalLfo: Record<GlobalLfoTargetId, LfoSettings &
  { active: boolean }>` shape.

  **Acceptance criteria:**
  - [ ] `Robot.lfoSettings` is `Record<RobotLfoTargetId, LfoSettings & { active: boolean }>` (was
    `Record<RobotLfoTargetId, LfoSettings>`)
  - [ ] No other field on `Robot` changes in this task
  - [ ] `RobotLfoTargetId`/`LfoSettings` themselves (in `src/types/lfo.ts`) are untouched — only the
    `Robot.lfoSettings` field's value type changes

  **Verification:**
  - [ ] `npm run build:types` — fails loudly at every call site that still constructs a bare
    `LfoSettings` for `lfoSettings` without `active` (expected; those are fixed in Task 5)
  - [ ] `npm run lint` clean for this file

  **Dependencies:** None (parallel-safe with Task 2).

  **Files:** `src/types/Robot.ts`

  **Estimated scope:** XS (1 file — downstream compile errors are expected and resolved by later
  tasks, not this one)

- [ ] **Task 2: `src/types/layeredAudio.ts` — remove per-layer ADSR, add `active`, drop `'noise'`**

  **Description:** `OscillatorLayer` loses its optional per-layer ADSR override and the `ADSTRaw`
  type it used; gains a required `active: boolean`; its `type` field narrows from
  `WaveformType | 'noise'` to `WaveformType` only. `VisualAudioMap.averagedADSR` is removed.

  **Acceptance criteria:**
  - [ ] `OscillatorLayer.adsr` field removed; `ADSTRaw` interface removed entirely
  - [ ] `OscillatorLayer.active: boolean` added (required, not optional)
  - [ ] `OscillatorLayer.type: WaveformType` (no longer `| 'noise'`)
  - [ ] `VisualAudioMap.averagedADSR` field removed; `averagedGain`/`shapeParams`/`layerVisuals`
    untouched
  - [ ] `npm run build:types` surfaces every now-broken call site (`compositeVoice.ts`,
    `spawnSystem.ts`, and the soon-to-be-deleted `RobotOscillatorsTab.tsx`) — expected; each is
    fixed in its own task (3, 5, 12)

  **Verification:**
  - [ ] `npm run lint` clean for this file
  - [ ] Confirm via `grep -rn "ADSTRaw" src` that no import of the removed type survives outside
    files this plan will also touch (Tasks 3, 12)

  **Dependencies:** None (parallel-safe with Task 1).

  **Files:** `src/types/layeredAudio.ts`

  **Estimated scope:** XS (1 file)

### Checkpoint: Types

- [ ] `npm run build:types` shows only the expected downstream errors (in `compositeVoice.ts`,
  `AudioEngine.ts`, `spawnSystem.ts`, `RobotOscillatorsTab.tsx`, `RobotAudioTab.tsx`/
  `RobotMetaTab.tsx` if they touch `layers`) — no *unexpected* breakage in unrelated files.
- [ ] `npm run lint` clean for `Robot.ts` and `layeredAudio.ts`.

### Phase 2: Engine — Shared ADSR + Active-Layer Filtering

- [ ] **Task 3: `src/engine/audioEngine/compositeVoice.ts` — construction-time shared ADSR**

  **Description:** `createCompositeVoice` gains a required `adsr: ADSREnvelope` parameter, applied
  identically to every layer's `Tone.Synth` envelope at construction. The live-update `set()`
  closure is untouched — it already applies whatever `adsr` a patch entry carries via
  `synth.set({ envelope: p.adsr })`, which is exactly what the new shared-envelope model needs. The
  dead `'noise'`/`NoiseSynth` construction branch is removed.

  **Acceptance criteria:**
  - [ ] `createCompositeVoice(descriptor, adsr: ADSREnvelope)` — every layer's initial
    `Tone.Synth` envelope reads `adsr.attack`/`decay`/`sustain`/`release` directly, not
    `layer.adsr?.x ?? fallback`
  - [ ] The `layer.type === 'noise'` branch (and its `NoiseSynth`/`getToneCtor('NoiseSynth')`
    construction) is deleted — `layer.type` is `WaveformType` only, per Task 2
  - [ ] The live-update `set()` closure's existing `if (p.adsr) synth.set({ envelope: p.adsr })`
    line is **unchanged** — no new logic added here, per spec §4/§7's resolved design
  - [ ] `CompositeVoice.layers`'s exposed `{ synth, gainNode, layer }` shape is unchanged (still
    consumed by `AudioEngine.getRobotModulationTarget` and the new `updateVoiceEnvelope` in Task 4)

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` — all passing, including new
    cases: constructing with a given `adsr` produces synths with that envelope on every layer;
    passing a `'noise'`-typed layer is no longer possible at the type level (covered by a
    `// @ts-expect-error` case if this file has a test for it, otherwise skip — it's now a
    compile-time guarantee, not a runtime one)
  - [ ] `npm run build:types` passes for this file (given Task 2 already landed)
  - [ ] `npm run lint` clean

  **Dependencies:** Task 2.

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, and its test file if one exists (check
  `src/engine/audioEngine/` for an existing `compositeVoice.test.ts`; if none exists, this is the
  first — add one scoped to the construction-time ADSR behavior and the noise-branch removal only)

  **Estimated scope:** S (1–2 files)

- [ ] **Task 4: `src/engine/AudioEngine.ts` — thread shared ADSR, filter inactive layers, add
  `updateVoiceEnvelope`**

  **Description:** `reserveVoice`/`reReserveVoice` gain the `adsr` parameter and thread it into
  `createCompositeVoice`; `reserveVoice` filters `active: false` layers out of the descriptor
  before construction (see Architecture Decisions — this covers both `reserveVoice`'s direct
  callers and `reReserveVoice`, which calls it internally); a new `updateVoiceEnvelope(robotId,
  adsr)` rebuilds the layers-patch from the composite's already-exposed `layers` and reuses the
  existing continuous-update path.

  **Acceptance criteria:**
  - [ ] `reserveVoice(robotId, descriptor, adsr, phase?, detune?, pulseWidth?)` — `adsr` is
    required, positioned right after `descriptor` (same "shared value applied across every layer"
    role `phase`/`detune`/`pulseWidth` already play)
  - [ ] `reserveVoice` excludes any layer with `active === false` from what it passes to
    `createCompositeVoice` — an inactive layer never gets a synth node built for it
  - [ ] `reReserveVoice` reads `robot.audioAttributes.adsr` and passes it through to `reserveVoice`
    unchanged otherwise (still reads `phase`/`detune`/`pulseWidth` off `robot.audioAttributes` as
    it does today)
  - [ ] New `updateVoiceEnvelope(robotId: string, adsr: ADSREnvelope): void` — no-ops with a
    `devWarn` (matching `updateVoiceLayerParams`'s existing pattern) when no composite is reserved
    for the robot; otherwise rebuilds `{ layers: [...] }` from `entry.composite.layers` with `adsr`
    stamped onto each entry and calls `entry.composite.set({ layers })`
  - [ ] `updateVoiceLayerParams` and every other existing `AudioEngine` method's signature is
    unchanged

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` — all passing, including new cases:
    `reserveVoice` never builds a synth for an `active: false` layer (assert via
    `getVoiceForRobot(id)?.layers?.length` or equivalent); `reReserveVoice` passes the robot's
    current `audioAttributes.adsr` through; `updateVoiceEnvelope` patches every active layer's live
    envelope and is a safe no-op when nothing is reserved
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Task 3.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M (2 files, the phase's most conceptually dense single-file change)

- [ ] **Task 5: `src/systems/spawnSystem.ts` — fixed 3-layer generation, unified ADSR range,
  active/LFO seeding**

  **Description:** Generation always produces exactly 3 layers (Baseline/Coaxial/Harmonic,
  Baseline always `active: true`, the other two independently seeded); attack/decay/release
  generation ranges unify to `0`–`5s`; the per-layer ADSR seeding and the
  `normSum`/`averagedNorm`/`averagedADSR` block are removed outright; `generateRobotLfoSettings`
  seeds an `active` boolean per target (including `'volume'`).

  **Acceptance criteria:**
  - [ ] Every call to `generateAudioAttributes` produces exactly 3 `layers` entries, none typed
    `'noise'`, `layers[0].active === true` always
  - [ ] `layers[1].active`/`layers[2].active` are each independently seeded (not both forced the
    same value, not both hardcoded true)
  - [ ] `ATTACK_RANGE`/`DECAY_RANGE`/`RELEASE_RANGE` are each `{ min: 0, max: 5 }` (was `0.01–2` /
    `0.05–2` / `0.1–5`); `SUSTAIN_RANGE` unchanged (`0–1`)
  - [ ] No generated `OscillatorLayer` has an `adsr` field (removed at the type level in Task 2 —
    this task stops the code that used to populate it)
  - [ ] The `normSum`/`averagedNorm`/`averagedADSR` block and the now-unused local `ADSR_MAX`
    constant (if nothing else in this file still needs it — check shape-param derivation below)
    are removed; shape params (`scale`/`roundness`/`detail`) derive from `audioAttributes.adsr`
    normalized directly, not a weighted average
  - [ ] `generateRobotLfoSettings` returns `Record<RobotLfoTargetId, LfoSettings & { active:
    boolean }>` — every one of the 13 targets has a seeded `active` value, not all uniformly `true`
    or `false`
  - [ ] `spawnRobot`'s call to `AudioEngine.reserveVoice` passes `audioAttributes.adsr` as the new
    required argument

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` — all passing; old per-layer-ADSR and
    `averagedADSR`-normalization assertions removed; new assertions cover the 0–5s generation
    range, the fixed 3-layer/no-noise output, Baseline-always-active, and LFO `active` seeding
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean
  - [ ] `grep -rn "'noise'" src/systems/spawnSystem.ts` returns nothing

  **Dependencies:** Task 1, Task 4.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** M (2 files; the most seeding-logic-dense task in this phase)

### Checkpoint: Foundation

- [ ] `npm test` passes for `compositeVoice.test.ts`, `AudioEngine.test.ts`, `spawnSystem.test.ts`.
- [ ] `npm run build:types` and `npm run lint` clean project-wide (no lingering references to
  `OscillatorLayer.adsr`, `ADSTRaw`, or `'noise'` anywhere in `src/`).
- [ ] `npm run build` builds cleanly — confirms no other file silently depended on the old
  `reserveVoice`/`createCompositeVoice` signatures without a compile error surfacing it.
- [ ] Manual check (`npm run dev`): load a locale, confirm robots still make sound and look
  visually normal (shape/color unaffected) — regression guard before any UI work begins. **Pending
  human operator.**

### Phase 3: Data

- [ ] **Task 6: `src/data/robotOptionsConfig.ts` — schemas for all 4 sections**

  **Description:** New data file, field-for-field from `ROBOT_DATA_GRID.md`, following
  `audioRigConfig.ts`'s structural pattern (typed block/param arrays, not one flat schema list).
  Robot Display's Name/Job/Battery/Docking rows reuse `robotSelectionConfig.ts`'s
  `ROBOT_SELECTION_ROW_SCHEMAS` directly — no duplicate label maps.

  **Acceptance criteria:**
  - [ ] `ROBOT_DISPLAY_CONFIG` — Audio Setting (`RadioButtonSchema`, 4 options: Off/Mute/Solo/
    Highlight) and Volume (`SliderLinearSchema`, `min: 0, max: 1`) schemas; imports (does not
    redefine) `ROBOT_SELECTION_ROW_SCHEMAS`/`JOB_TYPE_LABELS`/`DOCKING_STATE_LABELS`/
    `UNASSIGNED_JOB_LABEL`/`AUDIO_MODE_LABELS` from `robotSelectionConfig.ts`
  - [ ] `PING_CONTROLS_CONFIG` — Density (`StepperSchema`, `min: RHYTHMIC_DENSITY_MIN, max:
    RHYTHMIC_DENSITY_MAX`, i.e. `0`/`100` — not the grid's stale `1`/`16`), Motif Length
    (`StepperWithToggleSchema`, `1`–`8`), Octave Range Min/Max (2× `StepperSchema`, `1`–`7`), Note
    Variance (`StepperWithToggleSchema`, `1`–`8`), Reset Melody (`ButtonSchema`)
  - [ ] `PING_CONTOUR_CONFIG` — Attack/Decay/Release (`SliderLogSchema`, `min: 0, max: 10, unit:
    's'`), Sustain (`SliderLinearSchema`, `min: 0, max: 100, unit: '%'` — the display-only
    percentage form; conversion to/from the stored `0..1` happens at the component boundary in
    Task 9, not here)
  - [ ] `SIGNATURE_ARRAY_CONFIG` — exactly 3 `SignatureArrayLayerBlock` entries
    (`layer0`/`layer1`/`layer2`, humanLabel Baseline/Coaxial/Harmonic); only `layer1`/`layer2`
    carry an `activeSchema`; each block's `params` cover Type (`RadioButtonSchema`, the 5
    `WaveformType` options only — no Noise), Gain (`SliderLinearSchema`, `0`–`2`, `lfoTarget` set),
    Detune (`SliderCenteredZeroSchema`, `±50`, `lfoTarget` set), Phase (`SliderLinearSchema`,
    `0`–`360`, `lfoTarget` set), Interval/pulseWidth (`SliderLinearSchema`, `0`–`1`, `lfoTarget`
    set)
  - [ ] Every `lfoTarget` value is a real `RobotLfoTargetId` matching the layer index
    (`layer0.gain`, `layer1.detune`, etc.) and `ROBOT_DISPLAY_CONFIG`'s Volume schema pairs with
    the `'volume'` target
  - [ ] New test asserts: `SIGNATURE_ARRAY_CONFIG` has exactly 3 blocks with the right
    `humanLabel`s and active-schema presence; every `ControlSchema` entry's `type` is one of
    `CONTROL_SCHEMA_TYPES`; every LFO-flagged param's `lfoTarget` is a real `RobotLfoTargetId`

  **Verification:**
  - [ ] `npx vitest run src/data/robotOptionsConfig.test.ts` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Tasks 1–5).

  **Files:** `src/data/robotOptionsConfig.ts`, `src/data/robotOptionsConfig.test.ts`

  **Estimated scope:** M (2 files; the densest single data file in this phase — 4 config sections)

### Checkpoint: Foundation + Data

- [ ] `npm test` passes project-wide (Tasks 1–6's suites plus no regressions elsewhere).
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] Ready to start component work — every backing type/engine/data piece the drawers need exists.

### Phase 4: Components

- [ ] **Task 7: `src/components/robot/RobotDisplaySection.tsx` — always-visible header block**

  **Description:** New component (not an `AccordionContainer`). Read-only Name/Job/Battery(`%`)/
  Docking rows; editable Audio Setting and Volume (with its LFO accordion), modeled on
  `AudioRigDrawer.tsx`'s existing per-param LFO accordion pattern.

  **Acceptance criteria:**
  - [ ] Renders Name/Job/Battery(`%`)/Docking as plain text via `DualLabel` + a value span — no
    input, button, or other interactive role attached to any of the four
  - [ ] No job-reassignment or docking-override control renders anywhere in this component
  - [ ] Audio Setting `RadioButton` includes all 4 options (Off/Mute/Solo/Highlight); selecting one
    calls `updateRobot(localeId, robot.id, { audioMode })`
  - [ ] Volume `SliderLinear` reflects `robot.masterVolume`; changing it calls `updateRobot`
  - [ ] Volume's `Lfo` accordion reflects `robot.lfoSettings.volume`'s current value/`active` state;
    changing it calls `updateRobot` with the updated `lfoSettings.volume` and wires
    `lfoEngine.connectLfoTarget`/`disconnectLfoTarget('volume', robot.id)` on the active-state
    transition, mirroring how `AudioRigDrawer` wires `setGlobalLfo`

  **Verification:**
  - [ ] `npx vitest run src/components/robot/RobotDisplaySection.test.tsx` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Checkpoint: Foundation + Data (Tasks 1, 4, 6).

  **Files:** `src/components/robot/RobotDisplaySection.tsx`,
  `src/components/robot/RobotDisplaySection.css`,
  `src/components/robot/RobotDisplaySection.test.tsx`

  **Estimated scope:** M (3 files)

- [ ] **Task 8: `src/components/robot/PingControlsDrawer.tsx` — melody/register controls**

  **Description:** One `AccordionContainer` wrapping Density/Motif Length/Octave Range/Note
  Variance/Reset Melody, replacing `RobotAudioTab`'s hand-rolled Radix sliders/toggle-group.
  Wires to the same `regenerateMelody()`/`updateRobot()` pair `RobotAudioTab.tsx` already uses.
  Reset Melody is a plain one-click `Button` — no confirmation dialog.

  **Acceptance criteria:**
  - [ ] Density/Motif-Length/Octave-Range/Note-Variance changes call `updateRobot` and
    `regenerateMelody`, matching `RobotAudioTab.test.tsx`'s existing density-change behavior
    (same store, same call shape) — largely a like-for-like port onto the new schema-driven
    primitives
  - [ ] Reset Melody's `Button` calls `regenerateMelody(robot, localeId)` directly on click — no
    `AlertDialog`/confirm step anywhere in this component
  - [ ] Wrapped in exactly one `AccordionContainer`

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingControlsDrawer.test.tsx` — all passing
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Checkpoint: Foundation + Data (Task 6; no direct dependency on Tasks 1–5 beyond
  what's already landed at the checkpoint).

  **Files:** `src/components/robot/PingControlsDrawer.tsx`,
  `src/components/robot/PingControlsDrawer.css`,
  `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** M (3 files)

- [ ] **Task 9: `src/components/robot/PingContourDrawer.tsx` — shared ADSR envelope editor**

  **Description:** One `AccordionContainer` wrapping Attack/Decay/Release (`SliderLog`) and
  Sustain (`SliderLinear`, with the `%`-vs-`0..1` conversion at this component's boundary) editing
  `audioAttributes.adsr`. First-ever UI to edit the shared envelope directly. Calls
  `AudioEngine.updateVoiceEnvelope` for live edits, not a full `reReserveVoice`.

  **Acceptance criteria:**
  - [ ] Attack/Decay/Release/Sustain each read from and write to `audioAttributes.adsr` (not any
    per-layer field — there is no per-layer field left, per Task 2)
  - [ ] Sustain's control receives/emits `0`–`100`; the `onChange` handler converts to/from the
    stored `0..1` value (`pct / 100` on write) — a stored `0.8` displays as `80`
  - [ ] Every edit calls `updateRobot` (store write) and `AudioEngine.updateVoiceEnvelope(robot.id,
    newAdsr)` — never `reReserveVoice` (no audio dropout on an envelope tweak)
  - [ ] Wrapped in exactly one `AccordionContainer`

  **Verification:**
  - [ ] `npx vitest run src/components/robot/PingContourDrawer.test.tsx` — all passing, including a
    dedicated round-trip case for Sustain's `%`-conversion (stored `0.8` → displays `80`; setting
    to `50` → stores `0.5`)
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Checkpoint: Foundation + Data (Task 4's `updateVoiceEnvelope`, Task 6).

  **Files:** `src/components/robot/PingContourDrawer.tsx`,
  `src/components/robot/PingContourDrawer.css`,
  `src/components/robot/PingContourDrawer.test.tsx`

  **Estimated scope:** M (3 files)

- [ ] **Task 10: `src/components/robot/SignatureArrayDrawer.tsx` — 3 fixed oscillator layers**

  **Description:** One `AccordionContainer` wrapping the 3 fixed layer slots (Baseline/Coaxial/
  Harmonic), each with Type/Gain/Detune/Phase/Interval controls and per-param `Lfo` accordions,
  plus Coaxial/Harmonic's Active toggle. Replaces `RobotOscillatorsTab`'s dynamic add/delete list.

  **Acceptance criteria:**
  - [ ] Exactly 3 layer sections render, always, indexed directly (`layers[0]`/`[1]`/`[2]`) — no
    add/delete-layer UI anywhere
  - [ ] Baseline (`layers[0]`) has no Active toggle rendered; Coaxial/Harmonic
    (`layers[1]`/`[2]`) each render one, bound to `layer.active`
  - [ ] Type `RadioButton` options are exactly the 5 `WaveformType` values — no Noise option
  - [ ] Interval/pulse-width control renders only when that layer's Type is `'square'` or
    `'pulse'`
  - [ ] Toggling a layer's Active off updates only that layer's `active` field via
    `updateRobot`/`AudioEngine.reReserveVoice` (structural) — its Type/Gain/Detune/Phase/Interval
    values are untouched and still rendered with their existing values, not cleared or hidden
  - [ ] A Type change calls `AudioEngine.reReserveVoice` (structural); a Gain/Detune/Phase/Interval
    change calls `AudioEngine.updateVoiceLayerParams` (continuous) — same
    continuous-vs-structural split `RobotOscillatorsTab`'s `commitContinuous`/`commitStructural`
    already established
  - [ ] Each LFO-flagged param renders an `Lfo` accordion wired to
    `robot.lfoSettings['layerN.field']` (e.g. `layer0.gain`, `layer2.detune`)

  **Verification:**
  - [ ] `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx` — all passing,
    including the "toggling Active mutes, doesn't clear settings" regression case
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean

  **Dependencies:** Checkpoint: Foundation + Data (Tasks 2, 4, 6).

  **Files:** `src/components/robot/SignatureArrayDrawer.tsx`,
  `src/components/robot/SignatureArrayDrawer.css`,
  `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** L (3 files, but the most composed/stateful component in this phase — largest
  single task; if it proves too large in practice, split by extracting a per-layer
  `SignatureArrayLayerRow` sub-component into its own task before writing `SignatureArrayDrawer`
  itself)

### Checkpoint: Components

- [ ] `npm test` passes for all 4 new component test files.
- [ ] `npm run build:types` and `npm run lint` clean.
- [ ] Manual check (`npm run dev`, using a temporary mount point or Storybook-less ad hoc render):
  each drawer's controls visibly/audibly affect a robot in isolation before wiring into the real
  screen — **pending human operator**.

### Phase 5: Screen Wiring

- [ ] **Task 11: `RobotEditorTab.tsx` → `RobotOptionsTab.tsx` — rename, rewire, `ConsolePanel.tsx`
  update**

  **Description:** Rename the file (+ `.css`) and replace its `Tabs.Root`/3-tab shell with
  `RobotDisplaySection` followed by the 3 drawers, stacked. Update `ConsolePanel.tsx`'s import to
  match — its own `selectedRobotId ? <X /> : <RobotsTab />` routing logic is otherwise unchanged.

  **Acceptance criteria:**
  - [ ] `RobotEditorTab.tsx`/`.css` are renamed to `RobotOptionsTab.tsx`/`.css` (git mv, not
    delete+recreate, to preserve history)
  - [ ] Renders `RobotDisplaySection` followed by `PingControlsDrawer`, `PingContourDrawer`,
    `SignatureArrayDrawer` (in that order) when a robot is selected
  - [ ] Renders the existing not-selected fallback (`"Select a robot from the list..."`) when
    `selectedRobotId` is falsy — unchanged behavior, now covered by a real test for the first time
  - [ ] No `Tabs.Root`/`Tabs.List`/`Tabs.Trigger` remains in this file
  - [ ] `ConsolePanel.tsx`'s import and JSX usage both updated from `RobotEditorTab` to
    `RobotOptionsTab` — no other line in that file changes

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx` — all
    passing (new file, first test for this component)
  - [ ] `npm run build:types` passes (confirms `ConsolePanel.tsx`'s import resolves)
  - [ ] `npm run lint` clean
  - [ ] Manual check (`npm run dev`): select a robot from the list, confirm the new stacked-drawer
    screen renders in place of the old tabs — **pending human operator**

  **Dependencies:** Tasks 7, 8, 9, 10.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx` (renamed),
  `src/components/panels/screen/console/RobotOptionsTab.css` (renamed),
  `src/components/panels/screen/console/RobotOptionsTab.test.tsx` (new),
  `src/components/panels/screen/console/ConsolePanel.tsx`

  **Estimated scope:** S (4 files, but the rename+rewire is mostly composition — the hard work is
  already done by Tasks 7–10)

### Checkpoint: Screen Wired In

- [ ] `npm test` passes for `RobotOptionsTab.test.tsx` and project-wide (no regressions from the
  rename).
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] Manual check (`npm run dev`): full Robot Options screen walkthrough — select a robot, confirm
  Robot Display/Ping Controls/Ping Contour/Signature Array all render and behave as specified,
  back button returns to the robot list — **pending human operator**.

### Phase 6: Remove Legacy Editor

- [ ] **Task 12: Remove `RobotMetaTab`, `RobotAudioTab`, `RobotOscillatorsTab`**

  **Description:** Delete the three files (and their tests) `RobotOptionsTab.tsx` no longer
  imports as of Task 11.

  **Acceptance criteria:**
  - [ ] `RobotMetaTab.tsx`/`.css`/`.test.tsx` deleted
  - [ ] `RobotAudioTab.tsx`/`.css`/`.test.tsx` deleted
  - [ ] `RobotOscillatorsTab.tsx`/`.css` deleted (no test file existed for this one)
  - [ ] `grep -rn "RobotMetaTab\|RobotAudioTab\|RobotOscillatorsTab" src` returns nothing

  **Verification:**
  - [ ] `npm test` — full suite passes with these test files gone (no orphaned import elsewhere
    breaks)
  - [ ] `npm run build:types` passes
  - [ ] `npm run lint` clean
  - [ ] `npm run build` builds cleanly

  **Dependencies:** Task 11.

  **Files:** deletions only — `src/components/panels/screen/console/RobotMetaTab.{tsx,css,test.tsx}`,
  `RobotAudioTab.{tsx,css,test.tsx}`, `RobotOscillatorsTab.{tsx,css}`

  **Estimated scope:** XS (6 files, all deletions — no new logic)

### Checkpoint: Legacy Removed

- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean project-wide.
- [ ] `grep -rn "RobotMetaTab\|RobotAudioTab\|RobotOscillatorsTab\|RobotEditorTab" src` returns
  nothing (confirms both the removal and the Task 11 rename are complete and consistent).

### Phase 7: Docs

- [ ] **Task 13: `ROBOT_DATA_GRID.md`, `ROBOT_DESIGN.md`, `AUDIO_SYSTEM.md`, `UI_SHELL.md`,
  `roadmap.md`**

  **Description:** Document shipped behavior, per spec §2/§3, against the final implementation —
  not reconstructed from this plan's placeholder text.

  **Acceptance criteria:**
  - [ ] `docs/reference/ROBOT_DATA_GRID.md`: Audio Setting's Options column gains "Off"; Density's
    Min/Max corrected from `1`/`16` to `0`/`100`
  - [ ] `docs/ROBOT_DESIGN.md`'s Shape Parameters section reworded: shape values read directly from
    the robot's one `audioAttributes.adsr`, not a gain-weighted average across layers
  - [ ] `docs/AUDIO_SYSTEM.md`'s Layered/Composite Voices section: `OscillatorLayer.adsr` field
    removed from the description; the new shared-envelope path through `reserveVoice`/
    `updateVoiceEnvelope` documented in its place
  - [ ] `docs/UI_SHELL.md`'s "Planned Replacement" section deleted entirely (Phases 3/7/8/9 have
    all now shipped); "Current implementation status" updated to describe the shipped Robot
    Options screen (`RobotOptionsTab` → `RobotDisplaySection` + 3 drawers)
  - [ ] `docs/todo/roadmap.md` § 9's bullets marked resolved, mirroring the pointer pattern used
    for prior phases, linking to `docs/specs/ROBOT_OPTIONS.md`

  **Verification:**
  - [ ] Manual proofread: every claim spot-checked against the actually-shipped code (field names,
    exact ranges, file paths) — not copied from this plan without verifying against real code,
    per the project's standing "verify roadmap against code" practice
  - [ ] Links resolve (relative paths correct)

  **Dependencies:** Tasks 1–12.

  **Files:** `docs/reference/ROBOT_DATA_GRID.md`, `docs/ROBOT_DESIGN.md`, `docs/AUDIO_SYSTEM.md`,
  `docs/UI_SHELL.md`, `docs/todo/roadmap.md`

  **Estimated scope:** S (5 files, text-only)

### Checkpoint: Complete

- [ ] All acceptance criteria across Tasks 1–13 met.
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean project-wide.
- [ ] Manual check (`npm run dev`): full run-through of spec §5's verification-steps list (Robot
  Display's read-only rows plus live Audio Setting/Volume, each drawer's controls, an ADSR edit's
  effect on visual shape, a Coaxial/Harmonic mute-not-delete round trip) — **pending human
  operator**.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `AudioEngine.reserveVoice`'s new required `adsr` parameter is missed at a call site not covered by this plan's file list (e.g. a test helper elsewhere, or `powerController.ts`'s `reRegisterAllRobotsAudio` path) | Medium | TypeScript makes a missed call site a compile error, not a silent runtime bug — Task 4's `npm run build:types` step surfaces every one before merge |
| Fully removing `'noise'` breaks an existing test fixture elsewhere that hardcodes a `'noise'`-typed layer | Medium | `grep -rn "'noise'"` (Task 2/5's verification) run across `src/` before those tasks are considered done, not just within the files each task directly touches |
| The active-layer filter living inside `reserveVoice` (this plan's refinement over spec §2's `reReserveVoice`-only phrasing) is missed during Task 4, leaving a spawn-seeded-inactive layer audible until first edit | Medium | Task 4's acceptance criteria explicitly test `reserveVoice` itself (not only `reReserveVoice`) for the filtering behavior |
| Sustain's `%`-vs-`0..1` conversion is applied backwards (storing `80` instead of `0.8`) | Medium | Task 9's dedicated round-trip test case, called out explicitly rather than left implicit in a general "slider works" assertion |
| `SignatureArrayDrawer` (Task 10) is genuinely too large for one focused session once real implementation starts | Low/process | Task 10's own notes pre-authorize splitting out a `SignatureArrayLayerRow` sub-component as a new task without needing a new round of spec/plan review |
| Renaming `RobotEditorTab.tsx` (Task 11) as a plain delete+recreate loses its git history | Low | Acceptance criteria explicitly call for `git mv` (or the tool-native rename-preserving equivalent), not delete+recreate |

## Open Questions

None remaining — spec §7's items are all resolved and folded into the task list above; this plan's
one additional refinement (the `reserveVoice`-level active-filter) is recorded under Architecture
Decisions.
