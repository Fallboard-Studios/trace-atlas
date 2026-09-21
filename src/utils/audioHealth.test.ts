// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  initDiagState,
  stepDiag,
  noteDiagEvent,
  formatUptime,
  measureLevel,
  peakToDb,
  SAMPLE_INTERVAL_MS,
  MAX_EVENTS,
  type DiagSample,
  type DiagState,
  type PlaybackReading,
} from './audioHealth';

// ========================================
// HELPERS
// ========================================

/** A healthy sample `n` intervals after t=0: wall clock, audio clock and GSAP frames all advance in step. */
const healthy = (n: number, overrides: Partial<DiagSample> = {}): DiagSample => ({
  wallMs: n * SAMPLE_INTERVAL_MS,
  ctxTime: (n * SAMPLE_INTERVAL_MS) / 1000,
  ctxState: 'running',
  frames: n * 30, // 60 fps over 500 ms
  hidden: false,
  ...overrides,
});

const run = (samples: DiagSample[], start = 0): DiagState =>
  samples.reduce((s, sample) => stepDiag(s, sample), initDiagState(start));

// ========================================
// TESTS
// ========================================

describe('stepDiag — first sample', () => {
  it('only records the baseline: no rates, no events', () => {
    const s = run([healthy(0)]);
    expect(s.clockRate).toBeNull();
    expect(s.fps).toBeNull();
    expect(s.events).toEqual([]);
    expect(s.ctxState).toBe('running');
  });
});

describe('stepDiag — clock rate, fps, lag', () => {
  it('reports ~1.0 audio-clock rate and the frame rate when everything is healthy', () => {
    const s = run([healthy(0), healthy(1)]);
    expect(s.clockRate).toBeCloseTo(1, 5);
    expect(s.fps).toBeCloseTo(60, 5);
    expect(s.lagMs).toBe(0);
    expect(s.events).toEqual([]);
  });

  it('reports a clock rate below 1 when the audio clock advances slower than wall time', () => {
    const s = run([healthy(0), healthy(1, { ctxTime: 0.25 })]);
    expect(s.clockRate).toBeCloseTo(0.5, 5);
  });

  it('measures sampler lag as how much later than the interval the tick ran, and tracks the max', () => {
    let s = run([healthy(0)]);
    s = stepDiag(s, healthy(1, { wallMs: 500 + 130, ctxTime: 0.63, frames: 30 }));
    expect(s.lagMs).toBe(130);
    s = stepDiag(s, healthy(2, { wallMs: 630 + 500, ctxTime: 1.13, frames: 60 }));
    expect(s.lagMs).toBe(0);
    expect(s.maxLagMs).toBe(130);
  });

  it('never reports negative lag when a tick runs early', () => {
    let s = run([healthy(0)]);
    s = stepDiag(s, healthy(1, { wallMs: 400, ctxTime: 0.4 }));
    expect(s.lagMs).toBe(0);
  });
});

describe('stepDiag — audio clock stall events', () => {
  it('logs once when the clock stalls, and once when it recovers (edge-triggered, not per sample)', () => {
    const s = run([
      healthy(0),
      healthy(1),
      healthy(2, { ctxTime: 0.5 }), // clock frozen (at its sample-1 value) for a whole interval
      healthy(3, { ctxTime: 0.5 }), // still frozen
      healthy(4, { ctxTime: 0.5 }), // still frozen
      healthy(5, { ctxTime: 2.5 }), // caught up
    ]);
    const texts = s.events.map((e) => e.text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/audio clock stalled/i);
    expect(texts[1]).toMatch(/audio clock recovered after 1\.5s/i);
    expect(s.clockStalledSinceMs).toBeNull();
  });

  it('stamps events with the wall time relative to start', () => {
    const s = run([healthy(0), healthy(1, { ctxTime: 0 })], 0);
    expect(s.events[0].atMs).toBe(500);
  });

  it('does not call it a stall when the context is not running (the state itself is the signal)', () => {
    const s = run([healthy(0), healthy(1, { ctxState: 'suspended', ctxTime: 0 })]);
    expect(s.ctxState).toBe('suspended');
    expect(s.events).toEqual([]);
    expect(s.clockStalledSinceMs).toBeNull();
  });
});

describe('stepDiag — main-thread lag events', () => {
  it('logs a main-thread stall when a sampler tick runs 500 ms+ late', () => {
    const s = run([healthy(0), healthy(1, { wallMs: 500 + 900, ctxTime: 1.4, frames: 30 })]);
    expect(s.events.map((e) => e.text)).toEqual([expect.stringMatching(/main thread stalled ~900 ?ms/i)]);
  });

  it('does not log small lag', () => {
    const s = run([healthy(0), healthy(1, { wallMs: 500 + 120, ctxTime: 0.62, frames: 30 })]);
    expect(s.events).toEqual([]);
  });
});

