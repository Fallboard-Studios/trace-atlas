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

  it('omits bpm/swellFrequency/swellDuration/pingVarianceAutomation from the wire entirely when absent from the payload', () => {
    const payload = makePayload();
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire).not.toHaveProperty('b');
    expect(wire).not.toHaveProperty('sf');
    expect(wire).not.toHaveProperty('sd');
    expect(wire).not.toHaveProperty('pv');
  });

  it('includes and round-trips bpm/swellFrequency/swellDuration/pingVarianceAutomation when present, via abbreviated wire keys', () => {
    const payload = makePayload({ bpm: 77, swellFrequency: 9, swellDuration: 5, pingVarianceAutomation: 0.42 });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    expect(wire.b).toBe(77);
    expect(wire.sf).toBe(9);
    expect(wire.sd).toBe(5);
    expect(wire.pv).toBe(0.42);
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

  it('abbreviates robotOverrides/companyDiffs field names on the wire too -- not just the top level (12 robots multiplies these)', () => {
    const payload = makePayload({
      robotOverrides: {
        'robot-1': {
          adsr: { attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3 },
          layers: [{ type: 'sine', gain: 1, detune: 0, phase: 0, pulseWidth: 0.5 }],
          filterFreq: 800,
          rhythmicDensity: 42,
          rhythmicMotifLength: { active: true, value: 4 },
          noteVariance: { active: false, value: 0 },
          pitchRepeat: 50,
          octaveRange: [3, 5],
          lfoSettings: { volume: { shape: 'sine', rate: 1.2, depth: 0.3 } },
          name: 'Renamed Bot',
        },
      },
      companyDiffs: { 'company-1': { name: 'Renamed Co', robotIds: ['robot-1'] } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>>; d: Record<string, Record<string, unknown>> };

    const robotWire = wire.r['robot-1'];
    expect(Object.keys(robotWire).sort()).toEqual(['a', 'f', 'l', 'lf', 'nm', 'nv', 'or', 'pr', 'rd', 'rm']);
    expect(robotWire).not.toHaveProperty('adsr');
    expect(robotWire).not.toHaveProperty('rhythmicDensity');
    expect(Object.keys(robotWire.a as object).sort()).toEqual(['at', 'dc', 'rl', 'su']);
    expect(Object.keys((robotWire.l as unknown[])[0] as object).sort()).toEqual(['dt', 'g', 'ph', 'pw', 't']);
    expect(Object.keys(robotWire.rm as object).sort()).toEqual(['a', 'v']);

    const companyWire = wire.d['company-1'];
    expect(Object.keys(companyWire).sort()).toEqual(['n', 'r']);

    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('omits optional nested fields (e.g. a layer with no pulseWidth) from the wire, and still round-trips', () => {
    const payload = makePayload({
      robotOverrides: {
        'robot-1': { layers: [{ type: 'square', gain: 0.8, detune: 5, phase: 0 }] },
      },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, { l: [Record<string, unknown>] }> };
    expect(wire.r['robot-1'].l[0]).not.toHaveProperty('pw');
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

  it('decodeSessionPayload returns null when g (globalAudio) is missing or the wrong type -- the specific field that would otherwise crash applyGlobalAudioToEngine with no guard', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const missingG = { ...validWire };
    delete missingG.g;
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(missingG)))))).toBeNull();

    const wrongTypeG = { ...validWire, g: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(wrongTypeG)))))).toBeNull();

    const nullG = { ...validWire, g: null };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(nullG)))))).toBeNull();
  });

  it('decodeSessionPayload returns null when c.x/c.y are missing or not numbers', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const emptyCoords = { ...validWire, c: {} };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(emptyCoords)))))).toBeNull();

    const stringCoords = { ...validWire, c: { x: '1', y: '2' } };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringCoords)))))).toBeNull();

    const nonObjectCoords = { ...validWire, c: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(nonObjectCoords)))))).toBeNull();
  });

  it('decodeSessionPayload returns null when present-but-wrong-typed r/d/u would otherwise corrupt robotOverrides/companyDiffs/userCreatedCompanies', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const arrayR = { ...validWire, r: ['not', 'a', 'record'] };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(arrayR)))))).toBeNull();

    const stringD = { ...validWire, d: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringD)))))).toBeNull();

    const objectU = { ...validWire, u: { not: 'an array' } };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(objectU)))))).toBeNull();
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

  it('getSessionSharePayload keeps returning the same value on every call -- unaffected by consumeSessionSharePayload', async () => {
    const payload = makePayload();
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    fresh.consumeSessionSharePayload();
    expect(fresh.getSessionSharePayload()).toEqual(payload);
    expect(fresh.getSessionSharePayload()).toEqual(payload);
  });
});

describe('consumeSessionSharePayload (one-time-per-page-load consumption)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  async function loadFreshWithQuery(query: string) {
    window.history.replaceState({}, '', `/${query}`);
    vi.resetModules();
    return import('./sessionShareUtils');
  }

  it('returns the payload on the first call', async () => {
    const payload = makePayload();
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    expect(fresh.consumeSessionSharePayload()).toEqual(payload);
  });

  it('returns null on every call after the first -- the power-cycle regression guard', async () => {
    const payload = makePayload();
    const fresh = await loadFreshWithQuery(`?session=${encodeSessionPayload(payload)}`);
    fresh.consumeSessionSharePayload();
    expect(fresh.consumeSessionSharePayload()).toBeNull();
    expect(fresh.consumeSessionSharePayload()).toBeNull();
  });

  it('returns null on the first call too when no share payload was present', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(fresh.consumeSessionSharePayload()).toBeNull();
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
