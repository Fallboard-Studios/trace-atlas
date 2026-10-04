// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import type { Vec2 } from '../types/Vec2';
import type { AudioAttributes, WaveformType, Robot, Greeble } from '../types/Robot';
import { RobotState, DockingState } from '../types/Robot';
import {
  generateMelodyForRobot,
  buildSeededComposition,
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  DEFAULT_NOTE_VARIANCE,
  DEFAULT_PITCH_REPEAT,
} from '../engine/melodyGenerator';
import type { ToggleValue } from '../engine/melodyGenerator';
import { AudioEngine } from '../engine/AudioEngine';
import type { OscillatorLayer } from '../types/layeredAudio';
import type { Company } from '../types/Company';
import {
  DEV_TUNING, MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX,
  INITIAL_COMPANIES_MIN, INITIAL_COMPANIES_MAX, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX,
} from '../constants';
import useLocaleStore from '../stores/localeStore';
import { initRobotIdleCounter } from './idleSystem';
import { primeRobotLinks, primeRosterLinks } from './robotLfoLinks';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import type { RobotLfoTargetId, LfoLaneId, LfoLink } from '../types/lfo';
import { ROBOT_LFO_TARGET_IDS, LFO_DEPTH_MIN } from '../types/lfo';
import { pickLane, tallyLanes } from '../utils/lfoLaneDraw';

// ========================================
// CONSTANTS
// ========================================
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
/** Distance outside the SVG viewBox where robots spawn before swimming on-screen. */
const OFFSCREEN_OFFSET = 150;

// ADSR ranges. Roadmap Phase 9: unified to one flat 0-5s range for attack/decay/release
// (previously mismatched per-field maxes of 2/2/5) — kept deliberately narrower than the Ping
// Contour drawer's 0-10s edit range, the same "generation range narrower than what a user can
// dial to by hand" relationship every other seeded field in this phase has.
const ATTACK_RANGE = { min: 0.0, max: 5.0 };
const DECAY_RANGE = { min: 0.0, max: 5.0 };
const SUSTAIN_RANGE = { min: 0.0, max: 1.0 };
const RELEASE_RANGE = { min: 0.0, max: 5.0 };

// Signature Array is a fixed 3-slot layer array (Roadmap Phase 9) — Baseline/Coaxial/Harmonic,
// replacing the old variable 1..MAX_LAYERS count.
const LAYER_COUNT = 3;
/** Probability threshold Coaxial's/Harmonic's own "start muted" seed draw ([0, 1]) must clear to
 *  force gain to 0 — a plain 50/50 coin flip. No product requirement pinned a specific bias; this
 *  is the least-presumptuous default for "each independently seeded on or muted." Replaces the
 *  old separate `active` boolean — see `OscillatorLayer`'s own doc comment (types/layeredAudio.ts)
 *  for why gain=0 is now the "muted" state. */
const LAYER_QUIET_THRESHOLD = 0.5;

/** Mirrors the Signature Array Gain slider's own step (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const LAYER_GAIN_STEP = 0.01;

/** Rounds each oscillator layer's Detune to a whole cent (SEEDED_SLIDER_VALUE_QUANTIZATION follow-up). */
const DETUNE_STEP = 1;

// Octave registers — seed directly without Hz indirection
// [min, max] inclusive; 3 tiers: bass, mid, treble
const OCTAVE_REGISTERS = [
  [1, 3],  // Bass (large robots)
  [2, 4],
  [3, 5],  // Mid  (normal robots)
  [4, 6],
  [5, 7],  // Treble (small robots)
] as const;

// Filter frequency range
const FILTER_FREQ_RANGE = { min: 400, max: 2500 };

// Master volume range: keep robots below full saturation
const MASTER_VOLUME_MIN = 0.65;
const MASTER_VOLUME_MAX = 0.85;
/** Mirrors the Volume slider's own step, in percent-space (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const VOLUME_STEP_PERCENT = 1;

/**
 * Fraction of rhythmicMotifLength's single seed draw ([0, 1)) that lands the field
 * off (value: 0) — 15% chance, preserving the pre-STEPPER_TO_SLIDER two-draw scheme's
 * exact off-rate (docs/specs/STEPPER_TO_SLIDER.md §7.1) now that active/value collapse
 * to one draw. A fresh robot tiles a repeating motif far more often than it scatters
 * freely.
 */
const RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD = 0.15;
/**
 * Same idea as RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD, for noteVariance's own draw.
 * Kept as its own named constant (not merged back into one shared value) so the two
 * fields stay independently tunable even though they currently agree.
 */
const NOTE_VARIANCE_OFF_THRESHOLD = 0.15;

/**
 * Seed a Motif Length/Note Variance-shaped { active, value } field from one
 * consolidated [0, 1) draw (docs/specs/STEPPER_TO_SLIDER.md) — replaces the old
 * two-draw (separate active/value) scheme. `raw < offThreshold` lands the field off
 * (value: 0); the remaining `1 - offThreshold` span maps uniformly onto value 1-8.
 * `active` is always derived from the resulting `value > 0`, never drawn independently.
 */
function seedToggleValue(raw: number, offThreshold: number): ToggleValue {
  if (raw < offThreshold) return { active: false, value: 0 };
  const fraction = (raw - offThreshold) / (1 - offThreshold); // 0..1 across the "on" span
  const value = 1 + Math.min(7, Math.floor(fraction * 8)); // 1-8
  return { active: true, value };
}

// Waveform types — even distribution gives ~20% each (includes pulse)
const WAVEFORMS: WaveformType[] = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'];

// Simple word lists for deterministic-looking robot names. ADJECTIVES is exported — reused by
// generateCompanyName below (Roadmap Phase 10), the same "sounds like this universe" half, paired
// with a distinct COMPANY_NOUNS list so a generated company name can never take the exact same
// word-pair form a robot name can (see docs/specs/COMPANIES.md §7.3).
export const ADJECTIVES = ['Iron', 'Null', 'Silent', 'Drift', 'Azure', 'Rust', 'Neon', 'Glass', 'Solar', 'Tidal'];
const NOUNS = ['Drifter', 'Tide', 'Warden', 'Seeker', 'Courier', 'Wisp', 'Beacon', 'Nomad', 'Rover', 'Pilot'];

