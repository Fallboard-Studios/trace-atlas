// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ========================================
// MOCKS
// ========================================
vi.mock('./AudioEngine', () => ({
  AudioEngine: {
    registerRobotMelody: vi.fn(),
  },
}));

vi.mock('../stores/localeStore', () => ({
  useLocaleStore: {
    getState: () => ({ updateRobot: updateRobotMock, getLocaleById: getLocaleByIdMock }),
  },
}));

// ========================================
// SUBJECT UNDER TEST
// ========================================
import { regenerateMelody } from './regenerateMelody';
import { AudioEngine } from './AudioEngine';
import type { Robot } from '../types/Robot';

// Hoisted mock spy references — resolved after imports so vi.mocked() works.
const updateRobotMock = vi.fn();
// The robot's own locale, read back after the write (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5); none by default.
const getLocaleByIdMock = vi.fn(
  (_localeId: string): { robots: Robot[]; coordinates?: { x: number; y: number } } | undefined => undefined,
);

// ========================================
// HELPERS
// ========================================

function makeRobot(overrides: Partial<Robot> = {}): Robot {
  return {
    id: 'robot-1',
    compositionSeed: 0.5,
    position: { x: 0, y: 0 },
    melody: [],
    audioAttributes: {
      adsr: { attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 },
      filterFreq: 1000,
    },
    octaveRange: [3, 5],
    audioMode: 'none',
    rhythmicDensity: 50,
    rhythmicMotifLength: { active: false, value: 0 },
    noteVariance: { active: false, value: 0 },
    masterVolume: 0.8,
    ...overrides,
  } as Robot;
}

// ========================================
// TEST SUITE: regenerateMelody
// ========================================

