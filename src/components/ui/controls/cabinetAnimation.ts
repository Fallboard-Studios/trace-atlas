/**
 * Pop/flat transition timing for CabinetBox. Respects prefers-reduced-motion
 * the same way PowerRockerSwitch.css and NavPanel.tsx's own GSAP slide do —
 * the box still pops/flattens, but the transition snaps instead of animating.
 *
 * Direction-dependent DURATION (2026-09-09 follow-up): popping OUT
 * (flattening) uses the shorter CABINET_POP_DURATION_OUT instead of
 * CABINET_POP_DURATION, targeting a real, felt problem — a flattening
 * box's walls lingering at a small-but-visible size for too long, most
 * noticeable on a slider click (which can flip many boxes' popT from 1→0
 * in the same render, all animating at once) rather than a drag (which
 * flips at most one or two boxes per frame).
 *
 * Direction-dependent EASE was also tried here — power2.in ("accelerate
 * away") for popping out, reasoning by analogy to Material Design's
 * enter/exit easing split — and REVERTED the same day: power2.in is
 * slow-start/fast-finish, so it kept the wall near FULL size for most of
 * the transition before a sudden late collapse, reading as a LONGER, more
 * prominent flash than power2.out's own front-loaded shrink (most of the
 * shrink happens early; by the time the remaining sliver is small, it's
 * also nearly gone — the earlier "still lingers" complaint was really
 * about CABINET_POP_DURATION being long overall, not the curve shape).
 * Both directions use power2.out; only the duration differs. See
 * getCabinetPopEase's own comment.
 */
export const CABINET_POP_DURATION = 0.75;

/**
 * Popping-out duration — shorter than CABINET_POP_DURATION so a flattening
 * box doesn't stay visible any longer than it has to. Tuned by feel; expect
 * this to move (same posture as CABINET_POP_DISTANCE/VOXEL_TRACK_POP_DISTANCE
 * in cabinetGeometry.ts — read this file, not a doc, for the current value).
 */
export const CABINET_POP_DURATION_OUT = 0.35;

export type CabinetPopDirection = 'in' | 'out';

export function getCabinetPopDuration(prefersReducedMotion: boolean, direction: CabinetPopDirection = 'in'): number {
  if (prefersReducedMotion) return 0;
  return direction === 'out' ? CABINET_POP_DURATION_OUT : CABINET_POP_DURATION;
}

/**
 * `power2.out` (decelerate into place, front-loaded change) for both
 * directions — kept as a function (not inlined at the 4 call sites) so the
 * direction parameter stays available for a future retune, and so this
 * comment has one place to live recording why `power2.in` for "out" was
 * tried and reverted (see cabinetAnimation.ts's own top comment). Applied
 * uniformly to every property in a single popped transition (front-face
 * offset, both wall scales, glow) by the caller, so all four stay
 * synchronized — never mix eases within one transition.
 */
export function getCabinetPopEase(direction: CabinetPopDirection = 'in'): string {
  return direction === 'out' ? 'power2.out' : 'power2.out';
}
