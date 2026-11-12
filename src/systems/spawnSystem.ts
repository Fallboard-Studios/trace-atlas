// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import type { Vec2 } from '../types/Vec2';
import type { AudioAttributes, Robot, RobotFilterType } from '../types/Robot';
import { DockingState } from '../types/Robot';
import {
  DEFAULT_RHYTHMIC_DENSITY,
  DEFAULT_RHYTHMIC_MOTIF_LENGTH,
  DEFAULT_NOTE_VARIANCE,
  DEFAULT_PITCH_REPEAT,
  DEFAULT_DYNAMICS,
  DEFAULT_RESTS,
  DEFAULT_ACCENTS,
} from '../engine/melodyGenerator';
import type { ToggleValue } from '../engine/melodyGenerator';
import { composeRobotMelody, melodyWorldKey } from '../engine/regenerateMelody';
import { AudioEngine } from '../engine/AudioEngine';
import type { OscillatorLayer } from '../types/layeredAudio';
import type { Company } from '../types/Company';
import {
  DEV_TUNING, MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX,
  INITIAL_COMPANIES_MIN, INITIAL_COMPANIES_MAX, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX, FREELANCERS_MIN,
  BATTERY_SIZE_MIN, BATTERY_SIZE_MAX,
} from '../constants';
import { recordByField, robotSendLevels, type RobotSendField } from '../data/robotSends';
import { getBand } from '../data/bands/loadingContext';
import type { RobotAspects } from '../data/bands/dealAspects';
import useLocaleStore from '../stores/localeStore';
import { primeRobotLinks, primeRosterLinks } from './robotLfoLinks';
import {
  composeExclusiveSends,
  composeSends,
  currentEnvelopeBands,
  currentMelodyBands,
  currentMotionBands,
  audibleDensityBand,
  currentPerformanceBands,
  currentSendBands,
  currentVoiceBands,
  deriveEnvelopeFields,
  deriveLfoLinks,
  deriveMelodyFields,
  deriveOctaveRange,
  derivePerformanceFields,
  derivePortamento,
  deriveSendFields,
  deriveVoiceFields,
  seedToggleValue,
} from './robotFieldDerivation';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getCentredSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import type { RobotLfoTargetId, LfoLaneId, LfoLink } from '../types/lfo';
import { tallyLanes } from '../utils/lfoLaneDraw';
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

/** Mirrors the Volume slider's own step, in percent-space (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const VOLUME_STEP_PERCENT = 1;

/** A robot's master volume from a draw in the robot.masterVolume band: bass robots louder, treble robots quieter
 *  (register mid [1..5], neutral ~3.5), clamped, then quantized in percent-space, not against the stored fraction
 *  directly - the same "avoid a sub-percent grid" reasoning as Ping Variance Automation (globalAudioSeed.ts). */
function masterVolumeFrom(seeded: number, octaveRange: readonly [number, number]): number {
  const registerMid = (octaveRange[0] + octaveRange[1]) / 2;
  const registerBias = (4.5 - registerMid) * 0.05;
  const raw = Math.max(0.5, Math.min(0.95, seeded + registerBias));
  return quantizeToStep(raw * 100, 0, VOLUME_STEP_PERCENT) / 100;
}

/** A robot's seeded master volume at `spawnCount`: drawn even in the loaded world's band, a company member's too (it
 *  draws its own, biased by its inherited register). spawnRobot and the roster baseline share it, so
 *  a loading change can compare it (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6). */
function seedMasterVolume(noiseMap: NoiseFunction2D, spawnCount: number, octaveRange: readonly [number, number]): number {
  const volume = getBand('robot.masterVolume');
  return masterVolumeFrom(getUniformSeededVal(noiseMap, 'robot.masterVolume', spawnCount, volume.min, volume.max), octaveRange);
}

