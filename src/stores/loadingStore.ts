// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

import { canonicalAspects, type AspectFamilyId, type AspectPick } from '../data/bands/aspects';
import type { ThemeId } from '../data/bands/themes';

// ========================================
// TYPES
// ========================================

/**
 * The loaded world's loading identity (docs/specs/OFF_SCREEN.md assumption 9): the theme every band resolves under,
 * and per family the picks the deal seats across the fleet. Each list is in the family's canonical option order; an
 * absent family means every robot as theme. JSON only - two strings' worth of ids.
 */
export interface LoadingIdentity {
  theme: ThemeId;
  aspects: Partial<Record<AspectFamilyId, AspectPick[]>>;
}

export interface LoadingState extends LoadingIdentity {
  /** Written only by the world-change paths - retransmitWorld, applySessionPayload, the link boot - never by the off
   *  screen directly. Installs the theme and each family's picks canonicalised (canonicalAspects: sorted, deduped,
   *  unknown ids and empty or unknown families dropped). Read by the loading context, the deal, the readout, the payload
   *  builder and the URL mirror. */
  setLoading: (loading: LoadingIdentity) => void;
}

// ========================================
// CONSTANTS
// ========================================

/** Classic, nothing dealt: what every world before the themes was, and what an absent payload field reads as. */
export const DEFAULT_LOADING: LoadingIdentity = { theme: 'classic', aspects: {} };

// ========================================
// STORE
// ========================================

export const useLoadingStore = create<LoadingState>((set) => ({
  ...DEFAULT_LOADING,

  setLoading: ({ theme, aspects }) => set({ theme, aspects: canonicalAspects(aspects) }),
}));
