// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  deriveStations,
  getStations,
  hostObstacles,
  stationBox,
  assignStationsAtLoad,
  nearestFreeStation,
  type Station,
  type Box,
} from './stations';
import { placeDistrict } from './districts';
import { getWorkSite } from './workSites';
import { hostJobs } from './jobHosts';
import { SIM_SEED_COORDS } from './lifecycleSim';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { useLocaleStore } from '../stores/localeStore';
import {
  MAX_ROBOTS,
  STATION_MIN_SPACING,
  STATION_CAPACITY,
  STATION_COUNT_MIN,
  STATION_COUNT_MAX,
  STATION_X_RANGE,
  STATION_Y_RANGE,
  STATION_BOX_W,
  STATION_BOX_H,
} from '../constants';

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

const distance = (a: Station, b: Station) => Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y);

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function minPairDistance(stations: Station[]): number {
  let min = Infinity;
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) min = Math.min(min, distance(stations[i], stations[j]));
  }
  return min;
}

/** A station stub at a centre, for the assignment helpers. */
const at = (id: string, x: number, y: number): Station => ({ id, center: { x, y }, port: { x, y }, capacity: STATION_CAPACITY, gemSeed: 0 });

/** Every world the real placer builds over the 121-seed grid, with its stations. */
const GRID = SIM_SEED_COORDS.map(({ x, y }) => {
  const id = registerLocale(`stations-${x}-${y}`, x, y);
  const actors = placeDistrict(id);
  return { id, x, y, actors, stations: getStations(id) };
});

// ========================================
// TESTS
// ========================================

