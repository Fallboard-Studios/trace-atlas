// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import type { Robot } from '../types/Robot';
import { DEFAULT_LOCALE, useLocaleStore } from '../stores/localeStore';
import { AudioEngine } from '../engine/AudioEngine';
import { CLASSIC } from '../data/bands/classic';
import { getUniformSeededVal } from '../utils/getSeededVal';
import { quantizeToStep } from '../utils/math';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { correlation, outerTenths } from '../testUtils/spread';
import {
  companyFounders,
  generateCompanyMembership,
  generateRobotAudioBaseline,
  generateRobotRosterBaseline,
  spawnRobot,
  type RobotAudioBaseline,
} from './spawnSystem';

// ========================================
// TESTS
// ========================================

// Even Seeded Draws (docs/specs/EVEN_SEEDED_DRAWS.md §5.1): the performance, volume and melody-seed draws of both robot
// paths over seeded locale maps, mock-free but for the engine (see spawnSystem.evenDraws.test.ts). The copy draw this
// file also covered is gone (Company Families Task 5): a company member takes its founder's fields instead.
const ROBOTS_PER_WORLD = 12;

/** Runs `spawn` with the engine's voice and melody registration stubbed (jsdom has no audio graph to build them on);
 *  no draw is stubbed. */
function withEngineStubbed<T>(spawn: () => T): T {
  const engine = [
    vi.spyOn(AudioEngine, 'reserveVoice').mockReturnValue(true),
    vi.spyOn(AudioEngine, 'registerRobotMelody').mockImplementation(() => {}),
    vi.spyOn(AudioEngine, 'updateRobotSends').mockImplementation(() => {}),
    vi.spyOn(AudioEngine, 'updateRobotPan').mockImplementation(() => {}),
  ];
  try {
    return spawn();
  } finally {
    for (const spy of engine) spy.mockRestore();
  }
}

