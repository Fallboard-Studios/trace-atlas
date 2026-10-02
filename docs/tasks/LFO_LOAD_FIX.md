# Implementation Plan: Robot LFO Priming (LFO Load Fix)

> **Superseded (2026-10-01):** every module this plan builds — `primeRobotLfos`/`primeRosterLfos` (`src/systems/robotLfoPriming.ts`), the old per-target `lfoEngine.ts`/`lfoDrift.ts` — was deleted by `docs/tasks/LFO_BANK.md` Task 16, and its own `ROBOT_LFO_CAP_LIGHT/STANDARD/FULL` constants by that plan's Task 2. Priming is now `primeRobotLinks`/`primeRosterLinks` (`src/systems/robotLfoLinks.ts`); there is no robot-LFO cap at all. Kept for the task-by-task execution history and the perf-measurement method its own Task 11 established (`docs/PERFORMANCE.md`), which the Bank's Task 19 gate reused rather than re-deriving.

Source spec: [docs/specs/LFO_LOAD_FIX.md](../specs/LFO_LOAD_FIX.md) (amended 2026-09-30 with Crawford's four decisions: drop the `volume` and `layerN.pulseWidth` LFO targets, lower the seed odds to 25% on, keep Full's cap unlimited pending measurement, do it now). No intent file. Roadmap slot: 17.2.7 (added in Task 12).

> Process note: the `planning-and-task-breakdown` skill asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house TDD rhythm: RED test first, one commit per task, mutation-check at the gates named below, stop and report at every checkpoint.

## Overview

Make seeded robot LFOs actually run. Twelve tasks in three phases. Phase 1 shrinks the surface first — removes the Volume LFO and the pulse-width LFO target consumer by consumer while the type still allows them (each commit green), then narrows the type, then lowers the seed odds — so that Phase 2's priming primes the *final* target set and the listening pass hears the sound that ships. Phase 2 adds `primeRobotLfos` and wires it into every voice-reservation point. Phase 3 is the perf gate that decides whether Full still needs a cap, then docs. Nothing changes a budget cap or the global chain.

## Architecture Decisions

- **Removals before priming.** Priming 13 targets and then removing 4 would mean two listening passes and a throwaway measurement. Shrink first.
- **Remove consumers before narrowing the type.** Narrowing `RobotLfoTargetId` first would break the build across ~12 files in one commit (an XL task). Removing each consumer's use while the members still exist keeps every commit compiling; the type narrowing (Task 4) then has only leftovers to fix, and the compiler lists them.
- **Oracle before the odds change (Task 1).** Shapes, depths and non-quiet rates must be byte-identical after the threshold moves; capture them while they still are.
- **One shared apply helper** (`applyRobotLfoToEngine`) used by both the existing user-edit path and the new priming path, so the "rate > 0 means requested" rule exists once.
- **Round-robin request order** across the roster (spec §1.2) because request order is the Load Budget's priority order.
- **Perf gate is a stop-and-report, not a tuning knob.** If Full saturates after the shrink, a finite Full cap is Crawford's decision (spec assumption 3).
- **No Free | Sync coupling.** This lands first; that phase's docs get a one-line count correction in Task 12.

## Dependency Graph

```
Task 1 (robot seed oracle — capture current output)        [independent, must precede Task 5]
Task 2 (remove Volume LFO frame: robot Output section)     [independent]
Task 3 (remove Volume LFO: company side + actions/config)  ← 2
Task 4 (remove pulseWidth lfoTarget: config + engine branches)   [independent]
Task 5 (narrow RobotLfoTargetId to 9; loader filters; quiet odds 0.75)  ← 1, 2, 3, 4
   ── Checkpoint A ──
Task 6 (robotLfoPriming.ts + applyLayerLfo routed through it)   ← 5
Task 7 (spawnRobot / reRegisterAllRobotsAudio / applyLayersStructural call priming)  ← 6
Task 8 (AudioEngine.start post-load pass primes roster)          ← 6
Task 9 (applySessionPayload primes overridden targets)           ← 6
Task 10 (engine integration: held-off order, idempotence, stale rewire)  ← 6, 7
   ── Checkpoint B (listen) ──
Task 11 (perf measurement — the Full-cap gate)                   ← 10
Task 12 (docs, roadmap, grid, archived-spec note, Free | Sync note)  ← all
   ── Checkpoint C ──
```