describe('stepDiag — UI frame events', () => {
  it('logs when animation frames stop and when they resume (edge-triggered)', () => {
    const s = run([
      healthy(0),
      healthy(1),
      healthy(2, { frames: 30 }), // no new frames
      healthy(3, { frames: 30 }), // still none
      healthy(4, { frames: 60 }), // resumed
    ]);
    const texts = s.events.map((e) => e.text);
    expect(texts).toHaveLength(2);
    expect(texts[0]).toMatch(/UI frames stopped/i);
    expect(texts[1]).toMatch(/UI frames resumed/i);
  });
});

describe('stepDiag — hidden tab', () => {
  it('suppresses lag and frame events while the page is hidden (timers/frames are throttled by the browser)', () => {
    const s = run([
      healthy(0),
      healthy(1, { hidden: true, wallMs: 500 + 900, ctxTime: 1.4, frames: 30 }),
    ]);
    expect(s.events).toEqual([]);
  });
});

describe('noteDiagEvent / event cap', () => {
  it('appends an externally sourced event (e.g. a statechange callback) stamped relative to start', () => {
    const s = noteDiagEvent(initDiagState(1000), 4200, 'context running → suspended');
    expect(s.events).toEqual([{ atMs: 3200, text: 'context running → suspended' }]);
  });

  it('keeps only the newest MAX_EVENTS events', () => {
    let s = initDiagState(0);
    for (let i = 0; i < MAX_EVENTS + 5; i++) s = noteDiagEvent(s, i * 1000, `event ${i}`);
    expect(s.events).toHaveLength(MAX_EVENTS);
    expect(s.events.at(-1)!.text).toBe(`event ${MAX_EVENTS + 4}`);
    expect(s.events[0].text).toBe('event 5');
  });
});

describe('formatUptime', () => {
  it('formats milliseconds as m:ss', () => {
    expect(formatUptime(0)).toBe('0:00');
    expect(formatUptime(65_000)).toBe('1:05');
    expect(formatUptime(605_400)).toBe('10:05');
  });
});

describe('stepDiag — playback underruns (AudioContext.playbackStats)', () => {
  /** A playbackStats reading with the given underrun count; the latency figures are irrelevant to the events. */
  const stats = (underrunEvents: number): PlaybackReading => ({
    underrunEvents,
    underrunDuration: 0,
    totalDuration: 10,
    averageLatency: 0.02,
    minimumLatency: 0.01,
    maximumLatency: 0.03,
  });
  /** A healthy sample n intervals in, carrying a playbackStats reading (or none). */
  const withStats = (n: number, playback: PlaybackReading | null | undefined, extra: Partial<DiagSample> = {}) =>
    healthy(n, { playback, ...extra });
  const texts = (s: DiagState) => s.events.map((e) => e.text);

  it('logs nothing while the count does not move', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(0)), withStats(2, stats(0))]);
    expect(s.events).toEqual([]);
    expect(s.underrunActive).toBe(false);
  });

  it('treats the first reading as history: underruns from before the overlay started are not an event', () => {
    const s = run([withStats(0, stats(7)), withStats(1, stats(7))]);
    expect(s.events).toEqual([]);
    expect(s.underrunActive).toBe(false);
  });

  it('reports a rise between the very first sample and the second (the first sample is a baseline, not skipped)', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(2))]);
    expect(texts(s)).toEqual(['playback underruns began (2 total)']);
    expect(s.underrunActive).toBe(true);
  });

  it('logs exactly one "began" event however many further underruns arrive while the burst lasts', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(1)), withStats(2, stats(4)), withStats(3, stats(9))]);
    expect(texts(s)).toEqual(['playback underruns began (1 total)']);
    expect(s.underrunActive).toBe(true);
  });

  it('logs one "stopped" event once the count has been flat for a full second, with the burst length and how many were added', () => {
    const s = run([
      withStats(0, stats(0)),
      withStats(1, stats(2)), // burst begins at 500 ms
      withStats(2, stats(5)), // last rise at 1000 ms
      withStats(3, stats(5)), // 500 ms flat: not over yet
    ]);
    expect(texts(s)).toEqual(['playback underruns began (2 total)']);
    expect(s.underrunActive).toBe(true);

    const over = stepDiag(s, withStats(4, stats(5))); // 1000 ms flat
    expect(texts(over)).toEqual(['playback underruns began (2 total)', 'playback underruns stopped after 0.5s (+5)']);
    expect(over.underrunActive).toBe(false);
  });

  it('reports only the underruns added during the burst, not the running total', () => {
    const s = run([withStats(0, stats(3)), withStats(1, stats(5)), withStats(2, stats(5)), withStats(3, stats(5))]);
    expect(texts(s)).toEqual(['playback underruns began (5 total)', 'playback underruns stopped after 0.0s (+2)']);
  });

  it('logs nothing further while the count stays flat after a burst has ended', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(3)), withStats(2, stats(3)), withStats(3, stats(3)), withStats(4, stats(3)), withStats(5, stats(3))]);
    expect(s.events).toHaveLength(2);
  });

  it('starts a new burst, with its own "began" event, when underruns resume after a quiet spell', () => {
    const s = run([
      withStats(0, stats(0)),
      withStats(1, stats(1)),
      withStats(2, stats(1)),
      withStats(3, stats(1)), // stopped
      withStats(4, stats(2)), // resumes
    ]);
    expect(texts(s)).toEqual([
      'playback underruns began (1 total)',
      'playback underruns stopped after 0.0s (+1)',
      'playback underruns began (2 total)',
    ]);
    expect(s.underrunActive).toBe(true);
  });

  it('never logs, and never throws, when the API is absent (null or undefined readings)', () => {
    const s = run([withStats(0, null), withStats(1, undefined), withStats(2, null)]);
    expect(s.events).toEqual([]);
    expect(s.underrunActive).toBe(false);
  });

  it('a missing reading mid-burst neither ends the burst nor moves its baseline', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(2)), withStats(2, null), withStats(3, null), withStats(4, null)]);
    expect(texts(s)).toEqual(['playback underruns began (2 total)']);
    expect(s.underrunActive).toBe(true);
  });

  it('treats a count that goes down (a new AudioContext) as a fresh baseline: no event, and any burst is closed', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(4)), withStats(2, stats(1))]);
    expect(texts(s)).toEqual(['playback underruns began (4 total)']);
    expect(s.underrunActive).toBe(false);

    const again = stepDiag(s, withStats(3, stats(2))); // rises from the new baseline
    expect(texts(again).at(-1)).toBe('playback underruns began (2 total)');
  });

  it('ignores a non-finite count rather than treating it as a rise', () => {
    const s = run([withStats(0, stats(0)), withStats(1, stats(NaN)), withStats(2, stats(Infinity))]);
    expect(s.events).toEqual([]);
  });

  it('still logs while the tab is hidden: underruns happen on the audio thread, which the browser does not throttle', () => {
    const s = run([withStats(0, stats(0), { hidden: true }), withStats(1, stats(3), { hidden: true })]);
    expect(texts(s)).toEqual(['playback underruns began (3 total)']);
  });
});

