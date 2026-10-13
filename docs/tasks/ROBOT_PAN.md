# Implementation Plan: Robot Pan — a Pan Slider Beside Volume, with Auto

Spec: [docs/specs/ROBOT_PAN.md](../specs/ROBOT_PAN.md). Intent:
[docs/intent/robot-pan.md](../intent/robot-pan.md). Roadmap **49**. Branch `feature/robot-pan`, off `main`
at `d195f81d`.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf` (optional, spec assumption 11).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: COMPLETE 2026-10-13 (T1–T15 on `feature/panning-update`; the T15 docs commit is the last one). Final run: `npm test` 10092/10092, `npm run build:types`, `npm run lint` (0 errors, 4 pre-existing warnings), `npm run build` clean. T14 record: Crawford signed off after the listen with "I think we're good"; he did not report the spec §5 lines, the Pixel courtesy listen or the optional `npm run perf` run one by one, so those are recorded as signed off as a whole, NOT individually confirmed (the perf run was not done). Assumptions 1 (signed −100…100) and 10 (placeholder lore words) stand as confirmed 2026-10-13; the lore words still await his copy pass. Remaining: Crawford's PR from `feature/panning-update`; the untracked `docs/intent/robot-pan.md`, `docs/specs/ROBOT_PAN.md` and this file need committing with it (roadmap 49 and the docs link to them).**
> Earlier status line, kept for the record: Phases 1–3 built 2026-10-13 (T1–T12 on `feature/panning-update`; Checkpoint C green: 9984 of 9985 tests with the documented-flaky `sceneToOrbiterLocal` 5 s timeout, which passes alone 10/10; tsc, eslint 0 errors, `npm run build`); Checkpoint C manual check PASSED (Crawford, 2026-10-13). T13 committed (6cc24129): `src/docs/robotPanDocs.test.ts`, 85 pass / 22 fail by design (the 22 are the doc-text cases that T15 turns green). STOPPED at T14: Crawford's listen (spec §5 manual list + Pixel courtesy listen), then T15 docs.**
> T13 notes: the symbol check is two-layered. A declaration table (22 symbols, each matched in the file the docs name) is the strict layer. The generic layer extracts code-shaped inline-backtick names from spec §1–§4 and the pan lines of the seven docs T15 edits, and requires each as a whole-word identifier somewhere in non-test `src/`. It is deliberately weaker (a renamed declaration whose callers still use the old name passes it); `NOT_REPO_SYMBOLS` lists `formatValue` (the spec's "Ask first") and the Web Audio method names. Full-suite note: `npm test` is red at 22 until T15 lands, so Checkpoint "Complete" cannot be claimed before then.
> Phase 3 deviations from this plan: (1) T10's `onPanChange` records the clamped fraction (`Math.max(PAN_MIN, Math.min(PAN_MAX, display / PAN_DISPLAY_SCALE))`), not the raw `display / PAN_DISPLAY_SCALE`, so the snapshot can never disagree with what `applyPan` stored. (2) T11's diff gate is `live.panAuto === false`, not `!live.panAuto`: a robot with no flag (an older fixture) is Auto, and `!panAuto` would write `pan: NaN` for it (mutation-checked: that form turns the whole existing diff suite red). (3) T11's restore ignores a non-finite `diff.pan` whole (the robot stays Auto) and primes the engine from the STORED, clamped `updatedRobot.pan` rather than `diff.pan`, so an out-of-range hand-edited payload primes `1`, not `7`; the prime is gated on `updates.panAuto === false`. (4) T12's decoder also checks `typeof === 'number'`; `NaN` cannot ride JSON, so the test uses `null`, which is what `JSON.stringify(NaN)` produces. (5) `sessionDiff.ts` now imports `AudioEngine` (it had no direct engine import before).
> Phase 2 deviations from this plan: (1) T9's readout selector lives in a memoised child, `RobotAudioSettingSection`
> in `RobotScreen.tsx`, not in `useRobotSubsectionRenderer` — that hook runs in `RobotScreenPanel`, so subscribing
> there re-renders the whole screen on every readout write, against T9's own "not the rest of the screen" criterion.
> (2) T8's required props forced a bridge so types stay green: `useCompanyOptions` has placeholder `onPanChange` /
> `onPanAutoChange` and a fixed `pan: 0, panAuto: true` in the active value, so the **company Pan row is inert until
> T10**; T10 fills the bodies and the resolved values. (3) `AudioSettingSection.css` has the `__pan-slider` rule
> (`flex: 1 1 0; min-width: 0`), scanned in a test via `readFileSync` (`css?raw` is empty under vitest). (4) T7 also
> extends `content.test.ts`'s "walk reaches every section" id list with both Pan ids.
> Crawford confirmed assumption 1 (users edit pan from −100 through 100, signed, no L/R letters) and
> accepted assumption 10 (placeholder lore words *Bearing* / *Tracking*). The remaining assumptions
> (2–9, 11) have not been vetoed. Phase 1 deviations from this plan: `reReserveVoice` is a fourth
> reservation site and primes inside itself; the spawn site has a comment, not a prime (a spawned robot
> is always Auto); re-primes test `panAuto === false`; T3's `lastPanByRobot.delete` is guarded by
> `getLivePan` being undefined while manual, since `updateRobotPan(id, null)` masks the plan's scenario.

## Overview

Fifteen tasks in four phases. **Phase 1** is the foundation nothing can see: the two robot fields and
their spawn defaults, the readout store, the engine's manual map and `updateRobotPan`/`getLivePan`, and
the reservation re-primes. **Phase 2** is the robot-screen vertical slice: the two actions, the primitive's
`readOnly` branch, content and schemas, the section's Pan row, and the screen wiring with the live
readout, visible and usable on one robot at Checkpoint B. **Phase 3** widens it to companies and makes it
persist (session diff, share link). **Phase 4** is the guard test, Crawford's listen, and docs. Every task
leaves types, lint and the suite green; RED first; one commit per task; mutation-check at the named gates
([[tdd-incremental-workflow]]).

## Architecture Decisions

- **Store is the source of truth; the engine is primed from it (spec §1.3, assumption 8).** `robot.pan` /
  `robot.panAuto` live in `localeStore`; `AudioEngine` keeps a module map `manualPanByRobot` that
  `releaseVoice` clears, and every reservation site re-primes a manual robot from the store. No engine
  state survives a release, so nothing leaks and nothing can disagree with the store for long.
- **Live readout through a dedicated store, not `localeStore` (spec §1.4, assumption 4).**
  `robotPanReadoutStore` is written only on the AudioParam writes `updateAllPanners` already makes, so
  Auto's audio is byte-identical to `main` and no roster/card/world subscriber is touched.
- **`readOnly` on `SliderCenteredZero` is an early-return branch (assumption 5)** copied from
  `SliderLinear.tsx:90–109`, so the interactive path is textually unchanged and its existing suite is the
  parity guard.
- **One `pan` key in the diff, present = Auto off (assumption 3).** The baseline is a constant, so
  `RobotAudioBaseline` gains no field; `buildRobotUpdates` sets both robot fields from the one key.
- **Auto off copies the live value into the robot in the same action (assumption 6)**, so the slider never
  jumps and no second "remembered manual" field exists. The robot keeps moving; only the pan tick skips it.
- **Ordering.** Engine (T3) before actions (T5) before UI (T8–T9): each layer's tests mock the one below.
  The primitive (T6) and content/schemas (T7) are independent of the engine and can land in parallel with
  T3–T5. Persistence (T11–T12) waits for T3 so the restore test can assert the prime call.

## Dependency Graph

```
T1 fields + spawn + clamp ──┬─► T3 engine (manual map, updateRobotPan, getLivePan, tick) ─► T4 reserve re-primes ─┐
T2 readout store ───────────┘                     │                                                                │
                                                  ▼                                             Checkpoint A ◄─────┘
