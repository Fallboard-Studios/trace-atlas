// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { Robot } from '../types/Robot';
import { ENVELOPE_CURVE_NAMES } from '../types/Robot';

import { generateSpawnPosition, generateAudioAttributes, generateRobotLfoLinks, generateRobotSends, generateRobotAudioBaseline, generateRobotRosterBaseline, generateCompanyRosterBaseline, spawnRobot, spawnInitialRoster, spawnInitialCompanies, generateCompanyName, generateCompanyIdentityColor, reRegisterAllRobotsAudio, ADJECTIVES, COMPANY_NOUNS } from './spawnSystem';
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
} from '../constants';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import { tallyLanes } from '../utils/lfoLaneDraw';
import { ROBOT_SEND_LOADING_RANGES } from '../data/robotSendLoadingRanges';
import { robotSendLevels } from '../data/robotSends';
import { buildSeededComposition, buildSeededPerformance, applyPerformanceMarks, generateMelodyForRobot, DEFAULT_RHYTHMIC_DENSITY, DEFAULT_RHYTHMIC_MOTIF_LENGTH, DEFAULT_NOTE_VARIANCE, DEFAULT_PITCH_REPEAT, DEFAULT_DYNAMICS, DEFAULT_RESTS, DEFAULT_ACCENTS } from '../engine/melodyGenerator';
import * as robotLfoLinks from './robotLfoLinks';
import { getStations, type Station } from './stations';
import { positionForCentre, robotCentre } from '../animation/jobMoves/sceneToOrbiterLocal';
import { chargingColorsKey, parseColorsKey } from '../components/stations/stationOccupancy';

// Spy on getSeededVal while keeping its real behavior (the globalAudioSeed.test.ts/
// worldTransition.test.ts importOriginal pattern) — the lfoLinks-at-spawn tests below need to
// force spawnRobot's own 'robot.copyChance' seeded roll to a known side without disturbing every
// other seeded draw the rest of this file's many tests depend on.
vi.mock('../utils/getSeededVal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/getSeededVal')>();
  // Robot Effect Sends T7: the uniform draw is wrapped too, so the effect room sends' rolls can be counted and forced.
  // Its own inner getSeededVal samples are the real module's, so they never show up on the getSeededVal spy above.
  return { ...actual, getSeededVal: vi.fn(actual.getSeededVal), getUniformSeededVal: vi.fn(actual.getUniformSeededVal) };
});

import { getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';

// Real stations by default; the port-vs-centre and overfill tests swap in their own.
vi.mock('./stations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./stations')>();
  return { ...actual, getStations: vi.fn(actual.getStations) };
});

/** General-purpose mock: returns a pseudo-random value in [-1, 1]. */
const mockNoiseMap: NoiseFunction2D = () => Math.random() * 2 - 1;

