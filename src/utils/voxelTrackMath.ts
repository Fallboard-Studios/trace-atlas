/**
 * Pure voxel-track math shared by SliderLinear (roadmap 11.1.3) and its two
 * thin follow-ups, SliderLog/SliderCenteredZero (11.1.4/11.1.5) — no DOM, no
 * GSAP, no React. See docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.5,
 * §1.8, §1.9 for the derivations.
 */

import { VOXEL_TRACK_POP_DISTANCE, VOXEL_TRACK_POP_DISTANCE_MIN_RATIO } from './cabinetGeometry';

/** A container too narrow for even this many boxes clamps to this count and
 *  scrolls, rather than shrinking boxes below their fixed per-breakpoint
 *  size. Confirmed via /interview-me. */
export const VOXEL_TRACK_MIN_BOX_COUNT = 3;

/**
 * The fitting BUDGET a vertical SliderLinear falls back to when its caller
 * omits `verticalHeight` — matches index.css's `--slider-vertical-height:
 * 256px`, the same default `SliderLog`/`SliderCenteredZero` already use
 * (docs/specs/VERTICAL_SLIDERS.md's own resolved "256px default, optional
 * per-instance override," which predates the voxel-track rewrite).
 *
 * Post-implementation correction, 2026-09-09: the voxel-track rewrite
 * (roadmap 11.1.3) replaced that CSS-only fallback with a live
 * `ResizeObserver` measurement of the slider's *parent* for the vertical
 * case, with no non-measuring default of its own — silently dropping the
 * original spec's resolved answer. For any real container whose own height
 * is itself auto/shrink-wrapped to its content (common: a plain block div,
 * not a fixed-height grid/flex cell), that measurement is genuinely
 * circular: the parent's height depends on this slider's own rendered
 * height, which — via `useVoxelTrackBoxCount` — depended on measuring that
 * same parent. Found live in the running app as an infinite resize loop,
 * hit first via `orientation: 'auto'` resolving to vertical in an
 * unprepared container (no real vertical consumer had been exercised
 * before), though the same circularity applies equally to an explicit
 * `orientation: 'vertical'` schema with no `verticalHeight` override.
 * `SliderLinear.tsx` now defaults to this constant instead of measuring —
 * restoring the original non-circular design, quantized to real boxes via
 * the same "fitting budget" treatment an explicit `verticalHeight` already
 * gets (docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.7).
 */
export const VOXEL_TRACK_DEFAULT_VERTICAL_HEIGHT = 256;

/**
 * How many fixed-size boxes fit in `availableLength` px without overflowing,
 * floored, clamped to VOXEL_TRACK_MIN_BOX_COUNT. N boxes of size `boxSize`
 * with (N-1) gaps of `gap` occupy N*(boxSize+gap) - gap px; solving for the
 * largest N that fits gives this formula. See spec §1.5.
 */
export function computeFittedBoxCount(availableLength: number, boxSize: number, gap: number): number {
  if (boxSize <= 0) return VOXEL_TRACK_MIN_BOX_COUNT;
  const fitted = Math.floor((availableLength + gap) / (boxSize + gap));
  return Math.max(VOXEL_TRACK_MIN_BOX_COUNT, fitted);
}

/** Total rendered length of `boxCount` boxes — the inverse of the packing
 *  math above, used to size Slider.Root itself to a fixed function of box
 *  count (confirmed intent). */
export function computeVoxelTrackLength(boxCount: number, boxSize: number, gap: number): number {
  return boxCount * boxSize + Math.max(0, boxCount - 1) * gap;
}

