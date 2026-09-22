// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { buildHudLines, hudStatus } from './hudLines';
import { initDiagState, type DiagState } from '../../utils/audioHealth';
import type { DiagInfo, DiagSnapshot } from '../../engine/audioDiagnostics';

// ========================================
// HELPERS
// ========================================

const baseInfo: DiagInfo = {
  latencyHint: 'interactive',
  lookAheadMs: 100,
  baseLatencyMs: 10,
  voices: 3,
  maxVoices: 16,
  transport: 'started',
  globalLfosOn: 5,
  globalLfosTotal: 7,
  audibleRobots: 5,
  totalRobots: 12,
  robotLoad: 1,
  effectsLoad: 1,
  soundingRobots: 5,
  maxAudibleRobots: 12,
};

const snap = (timing: Partial<DiagState> = {}, info: Partial<DiagInfo> = {}): DiagSnapshot => ({
  timing: { ...initDiagState(0), ctxState: 'running', clockRate: 1, fps: 58, lagMs: 4, maxLagMs: 220, ...timing },
  info: { ...baseInfo, ...info },
});

const world = { seed: 'bravo', x: -150, y: 90 };

// ========================================
// TESTS
// ========================================

describe('hudStatus', () => {
  it('is ok when the context runs, the clock advances, and frames are flowing', () => {
    expect(hudStatus(snap())).toBe('ok');
  });

  it('is bad when the context is not running', () => {
    expect(hudStatus(snap({ ctxState: 'suspended' }))).toBe('bad');
    expect(hudStatus(snap({ ctxState: 'interrupted' }))).toBe('bad');
  });

  it('is bad when the audio clock is stalled or the UI frames have stopped', () => {
    expect(hudStatus(snap({ clockRate: 0.1 }))).toBe('bad');
    expect(hudStatus(snap({ fps: 0 }))).toBe('bad');
  });

  it('is ok (not bad) before the first two samples exist', () => {
    expect(hudStatus(snap({ clockRate: null, fps: null }))).toBe('ok');
  });
});

describe('hudStatus — silent output and non-finite samples', () => {
  it('is bad while the master is silent with notes sounding, and ok again afterwards', () => {
    expect(hudStatus(snap({ silentActive: true }))).toBe('bad');
    expect(hudStatus(snap({ silentActive: false }))).toBe('ok');
  });

  it('is bad while either tap holds non-finite samples', () => {
    expect(hudStatus(snap({ masterNonFinite: true }))).toBe('bad');
    expect(hudStatus(snap({ preNonFinite: true }))).toBe('bad');
    expect(hudStatus(snap({ masterNonFinite: false, preNonFinite: false }))).toBe('ok');
  });

  it('still reports the existing and underrun conditions alongside', () => {
    expect(hudStatus(snap({ ctxState: 'suspended' }))).toBe('bad');
    expect(hudStatus(snap({ underrunActive: true, silentActive: false }))).toBe('bad');
  });
});

describe('hudStatus — playback underruns', () => {
  it('is bad while underruns are occurring, and ok again once they have stopped', () => {
    expect(hudStatus(snap({ underrunActive: true }))).toBe('bad');
    expect(hudStatus(snap({ underrunActive: false }))).toBe('ok');
  });

  it('still reports the existing bad conditions when underruns are not active', () => {
    expect(hudStatus(snap({ ctxState: 'suspended', underrunActive: false }))).toBe('bad');
    expect(hudStatus(snap({ clockRate: 0.1, underrunActive: false }))).toBe('bad');
  });
});

