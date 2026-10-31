// ========================================
// IMPORTS
// ========================================
import type { AspectFamilyId, AspectPick } from './aspects';
import type { ThemeId } from './themes';

// ========================================
// TYPES
// ========================================

/**
 * A world's loading identity (docs/specs/OFF_SCREEN.md assumption 9): the theme every band resolves under, and per
 * family the picks the deal seats across the fleet. Each list is in the family's canonical option order
 * (canonicalAspects, aspects.ts); an absent family means every robot as theme. JSON only. The loading store holds the
 * loaded world's; WorldIdentity (seedBaseline.ts) and the session payload carry it (Task 23); the loading context
 * (loadingContext.ts) reads only its theme. A plain type module, so the store-free modules under seedBaseline.ts can
 * name it without importing a store.
 */
export interface LoadingIdentity {
  theme: ThemeId;
  aspects: Partial<Record<AspectFamilyId, AspectPick[]>>;
}

// ========================================
// CONSTANTS
// ========================================

/** Classic, nothing dealt: what every world before the themes was, and what an absent payload field reads as
 *  (assumption 10). */
export const DEFAULT_LOADING: LoadingIdentity = { theme: 'classic', aspects: {} };
