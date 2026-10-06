// ========================================
// useHaloMotion (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4, Task 8)
// ========================================
// GSAP-owned motion for a robot's halo: mount state and the dial tween (stops/rx/ry, Task 8);
// `decorateArc` (Task 11) is still a no-op here — it will be the halo's only writer of opacity,
// fading it 0 -> dimOpacity -> 0 across a spawn/despawn arc (Amendment, 2026-10-06: the halo is
// invisible except during that arc, on every robot, in every context — see spec §1). This hook
// never reads Zustand or calls AudioEngine; the `halo` dial and `dimOpacity` are computed by
// `RobotBody` and handed in as plain props.

// ========================================
// IMPORTS
// ========================================
import { useEffect, useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import { HALO_TWEEN, type HaloStop } from './haloDials';

// ========================================
// TYPES
// ========================================
export type ArcKind = 'spawn' | 'despawn';

/** The arc timeline's own kind and duration, and the timeline itself — `useOrbiterMotion` (Task 10)
 *  calls this once per spawn/despawn arc, after the arc timeline is built and before it plays. */
export type ArcDecorator = (kind: ArcKind, duration: number, arcTl: ReturnType<typeof gsap.timeline>) => void;

/** The halo's already-resolved per-instance shape — `RobotBody`'s `haloDials()` output turned into
 *  the ellipse's own attributes (radius × widthFactor etc.), the same shape `RobotGemHalo` carries
 *  minus colour/opacity/gradientId (colour and the gradient id never change after mount; opacity is
 *  this hook's own business, Task 11). */
export interface HaloMotionDial {
  rx: number;
  ry: number;
  stops: HaloStop[];
}

export interface UseHaloMotionOptions {
  /** `g.gem` — the GSAP scope this hook queries `.gem__halo`/`stop` beneath. */
  root: RefObject<SVGGElement | null>;
  robotId: string;
  context: 'world' | 'avatar';
  halo: HaloMotionDial;
  /** Battery dim — read live by `decorateArc` (Task 11) via a ref; never tweened by this hook. */
  dimOpacity: number;
  /** Cards (`motion: false`) never call this hook — `enabled: false` is only the disabled path a
   *  caller might still exercise (e.g. a density of 0 motion context). */
  enabled: boolean;
}

export interface UseHaloMotionResult {
  decorateArc: ArcDecorator;
}

// ========================================
// HELPERS
// ========================================
/** Gradient stop offset as SVG wants it: a percentage, 2 dp (RobotGem's own `pct`, duplicated here
 *  since GSAP tweens the attribute as a string and both sides must agree on its format). */
const pct = (offset: number) => `${(offset * 100).toFixed(2)}%`;

function queryHaloEllipse(root: SVGGElement): SVGEllipseElement | null {
  return root.querySelector<SVGEllipseElement>('.gem__halo');
}

function queryStops(root: SVGGElement): SVGStopElement[] {
  return [...root.querySelectorAll<SVGStopElement>('stop')];
}

// ========================================
// HOOK
// ========================================
export function useHaloMotion({ root, robotId, context, halo, dimOpacity, enabled }: UseHaloMotionOptions): UseHaloMotionResult {
  const reducedMotion = prefersReducedMotion();
  const key = `halo-${context}-${robotId}`;

  // Read live by decorateArc (Task 11) — dimOpacity is never tweened by this hook, so a battery
  // edit between arcs needs no gsap.* call at all; only the next arc ever shows it.
  const dimOpacityRef = useRef(dimOpacity);
  useEffect(() => {
    dimOpacityRef.current = dimOpacity;
  }, [dimOpacity]);

  // ----------------------------------------
  // Mount — the stops, rx/ry, and the ellipse opacity to 0 (amendment: no idle baseline).
  // ----------------------------------------
  useGSAP(
    () => {
      if (!enabled || !root.current) return;
      const ellipse = queryHaloEllipse(root.current);
      if (!ellipse) return;
      gsap.set(ellipse, { attr: { rx: halo.rx, ry: halo.ry }, opacity: 0 });
      queryStops(root.current).forEach((stopEl, i) => {
        const s = halo.stops[i];
        if (!s) return;
        gsap.set(stopEl, { attr: { offset: pct(s.offset), 'stop-opacity': s.opacity } });
      });
    },
    { scope: root, dependencies: [enabled], revertOnUpdate: true },
  );

  // ----------------------------------------
  // Dial change — stops/rx/ry only, never opacity (decorateArc, Task 11, is the halo's only
  // opacity writer). Skips its own first run (that's the mount effect's job, above) so a volume
  // or envelope edit never plays a spurious tween from zero on the very first render.
  // ----------------------------------------
  const mountedRef = useRef(false);
  useGSAP(
    () => {
      if (!enabled || !root.current) {
        mountedRef.current = false;
        return;
      }
      if (!mountedRef.current) {
        mountedRef.current = true;
        return;
      }
      const ellipse = queryHaloEllipse(root.current);
      if (!ellipse) return;
      const duration = reducedMotion ? 0 : HALO_TWEEN;
      const tl = gsap.timeline();
      tl.to(ellipse, { attr: { rx: halo.rx, ry: halo.ry }, duration, ease: 'power2.out' }, 0);
      queryStops(root.current).forEach((stopEl, i) => {
        const s = halo.stops[i];
        if (!s) return;
        tl.to(stopEl, { attr: { offset: pct(s.offset), 'stop-opacity': s.opacity }, duration, ease: 'power2.out' }, 0);
      });
      setTimeline(key, tl);
      return () => killTimeline(key);
    },
    { scope: root, dependencies: [halo, enabled, reducedMotion], revertOnUpdate: true },
  );

  // decorateArc — Task 11.
  const decorateArc: ArcDecorator = () => {};

  return { decorateArc };
}