/** Deterministic mock: always returns -1, mapping every getSeededVal call to its min value. */
const deterministicNoiseMap: NoiseFunction2D = () => -1;

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
    // strongly correlated per offset (see LFO_QUIET_THRESHOLD's doc comment) and can land on a band edge.
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
        const a = generateAudioAttributes(() => -1, 0);
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
        const a = generateAudioAttributes(() => 1, 0);
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

      it('a shaped curve whose index draw lands exactly on its max clamps to the last name (never undefined)', async () => {
        const { getSeededVal: realGetSeededVal } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const mocked = vi.mocked(getSeededVal);
        mocked.mockImplementation((noiseMap, dataId, offset, min, max) => {
          if (dataId === 'robot.audio.attackCurve.shaped') return 0;
          if (dataId === 'robot.audio.attackCurve.which') return max ?? 0; // the top of the draw's own range
          return realGetSeededVal(noiseMap, dataId, offset, min, max);
        });
        try {
          const a = generateAudioAttributes(createNoise2D(alea('articulation-clamp-seed')), 0);
          expect(a.adsr.attackCurve).toBe(ENVELOPE_CURVE_NAMES[ENVELOPE_CURVE_NAMES.length - 1]);
        } finally {
          mocked.mockImplementation((noiseMap, dataId, offset, min, max) => realGetSeededVal(noiseMap, dataId, offset, min, max));
        }
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

      it('a plain robot at a given point in the noise has the same body as before: seeded value / 2 s equals the old value / 5 s', async () => {
        const { bodyShapeFromAdsr } = await import('../components/robot/robotVisualHelpers');
        const mocked = vi.mocked(getSeededVal);
        // Every Attack/Release draw lands 30 % of the way through whichever range it was given; the shaped rolls say "not shaped".
        mocked.mockImplementation((_noiseMap, dataId, _offset, min = 0, max = 1) => (dataId.endsWith('.shaped') ? 1 : min + 0.3 * (max - min)));
        try {
          const a = generateAudioAttributes(createNoise2D(alea('envelope-body-seed')), 0);
          expect(a.adsr.attack).toBeCloseTo(0.6, 9);
          expect(a.adsr.release).toBeCloseTo(0.6, 9);
          const body = bodyShapeFromAdsr(a.adsr);
          expect(body.scale).toBeCloseTo(0.25 + (1 - 0.3) * 0.75, 9); // 30 % of the way along, as 1.5 s of 5 s was
          expect(body.detail).toBeCloseTo(0.3, 9);
        } finally {
          const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
          mocked.mockImplementation((noiseMap, dataId, offset, min, max) => real(noiseMap, dataId, offset, min, max));
        }
      });

      it('a shaped stage lands 50 % of the way through its own short range, not the full one', async () => {
        const mocked = vi.mocked(getSeededVal);
        mocked.mockImplementation((_noiseMap, dataId, _offset, min = 0, max = 1) => (dataId.endsWith('.shaped') ? 0 : min + 0.5 * (max - min)));
        try {
          const a = generateAudioAttributes(createNoise2D(alea('envelope-shaped-seed')), 0);
          expect(a.adsr.attackCurve).not.toBe('linear');
          expect(a.adsr.releaseCurve).not.toBe('linear');
          expect(a.adsr.attack).toBeCloseTo(0.03 + 0.5 * (0.25 - 0.03), 9);
          expect(a.adsr.release).toBeCloseTo(0.15 + 0.5 * (0.8 - 0.15), 9);
        } finally {
          const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
          mocked.mockImplementation((noiseMap, dataId, offset, min, max) => real(noiseMap, dataId, offset, min, max));
        }
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
      /** Forces a glider (+ accent) and a fresh (non-copy) spawn; everything else stays the real seeded draw. */
      async function forceGliderAccent() {
        const { getSeededVal: realGetSeededVal } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const mocked = vi.mocked(getSeededVal);
        mocked.mockImplementation((noiseMap, dataId, offset, min, max) => {
          if (dataId === 'robot.copyChance') return 1;
          if (dataId === 'robot.audio.portamento.glider') return 0;
          if (dataId === 'robot.audio.filter.accent') return 0;
          if (dataId === 'robot.audio.filter.type') return 0; // < 0.4 -> bandpass
          return realGetSeededVal(noiseMap, dataId, offset, min, max);
        });
        return realGetSeededVal;
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
        const real = await forceGliderAccent();
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
          vi.mocked(getSeededVal).mockImplementation((noiseMap, dataId, offset, min, max) => real(noiseMap, dataId, offset, min, max));
        }
      });

      it('spawnRobot hands reserveVoice the robot\'s portamento, filterQ and filterType as the 9th argument', async () => {
        const real = await forceGliderAccent();
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
          vi.mocked(getSeededVal).mockImplementation((noiseMap, dataId, offset, min, max) => real(noiseMap, dataId, offset, min, max));
        }
      });

      it('reRegisterAllRobotsAudio passes the same articulation object, from the stored (possibly edited) robot', async () => {
        const real = await forceGliderAccent();
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
          vi.mocked(getSeededVal).mockImplementation((noiseMap, dataId, offset, min, max) => real(noiseMap, dataId, offset, min, max));
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
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation(real);
    });

    /** Force each send draw to a chosen raw value; everything else stays real. */
    async function forceDraws(draws: { reverb: number; delay: number; quiet: number }) {
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation((noiseMap, dataId, offset, min, max) => {
        if (dataId === 'robot.send.reverb') return draws.reverb;
        if (dataId === 'robot.send.delay') return draws.delay;
        if (dataId === 'robot.send.delay.quiet') return draws.quiet;
        return real(noiseMap, dataId, offset, min, max);
      });
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
      expect(reverbAndDelay(generateRobotSends(() => -1, 0))).toEqual({ reverbSend: 0.1, delaySend: 0 });
      expect(reverbAndDelay(generateRobotSends(() => 1, 0))).toEqual({ reverbSend: 0.6, delaySend: 0.3 });
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
      expect(generateRobotSends(() => 1, 0).delaySend).toBe(0.3);
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
      vi.mocked(getSeededVal).mockClear();

      generateRobotSends(realNoise, 3);

      const calls = vi.mocked(getSeededVal).mock.calls.map((c) => [c[1], c[2], c[3], c[4]]);
      const { reverbSend, delaySend } = ROBOT_SEND_LOADING_RANGES;
      expect(calls).toContainEqual(['robot.send.reverb', 3, reverbSend.min, reverbSend.max]);
      expect(calls).toContainEqual(['robot.send.delay', 3, delaySend.min, delaySend.max]);
      expect(calls).toContainEqual(['robot.send.delay.quiet', 3, 0, 1]);
      expect(calls).toHaveLength(3);
    });

    it('takes the quiet threshold from the Delay row: a roll under 1 - lit is quiet', async () => {
      const original = ROBOT_SEND_LOADING_RANGES.delaySend.lit;
      try {
        ROBOT_SEND_LOADING_RANGES.delaySend.lit = 0.4; // quiet below 0.6
        await forceDraws({ reverb: 0.3, delay: 0.2, quiet: 0.59 });
        expect(generateRobotSends(realNoise, 0).delaySend).toBe(0);
        await forceDraws({ reverb: 0.3, delay: 0.2, quiet: 0.6 });
        expect(generateRobotSends(realNoise, 0).delaySend).toBe(0.2);
      } finally {
        ROBOT_SEND_LOADING_RANGES.delaySend.lit = original;
      }
    });

    // Robot Effect Sends T1 (plan acceptance "Parity"): moving the Reverb and Delay bands into the robot send table must not
    // move a single seeded send. These are the values the branch base (ad1b37c1, Classic Band Retune merged at 2dc5b4a2)
    // seeds for two twelve-robot rosters, recorded from a run on the base before the change. Never re-record them.
    it('seeds, value for value, the Reverb and Delay sends the branch base seeds for two fixed rosters', () => {
      const BASE: Record<string, Array<[number, number]>> = {
        'effect-sends-parity-a': [
          [0.2, 0], [0.18, 0], [0.24, 0.17], [0.24, 0.2], [0.48, 0.08], [0.29, 0.16],
          [0.4, 0.2], [0.22, 0.11], [0.17, 0], [0.36, 0.23], [0.57, 0.17], [0.34, 0.26],
        ],
        'effect-sends-parity-b': [
          [0.32, 0.22], [0.48, 0.02], [0.23, 0.09], [0.49, 0.23], [0.48, 0.08], [0.5, 0.09],
          [0.4, 0.13], [0.14, 0], [0.34, 0.09], [0.38, 0.28], [0.57, 0.17], [0.47, 0.08],
        ],
      };
      for (const [seed, expected] of Object.entries(BASE)) {
        const roster = generateRobotRosterBaseline(createNoise2D(alea(seed)), 12);
        expect(roster.map((b) => [b.reverbSend, b.delaySend]), seed).toEqual(expected);
      }
    });

    it('leaves a sizeable share of a large fleet with no delay at all (a loose statistical bound)', () => {
      // The threshold is 0.25, but one getSeededVal sample is bell-curved around 0.5, so fewer than a quarter of
      // the rolls fall under it: measured at about 17-18 % over four seeds x 2000 offsets (2026-10-14).
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
    const BANDS = ROBOT_SEND_LOADING_RANGES;
    const EXCLUSIVE = ['gritSend', 'shimmerSend', 'doubleSend'] as const;

    afterEach(async () => {
      const { getUniformSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getUniformSeededVal).mockImplementation(real);
    });

    /** Force each uniform roll / value draw by dataId; any other uniform draw stays real. */
    async function forceUniform(draws: Record<string, number>) {
      const { getUniformSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getUniformSeededVal).mockImplementation((noiseMap, dataId, offset) =>
        dataId in draws ? draws[dataId] : real(noiseMap, dataId, offset),
      );
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
      const KEYS = ['robot.send.grit.lit', 'robot.send.grit', 'robot.send.shimmer.lit', 'robot.send.shimmer', 'robot.send.double.lit', 'robot.send.double'];
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

    it('keeps the Reverb and Delay draws exactly as they were (the T1 parity test pins their values)', () => {
      vi.mocked(getSeededVal).mockClear();
      generateRobotSends(realNoise, 5);
      expect(vi.mocked(getSeededVal).mock.calls.map((c) => c[1]).sort()).toEqual(['robot.send.delay', 'robot.send.delay.quiet', 'robot.send.reverb']);
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

      expect(registerSpy).toHaveBeenCalledWith(robot.id, robot.melody);
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

      spawnRobot(DEFAULT_LOCALE_ID);

      const dataIds = vi.mocked(getSeededVal).mock.calls.map((c) => String(c[1]));
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

      // Robot Effect Sends T7 (spec §1.2): the three effect room sends are seeded at spawn from the same helper, outside
      // the copy branch; at most one lands on a robot.
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

      it('equals the baseline for every robot of a real roster, copied siblings included, all five sends', () => {
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

      it('draws its own effect room sends on the copy branch, as the baseline does', async () => {
        freshLocale('effect-sends-copy-locale');
        const { getSeededVal: realGetSeededVal } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const mocked = vi.mocked(getSeededVal);
        mocked.mockImplementation((noiseMap, dataId, offset, min, max) =>
          dataId === 'robot.copyChance' ? 0 : realGetSeededVal(noiseMap, dataId, offset, min, max));
        try {
          for (let i = 0; i < 30; i++) spawnRobot('effect-sends-copy-locale');
        } finally {
          mocked.mockImplementation(realGetSeededVal);
        }
        const noiseMap = noiseFor('effect-sends-copy-locale');
        const robots = useLocaleStore.getState().getLocaleById('effect-sends-copy-locale')!.robots;
        const baselines = generateRobotRosterBaseline(noiseMap, robots.length);
        robots.forEach((robot, i) => {
          expect(effectSends(robot), `robot ${i}`).toEqual(effectSends(generateRobotSends(noiseMap, i)));
        });
        expect(new Set(robots.map((r) => `${r.gritSend}/${r.shimmerSend}/${r.doubleSend}`)).size).toBeGreaterThan(1);
        expect(baselines).toHaveLength(robots.length);
      });

      it('with no locale (no noise map) falls back to alea: each effect send 0 or in its band, never two on one robot', () => {
        const sendsSpy = vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {});
        for (let i = 0; i < 200; i++) spawnRobot(`effect-sends-no-locale-${i}`);
        const sent = sendsSpy.mock.calls.map((c) => c[1] as Record<'grit' | 'shimmer' | 'double', number>);
        expect(sent).toHaveLength(200);
        const bands = { grit: ROBOT_SEND_LOADING_RANGES.gritSend, shimmer: ROBOT_SEND_LOADING_RANGES.shimmerSend, double: ROBOT_SEND_LOADING_RANGES.doubleSend };
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

      it('draws its own sends on the copy branch too - a copied robot shares the voice, not the depth', async () => {
        freshLocale('sends-copy-locale');
        const { getSeededVal: realGetSeededVal } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const mocked = vi.mocked(getSeededVal);
        // Spawn 0 is fresh (nobody to copy); every later spawn takes the copy branch (0 is below 0.30).
        mocked.mockImplementation((noiseMap, dataId, offset, min, max) =>
          dataId === 'robot.copyChance' ? 0 : realGetSeededVal(noiseMap, dataId, offset, min, max));
        try {
          for (let i = 0; i < 4; i++) spawnRobot('sends-copy-locale');
        } finally {
          mocked.mockImplementation(realGetSeededVal);
        }

        const noiseMap = noiseFor('sends-copy-locale');
        const robots = useLocaleStore.getState().getLocaleById('sends-copy-locale')!.robots;
        // A copy really happened: every later robot reuses an earlier robot's audioAttributes by reference.
        expect(robots.slice(1).every((r) => robots.some((o) => o !== r && o.audioAttributes === r.audioAttributes))).toBe(true);
        robots.forEach((robot, i) => {
          expect({ reverbSend: robot.reverbSend, delaySend: robot.delaySend }, `robot ${i}`).toEqual(reverbAndDelay(generateRobotSends(noiseMap, i)));
        });
        // ...and they are not simply the first robot's sends repeated.
        expect(new Set(robots.map((r) => `${r.reverbSend}/${r.delaySend}`)).size).toBeGreaterThan(1);
      });

      it('adds only the three new dataIds, one draw each, at the spawn count', () => {
        freshLocale('sends-keys-locale');
        vi.mocked(getSeededVal).mockClear();

        spawnRobot('sends-keys-locale');

        const sendCalls = vi.mocked(getSeededVal).mock.calls.filter((c) => /send/i.test(String(c[1])));
        expect(sendCalls.map((c) => c[1]).sort()).toEqual(['robot.send.delay', 'robot.send.delay.quiet', 'robot.send.reverb']);
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

    it('a copied robot inherits the source\'s rhythmicDensity/rhythmicMotifLength/noteVariance rather than rolling fresh ones', () => {
      for (let i = 0; i < 30; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const byLinks = new Map<Robot['lfoLinks'], Robot[]>();
      for (const r of robots) {
        const group = byLinks.get(r.lfoLinks) ?? [];
        group.push(r);
        byLinks.set(r.lfoLinks, group);
      }
      const sharedGroup = [...byLinks.values()].find((g) => g.length > 1);
      expect(sharedGroup, 'expected at least one copy to share its source\'s object references').toBeDefined();
      const [a, b] = sharedGroup!;
      expect(a.rhythmicDensity).toBe(b.rhythmicDensity);
      expect(a.rhythmicMotifLength).toEqual(b.rhythmicMotifLength);
      expect(a.noteVariance).toEqual(b.noteVariance);
      expect(a.pitchRepeat).toBe(b.pitchRepeat);
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

        // Force every spawn below to generate fresh links rather than copy an existing robot's —
        // a copy would inherit a reference instead of exercising the tally this test checks.
        const { getSeededVal: realGetSeededVal } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const mocked = vi.mocked(getSeededVal);
        mocked.mockImplementation((noiseMap, dataId, offset, min, max) => {
          if (dataId === 'robot.copyChance') return 1; // 1 is never < 0.30, so shouldCopy is always false
          return realGetSeededVal(noiseMap, dataId, offset, min, max);
        });

        try {
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
        } finally {
          mocked.mockImplementation((noiseMap, dataId, offset, min, max) => realGetSeededVal(noiseMap, dataId, offset, min, max));
        }
      });

      it('a copied robot inherits the source\'s lfoLinks reference rather than generating fresh ones', () => {
        // Same copy-detection pattern as the rhythmicDensity/rhythmicMotifLength/noteVariance copy test above.
        for (let i = 0; i < 30; i++) spawnRobot(DEFAULT_LOCALE_ID);
        const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
        const byLinks = new Map<Robot['lfoLinks'], Robot[]>();
        for (const r of robots) {
          const group = byLinks.get(r.lfoLinks) ?? [];
          group.push(r);
          byLinks.set(r.lfoLinks, group);
        }
        const sharedGroup = [...byLinks.values()].find((g) => g.length > 1);
        expect(sharedGroup, 'expected at least one copy to share its source\'s lfoLinks reference').toBeDefined();
      });

      it('a respawn copying from a source without lfoLinks (undefined — a pre-Task-9 robot) generates fresh links instead of inheriting undefined', async () => {
        spawnRobot(DEFAULT_LOCALE_ID);
        const legacySource = { ...useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots[0] } as Partial<Robot>;
        delete legacySource.lfoLinks;
        useLocaleStore.setState((state) => ({
          locales: {
            ...state.locales,
            [DEFAULT_LOCALE_ID]: { ...state.locales[DEFAULT_LOCALE_ID], robots: [legacySource as Robot] },
          },
        }));

        const { getSeededVal: realGetSeededVal } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        const mocked = vi.mocked(getSeededVal);
        mocked.mockImplementation((noiseMap, dataId, offset, min, max) => {
          if (dataId === 'robot.copyChance') return 0; // 0 is always < 0.30, so shouldCopy is always true
          if (dataId === 'robot.copySource') return 0; // picks the sole source robot regardless of range
          return realGetSeededVal(noiseMap, dataId, offset, min, max);
        });

        try {
          spawnRobot(DEFAULT_LOCALE_ID);
          const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)!.robots;
          expect(robots).toHaveLength(2);
          const copy = robots[1];

          expect(copy.lfoLinks).toBeDefined();
          expect(Object.keys(copy.lfoLinks ?? {}).sort()).toEqual([...ROBOT_LFO_TARGET_IDS].sort());
        } finally {
          mocked.mockImplementation((noiseMap, dataId, offset, min, max) => realGetSeededVal(noiseMap, dataId, offset, min, max));
        }
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

    it('a copied robot gets its own compositionSeed, never the source\'s', () => {
      // Same copy-detection pattern as the rhythmicDensity/rhythmicMotifLength/noteVariance copy
      // test above: group by a field that IS inherited on copy (lfoLinks, by reference) to
      // reliably find a copy pair, then assert compositionSeed -- which must NOT be inherited --
      // actually differs between them.
      for (let i = 0; i < 30; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const byLinks = new Map<Robot['lfoLinks'], Robot[]>();
      for (const r of robots) {
        const group = byLinks.get(r.lfoLinks) ?? [];
        group.push(r);
        byLinks.set(r.lfoLinks, group);
      }
      const sharedGroup = [...byLinks.values()].find((g) => g.length > 1);
      expect(sharedGroup, 'expected at least one copy to share its source\'s lfoLinks reference').toBeDefined();
      const [a, b] = sharedGroup!;
      expect(a.compositionSeed).not.toBe(b.compositionSeed);
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
      const expectedMelody = applyPerformanceMarks(
        generateMelodyForRobot({
          octaveMin: robot.octaveRange[0],
          octaveMax: robot.octaveRange[1],
          rhythmicDensity: robot.rhythmicDensity ?? DEFAULT_RHYTHMIC_DENSITY,
          rhythmicMotifLength: robot.rhythmicMotifLength ?? DEFAULT_RHYTHMIC_MOTIF_LENGTH,
          noteVariance: robot.noteVariance ?? DEFAULT_NOTE_VARIANCE,
          pitchRepeat: robot.pitchRepeat ?? DEFAULT_PITCH_REPEAT,
          rand,
        }),
        { rests: robot.rests ?? DEFAULT_RESTS, accents: robot.accents ?? DEFAULT_ACCENTS },
        buildSeededPerformance(robot.compositionSeed),
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

    it('sets audioMode to mute when created Docked — the toggle Robot Options exposes, not absent registration', () => {
      const localeId = 'docking-opts-docked-audiomode';
      freshLocale(localeId, 107, 207);
      spawnRobot(localeId, { docking: DockingState.Docked, batteryLevel: 50 });
      const robot = useLocaleStore.getState().getLocaleById(localeId)?.robots[0];
      expect(robot?.audioMode).toBe('mute');
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

    it('every robot has a reserved voice and registered melody, with audioMode matching its docking state', () => {
      spawnInitialRoster(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      robots.forEach((r) => {
        expect(AudioEngine.getVoiceForRobot(r.id)).not.toBeNull();
        expect(AudioEngine.getRegisteredMelody(r.id).length).toBeGreaterThan(0);
        expect(r.audioMode).toBe(r.docking === DockingState.Active ? 'none' : 'mute');
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

    // Roadmap Phase 14 (docs/specs/COLOR_SCHEME_TRAIT_THEMING.md §1.4) — each robot's own seeded
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

    it('a copied robot gets its own gemSeed, never the source\'s', () => {
      // Same copy-detection pattern as the compositionSeed copy test: lfoLinks IS inherited by reference.
      for (let i = 0; i < 30; i++) spawnRobot(DEFAULT_LOCALE_ID);
      const robots = useLocaleStore.getState().getLocaleById(DEFAULT_LOCALE_ID)?.robots ?? [];
      const byLinks = new Map<Robot['lfoLinks'], Robot[]>();
      for (const r of robots) {
        const group = byLinks.get(r.lfoLinks) ?? [];
        group.push(r);
        byLinks.set(r.lfoLinks, group);
      }
      const sharedGroup = [...byLinks.values()].find((g) => g.length > 1);
      expect(sharedGroup, 'expected at least one copy to share its source\'s lfoLinks reference').toBeDefined();
      const [a, b] = sharedGroup!;
      expect(a.gemSeed).not.toBe(b.gemSeed);
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

    // Roadmap: Company Section Enhancements (docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §1.2) —
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
    // decision docs/specs/COMPANY_SECTION_ENHANCEMENTS.md §7 item 2 previously made: two companies
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
    const BANDS = { dynamics: [25, 75], rests: [10, 60], accents: [20, 80] } as const;
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
    /** Force every spawn after the first onto the copy branch, copying the first robot. */
    const forceCopyOfFirst = async () => {
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation((nm, dataId, offset, min, max) => {
        if (dataId === 'robot.copyChance') return 0;
        if (dataId === 'robot.copySource') return min ?? 0;
        return real(nm, dataId, offset, min, max);
      });
    };

    beforeEach(() => {
      useLocaleStore.setState({ locales: { [DEFAULT_LOCALE_ID]: DEFAULT_LOCALE } });
    });

    afterEach(async () => {
      const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
      vi.mocked(getSeededVal).mockImplementation(real);
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

      it.each(FIELDS)('spreads %s across the band: at least 20 distinct values, both halves used', (field) => {
        const values = SAMPLE.map((b) => b[field]);
        const [min, max] = BANDS[field];
        const middle = (min + max) / 2;
        expect(new Set(values).size, `${field} distinct values`).toBeGreaterThanOrEqual(20);
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
        vi.mocked(getSeededVal).mockClear();

        spawnRobot('performance-keys-locale');

        const calls = vi.mocked(getSeededVal).mock.calls.filter((c) => /^robot\.(dynamics|rests|accents)$/.test(String(c[1])));
        expect(calls.map((c) => [c[1], c[2], c[3], c[4]]).sort()).toEqual([
          ['robot.accents', 0, 20, 80],
          ['robot.dynamics', 0, 25, 75],
          ['robot.rests', 0, 10, 60],
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

      it('on the copy branch inherits all three fields from the source and draws none', async () => {
        freshLocale('performance-copy-locale');
        await forceCopyOfFirst();
        for (let i = 0; i < 4; i++) {
          if (i === 1) vi.mocked(getSeededVal).mockClear();
          spawnRobot('performance-copy-locale');
        }
        // Captured before the fresh-draw comparison below, which calls getSeededVal itself.
        const draws = vi.mocked(getSeededVal).mock.calls.filter((c) => /^robot\.(dynamics|rests|accents)$/.test(String(c[1])));
        const robots = useLocaleStore.getState().getLocaleById('performance-copy-locale')!.robots;
        // The copy branch ran: every later robot reuses the first robot's audioAttributes by reference.
        expect(robots.slice(1).every((r) => r.audioAttributes === robots[0].audioAttributes)).toBe(true);
        for (const robot of robots.slice(1)) expect(fieldsOf(robot)).toEqual(fieldsOf(robots[0]));
        // ...and not by coincidence: a fresh draw at those offsets would have given different values.
        const noiseMap = noiseFor('performance-copy-locale');
        const freshDraws = [1, 2, 3].map((i) => fieldsOf(generateRobotAudioBaseline(noiseMap, i, [])));
        expect(freshDraws.some((fresh) => JSON.stringify(fresh) !== JSON.stringify(fieldsOf(robots[0])))).toBe(true);
        expect(draws).toEqual([]);
      });

      it('on the copy branch from a source with the fields absent falls back to 50, 0 and 0', async () => {
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
        await forceCopyOfFirst();

        spawnRobot('performance-copy-absent-locale');

        const copy = useLocaleStore.getState().getLocaleById('performance-copy-absent-locale')!.robots[1];
        expect(fieldsOf(copy)).toEqual({ dynamics: DEFAULT_DYNAMICS, rests: DEFAULT_RESTS, accents: DEFAULT_ACCENTS });
      });
    });

    describe('the melody carries the stamps', () => {
      const rosterLocale = 'performance-melody-roster-locale';
      const rebuiltMelody = (robot: Robot) =>
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
          }),
          { rests: robot.rests!, accents: robot.accents! },
          buildSeededPerformance(robot.compositionSeed),
        );

      it('every robot of a real roster has exactly the melody the post-pass makes from its own fields, and some are stamped', () => {
        freshLocale(rosterLocale);
        spawnInitialRoster(rosterLocale);
        const robots = useLocaleStore.getState().getLocaleById(rosterLocale)!.robots;
        expect(robots.length).toBeGreaterThan(0);
        for (const robot of robots) {
          expect(stripEventIds(robot.melody), `robot ${robot.id}`).toEqual(stripEventIds(rebuiltMelody(robot)));
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
          const plain = applyPerformanceMarks(rebuiltMelody({ ...robot, rests: 0, accents: 0 }), { rests: 0, accents: 0 }, buildSeededPerformance(robot.compositionSeed));
          expect(robot.melody.map(({ rest: _r, mark: _m, id: _id, ...rest }) => rest)).toEqual(plain.map(({ id: _id, ...rest }) => rest));
        }
      });
    });

    describe('generateRobotAudioBaseline mirrors spawnRobot', () => {
      it('equals the spawned robot at spawn count 0, with each value off its default', () => {
        freshLocale('performance-baseline-fresh-locale');
        spawnRobot('performance-baseline-fresh-locale');
        const robot = useLocaleStore.getState().getLocaleById('performance-baseline-fresh-locale')!.robots[0];

        const baseline = generateRobotAudioBaseline(noiseFor('performance-baseline-fresh-locale'), 0, []);

        expect(fieldsOf(baseline)).toEqual(fieldsOf(robot));
        // A baseline missing a field, or one equal to its default, cannot pass: rests and accents bands start above 0.
        expect(baseline.rests).toBeGreaterThanOrEqual(10);
        expect(baseline.accents).toBeGreaterThanOrEqual(20);
        expect(typeof baseline.dynamics).toBe('number');
      });

      it('equals every robot of a real 12-robot roster, copied siblings included', () => {
        freshLocale('performance-baseline-roster-locale');
        spawnInitialRoster('performance-baseline-roster-locale');
        const robots = useLocaleStore.getState().getLocaleById('performance-baseline-roster-locale')!.robots;
        const baselines = generateRobotRosterBaseline(noiseFor('performance-baseline-roster-locale'), robots.length);
        expect(robots.length).toBeGreaterThan(0);
        robots.forEach((robot, i) => {
          expect(fieldsOf(baselines[i]), `robot ${i} (${robot.id})`).toEqual(fieldsOf(robot));
        });
      });

      it('equals the spawned robots on the copy branch too', async () => {
        freshLocale('performance-baseline-copy-locale');
        await forceCopyOfFirst();
        for (let i = 0; i < 5; i++) spawnRobot('performance-baseline-copy-locale');
        const robots = useLocaleStore.getState().getLocaleById('performance-baseline-copy-locale')!.robots;
        const baselines = generateRobotRosterBaseline(noiseFor('performance-baseline-copy-locale'), robots.length);
        expect(baselines.slice(1).every((b) => b.audioAttributes === baselines[0].audioAttributes)).toBe(true);
        robots.forEach((robot, i) => {
          expect(fieldsOf(baselines[i]), `robot ${i} (${robot.id})`).toEqual(fieldsOf(robot));
        });
      });

      it('a copy baseline inherits the source three values, not a fresh draw', async () => {
        freshLocale('performance-baseline-inherit-locale');
        const noiseMap = noiseFor('performance-baseline-inherit-locale');
        await forceCopyOfFirst();
        const source = { ...generateRobotAudioBaseline(noiseMap, 0, []), dynamics: 11, rests: 22, accents: 33 };

        const copy = generateRobotAudioBaseline(noiseMap, 1, [source]);

        expect(copy.audioAttributes).toBe(source.audioAttributes);
        expect(fieldsOf(copy)).toEqual({ dynamics: 11, rests: 22, accents: 33 });
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
      const baselines = generateRobotRosterBaseline(noiseMap, robots.length);

      robots.forEach((robot, i) => {
        expect(baselines[i].lfoLinks, `robot ${i} (${robot.id}) lfoLinks`).toEqual(robot.lfoLinks);
      });
    });

    it('reproduces every field of a full real 12-robot roster (spawnInitialRoster), including any copied siblings', () => {
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
    // same helper as spawnRobot and OUTSIDE the copy branch, so "live differs from seed" is exact.
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

        robots.forEach((robot, i) => {
          expect(sendsOf(baselines[i]), `robot ${i} (${robot.id})`).toEqual(sendsOf(robot));
        });
      });

      it('equals the spawned robots on the copy branch too - the draw sits outside the branch', async () => {
        freshLocale('baseline-sends-copy-locale');
        const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        // Every robot after the first copies an earlier one, in spawnRobot and in the baseline alike.
        vi.mocked(getSeededVal).mockImplementation((noiseMap, dataId, offset, min, max) =>
          dataId === 'robot.copyChance' ? 0 : real(noiseMap, dataId, offset, min, max));
        for (let i = 0; i < 6; i++) spawnRobot('baseline-sends-copy-locale');
        const robots = useLocaleStore.getState().getLocaleById('baseline-sends-copy-locale')!.robots;
        const baselines = generateRobotRosterBaseline(noiseFor('baseline-sends-copy-locale'), robots.length);

        // Sanity: the copy branch really ran (a later baseline reuses an earlier one's attributes by reference).
        expect(baselines.slice(1).every((b) => baselines.some((o) => o !== b && o.audioAttributes === b.audioAttributes))).toBe(true);
        robots.forEach((robot, i) => {
          expect(sendsOf(baselines[i]), `robot ${i} (${robot.id})`).toEqual(sendsOf(robot));
        });
      });

      it('a copy baseline carries its own draw, not the source\'s', async () => {
        freshLocale('baseline-sends-own-locale');
        const noiseMap = noiseFor('baseline-sends-own-locale');
        const { getSeededVal: real } = await vi.importActual<typeof import('../utils/getSeededVal')>('../utils/getSeededVal');
        vi.mocked(getSeededVal).mockImplementation((nm, dataId, offset, min, max) =>
          dataId === 'robot.copyChance' ? 0 : real(nm, dataId, offset, min, max));
        const source = generateRobotAudioBaseline(noiseMap, 0, []);

        const copy = generateRobotAudioBaseline(noiseMap, 1, [source]);

        expect(copy.audioAttributes).toBe(source.audioAttributes); // it is a copy
        expect(sendsOf(copy)).toEqual(generateRobotSends(noiseMap, 1));
        expect(sendsOf(copy)).not.toEqual(sendsOf(source));
      });
    });

    it('takes the copy branch (reuses a prior baseline by reference) at roughly the same ~30% rate spawnRobot itself uses', () => {
      // No store involved at all -- generateRobotRosterBaseline is pure. 30 entries at a ~30%
      // per-entry copy chance makes at least one copy virtually certain (P(zero) ~= 0.7^29),
      // mirroring the existing "a copied robot inherits..." spawnRobot tests' own sample size.
      const noiseMap = createNoise2D(alea('baseline-copy-branch-test-seed'));
      const baselines = generateRobotRosterBaseline(noiseMap, 30);

      const byAttributes = new Map<typeof baselines[number]['audioAttributes'], number[]>();
      baselines.forEach((b, i) => {
        const group = byAttributes.get(b.audioAttributes) ?? [];
        group.push(i);
        byAttributes.set(b.audioAttributes, group);
      });
      const sharedGroup = [...byAttributes.values()].find((indices) => indices.length > 1);
      expect(sharedGroup, 'expected at least one entry to share an earlier entry\'s audioAttributes reference (a copy)').toBeDefined();

      const [earlierIdx, laterIdx] = sharedGroup!;
      // A copy reuses the SAME audioAttributes (and octaveRange/etc.) object by reference, not a
      // freshly-generated equivalent one -- matching spawnRobot's own "source.audioAttributes"
      // (no re-generation) on the copy path. name is the one field that's never copied (generated
      // fresh even on a copy, see generateRobotAudioBaseline's own doc comment) -- not asserted
      // here, since two different spawnCounts could coincidentally generate the same
      // "Adjective Noun" name by chance, independent of copying.
      expect(baselines[laterIdx].audioAttributes).toBe(baselines[earlierIdx].audioAttributes);
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
});
