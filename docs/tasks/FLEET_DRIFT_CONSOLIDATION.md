# Implementation Plan: Fleet Drift Consolidation

Source spec: [docs/specs/FLEET_DRIFT_CONSOLIDATION.md](../specs/FLEET_DRIFT_CONSOLIDATION.md). Source intent: [docs/intent/fleet-drift-consolidation.md](../intent/fleet-drift-consolidation.md). Restructures the shipped 4-group design from [docs/specs/archive/LFO_DRIFT_GROUPS.md](../specs/archive/LFO_DRIFT_GROUPS.md) (Roadmap Phase 10.3, [docs/tasks/archive/LFO_DRIFT_GROUPS.md](archive/LFO_DRIFT_GROUPS.md)) — every task below modifies code that phase already shipped, not blank-slate additions.

## Overview

Merge the 3 existing global-chain LFO drift groups (`eq3`, `filterLPF`, `filterHPF`) into one new group, `globalFx`, covering all 7 global-chain LFO targets with a single shared `{ rateDrift, depthDrift }` pair — leaving `DriftGroupId` at 2 members (`'globalFx' | 'robots'`) instead of 4. The 3 Rate/Depth Drift slider pairs currently embedded inside the EQ/Low-Pass/High-Pass panels come out; a new standalone `FleetDriftPanel` component and a new top-level "Fleet Drift" nav group (sibling to Pacing/EQ & Filters/Time & Space/Output, positioned right after EQ & Filters) replace them. `robots` (Probe Drift) is untouched throughout. Every mechanic 10.3 already built (per-group oscillator pools, bounded swing math, the Depth Drift silence guard, cross-group isolation, the `Signal.override` fix) is reused unchanged — this phase changes group *count and placement*, not the underlying mechanism.

## Architecture Decisions

