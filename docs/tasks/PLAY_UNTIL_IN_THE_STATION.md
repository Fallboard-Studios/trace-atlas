# Implementation Plan: Play until in the Station

Source spec: [docs/specs/PLAY_UNTIL_IN_THE_STATION.md](../specs/PLAY_UNTIL_IN_THE_STATION.md). Source intent:
[docs/intent/play-until-in-the-station.md](../intent/play-until-in-the-station.md). Backlog slot:
[84](../todo/backlog.md#84-audio-keep-a-robot-playing-until-it-is-in-the-station), first item of plan.md Stage 4.

**Status:** plan written 2026-11-14 from the spec, with every §7.1 assumption at its default and §7.2 Q1–Q2 open for
the gate; revised the same day for Crawford's answer 4 (the hold only when less than half a measure is left; otherwise
the fade starts at once and ends on the bar line), which resolved Q3 and moved the fade system to the sixteenth grid.
Phases 1 and 2 (Tasks 1–9) built 2026-11-14; next is Crawford's review at "Checkpoint: the engine's fade", then
Task 10.

## Overview

A recalled robot is heard all the way home; at the port its fade to silence starts at once and ends on the bar line,
its entry arc stretched to the same length, unless less than half a measure is left, when it holds for the bar and
takes the whole next measure. Eighteen tasks in five phases, each phase leaving the app working:

1. **The silence begins in the station** (Tasks 1–5): `isDockMuted` gains the `'charging'` condition behind an optional
   parameter, each caller passes `activity` in turn, then the parameter is made required. After this phase a recalled
   robot plays through its whole swim and its one-second arc, and cuts at `'charging'`. Then an ear checkpoint.
2. **The engine's fade** (Tasks 6–9): a timed ramp helper, `scheduleStationFade` / `cancelStationFade` with the fade
   factor in `busGainTarget`, the mid-ramp re-issue, and `landOnActive`'s cancel. Nothing calls the fade yet.
3. **The port, the grid and the stretched arc** (Tasks 10–13): `stationArc` takes a duration and `enterOnBar` is
   exported; the station fade system runs on a `'16n'` repeat and applies the half-measure rule; then `enter` stops
   starting the arc; then the turn-back resumes or reverses. Then Crawford's gate (spec §5.4), with two reserved follow-ups.
4. **Docs** (Tasks 14–17).
5. **The records** (Task 18), after the merge.

## Architecture Decisions

- **The `activity` parameter is optional first, required last (Tasks 1 → 5).** An absent `activity` reads as "in the
  station" (`undefined` behaves like `'charging'`), so a caller not yet updated keeps today's rule exactly and every
  task's suite is green with no half-state. Task 5 removes the `undefined` branch once the five callers (Tasks 2–4)
  pass it. The alternative, one task touching eight files, is over the template's limit.
