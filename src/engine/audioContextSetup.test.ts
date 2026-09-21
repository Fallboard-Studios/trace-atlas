// ========================================
// IMPORTS
// ========================================
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ========================================
// MOCKS
// ========================================
const setContext = vi.fn();
const ContextCtor = vi.fn(function (this: { options?: unknown }, options?: unknown) {
  this.options = options;
});

vi.mock('tone', () => ({
  setContext: (...args: unknown[]) => setContext(...args),
  Context: ContextCtor,
}));

// ========================================
// TESTS
// ========================================

describe('audioContextSetup (?latency= opt-in)', () => {
  beforeEach(() => {
    setContext.mockClear();
    ContextCtor.mockClear();
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./audioContextSetup');
  }

  it('leaves Tone on its default context when no ?latency= is given', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(setContext).not.toHaveBeenCalled();
    expect(ContextCtor).not.toHaveBeenCalled();
    expect(fresh.appliedLatencyHint).toBeNull();
  });

  it('leaves Tone on its default context for an invalid ?latency= value', async () => {
    const fresh = await loadFreshWithQuery('?latency=warp');
    expect(setContext).not.toHaveBeenCalled();
    expect(fresh.appliedLatencyHint).toBeNull();
  });

  it('installs a Tone.Context with the requested latencyHint at import time', async () => {
    const fresh = await loadFreshWithQuery('?latency=playback');
    expect(ContextCtor).toHaveBeenCalledTimes(1);
    expect(ContextCtor).toHaveBeenCalledWith({ latencyHint: 'playback' });
    expect(setContext).toHaveBeenCalledTimes(1);
    expect(setContext.mock.calls[0][0]).toBeInstanceOf(ContextCtor);
    // disposeOld = true: importing 'tone' itself already created a default "interactive" context
    // (its deprecated Transport/Destination/Draw/Listener exports call getContext() at import), and
    // nothing should be left running on it.
    expect(setContext.mock.calls[0][1]).toBe(true);
    expect(fresh.appliedLatencyHint).toBe('playback');
  });
});
