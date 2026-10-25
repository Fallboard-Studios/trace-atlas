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
  decodeWorldLink,
  encodeBlob,
  encodeWorldLinkParams,
  fromBase64Url,
  toBase64Url,
} from './worldLink';
import * as helpers from './helpers';
import * as seedUtils from './seedUtils';
import { toCompactWorldDiff } from './sessionShareUtils';
import {
  diffWorldAgainstSeed,
  fillWorldFromSeed,
  generateWorldSeedBaseline,
  type WorldDiff,
} from './seedBaseline';
import {
  FIXTURE_COORDINATES,
  FIXTURE_NAME,
  fullyEditedWorld,
  untouchedWorld,
} from '../testUtils/worldLinkFixtures';
import { DEFAULT_GLOBAL_AUDIO_SETTINGS } from '../types/globalAudio';
import type { SessionPayload } from '../types/session';

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

// ----------------------------------------
// THE LINK: encodeWorldLinkParams / decodeWorldLink
// ----------------------------------------

/** A payload through the link and back, the way a pasted URL arrives. */
function throughLink(payload: SessionPayload): SessionPayload | null {
  return decodeWorldLink(`?${encodeWorldLinkParams(payload).toString()}`);
}

/** The payload a link with this identity and diff must decode to. */
function expectedWorld(
  name: string,
  coordinates: { x: number; y: number },
  diff: WorldDiff
): SessionPayload {
  return fillWorldFromSeed(
    { attenuationStyleName: name, coordinates },
    diff,
    generateWorldSeedBaseline(name)
  );
}

