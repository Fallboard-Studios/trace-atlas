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
  isWarmHue,
  satCapFor,
  SAT_CAP_BANDS,
  ACCENT_WARM_BAND_START,
  ACCENT_WARM_BAND_END,
  ACCENT_WARM_SAT_CAP,
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

  // Checkpoint B tuning (Crawford, 2026-10-02): warm seeds came out "like candy" — six of the 18
  // accents sit in the red→orange band and the 24-building Monolith row already carries +40..60
  // saturation, so a warm primary plus the lift made a wall of hot red. Cool seeds looked right,
  // so the lift is tempered for warm hues only. Spec §1.1 amendment.
  describe('warm-band saturation cap', () => {
    it('isWarmHue covers the red→orange band inclusively and wraps across 0', () => {
      expect(isWarmHue(ACCENT_WARM_BAND_START)).toBe(true);
      expect(isWarmHue(ACCENT_WARM_BAND_END)).toBe(true);
      expect(isWarmHue(0)).toBe(true);
      expect(isWarmHue(359.9)).toBe(true);
      expect(isWarmHue(ACCENT_WARM_BAND_START - 0.1)).toBe(false);
      expect(isWarmHue(ACCENT_WARM_BAND_END + 0.1)).toBe(false);
      expect(isWarmHue(172)).toBe(false); // teal
      expect(isWarmHue(200)).toBe(false); // the graphite base
    });

    it('caps a hot warm body: the saturation delta brings it DOWN to the cap, not up by the lift', () => {
      const hotRed: HSL = { h: 4, s: 70, l: 19 }; // a red Monolith after its own +50 variant shift
      const lean = computeAccentLeanWith(hotRed, 4, 0.5, 15);
      expect(lean.satShift).toBe(ACCENT_WARM_SAT_CAP - 70); // negative
      expect(lean.satShift).toBeLessThan(0);
    });

    it('a warm body already under the cap gets the smaller of the full lift and the headroom to the cap', () => {
      const underCap: HSL = { h: 20, s: ACCENT_WARM_SAT_CAP - 5, l: 19 };
      expect(computeAccentLeanWith(underCap, 20, 0.5, 15).satShift).toBe(5);
      const wellUnder: HSL = { h: 20, s: 10, l: 19 };
      expect(computeAccentLeanWith(wellUnder, 20, 0.5, 15).satShift).toBe(15);
    });

    it('a cool body gets the full lift regardless of saturation — the cap is warm-only', () => {
      expect(computeAccentLeanWith({ h: 172, s: 95, l: 19 }, 172, 0.5, 15).satShift).toBe(15);
      expect(computeAccentLeanWith({ h: 200, s: 70, l: 19 }, 200, 0.5, 15).satShift).toBe(15);
    });

    it('judges warmth by the POST-pull hue, not the body or the target alone', () => {
      // Graphite body at 200° pulled halfway toward red (4°) lands near 282° — cool — so no cap.
      const half = computeAccentLeanWith({ h: 200, s: 70, l: 19 }, 4, 0.5, 15);
      expect(isWarmHue(200 + half.hueShift)).toBe(false);
      expect(half.satShift).toBe(15);
      // The same body snapped all the way (fraction 1) lands ON red — warm — so the cap applies.
      const snap = computeAccentLeanWith({ h: 200, s: 70, l: 19 }, 4, 1, 15);
      expect(isWarmHue(((200 + snap.hueShift) % 360 + 360) % 360)).toBe(true);
      expect(snap.satShift).toBe(ACCENT_WARM_SAT_CAP - 70);
    });

    it('ships with the tuned cap value', () => {
      expect(ACCENT_WARM_SAT_CAP).toBe(45);
      expect(ACCENT_WARM_BAND_START).toBe(330);
      expect(ACCENT_WARM_BAND_END).toBe(45);
    });

    // Second look (Crawford, 2026-10-02): "there's a lime green that sticks out from time to
    // time" — the lime accent (#a9e583, h≈97°) is a yellow-green, loud at any lightness once
    // saturated. Same cap, second band; the warm band became the first row of a table.
    describe('lime band (the cap is a table of bands, not one special case)', () => {
      it('the lime accent itself falls inside the lime band and no other accent does', () => {
        const limeIndex = ROBOT_IDENTITY_COLOR_NAMES.indexOf('lime');
        expect(satCapFor(ACCENT_HUES[limeIndex])).toBe(ACCENT_WARM_SAT_CAP);
        ROBOT_IDENTITY_COLOR_NAMES.forEach((name, i) => {
          if (name === 'lime') return;
          const h = ACCENT_HUES[i];
          if (isWarmHue(h)) return; // warm accents are capped by the first band, by design
          expect(satCapFor(h), name).toBeNull();
        });
      });

      it('caps a hot lime body the same way it caps a hot red one', () => {
        const hotLime: HSL = { h: 97, s: 70, l: 19 };
        expect(computeAccentLeanWith(hotLime, 97, 0.5, 15).satShift).toBe(ACCENT_WARM_SAT_CAP - 70);
      });

      it('leaves the neighbouring greens alone: emerald (~143°) and green (~148°) get the full lift', () => {
        for (const name of ['emerald', 'green'] as const) {
          const h = ACCENT_HUES[ROBOT_IDENTITY_COLOR_NAMES.indexOf(name)];
          expect(satCapFor(h), name).toBeNull();
          expect(computeAccentLeanWith({ h, s: 70, l: 19 }, h, 0.5, 15).satShift, name).toBe(15);
        }
      });

      it('yellow (~57°) is NOT capped — only red was reported too strong on that side, and the warm band ends at 45°', () => {
        const h = ACCENT_HUES[ROBOT_IDENTITY_COLOR_NAMES.indexOf('yellow')];
        expect(h).toBeGreaterThan(ACCENT_WARM_BAND_END);
        expect(satCapFor(h)).toBeNull();
      });

      it('satCapFor returns the band cap inside every band and null between bands, inclusive at band ends', () => {
        for (const band of SAT_CAP_BANDS) {
          expect(satCapFor(band.start)).toBe(band.cap);
          expect(satCapFor(band.end)).toBe(band.cap);
        }
        expect(satCapFor(200)).toBeNull(); // the graphite base
        expect(satCapFor(172)).toBeNull(); // teal
        expect(satCapFor(60)).toBeNull();  // between the warm and lime bands
        expect(satCapFor(130)).toBeNull(); // between lime and the cool greens
      });
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
