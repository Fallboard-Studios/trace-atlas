// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import type { NoiseFunction2D } from 'simplex-noise';
import type { Vec2 } from '../types/Vec2';
import type { AudioAttributes, WaveformType, Robot, EnvelopeCurveName, RobotFilterType } from '../types/Robot';
import { DockingState, ENVELOPE_CURVE_NAMES } from '../types/Robot';
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
  INITIAL_COMPANIES_MIN, INITIAL_COMPANIES_MAX, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX, ROBOT_BUS_FILTER_Q,
  SEND_STEP_PERCENT,
} from '../constants';
import {
  EXCLUSIVE_SEND_FIELDS,
  SEND_FIELD_ROOM,
  type ExclusiveSendField,
} from '../data/robotSendLoadingRanges';
import { ROBOT_SEND_FIELDS, robotSendLevels, type RobotSendField } from '../data/robotSends';
import { getBand } from '../data/bands/loadingContext';
import { resolveBands } from '../data/bands/resolveBands';
import { dealAspects, type RobotAspects } from '../data/bands/dealAspects';
import type { BandTable, PickBand, SendBand, ToggleBand } from '../data/bands/bandKeys';
import { ASPECT_FAMILY_IDS, type AspectFamilyId, type EnvelopeBandKey, type MelodyBandKey, type VoiceBandKey } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';
import type { LoadingIdentity } from '../data/bands/loadingIdentity';
import { useLoadingStore } from '../stores/loadingStore';
import { regenerateMelody } from '../engine/regenerateMelody';
import useLocaleStore from '../stores/localeStore';
import { primeRobotLinks, primeRosterLinks } from './robotLfoLinks';
import type { SwellRobotAttributeId } from '../types/audioSwell';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
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

// Signature Array is a fixed 3-slot layer array (Roadmap Phase 9) — Baseline/Coaxial/Harmonic,
// replacing the old variable 1..MAX_LAYERS count.
const LAYER_COUNT = 3;
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

// ========================================
// ROBOT ARTICULATION (docs/specs/ROBOT_ARTICULATION.md §1.2)
// ========================================
// Portamento, envelope curves and the bus filter's resonance and shape are minority traits: most robots keep the plain
// sound (open lowpass, no glide, linear curves) and a few stand out. Each trait's band carries its share as `lit`
// (robot.portamento, robot.shapedAttack, robot.shapedRelease, robot.accentFilterFreq in the band table), compared
// against a [0, 1] draw from a smooth simplex sample, not a uniform coin: those draws bunch in roughly [0.04, 0.96]
// around 0.5, so a nominal 12 % share of 0.12 would land near the 3rd percentile. Each share was picked from the
// measured draw (6,000 robots across 150 worlds, 2026-10-13); classic.ts records the rates, and spawnSystem.test.ts
// pins the bands over 400 seeded robots.

/** Mirrors the Portamento slider's own step (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const PORTAMENTO_STEP = 0.01;

/** Share of accent robots that are bandpass rather than lowpass (never highpass: it would thin a robot out of the mix).
 *  A plain coin over the accent robots, not a band. */
const ACCENT_BANDPASS_SHARE = 0.4;
/** Mirrors the Resonance slider's own step (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const FILTER_Q_STEP = 0.1;

/**
 * An envelope-curve draw: 'linear' (today's sound) for most robots, otherwise one of the six
 * non-linear names. Two draws — whether this robot shapes the stage at all, then which curve —
 * so the shaped share is set by `shapedThreshold` alone, not by the number of curves.
 */
function seedCurve(noiseMap: NoiseFunction2D, dataId: string, offset: number, shapedThreshold: number): EnvelopeCurveName {
  if (getSeededVal(noiseMap, `${dataId}.shaped`, offset, 0, 1) >= shapedThreshold) return 'linear';
  const shapes = ENVELOPE_CURVE_NAMES.filter((name) => name !== 'linear');
  // Sampled at its own row (offset * 10 + 1, the layers' trick): a robot only gets here when the shaped
  // draw above came out low, and a neighbouring sample of the same smooth noise comes out low too, which
  // left half the curves unreachable (measured: release never drew bounce, ripple or step).
  const pick = Math.floor(getSeededVal(noiseMap, `${dataId}.which`, offset * 10 + 1, 0, shapes.length));
  return shapes[Math.min(shapes.length - 1, pick)];
}

/** Mirrors the Volume slider's own step, in percent-space (SEEDED_SLIDER_VALUE_QUANTIZATION). */
const VOLUME_STEP_PERCENT = 1;

/**
 * Seed a Motif Length/Note Variance-shaped { active, value } field from one consolidated [0, 1) draw
 * (docs/specs/archive/STEPPER_TO_SLIDER.md) — replaces the old two-draw (separate active/value) scheme. `raw <
 * band.offShare` lands the field off (value: 0); the remaining `1 - offShare` span maps uniformly onto the whole
 * numbers band.min..band.max (1-8 under Classic: robot.rhythmicMotifLength and robot.noteVariance in the band table,
 * each its own row so the two fields stay independently tunable even though they currently agree). `active` is always
 * derived from the resulting `value > 0`, never drawn independently. The deal pass (Task 27) hands an aspect's band in.
 */