export interface VoxelBoxState {
  /** 0-100. Only the straddling box is ever fractional. */
  fillPercent: number;
  /** 0-1, fed directly into CabinetBox's popped prop. */
  popT: number;
  /**
   * True for exactly one box per call — the one representing the slider's
   * exact current value. `popT` alone can't identify it: every filled box
   * (not just the straddling one) is ALSO `popT: 1` — found live, 2026-09-09,
   * as the root cause of VoxelTrack.tsx rendering every filled box through
   * the 2-piece glow+flat straddle path (a hidden, always-0-width "flat"
   * CabinetBox riding along with every one of them), not just the actual
   * straddling box. `VoxelTrack.tsx` branches on this field now, not
   * `popT !== 1`.
   */
  isStraddling: boolean;
  /**
   * SliderCenteredZero only (roadmap 11.1.5). When set, VoxelTrack computes
   * this box's popDistance ceiling from THIS local index/count pair —
   * distance from the zero seam within this box's own side of the track —
   * instead of the box's raw position in the whole row. Both fields are
   * always set together or not at all. Omitted (the default for
   * computeVoxelBoxStates' own output, used by SliderLinear/SliderLog)
   * preserves their exact existing whole-row falloff. z-index
   * (computeVoxelBoxZIndex) is NOT affected by either field — see
   * docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.3.
   */
  popDistanceLocalIndex?: number;
  popDistanceLocalCount?: number;
  /**
   * SliderCenteredZero only (roadmap 11.1.5 bugfix). VoxelTrack's straddling
   * slot always renders its glow (filled) piece as the first DOM child,
   * which CSS positions on the box's MIN side (leftmost/bottommost) — correct
   * for computeVoxelBoxStates' own single min-anchored scan (used as-is by
   * SliderLinear/SliderLog, and by computeVoxelBoxStatesCenteredZero's
   * positive side below, where the min side of the straddling box IS the
   * filled side). It's backwards for the negative side: after that side's
   * own reversal (see computeVoxelBoxStatesCenteredZero), the filled portion
   * of its straddling box is the one nearer the SEAM — its MAX side, not its
   * min side. Set true there so VoxelTrack visually swaps which side the
   * glow piece renders on; omitted/false (computeVoxelBoxStates' own output,
   * and the positive side here) preserves the existing min-side-is-filled
   * rendering. See docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.2
   * and its own post-ship bugfix note.
   */
  flipStraddleFill?: boolean;
}

/**
 * Dual-fill + extrusion-falloff, per box. Boxes are indexed 0 (nearest min)
 * through boxCount-1 (nearest max) — Radix's own horizontal min-at-left /
 * vertical min-at-bottom convention (SliderCenteredZero.tsx's own existing
 * precedent). See spec §1.8 for the roadmap-wording cross-check.
 */
export function computeVoxelBoxStates(value: number, min: number, max: number, boxCount: number): VoxelBoxState[] {
  const t = max === min ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  const rawPosition = t * boxCount;
  const straddlingIndex = Math.min(boxCount - 1, Math.floor(rawPosition));
  const localFraction = rawPosition - straddlingIndex;

  // Every filled box (i <= straddlingIndex) is popT: 1 — fully popped.
  // Revised 2026-09-08: previously stepped down toward 0 the further a
  // filled box sat from the straddling box (i / straddlingIndex), tapering
  // relative to how much of the track happened to be filled. That let a
  // box near the minimum end reach the same full pop distance as a box
  // near the maximum the moment it became the straddling box — wrong per
  // /interview-me. Depth-by-row-position now lives entirely in
  // computeVoxelBoxPopDistance below, keyed to each box's fixed index, not
  // to its distance from wherever the value currently sits.
  return Array.from({ length: boxCount }, (_, i) => {
    if (i < straddlingIndex) return { fillPercent: 100, popT: 1, isStraddling: false };
    if (i > straddlingIndex) return { fillPercent: 0, popT: 0, isStraddling: false };
    return { fillPercent: localFraction * 100, popT: 1, isStraddling: true };
  });
}

/**
 * How far box `index` (of `boxCount` total, 0 = nearest min) can protrude at
 * full pop — a fixed ceiling determined by the box's own row position, never
 * by the slider's current value. Interpolates linearly from
 * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO of VOXEL_TRACK_POP_DISTANCE at box 0 up
 * to the full VOXEL_TRACK_POP_DISTANCE at the last box. Only meaningful for
 * a box that's actually popped (popT > 0, from computeVoxelBoxStates above);
 * a flat box never renders this value regardless of what it computes to.
 * See docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md §1.8 revision note.
 */