T6 SliderCenteredZero.readOnly ─┐        T5 applyPan / applyPanAuto
T7 content + schemas ───────────┴─► T8 AudioSettingSection Pan row ─► T9 RobotScreen wiring + readout ─► Checkpoint B
                                                                              │
                              T10 company (snapshot, resolve, handlers) ◄─────┤
                              T11 session diff / restore / prime ◄────────────┘ (needs T1, T3)
                              T12 share-link `p` codec ◄── T11
                                                  │
                                          Checkpoint C ─► T13 docs guard test ─► T14 Crawford's listen (STOP) ─► T15 docs ─► Complete
```

T1 and T2 are independent; T6 and T7 are independent of everything in Phase 1; T10, T11 may run in
parallel sessions after T9.

## Phase 1: Foundations (nothing visible)

### Task 1: Robot fields, constants, spawn defaults, store clamp

**Description:** `Robot.pan: number` and `Robot.panAuto: boolean` with the spec §1.1 doc comments;
`PAN_MIN`, `PAN_MAX`, `PAN_DISPLAY_SCALE` in `src/constants/index.ts`; `pan: 0, panAuto: true` in
`spawnSystem.ts`'s robot literal after `masterVolume` (no `getSeededVal`); `localeStore.updateRobot`
clamps a numeric `pan` into `[PAN_MIN, PAN_MAX]` beside its `pitchRepeat` clamp (not truncated — pan is
fractional). Every hand-built `Robot` fixture the compiler flags gains the two fields with the defaults.

**Acceptance criteria:**
- [ ] A spawned robot has `pan === 0` and `panAuto === true`; the existing seed-determinism test (a fixed locale's roster) is unchanged apart from the two new keys.
- [ ] `updateRobot(l, id, { pan: 7 })` stores `1`; `{ pan: -3 }` stores `-1`; `{ pan: 0.25 }` stores `0.25` exactly; `{ pan: NaN }` is dropped.
- [ ] No new `getSeededVal` key; the spawn file's data-id list is unchanged (grep in the test).

**Verification:**
- [ ] `npx vitest run src/systems/spawnSystem.test.ts src/stores/localeStore.test.ts`
- [ ] `npm run build:types && npm run lint` (this is what finds every fixture).

**Dependencies:** None. **Files:** `src/types/Robot.ts`, `src/constants/index.ts`, `src/systems/spawnSystem.ts`
(+ test), `src/stores/localeStore.ts` (+ test), fixtures as flagged. **Scope:** M (small edits, many files).

### Task 2: `robotPanReadoutStore`

**Description:** `src/stores/robotPanReadoutStore.ts` — Zustand store `{ pan: Record<string, number>;
setPan(id, v); clearPan(id) }` per spec §1.4. `setPan` with an equal value and `clearPan` of a missing
key return the same state object. No persistence, no subscribers yet.

**Acceptance criteria:**
- [ ] `setPan('a', 0.2)` then `getState().pan.a === 0.2`; a second `setPan('a', 0.2)` leaves `getState()` referentially equal (a subscriber spy is not called).
- [ ] `clearPan('a')` removes the key; `clearPan('zzz')` is a referential no-op.
- [ ] State is plain JSON (`JSON.parse(JSON.stringify(state.pan))` deep-equals it).

**Verification:**
- [ ] `npx vitest run src/stores/robotPanReadoutStore.test.ts`

**Dependencies:** None. **Files:** `src/stores/robotPanReadoutStore.ts`, `.test.ts`. **Scope:** S.

### Task 3: Engine — manual map, `updateRobotPan`, `getLivePan`, the tick

**Description:** In `AudioEngine.ts`: `PAN_RAMP_SECONDS = 0.05` beside `VOLUME_RAMP_SECONDS`;
`manualPanByRobot` beside `lastPanByRobot`; `updateAllPanners` `continue`s past a manual robot **before**
the DOM read and calls `useRobotPanReadoutStore.getState().setPan` on each write it makes;
`AudioEngine.updateRobotPan(id, number | null)` and `AudioEngine.getLivePan(id)` exactly as spec §1.3/§4;
`releaseVoice` clears both maps and the readout key. Nothing calls the new methods yet.

**Acceptance criteria:**
- [ ] `updateRobotPan(id, 0.8)`: the mock panner's `pan.rampTo` is called with `(0.8, 0.05)` (or `.value` set when `rampTo` is absent); subsequent `updateAllPanners` ticks with a moved x make **no** `pan.value` write and no `setPan` for that robot.
- [ ] `updateRobotPan(id, null)`: ramps to `calculatePanFromPosition(x)`, `getLivePan(id)` returns that value, the readout store has it, and the next tick writes nothing until x moves past `PAN_WRITE_EPSILON`.
- [ ] Manual → auto → x moves: the first tick after the move writes (the manual branch's `lastPanByRobot.delete`); **mutation:** remove that `delete` and this test goes red.
- [ ] **No extra AudioParam writes under Auto:** the existing "write coalescing" suite's per-tick set count is unchanged, and `setPan` is called exactly once per set.
- [ ] `getLivePan` is `undefined` before any tick and after `releaseVoice`; `releaseVoice` empties `manualPanByRobot` (a re-reserved robot with no re-prime follows x again).
- [ ] No composite reserved → `devWarn`, no throw, and the store is untouched.

**Verification:**
- [ ] `npx vitest run src/engine/AudioEngine.test.ts`

**Dependencies:** T1, T2. **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`. **Scope:** M.

