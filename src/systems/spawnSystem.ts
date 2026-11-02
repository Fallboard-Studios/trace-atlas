// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import type { Vec2 } from '../types/Vec2';
import type { AudioAttributes, Robot, RobotFilterType } from '../types/Robot';
import { DockingState } from '../types/Robot';
import {
  generateMelodyForRobot,
  buildSeededComposition,
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  DEFAULT_NOTE_VARIANCE,
  DEFAULT_PITCH_REPEAT,
  DEFAULT_DYNAMICS,
  DEFAULT_RESTS,
  DEFAULT_ACCENTS,
  buildSeededPerformance,
  applyPerformanceMarks,
} from '../engine/melodyGenerator';
import type { ToggleValue } from '../engine/melodyGenerator';
import { AudioEngine } from '../engine/AudioEngine';
import type { OscillatorLayer } from '../types/layeredAudio';
import type { Company } from '../types/Company';
import {
  DEV_TUNING, MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX,
  INITIAL_COMPANIES_MIN, INITIAL_COMPANIES_MAX, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX,
} from '../constants';
import { robotSendLevels, type RobotSendField } from '../data/robotSends';
import { getBand } from '../data/bands/loadingContext';
import type { RobotAspects } from '../data/bands/dealAspects';
import type { SendBand } from '../data/bands/bandKeys';
import useLocaleStore from '../stores/localeStore';
import { primeRobotLinks, primeRosterLinks } from './robotLfoLinks';
import {
  composeExclusiveSends,
  composeSends,
  currentEnvelopeBands,
  currentMelodyBands,
  currentSendBands,
  currentVoiceBands,
  deriveEnvelopeFields,
  deriveMelodyFields,
  deriveSendFields,
  deriveVoiceFields,
  seedToggleValue,
} from './robotFieldDerivation';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getCentredSeededVal, getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import type { RobotLfoTargetId, LfoLaneId, LfoLink } from '../types/lfo';
import { ROBOT_LFO_TARGET_IDS, LFO_DEPTH_MIN } from '../types/lfo';
import { pickLane, tallyLanes } from '../utils/lfoLaneDraw';
import { assignStationsAtLoad, getStations } from './stations';
import { positionForCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { getRobotGem } from '../components/robot/gem/polygon';

// ========================================
// CONSTANTS
// ========================================
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
/** Distance outside the SVG viewBox where robots spawn before swimming on-screen. */
const OFFSCREEN_OFFSET = 150;

// The robot seeding bands - the ADSR and its shaped stages, the articulation traits and their shares, the Signature
// Array gain, the master volume, the LFO depth windows, the Melody and performance fields - live in the band table
// (src/data/bands/classic.ts, docs/specs/OFF_SCREEN.md assumption 15) and are read with getBand(...) at the point of
// each draw below, never cached at module scope: the table changes per world (band-table T21).

// Octave registers — seed directly without Hz indirection
// [min, max] inclusive; 3 tiers: bass, mid, treble
const OCTAVE_REGISTERS = [
  [1, 3],  // Bass (large robots)
  [2, 4],
  [3, 5],  // Mid  (normal robots)
  [4, 6],
  [5, 7],  // Treble (small robots)
] as const;

// ========================================
// ROBOT ARTICULATION (docs/specs/ROBOT_ARTICULATION.md §1.2)
// ========================================
// Portamento, envelope curves and the bus filter's resonance and shape are minority traits: most robots keep the plain
// sound (open lowpass, no glide, linear curves) and a few stand out. Each trait's band carries its share as `lit`
// (robot.portamento, robot.shapedAttack, robot.shapedRelease, robot.accentFilterFreq in the band table), compared
// against an even [0, 1) draw, so the edge is the share (docs/specs/EVEN_SEEDED_DRAWS.md §1.4). The shares are the
// ones Robot Articulation's listen heard, when the edges were fitted to a bunched simplex draw; classic.ts records them,
// and robotFieldDerivation.test.ts and spawnSystem.evenDraws.test.ts pin them. The curves and the accent filter are
// drawn in robotFieldDerivation.ts.

/** Mirrors the Portamento slider's own step (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const PORTAMENTO_STEP = 0.01;

/** Mirrors the Volume slider's own step, in percent-space (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const VOLUME_STEP_PERCENT = 1;

// Simple word lists for deterministic-looking robot names. ADJECTIVES is exported — reused by
// generateCompanyName below (Roadmap Phase 10), the same "sounds like this universe" half, paired
// with a distinct COMPANY_NOUNS list so a generated company name can never take the exact same
// word-pair form a robot name can (see docs/specs/archive/COMPANIES.md §7.3).
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

/** Exclusive upper bound for Robot.gemSeed. */
const GEM_SEED_MAX = 2 ** 31;

/**
 * The robot's gem-polygon body seed (Roadmap Phase 39, docs/specs/GEM_POLYGON_ROBOTS.md §1.1) —
 * same shape as generateRobotIdentityColor above: identity, not audio, drawn once at spawn,
 * never inherited on the copy path. Clamped because the noise sampler can return exactly `max`.
 */
function generateGemSeed(noiseMap: NoiseFunction2D, offset: number): number {
  return Math.min(GEM_SEED_MAX - 1, Math.floor(getSeededVal(noiseMap, 'robot.gem.seed', offset, 0, GEM_SEED_MAX)));
}

// Phase 37's seeded greeble set (generateGreebles, GREEBLE_COUNT_RANGE and its three count/kind/
// slot dataIds) was retired in Phase 39 Task 11 — the gem robot's seeded detail is its geometry
// (gemSeed above). The dataIds are retired, not renamed.

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
 * Deterministic per-company identity color (docs/specs/archive/COMPANY_SECTION_ENHANCEMENTS.md §1.2) —
 * mirrors generateRobotIdentityColor's own clamped-index-into-ROBOT_IDENTITY_COLOR_NAMES shape,
 * with its own dataId ('company.identityColor') so it draws from a distinct row of the noise map
 * rather than sharing the robot one's seeded stream. Exported (unlike generateCompanyId) only so
 * it can be unit-tested directly — still only called from spawnInitialCompanies below.
 *
 * Reverses docs/specs/archive/COMPANY_SECTION_ENHANCEMENTS.md §7 item 2's "accepted, low-risk" decision
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
 * an even draw (docs/specs/EVEN_SEEDED_DRAWS.md), so seeds rarely repeat across a fleet. Always fresh
 * per robot: computed unconditionally in spawnRobot, outside the shouldCopy branch, never inherited
 * from a copy source (same treatment as id/name/melody itself).
 */
function generateCompositionSeed(noiseMap: NoiseFunction2D, spawnCount: number): number {
  return getUniformSeededVal(noiseMap, 'robot.compositionSeed', spawnCount, 0, 1);
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
 * A seeded spawn position just outside the visible SVG viewBox, below the bottom edge. Only a
 * lone spawnRobot keeps it: spawnInitialRoster moves the whole roster to its station ports
 * (placeRosterAtStations), and the work loop owns every position after that (Phase 43).
 */
export function generateSpawnPosition(noiseMap: NoiseFunction2D, offset: number): Vec2 {
  return {
    x: getSeededVal(noiseMap, 'spawn.pos.x', offset, 0, WORLD_WIDTH),
    y: WORLD_HEIGHT + OFFSCREEN_OFFSET + getSeededVal(noiseMap, 'spawn.pos.y', offset, 0, 50),
  };
}

/**
 * A robot's seeded audio attributes: the envelope, glide, register, voice (filter, waveform, layers), phase, detune
 * and pulse width. Sound, not shape: the body's geometry comes from the gem seed (docs/ROBOT_DESIGN.md).
 */
export function generateAudioAttributes(noiseMap: NoiseFunction2D, offset: number): AudioAttributes {
  // Seeded ADSR envelope, every band from the loading context (band-table T21), through the Envelope family's one
  // derivation (revisions Task 8).
  const adsr = deriveEnvelopeFields(noiseMap, offset, currentEnvelopeBands());

  // Seeded portamento — most robots don't glide; a glider slurs each note into the next. The band's `lit` is the
  // gliding share (robot.portamento).
  const portamentoBand = getBand('robot.portamento');
  const glider = getUniformSeededVal(noiseMap, 'robot.audio.portamento.glider', offset, 0, 1) < portamentoBand.lit;
  const portamento = glider
    ? quantizeToStep(getUniformSeededVal(noiseMap, 'robot.audio.portamento', offset, portamentoBand.min, portamentoBand.max), 0, PORTAMENTO_STEP)
    : 0;

  // Seeded octave register — direct [min, max] tuple, no Hz indirection
  const octaveRange = OCTAVE_REGISTERS[Math.min(OCTAVE_REGISTERS.length - 1, Math.floor(getUniformSeededVal(noiseMap, 'robot.audio.register', offset, 0, OCTAVE_REGISTERS.length)))] as [number, number];

  // The voice - the bus filter, the waveform and the 3-layer Signature Array - through the Voice family's one
  // derivation (revisions Task 10).
  const { filterFreq, filterQ, filterType, waveform, layers } = deriveVoiceFields(noiseMap, offset, currentVoiceBands());

  // Phase: 0..360 degrees (used for oscillator phase)
  const phase = Math.floor(getUniformSeededVal(noiseMap, 'robot.audio.phase', offset, 0, 361));
  // Detune: default 0 cents (fine pitch adjustment)
  const detune = Math.round(getCentredSeededVal(noiseMap, 'robot.audio.detune', offset, -5, 5));
  // Pulse width: meaningful for pulse/square waves. Default ~0.5 (50% duty).
  const rawPulse = getUniformSeededVal(noiseMap, 'robot.audio.pulseWidth', offset, 0.05, 0.95);
  const pulseWidth = Math.max(0.01, Math.min(0.99, rawPulse));

  // Include `layers` as the canonical audio description. Flat fields are left for compatibility.
  return { adsr, octaveRange, filterFreq, filterQ, filterType, portamento, waveform, phase, detune, pulseWidth, layers } as AudioAttributes;
}

/** The three articulation fields of a robot, as the trailing object `AudioEngine.reserveVoice` takes — read from the
 *  robot itself (not the seed), so a re-registration after an edit sounds like the edited robot. */
function robotArticulation(robot: Robot): { portamento?: number; filterQ?: number; filterType?: RobotFilterType } {
  const { portamento, filterQ, filterType } = robot.audioAttributes;
  return { portamento, filterQ, filterType };
}

/** Rounds Depth to a whole percent (SEEDED_SLIDER_VALUE_QUANTIZATION follow-up) — already
 *  stored in percent units (0-100), so no unit conversion needed. */
const LFO_DEPTH_STEP = 1;

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.3)
// ========================================

/** The band a robot LFO target seeds from (robot.lfoGainDepth, robot.lfoDetuneDepth, robot.lfoBusDepth in the band
 *  table, band-table T21): its depth window in percent, with a never-zero floor so a lit link is always audible, and as
 *  `lit` the lit share. The on-roll is even (docs/specs/EVEN_SEEDED_DRAWS.md), so `lit` is the share of robots with the
 *  link lit. */
function robotLfoBandForTarget(target: RobotLfoTargetId): SendBand {
  if (target === 'bus.frequency') return getBand('robot.lfoBusDepth');
  return getBand(target.endsWith('.gain') ? 'robot.lfoGainDepth' : 'robot.lfoDetuneDepth');
}

/**
 * A lit detune link's depth, close to no detune (docs/specs/EVEN_SEEDED_DRAWS.md §1.2; Crawford, 2026-11-01): the
 * centred draw over -1..1, folded so its peak sits at the window's floor, then floored onto the whole-percent grid so
 * every percent gets a full share. Under Classic's 1-10 % window, 1 % is the commonest depth (about 19 % of lit detune
 * links), each percent above it rarer, and 10 % the rarest (about 1 %). Rounding instead would give the floor only half
 * a share and make 2 % the commonest.
 */
function detuneLinkDepth(noiseMap: NoiseFunction2D, dataId: string, offset: number, band: SendBand): number {
  const steps = band.max - band.min;
  const folded = Math.abs(getCentredSeededVal(noiseMap, dataId, offset, -1, 1));
  return quantizeToStep(band.min + Math.min(steps, Math.floor(folded * (steps + 1))), LFO_DEPTH_MIN, LFO_DEPTH_STEP);
}

/**
 * Generate seeded LfoLinks for all 6 RobotLfoTargetId modulation targets — replaces
 * generateRobotLfoSettings's per-target shape/rate with a lane pick (spec §1.3). The quiet share and the
 * depth window are the target's band (robotLfoBandForTarget). The lane draw is roster-aware: `priorLaneCounts` is the
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
    const band = robotLfoBandForTarget(target);
    const quiet = getUniformSeededVal(noiseMap, `robot.lfo.${target}.quiet`, offset, 0, 1) < 1 - band.lit;
    if (quiet) {
      result[target] = { lane: null, depth: 0 };
      continue;
    }

    const laneT = getUniformSeededVal(noiseMap, `robot.lfo.${target}.lane`, offset, 0, 1);
    const lane = pickLane(laneT, counts);
    counts[lane]++;

    const depthId = `robot.lfo.${target}.depth`;
    const depth = target.endsWith('.detune')
      ? detuneLinkDepth(noiseMap, depthId, offset, band)
      : quantizeToStep(getUniformSeededVal(noiseMap, depthId, offset, band.min, band.max), LFO_DEPTH_MIN, LFO_DEPTH_STEP);
    result[target] = { lane, depth };
  }
  return result;
}

/**
 * A robot's five seeded sends (docs/specs/ROBOT_SENDS.md §1.2, docs/specs/ROBOT_EFFECT_SENDS.md §1.2), from the loaded
 * world's send bands (getBand, band-table T22; Classic's rows are in src/data/bands/classic.ts) at `offset` = spawn
 * count.
 * Reverb and Delay keep the three dataIds Robot Sends shipped (the old global Reverb / Delay `wet` loading rows, moved
 * to the send table by Robot Effect Sends T1 without moving a value), plus the Reverb row's own quiet roll,
 * `robot.send.reverb.quiet`, so a theme's Reverb `lit` is honoured like every other row's (Classic's lit of 1 never goes
 * quiet). All four are even draws (docs/specs/EVEN_SEEDED_DRAWS.md, T9a), so a quarter of the fleet draws no delay
 * under Classic. The Grit, Shimmer and Double sends are uniform
 * per-robot rolls, `robot.send.<room>.lit` and `robot.send.<room>`, every one read on every robot, at most one landing
 * (composeExclusiveSends). One helper serves spawnRobot and generateRobotAudioBaseline, called outside the copy branch in
 * both, so a copied robot shares its sibling's voice but not its depths, and the two cannot drift.
 */
export function generateRobotSends(noiseMap: NoiseFunction2D, offset: number): Record<RobotSendField, number> {
  return deriveSendFields(noiseMap, offset, currentSendBands());
}

/** spawnRobot's no-noise-map path (a locale that does not exist yet): the same bands, drawn from alea as
 *  Volume's fallback is. Four draws for Reverb and Delay, since each quiet roll needs its own, then a roll and a value
 *  for each effect room send (`sendGritLit`, `sendGrit`, ...). */
function generateRobotSendsFallback(localeId: string, spawnCount: number): Record<RobotSendField, number> {
  const bands = currentSendBands();
  const reverb = bands.reverbSend;
  const delay = bands.delaySend;
  const firstTwo = composeSends(
    reverb.min + alea(`${localeId}:${spawnCount}:sendReverb`)() * (reverb.max - reverb.min),
    delay.min + alea(`${localeId}:${spawnCount}:sendDelay`)() * (delay.max - delay.min),
    alea(`${localeId}:${spawnCount}:sendReverbQuiet`)(),
    alea(`${localeId}:${spawnCount}:sendQuiet`)(),
    bands,
  );
  const draw = (name: string) => ({
    roll: alea(`${localeId}:${spawnCount}:send${name}Lit`)(),
    t: alea(`${localeId}:${spawnCount}:send${name}`)(),
  });
  return { ...firstTwo, ...composeExclusiveSends({ gritSend: draw('Grit'), shimmerSend: draw('Shimmer'), doubleSend: draw('Double') }, bands) };
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
  /** Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.4): seeded, 0-100 integers, inherited on the copy branch like pitchRepeat. */
  dynamics: number;
  rests: number;
  accents: number;
  /** Mirrors spawnRobot's own lfoLinks branch (Session Storage/LFO Bank Task 18): copied on the
   *  copy branch, freshly drawn (with the roster's running lane tally) on the fresh branch. */
  lfoLinks: Record<RobotLfoTargetId, LfoLink>;
  /** Unconditional, like `name` — NOT inherited on the copy branch (a copied robot draws its own depth). */
  reverbSend: number;
  delaySend: number;
  /** Robot Effect Sends (docs/specs/ROBOT_EFFECT_SENDS.md §1.1): unconditional too, at most one of the three above 0. */
  gritSend: number;
  shimmerSend: number;
  doubleSend: number;
  /** What the deal loaded this robot under (docs/specs/OFF_SCREEN.md assumption 22), as Robot.loadedUnder; set by
   *  applyDealToBaselines on a dealt robot, absent on the rest. Not a diffed field. */
  loadedUnder?: RobotAspects;
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
  const copyRoll = getUniformSeededVal(noiseMap, 'robot.copyChance', spawnCount, 0, 1);
  const shouldCopy = copyRoll < 0.30 && priorBaselines.length > 0;

  const name = generateRobotName(noiseMap, spawnCount);
  // Outside the copy branch, like name: spawnRobot draws its sends unconditionally too.
  const sends = generateRobotSends(noiseMap, spawnCount);

  if (shouldCopy) {
    const srcIdx = Math.min(
      priorBaselines.length - 1,
      Math.floor(getUniformSeededVal(noiseMap, 'robot.copySource', spawnCount, 0, priorBaselines.length))
    );
    // name is NOT inherited from the copy source — spawnRobot generates it unconditionally,
    // outside the shouldCopy branch (see this function's own doc comment).
    return { ...priorBaselines[srcIdx], name, ...sends };
  }

  const audioAttributes = generateAudioAttributes(noiseMap, spawnCount);
  const octaveRange = audioAttributes.octaveRange ?? [2, 4] as [number, number];
  const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = deriveMelodyFields(noiseMap, spawnCount, currentMelodyBands());
  const dynamicsBand = getBand('robot.dynamics');
  const dynamics = Math.round(getUniformSeededVal(noiseMap, 'robot.dynamics', spawnCount, dynamicsBand.min, dynamicsBand.max));
  const restsBand = getBand('robot.rests');
  const rests = Math.round(getUniformSeededVal(noiseMap, 'robot.rests', spawnCount, restsBand.min, restsBand.max));
  const accentsBand = getBand('robot.accents');
  const accents = Math.round(getUniformSeededVal(noiseMap, 'robot.accents', spawnCount, accentsBand.min, accentsBand.max));
  const priorLaneCounts = tallyLanes(priorBaselines.flatMap((b) => Object.values(b.lfoLinks)));
  const lfoLinks = generateRobotLfoLinks(noiseMap, spawnCount, priorLaneCounts);

  return { name, audioAttributes, octaveRange, rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat, dynamics, rests, accents, lfoLinks, ...sends };
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
  // noteVariance, lfoLinks. Always fresh: id, name, position, melody (regenerated
  // from the copied octaveRange/rhythmicDensity/rhythmicMotifLength/noteVariance).
  const copyRoll = noiseMap
    ? getUniformSeededVal(noiseMap, 'robot.copyChance', spawnCount, 0, 1)
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
  let spawnDynamics: number;
  let spawnRests: number;
  let spawnAccents: number;
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
          ? getUniformSeededVal(noiseMap, 'robot.copySource', spawnCount, 0, robots.length)
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
    spawnDynamics = source.dynamics ?? DEFAULT_DYNAMICS;
    spawnRests = source.rests ?? DEFAULT_RESTS;
    spawnAccents = source.accents ?? DEFAULT_ACCENTS;
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

    // The Melody fields from the loading context's bands (band-table T21) - one derivation shared with the baseline
    // and the deal pass (deriveMelodyFields, Task 27); the alea fallbacks map into the same bands.
    const melodyBands = currentMelodyBands();
    if (noiseMap) {
      ({
        rhythmicDensity: spawnRhythmicDensity,
        rhythmicMotifLength: spawnRhythmicMotifLength,
        noteVariance: spawnNoteVariance,
        pitchRepeat: spawnPitchRepeat,
      } = deriveMelodyFields(noiseMap, spawnCount, melodyBands));
    } else {
      const density = melodyBands['robot.rhythmicDensity'];
      spawnRhythmicDensity = Math.round(density.min + alea(`${localeId}:${spawnCount}:density`)() * (density.max - density.min));
      spawnRhythmicMotifLength = seedToggleValue(alea(`${localeId}:${spawnCount}:motifActive`)(), melodyBands['robot.rhythmicMotifLength']);
      spawnNoteVariance = seedToggleValue(alea(`${localeId}:${spawnCount}:nvActive`)(), melodyBands['robot.noteVariance']);
      const repeat = melodyBands['robot.pitchRepeat'];
      spawnPitchRepeat = Math.round(repeat.min + alea(`${localeId}:${spawnCount}:pitchRepeat`)() * (repeat.max - repeat.min));
    }

    // Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.4): the three performance sliders, each its own dataId
    // at the spawn count, with the same alea no-noise-map fallback the composition fields have.
    const dynamicsBand = getBand('robot.dynamics');
    spawnDynamics = Math.round(
      noiseMap
        ? getUniformSeededVal(noiseMap, 'robot.dynamics', spawnCount, dynamicsBand.min, dynamicsBand.max)
        : dynamicsBand.min + alea(`${localeId}:${spawnCount}:dynamics`)() * (dynamicsBand.max - dynamicsBand.min)
    );
    const restsBand = getBand('robot.rests');
    spawnRests = Math.round(
      noiseMap
        ? getUniformSeededVal(noiseMap, 'robot.rests', spawnCount, restsBand.min, restsBand.max)
        : restsBand.min + alea(`${localeId}:${spawnCount}:rests`)() * (restsBand.max - restsBand.min)
    );
    const accentsBand = getBand('robot.accents');
    spawnAccents = Math.round(
      noiseMap
        ? getUniformSeededVal(noiseMap, 'robot.accents', spawnCount, accentsBand.min, accentsBand.max)
        : accentsBand.min + alea(`${localeId}:${spawnCount}:accents`)() * (accentsBand.max - accentsBand.min)
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

  // Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.2): the Rests / Accents post-pass, the same one
  // regenerateMelody.ts applies, so an edit reverted to its spawn value reproduces this melody, stamps included.
  const spawnMelody = applyPerformanceMarks(
    generateMelodyForRobot({
      octaveMin: octaveRange[0],
      octaveMax: octaveRange[1],
      rhythmicDensity: spawnRhythmicDensity,
      rhythmicMotifLength: spawnRhythmicMotifLength,
      noteVariance: spawnNoteVariance,
      pitchRepeat: spawnPitchRepeat,
      rand: compositionRand,
    }),
    { rests: spawnRests, accents: spawnAccents },
    buildSeededPerformance(compositionSeed),
  );

  const position = noiseMap ? generateSpawnPosition(noiseMap, spawnCount) : generateSpawnPosition((_x: number, _y: number) => 0 as number, spawnCount);

  const robot: Robot = {
    id: noiseMap ? generateRobotId(noiseMap, spawnCount) : generateRobotId((_x: number, _y: number) => 0 as number, spawnCount),
    compositionSeed,
    name: noiseMap ? generateRobotName(noiseMap, spawnCount) : generateRobotName((_x: number, _y: number) => 0 as number, spawnCount),
    identityColor: noiseMap
      ? generateRobotIdentityColor(noiseMap, spawnCount)
      : generateRobotIdentityColor((_x: number, _y: number) => 0 as number, spawnCount),
    gemSeed: noiseMap
      ? generateGemSeed(noiseMap, spawnCount)
      : generateGemSeed((_x: number, _y: number) => 0 as number, spawnCount),
    position,
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
    dynamics: spawnDynamics,
    rests: spawnRests,
    accents: spawnAccents,
    lfoLinks: spawnLfoLinks,
    masterVolume: (() => {
      const volume = getBand('robot.masterVolume');
      const seeded = noiseMap
        ? getUniformSeededVal(noiseMap, 'robot.masterVolume', spawnCount, volume.min, volume.max)
        : volume.min + alea(`${localeId}:${spawnCount}:mv`)() * (volume.max - volume.min);
      // Bass robots are louder, treble robots quieter. Register mid [1..5], neutral ~3.5.
      const registerMid = (octaveRange[0] + octaveRange[1]) / 2;
      const registerBias = (4.5 - registerMid) * 0.05;
      const raw = Math.max(0.5, Math.min(0.95, seeded + registerBias));
      // Quantized in percent-space, not against the stored fraction directly —
      // same "avoid a sub-percent grid" reasoning as Ping Variance Automation
      // (globalAudioSeed.ts).
      return quantizeToStep(raw * 100, 0, VOLUME_STEP_PERCENT) / 100;
    })(),
    // Robot Pan (docs/specs/ROBOT_PAN.md §1.1): every robot starts on Auto at centre — no noise
    // draw, so a world's existing seeded values and its sound are unchanged.
    pan: 0,
    panAuto: true,
    // Robot Sends (docs/specs/ROBOT_SENDS.md §1.2) and Robot Effect Sends (docs/specs/ROBOT_EFFECT_SENDS.md §1.2): all five,
    // always their own draw, even on the copy branch.
    ...(noiseMap ? generateRobotSends(noiseMap, spawnCount) : generateRobotSendsFallback(localeId, spawnCount)),
    docking,
    // The work loop's starting state (spec §1.2); placeRosterAtStations sets it again at the port.
    activity: docking === DockingState.Active ? 'exiting' : 'charging',
    batteryLevel,
  };

  // Add to locale store
  useLocaleStore.getState().addRobot(localeId, robot);

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
      // No manual-pan prime here, unlike the other reservation sites: a spawned robot is always
      // `panAuto: true` (above), so there is nothing to hand the engine (docs/specs/ROBOT_PAN.md §1.3).
      const reserved = AudioEngine.reserveVoice(robot.id, layers, robot.audioAttributes.adsr, robot.audioAttributes.phase, robot.audioAttributes.detune, layers[0]?.pulseWidth, robot.masterVolume, robot.audioAttributes.filterFreq, robotArticulation(robot));
      // The new voice's send gains start at 0; hand them the robot's own sends (docs/specs/ROBOT_SENDS.md §1.4).
      AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot));
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
  // The robot rides along: a rebuild spawns into a locale that is not current yet, where the engine's own lookup would
  // find no robot and register the melody without its motif accents (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5).
  AudioEngine.registerRobotMelody(robot.id, robot.melody, robot);
}

