// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  generateCompanyId,
  generateCompanyMembership,
  generateRosterStart,
  rosterGroupDraws,
  spawnInitialCompanies,
  spawnInitialRoster,
} from './spawnSystem';
import { useLocaleStore } from '../stores/localeStore';
import { SIM_SEED_COORDS, simNoiseMap } from './lifecycleSim';
import { planExit } from './shiftPlan';
import { journeyKey, journeyTurns } from '../engine/melodyJourney';
import { DockingState } from '../types/Robot';
import { MAX_ROBOTS, SHIFT_HOME_MAX_BARS, SHIFT_START_OUT_ODDS } from '../constants';
import { outerTenths } from '../testUtils/spread';

// ========================================
// HELPERS
// ========================================
const worldKeyOf = ({ x, y }: { x: number; y: number }) => `${x}:${y}`;

/** A world's groups as roster indices: each seeded company, then each freelancer alone, in roster order. */
function groupsOf(coords: { x: number; y: number }): number[][] {
  const membership = generateCompanyMembership(simNoiseMap(coords.x, coords.y), MAX_ROBOTS).map((m) => [...m].sort((a, b) => a - b));
  const inCompany = new Set(membership.flat());
  const freelancers = Array.from({ length: MAX_ROBOTS }, (_, i) => i).filter((i) => !inCompany.has(i)).map((i) => [i]);
  return [...membership, ...freelancers].sort((a, b) => a[0] - b[0]);
}

// ========================================
// TESTS
// ========================================

// The start of a world (roadmap 94 Task 14, spec §1.13): groups start out or home, not roster indices.
describe('generateRosterStart (spec §1.13)', () => {
  const WORLDS = SIM_SEED_COORDS.slice(0, 40);
  const start = (c: { x: number; y: number }, bpm = 60, startMeasure = 0) =>
    generateRosterStart(simNoiseMap(c.x, c.y), { bpm, worldKey: worldKeyOf(c), startMeasure });

  it('gives every roster index a start, with the membership generateCompanyMembership gives', () => {
    for (const c of WORLDS) {
      const s = start(c);
      expect(s).toHaveLength(MAX_ROBOTS);
      const noiseMap = simNoiseMap(c.x, c.y);
      generateCompanyMembership(noiseMap, MAX_ROBOTS).forEach((members, company) => {
        for (const i of members) expect(s[i].companyId).toBe(generateCompanyId(noiseMap, company));
      });
    }
  });

  it("a starting-out company is whole, Active at 100, on planExit's turns from the start; a starting-home one shares one entrance", () => {
    let outCompanies = 0;
    let homeCompanies = 0;
    for (const c of WORLDS) {
      const s = start(c, 60, 0);
      for (const group of groupsOf(c)) {
        const members = group.map((i) => s[i]);
        const docking = new Set(members.map((m) => m.docking));
        expect(docking.size, `${worldKeyOf(c)} ${group}`).toBe(1);
        if (members[0].docking === DockingState.Active) {
          if (group.length > 1) outCompanies++;
          expect(members.every((m) => m.batteryLevel === 100)).toBe(true);
          const want = planExit({
            worldKey: worldKeyOf(c),
            members: group.map((i) => ({ id: `roster-${i}`, companyId: s[i].companyId, compositionSeed: s[i].compositionSeed, batterySize: s[i].batterySize })),
            from: 0,
            bpm: 60,
          });
          expect(members.map((m) => m.exitsAtMeasure)).toEqual(want);
          expect(members.every((m) => m.entersAtMeasure === undefined)).toBe(true);
        } else {
          expect(members[0].docking).toBe(DockingState.Docked);
          if (group.length > 1) homeCompanies++;
          expect(new Set(members.map((m) => m.entersAtMeasure)).size).toBe(1);
          expect(members.every((m) => m.exitsAtMeasure === undefined)).toBe(true);
          expect(members.every((m) => m.batteryLevel < 100)).toBe(true);
        }
        expect(members.every((m) => m.shiftBpm === 60)).toBe(true);
      }
    }
    expect(outCompanies).toBeGreaterThan(5);
    expect(homeCompanies).toBeGreaterThan(5);
  });

  it("a starting-home group's entrance is the first turn at or after its drawn offset, within the home limit", () => {
    for (const c of WORLDS) {
      for (const bpm of [20, 60, 200]) {
        const s = start(c, bpm, 100);
        const noiseMap = simNoiseMap(c.x, c.y);
        for (const group of groupsOf(c)) {
          const first = s[group[0]];
          if (first.docking !== DockingState.Docked) continue;
          const key = journeyKey(worldKeyOf(c), first.companyId ? { kind: 'company', companyId: first.companyId } : { kind: 'fleet' });
          const offset = Math.max(1, Math.round((rosterGroupDraws(noiseMap, group[0]).firstEntrance * SHIFT_HOME_MAX_BARS * bpm) / 60));
          expect(first.entersAtMeasure).toBe(journeyTurns(key, 100 + offset, 100 + offset + 40)[0].measure);
        }
      }
    }
  });

  it('starts at least one group out in every one of the 121 grid worlds', () => {
    let rescued = 0;
    for (const c of SIM_SEED_COORDS) {
      const s = start(c);
      expect(s.some((r) => r.docking === DockingState.Active), worldKeyOf(c)).toBe(true);
      const noiseMap = simNoiseMap(c.x, c.y);
      if (groupsOf(c).every((g) => rosterGroupDraws(noiseMap, g[0]).startsOut >= SHIFT_START_OUT_ODDS)) {
        rescued++;
        // None drew out: the earliest group in the roster (index 0's) starts out, and only it.
        const firstGroup = groupsOf(c)[0];
        expect(s.filter((r) => r.docking === DockingState.Active).length).toBe(firstGroup.length);
        for (const i of firstGroup) expect(s[i].docking).toBe(DockingState.Active);
      }
    }
    expect(rescued).toBeGreaterThan(0);
  });

  it('decides each group on its own draw at its earliest member, against SHIFT_START_OUT_ODDS', () => {
    for (const c of WORLDS) {
      const s = start(c);
      const noiseMap = simNoiseMap(c.x, c.y);
      const groups = groupsOf(c);
      if (groups.every((g) => rosterGroupDraws(noiseMap, g[0]).startsOut >= SHIFT_START_OUT_ODDS)) continue;
      for (const g of groups) {
        const out = rosterGroupDraws(noiseMap, g[0]).startsOut < SHIFT_START_OUT_ODDS;
        expect(s[g[0]].docking, `${worldKeyOf(c)} ${g}`).toBe(out ? DockingState.Active : DockingState.Docked);
      }
    }
  });

  it('both group draws are even over 3,000 worlds', () => {
    const startsOut: number[] = [];
    const firstEntrance: number[] = [];
    for (let n = 0; n < 3000; n++) {
      const draws = rosterGroupDraws(simNoiseMap(n % 97, Math.floor(n / 97) - 15), n % MAX_ROBOTS);
      startsOut.push(draws.startsOut);
      firstEntrance.push(draws.firstEntrance);
    }
    for (const values of [startsOut, firstEntrance]) {
      const { bottom, top } = outerTenths(values, { min: 0, max: 1 });
      expect(bottom).toBeGreaterThan(0.08);
      expect(bottom).toBeLessThan(0.12);
      expect(top).toBeGreaterThan(0.08);
      expect(top).toBeLessThan(0.12);
    }
  });

  it('gives the same world the same start twice', () => {
    for (const c of WORLDS.slice(0, 10)) expect(start(c, 87, 12)).toEqual(start(c, 87, 12));
  });

  it('keeps every docked battery under 100 and every member its own docked battery draw', () => {
    for (const c of WORLDS) {
      const s = start(c);
      const docked = s.filter((r) => r.docking === DockingState.Docked).map((r) => r.batteryLevel);
      for (const b of docked) {
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(100);
      }
    }
  });
});