function generateRobotName(noiseMap: NoiseFunction2D, offset: number): string {
  const a = ADJECTIVES[Math.floor(getSeededVal(noiseMap, 'robot.name.adj', offset, 0, ADJECTIVES.length))];
  const n = NOUNS[Math.floor(getSeededVal(noiseMap, 'robot.name.noun', offset, 0, NOUNS.length))];
  return `${a} ${n}`;
}

/**
 * Deterministic per-robot identity color (Roadmap Phase 14, docs/specs/
 * COLOR_SCHEME_TRAIT_THEMING.md §1.4) — UI chrome only (RobotSelectionCard/RobotDisplaySection),
 * never the SVG body's own ADSR/waveform-derived HSL fill. Same generation mechanism as
 * generateRobotName above: one getSeededVal draw against ROBOT_IDENTITY_COLOR_NAMES (the 18 hue
 * keys — black/white/darkGray are deliberately excluded there, not filtered here).
 */
function generateRobotIdentityColor(noiseMap: NoiseFunction2D, offset: number): string {
  // Clamped (matching OCTAVE_REGISTERS/WAVEFORMS' own indexing below, not generateRobotName's
  // unclamped one) since the failure mode of an out-of-range index here is a visibly broken
  // undefined CSS custom property, not just a missing name syllable.
  const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
  return ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]];
}

/** How many seeded hardware parts (docs/specs/ROBOT_GREEBLES.md) a robot gets. Tuned in the sketch. */
export const GREEBLE_COUNT_RANGE = { min: 2, max: 5 } as const;

// TEMPORARY: both constants are declared here only until Task 3/4 of ROBOT_GREEBLES.md land.
// SLOT_COUNT's canonical home is greebleSlots.ts (Task 3); KIND_COUNT's is RobotGreebles.tsx
// (Task 4) — spawnSystem.ts will import both from there instead of declaring them locally.
const SLOT_COUNT = 8;
export const KIND_COUNT = 5;

/**
 * Deterministic, permanent hardware set (Roadmap Phase 37, docs/specs/ROBOT_GREEBLES.md §1.1) —
 * same generation shape as generateRobotIdentityColor above: hardware/identity, not audio, drawn
 * once at spawn, never inherited on the copy path. A count draw, then count independent kind/slot
 * draws with slots removed from a `free` pool so no robot ever repeats a slot.
 */
function generateGreebles(noiseMap: NoiseFunction2D, spawnCount: number): Greeble[] {
  const count = Math.min(
    GREEBLE_COUNT_RANGE.max,
    Math.floor(getSeededVal(noiseMap, 'robot.greeble.count', spawnCount, GREEBLE_COUNT_RANGE.min, GREEBLE_COUNT_RANGE.max + 1))
  );
  const free = Array.from({ length: SLOT_COUNT }, (_, i) => i);
  const out: Greeble[] = [];
  for (let i = 0; i < count; i++) {
    const off = spawnCount * 10 + i;
    const kind = Math.min(KIND_COUNT - 1, Math.floor(getSeededVal(noiseMap, 'robot.greeble.kind', off, 0, KIND_COUNT)));
    const pick = Math.min(free.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.greeble.slot', off, 0, free.length)));
    out.push({ kind, slot: free.splice(pick, 1)[0] });
  }
  return out;
}

// Org-flavored noun list for company names (Roadmap Phase 10) — distinct from robot NOUNS above,
// deliberately, so a company and a robot can never generate the identical name.
export const COMPANY_NOUNS = ['Collective', 'Consortium', 'Guild', 'Division', 'Outfit', 'Crew', 'Cartel', 'Syndicate'];

/**
 * Deterministic, human-legible company name — same generation mechanism as generateRobotName
 * (ADJECTIVES + a word-list draw, same getSeededVal pattern), but exported: unlike robot names,
 * a company's suggested name is re-shown to the user at Create time (CompanyCrudControls), so it
 * needs a reuse point robot names never did.
 */
export function generateCompanyName(noiseMap: NoiseFunction2D, offset: number): string {
  const a = ADJECTIVES[Math.floor(getSeededVal(noiseMap, 'company.name.adj', offset, 0, ADJECTIVES.length))];
  const n = COMPANY_NOUNS[Math.floor(getSeededVal(noiseMap, 'company.name.noun', offset, 0, COMPANY_NOUNS.length))];
  return `${a} ${n}`;
}

/** Deterministic company ID — mirrors generateRobotId's shape (own dataId, own counter namespace,
 *  no crypto.randomUUID()). Exported (like generateCompanyName/generateCompanyIdentityColor
 *  above) so generateCompanyRosterBaseline below — and Session Storage's sessionDiff.ts, which
 *  needs a company's id to match it against a live company — can call it directly. */
export function generateCompanyId(noiseMap: NoiseFunction2D, index: number): string {
  const idSeed = getSeededVal(noiseMap, 'company.id', index, 0, 1);
  return `company-${index}-${idSeed.toString(36).slice(2, 10)}`;
}

/**
 * Deterministic per-company identity color (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.2) —
 * mirrors generateRobotIdentityColor's own clamped-index-into-ROBOT_IDENTITY_COLOR_NAMES shape,
 * with its own dataId ('company.identityColor') so it draws from a distinct row of the noise map
 * rather than sharing the robot one's seeded stream. Exported (unlike generateCompanyId) only so
 * it can be unit-tested directly — still only called from spawnInitialCompanies below.
 *
 * Reverses docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §7 item 2's "accepted, low-risk" decision
 * to skip collision-avoidance here (Roadmap: Robot Selection Filter Panel Polish §1.4) — retries
 * on collision against `usedColors` (every color already assigned to an earlier company in the
 * same spawnInitialCompanies pass), bounded at ROBOT_IDENTITY_COLOR_NAMES.length attempts, the
 * same bound CompanyCrudControls.tsx's own pickRandomCompanyColor uses for the identical problem
 * on the manual-creation path — but seeded instead of Math.random()-driven, to stay reproducible.
 * Attempt 0 uses the exact same dataId/offset pair as before this fix ('company.identityColor',
 * offset = c), so a seed that never collides produces byte-for-byte the same color it always has;
 * only a seed that would collide now diverges, picking a different (still deterministic) color
 * instead. Each retry gets its own dataId suffix rather than an arithmetic offset shift, so a
 * retry can never accidentally land on another company's own base draw and reintroduce a
 * collision by a different path.
 */
export function generateCompanyIdentityColor(noiseMap: NoiseFunction2D, offset: number, usedColors: string[]): string {
  const used = new Set(usedColors);
  let lastColor = ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[0]];
  for (let attempt = 0; attempt < ROBOT_IDENTITY_COLOR_NAMES.length; attempt++) {
    const dataId = attempt === 0 ? 'company.identityColor' : `company.identityColor.retry${attempt}`;
    const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getSeededVal(noiseMap, dataId, offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
    lastColor = ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]];
    if (!used.has(lastColor)) return lastColor;
  }
  // Bound exhausted (every one of the 18 colors already in use) — cannot happen at today's
  // INITIAL_COMPANIES_MAX (3), kept only as the same defensive last-resort
  // pickRandomCompanyColor's own bound uses.
  return lastColor;
}

