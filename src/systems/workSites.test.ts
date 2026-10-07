// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import Alea from 'alea';

import { getWorkSite, deriveWorkSite, type WorkSite } from './workSites';
import { hostJobs, isWorkSiteEligible } from './jobHosts';
import { placeDistrict } from './districts';
import { getRecipeRow } from './factoryPlacementSystem';
import { SIM_SEED_COORDS } from './lifecycleSim';
import { factoryGeometry } from '../components/actors/factoryGeometry';
import { getActorBubbleProps } from '../components/actors/factoryBubbleProps';
import { sceneryWorkAnchors, ANCHORED_KINDS } from '../components/actors/scenery/sceneryWorkAnchors';
import { useLocaleStore } from '../stores/localeStore';
import { ActorType, type Actor } from '../types/Actor';
import { PARK_CLEARANCE, WORLD_MARGIN, WORLD_WIDTH, WORLD_HEIGHT } from '../constants';

// ========================================
// HELPERS
// ========================================

function registerLocale(id: string, x: number, y: number): void {
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
}

/** Every factory the real district placer puts down over the 121-seed grid. */
const GRID_ACTORS: Actor[] = SIM_SEED_COORDS.flatMap(({ x, y }) => {
  const id = `work-sites-${x}-${y}`;
  registerLocale(id, x, y);
  return placeDistrict(id);
});
const GRID_FACTORIES = GRID_ACTORS.filter((a) => a.type === ActorType.FACTORY);
const GRID_HOSTS = GRID_FACTORIES.filter((a) => hostJobs(a).length > 0);

const clampX = (x: number) => Math.min(Math.max(x, WORLD_MARGIN), WORLD_WIDTH - WORLD_MARGIN);
const clampY = (y: number) => Math.min(Math.max(y, WORLD_MARGIN), WORLD_HEIGHT - WORLD_MARGIN);

/** The part of the roof inside the world's width, or the whole roof when none of it is. */
function visibleSpan(site: WorkSite): { lo: number; hi: number } {
  const lo = Math.max(site.bounds.x0, 0);
  const hi = Math.min(site.bounds.x1, WORLD_WIDTH);
  return hi > lo ? { lo, hi } : { lo: site.bounds.x0, hi: site.bounds.x1 };
}

function siteOf(actor: Actor): WorkSite {
  const site = getWorkSite(actor);
  if (!site) throw new Error(`expected a work site for ${actor.id}`);
  return site;
}

function hostsOfVariant(variant: string): Actor[] {
  return GRID_HOSTS.filter((a) => factoryGeometry(a).variant === variant);
}