- **The timed ramp is a sibling of `rampOrSet`, not a change to it** (spec §4's note). `rampOrSet(param, target,
seconds, time)` ramps over **one tick** from `time`, which its swell callers need. Task 6 adds `rampOver(param,
target, seconds, time)` in `voiceEntry.ts`: `rampTo(target, seconds, time)` when the param can ramp, else
  `setValueAtTime`, else assign, so the headless stub path is the same as every other write.
- **The fade factor reads the fade's end against the engine's `now`.** `busGainTarget(robotId, masterVolume)` multiplies
  by 0 once `Tone.now() >= stationFades.get(robotId).end`. In tests the Tone mock's `now` is what it already is for the
  other timed writes; the tests set a fade with an `end` in the past or the future rather than advancing a clock.
- **The station fade system is started from `worldTransition.ts` beside `startWorkLoop` / `stopWorkLoop`** (lines
  164–165 and 183), not from inside the loop: the system imports both the engine and the loop, and the loop must never
  import the engine (its Strict Separation pin). `audioSwells.ts`'s `startAudioSwells` / `stopAudioSwells` is the shape
  (a `scheduleRepeat` id kept in module state, `cancelSchedule` on stop).
- **The system runs on the sixteenth grid, as the swells do** (spec §1.4, Crawford's answer 4): `scheduleRepeat('16n',
onTick)`, `positionAt(time).step` for the sixteenths left to the bar, `getTickSeconds(time)` for their length. A `'1m'`
  repeat could not start a fade on arrival; a store subscription to `'entering'` would act from a chain that begins in
  a GSAP callback. The tick is the actor, and it costs one roster scan per sixteenth, which the swells already pay.
- **The half-measure rule is one constant and one comparison.** `STATION_FADE_MIN_STEPS = 8` in `constants/index.ts`
  beside the station constants; `left = BEATS_PER_MEASURE * 4 − (step − 1)`; `left >= STATION_FADE_MIN_STEPS` starts the
  fade now over `left` sixteenths, else the robot waits for the step-1 tick (`left = 16`). Inclusive at 8 (spec §7.1 A3).
- **The system, not the engine, remembers which robots it has started.** A module-level `started: Set<string>`; on each
  tick an id whose robot is no longer `'entering'` is dropped, and an `'entering'` robot not in the set is started when
  the rule allows (`scheduleStationFade` unless soloed, then `enterOnBar`). The engine's `stationFades` is the audio
  record; the system's set is the scheduling record. Neither is in Zustand.
- **A Solo that arrives mid-fade is cancelled on the next tick** (spec §1.5's "the plan pins the seam"): `onTick` also
  calls `cancelStationFade` for a started robot that is now soloed. Within a sixteenth, which the grid gives for free;
  no store subscription.
- **The port change lands after the fade system (Task 12 after Task 11).** With `enter` still starting the arc at once
  (today's code), Task 11's `enterOnBar` is a no-op in the app (an arc is already running) and its fade ramps under a
  one-second arc that ends in `'charging'` anyway, so the app works between the two tasks. Were Task 12 first, every
  homebound robot would stand at its port for ever until the system existed.
- **"An arc is running" is `getTimeline(`station-${id}`)` being set**, the same key `stopWorkLoop` kills and
  `stationRipple.ts` names; no new flag on the loop or the robot.
- **A fade's seconds are `left × getTickSeconds(time)`** in the fade system, read from the callback's own time at the
  tick that starts it, so a tempo change reaches the next fade (the swells' convention).
- **The reversed arc resumes the robot from the reverse's `onReverseComplete`**, the timeline's own callback, and the
  original `onComplete` (the `'charging'` write) is cleared first so a reversed arc never writes `'charging'`. The
  volume's return is the engine's alone (`landOnActive` → `cancelStationFade`, Task 9), already in place before the
  loop's reverse exists.

## Dependency Graph

```
Task 1 (isDockMuted + optional activity)
   │
   ├── Task 2 (trigger + diagnostics pass activity)
   ├── Task 3 (budget: eligibility, mutedIds, key)
   └── Task 4 (useRobotMeta, MetaBox pass activity)
            │
       Task 5 (activity required; Robot.ts comment)
            │
      Checkpoint A (ear: the swim is heard)

Task 6 (rampOver)
   │
Task 7 (scheduleStationFade / cancelStationFade / factor / killAll)
   ├── Task 8 (mid-ramp re-issue)
   └── Task 9 (landOnActive cancels)

Task 10 (stationArc duration; enterOnBar)
   │
Task 11 (stationFadeSystem — needs 7 + 10)
   │
Task 12 (enter holds)
   │
Task 13 (turn-back: resume or reverse)
   │
Checkpoint B / Gate (Crawford, spec §5.4) ── Task 13a, 13b reserved
   │
