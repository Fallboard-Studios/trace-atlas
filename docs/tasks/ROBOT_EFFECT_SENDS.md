# Implementation Plan: Robot Effect Sends — Grit, Shimmer and Double

Spec: [docs/specs/ROBOT_EFFECT_SENDS.md](../specs/ROBOT_EFFECT_SENDS.md). Intent:
[docs/intent/robot-effect-sends.md](../intent/robot-effect-sends.md). Proposed roadmap **50.7**. Branch
`feature/palette-effect-sends` (a proposed name; Crawford creates it), off `main` **after the Classic Band Retune
merges** ([docs/tasks/CLASSIC_BAND_RETUNE.md](CLASSIC_BAND_RETUNE.md), spec §6 step 1).

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`,
`npm run perf:audio`; the phone gate is the `?debug` HUD on the Pixel (spec §5).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: T0 DONE (2026-10-21); next T1.** Unblocked. The retune merged at `2dc5b4a2` (PR #567) and the spec's
> assumption 6 and §1.1 carry its Reverb band (0.1–0.6); the colour Mix it merged with is one shared 0.1–0.2 band under a
> 0.25 ceiling. All seven spec §7 questions are answered: Q1 the room-depth second look is T20's; Q3 parallel; Q4 fed AND
> Return > 0; Q6 Chorus/Shifter stay under Modulation, Colour gains a Room sub-tab; Q7 accept as specced (Q2 and Q5 were
> answered at the spec). The build branch is **`feature/robot-effect-sends`** (Crawford's, off `main` at `2dc5b4a2`),
> not the proposed `feature/palette-effect-sends` named above.
>
> **Status, 2026-10-21: Phase 1 (T1–T8) BUILT** on `feature/robot-effect-sends`, one commit per task (`a2991039` to
> `0de3fc06`). Types, lint and the full suite are clean. **Next: Checkpoint A** — the dev-server and by-ear checks and Crawford's
> review, before Phase 2. Deviations from the plan are recorded under "Phase 1 as shipped" after Checkpoint A.
> Checkpoint A passed (Crawford, 2026-10-21).
>
> **Status, 2026-10-21: Phase 2 (T9–T11) BUILT**, one commit per task (`0bc261ce`, `67941c69`, `483d7730`). Types and
> lint are clean; the full suite is 13 708 green plus the documented `sceneToOrbiterLocal` 5 s timeout. **Next:
> Checkpoint B** — the dev-server by-ear checks and Crawford's review, before Phase 3. Deviations are under "Phase 2 as
> shipped" after Checkpoint B. Checkpoint B passed (Crawford, 2026-10-21); next is Phase 3, T12.
>
> **Status, 2026-10-21: Phase 3 (T12–T16) BUILT**, one commit per task (`0b80fc01`, `885d9738`, `f49d6a98`,
> `6ed1f89a`, `c506fbb2`). Types, lint (0 errors) and `npm run build` are clean; the full suite is 13 925 green plus the
> documented `sceneToOrbiterLocal` 5 s timeout, which passes alone. **Next: Checkpoint C** — the dev-server checks and
> Crawford's review, before Phase 4. Deviations are under "Phase 3 as shipped" after Checkpoint C.

## Overview

Twenty-two tasks in six phases. **Phase 1** is the engine and the data under it, nothing visible: the send band table
and the typed loading table, the Colour room's settings block, the room machinery in `bypassCell.ts`, the three rooms
built and wired in `globalFx.ts`, the per-robot send gains and feeder sets, the priming sites, the seeded spread and the
global seeder's changes. **Phase 2** is the robot-screen vertical slice: six actions, content and schemas, three slider
rows, audible on one robot at Checkpoint B. **Phase 3** adds swells, companies and persistence. **Phase 4** is the
drawer (the Colour Room sub-tab and the two relabelled Returns). **Phase 5** is the guard test, the desktop probes,
Crawford's tuning listen and the phone gate. **Phase 6** is docs. Every task leaves types, lint and the suite green
(the guard's living-doc cases excepted, red from T18 to T22 as the house practice); RED first; one commit per task;
mutation check at the named gates.

## Architecture Decisions

- **The chain is never broken between tasks.** The five effects leave the dry chain only in T4, in one commit, with the
  rooms built in the same commit, so no task ships a chain with a missing stage. Between T4 and T7 nobody sends into the
  new rooms, so the Colour trio, the Chorus and the Shifter are silent in every world (the ROBOT_SENDS.md plan had the
  same echo-less window between its T2 and T5). Nobody listens until Checkpoint A.
- **`RETURN_FIELD_KEYS` grows task by task.** The typed loading table (spec assumption 5) excludes a key only once
  nothing samples it: T1 excludes `reverb.wet` and `delay.wet` (the send table takes them), T2 adds `colourRoom.wet`
  (never sampled), T8 adds `chorus.wet` and `frequencyShifter.wet` when the seeder stops drawing them. Each step compiles.
- **Defaults flip with the engine, not before.** `chorus.wet` / `frequencyShifter.wet` default to 1 in T8, after T4
  has made them Returns; flipping them in T2 would mean a fully wet chain Chorus for any payload that fills from
  defaults in between.
- **The Colour room's setter exists before its room.** `setGlobalColourRoom` lands in T2 as a clamped no-op without a
  room (the `EffectKey` map needs an entry the moment the block exists); T4 points it at `setRoomReturn('grit', …)`.
- **The room is the cell with `dry: null` (spec assumption 2).** T3 generalises `Cell` rather than adding a second
  crossing protocol; `writeCellMix`, the timer and `connectEffect` / `disconnectEffect` serve branches unchanged. The
  branch law `branchGains` is wet-only. Parallel Colour room, pending spec §7 Q3.
- **Liveness has two drivers (spec assumption 3), one function.** `roomLive(room) = fed && returnLevel > 0`; the engine
  owns `fed` through feeder sets keyed by room, the setters own `returnLevel`; both call `syncRoom`. Pending §7 Q4.
- **Explicit prime at every reservation site, no widened `reserveVoice`** (the 50.2 pattern). `updateRobotSends` takes
  all five keys; the source-scan test extends to five fields.
- **Seeding has one helper** (`generateRobotSends` for both `spawnRobot` and the baseline), reads the send table only,
  keeps the Reverb and Delay draws byte-identical (T1's parity test), and rolls the three new sends uniformly in a fixed
  order with a one-of-three cap (spec assumption 7; the roll shape pending §7 Q7).
- **Store is the source of truth; the engine is primed from it.** The five sends live on `Robot` in `localeStore`; the
  send gains, rooms, feeder sets and timers are module state.
- **Ordering.** Tables (T1) and the settings block (T2) before anything that names them; the pure room module (T3)
  before the chain rewire (T4); fields and gains (T5) before primes (T6) before the seeded spread (T7); the global seeder
  (T8) after T4 so `wet: 1` means Return. Content and schemas (T10) are independent of T9 and may land in parallel.
  Persistence (T15–T16) waits for T6 (the restore test asserts the prime) and T12 (the swell base value).

## Dependency Graph

```
T0 retune amendment + answers (STOP) ──────────────────────────────────────────────────────────────────┐
T1 send table + typed loading table ─┬─► T5 Robot fields, send gains, feeders ─► T6 priming sites ──┐    │
T2 colourRoom block + stub setter ───┤                 │                                           │    │
T3 room machinery (bypassCell) ──────┴─► T4 rooms built and wired (chain −5)                      │    │
                                               │              │                                    │    │
                                               │              └─► T8 global seeder ◄───────────────┤    │
                                               └────────────────► T7 seeded spread (needs T1, T5) ─┴─► Checkpoint A
