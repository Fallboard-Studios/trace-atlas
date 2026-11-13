// ========================================
// noteEvents (docs/specs/ROBOT_NOTE_CLOUD.md §1.2, §4; plan Task 2)
// ========================================
import { afterEach, describe, expect, it, vi } from 'vitest';

import { emitRobotNote, hasRobotNoteListener, onRobotNote, type RobotNoteEvent } from './noteEvents';

const EVENT: RobotNoteEvent = { lead: 0.2, duration: 0.25, at: 12.5, note: 'C4' };

const unsubscribes: Array<() => void> = [];
function listen(robotId: string, listener: (event: RobotNoteEvent) => void): () => void {
  const off = onRobotNote(robotId, listener);
  unsubscribes.push(off);
  return off;
}

afterEach(() => {
  unsubscribes.splice(0).forEach((off) => off());
  vi.restoreAllMocks();
});

describe('noteEvents: the listener registry', () => {
  it('a listener hears its own robot and no other robot', () => {
    const a = vi.fn();
    const b = vi.fn();
    listen('r1', a);
    listen('r2', b);
    emitRobotNote('r1', EVENT);
    expect(a).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(EVENT);
    expect(b).not.toHaveBeenCalled();
  });

  it('two listeners on one robot both hear', () => {
    const a = vi.fn();
    const b = vi.fn();
    listen('r1', a);
    listen('r1', b);
    emitRobotNote('r1', EVENT);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('emitting to a robot nobody listens to does nothing and throws nothing', () => {
    expect(() => emitRobotNote('nobody', EVENT)).not.toThrow();
    expect(hasRobotNoteListener('nobody')).toBe(false);
  });

  it('the unsubscribe stops it; hasRobotNoteListener is true until the last listener has gone', () => {
    const a = vi.fn();
    const b = vi.fn();
    expect(hasRobotNoteListener('r1')).toBe(false);
    const offA = listen('r1', a);
    const offB = listen('r1', b);
    expect(hasRobotNoteListener('r1')).toBe(true);
    offA();
    expect(hasRobotNoteListener('r1')).toBe(true);
    emitRobotNote('r1', EVENT);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    offB();
    expect(hasRobotNoteListener('r1')).toBe(false);
    emitRobotNote('r1', EVENT);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('each subscription is its own: the same function twice hears twice, and a spent unsubscribe removes nothing else', () => {
    const a = vi.fn();
    const first = listen('r1', a);
    listen('r1', a);
    emitRobotNote('r1', EVENT);
    expect(a).toHaveBeenCalledTimes(2);
    first();
    first(); // a second call of a spent unsubscribe
    expect(hasRobotNoteListener('r1')).toBe(true);
    emitRobotNote('r1', EVENT);
    expect(a).toHaveBeenCalledTimes(3);
  });

  it('a throwing listener does not stop the next one, nothing reaches the caller, and the error is reported', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    const after = vi.fn();
    listen('r1', () => {
      throw boom;
    });
    listen('r1', after);
    expect(() => emitRobotNote('r1', EVENT)).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(expect.any(String), boom);
  });

  it('a listener that unsubscribes while being told does not cost the next listener its event', () => {
    const after = vi.fn();
    const off = listen('r1', () => off());
    listen('r1', after);
    emitRobotNote('r1', EVENT);
    expect(after).toHaveBeenCalledTimes(1);
  });
});