describe('encodeWorldLinkParams / decodeWorldLink', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('an untouched world encodes to exactly the bare triple, and decodes back deep-equal', () => {
    const payload = untouchedWorld(FIXTURE_NAME, { x: 29, y: -14 });
    const params = encodeWorldLinkParams(payload);
    expect(params.toString()).toBe('seed=n40dh8p8&x=29&y=-14');
    expect(decodeWorldLink(`?${params.toString()}`)).toEqual(payload);
  });

  it('the fully edited world round-trips through seed, x, y and s only', () => {
    const payload = fullyEditedWorld();
    const params = encodeWorldLinkParams(payload);
    expect([...params.keys()]).toEqual(['seed', 'x', 'y', 's']);
    expect(params.get('s')!.startsWith('1.')).toBe(true);
    expect(throughLink(payload)).toEqual(payload);
  });

  it('a world with one robot edited carries one s param holding just that robot', () => {
    const payload = untouchedWorld();
    payload.robotOverrides = { 'robot-4': { pan: -0.35 } };
    const params = encodeWorldLinkParams(payload);
    expect(decodeBlob(params.get('s')!)).toEqual({ robotOverrides: { 'robot-4': { pan: -0.35 } } });
    expect(throughLink(payload)).toEqual(payload);
  });

  it.each(['Pelagos 7!', 'ÄÖÜ ñ', 'a&b=c+d%e', ' padded ', 'MiXeD Case', 'x'.repeat(300)])(
    'the name %j round-trips byte for byte: nothing lowercases, trims, strips or caps it',
    (name) => {
      const payload = untouchedWorld(name, FIXTURE_COORDINATES);
      const decoded = throughLink(payload)!;
      expect(decoded.attenuationStyleName).toBe(name);
      expect(decoded).toEqual(payload);
    }
  );

  it('a hand-typed %20 or + reads as a space (URLSearchParams undoes both)', () => {
    expect(decodeWorldLink('?seed=Pelagos%207%21&x=1&y=2')!.attenuationStyleName).toBe(
      'Pelagos 7!'
    );
    expect(decodeWorldLink('?seed=Pelagos+7%21&x=1&y=2')!.attenuationStyleName).toBe('Pelagos 7!');
  });

  it('writes no param but seed, x, y and s, whatever the address bar holds', () => {
    window.history.replaceState(
      {},
      '',
      '/?debug&load=full&theme=dark&session=abc&latency=playback'
    );
    expect([...encodeWorldLinkParams(untouchedWorld()).keys()]).toEqual(['seed', 'x', 'y']);
    expect([...encodeWorldLinkParams(fullyEditedWorld()).keys()]).toEqual(['seed', 'x', 'y', 's']);
  });

  it('reads neither theme nor session beside a triple', () => {
    expect(decodeWorldLink('?seed=n40dh8p8&x=29&y=-14&theme=dark&session=eyJ2IjoyfQ')).toEqual(
      untouchedWorld()
    );
  });

  describe('lenient loading (spec §1.4): every part falls back on its own', () => {
    function spyRandoms() {
      const name = vi
        .spyOn(seedUtils, 'generateRandomAttenuationStyleName')
        .mockReturnValue('r4nd0m00');
      const coordinate = vi.spyOn(seedUtils, 'randomCoordinate');
      coordinate.mockReturnValueOnce(7).mockReturnValueOnce(-3);
      return { name, coordinate };
    }

    it.each(['', '?', '?debug&load=full', '?theme=dark', '?latency=playback&fxLoad=lite'])(
      'nothing relevant (%j) is null, and draws nothing random',
      (search) => {
        const randoms = spyRandoms();
        expect(decodeWorldLink(search)).toBeNull();
        expect(randoms.name).not.toHaveBeenCalled();
        expect(randoms.coordinate).not.toHaveBeenCalled();
      }
    );

    it('a ?session= link alone is null: it is not read', () => {
      expect(
        decodeWorldLink('?session=eyJ2IjoyLCJuIjoiYWxwaGEiLCJjIjp7IngiOjAsInkiOjUwfX0=')
      ).toBeNull();
    });

    it('a seed alone: the exact name, both coordinates random', () => {
      const randoms = spyRandoms();
      expect(decodeWorldLink('?seed=Pelagos%207%21')).toEqual(
        expectedWorld('Pelagos 7!', { x: 7, y: -3 }, {})
      );
      expect(randoms.name).not.toHaveBeenCalled();
      expect(randoms.coordinate).toHaveBeenCalledTimes(2);
    });

    it('an empty seed is a missing one: a random name', () => {
      const randoms = spyRandoms();
      expect(decodeWorldLink('?seed=&x=29&y=-14')).toEqual(
        expectedWorld('r4nd0m00', { x: 29, y: -14 }, {})
      );
      expect(randoms.name).toHaveBeenCalledTimes(1);
      expect(randoms.coordinate).not.toHaveBeenCalled();
    });

    it.each(['?x=5', '?x=5&y=1.5', '?x=5&y=abc', '?x=5&y=', '?x=5&y=%2B4', '?x=5&y=4e2'])(
      'x alone or with a bad y (%s): a random name, x = 5, y random',
      (search) => {
        const randoms = spyRandoms();
        randoms.coordinate.mockReset().mockReturnValueOnce(-3);
        expect(decodeWorldLink(search)).toEqual(expectedWorld('r4nd0m00', { x: 5, y: -3 }, {}));
        expect(randoms.name).toHaveBeenCalledTimes(1);
        expect(randoms.coordinate).toHaveBeenCalledTimes(1);
      }
    );

    it('a y alone: a random name and x, the given y', () => {
      const randoms = spyRandoms();
      expect(decodeWorldLink('?y=-40')).toEqual(expectedWorld('r4nd0m00', { x: 7, y: -40 }, {}));
      expect(randoms.coordinate).toHaveBeenCalledTimes(1);
    });

    it('x=-0 reads as 0, and a leading zero is still an integer', () => {
      const decoded = decodeWorldLink('?seed=a&x=-0&y=007')!;
      expect(Object.is(decoded.coordinates.x, 0)).toBe(true);
      expect(decoded.coordinates.y).toBe(7);
    });

    it('a triple draws nothing random', () => {
      const randoms = spyRandoms();
      expect(decodeWorldLink('?seed=n40dh8p8&x=29&y=-14')).toEqual(untouchedWorld());
      expect(randoms.name).not.toHaveBeenCalled();
      expect(randoms.coordinate).not.toHaveBeenCalled();
    });

    it.each<[string, () => string]>([
      ['an unknown wire version', () => `2.${textOf(encodeBlob({ bpm: 99 }))}`],
      ['text that is not base64url', () => '1.!!'],
      [
        'a truncated blob',
        () => encodeBlob({ bpm: 99, robotOverrides: { r: { pan: 0.5 } } }).slice(0, 9),
      ],
      ['deflate of a wrong-kind g', () => blobOfJson('{"g":5}')],
    ])('a triple with %s loads the bare world', (_label, makeBlob) => {
      vi.spyOn(helpers, 'devWarn').mockImplementation(() => {});
      const search = `?seed=n40dh8p8&x=29&y=-14&s=${encodeURIComponent(makeBlob())}`;
      expect(decodeWorldLink(search)).toEqual(untouchedWorld());
    });

    it('a blob alone is applied over a random world: random name and coordinates, the blob on top', () => {
      const randoms = spyRandoms();
      const diff: WorldDiff = { bpm: 99, robotOverrides: { 'robot-2': { pan: 0.5 } } };
      expect(decodeWorldLink(`?s=${encodeBlob(diff)}`)).toEqual(
        expectedWorld('r4nd0m00', { x: 7, y: -3 }, diff)
      );
      expect(randoms.name).toHaveBeenCalledTimes(1);
      expect(randoms.coordinate).toHaveBeenCalledTimes(2);
    });
  });

  it('a blob with only g.reverb and lb.b fills everything else from the seed', () => {
    const baseline = generateWorldSeedBaseline(FIXTURE_NAME);
    const reverb = { ...baseline.globalAudio.reverb, decay: baseline.globalAudio.reverb.decay + 2 };
    const laneB = { ...baseline.lfoBank.b, rate: 0 };
    const decoded = decodeWorldLink(
      `?seed=${FIXTURE_NAME}&x=29&y=-14&s=${encodeBlob({ globalAudio: { reverb }, lfoBank: { b: laneB } })}`
    )!;
    expect(decoded.globalAudio).toEqual({ ...baseline.globalAudio, reverb });
    expect(decoded.lfoBank).toEqual({ ...baseline.lfoBank, b: laneB });
    expect(decoded).toEqual({
      ...untouchedWorld(),
      globalAudio: { ...baseline.globalAudio, reverb },
      lfoBank: { ...baseline.lfoBank, b: laneB },
    });
  });

  it('keeps an override for a robot id the roster lacks (applySessionPayload skips it, not the decoder)', () => {
    const decoded = decodeWorldLink(
      `?seed=${FIXTURE_NAME}&x=29&y=-14&s=${encodeBlob({ robotOverrides: { nobody: { pan: 0.2 } } })}`
    )!;
    expect(decoded.robotOverrides).toEqual({ nobody: { pan: 0.2 } });
  });

  it('the params define the identity; a stray n / c inside the blob is ignored', () => {
    const blob = blobOfJson('{"v":2,"n":"other","c":{"x":1,"y":2},"b":90}');
    const decoded = decodeWorldLink(`?seed=${FIXTURE_NAME}&x=29&y=-14&s=${blob}`)!;
    expect(decoded.attenuationStyleName).toBe(FIXTURE_NAME);
    expect(decoded.coordinates).toEqual({ x: 29, y: -14 });
    expect(decoded.bpm).toBe(90);
  });

  it('two decodes share nothing: editing one never changes the next or the shared defaults', () => {
    const search = `?${encodeWorldLinkParams(untouchedWorld()).toString()}`;
    const first = decodeWorldLink(search)!;
    first.globalAudio.bitCrusher.wet = 0.99;
    first.globalAudio.reverb.decay = 99;
    first.lfoBank!.a.rate = 99;
    const second = decodeWorldLink(search)!;
    expect(second).toEqual(untouchedWorld());
    expect(DEFAULT_GLOBAL_AUDIO_SETTINGS.bitCrusher.wet).toBe(0);
  });
});
