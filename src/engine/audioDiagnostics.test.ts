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
