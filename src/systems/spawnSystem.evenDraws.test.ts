// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
import { createNoise2D, type NoiseFunction2D } from 'simplex-noise';
import type { AudioAttributes } from '../types/Robot';
import { CLASSIC } from '../data/bands/classic';
import { getCentredSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';
import { ROBOT_LFO_TARGET_IDS, type LfoLaneId, type RobotLfoTargetId } from '../types/lfo';
import { pickLane } from '../utils/lfoLaneDraw';
import { deriveEnvelopeFields } from './robotFieldDerivation';
import { generateAudioAttributes, generateRobotLfoLinks } from './spawnSystem';

// ========================================
// THE SAMPLE
// ========================================
// Even Seeded Draws (docs/specs/EVEN_SEEDED_DRAWS.md §5.1): spawnSystem.ts's own draws over seeded locale maps, run
// through the real generators. This file mocks nothing, unlike spawnSystem.test.ts, whose spies and forced draws would
// leak into a distribution. 2,000 worlds x 12 robots: about 3,000 gliders, and every tolerance below at least 3
// standard deviations of its share.
const ROBOTS_PER_WORLD = 12;
const SLOTS = Array.from({ length: 2000 }, (_, i) => createNoise2D(alea(`attributes:${i}`))).flatMap((noiseMap) =>
  Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })),
);
const ATTRIBUTES = SLOTS.map(({ noiseMap, offset }) => generateAudioAttributes(noiseMap, offset));

/** The share of `values` in the bottom tenth and in the top tenth of [min, max]. */
function outerTenths(values: readonly number[], { min, max }: { min: number; max: number }): { bottom: number; top: number } {
  const tenth = (max - min) / 10;
  return {
    bottom: values.filter((v) => v < min + tenth - 1e-9).length / values.length,
    top: values.filter((v) => v >= max - tenth - 1e-9).length / values.length,
  };
}

/** The top-level pulse width generateAudioAttributes seeds; AudioAttributes no longer types it (layers carry their own). */
const pulseWidthOf = (a: AudioAttributes) => (a as AudioAttributes & { pulseWidth?: number }).pulseWidth;

const OCTAVE_REGISTERS: [number, number][] = [[1, 3], [2, 4], [3, 5], [4, 6], [5, 7]];

// ========================================
// TESTS
// ========================================

