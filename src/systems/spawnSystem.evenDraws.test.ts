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
import { generateAudioAttributes } from './spawnSystem';

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