Tasks 14–17 (docs) ── Task 18 (records, after the merge)
```

Tasks 1–5, 6–9 and 10 are independent of one another and can be built in any interleaving; Task 11 needs 7 and 10.

## Task List

Every task names its **Proof**: **RED test** for a behaviour change, **Look** or **Listen** for a visual or audible
check in the browser, **Read** for docs. Only a RED-test task lists a `*.test.ts` in its Files.

### Phase 1: The silence begins in the station (spec §1.3)

- [x] **Task 1: `robotAudibility.ts` — `isDockMuted(docking, activity?)`**

  **Description:** `isDockMuted` takes a second, optional `activity: RobotActivity | undefined` and is true only when the
  robot is `Docked` or `Undocking` **and** `activity` is `'charging'` or `undefined` (Architecture Decisions: optional
  first). `isRobotAudible(audioMode, anySolo, docking, activity?)` and `isRobotEmitting(…, activity?, isSounding)` pass
  it through; the plan pins the argument order so Tasks 2–4 are mechanical. No caller changes in this task; every
  existing call compiles and behaves as today.

  **Proof:** RED test — `src/utils/robotAudibility.test.ts`: `isDockMuted(Docked, 'returning')` and `(Docked,
'entering')` are false; `(Docked, 'charging')`, `(Undocking, 'charging')` and `(Docked, undefined)` are true; the
  pass-through in `isRobotAudible` / `isRobotEmitting`.

  **Acceptance criteria:**
  - [ ] A `Docked` robot that is `'returning'` or `'entering'` is not dock-muted; one that is `'charging'` is.
  - [ ] Mute still wins and Solo still beats the dock, with `activity` given or not (the existing tests pass unmodified).
  - [ ] Mutant: the `activity` condition dropped (today's rule) fails the new tests.

  **Verification:**
  - [ ] `npx vitest run src/utils/robotAudibility.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`

  **Estimated scope:** S (one module and its test)

- [x] **Task 2: `AudioEngine.ts`, `audioDiagnostics.ts` — the trigger and the diagnostics pass `activity`**

  **Description:** `triggerWithCap` (~line 601) passes `robotFromStore?.activity`; `audioDiagnostics.ts` line 176 passes
  `r.activity`. From this task a `Docked` robot still on its way home triggers its notes.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: a `Docked` + `'returning'` robot's note is triggered; a
  `Docked` + `'charging'` robot's is refused; an `Active` robot's is triggered as before.

  **Acceptance criteria:**
  - [ ] The trigger accepts `Docked` + `'returning'` / `'entering'` and refuses `Docked` + `'charging'`.
  - [ ] `audibleRobots` in the diagnostics counts a homebound `Docked` robot.
  - [ ] Every existing AudioEngine test passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts src/engine/audioDiagnostics.test.ts` passes (the second if it
        exists).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/engine/audioDiagnostics.ts`

  **Estimated scope:** S (two call sites and a test)

- [x] **Task 3: `audioBudgetSystem.ts` — eligibility, standing-by and the key read whether the robot is in its station**

  **Description:** `reconcile`'s `eligible` and `mutedIds` pass `r.activity`; `signature()` appends one bit per robot,
  `inStation` (`activity === 'charging'`), so the budget recomputes on the `'charging'` write and on the exit, and not
  on `'transit'` → `'working'`. A homebound `Docked` robot is eligible, in the sounding set, and keeps its voice until it
  is in.

  **Proof:** RED test — `src/systems/audioBudgetSystem.test.ts`: a `Docked` + `'returning'` robot is in the sounding set
  and not in the standing-by set; its `'charging'` write stands it by (`setStandingByRobots` called with it); an
  `activity` change `'transit'` → `'working'` triggers no reconcile (the engine's set calls are not repeated).

  **Acceptance criteria:**
  - [ ] A `Docked` robot on its way home sounds and is not stood by; at `'charging'` it is stood by.
  - [ ] The key changes on `'charging'` and on leaving it, and on nothing else about `activity`.
  - [ ] Mutant: the key reading `activity` whole fails the no-reconcile test; the existing 112 tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`

  **Estimated scope:** M (three edits and a test block in a 112-test file)

- [x] **Task 4: `useRobotMeta.ts`, `MetaBox.tsx` — the light and the count pass `activity`**

  **Description:** `useRobotMeta`'s `lit` and `MetaBox`'s `useEmittingCount` pass `robot.activity` to
  `isRobotEmitting`, so the mode light is lit and the Deck's "n of m" counts a homebound `Docked` robot.

  **Proof:** RED test — the existing `useRobotMeta` / `RobotScreen` test and `MetaBox.test.tsx`: a `Docked` +
  `'returning'` robot in the sounding set is `lit` and counted; `Docked` + `'charging'` is dim and not counted.

  **Acceptance criteria:**
  - [ ] The light is lit for a homebound `Docked` robot and dim once it is `'charging'`.
  - [ ] The count includes a homebound `Docked` robot.
  - [ ] Existing tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/MetaBox.test.tsx src/components/panels/screen/screens` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/screens/useRobotMeta.ts`, `src/components/panels/screen/worldView/MetaBox.tsx`,
  `src/components/panels/screen/worldView/MetaBox.test.tsx`, the robot screen's test that renders `useRobotMeta`

  **Estimated scope:** S (two pass-throughs and their tests)