// Simple word lists for deterministic-looking robot names. ADJECTIVES is exported — reused by
// generateCompanyName below (Roadmap Phase 10), the same "sounds like this universe" half, paired
// with a distinct COMPANY_NOUNS list so a generated company name can never take the exact same
// word-pair form a robot name can (see docs/specs/archive/COMPANIES.md §7.3).
export const ADJECTIVES = ['Iron', 'Null', 'Silent', 'Drift', 'Azure', 'Rust', 'Neon', 'Glass', 'Solar', 'Tidal'];
export const NOUNS = ['Drifter', 'Tide', 'Warden', 'Seeker', 'Courier', 'Wisp', 'Beacon', 'Nomad', 'Rover', 'Pilot'];

function generateRobotName(noiseMap: NoiseFunction2D, offset: number): string {
  const a = ADJECTIVES[Math.floor(getUniformSeededVal(noiseMap, 'robot.name.adj', offset, 0, ADJECTIVES.length))];
  const n = NOUNS[Math.floor(getUniformSeededVal(noiseMap, 'robot.name.noun', offset, 0, NOUNS.length))];
  return `${a} ${n}`;
}

/**
 * Deterministic per-robot identity color (Roadmap Phase 14, docs/specs/
 * COLOR_SCHEME_TRAIT_THEMING.md §1.4) — UI chrome only (RobotSelectionCard/RobotDisplaySection),
 * never the SVG body's own ADSR/waveform-derived HSL fill. Same generation mechanism as
 * generateRobotName above: one even draw against ROBOT_IDENTITY_COLOR_NAMES (the 18 hue
 * keys — black/white/darkGray are deliberately excluded there, not filtered here), so every hue
 * colours an equal share of robots (docs/specs/EVEN_WORLD_DRAWS.md).
 */
function generateRobotIdentityColor(noiseMap: NoiseFunction2D, offset: number): string {
  // Clamped (matching the weighted picks' own last-option fallback, not generateRobotName's
  // unclamped one) since the failure mode of an out-of-range index here is a visibly broken
  // undefined CSS custom property, not just a missing name syllable.
  const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getUniformSeededVal(noiseMap, 'robot.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
  return ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[index]];
}

/** Exclusive upper bound for Robot.gemSeed. */
const GEM_SEED_MAX = 2 ** 31;

/**
 * The robot's gem-polygon body seed (Roadmap Phase 39, docs/specs/GEM_POLYGON_ROBOTS.md §1.1) —
 * same shape as generateRobotIdentityColor above: identity, not audio, drawn once at spawn,
 * never inherited from a company founder. An even draw, so seeds rarely repeat across worlds
 * (docs/specs/EVEN_WORLD_DRAWS.md); clamped as a guard, the even draw itself stays under `max`.
 */
function generateGemSeed(noiseMap: NoiseFunction2D, offset: number): number {
  return Math.min(GEM_SEED_MAX - 1, Math.floor(getUniformSeededVal(noiseMap, 'robot.gem.seed', offset, 0, GEM_SEED_MAX)));
}

/**
 * A robot's battery size (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.3): one even draw per robot, so the sizes
 * fill the band rather than bunch in its middle. Drawn at spawn, a company member's too (B2). Pure and exported,
 * so lifecycleSim.ts's roster shares it; the band is an argument so the sims can try others.
 */
export function generateBatterySize(noiseMap: NoiseFunction2D, spawnCount: number, min = BATTERY_SIZE_MIN, max = BATTERY_SIZE_MAX): number {
  return getUniformSeededVal(noiseMap, 'robot.batterySize', spawnCount, min, max);
}

// Phase 37's seeded greeble set (generateGreebles, GREEBLE_COUNT_RANGE and its three count/kind/
// slot dataIds) was retired in Phase 39 Task 11 — the gem robot's seeded detail is its geometry
// (gemSeed above). The dataIds are retired, not renamed.

// Org-flavored noun list for company names (Roadmap Phase 10) — distinct from robot NOUNS above,
// deliberately, so a company and a robot can never generate the identical name.
export const COMPANY_NOUNS = ['Collective', 'Consortium', 'Guild', 'Division', 'Outfit', 'Crew', 'Cartel', 'Syndicate'];