// ========================================
// TESTS
// ========================================
describe('workSites — factories (Phase 43 Task 9, spec §1.5)', () => {
  it('the grid supplies well over 200 real factory hosts, every variant among them', () => {
    expect(GRID_HOSTS.length).toBeGreaterThanOrEqual(200);
    for (const v of ['Monolith', 'Stacks', 'Refinery', 'Skyscraper', 'Warehouse']) {
      expect(hostsOfVariant(v).length, v).toBeGreaterThan(0);
    }
  });

  describe('identity', () => {
    it('null for a non-host (offscreen row) — and the grid has some', () => {
      const nonHosts = GRID_FACTORIES.filter((a) => hostJobs(a).length === 0);
      expect(nonHosts.length).toBeGreaterThan(0);
      for (const a of nonHosts) expect(getWorkSite(a), a.id).toBeNull();
    });

    it('id, jobs and depth come from the actor, its host row and its recipe row', () => {
      for (const a of GRID_HOSTS) {
        const site = siteOf(a);
        expect(site.id).toBe(a.id);
        expect(site.jobs).toEqual(hostJobs(a));
        expect(site.depth).toBe(getRecipeRow(a.config!.district!, a.config!.row!)!.depth);
      }
    });

    it('a derelict factory is a site with the derelict jobs', () => {
      const derelict = GRID_HOSTS.find((a) => a.config?.derelict);
      expect(derelict).toBeDefined();
      expect(siteOf(derelict!).jobs).toEqual(hostJobs(derelict!));
    });

    it('an unresolvable row counts as foreground', () => {
      const actor: Actor = { id: 'ws-norow', type: ActorType.FACTORY, position: { x: 600, y: 1000 }, isActive: true, config: { row: 99 } };
      expect(siteOf(actor).depth).toBe('foreground');
    });

    it('bounds are factoryGeometry\'s box — the drawn body', () => {
      for (const a of GRID_HOSTS) expect(siteOf(a).bounds).toEqual(factoryGeometry(a).box);
    });
  });

  describe('determinism and cache', () => {
    it('derived twice from equal actors, the site is equal; the actor is not mutated', () => {
      for (const a of GRID_HOSTS.slice(0, 40)) {
        const before = JSON.stringify(a);
        expect(deriveWorkSite(structuredClone(a))).toEqual(deriveWorkSite(a));
        expect(JSON.stringify(a)).toBe(before);
      }
    });

    it('getWorkSite caches per actor (same object back) and matches the derivation', () => {
      const a = GRID_HOSTS[0];
      const first = getWorkSite(a);
      expect(getWorkSite(a)).toBe(first);
      expect(first).toEqual(deriveWorkSite(a));
    });

    it('actor ids repeat across locales, so two hosts sharing an id each get their own site', () => {
      const byId = new Map<string, Actor>();
      let pair: [Actor, Actor] | undefined;
      for (const a of GRID_HOSTS) {
        const other = byId.get(a.id);
        if (other && other.position.x !== a.position.x) { pair = [other, a]; break; }
        byId.set(a.id, a);
      }
      expect(pair).toBeDefined();
      const [a, b] = pair!;
      expect(getWorkSite(a)).toEqual(deriveWorkSite(a));
      expect(getWorkSite(b)).toEqual(deriveWorkSite(b));
      expect(getWorkSite(b)!.bounds).not.toEqual(getWorkSite(a)!.bounds);
    });

    it('the seeded parts (park offset, work points) are seeded by the site, not shared', () => {
      // Only sites whose park can't reach the clamp, so the offset is the seeded jitter alone.
      const offsets = GRID_HOSTS.flatMap((a) => {
        const site = siteOf(a);
        const { lo, hi } = visibleSpan(site);
        const centre = (lo + hi) / 2;
        const clampFree = centre - 40 >= WORLD_MARGIN && centre + 40 <= WORLD_WIDTH - WORLD_MARGIN;
        return clampFree ? [site.park.x - centre] : [];
      });
      expect(offsets.length).toBeGreaterThan(100);
      expect(new Set(offsets.map(Math.round)).size).toBeGreaterThan(40);
      expect(Math.max(...offsets.map(Math.abs))).toBeGreaterThan(30);
    });
  });

  describe('park (PARK_CLEARANCE above the roof, clamped into WORLD_MARGIN)', () => {
    it('constants are the spec\'s', () => {
      expect(PARK_CLEARANCE).toBe(70);
      expect(WORLD_MARGIN).toBe(100);
    });

    it('every park is inside the world margin', () => {
      for (const a of GRID_HOSTS) {
        const { park } = siteOf(a);
        expect(park.x, a.id).toBeGreaterThanOrEqual(WORLD_MARGIN);
        expect(park.x, a.id).toBeLessThanOrEqual(WORLD_WIDTH - WORLD_MARGIN);
        expect(park.y, a.id).toBeGreaterThanOrEqual(WORLD_MARGIN);
        expect(park.y, a.id).toBeLessThanOrEqual(WORLD_HEIGHT - WORLD_MARGIN);
      }
    });

    it('park y is the roof minus PARK_CLEARANCE, clamped', () => {
      for (const a of GRID_HOSTS) {
        const site = siteOf(a);
        expect(site.park.y, a.id).toBe(clampY(site.bounds.y0 - PARK_CLEARANCE));
      }
    });

    it('park x is within 40 of the visible roof centre, then clamped', () => {
      for (const a of GRID_HOSTS) {
        const site = siteOf(a);
        const { lo, hi } = visibleSpan(site);
        const centre = (lo + hi) / 2;
        expect(site.park.x, a.id).toBeGreaterThanOrEqual(clampX(centre - 40) - 1e-9);
        expect(site.park.x, a.id).toBeLessThanOrEqual(clampX(centre + 40) + 1e-9);
      }
    });

    it('every eligible (midground/foreground) site parks above its roof', () => {
      const eligible = GRID_HOSTS.filter((a) => isWorkSiteEligible(a, { backHosts: false }));
      expect(eligible.length).toBeGreaterThan(100);
      for (const a of eligible) {
        const site = siteOf(a);
        expect(site.park.y, a.id).toBeLessThan(site.bounds.y0);
      }
    });
  });

  describe('points and path', () => {
    it('2–4 points and a path of ≥ 2 vertices, every one on or above the roof and inside the box\'s x', () => {
      for (const a of GRID_HOSTS) {
        const site = siteOf(a);
        expect(site.points.length, a.id).toBeGreaterThanOrEqual(2);
        expect(site.points.length, a.id).toBeLessThanOrEqual(4);
        expect(site.path.length, a.id).toBeGreaterThanOrEqual(2);
        for (const p of [...site.points, ...site.path]) {
          expect(p.y, a.id).toBeLessThanOrEqual(site.bounds.y0);
          expect(p.x, a.id).toBeGreaterThanOrEqual(site.bounds.x0);
          expect(p.x, a.id).toBeLessThanOrEqual(site.bounds.x1);
        }
      }
    });

    it('the path is the roof outline across the visible roof, through the front corner when it shows', () => {
      for (const a of GRID_HOSTS) {
        const site = siteOf(a);
        const { lo, hi } = visibleSpan(site);
        const g = factoryGeometry(a);
        const corner = site.bounds.x0 + (g.frontCornerX / 100) * (site.bounds.x1 - site.bounds.x0);
        const expected = corner > lo && corner < hi ? [lo, corner, hi] : [lo, hi];
        expect(site.path.map((p) => p.x), a.id).toEqual(expected);
        for (const p of site.path) expect(p.y).toBe(site.bounds.y0);
      }
    });

    it('a roof that runs off the world edge keeps its points and path on screen', () => {
      const partial = GRID_HOSTS.filter((a) => {
        const { box } = factoryGeometry(a);
        return (box.x0 < 0 && box.x1 > 0) || (box.x0 < WORLD_WIDTH && box.x1 > WORLD_WIDTH);
      });
      expect(partial.length).toBeGreaterThan(0);
      for (const a of partial) {
        const site = siteOf(a);
        const mouth = ['Stacks', 'Refinery'].includes(factoryGeometry(a).variant) ? site.points.slice(1) : site.points;
        for (const p of [...mouth, ...site.path]) {
          expect(p.x, a.id).toBeGreaterThanOrEqual(0);
          expect(p.x, a.id).toBeLessThanOrEqual(WORLD_WIDTH);
        }
      }
    });

    it('a roof wholly past the world edge falls back to the whole roof (still a site)', () => {
      const offWorld = GRID_HOSTS.filter((a) => factoryGeometry(a).box.x0 >= WORLD_WIDTH);
      expect(offWorld.length).toBeGreaterThan(0);
      for (const a of offWorld) {
        const site = siteOf(a);
        expect(site.path[0].x).toBe(site.bounds.x0);
        expect(site.path[site.path.length - 1].x).toBe(site.bounds.x1);
      }
    });

    it('Stacks and Refinery: points[0] is the stack mouth — the bubble vent\'s x, on the drawn roof — and a valve away from it', () => {
      const hosts = [...hostsOfVariant('Stacks'), ...hostsOfVariant('Refinery')];
      expect(hosts.length).toBeGreaterThan(0);
      for (const a of hosts) {
        const site = siteOf(a);
        const vent = getActorBubbleProps(a)!;
        expect(site.points).toHaveLength(2);
        expect(site.points[0].x, a.id).toBeCloseTo(vent.ventX, 9);
        expect(site.points[0].y, a.id).toBe(site.bounds.y0);
        expect(Math.abs(site.points[1].x - site.points[0].x), a.id).toBeGreaterThan(0);
      }
    });

    it('Monolith and Skyscraper: three roof points, spread across the roof', () => {
      for (const a of [...hostsOfVariant('Monolith'), ...hostsOfVariant('Skyscraper')]) {
        const site = siteOf(a);
        expect(site.points, a.id).toHaveLength(3);
        expect(new Set(site.points.map((p) => p.x)).size, a.id).toBe(3);
      }
    });

    it('Warehouse: two roof points, a left of b (the carry\'s pick-up and drop)', () => {
      for (const a of hostsOfVariant('Warehouse')) {
        const site = siteOf(a);
        expect(site.points, a.id).toHaveLength(2);
        expect(site.points[0].x, a.id).toBeLessThan(site.points[1].x);
      }
    });
  });
});