### Task 4: Reservation re-primes a manual pan from the store

**Description:** After the three existing `reserveVoice(...)` calls that pass `robot.masterVolume` —
`spawnSystem.ts` (spawn, `:729`) and `reRegisterAllRobotsAudio` (`:883`), and `AudioEngine.loadInstruments`
(`:269`) — add `if (!robot.panAuto) AudioEngine.updateRobotPan(robot.id, robot.pan)`. `reserveVoice`'s
signature is not widened.

**Acceptance criteria:**
- [ ] Spawning (all robots Auto) never calls `updateRobotPan`; re-registering a roster where one robot has `panAuto: false, pan: 0.6` calls it once with `(id, 0.6)`.
- [ ] `loadInstruments`' post-load pass calls `updateRobotPan(id, pan)` for a manual robot already in the store and for no Auto robot.
- [ ] The `updateVoice*` release-and-re-reserve path followed by the caller's re-prime leaves the manual robot manual (integration test in `AudioEngine.test.ts`: reserve, `updateRobotPan(id, 0.6)`, release + reserve via the re-reservation path, re-prime, tick with x moved → no write).

**Verification:**
- [ ] `npx vitest run src/systems/spawnSystem.test.ts src/engine/AudioEngine.test.ts`

**Dependencies:** T1, T3. **Files:** `src/systems/spawnSystem.ts` (+ test), `src/engine/AudioEngine.ts` (+ test). **Scope:** S.

