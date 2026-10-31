// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

import { canonicalAspects } from '../data/bands/aspects';
import { DEFAULT_LOADING, type LoadingIdentity } from '../data/bands/loadingIdentity';

export { DEFAULT_LOADING };
export type { LoadingIdentity };

// ========================================
// TYPES
// ========================================

/** The loaded world's loading identity (docs/specs/OFF_SCREEN.md assumption 9, the LoadingIdentity shape) and the one
 *  write. JSON only - two strings' worth of ids. */
export interface LoadingState extends LoadingIdentity {
  /** Written only by the world-change paths - retransmitWorld, applySessionPayload, the link boot - never by the off
   *  screen directly. Installs the theme and each family's picks canonicalised (canonicalAspects: sorted, deduped,
   *  unknown ids and empty or unknown families dropped). Read by the loading context, the deal, the readout, the payload
   *  builder and the URL mirror. */
  setLoading: (loading: LoadingIdentity) => void;
}

// ========================================
// STORE
// ========================================

export const useLoadingStore = create<LoadingState>((set) => ({
  ...DEFAULT_LOADING,

  setLoading: ({ theme, aspects }) => set({ theme, aspects: canonicalAspects(aspects) }),
}));
