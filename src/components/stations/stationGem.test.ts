import { describe, it, expect } from 'vitest';
import alea from 'alea';

import {
  STATION_BEVEL_DEPTH,
  STATION_DIAL_RANGES,
  STATION_REFERENCE_DIALS,
  getStationRoll,
  offsetPolygon,
  rollStation,
  stationDials,
  stationGeometry,
  stationRadius,
  type StationDials,
  type StationGeometry,
} from './stationGem';
import { pointInPolygon, type GemPoint } from '../robot/gem/polygon';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '@/constants/accentColors';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '@/types/globalAudio';
import { STATION_BOX_H, STATION_BOX_W } from '@/constants';

// ========================================
// HELPERS
// ========================================
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);

const DIAL_CORNERS: StationDials[] = (() => {
  const out: StationDials[] = [];
  for (const gap of STATION_DIAL_RANGES.gap)
    for (const band of STATION_DIAL_RANGES.band)
      for (const spread of STATION_DIAL_RANGES.spread)
        for (const falloff of STATION_DIAL_RANGES.falloff) out.push({ gap, band, spread, falloff });
  return out;
})();

const rig = (over: Partial<{ hpfHz: number; lpfHz: number; eqLow: number; eqMid: number; eqHigh: number }> = {}) => ({
  hpfHz: 20,
  lpfHz: 20000,
  eqLow: 0,
  eqMid: 0,
  eqHigh: 0,
  ...over,
});

