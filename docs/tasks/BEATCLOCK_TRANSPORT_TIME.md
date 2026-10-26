# Implementation Plan: BeatClock Passes the Transport Time

Spec: [docs/specs/BEATCLOCK_TRANSPORT_TIME.md](../specs/BEATCLOCK_TRANSPORT_TIME.md). Intent:
[docs/intent/beatclock-transport-time.md](../intent/beatclock-transport-time.md). Backlog slot:
[35](../todo/backlog.md#35-audio-beatclock-drops-the-transport-time-its-callbacks-are-given), first line of plan.md's
Stage 1. Build branch `fix/beatclock-transport-time` off `main` (`ff5155ce` or later). Spec §7's four open questions are
all resolved with the spec's recommendations (Crawford, 2026-10-26); the Architecture Decisions below record each.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run build && npx vite preview --port 4173` (the served build the proof run drives), `npm run perf:audio`,
`npm run perf -- --profile`.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

One parameter, carried by hand from the Transport to the Web Audio param. BeatClock's `scheduleRepeat` wrapper forwards
the time Tone hands it; the swell tick takes it and passes it down both pools' write paths, through the robot `apply*`
helpers and the store's `setGlobalAudio`, into the engine's update methods and global setters, where `rampOrSet` gives a
ramp its start time and a `.value =` write becomes a `setValueAtTime`. UI callers of the same functions pass nothing and
get today's behaviour. The work is ordered **leaf first** so every commit type-checks and the suite stays green: the engine
learns to accept a time (T1–T5) before anyone passes one (T6–T8); the two sites that stay on "now" get their comments
(T9); then the harness gains the console line that proves the warning gone (T10–T11), the measurement that decides the
deferred curve is taken (T12), and docs and backlog close it (T13–T14). Every task names its **Proof**
(TASK_TEMPLATE.md): RED tests for the ten that change behaviour, a run for T11 and T12, a Read for T0, T9, T13 and T14.
One commit per task. No docs guards, no source scans (CLAUDE.md, 2026-10-23).

## Architecture Decisions

- **Resolves spec §7 question 1: option (a), the time passes through `setGlobalAudio`.** `setGlobalAudio(effect,
  partial, time?)` forwards `time` as a second argument to `GLOBAL_SETTER[effect]`. The store stores nothing new; the
  argument passes through an action the way `applyVolume(robot, localeId, pct, time?)` is a store write and an engine
  call side by side. The three setters the swells reach (`setGlobalEQ`, `setGlobalFilterLPF`, `setGlobalFilterHPF`)
  declare it; the other fourteen in the table do not and ignore the extra argument (a function of fewer parameters is
  assignable). The lifecycle stays on "now" for a different reason: its audio reactions are subscribers'
  (`audioBudgetSystem.ts`), not a call the tick makes.
- **Resolves §7 question 2: the curve threshold.** Build the pre-scheduled swell curve only if, on T12's measurement at
  4× throttle, the swell tick's inclusive share of the idle window exceeds **2 %** of sampled time with the store half
  (`updateRobot` and below) excluded, or any task ≥ 50 ms in the window is attributed to the tick. T14's new backlog item
  carries the threshold and T12's number side by side.
- **Resolves §7 question 3: one `rampOrSet`.** `globalFx.ts`'s private copy goes; the file imports `voiceEntry.ts`'s.
  `RampableParam`'s `value: number` covers every call site the copy served (its only difference was `value: unknown`).
  Done in T1 with the parameter, since both would have changed anyway.
- **Resolves §7 question 4: the console tally lives in `perf:audio`.** `audio-load.mjs` already enables `Runtime`, pins
  the world and warms up; a pure `tallyConsole(events)` in `audio-load-lib.mjs` does the counting and is tested like the
  helpers beside it. Backlog 36 will read the same line.
- **Leaf before caller.** T1 (`rampOrSet`) → T2 (composite `set`) → T3 (engine methods) and T4 (global setters) → T5
  (`setGlobalAudio`) → T6 (`apply*`) → T7 (BeatClock) → T8 (the swell tick). Each intermediate commit has functions that
  accept a time nobody passes yet, never a caller passing one nobody accepts. T7 before T8 because T8's `16n` callback
  takes the time T7 forwards.
- **Undefined means now, at the leaf only.** No function defaults the time upstream; `rampOrSet` and the composite's
  `set` test `time !== undefined` and otherwise make exactly today's call (`rampTo` with two arguments, `.value =`), so
  every existing test on those paths passes unmodified, which is the parity criterion on T1–T6.
- **The parameter is always last and always `time`**, seconds on the audio clock, as `processMelodyStep` and the
  composite's `trigger` already name theirs (spec §4).
- **A live Param or Signal takes the time; a setting does not.** Layer gain (`Tone.Param`), detune (`Tone.Signal`), the
  EQ bands (`Gain.gain` Params in decibels), the filters' frequency and Q (Signals) take `setValueAtTime` or a timed
  ramp. Phase, pulse width (oscillator settings via `synth.set`), the envelope (read at trigger) and `setRoomFeeder`'s
  bypass ramps (a room-state change) do not, and each says so where it is.
- **No floor, no `MIN_LEAD`.** Web Audio clamps a start time earlier than `currentTime` to `currentTime`, so a late
  callback degrades to today's behaviour; the callback time already runs about `lookAhead` ahead of now (spec §3).
- **The proof proves the metric first.** T11 runs the stock `main` build first and must see the Tone warning once; a
  tally that shows nothing on stock proves nothing on the branch (perf-harness hygiene, PERFORMANCE.md).

## Dependency Graph

```
T0 (spec status + backlog pointer)
        │
T1 (rampOrSet + RampableParam; globalFx twin removed)
        │
T2 (composite set(params, time?))
        │
   ┌────┴─────────────────┐
T3 (four engine methods)   T4 (three global setters)
   │                        │
   │                   T5 (setGlobalAudio pass-through)
   │                        │
   └────────┬───────────────┘
      Checkpoint A (the engine accepts a time; nobody passes one; suite green unchanged)
            │
T6 (the four apply* helpers)
            │
T7 (BeatClock forwards the time; harmony's (_time) comment)
            │
T8 (the swell tick threads it, both pools)
            │
T9 (comments: startRobotLifecycle, setRoomFeeder)
            │
      Checkpoint B (full suite, build; the warning should be gone — T11 shows it)
            │
T10 (tallyConsole + the perf:audio report line)
            │
T11 (the proof run: stock once, branch absent — recorded)
            │
T12 (the measurement: three runs + control — recorded)
            │
      Checkpoint C (Crawford reads the two records; optional listen)
            │
T13 (BEAT_CLOCK.md, AUDIO_SYSTEM.md)
            │
T14 (backlog: 35's Built line; the new curve item)
            │
      Checkpoint: Complete
```

## Task List

### Phase 0: The slot

- [ ] **Task 0: `docs/specs/BEATCLOCK_TRANSPORT_TIME.md`, `docs/todo/backlog.md` — status lines**

  **Description:** In the spec's **Status** paragraph, record that §7's four questions are resolved with the
  recommendations (Crawford, 2026-10-26) and link this plan. Under backlog 35, add one line pointing at the intent, the
  spec and this plan, and the branch name. Nothing else changes.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] The spec's Status names the four resolutions and links `docs/tasks/BEATCLOCK_TRANSPORT_TIME.md`.
  - [ ] Backlog 35 carries the three links and the branch; its heading and number are untouched.

  **Verification:**
  - [ ] Manual read of both diffs.

  **Dependencies:** None.

  **Files:** `docs/specs/BEATCLOCK_TRANSPORT_TIME.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (two paragraphs)

---

### Phase 1: The engine accepts a time

- [ ] **Task 1: `src/engine/audioEngine/voiceEntry.ts` — `rampOrSet(param, target, rampSeconds, time?)`; one home**

  **Description:** `RampableParam` gains `rampTo?: (value, rampTime, startTime?) => void` and
  `setValueAtTime?: (value, time) => void`. `rampOrSet` takes an optional trailing `time`: with `rampTo` and a time →
  `rampTo(target, rampSeconds, time)`; with `rampTo` and no time → `rampTo(target, rampSeconds)` (two arguments);
  without `rampTo`, with `setValueAtTime` and a time → `setValueAtTime(target, time)`; otherwise `.value = target`.
  Delete the private `rampOrSet` in `globalFx.ts` (line ~165) and import this one; its twelve call sites keep their
  arguments (the `as unknown as { rampTo?… }` casts become `as unknown as RampableParam` or go where the node already
  fits). `bypassCell.ts` already imports this one and is unchanged.

  **Proof:** RED test — `src/engine/audioEngine/voiceEntry.test.ts`: the five branches of spec §5.1 item 2, on plain
  object stubs with `vi.fn()` members.

  **Acceptance criteria:**
  - [ ] A stub with `rampTo` and a time is called `rampTo(target, rampSeconds, time)`; without a time, `rampTo` is called
        with exactly two arguments (`toHaveBeenCalledWith(target, rampSeconds)` and `mock.calls[0].length === 2`).
  - [ ] A stub with `setValueAtTime` but no `rampTo`, given a time, gets `setValueAtTime(target, time)` and its `value`
        is untouched; the same stub without a time gets `.value = target`.
  - [ ] A stub with neither gets `.value = target` with or without a time.
  - [ ] `globalFx.ts` has no `rampOrSet` of its own; `npx vitest run src/engine/audioEngine/globalFx.test.ts
        src/engine/audioEngine/globalFx.headless.test.ts src/engine/audioEngine/bypassCell.test.ts` passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/voiceEntry.test.ts src/engine/audioEngine/globalFx.test.ts
        src/engine/audioEngine/globalFx.headless.test.ts src/engine/audioEngine/bypassCell.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0.

  **Files:** `src/engine/audioEngine/voiceEntry.ts`, `src/engine/audioEngine/voiceEntry.test.ts`,
  `src/engine/audioEngine/globalFx.ts`

  **Estimated scope:** S (one function and a type, one deletion, mechanical cast edits)

- [ ] **Task 2: `src/engine/audioEngine/compositeVoice.ts` — `set(params, time?)`: timed gain and detune**

  **Description:** The composite's `set` takes an optional trailing `time`. Layer gain: with a time and a
  `gainNode.gain.setValueAtTime`, `setValueAtTime(p.gain, time)`; else `gainNode.gain.value = p.gain` as today.
  Detune: `applyOscDetune` takes the time; with a time and a Signal-shaped `oscillator.detune` that has
  `setValueAtTime`, `setValueAtTime(detune, time)`; else `.value =` as today. Phase, pulse width, portamento and adsr
  follow their existing paths with or without a time, with one comment on the `set` function stating the rule (a live
  Param or Signal takes the time; a setting does not; spec §3). The `CompositeVoice` type's `set` signature gains the
  parameter.

  **Proof:** RED test — `src/engine/audioEngine/compositeVoice.test.ts`: spec §5.1 item 3, on the file's existing synth
  and gain stubs extended with a `setValueAtTime` spy.

  **Acceptance criteria:**
  - [ ] `set({ layers: [{ gain: 0.4 }] }, 12.5)` calls the layer's `gainNode.gain.setValueAtTime(0.4, 12.5)` and does not
        assign `.value`; `set({ layers: [{ gain: 0.4 }] })` assigns `.value` and does not call `setValueAtTime`.
  - [ ] `set({ layers: [{ detune: 7 }] }, 12.5)` calls `oscillator.detune.setValueAtTime(7, 12.5)`; without a time, `.value`.
  - [ ] With a time, `set({ layers: [{ phase, pulseWidth, adsr }] }, 12.5)` makes exactly the calls the existing "via the
        live-update set({ layers }) path" tests already assert (those tests pass unmodified).
  - [ ] A gain stub without `setValueAtTime`, given a time, falls back to `.value =` (headless parity).

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (the `setValueAtTime` shape; no code dependency, the ordering keeps one leaf per commit).

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, `src/engine/audioEngine/compositeVoice.test.ts`

  **Estimated scope:** S

- [ ] **Task 3: `src/engine/AudioEngine.ts` — the four robot update methods take `time?`**

  **Description:** `updateRobotMasterVolume(robotId, masterVolume, time?)` and `updateRobotSends(robotId, sends, time?)`
  pass the time to `rampOrSet` as its fourth argument; `updateVoiceLayerParams(robotId, layers, time?)` and
  `updateVoiceEnvelope(robotId, adsr, time?)` pass it to `composite.set(…, time)`. `setRoomFeeder` inside
  `updateRobotSends` is **not** given the time (T9 writes its comment; the call shape is fixed here). Doc comments on the
  four methods gain the one-line pointer (spec §4).

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: spec §5.1 item 4, in the existing `describe` blocks for these
  methods (`AudioEngine.updateVoiceLayerParams` at line ~874 is the pattern: reserve a voice, spy the composite).

  **Acceptance criteria:**
  - [ ] With a reserved voice, `updateVoiceLayerParams('v1', layers, 3.25)` calls `composite.set({ layers }, 3.25)`;
        `updateVoiceEnvelope('v1', adsr, 3.25)` calls `composite.set(<patched layers>, 3.25)`; without a time both call
        `set` with `undefined` as the second argument (or one argument; assert the first argument shape unchanged).
  - [ ] `updateRobotMasterVolume('v1', 0.5, 3.25)` and `updateRobotSends('v1', { reverb: 0.2 }, 3.25)` reach the bus gain's
        and the send gain's `rampTo` with `3.25` as the third argument (the `tone` mock's Gain param gets a `rampTo`
        spy); without a time, with two arguments.
  - [ ] Every existing test in the file passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (four signatures, four pass-throughs, tests)

- [ ] **Task 4: `src/engine/audioEngine/globalFx.ts` — `setGlobalEQ`, `setGlobalFilterLPF`, `setGlobalFilterHPF` take `time?`**

  **Description:** The three setters the global swell pool reaches gain an optional trailing `time`. LPF and HPF
  frequency: `rampOrSet(…, FILTER_FREQUENCY_RAMP_SECONDS, time)`. LPF and HPF `Q`, and the EQ's `low`/`mid`/`high`: with
  a time and a `setValueAtTime` on the node's param, `setValueAtTime(value, time)`; else `.value =` as today. That point
  write is a small private `setOrPoint(param, value, time?)` beside the import, not a `rampOrSet` with `rampSeconds` 0
  (a zero-length ramp is not a point, and `rampOrSet`'s contract stays one sentence). The fourteen other setters are
  untouched.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: spec §5.1 item 5, on the file's existing node stubs
  extended with `setValueAtTime` spies.

  **Acceptance criteria:**
  - [ ] `setGlobalFilterLPF({ frequency: 900 }, 8.0)` calls the LPF frequency's `rampTo(900, FILTER_FREQUENCY_RAMP_SECONDS,
        8.0)`; `setGlobalFilterLPF({ Q: 2 }, 8.0)` calls `Q.setValueAtTime(2, 8.0)`; the HPF twin likewise.
  - [ ] `setGlobalEQ({ low: -3 }, 8.0)` calls `low.setValueAtTime(-3, 8.0)`; `setGlobalEQ({ low: -3 })` assigns `.value`.
  - [ ] A stub whose param lacks `setValueAtTime`, given a time, falls back to `.value =`.
  - [ ] Every existing test in `globalFx.test.ts` and `globalFx.headless.test.ts` passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/globalFx.headless.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** S

- [ ] **Task 5: `src/stores/audioStore.ts` — `setGlobalAudio(effect, partial, time?)` forwards the time**

  **Description:** The action's interface and implementation gain an optional trailing `time`, passed as the second
  argument to `GLOBAL_SETTER[effect]`. The `GLOBAL_SETTER` type becomes `(params, time?) => void` per key; the entries
  that are `AudioEngine.setGlobal*` of one parameter remain assignable; `setGlobalDelayResolved` and
  `setGlobalRateResolved(...)` are untouched (they never receive a time from anyone). The existing empty-partial no-op
  stays: no state write, no engine push, time or not. One sentence on the action's doc comment: the time is a
  pass-through for the swell tick, never stored (spec §3).

  **Proof:** RED test — `src/stores/audioStore.test.ts`: spec §5.1 item 6, in the existing "setGlobalAudio pushes to
  AudioEngine" describe (line ~219; the engine is already mocked there).

  **Acceptance criteria:**
  - [ ] `setGlobalAudio('filterLPF', { frequency: 900 }, 8.0)` calls the mocked `AudioEngine.setGlobalFilterLPF({ frequency:
        900 }, 8.0)`; `setGlobalAudio('eq3', { low: 4 }, 8.0)` calls `setGlobalEQ({ low: 4 }, 8.0)`.
  - [ ] `setGlobalAudio('filterHPF', { Q: 5 })` calls the setter with `undefined` as its second argument (the existing
        assertions on the first argument still hold).
  - [ ] `setGlobalAudio('eq3', { low: undefined }, 8.0)` writes nothing and pushes nothing.
  - [ ] Every existing test in the file passes unmodified; `globalAudio` state after a timed call equals state after an
        untimed one (nothing stored).

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S

### Checkpoint A: The engine accepts a time
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] No caller in `src/` passes a time yet: the app's behaviour is byte-for-byte today's (every pre-existing test on
      T1–T5's paths passed unmodified). The Tone warning still fires on `main` and on this branch alike.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: The tick passes it

- [ ] **Task 6: `src/systems/robotOptionsActions.ts` — `applyVolume`, `applySendValue`, `applyLayersContinuous`, `applyAdsr` take `time?`**

  **Description:** Each of the four gains an optional trailing `time` and passes it to its engine call
  (`updateRobotMasterVolume`, `updateRobotSends`, `updateVoiceLayerParams`, `updateVoiceEnvelope`). The store write before
  each is unchanged. `applySend` (the percent form) does not take a time: the tick never calls it. The other helpers in
  the file are untouched.

  **Proof:** RED test — `src/systems/robotOptionsActions.test.ts`: spec §5.1 item 7, in the existing per-helper
  describes (the engine is spied there already).

  **Acceptance criteria:**
  - [ ] `applyVolume(robot, localeId, 55, 4.5)` calls `AudioEngine.updateRobotMasterVolume(robot.id, 0.55, 4.5)`;
        `applySendValue(robot, localeId, 'reverbSend', 0.25, 4.5)` → `updateRobotSends(robot.id, { reverb: 0.25 }, 4.5)`;
        `applyLayersContinuous(robot, localeId, layers, 4.5)` → `updateVoiceLayerParams(robot.id, layers, 4.5)`;
        `applyAdsr(robot, localeId, adsr, 4.5)` → `updateVoiceEnvelope(robot.id, adsr, 4.5)`.
  - [ ] Each, called without a time, reaches the engine with `undefined` in that position; the store holds the same value
        either way.
  - [ ] Every existing test in the file passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/robotOptionsActions.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3; Checkpoint A.

  **Files:** `src/systems/robotOptionsActions.ts`, `src/systems/robotOptionsActions.test.ts`

  **Estimated scope:** S

- [ ] **Task 7: `src/engine/beatClock.ts` — `scheduleRepeat` forwards the Transport time; the harmony callback names it**

  **Description:** `scheduleRepeat(interval, callback: (time: number) => void)`. The live registration and the queued
  registration promoted in `initBeatClock` both call `callback(time as number)` instead of `callback()`;
  `TransportLike.scheduleRepeat`'s callback type becomes `(time: number) => void`; the `scheduleMap` entry type
  follows. The internal `16n` tick and `subscribeToMeasure` are untouched. In `harmonySystem.ts` the callback becomes
  `(_time) => { … }` with a two-line comment: no Tone call is made here, `availableNotes` is read by the note scheduler
  with its own time, so there is nothing to place (spec §1). `harmonySystem.test.ts`'s mock type updates to the new
  signature; no new harmony test (no behaviour).

  **Proof:** RED test — `src/engine/beatClock.test.ts`: spec §5.1 item 1. The file's `mockTransport.scheduleRepeat`
  stores callbacks in `callbacks[]`; the tests invoke `callbacks[n](7.75)`.

  **Acceptance criteria:**
  - [ ] A callback registered by `scheduleRepeat('4m', cb)` after init, when the transport invokes it with `7.75`, receives
        `7.75` as its only argument.
  - [ ] A callback registered before init and promoted by `initBeatClock` receives the transport's time the same way
        (extend the existing "promotes pending schedules" test).
  - [ ] `cancelSchedule`, `resetBeatClock` and the measure-listener tests pass unmodified.
  - [ ] `npx vitest run src/engine/harmonySystem.test.ts` passes with the mock's new callback type.

  **Verification:**
  - [ ] `npx vitest run src/engine/beatClock.test.ts src/engine/harmonySystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean (every `scheduleRepeat` mock in `src/systems/*.test.ts` still
        type-checks: they are `vi.fn(() => 'schedule-id')` and accept any callback).

  **Dependencies:** Task 6 (ordering only; keeps one change per commit).

  **Files:** `src/engine/beatClock.ts`, `src/engine/beatClock.test.ts`, `src/engine/harmonySystem.ts`,
  `src/engine/harmonySystem.test.ts`

  **Estimated scope:** S

