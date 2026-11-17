// ========================================
// IMPORTS
// ========================================
// The sweep of docs/specs/MELODY_JOURNEY.md §5.2 over every robot of the 121 sim worlds, in its own file so it runs in
// parallel with the unit file (as the spawnSystem.even* files do).
import { describe, it, expect } from 'vitest';
import { developMelody, developmentFloor, eventSixteenths, type DevelopmentOptions } from './melodyDevelopment';
import { composeRobotMelody } from './regenerateMelody';
import { DEFAULT_SUBDIVISIONS } from './melodyGenerator';
import { generateRobotRosterBaseline } from '../systems/spawnSystem';
import { SIM_SEED_COORDS, simNoiseMap } from '../systems/lifecycleSim';
import { getUniformSeededVal } from '../utils/getSeededVal';
import { getBand } from '../data/bands/loadingContext';
import { MAX_ROBOTS } from '../constants';
import type { MelodyEvent } from '../types/Robot';

// ========================================
// THE ROBOTS
// ========================================
interface SweepRobot {
  label: string;
  home: MelodyEvent[];
  options: DevelopmentOptions;
}

/** Every robot of the 121 worlds: its home melody as spawn composes it (the roster baseline's fields, its own
 *  composition seed, the world's coordinates as the key), its floor at the top of the theme's bpm band. The seed is
 *  spawnSystem's generateCompositionSeed draw, mirrored here (it is not exported). */
const ROBOTS: SweepRobot[] = SIM_SEED_COORDS.flatMap(({ x, y }) => {
  const noiseMap = simNoiseMap(x, y);
  return generateRobotRosterBaseline(noiseMap, MAX_ROBOTS).map((b, i) => {
    const compositionSeed = getUniformSeededVal(noiseMap, 'robot.compositionSeed', i, 0, 1);
    const home = composeRobotMelody({ ...b, compositionSeed }, `${x}:${y}`);
    return {
      label: `${x}:${y} #${i}`,
      home,
      options: { floor: developmentFloor(b.audioAttributes.adsr.attack, getBand('bpm').max), seed: compositionSeed },
    };
  });
});

// ========================================
// HELPERS
// ========================================
const BAR_END = DEFAULT_SUBDIVISIONS + 1;
const rhythm = (events: MelodyEvent[]) => events.map((e) => `${e.startStep}:${eventSixteenths(e)}`).join(' ');
const stepOf = (e: MelodyEvent) => e.pitchStep ?? 0;

/** The last position before the shift phase: the first p whose next change leaves the rhythm as it is. */
function lastFill(r: SweepRobot): number {
  let p = 0;
  while (rhythm(developMelody(r.home, p + 1, r.options)) !== rhythm(developMelody(r.home, p, r.options))) p++;
  return p;
}

/** Why `b` is not one busy change on top of `a` (a split, a fill or a shift), or null when it is. */
function notOneBusyChange(a: MelodyEvent[], b: MelodyEvent[]): string | null {
  const before = new Map(a.map((e) => [e.id, e]));
  const added = b.filter((e) => !before.has(e.id));
  if (b.length - a.length !== added.length || added.length > 1) return `${added.length} added, ${b.length - a.length} more`;
  const lengthened = b.filter((e) => before.has(e.id) && eventSixteenths(e) !== eventSixteenths(before.get(e.id)!));
  const moved = b.filter((e) => before.has(e.id) && stepOf(e) !== stepOf(before.get(e.id)!));
  const restarted = b.filter((e) => before.has(e.id) && e.startStep !== before.get(e.id)!.startStep);
  if (moved.length + restarted.length > 0 && added.length > 0) return 'a note moved as one was added';
  if (added.length === 1) {
    if (lengthened.length === 0) return null; // a fill
    if (lengthened.length > 1) return `${lengthened.length} notes changed length`;
    const [split] = lengthened;
    const t = eventSixteenths(added[0]);
    if (eventSixteenths(before.get(split.id)!) - eventSixteenths(split) !== t) return 'a split did not conserve length';
    if (added[0].startStep !== split.startStep + eventSixteenths(split)) return 'a split part is not where the note now ends';
    return null;
  }
  if (lengthened.length + restarted.length > 0 || moved.length !== 1) return `no note added, ${moved.length} moved`;
  return Math.abs(stepOf(moved[0]) - stepOf(before.get(moved[0].id)!)) === 1 ? null : 'a shift of more than one step';
}

/** Why `b` is not one tie on top of `a`, or null when it is. */
function notOneTie(a: MelodyEvent[], b: MelodyEvent[]): string | null {
  if (a.length - b.length !== 1) return `${a.length - b.length} notes removed`;
  const kept = new Set(b.map((e) => e.id));
  const i = a.findIndex((e) => !kept.has(e.id));
  if (i <= 0) return 'the bar first note was tied away';
  const tied = a[i];
  const extended = b.find((e) => e.id === a[i - 1].id)!;
  return extended.startStep + eventSixteenths(extended) === tied.startStep + eventSixteenths(tied) ? null : 'the note before does not reach the tied note end';
}

/** Collects every robot's failures of `check`, so a miss names the robot and the run makes one assertion. */
function sweep(check: (r: SweepRobot) => string | null): string[] {
  const misses: string[] = [];
  for (const r of ROBOTS) {
    const miss = check(r);
    if (miss) misses.push(`${r.label}: ${miss}`);
  }
  return misses.slice(0, 20);
}