### Checkpoint A: Foundations
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Proves: with every robot on Auto the engine's pan writes are identical to `main` (T3's count test); a manual pan survives release/re-reserve (T4); the readout store mirrors every auto write.
- [ ] Reviewed with Crawford before Phase 2.

---

## Phase 2: The robot-screen slice

### Task 5: `applyPan` / `applyPanAuto`

**Description:** The two actions in `robotOptionsActions.ts` per spec §1.2, beside `applyVolume`. `applyPan`
clamps the display number into `[PAN_MIN, PAN_MAX]` after `/ PAN_DISPLAY_SCALE`. `applyPanAuto(false)` reads
`AudioEngine.getLivePan(id) ?? robot.pan`, writes both fields, primes the engine; `applyPanAuto(true)`
writes the flag and calls `updateRobotPan(id, null)`.

**Acceptance criteria:**
- [ ] `applyPan(r, l, 40)` → `updateRobot` with `{ pan: 0.4 }` and `updateRobotPan(id, 0.4)`; `applyPan(r, l, 150)` → `1`.
- [ ] `applyPanAuto(r, l, false)` with `getLivePan` mocked `-0.3` → `{ panAuto: false, pan: -0.3 }` and `updateRobotPan(id, -0.3)`; with `getLivePan` → `undefined` and `r.pan = 0.1` → `pan: 0.1`.
- [ ] `applyPanAuto(r, l, true)` → `updateRobot` with exactly `{ panAuto: true }` (no `pan` key) and `updateRobotPan(id, null)`.
- [ ] The existing "never calls AudioEngine.updateVoice*/updateRobotMasterVolume directly" source-scan in `audioSwells.test.ts` stays green (pan is not a swell attribute; nothing in swells changes).

**Verification:**
- [ ] `npx vitest run src/systems/robotOptionsActions.test.ts`

**Dependencies:** T3. **Files:** `src/systems/robotOptionsActions.ts`, `.test.ts`. **Scope:** S.

### Task 6: `SliderCenteredZero.readOnly`

