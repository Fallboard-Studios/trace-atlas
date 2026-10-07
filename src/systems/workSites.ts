// ========================================
// IMPORTS
// ========================================
import Alea from 'alea';

import { ActorType, type Actor } from '../types/Actor';
import type { JobType } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';
import type { DistrictRow } from './districtRecipes';
import { hostJobs } from './jobHosts';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from './factoryPlacementSystem';
import { factoryGeometry } from '../components/actors/factoryGeometry';
import { factoryVentFraction } from '../components/actors/factoryBubbleProps';
import { sceneryWorkAnchors } from '../components/actors/scenery/sceneryWorkAnchors';
import { PARK_CLEARANCE, WORLD_MARGIN, WORLD_WIDTH, WORLD_HEIGHT } from '../constants';

// ========================================
// TYPES
// ========================================

/**
 * Where a robot works at one host, in scene units (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.5).
 * Derived from the same geometry the renderer draws, never stored in state.
 */
export interface WorkSite {
  /** The host actor's id. */
  id: string;
  depth: DistrictRow['depth'];
  /** hostJobs(actor). */
  jobs: JobType[];
  /** The drawn silhouette's box. */
  bounds: { x0: number; y0: number; x1: number; y1: number };
  /** The robot's centre while working. */
  park: Vec2;
  /** 2–4 work points — stack mouth, valve, roof points. */
  points: Vec2[];
  /** A polyline of ≥ 2 vertices — the top outline. */
  path: Vec2[];
}

// ========================================
// CONSTANTS
// ========================================

/** The park's seeded sideways offset from the roof centre, ± this (spec §1.5). */
const PARK_JITTER = 40;

/** Seeded roof points stay this fraction of the span in from either end. */
const ROOF_INSET = 0.1;

// ========================================
// HELPERS
// ========================================

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** A uniform draw in [lo, hi). */
const between = (rand: () => number, lo: number, hi: number) => lo + rand() * (hi - lo);

/**
 * The part of the roof inside the world's width, so a building that runs off the edge is worked
 * where it can be seen. A roof wholly past the edge falls back to the whole roof.
 */
function visibleSpan(x0: number, x1: number): { lo: number; hi: number } {
  const lo = Math.max(x0, 0);
  const hi = Math.min(x1, WORLD_WIDTH);
  return hi > lo ? { lo, hi } : { lo: x0, hi: x1 };
}

/**
 * The robot's centre while working: over the visible part of the top, ± a seeded 0–40, and
 * PARK_CLEARANCE above the top, clamped into the world. Its own seeded stream, so it never
 * depends on how many draws a kind's points take.
 */
function parkFor(actorId: string, bounds: WorkSite['bounds']): Vec2 {
  const { lo, hi } = visibleSpan(bounds.x0, bounds.x1);
  const jitter = between(Alea(`${actorId}:park`), -PARK_JITTER, PARK_JITTER);
  return {
    x: clamp((lo + hi) / 2 + jitter, WORLD_MARGIN, WORLD_WIDTH - WORLD_MARGIN),
    y: clamp(bounds.y0 - PARK_CLEARANCE, WORLD_MARGIN, WORLD_HEIGHT - WORLD_MARGIN),
  };
}

/** The factory branch: a flat roof at the drawn box's top, worked from above (spec §1.5). */
function factoryAnchors(actor: Actor): Pick<WorkSite, 'bounds' | 'points' | 'path'> {
  const { variant, frontCornerX, box } = factoryGeometry(actor);
  const roofY = box.y0;
  const { lo, hi } = visibleSpan(box.x0, box.x1);
  const rand = Alea(`${actor.id}:work`);

  const roofAt = (t: number): Vec2 => ({ x: lo + t * (hi - lo), y: roofY });

  // The top outline, through the east/west face split when it shows.
  const cornerX = box.x0 + (frontCornerX / 100) * (box.x1 - box.x0);
  const path: Vec2[] = cornerX > lo && cornerX < hi
    ? [{ x: lo, y: roofY }, { x: cornerX, y: roofY }, { x: hi, y: roofY }]
    : [{ x: lo, y: roofY }, { x: hi, y: roofY }];

  let points: Vec2[];
  switch (variant) {
    case 'Stacks':
    case 'Refinery': {
      // The mouth is where the bubbles leave the roof; the valve sits in the other half.
      const ventFraction = factoryVentFraction(actor.id);
      const mouth = { x: box.x0 + ventFraction * (box.x1 - box.x0), y: roofY };
      const mouthT = (mouth.x - lo) / (hi - lo);
      const valveT = mouthT < 0.5 ? between(rand, 0.6, 1 - ROOF_INSET) : between(rand, ROOF_INSET, 0.4);
      points = [mouth, roofAt(valveT)];
      break;
    }
    case 'Warehouse':
      // The carry's pick-up and drop, one in each half.
      points = [roofAt(between(rand, ROOF_INSET, 0.35)), roofAt(between(rand, 0.65, 1 - ROOF_INSET))];
      break;
    case 'Monolith':
    case 'Skyscraper':
      // A seeded mast/inspection point first, then the two roof ends.
      points = [roofAt(between(rand, 0.35, 0.65)), roofAt(ROOF_INSET), roofAt(1 - ROOF_INSET)];
      break;
  }

  return { bounds: box, points, path };
}

// ========================================
// API
// ========================================

/**
 * The work site for an actor, derived fresh, or null when the actor hosts nothing. Pure: reads
 * only the actor. Factories, and the scenery kinds with anchors (`ANCHORED_KINDS`; the rest land
 * in Phase 43 Task 11).
 */
export function deriveWorkSite(actor: Actor): WorkSite | null {
  const jobs = hostJobs(actor);
  if (jobs.length === 0) return null;
  const row = getRecipeRow(actor.config?.district ?? 'dense', actor.config?.row ?? DEFAULT_FACTORY_ROW);
  const depth = row?.depth ?? 'foreground'; // the renderers' fallback

  const anchors = actor.type === ActorType.FACTORY
    ? factoryAnchors(actor)
    : sceneryWorkAnchors(actor, { foreground: depth === 'foreground', rand: Alea(`${actor.id}:work`) });
  if (!anchors) return null;

  const { bounds, points, path } = anchors;
  return { id: actor.id, depth, jobs, bounds, park: parkFor(actor.id, bounds), points, path };
}

// Keyed by the actor object, not its id: factory and scenery ids repeat across locales (730 of
// 4210 actors over the 121-seed grid share an id with another locale's, most at a different x),
// so an id key would hand a stale site to the next world. Actors are never mutated in place.
const siteCache = new WeakMap<Actor, WorkSite | null>();

/**
 * The work site for an actor — derived once per actor, then a cache hit. Never stored in state.
 */
export function getWorkSite(actor: Actor): WorkSite | null {
  if (siteCache.has(actor)) return siteCache.get(actor)!;
  const site = deriveWorkSite(actor);
  siteCache.set(actor, site);
  return site;
}
