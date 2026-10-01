import { describe, it, expect, vi, beforeEach } from 'vitest';

import { applyRobotLinkToEngine, primeRobotLinks, primeRosterLinks } from './robotLfoLinks';
import { ROBOT_LFO_TARGET_IDS } from '@/types/lfo';
import type { LfoLink } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

// The bank engine (docs/tasks/LFO_BANK.md Task 7/9) — a separate module/mock from the old
// lfoEngine.ts; robotLfoLinks.ts talks to this one exclusively.
vi.mock('@/engine/lfoBank', () => ({
  lfoEngine: {
    linkTarget: vi.fn(() => true),
  },
}));

import { lfoEngine } from '@/engine/lfoBank';

function makeLink(overrides: Partial<LfoLink> = {}): LfoLink {
  return { lane: 'a', depth: 30, ...overrides };
}

function makeRobot(id: string, lfoLinks?: Partial<Record<string, LfoLink>>): Robot {
  return { id, lfoLinks } as unknown as Robot;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('applyRobotLinkToEngine', () => {
  it('calls lfoEngine.linkTarget with the target, link, and robotId', () => {
    const link = makeLink({ lane: 'b', depth: 55 });
    applyRobotLinkToEngine('r1', 'layer0.gain', link);

    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer0.gain', link, 'r1');
  });
});

describe('primeRobotLinks', () => {
  it('calls linkTarget once per stored target with the stored link and the robot id', () => {
    const links: Partial<Record<string, LfoLink>> = {};
    for (const target of ROBOT_LFO_TARGET_IDS) links[target] = makeLink({ depth: 10 });
    const robot = makeRobot('r1', links);

    primeRobotLinks(robot);

    expect(lfoEngine.linkTarget).toHaveBeenCalledTimes(6);
    for (const target of ROBOT_LFO_TARGET_IDS) {
      expect(lfoEngine.linkTarget).toHaveBeenCalledWith(target, links[target], 'r1');
    }
  });

  it('skips a target the robot has no entry for, rather than applying a synthesized default', () => {
    const robot = makeRobot('r1', { 'layer0.gain': makeLink() });

    primeRobotLinks(robot);

    expect(lfoEngine.linkTarget).toHaveBeenCalledTimes(1);
    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer0.gain', robot.lfoLinks!['layer0.gain' as never], 'r1');
  });

  it('makes no engine calls when the robot has no lfoLinks', () => {
    const robot = makeRobot('r1', undefined);

    primeRobotLinks(robot);

    expect(lfoEngine.linkTarget).not.toHaveBeenCalled();
  });

  it('honors an explicit targets list, applying only those', () => {
    const links: Partial<Record<string, LfoLink>> = {};
    for (const target of ROBOT_LFO_TARGET_IDS) links[target] = makeLink();
    const robot = makeRobot('r1', links);

    primeRobotLinks(robot, ['layer1.gain', 'layer1.detune']);

    expect(lfoEngine.linkTarget).toHaveBeenCalledTimes(2);
    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer1.gain', links['layer1.gain'], 'r1');
    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer1.detune', links['layer1.detune'], 'r1');
  });
});

describe('primeRosterLinks', () => {
  it('primes every robot in the roster once', () => {
    const robots = [
      makeRobot('r1', { 'layer0.gain': makeLink() }),
      makeRobot('r2', { 'layer0.gain': makeLink() }),
      makeRobot('r3', { 'layer0.gain': makeLink() }),
    ];

    primeRosterLinks(robots);

    expect(lfoEngine.linkTarget).toHaveBeenCalledTimes(3);
    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer0.gain', robots[0].lfoLinks!['layer0.gain' as never], 'r1');
    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer0.gain', robots[1].lfoLinks!['layer0.gain' as never], 'r2');
    expect(lfoEngine.linkTarget).toHaveBeenCalledWith('layer0.gain', robots[2].lfoLinks!['layer0.gain' as never], 'r3');
  });

  it('skips a robot with no entry for a given target without erroring', () => {
    const robots = [
      makeRobot('r1', { 'layer0.gain': makeLink() }),
      makeRobot('r2', undefined),
    ];

    expect(() => primeRosterLinks(robots)).not.toThrow();
    expect(lfoEngine.linkTarget).toHaveBeenCalledTimes(1);
  });

  it('an empty roster makes no engine calls', () => {
    primeRosterLinks([]);
    expect(lfoEngine.linkTarget).not.toHaveBeenCalled();
  });
});
