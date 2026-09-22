// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';

import { parseLatencyParam, parseDebugParam } from './debugParams';

// ========================================
// TESTS
// ========================================

describe('parseLatencyParam', () => {
  it('accepts the three Web Audio latency hints', () => {
    expect(parseLatencyParam('interactive')).toBe('interactive');
    expect(parseLatencyParam('balanced')).toBe('balanced');
    expect(parseLatencyParam('playback')).toBe('playback');
  });

  it('is case-insensitive', () => {
    expect(parseLatencyParam('PlayBack')).toBe('playback');
  });

  it('rejects null, empty, and unknown values (leaves Tone on its default)', () => {
    expect(parseLatencyParam(null)).toBeNull();
    expect(parseLatencyParam(undefined)).toBeNull();
    expect(parseLatencyParam('')).toBeNull();
    expect(parseLatencyParam('fast')).toBeNull();
    expect(parseLatencyParam('0.5')).toBeNull();
  });
});

describe('parseDebugParam', () => {
  it('treats a bare ?debug (empty string) and common truthy values as on', () => {
    expect(parseDebugParam('')).toBe(true);
    expect(parseDebugParam('1')).toBe(true);
    expect(parseDebugParam('true')).toBe(true);
    expect(parseDebugParam('audio')).toBe(true);
  });

  it('treats an absent param and explicit off values as off', () => {
    expect(parseDebugParam(null)).toBe(false);
    expect(parseDebugParam(undefined)).toBe(false);
    expect(parseDebugParam('0')).toBe(false);
    expect(parseDebugParam('false')).toBe(false);
    expect(parseDebugParam('off')).toBe(false);
  });
});

describe('boot-time URL params', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./debugParams');
  }

  it('is off / unset with no query string', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(fresh.isDebugEnabled()).toBe(false);
    expect(fresh.getLatencyOverride()).toBeNull();
  });

  it('reads ?debug and ?latency= independently', async () => {
    const both = await loadFreshWithQuery('?debug&latency=playback');
    expect(both.isDebugEnabled()).toBe(true);
    expect(both.getLatencyOverride()).toBe('playback');

    const latencyOnly = await loadFreshWithQuery('?latency=balanced');
    expect(latencyOnly.isDebugEnabled()).toBe(false);
    expect(latencyOnly.getLatencyOverride()).toBe('balanced');

    const debugOnly = await loadFreshWithQuery('?debug=1');
    expect(debugOnly.isDebugEnabled()).toBe(true);
    expect(debugOnly.getLatencyOverride()).toBeNull();
  });

  it('ignores an invalid ?latency= value', async () => {
    const fresh = await loadFreshWithQuery('?latency=warp');
    expect(fresh.getLatencyOverride()).toBeNull();
  });
});
