// ========================================
// IMPORTS
// ========================================
import type { NoiseFunction2D } from 'simplex-noise';

import type { Actor } from '../types/Actor';
import type { Vec2 } from '../types/Vec2';
import { getWorkSite } from './workSites';
import { getUniformSeededVal } from '../utils/getSeededVal';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { useLocaleStore } from '../stores/localeStore';
import {
  STATION_BOX_H,
  STATION_BOX_W,
  STATION_CAPACITY,
  STATION_COUNT_MAX,
  STATION_COUNT_MIN,
  STATION_MIN_SPACING,
  STATION_X_RANGE,
  STATION_Y_RANGE,
} from '../constants';

// ========================================
// TYPES
// ========================================

/** A box in scene units. */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * A charging station (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6). Derived from the seed on
 * demand, never stored in state.
 */
export interface Station {
  /** `station-<index>`, unique within a world only. */
  id: string;
  center: Vec2;
  /** Where a robot's centre goes in and comes out. The centre until the sketch says otherwise. */
  port: Vec2;
  capacity: number;
  /** Seed for the station's look (components/stations/stationGem.ts getStationRoll) — the
   *  station's counterpart of Robot.gemSeed, drawn once from the world ('station.gem.seed'). */
  gemSeed: number;
}

// ========================================
// CONSTANTS
// ========================================

/** Seeded candidates tried per station before its layout restarts. */
const MAX_DRAWS_PER_STATION = 16;

/** Layouts tried before a count is given up on. */
const MAX_LAYOUTS = 16;

/** Exclusive upper bound for Station.gemSeed (as Robot.gemSeed). */
const GEM_SEED_MAX = 2 ** 31;

// ========================================
// HELPERS
// ========================================

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

// Every draw here is getUniformSeededVal, never one getSeededVal sample: that takes only ~3 values
// at offset 0 across all worlds (measured: no grid world rolled 3 stations).
const inRange = ([lo, hi]: readonly [number, number], t: number) => Math.round(lo + t * (hi - lo));

/**
 * `count` centres, or null. Each is the next seeded candidate (offset `draw`, shared by x and y)
 * that is STATION_MIN_SPACING from every centre already taken and whose box overlaps no obstacle.
 * A station that finds no spot in MAX_DRAWS_PER_STATION candidates restarts the whole layout from
 * the next draw — greedy placement dead-ends when the first two land near the middle — up to
 * MAX_LAYOUTS times.
 */
function drawCentres(noiseMap: NoiseFunction2D, count: number, obstacles: Box[]): Vec2[] | null {
  let draw = 0;
  for (let layout = 0; layout < MAX_LAYOUTS; layout++) {
    const centres: Vec2[] = [];
    for (let tries = 0; centres.length < count && tries < MAX_DRAWS_PER_STATION; draw++) {
      const c = {
        x: inRange(STATION_X_RANGE, getUniformSeededVal(noiseMap, 'station.x', draw)),
        y: inRange(STATION_Y_RANGE, getUniformSeededVal(noiseMap, 'station.y', draw)),
      };
      const box = stationBox(c);
      if (centres.some((p) => distance(p, c) < STATION_MIN_SPACING) || obstacles.some((o) => overlaps(box, o))) {
        tries++;
        continue;
      }
      centres.push(c);
      tries = 0;
    }
    if (centres.length === count) return centres;
  }
  return null;
}

// ========================================
// API
// ========================================

/** The station's box (placeholder size until the sketch), centred on `center`. */
export function stationBox(center: Vec2): Box {
  return {
    x0: center.x - STATION_BOX_W / 2,
    y0: center.y - STATION_BOX_H / 2,
    x1: center.x + STATION_BOX_W / 2,
    y1: center.y + STATION_BOX_H / 2,
  };
}

/**
 * Every host's drawn bounds, at every depth — background too, so turning BACK_HOSTS_ENABLED on
 * (J4) doesn't move a world's stations.
 */
