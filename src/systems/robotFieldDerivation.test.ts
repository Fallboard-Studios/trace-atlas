// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import { ENVELOPE_CURVE_NAMES } from '../types/Robot';
import { CLASSIC } from '../data/bands/classic';
import { getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { deriveEnvelopeFields, deriveMelodyFields, seedToggleValue } from './robotFieldDerivation';

// ========================================
// THE SAMPLE
// ========================================
// Even Seeded Draws (docs/specs/EVEN_SEEDED_DRAWS.md §5.1): the real generators over seeded locale maps, about 400
// worlds x 12 robots, as the measuring harness runs them. A share is held to +/-2 points, a correlation to |r| < 0.1.
const WORLD_COUNT = 400;
const ROBOTS_PER_WORLD = 12;
const WORLDS = Array.from({ length: WORLD_COUNT }, (_, i) => createNoise2D(alea(`${i * 37 - 7000}:${i * 91 - 18000}`)));
const ROBOT_SLOTS = WORLDS.flatMap((noiseMap) => Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => ({ noiseMap, offset })));

/** The share of `values` in the bottom tenth and in the top tenth of [min, max]. */
function outerTenths(values: readonly number[], { min, max }: { min: number; max: number }): { bottom: number; top: number } {
  const tenth = (max - min) / 10;
  return {
    bottom: values.filter((v) => v < min + tenth).length / values.length,
    top: values.filter((v) => v >= max - tenth).length / values.length,
  };
}

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

// ========================================
// TESTS
// ========================================

