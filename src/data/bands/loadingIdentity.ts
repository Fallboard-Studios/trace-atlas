// ========================================
// IMPORTS
// ========================================
import { ASPECT_FAMILY_IDS, canonicalAspects, type AspectFamilyId, type AspectId, type FamilyPicks } from './aspects';
import { isThemeId, type ThemeId } from './themes';

// ========================================
// TYPES
// ========================================

/**
 * A world's loading identity (docs/specs/OFF_SCREEN.md assumption 9): the theme every band resolves under, and per
 * family the picks the deal seats across the fleet. Each list is in the family's canonical option order
 * (canonicalAspects, aspects.ts); an absent family means every robot as theme. JSON only. The loading store holds the
 * loaded world's; WorldIdentity (seedBaseline.ts) and the session payload carry it; the loading context
 * (loadingContext.ts) reads only its theme. A plain type module, so the store-free modules under seedBaseline.ts can
 * name the identity without importing a store.
 */
export interface LoadingIdentity {
  theme: ThemeId;
  /** Each family's picks, typed by that family (docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md R15). */
  aspects: FamilyPicks;
}

// ========================================
// CONSTANTS
// ========================================

/** Classic, nothing dealt: what every world before the themes was, and what an absent payload field reads as
 *  (assumption 10). */
export const DEFAULT_LOADING: LoadingIdentity = { theme: 'classic', aspects: {} };

// ========================================
// FUNCTIONS
// ========================================

/**
 * The loading a payload names, read leniently (assumption 10): an absent or unknown theme is Classic, absent or
 * malformed aspects are none, an unknown family or pick is dropped and each list comes back canonical. A payload is
 * untrusted JSON here - a version 1 or 2 save, a hand-edited file, a link's blob - so every field is checked, never
 * assumed.
 */
export function loadingOf(payload: { theme?: unknown; aspects?: unknown }): LoadingIdentity {
  const theme = isThemeId(payload.theme) ? payload.theme : DEFAULT_LOADING.theme;
  const lists: Partial<Record<AspectFamilyId, AspectId[]>> = {};
  const raw = payload.aspects;
  if (raw !== null && typeof raw === 'object') {
    for (const family of ASPECT_FAMILY_IDS) {
      const picks = (raw as Record<string, unknown>)[family];
      // Any string passes here; canonicalAspects below keeps only the family's ids (a stale `theme` included).
      if (Array.isArray(picks)) lists[family] = picks.filter((pick): pick is AspectId => typeof pick === 'string');
    }
  }
  return { theme, aspects: canonicalAspects(lists) };
}