T10 content + schemas ─┐
T5 ─► T9 actions ──────┴─► T11 AudioSettingSection rows + RobotScreen ─► Checkpoint B
                                        │
T12 swell pool (needs T9) ─► T13 swell flags + cancel (needs T11) ─┬─► T14 company (needs T9, T11, T13)
                                                                   └─► T15 session diff / restore / prime (needs T6, T7, T12) ─► T16 share codec
                                                                                       │
                              T17 drawer (needs T2, T4; §7 Q6) ◄───────────────────────┤
                                                                                       ▼
                                                          Checkpoint C ─► T18 guard test ─► T19 desktop probes ─► T20 Crawford's listen + tuning (STOP)
                                                                                                   ─► T21 phone gate (STOP) ─► T22 docs ─► Complete
```

T1, T2 and T3 are independent of each other; T10 is independent of everything before Checkpoint B; T14, T15 and T17 may
run in parallel sessions after T13 but never touch the same file in one commit (`useCompanyOptions.ts` is T14's,
`sessionDiff.ts` T15's, `audioRigConfig.ts` T17's).

## Phase 0: Gate

### Task 0: The retune amendment and Crawford's answers — **STOP**

**Description:** Part A, once `CLASSIC_BAND_RETUNE.md` has merged: re-state the spec's assumption 6 table against the
merged `GLOBAL_AUDIO_LOADING_RANGES` (the Reverb band from the retune's row 15; the Colour Mix bands and ceiling from its
Decision 1), one commit touching only `docs/specs/ROBOT_EFFECT_SENDS.md` and this file's status line. Part B: record
Crawford's answers to spec §7 questions 1, 3, 4, 6 and 7 in the spec (the "Answered" convention) and here. If an answer
is blank, the tasks it gates wait; do not pick for him.

**Acceptance criteria:**
- [ ] The spec's assumption 6 table cites the retune's merge commit and carries its Reverb band.
- [ ] Each of Q1, Q3, Q4, Q6, Q7 has an "Answered" line, or is listed below as still blocking its tasks: Q3 → T3/T4;
  Q4 → T3/T5; Q7 → T7/T8; Q6 → T17; Q1 → T20.

**Verification:** docs only; `npm run lint` unaffected.

**Dependencies:** the retune's merge. **Files:** `docs/specs/ROBOT_EFFECT_SENDS.md`, this file. **Scope:** XS.

## Phase 1: Engine and data (nothing visible)

### Task 1: The send band table and the typed loading table

**Description:** New `src/data/robotSendLoadingRanges.ts`: `ROBOT_SEND_FIELDS`, `RobotSendField`, `SendLoadingRange
{ min, max, lit }`, `ROBOT_SEND_LOADING_RANGES` (five rows, spec §1.1; the Reverb and Delay rows carry the merged
loading-table values and `lit` 1 / 0.75), `EXCLUSIVE_SEND_FIELDS`, `SEND_FIELD_ROOM`. In `globalAudioSeedRanges.ts`:
`RETURN_FIELD_KEYS = ['reverb.wet', 'delay.wet']` for now, `ReturnFieldKey`, `LoadingRangeKey`. The loading table becomes
`Record<LoadingRangeKey, LoadingRange>` and loses its two `wet` rows; `sampleField` takes a `LoadingRangeKey`.
`generateRobotSends` and its fallback read the new table for Reverb and Delay with the same dataIds, draws and
`composeSends` shape (the quiet roll is `< 1 − lit`); `SEND_DELAY_QUIET_THRESHOLD` is deleted from `constants/index.ts`.

**Acceptance criteria:**
- [ ] **Parity:** for a fixed roster with a non-default fixture, every robot's `reverbSend` and `delaySend` equal, value
  for value, the numbers the branch base seeds (recorded in the test from a run on the base before the change).
- [ ] `GLOBAL_AUDIO_LOADING_RANGES` has no `reverb.wet` / `delay.wet` row; assigning one is a compile error
  (`// @ts-expect-error` case); `GLOBAL_AUDIO_SEED_RANGES` still has both keys at 0–1 step 0.01.
- [ ] Every send row has `min ≤ max` inside `[SEND_MIN, SEND_MAX]` and `lit` in `(0, 1]`; `EXCLUSIVE_SEND_FIELDS` is the
  three new fields in roll order; `SEND_FIELD_ROOM` maps them to `grit` / `shimmer` / `double`.

**Verification:**
- [ ] `npx vitest run src/data/robotSendLoadingRanges.test.ts src/data/globalAudioLoadingRanges.test.ts src/systems/spawnSystem.test.ts src/utils/globalAudioSeed.test.ts`
- [ ] `npm run build:types && npm run lint`.

**Dependencies:** None (T0 part A only moves numbers this task transcribes). **Files:** `src/data/robotSendLoadingRanges.ts`
(+ test), `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioLoadingRanges.ts` (+ test), `src/systems/spawnSystem.ts`
(+ test), `src/constants/index.ts`. **Scope:** M.

### Task 2: The `colourRoom` settings block and its stub setter

**Description:** `ColourRoomSettings { wet }`, `GlobalAudioSettings.colourRoom`, default `{ wet: 1 }`,
`GlobalAudioSeedFieldKey` + `'colourRoom.wet'` (0–1, linear, step 0.01) and `RETURN_FIELD_KEYS` + `'colourRoom.wet'`;
`withGlobalAudioDefaults` fills it; the three transmission presets carry it; `sessionDiff.ts` quantises it at two
decimals beside the rooms; `globalFx.setGlobalColourRoom(params)` clamps `wet` through `clampIfGiven('colourRoom.wet', …)`
and writes nothing yet (no room exists; a doc comment says T4 completes it); `AudioEngine.ts` re-exports it;
`GLOBAL_SETTER.colourRoom` and `applyGlobalAudioToEngine` (after `bitCrusher`) route it. The seeder emits
`colourRoom: { wet: defaults.colourRoom.wet }` and the two oracles gain the block **by hand**, nothing else moving.

