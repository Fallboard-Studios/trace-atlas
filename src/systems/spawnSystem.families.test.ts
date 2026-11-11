// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Robot } from '../types/Robot';
import { DEFAULT_LOCALE, useLocaleStore } from '../stores/localeStore';
import { AudioEngine } from '../engine/AudioEngine';
import { ROBOT_SEND_FIELDS } from '../data/robotSends';
import { getSeededVal, getUniformSeededVal } from '../utils/getSeededVal';
import { SIM_SEED_COORDS, simNoiseMap } from './lifecycleSim';
import {
  generateBatterySize,
  generateCompanyMembership,
  generateRobotRosterBaseline,
  spawnInitialCompanies,
  spawnInitialRoster,
  spawnRobot,
} from './spawnSystem';

// Every seeded draw stays real; the plain and even draws are spies so a test can read which dataIds a spawn drew.
vi.mock('../utils/getSeededVal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/getSeededVal')>();
  return { ...actual, getSeededVal: vi.fn(actual.getSeededVal), getUniformSeededVal: vi.fn(actual.getUniformSeededVal) };
});

// ========================================
// HELPERS
// ========================================

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

let worlds = 0;
/** A fresh locale at (x, y) under a new id (so its spawn count starts at 0), its roster spawned and nothing else: no
 *  companies and no deal, so the roster is spawnInitialRoster's own (the deal still derives a member from its own index
 *  until Task 6). */
function spawnWorld(x: number, y: number): { localeId: string; robots: Robot[] } {
  const localeId = `families-t5-${worlds++}`;
  useLocaleStore.setState((state) => ({
    locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x, y }, robots: [], companies: [] } },
  }));
  withEngineStubbed(() => spawnInitialRoster(localeId));
  return { localeId, robots: useLocaleStore.getState().getLocaleById(localeId)!.robots };
}

/** What a member takes from its founder (spec §1.9, B5): the voice, the composition settings, the performance
 *  settings, the LFO links and the five sends. */
const INHERITED = [
  'audioAttributes', 'octaveRange', 'rhythmicDensity', 'rhythmicMotifLength', 'noteVariance', 'pitchRepeat',
  'dynamics', 'rests', 'accents', 'lfoLinks', ...ROBOT_SEND_FIELDS,
] as const satisfies readonly (keyof Robot)[];
const inheritedOf = (robot: Robot) => Object.fromEntries(INHERITED.map((field) => [field, robot[field]]));
/** A melody's rhythm: each event's onset and length (and its rest and accent stamps, which ride the same stream). */
const rhythmOf = (robot: Robot) => robot.melody.map((e) => ({ startStep: e.startStep, length: e.length, rest: e.rest, mark: e.mark }));
const notesOf = (robot: Robot) => robot.melody.map((e) => [e.noteIndex, e.octave]);

/** Member index -> founder index (the company's lowest index, B6) for one world's membership. */
function foundersOf(membership: number[][]): Map<number, number> {
  const founders = new Map<number, number>();
  for (const members of membership) {
    const founder = Math.min(...members);
    for (const member of members) if (member !== founder) founders.set(member, founder);
  }
  return founders;
}

// ========================================
// TESTS
// ========================================

