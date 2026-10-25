// ========================================
// IMPORTS
// ========================================
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deflateSync, strToU8 } from 'fflate';

// worldLink first of the app's modules (the two packages above reach no store): sessionShareUtils.ts is imported by two
// stores at module init, so a store import creeping into the link's graph shows here as a failing import, not a silent
// undefined (docs/specs/SHORT_WORLD_LINK.md risk 2).
import {
  WORLD_LINK_BLOB_VERSION,
  WORLD_LINK_PARAMS,
  decodeBlob,
  encodeBlob,
  fromBase64Url,
  toBase64Url,
} from './worldLink';
import * as helpers from './helpers';
import { toCompactWorldDiff } from './sessionShareUtils';
import { diffWorldAgainstSeed, generateWorldSeedBaseline, type WorldDiff } from './seedBaseline';
import { FIXTURE_NAME, fullyEditedWorld } from '../testUtils/worldLinkFixtures';

// ========================================
// FIXTURES
// ========================================

const MULTI_BYTE_DIFF: WorldDiff = {
  globalAudio: { reverb: { decay: 4.2, preDelay: 0.05, wet: 0.8 } },
  bpm: 91,
  robotOverrides: { 'robot-1': { name: 'Ärger & Co — 7', pan: 0.25 } },
  userCreatedCompanies: [
    { id: 'c1', name: 'Ü Robotics 日本語', color: '#123456', robotIds: ['robot-1'] },
  ],
};

/** A blob of wire version 1 around arbitrary JSON text, built the way encodeBlob builds one. */
function blobOfJson(json: string): string {
  return `1.${toBase64Url(deflateSync(strToU8(json)))}`;
}

/** Everything after the first `.`. */
function textOf(blob: string): string {
  return blob.slice(blob.indexOf('.') + 1);
}

// ========================================
// TEST SUITE
// ========================================

describe('the world link constants', () => {
  it('names the params seed / x / y / s / theme and wire version 1 (spec assumptions 1, 2)', () => {
    expect(WORLD_LINK_PARAMS).toEqual({ seed: 'seed', x: 'x', y: 'y', blob: 's', theme: 'theme' });
    expect(WORLD_LINK_BLOB_VERSION).toBe(1);
  });
});

describe('toBase64Url / fromBase64Url', () => {
  it('round-trips every byte value and every length remainder, with no padding and no + or /', () => {
    const allBytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    for (let length = 0; length <= 7; length++) {
      const bytes = allBytes.slice(250 - length, 250);
      const text = toBase64Url(bytes);
      expect(text, String(length)).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(fromBase64Url(text), String(length)).toEqual(bytes);
    }
    const text = toBase64Url(allBytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(text).toContain('-');
    expect(text).toContain('_');
    expect(fromBase64Url(text)).toEqual(allBytes);
  });

  it('throws on text outside the alphabet or of an impossible length', () => {
    expect(() => fromBase64Url('!!')).toThrow();
    expect(() => fromBase64Url('abcde')).toThrow();
    expect(() => fromBase64Url('ab.c')).toThrow();
  });

  it('is strict base64url: standard base64 with + / or = padding is refused (spec assumption 2)', () => {
    expect(() => fromBase64Url('ab+/')).toThrow();
    expect(() => fromBase64Url('YQ==')).toThrow();
    expect(fromBase64Url('YQ')).toEqual(Uint8Array.of(0x61));
  });
});

describe('encodeBlob / decodeBlob', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('round-trips a diff with multi-byte names, and the blob is 1. then URL-safe text only', () => {
    const blob = encodeBlob(MULTI_BYTE_DIFF);
    expect(blob.startsWith('1.')).toBe(true);
    expect(textOf(blob)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(textOf(blob)).not.toMatch(/[+/=.]/);
    expect(decodeBlob(blob)).toEqual(MULTI_BYTE_DIFF);
  });

  it('round-trips the fully edited world, diffed against its seed', () => {
    const diff = diffWorldAgainstSeed(fullyEditedWorld(), generateWorldSeedBaseline(FIXTURE_NAME));
    expect(decodeBlob(encodeBlob(diff))).toEqual(diff);
  });

  it('is compressed: the text is shorter than the same compact JSON as plain base64url', () => {
    const diff = diffWorldAgainstSeed(fullyEditedWorld(), generateWorldSeedBaseline(FIXTURE_NAME));
    const uncompressed = toBase64Url(strToU8(JSON.stringify(toCompactWorldDiff(diff))));
    expect(textOf(encodeBlob(diff)).length).toBeLessThan(uncompressed.length);
  });

  it('an empty diff encodes to a blob that decodes to {}', () => {
    expect(decodeBlob(encodeBlob({}))).toEqual({});
  });

  it.each<[string, () => string]>([
    ['an unknown wire version', () => `2.${textOf(encodeBlob(MULTI_BYTE_DIFF))}`],
    ['a version with no dot', () => `1${textOf(encodeBlob(MULTI_BYTE_DIFF))}`],
    ['valid text with no version at all', () => textOf(encodeBlob(MULTI_BYTE_DIFF))],
    ['an empty version', () => '.abc'],
    ['a version of 01', () => `01.${textOf(encodeBlob(MULTI_BYTE_DIFF))}`],
    ['text that is not base64url', () => '1.!!'],
    ['an empty text', () => '1.'],
    ['base64url of bytes that are not deflate', () => `1.${toBase64Url(strToU8('not deflate'))}`],
    ['deflate of text that is not JSON', () => blobOfJson('this is not json')],
    ['deflate of an array', () => blobOfJson('[]')],
    ['deflate of a wrong-kind g', () => blobOfJson('{"g":5}')],
    ['a truncated blob', () => encodeBlob(MULTI_BYTE_DIFF).slice(0, 12)],
    ['an empty string', () => ''],
  ])('%s decodes to null without throwing, and warns once', (_label, makeBlob) => {
    const warn = vi.spyOn(helpers, 'devWarn').mockImplementation(() => {});
    const blob = makeBlob();
    expect(() => decodeBlob(blob)).not.toThrow();
    warn.mockClear();
    expect(decodeBlob(blob)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('a blob with a second dot in its text is refused, not misread (the text alphabet has no dot)', () => {
    vi.spyOn(helpers, 'devWarn').mockImplementation(() => {});
    const blob = encodeBlob(MULTI_BYTE_DIFF);
    expect(decodeBlob(`${blob.slice(0, 6)}.${blob.slice(6)}`)).toBeNull();
  });
});
