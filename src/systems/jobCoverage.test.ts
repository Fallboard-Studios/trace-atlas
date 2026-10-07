// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { jobHostCounts, meetsCoverage, ensureJobCoverage, COVERAGE_MIN_JOBS, COVERAGE_MIN_HOSTS } from './jobCoverage';
import { placeDistrict } from './districts';
import { RECIPES, COVERAGE_TOP_UP, type CoverageTopUp } from './districtRecipes';
import { getRecipeRow } from './factoryPlacementSystem';
import { hostJobs } from './jobHosts';
import { SIM_SEED_COORDS } from './lifecycleSim';
import { getTerrainProfile, groundYAt } from './terrainProfile';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { useLocaleStore } from '../stores/localeStore';
import { ActorType, type Actor, type DistrictName, type SceneryKind } from '../types/Actor';
import { JobType } from '../types/Robot';

// ========================================
// HELPERS
// ========================================

function registerLocale(id: string, x: number, y: number): string {
  useLocaleStore.getState().addLocale('pelagos', {
    id,
    attenuationStyleId: 'pelagos',
    name: id,
    coordinates: { x, y },
    dayStartTimestamp: 0,
    createdAtMeasure: 0,
    robots: [],
    actors: [],
    companies: [],
    currentMeasure: 0,
  });
  return id;
}

/** A scenery actor in the given district row — enough for hostJobs/isWorkSiteEligible. */
function scenery(kind: SceneryKind, district: DistrictName, row: number, id = `${kind}-${row}`): Actor {
  return { id, type: ActorType.SCENERY, position: { x: 900, y: 1000 }, isActive: false, config: { kind, district, row } };
}

/** The first row index in `district`'s recipe with this kind at this depth. */
function rowOf(district: DistrictName, kind: SceneryKind, depth: string): number {
  const i = RECIPES[district].findIndex((r) => r.kind === kind && r.depth === depth);
  if (i < 0) throw new Error(`no ${kind} ${depth} row in ${district}`);
  return i;
}

const districtOf = (actors: Actor[]) => actors[0].config!.district!;
const isTopUp = (a: Actor) => a.config!.row! >= RECIPES[a.config!.district!].length;

/** Every world the real placer builds over the 121-seed grid. */
const GRID: { id: string; x: number; y: number; actors: Actor[] }[] = SIM_SEED_COORDS.map(({ x, y }) => {
  const id = registerLocale(`coverage-${x}-${y}`, x, y);
  return { id, x, y, actors: placeDistrict(id) };
});

// ========================================
// TESTS
// ========================================