// Company Families Task 5 (docs/tasks/COMPANY_FAMILIES.md; spec §1.9, §1.11; cases 6, 7 and the hand move of 9).
describe('a seeded company is a family at spawn (Company Families Task 5)', () => {
  afterEach(() => {
    vi.mocked(getSeededVal).mockClear();
    vi.mocked(getUniformSeededVal).mockClear();
  });

  // Case 6, over the 121 grid worlds, on spawnInitialRoster's output before any deal.
  describe('over the grid', () => {
    const GRID = SIM_SEED_COORDS.map(({ x, y }) => {
      const { robots } = spawnWorld(x, y);
      return { key: `${x}:${y}`, x, y, robots, founders: foundersOf(generateCompanyMembership(simNoiseMap(x, y))) };
    });
    const MEMBERS = GRID.flatMap(({ key, x, y, robots, founders }) =>
      [...founders].map(([member, founder]) => ({ key, x, y, member, founder, robot: robots[member], source: robots[founder] })),
    );

    it('every world spawns twelve robots, and the grid holds members to check (4 to 7 a world)', () => {
      for (const { key, robots, founders } of GRID) {
        expect(robots, key).toHaveLength(12);
        expect(founders.size, key).toBeGreaterThanOrEqual(4);
        expect(founders.size, key).toBeLessThanOrEqual(7);
      }
    });

    it('every member carries its founder\'s voice, composition and performance settings, LFO links and five sends', () => {
      for (const { key, member, founder, robot, source } of MEMBERS) {
        expect(inheritedOf(robot), `${key} robot ${member} from ${founder}`).toEqual(inheritedOf(source));
      }
    });

    it('every member plays its founder\'s onsets, lengths and stamps exactly', () => {
      for (const { key, member, founder, robot, source } of MEMBERS) {
        expect(rhythmOf(robot), `${key} robot ${member} from ${founder}`).toEqual(rhythmOf(source));
      }
    });

    it('a member\'s notes are its own: most members differ from their founder', () => {
      const differ = MEMBERS.filter(({ robot, source }) => JSON.stringify(notesOf(robot)) !== JSON.stringify(notesOf(source)));
      expect(differ.length / MEMBERS.length).toBeGreaterThan(0.5);
    });

    it('a member keeps its own id, name, colour, gem, composition seed, battery size and start', () => {
      for (const { key, x, y, member, founder, robot, source } of MEMBERS) {
        const noiseMap = simNoiseMap(x, y);
        expect(founder, `${key} robot ${member}`).toBeLessThan(member);
        expect(robot.id, `${key} robot ${member}`).not.toBe(source.id);
        expect(robot.compositionSeed, `${key} robot ${member}`).toBe(getUniformSeededVal(noiseMap, 'robot.compositionSeed', member));
        expect(robot.batterySize, `${key} robot ${member}`).toBe(generateBatterySize(noiseMap, member));
      }
      // Across the grid the own draws really are their own, not the founder's by coincidence.
      for (const field of ['name', 'identityColor', 'gemSeed', 'compositionSeed', 'batterySize', 'masterVolume'] as const) {
        expect(MEMBERS.some(({ robot, source }) => robot[field] !== source[field]), field).toBe(true);
      }
    });

    it('members carry lineage { founderIndex }; founders and freelancers carry none', () => {
      for (const { key, robots, founders } of GRID) {
        robots.forEach((robot, i) => {
          if (founders.has(i)) expect(robot.lineage, `${key} robot ${i}`).toEqual({ founderIndex: founders.get(i) });
          else expect(robot.lineage, `${key} robot ${i}`).toBeUndefined();
        });
      }
    });

    it('generateRobotRosterBaseline mirrors it: a member\'s baseline is its founder\'s, with its own name and volume', () => {
      for (const { key, x, y, robots, founders } of GRID) {
        const baselines = generateRobotRosterBaseline(simNoiseMap(x, y), 12);
        for (const [member, founder] of founders) {
          const { name, masterVolume, ...inherited } = baselines[member];
          const { name: _n, masterVolume: _v, ...founderInherited } = baselines[founder];
          expect(inherited, `${key} robot ${member}`).toEqual(founderInherited);
          expect(name, `${key} robot ${member}`).toBe(robots[member].name);
          expect(masterVolume, `${key} robot ${member}`).toBe(robots[member].masterVolume);
        }
      }
    });
  });

  // Case 7: the copy roll and its two dataIds are retired, read by no spawn path (spied draws, not a source scan).
  describe('the copy roll is gone', () => {
    const drawnIds = () => [
      ...vi.mocked(getSeededVal).mock.calls.map((call) => call[1]),
      ...vi.mocked(getUniformSeededVal).mock.calls.map((call) => call[1]),
    ];

    it('spawnInitialRoster, spawnInitialCompanies, a lone spawnRobot and generateRobotRosterBaseline never draw robot.copyChance or robot.copySource', () => {
      const { localeId } = spawnWorld(40, 0);
      spawnInitialCompanies(localeId);
      withEngineStubbed(() => spawnRobot(localeId));
      generateRobotRosterBaseline(simNoiseMap(40, 0), 12);
      const ids = drawnIds();
      expect(ids).toContain('robot.compositionSeed'); // the spies do see spawn's draws
      expect(ids).not.toContain('robot.copyChance');
      expect(ids).not.toContain('robot.copySource');
    });

    it('a robot spawned alone, with no founder, is an original: no lineage, its own voice', () => {
      const { localeId, robots } = spawnWorld(40, 0);
      withEngineStubbed(() => spawnRobot(localeId));
      const lone = useLocaleStore.getState().getLocaleById(localeId)!.robots[12];
      expect(lone.lineage).toBeUndefined();
      for (const robot of robots) expect(lone.audioAttributes).not.toBe(robot.audioAttributes);
    });
  });

  // spawnRobot's founder option, on its own.
  describe('spawnRobot with a founder', () => {
    it('copies the founder from the store, sets the lineage, and draws the member\'s own fields at its own spawn count', () => {
      const localeId = `families-t5-${worlds++}`;
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: 80, y: -40 }, robots: [], companies: [] } },
      }));
      withEngineStubbed(() => {
        spawnRobot(localeId);
        spawnRobot(localeId);
        spawnRobot(localeId, { founderIndex: 1 });
      });
      const [, founder, member] = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(inheritedOf(member)).toEqual(inheritedOf(founder));
      expect(member.lineage).toEqual({ founderIndex: 1 });
      expect(member.compositionSeed).toBe(getUniformSeededVal(simNoiseMap(80, -40), 'robot.compositionSeed', 2));
      expect(member.batterySize).toBe(generateBatterySize(simNoiseMap(80, -40), 2));
    });

    it('a founder index with no robot behind it spawns an original', () => {
      const localeId = `families-t5-${worlds++}`;
      useLocaleStore.setState((state) => ({
        locales: { ...state.locales, [localeId]: { ...DEFAULT_LOCALE, id: localeId, coordinates: { x: 80, y: -40 }, robots: [], companies: [] } },
      }));
      withEngineStubbed(() => spawnRobot(localeId, { founderIndex: 5 }));
      const [robot] = useLocaleStore.getState().getLocaleById(localeId)!.robots;
      expect(robot.lineage).toBeUndefined();
    });
  });

  // Case 9's second half (B15): a member moved by hand into another company keeps its lineage and its melody.
  it('a member moved by hand to another company keeps its lineage, and its melody does not change', () => {
    const { localeId } = spawnWorld(-200, 80); // three companies (Task 4's Results)
    spawnInitialCompanies(localeId);
    const { robots, companies } = useLocaleStore.getState().getLocaleById(localeId)!;
    expect(companies.length).toBe(3);
    const member = robots.find((r) => r.lineage !== undefined && r.companyId === companies[0].id)!;
    expect(member, 'a member of the first company').toBeDefined();

    useLocaleStore.getState().assignRobotToCompany(localeId, member.id, companies[1].id);

    const moved = useLocaleStore.getState().getLocaleById(localeId)!.robots.find((r) => r.id === member.id)!;
    expect(moved.companyId).toBe(companies[1].id);
    expect(moved.lineage).toEqual(member.lineage);
    expect(moved.melody).toBe(member.melody);
  });
});
