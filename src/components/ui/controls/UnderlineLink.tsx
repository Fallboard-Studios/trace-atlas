import { useEffect, useRef, type CSSProperties } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { getCabinetPopDuration, getCabinetPopEase } from './cabinetAnimation';
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import './UnderlineLink.css';

/** How far the bar slides on full pop — a plain vertical offset, not CabinetBox's 2:1 oblique
 *  vector (that vector exists to simulate a box's front face sliding toward the viewer; a flat
 *  underline just drops straight down as it "protrudes"). */
const UNDERLINE_POP_DISTANCE = 4;

interface UnderlineLinkProps {
  /** Whether the bar should be popped (protruding, translated down by UNDERLINE_POP_DISTANCE) —
   *  the caller (a row's own transparent <button>) computes this from hover/focus/press,
   *  mirroring Button.tsx's own `popped` computation. */
  popped: boolean;
  /** Unique timelineMap key for this instance, e.g. `underline-link-${node.id}`. */
  timelineKey: string;
  /** Resolved accent color — either this node's own trait/robot color, or its nearest ancestor's
   *  (docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.2). Passed directly, not read from CSS
   *  cascade. */
  color: string;
}

/**
 * A 4px-tall decorative underline with a CabinetBox-style pop (GSAP timeline, registered in
 * timelineMap, same direction-dependent duration/ease as CabinetBox) — no text of its own. A
 * single-axis y offset only; no oblique wall geometry, since a flat bar has no need for
 * cabinetGeometry.ts's box-front-face derivation. See docs/specs/
 * NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.4/§5.2.
 */
export function UnderlineLink({ popped, timelineKey, color }: UnderlineLinkProps) {
  const barRef = useRef<HTMLDivElement>(null);
  // Tracks the `popped` value the tween effect last actually ran for — null means "hasn't run
  // yet". Lets the effect tell a real popped transition apart from a dependency-only re-run
  // (e.g. `color` changing while `popped` stays the same), which must reposition instantly
  // rather than replay the pop/flat animation from the opposite state — same distinction
  // CabinetBox's own geometry effect makes.
  const prevPoppedRef = useRef<boolean | null>(null);

  // useGSAP's own context.revert() only kills the underlying GSAP tween it tracked — it has no
  // knowledge of the separate timelineMap registry, so this manual cleanup is still required.
  useEffect(() => {
    return () => killTimeline(timelineKey);
  }, [timelineKey]);

  useGSAP(() => {
    if (!barRef.current) return;
    killTimeline(timelineKey);

    const previousPopped = prevPoppedRef.current;
    const isFirstRun = previousPopped === null;
    const isTransition = isFirstRun || previousPopped !== popped;
    prevPoppedRef.current = popped;

    const target = popped ? UNDERLINE_POP_DISTANCE : 0;

    if (!isTransition) {
      // A dependency-only re-run (e.g. `color` changed, `popped` didn't) — reposition instantly
      // to the same target state. Replaying the pop/flat tween here would incorrectly assume the
      // bar is coming from the *opposite* state.
      gsap.set(barRef.current, { y: target });
      return;
    }

    // On the very first run, animate in from the numeric opposite — matches CabinetBox's own
    // mount behavior. Once a real prior value exists, animate from that instead.
    const fromPopped = isFirstRun ? !popped : previousPopped;
    const from = fromPopped ? UNDERLINE_POP_DISTANCE : 0;

    const direction = previousPopped !== null && !popped && previousPopped ? 'out' : 'in';
    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getCabinetPopDuration(prefersReducedMotion, direction);
    const ease = getCabinetPopEase(direction);

    const tl = gsap.timeline();
    tl.fromTo(barRef.current, { y: from }, { y: target, duration, ease }, 0);
    setTimeline(timelineKey, tl);
  }, { scope: barRef, dependencies: [popped, timelineKey] });

  return (
    <div
      ref={barRef}
      className="sc-underline-link"
      aria-hidden="true"
      style={{ '--underline-link-color': color } as CSSProperties}
    />
  );
}

export default UnderlineLink;
