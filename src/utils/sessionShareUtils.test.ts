// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SessionPayload } from '../types/session';
import type { LfoLaneId, GlobalLfoTargetId, LfoLink, BankLfoSettings } from '../types/lfo';
import { LFO_LANE_IDS, GLOBAL_LFO_TARGET_IDS } from '../types/lfo';
import { DEFAULT_BANK_LFO, DEFAULT_LFO_LINK } from '../data/lfoConfig';
import { NOTE_VALUES, type NoteValue } from '../data/noteValues';
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

function makeLfoBank(overrides: Partial<Record<LfoLaneId, BankLfoSettings>> = {}): Record<LfoLaneId, BankLfoSettings> {
  const base: BankLfoSettings = { shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 };
  return Object.fromEntries(LFO_LANE_IDS.map((lane) => [lane, overrides[lane] ?? { ...base }])) as Record<LfoLaneId, BankLfoSettings>;
}

function makeGlobalLfoLinks(overrides: Partial<Record<GlobalLfoTargetId, LfoLink>> = {}): Record<GlobalLfoTargetId, LfoLink> {
  return Object.fromEntries(GLOBAL_LFO_TARGET_IDS.map((t) => [t, overrides[t] ?? { lane: null, depth: 0 }])) as Record<GlobalLfoTargetId, LfoLink>;
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

  it('round-trips lfoBank and globalLfoLinks on a version-2 payload (LFO Bank, docs/tasks/LFO_BANK.md Task 18)', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ b: { shape: 'triangle', rate: 3.5, rateDrift: 0.5, depthDrift: -0.75 } }),
      globalLfoLinks: makeGlobalLfoLinks({ 'eq3.low': { lane: 'c', depth: 42 } }),
    });
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('round-trips a robot\'s lfoLinks diff on a version-2 payload', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks(),
      robotOverrides: { 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 }, 'layer2.detune': { lane: null, depth: 0 } } } },
    });
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('omits the lane key on the wire for a null-lane link, and still round-trips', () => {
    const payload = makePayload({ version: 2, lfoBank: makeLfoBank(), globalLfoLinks: makeGlobalLfoLinks() });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { gll: Record<string, Record<string, unknown>> };
    expect(wire.gll['eq3.low']).not.toHaveProperty('l');
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('abbreviates lfoBank entries to {s,r,rd,dd}, global link entries to {l?,d}, and robot link entries under ll to {l?,d}', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ a: { shape: 'square', rate: 1.5, rateDrift: 0.25, depthDrift: -0.1 } }),
      globalLfoLinks: makeGlobalLfoLinks({ 'lpf.frequency': { lane: 'd', depth: 60 } }),
      robotOverrides: { 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as {
      lb: Record<string, Record<string, unknown>>;
      gll: Record<string, Record<string, unknown>>;
      r: Record<string, Record<string, unknown>>;
    };

    expect(Object.keys(wire.lb.a).sort()).toEqual(['dd', 'r', 'rd', 's']);
    expect(Object.keys(wire.gll['lpf.frequency']).sort()).toEqual(['d', 'l']);
    expect(Object.keys(wire.r['robot-1']).sort()).toEqual(['ll']);
    expect(Object.keys((wire.r['robot-1'].ll as Record<string, Record<string, unknown>>)['layer1.gain']).sort()).toEqual(['d', 'l']);
    expect(decodeSessionPayload(encodeSessionPayload(payload))).toEqual(payload);
  });

  it('a v1 blob carrying legacy lf/gl wire keys (pre-LFO-Bank share links) decodes with them dropped and everything else intact', () => {
    const payload = makePayload({ robotOverrides: { 'robot-1': { rhythmicDensity: 42 } } });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const robotWire = (wire.r as Record<string, unknown>)['robot-1'] as object;
    const legacyWire = {
      ...wire,
      gl: { 'eq3.low': { shape: 'sine', rate: 1, depth: 10 } },
      r: { 'robot-1': { ...robotWire, lf: { 'layer0.gain': { shape: 'sine', rate: 1, depth: 10 } } } },
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(legacyWire))));

    expect(decodeSessionPayload(encoded)).toEqual(payload);
  });

  it('a 12-robot world with ~20 lfoLinks encodes at a recorded size (wire-compaction follow-up tracked in docs/tasks/LFO_BANK.md Task 20)', () => {
    const robotOverrides: SessionPayload['robotOverrides'] = {};
    for (let i = 0; i < 12; i++) {
      robotOverrides[`robot-${i}`] = {
        lfoLinks: {
          'layer0.gain': { lane: 'a', depth: 20 },
          'layer1.detune': { lane: 'b', depth: 35 },
        },
      };
    }
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks({ 'eq3.low': { lane: 'c', depth: 40 } }),
      robotOverrides,
    });

    const encodedLength = encodeSessionPayload(payload).length;

    // Measured 2026-10-01: 1844 chars for this fixture (12 robots x 2 links + the 4-lane bank +
    // 1 global link). Generous bound, not a tight regression gate -- the wire-compaction
    // follow-up (Task 20) tracks this number if it ever needs shrinking.
    expect(encodedLength).toBeLessThan(2200);
  });

  it('drops an unknown/removed target key from gll and ll on decode, instead of carrying it through untyped', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks(),
      robotOverrides: { 'robot-1': { lfoLinks: { 'layer1.gain': { lane: 'a', depth: 30 } } } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const robotWire = (wire.r as Record<string, unknown>)['robot-1'] as { ll: Record<string, unknown> };
    const wireWithStaleKeys = {
      ...wire,
      gll: { ...(wire.gll as Record<string, unknown>), 'layer0.phase': { d: 10 } },
      r: { 'robot-1': { ...robotWire, ll: { ...robotWire.ll, 'layer0.phase': { d: 10 } } } },
    };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(wireWithStaleKeys))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.globalLfoLinks).not.toHaveProperty('layer0.phase');
    expect(decoded?.robotOverrides['robot-1']?.lfoLinks).not.toHaveProperty('layer0.phase');
    expect(decoded).toEqual(payload);
  });

  it('backfills a lane missing from lb with the default bank LFO on decode, instead of leaving it undefined', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ a: { shape: 'square', rate: 1.5, rateDrift: 0.25, depthDrift: -0.1 } }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const lb = wire.lb as Record<string, unknown>;
    const { b: _b, c: _c, d: _d, ...trimmedLb } = lb; // simulate a hand-trimmed/corrupted share link
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ ...wire, lb: trimmedLb }))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.lfoBank?.a).toEqual(payload.lfoBank!.a);
    expect(decoded?.lfoBank?.b).toEqual(DEFAULT_BANK_LFO);
    expect(decoded?.lfoBank?.c).toEqual(DEFAULT_BANK_LFO);
    expect(decoded?.lfoBank?.d).toEqual(DEFAULT_BANK_LFO);
  });

  it('backfills a target missing from gll with the default (unlinked) link on decode, instead of leaving it undefined', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank(),
      globalLfoLinks: makeGlobalLfoLinks({ 'eq3.low': { lane: 'c', depth: 42 } }),
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const gll = wire.gll as Record<string, unknown>;
    const { 'eq3.mid': _mid, ...trimmedGll } = gll; // simulate a hand-trimmed/corrupted share link
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ ...wire, gll: trimmedGll }))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.globalLfoLinks?.['eq3.low']).toEqual({ lane: 'c', depth: 42 });
    expect(decoded?.globalLfoLinks?.['eq3.mid']).toEqual(DEFAULT_LFO_LINK['eq3.mid']);
  });

  it('drops an unknown lane key from lb on decode, instead of carrying it through untyped', () => {
    const payload = makePayload({ version: 2, lfoBank: makeLfoBank(), globalLfoLinks: makeGlobalLfoLinks() });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as Record<string, unknown>;
    const wireWithStaleLane = { ...wire, lb: { ...(wire.lb as Record<string, unknown>), e: { s: 'sine', r: 1, rd: 0, dd: 0 } } };
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(wireWithStaleLane))));

    const decoded = decodeSessionPayload(encoded);

    expect(decoded?.lfoBank).not.toHaveProperty('e');
    expect(decoded).toEqual(payload);
  });

  it('decodeSessionPayload returns null when present-but-wrong-typed lb/gll would otherwise corrupt lfoBank/globalLfoLinks', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const arrayLb = { ...validWire, lb: ['not', 'a', 'record'] };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(arrayLb)))))).toBeNull();

    const stringGll = { ...validWire, gll: 'not an object' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringGll)))))).toBeNull();
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
          name: 'Renamed Bot',
        },
      },
      companyDiffs: { 'company-1': { name: 'Renamed Co', robotIds: ['robot-1'] } },
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { r: Record<string, Record<string, unknown>>; d: Record<string, Record<string, unknown>> };

    const robotWire = wire.r['robot-1'];
    expect(Object.keys(robotWire).sort()).toEqual(['a', 'f', 'l', 'nm', 'nv', 'or', 'pr', 'rd', 'rm']);
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

  it('decodeSessionPayload returns null when present-but-wrong-typed b/sf/sd/pv would otherwise corrupt bpm/swellFrequency/swellDuration/pingVarianceAutomation', () => {
    const validPayload = makePayload();
    const validWire = decodeRawWire(encodeSessionPayload(validPayload)) as Record<string, unknown>;

    const stringB = { ...validWire, b: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringB)))))).toBeNull();

    const stringSf = { ...validWire, sf: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringSf)))))).toBeNull();

    const stringSd = { ...validWire, sd: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringSd)))))).toBeNull();

    const stringPv = { ...validWire, pv: 'not a number' };
    expect(decodeSessionPayload(btoa(unescape(encodeURIComponent(JSON.stringify(stringPv)))))).toBeNull();
  });
});

