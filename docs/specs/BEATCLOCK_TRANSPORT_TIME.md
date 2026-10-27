# Phase Spec: BeatClock Passes the Transport Time — Tick-Originated Writes Land on the Beat

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - The proof run (§5.2): `npm run build && npx vite preview --port 4173` then
>   `npm run perf:audio -- --world "<a swell-heavy world link>" --seconds 120 --bucket 15`, reading the new console line
> - The measurement (§5.3): `npx vite build --minify false --outDir <tmp> --emptyOutDir && npx vite preview --outDir <tmp> --port 4174`
>   then `npm run perf -- --url "http://localhost:4174/trace-atlas/?<the same world link>" --profile --throttle 4`

**Status:** spec written 2026-10-26 from [docs/intent/beatclock-transport-time.md](../intent/beatclock-transport-time.md)
(interview of the same day). Backlog item
[35](../todo/backlog.md#35-audio-beatclock-drops-the-transport-time-its-callbacks-are-given), first line of plan.md's
Stage 1; it stays a backlog item. Plan: [docs/tasks/BEATCLOCK_TRANSPORT_TIME.md](../tasks/BEATCLOCK_TRANSPORT_TIME.md).
One change from the intent: the **global** swell pool also reaches Tone from the tick (§1, "Two sources"), which the
intent left to this spec; §3 and §7 question 1 decide it.

§7's four questions are resolved with the recommendations (Crawford, 2026-10-26): (1) option (a), the time passes
through `setGlobalAudio(effect, partial, time?)`; (2) the curve is built only past the 2 % threshold, store half
excluded, or a ≥ 50 ms task attributed to the tick (measured past it, then dropped at Checkpoint C: §7 Q2); (3) one `rampOrSet`, `globalFx.ts`'s copy removed; (4) the console
tally lives in `perf:audio`. The plan's Architecture Decisions record each.

---

## 1. Overview & Claude Explanation

Tone's Transport calls every scheduled callback with the audio-clock time the event is *for*, which runs about
`lookAhead` (100 ms by default) ahead of the time the callback actually executes. A write that passes that time lands
on the beat; a write that passes nothing lands at "now", up to 100 ms early, by an amount that depends on when the
main thread got round to running the callback. BeatClock's `scheduleRepeat(interval, callback)` wrapper
([beatClock.ts](../../src/engine/beatClock.ts)) takes a `() => void` and drops the time, so everything downstream of it
is beat-*triggered* but now-*placed*. The engine's own note tick does not go through the wrapper and already passes the
time (`processMelodyStep(step, time)`, `time + MIN_LEAD`), so notes are fine. The wrapper's consumers are not.

**Why it matters: reproducibility, not sound.** Nothing here is audible: a swell is a seeded sweep nobody knows is
coming, with no downbeat to be on, and a 100 ms shift of the whole curve plus a few milliseconds of jitter per step is
below hearing. But two runs of the same seeded world currently place their swell steps at slightly different audio-clock
positions, because "now" depends on main-thread timing. With the callback time, they land identically. Crawford's
words: "reproducibility is paramount, otherwise we wouldn't have seeds." Tone's one-line warning ("Events scheduled
inside of scheduled callbacks should use the passed in scheduling time") is the symptom; it stops because the writes
move, never by suppression.

**Two sources, both the swell tick.** Tone's `assertUsedScheduleTime` (`core/util/Debug.js`) fires once per page, on the
first `toSeconds(undefined)` inside a scheduled callback. `Param.rampTo(value, rampTime, startTime?)` reaches it when
`startTime` is omitted; the `.value =` setter does not (it calls `this.now()`), so it is now-placed silently. Walking
the three wrapper consumers:

- **The swell tick** (`startAudioSwells`, [audioSwells.ts](../../src/systems/audioSwells.ts), every `16n`) writes two
  ways. The **robot pool** goes `advanceRobotSwell` → `writeRobotValue` → `applyVolume` / `applySendValue` /
  `applyLayersContinuous` / `applyAdsr` ([robotOptionsActions.ts](../../src/systems/robotOptionsActions.ts)) →
  `AudioEngine.updateRobotMasterVolume` / `updateRobotSends` / `updateVoiceLayerParams` / `updateVoiceEnvelope` →
  `rampOrSet` ([voiceEntry.ts](../../src/engine/audioEngine/voiceEntry.ts), a `rampTo` with no start time: **the
  warning**) and the composite's `set({ layers })` ([compositeVoice.ts](../../src/engine/audioEngine/compositeVoice.ts),
  `.value =` on layer gain and detune: silent, now-placed). The **global pool** goes `advanceGlobalSwell` →
  `writeGlobalValue` → `useAudioStore.setGlobalAudio(effect, partial)` → `GLOBAL_SETTER[effect]`
  ([audioStore.ts](../../src/stores/audioStore.ts)) → `setGlobalEQ` (`.value =`, silent) and `setGlobalFilterLPF` /
  `setGlobalFilterHPF` ([globalFx.ts](../../src/engine/audioEngine/globalFx.ts): frequency through that file's own copy of
  `rampOrSet`, **the warning again**; Q through `.value =`). All of it synchronous inside the Transport callback.
