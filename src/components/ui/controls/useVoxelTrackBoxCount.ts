import { useEffect, useState, type RefObject } from 'react';
import { computeFittedBoxCount } from '@/utils/voxelTrackMath';

/**
 * Live, self-fitting voxel-track box count. `axis` must already be resolved
 * ('horizontal' | 'vertical', never 'auto') — orientation resolves first,
 * box count fits second (docs/specs/archive/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.6).
 *
 * Measurement target is axis-dependent, per that spec's own §1.5 amendment
 * (originally specified as "always observe the parent," corrected after a
 * real running-app regression traced it to every ancestor in a control's
 * layout chain needing to be individually, correctly non-content-dependent
 * for the measurement to come out right):
 *
 * - **Horizontal** observes `ref`'s own element directly. Its width is
 *   externally determined — a plain block box fills whatever its containing
 *   block gives it, regardless of its own children's size — and never
 *   inflated by its own oversized content (`.sc-slider-linear`'s
 *   `overflow-x: auto` contains that). Self-observation here carries none
 *   of the "measuring my own consequence" circularity `useAutoSliderOrientation`
 *   avoids for `'auto'` orientation (where the element's size IS a direct
 *   result of the very decision being measured) — it just reads whatever
 *   width the browser already, correctly, externally decided, however deep
 *   or complex the ancestor layout chain is.
 * - **Vertical** would observe `ref`'s *parent* if it ever reached live
 *   measurement at all — `.sc-slider-linear` is `display: inline-flex`
 *   there, which DOES shrink-wrap its height to content by default, so
 *   self-observing height would be genuinely circular. In practice this
 *   branch is unreachable for every real vertical consumer today
 *   (`robotOptionsConfig.ts`'s per-layer Gain/Phase/Interval/Detune,
 *   `audioRigConfig.ts`'s EQ3 and Filter Frequency/Resonance): each one now
 *   declares its own schema-level `verticalHeight` (roadmap 13's fix,
 *   forwarded by `AudioRigDrawer.tsx`'s `renderParamControl` and
 *   `SignatureArrayDrawer.tsx`'s `renderField`), so `explicitAvailableLength`
 *   is always defined for the vertical axis in production and the
 *   `ResizeObserver` below never runs for it. An earlier version of this
 *   comment claimed the opposite — that live parent-measurement was shipped
 *   and confirmed correct against these same consumers — which was wrong:
 *   the actual shipped behavior was a *fixed* budget
 *   (`VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT`) applied uniformly regardless of
 *   how much real room a given panel had, which is what roadmap 13's bug
 *   report ("some, not all, vertical sliders overflow their bounds") turned
 *   out to be. This branch is kept only as a fallback for a hypothetical
 *   future caller that both omits `verticalHeight` and sits in a genuinely
 *   non-auto-height parent — exercised today only by this hook's own unit
 *   tests, not by the running app.
 *
 * `explicitAvailableLength`, when provided, skips live measurement entirely
 * and fits against that fixed number instead — SliderLinear's own
 * verticalHeight prop (in turn sourced from the schema field of the same
 * name, for every real vertical consumer), on a vertical slider, becomes a
 * fitting BUDGET rather than a literal applied length this way (§1.7).
 *
 * `reserve`, when provided, is subtracted from the available length (live-
 * measured or explicit) before fitting — real trailing slack for the last
 * box's own pop-out bleed (computeVoxelTrackTrailingReserve), rather than
 * fitting boxes flush to the container's own edge and leaving that slack to
 * chance. Clamped so a reserve larger than the available length still fits
 * against 0, never a negative number. Defaults to 0 — existing callers see
 * no behavior change.
 */
export function useVoxelTrackBoxCount(
  ref: RefObject<HTMLElement | null>,
  axis: 'horizontal' | 'vertical',
  boxSize: number,
  gap: number,
  explicitAvailableLength?: number,
  reserve = 0,
): number {
  const [measuredLength, setMeasuredLength] = useState(0);

  useEffect(() => {
    if (explicitAvailableLength !== undefined) return;
    const target = axis === 'horizontal' ? ref.current : ref.current?.parentElement;
    if (!target) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      // Rounded to a whole pixel — same bugfix as CabinetBox.tsx's own ResizeObserver handler:
      // real browser sub-pixel layout rounding can report a fractionally different measurement
      // across consecutive observations of the exact same rendered size (no real resize
      // happened). Without rounding, that jitter fails the prev === next bail-out below on every
      // callback, re-running this hook's consumers (any voxel-track slider) for no visible
      // reason. Rounding first means two measurements that differ only by sub-pixel noise
      // produce the same integer, so the bail-out actually catches — a real resize still updates
      // normally.
      const next = Math.round(axis === 'vertical' ? height : width);
      setMeasuredLength((prev) => (prev === next ? prev : next));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [ref, axis, explicitAvailableLength]);

  const availableLength = explicitAvailableLength ?? measuredLength;
  return computeFittedBoxCount(Math.max(0, availableLength - reserve), boxSize, gap);
}