- [ ] **Task 8: `src/systems/audioSwells.ts` — the `16n` callback takes the time and both pools carry it to the write**

  **Description:** `startAudioSwells` registers `(time) => tickAudioSwells(localeId, getCurrentMeasurePrecise(), time)`.
  `tickAudioSwells(localeId, measure, time?)` → `advanceActiveSwells(localeId, measure, frequency, time)` →
  `advanceRobotSwell(swell, localeId, measure, frequency, time)` and `advanceGlobalSwell(key, swell, measure, frequency,
  time)` → `writeRobotValue(robot, localeId, attribute, value, time)` (all four `apply*` calls, including the exact
  return-to-base) and `writeGlobalValue(target, value, time)` → `setGlobalAudio(meta.effect, patch, time)`. The
  `maybeForce*Return` functions mutate swell phase only and take no time. Selection, rolls and eligibility are untouched.
  The "writes through the exact same apply* a human would call" comment on `writeRobotValue` gains its one line.

  **Proof:** RED test — `src/systems/audioSwells.test.ts`: spec §5.1 item 8. The file mocks `scheduleRepeat` and spies
  `updateRobotMasterVolume`, `updateVoiceLayerParams`, `updateVoiceEnvelope`; add spies for `updateRobotSends` and
  `useAudioStore.getState().setGlobalAudio`. Capture the registered callback from the `scheduleRepeat` mock and invoke it
  with a time.

  **Acceptance criteria:**
  - [ ] With a robot swell forced active on `volume` (the file's `ALWAYS_MIN` noise pattern), invoking the registered `16n`
        callback with `9.5` calls `AudioEngine.updateRobotMasterVolume(robotId, <value>, 9.5)`; the same for a send
        (`updateRobotSends(…, 9.5)`), a layer gain (`updateVoiceLayerParams(…, 9.5)`) and an ADSR field
        (`updateVoiceEnvelope(…, 9.5)`).
  - [ ] With a global swell forced active, the callback invoked with `9.5` calls `setGlobalAudio(effect, patch, 9.5)`.
  - [ ] A tick that completes a swell writes the exact base value with the same time as its last argument.
  - [ ] `tickAudioSwells(localeId, measure)` with no time still runs and reaches the engine with `undefined` (the direct
        callers in the existing tests pass unmodified).

  **Verification:**
  - [ ] `npx vitest run src/systems/audioSwells.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 6, 7.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`

  **Estimated scope:** S (six signatures, one registration; the test is the larger half)

- [ ] **Task 9: `src/systems/robotSystems.ts`, `src/engine/AudioEngine.ts` — the two "stays on now" comments**

  **Description:** At `startRobotLifecycle`, a short paragraph: `subscribeToMeasure` hands the measure and no time
  because the lifecycle's audio consequences come out of store subscriptions (`audioBudgetSystem.ts`), a semantic state
  change, not a scheduling call; threading an audio time through a store `set` would blur that line (spec §1, intent).
  At `setRoomFeeder`, two lines: a room going light or dark is a room-state change on "now", not a swell value, so the
  tick's time is not passed to it. No code changes.

  **Proof:** Read — human review. No test file (CLAUDE.md: no RED test for a task with no behaviour).

  **Acceptance criteria:**
  - [ ] Both comments present, each naming the reason and the spec section; no other diff.

  **Verification:**
  - [ ] Manual read. `npm run lint` clean.

  **Dependencies:** Task 8.

  **Files:** `src/systems/robotSystems.ts`, `src/engine/AudioEngine.ts`

  **Estimated scope:** XS

### Checkpoint B: The path is beat-placed
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite; note any pre-existing unrelated failure).
- [ ] `npm run build` clean.
- [ ] Every tick-originated Tone write (robot and global pools) now receives the callback time; the harmony tick and the
      lifecycle are documented as "now" by decision. The warning's absence is not yet shown: T11 does that.
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: The proof and the measurement

