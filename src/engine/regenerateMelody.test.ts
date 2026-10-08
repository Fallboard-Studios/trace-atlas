// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    getState: () => ({ updateRobot: updateRobotMock }),
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
    createdAt: Date.now(),
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
