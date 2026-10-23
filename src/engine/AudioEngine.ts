// ========================================
// IMPORTS
// ========================================
import * as Tone from 'tone';
import gsap from 'gsap';
import alea from 'alea';
import { useLocaleStore } from '../stores/localeStore';
import { useRobotPanReadoutStore } from '../stores/robotPanReadoutStore';
import { getActiveLocaleId } from '../utils/localeHelpers';

import type { ADSREnvelope, MelodyEvent, NoteDuration, WaveformType, Robot, RobotFilterType } from '../types/Robot';
import type { OscillatorLayer } from '../types/layeredAudio';
import { GLOBAL_LFO_TARGET_IDS, type RobotLfoTargetId } from '../types/lfo';
import { ROBOT_SENDS, isRoomSendKey, robotSendLevels, type SendEngineKey } from '../data/robotSends';
import { getAvailableNotes, scheduleHarmonyCycle, stopHarmonyCycle } from './harmonySystem';
import { resetBeatClock, initBeatClock } from './beatClock';
import { buildClickTrackMelody } from './clickTrack';
import { MIN_LEAD, MAX_POLYPHONY, FILTER_RAMP_SECONDS, PERFORMANCE_MIN, PERFORMANCE_MAX, HUMANIZE_MIN_MS, HUMANIZE_MAX_MS, MIN_SOUNDING_SECONDS } from '../constants';
import { DEFAULT_DYNAMICS } from './melodyGenerator';
import { resolveArticulation } from './articulation';

import { getRef } from '../utils/refs';
import { precomputeDataX } from '../utils/getSeededVal';
import { tryGetLocaleNoiseMap } from '../utils/noiseMaps';
import { devWarn } from '../utils/helpers';
import { clampSend } from '../utils/clampSend';
import { isRobotAudible } from '../utils/robotAudibility';
import { resolveLfoBankForEngine } from '../utils/tempoSync';
import { calculatePanFromPosition } from './audioEngine/panning';
import { resolveBusFilterCutoff, resolveBusFilterQ, resolveBusFilterType } from './audioEngine/busFilter';
import { volumePositionToGain } from './audioEngine/volumeTaper';
import { getToneCtor, makeStubPanner, makeStubGain, makeStubFilter, type MinimalToneNode, type ModulationTarget } from './audioEngine/toneHelpers';
import { createCompositeVoice, type CompositeVoice } from './audioEngine/compositeVoice';
import { disposeVoiceNodes, rampOrSet, type RampableParam, type VoiceEntry } from './audioEngine/voiceEntry';
import { ROOM_KEYS, setRoomFed, type RoomKey } from './audioEngine/bypassCell';
import {
  buildGlobalFxChain,
  getGlobalChainEntry,
  getGlobalReverbRoom,
  getGlobalDelayRoom,
  getGlobalRoomInput,
  waitForGlobalReverbReady,
  setMasterVolume,
  getMasterVolume,
  setGlobalReverb,
  setGlobalDelay,
  setGlobalFilterLPF,
  setGlobalFilterHPF,
  setGlobalEQ,
  setGlobalCompressor,
  setGlobalLimiter,
  setGlobalDistortion,
  setGlobalChebyshev,
  setGlobalBitCrusher,
  setGlobalAutoWah,
  setGlobalPhaser,
  setGlobalChorus,
  setGlobalTremolo,
  setGlobalVibrato,
  setGlobalFrequencyShifter,
  setGlobalStereoWidener,
  getGlobalModulationTarget,
} from './audioEngine/globalFx';

// ========================================
// TYPES
// ========================================
export interface NoteParams {
  robotId: string;
  note: string;
  /** A written note value, or a sounding length in seconds (a rested or clipped note, from processMelodyStep).
   * A number reaches the synth as its string, which Tone.Time reads as seconds. */
  duration: NoteDuration | number;
  time?: number;
  velocity?: number;
  /** Multiplies the resolved velocity (before clamping to 1). Used for the
   * motif-group accent — see GROUP_ACCENT_MULTIPLIER. */
  accentMultiplier?: number;
  /** The playback position (processMelodyStep's stepCounter) the velocity roll keys off, together with the
   * robot's compositionSeed, so a replay from power-on repeats the pattern and two robots at the same tick
   * differ. Absent: the legacy per-robot counter. Robot Performance, docs/specs/ROBOT_PERFORMANCE.md §1.3. */
  position?: number;
}

interface MelodyEventEntry {
  robotId: string;
  event: MelodyEvent;
  /** True when this event is the earliest `startStep` within its motif-tiling
   * repeat window (computed once at registration — see registerRobotMelody). */
  isGroupAccent?: boolean;
  /** True when this entry belongs to the substituted click-track melody (registerRobotMelody): a tempo reference
   * is never humanized. */
  clickTrack?: boolean;
}

// ========================================
// CONSTANTS
// ========================================
// NOTE: MAX_POLYPHONY and MIN_LEAD are provided from src/constants for consistency across modules
/** Fraction of notes that receive a random velocity offset for organic expressiveness, at the neutral Dynamics (50). */
const VELOCITY_VARIANCE_RATE = 0.15;
/** Maximum ± deviation applied to a note's velocity when variance is triggered, at the neutral Dynamics (50). */
const VELOCITY_VARIANCE_AMOUNT = 0.25;  // ±25% offset
/** The Dynamics value that leaves the variance rate and width exactly as the two constants above. Dynamics / this
 *  scales both: 0 is flat, 100 is twice the rate and twice the width. docs/specs/ROBOT_PERFORMANCE.md assumption 7. */
const DYNAMICS_NEUTRAL = 50;
/** Length of the velocity-roll pattern: the noise offset is (compositionSeed + position) mod this. Prime, so the
 *  pattern does not line up with the 16-step measure and repeats only every 97 steps. */
const VELOCITY_PERIOD = 97;
/** Minimum effective note velocity after clamping (prevents silent notes). */
const VELOCITY_MIN = 0.05;
/**
 * Velocity multiplier applied to the earliest event in each motif-tiling
 * repeat window, when a robot's rhythmicMotifLength toggle is active — an
 * accent on the "downbeat" of each tiled group. No effect in scatter mode
 * (rhythmicMotifLength.active === false), since there are no groups to accent.
 */
const GROUP_ACCENT_MULTIPLIER = 1.25;
/** Ramp duration for a live updateRobotMasterVolume change — short enough to feel instant, long
 *  enough to avoid an audible click on the underlying AudioParam. */
const VOLUME_RAMP_SECONDS = 0.05;
/** Ramp duration for a live updateRobotPan change (a slider edit or Auto switching either way) —
 *  the same short glide as VOLUME_RAMP_SECONDS, in a constant of its own so the two can be tuned
 *  apart. docs/specs/ROBOT_PAN.md §1.3. */
const PAN_RAMP_SECONDS = 0.05;
/** Ramp duration for a live updateRobotSends change - the same short glide as VOLUME_RAMP_SECONDS and
 *  PAN_RAMP_SECONDS, in a constant of its own. docs/specs/ROBOT_SENDS.md §1.4. */
const SEND_RAMP_SECONDS = 0.05;

// Precompute data X positions for seeded noise sampling (module scope — hot path safe)
const VELOCITY_ROLL_X = precomputeDataX('audio.velocityRoll');
const VELOCITY_VARIANCE_X = precomputeDataX('audio.velocityVariance');

/** What a positioned roll is for; part of the draw's key, so the three never share a value at one tick. */
export type PerformanceRollPurpose = 'velocityRoll' | 'velocityVariance' | 'humanize';

/**
 * The one draw the positioned velocity roll, its variance and Humanize are built on (Robot Performance T20): a
 * uniform [0, 1) value from alea over `seed:purpose:position`. Independent across robots, purposes and ticks, and a
 * pure function of its inputs, so a replay from power-on repeats it. It replaced sampling the locale noise map at
 * `compositionSeed + position`: compositionSeed is a 0-1 fraction, so every robot sat within one unit of the others on a
 * smooth field and a unison rolled, and shifted, together. The legacy no-position path still reads the noise map.
 */
export function performanceRoll(compositionSeed: number, purpose: PerformanceRollPurpose, position: number): number {
  return alea(`${compositionSeed}:${purpose}:${position}`)();
}

