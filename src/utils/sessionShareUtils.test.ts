// ========================================
// IMPORTS
// ========================================
import { describe, it, expect, afterEach, vi } from 'vitest';
import type { SessionPayload } from '../types/session';
import { buildShareUrl, copySessionLink } from './sessionShareUtils';
import { encodeBlob } from './worldLink';
import { FIXTURE_COORDINATES, FIXTURE_NAME, untouchedWorld } from '../testUtils/worldLinkFixtures';

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
