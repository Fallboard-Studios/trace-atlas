// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { AudioAttributes, Robot } from '../types/Robot';
import { ENVELOPE_CURVE_NAMES } from '../types/Robot';

import { generateBatterySize, generateSpawnPosition, generateAudioAttributes, generateRobotLfoLinks, generateRobotSends, generateRobotAudioBaseline, generateRobotRosterBaseline, generateCompanyRosterBaseline, generateCompanyMembership, companyFounders, spawnRobot, spawnInitialRoster, spawnInitialCompanies, generateCompanyName, generateCompanyIdentityColor, reRegisterAllRobotsAudio, ADJECTIVES, COMPANY_NOUNS } from './spawnSystem';
import { audibleDensityBand, deriveEnvelopeFields, deriveRhythmicDensity, deriveSendFields, deriveVoiceFields } from './robotFieldDerivation';
import { generateDealtRosterBaseline, applyDealToBaselines, applyAspectDeal, rederiveLoading } from './aspectDeal';
import { resolveBands } from '../data/bands/resolveBands';
import { DEFAULT_LOADING, useLoadingStore, type LoadingIdentity } from '../stores/loadingStore';
import { getRobotGem } from '../components/robot/gem/polygon';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { DEFAULT_LOCALE_ID } from '../stores/attenuationStyleStore';
import { AudioEngine } from '../engine/AudioEngine';
import { DockingState } from '../types/Robot';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { ROBOT_LFO_TARGET_IDS, LFO_LANE_IDS, type LfoLaneId } from '../types/lfo';
import {
  MAX_ROBOTS, INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX,
  INITIAL_COMPANIES_MIN, INITIAL_COMPANIES_MAX, COMPANY_SIZE_MIN, COMPANY_SIZE_MAX,
  ENVELOPE_ATTACK_MIN_SECONDS, ENVELOPE_RELEASE_MIN_SECONDS,
  BATTERY_SIZE_MIN, BATTERY_SIZE_MAX, FREELANCERS_MIN,
} from '../constants';
import { SIM_SEED_COORDS, simNoiseMap } from './lifecycleSim';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import { tallyLanes } from '../utils/lfoLaneDraw';
import { CLASSIC } from '../data/bands/classic';
import { robotSendLevels } from '../data/robotSends';
import { withLoading } from '../data/bands/loadingContext';
import * as loadingContextModule from '../data/bands/loadingContext';
import type { BandKey, BandTable } from '../data/bands/bandKeys';
import type { RobotAudioBaseline } from './spawnSystem';
import { buildSeededComposition, buildSeededRhythm, buildSeededPerformance, applyPerformanceMarks, generateMelodyForRobot, DEFAULT_RHYTHMIC_DENSITY, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT, DEFAULT_DYNAMICS, DEFAULT_RESTS, DEFAULT_ACCENTS } from '../engine/melodyGenerator';
import * as robotLfoLinks from './robotLfoLinks';
import { cancelSwellForRobotAttribute } from './audioSwells';
import { getStations, type Station } from './stations';
import { positionForCentre, robotCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { chargingColorsKey, parseColorsKey } from '../components/stations/stationOccupancy';
import { constantNoiseMap, noiseMapForDataIds } from '../testUtils/seededDraws';
import { outerTenths } from '../testUtils/spread';

/** Each motif-active robot whose first motif window opens on a plain note (no mark, no rest), with that step: where the
 *  group accent is all the scheduled note's accent multiplier holds (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5). */
function windowOpenings(robots: readonly Robot[]): { robot: Robot; step: number }[] {
  return robots.flatMap((robot) => {
    const motif = robot.rhythmicMotifLength;
    if (!motif?.active || robot.clickTrackActive) return [];
    const opening = robot.melody.filter((e) => e.startStep <= motif.value).sort((a, b) => a.startStep - b.startStep)[0];
    return opening && opening.mark === undefined && opening.rest === undefined ? [{ robot, step: opening.startStep }] : [];
  });
}

/** The accent multiplier `robotId`'s note at `step` schedules (1 for none), through the engine's own per-step loop. */
function accentAt(robotId: string, step: number): number | undefined {
  const schedule = vi.spyOn(AudioEngine, 'scheduleNote').mockImplementation(() => {});
  AudioEngine.processMelodyStep(step, 0);
  const note = schedule.mock.calls.map(([params]) => params).find((params) => params.robotId === robotId);
  schedule.mockRestore();
  return note ? (note.accentMultiplier ?? 1) : undefined;
}

// Spy on getSeededVal while keeping its real behavior (the globalAudioSeed.test.ts/
// worldTransition.test.ts importOriginal pattern) — tests below force single seeded draws to a
// known side without disturbing every other seeded draw the rest of this file's many tests depend on.
vi.mock('../utils/getSeededVal', async (importOriginal) => {
  const { steerSeededDraws } = await import('../testUtils/seededDraws');
  const actual = await importOriginal<typeof import('../utils/getSeededVal')>();
  // Robot Effect Sends T7: the uniform draw is wrapped too, so the effect room sends' rolls can be counted and forced.
  // Its own inner getSeededVal samples are the real module's, so they never show up on the getSeededVal spy above.
  // Even Seeded Draws T4: the even and centred draws are steerSeededDraws' spies, so a constantNoiseMap or
  // noiseMapForDataIds stub steers them as it steers getSeededVal; any other map gets the real draw.
  return { ...steerSeededDraws(actual), getSeededVal: vi.fn(actual.getSeededVal) };
});

import { getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';

// Real stations by default; the port-vs-centre and overfill tests swap in their own.
vi.mock('./stations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stations')>();
  return { ...actual, getStations: vi.fn(actual.getStations) };
});

// band-table T21: every robot band is read from the loading context at the draw (docs/specs/OFF_SCREEN.md assumption
// 15). A column that moves EVERY robot band is injected under the Shatter id (Perilous when this was written), so the
// test does not lean on the real columns; the generator reads whatever table is installed (the deal pass hands the same code its Melody bands, Task 27). Each value is chosen so a
// Classic draw would break it somewhere: a lit share of 1 lands the trait on every robot, 0 on none. Its tempo is a
// crawl, so the attack rail (audibleDensityBand) leaves the 90-100 density whole under the 1.5-2 s attacks.
const everyRobotBandMoved = vi.hoisted(() => ({
  bpm: { min: 10, max: 10 },
  'robot.attack': { min: 1.5, max: 2 },
  'robot.decay': { min: 1, max: 1.2 },
  'robot.sustain': { min: 0.9, max: 1 },
  'robot.release': { min: 1.5, max: 2 },
  'robot.shapedAttack': { min: 0.03, max: 0.25, lit: 0 },
  'robot.shapedRelease': { min: 0.15, max: 0.8, lit: 1 },
  'robot.portamento': { min: 0.1, max: 0.1, lit: 1 },
  'robot.filterFreq': { min: 2000, max: 8000 },
  'robot.accentFilterFreq': { min: 500, max: 600, lit: 1 },
  'robot.accentFilterQ': { min: 5, max: 5 },
  'robot.layerGain': { min: 1.1, max: 1.2, lit: 1 },
  'robot.masterVolume': { min: 0.9, max: 0.9 },
  'robot.lfoGainDepth': { min: 50, max: 60, lit: 1 },
  'robot.lfoDetuneDepth': { min: 1, max: 10, lit: 0 },
  'robot.lfoBusDepth': { min: 30, max: 40, lit: 1 },
  'robot.rhythmicDensity': { min: 90, max: 100 },
  'robot.pitchRepeat': { min: 0, max: 5 },
  'robot.rhythmicMotifLength': { offShare: 0, min: 3, max: 4 },
  'robot.noteVariance': { offShare: 0.99, min: 1, max: 8 },
  'robot.dynamics': { min: 0, max: 5 },
  'robot.rests': { min: 90, max: 100 },
  'robot.accents': { min: 0, max: 5 },
}) satisfies Partial<BandTable>);

// band-table T22: the sends read the band table too. Under Undertow (injected) no robot carries a reverb (lit 0), every robot a
// delay of exactly 0.3 (a point band, lit 1) and every Grit roll lands at 0.5 (so Shimmer and Double never do); Bold
// gives the Reverb row a lit share of 0.5, to prove the roll against 1 - lit on a row Classic never rolls.
const everySendMoved = vi.hoisted(() => ({
  reverbSend: { min: 0.1, max: 0.6, lit: 0 },
  delaySend: { min: 0.3, max: 0.3, lit: 1 },
  gritSend: { min: 0.5, max: 0.5, lit: 1 },
}) satisfies Partial<BandTable>);
const halfLitReverb = vi.hoisted(() => ({ reverbSend: { min: 0.1, max: 0.6, lit: 0.5 } }) satisfies Partial<BandTable>);

// band-table T27: the deal pass re-derives a dealt robot's Melody fields under its aspect's bands. Hypnotic and Mechanical
// get injected distinguishing columns here, so the test does not lean on the real ones; Float (Calm when this was
// written) is given Hypnotic's column too, so a robot generated under Float from its own index is exactly what the deal
// must produce.
const melodyColumns = vi.hoisted(() => ({
  hypnotic: { 'robot.rhythmicDensity': { min: 40, max: 60 }, 'robot.noteVariance': { offShare: 0, min: 1, max: 2 } },
  mechanical: {
    'robot.rhythmicDensity': { min: 70, max: 95 },
    'robot.rhythmicMotifLength': { offShare: 0, min: 6, max: 8 },
    'robot.pitchRepeat': { min: 0, max: 10 },
  },
}) satisfies Record<string, Partial<BandTable>>);

vi.mock('../data/bands/themes', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/themes')>();
  return {
    ...actual,
    THEMES: {
      ...actual.THEMES,
      shatter: everyRobotBandMoved,
      undertow: everySendMoved,
      anchor: halfLitReverb,
      float: melodyColumns.hypnotic,
    },
  };
});

vi.mock('../data/bands/aspects', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../data/bands/aspects')>();
  const melody = actual.ASPECT_FAMILIES.melody;
  return {
    ...actual,
    ASPECT_FAMILIES: {
      ...actual.ASPECT_FAMILIES,
      melody: { ...melody, options: { ...melody.options, hypnotic: melodyColumns.hypnotic, mechanical: melodyColumns.mechanical } },
    },
  };
});

/** General-purpose mock: returns a pseudo-random value in [-1, 1]. */
const mockNoiseMap: NoiseFunction2D = () => Math.random() * 2 - 1;

/** Deterministic mock: always returns -1, mapping every getSeededVal call to its min value. */
const deterministicNoiseMap: NoiseFunction2D = () => -1;

/** A forced draw: the value the draw returns, or a function of the band it was asked for and its offset. */
type ForcedDraw = number | ((min: number, max: number, offset: number) => number);

/**
 * Forces the named dataIds to fixed values whichever seeded draw makes them, the plain getSeededVal or the even
 * getUniformSeededVal (Even Seeded Draws moves draws from one to the other), and passes every other draw to the real
 * function. Undo with restoreSeededDraws().
 */
async function forceSeededDraws(forced: Record<string, ForcedDraw>): Promise<void> {
  const real = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
  const force = (draw: typeof real.getSeededVal) =>
    (noiseMap: NoiseFunction2D, dataId: string, offset = 0, min = 0, max = 1) => {
      const value = forced[dataId];
      if (value === undefined) return draw(noiseMap, dataId, offset, min, max);
      return typeof value === 'function' ? value(min, max, offset) : value;
    };
  vi.mocked(getSeededVal).mockImplementation(force(real.getSeededVal));
  vi.mocked(getUniformSeededVal).mockImplementation(force(real.getUniformSeededVal));
}

/** Puts the real plain draw back and the even draw's steering wrapper (mockReset returns a vi.fn(impl) to impl). */
async function restoreSeededDraws(): Promise<void> {
  const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
  vi.mocked(getSeededVal).mockImplementation(real);
  vi.mocked(getUniformSeededVal).mockReset();
}

/** The Reverb and Delay pair of a robot's sends (the two Robot Sends shipped; Robot Effect Sends adds three more). */
const reverbAndDelay = (sends: { reverbSend: number; delaySend: number }) => ({ reverbSend: sends.reverbSend, delaySend: sends.delaySend });
/** The three effect room sends of a robot or a generateRobotSends result (Robot Effect Sends T7). */
const effectSends = (sends: { gritSend: number; shimmerSend: number; doubleSend: number }) => ({
  gritSend: sends.gritSend,
  shimmerSend: sends.shimmerSend,
  doubleSend: sends.doubleSend,
});

// ========================================
// TESTS
// ========================================

