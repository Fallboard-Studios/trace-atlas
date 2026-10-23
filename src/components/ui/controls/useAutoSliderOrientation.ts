import { useEffect, useState, type RefObject } from 'react';
import type { SliderOrientation } from '@/types/controls';

export type ResolvedSliderOrientation = 'horizontal' | 'vertical';

/**
 * Resolves a schema's SliderOrientation to a concrete 'horizontal' | 'vertical'
 * for rendering. 'horizontal'/'vertical' pass through unchanged, no
 * observation. 'auto' measures the *parent* of `ref`'s element — never the
 * element's own box, since flipping orientation changes the slider's own
 * rendered size and a self-observed measurement would feed back into itself
 * (docs/specs/archive/VERTICAL_SLIDERS.md §1.2) — via ResizeObserver, resolving to
 * whichever axis (width or height) is longer. Defaults to 'horizontal'
 * before the first measurement and whenever no parent element exists yet.
 */
export function useAutoSliderOrientation(
  ref: RefObject<HTMLElement | null>,
  orientation: SliderOrientation,
): ResolvedSliderOrientation {
  // Only 'auto' needs observed state — 'horizontal'/'vertical' are a pure
  // function of the prop, returned directly below with no state/effect
  // involved (avoids a synchronous setState-in-effect for that branch).
  const [autoResolved, setAutoResolved] = useState<ResolvedSliderOrientation>('horizontal');

  useEffect(() => {
    if (orientation !== 'auto') return;
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      const next: ResolvedSliderOrientation = height > width ? 'vertical' : 'horizontal';
      // Bail on an unchanged value so a same-orientation resize doesn't
      // trigger a re-render — one more guard against feedback churn.
      setAutoResolved((prev) => (prev === next ? prev : next));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [orientation, ref]);

  if (orientation !== 'auto') return orientation;
  return autoResolved;
}
