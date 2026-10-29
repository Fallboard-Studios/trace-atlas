import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { heldOffSends, useHeldOffSends } from './useHeldOffSends';
import { useAudioStore } from '@/stores/audioStore';

// Light tier standing cost T12b (Crawford, 2026-10-29: "if they don't do anything they should be dimmed"): a send into
// a room the Audio Load dial holds dark does nothing, so its row dims.
describe('heldOffSends', () => {
  it('holds nothing off while the effects run', () => {
    expect(heldOffSends(false)).toEqual({ reverbSend: false, delaySend: false, gritSend: false, shimmerSend: false, doubleSend: false });
  });

  it('holds the three effect-room sends off while the effects are held off, and leaves the Reverb and Delay sends live', () => {
    expect(heldOffSends(true)).toEqual({ reverbSend: false, delaySend: false, gritSend: true, shimmerSend: true, doubleSend: true });
  });
});

describe('useHeldOffSends', () => {
  beforeEach(() => {
    useAudioStore.setState({ effectsHeldOff: false });
  });

  it('follows the store flag', () => {
    const { result } = renderHook(() => useHeldOffSends());
    expect(result.current.gritSend).toBe(false);
    act(() => useAudioStore.setState({ effectsHeldOff: true }));
    expect(result.current).toEqual(heldOffSends(true));
    act(() => useAudioStore.setState({ effectsHeldOff: false }));
    expect(result.current).toEqual(heldOffSends(false));
  });

  it('keeps its reference across a re-render and an unrelated store write, so a memoised section does not re-render', () => {
    const { result, rerender } = renderHook(() => useHeldOffSends());
    const before = result.current;
    rerender();
    act(() => useAudioStore.setState({ driftHeldOff: true }));
    act(() => useAudioStore.setState({ driftHeldOff: false }));
    expect(result.current).toBe(before);
  });
});
