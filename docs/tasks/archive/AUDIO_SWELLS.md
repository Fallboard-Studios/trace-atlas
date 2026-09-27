# Implementation Plan: Seeded Audio Swells

Source spec: [docs/specs/AUDIO_SWELLS.md](../specs/AUDIO_SWELLS.md). Source intent: [docs/intent/audio-swells.md](../intent/audio-swells.md). Not yet slotted into [docs/todo/roadmap.md](../todo/roadmap.md) — this plan proposes an out-of-sequence entry (e.g. `## 10.5`, following the `10.1`–`10.4` precedent, matching [docs/tasks/LFO_DRIFT_GROUPS.md](LFO_DRIFT_GROUPS.md)'s own `10.3`), not decided here (spec §7 item 4).

## Overview

Build a wholly new, from-scratch mechanism — no `Tone.LFO`, no `lfoEngine.ts` dependency — that periodically and deterministically ramps one eligible parameter up, then back down to exactly its pre-swell value, via the same store/engine write path a human dragging that parameter's slider would use. Two independent pools (global effects, robot attributes), each with its own 9- or 17-attribute eligible set and its own 5-concurrent-swell cap; a small chance turns a robot-pool pick into a company-wide swell hitting several robots at once, in lock-step. Everything — trigger, target selection, direction, magnitude, duration — is a seeded `getSeededVal` draw against the Attenuation Style noise map, ticked via `BeatClock`'s measure subscription. No new UI.

## Architecture Decisions

- **Types (Task 1) land first, alone.** `SwellGlobalTargetId`/`SwellRobotAttributeId`/`ActiveSwell`/`SwellMember` are the one genuinely new vocabulary this feature introduces; every other task imports from this file directly or transitively.
- **The robot-only range table (Task 2) follows immediately** — pure data, independently testable, and a hard prerequisite for the robot pool (Task 4) later. Not needed by the global pool (Task 3), which reuses the existing `GLOBAL_AUDIO_SEED_RANGES` — but sequenced right after Task 1 anyway since it's equally low-risk foundation work, same "de-risk data before engine logic" reasoning `LFO_DRIFT_GROUPS.md`'s own Phase 1 used.
- **The global pool (Task 3) is built as the first complete, independently-testable vertical slice — before the robot pool, not alongside it.** It's the simpler half (one target per swell, no per-robot iteration, no company concept), and it's where the mechanism's genuinely shared pieces get built once: the lifecycle scaffold (`startAudioSwells`/`stopAudioSwells`/`tickAudioSwells`, the `activeSwells` Map), and the new attribute-agnostic direction+magnitude helper (§1.5) that every later task reuses unchanged. Proving this slice end-to-end (trigger → select → ramp → write → exact return-to-base → disabled-effect eligibility) before adding robot/company complexity on top follows the same fail-fast, foundation-first ordering `LFO_DRIFT_GROUPS.md`'s Phase 1→2 split used.
- **The robot pool, single-robot swells only (Task 4), comes next.** The delta from Task 3 is almost entirely "which range table, which write function (`apply*` instead of `setGlobalAudio`), which extra clamp (Volume's floor)" — the direction/magnitude helper and the two-phase ramp/advance logic built in Task 3 are reused, not reinvented.
- **The company-wide variant (Task 5) is deliberately last and depends on Task 4, not just Task 1.** It's the one genuinely novel piece of architecture in this feature — `ActiveSwell.members`, shared timing composed from N independently-based robots, a `Company` lookup — and composing multiple robots' worth of swell state is far lower-risk once a single robot's own direction/magnitude/write path is already proven correct in isolation.
- **`worldTransition.ts` wiring (Task 6) is the single integration point, sequenced after the whole mechanism (Tasks 3–5) is complete** — one wiring change touching `initializeLocale` once, rather than revisiting it as each pool lands. Mirrors how `robotSystems.ts`'s own lifecycle was wired into `initializeLocale` only once, after that module itself was complete.
- **Docs (Task 7) land last**, spot-checked against the final shipped source — same reasoning and same ordering `LFO_DRIFT_GROUPS.md`'s own Task 10 used.

## Dependency Graph

```
Task 1 (types/audioSwell.ts: vocabulary + ActiveSwell/SwellMember)
    │
    ├──→ Task 2 (data/audioSwellRanges.ts: ROBOT_SWELL_FIELD_RANGE)
    │              │
    ├──→ Task 3 (systems/audioSwells.ts: shared helper + lifecycle scaffold + global pool)
    │              │
    │              └──→ Task 4 (systems/audioSwells.ts: robot pool, single-robot) ←── Task 2
    │                             │
    │                             └──→ Task 5 (systems/audioSwells.ts: company-wide variant)
    │                                            │
    │                                            └──→ Task 6 (systems/worldTransition.ts wiring)
    │                                                           │
    └──────────────────────────────────────────────────────────┴──→ Task 7 (docs/AUDIO_SYSTEM.md)
```

## Task List

### Phase 1: Foundation — types & data

- [ ] **Task 1: `types/audioSwell.ts` — target vocabulary & runtime state shape**

  **Description:** New file. `SwellGlobalTargetId` (`GlobalLfoTargetId | 'delay.wet' | 'reverb.wet'`) + `SWELL_GLOBAL_TARGET_IDS` (9 entries); `SwellRobotAttributeId` (`RobotLfoTargetId | 'adsr.attack' | 'adsr.decay' | 'adsr.sustain' | 'adsr.release'`) + `SWELL_ROBOT_ATTRIBUTE_IDS` (17 entries, `layerN.phase` included — spec §1.3); `SwellPool` (`'global' | 'robot'`); `SwellPhase` (`'rising' | 'falling'` — **two values only, no `'holding'`**, spec §1.5); `SwellMember` (`robotId`, `baseValue`, `peakDelta`); `ActiveSwell` (pool, `globalTarget?`, `baseValue?`/`peakDelta?` for pool `'global'`, `robotAttribute?`/`members?`/`companyId?` for pool `'robot'`, `phase`, `startMeasure`, `risingMeasures`, `fallingMeasures`) — spec §1.2, §4.

  **Acceptance criteria:**
  - [ ] `SWELL_GLOBAL_TARGET_IDS` has exactly 9 entries matching `GLOBAL_LFO_TARGET_IDS`' 7 plus `'delay.wet'`/`'reverb.wet'`.
  - [ ] `SWELL_ROBOT_ATTRIBUTE_IDS` has exactly 17 entries matching `ROBOT_LFO_TARGET_IDS`' 13 plus the 4 `adsr.*` fields.
  - [ ] `SwellPhase` is a 2-member union; nothing in this file references a hold/plateau concept.
  - [ ] `ActiveSwell` type-checks for both a single-robot swell (`members` with 1 entry) and a company-wide swell (`members` with 2+ entries) without any additional type needed.
  - [ ] No existing export from `types/lfo.ts` is modified.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npx vitest run src/types/audioSwell.test.ts` (new) passes: both ID arrays have the exact documented membership, no duplicates; a source-scan assertion confirms `'holding'` does not appear as a `SwellPhase` member.

  **Dependencies:** None.

  **Files:** `src/types/audioSwell.ts`, `src/types/audioSwell.test.ts`

  **Estimated scope:** S (pure types, one new file)

- [ ] **Task 2: `data/audioSwellRanges.ts` — `ROBOT_SWELL_FIELD_RANGE`**

  **Description:** New file. `ROBOT_SWELL_FIELD_RANGE: Record<SwellRobotAttributeId, {min, max}>` — all 17 `SwellRobotAttributeId` keys (exhaustive `Record`, TypeScript-enforced), matching each field's real UI/store-facing schema range exactly, **not** `lfoEngine.ts`'s engine-internal `ROBOT_LFO_FIELD_RANGE` (`volume` differs: `{0,1}` here vs. `{0,2}` there — spec §4.1). Shares zero keys with `GLOBAL_AUDIO_SEED_RANGES`, a separate global-chain-only table.

  **Acceptance criteria:**
  - [ ] `ROBOT_SWELL_FIELD_RANGE` has exactly the 17 `SWELL_ROBOT_ATTRIBUTE_IDS` keys, each `min < max`.
  - [ ] `volume`'s range is `{min: 0, max: 1}`, explicitly asserted distinct from `lfoEngine.ts`'s `ROBOT_LFO_FIELD_RANGE.volume` (`{0, 2}`).
  - [ ] The `Record<SwellRobotAttributeId, ...>` type-checks as exhaustive (a missing key is a compile error, not just a test failure).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npx vitest run src/data/audioSwellRanges.test.ts` (new) passes per spec §5's bullet, using the corrected 17-key expectation.

  **Dependencies:** Task 1.

  **Files:** `src/data/audioSwellRanges.ts`, `src/data/audioSwellRanges.test.ts`

  **Estimated scope:** S (one data table)

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] Review with human before proceeding.