export function computeVoxelBoxPopDistance(index: number, boxCount: number): number {
  const span = Math.max(1, boxCount - 1); // guards boxCount <= 1 (single-box row)
  const positionFraction = Math.min(1, Math.max(0, index / span));
  const minDistance = VOXEL_TRACK_POP_DISTANCE * VOXEL_TRACK_POP_DISTANCE_MIN_RATIO;
  return minDistance + (VOXEL_TRACK_POP_DISTANCE - minDistance) * positionFraction;
}

/**
 * Paint-order z-index for box `index` (of `boxCount` total) in a VoxelTrack
 * row/column, so a box whose walls visually bleed into a neighbor's space
 * (per computeVoxelBoxPopDistance's now-varying-by-position pop distance)
 * paints OVER that neighbor rather than under it. The wall geometry always
 * extends along the same fixed 2:1 oblique vector — right and down,
 * regardless of axis (computeCabinetGeometry) — so which neighbor a box
 * bleeds into depends on how index maps to screen position, which is
 * axis-dependent (VoxelTrack.css):
 *  - horizontal: box 0 (nearest min) renders leftmost, walls extend
 *    rightward into the next box's space — z-index DESCENDS as index rises,
 *    so the leftmost box always wins.
 *  - vertical: box 0 (nearest min) renders bottommost (CSS's own
 *    column-reverse), walls extend downward into the box BELOW it (the
 *    next-lower index) — z-index ASCENDS as index rises, so the topmost
 *    (highest-index) box always wins.
 * In both cases: "up/left of a neighbor" outranks "down/right of it" —
 * confirmed by feel against the real running app, 2026-09-08.
 */
export function computeVoxelBoxZIndex(index: number, boxCount: number, axis: 'horizontal' | 'vertical'): number {
  return axis === 'horizontal' ? boxCount - index : index + 1;
}

/**
 * How much trailing space (px), at the far end of the main axis, must be
 * reserved so the LAST box's (nearest max) pop-out bleed never exits
 * Slider.Root/Track's own bounding box. Every other box's bleed lands
 * inside its own down-right neighbor's slot — computeVoxelBoxZIndex already
 * makes sure it paints over that neighbor rather than under it — but the
 * last box has no next slot to bleed into, and it's the one box guaranteed
 * to reach the full VOXEL_TRACK_POP_DISTANCE (computeVoxelBoxPopDistance).
 *
 * Meaningful only for the horizontal axis: the fixed 2:1 oblique vector
 * always bleeds right and down regardless of axis (computeVoxelBoxZIndex's
 * own comment) — a vertical track's last box (topmost, per column-reverse)
 * bleeds DOWN, into the column, not past its own top edge, so there's no
 * equivalent main-axis gap to reserve there today.
 *
 * Found live in the running app, 2026-09-09 — visible only at value === max,
 * and only for a container width close enough to an exact multiple of
 * (boxSize + gap) that computeFittedBoxCount's own floor happened to leave
 * no slack to absorb the bleed by chance. useVoxelTrackBoxCount subtracts
 * this from the available length before fitting a box count, so real slack
 * always exists regardless of the container's exact width; SliderLinear.tsx
 * adds it back on top of computeVoxelTrackLength's own tight result when
 * sizing Slider.Root, so the reserved slack is actually rendered, not just
 * excluded from the fit.
 */
export function computeVoxelTrackTrailingReserve(axis: 'horizontal' | 'vertical'): number {
  return axis === 'horizontal' ? 2 * VOXEL_TRACK_POP_DISTANCE : 0;
}

/**
 * A box's front-face background: solid accent when fully filled, solid
 * surface when fully empty, a HARD-STOP two-color linear-gradient (not a
 * blend) for the straddling box's local split. Reuses the same
 * --color-accent/--color-surface tokens CabinetBox's own face-shading and
 * default front face already use — no new CSS custom property. See spec §1.9.
 */