/**
 * Deterministic, human-legible company name — same generation mechanism as generateRobotName
 * (ADJECTIVES + a word-list draw, the same even draw), but exported: unlike robot names,
 * a company's suggested name is re-shown to the user at Create time (CompanyCrudControls), so it
 * needs a reuse point robot names never did.
 */
export function generateCompanyName(noiseMap: NoiseFunction2D, offset: number): string {
  const a = ADJECTIVES[Math.floor(getUniformSeededVal(noiseMap, 'company.name.adj', offset, 0, ADJECTIVES.length))];
  const n = COMPANY_NOUNS[Math.floor(getUniformSeededVal(noiseMap, 'company.name.noun', offset, 0, COMPANY_NOUNS.length))];
  return `${a} ${n}`;
}

/** Deterministic company ID — mirrors generateRobotId's shape (own dataId, own counter namespace,
 *  no crypto.randomUUID()). Exported (like generateCompanyName/generateCompanyIdentityColor
 *  above) so generateCompanyRosterBaseline below — and Session Storage's sessionDiff.ts, which
 *  needs a company's id to match it against a live company — can call it directly. */
export function generateCompanyId(noiseMap: NoiseFunction2D, index: number): string {
  const idSeed = getUniformSeededVal(noiseMap, 'company.id', index, 0, 1);
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
    const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getUniformSeededVal(noiseMap, dataId, offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
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
 * the suffix is an even draw under its own 'robot.id' dataId, so it varies from
 * world to world at every spawn count (docs/specs/EVEN_WORLD_DRAWS.md). Required so Session Storage
 * (Phase 20) can reapply Robot Options overrides by ID after the roster
 * regenerates from a reload or shared link — the same coordinates always
 * replay the same spawnCount sequence and therefore the same ID sequence.
 */
function generateRobotId(noiseMap: NoiseFunction2D, spawnCount: number): string {
  const idSeed = getUniformSeededVal(noiseMap, 'robot.id', spawnCount, 0, 1);
  return `robot-${spawnCount}-${idSeed.toString(36).slice(2, 10)}`;
}

/**
 * Deterministic melody-generation seed (Roadmap Phase 31) — own dataId ('robot.compositionSeed'),
 * an even draw (docs/specs/EVEN_SEEDED_DRAWS.md), so seeds rarely repeat across a fleet. Always fresh
 * per robot: computed unconditionally in spawnRobot, a company member's included, never inherited
 * from its founder (same treatment as id/name/melody itself).
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
    x: getUniformSeededVal(noiseMap, 'spawn.pos.x', offset, 0, WORLD_WIDTH),
    y: WORLD_HEIGHT + OFFSCREEN_OFFSET + getUniformSeededVal(noiseMap, 'spawn.pos.y', offset, 0, 50),
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

  // Seeded portamento — most robots don't glide; a glider slurs each note into the next — through the Motion family's
  // derivation (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7a).
  const portamento = derivePortamento(noiseMap, offset, currentMotionBands());

  // Seeded octave register — a direct [min, max] tuple, no Hz indirection, through the robot.octaveRegister pick
  // (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6).
  const octaveRange = deriveOctaveRange(noiseMap, offset, getBand('robot.octaveRegister'));

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

// ========================================
// LFO BANK (docs/specs/LFO_BANK.md §1.3)
// ========================================

/**
 * Generate seeded LfoLinks for all 6 RobotLfoTargetId modulation targets under the loaded world's Motion bands,
 * through the Motion family's derivation (deriveLfoLinks, robotFieldDerivation.ts, since
 * docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7a). `priorLaneCounts` is the tally of every already-spawned robot in
 * the locale (computed by spawnRobot before calling this).
 */
export function generateRobotLfoLinks(
  noiseMap: NoiseFunction2D,
  offset: number,
  priorLaneCounts: Readonly<Record<LfoLaneId, number>>,
): Record<RobotLfoTargetId, LfoLink> {
  return deriveLfoLinks(noiseMap, offset, currentMotionBands(), priorLaneCounts);
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
 * (composeExclusiveSends). One helper serves spawnRobot and generateRobotAudioBaseline for an original, so the two
 * cannot drift; a company member takes its founder's five sends instead (Company Families B5).
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
 * A robot's audio-relevant seeded fields — the shape spawnRobot's founder branch reads from a live
 * Robot object, extracted so it can be replayed for baseline comparison (Session Storage,
 * docs/specs/SESSION_STORAGE.md) without touching the store spawnRobot itself reads from.
 */
export interface RobotAudioBaseline {
  /** Always the robot's own draw — a company member gets its own name, not its founder's. */
  name: string;
  audioAttributes: AudioAttributes;
  octaveRange: [number, number];
  rhythmicDensity: number;
  rhythmicMotifLength: ToggleValue;
  noteVariance: ToggleValue;
  pitchRepeat: number;
  /** Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.4): seeded, 0-100 integers, a member's from its founder like pitchRepeat. */
  dynamics: number;
  rests: number;
  accents: number;
  /** Mirrors spawnRobot's own lfoLinks branch (Session Storage/LFO Bank Task 18): a member's are its
   *  founder's, an original's freshly drawn (with the roster's running lane tally). */
  lfoLinks: Record<RobotLfoTargetId, LfoLink>;
  /** A member's five sends are its founder's (Company Families B5), so a section sits in one space. */
  reverbSend: number;
  delaySend: number;
  /** Robot Effect Sends (docs/specs/ROBOT_EFFECT_SENDS.md §1.1): unconditional too, at most one of the three above 0. */
  gritSend: number;
  shimmerSend: number;
  doubleSend: number;
  /** Always the robot's own draw, like `name`, biased by the (possibly inherited) register (seedMasterVolume): what a loading change
   *  compares (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T6). A listening choice, so the session diff never reads it. */
  masterVolume: number;
  /** What the deal loaded this robot under (docs/specs/OFF_SCREEN.md assumption 22), as Robot.loadedUnder; set by
   *  applyDealToBaselines on a dealt robot, absent on the rest. Not a diffed field. */
  loadedUnder?: RobotAspects;
}

/**
 * Replays spawnRobot's draws for an original robot at `spawnCount`, given the baselines already
 * computed for every earlier robot in the same roster (`priorBaselines`, in spawn order, read only
 * for the LFO lane tally) — pure, no store read/write. A company member's baseline is not this but
 * its founder's (memberBaseline, generateRobotRosterBaseline). Only the real-noiseMap path is
 * replayed; spawnRobot's own no-noiseMap `alea(...)` fallback (used only when a locale/coordinates
 * don't exist yet) has nothing meaningful to diff against, so it's not mirrored here.
 */
export function generateRobotAudioBaseline(
  noiseMap: NoiseFunction2D,
  spawnCount: number,
  priorBaselines: readonly RobotAudioBaseline[],
): RobotAudioBaseline {
  const name = generateRobotName(noiseMap, spawnCount);
  const sends = generateRobotSends(noiseMap, spawnCount);

  const audioAttributes = generateAudioAttributes(noiseMap, spawnCount);
  const octaveRange = audioAttributes.octaveRange ?? [2, 4] as [number, number];
  const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = deriveMelodyFields(noiseMap, spawnCount, currentMelodyBands(), audioAttributes.adsr.attack);
  const { dynamics, rests, accents } = derivePerformanceFields(noiseMap, spawnCount, currentPerformanceBands());
  const priorLaneCounts = tallyLanes(priorBaselines.flatMap((b) => Object.values(b.lfoLinks)));
  const lfoLinks = generateRobotLfoLinks(noiseMap, spawnCount, priorLaneCounts);

  const masterVolume = seedMasterVolume(noiseMap, spawnCount, octaveRange);

  return { name, audioAttributes, octaveRange, rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat, dynamics, rests, accents, lfoLinks, ...sends, masterVolume };
}

/** A company member's baseline at `spawnCount` (Company Families §1.11): its founder's, every field inherited — the
 *  voice, the composition and performance settings, the LFO links and the five sends (B5) — with its own name and its
 *  own volume, drawn as an original's over the inherited register. spawnRobot's founder branch, replayed. */
function memberBaseline(noiseMap: NoiseFunction2D, spawnCount: number, founder: RobotAudioBaseline): RobotAudioBaseline {
  return {
    ...founder,
    name: generateRobotName(noiseMap, spawnCount),
    masterVolume: seedMasterVolume(noiseMap, spawnCount, founder.octaveRange),
  };
}

/**
 * Each company member's founder, by roster index (Company Families B6): the company's lowest index. Founders and
 * freelancers are absent. One reading of generateCompanyMembership for spawnInitialRoster and the baselines alike.
 */
export function companyFounders(membership: readonly (readonly number[])[]): Map<number, number> {
  const founders = new Map<number, number>();
  for (const members of membership) {
    const founder = Math.min(...members);
    for (const member of members) if (member !== founder) founders.set(member, founder);
  }
  return founders;
}

/**
 * Replays spawnInitialRoster's robots for a full `count`-robot roster in spawn order, purely from the noise map: an
 * original through generateRobotAudioBaseline, a company member (generateCompanyMembership) as its founder's baseline
 * with its own name and volume. Used by sessionDiff.ts to compute what a locale's whole roster would look like from the
 * seed alone, to diff a live roster against.
 */
export function generateRobotRosterBaseline(noiseMap: NoiseFunction2D, count: number): RobotAudioBaseline[] {
  const founders = companyFounders(generateCompanyMembership(noiseMap, count));
  const baselines: RobotAudioBaseline[] = [];
  for (let i = 0; i < count; i++) {
    const founder = founders.get(i);
    baselines.push(founder === undefined ? generateRobotAudioBaseline(noiseMap, i, baselines) : memberBaseline(noiseMap, i, baselines[founder]));
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
 * The seeded companies' members as roster indices (Company Families §1.11, Task 4): pure, from the noise map alone, so
 * spawn can know the membership before any robot exists. The draws ('company.count', 'company.size',
 * 'company.member', even since docs/specs/EVEN_WORLD_DRAWS.md) are spawnInitialCompanies' own from before families, in
 * the same order, over a pool of indices instead of live ids. B4's cap: a company takes at most the pool less FREELANCERS_MIN, and a company
 * that cannot then reach COMPANY_SIZE_MIN is not made (B14), nor is any after it (the pool only shrinks). A world the
 * cap does not touch keeps exactly the membership it had. Each company is listed in draw order, so its founder (the
 * lowest index, B6) is `Math.min(...members)`, not `members[0]`.
 */
export function generateCompanyMembership(noiseMap: NoiseFunction2D, rosterSize: number = MAX_ROBOTS): number[][] {
  let pool = Array.from({ length: rosterSize }, (_, i) => i);
  const companyCount = INITIAL_COMPANIES_MIN + Math.floor(
    getUniformSeededVal(noiseMap, 'company.count', 0, 0, INITIAL_COMPANIES_MAX - INITIAL_COMPANIES_MIN + 1)
  );

  const companies: number[][] = [];
  for (let c = 0; c < companyCount; c++) {
    const size = Math.min(pool.length - FREELANCERS_MIN, COMPANY_SIZE_MIN + Math.floor(
      getUniformSeededVal(noiseMap, 'company.size', c, 0, COMPANY_SIZE_MAX - COMPANY_SIZE_MIN + 1)
    ));
    if (size < COMPANY_SIZE_MIN) break;

    const members: number[] = [];
    for (let i = 0; i < size; i++) {
      const idx = Math.floor(getUniformSeededVal(noiseMap, 'company.member', c * 100 + i, 0, pool.length));
      members.push(pool[idx]);
      pool = pool.filter((_, j) => j !== idx);
    }
    companies.push(members);
  }
  return companies;
}

/**
 * The seed-derived companies for a roster of `robotIds` in spawn order: generateCompanyMembership's indices turned
 * into ids, with each company's seeded id and name — pure, no store read/write. spawnInitialCompanies makes the same
 * companies from the same membership, so a fresh world's companies always match this baseline.
 */
export function generateCompanyRosterBaseline(noiseMap: NoiseFunction2D, robotIds: readonly string[]): CompanyRosterBaseline[] {
  return generateCompanyMembership(noiseMap, robotIds.length).map((members, c) => ({
    id: generateCompanyId(noiseMap, c),
    name: generateCompanyName(noiseMap, c),
    robotIds: members.map((i) => robotIds[i]),
  }));
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
 * @param options.founderIndex A company member's founder, by roster index (Company Families §1.11):
 *   the robot already in the store at that index. The member takes its voice, composition and
 *   performance settings, LFO links and five sends, and draws the rest as an original does at its
 *   own spawn count; it carries `lineage: { founderIndex }`. Absent, or with no robot there: an original.
 */
export function spawnRobot(localeId: string, options?: { docking?: DockingState; batteryLevel?: number; founderIndex?: number }): void {
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

  // A company member's founder, already spawned (it has the lower index, B6). Members inherit what
  // generateRobotRosterBaseline's memberBaseline replays; everything else is drawn as an original's.
  const founderIndex = options?.founderIndex;
  const founder = founderIndex === undefined ? undefined : robots[founderIndex];

  // Always the robot's own, a member's included -- same treatment as id/name/melody (see
  // generateCompositionSeed's own doc comment).
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
  // unconditionally, before the founder/original branch, since the founder branch's own fallback
  // (founder.lfoLinks ?? generate) may still need it.
  const priorLaneCounts = tallyLanes(robots.flatMap((r) => Object.values(r.lfoLinks ?? {})));

  if (founder) {
    audioAttributes = founder.audioAttributes as ReturnType<typeof generateAudioAttributes>;
    octaveRange = founder.octaveRange;
    spawnRhythmicDensity = founder.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY;
    spawnRhythmicMotifLength = founder.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH;
    spawnNoteVariance = founder.noteVariance ?? DEFAULT_NOTE_VARIANCE;
    spawnPitchRepeat = founder.pitchRepeat ?? DEFAULT_PITCH_REPEAT;
    spawnDynamics = founder.dynamics ?? DEFAULT_DYNAMICS;
    spawnRests = founder.rests ?? DEFAULT_RESTS;
    spawnAccents = founder.accents ?? DEFAULT_ACCENTS;
    spawnLfoLinks = founder.lfoLinks ?? generateRobotLfoLinks(noiseMap ?? ((_x: number, _y: number) => 0 as number), spawnCount, priorLaneCounts);
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
    // and the deal pass (deriveMelodyFields, Task 27); the alea fallbacks map into the same bands. The density reads the
    // attack just drawn (the attack rail, audibleDensityBand).
    const melodyBands = currentMelodyBands();
    if (noiseMap) {
      ({
        rhythmicDensity: spawnRhythmicDensity,
        rhythmicMotifLength: spawnRhythmicMotifLength,
        noteVariance: spawnNoteVariance,
        pitchRepeat: spawnPitchRepeat,
      } = deriveMelodyFields(noiseMap, spawnCount, melodyBands, audioAttributes.adsr.attack));
    } else {
      const density = audibleDensityBand(melodyBands['robot.rhythmicDensity'], audioAttributes.adsr.attack, melodyBands.bpm);
      spawnRhythmicDensity = Math.round(density.min + alea(`${localeId}:${spawnCount}:density`)() * (density.max - density.min));
      spawnRhythmicMotifLength = seedToggleValue(alea(`${localeId}:${spawnCount}:motifActive`)(), melodyBands['robot.rhythmicMotifLength']);
      spawnNoteVariance = seedToggleValue(alea(`${localeId}:${spawnCount}:nvActive`)(), melodyBands['robot.noteVariance']);
      const repeat = melodyBands['robot.pitchRepeat'];
      spawnPitchRepeat = Math.round(repeat.min + alea(`${localeId}:${spawnCount}:pitchRepeat`)() * (repeat.max - repeat.min));
    }

    // Robot Performance (docs/specs/ROBOT_PERFORMANCE.md §1.4): the three performance sliders through the family's
    // one derivation (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md T7a), with the same alea no-noise-map fallback the
    // composition fields have.
    const performanceBands = currentPerformanceBands();
    if (noiseMap) {
      ({ dynamics: spawnDynamics, rests: spawnRests, accents: spawnAccents } = derivePerformanceFields(noiseMap, spawnCount, performanceBands));
    } else {
      const fallback = (key: keyof typeof performanceBands, name: string) => {
        const band = performanceBands[key];
        return Math.round(band.min + alea(`${localeId}:${spawnCount}:${name}`)() * (band.max - band.min));
      };
      spawnDynamics = fallback('robot.dynamics', 'dynamics');
      spawnRests = fallback('robot.rests', 'rests');
      spawnAccents = fallback('robot.accents', 'accents');
    }
  }

  // Seeded melody (Roadmap Phase 31) -- the same recipe and world key regenerateMelody.ts uses for
  // every later edit (composeRobotMelody: the rhythm and performance streams on the world and the
  // rhythm shape, the composition stream on the robot's seed, Company Families §1.11), so a
  // post-spawn edit reverted to its original value reproduces this exact melody, stamps included
  // (no "first-edit ratchet").
  const spawnMelody = composeRobotMelody({
    compositionSeed,
    octaveRange,
    rhythmicDensity: spawnRhythmicDensity,
    rhythmicMotifLength: spawnRhythmicMotifLength,
    noteVariance: spawnNoteVariance,
    pitchRepeat: spawnPitchRepeat,
    rests: spawnRests,
    accents: spawnAccents,
  }, melodyWorldKey(localeId));

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
    // audioMode is the user's Solo/Mute/Highlight alone: a Docked robot is muted by its docking
    // state (robotAudibility.ts's isDockMuted), not by this toggle, and not by withholding voice
    // reservation/melody registration below — those happen unconditionally.
    audioMode: 'none',
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
      return noiseMap
        ? seedMasterVolume(noiseMap, spawnCount, octaveRange)
        : masterVolumeFrom(volume.min + alea(`${localeId}:${spawnCount}:mv`)() * (volume.max - volume.min), octaveRange);
    })(),
    // Robot Pan (docs/specs/ROBOT_PAN.md §1.1): every robot starts on Auto at centre — no noise
    // draw, so a world's existing seeded values and its sound are unchanged.
    pan: 0,
    panAuto: true,
    // Robot Sends (docs/specs/ROBOT_SENDS.md §1.2) and Robot Effect Sends (docs/specs/ROBOT_EFFECT_SENDS.md §1.2): all five,
    // a member's from its founder (Company Families B5, so a section sits in one space), an original's its own draw.
    ...(founder
      ? recordByField(({ field }) => founder[field])
      : noiseMap ? generateRobotSends(noiseMap, spawnCount) : generateRobotSendsFallback(localeId, spawnCount)),
    docking,
    // The work loop's starting state (spec §1.2); placeRosterAtStations sets it again at the port.
    activity: docking === DockingState.Active ? 'exiting' : 'charging',
    batteryLevel,
    // Always its own draw, a member's too (spec §1.3, B2); the alea fallback maps into the same band.
    batterySize: noiseMap
      ? generateBatterySize(noiseMap, spawnCount)
      : BATTERY_SIZE_MIN + alea(`${localeId}:${spawnCount}:batterySize`)() * (BATTERY_SIZE_MAX - BATTERY_SIZE_MIN),
    // Members only (spec §1.11): the founder the deal derives it from. Kept when it is moved by hand (B15).
    ...(founder && founderIndex !== undefined ? { lineage: { founderIndex } } : {}),
  };

  // Add to locale store
  useLocaleStore.getState().addRobot(localeId, robot);

  // Every robot gets a reserved voice and registered melody, regardless of
  // docking state — mute is enforced by AudioEngine reading `audioMode` and
  // `docking` at trigger time (see triggerWithCap), not by withholding
  // registration. This is what lets a Solo beat the dock: the synth and
  // melody are already live, so soloing a Docked robot is enough to hear it.
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
      ? getUniformSeededVal(noiseMap, 'roster.activeCount', 0, 0, INITIAL_ACTIVE_ROBOTS_MAX - INITIAL_ACTIVE_ROBOTS_MIN + 1)
      : alea(`${localeId}:activeCount`)() * (INITIAL_ACTIVE_ROBOTS_MAX - INITIAL_ACTIVE_ROBOTS_MIN + 1)
  );

  // The companies first (Company Families §1.11): each member spawns from its founder, which has the
  // lower index and so is already in the store. spawnInitialCompanies makes the same companies after.
  const founders = noiseMap ? companyFounders(generateCompanyMembership(noiseMap, MAX_ROBOTS)) : new Map<number, number>();

  for (let i = 0; i < MAX_ROBOTS; i++) {
    const founderIndex = founders.get(i);
    if (i < activeCount) {
      spawnRobot(localeId, { docking: DockingState.Active, batteryLevel: 100, founderIndex });
    } else {
      const dockedBattery = Math.floor(
        noiseMap
          ? getUniformSeededVal(noiseMap, 'roster.dockedBattery', i, 0, 100)
          : alea(`${localeId}:dockedBattery:${i}`)() * 100
      );
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: dockedBattery, founderIndex });
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
 * Create the seeded set of Companies for a fresh locale (Roadmap Phase 10) — 2-3 companies of a
 * seeded 3-4 robots each, from the roster this locale already has (spawnInitialRoster must have run
 * first). The membership is generateCompanyMembership's (Company Families Task 4), turned into this
 * roster's ids, so it matches generateCompanyRosterBaseline by construction: no robot is claimed
 * twice, and at least FREELANCERS_MIN robots stay Freelance (`companyId` undefined). Distinct from
 * `MAX_COMPANIES` (the CRUD ceiling on manual company creation afterward) — this function never
 * reads that constant.
 */
export function spawnInitialCompanies(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);

  generateCompanyRosterBaseline(noiseMap, locale.robots.map((r) => r.id)).forEach(({ id, name, robotIds }, c) => {
    // usedColors reflects every company generated earlier in this same loop — addCompany (below)
    // runs before the next iteration reaches this line, so useLocaleStore already has them.
    const usedColors = (useLocaleStore.getState().getLocaleById(localeId)?.companies ?? []).map((existing) => existing.color);
    const company: Company = { id, name, color: generateCompanyIdentityColor(noiseMap, c, usedColors), robotIds };
    useLocaleStore.getState().addCompany(localeId, company);
    robotIds.forEach((robotId) => useLocaleStore.getState().updateRobot(localeId, robotId, { companyId: company.id }));
  });
}

/**
 * Re-register every robot's audio with AudioEngine on a cold power-on
 * (powerController.start: the page's first, or one after a replaced paused
 * world's killAll; a resume from a pause never runs it).
 * This release-then-reserve pass predates this phase and was already
 * unconditional on `killAll()` for whichever robots it covered — this phase
 * just widened *which* robots that is: every robot now keeps its voice
 * reserved and melody registered across a dock cycle (the dock's mute is the
 * docking state, robotAudibility.ts's isDockMuted), not just the old
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
