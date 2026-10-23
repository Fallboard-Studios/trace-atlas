import { useSyncExternalStore } from 'react';
import {
  CABINET_BOX_HEIGHT,
  CABINET_VOXEL_GAP,
  CABINET_BREAKPOINT_MOBILE_MAX,
  CABINET_BREAKPOINT_TABLET_MAX,
  type CabinetTier,
} from '@/utils/cabinetBreakpoints';

function resolveTier(): CabinetTier {
  if (typeof window.matchMedia !== 'function') return 'desktop';
  if (window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_MOBILE_MAX}px)`).matches) return 'mobile';
  if (window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_TABLET_MAX}px)`).matches) return 'tablet';
  return 'desktop';
}

// One real matchMedia listener pair for the whole app, shared by every
// useCabinetTier() call via useSyncExternalStore — not one pair per call
// site. Before this (code review, 2026-09-12), each call independently ran
// its own useState + matchMedia-listener-pair effect; DirectionalPanel/
// PanelGroup's 'responsive' orientation (AUDIO_RIG_RESPONSIVE_LAYOUT) pushed
// the simultaneous call count for one AudioRigDrawer render to ~19 (every
// effect block's own panel, the LFO group's nested panels, the compressor
// sub-row panels, and the 3 PanelGroup wrappers), each maintaining an
// identical, independent subscription to the same 2 global media queries —
// ~38 listeners for what's conceptually one shared value. Ref-counted so the
// real listeners exist only while at least one component is actually
// subscribed, and are torn down (not just left dangling) once the last one
// unmounts — this also keeps every existing test's per-`it()` matchMedia
// stub working correctly: a fresh subscriber count of 0 on the next render
// means the next subscribe() re-reads whatever matchMedia is stubbed to at
// that moment, rather than a stale reference to a prior test's mock.
const tierChangeListeners = new Set<() => void>();
let mobileQuery: MediaQueryList | null = null;
let tabletQuery: MediaQueryList | null = null;

function notifyTierChange() {
  tierChangeListeners.forEach((listener) => listener());
}

function subscribeToTierChange(listener: () => void): () => void {
  if (tierChangeListeners.size === 0 && typeof window.matchMedia === 'function') {
    mobileQuery = window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_MOBILE_MAX}px)`);
    tabletQuery = window.matchMedia(`(max-width: ${CABINET_BREAKPOINT_TABLET_MAX}px)`);
    mobileQuery.addEventListener('change', notifyTierChange);
    tabletQuery.addEventListener('change', notifyTierChange);
  }
  tierChangeListeners.add(listener);

  return () => {
    tierChangeListeners.delete(listener);
    if (tierChangeListeners.size === 0 && mobileQuery && tabletQuery) {
      mobileQuery.removeEventListener('change', notifyTierChange);
      tabletQuery.removeEventListener('change', notifyTierChange);
      mobileQuery = null;
      tabletQuery = null;
    }
  };
}

/**
 * Live current breakpoint tier — a single shared subscription (see the
 * module-level comment above), reused by every hook below rather than each
 * resolving its own. Factored out of useCabinetBoxHeight (roadmap 11.1.1)
 * when useVoxelTrackGap (11.1.3) needed the same tier for a second,
 * independent value — see docs/specs/archive/OBLIQUE_CABINETRY_SLIDER_LINEAR.md
 * §1.4 for why this wasn't simply a second copy of the same listener logic.
 * Exported (was private) for useResponsivePanelOrientation's own reuse —
 * see docs/specs/archive/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.2. `resolveTier` doubles
 * as the snapshot getter: it's a cheap, pure read of the live matchMedia
 * state, so there's no need to separately cache "the last computed tier" —
 * useSyncExternalStore only re-renders a consumer when the returned
 * primitive actually differs from its last snapshot.
 */
export function useCabinetTier(): CabinetTier {
  return useSyncExternalStore(subscribeToTierChange, resolveTier);
}

/**
 * Live numeric cabinet box height for the current viewport tier — for the
 * wall-geometry math (cabinetGeometry.ts) and, since 11.1.3, the exact
 * square footprint voxel-track boxes use too (see that item's own spec §1.3
 * — the roadmap's box sizes are these same 3 numbers, not a new constant).
 * CabinetBox.tsx applies this same value as an inline --cabinet-box-height
 * custom property on its wrapper, rather than CSS independently re-deriving
 * it via @media rules. See docs/specs/archive/OBLIQUE_CABINETRY_FOUNDATION.md §1.3.
 */
export function useCabinetBoxHeight(): number {
  return CABINET_BOX_HEIGHT[useCabinetTier()];
}

/**
 * Live numeric voxel-track box gap for the current viewport tier (roadmap
 * Phase 11.1.3). See docs/specs/archive/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.4.
 */
export function useVoxelTrackGap(): number {
  return CABINET_VOXEL_GAP[useCabinetTier()];
}
