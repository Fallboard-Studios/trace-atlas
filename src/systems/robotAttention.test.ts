// ========================================
// robotAttention (docs/specs/ROBOT_NOTE_CLOUD.md §1.7, §8.4; plan Task 19)
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The Deck camera's followed-robot pair, as a fake the tests drive.
const camera = vi.hoisted(() => {
  let followed: string | null = null;
  const listeners = new Set<() => void>();
  return {
    follow(id: string | null) {
      followed = id;
      for (const listener of [...listeners]) listener();
    },
    getFollowedRobotId: () => followed,
    subscribeFollowedRobot(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
  };
});

vi.mock('../animation/deckCamera', () => ({
  getFollowedRobotId: camera.getFollowedRobotId,
  subscribeFollowedRobot: camera.subscribeFollowedRobot,
}));

import { getPointedRobotId, getSingledOutRobotId, setPointedRobot, subscribeSingledOut } from './robotAttention';

const cleanups: Array<() => void> = [];
const subscribe = (fn: (listener: () => void) => () => void, listener: () => void) => cleanups.push(fn(listener));

beforeEach(() => {
  camera.follow(null);
  setPointedRobot(null);
});

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('robotAttention: the singled-out robot (§1.7)', () => {
  it('is null with nothing pointed at and nothing followed', () => {
    expect(getSingledOutRobotId()).toBeNull();
  });

  it('is the followed robot when nothing is pointed at', () => {
    camera.follow('r2');
    expect(getSingledOutRobotId()).toBe('r2');
  });

  it('is the pointed-at robot, even while the camera follows another', () => {
    camera.follow('r2');
    setPointedRobot('r1');
    expect(getSingledOutRobotId()).toBe('r1');
    expect(getPointedRobotId()).toBe('r1');
    setPointedRobot(null);
    expect(getSingledOutRobotId()).toBe('r2');
    expect(getPointedRobotId()).toBeNull();
  });

  it('calls a subscriber when the pointer or the camera changes the singled-out id', () => {
    const listener = vi.fn();
    subscribe(subscribeSingledOut, listener);
    setPointedRobot('r1');
    expect(listener).toHaveBeenCalledTimes(1);
    camera.follow('r2'); // the pointer still wins: no change
    expect(listener).toHaveBeenCalledTimes(1);
    setPointedRobot(null); // r1 → r2
    expect(listener).toHaveBeenCalledTimes(2);
    camera.follow(null); // r2 → null
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('calls nobody when the id does not change: pointing at the robot already followed, or the same robot twice', () => {
    camera.follow('r1');
    const listener = vi.fn();
    subscribe(subscribeSingledOut, listener);
    setPointedRobot('r1');
    setPointedRobot('r1');
    expect(listener).not.toHaveBeenCalled();
    setPointedRobot(null);
    expect(listener).not.toHaveBeenCalled();
  });

  it('holds the camera only while someone listens', () => {
    expect(camera.listenerCount()).toBe(0);
    const stop = subscribeSingledOut(() => {});
    const stopToo = subscribeSingledOut(() => {});
    expect(camera.listenerCount()).toBe(1);
    stop();
    expect(camera.listenerCount()).toBe(1);
    stopToo();
    expect(camera.listenerCount()).toBe(0);
  });

  it('a subscriber added after a change is told of the next change only', () => {
    camera.follow('r2');
    const listener = vi.fn();
    subscribe(subscribeSingledOut, listener);
    camera.follow('r2');
    expect(listener).not.toHaveBeenCalled();
    camera.follow('r3');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getSingledOutRobotId()).toBe('r3');
  });
});
