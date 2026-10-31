// ========================================
// IMPORTS
// ========================================
import type { SessionPayload } from '../types/session';
import type { WorldIdentity } from './seedBaseline';
import { decodeWorldLink, encodeWorldLinkParams, WORLD_LINK_PARAMS } from './worldLink';
import { withParam } from './audioBudget';
import { devWarn } from './helpers';
import { ASPECT_FAMILY_IDS } from '../data/bands/aspects';
import { DEFAULT_LOADING } from '../data/bands/loadingIdentity';

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

/**
 * The query a pasted link carries, in the one shape decodeWorldLink reads (docs/specs/OFF_SCREEN.md assumption 13): a
 * whole share URL (`https://host/trace-atlas/?seed=…`), a path-relative one, or the bare `?…` query all give back
 * `?seed=…`; a fragment is dropped; a link with no query, or an empty string, gives "" (which decodes to null). Never
 * throws — the browser's own URL parser does the work, against a throwaway base so a relative link resolves.
 */
export function searchOf(link: string): string {
  try {
    return new URL(link, 'http://localhost').search;
  } catch {
    return '';
  }
}

/**
 * The address bar follows the loaded world (docs/specs/OFF_SCREEN.md assumption 12): rewrite `seed`, `x` and `y` to
 * this identity and drop `s` — the tweak blob is never mirrored live; Keep and Share are for that — through
 * `withParam`, so every other param (`debug`, `load`, `fxLoad`, …) stays where it stood, and `history.replaceState`,
 * so no history entry is made. Called after a bare boot (worldBoot.ts) and after every retransmit that changes the
 * world (worldTransition.ts); never on a link arrival, whose URL stands until the world changes. A no-op outside a
 * browser, when the bar already names this world with no blob (however the link encoded it), or when replaceState
 * throws (a sandboxed frame). The loading rides along (band-table T24, assumption 11): `theme` when not Classic and a
 * param per family holding its picks as a bare comma list in canonical order, each written when set and removed when
 * default, so the bar never carries a stale loading; the "already names this world" check reads them too.
 */
export function mirrorWorldToUrl(identity: WorldIdentity): void {
  if (typeof window === 'undefined') return;
  const { attenuationStyleName, coordinates, theme, aspects } = identity;
  const x = String(coordinates.x);
  const y = String(coordinates.y);
  const themeParam = theme === DEFAULT_LOADING.theme ? null : theme;
  const familyParams = ASPECT_FAMILY_IDS.map((family) => {
    const picks = aspects[family];
    return [family, picks && picks.length > 0 ? picks.join(',') : null] as const;
  });

  const current = new URLSearchParams(window.location.search);
  if (
    current.get(WORLD_LINK_PARAMS.seed) === attenuationStyleName &&
    current.get(WORLD_LINK_PARAMS.x) === x &&
    current.get(WORLD_LINK_PARAMS.y) === y &&
    !current.has(WORLD_LINK_PARAMS.blob) &&
    current.get(WORLD_LINK_PARAMS.theme) === themeParam &&
    familyParams.every(([family, value]) => current.get(family) === value)
  ) {
    return;
  }

  let search = withParam(window.location.search, WORLD_LINK_PARAMS.seed, encodeURIComponent(attenuationStyleName));
  search = withParam(search, WORLD_LINK_PARAMS.x, x);
  search = withParam(search, WORLD_LINK_PARAMS.y, y);
  search = withParam(search, WORLD_LINK_PARAMS.theme, themeParam);
  for (const [family, value] of familyParams) search = withParam(search, family, value);
  search = withParam(search, WORLD_LINK_PARAMS.blob, null);
  try {
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
  } catch {
    // Not fatal: the world is loaded, it is just not mirrored.
  }
}

/** Builds a full, absolute shareable URL for a payload -- origin + pathname + the world link's
 *  `seed` / `x` / `y`, the loading params when not default (`theme`, `melody=…`; OFF_SCREEN.md assumption 11), and `s`
 *  when the world differs from its seed. Deliberately drops any other query params currently in the address bar
 *  (e.g. ?debug) -- a share link is a clean, self-contained artifact, not a snapshot of whatever debug flags happened
 *  to be active when it was generated. The picks' commas are written plain, as the spec and the mirror write them: a
 *  comma is an ordinary sub-delimiter in a query (URLSearchParams would escape it to %2C, which reads back the same). */
export function buildShareUrl(payload: SessionPayload): string {
  const url = new URL(window.location.origin + window.location.pathname);
  url.search = encodeWorldLinkParams(payload).toString().replace(/%2C/g, ',');
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