describe('stations (Phase 43 Task 13, spec §1.6)', () => {
  it('pins the spec constants', () => {
    expect(STATION_MIN_SPACING).toBe(480);
    expect(STATION_CAPACITY).toBe(6);
    expect([STATION_COUNT_MIN, STATION_COUNT_MAX]).toEqual([2, 3]);
    expect(STATION_X_RANGE).toEqual([240, 1680]);
    expect(STATION_Y_RANGE).toEqual([220, 560]);
    // Two stations must hold the whole roster at load (spec §1.6: capacity 6 × ≥ 2 ≥ 12).
    expect(STATION_COUNT_MIN * STATION_CAPACITY).toBeGreaterThanOrEqual(MAX_ROBOTS);
  });

  describe('stationBox', () => {
    it('is the placeholder box centred on the station', () => {
      const box = stationBox({ x: 500, y: 300 });
      expect(box).toEqual({ x0: 500 - STATION_BOX_W / 2, y0: 300 - STATION_BOX_H / 2, x1: 500 + STATION_BOX_W / 2, y1: 300 + STATION_BOX_H / 2 });
    });
  });

  describe('hostObstacles', () => {
    it('is the bounds of every host, at every depth, and nothing for a non-host', () => {
      const world = GRID[0];
      const hosts = world.actors.filter((a) => hostJobs(a).length > 0);
      expect(hosts.length).toBeGreaterThan(0);
      expect(hostObstacles(world.actors)).toEqual(hosts.map((a) => getWorkSite(a)!.bounds));
    });

    it('includes background hosts, so stations do not move when J4 turns them on', () => {
      const withBackground = GRID.find((w) => w.actors.some((a) => getWorkSite(a)?.depth === 'background'));
      expect(withBackground).toBeDefined();
      const bg = withBackground!.actors.filter((a) => getWorkSite(a)?.depth === 'background');
      const obstacles = hostObstacles(withBackground!.actors);
      for (const a of bg) expect(obstacles).toContainEqual(getWorkSite(a)!.bounds);
    });
  });

  describe('getStations over the 121-seed grid', () => {
    it('every world has 2 or 3 stations, and both counts occur', () => {
      const counts = GRID.map((w) => w.stations.length);
      for (const [i, n] of counts.entries()) {
        expect(n, GRID[i].id).toBeGreaterThanOrEqual(2);
        expect(n, GRID[i].id).toBeLessThanOrEqual(3);
      }
      expect(new Set(counts)).toEqual(new Set([2, 3]));
    });

    it('every pair is at least STATION_MIN_SPACING apart', () => {
      for (const w of GRID) expect(minPairDistance(w.stations), w.id).toBeGreaterThanOrEqual(STATION_MIN_SPACING);
    });

    it('no station box overlaps any host bounds', () => {
      for (const w of GRID) {
        const obstacles = hostObstacles(w.actors);
        for (const s of w.stations) {
          const hit = obstacles.find((o) => overlaps(stationBox(s.center), o));
          expect(hit, `${w.id} ${s.id}`).toBeUndefined();
        }
      }
    });

    it('every centre lies inside x [240, 1680] and y [220, 560]', () => {
      for (const w of GRID) {
        for (const s of w.stations) {
          expect(s.center.x).toBeGreaterThanOrEqual(240);
          expect(s.center.x).toBeLessThanOrEqual(1680);
          expect(s.center.y).toBeGreaterThanOrEqual(220);
          expect(s.center.y).toBeLessThanOrEqual(560);
        }
      }
    });

    it('stations are spread over the range, not stuck in the middle (draws are re-hashed)', () => {
      const xs = GRID.flatMap((w) => w.stations.map((s) => s.center.x));
      const ys = GRID.flatMap((w) => w.stations.map((s) => s.center.y));
      expect(Math.min(...xs)).toBeLessThan(400);
      expect(Math.max(...xs)).toBeGreaterThan(1520);
      expect(Math.min(...ys)).toBeLessThan(270);
      expect(Math.max(...ys)).toBeGreaterThan(510);
    });

    it('ids are station-0…, capacity is 6, and the port is the centre (placeholder until the sketch)', () => {
      for (const w of GRID) {
        expect(w.stations.map((s) => s.id)).toEqual(w.stations.map((_, i) => `station-${i}`));
        for (const s of w.stations) {
          expect(s.capacity).toBe(STATION_CAPACITY);
          expect(s.port).toEqual(s.center);
        }
      }
    });

    it('the box is the station sketch’s 200 × 200 (Task 0a), and no world needs the overlap fallback at that size', () => {
      // "No world needs the fallback" is the overlap test above passing over the whole grid.
      expect([STATION_BOX_W, STATION_BOX_H]).toEqual([200, 200]);
    });

    it('every station carries a gemSeed for its look: an integer in [0, 2^31), varied within and across worlds', () => {
      for (const w of GRID) {
        for (const s of w.stations) {
          expect(Number.isInteger(s.gemSeed)).toBe(true);
          expect(s.gemSeed).toBeGreaterThanOrEqual(0);
          expect(s.gemSeed).toBeLessThan(2 ** 31);
        }
        expect(new Set(w.stations.map((s) => s.gemSeed)).size, w.id).toBe(w.stations.length);
      }
      expect(new Set(GRID.map((w) => w.stations[0].gemSeed)).size).toBeGreaterThanOrEqual(118);
    });

    it('stations are JSON-serializable plain data', () => {
      const s = GRID[0].stations;
      expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    });

    it('deterministic: deriving again from the same seed and hosts gives identical stations', () => {
      for (const w of GRID.slice(0, 20)) {
        const noiseMap = getLocaleNoiseMap(w.id, w.x, w.y);
        expect(deriveStations(noiseMap, hostObstacles(w.actors)), w.id).toEqual(w.stations);
      }
    });

    it('different worlds get different stations', () => {
      const layouts = new Set(GRID.map((w) => JSON.stringify(w.stations.map((s) => s.center))));
      expect(layouts.size).toBeGreaterThan(100);
    });

    it('the first draw varies per world too (offset 0 alone is a near-constant simplex sample)', () => {
      const firsts = GRID.map((w) => {
        const noiseMap = getLocaleNoiseMap(w.id, w.x, w.y);
        return JSON.stringify(deriveStations(noiseMap, [])[0].center);
      });
      expect(new Set(firsts).size).toBeGreaterThanOrEqual(118);
    });

    it('the count is near an even split of 2 and 3 over the grid', () => {
      const threes = GRID.filter((w) => w.stations.length === 3).length;
      expect(threes).toBeGreaterThan(121 * 0.3);
      expect(threes).toBeLessThan(121 * 0.7);
    });
  });

  describe('getStations caching', () => {
    it('a second call for the same locale is the same array (cache hit)', () => {
      const w = GRID[1];
      expect(getStations(w.id)).toBe(w.stations);
    });

    it('re-derives when the locale\'s actors are replaced', () => {
      const id = registerLocale('stations-recache', 3, 7);
      const before = getStations(id); // no actors yet: no obstacles
      placeDistrict(id); // writes a new actors array
      const after = getStations(id);
      expect(after).not.toBe(before);
      const obstacles = hostObstacles(useLocaleStore.getState().getLocaleById(id)!.actors);
      for (const s of after) expect(obstacles.some((o) => overlaps(stationBox(s.center), o))).toBe(false);
    });

    it('an unknown locale has no stations', () => {
      expect(getStations('no-such-locale')).toEqual([]);
    });
  });

  describe('deriveStations', () => {
    const w = GRID[2];
    const noiseMap = getLocaleNoiseMap(w.id, w.x, w.y);

    it('an obstacle over a free-world station pushes it to a later draw', () => {
      const free = deriveStations(noiseMap, []);
      const blocker = stationBox(free[0].center);
      const moved = deriveStations(noiseMap, [blocker]);
      expect(moved[0].center).not.toEqual(free[0].center);
      for (const s of moved) expect(overlaps(stationBox(s.center), blocker)).toBe(false);
      expect(minPairDistance(moved)).toBeGreaterThanOrEqual(STATION_MIN_SPACING);
    });

    it('an obstacle that touches a box edge-on is not an overlap', () => {
      const free = deriveStations(noiseMap, []);
      const box = stationBox(free[0].center);
      const touching: Box = { x0: box.x1, y0: box.y0, x1: box.x1 + 50, y1: box.y1 };
      expect(deriveStations(noiseMap, [touching])[0].center).toEqual(free[0].center);
    });

    it('a three-station world with room for only two steps down to two before it overlaps a host', () => {
      const three = GRID.find((g) => g.stations.length === 3)!;
      const map = getLocaleNoiseMap(three.id, three.x, three.y);
      // A wall over the middle leaves two strips 240 wide × 340 tall — no two points in one strip are 480 apart.
      const wall: Box = { x0: 560 - STATION_BOX_W / 2, y0: 0, x1: 1360 + STATION_BOX_W / 2, y1: 1080 };
      const stations = deriveStations(map, [wall]);
      expect(stations).toHaveLength(2);
      for (const s of stations) expect(overlaps(stationBox(s.center), wall)).toBe(false);
      expect(minPairDistance(stations)).toBeGreaterThanOrEqual(STATION_MIN_SPACING);
    });

    it('a world covered wall to wall still gets ≥ 2 stations, spaced, in range (overlap is dropped last)', () => {
      const everything: Box = { x0: -1000, y0: -1000, x1: 5000, y1: 5000 };
      const stations = deriveStations(noiseMap, [everything]);
      expect(stations.length).toBeGreaterThanOrEqual(2);
      expect(stations.length).toBeLessThanOrEqual(3);
      expect(minPairDistance(stations)).toBeGreaterThanOrEqual(STATION_MIN_SPACING);
      for (const s of stations) {
        expect(s.center.x).toBeGreaterThanOrEqual(240);
        expect(s.center.x).toBeLessThanOrEqual(1680);
        expect(s.center.y).toBeGreaterThanOrEqual(220);
        expect(s.center.y).toBeLessThanOrEqual(560);
      }
    });
  });

  describe('assignStationsAtLoad', () => {
    const ids = Array.from({ length: MAX_ROBOTS }, (_, i) => `robot-${i}`);

    it('assigns by roster index modulo station count', () => {
      const stations = [at('station-0', 300, 300), at('station-1', 900, 300), at('station-2', 1500, 300)];
      const assigned = assignStationsAtLoad(ids, stations);
      ids.forEach((id, i) => expect(assigned[id]).toBe(`station-${i % 3}`));
    });

    it('never exceeds capacity: the full roster over two stations is 6 + 6', () => {
      const stations = [at('station-0', 300, 300), at('station-1', 900, 300)];
      const assigned = assignStationsAtLoad(ids, stations);
      const load = Object.values(assigned).reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
      expect(load).toEqual({ 'station-0': 6, 'station-1': 6 });
    });

    it('never exceeds capacity on any grid world', () => {
      for (const w of GRID) {
        const assigned = assignStationsAtLoad(ids, w.stations);
        expect(Object.keys(assigned)).toHaveLength(MAX_ROBOTS);
        for (const s of w.stations) {
          expect(Object.values(assigned).filter((x) => x === s.id).length).toBeLessThanOrEqual(s.capacity);
        }
      }
    });

    it('no robots → no assignments', () => {
      expect(assignStationsAtLoad([], [at('station-0', 300, 300)])).toEqual({});
    });

    it('throws rather than overfill when the roster does not fit', () => {
      expect(() => assignStationsAtLoad(ids, [at('station-0', 300, 300)])).toThrow();
      expect(() => assignStationsAtLoad(['robot-0'], [])).toThrow();
    });
  });

  describe('nearestFreeStation', () => {
    const stations = [at('station-0', 300, 300), at('station-1', 900, 300), at('station-2', 1500, 300)];

    it('picks the nearest station to the centre', () => {
      expect(nearestFreeStation({ x: 1400, y: 500 }, stations, {})?.id).toBe('station-2');
      expect(nearestFreeStation({ x: 800, y: 100 }, stations, {})?.id).toBe('station-1');
    });

    it('skips a full station for the next nearest', () => {
      expect(nearestFreeStation({ x: 1400, y: 500 }, stations, { 'station-2': 6 })?.id).toBe('station-1');
    });

    it('one slot left is still free', () => {
      expect(nearestFreeStation({ x: 1400, y: 500 }, stations, { 'station-2': 5 })?.id).toBe('station-2');
    });

    it('a missing occupancy entry counts as empty', () => {
      expect(nearestFreeStation({ x: 300, y: 300 }, stations, { 'station-1': 2 })?.id).toBe('station-0');
    });

    it('null when every station is full, or there are none', () => {
      expect(nearestFreeStation({ x: 900, y: 300 }, stations, { 'station-0': 6, 'station-1': 6, 'station-2': 6 })).toBeNull();
      expect(nearestFreeStation({ x: 900, y: 300 }, [], {})).toBeNull();
    });

    it('an equal-distance tie goes to the earlier station', () => {
      expect(nearestFreeStation({ x: 600, y: 300 }, stations, {})?.id).toBe('station-0');
    });
  });
});
