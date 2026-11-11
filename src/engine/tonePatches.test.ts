// ========================================
// IMPORTS
// ========================================
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { devWarn } from '../utils/helpers';

import { patchOscillatorEndedDisconnect } from './tonePatches';

// ========================================
// MOCKS
// ========================================
vi.mock('../utils/helpers', () => ({ devWarn: vi.fn() }));

// ========================================
// STUBS
// ========================================
// A stand-in for Tone 15.1.22's Oscillator: `_start(time)` builds a fresh one-shot node, stores it on
// `this._oscillator` and installs the node's `onended` (Tone's is `() => this.onstop(this)`). These are the two
// private names the patch relies on, so a Tone upgrade that renames them has to change this stub too.
// No Tone import: the patch is a pure function on a prototype.

type StubParam = { readonly name: string };
type StubNode = {
  frequency: StubParam;
  detune: StubParam;
  onended: ((...args: unknown[]) => void) | undefined;
};
type StubSignal = { connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> };
type StubOscillator = {
  _oscillator: StubNode | null | undefined;
  frequency: StubSignal;
  detune: StubSignal;
  _start(time: unknown): unknown;
};

function makeNode(onended?: (...args: unknown[]) => void): StubNode {
  return { frequency: { name: 'node.frequency' }, detune: { name: 'node.detune' }, onended };
}

/** A prototype whose `_start` hands out `nodes` in turn and records each call's `this` and `time`. */
function makePrototype(nodes: Array<StubNode | null | undefined>) {
  const starts: Array<{ self: unknown; time: unknown }> = [];
  let index = 0;
  const prototype = {
    _start(this: StubOscillator, time: unknown) {
      starts.push({ self: this, time });
      this._oscillator = nodes[index++];
      return 'original-return';
    },
  };
  return { prototype, starts };
}

function makeOscillator(prototype: object, calls: string[] = []): StubOscillator {
  const oscillator = Object.create(prototype) as StubOscillator;
  oscillator._oscillator = null;
  oscillator.frequency = {
    connect: vi.fn(() => calls.push('frequency.connect')),
    disconnect: vi.fn(() => calls.push('frequency.disconnect')),
  };
  oscillator.detune = {
    connect: vi.fn(() => calls.push('detune.connect')),
    disconnect: vi.fn(() => calls.push('detune.disconnect')),
  };
  return oscillator;
}

/** Give a stub Signal the wiring Tone 15.1.22 has through standardized-audio-context, measured in headless Chrome
 *  (backlog 80, 2026-11-11): disconnecting it from one AudioParam drops its connections to every param. Returns the
 *  live set of params it feeds. */
function wireLikeTheWrapper(signal: StubSignal): Set<unknown> {
  const feeds = new Set<unknown>();
  signal.connect.mockImplementation((param: unknown) => feeds.add(param));
  signal.disconnect.mockImplementation(() => feeds.clear());
  return feeds;
}

// ========================================
// TESTS
// ========================================

