// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';

import {
  flickerPattern,
  flickerGain,
  FLICKER_WINDOW,
  FLICKER_BLINKS,
  FLICKER_BLINK,
  FLICKER_BLINK_JITTER,
  FLICKER_LOW,
  type Blink,
} from './stripFlicker';

// ========================================
// FIXTURES
// ========================================
/** The seed-stream convention documented in stripFlicker.ts: `${gemSeed}:flicker:${line}:${run}`. */
const rng = (gemSeed: number, line = 'top', run = 1) => alea(`${gemSeed}:flicker:${line}:${run}`);

const SEEDS = Array.from({ length: 1200 }, (_, i) => i * 7919 + 13);

// ========================================
// TESTS — flickerPattern (spec §1.3: 3–5 blinks, sorted, all inside [0, FLICKER_WINDOW))
// ========================================
describe('flickerPattern — over 1 200 seeds', () => {
  const patterns = SEEDS.map((s) => flickerPattern(rng(s)));

  it('has between 3 and 5 blinks', () => {
    for (const p of patterns) {
      expect(p.length).toBeGreaterThanOrEqual(3);
      expect(p.length).toBeLessThanOrEqual(5);
    }
  });

  it('uses every count 3, 4 and 5 somewhere in the sample', () => {
    const counts = new Set(patterns.map((p) => p.length));
    expect([...counts].sort()).toEqual([3, 4, 5]);
  });

  it('is sorted by `at`', () => {
    for (const p of patterns) {
      for (let i = 1; i < p.length; i++) expect(p[i].at).toBeGreaterThanOrEqual(p[i - 1].at);
    }
  });

  it('every blink starts at or after 0 and ends at or before FLICKER_WINDOW (at + len ≤ 2)', () => {
    for (const p of patterns) {
      for (const b of p) {
        expect(b.at).toBeGreaterThanOrEqual(0);
        expect(b.at + b.len).toBeLessThanOrEqual(FLICKER_WINDOW);
      }
    }
  });

  it('every blink length is FLICKER_BLINK × jitter, in [0.07, 0.13]', () => {
    for (const p of patterns) {
      for (const b of p) {
        expect(b.len).toBeGreaterThanOrEqual(0.07 - 1e-12);
        expect(b.len).toBeLessThanOrEqual(0.13 + 1e-12);
      }
    }
  });

  it('spreads blinks across the whole window (some start in the last quarter)', () => {
    const late = patterns.some((p) => p.some((b) => b.at > FLICKER_WINDOW * 0.75));
    expect(late).toBe(true);
  });
});

describe('flickerPattern — seeding', () => {
  it('is deterministic for one seed stream', () => {
    expect(flickerPattern(rng(42))).toEqual(flickerPattern(rng(42)));
  });

  it('two gem seeds give different patterns', () => {
    expect(flickerPattern(rng(42))).not.toEqual(flickerPattern(rng(43)));
  });

  it('run 1 and run 2 differ for one seed and line (successive edits differ)', () => {
    expect(flickerPattern(rng(42, 'top', 1))).not.toEqual(flickerPattern(rng(42, 'top', 2)));
  });

  it('two lines differ for one seed and run', () => {
    expect(flickerPattern(rng(42, 'top', 1))).not.toEqual(flickerPattern(rng(42, 'midLeft', 1)));
  });
});

// ========================================
// TESTS — flickerGain (spec §1.3: FLICKER_LOW inside a blink, else 1; 1 after the window)
// ========================================
describe('flickerGain', () => {
  const pattern: Blink[] = [
    { at: 0.25, len: 0.125 },
    { at: 0.9, len: 0.08 },
    { at: 1.5, len: 0.12 },
  ];

  it('is FLICKER_LOW (0) inside a blink', () => {
    expect(flickerGain(pattern, 0.25)).toBe(FLICKER_LOW);
    expect(flickerGain(pattern, 0.3)).toBe(0);
    expect(flickerGain(pattern, 0.95)).toBe(0);
    expect(flickerGain(pattern, 1.6)).toBe(0);
  });

  it('is 1 between blinks', () => {
    expect(flickerGain(pattern, 0)).toBe(1);
    expect(flickerGain(pattern, 0.5)).toBe(1);
    expect(flickerGain(pattern, 1.2)).toBe(1);
    expect(flickerGain(pattern, 1.8)).toBe(1);
  });

  it('a blink is half-open: 1 exactly at at + len (0.25 + 0.125 = 0.375, exact in binary)', () => {
    expect(flickerGain(pattern, 0.375)).toBe(1);
  });

  it('is 1 at and after FLICKER_WINDOW, even if a blink were to overlap it', () => {
    const overlapping: Blink[] = [{ at: 1.95, len: 0.1 }];
    expect(flickerGain(overlapping, FLICKER_WINDOW)).toBe(1);
    expect(flickerGain(overlapping, 2.5)).toBe(1);
    expect(flickerGain(overlapping, 1.97)).toBe(0);
  });

  it('is 1 before the window starts (t < 0)', () => {
    expect(flickerGain(pattern, -0.1)).toBe(1);
  });

  it('is 1 everywhere for an empty pattern', () => {
    expect(flickerGain([], 0.5)).toBe(1);
  });

  it('every generated pattern dips to 0 at each of its own blink starts and is 1 at 2 s', () => {
    for (const s of SEEDS.slice(0, 50)) {
      const p = flickerPattern(rng(s));
      for (const b of p) expect(flickerGain(p, b.at)).toBe(0);
      expect(flickerGain(p, FLICKER_WINDOW)).toBe(1);
    }
  });
});

describe('stripFlicker — constants match the intent table / sketch defaults', () => {
  it('window 2 s, 3–5 blinks of 0.1 s × 0.7–1.3, low 0', () => {
    expect(FLICKER_WINDOW).toBe(2);
    expect(FLICKER_BLINKS).toEqual([3, 5]);
    expect(FLICKER_BLINK).toBe(0.1);
    expect(FLICKER_BLINK_JITTER).toEqual([0.7, 1.3]);
    expect(FLICKER_LOW).toBe(0);
  });
});
