# Implementation Plan: Robot Sends — One Table for the Five Sends

Spec: [docs/specs/ROBOT_SEND_TABLE.md](../specs/ROBOT_SEND_TABLE.md). Intent:
[docs/intent/robot-send-table.md](../intent/robot-send-table.md). Roadmap **55**. Branch **`refactor/robot-send-table`**
off `main` at `608c5b92` (the 50.7 merge; name is a proposal, Crawford creates branches, PRs and merges).

> **Status, 2026-10-22: Phase 0 done.** T1 committed on `refactor/robot-send-table` (created off `main` at `608c5b92`) as
> `9600610b`. The spec's §7 veto points 1–4 stand at their defaults; Q4 is answered (the public swell tick could be forced,
> no fallback). Next = Task 2.
>
> **Status, 2026-10-22: Phase 1 done (T2–T9), Checkpoint A automated half green.** T2 `33d423b7`, T3 `104f41be`,
> T4 `b2e65946`, T5 `16ba1af8`, T6 `080ca5d3`, T7 `97a564c1`, T8 `052b8f34`, T9 `fcd15684`. `npm test` 383 files /
> 14184 tests green; `build:types` clean; `lint` 0 errors (4 pre-existing warnings in `src/components/actors/scenery/`);
> `build` clean; the parity test has one commit. Deviation: T5's scan deletion landed in T4 (see T4's As built). Open
> for Checkpoint A: none. **Checkpoint A passed** (Crawford's smoke listen + review, 2026-10-22). Next = Task 10.
>
> **Status, 2026-10-22: Phase 2 done (T10–T13), Checkpoint B automated half green.** T10 `0c28a392`, T11 `14308703`,
> T12 `48e554e2`, T13 `99415dda`. Deviations: T10's new props are a union (onSendChange *or*
> the old five) rather than plain optionals, and `SendRow` has no `useCallback`; T11's `useSendSwellingFlags` takes no
> `source` (it re-reads every render, as the five reads did); T13 added a third guard's entry (`robotPanDocs`) that T15
> removes. **Checkpoint B passed** (Crawford's `npm run dev` pass and look, 2026-10-22). Next = Task 14.
>
> **Status, 2026-10-22: COMPLETE on the branch (T1–T15); Checkpoint Complete's automated half green.** T14 `075281b8`,
> T15 `c5cd454b`. `npm test` 383 files / 14213 tests green apart from the documented-flaky `sceneToOrbiterLocal`
> timeout; `build:types`, `lint` (0 errors, the 4 scenery warnings) and `build` clean; the parity test still has its one
> commit. Deviations: T14 needed a fourth guard's temporary entry (`robotArticulationDocs`), removed with T13's
> `robotPanDocs` one in T15; T15 edited a few more stale send lines than the plan listed, and left `roadmap.md:1630`
> (50.2's As built) as history. Open: Crawford's closing listen, the `code-review-and-quality` pass, the PR.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`. No
phone gate and no `npm run perf:audio` (spec assumption 13).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence"; this file is both the plan and the task list.)

---

## Overview

A behaviour-free refactor. The five per-robot sends (Reverb, Delay, Grit, Shimmer, Double) are spelled out one field at a
time in about fifteen places on `main`; after this plan each is one row of `ROBOT_SENDS` in a new `src/data/robotSends.ts`
and every consumer — the four reservation primes, the engine's gain build and write, the actions, the swell tick, both
screens, the five schemas and rows, the seven field-list copies, the session diff and the share codec — iterates it. The
ten named actions (`applyReverbSend` … `applyDoubleSendValue`) and the regex reservation scan are deleted. A parity test
recorded against the branch base before the first refactor commit is the oracle; the full suite is the second check;
Crawford's listen is the confirmation. Fifteen tasks in three phases, every one leaving the suite green.

## Architecture Decisions

- **Additive, then migrate, then delete.** The new table, helper and action pair land beside the old code (T2, T6); each
  consumer moves across in its own task; the old names go in one deletion task at the end (T14) once nothing reads them.
  `AudioSettingSection` carries its new props as *optional* beside the old ten for two tasks (T10–T12), the 50.7 T11→T14
  precedent, and T13 makes them required and drops the ten. Every task's suite is green; no task needs the next to compile.
- **The parity oracle is recorded at the branch base** (spec assumption 11): T1 commits the test against unchanged code,
  with the branch-base hash in its header, and the recording is never edited. "RED first" for T1 means the test is run once
  with empty expectations to prove it reads real values, then the recorded values make it green.
- **The docs guards are re-pinned in the task that moves each symbol**, never in a sweep: a task that renames or deletes a
  pinned name re-pins its `declared` row and, if the "spec §1 to §4" or `UPDATED_DOCS` scan then reports the old name,
  adds it to that guard's `NOT_REPO_SYMBOLS` with a comment naming this spec (the `SEND_DELAY_QUIET_THRESHOLD` precedent).
  The two guards are `src/docs/robotSendsDocs.test.ts` and `src/docs/robotEffectSendsDocs.test.ts`.
- **Content keys are literals in the table** (spec assumption 1): `content.test.ts` greps consumer source for the quoted
  key, so T2's rows carry `contentKey: 'probe.reverbSend'` typed as `` `probe.${RobotSendField}` ``, and T2's test asserts
  each literal is present in the module's source text.
- **Table order is today's order** (spec assumption 2) and every loop runs in it: the prime, the engine write, the rows,
  the codec's keys, the swell pool's tail. T1's `JSON.stringify` recordings and share-string recording catch a slip.
- **Two key spaces, one mapping** (spec assumption 3): the engine speaks `SendEngineKey`, everything else speaks
  `RobotSendField`; `engineKeyOf` / `sendFieldOf` in `robotSends.ts` are the only translation.
- **Named fields stay on `Robot`, the baseline, the diff, the snapshot, `CompactRobotOverrideDiff` and `AudioSettingValue`**
  (spec assumptions 6, 8). Only the code that copies between them iterates.
- **One commit per task, RED first**, imperative subject, the session's co-author line; commits only when Crawford says so.
  Edits with the Edit tool, not shell scripts (the big-heredoc failures); the working tree is CRLF under autocrlf, the
  index LF — match each file's siblings.

## Dependency Graph

```
T1 parity oracle (at the branch base; no production change)
 │
 ▼
T2 robotSends.ts: table, types, engineKeyOf / sendFieldOf / robotSendLevels; ROBOT_SEND_FIELDS moves
 ├──► T3 VoiceEntry.sends record; buildSendGains; reserveVoice connect loop; disposeVoiceNodes
 │     └──► T4 updateRobotSends(Partial<Record<SendEngineKey>>) loop; the two AudioEngine primes → robotSendLevels
 ├──► T5 spawnSystem's two primes → robotSendLevels; reservationSendsPrime.test.ts deleted
 ├──► T6 applySend / applySendValue added beside the ten
 │     └──► T7 swell tick → applySendValue; SEND_ATTRIBUTES → ROBOT_SEND_FIELDS
 ├──► T8 the field-list copies: audioSwellRanges, audioSwell pool, localeStore clamp, companyOptions fallbacks
 ├──► T9 sessionDiff loops; sessionShareUtils codec loops
 │
 │   ── Checkpoint A ──
 │
 └──► T10 ROBOT_SEND_SCHEMAS; SendRow; rows from the table; onSendChange / sendSwelling as OPTIONAL props
       ├──► T11 useSendSwellingFlags; RobotScreen → one handler, two props      (needs T6)
       ├──► T12 useCompanyOptions → one broadcast handler; CompanyOptionsSection (needs T6, T11's hook)
       └──► T13 AudioSettingSection drops the ten old props; new props required (needs T11, T12)

     ── Checkpoint B (Crawford's look) ──

T14 the ten named actions deleted; robotOptionsActions.test rewritten; guards re-pinned   (needs T7, T11, T12)
T15 docs: historical specs' header notes, living docs' send lines, roadmap 55 As built     (needs everything)

     ── Checkpoint: Complete (Crawford's listen, PR) ──
```

T3→T4, T6→T7 and T10→T11→T12→T13 are chains; T5, T8 and T9 are independent of each other and of T3/T4 once T2 is in.

---

## Phase 0: The oracle

### Task 1: The parity test, recorded at the branch base — **before any other change**

**Description:** `src/systems/robotSendsParity.test.ts` (spec assumption 11, §5 "The parity test"), committed against
unchanged code with the branch-base hash in its header comment and a "never re-record" note (the 50.7 T1 pattern,
`spawnSystem.test.ts:838–855`). Five groups: **(a) seeds** — `generateRobotRosterBaseline(createNoise2D(alea(seed)), 12)`
for two seeds, every robot's five sends; **(b) primes in order** — `vi.spyOn(AudioEngine, 'updateRobotSends')` recording
`[robotId, JSON.stringify(sends)]` per call for `spawnRobot(localeId)` on a fixture locale, `reRegisterAllRobotsAudio(localeId)`,
`AudioEngine.reReserveVoice(robotId)`, `applySessionPayload(payload)` whose one robot diff carries three of the five sends,
`applySessionPayload(decodeSessionPayload(encodeSessionPayload(payload)))`, and one `tickAudioSwells(localeId, 0)` with
the pick forced onto a send the way `audioSwells.test.ts`'s robot-pool cases force theirs (the mocked attenuation-style
noise map); **(c) the share string** — `encodeSessionPayload` of a payload whose robot diff carries all five sends at
distinct values equals the recorded string and `decodeSessionPayload` gives the diff back; **(d) the store clamp** —
`updateRobot(localeId, id, { reverbSend: 7, delaySend: NaN, gritSend: -1 })` leaves `1`, the stored value, `0`; **(e) the
swell pool** — `SWELL_ROBOT_ATTRIBUTE_IDS` equals the recorded 22-entry literal. Every fixture send is a distinct
non-default value (the parity-fixture memory rule). A self-check case asserts each recording is non-empty and the five
fixture sends are not all equal.

**Acceptance criteria:**
- [x] Run once with empty recordings: every group fails with a real value in the diff (the test reads the code, not a
  default). Then the recorded values are pasted in and the file is green on the unchanged branch base.
- [x] Group (b) has one recording per entry point, each a non-empty ordered list; the swell case either drives
  `tickAudioSwells` or, if a send pick cannot be forced, records a direct `applySendValue` call and says so in a comment
  (spec §7 Q4).
- [x] Mutation check by hand (not committed): reorder two keys in `spawnSystem.ts:995`'s prime literal → group (b) red;
  swap the `rs` / `ds` lines in `toCompactRobotOverrideDiff` → group (c) red; both reverted.

**Verification:**
- [x] `npx vitest run src/systems/robotSendsParity.test.ts` green; `npm run build:types && npm run lint`.

**As built (2026-10-22, `9600610b`):** 11 cases. Group (b) records `spawnInitialRoster` (twelve `spawnRobot` primes)
rather than a lone `spawnRobot`. The swell case drives the public tick: the forced start lands on robot 11's Delay send,
then the trigger is released so that one swell rides to its landing (15 writes). Group (c) uses an empty `globalAudio`
stand-in so the pinned string is about the robot diff, not the global defaults; the diff also carries `rd`, `p` and `dy`
so the sends' position in the wire object is pinned. Group (d) adds `shimmerSend: Infinity` (clamps to 1). Seven extra
hand mutants were also killed: the `reRegisterAllRobotsAudio` and `reReserveVoice` primes, `SEND_PRIME_KEYS` order (only
the share case sees it, as the three-send restore carries no Reverb), the store clamp list, the swell's Delay write, the
pool order and the `db` decode.

**Dependencies:** None (first commit on the branch). **Files:** `src/systems/robotSendsParity.test.ts` (new). **Scope:** S
(one file, many fixtures).

---

## Phase 1: Data, engine, persistence (nothing visible)

### Task 2: `src/data/robotSends.ts` — the table, the two key spaces, the three helpers

**Description:** The new module of spec §1.1: `ROBOT_SEND_FIELDS` and `RobotSendField` **move here** from
`robotSendLoadingRanges.ts` (which now imports the type; no re-export, spec assumption 1); `SendEngineKey`,
`SendShareCode`, `RobotSendSpec`, `ROBOT_SENDS` (five rows, `contentKey` as a quoted literal), `ROBOT_SEND_BY_FIELD`,
`ROBOT_SEND_BY_ENGINE_KEY`, `engineKeyOf`, `sendFieldOf`, `robotSendLevels(robot)`. `spawnSystem.ts:36`'s
`type RobotSendField` import moves to the new module. The `robotEffectSendsDocs` `declared` row that pins
`ROBOT_SEND_FIELDS` in `robotSendLoadingRanges.ts` is re-pinned to `robotSends.ts`. Nothing reads the table yet.

**Acceptance criteria:**
- [x] `robotSends.test.ts`: `ROBOT_SENDS` equals the five rows of spec §1.1 (`toEqual`, order included);
  `ROBOT_SEND_FIELDS` equals `ROBOT_SENDS.map((s) => s.field)`; `sendFieldOf(engineKeyOf(f)) === f` for all five and
  `engineKeyOf(sendFieldOf(k)) === k` for all five keys; `robotSendLevels({ reverbSend: 0.31, delaySend: 0, gritSend: 7,
  shimmerSend: NaN, doubleSend: -1 })` returns `{ reverb: 0.31, delay: 0, grit: 7, shimmer: NaN, double: -1 }` with
  `Object.keys` in table order (no clamp, no rounding — the engine clamps); the module's source text contains each
  `'probe.<field>'` literal (a regex over `readFileSync`, so the content guard's contract is stated where it is relied on).
- [x] `robotSendLoadingRanges.ts` still exports `ROBOT_SEND_LOADING_RANGES`, `EXCLUSIVE_SEND_FIELDS`, `SEND_FIELD_ROOM`,
  `SendRoomKey` unchanged; `generateRobotSends` compiles and `spawnSystem.test.ts` is green.
- [x] Both docs guards and `content.test.ts` green (the five keys are now referenced from two consumer files).

**Verification:**
- [x] `npx vitest run src/data src/systems/spawnSystem.test.ts src/docs src/content`; `npm run build:types && npm run lint`.

**Dependencies:** T1. **Files:** `src/data/robotSends.ts` (new), `src/data/robotSends.test.ts` (new),
`src/data/robotSendLoadingRanges.ts`, `src/systems/spawnSystem.ts` (one import line), `src/docs/robotEffectSendsDocs.test.ts`.
**Scope:** M.

### Task 3: The voice entry's `sends` record — build, connect, dispose

**Description:** Spec §1.2, first half. `VoiceEntry` loses its five named `Tone.Gain` fields for
`sends: Readonly<Record<SendEngineKey, Tone.Gain>>`; `disposeVoiceNodes` iterates the sends in table order, then panner,
busGain, busFilter (today's order). In `AudioEngine.ts`: `buildSendGains(GainCtor | null)` returns a live `Gain(0)` per
`SendEngineKey` or `makeStubGain(0)` each; `sendTargetOf(key)` maps `reverb` → `getGlobalReverbRoom()`, `delay` →
`getGlobalDelayRoom()`, a room key → `getGlobalRoomInput(key)`; `reserveVoice`'s connect block becomes one loop over
`ROBOT_SENDS` (`busFilter → sends[key]`, then `sends[key] → target` when the target exists); both `storeVoice` calls pass
`sends`; the fallback path uses `buildSendGains(null)`. `updateRobotSends` only changes its reads (`entry.sends[key]`);
its signature and loop shape wait for T4. `AudioEngine.test.ts`'s `reserveVoice` / dispose cases read `entry.sends[key]`.
The two guards' voice-entry rows (`reverbSend: Tone.Gain;` and the three `${field}: Tone.Gain;`) are re-pinned to
`sends: Readonly<Record<SendEngineKey, Tone.Gain>>`.

**Acceptance criteria:**
- [x] After `reserveVoice`, the entry has five gains at 0 keyed `reverb` … `double`; each is connected from `busFilter`
  and, when its room exists, to that room (Reverb and Delay to their rooms, the three to `getGlobalRoomInput`); with no
  rooms built, no send has a downstream edge; the fallback entry has five stub gains.
- [x] `releaseVoice` disconnects and disposes the five, then the three, each in its own `attempt`.
- [x] `updateRobotSends` behaves exactly as before (its existing cases pass untouched); T1 green.

**Verification:**
- [x] `npx vitest run src/engine src/systems/robotSendsParity.test.ts src/docs`; `npm run build:types && npm run lint`.

**Dependencies:** T2. **Files:** `src/engine/audioEngine/voiceEntry.ts`, `src/engine/AudioEngine.ts`,
`src/engine/AudioEngine.test.ts`, `src/docs/robotSendsDocs.test.ts`, `src/docs/robotEffectSendsDocs.test.ts`. **Scope:** M.

### Task 4: `updateRobotSends` over the table; the two engine primes through `robotSendLevels`

**Description:** Spec §1.2, second half. `updateRobotSends(robotId, sends: Partial<Record<SendEngineKey, number>>)`: one
loop in table order — skip `undefined` and `NaN`, `rampOrSet(entry.sends[key].gain, clampSend(v), SEND_RAMP_SECONDS)`, and
for a key in `ROOM_KEYS` `setRoomFeeder(key, robotId, clampSend(v) > 0)`; the `roomSends` local goes. The prime literals at
`AudioEngine.ts:348` (`loadInstruments`) and `:1002` (`reReserveVoice`) become
`AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot))`. The two guards' `updateRobotSends` signature rows are
re-pinned to the `Partial<Record<SendEngineKey, number>>` form. The regex scan (`reservationSendsPrime.test.ts`) still
passes: its argument regex matches `robotSendLevels(robot)` as a non-literal and its key check is what T5 deletes — if it
goes red here, T5's deletion is pulled forward into this task and the plan note says so.

**Acceptance criteria:**
- [x] `updateRobotSends('r1', { grit: 0.3 })` ramps only the grit gain and calls `setRoomFeeder('grit', 'r1', true)`;
  `{ reverb: 7 }` clamps to 1 and calls no feeder; `{ delay: NaN }` writes nothing; `{}` writes nothing; no composite →
  devWarn, no throw. The order of writes for `{ double: 0.1, reverb: 0.2 }` is reverb then double (table order, not
  argument order).
- [x] The two prime cases in `AudioEngine.test.ts` assert the call argument `toEqual(robotSendLevels(robot))`.
- [x] T1 group (b)'s `reReserveVoice` recording still matches (the `JSON.stringify` key order is the table's).

**Verification:**
- [x] `npx vitest run src/engine src/systems/robotSendsParity.test.ts src/docs`; `npm run build:types && npm run lint`.

**Dependencies:** T3. **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`,
`src/docs/robotSendsDocs.test.ts`, `src/docs/robotEffectSendsDocs.test.ts`. **Scope:** S.

**As built (T4):** the regex scan **did** go red here (its literal-argument reader found only `spawnSystem.ts`'s two
primes, under the "at least four" floor), so T5's deletion was pulled forward: `reservationSendsPrime.test.ts` is deleted
in T4, and `robotEffectSendsDocs`' `PRIME_KEYS` row is replaced by one pinning both engine primes as
`robotSendLevels(robot)`. The feeder rule is written `key !== 'reverb' && key !== 'delay'` (narrows to `RoomKey`) rather
than a `ROOM_KEYS` membership test. The new `updateRobotSends` cases (all five at once, table write order, a stray key)
and the two prime cases are characterisation: green before and after; the RED was the two guards' re-pinned signature
rows. Seven hand mutants killed.

### Task 5: `spawnSystem`'s two primes; the regex scan goes

**Description:** The literals at `spawnSystem.ts:995` (`spawnRobot`) and `:1156` (`reRegisterAllRobotsAudio`) become
`AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot))`. `src/engine/reservationSendsPrime.test.ts` is deleted
(spec assumption 10); the `robotEffectSendsDocs` `declared` row that pins its `PRIME_KEYS` literal is removed. The
`spawnSystem.test.ts` prime cases assert `toEqual(robotSendLevels(robot))`.

**Acceptance criteria:**
- [x] `grep -rn "reverb: robot.reverbSend" src` finds nothing; `grep -rn "robotSendLevels(" src --include=*.ts | grep -v test`
  finds exactly four call sites (two in `AudioEngine.ts`, two in `spawnSystem.ts`).
- [x] `ls src/engine/reservationSendsPrime.test.ts` fails; both guards green.
- [x] T1 group (b)'s `spawnRobot` and `reRegisterAllRobotsAudio` recordings match.

**Verification:**
- [x] `npx vitest run src/systems src/docs`; `npm run build:types && npm run lint`.

**Dependencies:** T2 (T4 for the engine side to already read the record is not required: `updateRobotSends` accepts the
same keys either way). **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`,
`src/engine/reservationSendsPrime.test.ts` (deleted), `src/docs/robotEffectSendsDocs.test.ts`. **Scope:** S.

**As built (T5):** the scan and its guard row had already gone in T4 (see T4's note). T5 adds the twin guard row
pinning both `spawnSystem.ts` primes as `robotSendLevels(robot)` (the RED), and the two prime cases gain a
`robotSendLevels` and a key-order assertion beside their existing literal expectations, which stay as an independent
oracle (so the AC grep for `reverb: robot.reverbSend` finds those two test lines and no source). Two mutants killed.

### Task 6: `applySend` / `applySendValue` beside the ten

**Description:** Spec §1.3, additive. `applySend(robot, localeId, field, pct)` and `applySendValue(robot, localeId, field,
fraction)` in `robotOptionsActions.ts`, exactly today's rules (NaN dropped whole, `clampSend`, `updateRobot` with the one
field, `updateRobotSends` with `{ [engineKeyOf(field)]: value }`). The ten named functions stay for now — their callers
move in T7, T11 and T12 and they go in T14. No swell cancel here (the caller's job; the tick writes through it).

**Acceptance criteria:**
- [x] `robotOptionsActions.test.ts`, one `it.each` over the five fields: `applySend(robot, l, field, 40)` writes
  `{ [field]: 0.4 }` and calls `updateRobotSends(id, { [engineKeyOf(field)]: 0.4 })` once; `150` → `1`; `-5` → `0`;
  `applySendValue(…, 0.007)` writes `0.007` exactly (no display round trip); `NaN` writes nothing to either; neither
  calls `cancelSwellForRobotAttribute`.
- [x] Mutation check by hand: point `applySendValue` at `sendFieldOf` instead of `engineKeyOf` → the `it.each` red.

**Verification:**
- [x] `npx vitest run src/systems/robotOptionsActions.test.ts`; `npm run build:types && npm run lint`.

**Dependencies:** T2. **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`.
**Scope:** S.

### Task 7: The swell tick writes through `applySendValue`

**Description:** `audioSwells.ts`: `writeRobotSend`'s five-way switch becomes `applySendValue(robot, localeId, attribute,
value)` (the function can go, or stay as a one-line named step — the plan leaves that to the diff's readability);
`SEND_ATTRIBUTES` is deleted and `isSendAttribute` reads `ROBOT_SEND_FIELDS`; the five `*Value` imports go. The six
`apply*Send*` spies in `audioSwells.test.ts` become `applySendValue` spies asserting the `field` argument. If either guard's
"spec §1 to §4" scan reports `SEND_ATTRIBUTES` or `writeRobotSend`, they join `NOT_REPO_SYMBOLS`.

**Acceptance criteria:**
- [x] A send swell tick calls `applySendValue(robot, localeId, '<field>', fraction)` once per member per tick with the
  stored fraction, and lands exactly on its base at the end (the existing "lands exactly" case, re-spied).
- [x] `isSendAttribute` is true for the five and false for `'volume'` and `'adsr.attack'`.
- [x] T1 group (b)'s swell recording matches; the `isRobotAttributeStructurallyLive` send rule (a send at 0 is not
  picked) is unchanged (existing cases).

**Verification:**
- [x] `npx vitest run src/systems/audioSwells.test.ts src/systems/robotSendsParity.test.ts src/docs`;
  `npm run build:types && npm run lint`.

**Dependencies:** T6. **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`, the two guards if the
scan asks. **Scope:** S.

### Task 8: The field-list copies

**Description:** Four copies become reads of `ROBOT_SEND_FIELDS` (spec §1.5): `audioSwellRanges.ts`'s five rows → a spread
of `Object.fromEntries(ROBOT_SEND_FIELDS.map((f) => [f, { min: SEND_MIN, max: SEND_MAX }]))` (typed so the record stays
`Record<SwellRobotAttributeId, …>`); `types/audioSwell.ts`'s union ends in `| RobotSendField` and
`SWELL_ROBOT_ATTRIBUTE_IDS` ends in `...ROBOT_SEND_FIELDS` (the sends stay last; the comment about index-based picks stays);
`localeStore.ts:214`'s clamp loop iterates `ROBOT_SEND_FIELDS`; `companyOptions.ts:43–47`'s five fallbacks become a spread
over the fields with `?? 0`. The guards' rows that pin the `audioSwellRanges` literals and the pool's `'reverbSend',`
literals are re-pinned to the spread forms.

**Acceptance criteria:**
- [x] T1 group (e): `SWELL_ROBOT_ATTRIBUTE_IDS` equals the recorded literal (order included); group (d) matches;
  `audioSwell.test.ts`'s sorted-ids case, `localeStore.test.ts`'s send clamps and `companyOptions.test.ts`'s fallbacks pass
  unchanged.
- [x] `grep -rn "'reverbSend', 'delaySend', 'gritSend'" src --include=*.ts | grep -v test` finds only
  `src/data/robotSends.ts`.
- [x] Both guards green.

**Verification:**
- [x] `npx vitest run src/data src/types src/stores src/systems/companyOptions.test.ts src/systems/robotSendsParity.test.ts src/docs`;
  `npm run build:types && npm run lint`.

**Dependencies:** T2. **Files:** `src/data/audioSwellRanges.ts`, `src/types/audioSwell.ts`, `src/stores/localeStore.ts`,
`src/systems/companyOptions.ts`, the two guards. **Scope:** M (small edits, six files).

### Task 9: Session diff and share codec over the table

**Description:** Spec §1.5. `sessionDiff.ts`: `SEND_PRIME_KEYS` is deleted; the diff loop (`:336`) and the restore loop
(`:480`) iterate `ROBOT_SEND_FIELDS`; the prime (`:657`) becomes `Object.fromEntries(ROBOT_SEND_FIELDS.filter((f) =>
updates[f] !== undefined).map((f) => [engineKeyOf(f), updatedRobot[f]]))`. `sessionShareUtils.ts`: the encoder's five lines
(`:268–272`) become `for (const spec of ROBOT_SENDS) if (diff[spec.field] !== undefined) compact[spec.shareCode] =
diff[spec.field];` **at the same position** (after `p`, before `dy`); the decoder's five (`:302–307`) become the same loop
over `isSendFraction(compact[spec.shareCode])`. `CompactRobotOverrideDiff` keeps `rs` … `db` by name. If a guard's scan
reports `SEND_PRIME_KEYS`, it joins `NOT_REPO_SYMBOLS`.

**Acceptance criteria:**
- [x] T1 groups (b) (`applySessionPayload` and the decode-and-restore recordings) and (c) (the share string, byte for
  byte) match.
- [x] `sessionDiff.test.ts` and `sessionShareUtils.test.ts` pass unchanged (102 and 21 send mentions between them — they
  test behaviour, not the copies).
- [x] Mutation check by hand: move the encoder loop after `dy` → group (c) red; reverted.

**Verification:**
- [x] `npx vitest run src/utils src/systems/robotSendsParity.test.ts src/docs`; `npm run build:types && npm run lint`.

**Dependencies:** T2. **Files:** `src/utils/sessionDiff.ts`, `src/utils/sessionShareUtils.ts`, a guard if the scan asks.
**Scope:** S.

### Checkpoint A: Engine, data, persistence

- [x] `npm test` green (the parity test, both guards, `content.test.ts` included); `npm run build:types`, `npm run lint`,
  `npm run build` clean.
- [x] `grep -rn "SEND_PRIME_KEYS\|SEND_ATTRIBUTES\|reservationSendsPrime" src` finds only `NOT_REPO_SYMBOLS` entries.
- [x] The screens are untouched and still call the ten named actions — intended; Phase 2 moves them.
- [x] `npm run dev`: one world plays; a robot's five send sliders still move the sound (the screens are on the old path,
  so this is a smoke check of the engine, not of Phase 2).
- [x] Review with Crawford before Phase 2 (passed 2026-10-22: "everything sounds good").

---

## Phase 2: The screens

### Task 10: `ROBOT_SEND_SCHEMAS`, `SendRow`, rows from the table; the new props as optional

**Description:** Spec §1.4, first step. `robotOptionsConfig.ts`: `ROBOT_SEND_SCHEMAS: Readonly<Record<RobotSendField,
SliderLinearSchema>>` built by a map over `ROBOT_SENDS` (`id: \`robotOptions.${spec.field}\``, `...labels(spec.contentKey)`,
the shared min / max / step / orientation); the five named constants are deleted. `AudioSettingSection.tsx`: a memo'd
`SendRow({ spec, value, onSendChange, swelling, disabled })` child renders
`<div className={\`audio-setting-section__${spec.engineKey}-row\`}><SliderLinear schema={ROBOT_SEND_SCHEMAS[spec.field]}
value={toSendDisplay(value)} onChange={(pct) => onSendChange(spec.field, pct)} … /></div>` with a stable `useCallback`;
the five hand-written rows become `ROBOT_SENDS.map(…)`. The new props `onSendChange?` and `sendSwelling?` are **optional**
and, while absent, each row falls back to the old per-field prop (`onReverbSendChange` … / `reverbSendSwelling` …) through
a small lookup built once from the ten props — a transitional shim that T13 deletes. The guards' five schema rows
(`REVERB_SEND_SCHEMA` … `DOUBLE_SEND_SCHEMA`) are re-pinned to `ROBOT_SEND_SCHEMAS`; the five names join
`NOT_REPO_SYMBOLS` where the §1–4 scan asks. `content.test.ts`'s help walk reaches the record (it recurses exported
objects) and `isReferenced` finds the keys in `robotSends.ts`.

