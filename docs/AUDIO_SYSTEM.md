# Audio System Guide

## Overview

This guide documents the current Trace Atlas audio architecture and the conventions enforced by the engine implementation in [src/engine/AudioEngine.ts](../src/engine/AudioEngine.ts). It focuses on the shared scheduling, timing, polyphony, and melody patterns used across the app.

**Related references:**
- [BeatClock Guide](BEAT_CLOCK.md) - Musical timing and scheduling
- [Harmony System Guide](HARMONY_SYSTEM.md) - Dynamic note palettes
- [Melody Generation Guide](MELODY_SYSTEM.md) - Procedural melody creation
- [LFO Modulation](#lfo-modulation) - Audio-rate parameter modulation for robot and global-chain targets (below, no separate file yet)
- [Audio Swells](#audio-swells) - Rare, self-reversing ramp events on one global or robot parameter at a time (below, no separate file yet) — independent of LFO Modulation, not an extension of it
- [BPM / Tempo](#bpm--tempo) - Locale-seeded transport tempo with a live Audio Rig override (below, no separate file yet) — distinct from `locale.settings.bpm`'s unrelated production-cadence use

## Core Audio Rules

The audio system is intentionally narrow: one shared `AudioEngine`, one transport-driven clock, and serializable robot descriptors.

- Initialize audio only from an explicit user gesture with `AudioEngine.start()`/`Tone.start()`.
- Treat the transport-backed BeatClock path as the authoritative clock for musical time; use `BeatClock` and `AudioEngine` for musical scheduling and avoid timers for music-aligned work.
- Use the shared `MIN_LEAD` (default `0.1s`) so notes are prepared ahead of playback.
- Keep voice creation, polyphony enforcement, and note scheduling inside `AudioEngine`; never create Tone objects in components or hooks.
- Keep only serializable data in Zustand state; store runtime-only objects such as voices, synth instances, and timelines outside state.
- Keep melodies index-based so harmony updates can change the pitch palette without regenerating the melody itself.

### Architecture snapshot

```
User Click Play
    ↓
AudioEngine.start()
    ↓
Tone.start() + Transport.start()
    ↓
┌─────────────────────────────────────┐
│         AudioEngine                 │
│  ┌──────────────────────────────┐  │
│  │  Composite Voices (MAX_POLYPHONY=16) │  │
│  │  - Per-robot isolated sub-bus│  │
│  │  - OscillatorLayer[] descriptor │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Scheduling System           │  │
│  │  - BeatClock/Transport ticks │  │
│  │  - MIN_LEAD lookahead        │  │
│  │  - Polyphony enforcement     │  │
│  └──────────────────────────────┘  │
│                                     │
│  ┌──────────────────────────────┐  │
│  │  Melody Registry             │  │
│  │  stepRegistry: Map<stepNumber, MelodyEventEntry[]> │  │
│  └──────────────────────────────┘  │
└─────────────────────────────────────┘
         ↓              ↓
    BeatClock      HarmonySystem
    (timing)       (note palettes)
```

### AudioEngine API

`AudioEngine` is a plain object (no class). The methods below are the full export surface — roughly half of these were previously undocumented.

```typescript
export const AudioEngine = {
  // Lifecycle
  start: async (): Promise<void>,       // idempotent — no-ops if already initialized
  stop: () => void,                     // stops transport, clears playback tick; does NOT reset position or beat clock
  killAll: () => void,                  // full reset: cancels transport, resets position/counters, calls resetBeatClock()
  pause: () => void,
  resume: () => void,
  setBPM: (bpm: number) => void,        // no-op if not initialized; instant transport.bpm.value assignment, deliberately not ramped — see "BPM / Tempo" below
  now: () => number,

  // Scheduling
  scheduleNote: (params: { robotId: string; note: string; duration: NoteDuration; time?: number; velocity?: number; accentMultiplier?: number }) => void,

  // Voice management
  reserveVoice: (robotId: string, descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] }, adsr: ADSREnvelope, phase?: number, detune?: number, pulseWidth?: number, masterVolume?: number) => boolean,
  releaseVoice: (robotId: string) => void,
  reReserveVoice: (robotId: string) => boolean,
  updateVoiceLayerParams: (robotId: string, layers: OscillatorLayer[]) => void,
  updateVoiceEnvelope: (robotId: string, adsr: ADSREnvelope) => void,
  createCompositeVoice: (descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] }, adsr: ADSREnvelope) => CompositeVoice,
  getVoiceForRobot: (robotId?: string) => CompositeVoice | null,

  // Melody registry
  registerRobotMelody: (robotId: string, melody: MelodyEvent[]) => void,  // `melody` is superseded by the fixed Click Track pattern while the robot's `clickTrackActive` is true — see MELODY_SYSTEM.md's Click Track note
  unregisterRobotMelody: (robotId: string) => void,
  getRegisteredMelody: (robotId: string) => MelodyEvent[],   // test helper
  processMelodyStep: (currentStep: number, time: number) => void, // test helper
  getPolyphonyStats: () => { voices: number; maxVoices: number; step: number },

  // Global FX control (all no-ops if the underlying Tone node wasn't constructed, e.g. headless tests)
  setMasterVolume: (volume: number) => void,   // clamped [0,1]
  getMasterVolume: () => number,
  setGlobalReverb: (params: Partial<ReverbSettings>) => void,
  setGlobalDelay: (params: Partial<DelaySettings>) => void,
  setGlobalFilterLPF: (params: Partial<FilterSettings>) => void,
  setGlobalFilterHPF: (params: Partial<FilterSettings>) => void,
  setGlobalEQ: (params: Partial<EQ3Settings>) => void,
  setGlobalCompressor: (params: Partial<CompressorSettings>) => void,
  setGlobalLimiter: (params: Partial<LimiterSettings>) => void,
}
```

Note: there is no rig-wide bypass or per-effect enabled/bypass toggle. Both were removed — every effect's "off" state is fully expressible through its own params (wet=0 for reverb/delay, a filter's own passthrough frequency, etc.), so a separate on/off flag was redundant. `GlobalAudioSettings` and its per-effect settings types carry no `enabled`/`globalBypass` fields.

Note: `note` is resolved to a validated pitch string (`/^[A-Ga-g][b#]{0,2}\d+$/`) before triggering — an invalid note is warned-and-skipped, not thrown.

### Key Guarantees

- **Singleton**: The exported `AudioEngine` object is the shared entry point for audio work in the app.
- **Polyphony Control**: The engine caps active voices at `MAX_POLYPHONY = 16` and skips additional notes when the cap is reached.
- **Lookahead**: Scheduling uses the shared `MIN_LEAD` constant (default `0.1s`) so notes are prepared ahead of playback time.
- **Idempotence**: `AudioEngine.start()` exits early once initialization has completed, so repeated calls do not duplicate setup.
- **Cleanup**: `AudioEngine.stop()` stops the transport and clears the playback tick; `AudioEngine.killAll()` performs the full reset by cancelling transport events, releasing voices, and resetting beat-clock state.

### Musical Time Authority

`beatClock.ts` does not wrap or proxy Tone.Transport — it has no Tone import at all. It polls `transport.position` off whatever transport-like instance `AudioEngine.start()` hands it via `initBeatClock(transport)`, and there is no `BeatClock` object to import; every function below is a **named export** from `beatClock.ts`. It serves as the single source of truth for musical time:
- All timing expressed in beats/measures, not seconds
- 1 beat = quarter note at current BPM
- 1 measure = 4 beats (4/4 time signature)
- 96 measures = 1 full day/night cycle

**Never use `setTimeout`, `setInterval`, `requestAnimationFrame`, or `queueMicrotask` for musical timing.**

**For complete BeatClock implementation details, see [BEAT_CLOCK.md](BEAT_CLOCK.md).**

## Harmony System

The Harmony System provides dynamic 8-note palettes that cycle sequentially through a fixed 12-entry set as the transport's measure count advances — each entry holds for `MEASURES_PER_PALETTE_ENTRY` (2) measures before advancing to the next, wrapping back to the first once it reaches the end. This allows robot melodies to adapt without regenerating the melody events themselves.

**Key concepts:**
- Robots store note **indices (0-7)**, not pitch strings
- The active palette index is derived fresh from the transport's measure position every tick (never accumulated), so a missed tick self-corrects rather than drifting
- Melody events remain immutable; only the palette changes
- Updates are driven by BeatClock/Transport rather than timers, via `beatClock.ts`'s own `scheduleRepeat`/`cancelSchedule` — no locally-owned transport handle

**For complete Harmony System implementation details, see [HARMONY_SYSTEM.md](HARMONY_SYSTEM.md).**

## Melody Generation

Melody generation creates unique, procedurally-generated patterns for each robot at spawn time using index-based notation (0-7) that automatically adapts to harmony changes.

**Key concepts:**
- 16-step grid (1-measure loop, 16th-note quantized)
- Weighted index distribution (lower indices more common)
- Syncopation control (on-beat vs. off-beat preference)
- Step registry for O(1) playback lookup
- Melodies generated once at spawn, immutable after

**For complete Melody Generation implementation details, see [MELODY_SYSTEM.md](MELODY_SYSTEM.md).**

## Polyphony Management

Polyphony management controls the maximum number of simultaneous audio voices to prevent audio distortion, CPU overload, and maintain musical clarity.

**Key principles:**
- Global polyphony ceiling — `MAX_POLYPHONY = 16` at Full; the Audio Load dial can lower the *live* ceiling (`setPolyphonyCap`, see [Audio Load Budget](#audio-load-budget))
- Per-robot isolated composite voice (each robot owns its own sub-bus)
- Fail-fast skipping when limit exceeded
- Transport-based voice release scheduling
- Centralized enforcement in AudioEngine

**Why it matters:**
- Prevents audio distortion and CPU spikes
- Maintains musical clarity
- Ensures stable performance across devices

**For complete implementation details, see [POLYPHONY_GUIDE.md](POLYPHONY_GUIDE.md).**

**Skipped Notes debug counter — removed.** A bottom-left, dev-only overlay (`SkippedNotesCounter.tsx`) once showed how many note triggers were rejected per measure, backed by a `useDebugStore` rolling history. Originally added to diagnose the voice-release stall bug (see [BPM_CONTROL.md](tasks/BPM_CONTROL.md)'s "Post-launch addition: Skipped Notes debug counter"), then removed entirely (2026-09-16, Crawford's own request) along with `debugStore.ts` — `triggerWithCap`, `startMelodyPlayback`, and `playRegisteredEvents` no longer count skip reasons at all.

## Audio Load Budget

One user-adjustable **Audio Load** dial (`audioStore.audioLoad`, 0–1; Light 0.2 / Standard 0.6 / Full 1) lowers audio cost, built for the phone-only clicking and dropouts in [todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md). Full is exactly today's behavior; everything is opt-down. Spec: [specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md); plan and deviations: [tasks/AUDIO_LOAD_BUDGET.md](tasks/AUDIO_LOAD_BUDGET.md); measurements: [PERFORMANCE.md](PERFORMANCE.md).

**The pure core** — `src/utils/audioBudget.ts` (constants only: no Tone, no stores, so `audioContextSetup` can use it before any Tone node exists). `loadToLimits(audioLoad)` maps the dial to `LoadLimits`: `maxAudibleRobots` (2..12) and `maxPolyphony` (6..16) interpolate linearly; `driftEnabled` switches on at `LOAD_DRIFT_MIN` (0.8), `filterLfosEnabled` at `LOAD_FILTER_LFOS_MIN` (0.4); `maxRobotLfos` runs `ROBOT_LFO_CAP_LIGHT` 4 → `ROBOT_LFO_CAP_STANDARD` 12 → a finite `ROBOT_LFO_CAP_CEILING` (120) just short of Full and `Infinity` only at exactly 1; `latencyHint` is `playback` below `LOAD_PLAYBACK_BELOW` (0.4). `reconcileSounding` decides which robots sound (below), `lfoAllowed` classifies an LFO, and `parseLoadParam` / `loadToSearchParam` / `withLoadParam` / `resolveInitialAudioLoad` / `detectCoarsePointer` handle `?load=` and phone detection (a coarse primary pointer defaults to Light).

**Which robots sound — first come, first served, solo excepted.** `audioBudgetSystem` (`src/systems/audioBudgetSystem.ts`, `startAudioBudget()` from `main.tsx`, before first power-on; not torn down by a power cycle) watches an `id:audioMode:docking` *signature* of the active locale's robots (not the robots — `updateRobot` rewrites the locale on every battery tick and swell write) plus `audioLoad` and the active-locale id. It keeps eligible robots (`isRobotAudible`) in **arrival order** (`orderByArrival`), runs `reconcileSounding`, and pushes only real changes to `AudioEngine.setSoundingRobots()` and `audioStore.soundingRobotIds`. Incumbents keep their slot; a freed slot goes to the earliest waiter; a lowered cap evicts newest first; a soloed robot is admitted at once by evicting the newest non-solo robot; an explicit unmute of a docked robot does not jump the queue. Over-budget robots **stand by** — silent, but they keep swimming, draining and recharging (`isRobotAudible` is unchanged; the cards read the third state through `getAudibilityState` / `isRobotSounding`).

**Why gating is at the note trigger only.** `triggerWithCap` returns `false` for a robot outside a non-null sounding set, after the mute/solo check and before the polyphony test, so a standing-by robot never consumes a slot. No voice is built, released or rebuilt, so there is no build spike and no click when a robot changes state (releasing voice chains for standing-by robots is a deferred "Phase B" — measured a weak lever on its own). The cap applies to *new triggers only*: lowering `setPolyphonyCap` below the notes already sounding never forcibly releases them, which could strand the voice counter. `setSoundingRobots(null)` and the `MAX_POLYPHONY` default mean the engine behaves exactly as before until something pushes; `killAll()` leaves both alone.

**LFO tiers — cut by cost, suspended never edited.** The system installs a policy on `lfoEngine.setLfoPolicy()` built from `lfoAllowed`: EQ-gain global LFOs always; filter-frequency/Q ones above 0.4; audio-rate robot LFOs up to the cap (`layerN.phase` LFOs poll at control rate and are never counted); `lfoEngine.setDriftEnabled()` switches drift ("stacked" LFOs) off below 0.8. `lfoEngine.reconcileLfos()` re-applies the policy to every *requested* LFO in two passes — suspend (robot LFOs newest-connected first) then connect (request order) — and a freed robot-LFO slot goes to the oldest held-off LFO at once. A tier only **suspends**: stored settings and drift amounts are never touched, an LFO at rate 0 is never held off, and an explicit disconnect withdraws the request. "Held off" (requested, rate > 0, not connected because of the dial) is published as `audioStore.heldOffLfoKeys` (instance keys such as `lpf.Q`, `robot-3:layer0.detune`) and `driftHeldOff` through `lfoEngine.subscribeHeldOff`, which notifies once per real change — so a robot LFO the user enables over the cap greys out immediately.

**Latency is a load-time decision.** A context's `latencyHint` is fixed at creation, so `audioContextSetup.ts` resolves it at page load: an explicit `?latency=` wins, otherwise the boot-time preset (`?load=`, or detection) — Light installs `playback`, Standard and Full leave Tone's default. Changing the dial live never touches the context. The chosen preset is mirrored into the address bar (`history.replaceState`, other params kept) so a reload keeps it.

**UI.** The Audio Load panel (`AudioLoadPanel.tsx`, Fleet Params → Transport & Composition, next to Tempo) is a preset radio and a 0–100 % slider over one stored number plus a `describeLimits` readout. Held-off LFO frames and the drift sliders grey out (controls disabled, stored values kept) with a "Held off by Audio Load" label (`HeldOffNote`), in the Audio Rig and in Robot Options; cards show "Standing by". The `?debug` overlay shows `audible n/12` and `load 20% · sounding 4/4 · standing by 2 · poly 3/8`.

## Layered / Composite Voices and Visual Mapping

Trace Atlas uses serializable audio descriptors at spawn time so visuals and audio can share the same data without constructing Tone objects during render. The canonical descriptor is now the robot's `audioAttributes.layers` array, and the compact visual mapping is stored in `audioAttributes.visualAudioMap`.

Key points:
- Each layer is an `OscillatorLayer` with `type` (a `WaveformType` — `'noise'` was removed in Roadmap Phase 9), `gain`, `detune`, `phase`, and optional `pulseWidth`. There is no separate `active` flag — `gain: 0` is how Coaxial/Harmonic are muted (Baseline always seeds a real, nonzero gain); see `filterAudibleLayers` below. There is no per-layer `adsr` field either — every layer shares the one envelope on `audioAttributes.adsr` (Roadmap Phase 9 collapsed Signature Array editing down to a single shared envelope per robot).
- Spawn-time logic in `src/systems/spawnSystem.ts` always generates exactly 3 layers (Baseline/Coaxial/Harmonic) and derives compact `shapeParams` for robot visuals directly from the one shared `adsr` — there's nothing left to average across layers.
- `AudioEngine.reserveVoice()` consumes those layers to create a runtime composite voice and route it through a per-robot sub-bus (panner → gain → filter → global chain entry, EQ3 — see Signal Graph below). Its own `filterAudibleLayers` excludes any layer with `gain === 0` from the composite voice it actually builds (no synth node created for it) — muting a layer doesn't discard its configuration, which stays in `Robot` state untouched. Note the exclusion only applies the next time the voice is actually rebuilt (a Type change, or `reReserveVoice` for any other reason) — dragging Gain itself to exactly 0 goes through the continuous, no-rebuild path (`applyLayersContinuous`/`updateVoiceLayerParams`), so it silences immediately via a live gain write on the still-built node, and only gets excluded from the graph on the next real rebuild. The bus's own gain node is seeded from the optional `masterVolume` parameter (default `1`) and stays live afterward via `AudioEngine.updateRobotMasterVolume(robotId, masterVolume)` — a continuously-updatable AudioParam, not a value baked into any note's own trigger, so a live Volume edit (Robot Options) affects an already-sounding note's tail too, not just the next one. `masterVolume` (0–1, UI displays it as 0–100%) is never applied to the bus gain directly — it's passed through `volumePositionToGain()` (`src/engine/audioEngine/volumeTaper.ts`) first, a perceptual/logarithmic taper (position mapped to a dB offset, then to linear gain over a 40dB range) rather than a linear pass-through. A linear mapping felt almost flat across most of the fader's travel, since human loudness perception is roughly logarithmic — real, shipped feedback caught post-launch.
- Composite voices expose `triggerAttackRelease`, `set`, and `dispose` semantics so scheduling code can use a single high-level API. The shared ADSR is applied at construction (`createCompositeVoice(descriptor, adsr)`, identically to every included layer) and can be updated live afterward via `AudioEngine.updateVoiceEnvelope(robotId, adsr)`, which reuses the same continuous-update `set({ layers })` path `updateVoiceLayerParams` uses for gain/detune/phase/pulseWidth edits — no audio gap.
- Because the mapping is stored on the robot as serializable data, visuals can be rendered in non-audio contexts without requiring Tone.js objects.

Recommended usage:
- At spawn: persist the generated `audioAttributes.layers` and the compact `audioAttributes.visualAudioMap` on the robot.
- At audio init: call `AudioEngine.reserveVoice(robotId, layers, adsr, phase, detune, pulseWidth, masterVolume)` to allocate an isolated composite voice. Reservation returns `false` only if voice creation fails; polyphony enforcement happens later when notes are triggered via `AudioEngine.scheduleNote()`.
- For a live Volume edit after reservation: call `AudioEngine.updateRobotMasterVolume(robotId, masterVolume)` rather than re-reserving — instant, affects anything currently sounding.
- For envelope edits after reservation: call `AudioEngine.updateVoiceEnvelope(robotId, adsr)` rather than re-reserving — instant, no audio gap.
- In components: prefer reading `audioAttributes.visualAudioMap` for visual properties; do not instantiate synths in components.

### Global volume vs. robot volume — two unrelated fields, one shared taper

`audioStore.volume` ([docs/specs/GLOBAL_VOLUME_CONTROL.md](specs/GLOBAL_VOLUME_CONTROL.md)) is **not** the same field as robot-level `masterVolume` above, despite both being called "volume" and both being passed through the same `volumePositionToGain()` taper. `audioStore.volume` (`[0, 1]`, default `1`, never persisted across sessions) is the master-output slider position shown next to the mute button in `TransportBar.tsx`, driving `AudioEngine.setMasterVolume()` — the final gain stage after the global FX chain, affecting every robot at once. Robot `masterVolume` is a per-robot bus gain, set independently per robot via Robot Options and `AudioEngine.updateRobotMasterVolume()`. The two are unrelated: changing one never affects the other, and there is no field that combines them — a robot's audible loudness is its own `masterVolume` attenuated a second time by the master `audioStore.volume` gain stage downstream.

`audioStore.setVolume(volume)` writes `volume` and calls `AudioEngine.setMasterVolume(volumePositionToGain(volume))`, always also clearing `isMuted` (dragging the slider while muted un-mutes as a side effect, jumping straight to the dragged-to level). `audioStore.setMuted(muted)` calls `AudioEngine.setMasterVolume(muted ? 0 : volumePositionToGain(volume))` without touching `volume` itself — mute and volume are fully independent controls; the mute icon reflects only `isMuted`, never slider position. `AudioEngine.setMasterVolume`/`getMasterVolume` themselves are unchanged by this feature — still a plain clamped-gain passthrough with no taper of their own; the taper is applied once, at the `audioStore` call site.

## Signal Graph

Two graphs compose: a **per-robot bus** (built per `reserveVoice` call) feeding a **global FX chain** (built once in `loadInstruments`, called from `start()`). The chain entry point is **EQ3**, first in both topologies below — every robot bus connects into whichever node `src/engine/audioEngine/globalFx.ts`'s `getGlobalChainEntry()` returns (`AudioEngine.reserveVoice()`'s only caller), not a hardcoded compressor reference.

```
Per robot:  composite.output → panner → busGain → busFilter → ─┐
Global:                                                        │
  EQ3 (chain entry) ←──────────────────────────────────────────┘
      → LPF → HPF → Delay → Reverb → Compressor → Limiter → masterGain → Destination   ("Natural Decay" — default)
      → LPF → HPF → Compressor → Delay → Reverb → Limiter → masterGain → Destination   ("Controlled Decay")
```

Two fixed topologies, not a general reorder mechanism — selected by one boolean, `audioStore`'s `globalAudio.compressorBeforeDelay` (default `false` = Natural Decay, not seeded, only a direct user action changes it — a two-option radio button rendered inside `AudioRigDrawer`'s Compressor accordion, under its other params, not a toggle in the master row). "Natural Decay" leaves Compressor after both time-based effects so their tails ring out uncompressed; "Controlled Decay" moves Compressor before both Delay and Reverb, tightening them. `globalFx.ts`'s `wireGlobalFxChain(controlledDecay: boolean)` disconnects every node and reconnects the full sequence for whichever topology — called once at build time and again whenever `audioStore`'s `setCompressorBeforeDelay(value)` action flips it (a brief audio glitch on switch is expected and acceptable, since the user is intentionally changing routing).

Control the global chain via `AudioEngine.setGlobal*` (see API above) for individual effect parameters — there is no separate bypass surface; `audioStore.setCompressorBeforeDelay` (not part of the `AudioEngine` surface — it calls `globalFx.ts` directly) for the topology swap.

## LFO Modulation

Audio-rate parameter modulation for both robot voices and the global FX chain, built across three files: `src/engine/lfoEngine.ts` (the primary-LFO registry and public `lfoEngine` object — everything in this section up through Seeding), `src/engine/lfoDrift.ts` (the Drift subsystem, its own subsection below), and `src/engine/lfoShared.ts` (small connection-safety helpers — `centeredSwingFromRange`, `connectAdditively`, `isAudioContextRunning`, `clamp` — used by both, extracted so neither file has to import the other's internals for them). LFOs are lazily instantiated per `(target, robotId?)` pair — nothing is constructed until a setter or `connectLfoTarget` first touches that pair — and every LFO's rate is a free-running Hz value; only `start()` is gated (on the AudioContext, not the Transport — see below), never the rate itself (`Tone.LFO.sync()` is deliberately never called — per its own doc comment it also ties frequency to the transport's BPM, which would violate that).

### Target ids

20 targets total, defined in `src/types/lfo.ts`, each traced to a reference grid:

- **`RobotLfoTargetId`** (13, from [ROBOT_DATA_GRID.md](reference/ROBOT_DATA_GRID.md)'s `Has LFO` column): `'volume'`, and `'layer{0,1,2}.{gain,detune,phase,pulseWidth}'`.
- **`GlobalLfoTargetId`** (7, from [GLOBAL_CHAIN_GRID.md](reference/GLOBAL_CHAIN_GRID.md)'s `LFO?` column): `'eq3.low'`, `'eq3.mid'`, `'eq3.high'`, `'lpf.frequency'`, `'lpf.Q'`, `'hpf.frequency'`, `'hpf.Q'`. Uses its own `'lpf'`/`'hpf'` short form, not `GlobalAudioSettings`' `filterLPF`/`filterHPF` field names. Neither Compressor, Reverb, Limiter, nor Delay's `delayTime` ever gets an LFO target — dynamics/tail processors don't get one in this app's pattern, and `delayTime`'s was removed post-shipping (LFO judged unwanted on Delay's own time parameter; `delayTime` itself still seeds/edits normally, an unrelated `GlobalAudioSeedFieldKey` concern).

`LfoSettings` is `{ shape: 'triangle' | 'sine' | 'square' | 'sawtooth'; rate: number; depth: number }` — rate `0–10 Hz`, depth `0–100%` (`LFO_RATE_MIN/MAX`, `LFO_DEPTH_MIN/MAX` in `types/lfo.ts`). There is no separate `active`/OSCILLATION STATE flag — it was removed; `rate: 0` is now the "off" state, driving `connectLfoTarget`/`disconnectLfoTarget` at the call sites below instead of a boolean.

### lfoEngine API

`lfoEngine` is a plain object (no class, matching `AudioEngine`'s own shape), exported from `src/engine/lfoEngine.ts`. Every function takes an optional `robotId?: string` — required in practice for robot-scoped targets (omitting it is a no-op/`false`, never a throw), irrelevant for global-chain targets.

```typescript
export const lfoEngine = {
  getLfoSettings: (target: RobotLfoTargetId | GlobalLfoTargetId, robotId?: string) => LfoSettings,
  setLfoRate: (target, hz: number, robotId?: string) => void,     // clamped to [0, 10] — 0 is the "off" value
  setLfoDepth: (target, percent: number, robotId?: string) => void, // clamped to [0, 100]
  setLfoShape: (target, shape: LfoShape, robotId?: string) => void,
  start: (target, robotId?: string) => void,  // no-ops unless a node already exists AND the AudioContext is running (not Transport state)
  stop: (target, robotId?: string) => void,   // always safe — idempotent if already stopped or never created
  connectLfoTarget: (target, robotId?: string) => boolean,
  disconnectLfoTarget: (target, robotId?: string) => void,
  // Audio Load Budget (see the section above): a policy decides what may connect; reconcile re-applies it.
  setLfoPolicy: (fn: ((target, robotId, connectedRobotLfos) => boolean) | null) => void,
  setDriftEnabled: (enabled: boolean) => void,
  reconcileLfos: () => void,
  getHeldOffLfoKeys: () => string[],
  subscribeHeldOff: (listener: () => void) => () => void,
}
```

- **`getLfoSettings`** never constructs a node. Falls back to `DEFAULT_LFO_SETTINGS[target]` (`src/data/lfoConfig.ts` — inert: `{ shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN }` for every target) until a setter has run for that instance.
- **`setLfoRate`/`setLfoDepth`/`setLfoShape`** lazily construct the underlying `Tone.LFO` on first call (via `new Tone.LFO(settings.rate)`), then update both the persisted `LfoSettings` and the live node — `depth` maps onto `Tone.LFO.amplitude` (a `0–1` normalRange Param; Tone.LFO has no `depth` property of its own).
- **Instance keying:** robot-scoped targets are keyed `` `${robotId}:${target}` ``, global-chain targets by the bare target id — so robot A and robot B each get their own independent `layer0.gain` LFO, never a shared one.
- **`connectLfoTarget` disables `Signal.override` before connecting — the actual root cause of the worst LFO bug found here.** Verified directly against Tone.js's own source (`signal/Signal.ts`'s `connectSignal()`): connecting *anything* to a `Tone.Signal` whose `override` flag is `true` — the class default, and every global-chain target (`Tone.Filter.frequency`/`Q`, `Tone.EQ3`'s bands) is a `Signal` — makes Tone immediately `cancelScheduledValues` + `setValueAtTime(0, 0)` on the destination and permanently mark it "overridden," **before the connected LFO has even started oscillating, and regardless of what `lfo.min`/`lfo.max` are set to.** For a filter's frequency Signal, that's a step change to an invalid `0` Hz cutoff the instant `.connect()` runs — every time, on a completely fresh session, independent of any timing — which can leave the filter's internal state corrupted well past when the LFO starts oscillating normally (matching the reported symptom exactly: an explosive burst, then the mix going silent until the chain is bypassed). This is a *structural* side effect of calling `.connect()` at all — none of `centeredSwingFromRange()`'s math, and no amount of waiting before activating, touches it. `connectLfoTarget` now sets `(signal).override = false` before calling `lfo.connect(signal)`, restoring plain additive Web Audio summing — the destination's own value survives the connection, and the LFO's scaled output genuinely adds on top of it, which is what the swing math below is actually built for. `Tone.Param` destinations (robot targets — `Tone.Gain.gain`) have no `override` escape hatch and still hit the same unconditional reset regardless, but — unlike `Signal` — `connectSignal()` never marks a `Param` as permanently "overridden" (that flag assignment is guarded by `destination instanceof Signal`, `Param` doesn't have the concept at all), so it isn't locked out from future writes the way an un-fixed `Signal` would be. `connectLfoTarget` reads the target's current value *before* connecting, and — right after `lfo.connect(signal)` — writes it straight back onto the (now-reset) destination, restoring the base value for both destination kinds through one mechanism: a harmless no-op for `Signal` (its value was never touched, `override` already prevented that), the actual fix for `Param`.
- **`connectLfoTarget`** resolves the live Signal via `AudioEngine.getRobotModulationTarget(robotId, target)` / `AudioEngine.getGlobalModulationTarget(target)`, then — critically — sets the LFO's `min`/`max` before calling `.connect()`. Once `override` is disabled (above), the connection is genuinely additive, so `min`/`max` are set to an **additive delta bounded by the target's CURRENT base value and its distance to the nearer edge of its own range** (`centeredSwingFromRange()`: `min(currentValue - rangeMin, rangeMax - currentValue)`, read off the resolved Signal's own `.value`), not the field's raw absolute range and not a fixed constant either. Two earlier, real, shipped bugs led here (both moot once `override` is disabled, but worth the history): (1) using the raw range directly — for a non-zero-centered field like LPF frequency (`20`–`20000`), that would add up to `+20000` Hz on top of whatever the slider is already at, pushing the actual cutoff past Nyquist; (2) a fixed zero-centered swing (half the field's total span) instead — better, but for a base value sitting off-center, a swing still that large could push the combined value below the field's own minimum for roughly half of every cycle. Bounding the swing by the base value's own position fixes both: `base ± swing` can never leave `[rangeMin, rangeMax]`, for any starting position. For a base value sitting exactly at the range's own midpoint (EQ dB bands, robot detune both default to `0`, the center of a symmetric range) this still yields the same "half the total span" swing. A third real, shipped bug of the same shape: `volume`'s declared range was originally `0–1`, matching the *slider's* 0–100% domain — but the Signal this target actually resolves to (the composite voice's own `output` Gain node, a fixed mix-stage node unrelated to `masterVolume`, always `1`) sits exactly on that range's own max edge, so `min(distanceToMin, distanceToMax)` was unconditionally `0` — the Volume LFO connected and took rate/depth/shape, but could never produce any audible swing, for any setting. Fixed by widening `volume`'s range to `0–2` (matching `gain`, the other field backed by an identical `Tone.Gain(1)` node), putting the resting value at the midpoint instead of the edge. Robot fields resolve from a small `ROBOT_LFO_FIELD_RANGE` table (gain `0–2`, detune `±50` cents, pulseWidth `0–1`, volume `0–2`); global targets reuse `GLOBAL_AUDIO_SEED_RANGES` (below), translating `lpf.`/`hpf.` target ids to that table's `filterLPF.`/`filterHPF.` keys.
- **`disconnectLfoTarget`** reverses `connectLfoTarget` — disconnects the live node, or cancels the phase-polling schedule (below). Safe to call on a target that was never connected.
- **`start` gates on the AudioContext, not the Transport.** A separate, real, shipped bug, found while chasing the one above: `connectLfoTarget()` and `start()` are two separate calls (`audioStore`'s `setGlobalLfo` calls them back to back) — connecting always succeeds once a live Signal resolves, but `start()` used to no-op unless `Tone.getTransport().state === 'started'`. `AudioEngine.start()`'s own sequence makes the AudioContext running (via `Tone.start()`) well before the Transport itself finishes starting — a window where an LFO could connect to a live target while `start()` silently refused to actually start the oscillator, leaving `Tone.LFO`'s raw, undepth-scaled "stopped" value (the waveform's value at its resting phase — not necessarily `0`, e.g. for square/sawtooth/triangle shapes) parked on the target indefinitely. Real and worth keeping fixed, but narrower in practice than the `override` bug above — gating on the AudioContext closes a genuine race, it just isn't what was reproducing on a fresh page load regardless of how long you waited first.

### Two Tone.js divergences (not every target is truly `.connect()`-able)

Both verified directly against Tone.js's own source/type declarations, not assumed from the reference grids:

1. **Phase has no live Signal at all.** `Tone.Oscillator.phase` is a plain get/set number, not a `Signal`/`Param`. `connectLfoTarget('layerN.phase', robotId)` instead starts a **manual-polling fallback**: `scheduleRepeat('16n', …)` (from `beatClock.ts` — Transport-driven, never a raw JS timer) recomputes a waveform value every tick from the target's current `LfoSettings` and reapplies it via `AudioEngine.updateVoiceLayerParams(robotId, [...])`. It modulates around a fixed `PHASE_CENTER_DEGREES = 180` (the midpoint of the 0–360° range `ROBOT_DATA_GRID.md` documents for Phase), not the layer's own live phase value — reading a robot's current `audioAttributes` from inside `lfoEngine.ts` would mean reaching into `useLocaleStore` directly, which stays `AudioEngine`/store territory. A deliberate Phase-0 engine-scope simplification.
2. **pulseWidth only has a Signal for `'pulse'`-type layers.** `Tone.PulseOscillator.width` is a real `Signal`, but `'square'` has no adjustable width in Tone.js at all — a structural limitation, not a bug. `AudioEngine.getRobotModulationTarget` already returns `null` for that case, so `connectLfoTarget` simply no-ops and returns `false`, never throws.

### Seeding

- **Robot-level `LfoSettings`** are generated once at spawn time in `src/systems/spawnSystem.ts`'s `generateRobotLfoSettings(noiseMap, offset)`, stored on `Robot.lfoSettings: Record<RobotLfoTargetId, LfoSettings>`, the same way the rest of a robot's `AudioAttributes` are generated — one `getSeededVal` call per field, dataIds dot-namespaced as `robot.lfo.<target>.<field>`. Each target also has a real ~50% chance (Roadmap Phase 9, `LFO_QUIET_THRESHOLD` coin flip) of forcing `rate` to `0` instead of its own sampled value, replacing the old separate `active` boolean — a freshly-spawned robot can have real modulation already audible on roughly half its targets before anything is touched, mirroring the global-chain precedent described below. When a robot's audio personality is copied (spawnSystem's ~30% copy chance), `lfoSettings` is copied wholesale from the source robot, not regenerated.
- **Global-chain effect *values*** (the parameters an LFO would modulate — EQ dB, filter Hz, etc., not the LFO settings themselves) are seed-generated per Attenuation Style in `src/utils/globalAudioSeed.ts`'s `generateGlobalAudioSettings(attenuationStyleId, attenuationStyleName)`, sampling the **Attenuation Style** noise map directly (a first — previously that map was only ever used to derive locale maps). Two ranges exist per field: `src/data/globalAudioSeedRanges.ts`'s `GLOBAL_AUDIO_SEED_RANGES` is the full/UI-matching range (what `resolveLfoOutputRange` above always uses, so an LFO can swing across a parameter's entire usable range); `src/data/globalAudioLoadingRanges.ts`'s `GLOBAL_AUDIO_LOADING_RANGES` is a narrower seed-sampling sub-range — what a fresh Attenuation Style is actually allowed to roll — and is what `sampleField()` samples against, never the wider table. Wired into `audioStore` automatically on Attenuation Style load/change via a `useAttenuationStyleStore.subscribe()` in `audioStore.ts` — no call site has to remember to re-seed. There is no per-effect `enabled` flag: every effect always seeds a real, audible value, except Delay's `wet`, which has a real ~25% chance (`DELAY_QUIET_THRESHOLD`, dataId `globalAudio.delay.quiet`) of forcing to `0` instead of its own sampled value — the sole global effect a fresh Attenuation Style can load silent. `audioStore`'s `regenerateGlobalAudioFromSeed` pushes every seeded value through `applyGlobalAudioToEngine()` (`audioStore.ts`) to `AudioEngine.setGlobal*` — but AS-sync runs at module load, before `AudioEngine.start()` has ever constructed a single FX node, so that push lands as a no-op every time (each setter no-ops on a null node). `buildGlobalFxChain()` then constructs every node from `globalFx.ts`'s own hardcoded literal defaults (Compressor threshold `-18`/ratio `6`, etc.) — not the seeded state sitting in the store — so without a second push, a session's actual starting sound would silently ignore its own seed. `AudioEngine.start()` closes this: right after `buildGlobalFxChain()`, and before LFO priming (below) so LFO swing math reads correct base values, it re-runs `applyGlobalAudioToEngine(globalAudio)` against the now-real nodes — the same fix shape as the LFO-priming split one paragraph down.
- **Global-chain `LfoSettings`** (shape/rate/depth) are seed-generated per Attenuation Style in `src/utils/globalAudioSeed.ts`'s `generateGlobalLfoSettings(attenuationStyleId, attenuationStyleName)`, sampling the same Attenuation Style noise map `generateGlobalAudioSettings` uses, dataIds dot-namespaced as `globalLfo.<target>.<field>`. Unlike `GLOBAL_AUDIO_SEED_RANGES`, every target shares one global rate/depth loading range (`LFO_RATE_LOADING_MIN/MAX` — 1–4 Hz, `LFO_DEPTH_LOADING_MIN/MAX` — 20–50%, both local to `globalAudioSeed.ts`) rather than a per-field table, since `GLOBAL_CHAIN_GRID.md`'s `LFO?` column is a flat flag, not per-field bounds. This loading range only narrows what a fresh seed rolls — the full/UI-facing range (`LFO_RATE_MIN/MAX`: 0–10 Hz, `LFO_DEPTH_MIN/MAX`: 0–100%, in `types/lfo.ts`) is unchanged and still what the Rate/Depth sliders (`Lfo.tsx`) and `lfoEngine.ts`'s `setLfoRate`/`setLfoDepth` clamp against; robot-level LFO seeding (`spawnSystem.ts`) has no equivalent split and keeps sampling the full range directly. `shape` gets the same loading-vs-full split applied to a discrete set: a fresh seed only ever rolls `triangle` or `sine` (`LFO_LOADING_SHAPES`, local to `globalAudioSeed.ts`) — the full 4-shape set (`LFO_SHAPES`: triangle/sine/square/sawtooth) is still what the Shape radio in `Lfo.tsx` offers, so square/sawtooth stay reachable by hand, just not as a starting state. Each target also has a real ~34% chance (`LFO_QUIET_THRESHOLD`) of forcing `rate` to `0` instead of its own sampled value — the same replaces-the-old-`active`-boolean pattern the robot-level precedent above uses, just at different odds (~66% chance of a nonzero, oscillating rate per target, chosen so a typical Attenuation Style seeds roughly 5 already-oscillating LFOs out of 7; the robot-level coin flip is an even 50/50, since nothing pins a specific bias there). Wired into `audioStore` via the same AS-sync subscription as `generateGlobalAudioSettings`, but deliberately **data-only** at that point (`regenerateGlobalLfoFromSeed` never calls `lfoEngine`) — AS-sync runs before any user gesture, and `lfoEngine`'s setters unconditionally construct a real `Tone.LFO` node on first use. `AudioEngine.start()` is what actually primes `lfoEngine` from this seeded state and connects+starts every target whose seeded rate is nonzero, since that's the one point guaranteed to run after `Tone.start()` has succeeded.

### Drift

Every LFO documented above repeats with mechanical, perfectly-periodic precision on its own — Drift is a second, independent modulation layer over the `frequency`/`amplitude` of any already-connected primary `Tone.LFO`, so sustained modulation reads as organic wander instead. There is no per-target drift state anywhere; a listener never dials an individual LFO's drift, only one of 4 shared **drift groups**' worth. This is the first drift design to reach this doc — an earlier single-shared-pool version (Roadmap 10.2) shipped but was never documented here before being restructured into groups (Roadmap 10.3); there is no prior description to reconcile against.

Everything in this subsection lives in `src/engine/lfoDrift.ts`, not `lfoEngine.ts` — a separable concern with a narrow interface (`attachDrift`/`detachDrift`/`refreshRateDriftGain`/`refreshDepthDriftGain`/`driftGroupForTarget`/`setGlobalRateDrift`/`setGlobalDepthDrift`) split out once the combined file grew across two feature phases. `lfoEngine.ts`'s `connectLfoTarget`/`disconnectLfoTarget`/`setLfoRate`/`setLfoDepth` call into it; nothing here reaches back into `lfoEngine.ts`'s own state — a `DriftLink` holds its primary `Tone.LFO` directly (set once, at `attachDrift` time) rather than looking it up by key, which is what keeps the dependency one-directional.

**The 4 drift groups** (`DriftGroupId`, `src/types/lfo.ts`): `'eq3' | 'filterLPF' | 'filterHPF' | 'robots'`. `driftGroupForTarget(target)` classifies every target into exactly one, by prefix for the three global-chain groups (`eq3.*` → `eq3`, `lpf.*` → `filterLPF`, `hpf.*` → `filterHPF` — the only three global targets that ever carry an LFO at all) and falling through to `'robots'` for every `RobotLfoTargetId`, regardless of field or which robot — robot fields have no "effect block" concept to split by further.

**One shared oscillator pool per group, not one pool overall and not one oscillator per primary.** Each group lazily constructs its own pool of secondary `Tone.LFO`s (`getOrCreateDriftPool(group)`) on that group's own first successful `connectLfoTarget` call — sized to that group's own real target ceiling, not a uniform constant:

| Group | Pool size | Why |
|---|---|---|
| `eq3` | 3 | Exactly 3 possible targets ever (`eq3.low`/`mid`/`high`) |
| `filterLPF` | 2 | Exactly 2 possible targets ever (`lpf.frequency`/`Q`) |
| `filterHPF` | 2 | Exactly 2 possible targets ever (`hpf.frequency`/`Q`) |
| `robots` | 8 | Dozens of possible simultaneously-active primaries across every robot/layer/field — one dedicated oscillator per primary would tax the audio thread for independence nobody can actually hear past a handful of distinct phases |

Each pool oscillator runs at a fixed `0.03`Hz (`DRIFT_RATE_HZ`, a ~33-second cycle, never exposed in the UI) with phase spread evenly across the group's own pool size (`360 / size` degrees apart) — fixed and deterministic, not seeded; only the drift *amount* is seeded (below). A primary picks its own group's bucket deterministically by hashing its instance key (`alea(key)()`, the same string-to-float primitive `getSeededVal.ts` uses), so the same target always lands on the same bucket within a session. Pools are constructed lazily and never disposed.

**Each primary gets its own rate-drift and depth-drift `Gain` pair** (`attachDrift(key, lfo, group)`), connecting its group's chosen pool oscillator through to the primary's own `frequency`/`amplitude` — reusing the identical `Signal.override`-disable-then-restore sequence documented above for primary-to-target connections (`Tone.LFO.frequency` is a `Signal`, `amplitude` is a `Param`; both are exposed to the same override/reset behavior regardless of which node is doing the connecting). The swing itself reuses `centeredSwingFromRange()` unchanged, bounded against `{LFO_RATE_MIN, LFO_RATE_MAX}` for rate and `{0, 1}` for depth — a primary parked at `LFO_RATE_MIN` gets zero rate-drift swing (no headroom below); one at the domain midpoint gets the full half-span.

**Depth Drift can never revive a silenced target.** A primary's own Depth at `0` is a deliberate "off," and the pool oscillator's output is bipolar — a connected-but-zeroed depth-drift Gain could still swing amplitude *up* on its own upswing half. `refreshDepthDriftGain(key)` guards against this by **disconnecting** the depth-drift Gain entirely whenever depth is `0` (not just zeroing it), reconnecting automatically — via the same override-safe sequence — the moment depth rises above `0`, immediately reflecting the group's current amount rather than a stale one. Rate has no equivalent "off" state (`LFO_RATE_MIN` is `0.1`, never `0`), so a primary's rate-drift Gain connects unconditionally and stays connected for its whole lifetime.

**Cross-group isolation.** Each group tracks its own `rateDrift`/`depthDrift` amount independently (`globalRateDriftByGroup`/`globalDepthDriftByGroup`, both `Record<DriftGroupId, number>`); a `DriftLink`'s `group` field (set once at `attachDrift` time, never reassigned) determines which amount its Gains read. Setting one group's amount only ever refreshes links belonging to that same group — EQ3's drift never leaks into the robots' drift, or any other pairing.

```typescript
setGlobalRateDrift: (group: DriftGroupId, value: number) => void,   // clamped to [-1, 1]
setGlobalDepthDrift: (group: DriftGroupId, value: number) => void,  // clamped to [-1, 1]
```

Both are exported on the same `lfoEngine` object documented above, alongside `connectLfoTarget`/`disconnectLfoTarget`, which both call `attachDrift`/`detachDrift` internally right after their own primary-to-target connection succeeds or is torn down — no other call site needs to know drift exists at all.

**Seeding.** `GlobalAudioSettings.lfoDrift` (`types/globalAudio.ts`) is `Record<DriftGroupId, { rateDrift: number; depthDrift: number }>` — 4 independent pairs, both fields `-1..1`, default `0`. `generateGlobalAudioSettings` (`globalAudioSeed.ts`) samples all 8 values independently per Attenuation Style via 8 dedicated `GlobalAudioSeedFieldKey` entries (`'lfoDrift.<group>.rateDrift'`/`'.depthDrift'` × 4 groups — a 3-level dotted path extending the same `effect.field` convention every other seeded field uses), each within a `-0.7..0.7` loading sub-window (`GLOBAL_AUDIO_LOADING_RANGES`) inside the full `-1..1` range — widened from an initial `-0.4..0.4` first-pass default (no `GLOBAL_CHAIN_GRID.md` row exists to source this from, since drift postdates that grid) after the shipped feature's own manual/audible check found the original window too subtle. `audioStore.ts`'s `applyGlobalAudioToEngine` pushes all 4 groups' values to `lfoEngine` in a loop over `DRIFT_GROUP_IDS`, reached the same two ways every other seeded field is: `regenerateGlobalAudioFromSeed` (Attenuation Style switch) and `AudioEngine.start()`'s own re-apply-after-real-nodes-exist step.

**UI.** `audioRigConfig.ts`'s `LFO_DRIFT_GROUPS: LfoDriftGroupSchema[]` holds one entry per group (accordion + `rateSchema`/`depthSchema`, both `sliderCenteredZero`, `-100..100`, unit `'%'`) — standalone, like `DECAY_MODE_SCHEMA`, since no `DriftGroupId` matches an `AudioRigEffectKey`. `AudioRigDrawer.tsx` maps over it as a sibling to its own `AUDIO_RIG_CONFIG.map(...)` block, converting the UI's `-100..100` percent to/from `lfoEngine`'s internal `-1..1` fraction at the wiring point via `audioStore.ts`'s group-aware `setGlobalLfoDrift(group, partial)`.

**`layerN.phase` targets stay excluded from drift.** No live `Signal`/`Param` exists for phase at all (see the manual-polling fallback above) — `connectLfoTarget`'s phase branch returns before any drift code runs, the same as for every other target this section documents.

### Dev-only audible check

`src/engine/lfoDebug.ts` exposes `window.__lfoDebug.audition()` / `.stop()`, gated by `if (DEV_TUNING && typeof window !== 'undefined')` — genuinely stripped from production builds (verified by grepping the built bundle, not just runtime-guarded). `audition()` connects+starts a robot's `layer0.detune` and the global `eq3.low` band with clearly audible rate/depth values, for manual confirmation from the browser console during development. Not real UI — imported once from `main.tsx` purely for its registration side effect, never referenced by any component or store.

## Audio Swells

**Does this app have an LFO on Delay's Mix?** No — but it has something else that moves it sometimes. Audio Swells is a wholly separate mechanism from LFO Modulation above: no `Tone.LFO`, no `Signal`/`Param` connection, no `Signal.override` concern at all. `delay.wet`/`reverb.wet` never gained a real `lfoEngine.ts` target and still haven't — Audio Swells is the "something else." A "swell" is a rare, discrete, self-reversing event: one parameter ramps up from its current value, then ramps back down, landing **exactly** back where it started — never a net change, and never a continuous oscillation. Built entirely in `src/systems/audioSwells.ts` (types in `src/types/audioSwell.ts`, the robot-only range table in `src/data/audioSwellRanges.ts`), mirroring `robotSystems.ts`'s `startRobotLifecycle`/`stopRobotLifecycle`/tick lifecycle shape rather than anything in `lfoEngine.ts`. Every write goes through the exact call a human editing that control by hand would make (`audioStore`'s `setGlobalAudio` for global targets, `robotOptionsActions.ts`'s `applyVolume`/`applyLayersContinuous`/`applyAdsr` for robot targets) — so the relevant slider visibly crawls on its own while a swell is active on it, for free, with no dedicated UI.

### Two independent pools

- **Global pool** (`SWELL_GLOBAL_TARGET_IDS`, `types/audioSwell.ts`) — 9 targets: the 7 `GlobalLfoTargetId`s (`eq3.low`/`mid`/`high`, `lpf.frequency`/`Q`, `hpf.frequency`/`Q`) plus `delay.wet` and `reverb.wet`, which carry no LFO target at all. Only `delay.wet`/`reverb.wet` have a real off-equivalent check (`isGlobalTargetAtOffEquivalent`, `audioSwells.ts`): `wet === 0` unambiguously means "no audible contribution," so a target sitting there is never eligible for a *new* swell, and if it drops to `0` while mid-swell, that swell is cancelled immediately and the param snaps back to its captured base value on the very next tick (`advanceGlobalSwell`). Every other target (EQ bands, filter frequency/Q) is always eligible — 0dB EQ and a wide-open filter passthrough frequency are common, legitimate resting positions, not "this effect is off" signals, so there's no equivalent gate for them.
- **Robot pool** (`SWELL_ROBOT_ATTRIBUTE_IDS`) — 17 attributes × the whole roster, never scoped to one robot: the 13 `RobotLfoTargetId`s (`volume`, each of the 3 layers' `gain`/`detune`/`phase`/`pulseWidth`) plus 4 new ADSR sub-fields (`adsr.attack`/`decay`/`sustain`/`release`), each independently eligible — never one atomic "envelope" move. **`layerN.phase` is swell-eligible here, unlike LFO/Drift** — a real divergence, not an oversight: a swell never `.connect()`s anything, it just calls `applyLayersContinuous` with a new plain number on a `BeatClock` tick, the same as `SignatureArrayDrawer.tsx`'s own Phase slider. A robot attribute is only pickable if its own field, and anything it structurally depends on, is actually live — `layerN.*` requires that layer's own gain to be nonzero (`isRobotAttributeStructurallyLive`, replacing the removed `OscillatorLayer.active` flag — this makes `layerN.gain` itself self-referential: a muted layer's own gain can never be picked back up by a swell, matching the old flag's same "manual intervention only" behavior); `volume` and the 4 ADSR fields have no such parent and are always eligible. Robot Ping Controls (`rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `octaveRange`) are never in the 17-attribute pool to begin with — nothing excludes them at selection time because there's nothing to exclude.

Each pool has its own independent 5-concurrent-swell cap (`MAX_CONCURRENT_SWELLS_PER_POOL`) — a full global pool never blocks a robot swell from starting, and vice versa. Compressor and Limiter are never eligible in either pool, the same dynamics-processor exclusion `lfoEngine.ts` already applies; Delay's `delayTime` stays excluded too (only `wet`/Mix is newly eligible).

### Direction, magnitude, and duration

Every swell-eligible attribute follows the same default rule, computed by `pickSwellPeakDelta` (used by the global pool and the robot pool's single-robot path) — a **new, from-scratch formula**, deliberately not `lfoShared.ts`'s `centeredSwingFromRange` (that one computes a *symmetric, bounded* swing with no directionality or minimum-swing guarantee, the wrong shape here):

- **Direction:** up if the current value is at or below the field's own midpoint, down if at or above it, a seeded coin-flip tie-break exactly at the midpoint.
- **Magnitude:** the peak is drawn somewhere between a 50%-of-range floor — relative to the *current value*, not the range's own midpoint (e.g. a field at 33% of its range swells up into `[83%, 100%]`) — and the true edge (min or max, matching direction).
- **Shape:** two phases only, rising then falling, computed in `advanceGlobalSwell`/`advanceRobotSwell` — no hold/plateau. Each tick's value is computed directly from `elapsed / totalPhaseMeasures` against the swell's own captured `baseValue`/`peakDelta`, never accumulated, and snapped to exactly `baseValue` once the swell's total duration elapses — the return-to-base is exact, not asymptotic.
- **Duration:** rising-phase and falling-phase measure counts are drawn **independently** (never mirrored) — `DEFAULT_SWELL_DURATION_RANGE` (3–6 measures) for every attribute except `delay.wet`/`reverb.wet`, which use the wider `MIX_SWELL_DURATION_RANGE` (6–12). 1 measure is a hard floor on any phase, for any attribute, full stop (`pickPhaseMeasures`'s own `Math.max(1, ...)`).

**Four attributes get their own exception**, each a pure clamp on the final peak or a swap of the magnitude formula — never a gate on direction-picking, so the up-vs-down choice itself is always the plain midpoint rule above:

| Attribute | Exception | Constant |
|---|---|---|
| Robot `volume` | A downward swell's peak is clamped so it never drops below 50% of Volume's own range | `VOLUME_SWELL_DOWNWARD_FLOOR` |
| Robot `layerN.detune` | The magnitude formula itself swaps out — capped to a **maximum** of 25% of detune's full range (±25 cents out of -50..50), the opposite shape from the default's "at least 50%" minimum | `DETUNE_SWELL_MAX_SWING_FRACTION` |
| `hpf.frequency` | An upward swell's peak is clamped so it never exceeds 4kHz | `HPF_SWELL_UPWARD_CEILING_HZ` |
| `lpf.frequency` | A downward swell's peak is clamped so it never drops below 100Hz | `LPF_SWELL_DOWNWARD_FLOOR_HZ` |

`clampVolumeDownward`/`clampGlobalPeak` apply the two clamp-shaped exceptions via two small shared helpers, `clampSwellFloor`/`clampSwellCeiling` — each guards against a currentValue that's already past the limit by collapsing to zero movement rather than flipping the swell's direction (e.g. an HPF already above 4kHz never gets pushed *down* by the ceiling clamp; it just doesn't move). Detune's exception is structurally different — not a clamp on `pickSwellPeakDelta`'s own output but an entirely separate magnitude function, `peakDeltaCappedByFraction`, selected by `robotPeakDeltaForDirection` (checked against every `layerN.detune` id via a shared pattern) instead of the default `peakDeltaForDirection` — direction still comes from the same `pickSwellDirection` helper both magnitude functions share.

`ROBOT_SWELL_FIELD_RANGE.volume` is `{0, 1}` (the store's real `masterVolume` fraction) — deliberately **not** `lfoEngine.ts`'s engine-internal `ROBOT_LFO_FIELD_RANGE.volume` (`{0, 2}`, the fixed `Tone.Gain(1)` mix-stage node's own operating range); reusing that table would silently bound a Volume swell against the wrong domain. `applyVolume`'s own parameter is the UI's 0-100 display percent, not this 0-1 fraction — `writeRobotValue` converts (`value * 100`) at the call site.

### Company-wide variant

A small chance turns a robot-pool pick into a **company-wide** swell instead of a single-robot one — the same attribute, moving in lock-step, across every eligible robot in one randomly-chosen `Company`. Not a separate pool, cadence, or cap: `maybeStartRobotSwell` draws a second seeded chance (`SWELL_COMPANY_CHANCE`) only after the robot pool's own trigger already succeeded, and only acts on it when the locale actually has a `Company` to pick — with zero companies, company-wide was never really on the table that tick regardless of the roll, so it falls straight through to the single-robot path (`startSingleRobotSwell`) instead of aborting.

`startCompanyWideSwell` picks one `Company` and one `SwellRobotAttributeId` via seeded draws (both unfiltered — eligibility is applied per-member next), filters `company.robotIds` down to members passing the same structural-eligibility check the single-robot path uses, and — if that leaves zero eligible members — starts no swell at all this tick: not a re-roll, not a fallback to a different company/attribute or to the single-robot path. Direction and the rising/falling measure counts are drawn **once** and shared lock-step across every member; magnitude stays per-robot, via `robotPeakDeltaForDirection` (the same dispatcher the single-robot path uses — the magnitude half of `pickSwellPeakDelta`/detune's capped variant, given an already-decided direction so a shared, externally-decided one can be reused instead of each member re-deriving its own from its own current value). Because duration is shared but each member's own distance-to-travel differs, a member with less room simply interpolates at a smaller total distance over the same shared window — no separate "rate" concept exists. A company-wide swell is one `ActiveSwell` object stored under one Map key per member (`robotSwellKey(robotId, attribute)`) and counts as **exactly one** swell against the robot pool's 5-cap, regardless of company size.

### Lifecycle and determinism

```typescript
startAudioSwells(localeId: string): void   // idempotent — schedules a 16n repeat via BeatClock's scheduleRepeat
stopAudioSwells(): void                    // idempotent — cancels the schedule AND clears every in-flight swell
tickAudioSwells(localeId: string, measure: number): void  // pure w.r.t. `measure` — testable without a real transport
```

Ticked at **16n resolution** (`scheduleRepeat('16n', ...)`, `getCurrentMeasurePrecise()`), not once per measure — a swell's ramp updates up to 16 times per measure, not in single steps at each measure boundary. `measure` inside `tickAudioSwells` may be fractional (sub-measure precision); `advanceActiveSwells` interpolates from it directly, so `elapsed / totalPhaseMeasures` is a smooth, continuously-advancing fraction rather than a coarse per-measure step. Trigger/selection stays gated to once per **whole** measure regardless — `tickAudioSwells` tracks the last whole measure (`Math.floor(measure)`) it already rolled `maybeStartGlobalSwell`/`maybeStartRobotSwell` for and skips re-rolling until a new one begins, since `SWELL_TRIGGER_CHANCE`/`SWELL_COMPANY_CHANCE` are documented as per-*measure* probabilities — re-rolling them 16x a measure would silently multiply the effective trigger rate.

Wired into `worldTransition.ts`'s `initializeLocale`, alongside the existing `stopRobotLifecycle()`/`startRobotLifecycle()` pair — `stopAudioSwells(); startAudioSwells(localeId);`, in that order, on every locale (re-)initialization. `stopAudioSwells`'s clear means no swell from a prior locale survives a locale switch or a power cycle (BeatClock silently drops every `scheduleRepeat` registration whenever `AudioEngine.killAll()` runs, same as the robot-lifecycle tick).

Runtime state (`activeSwells`, a plain `Map<string, ActiveSwell>`) lives at module scope in `audioSwells.ts`, never in Zustand — only each tick's resulting field value reaches the store, via the normal `apply*`/`setGlobalAudio` call, same as any other edit (CLAUDE.md: runtime-only state stays out of state). `getActiveSwellSnapshot(pool)` is a small read-only, deduplicated-by-object-identity accessor for tests/future debug UI; nothing else reads `activeSwells` directly.

**Master control — "Ping Variance Automation" slider.** `audioStore.pingVarianceAutomation`, a continuous `[0, 1]` fraction, replaces an earlier boolean `audioSwellsEnabled` toggle entirely (`docs/specs/PING-VARIANCE-AUTOMATION.md`) — not a new mechanism, a reshaping of this one master control. It lives at the bottom of the Audio Rig drawer as a bare `SliderLinear` (`PING_VARIANCE_AUTOMATION_SCHEMA`, `data/audioRigConfig.ts` — lore label "PING VARIANCE AUTOMATION", human label "Automatic Effects"), outside any accordion — a Rig-wide meta-setting, not a per-effect param — having moved out of the Sector Settings drawer, where the old toggle originally landed only because Audio Swells first shipped with "no new UI." The store's `[0, 1]` fraction displays as `[0, 100]%`, converting at the component boundary with the same `* 100` / `/ 100` pattern the Drift sliders already use.

Two behaviors, both gated on this one value:

- **Trigger gate.** `tickAudioSwells` reads `pingVarianceAutomation` once per tick and only calls `maybeStartGlobalSwell`/`maybeStartRobotSwell` when it's `> 0` — the same "gate, not a zero-magnitude swell" shape the old boolean had.
- **Magnitude scaling.** Every newly-created swell's `peakDelta` — global, single-robot, or per company member — is multiplied by the automation fraction via `scaleSwellPeakByAutomation`, as the literal *last* step of that swell's peak calculation, after direction is picked and after every attribute-specific clamp (`clampVolumeDownward`, the detune cap, the HPF/LPF ceilings). Safe by construction: multiplying an already-clamped delta by a fraction in `[0, 1]` only ever shrinks it toward the current value. Fixed at creation — moving the slider afterward never retroactively rescales an in-flight swell.

**0% is a full stop, not a zero-magnitude swell.** At exactly `0`, no new swell starts, and every swell still in its *rising* phase is forced into an early return — `maybeForceGlobalSwellReturn`/`maybeForceRobotSwellReturn`, called at the top of `advanceGlobalSwell`/`advanceRobotSwell` each tick, convert the swell in place (new `peakDelta` from its current live value, `risingMeasures` reset to `0`, `startMeasure` reset to now, `phase` flipped to `'falling'`) so it rides its own already-drawn `fallingMeasures` back to base through the *same* falling-phase interpolation formula every normal completion already uses — no new curve, no new snap-timing concept. No new `ActiveSwell`/`SwellMember` field was needed to mark "already forced": flipping `phase` to `'falling'` is itself sufficient, since the guard is `phase === 'rising'` — a swell already falling (naturally, or because it was forced on an earlier tick) is left untouched, and there is no code path that ever flips a `'falling'` swell back to `'rising'`, so a forced return always rides to completion even if the slider moves off `0` again before it finishes.

**Seeded once per session, then carried forward — not reseeded on every Attenuation Style switch.** Unlike `eq3.low`/`reverb.wet`/every other per-field seeded value in `globalAudio`, `pingVarianceAutomation` belongs with `compressorBeforeDelay` in the carry-forward group: `regenerateGlobalAudioFromSeed` seeds it via `generatePingVarianceAutomation` (`utils/globalAudioSeed.ts` — `getSeededVal` into `[0.33, 0.66]`, the same bounded/legible-default convention as `DELAY_QUIET_THRESHOLD`) only on its first-ever call, tracked by a `PING_VARIANCE_AUTOMATION_UNSEEDED` sentinel (`-1`, outside the real `[0, 1]` domain); every later call — any future Attenuation Style switch or retransmit — leaves the user's current value untouched. `setPingVarianceAutomation` is a plain state write with no `AudioEngine` call, same shape as the boolean it replaced — there's no live node to touch; `audioSwells.ts` simply reads the fraction fresh on its own next tick.

Every trigger/selection/timing/direction/magnitude decision is a `getSeededVal(noiseMap, dataId, offset, min, max)` draw against the **Attenuation Style** noise map (`getAttenuationStyleNoiseMap`) — `offset` is always the current *unwrapped whole* measure (`Math.floor(getCurrentMeasurePrecise())`, gated as above), never the `% 96`-wrapped value `subscribeToMeasure`'s own callback argument carries elsewhere in this codebase (the same trap `robotSystems.ts`'s `startRobotLifecycle` documents — a wrapped measure would replay an identical decision every 96 measures). `Math.random()` appears nowhere in `audioSwells.ts`. Two sessions on the same seed produce an identical swell timeline; a user's own manual edits are the only thing that can make two sessions diverge.

## BPM / Tempo

`audioStore.bpm` — the real `Tone.Transport` tempo, driving every beat-based schedule in the app — is a locale-seeded, live-adjustable value (docs/specs/BPM_CONTROL.md), not a hardcoded constant. This is unrelated to `locale.settings.bpm`, a separate field consumed only by `Factory.tsx`/`BubbleStream.tsx` for production-cadence/burst-interval math — the two happen to share a name and, coincidentally, the same default (`60`), but nothing else connects them; `locale.settings.bpm` is untouched by everything described in this section.

**Seeded per locale, on coordinate change only.** `generateLocaleBpm(localeId, x, y)` (`src/utils/localeBpmSeed.ts`) draws a `getSeededVal` sample against that locale's own noise map (`getLocaleNoiseMap` — coordinate-derived, no Attenuation Style dependency, same as every other locale-scoped seeded field) into `LOCALE_BPM_SEED_RANGE` (`[40, 100]`), rounded to the nearest integer. `audioStore.regenerateBpmFromSeed(localeId, coordinates)` draws this fresh value and pushes it through the existing `setBPM` action (state write + `AudioEngine.setBPM`). It's called from exactly two places in `worldTransition.ts` — `retransmitCoordsOnly` and `retransmitBoth`, both of which build a genuinely new `Locale` via `buildLocale` — plus once at `audioStore.ts` module load (`syncBpmToCurrentLocale()`) to seed the locale active at app boot. **`retransmitAttenuationStyleOnly` never reseeds BPM** — it re-parents the existing locale onto a new Attenuation Style without rebuilding it, so whatever BPM was already in effect (seeded or hand-dragged) survives untouched, exactly like every other robot/actor/edit on that preserved locale. This is a deliberate divergence from `globalAudio`'s own Attenuation-Style-keyed reseeding (a `useAttenuationStyleStore.subscribe` that fires on every `currentAttenuationStyleId` change) — a subscription shaped that way would have incorrectly reseeded BPM on an Attenuation-Style-only retransmit too, since that branch also changes `currentAttenuationStyleId` even though the locale itself is preserved. BPM's reseed is call-site-triggered instead, not subscription-driven, and the seeded value is never stored on the `Locale` object itself — `generateLocaleBpm` is a pure function, recomputed fresh at each of the three call sites, the same "don't cache on the domain object" shape `generateGlobalAudioSettings` already uses for `AttenuationStyle`.

**Live manual override.** The Audio Rig drawer's "Tempo" slider (`BPM_SCHEMA`, `src/data/audioRigConfig.ts` — `[20, 200]`, deliberately wider than the `[40, 100]` seed band on both ends, same "seed narrow, drag wide" convention `PING_VARIANCE_AUTOMATION_SCHEMA` established) binds directly to `audioStore.bpm`/`setBPM`, no unit conversion — unlike Ping Variance Automation's fraction-to-percent split, `bpm` is already stored in the same units the slider displays.

**Instant, not ramped.** `AudioEngine.setBPM` assigns `transport.bpm.value` directly — no `rampTo`. An earlier version ramped it (mirroring `updateRobotMasterVolume`'s `Tone.Gain` ramp), but BPM isn't a continuously-summed audio signal like Gain — an instant tempo change doesn't click, it only affects when future notes get scheduled. Ramping was actively harmful for the live case: the Tempo slider's `onChange` fires continuously during a drag (Radix's `onValueChange`, not `onValueCommit`), far more often than any short ramp could complete, so each call cancelled the previous still-in-flight ramp and restarted a new one — the tempo never settled for the whole drag gesture, audibly ("wishy-washy", no locatable downbeat). Reverted to the instant assignment every DAW uses for tempo changes.

## Note Resolution Pipeline

`scheduleNote(params)` does more than forward to the transport — four real behaviors run on every note, none previously documented:

1. **Velocity.** If `params.velocity` is omitted, velocity is derived via `computeNoteVelocitySeeded()`: it samples a per-locale seeded noise map plus a per-robot counter (mod 97, for a long non-repeating period) and, with probability `VELOCITY_VARIANCE_RATE` (0.15), applies a signed offset up to `± VELOCITY_VARIANCE_AMOUNT` (0.25) to a neutral baseline (`NOTE_VELOCITY_BASELINE`, `1`). Result is always clamped to `[VELOCITY_MIN, 1]` (floor `0.05`). This is deliberately independent of `robot.masterVolume` (Roadmap Phase 9) — overall robot loudness moved off per-note velocity entirely and onto each robot's own live bus gain (see `reserveVoice`'s `masterVolume` parameter and `updateRobotMasterVolume`, in "Layered / Composite Voices" above), so a live Volume edit affects an already-sounding note's tail too, not just the next note — something baking the value into per-note velocity could never do, since a struck note's velocity is fixed the instant it triggers.
2. **Motif-group accent.** If `params.accentMultiplier` is set, the velocity resolved in step 1 (or the caller-supplied `params.velocity`) is multiplied by it and clamped back to `[0, 1]`. `processMelodyStep` sets this to `GROUP_ACCENT_MULTIPLIER` (`1.25`) for exactly one event per motif-tiling repeat window — whichever of a robot's events has the earliest `startStep` within that window — computed once at `registerRobotMelody()` time (not per-tick) by grouping the melody's `startStep`s by `Math.floor((startStep - 1) / rhythmicMotifLength.value)`. Only applies when the robot's `rhythmicMotifLength.active` is `true`; scatter mode (`active: false`) has no repeat windows, so no event is ever accented. See [MELODY_SYSTEM.md](MELODY_SYSTEM.md) for the motif-tiling model this accents.
3. **`audioMode` policy** (read fresh from the store each call, not cached): `scheduleNote` itself applies only the `highlight` half — if any robot in the locale is `highlight`, non-highlighted robots have velocity multiplied by `0.5` (~-6dB). `mute`/`solo` enforcement (`mute` drops the note; if any robot is `solo`, every non-solo robot is suppressed) happens downstream in `triggerWithCap`, which every `scheduleNote` call funnels into — the sole enforcement point for mute/solo, not a backup check for a caller that bypasses `scheduleNote`.
4. **Panning.** Every reserved voice's pan is recomputed once per `16n` playback tick (not per note) via `calculatePanFromPosition(x) = (x / WORLD_WIDTH) - 0.5`, giving a range of `[-0.5, +0.5]` (intentionally narrower than full stereo width, to keep the mix centered). `x` comes from the robot's **live GSAP-animated transform** (`getRef('robot-' + robotId)`), falling back to the robot's stored `position.x` if the ref/transform isn't available.

## Scheduling Patterns

Audio scheduling in Trace Atlas is driven by the transport-backed BeatClock and AudioEngine for sample-accurate, musically-aligned timing.

**Core APIs:**
- `scheduleRepeat()` / `cancelSchedule()` — named exports from `beatClock.ts` (not a `BeatClock.` namespace) — app-facing recurring musical work
- `AudioEngine.scheduleNote()` - note playback entry point
- `Transport.scheduleOnce()` / `scheduleRepeat()` remain engine internals; app code should generally avoid calling them directly

**Lookahead:** Apply the shared `MIN_LEAD` scheduling lead so Web Audio can prepare synths before the attack; the implementation defaults to `0.1s` (100ms).

**Critical rule:** When a beat-based callback runs, use the callback time or `AudioEngine.now()` for scheduling. App code should normally stay on the `BeatClock`/`AudioEngine` path rather than reaching for `Tone.Transport` directly.

**Key patterns:**
- Use the step registry for O(1) melody lookups rather than iterating over robots each tick
- Keep playback state in AudioEngine and let the transport-driven beat clock drive the shared step scheduler
- Clear previous schedules before HMR re-registration
- Cancel beat-clock schedules with `cancelSchedule()` when they are no longer needed

## Common Patterns

The examples below show the current engine-facing patterns for scheduling, melody registration, and cleanup.

### Schedule a Note

```typescript
import { AudioEngine } from '../engine/AudioEngine';
import { scheduleRepeat, cancelSchedule } from '../engine/beatClock';
import { MIN_LEAD } from '../constants';

// Simple immediate trigger
AudioEngine.scheduleNote({
  robotId: 'robot-123',
  note: 'C4',
  duration: '4n',
  velocity: 0.6,
});

// App-facing recurring scheduling uses BeatClock rather than direct Tone.Transport calls.
const scheduleId = scheduleRepeat('4n', () => {
  AudioEngine.scheduleNote({
    robotId: 'robot-123',
    note: 'E4',
    duration: '8n',
    time: AudioEngine.now() + MIN_LEAD,
  });
});

// Later, when the schedule is no longer needed:
cancelSchedule(scheduleId);
```

### Register Robot Melody

```typescript
import { AudioEngine } from '../engine/AudioEngine';
import { generateMelodyForRobot } from '../engine/melodyGenerator';

function setupRobotAudio(robot: Robot): void {
  // Generate and register melody
  robot.melody = generateMelodyForRobot({
    onsetCount: 6,
    octaveMin: 2,
    octaveMax: 5,
    rhythmicDensity: 6,
    rhythmicMotifLength: 8,
    noteVariance: 2,
  });
  AudioEngine.registerRobotMelody(robot.id, robot.melody);
}

function cleanupRobotAudio(robotId: string): void {
  AudioEngine.unregisterRobotMelody(robotId);
}
```

// Spawn-time audio notes
// On spawn, unregister any previous melody entry for the robot, reserve a composite
// voice with the robot's layers/phase/detune values when available, and then register
// the melody with AudioEngine. If polyphony is full, the reservation is skipped but the
// robot remains registered for later playback.


### React Component Cleanup

```typescript
import { useEffect } from 'react';
import { AudioEngine } from '../engine/AudioEngine';

function AudioComponent({ robotId }: { robotId: string }) {
  useEffect(() => {
    // Setup
    const melody = generateMelodyForRobot({
      onsetCount: 6,
      octaveMin: 2,
      octaveMax: 5,
    });
    AudioEngine.registerRobotMelody(robotId, melody);
    
    // Cleanup
    return () => {
      AudioEngine.unregisterRobotMelody(robotId);
    };
  }, [robotId]);
  
  return null;
}
```

## Forbidden Patterns

The main anti-patterns to avoid are:

1. Creating synths or importing Tone directly outside `src/engine/`.
2. Using `setTimeout`/`setInterval`/`requestAnimationFrame` for music timing.
3. Triggering audio from GSAP timelines or React effects instead of semantic events.
4. Storing synth instances or other non-serializable audio objects in Zustand or component state.

When in doubt, route the behavior through `AudioEngine` and keep the data serializable.

## Audit Checklist

Before committing audio code:

- [ ] No `new Tone.` or `import * as Tone` outside `src/engine/`
- [ ] No timers are used for audio timing
- [ ] No synths or timelines are kept in state
- [ ] All scheduling uses BeatClock/Transport
- [ ] Melodies store indices, not pitch strings

## Lifecycle Summary

Each robot follows a compact lifecycle:

1. **Spawn**: persist `audioAttributes.layers` and `audioAttributes.visualAudioMap`, then reserve a composite voice for the robot.
2. **Register**: register the melody with `AudioEngine`.
3. **Update**: change layer parameters through `AudioEngine.updateVoiceLayerParams()` or `AudioEngine.reReserveVoice()`.
4. **Cleanup**: unregister the melody and release the voice when the robot is removed.

## Quick Troubleshooting

- If audio does not start, verify that `AudioEngine.start()` was triggered by a user gesture and that `Tone.context.state` is `'running'`.
- If notes drift, use the beat-based scheduler and pass the scheduled time or `AudioEngine.now() + MIN_LEAD` into `AudioEngine.scheduleNote()`.
- If playback becomes crackly, keep polyphony capped in `AudioEngine`; do not add ad hoc voice counters in components or utilities.
- If schedules multiply on hot reload, cancel them with `cancelSchedule()` before re-registering.

## Debug Tools

```typescript
import { getCurrentMeasure, getCurrentBeat, getCurrentHour } from '../engine/beatClock';

console.log('Transport state:', Tone.Transport.state);
console.log('BPM:', Tone.Transport.bpm.value);
console.log('Position:', Tone.Transport.position);
console.log('Polyphony:', AudioEngine.getPolyphonyStats());
console.log('Voice for robot:', AudioEngine.getVoiceForRobot(robotId));
console.log('Current measure:', getCurrentMeasure());
console.log('Current beat:', getCurrentBeat());
console.log('Current hour:', getCurrentHour());
```