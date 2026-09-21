// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import {
  initDiagState,
  stepDiag,
  noteDiagEvent,
  formatUptime,
  SAMPLE_INTERVAL_MS,
  MAX_EVENTS,
  type DiagSample,
  type DiagState,
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
