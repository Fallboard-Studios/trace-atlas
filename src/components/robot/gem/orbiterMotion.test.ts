// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';

import { orbiterPlan, gemMotionViewBox, ATTACH_DROP } from './orbiterMotion';
import { ORBITER_SIZE_MAX } from './orbiterDials';
import { getRobotGem, generateRobotGem, gemWidth, GEM_CANVAS_H, WIDTH_FACTORS, type RobotGem, type WidthFactor } from './polygon';
import fixture from './gem.fixture.json';

// ========================================
// HELPERS
// ========================================
const FIXTURE_SEED = 20261004;
const SEEDS = 1000;

/** One robot per width factor (Phase 39 fixture widths), swept from a dedicated seed namespace so
 *  this file never shares a stream with polygon.ts's own tests. */
function gemsByWidthFactor(): Record<WidthFactor, RobotGem> {
  const found = {} as Record<WidthFactor, RobotGem>;
  for (let s = 0; Object.keys(found).length < WIDTH_FACTORS.length; s++) {
    const gem = generateRobotGem(alea(`motion-viewbox-sweep:${s}`));
    if (!found[gem.widthFactor]) found[gem.widthFactor] = gem;
  }
  return found;
}

// ========================================
// TESTS
// ========================================
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

describe('orbiterPlan — cornerOrder is a permutation of 0..3, over 1000 seeds', () => {
  it('every plan sorts to [0,1,2,3]', () => {
    for (let s = 0; s < SEEDS; s++) {
      const plan = orbiterPlan(s + 1_000_000);
      expect([...plan.cornerOrder].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});

describe('gemMotionViewBox — avatar frame padded for the dock position and the attach/detach flight (Phase 40 amendment)', () => {
  const gems = gemsByWidthFactor();

  /** Each orbiter's footprint at ORBITER_SIZE_MAX (1.25x), scaled about its own centre — the same
   *  point RobotGem's `scale(size)` and useOrbiterMotion's GSAP scale both use. */
  function maxScaledBox(part: RobotGem['orbiters'][number]) {
    const cx = part.x + part.w / 2;
    const cy = part.y + part.h / 2;
    const halfW = (part.w / 2) * ORBITER_SIZE_MAX;
    const halfH = (part.h / 2) * ORBITER_SIZE_MAX;
    return { left: cx - halfW, right: cx + halfW, top: cy - halfH, bottom: cy + halfH };
  }

  it('contains every orbiter at ORBITER_SIZE_MAX, for every width factor (code review fix, 2026-10-05: size dial wasn\'t padded for)', () => {
    for (const gem of Object.values(gems)) {
      const [vx, vy, vw, vh] = gemMotionViewBox(gem).split(' ').map(Number);
      for (const part of gem.orbiters) {
        const box = maxScaledBox(part);
        expect(box.left).toBeGreaterThanOrEqual(vx - 1e-6);
        expect(box.right).toBeLessThanOrEqual(vx + vw + 1e-6);
        expect(box.top).toBeGreaterThanOrEqual(vy - 1e-6);
        expect(box.bottom + ATTACH_DROP).toBeLessThanOrEqual(vy + vh + 1e-6);
      }
    }
  });

  it('pads for the size dial: a synthetic dock flush with the canvas edge at size 1x needs real padding once ORBITER_SIZE_MAX is applied (code review fix, 2026-10-05)', () => {
    // Every real generated robot's dock sits with enough margin that this gap never actually
    // bites today — this crafts a worst-case input (docks flush against all four canvas corners)
    // so the size-scaling path is exercised directly, independent of the current geometry constants.
    const flushGem = {
      widthFactor: 1,
      orbiters: [
        { x: 0, y: 0, w: 24, h: 16, pts: [], inner: [], lines: [], lights: [] },
        { x: 80 - 24, y: 0, w: 24, h: 16, pts: [], inner: [], lines: [], lights: [] },
        { x: 0, y: 80 - 16, w: 24, h: 16, pts: [], inner: [], lines: [], lights: [] },
        { x: 80 - 24, y: 80 - 16, w: 24, h: 16, pts: [], inner: [], lines: [], lights: [] },
      ],
    } as unknown as RobotGem;
    const [vx, vy, vw, vh] = gemMotionViewBox(flushGem).split(' ').map(Number);
    expect(vx).toBeLessThan(0);
    expect(vy).toBeLessThan(0);
    expect(vx + vw).toBeGreaterThan(80);
    expect(vy + vh).toBeGreaterThan(80);
  });

  it('never shrinks below the plain card viewBox (0,0,width,height)', () => {
    for (const gem of Object.values(gems)) {
      const width = gemWidth(gem);
      const [vx, vy, vw, vh] = gemMotionViewBox(gem).split(' ').map(Number);
      expect(vx).toBeLessThanOrEqual(0);
      expect(vy).toBeLessThanOrEqual(0);
      expect(vx + vw).toBeGreaterThanOrEqual(width);
      expect(vy + vh).toBeGreaterThanOrEqual(GEM_CANVAS_H);
    }
  });

  it('needs no pad when every dock, at ORBITER_SIZE_MAX, and its flight already fits the canvas', () => {
    const gem = gemsByWidthFactor()[2];
    const width = gemWidth(gem);
    const fits = gem.orbiters.every((part) => {
      const box = maxScaledBox(part);
      return box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom + ATTACH_DROP <= GEM_CANVAS_H;
    });
    if (fits) {
      expect(gemMotionViewBox(gem)).toBe(`0 0 ${width} ${GEM_CANVAS_H}`);
    }
  });
});