Parallelisable: 1 ‖ 2 ‖ 4; 7 ‖ 8 ‖ 9.

## Task List

### Phase 1: Shrink the surface — two targets out, odds down

- [ ] **Task 1: Capture the robot-seed oracle before anything moves**

  **Description:** Add a test to `spawnSystem.test.ts` that pins the *current* `generateRobotLfoSettings(noiseMap, offset)` output for a fixed noise map at two offsets as inline expected objects — but asserting only the fields that must survive Task 5: every target's `shape` and `depth`, and `rate` for every target that is currently non-quiet (quiet ones are asserted `rate: 0` *or* equal to the captured value, since lowering the odds can only turn an on-target off, never the reverse). Written GREEN against today's code; the file comment says regenerating these expectations is a spec violation (spec §5 "Seed odds").

  **Acceptance criteria:**
  - [ ] Two complete-object assertions over all 13 current targets, using an offset not used by neighbouring tests.
  - [ ] The assertion shape distinguishes "must be identical" (shape, depth, on-rates) from "may become 0" (rates), so Task 5 can pass without editing it.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` passes.

  **Dependencies:** None (must precede Task 5).
  **Files:** `src/systems/spawnSystem.test.ts`.
  **Scope:** XS.

- [ ] **Task 2: Remove the Volume LFO frame from the robot Output section**

  **Description:** `AudioSettingSection.tsx` drops the `Lfo` render, `useLfoTargetGroup`, `HeldOffNote`, and the `volumeLfo`/`onVolumeLfoChange`/`volumeLfoHeldOff` props (Mode + Volume stay, same column layout, same trait style). `RobotOptionsTab.tsx` drops the `volumeLfoHeldOff` selector, the `volumeLfo` field of `audioSettingValue`, and `handleVolumeLfoChange`. `VOLUME_LFO_TARGET` still exists (Task 3 removes it) so the tree compiles.

  **Acceptance criteria:**
  - [ ] `AudioSettingSection` renders the Mode radio and the Volume slider and no `.sc-lfo` element; its props type has no `volumeLfo*` members (a `// @ts-expect-error` case).
  - [ ] `RobotOptionsTab` no longer subscribes to `heldOffLfoKeys` for a volume key (spy on the selector or assert no `:volume` key is ever read).
  - [ ] Existing Mode/Volume behaviour tests unchanged.

  **Verification:**
  - [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/panels/screen/console/RobotOptionsTab.test.tsx` passes (RED first: the "no Lfo" assertion).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.
  **Files:** `AudioSettingSection.tsx`, `AudioSettingSection.test.tsx`, `RobotOptionsTab.tsx`, `RobotOptionsTab.test.tsx`.
  **Scope:** M.

- [ ] **Task 3: Remove the Volume LFO from the company side, actions and config**

  **Description:** `CompanyOptionsSection.tsx` drops the volume-LFO handler, the `volumeLfo` entry of `DISABLED_AUDIO_SETTING` and the `volumeLfo` snapshot patch; `Company.ts` deletes `CompanyOptionsSnapshot.volumeLfo`; `companyOptions.ts` stops resolving it; `robotOptionsActions.ts` deletes `applyVolumeLfo`; `robotOptionsConfig.ts` deletes `VOLUME_LFO_TARGET`. A stored user-created company object that still carries `options.volumeLfo` (old sessions) is left alone at runtime — the field is simply never read.

  **Acceptance criteria:**
  - [ ] `grep -rn "volumeLfo\|VOLUME_LFO_TARGET\|applyVolumeLfo" src --include=*.ts --include=*.tsx` returns nothing (tests included).
  - [ ] Company Output section renders Mode + Volume; a layer-LFO broadcast still patches exactly one field per member (existing tests).
  - [ ] A session fixture with a user-created company carrying `options.volumeLfo` applies without error (`sessionDiff.test.ts`).

  **Verification:**
  - [ ] `npx vitest run src/components/company src/systems/companyOptions.test.ts src/systems/robotOptionsActions.test.ts src/utils/sessionDiff.test.ts` passes (RED first for the fixture case).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.
  **Files:** `CompanyOptionsSection.tsx` (+test), `src/types/Company.ts`, `src/systems/companyOptions.ts`, `src/systems/robotOptionsActions.ts`, `src/data/robotOptionsConfig.ts`.
  **Scope:** M.

- [ ] **Task 4: Remove the pulse-width LFO target from the config and the engine branches**

  **Description:** `robotOptionsConfig.ts`: the `pulseWidth` param in `makeLayerBlock` loses its `lfoTarget` (and the `pulseWidthTarget` local); the slider itself is unchanged. `AudioEngine.getRobotModulationTarget` drops its `pulseWidth` branch and its `volume` branch (Task 3 removed the last caller of the latter); a stale string now resolves `null` + `devWarn`, never a throw. `lfoEngine.ts`: `ROBOT_LFO_FIELD_RANGE` loses `volume` and `pulseWidth`, `resolveLfoOutputRange`'s regex becomes `(gain|detune)`, the comment block at ~line 454 about pulseWidth-on-non-pulse-layers is deleted. Type members still exist until Task 5.

  **Acceptance criteria:**
  - [ ] Each `SIGNATURE_ARRAY_CONFIG` layer block has exactly 3 params carrying `lfoTarget` (gain/detune/phase) and the pulse-width param has none (`robotOptionsConfig.test.ts`); `SignatureArrayDrawer` renders a 3-field LFO group per layer and still renders/edits the pulse-width slider.
  - [ ] `getRobotModulationTarget` returns `null` for `'volume'` and `'layer0.pulseWidth'` on a reserved robot and resolves gain/detune as before.
  - [ ] `resolveLfoOutputRange` returns `null` for the two removed targets and unchanged ranges for gain/detune.

  **Verification:**
  - [ ] `npx vitest run src/data/robotOptionsConfig.test.ts src/components/robot/SignatureArrayDrawer.test.tsx src/engine/AudioEngine.test.ts src/engine/lfoEngine.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.
  **Files:** `src/data/robotOptionsConfig.ts` (+test), `SignatureArrayDrawer.test.tsx`, `src/engine/AudioEngine.ts` (+test), `src/engine/lfoEngine.ts` (+test).
  **Scope:** M.

- [ ] **Task 5: Narrow `RobotLfoTargetId` to 9; loader filters; quiet odds 0.5 → 0.75**

  **Description:** `src/types/lfo.ts`: the union and `ROBOT_LFO_TARGET_IDS` become the 9 `layer{0,1,2}.{gain,detune,phase}` members, doc comments updated (13 → 9; "Has LFO" rows). Let `npm run build:types` enumerate leftovers (test fixtures with 13 keys, `lfoConfig` count comment, `audioBudget.ts`'s "ceiling" comment) and fix each mechanically. Add the two loader filters: `buildRobotUpdates` (sessionDiff) and `fromCompactLfoSettingsMap` (sessionShareUtils) keep only keys in `ROBOT_LFO_TARGET_IDS`. Then `spawnSystem.ts`: `LFO_QUIET_THRESHOLD` 0.5 → 0.75 with its comment rewritten (25% on; spec §1.4).

  **Acceptance criteria:**
  - [ ] `lfo.test.ts`: `ROBOT_LFO_TARGET_IDS` is exactly the 9 members, no duplicates; `DEFAULT_LFO_SETTINGS` has 9 + 7 = 16 entries.
  - [ ] A payload with `lfoSettings` keys `volume` and `layer1.pulseWidth` applies with those keys absent from the robot and the known keys intact; same for a compact map through `fromCompactLfoSettingsMap`.
  - [ ] Task 1's oracle passes unchanged; over 50 seeded robots the per-target on-rate is within [15%, 35%]; a target quiet under 0.5 is quiet under 0.75 for the same draw (monotone).
  - [ ] `grep -rn "pulseWidth" src/engine src/types/lfo.ts` returns no LFO-target reference (swell attributes in `audioSwell*` are expected and untouched).

  **Verification:**
  - [ ] `npx vitest run src/types/lfo.test.ts src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/utils/sessionShareUtils.test.ts` passes (RED first for the filters and the odds).
  - [ ] `npm run build:types`, `npm run lint`, full `npm test` clean. Mutation check: set the threshold back to 0.5 and watch the [15%, 35%] case go red.

  **Dependencies:** Tasks 1, 2, 3, 4.
  **Files:** `src/types/lfo.ts`, `src/types/lfo.test.ts`, `src/utils/sessionDiff.ts` (+test), `src/utils/sessionShareUtils.ts` (+test), `src/systems/spawnSystem.ts` (+test), plus whatever the compiler lists.
  **Scope:** M.

### Checkpoint A: Surface shrunk, nothing primes yet
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual: `npm run dev` — robot Output shows Mode + Volume only; each Signature Array layer's LFO group offers Gain/Detune/Phase; a pre-branch session loads.
- [ ] Review with Crawford before proceeding.

---

### Phase 2: Priming

- [ ] **Task 6: `src/systems/robotLfoPriming.ts` — `applyRobotLfoToEngine`, `primeRobotLfos`, `primeRosterLfos`; `applyLayerLfo` routed through it**

  **Description:** Exactly spec §1.1/§1.2/§4: the shared apply helper (shape/rate/depth setters, connect+start on `rate > 0`, else disconnect+stop); `primeRobotLfos(robot, targets = ROBOT_LFO_TARGET_IDS)`; `primeRosterLfos(robots)` iterating targets-outer / robots-inner. `robotOptionsActions.applyLayerLfo` becomes store write + `applyRobotLfoToEngine` (behaviour identical).

  **Acceptance criteria:**
  - [ ] Robot with 2 on / 7 off: exactly 2 `connectLfoTarget` each followed by `start`; 7 `disconnectLfoTarget` + `stop`; 9 × 3 setters with stored values; no `lfoSettings` → no calls; `connectLfoTarget` returning false skips `start` for that target only.
  - [ ] `primeRosterLfos` of 3 robots emits `connectLfoTarget` in the order `[r1.layer0.gain, r2.layer0.gain, r3.layer0.gain, r1.layer0.detune, …]` for a fixture where those are on.
  - [ ] `applyLayerLfo`'s existing tests pass unchanged and it now calls the shared helper (spy).

  **Verification:**
  - [ ] `npx vitest run src/systems/robotLfoPriming.test.ts src/systems/robotOptionsActions.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.
  **Files:** `src/systems/robotLfoPriming.ts`, `src/systems/robotLfoPriming.test.ts`, `src/systems/robotOptionsActions.ts` (+test).
  **Scope:** S.

- [ ] **Task 7: Call priming from `spawnRobot`, `reRegisterAllRobotsAudio`, `applyLayersStructural`**

  **Description:** `spawnRobot`: `primeRobotLfos(robot)` after a successful `reserveVoice` (inside the same try/catch; a priming failure `devWarn`s and never blocks `registerRobotMelody`). `reRegisterAllRobotsAudio`: `primeRosterLfos(robots)` once after the reserve loop. `applyLayersStructural`: `primeRobotLfos(robot)` after `reReserveVoice` (this is the stale-signal fix).

  **Acceptance criteria:**
  - [ ] `spawnRobot` primes once after a successful reserve and not at all when reserve throws; melody registration happens either way.
  - [ ] `reRegisterAllRobotsAudio` calls `primeRosterLfos` exactly once, after every `reserveVoice`.
  - [ ] `applyLayersStructural` calls `primeRobotLfos` after `reReserveVoice`; `applyLayersContinuous` does not prime.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/systems/robotOptionsActions.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.
  **Files:** `src/systems/spawnSystem.ts` (+test), `src/systems/robotOptionsActions.ts` (+test).
  **Scope:** S.

- [ ] **Task 8: `AudioEngine.start()` primes the roster after the post-load reservation pass**

  **Description:** After the existing "robots spawned before AudioEngine initialized" reservation loop and after the global priming loop, dynamic-import `robotLfoPriming` (same pattern as the `audioStore` import a few lines above, same reason) and call `primeRosterLfos(getActiveLocaleRobots())`, in its own try/catch with `devWarn`.

  **Acceptance criteria:**
  - [ ] With two pre-spawned robots, `start()` primes the roster once, after both reservations and after the global loop (call-order assertion).
  - [ ] With no robots, no priming call; a priming throw does not fail `start()`.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean; `npm run dev` power-on shows no console error (import cycle check).

  **Dependencies:** Task 6.
  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`.
  **Scope:** S.

- [ ] **Task 9: `applySessionPayload` primes the overridden targets**

  **Description:** In the robot-override loop, when `diff.lfoSettings` is present, call `primeRobotLfos(updatedRobot, Object.keys(diff.lfoSettings) filtered to ROBOT_LFO_TARGET_IDS)` after `updateRobot` and `regenerateMelody` (the robot's voice already exists — `retransmitWorld` spawned it, which primed the seed baseline; this re-primes only what changed).

  **Acceptance criteria:**
  - [ ] A payload overriding one robot's `layer1.gain` primes exactly `[layer1.gain]` for that robot; a payload with no LFO override primes nothing extra; dropped legacy keys never reach `primeRobotLfos`.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionDiff.test.ts` passes (RED first).

  **Dependencies:** Task 6.
  **Files:** `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`.
  **Scope:** XS.

- [ ] **Task 10: Engine integration — held-off order, idempotence, stale-signal rewire**

  **Description:** With the real `lfoEngine` and the mocked Tone the existing `lfoEngine.test.ts` uses, exercise priming end to end: a 2-robot roster under a policy allowing 3, raise the policy, re-prime, rebuild a voice.

  **Acceptance criteria:**
  - [ ] After `primeRosterLfos` under a cap of 3, `getHeldOffLfoKeys()` lists the 4th-and-later requests in round-robin order; raising the cap admits them in that order.
  - [ ] A second `primeRobotLfos` of the same robot adds no `requested` entries and triggers no second `.connect()` on an already-connected signal.
  - [ ] After the target resolver returns a new signal object for the same key (a rebuilt voice), one `primeRobotLfos` disconnects the old and connects the new (the stale branch in `connectOne`).

  **Verification:**
  - [ ] `npx vitest run src/engine/lfoEngine.test.ts src/systems/robotLfoPriming.test.ts` passes (RED first). Mutation check: make `primeRosterLfos` iterate robots-outer and watch the order case go red.

  **Dependencies:** Tasks 6, 7.
  **Files:** `src/engine/lfoEngine.test.ts` (or a new `robotLfoPriming.integration.test.ts` beside it).
  **Scope:** S.

### Checkpoint B: It runs — listen
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual, Crawford: power on a fresh world at Full on desktop and hear robot modulation untouched; drop to Light and watch panels grey in round-robin order; change a layer's waveform type on a robot with a running LFO and hear it survive; load a session with an LFO override and hear it immediately. Keep the pre-branch build for A/B by ear.
- [ ] Review with Crawford before proceeding — this is where the odds (25%) get a yes or a tweak.

---

### Phase 3: The gate, then docs

- [x] **Task 11: Perf measurement — the Full-cap gate (spec assumption 3)**

  **Description:** `npm run perf` per `docs/PERFORMANCE.md` and the measurement-hygiene rules (foreground, one call at a time, no orphaned Chrome, same-session A/B): pre-branch vs this branch at Full on `charlie:200:-30` and `bravo:-150:90`, plus Standard and Light once each on `bravo`; note the primed-LFO count from the `?debug` overlay. Record a dated table in `docs/PERFORMANCE.md`.

  **Acceptance criteria:**
  - [x] Table recorded with commit hashes for both builds, 3 runs each at Full.
  - [x] **Gate:** `bravo` at Full peaks below 0.9 render capacity with no interval doubling. **If it fails: stop and report** — a finite Full cap is Crawford's decision.

  **Verification:**
  - [x] Numbers in `docs/PERFORMANCE.md`.

  **What actually happened (deviation from "no source changes in this task"):** the first measurement found the gate failing badly (`bravo` and `charlie` both ≈0.995–0.998, see `docs/PERFORMANCE.md` "Robot-LFO priming — the Task 11 perf gate"). Per this task's own instruction that would normally mean stop and report — a finite Full cap is Crawford's decision, not a tuning knob. Crawford was live in the session, reviewed the finding, and said "go for it" to both propose a specific cap and implement it, superseding the plan's written caution for this run. `ROBOT_LFO_CAP_FULL` (commit `df689ba8`) was added and TDD'd against `audioBudget.test.ts`/`audioBudgetSystem.test.ts`, then the measurement was re-run against the fix and the gate passes with a wide margin (`bravo` peak window median 0.443). The table in `docs/PERFORMANCE.md` records both the failing pre-fix result and the passing post-fix result.

  **Dependencies:** Task 10.
  **Files:** `docs/PERFORMANCE.md`, `src/constants/index.ts`, `src/utils/audioBudget.ts` (+tests), `src/systems/audioBudgetSystem.test.ts`.
  **Scope:** S (time, not files) — exceeded: a product fix was needed.

- [x] **Task 12: Docs, roadmap, grid, notes**

  **Description:** `docs/AUDIO_SYSTEM.md`: correct the Seeding paragraph (robot LFOs *are* primed at spawn/power-on/rebuild/session load, 9 targets, 25% on), document `robotLfoPriming` beside the global loop. `docs/reference/ROBOT_DATA_GRID.md`: Volume and Interval rows "Has LFO: No". `docs/specs/archive/AUDIO_LOAD_BUDGET.md`: one dated note on the "not connected at spawn" survey line. `docs/specs/FREE_SYNC_TOGGLE.md`: one dated note that robot targets are now 9 across 3 panels and its plan's Task 13 loses the Volume caller. `docs/todo/roadmap.md`: 17.2.7 entry, "Not Doing" = finite Full cap (unless Task 11 said otherwise), control-rate robot LFOs, global odds. Tick this file.

  **Note on "Not Doing":** Task 11 did find a need for a finite Full cap, so that item isn't in roadmap 17.2.7's "Not Doing" list — the cap itself is the shipped work, recorded there and in `docs/PERFORMANCE.md`.

  **Acceptance criteria:**
  - [x] Every doc claim names a file/function that exists; no sentence still says seeded robot LFOs are silent or that there are 13 robot targets.

  **Verification:**
  - [x] `npm test`, `npm run lint` clean (content guard unaffected). Crawford's read-through still pending.

  **Dependencies:** All.
  **Files:** the docs listed; this file.
  **Scope:** M (docs only).

### Checkpoint C: Complete
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Task 11's gate passed (or the finite-cap decision was taken and recorded in the spec).
- [ ] Crawford's Pixel run at Light (his, when he gets to it) — Light's cap of 4 is now reached on load.
- [ ] Crawford's final review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Type narrowing breaks the build mid-phase | Med | Consumers removed first (Tasks 2–4); Task 5 narrows with only leftovers; the compiler is the checklist. |
| Odds change perturbs shapes/depths/on-rates | High (every world) | Task 1 oracle, captured before Task 5, asserted unchanged. |
| Full saturates even at ≈ 18 primed | Med | Task 11 is a hard gate with a documented fallback (finite Full cap); never tuned silently. |
| Old sessions carry dead LFO keys | Low | Task 5's two loader filters + fixtures; re-save drops them. |
| Priming constructs nodes before audio is ready | High (throws in tests/boot) | Priming only at the five post-reservation sites; `AudioEngine.start()` path uses the existing dynamic-import seam. |
| Round-robin order silently changes if `ROBOT_LFO_TARGET_IDS` is reordered | Low | Task 6/10 pin the sequence. |
| Overlap with Free | Sync in `applyLayerLfo` / `AudioEngine.start()` | Low | This lands first; Task 12 leaves a note in that spec. |

## Open Questions

None blocking. Spec §7 records Crawford's four decisions of 2026-09-30; the only conditional is Task 11's gate.