describe('regenerateMelody', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls updateRobot on the locale store with the generated melody', () => {
    const robot = makeRobot();
    regenerateMelody(robot, 'locale-1');

    expect(updateRobotMock).toHaveBeenCalledOnce();
    const [localeId, robotId, updates] = updateRobotMock.mock.calls[0];
    expect(localeId).toBe('locale-1');
    expect(robotId).toBe('robot-1');
    expect(Array.isArray(updates.melody)).toBe(true);
    expect(updates.melody.length).toBeGreaterThan(0);
  });

  it('calls AudioEngine.registerRobotMelody with the same melody written to the store', () => {
    const robot = makeRobot();
    regenerateMelody(robot, 'locale-1');

    const registerMock = vi.mocked(AudioEngine.registerRobotMelody);
    expect(registerMock).toHaveBeenCalledOnce();
    const [robotId, registeredMelody] = registerMock.mock.calls[0];
    expect(robotId).toBe('robot-1');

    // The melody passed to AudioEngine must be the same object as stored
    const storedMelody = updateRobotMock.mock.calls[0][2].melody;
    expect(registeredMelody).toBe(storedMelody);
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R5: the engine reads the robot's click track and motif from the robot it is
  // given, so it gets the robot as stored in its own locale - found there even during a rebuild, and fresh where the
  // caller's copy is a stale prop with one field spread in.
  it('hands the engine the robot as stored in its own locale, read back after the write; the copy given when it is not there', () => {
    const stale = makeRobot({ rhythmicMotifLength: { active: true, value: 4 } });
    const stored = makeRobot({ rhythmicMotifLength: { active: true, value: 4 }, clickTrackActive: true });
    getLocaleByIdMock.mockImplementation((localeId) => (localeId === 'locale-1' ? { robots: [stored] } : undefined));
    regenerateMelody(stale, 'locale-1');
    expect(getLocaleByIdMock).toHaveBeenCalledWith('locale-1');
    expect(vi.mocked(AudioEngine.registerRobotMelody).mock.calls[0][2]).toBe(stored);

    regenerateMelody(stale, 'locale-2');
    expect(vi.mocked(AudioEngine.registerRobotMelody).mock.calls[1][2]).toBe(stale);
    getLocaleByIdMock.mockImplementation(() => undefined);
  });

  it('store update is called before AudioEngine registration', () => {
    const callOrder: string[] = [];
    updateRobotMock.mockImplementation(() => callOrder.push('store'));
    vi.mocked(AudioEngine.registerRobotMelody).mockImplementation(() => callOrder.push('engine'));

    regenerateMelody(makeRobot(), 'locale-1');
    expect(callOrder).toEqual(['store', 'engine']);
  });

  it('generated melody events all have noteIndex in [0, 7]', () => {
    regenerateMelody(makeRobot(), 'locale-1');
    const melody: Array<{ noteIndex: number }> = updateRobotMock.mock.calls[0][2].melody;
    melody.forEach((e) => {
      expect(e.noteIndex).toBeGreaterThanOrEqual(0);
      expect(e.noteIndex).toBeLessThanOrEqual(7);
    });
  });

  it('generated melody events all have octave within robot.octaveRange', () => {
    const robot = makeRobot({ octaveRange: [2, 4] });
    regenerateMelody(robot, 'locale-1');
    const melody: Array<{ octave: number }> = updateRobotMock.mock.calls[0][2].melody;
    melody.forEach((e) => {
      expect(e.octave).toBeGreaterThanOrEqual(2);
      expect(e.octave).toBeLessThanOrEqual(4);
    });
  });

  it('uses robot.rhythmicDensity as a fill-rate percentage, not a literal event count', () => {
    // 100% density with motif tiling off fills the entire 16-step measure.
    const robot = makeRobot({ rhythmicDensity: 100, rhythmicMotifLength: { active: false, value: 0 } });
    regenerateMelody(robot, 'locale-1');
    const melody: unknown[] = updateRobotMock.mock.calls[0][2].melody;
    expect(melody).toHaveLength(16);
  });

  it('a low rhythmicDensity never produces a silent (empty) melody', () => {
    const robot = makeRobot({ rhythmicDensity: 0, rhythmicMotifLength: { active: false, value: 0 } });
    regenerateMelody(robot, 'locale-1');
    const melody: unknown[] = updateRobotMock.mock.calls[0][2].melody;
    expect(melody.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to DEFAULT_RHYTHMIC_DENSITY/DEFAULT_RHYTHMIC_MOTIF_LENGTH when rhythmicDensity/rhythmicMotifLength are absent', () => {
    // Defaults: 50% density, motif tiling active at value 8 (repeats=2, perCell=round(0.5*8)=4 -> 8 total).
    const robot = makeRobot({ rhythmicDensity: undefined, rhythmicMotifLength: undefined });
    regenerateMelody(robot, 'locale-1');
    const melody: unknown[] = updateRobotMock.mock.calls[0][2].melody;
    expect(melody).toHaveLength(8);
  });

  it('passes rhythmicMotifLength/noteVariance through as {active, value} objects, not the old bare-number shape', async () => {
    const genSpy = vi.spyOn(await import('./melodyGenerator'), 'generateMelodyForRobot');
    const robot = makeRobot({
      rhythmicMotifLength: { active: true, value: 4 },
      noteVariance: { active: true, value: 3 },
    });
    regenerateMelody(robot, 'locale-1');
    expect(genSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        rhythmicMotifLength: { active: true, value: 4 },
        noteVariance: { active: true, value: 3 },
      })
    );
    genSpy.mockRestore();
  });

  it('never passes onsetCount to generateMelodyForRobot', async () => {
    const genSpy = vi.spyOn(await import('./melodyGenerator'), 'generateMelodyForRobot');
    regenerateMelody(makeRobot(), 'locale-1');
    const passedOpts = genSpy.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(passedOpts.onsetCount).toBeUndefined();
    genSpy.mockRestore();
  });

  it('passes robot.pitchRepeat through to generateMelodyForRobot', async () => {
    const genSpy = vi.spyOn(await import('./melodyGenerator'), 'generateMelodyForRobot');
    const robot = makeRobot({ pitchRepeat: 75 });
    regenerateMelody(robot, 'locale-1');
    expect(genSpy).toHaveBeenCalledWith(expect.objectContaining({ pitchRepeat: 75 }));
    genSpy.mockRestore();
  });

  it('falls back to DEFAULT_PITCH_REPEAT when robot.pitchRepeat is absent', async () => {
    const { DEFAULT_PITCH_REPEAT } = await import('./melodyGenerator');
    const genSpy = vi.spyOn(await import('./melodyGenerator'), 'generateMelodyForRobot');
    const robot = makeRobot({ pitchRepeat: undefined });
    regenerateMelody(robot, 'locale-1');
    expect(genSpy).toHaveBeenCalledWith(expect.objectContaining({ pitchRepeat: DEFAULT_PITCH_REPEAT }));
    genSpy.mockRestore();
  });
});