**Description:** An optional `readOnly` prop and an early-return branch above the interactive return,
mirroring `SliderLinear.tsx:90–109`: wrapper with `data-readonly="true"` and `role="status"`, the
`DualLabel` **with** `help`, the value label, the `VoxelTrack` with the same `states`, no `Slider.Root`.
Copy `SliderLinear.css`'s `[data-readonly]` rules into `SliderCenteredZero.css`. Update the prop doc
comment and `COMPONENT_LIBRARY.md`'s row (the full doc pass is T15; the row is one line here so the
docs test in T13 has nothing stale to find).

**Acceptance criteria:**
- [ ] `readOnly`: `role="status"` present, no element with `role="slider"`, the value label and the VoxelTrack boxes render, ArrowRight on the wrapper never calls `onChange`, the "?" help button renders when the schema has `help`.
- [ ] Not `readOnly`: the whole existing `SliderCenteredZero.test.tsx` suite passes unmodified (parity).
- [ ] `readOnly` with an external value change still eases (`useEasedControlValue` runs in both branches — the hook sits above the early return).

**Verification:**
- [ ] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx`

**Dependencies:** None. **Files:** `src/components/ui/controls/SliderCenteredZero.tsx`, `.css`, `.test.tsx`, `docs/COMPONENT_LIBRARY.md` (one row). **Scope:** S.

### Task 7: Content entries and control schemas

**Description:** `probe.pan` and `probe.pan.auto` in `src/content/copy/probe.ts` with the spec §1.7 copy
(lore words as placeholders, assumption 10); `probe.levels.intro.humanDescription` gains the Pan sentence.
`PAN_SCHEMA`, `PAN_AUTO_SCHEMA`, `PAN_ROW_PANEL_SCHEMA` in `robotOptionsConfig.ts` beside `VOLUME_SCHEMA`,
bounds from the T1 constants.

**Acceptance criteria:**
- [ ] `content.test.ts` green with no exemptions added; both new entries carry `help`.
- [ ] `PAN_SCHEMA.min === -100`, `max === 100`, `step === 1`, `type === 'sliderCenteredZero'`, `humanLabel === CONTENT['probe.pan'].human`; `PAN_AUTO_SCHEMA.type === 'toggle'`; `PAN_ROW_PANEL_SCHEMA.orientation === 'row'`.
- [ ] `CONTROL_SCHEMA_TYPES` still 14 (`controls.test.ts` unchanged).

**Verification:**
- [ ] `npx vitest run src/content/content.test.ts src/data/robotOptionsConfig.test.ts`

**Dependencies:** T1 (constants). **Files:** `src/content/copy/probe.ts`, `src/data/robotOptionsConfig.ts` (+ test). **Scope:** S.

### Task 8: `AudioSettingSection` — the Pan row

**Description:** `AudioSettingValue` gains `pan` and `panAuto`; props gain `onPanChange`,
`onPanAutoChange`, `livePan?`. A third row inside `VOLUME_SETTINGS_COLUMN_PANEL_SCHEMA`: a `DirectionalPanel`
(`PAN_ROW_PANEL_SCHEMA`) holding the slider wrapper (`audio-setting-section__pan-slider`, flex-grow, no
`display:flex` of its own) and a bare `Toggle`. Slider `value` and `readOnly` per spec §1.5/§4; no
`swelling`. Update the two call sites minimally so types pass (the real wiring is T9/T10): RobotScreen
and useCompanyOptions pass `pan`/`panAuto` from the robot/resolved snapshot and no-op handlers **only if**
the compiler needs them — prefer landing T9 immediately after so no no-op ships.

**Acceptance criteria:**
- [ ] Auto on, `livePan: -0.25`, `pan: 0.9` → the slider is `role="status"` showing `-25`; Auto on without `livePan` shows `pan × 100`.
- [ ] Auto off → an interactive slider at `pan × 100`; ArrowRight calls `onPanChange` with a display number (`pan×100 + 1`); the toggle click calls `onPanAutoChange(true)`.
- [ ] Labels and the "?" copy come from `CONTENT` (assert against `CONTENT['probe.pan'].human`, never a literal); the section is still `memo`-wrapped and re-renders when only `livePan` changes.
- [ ] CSS source scan: `.audio-setting-section__pan-slider` has no `display: flex`.

**Verification:**
- [ ] `npx vitest run src/components/robot/AudioSettingSection.test.tsx`
- [ ] Manual (dev server, any robot): the row sits under Volume, the toggle box does not change size when flipped, the slider spans the row.

**Dependencies:** T6, T7. **Files:** `src/components/robot/AudioSettingSection.tsx`, `.css`, `.test.tsx`. **Scope:** S.

### Task 9: `RobotScreen` wiring and the live readout

**Description:** In `useRobotSubsectionRenderer`: `audioSettingValue` memo adds `pan`/`panAuto`;
`const livePan = useRobotPanReadoutStore((s) => (robot.panAuto ? s.pan[robot.id] : undefined))`;
`handlePanChange` → `applyPan(latestRobot.current, localeId, v)` and `handlePanAutoChange` →
`applyPanAuto(...)`, both `useCallback([localeId])`; pass all three to the section.

**Acceptance criteria:**
- [ ] A `setPan(robot.id, 0.3)` on the readout store re-renders the Levels section (slider shows `30`) and **not** the rest of the screen (extend the "another robot's battery tick does not re-render the screen" pattern with a render-count probe on a sibling section).
- [ ] For a manual robot (`panAuto: false`) a `setPan` for it does not re-render the screen at all (selector returns `undefined` both times).
- [ ] Dragging the slider (Auto off) calls `applyPan` with the robot and display number; the toggle calls `applyPanAuto`.
- [ ] Handler identities are stable across a battery tick (the screen's existing identity test gains the two).

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/screens/RobotScreen.test.tsx`
- [ ] Manual (dev server, headphones): pick a swimming robot — the bar moves with it; flip Auto off mid-swim — the bar and the sound stay put **while the robot keeps swimming**; drag hard left — clearly wider than Auto ever reached; flip Auto on — it glides back, no click.

