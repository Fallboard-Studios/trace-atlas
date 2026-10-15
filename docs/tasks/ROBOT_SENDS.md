# Implementation Plan: Robot Sends — Per-Robot Reverb and Delay Depth

Spec: [docs/specs/ROBOT_SENDS.md](../specs/ROBOT_SENDS.md). Intent:
[docs/intent/robot-sends.md](../intent/robot-sends.md). Roadmap **50.2**. Branch `feature/palette-sends` (a
proposed name; Crawford creates it), off `main` at `450bf2ad` or later.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf`; the phone gate is the `?debug` HUD on the Pixel (spec §5).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: NOT STARTED (2026-10-14).** Blocked on Crawford's review of the spec's open points (spec §7): the
> parallel rooms (assumption 1), where the returns rejoin (assumption 2, plus the pre-existing Decay Mode copy
> mismatch), own-draw on copy-branch robots (6), swells *moving* rather than copying (13), and the seed-oracle
> hand-edit (§5). None blocks T1–T5; T6 needs the oracle answer, T11–T12 need the swell answer.
>
> **Progress (2026-10-14):** T1–T19 committed; Checkpoints A, B and C passed; 50.1 (articulation) merged in. The swell
> question (13) is answered: **move**. T11 deleted the global wet swell targets, so the global pool is 7.
> **Known red until T20:** `src/docs/robotSendsDocs.test.ts` part (c), the two "names `reverbSend` / `delaySend` as a
> persisted field" cases against `docs/SESSION_STORAGE.md` (the Pan and Articulation guards were red the same way).
> T18 (phone gate) recorded in `docs/todo/scratchy-audio-phones.md`: Full and Standard, 3:00 each, no distortion by ear; HUD
> underrun counts were not reported and the desktop `npm run perf` comparison was skipped at Crawford's call (2026-10-14).
> T19 (Crawford's listen): "i think all is fine" (2026-10-14), recorded as signed off as a whole, not line by line.
> Next is T20 (docs).

## Overview

Twenty tasks in six phases. **Phase 1** is the engine and the data underneath it, nothing visible: the robot
fields, the global rooms rewired to return gains, the per-robot send gains and their priming, and the seeded
spread. **Phase 2** is the robot-screen vertical slice: the actions, content, two slider rows and the screen
wiring, audible and usable on one robot at Checkpoint B. **Phase 3** moves swells onto the robots. **Phase 4**
widens to companies and makes it persist. **Phase 5** is the guard test, the phone gate and Crawford's listen.
**Phase 6** is docs. Every task leaves types, lint and the suite green; RED first; one commit per task;
mutation-check at the named gates.

## Architecture Decisions

- **Rooms first, then robots (spec §1.3).** The global rewiring (T2) lands before anything seeds
  `reverb.wet` / `delay.wet` to `1` (T6): under the old engine `wet = 1` would be a fully wet mix. Between T2
  and T5 the world is deliberately echo-less (the rooms exist, no robot sends into them yet); nobody listens
  until Checkpoint A.
- **The `wet` sliders drive return gains, never `Effect.wet` (assumption 3).** Mutation-gated in T2.
- **Explicit prime at every reservation site, no widened `reserveVoice` (assumption 8).** Four sites exist
  (`loadInstruments`, `reReserveVoice`, the spawn reservation, `reRegisterAllRobotsAudio`) plus the session
  restore. A per-file count scan (T4) fails the build on a fifth. This also keeps the branch off 50.1's
  proposed `articulation` parameter.
- **Seeding has one helper (spec §1.2).** `generateRobotSends` serves both `spawnRobot` and
  `generateRobotAudioBaseline`; T5's parity test is the drift guard. The draws sit outside the copy branch.
- **Swells reuse the Volume path (spec §1.9).** The sends join the robot pool through `readRobotValue` /
  `writeRobotValue` (`applyReverbSend` underneath), flags and cancels at the callers like Volume. The global
  pool shrinks in its own task so the two audioSwells edits never share a commit.
- **Store is the source of truth; the engine is primed from it.** `robot.reverbSend` / `delaySend` live in
  `localeStore`; the send `Gain`s live only in `compositeVoices`.
- **Ordering.** Constants and fields (T1) before everything that names them; engine (T2–T4) before actions
  (T7) before UI (T9–T10); content and schemas (T8) are independent and can land in parallel with T2–T7;
  persistence (T15–T16) waits for T3 (the restore test asserts the prime) and T12 (the swell base value).

## Dependency Graph

```
T1 constants + Robot fields + clamp ──┬─► T3 per-robot sends (nodes, updateRobotSends) ─► T4 reservation primes ─┐
T2 global rooms → return gains ───────┘        │                                                               │
                                               ├─► T5 seeded spread (spawn + baseline)                         │
T2 ─► T6 global wet = 1, no draw, oracle ◄─────┘                                                               │
                                                                                          Checkpoint A ◄───────┘
