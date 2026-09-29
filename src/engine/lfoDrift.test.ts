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
  it('routes every eq3./lpf./hpf.-prefixed target to the merged globalFx group (docs/specs/FLEET_DRIFT_CONSOLIDATION.md — eq3/filterLPF/filterHPF merged)', async () => {
    const { driftGroupForTarget } = await freshLfoDrift();
    expect(driftGroupForTarget('eq3.low' as LfoTargetId)).toBe('globalFx');
    expect(driftGroupForTarget('eq3.mid' as LfoTargetId)).toBe('globalFx');
    expect(driftGroupForTarget('eq3.high' as LfoTargetId)).toBe('globalFx');
    expect(driftGroupForTarget('lpf.frequency' as LfoTargetId)).toBe('globalFx');
    expect(driftGroupForTarget('lpf.Q' as LfoTargetId)).toBe('globalFx');
    expect(driftGroupForTarget('hpf.frequency' as LfoTargetId)).toBe('globalFx');
    expect(driftGroupForTarget('hpf.Q' as LfoTargetId)).toBe('globalFx');
  });

  it('routes every non-global-chain target to robots, unchanged', async () => {
    const { driftGroupForTarget } = await freshLfoDrift();
    expect(driftGroupForTarget('robot-1.volume' as LfoTargetId)).toBe('robots');
    expect(driftGroupForTarget('layer0.gain' as LfoTargetId)).toBe('robots');
  });
});