**Dependencies:** T2, T5, T8. **Files:** `src/components/panels/screen/screens/RobotScreen.tsx`, `.test.tsx`. **Scope:** S.

### Checkpoint B: One robot, end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Proves: the full robot-screen path works live (T9's manual check done by the implementer, Crawford's own listen is T14); Auto's audio is unchanged; a manual robot keeps moving.
- [ ] Reviewed with Crawford before Phase 3.

---

## Phase 3: Companies and persistence

### Task 10: Company broadcast

**Description:** `CompanyOptionsSnapshot.pan?` / `panAuto?`; `resolveCompanyOptions` falls back to
`firstMember.pan ?? 0` / `firstMember.panAuto ?? true`; `useCompanyOptions`: `DISABLED_AUDIO_SETTING` gains
the two fields, `audioSettingValue` memo adds the two resolved locals, `onPanChange` and `onPanAutoChange`
per spec §1.5; `CompanyOptionsSection` passes them (no `livePan`). Document the per-member Auto-off
behaviour in the handler's comment.

**Acceptance criteria:**
- [ ] `resolveCompanyOptions(undefined, member{pan: 0.2, panAuto: false})` → `{ pan: 0.2, panAuto: false, … }`; a snapshot `{ panAuto: true }` wins over the member.
- [ ] `onPanChange(40)` calls `applyPan` once per member with `40` and records `{ pan: 0.4 }` (company and "All" targets, as the volume tests do).
- [ ] `onPanAutoChange(false)` calls `applyPanAuto(m, l, false)` per member and records `{ panAuto: false, pan: <resolved pan> }`; `onPanAutoChange(true)` records exactly `{ panAuto: true }`.
- [ ] The existing `audioSettingValue` `toEqual` assertions are updated in place to include the two fields; handler identities stable across an unrelated edit; source scan: `useCompanyOptions.ts` does not import `robotPanReadoutStore`.

**Verification:**
- [ ] `npx vitest run src/systems/companyOptions.test.ts src/components/company/useCompanyOptions.test.ts src/types/Company.test.ts`
- [ ] Manual: on a company screen, Auto off then one slider move puts every member in the same place; Auto on releases them all; the company slider is read-only at the stored value while Auto is on.

**Dependencies:** T5, T8. **Files:** `src/types/Company.ts` (+ test), `src/systems/companyOptions.ts` (+ test), `src/components/company/useCompanyOptions.ts` (+ test), `src/components/company/CompanyOptionsSection.tsx`. **Scope:** M.