// Validates a resolved pitch string before triggering (e.g. "C4", "F#3", "Bb2") — hoisted to
// module scope, same "precompute once, not per-note" discipline as VELOCITY_ROLL_X/
// VELOCITY_VARIANCE_X above, since triggerWithCap runs on the per-note hot path.
const NOTE_RE = /^[A-Ga-g][b#]{0,2}\d+$/;

// ========================================
// MODULE STATE
// ========================================
let initialized = false;
// instrumentsLoaded intentionally survives stop()/killAll() — the FX chain
// (compressor, reverb, delay, etc.) is expensive to rebuild and remains valid
// across start/stop cycles. Only a full page reload resets it.
let instrumentsLoaded = false;
// Reservation state
let activeVoices = 0;
// Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §4.3) — pushed in by audioBudgetSystem, never read from a
// store here (AudioEngine imports the stores dynamically for load-order reasons). Both default to "no
// restriction", so the engine behaves exactly as before until something pushes them.
// Robots allowed to sound; null = every robot (no budget running).
let soundingRobots: ReadonlySet<string> | null = null;
// Simultaneous-note ceiling; MAX_POLYPHONY = Full.
let polyphonyCap = MAX_POLYPHONY;
// Humanize (docs/specs/ROBOT_PERFORMANCE.md assumption 9): how far, in ms, a note may land off the grid. Pushed in
// by audioStore like the two values above, never read from a store on the tick (audioStore imports this module).
// 0 = machine-exact, which is also the state until something pushes a value.
let humanizeMs = 0;
// Global FX chain (compressor, reverb/delay/limiter/EQ/filters, master
// gain) lives in src/engine/audioEngine/globalFx.ts as its own module state.

// Step registry: Map<stepNumber (1-16), events at that step>
const stepRegistry = new Map<number, MelodyEventEntry[]>();

let stepCounter = 0;
let scheduledTickId: number | null = null;

// Cache Tone.Transport instance returned by Tone.getTransport() so repeated calls
// return the same mock instance in tests and the same runtime transport in-app.
let _transport: ReturnType<typeof Tone.getTransport> | null = null;
// Composite voices (created from LayeredWave descriptors, src/engine/audioEngine/compositeVoice.ts) stored separately
const compositeVoices: Map<string, VoiceEntry> = new Map();

/** Store a robot's new voice, tearing down the one it replaces so a second reservation never orphans a live graph. */
function storeVoice(robotId: string, entry: VoiceEntry): void {
  const previous = compositeVoices.get(robotId);
  if (previous) {
    disposeVoiceNodes(previous);
    // The new voice's sends start at 0, so the robot feeds nothing until it is primed again.
    unfeedRooms(robotId);
  }
  compositeVoices.set(robotId, entry);
}

/** A voice's five send gains, all at 0 (dry): live Tone.Gains, or stubs when there is no constructor (headless, or the
 *  fallback voice). Built in table order (docs/specs/ROBOT_SEND_TABLE.md §1.2); every reservation site primes them. */
function buildSendGains(GainCtor: (new (...args: unknown[]) => Tone.Gain) | undefined): Record<SendEngineKey, Tone.Gain> {
  const sends = {} as Record<SendEngineKey, Tone.Gain>;
  for (const spec of ROBOT_SENDS) {
    sends[spec.engineKey] = GainCtor ? new GainCtor(0) : makeStubGain(0) as unknown as Tone.Gain;
  }
  return sends;
}

/** The room a send feeds: the Reverb and Delay rooms by their getters, an effect room by its in. Null while the room is
 *  not built (headless, or before the FX chain), and the send then gets no downstream edge. */
function sendTargetOf(key: SendEngineKey): Tone.ToneAudioNode | null {
  if (isRoomSendKey(key)) return getGlobalRoomInput(key);
  return key === 'reverb' ? getGlobalReverbRoom() : getGlobalDelayRoom();
}

/**
 * Robot Effect Sends (docs/specs/ROBOT_EFFECT_SENDS.md §1.4, assumption 3): the reserved robots whose send into each
 * effect room is above 0. A room is told (setRoomFed) only when its set becomes empty or non-empty, so a second feeder
 * or a level change within the room costs no crossing. Runtime-only module state, never in a store.
 */
const roomFeeders: Record<RoomKey, Set<string>> = { grit: new Set(), shimmer: new Set(), double: new Set() };

/** Add or remove `robotId` as a feeder of `key`'s room, telling the room when that flips whether anyone feeds it. */
function setRoomFeeder(key: RoomKey, robotId: string, feeding: boolean): void {
  const feeders = roomFeeders[key];
  const was = feeders.size > 0;
  if (feeding) feeders.add(robotId);
  else feeders.delete(robotId);
  const now = feeders.size > 0;
  if (was !== now) setRoomFed(key, now);
}

/** A released (or replaced) voice feeds no room any more. */
function unfeedRooms(robotId: string): void {
  for (const key of ROOM_KEYS) setRoomFeeder(key, robotId, false);
}

// Per-robot note counter used for deterministic seeded sampling (mod 97)
const robotNoteIndex = new Map<string, number>();

// Last pan value written to each reserved robot's panner — see updateAllPanners.
const lastPanByRobot = new Map<string, number>();
/**
 * Robots whose Auto is off: updateAllPanners skips them, updateRobotPan owns their panner. The
 * localeStore (`robot.pan` / `robot.panAuto`) is the source of truth, so nothing here survives a
 * release — releaseVoice clears it and every reservation site re-primes a manual robot from the
 * store (docs/specs/ROBOT_PAN.md §1.3, assumption 8).
 */
const manualPanByRobot = new Map<string, number>();
/** Pan is in [-0.5, 0.5]; a change under this is inaudible and not worth an automation event. */
const PAN_WRITE_EPSILON = 0.0005;


// ========================================
// INTERNAL FUNCTIONS
// ========================================

/** Robots in the currently active locale (empty array if locale/robots are absent). */
function getActiveLocaleRobots(): Robot[] {
  const store = useLocaleStore.getState();
  return store.locales[getActiveLocaleId()]?.robots ?? [];
}

/** The articulation fields a robot hands to reserveVoice (each absent on a robot that never set it). */
function articulationOf(robot: Robot): { portamento?: number; filterQ?: number; filterType?: RobotFilterType } {
  const { portamento, filterQ, filterType } = robot.audioAttributes;
  return { portamento, filterQ, filterType };
}

/** Find a robot by id within the currently active locale. */
function findActiveRobot(robotId: string): Robot | undefined {
  return getActiveLocaleRobots().find((r) => r.id === robotId);
}

/**
 * Excludes any layer with `gain === 0` from a reserveVoice descriptor — Roadmap Phase 9's
 * "mute, don't delete" model for Coaxial/Harmonic, replacing the old separate `active` flag
 * (removed — see `OscillatorLayer`'s own doc comment). A layer with no `gain` field at all is
 * treated as audible (`!== 0`, not a strict truthy check), so callers/fixtures that predate
 * the field keep their existing audible behavior rather than silently going quiet.
 */
function filterAudibleLayers(
  descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] },
): OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] } {
  if (Array.isArray(descriptor)) {
    return descriptor.filter((l) => l.gain !== 0);
  }
  if (descriptor.layers) {
    return { ...descriptor, layers: descriptor.layers.filter((l) => l.gain !== 0) };
  }
  return descriptor;
}

/**
 * Get the robot's current visual X position from the DOM.
 * Reads the current GSAP-animated x transform value from the SVG element.
 * Falls back to stored state position if ref not found or transform unavailable.
 *
 * @param robotId - Robot ID
 * @returns Current visual X position (from DOM) or stored X position (from state)
 */
function getRobotVisualX(robotId: string): number {
  try {
    const ref = getRef(`robot-${robotId}`);
    if (ref) {
      // Read the current x transform applied by GSAP
      const visualX = gsap.getProperty(ref, 'x') as number;
      if (typeof visualX === 'number' && !isNaN(visualX)) {
        return visualX;
      }
    }
  } catch (err) {
    devWarn('[AudioEngine] getRobotVisualX failed', err);
  }

  // Fallback: read position from state
  try {
    const robot = findActiveRobot(robotId);
    return robot?.position.x ?? 960; // Default to center if not found
  } catch (err) {
    devWarn('[AudioEngine] getRobotVisualX.stateFallback failed', err);
    return 960; // Default to center
  }
}

/**
 * Initialize the global FX chain and compressor.
 * All composite voices route through this chain.
 */
async function loadInstruments(): Promise<void> {
  if (instrumentsLoaded) return;

  // Master compressor + global FX chain construction/wiring lives in
  // src/engine/audioEngine/globalFx.ts.
  buildGlobalFxChain();
  // The rooms are built unfed, but robots reserved and primed at spawn (before any room existed) are already in the
  // feeder sets, and a set that never goes empty never flips: tell each new room where its set stands now.
  for (const key of ROOM_KEYS) setRoomFed(key, roomFeeders[key].size > 0);

  instrumentsLoaded = true;

  // If robots spawned before AudioEngine initialized, reserve their composite voices now.
  try {
    const robots = getActiveLocaleRobots();
    if (robots.length > 0) {
      robots.forEach((robot: Robot) => {
        try {
          const layers = (robot.audioAttributes as unknown as { layers?: OscillatorLayer[] })?.layers;
          if (Array.isArray(layers) && layers.length > 0) {
            AudioEngine.reserveVoice(
              robot.id,
              layers,
              robot.audioAttributes.adsr,
              robot.audioAttributes?.phase,
              robot.audioAttributes?.detune,
              (robot.audioAttributes as unknown as { layers?: OscillatorLayer[] })?.layers?.[0]?.pulseWidth,
              robot.masterVolume,
              robot.audioAttributes?.filterFreq,
              articulationOf(robot),
            );
            // The engine keeps no pan state across a reservation; the store does (Robot Pan §1.3).
            if (robot.panAuto === false) AudioEngine.updateRobotPan(robot.id, robot.pan);
            // Likewise the sends: a new voice starts dry, and unlike a manual pan every robot is primed (Robot Sends §1.4).
            AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot));
          }
        } catch (err) {
          devWarn('[AudioEngine] Failed post-load reservation for robot', robot.id, err);
        }
      });
    }
  } catch (err) {
    devWarn('[AudioEngine] Post-load reservation pass failed', err);
  }
}