function seedToggleValue(raw: number, band: ToggleBand): ToggleValue {
  if (raw < band.offShare) return { active: false, value: 0 };
  const fraction = (raw - band.offShare) / (1 - band.offShare); // 0..1 across the "on" span
  const span = band.max - band.min + 1; // the whole numbers min..max
  const value = band.min + Math.min(span - 1, Math.floor(fraction * span));
  return { active: true, value };
}

/** The four Melody fields a robot draws (docs/specs/MELODY_SYSTEM.md) - the deal's one family in v1. */
type MelodyFields = Pick<RobotAudioBaseline, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat'>;

/** The theme's Melody bands as the loading context holds them now (getBand at the draw, band-table T21). */
function currentMelodyBands(): Pick<BandTable, MelodyBandKey> {
  return {
    'robot.rhythmicDensity': getBand('robot.rhythmicDensity'),
    'robot.noteVariance': getBand('robot.noteVariance'),
    'robot.rhythmicMotifLength': getBand('robot.rhythmicMotifLength'),
    'robot.pitchRepeat': getBand('robot.pitchRepeat'),
  };
}

/**
 * The four Melody fields from a robot's own spawn index under `bands` - the theme's at spawn (currentMelodyBands), an
 * aspect's when the deal re-derives them (applyDealToBaselines: resolveBands(theme, { melody: aspect })). The same
 * noise, dataIds and formulas either way, so a dealt robot is exactly what it would have been had it spawned under the
 * aspect (docs/specs/OFF_SCREEN.md assumption 22). The toggle fields reuse the old '.active' dataIds verbatim (not a
 * freshly-named consolidated key): getSeededVal's simplex slice is keyed off the exact dataId string, so a new string
 * would sample a different curve with no guarantee of matching the already-tuned ~85%/15% split against the band's
 * offShare; the old '.value' dataIds are retired, value is derived from this same draw.
 */
function deriveMelodyFields(noiseMap: NoiseFunction2D, spawnIndex: number, bands: Pick<BandTable, MelodyBandKey>): MelodyFields {
  const density = bands['robot.rhythmicDensity'];
  const rhythmicDensity = Math.round(getSeededVal(noiseMap, 'robot.rhythmicDensity', spawnIndex, density.min, density.max));
  const motifRaw = getSeededVal(noiseMap, 'robot.rhythmicMotifLength.active', spawnIndex, 0, 1);
  const rhythmicMotifLength = seedToggleValue(motifRaw, bands['robot.rhythmicMotifLength']);
  const noteVarianceRaw = getSeededVal(noiseMap, 'robot.noteVariance.active', spawnIndex, 0, 1);
  const noteVariance = seedToggleValue(noteVarianceRaw, bands['robot.noteVariance']);
  const repeat = bands['robot.pitchRepeat'];
  const pitchRepeat = Math.round(getSeededVal(noiseMap, 'robot.pitchRepeat', spawnIndex, repeat.min, repeat.max));
  return { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat };
}

// Waveform types, in the pick's order (robot.waveform's PickBand: Classic's equal weights give ~20 % each, pulse included)
const WAVEFORMS: WaveformType[] = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'];

/**
 * A waveform from a PickBand (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10): one draw over [0, total weight] at `dataId` /
 * `offset`, landing on the first waveform in WAVEFORMS order whose cumulative weight it falls under. Classic's five unit
 * weights make this the same getSeededVal call the old pick made - [0, 5] - and its integer edges 1-5 the exact index
 * Math.floor gave, so no Classic robot changes waveform. A zero weight is never drawn; a draw at the very top of the
 * range (the simplex sample at its maximum) lands on the last waveform with a weight, as the old base draw's clamp
 * did, where the old layer draw would have indexed past the end.
 */
function pickWaveform(noiseMap: NoiseFunction2D, dataId: string, offset: number, band: PickBand): WaveformType {
  const total = WAVEFORMS.reduce((sum, wave) => sum + band.weights[wave], 0);
  const draw = getSeededVal(noiseMap, dataId, offset, 0, total);
  let edge = 0;
  for (const wave of WAVEFORMS) {
    edge += band.weights[wave];
    if (draw < edge) return wave;
  }
  return [...WAVEFORMS].reverse().find((wave) => band.weights[wave] > 0) ?? WAVEFORMS[WAVEFORMS.length - 1];
}

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
 * Generate random audio attributes
 * Controls both sound synthesis and visual appearance
 */
/** The theme's Envelope bands as the loading context holds them now (getBand at the draw, band-table T21). */
function currentEnvelopeBands(): Pick<BandTable, EnvelopeBandKey> {
  return {
    'robot.attack': getBand('robot.attack'),
    'robot.decay': getBand('robot.decay'),
    'robot.sustain': getBand('robot.sustain'),
    'robot.release': getBand('robot.release'),
    'robot.shapedAttack': getBand('robot.shapedAttack'),
    'robot.shapedRelease': getBand('robot.shapedRelease'),
  };
}

/**
 * A robot's seeded ADSR envelope at `offset` under `bands` - the theme's at spawn (currentEnvelopeBands), an Envelope
 * aspect's when the deal re-derives it (docs/tasks/OFF_SCREEN_REVISIONS.md Task 8: resolveBands(theme, { envelope })).
 * Extracted from generateAudioAttributes with its dataIds and offsets unchanged, so a dealt robot is exactly what it
 * would have been had it spawned under the aspect, and Classic parity holds. The curves are drawn first: a shaped stage
 * is seeded short, from its own band, whose `lit` is the shaped share (robot.shapedAttack, robot.shapedRelease).
 */