T8 content + schemas ─┐
T3 ─► T7 actions ─────┴─► T9 AudioSettingSection rows ─► T10 RobotScreen wiring ─► Checkpoint B
                                                                │
T11 global swell pool loses wet ──► T12 robot pool gains sends ─┴─► T13 swell flags + cancel (needs T10)
                                                                                      │
                  T14 company (needs T7, T9, T13) ◄───────────────────────────────────┤
                  T15 session diff / restore / prime (needs T3, T5, T12) ◄────────────┘
                  T16 share codec `rs`/`ds` ◄── T15
                                       │
                               Checkpoint C ─► T17 docs guard test ─► T18 phone gate (STOP) ─► T19 Crawford's listen (STOP) ─► T20 docs ─► Complete
```

T1 and T2 are independent; T8 and T11 are independent of everything before Checkpoint B; T14 and T15 may run
in parallel sessions after T13, but never touch the same file in one commit (`useCompanyOptions.ts` is T14's,
`sessionDiff.ts` is T15's).

## Phase 1: Engine and data (nothing visible)

### Task 1: Constants, Robot fields, store clamp

**Description:** `SEND_MIN`, `SEND_MAX`, `SEND_DISPLAY_SCALE`, `SEND_STEP_PERCENT`,
`SEND_DELAY_QUIET_THRESHOLD` in `src/constants/index.ts` beside `PAN_*`; `Robot.reverbSend: number` and
`Robot.delaySend: number` with the spec §1.1 doc comments; `localeStore.updateRobot` clamps both into
`[SEND_MIN, SEND_MAX]` next to its `pan` clamp (fractional, not truncated); the spawn literal gets
`reverbSend: 0, delaySend: 0` as a **placeholder T5 replaces**; every hand-built `Robot` fixture the compiler
flags gains the two fields.

**Acceptance criteria:**
- [ ] `updateRobot(l, id, { reverbSend: 7 })` stores `1`; `{ delaySend: -2 }` stores `0`; `{ reverbSend: 0.25 }` stores `0.25` exactly; `{ delaySend: NaN }` is dropped.
- [ ] A spawned robot has both fields (`0`, placeholder) and no existing key or `getSeededVal` data-id changed.
- [ ] `SEND_DELAY_QUIET_THRESHOLD === 0.25`; the old `DELAY_QUIET_THRESHOLD` in `globalAudioSeed.ts` is untouched until T6.

**Verification:**
- [ ] `npx vitest run src/stores/localeStore.test.ts src/systems/spawnSystem.test.ts`
- [ ] `npm run build:types && npm run lint` (this is what finds every fixture).

**Dependencies:** None. **Files:** `src/constants/index.ts`, `src/types/Robot.ts`, `src/stores/localeStore.ts`
(+ test), `src/systems/spawnSystem.ts`, fixtures as flagged. **Scope:** M (small edits, many files).

### Task 2: Global rooms become return-driven

**Description:** In `globalFx.ts`: `_globalReverbReturn` / `_globalDelayReturn` `Tone.Gain(1)`; `Reverb` and
`FeedbackDelay` construct with `wet: 1`; `wireGlobalFxChain` wires the dry chain `EQ3 → LPF → HPF →
Compressor → Limiter → masterGain` in both modes and connects each room → its return → the join node
(Compressor input in Natural, Limiter input in Controlled), per spec §1.3; `disconnectAllFxNodes` lists the
returns; `getGlobalReverbRoom()` / `getGlobalDelayRoom()` getters; `setGlobalReverb` / `setGlobalDelay` write
`wet` to the **return gain**, leaving `decay`, `preDelay`, `delayTime`, `feedback` untouched. Rewrite the
function's doc comment.

**Acceptance criteria:**
- [ ] After `buildGlobalFxChain()` the room nodes have `wet === 1` and each return `gain === 1`.
- [ ] `setGlobalReverb({ wet: 0.4 })` sets the reverb return gain to `0.4` and **does not** touch `reverb.wet`; `setGlobalDelay` likewise. **Mutation:** write `reverb.wet` instead and this test goes red.
- [ ] `wireGlobalFxChain(false)`: dry order `EQ3→LPF→HPF→Compressor→Limiter→master`, both returns connected to the Compressor, no room connected to the other room. `wireGlobalFxChain(true)`: same dry order, both returns connected to the Limiter and none to the Compressor.
- [ ] Flipping the mode twice leaves a stubbed send gain's connection to each room intact (outputs are dropped by `disconnectAllFxNodes`, inputs are not) and `connectTapsIfWanted` still runs.
- [ ] Absent nodes (headless, `getToneCtor` null) never throw.

**Verification:**
- [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts`