describe('generateAudioAttributes — glide, register, phase and pulse width even, detune centred (Even Seeded Draws T7)', () => {
  it('every register seeds its even share: 20 % of robots each (+/-3 points)', () => {
    for (const [low, high] of OCTAVE_REGISTERS) {
      const share = ATTRIBUTES.filter((a) => a.octaveRange?.[0] === low && a.octaveRange?.[1] === high).length / ATTRIBUTES.length;
      expect(share, `register ${low}-${high}`).toBeGreaterThanOrEqual(0.17);
      expect(share, `register ${low}-${high}`).toBeLessThanOrEqual(0.23);
    }
  });

  it('a glider\'s glide time fills its band: 8-12 % of gliders in each outer tenth of 0.05-0.2 s', () => {
    const glides = ATTRIBUTES.map((a) => a.portamento ?? 0).filter((p) => p > 0);
    const { bottom, top } = outerTenths(glides, CLASSIC['robot.portamento']);
    expect(bottom, 'bottom tenth').toBeGreaterThanOrEqual(0.08);
    expect(bottom, 'bottom tenth').toBeLessThanOrEqual(0.12);
    expect(top, 'top tenth').toBeGreaterThanOrEqual(0.08);
    expect(top, 'top tenth').toBeLessThanOrEqual(0.12);
  });

  it('phase and pulse width fill their bands: 8-12 % of robots in each outer tenth', () => {
    const fields = {
      phase: { values: ATTRIBUTES.map((a) => a.phase ?? 0), band: { min: 0, max: 361 } },
      pulseWidth: { values: ATTRIBUTES.map((a) => pulseWidthOf(a) ?? 0.5), band: { min: 0.05, max: 0.95 } },
    };
    for (const [field, { values, band }] of Object.entries(fields)) {
      const { bottom, top } = outerTenths(values, band);
      expect(bottom, `${field} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${field} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${field} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${field} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('the robot detune is centred on 0 cents: median 0, +4 or more and -4 or less each 1-5 % of robots, every whole cent from -5 to 5', () => {
    const detunes = ATTRIBUTES.map((a) => a.detune ?? 0).sort((a, b) => a - b);
    expect(detunes[Math.floor(detunes.length / 2)]).toBe(0);
    const high = detunes.filter((d) => d >= 4).length / detunes.length;
    const low = detunes.filter((d) => d <= -4).length / detunes.length;
    for (const [side, share] of [['+4 or more', high], ['-4 or less', low]] as const) {
      expect(share, side).toBeGreaterThanOrEqual(0.01);
      expect(share, side).toBeLessThanOrEqual(0.05);
    }
    expect(new Set(detunes)).toEqual(new Set(Array.from({ length: 11 }, (_, i) => i - 5)));
  });

  it('guard: 12.5 % of robots glide (+/-2 points), the share as heard', () => {
    const gliders = ATTRIBUTES.filter((a) => (a.portamento ?? 0) > 0).length / ATTRIBUTES.length;
    expect(gliders).toBeGreaterThanOrEqual(0.105);
    expect(gliders).toBeLessThanOrEqual(0.145);
  });

  it('each of the six draws is the even draw at its own dataId and the robot\'s offset, and the detune the centred one', () => {
    const portamento = CLASSIC['robot.portamento'];
    for (const { noiseMap, offset } of SLOTS.slice(0, 120)) {
      const a = generateAudioAttributes(noiseMap, offset);
      const even = (dataId: string, min = 0, max = 1) => getUniformSeededVal(noiseMap, dataId, offset, min, max);
      const glider = even('robot.audio.portamento.glider') < portamento.lit;
      expect(a.portamento).toBe(glider ? quantizeToStep(even('robot.audio.portamento', portamento.min, portamento.max), 0, 0.01) : 0);
      expect(a.octaveRange).toEqual(OCTAVE_REGISTERS[Math.floor(even('robot.audio.register', 0, OCTAVE_REGISTERS.length))]);
      expect(a.phase).toBe(Math.floor(even('robot.audio.phase', 0, 361)));
      expect(pulseWidthOf(a)).toBe(even('robot.audio.pulseWidth', 0.05, 0.95));
      expect(a.detune).toBe(Math.round(getCentredSeededVal(noiseMap, 'robot.audio.detune', offset, -5, 5)));
    }
  });

  it('fallback: over a constant-zero map (no locale noise) every field is still in its band', () => {
    const zero: NoiseFunction2D = () => 0;
    for (let offset = 0; offset < 12; offset++) {
      const a = generateAudioAttributes(zero, offset);
      expect(a.portamento === 0 || ((a.portamento ?? 0) >= 0.05 - 1e-9 && (a.portamento ?? 0) <= 0.2 + 1e-9)).toBe(true);
      expect(OCTAVE_REGISTERS).toContainEqual(a.octaveRange);
      expect(a.phase).toBeGreaterThanOrEqual(0);
      expect(a.phase).toBeLessThanOrEqual(360);
      expect(a.detune).toBeGreaterThanOrEqual(-5);
      expect(a.detune).toBeLessThanOrEqual(5);
      expect(pulseWidthOf(a)).toBeGreaterThanOrEqual(0.05);
      expect(pulseWidthOf(a)).toBeLessThanOrEqual(0.95);
    }
  });
});

/** Pearson's r of two equal-length series. */
function correlation(a: readonly number[], b: readonly number[]): number {
  const mean = (xs: readonly number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < a.length; i++) {
    cov += (a[i] - ma) * (b[i] - mb);
    va += (a[i] - ma) ** 2;
    vb += (b[i] - mb) ** 2;
  }
  return cov / Math.sqrt(va * vb);
}

describe('generateRobotLfoLinks — even rolls and depths, the detune depth folded to the floor (Even Seeded Draws T8)', () => {
  // 5,000 worlds x 12 robots: only 13.5 % of robots carry a lit bus link, and at this size its depth tenths (about 9 %
  // each on the whole-percent grid) sit at least 3 standard deviations inside 8-12 %.
  const ZERO_COUNTS: Record<LfoLaneId, number> = { a: 0, b: 0, c: 0, d: 0 };
  const LINK_SLOTS = Array.from({ length: 5000 }, (_, i) => createNoise2D(alea(`links:${i}`))).flatMap((noiseMap) =>
    Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })),
  );
  const LINKS = LINK_SLOTS.map(({ noiseMap, offset }) => generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS));
  const litDepths = (targets: readonly RobotLfoTargetId[]) =>
    LINKS.flatMap((links) => targets.map((t) => links[t])).filter((l) => l.lane !== null).map((l) => l.depth);
  // The envelope stages of the first 12,000 robots, for the on-roll correlations: built here, not in the test, which
  // would outrun its timeout under a full parallel run.
  const ENVELOPES = LINK_SLOTS.slice(0, 12000).map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC));
  const GAINS = ['layer0.gain', 'layer1.gain', 'layer2.gain'] as const;
  const DETUNES = ['layer0.detune', 'layer1.detune', 'layer2.detune'] as const;

  it('a lit gain or bus link\'s depth fills its window: 8-12 % of lit links in each outer tenth', () => {
    const windows = {
      gain: { depths: litDepths(GAINS), band: CLASSIC['robot.lfoGainDepth'] },
      bus: { depths: litDepths(['bus.frequency']), band: CLASSIC['robot.lfoBusDepth'] },
    };
    for (const [window, { depths, band }] of Object.entries(windows)) {
      const { bottom, top } = outerTenths(depths, band);
      expect(bottom, `${window} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${window} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${window} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${window} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('a lit detune link stays close to no detune: 1 % is the commonest depth (17-21 %), each percent rarer than the one below, median 3 %, at most 2.5 % at 10 %', () => {
    const depths = litDepths(DETUNES).sort((a, b) => a - b);
    const shares = Array.from({ length: 10 }, (_, k) => depths.filter((d) => d === k + 1).length / depths.length);
    expect(shares.every((share) => share > 0), 'every whole percent from 1 to 10 occurs').toBe(true);
    expect(shares[0], '1 %').toBeGreaterThanOrEqual(0.17);
    expect(shares[0], '1 %').toBeLessThanOrEqual(0.21);
    for (let k = 1; k < 10; k++) expect(shares[k], `${k + 1} % against ${k} %`).toBeLessThan(shares[k - 1]);
    expect(depths[Math.floor(depths.length / 2)]).toBe(3);
    expect(shares[9], '10 %').toBeLessThanOrEqual(0.025);
  });

  it('the seven on-rolls correlate under 0.1 with each other and with the four envelope stages', () => {
    const lit = Object.fromEntries(ROBOT_LFO_TARGET_IDS.map((t) => [t, LINKS.map((links) => (links[t].lane === null ? 0 : 1))]));
    for (let i = 0; i < ROBOT_LFO_TARGET_IDS.length; i++) {
      for (let j = i + 1; j < ROBOT_LFO_TARGET_IDS.length; j++) {
        const [a, b] = [ROBOT_LFO_TARGET_IDS[i], ROBOT_LFO_TARGET_IDS[j]];
        expect(Math.abs(correlation(lit[a], lit[b])), `${a} vs ${b}`).toBeLessThan(0.1);
      }
    }
    for (const stage of ['attack', 'decay', 'sustain', 'release'] as const) {
      const values = ENVELOPES.map((e) => e[stage]);
      for (const target of ROBOT_LFO_TARGET_IDS) {
        const onRolls = lit[target].slice(0, ENVELOPES.length);
        expect(Math.abs(correlation(values, onRolls)), `${stage} vs ${target} on-roll`).toBeLessThan(0.1);
      }
    }
  });

  it('guards: each layer target is lit for 25 % of robots (+/-2 points), the bus for 13.5 % (+/-2), the shares as fitted', () => {
    for (const target of ROBOT_LFO_TARGET_IDS) {
      const share = LINKS.filter((links) => links[target].lane !== null).length / LINKS.length;
      const want = target === 'bus.frequency' ? 0.135 : 0.25;
      expect(share, target).toBeGreaterThanOrEqual(want - 0.02);
      expect(share, target).toBeLessThanOrEqual(want + 0.02);
    }
  });

  it('each roll, lane and depth is the even draw at its own dataId and offset, a detune depth the folded centred one', () => {
    for (const { noiseMap, offset } of LINK_SLOTS.slice(0, 120)) {
      const links = generateRobotLfoLinks(noiseMap, offset, ZERO_COUNTS);
      const counts = { ...ZERO_COUNTS };
      for (const target of ROBOT_LFO_TARGET_IDS) {
        const band = target === 'bus.frequency' ? CLASSIC['robot.lfoBusDepth'] : target.endsWith('.gain') ? CLASSIC['robot.lfoGainDepth'] : CLASSIC['robot.lfoDetuneDepth'];
        const even = (part: string, min = 0, max = 1) => getUniformSeededVal(noiseMap, `robot.lfo.${target}.${part}`, offset, min, max);
        if (even('quiet') < 1 - band.lit) {
          expect(links[target], target).toEqual({ lane: null, depth: 0 });
          continue;
        }
        const lane = pickLane(even('lane'), counts);
        counts[lane]++;
        const depth = target.endsWith('.detune')
          ? band.min + Math.min(band.max - band.min, Math.floor(Math.abs(getCentredSeededVal(noiseMap, `robot.lfo.${target}.depth`, offset, -1, 1)) * (band.max - band.min + 1)))
          : quantizeToStep(even('depth', band.min, band.max), 0, 1);
        expect(links[target], target).toEqual({ lane, depth });
      }
    }
  });
});
