import { describe, it, expect, vi, beforeEach } from 'vitest';

import { applyRobotLfoToEngine, primeRobotLfos, primeRosterLfos } from './robotLfoPriming';
import { ROBOT_LFO_TARGET_IDS } from '@/types/lfo';
import type { LfoSettings } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

vi.mock('@/engine/lfoEngine', () => ({
  lfoEngine: {
    connectLfoTarget: vi.fn(() => true),
    disconnectLfoTarget: vi.fn(),
    setLfoRate: vi.fn(),
    setLfoDepth: vi.fn(),
    setLfoShape: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  },
}));

import { lfoEngine } from '@/engine/lfoEngine';

function makeLfo(overrides: Partial<LfoSettings> = {}): LfoSettings {
  return { shape: 'sine', rate: 0, depth: 20, ...overrides };
}

function makeRobot(id: string, lfoSettings?: Partial<Record<string, LfoSettings>>): Robot {
  return { id, lfoSettings } as unknown as Robot;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyRobotLfoToEngine', () => {
  it('sets shape/rate/depth then connects and starts when rate > 0', () => {
    const value = makeLfo({ rate: 2, shape: 'square', depth: 55 });
    applyRobotLfoToEngine('r1', 'layer0.gain', value);

    expect(lfoEngine.setLfoShape).toHaveBeenCalledWith('layer0.gain', 'square', 'r1');
    expect(lfoEngine.setLfoRate).toHaveBeenCalledWith('layer0.gain', 2, 'r1');
    expect(lfoEngine.setLfoDepth).toHaveBeenCalledWith('layer0.gain', 55, 'r1');
    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('layer0.gain', 'r1');
    expect(lfoEngine.start).toHaveBeenCalledWith('layer0.gain', 'r1');
    expect(lfoEngine.disconnectLfoTarget).not.toHaveBeenCalled();
    expect(lfoEngine.stop).not.toHaveBeenCalled();
  });

  it('disconnects and stops when rate is 0 — never connects or starts', () => {
    const value = makeLfo({ rate: 0 });
    applyRobotLfoToEngine('r1', 'layer1.detune', value);

    expect(lfoEngine.disconnectLfoTarget).toHaveBeenCalledWith('layer1.detune', 'r1');
    expect(lfoEngine.stop).toHaveBeenCalledWith('layer1.detune', 'r1');
    expect(lfoEngine.connectLfoTarget).not.toHaveBeenCalled();
    expect(lfoEngine.start).not.toHaveBeenCalled();
  });

  it('does not call start when connectLfoTarget declines (budget refusal)', () => {
    (lfoEngine.connectLfoTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    applyRobotLfoToEngine('r1', 'layer2.phase', makeLfo({ rate: 1 }));

    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('layer2.phase', 'r1');
    expect(lfoEngine.start).not.toHaveBeenCalled();
  });
});

describe('primeRobotLfos', () => {
  it('applies every target the robot has settings for, across all 9 (3 on, 6 off)', () => {
    const settings: Partial<Record<string, LfoSettings>> = {};
    for (const [i, target] of ROBOT_LFO_TARGET_IDS.entries()) {
      settings[target] = makeLfo({ rate: i < 3 ? 2 : 0 });
    }
    const robot = makeRobot('r1', settings);

    primeRobotLfos(robot);

    expect(lfoEngine.setLfoRate).toHaveBeenCalledTimes(9);
    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledTimes(3);
    expect(lfoEngine.disconnectLfoTarget).toHaveBeenCalledTimes(6);
  });

  it('makes no engine calls when the robot has no lfoSettings', () => {
    const robot = makeRobot('r1', undefined);
    primeRobotLfos(robot);

    expect(lfoEngine.setLfoRate).not.toHaveBeenCalled();
    expect(lfoEngine.connectLfoTarget).not.toHaveBeenCalled();
  });

  it('skips a target the robot has no entry for, rather than applying a synthesized default', () => {
    const robot = makeRobot('r1', { 'layer0.gain': makeLfo({ rate: 1 }) });
    primeRobotLfos(robot);

    expect(lfoEngine.setLfoRate).toHaveBeenCalledTimes(1);
    expect(lfoEngine.setLfoRate).toHaveBeenCalledWith('layer0.gain', 1, 'r1');
  });

  it('honors an explicit targets list, applying only those', () => {
    const settings: Partial<Record<string, LfoSettings>> = {};
    for (const target of ROBOT_LFO_TARGET_IDS) settings[target] = makeLfo({ rate: 1 });
    const robot = makeRobot('r1', settings);

    primeRobotLfos(robot, ['layer1.gain', 'layer1.detune']);

    expect(lfoEngine.setLfoRate).toHaveBeenCalledTimes(2);
    expect(lfoEngine.setLfoRate).toHaveBeenCalledWith('layer1.gain', 1, 'r1');
    expect(lfoEngine.setLfoRate).toHaveBeenCalledWith('layer1.detune', 1, 'r1');
  });
});

describe('primeRosterLfos — round-robin request order (spec §1.2)', () => {
  it('requests each robot\'s first target before any robot\'s second target', () => {
    const order = ['layer0.gain', 'layer0.detune'] as const;
    const settings = (rate: number): Partial<Record<string, LfoSettings>> => ({
      'layer0.gain': makeLfo({ rate }),
      'layer0.detune': makeLfo({ rate }),
    });
    const robots = [makeRobot('r1', settings(1)), makeRobot('r2', settings(1)), makeRobot('r3', settings(1))];

    primeRosterLfos(robots);

    const connectCalls = (lfoEngine.connectLfoTarget as ReturnType<typeof vi.fn>).mock.calls;
    // Only the two targets we seeded are connected, in round-robin order: r1/r2/r3 x gain, then r1/r2/r3 x detune.
    const relevant = connectCalls.filter(([target]) => order.includes(target));
    expect(relevant.map(([target, robotId]) => `${robotId}:${target}`)).toEqual([
      'r1:layer0.gain', 'r2:layer0.gain', 'r3:layer0.gain',
      'r1:layer0.detune', 'r2:layer0.detune', 'r3:layer0.detune',
    ]);
  });

  it('visits a target with rate 0 (disconnect) without consuming connect-order priority', () => {
    const robots = [
      makeRobot('r1', { 'layer0.gain': makeLfo({ rate: 0 }) }),
      makeRobot('r2', { 'layer0.gain': makeLfo({ rate: 1 }) }),
    ];

    primeRosterLfos(robots);

    expect(lfoEngine.disconnectLfoTarget).toHaveBeenCalledWith('layer0.gain', 'r1');
    expect(lfoEngine.connectLfoTarget).toHaveBeenCalledWith('layer0.gain', 'r2');
  });

  it('skips a robot with no entry for a given target without erroring', () => {
    const robots = [
      makeRobot('r1', { 'layer0.gain': makeLfo({ rate: 1 }) }),
      makeRobot('r2', undefined),
    ];

    expect(() => primeRosterLfos(robots)).not.toThrow();
    expect(lfoEngine.setLfoRate).toHaveBeenCalledTimes(1);
  });

  it('an empty roster makes no engine calls', () => {
    primeRosterLfos([]);
    expect(lfoEngine.setLfoRate).not.toHaveBeenCalled();
  });
});
