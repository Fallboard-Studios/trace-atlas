# Phase Spec: Play until in the Station — a recalled robot plays all the way home and fades out to the bar line

> **Execution Commands**
>
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/systems/workLoop.test.ts src/systems/workLoop.integration.test.ts src/systems/stationFadeSystem.test.ts src/engine/AudioEngine.test.ts src/utils/robotAudibility.test.ts src/systems/audioBudgetSystem.test.ts src/systems/lifecycleSim.test.ts`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-14 from the confirmed intent
[docs/intent/play-until-in-the-station.md](../intent/play-until-in-the-station.md) (`interview-me`, 2026-11-14) and
Crawford's three answers of the same day to the intent's open notes: (1) "I don't think we need to change the mute
functionality, it's just volume ramping down"; (2) "if re-activated, the volume just ramps back up to normal";
(3) "audio stays the same"; and his fourth, on reading the plan: (4) the hold happens "only if there's less than half a
measure left when the robot hits the station", otherwise the fade starts at once and runs to the next bar line (his
pick of the two readings offered). Backlog [84](../todo/backlog.md#84-audio-keep-a-robot-playing-until-it-is-in-the-station),
first item of [plan.md](../todo/plan.md)'s Stage 4. **Plan written the same day:** [docs/tasks/PLAY_UNTIL_IN_THE_STATION.md](../tasks/PLAY_UNTIL_IN_THE_STATION.md), eighteen tasks in five phases, every §7.1 default kept, Q1–Q3 for the gate; awaiting Crawford's approval before the build.
**Built 2026-11-14; Checkpoint B passed the same day.** What shipped, the gate's answers and what is left open are in
§8, "As built".

**Where the facts come from.** Everything marked **(code)** was read in the repo on 2026-11-14 while writing this spec.
Nothing here is measured; the gate (§5.4) is by eye and ear.

---

## 0. Scope check

One capability: a recalled robot's sound follows its body home and leaves with it. The ramp, the stretched arc and
the budget's timing are three faces of the same edge and cannot ship or be judged apart, so no capability map. The
follow-up the intent names (a ramp up on the way out) is out of scope (§1.8) and is not a module of this.

---

## 1. Overview & Claude Explanation

### 1.1 Today (code)

- **The landing silences the swim.** `beginRecall` writes `Recalled` with `dockingHoldUntilMeasure: measure + 1`; the
  next measure tick lands the robot on `Docked` wherever it is (`stepRobotLifecycle`, `landOnDocked`,
  `src/systems/robotSystems.ts`). `isDockMuted(docking)` is true for `Docked` and `Undocking`
  (`src/utils/robotAudibility.ts`), `isRobotAudible` reads it, and `triggerWithCap` refuses the note
  (`src/engine/AudioEngine.ts` ~line 601). So a robot that landed on `Docked` mid-swim triggers nothing for the rest of
  the trip. Nothing audio-side reads `activity` (`src/types/Robot.ts`: "Live only — never replayed, nothing
  audio-side reads it").
- **The budget stands it by.** `audioBudgetSystem.reconcile` lists a dock-muted, unsoloed robot among `mutedIds` and
  pushes it to `setStandingByRobots`; `standingBy.ts` releases its voice after its last recorded note end. The
  budget's subscription key is `id:audioMode:docking` per robot (`signature()`).
- **The trip home.** `returnToStation` writes `'returning'` and swims to `portPosition(station, robot)`; on arrival
  `enter` writes `'entering'` and plays `stationArc(…, 'despawn', …)`: alpha 1 → 0 and scale 1 → `STATION_PORT_SCALE`
  (0.15) over `STATION_ARC_SECONDS` (1 s; `STATION_REDUCED_ARC_SECONDS` 0.3 s, no scale, no ripple, under reduced
  motion), the halo decorator and the station ripple riding on it; its `onComplete` writes `'charging'`, or calls
  `exitStation` if the robot is `Active` again (the turn-back at the port). The `'docked'` seam call does nothing
  (`onLifecycleChange`, `src/systems/workLoop.ts`).
- **The way out.** `Undocking` is silent and hidden; `landOnActive` makes the robot audible at once and the seam's
  `'active'` runs `exitStation` (`'exiting'`, the 1 s `'spawn'` arc, then `next()`).
- **The bus gain.** Every bus-gain write goes through `busGainTarget(robotId, masterVolume)` = `robotBusGain(volume)`
  × the Highlight dip; `setHighlightedRobots` ramps each voice to its target with `rampOrSet(param, target,
HIGHLIGHT_RAMP_SECONDS)` (`src/engine/audioEngine/voiceEntry.ts`, which also takes a `time`).
- **The clock.** `BeatClock.scheduleRepeat(interval, cb(time))` fires with the tick's audio time; since the one music
  clock a `'16n'` repeat lands on the sixteenth grid from the bar (`docs/specs/ONE_MUSIC_CLOCK.md`), and
  `positionAt(time)` gives that tick's `step`, 1 to 16 within its measure (the swells read it this way,
  `src/systems/audioSwells.ts`). `getTickSeconds(time)` is one `16n` at the live tempo; a measure is
  `BEATS_PER_MEASURE * 4` (16) of them. The work loop's own clock is GSAP's ticker, paused and
  offset by `pauseWorkLoop` / `resumeWorkLoop`; it has no measure.
- **Strict Separation** (CLAUDE.md): a GSAP callback never calls AudioEngine; `workLoop.test.ts` pins that the loop
  never touches the engine through a full cycle. A transport or BeatClock callback may call into animation (the seam
  does).

### 1.2 What a homebound robot does (the behaviour)

1. **Recall.** Unchanged: `Recalled`, the hold, the swim home. The robot is heard the whole way, including after it
   lands on `Docked` mid-swim (§1.3).
2. **Arrival at the port.** `enter` writes `'entering'` and **starts no arc**. The robot stands at the port, visible at
   full scale, at its regular volume, in the sounding set, until the next sixteenth tick decides.
3. **The decision, on the next tick** (Crawford's answer 4). The station fade system (§1.4) runs on the sixteenth grid.
   On the first tick after the arrival it reads how many sixteenths are left to the bar line, `left = 17 − step`
   (16 on the bar itself, 1 on the last sixteenth):
   - **Half a measure or more left** (`left ≥ STATION_FADE_MIN_STEPS`, 8): the fade starts **now**. The system schedules
     the robot's volume ramp from its current bus gain to 0 starting at the tick's time and lasting `left` sixteenths
     (`AudioEngine.scheduleStationFade`), and tells the work loop to play the entry arc over the same number of seconds
     (`workLoop.enterOnBar`). Both end on the bar line.
   - **Less than half a measure left** (`left < 8`): the robot **holds** at the port, still playing, and the system does
     the same two things on the bar-line tick (`step === 1`, `left = 16`) with a whole measure as the length.

   So the fade always ends on a bar line and lasts between half a measure and one measure; the hold is under half a
   measure (plus up to one sixteenth and `lookAhead`). The arc is today's `'despawn'` arc with its duration the fade's
   length instead of `STATION_ARC_SECONDS`.

4. **The bar line.** The arc's `onComplete` writes `'charging'` as today. From that write the robot is in its
   station: dock-muted (§1.3), stood by by the budget, its voice released after the last note, exactly as a `Docked`
   robot is today. The ramp has reached 0 by then, so the hand-over is silent.
5. **A turn-back during the hold or the fade** (Crawford's answer 2). The seam's `'active'` finds the robot `'entering'`.
   The loop reverses what is playing: during the hold there is no arc, so the robot simply resumes (`resume`); during
   the fade the arc is reversed from where it is (`tl.reverse()`), and when the reverse completes the robot resumes.
   The volume ramps back up to its regular target over `STATION_FADE_RECOVER_SECONDS` from the landing
   (`AudioEngine.cancelStationFade`, called by `landOnActive`, which is a BeatClock subscriber and already calls the
   engine). No measure is waited for on the way back out.
6. **Nothing else about the audio changes** (Crawford's answer 3): the melody, its registration, the pitch drift at
   the `Docked` landing, the note events the cloud draws, the Highlight dip, Volume, the sends. The ramp is one more
   multiplier on the bus gain, nothing else.

### 1.3 The dock's silence starts when the robot is in the station (not a new mute)

Crawford's answer 1: the mute functionality does not change; this is volume ramping down. The one thing the code
makes necessary is **when** the existing dock silence begins, because today it begins at the `Docked` landing (§1.1),
which is what silences the swim. So:

- `isDockMuted(docking, activity)` is true when the robot is `Docked` or `Undocking` **and** its `activity` is
  `'charging'`. A `Docked` robot that is `'returning'` or `'entering'` is not dock-muted. The same three readers of the
  rule (`isRobotAudible`, the budget's `mutedIds`, `audioDiagnostics`) and the two derived readers (`useRobotMeta`'s
  `lit`, `MetaBox`'s count) take the extra argument; the rule's meaning, "silent in the station", is the same, applied
  when the robot is actually in the station.
- Nothing else about mute, Solo or Highlight moves: a user Mute still wins everywhere; under any Solo only the soloed
  robots are heard; a soloed robot in its station is still heard; Highlight counts only while heard.
- The budget's subscription key gains one bit per robot, `inStation` (`activity === 'charging'`), so it recomputes when
  a robot enters or leaves its station and not on every leg of its work.
- `Robot.activity`'s comment ("nothing audio-side reads it") and ROBOT_LIFECYCLE.md's principle 2 get the one
  exception named: audibility reads whether the robot is in its station. The docking machine still never reads
  `activity`; replay is untouched because `activity` is set from `docking` at spawn and on power-on as today.

### 1.4 The station fade system (new, `src/systems/stationFadeSystem.ts`)

A small transport-side module beside `audioBudgetSystem.ts`, started and stopped where the work loop is:

- **Start:** `scheduleRepeat('16n', onTick)` through BeatClock, the swells' cadence. **Stop:** `cancelSchedule`, and
  every robot it had started is forgotten (the engine's `killAll` / voice teardown already resets the bus).
- **`onTick(time)`:** `at = positionAt(time)` (return with none); `left = BEATS_PER_MEASURE * 4 − (at.step − 1)`;
  `tick = getTickSeconds(time)` (return with none). For each robot of the active locale with `activity === 'entering'`
  that the system has not started: if `left ≥ STATION_FADE_MIN_STEPS` (8), `seconds = left × tick`, then
  `AudioEngine.scheduleStationFade(robot.id, time, seconds)` unless `audioMode === 'solo'` (§1.5), then
  `workLoop.enterOnBar(robot.id, seconds)`, and the robot is marked started; otherwise nothing this tick (the hold), and
  the bar-line tick, where `left = 16`, starts it with a whole measure. A soloed robot gets the arc on the same timing
  and no fade. A started robot that is no longer `'entering'` is forgotten; one that is now soloed is cancelled.
- It is a transport callback, so it may call both the engine and the loop (§1.1's last bullet). The loop still never
  calls the engine.
- A robot that reaches the port inside a tick's lookahead window is seen on the tick after: the decision is late by at
  most one sixteenth plus `lookAhead`, and the hold is under half a measure.

### 1.5 The engine's fade (`AudioEngine.ts`)

- `scheduleStationFade(robotId, time, seconds)`: records the robot in `stationFades` (module state: `robotId → { end:
time + seconds }`) and ramps the voice's `busGain.gain` from its current value to 0 over `seconds` starting at
  `time` (`rampOrSet` with a `time`, or a `linearRampToValueAtTime` at `time + seconds` after a `setValueAtTime` at
  `time`; the plan pins which, against the Tone 15.1.22 param API). A robot with no voice (released, headless stub) is
  recorded and not ramped.
- `busGainTarget` multiplies by the robot's fade factor: 0 while the robot is in `stationFades` and its end has passed,
  else 1. So a Volume or Highlight write that lands after the fade completed keeps the robot silent, and a rebuilt voice
  starts at the right level. A bus-gain write that lands **during** a ramp re-issues the ramp from the write's time to
  the same end (the target it would otherwise jump to is the un-faded one).
- `cancelStationFade(robotId)`: removes the record and ramps the bus to `busGainTarget` over
  `STATION_FADE_RECOVER_SECONDS`. Called by `landOnActive` for every landing (a no-op with no fade live), so a robot
  exiting its station always sounds at its regular volume (the way out, unchanged).
- `releaseVoice` and `reReserveVoice` keep the record; the record goes only through `cancelStationFade`, `killAll` and
  the system's stop. A `Docked` robot's `'charging'` write stands it by; when it is admitted again it is `Active` and
  `landOnActive` has already cancelled the fade.
- **Solo beats the fade** as it beats the dock: the system never schedules a fade for a soloed robot, and a robot that
  becomes soloed mid-fade is cancelled by the budget's next reconcile (`cancelStationFade` from `applyHighlighted`'s
  neighbour, or the system reading the store; the plan pins the seam). A soloed robot in its station is heard at its
  regular volume, as today.

### 1.6 The arc over a measure (`workLoop.ts`)

- `enter` writes `'entering'` and returns; the robot holds at the port. `'entering'` keeps the slot (the occupancy set
  is unchanged).
- `enterOnBar(robotId, seconds)` (exported): a no-op unless the loop is live for the robot's locale and the robot is
  `'entering'` with no arc running; it plays `stationArc(loop, robot, 'despawn', station, onDone, seconds)` with
  `seconds` as the duration. `stationArc` takes an optional duration; absent, it uses `STATION_ARC_SECONDS` as today
  (the exit arc). The halo decorator and the station ripple receive the same duration, so they stretch with it.
  Reduced motion: the body's alpha fades over the full `seconds` (a fade is not a motion), scale and ripple stay off.
- `onDone`: as today. `Active` → `exitStation` is no longer reachable from here in the normal case (the seam handles it
  mid-arc, below) but stays as the guard it is.
- **The seam's `'active'` during `'entering'`:** today "nothing, the arc finishes". Now: if no arc runs (the hold),
  `resume(loop, settle(loop, robot))` at once; if one runs, `tl.reverse()` with the completion rewired to resume. The
  reversed arc is the `'spawn'` shape in time: the body returns to scale 1 and alpha 1 over the time it had spent
  fading. The station ripple, if playing, is left to finish.
- `pauseWorkLoop` / `resumeWorkLoop` and the `'world'` timeline scope pause the arc as they pause every station arc
  today; the fade's audio automation pauses with the suspended context (§7.1 A5, to verify at the gate).

### 1.7 What a listener and a viewer meet

A robot recalled mid-job turns and swims home with its notes running on and its cloud full. At the port it starts to
shrink and dim at once, its notes thinning with it, and by the bar line it is gone and silent and its station's slot is
lit; a robot that arrives in the last half of a bar stands at the port, still playing, for that short while and then
takes the whole next bar to go. If it was called back to work during the fade it grows back the way it went, its
volume returns over half a second, and it swims off. A robot leaving its station is exactly
as today: full volume at the landing, a one-second appearance.

### 1.8 What does not change

- The docking machine, the measure-tick landing on `Docked`, the battery, the pitch drift, the melody registration,
  deterministic replay, the stay-up rule (§1.1's first bullet is where the silence came from; its code is untouched).
- The way out: `Undocking` silent and hidden, `landOnActive`, the one-second `'spawn'` arc, no ramp up.
- `audioMode` is still the user's alone; the lifecycle, the engine and the budget never write it.
- Station choice, slots, `portPosition`, the back-row switch on the way home, `returning`'s turn-back.
- The note cloud: it reads the engine's note events and changes nothing.
- No UI. No new word on screen: `'entering'` keeps its `ACTIVITY_LABELS` entry and now also names the hold.
- Backlog 74's fade-in is not built; its fade-out is this item.

---

## 2. Target File Structure

```text
src/systems/
├── stationFadeSystem.ts          # NEW (§1.4): the '16n' repeat; per tick, the half-measure rule, then
│                                 #   scheduleStationFade + enterOnBar for every 'entering' robot not yet started;
│                                 #   start/stop beside the work loop
├── stationFadeSystem.test.ts     # NEW
├── workLoop.ts                   # enter() holds (no arc); enterOnBar(robotId, seconds); stationArc(duration?);
│                                 #   the seam's 'active' during 'entering': resume or reverse (§1.6)
├── workLoop.test.ts              # the port with no arc, the stretched arc, the reverse, the engine-never-touched pin kept
├── workLoop.integration.test.ts
├── audioBudgetSystem.ts          # isDockMuted(docking, activity); the key's inStation bit (§1.3)
├── audioBudgetSystem.test.ts
├── robotSystems.ts               # landOnActive calls AudioEngine.cancelStationFade (§1.2 step 5)
├── robotSystems.test.ts
├── lifecycleSim.ts               # isSounding comment: a Docked robot on its way home also sounds (the sim's count is
│                                 #   docking-only and stays; §7.1 A6)
└── powerController.ts / the locale start   # start/stop the fade system with the work loop (the plan pins where)
src/engine/
├── AudioEngine.ts                # scheduleStationFade, cancelStationFade, stationFades module state, busGainTarget ×
│                                 #   fade factor, the mid-ramp re-issue (§1.5); triggerWithCap passes activity
├── AudioEngine.test.ts
└── audioDiagnostics.ts           # isRobotAudible's new argument
src/utils/
├── robotAudibility.ts            # isDockMuted(docking, activity); isRobotAudible / isRobotEmitting take activity
└── robotAudibility.test.ts
src/components/panels/screen/
├── screens/useRobotMeta.ts       # lit through the new signature
└── worldView/MetaBox.tsx         # the count through the new signature
src/constants/index.ts            # STATION_FADE_RECOVER_SECONDS (§7.1 A2), STATION_FADE_MIN_STEPS = 8 (§1.2 step 3);
                                  #   STATION_ARC_SECONDS keeps the exit arc