// A world starts by groups (roadmap 94 Task 23): spawnInitialRoster takes each robot's docking, battery and first move
// from generateRosterStart, at the tempo it is handed, the world's key and its creation measure.
describe('spawnInitialRoster starts a world by groups (roadmap 94 Task 23)', () => {
  const register = (id: string, x: number, y: number, createdAtMeasure: number) =>
    useLocaleStore.getState().addLocale('pelagos', {
      id,
      attenuationStyleId: 'pelagos',
      name: id,
      coordinates: { x, y },
      dayStartTimestamp: Date.now(),
      createdAtMeasure,
      robots: [],
      actors: [],
      companies: [],
    });

  it("gives every spawned robot generateRosterStart's docking, battery and move, at the tempo handed in and the creation measure", () => {
    for (const [n, { x, y }] of [{ x: -200, y: 80 }, { x: 40, y: -80 }, { x: 160, y: 0 }].entries()) {
      const id = `roster-start-${n}`;
      register(id, x, y, 37);
      spawnInitialRoster(id, { bpm: 140 });
      spawnInitialCompanies(id);
      const robots = useLocaleStore.getState().getLocaleById(id)!.robots;
      const start = generateRosterStart(simNoiseMap(x, y), { bpm: 140, worldKey: `${x}:${y}`, startMeasure: 37 });
      robots.forEach((r, i) => {
        expect(
          { docking: r.docking, batteryLevel: r.batteryLevel, entersAtMeasure: r.entersAtMeasure, exitsAtMeasure: r.exitsAtMeasure, shiftBpm: r.shiftBpm, companyId: r.companyId },
          `${id} #${i}`,
        ).toEqual({
          docking: start[i].docking,
          batteryLevel: start[i].batteryLevel,
          entersAtMeasure: start[i].entersAtMeasure,
          exitsAtMeasure: start[i].exitsAtMeasure,
          shiftBpm: 140,
          companyId: start[i].companyId,
        });
      });
    }
  });

  it("a spawned world's companies are each whole, out or home; out members 'exiting' at their ports, home ones 'charging'", () => {
    let out = 0;
    let home = 0;
    for (const [n, c] of SIM_SEED_COORDS.slice(0, 12).entries()) {
      const id = `roster-whole-${n}`;
      register(id, c.x, c.y, 0);
      spawnInitialRoster(id);
      spawnInitialCompanies(id);
      const robots = useLocaleStore.getState().getLocaleById(id)!.robots;
      const companies = new Set(robots.map((r) => r.companyId).filter(Boolean));
      for (const co of companies) {
        const members = robots.filter((r) => r.companyId === co);
        expect(new Set(members.map((m) => m.docking)).size, `${id} ${co}`).toBe(1);
        if (members[0].docking === DockingState.Active) out++;
        else home++;
      }
      for (const r of robots) expect(r.activity).toBe(r.docking === DockingState.Active ? 'exiting' : 'charging');
    }
    expect(out).toBeGreaterThan(2);
    expect(home).toBeGreaterThan(2);
  });
});