export function deriveEnvelopeFields(
  noiseMap: NoiseFunction2D,
  offset: number,
  bands: Pick<BandTable, EnvelopeBandKey>,
): AudioAttributes['adsr'] {
  const shapedAttack = bands['robot.shapedAttack'];
  const shapedRelease = bands['robot.shapedRelease'];
  const attackCurve = seedCurve(noiseMap, 'robot.audio.attackCurve', offset, shapedAttack.lit);
  const releaseCurve = seedCurve(noiseMap, 'robot.audio.releaseCurve', offset, shapedRelease.lit);
  const attackRange = attackCurve === 'linear' ? bands['robot.attack'] : shapedAttack;
  const releaseRange = releaseCurve === 'linear' ? bands['robot.release'] : shapedRelease;
  const decayRange = bands['robot.decay'];
  const sustainRange = bands['robot.sustain'];
  return {
    attack: getSeededVal(noiseMap, 'robot.audio.attack', offset, attackRange.min, attackRange.max),
    decay: getSeededVal(noiseMap, 'robot.audio.decay', offset, decayRange.min, decayRange.max),
    sustain: getSeededVal(noiseMap, 'robot.audio.sustain', offset, sustainRange.min, sustainRange.max),
    release: getSeededVal(noiseMap, 'robot.audio.release', offset, releaseRange.min, releaseRange.max),
    attackCurve,
    releaseCurve,
  };
}

/** The theme's Voice bands as the loading context holds them now (getBand at the draw, band-table T21). */
function currentVoiceBands(): Pick<BandTable, VoiceBandKey> {
  return {
    'robot.waveform': getBand('robot.waveform'),
    'robot.filterFreq': getBand('robot.filterFreq'),
    'robot.accentFilterFreq': getBand('robot.accentFilterFreq'),
    'robot.accentFilterQ': getBand('robot.accentFilterQ'),
    'robot.layerGain': getBand('robot.layerGain'),
  };
}

/** The voice a robot draws: its bus filter, its base waveform and its fixed 3-layer Signature Array. */
type VoiceFields = Pick<AudioAttributes, 'filterFreq' | 'filterQ' | 'filterType' | 'waveform' | 'layers'>;

/**
 * A robot's seeded voice at `offset` under `bands` - the theme's at spawn (currentVoiceBands), a Voice aspect's when the
 * deal re-derives it (docs/tasks/OFF_SCREEN_REVISIONS.md Task 10: resolveBands(theme, { voice })). Extracted from
 * generateAudioAttributes with its dataIds and offsets unchanged: the bus filter (an accent robot a darker, resonant one,
 * lowpass or bandpass; the cutoff keeps its own dataId in both tiers), the base waveform and the three layers (type, gain,
 * detune, phase), the waveforms now picked through the robot.waveform PickBand (pickWaveform). The layers' detune and
 * phase follow no band and re-derive unchanged.
 */
export function deriveVoiceFields(noiseMap: NoiseFunction2D, offset: number, bands: Pick<BandTable, VoiceBandKey>): VoiceFields {
  // Seeded bus filter (determines detail level): a common robot is an open lowpass, an accent robot
  // a darker, resonant one (lowpass or bandpass). The cutoff keeps its own dataId in both tiers.
  // The accent band's `lit` is the accent share (robot.accentFilterFreq); the open cutoff and the accent Q are bands too.
  const accentFilter = bands['robot.accentFilterFreq'];
  const accent = getSeededVal(noiseMap, 'robot.audio.filter.accent', offset, 0, 1) < accentFilter.lit;
  const filterRange = accent ? accentFilter : bands['robot.filterFreq'];
  const filterFreq = getSeededVal(noiseMap, 'robot.audio.filterFreq', offset, filterRange.min, filterRange.max);
  const accentQ = bands['robot.accentFilterQ'];
  const filterQ = accent
    ? quantizeToStep(getSeededVal(noiseMap, 'robot.audio.filterQ', offset, accentQ.min, accentQ.max), 0, FILTER_Q_STEP)
    : ROBOT_BUS_FILTER_Q;
  const filterType: RobotFilterType = accent && getSeededVal(noiseMap, 'robot.audio.filter.type', offset, 0, 1) < ACCENT_BANDPASS_SHARE
    ? 'bandpass'
    : 'lowpass';

  // Seeded waveform, through the pick (~20 % each under Classic)
  const waveform = pickWaveform(noiseMap, 'robot.audio.waveform', offset, bands['robot.waveform']);

  // Generate the fixed 3-layer Signature Array (Baseline/Coaxial/Harmonic, Roadmap Phase 9).
  // There is no per-layer ADSR anymore — every layer shares the one `adsr` envelope.
  const layers: OscillatorLayer[] = [];
  const layerGain = bands['robot.layerGain'];
  for (let i = 0; i < LAYER_COUNT; i++) {
    const layerOffset = offset * 10 + i;
    // Baseline (layers[0]) always seeds a real, audible gain from the band; Coaxial/Harmonic (layers[1]/[2]) each go
    // quiet on a draw under 1 - the band's `lit` (a plain 50/50 under Classic), forcing gain to 0 instead of sampling
    // one — muting doesn't discard the rest of the layer's configuration (see AudioEngine.ts's filterAudibleLayers),
    // so a muted layer still gets a full, ready-to-resume config here.
    const quiet = i !== 0 && getSeededVal(noiseMap, 'robot.audio.layer.quiet', layerOffset, 0, 1) < 1 - layerGain.lit;
    const layerWave: OscillatorLayer = {
      type: pickWaveform(noiseMap, 'robot.audio.layer.waveform', layerOffset, bands['robot.waveform']),
      gain: quiet ? 0 : quantizeToStep(getSeededVal(noiseMap, 'robot.audio.layer.gain', layerOffset, layerGain.min, layerGain.max), 0, LAYER_GAIN_STEP),
      detune: quantizeToStep(getSeededVal(noiseMap, 'robot.audio.layer.detune', layerOffset, -2, 2), 0, DETUNE_STEP),
      phase: Math.floor(getSeededVal(noiseMap, 'robot.audio.layer.phase', layerOffset, 0, 361)) || 0,
    };
    layers.push(layerWave);
  }
  return { filterFreq, filterQ, filterType, waveform, layers };
}

