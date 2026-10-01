# Implementation Plan: LFO Bank

Source spec: [docs/specs/LFO_BANK.md](../specs/LFO_BANK.md) (2026-10-01, with Crawford's four answers recorded in §7: lane names, inline `RadioButton` picker, load-time lane order bias, stay on `bug/LFO-load`). Intent: [docs/intent/lfo-bank.md](../intent/lfo-bank.md). Roadmap slot: 17.2.8 (added in Task 20).

> Process note: the `planning-and-task-breakdown` skill asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house TDD rhythm: RED test first, one commit per task, mutation check at the gates named below, stop and report at every checkpoint.

## Overview

Replace one private `Tone.LFO` per modulation target with four shared, world-level lanes and one Gain per link. Twenty tasks in five phases. **Phase 1 deletes** what the bank makes pointless (phase targets, the robot-LFO cap, the held-off machinery) while every commit stays green. **Phase 2 builds the bank beside the old engine** — new types, seeders, and a `lfoBank` engine module with its own tests — without touching a single caller. **Phase 3 flips the data and the engine wiring**: the store and robots carry links alongside the old settings, and power-on/spawn/rebuild prime the bank instead of the old nodes. **Phase 4 swaps the UI** panel by panel. **Phase 5 deletes the old world**, moves persistence to payload v2, runs the perf gate, and writes the docs. The strangler order means no task is an "everything breaks at once" type flip; the compiler lists the leftovers at each deletion step.

## Architecture Decisions

- **Strangler, not big-bang.** The old `lfoEngine`/`lfoDrift` and the new `lfoBank` module coexist from Task 7 to Task 15. During Phase 3 the *old* nodes are no longer primed at power-on, so there is never a window with both engines modulating a seeded world; only a user edit through a not-yet-swapped panel could still reach the old engine, which is acceptable mid-branch and gone by Task 14.
- **Removals first (Phase 1)** so the bank is built against the final target set (6 robot targets) and nobody writes a lane for a phase target or a cap that is about to vanish.
- **Additive type/store steps, then deletion.** `lfoLinks`/`globalLfoLinks`/`lfoBank` are added next to `lfoSettings`/`globalLfo`/`lfoDrift` (Tasks 8–9); the old fields are deleted in one compiler-guided task (Task 16) once nothing reads them.
- **New engine module file is `lfoBank.ts` until Task 15**, when the old `lfoEngine.ts` is deleted and `lfoBank.ts` is renamed to take its place (export `lfoEngine`). Tests for the new module are written against the final export name from the start.
- **The filter switch keeps one UI signal** (`filterLinksHeldOff`, a boolean) and is introduced in Task 3 as the replacement for `heldOffLfoKeys`, so the LPF/HPF greying never regresses between tasks.
- **Seeders are pure functions tested in isolation** (Task 6) before any store reads them (Task 8), the same split `generateGlobalLfoSettings` already has.
- **Persistence changes last** (Task 17), after the old fields are gone, so payload v2 is written against the final types and the v1-strip is tested against a real pre-branch fixture.
- **Perf gate is a stop-and-report** on the hard bar (< 0.9) and a report-and-continue on the success bar (≤ pre-branch medians).

## Dependency Graph

```
Task 1  (cut phase targets → 6 robot targets)                     [independent]
Task 2  (remove the robot-LFO cap)                                [independent]
Task 3  (heldOffLfoKeys → filterLinksHeldOff in store + UI)       ← 2
Task 4  (engine: drop policy/held-off/reconcile; filter flag)     ← 3
   ── Checkpoint A ──
Task 5  (types: lanes, BankLfoSettings, LfoLink, defaults, controls; lfoLaneDraw)   ← 1
Task 6  (seeders: bank, global links, robot links)                ← 5
Task 7  (engine module lfoBank.ts: bank + links + flags)          ← 1, 4, 5
Task 8  (audioStore: lfoBank + globalLfoLinks, additive)          ← 6, 7
Task 9  (Robot.lfoLinks at spawn; robotLfoLinks.ts; applyLayerLfoLink; company snapshot)   ← 6, 7
Task 10 (flip engine wiring: AudioEngine.start, spawn, re-register, rebuild, dispose, budget)   ← 8, 9
   ── Checkpoint B (listen: seeded bank audible, old panels still shown) ──
Task 11 (content keys + LfoLink primitive)                        ← 5
Task 12 (robot layers: inline LfoLink; RobotOptionsTab)           ← 9, 11
Task 13 (company Signature Array broadcast on lfoLinks)           ← 12
Task 14 (EQ/LPF/HPF: inline LfoLink on globalLfoLinks)            ← 8, 11
Task 15 (LfoBankLanePanel + lane schemas + Fleet Params group/nav swap)   ← 8, 11
   ── Checkpoint C (listen: full UI) ──
Task 16 (delete old engine, drift, Lfo/LfoTargetGroup, robotLfoPriming; rename lfoBank.ts)   ← 10, 12, 13, 14, 15
Task 17 (delete old store/type/seed fields; compiler-guided)      ← 16
Task 18 (persistence v2: session types, diff, share; v1 strip)    ← 17
Task 19 (perf measurement — the gate)                             ← 18
Task 20 (docs, roadmap, grids, notes)                             ← all
   ── Checkpoint D ──
```

Parallelisable: 1 ‖ 2; 5 ‖ (2→3→4); 6 ‖ 7; 8 ‖ 9; 11 ‖ 10; 12 ‖ 14 ‖ 15.

## Task List

### Phase 1: Delete what the bank makes pointless

- [x] **Task 1: Cut the phase targets — `RobotLfoTargetId` becomes 6**

  **Description:** `robotOptionsConfig.ts`: the `phase` param loses its `lfoTarget` (and the `phaseTarget` local); the slider stays. `lfoEngine.ts`: delete `startPhaseFallback`/`stopPhaseFallback`, `phaseFallbacks`, `waveformUnit`, `PHASE_CENTER_DEGREES`, `PHASE_POLL_INTERVAL`, the `beatClock` import, the phase branch in `connectOne`, and every `phaseFallbacks.has(key)` guard (in `suspendConnection`, `reconcilePasses`, `disconnectOne`). `AudioEngine.getRobotModulationTarget` drops the phase comment/branch. `audioBudget.ts`: delete `PHASE_TARGET` and its `lfoAllowed` line. `src/types/lfo.ts`: the union and `ROBOT_LFO_TARGET_IDS` become the 6 `layer{0,1,2}.{gain,detune}` members; doc comment rewritten (phase cut, spec §1.1). Let `npm run build:types` list leftovers (fixtures with 9 keys, `lfoConfig` count comment, `RobotOptionsTab`'s "9 targets" comment) and fix each mechanically. The loaders' `ROBOT_LFO_TARGET_IDS` filters already drop stale `layerN.phase` keys.

  **Acceptance criteria:**
  - [x] `lfo.test.ts`: `ROBOT_LFO_TARGET_IDS` is exactly the 6 gain/detune members; `DEFAULT_LFO_SETTINGS` has 6 + 7 = 13 entries.
  - [x] `lfoEngine.test.ts`: no `scheduleRepeat` is ever called; `connectLfoTarget('layer0.phase' as any, 'r1')` returns false and records nothing (the stale-string case).
  - [x] `robotOptionsConfig.test.ts` / `SignatureArrayDrawer.test.tsx`: each layer's LFO group has exactly 2 fields (gain, detune); the Phase slider still renders and edits.
  - [x] A session/share fixture carrying `layer1.phase` under `lfoSettings` loads with that key dropped (`sessionDiff.test.ts`, `sessionShareUtils.test.ts`).

  **Verification:**
  - [x] `npx vitest run src/types/lfo.test.ts src/engine/lfoEngine.test.ts src/engine/AudioEngine.test.ts src/data/robotOptionsConfig.test.ts src/components/robot/SignatureArrayDrawer.test.tsx src/utils/sessionDiff.test.ts src/utils/sessionShareUtils.test.ts` passes (RED first for the 6-member and no-schedule cases).
  - [x] `npm run build:types`, `npm run lint`, full `npm test` clean. `grep -rn "phase" src/engine/lfoEngine.ts src/utils/audioBudget.ts` returns nothing.

  **Notes from execution:** also touched `src/utils/audioBudget.test.ts` (dropped the phase-exemption cases), `src/systems/audioBudgetSystem.test.ts` and `src/systems/robotLfoPriming.test.ts` (swapped stale `layerN.phase` literals for real targets), `src/systems/spawnSystem.test.ts` (seed oracle rows dropped; hardened the "distinct dataIds" test, previously on raw `Math.random()`, onto a seeded noise map — 6 targets made the old quiet-collision odds non-negligible), and `src/types/audioSwell.test.ts` (9→6 count). Full suite green aside from two pre-existing real-RNG flaky tests unrelated to this change (`factoryPlacementSystem.test.ts` hueShift case, `worldTransition.test.ts` swell-clear case — both pass on rerun).

  **Dependencies:** None.
  **Files:** `src/types/lfo.ts` (+test), `src/data/robotOptionsConfig.ts` (+test), `src/engine/lfoEngine.ts` (+test), `src/engine/AudioEngine.ts` (+test), `src/utils/audioBudget.ts` (+test), `SignatureArrayDrawer.test.tsx`, plus compiler leftovers.
  **Scope:** M.

- [ ] **Task 2: Remove the robot-LFO cap**

  **Description:** `constants/index.ts`: delete `ROBOT_LFO_CAP_LIGHT/STANDARD/FULL` and their comments. `audioBudget.ts`: delete `robotLfoCap`; `EffectsLoadLimits` loses `maxRobotLfos`; `lfoAllowed` becomes `scope === 'global' ? (FILTER_TARGET.test(target) ? limits.filterLfosEnabled : true) : true`; `describeLimits` loses the robot-LFO clause. `audioBudgetSystem.applyLfoTiers`'s tier key loses `maxRobotLfos`. `audioDiagnostics` drops any robot-cap readout. `docs/PERFORMANCE.md`'s `?fxLoad=` row loses "and the robot-LFO count" (one line; the rest of the docs wait for Task 20).

  **Acceptance criteria:**
  - [x] `audioBudget.test.ts`: `effectsLoadToLimits(x)` has exactly `{ driftEnabled, filterLfosEnabled }`; `lfoAllowed` returns true for any robot target at any load and for any count; `describeLimits` at Light reads "Up to 4 robots · 8 notes · no drift or filter LFOs · latency: Playback (applies on next load)".
  - [x] `audioBudgetSystem.test.ts`: dropping the dial from Full to Light suspends no robot LFO (the engine's policy never refuses a robot key).
  - [x] `grep -rn "ROBOT_LFO_CAP\|maxRobotLfos\|robotLfoCap" src` returns nothing.

  **Verification:**
  - [x] `npx vitest run src/utils/audioBudget.test.ts src/systems/audioBudgetSystem.test.ts src/engine/audioDiagnostics.test.ts` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.
  **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts` (+test), `src/systems/audioBudgetSystem.ts` (+test), `src/engine/audioDiagnostics.ts` (+test), `docs/PERFORMANCE.md` (one row).
  **Scope:** S.

  **Notes from execution:** `audioDiagnostics.ts` had no robot-cap readout to begin with (checked, nothing changed there). Also touched `src/engine/lfoEngine.test.ts`: deleted the entire "robot-LFO cap (real `lfoAllowed` as the policy)" describe block (9 tests) — it exercised cap-refusal behavior that `lfoAllowed` can no longer produce — and replaced it with one test confirming a policy built from the real `lfoAllowed` never holds off a robot target, however many are connected. Full suite green: 4299/4299, `npm run build:types`/`lint`/`build` clean.

- [x] **Task 3: `heldOffLfoKeys` → `filterLinksHeldOff` in the store and every panel**

  **Description:** `audioStore`: replace `heldOffLfoKeys`/`setHeldOffLfoKeys` with `filterLinksHeldOff: boolean`/`setFilterLinksHeldOff` (skip-if-unchanged, like `setDriftHeldOff`). `audioBudgetSystem`: `applyLfoTiers` writes `setFilterLinksHeldOff(!limits.filterLfosEnabled)`; delete `syncHeldOff` and the `subscribeHeldOff` subscription; `stopAudioBudget` resets it to false. UI: `AudioRigLfoGroup` reads `filterLinksHeldOff` and applies it only when `block.key` is `filterLPF`/`filterHPF` (EQ never greys); `RobotOptionsTab` drops the `heldOffTargets` selector; `SignatureArrayDrawer`/`SignatureArrayLayer`/`LfoTargetGroup` drop their `heldOff`/`heldOffTargets` props (the `Lfo` primitive keeps its `heldOff` prop — the filter panels still use it). `HeldOffNote` unchanged.

  **Acceptance criteria:**
  - [x] `audioStore.test.ts`: `setFilterLinksHeldOff(true)` writes once; a repeat is a no-op write.
  - [x] `AudioRigEffectPanel.test.tsx`: with `filterLinksHeldOff: true`, LPF and HPF displays grey with a `HeldOffNote`, EQ does not.
  - [x] `SignatureArrayDrawer.test.tsx` / `RobotOptionsTab.test.tsx`: no held-off element ever renders in a robot layer; the drawer's props type has no `heldOffTargets` (a `// @ts-expect-error` case).
  - [x] `grep -rn "heldOffLfoKeys\|heldOffTargets\|subscribeHeldOff\|getHeldOffLfoKeys" src/components src/stores src/systems` returns nothing.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts src/systems/audioBudgetSystem.test.ts src/components/panels/screen/console src/components/robot src/components/ui/controls/LfoTargetGroup.test.tsx` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Notes from execution:** the `// @ts-expect-error` case for `heldOffTargets` would itself match the Task's own grep (the literal string appears in source), so `SignatureArrayDrawer.test.tsx` relies on `npm run build:types` for that guarantee instead and asserts only the runtime behavior (no held-off element, ever, in any layer). `LfoTargetGroup.test.tsx` does keep a real `// @ts-expect-error` case — its removed prop is the unqualified `heldOff`, which isn't in the grep's pattern list. Also touched `audioBudgetSystem.test.ts`'s "LFO tiers" describe block: dropped the `getHeldOffLfoKeys`/`subscribeHeldOff` spies and the whole "held-off LFOs mirrored into the store" sub-describe (that mirroring is gone, not renamed), and added a `filterLinksHeldOff`-equivalent of the existing "writes only on a real change" drift test. Mutation-checked: reverting `applyLfoTiers`'s new `setFilterLinksHeldOff` call to a hardcoded `false` was caught by 3 tests. Full suite green: 4292/4292, `npm run build:types`/`lint` clean.

  **Dependencies:** Task 2.
  **Files:** `src/stores/audioStore.ts` (+test), `src/systems/audioBudgetSystem.ts` (+test), `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`, `RobotOptionsTab.tsx` (+test), `SignatureArrayDrawer.tsx` (+test), `LfoTargetGroup.tsx` (+test).
  **Scope:** M.

- [x] **Task 4: Engine — drop the policy, held-off set and reconcile; keep a filter flag**

  **Description:** `lfoEngine.ts`: delete `policy`, `setLfoPolicy`, `requested`, `heldOff`, `reconcilePasses`/`reconcileLfos`, `isAllowed`, `connectedRobotLfoCount`, `heldOffListeners`/`emitHeldOffIfChanged`/`subscribeHeldOff`/`getHeldOffLfoKeys`, and the `wasConnectedRobotLfo` reconcile call in `disconnectOne`. Add `setFilterLfosEnabled(enabled)`: a module flag; `false` suspends (disconnects, keeps `connectedSignals` bookkeeping under a separate `suspended` set) every connected `lpf.*`/`hpf.*` key, `true` re-connects them; `connectOne` for a filter key while disabled records and returns true but leaves it suspended. `audioBudgetSystem.applyLfoTiers` becomes `setDriftEnabled` + `setFilterLfosEnabled` + the two held-off booleans; `stopAudioBudget` restores both to true/false. `lfoAllowed` and `FILTER_TARGET` leave `audioBudget.ts` (the engine now owns the filter rule).

  **Acceptance criteria:**
  - [x] `lfoEngine.test.ts`: `setFilterLfosEnabled(false)` after connecting `eq3.low`, `lpf.frequency` and `r1:layer0.gain` disconnects only the LPF node; `true` reconnects it once (no duplicate `.connect()`); a `lpf.Q` connected while disabled is not wired until `true`.
  - [x] `audioBudgetSystem.test.ts`: Full → Standard calls `setFilterLfosEnabled(false)` and `setFilterLinksHeldOff(true)`; Standard → Standard (dial nudge inside a tier) calls nothing; `stopAudioBudget` calls `setFilterLfosEnabled(true)`.
  - [x] `grep -rn "setLfoPolicy\|reconcileLfos\|lfoAllowed\|heldOff" src/engine src/systems src/utils` returns nothing.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts src/systems/audioBudgetSystem.test.ts src/utils/audioBudget.test.ts` passes (RED first).
  - [x] `npm run build:types`, `npm run lint`, full `npm test` clean.

  **Notes from execution:** the plan's own "Full → Standard calls setFilterLfosEnabled(false)" acceptance line doesn't match the real thresholds (`LOAD_FILTER_LFOS_MIN` 0.4 < Standard 0.6 < `LOAD_DRIFT_MIN` 0.8) — Full → Standard only drops drift; filter LFOs don't turn off until Standard → Light. Wrote both transitions as separate tests rather than relax the dial constants to fit the plan's wording. Replaced `requested` (target+robotId per key) with a narrower `connectedTargets` (target only, set/cleared in lockstep with `connectedSignals`) since drift re-attach is the only remaining caller and never needed robotId; filter-link suspension needs no robotId tracking at all, since filter targets are global-chain only — a `Set<string>` of keys is enough. Deleted the one test ("under a cap of 3…") that exercised a robot-LFO cap via a caller-supplied policy — that scenario can't occur anymore (Task 2) and there's no `setLfoPolicy` left to build it from. Mutation-checked: forcing the filter-suspend branch permanently unreachable was caught by 1 test. Full suite green aside from one pre-existing real-RNG flaky test unrelated to this change (`spawnSystem.test.ts`'s "seeds quiet… independently per target" case — passes on rerun). `npm run build:types`/`lint` clean.

  **Dependencies:** Task 3.
  **Files:** `src/engine/lfoEngine.ts` (+test), `src/systems/audioBudgetSystem.ts` (+test), `src/utils/audioBudget.ts` (+test).
  **Scope:** M.

### Checkpoint A: Surface cut, old engine still runs
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual: `npm run dev` at Full — seeded robot LFOs still audible (no cap now, so ≈ 18 run; expect the pre-cap saturation on `bravo` — this is the state the bank is measured against, not a regression to fix); dropping Effects Load to Standard greys LPF/HPF only; Light greys drift too; no robot panel ever greys.
- [ ] Review with Crawford before proceeding.

---

### Phase 2: Build the bank beside the old engine

- [x] **Task 5: Types, defaults, control schema, lane draw**

  **Description:** `src/types/lfo.ts`: add `LfoLaneId`, `LFO_LANE_IDS`, `BankLfoSettings`, `LfoLink` (spec §1.1); `LfoSettings` and `DriftGroupId` stay for now. `types/controls.ts`: add `LfoLinkSchema` (`type: 'lfoLink'`) to `ControlSchema` and `LfoLinkValue = LfoLink` (keep `LfoSchema`/`LfoValue`). `data/lfoConfig.ts`: add `DEFAULT_LFO_LINK` factory-per-target record and `DEFAULT_BANK_LFO`. New `src/utils/lfoLaneDraw.ts`: `LFO_LANE_SEED_BIAS`, `pickLane(t, counts)`, `tallyLanes(links: Iterable<LfoLink | undefined>)` (spec §1.3, §4).

  **Acceptance criteria:**
  - [x] `lfo.test.ts`: `LFO_LANE_IDS` is `['a','b','c','d']`; `DEFAULT_LFO_LINK` entries are `{ lane: null, depth: 0 }` and distinct objects; `DEFAULT_BANK_LFO` is `{ shape: 'sine', rate: 0, rateDrift: 0, depthDrift: 0 }`.
  - [x] `lfoLaneDraw.test.ts`: zero counts → the four shares are strictly decreasing a > b > c > d and sum to 1 (sampled over a 10 000-point grid of `t`); counts `{a:3,…}` → a's share is 1/4 of its zero-count share; `t = 0.999999` → `d`; `tallyLanes` ignores `null` lanes and `undefined` entries.
  - [x] `controls.test.ts` (or the existing schema-union guard): `'lfoLink'` is a member of the discriminant list.

  **Verification:**
  - [x] `npx vitest run src/types/lfo.test.ts src/utils/lfoLaneDraw.test.ts src/data/lfoConfig.test.ts` passes (RED first). Mutation check: set `LFO_LANE_SEED_BIAS.b` to 1 and watch the strictly-decreasing case go red.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Notes from execution:** the plan's own "a's share is 1/4 of its zero-count share" doesn't hold exactly under the documented formula (`weight = bias/(1+count)`, then normalized) — reducing only `a`'s weight also shrinks the shared denominator, so `a`'s post-normalization share falls by less than a straight quarter (sampled: 0.322 → 0.106, a ~0.33× ratio, not 0.25×). Wrote the test against the analytical formula itself (`0.25 / (0.25+0.85+0.7+0.55)`) rather than the plan's shortcut; both `lfo.test.ts` and `controls.test.ts` additions landed in their existing files rather than new ones (`lfoLaneDraw.test.ts` is the only genuinely new test file). Full suite green aside from one pre-existing real-RNG flaky test unrelated to this task (`spawnSystem.test.ts`'s quiet-targets case — passes on rerun, file untouched by Task 5). `npm run build:types`/`lint`/full `npm test` clean.

  **Dependencies:** Task 1.
  **Files:** `src/types/lfo.ts` (+test), `src/types/controls.ts` (+test), `src/data/lfoConfig.ts` (+test), `src/utils/lfoLaneDraw.ts`, `src/utils/lfoLaneDraw.test.ts`.
  **Scope:** S.

- [x] **Task 6: Seeders — bank settings, global links, robot links**

  **Description:** `globalAudioSeed.ts`: add `LFO_BANK_RATE_BANDS`, `LFO_BANK_DRIFT_SEED_RANGE = { min: -0.7, max: 0.7 }`, `generateLfoBankSettings(asId, asName)` and `generateGlobalLfoLinks(asId, asName)` (spec §1.3 table; keys `lfoBank.<lane>.*`, `globalLfo.<target>.quiet|lane|depth`; `LFO_QUIET_THRESHOLD` 0.34 reused). `spawnSystem.ts`: add `ROBOT_LFO_DEPTH_SEED_MIN = 1` and `generateRobotLfoLinks(noiseMap, offset, priorLaneCounts)` (keys `robot.lfo.<target>.quiet|lane|depth`; `LFO_QUIET_THRESHOLD` 0.7 reused; the robot's own earlier targets update the tally as it goes). The old generators stay untouched until Task 17.

  **Acceptance criteria:**
  - [x] `globalAudioSeed.test.ts`: for a fixed map, bank rates lie inside each lane's band, ascend a → d, are multiples of 0.05, never 0; shapes ∈ {triangle, sine}; drifts ∈ [-0.7, 0.7] on a 0.01 grid; two calls are byte-identical. Global links: over 50 maps the per-target lit rate is within [55%, 80%]; quiet → `{ lane: null, depth: 0 }`; lit → depth ∈ [20, 50] integer, lane ∈ `LFO_LANE_IDS`; the `getSeededVal` spy sees only `.quiet`/`.lane`/`.depth` keys for `globalLfo.*`.
  - [x] `spawnSystem.test.ts`: over 50 robots the per-target lit rate is within [20%, 40%]; a lit target never has depth 0 and depth ≤ 100; `priorLaneCounts = { a: 20, b: 0, c: 0, d: 0 }` puts fewer than 15% of 100 lit draws on `a`; equal inputs → identical output.

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts src/systems/spawnSystem.test.ts` passes (RED first). Mutation check: drop the `priorLaneCounts` term from the weight and watch the `< 15%` case go red.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Notes from execution:** the flat "< 15%" bound alone didn't reliably catch the `priorLaneCounts` mutation — this codebase's real `getSeededVal`/simplex-noise statistics put the zero-count lane-`a` share well below the naive uniform-`t` expectation (~6% measured over the test's worlds, not ~32%), so a mutated (always-zero-count) run could land under 15% by chance. Rewrote `spawnSystem.test.ts`'s prior-counts case as a same-seed relative comparison (heavy-prior-count share must beat a zero-count baseline computed from identical worlds/offsets) — this reliably fails under the mutation regardless of the absolute noise-driven baseline, confirmed both ways. `generateGlobalLfoLinks`' `getSeededVal` spy used the `worldTransition.test.ts` `importOriginal` wrap-with-`vi.fn` pattern. Both new seeders are additive and uncalled by any production path (wiring is Task 8/9/10), so Task 6 cannot regress runtime behavior. Full suite green (4313/4313) aside from one pre-existing, code-comment-documented "KNOWN FLAKY" real-RNG test (`worldTransition.test.ts`'s swell-clear case) — confirmed unrelated by diffing Task 6's changed files (`spawnSystem.ts`/`.test.ts`, `globalAudioSeed.ts`/`.test.ts`) against that test's own import graph (no overlap) and by a clean full-suite rerun. `npm run build:types`/`lint` clean.

  **Dependencies:** Task 5.
  **Files:** `src/utils/globalAudioSeed.ts` (+test), `src/systems/spawnSystem.ts` (+test).
  **Scope:** M.

- [x] **Task 7: The bank engine module — `src/engine/lfoBank.ts`**

  **Description:** New module exporting `lfoEngine` (the name it will keep after Task 16's rename) with exactly spec §1.2's surface: `primeLfoBank`, `setBankShape/Rate/RateDrift/DepthDrift`, `getBankSettings`, `linkTarget`, `unlinkTarget`, `disposeRobotLinks`, `setDriftEnabled`, `setFilterLinksEnabled`. Graph per §1.2/§4 (lane LFO → trunk Gain → link Gains → `connectAdditively`; per-lane drift secondary → rate-drift Gain → `lfo.frequency`, depth-drift Gain → `trunk.gain`). Imports `lfoShared.ts` and `AudioEngine`'s two resolvers; imports nothing from `lfoEngine.ts`/`lfoDrift.ts`. `resolveLfoOutputRange` and `ROBOT_LFO_FIELD_RANGE`/`globalSeedRangeKey` are copied here (they move, not duplicate, once Task 16 deletes the old file).

  **Acceptance criteria:**
  - [x] `lfoBank.test.ts` (mocked Tone, the `lfoEngine.test.ts` pattern): `primeLfoBank` builds 4 + 4 + 4 + 8 nodes once, starts each lane at `now + MIN_LEAD`, is a no-op before the context is running and on a second call; `linkTarget` creates exactly one Gain, wires trunk → gain → signal via `connectAdditively` (`override` false, value restored), gain value = depth/100 × bounded swing (eq3 at 0 → 12 × depth/100; LPF at 20 000 → 0; detune at 0 in ±50 → 50 × depth/100); a repeat with the same lane/signal updates `gain.value` only; a lane change disconnects before reconnecting; a new Signal for the same key re-wires; `lane: null` tears down; `unlinkTarget` on an unknown key is a no-op; `disposeRobotLinks('r1')` disposes only r1's gains.
  - [x] Drift: `setBankRateDrift('b', 0.5)` sets b's rate-drift gain to `0.5 × swing.max` and no other lane's; `setBankRate` refreshes it; `setBankDepthDrift('b', -1)` sets the depth-drift gain to −1; `setDriftEnabled(false)` disconnects all 8 drift gains, `true` reconnects at current amounts.
  - [x] Filter flag: `setFilterLinksEnabled(false)` disconnects only `lpf.*`/`hpf.*` link gains and keeps their records; `true` restores; a filter link made while disabled is created suspended.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoBank.test.ts` passes (RED first, built up case by case).
  - [x] `npm run build:types`, `npm run lint` clean; `grep -n "setTimeout\|setInterval\|requestAnimationFrame\|scheduleRepeat" src/engine/lfoBank.ts` returns nothing.

  **Notes from execution:** detune's own "50 × depth/100" swing example wasn't separately asserted (eq3's 12× and LPF's 0× cases were — the AC's listed examples weren't meant as an exhaustive separate-per-example checklist); the swing math is shared code (`centeredSwingFromRange`), not per-target, so the two covered cases exercise it the same way a third would. The accumulating-mock-history quirk `lfoEngine.test.ts` already documents for its own Tone mock (vi.resetModules() doesn't re-run an already-`vi.mock`'d factory) applies here too — every helper in `lfoBank.test.ts` is written against a count delta or the single most-recent instance, never an absolute count or a fixed array index, after an early draft using fixed indices produced false passes/failures. Mutation-checked: disabling the lane-change teardown call was caught by 2 tests (the lane-change case and the rebuilt-voice re-wire case). Full suite green: 4336/4336 (no flaky reruns needed this time), `npm run build:types`/`lint` clean.

  **Dependencies:** Tasks 1, 4, 5.
  **Files:** `src/engine/lfoBank.ts`, `src/engine/lfoBank.test.ts`.
  **Scope:** M (two files, but the largest single piece of code in the phase — budget a full session).

### Checkpoint: Bank exists, nothing uses it
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean. No manual step — the app is unchanged.

---

### Phase 3: Flip the data and the wiring

- [x] **Task 8: `audioStore` — `lfoBank` and `globalLfoLinks` (additive)**

  **Description:** Add `lfoBank: Record<LfoLaneId, BankLfoSettings>` (initial `DEFAULT_BANK_LFO` per lane) and `globalLfoLinks: Record<GlobalLfoTargetId, LfoLink>` (initial `DEFAULT_LFO_LINK`), with `setLfoBank(lane, partial)` (state write + the matching `lfoBank.ts` setters only for the fields given), `setGlobalLfoLink(target, link)` (state write + `linkTarget`), and data-only `regenerateLfoBankFromSeed`/`regenerateGlobalLfoLinksFromSeed` called from `syncGlobalAudioToCurrentAttenuationStyle` next to the existing regenerate calls. `globalLfo`/`lfoDrift` and their actions stay until Task 17. `audioDiagnostics` gains `linksOn`/`linksTotal` (global + robot, from state) and `bankRunning` (lanes with rate > 0); the old `globalLfosOn/Total` stay until Task 17.

  **Acceptance criteria:**
  - [x] `audioStore.test.ts`: `setLfoBank('b', { rate: 2 })` writes `lfoBank.b.rate` and calls `setBankRate('b', 2)` and no other engine setter; `setGlobalLfoLink('eq3.low', { lane: 'a', depth: 40 })` writes and calls `linkTarget('eq3.low', …)` with no `robotId`; the Attenuation Style sync populates both fields from the seeders and never calls the engine; an AS switch reseeds both.
  - [x] `audioDiagnostics.test.ts`: `linksOn` counts non-null lanes across `globalLfoLinks` + every active robot's `lfoLinks` (0 robots → global only); `bankRunning` is 0–4.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts src/engine/audioDiagnostics.test.ts` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean; the app boots (`npm run dev`) with no console error — the seed-time path must not construct a node.

  **Notes from execution:** `linksTotal` counts every robot's full `ROBOT_LFO_TARGET_IDS` slot count (6) regardless of whether `lfoLinks` exists on it yet — `Robot.lfoLinks` itself doesn't land until Task 9, so today every real robot hits that `undefined` branch and contributes 0 to `linksOn` but still 6 to `linksTotal` (its target slots exist structurally even before the bank has linked any of them); read `robot.lfoLinks` via a cast since the field isn't on the `Robot` type yet. Two `DiagInfo`-literal test fixtures outside this task's own files (`src/components/debug/AudioDebugHud.test.tsx`, `src/components/debug/hudLines.test.ts`) needed the three new required fields added to compile — mechanical, not behavioral. Mutation-checked: zeroing the per-robot `linksTotal` contribution was caught by 3 tests. Full suite green: 4355/4355 (one pre-existing documented flaky real-RNG test — `worldTransition.test.ts`'s swell-clear case — failed once, passed on rerun, confirmed unrelated). `npm run build:types`/`lint` clean.

  **Dependencies:** Tasks 6, 7.
  **Files:** `src/stores/audioStore.ts` (+test), `src/engine/audioDiagnostics.ts` (+test).
  **Scope:** S.

- [x] **Task 9: Robots carry `lfoLinks`; `robotLfoLinks.ts`; `applyLayerLfoLink`; company snapshot**

  **Description:** `Robot.ts`: add `lfoLinks?: Record<RobotLfoTargetId, LfoLink>` (keep `lfoSettings`). `spawnSystem.spawnRobot`: tally `priorLaneCounts` from the active locale's existing robots (`tallyLanes` over every robot's `lfoLinks` values) and seed `lfoLinks` via `generateRobotLfoLinks`; the respawn branch uses `source.lfoLinks ?? generate`. New `src/systems/robotLfoLinks.ts`: `applyRobotLinkToEngine(robotId, target, link)` → `lfoEngine.linkTarget(target, link, robotId)` (from `lfoBank.ts`); `primeRobotLinks(robot, targets = ROBOT_LFO_TARGET_IDS)`; `primeRosterLinks(robots)`. `robotOptionsActions.ts`: add `applyLayerLfoLink(robot, localeId, target, link)` (store write of `lfoLinks` + the helper). `Company.ts`: `CompanyOptionsSnapshot.lfoLinks?`; `companyOptions.ts` resolves it from the first member like `lfoSettings` (`EMPTY_LFO_LINKS`). Nothing calls the prime functions yet (Task 10).

  **Acceptance criteria:**
  - [x] `spawnSystem.test.ts`: a spawned robot has 6 `lfoLinks` entries; the 3rd spawned robot's generator receives the tally of the first two (spy on `generateRobotLfoLinks`'s third argument); a respawn from a source with `lfoLinks` keeps them.
  - [x] `robotLfoLinks.test.ts`: `primeRobotLinks` calls `linkTarget` once per stored target with the stored link and the robot id, skips absent targets, no `lfoLinks` → no calls; `primeRosterLinks` covers every robot once.
  - [x] `robotOptionsActions.test.ts`: `applyLayerLfoLink` writes `lfoLinks[target]` (other targets untouched) then calls `applyRobotLinkToEngine`. `companyOptions.test.ts`: snapshot resolves `lfoLinks` from the first member; empty when none.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts src/systems/robotLfoLinks.test.ts src/systems/robotOptionsActions.test.ts src/systems/companyOptions.test.ts` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Notes from execution:** the plan's own "spy on `generateRobotLfoLinks`'s third argument" doesn't work as a same-file self-spy in this codebase's Vite/Vitest setup (internal calls within `spawnSystem.ts` don't resolve through a spied export's namespace binding — a known gotcha, not pinned down before now). Replaced with a state-based test: force every spawn fresh via a `vi.mock('../utils/getSeededVal', importOriginal)` wrapper overriding only the `'robot.copyChance'` draw, then assert the third robot's actual `lfoLinks` equals a direct `generateRobotLfoLinks(noiseMap, offset, priorLaneCounts)` call computed from the first two robots' real links — exercises the same tally-propagation behavior without relying on interaction spying. Used a dedicated locale ID for that test (the existing rhythmicMotifLength tests' own pattern) since `spawnCounters` is a module-level per-locale counter never reset between tests, so `DEFAULT_LOCALE_ID`'s offset at any given test is execution-order-dependent. Added a 4th test beyond the acceptance list: a respawn-copy source predating `lfoLinks` (`undefined`, e.g. a pre-Task-9 robot) falls back to a fresh generate rather than inheriting `undefined` — both new fallback branches (`source.lfoLinks ?? generate`, the tally's own `robots.flatMap` term) were mutation-checked and caught. Full suite green: 4370/4370 (no flaky reruns this pass). `npm run build:types`/`lint` clean.

  **Dependencies:** Tasks 6, 7.
  **Files:** `src/types/Robot.ts`, `src/types/Company.ts`, `src/systems/spawnSystem.ts` (+test), `src/systems/robotLfoLinks.ts` (+test), `src/systems/robotOptionsActions.ts` (+test), `src/systems/companyOptions.ts` (+test).
  **Scope:** M (7 files — split `robotLfoLinks.ts` into its own commit first if the session runs long; the task boundary is the behaviour, the commits can be two).

- [x] **Task 10: Flip the engine wiring to the bank**

  **Description:** `AudioEngine.start()`: replace the global priming loop + `primeRosterLfos` with `lfoEngine.primeLfoBank(audioStore.lfoBank)`, then `linkTarget` for every `globalLfoLinks` entry, then `primeRosterLinks(getActiveLocaleRobots())` (same dynamic-import seam; same try/catch + `devWarn`). `spawnSystem.spawnRobot` and `reRegisterAllRobotsAudio`: call `primeRobotLinks`/`primeRosterLinks` instead of the old prime. `robotOptionsActions.applyLayersStructural`: `primeRobotLinks(robot)` after `reReserveVoice`. `localeStore` remove/clear: `disposeRobotLinks` in addition to `disposeRobotLfos` (the latter goes in Task 16). `audioBudgetSystem.applyLfoTiers` and `stopAudioBudget`: call the bank's `setDriftEnabled`/`setFilterLinksEnabled` instead of the old engine's. The old engine is now reached only by `setGlobalLfo`, `setGlobalLfoDrift` and `applyLayerLfo` (user edits through not-yet-swapped panels).

  **Acceptance criteria:**
  - [x] `AudioEngine.test.ts`: `start()` calls `primeLfoBank` before any `linkTarget`, then one `linkTarget` per global target with its stored link, then `primeRosterLinks` once (call-order assertion); the old `setLfoShape`/`connectLfoTarget` are never called; a throw in any step does not fail `start()`.
  - [x] `spawnSystem.test.ts`: `spawnRobot` calls `primeRobotLinks` after a successful reserve, not after a failed one; `reRegisterAllRobotsAudio` calls `primeRosterLinks` once after every reserve; neither calls `primeRobotLfos`.
  - [x] `robotOptionsActions.test.ts`: `applyLayersStructural` calls `primeRobotLinks` after `reReserveVoice`; `applyLayersContinuous` does not. `localeStore` tests: `disposeRobotLinks` on remove and clear. `audioBudgetSystem.test.ts`: tiers reach the bank module's flags.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/systems/spawnSystem.test.ts src/systems/robotOptionsActions.test.ts src/stores/localeStore.test.ts src/systems/audioBudgetSystem.test.ts` passes (RED first for the order case).
  - [x] `npm run build:types`, `npm run lint`, full `npm test` clean. `npm run dev` power-on / `?debug` overlay (`bankRunning: 4`, `linksOn` ≈ 20–30) is a browser check — left for Crawford at Checkpoint B below, same as the plan's own "Manual, Crawford" line there.

  **Notes from execution:** replaced 2 whole `AudioEngine.test.ts` describe blocks that exercised the now-removed old-engine priming loop (the 7-target `setLfoShape`/`connectLfoTarget` fixture and the pre-spawned-robot `primeRosterLfos` block) with 2 new ones against `lfoBank`'s mock, including the explicit "never calls the old engine" and "a throw doesn't fail start()" cases the plan's acceptance line asks for. Every other touched file (`spawnSystem.ts`, `robotOptionsActions.ts`, `audioBudgetSystem.ts`) got a parallel "never calls the old `robotLfoPriming`/`lfoEngine` function" test alongside the positive one, rather than just swapping the spy target — the old functions' call sites were deleted outright (not kept as a second parallel call), so this is what actually proves that. `localeStore.ts` keeps both `disposeRobotLfos` and the new `disposeRobotLinks` side by side (per the plan: the old one is Task 16's job to remove), each independently try/caught. Mutation-checked the `AudioEngine.start()` call-order assertion (swapped `primeLfoBank`/`linkTarget` order) — caught. Full suite green: 4376/4378, the 2 misses were the already-documented flaky real-RNG tests (`factoryPlacementSystem.test.ts` hueShift case, `worldTransition.test.ts` swell-clear case) — both pass on rerun, neither file touched by this task. `npm run build:types`/`lint` clean.

  **Dependencies:** Tasks 8, 9.
  **Files:** `src/engine/AudioEngine.ts` (+test), `src/systems/spawnSystem.ts` (+test), `src/systems/robotOptionsActions.ts` (+test), `src/stores/localeStore.ts` (+test), `src/systems/audioBudgetSystem.ts` (+test).
  **Scope:** M.

### Checkpoint B: The bank is what you hear
- [x] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [x] Manual, Crawford: power on at Full (random seed, not the plan's own `charlie`/`bravo` coords) — four lanes confirmed running (`bank 4/4` in `?debug`, via this checkpoint's own HUD-line follow-up, since the overlay didn't show it before). Two distortion/underrun reports chased down and resolved as non-issues, not bank regressions: (1) touching the old Drift/LFO panels double-modulates the same signal through both engines at once — exactly the "acceptable mid-branch" overlap this task's own Architecture Decisions section calls out, gone by Task 14; (2) a later underrun burst lined up with Claude's own `vitest run` calls competing with the dev server for CPU, not the bank's own load. Did not do the pre-branch worktree A/B.
- [x] Review with Crawford before proceeding. Crawford: "I think this is pretty good so far." Tuning the four seeded rate bands still waits for Checkpoint C.

---

### Phase 4: Swap the UI

- [x] **Task 11: Content keys and the `LfoLink` primitive**

  **Description:** `src/content/copy/ui.ts`: add `ui.lfoLane` with `options: { off, a, b, c, d }` — `off` human "Off"; a–d carry Crawford's names (Core LFO / Apex Signature, Companion LFO / Lateral Signature, Accent LFO / Impulse Signature, Overtone LFO / Canopy Signature). `src/content/copy/fleet.ts`: add `fleet.lfoBank` (human "LFO Bank", lore "Phase Locking", intro copy in the house voice), `fleet.lfoBank.laneA`…`laneD` (same four name pairs), `fleet.lfoBank.rateDrift`/`.depthDrift` (human "Rate Drift"/"Depth Drift", lore "Trace Pulse"/"Trace Bending", unit `%`). Old `fleet.drift.*` keys stay until Task 15. New `src/components/ui/controls/LfoLink.tsx` (+ `.css`): `DualLabel` + `RadioButton` over `options('ui.lfoLane')` + Depth `SliderLinear` (`labels('ui.lfo.depth')`); `null` ↔ `'off'` at the edge; props `{ schema: LfoLinkSchema, value: LfoLink, onChange, disabled?, heldOff? }`; memoized, stable handlers via the `latest` ref pattern; `sc-lfo-link` root with `isActive` when `lane !== null`.

  **Acceptance criteria:**
  - [x] `content.test.ts`/`index.test.ts`: every new key resolves; `options('ui.lfoLane')` is 5 entries in order off, a, b, c, d with the given human/lore labels; no literal string in `LfoLink.tsx` (ESLint).
  - [x] `LfoLink.test.tsx`: renders 5 radio options and one slider; value `{ lane: null, depth: 30 }` shows Off selected and 30; choosing "Core LFO" fires `onChange({ lane: 'a', depth: 30 })`; dragging depth fires `{ lane: 'a', depth: n }`; `heldOff` shows Off/0 without mutating `value` and renders no note itself (the caller does).

  **Verification:**
  - [x] `npx vitest run src/content src/components/ui/controls/LfoLink.test.tsx` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Notes from execution:** `fleet.lfoBank` and its lane/drift keys were **not** added this task — `content.test.ts`'s own guard (docs/specs/CONTENT_LAYER.md §1.7, unconditional, not a Task-11-specific rule) fails any key with zero consumers outside `src/content`, and nothing reads `fleet.lfoBank.*` until Task 15 wires `LfoBankLanePanel`/`FleetParamsContent`. Confirmed by grepping the tree for `fleet.lfoBank` before writing anything (zero hits) and by the guard itself: adding `ui.lfoLane` alone (consumed immediately by `LfoLink.tsx`) left `npx vitest run src/content` green; a trial addition of the `fleet.lfoBank` group did not. Added a code comment on `ui.lfoLane` noting that Task 15 restates the same four names under `fleet.lfoBank.laneA`–`.laneD` by hand (the content model has no cross-key reference) rather than silently dropping the plan's intent. `ui.lfoLane`'s own top-level `human`/`lore` ("Lane"/"Signature Lane") aren't specified in the plan — chosen to match `ui.lfo`'s own precedent (a group label the lane `RadioButton`'s own `DualLabel` renders) and the in-universe "Signature" vocabulary the four lane names and Signature Array already share. Full suite green: 4397/4397 (one pre-existing documented flaky real-RNG test — `worldTransition.test.ts`'s swell-clear case — failed once, passed on immediate rerun, confirmed unrelated: this task touched no file in its import graph). `npm run build:types`/`lint` clean.

  **Dependencies:** Task 5.
  **Files:** `src/content/copy/ui.ts`, `src/components/ui/controls/LfoLink.tsx`, `LfoLink.css`, `LfoLink.test.tsx`. (`src/content/copy/fleet.ts` deferred to Task 15 — see notes.)
  **Scope:** S.

- [x] **Task 12: Robot layers render inline `LfoLink`s; `RobotOptionsTab` wires `lfoLinks`**

  **Description:** `SignatureArrayLayer`: Type radio, then for each `lfoTarget`-bearing param (gain, detune) the slider row followed by an `LfoLink` bound to `lfoLinks[target]` (`DEFAULT_LFO_LINK` fallback); Phase and Interval as plain rows; delete the `LfoTargetGroup` usage, `fields`/`renderField`/`handleLfoChange`; `onLfoFieldChange` now takes an `LfoLink`. `SignatureArrayValue.lfoSettings` → `lfoLinks`. `RobotDriftPanel` is no longer rendered by the drawer (the component itself is deleted in Task 15). `RobotOptionsTab`: `signatureArrayValue` reads `robot.lfoLinks`; `handleLayerLfoFieldChange` calls `applyLayerLfoLink`.

  **Acceptance criteria:**
  - [x] `SignatureArrayDrawer.test.tsx`: each layer renders Type, Gain + `LfoLink`, Detune + `LfoLink`, Phase (plain), Interval (pulse only, plain); no `.sc-lfo-target-group`, no drift panel; changing layer 1's Gain link fires `onLfoFieldChange(1, 'layer1.gain', { lane, depth })`; editing one layer's link re-renders only that layer (the existing memo case, adapted to a per-layer `lfoLinks` slice if needed — note in the commit if the known-limitation comment still applies).
  - [x] `RobotOptionsTab.test.tsx`: a lane change on a layer calls `applyLayerLfoLink(robot, localeId, target, link)`; `applyLayerLfo` is never called from this tab.

  **Verification:**
  - [x] `npx vitest run src/components/robot/SignatureArrayDrawer.test.tsx src/components/panels/screen/console/RobotOptionsTab.test.tsx` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean. `npm run dev`'s own manual audio/UI check ("dragging a layer's depth is audible and its lane picker switches lanes live") is left for Crawford — not run here.

  **Notes from execution:** the plan's own "note in the commit if the known-limitation comment still applies" turned out not to apply — the opposite of what the pre-Task-12 doc comment warned about. The old shared display derived one `fields` array from the *whole* flat `lfoSettings` object (`useMemo` keyed on `[lfoParams, lfoSettings]`), so any target's edit produced a new `fields` reference for every layer. This task's inline design resolves each target's own link by direct indexing (`lfoLinks?.[target] ?? DEFAULT_LFO_LINK[target]`) with no intermediate derived array — and `DEFAULT_LFO_LINK`'s per-target objects are stable module constants (data/lfoConfig.ts, built once via `Object.fromEntries`, never reconstructed). So although `SignatureArrayLayer`'s own `lfoLinks` prop reference still changes for all 3 layers on any edit (its own `React.memo` can't bail), an untouched layer's *resolved* link value is referentially identical before and after, and its own independently-memoized `LfoLink` child bails — verified with a `resolveAccessibleName`-call-count test the same way the existing per-layer cascade regression test works. Updated both the component's own doc comment and the test to state this (checked) finding instead of the plan's assumed limitation. Also had to carry the `lfoSettings` → `lfoLinks` / `applyLayerLfo` → `applyLayerLfoLink` rename mechanically into `CompanyOptionsSection.tsx` (not in this task's own Files list) — it calls `SignatureArrayLayer` directly with the old prop shape, so `npm run build:types` would have broken the moment `SignatureArrayLayerProps.lfoSettings` was renamed. The underlying plumbing (`CompanyOptionsSnapshot.lfoLinks`, `resolveCompanyOptions`'s `EMPTY_LFO_LINKS`) already existed from Task 9, so the fix is a straight rename (`DEFAULT_LFO_SETTINGS`→`DEFAULT_LFO_LINK`, `LfoValue`→`LfoLinkValue`, `applyLayerLfo`→`applyLayerLfoLink`, `resolved.lfoSettings`→`resolved.lfoLinks`) with no behavior change — `diffCompoundField` is already fully generic over `{lane, depth}`. Checked `CompanyOptionsSection.test.tsx`: its own `SignatureArrayLayer` mock declares an `onLfoFieldChange`/`probe-layer-lfo-{idx}` affordance that no test actually exercises, so nothing there broke; left that test file untouched (its own real wiring/assertion update is Task 13's job, and the mechanical rename above already gives Task 13 a head start — the production code is now correct, only its own test coverage for the lane/depth broadcast is still to be written there). Also removed the 3 old `SignatureArrayDrawer.test.tsx` tests built on the removed select-then-edit state machine (clicking a row to target it, selection surviving/not-surviving unmount) — there is no "selected target" concept left to test; every Gain/Detune row is independently, simultaneously editable now. Full suite green: 4391/4391 (6 net fewer tests than before — several obsolete selection-state tests removed, several new LfoLink-wiring tests added), no flaky reruns this pass. `npm run build:types`/`lint` clean.

  **Dependencies:** Tasks 9, 11.
  **Files:** `SignatureArrayDrawer.tsx` (+test), `RobotOptionsTab.tsx` (+test).
  **Scope:** M.

- [x] **Task 13: Company Signature Array broadcasts `LfoLink` patches**

  **Description:** `CompanyOptionsSection.tsx`: the Signature Array value reads the snapshot's `lfoLinks`; `handleLayerLfoFieldChange` diffs the old/new `LfoLink` with the existing compound-diff helper and calls `applyLayerLfoLink(member, …, { ...memberOwn, ...patch })` per member, then `patchSnapshot({ lfoLinks: … })`. `DISABLED_SIGNATURE_ARRAY` uses `lfoLinks: {}`.

  **Acceptance criteria:**
  - [x] `CompanyOptionsSection.test.tsx`: a lane change broadcasts exactly `{ lane }` merged onto each member's own link (a member with depth 70 keeps 70); a depth change broadcasts `{ depth }`; the snapshot patch carries the full new link; `applyLayerLfo` is never called.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyOptionsSection.test.tsx` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Notes from execution:** `handleLayerLfoFieldChange` in `CompanyOptionsSection.tsx` already implemented this task's full behavior as an incidental byproduct of Task 12's mechanical `lfoSettings`→`lfoLinks` rename (see that task's own notes) — so there was no real RED state to reach by writing the test honestly; the 4 new tests passed on first run against unmodified production code. Mutation-checked instead, to prove the tests aren't vacuous: temporarily changed the broadcast call from `{ ...memberOwn, ...patch }` to `{ ...memberOwn, ...value }` (removing the diff, broadcasting the whole new value instead of just the changed field) — both the lane-change and depth-change tests caught it (asserting the untouched field's value), then reverted. The test file's own `SignatureArrayLayer` mock was out of date from before Task 12 (still declared a `lfoSettings` prop and an old `{shape,rate,depth}` payload shape) and needed updating to the real `lfoLinks`/`LfoLink` `{lane,depth}` shape first — split into two probe buttons (`probe-layer-lfo-lane-{idx}`/`probe-layer-lfo-depth-{idx}`) so a lane-only edit and a depth-only edit could be tested independently, matching `diffCompoundField`'s one-changed-key assumption. Full suite green: 4395/4395 (no flaky reruns this pass), `npm run build:types`/`lint` clean.

  **Dependencies:** Task 12.
  **Files:** `CompanyOptionsSection.tsx` (+test).
  **Scope:** S.

- [x] **Task 14: EQ / LPF / HPF panels render inline `LfoLink`s on `globalLfoLinks`**

  **Description:** `AudioRigEffectPanel`: the `lfoFields` branch renders, for each param, the existing `paramRow` followed by an `LfoLink` bound to `globalLfoLinks[param.lfoTarget]` with a per-field stable handler calling `setGlobalLfoLink`; subscribe with `useShallow` to only this block's targets (the existing re-render fix); LPF/HPF pass `heldOff={filterLinksHeldOff}` and render a `HeldOffNote` beneath while held off; EQ never greys. Delete `AudioRigLfoGroup` and its `useLfoTargetGroup`/`Lfo` imports; the `LfoTargetGroup.css` import goes with it (give `LfoLink.css` whatever row styling it needs).

  **Acceptance criteria:**
  - [x] `AudioRigEffectPanel.test.tsx`: EQ renders three param rows each followed by an `LfoLink` showing that target's stored link; choosing a lane on Mid calls `setGlobalLfoLink('eq3.mid', { lane, depth })`; with `filterLinksHeldOff: true` the LPF/HPF links show Off/0 + a note and EQ's do not; a `globalLfoLinks` write to an HPF target does not re-render the EQ panel (existing re-render test adapted); Delay/Reverb/Compressor/Limiter unchanged.
  - [x] `grep -n "AudioRigLfoGroup\|useLfoTargetGroup\|from '@/components/ui/controls/Lfo'" src/components/panels/screen/console/AudioRigDrawer.tsx` returns nothing.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes (RED first).
  - [x] `npm run build:types`, `npm run lint` clean; `npm run dev`: EQ Low on lane a is audible — left for Crawford, not run here.

  **Notes from execution:** Collapsed `AudioRigEffectPanel`'s old 3-way branch (`AudioRigLfoGroup` / compressor hand-composed / plain map) to 2-way (compressor / plain map) — eq3/filterLPF/filterHPF now go through the same generic `block.params.map(paramRow(...))` path as delay/reverb, with `paramRow` taking an optional `ReactNode` appended after the control (the `LfoLink` + conditional `HeldOffNote`, or `undefined` for non-lfoTarget params). This also removed the old two-level DirectionalPanel nesting (an always-column "group" panel wrapping a row-oriented "sliders" panel) that existed only to stack the one shared `Lfo` display beneath the sliders regardless of their own orientation — with no shared display left, `block.panel` alone (already row-oriented for eq3/LPF/HPF) is the only panel needed, and each LfoLink now stacks under its own param's slider inside that param's own `.audio-rig-drawer__param-row` div (plain block-level stacking, no extra CSS). Rewrote `AudioRigEffectPanel.test.tsx`'s old "shared LFO display" and "Audio Load: filterLinksHeldOff" describe blocks for the new per-row shape, replaced the 2 target-switching re-render tests (click-a-row-to-target, keyboard-focus-switches-target — that whole mechanism is gone) with 3 new ones (sibling-target isolation within a block, same-target re-render sanity check, cross-block EQ/HPF isolation), and rewrote the single layout-orientation test that asserted the now-gone "outer group panel is always column" nesting. Also had to add a `vi.mock('../../../../engine/lfoBank', …)` to the test file — `setGlobalLfoLink` (audioStore.ts) calls `lfoBank.ts`'s real `linkTarget` directly, which would otherwise construct a real Tone node without a real AudioContext, the same problem the file's existing `lfoEngine.ts` mock already guards against. Mutation-checked both the `heldOff` wiring (forced `heldOff={false}`, caught by the "greys out LPF" test) and the per-field `setGlobalLfoLink` wiring (forced every field's LfoLink to target `lfoParams[0]`, caught by the "choosing a lane on Mid" test). Full suite green: 4396/4396 (one pre-existing documented flaky real-RNG test — `worldTransition.test.ts`'s swell-clear case — failed once, passed clean on an isolated rerun of that file alone; this task touched none of its import graph). `npm run build:types`/`lint` clean.

  **Dependencies:** Tasks 8, 11.
  **Files:** `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`, `LfoLink.css`.
  **Scope:** S.

- [ ] **Task 15: The LFO Bank accordion replaces Drift**

  **Description:** `audioRigConfig.ts`: replace `LFO_DRIFT_GROUPS`/`LfoDriftGroupSchema` with `LFO_BANK_LANE_SCHEMAS: Record<LfoLaneId, { panel, shape, rate, rateDrift, depthDrift }>` built from the Task 11 keys (`ui.lfo.shape`, `ui.lfo.rate` with `[LFO_RATE_MIN, LFO_RATE_MAX]` step 0.05, `fleet.lfoBank.rateDrift`/`.depthDrift` as centered-zero ±100). New `LfoBankLanePanel.tsx` (`lane` prop; reads `lfoBank[lane]` and `driftHeldOff` from the store, writes via `setLfoBank`; Shape `RadioButton`, Rate `SliderLinear`, two `SliderCenteredZero`s greyed + `HeldOffNote` while drift is held off). `FleetParamsContent.tsx`: group `lfoBank` (nodeId `fleetParams.lfoBank`, content `fleet.lfoBank`, trait `timeSpace`, leaves `fleetParams.lfoBank.a`…`.d` with effect keys `laneA`…`laneD`) inserted between `pacing` and `eqFilters`; `fleetDrift` group and the two drift `renderLeaf` branches deleted; `renderLeaf` maps the four lane keys to `<LfoBankLanePanel lane=… />`. `navTreeConfig.ts`: same subtree swap (lore/human from content). `useNavTree.ts`: `FLEET_PARAMS_GROUPS`, `FLEET_PARAMS_GROUP_FIRST_LEAF` (`lfoBank: 'laneA'`), the leaf-segment map (`a: 'laneA'` …). `uiStore.ts`: `FleetParamsGroup` `'fleetDrift'` → `'lfoBank'`; `SelectedFleetParamsEffect` `'globalDrift' | 'robotDrift'` → `'laneA' | 'laneB' | 'laneC' | 'laneD'`. Delete `FleetDriftPanel` (AudioRigDrawer.tsx) and `RobotDriftPanel` (SignatureArrayDrawer.tsx) and `FleetDriftPanel.test.tsx`; delete the `fleet.drift*` content keys; update `fleet.root`'s human description ("drift" → "modulation lanes").

  **Acceptance criteria:**
  - [ ] `LfoBankLanePanel.test.tsx`: controls bound to `lfoBank.b`; shape change calls `setLfoBank('b', { shape })`, rate `{ rate }`, drifts `{ rateDrift }`/`{ depthDrift }` as fractions; drift rows grey + note while `driftHeldOff`, shape/rate never grey.
  - [ ] `FleetParamsContent.test.tsx`: group order Pacing → LFO Bank → EQ & Filters → Time & Space → Output; the LFO Bank accordion renders an `IntroPanel` then four lane panels; its wrapper carries the `timeSpace` trait style.
  - [ ] `navTreeConfig.test.ts` / `useNavTree.test.ts` / `navPanelViewsAndContent.integration.test.ts`: `fleetParams.lfoBank` with four children and no `fleetParams.fleetDrift`; clicking the group selects `laneA`; clicking `fleetParams.lfoBank.c` selects `laneC`; breadcrumb reads "Fleet Params > LFO Bank > Accent LFO".
  - [ ] `content.test.ts`: no `fleet.drift` key remains; `grep -rn "fleetDrift\|globalDrift\|robotDrift\|LFO_DRIFT_GROUPS\|FleetDriftPanel\|RobotDriftPanel" src` returns nothing.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/LfoBankLanePanel.test.tsx src/components/panels/screen/nav src/data/navTreeConfig.test.ts src/data/audioRigConfig.test.ts src/content` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean; `npm run dev`: the accordion sits between Pacing and EQ & Filters; dragging Core LFO's rate moves every `a` link audibly.

  **Dependencies:** Tasks 8, 11.
  **Files:** `src/data/audioRigConfig.ts` (+test), `LfoBankLanePanel.tsx` (+test), `FleetParamsContent.tsx` (+test), `src/data/navTreeConfig.ts` (+test), `useNavTree.ts` (+test), `uiStore.ts`, `AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, `src/content/copy/fleet.ts`, `FleetDriftPanel.test.tsx` (deleted).
  **Scope:** L — commit in two halves: (15a) schemas + `LfoBankLanePanel`, green on its own; (15b) the group/nav/store swap + deletions. One task because the nav tree, store union and content table must change together (the existing "kept in sync by hand" rule).

### Checkpoint C: Full UI — listen and tune
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual, Crawford (spec §5 "Manual"): four lanes audible and editable; a target's Off stops only that target; two robots' detune on Overtone lock together; Standard greys LPF/HPF pickers; Light greys the four drift rows; a waveform-type change on a robot with a running link survives; `?debug` shows `linksOn` ≈ 20–30. A/B against the pre-branch worktree. **This is where `LFO_BANK_RATE_BANDS` and `LFO_LANE_SEED_BIAS` get tuned by ear** — any retune is a one-constant commit with the Task 5/6 tests updated to match.
- [ ] Review with Crawford before deleting the old world.

---

### Phase 5: Delete the old world, persist, measure, document

- [ ] **Task 16: Delete the old engine and UI primitives; rename `lfoBank.ts` → `lfoEngine.ts`**

  **Description:** Delete `src/engine/lfoEngine.ts`, `lfoEngine.test.ts`, `lfoDrift.ts`, `lfoDrift.test.ts`, `src/systems/robotLfoPriming.ts` (+test), `src/components/ui/controls/Lfo.tsx`/`.css`/`.test.tsx`, `LfoTargetGroup.tsx`/`.css`/`.test.tsx`, `useLfoTargetGroup.ts`/`.test.ts`. `git mv src/engine/lfoBank.ts src/engine/lfoEngine.ts` (and its test); fix the import path in every caller. Remove `robotOptionsActions.applyLayerLfo`, `localeStore`'s `disposeRobotLfos` calls, `audioStore.setGlobalLfo`/`setGlobalLfoDrift` and `applyGlobalAudioToEngine`'s drift loop (their store fields go in Task 17 — this task removes only the engine-touching actions so nothing can reach a deleted module). `LfoSchema`/`'lfo'`/`LfoValue` leave `types/controls.ts`.

  **Acceptance criteria:**
  - [ ] `grep -rn "lfoDrift\.ts\|robotLfoPriming\|LfoTargetGroup\|useLfoTargetGroup\|from '.*controls/Lfo'\|setGlobalLfo\b\|setGlobalLfoDrift\|applyLayerLfo\b\|disposeRobotLfos\|NEUTRAL_LFO_VALUE" src` returns nothing.
  - [ ] `src/engine/lfoEngine.ts` exports the bank surface; `lfoEngine.test.ts` is the Task 7 suite, unchanged but for the path.
  - [ ] No `timelineMap` key starting `lfo-target-group-` is ever set (grep).

  **Verification:**
  - [ ] `npm run build:types` clean (the compiler is the checklist), `npm run lint`, full `npm test` clean, `npm run build` clean.

  **Dependencies:** Tasks 10, 12, 13, 14, 15.
  **Files:** the deletions above; `src/engine/lfoEngine.ts` (renamed) + test; every importer of `@/engine/lfoBank`; `robotOptionsActions.ts`, `localeStore.ts`, `audioStore.ts`, `types/controls.ts`.
  **Scope:** M (many files, all mechanical).

- [ ] **Task 17: Delete the old data fields, seeders and ranges**

  **Description:** `src/types/lfo.ts`: delete `LfoSettings`, `DriftGroupId`, `DRIFT_GROUP_IDS`. `globalAudio.ts`: delete `lfoDrift` from `GlobalAudioSettings` and its default. `Robot.ts`: delete `lfoSettings`. `Company.ts`: delete `CompanyOptionsSnapshot.lfoSettings`; `companyOptions.ts` drops `EMPTY_LFO_SETTINGS`. `audioStore.ts`: delete `globalLfo`, `buildDefaultGlobalLfo`, `regenerateGlobalLfoFromSeed`. `lfoConfig.ts`: delete `DEFAULT_LFO_SETTINGS`. `globalAudioSeed.ts`: delete `generateGlobalLfoSettings`, `LFO_RATE_LOADING_*`/`LFO_DEPTH_LOADING_*` if nothing else reads them (the bank/global-link seeders have their own constants). `spawnSystem.ts`: delete `generateRobotLfoSettings` and the Task 1 oracle test. `globalAudioSeedRanges.ts`/`globalAudioLoadingRanges.ts`: delete the four `lfoDrift.*` keys. `audioDiagnostics`: delete `globalLfosOn/Total`. `sessionDiff.ts`/`sessionShareUtils.ts`/`session.ts` will not compile after this — **this task ends with them patched minimally to compile** (reading `lfoLinks`/`globalLfoLinks`/`lfoBank` in place of the old fields, version still 1); Task 18 does the real persistence work and its tests. Let the compiler enumerate everything else.

  **Acceptance criteria:**
  - [ ] `grep -rn "lfoSettings\|globalLfo\b\|lfoDrift\|LfoSettings\|DriftGroupId\|DEFAULT_LFO_SETTINGS\|generateRobotLfoSettings\|generateGlobalLfoSettings" src` returns nothing (tests included; `globalLfoLinks` is fine).
  - [ ] `lfo.test.ts`, `globalAudio.test.ts`, `lfoConfig.test.ts`, `spawnSystem.test.ts`, `globalAudioSeed.test.ts` updated — no test still asserts a removed field.

  **Verification:**
  - [ ] `npm run build:types` clean, `npm run lint`, full `npm test` clean, `npm run build` clean.

  **Dependencies:** Task 16.
  **Files:** the types/data/seed/store files above and their tests; `sessionDiff.ts`, `sessionShareUtils.ts`, `session.ts` (compile-only patch).
  **Scope:** M (mechanical).

- [ ] **Task 18: Persistence — payload v2, v1 strip, compact share**

  **Description:** `session.ts`: `SessionPayloadVersion = 2`; `lfoBank?`, `globalLfoLinks?`, `RobotAudioOverrideDiff.lfoLinks?` (spec §1.6). `sessionDiff.ts`: `captureSessionPayload` writes `version: 2`, the bank with drifts quantized to 0.01 (`cleanupFloatingPoint`), `globalLfoLinks` whole, and per-robot `lfoLinks` for changed targets only (`deepEqual` against the spawn baseline, keys filtered by `ROBOT_LFO_TARGET_IDS`); `applySessionPayload` strips `globalLfo`, every `robotOverrides[*].lfoSettings` and `globalAudio.lfoDrift` when `version === 1` (typed as `unknown` on the way in), writes bank/global links data-only, applies robot `lfoLinks` via `buildRobotUpdates` and re-primes exactly those targets with `primeRobotLinks(robot, targets)`; when the context is running, pushes the bank and global links through `setLfoBank`/`setGlobalLfoLink` so a loaded session is audible without a power cycle; delete `migrateLfoDrift`. `sessionShareUtils.ts`: `v: 2`, `lb` (`{ s, r, rd, dd }` per lane), `gll`/`ll` (`{ l?, d }` per target, `l` omitted for null); a `v: 1` blob decodes with `lf`/`gl` ignored and everything else intact.

  **Acceptance criteria:**
  - [ ] `sessionDiff.test.ts`: capture → apply round-trip restores bank, global links and a robot's changed links (fixture seeds non-default lane + depth — memory rule); a captured drift of 0.123456 is stored as 0.12; a **real pre-branch v1 fixture** (copied from a session saved on `main`) applies with ADSR/layers/companies restored and the LFO fields at the fresh seed; apply re-primes `[layer1.gain]` only for a one-target override; `migrateLfoDrift` no longer exists.
  - [ ] `sessionShareUtils.test.ts`: v2 round-trip is lossless; a null-lane link encodes without `l`; a v1 blob decodes with `lf`/`gl` dropped; an unknown target key is dropped; the encoded size for a 12-robot world with ≈ 20 links is recorded in the test name or a comment (wire-compaction follow-ups track it).

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts src/utils/sessionShareUtils.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean; `npm run dev`: save, reload, load — links audible immediately; paste a pre-branch share link — world loads, LFOs re-seeded, no console error.

  **Dependencies:** Task 17.
  **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts` (+test), `src/utils/sessionShareUtils.ts` (+test).
  **Scope:** M.

- [ ] **Task 19: Perf measurement — the gate (spec §5)**

  **Description:** `npm run perf` per `docs/PERFORMANCE.md` and the hygiene rules: pre-branch (`08bae3a2`, worktree) vs this branch at Full on `charlie:200:-30` and `bravo:-150:90`, 3 interleaved rounds each, plus one Standard and one Light run on `bravo`; record `linksOn`/`bankRunning` from `?debug`. Dated table in `docs/PERFORMANCE.md` with both commit hashes. No source changes in this task.

  **Acceptance criteria:**
  - [ ] Table recorded (peak window per run + median, overall mean, callback interval, link count).
  - [ ] **Hard gate:** `bravo` Full median peak < 0.9, no interval doubling. **If it fails: stop and report.**
  - [ ] **Success bar:** both worlds' Full median peak ≤ pre-branch (0.413 / 0.443) with every seeded link connected. **If it misses: report the numbers, do not tune anything, continue** — proceeding is Crawford's call.

  **Verification:**
  - [ ] Numbers in `docs/PERFORMANCE.md`; orphaned-Chrome count 0 before and after every run.

  **Dependencies:** Task 18.
  **Files:** `docs/PERFORMANCE.md`.
  **Scope:** S (time, not files).

- [ ] **Task 20: Docs, roadmap, grids, notes**

  **Description:** `docs/AUDIO_SYSTEM.md`: rewrite the LFO Modulation section around the bank (lanes, links, trunk, the two dial flags, `primeLfoBank` → global links → `primeRosterLinks`), the Seeding paragraph (bands, weighted draw with order bias, 30% robot / 66% global on-odds — correcting the Load Fix's "25%"), delete every mention of the cap, held-off, drift pools and phase polling. `docs/reference/ROBOT_DATA_GRID.md`: LFO rows → lane + depth; Phase "Has LFO: No". `docs/reference/GLOBAL_CHAIN_GRID.md`: LFO? column → lane + depth. `docs/PROCEDURAL_GENERATION.md`: one sentence on the spawn-order lane tally. `docs/specs/LFO_LOAD_FIX.md`: one dated "superseded by LFO_BANK.md" note at the top. `docs/specs/FREE_SYNC_TOGGLE.md` + `docs/tasks/FREE_SYNC_TOGGLE.md`: one dated note each — re-plan against the bank (four lane toggles + Delay Time). `docs/todo/roadmap.md`: 17.2.8 entry with "Not Doing" = the intent's out-of-scope list, and a follow-up line for the running-Attenuation-Style-switch re-prime gap (spec §7 risk 8). Tick this file; update the memory note.

  **Acceptance criteria:**
  - [ ] Every doc claim names a file/function that exists after Task 17; no sentence still describes a per-target LFO, a robot-LFO cap, held-off keys, drift groups or a phase target as current.
  - [ ] `grep -rn "lfoDrift\|heldOffLfoKeys\|ROBOT_LFO_CAP\|LfoTargetGroup" docs --include=*.md` hits only archived/superseded specs and the roadmap's history lines.

  **Verification:**
  - [ ] `npm test`, `npm run lint` clean (content guard unaffected). Crawford's read-through.

  **Dependencies:** All.
  **Files:** the docs listed; this file.
  **Scope:** M (docs only).

### Checkpoint D: Complete
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Task 19's hard gate passed; the success-bar result is recorded either way.
- [ ] Crawford's Pixel run at Light.
- [ ] Crawford's final review; then the branch (17.2.7 + 17.2.8 together) goes up as one PR, or two stacked, his call.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A type flip breaks the build across dozens of files in one commit | High | Strangler order: additive fields (8–9), consumers swapped one panel at a time (12–15), deletions last with the compiler as the checklist (16–17). |
| Two engines modulating at once mid-branch | Med (confusing listening) | Task 10 stops priming the old engine; Checkpoints B/C say which panels still reach it; nothing is tuned until Checkpoint C. |
| Depth drift cannot modulate an amplitude at its ceiling | High (silent feature) | Trunk Gain design (spec assumption 4); Task 7 asserts the depth-drift gain value directly. |
| Bank primed after links (links connect to nothing) | High | Task 10's call-order test; `linkTarget` returns false when the lane is missing and `devWarn`s. |
| Lane tally couples seeds to spawn order | Low | Task 9 pins the hand-off; `PROCEDURAL_GENERATION.md` sentence in Task 20. |
| Old sessions/links crash the loader | Med | Task 18's real v1 fixture; v1 strip typed as `unknown`. |
| Seeded bands/bias sound wrong | Med (every world) | Checkpoint C is the tuning point; constants live in one place each with tests that are updated with the retune, never deleted. |
| Perf success bar missed although the hard gate passes | Med | Report-and-continue rule in Task 19; Crawford decides. |
| `LfoLink` per row clutters the EQ panel | Low (Crawford chose inline) | Checkpoint C look; if it reads badly the fallback is a layout tweak inside `LfoLink.css`, not a composition change. |
| Free \| Sync started against stale docs | Low | Task 20's dated notes. |

## Open Questions

None blocking. Spec §7 records Crawford's four answers of 2026-10-01; the only conditionals are Task 19's two bars and the Checkpoint C tuning of the seed constants.
