import { describe, it, expect } from 'vitest';
import { chooseDeckCameraCutTarget } from './deckCameraTarget';
import { DECK_CAMERA_STATION_CHANCE } from '../constants/deckCamera';

/** A rand() stub that returns a fixed queue of draws, then throws if over-drawn (so an
 *  unexpected extra draw fails loudly rather than silently reading `undefined` as NaN). */
function queue(...values: number[]): () => number {
  const q = [...values];
  return () => {
    if (q.length === 0) throw new Error('rand() called more times than the test queued');
    return q.shift()!;
  };
}

describe('chooseDeckCameraCutTarget (deck camera target selection, post-ship follow-up)', () => {
  it('always returns the triggering robot when nothing is being worked', () => {
    const target = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: [],
      rand: queue(0.99), // would be well within the "pick a worker" range if any existed
    });
    expect(target).toBe('r1');
  });

  it('returns the triggering robot (the station) when the station draw wins, even with workers available', () => {
    const target = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2', 'r3'],
      rand: queue(0), // 0 < DECK_CAMERA_STATION_CHANCE: station wins, no second draw
    });
    expect(target).toBe('r1');
  });

  it('returns a working robot when the station draw loses', () => {
    const target = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2', 'r3'],
      rand: queue(DECK_CAMERA_STATION_CHANCE, 0), // station draw loses, then picks index 0
    });
    expect(target).toBe('r2');
  });

  it('the station-chance boundary is exclusive: exactly DECK_CAMERA_STATION_CHANCE loses (picks a worker)', () => {
    const target = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2'],
      rand: queue(DECK_CAMERA_STATION_CHANCE, 0),
    });
    expect(target).toBe('r2');
  });

  it('just under the boundary wins the station', () => {
    const target = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2'],
      rand: queue(DECK_CAMERA_STATION_CHANCE - 0.0001),
    });
    expect(target).toBe('r1');
  });

  it('picks among several workers by the second draw, not always the first or last', () => {
    const last = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2', 'r3', 'r4'],
      rand: queue(1, 0.999999), // station loses; second draw lands on the last index
    });
    expect(last).toBe('r4');

    const middle = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2', 'r3', 'r4'],
      rand: queue(1, 0.5),
    });
    expect(middle).toBe('r3');
  });

  it('a single working robot is always the target once the station draw loses', () => {
    const target = chooseDeckCameraCutTarget({
      triggerRobotId: 'r1',
      workingRobotIds: ['r2'],
      rand: queue(1, 0.5),
    });
    expect(target).toBe('r2');
  });
});
