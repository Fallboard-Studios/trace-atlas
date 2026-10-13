// ========================================
// IMPORTS
// ========================================
import alea from 'alea';
import { describe, it, expect } from 'vitest';

import {
  sceneToRowLocal,
  orbiterLocalToRowLocal,
  rowLocalToScene,
  rowLocalToOrbiterLocal,
} from './frames';
import { sceneToOrbiterLocal, type OrbiterCorner } from '../sceneToOrbiterLocal';
import { getRobotGem, gemWidth, GEM_CANVAS_H } from '../../../components/robot/gem/polygon';

// ========================================
// FIXTURES
// ========================================
const CORNERS: OrbiterCorner[] = [0, 1, 2, 3];
const GEM_SEEDS = Array.from({ length: 50 }, (_, i) => 1000 + i * 7919);

/** Rest, the body-scale floor and ceiling (0.735 / 1.69), J4's back row (0.75), and mixes. */
const BODY_SCALES = [0.735, 1, 1.69];
const LAYER_SCALES = [1, 0.75];

// ========================================
// TESTS
// ========================================
describe('sceneToRowLocal (docs/specs/JOB_DECORATION.md Assumption 4, Task 1)', () => {
  it('is c + (p - robotPos - c) / layerScale, c the gem canvas centre', () => {
    const gem = getRobotGem(GEM_SEEDS[4]);
    const cx = gemWidth(gem) / 2;
    const cy = GEM_CANVAS_H / 2;
    const robotPos = { x: 400, y: 250 };
    const p = { x: 520, y: 310 };
    const got = sceneToRowLocal(p, { robotPos, gem, layerScale: 0.75 });
    expect(got.x).toBeCloseTo(cx + (520 - 400 - cx) / 0.75, 9);
    expect(got.y).toBeCloseTo(cy + (310 - 250 - cy) / 0.75, 9);
  });

  it('leaves the canvas centre fixed at every layer scale (the row scales about it)', () => {
    const gem = getRobotGem(GEM_SEEDS[9]);
    const robotPos = { x: 77.5, y: 133.25 };
    const centre = { x: robotPos.x + gemWidth(gem) / 2, y: robotPos.y + GEM_CANVAS_H / 2 };
    for (const layerScale of LAYER_SCALES) {
      const got = sceneToRowLocal(centre, { robotPos, gem, layerScale });
      expect(got.x).toBeCloseTo(gemWidth(gem) / 2, 9);
      expect(got.y).toBeCloseTo(GEM_CANVAS_H / 2, 9);
    }
  });

  it('at layer 1 is just the point relative to the robot position', () => {
    const gem = getRobotGem(GEM_SEEDS[1]);
    const got = sceneToRowLocal({ x: 300, y: 200 }, { robotPos: { x: 120, y: 80 }, gem, layerScale: 1 });
    expect(got.x).toBeCloseTo(180, 9);
    expect(got.y).toBeCloseTo(120, 9);
  });

  it('magnifies a scene distance by 1 / layerScale (the back row draws smaller, so row units are larger)', () => {
    const gem = getRobotGem(GEM_SEEDS[6]);
    const robotPos = { x: 10, y: 20 };
    const a = sceneToRowLocal({ x: 100, y: 100 }, { robotPos, gem, layerScale: 0.75 });
    const b = sceneToRowLocal({ x: 130, y: 85 }, { robotPos, gem, layerScale: 0.75 });
    expect(b.x - a.x).toBeCloseTo(30 / 0.75, 9);
    expect(b.y - a.y).toBeCloseTo(-15 / 0.75, 9);
  });

  it('rowLocalToScene is its inverse — 50 gems x 2 layer scales, both directions', () => {
    const R = alea('job-decor-t1-scene-row');
    for (const gemSeed of GEM_SEEDS) {
      const gem = getRobotGem(gemSeed);
      for (const layerScale of LAYER_SCALES) {
        const frame = { robotPos: { x: R() * 1900 - 50, y: R() * 900 - 50 }, gem, layerScale };
        const p = { x: frame.robotPos.x + R() * 400 - 150, y: frame.robotPos.y + R() * 300 - 120 };
        const there = rowLocalToScene(sceneToRowLocal(p, frame), frame);
        expect(there.x).toBeCloseTo(p.x, 6);
        expect(there.y).toBeCloseTo(p.y, 6);
        const r = { x: R() * 200, y: R() * 100 };
        const back = sceneToRowLocal(rowLocalToScene(r, frame), frame);
        expect(back.x).toBeCloseTo(r.x, 6);
        expect(back.y).toBeCloseTo(r.y, 6);
      }
    }
  });

  it('returns fresh objects (never aliases its input)', () => {
    const gem = getRobotGem(GEM_SEEDS[2]);
    const p = { x: 5, y: 6 };
    expect(sceneToRowLocal(p, { robotPos: { x: 0, y: 0 }, gem, layerScale: 1 })).not.toBe(p);
  });

  it('throws RangeError on a zero, negative or NaN layer scale (the inverse does not exist)', () => {
    const gem = getRobotGem(GEM_SEEDS[0]);
    const frame = { robotPos: { x: 0, y: 0 }, gem };
    for (const layerScale of [0, -0.75, Number.NaN]) {
      expect(() => sceneToRowLocal({ x: 1, y: 1 }, { ...frame, layerScale })).toThrow(RangeError);
      expect(() => rowLocalToScene({ x: 1, y: 1 }, { ...frame, layerScale })).toThrow(RangeError);
    }
  });
});