// ========================================
// SYNC CODEC — docs/specs/FREE_SYNC_TOGGLE.md §1.8, docs/tasks/FREE_SYNC_TOGGLE.md Task 14
// ========================================

describe('lane `sync` on the wire (the `y` code)', () => {
  const FREE_LANE: BankLfoSettings = { shape: 'sine', rate: 2, rateDrift: 0.1, depthDrift: -0.2 };
  const nv = (division: NoteValue['division'], modifier: NoteValue['modifier'] = 'straight'): NoteValue => ({ division, modifier });

  /** A wire blob built by hand, re-encoded the way the app encodes it. */
  function encodeRawWire(wire: unknown): string {
    return btoa(unescape(encodeURIComponent(JSON.stringify(wire))));
  }

  /** A v2 payload whose lane `a` is the given lane; the other lanes are Free. */
  function payloadWithLaneA(lane: BankLfoSettings): SessionPayload {
    return makePayload({ version: 2, lfoBank: makeLfoBank({ a: lane }), globalLfoLinks: makeGlobalLfoLinks() });
  }

  /** The wire of `payloadWithLaneA(FREE_LANE)` with lane `a`'s `y` forced to `y`, decoded. */
  function decodeLaneAWithRawY(y: unknown): BankLfoSettings | undefined {
    const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA(FREE_LANE))) as { lb: Record<string, Record<string, unknown>> };
    wire.lb.a.y = y;
    return decodeSessionPayload(encodeRawWire(wire))?.lfoBank?.a;
  }

  it.each(NOTE_VALUES.map((v) => [`${v.division} ${v.modifier}`, v] as const))(
    'round-trips %s through `y`',
    (_label, sync) => {
      const payload = payloadWithLaneA({ ...FREE_LANE, sync });
      const decoded = decodeSessionPayload(encodeSessionPayload(payload));
      expect(decoded).toEqual(payload);
      expect(decoded?.lfoBank?.a.sync).toEqual(sync);
    },
  );

  it('writes the compact code: division token (32 16 8 4 2 1b 2b 4b) plus a modifier suffix (none / d / t)', () => {
    const expected: Array<[NoteValue, string]> = [
      [nv('1/32'), '32'], [nv('1/16'), '16'], [nv('1/8'), '8'], [nv('1/4'), '4'], [nv('1/2'), '2'],
      [nv('1'), '1b'], [nv('2'), '2b'], [nv('4'), '4b'],
      [nv('1/8', 'dotted'), '8d'], [nv('1/16', 'triplet'), '16t'], [nv('1/32', 'triplet'), '32t'],
      [nv('1', 'dotted'), '1bd'], [nv('1/2', 'triplet'), '2t'],
    ];
    for (const [sync, code] of expected) {
      const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA({ ...FREE_LANE, sync }))) as { lb: Record<string, { y?: string }> };
      expect(wire.lb.a.y, `${sync.division} ${sync.modifier}`).toBe(code);
    }
  });

  it('gives all 20 note values a distinct code', () => {
    const codes = new Set(
      NOTE_VALUES.map((sync) => {
        const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA({ ...FREE_LANE, sync }))) as { lb: Record<string, { y?: string }> };
        return wire.lb.a.y;
      }),
    );
    expect(codes.size).toBe(NOTE_VALUES.length);
    expect(codes.has(undefined)).toBe(false);
  });

  it('a Free lane adds no `y` to the wire — its entry is byte-for-byte the pre-Sync {s,r,rd,dd}', () => {
    const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA(FREE_LANE))) as { lb: Record<string, Record<string, unknown>> };
    for (const lane of LFO_LANE_IDS) expect(Object.keys(wire.lb[lane]).sort(), lane).toEqual(['dd', 'r', 'rd', 's']);
  });

  it('a synced lane adds exactly one key, `y`, and still carries its Free rate underneath', () => {
    const payload = payloadWithLaneA({ ...FREE_LANE, rate: 3.5, sync: nv('1/8', 'dotted') });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { lb: Record<string, Record<string, unknown>> };
    expect(Object.keys(wire.lb.a).sort()).toEqual(['dd', 'r', 'rd', 's', 'y']);
    expect(wire.lb.a.r).toBe(3.5);
    expect(decodeSessionPayload(encodeSessionPayload(payload))?.lfoBank?.a.rate).toBe(3.5);
  });

  it('a mixed Free / Sync bank round-trips toEqual, with each lane\'s own note', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({
        a: { ...FREE_LANE, sync: nv('1/8', 'dotted') },
        c: { ...FREE_LANE, shape: 'square', rate: 6, sync: nv('4') },
      }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const decoded = decodeSessionPayload(encodeSessionPayload(payload));
    expect(decoded).toEqual(payload);
    expect('sync' in decoded!.lfoBank!.b).toBe(false);
    expect('sync' in decoded!.lfoBank!.d).toBe(false);
  });

  it('a Free lane decodes with no `sync` key at all — not `sync: undefined`', () => {
    const decoded = decodeSessionPayload(encodeSessionPayload(payloadWithLaneA(FREE_LANE)));
    expect(decoded?.lfoBank?.a).toStrictEqual(FREE_LANE);
  });

  it('an absent `y` decodes to a lane with no `sync` key (a pre-Sync share link)', () => {
    expect(decodeLaneAWithRawY(undefined)).toStrictEqual(FREE_LANE);
  });

  it.each<[string, unknown]>([
    ['an empty string', ''],
    ['an unknown division', '3'],
    ['letters', 'x'],
    ['a typo\'d division', '4x'],
    ['a doubled modifier', '8dd'],
    ['a modifier the division does not offer: 2 bars dotted', '2bd'],
    ['a modifier the division does not offer: 4 bars triplet', '4bt'],
    ['an uppercase modifier', '8D'],
    ['surrounding whitespace', ' 4'],
    ['trailing whitespace', '4 '],
    ['a slash form of the division', '1/4'],
    ['an inherited-property name', 'constructor'],
    ['__proto__', '__proto__'],
    ['a number', 4],
    ['null', null],
    ['a boolean', true],
    ['an object', { division: '1/4', modifier: 'straight' }],
    ['an array', ['4']],
  ])('garbage `y` (%s) decodes to a Free lane — no `sync` key — without throwing', (_label, y) => {
    expect(() => decodeLaneAWithRawY(y)).not.toThrow();
    expect(decodeLaneAWithRawY(y)).toStrictEqual(FREE_LANE);
  });

  it('garbage `y` on one lane leaves every other lane and the rest of the payload intact', () => {
    const payload = makePayload({
      version: 2,
      lfoBank: makeLfoBank({ b: { ...FREE_LANE, sync: nv('1/4') } }),
      globalLfoLinks: makeGlobalLfoLinks(),
    });
    const wire = decodeRawWire(encodeSessionPayload(payload)) as { lb: Record<string, Record<string, unknown>> };
    wire.lb.a.y = 'garbage';
    const decoded = decodeSessionPayload(encodeRawWire(wire));
    expect(decoded?.lfoBank?.a).toStrictEqual(FREE_LANE);
    expect(decoded?.lfoBank?.b.sync).toEqual(nv('1/4'));
    expect(decoded?.coordinates).toEqual(payload.coordinates);
  });

  it('an in-memory lane carrying a bogus `sync` is written as Free — the encoder never emits a code it cannot vouch for', () => {
    const bogus = { ...FREE_LANE, sync: { division: '1/3', modifier: 'straight' } } as unknown as BankLfoSettings;
    const wire = decodeRawWire(encodeSessionPayload(payloadWithLaneA(bogus))) as { lb: Record<string, Record<string, unknown>> };
    expect(wire.lb.a).not.toHaveProperty('y');
    expect(decodeSessionPayload(encodeSessionPayload(payloadWithLaneA(bogus)))?.lfoBank?.a).toStrictEqual(FREE_LANE);
  });
});

describe('Delay `sync` travels inside `g` whole', () => {
  const delay = { delayTime: 0.3, feedback: 0.2, wet: 0.1 };

  it('round-trips a synced Delay with its note, needing no codec of its own', () => {
    const sync: NoteValue = { division: '1/8', modifier: 'dotted' };
    const payload = makePayload({ version: 2, globalAudio: { delay: { ...delay, sync } } as unknown as SessionPayload['globalAudio'] });
    const decoded = decodeSessionPayload(encodeSessionPayload(payload));
    expect(decoded).toEqual(payload);
    expect((decoded!.globalAudio as unknown as { delay: { sync: NoteValue } }).delay.sync).toEqual(sync);
  });

  it('a Free Delay stays Free — no `sync` key appears on the round trip', () => {
    const payload = makePayload({ version: 2, globalAudio: { delay } as unknown as SessionPayload['globalAudio'] });
    const decoded = decodeSessionPayload(encodeSessionPayload(payload));
    expect('sync' in (decoded!.globalAudio as unknown as { delay: object }).delay).toBe(false);
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
