// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';

import {
  orbiterPlan,
  nextOrbit,
  ORBIT_PAIRS,
  partnerOf,
  DRIFT_AMPLITUDE,
  DRIFT_PERIOD,
  ORBIT_OPEN_MAX,
  cornerFrame,
  ringPose,
  gemMotionViewBox,
  ORBIT_FRONT_SCALE,
  ORBIT_BEHIND_SCALE,
  ORBIT_BEHIND_DIM,
  DESPAWN_ARC,
  SPAWN_ARC,
} from './orbiterMotion';
import { getRobotGem, generateRobotGem, gemWidth, GEM_CANVAS_H, ORBITER_W, ORBITER_H, WIDTH_FACTORS, type RobotGem, type WidthFactor } from './polygon';
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

// ========================================
// Task 4: ringPose, arcs, gemMotionViewBox
// ========================================
describe('cornerFrame / ringPose — one ring family through the body (spec §1.2, §4)', () => {
  const gems = gemsByWidthFactor();
  const opens = [0, 0.15, ORBIT_OPEN_MAX];
  const corners = [0, 1, 2, 3] as const;
  const dirs: Array<1 | -1> = [1, -1];

  it('theta = 0 and 2*pi: offset (0,0), scale 1, opacity 1, depth rest, for every dir/corner/open', () => {
    for (const gem of Object.values(gems)) {
      for (const corner of corners) {
        for (const dir of dirs) {
          for (const open of opens) {
            for (const theta of [0, 2 * Math.PI]) {
              const pose = ringPose(gem, corner, dir, theta, open);
              expect(pose.x).toBeCloseTo(0, 9);
              expect(pose.y).toBeCloseTo(0, 9);
              expect(pose.scale).toBeCloseTo(1, 9);
              expect(pose.opacity).toBeCloseTo(1, 9);
              expect(pose.depth).toBe('rest');
            }
          }
        }
      }
    }
  });

  it('open 0, theta = pi: offset lands exactly on the partner corner (2r * u-hat)', () => {
    const gem = gems[1];
    for (const corner of corners) {
      const { ux, uy, r } = cornerFrame(gem, corner);
      const pose = ringPose(gem, corner, 1, Math.PI, 0);
      expect(pose.x).toBeCloseTo(2 * r * ux, 9);
      expect(pose.y).toBeCloseTo(2 * r * uy, 9);
    }
  });

  it('theta = pi/2, dir 1, open 0: front, scale 1.15, opacity 1, orbiter centre on the canvas centre', () => {
    const gem = gems[1];
    const width = gemWidth(gem);
    for (const corner of corners) {
      const { cx, cy } = cornerFrame(gem, corner);
      const pose = ringPose(gem, corner, 1, Math.PI / 2, 0);
      expect(pose.depth).toBe('front');
      expect(pose.scale).toBeCloseTo(1.15, 9);
      expect(pose.opacity).toBeCloseTo(1, 9);
      expect(cx + pose.x).toBeCloseTo(width / 2, 6);
      expect(cy + pose.y).toBeCloseTo(GEM_CANVAS_H / 2, 6);
    }
  });

  it('theta = 3pi/2, dir 1: behind, scale 0.8, opacity 0.8', () => {
    const gem = gems[1];
    for (const corner of corners) {
      const pose = ringPose(gem, corner, 1, (3 * Math.PI) / 2, 0);
      expect(pose.depth).toBe('behind');
      expect(pose.scale).toBeCloseTo(0.8, 9);
      expect(pose.opacity).toBeCloseTo(0.8, 9);
    }
  });

  it('theta = pi/2, open 0.3: offset perpendicular to the corner-centre line by open * r', () => {
    const gem = gems[1];
    for (const corner of corners) {
      const { ux, uy, r } = cornerFrame(gem, corner);
      const atZeroOpen = ringPose(gem, corner, 1, Math.PI / 2, 0);
      const atOpen = ringPose(gem, corner, 1, Math.PI / 2, ORBIT_OPEN_MAX);
      const perpX = atOpen.x - atZeroOpen.x;
      const perpY = atOpen.y - atZeroOpen.y;
      expect(perpX * ux + perpY * uy).toBeCloseTo(0, 6); // perpendicular to u-hat
      expect(Math.hypot(perpX, perpY)).toBeCloseTo(ORBIT_OPEN_MAX * r, 6);
    }
  });

  it('pair identity: ringPose(i, dir, theta, open) and ringPose(3-i, -dir, theta, open) mirror through the canvas centre, with opposite depth', () => {
    for (const gem of Object.values(gems)) {
      const width = gemWidth(gem);
      const Cx = width / 2;
      const Cy = GEM_CANVAS_H / 2;
      for (const [corner, partner] of ORBIT_PAIRS) {
        for (const open of opens) {
          for (let deg = 30; deg <= 360; deg += 30) {
            const theta = (deg * Math.PI) / 180;
            for (const dir of dirs) {
              const a = cornerFrame(gem, corner);
              const b = cornerFrame(gem, partner);
              const poseA = ringPose(gem, corner, dir, theta, open);
              const poseB = ringPose(gem, partner, (-dir) as 1 | -1, theta, open);
              const ax = a.cx + poseA.x;
              const ay = a.cy + poseA.y;
              const bx = b.cx + poseB.x;
              const by = b.cy + poseB.y;
              expect(ax + bx).toBeCloseTo(2 * Cx, 6);
              expect(ay + by).toBeCloseTo(2 * Cy, 6);
              if (poseA.depth !== 'rest') expect(poseA.depth).not.toBe(poseB.depth);
            }
          }
        }
      }
    }
  });

  it('at theta = pi/2, open 0, a pair both sit at the canvas centre (one front, one behind)', () => {
    const gem = gems[1];
    const width = gemWidth(gem);
    for (const [corner, partner] of ORBIT_PAIRS) {
      const a = cornerFrame(gem, corner);
      const b = cornerFrame(gem, partner);
      const poseA = ringPose(gem, corner, 1, Math.PI / 2, 0);
      const poseB = ringPose(gem, partner, -1, Math.PI / 2, 0);
      expect(a.cx + poseA.x).toBeCloseTo(width / 2, 6);
      expect(a.cy + poseA.y).toBeCloseTo(GEM_CANVAS_H / 2, 6);
      expect(b.cx + poseB.x).toBeCloseTo(width / 2, 6);
      expect(b.cy + poseB.y).toBeCloseTo(GEM_CANVAS_H / 2, 6);
      expect(poseA.depth).toBe('front');
      expect(poseB.depth).toBe('behind');
    }
  });

  it('constants match the Gate 1 numbers', () => {
    expect(ORBIT_FRONT_SCALE).toBe(0.15);
    expect(ORBIT_BEHIND_SCALE).toBe(0.2);
    expect(ORBIT_BEHIND_DIM).toBe(0.2);
  });
});