function polygonArea(pts: readonly GemPoint[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

function pointSegment(p: GemPoint, a: GemPoint, b: GemPoint): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Distance from p to a closed polygon's boundary. */
function toBoundary(p: GemPoint, poly: readonly GemPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegment(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

const pointOn = (p: GemPoint, poly: readonly GemPoint[]) => toBoundary(p, poly) < 1e-6;

/** Symmetric vertex-to-boundary distance between two outlines — small means "the same shape, nudged". */
function outlineShift(a: readonly GemPoint[], b: readonly GemPoint[]): number {
  return Math.max(...a.map((p) => toBoundary(p, b)), ...b.map((p) => toBoundary(p, a)));
}

/** Closest approach between two closed polygons' boundaries (vertex-to-edge both ways). */
function polygonGap(a: readonly GemPoint[], b: readonly GemPoint[]): number {
  return Math.min(...a.map((p) => toBoundary(p, b)), ...b.map((p) => toBoundary(p, a)));
}

const allOutlines = (g: StationGeometry): GemPoint[][] => [
  ...g.layers.flatMap((l) => (l.pieces.length ? l.pieces.map((p) => p.pts) : [l.outer])),
  g.port,
];

// ========================================
// TESTS
// ========================================
describe('stationDials — the world rig drives four geometry dials (spec §1.6)', () => {
  it('flat EQ and open filters land on the reference dials: gap 10, band 16, spread 45°, falloff 0.075', () => {
    expect(stationDials(rig())).toEqual({ gap: 10, band: 16, spread: 45, falloff: 0.075 });
    expect(STATION_REFERENCE_DIALS).toEqual({ gap: 10, band: 16, spread: 45, falloff: 0.075 });
  });

  it('the shipped default rig is the reference', () => {
    const d = DEFAULT_GLOBAL_AUDIO_SETTINGS;
    expect(
      stationDials({
        hpfHz: d.filterHPF.frequency,
        lpfHz: d.filterLPF.frequency,
        eqLow: d.eq3.low,
        eqMid: d.eq3.mid,
        eqHigh: d.eq3.high,
      }),
    ).toEqual(STATION_REFERENCE_DIALS);
  });

  it('HPF cutoff → gap 10–25, log from 20 Hz to 20 kHz', () => {
    expect(stationDials(rig({ hpfHz: 20000 })).gap).toBeCloseTo(25, 9);
    // 632 Hz is the geometric middle of 20 Hz–20 kHz.
    expect(stationDials(rig({ hpfHz: 20 * Math.sqrt(1000) })).gap).toBeCloseTo(17.5, 9);
  });

  it('LPF cutoff → band 8–16, log (closed = thin ring)', () => {
    expect(stationDials(rig({ lpfHz: 20 })).band).toBeCloseTo(8, 9);
    expect(stationDials(rig({ lpfHz: 20 * Math.sqrt(1000) })).band).toBeCloseTo(12, 9);
  });

  it('EQ3 mid −12 → +12 dB → spread 30–60°', () => {
    expect(stationDials(rig({ eqMid: -12 })).spread).toBeCloseTo(30, 9);
    expect(stationDials(rig({ eqMid: 12 })).spread).toBeCloseTo(60, 9);
    expect(stationDials(rig({ eqMid: 6 })).spread).toBeCloseTo(52.5, 9);
  });

  it('EQ3 tilt (low − high) −24 → +24 dB → falloff 0.03–0.12; mid plays no part', () => {
    expect(stationDials(rig({ eqLow: 12, eqHigh: -12 })).falloff).toBeCloseTo(0.12, 9);
    expect(stationDials(rig({ eqLow: -12, eqHigh: 12 })).falloff).toBeCloseTo(0.03, 9);
    expect(stationDials(rig({ eqLow: 6, eqHigh: 6, eqMid: 12 })).falloff).toBeCloseTo(0.075, 9);
  });

  it('clamps out-of-range rig values to the dial ends', () => {
    const d = stationDials({ hpfHz: 1e6, lpfHz: 1, eqLow: 40, eqMid: -40, eqHigh: -40 });
    expect(d).toEqual({ gap: 25, band: 8, spread: 30, falloff: 0.12 });
    const e = stationDials({ hpfHz: 0, lpfHz: 1e9, eqLow: -40, eqMid: 40, eqHigh: 40 });
    expect(e).toEqual({ gap: 10, band: 16, spread: 60, falloff: 0.03 });
  });
});

describe('rollStation — the seeded part of a station', () => {
  it('draws the same number of values from the stream for every seed (the dials can never shift it)', () => {
    const counts = new Set(
      SEEDS.map((seed) => {
        const R = alea(String(seed));
        let n = 0;
        rollStation(() => {
          n++;
          return R();
        });
        return n;
      }),
    );
    expect(counts.size).toBe(1);
  });

  it('is deterministic per seed and varies between seeds', () => {
    expect(rollStation(alea('7'))).toEqual(rollStation(alea('7')));
    const accents = new Set(SEEDS.map((s) => getStationRoll(s).accent));
    expect(accents.size).toBeGreaterThan(6);
  });

  it('the accent is one of the robot identity hues (same manufacturer)', () => {
    const allowed = new Set<string>(ROBOT_IDENTITY_COLOR_NAMES.map((n) => ACCENT_COLORS[n]));
    for (const s of SEEDS) expect(allowed.has(getStationRoll(s).accent)).toBe(true);
  });

  it('getStationRoll caches per seed', () => {
    expect(getStationRoll(42)).toBe(getStationRoll(42));
    expect(getStationRoll(42)).toEqual(rollStation(alea('42')));
  });
});

describe('stationGeometry — four rotated triangular gem layers (spec §1.6, Task 0a)', () => {
  it('L1–L3 are rings cut into three pieces; L4 (back) is one solid piece', () => {
    for (const s of SEEDS) {
      const g = stationGeometry(getStationRoll(s), STATION_REFERENCE_DIALS);
      expect(g.layers).toHaveLength(4);
      expect(g.layers.slice(0, 3).map((l) => l.pieces.length)).toEqual([3, 3, 3]);
      expect(g.layers[3].pieces).toHaveLength(0);
    }
  });

  it('six slots, two per broken layer, filled back to front: L3 holds 0–1, L2 2–3, L1 4–5', () => {
    for (const s of SEEDS) {
      const g = stationGeometry(getStationRoll(s), STATION_REFERENCE_DIALS);
      const slotsOf = (i: number) => g.layers[i].pieces.map((p) => p.slot).filter((k) => k >= 0).sort();
      expect(slotsOf(2)).toEqual([0, 1]);
      expect(slotsOf(1)).toEqual([2, 3]);
      expect(slotsOf(0)).toEqual([4, 5]);
    }
  });

  it('which pieces are slots varies with the seed', () => {
    const picks = new Set(SEEDS.map((s) => JSON.stringify(stationGeometry(getStationRoll(s), STATION_REFERENCE_DIALS).layers.map((l) => l.pieces.map((p) => p.slot)))));
    expect(picks.size).toBeGreaterThan(10);
  });

  it('falloff sizes the stack: radius_i = R·(1 − falloff·(3 − i)), the back layer the largest', () => {
    const R = stationRadius();
    expect(R).toBeCloseTo((Math.min(STATION_BOX_W, STATION_BOX_H) / 2) * 0.95, 9);
    for (const falloff of STATION_DIAL_RANGES.falloff) {
      const g = stationGeometry(getStationRoll(SEEDS[0]), { ...STATION_REFERENCE_DIALS, falloff });
      g.layers.forEach((l, i) => expect(l.radius).toBeCloseTo(R * (1 - falloff * (3 - i)), 9));
    }
  });

  it('spread twists each layer against the next: rot_i − rot_0 changes by i·Δspread (same direction for every layer)', () => {
    for (const s of SEEDS.slice(0, 10)) {
      const roll = getStationRoll(s);
      const a = stationGeometry(roll, { ...STATION_REFERENCE_DIALS, spread: 30 });
      const b = stationGeometry(roll, { ...STATION_REFERENCE_DIALS, spread: 60 });
      for (let i = 1; i < 4; i++) {
        const delta = (b.layers[i].rot - b.layers[0].rot) - (a.layers[i].rot - a.layers[0].rot);
        expect(Math.abs(delta)).toBeCloseTo(i * 30, 9);
        expect(Math.sign(delta)).toBe(roll.dir);
      }
    }
  });

  it('band sets the ring width (capped so the inner ring still encloses the centre)', () => {
    for (const s of SEEDS.slice(0, 10)) {
      for (const band of STATION_DIAL_RANGES.band) {
        const g = stationGeometry(getStationRoll(s), { ...STATION_REFERENCE_DIALS, band });
        for (const l of g.layers.slice(0, 3)) {
          expect(l.band).toBeLessThanOrEqual(band + 1e-9);
          expect(l.band).toBeGreaterThan(0);
          expect(pointInPolygon([0, 0], l.inner!)).toBe(true);
        }
      }
    }
  });

  it('the band is capped at 0.7 × the outer polygon’s inradius — it binds on a rare irregular front ring at full falloff', () => {
    const inradius = (pts: readonly GemPoint[]) =>
      Math.min(...pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length];
        return Math.abs(p[0] * (q[1] - p[1]) - p[1] * (q[0] - p[0])) / Math.hypot(q[0] - p[0], q[1] - p[1]);
      }));
    // Found by scanning 3000 seeds (2026-10-07): the cap binds on these three, and only rarely.
    for (const seed of [3389345, 5424528, 7475549]) {
      const g = stationGeometry(getStationRoll(seed), { gap: 10, band: 16, spread: 45, falloff: 0.12 });
      const capped = g.layers.slice(0, 3).filter((l) => l.band! < 16);
      expect(capped.length, `${seed}`).toBeGreaterThan(0);
      for (const l of capped) expect(l.band).toBeCloseTo(0.7 * inradius(l.outer), 9);
    }
  });

  it('every outline sits inside the station box at every dial corner', () => {
    for (const s of SEEDS) {
      for (const dials of DIAL_CORNERS) {
        for (const pts of allOutlines(stationGeometry(getStationRoll(s), dials))) {
          for (const [x, y] of pts) {
            expect(Math.abs(x)).toBeLessThanOrEqual(STATION_BOX_W / 2);
            expect(Math.abs(y)).toBeLessThanOrEqual(STATION_BOX_H / 2);
          }
        }
      }
    }
  }, 30_000);

  it('no piece is degenerate; along the outer edge neighbouring pieces keep the full gap, and they never touch anywhere', () => {
    for (const s of SEEDS) {
      for (const dials of [STATION_REFERENCE_DIALS, ...DIAL_CORNERS]) {
        const g = stationGeometry(getStationRoll(s), dials);
        for (const l of g.layers.slice(0, 3)) {
          for (const p of l.pieces) expect(polygonArea(p.pts)).toBeGreaterThan(40);
          for (let k = 0; k < 3; k++) {
            const here = l.pieces[k].pts;
            const next = l.pieces[(k + 1) % 3].pts;
            // ringPiece starts each piece at its first outer hit; its outer walk ends just before the inner walk.
            const outerEnd = here.findIndex((_, i) => i > 0 && pointOn(here[i], l.inner!)) - 1;
            const chord = Math.hypot(here[outerEnd][0] - next[0][0], here[outerEnd][1] - next[0][1]);
            expect(chord, `${s} outer break`).toBeGreaterThan(dials.gap * 0.8);
            // On a tiny inner ring the break tapers (cut angle capped at 0.4 of the span) but stays open.
            expect(polygonGap(here, next), `${s} touch`).toBeGreaterThan(dials.gap * 0.3);
          }
        }
      }
    }
  }, 30_000);

  it('the inner walk never wraps the wrong way round the ring, even at gap 25 on the smallest front ring', () => {
    for (const s of SEEDS) {
      const g = stationGeometry(getStationRoll(s), { gap: 25, band: 16, spread: 45, falloff: 0.12 });
      for (const l of g.layers.slice(0, 3)) {
        // Three pieces of one ring cover well under the whole ring's area between them.
        const ringArea = polygonArea(l.outer) - polygonArea(l.inner!);
        const total = l.pieces.reduce((n, p) => n + polygonArea(p.pts), 0);
        expect(total, `${s}`).toBeLessThan(ringArea);
        for (const p of l.pieces) expect(polygonArea(p.pts)).toBeLessThan(ringArea * 0.6);
      }
    }
  });

  it('bevel: min(STATION_BEVEL_DEPTH, 0.3 × band) on the pieces, 2 on the port — continuous in the LPF dial', () => {
    expect(STATION_BEVEL_DEPTH).toBe(5);
    for (const s of SEEDS.slice(0, 10)) {
      for (const dials of [STATION_REFERENCE_DIALS, ...DIAL_CORNERS]) {
        const g = stationGeometry(getStationRoll(s), dials);
        for (const l of g.layers.slice(0, 3)) for (const p of l.pieces) expect(p.bevel).toBeCloseTo(Math.min(5, 0.3 * l.band!), 9);
        expect(g.portBevel).toBe(2);
      }
    }
  });

  it('every face is the edge-dropping offset of its outline: no facet edge ever inverts, and the face stays inside', () => {
    for (const s of SEEDS) {
      for (const dials of [STATION_REFERENCE_DIALS, ...DIAL_CORNERS]) {
        const g = stationGeometry(getStationRoll(s), dials);
        const parts = [...g.layers.slice(0, 3).flatMap((l) => l.pieces), { pts: g.port, bevel: g.portBevel, face: g.portFace }];
        for (const p of parts) {
          expect(p.face).toEqual(offsetPolygon(p.pts, p.bevel));
          expect(p.face).toHaveLength(p.pts.length);
          const n = p.pts.length;
          for (let i = 0; i < n; i++) {
            const ex = p.pts[(i + 1) % n][0] - p.pts[i][0];
            const ey = p.pts[(i + 1) % n][1] - p.pts[i][1];
            const fx = p.face[(i + 1) % n][0] - p.face[i][0];
            const fy = p.face[(i + 1) % n][1] - p.face[i][1];
            expect(ex * fx + ey * fy, `${s} edge ${i}`).toBeGreaterThanOrEqual(-1e-9);
            expect(pointInPolygon(p.face[i], p.pts), `${s} face ${i}`).toBe(true);
          }
        }
      }
    }
  }, 30_000);

  it('offsetPolygon: a plain miter where nothing inverts; a collapsing edge folds into its neighbours', () => {
    const square: GemPoint[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(offsetPolygon(square, 1).map((p) => p.map((v) => +v.toFixed(9)))).toEqual([[1, 1], [9, 1], [9, 9], [1, 9]]);
    // A 0.2-long chamfer on the top-right corner: inset by 1, a miter would invert it.
    const chamfered: GemPoint[] = [[0, 0], [9.9, 0], [10, 0.1], [10, 10], [0, 10]];
    const face = offsetPolygon(chamfered, 1);
    expect(face[1]).toEqual(face[2]);
    expect(face[1][0]).toBeCloseTo(9, 9);
    expect(face[1][1]).toBeCloseTo(1, 9);
  });

  it('a dial drag deforms the station without a pop: a 1 % step moves every outline less than 2 units', () => {
    const keys = ['gap', 'band', 'spread', 'falloff'] as const;
    for (const s of SEEDS.slice(0, 30)) {
      const roll = getStationRoll(s);
      for (const key of keys) {
        const [lo, hi] = STATION_DIAL_RANGES[key];
        for (let t = 0; t < 1; t += 0.1) {
          const a = stationGeometry(roll, { ...STATION_REFERENCE_DIALS, [key]: lo + t * (hi - lo) });
          const b = stationGeometry(roll, { ...STATION_REFERENCE_DIALS, [key]: lo + (t + 0.01) * (hi - lo) });
          const oa = allOutlines(a);
          const ob = allOutlines(b);
          oa.forEach((pts, i) => expect(outlineShift(pts, ob[i]), `${s} ${key} ${t.toFixed(1)} #${i}`).toBeLessThan(2));
        }
      }
    }
  }, 30_000);

  it('slot picks, accent and line routes never change with the dials (no re-roll)', () => {
    for (const s of SEEDS.slice(0, 20)) {
      const roll = getStationRoll(s);
      const slots = (g: StationGeometry) => g.layers.map((l) => l.pieces.map((p) => p.slot));
      const lineCount = (g: StationGeometry) => g.layers.map((l) => l.pieces.map((p) => p.line?.length ?? 0));
      const ref = stationGeometry(roll, STATION_REFERENCE_DIALS);
      for (const dials of DIAL_CORNERS) {
        const g = stationGeometry(roll, dials);
        expect(slots(g)).toEqual(slots(ref));
        expect(lineCount(g)).toEqual(lineCount(ref));
      }
    }
  });

  it('boundary lines: almost every piece has one, and it stays on its piece at every dial corner', () => {
    let pieces = 0;
    let lined = 0;
    for (const s of SEEDS) {
      const roll = getStationRoll(s);
      for (const dials of [STATION_REFERENCE_DIALS, ...DIAL_CORNERS]) {
        const g = stationGeometry(roll, dials);
        for (const p of g.layers.slice(0, 3).flatMap((l) => l.pieces)) {
          if (dials === STATION_REFERENCE_DIALS) {
            pieces++;
            if (p.line) lined++;
          }
          if (!p.line) continue;
          for (let i = 0; i < p.line.length; i++) {
            expect(pointInPolygon(p.line[i], p.pts), `${s} vertex`).toBe(true);
            if (i > 0) {
              const mid: GemPoint = [(p.line[i][0] + p.line[i - 1][0]) / 2, (p.line[i][1] + p.line[i - 1][1]) / 2];
              expect(pointInPolygon(mid, p.pts), `${s} midpoint`).toBe(true);
            }
          }
        }
      }
    }
    expect(lined / pieces).toBeGreaterThan(0.9);
  }, 30_000);

  it('at the reference dials a line is exactly where the robot line generator put it (0°/45°/90° runs)', () => {
    for (const s of SEEDS.slice(0, 20)) {
      const g = stationGeometry(getStationRoll(s), STATION_REFERENCE_DIALS);
      for (const p of g.layers.slice(0, 3).flatMap((l) => l.pieces)) {
        if (!p.line) continue;
        for (let i = 1; i < p.line.length; i++) {
          const dx = Math.abs(p.line[i][0] - p.line[i - 1][0]);
          const dy = Math.abs(p.line[i][1] - p.line[i - 1][1]);
          const axis = dx < 1e-6 || dy < 1e-6;
          const diag = Math.abs(dx - dy) < 1e-6;
          expect(axis || diag).toBe(true);
        }
      }
    }
  });

  it('the port gem is a small triangle-ish gem around the centre, inside L1', () => {
    for (const s of SEEDS) {
      const g = stationGeometry(getStationRoll(s), STATION_REFERENCE_DIALS);
      expect(g.port.length).toBe(6);
      expect(pointInPolygon([0, 0], g.port)).toBe(true);
      for (const p of g.port) expect(Math.hypot(p[0], p[1])).toBeLessThan(14);
      for (const p of g.port) expect(pointInPolygon(p, g.layers[0].inner!)).toBe(true);
    }
  });

  it('is deterministic: same roll and dials, same geometry', () => {
    const roll = getStationRoll(SEEDS[3]);
    expect(stationGeometry(roll, DIAL_CORNERS[5])).toEqual(stationGeometry(roll, DIAL_CORNERS[5]));
  });
});