src/types/Robot.ts                # activity's comment: audibility reads whether the robot is in its station

docs/ROBOT_LIFECYCLE.md           # principle 2 (the one exception), rule 6 (the dock's silence begins at 'charging'),
                                  #   the seam table's 'active' row ('entering': resume or reverse), the activity
                                  #   machine's 'entering' (hold + fade measure), Audibility section
docs/AUDIO_SYSTEM.md              # the budget paragraph: a homebound Docked robot keeps its voice until 'charging';
                                  #   the station fade beside the Highlight dip
docs/ANIMATION_SYSTEM.md          # the station arc's duration: the exit 1 s, the entry one measure on the bar
docs/todo/backlog.md, docs/todo/plan.md   # entry 84 and its line; archive after the merge
docs/specs/PLAY_UNTIL_IN_THE_STATION.md   # an "As built" section
```

`spawnSystem.ts`, `standingBy.ts`, `audioBudget.ts` (the rank), `BeatClock.ts`, the station layout, `RobotBody`'s
arc decorator (it already takes a duration) and every content file are untouched.

---

## 3. Implementation Boundaries & Constraints

**Always**

- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). Each rule in
  §1.2–§1.6 a test can reach is a test that fails on today's code.
- The ramp is a bus-gain write in `AudioEngine.ts`, scheduled at a transport callback's `time`; the arc is a GSAP
  timeline in `timelineMap`'s `'world'` scope. The work loop never calls the engine (its test keeps pinning it); the
  fade system, a transport callback, is the only place that reaches both.
- No timer: the grid comes from `scheduleRepeat('16n')`, the step from `positionAt(time)`, the fade's length from
  `getTickSeconds(time)`.
- The docking machine does not read `activity`. `stepRobotLifecycle`, `landOnDocked` and the replay are untouched.
- `audioMode` is never written by this work.
- Run the focused tests per task, then the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**

- Any change to `isRobotAudible`'s rule beyond the `'charging'` condition of §1.3.
- A new `RobotActivity` value (a `'fading'` state) instead of `'entering'` covering hold and fade: it would need a
  content entry and a label.
- Changing the exit arc's duration, or a ramp up on the way out.
- A collision rule between robots at one station (§5.4: judged first).
- Any change to the station layout or `portPosition`.

**Never**

- Audio scheduling from a GSAP callback (the arc's `onComplete` writes `'charging'`; the budget reacts to the store).
- `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask`.
- Holding the `Recalled` → `Docked` landing for the swim.
- A file-text test. The look of the fade, the hold and the overlap are the gate's, named on the task's Proof line.
- A "keep existing sound" or compatibility clause in any doc (pre-v1 rule).

---

## 4. Code Style & Architecture Conventions

The engine's fade, as it would read in `AudioEngine.ts` (names provisional; the plan pins them):

```typescript
/** The station fades live (§1.5): robotId → when the ramp reaches 0 (audio time). Module state. */
const stationFades = new Map<string, { end: number }>();

