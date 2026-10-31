// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

import { canonicalAspects } from '../data/bands/aspects';
import { DEFAULT_LOADING, type LoadingIdentity } from '../data/bands/loadingIdentity';
import { setLoading as installLoading } from '../data/bands/loadingContext';

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

// The loading context follows the store (spec assumptions 9 and 15): whatever writes the store - the action, or a direct
// setState in a test - installs the theme's table for the generators, so a world rebuilt after the write draws under
// its bands. One write, two readers. withLoading (seedBaseline.ts) borrows the context and restores it, never the store.
useLoadingStore.subscribe((state) => installLoading(state));