export function hostObstacles(actors: Actor[]): Box[] {
  return actors.flatMap((a) => {
    const site = getWorkSite(a);
    return site ? [site.bounds] : [];
  });
}

/**
 * A world's stations from its noise map: 2–3 (`'station.count'`), each centre the next seeded
 * draw (`'station.x'` / `'station.y'`) that is STATION_MIN_SPACING from the others and whose box
 * overlaps no obstacle. When no layout fits, the count steps down to two; when two don't fit, the
 * overlap rule goes (spacing always holds), so the roster always fits. Pure.
 */
export function deriveStations(noiseMap: NoiseFunction2D, obstacles: Box[]): Station[] {
  const span = STATION_COUNT_MAX - STATION_COUNT_MIN + 1;
  const count = STATION_COUNT_MIN + Math.min(span - 1, Math.floor(getUniformSeededVal(noiseMap, 'station.count') * span));

  let centres = drawCentres(noiseMap, count, obstacles);
  for (let n = count - 1; !centres && n >= STATION_COUNT_MIN; n--) centres = drawCentres(noiseMap, n, obstacles);
  centres ??= drawCentres(noiseMap, STATION_COUNT_MIN, []);
  if (!centres) {
    // Unreachable in practice (spacing alone); the range's two ends are 1440 apart.
    const y = Math.round((STATION_Y_RANGE[0] + STATION_Y_RANGE[1]) / 2);
    centres = [{ x: STATION_X_RANGE[0], y }, { x: STATION_X_RANGE[1], y }];
  }

  return centres.map((center, i) => ({
    id: `station-${i}`,
    center,
    port: { ...center },
    capacity: STATION_CAPACITY,
    gemSeed: Math.floor(getUniformSeededVal(noiseMap, 'station.gem.seed', i) * GEM_SEED_MAX),
  }));
}

// Keyed by the locale's actors array: placement writes a fresh array, so a re-placed world
// re-derives. Locale ids are unique, but actor ids are not (workSites.ts), so never key by those.
const stationCache = new WeakMap<Actor[], Station[]>();

/** A locale's stations, derived once per placed world, then a cache hit. [] for an unknown locale. */
export function getStations(localeId: string): Station[] {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return [];
  const cached = stationCache.get(locale.actors);
  if (cached) return cached;
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  const stations = deriveStations(noiseMap, hostObstacles(locale.actors));
  stationCache.set(locale.actors, stations);
  return stations;
}

/**
 * Load-time assignment (spec §1.6): roster index modulo station count. Throws rather than overfill
 * a station — the roster always fits two (STATION_COUNT_MIN × STATION_CAPACITY ≥ MAX_ROBOTS).
 */
export function assignStationsAtLoad(robotIds: string[], stations: Station[]): Record<string, string> {
  if (robotIds.length === 0) return {};
  const room = stations.reduce((n, s) => n + s.capacity, 0);
  if (stations.length === 0 || stations.some((s, i) => robotIds.filter((_, r) => r % stations.length === i).length > s.capacity)) {
    throw new Error(`assignStationsAtLoad: ${robotIds.length} robots do not fit ${stations.length} stations (room ${room})`);
  }
  return Object.fromEntries(robotIds.map((id, i) => [id, stations[i % stations.length].id]));
}

/**
 * The nearest station to `centre` with a free slot (occupancy below capacity; a missing entry is
 * empty), or null when every station is full. Ties go to the earlier station.
 */
export function nearestFreeStation(centre: Vec2, stations: Station[], occupancy: Record<string, number>): Station | null {
  let best: Station | null = null;
  let bestDistance = Infinity;
  for (const s of stations) {
    if ((occupancy[s.id] ?? 0) >= s.capacity) continue;
    const d = distance(centre, s.center);
    if (d < bestDistance) {
      best = s;
      bestDistance = d;
    }
  }
  return best;
}