/**
 * Deterministic, human-legible robot ID — reuses the existing locale noise-map
 * seeding mechanism (same as every other spawn-time attribute) rather than
 * crypto.randomUUID(). Uniqueness is structural, not actively checked: `spawnCount`
 * is a monotonic per-locale counter, embedded directly in the ID string, and
 * `getSeededVal`'s 'robot.id' dataId gives this field its own row in the noise
 * map distinct from every other seeded field. Required so Session Storage
 * (Phase 20) can reapply Robot Options overrides by ID after the roster
 * regenerates from a reload or shared link — the same coordinates always
 * replay the same spawnCount sequence and therefore the same ID sequence.
 */
function generateRobotId(noiseMap: NoiseFunction2D, spawnCount: number): string {
  const idSeed = getSeededVal(noiseMap, 'robot.id', spawnCount, 0, 1);
  return `robot-${spawnCount}-${idSeed.toString(36).slice(2, 10)}`;
}

/**
 * Deterministic melody-generation seed (Roadmap Phase 31) — own dataId ('robot.compositionSeed'),
 * mirrors generateRobotId's shape exactly. Always fresh per robot: computed unconditionally in
 * spawnRobot, outside the shouldCopy branch, never inherited from a copy source (same treatment
 * as id/name/melody itself).
 */
function generateCompositionSeed(noiseMap: NoiseFunction2D, spawnCount: number): number {
  return getSeededVal(noiseMap, 'robot.compositionSeed', spawnCount, 0, 1);
}

// ========================================
// MODULE STATE
// ========================================
/** Per-locale spawn counters — used as deterministic offset for noise sampling. Not stored in Zustand. */
const spawnCounters = new Map<string, number>();

function getAndIncrementSpawnCount(localeId: string): number {
  const count = spawnCounters.get(localeId) ?? 0;
  spawnCounters.set(localeId, count + 1);
  return count;
}

// ========================================
// EXPORTS
// ========================================

/**
 * Generate a spawn position just outside the visible SVG viewBox, below the
 * bottom edge. Robots are invisible here (SVG clips to viewBox) and swim
 * inward on their first idle tick, creating a natural "surfacing from below"
 * entrance. Every robot enters and exits exclusively via the bottom of the
 * world view — this is also what robotSystems.ts's landOnDocked reuses to
 * reposition a robot once it's actually docked, so a robot's off-screen
 * resting spot is always south too, never to the sides or above.
 */
export function generateSpawnPosition(noiseMap: NoiseFunction2D, offset: number): Vec2 {
  return {
    x: getSeededVal(noiseMap, 'spawn.pos.x', offset, 0, WORLD_WIDTH),
    y: WORLD_HEIGHT + OFFSCREEN_OFFSET + getSeededVal(noiseMap, 'spawn.pos.y', offset, 0, 50),
  };
}

/**
 * Generate random audio attributes
 * Controls both sound synthesis and visual appearance
 */
