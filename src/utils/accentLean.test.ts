import { describe, it, expect } from 'vitest';

import {
  ACCENT_PULL_FRACTION,
  ACCENT_SAT_LIFT,
  ACCENT_HUES,
  hueArc,
  nearestAccentIndex,
  secondaryFor,
  computeAccentLean,
  computeAccentLeanWith,
} from './accentLean';
import { hexToHsl, type HSL } from './colorUtils';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';

// docs/specs/WORLD_PALETTE_PULL.md §1.1 / docs/tasks/WORLD_PALETTE_PULL.md Task 2.
// Pure hue math — no store, no React, no noise map. These tests are the oracle every later
// placement/recolor test leans on; nothing downstream re-derives this arithmetic.

/** Brute-force oracle: the accent index with the smallest absolute arc to `hue`. */
function bruteNearest(hue: number, exclude = -1): number {
  let best = -1;
  let bestArc = Infinity;
  ACCENT_HUES.forEach((h, i) => {
    if (i === exclude) return;
    const a = Math.abs(hueArc(hue, h));
    if (a < bestArc) { bestArc = a; best = i; }
  });
  return best;
}

describe('accentLean', () => {
  describe('ACCENT_HUES', () => {
    it('has exactly 18 entries, one per ROBOT_IDENTITY_COLOR_NAMES in that order, each from hexToHsl', () => {
      expect(ACCENT_HUES).toHaveLength(18);
      expect(ROBOT_IDENTITY_COLOR_NAMES).toHaveLength(18);
      ROBOT_IDENTITY_COLOR_NAMES.forEach((name, i) => {
        expect(ACCENT_HUES[i], name).toBe(hexToHsl(ACCENT_COLORS[name]).h);
      });
    });

    it('keeps every hue in [0, 360)', () => {
      for (const h of ACCENT_HUES) {
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(360);
      }
    });
  });

  describe('hueArc', () => {
    it('takes the short way across the 0/360 seam in both directions', () => {
      expect(hueArc(350, 10)).toBe(20);
      expect(hueArc(10, 350)).toBe(-20);
    });

    it('returns +180 (not −180) for an exact half-turn, and 0 for equal hues', () => {
      expect(hueArc(0, 180)).toBe(180);
      expect(hueArc(90, 90)).toBe(0);
    });

    it('always lands in (−180, 180] across a full sweep of from/to pairs', () => {
      for (let from = 0; from < 360; from += 7) {
        for (let to = 0; to < 360; to += 11) {
          const a = hueArc(from, to);
          expect(a, `${from}→${to}`).toBeGreaterThan(-180);
          expect(a, `${from}→${to}`).toBeLessThanOrEqual(180);
          // Walking the arc from `from` really arrives at `to`.
          expect(((from + a) % 360 + 360) % 360, `${from}→${to}`).toBeCloseTo(to % 360, 9);
        }
      }
    });
  });

  describe('nearestAccentIndex', () => {
    it('matches a brute-force shortest-arc search for every integer hue', () => {
      for (let hue = 0; hue < 360; hue++) {
        expect(nearestAccentIndex(hue), `hue ${hue}`).toBe(bruteNearest(hue));
      }
    });

    it('crosses the 0/360 seam: a hue just below 360 can be nearest an accent just above 0', () => {
      // Real palette values, not synthetic: red (#cd5e57) sits a few degrees above 0°, so a hue
      // a few degrees below 360° must resolve to it rather than to the nearest accent below it.
      const redIndex = ROBOT_IDENTITY_COLOR_NAMES.indexOf('red');
      const redHue = ACCENT_HUES[redIndex];
      expect(redHue).toBeGreaterThan(0);
      expect(redHue).toBeLessThan(15); // precondition on the palette itself
      const probe = ((redHue - 6) % 360 + 360) % 360; // 6° below red, i.e. ≈ 358°
      expect(probe).toBeGreaterThan(350);
      expect(nearestAccentIndex(probe)).toBe(redIndex);
    });
  });

  describe('secondaryFor', () => {
    it('never returns the primary itself and always returns the nearest OTHER accent', () => {
      for (let i = 0; i < ACCENT_HUES.length; i++) {
        const s = secondaryFor(i);
        expect(s, `primary ${i}`).not.toBe(i);
        expect(s, `primary ${i}`).toBe(bruteNearest(ACCENT_HUES[i], i));
      }
    });

    it('produces an analogous pair (≤ 60° apart) for every primary — fails loudly if the palette ever grows a wider gap', () => {
      for (let i = 0; i < ACCENT_HUES.length; i++) {
        const gap = Math.abs(hueArc(ACCENT_HUES[i], ACCENT_HUES[secondaryFor(i)]));
        expect(gap, `${ROBOT_IDENTITY_COLOR_NAMES[i]} → ${ROBOT_IDENTITY_COLOR_NAMES[secondaryFor(i)]}`).toBeLessThanOrEqual(60);
      }
    });
  });

  describe('computeAccentLeanWith', () => {
    const body = (h: number): HSL => ({ h, s: 15, l: 19 }); // the graphite factory base at a given hue

    it('moves exactly `fraction` of the shortest arc toward the target and lifts saturation by `lift`, for every body/target combination', () => {
      for (let h = 0; h < 360; h += 15) {
        for (const target of ACCENT_HUES) {
          const lean = computeAccentLeanWith(body(h), target, 0.5, 15);
          expect(lean.hueShift, `body ${h} → ${target}`).toBe(hueArc(h, target) * 0.5);
          expect(lean.satShift, `body ${h} → ${target}`).toBe(15);
        }
      }
    });

    it('fraction 0 leaves hue alone', () => {
      for (const target of ACCENT_HUES) {
        expect(computeAccentLeanWith(body(200), target, 0, 15).hueShift).toBe(0);
      }
    });

    it('fraction 1 lands exactly on the target hue (snap)', () => {
      for (let h = 0; h < 360; h += 15) {
        for (const target of ACCENT_HUES) {
          const lean = computeAccentLeanWith(body(h), target, 1, 0);
          const landed = ((h + lean.hueShift) % 360 + 360) % 360;
          expect(landed, `body ${h} → ${target}`).toBeCloseTo(target, 9);
        }
      }
    });

    it('never overshoots: the post-lean arc to the target has the same sign as (or is shorter than) the pre-lean arc, for every fraction in [0, 1]', () => {
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        for (let h = 0; h < 360; h += 15) {
          for (const target of ACCENT_HUES) {
            const before = hueArc(h, target);
            const after = hueArc(((h + computeAccentLeanWith(body(h), target, fraction, 0).hueShift) % 360 + 360) % 360, target);
            expect(Math.abs(after), `f=${fraction} body ${h} → ${target}`).toBeLessThanOrEqual(Math.abs(before) + 1e-9);
            if (Math.abs(after) > 1e-9) expect(Math.sign(after), `f=${fraction} body ${h} → ${target}`).toBe(Math.sign(before));
          }
        }
      }
    });

    it('does not clamp saturation itself — composes additively like the AS shift (shiftHSL clamps at render)', () => {
      expect(computeAccentLeanWith({ h: 200, s: 95, l: 19 }, 180, 0.5, 15).satShift).toBe(15);
    });
  });

  describe('computeAccentLean (bound to the module constants)', () => {
    it('equals computeAccentLeanWith(body, target, ACCENT_PULL_FRACTION, ACCENT_SAT_LIFT)', () => {
      for (let h = 0; h < 360; h += 45) {
        for (const target of ACCENT_HUES) {
          const b: HSL = { h, s: 15, l: 19 };
          expect(computeAccentLean(b, target)).toEqual(computeAccentLeanWith(b, target, ACCENT_PULL_FRACTION, ACCENT_SAT_LIFT));
        }
      }
    });

    it('ships with the spec\'s first-pass constants: half pull, +15 saturation (tune by eye at Checkpoint B, never here)', () => {
      expect(ACCENT_PULL_FRACTION).toBe(0.5);
      expect(ACCENT_SAT_LIFT).toBe(15);
    });
  });
});
