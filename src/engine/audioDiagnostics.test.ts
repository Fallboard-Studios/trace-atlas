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

vi.mock('../stores/audioStore', () => ({
  useAudioStore: {
    getState: () => ({ globalLfo: { a: { rate: 1 }, b: { rate: 0 }, c: { rate: 2.5 } } }),
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
    tickerCallbacks.clear();
    fakeActiveLocaleId = 'L1';
    fakeLocales = { L1: { robots: [] } };
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
