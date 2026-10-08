import { describe, it, expect, beforeEach, vi } from 'vitest';

import {
  registerArcDecorator,
  getArcDecorator,
  deleteArcDecorator,
  registerOrbiterWork,
  getOrbiterWork,
  deleteOrbiterWork,
  clearRobotMotionRegistry,
  markLayerSwitching,
  isLayerSwitching,
  clearLayerSwitching,
  type OrbiterWork,
} from './robotMotionRegistry';
import type { ArcDecorator } from '@/components/robot/gem/useHaloMotion';

// Spec §1.8 (docs/specs/ROBOT_JOBS_AND_STATIONS.md): the work loop reaches React-owned motion
// through this registry, by robot id, the way animation modules reach SVG refs through refs.ts.

const decorator = (): ArcDecorator => vi.fn();
const work = (): OrbiterWork => ({ lock: vi.fn(() => []), unlock: vi.fn() });

describe('robotMotionRegistry — arc decorators', () => {
  beforeEach(() => clearRobotMotionRegistry());

  it('get returns what register stored, per robot id', () => {
    const a = decorator();
    const b = decorator();
    registerArcDecorator('r1', a);
    registerArcDecorator('r2', b);
    expect(getArcDecorator('r1')).toBe(a);
    expect(getArcDecorator('r2')).toBe(b);
  });

  it('an unregistered id returns undefined', () => {
    expect(getArcDecorator('nobody')).toBeUndefined();
  });

  it('delete removes the entry', () => {
    registerArcDecorator('r1', decorator());
    deleteArcDecorator('r1');
    expect(getArcDecorator('r1')).toBeUndefined();
  });

  it('a later register replaces the earlier one', () => {
    const a = decorator();
    const b = decorator();
    registerArcDecorator('r1', a);
    registerArcDecorator('r1', b);
    expect(getArcDecorator('r1')).toBe(b);
  });

  it('delete with an owner that is no longer registered leaves the newer entry alone (a stale unmount after a remount)', () => {
    const old = decorator();
    const next = decorator();
    registerArcDecorator('r1', old);
    registerArcDecorator('r1', next);
    deleteArcDecorator('r1', old);
    expect(getArcDecorator('r1')).toBe(next);
    deleteArcDecorator('r1', next);
    expect(getArcDecorator('r1')).toBeUndefined();
  });

  it('clearRobotMotionRegistry empties both maps', () => {
    registerArcDecorator('r1', decorator());
    registerOrbiterWork('r1', work());
    clearRobotMotionRegistry();
    expect(getArcDecorator('r1')).toBeUndefined();
    expect(getOrbiterWork('r1')).toBeUndefined();
  });
});

describe('robotMotionRegistry — orbiter work controls', () => {
  beforeEach(() => clearRobotMotionRegistry());

  it('get returns what register stored, per robot id', () => {
    const a = work();
    registerOrbiterWork('r1', a);
    expect(getOrbiterWork('r1')).toBe(a);
    expect(getOrbiterWork('r2')).toBeUndefined();
  });

  it('delete removes the entry; a stale owner leaves the newer entry alone', () => {
    const old = work();
    const next = work();
    registerOrbiterWork('r1', old);
    registerOrbiterWork('r1', next);
    deleteOrbiterWork('r1', old);
    expect(getOrbiterWork('r1')).toBe(next);
    deleteOrbiterWork('r1');
    expect(getOrbiterWork('r1')).toBeUndefined();
  });

  it('the two maps are independent — deleting a decorator keeps the same id’s orbiter work', () => {
    const w = work();
    registerArcDecorator('r1', decorator());
    registerOrbiterWork('r1', w);
    deleteArcDecorator('r1');
    expect(getOrbiterWork('r1')).toBe(w);
  });
});

// Phase 43 Task 34 (spec §1.10 "Re-mount without a flourish"): the work loop marks a robot before
// it writes the robot's `layer`, so the re-mount React then does in the other robot row knows it is
// a layer switch — RobotBody's hooks run before Robot's own mount hands the robot back to the loop,
// which clears the mark.
describe('robotMotionRegistry — the layerSwitching set', () => {
  beforeEach(() => clearRobotMotionRegistry());

  it('a robot is switching only between mark and clear, per robot id', () => {
    expect(isLayerSwitching('r1')).toBe(false);
    markLayerSwitching('r1');
    expect(isLayerSwitching('r1')).toBe(true);
    expect(isLayerSwitching('r2')).toBe(false);
    clearLayerSwitching('r1');
    expect(isLayerSwitching('r1')).toBe(false);
  });

  it('marking twice needs one clear; clearing an unmarked robot is a no-op', () => {
    markLayerSwitching('r1');
    markLayerSwitching('r1');
    clearLayerSwitching('r1');
    expect(isLayerSwitching('r1')).toBe(false);
    expect(() => clearLayerSwitching('nobody')).not.toThrow();
  });

  it('clearRobotMotionRegistry clears it with the two maps', () => {
    markLayerSwitching('r1');
    clearRobotMotionRegistry();
    expect(isLayerSwitching('r1')).toBe(false);
  });

  it('is independent of the two maps', () => {
    const w = work();
    registerOrbiterWork('r1', w);
    markLayerSwitching('r1');
    deleteOrbiterWork('r1');
    expect(isLayerSwitching('r1')).toBe(true);
    clearLayerSwitching('r1');
    registerOrbiterWork('r1', w);
    expect(getOrbiterWork('r1')).toBe(w);
  });
});