### Task 11: Session diff, restore, prime

**Description:** `RobotAudioOverrideDiff.pan?` with the spec §1.1 comment; `computeRobotAudioOverrideDiff`
adds `if (!live.panAuto) diff.pan = roundToDecimals(live.pan, 2)`; `buildRobotUpdates` sets `pan` and
`panAuto: false` from the one key; the apply loop calls `AudioEngine.updateRobotPan(robot.id, diff.pan)`
after `regenerateMelody` when the key is present. Update the "never inspects …" doc comment.

**Acceptance criteria:**
- [ ] A manual robot at `0.4` diffs to `{ pan: 0.4 }`; `0.123456` diffs to `0.12`; an Auto robot with a stale `pan: 0.4` diffs to `{}`.
- [ ] Applying `{ pan: -0.25 }` sets `pan: -0.25, panAuto: false` on the robot and calls `updateRobotPan(id, -0.25)` once; applying a payload without `pan` leaves `panAuto: true` and never calls it. **Mutation:** drop the `panAuto: false` line and the restore test goes red.
- [ ] A round trip (build → apply on a fresh world) of a payload with one manual and eleven Auto robots reproduces the one manual robot exactly and nothing else in `robotOverrides`.

**Verification:**
- [ ] `npx vitest run src/utils/sessionDiff.test.ts`

**Dependencies:** T1, T3. **Files:** `src/types/session.ts`, `src/utils/sessionDiff.ts`, `.test.ts`. **Scope:** S.

### Task 12: Share-link `p` codec

**Description:** `CompactRobotOverrideDiff.p?: number`; `toCompactRobotOverrideDiff` / `fromCompactRobotOverrideDiff`
mirror `pr`; the decoder drops a non-finite or out-of-`[PAN_MIN, PAN_MAX]` `p` (absent ⇒ Auto).

**Acceptance criteria:**
- [ ] `{ pan: 0.4 }` encodes to `{ p: 0.4 }` and decodes `toEqual` the original; absent `p` → no `pan` key.
- [ ] `p: 'x'`, `p: 3`, `p: NaN` each decode to no `pan` key.
- [ ] A full payload with one manual robot survives `encode → decode` `toEqual`; payload `version` stays 2.

**Verification:**
- [ ] `npx vitest run src/utils/sessionShareUtils.test.ts`

**Dependencies:** T11. **Files:** `src/utils/sessionShareUtils.ts`, `.test.ts`. **Scope:** S.

### Checkpoint C: Integration
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Manual: save a session with one manual robot, reload, it is where you put it and every other robot still follows; the share link of the same world does the same in a fresh tab.
- [ ] Reviewed with Crawford before Phase 4.

---

## Phase 4: Guards, listen, docs

### Task 13: `robotPanDocs.test.ts` — docs and guardrail guard

**Description:** `src/docs/robotPanDocs.test.ts` on the `oneDayClockDocs.test.ts` pattern: every
backticked symbol in `docs/specs/ROBOT_PAN.md` §1–§4 and in the updated docs exists in source; the Visual
Mapping scan (`src/components/robot/gem/`, `RobotBody.tsx` contain neither `panAuto` nor `.pan`); the
movement scan (`src/systems/workLoop.ts`, `siteChoice.ts`, `lifecycleSim.ts`, `src/animation/` contain
neither); `docs/SESSION_STORAGE.md` names `pan` as persisted and still lists `masterVolume` as never
persisted. The doc assertions are written against the text T15 will produce, so this test is RED until T15.

**Acceptance criteria:**
- [ ] Both source scans pass today; **mutation:** add `robot.pan` to a comment-free line in `RobotBody.tsx` and the scan fails.
- [ ] Every symbol assertion names a real export (`AudioEngine.updateRobotPan`, `getLivePan`, `useRobotPanReadoutStore`, `applyPan`, `applyPanAuto`, `PAN_SCHEMA`, `PAN_DISPLAY_SCALE`, `CompactRobotOverrideDiff` field `p`).
- [ ] The doc-text assertions fail cleanly (named strings) until T15 lands.

**Verification:**
- [ ] `npx vitest run src/docs/robotPanDocs.test.ts` (expected: doc-text cases red, scans green — stated in the commit body).