**Dependencies:** None. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`. **Scope:** S–M.

### Task 3: Per-robot send gains and `updateRobotSends`

**Description:** In `AudioEngine.ts`: the `compositeVoices` entry type, `storeVoice` and `disposeVoiceNodes`
gain `reverbSend` / `delaySend` `Tone.Gain`s; `reserveVoice` creates both at `0`, connects `busFilter → each
send → its room` when the room exists (the dry `busFilter → chain entry` link unchanged), and the
stub-fallback voice gets two `makeStubGain(0)`; `SEND_RAMP_SECONDS = 0.05`; `AudioEngine.updateRobotSends(id,
{ reverb?, delay? })` per spec §4 (clamped, ramp-or-set, devWarn no-op). `reserveVoice`'s signature is not
widened. Nothing calls `updateRobotSends` yet.

**Acceptance criteria:**
- [ ] `reserveVoice` creates two send gains at `0`, each connected from `busFilter` and to its room; the dry connection to the chain entry is still made; with the rooms absent it connects no send to anything and does not throw.
- [ ] `updateRobotSends(id, { reverb: 0.3 })` ramps only the reverb gain to `0.3` over `0.05 s` (or sets `.value` when `rampTo` is absent); `{ delay: 7 }` clamps to `1`; an empty object is a no-op.
- [ ] No composite reserved → `devWarn`, no throw.
- [ ] `releaseVoice` disconnects and disposes both gains; re-reserving the same id does not orphan the old ones (the `storeVoice` replace path).
- [ ] A robot with both sends at `0` has no path to either room except through its two gains.

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts`

