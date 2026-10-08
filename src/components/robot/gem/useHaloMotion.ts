// ========================================
// useHaloMotion (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4, Task 8)
// ========================================
// GSAP-owned motion for a robot's halo: mount state and the dial tween (stops/rx/ry, Task 8);
// `decorateArc` (Task 11) is the halo's only writer of opacity anywhere, fading it 0 -> dimOpacity
// -> 0 across a spawn/despawn arc (Amendment, 2026-10-06: the halo is invisible except during that
// arc, on every robot, in every context — see spec §1). This hook never reads Zustand or calls
// AudioEngine; the `halo` dial and `dimOpacity` are computed by `RobotBody` and handed in as plain
// props.

// ========================================
// IMPORTS
// ========================================
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import { HALO_HOLE, HALO_TWEEN, type HaloStop } from './haloDials';
import { rippleCycles, ripplePosition, rippleEnvelope, rippleStops } from './haloRipple';

// ========================================
// TYPES
// ========================================
export type ArcKind = 'spawn' | 'despawn';

/** The arc timeline's own kind and duration, and the timeline itself — the work loop (Phase 43)
 *  reaches it through robotMotionRegistry and calls it once per station exit/entry arc, after the
 *  arc timeline is built and before it plays. */
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

function queryRippleEllipse(root: SVGGElement): SVGEllipseElement | null {
  return root.querySelector<SVGEllipseElement>('.gem__ripple');
}

/** The ripple ellipse's own five stops — found via the gradient its `fill` references (its id is
 *  per-instance, so there's no fixed selector; the halo's six stops live in a different gradient
 *  entirely, so this never collides with `queryStops`). */
function queryRippleStops(root: SVGGElement, rippleEllipse: SVGEllipseElement): SVGStopElement[] {
  const fill = rippleEllipse.getAttribute('fill') ?? '';
  const match = /url\(#(.+)\)/.exec(fill);
  if (!match) return [];
  const gradient = root.querySelector(`#${match[1]}`);
  return gradient ? [...gradient.querySelectorAll<SVGStopElement>('stop')] : [];
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

  // Read live by decorateArc, same reason: an arc can be mid-flight when a volume edit changes the
  // halo's radius (ry) — the ripple's hole offset (HALO_HOLE / ry) must track the latest value, not
  // a snapshot from whenever the arc started.
  const haloRyRef = useRef(halo.ry);
  useEffect(() => {
    haloRyRef.current = halo.ry;
  }, [halo.ry]);

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

  // ----------------------------------------
  // decorateArc (Task 11) — the halo's only writer of opacity, anywhere. A proxy `{ u: 0 -> 1 }`
  // tween on the arc's own timeline, `ease: 'none'` (the ring is linear in time; the arc's own
  // ease is on position, not this). Each frame: the ripple's five stops from `rippleStops`, and
  // both the ripple and halo ellipse opacity set to `dimOpacity x rippleEnvelope(u)` — fading the
  // halo up and back down to nothing across the arc, never an instant set (amendment: there is no
  // visible baseline to pop from). Reduced motion: a no-op (the arc's own 0.3s fade plays alone).
  // Memoised (Phase 43): `RobotBody` registers it in robotMotionRegistry, and a fresh function
  // every render would re-register on every audio edit. Everything it reads live is a ref.
  // ----------------------------------------
  const decorateArc = useCallback<ArcDecorator>((kind, duration, arcTl) => {
    if (reducedMotion || !root.current) return;
    const haloEllipse = queryHaloEllipse(root.current);
    const rippleEllipse = queryRippleEllipse(root.current);
    if (!haloEllipse || !rippleEllipse) return;
    const rippleStopEls = queryRippleStops(root.current, rippleEllipse);
    const cycles = rippleCycles(duration);
    const proxy = { u: 0 };
    arcTl.to(
      proxy,
      {
        u: 1,
        duration,
        ease: 'none',
        onUpdate: () => {
          const holeOffset = HALO_HOLE / haloRyRef.current;
          const position = ripplePosition(kind, proxy.u, cycles, holeOffset);
          const envelope = rippleEnvelope(proxy.u);
          rippleStops(position, holeOffset, envelope).forEach((s, i) => {
            const el = rippleStopEls[i];
            if (!el) return;
            gsap.set(el, { attr: { offset: pct(s.offset), 'stop-opacity': s.opacity } });
          });
          const opacity = dimOpacityRef.current * envelope;
          gsap.set(rippleEllipse, { opacity });
          gsap.set(haloEllipse, { opacity });
        },
      },
      0,
    );
  }, [reducedMotion, root]);

  return { decorateArc };
}
