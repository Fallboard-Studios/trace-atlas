# Audio System Guide

## Overview

This guide documents the current Trace Atlas audio architecture and the conventions enforced by the engine implementation in [src/engine/AudioEngine.ts](../src/engine/AudioEngine.ts). It focuses on the shared scheduling, timing, polyphony, and melody patterns used across the app.

**Related references:**
- [BeatClock Guide](BEAT_CLOCK.md) - Musical timing and scheduling
- [Harmony System Guide](HARMONY_SYSTEM.md) - Dynamic note palettes
- [Melody Generation Guide](MELODY_SYSTEM.md) - Procedural melody creation
- [LFO Modulation](#lfo-modulation) - Audio-rate parameter modulation for robot and global-chain targets (below, no separate file yet)
- [Audio Swells](#audio-swells) - Rare, self-reversing ramp events on one global or robot parameter at a time (below, no separate file yet) — independent of LFO Modulation, not an extension of it
- [BPM / Tempo](#bpm--tempo) - Locale-seeded transport tempo with a live Audio Rig override (below, no separate file yet)

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
  reserveVoice: (robotId: string, descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] }, adsr: ADSREnvelope, phase?: number, detune?: number, pulseWidth?: number, masterVolume?: number, filterFreq?: number) => boolean,  // filterFreq = the robot's seeded bus low-pass cutoff (Hz); 0 = fully open; omitted = legacy fixed 1,200 Hz
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
  setGlobalReverb: (params: Partial<ReverbSettings>) => void,  // `wet` is immediate; `decay`/`preDelay` are coalesced (REVERB_IR_COALESCE_MS, 120 ms) and written only if changed, because each one makes Tone.Reverb re-render its impulse response
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
- Global polyphony ceiling — `MAX_POLYPHONY = 16` at Full; the Robot Load slider can lower the *live* ceiling (`setPolyphonyCap`, see [Audio Load Budget](#audio-load-budget))
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

**Update 2026-09-22:** shipped as **two independent sliders**, Robot Load (`audioStore.robotLoad`) and Effects Load (`audioStore.effectsLoad`), each 0–1 with the same Light 0.2 / Standard 0.6 / Full 1 anchors. Robot Load drives `maxAudibleRobots`, `maxPolyphony`, and the boot-time latency hint; Effects Load drives drift and filter LFOs (the robot-LFO cap this line once also named is gone — `docs/tasks/LFO_BANK.md` Task 2). The three preset buttons still set both sliders together to one value, reproducing the original single-dial behavior exactly; dragging either slider alone moves only its own axis. Everything below that still describes one axis's mechanics is unchanged in substance — it now runs twice, once per axis. Built for the phone-only clicking and dropouts in [todo/scratchy-audio-phones.md](todo/scratchy-audio-phones.md). Full (both sliders) is exactly today's original behavior; everything is opt-down. Spec: [specs/AUDIO_LOAD_BUDGET.md](specs/AUDIO_LOAD_BUDGET.md); plan and deviations: [tasks/AUDIO_LOAD_BUDGET.md](tasks/AUDIO_LOAD_BUDGET.md); measurements: [PERFORMANCE.md](PERFORMANCE.md).

**The pure core** — `src/utils/audioBudget.ts` (constants only: no Tone, no stores, so `audioContextSetup` can use it before any Tone node exists). `robotLoadToLimits(robotLoad)` maps the Robot Load slider to `RobotLoadLimits`: `maxAudibleRobots` (2..12) and `maxPolyphony` (6..16) interpolate linearly; `latencyHint` is `playback` below `LOAD_PLAYBACK_BELOW` (0.4). `effectsLoadToLimits(effectsLoad)` maps the Effects Load slider to `EffectsLoadLimits`, exactly two fields: `driftEnabled` (`LOAD_DRIFT_MIN`, 0.8) and `filterLfosEnabled` (`LOAD_FILTER_LFOS_MIN`, 0.4) — there is no `maxRobotLfos`/robot-LFO cap at all (`docs/tasks/LFO_BANK.md` Task 2 removed it; a robot link's cost no longer scales with count, so nothing left to cap). `loadToLimits(x)` merges both at the same `x` — the combined `LoadLimits` shape `describeLimits` and the diagnostics HUD read. `reconcileSounding` decides which robots sound (below); the LFO Bank's own `lfoEngine.setFilterLinksEnabled`/`setDriftEnabled` (next section) read `filterLfosEnabled`/`driftEnabled` directly rather than through an `audioBudget.ts` classifier — `lfoAllowed` left this file with the cap it existed to serve. `parseLoadParam` / `loadToSearchParam` / `withLoadParam` (a `withParam` wrapper) / `resolveInitialAudioLoad` / `resolveInitialEffectsLoad` / `detectCoarsePointer` handle `?load=` / `?fxLoad=` and phone detection (a coarse primary pointer defaults both to Light).

**Which robots sound — first come, first served, solo excepted.** `audioBudgetSystem` (`src/systems/audioBudgetSystem.ts`, `startAudioBudget()` from `main.tsx`, before first power-on; not torn down by a power cycle) watches an `id:audioMode:docking` *signature* of the active locale's robots (not the robots — `updateRobot` rewrites the locale on every battery tick and swell write) plus `robotLoad` and the active-locale id (`effectsLoad` changes don't affect admission). It keeps eligible robots (`isRobotAudible`) in **arrival order** (`orderByArrival`), runs `reconcileSounding`, and pushes only real changes to `AudioEngine.setSoundingRobots()` and `audioStore.soundingRobotIds`. Incumbents keep their slot; a freed slot goes to the earliest waiter; a lowered cap evicts newest first; a soloed robot is admitted at once by evicting the newest non-solo robot; an explicit unmute of a docked robot does not jump the queue. Over-budget robots **stand by** — silent, but they keep swimming, draining and recharging (`isRobotAudible` is unchanged; the cards read the third state through `getAudibilityState` / `isRobotSounding`).

**Why gating is at the note trigger only.** `triggerWithCap` returns `false` for a robot outside a non-null sounding set, after the mute/solo check and before the polyphony test, so a standing-by robot never consumes a slot. No voice is built, released or rebuilt, so there is no build spike and no click when a robot changes state (releasing voice chains for standing-by robots is a deferred "Phase B" — measured a weak lever on its own). The cap applies to *new triggers only*: lowering `setPolyphonyCap` below the notes already sounding never forcibly releases them, which could strand the voice counter. `setSoundingRobots(null)` and the `MAX_POLYPHONY` default mean the engine behaves exactly as before until something pushes; `killAll()` leaves both alone.

**LFO tiers — two dial-driven flags, no per-robot cap.** There is no robot-LFO cap and no per-LFO suspend/connect policy — every seeded or user-made robot link primes unconditionally (`docs/tasks/LFO_BANK.md` Task 2 removed `ROBOT_LFO_CAP_*`/`maxRobotLfos` outright once the LFO Bank made a robot link's own cost a fixed, lane-amortized one rather than one-oscillator-per-target). What the dial still gates are the bank's own two flags: `lfoEngine.setFilterLinksEnabled(enabled)` suspends (disconnects, keeping the link record) every `lpf.*`/`hpf.*` link's Gain below `LOAD_FILTER_LFOS_MIN` (0.4) — EQ-gain links are never affected — and `lfoEngine.setDriftEnabled(enabled)` detaches every lane's rate-/depth-drift Gains below `LOAD_DRIFT_MIN` (0.8); neither reacts to Robot Load. Both are idempotent and reversible: suspending never touches a link's stored lane/depth or a lane's drift amount, only whether its Gain is currently wired into the graph, so restoring is immediate and exact. `audioStore.filterLinksHeldOff` (filter links) and `audioStore.driftHeldOff` (the four lanes' drift rows) are the two booleans the UI greys controls against — set by `audioBudgetSystem.applyLfoTiers` alongside the engine calls, not derived from engine state, so a panel can grey out before or after the audio actually changes without an extra subscription.

**Latency is a load-time decision.** A context's `latencyHint` is fixed at creation, so `audioContextSetup.ts` resolves it at page load: an explicit `?latency=` wins, otherwise the boot-time Robot Load preset (`?load=`, or detection) — Light installs `playback`, Standard and Full leave Tone's default. Changing either slider live never touches the context. Both sliders are mirrored into the address bar independently (`history.replaceState`, other params kept) — `?load=` for Robot Load, `?fxLoad=` for Effects Load, each omitted while at its own default — so a reload keeps them.

**UI.** The Audio Load panel (`AudioLoadPanel.tsx`, Fleet Params → Transport & Composition, next to Tempo) is one preset radio plus two 0–100 % sliders (Robot Load, Effects Load) over the two stored numbers, plus a `describeLimits` readout of their merged limits. The Audio Rig's LPF/HPF `LfoLink` pickers grey out (controls disabled, stored lane/depth kept) with a "Held off by Audio Load" label (`HeldOffNote`) while `filterLinksHeldOff` is true — EQ's own links and every robot link are never held off, since there's no cap left to enforce on them; Fleet Params → LFO Bank's four Rate Drift / Depth Drift rows grey out the same way while `driftHeldOff` is true (Shape/Rate never grey). Cards show "Standing by" for the robot-admission budget above, unrelated to any LFO state. The `?debug` overlay shows `audible n/12` and `load 20%·fx 100% · sounding 4/4 · standing by 2 · poly 3/8`, plus a `bank n/4   links n/n` line for the LFO Bank (see LFO Modulation below).

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

The per-robot `panner` is refreshed once per 16th-note tick from the robot's live GSAP x (`updateAllPanners`), but the pan is only *written* when it has changed by more than `PAN_WRITE_EPSILON` since the last write — Tone's `Param.value` setter is `cancelScheduledValues` + `setValueAtTime`, and robots are stationary most of the time. `busFilter` is a Q 1 low-pass whose cutoff is the robot's own seeded `audioAttributes.filterFreq` (400–2500 Hz, `spawnSystem`'s `FILTER_FREQ_RANGE`), passed into `reserveVoice` by every reservation path (spawn, `reRegisterAllRobotsAudio`, `reReserveVoice`, the post-load pass). This is the audible half of ROBOT_DESIGN's visual↔audio mapping: the same number drives body detail and greeble count. From the composite-voice rewrite until 2026-09-30 the cutoff was hardcoded to 1,200 Hz and `filterFreq` had no audible effect at all; a caller that omits it still gets that legacy value. `0` means "no filter" (opened to 20 kHz). Set once at reservation — there is no live update path or UI control for it yet.

## LFO Modulation — the LFO Bank

**Four shared, world-level, app-lifetime LFOs ("lanes") replace one private `Tone.LFO` per modulation target** (`docs/specs/LFO_BANK.md`, `docs/tasks/LFO_BANK.md`; shipped 2026-10-01, superseding everything the prior per-target design — including the old 2-group Drift pools — documented in this section). A target no longer owns an oscillator; it *links* to a lane and stores a depth. Built across two files: `src/engine/lfoEngine.ts` (the bank engine — lanes, links, and the Audio Load Budget's two LFO flags; renamed from `lfoBank.ts` once the old per-target `lfoEngine.ts`/`lfoDrift.ts`/`src/systems/robotLfoPriming.ts` were deleted outright) and `src/engine/lfoShared.ts` (unchanged connection-safety helpers — `centeredSwingFromRange`, `connectAdditively`, `isAudioContextRunning`, `clamp`).

### Target ids

13 targets total, defined in `src/types/lfo.ts`, each traced to a reference grid:

- **`RobotLfoTargetId`** (6, from [ROBOT_DATA_GRID.md](reference/ROBOT_DATA_GRID.md)'s `Has LFO` column): `'layer{0,1,2}.{gain,detune}'`. Was 13 at launch, then 9 (`docs/specs/LFO_LOAD_FIX.md` cut `volume` and every `layerN.pulseWidth`), then 6 (`docs/tasks/LFO_BANK.md` Task 1 cut every `layerN.phase` — Phase never had a live Signal to modulate; see below). Every removed id can still arrive from an old session/share link; the loaders drop it and the engine resolves it to nothing.
- **`GlobalLfoTargetId`** (7, from [GLOBAL_CHAIN_GRID.md](reference/GLOBAL_CHAIN_GRID.md)'s `LFO?` column, unchanged by the Bank): `'eq3.low'`, `'eq3.mid'`, `'eq3.high'`, `'lpf.frequency'`, `'lpf.Q'`, `'hpf.frequency'`, `'hpf.Q'`. Uses its own `'lpf'`/`'hpf'` short form, not `GlobalAudioSettings`' `filterLPF`/`filterHPF` field names. Neither Compressor, Reverb, Limiter, nor Delay's `delayTime` ever gets one.

`LfoLink` is `{ lane: LfoLaneId | null; depth: number }` — `lane: null` means not in the graph at all; `depth` is `0–100%` (`LFO_DEPTH_MIN/MAX`). This is what every target now stores, replacing the old per-target `LfoSettings` (`{ shape, rate, depth }`) entirely — shape and rate moved to the lane (below).

### The bank: 4 lanes, each an always-running LFO

`LfoLaneId` is `'a' | 'b' | 'c' | 'd'` (`LFO_LANE_IDS`) — order-carrying (the seed leans `a > b > c > d`, see Seeding); user-facing names (Core/Companion/Accent/Overtone LFO) live in `src/content/` (`ui.lfoLane`, `fleet.lfoBank.laneA`–`.laneD`), never in engine code. `BankLfoSettings` is `{ shape, rate, rateDrift, depthDrift }` — `rate` is `LFO_RATE_MIN..LFO_RATE_MAX` (`0–20` Hz; `0` is a legal user value, the lane just holds still — the seed never emits it), `rateDrift`/`depthDrift` are `-1..1`.

Built once per lane by `primeLfoBank(settings)`, called from `AudioEngine.start()` (below) — never rebuilt or disposed for the app's lifetime, and a no-op before the AudioContext is running or on any call after the first successful one. Per lane:

```
lane LFO (±1, amplitude pinned to 1) → trunk Gain (rests at 1) → one link Gain per linked target → connectAdditively(signal)
                                              ↑ depth-drift Gain
drift secondary LFO (0.03 Hz, fixed phase spread) → rate-drift Gain → lane LFO's own frequency
```

The lane oscillator's own amplitude never moves — depth lives entirely in each link's own Gain (`clamp(depth, 0, 100) / 100 × swing.max`, `swing` from `centeredSwingFromRange` against the target's current value, same formula and bug history as the old per-target design below). A lane's **drift** secondary (fixed `0.03`Hz, phase spread `360 / 4` degrees apart across the 4 lanes, never exposed in the UI — only the drift *amount* is) feeds two Gains: rate-drift back into the lane LFO's own `frequency` Signal, depth-drift into the **trunk's** gain (not the lane LFO's amplitude, which is pinned) — wobbling the lane's own shared amplitude wobbles every link hanging off it together, by design (`docs/specs/LFO_BANK.md` assumption 4). `refreshLaneDrift(lane)` recomputes both Gains' values from the lane's current rate/drift amounts after every `setBankRate`/`setBankRateDrift`/`setBankDepthDrift` call and after `primeLfoBank`.

### lfoEngine API

`lfoEngine`, exported from `src/engine/lfoEngine.ts`, is a plain object (no class, matching `AudioEngine`'s own shape):

```typescript
export const lfoEngine = {
  // Bank
  primeLfoBank: (settings: Record<LfoLaneId, BankLfoSettings>) => void,
  setBankShape: (lane: LfoLaneId, shape: LfoShape) => void,
  setBankRate: (lane: LfoLaneId, hz: number) => void,              // clamped to [0, 20]
  setBankRateDrift: (lane: LfoLaneId, value: number) => void,      // clamped to [-1, 1]
  setBankDepthDrift: (lane: LfoLaneId, value: number) => void,     // clamped to [-1, 1]
  getBankSettings: (lane: LfoLaneId) => BankLfoSettings,
  // Links
  linkTarget: (target: LfoTargetId, link: LfoLink, robotId?: string) => boolean,
  unlinkTarget: (target: LfoTargetId, robotId?: string) => void,
  disposeRobotLinks: (robotId: string) => void,
  // Audio Load Budget (see the section above) — suspend/restore, never edit stored state
  setDriftEnabled: (enabled: boolean) => void,
  setFilterLinksEnabled: (enabled: boolean) => void,
}
```

- **`getBankSettings`** never constructs a node — falls back to `DEFAULT_BANK_LFO` (`{ shape: 'sine', rate: 0, rateDrift: 0, depthDrift: 0 }`, `src/data/lfoConfig.ts`) until `primeLfoBank` has run.
- **`linkTarget` disables `Signal.override` before connecting — the actual root cause of the worst LFO bug found in this system, unchanged by the Bank rewrite.** Verified directly against Tone.js's own source (`signal/Signal.ts`'s `connectSignal()`): connecting *anything* to a `Tone.Signal` whose `override` flag is `true` — the class default, and every global-chain target (`Tone.Filter.frequency`/`Q`, `Tone.EQ3`'s bands) is a `Signal` — makes Tone immediately `cancelScheduledValues` + `setValueAtTime(0, 0)` on the destination and permanently mark it "overridden," **before the connected LFO has even started oscillating, and regardless of what `min`/`max` are set to.** For a filter's frequency Signal, that's a step change to an invalid `0` Hz cutoff the instant `.connect()` runs — every time, independent of any timing. `src/engine/lfoShared.ts`'s `connectAdditively(source, destination)` is the fix, shared by every connection this module makes (lane → trunk, drift → lane/trunk, trunk → link Gain, link Gain → target Signal/Param): it sets `override = false`, connects, then writes the destination's pre-connect value straight back — a harmless no-op for a `Signal` (never touched once `override` is disabled) and the actual fix for a `Tone.Param` (robot targets — `Tone.Gain.gain` — which has no `override` escape hatch and still resets unconditionally on connect, but is never permanently locked out the way an un-fixed `Signal` is).
- **`linkTarget`** resolves the live Signal via `AudioEngine.getRobotModulationTarget(robotId, target)` / `AudioEngine.getGlobalModulationTarget(target)` (returns `false`, never throws, if neither resolves — e.g. a robot-scoped target called with no `robotId`, or a lane that hasn't been primed yet), then sizes the link Gain's value from `centeredSwingFromRange()`: an **additive delta bounded by the target's CURRENT value and its distance to the nearer edge of its own range** (`min(currentValue - rangeMin, rangeMax - currentValue)`), never the field's raw absolute range — the same fix this app shipped three times historically for three different fields (LPF frequency's full `20–20000` span pushing the cutoff past Nyquist; a fixed symmetric swing still overshooting an off-center base value; `volume`'s now-removed target sitting exactly on its own range's edge, where the swing was unconditionally zero). Robot fields resolve from `ROBOT_LFO_FIELD_RANGE` (gain `0–2`, detune `±50` cents — the two surviving targets); global targets reuse `GLOBAL_AUDIO_SEED_RANGES`, translating `lpf.`/`hpf.` target ids to that table's `filterLPF.`/`filterHPF.` keys. A depth-only edit on an already-connected lane/signal pair updates the Gain's value in place — no reconnect, no click; a lane change or a rebuilt voice's new Signal tears down and reconnects.
- **`unlinkTarget`**/**`disposeRobotLinks`** reverse `linkTarget` — disconnect and dispose the link's Gain(s). Both are safe/no-ops on an unknown key; `disposeRobotLinks` is the "this robot is gone for good" call `localeStore.ts`'s remove/clear paths make.
- **`setDriftEnabled`/`setFilterLinksEnabled`** are the Audio Load Budget's two flags — see that section above for the thresholds and what greys in the UI. Both only ever suspend/restore a Gain's connection; stored lane/link state is never touched.

Phase has no live Signal at all (`Tone.Oscillator.phase` is a plain get/set number, not a `Signal`/`Param`) — rather than the control-rate polling fallback the old per-target engine ran for it, Phase was cut from `RobotLfoTargetId` entirely (`docs/tasks/LFO_BANK.md` Task 1) and stays a plain, non-modulatable slider. `pulseWidth` was cut earlier, for cost (`docs/specs/LFO_LOAD_FIX.md`) — `Tone.PulseOscillator.width` is a real Signal, but only for `'pulse'`-type layers, and the per-pulseWidth-LFO cost (~7× any other robot LFO) made it the first target removed once priming made robot-LFO cost real.

### Wiring — priming order matters

`AudioEngine.start()`, after `buildGlobalFxChain()` and its own re-apply of seeded effect *values* (`applyGlobalAudioToEngine(globalAudio)` — needed first, since `linkTarget`'s swing math reads each target's current value): `lfoEngine.primeLfoBank(lfoBank)`, then one `linkTarget` call per `GLOBAL_LFO_TARGET_IDS` entry from `globalLfoLinks`, then (a second dynamic import, `primeRosterLinks(getActiveLocaleRobots())` from `src/systems/robotLfoLinks.ts`) every active robot's stored `lfoLinks`. Priming the bank before linking is load-bearing — `linkTarget` returns `false` for a lane that doesn't exist yet — and is covered by a call-order test, not just code review.

`src/systems/robotLfoLinks.ts` is the robot-side counterpart: `applyRobotLinkToEngine(robotId, target, link)` (the single call both a user edit — `robotOptionsActions.applyLayerLfoLink` — and priming route through), `primeRobotLinks(robot, targets?)` (re-applies one robot's stored `lfoLinks`, skipping any target the robot has no entry for rather than synthesizing a default), and `primeRosterLinks(robots)` (every robot once — no round-robin ordering needed, unlike the old priming, since there's no cap left to protect). Called at every point a robot's voice is (re)reserved — `spawnRobot`, `reRegisterAllRobotsAudio`, `AudioEngine.start()`'s roster pass, `applyLayersStructural` (a layer-type rebuild) — and by `applySessionPayload` (re-primes only the overridden targets). `localeStore`'s robot-remove/clear paths call `disposeRobotLinks` alongside the unrelated voice-teardown call.

### Seeding

- **Bank lane settings** (`src/utils/globalAudioSeed.ts`'s `generateLfoBankSettings(attenuationStyleId, attenuationStyleName)`) sample the Attenuation Style noise map, one call per lane, dataIds `lfoBank.<lane>.{rate,shape,rateDrift,depthDrift}`. Each lane's rate is drawn from its own fixed, adjacent, log-spaced band (`LFO_BANK_RATE_BANDS`: a `0.1–0.4`, b `0.4–1.5`, c `1.5–4`, d `4–8` Hz) — slow-to-fast by lane letter, quantized to `LFO_RATE_STEP` (0.05) — unaffected by shape. `rateDrift`/`depthDrift` sample `LFO_BANK_DRIFT_SEED_RANGE` (`±0.7`) quantized to a whole hundredth, also unaffected by shape. Re-seeds on Attenuation Style switch via the same `audioStore` subscription every other seeded field uses; `AudioEngine.start()` is what actually primes the engine from it (above) — AS-sync itself is data-only.
- **Shape is a weighted rotating-queue pick across one Attenuation Style's 4 lanes** (`src/utils/lfoShapeDraw.ts`'s `pickShape(t, queue)`, Crawford's melody-system-style "send the picked one to the back" scheme, 2026-10-02 — replaces the earlier `LFO_LOADING_SHAPES` two-shape restriction). All 4 `LfoShape` members are reachable from load now. Lane a draws first against the full queue `LFO_SHAPE_SEED_ORDER` (`[sine, triangle, sawtooth, square]`) weighted by `LFO_SHAPE_SEED_BIAS` (`[1, 0.5, 0.25, 0.125]` — each queue position half as likely as the one before it, so a fresh lane a is sine 53%/triangle 27%/sawtooth 13%/square 7% of the time); whichever shape gets picked is moved to the back of the queue before lane b draws, and so on through d — a shape can still repeat across lanes in the same world, just less likely each time it's reused, never forbidden. This is scoped to shape only: it has no bearing on rate, rateDrift, or depthDrift, which stay exactly as described above.
- **Global-chain links** (`generateGlobalLfoLinks`, same file) sample the Attenuation Style map per `GLOBAL_LFO_TARGET_IDS` entry: a quiet roll (`LFO_QUIET_THRESHOLD = 0.34`, i.e. **66% on-odds**) decides `{ lane: null, depth: 0 }` vs. a real lane pick; a lit target draws its lane via the shared weighted `pickLane(t, counts)` (`src/utils/lfoLaneDraw.ts`) — weight `LFO_LANE_SEED_BIAS[lane] / (1 + counts[lane])`, so the fixed `a > b > c > d` order bias (`{ a: 1, b: 0.85, c: 0.7, d: 0.55 }`) leans every fresh world toward lane `a` first, while the running `counts` tally (`tallyLanes`) pulls subsequent picks toward whichever lane is least-used so far — then a depth in one of three per-group loading windows (below). The tally here only ever covers the 7 global targets (they seed before any robot exists).
- **Robot links** (`generateRobotLfoLinks(noiseMap, offset, priorLaneCounts)`, `spawnSystem.ts`) use the same `pickLane`/`tallyLanes` machinery at a different quiet threshold — `LFO_QUIET_THRESHOLD = 0.7`, i.e. **30% on-odds** (correcting `docs/specs/LFO_LOAD_FIX.md`'s earlier, now-superseded "25%" figure for the same per-target coin flip) — and a `priorLaneCounts` argument that is **roster-aware, not reset per robot**: `spawnRobot` tallies every already-spawned robot's own `lfoLinks` in the active locale before generating a new one's, and each robot's own earlier targets update that same running tally as its own 6-target loop goes, so even one robot's own picks lean away from each other, not just away from the rest of the roster (one sentence on this also lives in [PROCEDURAL_GENERATION.md](PROCEDURAL_GENERATION.md)). A respawn-copy source's `lfoLinks` are kept wholesale, never regenerated, mirroring the rest of `AudioAttributes`'s copy behavior.
- **Depth seed ranges are per-group on both sides, not one flat window** (Crawford's own load-value tuning pass, 2026-10-02). Global links: `eq3.*` draws from `GLOBAL_LFO_EQ_DEPTH_SEED_RANGE` (`5–30%`), `lpf.frequency`/`hpf.frequency` from `GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE` (`5–60%`), `lpf.Q`/`hpf.Q` from `GLOBAL_LFO_FILTER_Q_DEPTH_SEED_RANGE` (`5–40%`) — all three in `globalAudioSeed.ts`, sharing the `GLOBAL_LFO_DEPTH_SEED_MIN` floor of `5`. Robot links: Gain draws from `ROBOT_LFO_GAIN_DEPTH_SEED_RANGE` (`1–60%`), Detune from `ROBOT_LFO_DETUNE_DEPTH_SEED_RANGE` (`1–10%`) — both in `spawnSystem.ts`, sharing the `ROBOT_LFO_DEPTH_SEED_MIN` floor of `1`. Every range's floor is deliberately nonzero: a lit target (one that didn't roll quiet) is never seeded silently inaudible, on either side — a user may still drag Depth to `0` by hand. All five ranges quantize to `LFO_DEPTH_STEP` (1, a whole percent); neither seeder ever reaches the engine by itself — see Wiring above for what actually primes it.

### UI

The inline `LfoLink` primitive (`src/components/ui/controls/LfoLink.tsx`) replaces the old shared `Lfo`/`LfoTargetGroup` display entirely: a `RadioButton` lane picker (`ui.lfoLane` — Off, Core/Apex, Companion/Lateral, Accent/Impulse, Overtone/Canopy) plus a Depth `SliderLinear`, rendered directly beneath the field it modulates rather than in a separate shared "Modulation" accordion. Three call sites:

- **Robot layers** (`SignatureArrayDrawer.tsx`) — each layer's Gain/Detune row is followed by its own `LfoLink`, independently editable (no more click-to-target state machine).
- **EQ/LPF/HPF** (`AudioRigEffectPanel.tsx`) — each param row the same way, bound to `globalLfoLinks`; LPF/HPF pass `heldOff={filterLinksHeldOff}` (EQ never greys).
- **The lanes themselves** — Fleet Params → LFO Bank (`LfoBankLanePanel.tsx`, one per lane): Shape `RadioButton`, Rate `SliderLinear`, Rate Drift/Depth Drift `SliderCenteredZero`s (the two drift rows grey + `HeldOffNote` while `driftHeldOff`; Shape/Rate never grey) — this is where a lane's own oscillator is tuned, replacing the old per-group Drift accordions (Fleet Drift, Probe Drift) entirely.

## Audio Swells

**Does this app have an LFO on Delay's Mix?** No — but it has something else that moves it sometimes. Audio Swells is a wholly separate mechanism from LFO Modulation above: no `Tone.LFO`, no `Signal`/`Param` connection, no `Signal.override` concern at all. `delay.wet`/`reverb.wet` never gained a real `lfoEngine.ts` target and still haven't — Audio Swells is the "something else." A "swell" is a rare, discrete, self-reversing event: one parameter ramps up from its current value, then ramps back down, landing **exactly** back where it started — never a net change, and never a continuous oscillation. Built entirely in `src/systems/audioSwells.ts` (types in `src/types/audioSwell.ts`, the robot-only range table in `src/data/audioSwellRanges.ts`), mirroring `robotSystems.ts`'s `startRobotLifecycle`/`stopRobotLifecycle`/tick lifecycle shape rather than anything in `lfoEngine.ts`. Every write goes through the exact call a human editing that control by hand would make (`audioStore`'s `setGlobalAudio` for global targets, `robotOptionsActions.ts`'s `applyVolume`/`applyLayersContinuous`/`applyAdsr` for robot targets) — so the relevant slider visibly crawls on its own while a swell is active on it, for free, with no dedicated UI.

### Two independent pools

- **Global pool** (`SWELL_GLOBAL_TARGET_IDS`, `types/audioSwell.ts`) — 9 targets: the 7 `GlobalLfoTargetId`s (`eq3.low`/`mid`/`high`, `lpf.frequency`/`Q`, `hpf.frequency`/`Q`) plus `delay.wet` and `reverb.wet`, which carry no LFO target at all. Only `delay.wet`/`reverb.wet` have a real off-equivalent check (`isGlobalTargetAtOffEquivalent`, `audioSwells.ts`): `wet === 0` unambiguously means "no audible contribution," so a target sitting there is never eligible for a *new* swell, and if it drops to `0` while mid-swell, that swell is cancelled immediately and the param snaps back to its captured base value on the very next tick (`advanceGlobalSwell`). Every other target (EQ bands, filter frequency/Q) is always eligible — 0dB EQ and a wide-open filter passthrough frequency are common, legitimate resting positions, not "this effect is off" signals, so there's no equivalent gate for them.
- **Robot pool** (`SWELL_ROBOT_ATTRIBUTE_IDS`) — 17 attributes × the whole roster, never scoped to one robot: `volume`, each of the 3 layers' `gain`/`detune`/`phase`/`pulseWidth` (13 fields), plus 4 ADSR sub-fields (`adsr.attack`/`decay`/`sustain`/`release`), each independently eligible — never one atomic "envelope" move. Spelled out as its own union since 2026-09-30 (`types/audioSwell.ts`'s own doc comment), **not** derived from `RobotLfoTargetId` — that union has since shrunk to 6 (`layer{0,1,2}.{gain,detune}`, see LFO Modulation above), but Audio Swells is a separate system with no `.connect()`/Signal concept at all, so none of the LFO-cost reasoning that shrank `RobotLfoTargetId` applies here; `volume`, every `pulseWidth`, and every `phase` stay swell-eligible even though none of them can carry an LFO link any more. A swell just calls `applyLayersContinuous` with a new plain number on a `BeatClock` tick, the same as `SignatureArrayDrawer.tsx`'s own Phase slider. A robot attribute is only pickable if its own field, and anything it structurally depends on, is actually live — `layerN.*` requires that layer's own gain to be nonzero (`isRobotAttributeStructurallyLive`, replacing the removed `OscillatorLayer.active` flag — this makes `layerN.gain` itself self-referential: a muted layer's own gain can never be picked back up by a swell, matching the old flag's same "manual intervention only" behavior); `volume` and the 4 ADSR fields have no such parent and are always eligible. Robot Ping Controls (`rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `octaveRange`) are never in the 17-attribute pool to begin with — nothing excludes them at selection time because there's nothing to exclude.

Each pool has its own independent 5-concurrent-swell cap (`MAX_CONCURRENT_SWELLS_PER_POOL`) — a full global pool never blocks a robot swell from starting, and vice versa. Compressor and Limiter are never eligible in either pool, the same dynamics-processor exclusion `lfoEngine.ts` already applies; Delay's `delayTime` stays excluded too (only `wet`/Mix is newly eligible).

### Direction, magnitude, and duration

Every swell-eligible attribute follows the same default rule, computed by `pickSwellPeakDelta` (used by the global pool and the robot pool's single-robot path) — a **new, from-scratch formula**, deliberately not `lfoShared.ts`'s `centeredSwingFromRange` (that one computes a *symmetric, bounded* swing with no directionality or minimum-swing guarantee, the wrong shape here):

- **Direction:** up if the current value is at or below the field's own midpoint, down if at or above it, a seeded coin-flip tie-break exactly at the midpoint.
- **Magnitude:** the peak is drawn somewhere between a 50%-of-range floor — relative to the *current value*, not the range's own midpoint (e.g. a field at 33% of its range swells up into `[83%, 100%]`) — and the true edge (min or max, matching direction).
- **Shape:** two phases only, rising then falling, computed in `advanceGlobalSwell`/`advanceRobotSwell` — no hold/plateau. Each tick's value is computed directly from `elapsed / totalPhaseMeasures` against the swell's own captured `baseValue`/`peakDelta`, never accumulated, and snapped to exactly `baseValue` once the swell's total duration elapses — the return-to-base is exact, not asymptotic.
- **Duration:** the Duration slider (`audioStore.swellDuration`, see below) sets the swell's **total** length in measures — rising + falling together — the same value for every attribute including `delay.wet`/`reverb.wet` (no more mix-target exception). `pickSwellSplit` (`audioSwells.ts`, docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.4) draws only the **split ratio** between the two phases, randomized per swell within `[0.2, 0.8]` (`SWELL_SPLIT_MIN_FRACTION`/`SWELL_SPLIT_MAX_FRACTION`) so the split still varies swell-to-swell even though the total no longer does. 1 measure is a hard floor on any phase, for any attribute, full stop (`pickSwellSplit`'s own `Math.max(1, ...)` on each side).

**Four attributes get their own exception**, each a pure clamp on the final peak or a swap of the magnitude formula — never a gate on direction-picking, so the up-vs-down choice itself is always the plain midpoint rule above:

| Attribute | Exception | Constant |
|---|---|---|
| Robot `volume` | A downward swell's peak is clamped so it never drops below 50% of Volume's own range | `VOLUME_SWELL_DOWNWARD_FLOOR` |
| Robot `layerN.detune` | The magnitude formula itself swaps out — capped to a **maximum** of 25% of detune's full range (±25 cents out of -50..50), the opposite shape from the default's "at least 50%" minimum | `DETUNE_SWELL_MAX_SWING_FRACTION` |
| `hpf.frequency` | An upward swell's peak is clamped so it never exceeds 4kHz | `HPF_SWELL_UPWARD_CEILING_HZ` |
| `lpf.frequency` | A downward swell's peak is clamped so it never drops below 100Hz | `LPF_SWELL_DOWNWARD_FLOOR_HZ` |

`clampVolumeDownward`/`clampGlobalPeak` apply the two clamp-shaped exceptions via two small shared helpers, `clampSwellFloor`/`clampSwellCeiling` — each guards against a currentValue that's already past the limit by collapsing to zero movement rather than flipping the swell's direction (e.g. an HPF already above 4kHz never gets pushed *down* by the ceiling clamp; it just doesn't move). Detune's exception is structurally different — not a clamp on `pickSwellPeakDelta`'s own output but an entirely separate magnitude function, `peakDeltaCappedByFraction`, selected by `robotPeakDeltaForDirection` (checked against every `layerN.detune` id via a shared pattern) instead of the default `peakDeltaForDirection` — direction still comes from the same `pickSwellDirection` helper both magnitude functions share.

`ROBOT_SWELL_FIELD_RANGE.volume` is `{0, 1}` (the store's real `masterVolume` fraction) — deliberately **not** the engine-internal LFO field range `volume` once had back when it was a real `RobotLfoTargetId` (`{0, 2}`, the fixed `Tone.Gain(1)` mix-stage node's own operating range; `lfoEngine.ts`'s own `ROBOT_LFO_FIELD_RANGE` has no `volume` key at all today, `volume` having been cut as an LFO target — see LFO Modulation above): reusing that old table would have silently bound a Volume swell against the wrong domain. `applyVolume`'s own parameter is the UI's 0-100 display percent, not this 0-1 fraction — `writeRobotValue` converts (`value * 100`) at the call site.

### Company-wide variant

A small chance turns a robot-pool pick into a **company-wide** swell instead of a single-robot one — the same attribute, moving in lock-step, across every eligible robot in one randomly-chosen `Company`. Not a separate pool, cadence, or cap: `maybeStartRobotSwell` draws a second seeded chance (`SWELL_COMPANY_CHANCE`) only after the robot pool's own trigger already succeeded, and only acts on it when the locale actually has a `Company` to pick — with zero companies, company-wide was never really on the table that tick regardless of the roll, so it falls straight through to the single-robot path (`startSingleRobotSwell`) instead of aborting.

`startCompanyWideSwell` picks one `Company` and one `SwellRobotAttributeId` via seeded draws (both unfiltered — eligibility is applied per-member next), filters `company.robotIds` down to members passing the same structural-eligibility check the single-robot path uses, and — if that leaves zero eligible members — starts no swell at all this tick: not a re-roll, not a fallback to a different company/attribute or to the single-robot path. Direction and the rising/falling measure counts are drawn **once** and shared lock-step across every member; magnitude stays per-robot, via `robotPeakDeltaForDirection` (the same dispatcher the single-robot path uses — the magnitude half of `pickSwellPeakDelta`/detune's capped variant, given an already-decided direction so a shared, externally-decided one can be reused instead of each member re-deriving its own from its own current value). Because duration is shared but each member's own distance-to-travel differs, a member with less room simply interpolates at a smaller total distance over the same shared window — no separate "rate" concept exists. A company-wide swell is one `ActiveSwell` object stored under one Map key per member (`robotSwellKey(robotId, attribute)`) and counts as **exactly one** swell against the robot pool's 5-cap, regardless of company size.

### Lifecycle and determinism

```typescript
startAudioSwells(localeId: string): void   // idempotent — schedules a 16n repeat via BeatClock's scheduleRepeat
stopAudioSwells(): void                    // idempotent — cancels the schedule AND clears every in-flight swell
tickAudioSwells(localeId: string, measure: number): void  // pure w.r.t. `measure` — testable without a real transport
```

Ticked at **16n resolution** (`scheduleRepeat('16n', ...)`, `getCurrentMeasurePrecise()`), not once per measure — a swell's ramp updates up to 16 times per measure, not in single steps at each measure boundary. `measure` inside `tickAudioSwells` may be fractional (sub-measure precision); `advanceActiveSwells` interpolates from it directly, so `elapsed / totalPhaseMeasures` is a smooth, continuously-advancing fraction rather than a coarse per-measure step. Trigger/selection now rolls on **every tick**, not once per whole measure (docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3, superseding this section's earlier once-per-measure gate) — see "Three master controls" below for how the Frequency slider's own rate replaces the old fixed per-measure chance.

Wired into `worldTransition.ts`'s `initializeLocale`, alongside the existing `stopRobotLifecycle()`/`startRobotLifecycle()` pair — `stopAudioSwells(); startAudioSwells(localeId);`, in that order, on every locale (re-)initialization. `stopAudioSwells`'s clear means no swell from a prior locale survives a locale switch or a power cycle (BeatClock silently drops every `scheduleRepeat` registration whenever `AudioEngine.killAll()` runs, same as the robot-lifecycle tick).

Runtime state (`activeSwells`, a plain `Map<string, ActiveSwell>`) lives at module scope in `audioSwells.ts`, never in Zustand — only each tick's resulting field value reaches the store, via the normal `apply*`/`setGlobalAudio` call, same as any other edit (CLAUDE.md: runtime-only state stays out of state). `getActiveSwellSnapshot(pool)` is a small read-only, deduplicated-by-object-identity accessor for tests/future debug UI; nothing else reads `activeSwells` directly.

**Three master controls — Intensity, Frequency, Duration (Fleet Params > Pacing).** Originally one slider (`audioStore.pingVarianceAutomation`, replacing an earlier boolean `audioSwellsEnabled` toggle — `docs/specs/PING-VARIANCE-AUTOMATION.md`) did double duty as both the system's on/off switch and its magnitude dial. `docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md` split that into three: **Intensity** keeps `pingVarianceAutomation`'s name and magnitude-scaling role but can no longer reach `0`; **Frequency** (`audioStore.swellFrequency`, new) took over the on/off role and replaced the old fixed per-measure trigger chance with a real rate; **Duration** (`audioStore.swellDuration`, new) is the swell-length control described above. All three render as a 2x2 layout in `FleetParamsContent.tsx`'s Pacing group — Tempo+Frequency in one row, Duration+Intensity in the other — not inside any accordion, since they're Rig-wide meta-settings, not per-effect params.

- **Intensity** — `PING_VARIANCE_AUTOMATION_SCHEMA` (`SliderLinear`, `data/audioRigConfig.ts` — lore label "PING VARIANCE AUTOMATION", human label "Automatic Effects"). Displays `[1, 100]%` (raised from `[0, 100]%` — it can no longer double as an off switch); the store's fraction converts at the component boundary with the same `* 100` / `/ 100` pattern the Drift sliders already use. **Magnitude scaling.** Every newly-created swell's `peakDelta` — global, single-robot, or per company member — is multiplied by the Intensity fraction via `scaleSwellPeakByAutomation`, as the literal *last* step of that swell's peak calculation, after direction is picked and after every attribute-specific clamp (`clampVolumeDownward`, the detune cap, the HPF/LPF ceilings). Safe by construction: multiplying an already-clamped delta by a fraction in `(0, 1]` only ever shrinks it toward the current value. Fixed at creation — moving the slider afterward never retroactively rescales an in-flight swell. Intensity has **no on/off role at all** now — that's Frequency's job.
- **Frequency** — `SWELL_FREQUENCY_SCHEMA` (`SliderLog`, `[0, 24]` swells/measure — lore label "PING RECURRENCE", human label "Frequency"), with a custom `formatValue` (`formatSwellFrequency`) so the readout reads "Off" at `0`, "N/measure" at or above `1`, and "every N measures" (the reciprocal) below `1`. `frequencyToPerTickChance(frequency)` (`= frequency / 16`, clamped to `1`) converts the slider's "swells per measure" value into a per-tick trigger probability — `tickAudioSwells` rolls this check on **every** 16n tick now (not once per whole measure), so the long-run rate matches "swells per measure" without needing the old once-per-measure gate. Values above `16` are clamped to the same `1.0` per-tick chance as exactly `16` — "24 times a measure" and "16 times a measure" are behaviorally identical, an accepted ceiling. **Trigger gate.** `tickAudioSwells` reads `swellFrequency` once per tick and only calls `maybeStartGlobalSwell`/`maybeStartRobotSwell` when it's `> 0`.
- **Duration** — `SWELL_DURATION_SCHEMA` (`SliderLinear`, `[1, 24]` measures — lore label "PING SUSTAIN", human label "Duration"). See "Direction, magnitude, and duration" above for `pickSwellSplit`.

**0 (Frequency) is a full stop, not a zero-magnitude swell.** At exactly `0`, no new swell starts, and every swell still in its *rising* phase is forced into an early return — `maybeForceGlobalSwellReturn`/`maybeForceRobotSwellReturn`, called at the top of `advanceGlobalSwell`/`advanceRobotSwell` each tick and now keyed on `frequency` (re-keyed from `automation`/Intensity in `AUTOMATION_FREQUENCY_DURATION_SPLIT.md` §1.3), convert the swell in place (new `peakDelta` from its current live value, `risingMeasures` reset to `0`, `startMeasure` reset to now, `phase` flipped to `'falling'`) so it rides its own already-drawn `fallingMeasures` back to base through the *same* falling-phase interpolation formula every normal completion already uses — no new curve, no new snap-timing concept. No new `ActiveSwell`/`SwellMember` field was needed to mark "already forced": flipping `phase` to `'falling'` is itself sufficient, since the guard is `phase === 'rising'` — a swell already falling (naturally, or because it was forced on an earlier tick) is left untouched, and there is no code path that ever flips a `'falling'` swell back to `'rising'`, so a forced return always rides to completion even if Frequency moves off `0` again before it finishes.

**All three seed once per session, then carry forward — not reseeded on every Attenuation Style switch.** Unlike `eq3.low`/`reverb.wet`/every other per-field seeded value in `globalAudio`, `pingVarianceAutomation`/`swellFrequency`/`swellDuration` belong with `compressorBeforeDelay` in the carry-forward group: `regenerateGlobalAudioFromSeed` seeds Intensity via `generatePingVarianceAutomation` (`utils/globalAudioSeed.ts` — `getSeededVal` into `[0.10, 0.60]`, narrowed from `[0.33, 0.66]` now that it's magnitude-only) and Frequency/Duration via `generateSwellFrequency`/`generateSwellDuration` (both `getSeededVal` into `[2, 8]`), each only on its own field's first-ever call, tracked by its own `*_UNSEEDED` sentinel (`-1`, outside each field's real domain); every later call — any future Attenuation Style switch or retransmit — leaves the user's current values untouched. `setPingVarianceAutomation`/`setSwellFrequency`/`setSwellDuration` are all plain state writes with no `AudioEngine` call — there's no live node to touch; `audioSwells.ts` simply reads each value fresh on its own next tick.

Every trigger/selection/timing/direction/magnitude decision is a `getSeededVal(noiseMap, dataId, offset, min, max)` draw against the **Attenuation Style** noise map (`getAttenuationStyleNoiseMap`) — `offset` is the current *unwrapped* measure (`getCurrentMeasurePrecise()`), never the `% 96`-wrapped value `subscribeToMeasure`'s own callback argument carries elsewhere in this codebase (the same trap `robotSystems.ts`'s `startRobotLifecycle` documents — a wrapped measure would replay an identical decision every 96 measures). As of docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md §1.3, this offset is no longer floored to a whole measure first — since trigger/selection now rolls on every 16n tick rather than once per whole measure, a successful tick's target/peak/duration draws key off that tick's own fractional `measure` value directly, so two ticks within the same whole measure (e.g. `3.0` and `3.0625`) draw independently rather than identically. `Math.random()` appears nowhere in `audioSwells.ts`. Two sessions on the same seed still produce an identical swell timeline; a user's own manual edits are the only thing that can make two sessions diverge.

## BPM / Tempo

`audioStore.bpm` — the real `Tone.Transport` tempo, driving every beat-based schedule in the app — is a locale-seeded, live-adjustable value (docs/specs/BPM_CONTROL.md), not a hardcoded constant. It is the only BPM in the app: the former `locale.settings.bpm` field is gone (docs/DUPLICATE_VALUE_AUDIT.md item 1), and the factory bubble vents that once converted measures to seconds with it now run on plain wall-clock time with no tempo input at all (`BubbleStream.tsx`, docs/BUILDING_DESIGN.md "Bubble Streams"). Nothing decorative reads `audioStore.bpm`.

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

For audio that goes wrong on a real device, load the app with `?debug`: a read-only overlay shows the context state, audio-clock rate, main-thread lag, the Audio Load budget, and — from `src/engine/audioDiagnostics.ts` — the output level at two points in the graph (after EQ3 and after `masterGain`), silent-while-sounding and non-finite events, and the browser's own playback-underrun counts. How to read it: [PERFORMANCE.md](PERFORMANCE.md#reading-the-output-taps-and-the-playback-stats); design: [specs/AUDIO_OUTPUT_DIAGNOSTIC.md](specs/AUDIO_OUTPUT_DIAGNOSTIC.md). The taps live in `src/engine/audioEngine/globalFx.ts` (`attachOutputTaps` / `detachOutputTaps` / `readOutputTaps`) and are re-attached at the end of `wireGlobalFxChain`, which disconnects every FX node whenever the Natural/Controlled Decay toggle flips.