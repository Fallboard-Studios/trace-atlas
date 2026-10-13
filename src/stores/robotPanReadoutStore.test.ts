import { describe, it, expect, vi, beforeEach } from 'vitest';

import { useRobotPanReadoutStore } from './robotPanReadoutStore';

const state = () => useRobotPanReadoutStore.getState();

beforeEach(() => {
  useRobotPanReadoutStore.setState({ pan: {} });
});

describe('robotPanReadoutStore (docs/specs/ROBOT_PAN.md section 1.4)', () => {
  it('starts empty: no robot has a readout until the engine writes one', () => {
    expect(state().pan).toEqual({});
  });

  describe('setPan', () => {
    it('stores the value under the robot id', () => {
      state().setPan('a', 0.2);
      expect(state().pan.a).toBe(0.2);
    });

    it('overwrites an earlier value for the same robot and notifies subscribers', () => {
      state().setPan('a', 0.2);
      const listener = vi.fn();
      const unsubscribe = useRobotPanReadoutStore.subscribe(listener);

      state().setPan('a', -0.3);

      expect(state().pan.a).toBe(-0.3);
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('is a referential no-op for an equal value: same state object, no subscriber call', () => {
      state().setPan('a', 0.2);
      const before = state();
      const listener = vi.fn();
      const unsubscribe = useRobotPanReadoutStore.subscribe(listener);

      state().setPan('a', 0.2);

      expect(state()).toBe(before);
      expect(state().pan).toBe(before.pan);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('treats 0 and -0 as equal, so a tick landing on centre from either side does not re-render', () => {
      state().setPan('a', 0);
      const before = state();

      state().setPan('a', -0);

      expect(state()).toBe(before);
    });

    it('keeps other robots\' entries untouched, with a new record rather than a mutated one', () => {
      state().setPan('a', 0.1);
      const recordBefore = state().pan;

      state().setPan('b', -0.4);

      expect(state().pan).toEqual({ a: 0.1, b: -0.4 });
      expect(state().pan).not.toBe(recordBefore);
      expect(recordBefore).toEqual({ a: 0.1 });
    });

    it('ignores a non-finite value (the readout is a position, never NaN or Infinity)', () => {
      state().setPan('a', 0.2);
      const before = state();

      state().setPan('a', NaN);
      state().setPan('a', Infinity);
      state().setPan('b', -Infinity);

      expect(state()).toBe(before);
      expect(state().pan).toEqual({ a: 0.2 });
    });
  });

  describe('clearPan', () => {
    it('removes the robot\'s key and nothing else', () => {
      state().setPan('a', 0.2);
      state().setPan('b', -0.1);

      state().clearPan('a');

      expect(state().pan).toEqual({ b: -0.1 });
      expect('a' in state().pan).toBe(false);
    });

    it('is a referential no-op for a robot with no entry', () => {
      state().setPan('a', 0.2);
      const before = state();
      const listener = vi.fn();
      const unsubscribe = useRobotPanReadoutStore.subscribe(listener);

      state().clearPan('zzz');

      expect(state()).toBe(before);
      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('lets the same robot be written again afterwards', () => {
      state().setPan('a', 0.2);
      state().clearPan('a');

      state().setPan('a', 0.2);

      expect(state().pan.a).toBe(0.2);
    });
  });

  it('holds plain JSON: the record survives a stringify/parse round trip (CLAUDE.md state rule)', () => {
    state().setPan('a', 0.25);
    state().setPan('b', -0.5);

    expect(JSON.parse(JSON.stringify(state().pan))).toEqual(state().pan);
  });
});
