// ========================================
// bob (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9)
// ========================================
// The one sine cycle a working robot bobs on, shared by the body, its orbiters' counter-bobs
// (buildJobTimeline.ts) and the decoration group's (decor/jobDecor.ts). Its own module so
// jobDecor.ts need not import buildJobTimeline.ts, which imports it.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

// ========================================
// EXPORTS
// ========================================
/** One sine cycle on `y` about `base` (up by `amp`, down by `amp`, back), repeated `cycles` times. */
export function bob(el: Element, base: number, amp: number, cycle: number, cycles: number): gsap.core.Timeline {
  const q = cycle / 4;
  return gsap
    .timeline({ repeat: cycles - 1 })
    .to(el, { y: base - amp, duration: q, ease: 'sine.out' })
    .to(el, { y: base + amp, duration: 2 * q, ease: 'sine.inOut' })
    .to(el, { y: base, duration: q, ease: 'sine.in' });
}
