import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import * as registry from './robotMotionRegistry';
import {
  registerArcDecorator,
  getArcDecorator,
  deleteArcDecorator,
  registerOrbiterWork,
  getOrbiterWork,
  deleteOrbiterWork,
  clearRobotMotionRegistry,
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

// Phase 53 Task 15 (docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md §1.5): a row switch no longer re-mounts
// the robot, so there is nothing to mark. The layerSwitching set and its three functions (Phase 43
// Task 34) are gone, and the registry is exactly its two maps.
describe('robotMotionRegistry — no layer-switch marks (Phase 53 Task 15)', () => {
  const REMOVED = ['markLayerSwitching', 'isLayerSwitching', 'clearLayerSwitching'];

  it('exports exactly the two maps\' functions and the reset', () => {
    expect(Object.keys(registry).sort()).toEqual([
      'clearRobotMotionRegistry',
      'deleteArcDecorator',
      'deleteOrbiterWork',
      'getArcDecorator',
      'getOrbiterWork',
      'registerArcDecorator',
      'registerOrbiterWork',
    ]);
    for (const name of REMOVED) expect(registry).not.toHaveProperty(name);
  });

  // Test files are left out: a guard like workLoop.test.ts's names them as strings it expects to be
  // gone, and a test that still imported one would fail to type-check anyway.
  it('no source file in src/ names them', () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) files.push(path);
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(300);
    const offenders = files.filter((file) => {
      const text = readFileSync(file, 'utf-8');
      return REMOVED.some((name) => text.includes(name));
    });
    expect(offenders.map((f) => f.slice(root.length + 1).replace(/\\/g, '/'))).toEqual([]);
  });

  it('clearRobotMotionRegistry clears both maps', () => {
    registerArcDecorator('r1', decorator());
    registerOrbiterWork('r1', work());
    clearRobotMotionRegistry();
    expect(getArcDecorator('r1')).toBeUndefined();
    expect(getOrbiterWork('r1')).toBeUndefined();
  });
});