- [x] **Task 5: `robotAudibility.ts`, `Robot.ts` — `activity` required; the comment names the exception**

  **Description:** With every caller passing it, `activity` becomes required and the `undefined` branch goes
  (`undefined` now means "not in the station", the natural reading for a robot not yet in the store). `Robot.ts`'s
  `activity` comment ("nothing audio-side reads it") and `RobotActivity`'s say: audibility reads whether the robot is in
  its station (spec §1.3); the docking machine still never reads it.

  **Proof:** RED test — `src/utils/robotAudibility.test.ts`: `isDockMuted(Docked, undefined)` is now false; the type no
  longer accepts a missing argument (a `@ts-expect-error` line in the test).

  **Acceptance criteria:**
  - [ ] No caller omits `activity`; `build:types` is clean with the parameter required.
  - [ ] The two comments in `Robot.ts` match the shipped rule.

  **Verification:**
  - [ ] `npx vitest run src/utils/robotAudibility.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 2, 3, 4.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`, `src/types/Robot.ts`

  **Estimated scope:** XS

### Checkpoint A: the swim is heard (Listen)

- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] In the browser: recall a robot (or wait for one). It plays through its whole swim home and its one-second arc,
      its mode light lit and the Deck's count holding, and cuts at `'charging'`. Its station-exit is unchanged.
- [ ] `lifecycleSim.test.ts` green and unmodified (spec §7.1 A6).
- [ ] Reviewed with Crawford before Phase 2. This checkpoint is itself an improvement he can keep if the fade is cut.

---

### Phase 2: The engine's fade (spec §1.5)

- [x] **Task 6: `voiceEntry.ts` — `rampOver(param, target, seconds, time)`**

  **Description:** A sibling of `rampOrSet` that ramps `param` to `target` **over `seconds` from `time`**: `rampTo(target,
seconds, time)` when the param ramps; else `setValueAtTime(target, time + seconds)`; else assign. `rampOrSet` and its
  callers are untouched (Architecture Decisions). Ships as independently testable code; Task 7 is its caller.

  **Proof:** RED test — `src/engine/audioEngine/voiceEntry.test.ts` (or a new file beside it): the three paths' calls and
  arguments.

  **Acceptance criteria:**
  - [x] A rampable param gets `rampTo(target, seconds, time)` — not one tick.
  - [x] A param with only `setValueAtTime` gets a point at `time + seconds`; a bare stub is assigned.
  - [x] `rampOrSet`'s existing tests pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/audioEngine/voiceEntry.ts`, its test

  **Estimated scope:** XS

- [x] **Task 7: `AudioEngine.ts`, `constants/index.ts` — `scheduleStationFade`, `cancelStationFade`, the fade factor**

  **Description:** Module state `stationFades: Map<robotId, { end }>`; `scheduleStationFade(robotId, time, seconds)`
  records `end = time + seconds` and `rampOver`s the voice's `busGain.gain` to 0 (a robot with no voice is recorded
  only); `cancelStationFade(robotId)` deletes the record and ramps the bus to `busGainTarget` over
  `STATION_FADE_RECOVER_SECONDS` (0.5, spec §7.1 A2, beside `STATION_ARC_SECONDS`), a no-op with no record;
  `busGainTarget` multiplies by `stationFadeFactor(robotId, Tone.now())` (0 once the end has passed); `killAll` clears
  the map. `reserveVoice` / `reReserveVoice` already build from `busGainTarget`, so a voice rebuilt after a completed fade
  starts at 0 with no further change.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: the ramp call's arguments; the cancel's ramp and its no-op;
  the factor 1 before the end and after a cancel, 0 after the end; a rebuilt voice after a completed fade at gain 0;
  `killAll` forgetting the fades.

  **Acceptance criteria:**
  - [x] `scheduleStationFade` ramps the bus to 0 from `time` over `seconds`; `cancelStationFade` ramps back over the
        constant and is a no-op with no fade.
  - [x] `busGainTarget` is 0 after a completed fade (a Volume write then keeps the bus at 0) and 1 otherwise.
  - [x] Mutants: the factor applied before the end; the record surviving `killAll`.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`, `src/constants/index.ts`

  **Estimated scope:** M (new public API, module state, one constant)

- [x] **Task 8: `AudioEngine.ts` — a bus-gain write during a ramp re-issues the ramp**

  **Description:** `updateRobotMasterVolume` and `setHighlightedRobots` land their write on a bus mid-fade. For a robot
  with a live fade whose end has not passed, the write re-issues the fade: `rampOver(gain, 0, end − writeTime, writeTime)`
  instead of ramping to the un-faded target (spec §1.5). One private helper `writeBusGain(robotId, entry, target, seconds,
time?)` that both call, so the rule lives once.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: a Volume write mid-fade ramps to 0 ending at the fade's end,
  not to the Volume target; a Highlight set change mid-fade does the same; after the end both write the faded target (0).

  **Acceptance criteria:**
  - [x] No bus-gain write mid-fade raises the bus; the fade's end is kept.
  - [x] Existing Volume and Highlight tests pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

- [x] **Task 9: `robotSystems.ts` — `landOnActive` cancels the fade**

  **Description:** `landOnActive` calls `AudioEngine.cancelStationFade(robotId)` before the seam (spec §1.2 step 5): a
  robot exiting its station, or turning back mid-fade, sounds at its regular volume with the ramp back over the constant.
  `landOnDocked` does not call it.

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: `landOnActive` calls `cancelStationFade` with the id;
  `landOnDocked` does not; the existing "tick's only route to visuals is the seam" pin passes.

  **Acceptance criteria:**
  - [x] Every `Active` landing cancels; no `Docked` landing does.

  **Verification:**
  - [x] `npx vitest run src/systems/robotSystems.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** XS