- [ ] **Task 10: `scripts/perf/audio-load-lib.mjs`, `scripts/perf/audio-load.mjs` — the console tally**

  **Description:** `audio-load-lib.mjs` exports `tallyConsole(events)`: given the `params` of `Runtime.consoleAPICalled`
  events, returns `{ byType: { warning: n, error: m, … }, lines: [{ type, text, count }] }` where `text` is the first
  line of the first string argument (`args[0].value`, else `args[0].description`, else `'(non-string)'`), counted and
  sorted by count descending. `audio-load.mjs` collects those events in its existing `onEvent` (it already sends
  `Runtime.enable`) and the report prints, after the "carried after warm-up" block, one line
  `console: N warnings, M errors` and then each distinct line with its count, warnings and errors only.

  **Proof:** RED test — `scripts/perf/audio-load-lib.test.mjs`: spec §5.1 item 9.

  **Acceptance criteria:**
  - [ ] Three warnings with the same first line and one error produce `byType.warning === 3`, `byType.error === 1`, two
        `lines` entries, the warning's first.
  - [ ] A multi-line message is keyed by its first line only; an event with a non-string first argument is keyed
        `'(non-string)'`; an empty array returns zero counts and no lines.
  - [ ] `log`/`info` events are counted in `byType` but excluded from `lines`.
  - [ ] A real `npm run perf:audio` run on any world prints the line (checked in T11; this task's proof is the test).

  **Verification:**
  - [ ] `npx vitest run scripts/perf/audio-load-lib.test.mjs` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint B (the branch build is what T11 drives; the tally itself depends on nothing).

  **Files:** `scripts/perf/audio-load-lib.mjs`, `scripts/perf/audio-load-lib.test.mjs`, `scripts/perf/audio-load.mjs`

  **Estimated scope:** S

- [ ] **Task 11: The proof run — stock shows the warning once, the branch not at all; recorded**

  **Description:** Make a swell-heavy world link: in the app, Swell Frequency at its maximum and Swell Duration at its
  minimum, then Settings → Seeds → Copy link. Build `main` to a scratch `--outDir` and serve it on port 4174; build the
  branch and serve it on 4173. Run `npm run perf:audio -- --url http://localhost:4174/trace-atlas/ --world "<link>"
  --seconds 120 --bucket 15` on stock first: the console line must show the Tone text ("Events scheduled inside of
  scheduled callbacks…") with count 1. Then the same on 4173: the text absent. Three rounds each, interleaved,
  foreground, one run per call, orphaned Chrome 0 (PERFORMANCE.md hygiene). Record both in PERFORMANCE.md under a new
  heading ("BeatClock passes the Transport time — the console check"), with the link added to the links list, and note
  backlog 36's `pulseWidth` line if it appears in the same tally (it is not this item's criterion).

  **Proof:** Run — recorded in PERFORMANCE.md and named in the commit.

  **Acceptance criteria:**
  - [ ] Stock: the Tone scheduling warning appears with count 1 in every round (the metric is proven).
  - [ ] Branch: the Tone scheduling warning is absent in every round.
  - [ ] PERFORMANCE.md carries the table (round, build, warnings, errors, the Tone line's count), the link and the date.

  **Verification:**
  - [ ] The run, as above. If stock shows no warning, stop: the tally or the world is wrong, and the branch's zero means
        nothing until it is fixed.

  **Dependencies:** Task 10.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** S (a run and a table)

- [ ] **Task 12: The measurement — the swell tick's main-thread share, three runs and a control; recorded**

  **Description:** Unminified branch build (`npx vite build --minify false --outDir <tmp> --emptyOutDir`), served on
  4174. `npm run perf -- --url "http://localhost:4174/trace-atlas/?<swell-heavy link's query>" --profile --throttle 4`,
  three runs, foreground, one at a time. From each run's **IDLE (blank hub)** CPU profile, read inclusive ms for
  `tickAudioSwells`, and beneath it `updateRobot` (the store half) and the engine methods
  (`updateRobotMasterVolume`, `updateRobotSends`, `updateVoiceLayerParams`, `updateVoiceEnvelope`, the Tone half), as a
  share of the window's sampled ms; also whether any ≥ 50 ms task in the window is attributed to the tick. Repeat three
  times on a control link with Swell Frequency at 0. Record medians and spread, both links, the build and the date in
  PERFORMANCE.md beside T11's heading, and state the §7 Q2 verdict against the 2 % threshold (store half excluded).

  **Proof:** Run — recorded in PERFORMANCE.md and named in the commit.

  **Acceptance criteria:**
  - [ ] Six profiles taken (three swell-heavy, three control), medians and min–max recorded for the three shares.
  - [ ] The verdict line states whether the curve clears the threshold, with the number beside the threshold.
  - [ ] Nothing in `src/` changes.

  **Verification:**
  - [ ] The run, as above, with the harness hygiene (foreground, no orphaned Chrome, same session for both links).

  **Dependencies:** Task 11.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** S

### Checkpoint C: Proven and measured
- [ ] T11's table shows stock 1 / branch 0 in every round; T12's table and verdict are written.
- [ ] Optional listen (spec §5.4): a few minutes on the swell-heavy world at Full on the desktop, no new click or jump at a
      swell's start or return-to-base.
- [ ] Reviewed with human before proceeding to Phase 4.

---

### Phase 4: Docs and the backlog

- [ ] **Task 13: `docs/BEAT_CLOCK.md`, `docs/AUDIO_SYSTEM.md` — document the shipped behaviour**

  **Description:** BEAT_CLOCK.md: the API block's `scheduleRepeat` line becomes `(interval, callback: (time: number) =>
  void)`, the usage example takes the time, the bullet under API says the wrapper forwards the Transport's time and
  consumers place writes at it, and the Forbidden list's "use the callback's `time` argument" bullet now points at a
  real argument. AUDIO_SYSTEM.md: Scheduling Patterns' "Critical rule" names the forwarded time; the Audio Swells
  paragraph's "every write goes through the exact call a human would make" gains "with the tick's time as its last
  argument, so the write lands at the callback's time; a hand edit passes none and lands now"; one sentence under
  Scheduling Patterns records the two consumers that stay on "now" and why. Spot-check every named identifier against
  the shipped source, not this plan.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every signature and name documented matches the shipped source.
  - [ ] The "now by decision" sites (harmony, lifecycle, `setRoomFeeder`) are named once, in AUDIO_SYSTEM.md.

  **Verification:**
  - [ ] Manual review against the final code.

  **Dependencies:** Checkpoint C.

  **Files:** `docs/BEAT_CLOCK.md`, `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** S

- [ ] **Task 14: `docs/todo/backlog.md` — 35's Built line; the new curve item**

  **Description:** Under 35, a **Built** line: the branch, the date, the T11 result (stock 1 / branch 0), pointers to
  T12's numbers. Add a new item, next free number (37 at the time of writing), **Audio: pre-scheduled swell curves**:
  what it is (the whole curve scheduled on the param at the swell's start, rendered on the audio thread with no per-tick
  engine write), the T12 number beside the 2 % threshold and the verdict, and the agreed design if it is built from the
  intent's Out of scope (one swell engine, two writers; the param targets that take a curve; the setting targets that
  stay stepwise; the mid-swell edit reconciliation and the LFO-link interaction as its open questions). Archiving 35
  and deleting its plan.md line happen at merge in the usual way (todo-archive conventions), not here.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] 35 carries the Built line with the two run results linked.
  - [ ] The new item exists with the number, the measurement, the threshold, the verdict and the design; plan.md's
        Parked section gains its one line.

  **Verification:**
  - [ ] Manual read.

  **Dependencies:** Task 12 (the number), Task 13.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`

  **Estimated scope:** XS

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] T11: the Tone scheduling warning is absent on the branch and present once on stock, recorded.
- [ ] T12: the swell tick's share is recorded with the verdict against the threshold.
- [ ] Docs match the shipped code; backlog 35 has its Built line; the curve item exists.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `setValueAtTime` loses the implicit `cancelScheduledValues(now)` of `.value =`; a stale future point from a swell could survive a UI edit | Low | Successive ticks write at increasing times; a UI `rampTo`/`.value =` cancels at most one pending point and the next tick rewrites. The Checkpoint C listen covers it. |
| Tone's headless/test stubs (and `getToneCtor` fallbacks) lack `setValueAtTime` | Med | Every leaf falls back to `.value =` when the method is absent (T1, T2, T4 acceptance criteria). |
| `GLOBAL_SETTER`'s typed table resists the optional second argument for the resolved-rate entries | Low | Type the table as `(params, time?) => void`; one-parameter functions are assignable. If `setGlobalRateResolved`'s return type needs the parameter, add it as ignored. |
| The proof run's stock build shows no warning (world has no swell in 120 s, or the tally misses the event) | Med | T11 stops until stock shows count 1. Swell Frequency at max and Duration at min; `--seconds` up if needed. |
| T12's 6 s idle window catches no swell step | Med | With Frequency at max and five swells per pool running, every `16n` carries writes; if the share is noise, lengthen the window in `profile.mjs`'s `captureWindows` for the run and say so. |
| `TransportLike`'s `time` is `unknown` and Tone passes seconds as a number | Low | Cast once in the wrapper; T7's test invokes with a number. |
| Backlog 36's `pulseWidth` flood swamps the console tally | Low | The tally prints first lines with counts; the criterion is the Tone text, not zero warnings (spec §5.2). |

## Open Questions

None open. Spec §7's four are resolved with the recommendations (Crawford, 2026-10-26) and recorded under Architecture
Decisions. One implementation choice is left to T4 and named there: a small private `setOrPoint` helper in `globalFx.ts`
for the Q and EQ writes, rather than widening `rampOrSet`'s contract.
