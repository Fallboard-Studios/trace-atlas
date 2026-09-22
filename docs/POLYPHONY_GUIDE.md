# Polyphony Management Specification

Source of truth: [`src/engine/AudioEngine.ts`](../src/engine/AudioEngine.ts).

**Related docs:** [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md) · [BEAT_CLOCK.md](BEAT_CLOCK.md)

## Current Behavior

- `MAX_POLYPHONY = 16` — a single global cap on simultaneously **triggered** notes. It is the **ceiling**: the *live* cap (`polyphonyCap`, default `MAX_POLYPHONY`) can be lowered by the Audio Load dial through `AudioEngine.setPolyphonyCap()` (6..16; 8 at Light, 12 at Standard) — see "Audio Load Budget" below.
- `activeVoices` — module-scoped counter tracking currently active note windows.
- `triggerWithCap()` returns `false` and skips the note when the cap is reached — notes are dropped, never steal an existing voice.
- Each robot gets its own **reserved composite voice** via `AudioEngine.reserveVoice()`. Reservation is **not** capped by `MAX_POLYPHONY` — a robot can hold a reserved voice indefinitely without ever triggering a note; only the act of triggering counts against the cap.
- `AudioEngine.releaseVoice()` disposes a robot's composite voice and bus nodes and removes it from the internal map.

## Core Rules

1. **Global cap**: one shared polyphony limit across all robots (`MAX_POLYPHONY`).
2. **Composite voices**: each robot has its own composite voice with dedicated bus nodes (`panner → gain → filter → master compressor/destination`) — there is no shared or pooled synth keyed by waveform type.
3. **Skip-based limiting**: when the cap is full, the note is rejected outright; no existing voice is stolen or reassigned.
4. **Transport-based release**: voice slots free up on a transport-relative schedule tied to the note's actual end time, not a wall-clock timer.
5. **Centralized enforcement**: all triggering and voice-lifecycle logic lives in `AudioEngine`.

## Trigger Path

`AudioEngine.scheduleNote()` resolves velocity and `audioMode` policy (see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md)'s Note Resolution Pipeline) before delegating to `triggerWithCap(params: NoteParams): boolean`, which:

1. Checks `audioMode` (mute / solo) — the sole enforcement point (`scheduleNote` only applies the `highlight` attenuation).
2. **Audio Load gate:** rejects a robot outside a non-null sounding set (`soundingRobots`, pushed by `audioBudgetSystem`) — it never triggers and never consumes a slot. Checked *before* the cap so a standing-by robot cannot use up polyphony the sounding ones need.
3. Rejects if `activeVoices >= polyphonyCap` (the live cap, default `MAX_POLYPHONY`).
4. Increments `activeVoices`.
5. Verifies the robot has a reserved composite voice — rejects (rolling back the counter) if not.
6. Validates the resolved note string against `/^[A-Ga-g][b#]{0,2}\d+$/` — rejects (rolling back) on an invalid note.
7. Applies the current pan value, triggers the composite voice, and schedules its release.

If any step after the increment fails, `activeVoices` is rolled back so the slot isn't left permanently occupied.

## Reservation Path

`AudioEngine.reserveVoice()` builds a composite voice and wires it into a per-robot bus: `panner → gain → filter → master compressor` (or straight to destination if no compressor exists). This keeps each robot's routing isolated while all robots still share the same global polyphony budget. Reservation is independent of the trigger-time cap — it only reports failure if voice construction itself throws (see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md) for the exact failure contract).

## Release Path

`AudioEngine.releaseVoice()` disposes the composite voice's internal synths/gains, disconnects and disposes the per-robot bus nodes, and removes the robot from the composite-voice map.

## Public APIs

```typescript
AudioEngine.scheduleNote({ robotId, note, duration, time, velocity }); // void — see Timing/Trigger Path
AudioEngine.reserveVoice(robotId, descriptor, phase, detune, pulseWidth); // boolean
AudioEngine.releaseVoice(robotId);
AudioEngine.reReserveVoice(robotId); // boolean
AudioEngine.getPolyphonyStats(); // { voices: number; maxVoices: number; step: number } — maxVoices is the LIVE cap
AudioEngine.getVoiceForRobot(robotId);
AudioEngine.setSoundingRobots(ids | null); // Audio Load: robots allowed to sound; null = no restriction (default)
AudioEngine.setPolyphonyCap(n);            // Audio Load: live ceiling, clamped to [0, MAX_POLYPHONY]; NaN -> MAX_POLYPHONY
```

## Audio Load Budget

Both inputs are **pushed in** by `audioBudgetSystem` — the engine never reads a store for them, which keeps the existing engine ↔ `audioStore` load-order constraint intact — and both default to "no restriction", so the engine behaves exactly as before until something pushes them (Full is a no-op). The set is copied on the way in; `killAll()` resets `activeVoices` but leaves the set and the cap in force, so a power cycle keeps the budget.

The cap applies to **new triggers only**. Lowering it below the notes already sounding blocks new notes without touching the counter — the counter drains as each scheduled release fires — because forcibly releasing counts could strand `activeVoices`, the failure mode the release-scheduling note above describes. Robots over the budget "stand by": gated at the trigger, they keep their reserved voice and registered melody. See [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget) for the whole feature.

## Timing

Voice release is **not** handled with `setTimeout`/`queueMicrotask`. `scheduleVoiceRelease` computes a transport-relative delay (`(scheduledTime - Tone.now()) + noteDurationSeconds + 0.04s` cleanup buffer) and schedules the counter decrement via `transport.scheduleOnce('+delay', ...)`. If transport scheduling itself throws, it falls back to an immediate decrement so the slot is never left permanently occupied.

## For Contributors

- Never create synths in components or hooks — all synth construction lives in `AudioEngine`.
- Never store synth instances or composite voices in Zustand or React state.
- Don't implement voice stealing — the engine is skip-based by design; only add stealing if a design explicitly calls for it.
- Release a robot's voice (`releaseVoice`) when it's removed, so the composite-voice map and its Tone nodes don't leak.

## Debugging

```typescript
console.log(AudioEngine.getPolyphonyStats()); // { voices, maxVoices, step }
console.log(AudioEngine.getVoiceForRobot(robotId));
```

## Integration: Melody Playback

`AudioEngine`'s internal playback tick (16 steps per measure — see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md)) calls `scheduleNote()` for every registered event at the current step. `scheduleNote` returns `void` — polyphony rejection is silent from the caller's perspective; `triggerWithCap`'s `boolean` result isn't surfaced there. To observe skip rate, poll `AudioEngine.getPolyphonyStats()` rather than expecting a per-call success/failure signal.

## Testing

See `src/engine/AudioEngine.test.ts` for real coverage (polyphony-cap rejection, voice reservation/release, `audioMode` enforcement). Example pattern using the real API:

```typescript
it('rejects notes once the cap is reached', () => {
  for (let i = 0; i < MAX_POLYPHONY; i++) {
    AudioEngine.reserveVoice(`r${i}`, layers);
    AudioEngine.scheduleNote({ robotId: `r${i}`, note: 'C4', duration: '4n' });
  }
  // Cap enforcement isn't directly observable via scheduleNote's return value (void);
  // assert via the stats snapshot instead.
  expect(AudioEngine.getPolyphonyStats().voices).toBeLessThanOrEqual(MAX_POLYPHONY);
});
```
