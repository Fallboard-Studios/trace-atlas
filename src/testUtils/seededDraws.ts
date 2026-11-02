// ========================================
// seededDraws — test helper (Even Seeded Draws T3)
// ========================================
// Stub noise maps that steer every seeded draw, plain, even and centred alike (docs/tasks/EVEN_SEEDED_DRAWS.md,
// "Tests steer the even draws"). getSeededVal reads a stub map's raw value straight off the map. The even and centred
// draws hash their samples, so a constant stub would land them at one arbitrary spot; each stub built here carries a
// tag naming its raw values, and steerSeededDraws's wrappers read the tag instead.
//
// Use it as a test file's mock factory:
//   vi.mock('@/utils/getSeededVal', async (importOriginal) => {
//     const { steerSeededDraws } = await import('@/testUtils/seededDraws');
//     return steerSeededDraws(await importOriginal<typeof import('@/utils/getSeededVal')>());
//   });
// The helper is imported inside the factory, not at the top of the file, because vi.mock is hoisted above imports.

import alea from 'alea';
import { vi } from 'vitest';
import type { NoiseFunction2D } from 'simplex-noise';
import type * as SeededVal from '../utils/getSeededVal';

/** The raw value ([-1, 1], getSeededVal's scale) a stub map gives each dataId. */
interface Steering {
  byDataId: ReadonlyMap<string, number>;
  fallback: number;
}

const STEERING = Symbol('seededDraws.steering');

type SteeredNoiseMap = NoiseFunction2D & { [STEERING]: Steering };

function tag(map: NoiseFunction2D, steering: Steering): NoiseFunction2D {
  return Object.assign(map, { [STEERING]: steering });
}

function steeringOf(map: NoiseFunction2D): Steering | undefined {
  return (map as Partial<SteeredNoiseMap>)[STEERING];
}

/** Every draw lands at the same raw value: -1 -> the band's min, 0 -> its middle, 1 -> its max. */
export function constantNoiseMap(raw: number): NoiseFunction2D {
  return tag(() => raw, { byDataId: new Map(), fallback: raw });
}

/**
 * Precise per-draw control: each named dataId gets its own raw value, regardless of offset, and any dataId not listed
 * falls back to `fallback` (default 0, the band's middle). getSeededVal finds its value through the map's x (keyed by
 * the same `alea(dataId)()` precomputeDataX gives, computed here so this module never imports the module it mocks);
 * the even and centred draws find it by dataId through the tag.
 */
export function noiseMapForDataIds(mapping: Record<string, number>, fallback = 0): NoiseFunction2D {
  const byX = new Map<number, number>();
  for (const [dataId, raw] of Object.entries(mapping)) byX.set(alea(dataId)(), raw);
  return tag((x: number) => byX.get(x) ?? fallback, { byDataId: new Map(Object.entries(mapping)), fallback });
}

type BandedDraw = (noiseMap: NoiseFunction2D, dataId: string, offset?: number, min?: number, max?: number) => number;

/** A spy over `real` that steers a tagged map as getSeededVal reads it, and passes any other map through. */
function steered(real: BandedDraw) {
  return vi.fn<BandedDraw>((noiseMap, dataId, offset = 0, min = 0, max = 1) => {
    const steering = steeringOf(noiseMap);
    if (!steering) return real(noiseMap, dataId, offset, min, max);
    const raw = steering.byDataId.get(dataId) ?? steering.fallback;
    return min + ((raw + 1) / 2) * (max - min);
  });
}

/** The body of a vi.mock factory for getSeededVal.ts: the real module, with the even and centred draws steerable. */
export function steerSeededDraws<T extends typeof SeededVal>(actual: T): T {
  return {
    ...actual,
    getUniformSeededVal: steered(actual.getUniformSeededVal),
    getCentredSeededVal: steered(actual.getCentredSeededVal),
  };
}
