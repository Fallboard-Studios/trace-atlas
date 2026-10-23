import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useAdsrSwellingFlags, useLayerSwellingFlags, useSendSwellingFlags } from './useSwellingFlags';
import { ROBOT_SEND_FIELDS } from '@/data/robotSends';
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

// docs/specs/ROBOT_SEND_TABLE.md §1.4 (Robot Send Table T11): the five send flags as one record, keyed by field. Unlike
// the ADSR and layer hooks it re-reads on every render (the five reads it replaces did, and a flag can flip on a render
// no send field caused), and keeps its object while the five answers are unchanged, so a memo keyed on it holds.
describe('useSendSwellingFlags', () => {
  it('returns all five sends, false by default, keyed in table order', () => {
    const { result } = renderHook(() => useSendSwellingFlags('r1'));
    expect(Object.keys(result.current)).toEqual([...ROBOT_SEND_FIELDS]);
    expect(Object.values(result.current)).toEqual([false, false, false, false, false]);
  });

  it.each(ROBOT_SEND_FIELDS)('reads %s for the robot, and only that flag is true', (field) => {
    swelling.add(`r1:${field}`);
    const { result } = renderHook(() => useSendSwellingFlags('r1'));
    for (const other of ROBOT_SEND_FIELDS) expect(result.current[other], other).toBe(other === field);
  });

  it('asks about this robot only, and only about the five sends', () => {
    swelling.add('r2:gritSend');
    swelling.add('r1:volume');
    vi.mocked(isRobotAttributeSwelling).mockClear();
    const { result } = renderHook(() => useSendSwellingFlags('r1'));
    expect(Object.values(result.current)).toEqual([false, false, false, false, false]);
    const asked = vi.mocked(isRobotAttributeSwelling).mock.calls.map(([id, attribute]) => `${id}:${attribute}`);
    expect(new Set(asked)).toEqual(new Set(ROBOT_SEND_FIELDS.map((field) => `r1:${field}`)));
  });

  it('is all false without a robot (a company with no members), and asks nothing', () => {
    vi.mocked(isRobotAttributeSwelling).mockClear();
    const { result } = renderHook(() => useSendSwellingFlags(undefined));
    expect(Object.values(result.current)).toEqual([false, false, false, false, false]);
    expect(isRobotAttributeSwelling).not.toHaveBeenCalled();
  });

  it('re-reads on every render: a flag that flips with no argument change reaches the next render', () => {
    const { result, rerender } = renderHook(() => useSendSwellingFlags('r1'));
    expect(result.current.delaySend).toBe(false);

    swelling.add('r1:delaySend');
    rerender();
    expect(result.current.delaySend).toBe(true);

    swelling.clear();
    rerender();
    expect(result.current.delaySend).toBe(false);
  });

  it('keeps its object while the five answers are unchanged, and hands a new one when one flips', () => {
    const { result, rerender } = renderHook(() => useSendSwellingFlags('r1'));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);

    swelling.add('r1:shimmerSend');
    rerender();
    const second = result.current;
    expect(second).not.toBe(first);
    rerender();
    expect(result.current).toBe(second);
  });

  it('follows a change of robot', () => {
    swelling.add('r2:doubleSend');
    const { result, rerender } = renderHook(({ id }) => useSendSwellingFlags(id), { initialProps: { id: 'r1' as string | undefined } });
    expect(result.current.doubleSend).toBe(false);
    rerender({ id: 'r2' });
    expect(result.current.doubleSend).toBe(true);
    rerender({ id: undefined });
    expect(result.current.doubleSend).toBe(false);
  });
});
