# Tone.js fixes

**Closed 2026-11-14.** Crawford picked items 1 and 12, and they were built on `fixes/tonejs-finds`
(`8d623430`, `2d3852ef`); each carries a note saying what was found. The rest were read against the code
the same day and left unbuilt; each carries a "Not built" note with the reason. Item 4 proposes a fix that
would make the polyphony count worse, not better, and item 2 overstates what a throw costs. Items 3 and 7
wait on a listen. The line links were re-pointed at the code as it stands on that branch.

The audit as written follows.

A read of every Tone.js consumer against Tone's own best practices (start on a gesture, the lazy
`getTransport()`/`getContext()` accessors, schedule at the callback's `time`, ramp a live param instead of
stepping it, dispose what you disconnect, keep off private fields) and the repo's rules (CLAUDE.md, the
"Core Audio Rules", "Scheduling Patterns", "Forbidden Patterns" and "Audit Checklist" in
`docs/AUDIO_SYSTEM.md`, `docs/BEAT_CLOCK.md`'s "Forbidden", `docs/POLYPHONY_GUIDE.md`). Audit date
2026-11-13, on `main` at `944db28a`; Tone 15.1.22 (`^15.1.22`, the lockfile's `latest`). When written,
nothing here was built: each item was a proposal for Crawford to pick up or cut.

Scope: the 15 non-test files that import `tone` (`AudioEngine.ts`, `audioContextSetup.ts`,
`audioDiagnostics.ts`, `lfoEngine.ts`, `lfoShared.ts`, and `audioEngine/{bypassCell, busFilter,
compositeVoice, globalFx, holdOffs, standingBy, toneHelpers, voiceEntry}.ts`), the two engine modules that
touch Tone without importing it (`tonePatches.ts` patches its prototype, `beatClock.ts` takes the
transport by injection), and the consumers that drive them (`audioSwells.ts`, `powerController.ts`,
`robotSystems.ts`, `audioStore.ts`'s `GLOBAL_SETTER`). What was checked for each: where Tone nodes are
constructed and on which context, whether a Transport callback schedules at its `time`, whether a live
`Param`/`Signal` is ramped or stepped, disconnect-then-dispose on every teardown, context timers versus
wall timers, the private Tone fields relied on, and the repo rules (Tone only in `src/engine/`, no
timers for musical time, no audio from a GSAP callback, nothing non-serialisable in Zustand, `MIN_LEAD`
and `MAX_POLYPHONY`).

Verified before writing, in `node_modules/tone/build/esm` and `node_modules/standardized-audio-context`:

- `Context.getDefaults()` is `lookAhead: 0.1, updateInterval: 0.05` whatever the `latencyHint`, and
  `latencyHint` is read-only — so a `playback` context keeps the 100 ms lookahead every comment here
  assumes (`core/context/Context.js`).
- Tone's "Events scheduled inside of scheduled callbacks should use the passed in scheduling time" fires
  from `ToneWithContext.toSeconds(undefined)` while `Transport._processTick` has the flag up; the flag is
  set and cleared around `forEachAtTime` with **no `try`/`finally`** (`core/clock/Transport.js:141-143`).
- `connect()` (`core/context/ToneAudioNode.js:268`) resolves a `Param`'s `input` and connects; it never
  resets the destination. The reset-to-0 lives only in `connectSignal()` (`signal/Signal.js:172`), whose
  callers are `Signal`, `SignalOperator`, `LFO` and `Envelope` — a `Tone.Gain` source never goes through it.
- `TransportRepeatEvent._restart` re-aligns a repeat to its own grid from the event's start, so a repeat
  registered while the transport runs still fires on the sixteenth (`core/clock/TransportRepeatEvent.js:83`).
- `Oscillator._restart` only `cancelStop()`s the running node (`source/oscillator/Oscillator.js:98`): a
  Synth retriggered under its own release tail keeps its oscillator and phase, so there is no retrigger
  click from the oscillator. (Checked because a composite layer plays back-to-back sixteenths.)
- `standardized-audio-context`'s `AudioContext` exposes `baseLatency` and the native context at
  `_nativeAudioContext`; it has **no `outputLatency`** at all (`factories/audio-context-constructor.js`).
- `Context.setTimeout` arms at `now()` (`currentTime + lookAhead`) and fires when `now()` passes it
  (`core/context/Context.js:413-437`), so every context timer in the engine is relative to the same frame.

## Clean — what passes, so nobody re-audits it

- **Tone stays in `src/engine/`.** No component, animation module, system, hook or store imports `tone`;
  `src/animation/**` never calls `AudioEngine` (every file says so and `buildJobTimeline.test.ts` proves it).
- **No timers for musical time.** The wall timers are UI: the reverb impulse-response debounce
  (`globalFx.ts`, documented as a commit debounce), the `?debug` sampler, the share toast, the roster tile
  and the Attenuation Style clock. Every audio-clock-relative wait (voice release, stand-down, a cell's
  darken, teardown and duck, the Reverb drop) is `Tone.getContext().setTimeout`, so a power pause freezes it.
- **Start and lifecycle.** `Tone.start()` runs from the rocker's gesture; only the lazy accessors are used
  (no `Tone.Transport`/`Tone.Destination`); both `16n` ticks are registered and the tempo written before
  `transport.start()`; `pause`/`resume` suspend the raw context and touch nothing else; `killAll` cancels,
  stops and rewinds, and `resetBeatClock` re-clears ids Tone has already dropped without throwing.
- **Callbacks schedule at their `time`.** The melody tick, the panners, the swells (through `timeArg`),
  `rampOrSet`/`setOrGlide`'s one-tick glides, and `rampCell`'s chords (started at `context.now()`).
  `MIN_LEAD` is on every note and on every LFO start; the live cap never exceeds `MAX_POLYPHONY`.
- **Teardown.** A voice drops composite, sends, panner, bus gain and bus filter each in its own guarded
  step; a link gain drops the trunk's edge first (the one Web Audio's own `disconnect()` cannot see);
  a cell's effect is disconnected at wet 0 before it is disposed; the replaced Phaser is disposed after
  the swap; the output taps come down with `?debug`.
- **Graph hygiene the team already paid for**: the twelve zero-delay cycle-search cuts, the raw-context
  biquad for the bus filter, the Reverb IR coalescing, the bypass-cell crossings and ducks, the oscillator
  leak patch with its reconnect. All as the specs describe; nothing to add.

## Fix (behaviour)

### 1. A note event's `lead` never includes the output latency, because the wrapper has no `outputLatency`

**Fixed 2026-11-14** on `fixes/tonejs-finds` (`8d623430`). The probe went into a module of its own,
[nativeContext.ts](../../../src/engine/nativeContext.ts) (`contextHolders`, `readContextSeconds`): the
wrapper, then `_nativeAudioContext`, then `_nativeContext`, with a field that throws or is not an object
skipped. `outputLatencySeconds` reads `outputLatency`, else `baseLatency`, through it, keeping the cap and the
"0 is not reported" rule; `audioDiagnostics`' `playbackStats` probe uses the same holders, and the `?debug`
HUD's latency line now ends `output Nms` from the same read. The spec's A11 records the as-built gap. The
hand-off to the note-cloud session below was moot: PR #640 had merged.

**Left for Crawford:** whether the lead should be `outputLatency` *plus* `baseLatency` rather than one or
the other. The Web Audio spec defines them as separate stages; browsers differ on whether `outputLatency`
includes the base. Read both on the HUD on a real device (Bluetooth especially): an `output` at or below
`base` suggests the browser reports them as separate stages, so the lead should add them.

[AudioEngine.ts:527](../../../src/engine/AudioEngine.ts#L527) (`outputLatencySeconds`) reads
`Tone.getContext().rawContext.outputLatency`, then `baseLatency`. `rawContext` is standardized-audio-context's
wrapper, which has `baseLatency` and nothing called `outputLatency` (verified above), so the first read is
always `undefined` and the lead carries only `baseLatency`. On the `playback` hint every boot now uses, the
browser's `outputLatency` is the larger of the two by design (that is what the hint buys), so the note cloud's
"now" sits early by `outputLatency − baseLatency` — typically tens of milliseconds on desktop Chrome, more
on Android — and `NOTE_KNOWN_AHEAD_SECONDS` was tuned against the smaller number. The spec's A11 asked for
`outputLatency` first; the code intends it; the wrapper hides it.

Fix: read the native context the way `audioDiagnostics.ts` already does for `playbackStats`
(`NATIVE_CONTEXT_FIELDS`, now in `nativeContext.ts`): probe
`rawContext._nativeAudioContext.outputLatency` (then `_nativeContext`), then the wrapper's `baseLatency`,
keeping the `> 0`, finite and `NOTE_LATENCY_MAX_SECONDS` guards. Lift the probe into one shared helper so the
HUD and the note events read the same number, and show both latencies on the HUD line. Proof: a RED test in
`AudioEngine.test.ts` with a stub raw context carrying `_nativeAudioContext: { outputLatency: 0.08 }` and
`baseLatency: 0.02`, asserting the emitted `lead` includes `0.08`. This is the note-cloud branch's domain —
hand it to the session working there rather than editing beside it.

### 2. A throwing Transport callback escapes into Tone's tick loop and leaves Tone's "inside a callback" flag up

**Not built** (read 2026-11-14). The mechanism is right; the cost is overstated. Tone's timeline runs
the events due on one tick in the order they were added, and each repeat re-adds its next run as it fires,
so the order holds: the swells' repeat, registered last, runs after the BeatClock tick and the melody tick
on its sixteenth. A swell throw therefore cannot drop that sixteenth's notes or its measure change; what is
left unguarded ahead of it is `positionAt` and two pure reads in `stepNotes`. Read, not run. Nothing throws
today, and before v1 an uncaught error is easier to notice than a `devWarn`. The stuck flag is real but
costs only a misattributed one-shot warning.

Three repeats hand Tone an unguarded function: `beatClock.ts`'s own `16n` tick
([beatClock.ts:87](../../../src/engine/beatClock.ts#L87); only its measure listeners are wrapped, at line 98)
and its two `scheduleRepeat` wrappers ([beatClock.ts:108](../../../src/engine/beatClock.ts#L108),
[beatClock.ts:201](../../../src/engine/beatClock.ts#L201)), and the melody tick
([AudioEngine.ts:689](../../../src/engine/AudioEngine.ts#L689)), whose `stepNotes` reads the palette, the roster
and the Humanize roll *outside* the per-event `try`. The swells' tick
([audioSwells.ts:429](../../../src/systems/audioSwells.ts#L429)) reaches Tone through the second wrapper and
reads robot layers with `!` assertions.

Tone invokes every event due on a tick inside one `forEachAtTime` with no `try` (verified above). So one
throw: skips every other event still due on that tick (the BeatClock tick, the melody tick and the swell tick
share every sixteenth — a swell throw can drop that sixteenth's notes and its measure change), and leaves
`isInsideScheduledCallback` true for the rest of the page, so Tone's one-shot warning fires on the next
untimed call anywhere, pointing at the wrong code. The measure listeners are already guarded for exactly
this reason; the ticks that call them are not.

Fix: wrap the three `beatClock.ts` callbacks and the melody tick in `try { … } catch (err) { devWarn(…) }`,
as the measure listeners are. Proof: a RED test in `beatClock.test.ts` with a mock transport that invokes two
registered repeats on one tick; the first throws, the second must still run and the devWarn must be called.

### 3. The Delay's time is written as a step, on every Tempo change when the Delay is Anchored

**Not built** (read 2026-11-14): the step is real and the lines below are current. Listen first: a
50 ms ramp of a delay time is a short pitch chirp on whatever the line carries, harsh on a big jump, so
it is a trade, not a free fix. Build it only if the step is heard: on a loud Delay send, drag Delay Time,
then Anchor the Delay and drag Tempo.

[globalFx.ts:875-876](../../../src/engine/audioEngine/globalFx.ts#L875-L876): `delay.delayTime.value =` and
`delay.feedback.value =` are plain assignments (`cancelScheduledValues(now)` + `setValueAtTime(now)` in
Tone's `Param`). A stepped `delayTime` moves a DelayNode's read head at once, which is a discontinuity in
whatever the delay line is carrying — Tone's own Delay docs ramp it for that reason. Two paths hit it at
drag rate: the Delay Time slider itself, and `reapplyTempoSyncedValues` on **every** Tempo slider event while
the Delay is Anchored (`audioStore.ts`'s `setBPM`), where each step is a different note length.
[globalFx.ts:123-128](../../../src/engine/audioEngine/globalFx.ts#L123-L128) records that only the LPF/HPF
frequency ramp was "confirmed audible" and the rest were deliberately left as direct writes, so this is a
proposal, not a correction of that decision.

Fix: `rampOrSet(delay.delayTime, seconds, DELAY_RAMP_SECONDS)` and the same for `feedback`, with the ramp
short (the 50 ms the other global ramps use; a ramped delay time reads as a brief pitch bend instead of a
click — the usual trade). Proof: by ear, on a world with a loud Delay send — drag Delay Time, then Anchor
the Delay and drag Tempo. If an offline measure is wanted, the spread recipe in
`docs/specs/GLOBAL_PEDALS.md` §8 (peak second difference of the steady waveform, step vs ramp) fits as it is.

### 4. The polyphony window closes about 60 ms before the sound does

**Not built, and not to be done as written** (read 2026-11-14). The arithmetic below is right in
audio time and wrong for what the count is for. The cap is read by later Transport ticks, which run a
lookahead ahead of the audio and schedule their notes at `time + MIN_LEAD`. In that frame the slot frees
when the ticks then running would start a note 40 ms plus `MIN_LEAD` after the old one ended. So the count
already errs long, not short. Adding `lookAhead` would hold each slot another 100 ms: a sixteenth-long note
would then still be counted two ticks later above about 62 BPM, where today that starts at about 107 BPM, and
a capped tier would drop more notes. `standingBy` adds the lookahead for a different reason: it disposes
nodes, which must wait for the real audio to finish.

[AudioEngine.ts:460](../../../src/engine/AudioEngine.ts#L460): `delayFromNow = (time − Tone.now()) + durSec +
0.04` on `context.setTimeout`, which arms and fires against `now()` = `currentTime + lookAhead`. The
decrement therefore lands when `currentTime = time + dur + 0.04 − lookAhead`, i.e. 60 ms before the note
ends with the default 100 ms lookahead — before its release has even begun. `standingBy.ts` saw this and adds
the lookahead back ([standingBy.ts:66](../../../src/engine/audioEngine/standingBy.ts#L66), with a comment
saying it does so because the timer fires against `now()`); `scheduleVoiceRelease` does not, though
`POLYPHONY_GUIDE.md` describes it as "tied to the note's actual end time". The cap is an approximate
budget, so this is small — at most a few sixteenths a second admitted while the previous window is still
sounding — but it is the one place the two context-timer users disagree on the frame.

Fix: add `Tone.getContext().lookAhead` to `delayFromNow` (keeping the 0.04 margin), with the same
`?? 0` guard `standingBy` uses. Proof: a RED test in `AudioEngine.test.ts` with a stubbed context whose
`lookAhead` is 0.1, asserting the `setTimeout` delay the release schedules.

## Tidy (no behaviour change intended; several only make a standing decision explicit)

### 5. Untimed `rampTo` calls that can run inside a Transport callback

**Not built** (read 2026-11-14). Doc-only, and the paths are listed here, which is where the next reader
who wonders will look.

`BEAT_CLOCK.md` and `AUDIO_SYSTEM.md` name two consumers that stay on "now" by decision (the lifecycle's
store reactions and `setRoomFeeder`'s crossings). The chain they open is longer than the two names: a measure
tick → `tickRobotLifecycle` → store write → `audioBudgetSystem` → `setHighlightedRobots`
([AudioEngine.ts:1639](../../../src/engine/AudioEngine.ts#L1639), untimed `HIGHLIGHT_RAMP_SECONDS`),
`setSoundingRobots` → `reReserveVoice` ([AudioEngine.ts:1211](../../../src/engine/AudioEngine.ts#L1211), which
builds three Synths and a bus synchronously inside the tick, then `updateRobotPan`
([AudioEngine.ts:1428](../../../src/engine/AudioEngine.ts#L1428)) and `updateRobotSends` untimed), and any
send swell that crosses 0 → `setRoomFeeder` → `writeCellMix` → `rampCell`'s two-argument `rampTo`. Each
untimed `rampTo` is `toSeconds(undefined)` inside the flag, so Tone warns once and the ramp starts at
`now()`, up to a lookahead early. Nothing is wrong by the decision; the proposal is to list these paths under
the decision in `AUDIO_SYSTEM.md`'s "Scheduling Patterns" so the next reader does not re-find them, and to
note that `Tone.now()` itself never warns (the per-note floor in `compositeVoice.ts` is fine). Doc-only.

### 6. `connectAdditively`'s override-and-restore is a no-op on today's graph, and the restore cancels automation

**Not built** (read 2026-11-14). The restore can cut a glide in flight, but only when a link is connected
within the same 50 ms, and a swell rewrites its target on the next sixteenth; not worth touching the code
around the old LFO bug for that. The `AUDIO_SYSTEM.md` paragraph ("the worst LFO bug") is left as it is:
correcting it wants the headless check below first.

[lfoShared.ts:110-116](../../../src/engine/lfoShared.ts#L110-L116). Every source this module connects into a
`Param`/`Signal` is a `Tone.Gain` (link gains, the two drift gains); a Gain's `connect` goes through
`connect()`, never `connectSignal()`, so Tone 15.1.22 never resets the destination (verified above). The
`override = false` write and the value restore therefore change nothing on the graph as built, but the
restore (`dest.value = currentValue`) is `cancelScheduledValues(now)` on the target: a `restoreLink` on a
tier change, or a `linkTarget` on a lane edit, cuts any glide or swell in flight on that target at `now`.
`AUDIO_SYSTEM.md`'s "worst LFO bug" paragraph describes the LFO-direct era and says the reset applies to
"anything"; it does not. Proposal: keep the helper (cheap insurance for a future source that *is* a Signal)
but drop the restore, or gate it on `source instanceof Tone.Signal`; correct the doc paragraph. Proof: a
headless-Chrome check (the CDP recipe in `docs/PERFORMANCE.md`) that a `Gain.connect(filter.frequency)` leaves
`frequency.value` unchanged, before and after.

### 7. Live gains stepped during a slider drag

**Not built** (read 2026-11-14). Listen with item 3: Master Volume and a filter link's depth are the two
most likely to be heard. If none is, cut all six.

`setMasterVolume` ([globalFx.ts:794](../../../src/engine/audioEngine/globalFx.ts#L794)), the Reverb Amount
([holdOffs.ts:123](../../../src/engine/audioEngine/holdOffs.ts#L123); its hold-off lift *does* ramp), the
Delay Amount ([globalFx.ts:874](../../../src/engine/audioEngine/globalFx.ts#L874)), a depth-only link edit
([lfoEngine.ts:339](../../../src/engine/lfoEngine.ts#L339)), the drift gains
([lfoEngine.ts:150-154](../../../src/engine/lfoEngine.ts#L150-L154)) and a lane's rate
([lfoEngine.ts:288](../../../src/engine/lfoEngine.ts#L288)) are all `.value =`. The robot Volume, Pan and
Sends, and every colour and pedal param, ramp 50 ms for the click a step can make; these do not. A depth step
on a filter-frequency link is the one most likely to be heard (it moves the cutoff by the LFO's current
value times the depth change at once). Fix: `rampOrSet(..., VOLUME_RAMP_SECONDS)` across the six. Proof: by
ear on each slider; low priority behind items 3 and 4.

### 8. A seconds duration is stringified for the synth

**Not built** (read 2026-11-14). Cosmetic, as it says; `MIN_SOUNDING_SECONDS` keeps the exponent case away.

[AudioEngine.ts:663](../../../src/engine/AudioEngine.ts#L663) passes `String(duration)` so Tone's `Time`
parses a numeric string as seconds, and `compositeVoice.ts` stringifies again (`String(dur)`). Tone's `Time`
accepts a number as seconds directly, so both hops can carry `NoteDuration | number` and hand the synth the
number. Cosmetic: removes a parse per note per layer and the dependence on `String(x)` matching Tone's
number regexp (a value in exponent form would not; `MIN_SOUNDING_SECONDS` keeps that from happening today).

### 9. `Tone.Time(...)` on the hot path

**Not built** (read 2026-11-14). Only if `npm run perf` ever shows per-tick cost in the long-task column.

`scheduleVoiceRelease` builds a `Tone.Time` per note, and `stepNotes` another per rested or clipped note. A
`transport.toSeconds(event.length)` read once per distinct written length per tick (or a small memo keyed by
the length and the tempo) would do; `getTickSeconds(time)` already shows the pattern. Measure first with
`npm run perf` — only worth it if the per-tick cost shows in the long-task column.

### 10. Stale comment on the per-layer monotonic time guard

**Not built** (read 2026-11-14). Doc-only, a comment; for whoever is next in the file.

[compositeVoice.ts:241-256](../../../src/engine/audioEngine/compositeVoice.ts#L241-L256) says Tone Source nodes
"require strictly increasing schedule times" and nudges a collision by 1 ms. Tone 15's `Source.start` on a
started source restarts it (the Oscillator's restart only cancels its stop, verified above); it does not
throw. The nudge is harmless (one note per robot per step, so a collision needs two triggers of one layer in
one quantum), but the comment states a Tone contract that is not there. Doc-only.

### 11. The private Tone surface, in one place for the upgrade

**Not built as a table in `AUDIO_SYSTEM.md`** (read 2026-11-14). The list below is the inventory;
backlog 34 (the Tone upgrade) now points here. Item 1 moved the wrapper's two native-context fields from
`audioDiagnostics.ts` to `nativeContext.ts`, which both readers share.

Seven guarded reads of Tone and wrapper internals: `Oscillator.prototype._start` and `_oscillator`
(`tonePatches.ts`), `Reverb._convolver` (`holdOffs.ts`), `BitCrusher._bitCrusherWorklet._worklet` /
`.disposed` (`globalFx.ts`), `_lfoL`/`_lfoR`/`_lfo` and `effectSend`/`effectReturn`/`_split`/`_merge`
(`bypassCell.ts`), `Chorus._delayTime`/`_depth`/`_lfoL._scaler._add`/`_mult`/`_min`/`_max` (`globalFx.ts`),
`Transport._timeline`/`_repeatedEvents` (`audioDiagnostics.ts`) and the wrapper's
`_nativeAudioContext`/`_nativeContext` (`nativeContext.ts`, read by `audioDiagnostics.ts` and, since item 1,
`AudioEngine.ts`). Each degrades to a warning or a fallback on a Tone whose shape differs, which is right;
what is missing is one list to re-check on `npm update tone`. The Tone-patch section of `AUDIO_SYSTEM.md`
already does this for its two names. Proposal: a short "Private Tone fields the engine reads" table under
that section, one row per field with the file and the fallback. Doc-only.

### 12. Two `AUDIO_SYSTEM.md` snippets contradict the rules around them

**Fixed 2026-11-14** on `fixes/tonejs-finds` (`2d3852ef`). A third was found beside them: Quick
Troubleshooting's `Tone.context.state`. `Tone.context`, like `Tone.Transport`, is a const evaluated at
import against Tone's default context (`node_modules/tone/build/esm/index.js`), so it reads the context
`audioContextSetup.ts` closes; it now says `Tone.getContext().state`. The drift tip now says the callback's
`time + MIN_LEAD` inside a callback, `AudioEngine.now()` only outside one. `scheduleNote` adds no lead
itself, so the snippet's `+ MIN_LEAD` stays.

- "Debug Tools" ([AUDIO_SYSTEM.md, Debug Tools](../../AUDIO_SYSTEM.md#debug-tools)) read
  `Tone.Transport.state` and `Tone.Transport.bpm.value`. That deprecated global was built on Tone's default
  context, which `audioContextSetup.ts` disposes at boot, so in this app it reports a dead transport. Should
  be `Tone.getTransport()`.
- "Schedule a Note" ([AUDIO_SYSTEM.md, Schedule a Note](../../AUDIO_SYSTEM.md#schedule-a-note)) scheduled
  `AudioEngine.now() + MIN_LEAD` from inside a `scheduleRepeat` callback — the pattern the "Critical rule"
  two sections below forbids (the callback gets `time`). Should read `time + MIN_LEAD`.

Doc-only; proof is a read.

## Observations, no action proposed

- **Node construction inside the Transport tick.** The budget's admission (`standingBy.admit` →
  `reReserveVoice`) can build a robot's whole voice graph synchronously inside the measure tick, and a
  stand-down disposes one there. Tone permits it (a running context, nodes made on it), and the design
  wants the voice back the moment the budget admits it; the cost simply lands in that tick's main-thread
  slice. Worth remembering when a long task is traced to a measure boundary, nothing more.
- **`Transport.scheduleRepeat` while running.** The swells' repeat is registered after `transport.start()`
  (`startLocaleSystems`), with its interval as its start time. Tone re-aligns it to the grid from that
  start (verified), so `positionAt(time)`'s rounding is safe for it, as `BEAT_CLOCK.md` says.
- **`latencyHint: 'playback'` and lookahead.** The hint does not move Tone's `lookAhead` (verified), so the
  "100 ms" in `BEAT_CLOCK.md`, `holdOffs.ts`, `bypassCell.ts` and `AUDIO_SYSTEM.md` is right for every
  boot; only the browser's own output latency changes with the hint — which is item 1.