---

### Phase 2: Global pool (first complete vertical slice)

- [ ] **Task 3: `systems/audioSwells.ts` — shared helper, lifecycle scaffold, global pool**

  **Description:** New file, mirroring `robotSystems.ts`'s lifecycle shape (spec §4). This task delivers: (a) `startAudioSwells(localeId)`/`stopAudioSwells()`/`tickAudioSwells(localeId, measure)`, subscribed via `subscribeToMeasure`, ticked with the **unwrapped** `getCurrentMeasure()` (spec §1.4 — the same wrap trap `robotSystems.ts`'s own `startRobotLifecycle` comment documents); (b) the module-scope `activeSwells` Map; (c) the new, from-scratch direction+magnitude helper (§1.5) — given a field's `{min,max}` and current value, pick a direction that covers ≥50% of the range and draw a peak via `getSeededVal` between that 50% floor and the true edge — explicitly **not** `centeredSwingFromRange` (wrong shape: symmetric/bounded, no directionality or minimum-swing guarantee); (d) `maybeStartSwell('global', ...)`: seeded trigger draw against `SWELL_TRIGGER_CHANCE`, under the 5-cap, excluding disabled/bypassed effects' targets and anything already in `activeSwells`, duration drawn from `MIX_SWELL_DURATION_RANGE` (6–12 measures) for `delay.wet`/`reverb.wet` and `DEFAULT_SWELL_DURATION_RANGE` (3–6) for the other 7, 1-measure floor on every phase; (e) `advanceActiveSwells` for pool `'global'`: recomputes each in-flight swell's interpolated value from elapsed measures within its current phase and writes it via `useAudioStore.getState().setGlobalAudio(...)`, removing the swell and restoring exactly `baseValue` once `fallingMeasures` completes; (f) the disabled-mid-swell cancellation: an effect flipping to `enabled: false` while one of its params is mid-swell cancels that swell immediately, snapping the param back to its captured `baseValue` on the same tick. The robot pool is **not** wired in yet — `tickAudioSwells` calls `maybeStartSwell('global', ...)` only; Task 4 adds the `'robot'` call.

  **Acceptance criteria:**
  - [ ] `startAudioSwells`/`stopAudioSwells` are idempotent (mirrors `startRobotLifecycle`'s own guard test); `stopAudioSwells` clears `activeSwells` fully.
  - [ ] A global swell's direction/peak satisfy §1.5's rule: a field at 33% of range swells up landing in `[83%, 100%]`; a field at 70% swells down landing in `[0%, 20%]`; a field at 50% can land either direction.
  - [ ] `delay.wet`/`reverb.wet` swells draw `risingMeasures`/`fallingMeasures` independently from `[6, 12]`; every other global target draws independently from `[3, 6]`; no phase for any target is ever below 1 measure.
  - [ ] A disabled effect's targets are never picked for a new swell; an effect disabled while mid-swell has that swell cancelled and its param snapped to `baseValue` on the very next tick.
  - [ ] Once `fallingMeasures` completes, the live field value equals the swell's own `baseValue` exactly, and the swell is removed from `activeSwells`.
  - [ ] The global pool's 5-cap is enforced; a 6th global swell doesn't start while 5 are active.
  - [ ] Every global write goes through `useAudioStore.getState().setGlobalAudio`, never `AudioEngine.setGlobal*` directly.
  - [ ] Two calls with identical `localeId`/measure/AS-seed produce identical trigger/target/direction/duration/peak decisions; a source-scan confirms no `Math.random()` anywhere in the file.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` (new) passes, covering every criterion above for the global pool only.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (new file — lifecycle scaffold + new direction/magnitude helper + one full pool's trigger/select/advance/write logic)

### Checkpoint: Global pool complete
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/systems/audioSwells.test.ts` clean.
- [ ] A test-level check confirms a full global swell lifecycle (trigger → rising → falling → exact return-to-base → removal) end-to-end.
- [ ] Review with human before proceeding.

---

### Phase 3: Robot pool — single-robot swells

- [ ] **Task 4: `systems/audioSwells.ts` — robot pool, single-robot**

  **Description:** Extend the same file (spec §1.5, §3). `tickAudioSwells` now also calls `maybeStartSwell('robot', ...)`. Single-robot path: pick one (robot, `SwellRobotAttributeId`) pair from the 17×12 pool via seeded draws, excluding anything already `activeSwells`-mapped and anything failing the **parent-toggle eligibility rule** (`layerN.*` requires that `OscillatorLayer.active === true`; `volume`/ADSR fields have no such parent and are always eligible) — Ping Controls fields are never in `SWELL_ROBOT_ATTRIBUTE_IDS` to begin with, so no separate exclusion logic is needed for them. Direction/magnitude reuses Task 3's shared helper against `ROBOT_SWELL_FIELD_RANGE`, **except** `'volume'` gets an extra clamp: a downward swell's peak is clamped to never go below `VOLUME_SWELL_DOWNWARD_FLOOR` (0.5) — a pure post-hoc clamp on the final peak, not a gate on direction-picking. Duration always draws from `DEFAULT_SWELL_DURATION_RANGE` (3–6 measures; robot attributes have no mix-style exception). Writes go through the matching `apply*` (`applyVolume`, `applyLayersContinuous`, `applyAdsr`) from `robotOptionsActions.ts`, never a bespoke `updateRobot`/`AudioEngine.updateVoice*` call. `advanceActiveSwells` is extended to handle pool `'robot'`, iterating each swell's (single-entry, for this task) `members` array. The 5-cap for this pool counts (robot, attribute) pairs across the whole 12-robot roster, never per-robot.

  **Acceptance criteria:**
  - [ ] A robot swell's direction/magnitude follow the same §1.5 rule as the global pool (verified against `ROBOT_SWELL_FIELD_RANGE`, not `GLOBAL_AUDIO_SEED_RANGES`).
  - [ ] A `'volume'` swell picked to go downward never lands below 50% of volume's own range, even where the unclamped rule would allow lower; an upward `'volume'` swell is unaffected by the clamp.
  - [ ] `layerN.gain`/`detune`/`phase`/`pulseWidth` are never picked for a robot whose corresponding `OscillatorLayer.active` is `false`.
  - [ ] `layerN.phase` is a reachable robot swell target (regression guard confirming the pool wasn't built by silently reusing `ROBOT_LFO_TARGET_IDS`'s own exclusions — spec §1.3).
  - [ ] A robot swell tick calls the matching `apply*` (spied), never `updateRobot`/`AudioEngine.updateVoice*` directly.
  - [ ] The robot pool's 5-cap counts (robot, attribute) pairs across all 12 robots combined; with 5 active swells spread across 3 robots, a 6th doesn't start regardless of which robot/attribute it would target.
  - [ ] Once `fallingMeasures` completes, the member's live field value equals its own `baseValue` exactly, and the swell is removed from `activeSwells`.
  - [ ] Determinism and zero-`Math.random()` hold for the robot path too (extends Task 3's existing assertions).

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes, extended with robot-pool coverage for every criterion above.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2, Task 3.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (extends the existing file with a second pool's selection/eligibility/write logic, reusing Task 3's shared helper)

### Checkpoint: Robot pool (single-robot) complete
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/systems/audioSwells.test.ts` clean.
- [ ] A test-level check confirms a full single-robot swell lifecycle end-to-end, including the Volume clamp and a layer-inactive exclusion.
- [ ] Review with human before proceeding.

---

### Phase 4: Company-wide swell variant

- [ ] **Task 5: `systems/audioSwells.ts` — company-wide swells**

  **Description:** Extend the robot-pool path (spec §1.5). When the robot pool's trigger draw succeeds, a second seeded draw against `SWELL_COMPANY_CHANCE` decides single-robot (Task 4's existing path, unchanged) vs. company-wide. Company-wide: seeded picks of one `Company` (`useLocaleStore.getState().getLocaleById(localeId)?.companies`) and one `SwellRobotAttributeId`; filter `company.robotIds` down to those passing Task 4's same parent-toggle eligibility check for that attribute — if zero remain, **no swell starts this tick** (no re-roll, no fallback company/attribute); direction and `risingMeasures`/`fallingMeasures` are drawn **once**, shared across every member; each eligible robot gets its own `SwellMember` with its own `baseValue`/`peakDelta`, computed independently via Task 3's shared direction/magnitude helper (same shared direction, own current value, own edge/clamp) — a robot with less room simply interpolates at a smaller total distance over the same shared `[risingMeasures, fallingMeasures]`, which is what produces the "slower rate" feel with no separate rate concept to implement. The resulting `ActiveSwell` is stored once in `activeSwells` (under multiple keys, one per member, per Task 3's Map doc-comment convention) and counts as **exactly one** swell against the robot pool's 5-cap regardless of member count.

  **Acceptance criteria:**
  - [ ] Forcing the `SWELL_COMPANY_CHANCE` draw to succeed in a test produces a swell where every member shares the same `robotAttribute`, direction, `risingMeasures`, and `fallingMeasures`.
  - [ ] A robot whose attribute (or its parent) is disabled is excluded from `members`; every other eligible robot in the company still gets a member.
  - [ ] If every robot in the picked company is ineligible, no swell starts that tick (`activeSwells` size is unchanged).
  - [ ] Two members with different starting `baseValue`s both reach the end of the falling phase on the exact same measure, each landing exactly on its own `baseValue`.
  - [ ] A company-wide swell increases the robot pool's active-swell count (against the 5-cap) by exactly 1, regardless of company size — verified with a company of 4+ eligible robots.
  - [ ] With the robot pool's 5-cap already reached by other swells, a company-wide pick doesn't start (same cap-enforcement path as Task 4's single-robot case).
  - [ ] Determinism holds: identical seed/measure/company produces an identical member set, direction, and timing.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes, covering every criterion above.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** M (the most architecturally novel task in this plan — multi-member composition over shared timing, per spec §1.5)

### Checkpoint: Full mechanism complete
- [ ] `npm run build:types`, `npm run lint`, `npx vitest run src/systems/audioSwells.test.ts` clean.
- [ ] Full `audioSwells.test.ts` suite (global, single-robot, company-wide) passes together — no cross-pool cap leakage (global cap and robot cap never interact).
- [ ] Review with human before proceeding.

---

### Phase 5: Integration

- [ ] **Task 6: `systems/worldTransition.ts` — wire the lifecycle into `initializeLocale`**

  **Description:** `initializeLocale` gains `stopAudioSwells(); startAudioSwells(localeId);`, alongside its existing `stopRobotLifecycle()`/`startRobotLifecycle(localeId)` pair (spec §4, §2).

  **Acceptance criteria:**
  - [ ] `initializeLocale(localeId)` calls both `stopAudioSwells()` and `startAudioSwells(localeId)`, in that order, alongside the existing robot-lifecycle restart.
  - [ ] Switching locales (a second `initializeLocale` call) fully clears the prior locale's in-flight swells — no swell from locale A continues writing after locale B is initialized.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldTransition.test.ts` passes, extended with spy-based assertions on `stopAudioSwells`/`startAudioSwells`, matching how the file already asserts the robot-lifecycle pair.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean — first point this feature is exercised by the full suite together.

  **Dependencies:** Task 5.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** S (small, well-precedented wiring change)

### Checkpoint: Integrated
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual check (spec §5): load a fresh Attenuation Style, open the Audio Rig and a Robot Options screen, leave the app running a few minutes — sliders occasionally crawl on their own and settle back to where they started; two page loads on the same seed/coordinates produce the same swell timeline; disabling an effect mid-swell doesn't leave it stuck at a swelled value; occasionally several robots in the same company visibly move together.
- [ ] Review with human before proceeding.

---

### Phase 6: Docs

- [ ] **Task 7: `docs/AUDIO_SYSTEM.md` — document the mechanism**

  **Description:** New top-level section, sibling to (not nested inside) "LFO Modulation" — explicit that Audio Swells is independent of `lfoEngine.ts`, with no real `LfoTargetId`/`lfoEngine` connection for `delay.wet`/`reverb.wet` (spec §7 item 5). Documents both pools, the two-phase (no hold) ramp, the §1.5 direction/magnitude/duration rules and their exceptions, the company-wide variant, and the `startAudioSwells`/`stopAudioSwells` lifecycle — spot-checked against the actual shipped source, not reconstructed from the spec from memory.

  **Acceptance criteria:**
  - [ ] A reader skimming for "does this app have an LFO on Delay's Mix" lands on "no, but it has something else that moves it sometimes" — not left thinking `delay.wet`/`reverb.wet` gained a real `lfoEngine.ts` target.
  - [ ] Every documented constant/function name matches the actual shipped source exactly (`SWELL_TRIGGER_CHANCE`, `SWELL_COMPANY_CHANCE`, `startAudioSwells`, etc.).
  - [ ] The company-wide mechanic and its "counts as one against the cap" rule are documented explicitly, not just the single-robot case.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked directly against `audioSwells.ts`'s final shipped code.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 5, Task 6.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 7 tasks are met.
- [ ] `docs/AUDIO_SYSTEM.md` reflects the shipped API.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Company-wide lock-step timing composes N independently-based robots over one shared duration — a member already at (or very near) its own edge has `peakDelta ≈ 0`, risking a degenerate/flat interpolation or a divide-by-zero if duration math isn't guarded | Medium — the most novel logic in this feature (§1.5), no prior art in this codebase to copy from | Task 5's acceptance criteria require testing members with genuinely different starting values/available room, including one near its own edge |
| `SWELL_TRIGGER_CHANCE`/`SWELL_COMPANY_CHANCE` are both placeholder derivations, not numbers the user confirmed (spec §7 item 2) | Low-medium — could read as too frequent/rare, or company-wide swells could feel vanishingly rare or too common, once audible | Flagged in spec §7; the Phase 5 manual/audible checkpoint is the place to tune both before merge |
| Ramp interpolation curve (linear vs. eased) within a phase was never confirmed (spec §7 item 1) | Low — a linear ramp is the safe default and matches every other ramp already in this codebase | Task 3 implements linear; revisit only if the Phase 5 manual check reads as mechanical |
| Return-to-base precision — an incrementally-accumulated interpolation could drift from the exact `baseValue` by the final tick due to floating-point rounding | Medium — the intent doc's "lands **exactly** back" guarantee is a hard requirement, not a nice-to-have | Task 3's acceptance criteria require computing each tick's value directly from `(elapsed / totalPhaseMeasures)` against the stored `baseValue`/`peakDelta` (never accumulating a running delta), and snapping to `baseValue` exactly on the final tick regardless of the interpolated value |
| A robot attribute's eligibility (parent-toggle check) is evaluated at selection time only — a layer that goes inactive *while* a swell targeting it is already in flight is not addressed anywhere in the spec | Low — same class of edge case as the already-flagged mid-swell manual-edit race (spec §7 item 3), not new | Not in scope for this plan; carried forward as an open question below, same as the manual-edit race |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **Ramp interpolation curve (linear vs. eased)** — Task 3 implements linear; confirm via a manual audible pass if an eased curve is wanted instead.
2. **`SWELL_TRIGGER_CHANCE`/`SWELL_COMPANY_CHANCE`'s exact values** — both placeholders; tune during the Phase 5 manual/audible checkpoint.
3. **Mid-swell interaction with a live manual slider edit, and with a layer/effect toggling off mid-swell for a company member specifically** — not designed around in this plan; a race between the next `BeatClock` tick and a human's own edit.
4. **Roadmap placement** — this feature needs a home in `docs/todo/roadmap.md` (proposed `## 10.5`) before or during merge; not decided here.
5. **Company selection draw mechanics** (which `getSeededVal` dataId/offset indexes into `Locale.companies`, single-company-locale behavior) — Task 5 should settle the exact draw during implementation, following this feature's existing `dataId`/`offset` convention (spec §1.4); not fully specified in the spec itself.
