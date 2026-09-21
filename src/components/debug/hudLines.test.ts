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
