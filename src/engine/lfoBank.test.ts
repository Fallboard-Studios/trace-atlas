import { describe, it, expect, beforeEach, vi } from 'vitest';

// ========================================
// MOCKS
// ========================================
// Mirrors lfoEngine.test.ts's own Tone mock (docs/tasks/LFO_BANK.md Task 7) —
// this file gets its own copy rather than importing the other test file's
// helpers, matching lfoBank.ts's own "imports nothing from lfoEngine.ts" rule
// (Task 16 is what folds the two together, not this task).
let mockContextState: 'running' | 'suspended' = 'suspended';
let mockToneNow = 0;

/** Tags a fake destination object as "Param-like" (no override escape hatch — always resets on connect),
 *  distinct from a Signal-like object (resets only while its own override flag is still true). */
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

vi.mock('tone', () => ({
  LFO: vi.fn((arg?: number | { frequency?: number; type?: string; phase?: number }) => {
    const isOptionsObject = typeof arg === 'object' && arg !== null;
    const freqValue = isOptionsObject ? (arg.frequency ?? 1) : (arg ?? 1);
    const instance = {
      frequency: { value: freqValue, override: true },
      amplitude: { value: 1, [fakeParamMarker]: true },
      type: isOptionsObject ? (arg.type ?? 'sine') : 'sine',
      phase: isOptionsObject ? (arg.phase ?? 0) : 0,
      min: 0,
      max: 1,
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
      // A real Tone.Gain's .gain is a Tone.Param — tagged fakeParamMarker like lfoDrift.ts's
      // own Gain mocks, so a Signal/Param connected INTO it (depth-drift -> trunk.gain) simulates
      // the real always-resets-on-connect Param behavior.
      gain: { value: value ?? 1, [fakeParamMarker]: true },
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
  now: vi.fn(() => mockToneNow),
}));

vi.mock('./AudioEngine', () => ({
  AudioEngine: {
    getRobotModulationTarget: vi.fn(),
    getGlobalModulationTarget: vi.fn(),
  },
}));

// ========================================
// HELPERS
// ========================================

interface MockLfoInstance {
  frequency: { value: number; override?: boolean };
  amplitude: { value: number };
  type: string;
  phase: number;
  min: number;
  max: number;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

interface MockGainInstance {
  gain: { value: number };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
}

// NOTE: like lfoEngine.test.ts's own Tone mock, the 'tone' module mock is hoisted once for this
// whole file — vi.resetModules() in beforeEach gives lfoBank.ts a fresh module instance (fresh
// internal Maps), but Tone.LFO/Tone.Gain's own mock.calls/mock.results keep accumulating across
// every test in the file. Every helper below is written against a count DELTA or the single
// most-recently-constructed instance — never an absolute count or a fixed array index.

async function lfoConstructCount(): Promise<number> {
  const Tone = await import('tone');
  return (Tone.LFO as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
}

async function gainConstructCount(): Promise<number> {
  const Tone = await import('tone');
  return (Tone.Gain as unknown as ReturnType<typeof vi.fn>).mock.calls.length;
}

async function latestGainInstance(): Promise<MockGainInstance> {
  const Tone = await import('tone');
  const ctor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
  return ctor.mock.results[ctor.mock.results.length - 1].value;
}

/** Every LFO/Gain instance constructed strictly after the given counts — this test's own instances only. */
async function instancesSince(before: { lfo: number; gain: number }): Promise<{ lfo: MockLfoInstance[]; gain: MockGainInstance[] }> {
  const Tone = await import('tone');
  const lfoCtor = Tone.LFO as unknown as ReturnType<typeof vi.fn>;
  const gainCtor = Tone.Gain as unknown as ReturnType<typeof vi.fn>;
  return {
    lfo: lfoCtor.mock.results.slice(before.lfo).map((r) => r.value as MockLfoInstance),
    gain: gainCtor.mock.results.slice(before.gain).map((r) => r.value as MockGainInstance),
  };
}

async function captureCounts(): Promise<{ lfo: number; gain: number }> {
  return { lfo: await lfoConstructCount(), gain: await gainConstructCount() };
}

/** A minimal fake Signal-like destination — override defaults true, matching Tone.Signal's real default. */
function fakeSignal(value = 0): { value: number; override: boolean } {
  return { value, override: true };
}

/** A minimal fake Param-like destination — no override field at all, matching Tone.Param's real shape. */
function fakeParam(value = 0): { value: number; [fakeParamMarker]: true } {
  return { value, [fakeParamMarker]: true };
}

interface LaneNodeSet {
  lfo: MockLfoInstance;
  drift: MockLfoInstance;
  trunk: MockGainInstance;
  rateDriftGain: MockGainInstance;
  depthDriftGain: MockGainInstance;
}

interface PrimedBank {
  lfoEngine: typeof import('./lfoBank').lfoEngine;
  /** This call's own 8 LFO / 12 Gain instances, in construction order — isolated from any earlier test's accumulated history. */
  lfoInstances: MockLfoInstance[];
  gainInstances: MockGainInstance[];
  /** This call's own per-lane node set, sliced from the construction order documented in lfoBank.ts's
   *  primeLfoBank: per lane, LFO(lfo) then Gain(trunk) then LFO(drift) then Gain(rate) then Gain(depth). */
  lanes: Record<string, LaneNodeSet>;
}

async function primeBankRunning(settings?: Partial<Record<string, unknown>>): Promise<PrimedBank> {
  const { DEFAULT_BANK_LFO } = await import('../data/lfoConfig');
  const { LFO_LANE_IDS } = await import('../types/lfo');
  const { lfoEngine } = await import('./lfoBank');
  mockContextState = 'running';
  const before = await captureCounts();
  const full = Object.fromEntries(LFO_LANE_IDS.map((lane) => [lane, { ...DEFAULT_BANK_LFO, ...(settings as Record<string, object> | undefined)?.[lane] }]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lfoEngine.primeLfoBank(full as any);
  const { lfo: lfoInstances, gain: gainInstances } = await instancesSince(before);
  const lanes: Record<string, LaneNodeSet> = {};
  LFO_LANE_IDS.forEach((lane: string, i: number) => {
    lanes[lane] = {
      lfo: lfoInstances[i * 2],
      drift: lfoInstances[i * 2 + 1],
      trunk: gainInstances[i * 3],
      rateDriftGain: gainInstances[i * 3 + 1],
      depthDriftGain: gainInstances[i * 3 + 2],
    };
  });
  return { lfoEngine, lfoInstances, gainInstances, lanes };
}

// ========================================
// TESTS
// ========================================

describe('lfoBank (lfoEngine)', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockContextState = 'suspended';
    mockToneNow = 0;
  });

  describe('primeLfoBank', () => {
    it('does not construct any node before the context is running', async () => {
      const { lfoEngine } = await import('./lfoBank');
      const { DEFAULT_BANK_LFO } = await import('../data/lfoConfig');
      const { LFO_LANE_IDS } = await import('../types/lfo');
      const settings = Object.fromEntries(LFO_LANE_IDS.map((lane) => [lane, DEFAULT_BANK_LFO]));
      const before = await captureCounts();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lfoEngine.primeLfoBank(settings as any);
      expect(await lfoConstructCount()).toBe(before.lfo);
      expect(await gainConstructCount()).toBe(before.gain);
    });

    it('builds exactly 4 lane LFOs, 4 trunk Gains, 4 drift LFOs and 8 drift Gains on the first call', async () => {
      const { lfoInstances, gainInstances } = await primeBankRunning();
      expect(lfoInstances).toHaveLength(8); // 4 lane + 4 drift
      expect(gainInstances).toHaveLength(12); // 4 trunk + 8 drift (rate+depth per lane)
    });

    it('starts each lane LFO at now + MIN_LEAD', async () => {
      const { MIN_LEAD } = await import('../constants');
      mockToneNow = 10;
      const { lfoInstances } = await primeBankRunning();
      expect(lfoInstances).toHaveLength(8);
      for (const instance of lfoInstances) {
        expect(instance.start).toHaveBeenCalledWith(10 + MIN_LEAD);
      }
    });

    it('is a no-op on a second call', async () => {
      const { lfoEngine } = await primeBankRunning();
      const before = { lfo: await lfoConstructCount(), gain: await gainConstructCount() };
      const { DEFAULT_BANK_LFO } = await import('../data/lfoConfig');
      const { LFO_LANE_IDS } = await import('../types/lfo');
      const settings = Object.fromEntries(LFO_LANE_IDS.map((lane) => [lane, DEFAULT_BANK_LFO]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      lfoEngine.primeLfoBank(settings as any);
      expect(await lfoConstructCount()).toBe(before.lfo);
      expect(await gainConstructCount()).toBe(before.gain);
    });
  });

  describe('linkTarget', () => {
    it('creates exactly one Gain per link, connected trunk -> gain -> signal via connectAdditively', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(0); // eq3.low current value 0
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      const before = await gainConstructCount();
      const ok = lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 });
      expect(ok).toBe(true);
      expect(await gainConstructCount()).toBe(before + 1);

      const linkGain = await latestGainInstance();
      expect(linkGain.connect).toHaveBeenCalledWith(signal);
      // override disabled then restored to the pre-connect value (connectAdditively's own contract)
      expect(signal.override).toBe(false);
      expect(signal.value).toBe(0);
    });

    it('computes gain value as depth/100 x the bounded swing (eq3 at 0 in +/-12)', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(0);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 });
      const linkGain = await latestGainInstance();
      expect(linkGain.gain.value).toBe(6); // 0.5 * 12
    });

    it('computes a zero gain when the target sits at the edge of its range (LPF frequency at 20000)', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(20000);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      lfoEngine.linkTarget('lpf.frequency', { lane: 'a', depth: 50 });
      const linkGain = await latestGainInstance();
      expect(linkGain.gain.value).toBe(0);
    });

    it('returns false, never throws, when a robot target is linked without a robotId', async () => {
      const { lfoEngine } = await primeBankRunning();
      expect(() => lfoEngine.linkTarget('layer0.gain', { lane: 'a', depth: 50 })).not.toThrow();
      expect(lfoEngine.linkTarget('layer0.gain', { lane: 'a', depth: 50 })).toBe(false);
    });

    it('returns false, never throws, when no live Signal resolves', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(null);
      expect(lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 })).toBe(false);
    });

    it('returns false when the named lane has not been primed', async () => {
      const { lfoEngine } = await import('./lfoBank'); // never primed — bank is empty
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));
      expect(lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 })).toBe(false);
    });

    it('a second call with the same lane and signal updates gain.value only — no new Gain', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(0);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 });
      const before = await gainConstructCount();
      lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 25 });
      expect(await gainConstructCount()).toBe(before); // no new Gain constructed
      const linkGain = await latestGainInstance();
      expect(linkGain.gain.value).toBe(3); // 0.25 * 12
    });

    it('a lane change disconnects the old gain before the new one connects', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(0);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 });
      const oldGain = await latestGainInstance();
      lfoEngine.linkTarget('eq3.low', { lane: 'b', depth: 50 });
      expect(oldGain.disconnect).toHaveBeenCalled();
      const newGain = await latestGainInstance();
      expect(newGain).not.toBe(oldGain);
      expect(newGain.connect).toHaveBeenCalledWith(signal);
    });

    it('a new Signal object for the same key (a rebuilt voice) is re-wired', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const firstSignal = fakeSignal(0);
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(firstSignal);

      lfoEngine.linkTarget('layer0.gain', { lane: 'a', depth: 50 }, 'r1');
      const oldGain = await latestGainInstance();

      const secondSignal = fakeParam(1);
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(secondSignal);
      lfoEngine.linkTarget('layer0.gain', { lane: 'a', depth: 50 }, 'r1');

      expect(oldGain.disconnect).toHaveBeenCalled();
      const newGain = await latestGainInstance();
      expect(newGain).not.toBe(oldGain);
      expect(newGain.connect).toHaveBeenCalledWith(secondSignal);
    });

    it('lane: null tears the link down', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(0);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 });
      const gain = await latestGainInstance();
      const ok = lfoEngine.linkTarget('eq3.low', { lane: null, depth: 0 });
      expect(ok).toBe(true);
      expect(gain.disconnect).toHaveBeenCalled();
      expect(gain.dispose).toHaveBeenCalled();
    });

    it('unlinkTarget on an unknown key is a no-op', async () => {
      const { lfoEngine } = await primeBankRunning();
      expect(() => lfoEngine.unlinkTarget('eq3.mid')).not.toThrow();
    });

    it('disposeRobotLinks disposes only that robot\'s gains', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getRobotModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeParam(1));

      lfoEngine.linkTarget('layer0.gain', { lane: 'a', depth: 50 }, 'r1');
      const r1Gain = await latestGainInstance();
      lfoEngine.linkTarget('layer0.gain', { lane: 'a', depth: 50 }, 'r2');
      const r2Gain = await latestGainInstance();

      lfoEngine.disposeRobotLinks('r1');
      expect(r1Gain.dispose).toHaveBeenCalled();
      expect(r2Gain.dispose).not.toHaveBeenCalled();
    });
  });

  describe('drift', () => {
    it('setBankRateDrift sets only that lane\'s rate-drift gain', async () => {
      const { lfoEngine, lanes } = await primeBankRunning();

      lfoEngine.setBankRateDrift('b', 0.5);
      // LFO_RATE_MIN=0, LFO_RATE_MAX=20; DEFAULT_BANK_LFO.rate=0 -> swing max = min(0-0, 20-0) = 0
      expect(lanes.b.rateDriftGain.gain.value).toBe(0);
      expect(lanes.a.rateDriftGain.gain.value).toBe(0); // untouched, still the construction default
    });

    it('setBankRate refreshes the rate-drift gain from the new rate', async () => {
      const { lfoEngine, lanes } = await primeBankRunning();

      lfoEngine.setBankRateDrift('a', 0.5);
      lfoEngine.setBankRate('a', 10); // swing max = min(10-0, 20-10) = 10
      expect(lanes.a.rateDriftGain.gain.value).toBe(5); // 0.5 * 10
    });

    it('setBankDepthDrift sets the depth-drift gain to the drift amount (swing max is always 1)', async () => {
      const { lfoEngine, lanes } = await primeBankRunning();

      lfoEngine.setBankDepthDrift('a', -1);
      expect(lanes.a.depthDriftGain.gain.value).toBe(-1);
    });

    it('setDriftEnabled(false) disconnects all 8 drift gains; true reconnects at the current amounts', async () => {
      const { lfoEngine, lanes } = await primeBankRunning();
      lfoEngine.setBankRateDrift('a', 0.5);
      const driftGains = Object.values(lanes).flatMap((lane) => [lane.rateDriftGain, lane.depthDriftGain]);

      lfoEngine.setDriftEnabled(false);
      for (const g of driftGains) expect(g.disconnect).toHaveBeenCalled();

      const connectCallsBefore = lanes.a.rateDriftGain.connect.mock.calls.length;
      lfoEngine.setDriftEnabled(true);
      expect(lanes.a.rateDriftGain.connect.mock.calls.length).toBeGreaterThan(connectCallsBefore);
      expect(lanes.a.rateDriftGain.gain.value).toBe(0); // rate still 0 -> swing max 0 -> 0.5 * 0
    });
  });

  describe('setFilterLinksEnabled', () => {
    it('disconnects only lpf./hpf. link gains and keeps their records', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockImplementation(() => fakeSignal(0));

      lfoEngine.linkTarget('eq3.low', { lane: 'a', depth: 50 });
      const eqGain = await latestGainInstance();
      lfoEngine.linkTarget('lpf.frequency', { lane: 'a', depth: 50 });
      const lpfGain = await latestGainInstance();

      lfoEngine.setFilterLinksEnabled(false);
      expect(lpfGain.disconnect).toHaveBeenCalled();
      expect(eqGain.disconnect).not.toHaveBeenCalled();
    });

    it('restores a suspended filter link when re-enabled', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      const signal = fakeSignal(0);
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(signal);

      lfoEngine.linkTarget('lpf.frequency', { lane: 'a', depth: 50 });
      const lpfGain = await latestGainInstance();
      lfoEngine.setFilterLinksEnabled(false);
      const connectCallsBefore = lpfGain.connect.mock.calls.length;
      lfoEngine.setFilterLinksEnabled(true);
      expect(lpfGain.connect.mock.calls.length).toBeGreaterThan(connectCallsBefore);
    });

    it('a filter link created while disabled is created suspended', async () => {
      const { lfoEngine } = await primeBankRunning();
      const { AudioEngine } = await import('./AudioEngine');
      (AudioEngine.getGlobalModulationTarget as ReturnType<typeof vi.fn>).mockReturnValue(fakeSignal(0));

      lfoEngine.setFilterLinksEnabled(false);
      const before = await gainConstructCount();
      const ok = lfoEngine.linkTarget('hpf.Q', { lane: 'a', depth: 50 });
      expect(ok).toBe(true);
      expect(await gainConstructCount()).toBe(before + 1);
      const gain = await latestGainInstance();
      expect(gain.disconnect).toHaveBeenCalled(); // connected, then immediately suspended

      // re-enabling reconnects it
      const connectCallsBefore = gain.connect.mock.calls.length;
      lfoEngine.setFilterLinksEnabled(true);
      expect(gain.connect.mock.calls.length).toBeGreaterThan(connectCallsBefore);
    });
  });
});