describe('orbiterLocalToRowLocal (docs/specs/JOB_DECORATION.md Assumption 4, Task 1)', () => {
  it('maps a docked orbiter { 0, 0 } to the corner\'s dock centre scaled about the canvas centre', () => {
    const gem = getRobotGem(GEM_SEEDS[3]);
    const cx = gemWidth(gem) / 2;
    const cy = GEM_CANVAS_H / 2;
    for (const bodyScale of BODY_SCALES) {
      for (const corner of CORNERS) {
        const part = gem.orbiters[corner];
        const dock = { x: part.x + part.w / 2, y: part.y + part.h / 2 };
        const got = orbiterLocalToRowLocal({ x: 0, y: 0 }, { gem, bodyScale, corner });
        expect(got.x).toBeCloseTo(cx + (dock.x - cx) * bodyScale, 9);
        expect(got.y).toBeCloseTo(cy + (dock.y - cy) * bodyScale, 9);
      }
    }
  });

  it('at body scale 1 is the local offset plus the dock centre', () => {
    const gem = getRobotGem(GEM_SEEDS[8]);
    const part = gem.orbiters[2];
    const got = orbiterLocalToRowLocal({ x: 12, y: -7 }, { gem, bodyScale: 1, corner: 2 });
    expect(got.x).toBeCloseTo(12 + part.x + part.w / 2, 9);
    expect(got.y).toBeCloseTo(-7 + part.y + part.h / 2, 9);
  });

  it('scales a local offset by bodyScale (GSAP x/y are canvas units inside g.gem\'s scale)', () => {
    const gem = getRobotGem(GEM_SEEDS[7]);
    const a = orbiterLocalToRowLocal({ x: 0, y: 0 }, { gem, bodyScale: 1.69, corner: 1 });
    const b = orbiterLocalToRowLocal({ x: 10, y: -4 }, { gem, bodyScale: 1.69, corner: 1 });
    expect(b.x - a.x).toBeCloseTo(10 * 1.69, 9);
    expect(b.y - a.y).toBeCloseTo(-4 * 1.69, 9);
  });

  it('rowLocalToOrbiterLocal is its inverse — 50 gems x 3 body scales x 4 corners, both directions', () => {
    const R = alea('job-decor-t1-orbiter-row');
    for (const gemSeed of GEM_SEEDS) {
      const gem = getRobotGem(gemSeed);
      for (const bodyScale of BODY_SCALES) {
        for (const corner of CORNERS) {
          const frame = { gem, bodyScale, corner };
          const local = { x: R() * 200 - 100, y: R() * 200 - 100 };
          const there = rowLocalToOrbiterLocal(orbiterLocalToRowLocal(local, frame), frame);
          expect(there.x).toBeCloseTo(local.x, 6);
          expect(there.y).toBeCloseTo(local.y, 6);
          const r = { x: R() * 200, y: R() * 100 };
          const back = orbiterLocalToRowLocal(rowLocalToOrbiterLocal(r, frame), frame);
          expect(back.x).toBeCloseTo(r.x, 6);
          expect(back.y).toBeCloseTo(r.y, 6);
        }
      }
    }
  });

  it('returns fresh objects (never aliases its input)', () => {
    const gem = getRobotGem(GEM_SEEDS[2]);
    const local = { x: 5, y: 6 };
    expect(orbiterLocalToRowLocal(local, { gem, bodyScale: 1, corner: 0 })).not.toBe(local);
  });

  it('throws RangeError on a zero, negative or NaN body scale', () => {
    const gem = getRobotGem(GEM_SEEDS[0]);
    for (const bodyScale of [0, -1, Number.NaN]) {
      expect(() => orbiterLocalToRowLocal({ x: 1, y: 1 }, { gem, bodyScale, corner: 0 })).toThrow(RangeError);
      expect(() => rowLocalToOrbiterLocal({ x: 1, y: 1 }, { gem, bodyScale, corner: 0 })).toThrow(RangeError);
    }
  });
});

describe('the two frames agree with sceneToOrbiterLocal', () => {
  it('sceneToOrbiterLocal then orbiterLocalToRowLocal equals sceneToRowLocal within 1e-6 — 50 gems x 3 body x 2 layer x 4 corners', () => {
    const R = alea('job-decor-t1-compose');
    let checked = 0;
    for (const gemSeed of GEM_SEEDS) {
      const gem = getRobotGem(gemSeed);
      for (const bodyScale of BODY_SCALES) {
        for (const layerScale of LAYER_SCALES) {
          const robotPos = { x: R() * 1900 - 50, y: R() * 900 - 50 };
          for (const corner of CORNERS) {
            const p = { x: robotPos.x + R() * 400 - 150, y: robotPos.y + R() * 300 - 120 };
            const local = sceneToOrbiterLocal(p, { robotPos, gem, bodyScale, layerScale, corner });
            const viaOrbiter = orbiterLocalToRowLocal(local, { gem, bodyScale, corner });
            const direct = sceneToRowLocal(p, { robotPos, gem, layerScale });
            expect(Math.abs(viaOrbiter.x - direct.x)).toBeLessThan(1e-6);
            expect(Math.abs(viaOrbiter.y - direct.y)).toBeLessThan(1e-6);
            checked++;
          }
        }
      }
    }
    expect(checked).toBe(50 * 3 * 2 * 4);
  });

  it('is independent of body scale: the same scene point lands on the same row point at every body scale', () => {
    const gem = getRobotGem(GEM_SEEDS[12]);
    const robotPos = { x: 600, y: 300 };
    const p = { x: 650, y: 340 };
    const results = BODY_SCALES.map((bodyScale) => {
      const local = sceneToOrbiterLocal(p, { robotPos, gem, bodyScale, layerScale: 0.75, corner: 3 });
      return orbiterLocalToRowLocal(local, { gem, bodyScale, corner: 3 });
    });
    for (const r of results) {
      expect(r.x).toBeCloseTo(results[0].x, 9);
      expect(r.y).toBeCloseTo(results[0].y, 9);
    }
  });
});
