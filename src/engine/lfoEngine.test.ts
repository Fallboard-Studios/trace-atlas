import { describe, it, expect, beforeEach, vi } from 'vitest';
import { lfoAllowed, loadToLimits } from '../utils/audioBudget';

// ========================================
// MOCKS
// ========================================
// Mutable so individual tests can flip transport/context state without
// re-mocking per test.
let mockTransportState: 'started' | 'stopped' = 'stopped';
// start() gates on the AudioContext itself being 'running', not Transport
// state — the Transport can still be mid-startup (loading instruments,
// waiting on reverb) well after Tone.start() has already made the context
// running, and gating on Transport left a real window where an LFO could
// connect to a live target but never actually start oscillating, stuck
// forever outputting Tone.LFO's raw, undepth-scaled "stopped" value.
let mockContextState: 'running' | 'suspended' = 'suspended';

// Tags a fakeParam() object (and the mocked LFO's own `amplitude`, a real
// Tone.Param per docs/specs/LFO_DRIFT.md §1.4) as "Param-like" for the
// shared connect-simulation below, independent of whatever plain properties
// our own production code happens to assign onto the object (a Symbol key
// can't collide with the string-keyed `.override` our fix writes onto every
// resolved signal/param it connects to).
const fakeParamMarker = Symbol('fakeParamMarker');

/**
 * Shared destination-reset simulation for every mocked Tone node below
 * (LFO, Gain) that can be a `.connect()` SOURCE. Tone.js's real override/
 * Param-reset behavior (signal/Signal.ts's connectSignal()) is keyed off the
 * DESTINATION's own type, not the source node's — so a Tone.Gain feeding a
 * drift signal into a primary's frequency/amplitude (docs/specs/LFO_DRIFT.md
 * Task 4) must simulate the exact same reset Tone.LFO's own connect() into a
 * target Signal/Param already simulates. Faithfully mirrors: a Tone.Param
 * destination ALWAYS resets to 0 on connect, regardless of any `override`
 * property (Param has no such concept — connectSignal's real check is
 * `instanceof Param`); a Tone.Signal destination resets only while its own
 * `override` flag (default true) is still true.
 */
function simulateSignalConnect(dest: unknown): void {
  if (dest && typeof dest === 'object' && 'value' in dest) {
    const d = dest as { value: number; override?: boolean };
    const isParamLike = fakeParamMarker in (d as object);
    if (isParamLike || d.override !== false) {
      d.value = 0;
    }
  }
}

vi.mock('tone', () => ({
  LFO: vi.fn((arg?: number | { frequency?: number; type?: string; phase?: number }) => {
    const isOptionsObject = typeof arg === 'object' && arg !== null;
    const freqValue = isOptionsObject ? (arg.frequency ?? 1) : (arg ?? 1);
    const instance = {
      // A real Tone.LFO.frequency is a Tone.Signal — override defaults true.
      frequency: { value: freqValue, override: true },
      // A real Tone.LFO.amplitude is a Tone.Param — no override concept, so
      // it's tagged fakeParamMarker (see simulateSignalConnect above) rather
      // than given an `override` field at all.
      amplitude: { value: 1, [fakeParamMarker]: true },
      type: isOptionsObject ? (arg.type ?? 'sine') : 'sine',
      min: 0, // Tone.LFO's real default (LFO.getDefaults())
      max: 1, // Tone.LFO's real default — modulating a target with these left unset is functionally inaudible
      start: vi.fn(),
      stop: vi.fn(),
      connect: vi.fn((dest: unknown) => {
        simulateSignalConnect(dest);
        return instance;
      }),
      disconnect: vi.fn(),
      dispose: vi.fn(),
    };
    return instance;
  }),
  // The drift pool's per-primary rate/depth attenuators (docs/specs/LFO_DRIFT.md
  // Task 4) — shape matches this codebase's existing Tone.Gain mocks
  // elsewhere (e.g. AudioEngine.test.ts), plus the same connect-simulation
  // every other mocked node here shares.
  Gain: vi.fn((value?: number) => {
    const instance = {
      gain: { value: value ?? 1 },
      connect: vi.fn((dest: unknown) => {
        simulateSignalConnect(dest);
        return instance;
      }),
      disconnect: vi.fn(),
      dispose: vi.fn(),
    };
    return instance;
  }),
  getTransport: vi.fn(() => ({ get state() { return mockTransportState; } })),
  getContext: vi.fn(() => ({ get state() { return mockContextState; } })),
  now: vi.fn(() => mockToneNow),
}));

vi.mock('./AudioEngine', () => ({
  AudioEngine: {
    getRobotModulationTarget: vi.fn(),
    getGlobalModulationTarget: vi.fn(),
    updateVoiceLayerParams: vi.fn(),
  },
}));

// Shares captured schedule callbacks between the hoisted beatClock mock
// factory and test bodies, so a test can manually fire a "tick" — this is
// the "mocked LFO ticks" mechanism the phase-fallback tests need, since the
// real scheduleRepeat only actually fires once a real transport is running.
const { scheduleCallbacks, mockScheduleRepeat, mockCancelSchedule } = vi.hoisted(() => {
  const callbacks = new Map<string, () => void>();
  let counter = 0;
  return {
    scheduleCallbacks: callbacks,
    mockScheduleRepeat: (_interval: string, callback: () => void): string => {
      const id = `mock-schedule-${counter++}`;
      callbacks.set(id, callback);
      return id;
    },
    mockCancelSchedule: (id: string): void => {
      callbacks.delete(id);
    },
  };
});

vi.mock('./beatClock', () => ({
  scheduleRepeat: vi.fn(mockScheduleRepeat),
  cancelSchedule: vi.fn(mockCancelSchedule),
}));

let mockToneNow = 0;

// ========================================
// HELPERS
// ========================================
// NOTE: the 'tone' mock is hoisted once for this whole file — vi.resetModules()
// in beforeEach gives lfoEngine.ts a fresh module instance (fresh internal
// Maps), but Tone.LFO's own mock.calls/mock.results keep accumulating across
// every test in the file (same constraint AudioEngine.test.ts documents and
// works around with `.at(-1)`/`.at(-2)`). So: assert call-count *deltas*
// around an action, and grab the most-recently-constructed instance via
// `.at(-1)`, never an absolute count or `[0]`.

/** Shape of the mocked Tone.LFO instance above — enough to assert against, not the real Tone.LFO type. */
interface MockLfoInstance {
  frequency: { value: number; override?: boolean };
  amplitude: { value: number };
  type: string;
  min: number;
  max: number;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

/** Shape of the mocked Tone.Gain instance above. */
interface MockGainInstance {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

/**
 * Finds which pool-shaped Tone.LFO instance (constructed with an options
 * object — see the LFO mock above; a primary always passes a plain number)
 * had `.connect()` called with the given destination. Used to prove
 * bucket-assignment determinism (docs/tasks/LFO_DRIFT.md Task 4) without
 * lfoEngine needing to export its private pool-index helper — keeping this
 * file's single grouped `lfoEngine` public-API convention intact.
 */
async function poolOscillatorConnectedTo(dest: unknown): Promise<MockLfoInstance | undefined> {
  const Tone = await import('tone');
  const ctor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
  for (let i = 0; i < ctor.mock.calls.length; i++) {
    if (typeof ctor.mock.calls[i][0] !== 'object') continue;
    const instance = ctor.mock.results[i].value as MockLfoInstance;
    if ((instance.connect as ReturnType<typeof vi.fn>).mock.calls.some(([d]: unknown[]) => d === dest)) return instance;
  }
  return undefined;
}

/** Count of pool-shaped (options-object-constructed) Tone.LFO calls before/after an action. */
async function poolConstructionCountDelta(action: () => void): Promise<number> {
  const Tone = await import('tone');
  const ctor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
  const isPoolCall = (call: unknown[]) => typeof call[0] === 'object' && call[0] !== null;
  const before = ctor.mock.calls.filter(isPoolCall).length;
  action();
  const after = ctor.mock.calls.filter(isPoolCall).length;
  return after - before;
}

async function callCountDelta(action: () => void): Promise<number> {
  const Tone = await import('tone');
  const before = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  action();
  const after = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
  return after - before;
}

async function latestLfoInstance(): Promise<MockLfoInstance> {
  const Tone = await import('tone');
  const ctor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
  // Skips pool-shaped (options-object-constructed) instances — connectLfoTarget's
  // own attachDrift() (docs/tasks/LFO_DRIFT.md Task 4) can lazily construct the
  // 8-oscillator drift pool as a side effect of the SAME call that constructs a
  // primary, landing after it in mock.results. Every existing caller of this
  // helper means "the primary LFO from the action just performed" — never a
  // drift-pool oscillator — so skip backward past any pool calls to find it.
  for (let i = ctor.mock.calls.length - 1; i >= 0; i--) {
    if (typeof ctor.mock.calls[i][0] === 'object') continue;
    return ctor.mock.results[i].value;
  }
  throw new Error('latestLfoInstance: no primary LFO instance has been constructed yet');
}

/** A minimal fake Signal-like object, distinct per call so tests can assert
 * connect() received the right one. `override` defaults to `true`, matching
 * Tone.Signal's own real default (verified against Tone's source). */
function fakeSignal(value = 0): { value: number; override: boolean } {
  return { value, override: true };
}

/** A minimal fake Param-like object — deliberately no `override` field at
 * all, matching Tone.Param's real shape (unlike Tone.Signal, Param has no
 * such property), tagged with fakeParamMarker so the mocked LFO.connect()
 * above can tell the two destination shapes apart and simulate each one's
 * real reset behavior, even after our own code writes a plain `.override`
 * property onto it. */
function fakeParam(value = 0): { value: number; [fakeParamMarker]: true } {
  return { value, [fakeParamMarker]: true };
}

// ========================================
// TESTS
// ========================================

describe('lfoEngine', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockTransportState = 'stopped';
    mockContextState = 'suspended';
    mockToneNow = 0;
    scheduleCallbacks.clear();
  });