export function generateAudioAttributes(noiseMap: NoiseFunction2D, offset: number): AudioAttributes {
  // Seeded ADSR envelope
  const adsr = {
    attack: getSeededVal(noiseMap, 'robot.audio.attack', offset, ATTACK_RANGE.min, ATTACK_RANGE.max),
    decay: getSeededVal(noiseMap, 'robot.audio.decay', offset, DECAY_RANGE.min, DECAY_RANGE.max),
    sustain: getSeededVal(noiseMap, 'robot.audio.sustain', offset, SUSTAIN_RANGE.min, SUSTAIN_RANGE.max),
    release: getSeededVal(noiseMap, 'robot.audio.release', offset, RELEASE_RANGE.min, RELEASE_RANGE.max),
  };

  // Seeded octave register — direct [min, max] tuple, no Hz indirection
  const octaveRange = OCTAVE_REGISTERS[Math.min(OCTAVE_REGISTERS.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.audio.register', offset, 0, OCTAVE_REGISTERS.length)))] as [number, number];

  // Seeded filter frequency (determines detail level)
  const filterFreq = getSeededVal(noiseMap, 'robot.audio.filterFreq', offset, FILTER_FREQ_RANGE.min, FILTER_FREQ_RANGE.max);

  // Seeded waveform — evenly distributed (~20% each)
  const waveform = WAVEFORMS[Math.min(WAVEFORMS.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.audio.waveform', offset, 0, WAVEFORMS.length)))];

  // Generate the fixed 3-layer Signature Array (Baseline/Coaxial/Harmonic, Roadmap Phase 9).
  // There is no per-layer ADSR anymore — every layer shares the one `adsr` envelope above.
  const layers: OscillatorLayer[] = [];
  for (let i = 0; i < LAYER_COUNT; i++) {
    const layerOffset = offset * 10 + i;
    // Baseline (layers[0]) always seeds a real, audible gain; Coaxial/Harmonic (layers[1]/[2])
    // each have a real ~50% chance (LAYER_QUIET_THRESHOLD) of forcing gain to 0 instead of
    // sampling one — muting doesn't discard the rest of the layer's configuration (see
    // AudioEngine.ts's filterAudibleLayers), so a muted layer still gets a full,
    // ready-to-resume config here.
    const quiet = i !== 0 && getSeededVal(noiseMap, 'robot.audio.layer.quiet', layerOffset, 0, 1) < LAYER_QUIET_THRESHOLD;
    const layerWave: OscillatorLayer = {
      type: WAVEFORMS[Math.floor(getSeededVal(noiseMap, 'robot.audio.layer.waveform', layerOffset, 0, WAVEFORMS.length))],
      gain: quiet ? 0 : quantizeToStep(getSeededVal(noiseMap, 'robot.audio.layer.gain', layerOffset, 0.2, 1.2), 0, LAYER_GAIN_STEP),
      detune: quantizeToStep(getSeededVal(noiseMap, 'robot.audio.layer.detune', layerOffset, -2, 2), 0, DETUNE_STEP),
      phase: Math.floor(getSeededVal(noiseMap, 'robot.audio.layer.phase', layerOffset, 0, 361)) || 0,
    };
    layers.push(layerWave);
  }

  // Phase: 0..360 degrees (used for oscillator phase)
  const phase = Math.floor(getSeededVal(noiseMap, 'robot.audio.phase', offset, 0, 361));
  // Detune: default 0 cents (fine pitch adjustment)
  const detune = Math.round(getSeededVal(noiseMap, 'robot.audio.detune', offset, -5, 5));
  // Pulse width: meaningful for pulse/square waves. Default ~0.5 (50% duty).
  const rawPulse = getSeededVal(noiseMap, 'robot.audio.pulseWidth', offset, 0.05, 0.95);
  const pulseWidth = Math.max(0.01, Math.min(0.99, rawPulse));

  // Include `layers` as the canonical audio description. Flat fields are left for compatibility.
  return { adsr, octaveRange, filterFreq, waveform, phase, detune, pulseWidth, layers } as AudioAttributes;
}

/**
 * Probability threshold an LFO target's own "start quiet" seed draw ([0, 1])
 * must clear to force rate to 0. Was 0.5 (a nominal 50/50) until 2026-09-30;
 * raised to 0.7 so roughly a quarter of audio-rate targets seed on
 * (docs/specs/LFO_LOAD_FIX.md assumption 5 / §1.4) — with robot LFOs now
 * actually primed into the engine at spawn, the old odds would have put
 * ≈60 LFOs on a 12-robot roster and saturated the audio thread.
 *
 * Why 0.7 and not 0.75 for "25% on": the draw is a smooth simplex sample
 * mapped to [0, 1], not a uniform coin, so the on-rate is not 1 - threshold.
 * Measured across 8 worlds × 12 offsets before choosing: 0.5 → ≈53% on,
 * 0.75 → ≈20%, 0.7 → ≈27% (≈1.6 audio-rate LFOs per robot, ≈19 per world).
 * A side effect of the same structure: every target of one robot samples the
 * map at the same y (the spawn offset) with x values all inside [0, 1), so a
 * robot's draws are strongly correlated — robots tend to be mostly-on or
 * mostly-off rather than evenly sprinkled. Pre-existing, not changed here.
 */
const LFO_QUIET_THRESHOLD = 0.7;

/** Rounds Depth to a whole percent (SEEDED_SLIDER_VALUE_QUANTIZATION follow-up) — already
 *  stored in percent units (0-100), so no unit conversion needed. */
const LFO_DEPTH_STEP = 1;

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.3)
// ========================================

/** A lit target never seeds 0 on either field — a "lit" link (a real lane assigned) should always
 *  be audible; depth 0 would be indistinguishable from quiet/off except for still consuming a
 *  lane slot in the tally (seed-only floor; a user may still drag depth to 0 by hand). */
export const ROBOT_LFO_DEPTH_SEED_MIN = 1;

/** Per-field robot link depth seed windows (Crawford's own load-value tuning pass, 2026-10-02) —
 *  gain and detune read very differently at the same depth percentage, so each gets its own
 *  ceiling, both sharing the same never-zero floor above. */
export const ROBOT_LFO_GAIN_DEPTH_SEED_RANGE = { min: ROBOT_LFO_DEPTH_SEED_MIN, max: 60 };
export const ROBOT_LFO_DETUNE_DEPTH_SEED_RANGE = { min: ROBOT_LFO_DEPTH_SEED_MIN, max: 10 };

function robotLfoDepthSeedRangeForTarget(target: RobotLfoTargetId): { min: number; max: number } {
  return target.endsWith('.gain') ? ROBOT_LFO_GAIN_DEPTH_SEED_RANGE : ROBOT_LFO_DETUNE_DEPTH_SEED_RANGE;
}

/**
 * Generate seeded LfoLinks for all 6 RobotLfoTargetId modulation targets — replaces
 * generateRobotLfoSettings's per-target shape/rate with a lane pick (spec §1.3). Reuses
 * LFO_QUIET_THRESHOLD (0.7) unchanged. The lane draw is roster-aware: `priorLaneCounts` is the
 * tally of every already-spawned robot in the locale (computed by spawnRobot before calling this),
 * and this robot's own earlier targets update that same running tally as the loop goes — so even
 * one robot's six targets lean away from each other, not just away from the rest of the roster.
 */
export function generateRobotLfoLinks(
  noiseMap: NoiseFunction2D,
  offset: number,
  priorLaneCounts: Readonly<Record<LfoLaneId, number>>,
): Record<RobotLfoTargetId, LfoLink> {
  const counts: Record<LfoLaneId, number> = { ...priorLaneCounts };
  const result = {} as Record<RobotLfoTargetId, LfoLink>;

  for (const target of ROBOT_LFO_TARGET_IDS) {
    const quiet = getSeededVal(noiseMap, `robot.lfo.${target}.quiet`, offset, 0, 1) < LFO_QUIET_THRESHOLD;
    if (quiet) {
      result[target] = { lane: null, depth: 0 };
      continue;
    }

    const laneT = getSeededVal(noiseMap, `robot.lfo.${target}.lane`, offset, 0, 1);
    const lane = pickLane(laneT, counts);
    counts[lane]++;

    const depthRange = robotLfoDepthSeedRangeForTarget(target);
    const depth = quantizeToStep(
      getSeededVal(noiseMap, `robot.lfo.${target}.depth`, offset, depthRange.min, depthRange.max),
      LFO_DEPTH_MIN,
      LFO_DEPTH_STEP,
    );
    result[target] = { lane, depth };
  }
  return result;
}

/**
 * A robot's audio-relevant seeded fields — exactly the shape spawnRobot's own "copy an earlier
 * sibling" branch reads from a live Robot object, extracted so it can be replayed for baseline
 * comparison (Session Storage, docs/specs/SESSION_STORAGE.md) without touching the store spawnRobot
 * itself reads from.
 */
export interface RobotAudioBaseline {
  /** Unconditional, like spawnRobot's own robot.name assignment — NOT inherited on the copy
   *  branch (a copied robot still gets its own freshly-generated name). */
  name: string;
  audioAttributes: AudioAttributes;
  octaveRange: [number, number];
  rhythmicDensity: number;
  rhythmicMotifLength: ToggleValue;
  noteVariance: ToggleValue;
  pitchRepeat: number;
  /** Mirrors spawnRobot's own lfoLinks branch (Session Storage/LFO Bank Task 18): copied on the
   *  copy branch, freshly drawn (with the roster's running lane tally) on the fresh branch. */
  lfoLinks: Record<RobotLfoTargetId, LfoLink>;
}

/**
 * Replays spawnRobot's exact generate-or-copy decision tree for one robot at `spawnCount`, given
 * the baselines already computed for every earlier robot in the same roster (`priorBaselines`, in
 * spawn order) — pure, no store read/write. Deliberately NOT a refactor of spawnRobot itself (see
 * this function's own file-level context in docs/tasks/SESSION_STORAGE.md Task 2): spawnRobot's
 * copy branch depends on the live store's accumulated `robots` array, so replaying it purely means
 * taking that pool as an explicit argument instead. Mirrors spawnRobot's own 'robot.copyChance'/
 * 'robot.copySource' dataIds and the 0.30 threshold exactly — any divergence here would silently
 * break Session Storage's "an untouched robot's diff is always empty" guarantee. Only the
 * real-noiseMap path is replayed; spawnRobot's own no-noiseMap `alea(...)` fallback (used only when
 * a locale/coordinates don't exist yet) has nothing meaningful to diff against, so it's not mirrored
 * here.
 */
export function generateRobotAudioBaseline(
  noiseMap: NoiseFunction2D,
  spawnCount: number,
  priorBaselines: readonly RobotAudioBaseline[],
): RobotAudioBaseline {
  const copyRoll = getSeededVal(noiseMap, 'robot.copyChance', spawnCount, 0, 1);
  const shouldCopy = copyRoll < 0.30 && priorBaselines.length > 0;

  const name = generateRobotName(noiseMap, spawnCount);

  if (shouldCopy) {
    const srcIdx = Math.min(
      priorBaselines.length - 1,
      Math.floor(getSeededVal(noiseMap, 'robot.copySource', spawnCount, 0, priorBaselines.length))
    );
    // name is NOT inherited from the copy source — spawnRobot generates it unconditionally,
    // outside the shouldCopy branch (see this function's own doc comment).
    return { ...priorBaselines[srcIdx], name };
  }

  const audioAttributes = generateAudioAttributes(noiseMap, spawnCount);
  const octaveRange = audioAttributes.octaveRange ?? [2, 4] as [number, number];
  const rhythmicDensity = Math.round(getSeededVal(noiseMap, 'robot.rhythmicDensity', spawnCount, 0, 100));
  const motifRaw = getSeededVal(noiseMap, 'robot.rhythmicMotifLength.active', spawnCount, 0, 1);
  const rhythmicMotifLength = seedToggleValue(motifRaw, RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD);
  const noteVarianceRaw = getSeededVal(noiseMap, 'robot.noteVariance.active', spawnCount, 0, 1);
  const noteVariance = seedToggleValue(noteVarianceRaw, NOTE_VARIANCE_OFF_THRESHOLD);
  const pitchRepeat = Math.round(getSeededVal(noiseMap, 'robot.pitchRepeat', spawnCount, 0, 100));
  const priorLaneCounts = tallyLanes(priorBaselines.flatMap((b) => Object.values(b.lfoLinks)));
  const lfoLinks = generateRobotLfoLinks(noiseMap, spawnCount, priorLaneCounts);

  return { name, audioAttributes, octaveRange, rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat, lfoLinks };
}

/**
 * Replays generateRobotAudioBaseline above for a full `count`-robot roster in spawn order, purely
 * from the noise map. Used by sessionDiff.ts to compute what a locale's whole roster would look
 * like from the seed alone, to diff a live roster against.
 */
export function generateRobotRosterBaseline(noiseMap: NoiseFunction2D, count: number): RobotAudioBaseline[] {
  const baselines: RobotAudioBaseline[] = [];
  for (let i = 0; i < count; i++) {
    baselines.push(generateRobotAudioBaseline(noiseMap, i, baselines));
  }
  return baselines;
}

/** A spawn-generated company's seed-derived id/name/membership — the shape sessionDiff.ts's
 *  CompanyDiff needs to compare a live Company against; color is deliberately omitted (not part
 *  of CompanyDiff, see docs/specs/SESSION_STORAGE.md §4.1). */
export interface CompanyRosterBaseline {
  id: string;
  name: string;
  robotIds: string[];
}

/**
 * Replays spawnInitialCompanies' exact company-generation loop (dataIds 'company.count'/
 * 'company.size'/'company.member', the same INITIAL_COMPANIES_MIN/MAX and COMPANY_SIZE_MIN/MAX
 * bounds) purely from the noise map and a robot-id pool, in spawn order — no store read/write.
 * Deliberately NOT a refactor of spawnInitialCompanies itself, same rationale as
 * generateRobotAudioBaseline above (touching already-covered, store-coupled code is riskier than
 * an additive, independently-verified parallel implementation).
 */
export function generateCompanyRosterBaseline(noiseMap: NoiseFunction2D, robotIds: readonly string[]): CompanyRosterBaseline[] {
  let pool = [...robotIds];
  const companyCount = INITIAL_COMPANIES_MIN + Math.floor(
    getSeededVal(noiseMap, 'company.count', 0, 0, INITIAL_COMPANIES_MAX - INITIAL_COMPANIES_MIN + 1)
  );

  const companies: CompanyRosterBaseline[] = [];
  for (let c = 0; c < companyCount && pool.length > 0; c++) {
    const size = Math.min(pool.length, COMPANY_SIZE_MIN + Math.floor(
      getSeededVal(noiseMap, 'company.size', c, 0, COMPANY_SIZE_MAX - COMPANY_SIZE_MIN + 1)
    ));

    const memberIds: string[] = [];
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(getSeededVal(noiseMap, 'company.member', c * 100 + i, 0, pool.length));
      memberIds.push(pool[idx]);
      pool = pool.filter((_, j) => j !== idx);
    }

    companies.push({ id: generateCompanyId(noiseMap, c), name: generateCompanyName(noiseMap, c), robotIds: memberIds });
  }
  return companies;
}

/**
 * Create and add a single robot with randomized attributes, registering its
 * melody with AudioEngine. The roster is fixed-size now (see
 * spawnInitialRoster) — this no longer enforces any max/min bounce; callers
 * decide how many robots to create and with what starting docking/battery.
 *
 * @param options.docking Starting DockingState. Default: Active — matches
 *   this function's pre-lifecycle behavior (every spawned robot was
 *   immediately visible/audible), so existing single-call-site callers and
 *   tests are unaffected unless they opt into a different starting state.
 * @param options.batteryLevel Starting battery (0-100). Default: 100.
 */
export function spawnRobot(localeId: string, options?: { docking?: DockingState; batteryLevel?: number }): void {
  const docking = options?.docking ?? DockingState.Active;
  const batteryLevel = options?.batteryLevel ?? 100;

  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const robots = locale?.robots ?? [];

  // Resolve locale noise map for deterministic attribute generation
  const noiseMap = locale
    ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y)
    : null;

  // Monotonically incrementing offset for this locale — ensures each robot is distinct
  const spawnCount = getAndIncrementSpawnCount(localeId);

  // 30% seeded chance to copy an existing robot's audio personality instead of generating fresh.
  // Copied robots inherit: audioAttributes, octaveRange, rhythmicDensity, rhythmicMotifLength,
  // noteVariance, lfoLinks. Always fresh: id, name, position, direction, melody (regenerated
  // from the copied octaveRange/rhythmicDensity/rhythmicMotifLength/noteVariance).
  const copyRoll = noiseMap
    ? getSeededVal(noiseMap, 'robot.copyChance', spawnCount, 0, 1)
    : alea(`${localeId}:${spawnCount}:copy`)();
  const shouldCopy = copyRoll < 0.30 && robots.length > 0;

  // Always fresh, outside the shouldCopy branch -- never inherited from a copy source,
  // same treatment as id/name/melody (see generateCompositionSeed's own doc comment).
  const compositionSeed = noiseMap
    ? generateCompositionSeed(noiseMap, spawnCount)
    : alea(`${localeId}:${spawnCount}:compositionSeed`)();

  let audioAttributes: ReturnType<typeof generateAudioAttributes>;
  let octaveRange: [number, number];
  let spawnRhythmicDensity: number;
  let spawnRhythmicMotifLength: ToggleValue;
  let spawnNoteVariance: ToggleValue;
  let spawnPitchRepeat: number;
  let spawnLfoLinks: ReturnType<typeof generateRobotLfoLinks>;

  // Roster-aware lane tally (docs/specs/LFO_BANK.md §1.3): every already-spawned robot's own
  // lane picks lean this robot's fresh draw (if any) toward the least-used lanes. Computed
  // unconditionally, before the copy/fresh branch, since the copy branch's own fallback
  // (source.lfoLinks ?? generate) may still need it.
  const priorLaneCounts = tallyLanes(robots.flatMap((r) => Object.values(r.lfoLinks ?? {})));

  if (shouldCopy) {
    const srcIdx = Math.min(
      robots.length - 1,
      Math.floor(
        noiseMap
          ? getSeededVal(noiseMap, 'robot.copySource', spawnCount, 0, robots.length)
          : alea(`${localeId}:${spawnCount}:src`)() * robots.length
      )
    );
    const source = robots[srcIdx];
    audioAttributes = source.audioAttributes as ReturnType<typeof generateAudioAttributes>;
    octaveRange = source.octaveRange;
    spawnRhythmicDensity = source.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY;
    spawnRhythmicMotifLength = source.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
    spawnNoteVariance = source.noteVariance ?? DEFAULT_NOTE_VARIANCE;
    spawnPitchRepeat = source.pitchRepeat ?? DEFAULT_PITCH_REPEAT;
    spawnLfoLinks = source.lfoLinks ?? generateRobotLfoLinks(noiseMap ?? ((_x: number, _y: number) => 0 as number), spawnCount, priorLaneCounts);
  } else {
    // Generate audio attributes — octaveRange is seeded directly inside generateAudioAttributes
    audioAttributes = noiseMap
      ? generateAudioAttributes(noiseMap, spawnCount)
      : generateAudioAttributes((_x: number, _y: number) => 0 as number, spawnCount);
    octaveRange = audioAttributes.octaveRange ?? [2, 4] as [number, number];
    spawnLfoLinks = noiseMap
      ? generateRobotLfoLinks(noiseMap, spawnCount, priorLaneCounts)
      : generateRobotLfoLinks((_x: number, _y: number) => 0 as number, spawnCount, priorLaneCounts);

    spawnRhythmicDensity = Math.round(
      noiseMap
        ? getSeededVal(noiseMap, 'robot.rhythmicDensity', spawnCount, 0, 100)
        : alea(`${localeId}:${spawnCount}:density`)() * 100
    );

    // Reuses the old '.active' dataId verbatim (not a freshly-named consolidated key) —
    // getSeededVal's simplex slice is keyed off the exact dataId string, so a new string
    // would sample a different curve with no guarantee of matching this one's already-
    // tuned ~85%/15% split against RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD. The old '.value'
    // dataId is retired entirely — value is now derived from this same draw.
    const motifRaw = noiseMap
      ? getSeededVal(noiseMap, 'robot.rhythmicMotifLength.active', spawnCount, 0, 1)
      : alea(`${localeId}:${spawnCount}:motifActive`)();
    spawnRhythmicMotifLength = seedToggleValue(motifRaw, RHYTHMIC_MOTIF_LENGTH_OFF_THRESHOLD);

    const noteVarianceRaw = noiseMap
      ? getSeededVal(noiseMap, 'robot.noteVariance.active', spawnCount, 0, 1)
      : alea(`${localeId}:${spawnCount}:nvActive`)();
    spawnNoteVariance = seedToggleValue(noteVarianceRaw, NOTE_VARIANCE_OFF_THRESHOLD);

    spawnPitchRepeat = Math.round(
      noiseMap
        ? getSeededVal(noiseMap, 'robot.pitchRepeat', spawnCount, 0, 100)
        : alea(`${localeId}:${spawnCount}:pitchRepeat`)() * 100
    );
  }

  // Seeded melody (Roadmap Phase 31) -- the same buildSeededComposition formula
  // regenerateMelody.ts uses for every later edit, so a post-spawn edit reverted to its
  // original value reproduces this exact melody (no "first-edit ratchet"). Retires the old
  // per-call noise-map draw ('melody.rand'/melodyCallIndex) in favor of compositionSeed.
  const compositionRand = buildSeededComposition(compositionSeed, {
    rhythmicDensity: spawnRhythmicDensity,
    rhythmicMotifLength: spawnRhythmicMotifLength,
    noteVariance: spawnNoteVariance,
    pitchRepeat: spawnPitchRepeat,
    octaveRange,
  });

  const spawnMelody = generateMelodyForRobot({
    octaveMin: octaveRange[0],
    octaveMax: octaveRange[1],
    rhythmicDensity: spawnRhythmicDensity,
    rhythmicMotifLength: spawnRhythmicMotifLength,
    noteVariance: spawnNoteVariance,
    pitchRepeat: spawnPitchRepeat,
    rand: compositionRand,
  });

  const position = noiseMap ? generateSpawnPosition(noiseMap, spawnCount) : generateSpawnPosition((_x: number, _y: number) => 0 as number, spawnCount);
  const spawnDirection: 'left' | 'right' = position.x < (WORLD_WIDTH / 2) ? 'left' : 'right';

  const robot: Robot = {
    id: noiseMap ? generateRobotId(noiseMap, spawnCount) : generateRobotId((_x: number, _y: number) => 0 as number, spawnCount),
    compositionSeed,
    name: noiseMap ? generateRobotName(noiseMap, spawnCount) : generateRobotName((_x: number, _y: number) => 0 as number, spawnCount),
    identityColor: noiseMap
      ? generateRobotIdentityColor(noiseMap, spawnCount)
      : generateRobotIdentityColor((_x: number, _y: number) => 0 as number, spawnCount),
    greebles: noiseMap
      ? generateGreebles(noiseMap, spawnCount)
      : generateGreebles((_x: number, _y: number) => 0 as number, spawnCount),
    state: RobotState.Idle,
    position,
    destination: null,
    direction: spawnDirection,
    melody: spawnMelody,
    audioAttributes,
    octaveRange,
    // Mute is expressed via audioMode (the same toggle Robot Options exposes,
    // so a user can independently override it), not by withholding voice
    // reservation/melody registration below — those happen unconditionally.
    audioMode: docking === DockingState.Active ? 'none' : 'mute',
    rhythmicDensity: spawnRhythmicDensity,
    rhythmicMotifLength: spawnRhythmicMotifLength,
    noteVariance: spawnNoteVariance,
    pitchRepeat: spawnPitchRepeat,
    lfoLinks: spawnLfoLinks,
    masterVolume: (() => {
      const seeded = noiseMap
        ? getSeededVal(noiseMap, 'robot.masterVolume', spawnCount, MASTER_VOLUME_MIN, MASTER_VOLUME_MAX)
        : MASTER_VOLUME_MIN + alea(`${localeId}:${spawnCount}:mv`)() * (MASTER_VOLUME_MAX - MASTER_VOLUME_MIN);
      // Bass robots are louder, treble robots quieter. Register mid [1..5], neutral ~3.5.
      const registerMid = (octaveRange[0] + octaveRange[1]) / 2;
      const registerBias = (4.5 - registerMid) * 0.05;
      const raw = Math.max(0.5, Math.min(0.95, seeded + registerBias));
      // Quantized in percent-space, not against the stored fraction directly —
      // same "avoid a sub-percent grid" reasoning as Ping Variance Automation
      // (globalAudioSeed.ts).
      return quantizeToStep(raw * 100, 0, VOLUME_STEP_PERCENT) / 100;
    })(),
    createdAt: Date.now(),
    docking,
    batteryLevel,
  };

  // Add to locale store
  useLocaleStore.getState().addRobot(localeId, robot);

  // Seed the idle counter to this robot's spawn index so its noise-sampled
  // destinations are phase-shifted away from other robots in the same locale.
  initRobotIdleCounter(robot.id, spawnCount);

  // Every robot gets a reserved voice and registered melody, regardless of
  // docking state — mute is enforced by AudioEngine reading `audioMode` at
  // schedule time (see scheduleNote), not by withholding registration. This
  // is what makes a Docked robot's mute genuinely overridable from Robot
  // Options: the synth and melody are already live, so flipping audioMode
  // back to 'none' there is enough to hear it despite still being docked.
  // Unregister first to guard against duplicate entries if robot id is reused.
  AudioEngine.unregisterRobotMelody(robot.id);
  // Reserve a voice for this robot (best-effort) so its timbre/adsr are isolated.
  // Waveform is applied once here on the idle slot — no mid-playback oscillator rebuilds.
  try {
    const layers = (robot.audioAttributes as unknown as { layers?: OscillatorLayer[] })?.layers;
    if (Array.isArray(layers) && layers.length > 0) {
      const reserved = AudioEngine.reserveVoice(robot.id, layers, robot.audioAttributes.adsr, robot.audioAttributes.phase, robot.audioAttributes.detune, layers[0]?.pulseWidth, robot.masterVolume, robot.audioAttributes.filterFreq);
      // Prime this robot's seeded lane links into the bank engine now that it has a live voice to
      // connect against (docs/specs/LFO_BANK.md) — without this, seeded links sit in state, shown
      // in the UI, but never actually run until a user happens to edit one.
      if (reserved) {
        try {
          primeRobotLinks(robot);
        } catch (err) {
          if (DEV_TUNING) console.warn('[SpawnSystem] primeRobotLinks failed', err);
        }
      }
    }
  } catch (err) {
    if (DEV_TUNING) console.warn('[SpawnSystem] reserveVoice failed', err);
  }
  AudioEngine.registerRobotMelody(robot.id, robot.melody);
}

/**
 * Create the full fixed-size roster (MAX_ROBOTS robots) once, at locale load.
 * A seeded count within [INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]
 * start Active (full battery); the rest start Docked with varied seeded
 * starting battery so they don't all finish recharging in lockstep. Does
 * NOT assign jobs — worldTransition.ts's initializeLocale does that for the
 * initially-Active robots immediately after this returns (see
 * docs/specs/ROBOT_SYSTEMS_ENGINE.md's Architecture Decisions on why job
 * assignment isn't done here: avoids an import cycle with robotSystems.ts).
 */
export function spawnInitialRoster(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;

  const activeCount = INITIAL_ACTIVE_ROBOTS_MIN + Math.floor(
    noiseMap
      ? getSeededVal(noiseMap, 'roster.activeCount', 0, 0, INITIAL_ACTIVE_ROBOTS_MAX - INITIAL_ACTIVE_ROBOTS_MIN + 1)
      : alea(`${localeId}:activeCount`)() * (INITIAL_ACTIVE_ROBOTS_MAX - INITIAL_ACTIVE_ROBOTS_MIN + 1)
  );

  for (let i = 0; i < MAX_ROBOTS; i++) {
    if (i < activeCount) {
      spawnRobot(localeId, { docking: DockingState.Active, batteryLevel: 100 });
    } else {
      const dockedBattery = Math.floor(
        noiseMap
          ? getSeededVal(noiseMap, 'roster.dockedBattery', i, 0, 100)
          : alea(`${localeId}:dockedBattery:${i}`)() * 100
      );
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: dockedBattery });
    }
  }
}