**Dependencies:** T1–T12. **Files:** `src/docs/robotPanDocs.test.ts`. **Scope:** S.

### Task 14: Crawford's listen — STOP and report

**Description:** The spec §5 manual checkpoint, performed by Crawford on headphones, plus the Pixel
courtesy listen at Light (assumption 11) and an optional before/after `npm run perf` run per
[[perf-harness-measurement-hygiene]]. The implementer does not proceed to T15 until this is signed off or
Crawford explicitly defers it; a deferred check is recorded in the Status banner, never silently skipped.

**Acceptance criteria:**
- [ ] Every line of the spec §5 manual list checked, each result recorded here (pass / fail / deferred).
- [ ] Assumption 1 (display format) and assumption 10 (lore words) explicitly confirmed or changed; a change is applied as a follow-up commit to T6 or T7 before T15.

**Verification:**
- [ ] Crawford's sign-off in this file's Status banner.

**Dependencies:** T13. **Files:** this file (Status). **Scope:** XS (no code unless a veto lands).

### Task 15: Docs, roadmap, intent banner

**Description:** `docs/AUDIO_SYSTEM.md` "Panning" item rewritten for Auto/manual, the readout store and
the ramp; `docs/SESSION_STORAGE.md` §1.2 list (`pan` persisted when manual; `masterVolume`, `audioMode`
unchanged, with the composition-vs-listening sentence); `docs/COMPANIES.md` snapshot fields and the
per-member Auto-off note; `docs/COMPONENT_LIBRARY.md` `SliderCenteredZero.readOnly` section;
`docs/reference/ROBOT_DATA_GRID.md` and `reference/SLIDER_VALUES.md` Pan rows; `docs/ROBOT_DESIGN.md` one
line (pan reaches the body through no dial); roadmap 49 status line + "as built" deltas from its Shape
paragraph; `docs/intent/robot-pan.md` shipped banner. Spot-check every name against the shipped source,
not this plan.

**Acceptance criteria:**
- [ ] `robotPanDocs.test.ts` fully green.
- [ ] Roadmap 49 records: one `pan` field (no remembered manual value), the readout store, `SliderCenteredZero.readOnly`, `useCompanyOptions` as the company handler home, and that robots keep moving with Auto off.

**Verification:**
- [ ] `npx vitest run src/docs/robotPanDocs.test.ts`; `npm run build:types && npm run lint`.

**Dependencies:** T14. **Files:** the eight docs above. **Scope:** S (docs only).

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria met; T14's manual results recorded, deferred items flagged.
- [ ] Ready for Crawford's PR from `feature/robot-pan`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Auto's audio changes subtly (an extra or missing panner write) | High — every existing world's mix | T3's "no extra AudioParam writes" criterion reuses the existing coalescing spy; Checkpoint A reviews it |
| A manual pan set before the audio context starts never reaches the panner | Medium | T4 primes at all three reservation sites with a test each; risk 1 in the spec names the fourth-site footgun for future readers |
| "Freeze" misread as stopping the robot | High — the one thing Crawford corrected | T9's manual check and T13's movement source scan both state it; no task touches `workLoop`, `position` or `src/animation/` |
| Readout store writes churn the robot screen | Low | T9's selector returns `undefined` for manual robots and the section is the only subscriber; render-count tests in T9 |
| Company Auto-off leaves members at different pans | Low (by design) | T10's handler comment and COMPANIES.md (T15) document it; spec risk 2 |
| `readOnly` branch regresses the interactive primitive | Medium | T6 keeps the interactive path textually unchanged; the existing suite must pass unmodified |
| Lore words or display format vetoed late | Low | Both isolated to T7 strings / one optional `formatValue` on T6; T14 forces the confirmation before docs |

## Open Questions

1. Display format (spec assumption 1). **Resolved 2026-10-13 (Crawford):** users edit pan from −100 through 100, a signed number with no L/R letters. No `formatValue` on the primitive.
2. Lore words *Bearing* / *Tracking* (assumption 10). **Resolved 2026-10-13 (Crawford):** placeholders are fine. They still go through his copy pass later, which is two strings in T7.
3. Readout write with no subscriber (spec risk 3). **Resolved** (Architecture Decisions): accepted as negligible; the subscriber-count gate is the named fallback if `npm run perf` at T14 shows it.