- **`types/lfo.ts`'s `DriftGroupId` shrink lands first, alone, before anything else.** Same reasoning 10.3's own plan used for introducing it: every other task either imports it directly or depends transitively on something that does, and nothing about it depends on any other task's own output.
- **No structural/functional split is needed for the engine task this time**, unlike 10.3's own Task 5/6 split. That split existed because 10.3 was introducing per-group behavior for the very first time (there was a real "still shared, not yet independent" intermediate state worth isolating). Here, `lfoDrift.ts` is *already* fully group-generic — `attachDrift`/`refreshRateDriftGain`/`refreshDepthDriftGain`/`setGlobalRateDrift`/`setGlobalDepthDrift` all already take or key off a `group: DriftGroupId` parameter (spec §1.1/§4). Shrinking the group count and collapsing `driftGroupForTarget`'s 3 branches into 1 is a single, atomic, low-risk change — one task.
- **Seed plumbing (Tasks 2-5) mirrors 10.3's own Phase 1 split** — pure data/config contraction (8 keys → 4), independently testable against `DEFAULT_GLOBAL_AUDIO_SETTINGS`/determinism assertions, de-risked ahead of the engine task. `sessionDiff.ts` (Task 5) is new relative to 10.3's own plan — Session Storage didn't exist yet when 10.3 shipped — but it's the same shape of small, mechanical, independently-testable contraction as Tasks 2-4.
- **UI schema (Task 7) only needs Task 1, so it can run in parallel with the engine task (Task 6)** — same parallelization 10.3's own plan established for its equivalent task.
- **`audioStore.ts` gets its own task (Task 8) even though its function bodies don't change** (spec §4 — `setGlobalLfoDrift`/`applyGlobalAudioToEngine` are already generic over `DRIFT_GROUP_IDS`). The task exists to re-parameterize its *tests* for the 2-group shape and confirm the wiring still integrates correctly end-to-end — a real, independently-verifiable checkpoint, not busywork.
- **The Drawer task (Task 9) does removal and addition together, in one task, in one file.** Splitting "remove the 3 embedded drift sliders" from "add `FleetDriftPanel`" would leave an intermediate commit with no way to edit global-chain drift at all — a regression, not a safe incremental step. Task 9 depends on both Task 7 (needs the new `LFO_DRIFT_GROUPS` shape) and Task 8 (needs `audioStore`'s wiring confirmed against the new shape first).
- **Nav-tree wiring (Tasks 10-11) is split into "the tree shape exists" (Task 10: types + static schema) and "the tree resolves selection correctly" (Task 11: `useNavTree.ts`'s 3 lookup-table additions)** — independently testable halves of the same slice, same reasoning as splitting seed-range tables from the code that samples them. Both are parallelizable with Phases 2-5: nav-tree ids are plain strings, not imports from the engine/store layer.
- **`FleetParamsContent.tsx` (Task 12) is sequenced last among the "build" tasks** — it's the one integration point that actually surfaces everything: it needs `FleetDriftPanel` to exist (Task 9) and needs the nav tree to already resolve `'globalDrift'` correctly (Task 11). This mirrors 10.3's own reasoning for sequencing its `audioStore.ts` task after both the data and engine halves were done.
- **Docs land last (Task 13)**, once the shipped shape is real and spot-checkable — and, per spec §1.6, this is also where a pre-existing stale claim in `docs/AUDIO_SYSTEM.md` (unrelated to this phase's own changes, but sitting in the exact section being rewritten) gets corrected rather than compounded.

## Dependency Graph

```
Task 1 (types/lfo.ts: DriftGroupId 4→2)
    │
    ├──→ Task 2 (types/globalAudio.ts: reshape lfoDrift default)
    │         │
    │         ├──→ Task 4 (globalAudioSeed.ts: sample 2 groups) ←── Task 3 (seed + loading range tables, no dep on Task 1/2)
    │         │
    │         └──→ Task 5 (sessionDiff.ts: quantize/cleanup 4→2)
    │
    ├──→ Task 6 (lfoDrift.ts: merge driftGroupForTarget + per-group state)
    │         │
    ├──→ Task 7 (audioRigConfig.ts: LFO_DRIFT_GROUPS 4→2)         │
    │              │                                              │
    │              └──→ Task 9 (AudioRigDrawer.tsx) ←── Task 8 (audioStore.ts tests) ←── Task 2, Task 6
    │                              │
    ├──→ Task 10 (uiStore.ts + navTreeConfig.ts: new group/types)
    │         │
    │         └──→ Task 11 (useNavTree.ts: lookup tables)
    │                              │
    │                              └──→ Task 12 (FleetParamsContent.tsx) ←── Task 9
    │                                              │
    └──────────────────────────────────────────────┴──→ Task 13 (docs/AUDIO_SYSTEM.md)
```

## Task List

### Phase 1: Foundation & seed plumbing

- [x] **Task 1: `types/lfo.ts` — shrink `DriftGroupId` to 2 members**

  **Description:** Replace the 4-member `DriftGroupId` (`'eq3' | 'filterLPF' | 'filterHPF' | 'robots'`) with the 2-member `'globalFx' | 'robots'`, and update `DRIFT_GROUP_IDS` to match (spec §1.1/§4).

  **Acceptance criteria:**
  - [x] `DriftGroupId` is exported with exactly the 2 documented members.
  - [x] `DRIFT_GROUP_IDS` is a `readonly DriftGroupId[]` containing exactly `['globalFx', 'robots']`.
  - [x] No leftover reference to `'eq3'`/`'filterLPF'`/`'filterHPF'` as a `DriftGroupId` value anywhere in this file.

  **Verification:**
  - [x] `npm run build:types` — expect this to surface every downstream file still using the old 4-member shape (that's the point; those get fixed in later tasks, not here).
  - [x] `npx vitest run src/types/lfo.test.ts` passes, updated to assert `DRIFT_GROUP_IDS` has exactly 2 members, no duplicates, and no `'eq3'`/`'filterLPF'`/`'filterHPF'`.

  **Dependencies:** None.

  **Files:** `src/types/lfo.ts`, `src/types/lfo.test.ts`

  **Estimated scope:** XS (one type + one const array, both already existing)

- [x] **Task 2: `types/globalAudio.ts` — reshape `lfoDrift` default**

  **Description:** Change `GlobalAudioSettings.lfoDrift`'s effective key set from the old 4-group `Record` to `Record<DriftGroupId, ...>` against the new 2-member type (the field's own declared type is already `Record<DriftGroupId, {...}>`, so it narrows automatically once Task 1 lands — the real work is `DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift`, which drops its `eq3`/`filterLPF`/`filterHPF` entries and gains one `globalFx: { rateDrift: 0, depthDrift: 0 }` entry, spec §4).

  **Acceptance criteria:**
  - [x] `DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift` has exactly 2 keys: `globalFx` and `robots`, each `{ rateDrift: 0, depthDrift: 0 }`.
  - [x] Every other object-literal construction of a `GlobalAudioSettings`/`.lfoDrift` value elsewhere in the codebase (not a spread of the default) either still compiles or is flagged by `build:types` for fixing in its own owning task — don't silently patch a file this task doesn't own.

  **Verification:**
  - [x] `npm run build:types` — confirm the only remaining errors are in files this plan's later tasks already own (`globalAudioSeed.ts`/Task 4, `sessionDiff.ts`/Task 5, `lfoDrift.ts`/Task 6, `audioRigConfig.ts`/Task 7, `AudioRigDrawer.tsx`/Task 9, `audioStore.ts`'s test/Task 8) — not a new file this plan didn't anticipate.
  - [x] `npx vitest run src/types/globalAudio.test.ts` passes, if it exists and asserts `lfoDrift`'s shape directly (update the old 4-group assertion to 2, or loop over `DRIFT_GROUP_IDS`).

  **Dependencies:** Task 1.

  **Files:** `src/types/globalAudio.ts`, `src/types/globalAudio.test.ts` (if it exists)

  **Estimated scope:** XS (one default-object literal)

- [x] **Task 3: Seed range + loading range tables — 8 keys become 4**

  **Description:** Contract `GlobalAudioSeedFieldKey`'s 8 `'lfoDrift.<group>.<field>'` keys down to 4 (`'lfoDrift.globalFx.rateDrift'`/`'.depthDrift'`, `'lfoDrift.robots.rateDrift'`/`'.depthDrift'`) in `globalAudioSeedRanges.ts`, at the unchanged `{ min: -1, max: 1, scale: 'linear', step: 0.01 }` range per key; mirror the same 8→4 contraction in `globalAudioLoadingRanges.ts` at the unchanged `{ min: -0.7, max: 0.7 }` window per key (spec §4).

  **Acceptance criteria:**
  - [x] `GlobalAudioSeedFieldKey` includes exactly the 4 new `lfoDrift.*` keys; the old 8 (including any `eq3`/`filterLPF`/`filterHPF` variant) are gone, not left dangling alongside the new ones.
  - [x] `GLOBAL_AUDIO_SEED_RANGES` and `GLOBAL_AUDIO_LOADING_RANGES` both still type-check as exhaustive `Record<GlobalAudioSeedFieldKey, ...>` (a missing entry is a compile error once the union shrinks).
  - [x] Every non-`lfoDrift` key in both tables is untouched.

  **Verification:**
  - [x] `npm run build:types` clean for these two files specifically (other files' errors are expected/tracked by their own tasks per Task 2's note).
  - [x] `npx vitest run src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts` pass, with closed-set key-coverage assertions contracted from 8 to 4 entries.

  **Dependencies:** None (`GlobalAudioSeedFieldKey` is its own string-literal union, independent of `DriftGroupId`/`GlobalAudioSettings` — same independence 10.3's own equivalent task had).

  **Files:** `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioSeedRanges.test.ts`, `src/data/globalAudioLoadingRanges.ts`, `src/data/globalAudioLoadingRanges.test.ts`

  **Estimated scope:** S (2 files + tests, table entries only — 4 fewer rows, same shape)

- [x] **Task 4: `globalAudioSeed.ts` — sample 2 groups**

  **Description:** In `generateGlobalAudioSettings`, replace the 4-sub-object `lfoDrift` block with 2 (`globalFx`, `robots`), each still sampling its own `rateDrift`/`depthDrift` independently via the existing `sampleField()` helper, unchanged (spec §4).

  **Acceptance criteria:**
  - [x] `generateGlobalAudioSettings(attenuationStyleId, attenuationStyleName)`'s return value includes a fully-populated `lfoDrift` for both `globalFx` and `robots`.
  - [x] Same input always produces identical `lfoDrift` output for both groups (determinism, unchanged property).
  - [x] `globalFx` and `robots` don't share a draw (non-degenerate — the 2-group version of 10.3's own cross-group-independence check).
  - [x] All 4 sampled values fall within Task 3's loading range on every call.

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts` passes, contracted from 4-group to 2-group coverage (determinism/non-degeneracy/bounds re-run per group, cross-group independence re-asserted for the 2 remaining groups).
  - [x] `npm run build:types`, `npm run lint` clean for this file.

  **Dependencies:** Task 2, Task 3.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** S (one reshaped block in an existing function)

- [x] **Task 5: `sessionDiff.ts` — quantize/cleanup block, 4 groups become 2**

  **Description:** Contract the hand-written per-group `lfoDrift` quantize/cleanup block ([sessionDiff.ts:167-185](../../src/utils/sessionDiff.ts#L167-L185)) from 4 sub-objects to 2 (`globalFx`, `robots`) — same `quantizeToStep(…, -1, 0.01)` + `cleanupFloatingPoint(…, 2)` pair per field, unchanged (spec §4).

  **Acceptance criteria:**
  - [x] The rewritten block only references `globalFx` and `robots` — no `eq3`/`filterLPF`/`filterHPF` sub-object remains.
  - [x] Quantization/cleanup behavior (step size, decimal precision) is unchanged from the pre-existing per-field logic, just applied to fewer keys.

  **Verification:**
  - [x] `npx vitest run src/utils/sessionDiff.test.ts` passes, contracted to 2-group coverage; include a save/load round trip with a genuinely nonzero `globalFx` drift value (not left at its `0` default — matching this codebase's own established "seed a real, distinguishing value" parity-test convention, memory: parity-test-fixture-non-default-values) confirming it reproduces exactly.
  - [x] `npm run build:types`, `npm run lint` clean for this file.

  **Dependencies:** Task 2.

  **Files:** `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** S (one reshaped block, same pattern as Task 4)

### Checkpoint: Foundation & seed plumbing
- [x] `npm run build:types` — remaining errors are exactly the files Tasks 6-9 own (`lfoDrift.ts`/`lfoDrift.test.ts`, `audioRigConfig.ts`, `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`, `lfoEngine.test.ts`, `audioStore.test.ts`), nothing unexpected.
- [x] `npm run lint` clean.
- [x] `npx vitest run src/types/lfo.test.ts src/types/globalAudio.test.ts src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts src/utils/globalAudioSeed.test.ts src/utils/sessionDiff.test.ts` all pass (131 tests).
- [x] `generateGlobalAudioSettings` for two different Attenuation Style names produces two different, in-range `lfoDrift` records; within one style's result, `globalFx` and `robots` don't share a draw.
- [ ] Review with human before proceeding.

---

### Phase 2: Drift engine restructuring

- [x] **Task 6: `lfoDrift.ts` — merge into `globalFx`**

  **Description:** Collapse `driftGroupForTarget`'s 3 global-chain branches (`eq3.*`/`lpf.*`/`hpf.*`) into 1 (all three now return `'globalFx'`); replace `DRIFT_POOL_SIZE`'s 4 entries with 2 (`globalFx: 7, robots: 8`); replace `globalRateDriftByGroup`/`globalDepthDriftByGroup`'s 4-key initial objects with 2-key ones (spec §1.1/§1.2/§4). No other function in this file changes — `getOrCreateDriftPool`, `attachDrift`, `refreshRateDriftGain`, `refreshDepthDriftGain`, `detachDrift`, `setGlobalRateDrift`, `setGlobalDepthDrift`, `isDriftSuppressed`/`setDriftSuppressed` are all already generic over whatever `DriftGroupId` contains — this task's diff is confined to the 3 group-keyed constants/tables plus `driftGroupForTarget`'s own body.

  **Acceptance criteria:**
  - [x] `driftGroupForTarget` returns `'globalFx'` for every one of the 7 `GlobalLfoTargetId` members (former `eq3.*`, `lpf.*`, and `hpf.*` targets all land on the same group now) and `'robots'` for every `RobotLfoTargetId`, unchanged.
  - [x] Connecting a target from any of the 3 former groups (e.g. one `eq3.*`, one `lpf.*`, one `hpf.*`) never constructs more than 7 pool oscillators total for `globalFx`; `robots` never exceeds 8 — regardless of how many targets in the other group have connected.
  - [x] `globalFx`'s pool is not constructed until its own first successful `connectLfoTarget` call for any of its 7 targets.
  - [x] **Merge-specific regression case:** connecting one primary each from a former-`eq3`, former-`filterLPF`, and former-`filterHPF` target, then calling `setGlobalRateDrift('globalFx', 1)`, changes all 3 primaries' rate-drift Gain identically, in one call — the direct proof the merge happened, not just that the type compiles (spec §5 item 4).
  - [x] **Cross-group isolation, 2-way:** `setGlobalRateDrift('globalFx', v)`/`setGlobalDepthDrift('globalFx', v)` never touch a `robots`-group primary's Gains, and vice versa.
  - [x] Swing-bound behavior, the full Depth Drift silence-guard matrix, and the `layerN.phase` exclusion all still hold, re-verified for both `globalFx` and `robots`.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoDrift.test.ts` passes, with every former eq3/filterLPF/filterHPF-specific describe block merged into one globalFx-scoped set, plus the new merge-specific regression case and the 2-way (not 4-way) cross-group isolation matrix.
  - [x] `npm run build:types`, `npm run lint` clean for this file.

  **Dependencies:** Task 1.

  **Files:** `src/engine/lfoDrift.ts`, `src/engine/lfoDrift.test.ts`, and (plan gap, found via `build:types`) `src/engine/lfoEngine.test.ts` — its own integration-level drift coverage (pool-sizing and cross-group-isolation tests exercising `lfoEngine.connectLfoTarget`/`setGlobalRateDrift`/`setGlobalDepthDrift` end-to-end) still referenced the old `'eq3'`/`'filterLPF'`/`'filterHPF'` group ids and wasn't listed in the spec's own file structure (§2) or this plan originally

  **Estimated scope:** M (touches several module-scope constants in one file; the highest-risk task in this plan per spec §7, even though it's mechanically smaller than 10.3's own equivalent — a `driftGroupForTarget` misclassification here would silently reintroduce a 3-vs-1 split the rest of the phase assumes doesn't exist)

### Checkpoint: Drift engine core
- [x] `npm run build:types` — remaining errors are exactly Tasks 7-9's own files (`audioRigConfig.ts`, `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`, `audioStore.test.ts`).
- [x] `npm run lint`, and `npx vitest run src/engine/lfoDrift.test.ts src/engine/lfoEngine.test.ts` clean (20 + 141 tests).
- [x] A test-level check confirms: connect one primary from a former-`eq3` target and one `robots`-group primary; `setGlobalRateDrift('globalFx', 1)` leaves the `robots` primary's rate-drift Gain at its pre-call value.
- [ ] Review with human before proceeding.

---

### Phase 3: UI schema (parallelizable with Phase 2)

- [ ] **Task 7: `audioRigConfig.ts` — `LFO_DRIFT_GROUPS` 4→2**

  **Description:** Replace `LFO_DRIFT_GROUPS`' 4 entries with 2: a new `driftGroupSchema('globalFx', 'SIGNAL CHAIN FLUX', 'Fleet Drift')` (replacing the 3 it displaces) and the existing `driftGroupSchema('robots', 'AGENT FLUX', 'Robot Drift')`, untouched (spec §4). `driftGroupSchema`'s own body is unchanged — same helper, same `audioRig.lfoDrift.${group}` id convention, same `-100..100` `sliderCenteredZero` shape.

  **Acceptance criteria:**
  - [ ] `LFO_DRIFT_GROUPS` has exactly 2 entries, `'globalFx'` and `'robots'`, in that order.
  - [ ] The `'robots'` entry (`panel`/`rateSchema`/`depthSchema`, ids, labels) is byte-for-byte unchanged from before this task.
  - [ ] The new `'globalFx'` entry's ids follow the existing convention exactly (`audioRig.lfoDrift.globalFx`, `.rateDrift`, `.depthDrift`); every id across both entries' schemas (2 panels + 4 sliders = 6 ids) is unique.
  - [ ] Neither entry is added to `AUDIO_RIG_CONFIG`'s own array (unchanged constraint — no `DriftGroupId` value is ever an `AudioRigEffectKey`).

  **Verification:**
  - [ ] `npx vitest run src/data/audioRigConfig.test.ts` passes, with `LFO_DRIFT_GROUPS`' shape/bounds/id-uniqueness assertions contracted to 2 entries; a direct assertion that the `'robots'` entry's values are unchanged from the pre-task fixture.
  - [ ] `npm run build:types`, `npm run lint` clean for this file.

  **Dependencies:** Task 1.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** S (one array shrinks from 4 objects to 2, same helper reused)

### Checkpoint: UI schema
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/data/audioRigConfig.test.ts` clean.
- [ ] `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx` still passes unmodified — direct confirmation that `RobotDriftPanel`'s `ROBOTS_DRIFT_GROUP` lookup (`LFO_DRIFT_GROUPS.find((g) => g.group === 'robots')`) still resolves correctly after the array shrinks.
- [ ] Review with human before proceeding (can happen in parallel with the Phase 2 checkpoint).

---

### Phase 4: Store integration

- [ ] **Task 8: `audioStore.ts` — confirm wiring against the 2-group shape**

  **Description:** No source-level diff expected in `setGlobalLfoDrift` or `applyGlobalAudioToEngine` — both are already generic over `DRIFT_GROUP_IDS` (spec §4). This task re-parameterizes `audioStore.test.ts`'s existing per-group coverage from 4 groups to 2 and confirms the integration actually holds once Tasks 1/2/6 are in place, rather than assuming "no source diff" means "nothing to verify."

  **Acceptance criteria:**
  - [ ] `setGlobalLfoDrift('globalFx', { rateDrift: x })` updates only `globalAudio.lfoDrift.globalFx.rateDrift` in the store and calls `lfoEngine.setGlobalRateDrift('globalFx', x)` — `robots`' stored value and matching engine setter are untouched.
  - [ ] Passing only one field for a group leaves that group's other field, and the other group entirely, untouched.
  - [ ] `applyGlobalAudioToEngine(globalAudio)` calls both `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift` for both `globalFx` and `robots`, each with that group's own current values.
  - [ ] If `audioStore.ts` itself needed ANY line changed to make this pass, that's a signal the spec's "no-diff-body" assumption was wrong — flag it explicitly in the PR/commit message rather than silently absorbing it.

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts` passes, with per-group coverage contracted from 4 to 2 groups, cross-group non-interference re-asserted for the 2 remaining groups.
  - [ ] `npm run build:types` — this is the point where every remaining reference to the old 4-group `DriftGroupId` shape anywhere in the codebase should be gone; a clean `build:types` here across the *whole project* (not just this file) is a real milestone, not just this file's own concern.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 2, Task 6.

  **Files:** `src/stores/audioStore.test.ts` (source file touched only if the acceptance criteria's last bullet fires)

  **Estimated scope:** XS (test-only, unless the no-diff-body assumption is wrong)

### Checkpoint: Store integration
- [ ] `npm run build:types` clean across the entire project — confirm no file anywhere still references the old 4-member `DriftGroupId` shape.
- [ ] `npm run lint`, `npx vitest run src/stores/audioStore.test.ts` clean.
- [ ] Review with human before proceeding.

---

### Phase 5: Drawer UI — remove per-block drift, add `FleetDriftPanel`

- [ ] **Task 9: `AudioRigDrawer.tsx` — remove embedded drift, add `FleetDriftPanel`**

  **Description:** Remove `driftContent` from `AudioRigLfoGroupProps` and its render line from `AudioRigLfoGroup`; remove `driftGroup`/`drift`/`setGlobalLfoDrift`/`driftHeldOff`/`handleRateDriftChange`/`handleDepthDriftChange` entirely from `AudioRigEffectPanel` (they can never resolve to a truthy `driftGroup` once `LFO_DRIFT_GROUPS` no longer contains any `AudioRigEffectKey`-matching entry). Add a new exported `FleetDriftPanel` component, structurally mirroring `RobotDriftPanel` (`SignatureArrayDrawer.tsx`) exactly: looks up `LFO_DRIFT_GROUPS`' `'globalFx'` entry once at module scope, reads/writes `useAudioStore` directly, renders `DirectionalPanel`/2 `SliderCenteredZero`s/`HeldOffNote` (spec §1.4/§1.5/§4).

  **Acceptance criteria:**
  - [ ] None of the EQ, Low-Pass Filter, or High-Pass Filter panels render any Rate/Depth Drift slider anymore.
  - [ ] `FleetDriftPanel` renders its own Rate Drift / Depth Drift sliders bound to `globalAudio.lfoDrift.globalFx`; dragging either calls `setGlobalLfoDrift('globalFx', …)` with the correct `%`-to-fraction (`v / 100`) conversion.
  - [ ] `FleetDriftPanel`'s sliders grey out and read `0` under `driftHeldOff`, matching `RobotDriftPanel`'s own existing `driftHeldOff` handling exactly.
  - [ ] `FleetDriftPanel` is exported from `AudioRigDrawer.tsx` (so `FleetParamsContent.tsx`, in Task 12, can import it alongside `AudioRigDrawer`/`AudioRigEffectPanel`).
  - [ ] No dead code remains: no unused `driftGroup`/`drift`/`handleRateDriftChange`/`handleDepthDriftChange` identifiers left in `AudioRigEffectPanel`.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` pass — EQ/LPF/HPF panel tests gain explicit negative assertions (`queryByRole`/`queryByText` returns null for drift controls) rather than simply dropping the old positive assertions; new `FleetDriftPanel` coverage (render, onChange, `driftHeldOff`) mirrors `RobotDriftPanel`'s own existing test shape.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7, Task 8.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`, `src/components/panels/screen/console/AudioRigEffectPanel.test.tsx`

  **Estimated scope:** M (one file's worth of removal + one new component, but the removal spans 3 separate call sites within it)

### Checkpoint: Drawer UI complete
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/components/panels/screen/console` clean.
- [ ] Manual check: `npm run dev`, open Fleet Params' EQ/LPF/HPF leaves individually — confirm none show a drift slider anymore. `FleetDriftPanel` isn't reachable from the nav tree yet (Tasks 10-12 aren't done) — this checkpoint only confirms the component itself renders correctly in isolation (e.g. via a temporary dev-only mount, or defer this manual check to the Phase 7 checkpoint once it's actually wired in — reviewer's call).
- [ ] Review with human before proceeding.

---

### Phase 6: Nav tree wiring (parallelizable with Phases 2-5 — no dependency on the engine/store/drawer work)

- [ ] **Task 10: `uiStore.ts` + `navTreeConfig.ts` — new Fleet Drift group**

  **Description:** Add `'fleetDrift'` to `FleetParamsGroup` and `'globalDrift'` to `SelectedFleetParamsEffect` in `uiStore.ts`. Add a new `fleetParams.fleetDrift` node to `navTreeConfig.ts`'s static `NAV_TREE_SCHEMA`, positioned immediately after `fleetParams.eqFilters` and before `fleetParams.timeSpace`, with trait `'spectral'` and one child leaf `fleetParams.fleetDrift.drift` (spec §1.3/§4).

  **Acceptance criteria:**
  - [ ] `FleetParamsGroup` has exactly 5 members now, `'fleetDrift'` positioned between `'eqFilters'` and `'timeSpace'` in the type's own declaration order (matches the tree's visual order, even though TypeScript unions aren't ordered at runtime — for readability/consistency with every other type in this file).
  - [ ] `SelectedFleetParamsEffect` includes `'globalDrift'` as a new member, alongside `'tempo'`/`'automaticEffects'`/`'swellFrequency'`/`'swellDuration'`.
  - [ ] `NAV_TREE_SCHEMA`'s `fleetParams.children` array has the new `fleetParams.fleetDrift` node positioned between `fleetParams.eqFilters` and `fleetParams.timeSpace`, with exactly 1 child (`fleetParams.fleetDrift.drift`), trait `'spectral'`.
  - [ ] No existing node's id, trait, or position is altered.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npx vitest run src/data/navTreeConfig.test.ts` passes, updated if it enumerates `fleetParams` children directly.

  **Dependencies:** None.

  **Files:** `src/stores/uiStore.ts`, `src/data/navTreeConfig.ts`, `src/data/navTreeConfig.test.ts` (if it exists and asserts this shape)

  **Estimated scope:** S (2 small type/data additions)

- [ ] **Task 11: `useNavTree.ts` — selection-resolution lookup tables**

  **Description:** Add `'fleetDrift'` to the `FLEET_PARAMS_GROUPS` id-guard array; add a `fleetDrift: 'globalDrift'` entry to `FLEET_PARAMS_GROUP_FIRST_LEAF`; add a `drift: 'globalDrift'` entry to `FLEET_PARAMS_LEAF_TO_EFFECT_KEY` (spec §1.3/§4).

  **Acceptance criteria:**
  - [ ] Selecting the bare `fleetParams.fleetDrift` group node resolves `selectedFleetParamsEffect` to `'globalDrift'` (via `FLEET_PARAMS_GROUP_FIRST_LEAF`).
  - [ ] Selecting `fleetParams.fleetDrift.drift` directly also resolves `selectedFleetParamsEffect` to `'globalDrift'` (via `FLEET_PARAMS_LEAF_TO_EFFECT_KEY`).
  - [ ] `isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible` behave the same way for `fleetParams.fleetDrift`/`fleetParams.fleetDrift.drift` as they already do for every other Fleet Params group/leaf pair — their existing generic logic (keyed off `asFleetParamsGroup`) already covers the new group once Task 10 adds it to the guard array; confirm this rather than adding a new branch to either predicate.
  - [ ] Selecting `fleetParams.fleetDrift` (or its leaf) sets `expandedTopLevelBranch`/tree-highlighting state identically to selecting any other Fleet Params group (no special-cased behavior).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/useNavTree.test.ts` passes, with new coverage for: tree shape (the new node appears with 1 child, positioned correctly — may already be covered by Task 10's own test if `navTreeConfig.test.ts` asserts it; otherwise assert here), `select()` resolution for both the group and its leaf, and `isDeepestTwoLevels`/`isAutoExpandTier` parity with existing groups.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10.

  **Files:** `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`

  **Estimated scope:** S (3 small table additions, no new logic branches)

### Checkpoint: Nav tree wiring
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/data/navTreeConfig.test.ts src/components/panels/screen/nav/useNavTree.test.ts` clean.
- [ ] A test-level check confirms selecting `fleetParams.fleetDrift.drift` directly (no intermediate clicks) sets every ancestor expand field correctly in one step — the same integration shape `navPanelViewsAndContent.integration.test.ts` already covers for other deep Fleet Params selections; add a case there if that file is the natural home for it.
- [ ] Review with human before proceeding (can happen any time relative to the Phase 2-5 checkpoints — no shared dependency).

---

### Phase 7: Content view wiring (the integration that surfaces everything)

- [ ] **Task 12: `FleetParamsContent.tsx` — Fleet Drift group + leaf**

  **Description:** Add a `'fleetDrift'` entry to `FLEET_PARAMS_GROUPS` (the content-order array — a *different* table from `navTreeConfig.ts`'s, per spec §1.6's documented hand-sync duplication), positioned between `'eqFilters'` and `'timeSpace'`, with one leaf (`fleetParams.fleetDrift.drift`, `effectKey: 'globalDrift'`). Add a `renderLeaf` branch: `if (effectKey === 'globalDrift') return <FleetDriftPanel />;`, alongside the existing `'automaticEffects'` → `<AudioRigDrawer />` branch. Import `FleetDriftPanel` from `AudioRigDrawer.tsx` (spec §1.5/§4).

  **Acceptance criteria:**
  - [ ] A 5th accordion ("Fleet Drift") renders in the Fleet Params content view, positioned after "EQ & Filters" and before "Time & Space."
  - [ ] It gets its own group-level `IntroPanel` once approached, via the same generic `FLEET_PARAMS_GROUPS.map()` every other group already renders through — no new `IntroPanel` call site needed.
  - [ ] Its one leaf renders `FleetDriftPanel`'s content once approached, via the same lazy-mount gate (`leafHasApproached`) every other leaf already uses.
  - [ ] No change to any other group's rendering, ordering, or accordion-open-state behavior.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx` passes, with new coverage for the group's position/label/intro-panel/lazy-mount, matching the existing per-group test shape used for Pacing/EQ & Filters/Time & Space/Output.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, navigate to Fleet Params, confirm "Fleet Drift" appears in both the nav tree and the content view at the correct position, with its own intro panel and working Rate/Depth Drift sliders.

  **Dependencies:** Task 9, Task 11.

  **Files:** `src/components/panels/screen/nav/content/FleetParamsContent.tsx`, `src/components/panels/screen/nav/content/FleetParamsContent.test.tsx`

  **Estimated scope:** S (one array entry + one `renderLeaf` branch + one import — the render/observer/state-wiring logic itself is already generic over `FLEET_PARAMS_GROUPS`' contents, per spec §4)

### Checkpoint: Feature complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual/audible check (spec §5): load a fresh Attenuation Style, open Fleet Params, confirm "Fleet Drift" appears right after "EQ & Filters," with its own intro panel and a seeded (nonzero-but-modest) Rate/Depth Drift starting position; confirm EQ/Low-Pass/High-Pass no longer show any drift sliders; with a global-chain LFO already audible, raise Fleet Drift's Depth Drift and confirm the wander comes from the one merged control regardless of which of the 3 former effect blocks that LFO targets; confirm Probe Drift (Probes/Companies) is completely unaffected.
- [ ] Review with human before proceeding.

---

### Phase 8: Docs

- [ ] **Task 13: `docs/AUDIO_SYSTEM.md` — document the 2-group design**

  **Description:** Rewrite the "Drift" section (currently §289-325) for the new 2-group shape — the drift-group table (spec §1.1/§1.2), pool sizing (`globalFx: 7, robots: 8`), and the seeding/UI paragraphs' key counts (4→2, 8→4). While in this section, correct the pre-existing stale "UI" paragraph claim that `AudioRigDrawer.tsx` maps `LFO_DRIFT_GROUPS` as a sibling to `AUDIO_RIG_CONFIG.map(...)` — describe the actual shipped shape instead: `robots`' UI lives in `SignatureArrayDrawer.tsx`'s `RobotDriftPanel`, `globalFx`'s UI lives in `AudioRigDrawer.tsx`'s new `FleetDriftPanel`, surfaced via `FleetParamsContent.tsx`'s own Fleet Drift leaf — neither is a sibling map inside `AudioRigDrawer`'s own `AUDIO_RIG_CONFIG.map()` block (spec §1.6).

  **Acceptance criteria:**
  - [ ] The 2-group table, pool sizes, and merge (`driftGroupForTarget`'s collapsed branches) are documented in prose, matching the shipped source exactly.
  - [ ] The "UI" paragraph accurately describes `FleetDriftPanel`/`RobotDriftPanel` as 2 separate standalone components, each surfaced through its own real call site — not a `.map()` over `LFO_DRIFT_GROUPS` anywhere.
  - [ ] Every documented function signature (`driftGroupForTarget`, `setGlobalRateDrift`, `setGlobalDepthDrift`, `setGlobalLfoDrift`) matches the actual shipped source exactly.
  - [ ] The doc doesn't claim this restructures a description that was already accurate — it should note plainly that it corrects a pre-existing drift in the doc itself (the "UI" paragraph), separate from the actual 4→2 group merge.

  **Verification:**
  - [ ] Manual review — every documented signature and file/line reference spot-checked directly against the final shipped code, not reconstructed from this plan or the spec from memory.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 6, Task 12 (documents the final shipped shape of both the engine and the UI).

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 13 tasks are met.
- [ ] `docs/AUDIO_SYSTEM.md` reflects the shipped API, including the corrected UI paragraph.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A `driftGroupForTarget` misclassification in Task 6 silently reintroduces a 3-vs-1 split (e.g. one former-`eq3` target still lands in a different bucket than a former-`filterLPF` target) | High — the one new failure mode specific to a *merge* (as opposed to 10.3's original *split*); nothing else in this phase would catch it | Task 6's acceptance criteria require the explicit merge-specific regression case (3 different former-group targets, one call, identical effect on all 3) — not just "drift still works," which could pass even with a latent misclassification |
| A stale test fixture elsewhere in the suite still constructs a flat or 4-group `lfoDrift`/`DriftGroupId` object literal via an `as any` cast, hiding it from `build:types` — the exact failure class 10.3's own plan flagged and that its own Task 7 actually hit | Medium — surfaces as a confusing runtime error deep in a try/catch rather than a clear type error | Run the full suite (`npm test`, not per-file) at every checkpoint, not just the files a task's own verification step names; the Store Integration checkpoint (Phase 4) explicitly calls for a project-wide `build:types` pass as its own milestone |
| `FleetDriftPanel`'s copy (`'SIGNAL CHAIN FLUX'` loreLabel, "Fleet Drift" label) is a first-pass placeholder with no reference grid, and "Fleet Drift" itself is already known to be provisional pending a separate label review | Low | Flagged in spec §7; the Phase 7 manual check is the place to confirm it reads clearly; not blocking, and explicitly not to be treated as final |
| Two independently-hand-maintained tables (`FleetParamsContent.tsx`'s `FLEET_PARAMS_GROUPS` and `navTreeConfig.ts`'s `NAV_TREE_SCHEMA`) could drift out of sync if Task 10 and Task 12 aren't both actually completed | Medium — a mismatch would show the new group in the nav tree but not in the content view, or vice versa | Both tasks are explicit, independently verified line items in this plan (Task 10, Task 12) rather than one task assumed to cover both; the Phase 7 checkpoint's manual check explicitly verifies both surfaces show "Fleet Drift" |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **Trait/color for Fleet Drift (`'spectral'`, matching EQ & Filters)** — Task 10's own default, not directly confirmed with Crawford. Confirm during the Phase 7 manual check.
2. **`'SIGNAL CHAIN FLUX'` (Task 7's loreLabel copy)** — same, confirm/adjust during the Phase 7 manual check.
3. **The internal id choices (`'globalFx'`, `'fleetDrift'`, `'globalDrift'`)** — none are user-facing; low-risk, but worth a quick nod during human review of this plan in case a different internal convention is preferred before Task 1 starts.
4. **The `FleetParamsContent.tsx`/`navTreeConfig.ts` hand-sync duplication (Risk table, row 4)** — pre-existing, explicitly out of scope for this phase; worth raising separately if a future phase wants to consolidate Fleet Params onto one shared table the way Probes/Companies already did (`ROBOT_SECTIONS_CONFIG`).