describe('workSites — scenery group A (Phase 43 Task 10)', () => {
  const sceneryHosts = GRID_ACTORS.filter((a) => a.type === ActorType.SCENERY && hostJobs(a).length > 0);
  const anchoredHosts = sceneryHosts.filter((a) => ANCHORED_KINDS.has(a.config!.kind!));
  const depthOf = (a: Actor) => getRecipeRow(a.config!.district!, a.config!.row!)!.depth;

  it('the grid places hosts of every group-A kind', () => {
    for (const kind of ANCHORED_KINDS) {
      expect(anchoredHosts.some((a) => a.config!.kind === kind), kind).toBe(true);
    }
  });

  it('every group-A host gets a site: id, jobs, depth, and the anchors for its depth', () => {
    for (const a of anchoredHosts) {
      const site = siteOf(a);
      expect(site.id).toBe(a.id);
      expect(site.jobs).toEqual(hostJobs(a));
      expect(site.depth).toBe(depthOf(a));
      const anchors = sceneryWorkAnchors(a, { foreground: site.depth === 'foreground', rand: Alea(`${a.id}:work`) })!;
      expect(site.bounds, a.id).toEqual(anchors.bounds);
      expect(site.points, a.id).toEqual(anchors.points);
      expect(site.path, a.id).toEqual(anchors.path);
    }
  });

  it('the grid has foreground group-A hosts, so the foreground branch is the one placement uses', () => {
    expect(anchoredHosts.some((a) => depthOf(a) === 'foreground')).toBe(true);
    expect(anchoredHosts.some((a) => depthOf(a) === 'midground')).toBe(true);
  });

  it('a derelict host is a site with the derelict jobs', () => {
    const derelict = anchoredHosts.find((a) => a.config?.derelict);
    expect(derelict).toBeDefined();
    expect(siteOf(derelict!).jobs).toEqual(hostJobs(derelict!));
  });

  it('park: inside the margin, roof − PARK_CLEARANCE clamped, within 40 of the visible centre', () => {
    for (const a of anchoredHosts) {
      const site = siteOf(a);
      const { lo, hi } = visibleSpan(site);
      const centre = (lo + hi) / 2;
      expect(site.park.y, a.id).toBe(clampY(site.bounds.y0 - PARK_CLEARANCE));
      expect(site.park.x, a.id).toBeGreaterThanOrEqual(clampX(centre - 40) - 1e-9);
      expect(site.park.x, a.id).toBeLessThanOrEqual(clampX(centre + 40) + 1e-9);
    }
  });

  it('every eligible group-A site parks above its top', () => {
    const eligible = anchoredHosts.filter((a) => isWorkSiteEligible(a, { backHosts: false }));
    expect(eligible.length).toBeGreaterThan(50);
    for (const a of eligible) {
      const site = siteOf(a);
      expect(site.park.y, a.id).toBeLessThan(site.bounds.y0);
    }
  });

  it('a scenery host without anchors yet (group B, Task 11) still has no site', () => {
    const groupB = sceneryHosts.filter((a) => !ANCHORED_KINDS.has(a.config!.kind!));
    expect(groupB.length).toBeGreaterThan(0);
    for (const a of groupB) expect(getWorkSite(a), a.id).toBeNull();
  });
});