  describe('lazy instantiation', () => {
    it('does not construct a Tone.LFO on module load', async () => {
      const Tone = await import('tone');
      const before = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
      await import('./lfoEngine'); // the action under test: importing the module itself
      const after = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
      expect(after).toBe(before);
    });

    it('does not construct a Tone.LFO when only reading settings', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await callCountDelta(() => {
        lfoEngine.getLfoSettings('volume');
        lfoEngine.getLfoSettings('eq3.low', undefined);
      });
      expect(delta).toBe(0);
    });

    it('constructs exactly one Tone.LFO on the first setter call for a given target', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await callCountDelta(() => {
        lfoEngine.setLfoRate('volume', 2);
      });
      expect(delta).toBe(1);
    });

    it('reuses the same Tone.LFO instance across multiple setter calls for the same target', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await callCountDelta(() => {
        lfoEngine.setLfoRate('volume', 2);
        lfoEngine.setLfoDepth('volume', 50);
        lfoEngine.setLfoShape('volume', 'square');
      });
      expect(delta).toBe(1); // only the first setter call constructs; the other two reuse it
    });
  });

  describe('getLfoSettings', () => {
    it('returns DEFAULT_LFO_SETTINGS for a target with no explicit settings yet', async () => {
      const { DEFAULT_LFO_SETTINGS } = await import('../data/lfoConfig');
      const { lfoEngine } = await import('./lfoEngine');
      expect(lfoEngine.getLfoSettings('layer0.gain')).toEqual(DEFAULT_LFO_SETTINGS['layer0.gain']);
    });

    it('reflects a previously-set rate/depth/shape', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('hpf.Q', 3);
      lfoEngine.setLfoDepth('hpf.Q', 75);
      lfoEngine.setLfoShape('hpf.Q', 'square');
      expect(lfoEngine.getLfoSettings('hpf.Q')).toEqual({ shape: 'square', rate: 3, depth: 75 });
    });
  });

  describe('setLfoRate', () => {
    it('updates both the persisted settings and the live node\'s frequency', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 4);
      expect(lfoEngine.getLfoSettings('volume').rate).toBe(4);
      expect((await latestLfoInstance()).frequency.value).toBe(4);
    });

    it('sets the raw Hz value directly — no Time-string/BeatClock conversion involved', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 2.5);
      expect((await latestLfoInstance()).frequency.value).toBe(2.5);
    });

    it('clamps below LFO_RATE_MIN', async () => {
      const { LFO_RATE_MIN } = await import('../types/lfo');
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', -5); // LFO_RATE_MIN is 0 — a negative value is what's actually below the floor now
      expect(lfoEngine.getLfoSettings('volume').rate).toBe(LFO_RATE_MIN);
    });

    it('allows exactly 0 — the new "off" value, not something to clamp away from', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 0);
      expect(lfoEngine.getLfoSettings('volume').rate).toBe(0);
    });

    it('clamps above LFO_RATE_MAX', async () => {
      const { LFO_RATE_MAX } = await import('../types/lfo');
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 999);
      expect(lfoEngine.getLfoSettings('volume').rate).toBe(LFO_RATE_MAX);
    });
  });

  describe('setLfoDepth', () => {
    it('updates both the persisted settings and the live node\'s amplitude (depth / 100)', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoDepth('volume', 40);
      expect(lfoEngine.getLfoSettings('volume').depth).toBe(40);
      expect((await latestLfoInstance()).amplitude.value).toBeCloseTo(0.4);
    });

    it('clamps below LFO_DEPTH_MIN', async () => {
      const { LFO_DEPTH_MIN } = await import('../types/lfo');
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoDepth('volume', -10);
      expect(lfoEngine.getLfoSettings('volume').depth).toBe(LFO_DEPTH_MIN);
    });

    it('clamps above LFO_DEPTH_MAX', async () => {
      const { LFO_DEPTH_MAX } = await import('../types/lfo');
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoDepth('volume', 500);
      expect(lfoEngine.getLfoSettings('volume').depth).toBe(LFO_DEPTH_MAX);
    });
  });

  describe('setLfoShape', () => {
    it('updates both the persisted settings and the live node\'s type', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoShape('volume', 'sawtooth');
      expect(lfoEngine.getLfoSettings('volume').shape).toBe('sawtooth');
      expect((await latestLfoInstance()).type).toBe('sawtooth');
    });
  });

  describe('per-instance isolation', () => {
    it('keeps two different robots\' settings for the same target independent', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('layer0.gain', 5, 'robot-a');
      lfoEngine.setLfoRate('layer0.gain', 1, 'robot-b');
      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-a').rate).toBe(5);
      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-b').rate).toBe(1);
    });

    it('constructs a separate Tone.LFO per robot for the same target', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await callCountDelta(() => {
        lfoEngine.setLfoRate('layer0.gain', 5, 'robot-a');
        lfoEngine.setLfoRate('layer0.gain', 1, 'robot-b');
      });
      expect(delta).toBe(2);
    });

    it('does not let a robot-scoped target collide with the same target id used globally (no robotId)', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('layer0.gain', 5, 'robot-a');
      // 'layer0.gain' with no robotId is a distinct instance key from 'robot-a:layer0.gain'
      expect(lfoEngine.getLfoSettings('layer0.gain').rate).not.toBe(5);
    });
  });

  describe('start (audio-context-gated)', () => {
    it('does not construct a node and does not throw when nothing has been set/connected yet', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      let threw = false;
      const delta = await callCountDelta(() => {
        try {
          lfoEngine.start('volume');
        } catch {
          threw = true;
        }
      });
      expect(threw).toBe(false);
      expect(delta).toBe(0);
    });

    it('starts the node when the AudioContext is running', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 2); // creates the node
      const instance = await latestLfoInstance();
      mockContextState = 'running';
      lfoEngine.start('volume');
      expect(instance.start).toHaveBeenCalledTimes(1);
    });

    it('does not start the node when the AudioContext is suspended', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 2); // creates the node
      const instance = await latestLfoInstance();
      mockContextState = 'suspended';
      lfoEngine.start('volume');
      expect(instance.start).not.toHaveBeenCalled();
    });

    it('starts the node based on the AudioContext, independent of Transport state — the real bug: Transport can still be starting up well after the context itself is already running', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 2); // creates the node
      const instance = await latestLfoInstance();
      mockContextState = 'running';
      mockTransportState = 'stopped'; // Transport not yet started
      lfoEngine.start('volume');
      expect(instance.start).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('does not throw when nothing has been set/connected yet', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      expect(() => lfoEngine.stop('volume')).not.toThrow();
    });

    it('stops an existing node regardless of transport state', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('volume', 2); // creates the node
      const instance = await latestLfoInstance();
      mockTransportState = 'stopped';
      lfoEngine.stop('volume');
      expect(instance.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('connectLfoTarget', () => {
    it('connects to the real Signal for a robot-scoped Gain target', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal();
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);

      const { lfoEngine } = await import('./lfoEngine');
      const result = lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

      expect(result).toBe(true);
      expect(AudioEngine.getRobotModulationTarget).toHaveBeenLastCalledWith('robot-a', 'layer0.gain');
      const instance = await latestLfoInstance();
      expect(instance.connect).toHaveBeenCalledWith(signal);
    });

    it('connects to the real Signal for a robot-scoped Detune target', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal();
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);

      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer1.detune', 'robot-a');

      const instance = await latestLfoInstance();
      expect(instance.connect).toHaveBeenCalledWith(signal);
    });

    it('connects to the real Signal for a global-chain target — no robotId involved', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal();
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);

      const { lfoEngine } = await import('./lfoEngine');
      const result = lfoEngine.connectLfoTarget('eq3.low');

      expect(result).toBe(true);
      expect(AudioEngine.getGlobalModulationTarget).toHaveBeenLastCalledWith('eq3.low');
      const instance = await latestLfoInstance();
      expect(instance.connect).toHaveBeenCalledWith(signal);
    });

    it('connects to the real Signal for pulseWidth on a \'pulse\'-type layer', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal();
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);

      const { lfoEngine } = await import('./lfoEngine');
      const result = lfoEngine.connectLfoTarget('layer0.pulseWidth', 'robot-a');

      expect(result).toBe(true);
      const instance = await latestLfoInstance();
      expect(instance.connect).toHaveBeenCalledWith(signal);
    });

    it('is idempotent when called twice in a row on the same target/signal — never issues a second .connect(), so the same LFO can never double-modulate a target', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal();
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      const { lfoEngine } = await import('./lfoEngine');
      const first = lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const second = lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

      expect(first).toBe(true);
      expect(second).toBe(true);
      const instance = await latestLfoInstance();
      expect(instance.connect).toHaveBeenCalledTimes(1);
    });

    it('reconnects (disconnect + connect) rather than silently ignoring a change when the resolved signal differs from what was last connected — e.g. a rebuilt composite voice', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      const firstSignal = fakeSignal();
      const secondSignal = fakeSignal();
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(firstSignal)
        .mockReturnValueOnce(secondSignal);

      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const instance = await latestLfoInstance();
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

      expect(instance.disconnect).toHaveBeenCalledTimes(1);
      expect(instance.connect).toHaveBeenNthCalledWith(1, firstSignal);
      expect(instance.connect).toHaveBeenNthCalledWith(2, secondSignal);
    });

    describe('output range scaling — an ADDITIVE delta bounded by the CURRENT base value\'s position, not a fixed constant', () => {
      // Tone.LFO.connect() sums onto the destination Param's existing value
      // (native Web Audio AudioParam behavior — connecting an input ADDS to
      // whatever the param's own intrinsic value is, it never overrides it).
      // A first fix used a FIXED zero-centered swing (half the field's own
      // total span) — better than the raw range, but still a constant,
      // independent of where the base value actually sits. That reintroduced
      // the same class of bug from the other direction: for a base value
      // anywhere off-center (e.g. LPF frequency left low, as a workaround for
      // the original crash), a fixed swing still large enough to swing the
      // OTHER way pushed the combined value below the field's own minimum for
      // roughly half of every cycle — reported as "mutes all audio half the
      // time". The real fix: the swing is bounded by the CURRENT base value's
      // own distance to whichever edge of the range is nearer
      // (min(value-rangeMin, rangeMax-value)) — base +- swing can now never
      // leave [rangeMin, rangeMax], for any starting position. A value sitting
      // exactly at the range's midpoint still gets the same "half the total
      // span" swing as before (both distances are then equal) — no regression
      // for already-centered fields (EQ dB, robot detune, whose typical
      // resting value is 0, itself the midpoint of a symmetric range).
      it('derives a swing bounded by the base value\'s own distance to the nearer edge, for a robot Gain target (0-2, base 0.5 -> +-0.5, not +-1)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0.5));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const instance = await latestLfoInstance();
        expect(instance.min).toBe(-0.5);
        expect(instance.max).toBe(0.5);
      });

      it('gets the full half-span swing when the base value sits at the range\'s own midpoint, for a robot Detune target (-50..50 cents, base 0)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.detune', 'robot-a');
        const instance = await latestLfoInstance();
        expect(instance.min).toBe(-50);
        expect(instance.max).toBe(50);
      });

      it('shrinks the swing when the base value sits near the top of its range, for the robot Volume target (0-2, base 1.8 -> +-0.2, not +-1)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(1.8));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('volume', 'robot-a');
        const instance = await latestLfoInstance();
        // toBeCloseTo, not toBe — 2 - 1.8 is a well-known floating-point
        // representation artifact, not a logic bug.
        expect(instance.min).toBeCloseTo(-0.2, 10);
        expect(instance.max).toBeCloseTo(0.2, 10);
      });

      it('regression: the robot Volume target gets a real, non-zero swing at its live node\'s actual resting value (1) — previously pinned to +-0 forever', async () => {
        // The composite voice's `output` Gain node (what 'volume' actually
        // resolves to — see AudioEngine.getRobotModulationTarget) is
        // constructed at exactly 1 and never changes (compositeVoice.ts's
        // `set({ outputGain })` path is never invoked in production). A
        // volume field range of 0-1 — matching the *slider's* domain, not the
        // node's — put that resting value exactly on the range's own max
        // edge: distanceToMax = 1 - 1 = 0, so centeredSwingFromRange's
        // min(distanceToMin, distanceToMax) was unconditionally 0. The Volume
        // LFO connected, took rate/depth/shape, but could never audibly
        // modulate anything, for any setting. Fixed by widening the field's
        // declared range to 0-2 (matching 'gain', the other field backed by
        // an identical Tone.Gain(1) node), putting 1 at the midpoint instead
        // of the edge.
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(1));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('volume', 'robot-a');
        const instance = await latestLfoInstance();
        expect(instance.min).toBe(-1);
        expect(instance.max).toBe(1);
      });

      it('gets the full half-span swing when the base value sits at the range\'s own midpoint, for a global EQ3 band (-12..12 dB, base 0)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('eq3.low');
        const instance = await latestLfoInstance();
        expect(instance.min).toBe(-12);
        expect(instance.max).toBe(12);
      });

      it('shrinks the swing for LPF frequency (20-20000) when the base value sits low (base 3000 -> +-2980, not a constant +-9990), translating the lpf.* short-form target id to filterLPF.* seed-range key', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(3000));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('lpf.frequency');
        const instance = await latestLfoInstance();
        expect(instance.min).toBe(-2980);
        expect(instance.max).toBe(2980);
      });

      it('shrinks the swing for HPF Q (0.1-20) when the base value sits low (base 5 -> +-4.9), translating hpf.* to filterHPF.*', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(5));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('hpf.Q');
        const instance = await latestLfoInstance();
        expect(instance.min).toBe(-4.9);
        expect(instance.max).toBe(4.9);
      });

      it('regression: base + swing never leaves the field\'s own [min, max] range, for any base position — the direct fix for "mutes audio half the time"', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const baseValue = 3000; // low in LPF frequency's 20-20000 range, exactly the kind of position that used to dip negative at the trough
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(baseValue));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('lpf.frequency');
        const instance = await latestLfoInstance();
        expect(baseValue + instance.min).toBeGreaterThanOrEqual(20);
        expect(baseValue + instance.max).toBeLessThanOrEqual(20000);
      });

      it('never assigns NaN to lfo.min/lfo.max when the resolved signal\'s current value is non-finite — a NaN Param value would silence the whole downstream chain, not just this target', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(NaN));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('lpf.frequency');
        const instance = await latestLfoInstance();
        expect(Number.isNaN(instance.min)).toBe(false);
        expect(Number.isNaN(instance.max)).toBe(false);
      });
    });

    describe('disabling Signal.override before connecting — the real "explosion" root cause', () => {
      // Verified directly against Tone.js's own source (signal/Signal.ts,
      // connectSignal()): connecting ANYTHING to a Signal whose `override`
      // flag is true (the default) makes Tone immediately
      // cancelScheduledValues + setValueAtTime(0, 0) on the destination and
      // permanently mark it "overridden" — BEFORE the connected source (the
      // LFO) has even started oscillating, and regardless of what lfo.min/
      // lfo.max are set to. For a filter's frequency Signal, that's a
      // step-change to an invalid 0 Hz cutoff the instant the LFO connects
      // — independent of every previous swing-math fix, since none of them
      // touch this. This is the actual, complete explanation for the
      // reported "explosion, then nothing, reproducible on a fresh reload,
      // regardless of how long you wait first" — a structural side effect
      // of calling .connect() at all, not a timing race. Disabling
      // `override` first restores plain additive Web Audio summing, which
      // the swing math above is designed for.
      it('sets override to false on the resolved global Signal before connecting', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const signal = fakeSignal(3000);
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('lpf.frequency');
        expect(signal.override).toBe(false);
      });

      it('sets override to false on the resolved robot Signal before connecting too', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const signal = fakeSignal(1);
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        expect(signal.override).toBe(false);
      });

      it('restores a Tone.Param destination\'s own current value immediately after connecting — Param has no override escape hatch and always resets to 0 on connect, but (unlike Signal) is never permanently locked, so a plain restore write fixes it going forward', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const param = fakeParam(1.5); // e.g. a robot layer's current gain
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(param);
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        expect(param.value).toBe(1.5);
      });

      it('restoring the Param\'s value is a harmless no-op for a Signal destination — override is already disabled by then, so the mocked connect() never zeroed it in the first place', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const signal = fakeSignal(5000);
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(signal);
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('lpf.frequency');
        expect(signal.value).toBe(5000);
      });
    });

    it('returns false (not throw) for pulseWidth on a non-\'pulse\' layer — AudioEngine already returns null for that case', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);

      const { lfoEngine } = await import('./lfoEngine');
      let result: boolean | undefined;
      expect(() => { result = lfoEngine.connectLfoTarget('layer0.pulseWidth', 'robot-a'); }).not.toThrow();
      expect(result).toBe(false);
    });

    it('returns false (not throw) for a robot-scoped target called without a robotId', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      let result: boolean | undefined;
      expect(() => { result = lfoEngine.connectLfoTarget('layer0.gain'); }).not.toThrow();
      expect(result).toBe(false);
    });

    describe('phase — manual polling fallback', () => {
      it('does not call .connect() — no live Signal exists for phase', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        const delta = await callCountDelta(() => {
          lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');
        });
        // a Tone.LFO IS still constructed (for rate/depth/shape bookkeeping,
        // matching every other target), but nothing should be connected.
        expect(delta).toBe(1);
        const instance = await latestLfoInstance();
        expect(instance.connect).not.toHaveBeenCalled();
      });

      it('returns true and registers a scheduleRepeat tick', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        const before = scheduleCallbacks.size;
        const result = lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');
        expect(result).toBe(true);
        expect(scheduleCallbacks.size).toBe(before + 1);
      });

      it('returns false (not throw) when called without a robotId — phase fallback needs to know which robot\'s voice to update', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        let result: boolean | undefined;
        expect(() => { result = lfoEngine.connectLfoTarget('layer0.phase'); }).not.toThrow();
        expect(result).toBe(false);
      });

      it('mutates phase over time — each simulated tick produces a different value applied via AudioEngine.updateVoiceLayerParams', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.setLfoRate('layer0.phase', 1, 'robot-a');
        lfoEngine.setLfoDepth('layer0.phase', 100, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');

        const callback = [...scheduleCallbacks.values()].at(-1)!;

        mockToneNow = 0;
        callback();
        const firstCall = (AudioEngine.updateVoiceLayerParams as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
        const firstPhase = (firstCall[1] as Array<{ phase?: number }>)[0]?.phase;

        mockToneNow = 0.25; // a quarter-period later at 1 Hz
        callback();
        const secondCall = (AudioEngine.updateVoiceLayerParams as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
        const secondPhase = (secondCall[1] as Array<{ phase?: number }>)[0]?.phase;

        expect(firstCall[0]).toBe('robot-a');
        expect(typeof firstPhase).toBe('number');
        expect(typeof secondPhase).toBe('number');
        expect(secondPhase).not.toBe(firstPhase);
      });

      it('only patches the target layer index, leaving other layers untouched (sparse array)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer2.phase', 'robot-a');
        const callback = [...scheduleCallbacks.values()].at(-1)!;
        callback();

        const call = (AudioEngine.updateVoiceLayerParams as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
        const layers = call[1] as Array<{ phase?: number } | undefined>;
        expect(layers[0]).toBeUndefined();
        expect(layers[1]).toBeUndefined();
        expect(layers[2]?.phase).toBeTypeOf('number');
      });
    });
  });

  describe('disconnectLfoTarget', () => {
    it('disconnects a Signal-connected target', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal());

      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const instance = await latestLfoInstance();

      lfoEngine.disconnectLfoTarget('layer0.gain', 'robot-a');
      expect(instance.disconnect).toHaveBeenCalledTimes(1);
    });

    it('cancels the phase-polling fallback schedule', async () => {
      const { cancelSchedule } = await import('./beatClock');
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');
      const sizeBeforeDisconnect = scheduleCallbacks.size;

      lfoEngine.disconnectLfoTarget('layer0.phase', 'robot-a');

      expect(cancelSchedule).toHaveBeenCalled();
      expect(scheduleCallbacks.size).toBe(sizeBeforeDisconnect - 1);
    });

    it('does not throw when nothing was ever connected', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      expect(() => lfoEngine.disconnectLfoTarget('volume')).not.toThrow();
      expect(() => lfoEngine.disconnectLfoTarget('layer0.phase', 'robot-a')).not.toThrow();
    });
  });

  // Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §1.4, plan task 17): a policy predicate decides which LFOs may be
  // connected. A tier only SUSPENDS: stored settings are never edited, "held off" means requested (rate > 0) but not
  // connected because of the dial, and reconcileLfos() re-applies the policy to everything that was requested.
  describe('Audio Load policy (setLfoPolicy / reconcileLfos / getHeldOffLfoKeys)', () => {
    const blockFilters = (target: string) => !/^(lpf|hpf)\./.test(target);

    async function setup() {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal());
      const { lfoEngine } = await import('./lfoEngine');
      // The Tone.LFO mock's results accumulate across the whole file, so remember where THIS test's instances begin.
      const Tone = await import('tone');
      const firstIndex = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.results.length;
      return { AudioEngine, lfoEngine, firstIndex };
    }

    /** Primary (numeric-arg) LFO instances constructed since `firstIndex` — never drift-pool oscillators or earlier tests' LFOs. */
    async function primariesSince(firstIndex: number): Promise<MockLfoInstance[]> {
      const Tone = await import('tone');
      const ctor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
      return ctor.mock.results
        .slice(firstIndex)
        .filter((_: unknown, i: number) => typeof ctor.mock.calls[firstIndex + i][0] !== 'object')
        .map((r) => r.value as MockLfoInstance);
    }

    /** Set the stored rate/depth/shape the way setGlobalLfo does before it asks to connect. */
    function configure(lfoEngine: Awaited<ReturnType<typeof setup>>['lfoEngine'], target: 'lpf.Q' | 'lpf.frequency' | 'eq3.low' | 'hpf.Q', rate = 2) {
      lfoEngine.setLfoRate(target, rate);
      lfoEngine.setLfoDepth(target, 40);
      lfoEngine.setLfoShape(target, 'triangle');
    }

    it('with no policy (the default) nothing is refused and nothing is held off', async () => {
      const { lfoEngine } = await setup();
      configure(lfoEngine, 'lpf.Q');

      expect(lfoEngine.connectLfoTarget('lpf.Q')).toBe(true);
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
      expect(() => lfoEngine.reconcileLfos()).not.toThrow();
    });

    it('refuses to connect a disallowed target and reads it as held off, while an allowed one connects normally', async () => {
      const { lfoEngine } = await setup();
      configure(lfoEngine, 'lpf.Q');
      configure(lfoEngine, 'eq3.low');
      lfoEngine.setLfoPolicy(blockFilters);

      expect(lfoEngine.connectLfoTarget('lpf.Q')).toBe(false);
      expect(lfoEngine.connectLfoTarget('eq3.low')).toBe(true);
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual(['lpf.Q']);
    });

    it('a refused connection never touches the audio graph: not connected, not started', async () => {
      mockContextState = 'running';
      const { lfoEngine } = await setup();
      configure(lfoEngine, 'lpf.Q');
      lfoEngine.setLfoPolicy(blockFilters);

      // The caller pattern (setGlobalLfo): start only when the connection succeeded.
      if (lfoEngine.connectLfoTarget('lpf.Q')) lfoEngine.start('lpf.Q');

      const instance = await latestLfoInstance();
      expect(instance.connect).not.toHaveBeenCalled();
      expect(instance.start).not.toHaveBeenCalled();
    });

    it('never modifies stored settings when it refuses', async () => {
      const { lfoEngine } = await setup();
      configure(lfoEngine, 'lpf.Q', 3.5);
      const before = { ...lfoEngine.getLfoSettings('lpf.Q') };
      lfoEngine.setLfoPolicy(blockFilters);

      lfoEngine.connectLfoTarget('lpf.Q');

      expect(lfoEngine.getLfoSettings('lpf.Q')).toEqual(before);
      expect(before).toMatchObject({ rate: 3.5, depth: 40, shape: 'triangle' });
    });

    it('an LFO at rate 0 was never requested: it is not held off, and reconcile never connects it', async () => {
      const { AudioEngine, lfoEngine } = await setup();
      lfoEngine.setLfoRate('lpf.Q', 0);
      lfoEngine.setLfoPolicy(blockFilters);

      expect(lfoEngine.connectLfoTarget('lpf.Q')).toBe(false);
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);

      lfoEngine.setLfoPolicy(null);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockClear();
      lfoEngine.reconcileLfos();

      expect(AudioEngine.getGlobalModulationTarget).not.toHaveBeenCalled();
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
    });

    describe('reconcileLfos', () => {
      it('connects and starts held-off LFOs that have rate > 0 once the policy allows them', async () => {
        mockContextState = 'running';
        const { lfoEngine, firstIndex } = await setup();
        configure(lfoEngine, 'lpf.Q');
        configure(lfoEngine, 'hpf.Q');
        lfoEngine.setLfoPolicy(blockFilters);
        lfoEngine.connectLfoTarget('lpf.Q');
        lfoEngine.connectLfoTarget('hpf.Q');
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual(['lpf.Q', 'hpf.Q']);

        lfoEngine.setLfoPolicy(null);
        lfoEngine.reconcileLfos();

        expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
        const lfos = await primariesSince(firstIndex);
        expect(lfos).toHaveLength(2);
        for (const lfo of lfos) {
          expect(lfo.connect).toHaveBeenCalled();
          expect(lfo.start).toHaveBeenCalled();
        }
      });

      it('disconnects and stops a connected LFO the policy newly disallows, keeping everything it was set to', async () => {
        mockContextState = 'running';
        const { lfoEngine, firstIndex } = await setup();
        configure(lfoEngine, 'lpf.Q', 2.5);
        configure(lfoEngine, 'eq3.low');
        lfoEngine.connectLfoTarget('lpf.Q');
        lfoEngine.start('lpf.Q');
        lfoEngine.connectLfoTarget('eq3.low');
        const [filterLfo, eqLfo] = await primariesSince(firstIndex);
        eqLfo.disconnect.mockClear();
        eqLfo.stop.mockClear();
        filterLfo.disconnect.mockClear();
        filterLfo.stop.mockClear();

        lfoEngine.setLfoPolicy(blockFilters);
        lfoEngine.reconcileLfos();

        expect(filterLfo.disconnect).toHaveBeenCalled();
        expect(filterLfo.stop).toHaveBeenCalled();
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual(['lpf.Q']);
        expect(lfoEngine.getLfoSettings('lpf.Q')).toMatchObject({ rate: 2.5, depth: 40, shape: 'triangle' });
        // the allowed EQ-gain LFO is untouched
        expect(lfoEngine.getHeldOffLfoKeys()).not.toContain('eq3.low');
        expect(eqLfo.disconnect).not.toHaveBeenCalled();
        expect(eqLfo.stop).not.toHaveBeenCalled();
      });

      it('round trip: tiering down then up leaves every stored setting identical and re-establishes the same connection', async () => {
        mockContextState = 'running';
        const { AudioEngine, lfoEngine } = await setup();
        const signal = fakeSignal();
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => signal);
        configure(lfoEngine, 'lpf.frequency', 1.25);
        lfoEngine.connectLfoTarget('lpf.frequency');
        lfoEngine.start('lpf.frequency');
        const before = { ...lfoEngine.getLfoSettings('lpf.frequency') };
        const instance = await latestLfoInstance();
        instance.connect.mockClear();

        lfoEngine.setLfoPolicy(blockFilters);
        lfoEngine.reconcileLfos();
        lfoEngine.setLfoPolicy(null);
        lfoEngine.reconcileLfos();

        expect(lfoEngine.getLfoSettings('lpf.frequency')).toEqual(before);
        expect(instance.connect).toHaveBeenCalledWith(signal);
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
      });

      it('is idempotent: a second reconcile changes nothing', async () => {
        mockContextState = 'running';
        const { lfoEngine } = await setup();
        configure(lfoEngine, 'lpf.Q');
        lfoEngine.setLfoPolicy(blockFilters);
        lfoEngine.connectLfoTarget('lpf.Q');
        lfoEngine.setLfoPolicy(null);
        lfoEngine.reconcileLfos();
        const instance = await latestLfoInstance();
        const connects = instance.connect.mock.calls.length;
        const starts = instance.start.mock.calls.length;

        lfoEngine.reconcileLfos();

        expect(instance.connect.mock.calls.length).toBe(connects);
        expect(instance.start.mock.calls.length).toBe(starts);
      });

      it('respects the "context must be running" gate when it starts a reconnected LFO', async () => {
        mockContextState = 'suspended';
        const { lfoEngine } = await setup();
        configure(lfoEngine, 'lpf.Q');
        lfoEngine.setLfoPolicy(blockFilters);
        lfoEngine.connectLfoTarget('lpf.Q');

        lfoEngine.setLfoPolicy(null);
        lfoEngine.reconcileLfos();

        const instance = await latestLfoInstance();
        expect(instance.connect).toHaveBeenCalled(); // connected…
        expect(instance.start).not.toHaveBeenCalled(); // …but not started before the context runs
      });

      it('does nothing, and does not throw, with no requests at all', async () => {
        const { lfoEngine } = await setup();
        lfoEngine.setLfoPolicy(blockFilters);
        expect(() => lfoEngine.reconcileLfos()).not.toThrow();
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
      });

      it('never touches an LFO the policy leaves allowed (a phase LFO under a filter-only policy)', async () => {
        const { lfoEngine } = await setup();
        lfoEngine.setLfoRate('layer0.phase', 1, 'robot-a');
        lfoEngine.setLfoPolicy(blockFilters);
        expect(lfoEngine.connectLfoTarget('layer0.phase', 'robot-a')).toBe(true);
        const scheduled = scheduleCallbacks.size;

        lfoEngine.reconcileLfos();

        expect(scheduleCallbacks.size).toBe(scheduled);
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
      });
    });

    describe('explicit disconnect and disposal forget the request', () => {
      it('disconnectLfoTarget (the user set the rate to 0) removes a held-off LFO from the held-off list and from reconcile', async () => {
        const { AudioEngine, lfoEngine } = await setup();
        configure(lfoEngine, 'lpf.Q');
        lfoEngine.setLfoPolicy(blockFilters);
        lfoEngine.connectLfoTarget('lpf.Q');
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual(['lpf.Q']);

        lfoEngine.disconnectLfoTarget('lpf.Q');
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);

        lfoEngine.setLfoPolicy(null);
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockClear();
        lfoEngine.reconcileLfos();
        expect(AudioEngine.getGlobalModulationTarget).not.toHaveBeenCalled();
      });

      it('disposeRobotLfos forgets every request a removed robot had, including held-off ones', async () => {
        const { AudioEngine, lfoEngine } = await setup();
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal());
        lfoEngine.setLfoRate('layer0.gain', 1, 'robot-a');
        lfoEngine.setLfoPolicy(() => false);
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        expect(lfoEngine.getHeldOffLfoKeys()).toEqual(['robot-a:layer0.gain']);

        lfoEngine.disposeRobotLfos('robot-a');

        expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
      });
    });

    it('hands the policy the target, the robot id (undefined for a global one) and the connected robot-LFO count', async () => {
      const { AudioEngine, lfoEngine } = await setup();
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal());
      const policy = vi.fn(() => true);
      lfoEngine.setLfoPolicy(policy);
      configure(lfoEngine, 'eq3.low');
      lfoEngine.setLfoRate('volume', 1, 'robot-a');

      lfoEngine.connectLfoTarget('eq3.low');
      lfoEngine.connectLfoTarget('volume', 'robot-a');

      expect(policy).toHaveBeenCalledWith('eq3.low', undefined, 0);
      expect(policy).toHaveBeenCalledWith('volume', 'robot-a', 0);
    });
  });

  describe('disposeRobotLfos (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 1) — the one-way, full-teardown counterpart to disconnectLfoTarget, for a robot that is gone for good', () => {
    it('is exported from the lfoEngine object', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      expect(typeof lfoEngine.disposeRobotLfos).toBe('function');
    });

    it('disposes the underlying Tone.LFO node for a connected robot-scoped target', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal());
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const instance = await latestLfoInstance();

      lfoEngine.disposeRobotLfos('robot-a');

      expect(instance.dispose).toHaveBeenCalledTimes(1);
    });

    it('clears persisted settings — getLfoSettings falls back to DEFAULT_LFO_SETTINGS afterward', async () => {
      const { DEFAULT_LFO_SETTINGS } = await import('../data/lfoConfig');
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal());
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('layer0.gain', 4, 'robot-a');
      lfoEngine.setLfoDepth('layer0.gain', 70, 'robot-a');
      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-a')).not.toEqual(DEFAULT_LFO_SETTINGS['layer0.gain']);

      lfoEngine.disposeRobotLfos('robot-a');

      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-a')).toEqual(DEFAULT_LFO_SETTINGS['layer0.gain']);
    });

    it('reconnecting the same target for the same robot afterward constructs a brand-new Tone.LFO, not the disposed one', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal());
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const oldInstance = await latestLfoInstance();

      lfoEngine.disposeRobotLfos('robot-a');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const newInstance = await latestLfoInstance();

      expect(newInstance).not.toBe(oldInstance);
    });

    it('cancels a robot\'s phase-polling fallback schedule', async () => {
      const { cancelSchedule } = await import('./beatClock');
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');
      const sizeBeforeDispose = scheduleCallbacks.size;

      lfoEngine.disposeRobotLfos('robot-a');

      expect(cancelSchedule).toHaveBeenCalled();
      expect(scheduleCallbacks.size).toBe(sizeBeforeDispose - 1);
    });

    it('does not throw for a robot with no connected LFOs at all', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      expect(() => lfoEngine.disposeRobotLfos('never-connected-robot')).not.toThrow();
    });

    it('is idempotent — calling it twice in a row for the same robot does not throw', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal());
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

      lfoEngine.disposeRobotLfos('robot-a');
      expect(() => lfoEngine.disposeRobotLfos('robot-a')).not.toThrow();
    });

    it('does not affect a different robot\'s own connected LFO', async () => {
      const { DEFAULT_LFO_SETTINGS } = await import('../data/lfoConfig');
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal());
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoRate('layer0.gain', 5, 'robot-a');
      lfoEngine.setLfoRate('layer0.gain', 6, 'robot-b');

      lfoEngine.disposeRobotLfos('robot-a');

      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-a')).toEqual(DEFAULT_LFO_SETTINGS['layer0.gain']);
      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-b').rate).toBe(6);
    });
  });

  // Audio Load Budget (plan task 19): the number of audio-rate ROBOT LFOs connected at once is capped. Over-cap connections
  // are refused and held off; when the cap falls the most recently CONNECTED ones are dropped first (LIFO, matching robot
  // admission); when it rises, held-off ones reconnect in REQUEST order. layerN.phase LFOs poll at control rate and are
  // neither counted nor refused; global LFOs are unaffected by the robot cap.
  describe('robot-LFO cap (real lfoAllowed as the policy)', () => {
    const capPolicy = (cap: number) => (target: string, robotId: string | undefined, connected: number) =>
      lfoAllowed(target as never, robotId ? 'robot' : 'global', { ...loadToLimits(1), maxRobotLfos: cap }, connected);

    async function setup(cap: number) {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.setLfoPolicy(capPolicy(cap));
      const Tone = await import('tone');
      const firstIndex = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.results.length;
      /** Ask to connect one audio-rate robot LFO (rate 1 Hz on the robot's layer-0 gain), the way applyLayerLfo does. */
      const request = (robot: string): boolean => {
        lfoEngine.setLfoRate('layer0.gain', 1, robot);
        lfoEngine.setLfoDepth('layer0.gain', 30 + robot.length, robot);
        const ok = lfoEngine.connectLfoTarget('layer0.gain', robot);
        if (ok) lfoEngine.start('layer0.gain', robot);
        return ok;
      };
      const setCap = (next: number) => {
        lfoEngine.setLfoPolicy(capPolicy(next));
        lfoEngine.reconcileLfos();
      };
      const held = () => [...lfoEngine.getHeldOffLfoKeys()].sort();
      return { lfoEngine, request, setCap, held, firstIndex };
    }

    const gain = (robot: string) => `${robot}:layer0.gain`;

    it('refuses the (cap+1)th audio-rate robot LFO, reads it as held off, and keeps its stored settings', async () => {
      const { lfoEngine, request, held } = await setup(2);

      expect([request('r1'), request('r2'), request('r3')]).toEqual([true, true, false]);

      expect(held()).toEqual([gain('r3')]);
      expect(lfoEngine.getLfoSettings('layer0.gain', 'r3')).toMatchObject({ rate: 1 });
    });

    it('lowering the cap disconnects the most recently connected first, down to the cap', async () => {
      const { lfoEngine, request, setCap, held, firstIndex } = await setup(4);
      for (const robot of ['r1', 'r2', 'r3', 'r4']) request(robot);
      const Tone = await import('tone');
      const lfos = (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.results.slice(firstIndex)
        .map((r) => r.value as MockLfoInstance)
        .filter((l) => l.frequency.value === 1);
      expect(lfos).toHaveLength(4);
      lfos.forEach((l) => l.disconnect.mockClear());

      setCap(2);

      expect(held()).toEqual([gain('r3'), gain('r4')]);
      expect(lfos[0].disconnect).not.toHaveBeenCalled();
      expect(lfos[1].disconnect).not.toHaveBeenCalled();
      expect(lfos[2].disconnect).toHaveBeenCalled();
      expect(lfos[3].disconnect).toHaveBeenCalled();
      expect(lfoEngine.getLfoSettings('layer0.gain', 'r4')).toMatchObject({ rate: 1 }); // settings intact
    });

    it('raising the cap reconnects held-off LFOs oldest-request-first', async () => {
      const { request, setCap, held } = await setup(2);
      for (const robot of ['r1', 'r2', 'r3', 'r4']) request(robot);
      expect(held()).toEqual([gain('r3'), gain('r4')]);

      setCap(3);
      expect(held()).toEqual([gain('r4')]); // r3 asked first, so it gets the new slot

      setCap(4);
      expect(held()).toEqual([]);
    });

    it('drops the most recently CONNECTED, not the most recently requested', async () => {
      const { lfoEngine, request, setCap, held } = await setup(3);
      for (const robot of ['r1', 'r2', 'r3']) request(robot);
      // r1 is switched off and on again: still the oldest request, but now the newest connection.
      lfoEngine.disconnectLfoTarget('layer0.gain', 'r1');
      request('r1');

      setCap(2);

      expect(held()).toEqual([gain('r1')]);
    });

    it('never counts or refuses layerN.phase LFOs, even at a cap of zero', async () => {
      const { lfoEngine, setCap } = await setup(0);
      for (const layer of [0, 1, 2]) {
        lfoEngine.setLfoRate(`layer${layer}.phase` as never, 1, 'r1');
        expect(lfoEngine.connectLfoTarget(`layer${layer}.phase` as never, 'r1')).toBe(true);
      }
      setCap(0);
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
    });

    it('does not let phase LFOs use up slots the audio-rate ones need', async () => {
      const { lfoEngine, request } = await setup(1);
      for (const robot of ['a', 'b', 'c']) {
        lfoEngine.setLfoRate('layer0.phase', 1, robot);
        lfoEngine.connectLfoTarget('layer0.phase', robot);
      }
      expect(request('r1')).toBe(true);
      expect(request('r2')).toBe(false);
    });

    it('does not let the robot cap touch global LFOs', async () => {
      const { lfoEngine } = await setup(0);
      lfoEngine.setLfoRate('eq3.low', 1);
      expect(lfoEngine.connectLfoTarget('eq3.low')).toBe(true);
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
    });

    it('refuses nothing at Full (unlimited), however many are requested', async () => {
      const { request, held } = await setup(Infinity);
      for (let i = 0; i < 30; i++) expect(request(`robot-${i}`)).toBe(true);
      expect(held()).toEqual([]);
    });

    it('a freed slot goes to the oldest held-off LFO without waiting for a dial change', async () => {
      const { lfoEngine, request, held } = await setup(2);
      for (const robot of ['r1', 'r2', 'r3', 'r4']) request(robot);
      expect(held()).toEqual([gain('r3'), gain('r4')]);

      lfoEngine.disconnectLfoTarget('layer0.gain', 'r1'); // the user turns r1's LFO off

      expect(held()).toEqual([gain('r4')]);
    });

    it('is idempotent at a steady cap: reconciling again changes nothing', async () => {
      const { request, setCap, held } = await setup(3);
      for (const robot of ['r1', 'r2', 'r3', 'r4', 'r5']) request(robot);
      const before = held();

      setCap(3);
      setCap(3);

      expect(held()).toEqual(before);
    });

    it('a cap that falls to zero holds every audio-rate robot LFO off and back on again when it rises', async () => {
      const { request, setCap, held } = await setup(3);
      for (const robot of ['r1', 'r2', 'r3']) request(robot);

      setCap(0);
      expect(held()).toEqual([gain('r1'), gain('r2'), gain('r3')]);

      setCap(3);
      expect(held()).toEqual([]);
    });
  });

  // Audio Load Budget (plan task 20): the engine tells a subscriber when the held-off set changes, so the UI can grey a robot
  // LFO out the moment the user enables it over the cap (that action goes straight to lfoEngine, not through the budget system).
  describe('subscribeHeldOff', () => {
    async function setup() {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const listener = vi.fn();
      const unsubscribe = lfoEngine.subscribeHeldOff(listener);
      const ask = (target: 'lpf.Q' | 'eq3.low') => {
        lfoEngine.setLfoRate(target, 1);
        return lfoEngine.connectLfoTarget(target);
      };
      return { lfoEngine, listener, unsubscribe, ask };
    }
    const blockFilters = (target: string) => !/^(lpf|hpf)\./.test(target);

    it('fires when a connection is refused and the LFO becomes held off, by which time the key is already readable', async () => {
      const { lfoEngine, listener, ask } = await setup();
      lfoEngine.setLfoPolicy(blockFilters);
      let seen: string[] = [];
      listener.mockImplementation(() => { seen = lfoEngine.getHeldOffLfoKeys(); });

      ask('lpf.Q');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(seen).toEqual(['lpf.Q']);
    });

    it('does not fire when nothing changes: an allowed connection, a repeated refusal, or a steady reconcile', async () => {
      const { lfoEngine, listener, ask } = await setup();
      lfoEngine.setLfoPolicy(blockFilters);
      ask('eq3.low');
      expect(listener).not.toHaveBeenCalled();

      ask('lpf.Q');
      listener.mockClear();
      ask('lpf.Q'); // refused again — already held off
      lfoEngine.reconcileLfos();
      lfoEngine.reconcileLfos();

      expect(listener).not.toHaveBeenCalled();
    });

    it('fires when a reconcile clears the held-off LFO, and when an explicit disconnect withdraws it', async () => {
      const { lfoEngine, listener, ask } = await setup();
      lfoEngine.setLfoPolicy(blockFilters);
      ask('lpf.Q');
      listener.mockClear();

      lfoEngine.setLfoPolicy(null);
      lfoEngine.reconcileLfos();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);

      lfoEngine.setLfoPolicy(blockFilters);
      lfoEngine.reconcileLfos(); // held off again
      listener.mockClear();
      lfoEngine.disconnectLfoTarget('lpf.Q');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stops firing after unsubscribe, and one throwing listener neither breaks the engine nor starves the others', async () => {
      const { lfoEngine, listener, unsubscribe, ask } = await setup();
      const bad = vi.fn(() => { throw new Error('listener bug'); });
      const good = vi.fn();
      lfoEngine.subscribeHeldOff(bad);
      lfoEngine.subscribeHeldOff(good);
      lfoEngine.setLfoPolicy(blockFilters);

      expect(() => ask('lpf.Q')).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);

      unsubscribe();
      listener.mockClear();
      lfoEngine.disconnectLfoTarget('lpf.Q');
      expect(listener).not.toHaveBeenCalled();
    });
  });

  // Audio Load Budget (plan task 18): drift ("stacked" LFOs) is the first tier to go. While it is off no drift link is
  // attached to any LFO, existing links are torn down, and turning it back on re-attaches drift to whatever is connected
  // — the seeded/edited drift AMOUNTS and every LFO's own settings are never touched.
  describe('drift tier (setDriftEnabled)', () => {
    async function setup() {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const Tone = await import('tone');
      const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
      const lfoCtor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
      return {
        lfoEngine,
        /** Tone.Gain instances constructed since this call — the drift links' per-primary attenuators (2 per link). */
        gainMark: () => gainCtor.mock.results.length,
        gainsSince: (mark: number) => gainCtor.mock.results.slice(mark).map((r) => r.value as MockGainInstance),
        poolDisposals: () =>
          lfoCtor.mock.results.filter((r, i) => typeof lfoCtor.mock.calls[i][0] === 'object' && (r.value as MockLfoInstance).dispose.mock.calls.length > 0).length,
      };
    }

    /** A connected robot LFO with a non-zero rate and depth, the way applyLayerLfo leaves one. */
    function connectRobot(lfoEngine: Awaited<ReturnType<typeof setup>>['lfoEngine'], target: 'layer0.gain' | 'layer0.detune' | 'volume' = 'layer0.gain') {
      lfoEngine.setLfoRate(target, 2, 'robot-a');
      lfoEngine.setLfoDepth(target, 50, 'robot-a');
      return lfoEngine.connectLfoTarget(target, 'robot-a');
    }

    it('by default (never called) attaches drift exactly as before: two attenuators per connected LFO', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      const mark = gainMark();
      connectRobot(lfoEngine);
      expect(gainsSince(mark)).toHaveLength(2);
    });

    it('while off, a newly connected LFO gets no drift link: no attenuators and no drift pool are constructed', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setDriftEnabled(false);
      const mark = gainMark();

      const poolDelta = await poolConstructionCountDelta(() => {
        expect(connectRobot(lfoEngine)).toBe(true); // the LFO itself still connects
      });

      expect(gainsSince(mark)).toHaveLength(0);
      expect(poolDelta).toBe(0);
    });

    it('applies to global-chain LFOs as well as robot ones', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setDriftEnabled(false);
      const mark = gainMark();
      lfoEngine.setLfoRate('eq3.low', 1);
      lfoEngine.setLfoDepth('eq3.low', 50);
      expect(lfoEngine.connectLfoTarget('eq3.low')).toBe(true);
      expect(gainsSince(mark)).toHaveLength(0);
    });

    it('turning it off tears down every existing drift link (both attenuators, robot and global)', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      const mark = gainMark();
      connectRobot(lfoEngine, 'layer0.gain');
      connectRobot(lfoEngine, 'layer0.detune');
      lfoEngine.setLfoRate('eq3.low', 1);
      lfoEngine.setLfoDepth('eq3.low', 50);
      lfoEngine.connectLfoTarget('eq3.low');
      const links = gainsSince(mark);
      expect(links).toHaveLength(6);

      lfoEngine.setDriftEnabled(false);

      for (const gain of links) {
        expect(gain.disconnect).toHaveBeenCalled();
        expect(gain.dispose).toHaveBeenCalled();
      }
    });

    it('turning it back on re-attaches drift to every connected LFO, carrying the current drift amounts', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setGlobalRateDrift('robots', 0.5);
      const first = gainMark();
      connectRobot(lfoEngine, 'layer0.gain');
      connectRobot(lfoEngine, 'layer0.detune');
      const [rateGainBefore] = gainsSince(first);
      expect(rateGainBefore.gain.value).not.toBe(0); // the amount really is applied
      lfoEngine.setDriftEnabled(false);

      const mark = gainMark();
      lfoEngine.setDriftEnabled(true);

      const relinked = gainsSince(mark);
      expect(relinked).toHaveLength(4); // 2 connected LFOs × 2 attenuators
      expect(relinked[0].gain.value).toBeCloseTo(rateGainBefore.gain.value, 10);
    });

    it('re-uses the drift pools rather than rebuilding them, and never disposes them', async () => {
      const { lfoEngine, poolDisposals } = await setup();
      connectRobot(lfoEngine);
      lfoEngine.setDriftEnabled(false);

      const poolDelta = await poolConstructionCountDelta(() => lfoEngine.setDriftEnabled(true));

      expect(poolDelta).toBe(0);
      expect(poolDisposals()).toBe(0);
    });

    it('a down/up round trip leaves every LFO setting and drift amount exactly as it was', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setGlobalRateDrift('robots', 0.4);
      lfoEngine.setGlobalDepthDrift('robots', -0.3);
      const first = gainMark();
      lfoEngine.setLfoRate('layer0.gain', 3.25, 'robot-a');
      lfoEngine.setLfoDepth('layer0.gain', 61, 'robot-a');
      lfoEngine.setLfoShape('layer0.gain', 'sawtooth', 'robot-a');
      lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      const [rateBefore, depthBefore] = gainsSince(first);
      const settingsBefore = { ...lfoEngine.getLfoSettings('layer0.gain', 'robot-a') };
      const amounts = [rateBefore.gain.value, depthBefore.gain.value];

      lfoEngine.setDriftEnabled(false);
      lfoEngine.setDriftEnabled(true);

      expect(lfoEngine.getLfoSettings('layer0.gain', 'robot-a')).toEqual(settingsBefore);
      const [rateAfter, depthAfter] = gainsSince(first).slice(-2);
      expect([rateAfter.gain.value, depthAfter.gain.value]).toEqual(amounts);
    });

    it('only re-attaches to LFOs that are connected — a held-off one waits until it is', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setLfoRate('lpf.frequency', 1);
      lfoEngine.setLfoDepth('lpf.frequency', 50);
      lfoEngine.setLfoPolicy((target) => target !== 'lpf.frequency');
      expect(lfoEngine.connectLfoTarget('lpf.frequency')).toBe(false); // held off
      connectRobot(lfoEngine);
      lfoEngine.setDriftEnabled(false);

      const mark = gainMark();
      lfoEngine.setDriftEnabled(true);

      expect(gainsSince(mark)).toHaveLength(2); // the one robot LFO only
    });

    it('an LFO brought back by reconcileLfos while drift is off gets no drift link', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setLfoPolicy(() => false);
      connectRobot(lfoEngine); // refused, held off
      lfoEngine.setDriftEnabled(false);
      lfoEngine.setLfoPolicy(null);
      const mark = gainMark();

      lfoEngine.reconcileLfos();

      expect(lfoEngine.getHeldOffLfoKeys()).toEqual([]);
      expect(gainsSince(mark)).toHaveLength(0);
    });

    it('is idempotent in both directions, and turning it on when it was never off changes nothing', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      connectRobot(lfoEngine);
      const mark = gainMark();

      lfoEngine.setDriftEnabled(true); // was never off
      expect(gainsSince(mark)).toHaveLength(0);

      lfoEngine.setDriftEnabled(false);
      const afterOff = gainMark();
      lfoEngine.setDriftEnabled(false);
      expect(gainsSince(afterOff)).toHaveLength(0);

      lfoEngine.setDriftEnabled(true);
      const afterOn = gainMark();
      lfoEngine.setDriftEnabled(true);
      expect(gainsSince(afterOn)).toHaveLength(0);
    });

    it('never adds drift to a phase LFO (it polls at control rate), whichever way the switch goes', async () => {
      const { lfoEngine, gainMark, gainsSince } = await setup();
      lfoEngine.setLfoRate('layer0.phase', 1, 'robot-a');
      lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');
      const mark = gainMark();

      lfoEngine.setDriftEnabled(false);
      lfoEngine.setDriftEnabled(true);

      expect(gainsSince(mark)).toHaveLength(0);
    });
  });

  describe('drift pool (Task 4 — structural, inert: both Gains stay at 0, nothing audible changes)', () => {
    describe('pool construction', () => {
      it('constructs no pool oscillator on module load or when only reading/setting rate, depth, or shape', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        const delta = await poolConstructionCountDelta(() => {
          lfoEngine.getLfoSettings('volume');
          lfoEngine.setLfoRate('volume', 2);
          lfoEngine.setLfoDepth('volume', 50);
          lfoEngine.setLfoShape('volume', 'square');
        });
        expect(delta).toBe(0);
      });

      it('constructs exactly 8 pool oscillators on the first successful connectLfoTarget call', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const delta = await poolConstructionCountDelta(() => {
          lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        });
        expect(delta).toBe(8);
      });

      it('does not construct the pool when connectLfoTarget fails to resolve a signal', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
        const { lfoEngine } = await import('./lfoEngine');
        const delta = await poolConstructionCountDelta(() => {
          lfoEngine.connectLfoTarget('layer0.pulseWidth', 'robot-a');
        });
        expect(delta).toBe(0);
      });

      it('reuses the existing pool for a second bound target — still exactly 8 pool oscillators, not 16', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(fakeSignal(0))
          .mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const delta = await poolConstructionCountDelta(() => {
          lfoEngine.connectLfoTarget('layer0.detune', 'robot-a');
        });
        expect(delta).toBe(0);
      });
    });

    describe('bucket assignment determinism', () => {
      it('the same instance key deterministically reuses the same pool oscillator across a disconnect + reconnect cycle', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const firstRateDriftGain = gainCtor.mock.results.at(-2)!.value;
        const firstBucket = await poolOscillatorConnectedTo(firstRateDriftGain);
        expect(firstBucket).toBeDefined();

        lfoEngine.disconnectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const secondRateDriftGain = gainCtor.mock.results.at(-2)!.value;
        const secondBucket = await poolOscillatorConnectedTo(secondRateDriftGain);

        expect(secondBucket).toBe(firstBucket);
      });

      it('a representative spread of instance keys does not all collapse onto a single pool oscillator', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        const buckets = new Set<unknown>();
        for (let i = 0; i < 16; i++) {
          lfoEngine.connectLfoTarget('layer0.gain', `bucket-spread-robot-${i}`);
          const rateDriftGain = gainCtor.mock.results.at(-2)!.value;
          buckets.add(await poolOscillatorConnectedTo(rateDriftGain));
        }
        expect(buckets.size).toBeGreaterThan(1);
      });
    });

    describe('per-primary drift Gain creation and wiring', () => {
      it('gives a successfully-connected primary its own rate-drift and depth-drift Gain nodes, both starting at 0', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const before = gainCtor.mock.results.length;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

        const created = gainCtor.mock.results.slice(before).map((r) => r.value as MockGainInstance);
        expect(created).toHaveLength(2);
        expect(created[0].gain.value).toBe(0);
        expect(created[1].gain.value).toBe(0);
      });

      it('sets override to false on the primary\'s frequency before connecting the rate-drift Gain, leaving its current value untouched', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.setLfoRate('layer0.gain', 3, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const primary = await latestLfoInstance();
        expect(primary.frequency.override).toBe(false);
        expect(primary.frequency.value).toBe(3);
      });

      it('connects the depth-drift Gain into the primary\'s amplitude and restores its own current value afterward — amplitude is a Param and always resets to 0 on connect, so the restore is what actually preserves it', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.setLfoDepth('layer0.gain', 60, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const primary = await latestLfoInstance();
        expect(primary.amplitude.value).toBeCloseTo(0.6);
      });

      it('is idempotent — reconnecting the same already-connected target does not create a second pair of drift Gains', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const before = gainCtor.mock.calls.length;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

        expect(gainCtor.mock.calls.length - before).toBe(2);
      });
    });

    describe('teardown', () => {
      it('disconnectLfoTarget disconnects both of a primary\'s drift Gains', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const before = gainCtor.mock.results.length;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const [rateDriftGain, depthDriftGain] = gainCtor.mock.results.slice(before).map((r) => r.value as MockGainInstance);

        lfoEngine.disconnectLfoTarget('layer0.gain', 'robot-a');

        expect(rateDriftGain.disconnect).toHaveBeenCalledTimes(1);
        expect(depthDriftGain.disconnect).toHaveBeenCalledTimes(1);
      });

      it('disposes both of a primary\'s drift Gains too, not just disconnecting them (docs/tasks/AUDIO_ENGINE_CLEANUP.md Task 2)', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const before = gainCtor.mock.results.length;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const [rateDriftGain, depthDriftGain] = gainCtor.mock.results.slice(before).map((r) => r.value as MockGainInstance);

        lfoEngine.disconnectLfoTarget('layer0.gain', 'robot-a');

        expect(rateDriftGain.dispose).toHaveBeenCalledTimes(1);
        expect(depthDriftGain.dispose).toHaveBeenCalledTimes(1);
      });

      it('never disconnects a shared pool oscillator itself — pool oscillators are app-lifetime, not per-target', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const ctor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
        // Delta-based, not absolute — Tone.LFO's mock.calls/mock.results keep
        // accumulating across every test in this file (see this file's own
        // documented convention above), so counting from index 0 would pick
        // up every prior test's own pool construction too.
        const before = ctor.mock.calls.length;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

        const poolInstances = ctor.mock.calls
          .slice(before)
          .map((call, i) => ({ call, instance: ctor.mock.results[before + i].value as MockLfoInstance }))
          .filter(({ call }) => typeof call[0] === 'object')
          .map(({ instance }) => instance);
        expect(poolInstances).toHaveLength(8);

        lfoEngine.disconnectLfoTarget('layer0.gain', 'robot-a');

        for (const pool of poolInstances) {
          expect(pool.disconnect).not.toHaveBeenCalled();
        }
      });

      it('reconnecting after a full disconnect creates a fresh pair of drift Gains, not reused stale ones', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.disconnectLfoTarget('layer0.gain', 'robot-a');
        const before = gainCtor.mock.calls.length;
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

        expect(gainCtor.mock.calls.length - before).toBe(2);
      });
    });

    describe('phase exclusion', () => {
      it('creates no drift Gains for a \'layerN.phase\' target — no live Signal exists for it to attach to', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const before = gainCtor.mock.calls.length;

        lfoEngine.connectLfoTarget('layer0.phase', 'robot-a');

        expect(gainCtor.mock.calls.length - before).toBe(0);
      });
    });
  });

  describe('per-group drift pools (docs/tasks/LFO_DRIFT_GROUPS.md Task 5 — structural: every group correctly pooled, amounts not yet independent)', () => {
    it('constructs exactly 3 pool oscillators for the eq3 group on its own first successful connect', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.connectLfoTarget('eq3.low');
      });
      expect(delta).toBe(3);
    });

    it('constructs exactly 2 pool oscillators for the filterLPF group on its own first successful connect', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.connectLfoTarget('lpf.frequency');
      });
      expect(delta).toBe(2);
    });

    it('constructs exactly 2 pool oscillators for the filterHPF group on its own first successful connect', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.connectLfoTarget('hpf.Q');
      });
      expect(delta).toBe(2);
    });

    it('constructs exactly 8 pool oscillators for the robots group on its own first successful connect — every RobotLfoTargetId shares this one group', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
      });
      expect(delta).toBe(8);
    });

    it('connecting a target in one group does not construct another group\'s pool', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('eq3.low'); // constructs eq3's own pool (3)

      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.connectLfoTarget('lpf.frequency'); // a different group — should add only ITS OWN 2
      });

      expect(delta).toBe(2);
    });

    it('reuses an existing group\'s pool for a second target in the same group — still exactly that group\'s own size, not doubled', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      lfoEngine.connectLfoTarget('eq3.low'); // constructs eq3's pool (3)

      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.connectLfoTarget('eq3.mid'); // same group — must reuse, not rebuild
      });

      expect(delta).toBe(0);
    });

    it('a group\'s pool is not constructed until that group\'s own first successful connectLfoTarget call', async () => {
      const { lfoEngine } = await import('./lfoEngine');
      const delta = await poolConstructionCountDelta(() => {
        lfoEngine.setLfoRate('eq3.low', 3);
        lfoEngine.getLfoSettings('layer0.gain', 'robot-a');
      });
      expect(delta).toBe(0);
    });

    it('the same instance key deterministically reuses the same pool oscillator, from its own group\'s pool, across a disconnect + reconnect cycle', async () => {
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
      const { lfoEngine } = await import('./lfoEngine');
      const Tone = await import('tone');
      const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

      lfoEngine.connectLfoTarget('eq3.low');
      const firstRateDriftGain = gainCtor.mock.results.at(-2)!.value;
      const firstBucket = await poolOscillatorConnectedTo(firstRateDriftGain);
      expect(firstBucket).toBeDefined();

      lfoEngine.disconnectLfoTarget('eq3.low');
      lfoEngine.connectLfoTarget('eq3.low');
      const secondRateDriftGain = gainCtor.mock.results.at(-2)!.value;
      const secondBucket = await poolOscillatorConnectedTo(secondRateDriftGain);

      expect(secondBucket).toBe(firstBucket);
    });
  });

  describe('drift swing math, silence guard, and global setters (Task 5)', () => {
    describe('rate-drift swing (refreshRateDriftGain, via setGlobalRateDrift)', () => {
      it('scales a linked primary\'s rate-drift Gain by globalRateDrift * the centeredSwingFromRange half-span for its own current rate', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2; // both edge-distances equal
        lfoEngine.setLfoRate('layer0.gain', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const rateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setGlobalRateDrift('robots', 0.5);

        const halfSpan = (LFO_RATE_MAX - LFO_RATE_MIN) / 2;
        expect(rateDriftGain.gain.value).toBeCloseTo(0.5 * halfSpan);
      });

      it('gives a primary parked at LFO_RATE_MIN a zero swing regardless of globalRateDrift — no headroom below', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        // Default rate is already LFO_RATE_MIN (lfoConfig.ts's makeDefaultLfoSettings) — no explicit setLfoRate needed.
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.setGlobalRateDrift('robots', 1);
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const rateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;
        expect(rateDriftGain.gain.value).toBe(0);
      });

      it('gives a smaller swing to a primary near the range\'s edge than one at the midpoint, for the same globalRateDrift', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(fakeSignal(0))
          .mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2;
        const nearEdgeRate = LFO_RATE_MIN + 0.2;
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.setLfoRate('layer0.gain', nearEdgeRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const nearEdgeGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setLfoRate('layer0.detune', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.detune', 'robot-a');
        const midpointGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setGlobalRateDrift('robots', 1);

        expect(Math.abs(nearEdgeGain.gain.value)).toBeLessThan(Math.abs(midpointGain.gain.value));
      });

      it('keeps a linked primary\'s rate-drift Gain current when its own rate changes via setLfoRate', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2;
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a'); // starts at LFO_RATE_MIN — zero swing
        lfoEngine.setGlobalRateDrift('robots', 1);
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const rateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;
        expect(rateDriftGain.gain.value).toBe(0);

        lfoEngine.setLfoRate('layer0.gain', midpointRate, 'robot-a');

        const halfSpan = (LFO_RATE_MAX - LFO_RATE_MIN) / 2;
        expect(rateDriftGain.gain.value).toBeCloseTo(halfSpan);
      });
    });

    describe('setGlobalRateDrift / setGlobalDepthDrift', () => {
      it('is a safe no-op with zero primaries connected', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        expect(() => lfoEngine.setGlobalRateDrift('robots', 0.5)).not.toThrow();
        expect(() => lfoEngine.setGlobalDepthDrift('robots', 0.5)).not.toThrow();
      });

      it('updates every currently-linked primary\'s rate-drift Gain, not just the most recently connected one', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>)
          .mockReturnValueOnce(fakeSignal(0))
          .mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2;
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.setLfoRate('layer0.gain', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const firstRateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setLfoRate('layer0.detune', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.detune', 'robot-a');
        const secondRateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setGlobalRateDrift('robots', 1);

        expect(firstRateDriftGain.gain.value).not.toBe(0);
        expect(secondRateDriftGain.gain.value).not.toBe(0);
      });

      it('clamps the global amount to [-1, 1]', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2;
        lfoEngine.setLfoRate('layer0.gain', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const rateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setGlobalRateDrift('robots', 5); // way out of range

        const halfSpan = (LFO_RATE_MAX - LFO_RATE_MIN) / 2;
        expect(rateDriftGain.gain.value).toBeCloseTo(1 * halfSpan); // clamped to 1, not 5
      });

      it('is a safe no-op for a group with zero primaries connected, even while another group has primaries and a nonzero amount already set', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.setGlobalRateDrift('robots', 1);
        lfoEngine.setGlobalDepthDrift('robots', 1);

        expect(() => lfoEngine.setGlobalRateDrift('eq3', 0.5)).not.toThrow();
        expect(() => lfoEngine.setGlobalDepthDrift('filterHPF', 0.5)).not.toThrow();
      });
    });

    describe('cross-group isolation (docs/tasks/LFO_DRIFT_GROUPS.md Task 6 — the highest-risk regression class this phase introduces: 10.2 had exactly one global amount, so "which amount applies to this primary" could never be wrong before)', () => {
      it('setGlobalRateDrift for one group never touches another group\'s rate-drift Gain', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2;
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.setLfoRate('eq3.low', midpointRate);
        lfoEngine.connectLfoTarget('eq3.low');
        const eq3RateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setLfoRate('layer0.gain', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const robotsRateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setGlobalRateDrift('eq3', 1);

        expect(eq3RateDriftGain.gain.value).not.toBe(0);
        expect(robotsRateDriftGain.gain.value).toBe(0); // untouched — robots' own amount is still 0
      });

      it('setGlobalRateDrift for the OTHER group (robots) doesn\'t leak into eq3 either — isolation holds in both directions', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const { LFO_RATE_MIN, LFO_RATE_MAX } = await import('../types/lfo');
        const midpointRate = (LFO_RATE_MIN + LFO_RATE_MAX) / 2;
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.setLfoRate('eq3.low', midpointRate);
        lfoEngine.connectLfoTarget('eq3.low');
        const eq3RateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setLfoRate('layer0.gain', midpointRate, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const robotsRateDriftGain = gainCtor.mock.results.at(-2)!.value as MockGainInstance;

        lfoEngine.setGlobalRateDrift('robots', 1);

        expect(robotsRateDriftGain.gain.value).not.toBe(0);
        expect(eq3RateDriftGain.gain.value).toBe(0); // untouched — eq3's own amount is still 0
      });

      it('setGlobalDepthDrift for one group never touches another group\'s depth-drift Gain', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;

        lfoEngine.setLfoDepth('eq3.low', 50);
        lfoEngine.connectLfoTarget('eq3.low');
        const eq3DepthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;

        lfoEngine.setLfoDepth('layer0.gain', 50, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        const robotsDepthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;

        lfoEngine.setGlobalDepthDrift('eq3', 1);

        expect(eq3DepthDriftGain.gain.value).not.toBe(0);
        expect(robotsDepthDriftGain.gain.value).toBe(0); // untouched — robots' own amount is still 0
      });

      it('the depth-drift silence guard holds for a global-chain group too, not just robots', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('eq3.low'); // default depth is 0
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const depthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;

        lfoEngine.setGlobalDepthDrift('eq3', 1);

        expect(depthDriftGain.connect).not.toHaveBeenCalled();
      });
    });

    describe('depth-drift silence guard — a depth-0 target must never revive under global drift', () => {
      it('a primary at its default depth (0) has its depth-drift Gain left disconnected, even with a nonzero global depthDrift', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a'); // default depth is 0 (LFO_DEPTH_MIN)
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const depthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;

        lfoEngine.setGlobalDepthDrift('robots', 1);

        expect(depthDriftGain.connect).not.toHaveBeenCalled();
      });

      it('raising depth above 0 connects the depth-drift Gain and immediately reflects the current global depthDrift value', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.setGlobalDepthDrift('robots', 1);
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const depthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;

        lfoEngine.setLfoDepth('layer0.gain', 50, 'robot-a');

        expect(depthDriftGain.connect).toHaveBeenCalledTimes(1);
        expect(depthDriftGain.gain.value).not.toBe(0);
      });

      it('dropping depth back to 0 disconnects the depth-drift Gain again — not just zeroes it', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.setLfoDepth('layer0.gain', 50, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a'); // connects immediately — depth already > 0
        lfoEngine.setGlobalDepthDrift('robots', 1);
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const depthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;
        expect(depthDriftGain.connect).toHaveBeenCalledTimes(1);

        lfoEngine.setLfoDepth('layer0.gain', 0, 'robot-a');

        expect(depthDriftGain.disconnect).toHaveBeenCalledTimes(1);
      });

      it('a still-silenced depth-drift Gain is never connected as global depthDrift changes underneath it', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a'); // default depth 0
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const depthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;

        lfoEngine.setGlobalDepthDrift('robots', 1);
        lfoEngine.setGlobalDepthDrift('robots', -1);

        expect(depthDriftGain.connect).not.toHaveBeenCalled();
      });

      it('reconnecting depth above 0 after having been silenced restores its value using the CURRENT global depthDrift, not a stale one', async () => {
        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const { lfoEngine } = await import('./lfoEngine');
        lfoEngine.setLfoDepth('layer0.gain', 50, 'robot-a');
        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');
        lfoEngine.setGlobalDepthDrift('robots', 0.2);
        lfoEngine.setLfoDepth('layer0.gain', 0, 'robot-a'); // silences — disconnects
        lfoEngine.setGlobalDepthDrift('robots', 0.8); // changes while silenced

        lfoEngine.setLfoDepth('layer0.gain', 50, 'robot-a'); // un-silences

        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const depthDriftGain = gainCtor.mock.results.at(-1)!.value as MockGainInstance;
        const swingMax = 0.5; // centeredSwingFromRange({min:0,max:1}, 0.5).max
        expect(depthDriftGain.gain.value).toBeCloseTo(0.8 * swingMax);
      });
    });

    describe('setLfoRate / setLfoDepth on a target with no drift link yet', () => {
      it('does not throw and does not create a drift link as a side effect', async () => {
        const { lfoEngine } = await import('./lfoEngine');
        expect(() => lfoEngine.setLfoRate('layer0.gain', 3, 'robot-a')).not.toThrow();
        expect(() => lfoEngine.setLfoDepth('layer0.gain', 50, 'robot-a')).not.toThrow();

        const { AudioEngine } = await import('./AudioEngine');
        (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValueOnce(fakeSignal(0));
        const Tone = await import('tone');
        const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
        const before = gainCtor.mock.calls.length;

        lfoEngine.connectLfoTarget('layer0.gain', 'robot-a');

        expect(gainCtor.mock.calls.length - before).toBe(2); // a fresh pair, not a phantom reuse or a crash
      });
    });
  });
});