/**
 * Create the seeded set of Companies for a fresh locale (Roadmap Phase 10) — 2-3 companies, each
 * claiming a seeded 3-4 robots from the roster this locale already has (spawnInitialRoster must
 * have run first). Membership is drawn from a shrinking pool so no robot is ever claimed by more
 * than one company; any robot left in the pool when generation finishes is Freelance
 * (`companyId` stays undefined) — a meaningful chunk of the roster, by design, not an edge case.
 * Distinct from `MAX_COMPANIES` (the CRUD ceiling on manual company creation afterward) — this
 * function never reads that constant.
 */
export function spawnInitialCompanies(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;
  let pool = (locale?.robots ?? []).map((r) => r.id);

  const companyCount = INITIAL_COMPANIES_MIN + Math.floor(
    noiseMap
      ? getSeededVal(noiseMap, 'company.count', 0, 0, INITIAL_COMPANIES_MAX - INITIAL_COMPANIES_MIN + 1)
      : alea(`${localeId}:companyCount`)() * (INITIAL_COMPANIES_MAX - INITIAL_COMPANIES_MIN + 1)
  );

  for (let c = 0; c < companyCount && pool.length > 0; c++) {
    const size = Math.min(pool.length, COMPANY_SIZE_MIN + Math.floor(
      noiseMap
        ? getSeededVal(noiseMap, 'company.size', c, 0, COMPANY_SIZE_MAX - COMPANY_SIZE_MIN + 1)
        : alea(`${localeId}:companySize:${c}`)() * (COMPANY_SIZE_MAX - COMPANY_SIZE_MIN + 1)
    ));

    const memberIds: string[] = [];
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(
        noiseMap
          ? getSeededVal(noiseMap, 'company.member', c * 100 + i, 0, pool.length)
          : alea(`${localeId}:companyMember:${c}:${i}`)() * pool.length
      );
      memberIds.push(pool[idx]);
      pool = pool.filter((_, j) => j !== idx);
    }

    // usedColors reflects every company generated earlier in this same loop — addCompany (below)
    // runs before the next iteration reaches this line, so useLocaleStore already has them.
    const usedColors = (useLocaleStore.getState().getLocaleById(localeId)?.companies ?? []).map((existing) => existing.color);
    const company: Company = {
      id: noiseMap ? generateCompanyId(noiseMap, c) : `company-${localeId}-${c}`,
      name: noiseMap ? generateCompanyName(noiseMap, c) : `Company ${c}`,
      color: noiseMap ? generateCompanyIdentityColor(noiseMap, c, usedColors) : ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[0]],
      robotIds: memberIds,
    };
    useLocaleStore.getState().addCompany(localeId, company);
    memberIds.forEach((id) => useLocaleStore.getState().updateRobot(localeId, id, { companyId: company.id }));
  }
}

