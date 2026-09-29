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
// TYPES
// ========================================

/** The wire shape actually put in the URL -- abbreviated keys (every byte in a URL param is
 *  copy-pasted/typed by a human, or eats into practical link-sharing limits), and `r`/`d`/`u`
 *  omitted entirely when empty rather than sent as `{}`/`[]`. Only what changed travels; the app
 *  can already reconstruct "untouched" from the seed data (attenuationStyleName/coordinates)
 *  alone, the same "no key if untouched" contract buildSessionPayload already applies one level
 *  down (per-robot/per-company diffs) -- this just extends it to the top level. */
interface CompactSessionPayload {
  v: SessionPayload['version'];
  n: SessionPayload['attenuationStyleName'];
  c: SessionPayload['coordinates'];
  g: SessionPayload['globalAudio'];
  r?: SessionPayload['robotOverrides'];
  d?: SessionPayload['companyDiffs'];
  u?: SessionPayload['userCreatedCompanies'];
}

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

function toCompactSessionPayload(payload: SessionPayload): CompactSessionPayload {
  const compact: CompactSessionPayload = {
    v: payload.version,
    n: payload.attenuationStyleName,
    c: payload.coordinates,
    g: payload.globalAudio,
  };
  if (Object.keys(payload.robotOverrides).length > 0) compact.r = payload.robotOverrides;
  if (Object.keys(payload.companyDiffs).length > 0) compact.d = payload.companyDiffs;
  if (payload.userCreatedCompanies.length > 0) compact.u = payload.userCreatedCompanies;
  return compact;
}

function fromCompactSessionPayload(compact: CompactSessionPayload): SessionPayload {
  return {
    version: compact.v,
    attenuationStyleName: compact.n,
    coordinates: compact.c,
    globalAudio: compact.g,
    robotOverrides: compact.r ?? {},
    companyDiffs: compact.d ?? {},
    userCreatedCompanies: compact.u ?? [],
  };
}

// ========================================
// FUNCTIONS
// ========================================

/** Encodes a SessionPayload for a URL query param -- via the abbreviated, empty-fields-omitted
 *  CompactSessionPayload wire shape, never the full field names. */
export function encodeSessionPayload(payload: SessionPayload): string {
  return encodeBase64Utf8(JSON.stringify(toCompactSessionPayload(payload)));
}

/** Decodes a `?session=` param value. Fails soft -- malformed base64, malformed JSON, or a shape
 *  that doesn't look like a CompactSessionPayload all return null, never throw. Same convention
 *  as sessionStorageEngine.ts's readStorage: a corrupted/tampered link degrades to "no share
 *  param present," not a crash. */
export function decodeSessionPayload(encoded: string): SessionPayload | null {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Utf8(encoded));
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed) ||
      typeof (parsed as { n?: unknown }).n !== 'string' ||
      !(parsed as { c?: unknown }).c
    ) {
      return null;
    }
    return fromCompactSessionPayload(parsed as CompactSessionPayload);
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