describe('deriveEnvelopeFields — even draws (Even Seeded Draws T4)', () => {
  const ENVELOPES = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC));
  const NON_LINEAR = ENVELOPE_CURVE_NAMES.filter((name) => name !== 'linear');

  it('a linear robot fills each stage band: 8-12 % of robots in each outer tenth of attack, decay, sustain and release', () => {
    const stages = {
      attack: { values: ENVELOPES.filter((e) => e.attackCurve === 'linear').map((e) => e.attack), band: CLASSIC['robot.attack'] },
      decay: { values: ENVELOPES.map((e) => e.decay), band: CLASSIC['robot.decay'] },
      sustain: { values: ENVELOPES.map((e) => e.sustain), band: CLASSIC['robot.sustain'] },
      release: { values: ENVELOPES.filter((e) => e.releaseCurve === 'linear').map((e) => e.release), band: CLASSIC['robot.release'] },
    };
    for (const [stage, { values, band }] of Object.entries(stages)) {
      const { bottom, top } = outerTenths(values, band);
      expect(bottom, `${stage} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${stage} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${stage} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${stage} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('decay and sustain correlate under 0.1 with each other and with attack and release', () => {
    const series = {
      attack: ENVELOPES.map((e) => e.attack),
      decay: ENVELOPES.map((e) => e.decay),
      sustain: ENVELOPES.map((e) => e.sustain),
      release: ENVELOPES.map((e) => e.release),
    };
    const pairs = [['decay', 'sustain'], ['decay', 'attack'], ['decay', 'release'], ['sustain', 'attack'], ['sustain', 'release']] as const;
    for (const [a, b] of pairs) {
      expect(Math.abs(correlation(series[a], series[b])), `${a} vs ${b}`).toBeLessThan(0.1);
    }
  });

  it('every non-linear curve is drawn by at least 15 % of the robots that shape that stage', () => {
    // Six curves split about 730 shaped robots per stage in the main sample: one curve's share then varies by about 1.4
    // points around its even 16.7 %, so this case draws 24,000 robots (about 3,700 shaped, 0.6 points).
    const wide = Array.from({ length: 2000 }, (_, i) => createNoise2D(alea(`curves:${i}`))).flatMap((noiseMap) =>
      Array.from({ length: ROBOTS_PER_WORLD }, (_, offset) => deriveEnvelopeFields(noiseMap, offset, CLASSIC)),
    );
    for (const stage of ['attackCurve', 'releaseCurve'] as const) {
      const shaped = wide.filter((e) => e[stage] !== 'linear');
      for (const curve of NON_LINEAR) {
        const share = shaped.filter((e) => e[stage] === curve).length / shaped.length;
        expect(share, `${stage} ${curve}`).toBeGreaterThanOrEqual(0.15);
      }
    }
  });

  it('guard: 15.5 % of robots shape their attack and 15 % their release (+/-2 points), the shares as heard', () => {
    const shapedAttack = ENVELOPES.filter((e) => e.attackCurve !== 'linear').length / ENVELOPES.length;
    const shapedRelease = ENVELOPES.filter((e) => e.releaseCurve !== 'linear').length / ENVELOPES.length;
    expect(shapedAttack).toBeGreaterThanOrEqual(0.135);
    expect(shapedAttack).toBeLessThanOrEqual(0.175);
    expect(shapedRelease).toBeGreaterThanOrEqual(0.13);
    expect(shapedRelease).toBeLessThanOrEqual(0.17);
  });

  it('each stage and each curve roll is the even draw at its own dataId and the robot\'s offset', () => {
    const shapedAttack = CLASSIC['robot.shapedAttack'];
    const shapedRelease = CLASSIC['robot.shapedRelease'];
    for (const { noiseMap, offset } of ROBOT_SLOTS.slice(0, 120)) {
      const e = deriveEnvelopeFields(noiseMap, offset, CLASSIC);
      const even = (dataId: string, band: { min: number; max: number }, at = offset) => getUniformSeededVal(noiseMap, dataId, at, band.min, band.max);
      const unit = { min: 0, max: 1 };
      expect(e.attackCurve === 'linear').toBe(even('robot.audio.attackCurve.shaped', unit) >= shapedAttack.lit);
      expect(e.releaseCurve === 'linear').toBe(even('robot.audio.releaseCurve.shaped', unit) >= shapedRelease.lit);
      if (e.attackCurve !== 'linear') {
        expect(e.attackCurve).toBe(NON_LINEAR[Math.floor(even('robot.audio.attackCurve.which', { min: 0, max: NON_LINEAR.length }, offset * 10 + 1))]);
      }
      if (e.releaseCurve !== 'linear') {
        expect(e.releaseCurve).toBe(NON_LINEAR[Math.floor(even('robot.audio.releaseCurve.which', { min: 0, max: NON_LINEAR.length }, offset * 10 + 1))]);
      }
      expect(e.attack).toBe(even('robot.audio.attack', e.attackCurve === 'linear' ? CLASSIC['robot.attack'] : shapedAttack));
      expect(e.decay).toBe(even('robot.audio.decay', CLASSIC['robot.decay']));
      expect(e.sustain).toBe(even('robot.audio.sustain', CLASSIC['robot.sustain']));
      expect(e.release).toBe(even('robot.audio.release', e.releaseCurve === 'linear' ? CLASSIC['robot.release'] : shapedRelease));
    }
  });
});

describe('deriveMelodyFields — even draws (Even Seeded Draws T5)', () => {
  const MELODY = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveMelodyFields(noiseMap, offset, CLASSIC));
  const TOGGLES = ['rhythmicMotifLength', 'noteVariance'] as const;

  it('density and pitch repeat fill their bands: 8-12 % of robots in each outer tenth', () => {
    const fields = {
      rhythmicDensity: CLASSIC['robot.rhythmicDensity'],
      pitchRepeat: CLASSIC['robot.pitchRepeat'],
    } as const;
    for (const [field, band] of Object.entries(fields) as [keyof typeof fields, (typeof fields)[keyof typeof fields]][]) {
      const { bottom, top } = outerTenths(MELODY.map((m) => m[field]), band);
      expect(bottom, `${field} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${field} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${field} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${field} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('Motif Length and Note Variance are each off for 15 % of robots (+/-2 points), the written offShare', () => {
    for (const toggle of TOGGLES) {
      const off = MELODY.filter((m) => !m[toggle].active).length / MELODY.length;
      expect(off, toggle).toBeGreaterThanOrEqual(0.13);
      expect(off, toggle).toBeLessThanOrEqual(0.17);
    }
  });

  it('an on toggle spreads across 1-8: each value is 9-16 % of the robots with it on', () => {
    for (const toggle of TOGGLES) {
      const on = MELODY.filter((m) => m[toggle].active);
      for (let value = 1; value <= 8; value++) {
        const share = on.filter((m) => m[toggle].value === value).length / on.length;
        expect(share, `${toggle} ${value}`).toBeGreaterThanOrEqual(0.09);
        expect(share, `${toggle} ${value}`).toBeLessThanOrEqual(0.16);
      }
    }
  });

  it('density correlates under 0.1 with sustain and with the glider roll', () => {
    const density = MELODY.map((m) => m.rhythmicDensity);
    const sustain = ROBOT_SLOTS.map(({ noiseMap, offset }) => deriveEnvelopeFields(noiseMap, offset, CLASSIC).sustain);
    const gliderRoll = ROBOT_SLOTS.map(({ noiseMap, offset }) => getSeededVal(noiseMap, 'robot.audio.portamento.glider', offset, 0, 1));
    expect(Math.abs(correlation(density, sustain)), 'density vs sustain').toBeLessThan(0.1);
    expect(Math.abs(correlation(density, gliderRoll)), 'density vs glider roll').toBeLessThan(0.1);
  });

  it('each melody field is the even draw at its own dataId and the robot\'s offset', () => {
    for (const { noiseMap, offset } of ROBOT_SLOTS.slice(0, 120)) {
      const m = deriveMelodyFields(noiseMap, offset, CLASSIC);
      const density = CLASSIC['robot.rhythmicDensity'];
      const repeat = CLASSIC['robot.pitchRepeat'];
      expect(m.rhythmicDensity).toBe(Math.round(getUniformSeededVal(noiseMap, 'robot.rhythmicDensity', offset, density.min, density.max)));
      expect(m.pitchRepeat).toBe(Math.round(getUniformSeededVal(noiseMap, 'robot.pitchRepeat', offset, repeat.min, repeat.max)));
      expect(m.rhythmicMotifLength).toEqual(
        seedToggleValue(getUniformSeededVal(noiseMap, 'robot.rhythmicMotifLength.active', offset), CLASSIC['robot.rhythmicMotifLength']),
      );
      expect(m.noteVariance).toEqual(seedToggleValue(getUniformSeededVal(noiseMap, 'robot.noteVariance.active', offset), CLASSIC['robot.noteVariance']));
    }
  });
});