describe('performance, volume and the melody seed draw even, in both robot paths (Even Seeded Draws T9)', () => {
  // The baseline path: 1,000 rosters of 12. A company member shares its audioAttributes object with its founder, so the
  // rest are fresh draws at their own index: about 6,000 robots, at which a performance field's outer tenth (9-11 % on
  // its integer grid) sits 2.5 standard deviations inside 8-12 %.
  const PERF_WORLDS = Array.from({ length: 1000 }, (_, i) => createNoise2D(alea(`performance:${i}`)));
  const ROSTERS = PERF_WORLDS.map((noiseMap) => generateRobotRosterBaseline(noiseMap, ROBOTS_PER_WORLD));
  const isMember = (roster: readonly RobotAudioBaseline[], n: number) => roster.slice(0, n).some((p) => p.audioAttributes === roster[n].audioAttributes);
  const FRESH = ROSTERS.flatMap((roster) => roster.filter((_, n) => !isMember(roster, n)));

  // The spawn path: 400 locales x 12 spawns through spawnRobot, the only path that seeds master volume and the melody
  // seed.
  const SPAWNED: Robot[] = withEngineStubbed(() => {
    const localeIds = Array.from({ length: 400 }, (_, i) => `even-draws-t9-${i}`);
    useLocaleStore.setState((state) => ({
      locales: {
        ...state.locales,
        ...Object.fromEntries(localeIds.map((id, i) => [id, { ...DEFAULT_LOCALE, id, coordinates: { x: i * 37 - 7000, y: i * 91 - 18000 }, robots: [], companies: [] }])),
      },
    }));
    for (const id of localeIds) for (let n = 0; n < ROBOTS_PER_WORLD; n++) spawnRobot(id);
    return localeIds.flatMap((id) => useLocaleStore.getState().getLocaleById(id)!.robots);
  });

  // On a rounded integer draw each whole value takes 1 / span of the robots and the two edge values half that, so an
  // outer tenth expects (its whole values - 0.5) / span: 9 % and 11 % on a 50-wide band (outerTenths' top tenth counts
  // its lower edge, the bottom does not), but 5 % and 15 % on Classic's 10-wide Rests
  // (docs/tasks/THEME_AND_ASPECTS_REFINEMENT.md R3). Each within 2 points of its own.
  it('dynamics, rests and accents fill their bands: each outer tenth holds its even share of fresh robots, within 2 points', () => {
    for (const field of ['dynamics', 'rests', 'accents'] as const) {
      const band = CLASSIC[`robot.${field}`];
      const span = band.max - band.min;
      const wholes = Array.from({ length: span + 1 }, (_, i) => band.min + i);
      const share = (values: number[]) => (outerTenths(values, band).bottom * values.length - 0.5) / span;
      const topShare = (values: number[]) => (outerTenths(values, band).top * values.length - 0.5) / span;
      const { bottom, top } = outerTenths(FRESH.map((b) => b[field]), band);
      expect(Math.abs(bottom - share(wholes)), `${field} bottom tenth`).toBeLessThanOrEqual(0.02);
      expect(Math.abs(top - topShare(wholes)), `${field} top tenth`).toBeLessThanOrEqual(0.02);
    }
  });

  it('the melody seed takes more than 4,700 distinct values over 4,800 spawned robots', () => {
    expect(SPAWNED).toHaveLength(4800);
    expect(new Set(SPAWNED.map((r) => r.compositionSeed)).size).toBeGreaterThan(4700);
  });

  it('rests and accents correlate under 0.1 with master volume', () => {
    const volume = SPAWNED.map((r) => r.masterVolume ?? 0);
    expect(Math.abs(correlation(SPAWNED.map((r) => r.rests ?? 0), volume)), 'rests vs master volume').toBeLessThan(0.1);
    expect(Math.abs(correlation(SPAWNED.map((r) => r.accents ?? 0), volume)), 'accents vs master volume').toBeLessThan(0.1);
  });

  it('the baseline path: each draw is the even draw at its own dataId and the spawn count', () => {
    for (const noiseMap of PERF_WORLDS.slice(0, 10)) {
      const roster = generateRobotRosterBaseline(noiseMap, ROBOTS_PER_WORLD);
      const founders = companyFounders(generateCompanyMembership(noiseMap, ROBOTS_PER_WORLD));
      roster.forEach((b, n) => {
        const even = (dataId: string, min = 0, max = 1) => getUniformSeededVal(noiseMap, dataId, n, min, max);
        const founder = founders.get(n);
        if (founder !== undefined) {
          expect(b.audioAttributes, `robot ${n}`).toBe(roster[founder].audioAttributes);
          return;
        }
        for (const field of ['dynamics', 'rests', 'accents'] as const) {
          const band = CLASSIC[`robot.${field}`];
          expect(b[field], `robot ${n} ${field}`).toBe(Math.round(even(`robot.${field}`, band.min, band.max)));
        }
      });
    }
  });

  it('the spawn path: the performance fields, the master volume and the melody seed are the same even draws', () => {
    const volume = CLASSIC['robot.masterVolume'];
    for (const localeId of ['even-draws-t9-0', 'even-draws-t9-1', 'even-draws-t9-2']) {
      const locale = useLocaleStore.getState().getLocaleById(localeId)!;
      const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
      // Robots spawned alone are originals: the chain of original baselines, each given the ones before it.
      const baselines = locale.robots.reduce<RobotAudioBaseline[]>((prior, _, n) => [...prior, generateRobotAudioBaseline(noiseMap, n, prior)], []);
      locale.robots.forEach((robot, n) => {
        expect(robot.compositionSeed, `robot ${n}`).toBe(getUniformSeededVal(noiseMap, 'robot.compositionSeed', n));
        expect(robot.audioAttributes, `robot ${n}`).toEqual(baselines[n].audioAttributes);
        expect([robot.dynamics, robot.rests, robot.accents], `robot ${n}`).toEqual([baselines[n].dynamics, baselines[n].rests, baselines[n].accents]);
        // The master volume: the even draw plus the register's bias (bass louder, treble quieter), on the 1 % grid.
        const registerBias = (4.5 - (robot.octaveRange[0] + robot.octaveRange[1]) / 2) * 0.05;
        const seeded = getUniformSeededVal(noiseMap, 'robot.masterVolume', n, volume.min, volume.max);
        expect(robot.masterVolume, `robot ${n}`).toBe(quantizeToStep(Math.max(0.5, Math.min(0.95, seeded + registerBias)) * 100, 0, 1) / 100);
      });
    }
  });

  it('fallback: with no locale (no noise map) a spawned robot is still in band', () => {
    const added: Robot[] = [];
    const realAddRobot = useLocaleStore.getState().addRobot;
    useLocaleStore.setState({ addRobot: (_localeId, robot) => { added.push(robot); } });
    try {
      withEngineStubbed(() => {
        for (let i = 0; i < 12; i++) spawnRobot(`even-draws-t9-no-locale-${i}`);
      });
    } finally {
      useLocaleStore.setState({ addRobot: realAddRobot });
    }
    for (const robot of added) {
      for (const field of ['dynamics', 'rests', 'accents'] as const) {
        const band = CLASSIC[`robot.${field}`];
        expect(robot[field]).toBeGreaterThanOrEqual(band.min);
        expect(robot[field]).toBeLessThanOrEqual(band.max);
      }
      expect(robot.masterVolume).toBeGreaterThanOrEqual(0.5);
      expect(robot.masterVolume).toBeLessThanOrEqual(0.95);
      expect(robot.compositionSeed).toBeGreaterThanOrEqual(0);
      expect(robot.compositionSeed).toBeLessThan(1);
    }
  });
});