describe('jobCoverage (Phase 43 Task 12, spec §1.4)', () => {
  it('the rule is ≥ 3 job types with ≥ 4 hosts each', () => {
    expect(COVERAGE_MIN_JOBS).toBe(3);
    expect(COVERAGE_MIN_HOSTS).toBe(4);
  });

  describe('jobHostCounts', () => {
    it('counts each eligible host once per job it hosts; every job present, zero when none', () => {
      // habitat: dome (midground) hosts structuralInspection, fluidMonitoring, maintenance.
      const counts = jobHostCounts([scenery('dome', 'habitat', rowOf('habitat', 'dome', 'midground'))]);
      expect(counts).toEqual({
        [JobType.VentExtraction]: 0,
        [JobType.AcousticSurvey]: 0,
        [JobType.StructuralInspection]: 1,
        [JobType.FluidMonitoring]: 1,
        [JobType.Salvage]: 0,
        [JobType.Maintenance]: 1,
      });
    });

    it('skips background hosts (not eligible until J4) and non-hosts', () => {
      const bgPylon = scenery('pylon', 'habitat', rowOf('habitat', 'pylon', 'background'));
      const wall = scenery('wall', 'habitat', rowOf('habitat', 'wall', 'foreground'));
      expect(Object.values(jobHostCounts([bgPylon, wall])).every((n) => n === 0)).toBe(true);
    });

    it('a derelict host counts toward its derelict jobs', () => {
      const tank = { ...scenery('tank', 'yard', rowOf('yard', 'tank', 'midground')), config: { kind: 'tank' as const, district: 'yard' as const, row: rowOf('yard', 'tank', 'midground'), derelict: true as const } };
      const counts = jobHostCounts([tank]);
      expect(counts[JobType.Salvage]).toBe(1);
      expect(counts[JobType.VentExtraction]).toBe(0);
    });
  });

  describe('meetsCoverage', () => {
    const counts = (vals: number[]) => Object.fromEntries(Object.values(JobType).map((j, i) => [j, vals[i] ?? 0])) as Record<JobType, number>;

    it('true at exactly three jobs on exactly four', () => {
      expect(meetsCoverage(counts([4, 4, 4, 0, 0, 0]))).toBe(true);
    });

    it('false with two jobs at four, or three jobs one short', () => {
      expect(meetsCoverage(counts([9, 9, 0, 0, 0, 0]))).toBe(false);
      expect(meetsCoverage(counts([4, 4, 3, 3, 3, 3]))).toBe(false);
    });
  });

  describe('ensureJobCoverage (with a stub placer)', () => {
    // dense midground tank row: ventExtraction + fluidMonitoring. Four tanks put two jobs at 4.
    const tankRow = rowOf('dense', 'tank', 'midground');
    const fourTanks = Array.from({ length: 4 }, (_, i) => scenery('tank', 'dense', tankRow, `t${i}`));
    const placed: { topUp: CoverageTopUp; index: number }[] = [];
    const stubPlacer = (make: (t: CoverageTopUp, i: number) => Actor | null) => (t: CoverageTopUp, i: number) => {
      placed.push({ topUp: t, index: i });
      return make(t, i);
    };
    const asContainers = (_t: CoverageTopUp, i: number) => scenery('containers', 'dense', rowOf('dense', 'containers', 'foreground'), `c${i}`);

    it('a world that already meets the rule gets nothing, and the placer is never called', () => {
      placed.length = 0;
      const enough = [...fourTanks, ...Array.from({ length: 4 }, (_, i) => scenery('containers', 'dense', rowOf('dense', 'containers', 'foreground'), `k${i}`))];
      const list: CoverageTopUp[] = [{ kind: 'containers', depth: 'foreground' }];
      expect(ensureJobCoverage(enough, list, stubPlacer(asContainers))).toEqual([]);
      expect(placed).toEqual([]);
    });

    it('places in list order, one at a time, and stops as soon as the rule holds', () => {
      placed.length = 0;
      // Two jobs at 4 (vent, fluid); salvage needs four containers.
      const list: CoverageTopUp[] = Array.from({ length: 6 }, () => ({ kind: 'containers', depth: 'foreground' }) as CoverageTopUp);
      const added = ensureJobCoverage(fourTanks, list, stubPlacer(asContainers));
      expect(added.map((a) => a.id)).toEqual(['c0', 'c1', 'c2', 'c3']);
      expect(placed.map((p) => p.index)).toEqual([0, 1, 2, 3]);
      expect(meetsCoverage(jobHostCounts([...fourTanks, ...added]))).toBe(true);
    });

    it('a placer that skips an item (null) moves on to the next', () => {
      placed.length = 0;
      const list: CoverageTopUp[] = Array.from({ length: 6 }, () => ({ kind: 'containers', depth: 'foreground' }) as CoverageTopUp);
      const added = ensureJobCoverage(fourTanks, list, stubPlacer((t, i) => (i === 1 ? null : asContainers(t, i))));
      expect(added.map((a) => a.id)).toEqual(['c0', 'c2', 'c3', 'c4']);
    });

    it('an exhausted list returns what it placed, without throwing, and the rule still fails', () => {
      placed.length = 0;
      const list: CoverageTopUp[] = [{ kind: 'containers', depth: 'foreground' }];
      const added = ensureJobCoverage(fourTanks, list, stubPlacer(asContainers));
      expect(added).toHaveLength(1);
      expect(meetsCoverage(jobHostCounts([...fourTanks, ...added]))).toBe(false);
    });

    it('does not mutate the actors it is given', () => {
      const before = structuredClone(fourTanks);
      ensureJobCoverage(fourTanks, [{ kind: 'containers', depth: 'foreground' }], stubPlacer(asContainers));
      expect(fourTanks).toEqual(before);
    });
  });

  describe('placeDistrict over the 121-seed grid', () => {
    it('every world meets the rule after placement', () => {
      const failing = GRID.filter((w) => !meetsCoverage(jobHostCounts(w.actors))).map((w) => `${w.id} (${districtOf(w.actors)})`);
      expect(failing).toEqual([]);
    });

    it('top-ups were needed somewhere, and only in districts whose recipes fall short', () => {
      const withTopUps = new Set(GRID.filter((w) => w.actors.some(isTopUp)).map((w) => districtOf(w.actors)));
      expect(withTopUps.has('wreckfield')).toBe(true);
      for (const d of ['construction', 'yard', 'habitat', 'dense'] as DistrictName[]) expect(withTopUps.has(d), d).toBe(false);
    });

    it('a world that already meets the rule is unchanged — no top-up placed (a construction seed)', () => {
      const world = GRID.find((w) => districtOf(w.actors) === 'construction')!;
      expect(world.actors.some(isTopUp)).toBe(false);
    });

    it('top-ups are the list\'s own items, in order, a prefix of the list minus gated skips', () => {
      for (const w of GRID) {
        const d = districtOf(w.actors);
        const topUps = w.actors.filter(isTopUp);
        const indices = topUps.map((a) => a.config!.row! - RECIPES[d].length);
        expect(indices, w.id).toEqual([...indices].sort((a, b) => a - b));
        for (const a of topUps) {
          const t = COVERAGE_TOP_UP[d][a.config!.row! - RECIPES[d].length];
          expect(a.type).toBe(ActorType.SCENERY);
          expect(a.config!.kind).toBe(t.kind);
          expect(getRecipeRow(d, a.config!.row!)!.depth).toBe(t.depth);
          expect(hostJobs(a).length, a.id).toBeGreaterThan(0);
          expect(a.config!.derelict, a.id).toBeUndefined();
        }
      }
    });

    it('top-ups are ground-locked: foreground on the ground profile, midground on the midground floor', () => {
      let checked = 0;
      for (const w of GRID) {
        const profile = getTerrainProfile(w.id, getLocaleNoiseMap(w.id, w.x, w.y));
        for (const a of w.actors.filter(isTopUp)) {
          const row = getRecipeRow(a.config!.district!, a.config!.row!)!;
          if (row.depth === 'foreground') {
            expect(Math.abs(a.position.y - groundYAt(profile.ground, a.position.x))).toBeLessThanOrEqual(0.5);
          } else {
            expect(a.position.y).toBe(row.floorY);
          }
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    });

    it('top-ups land inside the visible world, away from the edges', () => {
      for (const w of GRID) {
        for (const a of w.actors.filter(isTopUp)) {
          expect(a.position.x).toBeGreaterThanOrEqual(1920 * 0.15 - 1);
          expect(a.position.x).toBeLessThanOrEqual(1920 * 0.85 + 1);
        }
      }
    });

    it('top-up x positions are seeded per index, not all at one spot', () => {
      const xs = new Set(GRID.flatMap((w) => w.actors.filter(isTopUp).map((a) => a.position.x)));
      expect(xs.size).toBeGreaterThan(10);
    });

    it('deterministic: placing a top-up world again gives identical actors', () => {
      const w = GRID.find((g) => g.actors.some(isTopUp))!;
      expect(placeDistrict(w.id)).toEqual(w.actors);
    });

    it('scenery ids stay unique within a world with top-ups', () => {
      for (const w of GRID) {
        const ids = w.actors.map((a) => a.id);
        expect(new Set(ids).size, w.id).toBe(ids.length);
      }
    });
  });

  it('mutation check: emptying wreck field\'s top-up list fails the grid rule', () => {
    const original = [...COVERAGE_TOP_UP.wreckfield];
    try {
      COVERAGE_TOP_UP.wreckfield.length = 0;
      const w = GRID.find((g) => districtOf(g.actors) === 'wreckfield')!;
      expect(meetsCoverage(jobHostCounts(placeDistrict(w.id)))).toBe(false);
    } finally {
      COVERAGE_TOP_UP.wreckfield.push(...original);
    }
  });
});
