// ========================================
// IMPORTS
// ========================================
import type { SessionPayload } from '../types/session';
import { decodeWorldLink, encodeWorldLinkParams } from './worldLink';
import { devWarn } from './helpers';

// ========================================
// FUNCTIONS
// ========================================

/** Decoded once, at module load, from the world link in the address bar (docs/specs/SHORT_WORLD_LINK.md) --
 *  attenuationStyleStore.ts/localeStore.ts's own module-level constants read it before the default locale is
 *  built. Null when the address bar names no world (none of `seed` / `x` / `y` / `s`). */
const SESSION_SHARE_PAYLOAD: SessionPayload | null =
  typeof window !== 'undefined' ? decodeWorldLink(window.location.search) : null;

/** The decoded world link from this page load's URL, or null if absent. Always
 *  returns the same value for the whole page load -- for the boot-time locale-pinning reads
 *  (attenuationStyleStore.ts/localeStore.ts), which only ever run once anyway (module load), and
 *  for anything else that just wants to inspect it. For a boot-time consumer that must apply the
 *  payload's side effects exactly once, use consumeSessionSharePayload instead. */
export function getSessionSharePayload(): SessionPayload | null {
  return SESSION_SHARE_PAYLOAD;
}

let sessionShareConsumed = false;

/** Returns the decoded world link the FIRST time it's called, then null on every subsequent
 *  call for the rest of the page load. OceanScene.tsx's mount effect uses this (not
 *  getSessionSharePayload) so its applySessionPayload side effect (re-registering every robot's
 *  melody, reapplying company membership) fires exactly once per page load -- not again on any
 *  remount of OceanScene without a page reload (a power cycle no longer remounts it: ScreenViewport
 *  renders WorldView in both power states), which would otherwise re-run it for as long as
 *  the link stays in the URL (durable/bookmarkable by design -- it's never cleared). */
export function consumeSessionSharePayload(): SessionPayload | null {
  if (sessionShareConsumed) return null;
  sessionShareConsumed = true;
  return SESSION_SHARE_PAYLOAD;
}

/** Builds a full, absolute shareable URL for a payload -- origin + pathname + the world link's
 *  `seed` / `x` / `y` (and `s` when the world differs from its seed). Deliberately drops any other query params
 *  currently in the address bar (e.g. ?debug) -- a share link is a clean, self-contained artifact, not a snapshot
 *  of whatever debug flags happened to be active when it was generated. */
export function buildShareUrl(payload: SessionPayload): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.search = encodeWorldLinkParams(payload).toString();
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
