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
import type { SessionPayload } from '../types/session';

// ========================================
// CONSTANTS
// ========================================

/** The world link's params (docs/specs/SHORT_WORLD_LINK.md assumption 1). `theme` is reserved: never written, never read. */
export const WORLD_LINK_PARAMS = {
  seed: 'seed',
  x: 'x',
  y: 'y',
  blob: 's',
  theme: 'theme',
} as const;

/** The blob's wire version, written before the `.` and outside the compression (spec assumption 2). */
export const WORLD_LINK_BLOB_VERSION = 1;

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
 * The diff an `s` param's value carries, or null. A blob whose version is not 1, whose text is not base64url, which does
 * not inflate, which is not JSON, or whose JSON fails the shape check is dropped whole and the link loads as its bare
 * triple (spec assumption 2). Never throws: a link is untrusted, hand-editable input.
 */
export function decodeBlob(raw: string): WorldDiff | null {
  try {
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

/** One axis, or the random a fresh world would get for that axis alone (spec assumption 6). `-0` reads as 0. */
function readCoordinate(raw: string | null): number {
  return raw !== null && INTEGER.test(raw) ? Number(raw) + 0 : randomCoordinate();
}

/**
 * The params for a payload: always `seed` (the exact Attenuation Style name), `x` and `y`, and `s` only when the world
 * differs from what its seed regenerates. Reads nothing from the address bar, so no other param (debug, load, theme,
 * session) can ride along (spec assumption 1).
 */
export function encodeWorldLinkParams(payload: SessionPayload): URLSearchParams {
  const params = new URLSearchParams();
  params.set(WORLD_LINK_PARAMS.seed, payload.attenuationStyleName);
  params.set(WORLD_LINK_PARAMS.x, String(payload.coordinates.x));
  params.set(WORLD_LINK_PARAMS.y, String(payload.coordinates.y));
  const diff = diffWorldAgainstSeed(
    payload,
    generateWorldSeedBaseline(payload.attenuationStyleName)
  );
  if (Object.keys(diff).length > 0) params.set(WORLD_LINK_PARAMS.blob, encodeBlob(diff));
  return params;
}

/**
 * The payload a page's search string describes, or null when it names no world at all (none of seed / x / y / s; spec
 * assumption 6). Otherwise a whole payload: each identity part as given or, when absent or malformed, the random a fresh
 * world gets for that part alone (spec §1.4); the blob's fields over the seed's for everything else, so
 * applySessionPayload never sees a partial lfoBank. `theme` and `session` are never read.
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
  };
  // A blob of the wrong version, or one that will not inflate or parse, is no blob (spec assumption 2).
  const diff = blob === null ? {} : (decodeBlob(blob) ?? {});
  return fillWorldFromSeed(
    identity,
    diff,
    generateWorldSeedBaseline(identity.attenuationStyleName)
  );
}