// ========================================
// TEST SUITE: regenerateMelody — deterministic via compositionSeed (Deterministic Robot
// Melody Generation, Task 4)
// ========================================

describe('regenerateMelody — deterministic via compositionSeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Strips each event's own crypto.randomUUID()'d id before comparing -- by design never
  // seeded, so leaving it in would spuriously fail every determinism assertion below.
  function stripEventIds(melody: unknown[]): unknown[] {
    return melody.map((e) => {
      const { id: _id, ...rest } = e as { id: string };
      return rest;
    });
  }

  it('same robot object (including compositionSeed) produces the same melody across repeated calls', () => {
    const robot = makeRobot({ compositionSeed: 0.17, rhythmicDensity: 60 });
    regenerateMelody(robot, 'locale-1');
    const first = updateRobotMock.mock.calls[0][2].melody;
    updateRobotMock.mockClear();
    regenerateMelody(robot, 'locale-1');
    const second = updateRobotMock.mock.calls[0][2].melody;
    expect(stripEventIds(second)).toEqual(stripEventIds(first));
  });

  it('changing an attribute and then reverting it reproduces the original melody exactly -- no first-edit ratchet', () => {
    const original = makeRobot({ compositionSeed: 0.17, rhythmicDensity: 60 });
    regenerateMelody(original, 'locale-1');
    const originalMelody = updateRobotMock.mock.calls[0][2].melody;
    updateRobotMock.mockClear();

    const edited = { ...original, rhythmicDensity: 90 };
    regenerateMelody(edited, 'locale-1');
    updateRobotMock.mockClear();

    const reverted = { ...original, rhythmicDensity: 60 };
    regenerateMelody(reverted, 'locale-1');
    const revertedMelody = updateRobotMock.mock.calls[0][2].melody;

    expect(stripEventIds(revertedMelody)).toEqual(stripEventIds(originalMelody));
  });

  it('two robots with identical attributes but different compositionSeed produce different melodies -- complementary, not unison', () => {
    const robotA = makeRobot({ compositionSeed: 0.11, rhythmicDensity: 60 });
    const robotB = makeRobot({ compositionSeed: 0.89, rhythmicDensity: 60 });
    regenerateMelody(robotA, 'locale-1');
    const melodyA = updateRobotMock.mock.calls[0][2].melody;
    updateRobotMock.mockClear();
    regenerateMelody(robotB, 'locale-1');
    const melodyB = updateRobotMock.mock.calls[0][2].melody;
    expect(stripEventIds(melodyB)).not.toEqual(stripEventIds(melodyA));
  });

  it('never calls Math.random -- fully seeded via compositionSeed, the original bug this task fixes', () => {
    const spy = vi.spyOn(Math, 'random');
    regenerateMelody(makeRobot({ compositionSeed: 0.42 }), 'locale-1');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ========================================
// TEST SUITE: regenerateMelody — Rests and Accents post-pass (Robot Performance, Task 3)
// docs/specs/ROBOT_PERFORMANCE.md section 1.2
// ========================================

describe('regenerateMelody — Rests and Accents post-pass', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  type StoredEvent = {
    id: string;
    startStep: number;
    length: string;
    noteIndex: number;
    octave: number;
    pitchLocked?: boolean;
    rest?: number;
    mark?: string;
  };

  // A 16-event, tiling-off robot so every setting has plenty of events to stamp.
  const dense = (overrides: Partial<Robot> = {}) =>
    makeRobot({ compositionSeed: 0.31, rhythmicDensity: 100, rhythmicMotifLength: { active: false, value: 0 }, ...overrides });

  function melodyFor(robot: Robot): StoredEvent[] {
    updateRobotMock.mockClear();
    regenerateMelody(robot, 'locale-1');
    return updateRobotMock.mock.calls[0][2].melody;
  }
  const withoutIdsOrStamps = (melody: StoredEvent[]) =>
    melody.map((e) => {
      const { id: _id, rest: _rest, mark: _mark, ...structure } = e;
      return structure;
    });
  const withoutIds = (melody: StoredEvent[]) => melody.map(({ id: _id, ...rest }) => rest);

  it('stamps a melody with rests and marks when the robot has both set', () => {
    const melody = melodyFor(dense({ rests: 60, accents: 60 }));
    expect(melody.some((e) => e.rest !== undefined)).toBe(true);
    expect(melody.some((e) => e.mark !== undefined)).toBe(true);
  });

  it('registers the stamped melody, the same object it wrote to the store', () => {
    const melody = melodyFor(dense({ rests: 60, accents: 60 }));
    const registered = vi.mocked(AudioEngine.registerRobotMelody).mock.calls[0][1];
    expect(registered).toBe(melody);
  });

  it('with rests and accents absent the melody is today melody: no stamps, same events as the seeded generator', async () => {
    const { generateMelodyForRobot, buildSeededComposition, buildSeededRhythm } = await import('./melodyGenerator');
    const robot = dense();
    const expected = generateMelodyForRobot({
      octaveMin: 3,
      octaveMax: 5,
      rhythmicDensity: 100,
      rhythmicMotifLength: { active: false, value: 0 },
      noteVariance: { active: false, value: 0 },
      pitchRepeat: 0,
      rand: buildSeededComposition(robot.compositionSeed, {
        rhythmicDensity: 100,
        rhythmicMotifLength: { active: false, value: 0 },
        noteVariance: { active: false, value: 0 },
        pitchRepeat: 0,
        octaveRange: robot.octaveRange,
      }),
      // Company Families Task 3a: the rhythm stream is the world's; with no locale in the (mocked) store, the
      // locale id stands in for the world key.
      rhythmRand: buildSeededRhythm('locale-1', {
        rhythmicDensity: 100,
        rhythmicMotifLength: { active: false, value: 0 },
      }),
    });
    const melody = melodyFor(robot);
    expect(withoutIds(melody)).toEqual(withoutIds(expected as StoredEvent[]));
    expect(melody.every((e) => !('rest' in e) && !('mark' in e))).toBe(true);
  });

  it('explicit rests 0 and accents 0 equal the absent case', () => {
    expect(withoutIds(melodyFor(dense({ rests: 0, accents: 0 })))).toEqual(withoutIds(melodyFor(dense())));
  });

  it('editing rests regenerates the stamps but never the notes: onsets, lengths, pitches and octaves are unchanged', () => {
    const low = melodyFor(dense({ rests: 10, accents: 40 }));
    const high = melodyFor(dense({ rests: 90, accents: 40 }));
    expect(withoutIdsOrStamps(high)).toEqual(withoutIdsOrStamps(low));
    expect(high.map((e) => e.rest)).not.toEqual(low.map((e) => e.rest));
  });

  it('editing accents regenerates the marks but never the notes', () => {
    const low = melodyFor(dense({ rests: 40, accents: 10 }));
    const high = melodyFor(dense({ rests: 40, accents: 90 }));
    expect(withoutIdsOrStamps(high)).toEqual(withoutIdsOrStamps(low));
    expect(high.map((e) => e.mark)).not.toEqual(low.map((e) => e.mark));
  });

  it('moving rests from 30 to 80 leaves the marked events unchanged, through the real call path', () => {
    const marked = (melody: StoredEvent[]) => melody.filter((e) => e.mark !== undefined).map((e) => e.startStep);
    const before = marked(melodyFor(dense({ rests: 30, accents: 60 })));
    const after = marked(melodyFor(dense({ rests: 80, accents: 60 })));
    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
  });

  it('changing a stamp slider and reverting it reproduces the original melody exactly', () => {
    const original = withoutIds(melodyFor(dense({ rests: 60, accents: 60 })));
    melodyFor(dense({ rests: 20, accents: 60 }));
    expect(withoutIds(melodyFor(dense({ rests: 60, accents: 60 })))).toEqual(original);
  });

  // Company Families Task 3a (B19): the stamps are the world's and the rhythm's, not the seed's, so this compares two
  // worlds (two locale ids, which stand in for the world key while the mocked store has no locale).
  it('the same robot in two worlds is stamped differently', () => {
    const robot = dense({ rests: 60, accents: 60 });
    updateRobotMock.mockClear();
    regenerateMelody(robot, 'locale-2');
    const elsewhere: StoredEvent[] = updateRobotMock.mock.calls[0][2].melody;
    const stamps = (m: StoredEvent[]) => m.map((e) => [e.rest, e.mark]);
    expect(stamps(elsewhere)).not.toEqual(stamps(melodyFor(robot)));
  });

  it('never calls Math.random with rests and accents set', () => {
    const spy = vi.spyOn(Math, 'random');
    melodyFor(dense({ rests: 100, accents: 100 }));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not mutate the robot it was given', () => {
    const robot = dense({ rests: 60, accents: 60 });
    const snapshot = JSON.parse(JSON.stringify(robot));
    melodyFor(robot);
    expect(robot).toEqual(snapshot);
  });

  it('uses a robot value passed in a spread, as the apply actions do: rests from the argument, not a stale store copy', () => {
    const base = dense({ rests: 0, accents: 0 });
    const melody = melodyFor({ ...base, rests: 100 });
    expect(melody.every((e) => e.rest !== undefined)).toBe(true);
  });
});

// ========================================
// TEST SUITE: regenerateMelody — the rhythm stream (Company Families, Task 3, revised by Task 3a)
// docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md §1.11
// ========================================

describe('regenerateMelody — the rhythm stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  type StoredEvent = { startStep: number; length: string; noteIndex: number; octave: number; rest?: number; mark?: string };

  function melodyFor(robot: Robot): StoredEvent[] {
    updateRobotMock.mockClear();
    regenerateMelody(robot, 'locale-1');
    return updateRobotMock.mock.calls[0][2].melody;
  }
  const rhythmOf = (m: StoredEvent[]) => m.map((e) => [e.startStep, e.length]);
  const notesOf = (m: StoredEvent[]) => m.map((e) => [e.noteIndex, e.octave]);
  const stampsOf = (m: StoredEvent[]) => m.map((e) => [e.rest, e.mark]);
  const stepsOf = (m: StoredEvent[]) => m.map((e) => e.startStep);

  // Free and sparse (long, varied gaps, so the lengths are real draws), and tiled.
  const free = (overrides: Partial<Robot> = {}) =>
    makeRobot({ compositionSeed: 0.37, rhythmicDensity: 40, rhythmicMotifLength: { active: false, value: 0 }, ...overrides });
  const tiled = (overrides: Partial<Robot> = {}) =>
    makeRobot({
      compositionSeed: 0.37,
      rhythmicDensity: 50,
      rhythmicMotifLength: { active: true, value: 6 },
      pitchRepeat: 40,
      ...overrides,
    });

  describe('an edit moves the rhythm only when it is a rhythm setting (B7)', () => {
    for (const [name, robot] of [['free', free], ['tiled', tiled]] as const) {
      it(`${name}: a Note Variance edit leaves the onsets and lengths and changes the notes`, () => {
        const before = melodyFor(robot());
        const after = melodyFor(robot({ noteVariance: { active: true, value: 2 } }));
        expect(rhythmOf(after)).toEqual(rhythmOf(before));
        expect(notesOf(after)).not.toEqual(notesOf(before));
      });

      it(`${name}: an octave range edit leaves the onsets and lengths`, () => {
        expect(rhythmOf(melodyFor(robot({ octaveRange: [2, 6] })))).toEqual(rhythmOf(melodyFor(robot())));
      });

      it(`${name}: a Pitch Repeat edit leaves the onsets and lengths`, () => {
        expect(rhythmOf(melodyFor(robot({ pitchRepeat: 90 })))).toEqual(rhythmOf(melodyFor(robot())));
      });

      it(`${name}: a density edit moves the onsets`, () => {
        expect(stepsOf(melodyFor(robot({ rhythmicDensity: 70 })))).not.toEqual(stepsOf(melodyFor(robot())));
      });
    }

    it('a motif edit moves the onsets', () => {
      expect(stepsOf(melodyFor(tiled({ rhythmicMotifLength: { active: true, value: 3 } })))).not.toEqual(
        stepsOf(melodyFor(tiled())),
      );
    });
  });

  // Spec §5.7 case 3 (B16, B17, B19): the world is the locale's coordinates, read from the store.
  describe('in one world, one rhythm shape is one rhythm', () => {
    const COORDINATES: Record<string, { x: number; y: number }> = {
      'world-a': { x: 7, y: 11 },
      'world-a-again': { x: 7, y: 11 },
      'world-b': { x: 8, y: 11 },
      'world-c': { x: 7, y: 12 },
      'world-d': { x: 120, y: 40 },
      'world-e': { x: 0, y: 0 },
    };
    beforeEach(() => {
      getLocaleByIdMock.mockImplementation((localeId) =>
        COORDINATES[localeId] ? { robots: [], coordinates: COORDINATES[localeId] } : undefined,
      );
    });
    afterEach(() => {
      getLocaleByIdMock.mockImplementation(() => undefined);
    });

    function melodyIn(robot: Robot, localeId = 'world-a'): StoredEvent[] {
      updateRobotMock.mockClear();
      regenerateMelody(robot, localeId);
      return updateRobotMock.mock.calls[0][2].melody;
    }
    const restedAt = (m: StoredEvent[]) => m.flatMap((e, i) => (e.rest !== undefined ? [i] : []));

    for (const [name, robot] of [['free', free], ['tiled', tiled]] as const) {
      it(`${name}: two robots with their own seeds and one shape play the same onsets and lengths, and their own notes`, () => {
        const a = melodyIn(robot({ compositionSeed: 0.61 }));
        const b = melodyIn(robot({ compositionSeed: 0.29 }));
        expect(rhythmOf(b)).toEqual(rhythmOf(a));
        expect(notesOf(b)).not.toEqual(notesOf(a));
      });
    }

    it('with the same Rests and Accents they rest and accent together (B19)', () => {
      const a = melodyIn(free({ compositionSeed: 0.61, rests: 50, accents: 60 }));
      const b = melodyIn(free({ compositionSeed: 0.29, rests: 50, accents: 60 }));
      expect(stampsOf(a).some(([rest, mark]) => rest !== undefined || mark !== undefined)).toBe(true);
      expect(stampsOf(b)).toEqual(stampsOf(a));
    });

    it('with different Rests, the lighter one rests on a subset of the heavier one', () => {
      const light = restedAt(melodyIn(free({ compositionSeed: 0.61, rests: 30, accents: 0 })));
      const heavy = restedAt(melodyIn(free({ compositionSeed: 0.29, rests: 80, accents: 0 })));
      expect(heavy.length).toBeGreaterThan(light.length);
      expect(light.every((i) => heavy.includes(i))).toBe(true);
    });

    it('densities that round to the same onset count play the same rhythm (B17)', () => {
      // Free over 16 steps: 38 % and 40 % are both six onsets.
      expect(rhythmOf(melodyIn(free({ compositionSeed: 0.29, rhythmicDensity: 38 })))).toEqual(rhythmOf(melodyIn(free())));
    });

    it('a robot edited to another robot\'s density and motif plays its rhythm', () => {
      const leader = melodyIn(tiled({ compositionSeed: 0.61 }));
      const other = tiled({ compositionSeed: 0.29, rhythmicDensity: 80, rhythmicMotifLength: { active: true, value: 3 } });
      expect(rhythmOf(melodyIn(other))).not.toEqual(rhythmOf(leader));
      const matched = { ...other, rhythmicDensity: 50, rhythmicMotifLength: { active: true, value: 6 } };
      expect(rhythmOf(melodyIn(matched))).toEqual(rhythmOf(leader));
    });

    it('another world plays another rhythm', () => {
      const rhythms = new Set(
        ['world-a', 'world-b', 'world-c', 'world-d', 'world-e'].map((world) => JSON.stringify(rhythmOf(melodyIn(free(), world)))),
      );
      expect(rhythms.size).toBeGreaterThan(1);
    });

    it('the world is the coordinates: two locale ids at one place play the same melody', () => {
      const strip = (m: StoredEvent[]) => m.map(({ startStep, length, noteIndex, octave, rest, mark }) => [startStep, length, noteIndex, octave, rest, mark]);
      const robot = free({ rests: 50, accents: 50 });
      expect(strip(melodyIn(robot, 'world-a-again'))).toEqual(strip(melodyIn(robot, 'world-a')));
    });

    it('a lineage plays no part in the melody', () => {
      const strip = (m: StoredEvent[]) => m.map(({ startStep, length, noteIndex, octave, rest, mark }) => [startStep, length, noteIndex, octave, rest, mark]);
      const robot = free({ rests: 50, accents: 50 });
      expect(strip(melodyIn({ ...robot, lineage: { founderIndex: 3 } }))).toEqual(strip(melodyIn(robot)));
    });
  });
});