- **The harmony tick** (`scheduleHarmonyCycle`, [harmonySystem.ts](../../src/engine/harmonySystem.ts)) reaches no Tone
  call. It reassigns `availableNotes`, which the note scheduler reads later with its own time. Nothing to move.
- **The docking lifecycle** (`startRobotLifecycle`, [robotSystems.ts](../../src/systems/robotSystems.ts)) runs on
  `subscribeToMeasure`, which BeatClock fires from inside its own `16n` tick with the measure only. Its transitions
  write the store (`updateRobot`), and the audio consequences come out of store *subscriptions*
  (`audioBudgetSystem.ts` on the roster key, the engine's reservation paths). That is a semantic state change whose
  audio reaction belongs to a subscriber, not a scheduling call the tick makes. It stays on "now" by decision, and
  `subscribeToMeasure` keeps its signature.

**The fix, in one sentence:** the wrapper forwards the time, and the time is carried **by hand** as an explicit optional
trailing parameter down both swell paths into the engine, where a ramp gets it as its start time and a set becomes a
`setValueAtTime`. UI callers of the same functions pass nothing and get "now", which is right for a human gesture.
Rejected (intent): a module-level "current scheduled time" that BeatClock pins around each callback for the engine to
read; hidden runtime state whose behaviour depends on who called and when.

**Out of this item, decided with a number:** scheduling a swell's whole curve on the param at its start, so the audio
thread renders it with no per-tick engine write. Deferred behind the measurement in §5.3; the agreed design if it is
built is in the intent's Out of scope and goes to a new backlog item (§6).

---

## 2. Target File Structure

```text
src/
├── engine/
│   ├── beatClock.ts                      # scheduleRepeat callback type (time: number) => void; forwards it, live and queued
│   ├── beatClock.test.ts                 # RED: the time reaches the callback (live schedule, promoted schedule)
│   ├── harmonySystem.ts                  # (_time) => …, one comment: no Tone call here
│   ├── AudioEngine.ts                    # updateRobotMasterVolume / updateRobotSends / updateVoiceLayerParams / updateVoiceEnvelope take time?
│   ├── AudioEngine.test.ts               # RED: the four methods hand the time to rampOrSet / composite.set
│   └── audioEngine/
│       ├── voiceEntry.ts                 # rampOrSet(param, target, rampSeconds, time?); RampableParam gains setValueAtTime?
│       ├── voiceEntry.test.ts            # RED: rampTo gets the start time; setValueAtTime when no rampTo; .value when neither
│       ├── compositeVoice.ts             # set(params, time?): gain and detune via setValueAtTime when a time is given
│       ├── compositeVoice.test.ts        # RED: the two timed writes; phase/pulseWidth/adsr unchanged
│       ├── globalFx.ts                   # setGlobalEQ / setGlobalFilterLPF / setGlobalFilterHPF take time?; its rampOrSet twin goes (§3)
│       └── globalFx.test.ts              # RED: the three setters' timed writes
├── stores/
│   ├── audioStore.ts                     # setGlobalAudio(effect, partial, time?) forwards time to GLOBAL_SETTER (§7 Q1 option a)
│   └── audioStore.test.ts                # RED: the forward; a UI call forwards undefined
├── systems/
│   ├── audioSwells.ts                    # tick → advance → write* carry time; the 16n callback takes it
│   ├── audioSwells.test.ts               # RED: a tick at time T reaches every engine spy with T
│   ├── robotOptionsActions.ts            # the four apply* helpers take time? and pass it on
│   ├── robotOptionsActions.test.ts       # RED: each forwards; without one, the engine sees undefined
│   └── robotSystems.ts                   # one comment at startRobotLifecycle: why no time here
scripts/perf/
├── audio-load.mjs                        # Runtime.consoleAPICalled tally, one report line (§5.2)
├── audio-load-lib.mjs                    # tallyConsole(events): pure, counts by level and first line
└── audio-load-lib.test.mjs               # its tests
docs/
├── BEAT_CLOCK.md                         # the API line and usage example carry the time
├── AUDIO_SYSTEM.md                       # Scheduling Patterns' critical rule; the Audio Swells paragraph on writes
├── PERFORMANCE.md                        # the swell-tick measurement (§5.3), beside the audio-load series
└── todo/backlog.md                       # 35's line to the archive on merge; the curve decision under 35 (§7 Q2)
```

No new file under `src/`. No new dependency.

---

## 3. Implementation Boundaries & Constraints

- **Option A only.** The time is a parameter. Every function on the two paths gains one optional trailing `time?: number`
  and does nothing with it but pass it on, until the engine. No scheduling context object, no module variable, no
  reading `Tone.now()` anywhere new.
- **Undefined means now.** A missing time is not an error and not defaulted upstream: the engine's leaf calls leave
  Tone's own behaviour in place (`rampTo(value, rampTime)` with two arguments, `.value =`). A caller passing `undefined`
  explicitly is the same as omitting it. The UI never learns the parameter exists.
- **Param writes land at `time` itself.** The callback time already runs about `lookAhead` ahead of now, so it is a
  valid future time; no `MIN_LEAD` is added. Notes keep `time + MIN_LEAD` in `processMelodyStep`. No floor is applied
  either: Web Audio clamps a start time earlier than `currentTime` to `currentTime`, and Tone's `setRampPoint` holds at
  the clamped time, so a late callback degrades to "now", which is today's behaviour.
- **Ramps get a start time; sets become `setValueAtTime`.** `rampOrSet(param, target, rampSeconds, time?)`: with a time
  and a `rampTo`, `param.rampTo(target, rampSeconds, time)`; with a time and no `rampTo` but a `setValueAtTime`,
  `param.setValueAtTime(target, time)`; otherwise today's two branches. In the composite's `set`, layer gain
  (`gainNode.gain`, a `Tone.Param`) and detune (`oscillator.detune`, a `Tone.Signal`) use `setValueAtTime(value, time)`
  when a time is given and `.value =` when not. Note the semantic difference and accept it: `.value =` is
  `cancelScheduledValues(now) + setValueAtTime(now)`; the timed write cancels nothing. Successive ticks write at
  strictly increasing times, so nothing needs cancelling; a UI `.value =` or `rampTo` between two ticks cancels at most
  the one pending point, and the next tick rewrites it. An LFO link on the same param is a connected source and sums
  with the automation; a timed point changes nothing for it.
- **Fields that are settings, not params, take no time.** Layer `phase` and `pulseWidth` (`applyOscFieldViaSet`, plain
  oscillator settings), the ADSR (`synth.set({ envelope })`, read at the next trigger), the filters' `Q` and the EQ's
  three bands if Tone exposes them as settings rather than Params in the headless path. Where the live node *is* a Param
  (`eq.low/mid/high` are `Param`s in decibels, `lpf.Q`/`hpf.Q` are Signals), the setter uses `setValueAtTime` with a
  time like the composite does; where it is a stub, `.value =`. The rule is one line: **a live Param or Signal takes
  the time; a setting does not**, and each leaf says which it is.
- **The global pool goes through the store, with the time as a pass-through argument** (§7 question 1, option (a),
  recommended). `setGlobalAudio(effect, partial, time?)` forwards `time` to `GLOBAL_SETTER[effect](edit, time)`; the
  three setters the swells reach accept it, the rest ignore an extra argument they never declare. The store stores
  nothing new: the time is an argument that passes through an action, exactly as `applyVolume(robot, localeId, pct,
  time?)` is a store write and an engine call side by side. The lifecycle is different in kind, not degree: its audio
  reactions are *subscribers'*, not a call the tick makes, and that is the line.
- **`rampOrSet` has one home.** `globalFx.ts`'s private copy is deleted and the file imports `voiceEntry.ts`'s (its
  `value: unknown` typing was the only difference; `RampableParam` covers every call site). Both would have had to
  change anyway; one function, one test.
- **`setRoomFeeder` stays on "now".** A send swell that reaches 0 flips a robot out of an effect room's feeder set, and
  the room's bypass cell ramps dark (`bypassCell.ts`). That is a room-state change, structural like the lifecycle's,
  not a swell value; it is not given the time and says so in a comment.
- **The store write per tick stays.** `writeRobotValue` still calls the same `apply*` a human would, which writes the
  store first (the slider crawls, a save mid-swell reads the captured base through `sessionDiff.ts`). Its cost is what
  §5.3 measures; it is not reduced here.
- **`subscribeToMeasure` and the internal `16n` tick are untouched.** The listeners get the measure; the tick's own
  callback already ignores its time correctly (it reads `transport.position`).
- **CLAUDE.md rules stand:** no Tone construction outside the engine; `AudioEngine` remains the scheduler; state stays
  serialisable (nothing new is stored). Crawford asked for this change on 2026-10-26, so "ask before changing the audio
  architecture" is met for the call shape. What the ticks schedule does not change.
- **Not in scope:** the pre-scheduled curve (§6), backlog
  [36](../todo/backlog.md#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick) (the `pulseWidth` NaN, the
  same path, its own item), the harmony cadence, the lifecycle's measure semantics, and anything the Stage 1
  audio-engine interview (backlog 27) will decide about how the graph is built.

---

## 4. Code Style & Architecture Conventions

```typescript
// src/engine/beatClock.ts — shape, not final code
export function scheduleRepeat(interval: string, callback: (time: number) => void): string {
  // …
  const transportId = transportInstance.scheduleRepeat((time) => {
    callback(time as number); // Tone hands the audio-clock time the tick is FOR; consumers place writes at it
  }, interval, interval);
  // …
}

// src/engine/audioEngine/voiceEntry.ts
/** A Tone Param / Signal as far as a live edit needs it: `rampTo` and `setValueAtTime` when the real node has them. */
export type RampableParam = {
  rampTo?: (value: number, rampTime: number, startTime?: number) => void;
  setValueAtTime?: (value: number, time: number) => void;
  value: number;
};

/** Glide `param` to `target` over `rampSeconds`, starting at `time` when the caller is a Transport tick (the
 *  callback's own time), else now. With no ramp, a timed point; with neither, assign (headless / test stubs). */
export function rampOrSet(param: RampableParam, target: number, rampSeconds: number, time?: number): void {
  if (typeof param.rampTo === 'function') {
    if (time !== undefined) param.rampTo(target, rampSeconds, time);
    else param.rampTo(target, rampSeconds);
  } else if (time !== undefined && typeof param.setValueAtTime === 'function') {
    param.setValueAtTime(target, time);
  } else {
    param.value = target;
  }
}

// src/systems/audioSwells.ts
swellScheduleId = scheduleRepeat('16n', (time) => tickAudioSwells(localeId, getCurrentMeasurePrecise(), time));
```

- The parameter is always the **last** one and always named `time`, in seconds on the audio clock, as `processMelodyStep`
  and `compositeVoice.ts`'s `trigger` already name theirs. Never `at`, `when` or `startTime` at the app level.
- A function that takes the time only to pass it on gets no new doc text beyond "(the tick's time, §BEATCLOCK_TRANSPORT_TIME)"
  on its existing comment. The two leaves (`rampOrSet`, the composite's `set`) and the two "stays on now" sites
  (`startRobotLifecycle`, `setRoomFeeder`) carry the one-paragraph reason.
- `devWarn` from `src/utils/helpers` for any new failure path, never `console.*`.
- Tests colocated beside their module, as today. The harness helper is pure and tested in `audio-load-lib.test.mjs`
  (vitest already includes `scripts/**/*.test.mjs`).

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first, one task each)

Each test invokes the code it checks; none reads source text (CLAUDE.md, "Tests exercise code, not text").

1. **BeatClock** (`beatClock.test.ts`, the mock transport's `scheduleRepeat` invokes callbacks with a number):
   a live `scheduleRepeat` callback receives the time the transport passed; a schedule queued before `initBeatClock`
   receives it after promotion; `cancelSchedule` and `resetBeatClock` behave as before (existing tests, unchanged).
2. **`rampOrSet`** (`voiceEntry.test.ts`): with `rampTo` and a time → `rampTo(target, rampSeconds, time)`; with `rampTo`
   and no time → called with exactly two arguments; without `rampTo`, with `setValueAtTime` and a time →
   `setValueAtTime(target, time)`; without `rampTo`, no time → `.value = target`; without either → `.value = target`
   even with a time.
3. **Composite `set`** (`compositeVoice.test.ts`): `set({ layers: [{ gain }] }, time)` calls `gainNode.gain.setValueAtTime(gain,
   time)`; `set({ layers: [{ detune }] }, time)` calls `oscillator.detune.setValueAtTime(detune, time)`; without a time both
   assign `.value` as today; phase, pulseWidth and adsr follow their existing paths with or without a time.
4. **The four engine methods** (`AudioEngine.test.ts`): `updateRobotMasterVolume(id, v, time)` and `updateRobotSends(id,
   sends, time)` reach `rampOrSet` with the time; `updateVoiceLayerParams(id, layers, time)` and `updateVoiceEnvelope(id,
   adsr, time)` reach `composite.set(…, time)`; each without a time reaches the leaf with `undefined`.
5. **The global setters** (`globalFx.test.ts`): `setGlobalFilterLPF({ frequency }, time)` and the HPF twin ramp with the
   time; `setGlobalEQ({ low }, time)` places a timed point on `eq.low`; the `Q` writes likewise; no time → today's calls.
6. **`setGlobalAudio`** (`audioStore.test.ts`, engine mocked): `setGlobalAudio('filterLPF', { frequency }, time)` calls the
   engine setter with `(edit, time)`; a call without a time passes `undefined`; an empty partial still pushes nothing.
7. **The `apply*` helpers** (`robotOptionsActions.test.ts`): each of `applyVolume`, `applySendValue`, `applyLayersContinuous`,
   `applyAdsr` forwards its time to the matching engine method; without one the engine sees `undefined`; the store write
   is unchanged either way.
8. **The swell tick** (`audioSwells.test.ts`, which already spies the engine methods): the `16n` callback registered with
   `scheduleRepeat`, invoked with a time `T` while a robot swell is active on a volume, a send, a layer gain and an ADSR
   field in turn, reaches the matching engine spy with `T` as its last argument; with a global swell active,
   `setGlobalAudio` is called with `T`; the exact return-to-base write carries `T` too.
9. **The console tally** (`audio-load-lib.test.mjs`): `tallyConsole(events)` counts `Runtime.consoleAPICalled` events by
   `type` and by the first line of the first string argument, and names the Tone scheduling warning's text when present.

Not tested, by CLAUDE.md's "no RED test for a task with no behaviour": the harmony callback's `(_time)` and the two
"stays on now" comments. Their proof is a Read.

### 5.2 The proof run (a run, not a test)

`npm run perf:audio` gains a console tally: with `Runtime.enable` already on, an `onEvent` for `Runtime.consoleAPICalled`
collects every warning and error for the run, and the report prints one line (`console: N warnings, M errors`) followed
by the distinct first lines with counts. **Prove the metric first:** the stock `main` build on one port must show the
Tone scheduling warning **once** (it fires on the first swell step), or the check detects nothing. Then the branch build
on a second port, same world, same seconds: the warning's text is **absent**. World: a world link with Swell Frequency at
its maximum and Swell Duration at its minimum, so both pools run swells continuously, 120 s, production build, foreground,
orphaned Chrome 0 (PERFORMANCE.md hygiene). Criterion is the Tone text absent, **not** zero warnings: backlog 36's
`pulseWidth` flood is in the same tally until 36 ships, and the report must make the two distinguishable (that is why it
prints first lines, not a count).

### 5.3 The measurement (the curve's number)

`npm run perf -- --profile --throttle 4` against an unminified build (`--url` to a `--minify false` preview), on the
same swell-heavy world link, three runs, foreground, one at a time. Read from the **IDLE (blank hub)** window's CPU
profile the inclusive milliseconds of `tickAudioSwells` and, beneath it, of `updateRobot` (the store half) and of the
engine methods (the Tone half), as a share of the window's sampled time. Run the same three times on a second link with
Swell Frequency at 0 as the control (the tick still fires; only the rolls run). Record medians and spread in
PERFORMANCE.md under a new heading beside the audio-load series, with the two links. The number does **not** gate this
item; it is the input to §7 question 2, which decides whether the pre-scheduled curve is ever built.

### 5.4 The listen (Crawford)

Not required by the change (nothing audible moves), but a few minutes on a swell-heavy world at Full on the desktop
confirms no new click or jump at a swell's start or return-to-base, which a wrong `setValueAtTime` (a point without the
hold a `.value =` cancel used to imply) would produce.

### 5.5 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.

---

## 6. Git & Workflow Context

- Branch `fix/beatclock-transport-time`, off `main` (`ff5155ce` or later). Backlog 36 gets its own branch afterwards.
- Tasks, in order, one commit each, RED first where there is behaviour (the plan fixes the exact list): the leaf
  (`rampOrSet`, `RampableParam`, the globalFx twin removed); the composite's timed `set`; the four engine methods; the
  three global setters and `setGlobalAudio`; the four `apply*` helpers; BeatClock's wrapper; the swell tick's threading;
  the harmony and lifecycle comments and `setRoomFeeder`'s (a Read); the console tally and the proof run (§5.2,
  recorded); the measurement (§5.3, recorded); docs (BEAT_CLOCK.md, AUDIO_SYSTEM.md, PERFORMANCE.md); the backlog
  (35's line to the archive in the usual way; the curve decision recorded under 35 with the §5.3 number and the §7 Q2
  threshold. The new "pre-scheduled swell curves" item this bullet first asked for was dropped at Checkpoint C, §7 Q2).
  The PR is Crawford's.
