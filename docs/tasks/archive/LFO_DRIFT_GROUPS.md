# Implementation Plan: Multi-Group LFO Drift (Roadmap Phase 10.3)

Source spec: [docs/specs/LFO_DRIFT_GROUPS.md](../specs/LFO_DRIFT_GROUPS.md). Source intent: [docs/intent/lfo-drift-groups.md](../intent/lfo-drift-groups.md). Restructures the shipped single-pool design from [docs/specs/LFO_DRIFT.md](../specs/LFO_DRIFT.md) (Roadmap 10.2, [docs/tasks/LFO_DRIFT.md](LFO_DRIFT.md)) — every task below modifies code that phase already shipped, not blank-slate additions.

## Overview

Replace the shipped single shared pool of 8 secondary oscillators and one global `rateDrift`/`depthDrift` pair with 4 independent drift groups — `eq3`, `filterLPF`, `filterHPF`, `robots` — each with its own dedicated oscillator pool (sized to that group's own real target ceiling: 3/2/2/8), its own independently-seeded `rateDrift`/`depthDrift` amount, and its own pair of sliders in the Audio Rig. Every mechanic 10.2 already built (bucket-hash assignment, bounded swing math, the Depth Drift silence guard, the `Signal.override` fix) is reused unchanged; this phase changes which pool a primary hashes into and which amount applies, not the underlying mechanism.

## Architecture Decisions

- **`types/lfo.ts`'s new `DriftGroupId` lands first, alone, before any other task.** It's the one genuinely new foundational concept this phase introduces — every other task (the type reshape, the seed tables, the engine restructuring, the UI schema) either imports it directly or depends transitively on something that does. Nothing about it depends on 10.2's own shipped shape, so there's no reason to sequence it after anything.
- **Seed plumbing (Tasks 2-4) lands next, mirroring 10.2's own Phase 1 split** — pure data/config work, independently testable against `DEFAULT_GLOBAL_AUDIO_SETTINGS`/determinism assertions, de-risked ahead of the trickier `lfoEngine.ts` restructuring.
- **The `lfoEngine.ts` restructuring splits into a structural task and a functional task, the same split 10.2's own Phase 2 used.** Task 5 introduces per-group pools, `driftGroupForTarget`, and threads a `group` through `DriftLink`/`attachDrift` — at the end of Task 5 every group's primaries correctly land in their own group's pool, but `refreshRateDriftGain`/`refreshDepthDriftGain` still read one shared (now-vestigial) amount, so drift is still audible but not yet independent per group. Task 6 replaces that shared amount with a per-group record and changes `setGlobalRateDrift`/`setGlobalDepthDrift`'s exported signatures — the point where groups actually become independent. Splitting this way means Task 5 alone is fully testable (pool sizing, bucket assignment, teardown) without needing the breaking signature change to exist yet.
- **UI schema work (Task 7) is independent of the engine and can run in parallel with Phase 2**, same as 10.2 — it only needs `DriftGroupId` (Task 1), nothing about the pool/amount mechanism.
- **`audioStore.ts` (Task 8) is the single integration point**, depending on both the data half (Task 2's reshaped type, Task 4's real seeding) and the engine half (Task 6's new 2-argument setters) — sequenced after both so it never has to stub or guess at either side's final shape, same reasoning 10.2's own Task 7 used.
- **Docs land last (Task 10)**, once the shipped API is real and spot-checkable against source — this is also the *first* time any drift design reaches `docs/AUDIO_SYSTEM.md` at all, since 10.2's own equivalent task was never executed (spec §1.5).

## Dependency Graph

```
Task 1 (types/lfo.ts: DriftGroupId + DRIFT_GROUP_IDS)
    │
    ├──→ Task 2 (types/globalAudio.ts: reshape lfoDrift)
    │         │
    │         ├──→ Task 4 (globalAudioSeed.ts: sample all 4 groups) ←── Task 3 (seed + loading range tables, no dep on Task 1/2)
    │         │              │
    │         │              └──────────────────────────────┐
    │         │                                              │
    ├──→ Task 5 (lfoEngine.ts: per-group pools + grouping)   │
    │         │                                               │
    │         └──→ Task 6 (lfoEngine.ts: per-group amounts + signature change)
    │                        │                                │
    ├──→ Task 7 (audioRigConfig.ts: LFO_DRIFT_GROUPS)         │
    │              │                                          │
    │              └──→ Task 9 (AudioRigDrawer.tsx) ←── Task 8 (audioStore.ts) ←┴──┘
    │                              │
    └──────────────────────────────┴──→ Task 10 (docs/AUDIO_SYSTEM.md) ←── Task 4
```

## Task List

### Phase 1: Foundation & seed plumbing

- [x] **Task 1: `types/lfo.ts` — add `DriftGroupId`**

  **Description:** Add the new `DriftGroupId` union (`'eq3' | 'filterLPF' | 'filterHPF' | 'robots'`) and `DRIFT_GROUP_IDS` array export, alongside the existing `RobotLfoTargetId`/`GlobalLfoTargetId`/`ROBOT_LFO_TARGET_IDS`/`GLOBAL_LFO_TARGET_IDS` pairing convention (spec §4). This is the one file 10.2's own spec explicitly named as untouched — confirm the doc comment explains why that reasoning doesn't carry over (spec §1.1).

  **Acceptance criteria:**
  - [x] `DriftGroupId` is exported with exactly the 4 documented members.
  - [x] `DRIFT_GROUP_IDS` is exported as a `readonly DriftGroupId[]` containing all 4, matching the type-plus-array-of-values pattern `ROBOT_LFO_TARGET_IDS` already establishes in this same file.
  - [x] No existing export in this file is renamed or removed.

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npx vitest run src/types/lfo.test.ts` (create if it doesn't already exist) passes, asserting `DRIFT_GROUP_IDS` has exactly the 4 members, no duplicates.

  **Dependencies:** None.

  **Files:** `src/types/lfo.ts`, `src/types/lfo.test.ts`

  **Estimated scope:** XS (one new type + one new const array)

- [x] **Task 2: `types/globalAudio.ts` — reshape `lfoDrift`**

  **Description:** Change `GlobalAudioSettings.lfoDrift` from 10.2's flat `{ rateDrift: number; depthDrift: number }` to `Record<DriftGroupId, { rateDrift: number; depthDrift: number }>`; `DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift` gains all 4 group entries, each `{ rateDrift: 0, depthDrift: 0 }` (spec §4).

  **Acceptance criteria:**
  - [x] `GlobalAudioSettings.lfoDrift` is keyed by all 4 `DriftGroupId` members, each with both fields typed `number`.
  - [x] `DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift` has all 4 groups, each `{ rateDrift: 0, depthDrift: 0 }`.
  - [x] Every other consumer of `GlobalAudioSettings`/`DEFAULT_GLOBAL_AUDIO_SETTINGS` that constructs an object literal (not a spread of the default) is updated or still compiles — `npm run build:types` is what actually surfaces these (10.2's own Task 1 found three such call sites: `audioStore.ts`'s `EffectKey` exclude, `globalAudioSeed.ts`'s return object, and a stale `as any`-cast test fixture in `AudioEngine.test.ts` — check that last one specifically, since `as any` hides the mismatch from the type checker).

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npx vitest run src/types/globalAudio.test.ts` passes, updated for the new nested shape (the existing "has a lfoDrift field defaulting to zero drift" test becomes 4 assertions, one per group, or one loop over `DRIFT_GROUP_IDS`).

  **Dependencies:** Task 1.

  **Files:** `src/types/globalAudio.ts`, `src/types/globalAudio.test.ts`

  **Estimated scope:** S (1 file — but expect knock-on compile fixes in 2-3 other files, same pattern as 10.2's own Task 1)

- [x] **Task 3: Seed range + loading range tables — 2 keys become 8**

  **Description:** Extend `GlobalAudioSeedFieldKey` from 10.2's 2 `'lfoDrift.rateDrift'`/`'lfoDrift.depthDrift'` keys to 8 (`'lfoDrift.<group>.rateDrift'`/`'lfoDrift.<group>.depthDrift'` × 4 groups) — a 3-level dotted path, extending the existing `effect.field` convention by one level (spec §4). `GLOBAL_AUDIO_SEED_RANGES` gains all 8 at the same `{ min: -1, max: 1, scale: 'linear' }` 10.2 already used; `GLOBAL_AUDIO_LOADING_RANGES` gains all 8 at the same `-0.4..0.4` first-pass window 10.2 already used per field (spec §7 — still not `GLOBAL_CHAIN_GRID.md`-sourced, now flagged again for the same reason, multiplied across 4 groups).

  **Acceptance criteria:**
  - [x] `GlobalAudioSeedFieldKey` includes all 8 new keys; 10.2's 2 old flat keys are gone (not left dangling alongside the new ones).
  - [x] `GLOBAL_AUDIO_SEED_RANGES` has all 8 new keys at the full `-1..1` bipolar range.
  - [x] `GLOBAL_AUDIO_LOADING_RANGES` has all 8 new keys at a narrower sub-window inside `-1..1`.
  - [x] Both `Record<GlobalAudioSeedFieldKey, ...>` tables still type-check as exhaustive (TypeScript enforces this once the union changes — a missing entry in either table is a compile error).

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npx vitest run src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts` pass, with the closed-set key-coverage assertions extended from 2 to 8 entries.

  **Dependencies:** None (does not require Task 1/2 — `GlobalAudioSeedFieldKey` is its own string-literal union, not derived from `DriftGroupId` or `GlobalAudioSettings`'s keys, same independence 10.2's own Task 2 had).

  **Files:** `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioSeedRanges.test.ts`, `src/data/globalAudioLoadingRanges.ts`, `src/data/globalAudioLoadingRanges.test.ts`

  **Estimated scope:** S (2 files + tests, table entries only — 4x the row count, same shape)

- [x] **Task 4: `globalAudioSeed.ts` — sample all 4 groups**

  **Description:** In `generateGlobalAudioSettings`, replace the flat `lfoDrift: { rateDrift: sampleField(...), depthDrift: sampleField(...) }` block with one sub-object per group, each sampling its own `rateDrift`/`depthDrift` independently via the existing `sampleField()` helper, unchanged (spec §4).

  **Acceptance criteria:**
  - [x] `generateGlobalAudioSettings(planetId, planetName)`'s return value includes a fully-populated `lfoDrift` for all 4 groups.
  - [x] Same `(planetId, planetName)` input always produces identical `lfoDrift` output for every group (determinism).
  - [x] Different planet names produce different `lfoDrift` values, and different *groups* on the same planet don't share a draw (non-degenerate both ways — the second check is new relative to 10.2, since 10.2 only had one group to compare fields within).
  - [x] All 8 sampled values fall within Task 3's loading range on every call.

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts` passes, including determinism/non-degeneracy/bounds assertions re-run per group, plus the new cross-group independence assertion.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2, Task 3.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** S (one reshaped block in an existing function)

### Checkpoint: Foundation & seed plumbing
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `generateGlobalAudioSettings` for two different planet names produces two different, in-range `lfoDrift` records, and within one planet's result no two groups share a draw.
- [ ] Review with human before proceeding.

---

### Phase 2: Drift engine restructuring

- [x] **Task 5: `lfoEngine.ts` — per-group pools and grouping (structural)**

  **Description:** Add `driftGroupForTarget` (prefix-matches `eq3.`/`lpf.`/`hpf.`, falls through to `'robots'` for everything else — spec §4), change `DRIFT_POOL_SIZE` from 10.2's single constant `8` to a per-group `Record<DriftGroupId, number>` (`eq3: 3, filterLPF: 2, filterHPF: 2, robots: 8`), change the pool state from one `Tone.LFO[] | null` to `Partial<Record<DriftGroupId, Tone.LFO[]>>`, and thread a `group: DriftGroupId` parameter through `getOrCreateDriftPool`/`attachDrift`. `DriftLink` gains a `group` field, set once at `attachDrift` time from the target the link was created for. Both of `connectLfoTarget`'s existing `attachDrift(key, lfo)` call sites become `attachDrift(key, lfo, driftGroupForTarget(target))`. `refreshRateDriftGain`/`refreshDepthDriftGain` are **not yet** changed to read a per-group amount in this task — they keep reading 10.2's shared module-scope `globalRateDrift`/`globalDepthDrift` for now, so drift stays audible (just not yet independent per group) through this task's own checkpoint.

  **Acceptance criteria:**
  - [x] `driftGroupForTarget` classifies every `GlobalLfoTargetId` correctly (`eq3.*` → `eq3`, `lpf.*` → `filterLPF`, `hpf.*` → `filterHPF`) and every `RobotLfoTargetId` as `'robots'`, regardless of field or robotId.
  - [x] Connecting an `eq3.*` target never constructs more than 3 pool oscillators for the `eq3` group; `filterLPF`/`filterHPF` never exceed 2 each; `robots` never exceeds 8 — regardless of how many targets in *other* groups have connected.
  - [x] A group's pool is not constructed until that group's own first successful `connectLfoTarget` call (connecting an EQ3 target does not construct the `filterLPF`/`filterHPF`/`robots` pools).
  - [x] `DriftLink.group` is set correctly at attach time and never reassigned afterward.
  - [x] Every existing (10.2-authored) `lfoEngine.test.ts` pool/lifecycle test still passes, updated only where it asserted the old flat `DRIFT_POOL_SIZE`/single-pool shape — not where it asserted primary-to-target connection behavior, which this task does not touch.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` passes, including new coverage for per-group pool sizing (each of the 4 groups independently), `driftGroupForTarget`'s classification for a representative target from each group, and lazy per-group construction.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** M (restructures existing state/functions in one file, no public API change yet)

- [x] **Task 6: `lfoEngine.ts` — per-group amounts and setter signature change (functional)**

  **Description:** Replace the shared `globalRateDrift`/`globalDepthDrift` module-scope variables with `globalRateDriftByGroup`/`globalDepthDriftByGroup` records (both `Record<DriftGroupId, number>`, all starting at 0). Change `refreshRateDriftGain`/`refreshDepthDriftGain` to read `[link.group]` off those records instead of the old shared variables. Change the exported `setGlobalRateDrift`/`setGlobalDepthDrift` signatures from 10.2's `(value: number)` to `(group: DriftGroupId, value: number)`, each only refreshing links whose own `link.group` matches the group being set — this is the point where the 4 groups actually become independently controllable, and an intentional breaking change to `lfoEngine`'s public API.

  **Acceptance criteria:**
  - [x] `setGlobalRateDrift('eq3', 1)` changes only `eq3`-group primaries' rate-drift Gain values — every other group's Gains are untouched, even if those other groups have primaries connected and a nonzero amount already set.
  - [x] Same isolation guarantee for `setGlobalDepthDrift`, in both directions (setting a group's depth drift doesn't touch another group's, and doesn't disturb another group's silence-guard state).
  - [x] `setGlobalRateDrift`/`setGlobalDepthDrift` are safe no-ops for a group with zero primaries connected, even while other groups have primaries connected and nonzero amounts.
  - [x] The full Depth Drift silence guard (disconnect at depth 0, reconnect above 0, correct amount picked up on reconnect) still holds per group — re-verified per group, not just once globally as 10.2's own tests did.
  - [x] `setLfoRate`/`setLfoDepth` on a target with no drift link yet still don't throw and don't create a phantom link (unchanged from 10.2, re-run to confirm the refactor didn't disturb it).

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` passes, including the **cross-group isolation matrix** (spec §7's flagged highest-risk item): for at least 2 distinct groups, prove setting one's amount never moves the other's Gain values, in both the rate and depth directions.
  - [x] `npm run build:types` — this is what surfaces every remaining 1-argument `setGlobalRateDrift`/`setGlobalDepthDrift` call site outside this file (there will be at least one, in `audioStore.ts`, until Task 8 lands — expected and fine at this checkpoint).
  - [x] `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** M (the highest-risk task in this plan — cross-group isolation is the one new failure mode this whole phase introduces, per spec §7)

### Checkpoint: Drift engine core
- [x] `npm run build:types` will show `audioStore.ts` failing to compile against the new 2-argument setters — expected until Task 8; confirm the *only* remaining `build:types` errors are in `audioStore.ts`/its test, nothing else.
- [x] `npm run lint`, and `npx vitest run src/engine/lfoEngine.test.ts` (in isolation — the full suite won't pass yet) all clean.
- [x] A test-level check confirms: connect one primary in `eq3` and one in `robots`; `setGlobalRateDrift('eq3', 1)` leaves the `robots` primary's rate-drift Gain at its pre-call value.
- [ ] Review with human before proceeding.

---

### Phase 3: UI schema (parallelizable with Phase 2)

- [x] **Task 7: `audioRigConfig.ts` — `LFO_DRIFT_GROUPS`**

  **Description:** Replace 10.2's three standalone exports (`LFO_DRIFT_ACCORDION`, `LFO_RATE_DRIFT_SCHEMA`, `LFO_DEPTH_DRIFT_SCHEMA`) with one `LFO_DRIFT_GROUPS: LfoDriftGroupSchema[]` array of 4 entries — one per `DriftGroupId` — each holding its own accordion schema and its own rate/depth `SliderCenteredZeroSchema` pair (both still `-100..100`, unit `'%'`), built via a small `driftGroupSchema(group, loreLabel, humanLabel)` helper mirroring this file's existing `accordionSchema`/`enabledSchema` helper pattern (spec §4). Still NOT part of `AUDIO_RIG_CONFIG`'s own array — no `DriftGroupId` value matches an `AudioRigEffectKey`.

  **Acceptance criteria:**
  - [x] `LFO_DRIFT_GROUPS` has exactly 4 entries, one per `DriftGroupId`, in a stable order.
  - [x] Each entry's accordion is a valid `AccordionSchema`; each entry's `rateSchema`/`depthSchema` are both `sliderCenteredZero` with `min: -100, max: 100, unit: '%'`.
  - [x] Every id across all 4 entries' schemas (4 accordions + 8 sliders = 12 ids) is unique.
  - [x] None of `LFO_DRIFT_GROUPS`' entries are added to `AUDIO_RIG_CONFIG`'s own array.

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts` passes, including new assertions on `LFO_DRIFT_GROUPS`' shape/bounds/id-uniqueness; `AUDIO_RIG_CONFIG`'s own existing closed-set coverage assertion is unaffected.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** S (one array of 4 small objects, replacing 3 existing consts)

### Checkpoint: UI schema
- [x] `npm run build:types`, `npm run lint`, `npx vitest run src/data/audioRigConfig.test.ts` clean.
- [ ] Review with human before proceeding (can happen in parallel with the Phase 2 checkpoint).

---

### Phase 4: Store and drawer wiring

- [x] **Task 8: `audioStore.ts` — group-aware wiring**

  **Description:** Change `setGlobalLfoDrift`'s signature from 10.2's `(partial: Partial<GlobalAudioSettings['lfoDrift']>)` to `(group: DriftGroupId, partial: Partial<GlobalAudioSettings['lfoDrift'][DriftGroupId]>)` — updates only that group's stored values, calls only that group's matching `lfoEngine` setter(s) for the field(s) actually provided. Change `applyGlobalAudioToEngine`'s two hardcoded `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift` calls into a loop over `DRIFT_GROUP_IDS`, each pushing that group's own current values.

  **Acceptance criteria:**
  - [x] `setGlobalLfoDrift('eq3', { rateDrift: x })` updates only `globalAudio.lfoDrift.eq3.rateDrift` in the store and calls `lfoEngine.setGlobalRateDrift('eq3', x)` — no other group's stored value or matching engine setter is touched.
  - [x] Passing only one field for a group leaves that group's other field, and every other group entirely, untouched.
  - [x] `applyGlobalAudioToEngine(globalAudio)` calls both `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift` for all 4 groups, each with that group's own current `globalAudio.lfoDrift[group]` values.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` passes, including per-group coverage for `setGlobalLfoDrift` (repeated or parameterized across all 4 groups, each asserting cross-group non-interference) and `applyGlobalAudioToEngine`'s new 4-group loop (spy on `lfoEngine`).
  - [x] `npm run build:types` clean — this should now be the point where the last remaining 1-argument `setGlobalRateDrift`/`setGlobalDepthDrift` call site from the Phase 2 checkpoint disappears.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 2, Task 4, Task 6.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (one action signature change + one loop, same shape as 10.2's own Task 7)

- [x] **Task 9: `AudioRigDrawer.tsx` — render 4 Drift accordions**

  **Description:** Replace 10.2's single hardcoded Drift accordion block with `LFO_DRIFT_GROUPS.map(...)`, sibling to the existing `AUDIO_RIG_CONFIG.map(...)` block, mirroring that same map's own shape (spec §4). Each rendered group reads `globalAudio.lfoDrift[driftGroup.group]` and calls `setGlobalLfoDrift(driftGroup.group, { rateDrift: v / 100 })`/`{ depthDrift: v / 100 }` on change. All 8 sliders (4 groups × 2) disabled under `rigDisabled`, same as every other block.

  **Acceptance criteria:**
  - [x] All 4 Drift accordions render, each with its own Rate Drift / Depth Drift slider pair, showing that group's own `globalAudio.lfoDrift[group]` values as a `-100..100` percent.
  - [x] Dragging any one group's slider calls `setGlobalLfoDrift` with that group's id and the dragged value divided by 100 — and does not change any other group's stored value.
  - [x] All 8 sliders are `disabled` when `globalAudio.globalBypass` is `true`.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes, including coverage for all 4 accordions' presence/value-display, per-group `onChange` → `setGlobalLfoDrift` wiring with the `/100` conversion and cross-group non-interference asserted explicitly, and the `rigDisabled` case across all 8 sliders.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, open the Audio Rig, confirm 4 Drift accordions (EQ, Low-Pass, High-Pass, Robot) each with their own Rate Drift / Depth Drift sliders that move and persist independently.

  **Dependencies:** Task 7, Task 8.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (one hardcoded block replaced by a map over an existing pattern)

### Checkpoint: Feature complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual/audible check (spec §5): a freshly-seeded planet's 4 Drift accordions each start at their own nonzero-but-modest position, not all four reading the same number; raising only the `robots` group's Depth Drift on an already-audible robot LFO makes its modulation audibly wander while any active EQ/LPF/HPF-group LFOs sound unaffected; a target whose own Depth is `0` stays silent regardless of its group's Depth Drift.
- [ ] Review with human before proceeding.

---

### Phase 5: Docs

- [x] **Task 10: `docs/AUDIO_SYSTEM.md` — document the multi-group design**

  **Description:** Extend the "LFO Modulation" section with the per-group signal graph (4 independent pools sized 3/2/2/8 → per-primary Gain attenuators → each active primary's `frequency`/`amplitude`, keyed by `driftGroupForTarget`), the per-group swing math and silence guard (unchanged mechanism, now re-scoped), and the new `setGlobalRateDrift(group, value)`/`setGlobalDepthDrift(group, value)`/`setGlobalLfoDrift(group, partial)` API — spot-checked against the shipped source, not reconstructed from memory. This is the *first* time any drift design reaches this doc — 10.2's own equivalent task was never executed (spec §1.5), so there is no single-pool description to first correct.

  **Acceptance criteria:**
  - [x] The 4-group signal graph, per-group swing math, and silence guard are documented in prose.
  - [x] Every documented function signature (`setGlobalRateDrift`, `setGlobalDepthDrift`, `setGlobalLfoDrift`, `driftGroupForTarget`) matches the actual shipped source exactly.
  - [x] The doc states plainly that this supersedes no prior written description (since none existed) — not framed as an update to text that never shipped.

  **Verification:**
  - [x] Manual review — every documented signature spot-checked directly against `lfoEngine.ts`/`audioStore.ts`'s final shipped code.
  - [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 4, Task 9 (documents the final shipped shape of both halves).

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 10 tasks are met.
- [x] `docs/AUDIO_SYSTEM.md` reflects the shipped API.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Cross-group isolation bug (a `link.group` lookup error or a `driftGroupForTarget` misclassification silently leaks one group's drift into another) | High — the single new failure mode this whole phase introduces; 10.2 had exactly one amount, so this couldn't happen before | Task 6's acceptance criteria and verification both require an explicit cross-group isolation matrix, not just "drift works"; the Phase 2 checkpoint has its own dedicated isolation check before proceeding |
| `GLOBAL_AUDIO_LOADING_RANGES`'s `-0.4..0.4` window, now independently rolled 4x per planet instead of once, compounds into something that reads as too busy | Low-medium — could ship sounding overwhelming even though each individual group's window is unchanged from 10.2 | Flagged explicitly in spec §7; the Phase 4 manual/audible check is the place to catch and adjust it before merge |
| `LFO_DRIFT_GROUPS`' 4 sets of `loreLabel`/`humanLabel` copy are a first-pass default with no reference grid to source from | Low | Flagged in spec §7; confirm the 4 labels read as clearly distinct during the Phase 4 manual check |
| Total oscillator count rises from 10.2's flat 8 to 15 | Low — still a fixed constant, still far below the "70-100+ primaries" cost concern that motivated pooling at all | Not re-litigated; noted only for continuity with 10.2's own cost reasoning (spec §7) |
| A stale test fixture elsewhere in the suite still constructs a flat (non-grouped) `lfoDrift` object literal via an `as any` cast, hiding it from `build:types` (the exact failure class 10.2's own Task 7 hit with `AudioEngine.test.ts`'s `FIXTURE_GLOBAL_AUDIO`) | Medium — would surface as a runtime `TypeError` deep in a try/catch, producing a confusing wrong-value test failure rather than a clear error | Run the full suite (`npm test`, not per-file) at every checkpoint, not just the files a task's own verification step names — this is exactly how 10.2's own equivalent issue was caught |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **`LFO_DRIFT_GROUPS`' exact label copy** (Task 7) — confirm or adjust during the Phase 4 manual check, not before.
2. **The `-0.4..0.4` loading window per group** (Task 3) — same, confirm during the Phase 4 manual/audible check.
3. **Whether 15 total oscillators (vs. 10.2's 8) is worth revisiting later** if a future phase adds more groups — not a concern for this phase, noted for continuity only.