/**
 * Schedule voice release at the exact time note ends.
 *
 * Uses `Tone.getContext().setTimeout` — a real-seconds, AudioContext-clock-based
 * timeout — NOT `transport.scheduleOnce`. `transport.scheduleOnce`'s `'+N'` offset
 * resolves against the TRANSPORT's own tick timeline (`Transport.scheduleOnce` ->
 * `TransportTimeClass(...).toTicks()`), converting the real-seconds delay into a
 * fixed tick position using the tempo in effect at schedule time. If BPM changes
 * before that tick position is reached (docs/specs/BPM_CONTROL.md's live Tempo
 * slider makes this routine now), the real time it takes to reach that fixed tick
 * shifts — releases fire late (bpm decreased) or early (bpm increased). Enough
 * skew strands `activeVoices` at `MAX_POLYPHONY`, silently blocking every new
 * trigger ("plays a few more notes, then nothing"). `context.setTimeout` is
 * genuinely tempo-independent: it fires `delayFromNow` real seconds later
 * regardless of anything `Transport.bpm` does in between.
 */
function scheduleVoiceRelease(duration: NoteDuration | number, time: number): void {
  const durSec = Tone.Time(duration).toSeconds();
  // `time` is an absolute AudioContext timestamp; `Tone.now()` is the current
  // AudioContext time, so their difference is the lookahead until the note fires.
  const delayFromNow = Math.max(0, (time - Tone.now()) + durSec + 0.04);

  try {
    Tone.getContext().setTimeout(() => {
      activeVoices = Math.max(0, activeVoices - 1);
    }, delayFromNow);
  } catch (err) {
    devWarn('[AudioEngine] scheduleVoiceRelease failed', err);
    activeVoices = Math.max(0, activeVoices - 1);
    devWarn('[AudioEngine] Failed to schedule voice release, immediate fallback', err);
  }
}

/**
 * Update all reserved panners' pan values once per tick to avoid frequent DOM reads
 * and per-trigger panner updates which can cause main-thread jank.
 * Called from the Transport tick with the scheduled `time` for accuracy.
 */
function updateAllPanners(_time?: number): void {
  try {
    for (const [robotId, entry] of compositeVoices.entries()) {
      try {
        // Auto off: updateRobotPan owns this panner. Skipped before the DOM read, so it is also cheaper.
        if (manualPanByRobot.has(robotId)) continue;
        const visualX = getRobotVisualX(robotId);
        const panValue = calculatePanFromPosition(visualX);
        // Tone's Param `value` setter is cancelScheduledValues + setValueAtTime — two timeline
        // operations — and robots are stationary most of the time, so skip the write unless the
        // pan actually moved. lastPanByRobot is cleared in releaseVoice.
        const previous = lastPanByRobot.get(robotId);
        if (previous !== undefined && Math.abs(previous - panValue) < PAN_WRITE_EPSILON) continue;
        entry.panner.pan.value = panValue;
        lastPanByRobot.set(robotId, panValue);
        // The Pan slider's readout under Auto — only on a write this loop already makes, so Auto's
        // audio is unchanged and a stationary robot costs nothing.
        useRobotPanReadoutStore.getState().setPan(robotId, panValue);
      } catch (err) {
        devWarn('[AudioEngine] Failed to update composite panner for', robotId, err);
      }
    }
  } catch (err) {
    devWarn('[AudioEngine] updateAllPanners failed', err);
  }
}
/**
 * Trigger note with polyphony cap enforcement.
 * Applies per-robot synth selection and ADSR envelope when provided.
 * Returns true if note was triggered, false if skipped due to cap.
 */
export function triggerWithCap(params: NoteParams): boolean {
  const { robotId, note, duration, time } = params;

  // Enforce audioMode (mute/solo) here — this is the sole enforcement point,
  // not a backup: scheduleNote's own audioMode block only handles highlight
  // attenuation. Checked before the polyphony cap below so a muted/non-solo
  // robot's note never consumes a polyphony slot — that note was never going
  // to play either way. No devLog on the mute/solo branches below —
  // muted/non-solo robots hit this on every note attempt, and that's
  // routine, intended behavior, not something worth logging per-note.
  try {
    const localeRobots = getActiveLocaleRobots();
    if (localeRobots.length > 0) {
      const robotFromStore = localeRobots.find((r) => r.id === robotId);
      // anySolo, not the array — isRobotAudible.ts's own signature was narrowed to just what it
      // actually reads (bugfix, found live via RobotSelectionCard's own re-render storm); this
      // call site isn't React-rendered so it wasn't part of that bug, but keeps the same contract.
      const anySolo = localeRobots.some((r) => r.audioMode === 'solo');
      if (!isRobotAudible(robotFromStore?.audioMode, anySolo)) {
        return false;
      }
      // Highlight attenuation is handled in scheduleNote; skip here to avoid double-attenuation.
    }
  } catch (err) {
    devWarn('[AudioEngine] triggerWithCap.audioMode failed', err);
  }

  // Audio-load budget: a robot standing by (eligible, but over the budget) neither triggers nor takes a
  // polyphony slot. After the mute/solo check above and before the cap below, so it never counts against it.
  if (soundingRobots !== null && !soundingRobots.has(robotId)) {
    return false;
  }

  if (activeVoices >= polyphonyCap) {
    return false;
  }

  const scheduleTime = time ?? Tone.now();
  activeVoices++;

  try {
    if (!compositeVoices.has(robotId)) {
      activeVoices = Math.max(0, activeVoices - 1);
      devWarn(`[AudioEngine] No composite voice reserved for ${robotId}, skipping note`);
      return false;
    }

    const comp = compositeVoices.get(robotId);
    const synth = comp?.composite ?? null;

    if (!synth) {
      activeVoices = Math.max(0, activeVoices - 1);
      devWarn('[AudioEngine] No composite voice available, skipping note');
      return false;
    }

    // Validate note string before touching the synth — an invalid note can start
    // an oscillator attack before throwing, leaving voices permanently open.
    if (!NOTE_RE.test(note)) {
      activeVoices = Math.max(0, activeVoices - 1);
      console.warn(`[AudioEngine] Invalid note string "${note}", skipping`);
      return false;
    }

    // Pan is no longer recomputed here on every note — updateAllPanners (called once per
    // 16th-note tick from startMelodyPlayback) already keeps every reserved robot's panner
    // current at a strictly higher resolution than any single robot's own note-trigger rate,
    // so this was pure duplicate work on the hot path (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 6).
    // A seconds number goes to the synth as its string: Tone.Time reads "0.075" as seconds, and the composite
    // voice stringifies its duration anyway (it accepts NoteDuration | string).
    synth.triggerAttackRelease(note, typeof duration === 'number' ? String(duration) : duration, scheduleTime, params.velocity ?? 0.8);
    scheduleVoiceRelease(duration, scheduleTime);
    return true;
  } catch (err) {
    console.error('[AudioEngine] Failed to trigger note:', err);
    activeVoices = Math.max(0, activeVoices - 1);
    return false;
  }
}

/**
 * Start the main melody playback loop (16th-note tick — 16 steps = 1 measure,
 * matching melodyGenerator's own subdivision model).
 */
function startMelodyPlayback(): void {
  if (scheduledTickId !== null) return;

  const transport = _transport ?? Tone.getTransport();

  scheduledTickId = transport.scheduleRepeat((time: number) => {
    // Update panners once per tick to reduce per-note DOM reads and main-thread work.
    updateAllPanners(time);

    // One shared per-step loop (processMelodyStep) — this used to carry its own copy that
    // dropped isGroupAccent, so the motif accent only ever worked through the test helper.
    AudioEngine.processMelodyStep((stepCounter % 16) + 1, time);

    stepCounter++;
  }, '16n');
}

// ========================================
// AUDIOENGINE SINGLETON (FUNCTIONAL)
// ========================================

/**
 * Neutral per-note velocity baseline. Roadmap Phase 9 moved overall robot loudness off per-note
 * velocity and onto each robot's own live bus gain (see reserveVoice's masterVolume parameter and
 * updateRobotMasterVolume) — a robot's masterVolume no longer feeds this at all, avoiding
 * double-applying the same scaling twice. This baseline is just where the small performance-level
 * variance below jitters around; it isn't itself a volume control.
 */
const NOTE_VELOCITY_BASELINE = 0.8;
// Robot Performance (docs/specs/ROBOT_PERFORMANCE.md assumption 6): 0.8, down from 1. At 1 the baseline sat at
// the velocity ceiling, so every "louder" multiplier (the 1.25 motif-group accent, the accent marks) could only
// lift a note the variance had first pushed down. 0.8 leaves a 25 % lift before the clamp, at a cost of about
// 2 dB fleet-wide. Volume is a separate bus gain and untouched.

function clampVelocity(velocity: number): number {
  return Math.min(1, Math.max(VELOCITY_MIN, velocity));
}

/**
 * A robot's Dynamics for the velocity roll: its 0-100 value, clamped, with an absent or non-finite one reading as
 * the neutral default. The store already clamps what it writes; this keeps a hand-built robot, or a NaN, from ever
 * reaching the synth as a NaN velocity.
 */