/** Every position from two below the calm floor to 12 changes past the last fill. */
function positionsOf(r: SweepRobot): number[] {
  const from = -(r.home.length - 1) - 2;
  const to = lastFill(r) + 12;
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

// ========================================
// TESTS
// ========================================
describe('developMelody over every robot of the 121 sim worlds (spec §5.2)', () => {
  it('sweeps the whole fleet', () => {
    expect(ROBOTS).toHaveLength(SIM_SEED_COORDS.length * MAX_ROBOTS);
    expect(ROBOTS.every((r) => r.home.length > 0)).toBe(true);
  });

  it('never overlaps two notes, leaves the bar, or makes a note shorter than the floor', () => {
    expect(sweep((r) => {
      const homeLengths = new Map(r.home.map((e) => [e.id, eventSixteenths(e)]));
      for (const p of positionsOf(r)) {
        const events = developMelody(r.home, p, r.options);
        for (let i = 0; i < events.length; i++) {
          const e = events[i];
          const end = e.startStep + eventSixteenths(e);
          if (e.startStep < 1 || end > BAR_END) return `p${p}: a note leaves the bar`;
          if (i + 1 < events.length && end > events[i + 1].startStep) return `p${p}: notes overlap at ${e.startStep}`;
          // A tie only lengthens a note, so a home note under the floor may grow and still be under it. What must
          // never happen is a change shortening a note, or adding one, under the floor.
          const homeLength = homeLengths.get(e.id);
          const shortened = homeLength === undefined || eventSixteenths(e) < homeLength;
          if (shortened && eventSixteenths(e) < r.options.floor) return `p${p}: a made note under the floor`;
        }
      }
      return null;
    })).toEqual([]);
  });

  it('makes each next position one change on top of the last, and walking back gives the last exactly', () => {
    expect(sweep((r) => {
      const positions = positionsOf(r);
      const seen = new Map(positions.map((p) => [p, developMelody(r.home, p, r.options)]));
      for (const p of positions) {
        if (!seen.has(p + 1)) continue;
        const a = seen.get(p)!;
        const b = seen.get(p + 1)!;
        if (p >= 0) {
          const miss = notOneBusyChange(a, b);
          if (miss) return `p${p}->p${p + 1}: ${miss}`;
        } else if (p + 1 <= 0 && -p <= r.home.length - 1) {
          const miss = notOneTie(b, a);
          if (miss) return `p${p + 1}->p${p}: ${miss}`;
        } else if (rhythm(a) !== rhythm(b)) return `p${p}: below the calm floor and still changing`;
      }
      for (const p of [...positions].reverse()) {
        if (JSON.stringify(developMelody(r.home, p, r.options)) !== JSON.stringify(seen.get(p))) return `p${p}: walking back differs`;
      }
      return null;
    })).toEqual([]);
  });

  it('keeps every home note on its own slot and start before the shift phase', () => {
    expect(sweep((r) => {
      const last = lastFill(r);
      for (let p = 0; p <= last; p++) {
        const events = developMelody(r.home, p, r.options);
        for (const h of r.home) {
          const e = events.find((x) => x.id === h.id);
          if (!e || e.startStep !== h.startStep || e.noteIndex !== h.noteIndex || e.octave !== h.octave || e.pitchStep !== undefined) {
            return `p${p}: home note ${h.startStep} moved`;
          }
        }
      }
      return null;
    })).toEqual([]);
  });

  it('shifts one note one step per change once the fills are done, in start order, round and round', () => {
    expect(sweep((r) => {
      const last = lastFill(r);
      let prev = developMelody(r.home, last, r.options);
      for (let p = last + 1; p <= last + 12; p++) {
        const next = developMelody(r.home, p, r.options);
        if (rhythm(next) !== rhythm(prev)) return `p${p}: the rhythm changed in the shift phase`;
        const moved = next.map((_, i) => i).filter((i) => stepOf(next[i]) !== stepOf(prev[i]));
        if (moved.length !== 1) return `p${p}: ${moved.length} notes moved`;
        if (moved[0] !== (p - last - 1) % next.length) return `p${p}: note ${moved[0]} moved, not ${(p - last - 1) % next.length}`;
        prev = next;
      }
      return null;
    })).toEqual([]);
  });

  it('gives the same events for the same inputs, ids included, and never an empty melody', () => {
    expect(sweep((r) => {
      for (const p of positionsOf(r)) {
        const a = developMelody(r.home, p, r.options);
        if (a.length === 0) return `p${p}: empty`;
        if (JSON.stringify(a) !== JSON.stringify(developMelody(r.home.map((e) => ({ ...e })), p, { ...r.options }))) return `p${p}: not repeatable`;
      }
      return null;
    })).toEqual([]);
  });

  it('holds the calm floor: one note, the bar first, at every position below it', () => {
    expect(sweep((r) => {
      const floor = developMelody(r.home, -(r.home.length - 1), r.options);
      const first = Math.min(...r.home.map((e) => e.startStep));
      if (floor.length !== 1 || floor[0].startStep !== first) return 'the floor is not the bar first note alone';
      for (const p of [-r.home.length, -r.home.length - 5]) {
        if (JSON.stringify(developMelody(r.home, p, r.options)) !== JSON.stringify(floor)) return `p${p}: not the floor`;
      }
      return null;
    })).toEqual([]);
  });
});