### Checkpoint: the engine's fade

- [x] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [x] The app behaves exactly as at Checkpoint A: nothing schedules a fade yet; `landOnActive`'s cancel is a no-op.
- [ ] Reviewed with Crawford before Phase 3.

---

### Phase 3: The port, the grid and the stretched arc (spec §1.2 step 3, §1.4, §1.6)

- [ ] **Task 10: `workLoop.ts` — `stationArc` takes a duration; `enterOnBar(robotId, seconds)` exported**

  **Description:** `stationArc(loop, robot, kind, station, onDone, seconds?)`: `seconds` is the arc's duration when given
  (body alpha and scale, the decorator's and the ripple's duration); absent, today's `STATION_ARC_SECONDS` /
  `STATION_REDUCED_ARC_SECONDS`. Under reduced motion with `seconds` given the alpha fades over the full `seconds`, no
  scale, no ripple (spec §7.1 A4). `enterOnBar(robotId, seconds)` (exported): a no-op unless the loop is live for the
  robot's locale, the robot is `'entering'` and no `station-${id}` timeline exists; else it plays the `'despawn'` arc over
  `seconds` with today's `onDone` (the `'charging'` write, or `exitStation` if `Active`). `enter` is unchanged in this
  task, so in the app `enterOnBar` is always a no-op until Task 12.

  **Proof:** RED test — `src/systems/workLoop.test.ts`: `enterOnBar` for an `'entering'` robot with no arc plays an arc of
  the given duration (the body's alpha and scale tweens, the ripple's and decorator's duration) ending in `'charging'`;
  for a `'returning'` robot, or one whose arc is running, it does nothing; reduced motion fades alpha over the full
  seconds with no scale; the exit arc's duration is unchanged.

  **Acceptance criteria:**
  - [ ] An arc given a duration lasts exactly that long, decorator and ripple included.
  - [ ] `enterOnBar` is a no-op for the wrong activity, a running arc, a dead loop or an unknown robot.
  - [ ] The existing 133 work-loop tests pass unmodified (the exit arc and today's entry are untouched).

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts src/systems/workLoop.integration.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`

  **Estimated scope:** M (a signature, a new export, a reduced-motion branch)

- [ ] **Task 11: `stationFadeSystem.ts` (new), `worldTransition.ts`, `constants/index.ts` — the grid schedules the fade
      and the arc by the half-measure rule**

  **Description:** `STATION_FADE_MIN_STEPS = 8` beside the station constants. `startStationFades(localeId)` /
  `stopStationFades()`: a `scheduleRepeat('16n', onTick)` id in module state and a `started: Set<string>`.
  `onTick(time)`: `at = positionAt(time)` and `tick = getTickSeconds(time)` (return if either is undefined); `left =
  BEATS_PER_MEASURE * 4 − (at.step − 1)`; for each robot of `localeId`: drop from `started` if not `'entering'`; if
  `'entering'`, not started and `left >= STATION_FADE_MIN_STEPS`: `seconds = left × tick`,
  `AudioEngine.scheduleStationFade(id, time, seconds)` unless `audioMode === 'solo'`, then `enterOnBar(id, seconds)`, and
  add to `started`; if started and now soloed: `cancelStationFade(id)` (Architecture Decisions). Stop cancels the repeat
  and clears the set. `worldTransition.ts` starts it right after `startWorkLoop(localeId)` (line 165) and stops it
  beside each `stopWorkLoop()` (lines 164, 183). With `enter` still arcing at once, in the app this task's `enterOnBar` is
  a no-op and its fade ends under the one-second arc.

  **Proof:** RED test — `src/systems/stationFadeSystem.test.ts` (new; the budget test's fake-engine idiom, a fake
  `scheduleRepeat` capturing the callback, `positionAt` and `getTickSeconds` mocked): an `'entering'` robot seen on step 1
  gets one `scheduleStationFade(id, time, 16 × tick)` and one `enterOnBar(id, 16 × tick)`; on step 5 both with `12 ×
tick`; on step 9 (8 left) both with `8 × tick`; on step 10 (7 left) nothing until the step-1 tick, then both with `16 ×
tick`; a started robot gets nothing on later ticks; a soloed `'entering'` robot gets `enterOnBar` only; `'returning'` /
  `'charging'` robots get nothing; a started robot that becomes soloed is cancelled on the next tick; a robot that left
  `'entering'` and re-enters later is started again; stop cancels the repeat; no transport, or no position, does nothing.
  `worldTransition.test.ts`: start and stop called with the loop.

  **Acceptance criteria:**
  - [ ] One fade and one arc per entry, ending on the bar line: started at once with half a measure or more left, else
        on the bar-line tick with a whole measure; none for Solo; none repeated.
  - [ ] Started and stopped with the work loop; idempotent stop.
  - [ ] Mutants: the boundary at 7 or 9; the fade scheduled every tick; the Solo check dropped; `started` never cleared.

  **Verification:**
  - [ ] `npx vitest run src/systems/stationFadeSystem.test.ts src/systems/worldTransition.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 7, 10.

  **Files:** `src/systems/stationFadeSystem.ts`, `src/systems/stationFadeSystem.test.ts`, `src/systems/worldTransition.ts`,
  `src/systems/worldTransition.test.ts`, `src/constants/index.ts`

  **Estimated scope:** M (one new module, its test, two call sites, one constant)

- [ ] **Task 12: `workLoop.ts` — `enter` leaves the arc to the grid**

  **Description:** `enter` writes `'entering'` and returns; no arc. The robot stands at the port, visible, until Task 11's
  tick calls `enterOnBar` (at once with half a measure or more left, else on the bar). `stopWorkLoop` already kills `station-*` timelines; `adopt` of an `'entering'` robot on a
  restart resumes from `resume` as today (it is not `Active`, so it returns to its station and holds again).

  **Proof:** RED test — `src/systems/workLoop.test.ts`: arrival at the port writes `'entering'` and creates no
  `station-${id}` timeline; the body stays at alpha 1, scale 1; the slot stays held; a later `enterOnBar` plays the arc.
  The existing "a recalled robot enters and charges" tests are updated to call `enterOnBar` where they waited on the arc
  (the one place behaviour changes on purpose).

  **Acceptance criteria:**
  - [ ] No arc at arrival; the robot is `'entering'`, visible and at full scale.
  - [ ] The occupancy set still holds the slot through the hold.
  - [ ] The "never touches AudioEngine through a full cycle" pin passes with a hold, an `enterOnBar` and a `'charging'`
        in the cycle.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts src/systems/workLoop.integration.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Listen and Look: two recalls. One arriving early in a bar shrinks and fades at once and is gone and silent on
        the bar line; one arriving late in a bar stands at its port, still playing, then takes the whole next bar; both
        slots light at the end.

  **Dependencies:** Task 11.

  **Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`

  **Estimated scope:** S (one function body, several tests updated)

- [ ] **Task 13: `workLoop.ts` — a turn-back during the hold resumes, during the arc reverses**

  **Description:** `onLifecycleChange(…, 'active')` for an `'entering'` robot: with no `station-${id}` timeline, `resume(loop,
settle(loop, robot))` at once; with one, clear its `onComplete`, set `onReverseComplete` to a `live` callback that
  resumes, and `reverse()`. The ripple is left to finish. The volume's return is already Task 9's. `enter`'s old `Active`
  guard in `onDone` stays as a guard.

  **Proof:** RED test — `src/systems/workLoop.test.ts`: `'active'` during the hold → the robot leaves `'entering'` for a
  site or a wait with no arc; `'active'` mid-arc → the timeline reverses (body back to alpha 1, scale 1), `'charging'` is
  never written, and the robot resumes on the reverse's end; `'active'` for a `'returning'` robot still turns back as
  today; the engine is never touched.

  **Acceptance criteria:**
  - [ ] A turn-back mid-hold is immediate; mid-arc it reverses and never writes `'charging'`.
  - [ ] Mutant: letting the arc finish (today's code) fails the mid-arc test.
  - [ ] Existing turn-back tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Look: a robot called back mid-fade grows back the way it went and swims off; the volume returns over half a
        second (Task 9).

  **Dependencies:** Task 12.

  **Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`

  **Estimated scope:** S

### Checkpoint B / Gate: Crawford's eye and ear (spec §5.4; stop)

- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] The §5.3 runs: `?debug` on, a recall end to end; the Deck's count and the mode light lit until the body is gone;
      the robot screen's cloud running through the swim and thinning over the fade; no Tone "scheduled inside of
      scheduled callbacks" warning from the fade's writes.
- [ ] Power off mid-fade, wait, power on: body and volume continue from where they were (spec §7.1 A5). If the ramp did
      not pause, Task 13b.
- [ ] Crawford judges the four points of §5.4 on a slow world, a busy world and a soloed homebound robot, the
      half-measure boundary among them; his answers to §7.2 Q1–Q2 and every §7.1 default are recorded in the spec's
      "As built" (Task 17).
- [ ] **Reserved, built only if the gate says so:**
  - **Task 13a: the exit waits for a fading occupant** (Q1) — `exitStation` holds a robot hidden while its station has an
    `'entering'` occupant with a started fade, and exits on that occupant's `'charging'` write. RED test in
    `workLoop.test.ts`. S.
  - **Task 13b: the ramp re-issued on resume** (A5) — if a suspended context does not pause the automation, the fade
    system re-issues each live fade from the paused value on `resumeWorkLoop`'s counterpart. RED test in
    `stationFadeSystem.test.ts`. S.

---

### Phase 4: Docs

- [ ] **Task 14: `docs/ROBOT_LIFECYCLE.md` — the hold, the fade measure, the one exception**

  **Description:** Principle 2 gains the exception (audibility reads whether the robot is in its station; the docking
  machine still never reads `activity`); rule 6 says the dock's silence begins at `'charging'`; the activity machine's
  `'entering'` is the hold plus the fade measure; the seam table's `'active'` row reads "in `'entering'`: resumes at once,
  or reverses the arc"; the Audibility section names the station fade system; the Testing Notes list the new tests.
  Every identifier spot-checked against the shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every named function, file and constant exists as written.

  **Verification:**
  - [ ] Manual review against the code; `npm run lint` clean.

  **Dependencies:** Tasks 1–13.

  **Files:** `docs/ROBOT_LIFECYCLE.md`

  **Estimated scope:** XS

- [ ] **Task 15: `docs/AUDIO_SYSTEM.md` — the station fade beside the Highlight dip; the budget's timing**

  **Description:** The budget paragraph: a homebound `Docked` robot keeps its voice until `'charging'`; a new short
  passage on the station fade (`scheduleStationFade` / `cancelStationFade`, the factor in `busGainTarget`, the mid-ramp
  re-issue, the `'16n'` system and the half-measure rule).

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] Names and the ramp constant match the shipped source.

  **Verification:**
  - [ ] Manual review; `npm run lint` clean.

  **Dependencies:** Tasks 1–13.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS

