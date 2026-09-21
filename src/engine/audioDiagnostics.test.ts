// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ========================================
// MOCKS
// ========================================
type Listener = () => void;

const fakeRaw = {
  currentTime: 0,
  state: 'running' as string,
  baseLatency: 0.02,
  // AudioContext.playbackStats: absent unless a test sets it (the API is Chrome 146+).
  playbackStats: undefined as unknown,
  listeners: new Map<string, Listener[]>(),
  addEventListener(name: string, cb: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), cb]);
  },
  removeEventListener(name: string, cb: Listener) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter((l) => l !== cb));
  },
  fire(name: string) {
    for (const cb of this.listeners.get(name) ?? []) cb();
  },
};

vi.mock('tone', () => ({
  getContext: () => ({ rawContext: fakeRaw, state: fakeRaw.state, latencyHint: 'playback', lookAhead: 0.1 }),
  getTransport: () => ({ state: 'started' }),
}));

const tickerCallbacks = new Set<() => void>();
vi.mock('gsap', () => ({
  default: {
    ticker: {
      add: (cb: () => void) => tickerCallbacks.add(cb),
      remove: (cb: () => void) => tickerCallbacks.delete(cb),
    },
  },
}));

vi.mock('./AudioEngine', () => ({
  AudioEngine: { getPolyphonyStats: () => ({ voices: 3, maxVoices: 16, step: 1 }) },
}));

// Only the fields readInfo reads. `audioLoad` / `soundingRobotIds` are live, so a test can change them between samples.
let fakeAudioLoad = 1;
let fakeSoundingIds: string[] = [];
vi.mock('../stores/audioStore', () => ({
  useAudioStore: {
    getState: () => ({
      globalLfo: { a: { rate: 1 }, b: { rate: 0 }, c: { rate: 2.5 } },
      audioLoad: fakeAudioLoad,
      soundingRobotIds: fakeSoundingIds,
    }),
  },
}));

// A stub of just the two reads readInfo makes. There is deliberately no `subscribe` on it: the
// audible count must be sampled at the existing 500 ms tick, never via a store subscription.
type FakeRobot = { id: string; audioMode?: 'none' | 'solo' | 'mute' | 'highlight' };
let fakeLocales: Record<string, { robots?: FakeRobot[] }> = {};
let fakeActiveLocaleId = 'L1';

vi.mock('../stores/localeStore', () => ({
  useLocaleStore: { getState: () => ({ locales: fakeLocales }) },
}));

vi.mock('../utils/localeHelpers', () => ({
  getActiveLocaleId: () => fakeActiveLocaleId,
}));

// The two read-only output taps (docs/specs/AUDIO_OUTPUT_DIAGNOSTIC.md). This module only attaches, reads and
// detaches them; their Tone plumbing is tested in globalFx.test.ts.
type TapBuffers = { pre: Float32Array | null; master: Float32Array | null };
const tapSpies = {
  attach: vi.fn(),
  detach: vi.fn(),
  read: vi.fn((): TapBuffers => ({ pre: null, master: null })),
};
vi.mock('./audioEngine/globalFx', () => ({
  attachOutputTaps: () => tapSpies.attach(),
  detachOutputTaps: () => tapSpies.detach(),
  readOutputTaps: () => tapSpies.read(),
}));

// ========================================
// HELPERS
// ========================================
type Diag = typeof import('./audioDiagnostics');
let diag: Diag;
let stop: () => void;

/** Advance one sampler interval with the audio clock and GSAP frames advancing in step (unless told not to). */
function advance(opts: { clock?: boolean; frames?: number } = {}) {
  const { clock = true, frames = 30 } = opts;
  if (clock) fakeRaw.currentTime += 0.5;
  for (let i = 0; i < frames; i++) for (const cb of [...tickerCallbacks]) cb();
  vi.advanceTimersByTime(500);
}

// ========================================
// TESTS
// ========================================

