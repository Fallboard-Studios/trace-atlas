// ========================================
// IMPORTS
// ========================================
import { create } from 'zustand';

import { canonicalAspects } from '../data/bands/aspects';
import { DEFAULT_LOADING, loadingOf, type LoadingIdentity } from '../data/bands/loadingIdentity';
import { setLoading as installLoading } from '../data/bands/loadingContext';
import { getSessionSharePayload } from '../utils/sessionShareUtils';

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

/** The loading the page load's world link names, or Classic (band-table T24; spec assumption 9's "the link boot"): read
 *  at module load, as attenuationStyleStore.ts and localeStore.ts read the link's name and plot, so the locale built at
 *  boot already draws under the link's theme - before applySessionPayload runs over it. */
const BOOT_LOADING: LoadingIdentity = loadingOf(getSessionSharePayload() ?? DEFAULT_LOADING);

export const useLoadingStore = create<LoadingState>((set) => ({
  ...BOOT_LOADING,

  setLoading: ({ theme, aspects }) => set({ theme, aspects: canonicalAspects(aspects) }),
}));

// The loading context follows the store (spec assumptions 9 and 15): whatever writes the store - the action, or a direct
// setState in a test - installs the theme's table for the generators, so a world rebuilt after the write draws under
// its bands. One write, two readers. withLoading (seedBaseline.ts) borrows the context and restores it, never the store.
// A subscriber never sees the initial state, so the boot loading is installed by hand first.
installLoading(useLoadingStore.getState());
useLoadingStore.subscribe((state) => installLoading(state));
