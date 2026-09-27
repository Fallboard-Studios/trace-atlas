import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DriftGroupId, LfoTargetId } from '../types/lfo';

// ========================================
// MOCKS
// ========================================
// Reuses the exact simulateSignalConnect/LFO/Gain shapes lfoEngine.test.ts
// already establishes for this codebase's Tone-mocking convention, sized
// down to only what lfoDrift.ts itself touches (LFO, Gain, getContext — no
// Transport/beatClock/AudioEngine, none of which this module imports).
const fakeParamMarker = Symbol('fakeParamMarker');

function simulateSignalConnect(dest: unknown): void {
  if (dest && typeof dest === 'object' && 'value' in dest) {
    const d = dest as { value: number; override?: boolean };
    const isParamLike = fakeParamMarker in (d as object);
    if (isParamLike || d.override !== false) {
      d.value = 0;
    }
  }
}

let mockContextState: 'running' | 'suspended' = 'running';

vi.mock('tone', () => ({
  LFO: vi.fn((arg?: number | { frequency?: number; type?: string; phase?: number }) => {
    const isOptionsObject = typeof arg === 'object' && arg !== null;
    const freqValue = isOptionsObject ? (arg.frequency ?? 1) : (arg ?? 1);
    const instance = {
      frequency: { value: freqValue, override: true },
      amplitude: { value: 1, [fakeParamMarker]: true },
      type: isOptionsObject ? (arg.type ?? 'sine') : 'sine',
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
  getContext: vi.fn(() => ({ get state() { return mockContextState; } })),
}));

// ========================================
// HELPERS
// ========================================

/** A minimal fake "primary" LFO — attachDrift never constructs the primary
 *  itself (it's caller-supplied, mirroring lfoEngine.ts's real usage), so a
 *  plain object with the two fields lfoDrift.ts actually reads/writes
 *  (frequency: Signal-like, amplitude: Param-like) is enough — it never
 *  needs to come from the mocked Tone.LFO constructor. */
function fakePrimaryLfo(frequencyValue = 1, amplitudeValue = 1) {
  return {
    frequency: { value: frequencyValue, override: true },
    amplitude: { value: amplitudeValue, [fakeParamMarker]: true },
  };
}

interface MockGainInstance {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

/** Re-imports lfoDrift.ts fresh (module-scoped Maps reset) after
 *  vi.resetModules() — the same pattern lfoEngine.test.ts uses, since the
 *  mocked Tone.LFO/Gain constructors' own mock.calls keep accumulating
 *  across the whole file regardless (only the module-under-test's internal
 *  state resets). */
async function freshLfoDrift() {
  vi.resetModules();
  return import('./lfoDrift');
}

async function lfoCtor() {
  const Tone = await import('tone');
  return Tone.LFO as unknown as ReturnType<typeof vi.fn>;
}

async function gainCtor() {
  const Tone = await import('tone');
  return Tone.Gain as unknown as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  mockContextState = 'running';
});

// ========================================
// TESTS
// ========================================

describe('driftGroupForTarget', () => {
  it('routes eq3./lpf./hpf.-prefixed targets to their own group, everything else to robots', async () => {
    const { driftGroupForTarget } = await freshLfoDrift();
    expect(driftGroupForTarget('eq3.low' as LfoTargetId)).toBe('eq3');
    expect(driftGroupForTarget('lpf.frequency' as LfoTargetId)).toBe('filterLPF');
    expect(driftGroupForTarget('hpf.frequency' as LfoTargetId)).toBe('filterHPF');
    expect(driftGroupForTarget('robot-1.volume' as LfoTargetId)).toBe('robots');
  });
});

describe('attachDrift / detachDrift', () => {
  it('creates a link on a fresh key — a subsequent refresh call succeeds without throwing', async () => {
    const { attachDrift, refreshRateDriftGain, refreshDepthDriftGain } = await freshLfoDrift();
    const primary = fakePrimaryLfo();
    expect(() => attachDrift('key-1', primary as never, 'eq3')).not.toThrow();
    expect(() => refreshRateDriftGain('key-1')).not.toThrow();
    expect(() => refreshDepthDriftGain('key-1')).not.toThrow();
  });

  it('is idempotent — attaching the same key twice does not create a second link (no second pair of drift Gains)', async () => {
    const { attachDrift } = await freshLfoDrift();
    const Gain = await gainCtor();
    const primary = fakePrimaryLfo();

    attachDrift('key-1', primary as never, 'eq3');
    const gainCallsAfterFirst = Gain.mock.calls.length;
    attachDrift('key-1', primary as never, 'eq3');
    const gainCallsAfterSecond = Gain.mock.calls.length;

    // A second attachDrift for the same key must not construct a fresh
    // rateDriftGain/depthDriftGain pair — that would leak the original two
    // (never disconnected/disposed) and silently orphan the driftLinks entry.
    expect(gainCallsAfterSecond).toBe(gainCallsAfterFirst);
  });

  it('detachDrift on an unlinked key is a safe no-op', async () => {
    const { detachDrift } = await freshLfoDrift();
    expect(() => detachDrift('never-attached')).not.toThrow();
  });

  it('detachDrift on a linked key disconnects and disposes both Gains and removes the key', async () => {
    const { attachDrift, detachDrift, refreshRateDriftGain } = await freshLfoDrift();
    const Gain = await gainCtor();
    const primary = fakePrimaryLfo();

    attachDrift('key-1', primary as never, 'eq3');
    const rateDriftGain = Gain.mock.results.at(-2)!.value as MockGainInstance;
    const depthDriftGain = Gain.mock.results.at(-1)!.value as MockGainInstance;

    detachDrift('key-1');

    expect(rateDriftGain.disconnect).toHaveBeenCalled();
    expect(rateDriftGain.dispose).toHaveBeenCalled();
    expect(depthDriftGain.disconnect).toHaveBeenCalled();
    expect(depthDriftGain.dispose).toHaveBeenCalled();

    // The key is gone — refreshing it again is a no-op, not a re-creation.
    const gainCallsBefore = Gain.mock.calls.length;
    expect(() => refreshRateDriftGain('key-1')).not.toThrow();
    expect(Gain.mock.calls.length).toBe(gainCallsBefore);
  });
});

describe('refreshDepthDriftGain — silence guard', () => {
  it('leaves depthDriftConnected false (and disconnects if previously connected) when amplitude is 0', async () => {
    const { attachDrift, refreshDepthDriftGain, setGlobalDepthDrift } = await freshLfoDrift();
    const Gain = await gainCtor();

    // Start with a nonzero amplitude so depthDriftGain connects once...
    const primary = fakePrimaryLfo(1, 0.5);
    attachDrift('key-1', primary as never, 'eq3');
    setGlobalDepthDrift('eq3', 1);
    const depthDriftGain = Gain.mock.results.at(-1)!.value as MockGainInstance;
    expect(depthDriftGain.connect).toHaveBeenCalled();
    const connectCallsWhileAudible = depthDriftGain.connect.mock.calls.length;

    // ...then drop amplitude to 0 and refresh: must disconnect, no throw.
    primary.amplitude.value = 0;
    expect(() => refreshDepthDriftGain('key-1')).not.toThrow();
    expect(depthDriftGain.disconnect).toHaveBeenCalled();
    // No new connect call was made while silenced.
    expect(depthDriftGain.connect.mock.calls.length).toBe(connectCallsWhileAudible);
  });

  it('connects lazily only on the 0-to-nonzero transition, and scales by globalDepthDriftByGroup * swing.max', async () => {
    const { attachDrift, refreshDepthDriftGain, setGlobalDepthDrift } = await freshLfoDrift();
    const Gain = await gainCtor();

    const primary = fakePrimaryLfo(1, 0); // starts silent
    attachDrift('key-1', primary as never, 'eq3');
    const depthDriftGain = Gain.mock.results.at(-1)!.value as MockGainInstance;
    expect(depthDriftGain.connect).not.toHaveBeenCalled();

    // Rises above 0 — connects now, once.
    primary.amplitude.value = 0.4; // range [0,1] -> distanceToMin=0.4, distanceToMax=0.6 -> halfSpan=0.4
    setGlobalDepthDrift('eq3', 0.5);
    expect(depthDriftGain.connect).toHaveBeenCalledTimes(1);
    expect(depthDriftGain.gain.value).toBeCloseTo(0.5 * 0.4);

    // Refreshing again while still audible does not reconnect a second time.
    refreshDepthDriftGain('key-1');
    expect(depthDriftGain.connect).toHaveBeenCalledTimes(1);
  });
});

describe('setGlobalRateDrift / setGlobalDepthDrift', () => {
  it('clamps to [-1, 1]', async () => {
    const { attachDrift, setGlobalRateDrift } = await freshLfoDrift();
    const Gain = await gainCtor();
    const primary = fakePrimaryLfo(50, 1); // range [0.1, 20] centered swing math not exercised here beyond scaling

    attachDrift('key-1', primary as never, 'robots');
    const rateDriftGain = Gain.mock.results.at(-2)!.value as MockGainInstance;

    setGlobalRateDrift('robots', 5); // clamps to 1
    const valueAtClampedHigh = rateDriftGain.gain.value;
    setGlobalRateDrift('robots', 1); // same as clamped 5
    expect(rateDriftGain.gain.value).toBe(valueAtClampedHigh);

    setGlobalRateDrift('robots', -5); // clamps to -1
    const valueAtClampedLow = rateDriftGain.gain.value;
    setGlobalRateDrift('robots', -1);
    expect(rateDriftGain.gain.value).toBe(valueAtClampedLow);
  });

  it('only refreshes links belonging to the given group — other groups are untouched', async () => {
    const { attachDrift, setGlobalRateDrift } = await freshLfoDrift();
    const Gain = await gainCtor();

    const primaryEq3 = fakePrimaryLfo(1, 1);
    const primaryRobots = fakePrimaryLfo(1, 1);
    attachDrift('eq3-key', primaryEq3 as never, 'eq3');
    attachDrift('robots-key', primaryRobots as never, 'robots');

    const eq3RateGain = Gain.mock.results.at(-4)!.value as MockGainInstance; // eq3 attach: rate, depth
    const robotsRateGain = Gain.mock.results.at(-2)!.value as MockGainInstance; // robots attach: rate, depth

    setGlobalRateDrift('robots', 0.7);

    expect(robotsRateGain.gain.value).not.toBe(0);
    expect(eq3RateGain.gain.value).toBe(0); // untouched — eq3's own drift amount is still its default 0
  });

  it('is a safe no-op with zero primaries connected in the target group', async () => {
    const { setGlobalRateDrift, setGlobalDepthDrift } = await freshLfoDrift();
    expect(() => setGlobalRateDrift('filterLPF', 0.5)).not.toThrow();
    expect(() => setGlobalDepthDrift('filterHPF', -0.5)).not.toThrow();
  });
});

describe('setDriftSuppressed / isDriftSuppressed', () => {
  it('defaults to not suppressed', async () => {
    const { isDriftSuppressed } = await freshLfoDrift();
    expect(isDriftSuppressed()).toBe(false);
  });

  it('suppressing detaches every existing link', async () => {
    const { attachDrift, setDriftSuppressed } = await freshLfoDrift();
    const Gain = await gainCtor();
    const primary = fakePrimaryLfo();
    attachDrift('key-1', primary as never, 'eq3');
    const rateDriftGain = Gain.mock.results.at(-2)!.value as MockGainInstance;

    setDriftSuppressed(true);

    expect(rateDriftGain.disconnect).toHaveBeenCalled();
    expect(rateDriftGain.dispose).toHaveBeenCalled();
  });

  it('attachDrift is a no-op while suppressed — no link, no pool build', async () => {
    const { attachDrift, setDriftSuppressed, refreshRateDriftGain } = await freshLfoDrift();
    const LFO = await lfoCtor();
    setDriftSuppressed(true);

    const callsBefore = LFO.mock.calls.length;
    attachDrift('key-1', fakePrimaryLfo() as never, 'eq3');
    expect(LFO.mock.calls.length).toBe(callsBefore); // no pool built

    // No link was created — refresh is a no-op.
    expect(() => refreshRateDriftGain('key-1')).not.toThrow();
  });

  it('restoring (false) only clears the flag — it does not itself re-attach anything', async () => {
    const { attachDrift, setDriftSuppressed, isDriftSuppressed } = await freshLfoDrift();
    const LFO = await lfoCtor();
    setDriftSuppressed(true);
    attachDrift('key-1', fakePrimaryLfo() as never, 'eq3'); // no-op while suppressed
    const callsBeforeRestore = LFO.mock.calls.length;

    setDriftSuppressed(false);

    expect(isDriftSuppressed()).toBe(false);
    expect(LFO.mock.calls.length).toBe(callsBeforeRestore); // nothing re-attached automatically
  });
});

describe('drift pool lazy construction and reuse', () => {
  it('builds a group pool lazily on first attachDrift and reuses it (not rebuilt) on a second attach in the same group', async () => {
    const { attachDrift } = await freshLfoDrift();
    const LFO = await lfoCtor();

    const callsBefore = LFO.mock.calls.length;
    attachDrift('key-1', fakePrimaryLfo() as never, 'eq3'); // DRIFT_POOL_SIZE.eq3 === 3
    const callsAfterFirst = LFO.mock.calls.length - callsBefore;
    expect(callsAfterFirst).toBe(3);

    attachDrift('key-2', fakePrimaryLfo() as never, 'eq3');
    const callsAfterSecond = LFO.mock.calls.length - callsBefore;
    // Reused, not rebuilt — still only the original 3 pool oscillators total.
    expect(callsAfterSecond).toBe(3);
  });

  it('sizes each group pool independently (filterLPF and filterHPF each build 2, robots builds 8)', async () => {
    const { attachDrift } = await freshLfoDrift();
    const LFO = await lfoCtor();

    const before = LFO.mock.calls.length;
    attachDrift('lpf-key', fakePrimaryLfo() as never, 'filterLPF' as DriftGroupId);
    const afterLpf = LFO.mock.calls.length - before;
    expect(afterLpf).toBe(2);

    attachDrift('hpf-key', fakePrimaryLfo() as never, 'filterHPF' as DriftGroupId);
    const afterHpf = LFO.mock.calls.length - before - afterLpf;
    expect(afterHpf).toBe(2);

    attachDrift('robots-key', fakePrimaryLfo() as never, 'robots' as DriftGroupId);
    const afterRobots = LFO.mock.calls.length - before - afterLpf - afterHpf;
    expect(afterRobots).toBe(8);
  });
});