describe('DESPAWN_ARC / SPAWN_ARC — the quarter hoop with zero seeded freedom (spec §1.2)', () => {
  const gem = gemsByWidthFactor()[1];
  const width = gemWidth(gem);

  it('constants are the exact quarter hoop, open 0', () => {
    expect(DESPAWN_ARC).toEqual({ dir: -1, from: 0, to: Math.PI / 2 });
    expect(SPAWN_ARC).toEqual({ dir: 1, from: (3 * Math.PI) / 2, to: 2 * Math.PI });
  });

  it('despawn arc starts at rest and ends behind, exactly at the canvas centre', () => {
    for (const corner of [0, 1, 2, 3] as const) {
      const { cx, cy } = cornerFrame(gem, corner);
      const start = ringPose(gem, corner, DESPAWN_ARC.dir, DESPAWN_ARC.from, 0);
      const end = ringPose(gem, corner, DESPAWN_ARC.dir, DESPAWN_ARC.to, 0);
      expect(start.depth).toBe('rest');
      expect(start.x).toBeCloseTo(0, 9);
      expect(start.y).toBeCloseTo(0, 9);
      expect(end.depth).toBe('behind');
      expect(cx + end.x).toBeCloseTo(width / 2, 6);
      expect(cy + end.y).toBeCloseTo(GEM_CANVAS_H / 2, 6);
    }
  });

  it('spawn arc is the reverse: starts behind at the canvas centre, ends at rest', () => {
    for (const corner of [0, 1, 2, 3] as const) {
      const { cx, cy } = cornerFrame(gem, corner);
      const start = ringPose(gem, corner, SPAWN_ARC.dir, SPAWN_ARC.from, 0);
      const end = ringPose(gem, corner, SPAWN_ARC.dir, SPAWN_ARC.to, 0);
      expect(start.depth).toBe('behind');
      expect(cx + start.x).toBeCloseTo(width / 2, 6);
      expect(cy + start.y).toBeCloseTo(GEM_CANVAS_H / 2, 6);
      expect(end.depth).toBe('rest');
      expect(end.x).toBeCloseTo(0, 9);
      expect(end.y).toBeCloseTo(0, 9);
    }
  });
});

