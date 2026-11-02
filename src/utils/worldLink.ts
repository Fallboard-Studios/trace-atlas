// ========================================
// IMPORTS
// ========================================
// Named imports only, so the bundle takes the two codecs and the UTF-8 pair and nothing else (spec §3).
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import { fromCompactWorldDiff, toCompactWorldDiff } from './worldDiffCodec';
import {
  diffWorldAgainstSeed,
  fillWorldFromSeed,
  generateWorldSeedBaseline,
  type WorldDiff,
  type WorldIdentity,
} from './seedBaseline';
import { generateRandomAttenuationStyleName, randomCoordinate } from './seedUtils';
import { devWarn } from './helpers';
import { DEFAULT_LOADING, loadingOf } from '../data/bands/loadingIdentity';
import { ASPECT_FAMILY_IDS, canonicalAspects, type AspectFamilyId, type FamilyPicks } from '../data/bands/aspects';
import { isThemeId, type ThemeId } from '../data/bands/themes';
import type { SessionPayload } from '../types/session';

// ========================================
// CONSTANTS
// ========================================

/** The world link's params (docs/specs/SHORT_WORLD_LINK.md assumption 1; docs/specs/OFF_SCREEN.md assumption 11). `theme`
 *  carries the loading theme when it is not Classic. Each aspect family has a param of its own name (ASPECT_FAMILY_IDS:
 *  `melody`, `envelope`, `distance`, `voice`), the set as a comma list in canonical option order, present only when
 *  non-empty. Neither is ever in the blob. */
export const WORLD_LINK_PARAMS = {
  seed: 'seed',
  x: 'x',
  y: 'y',
  blob: 's',
  theme: 'theme',
} as const;

/** The blob's wire version, written before the `.` and outside the compression (spec assumption 2). */
export const WORLD_LINK_BLOB_VERSION = 1;

/** The longest `s` value decodeBlob reads. The blob is inflated synchronously at boot, so an unbounded one could inflate
 *  to gigabytes; at this length (24,576 bytes) deflate's ~1,032:1 ceiling holds it to about 25 MB. Crawford's fully
 *  edited world is 1,722 characters, and the dev and preview servers already refuse any URL over Node's default 16 KiB
 *  header limit. */
export const WORLD_LINK_BLOB_MAX_LENGTH = 32768;

// ========================================
// BASE64URL
// ========================================