- [ ] **Task 16: `docs/ANIMATION_SYSTEM.md` — the station arc's two durations**

  **Description:** The station-arc passage: the exit arc one second; the entry arc half a measure to a whole one, ending
  on the bar line, started by the station fade system through `enterOnBar`; the reverse on a turn-back.

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] Matches `stationArc`'s shipped signature and `enterOnBar`.

  **Verification:**
  - [ ] Manual review; `npm run lint` clean.

  **Dependencies:** Tasks 10–13.

  **Files:** `docs/ANIMATION_SYSTEM.md`

  **Estimated scope:** XS

- [ ] **Task 17: `docs/specs/PLAY_UNTIL_IN_THE_STATION.md`, `docs/todo/backlog.md` — "As built" and backlog 74's line**

  **Description:** An "As built" section in the spec: the gate's answers (Q1–Q3), each §7.1 default kept or changed,
  the constants as shipped, 13a / 13b built or not. Backlog 74's entry: its fade-out shipped here, its fade-in is the
  follow-up, and its stale "Plan.md Stage 3" line becomes "off plan".

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] Every provisional item of the intent has a recorded answer.

  **Verification:**
  - [ ] Manual review; `npm run lint` clean.

  **Dependencies:** Checkpoint B.

  **Files:** `docs/specs/PLAY_UNTIL_IN_THE_STATION.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS

### Checkpoint: Complete

- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across Tasks 1–13 met; Checkpoint B's answers recorded.
- [ ] Docs reflect the shipped API, every name spot-checked.
- [ ] Any Look or Listen not done this session flagged here, never silently skipped.
- [ ] Ready for Crawford's PR.

---

### Phase 5: The records (after the merge)

- [ ] **Task 18: `docs/todo/` — archive backlog 84**

  **Description:** On a docs branch after the merge: entry 84 moves to `archive/backlog-archive.md` with a status line (no
  stub in `backlog.md`, the backlog convention), links rebased; its line in `plan.md` Stage 4 deleted; the memory index
  updated.

  **Proof:** Read.

  **Acceptance criteria:**
  - [ ] 84 is in the archive and nowhere else; plan.md Stage 4 opens with 85.

  **Verification:**
  - [ ] Manual review; `npm run lint` clean.

  **Dependencies:** The merge.

  **Files:** `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`

  **Estimated scope:** XS

## Risks and Mitigations

| Risk                                                                                    | Impact                                    | Mitigation                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A caller of `isDockMuted` is missed, so some reader still mutes at the `Docked` landing | Medium                                    | Task 5 makes the parameter required: `build:types` names any caller left; the six call sites are listed in Tasks 2–4 from a repo grep on 2026-11-14.                                                         |
| `rampOrSet` is used for the fade and the ramp lasts one tick                            | High (a cut, not a fade)                  | Task 6's helper and its test pin `rampTo(target, seconds, time)`; Task 7's test asserts the ramp call's arguments.                                                                                           |
| A Volume or Highlight write mid-fade jumps the bus back up                              | Medium                                    | Task 8's re-issue rule and tests; one private `writeBusGain` so the rule lives once.                                                                                                                         |
| The budget releases the voice before the ramp reaches 0                                 | Medium (a click at the end)               | The robot is stood by only at `'charging'` (Task 3), which the arc's `onComplete` writes at the same moment the ramp ends; `standingBy` then waits for the last note end as today.                           |
| Robots stand at their ports for ever between the hold and the system                    | High during the build                     | Task 12 (the hold) lands after Task 11 (the system); the app never has the hold without the bar.                                                                                                             |
| `positionAt`'s step is off the grid, so fades end off the bar                           | Medium                                    | Spec §7.1 A7: ONE_MUSIC_CLOCK.md's result, which the swells already rely on; Checkpoint B's `?debug` run watches a fade end against the Click Track, and backlog 82's CDP probe is the fallback measurement. |
| The half-measure boundary is off by one (`step` is 1-based)                             | Medium (a 7- or 9-sixteenth fade)         | Task 11's boundary tests at steps 9 and 10 and their mutants.                                                                                                                                                |
| A reversed arc writes `'charging'`                                                      | High (a visible robot muted and stood by) | Task 13 clears `onComplete` before `reverse()`; its test asserts `'charging'` is never written mid-reverse.                                                                                                  |
| A Solo during a fade is honoured a sixteenth late                                       | Low                                       | Architecture Decisions: the grid tick cancels it on the next sixteenth.                                                                                                                                      |
| A tempo change mid-fade leaves the end off the bar                                      | Low                                       | Spec §7.1 A3; the gate's slow world does not change tempo.                                                                                                                                                   |
| The suspended context does not pause the automation (A5)                                | Medium                                    | Checkpoint B checks it; Task 13b reserved.                                                                                                                                                                   |
| Two robots overlap at one station for longer                                            | Unknown until seen                        | Spec §7.2 Q1; Task 13a reserved for the exit-waits rule.                                                                                                                                                     |

## Open Questions

1. **The overlap at one station (spec §7.2 Q1).** **Open** — Checkpoint B; Task 13a if the exit must wait.
2. **A ramp up on the way out (Q2).** **Open** — out of scope; raised at the gate if the asymmetry shows.
3. **The hold's length (Q3).** **Resolved** by Crawford's answer 4 (2026-11-14): the hold only when less than half a
   measure is left at arrival, else the fade starts at once and ends on the bar line. The boundary constant is the
   gate's to move.
4. **"Don't change the mute" (spec §7.1 A1).** **Resolved by default** — the dock's silence begins at `'charging'`
   (Phase 1); Crawford can veto at Checkpoint A, where Phase 1 alone is audible.
5. **`STATION_FADE_RECOVER_SECONDS` (A2).** **Resolved by default** — 0.5 s; re-pinned at Checkpoint B.
6. **Reduced motion (A4).** **Resolved by default** — the alpha fades over the whole measure; one constant to change.
