# Intent: BeatClock Passes the Transport Time — every tick-originated Tone write lands at the callback's time

Confirmed via `interview-me` on 2026-10-26 (6 questions; one guess overturned and then reinstated: Crawford first
folded the pre-scheduled swell curve into this item, then, shown that the saving was unmeasured and the two measured
problems lay elsewhere, kept it out behind a measurement), ahead of a `spec-driven-development` pass. Backlog item
[35](../todo/backlog.md#35-audio-beatclock-drops-the-transport-time-its-callbacks-are-given), first line of plan.md's
Stage 1. Not a roadmap entry; a bug-shaped item that stays in the backlog.

## Outcome

The beat-based scheduling path becomes what CLAUDE.md already says it is. Today it is beat-*triggered* but
now-*placed*: BeatClock's `scheduleRepeat` wrapper ([beatClock.ts](../../src/engine/beatClock.ts)) takes a `() => void`
and discards the `time` the Transport hands it, so every Tone write a tick makes lands at the audio clock's current
time, about `lookAhead` (100 ms) before the beat the Transport meant, with main-thread jitter on top. After this, the
wrapper hands the time to its callback and every Tone write that originates directly in a tick is placed at that time,
so two runs of the same seeded world put the same values at the same audio-clock positions. Reproducibility is the
reason; nothing here is audible. Tone's one-line warning ("Events scheduled inside of scheduled callbacks should use
the passed in scheduling time") stops as a consequence, not by suppression.

## Behavior

- **BeatClock passes the time.** `scheduleRepeat(interval, callback)`'s callback type becomes `(time: number) => void`
  and the wrapper forwards the Transport's `time` unchanged, for schedules registered live and for the ones queued
  before `initBeatClock`. `subscribeToMeasure` keeps its `(measure) => void` signature: its only consumer is the
  docking lifecycle, which does not schedule audio from the tick (below).
- **Carried by hand, never pinned.** The time travels as an explicit, optional trailing parameter down the swell
  path: `tickAudioSwells` → `writeRobotValue` → `applyVolume`, `applySendValue`, `applyLayersContinuous`, `applyAdsr`
  ([robotOptionsActions.ts](../../src/systems/robotOptionsActions.ts)) → `AudioEngine.updateRobotMasterVolume`,
  `updateRobotSends`, `updateVoiceLayerParams`, `updateVoiceEnvelope` → `rampOrSet`
  ([voiceEntry.ts](../../src/engine/audioEngine/voiceEntry.ts)) and the composite's writes
  ([compositeVoice.ts](../../src/engine/audioEngine/compositeVoice.ts)). The pattern is the one `processMelodyStep(step,
  time)` already uses. Rejected: a module-level "current scheduled time" that BeatClock sets around each callback and
  the engine reads when a caller passes none. It is hidden runtime state whose behaviour depends on who called and
  when; a note left pinned would put slider moves in the past.
- **UI callers pass nothing.** The drawers and company options call the same four `apply*` helpers from a user
  gesture. They leave the time undefined and the engine uses `Tone.now()`, which is right for a human edit.
- **Ramps and sets both take the time.** `rampOrSet` gives `rampTo` its `startTime`; a write that today uses the
  `.value =` setter (which Tone resolves to `cancelScheduledValues(now) + setValueAtTime(now)`, silently) becomes a
  `setValueAtTime(value, time)` when a time is given, so the silent writes move onto the beat too, not only the one
  call Tone warns about. The global swell writes go through `useAudioStore.setGlobalAudio`, a store write whose engine
  side runs from a subscription; the spec decides whether those stay on "now" like the lifecycle's or can take the
  time without threading it through the store.
- **Param writes land at `time` itself.** The callback's time already runs about `lookAhead` ahead of now, so it is a
  valid future time; no `MIN_LEAD` is added. Notes keep their existing `time + MIN_LEAD` in `processMelodyStep`.
- **Two tick consumers say why "now" is right for them.** The harmony tick
  ([harmonySystem.ts](../../src/engine/harmonySystem.ts)) reaches no Tone call at all: it reassigns a module variable
  the note scheduler reads later. The docking lifecycle ([robotSystems.ts](../../src/systems/robotSystems.ts)) writes
  to the Zustand store and the audio changes come out of store subscriptions (`audioBudgetSystem` and the engine's own
  reactions); that is a semantic state change, not a scheduling path, and threading an audio time through a store
  `set` would blur the separation kept strict elsewhere. Each gets a comment saying so, and the lifecycle's path stays
  on "now" by decision.
- **Measured, so the next step is a decision.** The swell tick's main-thread share is measured with the perf harness
  (`npm run perf`, [profile.mjs](../../scripts/perf/profile.mjs), method in [PERFORMANCE.md](../PERFORMANCE.md)) on a
  world with swells running, and the number is recorded. It is what the pre-scheduled curve (Out of scope) will be
  decided on.

## Style / constraint

- Option A only (explicit parameter). No new engine-level concept, no implicit scheduling context.
- The archived swells spec's rule that a swell writes through the same `apply*` a human would call
  (docs/specs/archive/AUDIO_SWELLS.md §3) is kept; the time is one more argument to those same functions.
- RED first, as the backlog line asks: the swell tests assert the time reaches the engine mock; the BeatClock tests
  assert the wrapper forwards the Transport's `time` for live and queued schedules. The harmony and lifecycle comments
  are not tested (no behaviour, per CLAUDE.md).
- Done when the warning does not fire on a fresh page through a few measures of a playing world, checked headlessly
  over CDP with a `console.warn` listener (the `scripts/perf/cdp-lib.mjs` helpers exist for this), and the suite is
  green.
- Crawford asked for the change on 2026-10-26, so CLAUDE.md's "ask before changing the audio architecture" is met for
  the path's call shape. What it schedules does not change.

## Out of scope

- **The pre-scheduled swell curve.** Scheduling a swell's whole curve on the Web Audio param at its start, so the
  audio thread renders it with no per-tick engine write. Discussed and deferred, not rejected: it removes only the
  engine half of a per-swell cost that is already a handful of calls a second (the store write per tick stays for the
  slider display), neither measured problem implicates it (desktop underruns were raster-bound, the phone's clicks at
  Light are the graph's standing node cost), and it brings a mid-swell edit reconciliation (cancel the automation,
  recompute from the new base) and an interaction with LFO links on the same param that today work implicitly because
  each tick re-reads the robot. Smoothness is not a gain; sixteen glided steps a measure is already a smooth sweep.
  It becomes a new backlog item that names the measurement above and the condition under which it gets built, with
  the design already agreed if it does: **one swell engine, two writers**, params (robot volume, the two sends, each
  layer's gain and detune) take a curve at the swell's start time, while the fields that are plain settings the synth
  reads later (layer `phase` and `pulseWidth`, the four ADSR fields, non-param global settings) keep the stepwise
  write at the callback time. ADSR fields are only read at note trigger, so a per-tick step is already the finest
  meaningful granularity for them.
- Backlog [36](../todo/backlog.md#36-audio-swells-on-pulsewidth-write-nan-into-the-voice-every-tick) (the
  `pulseWidth` NaN) stays its own item, even though it is the same swell path.
- Any change to what the ticks schedule, to the harmony tick's cadence, or to the lifecycle's measure semantics.
- The Stage 1 audio-engine interview (backlog 27) and anything about how the graph is built.

## Known implementation notes (not yet spec'd)

- Tone's `assertUsedScheduleTime` (`core/util/Debug.js`) fires once per page on the first `toSeconds(undefined)` inside a
  scheduled callback. `Param.rampTo(value, rampTime, startTime?)` reaches it when `startTime` is omitted; the
  `.value =` setter does not (it calls `this.now()`). So the single warning today comes from `rampOrSet` on the swell
  tick's volume and send writes, and the layer `.value =` writes are now-placed silently. Both move.
- `compositeVoice.ts` already clamps a note's time to `Math.max(requested, Tone.now() + 0.001, lastTime + 0.001)` per
  layer; the param writes may want the same floor so a late callback never schedules into the past.
- `rampOrSet` has a twin in [globalFx.ts](../../src/engine/audioEngine/globalFx.ts) with the same shape; whether the
  global swell writes reach it depends on the store-subscription decision above.
- Phase 53's per-mover work found the camera tick is a cost, not the cause, of desktop underruns; the swell-tick
  measurement should follow the same hygiene (foreground one run at a time, A/B in one session,
  [perf-harness notes](../PERFORMANCE.md)).