/** Unpadded base64url of raw bytes: btoa over the byte string, `+` / `/` to `-` / `_`, `=` stripped. */
export function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The inverse of toBase64Url. Throws on text outside the alphabet or of an impossible length (atob's own errors). */
export function fromBase64Url(text: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('not base64url');
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ========================================
// THE BLOB
// ========================================

/**
 * A diff as the `s` param's value: `1.` then unpadded base64url of the raw-deflated UTF-8 JSON of its compact form. The
 * version sits outside the compression and before a `.` (outside the base64url alphabet), so a reader refuses a blob it
 * does not know without inflating it, and a later wire need not be deflate at all (spec assumption 2). Deflate output
 * need not be byte-stable across fflate versions; nothing compares blobs, only what they decode to (spec risk 3).
 */
export function encodeBlob(diff: WorldDiff): string {
  const json = JSON.stringify(toCompactWorldDiff(diff));
  return `${WORLD_LINK_BLOB_VERSION}.${toBase64Url(deflateSync(strToU8(json)))}`;
}

/**
 * The diff an `s` param's value carries, or null. A blob longer than WORLD_LINK_BLOB_MAX_LENGTH, whose version is not 1,
 * whose text is not base64url, which does not inflate, which is not JSON, or whose JSON fails the shape check is dropped
 * whole and the link loads as its bare triple (spec assumption 2). Never throws: a link is untrusted, hand-editable input.
 */
export function decodeBlob(raw: string): WorldDiff | null {
  try {
    // Before anything is decoded: the length is the only bound on what inflating it can allocate.
    if (raw.length > WORLD_LINK_BLOB_MAX_LENGTH)
      throw new Error(`${raw.length} characters, over the ${WORLD_LINK_BLOB_MAX_LENGTH} limit`);
    const dot = raw.indexOf('.');
    if (dot === -1) throw new Error('no wire version');
    const version = raw.slice(0, dot);
    if (version !== String(WORLD_LINK_BLOB_VERSION))
      throw new Error(`unknown wire version "${version}"`);
    const json = strFromU8(inflateSync(fromBase64Url(raw.slice(dot + 1))));
    const diff = fromCompactWorldDiff(JSON.parse(json));
    if (diff === null) throw new Error('not a world diff');
    return diff;
  } catch (err) {
    devWarn('[worldLink] malformed ?s= blob, loading the bare world', err);
    return null;
  }
}

// ========================================
// THE LINK
// ========================================

/** A plain, optionally negative integer: the rule the old `?x=` / `?y=` parser used (spec assumption 10). */
const INTEGER = /^-?\d+$/;

/** One axis, or the random a fresh world would get for that axis alone (spec assumption 6). `-0` reads as 0. A
 *  coordinate must also be a safe integer: a longer digit string reads as absent, like any malformed part, since
 *  `Number('9'.repeat(400))` is Infinity and makes a NaN day (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R23). Every
 *  coordinate the app writes is one; Foundry's input rounds to an integer but sets no bound of its own. */
function readCoordinate(raw: string | null): number {
  if (raw === null || !INTEGER.test(raw)) return randomCoordinate();
  const value = Number(raw) + 0;
  return Number.isSafeInteger(value) ? value : randomCoordinate();
}

/**
 * The params that name a world: always `seed` (the exact Attenuation Style name), `x` and `y`; then the loading when it
 * is not the default - `theme` for a theme other than Classic, a param per family holding its picks as a comma list in
 * canonical order (OFF_SCREEN.md assumption 11). The one writer of that part of a link: Share's (encodeWorldLinkParams,
 * which adds the blob) and the address bar's (mirrorWorldToUrl), so one world is one link in both
 * (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R17). URLSearchParams escapes the list's commas; worldLinkQuery writes them
 * plain.
 */
export function encodeWorldIdentityParams(identity: WorldIdentity): URLSearchParams {
  const params = new URLSearchParams();
  params.set(WORLD_LINK_PARAMS.seed, identity.attenuationStyleName);
  params.set(WORLD_LINK_PARAMS.x, String(identity.coordinates.x));
  params.set(WORLD_LINK_PARAMS.y, String(identity.coordinates.y));
  if (identity.theme !== DEFAULT_LOADING.theme) params.set(WORLD_LINK_PARAMS.theme, identity.theme);
  for (const family of ASPECT_FAMILY_IDS) {
    const picks = identity.aspects[family];
    if (picks && picks.length > 0) params.set(family, picks.join(','));
  }
  return params;
}

/**
 * The params for a payload: its world's (encodeWorldIdentityParams), the loading read leniently from the payload (an
 * unknown id is the default), then `s` last, only when the world differs from what its seed regenerates. Reads nothing
 * from the address bar, so no other param (debug, load, session) can ride along (spec assumption 1).
 */
export function encodeWorldLinkParams(payload: SessionPayload): URLSearchParams {
  const loading = loadingOf(payload);
  const params = encodeWorldIdentityParams({ attenuationStyleName: payload.attenuationStyleName, coordinates: payload.coordinates, ...loading });
  // The baseline is the payload's own world's: its name, inside its theme's bands (OFF_SCREEN.md assumption 15).
  const diff = diffWorldAgainstSeed(
    payload,
    generateWorldSeedBaseline({ attenuationStyleName: payload.attenuationStyleName, ...loading })
  );
  if (Object.keys(diff).length > 0) params.set(WORLD_LINK_PARAMS.blob, encodeBlob(diff));
  return params;
}

/** A link's params as query text, with the picks' commas written plain, as the spec and the mirror write them: a comma
 *  is an ordinary sub-delimiter in a query (URLSearchParams escapes it to %2C, which reads back the same). The text both
 *  Share and the address bar write (review R17). */
export function worldLinkQuery(params: URLSearchParams): string {
  return params.toString().replace(/%2C/g, ',');
}

/** The link's theme: Classic for none, and for an unknown id too, with a dev warning - a link is untrusted (OFF_SCREEN.md
 *  assumption 11). */
function readTheme(raw: string | null): ThemeId {
  if (raw === null) return DEFAULT_LOADING.theme;
  if (isThemeId(raw)) return raw;
  devWarn('[worldLink] unknown theme in the link, loading Classic:', raw);
  return DEFAULT_LOADING.theme;
}

/** Each family's param as a comma list, sorted into canonical order and deduped (canonicalAspects); an unknown pick is
 *  dropped with a dev warning; an absent, empty or all-unknown list is no family at all (every robot as theme). */
function readAspects(params: URLSearchParams): FamilyPicks {
  const asked: Partial<Record<AspectFamilyId, string[]>> = {};
  for (const family of ASPECT_FAMILY_IDS) {
    const raw = params.get(family);
    if (raw !== null) asked[family] = raw.split(',').filter((part) => part.length > 0);
  }
  const aspects = canonicalAspects(asked);
  for (const family of ASPECT_FAMILY_IDS) {
    if ((aspects[family]?.length ?? 0) < new Set(asked[family]).size) {
      devWarn('[worldLink] unknown pick in the link, dropped:', family, params.get(family));
    }
  }
  return aspects;
}

/**
 * The payload a page's search string describes, or null when it names no world at all (none of seed / x / y / s; spec
 * assumption 6). Otherwise a whole payload: each identity part as given or, when absent or malformed, the random a fresh
 * world gets for that part alone (spec §1.4); the blob's fields over the seed's for everything else, so
 * applySessionPayload never sees a partial lfoBank. `theme` and the family params are read leniently (readTheme,
 * readAspects); `session` is never read; a theme or family param alone names no world.
 */
export function decodeWorldLink(search: string): SessionPayload | null {
  const params = new URLSearchParams(search);
  const seed = params.get(WORLD_LINK_PARAMS.seed);
  const blob = params.get(WORLD_LINK_PARAMS.blob);
  if (
    seed === null &&
    blob === null &&
    !params.has(WORLD_LINK_PARAMS.x) &&
    !params.has(WORLD_LINK_PARAMS.y)
  ) {
    return null;
  }
  const identity: WorldIdentity = {
    // Exact: URLSearchParams has already undone the percent-encoding and the `+`; nothing here lowercases, trims or
    // caps the name (spec assumptions 6 and 8).
    attenuationStyleName: seed || generateRandomAttenuationStyleName(),
    coordinates: {
      x: readCoordinate(params.get(WORLD_LINK_PARAMS.x)),
      y: readCoordinate(params.get(WORLD_LINK_PARAMS.y)),
    },
    // The loading (OFF_SCREEN.md assumption 11): plain params, each read leniently on its own.
    theme: readTheme(params.get(WORLD_LINK_PARAMS.theme)),
    aspects: readAspects(params),
  };
  // A blob of the wrong version, or one that will not inflate or parse, is no blob (spec assumption 2).
  const diff = blob === null ? {} : (decodeBlob(blob) ?? {});
  return fillWorldFromSeed(identity, diff, generateWorldSeedBaseline(identity));
}