function resolveDynamics(robot?: Robot): number {
  const dynamics = robot?.dynamics;
  if (typeof dynamics !== 'number' || !Number.isFinite(dynamics)) return DEFAULT_DYNAMICS;
  return Math.max(PERFORMANCE_MIN, Math.min(PERFORMANCE_MAX, dynamics));
}

/**
 * Deterministic, locale-seeded velocity computation.
 * Decides whether to vary this note and by how much, around NOTE_VELOCITY_BASELINE. With a `position` the two draws
 * are `performanceRoll(compositionSeed, purpose, position)`: uniform, independent across robots and ticks, and a pure
 * function of their inputs, so a replay from power-on repeats the pattern and two robots at the same tick differ
 * (T20). With no `position` (tests, callers outside the playback loop) it falls back to the legacy per-robot counter
 * sampling the locale noise map at precomputed X positions. Either way the noise map's presence gates the roll. The robot's
 * Dynamics scales the variance rate and width (50 = today's exactly, 0 = flat). Falls back to no variance when the
 * noise map is unavailable. `robot` is the store robot when the caller already has it; otherwise it is looked up.
 */
export function computeNoteVelocitySeeded(robotId?: string, position?: number, robot?: Robot): number {
  const localeId = getActiveLocaleId();
  const noiseMap = tryGetLocaleNoiseMap(localeId);
  if (!noiseMap) return clampVelocity(NOTE_VELOCITY_BASELINE);

  const storeRobot = robot ?? (robotId ? findActiveRobot(robotId) : undefined);
  const scale = resolveDynamics(storeRobot) / DYNAMICS_NEUTRAL;
  const rate = VELOCITY_VARIANCE_RATE * scale; // at most 0.3: resolveDynamics caps the scale at 2
  const width = VELOCITY_VARIANCE_AMOUNT * scale;

  // The two draws: the roll in [0, 1) against the rate, and the signed variance in [-1, 1].
  let roll: number;
  let variance: number;
  if (position !== undefined) {
    const seed = storeRobot?.compositionSeed ?? 0;
    roll = performanceRoll(seed, 'velocityRoll', position);
    variance = performanceRoll(seed, 'velocityVariance', position) * 2 - 1;
  } else {
    const idx = robotId ? (robotNoteIndex.get(robotId) ?? 0) : 0;
    const offset = idx % VELOCITY_PERIOD;
    if (robotId) robotNoteIndex.set(robotId, (idx + 1) % VELOCITY_PERIOD);
    roll = (noiseMap(VELOCITY_ROLL_X, offset) + 1) / 2; // map [-1,1] -> [0,1]
    variance = noiseMap(VELOCITY_VARIANCE_X, offset);
  }

  if (roll >= rate) return clampVelocity(NOTE_VELOCITY_BASELINE);
  return clampVelocity(NOTE_VELOCITY_BASELINE + variance * width);
}

/**
 * Humanize (docs/specs/ROBOT_PERFORMANCE.md assumption 9): a function from a robot id to how many seconds early or
 * late its note lands this tick, within ± humanizeMs. The roster is fetched ONCE here, per processMelodyStep call,
 * not once per note; the per-robot work is a find over the roster and one `performanceRoll(seed, 'humanize',
 * position)` draw (T20), uniform and independent across robots and ticks, so a unison smears rather than shifting
 * together, and a replay repeats. The locale noise map is only checked for presence (no active locale, no offset).
 * Returns a constant 0 (and fetches nothing) when Humanize is off or there is no noise map. MIN_LEAD less the
 * largest offset still leaves 80 ms of lead, inside CLAUDE.md's 50-100 ms rule.
 */
function humanizeOffsetFor(position: number): (robotId: string) => number {
  if (humanizeMs <= 0) return () => 0;
  const noiseMap = tryGetLocaleNoiseMap(getActiveLocaleId());
  if (!noiseMap) return () => 0;
  const roster = getActiveLocaleRobots();
  const range = humanizeMs / 1000;
  return (robotId) => {
    const seed = roster.find((r) => r.id === robotId)?.compositionSeed ?? 0;
    return (performanceRoll(seed, 'humanize', position) * 2 - 1) * range;
  };
}