/**
 * Create the full fixed-size roster (MAX_ROBOTS robots) once, at locale load.
 * A seeded count within [INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]
 * start Active (full battery); the rest start Docked with varied seeded
 * starting battery so they don't all finish recharging in lockstep. Then
 * every robot is placed at its station's port (placeRosterAtStations). Does
 * NOT assign jobs — worldTransition.ts's initializeLocale does that for the
 * initially-Active robots immediately after this returns (see
 * docs/specs/archive/ROBOT_SYSTEMS_ENGINE.md's Architecture Decisions on why job
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

  placeRosterAtStations(localeId);
}

/**
 * Phase 43 (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, correction 2): every robot starts at its
 * station's port — assigned by roster index modulo station count — Docked ones 'charging', Active
 * ones 'exiting'. One store write for the whole roster, after the last spawn.
 */
function placeRosterAtStations(localeId: string): void {
  const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
  const stations = getStations(localeId);
  const stationById = new Map(stations.map((s) => [s.id, s]));
  const assigned = assignStationsAtLoad(robots.map((r) => r.id), stations);
  useLocaleStore.getState().setLocaleData(localeId, {
    robots: robots.map((r) => {
      const station = stationById.get(assigned[r.id])!;
      return {
        ...r,
        stationId: station.id,
        position: positionForCentre(station.port, getRobotGem(r.gemSeed)),
        activity: r.docking === DockingState.Docked ? 'charging' : 'exiting',
      };
    }),
  });
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
 * Re-register every robot's audio with AudioEngine on a cold power-on
 * (powerController.start: the page's first, or one after a replaced paused
 * world's killAll; a resume from a pause never runs it).
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
 * invalidated by it. This re-registration may be unnecessary
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
        AudioEngine.reserveVoice(robot.id, layers, robot.audioAttributes.adsr, robot.audioAttributes.phase, robot.audioAttributes.detune, layers[0]?.pulseWidth, robot.masterVolume, robot.audioAttributes.filterFreq, robotArticulation(robot));
        // releaseVoice above cleared this robot's engine-side pan; the store is the source of truth,
        // so a manual robot is handed back (docs/specs/ROBOT_PAN.md §1.3).
        if (robot.panAuto === false) AudioEngine.updateRobotPan(robot.id, robot.pan);
        // Same for the sends: the rebuilt voice starts dry, every robot is handed its own back (docs/specs/ROBOT_SENDS.md §1.4).
        AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot));
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