**Acceptance criteria:**
- [x] `AudioSettingSection.test.tsx`: five rows in table order with today's class names (`__reverb-row` … `__double-row`)
  and ids (`robotOptions.reverbSend` …); moving the Grit slider with `onSendChange` given calls `onSendChange('gritSend',
  40)` and no old handler; with only the old props given, it calls `onGritSendChange(40)`; `sendSwelling.gritSend` reaches
  the Grit slider's `swelling` alone; a change to `value.reverbSend` does not re-render the Grit `SendRow` (a render-count
  probe, the memo case).
- [x] `RobotScreen.test.tsx`, `CompanyOptionsSection.test.tsx` pass unchanged (they use the old props).
- [x] `content.test.ts` green with no `AWAITING_CONSUMER` entry; both guards green.

**Verification:**
- [x] `npx vitest run src/components/robot src/components/panels/screen/screens/RobotScreen.test.tsx src/components/company src/content src/docs`;
  `npm run build:types && npm run lint`.

**As built (T10):** three deviations, all small. (1) The new props are not plain optionals: `AudioSettingSection`'s
props are a union, *`onSendChange` (the old five then optional and ignored) **or** all five old handlers*, so neither
screen can leave a row unwired during the bridge and the existing "handlers are required" `@ts-expect-error` case still
holds. A new `@ts-expect-error` case pins "neither" as a type error. When `sendSwelling` is given it is the only flag
source (the five old flags are ignored). (2) `SendRow` is `memo`'d **without** a `useCallback`: the memo alone keeps its
inline `onChange` stable (it is rebuilt only when one of the row's own props changes, when the slider re-renders anyway),
so a `useCallback` mutant survived every probe and was deleted; `SendRow` is exported so a test can pin its memo, the
section's own `$$typeof` precedent. (3) `src/data/robotOptionsConfig.test.ts` was not in the file list but imported the
five names: its send `describe.each` reads `ROBOT_SEND_SCHEMAS`, and a new `ROBOT_SEND_SCHEMAS` block pins the record
(keys in table order, ids, words, five distinct objects, the five old names absent from the module). Guards: the three
schema rows are re-pinned to `ROBOT_SEND_SCHEMAS` (plus a row for the table-built schema and one for
`{ROBOT_SENDS.map((spec) => (<SendRow`); the §1–4 and living-docs scans reported the five old names, which joined both
guards' `NOT_REPO_SYMBOLS`. RED: the missing export (2 test files failed to load) and the 4 re-pinned guard rows. 14 hand
mutants plus 1 type-level mutant (loosening the union) killed. 79 files / 3806 tests green in the verification set.

**Dependencies:** T2 (Checkpoint A passed). **Files:** `src/data/robotOptionsConfig.ts`,
`src/components/robot/AudioSettingSection.tsx`, `src/components/robot/AudioSettingSection.test.tsx`, the two guards.
**Scope:** M.

### Task 11: `useSendSwellingFlags`; the robot screen on one handler and two props

**Description:** Spec §1.4. `useSwellingFlags.ts`: `useSendSwellingFlags(robotId, source): Record<RobotSendField,
boolean>` over `ROBOT_SEND_FIELDS`, the ADSR / layer hooks' overloads and `useMemo` shape. `RobotScreen.tsx`: the five
`isRobotAttributeSwelling` reads (`:205–209`) become `const sendSwelling = useSendSwellingFlags(robot.id, <the five send
values>)`; the five handlers (`:273–294`) become one `handleSendChange = useCallback((field, pct) => {
cancelSwellForRobotAttribute(latestRobot.current.id, field); applySend(latestRobot.current, localeId, field, pct); },
[localeId])`; the ten props at `:358–369` become `onSendChange={handleSendChange} sendSwelling={sendSwelling}`; the memo
deps (`:430–432`) list the two. The five action imports go. `RobotScreen.test.tsx`'s 20 action references become
`applySend` spies asserting `field`. If the §1–4 scan reports `handleReverbSendChange` etc., they join `NOT_REPO_SYMBOLS`.

**Acceptance criteria:**
- [x] Moving each of the five sliders on the robot screen calls `cancelSwellForRobotAttribute(id, field)` then
  `applySend(robot, localeId, field, pct)` once, in that order, with the latest robot (the existing "reads
  latestRobot" case, re-spied); Dynamics and Pan cancel nothing (unchanged cases).
- [x] `useSwellingFlags.test.ts`: the hook returns five flags, false by default, true for a field
  `isRobotAttributeSwelling` reports, and ~~recomputes when `source` changes~~ re-reads on every render (see As built).
- [x] The renderer's memo does not recompute on an unrelated robot change (the existing memo case still passes with the
  two new deps).

**Verification:**
- [x] `npx vitest run src/components/robot/useSwellingFlags.test.ts src/components/panels/screen/screens/RobotScreen.test.tsx src/docs`;
  `npm run build:types && npm run lint`.

**As built (T11):** one deviation. `useSendSwellingFlags(robotId)` takes **no `source`**: the five reads it replaces ran
on every render, and two existing `RobotScreen` cases pin why ("a flag that flips while the screen re-renders for an
unrelated field still reaches the section", once for Reverb/Delay and once per new send). A memo keyed on a send-value
source would have frozen the record on a battery tick and failed them. The hook reads the five every render and memoizes
the record on the five answers (a five-character key), so its identity holds while nothing flips and the renderer memo
and the memo'd section still bail on an unrelated change. All false (and nothing asked) without a robot, the company
screen's no-members rule, so T12 can use it unchanged. `RobotScreen.test.tsx`'s Levels stub now takes `onSendChange` /
`sendSwelling` (its probe buttons call `onSendChange(field, 40)`; a `data-has-old-send-props` attribute proves the ten old
props are no longer passed); every `apply<Name>Send` spy became an `applySend` spy asserting the field; a new `it.each`
over the five fields pins cancel-then-apply with the latest robot. `robotSendsDocs`' spec scan reported
`handleReverbSendChange` / `handleDelaySendChange`, which joined its `NOT_REPO_SYMBOLS`. 12 hand mutants killed.

**Dependencies:** T6, T10. **Files:** `src/components/robot/useSwellingFlags.ts`,
`src/components/robot/useSwellingFlags.test.ts`, `src/components/panels/screen/screens/RobotScreen.tsx`,
`src/components/panels/screen/screens/RobotScreen.test.tsx`, a guard if the scan asks. **Scope:** M.

### Task 12: Company broadcast on one handler

**Description:** Spec §1.4, §4's second sketch. `useCompanyOptions.ts`: the five `on*SendChange` (`:380–425`) become one
`onSendChange(field, pct)` — NaN → return; per member `cancelSwellForRobotAttribute(m.id, field)` then `applySend(m,
localeId, field, pct)`; with members, `patchSnapshot({ [field]: clampSend(pct / SEND_DISPLAY_SCALE) })`; the five swelling
flags (`:113–118`) become `sendSwelling` from the first member through `useSendSwellingFlags`; the `CompanyOptions`
interface drops its ten send members for the two. `CompanyOptionsSection.tsx:69–78` passes `onSendChange` and
`sendSwelling`. The 18 + 7 action references in the two tests become `applySend` spies; the `it.each` tables that carry
`action: 'applyGritSend'` / `handler: 'onGritSendChange'` (`useCompanyOptions.test.ts:849`,
`CompanyOptionsSection.test.tsx:459`) carry `field` instead. If the scan reports `onReverbSendChange` etc., they join
`NOT_REPO_SYMBOLS`.

**Acceptance criteria:**
- [x] `onSendChange('shimmerSend', 40)` with three members: three cancels then three `applySend(m, l, 'shimmerSend', 40)`
  in member order (the existing order case), and one `patchSnapshot({ shimmerSend: 0.4 })`; with no members, no patch;
  `NaN` → nothing at all (the existing cases, re-keyed).
- [x] The company Levels panel renders five rows bound to the snapshot's five named fields (unchanged `audioSettingValue`),
  and a member's send swell lights that row's `swelling` (the first-member rule, existing case).
- [x] `CompanyOptionsSection.test.tsx`'s per-row broadcast cases pass through `field`.

**Verification:**
- [x] `npx vitest run src/components/company src/docs`; `npm run build:types && npm run lint`.

**As built (T12):** as planned; `sendSwelling` comes from T11's `useSendSwellingFlags(firstMemberId)` (all false with no
members, as the five reads were). The existing cases use two members, not three; the order case
(`cancel:r1, apply:r1, cancel:r2, apply:r2`) runs per field. `CompanyOptionsSection.test.tsx`'s Reverb, Delay and the
Grit/Shimmer/Double `it.each` became one five-row `it.each` over `field`; its stub proves the ten old props are no longer
passed, and `useCompanyOptions.test.ts` asserts the options carry none of the ten per-field members. No guard scan reported
a company handler name, so neither guard changed. The first mutation pass left **two survivors**: an extra
`sendSwelling` dep on `onSendChange`, and `sendSwelling` missing from the options memo deps. Two cases were added (the
robot screen's flag-flip and handler-identity cases had no company twin), and both mutants were then killed; 12 of 12 in all.
Checkpoint B's grep (`apply<Name>Send` outside `robotOptionsActions.ts` and tests) finds nothing.

**Dependencies:** T6, T11 (the hook). **Files:** `src/components/company/useCompanyOptions.ts`,
`src/components/company/useCompanyOptions.test.ts`, `src/components/company/CompanyOptionsSection.tsx`,
`src/components/company/CompanyOptionsSection.test.tsx`, a guard if the scan asks. **Scope:** M.

### Task 13: `AudioSettingSection` drops the ten old props

**Description:** T10's shim goes: `onSendChange` and `sendSwelling` become the only send props (`onSendChange` required,
`sendSwelling` optional like `volumeSwelling`); the five `on*SendChange` and five `*SendSwelling` props and the fallback
lookup are deleted; `AudioSettingValue` keeps its five named fields (spec assumption 6). The guards' ten
`AudioSettingSection *SendSwelling prop` rows are re-pinned to `sendSwelling?: Readonly<Record<RobotSendField, boolean>>;`
and `onSendChange: (field: RobotSendField, pct: number) => void;`. `grep -rn "SendSwelling\b\|on[A-Z][a-z]*SendChange" src`
confirms no reader remains before the deletion.

**Acceptance criteria:**
- [x] `AudioSettingSection.test.tsx`'s old-props fallback cases are removed; a `@ts-expect-error` case shows the old props
  no longer type-check (the 50.7 T14 pattern); the five-rows, order, class-name, memo and `sendSwelling` cases pass.
- [x] `RobotScreen.test.tsx` and `CompanyOptionsSection.test.tsx` pass unchanged (both callers moved in T11 / T12).
- [x] Both guards green; `npm run build:types` clean.

**Verification:**
- [x] `npx vitest run src/components src/docs`; `npm run build:types && npm run lint`.

**As built (T13):** the bridge union, the five old handlers, the five old flags and the fallback lookup are gone;
`onSendChange` is required and `sendSwelling` optional (absent = nothing swelling). `AudioSettingSection.test.tsx` is
migrated: the shared `LEVEL_NOOPS` is now `{ onSendChange, onDynamicsChange }`, a `swells(...fields)` helper builds the
flag record, every per-handler / per-flag case now asserts `onSendChange(field, pct)` / `sendSwelling[field]` (the
re-render probes start from an all-false record, so the four unflipped rows see no prop change), the two bridge cases
are deleted, and a case per old prop (ten `@ts-expect-error` directives) plus a source scan pin their absence. The
"required props" case now pins `onSendChange` and the three values. RED: the ten unused directives under `build:types`
plus the source scan. The guards' swelling-prop rows were re-pinned to `sendSwelling?: Readonly<Record<RobotSendField,
boolean>>;` and `onSendChange: (field: RobotSendField, pct: number) => void;` (already green: T10 wrote those lines). The
ten old names joined **both** guards' `NOT_REPO_SYMBOLS`, and `onReverbSendChange` / `onDelaySendChange` also joined
**`robotPanDocs.test.ts`**'s, a third guard the plan did not name: its COMPANIES.md pan-lines scan reads `:93`, which cites
both. **T15 should drop that `robotPanDocs` entry once it rewrites the line.** 3 runtime mutants and 2 type-level
mutants (`onSendChange?`, a returning `reverbSendSwelling?`) killed.

**Dependencies:** T11, T12. **Files:** `src/components/robot/AudioSettingSection.tsx`,
`src/components/robot/AudioSettingSection.test.tsx`, the two guards. **Scope:** S.

### Checkpoint B: One robot and one company, end to end

- [x] `npm test` green; `npm run build:types`, `npm run lint`, `npm run build` clean. (383 files / 14238 tests; the one
  failure in the full run was the documented-flaky `sceneToOrbiterLocal` round-trip timing out at 5 s under load, which
  passes 10/10 alone. Lint 0 errors, the 4 scenery warnings.)
- [x] `grep -rn "applyReverbSend\|applyGritSend" src --include=*.ts --include=*.tsx | grep -v "test\|robotOptionsActions.ts"`
  finds nothing: the ten are now unreferenced outside their own module and test (T14 deletes them).
- [x] `npm run dev`: on a robot, move each of the five send sliders — the value sticks, the sound follows, a swell in
  flight on that send stops; on a company, move each — every member follows, the snapshot shows the value. Nothing reads
  or sounds different from `main`.
- [x] **Crawford's look** (passed 2026-10-22): the Levels block on both screens is pixel-for-pixel what it was (five rows, same order, same
  words, same help). Review before Phase 3.

---

## Phase 3: Delete, then docs

### Task 14: The ten named actions go

**Description:** `robotOptionsActions.ts` loses `applyReverbSend` … `applyDoubleSend` and `applyReverbSendValue` …
`applyDoubleSendValue` (`:58–115`); their doc comment moves onto the pair. `robotOptionsActions.test.ts`'s 12 old
references are removed (the T6 `it.each` is the coverage). Both guards: the `declared` rows for the ten names are re-pinned
to `applySend` and `applySendValue`; the ten names join `NOT_REPO_SYMBOLS` with a comment naming this spec (the historical
specs' §1–4 and the living docs still name them until T15); a new case in each guard asserts none of the ten is an
identifier anywhere in `src/` (the `setGlobalColourRoom` precedent, `robotEffectSendsDocs.test.ts:129`).

**Acceptance criteria:**
- [x] `grep -rn "apply\(Reverb\|Delay\|Grit\|Shimmer\|Double\)Send" src` finds only the two guards' `NOT_REPO_SYMBOLS`
  entries and removed-names cases (plus the three extras named in the As built).
- [x] Both guards green, including the new removed-names case; `npm run build:types` clean (no import of a deleted name
  survives).
- [x] T1 fully green; `npm test` green (383 files / 14175 tests; the one failure was the documented-flaky
  `sceneToOrbiterLocal` round-trip timing out at 5 s under load, 10/10 alone).

**Verification:**
- [x] `npx vitest run src/systems/robotOptionsActions.test.ts src/docs src/systems/robotSendsParity.test.ts` (31 files /
  1862 tests); `npm run build:types && npm run lint && npm test` (lint 0 errors, the 4 scenery warnings).

**As built (T14):** the ten functions are gone; the pair's doc comment now carries what the two old comments said (the
display/stored split, the caller-side swell cancel, the NaN rule, why the tick writes the fraction). `robotOptionsActions.test.ts`
drops the ten from its import and the two `describe.each` tables run on the five keyed rows alone (the same cases); a new
`describe` asserts each of the ten is not an export of the module, with a sanity case that `applySend` / `applySendValue` are.
Both guards: the `declared` rows re-pinned to the pair's signatures (`field: RobotSendField` included); a
`REMOVED_SEND_ACTIONS` list feeds both a new removed-names `it.each` (each name not an identifier in `src/`, plus a sanity
case that the pair is) and `NOT_REPO_SYMBOLS`; the extractor self-tests' example name moved from `applyReverbSend` /
`applyGritSend` to `applySend` (with the old names listed, the old example would be dropped). RED: 30 cases (10 per file).
**Deviation:** a fourth guard the plan did not name, `robotArticulationDocs.test.ts`, went red on deletion: its
articulation-lines scan reads `AUDIO_SYSTEM.md:420` (the swell pool line, which cites `applyReverbSendValue` /
`applyDelaySendValue`) and `COMPANIES.md:66` (the action list, `applyReverbSend` / `applyDelaySend`). Those four names
joined its `NOT_REPO_SYMBOLS` (the T13 `robotPanDocs` precedent). **T15 should drop that entry once it rewrites the two
lines.** The acceptance grep therefore also finds that entry, the actions test's not-exported list and `robotSendsDocs`'
line-filter regex (a filter, not a citation). 6 mutants killed, each by only its targeted case(s): a leftover non-exported
`applyGritSendValue` (both guards), a re-exported `applyDoubleSend` (the actions test), and a renamed parameter on each of
the pair (each guard's declared row).

**Dependencies:** T7, T11, T12 (every caller moved). **Files:** `src/systems/robotOptionsActions.ts`,
`src/systems/robotOptionsActions.test.ts`, `src/docs/robotSendsDocs.test.ts`, `src/docs/robotEffectSendsDocs.test.ts`.
**Scope:** S.

### Task 15: Docs

**Description:** Spec §2's `docs/` block. **Historical specs:** `docs/specs/ROBOT_SENDS.md` and
`docs/specs/ROBOT_EFFECT_SENDS.md` each gain a header note (the 50.7 amendment style) saying the actions, schemas, handlers,
field-list copies and the reservation scan are as refactored by roadmap 55 (link here); their §1–4 are not edited. **Living
docs**, the send lines only: `docs/AUDIO_SYSTEM.md:271` names `applySend` / `applySendValue` and `ROBOT_SEND_SCHEMAS`, and the
robot-sends paragraph names `ROBOT_SENDS` as the one table; `docs/COMPANIES.md:66`, `:95`, `:101` name `applySend` and
`onSendChange`; `docs/SESSION_STORAGE.md:155` names the `ROBOT_SEND_FIELDS` loops and `engineKeyOf`;
`docs/reference/ROBOT_DATA_GRID.md`'s send rows, if any symbol on them changed. **Roadmap:** item 55 gets an "As built"
(the table's home, the two key spaces, the optional-props bridge, the deleted names, the parity oracle, the `NOT_REPO_SYMBOLS`
precedent, any deviation recorded in this plan's status notes); its three "Open" bullets are marked answered (spec
assumptions 5, 6, 8). This plan's header status is brought to COMPLETE. The guards' `UPDATED_DOCS` cases stay green
(the old names on the rewritten lines are gone, so `NOT_REPO_SYMBOLS` is not doing the work there).

**Acceptance criteria:**
- [x] `grep -rn "applyReverbSend\|applyGritSend\|REVERB_SEND_SCHEMA\|onReverbSendChange\|handleReverbSendChange\|SEND_PRIME_KEYS\|SEND_ATTRIBUTES\|reservationSendsPrime" docs/*.md docs/reference/*.md docs/todo/roadmap.md`
  finds nothing outside roadmap 55's own history text **except `roadmap.md:1630`, 50.2's As built (left as history; see
  the As built)**; the two historical specs still contain the names (by design) and carry the header note.
- [x] Both docs guards green; `npm test` green (383 files / 14213 tests; the one failure was the documented-flaky
  `sceneToOrbiterLocal` timeout under load).
- [x] Roadmap 55 reads as built; its "Not Doing" and "Open" sections are resolved.

**Verification:**
- [x] `npx vitest run src/docs` (29 files / 1725 tests); `npm test`.

**As built (T15):** RED first, as a docs task can be: (1) the two temporary entries came out of `robotPanDocs` (T13) and
`robotArticulationDocs` (T14) `NOT_REPO_SYMBOLS`, which went red at once on the lines still citing the old names; (2) a
new group (4) in `robotSendsDocs.test.ts`: every Markdown file directly in `docs/` and `docs/reference/` names none of the
names roadmap 55 deleted (the ten actions, five schemas, ten handlers, ten props, `SEND_PRIME_KEYS`, `SEND_ATTRIBUTES`,
`writeRobotSend`, `reservationSendsPrime`; whole-word, anywhere in the file, not only send lines); AUDIO_SYSTEM.md,
COMPANIES.md, SESSION_STORAGE.md and ROBOT_DATA_GRID.md cite the table-era names; both historical specs carry the header
note before §1; roadmap 55 says built, links spec and plan, has an As built, and every Open bullet starts **Answered**.
15 cases red. `robotSendsDocs`' send-line filter also gained the table-era names (`applySend`, `robotSendLevels`,
`engineKeyOf`, `onSendChange`, `sendSwelling`), so a line citing only them is still existence-checked; that reached
AUDIO_SYSTEM.md's Wiring line and its `chainCycleSearch` (a test file's name), which joined that guard's
`NOT_REPO_SYMBOLS` as `robotEffectSendsDocs` already has it. Docs edited beyond the plan's line list, all send lines found
stale on reading: AUDIO_SYSTEM.md's API sketch (`updateRobotSends` takes `Partial<Record<SendEngineKey, number>>`), the
prime paragraph (`robotSendLevels(robot)`; the restore primes only what its diff carried, through `engineKeyOf`), the
Wiring bullet (it said `VoiceEntry` has named `gritSend` … gain fields) and the swell-pool line; COMPANIES.md:93 and :96
(the handler and flag names); SESSION_STORAGE.md:156 (the codec loops). The header notes list only the names each spec
cites. **Interpretation, for Crawford:** the acceptance grep still finds `roadmap.md:1630`, roadmap **50.2**'s own As built
(`applyReverbSendValue` / `applyDelaySendValue`), outside 55. It is left as written, as the historical specs are: it is the
record of what 50.2 built. 8 mutants killed, each by one case (two for the `SEND_PRIME_KEYS` one): a removed action back
in COMPANIES.md, an `applySendValues` typo on a send line (only the widened filter sees it), `ROBOT_SEND_SCHEMAS` gone from
the grid, the header link dropped, the wrong roadmap number in a header, an Open bullet unanswered, the status back to
"not started", and `SEND_PRIME_KEYS` back in SESSION_STORAGE.md.

**Dependencies:** T14. **Files:** `docs/specs/ROBOT_SENDS.md`, `docs/specs/ROBOT_EFFECT_SENDS.md`, `docs/AUDIO_SYSTEM.md`,
`docs/COMPANIES.md`, `docs/SESSION_STORAGE.md`, `docs/reference/ROBOT_DATA_GRID.md` (if needed), `docs/todo/roadmap.md`,
this file. **Scope:** M (prose only).

### Checkpoint: Complete

- [x] `npm test` green, including `robotSendsParity.test.ts` with its original recording (`git log` on the file: one
  commit, `9600610b`), both docs guards and `content.test.ts`; `npm run build:types`, `npm run lint`, `npm run build`
  clean. (The documented-flaky `sceneToOrbiterLocal` timeout aside; lint 0 errors, the 4 scenery warnings.)
- [x] Spec §5 "Static": `grep -rn "applyReverbSend\|SEND_PRIME_KEYS\|SEND_ATTRIBUTES\|reservationSendsPrime" src docs/*.md`
  finds only test-side lists: both guards' `NOT_REPO_SYMBOLS` and removed-names lists, `robotSendsDocs`' line filter and
  matcher self-test, and the actions test's not-exported list. No source file and no living doc.
- [x] A sixth send would be: one `ROBOT_SENDS` row, one `Robot` field (+ baseline, diff, snapshot), one
  `CompactRobotOverrideDiff` code, one content entry, one band row — and the type system names every other place
  (`Record<RobotSendField, …>`). Confirmed by reading, not by building one. **The list is short of the sites the types
  name:** `AudioSettingValue` (the section indexes `value[spec.field]`), the two value builders typed by it
  (`RobotScreen.tsx:216`, `useCompanyOptions.ts`' empty value), `SendShareCode`, `SendEngineKey` (a new room key also
  needs its room: `sendTargetOf` passes it to `getGlobalRoomInput(key: RoomKey)`), and `generateRobotSends`' draw (its
  `Record<RobotSendField, number>` return). Each is a type error until written, so none can be missed.
- [x] **Crawford's listen** (spec §5 "Manual"): one world; the five sliders on a robot and on a company; save and restore a
  session; make and open a share link; a swell lands on a send. Nothing sounds or reads differently. (Passed 2026-10-22:
  "sliders, save, share, swell all seems to work".)
- [x] `code-review-and-quality` pass on the branch (2026-10-22, all five axes, plus an independent fresh-context
  correctness review of every production hunk against the base): **Approve**. No behaviour regression found; 12 fresh
  review mutants on conditions this branch added all killed; production code +291 / −427. Optional follow-ups, Crawford's
  call: a missing space at `sessionDiff.ts:329`; `sendFieldOf` and `ROBOT_SEND_BY_ENGINE_KEY` have no production caller;
  `SendRow` takes the raw 0..1 value, so a sub-display change re-renders a memo'd `SliderLinear` the base skipped; six
  `Object.fromEntries`/`{}` casts to `Record<…>` over the table; the `reverb`/`delay` special case twice in
  `AudioEngine.ts`; a type-only import cycle `robotSends.ts` ↔ `robotSendLoadingRanges.ts`. **All six applied at
  Crawford's word, one commit each, test first:** `fb2f1d07` (the space); `4d07af96` (`sendFieldOf` and
  `ROBOT_SEND_BY_ENGINE_KEY` deleted, the guard's removed-names list gains them, AUDIO_SYSTEM.md and roadmap 55 say
  `engineKeyOf` is the one, one-way translation); `c89e697a` (`SendRow` takes `display`; RED was three sub-display
  changes re-rendering the Grit slider); `023cf4d1` (`SendRoomKey` lives in `robotSends.ts`, the bands and `bypassCell`
  read it from there); `b144c8f7` (`isRoomSendKey` at both engine sites); `84eeb20e` (`recordByField` /
  `recordByEngineKey` are the only send-record casts, seven sites call them, a source scan pins it). Full suite 383 files /
  14226 green, types / lint / build clean; 6 more mutants killed. The spec still names `sendFieldOf` (assumption 3, §1.1):
  it is the design record, and this note is the delta.
- [ ] PR (Crawford's).

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| A prime object's key order differs from the table's, so T1's `JSON.stringify` recording fails spuriously | Med (a false red) | `robotSendLevels` and `sessionDiff`'s `Object.fromEntries` both iterate the table (T2, T9); the failure names the site |
| A `contentKey` built from `field` passes types and ESLint, fails `content.test.ts` | Med | T2's literal rows and its source-text regex case |
| The §1–4 scan or `UPDATED_DOCS` scan goes red on a deleted name in a task that did not expect it | Low (a named failure) | Every deleting task runs both guards and adds the reported name to `NOT_REPO_SYMBOLS` (Architecture Decisions) |
| T10's transitional shim (old props → per-field lookup) is itself a sixth copy and lingers | Low | It exists for three commits; T13's grep gate deletes it; Checkpoint B checks |
| `AudioEngine.test.ts` (42 `updateRobotSends` references) is a large mechanical rewrite in T3/T4 | Med (time) | Split across T3 (entry reads) and T4 (signature); the existing cases are kept, re-keyed, not re-written |
| `RobotScreen`'s renderer memo recomputes more often with `sendSwelling` as a record | Low | The hook's `useMemo` keys on the five values; T11's memo case |
| A send swell cannot be forced into the parity tick | Low | Spec §7 Q4's fallback, recorded in T1's comment |
| Re-recording the parity fixture "to make it pass" | High | Never: the header says so, Checkpoint Complete checks the recording is the original (`git log -p` on the file shows one commit) |

## Open Questions

- Spec §7 veto points 1–4 proceed at their defaults (record `VoiceEntry.sends`; `onSendChange` + named `AudioSettingValue`;
  the new `robotSends.ts`; the public swell tick first). Crawford may still veto any of them before the task that builds it:
  Q1 before T3, Q2 before T10, Q3 before T2, Q4 before T1.
- Whether the intent and spec are committed on `main` as a docs commit before the branch, or carried onto the branch
  (spec §6): Crawford's call at T1.