describe('gemMotionViewBox — avatar frame padded for the hoop bulge, front scale and drift (spec §1.7)', () => {
  const gems = gemsByWidthFactor();

  it('contains every sampled ringPose point (open ORBIT_OPEN_MAX, both dirs) plus half an orbiter at front scale and drift, for every width factor', () => {
    for (const gem of Object.values(gems)) {
      const [vx, vy, vw, vh] = gemMotionViewBox(gem).split(' ').map(Number);
      const halfW = (ORBITER_W / 2) * (1 + ORBIT_FRONT_SCALE);
      const halfH = (ORBITER_H / 2) * (1 + ORBIT_FRONT_SCALE);
      const drift = DRIFT_AMPLITUDE[1];
      for (let corner = 0; corner < 4; corner++) {
        const { cx, cy } = cornerFrame(gem, corner);
        for (let deg = 0; deg <= 360; deg += 2) {
          const theta = (deg * Math.PI) / 180;
          for (const dir of [1, -1] as const) {
            const pose = ringPose(gem, corner, dir, theta, ORBIT_OPEN_MAX);
            const px = cx + pose.x;
            const py = cy + pose.y;
            expect(px - halfW - drift).toBeGreaterThanOrEqual(vx - 1e-6);
            expect(px + halfW + drift).toBeLessThanOrEqual(vx + vw + 1e-6);
            expect(py - halfH - drift).toBeGreaterThanOrEqual(vy - 1e-6);
            expect(py + halfH + drift).toBeLessThanOrEqual(vy + vh + 1e-6);
          }
        }
      }
    }
  });

  it('is centred on the canvas (equal padding on both sides)', () => {
    for (const gem of Object.values(gems)) {
      const width = gemWidth(gem);
      const [vx, vy, vw, vh] = gemMotionViewBox(gem).split(' ').map(Number);
      expect(vx).toBeCloseTo(-(vw - width) / 2, 6);
      expect(vy).toBeCloseTo(-(vh - GEM_CANVAS_H) / 2, 6);
    }
  });

  it('the hoop at open 0 needs no pad beyond the orbiter half-size + drift (it never leaves the canvas)', () => {
    for (const gem of Object.values(gems)) {
      const width = gemWidth(gem);
      const halfW = (ORBITER_W / 2) * (1 + ORBIT_FRONT_SCALE);
      const halfH = (ORBITER_H / 2) * (1 + ORBIT_FRONT_SCALE);
      const drift = DRIFT_AMPLITUDE[1];
      for (let corner = 0; corner < 4; corner++) {
        const { cx, cy } = cornerFrame(gem, corner);
        for (let deg = 0; deg <= 360; deg += 5) {
          const theta = (deg * Math.PI) / 180;
          for (const dir of [1, -1] as const) {
            const pose = ringPose(gem, corner, dir, theta, 0);
            const px = cx + pose.x;
            const py = cy + pose.y;
            expect(px).toBeGreaterThanOrEqual(-halfW - drift - 1e-6);
            expect(px).toBeLessThanOrEqual(width + halfW + drift + 1e-6);
            expect(py).toBeGreaterThanOrEqual(-halfH - drift - 1e-6);
            expect(py).toBeLessThanOrEqual(GEM_CANVAS_H + halfH + drift + 1e-6);
          }
        }
      }
    }
  });
});
