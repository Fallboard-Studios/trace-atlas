import { useCabinetTier } from './useCabinetBoxHeight';

export type ResolvedPanelOrientation = 'row' | 'column';

/**
 * Resolves the global viewport tier (mobile/tablet/desktop —
 * cabinetBreakpoints.ts, the same tiers CabinetBox sizing already uses) to a
 * concrete 'row' | 'column' for DirectionalPanel's 'responsive' orientation.
 * Unlike useAutoPanelOrientation's 'auto' (which measures one panel's own
 * parent element and can resolve differently per instance depending on how
 * much room that panel happens to have), every 'responsive' panel reads the
 * same tier and resolves identically: 'column' on mobile/tablet, 'row' on
 * desktop. No ref, no ResizeObserver — this only reads useCabinetTier()'s
 * existing matchMedia listener pair. See
 * docs/specs/archive/AUDIO_RIG_RESPONSIVE_LAYOUT.md §1.2.
 */
export function useResponsivePanelOrientation(): ResolvedPanelOrientation {
  const tier = useCabinetTier();
  return tier === 'desktop' ? 'row' : 'column';
}