describe('buildHudLines', () => {
  it('shows the pinned world, so a screenshot identifies what was loaded', () => {
    const text = buildHudLines(snap(), world, 65_000).join('\n');
    expect(text).toContain('bravo');
    expect(text).toContain('-150,90');
    expect(text).toContain('1:05');
  });

  it('labels an unpinned seed as random', () => {
    const text = buildHudLines(snap(), { seed: null, x: 1, y: 2 }, 0).join('\n');
    expect(text).toMatch(/random/i);
  });

  it('shows context state, audio clock rate, and transport', () => {
    const text = buildHudLines(snap({ ctxState: 'suspended', clockRate: 0.42 }), world, 0).join('\n');
    expect(text).toContain('suspended');
    expect(text).toContain('x0.42');
    expect(text).toContain('started');
  });

  it('shows latency hint, lookahead, and base latency', () => {
    const text = buildHudLines(snap({}, { latencyHint: 'playback', lookAheadMs: 100 }), world, 0).join('\n');
    expect(text).toContain('playback');
    expect(text).toContain('100ms');
    expect(text).toContain('10ms');
  });

  it('shows voices, active global LFOs, fps, and current/max main-thread lag', () => {
    const text = buildHudLines(snap(), world, 0).join('\n');
    expect(text).toContain('3/16');
    expect(text).toContain('5/7');
    expect(text).toContain('58');
    expect(text).toContain('4ms');
    expect(text).toContain('220ms');
  });

  it('shows how many robots are audible out of the roster', () => {
    const lines = buildHudLines(snap({}, { audibleRobots: 7, totalRobots: 12 }), world, 0);
    expect(lines.some((l) => l.includes('audible 7/12'))).toBe(true);
  });

  it('reads "audible 0/0" before any robot exists, and "0/12" when all are silenced', () => {
    const empty = buildHudLines(snap({}, { audibleRobots: 0, totalRobots: 0 }), world, 0).join('\n');
    expect(empty).toContain('audible 0/0');
    expect(empty).not.toMatch(/NaN|undefined|null/);

    const silent = buildHudLines(snap({}, { audibleRobots: 0, totalRobots: 12 }), world, 0).join('\n');
    expect(silent).toContain('audible 0/12');
  });

  it('keeps the audible count on the same line as the voice count (no extra line to scroll)', () => {
    const before = buildHudLines(snap({}, { audibleRobots: 0, totalRobots: 0 }), world, 0).length;
    const after = buildHudLines(snap({}, { audibleRobots: 5, totalRobots: 12 }), world, 0).length;
    expect(after).toBe(before);
    const voicesLine = buildHudLines(snap(), world, 0).find((l) => l.startsWith('voices'));
    expect(voicesLine).toContain('audible 5/12');
  });

  describe('Audio Load caps line', () => {
    const capsLine = (info: Partial<DiagInfo>) =>
      buildHudLines(snap({}, info), world, 0).find((l) => l.startsWith('load'));

    it('reads robot dial·effects dial · sounding n/cap · standing by n · poly used/cap', () => {
      const line = capsLine({
        robotLoad: 0.2,
        effectsLoad: 1,
        soundingRobots: 4,
        maxAudibleRobots: 4,
        audibleRobots: 6,
        voices: 3,
        maxVoices: 8,
      });
      expect(line).toBe('load 20%·fx 100% · sounding 4/4 · standing by 2 · poly 3/8');
    });

    it('shows the two dials independently, not tied to each other', () => {
      expect(capsLine({ robotLoad: 1, effectsLoad: 0.2 })).toMatch(/^load 100%·fx 20% /);
      expect(capsLine({ robotLoad: 0.2, effectsLoad: 1 })).toMatch(/^load 20%·fx 100% /);
    });

    it('at Full reads sounding n/12 and poly n/16 — the same 16 as today’s voices line', () => {
      const info = { robotLoad: 1, effectsLoad: 1, soundingRobots: 7, maxAudibleRobots: 12, audibleRobots: 7, voices: 3, maxVoices: 16 };
      expect(capsLine(info)).toBe('load 100%·fx 100% · sounding 7/12 · standing by 0 · poly 3/16');
      expect(buildHudLines(snap({}, info), world, 0).join('\n')).toContain('voices 3/16');
    });

    it('sits directly under the voices line', () => {
      const lines = buildHudLines(snap(), world, 0);
      const voices = lines.findIndex((l) => l.startsWith('voices'));
      expect(lines[voices + 1]).toMatch(/^load /);
    });

    it('rounds each dial to a whole percent', () => {
      expect(capsLine({ robotLoad: 0.455 })).toMatch(/^load 46%/);
      expect(capsLine({ robotLoad: 0.6 })).toMatch(/^load 60%/);
      expect(capsLine({ robotLoad: 0 })).toMatch(/^load 0%/);
      expect(capsLine({ effectsLoad: 0.455 })).toMatch(/^load \d+%·fx 46%/);
    });

    it('never shows a negative standing-by count, even if the sounding set briefly outruns the audible count', () => {
      expect(capsLine({ audibleRobots: 3, soundingRobots: 5 })).toContain('standing by 0');
    });

    it('shows a dash for any unknown value, never NaN, null or undefined', () => {
      const line = capsLine({
        robotLoad: NaN,
        effectsLoad: NaN,
        soundingRobots: NaN,
        maxAudibleRobots: Infinity,
        audibleRobots: NaN,
        voices: undefined as unknown as number,
        maxVoices: NaN,
      });
      expect(line).toBe('load -·fx - · sounding -/- · standing by - · poly -/-');
      expect(line).not.toMatch(/NaN|null|undefined|Infinity/);
    });
  });

  describe('output level line', () => {
    const outLine = (info: Partial<DiagInfo>) => buildHudLines(snap({}, info), world, 0).find((l) => l.startsWith('out'));
    const level = (peak: number, rms: number, nonFinite = 0) => ({ peak, rms, nonFinite });

    it('reads master peak, master rms and pre-chain peak in dB, one decimal', () => {
      const line = outLine({ outputMaster: level(0.25, 0.1), outputPre: level(0.5, 0.2) });
      expect(line).toBe('out -12.0dB rms -20.0dB  pre -6.0dB  fin ok');
    });

    it('reads a zero level as -inf, not as a number or NaN', () => {
      expect(outLine({ outputMaster: level(0, 0), outputPre: level(0, 0) })).toBe('out -inf rms -inf  pre -inf  fin ok');
    });

    it('shows a dash for a tap with no reading, never null, undefined or NaN', () => {
      expect(outLine({})).toBe('out - rms -  pre -  fin -');
      expect(outLine({ outputMaster: null, outputPre: null })).toBe('out - rms -  pre -  fin -');
      expect(outLine({ outputMaster: level(0.5, 0.25), outputPre: null })).toBe('out -6.0dB rms -12.0dB  pre -  fin ok');
    });

    it('flags non-finite samples from either tap', () => {
      expect(outLine({ outputMaster: level(0.5, 0.25, 3), outputPre: level(0.5, 0.25) })).toMatch(/fin NaN!$/);
      expect(outLine({ outputMaster: level(0.5, 0.25), outputPre: level(0.5, 0.25, 1) })).toMatch(/fin NaN!$/);
    });

    it('stays within 52 characters even at the quietest realistic levels with a non-finite flag', () => {
      const line = outLine({ outputMaster: level(1e-6, 1e-6, 2), outputPre: level(1e-6, 1e-6) })!;
      expect(line).toBe('out -120.0dB rms -120.0dB  pre -120.0dB  fin NaN!');
      expect(line.length).toBeLessThanOrEqual(52);
    });

    it('adds exactly one line and leaves every existing line where it was', () => {
      const without = buildHudLines(snap(), world, 0).filter((l) => !l.startsWith('out'));
      const withLevels = buildHudLines(snap({}, { outputMaster: level(0.5, 0.25), outputPre: level(0.5, 0.25) }), world, 0);
      expect(withLevels.filter((l) => l.startsWith('out'))).toHaveLength(1);
      expect(withLevels.filter((l) => !l.startsWith('out'))).toEqual(without);
    });
  });

  describe('underruns line', () => {
    const underrunLine = (info: Partial<DiagInfo>) =>
      buildHudLines(snap({}, info), world, 0).find((l) => l.startsWith('underruns'));
    const reading = (overrides: Partial<NonNullable<DiagInfo['playback']>> = {}) => ({
      underrunEvents: 3,
      underrunDuration: 0.012,
      totalDuration: 30,
      averageLatency: 0.021,
      minimumLatency: 0.02,
      maximumLatency: 0.034,
      ...overrides,
    });

    it('reads the count, the total underrun time and the average (min-max) latency in milliseconds', () => {
      expect(underrunLine({ playback: reading() })).toBe('underruns 3 (12ms) · lat 21ms (20-34)');
    });

    it('reads a calm context as zero underruns', () => {
      expect(underrunLine({ playback: reading({ underrunEvents: 0, underrunDuration: 0, minimumLatency: 0 }) })).toBe(
        'underruns 0 (0ms) · lat 21ms (0-34)',
      );
    });

    it('says n/a when the browser has no playbackStats (absent, null or undefined)', () => {
      expect(underrunLine({ playback: null })).toBe('underruns n/a');
      expect(underrunLine({})).toBe('underruns n/a');
    });

    it('shows a dash for an unreadable latency, and one dash for a range with an unknown end, never NaN, null or undefined', () => {
      const line = underrunLine({ playback: reading({ averageLatency: NaN, minimumLatency: NaN, maximumLatency: Infinity }) })!;
      expect(line).toBe('underruns 3 (12ms) · lat - (-)');
      expect(line).not.toMatch(/NaN|null|undefined|Infinity/);
      expect(underrunLine({ playback: reading({ maximumLatency: NaN }) })).toBe('underruns 3 (12ms) · lat 21ms (-)');
    });

    it('shows a dash for an unreadable count or total underrun time', () => {
      expect(underrunLine({ playback: reading({ underrunEvents: NaN, underrunDuration: NaN }) })).toBe('underruns - (-) · lat 21ms (20-34)');
    });

    it('stays within 52 characters for large counts and latencies', () => {
      const line = underrunLine({ playback: reading({ underrunEvents: 99999, underrunDuration: 12.3456, averageLatency: 0.5, minimumLatency: 0.1, maximumLatency: 0.9 }) })!;
      expect(line).toBe('underruns 99999 (12346ms) · lat 500ms (100-900)');
      expect(line.length).toBeLessThanOrEqual(52);
    });

    it('sits directly under the output level line, and adds exactly one line', () => {
      const lines = buildHudLines(snap({}, { playback: reading() }), world, 0);
      const out = lines.findIndex((l) => l.startsWith('out'));
      expect(lines[out + 1]).toMatch(/^underruns /);
      expect(lines.filter((l) => l.startsWith('underruns'))).toHaveLength(1);
    });
  });

  it('renders unknown values as a dash rather than "null" or "NaN"', () => {
    const text = buildHudLines(
      snap({ clockRate: null, fps: null }, { baseLatencyMs: null }),
      world,
      0,
    ).join('\n');
    expect(text).not.toMatch(/null|NaN|undefined/);
    expect(text).toContain('-');
  });

  it('lists events with their uptime stamp, newest last', () => {
    const lines = buildHudLines(
      snap({ events: [{ atMs: 92_000, text: 'audio clock stalled (x0.00)' }, { atMs: 122_000, text: 'audio clock recovered after 30.0s' }] }),
      world,
      130_000,
    );
    const stalled = lines.findIndex((l) => l.includes('1:32') && l.includes('stalled'));
    const recovered = lines.findIndex((l) => l.includes('2:02') && l.includes('recovered'));
    expect(stalled).toBeGreaterThan(-1);
    expect(recovered).toBeGreaterThan(stalled);
  });

  it('says so when no events have happened yet', () => {
    expect(buildHudLines(snap(), world, 0).join('\n')).toMatch(/no events/i);
  });
});
