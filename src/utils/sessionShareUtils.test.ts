// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SessionPayload } from '../types/session';
import type { WorldIdentity } from './seedBaseline';
import { buildShareUrl, copySessionLink, mirrorWorldToUrl, searchOf } from './sessionShareUtils';
import { decodeWorldLink, encodeBlob } from './worldLink';
import { FIXTURE_COORDINATES, FIXTURE_NAME, untouchedWorld } from '../testUtils/worldLinkFixtures';
import type { LoadingIdentity } from '../data/bands/loadingIdentity';

// ========================================
// HELPERS
// ========================================

/** The seam's link (docs/tasks/SHORT_WORLD_LINK.md Task 7): a hand-typed name with a space and a `!`, both
 *  percent-encoded, non-zero coordinates (one negative) and a blob carrying one robot override. */
const ROBOT_OVERRIDE = { 'robot-3': { pan: 0.4, reverbSend: 0.15 } };
const SEAM_LINK = `?seed=Pelagos%207%21&x=29&y=-14&s=${encodeBlob({ robotOverrides: ROBOT_OVERRIDE })}`;

/** What the seam link decodes to: Pelagos 7!'s own world at (29, -14), with the one override. */
function seamLinkPayload(): SessionPayload {
  return { ...untouchedWorld('Pelagos 7!', { x: 29, y: -14 }), robotOverrides: ROBOT_OVERRIDE };
}

/** A fresh module instance of the seam, decoded against `query` as the address bar at its load. */
async function loadFreshWithQuery(query: string) {
  window.history.replaceState({}, '', `/${query}`);
  vi.resetModules();
  return import('./sessionShareUtils');
}

// ========================================
// TESTS
// ========================================

describe('getSessionSharePayload (the boot-time world link)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  it('reflects the world link in the address bar at module load: exact name, coordinates and the one override', async () => {
    const fresh = await loadFreshWithQuery(SEAM_LINK);
    const payload = fresh.getSessionSharePayload();
    expect(payload?.attenuationStyleName).toBe('Pelagos 7!');
    expect(payload?.coordinates).toEqual({ x: 29, y: -14 });
    expect(payload?.robotOverrides).toEqual(ROBOT_OVERRIDE);
    expect(payload).toEqual(seamLinkPayload());
  });

  it('a bare triple yields its seed world whole', async () => {
    const fresh = await loadFreshWithQuery(`?seed=${FIXTURE_NAME}&x=${FIXTURE_COORDINATES.x}&y=${FIXTURE_COORDINATES.y}`);
    expect(fresh.getSessionSharePayload()).toEqual(untouchedWorld());
  });

  it('returns null when the address bar names no world', async () => {
    const fresh = await loadFreshWithQuery('?debug&load=full');
    expect(fresh.getSessionSharePayload()).toBeNull();
  });

  it('returns null for an old ?session= link: it is no longer read', async () => {
    const fresh = await loadFreshWithQuery('?session=eyJ2IjoyLCJuIjoiYWxwaGEiLCJjIjp7IngiOjAsInkiOjUwfX0=');
    expect(fresh.getSessionSharePayload()).toBeNull();
  });

  it('returns the same object on every call, unaffected by consumeSessionSharePayload', async () => {
    const fresh = await loadFreshWithQuery(SEAM_LINK);
    const first = fresh.getSessionSharePayload();
    fresh.consumeSessionSharePayload();
    expect(fresh.getSessionSharePayload()).toBe(first);
    expect(fresh.getSessionSharePayload()).toBe(first);
  });

  it('loads when the world link module is imported first (the import cycle guard, spec risk 2)', async () => {
    window.history.replaceState({}, '', `/${SEAM_LINK}`);
    vi.resetModules();
    await import('./worldLink');
    const fresh = await import('./sessionShareUtils');
    expect(fresh.getSessionSharePayload()).toEqual(seamLinkPayload());
  });
});

describe('consumeSessionSharePayload (one-time-per-page-load consumption)', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.resetModules();
  });

  it('returns the payload on the first call', async () => {
    const fresh = await loadFreshWithQuery(SEAM_LINK);
    expect(fresh.consumeSessionSharePayload()).toEqual(seamLinkPayload());
  });

  it('returns null on every call after the first -- the power-cycle regression guard', async () => {
    const fresh = await loadFreshWithQuery(SEAM_LINK);
    fresh.consumeSessionSharePayload();
    expect(fresh.consumeSessionSharePayload()).toBeNull();
    expect(fresh.consumeSessionSharePayload()).toBeNull();
  });

  it('returns null on the first call too when no world link was present', async () => {
    const fresh = await loadFreshWithQuery('');
    expect(fresh.consumeSessionSharePayload()).toBeNull();
  });
});

