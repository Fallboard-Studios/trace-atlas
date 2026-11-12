// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';
import alea from 'alea';
import { createNoise2D } from 'simplex-noise';
import type { Robot } from '../types/Robot';
import {
  ADJECTIVES, COMPANY_NOUNS, NOUNS, generateCompanyIdentityColor, generateCompanyMembership, generateCompanyRosterBaseline,
  generateRobotRosterBaseline, spawnRobot,
} from './spawnSystem';
import { MAX_ROBOTS } from '../constants';
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

describe('a company\'s name, id, identity colour and membership draw even (Even World Draws T2)', () => {
  // 3,000 worlds, each a 12-robot roster's seeded companies, coloured the way spawnInitialCompanies colours them (each
  // company's draw retried against the colours before it).
  const MAPS = Array.from({ length: 3000 }, (_, i) => createNoise2D(alea(`even-world-companies:${i}`)));
  const ROSTER_IDS = Array.from({ length: MAX_ROBOTS }, (_, i) => `robot-${i}`);
  const COMPANIES = MAPS.flatMap((noiseMap) => {
    const used: string[] = [];
    return generateCompanyRosterBaseline(noiseMap, ROSTER_IDS).map((company, c) => {
      const color = generateCompanyIdentityColor(noiseMap, c, used);
      used.push(color);
      return { ...company, color };
    });
  });

  it('every adjective names 10 % of companies (+/-2 points) and every company noun 12.5 % (+/-2 points)', () => {
    const adjectives = COMPANIES.map((c) => c.name.split(' ')[0]);
    const nouns = COMPANIES.map((c) => c.name.split(' ')[1]);
    for (const word of ADJECTIVES) {
      expect(shareOf(adjectives, word), word).toBeGreaterThanOrEqual(0.08);
      expect(shareOf(adjectives, word), word).toBeLessThanOrEqual(0.12);
    }
    for (const word of COMPANY_NOUNS) {
      expect(shareOf(nouns, word), word).toBeGreaterThanOrEqual(0.105);
      expect(shareOf(nouns, word), word).toBeLessThanOrEqual(0.145);
    }
  });

  it('each of the 18 hues is some company\'s colour at 5.6 % (+/-1.5 points), and no two companies of a world share one', () => {
    const colors = COMPANIES.map((c) => c.color);
    for (const name of ROBOT_IDENTITY_COLOR_NAMES) {
      expect(shareOf(colors, ACCENT_COLORS[name]), name).toBeGreaterThanOrEqual(0.041);
      expect(shareOf(colors, ACCENT_COLORS[name]), name).toBeLessThanOrEqual(0.071);
    }
    let start = 0;
    for (const noiseMap of MAPS) {
      const count = generateCompanyMembership(noiseMap).length;
      const world = colors.slice(start, start + count);
      expect(new Set(world).size).toBe(world.length);
      start += count;
    }
  });

  it('the company id keeps its shape and its suffix takes a distinct value for more than 95 % of companies', () => {
    COMPANIES.forEach((company) => expect(company.id).toMatch(/^company-[0-2]-[0-9a-z]{8}$/));
    expect(new Set(COMPANIES.map((c) => c.id.split('-')[2])).size).toBeGreaterThan(COMPANIES.length * 0.95);
  });

  it('the count draw makes two companies in 50 % of worlds (+/-3 points) and three in the rest, read on a roster the cap never touches', () => {
    const counts = MAPS.map((noiseMap) => generateCompanyMembership(noiseMap, 16).length);
    expect(counts.every((n) => n === 2 || n === 3)).toBe(true);
    expect(shareOf(counts, 2)).toBeGreaterThanOrEqual(0.47);
    expect(shareOf(counts, 2)).toBeLessThanOrEqual(0.53);
  });

  it('the size draw: a world\'s first company (never capped) has 3 robots in 50 % of worlds (+/-3 points) and 4 in the rest', () => {
    const sizes = MAPS.map((noiseMap) => generateCompanyMembership(noiseMap)[0].length);
    expect(sizes.every((n) => n === 3 || n === 4)).toBe(true);
    expect(shareOf(sizes, 3)).toBeGreaterThanOrEqual(0.47);
    expect(shareOf(sizes, 3)).toBeLessThanOrEqual(0.53);
  });

  // The count and size shares above were already right on the plain draw (spec §1.1): two outcomes split at the middle.
  // What the plain draw got wrong is the pair, welded at offset 0; this case was RED with both plain (2:3 at 30.7 %).
  // Either one alone put back on the plain draw passes every case here: an equivalent mutant, recorded at T2.
  it('the count and the first size are independent: each of the four (count, size) pairs starts 25 % of worlds (+/-3 points)', () => {
    const pairs = MAPS.map((noiseMap) => {
      const membership = generateCompanyMembership(noiseMap, 16);
      return `${membership.length}:${membership[0].length}`;
    });
    for (const pair of ['2:3', '2:4', '3:3', '3:4']) {
      expect(shareOf(pairs, pair), pair).toBeGreaterThanOrEqual(0.22);
      expect(shareOf(pairs, pair), pair).toBeLessThanOrEqual(0.28);
    }
  });

  it('the member draw favours no roster index: each index is in a company in a share within 4 points of the mean over all twelve', () => {
    const memberships = MAPS.map((noiseMap) => new Set(generateCompanyMembership(noiseMap).flat()));
    const shares = ROSTER_IDS.map((_, i) => memberships.filter((m) => m.has(i)).length / memberships.length);
    const mean = shares.reduce((sum, s) => sum + s, 0) / shares.length;
    shares.forEach((share, i) => expect(Math.abs(share - mean), `index ${i}: ${share} vs mean ${mean}`).toBeLessThanOrEqual(0.04));
  });
});