export function computeVoxelFillBackground(fillPercent: number, axis: 'horizontal' | 'vertical'): string {
  // A fully-filled box renders the literal 2-tone gradient (Roadmap Phase 14, docs/specs/
  // COLOR_SCHEME_TRAIT_THEMING.md §1.2) — one of the few flat-rectangle fills that can. The
  // partial-fill hard-stop split below stays on the flat --color-accent midpoint, deliberately
  // NOT nesting a gradient inside a gradient (same doc, §1.2's scope-narrowing).
  if (fillPercent >= 100) return 'var(--color-accent-gradient)';
  if (fillPercent <= 0) return 'var(--color-surface)';
  const direction = axis === 'vertical' ? 'to top' : 'to right'; // box 0 = min = bottom/left = the filled side
  return `linear-gradient(${direction}, var(--color-accent) 0%, var(--color-accent) ${fillPercent}%, var(--color-surface) ${fillPercent}%, var(--color-surface) 100%)`;
}

/** Minimum visible size fraction for the straddling box (the one currently
 *  representing the slider's exact value) — so it never fully disappears
 *  at value === min, where its own local fill is exactly 0%. Tuned by
 *  feel, expect to move (same posture as CABINET_POP_DISTANCE/
 *  VOXEL_TRACK_POP_DISTANCE in cabinetGeometry.ts). */
export const VOXEL_STRADDLE_MIN_SIZE_FRACTION = 0.1;

/**
 * How much of the normal box size the straddling box should actually
 * render at, along the axis the value travels — replaces the old
 * "full-size box with an internal hard-split gradient" representation
 * with a physically smaller box (still fully popped, still solid-colored
 * — see VoxelTrack.tsx), clamped so it never fully disappears at
 * fillPercent: 0. Only ever applied to the one box whose popT === 1
 * (the straddling box); every other box keeps rendering at full size.
 */
export function computeVoxelStraddleSizeFraction(fillPercent: number): number {
  return Math.max(VOXEL_STRADDLE_MIN_SIZE_FRACTION, fillPercent / 100);
}

/**
 * SliderCenteredZero's own even-numbered floor (roadmap 11.1.5) — replaces
 * the odd VOXEL_TRACK_MIN_BOX_COUNT (3) for this one consumer, so its
 * dead-center seam (Math.floor(boxCount / 2)) always lands exactly on a box
 * boundary, never inside one. 2 boxes per side is the smallest row that
 * still leaves room for a purely-filled box before the straddling one on
 * each side, closer to how every other voxel-track slider's own minimum
 * reads than a lone 1-box-per-side straddler would.
 */
export const VOXEL_TRACK_MIN_BOX_COUNT_EVEN = 4;

/**
 * Rounds a fitted box count down to the nearest even number, floored at
 * VOXEL_TRACK_MIN_BOX_COUNT_EVEN (4) rather than the odd VOXEL_TRACK_MIN_BOX_COUNT
 * (3). An already-even count is returned unchanged. See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.4.
 */
export function computeEvenBoxCount(rawBoxCount: number): number {
  const rounded = rawBoxCount - (rawBoxCount % 2);
  return Math.max(VOXEL_TRACK_MIN_BOX_COUNT_EVEN, rounded);
}

/**
 * Zero-anchored dual-fill (roadmap 11.1.5) — a genuine adaptation of
 * computeVoxelBoxStates above, not a drop-in reuse. The row is split into
 * two independent halves at a fixed dead-center seam, `Math.floor(boxCount /
 * 2)` — never the schema's own proportional zero point — so the negative
 * side always gets `seamIndex` boxes and the positive side the remainder.
 * Only the side matching `value`'s sign is ever computed with real fill; the
 * other renders every one of its boxes flat. At `value === 0` exactly, both
 * sides are flat — no straddling box, no marker.
 *
 * Each side reuses computeVoxelBoxStates directly, unmodified. The positive
 * side needs no remapping: its own conceptual index 0 (fills first, at any
 * small magnitude) is already the box nearest the seam, which is also the
 * lowest global index on that side. The negative side's conceptual index 0
 * must land at the HIGHEST global index on that side instead (nearest the
 * seam, not nearest min) — computed against the side's own magnitude
 * (`-value`, `0`, `-min`) and then reversed before assembly. See
 * docs/specs/OBLIQUE_CABINETRY_SLIDER_CENTERED_ZERO.md §1.2 for the full
 * worked derivation.
 *
 * Every returned box also carries popDistanceLocalIndex/LocalCount — that
 * box's distance from the seam within its own side (0 = adjacent to the
 * seam), so VoxelTrack.tsx's falloff ramps shallow-at-the-seam ->
 * full-depth-at-each-side's-own-physical-end, independently per side.
 * z-index (computeVoxelBoxZIndex) is unaffected — SliderCenteredZero.tsx
 * calls it exactly as SliderLinear/SliderLog do, with the real global
 * index/boxCount.
 */