export function generateAudioAttributes(noiseMap: NoiseFunction2D, offset: number): AudioAttributes {
  // Seeded ADSR envelope, every band from the loading context (band-table T21), through the Envelope family's one
  // derivation (revisions Task 8).
  const adsr = deriveEnvelopeFields(noiseMap, offset, currentEnvelopeBands());

  // Seeded portamento — most robots don't glide; a glider slurs each note into the next. The band's `lit` is the
  // gliding share (robot.portamento).
  const portamentoBand = getBand('robot.portamento');
  const glider = getSeededVal(noiseMap, 'robot.audio.portamento.glider', offset, 0, 1) < portamentoBand.lit;
  const portamento = glider
    ? quantizeToStep(getSeededVal(noiseMap, 'robot.audio.portamento', offset, portamentoBand.min, portamentoBand.max), 0, PORTAMENTO_STEP)
    : 0;

  // Seeded octave register — direct [min, max] tuple, no Hz indirection
  const octaveRange = OCTAVE_REGISTERS[Math.min(OCTAVE_REGISTERS.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.audio.register', offset, 0, OCTAVE_REGISTERS.length)))] as [number, number];

  // The voice - the bus filter, the waveform and the 3-layer Signature Array - through the Voice family's one
  // derivation (revisions Task 10).
  const { filterFreq, filterQ, filterType, waveform, layers } = deriveVoiceFields(noiseMap, offset, currentVoiceBands());

  // Phase: 0..360 degrees (used for oscillator phase)
  const phase = Math.floor(getSeededVal(noiseMap, 'robot.audio.phase', offset, 0, 361));
  // Detune: default 0 cents (fine pitch adjustment)
  const detune = Math.round(getSeededVal(noiseMap, 'robot.audio.detune', offset, -5, 5));
  // Pulse width: meaningful for pulse/square waves. Default ~0.5 (50% duty).
  const rawPulse = getSeededVal(noiseMap, 'robot.audio.pulseWidth', offset, 0.05, 0.95);
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
 *  `lit` the lit share — 1 - the old LFO_QUIET_THRESHOLD (0.7, docs/specs/LFO_LOAD_FIX.md assumption 5) for the six
 *  layer targets and 1 - the old LFO_BUS_QUIET_THRESHOLD (0.8) for the bus filter's rarer sweep. classic.ts records why 0.7
 *  and not 0.75 for "25 % on": the draw is a smooth simplex sample, not a coin, so the on-rate is not 1 - threshold. */
function robotLfoBandForTarget(target: RobotLfoTargetId): SendBand {
  if (target === 'bus.frequency') return getBand('robot.lfoBusDepth');
  return getBand(target.endsWith('.gain') ? 'robot.lfoGainDepth' : 'robot.lfoDetuneDepth');
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
    const quiet = getSeededVal(noiseMap, `robot.lfo.${target}.quiet`, offset, 0, 1) < 1 - band.lit;
    if (quiet) {
      result[target] = { lane: null, depth: 0 };
      continue;
    }

    const laneT = getSeededVal(noiseMap, `robot.lfo.${target}.lane`, offset, 0, 1);
    const lane = pickLane(laneT, counts);
    counts[lane]++;

    const depth = quantizeToStep(
      getSeededVal(noiseMap, `robot.lfo.${target}.depth`, offset, band.min, band.max),
      LFO_DEPTH_MIN,
      LFO_DEPTH_STEP,
    );
    result[target] = { lane, depth };
  }
  return result;
}

/** A send fraction quantized in percent space (the Volume shape), so the stored value sits on the slider's
 *  1 % grid and never on a sub-percent one. */
function quantizeSend(raw: number): number {
  return quantizeToStep(raw * 100, 0, SEND_STEP_PERCENT) / 100;
}

/** The five send bands as the loading context holds them now (getBand at the draw, band-table T22). */
function currentSendBands(): Pick<BandTable, RobotSendField> {
  return {
    reverbSend: getBand('reverbSend'),
    delaySend: getBand('delaySend'),
    gritSend: getBand('gritSend'),
    shimmerSend: getBand('shimmerSend'),
    doubleSend: getBand('doubleSend'),
  };
}

/** Turn the four raw draws into the two stored sends: a quiet roll under 1 - the row's `lit` leaves the robot without
 *  that send at all - the Delay row's 0.25 under Classic; the Reverb row's lit of 1 is never quiet, so its roll, added at
 *  band-table T22 so a theme's Reverb share is honoured like every other row's, moves no Classic robot. The bands are the
 *  caller's: the loaded world's (currentSendBands) at spawn, a Distance aspect's in the deal. Shared by the noise-map draw
 *  and spawnRobot's alea fallback. */
function composeSends(
  reverbRaw: number,
  delayRaw: number,
  reverbQuietRoll: number,
  delayQuietRoll: number,
  bands: Pick<BandTable, RobotSendField>,
): { reverbSend: number; delaySend: number } {
  return {
    reverbSend: reverbQuietRoll < 1 - bands.reverbSend.lit ? 0 : quantizeSend(reverbRaw),
    delaySend: delayQuietRoll < 1 - bands.delaySend.lit ? 0 : quantizeSend(delayRaw),
  };
}

/**
 * The three effect room sends from their uniform draws (docs/specs/ROBOT_EFFECT_SENDS.md assumption 7): in the order
 * Grit -> Shimmer -> Double, a send lands when its roll is under its row's `lit`, unless an earlier one of the three
 * already landed; a landed send is its value draw mapped into its band, on the 1 % grid. The rest are exactly 0. Both
 * draws of every send are taken by the caller before this runs, so the draw set never depends on what lands. The bands
 * are the caller's, as composeSends' are.
 */
function composeExclusiveSends(
  draw: Record<ExclusiveSendField, { roll: number; t: number }>,
  bands: Pick<BandTable, RobotSendField>,
): Record<ExclusiveSendField, number> {
  const sends = { gritSend: 0, shimmerSend: 0, doubleSend: 0 };
  let taken = false;
  for (const field of EXCLUSIVE_SEND_FIELDS) {
    const band = bands[field];
    if (draw[field].roll < band.lit && !taken) {
      sends[field] = quantizeSend(band.min + draw[field].t * (band.max - band.min));
      taken = true;
    }
  }
  return sends;
}

/**
 * A robot's five seeded sends (docs/specs/ROBOT_SENDS.md §1.2, docs/specs/ROBOT_EFFECT_SENDS.md §1.2), from the loaded
 * world's send bands (getBand, band-table T22; Classic's rows are ROBOT_SEND_LOADING_RANGES) at `offset` = spawn count.
 * Reverb and Delay keep the bell draws and the three dataIds Robot Sends shipped (the old global Reverb / Delay `wet`
 * loading rows, moved to the send table by Robot Effect Sends T1 without moving a value), plus the Reverb row's own quiet
 * roll, `robot.send.reverb.quiet`, so a theme's Reverb `lit` is honoured like every other row's (Classic's lit of 1
 * never goes quiet); about a quarter of the fleet draws no delay. The Grit, Shimmer and Double sends are uniform
 * per-robot rolls, `robot.send.<room>.lit` and `robot.send.<room>`, every one read on every robot, at most one landing
 * (composeExclusiveSends). One helper serves spawnRobot and generateRobotAudioBaseline, called outside the copy branch in
 * both, so a copied robot shares its sibling's voice but not its depths, and the two cannot drift.
 */
export function generateRobotSends(noiseMap: NoiseFunction2D, offset: number): Record<RobotSendField, number> {
  return deriveSendFields(noiseMap, offset, currentSendBands());
}

/**
 * A robot's five seeded sends at `offset` under `bands` - the loaded world's at spawn (generateRobotSends), a Distance
 * aspect's when the deal re-derives them (docs/tasks/OFF_SCREEN_REVISIONS.md Task 8: resolveBands(theme, { distance })).
 * Extracted from generateRobotSends with its dataIds, offsets and draw order unchanged, so a dealt robot is exactly what
 * it would have been had it spawned under the aspect. The three effect room sends are re-derived too and come out as
 * they were: a Distance column cannot name them (DISTANCE_BAND_KEYS).
 */
export function deriveSendFields(
  noiseMap: NoiseFunction2D,
  offset: number,
  bands: Pick<BandTable, RobotSendField>,
): Record<RobotSendField, number> {
  const reverb = bands.reverbSend;
  const delay = bands.delaySend;
  const firstTwo = composeSends(
    getSeededVal(noiseMap, 'robot.send.reverb', offset, reverb.min, reverb.max),
    getSeededVal(noiseMap, 'robot.send.delay', offset, delay.min, delay.max),
    getSeededVal(noiseMap, 'robot.send.reverb.quiet', offset, 0, 1),
    getSeededVal(noiseMap, 'robot.send.delay.quiet', offset, 0, 1),
    bands,
  );
  const draw = (field: ExclusiveSendField) => {
    const room = SEND_FIELD_ROOM[field];
    return {
      roll: getUniformSeededVal(noiseMap, `robot.send.${room}.lit`, offset),
      t: getUniformSeededVal(noiseMap, `robot.send.${room}`, offset),
    };
  };
  return {
    ...firstTwo,
    ...composeExclusiveSends({ gritSend: draw('gritSend'), shimmerSend: draw('shimmerSend'), doubleSend: draw('doubleSend') }, bands),
  };
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
  const copyRoll = getSeededVal(noiseMap, 'robot.copyChance', spawnCount, 0, 1);
  const shouldCopy = copyRoll < 0.30 && priorBaselines.length > 0;

  const name = generateRobotName(noiseMap, spawnCount);
  // Outside the copy branch, like name: spawnRobot draws its sends unconditionally too.
  const sends = generateRobotSends(noiseMap, spawnCount);

  if (shouldCopy) {
    const srcIdx = Math.min(
      priorBaselines.length - 1,
      Math.floor(getSeededVal(noiseMap, 'robot.copySource', spawnCount, 0, priorBaselines.length))
    );
    // name is NOT inherited from the copy source — spawnRobot generates it unconditionally,
    // outside the shouldCopy branch (see this function's own doc comment).
    return { ...priorBaselines[srcIdx], name, ...sends };
  }

  const audioAttributes = generateAudioAttributes(noiseMap, spawnCount);
  const octaveRange = audioAttributes.octaveRange ?? [2, 4] as [number, number];
  const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = deriveMelodyFields(noiseMap, spawnCount, currentMelodyBands());
  const dynamicsBand = getBand('robot.dynamics');
  const dynamics = Math.round(getSeededVal(noiseMap, 'robot.dynamics', spawnCount, dynamicsBand.min, dynamicsBand.max));
  const restsBand = getBand('robot.rests');
  const rests = Math.round(getSeededVal(noiseMap, 'robot.rests', spawnCount, restsBand.min, restsBand.max));
  const accentsBand = getBand('robot.accents');
  const accents = Math.round(getSeededVal(noiseMap, 'robot.accents', spawnCount, accentsBand.min, accentsBand.max));
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

// ========================================
// THE DEAL (docs/specs/OFF_SCREEN.md assumptions 21, 22 and 24)
// ========================================

/** The identity the deal reads: the theme the fleet was built under and the picks to seat. */
type DealIdentity = Pick<LoadingIdentity, 'theme' | 'aspects'>;

/** What the deal re-derives on a robot: the Melody fields, the audio attributes (Envelope's adsr inside them) and the
 *  five sends. */
type DealtFields = Partial<MelodyFields & Pick<RobotAudioBaseline, 'audioAttributes' | RobotSendField>>;

/** One family's re-derivation for one robot at `spawnIndex` under `bands` (resolveBands(theme, { [family]: aspect })):
 *  Melody its four fields, Envelope the robot's `adsr` inside its own audio attributes, Distance its five sends, Voice
 *  its filter, waveform and layers inside its audio attributes. `robot` is the robot as dealt so far, so Envelope and
 *  Voice both land in one set of audio attributes. A switch, so a new family is a compile error until it has its case. */
function deriveFamilyFields(
  family: AspectFamilyId,
  noiseMap: NoiseFunction2D,
  spawnIndex: number,
  bands: BandTable,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
): DealtFields {
  switch (family) {
    case 'melody':
      return deriveMelodyFields(noiseMap, spawnIndex, bands);
    case 'envelope':
      return { audioAttributes: { ...robot.audioAttributes, adsr: deriveEnvelopeFields(noiseMap, spawnIndex, bands) } };
    case 'distance':
      return deriveSendFields(noiseMap, spawnIndex, bands);
    case 'voice':
      return { audioAttributes: { ...robot.audioAttributes, ...deriveVoiceFields(noiseMap, spawnIndex, bands) } };
  }
}

/** A dealt robot's re-derived fields (assumption 22; per family since docs/tasks/OFF_SCREEN_REVISIONS.md Task 8): for each
 *  dealt family in family order, its keys from the robot's own index under resolveBands(theme, { [family]: aspect }) -
 *  the same draws as at spawn, into the aspect's bands - so a dealt robot is what it would have been had it spawned
 *  under the aspect. A family not dealt keeps its fields. */
function dealtFields(
  noiseMap: NoiseFunction2D,
  spawnIndex: number,
  theme: ThemeId,
  aspects: RobotAspects,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
): DealtFields {
  let fields: DealtFields = {};
  for (const family of ASPECT_FAMILY_IDS) {
    const aspect = aspects[family];
    if (aspect === undefined) continue;
    const bands = resolveBands(theme, { [family]: aspect });
    fields = { ...fields, ...deriveFamilyFields(family, noiseMap, spawnIndex, bands, { ...robot, ...fields }) };
  }
  return fields;
}

/**
 * The deal pass over a regenerated roster baseline, pure (assumption 22 as amended at planning): dealAspects over the
 * companies and the robot ids (spawn order), then for every robot dealt an aspect its family's fields re-derived from
 * its own index - a copied-baseline robot included, which so leaves its source's values behind - and `loadedUnder`
 * set; every other robot is the very same object, and with nothing dealt the input array comes back. Run inside
 * generateDealtRosterBaseline for buildSessionPayload's diff and mirrored live by applyAspectDeal from the same noise
 * map, so an untweaked dealt world diffs to nothing against its own seed.
 */
export function applyDealToBaselines(
  baselines: RobotAudioBaseline[],
  robotIds: readonly string[],
  companies: readonly Pick<Company, 'robotIds'>[],
  identity: DealIdentity,
  noiseMap: NoiseFunction2D,
): RobotAudioBaseline[] {
  const dealt = dealAspects(identity, companies, robotIds.map((id) => ({ id })), noiseMap);
  if (dealt.size === 0) return baselines;
  return baselines.map((baseline, i) => {
    const aspects = dealt.get(robotIds[i]);
    if (!aspects) return baseline;
    return { ...baseline, ...dealtFields(noiseMap, i, identity.theme, aspects, baseline), loadedUnder: aspects };
  });
}

/**
 * The roster and company baselines a saved world is diffed against (sessionDiff.ts's buildSessionPayload): the roster
 * replayed from the noise map, the companies from the live robot ids in spawn order, and the deal applied to the roster
 * under the loaded identity, so the baseline is what the live spawn produced.
 */
export function generateDealtRosterBaseline(
  noiseMap: NoiseFunction2D,
  robotIds: readonly string[],
  identity: DealIdentity,
): { robots: RobotAudioBaseline[]; companies: CompanyRosterBaseline[] } {
  const companies = generateCompanyRosterBaseline(noiseMap, robotIds);
  const robots = applyDealToBaselines(generateRobotRosterBaseline(noiseMap, robotIds.length), robotIds, companies, identity, noiseMap);
  return { robots, companies };
}

/**
 * One family's fields, already in the store, to the running engine, the way a hand edit of those fields reaches it
 * (docs/tasks/OFF_SCREEN_REVISIONS.md Task 8): Melody regenerates the melody (regenerateMelody re-registers it,
 * applyDensity's path), Envelope hands the adsr to updateVoiceEnvelope (applyAdsr's path: a live write, curves included,
 * no rebuild), Distance hands all five sends to updateRobotSends (applySendValue's call, the prime every reservation
 * makes), Voice rebuilds the voice from the robot and re-primes its LFO links (the structural edit's rebuildVoice,
 * robotOptionsActions.ts: reReserveVoice disposes the nodes the links were wired to; revisions Task 10). The robot is
 * handed to reReserveVoice because a rebuild deals before its locale is current, where the engine's own lookup finds
 * nothing (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R4). `robot` is the store's robot after the write. Guarded as
 * spawnRobot's reservation is, so a push that throws costs only itself, never the rest of the deal
 * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R14). A switch with a never check, as deriveFamilyFields is a switch: a new
 * family is a compile error until it has its push.
 */
function pushFamilyToEngine(family: AspectFamilyId, robot: Robot, localeId: string): void {
  try {
    switch (family) {
      case 'melody':
        regenerateMelody(robot, localeId);
        break;
      case 'envelope':
        AudioEngine.updateVoiceEnvelope(robot.id, robot.audioAttributes.adsr);
        break;
      case 'distance':
        AudioEngine.updateRobotSends(robot.id, robotSendLevels(robot));
        break;
      case 'voice':
        AudioEngine.reReserveVoice(robot.id, robot);
        primeRobotLinks(robot);
        break;
      default: {
        const unpushed: never = family;
        throw new Error(`no engine push for the ${String(unpushed)} family`);
      }
    }
  } catch (err) {
    if (DEV_TUNING) console.warn('[SpawnSystem] the deal could not push', family, 'for', robot.id, err);
  }
}

/**
 * The deal pass on the live roster (assumption 22): after spawnInitialCompanies, in initializeLocale
 * (worldTransition.ts). Reads the loading store's theme and picks, deals over the locale's companies and robots, and for
 * every dealt robot writes its re-derived fields and `loadedUnder` through updateRobot (the roster position is the spawn
 * index: the initial roster spawns in order from 0). Then each dealt family, in family order, reaches the running engine
 * through pushFamilyToEngine. Before the engine starts - the off screen - those engine calls are the same no-ops they are
 * at spawn. With nothing dealt, nothing is written. The baseline runs applyDealToBaselines from the same noise map, so
 * the two agree field for field.
 */
export function applyAspectDeal(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const { theme, aspects } = useLoadingStore.getState();
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const dealt = dealAspects({ aspects }, locale.companies, locale.robots, noiseMap);
  locale.robots.forEach((robot, i) => {
    const robotAspects = dealt.get(robot.id);
    if (!robotAspects) return;
    useLocaleStore.getState().updateRobot(localeId, robot.id, { ...dealtFields(noiseMap, i, theme, robotAspects, robot), loadedUnder: robotAspects });
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    for (const family of ASPECT_FAMILY_IDS) {
      if (robotAspects[family] !== undefined) pushFamilyToEngine(family, updated, localeId);
    }
  });
}

/** One family's fields as `source` holds them, over `robot`'s own audio attributes: the counterpart of
 *  deriveFamilyFields, key for key, reading a robot already drawn instead of drawing one. A switch, so a new family is
 *  a compile error until it has its case. */
function familyFieldsOf(
  family: AspectFamilyId,
  source: RobotAudioBaseline,
  robot: Pick<RobotAudioBaseline, 'audioAttributes'>,
): DealtFields {
  switch (family) {
    case 'melody': {
      const { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat } = source;
      return { rhythmicDensity, rhythmicMotifLength, noteVariance, pitchRepeat };
    }
    case 'envelope':
      return { audioAttributes: { ...robot.audioAttributes, adsr: source.audioAttributes.adsr } };
    case 'distance': {
      const { reverbSend, delaySend, gritSend, shimmerSend, doubleSend } = source;
      return { reverbSend, delaySend, gritSend, shimmerSend, doubleSend };
    }
    case 'voice': {
      const { filterFreq, filterQ, filterType, waveform, layers } = source.audioAttributes;
      return { audioAttributes: { ...robot.audioAttributes, filterFreq, filterQ, filterType, waveform, layers } };
    }
  }
}

/** The swellable attributes inside each family's fields (SWELL_ROBOT_ATTRIBUTE_IDS): the swells an in-place re-deal
 *  drops, as a hand edit of a field drops the swell riding it (RobotScreen.tsx), so none returns a re-derived field to
 *  its old base or hands that base to Keep (sessionDiff.ts saves a swelling field's base). Melody's fields never
 *  swell. A Record, so a new family is a compile error until it has its list. */
const FAMILY_SWELL_ATTRIBUTES: Record<AspectFamilyId, readonly SwellRobotAttributeId[]> = {
  melody: [],
  envelope: ['adsr.attack', 'adsr.decay', 'adsr.sustain', 'adsr.release'],
  distance: ROBOT_SEND_FIELDS,
  voice: ['layer0.gain', 'layer0.detune', 'layer1.gain', 'layer1.detune', 'layer2.gain', 'layer2.detune'],
};

/**
 * An aspect change on the live roster, in place (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33; Crawford: refresh the
 * world only when necessary). Aspects are robot-side (spec §3), so the world stands - positions, batteries, jobs, the
 * companies, the global half - and only the deal moves. The loading store's picks are dealt over the locale's own
 * companies and robots, as applyAspectDeal deals them, onto the roster a rebuild would spawn (the theme's own draws,
 * generateRobotRosterBaseline); then each robot takes, for just the families whose dealt aspect moved from its
 * `loadedUnder`, what that rebuild gives it: the aspect's re-derivation from its own index for a family still dealt,
 * the theme's own draw for one no longer dealt (a copied robot's being its source's, as at spawn). A tweak on any other
 * field stays; a tweak on a re-derived one goes, as any re-derivation takes it. The swells riding the re-derived fields
 * are dropped first (FAMILY_SWELL_ATTRIBUTES, through `dropSwell`), the fields and the new `loadedUnder` go through
 * updateRobot, and each moved family reaches the engine through pushFamilyToEngine. A robot nothing moved for is not
 * written. `dropSwell` is audioSwells' cancelSwellForRobotAttribute, handed in by the caller (retransmitWorld) so this
 * module stays out of the swell system's imports: they load the audio store, whose module-load style-sync every test
 * that imports spawnSystem would then run.
 */
export function redealAspects(localeId: string, dropSwell: (robotId: string, attribute: SwellRobotAttributeId) => void): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const { theme, aspects } = useLoadingStore.getState();
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const ids = locale.robots.map((robot) => robot.id);
  const rebuilt = applyDealToBaselines(generateRobotRosterBaseline(noiseMap, ids.length), ids, locale.companies, { theme, aspects }, noiseMap);
  locale.robots.forEach((robot, i) => {
    const loadedUnder = rebuilt[i].loadedUnder;
    const moved = ASPECT_FAMILY_IDS.filter((family) => loadedUnder?.[family] !== robot.loadedUnder?.[family]);
    if (moved.length === 0) return;
    let fields: DealtFields = {};
    for (const family of moved) {
      for (const attribute of FAMILY_SWELL_ATTRIBUTES[family]) dropSwell(robot.id, attribute);
      fields = { ...fields, ...familyFieldsOf(family, rebuilt[i], { ...robot, ...fields }) };
    }
    useLocaleStore.getState().updateRobot(localeId, robot.id, { ...fields, loadedUnder });
    const updated = useLocaleStore.getState().getLocaleById(localeId)?.robots.find((r) => r.id === robot.id);
    if (!updated) return;
    for (const family of moved) pushFamilyToEngine(family, updated, localeId);
  });
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
        ? getSeededVal(noiseMap, 'robot.dynamics', spawnCount, dynamicsBand.min, dynamicsBand.max)
        : dynamicsBand.min + alea(`${localeId}:${spawnCount}:dynamics`)() * (dynamicsBand.max - dynamicsBand.min)
    );
    const restsBand = getBand('robot.rests');
    spawnRests = Math.round(
      noiseMap
        ? getSeededVal(noiseMap, 'robot.rests', spawnCount, restsBand.min, restsBand.max)
        : restsBand.min + alea(`${localeId}:${spawnCount}:rests`)() * (restsBand.max - restsBand.min)
    );
    const accentsBand = getBand('robot.accents');
    spawnAccents = Math.round(
      noiseMap
        ? getSeededVal(noiseMap, 'robot.accents', spawnCount, accentsBand.min, accentsBand.max)
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
        ? getSeededVal(noiseMap, 'robot.masterVolume', spawnCount, volume.min, volume.max)
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