**Acceptance criteria:**
- [ ] `withGlobalAudioDefaults({})` has `colourRoom.wet === 1`; a payload with `colourRoom: { wet: 0.4 }` keeps it.
- [ ] `setGlobalAudio('colourRoom', { wet: 0.5 })` reaches `setGlobalColourRoom` with 0.5; `{ wet: 7 }` clamps to 1;
  `NaN` is ignored; `applyGlobalAudioToEngine` calls it once.
- [ ] The oracles differ from the base by exactly the added block (`toStrictEqual` on everything else).

**Verification:**
- [ ] `npx vitest run src/types/globalAudio.test.ts src/stores/audioStore.test.ts src/utils/globalAudioSeed.test.ts src/utils/sessionDiff.test.ts src/data/transmissionPresets.test.ts src/engine/audioEngine/globalFx.test.ts`
- [ ] `npm run build:types && npm run lint`.

**Dependencies:** None. **Files:** `src/types/globalAudio.ts` (+ test), `src/data/globalAudioSeedRanges.ts`,
`src/data/transmissionPresets.ts`, `src/utils/sessionDiff.ts`, `src/utils/globalAudioSeed.ts` (+ test),
`src/engine/audioEngine/globalFx.ts`, `src/engine/AudioEngine.ts`, `src/stores/audioStore.ts`. **Scope:** M (small edits,
many files; the loading table needs no row because the key is a return).

### Task 3: Room machinery in `bypassCell.ts` — pure, no caller yet

**Description:** `ROOM_KEYS`, `RoomKey`, `ROOM_BRANCHES`, `Room`, `branchGains`; `Cell` gains `dry: Tone.Gain | null`,
`room: RoomKey | null`, `depth: number`; `buildRoom(key, GainCtor, DelayCtor)` (`in` 1, `cut` from `CHAIN_CUT_OPTIONS`,
`return` 1, `fed` false, `returnLevel` 1); `buildBranch(key, room, effect, GainCtor)` (a `Cell` sharing the room's `in`
and `cut`, `dry` null, `wet` 0, dark); `getRoom`, `roomNodes`; `setRoomFed`, `setRoomReturn` (ramps `return` over
`COLOUR_RAMP_SECONDS`, records `returnLevel`), private `roomLive` and `syncRoom`; `writeCellMix` on a branch records
`depth` and targets `roomLive ? colourWetGain(mix) : 0` with the existing re-sent rule; `rampCell` uses `branchGains`
for a branch; `wireCells` makes `wet → cut` and the effect edges only (no dry edge) for a branch; `cellNodes` /
`getConnectedEffectCount` / `clearCells` cover branches and rooms; `needsDuck` works on a branch. Spec §1.3, §4.

**Acceptance criteria:**
- [ ] A branch built dark has no effect edge; `writeCellMix(branch, 0.3)` on an unfed room records depth 0.3 and
  connects nothing; `setRoomFed(key, true)` then connects `in → effect → wet` once and ramps `wet` to
  `colourWetGain(0.3)` with no dry ramp; `setRoomFed(false)` ramps to 0, arms one timer at `lookAhead + 0.05 + 0.01`
  and disconnects at the fire; a re-feed before the fire cancels it; `setRoomReturn(key, 0)` on a fed room darkens and
  `setRoomReturn(0.4)` re-lights; a pinned-1 branch (Shimmer, Double) lights at `wet` 1; a re-sent equal state writes
  nothing.
- [ ] `branchGains(w) = { 0, w }`; `wireCells` makes no dry edge for a branch and the chain cells' edges as before (the
  existing cell tests pass unmodified); `getConnectedEffectCount` counts lit branches.
- [ ] **Mutation gate:** `roomLive` ignoring `returnLevel`, `syncRoom` skipping a branch, and `branchGains` returning a
  non-zero dry are each caught.

**Verification:**
- [ ] `npx vitest run src/engine/audioEngine/bypassCell.test.ts`
- [ ] `npm run build:types && npm run lint`.

**Dependencies:** T0 Q3, Q4 (the branch law and the two drivers). **Files:** `src/engine/audioEngine/bypassCell.ts`
(+ test). **Scope:** M (one module, a lot of it).

### Task 4: The rooms built and wired; the chain loses five stages

**Description:** In `globalFx.ts`: after the effects, `buildRoom` ×3 (left out with one `devWarn`, effects released,
without Gain and Delay constructors), `buildBranch` for the five room effects, `buildCell` for the five chain effects;
the Shimmer and Double branches written `writeCellMix(key, 1)` once at build; `chainNodes` loses the five spans;
`wireGlobalFxChain` connects every room's `return` to `join`; `disconnectAllFxNodes` lists `...roomNodes(key)`;
`getGlobalRoomInput(key)`; `setGlobalChorus` / `setGlobalFrequencyShifter` replace `writeCellMix(key, wet)` with
`setRoomReturn('double' | 'shimmer', wet)`; `setGlobalColourRoom` calls `setRoomReturn('grit', wet)`; the three colour
setters unchanged in text. `globalPedalsDocs.test.ts:153–154` re-pinned to the seven-stage `chainNodes` and the unchanged
`join` line. `chainCycleSearch.test.ts` gains the room case. The headless test covers no-Gain / no-Delay.

**Acceptance criteria:**
- [ ] Chain order, both Decay Modes: entry cut → EQ → LPF → HPF → filter cut → AutoWah → Phaser → Tremolo → Vibrato
  cells → Compressor → Width cell → Limiter → master; five returns at the Compressor under Natural, at the Width cell's
  `in` under Controlled; no room connected to another room; a stub send's edge into `room.in` survives two flips.
- [ ] `setGlobalChorus({ wet: 0.4 })` calls `setRoomReturn('double', 0.4)` and never `writeCellMix` (**mutation
  check**); the shifter likewise; `setGlobalColourRoom({ wet: 0.3 })` calls `setRoomReturn('grit', 0.3)`; the Spread
  duck on a lit Double branch still ducks; `rebuildPhaser` and the Width cell are untouched (existing tests pass).
- [ ] A connect into a room's `in` with three lit branches walks that room and stops at its cut, whatever is lit on
  the chain (`chainCycleSearch.test.ts`); with no Gain constructor the three rooms are left out, the chain still wires
  and every setter no-ops.

