// ========================================
// IMPORTS
// ========================================
// Named imports only, so the bundle takes the two codecs and the UTF-8 pair and nothing else (spec §3).
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

import { fromCompactWorldDiff, toCompactWorldDiff } from './sessionShareUtils';
import type { WorldDiff } from './seedBaseline';
import { devWarn } from './helpers';

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