describe('spawnSystem', () => {
  describe('generateSpawnPosition', () => {
    it('generates position just outside world bounds (off-screen)', () => {
      const position = generateSpawnPosition(mockNoiseMap, 0);
      // Must be outside the viewBox on at least one axis
      const outsideX = position.x < 0 || position.x > 1920;
      const outsideY = position.y < 0 || position.y > 1080;
      expect(outsideX || outsideY).toBe(true);
    });

    it('only ever spawns below the bottom edge — never to the sides or above', () => {
      const positions = Array.from({ length: 100 }, (_, i) => generateSpawnPosition(mockNoiseMap, i));

      for (const p of positions) {
        expect(p.y).toBeGreaterThan(1080); // below the bottom edge, every time
        expect(p.x).toBeGreaterThanOrEqual(0); // x stays on-screen horizontally
        expect(p.x).toBeLessThanOrEqual(1920);
      }
    });

    it('generates varied positions along x (not all the same)', () => {
      const positions = Array.from({ length: 20 }, (_, i) => generateSpawnPosition(mockNoiseMap, i));
      const uniqueX = new Set(positions.map((p) => Math.round(p.x)));

      expect(uniqueX.size).toBeGreaterThan(8); // Should have variety
    });
  });

  describe('generateAudioAttributes', () => {
    it('generates valid synth type', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(['sine', 'square', 'triangle', 'sawtooth', 'pulse']).toContain(attrs.waveform);
    });

    it('generates Attack, Decay and Release within 0-2s (the sliders\' range)', () => {
      // Phase 9 unified all three at 0-5s; they were then narrowed to their sliders' new 0-2s
      // (docs/specs/ROBOT_ARTICULATION.md §1.10), so a seeded value is always one the slider can show.
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(attrs.adsr.attack).toBeGreaterThanOrEqual(0);
      expect(attrs.adsr.attack).toBeLessThanOrEqual(2.0);
      expect(attrs.adsr.decay).toBeGreaterThanOrEqual(0);
      expect(attrs.adsr.decay).toBeLessThanOrEqual(2.0);
      expect(attrs.adsr.sustain).toBeGreaterThanOrEqual(0.0);
      expect(attrs.adsr.sustain).toBeLessThanOrEqual(1.0);
      expect(attrs.adsr.release).toBeGreaterThanOrEqual(0);
      expect(attrs.adsr.release).toBeLessThanOrEqual(2.0);
    });

    it('generates octave range from predefined registers', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      const validRegisters: [number, number][] = [[1, 3], [2, 4], [3, 5], [4, 6], [5, 7]];

      const matchesRegister = validRegisters.some(
        ([min, max]) =>
          attrs.octaveRange?.[0] === min && attrs.octaveRange?.[1] === max
      );

      expect(matchesRegister).toBe(true);
    });

    it('generates filter frequency in valid range (the open tier 2000-8000 Hz or the accent tier 400-2500 Hz, Robot Articulation T5)', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(attrs.filterFreq).toBeGreaterThanOrEqual(400);
      expect(attrs.filterFreq).toBeLessThanOrEqual(8000);
    });

    it('generates varied attributes (not all the same)', () => {
      const attributes = Array.from({ length: 20 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const uniqueWaveforms = new Set(attributes.map((a) => a.waveform));
      const uniqueAttacks = new Set(attributes.map((a) => a.adsr.attack.toFixed(2)));
      // Synth type is now generic; ensure ADSR variety still exists
      expect(uniqueWaveforms.size).toBeGreaterThan(1);
      expect(uniqueAttacks.size).toBeGreaterThan(10); // Should have variety
    });

    it('always produces exactly 3 layers (Baseline/Coaxial/Harmonic), Baseline always audible', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      const layers = attrs.layers ?? [];
      expect(layers).toHaveLength(3);
      expect(layers[0].gain).not.toBe(0); // Baseline never mutes — no quiet roll for layer0
    });

    it('has no visualAudioMap key — body/greeble shape params are computed live from adsr now (Phase 36)', () => {
      const attrs = generateAudioAttributes(mockNoiseMap, 0);
      expect(attrs).not.toHaveProperty('visualAudioMap');
    });

    it('no layer is ever typed \'noise\' — dropped entirely per Roadmap Phase 9', () => {
      const attributes = Array.from({ length: 50 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const allTypes = attributes.flatMap((a) => (a.layers ?? []).map((l) => l.type));
      expect(allTypes.length).toBeGreaterThan(0);
      expect(allTypes).not.toContain('noise');
      const validWaveforms = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'];
      allTypes.forEach((t) => expect(validWaveforms).toContain(t));
    });

    it('Coaxial and Harmonic are each independently seeded muted/audible (not both forced the same value)', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const coaxialMuted = attributes.map((a) => a.layers![1].gain === 0);
      const harmonicMuted = attributes.map((a) => a.layers![2].gain === 0);
      expect(new Set(coaxialMuted).size, 'Coaxial should take both muted and audible across many spawns').toBe(2);
      expect(new Set(harmonicMuted).size, 'Harmonic should take both muted and audible across many spawns').toBe(2);
      // Not perfectly correlated — some robot has Coaxial and Harmonic disagreeing
      expect(attributes.some((a) => (a.layers![1].gain === 0) !== (a.layers![2].gain === 0))).toBe(true);
    });

    it('quantizes every non-muted layer\'s gain to a 0.01 grid, across many seeds (SEEDED_SLIDER_VALUE_QUANTIZATION Task 6)', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      for (const attrs of attributes) {
        for (const layer of attrs.layers ?? []) {
          if (layer.gain === 0) continue;
          const stepsFromMin = layer.gain / 0.01;
          expect(Math.abs(stepsFromMin - Math.round(stepsFromMin))).toBeLessThan(1e-9);
        }
      }
    });

    it('leaves a muted layer\'s gain exactly 0 — never passed through quantizeToStep (regression)', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      const mutedGains = attributes.flatMap((a) => (a.layers ?? []).slice(1)).filter((l) => l.gain === 0);
      expect(mutedGains.length, 'expected at least one muted layer across 60 spawns x 2 mutable layers').toBeGreaterThan(0);
      for (const layer of mutedGains) {
        expect(Object.is(layer.gain, 0)).toBe(true);
      }
    });

    it('quantizes every layer\'s detune to a whole cent, across many seeds', () => {
      const attributes = Array.from({ length: 60 }, (_, i) => generateAudioAttributes(mockNoiseMap, i));
      for (const attrs of attributes) {
        for (const layer of attrs.layers ?? []) {
          expect(Number.isInteger(layer.detune), `detune: ${layer.detune}`).toBe(true);
        }
      }
    });
  });

  // Robot Articulation Task 5 (docs/specs/ROBOT_ARTICULATION.md §1.2): portamento, envelope curves
  // and the bus filter's Q / type / two-tier cutoff are seeded minority traits.
  describe('generateAudioAttributes — articulation seeding (Robot Articulation T5)', () => {
    // 10 worlds x 40 offsets = 400 robots. Spread across worlds because one noise map's draws are
    // strongly correlated per offset (every dataId samples the map at the same y, the spawn offset, with its x
    // inside [0, 1)) and can land on a band edge.
    const WORLDS = Array.from({ length: 10 }, (_, i) => createNoise2D(alea(`articulation-seed-world-${i}`)));
    const SAMPLE = WORLDS.flatMap((noiseMap) => Array.from({ length: 40 }, (_, offset) => generateAudioAttributes(noiseMap, offset)));
    const share = (count: number) => count / SAMPLE.length;
    const isAccent = (a: (typeof SAMPLE)[number]) => (a.filterQ ?? 1) !== 1;

    it('is deterministic — the same noise map and offset always give the same articulation fields', () => {
      const noiseMap = createNoise2D(alea('articulation-determinism-seed'));
      for (let offset = 0; offset < 20; offset++) {
        expect(generateAudioAttributes(noiseMap, offset)).toEqual(generateAudioAttributes(noiseMap, offset));
      }
    });

    it('always writes the articulation fields explicitly (a seeded robot is never "absent")', () => {
      expect(SAMPLE).toHaveLength(400);
      for (const a of SAMPLE) {
        expect(typeof a.portamento).toBe('number');
        expect(typeof a.filterQ).toBe('number');
        expect(['lowpass', 'bandpass']).toContain(a.filterType);
        expect(ENVELOPE_CURVE_NAMES).toContain(a.adsr.attackCurve);
        expect(ENVELOPE_CURVE_NAMES).toContain(a.adsr.releaseCurve);
      }
    });

    it('about 12 % of robots glide, 15 % shape their attack, 15 % shape their release, 20 % carry an accent filter', () => {
      const gliders = SAMPLE.filter((a) => a.portamento !== 0).length;
      const shapedAttacks = SAMPLE.filter((a) => a.adsr.attackCurve !== 'linear').length;
      const shapedReleases = SAMPLE.filter((a) => a.adsr.releaseCurve !== 'linear').length;
      const accents = SAMPLE.filter(isAccent).length;
      expect(share(gliders), `${gliders}/400 gliders`).toBeGreaterThanOrEqual(0.08);
      expect(share(gliders), `${gliders}/400 gliders`).toBeLessThanOrEqual(0.16);
      expect(share(shapedAttacks), `${shapedAttacks}/400 shaped attacks`).toBeGreaterThanOrEqual(0.10);
      expect(share(shapedAttacks), `${shapedAttacks}/400 shaped attacks`).toBeLessThanOrEqual(0.20);
      expect(share(shapedReleases), `${shapedReleases}/400 shaped releases`).toBeGreaterThanOrEqual(0.10);
      expect(share(shapedReleases), `${shapedReleases}/400 shaped releases`).toBeLessThanOrEqual(0.20);
      expect(share(accents), `${accents}/400 accent filters`).toBeGreaterThanOrEqual(0.15);
      expect(share(accents), `${accents}/400 accent filters`).toBeLessThanOrEqual(0.25);
    });

    it('a glider glides 0.05-0.20 s on a 0.01 grid; every other robot has exactly 0', () => {
      for (const a of SAMPLE) {
        const p = a.portamento as number;
        if (p === 0) continue;
        expect(p).toBeGreaterThanOrEqual(0.05 - 1e-9);
        expect(p).toBeLessThanOrEqual(0.20 + 1e-9);
        expect(Math.abs(p / 0.01 - Math.round(p / 0.01))).toBeLessThan(1e-6);
      }
      expect(SAMPLE.some((a) => a.portamento === 0)).toBe(true);
      expect(SAMPLE.some((a) => (a.portamento as number) > 0)).toBe(true);
    });

    it('the glides use their whole 0.05-0.20 s range: some are short, some reach the 16th-note length (about 0.15 s)', () => {
      // A glide longer than the note never lands (a 0.3 s glide on a 16th got 37 % of the way to the new pitch).
      const glides = SAMPLE.map((a) => a.portamento as number).filter((p) => p > 0);
      expect(Math.min(...glides)).toBeLessThan(0.1);
      expect(Math.max(...glides)).toBeGreaterThanOrEqual(0.15);
    });

    it('a common robot has an open lowpass: cutoff 2000-8000 Hz, Q 1; an accent robot cutoff 400-2500 Hz, Q 3-8 on a 0.1 grid, lowpass or bandpass', () => {
      for (const a of SAMPLE) {
        if (!isAccent(a)) {
          expect(a.filterQ).toBe(1);
          expect(a.filterType).toBe('lowpass');
          expect(a.filterFreq).toBeGreaterThanOrEqual(2000);
          expect(a.filterFreq).toBeLessThanOrEqual(8000);
        } else {
          expect(a.filterQ as number).toBeGreaterThanOrEqual(3 - 1e-9);
          expect(a.filterQ as number).toBeLessThanOrEqual(8 + 1e-9);
          expect(Math.abs((a.filterQ as number) / 0.1 - Math.round((a.filterQ as number) / 0.1))).toBeLessThan(1e-6);
          expect(a.filterFreq).toBeGreaterThanOrEqual(400);
          expect(a.filterFreq).toBeLessThanOrEqual(2500);
        }
      }
      expect(SAMPLE.some((a) => a.filterType === 'bandpass'), 'some accent robot should be a bandpass').toBe(true);
      expect(SAMPLE.some((a) => a.filterType === 'lowpass' && isAccent(a)), 'some accent robot should stay lowpass').toBe(true);
    });

    it('no robot is ever highpass, filterFreq 0 (the "no filter" sentinel) or a portamento outside {0} + [0.05, 0.20]', () => {
      for (const a of SAMPLE) {
        expect(a.filterType).not.toBe('highpass');
        expect(a.filterFreq).toBeGreaterThan(0);
        const p = a.portamento as number;
        expect(p === 0 || (p >= 0.05 - 1e-9 && p <= 0.20 + 1e-9)).toBe(true);
      }
    });

    it('every one of the six non-linear curves turns up for attack and for release, and the shaped ones are never "linear"', () => {
      const nonLinear = ENVELOPE_CURVE_NAMES.filter((c) => c !== 'linear');
      expect(nonLinear).toHaveLength(6);
      // 400 robots x 15 % ~ 60 shaped per side over 6 names is thin; sample a larger world set for coverage only.
      const bigWorlds = Array.from({ length: 10 }, (_, i) => createNoise2D(alea(`articulation-coverage-world-${i}`)));
      const wide = bigWorlds.flatMap((noiseMap) => Array.from({ length: 150 }, (_, offset) => generateAudioAttributes(noiseMap, offset)));
      for (const curve of nonLinear) {
        expect(wide.some((a) => a.adsr.attackCurve === curve), `attack ${curve}`).toBe(true);
        expect(wide.some((a) => a.adsr.releaseCurve === curve), `release ${curve}`).toBe(true);
      }
    });

    it('draws attack and release independently — some robot shapes one and not the other', () => {
      expect(SAMPLE.some((a) => (a.adsr.attackCurve === 'linear') !== (a.adsr.releaseCurve === 'linear'))).toBe(true);
    });

    describe('at the extremes of the noise range', () => {
      it('noise -1 (every draw at its min) is a glider with the accent bandpass: 0.05 s, 400 Hz, Q 3, first non-linear curves', () => {
        const a = generateAudioAttributes(constantNoiseMap(-1), 0);
        expect(a.portamento).toBeCloseTo(0.05, 9);
        expect(a.filterFreq).toBe(400);
        expect(a.filterQ).toBeCloseTo(3, 9);
        expect(a.filterType).toBe('bandpass');
        expect(a.adsr.attackCurve).toBe('exponential'); // shaped roll 0 < 0.15, index 0 of the six non-linear names
        expect(a.adsr.releaseCurve).toBe('exponential');
        // A shaped stage is short enough for its shape to be heard: the bottom of the shaped ranges.
        expect(a.adsr.attack).toBeCloseTo(0.03, 9);
        expect(a.adsr.release).toBeCloseTo(0.15, 9);
        expect(a.adsr.decay).toBeCloseTo(0, 9);
      });

      it('noise +1 (every draw at its max) is the plain robot: no glide, linear curves, open lowpass at 8000 Hz, Q 1', () => {
        const a = generateAudioAttributes(constantNoiseMap(1), 0);
        expect(a.portamento).toBe(0);
        expect(a.adsr.attackCurve).toBe('linear');
        expect(a.adsr.releaseCurve).toBe('linear');
        // A plain robot keeps the full seeded range: the top of it.
        expect(a.adsr.attack).toBeCloseTo(2, 9);
        expect(a.adsr.release).toBeCloseTo(2, 9);
        expect(a.adsr.decay).toBeCloseTo(2, 9);
        expect(a.filterFreq).toBe(8000);
        expect(a.filterQ).toBe(1);
        expect(a.filterType).toBe('lowpass');
      });

      it('a shaped curve whose index draw lands exactly on its max clamps to the last name (never undefined)', () => {
        // The shaped roll at its min, the index draw at the top of its own range.
        const a = generateAudioAttributes(noiseMapForDataIds({ 'robot.audio.attackCurve.shaped': -1, 'robot.audio.attackCurve.which': 1 }), 0);
        expect(a.adsr.attackCurve).toBe(ENVELOPE_CURVE_NAMES[ENVELOPE_CURVE_NAMES.length - 1]);
      });
    });

    describe('Attack and Release times (shaped stages are short enough to hear)', () => {
      const shapedAttacks = SAMPLE.filter((a) => a.adsr.attackCurve !== 'linear');
      const plainAttacks = SAMPLE.filter((a) => a.adsr.attackCurve === 'linear');
      const shapedReleases = SAMPLE.filter((a) => a.adsr.releaseCurve !== 'linear');
      const plainReleases = SAMPLE.filter((a) => a.adsr.releaseCurve === 'linear');

      it('every robot\'s Attack and Release sit inside 0-2 s, so each is a value its slider can show', () => {
        for (const a of SAMPLE) {
          expect(a.adsr.attack).toBeGreaterThanOrEqual(0);
          expect(a.adsr.attack).toBeLessThanOrEqual(2);
          expect(a.adsr.release).toBeGreaterThanOrEqual(0);
          expect(a.adsr.release).toBeLessThanOrEqual(2);
        }
      });

      it('a robot with a shaped attack has an attack of 0.03-0.25 s', () => {
        expect(shapedAttacks.length, 'sample has shaped attacks').toBeGreaterThan(20);
        for (const a of shapedAttacks) {
          expect(a.adsr.attack, `attack ${a.adsr.attackCurve}`).toBeGreaterThanOrEqual(0.03 - 1e-9);
          expect(a.adsr.attack).toBeLessThanOrEqual(0.25 + 1e-9);
        }
      });

      it('a robot with a shaped release has a release of 0.15-0.8 s', () => {
        expect(shapedReleases.length, 'sample has shaped releases').toBeGreaterThan(20);
        for (const a of shapedReleases) {
          expect(a.adsr.release, `release ${a.adsr.releaseCurve}`).toBeGreaterThanOrEqual(0.15 - 1e-9);
          expect(a.adsr.release).toBeLessThanOrEqual(0.8 + 1e-9);
        }
      });

      it('the two stages are decided separately: a shaped attack does not shorten that robot\'s release, nor the reverse', () => {
        const attackOnly = SAMPLE.filter((a) => a.adsr.attackCurve !== 'linear' && a.adsr.releaseCurve === 'linear');
        const releaseOnly = SAMPLE.filter((a) => a.adsr.attackCurve === 'linear' && a.adsr.releaseCurve !== 'linear');
        expect(attackOnly.length).toBeGreaterThan(0);
        expect(releaseOnly.length).toBeGreaterThan(0);
        expect(attackOnly.some((a) => a.adsr.release > 0.8), 'a robot shaping only its attack can have a long release').toBe(true);
        expect(releaseOnly.some((a) => a.adsr.attack > 0.25), 'a robot shaping only its release can have a long attack').toBe(true);
      });

      it('plain robots keep the whole 0-2 s range: both short and long values turn up, and most are past the drone line (0.5 s)', () => {
        for (const group of [plainAttacks.map((a) => a.adsr.attack), plainReleases.map((a) => a.adsr.release)]) {
          expect(Math.max(...group)).toBeGreaterThan(1.5);
          expect(Math.min(...group)).toBeLessThan(0.5);
          expect(group.filter((v) => v > 0.5).length / group.length).toBeGreaterThan(0.5);
        }
      });

      it('Decay is seeded over the same 0-2 s: short and long values both turn up, and none past the slider', () => {
        const decays = SAMPLE.map((a) => a.adsr.decay);
        expect(Math.max(...decays)).toBeGreaterThan(1.5);
        expect(Math.max(...decays)).toBeLessThanOrEqual(2);
        expect(Math.min(...decays)).toBeGreaterThanOrEqual(0);
        expect(Math.min(...decays)).toBeLessThan(0.5);
      });

      it('a shaped attack or release does not shorten Decay: it is drawn from its own range whatever the curves say', () => {
        const shapedBoth = SAMPLE.filter((a) => a.adsr.attackCurve !== 'linear' && a.adsr.releaseCurve !== 'linear');
        const plain = SAMPLE.filter((a) => a.adsr.attackCurve === 'linear' && a.adsr.releaseCurve === 'linear');
        expect(shapedBoth.length).toBeGreaterThan(0);
        expect(Math.max(...[...shapedBoth, ...plain].map((a) => a.adsr.decay))).toBeGreaterThan(1.5);
        expect(plain.some((a) => a.adsr.decay > 1.5)).toBe(true);
      });

      it('a plain robot lands 30 % of the way from the slider floor to 2 s, and its body reads that value over 2 s', async () => {
        const { bodyShapeFromAdsr } = await import('../components/robot/robotVisualHelpers');
        // Every draw lands 30 % of the way through whichever range it was given (raw -0.4); the shaped rolls say "not shaped".
        const a = generateAudioAttributes(
          noiseMapForDataIds({ 'robot.audio.attackCurve.shaped': 1, 'robot.audio.releaseCurve.shaped': 1 }, -0.4),
          0,
        );
        const attack = ENVELOPE_ATTACK_MIN_SECONDS + 0.3 * (2 - ENVELOPE_ATTACK_MIN_SECONDS);
        const release = ENVELOPE_RELEASE_MIN_SECONDS + 0.3 * (2 - ENVELOPE_RELEASE_MIN_SECONDS);
        expect(a.adsr.attack).toBeCloseTo(attack, 9);
        expect(a.adsr.release).toBeCloseTo(release, 9);
        const body = bodyShapeFromAdsr(a.adsr);
        expect(body.scale).toBeCloseTo(0.25 + (1 - attack / 2) * 0.75, 9);
        expect(body.detail).toBeCloseTo(release / 2, 9);
      });

      it('a shaped stage lands 50 % of the way through its own short range, not the full one', () => {
        // Every draw at the middle of its range (raw 0); the shaped rolls at their min say "shaped".
        const a = generateAudioAttributes(
          noiseMapForDataIds({ 'robot.audio.attackCurve.shaped': -1, 'robot.audio.releaseCurve.shaped': -1 }, 0),
          0,
        );
        expect(a.adsr.attackCurve).not.toBe('linear');
        expect(a.adsr.releaseCurve).not.toBe('linear');
        expect(a.adsr.attack).toBeCloseTo(0.03 + 0.5 * (0.25 - 0.03), 9);
        expect(a.adsr.release).toBeCloseTo(0.15 + 0.5 * (0.8 - 0.15), 9);
      });
    });

    describe('bus.frequency link odds and depth window (generateRobotLfoLinks)', () => {
      const ZERO_COUNTS: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };
      const linkSample = WORLDS.flatMap((noiseMap) => Array.from({ length: 40 }, (_, offset) => generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS)));

      it('about 15 % of robots seed a lit bus.frequency link, rarer than a lit layer target', () => {
        const lit = linkSample.filter((l) => l['bus.frequency'].lane !== null).length;
        expect(lit / linkSample.length, `${lit}/400 lit bus links`).toBeGreaterThanOrEqual(0.10);
        expect(lit / linkSample.length, `${lit}/400 lit bus links`).toBeLessThanOrEqual(0.20);
        const layerLit = linkSample.flatMap((l) => (['layer0.gain', 'layer1.gain', 'layer2.gain'] as const).map((t) => l[t])).filter((x) => x.lane !== null).length;
        expect(lit / linkSample.length).toBeLessThan(layerLit / (linkSample.length * 3));
      });

      it('a lit bus link has an integer depth in 1-40; a quiet one is exactly { lane: null, depth: 0 }', () => {
        let maxDepth = 0;
        for (const links of linkSample) {
          const link = links['bus.frequency'];
          if (link.lane === null) {
            expect(link).toEqual({ lane: null, depth: 0 });
            continue;
          }
          expect(Number.isInteger(link.depth)).toBe(true);
          expect(link.depth).toBeGreaterThanOrEqual(1);
          expect(link.depth).toBeLessThanOrEqual(40);
          maxDepth = Math.max(maxDepth, link.depth);
        }
        expect(maxDepth, 'a bus depth should be able to reach well past the detune ceiling of 10').toBeGreaterThan(20);
      });

      it('leaves the six layer targets on their own thresholds and depth windows (gain <= 60, detune <= 10)', () => {
        for (const links of linkSample) {
          for (const target of ROBOT_LFO_TARGET_IDS) {
            if (links[target].lane === null) continue;
            if (target.endsWith('.gain')) expect(links[target].depth).toBeLessThanOrEqual(60);
            if (target.endsWith('.detune')) expect(links[target].depth).toBeLessThanOrEqual(10);
          }
        }
      });
    });

    describe('spawnRobot, the baseline and the reserve sites for a robot that is a glider AND an accent', () => {
      const localeId = 'articulation-seeding-locale';
      /** Forces a glider (+ accent); everything else stays the real seeded draw. */
      async function forceGliderAccent() {
        await forceSeededDraws({
          'robot.audio.portamento.glider': 0,
          'robot.audio.filter.accent': 0,
          'robot.audio.filter.type': 0, // < 0.4 -> bandpass
        });
      }

      beforeEach(() => {
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
        }));
      });
      afterEach(() => {
        vi.restoreAllMocks();
      });

      it('generateRobotAudioBaseline equals what spawnRobot stored — the distinguishing glider + accent fixture', async () => {
        await forceGliderAccent();
        try {
          spawnRobot(localeId);
          const locale = useLocaleStore.getState().getLocaleById(localeId)!;
          const robot = locale.robots[0];
          // Fixture sanity: parity must not pass by coincidence on defaults.
          expect(robot.audioAttributes.portamento).toBeGreaterThan(0);
          expect(robot.audioAttributes.filterQ).toBeGreaterThanOrEqual(3);
          expect(robot.audioAttributes.filterType).toBe('bandpass');

          const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
          const baseline = generateRobotAudioBaseline(noiseMap, 0, []);
          expect(baseline.audioAttributes).toEqual(robot.audioAttributes);
        } finally {
          await restoreSeededDraws();
        }
      });

      it('spawnRobot hands reserveVoice the robot\'s portamento, filterQ and filterType as the 9th argument', async () => {
        await forceGliderAccent();
        const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        try {
          spawnRobot(localeId);
          const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];
          expect(reserveSpy).toHaveBeenCalledTimes(1);
          expect(reserveSpy.mock.calls[0][8]).toEqual({
            portamento: robot.audioAttributes.portamento,
            filterQ: robot.audioAttributes.filterQ,
            filterType: robot.audioAttributes.filterType,
          });
          expect(reserveSpy.mock.calls[0][8]).toEqual({ portamento: expect.any(Number), filterQ: expect.any(Number), filterType: 'bandpass' });
          expect((reserveSpy.mock.calls[0][8] as { portamento: number }).portamento).toBeGreaterThan(0);
        } finally {
          await restoreSeededDraws();
        }
      });

      it('reRegisterAllRobotsAudio passes the same articulation object, from the stored (possibly edited) robot', async () => {
        await forceGliderAccent();
        const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        try {
          spawnRobot(localeId);
          const locale = useLocaleStore.getState().getLocaleById(localeId)!;
          const robot = locale.robots[0];
          // An edit made since spawn must win over the seeded value: the call reads the store.
          useLocaleStore.setState((state) => ({
            locales: {
              ...state.locales,
              [localeId]: {
                ...state.locales[localeId],
                robots: state.locales[localeId].robots.map((r) => ({ ...r, audioAttributes: { ...r.audioAttributes, portamento: 0.5, filterQ: 12, filterType: 'highpass' as const } })),
              },
            },
          }));
          reserveSpy.mockClear();

          reRegisterAllRobotsAudio(localeId);

          expect(reserveSpy).toHaveBeenCalledTimes(1);
          expect(reserveSpy.mock.calls[0][0]).toBe(robot.id);
          expect(reserveSpy.mock.calls[0][8]).toEqual({ portamento: 0.5, filterQ: 12, filterType: 'highpass' });
        } finally {
          await restoreSeededDraws();
        }
      });
    });
  });

  describe('generateRobotLfoLinks', () => {
    const ZERO_COUNTS: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };

    it('generates LfoLinks for all 6 RobotLfoTargetId values, no extras', () => {
      const links = generateRobotLfoLinks(mockNoiseMap, 0, ZERO_COUNTS);
      expect(Object.keys(links).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());
    });

    it('every quiet target is exactly { lane: null, depth: 0 }; every lit target has a real lane and an integer depth within its own field\'s seed range (gain: (0, 60], detune: (0, 10])', () => {
      for (let i = 0; i < 30; i++) {
        const links = generateRobotLfoLinks(mockNoiseMap, i, ZERO_COUNTS);
        for (const target of ROBOT_LFO_TARGET_IDS) {
          const link = links[target];
          if (link.lane === null) {
            expect(link.depth, `${target}.depth (offset ${i})`).toBe(0);
            continue;
          }
          expect(LFO_LANE_IDS, `${target}.lane (offset ${i})`).toContain(link.lane);
          expect(Number.isInteger(link.depth), `${target}.depth (offset ${i})`).toBe(true);
          expect(link.depth, `${target}.depth (offset ${i})`).toBeGreaterThan(0); // never silently inaudible when lit
          if (target.endsWith('.gain')) {
            expect(link.depth, `${target}.depth (offset ${i})`).toBeLessThanOrEqual(60);
          } else if (target === 'bus.frequency') {
            expect(link.depth, `${target}.depth (offset ${i})`).toBeLessThanOrEqual(40);
          } else {
            expect(link.depth, `${target}.depth (offset ${i})`).toBeLessThanOrEqual(10);
          }
        }
      }
    });

    it('a lit gain target\'s depth can land near its own 60% ceiling, not the old shared 100% one', () => {
      const noiseMap = createNoise2D(alea('lfo-link-gain-depth-ceiling-test-seed'));
      let maxGainDepth = 0;
      for (let offset = 0; offset < 300; offset++) {
        const links = generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS);
        for (const target of ROBOT_LFO_TARGET_IDS) {
          if (target.endsWith('.gain') && links[target].lane !== null) maxGainDepth = Math.max(maxGainDepth, links[target].depth);
        }
      }
      expect(maxGainDepth).toBeGreaterThan(50);
      expect(maxGainDepth).toBeLessThanOrEqual(60);
    });

    it('a lit detune target\'s depth can land near its own 10% ceiling, not the old shared 100% one', () => {
      const noiseMap = createNoise2D(alea('lfo-link-detune-depth-ceiling-test-seed'));
      let maxDetuneDepth = 0;
      for (let offset = 0; offset < 300; offset++) {
        const links = generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS);
        for (const target of ROBOT_LFO_TARGET_IDS) {
          if (target.endsWith('.detune') && links[target].lane !== null) maxDetuneDepth = Math.max(maxDetuneDepth, links[target].depth);
        }
      }
      expect(maxDetuneDepth).toBeGreaterThan(7);
      expect(maxDetuneDepth).toBeLessThanOrEqual(10);
    });

    it('is deterministic — the same real seeded noise map + offset + priorLaneCounts always produces identical links', () => {
      const noiseMap = createNoise2D(alea('lfo-link-determinism-test-seed'));
      const first = generateRobotLfoLinks(noiseMap, 5, ZERO_COUNTS);
      const second = generateRobotLfoLinks(noiseMap, 5, ZERO_COUNTS);
      expect(second).toEqual(first);
    });

    it('produces different links for a different spawn offset (non-degenerate)', () => {
      const noiseMap = createNoise2D(alea('lfo-link-determinism-test-seed'));
      const a = generateRobotLfoLinks(noiseMap, 0, ZERO_COUNTS);
      const b = generateRobotLfoLinks(noiseMap, 1, ZERO_COUNTS);
      expect(b).not.toEqual(a);
    });

    it('seeds a lit (non-null lane) target for roughly 20-40% of targets across 50 robots (the 0.7 quiet threshold, reused)', () => {
      // Spread across 5 worlds x 10 offsets (= 50 "robots") rather than one seed's 50 offsets —
      // a single noise map can land near a band edge by chance (found live: one seed alone gave
      // 19.67%, just under the 20% floor), the same multi-world spread the existing "quiet odds"
      // describe block above already uses for this same 0.7 threshold.
      const worlds = [
        createNoise2D(alea('lfo-link-rate-sample-1')),
        createNoise2D(alea('lfo-link-rate-sample-2')),
        createNoise2D(alea('lfo-link-rate-sample-3')),
        createNoise2D(alea('lfo-link-rate-sample-4')),
        createNoise2D(alea('lfo-link-rate-sample-5')),
      ];
      let litCount = 0;
      let totalCount = 0;
      for (const noiseMap of worlds) {
        for (let offset = 0; offset < 10; offset++) {
          const links = generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS);
          for (const target of ROBOT_LFO_TARGET_IDS) {
            totalCount++;
            if (links[target].lane !== null) litCount++;
          }
        }
      }
      const litRate = litCount / totalCount;
      expect(litRate, `${litCount}/${totalCount} lit`).toBeGreaterThanOrEqual(0.2);
      expect(litRate, `${litCount}/${totalCount} lit`).toBeLessThanOrEqual(0.4);
    });

    it('a heavily-loaded prior lane (a: 20) puts fewer than 15% of 100 lit draws on lane a, and far fewer than a zero-count baseline on the same seeds (least-used lean)', () => {
      // Round-robin across several worlds (same reasoning as the lit-rate test above) rather than
      // one seed's offset sequence — spreads the lit draws over independent noise so the measured
      // share reflects pickLane's weighting, not one seed's own quirks.
      const worlds = Array.from({ length: 10 }, (_, i) => createNoise2D(alea(`lfo-link-prior-counts-${i}`)));

      /** Tallies lane 'a' lit picks up to a cap, round-robin across worlds/offsets, for a given starting tally. */
      function tallyLaneA(priorLaneCounts: Record<LfoLaneId, number>, cap: number): { aCount: number; litCount: number } {
        let aCount = 0;
        let litCount = 0;
        outer: for (let offset = 0; offset < 200; offset++) {
          for (const noiseMap of worlds) {
            const links = generateRobotLfoLinks(noiseMap, offset, priorLaneCounts);
            for (const target of ROBOT_LFO_TARGET_IDS) {
              if (litCount >= cap) break outer;
              const link = links[target];
              if (link.lane === null) continue;
              litCount++;
              if (link.lane === 'a') aCount++;
            }
          }
        }
        return { aCount, litCount };
      }

      const withHeavyPriorA = tallyLaneA({ a: 20, b: 0, c: 0, d: 0 }, 100);
      const zeroCountBaseline = tallyLaneA({ a: 0, b: 0, c: 0, d: 0 }, 100);

      expect(withHeavyPriorA.litCount, 'did not gather 100 lit draws within the offset budget').toBe(100);
      // The literal acceptance bound (docs/tasks/LFO_BANK.md Task 6).
      expect(withHeavyPriorA.aCount, `${withHeavyPriorA.aCount}/${withHeavyPriorA.litCount} on lane a`).toBeLessThan(15);
      // The discriminating comparison: a heavy prior count on 'a' must suppress its share below
      // what the SAME seeds, same worlds/offsets give it with no prior count at all — this is
      // exactly what the mutation check (dropping the priorLaneCounts term) breaks: with the term
      // gone, both tallies run the identical algorithm against identical seeds and must come out
      // equal, failing this strict inequality. (The absolute zero-count share measured here is
      // this codebase's real getSeededVal-driven value, not the naive uniform-t expectation —
      // the sanity floor just confirms the comparison isn't vacuously 0 vs 0.)
      expect(zeroCountBaseline.aCount, 'zero-count baseline should see at least a few lane-a picks to make this comparison meaningful').toBeGreaterThan(2);
      expect(withHeavyPriorA.aCount).toBeLessThan(zeroCountBaseline.aCount);
    });
  });

  // Robot Sends T5 (docs/specs/ROBOT_SENDS.md section 1.2): one helper serves spawnRobot and
  // generateRobotAudioBaseline, so the two cannot drift.
  describe('generateRobotSends (Robot Sends T5)', () => {
    const realNoise = createNoise2D(alea('robot-sends-test-seed'));
    const onGrid = (x: number) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;

    afterEach(async () => {
      await restoreSeededDraws();
    });

    /** Force each send draw to a chosen raw value; everything else stays real. */
    async function forceDraws(draws: { reverb: number; delay: number; quiet: number }) {
      await forceSeededDraws({ 'robot.send.reverb': draws.reverb, 'robot.send.delay': draws.delay, 'robot.send.delay.quiet': draws.quiet });
    }

    it('stays inside the bands - reverb 0.1 to 0.6, delay 0 to 0.3 - and on the 0.01 grid, over many offsets', () => {
      for (let offset = 0; offset < 300; offset++) {
        const { reverbSend, delaySend } = generateRobotSends(realNoise, offset);
        expect(reverbSend, `offset ${offset}`).toBeGreaterThanOrEqual(0.1);
        expect(reverbSend, `offset ${offset}`).toBeLessThanOrEqual(0.6);
        expect(onGrid(reverbSend), `offset ${offset} reverb ${reverbSend}`).toBe(true);
        expect(delaySend, `offset ${offset}`).toBeGreaterThanOrEqual(0);
        expect(delaySend, `offset ${offset}`).toBeLessThanOrEqual(0.3);
        expect(onGrid(delaySend), `offset ${offset} delay ${delaySend}`).toBe(true);
      }
    });

    it('is deterministic for a noise map and offset, and varies between offsets', () => {
      expect(generateRobotSends(realNoise, 7)).toEqual(generateRobotSends(realNoise, 7));
      const reverbs = new Set(Array.from({ length: 50 }, (_, i) => generateRobotSends(realNoise, i).reverbSend));
      expect(reverbs.size).toBeGreaterThan(8);
    });

    it('hits the band edges exactly: the lowest noise gives reverb 0.1 and a quiet delay, the highest gives reverb 0.6 and delay 0.3', () => {
      expect(reverbAndDelay(generateRobotSends(constantNoiseMap(-1), 0))).toEqual({ reverbSend: 0.1, delaySend: 0 });
      expect(reverbAndDelay(generateRobotSends(constantNoiseMap(1), 0))).toEqual({ reverbSend: 0.6, delaySend: 0.3 });
    });

    // Classic Band Retune T5 (row 15): the reverb send band widened from 0.1-0.4 to 0.1-0.6 for more contrast between a dry
    // probe and a wet one. The delay band is untouched. The reach test is on the real seeded draw, so a band written
    // correctly but read from the wrong row (or a clamp left behind at 0.4) cannot pass.
    it('reaches the widened reverb band on the real draw: some robots above 0.45, some under 0.2, none above 0.6, over 400 offsets', () => {
      const reverbs = Array.from({ length: 400 }, (_, offset) => generateRobotSends(realNoise, offset).reverbSend);
      expect(Math.max(...reverbs), 'the top is reachable beyond the old 0.4 ceiling').toBeGreaterThan(0.45);
      expect(Math.max(...reverbs)).toBeLessThanOrEqual(0.6);
      expect(Math.min(...reverbs), 'the bottom is reachable').toBeLessThan(0.2);
      expect(Math.min(...reverbs)).toBeGreaterThanOrEqual(0.1);
    });

    it('leaves the delay band alone: the highest noise still gives 0.3, never more', () => {
      expect(generateRobotSends(constantNoiseMap(1), 0).delaySend).toBe(0.3);
      for (let offset = 0; offset < 300; offset++) expect(generateRobotSends(realNoise, offset).delaySend).toBeLessThanOrEqual(0.3);
    });

    it('goes quiet on a delay roll just under 0.25 and not on exactly 0.25', async () => {
      await forceDraws({ reverb: 0.3, delay: 0.2, quiet: 0.2499 });
      expect(generateRobotSends(realNoise, 0).delaySend).toBe(0);
      await forceDraws({ reverb: 0.3, delay: 0.2, quiet: 0.25 });
      expect(generateRobotSends(realNoise, 0).delaySend).toBe(0.2);
    });

    it('a quiet delay never touches the reverb draw', async () => {
      await forceDraws({ reverb: 0.37, delay: 0.2, quiet: 0 });
      expect(reverbAndDelay(generateRobotSends(realNoise, 0))).toEqual({ reverbSend: 0.37, delaySend: 0 });
    });

    it('quantizes in percent space to the nearest whole percent', async () => {
      await forceDraws({ reverb: 0.3449, delay: 0.1051, quiet: 1 });
      expect(reverbAndDelay(generateRobotSends(realNoise, 0))).toEqual({ reverbSend: 0.34, delaySend: 0.11 });
      await forceDraws({ reverb: 0.3451, delay: 0.1049, quiet: 1 });
      expect(reverbAndDelay(generateRobotSends(realNoise, 0))).toEqual({ reverbSend: 0.35, delaySend: 0.1 });
    });

    it('reads the robot send table - the reverbSend and delaySend rows - for its bands', () => {
      vi.mocked(getUniformSeededVal).mockClear();

      generateRobotSends(realNoise, 3);

      // The even draw (Even Seeded Draws T9a); the three effect room sends' six draws are filtered out.
      const calls = vi.mocked(getUniformSeededVal).mock.calls
        .filter((c) => /^robot\.send\.(reverb|delay)/.test(String(c[1])))
        .map((c) => [c[1], c[2], c[3], c[4]]);
      const { reverbSend, delaySend } = CLASSIC;
      expect(calls).toContainEqual(['robot.send.reverb', 3, reverbSend.min, reverbSend.max]);
      // band-table T22: the Reverb row's lit share is rolled too (never quiet under Classic's lit of 1).
      expect(calls).toContainEqual(['robot.send.reverb.quiet', 3, 0, 1]);
      expect(calls).toContainEqual(['robot.send.delay', 3, delaySend.min, delaySend.max]);
      expect(calls).toContainEqual(['robot.send.delay.quiet', 3, 0, 1]);
      expect(calls).toHaveLength(4);
    });

    it('takes the quiet threshold from the Delay row: a roll under 1 - lit is quiet', async () => {
      // The loaded table with its Delay row lit at 0.4 (quiet below 0.6), read through getBand as the generator reads it.
      const realGetBand = loadingContextModule.getBand;
      const getBand = vi
        .spyOn(loadingContextModule, 'getBand')
        .mockImplementation(((key: BandKey) =>
          key === 'delaySend' ? { ...realGetBand('delaySend'), lit: 0.4 } : realGetBand(key)) as typeof realGetBand);
      try {
        await forceDraws({ reverb: 0.3, delay: 0.2, quiet: 0.59 });
        expect(generateRobotSends(realNoise, 0).delaySend).toBe(0);
        await forceDraws({ reverb: 0.3, delay: 0.2, quiet: 0.6 });
        expect(generateRobotSends(realNoise, 0).delaySend).toBe(0.2);
      } finally {
        getBand.mockRestore();
      }
    });

    // Robot Effect Sends T1 (plan acceptance "Parity"): moving the Reverb and Delay bands into the robot send table must not
    // move a single seeded send. These are the values the branch base (ad1b37c1, Classic Band Retune merged at 2dc5b4a2)
    // seeds for two twelve-robot rosters, recorded from a run on the base before the change. Never re-record them, with
    // one exception made: Even Seeded Draws T9a (Crawford, 2026-11-02) moved the four Reverb and Delay draws to the even
    // draw on purpose, and they were re-recorded once from that code.
    it('seeds, value for value, the Reverb and Delay sends the branch base seeds for two fixed rosters', () => {
      const BASE: Record<string, Array<[number, number]>> = {
        'effect-sends-parity-a': [
          [0.16, 0.27], [0.41, 0.04], [0.39, 0.2], [0.6, 0.06], [0.28, 0.29], [0.11, 0],
          [0.56, 0.09], [0.21, 0.23], [0.14, 0], [0.18, 0.09], [0.5, 0.16], [0.32, 0],
        ],
        'effect-sends-parity-b': [
          [0.37, 0.16], [0.49, 0.16], [0.38, 0.27], [0.33, 0], [0.2, 0], [0.2, 0.1],
          [0.36, 0.21], [0.24, 0.29], [0.18, 0], [0.47, 0], [0.3, 0.07], [0.11, 0.2],
        ],
      };
      // Each index's own draw (Company Families Task 5): a roster's company members now carry their founder's sends, so
      // the pin reads the draw itself, which is what it always recorded for an original.
      for (const [seed, expected] of Object.entries(BASE)) {
        const noise = createNoise2D(alea(seed));
        const draws = Array.from({ length: 12 }, (_, i) => generateRobotSends(noise, i));
        expect(draws.map((b) => [b.reverbSend, b.delaySend]), seed).toEqual(expected);
      }
    });

    it('leaves a sizeable share of a large fleet with no delay at all (a loose statistical bound)', () => {
      // The threshold is 0.25 and the roll is even (Even Seeded Draws T9a), so about a quarter of the fleet; the bunched
      // draw before it left about 17-18 % (2026-10-14). robotFieldDerivation.test.ts holds the share to 25 +/- 2 %.
      const total = 600;
      let quiet = 0;
      for (let offset = 0; offset < total; offset++) {
        if (generateRobotSends(realNoise, offset).delaySend === 0) quiet++;
      }
      expect(quiet / total).toBeGreaterThan(0.1);
      expect(quiet / total).toBeLessThan(0.3);
    });
  });

  // Robot Effect Sends T7 (docs/specs/ROBOT_EFFECT_SENDS.md assumption 7, §1.2): the three effect room sends are uniform
  // per-robot rolls in the order Grit -> Shimmer -> Double, at most one landing; every roll and value key is read on every
  // robot, so the draw set never depends on the outcome.
  describe('generateRobotSends - the three effect room sends (Robot Effect Sends T7)', () => {
    const realNoise = createNoise2D(alea('effect-sends-test-seed'));
    const onGrid = (x: number) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
    const BANDS = CLASSIC;
    const EXCLUSIVE = ['gritSend', 'shimmerSend', 'doubleSend'] as const;

    afterEach(async () => {
      await restoreSeededDraws();
    });

    /** Force each uniform roll / value draw by dataId; any other draw stays real. */
    async function forceUniform(draws: Record<string, number>) {
      await forceSeededDraws(draws);
    }

    it('returns all five sends', () => {
      expect(Object.keys(generateRobotSends(realNoise, 3)).sort()).toEqual(['delaySend', 'doubleSend', 'gritSend', 'reverbSend', 'shimmerSend']);
    });

    it('seeds each of the three at exactly 0 or inside its band on the 1 % grid, and never two on one robot, over 400 offsets', () => {
      const landed = { gritSend: 0, shimmerSend: 0, doubleSend: 0 };
      for (let offset = 0; offset < 400; offset++) {
        const sends = generateRobotSends(realNoise, offset);
        const carried = EXCLUSIVE.filter((field) => sends[field] !== 0);
        expect(carried.length, `offset ${offset}`).toBeLessThanOrEqual(1);
        for (const field of carried) {
          landed[field] += 1;
          expect(sends[field], `${field} at ${offset}`).toBeGreaterThanOrEqual(BANDS[field].min);
          expect(sends[field], `${field} at ${offset}`).toBeLessThanOrEqual(BANDS[field].max);
          expect(onGrid(sends[field]), `${field} ${sends[field]}`).toBe(true);
        }
      }
      // All three reachable (a loose bound; the calibration below pins the shares).
      for (const field of EXCLUSIVE) expect(landed[field], field).toBeGreaterThan(20);
    });

    it('is deterministic for a noise map and offset', () => {
      for (let offset = 0; offset < 30; offset++) {
        expect(generateRobotSends(realNoise, offset)).toEqual(generateRobotSends(realNoise, offset));
      }
    });

    it('reads every roll and value key at the offset on every robot, whatever lands', () => {
      // The four Reverb and Delay draws are even too since Even Seeded Draws T9a.
      const KEYS = [
        'robot.send.grit.lit', 'robot.send.grit', 'robot.send.shimmer.lit', 'robot.send.shimmer', 'robot.send.double.lit', 'robot.send.double',
        'robot.send.reverb', 'robot.send.delay', 'robot.send.reverb.quiet', 'robot.send.delay.quiet',
      ];
      for (let offset = 0; offset < 60; offset++) {
        vi.mocked(getUniformSeededVal).mockClear();
        generateRobotSends(realNoise, offset);
        const calls = vi.mocked(getUniformSeededVal).mock.calls;
        expect(calls.map((c) => c[1]).sort(), `offset ${offset}`).toEqual([...KEYS].sort());
        expect(calls.every((c) => c[2] === offset), `offset ${offset}`).toBe(true);
      }
    });

    it('lands the first roll under its edge, Grit before Shimmer, and caps the rest: a later landing roll is dropped', async () => {
      await forceUniform({
        'robot.send.grit.lit': 0.1, 'robot.send.grit': 0.5,
        'robot.send.shimmer.lit': 0.05, 'robot.send.shimmer': 0.5,
        'robot.send.double.lit': 0.01, 'robot.send.double': 0.5,
      });
      expect(effectSends(generateRobotSends(realNoise, 0))).toEqual({ gritSend: 0.6, shimmerSend: 0, doubleSend: 0 });
    });

    it('a Grit roll at or over its edge lets the Shimmer land, and the Shimmer then caps the Double', async () => {
      await forceUniform({
        'robot.send.grit.lit': BANDS.gritSend.lit, 'robot.send.grit': 0.5,
        'robot.send.shimmer.lit': 0.05, 'robot.send.shimmer': 0,
        'robot.send.double.lit': 0.01, 'robot.send.double': 0.5,
      });
      expect(effectSends(generateRobotSends(realNoise, 0))).toEqual({ gritSend: 0, shimmerSend: 0.2, doubleSend: 0 });
    });

    it('lands the Double alone when only its roll is under its edge, at the top of its band', async () => {
      await forceUniform({
        'robot.send.grit.lit': 0.9, 'robot.send.grit': 0.5,
        'robot.send.shimmer.lit': 0.9, 'robot.send.shimmer': 0.5,
        'robot.send.double.lit': 0.18, 'robot.send.double': 0.9999,
      });
      expect(effectSends(generateRobotSends(realNoise, 0))).toEqual({ gritSend: 0, shimmerSend: 0, doubleSend: 0.6 });
    });

    it('lands nothing when every roll is over its edge', async () => {
      await forceUniform({ 'robot.send.grit.lit': 0.99, 'robot.send.shimmer.lit': 0.99, 'robot.send.double.lit': 0.99 });
      expect(effectSends(generateRobotSends(realNoise, 0))).toEqual({ gritSend: 0, shimmerSend: 0, doubleSend: 0 });
    });

    it('maps a value draw linearly into its band and quantises to the nearest whole percent', async () => {
      for (const [t, expected] of [[0, 0.4], [0.25, 0.5], [0.4937, 0.6], [0.4938, 0.6], [0.5063, 0.6], [0.5063 + 0.0126, 0.61]] as const) {
        await forceUniform({ 'robot.send.grit.lit': 0, 'robot.send.grit': t });
        expect(generateRobotSends(realNoise, 0).gritSend, `t ${t}`).toBeCloseTo(expected, 12);
      }
    });

    it('takes its edges and bands from the robot send table', async () => {
      const original = { ...BANDS.shimmerSend };
      try {
        BANDS.shimmerSend.lit = 0.9;
        BANDS.shimmerSend.min = 0.1;
        BANDS.shimmerSend.max = 0.3;
        await forceUniform({ 'robot.send.grit.lit': 0.99, 'robot.send.shimmer.lit': 0.85, 'robot.send.shimmer': 1 });
        expect(generateRobotSends(realNoise, 0).shimmerSend).toBeCloseTo(0.3, 12);
      } finally {
        Object.assign(BANDS.shimmerSend, original);
      }
    });

    it('draws no send on the plain draw: the Reverb and Delay are even like the room sends (Even Seeded Draws T9a)', () => {
      vi.mocked(getSeededVal).mockClear();
      generateRobotSends(realNoise, 5);
      expect(vi.mocked(getSeededVal).mock.calls.map((c) => c[1])).toEqual([]);
    });

    // Calibration (spec §5, plan T7): 150 worlds x 12 robots. The nominal shares, with the one-of-three cap taking
    // robots from the later rolls, are Grit 0.21, Shimmer 0.79 x 0.16 = 0.1264, Double 0.79 x 0.84 x 0.19 = 0.1261, so
    // 2.52 / 1.52 / 1.51 per fleet of twelve (the spec's 1.4 for the Double was a slip). Measured 2026-10-21 on these 150
    // worlds: Grit 2.50, Shimmer 1.62, Double 1.55 per fleet, no Grit robot at all in 7.3 % of fleets; on 2 000 other
    // worlds ('effect-sends-big-<n>'): 2.53 / 1.52 / 1.51 and 6.0 % (binomial 0.79^12 = 5.9 %). The pins are the
    // test-set figures, held to within 0.4.
    it('lands about the nominal count of each per fleet of twelve, over 150 worlds', () => {
      const WORLDS = 150;
      const FLEET = 12;
      const totals = { gritSend: 0, shimmerSend: 0, doubleSend: 0 };
      let noGrit = 0;
      for (let w = 0; w < WORLDS; w++) {
        const noiseMap = createNoise2D(alea(`effect-sends-calibration-${w}`));
        let grit = 0;
        for (let i = 0; i < FLEET; i++) {
          const sends = generateRobotSends(noiseMap, i);
          for (const field of EXCLUSIVE) if (sends[field] > 0) totals[field] += 1;
          if (sends.gritSend > 0) grit += 1;
        }
        if (grit === 0) noGrit += 1;
      }
      const mean = (field: (typeof EXCLUSIVE)[number]) => totals[field] / WORLDS;
      expect(Math.abs(mean('gritSend') - CALIBRATED_MEANS.gritSend)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(mean('shimmerSend') - CALIBRATED_MEANS.shimmerSend)).toBeLessThanOrEqual(0.4);
      expect(Math.abs(mean('doubleSend') - CALIBRATED_MEANS.doubleSend)).toBeLessThanOrEqual(0.4);
      // The share of fleets with no Grit robot at all: recorded above (7.3 %), held loosely here.
      expect(noGrit / WORLDS).toBeGreaterThan(0.02);
      expect(noGrit / WORLDS).toBeLessThan(0.15);
    });
    const CALIBRATED_MEANS = { gritSend: 2.5, shimmerSend: 1.62, doubleSend: 1.55 };
  });

  describe('spawnRobot', () => {
    beforeEach(() => {
      // Reset locale store before each test
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      vi.clearAllMocks();
    });

    afterEach(() => {
      // Several tests below spyOn(AudioEngine, ...).mockReturnValue/mockImplementation
      // — restore the real implementations so later describe blocks (e.g. spawnInitialRoster) see
      // real reserveVoice behavior, not a leaked mock. vi.clearAllMocks() alone only clears call
      // history, it does not restore the original implementation.
      vi.restoreAllMocks();
    });

    it('spawns a robot and adds to store', () => {
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots.length).toBe(1);

      const robot = robots[0];
      expect(robot.id).toBeDefined();
      expect(robot.position).toBeDefined();
      // The wandering fields are gone (Phase 43 Task 24); the work loop owns motion.
      expect(robot).not.toHaveProperty('state');
      expect(robot).not.toHaveProperty('destination');
      expect(robot).not.toHaveProperty('direction');
      // `activity` is required (spec §1.2): a lone spawn already has the loop's starting state.
      expect(robot.docking).toBe('active');
      expect(robot.activity).toBe('exiting');
      spawnRobot(DEFAULT_LOCALE_ID, { docking: DockingState.Docked, batteryLevel: 40 });
      expect(useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[1].activity).toBe('charging');
      expect(robot.melody).toBeDefined();
      expect(robot.melody.length).toBeGreaterThan(0);
      expect(robot.audioAttributes).toBeDefined();
      expect(robot.lfoLinks).toBeDefined();
      expect(Object.keys(robot.lfoLinks ?? {}).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());

      // The robot rides along (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5): a rebuild spawns before its locale is current.
      expect(registerSpy).toHaveBeenCalledWith(robot.id, robot.melody, robot);
    });

    // Roadmap 48: both fields were never read (createdAt was stamped "for removal ordering";
    // lastInteractionMeasure lost its only writer in Phase 43), so a spawn stamps neither.
    it('stamps no createdAt or lastInteractionMeasure on a spawned robot', () => {
      spawnRobot(DEFAULT_LOCALE_ID);

      const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
      expect(robot).not.toHaveProperty('createdAt');
      expect(robot).not.toHaveProperty('lastInteractionMeasure');
    });

    // LFO Bank Task 10: seeded robot lane links must reach the bank engine at spawn, not only on
    // a later user edit — same rule as the old primeRobotLfos, now routed through the bank's own
    // roster-priming helper. Only reserveVoice's SUCCESS should prime — a robot with no reserved
    // voice has no live node for the bank to connect to, so priming it would be requesting
    // against nothing.
    it('primes the robot\'s LFO links into the bank engine after a successful reserveVoice', () => {
      vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
      const primeSpy = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});

      spawnRobot(DEFAULT_LOCALE_ID);

      const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
      expect(primeSpy).toHaveBeenCalledTimes(1);
      expect(primeSpy).toHaveBeenCalledWith(expect.objectContaining({ id: robot.id }));
    });

    it('does not prime LFO links when reserveVoice fails (no live voice to connect against)', () => {
      vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(false);
      const primeSpy = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      spawnRobot(DEFAULT_LOCALE_ID);

      expect(primeSpy).not.toHaveBeenCalled();
      // Melody registration must still happen — reservation and melody are independent.
      expect(registerSpy).toHaveBeenCalled();
    });

    it('a priming failure never blocks melody registration', () => {
      vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
      vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {
        throw new Error('boom');
      });
      const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

      expect(() => spawnRobot(DEFAULT_LOCALE_ID)).not.toThrow();
      expect(registerSpy).toHaveBeenCalled();
    });

    it('quantizes masterVolume so its percent (x100) is always an integer, across many spawns (SEEDED_SLIDER_VALUE_QUANTIZATION Task 6)', () => {
      for (let i = 0; i < 30; i++) {
        spawnRobot(DEFAULT_LOCALE_ID);
      }
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots.length).toBeGreaterThan(0);
      for (const robot of robots) {
        expect(Number.isInteger(robot.masterVolume * 100), `robot ${robot.id}: ${robot.masterVolume}`).toBe(true);
      }
    });

    // Robot Pan T1 (docs/specs/ROBOT_PAN.md §1.1): every robot starts on Auto at centre, so an
    // existing world sounds exactly as it did — no noise draw, no change to any other field.
    it('spawns every robot with pan 0 and panAuto true, Active or Docked', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID, { docking: DockingState.Docked, batteryLevel: 40 });
      for (let i = 0; i < 20; i++) spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots).toHaveLength(22);
      for (const robot of robots) {
        expect(robot.pan, `robot ${robot.id}`).toBe(0);
        expect(robot.panAuto, `robot ${robot.id}`).toBe(true);
      }
    });

    // A spawned robot is always Auto (panAuto: true above), so there is nothing to hand to the engine.
    it('never calls updateRobotPan at spawn - every new robot follows its position', () => {
      const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan');

      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID, { docking: DockingState.Docked, batteryLevel: 40 });

      expect(panSpy).not.toHaveBeenCalled();
    });

    // Robot Sends T4 (docs/specs/ROBOT_SENDS.md section 1.4): a new voice starts with both send gains at 0, so the
    // spawn reservation hands the engine the robot's own sends - unconditionally, unlike a manual pan.
    describe('primes the sends at the spawn reservation (Robot Sends T4)', () => {
      it('calls updateRobotSends once with the spawned robot id and the sends it carries in the store', () => {
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        spawnRobot(DEFAULT_LOCALE_ID);

        const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
        expect(sendsSpy).toHaveBeenCalledTimes(1);
        expect(sendsSpy).toHaveBeenCalledWith(robot.id, {
          reverb: robot.reverbSend, delay: robot.delaySend, grit: robot.gritSend, shimmer: robot.shimmerSend, double: robot.doubleSend,
        });
        // Robot Send Table T5 (docs/specs/ROBOT_SEND_TABLE.md §1.1): the prime is robotSendLevels(robot), in table order.
        expect(sendsSpy.mock.calls[0][1]).toEqual(robotSendLevels(robot));
        expect(Object.keys(sendsSpy.mock.calls[0][1])).toEqual(['reverb', 'delay', 'grit', 'shimmer', 'double']);
      });

      it('primes after the reservation, not before - the gains do not exist until reserveVoice builds them', () => {
        const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice');
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        spawnRobot(DEFAULT_LOCALE_ID);

        expect(reserveSpy).toHaveBeenCalledTimes(1);
        expect(reserveSpy.mock.invocationCallOrder[0]).toBeLessThan(sendsSpy.mock.invocationCallOrder[0]);
      });

      it('primes a docked spawn too, one prime per robot', () => {
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID, { docking: DockingState.Docked, batteryLevel: 40 });

        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        expect(robots).toHaveLength(2);
        expect(sendsSpy.mock.calls.map((c) => c[0])).toEqual(robots.map((r) => r.id));
      });

      it('a throwing prime does not stop the spawn: the robot is still in the store with its melody registered', () => {
        vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => { throw new Error('boom'); });
        const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');

        expect(() => spawnRobot(DEFAULT_LOCALE_ID)).not.toThrow();

        expect(useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots).toHaveLength(1);
        expect(registerSpy).toHaveBeenCalledTimes(1);
      });
    });

    it('draws nothing from the noise map for pan (no new getSeededVal key)', () => {
      vi.mocked(getSeededVal).mockClear();
      vi.mocked(getUniformSeededVal).mockClear();

      spawnRobot(DEFAULT_LOCALE_ID);

      // Both seeded draws: the plain one and the even one most audio draws use since Even Seeded Draws.
      const dataIds = [...vi.mocked(getSeededVal).mock.calls, ...vi.mocked(getUniformSeededVal).mock.calls].map((c) => String(c[1]));
      // Sanity: the spy sees the draws spawnRobot does make, so an empty match below means something.
      expect(dataIds).toContain('robot.masterVolume');
      expect(dataIds.filter((id) => /pan/i.test(id))).toEqual([]);
    });

    // Robot Sends T5 (docs/specs/ROBOT_SENDS.md section 1.2): every robot is born with a seeded spread of
    // reverb and delay depth, drawn from the same bands the global rows used to cover.
    describe('seeds the sends (Robot Sends T5)', () => {
      const onGrid = (x: number) => Math.abs(x * 100 - Math.round(x * 100)) < 1e-9;
      const freshLocale = (localeId: string, coordinates?: { x: number; y: number }) =>
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, ...(coordinates ? { coordinates } : {}), robots: [] } },
        }));
      const noiseFor = (localeId: string) => {
        const locale = useLocaleStore.getState().getLocaleById(localeId)!;
        return getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      };

      it('puts every spawned robot inside the send bands - reverb 0.1 to 0.6, delay 0 to 0.3 - on the 0.01 grid, Active or Docked', () => {
        freshLocale('sends-bands-locale');
        for (let i = 0; i < 40; i++) {
          spawnRobot('sends-bands-locale', i % 2 ? { docking: DockingState.Docked, batteryLevel: 40 } : undefined);
        }

        const robots = useLocaleStore.getState().getLocaleById('sends-bands-locale')!.robots;
        expect(robots).toHaveLength(40);
        for (const robot of robots) {
          expect(robot.reverbSend, `robot ${robot.id} reverb`).toBeGreaterThanOrEqual(0.1);
          expect(robot.reverbSend, `robot ${robot.id} reverb`).toBeLessThanOrEqual(0.6);
          expect(onGrid(robot.reverbSend), `robot ${robot.id} reverb ${robot.reverbSend}`).toBe(true);
          expect(robot.delaySend, `robot ${robot.id} delay`).toBeGreaterThanOrEqual(0);
          expect(robot.delaySend, `robot ${robot.id} delay`).toBeLessThanOrEqual(0.3);
          expect(onGrid(robot.delaySend), `robot ${robot.id} delay ${robot.delaySend}`).toBe(true);
        }
      });

      // Robot Effect Sends T7 (spec §1.2): the three effect room sends are seeded at spawn from the same helper (an
      // original's; a company member takes its founder's); at most one lands on a robot.
      it('gives robot N the three effect room sends generateRobotSends draws at offset N, never two on one robot', () => {
        freshLocale('effect-sends-spawn-locale');
        for (let i = 0; i < 60; i++) spawnRobot('effect-sends-spawn-locale');
        const noiseMap = noiseFor('effect-sends-spawn-locale');
        const robots = useLocaleStore.getState().getLocaleById('effect-sends-spawn-locale')!.robots;
        robots.forEach((robot, i) => {
          expect(effectSends(robot), `robot ${i}`).toEqual(effectSends(generateRobotSends(noiseMap, i)));
          expect([robot.gritSend, robot.shimmerSend, robot.doubleSend].filter((s) => s > 0).length, `robot ${i}`).toBeLessThanOrEqual(1);
        });
        expect(robots.some((r) => r.gritSend > 0 || r.shimmerSend > 0 || r.doubleSend > 0)).toBe(true);
      });

      it('spawns the same effect room sends twice for the same locale', () => {
        const coords = { x: 3.25, y: -11.5 };
        freshLocale('effect-sends-det-a', coords);
        freshLocale('effect-sends-det-b', coords);
        for (let i = 0; i < 24; i++) {
          spawnRobot('effect-sends-det-a');
          spawnRobot('effect-sends-det-b');
        }
        const pick = (id: string) => useLocaleStore.getState().getLocaleById(id)!.robots.map(effectSends);
        expect(pick('effect-sends-det-a')).toEqual(pick('effect-sends-det-b'));
      });

      it('equals the baseline for every robot of a real roster, company members included, all five sends', () => {
        freshLocale('effect-sends-baseline-locale');
        spawnInitialRoster('effect-sends-baseline-locale');
        const robots = useLocaleStore.getState().getLocaleById('effect-sends-baseline-locale')!.robots;
        const baselines = generateRobotRosterBaseline(noiseFor('effect-sends-baseline-locale'), robots.length);
        expect(robots.length).toBeGreaterThan(0);
        robots.forEach((robot, i) => {
          expect({ ...reverbAndDelay(baselines[i]), ...effectSends(baselines[i]) }, `robot ${i}`).toEqual({
            ...reverbAndDelay(robot),
            ...effectSends(robot),
          });
        });
      });

      it('with no locale (no noise map) falls back to alea: each effect send 0 or in its band, never two on one robot', () => {
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        for (let i = 0; i < 200; i++) spawnRobot(`effect-sends-no-locale-${i}`);
        const sent = sendsSpy.mock.calls.map((c) => c[1] as Record<'grit' | 'shimmer' | 'double', number>);
        expect(sent).toHaveLength(200);
        const bands = { grit: CLASSIC.gritSend, shimmer: CLASSIC.shimmerSend, double: CLASSIC.doubleSend };
        for (const s of sent) {
          const carried = (['grit', 'shimmer', 'double'] as const).filter((k) => s[k] > 0);
          expect(carried.length).toBeLessThanOrEqual(1);
          for (const k of carried) {
            expect(s[k]).toBeGreaterThanOrEqual(bands[k].min);
            expect(s[k]).toBeLessThanOrEqual(bands[k].max);
            expect(onGrid(s[k])).toBe(true);
          }
        }
        for (const k of ['grit', 'shimmer', 'double'] as const) expect(sent.some((s) => s[k] > 0), k).toBe(true);
      });

      it('gives robot N exactly what generateRobotSends draws at offset N - the stored value is the helper\'s, not a re-roll', () => {
        freshLocale('sends-offset-locale');
        for (let i = 0; i < 6; i++) spawnRobot('sends-offset-locale');

        const noiseMap = noiseFor('sends-offset-locale');
        const robots = useLocaleStore.getState().getLocaleById('sends-offset-locale')!.robots;
        robots.forEach((robot, i) => {
          expect({ reverbSend: robot.reverbSend, delaySend: robot.delaySend }, `robot ${i}`).toEqual(reverbAndDelay(generateRobotSends(noiseMap, i)));
        });
      });

      it('spreads the fleet: the robots do not all share one reverb or one delay depth', () => {
        freshLocale('sends-spread-locale');
        for (let i = 0; i < 30; i++) spawnRobot('sends-spread-locale');

        const robots = useLocaleStore.getState().getLocaleById('sends-spread-locale')!.robots;
        expect(new Set(robots.map((r) => r.reverbSend)).size).toBeGreaterThan(5);
        expect(new Set(robots.map((r) => r.delaySend)).size).toBeGreaterThan(5);
      });

      it('is deterministic: two locales sharing coordinates spawn identical sends', () => {
        const coords = { x: -7.75, y: 2.5 };
        freshLocale('sends-det-a', coords);
        freshLocale('sends-det-b', coords);
        for (let i = 0; i < 5; i++) {
          spawnRobot('sends-det-a');
          spawnRobot('sends-det-b');
        }

        const pick = (id: string) => useLocaleStore.getState().getLocaleById(id)!.robots.map((r) => [r.reverbSend, r.delaySend]);
        expect(pick('sends-det-a')).toEqual(pick('sends-det-b'));
      });

      // Company Families B5 (Task 5): a member takes its founder's five sends as well as its voice, so a section sits in one
      // space. Replaces the copy branch's rule (a copied robot drew its own depths).
      it('a member takes its founder\'s five sends, where an original draws its own at its spawn count', () => {
        freshLocale('sends-member-locale');
        for (let i = 0; i < 6; i++) spawnRobot('sends-member-locale');
        spawnRobot('sends-member-locale', { founderIndex: 2 });

        const noiseMap = noiseFor('sends-member-locale');
        const robots = useLocaleStore.getState().getLocaleById('sends-member-locale')!.robots;
        const member = robots[6];
        expect({ ...reverbAndDelay(member), ...effectSends(member) }).toEqual({ ...reverbAndDelay(robots[2]), ...effectSends(robots[2]) });
        // Not by coincidence: the member's own draw at its spawn count differs from its founder's.
        expect({ ...reverbAndDelay(generateRobotSends(noiseMap, 6)), ...effectSends(generateRobotSends(noiseMap, 6)) })
          .not.toEqual({ ...reverbAndDelay(robots[2]), ...effectSends(robots[2]) });
        robots.slice(0, 6).forEach((robot, i) => {
          expect({ ...reverbAndDelay(robot), ...effectSends(robot) }, `robot ${i}`)
            .toEqual({ ...reverbAndDelay(generateRobotSends(noiseMap, i)), ...effectSends(generateRobotSends(noiseMap, i)) });
        });
      });

      it('adds only the three new dataIds, one draw each, at the spawn count', () => {
        freshLocale('sends-keys-locale');
        vi.mocked(getUniformSeededVal).mockClear();

        spawnRobot('sends-keys-locale');

        // The even draw since Even Seeded Draws T9a; the three effect room sends' keys are filtered out.
        const sendCalls = vi.mocked(getUniformSeededVal).mock.calls.filter((c) => /^robot\.send\.(reverb|delay)/.test(String(c[1])));
        expect(sendCalls.map((c) => c[1]).sort()).toEqual(['robot.send.delay', 'robot.send.delay.quiet', 'robot.send.reverb', 'robot.send.reverb.quiet']);
        expect(sendCalls.every((c) => c[2] === 0)).toBe(true);
      });

      it('with no locale (no noise map) falls back to alea draws inside the same bands, still varied', () => {
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        for (let i = 0; i < 40; i++) spawnRobot(`sends-no-locale-${i}`);

        const sent = sendsSpy.mock.calls.map((c) => c[1] as { reverb: number; delay: number });
        expect(sent).toHaveLength(40);
        for (const { reverb, delay } of sent) {
          expect(reverb).toBeGreaterThanOrEqual(0.1);
          expect(reverb).toBeLessThanOrEqual(0.6);
          expect(onGrid(reverb)).toBe(true);
          expect(delay).toBeGreaterThanOrEqual(0);
          expect(delay).toBeLessThanOrEqual(0.3);
          expect(onGrid(delay)).toBe(true);
        }
        expect(new Set(sent.map((s) => s.reverb)).size).toBeGreaterThan(5);
        expect(sent.some((s) => s.delay === 0)).toBe(true);
      });

      it('primes the engine with the seeded values - the stored sends, not a placeholder', () => {
        freshLocale('sends-prime-locale');
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        spawnRobot('sends-prime-locale');

        const robot = useLocaleStore.getState().getLocaleById('sends-prime-locale')!.robots[0];
        expect(robot.reverbSend).toBeGreaterThan(0); // reverb band starts at 0.1: a placeholder 0 cannot pass
        expect(sendsSpy).toHaveBeenCalledWith(robot.id, {
          reverb: robot.reverbSend, delay: robot.delaySend, grit: robot.gritSend, shimmer: robot.shimmerSend, double: robot.doubleSend,
        });
      });
    });

    it('spawns robots with the new percentage/toggle melody shapes', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      const robot = (useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [])[0];

      expect(typeof robot.rhythmicDensity).toBe('number');
      expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(0);
      expect(robot.rhythmicDensity).toBeLessThanOrEqual(100);

      expect(robot.rhythmicMotifLength).toEqual(
        expect.objectContaining({ active: expect.any(Boolean), value: expect.any(Number) })
      );
      expect(robot.rhythmicMotifLength!.value).toBeGreaterThanOrEqual(0);
      expect(robot.rhythmicMotifLength!.value).toBeLessThanOrEqual(8);
      expect(robot.rhythmicMotifLength!.active).toBe(robot.rhythmicMotifLength!.value > 0);

      expect(robot.noteVariance).toEqual(
        expect.objectContaining({ active: expect.any(Boolean), value: expect.any(Number) })
      );
      expect(robot.noteVariance!.value).toBeGreaterThanOrEqual(0);
      expect(robot.noteVariance!.value).toBeLessThanOrEqual(8);
      expect(robot.noteVariance!.active).toBe(robot.noteVariance!.value > 0);

      expect(typeof robot.pitchRepeat).toBe('number');
      expect(robot.pitchRepeat).toBeGreaterThanOrEqual(0);
      expect(robot.pitchRepeat).toBeLessThanOrEqual(100);
    });

    it('seeds rhythmicMotifLength.active at roughly an 85% chance across many spawns', () => {
      // A dedicated locale ID, not DEFAULT_LOCALE_ID: spawnCounters is keyed
      // per-locale, so this test's result is independent of how many times
      // earlier tests in this file already called spawnRobot(DEFAULT_LOCALE_ID)
      // -- otherwise this deterministic seeded roll depends on execution order.
      const localeId = 'motif-active-stat-test-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      const n = 500;
      for (let i = 0; i < n; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const activeCount = robots.filter((r) => r.rhythmicMotifLength?.active).length;
      const activeFraction = activeCount / robots.length;
      // ~30% of spawns copy an existing robot's setting rather than rolling fresh,
      // which adds clustering variance but doesn't bias the marginal proportion —
      // generous band to avoid flakiness while still discriminating from the old
      // ~66% (shared with noteVariance) threshold.
      expect(activeFraction).toBeGreaterThanOrEqual(0.75);
      expect(activeFraction).toBeLessThanOrEqual(0.95);
    });

    it('reaches rhythmicMotifLength.value: 0 (the off state) through the single consolidated draw', () => {
      // Old two-draw implementation could never produce value: 0 at all (the value draw was
      // seeded 1-9, floored, min 8) -- this is only reachable once active/value collapse to one
      // draw where the off branch sets value itself to 0, not just active: false.
      const localeId = 'motif-off-value-reachable-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      for (let i = 0; i < 500; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const offRobots = robots.filter((r) => r.rhythmicMotifLength?.value === 0);
      expect(offRobots.length).toBeGreaterThan(0);
      // Every off robot's active must agree -- no drawn-independently active field left behind.
      for (const r of offRobots) expect(r.rhythmicMotifLength!.active).toBe(false);
    });

    it('seeds noteVariance.active at roughly an 85% chance across many spawns', () => {
      // Dedicated locale ID -- see the rhythmicMotifLength.active test above
      // for why (spawnCounters is keyed per-locale; this avoids execution-order
      // sensitivity in this deterministic seeded roll).
      const localeId = 'note-variance-active-stat-test-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      const n = 500;
      for (let i = 0; i < n; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const activeCount = robots.filter((r) => r.noteVariance?.active).length;
      const activeFraction = activeCount / robots.length;
      // Same generous band and copy-clustering rationale as the motif-length
      // version of this test above.
      expect(activeFraction).toBeGreaterThanOrEqual(0.75);
      expect(activeFraction).toBeLessThanOrEqual(0.95);
    });

    it('reaches noteVariance.value: 0 (the off state) through the single consolidated draw', () => {
      const localeId = 'note-variance-off-value-reachable-locale';
      useLocaleStore.setState((state) => ({
        locales: {
          ...state.locales,
          [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] },
        },
      }));
      for (let i = 0; i < 500; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
      const offRobots = robots.filter((r) => r.noteVariance?.value === 0);
      expect(offRobots.length).toBeGreaterThan(0);
      for (const r of offRobots) expect(r.noteVariance!.active).toBe(false);
    });

    // Company Families Task 5: the copy roll is gone; a company member inherits from its founder (spawnRobot's founderIndex).
    it('a member inherits its founder\'s rhythmicDensity/rhythmicMotifLength/noteVariance/pitchRepeat rather than rolling fresh ones', () => {
      const localeId = 'member-melody-fields-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
      }));
      for (let i = 0; i < 4; i++) spawnRobot(localeId);
      spawnRobot(localeId, { founderIndex: 1 });
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      const [founder, member] = [robots[1], robots[4]];
      expect(member.rhythmicDensity).toBe(founder.rhythmicDensity);
      expect(member.rhythmicMotifLength).toBe(founder.rhythmicMotifLength);
      expect(member.noteVariance).toBe(founder.noteVariance);
      expect(member.pitchRepeat).toBe(founder.pitchRepeat);
      // Not by coincidence: the originals around the founder differ from it somewhere in these four fields.
      const fieldsOf = (r: Robot) => JSON.stringify([r.rhythmicDensity, r.rhythmicMotifLength, r.noteVariance, r.pitchRepeat]);
      expect([robots[0], robots[2], robots[3]].some((r) => fieldsOf(r) !== fieldsOf(founder))).toBe(true);
    });

    describe('lfoLinks at spawn (LFO Bank Task 9)', () => {
      it('gives a spawned robot lfoLinks for all 6 RobotLfoTargetId values, no extras', () => {
        spawnRobot(DEFAULT_LOCALE_ID);
        const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];

        expect(robot.lfoLinks).toBeDefined();
        expect(Object.keys(robot.lfoLinks ?? {}).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());
      });

      it('tallies the already-spawned roster\'s picked lanes before seeding the next robot\'s own links (spec §1.3 roster-aware tally)', async () => {
        // A dedicated locale ID, not DEFAULT_LOCALE_ID: spawnCounters is keyed per-locale and
        // never reset between tests in this file (see the rhythmicMotifLength.active test's own
        // comment above for the same reasoning) — a fresh key guarantees this robot's spawnCount
        // (and therefore its generateRobotLfoLinks offset) starts at 0, matching the offset this
        // test computes its own expectation against.
        const localeId = 'lfo-link-tally-test-locale';
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
        }));

        // A robot spawned alone is an original (no founder), so each draws fresh links through the tally.
        spawnRobot(localeId);
        spawnRobot(localeId);
        const firstTwo = useLocaleStore.getState().getLocaleById(localeId)!.robots;
        expect(firstTwo).toHaveLength(2);

        spawnRobot(localeId);
        const third = useLocaleStore.getState().getLocaleById(localeId)!.robots[2];

        const locale = useLocaleStore.getState().getLocaleById(localeId)!;
        const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
        const priorLaneCounts = tallyLanes(firstTwo.flatMap((r) => Object.values(r.lfoLinks ?? {})));
        const expectedLinks = generateRobotLfoLinks(noiseMap, 2, priorLaneCounts);

        expect(third.lfoLinks).toEqual(expectedLinks);
      });

      it('a member inherits its founder\'s lfoLinks reference rather than generating fresh ones', () => {
        const localeId = 'member-lfo-links-locale';
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
        }));
        spawnRobot(localeId);
        spawnRobot(localeId);
        spawnRobot(localeId, { founderIndex: 0 });
        const [founder, other, member] = useLocaleStore.getState().getLocaleById(localeId)!.robots;
        expect(member.lfoLinks).toBe(founder.lfoLinks);
        expect(other.lfoLinks).not.toBe(founder.lfoLinks);
      });

      it('a member of a founder without lfoLinks (undefined — a pre-Task-9 robot) generates fresh links instead of inheriting undefined', () => {
        spawnRobot(DEFAULT_LOCALE_ID);
        const legacySource = { ...useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0] } as Partial<Robot>;
        delete legacySource.lfoLinks;
        useLocaleStore.setState((state) => ({
          locales: {
            ...state.locales,
            [DEFAULT_LOCALE_ID]: { ...state.locales[DEFAULT_LOCALE_ID], robots: [legacySource as Robot] },
          },
        }));

        spawnRobot(DEFAULT_LOCALE_ID, { founderIndex: 0 });
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        expect(robots).toHaveLength(2);
        const member = robots[1];

        expect(member.lineage).toEqual({ founderIndex: 0 });
        expect(member.lfoLinks).toBeDefined();
        expect(Object.keys(member.lfoLinks ?? {}).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());
      });
    });

    it('spawns multiple robots with unique IDs', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const ids = new Set(robots.map((r) => r.id));

      expect(robots.length).toBe(3);
      expect(ids.size).toBe(3); // All unique
    });

    it('generates robots with different attributes', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];

      // Positions should differ (ensures different robots)
      const positions = robots.map((r) => `${r.position.x},${r.position.y}`);
      const uniquePositions = new Set(positions);

      expect(uniquePositions.size).toBeGreaterThan(1); // Different positions
    });

  });

  describe('spawnRobot — deterministic robot IDs', () => {
    beforeEach(() => {
      vi.resetModules();
      vi.clearAllMocks();
    });

    it('robot.id is not a crypto.randomUUID-shaped string', () => {
      // melodyGenerator.ts still legitimately calls crypto.randomUUID() for each
      // melody EVENT's own id — unrelated and untouched by this task. This test
      // checks the ROBOT id's own shape, not whether randomUUID is called at all.
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      spawnRobot(DEFAULT_LOCALE_ID);
      const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots[0];
      const uuidShape = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(robot?.id).toBeDefined();
      expect(uuidShape.test(robot!.id)).toBe(false);
    });

    it('spawning against the same locale coordinates twice (fresh module state each time) produces identical ID sequences', async () => {
      // Simulates a reload/shared-link replay: a brand-new module instance
      // (spawnCounters reset to empty) spawning against the same coordinates
      // must reproduce the exact same ID sequence, since Session Storage
      // (Phase 20) needs to reapply overrides by ID after the roster
      // regenerates. Reuses the same vi.resetModules() pattern the
      // "spawnInitialRoster" determinism test below uses, rather than
      // reaching into spawnSystem's private per-locale counter.
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      const idsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.id);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      const idsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.id);

      expect(idsRun1).toHaveLength(2);
      expect(idsRun2).toEqual(idsRun1);
    });

    it('two different locale IDs sharing the same coordinates produce identical ID sequences', () => {
      // Robot ID depends on (coordinates, spawnCount) alone, never on localeId
      // itself — matching the same coordinates-are-the-seed guarantee
      // LOCALE_SEED_DECOUPLING.md established for every other locale-derived value.
      const coords = { x: 5.5, y: -3.25 };
      useLocaleStore.setState({
        locales: {
          'locale-id-test-a': { ...DEFAULT_LOCALE, id: 'locale-id-test-a', coordinates: coords, robots: [] },
          'locale-id-test-b': { ...DEFAULT_LOCALE, id: 'locale-id-test-b', coordinates: coords, robots: [] },
        },
      });

      spawnRobot('locale-id-test-a');
      spawnRobot('locale-id-test-a');
      spawnRobot('locale-id-test-b');
      spawnRobot('locale-id-test-b');

      const idsA = (useLocaleStore.getState().getLocaleById('locale-id-test-a')?.robots ?? []).map((r) => r.id);
      const idsB = (useLocaleStore.getState().getLocaleById('locale-id-test-b')?.robots ?? []).map((r) => r.id);
      expect(idsA).toEqual(idsB);
    });
  });

  describe('spawnRobot — compositionSeed (Deterministic Robot Melody Generation, Task 1)', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      vi.clearAllMocks();
    });

    it('robot.compositionSeed is a number in [0, 1)', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots[0];
      expect(typeof robot?.compositionSeed).toBe('number');
      expect(robot!.compositionSeed).toBeGreaterThanOrEqual(0);
      expect(robot!.compositionSeed).toBeLessThan(1);
    });

    it('two robots spawned at different spawnCount get different compositionSeed values', () => {
      for (let i = 0; i < 5; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const seeds = new Set(robots.map((r) => r.compositionSeed));
      // Own dataId/own offset per robot -- collisions across 5 spawns would indicate
      // compositionSeed isn't actually keyed off spawnCount.
      expect(seeds.size).toBe(robots.length);
    });

    it('spawning against the same locale coordinates twice (fresh module state each time) produces identical compositionSeed sequences', async () => {
      // Mirrors the "deterministic robot IDs" test above exactly -- same rationale:
      // a reload/shared-link replay must reproduce the exact same compositionSeed
      // sequence, since it's drawn from the noise map like every other seeded field.
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      const seedsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.compositionSeed);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      const seedsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.compositionSeed);

      expect(seedsRun1).toHaveLength(2);
      expect(seedsRun2).toEqual(seedsRun1);
    });

    it('a company member gets its own compositionSeed, never its founder\'s', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID, { founderIndex: 0 });
      const [founder, member] = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
      expect(member.lfoLinks).toBe(founder.lfoLinks); // precondition: a member, inheriting by reference
      expect(member.compositionSeed).not.toBe(founder.compositionSeed);
    });
  });

  describe('spawnRobot — initial melody via buildSeededComposition (Deterministic Robot Melody Generation, Task 3)', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    // Each MelodyEvent's own `id` is a fresh crypto.randomUUID(), by design (melodyGenerator.ts
    // doesn't seed it) -- strip it before comparing, or every determinism assertion below would
    // spuriously fail regardless of whether the actual musical content is deterministic.
    function stripEventIds(melody: Robot['melody']): Omit<Robot['melody'][number], 'id'>[] {
      return melody.map(({ id: _id, ...rest }) => rest);
    }

    it('the spawned melody is exactly what buildSeededComposition(compositionSeed, initial attrs) would produce -- not the old melody.rand/melodyCallIndex mechanism', () => {
      // The discriminating test for this task: the old mechanism (getSeededVal('melody.rand',
      // spawnCount * 100 + callIndex++)) is ALSO deterministic, so "same coords twice -> same
      // melody" alone doesn't prove buildSeededComposition is what's actually driving spawn-time
      // generation. Rebuilding the melody independently, from only the robot's own stored fields
      // (compositionSeed + its initial attributes) via buildSeededComposition, and requiring an
      // exact match, is what actually pins the mechanism down.
      spawnRobot(DEFAULT_LOCALE_ID);
      const robot = (useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [])[0]!;
      const rand = buildSeededComposition(robot.compositionSeed, {
        rhythmicDensity: robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
        rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
        noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
        pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
        octaveRange: robot.octaveRange,
      });
      // Robot Performance T4 (docs/specs/ROBOT_PERFORMANCE.md section 1.2): the spawn melody is that
      // melody with the Rests / Accents post-pass applied from the robot's own two fields.
      // Company Families Task 3a: onsets, lengths and stamps from the streams on the world's coordinates and the
      // rhythm shape.
      const { x, y } = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.coordinates;
      const rhythm = {
        rhythmicDensity: robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
        rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
      };
      const expectedMelody = applyPerformanceMarks(
        generateMelodyForRobot({
          octaveMin: robot.octaveRange[0],
          octaveMax: robot.octaveRange[1],
          rhythmicDensity: robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
          rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
          noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
          pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
          rand,
          rhythmRand: buildSeededRhythm(`${x}:${y}`, rhythm),
        }),
        { rests: robot.rests ?? DEFAULT_RESTS, accents: robot.accents ?? DEFAULT_ACCENTS },
        buildSeededPerformance(`${x}:${y}`, rhythm),
      );
      expect(stripEventIds(robot.melody)).toEqual(stripEventIds(expectedMelody));
    });

    it('spawning against the same locale coordinates twice (fresh module state each time) produces identical initial melodies', async () => {
      // Regression guard replacing the retired 'melody.rand'/melodyCallIndex coverage --
      // same rationale/pattern as the compositionSeed and robot-ID determinism tests above.
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnRobot(attenuationStyle1.DEFAULT_LOCALE_ID);
      const melodiesRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.melody);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnRobot(attenuationStyle2.DEFAULT_LOCALE_ID);
      const melodiesRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.melody);

      expect(melodiesRun1).toHaveLength(2);
      expect(melodiesRun1.every((m) => m.length > 0)).toBe(true);
      expect(melodiesRun2.map(stripEventIds)).toEqual(melodiesRun1.map(stripEventIds));
    });

    it('two robots with different compositionSeed (and otherwise-default attributes) get different melodies', () => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      for (let i = 0; i < 5; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const melodyStrings = robots.map((r) => JSON.stringify(r.melody));
      // Not a strict uniqueness requirement (rhythmicDensity etc. also vary per robot and could
      // coincidentally collide), but at least one pair spawned back-to-back should differ --
      // otherwise every robot would be drawing from a shared, non-per-robot rand stream.
      expect(new Set(melodyStrings).size).toBeGreaterThan(1);
    });

    it('unification guard: regenerateMelody, called on a freshly spawned robot with zero attribute changes, reproduces the exact spawn-time melody -- no first-edit ratchet (Task 4 capstone)', async () => {
      // The core acceptance criterion for unifying spawn-time and edit-time generation
      // (docs/specs/DETERMINISTIC_ROBOT_MELODY_GENERATION.md §1): before Tasks 3+4, this would
      // fail, because spawnRobot used melody.rand/melodyCallIndex while regenerateMelody fell
      // back to Math.random() -- two different mechanisms, so even a zero-change "edit" would
      // silently produce a different melody than the one the robot was spawned with.
      const { regenerateMelody } = await import('../engine/regenerateMelody');
      spawnRobot(DEFAULT_LOCALE_ID);
      const spawned = (useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [])[0]!;
      const spawnMelody = spawned.melody;

      regenerateMelody(spawned, DEFAULT_LOCALE_ID);
      const afterRegenerate = (useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [])[0]!;

      expect(stripEventIds(afterRegenerate.melody)).toEqual(stripEventIds(spawnMelody));
    });
  });

  describe('spawnRobot — docking/battery options', () => {
    // Each test gets its own locale id + coordinates (never DEFAULT_LOCALE_ID),
    // matching this file's existing "*-stat-test-locale" pattern — spawnCounters
    // and robot-ID noise sampling are both keyed by locale, so a dedicated
    // locale per test guarantees no shared counter/ID state leaks in from
    // whatever order the rest of this file's many DEFAULT_LOCALE_ID spawns run in.
    function freshLocale(id: string, x: number, y: number) {
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [id]: { ...DEFAULT_LOCALE, id, coordinates: { x, y }, robots: [] } },
      }));
    }

    it('defaults to Active/100 when no options are passed', () => {
      const localeId = 'docking-opts-defaults';
      freshLocale(localeId, 101, 201);
      spawnRobot(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.docking).toBe(DockingState.Active);
      expect(robot?.batteryLevel).toBe(100);
    });

    it('respects explicit docking/batteryLevel options', () => {
      const localeId = 'docking-opts-explicit';
      freshLocale(localeId, 102, 202);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 37 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.docking).toBe(DockingState.Docked);
      expect(robot?.batteryLevel).toBe(37);
    });

    it('reserves a voice and registers the melody regardless of docking state — mute is via audioMode, not absent registration', () => {
      const localeId = 'docking-opts-active-voice';
      freshLocale(localeId, 103, 203);
      spawnRobot(localeId, { docking: DockingState.Active, batteryLevel: 100 });
      const activeRobot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(AudioEngine.getVoiceForRobot(activeRobot!.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(activeRobot!.id).length).toBeGreaterThan(0);
    });

    it('still reserves a voice and registers the melody when created Docked', () => {
      const localeId = 'docking-opts-docked-still-voice';
      freshLocale(localeId, 104, 204);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 50 });
      const dockedRobot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(AudioEngine.getVoiceForRobot(dockedRobot!.id)).not.toBeNull();
      expect(AudioEngine.getRegisteredMelody(dockedRobot!.id).length).toBeGreaterThan(0);
    });

    it('sets audioMode to none when created Active', () => {
      const localeId = 'docking-opts-active-audiomode';
      freshLocale(localeId, 106, 206);
      spawnRobot(localeId, { docking: DockingState.Active, batteryLevel: 100 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.audioMode).toBe('none');
    });

    // The Docked state itself mutes the robot (robotAudibility.isDockMuted); audioMode is the user's (Crawford, 2026-11-11).
    it('sets audioMode to none when created Docked too — the dock mutes it, not the toggle Robot Options exposes', () => {
      const localeId = 'docking-opts-docked-audiomode';
      freshLocale(localeId, 107, 207);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 50 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.audioMode).toBe('none');
    });

    it('no longer sets a persists field', () => {
      const localeId = 'docking-opts-no-persists';
      freshLocale(localeId, 105, 205);
      spawnRobot(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect((robot as unknown as { persists?: unknown }).persists).toBeUndefined();
    });
  });

  describe('reRegisterAllRobotsAudio (LFO Load Fix Task 7)', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('primes the whole roster\'s LFO links exactly once, via primeRosterLinks, after every robot has been re-reserved', () => {
      vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
      const releaseSpy = vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
      const primeRosterSpy = vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);
      primeRosterSpy.mockClear();
      releaseSpy.mockClear();

      reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
      expect(robots).toHaveLength(2);
      // Called once with the full roster -- not once per robot -- so a single pass covers
      // everyone, not a per-robot prime.
      expect(primeRosterSpy).toHaveBeenCalledTimes(1);
      expect(primeRosterSpy).toHaveBeenCalledWith(expect.arrayContaining([
        expect.objectContaining({ id: robots[0].id }),
        expect.objectContaining({ id: robots[1].id }),
      ]));
    });

    it('calls primeRosterLinks after every reserveVoice call, not interleaved per-robot', () => {
      vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
      vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID);
      const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice');
      reserveSpy.mockClear();
      const callOrder: string[] = [];
      reserveSpy.mockImplementation(() => { callOrder.push('reserve'); return true; });
      vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => { callOrder.push('prime'); });

      reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

      expect(callOrder).toEqual(['reserve', 'reserve', 'prime']);
    });

    it('an empty roster calls primeRosterLinks with an empty array, never throws', () => {
      const primeRosterSpy = vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
      expect(() => reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID)).not.toThrow();
      expect(primeRosterSpy).toHaveBeenCalledWith([]);
    });

    // Robot Pan T4 (docs/specs/ROBOT_PAN.md section 1.3): the engine forgets a robot's pan when its
    // voice is released, and this pass releases every voice - so a manual robot is handed back from the store.
    describe('re-primes a manual pan (Robot Pan T4)', () => {
      const setManual = (robotId: string, pan: number) =>
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robotId, { panAuto: false, pan });

      it('calls updateRobotPan once, with the stored pan, for the one manual robot only', () => {
        vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        setManual(robots[1].id, 0.6);
        const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(panSpy.mock.calls).toEqual([[robots[1].id, 0.6]]);
      });

      it('primes after that robot is reserved, not before - the release has already cleared the engine', () => {
        const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        spawnRobot(DEFAULT_LOCALE_ID);
        const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
        setManual(robot.id, -1);
        const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});
        reserveSpy.mockClear();

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(panSpy).toHaveBeenCalledWith(robot.id, -1);
        expect(reserveSpy.mock.invocationCallOrder[0]).toBeLessThan(panSpy.mock.invocationCallOrder[0]);
      });

      it('never calls updateRobotPan when every robot is on Auto, even one carrying a stale pan', () => {
        vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robots[0].id, { pan: 0.9 }); // Auto still true
        const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(panSpy).not.toHaveBeenCalled();
      });

      it('does not prime a manual robot that has no layers to reserve', () => {
        vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        spawnRobot(DEFAULT_LOCALE_ID);
        const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robot.id, {
          panAuto: false,
          pan: 0.6,
          audioAttributes: { ...robot.audioAttributes, layers: [] },
        });
        const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {});

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(panSpy).not.toHaveBeenCalled();
      });

      it('a throwing prime on one robot neither stops the pass nor skips the next robot', () => {
        vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        const primeRosterSpy = vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        setManual(robots[0].id, 0.6);
        setManual(robots[1].id, -0.2);
        const panSpy = vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementationOnce(() => { throw new Error('boom'); });
        panSpy.mockImplementation(() => {});
        const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');
        registerSpy.mockClear();

        expect(() => reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID)).not.toThrow();

        expect(panSpy.mock.calls).toEqual([[robots[0].id, 0.6], [robots[1].id, -0.2]]);
        // Melody registration is independent of the prime failing, and the roster pass still ran.
        expect(registerSpy).toHaveBeenCalledTimes(2);
        expect(primeRosterSpy).toHaveBeenCalledTimes(1);
      });
    });

    // Robot Sends T4 (docs/specs/ROBOT_SENDS.md section 1.4): this pass releases every voice, and a rebuilt voice
    // starts with both send gains at 0 - so every robot is handed its stored sends back, 0/0 included.
    describe('re-primes the sends (Robot Sends T4)', () => {
      const stubEngine = () => {
        const reserveSpy = vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true);
        vi.spyOn(AudioEngine, 'releaseVoice').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRosterLinks').mockImplementation(() => {});
        vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        return reserveSpy;
      };
      // Robot Effect Sends T6: the three effect room sends are re-primed too, with values no robot seeds by default.
      const setSends = (robotId: string, reverbSend: number, delaySend: number, gritSend = 0, shimmerSend = 0, doubleSend = 0) =>
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robotId, { reverbSend, delaySend, gritSend, shimmerSend, doubleSend });

      it('calls updateRobotSends once per robot, each with its own stored five sends - an all-0 robot included', () => {
        stubEngine();
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        setSends(robots[0].id, 0.3, 0.1, 0.55);
        setSends(robots[1].id, 0, 0);
        setSends(robots[2].id, 1, 0.45, 0, 0.35, 0.42);
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(sendsSpy.mock.calls).toEqual([
          [robots[0].id, { reverb: 0.3, delay: 0.1, grit: 0.55, shimmer: 0, double: 0 }],
          [robots[1].id, { reverb: 0, delay: 0, grit: 0, shimmer: 0, double: 0 }],
          [robots[2].id, { reverb: 1, delay: 0.45, grit: 0, shimmer: 0.35, double: 0.42 }],
        ]);
        // Robot Send Table T5: each is robotSendLevels of the stored robot, keys in table order.
        const stored = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        expect(sendsSpy.mock.calls.map((c) => c[1])).toEqual(stored.map(robotSendLevels));
        expect(sendsSpy.mock.calls.map((c) => JSON.stringify(c[1]))[2]).toBe('{"reverb":1,"delay":0.45,"grit":0,"shimmer":0.35,"double":0.42}');
      });

      it('primes each robot after that robot is reserved, not before - the release has already cleared the engine', () => {
        const reserveSpy = stubEngine();
        spawnRobot(DEFAULT_LOCALE_ID);
        const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
        setSends(robot.id, 0.3, 0.1);
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        reserveSpy.mockClear();

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(reserveSpy.mock.invocationCallOrder[0]).toBeLessThan(sendsSpy.mock.invocationCallOrder[0]);
      });

      it('does not prime a robot that has no layers to reserve', () => {
        stubEngine();
        spawnRobot(DEFAULT_LOCALE_ID);
        const robot = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0];
        useLocaleStore.getState().updateRobot(DEFAULT_LOCALE_ID, robot.id, {
          reverbSend: 0.3,
          delaySend: 0.1,
          audioAttributes: { ...robot.audioAttributes, layers: [] },
        });
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(sendsSpy).not.toHaveBeenCalled();
      });

      it('an empty roster primes nothing', () => {
        stubEngine();
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

        reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID);

        expect(sendsSpy).not.toHaveBeenCalled();
      });

      it('a throwing prime on one robot neither stops the pass nor skips the next robot', () => {
        stubEngine();
        spawnRobot(DEFAULT_LOCALE_ID);
        spawnRobot(DEFAULT_LOCALE_ID);
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
        setSends(robots[0].id, 0.3, 0.1);
        setSends(robots[1].id, 0.05, 0.6);
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementationOnce(() => { throw new Error('boom'); });
        sendsSpy.mockImplementation(() => {});
        const registerSpy = vi.spyOn(AudioEngine, 'registerRobotMelody');
        registerSpy.mockClear();

        expect(() => reRegisterAllRobotsAudio(DEFAULT_LOCALE_ID)).not.toThrow();

        expect(sendsSpy.mock.calls).toEqual([
          [robots[0].id, { reverb: 0.3, delay: 0.1, grit: 0, shimmer: 0, double: 0 }],
          [robots[1].id, { reverb: 0.05, delay: 0.6, grit: 0, shimmer: 0, double: 0 }],
        ]);
        expect(registerSpy).toHaveBeenCalledTimes(2);
      });
    });

  });

  describe('spawnInitialRoster', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it(`creates exactly ${MAX_ROBOTS} robots`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots).toHaveLength(MAX_ROBOTS);
    });

    it(`seeds the Active count within [${INITIAL_ACTIVE_ROBOTS_MIN}, ${INITIAL_ACTIVE_ROBOTS_MAX}]`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const activeCount = robots.filter((r) => r.docking === DockingState.Active).length;
      expect(activeCount).toBeGreaterThanOrEqual(INITIAL_ACTIVE_ROBOTS_MIN);
      expect(activeCount).toBeLessThanOrEqual(INITIAL_ACTIVE_ROBOTS_MAX);
      expect(robots.filter((r) => r.docking === DockingState.Docked)).toHaveLength(MAX_ROBOTS - activeCount);
    });

    it('does not assign a job to any robot — that is worldTransition.ts\'s job, not spawnInitialRoster\'s', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots.every((r) => r.job === undefined)).toBe(true);
    });

    it('seeds varied (not uniform) starting battery levels for Docked robots', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const dockedLevels = robots.filter((r) => r.docking === DockingState.Docked).map((r) => r.batteryLevel);
      expect(new Set(dockedLevels).size).toBeGreaterThan(1);
      dockedLevels.forEach((level) => {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThan(100);
      });
    });

    it('Active robots start at full battery', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.filter((r) => r.docking === DockingState.Active).forEach((r) => {
        expect(r.batteryLevel).toBe(100);
      });
    });

    it('every robot has a reserved voice and registered melody, and starts with audioMode none whatever its docking', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.forEach((r) => {
        expect(AudioEngine.getVoiceForRobot(r.id)).not.toBeNull();
        expect(AudioEngine.getRegisteredMelody(r.id).length).toBeGreaterThan(0);
        expect(r.audioMode).toBe('none');
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same active/docked split', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      const dockingRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.docking);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      const dockingRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.docking);

      expect(dockingRun2).toEqual(dockingRun1);
    });

    // Roadmap Phase 14 (docs/specs/archive/COLOR_SCHEME_TRAIT_THEMING.md §1.4) — each robot's own seeded
    // UI-chrome identity color, generated the same way generateRobotName already is.
    it('gives every robot an identityColor from ROBOT_IDENTITY_COLOR_NAMES\' resolved hex set', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const validColors = ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name]);
      robots.forEach((r) => {
        expect(validColors).toContain(r.identityColor);
      });
    });

    it('never assigns black, white, or darkGray as a robot\'s identityColor', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.forEach((r) => {
        expect(r.identityColor).not.toBe(ACCENT_COLORS.black);
        expect(r.identityColor).not.toBe(ACCENT_COLORS.white);
        expect(r.identityColor).not.toBe(ACCENT_COLORS.darkGray);
      });
    });

    it('does not collapse every robot to the same identityColor', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const distinctColors = new Set(robots.map((r) => r.identityColor));
      expect(distinctColors.size).toBeGreaterThan(1);
    });

    it('is deterministic — spawning against the same coordinates reproduces the same identityColor per robot', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      const colorsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.identityColor);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      const colorsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.identityColor);

      expect(colorsRun2).toEqual(colorsRun1);
    });
  });

  describe('spawnInitialRoster — stations (Phase 43 Task 21, spec §1.6)', () => {
    const roster = () => useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];

    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it('assigns every robot a station by roster index modulo station count, within capacity', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const stations = getStations(DEFAULT_LOCALE_ID);
      expect(stations.length).toBeGreaterThanOrEqual(2);
      const robots = roster();
      robots.forEach((r, i) => expect(r.stationId, r.id).toBe(stations[i % stations.length].id));
      for (const s of stations) {
        expect(robots.filter((r) => r.stationId === s.id).length).toBeLessThanOrEqual(s.capacity);
      }
    });

    it("puts every robot's centre on its station's port", () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const byId = new Map(getStations(DEFAULT_LOCALE_ID).map((s) => [s.id, s]));
      for (const r of roster()) {
        const gem = getRobotGem(r.gemSeed);
        expect(r.position, r.id).toEqual(positionForCentre(byId.get(r.stationId!)!.port, gem));
        expect(robotCentre(r, gem)).toEqual(byId.get(r.stationId!)!.port);
      }
    });

    it("Docked robots start 'charging', Active robots 'exiting' (correction 2); nobody holds a site", () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = roster();
      // The seeded split must include both, or this test proves only one branch.
      expect(robots.some((r) => r.docking === DockingState.Docked)).toBe(true);
      expect(robots.some((r) => r.docking === DockingState.Active)).toBe(true);
      for (const r of robots) {
        expect(r.activity, r.id).toBe(r.docking === DockingState.Docked ? 'charging' : 'exiting');
        expect(r.siteId).toBeUndefined();
      }
    });

    it('uses the port, not the centre, when the two differ', () => {
      // Real stations have port === center (spec §1.6, still open in the sketch), so only a
      // distinguishing fixture proves which one spawn reads.
      const stations: Station[] = [
        { id: 'station-0', center: { x: 500, y: 300 }, port: { x: 520, y: 340 }, capacity: 6, gemSeed: 1 },
        { id: 'station-1', center: { x: 1200, y: 400 }, port: { x: 1180, y: 430 }, capacity: 6, gemSeed: 2 },
      ];
      vi.mocked(getStations).mockReturnValueOnce(stations);
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      roster().forEach((r, i) => expect(robotCentre(r, getRobotGem(r.gemSeed))).toEqual(stations[i % 2].port));
    });

    it('refuses to overfill: a roster that cannot fit throws (assignStationsAtLoad), never stacks a seventh robot', () => {
      vi.mocked(getStations).mockReturnValueOnce([
        { id: 'station-0', center: { x: 500, y: 300 }, port: { x: 500, y: 300 }, capacity: 6, gemSeed: 1 },
      ]);
      expect(() => spawnInitialRoster(DEFAULT_LOCALE_ID)).toThrow(/do not fit/);
    });

    it('the initial Docked count lights exactly that many slots across the stations', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = roster();
      const lit = getStations(DEFAULT_LOCALE_ID).reduce((n, s) => n + parseColorsKey(chargingColorsKey(robots, s.id)).length, 0);
      expect(lit).toBe(robots.filter((r) => r.docking === DockingState.Docked).length);
    });

    it('writes the roster in one store update after the last spawn, not one per robot', () => {
      let writes = 0;
      const unsubscribe = useLocaleStore.subscribe(() => { writes++; });
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      unsubscribe();
      // One addRobot per robot, then exactly one station write for the whole roster.
      expect(writes).toBe(MAX_ROBOTS + 1);
    });

    it('the new fields survive a JSON round trip unchanged', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      // Only the fields this task writes: an unrelated `audioAttributes.detune` can be -0, which
      // JSON turns into 0 (toEqual tells them apart).
      const fields = roster().map((r) => ({ stationId: r.stationId, activity: r.activity, position: r.position }));
      expect(JSON.parse(JSON.stringify(fields))).toEqual(fields);
    });

    it('is deterministic — same coordinates, same stations, positions and activities', async () => {
      const snapshot = async () => {
        vi.resetModules();
        const spawn = await import('./spawnSystem');
        const store = await import('../stores/localeStore');
        const style = await import('../stores/attenuationStyleStore');
        store.useLocaleStore.setState({ locales: { [style.DEFAULT_LOCALE_ID]: store.DEFAULT_LOCALE } });
        spawn.spawnInitialRoster(style.DEFAULT_LOCALE_ID);
        return (store.useLocaleStore.getState().getLocaleById(style.DEFAULT_LOCALE_ID)?.robots ?? [])
          .map((r) => ({ stationId: r.stationId, position: r.position, activity: r.activity }));
      };
      expect(await snapshot()).toEqual(await snapshot());
    });

    it('an unknown locale spawns nothing and does not throw', () => {
      expect(() => spawnInitialRoster('no-such-locale')).not.toThrow();
      expect(useLocaleStore.getState().getLocaleById('no-such-locale')).toBeUndefined();
    });

    it('spawnRobot alone (no roster) leaves stationId and siteId unset; activity is its docking\'s starting state (Task 24: required)', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      const [r] = roster();
      expect(r.stationId).toBeUndefined();
      expect(r.activity).toBe('exiting');
      expect(r.siteId).toBeUndefined();
    });
  });

  describe('spawnRobot — gemSeed (Phase 39, Gem Polygon Robots, Task 6)', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
      vi.clearAllMocks();
    });

    it('every robot gets an integer gemSeed in [0, 2^31), and they are not all the same', () => {
      for (let i = 0; i < 60; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      expect(robots).toHaveLength(60);
      robots.forEach((r) => {
        expect(Number.isInteger(r.gemSeed)).toBe(true);
        expect(r.gemSeed).toBeGreaterThanOrEqual(0);
        expect(r.gemSeed).toBeLessThan(2 ** 31);
      });
      expect(new Set(robots.map((r) => r.gemSeed)).size).toBeGreaterThan(50);
    });

    it('every spawned gemSeed generates a robot (the geometry is derived, never stored)', () => {
      for (let i = 0; i < 24; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.forEach((r) => {
        // guard first: getRobotGem(undefined) would happily seed from the string "undefined"
        expect(Number.isInteger(r.gemSeed)).toBe(true);
        expect(() => getRobotGem(r.gemSeed)).not.toThrow();
        expect(r).not.toHaveProperty('gem');
        expect(r).not.toHaveProperty('greebles'); // Phase 39 Task 11: the greeble set is retired
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same gemSeed per robot', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      const seedsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.gemSeed);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      const seedsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.robots ?? []).map((r) => r.gemSeed);

      expect(seedsRun1.length).toBeGreaterThan(0);
      // two arrays of undefined would also compare equal — require real seeds
      seedsRun1.forEach((s) => expect(Number.isInteger(s)).toBe(true));
      expect(seedsRun2).toEqual(seedsRun1);
    });

    it('a company member gets its own gemSeed, never its founder\'s', () => {
      spawnRobot(DEFAULT_LOCALE_ID);
      spawnRobot(DEFAULT_LOCALE_ID, { founderIndex: 0 });
      const [founder, member] = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
      expect(member.lfoLinks).toBe(founder.lfoLinks); // precondition: a member, inheriting by reference
      expect(member.gemSeed).not.toBe(founder.gemSeed);
    });
  });

  describe('spawnRobot — batterySize (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.3, case 11)', () => {
    const inBand = (size: number | undefined) => size !== undefined && size >= BATTERY_SIZE_MIN && size < BATTERY_SIZE_MAX;
    const sizesAt = (localeId: string, x: number, y: number) => {
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x, y }, robots: [] } },
      }));
      spawnInitialRoster(localeId);
      return useLocaleStore.getState().getLocaleById(localeId)!.robots.map((r) => r.batterySize);
    };

    beforeEach(() => {
      useLocaleStore.setState({ locales: {} });
      vi.clearAllMocks();
    });

    it('every robot spawnInitialRoster makes carries a size inside the band, and the sizes differ', () => {
      const sizes = sizesAt('battery-size-band', 40, -80);
      expect(sizes).toHaveLength(MAX_ROBOTS);
      sizes.forEach((size) => expect(inBand(size), `size ${size}`).toBe(true));
      expect(new Set(sizes).size).toBe(MAX_ROBOTS);
    });

    it('two locales at the same coordinates get the same sizes, robot for robot', () => {
      const a = sizesAt('battery-size-twin-a', 120, 160);
      const b = sizesAt('battery-size-twin-b', 120, 160);
      a.forEach((size) => expect(inBand(size)).toBe(true)); // two arrays of undefined would also compare equal
      expect(b).toEqual(a);
      expect(sizesAt('battery-size-elsewhere', -160, 40)).not.toEqual(a);
    });

    it('a size is the even draw at robot.batterySize, offset the spawn count', () => {
      const noiseMap = getLocaleNoiseMap('battery-size-draw', 80, 0);
      const sizes = sizesAt('battery-size-draw', 80, 0);
      sizes.forEach((size, i) => expect(size).toBe(generateBatterySize(noiseMap, i)));
      expect(generateBatterySize(noiseMap, 3)).toBe(getUniformSeededVal(noiseMap, 'robot.batterySize', 3, BATTERY_SIZE_MIN, BATTERY_SIZE_MAX));
    });

    it('takes another band as arguments, for the sims', () => {
      const noiseMap = getLocaleNoiseMap('battery-size-other-band', 0, 0);
      for (let i = 0; i < 50; i++) {
        const size = generateBatterySize(noiseMap, i, 0.67, 1.5);
        expect(size).toBeGreaterThanOrEqual(0.67);
        expect(size).toBeLessThan(1.5);
      }
    });

    // 121 worlds × 100 offsets = 12,100 draws: the sampling error on an outer tenth's share is about 0.3 %.
    it('over the grid\'s 121 worlds at offsets 0-99, puts 8-12 % of its values in each outer tenth of the band', () => {
      const axis = [-200, -160, -120, -80, -40, 0, 40, 80, 120, 160, 200];
      const sizes = axis.flatMap((x) => axis.flatMap((y) => {
        const noiseMap = createNoise2D(alea(`${x}:${y}`));
        return Array.from({ length: 100 }, (_, i) => generateBatterySize(noiseMap, i));
      }));
      expect(sizes).toHaveLength(12_100);
      const { bottom, top } = outerTenths(sizes, { min: BATTERY_SIZE_MIN, max: BATTERY_SIZE_MAX });
      expect(bottom).toBeGreaterThanOrEqual(0.08);
      expect(bottom).toBeLessThanOrEqual(0.12);
      expect(top).toBeGreaterThanOrEqual(0.08);
      expect(top).toBeLessThanOrEqual(0.12);
    });

    it('with no locale (no noise map) a lone spawnRobot still gets a size inside the band, varied', () => {
      const added: Robot[] = [];
      const realAddRobot = useLocaleStore.getState().addRobot;
      useLocaleStore.setState({ addRobot: (_localeId, robot) => { added.push(robot); } });
      try {
        for (let i = 0; i < 20; i++) spawnRobot(`battery-size-no-locale-${i}`);
      } finally {
        useLocaleStore.setState({ addRobot: realAddRobot });
      }
      expect(added).toHaveLength(20);
      added.forEach((robot) => expect(inBand(robot.batterySize), `size ${robot.batterySize}`).toBe(true));
      expect(new Set(added.map((r) => r.batterySize)).size).toBeGreaterThan(15);
    });
  });

  describe('generateCompanyName', () => {
    it('returns an "Adjective Noun" pair drawn from ADJECTIVES and COMPANY_NOUNS', () => {
      const name = generateCompanyName(deterministicNoiseMap, 0);
      const [adjective, noun] = name.split(' ');
      expect(ADJECTIVES).toContain(adjective);
      expect(COMPANY_NOUNS).toContain(noun);
    });

    it('COMPANY_NOUNS is a distinct list from robot naming — never the literal word "Drifter" (a robot NOUNS entry), so a company name can never take the exact same word-pair form a robot name can', () => {
      expect(COMPANY_NOUNS).not.toContain('Drifter');
    });
  });

  describe('spawnInitialCompanies', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it(`creates between ${INITIAL_COMPANIES_MIN} and ${INITIAL_COMPANIES_MAX} companies`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      expect(companies.length).toBeGreaterThanOrEqual(INITIAL_COMPANIES_MIN);
      expect(companies.length).toBeLessThanOrEqual(INITIAL_COMPANIES_MAX);
    });

    it(`gives each company between ${COMPANY_SIZE_MIN} and ${COMPANY_SIZE_MAX} members`, () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      companies.forEach((c) => {
        expect(c.robotIds.length).toBeGreaterThanOrEqual(COMPANY_SIZE_MIN);
        expect(c.robotIds.length).toBeLessThanOrEqual(COMPANY_SIZE_MAX);
      });
    });

    it('never lets the same robot ID appear in more than one company (disjoint membership)', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      const allMemberIds = companies.flatMap((c) => c.robotIds);
      expect(new Set(allMemberIds).size).toBe(allMemberIds.length);
    });

    it('sets companyId on every claimed robot to match the company that claimed it', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      locale.companies.forEach((c) => {
        c.robotIds.forEach((id) => {
          expect(locale.robots.find((r) => r.id === id)?.companyId).toBe(c.id);
        });
      });
    });

    // Roadmap: Company Section Enhancements (docs/specs/archive/COMPANY_SECTION_ENHANCEMENTS.md §1.2) —
    // each company's own seeded identity color, generated the same way generateRobotIdentityColor
    // already is (mirrors the identityColor test block above).
    it('gives every company a color from ROBOT_IDENTITY_COLOR_NAMES\' resolved hex set', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      const validColors = ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name]);
      companies.forEach((c) => {
        expect(validColors).toContain(c.color);
      });
    });

    it('never assigns black, white, or darkGray as a company\'s color', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      companies.forEach((c) => {
        expect(c.color).not.toBe(ACCENT_COLORS.black);
        expect(c.color).not.toBe(ACCENT_COLORS.white);
        expect(c.color).not.toBe(ACCENT_COLORS.darkGray);
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same color per company', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnInitialCompanies(attenuationStyle1.DEFAULT_LOCALE_ID);
      const colorsRun1 = (store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.companies ?? []).map((c) => c.color);

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnInitialCompanies(attenuationStyle2.DEFAULT_LOCALE_ID);
      const colorsRun2 = (store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.companies ?? []).map((c) => c.color);

      expect(colorsRun2).toEqual(colorsRun1);
    });

    it('leaves every unclaimed robot Freelance (companyId undefined)', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const locale = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!;
      const claimedIds = new Set(locale.companies.flatMap((c) => c.robotIds));
      locale.robots.filter((r) => !claimedIds.has(r.id)).forEach((r) => {
        expect(r.companyId).toBeUndefined();
      });
    });

    it('leaves at least one robot Freelance across a sample of locales — not every robot is claimed by design', () => {
      const leftoverCounts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const localeId = `freelance-sample-${i}`;
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: i * 7 + 1, y: i * 3 + 2 }, robots: [], companies: [] } },
        }));
        spawnInitialRoster(localeId);
        spawnInitialCompanies(localeId);
        const locale = useLocaleStore.getState().getLocaleById(localeId)!;
        const claimedIds = new Set(locale.companies.flatMap((c) => c.robotIds));
        leftoverCounts.push(locale.robots.filter((r) => !claimedIds.has(r.id)).length);
      }
      expect(leftoverCounts.some((n) => n > 0)).toBe(true);
    });

    it('every company gets a generated "Adjective Noun" name', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      spawnInitialCompanies(DEFAULT_LOCALE_ID);
      const companies = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.companies ?? [];
      companies.forEach((c) => {
        const [adjective, noun] = c.name.split(' ');
        expect(ADJECTIVES).toContain(adjective);
        expect(COMPANY_NOUNS).toContain(noun);
      });
    });

    it('is deterministic — spawning against the same coordinates reproduces the same company count, membership, and names', async () => {
      vi.resetModules();
      const run1 = await import('./spawnSystem');
      const store1 = await import('../stores/localeStore');
      const attenuationStyle1 = await import('../stores/attenuationStyleStore');
      store1.useLocaleStore.setState({ locales: { [attenuationStyle1.DEFAULT_LOCALE_ID]: store1.DEFAULT_LOCALE } });
      run1.spawnInitialRoster(attenuationStyle1.DEFAULT_LOCALE_ID);
      run1.spawnInitialCompanies(attenuationStyle1.DEFAULT_LOCALE_ID);
      const companiesRun1 = store1.useLocaleStore.getState().getLocaleById(attenuationStyle1.DEFAULT_LOCALE_ID)?.companies ?? [];

      vi.resetModules();
      const run2 = await import('./spawnSystem');
      const store2 = await import('../stores/localeStore');
      const attenuationStyle2 = await import('../stores/attenuationStyleStore');
      store2.useLocaleStore.setState({ locales: { [attenuationStyle2.DEFAULT_LOCALE_ID]: store2.DEFAULT_LOCALE } });
      run2.spawnInitialRoster(attenuationStyle2.DEFAULT_LOCALE_ID);
      run2.spawnInitialCompanies(attenuationStyle2.DEFAULT_LOCALE_ID);
      const companiesRun2 = store2.useLocaleStore.getState().getLocaleById(attenuationStyle2.DEFAULT_LOCALE_ID)?.companies ?? [];

      expect(companiesRun2).toEqual(companiesRun1);
    });

    // Roadmap: Robot Selection Filter Panel Polish §1.4 — reverses the "accepted, low-risk"
    // decision docs/specs/archive/COMPANY_SECTION_ENHANCEMENTS.md §7 item 2 previously made: two companies
    // spawned in the same locale must never share a color, closing the same gap
    // pickRandomCompanyColor (CompanyCrudControls.tsx, manual creation) already closed.
    it('never assigns two companies in the same locale the same color, across a sample of locales', () => {
      for (let i = 0; i < 15; i++) {
        const localeId = `color-collision-sample-${i}`;
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: i * 11 + 3, y: i * 5 + 2 }, robots: [], companies: [] } },
        }));
        spawnInitialRoster(localeId);
        spawnInitialCompanies(localeId);
        const companies = useLocaleStore.getState().getLocaleById(localeId)?.companies ?? [];
        const colors = companies.map((c) => c.color);
        expect(new Set(colors).size).toBe(colors.length);
      }
    });
  });

  describe('generateCompanyIdentityColor', () => {
    const noiseMap = createNoise2D(alea('color-collision-fix-test-seed'));

    it('matches a plain getSeededVal draw when usedColors is empty — unchanged for a non-colliding seed', () => {
      const expected = ACCENT_COLORS[
        ROBOT_IDENTITY_COLOR_NAMES[
          Math.min(
            ROBOT_IDENTITY_COLOR_NAMES.length - 1,
            Math.floor(getSeededVal(noiseMap, 'company.identityColor', 0, 0, ROBOT_IDENTITY_COLOR_NAMES.length)),
          )
        ]
      ];
      expect(generateCompanyIdentityColor(noiseMap, 0, [])).toBe(expected);
    });

    it('is deterministic — identical arguments (including usedColors) produce identical output', () => {
      const first = generateCompanyIdentityColor(noiseMap, 2, [ACCENT_COLORS.red]);
      const second = generateCompanyIdentityColor(noiseMap, 2, [ACCENT_COLORS.red]);
      expect(second).toBe(first);
    });

    it('retries to a different color when the attempt-0 draw is already in usedColors', () => {
      const attempt0Color = generateCompanyIdentityColor(noiseMap, 0, []);
      const retried = generateCompanyIdentityColor(noiseMap, 0, [attempt0Color]);
      expect(retried).not.toBe(attempt0Color);
      expect(ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name])).toContain(retried);
    });

    // Bounded retries (18 attempts, matching pickRandomCompanyColor's own bound), not an
    // exhaustive search — same non-guarantee pickRandomCompanyColor already has (a probabilistic
    // draw can revisit an already-tried color within its own attempt budget). Never triggered in
    // practice (INITIAL_COMPANIES_MAX is 3, far under the 18-color palette); this only proves the
    // loop terminates and still returns a valid palette color rather than throwing or hanging.
    it('terminates and returns a valid palette color even when the bound is exhausted (all colors excluded)', () => {
      const everyColor = ROBOT_IDENTITY_COLOR_NAMES.map((name) => ACCENT_COLORS[name]);
      const result = generateCompanyIdentityColor(noiseMap, 0, everyColor);
      expect(everyColor).toContain(result);
    });
  });

  // Session Storage (Roadmap Phase 20, docs/specs/SESSION_STORAGE.md) needs a way to compute
  // "what the seed alone would have produced" for a robot, without touching the live store, so a
  // saved override diff can be compared against it. generateRobotAudioBaseline/
  // generateRobotRosterBaseline are a pure, additive parallel to spawnRobot's own generate-or-copy
  // decision tree — NOT a refactor of spawnRobot itself (spawnRobot's own inline logic is
  // untouched; see docs/tasks/SESSION_STORAGE.md Task 2's note on this deviation from the
  // original plan, made after discovering spawnRobot's ~30% "copy an earlier sibling" branch,
  // which depends on the live store's accumulated robots — replaying it purely requires this
  // function to take that pool as an explicit array argument instead).
  // Robot Performance T4 (docs/specs/ROBOT_PERFORMANCE.md assumption 13, sections 1.2 and 1.4): every
  // robot is seeded with Dynamics, Rests and Accents, fleet-wide, and its melody carries the stamps.
  describe('spawnRobot and the baseline — performance seeding (Robot Performance T4)', () => {
    // 10 worlds x 40 offsets = 400 robots; generateRobotAudioBaseline with no priors is always a fresh draw.
    const WORLDS = Array.from({ length: 10 }, (_, i) => createNoise2D(alea(`performance-seed-world-${i}`)));
    const SAMPLE = WORLDS.flatMap((noiseMap) => Array.from({ length: 40 }, (_, offset) => generateRobotAudioBaseline(noiseMap, offset, [])));
    const BANDS = { dynamics: [60, 80], rests: [0, 10], accents: [0, 30] } as const; // Classic's, since R3 and R4
    const FIELDS = ['dynamics', 'rests', 'accents'] as const;
    type PerformanceFields = { dynamics?: number; rests?: number; accents?: number };
    const fieldsOf = (x: PerformanceFields) => ({ dynamics: x.dynamics, rests: x.rests, accents: x.accents });

    const freshLocale = (localeId: string, coordinates?: { x: number; y: number }) =>
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, ...(coordinates ? { coordinates } : {}), robots: [] } },
      }));
    const noiseFor = (localeId: string) => {
      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      return getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
    };
    const stripEventIds = (melody: Robot['melody']) => melody.map(({ id: _id, ...rest }) => rest);

    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    afterEach(async () => {
      await restoreSeededDraws();
    });

    describe('the seeded distribution over 400 robots', () => {
      it('gives every robot all three fields, as integers', () => {
        expect(SAMPLE).toHaveLength(400);
        for (const baseline of SAMPLE) {
          for (const field of FIELDS) {
            expect(Number.isInteger(baseline[field]), `${field} ${baseline[field]}`).toBe(true);
          }
        }
      });

      it.each(FIELDS)('keeps %s inside its seed band', (field) => {
        const [min, max] = BANDS[field];
        for (const baseline of SAMPLE) {
          expect(baseline[field]).toBeGreaterThanOrEqual(min);
          expect(baseline[field]).toBeLessThanOrEqual(max);
        }
      });

      it.each(FIELDS)('spreads %s across the band: at least 20 distinct values (every value of a narrower band), both halves used', (field) => {
        const values = SAMPLE.map((b) => b[field]);
        const [min, max] = BANDS[field];
        const middle = (min + max) / 2;
        expect(new Set(values).size, `${field} distinct values`).toBeGreaterThanOrEqual(Math.min(20, max - min + 1));
        expect(values.some((v) => v < middle)).toBe(true);
        expect(values.some((v) => v > middle)).toBe(true);
      });

      it('is deterministic: the same noise map and offset always give the same three values', () => {
        const noiseMap = createNoise2D(alea('performance-determinism-seed'));
        for (let offset = 0; offset < 20; offset++) {
          expect(fieldsOf(generateRobotAudioBaseline(noiseMap, offset, []))).toEqual(fieldsOf(generateRobotAudioBaseline(noiseMap, offset, [])));
        }
      });

      it('the three fields are drawn independently: few robots share one value across all three', () => {
        const sameEverywhere = SAMPLE.filter((b) => b.dynamics === b.rests && b.rests === b.accents);
        expect(sameEverywhere.length).toBeLessThan(SAMPLE.length / 10);
      });
    });

    describe('spawnRobot', () => {
      it('writes all three fields on every spawned robot, Active or Docked, inside the bands', () => {
        freshLocale('performance-spawn-locale');
        for (let i = 0; i < 30; i++) {
          spawnRobot('performance-spawn-locale', i % 2 ? { docking: DockingState.Docked, batteryLevel: 40 } : undefined);
        }
        const robots = useLocaleStore.getState().getLocaleById('performance-spawn-locale')!.robots;
        expect(robots).toHaveLength(30);
        for (const robot of robots) {
          for (const field of FIELDS) {
            const [min, max] = BANDS[field];
            expect(robot[field], `${field} of ${robot.id}`).toBeGreaterThanOrEqual(min);
            expect(robot[field], `${field} of ${robot.id}`).toBeLessThanOrEqual(max);
            expect(Number.isInteger(robot[field])).toBe(true);
          }
        }
      });

      it('draws each field once, at the spawn count, from its own dataId and band', () => {
        freshLocale('performance-keys-locale');
        vi.mocked(getUniformSeededVal).mockClear();

        spawnRobot('performance-keys-locale');

        // The even draw (Even Seeded Draws T9).
        const calls = vi.mocked(getUniformSeededVal).mock.calls.filter((c) => /^robot\.(dynamics|rests|accents)$/.test(String(c[1])));
        expect(calls.map((c) => [c[1], c[2], c[3], c[4]]).sort()).toEqual([
          ['robot.accents', 0, 0, 30],
          ['robot.dynamics', 0, 60, 80],
          ['robot.rests', 0, 0, 10],
        ]);
      });

      it('with no locale (no noise map) falls back to alea draws inside the same bands, still varied', () => {
        const added: Robot[] = [];
        const realAddRobot = useLocaleStore.getState().addRobot;
        useLocaleStore.setState({ addRobot: (_localeId, robot) => { added.push(robot); } });
        try {
          for (let i = 0; i < 40; i++) spawnRobot(`performance-no-locale-${i}`);
        } finally {
          useLocaleStore.setState({ addRobot: realAddRobot });
        }
        expect(added).toHaveLength(40);
        for (const field of FIELDS) {
          const [min, max] = BANDS[field];
          const values = added.map((r) => r[field] as number);
          for (const v of values) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(min);
            expect(v).toBeLessThanOrEqual(max);
          }
          expect(new Set(values).size, `${field} distinct values`).toBeGreaterThan(8);
        }
      });

      it('a company member inherits all three fields from its founder and draws none', () => {
        freshLocale('performance-copy-locale');
        for (let i = 0; i < 4; i++) {
          if (i === 1) vi.mocked(getUniformSeededVal).mockClear();
          spawnRobot('performance-copy-locale', i === 0 ? undefined : { founderIndex: 0 });
        }
        // Captured before the fresh-draw comparison below, which draws them itself (the even draw, Even Seeded Draws T9).
        const draws = vi.mocked(getUniformSeededVal).mock.calls.filter((c) => /^robot\.(dynamics|rests|accents)$/.test(String(c[1])));
        const robots = useLocaleStore.getState().getLocaleById('performance-copy-locale')!.robots;
        // Every later robot is a member: it reuses the founder's audioAttributes by reference.
        expect(robots.slice(1).every((r) => r.audioAttributes === robots[0].audioAttributes)).toBe(true);
        for (const robot of robots.slice(1)) expect(fieldsOf(robot)).toEqual(fieldsOf(robots[0]));
        // ...and not by coincidence: a fresh draw at those offsets would have given different values.
        const noiseMap = noiseFor('performance-copy-locale');
        const freshDraws = [1, 2, 3].map((i) => fieldsOf(generateRobotAudioBaseline(noiseMap, i, [])));
        expect(freshDraws.some((fresh) => JSON.stringify(fresh) !== JSON.stringify(fieldsOf(robots[0])))).toBe(true);
        expect(draws).toEqual([]);
      });

      it('a member of a founder with the fields absent falls back to 50, 0 and 0', async () => {
        freshLocale('performance-copy-absent-locale');
        const bare = { ...(await (async () => {
          spawnRobot('performance-copy-absent-locale');
          return useLocaleStore.getState().getLocaleById('performance-copy-absent-locale')!.robots[0];
        })()) } as Robot;
        delete bare.dynamics;
        delete bare.rests;
        delete bare.accents;
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, 'performance-copy-absent-locale': { ...state.locales['performance-copy-absent-locale'], robots: [bare] } },
        }));
        spawnRobot('performance-copy-absent-locale', { founderIndex: 0 });

        const member = useLocaleStore.getState().getLocaleById('performance-copy-absent-locale')!.robots[1];
        expect(member.lineage).toEqual({ founderIndex: 0 });
        expect(fieldsOf(member)).toEqual({ dynamics: DEFAULT_DYNAMICS, rests: DEFAULT_RESTS, accents: DEFAULT_ACCENTS });
      });
    });

    describe('the melody carries the stamps', () => {
      const rosterLocale = 'performance-melody-roster-locale';
      /** Company Families Task 3a: a locale's world key, its coordinates. */
      const worldOf = (localeId: string) => {
        const { x, y } = useLocaleStore.getState().getLocaleById(localeId)!.coordinates;
        return `${x}:${y}`;
      };
      const rebuiltMelody = (robot: Robot, world: string) =>
        applyPerformanceMarks(
          generateMelodyForRobot({
            octaveMin: robot.octaveRange[0],
            octaveMax: robot.octaveRange[1],
            rhythmicDensity: robot.rhythmicDensity!,
            rhythmicMotifLength: robot.rhythmicMotifLength!,
            noteVariance: robot.noteVariance!,
            pitchRepeat: robot.pitchRepeat!,
            rand: buildSeededComposition(robot.compositionSeed, {
              rhythmicDensity: robot.rhythmicDensity!,
              rhythmicMotifLength: robot.rhythmicMotifLength!,
              noteVariance: robot.noteVariance!,
              pitchRepeat: robot.pitchRepeat!,
              octaveRange: robot.octaveRange,
            }),
            // Company Families Task 3a: onsets, lengths and stamps from the streams on the world and the rhythm shape.
            rhythmRand: buildSeededRhythm(world, {
              rhythmicDensity: robot.rhythmicDensity!,
              rhythmicMotifLength: robot.rhythmicMotifLength!,
            }),
          }),
          { rests: robot.rests!, accents: robot.accents! },
          buildSeededPerformance(world, { rhythmicDensity: robot.rhythmicDensity!, rhythmicMotifLength: robot.rhythmicMotifLength! }),
        );

      it('every robot of a real roster has exactly the melody the post-pass makes from its own fields, and some are stamped', () => {
        // A plot whose roster stamps both a rest and a mark (the default plot's thinned melodies, after the attack rail, land none).
        freshLocale(rosterLocale, { x: 7, y: 11 });
        spawnInitialRoster(rosterLocale);
        const robots = useLocaleStore.getState().getLocaleById(rosterLocale)!.robots;
        expect(robots.length).toBeGreaterThan(0);
        for (const robot of robots) {
          expect(stripEventIds(robot.melody), `robot ${robot.id}`).toEqual(stripEventIds(rebuiltMelody(robot, worldOf(rosterLocale))));
        }
        // Not vacuous: the seeded rests and accents really did stamp events.
        expect(robots.some((r) => r.melody.some((e) => e.rest !== undefined))).toBe(true);
        expect(robots.some((r) => r.melody.some((e) => e.mark !== undefined))).toBe(true);
      });

      it('regenerateMelody on every freshly spawned, unedited robot reproduces its spawn melody, stamps included', async () => {
        const { regenerateMelody } = await import('../engine/regenerateMelody');
        freshLocale(rosterLocale + '-regen');
        spawnInitialRoster(rosterLocale + '-regen');
        const robots = useLocaleStore.getState().getLocaleById(rosterLocale + '-regen')!.robots;
        expect(robots.some((r) => r.melody.some((e) => e.rest !== undefined || e.mark !== undefined))).toBe(true);
        for (const robot of robots) {
          const spawned = robot.melody;
          regenerateMelody(robot, rosterLocale + '-regen');
          const after = useLocaleStore.getState().getLocaleById(rosterLocale + '-regen')!.robots.find((r) => r.id === robot.id)!;
          expect(stripEventIds(after.melody), `robot ${robot.id}`).toEqual(stripEventIds(spawned));
        }
      });

      it('rests and accents at their seeded values never change which notes a robot plays', () => {
        freshLocale(rosterLocale + '-notes');
        spawnInitialRoster(rosterLocale + '-notes');
        for (const robot of useLocaleStore.getState().getLocaleById(rosterLocale + '-notes')!.robots) {
          const world = worldOf(rosterLocale + '-notes');
          const plain = applyPerformanceMarks(rebuiltMelody({ ...robot, rests: 0, accents: 0 }, world), { rests: 0, accents: 0 }, buildSeededPerformance(world, { rhythmicDensity: robot.rhythmicDensity!, rhythmicMotifLength: robot.rhythmicMotifLength! }));
          expect(robot.melody.map(({ rest: _r, mark: _m, id: _id, ...rest }) => rest)).toEqual(plain.map(({ id: _id, ...rest }) => rest));
        }
      });

      // Company Families Task 3, revised by Task 3a (docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.11): onsets and
      // lengths come from the rhythm stream, keyed on the world's coordinates and the rhythm shape, whatever the
      // composition stream draws.
      it('every spawned robot plays the rhythm stream: its onsets and lengths are buildSeededRhythm on its world', () => {
        for (const [suffix, coordinates] of [['-rhythm-a', { x: 7, y: 11 }], ['-rhythm-b', { x: 120, y: 40 }]] as const) {
          freshLocale(rosterLocale + suffix, coordinates);
          spawnInitialRoster(rosterLocale + suffix);
          const robots = useLocaleStore.getState().getLocaleById(rosterLocale + suffix)!.robots;
          expect(robots.length).toBeGreaterThan(0);
          for (const robot of robots) {
            const rhythmOnly = generateMelodyForRobot({
              octaveMin: robot.octaveRange[0],
              octaveMax: robot.octaveRange[1],
              rhythmicDensity: robot.rhythmicDensity!,
              rhythmicMotifLength: robot.rhythmicMotifLength!,
              noteVariance: robot.noteVariance!,
              pitchRepeat: robot.pitchRepeat!,
              rand: alea('any composition stream'),
              rhythmRand: buildSeededRhythm(`${coordinates.x}:${coordinates.y}`, {
                rhythmicDensity: robot.rhythmicDensity!,
                rhythmicMotifLength: robot.rhythmicMotifLength!,
              }),
            });
            expect(robot.melody.map((e) => [e.startStep, e.length]), `robot ${robot.id}`).toEqual(
              rhythmOnly.map((e) => [e.startStep, e.length]),
            );
          }
        }
      });

      it('an unedited spawned original carries no lineage, and a company member its founder\'s index (Company Families Task 5)', () => {
        freshLocale(rosterLocale + '-lineage');
        spawnInitialRoster(rosterLocale + '-lineage');
        const founders = companyFounders(generateCompanyMembership(noiseFor(rosterLocale + '-lineage')));
        expect(founders.size).toBeGreaterThan(0);
        useLocaleStore.getState().getLocaleById(rosterLocale + '-lineage')!.robots.forEach((robot, i) => {
          const founderIndex = founders.get(i);
          expect(robot.lineage, `robot ${i}`).toEqual(founderIndex === undefined ? undefined : { founderIndex });
        });
      });
    });

    describe('generateRobotAudioBaseline mirrors spawnRobot', () => {
      it('equals the spawned robot at spawn count 0, with each value off its default', () => {
        freshLocale('performance-baseline-fresh-locale');
        spawnRobot('performance-baseline-fresh-locale');
        const robot = useLocaleStore.getState().getLocaleById('performance-baseline-fresh-locale')!.robots[0];

        const baseline = generateRobotAudioBaseline(noiseFor('performance-baseline-fresh-locale'), 0, []);

        expect(fieldsOf(baseline)).toEqual(fieldsOf(robot));
        // A baseline missing a field, or one equal to its default, cannot pass: the dynamics band starts above its default
        // 50 (rests' and accents' start at their default 0 since R3 and R4, so they are only checked present).
        expect(baseline.dynamics).toBeGreaterThanOrEqual(60);
        expect(typeof baseline.accents).toBe('number');
        expect(typeof baseline.rests).toBe('number');
      });

      it('equals every robot of a real 12-robot roster, company members included', () => {
        freshLocale('performance-baseline-roster-locale');
        spawnInitialRoster('performance-baseline-roster-locale');
        const robots = useLocaleStore.getState().getLocaleById('performance-baseline-roster-locale')!.robots;
        const baselines = generateRobotRosterBaseline(noiseFor('performance-baseline-roster-locale'), robots.length);
        expect(robots.length).toBeGreaterThan(0);
        expect(robots.some((r) => r.lineage !== undefined), 'the roster has members').toBe(true);
        robots.forEach((robot, i) => {
          expect(fieldsOf(baselines[i]), `robot ${i} (${robot.id})`).toEqual(fieldsOf(robot));
        });
      });

      it('a member\'s baseline inherits its founder\'s three values, not a fresh draw at its own index', () => {
        freshLocale('performance-baseline-inherit-locale');
        const noiseMap = noiseFor('performance-baseline-inherit-locale');
        const baselines = generateRobotRosterBaseline(noiseMap, 12);
        const founders = [...companyFounders(generateCompanyMembership(noiseMap))];
        expect(founders.length).toBeGreaterThan(0);
        for (const [member, founder] of founders) {
          expect(baselines[member].audioAttributes, `robot ${member}`).toBe(baselines[founder].audioAttributes);
          expect(fieldsOf(baselines[member]), `robot ${member}`).toEqual(fieldsOf(baselines[founder]));
        }
        // ...and not by coincidence: a fresh draw at some member's own index would differ.
        expect(founders.some(([member, founder]) =>
          JSON.stringify(fieldsOf(generateRobotAudioBaseline(noiseMap, member, []))) !== JSON.stringify(fieldsOf(baselines[founder])))).toBe(true);
      });
    });
  });

  describe('generateRobotAudioBaseline / generateRobotRosterBaseline', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it('with no prior baselines, generates fresh values identical to a real spawnRobot at spawnCount 0', () => {
      const localeId = 'baseline-parity-fresh-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
      }));
      spawnRobot(localeId);
      const robot = useLocaleStore.getState().getLocaleById(localeId)!.robots[0];

      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      const baseline = generateRobotAudioBaseline(noiseMap, 0, []);

      expect(baseline.name).toBe(robot.name);
      expect(baseline.audioAttributes).toEqual(robot.audioAttributes);
      expect(baseline.octaveRange).toEqual(robot.octaveRange);
      expect(baseline.rhythmicDensity).toBe(robot.rhythmicDensity);
      expect(baseline.rhythmicMotifLength).toEqual(robot.rhythmicMotifLength);
      expect(baseline.noteVariance).toEqual(robot.noteVariance);
      expect(baseline.pitchRepeat).toBe(robot.pitchRepeat);
      expect(baseline.lfoLinks).toEqual(robot.lfoLinks);
    });

    it('reproduces lfoLinks too, including the roster-aware lane tally across several robots (LFO Bank Task 18)', () => {
      const localeId = 'baseline-parity-lfolinks-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
      }));
      for (let i = 0; i < 5; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;

      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      // Robots spawned alone are originals, so the chain of original baselines (each given the ones before it) is what they
      // replay; a roster baseline would make some of five a company (Company Families Task 5).
      const baselines = robots.reduce<RobotAudioBaseline[]>((prior, _, i) => [...prior, generateRobotAudioBaseline(noiseMap, i, prior)], []);

      robots.forEach((robot, i) => {
        expect(baselines[i].lfoLinks, `robot ${i} (${robot.id}) lfoLinks`).toEqual(robot.lfoLinks);
      });
    });

    it('reproduces every field of a full real 12-robot roster (spawnInitialRoster), company members included', () => {
      const localeId = 'baseline-parity-full-roster-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
      }));
      spawnInitialRoster(localeId);
      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const robots = locale.robots;
      expect(robots.length).toBeGreaterThan(0); // sanity: MAX_ROBOTS, not an empty roster

      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      const baselines = generateRobotRosterBaseline(noiseMap, robots.length);

      expect(baselines.length).toBe(robots.length);
      robots.forEach((robot, i) => {
        expect(baselines[i].name, `robot ${i} (${robot.id}) name`).toBe(robot.name);
        expect(baselines[i].audioAttributes, `robot ${i} (${robot.id}) audioAttributes`).toEqual(robot.audioAttributes);
        expect(baselines[i].octaveRange, `robot ${i} (${robot.id}) octaveRange`).toEqual(robot.octaveRange);
        expect(baselines[i].rhythmicDensity, `robot ${i} (${robot.id}) rhythmicDensity`).toBe(robot.rhythmicDensity);
        expect(baselines[i].rhythmicMotifLength, `robot ${i} (${robot.id}) rhythmicMotifLength`).toEqual(robot.rhythmicMotifLength);
        expect(baselines[i].noteVariance, `robot ${i} (${robot.id}) noteVariance`).toEqual(robot.noteVariance);
        expect(baselines[i].pitchRepeat, `robot ${i} (${robot.id}) pitchRepeat`).toBe(robot.pitchRepeat);
        expect(baselines[i].lfoLinks, `robot ${i} (${robot.id}) lfoLinks`).toEqual(robot.lfoLinks);
      });
    });

    // Robot Sends T5 (docs/specs/ROBOT_SENDS.md section 1.2): the baseline gains the two sends, drawn by the
    // same helper as spawnRobot (a company member's are its founder's, Company Families B5), so "live differs from seed" is exact.
    describe('sends (Robot Sends T5)', () => {
      // Robot Effect Sends T7: all five sends.
      const sendsOf = (x: { reverbSend: number; delaySend: number; gritSend: number; shimmerSend: number; doubleSend: number }) => ({
        ...reverbAndDelay(x),
        ...effectSends(x),
      });
      const freshLocale = (localeId: string) =>
        useLocaleStore.setState((state) => ({
          locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [] } },
        }));
      const noiseFor = (localeId: string) => {
        const locale = useLocaleStore.getState().getLocaleById(localeId)!;
        return getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      };

      afterEach(async () => {
        const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        vi.mocked(getSeededVal).mockImplementation(real);
      });

      it('equals the spawned robot\'s sends at spawn count 0', () => {
        freshLocale('baseline-sends-fresh-locale');
        spawnRobot('baseline-sends-fresh-locale');
        const robot = useLocaleStore.getState().getLocaleById('baseline-sends-fresh-locale')!.robots[0];

        const baseline = generateRobotAudioBaseline(noiseFor('baseline-sends-fresh-locale'), 0, []);

        expect(sendsOf(baseline)).toEqual(sendsOf(robot));
        expect(baseline.reverbSend).toBeGreaterThan(0); // the reverb band starts at 0.1, so a missing field cannot pass
      });

      it('equals every robot of a real 12-robot roster', () => {
        freshLocale('baseline-sends-roster-locale');
        spawnInitialRoster('baseline-sends-roster-locale');
        const robots = useLocaleStore.getState().getLocaleById('baseline-sends-roster-locale')!.robots;
        expect(robots.length).toBeGreaterThan(0);

        const baselines = generateRobotRosterBaseline(noiseFor('baseline-sends-roster-locale'), robots.length);

        expect(robots.some((r) => r.lineage !== undefined), 'the roster has members').toBe(true);
        robots.forEach((robot, i) => {
          expect(sendsOf(baselines[i]), `robot ${i} (${robot.id})`).toEqual(sendsOf(robot));
        });
      });

      // Company Families B5 (Task 5): replaces "a copy baseline carries its own draw, not the source's".
      it('a member\'s baseline carries its founder\'s sends, not its own draw', () => {
        freshLocale('baseline-sends-own-locale');
        const noiseMap = noiseFor('baseline-sends-own-locale');
        const baselines = generateRobotRosterBaseline(noiseMap, 12);
        const founders = [...companyFounders(generateCompanyMembership(noiseMap))];
        expect(founders.length).toBeGreaterThan(0);
        for (const [member, founder] of founders) {
          expect(sendsOf(baselines[member]), `robot ${member}`).toEqual(sendsOf(baselines[founder]));
        }
        expect(founders.some(([member, founder]) =>
          JSON.stringify(sendsOf(generateRobotSends(noiseMap, member))) !== JSON.stringify(sendsOf(baselines[founder])))).toBe(true);
      });
    });

    it('a member\'s baseline reuses its founder\'s records by reference, with its own name', () => {
      // No store involved at all -- generateRobotRosterBaseline is pure. A member reuses the SAME audioAttributes (and
      // octaveRange, lfoLinks) objects, matching spawnRobot's own founder branch (no re-generation).
      const noiseMap = createNoise2D(alea('baseline-copy-branch-test-seed'));
      const baselines = generateRobotRosterBaseline(noiseMap, 12);
      const founders = [...companyFounders(generateCompanyMembership(noiseMap))];
      expect(founders.length).toBeGreaterThan(0);
      for (const [member, founder] of founders) {
        expect(baselines[member].audioAttributes, `robot ${member}`).toBe(baselines[founder].audioAttributes);
        expect(baselines[member].octaveRange, `robot ${member}`).toBe(baselines[founder].octaveRange);
        expect(baselines[member].lfoLinks, `robot ${member}`).toBe(baselines[founder].lfoLinks);
      }
      // Originals never share: every non-member's audioAttributes is its own object.
      const originals = baselines.filter((_, i) => !founders.some(([member]) => member === i));
      expect(new Set(originals.map((b) => b.audioAttributes)).size).toBe(originals.length);
    });
  });

  // Session Storage Task 4.1 (docs/tasks/SESSION_STORAGE.md) — company diffing needs the same
  // "what would the seed alone have produced" replay generateRobotRosterBaseline gives robots,
  // for spawnInitialCompanies' own inline, store-coupled membership-assignment loop.
  describe('generateCompanyRosterBaseline', () => {
    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    it('reproduces the same id/name/robotIds a real spawnInitialCompanies produces from the same noise map and robot-id pool', () => {
      const localeId = 'company-baseline-parity-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, robots: [], companies: [] } },
      }));
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const realCompanies = locale.companies;
      expect(realCompanies.length).toBeGreaterThan(0); // sanity: INITIAL_COMPANIES_MIN >= 1

      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      // Same robot-id pool order spawnInitialCompanies itself started from — the roster as it
      // existed before any company claimed a member (locale.robots is already in spawn order).
      const robotIds = locale.robots.map((r) => r.id);
      const baseline = generateCompanyRosterBaseline(noiseMap, robotIds);

      expect(baseline.length).toBe(realCompanies.length);
      realCompanies.forEach((company, i) => {
        expect(baseline[i].id, `company ${i}`).toBe(company.id);
        expect(baseline[i].name, `company ${i}`).toBe(company.name);
        expect(baseline[i].robotIds, `company ${i}`).toEqual(company.robotIds);
      });
    });

    it('is pure — takes no store dependency (call with only a noise map and a plain id array)', () => {
      const noiseMap = createNoise2D(alea('company-baseline-purity-seed'));
      const robotIds = Array.from({ length: 10 }, (_, i) => `robot-${i}`);
      expect(() => generateCompanyRosterBaseline(noiseMap, robotIds)).not.toThrow();
    });
  });

  // Company Families Task 4 (docs/tasks/COMPANY_FAMILIES.md; spec §1.11, case 5): membership is drawn over roster
  // indices before any robot spawns, from today's draws in today's order, with B4's cap (at least FREELANCERS_MIN
  // robots stay Freelance) and B14's default (a company that cannot reach COMPANY_SIZE_MIN is not made).
  describe('generateCompanyMembership (Company Families Task 4)', () => {
    /** Today's membership, from the retired path's draws: spawnInitialCompanies' own loop as it was before Task 4,
     *  over roster indices instead of ids, with no cap. Written out here, never by calling the new function. */
    const todaysMembership = (noiseMap: NoiseFunction2D, rosterSize = MAX_ROBOTS): number[][] => {
      let pool = Array.from({ length: rosterSize }, (_, i) => i);
      const count = INITIAL_COMPANIES_MIN + Math.floor(getSeededVal(noiseMap, 'company.count', 0, 0, INITIAL_COMPANIES_MAX - INITIAL_COMPANIES_MIN + 1));
      const companies: number[][] = [];
      for (let c = 0; c < count && pool.length > 0; c++) {
        const size = Math.min(pool.length, COMPANY_SIZE_MIN + Math.floor(getSeededVal(noiseMap, 'company.size', c, 0, COMPANY_SIZE_MAX - COMPANY_SIZE_MIN + 1)));
        const members: number[] = [];
        for (let i = 0; i < size; i++) {
          const idx = Math.floor(getSeededVal(noiseMap, 'company.member', c * 100 + i, 0, pool.length));
          members.push(pool[idx]);
          pool = pool.filter((_, j) => j !== idx);
        }
        companies.push(members);
      }
      return companies;
    };
    const freelancersIn = (membership: number[][], rosterSize = MAX_ROBOTS) => rosterSize - membership.flat().length;
    const GRID = SIM_SEED_COORDS.map(({ x, y }) => ({ key: `${x}:${y}`, noiseMap: simNoiseMap(x, y) }));
    const touched = GRID.filter(({ noiseMap }) => freelancersIn(todaysMembership(noiseMap)) < FREELANCERS_MIN);
    const untouched = GRID.filter(({ noiseMap }) => freelancersIn(todaysMembership(noiseMap)) >= FREELANCERS_MIN);

    it('FREELANCERS_MIN is 2 (B4)', () => {
      expect(FREELANCERS_MIN).toBe(2);
    });

    it('the grid holds worlds on both sides of the cap, so neither case below is vacuous', () => {
      expect(touched.length).toBeGreaterThan(0);
      expect(untouched.length).toBeGreaterThan(0);
    });

    it('on every grid world the cap does not touch, the membership is exactly today\'s', () => {
      for (const { key, noiseMap } of untouched) {
        expect(generateCompanyMembership(noiseMap), key).toEqual(todaysMembership(noiseMap));
      }
    });

    it('on every grid world the cap touches, the earlier companies are today\'s and the last is cut to leave two freelancers, or not made', () => {
      for (const { key, noiseMap } of touched) {
        const today = todaysMembership(noiseMap);
        const capped = generateCompanyMembership(noiseMap);
        expect(capped.length, key).toBeLessThanOrEqual(today.length);
        capped.forEach((members, c) => {
          // Same draws in the same order: a cut company is a prefix of today's.
          expect(today[c].slice(0, members.length), `${key} company ${c}`).toEqual(members);
        });
        // Only the last company today makes can be cut or dropped; every earlier one is untouched.
        capped.slice(0, today.length - 1).forEach((members, c) => expect(members, `${key} company ${c}`).toEqual(today[c]));
        expect(freelancersIn(capped), key).toBeGreaterThanOrEqual(FREELANCERS_MIN);
      }
    });

    it('over the grid: never fewer than two freelancers, every company 3 to 4 disjoint roster indices, 2 to 3 companies at most', () => {
      for (const { key, noiseMap } of GRID) {
        const membership = generateCompanyMembership(noiseMap);
        expect(freelancersIn(membership), key).toBeGreaterThanOrEqual(FREELANCERS_MIN);
        expect(membership.length, key).toBeLessThanOrEqual(INITIAL_COMPANIES_MAX);
        for (const members of membership) {
          expect(members.length, key).toBeGreaterThanOrEqual(COMPANY_SIZE_MIN);
          expect(members.length, key).toBeLessThanOrEqual(COMPANY_SIZE_MAX);
          for (const index of members) {
            expect(Number.isInteger(index), key).toBe(true);
            expect(index, key).toBeGreaterThanOrEqual(0);
            expect(index, key).toBeLessThan(MAX_ROBOTS);
          }
        }
        expect(new Set(membership.flat()).size, key).toBe(membership.flat().length);
      }
    });

    it('is repeatable: the same coordinates give the same membership, from a fresh noise map too', () => {
      for (const { x, y } of SIM_SEED_COORDS.slice(0, 12)) {
        const first = generateCompanyMembership(simNoiseMap(x, y));
        expect(generateCompanyMembership(simNoiseMap(x, y)), `${x}:${y}`).toEqual(first);
      }
    });

    it('a smaller roster keeps the floor: five robots make at most one company of three, four robots make none', () => {
      for (const { key, noiseMap } of GRID.slice(0, 20)) {
        const five = generateCompanyMembership(noiseMap, 5);
        expect(five.length, key).toBeLessThanOrEqual(1);
        five.forEach((members) => expect(members, key).toHaveLength(3));
        expect(five.flat().every((i) => i < 5), key).toBe(true);
        expect(generateCompanyMembership(noiseMap, 4), key).toEqual([]);
        expect(generateCompanyMembership(noiseMap, 0), key).toEqual([]);
      }
    });

    it('a larger roster is never capped: sixteen robots get today\'s membership', () => {
      for (const { key, noiseMap } of GRID.slice(0, 20)) {
        expect(generateCompanyMembership(noiseMap, 16), key).toEqual(todaysMembership(noiseMap, 16));
      }
    });

    it('spawnInitialCompanies and generateCompanyRosterBaseline turn a capped membership into ids, on a world the cap touches', () => {
      const [{ key }] = touched;
      const [x, y] = key.split(':').map(Number);
      const localeId = 'company-membership-capped';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x, y }, robots: [], companies: [] } },
      }));
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const ids = locale.robots.map((r) => r.id);
      const expected = generateCompanyMembership(simNoiseMap(x, y)).map((members) => members.map((i) => ids[i]));
      expect(locale.companies.map((c) => c.robotIds)).toEqual(expected);
      expect(generateCompanyRosterBaseline(simNoiseMap(x, y), ids).map((c) => c.robotIds)).toEqual(expected);
      expect(locale.robots.filter((r) => r.companyId === undefined).length).toBeGreaterThanOrEqual(FREELANCERS_MIN);
    });
  });

  describe('the robot bands read the loading context (band-table T21, spec assumption 15)', () => {
    const PERILOUS = { theme: 'shatter', aspects: {} } as const;
    const noiseMap = createNoise2D(alea('band-table-t21'));
    const ROSTER = 16;

    const freshLocale = (localeId: string, coordinates: { x: number; y: number }) =>
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates, robots: [] } },
      }));

    /** The fields every spawn path seeds through the Melody and performance bands, as the injected column moves them. */
    const expectThemedFields = (robot: {
      rhythmicDensity?: number;
      pitchRepeat?: number;
      rhythmicMotifLength?: { active: boolean; value: number };
      noteVariance?: { active: boolean; value: number };
      dynamics?: number;
      rests?: number;
      accents?: number;
    }) => {
      expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(90);
      expect(robot.pitchRepeat).toBeLessThanOrEqual(5);
      expect(robot.rhythmicMotifLength).toEqual({ active: true, value: expect.any(Number) });
      expect([3, 4]).toContain(robot.rhythmicMotifLength?.value);
      expect(robot.noteVariance).toEqual({ active: false, value: 0 });
      expect(robot.dynamics).toBeLessThanOrEqual(5);
      expect(robot.rests).toBeGreaterThanOrEqual(90);
      expect(robot.accents).toBeLessThanOrEqual(5);
    };

    it('generateRobotRosterBaseline draws every robot band from the installed table, where the same noise under Classic does not', () => {
      const themed = withLoading(PERILOUS, () => generateRobotRosterBaseline(noiseMap, ROSTER));
      const classic = generateRobotRosterBaseline(noiseMap, ROSTER);
      expect(themed).toHaveLength(ROSTER);
      for (const robot of themed) {
        expectThemedFields(robot);
        const { adsr, portamento, filterFreq, filterQ, layers } = robot.audioAttributes;
        expect(adsr.attack).toBeGreaterThanOrEqual(1.5);
        expect(adsr.attackCurve).toBe('linear');
        expect(adsr.decay).toBeGreaterThanOrEqual(1);
        expect(adsr.decay).toBeLessThanOrEqual(1.2);
        expect(adsr.sustain).toBeGreaterThanOrEqual(0.9);
        expect(adsr.releaseCurve).not.toBe('linear');
        expect(adsr.release).toBeGreaterThanOrEqual(0.15);
        expect(adsr.release).toBeLessThanOrEqual(0.8);
        expect(portamento).toBe(0.1);
        expect(filterFreq).toBeGreaterThanOrEqual(500);
        expect(filterFreq).toBeLessThanOrEqual(600);
        expect(filterQ).toBe(5);
        for (const layer of layers ?? []) expect(layer.gain).toBeGreaterThanOrEqual(1.1);
        for (const target of ROBOT_LFO_TARGET_IDS) {
          const link = robot.lfoLinks[target];
          if (target === 'bus.frequency') {
            expect(link.lane, target).not.toBeNull();
            expect(link.depth, target).toBeGreaterThanOrEqual(30);
            expect(link.depth, target).toBeLessThanOrEqual(40);
          } else if (target.endsWith('.gain')) {
            expect(link.lane, target).not.toBeNull();
            expect(link.depth, target).toBeGreaterThanOrEqual(50);
          } else {
            expect(link, target).toEqual({ lane: null, depth: 0 });
          }
        }
      }
      // The parity-fixture rule: the same noise under Classic breaks every bound somewhere, so no check passes by coincidence.
      expect(classic.some((r) => r.rhythmicDensity < 90)).toBe(true);
      expect(classic.some((r) => r.pitchRepeat > 5)).toBe(true);
      expect(classic.some((r) => ![3, 4].includes(r.rhythmicMotifLength.value))).toBe(true);
      expect(classic.some((r) => r.noteVariance.active)).toBe(true);
      expect(classic.some((r) => r.dynamics > 5 && r.rests < 90 && r.accents > 5)).toBe(true);
      expect(classic.some((r) => r.audioAttributes.adsr.attack < 1.5)).toBe(true);
      expect(classic.some((r) => r.audioAttributes.adsr.decay > 1.2)).toBe(true);
      expect(classic.some((r) => r.audioAttributes.adsr.release > 0.8)).toBe(true);
      expect(classic.some((r) => r.audioAttributes.portamento === 0)).toBe(true);
      expect(classic.some((r) => r.audioAttributes.filterQ === 1)).toBe(true);
      expect(classic.some((r) => (r.audioAttributes.layers ?? []).some((layer) => layer.gain === 0))).toBe(true);
      expect(classic.some((r) => ROBOT_LFO_TARGET_IDS.some((t) => t.endsWith('.gain') && r.lfoLinks[t].lane === null))).toBe(true);
      expect(classic.some((r) => ROBOT_LFO_TARGET_IDS.some((t) => t.endsWith('.detune') && r.lfoLinks[t].lane !== null))).toBe(true);
    });

    it('spawnRobot draws under the installed table too, the master volume included', () => {
      const localeId = 'band-table-t21-locale';
      freshLocale(localeId, { x: 7, y: 11 });
      withLoading(PERILOUS, () => {
        for (let i = 0; i < 6; i++) spawnRobot(localeId);
      });
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(robots).toHaveLength(6);
      for (const robot of robots) {
        expectThemedFields(robot);
        // 0.9 seeded, then the register bias (at most -0.075) and the clamp: never under 0.825 on the 1 % grid.
        expect(robot.masterVolume).toBeGreaterThanOrEqual(0.82);
        expect(robot.audioAttributes.portamento).toBe(0.1);
        expect(robot.audioAttributes.filterQ).toBe(5);
      }
    });

    it('spawnRobot with no locale (no noise map) draws its alea fallbacks inside the installed bands', () => {
      const added: Robot[] = [];
      const realAddRobot = useLocaleStore.getState().addRobot;
      useLocaleStore.setState({ addRobot: (_localeId, robot) => { added.push(robot); } });
      try {
        withLoading(PERILOUS, () => {
          for (let i = 0; i < 20; i++) spawnRobot(`band-table-t21-no-locale-${i}`);
        });
      } finally {
        useLocaleStore.setState({ addRobot: realAddRobot });
      }
      expect(added).toHaveLength(20);
      for (const robot of added) {
        expectThemedFields(robot);
        expect(robot.masterVolume).toBeGreaterThanOrEqual(0.82);
      }
    });

    it('spawnRobot with no locale (no noise map) narrows its alea density to its attack too (the attack rail)', () => {
      const added: Robot[] = [];
      const realAddRobot = useLocaleStore.getState().addRobot;
      useLocaleStore.setState({ addRobot: (_localeId, robot) => { added.push(robot); } });
      try {
        for (let i = 0; i < 20; i++) spawnRobot(`attack-rail-no-locale-${i}`);
      } finally {
        useLocaleStore.setState({ addRobot: realAddRobot });
      }
      const caps = added.map((robot) => audibleDensityBand(CLASSIC['robot.rhythmicDensity'], robot.audioAttributes.adsr.attack, CLASSIC.bpm).max);
      expect(caps.some((cap) => cap < 50)).toBe(true); // precondition: the fallback attack is slow enough to bind
      added.forEach((robot, i) => expect(robot.rhythmicDensity, robot.id).toBeLessThanOrEqual(Math.ceil(caps[i])));
    });

    it('reads the table at the draw, never caching it: after withLoading the same noise seeds Classic again', () => {
      const before = generateRobotRosterBaseline(noiseMap, 3);
      withLoading(PERILOUS, () => generateRobotRosterBaseline(noiseMap, 3));
      expect(generateRobotRosterBaseline(noiseMap, 3)).toEqual(before);
    });

    // Classic parity (spec §5.2): the values the constants seeded on main at cc9a01f2, captured before the lift and typed in,
    // then re-captured from the generator at each Even Seeded Draws switch (docs/tasks/EVEN_SEEDED_DRAWS.md) for the
    // fields that switch moved, and again when Attack and Release took their slider floors (15 ms, 20 ms; 2026-11-04), and
    // for accents when Classic's band moved to 0-30 (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md R4), and for the densities
    // the attack rail narrowed (audibleDensityBand: robots 0, 1 and 4 at attack 0.70 s 2 -> 1, robot 50 at 1.86 s 90 -> 14).
    const PARITY_ROSTER: Omit<RobotAudioBaseline, 'name'>[] = [
      {
        audioAttributes: {
          adsr: { attack: 0.7031522855150979, decay: 1.000850616954267, sustain: 0.8231706575024873, release: 0.42179932110011575, attackCurve: 'linear', releaseCurve: 'sine' },
          octaveRange: [5, 7], filterFreq: 3890.894716139883, filterQ: 1, filterType: 'lowpass', portamento: 0, waveform: 'triangle', phase: 244, detune: 2, pulseWidth: 0.2865218424703926,
          layers: [{ type: 'triangle', gain: 0.59, detune: -1, phase: 336 }, { type: 'square', gain: 0, detune: -1, phase: 293 }, { type: 'triangle', gain: 0, detune: 2, phase: 137 }],
        } as AudioAttributes,
        octaveRange: [5, 7], rhythmicDensity: 1, rhythmicMotifLength: { active: true, value: 5 }, noteVariance: { active: true, value: 7 }, pitchRepeat: 98, dynamics: 78, rests: 5, accents: 16,
        lfoLinks: { 'layer0.gain': { lane: 'b', depth: 4 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } },
        reverbSend: 0.37, delaySend: 0.02, gritSend: 0, shimmerSend: 0, doubleSend: 0, masterVolume: 0.7,
      },
      // Re-captured at Company Families Task 5: robot 1 was a copy of robot 0 under the retired copy roll; a roster of three
      // makes no company, so it is an original now, drawn at its own index.
      {
        audioAttributes: {
          adsr: { attack: 0.9792626317334362, decay: 0.5848182141780853, sustain: 0.596685036085546, release: 0.553829893572256, attackCurve: 'linear', releaseCurve: 'linear' },
          octaveRange: [2, 4], filterFreq: 3606.9838404655457, filterQ: 1, filterType: 'lowpass', portamento: 0, waveform: 'sawtooth', phase: 186, detune: 2, pulseWidth: 0.6713095553684979,
          layers: [{ type: 'sawtooth', gain: 0.71, detune: 0, phase: 342 }, { type: 'sawtooth', gain: 0, detune: 0, phase: 298 }, { type: 'triangle', gain: 0.79, detune: 0, phase: 27 }],
        } as AudioAttributes,
        octaveRange: [2, 4], rhythmicDensity: 25, rhythmicMotifLength: { active: true, value: 6 }, noteVariance: { active: true, value: 3 }, pitchRepeat: 67, dynamics: 77, rests: 1, accents: 8,
        lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: 'a', depth: 52 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } },
        reverbSend: 0.51, delaySend: 0, gritSend: 0, shimmerSend: 0, doubleSend: 0, masterVolume: 0.78,
      },
      {
        audioAttributes: {
          adsr: { attack: 0.18067437785910445, decay: 1.240191656164825, sustain: 0.3301627195905894, release: 1.3604276561923325, attackCurve: 'linear', releaseCurve: 'linear' },
          octaveRange: [2, 4], filterFreq: 2273.244400974363, filterQ: 1, filterType: 'lowpass', portamento: 0, waveform: 'sine', phase: 68, detune: -1, pulseWidth: 0.6791183213936165,
          layers: [{ type: 'triangle', gain: 0.52, detune: 0, phase: 298 }, { type: 'pulse', gain: 0, detune: 0, phase: 302 }, { type: 'triangle', gain: 0, detune: 1, phase: 342 }],
        } as AudioAttributes,
        octaveRange: [2, 4], rhythmicDensity: 40, rhythmicMotifLength: { active: true, value: 6 }, noteVariance: { active: true, value: 1 }, pitchRepeat: 14, dynamics: 64, rests: 7, accents: 4,
        lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: 'c', depth: 3 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: 'd', depth: 27 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } },
        reverbSend: 0.33, delaySend: 0, gritSend: 0, shimmerSend: 0, doubleSend: 0, masterVolume: 0.83,
      },
    ];

    it('Classic parity: a fixed roster baseline is value for value what the constants seeded before the lift (a glider, a quiet layer, lit gain and detune links among them)', () => {
      const roster = generateRobotRosterBaseline(createNoise2D(alea('band-table-parity')), 3).map(({ name: _name, ...rest }) => rest);
      expect(roster).toEqual(PARITY_ROSTER);
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R27: the three above are plain, so they miss the tiers. Three robots of a
    // roster from the same noise, captured at cc9a01f2 the same way and typed in (robots 3, 4 and 28 of 29), then
    // re-captured at each Even Seeded Draws switch, which moves the tiers between robots: a shaped release (sine) with an
    // exclusive send (shimmer) (4), a shaped attack (ripple) on a lowpass accent with grit (11), and the bandpass accent,
    // a glider with shimmer (50; at T9 no robot of the first 29 was bandpass, so the roster grew to 51). Re-captured at
    // Company Families Task 5, which ends "a roster's earlier robots never depend on its length" (the companies are drawn
    // over the roster): robot 4, a copy of robot 0 under the retired copy roll, is an original now (a shaped release,
    // bounce, with shimmer); robot 11 is a company member, so its tiers moved to two originals, 13 (a lowpass accent with
    // grit) and 14 (a shaped attack, ripple, with grit); robot 50 moved one LFO lane (layer1.gain c -> b), the tally now
    // counting the members' inherited links.
    const PARITY_TIERS: Record<number, Omit<RobotAudioBaseline, 'name'>> = {
      4: {
        audioAttributes: {
          adsr: { attack: 1.956759051894769, decay: 1.9473565462976694, sustain: 0.7924570618197322, release: 0.7145893696229906, attackCurve: 'linear', releaseCurve: 'bounce' },
          octaveRange: [4, 6], filterFreq: 6702.621109783649, filterQ: 1, filterType: 'lowpass', portamento: 0, waveform: 'sawtooth', phase: 97, detune: 0, pulseWidth: 0.05575906191952527,
          layers: [{ type: 'triangle', gain: 0.67, detune: -1, phase: 359 }, { type: 'triangle', gain: 0.77, detune: -1, phase: 215 }, { type: 'pulse', gain: 0, detune: 1, phase: 118 }],
        } as AudioAttributes,
        octaveRange: [4, 6], rhythmicDensity: 14, rhythmicMotifLength: { active: true, value: 8 }, noteVariance: { active: true, value: 2 }, pitchRepeat: 94, dynamics: 65, rests: 2, accents: 21,
        lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: 'd', depth: 3 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: 'd', depth: 4 } },
        reverbSend: 0.23, delaySend: 0, gritSend: 0, shimmerSend: 0.36, doubleSend: 0, masterVolume: 0.82,
      },
      13: {
        audioAttributes: {
          adsr: { attack: 1.8065845173585695, decay: 1.2646829038858414, sustain: 0.36252002697438, release: 0.3111372747505084, attackCurve: 'linear', releaseCurve: 'linear' },
          octaveRange: [4, 6], filterFreq: 1671.2479102658108, filterQ: 7.8, filterType: 'lowpass', portamento: 0, waveform: 'square', phase: 309, detune: 2, pulseWidth: 0.7197142589138821,
          layers: [{ type: 'square', gain: 1.11, detune: 0, phase: 154 }, { type: 'sawtooth', gain: 1.02, detune: 0, phase: 34 }, { type: 'triangle', gain: 0, detune: 1, phase: 7 }],
        } as AudioAttributes,
        octaveRange: [4, 6], rhythmicDensity: 5, rhythmicMotifLength: { active: true, value: 3 }, noteVariance: { active: true, value: 5 }, pitchRepeat: 10, dynamics: 64, rests: 7, accents: 24,
        lfoLinks: { 'layer0.gain': { lane: 'a', depth: 32 }, 'layer0.detune': { lane: 'b', depth: 2 }, 'layer1.gain': { lane: null, depth: 0 }, 'layer1.detune': { lane: 'b', depth: 3 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } },
        reverbSend: 0.35, delaySend: 0, gritSend: 0.41, shimmerSend: 0, doubleSend: 0, masterVolume: 0.76,
      },
      14: {
        audioAttributes: {
          adsr: { attack: 0.14344633669126777, decay: 0.250333690084517, sustain: 0.5130676552653313, release: 0.46280183186754587, attackCurve: 'ripple', releaseCurve: 'step' },
          octaveRange: [5, 7], filterFreq: 4020.2904902398586, filterQ: 1, filterType: 'lowpass', portamento: 0, waveform: 'pulse', phase: 124, detune: -2, pulseWidth: 0.4857038651360198,
          layers: [{ type: 'square', gain: 0.69, detune: 1, phase: 119 }, { type: 'square', gain: 0, detune: 0, phase: 222 }, { type: 'sine', gain: 0.33, detune: 1, phase: 37 }],
        } as AudioAttributes,
        octaveRange: [5, 7], rhythmicDensity: 32, rhythmicMotifLength: { active: true, value: 2 }, noteVariance: { active: true, value: 5 }, pitchRepeat: 8, dynamics: 67, rests: 4, accents: 16,
        lfoLinks: { 'layer0.gain': { lane: null, depth: 0 }, 'layer0.detune': { lane: 'c', depth: 3 }, 'layer1.gain': { lane: 'a', depth: 14 }, 'layer1.detune': { lane: 'a', depth: 1 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: 'd', depth: 5 }, 'bus.frequency': { lane: null, depth: 0 } },
        reverbSend: 0.46, delaySend: 0, gritSend: 0.71, shimmerSend: 0, doubleSend: 0, masterVolume: 0.73,
      },
      50: {
        audioAttributes: {
          adsr: { attack: 1.8618122535315342, decay: 1.7409854433499277, sustain: 0.36384062259458005, release: 1.6627617875812575, attackCurve: 'linear', releaseCurve: 'linear' },
          octaveRange: [4, 6], filterFreq: 981.7550272680819, filterQ: 5.9, filterType: 'bandpass', portamento: 0.08, waveform: 'sawtooth', phase: 16, detune: -2, pulseWidth: 0.15774889986496418,
          layers: [{ type: 'sawtooth', gain: 0.98, detune: -1, phase: 125 }, { type: 'sine', gain: 0.74, detune: 0, phase: 5 }, { type: 'triangle', gain: 0, detune: 0, phase: 329 }],
        } as AudioAttributes,
        octaveRange: [4, 6], rhythmicDensity: 14, rhythmicMotifLength: { active: true, value: 5 }, noteVariance: { active: true, value: 2 }, pitchRepeat: 17, dynamics: 65, rests: 3, accents: 23,
        lfoLinks: { 'layer0.gain': { lane: 'c', depth: 46 }, 'layer0.detune': { lane: null, depth: 0 }, 'layer1.gain': { lane: 'b', depth: 7 }, 'layer1.detune': { lane: null, depth: 0 }, 'layer2.gain': { lane: null, depth: 0 }, 'layer2.detune': { lane: null, depth: 0 }, 'bus.frequency': { lane: null, depth: 0 } },
        reverbSend: 0.1, delaySend: 0.29, gritSend: 0, shimmerSend: 0.26, doubleSend: 0, masterVolume: 0.73,
      },
    };

    it('Classic parity, the tiers: a shaped stage, a lowpass and the bandpass accent and an exclusive send are value for value what the generator seeds', () => {
      const roster = generateRobotRosterBaseline(createNoise2D(alea('band-table-parity')), 51).map(({ name: _name, ...rest }) => rest);
      expect({ 4: roster[4], 13: roster[13], 14: roster[14], 50: roster[50] }).toEqual(PARITY_TIERS);
    });

    it('Classic parity: three spawned robots carry the ids, master volumes, densities and glides the constants seeded before the lift', () => {
      const localeId = 'band-table-parity-locale';
      freshLocale(localeId, { x: 7, y: 11 });
      for (let i = 0; i < 3; i++) spawnRobot(localeId);
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(robots.map((r) => [r.id, r.masterVolume, r.rhythmicDensity, r.audioAttributes.portamento])).toEqual([
        // The densities re-captured at the attack rail (82 -> 14). Robots 1 and 2 re-captured at Company Families Task 5:
        // they were copies of robot 0 under the retired copy roll (0.76, 14, 0.18 and 0.73, 14, 0.18); a robot spawned
        // alone is an original now.
        ['robot-0-ckli2vjx', 0.75, 14, 0.18],
        ['robot-1-a9g7kk48', 0.71, 13, 0],
        ['robot-2-mrmqcepa', 0.68, 98, 0.14],
      ]);
    });
  });

  describe('the sends read the band table (band-table T22, spec assumption 15)', () => {
    const ADVENTUROUS = { theme: 'undertow', aspects: {} } as const;
    const BOLD = { theme: 'anchor', aspects: {} } as const;
    const noiseMap = createNoise2D(alea('band-table-t22'));

    afterEach(async () => {
      await restoreSeededDraws();
    });

    it('generateRobotSends under the installed table: no reverb, a delay of 0.3 and a grit of 0.5 on every robot, where Classic varies', () => {
      const themed = withLoading(ADVENTUROUS, () => Array.from({ length: 20 }, (_, i) => generateRobotSends(noiseMap, i)));
      const classic = Array.from({ length: 20 }, (_, i) => generateRobotSends(noiseMap, i));
      for (const sends of themed) {
        expect(reverbAndDelay(sends)).toEqual({ reverbSend: 0, delaySend: 0.3 });
        expect(effectSends(sends)).toEqual({ gritSend: 0.5, shimmerSend: 0, doubleSend: 0 });
      }
      expect(classic.every((sends) => sends.reverbSend > 0)).toBe(true);
      expect(classic.some((sends) => sends.delaySend !== 0.3)).toBe(true);
      expect(classic.some((sends) => sends.gritSend === 0)).toBe(true);
    });

    it('honours the Reverb row\'s lit share as the Delay row\'s: a quiet roll under 1 - lit seeds 0, at it the band value; Classic\'s lit of 1 is never quiet', async () => {
      const force = (quiet: number) => forceSeededDraws({ 'robot.send.reverb.quiet': quiet });
      await force(0.49);
      expect(withLoading(BOLD, () => generateRobotSends(noiseMap, 0)).reverbSend).toBe(0);
      expect(generateRobotSends(noiseMap, 0).reverbSend).toBeGreaterThan(0);
      await force(0.5);
      expect(withLoading(BOLD, () => generateRobotSends(noiseMap, 0)).reverbSend).toBeGreaterThan(0);
      await force(0);
      expect(generateRobotSends(noiseMap, 0).reverbSend).toBeGreaterThan(0);
    });

    it('rolls the reverb quiet draw on every robot at its own dataId, so the draw set never depends on the band', () => {
      // The even draw since Even Seeded Draws T9a.
      vi.mocked(getUniformSeededVal).mockClear();
      generateRobotSends(noiseMap, 4);
      const classicIds = vi.mocked(getUniformSeededVal).mock.calls.map((c) => String(c[1])).sort();
      expect(classicIds).toContain('robot.send.reverb.quiet');
      vi.mocked(getUniformSeededVal).mockClear();
      withLoading(ADVENTUROUS, () => generateRobotSends(noiseMap, 4));
      expect(vi.mocked(getUniformSeededVal).mock.calls.map((c) => String(c[1])).sort()).toEqual(classicIds);
    });

    it('spawnRobot stores the themed sends', () => {
      const localeId = 'band-table-t22-locale';
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: 5, y: 9 }, robots: [] } },
      }));
      withLoading(ADVENTUROUS, () => {
        for (let i = 0; i < 4; i++) spawnRobot(localeId);
      });
      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(robots).toHaveLength(4);
      for (const robot of robots) {
        expect(reverbAndDelay(robot)).toEqual({ reverbSend: 0, delaySend: 0.3 });
        expect(effectSends(robot)).toEqual({ gritSend: 0.5, shimmerSend: 0, doubleSend: 0 });
      }
    });

    it('spawnRobot with no locale (no noise map) draws its alea fallbacks inside the installed send bands', () => {
      const added: Robot[] = [];
      const realAddRobot = useLocaleStore.getState().addRobot;
      useLocaleStore.setState({ addRobot: (_localeId, robot) => { added.push(robot); } });
      try {
        withLoading(ADVENTUROUS, () => {
          for (let i = 0; i < 10; i++) spawnRobot(`band-table-t22-no-locale-${i}`);
        });
      } finally {
        useLocaleStore.setState({ addRobot: realAddRobot });
      }
      expect(added).toHaveLength(10);
      for (const robot of added) {
        expect(reverbAndDelay(robot)).toEqual({ reverbSend: 0, delaySend: 0.3 });
        expect(effectSends(robot)).toEqual({ gritSend: 0.5, shimmerSend: 0, doubleSend: 0 });
      }
    });
  });

  // band-table T27 (docs/specs/OFF_SCREEN.md assumptions 21, 22 and 24): the deal pass, live and in the baseline.
  describe('the deal pass (band-table T27)', () => {
    const noiseMap = createNoise2D(alea('band-table-t27'));
    const ROSTER = 12;
    const ids = Array.from({ length: ROSTER }, (_, i) => `robot-${i}`);
    const HYPNOTIC_MECHANICAL: LoadingIdentity = { theme: 'classic', aspects: { melody: ['hypnotic', 'mechanical'] } };
    /** Company members of this roster, by index, to their founders (Company Families Task 5). */
    const MEMBERS = companyFounders(generateCompanyMembership(noiseMap, ROSTER));
    const melodyFieldsOf = (robot: Pick<Robot, 'rhythmicDensity' | 'rhythmicMotifLength' | 'noteVariance' | 'pitchRepeat'>) => ({
      rhythmicDensity: robot.rhythmicDensity,
      rhythmicMotifLength: robot.rhythmicMotifLength,
      noteVariance: robot.noteVariance,
      pitchRepeat: robot.pitchRepeat,
    });
    const freshLocale = (localeId: string, coordinates: { x: number; y: number }) =>
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates, robots: [], companies: [] } },
      }));

    afterEach(async () => {
      useLoadingStore.getState().setLoading(DEFAULT_LOADING);
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation(real);
      vi.restoreAllMocks();
    });

    it('applyDealToBaselines: a dealt robot\'s four Melody fields are re-derived from its own index under the aspect\'s bands, loadedUnder is set, and nothing else moves', () => {
      const undealt = generateRobotRosterBaseline(noiseMap, ROSTER);
      const companies = generateCompanyRosterBaseline(noiseMap, ids);
      const dealt = applyDealToBaselines(undealt, ids, companies, HYPNOTIC_MECHANICAL, noiseMap);
      expect(dealt).toHaveLength(ROSTER);
      expect(dealt.some((b) => b.loadedUnder?.melody === 'hypnotic')).toBe(true);
      expect(dealt.some((b) => b.loadedUnder?.melody === 'mechanical')).toBe(true);
      dealt.forEach((baseline, i) => {
        const { rhythmicDensity: _d, rhythmicMotifLength: _m, noteVariance: _v, pitchRepeat: _p, loadedUnder, ...rest } = baseline;
        const { rhythmicDensity: _ud, rhythmicMotifLength: _um, noteVariance: _uv, pitchRepeat: _up, ...restUndealt } = undealt[i];
        expect(rest, `robot ${i} outside the family`).toEqual(restUndealt);
        if (loadedUnder?.melody === 'hypnotic') {
          // A company member's density reads its founder's attack (the attack rail), which a fresh robot at its index does
          // not draw; Company Families Task 6 deals it from its founder's index instead.
          if (MEMBERS.has(i)) return;
          // Calm carries Hypnotic's column: a fresh robot at this index under Calm is the exact re-derivation.
          const expected = withLoading({ theme: 'float', aspects: {} }, () => generateRobotAudioBaseline(noiseMap, i, []));
          expect(melodyFieldsOf(baseline), `robot ${i}`).toEqual(melodyFieldsOf(expected));
        } else {
          expect(loadedUnder, `robot ${i}`).toEqual({ melody: 'mechanical' });
          // Mechanical's 70-95 as the robot's attack leaves it (the attack rail).
          const density = audibleDensityBand({ min: 70, max: 95 }, baseline.audioAttributes.adsr.attack, CLASSIC.bpm);
          expect(baseline.rhythmicDensity).toBe(Math.round(getUniformSeededVal(noiseMap, 'robot.rhythmicDensity', i, density.min, density.max)));
          expect(baseline.pitchRepeat).toBe(Math.round(getUniformSeededVal(noiseMap, 'robot.pitchRepeat', i, 0, 10)));
          expect(baseline.rhythmicMotifLength.active).toBe(true);
          expect([6, 7, 8]).toContain(baseline.rhythmicMotifLength.value);
          // The band Mechanical leaves alone is still re-derived from the robot's own index, under Classic's band.
          expect(baseline.noteVariance).toEqual(generateRobotAudioBaseline(noiseMap, i, []).noteVariance);
        }
      });
    });

    // The as-theme member and its "plain groups" case are gone (docs/tasks/OFF_SCREEN_REVISIONS.md Task 6): every group is
    // dealt one of the picks, and only an empty list leaves the roster plain.
    it('with no picks the pass is a no-op: the same array comes back', () => {
      const undealt = generateRobotRosterBaseline(noiseMap, ROSTER);
      const companies = generateCompanyRosterBaseline(noiseMap, ids);
      expect(applyDealToBaselines(undealt, ids, companies, { theme: 'classic', aspects: {} }, noiseMap)).toBe(undealt);
      expect(applyDealToBaselines(undealt, ids, companies, { theme: 'classic', aspects: { melody: [] } }, noiseMap)).toBe(undealt);
    });

    // Company Families Task 5: a company member (was: a copied robot) is still dealt from its own index; Task 6 deals it
    // from its founder's.
    it('a member\'s baseline re-derives from its own index, not its founder\'s', async () => {
      // Each index's density draw lands at its own spot (index / roster of the band), so a member and its founder draw
      // apart by construction and the check cannot pass by coincidence.
      await forceSeededDraws({
        'robot.rhythmicDensity': (min, max, offset) => min + (offset / ROSTER) * (max - min),
      });
      try {
        const undealt = generateRobotRosterBaseline(noiseMap, ROSTER);
        const [member, founder] = [...MEMBERS][0];
        expect(undealt[member].rhythmicDensity).toBe(undealt[founder].rhythmicDensity); // precondition: a member
        const companies = generateCompanyRosterBaseline(noiseMap, ids);
        const dealt = applyDealToBaselines(undealt, ids, companies, { theme: 'classic', aspects: { melody: ['hypnotic'] } }, noiseMap);
        expect(dealt[member].loadedUnder).toEqual({ melody: 'hypnotic' });
        // Hypnotic's 40-60 as the shared attack leaves it (the attack rail), at each robot's own index.
        const band = audibleDensityBand({ min: 40, max: 60 }, undealt[founder].audioAttributes.adsr.attack, CLASSIC.bpm);
        const at = (index: number) => Math.round(band.min + (index / ROSTER) * (band.max - band.min));
        expect(at(member)).not.toBe(at(founder));
        expect(dealt[member].rhythmicDensity).toBe(at(member));
        expect(dealt[founder].rhythmicDensity).toBe(at(founder));
      } finally {
        await restoreSeededDraws();
      }
    });

    it('generateDealtRosterBaseline is the roster and company baselines with the deal applied', () => {
      const { robots, companies } = generateDealtRosterBaseline(noiseMap, ids, HYPNOTIC_MECHANICAL);
      expect(companies).toEqual(generateCompanyRosterBaseline(noiseMap, ids));
      expect(robots).toEqual(applyDealToBaselines(generateRobotRosterBaseline(noiseMap, ROSTER), ids, companies, HYPNOTIC_MECHANICAL, noiseMap));
      expect(generateDealtRosterBaseline(noiseMap, ids, { theme: 'classic', aspects: {} }).robots).toEqual(generateRobotRosterBaseline(noiseMap, ROSTER));
    });

    it('applyAspectDeal, live: writes the dealt fields and loadedUnder through the store, regenerates and re-registers each dealt melody, and agrees with the dealt baseline field for field', () => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { melody: ['hypnotic'] } });
      const localeId = 'band-table-t27-live';
      freshLocale(localeId, { x: 7, y: 11 });
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const before = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(before.length).toBeGreaterThan(0);
      expect(before.every((r) => r.loadedUnder === undefined)).toBe(true);
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody');

      applyAspectDeal(localeId);

      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      for (const robot of robots) {
        expect(robot.loadedUnder).toEqual({ melody: 'hypnotic' });
        // Hypnotic's 40-60 as the robot's attack leaves it (the attack rail).
        const density = audibleDensityBand({ min: 40, max: 60 }, robot.audioAttributes.adsr.attack, CLASSIC.bpm);
        expect(robot.rhythmicDensity).toBeGreaterThanOrEqual(Math.floor(density.min));
        expect(robot.rhythmicDensity).toBeLessThanOrEqual(Math.ceil(density.max));
        expect(robot.noteVariance).toEqual({ active: true, value: expect.any(Number) });
        expect([1, 2]).toContain(robot.noteVariance?.value);
      }
      expect(register).toHaveBeenCalledTimes(robots.length);
      expect(robots.some((robot, i) => JSON.stringify(robot.melody) !== JSON.stringify(before[i].melody))).toBe(true);
      const { robots: baselines } = generateDealtRosterBaseline(getLocaleNoiseMap(localeId, 7, 11), robots.map((r) => r.id), useLoadingStore.getState());
      robots.forEach((robot, i) => {
        expect({ ...melodyFieldsOf(robot), loadedUnder: robot.loadedUnder }, `robot ${i}`).toEqual({ ...melodyFieldsOf(baselines[i]), loadedUnder: baselines[i].loadedUnder });
      });
    });

    it('applyAspectDeal with no picks touches nothing: no robot write, no re-registration, no loadedUnder', () => {
      const localeId = 'band-table-t27-live-none';
      freshLocale(localeId, { x: 7, y: 11 });
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const before = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody');
      applyAspectDeal(localeId);
      const after = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(after).toBe(before);
      expect(register).not.toHaveBeenCalled();
      for (const robot of after) expect(robot.loadedUnder).toBeUndefined();
    });
  });

  // docs/tasks/OFF_SCREEN_REVISIONS.md Task 8: the deal per family. Envelope re-derives the robot's adsr, Distance its sends,
  // each through the same draws spawn makes (deriveEnvelopeFields, deriveSendFields), under resolveBands(theme, aspect);
  // live, each dealt family is pushed to the engine as a hand edit would push it.
  describe('the deal pass per family (revisions Task 8)', () => {
    const noiseMap = createNoise2D(alea('revisions-t8'));
    const ROSTER = 12;
    const ids = Array.from({ length: ROSTER }, (_, i) => `robot-${i}`);
    const companies = generateCompanyRosterBaseline(noiseMap, ids);
    /** Company members of this roster, by index, to their founders (Company Families Task 5). */
    const MEMBERS = companyFounders(generateCompanyMembership(noiseMap, ROSTER));
    const deal = (aspects: LoadingIdentity['aspects'], theme: LoadingIdentity['theme'] = 'classic') => {
      const undealt = generateRobotRosterBaseline(noiseMap, ROSTER);
      return { undealt, dealt: applyDealToBaselines(undealt, ids, companies, { theme, aspects }, noiseMap) };
    };
    const sendsOf = (r: Pick<RobotAudioBaseline, 'reverbSend' | 'delaySend' | 'gritSend' | 'shimmerSend' | 'doubleSend'>) => ({
      reverbSend: r.reverbSend,
      delaySend: r.delaySend,
      gritSend: r.gritSend,
      shimmerSend: r.shimmerSend,
      doubleSend: r.doubleSend,
    });
    /** Every field but the adsr, the five sends and loadedUnder: what an Envelope or Distance deal must leave alone. */
    const restOf = (r: RobotAudioBaseline) => {
      const { reverbSend: _r, delaySend: _d, gritSend: _g, shimmerSend: _s, doubleSend: _o, loadedUnder: _l, audioAttributes, ...rest } = r;
      const { adsr: _a, ...attributes } = audioAttributes;
      return { ...rest, attributes };
    };
    const freshLocale = (localeId: string, coordinates: { x: number; y: number }) =>
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates, robots: [], companies: [] } },
      }));

    afterEach(async () => {
      useLoadingStore.getState().setLoading(DEFAULT_LOADING);
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation(real);
      vi.restoreAllMocks();
    });

    it('generateAudioAttributes draws its adsr through deriveEnvelopeFields under the installed bands, value for value', () => {
      for (let i = 0; i < 6; i++) {
        expect(generateAudioAttributes(noiseMap, i).adsr).toEqual(deriveEnvelopeFields(noiseMap, i, resolveBands('classic', {})));
      }
      const perilous = withLoading({ theme: 'shatter', aspects: {} }, () => generateAudioAttributes(noiseMap, 2).adsr);
      expect(perilous).toEqual(deriveEnvelopeFields(noiseMap, 2, resolveBands('shatter', {})));
    });

    it('generateRobotSends is deriveSendFields under the installed bands, value for value', () => {
      for (let i = 0; i < 6; i++) expect(generateRobotSends(noiseMap, i)).toEqual(deriveSendFields(noiseMap, i, resolveBands('classic', {})));
      const adventurous = withLoading({ theme: 'undertow', aspects: {} }, () => generateRobotSends(noiseMap, 3));
      expect(adventurous).toEqual(deriveSendFields(noiseMap, 3, resolveBands('undertow', {})));
    });

    it('a robot dealt Plucked has the adsr deriveEnvelopeFields draws at its index under Plucked, and the density its attack allows; its sends and every other field are untouched', () => {
      const { undealt, dealt } = deal({ envelope: ['plucked'] });
      const bands = resolveBands('classic', { envelope: 'plucked' });
      dealt.forEach((baseline, i) => {
        expect(baseline.loadedUnder, `robot ${i}`).toEqual({ envelope: 'plucked' });
        expect(baseline.audioAttributes.adsr, `robot ${i}`).toEqual(deriveEnvelopeFields(noiseMap, i, bands));
        expect(baseline.audioAttributes.adsr.attack, `robot ${i}`).toBeLessThanOrEqual(0.04);
        // The attack rail: the density re-drawn at its index under Classic's band against the plucked attack.
        expect(baseline.rhythmicDensity, `robot ${i}`).toBe(deriveRhythmicDensity(noiseMap, i, resolveBands('classic', {}), baseline.audioAttributes.adsr.attack));
        expect(sendsOf(baseline), `robot ${i}`).toEqual(sendsOf(undealt[i]));
        const { rhythmicDensity: _dealt, ...rest } = restOf(baseline);
        const { rhythmicDensity: _undealt, ...restUndealt } = restOf(undealt[i]);
        expect(rest, `robot ${i}`).toEqual(restUndealt);
      });
      // A slow Classic attack had narrowed some robot's density; the pluck frees it.
      expect(dealt.some((b, i) => b.rhythmicDensity > undealt[i].rhythmicDensity)).toBe(true);
      // The parity rule: Classic's own draws break the pluck somewhere, so the equality cannot hold by coincidence.
      expect(undealt.some((b) => b.audioAttributes.adsr.attack > 0.04)).toBe(true);
    });

    it('a robot dealt Echoing has the sends deriveSendFields draws at its index under Echoing; its adsr and every other field are untouched', () => {
      const { undealt, dealt } = deal({ distance: ['echoing'] });
      const bands = resolveBands('classic', { distance: 'echoing' });
      dealt.forEach((baseline, i) => {
        expect(baseline.loadedUnder, `robot ${i}`).toEqual({ distance: 'echoing' });
        expect(sendsOf(baseline), `robot ${i}`).toEqual(deriveSendFields(noiseMap, i, bands));
        // Echoing's sheet: every probe deep in the delay, only lightly in the reverb.
        expect(baseline.delaySend, `robot ${i}`).toBeGreaterThanOrEqual(0.4);
        expect(baseline.reverbSend, `robot ${i}`).toBeLessThanOrEqual(0.15);
        // The three effect room sends are the theme's: re-derived, they come out as they were. Not yet on a company member,
        // which carries its founder's sends but is dealt from its own index until Company Families Task 6.
        const { gritSend, shimmerSend, doubleSend } = undealt[i];
        if (!MEMBERS.has(i)) {
          expect({ gritSend: baseline.gritSend, shimmerSend: baseline.shimmerSend, doubleSend: baseline.doubleSend }).toEqual({ gritSend, shimmerSend, doubleSend });
        }
        expect(baseline.audioAttributes.adsr, `robot ${i}`).toEqual(undealt[i].audioAttributes.adsr);
        expect(restOf(baseline), `robot ${i}`).toEqual(restOf(undealt[i]));
      });
      expect(undealt.some((b) => b.delaySend < 0.4)).toBe(true);
    });

    it('the deal reads every band from its own theme, never the installed context: Half-heard under Undertow (injected) carries Undertow\'s grit while Classic is loaded', () => {
      expect(useLoadingStore.getState().theme).toBe('classic');
      const { dealt } = deal({ distance: ['halfHeard'] }, 'undertow');
      dealt.forEach((baseline, i) => {
        expect(sendsOf(baseline), `robot ${i}`).toEqual(deriveSendFields(noiseMap, i, resolveBands('undertow', { distance: 'halfHeard' })));
        // This file's Undertow (injected) seeds a grit of exactly 0.5 on every robot; Classic's lit share of 0.21 would leave most at 0.
        expect(baseline.gritSend, `robot ${i}`).toBe(0.5);
      });
    });

    it('a robot dealt one of each family carries all three, and loadedUnder has one key per dealt family', () => {
      const { dealt } = deal({ melody: ['hypnotic'], envelope: ['held'], distance: ['near'] });
      dealt.forEach((baseline, i) => {
        expect(baseline.loadedUnder, `robot ${i}`).toEqual({ melody: 'hypnotic', envelope: 'held', distance: 'near' });
        expect(baseline.audioAttributes.adsr).toEqual(deriveEnvelopeFields(noiseMap, i, resolveBands('classic', { envelope: 'held' })));
        expect(sendsOf(baseline)).toEqual(deriveSendFields(noiseMap, i, resolveBands('classic', { distance: 'near' })));
        // Calm carries Hypnotic's column in this file's mock: a fresh robot at this index under Calm is the Melody re-derivation.
        const expected = withLoading({ theme: 'float', aspects: {} }, () => generateRobotAudioBaseline(noiseMap, i, []));
        // The density is Hypnotic's draw against Held's attack (the attack rail), not the spawn attack Float would read.
        const hypnotic = resolveBands('classic', { melody: 'hypnotic' });
        expect(baseline.rhythmicDensity).toBe(deriveRhythmicDensity(noiseMap, i, hypnotic, baseline.audioAttributes.adsr.attack));
        expect(baseline.noteVariance).toEqual(expected.noteVariance);
      });
      const { dealt: two } = deal({ envelope: ['swelling'], distance: ['echoing'] });
      for (const baseline of two) expect(Object.keys(baseline.loadedUnder ?? {}).sort()).toEqual(['distance', 'envelope']);
    });

    it('an aspect composes over the theme: Perilous plus Swelling takes Swelling\'s attack and sustain and Perilous\'s decay and release', () => {
      const { dealt } = deal({ envelope: ['swelling'] }, 'shatter');
      dealt.forEach((baseline, i) => {
        const { adsr } = baseline.audioAttributes;
        expect(adsr).toEqual(deriveEnvelopeFields(noiseMap, i, resolveBands('shatter', { envelope: 'swelling' })));
        // Perilous (this file's mock) seeds attacks of 1.5-2 s; Swelling's 0.3-1.2 wins.
        expect(adsr.attack, `robot ${i}`).toBeLessThanOrEqual(1.2);
        expect(adsr.decay, `robot ${i}`).toBeGreaterThanOrEqual(1);
        expect(adsr.decay, `robot ${i}`).toBeLessThanOrEqual(1.2);
        expect(adsr.sustain, `robot ${i}`).toBeGreaterThanOrEqual(0.7);
      });
    });

    // Company Families Task 5: a company member (was: a copied robot) is still dealt from its own index; Task 6 deals it
    // from its founder's.
    it('a member\'s baseline re-derives its adsr from its own index, keeping the rest of its founder\'s voice', () => {
      const undealt = generateRobotRosterBaseline(noiseMap, ROSTER);
      const [member, founder] = [...MEMBERS][0];
      expect(undealt[member].audioAttributes).toBe(undealt[founder].audioAttributes); // precondition: a member
      const bands = resolveBands('classic', { envelope: 'held' });
      const own = deriveEnvelopeFields(noiseMap, member, bands);
      expect(own).not.toEqual(deriveEnvelopeFields(noiseMap, founder, bands)); // precondition: the two indices draw apart
      const dealt = applyDealToBaselines(undealt, ids, companies, { theme: 'classic', aspects: { envelope: ['held'] } }, noiseMap);
      expect(dealt[member].audioAttributes.adsr).toEqual(own);
      expect(dealt[member].audioAttributes.waveform).toBe(undealt[founder].audioAttributes.waveform);
      expect(dealt[member].audioAttributes.layers).toEqual(undealt[founder].audioAttributes.layers);
    });

    it('applyAspectDeal, live: an Envelope deal writes each adsr and hands it to the engine as a hand edit does, once a robot, and agrees with the baseline', () => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { envelope: ['plucked', 'held'] } });
      const localeId = 'revisions-t8-live-envelope';
      freshLocale(localeId, { x: 7, y: 11 });
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const before = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});

      applyAspectDeal(localeId);

      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(envelope).toHaveBeenCalledTimes(robots.length);
      for (const robot of robots) expect(envelope).toHaveBeenCalledWith(robot.id, robot.audioAttributes.adsr);
      expect(sends).not.toHaveBeenCalled();
      // The attack rail: only a robot whose density the dealt attack moved regenerates its melody, once.
      const moved = robots.filter((robot, i) => robot.rhythmicDensity !== before[i].rhythmicDensity).map((r) => r.id);
      expect(register.mock.calls.map(([id]) => id).sort()).toEqual([...moved].sort());
      const { robots: baselines } = generateDealtRosterBaseline(getLocaleNoiseMap(localeId, 7, 11), robots.map((r) => r.id), useLoadingStore.getState());
      robots.forEach((robot, i) => {
        expect(robot.audioAttributes.adsr, `robot ${i}`).toEqual(baselines[i].audioAttributes.adsr);
        expect(robot.rhythmicDensity, `robot ${i}`).toBe(baselines[i].rhythmicDensity);
        expect(robot.loadedUnder, `robot ${i}`).toEqual(baselines[i].loadedUnder);
      });
      expect(new Set(robots.map((r) => r.loadedUnder?.envelope))).toEqual(new Set(['plucked', 'held']));
    });

    it('applyAspectDeal, live: a Distance deal writes each robot\'s sends and hands all five to the engine, once a robot, and agrees with the baseline', () => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { distance: ['echoing'] } });
      const localeId = 'revisions-t8-live-distance';
      freshLocale(localeId, { x: 7, y: 11 });
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});

      applyAspectDeal(localeId);

      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(sends).toHaveBeenCalledTimes(robots.length);
      for (const robot of robots) {
        expect(sends).toHaveBeenCalledWith(robot.id, robotSendLevels(robot));
        expect(robot.delaySend).toBeGreaterThanOrEqual(0.4);
      }
      expect(envelope).not.toHaveBeenCalled();
      const { robots: baselines } = generateDealtRosterBaseline(getLocaleNoiseMap(localeId, 7, 11), robots.map((r) => r.id), useLoadingStore.getState());
      robots.forEach((robot, i) => expect(sendsOf(robot), `robot ${i}`).toEqual(sendsOf(baselines[i])));
    });

    // docs/tasks/OFF_SCREEN_REVISIONS.md Task 10: the Voice family. The waveform draws read a PickBand; Classic's five equal
    // weights must reproduce Math.floor's index exactly, so every existing world keeps its waveforms.
    describe('Voice (revisions Task 10)', () => {
      const WAVEFORMS = ['sine', 'square', 'triangle', 'sawtooth', 'pulse'] as const;
      const CLASSIC_ACCENT = resolveBands('classic', {})['robot.accentFilterFreq'];
      const onlyWeight = (wave: (typeof WAVEFORMS)[number]) =>
        ({ weights: Object.fromEntries(WAVEFORMS.map((w) => [w, w === wave ? 1 : 0])) }) as BandTable['robot.waveform'];
      const voiceOf = (a: AudioAttributes) => ({
        waveform: a.waveform,
        filterFreq: a.filterFreq,
        filterQ: a.filterQ,
        filterType: a.filterType,
        layers: a.layers,
      });

      it('Classic parity: over 400 robots the base and the three layer waveforms are Math.floor of the even draw over [0, 5)', async () => {
        // The old draw was the plain getSeededVal over [0, 5]; Even Seeded Draws T6 made it the even one.
        const { getUniformSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const map = createNoise2D(alea('revisions-t10-parity'));
        const seen = new Set<string>();
        for (let i = 0; i < 400; i++) {
          const attrs = generateAudioAttributes(map, i);
          const base = WAVEFORMS[Math.min(4, Math.floor(real(map, 'robot.audio.waveform', i, 0, 5)))];
          expect(attrs.waveform, `robot ${i}`).toBe(base);
          seen.add(attrs.waveform);
          (attrs.layers ?? []).forEach((layer, l) => {
            expect(layer.type, `robot ${i} layer ${l}`).toBe(WAVEFORMS[Math.floor(real(map, 'robot.audio.layer.waveform', i * 10 + l, 0, 5))]);
          });
        }
        expect(seen.size).toBe(5); // every waveform drawn, so the check covers every edge
      });

      it('a PickBand of one waveform gives every robot and every layer that waveform', () => {
        for (const wave of WAVEFORMS) {
          const bands = { ...resolveBands('classic', {}), 'robot.waveform': onlyWeight(wave) };
          for (let i = 0; i < 40; i++) {
            const voice = deriveVoiceFields(noiseMap, i, bands);
            expect(voice.waveform, `${wave} robot ${i}`).toBe(wave);
            for (const layer of voice.layers ?? []) expect(layer.type, `${wave} robot ${i}`).toBe(wave);
          }
        }
      });

      it('a moved weight is applied: sine and pulse alone share the fleet, a zero-weight waveform never drawn', () => {
        const bands = {
          ...resolveBands('classic', {}),
          'robot.waveform': { weights: { sine: 1, square: 0, triangle: 0, sawtooth: 0, pulse: 1 } },
        };
        const drawn = Array.from({ length: 200 }, (_, i) => deriveVoiceFields(noiseMap, i, bands).waveform);
        expect(new Set(drawn)).toEqual(new Set(['sine', 'pulse']));
      });

      it('the draw spans the whole weight: two equal weights split 400 robots near half and half', () => {
        const map = createNoise2D(alea('revisions-t10-shares'));
        const bands = {
          ...resolveBands('classic', {}),
          'robot.waveform': { weights: { sine: 1, square: 1, triangle: 0, sawtooth: 0, pulse: 0 } },
        };
        const drawn = Array.from({ length: 400 }, (_, i) => deriveVoiceFields(map, i, bands).waveform);
        const sineShare = drawn.filter((w) => w === 'sine').length / drawn.length;
        expect(sineShare).toBeGreaterThan(0.35);
        expect(sineShare).toBeLessThan(0.65);
      });

      it('a draw at the very top of the weight lands on the last weighted waveform, never on a zero-weight one or off the end', async () => {
        const top = (_min: number, max: number) => max;
        await forceSeededDraws({ 'robot.audio.waveform': top, 'robot.audio.layer.waveform': top });
        try {
          const bands = { ...resolveBands('classic', {}), 'robot.waveform': { weights: { sine: 1, square: 2, triangle: 0, sawtooth: 0, pulse: 0 } } };
          const voice = deriveVoiceFields(noiseMap, 3, bands);
          expect(voice.waveform).toBe('square');
          for (const layer of voice.layers ?? []) expect(layer.type).toBe('square');
          expect(generateAudioAttributes(noiseMap, 3).waveform).toBe('pulse'); // Classic: the old clamp's last waveform
        } finally {
          await restoreSeededDraws();
        }
      });

      it('generateAudioAttributes draws its voice through deriveVoiceFields under the installed bands', () => {
        for (let i = 0; i < 6; i++) {
          expect(voiceOf(generateAudioAttributes(noiseMap, i))).toEqual(deriveVoiceFields(noiseMap, i, resolveBands('classic', {})));
        }
      });

      it('a robot dealt Woody has the waveform, filter and layers deriveVoiceFields draws under Woody; its adsr, sends and the rest untouched', () => {
        const { undealt, dealt } = deal({ voice: ['woody'] });
        const bands = resolveBands('classic', { voice: 'woody' });
        dealt.forEach((baseline, i) => {
          expect(baseline.loadedUnder, `robot ${i}`).toEqual({ voice: 'woody' });
          expect(voiceOf(baseline.audioAttributes), `robot ${i}`).toEqual(deriveVoiceFields(noiseMap, i, bands));
          // Everything outside the voice - the adsr, the register, the glide, the phase, detune and pulse width - as it was.
          const { filterFreq: _f, filterQ: _q, filterType: _t, waveform: _w, layers: _l, ...outside } = baseline.audioAttributes;
          const { filterFreq: _uf, filterQ: _uq, filterType: _ut, waveform: _uw, layers: _ul, ...outsideUndealt } = undealt[i].audioAttributes;
          expect(outside, `robot ${i}`).toEqual(outsideUndealt);
          expect(sendsOf(baseline)).toEqual(sendsOf(undealt[i]));
        });
        // The parity rule: Woody's bands move some robot off its Classic voice, so the equality cannot hold by coincidence.
        expect(dealt.some((b, i) => JSON.stringify(voiceOf(b.audioAttributes)) !== JSON.stringify(voiceOf(undealt[i].audioAttributes)))).toBe(true);
        // The bands themselves, not only the derivation: every open (non-accent, Q 1) robot's cutoff is inside Woody's
        // 1200-3500 Hz, where Classic's open band (2000-8000) put some above it.
        const open = dealt.filter((b) => b.audioAttributes.filterQ === 1);
        expect(open.length).toBeGreaterThan(0);
        for (const b of open) {
          expect(b.audioAttributes.filterFreq).toBeGreaterThanOrEqual(1200);
          expect(b.audioAttributes.filterFreq).toBeLessThanOrEqual(3500);
        }
        expect(undealt.some((b) => b.audioAttributes.filterQ === 1 && b.audioAttributes.filterFreq > 3500)).toBe(true);
        // And the layer gain: every sounding layer inside Woody's 0.6-1.0, where Classic's 0.2-1.2 put some outside it.
        const sounding = (b: RobotAudioBaseline) => (b.audioAttributes.layers ?? []).filter((layer) => layer.gain > 0);
        for (const b of dealt) {
          for (const layer of sounding(b)) {
            expect(layer.gain).toBeGreaterThanOrEqual(0.6);
            expect(layer.gain).toBeLessThanOrEqual(1);
          }
        }
        expect(undealt.some((b) => sounding(b).some((layer) => layer.gain < 0.6 || layer.gain > 1))).toBe(true);
      });

      it('a robot dealt Hollow takes Hollow\'s accent filter: every resonant robot inside its 600-2000 Hz cutoff and 6-12 Q', () => {
        const { dealt } = deal({ voice: ['hollow'] });
        const accents = dealt.filter((b) => b.audioAttributes.filterQ !== 1);
        expect(accents.length).toBeGreaterThan(0);
        for (const b of accents) {
          expect(b.audioAttributes.filterFreq).toBeGreaterThanOrEqual(600);
          expect(b.audioAttributes.filterFreq).toBeLessThanOrEqual(2000);
          expect(b.audioAttributes.filterQ).toBeGreaterThanOrEqual(6);
          expect(b.audioAttributes.filterQ).toBeLessThanOrEqual(12);
        }
        // The parity rule: Classic's accent band (400-2500 Hz, Q 3-8), at Hollow's accent share, lands some robot outside
        // Hollow's, so the bounds above cannot hold by coincidence.
        const classicAtHollowShare = { ...resolveBands('classic', {}), 'robot.accentFilterFreq': { ...CLASSIC_ACCENT, lit: 0.45 } };
        const classicAccents = dealt.map((_, i) => deriveVoiceFields(noiseMap, i, classicAtHollowShare)).filter((v) => v.filterQ !== 1);
        expect(classicAccents.some((v) => v.filterFreq < 600 || v.filterFreq > 2000 || (v.filterQ ?? 0) < 6)).toBe(true);
      });

      it('a robot dealt Held and Woody carries both: the Held adsr and the Woody voice in one set of audio attributes', () => {
        const { dealt } = deal({ envelope: ['held'], voice: ['woody'] });
        dealt.forEach((baseline, i) => {
          expect(baseline.loadedUnder, `robot ${i}`).toEqual({ envelope: 'held', voice: 'woody' });
          expect(baseline.audioAttributes.adsr).toEqual(deriveEnvelopeFields(noiseMap, i, resolveBands('classic', { envelope: 'held' })));
          expect(voiceOf(baseline.audioAttributes)).toEqual(deriveVoiceFields(noiseMap, i, resolveBands('classic', { voice: 'woody' })));
        });
      });

      it('applyAspectDeal, live: a Voice deal rebuilds each voice from the store and re-primes its links, as a structural edit does', () => {
        useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { voice: ['glassy', 'hollow'] } });
        const localeId = 'revisions-t10-live-voice';
        freshLocale(localeId, { x: 7, y: 11 });
        spawnInitialRoster(localeId);
        spawnInitialCompanies(localeId);
        const rebuild = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
        const prime = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});
        const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});

        applyAspectDeal(localeId);

        const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
        expect(rebuild).toHaveBeenCalledTimes(robots.length);
        expect(prime).toHaveBeenCalledTimes(robots.length);
        for (const robot of robots) {
          // The dealt robot rides along: a rebuild deals before its locale is current (review R4).
          expect(rebuild).toHaveBeenCalledWith(robot.id, robot);
          expect(prime).toHaveBeenCalledWith(robot);
        }
        // The rebuild reads the store, so it runs after the write: the store already holds the dealt voice.
        expect(rebuild.mock.invocationCallOrder[0]).toBeLessThan(prime.mock.invocationCallOrder[0]);
        expect(envelope).not.toHaveBeenCalled();
        const { robots: baselines } = generateDealtRosterBaseline(getLocaleNoiseMap(localeId, 7, 11), robots.map((r) => r.id), useLoadingStore.getState());
        robots.forEach((robot, i) => expect(voiceOf(robot.audioAttributes), `robot ${i}`).toEqual(voiceOf(baselines[i].audioAttributes)));
        expect(new Set(robots.map((r) => r.loadedUnder?.voice))).toEqual(new Set(['glassy', 'hollow']));
      });
    });

    it('applyAspectDeal, live: a Melody-only deal pushes no envelope and no sends', () => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { melody: ['wandering'] } });
      const localeId = 'revisions-t8-live-melody';
      freshLocale(localeId, { x: 7, y: 11 });
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
      applyAspectDeal(localeId);
      expect(envelope).not.toHaveBeenCalled();
      expect(sends).not.toHaveBeenCalled();
    });

    // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R14: one push per family, each guarded as spawnRobot's reservation is, so
    // a push that throws leaves the deal running. Every mocked push also checks that the store already holds its robot
    // dealt, so a push moved above the write fails here.
    it('applyAspectDeal, live: a push that throws for one robot leaves every robot dealt and every other push made, each after its write', () => {
      useLoadingStore.getState().setLoading({
        theme: 'classic',
        aspects: { melody: ['hypnotic'], envelope: ['plucked'], distance: ['echoing'], voice: ['woody'] },
      });
      const localeId = 'review-r14-throwing-push';
      freshLocale(localeId, { x: 7, y: 11 });
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      const ids = useLocaleStore.getState().getLocaleById(localeId)!.robots.map((r) => r.id);
      const victim = ids[3];
      const stored = (id: string) => useLocaleStore.getState().getLocaleById(localeId)!.robots.find((r) => r.id === id)!;
      /** Per robot, its pushes in call order: the family, or the family marked when the store did not yet hold the robot
       *  dealt with the very value pushed. */
      const pushes = new Map<string, string[]>();
      const note = (id: string, family: string, dealt: boolean) =>
        pushes.set(id, [...(pushes.get(id) ?? []), dealt ? family : family + ' before the write']);
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation((id) => {
        note(id, 'melody', stored(id).loadedUnder?.melody === 'hypnotic');
      });
      const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation((id, adsr) => {
        note(id, 'envelope', stored(id).loadedUnder?.envelope === 'plucked' && JSON.stringify(stored(id).audioAttributes.adsr) === JSON.stringify(adsr));
        if (id === victim) throw new Error('the engine refused this envelope');
      });
      const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation((id, levels) => {
        note(id, 'distance', stored(id).loadedUnder?.distance === 'echoing' && JSON.stringify(robotSendLevels(stored(id))) === JSON.stringify(levels));
      });
      const rebuild = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation((id) => {
        note(id, 'voice', stored(id).loadedUnder?.voice === 'woody');
        return true;
      });
      const prime = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});

      expect(() => applyAspectDeal(localeId)).not.toThrow();

      const robots = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(robots).toHaveLength(ids.length);
      for (const robot of robots) {
        expect(robot.loadedUnder, robot.id).toEqual({ melody: 'hypnotic', envelope: 'plucked', distance: 'echoing', voice: 'woody' });
        // Each family once, in family order, after the write: the victim's two families after the throw included.
        expect(pushes.get(robot.id), robot.id).toEqual(['melody', 'envelope', 'distance', 'voice']);
      }
      for (const spy of [register, envelope, sends, rebuild, prime]) expect(spy).toHaveBeenCalledTimes(robots.length);
    });
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5: every rebuild spawns, and deals, into a locale that is not current yet,
  // so a melody registered then must carry its robot, or it loses its motif accents (and a click track its pattern).
  describe('melodies registered outside the active locale keep their accents (review R5)', () => {
    let worlds = 0;
    const freshWorld = () => {
      const localeId = `review-r5-${worlds++}`;
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: 7, y: 11 }, robots: [], companies: [] } },
      }));
      return localeId;
    };
    const robotsOf = (localeId: string) => useLocaleStore.getState().getLocaleById(localeId)!.robots;

    afterEach(() => {
      useLoadingStore.getState().setLoading(DEFAULT_LOADING);
      vi.restoreAllMocks();
    });

    it('spawnRobot registers with the robot it spawned: a motif window\'s opening note carries the group accent', () => {
      const localeId = freshWorld();
      expect(localeId).not.toBe(DEFAULT_LOCALE_ID); // precondition: the robots are not in the active locale
      spawnInitialRoster(localeId);
      const openings = windowOpenings(robotsOf(localeId));
      expect(openings.length, 'a motif-active robot whose first window opens on a plain note').toBeGreaterThan(0);
      for (const { robot, step } of openings) expect(accentAt(robot.id, step), robot.id).toBe(1.25);
    });

    it('the deal\'s Melody push registers with the robot as stored in its own locale: the dealt melodies carry their accents', () => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects: { melody: ['mechanical'] } }); // the motif always on
      const localeId = freshWorld();
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      applyAspectDeal(localeId);
      const openings = windowOpenings(robotsOf(localeId));
      expect(openings.length).toBeGreaterThan(0);
      for (const { robot, step } of openings) expect(accentAt(robot.id, step), robot.id).toBe(1.25);
    });
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R33: an aspect change re-deals the live roster in place. Per robot, only the
  // fields whose seeded value the new picks move take what a rebuild under them gives (field by field since
  // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16, which folded redealAspects into rederiveLoading); everything else stands.
  describe('an aspect change re-deals the live roster in place (review R33, through rederiveLoading since F16)', () => {
    const COORDS = { x: 7, y: 11 };
    let worlds = 0;
    /** Each world's loading as last dealt, the `from` a re-deal compares against (building a comparison world moves the
     *  store, so the store cannot say). */
    const dealtUnder = new Map<string, LoadingIdentity['aspects']>();
    /** A live world at COORDS, spawned and dealt under `aspects` as initializeLocale builds one: a new id each call, so its
     *  spawn count starts at 0 and its robots are the plot's own. */
    const buildWorld = (aspects: LoadingIdentity['aspects'], theme: LoadingIdentity['theme'] = 'classic') => {
      useLoadingStore.getState().setLoading({ theme, aspects });
      const localeId = `review-r33-${worlds++}`;
      dealtUnder.set(localeId, aspects);
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: COORDS, robots: [], companies: [] } },
      }));
      spawnInitialRoster(localeId);
      spawnInitialCompanies(localeId);
      applyAspectDeal(localeId);
      return localeId;
    };
    const robotsOf = (localeId: string) => useLocaleStore.getState().getLocaleById(localeId)!.robots;
    /** Two worlds' robots, comparable whole: a melody event's id is a fresh UUID per generation, never seeded, so it is
     *  the one thing two builds of one roster never share. The notes themselves are compared. */
    const comparable = (robots: readonly Robot[]) =>
      robots.map(({ melody, ...rest }) => ({ ...rest, melody: melody.map(({ id: _id, ...event }) => event) }));
    /** The aspects-only change as retransmitWorld runs it: the store first, then the re-deal, dropping swells through the
     *  real cancel unless a test hands its own. */
    const redeal = (localeId: string, aspects: LoadingIdentity['aspects'], dropSwell = cancelSwellForRobotAttribute) => {
      useLoadingStore.getState().setLoading({ theme: 'classic', aspects });
      rederiveLoading(localeId, { theme: 'classic', aspects: dealtUnder.get(localeId)! }, dropSwell);
      dealtUnder.set(localeId, aspects);
    };
    const idsCalled = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map((call) => call[0] as string).sort();
    // Envelope narrows to one of its two picks, Distance is picked, Voice is emptied; Melody stays as it was.
    const FROM: LoadingIdentity['aspects'] = { melody: ['hypnotic'], envelope: ['plucked', 'held'], voice: ['glassy'] };
    const TO: LoadingIdentity['aspects'] = { melody: ['hypnotic'], envelope: ['held'], distance: ['halfHeard'] };

    afterEach(async () => {
      useLoadingStore.getState().setLoading(DEFAULT_LOADING);
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation(real);
      vi.restoreAllMocks();
    });

    it('leaves the roster what a fresh build under the new picks deals, robot for robot: moved families re-derived, an emptied one back to the theme\'s draw', () => {
      const live = buildWorld(FROM);
      const before = robotsOf(live);
      const fresh = robotsOf(buildWorld(TO));
      // Preconditions: the two Envelope picks alternate, and the old deal differs from the new one.
      expect(new Set(before.map((r) => r.loadedUnder?.envelope))).toEqual(new Set(['plucked', 'held']));
      expect(comparable(before)).not.toEqual(comparable(fresh));

      redeal(live, TO);

      expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
      for (const robot of robotsOf(live)) {
        expect(robot.loadedUnder, robot.id).toEqual({ melody: 'hypnotic', envelope: 'held', distance: 'halfHeard' });
      }
    });

    it('re-derives only the families whose aspect moved: a tweak on a family that stays survives, one on a re-derived field resets', () => {
      const live = buildWorld(FROM);
      const robots = robotsOf(live);
      const held = robots.find((r) => r.loadedUnder?.envelope === 'held')!;
      const plucked = robots.find((r) => r.loadedUnder?.envelope === 'plucked')!;
      const fresh = robotsOf(buildWorld(TO));
      const freshOf = (id: string) => fresh.find((r) => r.id === id)!;
      const tweakedAdsr = { ...held.audioAttributes.adsr, attack: 1.234 };
      useLocaleStore.getState().updateRobot(live, held.id, {
        rhythmicDensity: 77, // Melody stays Hypnotic for everyone
        audioAttributes: { ...held.audioAttributes, adsr: tweakedAdsr }, // this robot's Envelope stays Held
        reverbSend: 0.123, // Distance moves the Reverb band for everyone
        gritSend: 0.456, // ...and not Grit's, so this tweak stands (final fixes F16: only what the change moves)
      });
      useLocaleStore.getState().updateRobot(live, plucked.id, {
        audioAttributes: { ...plucked.audioAttributes, adsr: { ...plucked.audioAttributes.adsr, attack: 1.234 } }, // Plucked moves to Held
      });

      redeal(live, TO);

      const after = (id: string) => robotsOf(live).find((r) => r.id === id)!;
      expect(after(held.id).rhythmicDensity).toBe(77);
      expect(after(held.id).audioAttributes.adsr).toEqual(tweakedAdsr);
      expect(after(held.id).reverbSend).toBe(freshOf(held.id).reverbSend);
      expect(after(held.id).gritSend).toBe(0.456);
      expect(after(plucked.id).audioAttributes.adsr).toEqual(freshOf(plucked.id).audioAttributes.adsr);
      expect(freshOf(held.id).reverbSend).not.toBe(0.123); // precondition: the reset is visible
      expect(freshOf(held.id).gritSend).toBe(held.gritSend); // precondition: Grit's seeded value stands
    });

    it('pushes each moved family once per robot, with the value written, and nothing for a family that stays', () => {
      const live = buildWorld(FROM);
      const movedEnvelope = robotsOf(live).filter((r) => r.loadedUnder?.envelope === 'plucked').map((r) => r.id).sort();
      const register = vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {});
      const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
      const rebuild = vi.spyOn(AudioEngine, 'reReserveVoice').mockImplementation(() => true);
      const prime = vi.spyOn(robotLfoLinks, 'primeRobotLinks').mockImplementation(() => {});

      redeal(live, TO);

      const robots = robotsOf(live);
      const allIds = robots.map((r) => r.id).sort();
      const stored = (id: unknown) => robots.find((r) => r.id === id)!;
      expect(register).not.toHaveBeenCalled();
      expect(idsCalled(envelope)).toEqual(movedEnvelope);
      for (const [id, adsr] of envelope.mock.calls) expect(adsr).toEqual(stored(id).audioAttributes.adsr);
      expect(idsCalled(sends)).toEqual(allIds);
      for (const [id, levels] of sends.mock.calls) expect(levels).toEqual(robotSendLevels(stored(id)));
      expect(idsCalled(rebuild)).toEqual(allIds);
      for (const [id, robot] of rebuild.mock.calls) expect(robot).toEqual(stored(id));
      expect(prime).toHaveBeenCalledTimes(robots.length);
    });

    // Field by field since docs/tasks/OFF_SCREEN_FINAL_FIXES.md F16: on an untweaked world a moved seeded value is a
    // changed value, so the swells dropped are those on the swellable keys the fresh build under the new picks changes.
    it('drops the swell riding each re-derived field before the write, as a hand edit does, and no other', () => {
      const live = buildWorld(FROM);
      const robots = robotsOf(live);
      const fresh = robotsOf(buildWorld(TO));
      const dropped: string[] = [];
      const dropSwell = (id: string, attribute: string) => {
        // The new deal gives every robot Distance: a robot already holding it was written before its swells went.
        const written = robotsOf(live).find((r) => r.id === id)?.loadedUnder?.distance !== undefined;
        dropped.push(id + ':' + attribute + (written ? ' after the write' : ''));
      };

      redeal(live, TO, dropSwell);

      const SENDS = ['reverbSend', 'delaySend', 'gritSend', 'shimmerSend', 'doubleSend'] as const;
      const ADSR = ['attack', 'decay', 'sustain', 'release'] as const;
      const expected = robots.flatMap((r, i) => {
        const to = fresh[i];
        const adsr = ADSR.filter((k) => r.audioAttributes.adsr[k] !== to.audioAttributes.adsr[k]).map((k) => `adsr.${k}`);
        const sends = SENDS.filter((k) => r[k] !== to[k]);
        const layers = r.audioAttributes.layers!.flatMap((layer, j) =>
          (['gain', 'detune'] as const).filter((k) => layer[k] !== to.audioAttributes.layers![j][k]).map((k) => `layer${j}.${k}`),
        );
        return [...adsr, ...sends, ...layers].map((attribute) => r.id + ':' + attribute);
      });
      expect(expected.length).toBeGreaterThan(0); // precondition
      expect(dropped.sort()).toEqual(expected.sort());
    });

    it('a re-deal to the same picks touches nothing: no write, no push, no swell dropped', () => {
      const live = buildWorld(FROM);
      const before = robotsOf(live);
      const sends = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
      const envelope = vi.spyOn(AudioEngine, 'updateVoiceEnvelope').mockImplementation(() => {});
      const cancel = vi.fn();
      redeal(live, FROM, cancel);
      expect(robotsOf(live)).toBe(before);
      expect(sends).not.toHaveBeenCalled();
      expect(envelope).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
    });

    it('emptying every family leaves a plain spawn: no loadedUnder, every field the theme\'s own draw', () => {
      const live = buildWorld({ melody: ['wandering'], envelope: ['plucked'], distance: ['echoing'], voice: ['hollow'] });
      const plain = robotsOf(buildWorld({}));
      redeal(live, {});
      expect(comparable(robotsOf(live))).toEqual(comparable(plain));
      for (const robot of robotsOf(live)) expect(robot.loadedUnder, robot.id).toBeUndefined();
    });

    // Company Families Task 5: a company member (was: a copied robot).
    it('a member undealt takes its founder\'s values back, as it spawned, not a fresh draw at its own index', () => {
      const live = buildWorld({ melody: ['wandering'], envelope: ['plucked'], voice: ['woody'] });
      const dealt = robotsOf(live);
      const plain = robotsOf(buildWorld({}));
      const member = plain.findIndex((r) => r.lineage !== undefined);
      const founder = plain[member].lineage!.founderIndex;
      expect(plain[member].audioAttributes).toEqual(plain[founder].audioAttributes); // precondition: a member of its founder
      expect(dealt[member].audioAttributes.adsr).not.toEqual(plain[member].audioAttributes.adsr); // precondition: the deal moved it off

      redeal(live, {});

      expect(comparable(robotsOf(live))).toEqual(comparable(plain));
    });

    it('a Voice move carries the whole bus filter: open lowpass robots dealt Hollow come back resonant bandpass ones', async () => {
      // Every accent roll between Classic's accent share (0.2) and Hollow's (0.45), every type roll under the bandpass share.
      await forceSeededDraws({ 'robot.audio.filter.accent': 0.35, 'robot.audio.filter.type': 0 });
      try {
        const live = buildWorld({});
        const fresh = robotsOf(buildWorld({ voice: ['hollow'] }));
        expect(robotsOf(live).every((r) => r.audioAttributes.filterType === 'lowpass')).toBe(true); // precondition
        expect(fresh.every((r) => r.audioAttributes.filterType === 'bandpass')).toBe(true); // precondition

        redeal(live, { voice: ['hollow'] });

        expect(comparable(robotsOf(live))).toEqual(comparable(fresh));
      } finally {
        await restoreSeededDraws();
      }
    });

    // docs/tasks/OFF_SCREEN_FINAL_FIXES.md F20 (Crawford, 2026-11-01): "if a robot changes company nothing about the
    // robot should change unless the robot itself or its new company gets updated". The deal still reads the live
    // companies, but a moved robot's family changes only when the aspect its new company is dealt changes.
    describe('a robot moved to another company (final fixes F20)', () => {
      /** A world dealt Hypnotic and Mechanical over two companies, with the first company's first robot moved into the
       *  second. */
      const movedWorld = () => {
        const live = buildWorld({ melody: ['hypnotic', 'mechanical'] });
        const { companies } = useLocaleStore.getState().getLocaleById(live)!;
        expect(companies.length).toBeGreaterThanOrEqual(2); // precondition: two companies, dealt the two picks in turn
        const [first, second] = companies;
        const mover = first.robotIds[0];
        const pickOf = (id: string) => robotsOf(live).find((r) => r.id === id)!.loadedUnder?.melody;
        expect(pickOf(mover)).not.toBe(pickOf(second.robotIds[0])); // precondition
        useLocaleStore.getState().assignRobotToCompany(live, mover, second.id);
        const robotOf = () => robotsOf(live).find((r) => r.id === mover)!;
        return { live, mover, robotOf, pickOf, before: robotOf(), newCompanyMate: second.robotIds[0] };
      };
      const melodyFields = (r: Robot) => [r.rhythmicDensity, r.rhythmicMotifLength, r.noteVariance, r.pitchRepeat, r.rests];

      it('keeps its pick and its Melody fields through a change to another family', () => {
        const { live, robotOf, before } = movedWorld();
        // Distance, not Envelope: a dealt attack re-draws the density (the attack rail), so Envelope is not "another family".
        redeal(live, { melody: ['hypnotic', 'mechanical'], distance: ['near'] });
        expect(robotOf().loadedUnder?.melody).toBe(before.loadedUnder?.melody);
        expect(melodyFields(robotOf())).toEqual(melodyFields(before));
        expect(robotOf().loadedUnder?.distance).toBe('near'); // the family that did change reached it
      });

      it("takes its new company's pick when a change moves that company's pick", () => {
        const { live, mover, robotOf, pickOf, newCompanyMate } = movedWorld();
        redeal(live, { melody: ['wandering'] });
        expect(pickOf(newCompanyMate)).toBe('wandering');
        expect(robotOf().loadedUnder?.melody).toBe('wandering');
        const sameSpawn = robotsOf(buildWorld({ melody: ['wandering'] })).find((r) => r.id === mover)!;
        expect(melodyFields(robotOf())).toEqual(melodyFields(sameSpawn));
      });

      it('keeps its pick through a theme change, its moved fields drawn under that pick', () => {
        const { live, mover, robotOf, before } = movedWorld();
        const own = before.loadedUnder!.melody!;
        useLoadingStore.getState().setLoading({ theme: 'shatter', aspects: { melody: ['hypnotic', 'mechanical'] } });
        rederiveLoading(live, { theme: 'classic', aspects: { melody: ['hypnotic', 'mechanical'] } }, cancelSwellForRobotAttribute);
        expect(robotOf().loadedUnder?.melody).toBe(own);
        // The same plot built under Perilous with the mover's own pick for everyone: its fields as they should be.
        const fresh = robotsOf(buildWorld({ melody: [own] }, 'shatter')).find((r) => r.id === mover)!;
        // Every seeded field as the fresh build under its own pick has it; at least one is moved by Perilous.
        const seeded = (r: Robot) => ({ melody: melodyFields(r), adsr: r.audioAttributes.adsr, sends: robotSendLevels(r) });
        expect(seeded(fresh)).not.toEqual(seeded(before)); // precondition
        expect(seeded(robotOf())).toEqual(seeded(fresh));
      });
    });
  });
});
