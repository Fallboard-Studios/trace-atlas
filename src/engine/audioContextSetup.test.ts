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

// This module runs before any Tone node exists, so it must never pull in a store: importing one would throw here.
vi.mock('../stores/audioStore', () => {
  throw new Error('audioContextSetup must not import audioStore');
});
vi.mock('../stores/localeStore', () => {
  throw new Error('audioContextSetup must not import localeStore');
});

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

// Audio Load Budget (docs/specs/AUDIO_LOAD_BUDGET.md §1.5, plan task 23): with no explicit ?latency=, the preset in force at
// page load — from ?load= or, failing that, device detection — chooses the hint. Light selects playback; Standard and Full
// leave Tone's own default (interactive) untouched. A context's hint is fixed at creation, so only the boot-time preset counts.
describe('audioContextSetup (boot-time Audio Load preset)', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    setContext.mockClear();
    ContextCtor.mockClear();
  });

  afterEach(() => {
    window.history.replaceState({}, '/', '/');
    window.matchMedia = originalMatchMedia;
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./audioContextSetup');
  }

  const coarsePointer = () => {
    window.matchMedia = vi.fn((q: string) => ({ matches: q === '(pointer: coarse)' })) as unknown as typeof window.matchMedia;
  };

  it("?load=light installs a playback context, replacing Tone's default", async () => {
    const fresh = await loadFreshWithQuery('?load=light');
    expect(ContextCtor).toHaveBeenCalledWith({ latencyHint: 'playback' });
    expect(setContext).toHaveBeenCalledTimes(1);
    expect(setContext.mock.calls[0][1]).toBe(true);
    expect(fresh.appliedLatencyHint).toBe('playback');
  });

  it("?load=full installs nothing (Tone's interactive default stays); ?load=standard installs playback (decision J)", async () => {
    setContext.mockClear();
    const full = await loadFreshWithQuery('?load=full');
    expect(setContext).not.toHaveBeenCalled();
    expect(full.appliedLatencyHint).toBeNull();

    setContext.mockClear();
    const standard = await loadFreshWithQuery('?load=standard');
    expect(setContext).toHaveBeenCalled();
    expect(standard.appliedLatencyHint).toBe('playback');
  });

  it('follows the dial threshold for a custom percent: 60 % is playback, 61 % is not (decision J: the threshold sits above Standard’s anchor)', async () => {
    expect((await loadFreshWithQuery('?load=60')).appliedLatencyHint).toBe('playback');
    setContext.mockClear();
    expect((await loadFreshWithQuery('?load=61')).appliedLatencyHint).toBeNull();
    expect(setContext).not.toHaveBeenCalled();
  });

  it('an explicit ?latency= still wins over the preset, in both directions', async () => {
    expect((await loadFreshWithQuery('?latency=balanced&load=light')).appliedLatencyHint).toBe('balanced');
    expect(ContextCtor).toHaveBeenLastCalledWith({ latencyHint: 'balanced' });
    expect((await loadFreshWithQuery('?latency=interactive&load=light')).appliedLatencyHint).toBe('interactive');
    expect((await loadFreshWithQuery('?load=full&latency=playback')).appliedLatencyHint).toBe('playback');
  });

  it("a phone-like device (coarse pointer) with no params defaults to Light's playback hint", async () => {
    coarsePointer();
    const fresh = await loadFreshWithQuery('');
    expect(ContextCtor).toHaveBeenCalledWith({ latencyHint: 'playback' });
    expect(fresh.appliedLatencyHint).toBe('playback');
  });

  it('a desktop with no params installs nothing — no behavior change', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(setContext).not.toHaveBeenCalled();
    expect(fresh.appliedLatencyHint).toBeNull();
  });

  it('?load= beats device detection: full on a phone installs nothing, light on a desktop installs playback', async () => {
    coarsePointer();
    expect((await loadFreshWithQuery('?load=full')).appliedLatencyHint).toBeNull();
    window.matchMedia = originalMatchMedia;
    expect((await loadFreshWithQuery('?load=light')).appliedLatencyHint).toBe('playback');
  });

  it('an invalid ?load= falls back to detection', async () => {
    expect((await loadFreshWithQuery('?load=bogus')).appliedLatencyHint).toBeNull();
    coarsePointer();
    expect((await loadFreshWithQuery('?load=bogus')).appliedLatencyHint).toBe('playback');
  });

  it('treats a missing or throwing matchMedia as a non-phone: nothing installed', async () => {
    // @ts-expect-error — simulating an environment without matchMedia
    window.matchMedia = undefined;
    expect((await loadFreshWithQuery('')).appliedLatencyHint).toBeNull();
    window.matchMedia = (() => {
      throw new Error('boom');
    }) as unknown as typeof window.matchMedia;
    expect((await loadFreshWithQuery('')).appliedLatencyHint).toBeNull();
  });

  it('installs at most one context per load', async () => {
    coarsePointer();
    await loadFreshWithQuery('?load=light');
    expect(ContextCtor).toHaveBeenCalledTimes(1);
    expect(setContext).toHaveBeenCalledTimes(1);
  });
});