export const AudioEngine = {
  async start(): Promise<void> {
    if (initialized) return;

    await Tone.start();
    await loadInstruments();

    // Reverb generates its impulse response asynchronously — wait before transport starts
    await waitForGlobalReverbReady();

    const transport = Tone.getTransport();
    _transport = transport;
    // Always start audio transport at 0 so music begins at measure 0 regardless
    // of the world time. Do NOT realign transport.position with store.
    if (transport.state !== 'started') {
      await transport.start();
    }

    // Prime the LFO Bank from the current seeded state and link every global target with its
    // stored link (docs/specs/LFO_BANK.md) — this is the one point guaranteed to run after
    // Tone.start()/transport.start() have succeeded, so it's the only safe place to construct the
    // underlying Tone.LFO lane nodes. AS-sync's regenerateLfoBankFromSeed/
    // regenerateGlobalLfoLinksFromSeed (audioStore.ts) are deliberately data-only for exactly this
    // reason — they run before any user gesture.
    // Dynamic import, deliberately: audioStore.ts's GLOBAL_SETTER reads AudioEngine.setGlobal*
    // eagerly at its own module scope (see this function's own earlier verified-by-trying note),
    // and lfoEngine.ts imports AudioEngine itself (for its modulation-target resolvers) — a static
    // top-level import of either here would be circular/premature.
    try {
      const { useAudioStore, applyGlobalAudioToEngine } = await import('../stores/audioStore');
      const { lfoEngine } = await import('./lfoEngine');
      const { globalAudio, lfoBank, globalLfoLinks, bpm } = useAudioStore.getState();
      // buildGlobalFxChain() (above) just constructed every FX node from its
      // own hardcoded literal defaults — not whatever's already seeded in
      // globalAudio. regenerateGlobalAudioFromSeed's own push (AS-sync,
      // module load) ran long before these nodes existed, so it landed as a
      // no-op; re-apply the current state now that real nodes exist. Must
      // run before the link loop below: linkTarget's swing math reads each
      // target's CURRENT value, so EQ/filter values need to be correct first.
      applyGlobalAudioToEngine(globalAudio, bpm);
      // The engine is Hz-only: a synced lane is primed at its note's Hz at the current tempo, with
      // `sync` stripped (docs/specs/FREE_SYNC_TOGGLE.md §1.3).
      lfoEngine.primeLfoBank(resolveLfoBankForEngine(lfoBank, bpm));
      for (const target of GLOBAL_LFO_TARGET_IDS) {
        lfoEngine.linkTarget(target, globalLfoLinks[target]);
      }
    } catch (err) {
      devWarn('[AudioEngine] priming the LFO bank failed', err);
    }

    // Robot half of the same priming: a robot that spawned before AudioEngine was initialized
    // already had its composite voice reserved by the post-load reservation pass in
    // loadInstruments() above, but nothing linked its seeded lane links into the bank until now.
    // Runs after the bank priming above for the same reason that block's own comment gives:
    // linkTarget's swing math reads live state. Dynamic import for the same reason as lfoBank.ts
    // above — robotLfoLinks.ts imports it.
    try {
      const { primeRosterLinks } = await import('../systems/robotLfoLinks');
      primeRosterLinks(getActiveLocaleRobots());
    } catch (err) {
      devWarn('[AudioEngine] priming robot LFO links failed', err);
    }

    initBeatClock(transport);
    startMelodyPlayback();
    scheduleHarmonyCycle();

    initialized = true;
  },

  stop(): void {
    const transport = _transport ?? Tone.getTransport();

    if (scheduledTickId !== null) {
      try { transport.clear(scheduledTickId); } catch (err) { devWarn('[AudioEngine] transport.clear failed', err); }
      scheduledTickId = null;
    }

    stopHarmonyCycle();

    try {
      if (transport.state === 'started') {
        try { transport.stop(); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }

    stepCounter = 0;
    activeVoices = 0;
    initialized = false;
  },

  /**
   * Schedule a note using NoteParams. If `adsr` are not provided
   * the robot's current `audioAttributes` are looked up in the store and
   * applied at scheduling time.
   */
  scheduleNote(params: NoteParams): void {
    const { robotId, note, duration, time } = params;
    let effectiveVelocity = params.velocity;

    // The active locale's robots, looked up once per note: the velocity roll reads this robot's
    // compositionSeed and Dynamics, and the audioMode policy below reads the whole roster.
    let localeRobots: Robot[] = [];
    try {
      localeRobots = getActiveLocaleRobots();
    } catch (err) {
      devWarn('[AudioEngine] scheduleNote.getActiveLocaleRobots failed', err);
    }
    const robotFromStore = localeRobots.find((r) => r.id === robotId);

    if (robotId && effectiveVelocity === undefined) {
      // No masterVolume lookup needed here anymore — overall robot loudness is the live bus gain's
      // job (reserveVoice's masterVolume parameter, updateRobotMasterVolume), not per-note velocity.
      effectiveVelocity = computeNoteVelocitySeeded(robotId, params.position, robotFromStore);
    }

    if (params.accentMultiplier !== undefined && effectiveVelocity !== undefined) {
      effectiveVelocity = Math.min(1, effectiveVelocity * params.accentMultiplier);
    }

    // Enforce audioMode policies (mute/solo/highlight) at schedule time.
    try {
      const anyHighlight = localeRobots.some((r) => r.audioMode === 'highlight');
      if (anyHighlight && robotFromStore?.audioMode !== 'highlight') {
        // Apply ~50% attenuation (~-6dB) to non-highlighted robots
        effectiveVelocity = (effectiveVelocity ?? 1) * 0.5;
      }
    } catch (err) {
      devWarn('[AudioEngine] scheduleNote.audioMode failed', err);
    }

    triggerWithCap({ robotId, note, duration, time, velocity: effectiveVelocity });
  },

  /**
   * Reserve a composite voice for a robot from a LayeredWave descriptor.
   * Creates per-robot bus nodes (panner → gain → filter → compressor).
   * Returns true if reserved, false if creation failed.
   *
   * @param robotId - Robot ID
   * @param descriptor - LayeredWave descriptor from the robot's audioAttributes. Any layer with
   *   `gain === 0` (Roadmap Phase 9 — Coaxial/Harmonic muted, not deleted; no separate `active`
   *   flag) is excluded from the composite voice actually built: no synth node is created for it,
   *   though its full config stays in `Robot` state untouched. A layer with no `gain` field at
   *   all is treated as audible, for backward compatibility with fixtures/callers that predate
   *   a real value.
   * @param adsr - The robot's one shared ADSR envelope (Roadmap Phase 9), applied identically to
   *   every included layer's synth at construction — the same "one shared value applied across
   *   every layer" role `phase`/`detune`/`pulseWidth` play below.
   * @param phase - Optional oscillator phase (degrees) applied across all layers
   * @param detune - Optional detune (cents) applied across all layers
   * @param pulseWidth - Optional pulse width (0..1) applied across all layers
   * @param masterVolume - The robot's Volume slider position (0..1, Roadmap Phase 9's live-fader
   *   fix), defaulting to 1 when omitted. Passed through `volumePositionToGain` (a perceptual
   *   taper, not a raw pass-through — see volumeTaper.ts) before being applied as the initial
   *   value of the robot's live per-robot bus gain. Unlike `adsr`/`phase`/`detune`, this is not
   *   baked into any note's own trigger — it's a continuously-live AudioParam on the bus every
   *   note from this robot passes through, updatable afterward via `updateRobotMasterVolume`
   *   without re-reserving.
   * @param filterFreq - The robot's seeded `audioAttributes.filterFreq` (Hz): the cutoff of the
   *   per-robot bus low-pass (`composite.output → panner → busGain → busFilter → chain entry`).
   *   The same number once drove the hand-drawn robots' body detail and greeble count; gem
   *   robots (Phase 39) give it no visual mapping. `0` opens the filter fully ("no filter", Robot.ts);
   *   omitted keeps the legacy fixed 1,200 Hz so older callers/fixtures sound as before.
   * @param articulation - The robot's optional `portamento` (seconds of glide per layer synth), `filterQ`
   *   and `filterType` (the bus filter's resonance and shape). Every field absent resolves to the sound
   *   this engine always had: no glide, Q 1, lowpass. docs/specs/ROBOT_ARTICULATION.md §1.3.
   */
  reserveVoice(
    robotId: string,
    descriptor: OscillatorLayer[] | { base?: WaveformType; layers?: OscillatorLayer[] },
    adsr: ADSREnvelope,
    phase?: number,
    detune?: number,
    pulseWidth?: number,
    masterVolume?: number,
    filterFreq?: number,
    articulation?: { portamento?: number; filterQ?: number; filterType?: RobotFilterType },
  ): boolean {
    try {
      const audibleDescriptor = filterAudibleLayers(descriptor);
      const composite = AudioEngine.createCompositeVoice(audibleDescriptor, adsr, articulation?.portamento);

      const PannerCtor = getToneCtor<Tone.Panner>('Panner');
      const GainCtorLocal = getToneCtor<Tone.Gain>('Gain');
      const FilterCtor = getToneCtor<Tone.Filter>('Filter');

      const initialBusGain = volumePositionToGain(masterVolume ?? 1);
      const busCutoff = resolveBusFilterCutoff(filterFreq);
      const panner = PannerCtor ? new PannerCtor({ pan: 0 }) : makeStubPanner() as unknown as Tone.Panner;
      const busGain = GainCtorLocal ? new GainCtorLocal(initialBusGain) : makeStubGain(initialBusGain) as unknown as Tone.Gain;
      // The sends start at 0 (dry); every reservation site primes them from the store afterwards.
      const sends = buildSendGains(GainCtorLocal);
      const busFilter = FilterCtor ? new FilterCtor({
        frequency: busCutoff,
        Q: resolveBusFilterQ(articulation?.filterQ),
        type: resolveBusFilterType(articulation?.filterType),
      }) : makeStubFilter() as unknown as Tone.Filter;

      // Connect graph: composite.output -> panner -> busGain -> busFilter -> master compressor/destination
      try { composite.output.connect(panner); } catch (e) { devWarn('[AudioEngine] composite.output.connect failed', e); }
      try { (panner as unknown as { connect?: (target?: unknown) => unknown }).connect?.(busGain); } catch (e) { devWarn('[AudioEngine] panner.connect failed', e); }
      try { (busGain as unknown as { connect?: (target?: unknown) => unknown }).connect?.(busFilter); } catch (e) { devWarn('[AudioEngine] busGain.connect failed', e); }
      try {
        const chainEntry = getGlobalChainEntry();
        if (chainEntry) {
          (busFilter as unknown as { connect?: (target?: unknown) => unknown }).connect?.(chainEntry);
        } else {
          (busFilter as unknown as { toDestination?: () => unknown }).toDestination?.();
        }
      } catch (e) {
        devWarn('[AudioEngine] busFilter connection failed', e);
      }
      // Wet path: busFilter (post-Volume, post-bus-filter) -> send -> room, one send per ROBOT_SENDS row. The dry link
      // above is untouched, so at send 0 the only way into a room is through these gains. A room that does not exist
      // (headless, or before the FX chain is built) simply gets no connection.
      try {
        const busFilterOut = busFilter as unknown as { connect?: (target?: unknown) => unknown };
        for (const { engineKey } of ROBOT_SENDS) {
          busFilterOut.connect?.(sends[engineKey]);
          const target = sendTargetOf(engineKey);
          if (target) sends[engineKey].connect(target);
        }
      } catch (e) {
        devWarn('[AudioEngine] send connection failed', e);
      }

      storeVoice(robotId, { composite, panner, busGain, busFilter, sends });
      // Apply optional top-level detune/phase/pulseWidth across composite layers when provided
      try {
        if (typeof detune === 'number' || typeof phase === 'number' || typeof pulseWidth === 'number') {
          // Must match audibleDescriptor (what createCompositeVoice actually built), not the raw
          // descriptor, so this index-matched application lands on the right layer.
          const effectiveLayers = Array.isArray(audibleDescriptor)
            ? audibleDescriptor
            : (audibleDescriptor.layers && audibleDescriptor.layers.length > 0 ? audibleDescriptor.layers : [{ type: audibleDescriptor.base ?? 'sine', gain: 1, detune: 0, phase: 0 } as OscillatorLayer]);
          const layersParam = effectiveLayers.map((l) => ({
            type: l.type,
            detune: typeof detune === 'number' ? (l.detune ?? 0) + detune : undefined,
            phase: typeof phase === 'number' ? phase : undefined,
            pulseWidth: typeof pulseWidth === 'number' ? pulseWidth : l.pulseWidth,
          }));
          composite.set({ layers: layersParam as Partial<OscillatorLayer>[] });
        }
      } catch (e) {
        devWarn('[AudioEngine] Failed to apply composite phase/detune/width at reservation time', e);
      }
      return true;
    } catch (err) {
      devWarn('[AudioEngine] Failed to create composite voice:', err);
      // Fall back to a minimal, test-friendly composite stub so callers can reserve and trigger safely
      const stubComposite = {
        output: ({ connect: () => { } } as MinimalToneNode) as unknown as Tone.Gain,
        triggerAttackRelease: (_note: string, _dur: NoteDuration | string, _time?: number, _vel?: number) => { },
        set: (_params: unknown) => { },
        dispose: () => { },
      } as unknown as CompositeVoice;
      const panner = makeStubPanner() as unknown as Tone.Panner;
      const busGain = makeStubGain(volumePositionToGain(masterVolume ?? 1)) as unknown as Tone.Gain;
      const busFilter = makeStubFilter() as unknown as Tone.Filter;
      storeVoice(robotId, { composite: stubComposite, panner, busGain, busFilter, sends: buildSendGains(undefined) });
      return false;
    }
  },

  /** Release a robot's composite voice and clean up its bus nodes. */
  releaseVoice(robotId: string): void {
    const comp = compositeVoices.get(robotId);
    if (!comp) return;
    disposeVoiceNodes(comp);
    compositeVoices.delete(robotId);
    unfeedRooms(robotId);
    robotNoteIndex.delete(robotId);
    lastPanByRobot.delete(robotId);
    manualPanByRobot.delete(robotId);
    useRobotPanReadoutStore.getState().clearPan(robotId);
  },

  /** Return the composite voice reserved for a robot, or null if none. */
  getVoiceForRobot(robotId?: string): CompositeVoice | null {
    if (!robotId) return null;
    return compositeVoices.get(robotId)?.composite ?? null;
  },

  /**
   * Resolve the live, connectable Tone Signal/Param for a robot-level LFO
   * modulation target (docs/tasks/LFO_INTEGRATION_PLAN.md Task 9). Returns
   * null — never throws — for: an unreserved robotId, an out-of-range layer
   * index, and any id outside the current RobotLfoTargetId set — including
   * the removed 'volume', 'layerN.pulseWidth' (docs/specs/LFO_LOAD_FIX.md
   * assumption 9) and 'layerN.phase' (docs/specs/LFO_BANK.md Task 1 — Tone.js
   * never had a live Signal for oscillator phase in the first place) targets,
   * which can still arrive as strings from an old session or share link and
   * must decline like any unknown id.
   */
  getRobotModulationTarget(robotId: string, target: RobotLfoTargetId): ModulationTarget | null {
    try {
      const voice = AudioEngine.getVoiceForRobot(robotId);
      if (!voice) return null;

      if (target === 'bus.frequency') {
        return (compositeVoices.get(robotId)?.busFilter.frequency as ModulationTarget | undefined) ?? null;
      }

      const match = /^layer(\d+)\.(gain|detune)$/.exec(target);
      if (!match) return null;
      const layerEntry = voice.layers?.[Number(match[1])];
      if (!layerEntry) return null;
      const field = match[2];

      if (field === 'gain') {
        const gain = (layerEntry.gainNode as unknown as { gain?: unknown })?.gain;
        return (gain as ModulationTarget | undefined) ?? null;
      }
      const osc = (layerEntry.synth as unknown as { oscillator?: { detune?: unknown } })?.oscillator;
      return (osc?.detune as ModulationTarget | undefined) ?? null;
    } catch (err) {
      devWarn('[AudioEngine] getRobotModulationTarget failed', err);
      return null;
    }
  },

  /**
   * Resolve the live, connectable Tone Signal/Param for a global-chain LFO
   * modulation target. Implementation lives in
   * src/engine/audioEngine/globalFx.ts — this is a direct reference to that
   * module's export, kept on the public AudioEngine surface.
   */
  getGlobalModulationTarget,

  /**
   * Deterministic re-reservation helper used by UI/store updates.
   * Reads the robot's current `audioAttributes` from the locale store,
   * calls `releaseVoice(robotId)` then `reserveVoice(...)` with the
   * freshly-read `phase`, `detune`, and `pulseWidth` values so
   * updates from the store are applied immediately to the reserved voice.
   * Returns true when reservation succeeded.
   */
  reReserveVoice(robotId: string): boolean {
    try {
      const robot = findActiveRobot(robotId);
      if (!robot) return false;
      const layers = (robot.audioAttributes as unknown as { layers?: OscillatorLayer[] })?.layers;
      if (!Array.isArray(layers) || layers.length === 0) return false;

      AudioEngine.releaseVoice(robotId);
      const reserved = AudioEngine.reserveVoice(
        robotId,
        layers,
        robot.audioAttributes.adsr,
        robot.audioAttributes?.phase,
        robot.audioAttributes?.detune,
        (robot.audioAttributes as unknown as { layers?: OscillatorLayer[] })?.layers?.[0]?.pulseWidth,
        robot.masterVolume,
        robot.audioAttributes?.filterFreq,
        articulationOf(robot),
      );
      // releaseVoice just cleared this robot's manual pan; hand it back from the store (Robot Pan §1.3).
      // Done here, not by the caller, so every reReserveVoice caller is covered.
      if (robot.panAuto === false) AudioEngine.updateRobotPan(robotId, robot.pan);
      // And the rebuilt voice's send gains start at 0, so hand them back too (Robot Sends §1.4).
      AudioEngine.updateRobotSends(robotId, robotSendLevels(robot));
      return reserved;
    } catch (err) {
      devWarn('[AudioEngine] reReserveVoice failed', err);
      return false;
    }
  },

  /**
   * Apply updated continuous-layer parameters to a reserved CompositeVoice
   * without rebuilding the underlying node graph.
   *
   * Two-tier update rule (documented):
   * - Continuous params (gain, detune, phase, pulseWidth): use this method — instant, no gap in audio.
   * - Structural changes (type/waveform, add/delete layer): use `reReserveVoice` — may cause brief silence.
   */
  updateVoiceLayerParams(robotId: string, layers: OscillatorLayer[]): void {
    try {
      const entry = compositeVoices.get(robotId);
      if (!entry) {
        devWarn(`[AudioEngine] updateVoiceLayerParams: no composite reserved for ${robotId}`);
        return;
      }

      try {
        // Pass the full layers array as required by the composite.set contract
        entry.composite.set({ layers: layers as Partial<OscillatorLayer>[] });
      } catch (err) {
        devWarn('[AudioEngine] Failed to apply layer params on composite', err);
      }
    } catch (err) {
      devWarn('[AudioEngine] updateVoiceLayerParams failed', err);
    }
  },

  /**
   * Apply an updated shared ADSR envelope to every audible layer's live synth, without rebuilding
   * the underlying node graph (Roadmap Phase 9 — Ping Contour drawer's live edits).
   *
   * Reuses the exact same continuous-update path `updateVoiceLayerParams` already uses: rebuilds
   * the layers-patch from the composite's already-exposed `layers` (each entry's own current
   * config, since only audible — `gain !== 0` — layers were ever given a synth in the first
   * place) with the new `adsr` stamped onto every entry, then calls `composite.set({ layers })` — the same
   * `p.adsr → synth.set({ envelope: p.adsr })` path `compositeVoice.ts` already applies for a
   * continuous param edit. No structural change, no audio gap.
   */
  updateVoiceEnvelope(robotId: string, adsr: ADSREnvelope): void {
    try {
      const entry = compositeVoices.get(robotId);
      if (!entry?.composite.layers) {
        devWarn(`[AudioEngine] updateVoiceEnvelope: no composite reserved for ${robotId}`);
        return;
      }
      try {
        const patched = entry.composite.layers.map(({ layer }) => ({ ...layer, adsr }));
        entry.composite.set({ layers: patched });
      } catch (err) {
        devWarn('[AudioEngine] Failed to apply envelope on composite', err);
      }
    } catch (err) {
      devWarn('[AudioEngine] updateVoiceEnvelope failed', err);
    }
  },

  /**
   * Set the glide time (seconds) on every audible layer's live synth - updateVoiceEnvelope's shape: the
   * composite's own layers re-stamped with the new value and handed back through `composite.set`, so no
   * node is rebuilt and nothing is cut off. 0 turns the glide off. A safe no-op (devWarn) when no composite
   * is reserved: the store holds the value and every reservation path re-reads it.
   */
  updateVoicePortamento(robotId: string, seconds: number): void {
    try {
      const entry = compositeVoices.get(robotId);
      if (!entry?.composite.layers) {
        devWarn(`[AudioEngine] updateVoicePortamento: no composite reserved for ${robotId}`);
        return;
      }
      try {
        const patched = entry.composite.layers.map(({ layer }) => ({ ...layer, portamento: seconds }));
        entry.composite.set({ layers: patched });
      } catch (err) {
        devWarn('[AudioEngine] Failed to apply portamento on composite', err);
      }
    } catch (err) {
      devWarn('[AudioEngine] updateVoicePortamento failed', err);
    }
  },

  /**
   * Live-edit a robot's bus filter (docs/specs/ROBOT_ARTICULATION.md §1.3), any subset of cutoff `frequency`
   * (Hz), resonance `Q` and `type`. Frequency and Q glide over FILTER_RAMP_SECONDS when the live param can
   * ramp, else are assigned (headless); `type` is assigned outright. A safe no-op (devWarn, as
   * updateRobotMasterVolume) when no composite is reserved: the store already holds the values.
   */
  updateRobotBusFilter(robotId: string, patch: { frequency?: number; Q?: number; type?: RobotFilterType }): void {
    const entry = compositeVoices.get(robotId);
    if (!entry) {
      devWarn(`[AudioEngine] updateRobotBusFilter: no composite reserved for ${robotId}`);
      return;
    }
    try {
      const filter = entry.busFilter as unknown as { frequency: RampableParam; Q: RampableParam; type: string };
      if (patch.frequency !== undefined) rampOrSet(filter.frequency, patch.frequency, FILTER_RAMP_SECONDS);
      if (patch.Q !== undefined) rampOrSet(filter.Q, patch.Q, FILTER_RAMP_SECONDS);
      if (patch.type !== undefined) filter.type = patch.type;
    } catch (err) {
      devWarn('[AudioEngine] updateRobotBusFilter failed', err);
    }
  },

  /**
   * Immediately updates a robot's live per-robot bus gain (Robot Options' RobotDisplaySection
   * Volume slider) — a continuously-live AudioParam, not a value baked into each note's own
   * trigger, so this affects anything currently sounding through the bus (an already-ringing
   * note's release tail included), not just the next note this robot happens to play. `masterVolume`
   * is the 0..1 slider position, passed through `volumePositionToGain` first — a linear position
   * applied directly as gain would feel almost flat across most of the fader (human loudness
   * perception is roughly logarithmic), so the actual gain follows a perceptual taper instead;
   * see volumeTaper.ts. Ramps over a short duration when the live Tone.Gain param supports it, to
   * avoid an audible click; falls back to a direct value assignment in headless/test environments
   * where it doesn't. A safe no-op (with a devWarn, matching updateVoiceLayerParams/
   * updateVoiceEnvelope's existing pattern) when no composite voice is reserved for the robot.
   */
  updateRobotMasterVolume(robotId: string, masterVolume: number): void {
    const entry = compositeVoices.get(robotId);
    if (!entry) {
      devWarn(`[AudioEngine] updateRobotMasterVolume: no composite reserved for ${robotId}`);
      return;
    }
    try {
      const targetGain = volumePositionToGain(masterVolume);
      rampOrSet(entry.busGain.gain as unknown as RampableParam, targetGain, VOLUME_RAMP_SECONDS);
    } catch (err) {
      devWarn('[AudioEngine] updateRobotMasterVolume failed', err);
    }
  },

  /**
   * Robot Sends (docs/specs/ROBOT_SENDS.md §1.4): ramp a robot's send gains into the global Reverb and Delay
   * rooms. Either key may be omitted; a value is clamped to [SEND_MIN, SEND_MAX] and a NaN is ignored (it has
   * no sensible clamp), so one bad key never blocks the other. Ramps over SEND_RAMP_SECONDS on `rampTo` when the
   * live param supports it, else sets `.value` (headless). A safe no-op (devWarn, as updateRobotMasterVolume)
   * when no composite is reserved: the store already holds the value and every reservation site re-primes it.
   * Robot Effect Sends (docs/specs/ROBOT_EFFECT_SENDS.md §1.4): `grit`, `shimmer` and `double` ramp the effect room
   * sends the same way, and each also moves the robot in or out of its room's feeder set (roomFeeders).
   * One loop in table order whatever order the caller built `sends` in (docs/specs/ROBOT_SEND_TABLE.md §1.2).
   */
  updateRobotSends(
    robotId: string,
    sends: Partial<Record<SendEngineKey, number>>,
  ): void {
    const entry = compositeVoices.get(robotId);
    if (!entry) {
      devWarn(`[AudioEngine] updateRobotSends: no composite reserved for ${robotId}`);
      return;
    }
    try {
      for (const { engineKey: key } of ROBOT_SENDS) {
        const requested = sends[key];
        if (requested === undefined || Number.isNaN(requested)) continue;
        const level = clampSend(requested);
        rampOrSet(entry.sends[key].gain as unknown as RampableParam, level, SEND_RAMP_SECONDS);
        // Reverb and Delay are fixed rooms with no feeder set; the three effect rooms light only while someone feeds them.
        if (isRoomSendKey(key)) setRoomFeeder(key, robotId, level > 0);
      }
    } catch (err) {
      devWarn('[AudioEngine] updateRobotSends failed', err);
    }
  },

  /**
   * Robot Pan (docs/specs/ROBOT_PAN.md §1.3). With a number (Auto off): pin the robot's panner there
   * (full −1…1, wider than the Auto field's ±0.5) and stop updateAllPanners touching it. With `null`
   * (Auto on): ramp to the position-follow pan the robot has right now, seed lastPanByRobot with it so
   * the tick's epsilon gate resumes without a second jump, publish it to the readout store, and hand the
   * robot back to the tick. Only the panner is affected — the robot itself keeps moving either way.
   * Ramps over PAN_RAMP_SECONDS on `rampTo` when the live param supports it, else sets `.value`
   * (headless). A safe no-op (devWarn, as updateRobotMasterVolume) when no composite is reserved: the
   * store already holds the value, and every reservation site re-primes a manual robot from it.
   */
  updateRobotPan(robotId: string, value: number | null): void {
    const entry = compositeVoices.get(robotId);
    if (!entry) {
      devWarn(`[AudioEngine] updateRobotPan: no composite reserved for ${robotId}`);
      return;
    }
    try {
      let target: number;
      if (value === null) {
        manualPanByRobot.delete(robotId);
        target = calculatePanFromPosition(getRobotVisualX(robotId));
        lastPanByRobot.set(robotId, target);
        useRobotPanReadoutStore.getState().setPan(robotId, target);
      } else {
        manualPanByRobot.set(robotId, value);
        // A stale Auto value must not linger: getLivePan would hand it to applyPanAuto(false) as if it
        // were this robot's pan, and the tick's epsilon gate must not short-circuit its first write.
        lastPanByRobot.delete(robotId);
        target = value;
      }
      rampOrSet(entry.panner.pan as unknown as RampableParam, target, PAN_RAMP_SECONDS);
    } catch (err) {
      devWarn('[AudioEngine] updateRobotPan failed', err);
    }
  },

  /**
   * The pan the tick last wrote for a robot under Auto (−0.5…0.5): what the Pan slider shows, and what
   * Auto-off turns into the robot's own `pan`. `undefined` before the first write, while the robot is
   * manual, and after releaseVoice. A pure map read — never touches the DOM. docs/specs/ROBOT_PAN.md §1.3.
   */
  getLivePan(robotId: string): number | undefined {
    return lastPanByRobot.get(robotId);
  },

  /**
   * Create a composite voice made of multiple oscillator layers.
   * Construction itself lives in src/engine/audioEngine/compositeVoice.ts — this is a
   * direct reference to that module's export, kept on the public AudioEngine surface
   * so every existing call site (AudioEngine.createCompositeVoice(...)) still works.
   */
  createCompositeVoice,

  /**
   * Register or replace a robot's melody used by the engine's playback scheduler.
   *
   * Behavior:
   * - Replaces any previously-registered events for `robotId` in the internal
   *   `stepRegistry` so subsequent scheduler ticks will use the new melody.
   * - This method is safe to call from the main thread; it mutates module-scoped
   *   registry data but does not touch the Tone.Transport scheduling directly.
   * - The scheduler reads `stepRegistry` on the transport tick; callers should
   *   expect the new melody to take effect on the next scheduled tick after
   *   registration.
   * - When the robot's own `clickTrackActive` flag (Robot.ts) is true, `melody` is ignored
   *   entirely and the fixed click-track pattern (src/engine/clickTrack.ts) is registered
   *   instead — enforced *here*, the one funnel every melody-registration call site shares
   *   (spawn, Reset Melody, Density/Motif/Note Variance edits, docking's pitch-drift reroll,
   *   this file's own per-loop rhythmic/tonal variance), rather than trusting each call site to
   *   remember to check the flag itself. See docs/MELODY_SYSTEM.md's Click Track note.
   *
   * @param robotId - Unique robot identifier
   * @param melody - Array of `MelodyEvent` describing start steps and notes; superseded by
   *   the click-track pattern while this robot's `clickTrackActive` is true.
   */
  registerRobotMelody(robotId: string, melody: MelodyEvent[]): void {
    // Purge any existing entries for this robot before adding new ones so this
    // method is idempotent regardless of call site — prevents duplicate triggers.
    stepRegistry.forEach((entries, step) => {
      const filtered = entries.filter((e) => e.robotId !== robotId);
      if (filtered.length !== entries.length) {
        if (filtered.length > 0) {
          stepRegistry.set(step, filtered);
        } else {
          stepRegistry.delete(step);
        }
      }
    });

    const robot = findActiveRobot(robotId);
    const effectiveMelody = robot?.clickTrackActive
      ? buildClickTrackMelody(robot.octaveRange[0])
      : melody;

    // Motif-group accent: computed once here (not per-tick) so it stays off the
    // scheduling hot path. Only meaningful when the robot's Motif Length toggle
    // is active — scatter mode has no repeat windows to accent. Skipped entirely for the
    // click track — it's a flat, unaccented test pulse, not the robot's own motif structure.
    const motif = robot?.rhythmicMotifLength;
    const accentedStartSteps = new Set<number>();
    if (motif?.active && !robot?.clickTrackActive) {
      const windowLength = Math.max(1, motif.value);
      const earliestInWindow = new Map<number, number>(); // window index -> earliest startStep
      effectiveMelody.forEach((event) => {
        const windowIndex = Math.floor((event.startStep - 1) / windowLength);
        const current = earliestInWindow.get(windowIndex);
        if (current === undefined || event.startStep < current) {
          earliestInWindow.set(windowIndex, event.startStep);
        }
      });
      earliestInWindow.forEach((step) => accentedStartSteps.add(step));
    }

    const clickTrack = robot?.clickTrackActive === true;
    effectiveMelody.forEach((event) => {
      const entries = stepRegistry.get(event.startStep) || [];
      entries.push({ robotId, event, isGroupAccent: accentedStartSteps.has(event.startStep), ...(clickTrack ? { clickTrack: true } : {}) });
      stepRegistry.set(event.startStep, entries);
    });
  },

  unregisterRobotMelody(robotId: string): void {
    robotNoteIndex.delete(robotId);

    stepRegistry.forEach((entries, step) => {
      const filtered = entries.filter((e) => e.robotId !== robotId);

      if (filtered.length > 0) {
        stepRegistry.set(step, filtered);
      } else {
        stepRegistry.delete(step);
      }
    });
  },

  /**
   * Test helper: return the currently registered melody events for a robot.
   * This exposes a read-only snapshot of the internal `stepRegistry` for tests.
   */
  getRegisteredMelody(robotId: string): MelodyEvent[] {
    const out: MelodyEvent[] = [];
    stepRegistry.forEach((entries) => {
      entries.forEach((e) => {
        if (e.robotId === robotId) out.push(e.event);
      });
    });
    return out;
  },

  /**
   * Process a single melody step: invokes `AudioEngine.scheduleNote` for every registered
   * event whose `startStep` equals `currentStep`, with the motif-group accent applied.
   *
   * This IS the live per-step loop — startMelodyPlayback's 16n transport tick calls it
   * directly. It used to be a test-only mirror of a second copy inside the tick, and the two
   * drifted (the live copy dropped `isGroupAccent`, so the accent never played in the app).
   * Tests drive it directly because it's synchronous and transport-free.
   *
   * @param currentStep - 1..16 step to process
   * @param time - absolute AudioContext time passed through from transport
   */
  processMelodyStep(currentStep: number, time: number): void {
    const events = stepRegistry.get(currentStep) || [];
    const notes = getAvailableNotes();
    // Robot Performance: the tick position every roll keys off (velocity, Humanize). The live tick calls this
    // before advancing stepCounter, so it is the number of ticks since playback started.
    const position = stepCounter;
    const humanizeOffset = humanizeOffsetFor(position);

    events.forEach(({ robotId, event, isGroupAccent, clickTrack }) => {
      // Each event is isolated in its own try/catch — an uncaught exception from one robot's
      // scheduleNote call must not abort the forEach and silently drop every remaining event
      // in this same step.
      try {
        const noteName = notes[event.noteIndex];
        if (!noteName) {
          devWarn(`[AudioEngine] Invalid note index ${event.noteIndex} for robot ${robotId}`);
          return;
        }
        const octave = event.octave ?? 4;
        const note = `${noteName}${octave}`;

        // What the event's rest and mark mean (docs/specs/ROBOT_PERFORMANCE.md §1.3): a sounding-length factor
        // and a velocity multiplier. An unstamped event keeps its NoteDuration string exactly as before; a
        // shortened one becomes seconds at the live tempo, floored so it never collapses to a click and
        // never longer than the note as written.
        const art = resolveArticulation(event);
        let duration: NoteDuration | number = event.length;
        if (art.length < 1) {
          const writtenSeconds = Tone.Time(event.length).toSeconds();
          duration = Math.min(writtenSeconds, Math.max(MIN_SOUNDING_SECONDS, writtenSeconds * art.length));
        }
        const accentMultiplier = (isGroupAccent ? GROUP_ACCENT_MULTIPLIER : 1) * art.velocity;

        AudioEngine.scheduleNote({
          robotId,
          note,
          duration,
          time: time + MIN_LEAD + (clickTrack ? 0 : humanizeOffset(robotId)),
          accentMultiplier: accentMultiplier === 1 ? undefined : accentMultiplier,
          position,
        });
      } catch (err) {
        devWarn(`[AudioEngine] Failed to schedule note for robot ${robotId}`, err);
      }
    });
  },



  getPolyphonyStats(): { voices: number; maxVoices: number; step: number } {
    return {
      voices: activeVoices,
      maxVoices: polyphonyCap,
      step: (stepCounter % 16) + 1,
    };
  },

  /**
   * Audio Load Budget: the robots allowed to sound. Standing-by robots are refused in triggerWithCap (no
   * trigger, no polyphony slot). `null` lifts the restriction; an empty list silences everyone. Copies the
   * ids, so later mutation of the caller's array changes nothing. Survives killAll() (a power cycle).
   */
  setSoundingRobots(ids: Iterable<string> | null): void {
    soundingRobots = ids === null ? null : new Set(ids);
  },

  /**
   * Audio Load Budget: the simultaneous-note ceiling, clamped to [0, MAX_POLYPHONY] (NaN → MAX_POLYPHONY).
   * Applies to NEW triggers only — lowering it below the notes already sounding never forcibly releases
   * them (that could strand the voice counter); the counter drains as each release fires. Survives killAll().
   */
  setPolyphonyCap(cap: number): void {
    polyphonyCap = Number.isNaN(cap) ? MAX_POLYPHONY : Math.min(MAX_POLYPHONY, Math.max(0, Math.floor(cap)));
  },

  /**
   * Humanize: how far off the grid, in milliseconds, a note may land (docs/specs/ROBOT_PERFORMANCE.md assumption 9).
   * Clamped to [HUMANIZE_MIN_MS, HUMANIZE_MAX_MS]; NaN reads as 0 (machine-exact). Applies from the next tick.
   * Survives killAll() (a power cycle): the store is the source of truth and pushes it, like the polyphony cap.
   */
  setHumanize(ms: number): void {
    humanizeMs = Number.isNaN(ms) ? HUMANIZE_MIN_MS : Math.min(HUMANIZE_MAX_MS, Math.max(HUMANIZE_MIN_MS, ms));
  },

  /** Returns the current AudioContext time (seconds). Use for note scheduling offsets. */
  now(): number {
    return Tone.now();
  },

  /**
   * Update Tone.Transport BPM. No-op if AudioEngine has not been started
   * (audio context not yet running) to avoid errors in headless environments.
   *
   * Deliberately an instant assignment, not a ramp. BPM/tempo isn't a
   * continuously-summed audio signal like Gain — it only governs when
   * future notes get scheduled, so an instant change doesn't produce a
   * click the way an instant Gain jump does; there's nothing here for a
   * ramp to protect against. Worse, a ramp actively hurts: the Audio Rig
   * Tempo slider's onChange fires continuously during a drag (Radix's
   * onValueChange, not onValueCommit), far more often than any short ramp
   * could complete — each call would cancel the previous still-in-flight
   * ramp and restart a new one (Tone.Param.rampTo's own
   * cancelAndHoldAtTime behavior), so the tempo would never actually
   * settle for the whole drag gesture. That's exactly what surfaced as a
   * real, reported bug: the beat became audibly unstable ("wishy-washy",
   * no locatable downbeat) while dragging, not just "different." Standard
   * DAW behavior — and this function's own original pre-ramp shape —
   * applies tempo changes instantly for the same reason.
   */
  setBPM(bpm: number): void {
    if (!initialized) return;
    const transport = _transport ?? Tone.getTransport();
    try {
      transport.bpm.value = bpm;
    } catch (err) { devWarn('[AudioEngine] setBPM failed', err); }
  },

  /** Pause transport without resetting position (soft pause). */
  pause(): void {
    try {
      const transport = _transport ?? Tone.getTransport();
      transport.pause();
    } catch (err) {
      devWarn('[AudioEngine] pause failed', err);
    }
  },

  /** Resume transport from current position. */
  resume(): void {
    try {
      const transport = _transport ?? Tone.getTransport();
      transport.start();
    } catch (err) {
      devWarn('[AudioEngine] resume failed', err);
    }
  },

  /**
   * Hard stop: cancel scheduled transport events, release active voices,
   * stop transport, and reset position to 0.
   */
  killAll(): void {
    try {
      const transport = _transport ?? Tone.getTransport();
      try { transport.cancel(); } catch (err) { devWarn('[AudioEngine] transport.cancel failed', err); }

      stopHarmonyCycle();

      try {
        if (transport.state === 'started') {
          try { transport.stop(); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      try {
        try { (transport as unknown as { seconds?: number }).seconds = 0; } catch {
          try { (transport as unknown as { position?: string }).position = '0:0:0'; } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      if (scheduledTickId !== null) {
        try { transport.clear(scheduledTickId); } catch (err) { devWarn('[AudioEngine] transport.clear failed', err); }
        scheduledTickId = null;
      }

      stepCounter = 0;
      activeVoices = 0;
      initialized = false;
      // Reset beatClock so initBeatClock() re-registers its internal tick on next start.
      // transport.cancel() above cleared the old 16n tick; resetBeatClock() lets it be recreated.
      resetBeatClock();
    } catch (err) {
      devWarn('[AudioEngine] killAll failed', err);
    }
  },

  // ========================================
  // GLOBAL FX CHAIN — direct references to src/engine/audioEngine/globalFx.ts's
  // exports, kept on the public AudioEngine surface so every existing call
  // site (AudioEngine.setGlobalReverb(...), etc.) still works unchanged.
  // ========================================
  setMasterVolume,
  getMasterVolume,
  setGlobalReverb,
  setGlobalDelay,
  setGlobalFilterLPF,
  setGlobalFilterHPF,
  setGlobalEQ,
  setGlobalCompressor,
  setGlobalLimiter,
  setGlobalDistortion,
  setGlobalChebyshev,
  setGlobalBitCrusher,
  setGlobalAutoWah,
  setGlobalPhaser,
  setGlobalChorus,
  setGlobalTremolo,
  setGlobalVibrato,
  setGlobalFrequencyShifter,
  setGlobalStereoWidener,
};
