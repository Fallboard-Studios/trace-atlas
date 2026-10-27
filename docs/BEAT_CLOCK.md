# BeatClock Specification

Source of truth: [`src/engine/beatClock.ts`](../src/engine/beatClock.ts).

**Related docs:** [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md) · [HARMONY_SYSTEM.md](HARMONY_SYSTEM.md) · [MELODY_SYSTEM.md](MELODY_SYSTEM.md)

## What It Is

`beatClock.ts` has **no Tone.js import** and exports **no `BeatClock` object** — it does not wrap or proxy `Tone.Transport`. It declares a minimal `TransportLike` interface and derives musical position by polling `transport.position` on whatever transport-like instance is handed to it. All API below is a **named function export**; there is no namespace to call methods on.

```typescript
import {
  initBeatClock, getCurrentBeat, getCurrentMeasure, getCurrentMeasurePrecise,
  subscribeToMeasure, scheduleRepeat, cancelSchedule, resetBeatClock,
} from '../engine/beatClock';
```

`AudioEngine.start()` is the only caller of `initBeatClock`, passing `Tone.getTransport()`. This keeps `beatClock.ts` itself framework-agnostic and testable without Tone.

## Constants

| Name | Value |
|---|---|
| `BEATS_PER_MEASURE` | `4` (4/4 time) |

Measures count **music and the fleet's lifecycle** (battery, docking, pitch drift, the harmony palette) — never a day. The in-world day is wall-clock: a fixed `DAY_DURATION_MS` (6 real minutes, `src/constants/time.ts`) from each locale's own `dayStartTimestamp`, read through `computeLocaleHour`. Tempo cannot shorten or stretch it, and nothing here derives an hour.

## API

```typescript
initBeatClock(transport: TransportLike): void
```
Idempotent — no-ops if already initialized. Registers one internal `'16n'` tick against `transport`. Each tick parses `transport.position` (a `"measure:beat:sixteenth"` string, via the exported `parseTransportPosition`) into:
- `currentBeat = measure * 4 + beat + sixteenths / 4` (float, 0-based)
- `currentMeasure = measure` (int, 0-based)

and fires every measure listener once per measure change, with the real, monotonic measure count — the same value `getCurrentMeasure()` returns. It never wraps, so hold-until arithmetic (`dockingHoldUntilMeasure`) is safe at any session length.

```typescript
getCurrentBeat(): number      // float, 0-based
getCurrentMeasure(): number   // int, 0-based
getCurrentMeasurePrecise(): number  // float, getCurrentBeat() / 4 — sub-measure resolution, still monotonic
subscribeToMeasure(callback: (measure: number) => void): () => void  // returns an UNSUBSCRIBE function — capture and call it on cleanup
scheduleRepeat(interval: string, callback: (time: number) => void): string  // returns an opaque schedule ID
cancelSchedule(scheduleId: string): void
resetBeatClock(): void
```

- `scheduleRepeat` forwards the time the Transport hands each tick: seconds on the audio clock, the moment the tick is *for*, which runs about `lookAhead` (100 ms) ahead of now. A consumer that reaches Tone places its writes at it: a param write (a ramp, a level) lands at `time` itself, a note at `time + MIN_LEAD`. A Tone call made from inside the callback with no time lands "now" instead, up to `lookAhead` early, and Tone warns once per page ("Events scheduled inside of scheduled callbacks should use the passed in scheduling time"). A consumer that makes no Tone call names it `_time` and says why (the harmony tick). `subscribeToMeasure` hands only the measure, no time.
- `scheduleRepeat` is safe to call before `initBeatClock` runs — it queues the request and registers it once a transport is available; the queued callback receives the time like any other. The interval is also passed as the tick's `startTime`, so the first firing happens after one full interval elapses, not at transport time zero.
- There is no public one-shot helper (e.g. no `scheduleAtBeat`) — for one-shot beat-accurate callbacks, use the transport instance directly (`transport.scheduleOnce(...)`), obtained from wherever `AudioEngine` exposes it.
- `resetBeatClock()` clears the internal `'16n'` tick, clears every tracked schedule (`transport.clear` on each), clears **all** measure listeners, and nulls the transport reference. Called from `AudioEngine.killAll()`, not from `AudioEngine.stop()`. After a reset, `initBeatClock(transport)` must run again before any scheduling API is used, and every `subscribeToMeasure` caller must re-subscribe.
- No `pause`/`seek`/`start`/`stop` here — lifecycle is entirely owned by whatever transport was passed in.

## Usage

```typescript
// Recurring, with the tick's time carried to every Tone write it makes (src/systems/audioSwells.ts)
const scheduleId = scheduleRepeat('16n', (time) => tickAudioSwells(localeId, getCurrentMeasurePrecise(), time));
cancelSchedule(scheduleId);

// Recurring, no Tone call, so the time goes unused (src/engine/harmonySystem.ts)
scheduleRepeat(`${MEASURES_PER_PALETTE_ENTRY}m`, (_time) => { /* pick the next palette entry */ });

// Reading position
const measure = getCurrentMeasure(); // int, 0-based, never wraps
```

Day/night is **not** derived from the beat clock: the lighting helpers take the locale's wall-clock hour (`getLighting(hour)`, [BUILDING_DESIGN.md](BUILDING_DESIGN.md#daynight-cycle-lightness-curve)).

## Forbidden

- `setTimeout` / `setInterval` / `requestAnimationFrame` / `queueMicrotask` for anything music-timed — these drift from tempo and don't survive BPM changes.
- Reading `Transport.seconds` (or any fresh wall-clock read) inside a beat-based callback, or calling Tone from one with no time — use the `time` argument `scheduleRepeat` hands the callback (above). `AudioEngine.now() + MIN_LEAD` is for work that starts outside a Transport callback.
- Calling `AudioEngine.scheduleNote()` (or any audio scheduling) directly from a GSAP timeline callback — trigger a semantic handler instead; see [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md).
- Treating `BeatClock` as an importable object — it doesn't exist. Use the named exports above.

## Integration Notes

- **GSAP:** trigger timelines from a scheduled beat-clock callback (discrete events), or drive an existing timeline's `timeScale(currentBPM / baseBPM)` for tempo-synced continuous loops. Never the reverse (GSAP calling into audio).
- **AudioEngine's own playback tick** (the `8n` step scheduler) is internal to `AudioEngine.ts`, not part of this module — see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#playback-loop) for how it consumes `getAvailableNotes()`/`stepRegistry` each tick.
