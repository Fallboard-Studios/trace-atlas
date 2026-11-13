# BeatClock Specification

Source of truth: [`src/engine/beatClock.ts`](../src/engine/beatClock.ts).

**Related docs:** [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md) · [HARMONY_SYSTEM.md](HARMONY_SYSTEM.md) · [MELODY_SYSTEM.md](MELODY_SYSTEM.md)

## What It Is

`beatClock.ts` has **no Tone.js import** and exports **no `BeatClock` object** — it does not wrap or proxy `Tone.Transport`. It declares a minimal `TransportLike` interface (`PPQ`, `getTicksAtTime`, `scheduleRepeat`, `clear`, optional `toSeconds`) and works out musical position from the transport's tick count at a callback's own time, on whatever transport-like instance is handed to it. All API below is a **named function export**; there is no namespace to call methods on.

```typescript
import {
  type MusicPosition, positionFromTicks, positionAt,
  initBeatClock, getCurrentBeat, getCurrentMeasure, getCurrentMeasurePrecise, getTickSeconds,
  subscribeToMeasure, scheduleRepeat, cancelSchedule, resetBeatClock,
} from '../engine/beatClock';
```

`AudioEngine.start()` is the only caller of `initBeatClock`, passing `Tone.getTransport()` before it starts the transport (see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md), the power-on order). This keeps `beatClock.ts` itself framework-agnostic and testable without Tone.

## Constants

| Name | Value |
|---|---|
| `BEATS_PER_MEASURE` | `4` (4/4 time) |

Measures count **music and the fleet's lifecycle** (battery, docking, pitch drift, the harmony palette) — never a day. The in-world day is wall-clock: a fixed `DAY_DURATION_MS` (6 real minutes, `src/constants/time.ts`) from each locale's own `dayStartTimestamp`, read through `computeLocaleHour`. Tempo cannot shorten or stretch it, and nothing here derives an hour.

## The music position