describe('audioDiagnostics runtime', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    fakeRaw.currentTime = 0;
    fakeRaw.state = 'running';
    fakeRaw.listeners.clear();
    // A plain writable property again, even if an earlier test replaced it with a throwing getter.
    Object.defineProperty(fakeRaw, 'playbackStats', { value: undefined, writable: true, configurable: true });
    tickerCallbacks.clear();
    fakeActiveLocaleId = 'L1';
    fakeLocales = { L1: { robots: [] } };
    fakeAudioLoad = 1;
    fakeSoundingIds = [];
    tapSpies.attach.mockClear();
    tapSpies.detach.mockClear();
    tapSpies.read.mockReset();
    tapSpies.read.mockReturnValue({ pre: null, master: null });
    vi.resetModules();
    diag = await import('./audioDiagnostics');
    stop = diag.startAudioDiagnostics();
  });

  afterEach(() => {
    stop();
    vi.useRealTimers();
  });

  it('publishes a snapshot with the static and live readouts', () => {
    advance();
    const snap = diag.getDiagnosticsSnapshot();
    expect(snap.timing.clockRate).toBeCloseTo(1, 1);
    expect(snap.timing.fps).toBeGreaterThan(0);
    expect(snap.info).toMatchObject({
      latencyHint: 'playback',
      lookAheadMs: 100,
      baseLatencyMs: 20,
      voices: 3,
      maxVoices: 16,
      transport: 'started',
      globalLfosOn: 2,
      globalLfosTotal: 3,
      audibleRobots: 0,
      totalRobots: 0,
      audioLoad: 1,
      soundingRobots: 0,
      maxAudibleRobots: 12,
    });
  });

  describe('audible-robot count', () => {
    const roster = (modes: Array<FakeRobot['audioMode']>): FakeRobot[] =>
      modes.map((audioMode, i) => ({ id: `r${i}`, audioMode }));

    const audible = () => {
      advance();
      const { audibleRobots, totalRobots } = diag.getDiagnosticsSnapshot().info;
      return { audibleRobots, totalRobots };
    };

    it('counts every robot in the active locale as audible when none is muted or soloed', () => {
      fakeLocales = { L1: { robots: roster(['none', 'none', 'highlight', undefined]) } };
      expect(audible()).toEqual({ audibleRobots: 4, totalRobots: 4 });
    });

    it('does not count muted robots', () => {
      fakeLocales = { L1: { robots: roster(['none', 'mute', 'mute', 'none', 'none']) } };
      expect(audible()).toEqual({ audibleRobots: 3, totalRobots: 5 });
    });

    it('counts only the soloed robots while any robot is soloed', () => {
      fakeLocales = { L1: { robots: roster(['none', 'solo', 'highlight', 'solo', 'mute']) } };
      expect(audible()).toEqual({ audibleRobots: 2, totalRobots: 5 });
    });

    it('reads 0 of the roster when every robot is muted', () => {
      fakeLocales = { L1: { robots: roster(['mute', 'mute', 'mute']) } };
      expect(audible()).toEqual({ audibleRobots: 0, totalRobots: 3 });
    });

    it('reads 0/0 when the active locale has no robots yet', () => {
      fakeLocales = { L1: { robots: [] } };
      expect(audible()).toEqual({ audibleRobots: 0, totalRobots: 0 });
    });

    it('reads 0/0 when the active locale is not in the store or its robots are undefined', () => {
      fakeLocales = {};
      expect(audible()).toEqual({ audibleRobots: 0, totalRobots: 0 });
      fakeLocales = { L1: {} };
      expect(audible()).toEqual({ audibleRobots: 0, totalRobots: 0 });
    });

    it('reads 0/0 when there is no active locale id', () => {
      fakeActiveLocaleId = '';
      fakeLocales = { L1: { robots: roster(['none']) } };
      expect(audible()).toEqual({ audibleRobots: 0, totalRobots: 0 });
    });

    it('follows robots docking, undocking, muting and soloing between samples', () => {
      fakeLocales = { L1: { robots: roster(['none', 'none', 'none']) } };
      expect(audible().audibleRobots).toBe(3);

      fakeLocales = { L1: { robots: roster(['mute', 'none', 'none']) } }; // one docks
      expect(audible().audibleRobots).toBe(2);

      fakeLocales = { L1: { robots: roster(['none', 'none', 'none']) } }; // and undocks
      expect(audible().audibleRobots).toBe(3);

      fakeLocales = { L1: { robots: roster(['none', 'solo', 'none']) } };
      expect(audible().audibleRobots).toBe(1);
    });

    it('only counts the active locale, not other locales in the store', () => {
      fakeLocales = {
        L1: { robots: roster(['none', 'none']) },
        L2: { robots: roster(['none', 'none', 'none', 'none', 'none']) },
      };
      expect(audible()).toEqual({ audibleRobots: 2, totalRobots: 2 });
    });
  });

  describe('Audio Load budget readout', () => {
    const budget = () => {
      advance();
      const { audioLoad, soundingRobots, maxAudibleRobots } = diag.getDiagnosticsSnapshot().info;
      return { audioLoad, soundingRobots, maxAudibleRobots };
    };

    it('reads the dial, how many robots are sounding, and the robot cap the dial allows', () => {
      fakeAudioLoad = 0.2;
      fakeSoundingIds = ['a', 'b', 'c'];
      expect(budget()).toEqual({ audioLoad: 0.2, soundingRobots: 3, maxAudibleRobots: 4 });
    });

    it('shows the Full cap of 12 at audioLoad 1', () => {
      expect(budget()).toEqual({ audioLoad: 1, soundingRobots: 0, maxAudibleRobots: 12 });
    });

    it('follows a live change of the dial and of the sounding set within one sample', () => {
      fakeAudioLoad = 0.2;
      expect(budget().maxAudibleRobots).toBe(4);

      fakeAudioLoad = 0.6;
      fakeSoundingIds = ['a', 'b'];
      expect(budget()).toEqual({ audioLoad: 0.6, soundingRobots: 2, maxAudibleRobots: 8 });
    });
  });

  describe('output taps', () => {
    const buffer = (...values: number[]) => Float32Array.from(values);
    const levels = () => {
      const { outputPre, outputMaster } = diag.getDiagnosticsSnapshot().info;
      return { outputPre, outputMaster };
    };

    it('attaches the taps once when diagnostics start, and detaches them only when the last handle stops', () => {
      expect(tapSpies.attach).toHaveBeenCalledTimes(1);

      const second = diag.startAudioDiagnostics();
      expect(tapSpies.attach).toHaveBeenCalledTimes(1); // ref-counted, like the sampler itself

      second();
      expect(tapSpies.detach).not.toHaveBeenCalled();
      stop();
      expect(tapSpies.detach).toHaveBeenCalledTimes(1);
      stop = () => {}; // afterEach's stop() is now a no-op
    });

    it('publishes null for both taps until they have produced a buffer', () => {
      expect(levels()).toEqual({ outputPre: null, outputMaster: null });
    });

    it('reads both taps once per sample and publishes each one measured', () => {
      tapSpies.read.mockClear();
      tapSpies.read.mockReturnValue({ pre: buffer(0.25, -0.25), master: buffer(0.5, -0.5) });
      advance();
      expect(tapSpies.read).toHaveBeenCalledTimes(1);
      expect(levels()).toEqual({
        outputPre: { peak: 0.25, rms: 0.25, nonFinite: 0 },
        outputMaster: { peak: 0.5, rms: 0.5, nonFinite: 0 },
      });
    });

    it('does not read the taps again for an AudioContext statechange (only the sampler tick reads them)', () => {
      advance();
      tapSpies.read.mockClear();
      fakeRaw.state = 'suspended';
      fakeRaw.fire('statechange');
      expect(tapSpies.read).not.toHaveBeenCalled();
    });

    it('publishes null for a tap that is not attached or cannot be read, and still measures the other', () => {
      tapSpies.read.mockReturnValue({ pre: null, master: buffer(0.5, -0.5) });
      advance();
      expect(levels().outputPre).toBeNull();
      expect(levels().outputMaster).toEqual({ peak: 0.5, rms: 0.5, nonFinite: 0 });
    });

    it('publishes null for an empty buffer (there is nothing to measure)', () => {
      tapSpies.read.mockReturnValue({ pre: new Float32Array(0), master: new Float32Array(0) });
      advance();
      expect(levels()).toEqual({ outputPre: null, outputMaster: null });
    });

    it('carries the non-finite count through, without letting it corrupt peak or rms', () => {
      tapSpies.read.mockReturnValue({ pre: null, master: buffer(0.5, NaN, -0.5) });
      advance();
      expect(levels().outputMaster).toEqual({ peak: 0.5, rms: 0.5, nonFinite: 1 });
    });

    it('follows the buffers from one sample to the next', () => {
      tapSpies.read.mockReturnValue({ pre: null, master: buffer(0.5) });
      advance();
      expect(levels().outputMaster?.peak).toBe(0.5);

      tapSpies.read.mockReturnValue({ pre: null, master: buffer(0) });
      advance();
      expect(levels().outputMaster?.peak).toBe(0);
    });
  });

  describe('playback stats (AudioContext.playbackStats)', () => {
    const stats = (underrunEvents: number, overrides: Record<string, unknown> = {}) => ({
      underrunEvents,
      underrunDuration: 0.012,
      totalDuration: 30,
      averageLatency: 0.021,
      minimumLatency: 0.02,
      maximumLatency: 0.034,
      ...overrides,
    });
    const playback = () => diag.getDiagnosticsSnapshot().info.playback;
    const events = () => diag.getDiagnosticsSnapshot().timing.events.map((e) => e.text);

    it('publishes the reading when the context has playbackStats', () => {
      fakeRaw.playbackStats = stats(2);
      advance();
      expect(playback()).toEqual(stats(2));
    });

    it('publishes null when the API is absent, and does not throw', () => {
      expect(() => advance()).not.toThrow();
      expect(playback()).toBeNull();
    });

    it('publishes null, and does not throw, when reading playbackStats throws', () => {
      Object.defineProperty(fakeRaw, 'playbackStats', {
        get() {
          throw new Error('not allowed here');
        },
        configurable: true,
      });
      expect(() => advance()).not.toThrow();
      expect(playback()).toBeNull();
    });

    it('publishes null when the underrun count is not a finite number', () => {
      fakeRaw.playbackStats = stats(NaN);
      advance();
      expect(playback()).toBeNull();
      fakeRaw.playbackStats = { underrunEvents: 'many' };
      advance();
      expect(playback()).toBeNull();
    });

    it('keeps the reading but turns an unreadable latency or duration field into NaN', () => {
      fakeRaw.playbackStats = stats(1, { averageLatency: undefined, maximumLatency: 'slow' });
      advance();
      expect(playback()?.underrunEvents).toBe(1);
      expect(playback()?.averageLatency).toBeNaN();
      expect(playback()?.maximumLatency).toBeNaN();
      expect(playback()?.minimumLatency).toBe(0.02);
    });

    it('only ever reads the stats: it never calls resetLatency (which would move the browser’s own interval)', () => {
      const resetLatency = vi.fn();
      fakeRaw.playbackStats = { ...stats(0), resetLatency };
      advance();
      advance();
      advance();
      expect(resetLatency).not.toHaveBeenCalled();
    });

    it('logs a "began" event and marks underruns active when the count rises, and a "stopped" event once it is flat for a second', () => {
      fakeRaw.playbackStats = stats(0);
      advance(); // baseline
      fakeRaw.playbackStats = stats(3);
      advance();
      expect(events().at(-1)).toBe('playback underruns began (3 total)');
      expect(diag.getDiagnosticsSnapshot().timing.underrunActive).toBe(true);

      advance(); // flat, 500 ms
      expect(diag.getDiagnosticsSnapshot().timing.underrunActive).toBe(true);
      advance(); // flat, 1000 ms
      expect(events().at(-1)).toMatch(/^playback underruns stopped after 0\.0s \(\+3\)$/);
      expect(diag.getDiagnosticsSnapshot().timing.underrunActive).toBe(false);
    });

    it('logs nothing and stays inactive when the API is absent throughout', () => {
      advance();
      advance();
      advance();
      expect(events().filter((text) => /underrun/.test(text))).toEqual([]);
      expect(diag.getDiagnosticsSnapshot().timing.underrunActive).toBe(false);
    });
  });

  it('logs a clock stall when the audio clock stops advancing while the timer keeps ticking', () => {
    advance();
    advance({ clock: false });
    const texts = diag.getDiagnosticsSnapshot().timing.events.map((e) => e.text);
    expect(texts.some((t) => /audio clock stalled/i.test(t))).toBe(true);
  });

  it('logs an AudioContext statechange event immediately, with old and new state', () => {
    advance();
    fakeRaw.state = 'suspended';
    fakeRaw.fire('statechange');
    const texts = diag.getDiagnosticsSnapshot().timing.events.map((e) => e.text);
    expect(texts.at(-1)).toMatch(/running → suspended/);
  });

  it('notifies subscribers on each sample and stops after unsubscribe', () => {
    const cb = vi.fn();
    const unsubscribe = diag.subscribeDiagnostics(cb);
    advance();
    advance();
    expect(cb.mock.calls.length).toBeGreaterThanOrEqual(2);
    unsubscribe();
    cb.mockClear();
    advance();
    expect(cb).not.toHaveBeenCalled();
  });

  it('is idempotent to start twice and fully tears down (ticker + timer + listener) on stop', () => {
    const second = diag.startAudioDiagnostics();
    expect(tickerCallbacks.size).toBe(1);
    second();
    expect(tickerCallbacks.size).toBe(1); // ref-counted: first start still active
    stop();
    expect(tickerCallbacks.size).toBe(0);
    expect(fakeRaw.listeners.get('statechange') ?? []).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    stop = () => {}; // afterEach's stop() is now a no-op
  });
});
