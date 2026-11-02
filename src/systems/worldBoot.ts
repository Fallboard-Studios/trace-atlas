// ========================================
// IMPORTS
// ========================================
import { useUIStore } from '../stores/uiStore';
import { initializeLocale } from './worldTransition';
import { applySessionPayload } from '../utils/sessionDiff';
import { consumeSessionSharePayload, getSessionSharePayload, mirrorWorldToUrl } from '../utils/sessionShareUtils';
import { currentWorldIdentity } from '../utils/worldIdentity';

// ========================================
// EXPORTS
// ========================================

/**
 * The boot path OceanScene's mount effect runs, once per page load (docs/tasks/OFF_SCREEN.md Task 15; spec
 * assumption 12). Its own module, downstream of worldTransition, sessionDiff and sessionShareUtils, so it can be
 * tested without the scene and so none of those three has to import the others.
 *
 * Build the active locale first — guarded factory placement and the fixed roster through the same initializeLocale
 * Foundry's Retransmit uses, its systems started only if the tablet is already on (otherwise powerController's
 * powerOnSequence starts them on the rocker). Then one of two things, never both:
 *
 * - **A link arrival.** The address bar held a world link (`?seed=&x=&y=`, plus `s=` for a tweaked world,
 *   docs/specs/SHORT_WORLD_LINK.md): apply its payload — robotOverrides, companyDiffs, globalAudio — over the
 *   world just built, with `skipLocaleRebuild: true`, since that locale is already the link's (its name and
 *   coordinates were pinned before the default locale was constructed, docs/specs/SECTOR_SETTINGS_SHARABLE_LINK.md
 *   §4.3) and applySessionPayload's normal retransmit would tear it down and rebuild it a second time in the same
 *   boot. The URL is left exactly as it came, blob included: it stands until the world changes.
 * - **A bare boot.** No link: the stores rolled a random identity at module load, and it is mirrored into the
 *   address bar so a reload brings this same world back — Roll is how you get another (assumption 12's bookmark
 *   change). Nothing is applied.
 *
 * consumeSessionSharePayload, not getSessionSharePayload, carries the apply: it returns the payload once per page
 * load, then null, so a remount of the scene never re-applies it. The getter is read for one fact only — did this
 * page load arrive by a link at all — so that same remount does not mirror the live identity over the friend's blob.
 */
export function bootWorld(localeId: string): void {
  initializeLocale(localeId, { startSystems: useUIStore.getState().isPoweredOn });

  const arrival = consumeSessionSharePayload();
  if (arrival) {
    applySessionPayload(arrival, { skipLocaleRebuild: true });
    return;
  }
  if (getSessionSharePayload() !== null) return;

  const identity = currentWorldIdentity();
  if (identity) mirrorWorldToUrl(identity);
}
