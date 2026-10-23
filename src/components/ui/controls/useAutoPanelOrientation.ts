import { useEffect, useState, type RefObject } from 'react';
import type { PanelOrientation } from '@/types/controls';

export type ResolvedPanelOrientation = 'row' | 'column';

/**
 * Width, in px, below which an 'auto' DirectionalPanel stacks into a column instead of laying
 * out as a row — first-pass guess (no existing pixel-breakpoint precedent anywhere else in this
 * app), tuned for the EQ & Filters layout's own children (3-Band EQ beside a stacked Low-Pass/
 * High-Pass column). Confirm during manual check and adjust if it doesn't feel right in the
 * running app — same "first-pass, confirm visually" treatment LFO_DRIFT_GROUPS' own invented
 * labels got.
 */
export const AUTO_PANEL_ROW_MIN_WIDTH = 640;

/**
 * Resolves a DirectionalPanelSchema's `orientation` to a concrete 'row' | 'column' for
 * rendering. 'row'/'column' pass through unchanged, no observation. 'auto' measures the
 * *parent* of `ref`'s element — never the panel's own box, since flipping orientation changes
 * the panel's own rendered height and a self-observed measurement would feed back into itself
 * (same reasoning useAutoSliderOrientation's own parent-not-self choice already established) —
 * via ResizeObserver, going 'row' once the parent is at least AUTO_PANEL_ROW_MIN_WIDTH wide,
 * 'column' otherwise. Defaults to 'column' before the first measurement and whenever no parent
 * element exists yet — the narrower, safer fallback (unlike useAutoSliderOrientation's
 * 'horizontal' default, since here the two orientations aren't symmetric: a too-narrow row is a
 * real overflow risk, a too-eager column never is).
 */
// Never called with 'responsive' — that literal resolves through
// useResponsivePanelOrientation instead (docs/specs/archive/AUDIO_RIG_RESPONSIVE_LAYOUT.md
// §1.2), so it's excluded from this hook's own accepted input type;
// DirectionalPanel.tsx sanitizes its call accordingly.
export function useAutoPanelOrientation(
  ref: RefObject<HTMLElement | null>,
  orientation: Exclude<PanelOrientation, 'responsive'>,
): ResolvedPanelOrientation {
  // Only 'auto' needs observed state — 'row'/'column' are a pure function of the prop, returned
  // directly below with no state/effect involved (avoids a synchronous setState-in-effect for
  // that branch).
  const [autoResolved, setAutoResolved] = useState<ResolvedPanelOrientation>('column');

  useEffect(() => {
    if (orientation !== 'auto') return;
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const { width } = entries[0].contentRect;
      const next: ResolvedPanelOrientation = width >= AUTO_PANEL_ROW_MIN_WIDTH ? 'row' : 'column';
      // Bail on an unchanged value so a same-orientation resize doesn't trigger a re-render —
      // one more guard against feedback churn.
      setAutoResolved((prev) => (prev === next ? prev : next));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [orientation, ref]);

  if (orientation !== 'auto') return orientation;
  return autoResolved;
}
