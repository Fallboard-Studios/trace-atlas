# Implementation Plan: Automation Frequency/Duration Split

Source spec: [docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md](../specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md). Source intent: [docs/intent/automation-frequency-duration-split.md](../intent/automation-frequency-duration-split.md). Not yet slotted into `docs/todo/roadmap.md`. Supersedes [docs/tasks/PING-VARIANCE-AUTOMATION.md](PING-VARIANCE-AUTOMATION.md) wherever the two disagree — that plan's 8 tasks are already shipped; this plan only adds/changes what the new spec calls out.

## Overview

Split `pingVarianceAutomation`'s two jobs (magnitude scaling + on/off gate) across three Pacing sliders: **Intensity** (magnitude only, floor raised so it can never reach 0), **Frequency** (new field `swellFrequency`, takes over on/off + replaces the fixed per-measure trigger roll with a real per-tick rate), and **Duration** (new field `swellDuration`, total swell length in measures, replacing today's independently-randomized rising/falling picks). Adds one small new capability to the control-primitive layer (`SliderLogSchema.formatValue`, for Frequency's "x/measure" vs "every x measures" display) and reshapes `audioSwells.ts`'s trigger/duration mechanics. No new files besides tests — every task modifies an existing file.

## Architecture Decisions

- **The control-primitive capability (Task 1) and the seed function (Task 2) land first, in parallel, both with zero dependency on each other or on the store.** Same "de-risk foundation work first" ordering `PING-VARIANCE-AUTOMATION.md`'s plan used — both are pure/isolated: `formatValue` is an optional field nothing yet supplies, and the two new `generate*` functions are pure draws over a noise map.
- **`audioStore.ts` (Task 3) depends on Task 2 only, not Task 1** — the store doesn't touch `SliderLogSchema` at all; it just needs the seed functions to exist.
- **`audioRigConfig.ts` (Task 4) depends on Task 1 (for `formatValue`'s type) but not on Task 3** — schemas are static data, not store reads. This is a genuine parallelization point: Tasks 3 and 4 can run in two sessions simultaneously once Tasks 1–2 land.
- **`audioSwells.ts` is split into three sequential tasks (5, 6, 7), not parallelized, mirroring `PING-VARIANCE-AUTOMATION.md`'s own reasoning** — all three touch the same handful of functions (`tickAudioSwells`, `maybeStartGlobalSwell`, `maybeStartRobotSwell`, `advanceGlobalSwell`, `advanceRobotSwell`), so two in-flight diffs on this file would collide. The split follows the spec's own natural seams: Task 5 is the trigger-mechanism rewrite (§1.3's per-tick rate), Task 6 is the forced-return re-key + parameter rename (the rest of §1.3's on/off handoff from Intensity to Frequency), Task 7 is Duration's split mechanism (§1.4, logically independent of 5/6 but same file — sequenced last for a clean diff, matching how the source spec's own §6 commit grouping orders it last of the three).
- **Task 7 (Duration) depends on Task 6, not just Task 5** — although Duration's `pickSwellSplit` helper doesn't interact with the trigger/gate logic Tasks 5–6 touch, it's inserted at the same call sites (`maybeStartGlobalSwell`, `startSingleRobotSwell`, `startCompanyWideSwell`) those tasks already modify — sequencing after both avoids re-deriving a diff against code that's still mid-change.
- **UI wiring (Tasks 8–10) depends only on Tasks 3–4 (store fields + schemas), not on Tasks 5–7 (`audioSwells.ts` mechanics).** The sliders just read/write store values — they work (and are independently testable/reviewable) whether or not `audioSwells.ts` has been updated yet to actually consume `swellFrequency`/`swellDuration`. This is the plan's second genuine parallelization point: one session can take Tasks 5–7 while another takes Tasks 8–10, both starting right after Tasks 3–4 land.
- **UI wiring itself splits into three tasks by file, not one large one** — Task 8 (`navTreeConfig.ts`/`uiStore.ts`, the tree/type plumbing) must land before Task 10 (`FleetParamsContent.tsx`) can reference the new leaf ids/effect-key members it defines; Task 9 (`AudioRigDrawer.tsx`'s wrapper removal) is independent of Task 8 and could run in parallel with it, but both must land before Task 10 assembles the final 2x2 row layout.
- **Docs (Task 11) land last**, spot-checked against final shipped source — same reasoning `PING-VARIANCE-AUTOMATION.md`'s own Task 8 used.

## Dependency Graph

```
Task 1 (controls.ts + SliderLog.tsx: formatValue)      Task 2 (globalAudioSeed.ts: generateSwellFrequency/
    │                                                    generateSwellDuration + narrowed PING_VARIANCE seed range)
    │                                                          │
    │                                                          └──→ Task 3 (audioStore.ts: swellFrequency/
    │                                                                 swellDuration fields, seed-once/carry-forward)
    │                                                                          │
    └──────────────────────→ Task 4 (audioRigConfig.ts: 3 schema changes) ────┤
                                          │                                    │
                    ┌─────────────────────┴───────────────┐                   │
                    ▼                                      ▼                   │
       Task 5 (audioSwells.ts: per-tick          Task 8 (navTreeConfig.ts +   │
        rate trigger mechanism)                   uiStore.ts: new leaf ids)   │
                    │                                      │                   │
                    ▼                              Task 9 (AudioRigDrawer.tsx:│
       Task 6 (audioSwells.ts: forced-return        drop self-wrapping panel) │
        re-key + automation→intensity rename)               │                 │
                    │                                        │                │
                    ▼                                        ▼                │
       Task 7 (audioSwells.ts: pickSwellSplit,     Task 10 (FleetParamsContent.tsx:
        delete duration-range constants)            2x2 Pacing row layout) ───┘
                    │                                        │
                    └───────────────────┬────────────────────┘
                                         ▼
                          Task 11 (docs/AUDIO_SYSTEM.md)
```

(Tasks 5–7 and Tasks 8–10 are two independent chains, both rooted at Tasks 3–4 — safe to parallelize across two sessions; Task 11 waits for both chains to finish.)

## Task List

### Phase 1: Foundation — control capability & seed function

- [ ] **Task 1: `types/controls.ts` + `SliderLog.tsx` — `formatValue` display capability**

  **Description:** Add optional `formatValue?: (value: number) => string` to `SliderLogSchema` only (spec §1.6). `SliderLog.tsx`'s `valueLabel` uses it when present, falling back to today's `formatDisplayValue(value) + unit` exactly as before when absent. No caller supplies it yet — this task is purely additive plumbing.

  **Acceptance criteria:**
  - [ ] `SliderLogSchema` has a new optional `formatValue` field; every other slider schema (`SliderLinearSchema`, `SliderCenteredZeroSchema`) is untouched.
  - [ ] A `SliderLog` rendered with no `formatValue` displays exactly as before (regression guard).
  - [ ] A `SliderLog` rendered with `formatValue` set displays that function's return value verbatim, ignoring `schema.unit` entirely.
  - [ ] The raw `value`/`onChange`/thumb-position math (`sliderLogValueToT`/`sliderLogTToValue`) is unchanged — this only affects the displayed label.

  **Verification:**
  - [ ] `npx vitest run src/types/controls.test.ts src/components/ui/controls/SliderLog.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/types/controls.ts`, `src/types/controls.test.ts`, `src/components/ui/controls/SliderLog.tsx`, `src/components/ui/controls/SliderLog.test.tsx`

  **Estimated scope:** XS (one optional field + one conditional render branch)

- [ ] **Task 2: `globalAudioSeed.ts` — `generateSwellFrequency`/`generateSwellDuration` + narrowed Intensity seed range**

  **Description:** New `SWELL_FREQUENCY_SEED_RANGE`/`SWELL_DURATION_SEED_RANGE` constants (`{min: 2, max: 8}` each) and two new exported functions, same shape as `generatePingVarianceAutomation` — plain `getSeededVal` draws, no quantization step (spec §1.5). Also narrow the existing `PING_VARIANCE_AUTOMATION_SEED_RANGE` from `{min: 0.33, max: 0.66}` to `{min: 0.10, max: 0.60}` (spec §1.2). No other function in this file is touched.

  **Acceptance criteria:**
  - [ ] `generateSwellFrequency`/`generateSwellDuration` always return a value in `[2, 8]`.
  - [ ] Same Attenuation Style id/name always returns the identical value for each (determinism); different pairs produce different values across a reasonable sample.
  - [ ] Both use `getSeededVal` exclusively — a source-scan/assertion confirms no `Math.random()`.
  - [ ] `generatePingVarianceAutomation`'s existing tests now assert a `[0.10, 0.60]` range instead of `[0.33, 0.66]`.

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts` passes with the new/updated coverage above.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** XS (two small pure functions + one constant change)

- [ ] **Task 3: `audioStore.ts` — `swellFrequency`/`swellDuration` fields, seed-once carry-forward**

  **Description:** Add `SWELL_FREQUENCY_UNSEEDED`/`SWELL_DURATION_UNSEEDED` sentinels (`-1` each), `swellFrequency: number`/`swellDuration: number` fields (initialized to their sentinels) and `setSwellFrequency`/`setSwellDuration` actions to `AudioStore`; extend `regenerateGlobalAudioFromSeed` with two more conditional single-field seeds, same sentinel-gated pattern `pingVarianceAutomation` already uses (spec §1.5, §4). **Additive only relative to existing fields** — `pingVarianceAutomation` itself is untouched by this task (its range/seed-value narrowing already landed in Task 2; its on/off role isn't removed until Task 6).

  **Acceptance criteria:**
  - [ ] `swellFrequency`/`swellDuration` are their sentinel values immediately after store init, before any seed call.
  - [ ] The first `regenerateGlobalAudioFromSeed` call seeds both into `[2, 8]`.
  - [ ] A second call with a **different** Attenuation Style id/name leaves both at exactly the values the first call produced.
  - [ ] A hand-set arbitrary value (e.g. `20` for frequency, outside the seed range) between two `regenerateGlobalAudioFromSeed` calls survives a later call untouched.
  - [ ] `setSwellFrequency`/`setSwellDuration` are plain state writes — no `AudioEngine.*` call.

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts` passes with the new `regenerateGlobalAudioFromSeed` cases (mirroring `pingVarianceAutomation`'s existing 3-case coverage, spec §5).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (one file, a well-precedented pattern duplicated twice)

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] `swellFrequency`/`swellDuration` seed correctly and carry forward; `formatValue` renders correctly when supplied. Nothing in the app reads/writes the two new store fields yet, and no schema uses `formatValue` yet.
- [ ] Review with human before proceeding.

---

### Phase 2: Data layer — schemas (parallelizable with Phase 3)

- [ ] **Task 4: `audioRigConfig.ts` — Intensity's new floor, `SWELL_FREQUENCY_SCHEMA`, `SWELL_DURATION_SCHEMA`**

  **Description:** Change `PING_VARIANCE_AUTOMATION_SCHEMA.min` from `0` to `1` (spec §1.2). Add `formatSwellFrequency` (`0` → `'Off'`, `>= 1` → `'N/measure'`, `< 1` → `'every N measures'` via `1/value`) and export `SWELL_FREQUENCY_SCHEMA` (`SliderLogSchema`, `min: 0, max: 24`, `formatValue: formatSwellFrequency`) and `SWELL_DURATION_SCHEMA` (`SliderLinearSchema`, `min: 1, max: 24, step: 1, unit: ' measures'`) — spec §1.3, §1.4, §1.6, §4. Both new schemas exported as bare schemas, same non-`AUDIO_RIG_CONFIG` treatment `PING_VARIANCE_AUTOMATION_SCHEMA` already gets.

  **Acceptance criteria:**
  - [ ] `PING_VARIANCE_AUTOMATION_SCHEMA.min === 1` (was `0`).
  - [ ] `SWELL_FREQUENCY_SCHEMA`/`SWELL_DURATION_SCHEMA` are valid schemas with the correct `type`/`min`/`max`.
  - [ ] `formatSwellFrequency(0) === 'Off'`.
  - [ ] `formatSwellFrequency(4)` names `4` and `/measure` (or the exact string this task's implementation settles on — assert the literal string once written).
  - [ ] `formatSwellFrequency(0.25)` names `4` measures (the reciprocal) and the word `every`/`measures`.

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (for `SliderLogSchema.formatValue`'s type to exist).

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** S (one file, three small schema-level changes)

### Checkpoint: Schemas ready
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/data/audioRigConfig.test.ts` clean.
- [ ] Review with human before proceeding — this is a natural fork point: Phase 3 (`audioSwells.ts` mechanics) and Phase 4 (UI wiring) can now proceed in parallel across two sessions.

---

### Phase 3: Core mechanism — `audioSwells.ts` (parallelizable with Phase 4)

- [ ] **Task 5: Per-tick rate-based trigger mechanism**

  **Description:** Delete `SWELL_TRIGGER_CHANCE` and the `lastRolledMeasure`-gated once-per-whole-measure roll in `tickAudioSwells`. Add `TICKS_PER_MEASURE = 16` and `frequencyToPerTickChance(frequency)` (`Math.min(1, frequency / TICKS_PER_MEASURE)`); `maybeStartGlobalSwell`/`maybeStartRobotSwell`'s trigger check now rolls every tick against this per-tick chance, using the tick's own fractional `measure` as the noise offset (not floored) so successive ticks within the same whole measure roll independently — spec §1.3. `tickAudioSwells` now calls both `maybeStart*` functions unconditionally on every tick (gated only by `frequency > 0`, replacing the old `automation > 0` check — full on/off handoff completes in Task 6).

  **Acceptance criteria:**
  - [ ] `SWELL_TRIGGER_CHANCE` and `lastRolledMeasure` no longer exist anywhere in `audioSwells.ts` (grep clean).
  - [ ] At a fixed `swellFrequency` (e.g. `4`), the observed trigger-attempt rate across many simulated ticks (e.g. 1000 measures' worth) falls within a documented tolerance band (e.g. ±15%, per spec §7 item 3) of `4`/measure.
  - [ ] At `swellFrequency: 0.25`, the observed trigger-attempt rate is within tolerance of one every 4 measures.
  - [ ] `swellFrequency: 24` and `swellFrequency: 16` produce statistically indistinguishable trigger rates (the documented ceiling, spec §1.3/§7).
  - [ ] A scenario is constructed (fixed seed) proving a trigger can now succeed on a non-first tick within a measure — regression guard that the old once-per-measure gate is truly gone, not just relocated.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes with the new rate-based trigger coverage.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (the riskiest task in this plan — changes the file's core scheduling cadence; statistical tests are inherently more finicky than deterministic ones)

- [ ] **Task 6: Forced-return re-key + `automation` → `intensity` rename**

  **Description:** `advanceActiveSwells`/`advanceGlobalSwell`/`advanceRobotSwell`/`maybeForceGlobalSwellReturn`/`maybeForceRobotSwellReturn` all take `frequency: number` in place of their current `automation: number` parameter, for the gate/forced-return role only; every `automation === 0`/`!== 0`/`> 0` check in these functions becomes the equivalent check against `frequency` — the forced-return mechanism's own logic (re-derive `peakDelta` from live value, ride the falling-phase formula, `phase === 'rising'` guard as the one-shot marker) is otherwise byte-for-byte unchanged (spec §1.3). Everywhere `scaleSwellPeakByAutomation`'s own `automation` argument is threaded (magnitude-only role, `maybeStartGlobalSwell`/`startSingleRobotSwell`/`startCompanyWideSwell`), rename the parameter/variable to `intensity` for clarity — same value (`pingVarianceAutomation`), same call sites, same "last step after every clamp" ordering.

  **Acceptance criteria:**
  - [ ] At `swellFrequency: 0`, every still-rising swell (global and robot, single and company-wide) is force-converted to its falling phase with no audible jump on the forcing tick, exactly per `PING-VARIANCE-AUTOMATION.md`'s existing forced-return acceptance criteria — just keyed on `swellFrequency` instead of `pingVarianceAutomation`.
  - [ ] At `swellFrequency` nonzero and `pingVarianceAutomation` at its new floor (`0.01`, from `audioRigConfig.ts`'s `min: 1` display), new swells still start — proves Intensity no longer gates anything.
  - [ ] Magnitude scaling is unchanged: at `intensity: 0.5`, a newly-created swell's `peakDelta` is exactly half of what `intensity: 1` produces, with clamp-before-scale ordering intact (same assertion shape as `PING-VARIANCE-AUTOMATION.md` §5 item 3).
  - [ ] No occurrence of the identifier `automation` remains in `audioSwells.ts` or `audioSwells.test.ts` outside of comments referencing the superseded `PING-VARIANCE-AUTOMATION.md` spec.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes — forced-return suite re-keyed, magnitude-scaling suite renamed and still green.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (mechanical but touches most of the file's function signatures; the subtle part is proving nothing's behavior silently changed during the rename)

- [ ] **Task 7: `pickSwellSplit` — Duration replaces the randomized phase-length ranges**

  **Description:** Add `SWELL_SPLIT_MIN_FRACTION`/`SWELL_SPLIT_MAX_FRACTION` (`0.2`/`0.8`) and `pickSwellSplit(noiseMap, dataId, offset, totalMeasures)`, returning `[risingMeasures, fallingMeasures]` from one shared total and a randomized split ratio (spec §1.4). Replace every `pickPhaseMeasures(...)` pair (in `maybeStartGlobalSwell`, `startSingleRobotSwell`, `startCompanyWideSwell`) with one `pickSwellSplit(...)` call using `swellDuration` as the total. Delete `pickPhaseMeasures`, `DEFAULT_SWELL_DURATION_RANGE`, `MIX_SWELL_DURATION_RANGE`, and `MIX_SWELL_TARGETS` entirely once every caller is converted.

  **Acceptance criteria:**
  - [ ] At a fixed `swellDuration` (e.g. `10`), a newly-created swell's `risingMeasures + fallingMeasures` equals `10` (within `pickSwellSplit`'s documented `Math.round`/`Math.max(1, ...)` rounding) — verified for global, single-robot, and company-wide pools.
  - [ ] Across many seeded draws at a fixed `swellDuration`, the rising/falling ratio varies (not fixed at 50/50) but never exceeds the `[0.2, 0.8]` bound either direction.
  - [ ] A `delay.wet`/`reverb.wet` swell's total duration at a given `swellDuration` matches every other target's total at the same `swellDuration` — proves the old 2x mix-target treatment is gone.
  - [ ] `pickPhaseMeasures`, `DEFAULT_SWELL_DURATION_RANGE`, `MIX_SWELL_DURATION_RANGE`, `MIX_SWELL_TARGETS` no longer exist anywhere in `src/` (grep clean — includes test files).

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes with the new Duration coverage.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (touches the same 3 creation call sites Tasks 5–6 already modified, plus 4 full deletions)

### Checkpoint: Mechanism complete
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/systems/audioSwells.test.ts` clean.
- [ ] Full `audioSwells.test.ts` suite (trigger rate, forced return, magnitude scaling, duration split, plus every pre-existing global/robot/company-wide/`globalBypass` test) passes together. `npm test` clean.
- [ ] Review with human before proceeding.

---

### Phase 4: UI — the 2x2 Pacing layout (parallelizable with Phase 3)

- [ ] **Task 8: `navTreeConfig.ts` + `uiStore.ts` — new leaf ids and effect-key type members**

  **Description:** Add `fleetParams.pacing.frequency`/`fleetParams.pacing.duration` leaf entries to `navTreeConfig.ts`'s Pacing subtree (alongside the existing `tempo`/`automaticEffects` entries), and add `'swellFrequency'`/`'swellDuration'` as new literal members of `uiStore.ts`'s `SelectedFleetParamsEffect` type (spec §7 item 4) — the two `effectKey` values Task 10's `FleetParamsContent.tsx` changes will need. Check `useNavTree.ts`'s `FLEET_PARAMS_GROUP_FIRST_LEAF` and any other place assuming Pacing's leaf count/order (spec §7 item 2) and update as needed.

  **Acceptance criteria:**
  - [ ] `navTreeConfig.ts`'s Pacing subtree lists 4 leaves in order: `tempo`, `frequency`, `duration`, `automaticEffects`.
  - [ ] `SelectedFleetParamsEffect` includes `'swellFrequency'` and `'swellDuration'`.
  - [ ] `FLEET_PARAMS_GROUP_FIRST_LEAF` (or equivalent) still resolves correctly for Pacing given the new leaf count.
  - [ ] Every existing nav-tree test that enumerates Pacing's leaves is updated, not left asserting the old 2-leaf list.

  **Verification:**
  - [ ] `npx vitest run src/data/navTreeConfig.test.ts src/components/panels/screen/nav/useNavTree.test.ts src/components/panels/screen/nav/NavTreeNode.test.tsx src/components/panels/screen/nav/NavTree.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3 (the store fields these leaf ids will eventually wire to must exist, even though this task itself doesn't read them).

  **Files:** `src/data/navTreeConfig.ts`, `src/data/navTreeConfig.test.ts`, `src/stores/uiStore.ts`, `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`, `src/components/panels/screen/nav/NavTreeNode.test.tsx`, `src/components/panels/screen/nav/NavTree.test.tsx`

  **Estimated scope:** M (small logical change, but touches several test files that enumerate the tree)

- [ ] **Task 9: `AudioRigDrawer.tsx` — drop the Intensity leaf's self-wrapping panel**

  **Description:** `AudioRigDrawer()` (the component rendering the Intensity/"Automatic Effects" leaf) currently wraps its slider in its own outer `<div className="audio-rig-drawer" ...>` + `SPEED_AUTOMATION_PANEL_SCHEMA`-driven `DirectionalPanel`. Remove both — the component becomes a plain function returning a bare `<SliderLinear>` row, with `PING_VARIANCE_AUTOMATION_SCHEMA`'s `min: 1` (Task 4) already in effect. `SPEED_AUTOMATION_PANEL_SCHEMA` is deleted once nothing references it (spec §2.1).

  **Acceptance criteria:**
  - [ ] `AudioRigDrawer()` renders a bare `.audio-rig-drawer__param-row` containing the `SliderLinear`, with no outer `audio-rig-drawer` wrapper div and no `DirectionalPanel` of its own.
  - [ ] `SPEED_AUTOMATION_PANEL_SCHEMA` no longer exists anywhere in `src/` (grep clean).
  - [ ] The slider's existing behavior (value = `pingVarianceAutomation * 100`, `onChange` calls `setPingVarianceAutomation(v / 100)`, `disabled={rigDisabled}`) is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes (updated for the removed wrapper — DOM-structure assertions that expected the old wrapper must be rewritten, not deleted wholesale).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (one component shrinks; its wiring is untouched)

- [ ] **Task 10: `FleetParamsContent.tsx` — 2x2 Pacing row layout**

  **Description:** Restructure Pacing's leaf rendering from 2 leaves in one `PACING_ROW_SCHEMA` row to 4 leaves in two rows: `PACING_TOP_ROW_SCHEMA` (Tempo, Frequency) and `PACING_BOTTOM_ROW_SCHEMA` (Duration, Intensity) — same `'responsive'`-orientation `DirectionalPanel` shape `AudioRigDrawer.tsx`'s existing `COMPRESSOR_TOP_ROW_SCHEMA`/`COMPRESSOR_BOTTOM_ROW_SCHEMA` already establish for a 2-control row. `FLEET_PARAMS_GROUPS`'s `'pacing'` entry grows from 2 to 4 leaves (using Task 8's new leaf ids/effect keys). `renderLeaf`'s special-casing grows two new branches (`'swellFrequency'`/`'swellDuration'`) — implemented as dedicated small components (e.g. `TempoLeaf`/`FrequencyLeaf`/`DurationLeaf`), each unconditionally calling its own single `useAudioStore` hook, avoiding the conditional-hook-in-a-branch shape the spec's own code sketch (§4) explicitly flags as illustrative only, not literal (spec §2, §4).

  **Acceptance criteria:**
  - [ ] Pacing renders exactly 4 leaves: Tempo, Frequency, Duration, Intensity (label reflects the schema's `humanLabel`).
  - [ ] Tempo and Frequency render inside one row (`PACING_TOP_ROW_SCHEMA`); Duration and Intensity render inside a second row (`PACING_BOTTOM_ROW_SCHEMA`) — asserted via DOM structure.
  - [ ] Frequency's slider reads/writes `swellFrequency` via `SWELL_FREQUENCY_SCHEMA`; Duration's reads/writes `swellDuration` via `SWELL_DURATION_SCHEMA`.
  - [ ] No hook is called conditionally — each leaf-rendering branch is its own component with an unconditional top-level hook call.
  - [ ] Existing Tempo/Intensity behavior (value, onChange, disabled-under-bypass where applicable) is unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: Fleet Params > Pacing shows the 2x2 layout described above on desktop width, stacking sensibly on narrow viewports (matching every other Pacing/EQ row's existing responsive behavior).

  **Dependencies:** Task 8, Task 9.

  **Files:** `src/components/panels/screen/nav/content/FleetParamsContent.tsx`, `src/components/panels/screen/nav/content/FleetParamsContent.test.tsx`

  **Estimated scope:** M (the layout/wiring change itself is small; correctly avoiding the Rules-of-Hooks trap the spec calls out is the real work)

### Checkpoint: UI live
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx src/components/panels/screen/console/AudioRigDrawer.test.tsx src/data/navTreeConfig.test.ts` clean. `npm test` clean.
- [ ] Manual check: fresh Attenuation Style → Frequency/Duration seeded somewhere in `[2, 8]`, Intensity in `[10, 60]%`; Frequency's displayed text reads "Off" at 0, "N/measure" above 1, "every N measures" below 1.
- [ ] Review with human before proceeding — confirm both Phase 3 and Phase 4 have landed (they may have proceeded in parallel).

---

### Phase 5: Docs

- [ ] **Task 11: `docs/AUDIO_SYSTEM.md` — document the split**

  **Description:** Update the "Audio Swells" section to describe all three Pacing controls (Intensity/Frequency/Duration) in place of the single Ping Variance Automation slider — spot-checked against final shipped source, not reconstructed from the spec from memory. Cover: Frequency's per-tick rate mechanism and its on/off role, Duration's total-length-with-randomized-split mechanism, and Intensity's narrowed magnitude-only role. Remove/replace any stale reference to the old single-slider behavior `PING-VARIANCE-AUTOMATION.md`'s own Task 8 documented.

  **Acceptance criteria:**
  - [ ] No remaining reference to `pingVarianceAutomation` as an on/off gate, or to `SWELL_TRIGGER_CHANCE`/fixed per-measure duration ranges as current behavior.
  - [ ] Every documented constant/function name matches the actual shipped source exactly (`swellFrequency`, `swellDuration`, `frequencyToPerTickChance`, `pickSwellSplit`, etc.).
  - [ ] Frequency's on/off role and Duration's flat (no-mix-exception) treatment are both documented explicitly.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked directly against `audioSwells.ts`'s and `audioStore.ts`'s final shipped code.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 7, Task 10.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 11 tasks are met.
- [ ] `docs/AUDIO_SYSTEM.md` reflects the shipped API.
- [ ] Manual check (spec §5): 2x2 Pacing layout confirmed; Frequency at 0 audibly stops automation within a few measures; Frequency at max produces visibly denser overlapping swells; Duration at min/max noticeably shortens/lengthens swells; Frequency's display text switches phrasing correctly across the 0/1 boundaries.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 5's statistical trigger-rate tests are new to this codebase (every prior probability test here — `SWELL_TRIGGER_CHANCE`, `LFO_QUIET_THRESHOLD`, etc. — is a deterministic seeded-value check, not a rate-over-many-samples one) — a poorly-chosen tolerance band could flake in CI or, if too loose, fail to catch a real regression | Medium | Spec §7 item 3 already flags this; Task 5's acceptance criteria requires a *documented* tolerance, and Plan/Implement should run the new test suite several times locally before considering it stable |
| Deleting `pickPhaseMeasures`/`DEFAULT_SWELL_DURATION_RANGE`/`MIX_SWELL_DURATION_RANGE`/`MIX_SWELL_TARGETS` (Task 7) could leave orphaned imports or unused-export lint failures if any test file still references them directly | Low — caught immediately by `npm run lint`/`build:types` | Task 7's acceptance criteria explicitly requires a grep-clean check across all of `src/`, not just the production file |
| Tasks 5→6→7 all touch the same handful of `audioSwells.ts` functions in sequence — running them out of order, or parallelizing against this plan's explicit sequencing, risks silently dropping one task's diff | Medium if parallelized against the plan's own recommendation | Keep Tasks 5–7 on one branch/session, sequential; Tasks 8–10 are the safe parallel chain instead (Architecture Decisions above) |
| Task 10's `renderLeaf` restructuring risks reintroducing the exact conditional-hook-in-a-branch bug `AudioRigDrawer.tsx`'s own code already warns against (backlog item 18, per `AudioRigEffectPanel`'s doc comment) | Medium — a real bug (stale renders, hooks order violation) if done carelessly, not just a style nit | Task 10's acceptance criteria explicitly requires small dedicated leaf components with unconditional top-level hooks, and the spec's own §4 code sketch is annotated as illustrative-only for this exact reason |
| `navTreeConfig.ts`'s Pacing subtree (Task 8) has several dependent test files (`useNavTree.test.ts`, `NavTreeNode.test.tsx`, `NavTree.test.tsx`) that may assert Pacing's leaf count/order in ways not fully enumerated by this plan | Low-medium — would surface as confusing failures in files this plan didn't anticipate needing changes | Task 8's file list already includes all four test files flagged in spec §7 item 2; Plan/Implement should grep for `'fleetParams.pacing.tempo'`/`'fleetParams.pacing.automaticEffects'` before considering the task done, not just run the listed test files |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **Lore labels for `SWELL_FREQUENCY_SCHEMA`/`SWELL_DURATION_SCHEMA`, and `PING_VARIANCE_AUTOMATION_SCHEMA.humanLabel`'s rename from `'Automatic Effects'` to `'Intensity'`, are first-pass placeholders** — Task 4 should implement them as written in the spec, but flag for the same manual-check confirmation `LFO_DRIFT_GROUPS`' own labels got.
2. **The exact tolerance band for Task 5's statistical rate tests (`±15%` in this plan/spec) is a placeholder** — Task 5 should pick a value empirically (tight enough to catch a regression, loose enough not to flake) rather than treating `±15%` as final.
3. **`AudioRigDrawer.test.tsx`'s existing suite may already assert something about the wrapper Task 9 removes** (e.g. an exact child count) that this plan didn't anticipate — Task 9 should read the existing test file first, same caution `PING-VARIANCE-AUTOMATION.md`'s own Task 6 flagged for its (additive, not subtractive) UI change.
