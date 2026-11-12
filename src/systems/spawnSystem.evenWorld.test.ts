// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import type { Robot } from '../types/Robot';
import { ADJECTIVES, NOUNS, generateRobotRosterBaseline, spawnRobot } from './spawnSystem';
import { useLocaleStore, DEFAULT_LOCALE } from '../stores/localeStore';
import { evictLocaleNoiseMap, getLocaleNoiseMap } from '../utils/noiseMaps';
import { AudioEngine } from '../engine/AudioEngine';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '../constants/accentColors';
import { correlation, outerTenths } from '../testUtils/spread';

// ========================================
// THE SAMPLE
// ========================================
// Even World Draws (docs/specs/EVEN_WORLD_DRAWS.md §5.1): the world and visual picks spawnSystem.ts draws, over real
// seeded locale maps, through the real generators. This file mocks nothing (spawnSystem.test.ts's spies and steered
// draws would leak into a distribution). 400 worlds x 12 robots: every tolerance below is at least 4 standard
// deviations of its share.
const WORLDS = 400;
const ROBOTS_PER_WORLD = 12;

/** 400 distinct coordinates on a 20 x 20 grid, each its own locale. */
const COORDS = Array.from({ length: WORLDS }, (_, i) => ({ x: (i % 20) * 9 - 90, y: Math.floor(i / 20) * 9 - 90 }));

/** Twelve lone spawnRobot calls per world (the spawn position is a lone spawn's: the roster moves robots to stations). */
function spawnWorlds(): Robot[] {
  return COORDS.flatMap(({ x, y }, w) => {
    const id = `even-world-robots-${w}`;
    useLocaleStore.setState({ locales: { [id]: { ...DEFAULT_LOCALE, id, coordinates: { x, y }, robots: [], actors: [], companies: [] } } });
    for (let i = 0; i < ROBOTS_PER_WORLD; i++) spawnRobot(id);
    const robots = useLocaleStore.getState().getLocaleById(id)!.robots;
    for (const robot of robots) {
      AudioEngine.unregisterRobotMelody(robot.id);
      AudioEngine.releaseVoice(robot.id);
    }
    evictLocaleNoiseMap(id);
    return robots;
  });
}

const ROBOTS = spawnWorlds();
const NAMES = COORDS.flatMap(({ x, y }, w) => {
  const noiseMap = getLocaleNoiseMap(`even-world-names-${w}`, x, y);
  evictLocaleNoiseMap(`even-world-names-${w}`);
  return generateRobotRosterBaseline(noiseMap, ROBOTS_PER_WORLD).map((b) => b.name);
});

const shareOf = <T>(values: readonly T[], value: T) => values.filter((v) => v === value).length / values.length;
const hueIndex = (robot: Robot) => ROBOT_IDENTITY_COLOR_NAMES.findIndex((name) => ACCENT_COLORS[name] === robot.identityColor);

// ========================================
// TESTS
// ========================================

describe('a robot\'s name, identity colour, gem seed, id and spawn position draw even (Even World Draws T1)', () => {
  it('the sample is what it says: 4,800 spawned robots and 4,800 baseline names, the spawned names the baseline\'s', () => {
    expect(ROBOTS).toHaveLength(WORLDS * ROBOTS_PER_WORLD);
    expect(NAMES).toHaveLength(WORLDS * ROBOTS_PER_WORLD);
    expect(ROBOTS.map((r) => r.name)).toEqual(NAMES);
  });

  it('each of the ten adjectives and ten nouns names 10 % of robots (+/-2 points)', () => {
    const adjectives = NAMES.map((n) => n.split(' ')[0]);
    const nouns = NAMES.map((n) => n.split(' ')[1]);
    for (const word of ADJECTIVES) {
      expect(shareOf(adjectives, word), word).toBeGreaterThanOrEqual(0.08);
      expect(shareOf(adjectives, word), word).toBeLessThanOrEqual(0.12);
    }
    for (const word of NOUNS) {
      expect(shareOf(nouns, word), word).toBeGreaterThanOrEqual(0.08);
      expect(shareOf(nouns, word), word).toBeLessThanOrEqual(0.12);
    }
  });

  it('each of the 18 identity hues colours 5.6 % of robots (+/-1.5 points), and no robot a colour off the list', () => {
    const hues = ROBOTS.map(hueIndex);
    expect(hues.every((h) => h >= 0)).toBe(true);
    ROBOT_IDENTITY_COLOR_NAMES.forEach((name, i) => {
      expect(shareOf(hues, i), name).toBeGreaterThanOrEqual(0.041);
      expect(shareOf(hues, i), name).toBeLessThanOrEqual(0.071);
    });
  });

  it('the gem seed takes more than 4,700 distinct values over 4,800 robots, every one a whole number in [0, 2^31)', () => {
    const seeds = ROBOTS.map((r) => r.gemSeed);
    expect(seeds.every((s) => Number.isInteger(s) && s >= 0 && s < 2 ** 31)).toBe(true);
    expect(new Set(seeds).size).toBeGreaterThan(4700);
  });

  it('the id keeps its shape (robot-<spawnCount>-<8 base-36 chars>) and its suffix takes more than 4,700 distinct values', () => {
    ROBOTS.forEach((robot, i) => expect(robot.id).toMatch(new RegExp(`^robot-${i % ROBOTS_PER_WORLD}-[0-9a-z]{8}$`)));
    expect(new Set(ROBOTS.map((r) => r.id.split('-')[2])).size).toBeGreaterThan(4700);
  });

  it('the spawn x and y each put 8-12 % of robots in each outer tenth of their band', () => {
    // generateSpawnPosition's bands: x over [0, 1920), y 1,080 + 150 below the viewBox top plus a 0-50 draw.
    const axes = {
      x: { values: ROBOTS.map((r) => r.position.x), band: { min: 0, max: 1920 } },
      y: { values: ROBOTS.map((r) => r.position.y), band: { min: 1230, max: 1280 } },
    };
    for (const [axis, { values, band }] of Object.entries(axes)) {
      const { bottom, top } = outerTenths(values, band);
      expect(bottom, `${axis} bottom tenth`).toBeGreaterThanOrEqual(0.08);
      expect(bottom, `${axis} bottom tenth`).toBeLessThanOrEqual(0.12);
      expect(top, `${axis} top tenth`).toBeGreaterThanOrEqual(0.08);
      expect(top, `${axis} top tenth`).toBeLessThanOrEqual(0.12);
    }
  });

  it('the picks are not welded: the adjective under 0.1 with the hue, the noun under 0.1 with the gem seed', () => {
    // NAMES[i] is ROBOTS[i]'s name (the sample case above).
    const adjective = NAMES.map((n) => ADJECTIVES.indexOf(n.split(' ')[0]));
    const noun = NAMES.map((n) => NOUNS.indexOf(n.split(' ')[1]));
    expect(Math.abs(correlation(adjective, ROBOTS.map(hueIndex)))).toBeLessThan(0.1);
    expect(Math.abs(correlation(noun, ROBOTS.map((r) => r.gemSeed)))).toBeLessThan(0.1);
  });
});