describe('buildShareUrl', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('builds origin + pathname + exactly the bare triple for an untouched world', () => {
    window.history.replaceState({}, '', '/trace-atlas/');
    expect(buildShareUrl(untouchedWorld())).toBe(`${window.location.origin}/trace-atlas/?seed=n40dh8p8&x=29&y=-14`);
  });

  it('drops every other param in the address bar (?debug&load=full)', () => {
    window.history.replaceState({}, '', '/trace-atlas/?debug&load=full');
    expect(buildShareUrl(untouchedWorld())).toBe(`${window.location.origin}/trace-atlas/?seed=n40dh8p8&x=29&y=-14`);
  });

  it('adds the s blob for an edited world, and the link decodes back to the world', async () => {
    window.history.replaceState({}, '', '/trace-atlas/?debug');
    const url = new URL(buildShareUrl(seamLinkPayload()));
    expect(url.pathname).toBe('/trace-atlas/');
    expect([...url.searchParams.keys()]).toEqual(['seed', 'x', 'y', 's']);
    const fresh = await loadFreshWithQuery(url.search);
    expect(fresh.getSessionSharePayload()).toEqual(seamLinkPayload());
    vi.resetModules();
  });
});

// docs/tasks/OFF_SCREEN.md Task 11 (spec assumption 13): a preset is a pasted link — a whole share URL or the bare
// query — and searchOf gives decodeWorldLink the one shape it reads.
// band-table T24 (docs/specs/OFF_SCREEN.md assumption 11): a share link carries the loading as plain params.
describe('buildShareUrl - the loading params', () => {
  it('writes theme and the picks as a bare comma list, never %2C, and the link decodes back to the payload', () => {
    const payload: SessionPayload = { ...untouchedWorld(), theme: 'calm', aspects: { melody: ['hypnotic', 'mechanical'] } };
    const url = buildShareUrl(payload);
    expect(url).toContain('&theme=calm&melody=hypnotic,mechanical');
    expect(url).not.toContain('%2C');
    expect(decodeWorldLink(new URL(url).search)).toEqual(payload);
  });

  it('a Classic world with no picks is still the bare triple', () => {
    expect(new URL(buildShareUrl(untouchedWorld())).search).toBe('?seed=n40dh8p8&x=29&y=-14');
  });
});

describe('searchOf', () => {
  it('takes the query off a full share URL', () => {
    expect(searchOf('https://host/path?seed=a&x=1&y=2')).toBe('?seed=a&x=1&y=2');
  });

  it('passes a bare query through unchanged', () => {
    expect(searchOf('?seed=a&x=1&y=2')).toBe('?seed=a&x=1&y=2');
  });

  it('gives the same search for the URL and the bare query, with a blob and percent-encoding kept byte-for-byte', () => {
    const query = `?seed=Pelagos%207%21&x=29&y=-14&s=${encodeBlob({ robotOverrides: ROBOT_OVERRIDE })}`;
    expect(searchOf(`${window.location.origin}/trace-atlas/${query}`)).toBe(query);
    expect(searchOf(query)).toBe(query);
  });

  it('drops a fragment: a hash is not part of the world', () => {
    expect(searchOf('https://host/trace-atlas/?seed=a&x=1&y=2#top')).toBe('?seed=a&x=1&y=2');
  });

  it('reads a path-relative link too', () => {
    expect(searchOf('/trace-atlas/?seed=a&x=1&y=2')).toBe('?seed=a&x=1&y=2');
  });

  it('is empty for a link with no query, and for an empty string — never throws', () => {
    expect(searchOf('https://host/trace-atlas/')).toBe('');
    expect(searchOf('')).toBe('');
  });

  it('decodes to the same world either way', () => {
    const query = `?seed=${FIXTURE_NAME}&x=${FIXTURE_COORDINATES.x}&y=${FIXTURE_COORDINATES.y}`;
    expect(decodeWorldLink(searchOf(`https://host/trace-atlas/${query}`))).toEqual(untouchedWorld());
    expect(decodeWorldLink(searchOf(query))).toEqual(untouchedWorld());
  });
});

