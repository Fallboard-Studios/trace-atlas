// ========================================
// IMPORTS
// ========================================
import { describe, it, expect } from 'vitest';

import { bodyLineDials, BODY_LINE_MIN, BODY_LINE_MAX, BODY_STRIP_OPACITY } from './bodyLineDials';
import type { LfoLink, RobotLfoTargetId } from '@/types/lfo';
import type { Robot } from '@/types/Robot';

// ========================================
// FIXTURES
// ========================================
/** Every robot target linked to lane `a` at depth 0, with the given overrides. */
function links(overrides: Partial<Record<RobotLfoTargetId, LfoLink>> = {}): NonNullable<Robot['lfoLinks']> {
  const off: LfoLink = { lane: 'a', depth: 0 };
  return {
    'layer0.gain': off,
    'layer0.detune': off,
    'layer1.gain': off,
    'layer1.detune': off,
    'layer2.gain': off,
    'layer2.detune': off,
    ...overrides,
  };
}

// ========================================
// TESTS
// ========================================
describe('bodyLineDials — width from gain-LFO depth (intent table row "Top/Mid line width")', () => {
  it.each([
    [0, 0.3],
    [50, 0.5],
    [100, 0.7],
  ])('depth %d on every gain target → width %d on every line', (depth, width) => {
    const d = bodyLineDials(
      links({
        'layer0.gain': { lane: 'a', depth },
        'layer1.gain': { lane: 'b', depth },
        'layer2.gain': { lane: 'c', depth },
      })
    );
    expect(d.top).toBeCloseTo(width, 10);
    expect(d.midLeft).toBeCloseTo(width, 10);
    expect(d.midRight).toBeCloseTo(width, 10);
  });

  it('depth 100 → BODY_LINE_MAX exactly (mutation: BODY_LINE_MAX → 0.8)', () => {
    expect(bodyLineDials(links({ 'layer0.gain': { lane: 'a', depth: 100 } })).top).toBe(0.7);
    expect(BODY_LINE_MAX).toBe(0.7);
  });
});

describe('bodyLineDials — each line reads its own target id', () => {
  it('layer0.gain moves only top', () => {
    const d = bodyLineDials(links({ 'layer0.gain': { lane: 'a', depth: 100 } }));
    expect(d).toEqual({ top: 0.7, midLeft: 0.3, midRight: 0.3 });
  });

  it('layer1.gain (Coaxial) moves only midLeft', () => {
    const d = bodyLineDials(links({ 'layer1.gain': { lane: 'a', depth: 100 } }));
    expect(d).toEqual({ top: 0.3, midLeft: 0.7, midRight: 0.3 });
  });

  it('layer2.gain (Harmonic) moves only midRight', () => {
    const d = bodyLineDials(links({ 'layer2.gain': { lane: 'a', depth: 100 } }));
    expect(d).toEqual({ top: 0.3, midLeft: 0.3, midRight: 0.7 });
  });

  it('detune links never move a line', () => {
    const d = bodyLineDials(
      links({
        'layer0.detune': { lane: 'a', depth: 100 },
        'layer1.detune': { lane: 'a', depth: 100 },
        'layer2.detune': { lane: 'a', depth: 100 },
      })
    );
    expect(d).toEqual({ top: 0.3, midLeft: 0.3, midRight: 0.3 });
  });
});

describe('bodyLineDials — unlinked and missing inputs read as depth 0', () => {
  it('lane: null with depth 80 → BODY_LINE_MIN (not in the graph at all)', () => {
    expect(bodyLineDials(links({ 'layer1.gain': { lane: null, depth: 80 } })).midLeft).toBe(0.3);
  });

  it('lfoLinks undefined → every line at BODY_LINE_MIN', () => {
    expect(bodyLineDials(undefined)).toEqual({ top: 0.3, midLeft: 0.3, midRight: 0.3 });
  });

  it('a missing link entry → that line at BODY_LINE_MIN', () => {
    const partial = { 'layer0.gain': { lane: 'a', depth: 100 } } as unknown as Robot['lfoLinks'];
    expect(bodyLineDials(partial)).toEqual({ top: 0.7, midLeft: 0.3, midRight: 0.3 });
  });
});

describe('bodyLineDials — depth clamped to LFO_DEPTH_MIN..MAX', () => {
  it('depth 150 → 0.7', () => {
    expect(bodyLineDials(links({ 'layer0.gain': { lane: 'a', depth: 150 } })).top).toBe(0.7);
  });

  it('depth -5 → 0.3', () => {
    expect(bodyLineDials(links({ 'layer0.gain': { lane: 'a', depth: -5 } })).top).toBe(0.3);
  });
});

describe('bodyLineDials — constants match the intent table / sketch defaults', () => {
  it('width 0.3–0.7, strip opacity fixed 0.6 (interview: not lit level, not gain)', () => {
    expect(BODY_LINE_MIN).toBe(0.3);
    expect(BODY_LINE_MAX).toBe(0.7);
    expect(BODY_STRIP_OPACITY).toBe(0.6);
  });
});
