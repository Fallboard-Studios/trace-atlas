import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { heldOffSends, useHeldOffSends } from './useHeldOffSends';
import { useAudioStore } from '@/stores/audioStore';

// Light tier standing cost T12b (Crawford, 2026-10-29: "if they don't do anything they should be dimmed"): a send into
// a room the Audio Load dial holds dark does nothing, so its row dims.
describe('heldOffSends', () => {
  it('holds nothing off while the effects and the Reverb run', () => {
    expect(heldOffSends(false, false)).toEqual({ reverbSend: false, delaySend: false, gritSend: false, shimmerSend: false, doubleSend: false });
  });

  it('holds the three effect-room sends off while the effects are held off, and leaves the Reverb and Delay sends live', () => {
    expect(heldOffSends(true, false)).toEqual({ reverbSend: false, delaySend: false, gritSend: true, shimmerSend: true, doubleSend: true });
  });

  // T19: the Reverb off at Light.
  it('holds the Reverb send off while the Reverb is held off, on its own or with the effects; the Delay send never', () => {
    expect(heldOffSends(false, true)).toEqual({ reverbSend: true, delaySend: false, gritSend: false, shimmerSend: false, doubleSend: false });
    expect(heldOffSends(true, true)).toEqual({ reverbSend: true, delaySend: false, gritSend: true, shimmerSend: true, doubleSend: true });
  });
});

describe('useHeldOffSends', () => {
  beforeEach(() => {
    useAudioStore.setState({ effectsHeldOff: false, reverbHeldOff: false });
  });

  it('follows the store flag', () => {
    const { result } = renderHook(() => useHeldOffSends());
    expect(result.current.gritSend).toBe(false);
    act(() => useAudioStore.setState({ effectsHeldOff: true }));
    expect(result.current).toEqual(heldOffSends(true, false));
    act(() => useAudioStore.setState({ reverbHeldOff: true }));
    expect(result.current).toEqual(heldOffSends(true, true));
    act(() => useAudioStore.setState({ effectsHeldOff: false, reverbHeldOff: false }));
    expect(result.current).toEqual(heldOffSends(false, false));
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
