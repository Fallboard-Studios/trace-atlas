// ========================================
// IMPORTS
// ========================================
import type { SessionPayload } from '../types/session';
import { devWarn } from './helpers';

// ========================================
// CONSTANTS
// ========================================

const SESSION_PARAM = 'session';

// ========================================
// PRIVATE HELPERS
// ========================================

/** UTF-8-safe base64 encode/decode -- plain btoa/atob only handle Latin1, and robot/company
 *  names (TextInput fields, maxLength-bounded but not charset-restricted) can contain
 *  non-Latin1 characters. TextEncoder/TextDecoder, not the deprecated escape/unescape trick. */
function encodeBase64Utf8(json: string): string {
  const bytes = new TextEncoder().encode(json);
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64Utf8(encoded: string): string {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ========================================
// FUNCTIONS
// ========================================

/** Encodes a SessionPayload for a URL query param. */
export function encodeSessionPayload(payload: SessionPayload): string {
  return encodeBase64Utf8(JSON.stringify(payload));
}

/** Decodes a `?session=` param value. Fails soft -- malformed base64, malformed JSON, or a shape
 *  that doesn't look like a SessionPayload all return null, never throw. Same convention as
 *  sessionStorageEngine.ts's readStorage: a corrupted/tampered link degrades to "no share param
 *  present," not a crash. */
export function decodeSessionPayload(encoded: string): SessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Utf8(encoded));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof (parsed as { attenuationStyleName?: unknown }).attenuationStyleName !== 'string' ||
      !(parsed as { coordinates?: unknown }).coordinates
    ) {
      return null;
    }
    return parsed as SessionPayload;
  } catch (err) {
    devWarn('[sessionShareUtils] malformed ?session= param, ignoring', err);
    return null;
  }
}

/** Decoded once, at module load -- same timing seedUtils.ts's overrides used to read their own
 *  URL params at, so attenuationStyleStore.ts/localeStore.ts's own module-level constants can
 *  read it before the default locale is built. */
const SESSION_SHARE_PAYLOAD: SessionPayload | null =
  typeof window !== 'undefined' ? decodeSessionPayload(new URLSearchParams(window.location.search).get(SESSION_PARAM) ?? '') : null;

/** The decoded share payload from this page load's URL, or null if absent/malformed. */
export function getSessionSharePayload(): SessionPayload | null {
  return SESSION_SHARE_PAYLOAD;
}

/** Builds a full, absolute shareable URL for a payload -- origin + pathname + exactly one
 *  `?session=` param. Deliberately drops any other query params currently in the address bar
 *  (e.g. ?debug) -- a share link is a clean, self-contained artifact, not a snapshot of whatever
 *  debug flags happened to be active when it was generated. */
export function buildShareUrl(payload: SessionPayload): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set(SESSION_PARAM, encodeSessionPayload(payload));
  return url.toString();
}

/** Builds the link and writes it to the clipboard. Returns true on success, false on failure
 *  (e.g. clipboard permission denied) -- never throws. */
export async function copySessionLink(payload: SessionPayload): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(buildShareUrl(payload));
    return true;
  } catch (err) {
    devWarn('[sessionShareUtils] clipboard write failed', err);
    return false;
  }
}
