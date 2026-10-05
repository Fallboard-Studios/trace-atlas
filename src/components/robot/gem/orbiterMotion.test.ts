// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';

import { orbiterPlan, nextOrbit, ORBIT_PAIRS, partnerOf, DRIFT_AMPLITUDE, DRIFT_PERIOD, ORBIT_OPEN_MAX } from './orbiterMotion';
import { getRobotGem } from './polygon';
import type { OrbiterDials } from './orbiterDials';
import fixture from './gem.fixture.json';

// ========================================
// HELPERS
// ========================================
const FIXTURE_SEED = 20261004;
const SEEDS = 1000;

function dialsWithGap(orbitGap: number): OrbiterDials {
  return { count: 2, size: 1, lineWidth: 0.5, stripOpacity: 0.5, orbitGap, orbitDuration: 5 };
}

// ========================================
// TESTS
// ========================================
describe('ORBIT_PAIRS / partnerOf — the two diagonal pairs (Gate 1: the only orbit unit)', () => {
  it('pairs TL+BR (0, 3) and TR+BL (1, 2)', () => {
    expect(ORBIT_PAIRS).toEqual([[0, 3], [1, 2]]);
  });

  it('partnerOf maps 0<->3 and 1<->2', () => {
    expect(partnerOf(0)).toBe(3);
    expect(partnerOf(3)).toBe(0);
    expect(partnerOf(1)).toBe(2);
    expect(partnerOf(2)).toBe(1);
  });
});

describe('orbiterPlan — caching and determinism', () => {
  it('returns the same reference for repeated calls with the same seed', () => {
    const a = orbiterPlan(123456);
    expect(orbiterPlan(123456)).toBe(a);
  });

  it('is deterministic across fresh module instances (a fresh build from the :orbit stream, not just a cache hit)', async () => {
    const plan = orbiterPlan(777);
    vi.resetModules();
    const fresh = await import('./orbiterMotion');
    expect(fresh.orbiterPlan(777)).toEqual(plan);
  });

  it('different seeds give different plans', () => {
    expect(orbiterPlan(1)).not.toEqual(orbiterPlan(2));
  });

  it("never touches polygon.ts's geometry stream — getRobotGem(FIXTURE_SEED) still pins gem.fixture.json", () => {
    orbiterPlan(FIXTURE_SEED);
    expect(JSON.parse(JSON.stringify(getRobotGem(FIXTURE_SEED)))).toEqual(fixture);
  });
});

describe('orbiterPlan — seeded ranges, over 1000 seeds', () => {
  const plans = Array.from({ length: SEEDS }, (_, s) => orbiterPlan(s + 1_000_000));

  it('cornerOrder is a permutation of 0..3', () => {
    for (const plan of plans) {
      expect([...plan.cornerOrder].sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('drift amplitude (ax, ay) is within DRIFT_AMPLITUDE and period (px, py) within DRIFT_PERIOD, for all four corners', () => {
    expect(DRIFT_AMPLITUDE).toEqual([2, 3]);
    expect(DRIFT_PERIOD).toEqual([6, 10]);
    for (const plan of plans) {
      expect(plan.drift).toHaveLength(4);
      for (const d of plan.drift) {
        expect(d.ax).toBeGreaterThanOrEqual(DRIFT_AMPLITUDE[0]);
        expect(d.ax).toBeLessThanOrEqual(DRIFT_AMPLITUDE[1]);
        expect(d.ay).toBeGreaterThanOrEqual(DRIFT_AMPLITUDE[0]);
        expect(d.ay).toBeLessThanOrEqual(DRIFT_AMPLITUDE[1]);
        expect(d.px).toBeGreaterThanOrEqual(DRIFT_PERIOD[0]);
        expect(d.px).toBeLessThanOrEqual(DRIFT_PERIOD[1]);
        expect(d.py).toBeGreaterThanOrEqual(DRIFT_PERIOD[0]);
        expect(d.py).toBeLessThanOrEqual(DRIFT_PERIOD[1]);
        expect(d.phase).toBeGreaterThanOrEqual(0);
        expect(d.phase).toBeLessThan(1);
        expect(d.phase2).toBeGreaterThanOrEqual(0);
        expect(d.phase2).toBeLessThan(1);
      }
    }
  });

  it('initialWait has two entries in [0, 1), one per pair', () => {
    for (const plan of plans) {
      expect(plan.initialWait).toHaveLength(2);
      for (const w of plan.initialWait) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThan(1);
      }
    }
  });
});

describe('nextOrbit — the draw for one orbit (spec §1.2: at most one orbit per gap per pair)', () => {
  it('ORBIT_OPEN_MAX matches the Gate 1 ceiling', () => {
    expect(ORBIT_OPEN_MAX).toBe(0.3);
  });

  it.each([17, 29])('over 1000 draws at gap %d: dir in {1, -1}, open in [0, 0.3], wait in [gap, 2*gap), both directions occur', (gap) => {
    const R = alea(`nextOrbit-sweep:${gap}`);
    const dials = dialsWithGap(gap);
    const dirsSeen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const draw = nextOrbit(R, dials);
      expect([1, -1]).toContain(draw.dir);
      dirsSeen.add(draw.dir);
      expect(draw.open).toBeGreaterThanOrEqual(0);
      expect(draw.open).toBeLessThanOrEqual(ORBIT_OPEN_MAX);
      expect(draw.wait).toBeGreaterThanOrEqual(gap);
      expect(draw.wait).toBeLessThan(2 * gap);
    }
    expect(dirsSeen).toEqual(new Set([1, -1]));
  });
});
