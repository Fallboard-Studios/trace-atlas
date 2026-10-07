import { describe, it, expect } from 'vitest';
import { ActorType, type Actor, type SceneryKind } from '../../../types/Actor';
import { deriveSceneryParams, maxShapes } from './sceneryParams';

function stubActor(id: string, kind: SceneryKind): Actor {
  return {
    id,
    type: ActorType.SCENERY,
    position: { x: 0, y: 0 },
    isActive: false,
    cooldownRemaining: 0,
    config: { kind },
  };
}

/** [min, max] (inclusive) per field, keyed by kind — mirrors §1.9's table (RANGE_TABLE comments). */
const RANGES: Record<SceneryKind, Record<string, [number, number]>> = {
  tank: { w: [90, 150], h: [140, 260], corner: [0.35, 0.65], beltCourses: [1, 3] },
  crane: { w: [220, 360], h: [260, 380], hangerFrac: [0.2, 0.8] },
  pylon: { w: [60, 90], h: [260, 420] },
  wall: { w: [160, 420], h: [28, 70], hueShift: [40, 60], satShift: [-30, 0] },
  beacon: { mastH: [120, 220], gemW: [40, 64] },
  pipeline: { w: [320, 720], d: [14, 22], e: [34, 60], riserH: [90, 220] },
  dome: { w: [170, 300], bh: [30, 60], portholes: [3, 6] },
  wreck: { w: [340, 580], h: [70, 120], deckhouseFrac: [0.2, 0.3], portholes: [4, 9] },
  turbine: { postH: [170, 290], bladeR: [60, 95] },
  boulder: { w: [60, 150], hFrac: [0.5, 0.75], count: [1, 3] },
  vent: { w: [44, 90], steps: [4, 6] },
  containers: { cols: [2, 4], rows: [1, 3], boxW: [72, 110], boxH: [36, 44] },
  scaffold: { w: [160, 260], h: [220, 380], bays: [2, 3], solidFrac: [0.25, 0.45] },
  tether: { h1: [120, 320], dx: [40, 90] },
  floodlight: { mastH: [190, 310], headOffset: [-14, 14] },
  dish: { rx: [30, 48] },
};

const ALL_KINDS = Object.keys(RANGES) as SceneryKind[];

describe('deriveSceneryParams', () => {
  it('is deterministic: the same actor id yields byte-identical params', () => {
    const actor = stubActor('wall-fixture', 'wall');
    expect(deriveSceneryParams(actor)).toEqual(deriveSceneryParams(actor));
  });

  it('two different ids of the same kind produce different params', () => {
    const a = deriveSceneryParams(stubActor('wall-a', 'wall'));
    const b = deriveSceneryParams(stubActor('wall-b', 'wall'));
    expect(a).not.toEqual(b);
  });

  it('a kindless actor gets an empty params object', () => {
    const actor: Actor = { id: 'no-kind', type: ActorType.SCENERY, position: { x: 0, y: 0 }, isActive: false, cooldownRemaining: 0 };
    expect(deriveSceneryParams(actor)).toEqual({});
  });

  it('only carries the key for the actor\'s own kind', () => {
    const params = deriveSceneryParams(stubActor('wall-only', 'wall'));
    expect(Object.keys(params)).toEqual(['wall']);
  });

  describe.each(ALL_KINDS)('%s', (kind) => {
    it('every field stays inside its §1.9 range across 200 ids', () => {
      const fields = RANGES[kind];
      for (let i = 0; i < 200; i++) {
        const params = deriveSceneryParams(stubActor(`${kind}-id-${i}`, kind)) as Record<string, Record<string, number>>;
        const p = params[kind];
        expect(p).toBeDefined();
        for (const [field, [min, max]] of Object.entries(fields)) {
          const value = p[field];
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(max);
        }
      }
    });
  });
});

describe('maxShapes', () => {
  it('returns a positive integer for every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(maxShapes(kind)).toBeGreaterThan(0);
    }
  });

  it('wall\'s budget covers its actual rendered element count (3: west/east body + cap rail)', () => {
    expect(maxShapes('wall')).toBeGreaterThanOrEqual(3);
  });
});
