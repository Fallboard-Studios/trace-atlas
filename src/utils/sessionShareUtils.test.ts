// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SessionPayload } from '../types/session';
import { encodeSessionPayload, decodeSessionPayload } from './sessionShareUtils';

// ========================================
// HELPERS
// ========================================

function makePayload(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    version: 1,
    attenuationStyleName: 'Pelagos 7!',
    coordinates: { x: -5, y: 777 },
    globalAudio: {} as SessionPayload['globalAudio'],
    robotOverrides: {},
    companyDiffs: {},
    userCreatedCompanies: [],
    ...overrides,
  };
}

// ========================================
// TESTS
// ========================================

describe('encodeSessionPayload / decodeSessionPayload', () => {
  it('round-trips a representative payload', () => {
    const payload = makePayload();
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('round-trips non-Latin1 characters (company/robot names are not charset-restricted)', () => {
    const payload = makePayload({
      userCreatedCompanies: [{ id: 'c1', name: 'Ü Robotics 日本語', color: '#123456', robotIds: [] }],
    });
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('decodeSessionPayload returns null (never throws) for invalid base64', () => {
    expect(decodeSessionPayload('not-valid-base64!!!')).toBeNull();
  });

  it('decodeSessionPayload returns null for valid base64 that is not JSON', () => {
    expect(decodeSessionPayload(btoa('this is not json'))).toBeNull();
  });

  it('decodeSessionPayload returns null for well-formed JSON that is not a SessionPayload shape', () => {
    expect(decodeSessionPayload(btoa(JSON.stringify({})))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify([])))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify('a string')))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify(null)))).toBeNull();
    expect(decodeSessionPayload(btoa(JSON.stringify({ attenuationStyleName: 'x' })))).toBeNull(); // missing coordinates
  });
});

describe('getSessionSharePayload (boot-time ?session= URL param)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./sessionShareUtils');
  }

  it('reflects a valid ?session= param present at module import time', async () => {
    const payload = makePayload();
    // encodeSessionPayload is pure/stateless, safe to use from the top-level import even
    // though getSessionSharePayload is read from a freshly re-imported module instance below.
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    expect(fresh.getSessionSharePayload()).toEqual(payload);
  });

  it('returns null when ?session= is absent', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(fresh.getSessionSharePayload()).toBeNull();
  });

  it('returns null when ?session= is present but malformed', async () => {
    const fresh = await loadFreshWithQuery('?session=not-valid-base64!!!');
    expect(fresh.getSessionSharePayload()).toBeNull();
  });
});
