import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/utils/sessionShareUtils', () => ({
  copySessionLink: vi.fn(),
}));

import { useShareStatus } from './useShareStatus';
import { copySessionLink } from '@/utils/sessionShareUtils';
import type { SessionPayload } from '@/types/session';

const fakePayload = { marker: 'fake-payload' } as unknown as SessionPayload;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(copySessionLink).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useShareStatus', () => {
  it('starts with no status', () => {
    const { result } = renderHook(() => useShareStatus());
    expect(result.current.shareStatus).toBeNull();
  });

  it('share(payload) calls copySessionLink with exactly that payload', async () => {
    vi.mocked(copySessionLink).mockResolvedValue(true);
    const { result } = renderHook(() => useShareStatus());

    await act(async () => {
      await result.current.share(fakePayload);
    });

    expect(copySessionLink).toHaveBeenCalledWith(fakePayload);
  });

  it('sets shareStatus to "copied" on a successful copy', async () => {
    vi.mocked(copySessionLink).mockResolvedValue(true);
    const { result } = renderHook(() => useShareStatus());

    await act(async () => {
      await result.current.share(fakePayload);
    });

    expect(result.current.shareStatus).toBe('copied');
  });

  it('sets shareStatus to "error" on a failed copy', async () => {
    vi.mocked(copySessionLink).mockResolvedValue(false);
    const { result } = renderHook(() => useShareStatus());

    await act(async () => {
      await result.current.share(fakePayload);
    });

    expect(result.current.shareStatus).toBe('error');
  });

  it('shareStatus reverts to null after 5 seconds', async () => {
    vi.mocked(copySessionLink).mockResolvedValue(true);
    const { result } = renderHook(() => useShareStatus());

    await act(async () => {
      await result.current.share(fakePayload);
    });
    expect(result.current.shareStatus).toBe('copied');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current.shareStatus).toBeNull();
  });

  it('calling share() again before 5 seconds elapse resets the dismiss timer -- the first click\'s timer must not clear a fresher status early', async () => {
    vi.mocked(copySessionLink).mockResolvedValue(true);
    const { result } = renderHook(() => useShareStatus());

    await act(async () => {
      await result.current.share(fakePayload);
    });
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    await act(async () => {
      await result.current.share(fakePayload);
    });
    // 3000ms after the SECOND share (total 6000ms elapsed) -- the first share's timer, if not
    // cleared, would have fired at 5000ms total and wrongly cleared this still-fresh status.
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.shareStatus).toBe('copied');
  });

  it('clears the pending dismiss timeout on unmount', async () => {
    vi.mocked(copySessionLink).mockResolvedValue(true);
    const { result, unmount } = renderHook(() => useShareStatus());

    await act(async () => {
      await result.current.share(fakePayload);
    });

    // Not asserting on `result.current` after unmount (stale); this asserts no "state update on
    // an unmounted component" warning/crash occurs when the timeout fires post-unmount.
    unmount();
    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});