// docs/tasks/OFF_SCREEN.md Task 15 (spec assumption 12): the address bar follows the loaded world — identity only,
// through replaceState, every other param kept, the tweak blob dropped (Keep and Share are for that).
describe('mirrorWorldToUrl', () => {
  const identity: WorldIdentity = { attenuationStyleName: 'Pelagos 7!', coordinates: { x: 29, y: -14 }, theme: 'classic', aspects: {} };

  afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('writes seed, x and y — nothing else — by replaceState, so no history entry is made and the path stands', () => {
    window.history.replaceState({}, '', '/trace-atlas/');
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    mirrorWorldToUrl(identity);
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/trace-atlas/');
    const params = new URLSearchParams(window.location.search);
    expect([...params.keys()]).toEqual(['seed', 'x', 'y']);
    expect(params.get('seed')).toBe('Pelagos 7!');
    expect(params.get('x')).toBe('29');
    expect(params.get('y')).toBe('-14');
  });

  it('what it writes decodes back to the same world through decodeWorldLink', () => {
    mirrorWorldToUrl({ attenuationStyleName: FIXTURE_NAME, coordinates: FIXTURE_COORDINATES, theme: 'classic', aspects: {} });
    expect(decodeWorldLink(window.location.search)).toEqual(untouchedWorld());
    mirrorWorldToUrl(identity);
    expect(decodeWorldLink(window.location.search)).toEqual(untouchedWorld('Pelagos 7!', { x: 29, y: -14 }));
  });

  // band-table T24 (docs/specs/OFF_SCREEN.md assumptions 11 and 12): the theme and family params follow the world too,
  // written only when not the default, as a bare comma list in canonical order.
  it('writes theme and melody after y for a themed world with picks, and what it writes decodes back', () => {
    const loading: LoadingIdentity = { theme: 'calm', aspects: { melody: ['hypnotic', 'wandering'] } };
    mirrorWorldToUrl({ ...identity, ...loading });
    // Share's own encoding of the name since review R17 (`+` and `%21`, where the bar once wrote `%20` and `!`).
    expect(window.location.search).toBe('?seed=Pelagos+7%21&x=29&y=-14&theme=calm&melody=hypnotic,wandering');
    // The link names an untouched Calm world: what decodes is the seed drawn under Calm (themes-and-aspects T34).
    expect(decodeWorldLink(window.location.search)).toEqual(untouchedWorld('Pelagos 7!', { x: 29, y: -14 }, loading));
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R9: every family is mirrored (the cases around this one carry Melody only),
  // and a name that needs escaping reads back as itself, with no param of its own leaking out of it.
  it('writes every family param after the one before it, each a bare comma list in canonical order', () => {
    mirrorWorldToUrl({
      ...identity,
      theme: 'calm',
      aspects: { melody: ['hypnotic'], envelope: ['plucked', 'held'], distance: ['remote'], voice: ['woody'] },
    });
    expect(window.location.search).toBe(
      '?seed=Pelagos+7%21&x=29&y=-14&theme=calm&melody=hypnotic&envelope=plucked,held&distance=remote&voice=woody',
    );
  });

  it('a name that needs escaping reads back from the bar as itself, and x stands', () => {
    const name = 'a&x=999#b+c%';
    mirrorWorldToUrl({ ...identity, attenuationStyleName: name });
    const params = new URLSearchParams(window.location.search);
    expect(params.get('seed')).toBe(name);
    expect(params.getAll('x')).toEqual(['29']);
    expect(params.get('y')).toBe('-14');
    expect(window.location.hash).toBe('');
  });

  it('removes theme and melody when the world is Classic with no picks, so the bar never carries a stale loading', () => {
    window.history.replaceState({}, '', '/?seed=old&x=1&y=2&theme=calm&melody=hypnotic&debug');
    mirrorWorldToUrl(identity);
    expect(window.location.search).toBe('?seed=Pelagos+7%21&x=29&y=-14&debug');
  });

  it('writes when the bar names the world under a different loading, and not when the loading matches too', () => {
    window.history.replaceState({}, '', '/?seed=Pelagos+7%21&x=29&y=-14&theme=calm');
    mirrorWorldToUrl(identity);
    expect(new URLSearchParams(window.location.search).has('theme')).toBe(false);
    window.history.replaceState({}, '', '/?seed=Pelagos+7%21&x=29&y=-14&theme=calm&melody=hypnotic');
    const replace = vi.spyOn(window.history, 'replaceState');
    mirrorWorldToUrl({ ...identity, theme: 'calm', aspects: { melody: ['hypnotic'] } });
    expect(replace).not.toHaveBeenCalled();
  });

  it('replaces an earlier triple in place and removes the s blob: the tweak blob is never mirrored live', () => {
    window.history.replaceState({}, '', `/?seed=old&x=1&y=2&s=${encodeBlob({ robotOverrides: ROBOT_OVERRIDE })}`);
    mirrorWorldToUrl(identity);
    expect(window.location.search).toBe('?seed=Pelagos+7%21&x=29&y=-14');
  });

  it('preserves every unrelated param byte-for-byte, where it stood: a bare ?debug stays bare, ?load= and ?fxLoad= keep their place', () => {
    window.history.replaceState({}, '', '/?debug&load=light&seed=old&x=1&y=2&s=zzz&fxLoad=50#top');
    mirrorWorldToUrl(identity);
    expect(window.location.search).toBe('?debug&load=light&seed=Pelagos+7%21&x=29&y=-14&fxLoad=50');
    expect(window.location.hash).toBe('#top');
  });

  // docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R17: the bar and Share write one world one way. The bar's world part is
  // Share's, param for param and byte for byte, wherever the world's params stood; the other params keep their own text.
  describe('one world, one link: the bar writes what Share writes (review R17)', () => {
    /** A raw search's parts whose names, as the browser reads them, are a world param's. */
    const worldParts = (search: string) =>
      search
        .replace(/^\?/, '')
        .split('&')
        .filter((part) => ['seed', 'x', 'y', 's', 'theme', 'melody', 'envelope', 'distance', 'voice'].includes([...new URLSearchParams(part).keys()][0]));

    it("after a mirror, the bar's world params are buildShareUrl's for the same world, in the same order and spelling", () => {
      const loading: LoadingIdentity = { theme: 'calm', aspects: { melody: ['hypnotic', 'wandering'], voice: ['woody'] } };
      // The bar carries the old world with Voice ahead of Melody, as a toggle made in that order once left it.
      window.history.replaceState({}, '', '/trace-atlas/?debug&voice=glassy&seed=old&x=1&y=2&load=light');
      mirrorWorldToUrl({ ...identity, ...loading });
      const share = new URL(buildShareUrl(untouchedWorld('Pelagos 7!', { x: 29, y: -14 }, loading))).search;
      expect(worldParts(window.location.search)).toEqual(worldParts(share));
      expect(worldParts(share)).toEqual(['seed=Pelagos+7%21', 'x=29', 'y=-14', 'theme=calm', 'melody=hypnotic,wandering', 'voice=woody']);
    });

    it('the world part sits where the first world param stood, the rest keeping their text and their order', () => {
      window.history.replaceState({}, '', '/?debug&voice=glassy&seed=old&x=1&y=2&load=light#top');
      mirrorWorldToUrl(identity);
      expect(window.location.search).toBe('?debug&seed=Pelagos+7%21&x=29&y=-14&load=light');
      expect(window.location.hash).toBe('#top');
    });

    it('a world param spelled another way is still that param: ?se%65d=old leaves one seed, not two', () => {
      window.history.replaceState({}, '', '/?se%65d=old&x=1&y=2&debug');
      mirrorWorldToUrl(identity);
      const params = new URLSearchParams(window.location.search);
      expect(params.getAll('seed')).toEqual(['Pelagos 7!']);
      expect(window.location.search).toBe('?seed=Pelagos+7%21&x=29&y=-14&debug');
    });

    it('with no world param in the bar the world part goes after the params already there, as a new param always did', () => {
      window.history.replaceState({}, '', '/?debug&load=light');
      mirrorWorldToUrl(identity);
      expect(window.location.search).toBe('?debug&load=light&seed=Pelagos+7%21&x=29&y=-14');
    });
  });

  it('does not write when the address bar already names the world and carries no blob — however the link encoded it', () => {
    window.history.replaceState({}, '', '/?seed=Pelagos+7%21&x=29&y=-14&debug'); // URLSearchParams' own encoding, as a share link arrives
    const replace = vi.spyOn(window.history, 'replaceState');
    mirrorWorldToUrl(identity);
    expect(replace).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?seed=Pelagos+7%21&x=29&y=-14&debug');
  });

  it('does write when only the blob differs: the same world, arrived tweaked, is mirrored untweaked once it is the pick', () => {
    window.history.replaceState({}, '', '/?seed=Pelagos+7%21&x=29&y=-14&s=zzz');
    mirrorWorldToUrl(identity);
    expect(new URLSearchParams(window.location.search).has('s')).toBe(false);
    expect(new URLSearchParams(window.location.search).get('seed')).toBe('Pelagos 7!');
  });

  it('never throws when replaceState does (a sandboxed frame): the world still loads, it is just not mirrored', () => {
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(() => mirrorWorldToUrl(identity)).not.toThrow();
  });
});

describe('copySessionLink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('writes the exact output of buildShareUrl to the clipboard and resolves true on success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const payload = untouchedWorld();

    const result = await copySessionLink(payload);

    expect(writeText).toHaveBeenCalledWith(buildShareUrl(payload));
    expect(result).toBe(true);
  });

  it('resolves false (never throws/rejects) when the clipboard write fails', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('permission denied'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    const result = await copySessionLink(untouchedWorld());

    expect(result).toBe(false);
  });
});