describe('measureLevel', () => {
  it('reads silence as peak 0, rms 0 and no non-finite samples', () => {
    expect(measureLevel(new Float32Array(1024))).toEqual({ peak: 0, rms: 0, nonFinite: 0 });
  });

  it('reads a sine of amplitude a as peak a and rms a / sqrt(2)', () => {
    const amplitude = 0.5;
    const cycles = 100;
    const length = 4800; // whole cycles, so the rms has no partial-cycle bias
    const sine = Float32Array.from({ length }, (_, i) => amplitude * Math.sin((2 * Math.PI * cycles * i) / length));
    const level = measureLevel(sine)!;
    expect(level.peak).toBeCloseTo(amplitude, 3);
    expect(level.rms).toBeCloseTo(amplitude / Math.SQRT2, 3);
    expect(level.nonFinite).toBe(0);
  });

  it('takes the peak from the absolute value, so a negative excursion counts', () => {
    expect(measureLevel([-0.9, 0.2])!.peak).toBeCloseTo(0.9, 6);
  });

  it('counts NaN and both infinities and leaves peak and rms to the finite samples alone', () => {
    const level = measureLevel([0.25, NaN, -0.5, Infinity, 0.1, -Infinity])!;
    expect(level.nonFinite).toBe(3);
    expect(level.peak).toBeCloseTo(0.5, 6);
    // rms over the three finite samples: sqrt((0.25² + 0.5² + 0.1²) / 3)
    expect(level.rms).toBeCloseTo(Math.sqrt((0.0625 + 0.25 + 0.01) / 3), 6);
  });

  it('reads a buffer with nothing finite in it as peak 0, rms 0 and every sample counted', () => {
    expect(measureLevel([NaN, Infinity, NaN])).toEqual({ peak: 0, rms: 0, nonFinite: 3 });
  });

  it('returns null for an empty buffer (there is nothing to measure)', () => {
    expect(measureLevel([])).toBeNull();
    expect(measureLevel(new Float32Array(0))).toBeNull();
  });

  it('measures a single sample', () => {
    const level = measureLevel([-0.4])!;
    expect(level.peak).toBeCloseTo(0.4, 6);
    expect(level.rms).toBeCloseTo(0.4, 6);
    expect(level.nonFinite).toBe(0);
  });
});

describe('peakToDb', () => {
  it('converts a linear peak to dBFS', () => {
    expect(peakToDb(1)).toBeCloseTo(0, 6);
    expect(peakToDb(0.5)).toBeCloseTo(-6.0206, 3);
    expect(peakToDb(1e-4)).toBeCloseTo(-80, 6);
  });

  it('reads a zero peak as -Infinity rather than NaN', () => {
    expect(peakToDb(0)).toBe(-Infinity);
  });
});