**Verification:**
- [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/globalFx.headless.test.ts src/engine/audioEngine/chainCycleSearch.test.ts src/docs/globalPedalsDocs.test.ts src/engine/AudioEngine.test.ts`
- [ ] `npm run build:types && npm run lint`. The Colour trio, Chorus and Shifter are now silent in every world until T7.

**Dependencies:** T2, T3. **Files:** `src/engine/audioEngine/globalFx.ts` (+ test, headless test),
`src/engine/audioEngine/chainCycleSearch.test.ts`, `src/docs/globalPedalsDocs.test.ts`. **Scope:** M–L (five files; the
rewire is the risk, measured at T19).

### Task 5: Robot fields, send gains, feeder sets

**Description:** `Robot.gritSend` / `shimmerSend` / `doubleSend` (required numbers, spec §1.1 doc comments);
`localeStore.updateRobot` clamps them beside the first two; the spawn literal gets the three at `0` as a **placeholder
T7 replaces**; fixtures the compiler flags gain the fields. `VoiceEntry` gains three gains, `disposeVoiceNodes` lists
them; `reserveVoice` builds three `GainCtorLocal(0)` (stubs on the fallback path), connects `busFilter → send` and
`send → getGlobalRoomInput(key)` when the room exists; `roomFeeders: Record<RoomKey, Set<string>>` module state;
`updateRobotSends` takes the five keys, writes each given gain as today, and updates the feeder set for a room key,
calling `setRoomFed(key, …)` only when the set becomes empty or non-empty; `releaseVoice` removes the robot from every
set with the same rule.

**Acceptance criteria:**
- [ ] `updateRobot(l, id, { gritSend: 7 })` stores 1; `{ shimmerSend: -2 }` stores 0; `{ doubleSend: NaN }` is dropped.
- [ ] `reserveVoice` creates five send gains at 0, connects the three new ones to a room's `in` only when the room
  exists, still connects `busFilter → chain entry`; a robot with every send 0 has no path to any room except through its
  gains.
- [ ] `updateRobotSends(id, { grit: 0.3 })` ramps only the grit gain and calls `setRoomFed('grit', true)` once; a
  second robot's grit adds no call; both to 0 calls `setRoomFed('grit', false)` once; `7` clamps to 1; `NaN` ignored; no
  composite → devWarn; `releaseVoice` disposes all five and un-feeds; the stub-fallback voice has five.
  **Mutation gate:** `setRoomFed` called on every write, and never on release, are both caught.

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts src/stores/localeStore.test.ts src/systems/spawnSystem.test.ts`
- [ ] `npm run build:types && npm run lint` (finds every fixture).

**Dependencies:** T1, T4; T0 Q4. **Files:** `src/types/Robot.ts`, `src/stores/localeStore.ts` (+ test),
`src/engine/audioEngine/voiceEntry.ts`, `src/engine/AudioEngine.ts` (+ test), `src/systems/spawnSystem.ts`, fixtures as
flagged. **Scope:** M.

### Task 6: Reservation sites prime all five sends

**Description:** `loadInstruments`' post-load pass, `reReserveVoice`, the two `spawnSystem.ts` reserve sites and the
`sessionDiff.ts` restore (gated on any of the five in the diff) pass `{ reverb, delay, grit, shimmer, double }` from the
stored robot. `reservationSendsPrime.test.ts` asserts all five at each site; `robotSendsDocs.test.ts`' reserve-site scan
is unchanged in shape and still green.

**Acceptance criteria:**
- [ ] Each site primes the five stored values after reservation (spy on `updateRobotSends`); the restore primes only
  the sends the diff carried, from the stored, clamped values.
- [ ] A non-test file calling `reserveVoice(` without `updateRobotSends(` fails the scan.

**Verification:**
- [ ] `npx vitest run src/engine/reservationSendsPrime.test.ts src/engine/AudioEngine.test.ts src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/docs/robotSendsDocs.test.ts`

**Dependencies:** T5. **Files:** `src/engine/AudioEngine.ts`, `src/systems/spawnSystem.ts`, `src/utils/sessionDiff.ts`,
`src/engine/reservationSendsPrime.test.ts`. **Scope:** S.

### Task 7: Seeded spread — `generateRobotSends` draws all five

**Description:** The spec §1.2 helper: Reverb and Delay unchanged; the exclusive three rolled with
`getUniformSeededVal(noiseMap, 'robot.send.<room>.lit', spawnCount) < lit` in `EXCLUSIVE_SEND_FIELDS` order, a landed
value a uniform draw in its band quantised by `quantizeSend`, every roll and value key read on every robot, at most one
landing; the `alea` fallback mirrored; `RobotAudioBaseline` carries the three and `generateRobotAudioBaseline` spreads
them outside the copy branch; the T5 placeholder goes. Calibration over 150 worlds × 12 records the measured means in the
test's comment and pins them.

**Acceptance criteria:**
- [ ] Every spawned robot's three sends are 0 or inside their band on the 1 % grid; **no robot carries two of the
  three**; the same locale spawns the same sends twice; the baseline equals the spawned sends for every index, copy-branch
  robots included.
- [ ] T1's parity test still passes unmodified (Reverb and Delay did not move).
- [ ] Calibration: mean counts per fleet within ±0.4 of the recorded figures; the zero-Grit share recorded.
  **Mutation gate:** dropping the `taken` guard (two sends on one robot) and reading a roll only when needed (a
  draw-set that depends on the outcome) are both caught.

**Verification:**
- [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts`

**Dependencies:** T1, T5; T0 Q7. **Files:** `src/systems/spawnSystem.ts` (+ test). **Scope:** S–M.

### Task 8: The global seeder — two pedals leave the cap, two Mixes become Returns

**Description:** `PEDAL_LIT_EDGE` loses `chorus` and `frequencyShifter`; `MOTION_PEDALS = ['tremolo', 'vibrato']`; the
cap loop runs over the two; `rateLit.chorus = true` (the Chorus rolls Sync in every world under its `PEDAL_SYNC_ODDS`
entry, per-pedal after the retune's T3); `chorus.wet` and `frequencyShifter.wet` come from the defaults, which become
1; `pedalWet` serves the two; `RETURN_FIELD_KEYS` gains the two keys and the loading table loses their rows (the retune's
rows 7 and 9 become history, noted in the table's header); the two oracles amended **by hand** (the two `wet`s → 1, the
Chorus `sync` key where the existing draws now produce one, recorded with the reason); the calibration test re-pins the
Tremolo and Vibrato measured shares (expected 22.2 % / 19.4 %); `transmissionPresets` set the two `wet`s to 1.

**Acceptance criteria:**
- [ ] `chorus.wet === 1` and `frequencyShifter.wet === 1` for several styles; the Chorus seeds Sync in about half of all
  worlds; the shifter's shift never inside ±2 Hz; never more than two of the four lit; Colour shares unchanged.
- [ ] The oracles differ from T2's by exactly the listed fields.
- [ ] `globalPedalsDocs.test.ts` and `globalModulationDocs.test.ts` still match the declarations they pin (adjusted
  only where `PEDAL_LIT_EDGE` / `MOTION_PEDALS` change shape).

**Verification:**
- [ ] `npx vitest run src/utils/globalAudioSeed.test.ts src/types/globalAudio.test.ts src/data/transmissionPresets.test.ts src/data/globalAudioLoadingRanges.test.ts src/docs`

**Dependencies:** T4; T0 Q7. **Files:** `src/utils/globalAudioSeed.ts` (+ test), `src/types/globalAudio.ts`,
`src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioLoadingRanges.ts` (+ test), `src/data/transmissionPresets.ts`.
**Scope:** M.

### Checkpoint A: Engine and data
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (2026-10-21, at `0de3fc06`: 13 548 tests, lint 0 errors).
- [x] A fresh world in the dev server: the `?debug` HUD's `fx in` counts lit branches; a world with a Grit robot shows
  the Distortion (or whichever node the character lit) connected, a world with none shows it out; the dry chain is seven
  stages (read from `wireGlobalFxChain`'s connections in the test, and by ear: the Vibrato and Tremolo still work).
- [x] Reviewed with Crawford before Phase 2.

#### Phase 1 as shipped (2026-10-21)

Every task RED first, one commit each, with a mutation check (every named gate killed; extra mutants listed in each
commit message). The deviations and findings, task by task:

- **T1.** `SEND_DELAY_QUIET_THRESHOLD` is deleted, so `robotSendsDocs.test.ts` now lists it among the names a doc may cite
  that are not in source (`AUDIO_SYSTEM.md`, `ROBOT_DATA_GRID.md`, `SLIDER_VALUES.md` still cite it; T22 rewrites them).
  The parity test pins two twelve-robot rosters (`effect-sends-parity-a` / `-b`) recorded on `ad1b37c1`.
- **T2.** The stub `setGlobalColourRoom` writes nothing, so its clamp is unobservable until T4; the 7 → 1 and NaN cases
  are pinned there. `globalAudio.test.ts`'s key-order test now has `colourRoom` between `bitCrusher` and `autoWah`.
- **T3.** A branch whose effect is null (constructor threw) is not built (a room has no dry path to keep); `cellSpan` is
  null for a branch; `wireCells` also makes each room's `cut → return`.
- **T4.** The build makes **ten** zero-delay Delays (two cuts, three rooms, five chain cells), not the fifteen spec §5
  states (an arithmetic slip). `globalFx.test.ts` finds cells through the live `bypassCell` module instead of by Gain
  build order; the Chorus Spread de-click suite drives the Double room (Return and feed); the "duck splits into chords"
  case moved to the Tremolo, since a branch's linear law is one ramp (a new case pins that).
- **T5.** Found and fixed: a voice **replaced** by a re-reservation must leave the feeder sets like a released one, or a
  robot primed before the engine starts (no room yet) never feeds the room built at start. Pinned by a test.
- **T6.** The restore primes by one `SEND_PRIME_KEYS` table, but the session diff carries Grit, Shimmer and Double only
  from T15, so until then a restore primes Reverb and Delay only.
- **T7.** Fallback `alea` keys are `sendGritLit` / `sendGrit` / … (the spec's `sendColour…`). Calibration measured on the
  150 test worlds: Grit 2.50, Shimmer 1.62, Double 1.55 per fleet, no Grit in 7.3 % of fleets (2 000 other worlds: 2.53 /
  1.52 / 1.51, 6.0 %). Nominal is 2.52 / 1.52 / 1.51; assumption 7's "Double 1.4" was a slip.
- **T8.** The oracles moved by the four `wet`s only (Chorus and shifter → 1): oracle-alpha's Chorus already had its Sync,
  oracle-theta's Chorus Sync roll is over its odds, and no Tremolo / Vibrato lighting moved. Measured over 20 000 styles:
  Tremolo 22.04 %, Vibrato 19.55 %, two lit in 33.20 % of worlds and never more, the Chorus synced in 49.51 % of all worlds.

## Phase 2: The robot-screen slice

### Task 9: `applyGritSend` / `applyShimmerSend` / `applyDoubleSend` and their `*Value` forms

**Description:** Six actions on the `applyReverbSend` / `applyReverbSendValue` shape (spec §1.5).

**Acceptance criteria:**
- [ ] `applyGritSend(robot, l, 40)` stores `gritSend: 0.4` and calls `updateRobotSends(id, { grit: 0.4 })`; 150 clamps
  to 1; the `*Value` form takes the fraction; neither cancels a swell (the callers do).

**Verification:** `npx vitest run src/systems/robotOptionsActions.test.ts`.

**Dependencies:** T5. **Files:** `src/systems/robotOptionsActions.ts` (+ test). **Scope:** S.

### Task 10: Content and schemas

**Description:** `probe.gritSend`, `probe.shimmerSend`, `probe.doubleSend` (human Grit / Shimmer / Double, lore
placeholders from spec assumption 15, unit `%`, `help.human`); `fleet.colourRoom` and `fleet.colourRoom.amount`;
`fleet.chorus.mix` and `fleet.frequencyShifter.mix` reworded as returns (keys kept); the `fleet.colour`,
`fleet.modulation` and `probe.levels` intro sentences. `GRIT_SEND_SCHEMA` / `SHIMMER_SEND_SCHEMA` / `DOUBLE_SEND_SCHEMA`
beside `DELAY_SEND_SCHEMA`.

**Acceptance criteria:**
- [ ] `content.test.ts` green with no exemptions; `help` on every new and reworded entry; the three schemas' bounds come
  from `SEND_*` and their ids are `robotOptions.<field>`.

**Verification:** `npx vitest run src/content/content.test.ts src/data/robotOptionsConfig.test.ts`; `npm run lint`.

**Dependencies:** None (parallel with T9). **Files:** `src/content/copy/probe.ts`, `src/content/copy/fleet.ts`,
`src/data/robotOptionsConfig.ts` (+ test). **Scope:** S.

### Task 11: `AudioSettingSection` rows and `RobotScreen` wiring

**Description:** `AudioSettingValue` gains the three fractions; props gain the three handlers and the three swelling
flags (optional, undefined until T13); three send rows after Delay in the same wrapper; `RobotScreen` memo, three
handlers through the actions (the swell cancel is added in T13).

**Acceptance criteria:**
- [ ] The section renders Volume, Pan, Reverb, Delay, Grit, Shimmer, Double in order; each new slider shows `send × 100`;
  a drag calls its handler with the display number; labels come from `CONTENT`; handler identities are stable.
- [ ] `RobotScreen` passes the fields and routes each handler to its action.

**Verification:** `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`;
`npm run dev`: on one robot's card the three sliders move the sound (Grit audible only where a colour node is lit).

**Dependencies:** T9, T10. **Files:** `src/components/robot/AudioSettingSection.tsx` (+ test),
`src/components/panels/screen/screens/RobotScreen.tsx` (+ test). **Scope:** M.

### Checkpoint B: One robot, end to end
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (2026-10-21, at `483d7730`: 13 708 tests plus the documented
  `sceneToOrbiterLocal` timeout, which passes alone; lint 0 errors).
- [x] Dev server: a fresh world's Grit robot is audibly coloured beside a clean neighbour; dragging Shimmer up on a clean
  robot brings the shifter in with no click; Delay-side behaviour unchanged.
- [x] Reviewed with Crawford before Phase 3 (looked and listened, approved 2026-10-21).

#### Phase 2 as shipped (2026-10-21)

Every task RED first, one commit each, with a mutation check (the mutants are listed in each commit message, all
caught).

- **T9.** As planned: six actions on the `applyReverbSend` pair. The send action tests now run over all five sends, with
  every field seeded at a distinct value, and assert that a write touches only its own field and engine key.
- **T10.** `fleet.colourRoom` and `fleet.colourRoom.amount` are **not** added here. Nothing reads them until T17's
  `colourRoom` block, so the content guard would need an `AWAITING_CONSUMER` exemption, and T10's criterion says no
  exemptions. **T17 adds both keys with their reader.** The Chorus and Shifter rows read "Return" (spec assumption 14);
  the pedals copy test's shared-name sets split into four Mixes and two Returns. Not changed, and still out of date: the
  three Colour Mix help strings ("blended in with the clean sound") describe a stage, not a branch of a room. That is
  outside spec §1.8; left for the copy pass or T22.
- **T11.** The three values and handlers are **optional** on `AudioSettingSection`, and a row renders only when its value
  and its handler are both given. The company screen renders the same section and is wired in T14 (whose criterion is
  "the company screen shows the three rows"), so until then it shows none. **T14 can make the six props required.** The
  three swelling props exist and are tested (snap vs ease); `RobotScreen` passes them in T13. Dynamics stays the last row,
  after Double.

## Phase 3: Swells, companies, persistence

### Task 12: The robot swell pool gains the three sends

**Description:** `SwellRobotAttributeId` + three (22, listed last); `ROBOT_SWELL_FIELD_RANGE` rows 0…1;
`isRobotAttributeStructurallyLive` `> 0`; `readRobotValue` / `writeRobotValue` through the `*Value` actions;
`computeRobotAudioOverrideDiff` captures the base for the three.

**Acceptance criteria:**
- [ ] 22 ids each with a range row; a swell on `gritSend` ramps out and back through `applyGritSendValue` (spy), lands
  exactly on its base, flags `isRobotAttributeSwelling`; a send of 0 is never picked, 0.25 is; a company-wide swell moves
  each eligible member from its own base; a mid-swell save stores the base. **Mutation check:** skipping the send
  branch in `writeRobotValue` goes red.

**Verification:** `npx vitest run src/types/audioSwell.test.ts src/systems/audioSwells.test.ts src/data/audioSwellRanges.test.ts src/utils/sessionDiff.test.ts`.

**Dependencies:** T9. **Files:** `src/types/audioSwell.ts` (+ test), `src/data/audioSwellRanges.ts` (+ test),
`src/systems/audioSwells.ts` (+ test), `src/utils/sessionDiff.ts`. **Scope:** M.

### Task 13: Swell flags and hand-edit cancel on the robot screen

**Description:** `RobotScreen` computes the three `isRobotAttributeSwelling` flags and passes them; its three handlers
call `cancelSwellForRobotAttribute` first (the Volume shape).

**Acceptance criteria:**
- [ ] A swelling send's slider gets `swelling`; a drag mid-swell cancels the swell then applies.

**Verification:** `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx`.

**Dependencies:** T11, T12. **Files:** `src/components/panels/screen/screens/RobotScreen.tsx` (+ test). **Scope:** S.

### Task 14: Company broadcast

**Description:** `CompanyOptionsSnapshot` + three optional fields; `DISABLED_AUDIO_SETTING`, the resolved locals, three
flags from the first member, three handlers on `onReverbSendChange`'s shape (cancel per member, apply per member,
`patchSnapshot`); `resolveCompanyOptions` fallbacks; `CompanyOptionsSection` passes them.

**Acceptance criteria:**
- [ ] `resolveCompanyOptions` falls back to the first member's three sends and a snapshot wins; `onGritSendChange(40)`
  calls `applyGritSend` once per member with 40 after cancelling each member's swell, and records `{ gritSend: 0.4 }`;
  handler identities stable across an unrelated edit; the company screen shows the three rows.

**Verification:** `npx vitest run src/systems/companyOptions.test.ts src/components/company`.

**Dependencies:** T9, T11, T13. **Files:** `src/types/Company.ts`, `src/systems/companyOptions.ts` (+ test),
`src/components/company/useCompanyOptions.ts` (+ test), `src/components/company/CompanyOptionsSection.tsx` (+ test).
**Scope:** M.

### Task 15: Session diff, restore and prime

**Description:** `RobotAudioOverrideDiff` + three optional fields; the `['reverbSend', 'delaySend']` loops in
`sessionDiff.ts` become the five (two decimals; in-range or ignored whole; the prime reads the stored, clamped values
for the sends the diff carried). No payload upgrade (spec assumption 13).

**Acceptance criteria:**
- [ ] An untouched robot diffs to `{}`; one step diffs to `{ gritSend: 0.45 }`; a round trip equal to the seed diffs to
  nothing; restoring `{ shimmerSend: 0 }` sets the field and primes; a non-finite or out-of-range value is ignored whole;
  `7` primes 1. A version-2 payload without `colourRoom` restores with `colourRoom.wet === 1` and its `chorus.wet` /
  `frequencyShifter.wet` exactly as stored. **Mutation check:** dropping the three from the baseline makes "untouched
  robot diffs to {}" go red.

**Verification:** `npx vitest run src/utils/sessionDiff.test.ts`.

**Dependencies:** T6, T7, T12. **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts` (+ test). **Scope:** S.

### Task 16: Share-link codec

**Description:** `CompactRobotOverrideDiff.gr? / sm? / db?` through `isSendFraction`, encode and decode, as `rs` / `ds`.

**Acceptance criteria:**
- [ ] The three round-trip `toEqual`; absent keys stay absent; `gr: 'x'` and `gr: 3` decode to no key; an old link
  without the keys and without `colourRoom` decodes with the defaults filled and nothing rewritten.

**Verification:** `npx vitest run src/utils/sessionShareUtils.test.ts`.

**Dependencies:** T15. **Files:** `src/utils/sessionShareUtils.ts` (+ test). **Scope:** XS.

### Checkpoint C: The whole feature, automated
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (2026-10-21, at `c506fbb2`: 13 925
  tests plus the documented `sceneToOrbiterLocal` timeout, which passes alone; lint 0 errors).
- [ ] Dev server: save a session with one moved Grit robot, reload, it is where you left it and every untouched robot
  is back at its seed; share link the same; a company move puts every member at one value; a swell on a send crawls out
  and back on the card.

#### Phase 3 as shipped (2026-10-21)

Every task RED first, one commit each, with a mutation check (the mutants are listed in each commit message, all
caught).

- **T12.** The **save side of the session diff moved here from T15**: `RobotAudioOverrideDiff` gains the three fields and
  `computeRobotAudioOverrideDiff`'s send loop runs over all five, because T12's own criterion ("a mid-swell save stores
  the base") needs the diff to carry them. The existing forced-start integration test ("a session saved mid-swell stores
  the base send") now lands on a **Shimmer** send in its world, where its `toBeUndefined()` would pass vacuously for a
  field the diff drops; a companion case hand-edits the send first and requires the edited base back. The
  company-attribute draws in `audioSwells.test.ts` are re-pointed at `/22` indices. The send writes go through a
  `switch`, not a lookup table of functions: a table captured at module load would bypass the tests' `vi.spyOn`.
- **T13.** As planned. One mutant survived the first pass (the Shimmer flag missing from the panel memo's deps, since a
  flag flipping with a send write recomputes the memo through the value anyway); a "flag flips during an unrelated
  re-render" case was added per send and kills it.
- **T14.** As the T11 note allowed, `AudioSettingSection`'s three values and three handlers are now **required**: both
  screens pass them, the rows render unconditionally, and the two "row absent without its handler / value" cases are
  replaced by a `@ts-expect-error` case that `npm run build:types` enforces (mutated under `build:types`).
- **T15.** Restore and prime only (the save side is T12's). The criterion's "`7` primes 1" is the store clamp
  (`localeStore.updateRobot`, T5): through a payload a 7 is out of range and **ignored whole**, per spec §1.7, and the
  tests pin that. The old-payload case (no `colourRoom`, Chorus 0.35 / shifter 0.2) restores `colourRoom.wet` 1 and both
  wets as stored; it passed on first run, since nothing rewrites them, and stands as the guard.
- **T16.** As planned.
- **Checkpoint C finding, fixed (`bd8c2ae6`).** Crawford: after opening a share link the three sends showed the right
  levels but were inaudible; a saved session was fine. Root cause was in T5, not the codec: a room is told it is fed only
  when its feeder set flips, robots are primed at spawn before any room exists, and the post-load pass re-reserves them
  one at a time, so with two or more feeders the set never empties and the rooms (built unfed) were never told. Any
  world with two feeders of a room started with that room silent; a session load masked it by releasing every voice
  first. `loadInstruments` now tells each room its feeder state right after `buildGlobalFxChain`. Confirmed in headless
  Chrome (the room `fed: false` with a 0.8 Grit primed, then `fed: true` with the branch connected, for all three rooms,
  from a live edit and from a link); five regression tests in `AudioEngine.test.ts`, four red without the fix.

## Phase 4: The drawer

### Task 17: The Colour Room sub-tab and the two Returns

**Description:** `AudioRigEffectKey` + `'colourRoom'`; a `colourRoom` block in `AUDIO_RIG_CONFIG` with one row
(`colourRoom.wet`, `sliderLinear` 0–1 step 0.01, `labels('fleet.colourRoom.amount')`); `FLEET_PARAMS_SUBSECTIONS.colour
= [colourRoom, distortion, chebyshev, bitCrusher]`; `AUDIO_RIG_EFFECT_TRAIT.colourRoom` the Colour trait; the Chorus and
Shifter blocks keep their rows with the reworded Mix labels from T10. `audioRigConfig.test.ts` pins eighteen blocks.

**Acceptance criteria:**
- [ ] Colour has four sub-tabs with Room first on both shells; the breadcrumb reads "Colour / Room"; the block renders
  one row; the range-parity test holds; the Chorus and Shifter Mix rows read as returns.

**Verification:** `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/nav src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/components/panels/screen/console/AudioRigDrawer.test.tsx`;
`npm run dev`: drag the Room return from 1 to 0 while a Grit robot plays — the colour goes, no click.

**Dependencies:** T2, T4, T10; T0 Q6. **Files:** `src/data/audioRigConfig.ts` (+ test),
`src/components/panels/screen/nav/navActions.ts` (+ test), `src/components/panels/screen/console/AudioRigDrawer.tsx` (+ test),
`src/components/panels/screen/screens/FleetParamsScreen.test.tsx`. **Scope:** M.

## Phase 5: Guard, probes, listen, phone gate

### Task 18: The docs / symbol guard test

**Description:** `src/docs/robotEffectSendsDocs.test.ts` on `robotSendsDocs.test.ts`' shape: every backticked symbol in
the spec's §1–§4 exists in non-test `src/`; the gem folder and `RobotBody.tsx` read none of the three identifiers; the
reserve-site scan reads five fields; the living-doc cases (the grid's `colourRoom.wet` row and room rows,
`AUDIO_SYSTEM.md`'s five rooms, `SESSION_STORAGE.md`'s five sends) — **red until T22**, noted in the test.
`globalColourDocs.test.ts:144` re-pinned from "chain order after the HPF rows" to the room rows (also red until T22).

**Acceptance criteria:**
- [ ] Every self-test (an empty scan, a renamed symbol, a comment-only read) fails as it should; the living-doc cases
  are the only red ones and are listed in the test header.

**Verification:** `npx vitest run src/docs`.

**Dependencies:** Checkpoint C. **Files:** `src/docs/robotEffectSendsDocs.test.ts`, `src/docs/globalColourDocs.test.ts`.
**Scope:** S.

### Task 19: Desktop probes

**Description:** Spec §5's three desktop checks, in the scratchpad, never committed: (1) the real-time crossing probe
(GLOBAL_PEDALS.md §8's recipe) for each room going fed → unfed → fed by a send ramp and Return 1 → 0 → 1, three runs
each, bar ≤ ×1.6 and no gap; (2) `npm run perf:audio` on the same `?session=` world, base against branch, 240 s, with
the three sends at 0 by hand (gated: branch ≤ base) and with the seeded sends (recorded); (3) power-on, a Decay flip and
a send crossing over CDP (the hang-probe recipe). Numbers go in `scratchy-audio-phones.md` under a 50.7 heading with
the probe's command lines.

**Acceptance criteria:**
- [ ] Every crossing ≤ ×1.6 with no gap; the all-dark `perf:audio` run ≤ base; power-on ≤ ~2 s, a flip ≤ 4 ms, a
  crossing ≤ 2 ms. A miss on (1) is a wiring bug in T3/T4 to find before T20.

**Verification:** the recorded numbers and the files they came from.

**Dependencies:** T18. **Files:** `docs/todo/scratchy-audio-phones.md` (append-only). **Scope:** M (probe work).

### Task 20: Crawford's listen and the tuning — **STOP**

**Description:** The spec §5 manual listen on the desktop, then the tuning: the three send bands and `lit` shares in
`ROBOT_SEND_LOADING_RANGES`, and the room-depth second look at the colour Mix bands (spec §7 Q1, if his), moved with
their grid rows and T7's calibration figures re-measured. Anything he vetoes reverts in one commit per row. Record his
words in the status line.

**Acceptance criteria:**
- [ ] Every listen item in spec §5 has a recorded outcome; the tables, the calibration test and the grid rows agree.

**Verification:** `npx vitest run src/systems/spawnSystem.test.ts src/data/robotSendLoadingRanges.test.ts`; `npm test`.

**Dependencies:** T19; T0 Q1. **Files:** `src/data/robotSendLoadingRanges.ts` (+ test), `src/systems/spawnSystem.test.ts`,
possibly `src/data/globalAudioLoadingRanges.ts` (+ test). **Scope:** S, plus the listen.

### Task 21: Phone gate — **STOP for Crawford**

**Description:** Spec §5's phone gate: the same `?session=` world on the branch base and the branch, Pixel 8, `?debug`,
Full and Standard, hands off to 3:00, a fresh page per run; then the hand world with every send at 100 % and every
Return at 1 (recorded, not gated). Counts, `fx in` readings and his words in `scratchy-audio-phones.md`.

**Acceptance criteria:**
- [ ] The branch's count at 3:00 within the sitting's spread of the base's, no runaway; `fx in` reads lit branches plus
  lit chain cells. A rise is a wiring bug to find or a reason to back out; no `LOAD_*_MIN`.

**Verification:** the recorded runs.

**Dependencies:** T20. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** S (his device).

## Phase 6: Docs

### Task 22: Docs

**Description:** Spec §2's docs list: `AUDIO_SYSTEM.md` (Signal Graph: five rooms, the seven-stage chain, the branch rule,
the HUD token's meaning), `GLOBAL_CHAIN_GRID.md` (chain-order line; colour / chorus / shifter rows as room rows; the
`colourRoom.wet` row; footnote ² → the send table), `ROBOT_DATA_GRID.md` and `SLIDER_VALUES.md` (three rows),
`TONE_EFFECTS_INVENTORY.md` (roles, the five send rows), `SESSION_STORAGE.md`, `COMPANIES.md`, `ROBOT_DESIGN.md` (one
line), one "superseded in part by 50.7" line each in `GLOBAL_COLOUR.md`, `GLOBAL_PEDALS.md` and `DARK_EFFECT_BYPASS.md`,
`ideas/themes.md`'s "what exists", `roadmap.md` (the 50.7 entry with status and as-built deltas; the series header to
seven), the intent's shipped banner. Every named identifier spot-checked against the shipped source, not this plan.

**Acceptance criteria:**
- [ ] T18's living-doc cases and `globalColourDocs.test.ts` go green; `npm test` fully green.
- [ ] A grep for `fx in n/10`'s old meaning, "Distortion → Chebyshev → BitCrusher" as chain stages, and `chorus.wet` as
  a Mix finds only history.

**Verification:** `npm test`, `npm run build:types`, `npm run lint`, `npm run build`.

**Dependencies:** T21. **Files:** the docs above, `docs/intent/robot-effect-sends.md`, `docs/todo/roadmap.md`. **Scope:** M
(docs only, many files).

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion met; T19's numbers, T20's words and T21's counts recorded.
- [ ] Docs reflect the shipped API, every name spot-checked.
- [ ] Any skipped manual check flagged here, never silently.
- [ ] The branch is Crawford's to PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The series-vs-parallel Colour room or the liveness drivers are answered differently from the spec's assumptions | Medium | T0 gates T3/T4 on Q3/Q4; T3 is the only module that encodes either, and T4 only consumes its API |
| A branch edge made or broken while its `wet` is non-zero (a click on every feed change) | High | T3's protocol tests pin "connect only at wet 0, disconnect only at the fire"; T19's real-time probe proves silence by render before anyone listens |
| The chain rewire in T4 silently drops a stage or a return | High | T4's chain-order and join assertions in both Decay Modes; `globalPedalsDocs` re-pinned to the new span list; the HUD count at Checkpoint A |
| `setRoomFed` called on every send write (a ramp storm) or missed on release (a room lit forever) | Medium | T5's mutation gate on both |
| The loading-table retyping breaks `sampleField` or the clamp for a key that is still seeded | Medium | `RETURN_FIELD_KEYS` grows only as a key stops being sampled (T1, T2, T8), each step type-checked |
| Reverb or Delay seeding moves while the table moves | High | T1's parity test against values recorded from the branch base, with a non-default fixture |
| Grit inaudible at the seeded floors (send × depth²) | Medium | T20 tunes bands with the grid; the taper inside the room is an ask-first lever (spec §3) |
| Fleet-to-fleet spread of the three sends (binomial) | Low | T7 records the zero-Grit share; a roster-aware cap is a recorded follow-up |
| Old test sessions sound different | Low | Not a concern (Crawford, 2026-10-21); T15 pins "nothing rewritten" so the behaviour is deliberate |
| The retune and this phase edit the same loading rows | Medium | T0 part A waits for the retune's merge; T8 removes the two Mix rows it made moot and says so in the header |

## Open Questions

1. Spec §7 Q1 (who owns the room-depth second look). **Open** — Crawford; gates T20 only. The plan assumes T20.
2. Spec §7 Q2 (field names). **Resolved** — the intent's names, 2026-10-21.
3. Spec §7 Q3 (parallel Colour room). **Open** — gates T3, T4.
4. Spec §7 Q4 (liveness drivers). **Open** — gates T3, T5.
5. Spec §7 Q5 (old payloads). **Resolved** — load as-is, no upgrade, 2026-10-21.
6. Spec §7 Q6 (drawer placement). **Open** — gates T17.
7. Spec §7 Q7 (cap stays 2 over four; Chorus Sync every world; per-robot rolls). **Open** — gates T7, T8.