export function computeVoxelBoxStatesCenteredZero(
  value: number,
  min: number,
  max: number,
  boxCount: number,
): VoxelBoxState[] {
  const seamIndex = Math.floor(boxCount / 2);
  const negativeCount = seamIndex;
  const positiveCount = boxCount - seamIndex;

  const flatState = (): VoxelBoxState => ({ fillPercent: 0, popT: 0, isStraddling: false });

  const negativeFill =
    value < 0
      ? computeVoxelBoxStates(-value, 0, -min, negativeCount).slice().reverse()
      : Array.from({ length: negativeCount }, flatState);

  const positiveFill =
    value > 0
      ? computeVoxelBoxStates(value, 0, max, positiveCount)
      : Array.from({ length: positiveCount }, flatState);

  const negativeStates: VoxelBoxState[] = negativeFill.map((state, i) => ({
    ...state,
    popDistanceLocalIndex: negativeCount - 1 - i,
    popDistanceLocalCount: negativeCount,
    flipStraddleFill: true,
  }));

  const positiveStates: VoxelBoxState[] = positiveFill.map((state, i) => ({
    ...state,
    popDistanceLocalIndex: i,
    popDistanceLocalCount: positiveCount,
    flipStraddleFill: false,
  }));

  return [...negativeStates, ...positiveStates];
}

/** How long each successive box in a staggered pop-out run waits before starting its own
 *  animation, relative to the previous one (Crawford's own request, 2026-09-30) — see
 *  computeVoxelPopStaggerDelays below. */
export const VOXEL_POP_STAGGER_SECONDS = 0.05;

/**
 * A non-smooth (non-drag, non-eased) value change — a swell tick snapping in instantly, a
 * keyboard Home/End jump, a session load — can flip several boxes' filled/flat state in the same
 * render, all at once: every affected CabinetBox starts its own pop tween the same frame, which
 * reads as a single simultaneous block popping rather than a value sweeping across the track.
 * This computes a per-box start delay (seconds, fed straight into CabinetBox's own `delay` prop)
 * so those boxes instead pop in sequence, ordered by distance from `prevStraddleIndex` (the box
 * nearest the ORIGINAL value goes first, `VOXEL_POP_STAGGER_SECONDS` apart, ending nearest the new
 * value) — never by raw array position, since a jump can run in either direction.
 *
 * An ORDINARY single-step change (a drag, or one step of an already-running eased interpolation)
 * flips at most one box per render and gets no stagger at all (every delay 0) — this only kicks in
 * once more than one box flips in the same comparison, which a smooth per-frame change never
 * produces.
 *
 * `prevFilled`/`currFilled` are one boolean per box — true for an ordinary (non-straddling) box
 * whose popT === 1 (VoxelTrack's own "is this box fully popped" check) — and must be the same
 * length; `prevStraddleIndex` is the previous render's straddling box index (or null on the very
 * first comparison, before any prior render exists to compare against — no stagger is possible
 * without an origin point, so every delay is 0 in that case too).
 */
export function computeVoxelPopStaggerDelays(
  prevFilled: boolean[],
  currFilled: boolean[],
  prevStraddleIndex: number | null,
): number[] {
  const delays = new Array(currFilled.length).fill(0);
  if (prevStraddleIndex === null) return delays;

  const flipped: number[] = [];
  for (let i = 0; i < currFilled.length; i++) {
    if (prevFilled[i] !== currFilled[i]) flipped.push(i);
  }
  if (flipped.length <= 1) return delays; // an ordinary single-box change — no stagger needed

  flipped.sort((a, b) => Math.abs(a - prevStraddleIndex) - Math.abs(b - prevStraddleIndex));
  flipped.forEach((index, rank) => {
    delays[index] = rank * VOXEL_POP_STAGGER_SECONDS;
  });
  return delays;
}
