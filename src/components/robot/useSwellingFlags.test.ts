import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAdsrSwellingFlags, useLayerSwellingFlags } from './useSwellingFlags';
import { isRobotAttributeSwelling } from '@/systems/audioSwells';

vi.mock('@/systems/audioSwells', () => ({ isRobotAttributeSwelling: vi.fn(() => false) }));

const swelling = new Set<string>();

beforeEach(() => {
  swelling.clear();
  vi.mocked(isRobotAttributeSwelling).mockImplementation((id: string, attribute: string) => swelling.has(`${id}:${attribute}`));
});

describe('useAdsrSwellingFlags', () => {
  it('reads each envelope field for the robot', () => {
    swelling.add('r1:adsr.decay');
    const { result } = renderHook(() => useAdsrSwellingFlags('r1', {}));
    expect(result.current).toEqual({ attack: false, decay: true, sustain: false, release: false });
  });

  it('is undefined without a robot (a company with no members)', () => {
    const { result } = renderHook(() => useAdsrSwellingFlags(undefined, {}));
    expect(result.current).toBeUndefined();
  });

  it('keeps its object while the source and robot are unchanged, and recomputes when the source changes', () => {
    const first = {};
    const { result, rerender } = renderHook(({ source }) => useAdsrSwellingFlags('r1', source), { initialProps: { source: first as object } });
    const before = result.current;

    swelling.add('r1:adsr.attack');
    rerender({ source: first });
    expect(result.current).toBe(before);

    rerender({ source: {} });
    expect(result.current).not.toBe(before);
    expect(result.current?.attack).toBe(true);
  });
});

describe('useLayerSwellingFlags', () => {
  it.each([0, 1, 2] as const)('reads layer %i\'s four fields, and no other layer\'s', (index) => {
    swelling.add(`r1:layer${index}.pulseWidth`);
    swelling.add('r1:layer1.gain');
    const { result } = renderHook(() => useLayerSwellingFlags('r1', index, {}));
    expect(result.current).toEqual({ gain: index === 1, detune: false, phase: false, pulseWidth: true });
  });

  it('is undefined without a robot', () => {
    const { result } = renderHook(() => useLayerSwellingFlags(undefined, 0, {}));
    expect(result.current).toBeUndefined();
  });

  it('recomputes when the layer it is keyed on changes', () => {
    const { result, rerender } = renderHook(({ layer }) => useLayerSwellingFlags('r1', 2, layer), { initialProps: { layer: {} as object } });
    expect(result.current?.gain).toBe(false);

    swelling.add('r1:layer2.gain');
    rerender({ layer: {} });
    expect(result.current?.gain).toBe(true);
  });
});