describe('patchOscillatorEndedDisconnect', () => {
  beforeEach(() => {
    vi.mocked(devWarn).mockClear();
  });

  it('returns true on the first call and runs the original _start with the same this and time', () => {
    const { prototype, starts } = makePrototype([makeNode()]);

    expect(patchOscillatorEndedDisconnect(prototype)).toBe(true);
    const oscillator = makeOscillator(prototype);
    const result = oscillator._start(1.25);

    expect(starts).toEqual([{ self: oscillator, time: 1.25 }]);
    expect(result).toBe('original-return');
    expect(devWarn).not.toHaveBeenCalled();
  });

  it('on onended, runs the original onended, then disconnects frequency then detune from the node params', () => {
    const calls: string[] = [];
    const originalOnended = vi.fn((...args: unknown[]) =>
      calls.push(`onended(${String(args[0])})`)
    );
    const node = makeNode(originalOnended);
    const { prototype } = makePrototype([node]);
    patchOscillatorEndedDisconnect(prototype);
    const oscillator = makeOscillator(prototype, calls);

    oscillator._start(0);
    expect(calls).toEqual([]); // nothing disconnects at start: the note is still to sound
    node.onended?.('the-node');

    expect(calls).toEqual(['onended(the-node)', 'frequency.disconnect', 'detune.disconnect']);
    expect(oscillator.frequency.disconnect).toHaveBeenCalledTimes(1);
    expect(oscillator.frequency.disconnect).toHaveBeenCalledWith(node.frequency);
    expect(oscillator.detune.disconnect).toHaveBeenCalledTimes(1);
    expect(oscillator.detune.disconnect).toHaveBeenCalledWith(node.detune);
    expect(originalOnended).toHaveBeenCalledWith('the-node');
  });

  it('wraps each start separately, so every note disconnects its own node', () => {
    const first = makeNode();
    const second = makeNode();
    const { prototype } = makePrototype([first, second]);
    patchOscillatorEndedDisconnect(prototype);
    const oscillator = makeOscillator(prototype);

    oscillator._start(0);
    oscillator._start(1);
    second.onended?.();
    first.onended?.();

    expect(oscillator.frequency.disconnect.mock.calls).toEqual([
      [second.frequency],
      [first.frequency],
    ]);
    expect(oscillator.detune.disconnect.mock.calls).toEqual([[second.detune], [first.detune]]);
  });

  describe('a note started from the stopped state before the previous node ends (backlog 80)', () => {
    // Tone wires a new node ~150 ms ahead of its start, so a short rest or a cut note gives the Oscillator two nodes
    // at once: the old one still fading out, the new one waiting to sound. Like Tone's own `_start`, this stub's
    // connects the Oscillator's Signals into each new node's params.
    function setUp() {
      const first = makeNode();
      const second = makeNode();
      const nodes = [first, second];
      let index = 0;
      const prototype = {
        _start(this: StubOscillator) {
          const node = nodes[index++];
          this._oscillator = node;
          this.frequency.connect(node.frequency);
          this.detune.connect(node.detune);
        },
      };
      patchOscillatorEndedDisconnect(prototype);
      const oscillator = makeOscillator(prototype);
      const frequencyFeeds = wireLikeTheWrapper(oscillator.frequency);
      const detuneFeeds = wireLikeTheWrapper(oscillator.detune);
      oscillator._start(0);
      oscillator._start(1);
      return { oscillator, first, second, frequencyFeeds, detuneFeeds };
    }

    it('keeps the new node fed when the old one ends, so its oscillator never sits at 0 Hz', () => {
      const { first, second, frequencyFeeds, detuneFeeds } = setUp();

      first.onended?.();

      expect([...frequencyFeeds]).toEqual([second.frequency]);
      expect([...detuneFeeds]).toEqual([second.detune]);
    });

    it.each([
      ['the old node first', ['first', 'second']],
      ['the new node first', ['second', 'first']],
    ] as const)('leaves nothing connected once both have ended, %s', (_label, order) => {
      const nodes = setUp();

      for (const which of order) nodes[which].onended?.();

      expect(nodes.frequencyFeeds.size).toBe(0);
      expect(nodes.detuneFeeds.size).toBe(0);
    });

    it("never feeds one Oscillator into another's node, on the same prototype", () => {
      const ownOld = makeNode();
      const otherLive = makeNode();
      const ownNew = makeNode();
      const { prototype } = makePrototype([ownOld, otherLive, ownNew]);
      patchOscillatorEndedDisconnect(prototype);
      const own = makeOscillator(prototype);
      const other = makeOscillator(prototype);
      own._start(0);
      other._start(0);
      own._start(1);

      ownOld.onended?.();

      expect(own.frequency.connect.mock.calls).toEqual([[ownNew.frequency]]);
      expect(own.detune.connect.mock.calls).toEqual([[ownNew.detune]]);
    });

    it('swallows and devWarns a reconnect that throws, and still reconnects detune', () => {
      const { oscillator, first, second, detuneFeeds } = setUp();
      oscillator.frequency.connect.mockImplementation(() => {
        throw new Error('InvalidStateError: the node is disposed');
      });

      expect(() => first.onended?.()).not.toThrow();
      expect([...detuneFeeds]).toEqual([second.detune]);
      expect(devWarn).toHaveBeenCalledTimes(1);
    });
  });

  it('still disconnects when the original start installed no onended', () => {
    const node = makeNode(undefined);
    const { prototype } = makePrototype([node]);
    patchOscillatorEndedDisconnect(prototype);
    const oscillator = makeOscillator(prototype);

    oscillator._start(0);

    expect(() => node.onended?.()).not.toThrow();
    expect(oscillator.frequency.disconnect).toHaveBeenCalledWith(node.frequency);
    expect(oscillator.detune.disconnect).toHaveBeenCalledWith(node.detune);
  });

  it.each(['frequency', 'detune'] as const)(
    'swallows a %s disconnect that throws and still runs the original onended',
    (throwing) => {
      const originalOnended = vi.fn();
      const node = makeNode(originalOnended);
      const { prototype } = makePrototype([node]);
      patchOscillatorEndedDisconnect(prototype);
      const oscillator = makeOscillator(prototype);
      oscillator[throwing].disconnect.mockImplementation(() => {
        throw new Error('InvalidAccessError: not connected');
      });

      oscillator._start(0);

      expect(() => node.onended?.('the-node')).not.toThrow();
      expect(originalOnended).toHaveBeenCalledTimes(1);
      expect(originalOnended).toHaveBeenCalledWith('the-node');
    }
  );

  it('lets the detune disconnect run when the frequency disconnect throws', () => {
    const node = makeNode(vi.fn());
    const { prototype } = makePrototype([node]);
    patchOscillatorEndedDisconnect(prototype);
    const oscillator = makeOscillator(prototype);
    oscillator.frequency.disconnect.mockImplementation(() => {
      throw new Error('Not connected to destination node');
    });

    oscillator._start(0);
    node.onended?.();

    expect(oscillator.detune.disconnect).toHaveBeenCalledTimes(1);
    expect(oscillator.detune.disconnect).toHaveBeenCalledWith(node.detune);
  });

  it('on a Tone whose own onended already disconnects both params (15.3.11+), nothing throws and Tone finishes', () => {
    // standardized-audio-context throws when a source disconnects a param it is no longer connected to.
    const disconnected = new Set<unknown>();
    const disconnectOnce = (param: unknown) => {
      if (disconnected.has(param)) throw new Error('Not connected to destination node');
      disconnected.add(param);
    };
    const toneSteps: string[] = [];
    // Tone's fixed `_start` installs this as the node's `onended`: `_cleanUpConnections`, then `onstop`.
    const fixedToneOnended = () => {
      oscillator.frequency.disconnect(node.frequency);
      oscillator.detune.disconnect(node.detune);
      toneSteps.push('onstop');
    };
    const node = makeNode(fixedToneOnended);
    const { prototype } = makePrototype([node]);
    patchOscillatorEndedDisconnect(prototype);
    const oscillator = makeOscillator(prototype);
    oscillator.frequency.disconnect.mockImplementation(disconnectOnce);
    oscillator.detune.disconnect.mockImplementation(disconnectOnce);

    oscillator._start(0);

    expect(() => node.onended?.('the-node')).not.toThrow();
    expect(toneSteps).toEqual(['onstop']);
  });

  it("still disconnects when the original onended throws, and lets Tone's error through", () => {
    const toneError = new Error('thrown by an onstop handler');
    const node = makeNode(() => {
      throw toneError;
    });
    const { prototype } = makePrototype([node]);
    patchOscillatorEndedDisconnect(prototype);
    const oscillator = makeOscillator(prototype);

    oscillator._start(0);

    expect(() => node.onended?.()).toThrow(toneError);
    expect(oscillator.frequency.disconnect).toHaveBeenCalledWith(node.frequency);
    expect(oscillator.detune.disconnect).toHaveBeenCalledWith(node.detune);
  });

  it('is idempotent: a second call returns false and leaves the first wrap in place', () => {
    const originalOnended = vi.fn();
    const node = makeNode(originalOnended);
    const { prototype, starts } = makePrototype([node]);

    expect(patchOscillatorEndedDisconnect(prototype)).toBe(true);
    const wrapped = prototype._start;
    expect(patchOscillatorEndedDisconnect(prototype)).toBe(false);
    expect(prototype._start).toBe(wrapped);

    const oscillator = makeOscillator(prototype);
    oscillator._start(0);
    node.onended?.();

    expect(starts).toHaveLength(1);
    expect(oscillator.frequency.disconnect).toHaveBeenCalledTimes(1);
    expect(oscillator.detune.disconnect).toHaveBeenCalledTimes(1);
    expect(originalOnended).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a number', 42],
    ['a string', '_start'],
  ])('returns false and devWarns once for a prototype that is %s', (_label, prototype) => {
    expect(patchOscillatorEndedDisconnect(prototype)).toBe(false);
    expect(devWarn).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['has no _start', {}],
    ['has a non-function _start', { _start: 42 }],
  ])(
    'returns false, devWarns once and leaves untouched a prototype that %s',
    (_label, prototype) => {
      const before = Reflect.ownKeys(prototype).map((key) => [
        key,
        (prototype as Record<PropertyKey, unknown>)[key],
      ]);

      expect(patchOscillatorEndedDisconnect(prototype)).toBe(false);

      expect(devWarn).toHaveBeenCalledTimes(1);
      const after = Reflect.ownKeys(prototype).map((key) => [
        key,
        (prototype as Record<PropertyKey, unknown>)[key],
      ]);
      expect(after).toEqual(before);
    }
  );

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])(
    'does not throw and installs nothing when the original start leaves _oscillator %s',
    (_label, left) => {
      const { prototype, starts } = makePrototype([left]);
      patchOscillatorEndedDisconnect(prototype);
      const oscillator = makeOscillator(prototype);

      expect(() => oscillator._start(0)).not.toThrow();

      expect(starts).toHaveLength(1);
      expect(oscillator._oscillator).toBe(left);
      expect(oscillator.frequency.disconnect).not.toHaveBeenCalled();
      expect(oscillator.detune.disconnect).not.toHaveBeenCalled();
    }
  );
});