**Dependencies:** T1, T2. **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`. **Scope:** M.

### Task 4: Reservation sites prime the sends from the store

**Description:** After each reservation, unconditionally call `AudioEngine.updateRobotSends(robot.id, {
reverb: robot.reverbSend, delay: robot.delaySend })`: in `loadInstruments`' post-load pass, inside
`reReserveVoice` (after `reserveVoice`, beside Pan's prime, so every caller is covered), and in
`spawnSystem.ts` at the spawn reservation and `reRegisterAllRobotsAudio`. A per-file count scan guards a
fifth site.

**Acceptance criteria:**
- [ ] Spawning a robot with `reverbSend: 0.3, delaySend: 0.1` leaves its two gains at those values (the mock gains record the ramp targets).
- [ ] `loadInstruments`' post-load pass primes every store robot; `reReserveVoice` re-primes after its release; `reRegisterAllRobotsAudio` primes each robot.
- [ ] **Scan:** for every non-test `src/**/*.ts(x)` file, the number of `updateRobotSends(` calls is at least the number of `reserveVoice(` calls (excluding the definition); a deliberately unprimed temporary call makes the scan fail (mutation).
- [ ] A robot re-reserved after a structural edit keeps its sends (reserve, prime, `reReserveVoice`, assert the new gains hold the stored values).

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts src/systems/spawnSystem.test.ts`

**Dependencies:** T1, T3. **Files:** `src/engine/AudioEngine.ts`, `src/systems/spawnSystem.ts` (+ tests). **Scope:** S.

### Task 5: Seeded spread — `generateRobotSends`

**Description:** `generateRobotSends(noiseMap, offset)` in `spawnSystem.ts` per spec §1.2: draws
`robot.send.reverb`, `robot.send.delay`, `robot.send.delay.quiet` from `GLOBAL_AUDIO_LOADING_RANGES['reverb.wet'
| 'delay.wet']`, quantized in percent space; the `alea` fallback path mirrors Volume's. The robot literal
replaces T1's placeholder with the helper; `RobotAudioBaseline` gains `reverbSend` / `delaySend`;
`generateRobotAudioBaseline` calls the same helper **outside** the copy branch.

**Acceptance criteria:**
- [ ] Every spawned robot's `reverbSend` is in `[0.1, 0.4]` and `delaySend` is `0` or in `[0, 0.3]`, both multiples of `0.01`.
- [ ] The same locale spawns identical sends twice (determinism); no existing key's value changed (the existing seed-determinism oracle for a fixed locale differs only by the two new keys).
- [ ] **Parity:** for every index of a fixed roster, `generateRobotAudioBaseline(...)`' sends equal the spawned robot's sends, copy-branch robots included. **Mutation:** compute the baseline's sends inside the non-copy branch and this goes red.
- [ ] Over a large sample, roughly a quarter of robots have `delaySend === 0` (a loose statistical bound).
- [ ] The three new data-ids are the only new `getSeededVal` keys.

**Verification:**
- [ ] `npx vitest run src/systems/spawnSystem.test.ts`

**Dependencies:** T1. **Files:** `src/systems/spawnSystem.ts`, `.test.ts`. **Scope:** S.

### Task 6: Global wet is a fixed return; the seeder stops drawing it

**Description:** `DEFAULT_GLOBAL_AUDIO_SETTINGS.reverb.wet` / `delay.wet` become `1` with "return level" doc
comments; `generateGlobalAudioSettings` sets both from the defaults, with the `globalAudio.delay.quiet` draw
and the local `DELAY_QUIET_THRESHOLD` deleted; `GLOBAL_AUDIO_LOADING_RANGES`' two wet rows keep their values
and gain a comment that they are the per-robot send bands; `transmissionPresets.ts` sets both `wet` to `1` in
all three presets. The seed oracle in `globalAudioSeed.test.ts` is **hand-edited** in exactly the four
`reverb.wet` / `delay.wet` values (both oracles) to `1`, and its header comment updated to say why.

**Acceptance criteria:**
- [ ] `generateGlobalAudioSettings` returns `reverb.wet === 1` and `delay.wet === 1` for several style ids.
- [ ] The two oracles differ from `main` in `reverb.wet` and `delay.wet` and **in nothing else** (a diff of the test file shows only those values plus the header text); every other field is byte-identical, proving no other draw moved.
- [ ] The old quiet-delay tests are replaced, not duplicated; the three presets pass their existing shape tests with `wet: 1`.
- [ ] `grep -rn DELAY_QUIET_THRESHOLD src` finds nothing outside the constant's replacement.

**Verification:**
- [ ] `npx vitest run src/utils/globalAudioSeed.test.ts src/types/globalAudio.test.ts src/data/transmissionPresets.test.ts src/data/globalAudioLoadingRanges.test.ts`
- [ ] `npm run build:types`

**Dependencies:** T2 (the return semantics must exist before a default of `1` is meaningful). **Needs
Crawford's answer on the seed-oracle edit (spec §7 item 5).** **Files:** `src/utils/globalAudioSeed.ts`,
`src/types/globalAudio.ts`, `src/data/transmissionPresets.ts`, `src/data/globalAudioLoadingRanges.ts`,
tests. **Scope:** M.

### Checkpoint A: Engine and data
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Proves: the rooms are return-driven and mode-correct (T2); a robot's sends reach the rooms and are primed at every reservation (T3–T4); a fresh world has a seeded near/far spread that matches its baseline (T5); the global wet is a fixed full return (T6).
- [ ] **Manual (Crawford, `npm run dev`):** power on a fresh world: echo is audible and differs robot to robot; nothing clicks; flipping Decay Mode mid-play keeps every robot's echo. There is no UI for the sends yet — this is a listen, not a tuning pass.
- [ ] Reviewed with Crawford before Phase 2.

---

## Phase 2: The robot-screen slice

### Task 7: `applyReverbSend` / `applyDelaySend`

**Description:** The two actions in `robotOptionsActions.ts` per spec §1.5, beside `applyVolume`, plus an
exported `clampSend(fraction)` helper the company hook reuses. They do **not** cancel swells (the callers do).

**Acceptance criteria:**
- [ ] `applyReverbSend(r, l, 40)` → `updateRobot` with `{ reverbSend: 0.4 }` and `updateRobotSends(id, { reverb: 0.4 })`; `150` clamps to `1`; `-5` to `0`.
- [ ] `applyDelaySend` mirrors with `delaySend` / `delay`.
- [ ] Neither imports `audioSwells` (no cycle — the swell module imports these).

**Verification:**
- [ ] `npx vitest run src/systems/robotOptionsActions.test.ts`

**Dependencies:** T1, T3. **Files:** `src/systems/robotOptionsActions.ts`, `.test.ts`. **Scope:** S.

### Task 8: Content and schemas

**Description:** `probe.reverbSend` and `probe.delaySend` in `src/content/copy/probe.ts` (human + placeholder
lore + `unit: '%'` + help, spec §1.8); `probe.levels.intro.humanDescription` gains a sentence on Reverb and
Delay; `fleet.reverb.amount` / `fleet.delay.amount` and the two Fleet Params section intros are reworded as
the master returns; `REVERB_SEND_SCHEMA` / `DELAY_SEND_SCHEMA` in `robotOptionsConfig.ts`
(`sliderLinear`, `0…100`, step `1`, `labels(...)`). No component reads them yet.

**Acceptance criteria:**
- [ ] `labels('probe.reverbSend')` and `('probe.delaySend')` resolve with `human`, `lore`, `unit` and `help`; both schemas carry the `help` spread.
- [ ] `content.test.ts` is green with **no exemption**; if it enumerates the Levels section's reachable keys, the two new ones are added.
- [ ] The relabelled global amounts no longer say "blended in with the original sound"; their keys are unchanged.
- [ ] No display string appears in `robotOptionsConfig.ts` (the ESLint guard passes).

**Verification:**
- [ ] `npx vitest run src/content src/data/robotOptionsConfig.test.ts`
- [ ] `npm run lint`

**Dependencies:** None. **Files:** `src/content/copy/probe.ts`, `src/content/copy/fleet.ts`,
`src/data/robotOptionsConfig.ts`, content tests. **Scope:** M.

### Task 9: `AudioSettingSection` Reverb and Delay rows

**Description:** `AudioSettingValue` gains `reverbSend` / `delaySend`; the props gain `onReverbSendChange` /
`onDelaySendChange`; two rows after the Pan row, each a `SliderLinear` in a wrapper div with no `display:flex`
(the Volume row's reason), value `send × SEND_DISPLAY_SCALE`. The required props force a **bridge** at both
call sites: `RobotScreen.tsx` passes the stored fields and no-op handlers, `useCompanyOptions.ts` passes
`reverbSend: 0, delaySend: 0` and no-op handlers, so the company rows are inert until T14.

**Acceptance criteria:**
- [ ] The section renders Volume, Pan, Reverb, Delay in that order; the Reverb slider shows `reverbSend × 100`, a drag calls `onReverbSendChange` with the display number; Delay mirrors.
- [ ] Labels come from `CONTENT`; no literal in the component.
- [ ] The wrapper divs carry no `display:flex` (scanned in a test via `readFileSync`, as the Pan CSS rule is).
- [ ] The section stays `memo`-stable: re-rendering with identical props does not re-render the sliders.

**Verification:**
- [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx`
- [ ] `npm run build:types`

**Dependencies:** T8. **Files:** `src/components/robot/AudioSettingSection.tsx`, `.css`, `.test.tsx`,
`RobotScreen.tsx` and `useCompanyOptions.ts` (bridge only). **Scope:** M.

### Task 10: `RobotScreen` wiring

**Description:** `useRobotSubsectionRenderer`: the `audioSettingValue` memo gains `reverbSend` / `delaySend`
and their deps; `handleReverbSendChange` / `handleDelaySendChange` → `applyReverbSend` / `applyDelaySend`
via `latestRobot`, `useCallback([localeId])` like the volume handler. Replaces T9's bridge on this screen.

**Acceptance criteria:**
- [ ] Moving the Reverb slider on a robot calls `applyReverbSend` with that robot and the display number; the store and the engine (mock) both receive it.
- [ ] The memo recomputes when `reverbSend` changes and not when an unrelated field does.
- [ ] The existing `RobotScreen` suite passes unmodified apart from the new value fields.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx`

**Dependencies:** T7, T9. **Files:** `src/components/panels/screen/screens/RobotScreen.tsx`, `.test.tsx`. **Scope:** S.

### Checkpoint B: One robot, end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] **Manual (Crawford, `npm run dev`):** pick a probe; Reverb and Delay sliders sit under Pan at the seeded values; dragging each audibly changes that probe's echo without a click; 0 / 0 is completely dry beside a wet neighbour; turning the probe's Volume down fades its echo with it; the "?" popovers read right; the global Reverb / Delay sliders in Fleet Params now sweep every probe's echo together and 0 silences the room.
- [ ] Reviewed with Crawford before Phase 3.

---

## Phase 3: Swells move to the robots

### Task 11: The global swell pool loses `delay.wet` and `reverb.wet`

**Description:** `SwellGlobalTargetId` becomes `GlobalLfoTargetId`; `SWELL_GLOBAL_TARGET_IDS` drops the two
`wet` ids (9 → 7); `GLOBAL_TARGET_META` loses their rows and `GlobalSwellEffectKey` loses `'delay'` /
`'reverb'`; `isGlobalTargetAtOffEquivalent` and its uses in `isGlobalTargetEligible` and `advanceGlobalSwell`
are deleted; `sessionDiff.ts`' `applyGlobalSwellBasesToAudio` loses its Delay and Reverb blocks. The old
global-`wet` swell and off-equivalent tests are deleted with the code they covered.

**Acceptance criteria:**
- [ ] `SWELL_GLOBAL_TARGET_IDS` equals the 7 `GlobalLfoTargetId`s exactly (length 7, no duplicates); the existing "9" assertions are rewritten, not duplicated.
- [ ] Over many seeded ticks no global swell ever targets `delay.wet` / `reverb.wet`, and the remaining 7 still start, advance and return exactly to base (the existing global-swell suite passes).
- [ ] `isGlobalTargetSwelling('delay', 'wet')` returns `false`; the Fleet Params sliders render unchanged.
- [ ] A session saved mid-swell on a remaining global target still stores its base value.

**Verification:**
- [ ] `npx vitest run src/types/audioSwell.test.ts src/systems/audioSwells.test.ts src/utils/sessionDiff.test.ts`
- [ ] `npm run build:types`

**Dependencies:** None (needs Crawford's "move, not copy" answer, spec assumption 13). **Files:**
`src/types/audioSwell.ts`, `src/systems/audioSwells.ts`, `src/utils/sessionDiff.ts` (+ tests). **Scope:** M.

### Task 12: The robot swell pool gains `reverbSend` and `delaySend`

**Description:** `SwellRobotAttributeId` and `SWELL_ROBOT_ATTRIBUTE_IDS` gain the two ids (17 → 19, doc
comment corrected); `ROBOT_SWELL_FIELD_RANGE` gains `{ min: SEND_MIN, max: SEND_MAX }` for each;
`readRobotValue` / `writeRobotValue` handle them (write through `applyReverbSend` / `applyDelaySend` with
`value * SEND_DISPLAY_SCALE`); `isRobotAttributeStructurallyLive` is live only while the stored send is `> 0`.

**Acceptance criteria:**
- [ ] A robot swell on `reverbSend` ramps the stored field out and back, each tick writing through `applyReverbSend` (spy), and lands **exactly** on its base value; `isRobotAttributeSwelling(id, 'reverbSend')` is true while active.
- [ ] **Mutation:** make `writeRobotValue` skip the send branch and the write-through test goes red.
- [ ] A send of `0` is never picked (`isRobotAttributeEligible` false); a send of `0.25` is; both single-robot and company-wide starts can pick the new attributes, each member swelling from its own base.
- [ ] `ROBOT_SWELL_FIELD_RANGE` has exactly one row per id; the 19-id count test passes.

**Verification:**
- [ ] `npx vitest run src/types/audioSwell.test.ts src/systems/audioSwells.test.ts src/data/audioSwellRanges.test.ts`

**Dependencies:** T7, T11. **Files:** `src/types/audioSwell.ts`, `src/data/audioSwellRanges.ts`,
`src/systems/audioSwells.ts` (+ tests). **Scope:** M.

**As shipped (deviation):** `writeRobotValue` does not write through `applyReverbSend` / `applyDelaySend` with
`value * SEND_DISPLAY_SCALE`. `x * 100 / 100 !== x` for about 15 % of doubles (0.007, 0.013, 0.7123456789 …), and a
seeded send is any double, so "lands exactly on its base" could not hold through the percent actions. `robotOptionsActions`
gains `applyReverbSendValue` / `applyDelaySendValue` (the stored 0..1 fraction; NaN dropped, clamped); the two percent
actions now delegate to them, so the slider path is unchanged. The swell tick calls the `*Value` pair, and the spy and
mutation tests target it. The sends are appended last in `SWELL_ROBOT_ATTRIBUTE_IDS`, so no earlier index-based pick
moved. (Volume has the same percent round trip in `applyVolume`; left alone, out of scope.)

### Task 13: Swell flags and hand-edit cancel on the robot screen

**Description:** `AudioSettingSection` gains `reverbSendSwelling?` / `delaySendSwelling?`, forwarded to the
sliders' `swelling` prop; `RobotScreen` computes them with `isRobotAttributeSwelling` next to
`volumeSwelling`, and its two send handlers call `cancelSwellForRobotAttribute(id, 'reverbSend' |
'delaySend')` before the apply (the `handleVolumeChange` shape).

**Acceptance criteria:**
- [ ] With a swell active on `reverbSend`, the Reverb slider receives `swelling` true (no double easing) and Delay receives false.
- [ ] Dragging the Reverb slider mid-swell cancels that swell (`isRobotAttributeSwelling` false afterward) and applies the typed value, not the swell's.
- [ ] The existing Volume swell tests are unchanged and green.

**Verification:**
- [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/panels/screen/screens/RobotScreen.test.tsx`

**Dependencies:** T10, T12. **Files:** `src/components/robot/AudioSettingSection.tsx`, `.test.tsx`,
`RobotScreen.tsx` (+ test). **Scope:** S–M.

---

## Phase 4: Companies and persistence

### Task 14: Company broadcast

**Description:** `CompanyOptionsSnapshot` gains `reverbSend?` / `delaySend?`; `resolveCompanyOptions` falls back
to `firstMember.reverbSend ?? 0` / `delaySend ?? 0`; `useCompanyOptions`: `DISABLED_AUDIO_SETTING` gains
`reverbSend: 0, delaySend: 0`, the `audioSettingValue` memo adds the two resolved locals,
`reverbSendSwelling` / `delaySendSwelling` come from the first member, and `onReverbSendChange` /
`onDelaySendChange` loop `cancelSwellForRobotAttribute` + `applyReverbSend` / `applyDelaySend` over members and
`patchSnapshot` the clamped fraction. `CompanyOptionsSection` passes the handlers and flags. Replaces T9's
bridge.

**Acceptance criteria:**
- [ ] `resolveCompanyOptions` returns the first member's sends with no snapshot and the snapshot's with one.
- [ ] `onReverbSendChange(40)` calls the cancel and `applyReverbSend` once per member with 40 and records `{ reverbSend: 0.4 }`; Delay mirrors.
- [ ] `audioSettingValue` `toEqual`s include the two fields (existing assertions updated, not duplicated); the two handlers' identities are stable across an unrelated edit.
- [ ] A company-wide swell on `reverbSend` shows `swelling` true on the company slider.

**Verification:**
- [ ] `npx vitest run src/systems/companyOptions.test.ts src/components/company`

**Dependencies:** T7, T9, T13. **Files:** `src/types/Company.ts`, `src/systems/companyOptions.ts`,
`src/components/company/useCompanyOptions.ts`, `CompanyOptionsSection.tsx` (+ tests). **Scope:** M.

### Task 15: Session diff, restore and prime

**Description:** `RobotAudioOverrideDiff` gains `reverbSend?` / `delaySend?` (`session.ts`);
`computeRobotAudioOverrideDiff` compares `roundToDecimals(extractSwellBaseValueIfActive(id, 'reverbSend') ??
live.reverbSend, 2)` with the baseline's and sets the key only when they differ (Delay likewise);
`buildRobotUpdates` applies a finite in-range value and ignores a non-finite or out-of-range one whole; the
apply loop primes the engine from the **stored, clamped** values, only when the diff carried a send.

**Acceptance criteria:**
- [ ] An untouched robot diffs to `{}` (including with a swell active on one of its sends); a robot moved one step diffs to `{ reverbSend: 0.35 }` (two decimals); a send equal to its seed after a round trip diffs to nothing.
- [ ] A session saved mid-swell stores the **base** send, not the interpolated one.
- [ ] Restoring `{ delaySend: 0 }` sets the field and calls `updateRobotSends(id, { delay: 0 })`; a payload with no send key leaves the seeded values and makes no prime call.
- [ ] A non-finite or out-of-`[0,1]` value is ignored whole; a stored `7` primes `1`.
- [ ] **Mutation:** drop the two baseline fields from `generateRobotAudioBaseline` and the "untouched robot diffs to `{}`" test goes red.

**Verification:**
- [ ] `npx vitest run src/utils/sessionDiff.test.ts`

**Dependencies:** T3, T5, T12. **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts`, `.test.ts`.
**Scope:** S–M.

### Task 16: Share-link codec

**Description:** `CompactRobotOverrideDiff` gains `rs?` / `ds?`; `toCompactRobotOverrideDiff` /
`fromCompactRobotOverrideDiff` mirror the `p` handling; a non-numeric, non-finite or out-of-`[0,1]` value is
dropped at decode. Payload `version` stays 2.

**Acceptance criteria:**
- [ ] `reverbSend` / `delaySend` round-trip through `rs` / `ds` with `toEqual`; absent keys stay absent.
- [ ] `rs: 'x'`, `rs: 3`, `rs: null` and `ds: -0.1` decode to no key.
- [ ] An existing link without the keys decodes identically to before (golden-link test unchanged).

**Verification:**
- [ ] `npx vitest run src/utils/sessionShareUtils.test.ts`

**Dependencies:** T15. **Files:** `src/utils/sessionShareUtils.ts`, `.test.ts`. **Scope:** XS–S.

### Checkpoint C: The whole feature, automated
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Proves: fields, engine, UI, swells, companies, session and link persistence all hold together.
- [ ] **Manual (Crawford):** save a session with one moved robot, reload: it is where you left it and every untouched robot is back at its seed; share link the same; a company move puts every member at one value; leave the fleet running and a probe's Reverb or Delay slider crawls out and back (a swell) and lands exactly where it started; dragging mid-swell cancels it.

---

## Phase 5: Guard, phone gate, listen

### Task 17: The docs/symbol guard test

**Description:** `src/docs/robotSendsDocs.test.ts`: (a) every code-shaped backticked identifier in the spec's §1
and §4 and in the lines the docs task (T20) edits exists in non-test `src/` (a declaration table for the
strict layer, a generic extractor with a `NOT_REPO_SYMBOLS` allow-list for the weaker one, the Pan guard's
shape); (b) no file under `src/components/robot/gem/` or `RobotBody.tsx` mentions `reverbSend` / `delaySend`;
(c) `docs/SESSION_STORAGE.md` names the sends as persisted and `masterVolume` as never persisted. Expected to
be red for (c) and any doc symbols until T20 lands, as the Pan guard was.

**Acceptance criteria:**
- [ ] (a)'s declaration table covers at least: `updateRobotSends`, `getGlobalReverbRoom`, `getGlobalDelayRoom`, `generateRobotSends`, `applyReverbSend`, `applyDelaySend`, `clampSend`, `SEND_RAMP_SECONDS`, `SEND_DELAY_QUIET_THRESHOLD`.
- [ ] (b) passes now; (a) passes now; (c) fails until T20 (documented in the status line).

**Verification:**
- [ ] `npx vitest run src/docs/robotSendsDocs.test.ts`

**Dependencies:** Checkpoint C. **Files:** `src/docs/robotSendsDocs.test.ts`. **Scope:** S.

### Task 18: Phone gate — **STOP for Crawford**

**Description:** The spec's pass/fail check. Re-baseline first if `main` has moved the chain since `ca2b6868`
(the series baseline in `scratchy-audio-phones.md`). Then on this branch with the same `?session=` world (seed
`alpha`, camera 0/50, all global defaults): the Pixel `?debug` HUD at **Full for 3:00** and **Standard for
3:00**, plus a before / after `npm run perf` on the desktop. Record both runs in `scratchy-audio-phones.md`.

**Acceptance criteria:**
- [ ] Full: 0 underruns in 3:00 (the baseline), Standard: no more underruns than its baseline.
- [ ] `npm run perf`: no long-task regression against the baseline table in `PERFORMANCE.md`.
- [ ] Any rise is treated as a wiring bug to find or a reason to back out — **no `LOAD_*_MIN` is added** (intent).

**Verification:** Crawford's runs; the numbers are written into the doc by whoever runs them.

**Dependencies:** Checkpoint C. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (but gated on a device).

### Task 19: Crawford's listen — **STOP**

**Description:** The spec §5 manual list, on headphones and then the Pixel: fresh world spread; a fully dry
robot beside a drenched one; Volume fades the echo; global sliders sweep and silence the rooms; Decay Mode flip
mid-play; click-free drags; save / reload / share; company move; swells (not too heavy a wash, §7 risk 2; no
swell on the Fleet Params Reverb / Delay Amount); keyboard; popovers. If the swell is too heavy, the follow-up
is a `SEND_SWELL_UPWARD_CEILING` via `clampSwellCeiling`, **only if Crawford asks**.

**Acceptance criteria:**
- [x] Crawford signs off the list (any line he does not report is recorded as "signed off as a whole", not individually confirmed, as the Pan record did).

**Dependencies:** T18. **Files:** none. **Scope:** XS.

---

## Phase 6: Docs

### Task 20: Docs

**Description:** `AUDIO_SYSTEM.md` (chain topology block, Decay Mode paragraph incl. the pre-existing copy
mismatch note, the bus diagram, the swell section's 7 / 19 counts and the removed global `wet` targets),
`SESSION_STORAGE.md`, `COMPANIES.md`, `ROBOT_DESIGN.md` (one line), `reference/GLOBAL_CHAIN_GRID.md`,
`reference/ROBOT_DATA_GRID.md`, `reference/SLIDER_VALUES.md`, `specs/archive/AUDIO_OUTPUT_DIAGNOSTIC.md` (the
pre-tap no longer includes echoes), `ideas/themes.md` (the wet bands now seed per-robot sends),
`intent/robot-sends.md` shipped banner, `todo/roadmap.md` 50.2 status and "as built" deltas, this file's
status line.

**Acceptance criteria:**
- [ ] `robotSendsDocs.test.ts` (including part c) is fully green; `npm test` passes in full.
- [ ] Every doc that named the old serial Delay → Reverb order or the 9-target global swell pool is corrected.
- [ ] The roadmap's 50.2 entry records: the seeded default, return gains, parallel rooms, explicit prime, swells on the robots, relabelled global amounts.

**Verification:**
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build`

**Dependencies:** T19. **Files:** the docs above (several, text only), no `src/`. **Scope:** M (many docs, no code).

### Checkpoint: Complete
- [ ] All spec §5 tests green; full suite green; lint, types and build clean.
- [x] Phone gate recorded (T18) and Crawford's listen signed off (T19).
- [ ] Remaining: Crawford's PR from `feature/palette-sends`; the untracked intent, spec and this plan need committing with it.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| The mix sounds noticeably different (parallel rooms, unfiltered room input, dry at unity) | Med | Accepted under the pre-v1 rule; Checkpoints A and B and T19 are listens |
| A fifth reservation site forgets the prime and a robot is silently dry | Med | T4's per-file count scan; the symptom is loud |
| Phone underruns after the topology change | High | T18 is a hard stop; a rise means find the wiring bug or back out, no threshold |
| `useCompanyOptions.ts` and `RobotScreen.tsx` are edited across T9, T10, T13, T14 | Low | Each task owns a distinct hunk; T9's bridge is the only throwaway code and T10 / T14 delete it |
| Two audioSwells edits (T11, T12) conflict | Low | Sequential, never in one commit |
| Merge with 50.1 (`Robot`, diff, codec, `AudioSettingSection`) | Low | No shared code path; `reserveVoice` untouched; textual conflicts resolved by whichever merges second |
| A send swell is too heavy a wash | Low | Returns exactly to base; follow-up ceiling via `clampSwellCeiling` only if asked |
| The seed-oracle test header forbids regenerating | Low | T6 is a narrow hand-edit with a diff-only-those-values check, and waits for Crawford's answer |

## Open Questions

Carried from spec §7: the parallel rooms (1), where the returns rejoin and the Decay Mode copy mismatch (2),
own-draw on copy-branch robots (3), swells *move* not copy (4), the oracle hand-edit (5). Answer 4 gates T11–T12;
answer 5 gates T6; the rest can be settled at Checkpoint A.