/**
 * Re-register every robot's audio with AudioEngine after a power-on.
 * This release-then-reserve pass predates this phase and was already
 * unconditional on `killAll()` for whichever robots it covered — this phase
 * just widened *which* robots that is: every robot now keeps its voice
 * reserved and melody registered across a dock cycle (mute is `audioMode`
 * alone, see spawnRobot/robotSystems.ts's landing effects), not just the old
 * `persists`-flagged ones, so every robot needs re-registering here now, not
 * a filtered subset.
 *
 * Note: `AudioEngine.killAll()` itself does not touch the `compositeVoices`
 * map (confirmed by reading it) — voices are not actually known to be
 * invalidated by a power cycle. This re-registration may be unnecessary
 * defensive work carried over from before this phase; left as-is rather than
 * removed, since that's a separate, unverified behavior change this phase
 * didn't set out to make.
 */
export function reRegisterAllRobotsAudio(localeId: string): void {
  const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots || [];
  robots.forEach((robot) => {
    AudioEngine.releaseVoice(robot.id);
    try {
      const layers = (robot.audioAttributes as unknown as { layers?: OscillatorLayer[] })?.layers;
      if (Array.isArray(layers) && layers.length > 0) {
        AudioEngine.reserveVoice(robot.id, layers, robot.audioAttributes.adsr, robot.audioAttributes.phase, robot.audioAttributes.detune, layers[0]?.pulseWidth, robot.masterVolume, robot.audioAttributes.filterFreq);
      }
    } catch (err) {
      if (DEV_TUNING) console.warn('[SpawnSystem] reRegisterAllRobotsAudio: reserveVoice failed for', robot.id, err);
    }
    AudioEngine.unregisterRobotMelody(robot.id);
    AudioEngine.registerRobotMelody(robot.id, robot.melody);
  });
  // One pass over the whole roster, after every reservation — never per-robot inside the loop
  // above (docs/specs/LFO_BANK.md).
  try {
    primeRosterLinks(robots);
  } catch (err) {
    if (DEV_TUNING) console.warn('[SpawnSystem] reRegisterAllRobotsAudio: primeRosterLinks failed', err);
  }
}
