// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SessionPayload } from '../types/session';
import { encodeSessionPayload, decodeSessionPayload, buildShareUrl, copySessionLink } from './sessionShareUtils';

// ========================================
// HELPERS
// ========================================

/** Decodes an encodeSessionPayload() output back to its raw wire JSON object -- bypassing
 *  decodeSessionPayload's own expansion, so a test can inspect the actual bytes-on-the-wire
 *  shape (abbreviated keys, omitted-when-empty fields) rather than the reconstructed SessionPayload. */
function decodeRawWire(encoded: string): unknown {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

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

  it('omits empty robotOverrides/companyDiffs/userCreatedCompanies from the wire encoding entirely -- only what changed is sent', () => {
    const payload = makePayload({ robotOverrides: {}, companyDiffs: {}, userCreatedCompanies: [] });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire).not.toHaveProperty('r');
    expect(wire).not.toHaveProperty('d');
    expect(wire).not.toHaveProperty('u');
  });

  it('includes robotOverrides/companyDiffs/userCreatedCompanies on the wire when non-empty, and they still round-trip', () => {
    const payload = makePayload({
      robotOverrides: { 'robot-1': { rhythmicDensity: 42 } },
      companyDiffs: { 'company-1': { name: 'Renamed Co' } },
      userCreatedCompanies: [{ id: 'c1', name: 'User Co', color: '#abcdef', robotIds: [] }],
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire).toHaveProperty('r');
    expect(wire).toHaveProperty('d');
    expect(wire).toHaveProperty('u');
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('uses abbreviated top-level keys on the wire, not the full SessionPayload field names', () => {
    const payload = makePayload();
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(Object.keys(wire).sort()).toEqual(['c', 'g', 'n', 'v']);
    expect(wire).not.toHaveProperty('attenuationStyleName');
    expect(wire).not.toHaveProperty('coordinates');
  });

  it('a typical mostly-empty share is meaningfully smaller than the naive full-field encoding', () => {
    const payload = makePayload();
    const compactLength = encodeSessionPayload(payload).length;
    const naiveLength = btoa(unescape(encodeURIComponent(JSON.stringify(payload)))).length;
    expect(compactLength).toBeLessThan(naiveLength);
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

describe('buildShareUrl', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('builds origin + pathname + exactly one ?session= param', () => {
    window.history.replaceState({}, '', '/some/path');
    const payload = makePayload();
    const url = buildShareUrl(payload);
    const expected = new URL(`${window.location.origin}/some/path`);
    expected.searchParams.set('session', encodeSessionPayload(payload));
    expect(url).toBe(expected.toString());
  });

  it('drops any other query params currently in the address bar', () => {
    window.history.replaceState({}, '', '/?debug&seed=x');
    const payload = makePayload();
    const url = buildShareUrl(payload);
    const parsed = new URL(url);
    expect(Array.from(parsed.searchParams.keys())).toEqual(['session']);
  });
});

describe('copySessionLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('writes buildShareUrl\'s exact output to the clipboard and resolves true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const payload = makePayload();

    const result = await copySessionLink(payload);

    expect(writeText).toHaveBeenCalledWith(buildShareUrl(payload));
    expect(result).toBe(true);
  });

  it('resolves false (never throws/rejects) when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copySessionLink(makePayload());

    expect(result).toBe(false);
  });
});