describe('attachDrift / detachDrift', () => {
  it('creates a link on a fresh key — a subsequent refresh call succeeds without throwing', async () => {
    const { attachDrift, refreshRateDriftGain, refreshDepthDriftGain } = await freshLfoDrift();
    const primary = fakePrimaryLfo();
    expect(() => attachDrift('key-1', primary as never, 'globalFx')).not.toThrow();
    expect(() => refreshRateDriftGain('key-1')).not.toThrow();
    expect(() => refreshDepthDriftGain('key-1')).not.toThrow();
  });

  it('is idempotent — attaching the same key twice does not create a second link (no second pair of drift Gains)', async () => {
    const { attachDrift } = await freshLfoDrift();
    const Gain = await gainCtor();
    const primary = fakePrimaryLfo();

    attachDrift('key-1', primary as never, 'globalFx');
    const gainCallsAfterFirst = Gain.mock.calls.length;
    attachDrift('key-1', primary as never, 'globalFx');
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

    attachDrift('key-1', primary as never, 'globalFx');
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
    attachDrift('key-1', primary as never, 'globalFx');
    setGlobalDepthDrift('globalFx', 1);
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
    attachDrift('key-1', primary as never, 'globalFx');
    const depthDriftGain = Gain.mock.results.at(-1)!.value as MockGainInstance;
    expect(depthDriftGain.connect).not.toHaveBeenCalled();

    // Rises above 0 — connects now, once.
    primary.amplitude.value = 0.4; // range [0,1] -> distanceToMin=0.4, distanceToMax=0.6 -> halfSpan=0.4
    setGlobalDepthDrift('globalFx', 0.5);
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

  it('only refreshes links belonging to the given group — the other group is untouched (2-way cross-group isolation)', async () => {
    const { attachDrift, setGlobalRateDrift } = await freshLfoDrift();
    const Gain = await gainCtor();

    const primaryGlobalFx = fakePrimaryLfo(1, 1);
    const primaryRobots = fakePrimaryLfo(1, 1);
    attachDrift('globalfx-key', primaryGlobalFx as never, 'globalFx');
    attachDrift('robots-key', primaryRobots as never, 'robots');

    const globalFxRateGain = Gain.mock.results.at(-4)!.value as MockGainInstance; // globalFx attach: rate, depth
    const robotsRateGain = Gain.mock.results.at(-2)!.value as MockGainInstance; // robots attach: rate, depth

    setGlobalRateDrift('robots', 0.7);

    expect(robotsRateGain.gain.value).not.toBe(0);
    expect(globalFxRateGain.gain.value).toBe(0); // untouched — globalFx's own drift amount is still its default 0
  });

  it('only refreshes links belonging to the given group, the other direction — setting globalFx never touches robots', async () => {
    const { attachDrift, setGlobalDepthDrift } = await freshLfoDrift();
    const Gain = await gainCtor();

    // amplitude 0.5 (not 1) — depth's swing headroom is bounded by distance to the
    // nearer edge of [0,1], so a primary parked at amplitude 1 gets zero swing
    // (matching centeredSwingFromRange's documented boundary behavior) and would
    // read 0 regardless of the group amount, making the isolation assertion vacuous.
    const primaryGlobalFx = fakePrimaryLfo(1, 0.5);
    const primaryRobots = fakePrimaryLfo(1, 0.5);
    attachDrift('globalfx-key', primaryGlobalFx as never, 'globalFx');
    attachDrift('robots-key', primaryRobots as never, 'robots');

    const globalFxDepthGain = Gain.mock.results.at(-3)!.value as MockGainInstance; // globalFx attach: rate, depth
    const robotsDepthGain = Gain.mock.results.at(-1)!.value as MockGainInstance; // robots attach: rate, depth

    setGlobalDepthDrift('globalFx', 0.7);

    expect(globalFxDepthGain.gain.value).not.toBe(0);
    expect(robotsDepthGain.gain.value).toBe(0); // untouched — robots' own drift amount is still its default 0
  });

  it('the merge itself: a former-eq3, a former-filterLPF, and a former-filterHPF target all land in the SAME globalFx pool and respond identically to one setGlobalRateDrift call (docs/specs/FLEET_DRIFT_CONSOLIDATION.md §5 item 4)', async () => {
    const { attachDrift, driftGroupForTarget, setGlobalRateDrift } = await freshLfoDrift();
    const Gain = await gainCtor();

    const primaryEq = fakePrimaryLfo(1, 1);
    const primaryLpf = fakePrimaryLfo(1, 1);
    const primaryHpf = fakePrimaryLfo(1, 1);
    attachDrift('eq-key', primaryEq as never, driftGroupForTarget('eq3.low' as LfoTargetId));
    attachDrift('lpf-key', primaryLpf as never, driftGroupForTarget('lpf.frequency' as LfoTargetId));
    attachDrift('hpf-key', primaryHpf as never, driftGroupForTarget('hpf.Q' as LfoTargetId));

    const eqRateGain = Gain.mock.results.at(-6)!.value as MockGainInstance;
    const lpfRateGain = Gain.mock.results.at(-4)!.value as MockGainInstance;
    const hpfRateGain = Gain.mock.results.at(-2)!.value as MockGainInstance;

    setGlobalRateDrift('globalFx', 0.6);

    expect(eqRateGain.gain.value).toBe(lpfRateGain.gain.value);
    expect(lpfRateGain.gain.value).toBe(hpfRateGain.gain.value);
    expect(eqRateGain.gain.value).not.toBe(0);
  });

  it('is a safe no-op with zero primaries connected in the target group', async () => {
    const { setGlobalRateDrift, setGlobalDepthDrift } = await freshLfoDrift();
    expect(() => setGlobalRateDrift('globalFx', 0.5)).not.toThrow();
    expect(() => setGlobalDepthDrift('robots', -0.5)).not.toThrow();
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
    attachDrift('key-1', primary as never, 'globalFx');
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
    attachDrift('key-1', fakePrimaryLfo() as never, 'globalFx');
    expect(LFO.mock.calls.length).toBe(callsBefore); // no pool built

    // No link was created — refresh is a no-op.
    expect(() => refreshRateDriftGain('key-1')).not.toThrow();
  });

  it('restoring (false) only clears the flag — it does not itself re-attach anything', async () => {
    const { attachDrift, setDriftSuppressed, isDriftSuppressed } = await freshLfoDrift();
    const LFO = await lfoCtor();
    setDriftSuppressed(true);
    attachDrift('key-1', fakePrimaryLfo() as never, 'globalFx'); // no-op while suppressed
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
    attachDrift('key-1', fakePrimaryLfo() as never, 'globalFx'); // DRIFT_POOL_SIZE.globalFx === 7
    const callsAfterFirst = LFO.mock.calls.length - callsBefore;
    expect(callsAfterFirst).toBe(7);

    attachDrift('key-2', fakePrimaryLfo() as never, 'globalFx');
    const callsAfterSecond = LFO.mock.calls.length - callsBefore;
    // Reused, not rebuilt — still only the original 7 pool oscillators total.
    expect(callsAfterSecond).toBe(7);
  });

  it('sizes each group pool independently (globalFx builds 7, robots builds 8) — never exceeding either ceiling regardless of how many targets in the OTHER group have connected', async () => {
    const { attachDrift } = await freshLfoDrift();
    const LFO = await lfoCtor();

    const before = LFO.mock.calls.length;
    attachDrift('eq-key', fakePrimaryLfo() as never, 'globalFx' as DriftGroupId);
    const afterGlobalFx = LFO.mock.calls.length - before;
    expect(afterGlobalFx).toBe(7);

    attachDrift('robots-key', fakePrimaryLfo() as never, 'robots' as DriftGroupId);
    const afterRobots = LFO.mock.calls.length - before - afterGlobalFx;
    expect(afterRobots).toBe(8);

    // A 2nd/3rd globalFx attach never grows its pool past 7, even after robots' own pool exists.
    attachDrift('lpf-key', fakePrimaryLfo() as never, 'globalFx' as DriftGroupId);
    attachDrift('hpf-key', fakePrimaryLfo() as never, 'globalFx' as DriftGroupId);
    const totalAfterMore = LFO.mock.calls.length - before;
    expect(totalAfterMore).toBe(7 + 8);
  });

  it('does not construct the globalFx pool until globalFx\'s own first successful attach — connecting robots first never builds it', async () => {
    const { attachDrift } = await freshLfoDrift();
    const LFO = await lfoCtor();

    const before = LFO.mock.calls.length;
    attachDrift('robots-key', fakePrimaryLfo() as never, 'robots');
    const afterRobotsOnly = LFO.mock.calls.length - before;
    expect(afterRobotsOnly).toBe(8); // only robots' own pool, not globalFx's
  });
});