- Leaf before caller, so every intermediate commit type-checks: a function may accept a time nobody passes yet, never
  pass one nobody accepts.
- Commit messages: short, imperative, the proof named ("RED then green: …", "a Read" for comment and docs tasks, "the
  run" for §5.2 and §5.3).

---

## 7. Open Questions

1. **How does the global pool carry the time?** **(a)** `setGlobalAudio(effect, partial, time?)` forwards it to
   `GLOBAL_SETTER`; one path, the store stores nothing new, mirrors the robot helpers' store-write-plus-engine-call
   shape. **(b)** `writeGlobalValue` splits into a data-only store write plus a direct engine call with the time; keeps
   store action signatures free of audio times, but needs a new data-only action, duplicates `GLOBAL_SETTER`'s routing
   for three effects, and breaks AUDIO_SYSTEM.md's "every write goes through the exact call a human would make" for the
   global pool. **(c)** the global pool stays on "now" with a comment, like the lifecycle; but it is a call the tick
   makes, not a subscriber's reaction, and the warning would keep firing from it. **Recommendation: (a).**
2. **The threshold for the curve.** When is the pre-scheduled curve worth its mid-swell-edit reconciliation and second
   writer? Proposal: build it only if, on the §5.3 measurement at 4× throttle, the swell tick's inclusive share of the
   idle window exceeds **2 %** of sampled time *with the store half excluded* (the curve cannot remove the store write),
   or any task ≥ 50 ms in the window is attributed to the tick. Below that the item records the number and closes.
   Crawford's number to set; the backlog item carries whatever it is.
   **Decided (Crawford, 2026-10-26, Checkpoint C): not built.** The measurement cleared the threshold (3.38 % median,
   [PERFORMANCE.md](../PERFORMANCE.md#the-swell-ticks-main-thread-share-task-12)), but the param writes a curve would
   remove are 0.45–0.70 %. Most of the tick is phase writes rebuilding a periodic wave, a setting the curve cannot carry;
   that cost is backlog [37](../todo/backlog.md#37-audio-phase-swells-rebuild-a-periodic-wave-every-tick).
3. **Unify `rampOrSet` now?** §3 says yes (delete `globalFx.ts`'s copy, import `voiceEntry.ts`'s). The alternative is to
   give both the parameter and leave the duplication for a nit. **Recommendation: unify**; the change is one import and
   a type that already fits.
4. **Where the console tally lives.** In `perf:audio`'s report (recommended: `Runtime` is already enabled there, the world
   pinning and warm-up exist, and backlog 36 will want the same line) or a separate tiny script. **Recommendation:
   `perf:audio`.**