/** 0 once a robot's station fade has run its course, else 1 (§1.5). */
function stationFadeFactor(robotId: string, now: number): number {
  const fade = stationFades.get(robotId);
  return fade !== undefined && now >= fade.end ? 0 : 1;
}

/** A robot's bus gain target: Volume through robotBusGain, the Highlight dip, the station fade (§1.5). */
function busGainTarget(robotId: string, masterVolume: number, now = Tone.now()): number {
  const dipped = highlightedLive.size > 0 && !highlightedLive.has(robotId);
  return robotBusGain(masterVolume) * (dipped ? HIGHLIGHT_DIP_GAIN : 1) * stationFadeFactor(robotId, now);
}

// In the public object:
/** Ramp a robot's bus to silence from `time` over `seconds` (§1.5). A robot with no voice is recorded only. */
scheduleStationFade(robotId: string, time: number, seconds: number): void {
  stationFades.set(robotId, { end: time + seconds });
  const entry = compositeVoices.get(robotId);
  if (entry) rampOrSet(entry.busGain.gain as unknown as RampableParam, 0, seconds, time);
},
/** The fade is off: the bus returns to its target over STATION_FADE_RECOVER_SECONDS. No-op with no fade. */
cancelStationFade(robotId: string): void {
  if (!stationFades.delete(robotId)) return;
  const entry = compositeVoices.get(robotId);
  if (entry) rampOrSet(entry.busGain.gain as unknown as RampableParam, busGainTarget(robotId, entry.masterVolume), STATION_FADE_RECOVER_SECONDS);
},
```

> `rampOrSet(param, target, rampSeconds, time)` today ramps over **one tick** when a `time` is given (it reads
> `getTickSeconds(time) ?? rampSeconds`), which is right for the swells and wrong here. The plan either adds a sibling
> that ramps over `rampSeconds` from `time`, or calls the param directly; it does not change `rampOrSet`'s existing
> callers.

The audibility rule, as it would read in `robotAudibility.ts`:

```typescript
/** The dock's own mute: a robot in its station — Docked or Undocking, and 'charging' — is silent whatever its
 *  audioMode. A Docked robot still on its way home ('returning', 'entering') is heard until it is in (§1.3). */