Every musical value (the measure, the melody step, the chord palette, the velocity and humanize roll, the swells' measure) is read from the transport through one type and two functions, so every reader shares one definition ([specs/ONE_MUSIC_CLOCK.md](specs/ONE_MUSIC_CLOCK.md) §4.1):

```typescript
/** Where a moment sits in the music, counted from the transport's tick 0. */
interface MusicPosition {
  sixteenth: number; // sixteenths since tick 0: the roll position for velocity and humanize
  measure: number;   // measures since tick 0, never wrapping
  step: number;      // 1..16, the melody step this sixteenth plays
}

positionFromTicks(ticks: number, ppq: number): MusicPosition  // pure
positionAt(time: number): MusicPosition | undefined           // undefined with no transport
```

- `positionFromTicks` rounds `ticks / (ppq / 4)` to the nearest sixteenth, so a tick count a hair either side of the grid (float error in `getTicksAtTime`; the proof run measured about 1e-11 ticks) reads as the sixteenth it is on. Then `measure = floor(sixteenth / 16)` and `step = (sixteenth % 16) + 1`. Any PPQ gives the same positions at the same musical points (Tone's is 192: a sixteenth is 48 ticks, a measure 768).
- `positionAt(time)` is `positionFromTicks(transport.getTicksAtTime(time), transport.PPQ)`. A reader passes **its own callback's `time`**, so no reader depends on another tick having run first on the same sixteenth.
- Rounding is safe because every repeat that reads a position fires on the grid: BeatClock's tick and the melody tick start at `0`, and `scheduleRepeat` below starts each repeat one interval in.
- Nothing reads `transport.position` (Tone's `"bars:quarters:sixteenths"` string) for a musical decision: it is where the transport has got to when the callback runs, not the callback's own time, and backlog 82 measured it reading past a bar's boundary from a tick still before it.

## API

```typescript
initBeatClock(transport: TransportLike): void
```
Idempotent — no-ops if already initialized. Registers one internal `'16n'` tick against `transport` with a start of `0`, so it fires on the sixteenth grid: from tick 0 if the transport has not started (AudioEngine registers it before starting the transport), else from the next sixteenth. Each tick reads `positionAt(time)` for its own callback time and sets:
- `currentBeat = sixteenth / 4` (float, 0-based)
- `currentMeasure = measure` (int, 0-based)

and fires every measure listener once per measure change, with the real, monotonic measure count — the same value `getCurrentMeasure()` returns. The change lands on the bar's own tick, never a sixteenth before or after it. It never wraps, so hold-until arithmetic (`dockingHoldUntilMeasure`) is safe at any session length. A listener that throws is caught and warned (`devWarn`); the others still run.

```typescript
getCurrentBeat(): number      // float, 0-based: the last tick that ran
getCurrentMeasure(): number   // int, 0-based: the last tick that ran
getCurrentMeasurePrecise(): number  // float, getCurrentBeat() / 4 — sub-measure resolution, still monotonic
getTickSeconds(time?: number): number | undefined  // one '16n' in seconds at the live tempo; undefined with no transport
subscribeToMeasure(callback: (measure: number) => void): () => void  // returns an UNSUBSCRIBE function — capture and call it on cleanup
scheduleRepeat(interval: string, callback: (time: number) => void): string  // returns an opaque schedule ID
cancelSchedule(scheduleId: string): void
resetBeatClock(): void
```

- `scheduleRepeat` forwards the time the Transport hands each tick: seconds on the audio clock, the moment the tick is *for*, which runs about `lookAhead` (100 ms) ahead of now. A consumer that reaches Tone places its writes at it: a param write (a ramp, a level) starts at `time` itself and glides one tick from there (`getTickSeconds`, below), and a note goes at `time + MIN_LEAD`. A Tone call made from inside the callback with no time lands "now" instead, up to `lookAhead` early, and Tone warns once per page ("Events scheduled inside of scheduled callbacks should use the passed in scheduling time"). The time is also what a consumer reads its position from (`positionAt(time)`). `subscribeToMeasure` hands only the measure, no time.
- The getters (`getCurrentBeat`, `getCurrentMeasure`, `getCurrentMeasurePrecise`) are the position of BeatClock's last tick. A callback that needs the position of *its own* moment (a note's step, measure or palette, a swell's measure) reads `positionAt(time)` instead: on a shared sixteenth the getters belong to whichever tick ran last.
- `scheduleRepeat` is safe to call before `initBeatClock` runs — it queues the request and registers it once a transport is available; the queued callback receives the time like any other. The interval is also passed as the tick's `startTime`, so the first firing happens after one full interval elapses, not at transport time zero.
- `getTickSeconds(time?)` is one tick's length: the transport's `toSeconds('16n')` (an optional member of `TransportLike`, which Tone's Transport has), so it follows the live tempo. A per-tick write glides over it into the next tick instead of stepping (`setOrGlide` and `rampOrSet` in `audioEngine/voiceEntry.ts`; [specs/SWELL_PHASE_PULSE_WIDTH_CUT.md](specs/SWELL_PHASE_PULSE_WIDTH_CUT.md) §8.2).
  - **Given a time,** the length is read once for that time and kept. Every write in one Transport callback carries that callback's time, so a tick reads the tempo once, and all its writes glide the same length. A tempo change reaches the next tick, which has a new time.
  - **With no time,** it is read live on every call.
  - It is `undefined` with no transport, a transport without `toSeconds`, or a length that is not finite and positive. A bad length is never kept. With no length, a timed write falls back as it did before the glide: `setOrGlide` to a point at `time`, and `rampOrSet` to its own `rampSeconds` from `time` (the headless and test path).
- There is no public one-shot helper (e.g. no `scheduleAtBeat`) — for one-shot beat-accurate callbacks, use the transport instance directly (`transport.scheduleOnce(...)`), obtained from wherever `AudioEngine` exposes it.
- `resetBeatClock()` clears the internal `'16n'` tick, clears every tracked schedule (`transport.clear` on each), clears **all** measure listeners, nulls the transport reference, and forgets the kept tick length. Called from `AudioEngine.killAll()` (its one caller is a replaced paused world's teardown, `tearDownPausedWorld` in `worldTransition.ts`). After a reset, `initBeatClock(transport)` must run again before any scheduling API is used, and every `subscribeToMeasure` caller must re-subscribe.
- No `pause`/`seek`/`start`/`stop` here — lifecycle is entirely owned by whatever transport was passed in.

## Usage

```typescript
// Recurring: the position and every Tone write from the tick's own time (src/systems/audioSwells.ts)
const scheduleId = scheduleRepeat('16n', (time) => {
  const at = positionAt(time);
  if (!at) return;
  tickAudioSwells(localeId, at.sixteenth / TICKS_PER_MEASURE, time); // the precise measure of this tick
});
cancelSchedule(scheduleId);

// Reading the last tick's position outside a transport callback
const measure = getCurrentMeasure(); // int, 0-based, never wraps
```

Day/night is **not** derived from the beat clock: the lighting helpers take the locale's wall-clock hour (`getLighting(hour)`, [BUILDING_DESIGN.md](BUILDING_DESIGN.md#daynight-cycle-lightness-curve)).

## Forbidden

- `setTimeout` / `setInterval` / `requestAnimationFrame` / `queueMicrotask` for anything music-timed — these drift from tempo and don't survive BPM changes.
- Reading `Transport.seconds` (or any fresh wall-clock read) inside a beat-based callback, or calling Tone from one with no time — use the `time` argument `scheduleRepeat` hands the callback (above). `AudioEngine.now() + MIN_LEAD` is for work that starts outside a Transport callback.
- Reading `transport.position` for a musical decision, or keeping a running count (a step counter, a stored palette) beside the clock — read `positionAt(time)`.
- Calling `AudioEngine.scheduleNote()` (or any audio scheduling) directly from a GSAP timeline callback — trigger a semantic handler instead; see [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md).
- Treating `BeatClock` as an importable object — it doesn't exist. Use the named exports above.

## Integration Notes

- **GSAP:** trigger timelines from a scheduled beat-clock callback (discrete events), or drive an existing timeline's `timeScale(currentBPM / baseBPM)` for tempo-synced continuous loops. Never the reverse (GSAP calling into audio).
- **AudioEngine's own playback tick** (the melody tick, `'16n'` from `0`, in `startMelodyPlayback`) is internal to `AudioEngine.ts`, not part of this module. It registers on the transport directly, reads `positionAt(time)` and hands the position to `processMelodyStep` — see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#playback-loop) for how the step reads `stepRegistry` and `paletteForMeasure` each tick.
