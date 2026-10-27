import { beforeEach, describe, expect, it, vi } from 'vitest';

const callbacks: Array<(time?: unknown) => void> = [];

const mockTransport = {
  position: '0:0:0',
  scheduleRepeat: vi.fn<(cb: (time?: unknown) => void, interval: string) => string>((cb) => {
    callbacks.push(cb);
    return 'repeat-id';
  }),
  clear: vi.fn<(id: unknown) => void>(),
};

vi.mock('tone', () => ({
  getTransport: () => mockTransport,
}));

let initBeatClock: (transport?: typeof mockTransport & { toSeconds?: (time: string) => number }) => void;
let getTickSeconds: (time?: number) => number | undefined;
let getCurrentBeat: () => number;
let getCurrentMeasure: () => number;
let getCurrentMeasurePrecise: () => number;
let parseTransportPosition: (rawPosition: unknown) => { measure: number; beat: number; sixteenths: number };
let subscribeToMeasure: (cb: (m: number) => void) => () => void;
let resetBeatClock: () => void;
let scheduleRepeat: (interval: string, callback: (time: number) => void) => string;
let cancelSchedule: (scheduleId: string) => void;

describe('beatClock', () => {
  beforeEach(async () => {
    callbacks.length = 0;
    mockTransport.position = '0:0:0';
    mockTransport.scheduleRepeat.mockClear();
    mockTransport.clear.mockClear();
    vi.resetModules();
    ({
      initBeatClock,
      getCurrentBeat,
      getCurrentMeasure,
      getCurrentMeasurePrecise,
      parseTransportPosition,
      subscribeToMeasure,
      resetBeatClock,
      scheduleRepeat,
      cancelSchedule,
      getTickSeconds,
    } = await import('./beatClock'));
    // Initialize the beatClock with the mocked transport for tests
    initBeatClock(mockTransport);
  });

  it('initializes once and tracks beat/measure from transport position', () => {
    initBeatClock(mockTransport);
    expect(mockTransport.scheduleRepeat).toHaveBeenCalledTimes(1);
    mockTransport.position = '2:1:2';
    callbacks[0]?.();
    expect(getCurrentMeasure()).toBe(2);
    expect(getCurrentBeat()).toBeCloseTo(9.5);
  });

  // docs/specs/SWELL_PHASE_PULSE_WIDTH_CUT.md §8.2: a timed write glides one 16n at the live tempo.
  describe('getTickSeconds', () => {
    function initWithToSeconds(toSeconds: (time: string) => number) {
      resetBeatClock();
      initBeatClock({ ...mockTransport, toSeconds });
    }

    it('is the transport toSeconds of one 16n', () => {
      const toSeconds = vi.fn(() => 0.137);
      initWithToSeconds(toSeconds);
      expect(getTickSeconds()).toBe(0.137);
      expect(toSeconds).toHaveBeenCalledWith('16n');
    });

    it('reads the live value on every call, so a tempo change reaches the next write', () => {
      let seconds = 0.137;
      initWithToSeconds(() => seconds);
      expect(getTickSeconds()).toBe(0.137);
      seconds = 0.0625;
      expect(getTickSeconds()).toBe(0.0625);
    });

    it('is undefined with no transport', () => {
      resetBeatClock();
      expect(getTickSeconds()).toBeUndefined();
    });

    it('is undefined for a transport without toSeconds', () => {
      expect(getTickSeconds()).toBeUndefined();
    });

    it.each([NaN, 0, -0.125, Infinity])('is undefined, never a bad length, when toSeconds gives %s', (bad) => {
      initWithToSeconds(() => bad);
      expect(getTickSeconds()).toBeUndefined();
    });

    // Plan Task 13: every write in one Transport callback carries that callback's time, so a tick reads the tempo once.
    describe('given a time', () => {
      it('reads toSeconds once for every call at that time', () => {
        const toSeconds = vi.fn(() => 0.137);
        initWithToSeconds(toSeconds);
        const lengths = [1, 2, 3, 4, 5].map(() => getTickSeconds(12.5));
        expect(lengths).toEqual([0.137, 0.137, 0.137, 0.137, 0.137]);
        expect(toSeconds).toHaveBeenCalledTimes(1);
        expect(toSeconds).toHaveBeenCalledWith('16n');
      });

      it('reads again at a new time, so a tempo change reaches the next tick', () => {
        let seconds = 0.137;
        const toSeconds = vi.fn(() => seconds);
        initWithToSeconds(toSeconds);
        expect(getTickSeconds(12.5)).toBe(0.137);
        seconds = 0.0625;
        expect(getTickSeconds(12.637)).toBe(0.0625);
        expect(toSeconds).toHaveBeenCalledTimes(2);
      });

      it('keeps one length for the whole tick: a tempo change within a time is not seen until the next time', () => {
        let seconds = 0.137;
        initWithToSeconds(() => seconds);
        expect(getTickSeconds(12.5)).toBe(0.137);
        seconds = 0.0625;
        expect(getTickSeconds(12.5)).toBe(0.137);
        expect(getTickSeconds(12.637)).toBe(0.0625);
      });

      it('treats a time of 0 as a time', () => {
        const toSeconds = vi.fn(() => 0.137);
        initWithToSeconds(toSeconds);
        expect(getTickSeconds(0)).toBe(0.137);
        expect(getTickSeconds(0)).toBe(0.137);
        expect(toSeconds).toHaveBeenCalledTimes(1);
      });

      it('never keeps a bad length: the next call at the same time reads again', () => {
        let seconds = NaN;
        const toSeconds = vi.fn(() => seconds);
        initWithToSeconds(toSeconds);
        expect(getTickSeconds(12.5)).toBeUndefined();
        seconds = 0.137;
        expect(getTickSeconds(12.5)).toBe(0.137);
        expect(toSeconds).toHaveBeenCalledTimes(2);
      });

      it('forgets the kept length on reset, so a new transport is read even at the same time', () => {
        initWithToSeconds(() => 0.137);
        expect(getTickSeconds(12.5)).toBe(0.137);
        initWithToSeconds(() => 0.25);
        expect(getTickSeconds(12.5)).toBe(0.25);
      });

      it('is undefined after a reset with no transport, even at a time it kept', () => {
        initWithToSeconds(() => 0.137);
        expect(getTickSeconds(12.5)).toBe(0.137);
        resetBeatClock();
        expect(getTickSeconds(12.5)).toBeUndefined();
      });

      it('leaves an untimed call live: it reads toSeconds every time and sees a tempo change at once', () => {
        let seconds = 0.137;
        const toSeconds = vi.fn(() => seconds);
        initWithToSeconds(toSeconds);
        expect(getTickSeconds(12.5)).toBe(0.137);
        seconds = 0.0625;
        expect(getTickSeconds()).toBe(0.0625);
        expect(getTickSeconds()).toBe(0.0625);
        expect(toSeconds).toHaveBeenCalledTimes(3);
      });

      it('an untimed call does not disturb the length kept for a tick', () => {
        let seconds = 0.137;
        const toSeconds = vi.fn(() => seconds);
        initWithToSeconds(toSeconds);
        expect(getTickSeconds(12.5)).toBe(0.137);
        seconds = 0.0625;
        getTickSeconds();
        expect(getTickSeconds(12.5)).toBe(0.137);
        expect(toSeconds).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('getCurrentMeasurePrecise', () => {
    it('is getCurrentBeat() / 4 — the continuous, sub-measure-precision measure position', () => {
      mockTransport.position = '2:1:2';
      callbacks[0]?.();
      expect(getCurrentMeasurePrecise()).toBeCloseTo(getCurrentBeat() / 4);
      expect(getCurrentMeasurePrecise()).toBeCloseTo(2.375); // 2 measures + 1 beat + 2 sixteenths, in measures
    });

    it('advances smoothly between measure boundaries, unlike getCurrentMeasure()', () => {
      mockTransport.position = '5:0:0';
      callbacks[0]?.();
      expect(getCurrentMeasure()).toBe(5);
      expect(getCurrentMeasurePrecise()).toBeCloseTo(5);

      mockTransport.position = '5:2:0'; // halfway through measure 5 — no measure-boundary crossed
      callbacks[0]?.();
      expect(getCurrentMeasure()).toBe(5); // unchanged — still mid-measure
      expect(getCurrentMeasurePrecise()).toBeCloseTo(5.5); // precise value still moved
    });

    it('is monotonic, like getCurrentMeasure() — nothing wraps it', () => {
      mockTransport.position = '97:1:0';
      callbacks[0]?.();
      expect(getCurrentMeasurePrecise()).toBeCloseTo(97.25);
    });

    it('resets to 0 after resetBeatClock', () => {
      mockTransport.position = '10:2:0';
      callbacks[0]?.();
      resetBeatClock();
      expect(getCurrentMeasurePrecise()).toBe(0);
    });
  });

  it('does not register duplicate schedules when called twice', () => {
    initBeatClock();
    initBeatClock();
    expect(mockTransport.scheduleRepeat).toHaveBeenCalledTimes(1);
  });

  it('passes the real, monotonic measure to listeners — it never wraps', () => {
    const listener = vi.fn();
    subscribeToMeasure(listener);

    mockTransport.position = '95:0:0';
    callbacks[0]?.();
    expect(listener).toHaveBeenLastCalledWith(95);

    mockTransport.position = '96:0:0';
    callbacks[0]?.();
    expect(listener).toHaveBeenLastCalledWith(96);

    mockTransport.position = '1247:3:0';
    callbacks[0]?.();
    expect(listener).toHaveBeenLastCalledWith(1247);
    expect(listener).toHaveBeenLastCalledWith(getCurrentMeasure());
  });

  it('notifies once per measure, not once per 16n tick', () => {
    const listener = vi.fn();
    subscribeToMeasure(listener);

    mockTransport.position = '3:0:0';
    callbacks[0]?.();
    mockTransport.position = '3:2:0';
    callbacks[0]?.();
    expect(listener).toHaveBeenCalledTimes(1);

    mockTransport.position = '4:0:0';
    callbacks[0]?.();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('isolates listener errors so one throwing subscriber does not block others', () => {
    const throwing = vi.fn(() => {
      throw new Error('boom');
    });
    const safe = vi.fn();
    subscribeToMeasure(throwing);
    subscribeToMeasure(safe);

    mockTransport.position = '1:0:0';
    expect(() => callbacks[0]?.()).not.toThrow();
    expect(throwing).toHaveBeenCalled();
    expect(safe).toHaveBeenCalledWith(1);
  });

  describe('parseTransportPosition', () => {
    it('parses standard transport position strings', () => {
      expect(parseTransportPosition('2:1:2')).toEqual({ measure: 2, beat: 1, sixteenths: 2 });
    });

    it('returns zeros for empty or invalid inputs', () => {
      expect(parseTransportPosition('')).toEqual({ measure: 0, beat: 0, sixteenths: 0 });
      expect(parseTransportPosition(undefined)).toEqual({ measure: 0, beat: 0, sixteenths: 0 });
    });

    it('parses numeric input by treating it as measure only', () => {
      expect(parseTransportPosition(42)).toEqual({ measure: 42, beat: 0, sixteenths: 0 });
    });
  });

  it('scheduleRepeat registers with transport and returns a schedule id', () => {
    const cb = vi.fn();
    const id = scheduleRepeat('4m', cb);
    expect(id).toMatch(/^schedule-/);
    expect(mockTransport.scheduleRepeat).toHaveBeenCalledWith(expect.any(Function), '4m', '4m');
  });

  it('cancelSchedule calls transport.clear and removes the entry', () => {
    const cb = vi.fn();
    const id = scheduleRepeat('4m', cb);
    cancelSchedule(id);
    expect(mockTransport.clear).toHaveBeenCalledWith(expect.anything());
  });

  it('cancelSchedule does nothing for an unknown id', () => {
    cancelSchedule('unknown-id');
    expect(mockTransport.clear).not.toHaveBeenCalled();
  });

  it('promotes pending schedules registered before init', () => {
    // Use resetBeatClock to simulate the pre-init state within the describe scope
    resetBeatClock();
    mockTransport.scheduleRepeat.mockClear();
    callbacks.length = 0;

    const cb = vi.fn();
    scheduleRepeat('4m', cb);
    // No transport yet — must NOT have called mockTransport.scheduleRepeat
    expect(mockTransport.scheduleRepeat).not.toHaveBeenCalled();

    // Init: should register 16n tick (1) + promote pending '4m' (1) = 2 calls
    initBeatClock(mockTransport);
    expect(mockTransport.scheduleRepeat).toHaveBeenCalledTimes(2);
    expect(mockTransport.scheduleRepeat).toHaveBeenCalledWith(expect.any(Function), '4m', '4m');
  });

  // BeatClock Transport time T7 (docs/specs/BEATCLOCK_TRANSPORT_TIME.md §5.1 item 1): the wrapper forwards the
  // audio-clock time the Transport hands each tick, so a consumer can place its writes on the beat.
  describe('scheduleRepeat forwards the Transport time', () => {
    it('a callback registered after init receives the time the transport passes, as its only argument', () => {
      const cb = vi.fn();
      scheduleRepeat('4m', cb);
      callbacks[callbacks.length - 1](7.75);
      expect(cb.mock.calls).toEqual([[7.75]]);
    });

    it('each tick receives its own time', () => {
      const cb = vi.fn();
      scheduleRepeat('16n', cb);
      const tick = callbacks[callbacks.length - 1];
      tick(1.5);
      tick(1.625);
      expect(cb.mock.calls).toEqual([[1.5], [1.625]]);
    });

    it('a time of 0 arrives as 0', () => {
      const cb = vi.fn();
      scheduleRepeat('4m', cb);
      callbacks[callbacks.length - 1](0);
      expect(cb.mock.calls).toEqual([[0]]);
    });

    it('a callback queued before init and promoted by initBeatClock receives the time the same way', () => {
      resetBeatClock();
      mockTransport.scheduleRepeat.mockClear();
      callbacks.length = 0;
      const cb = vi.fn();
      scheduleRepeat('4m', cb);
      initBeatClock(mockTransport);
      // callbacks[0] is the internal 16n tick; [1] is the promoted '4m' schedule.
      expect(callbacks).toHaveLength(2);
      callbacks[1](12.25);
      expect(cb.mock.calls).toEqual([[12.25]]);
    });

    it('two schedules each get the time of their own tick', () => {
      const a = vi.fn();
      const b = vi.fn();
      scheduleRepeat('4m', a);
      scheduleRepeat('2m', b);
      callbacks[callbacks.length - 2](4);
      callbacks[callbacks.length - 1](2);
      expect(a.mock.calls).toEqual([[4]]);
      expect(b.mock.calls).toEqual([[2]]);
    });

    it('a cancelled schedule is cleared from the transport, so it hears no more ticks', () => {
      const cb = vi.fn();
      const id = scheduleRepeat('4m', cb);
      cancelSchedule(id);
      expect(mockTransport.clear).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetBeatClock', () => {
    it('zeroes counters after reset', () => {
      mockTransport.position = '4:2:0';
      callbacks[0]?.();
      expect(getCurrentMeasure()).toBe(4);
      resetBeatClock();
      expect(getCurrentMeasure()).toBe(0);
      expect(getCurrentBeat()).toBe(0);
    });

    it('calls transport.clear with the internal tick id on reset', () => {
      mockTransport.clear.mockClear();
      resetBeatClock();
      expect(mockTransport.clear).toHaveBeenCalledWith('repeat-id');
    });

    it('clears measure listeners so they no longer fire after re-init', () => {
      const listener = vi.fn();
      subscribeToMeasure(listener);
      resetBeatClock();
      initBeatClock(mockTransport);
      mockTransport.position = '1:0:0';
      callbacks[callbacks.length - 1]?.();
      expect(listener).not.toHaveBeenCalled();
    });

    it('allows re-initialization to register a new tick', () => {
      resetBeatClock();
      mockTransport.scheduleRepeat.mockClear();
      callbacks.length = 0;
      initBeatClock(mockTransport);
      expect(mockTransport.scheduleRepeat).toHaveBeenCalledTimes(1);
    });
  });
});