export function isDockMuted(
  docking: DockingState | undefined,
  activity: RobotActivity | undefined
): boolean {
  return (
    (docking === DockingState.Docked || docking === DockingState.Undocking) &&
    activity === 'charging'
  );
}
```

- Names follow the neighbours': `scheduleStationFade` / `cancelStationFade` beside `setHighlightedRobots`;
  `STATION_FADE_RECOVER_SECONDS` beside `STATION_ARC_SECONDS`; `stationFadeSystem.ts` beside `audioBudgetSystem.ts`
  with the same `start…` / `stop…` pair; `enterOnBar` beside `onLifecycleChange` and `onRobotMounted` in the loop's
  exports.
- `stationArc`'s duration parameter defaults to today's constant so the exit arc's call sites do not change.
- Each new function's doc comment names the spec section it implements.
- Headless-safe: a stub bus gain goes through `rampOrSet`'s set path; the fade system with no transport registers
  nothing and its stop is a no-op.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest, the existing Tone mocks)

**`robotAudibility.test.ts`** — `isDockMuted(Docked, 'returning')` and `(Docked, 'entering')` are false;
`(Docked, 'charging')` and `(Undocking, 'charging')` are true; `isRobotAudible` and `isRobotEmitting` pass it through;
Mute still wins; Solo still beats the dock. Mutant: the `activity` condition dropped (the old rule).

**`audioBudgetSystem.test.ts`** — a `Docked` robot that is `'returning'` is eligible, in the sounding set, and not in the
standing-by set; its `'charging'` write stands it by (and the key changes on that write); a change of `activity` between
`'transit'` and `'working'` does not recompute (the key is unchanged). Mutant: the key reading `activity` whole.

**`AudioEngine.test.ts`** — `scheduleStationFade` ramps the voice's bus gain to 0 from `time` over `seconds` (the ramp
call's arguments); `cancelStationFade` ramps back to `busGainTarget` over `STATION_FADE_RECOVER_SECONDS` and is a no-op
with no fade; `busGainTarget` is 0 after a completed fade and 1 before its end and after a cancel; a Volume write after
the fade completed keeps the bus at 0; a rebuilt voice after a completed fade starts at 0; `killAll` clears the fades;
`triggerWithCap` refuses a `Docked` + `'charging'` robot and accepts a `Docked` + `'returning'` one. Mutants: the factor
applied before the end; the factor lost on `reReserveVoice`.

**`stationFadeSystem.test.ts`** — with a fake BeatClock repeat and a fake position: an `'entering'` robot seen on step 1
gets one `scheduleStationFade(id, time, 16 × tick)` and one `enterOnBar(id, 16 × tick)`; seen on step 5 (12 left) it gets
both with `12 × tick`; seen on step 9 (8 left, the boundary) it gets both with `8 × tick`; seen on step 10 (7 left) it
gets nothing until the step-1 tick, then both with `16 × tick`; a started robot gets nothing on later ticks; a soloed
`'entering'` robot gets `enterOnBar` and no fade; `'returning'` and `'charging'` robots get nothing; a started robot that
becomes soloed is cancelled on the next tick; one that left `'entering'` and re-enters later is started again; stop
cancels the repeat; no transport or no position does nothing. Mutants: the boundary at 7 or 9; the fade scheduled every
tick; the solo skipped.

**`workLoop.test.ts`** — arrival at the port writes `'entering'` and starts no `station-*` timeline (the body stays at
alpha 1, scale 1 for the hold); `enterOnBar(id, s)` plays the despawn arc with duration `s` (the body's alpha and scale
tweens, the decorator's and ripple's duration), and its end writes `'charging'`; `enterOnBar` for a robot not
`'entering'`, or already in its arc, is a no-op; the seam's `'active'` during the hold resumes at once; during the arc it
reverses, and the reverse's end resumes (the body back at alpha 1, scale 1; `next()` called); reduced motion fades the
alpha over `s` with no scale; the "never touches AudioEngine through a full cycle" pin still passes with a hold, a bar
and a reverse in the cycle; `stopWorkLoop` kills a stretched arc; a leg finishing after stop changes nothing. Mutants: the
arc started at arrival (today's code); the exit arc's duration changed; the reverse replaced by letting the arc finish.

**`robotSystems.test.ts`** — `landOnActive` calls `AudioEngine.cancelStationFade(robotId)`; `landOnDocked` does not;
the tick's only route to visuals is still the seam (the existing pin).

**`lifecycleSim.test.ts`** — unchanged and green: the sim counts `Active` and `Recalled` as sounding (§7.1 A6).

### 5.2 Checks

`npm run build:types`, `npm run lint` (the content rule: no new string), `npm run build`, `npm test` green at each
checkpoint.

### 5.3 Runs (the proof; not tests)

In the browser on the built branch, `?debug` on: a recall watched end to end with the Deck's "n of m" and the robot's
mode light (both stay lit until the body is gone), the robot screen's cloud running through the swim and thinning over
the fade, and the console clear of Tone's "scheduled inside of scheduled callbacks" warning from the fade's writes.

### 5.4 Gate: Crawford's eye and ear (stop)

Three worlds, Light tier and Full: one at a slow tempo (the longest measure, so the longest hold, fade and overlap), one
busy (twelve robots, several recalls close together), one with a Solo on a homebound robot. He judges:

- the two arrivals: one in the first half of a bar (the fade starts at once and runs to the bar line, half a measure
  or more) and one in the last half (a short hold, then a whole bar); is the half-measure boundary right, and does the
  shorter fade still read as a fade;
- the arc and ramp together: do sound and body leave as one on the bar line; is a ramp heard, not a cut;
- the overlap of a fading robot and an exiting one at the same station (the intent's worry): acceptable as is, or the
  exit waits for the fade to end (then a follow-up task, §7.2 Q1);
- a turn-back mid-fade: the body growing back and the volume returning over `STATION_FADE_RECOVER_SECONDS`.

Everything provisional in the intent is pinned or changed here; the spec's "As built" section records the answers.

### 5.5 Done when

- §5.1 green, §5.2 clean, §5.3 seen, §5.4 passed with its answers recorded.
- Docs of §2 updated; backlog 84 archived with its plan.md line deleted; backlog 74's entry notes that its fade-out
  shipped here and its "Plan.md Stage 3" line is corrected to "off plan".

---

## 6. Git & Workflow Context

- Branch `feature/play-until-in-the-station` from `main` after this spec and the plan merge (this spec sits on
  `docs/backlog-84-intent` with the intent).
- Commit per task, RED test in the same commit as its GREEN, message in the repo's voice (`feat(stations): a homebound
robot holds at the port until the bar (Task 4)`), ending with the attribution line the session carries.
- Crawford opens and merges the PR; the PR body links this spec's sections.
- The intent file stays; the plan goes to `docs/tasks/PLAY_UNTIL_IN_THE_STATION.md` from `docs/tasks/TASK_TEMPLATE.md`.

---

## 7. Assumptions and Open Questions

### 7.1 Assumptions (defaults the plan builds on; each re-pinned at the gate)

- **A1. "Don't change the mute" means the user's modes and the budget's standing-by, not the moment the dock's silence
  begins.** The `Docked` landing is what silences the swim today (§1.1), so the one touch of §1.3 is unavoidable; it is
  presented here so Crawford can veto it. If he does, the alternative is to leave `isDockMuted` alone and have the
  engine treat the fade factor as the whole mechanism, which keeps a `Docked` robot's voice alive and triggering (at
  gain 0) in its station for the life of the world and so costs the Light tier the standing cost backlog 67 removed.
  Not recommended.
- **A2. `STATION_FADE_RECOVER_SECONDS` = 0.5.** "Just ramps back up to normal" named no length. Half a second is long
  enough to be a ramp, short enough that a robot swimming off is at full volume before it has left the port. The gate
  hears it.
- **A3. The fade's length is fixed at the tick that starts it, at that tick's tempo.** A tempo change mid-fade does not
  stretch the ramp or the arc; both end where they were set to end, which may be off the new bar. Rare, and the gate's
  slow world does not change tempo. The half-measure boundary is `STATION_FADE_MIN_STEPS = 8` sixteenths, inclusive:
  exactly half a measure left fades at once.
- **A4. Reduced motion fades the body over the whole measure.** A fade is not a motion; the scale and the ripple stay
  off as today. If Crawford prefers the 0.3 s alpha fade kept under reduced motion, it is one constant.
- **A5. Power-off mid-fade pauses the ramp.** The ramp is an AudioParam automation on the context's clock; a suspended
  context stops that clock, and the `'world'` timelines pause with it. Checked at the gate (power off during a fade,
  wait, power on: the body and the volume should continue from where they were). If the automation does not pause,
  the fix is to re-issue the ramp on resume from the paused values, a task the plan reserves.
- **A6. The cover sim stays docking-only.** `lifecycleSim.ts`'s `isSounding` counts `Active` and `Recalled`; a `Docked`
  robot on its way home now also sounds, so the sim under-counts sounding robots and its "never silent" result still
  holds (more sound, not less). Its comment says so; its arithmetic does not change.
- **A7. The `'16n'` repeat is on the grid and `positionAt` names the step.** Since the one music clock a `'16n'` repeat
  lands on the sixteenth grid and `positionAt(time)` rounds to the sixteenth it is on (ONE_MUSIC_CLOCK.md §4.1); the
  swells rely on exactly this. The fade system is started with the loop, after `AudioEngine.start`. Backlog 82's CDP
  probe is the measurement if there is any doubt.
- **A8. A soloed robot never fades** (§1.5). Solo means "hear this one", and a Solo already keeps a robot audible in
  its station; fading it to silence and then unmuting it at `'charging'` would be a dip for nothing.

### 7.2 Open questions

- **Q1. The overlap.** Judged at the gate (§5.4). If the exit must wait, the follow-up is a rule in `exitStation`: a
  robot whose station has a fading occupant holds hidden until that fade's `'charging'` write, then exits. Not designed
  here.
- **Q2. A ramp up on the way out** — the intent's follow-up, out of scope. Noted so the gate's third look (the exit
  beside a fade) can raise it.
- **Q3. The hold's upper bound.** **Answered 2026-11-14** (Crawford's answer 4, §1.2 step 3): the hold happens only
  when less than half a measure is left at arrival, so it is under half a measure plus a sixteenth and `lookAhead`;
  otherwise the fade starts at once and ends on the bar line. The boundary (8 sixteenths) is the gate's to move.

---

## 8. As built (2026-11-14)

Built on `feature/play-until-in-the-station` in one day: Phases 1–3 (Tasks 1–13), the docs (Tasks 14–16), and three
fixes Crawford asked for at the gate. Commits, deviations and every measurement are in the plan
([docs/tasks/PLAY_UNTIL_IN_THE_STATION.md](../tasks/PLAY_UNTIL_IN_THE_STATION.md): "Phase 3 as built" and Checkpoint B).
Full suite 14,356 passed / 0 failed at the last code commit.

### 8.1 The gate (§5.4)

Checkpoint A (Phase 1 alone, by ear) and the engine's-fade checkpoint passed with Crawford on 2026-11-14. Checkpoint B
passed the same day: its measurable half was probed headless (Crawford remote) and recorded in the plan, and he passed
the eye-and-ear half and asked for three fixes (§8.4). His answers:

- **Q1, the overlap at one station: acceptable as is.** He passed the gate with no change to the exit and accepted
  "fine as is" when asked. Task 13a (the exit waits for a fading occupant) is **not built**.
- **Q2, a ramp up on the way out: not wanted now.** Same: no change asked. The exit is as it was; a fade-in stays
  backlog [74](../todo/backlog.md#74-audio-fade-a-robot-in-and-out-on-its-station-arcs)'s follow-up, off the plan.
- **Q3, the hold:** answered before the build (§7.2): the hold only with less than half a measure left.
- **The provisional items of the intent** (the stretched arc, the half-measure boundary, the fade's length): all kept
  as specified.

### 8.2 The §7.1 defaults

| | Default | As built |
|---|---|---|
| A1 | The dock's silence begins at `'charging'` (`isDockMuted(docking, activity)`) | **Kept**; not vetoed at Checkpoint A, where Phase 1 alone was audible. `activity` is a required parameter. |
| A2 | `STATION_FADE_RECOVER_SECONDS` = 0.5 | **Kept.** The cancel ramp is now timed (§8.4). |
| A3 | Fade length fixed at the tick that starts it; `STATION_FADE_MIN_STEPS` = 8, inclusive | **Kept.** Measured: every fade ends on a bar line to 0 ticks, the step-9 arrival (8 left) fades at once. |
| A4 | Reduced motion fades the body over the whole fade | **Kept.** |
| A5 | Power-off mid-fade pauses the ramp | **Holds for the audio** (measured: the bus gain freezes with the context and the ramp continues on the bar line), so Task 13b is **not built**. **Not for the picture:** the world timelines resume before the context clock runs again, so the arc can get ahead (0.1–0.3 s headless); backlog [88](../todo/backlog.md#88-power-the-world-timelines-resume-before-the-audio-clock). |
| A6 | The cover sim stays docking-only | **Kept**; `lifecycleSim.ts`'s `isSounding` comment now says it under-counts a homebound robot. |
| A7 | The `'16n'` repeat is on the grid and `positionAt` names the step | **Confirmed** by the probe. |
| A8 | A soloed robot never fades | **Kept**; a Solo mid-fade cancels on the next sixteenth (measured 0.16 s at 68 BPM). |

### 8.3 Constants as shipped (`src/constants/index.ts`)

`STATION_FADE_MIN_STEPS` = 8 (new), `STATION_FADE_RECOVER_SECONDS` = 0.5 (new), `STATION_ARC_SECONDS` = 1 (now the
exit arc only), `STATION_REDUCED_ARC_SECONDS` = 0.3 (now the reduced-motion exit only), `STATION_PORT_SCALE` = 0.15
(unchanged).

### 8.4 Beyond the spec

- **"An arc is running" is the key set and part-way** (`arcRunning`, `progress() < 1`): a finished arc stays registered
  under `station-${id}`, so the plan's "the timeline is set" left every robot that had exited earlier at its port.
- **`resumeWorldTimelines()` uses `resume()`, not `play()`**, which would turn a turn-back's reversed arc forward after
  a power cycle (`src/animation/timelineMap.ts`).
- **The reversed arc is killed at its end**, so a robot recalled again during the reverse gets a fresh entry.
- **The three fixes asked for at the gate:** `cancelStationFade(robotId, time?)` ramps from an explicit time (the fade
  system's tick, or `Tone.now()` for `landOnActive`, whose tick stays on "now" by decision); a voice rebuilt mid-fade
  is built where the ramp is and carries it on (`stationFadeFactor` is the ramp's share; `continueStationFade`); the
  entry arc is stretched by `AudioEngine.secondsUntilHeard(time)` so it ends when the fade is heard to end. Re-measured:
  `'charging'` 0.06–0.11 s after each fade's end at gain 0.
- **What `'charging'` does to the sound**, for the record: it stops *new* notes (the dock mute at the trigger, then the
  budget's stand-down after the last note); notes already sounding keep fading on the bus. So an early `'charging'`
  skips a quiet last note; it does not cut the sound.
- **After the review (2026-11-14, [todo/play-until-in-the-station-findings.md](../todo/play-until-in-the-station-findings.md)):**
  §1.4's "the system marks a robot started" is gone. The system keeps no record of its own: an entry has started while
  the engine holds the robot's fade (`AudioEngine.hasStationFade`) or the loop runs its arc (`workLoop.arcRunning`,
  exported). Its own record went stale when a turn-back's reverse ended on the port while the robot was recalled
  again, which re-enters `'entering'` in the same call; the robot then held at its port for ever (R1). And §1.5's
  "a write during a ramp re-issues the ramp" is gone too: a bus-gain write under a recorded fade writes nothing, since
  the bus is on its ramp or at 0 and nothing may raise it (F1; the re-issue added a ramp point per swell tick).

### 8.5 Left open

- Backlog [88](../todo/backlog.md#88-power-the-world-timelines-resume-before-the-audio-clock): after a power cycle the
  world timelines resume before the context clock runs, so the entry arc can get ahead of its fade.
- Backlog [89](../todo/backlog.md#89-audio-the-note-events-lead-counts-from-tonenow): the note events' `lead` counts
  from `Tone.now()`, which already runs a lookahead ahead of the context clock (noticed while building §8.4, not
  measured).
- A robot un-soloed after its fade was cancelled stays at its regular volume until `'charging'`; the spec does not
  cover it, and nobody has heard it.
