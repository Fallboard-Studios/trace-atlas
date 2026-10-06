// ========================================
// useOrbiterMotion (docs/specs/ORBITING_POLYGONS.md §1.4, Phase 40 amendment)
// ========================================
// GSAP-owned motion for a robot's orbiters: mount state and the size tween (Task 8/11, unchanged);
// count-change attach/detach flights and the one-arc-at-a-time queue (Task 10, retargeted). Phase
// 41 (Crawford): orbiters no longer drift or orbit — on spawn (initial mount, or a count increase)
// they fly a short straight hop into their dock at Top's corner and stay rigid with the body from
// then on; a count decrease plays the same hop in reverse, then hides. A later session's job
// animations will detach them again to do "work" — this hook stays ignorant of that; it never
// reads Zustand or calls AudioEngine.
//
// 2026-10-06 (Crawford): this hop is density-driven (every call today traces back to
// `rhythmicDensity` via `orbiterDials().count`), and the halo's ripple is reserved for the future
// job-detach animation instead — so this file no longer decorates its arcs at all. `useHaloMotion`
// and `ArcDecorator` are untouched; when job animations land they'll call `decorateArc` from
// whatever new call site drives them, not from here.

// ========================================
// IMPORTS
// ========================================
import { useEffect, useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import type { RobotGem as RobotGemGeometry } from './polygon';
import { ATTACH_DROP, ATTACH_START_SCALE, ATTACH_DURATION, type OrbiterPlan } from './orbiterMotion';
import type { OrbiterDials } from './orbiterDials';
import type { ArcDecorator } from './useHaloMotion';

export type { ArcDecorator };

// ========================================
// TYPES
// ========================================
export interface UseOrbiterMotionOptions {
  /** `g.gem` — the GSAP scope this hook queries `.gem__orbiter` beneath. */
  root: RefObject<SVGGElement | null>;
  robotId: string;
  context: 'world' | 'avatar';
  gem: RobotGemGeometry;
  plan: OrbiterPlan;
  dials: OrbiterDials;
  /** Cards (`motion: false`) pass `false` — the hook returns before creating anything. */
  enabled: boolean;
}

// ========================================
// CONSTANTS
// ========================================
const ORBITER_CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/** Reduced-motion count-change fade duration (attach/detach, in place of the hop). */
const ORBITER_FADE = 0.3;
/** Size-dial tween duration — 0 under reduced motion (a snap, not a glide). */
const ORBITER_SIZE_TWEEN = 0.5;

// ========================================
// HELPERS
// ========================================
function queryCopy(root: SVGGElement, corner: number): SVGGElement | null {
  return root.querySelector<SVGGElement>(`.gem__orbiter--${ORBITER_CORNERS[corner]}`);
}

function queryLocal(copy: SVGGElement): SVGGElement | null {
  return copy.querySelector<SVGGElement>('.gem__orbiter-local');
}

// ========================================
// HOOK
// ========================================
export function useOrbiterMotion({ root, robotId, context, gem, plan, dials, enabled }: UseOrbiterMotionOptions): void {
  const reducedMotion = prefersReducedMotion();
  const masterKey = `orbiters-${context}-${robotId}`;

  // Read at draw time, not mount time — a size edit affects only the next attach/detach flight
  // this hook plays, never one already in flight (same discipline the orbit scheduler used to
  // need for gap/duration; size is now the only live dial left).
  const dialsRef = useRef(dials);
  useEffect(() => {
    dialsRef.current = dials;
  }, [dials]);

  // The explicit shown set and target count (spec §1.4's queue) — mutated by reconcile(), read
  // live by the next effect run's closures, independent of the mount effect's own re-run conditions.
  const shownRef = useRef<Set<number>>(new Set());
  const targetCountRef = useRef(dials.count);
  const reconcileRef = useRef<() => void>(() => {});
  useEffect(() => {
    targetCountRef.current = dials.count;
    reconcileRef.current();
  }, [dials.count]);

  // Size tween — every local group (shown and hidden, so a later spawn is already the right
  // size), keyed so a second change re-targets rather than stacking a second tween.
  useGSAP(
    () => {
      if (!enabled || !root.current) return;
      const locals = [...root.current.querySelectorAll<SVGGElement>('.gem__orbiter-local')];
      if (!locals.length) return;
      const key = `orbiter-size-${context}-${robotId}`;
      const tween = gsap.to(locals, { scale: dials.size, duration: reducedMotion ? 0 : ORBITER_SIZE_TWEEN, ease: 'power2.out' });
      setTimeline(key, tween as unknown as ReturnType<typeof gsap.timeline>);
      return () => killTimeline(key);
    },
    { scope: root, dependencies: [dials.size, enabled, reducedMotion], revertOnUpdate: true },
  );

  useGSAP(
    () => {
      if (!enabled || !root.current) return;
      const rootEl = root.current;

      shownRef.current = new Set(plan.cornerOrder.slice(0, dials.count));
      targetCountRef.current = dials.count;
      const arcInFlightRef = { current: false };
      const arcKillers = new Map<number, () => void>();
      // Every corner currently mid-flight, from *either* source — the initial-mount batch (which
      // isn't gated by arcInFlightRef, since those all run in parallel) or a queued count-change
      // arc. reconcile() must never retarget a corner that's already animating, or two tweens would
      // fight over the same local group's x/y/scale/opacity (code review, 2026-10-05).
      const busyCorners = new Set<number>();

      for (let corner = 0; corner < 4; corner++) {
        const copy = queryCopy(rootEl, corner);
        if (!copy) continue;
        gsap.set(copy, { transformOrigin: '50% 50%', display: 'none' });
        const local = queryLocal(copy);
        if (!local) continue;
        gsap.set(local, { scale: dials.size, x: 0, y: 0, transformOrigin: '50% 50%' });
      }

      // ----------------------------------------
      // Attach / detach (Task 8+9+10, Phase 40 amendment) — a short hop straight down from the
      // dock, scaling and fading in, then rigid; `gatesQueue` is false for the initial-mount
      // flourish (every initially-shown corner attaches at once, not one-at-a-time) and true for
      // a count-increase spawn (goes through reconcile's one-arc-at-a-time queue).
      // ----------------------------------------
      const flyIn = (corner: number, gatesQueue: boolean) => {
        const copy = queryCopy(rootEl, corner);
        const local = copy && queryLocal(copy);
        if (!copy || !local) return;
        gsap.set(copy, { display: '' });
        busyCorners.add(corner);

        if (reducedMotion) {
          gsap.set(local, { x: 0, y: 0, scale: dialsRef.current.size, opacity: 0 });
          const tween = gsap.to(local, {
            opacity: 1,
            duration: ORBITER_FADE,
            onComplete: () => {
              arcKillers.delete(corner);
              busyCorners.delete(corner);
              if (gatesQueue) arcInFlightRef.current = false;
              reconcile();
            },
          });
          arcKillers.set(corner, () => tween.kill());
          return;
        }

        if (gatesQueue) arcInFlightRef.current = true;
        gsap.set(local, { x: 0, y: ATTACH_DROP, scale: dialsRef.current.size * ATTACH_START_SCALE, opacity: 0 });
        const tl = gsap.timeline({ paused: true });
        tl.to(local, {
          y: 0,
          scale: dialsRef.current.size,
          opacity: 1,
          duration: ATTACH_DURATION,
          ease: 'back.out(1.7)',
          onComplete: () => {
            arcKillers.delete(corner);
            busyCorners.delete(corner);
            if (gatesQueue) arcInFlightRef.current = false;
            reconcile();
          },
        });
        arcKillers.set(corner, () => tl.kill());
        tl.play();
      };

      const settleDetach = (corner: number) => {
        arcKillers.delete(corner);
        busyCorners.delete(corner);
        const copy = queryCopy(rootEl, corner);
        if (copy) gsap.set(copy, { display: 'none' });
        shownRef.current.delete(corner);
        arcInFlightRef.current = false;
        reconcile();
      };

      const flyOut = (corner: number) => {
        const copy = queryCopy(rootEl, corner);
        const local = copy && queryLocal(copy);
        if (!copy || !local) return;
        arcInFlightRef.current = true;
        busyCorners.add(corner);

        if (reducedMotion) {
          const tween = gsap.to(local, { opacity: 0, duration: ORBITER_FADE, onComplete: () => settleDetach(corner) });
          arcKillers.set(corner, () => tween.kill());
          return;
        }
        const tl = gsap.timeline({ paused: true });
        tl.to(local, {
          y: ATTACH_DROP,
          scale: dialsRef.current.size * ATTACH_START_SCALE,
          opacity: 0,
          duration: ATTACH_DURATION,
          ease: 'power2.in',
          onComplete: () => settleDetach(corner),
        });
        arcKillers.set(corner, () => tl.kill());
        tl.play();
      };

      let reconcile: () => void = () => {};
      reconcile = () => {
        if (arcInFlightRef.current) return;
        const shown = shownRef.current;
        const target = targetCountRef.current;
        if (shown.size === target) return;
        if (shown.size < target) {
          const spawnCorner = plan.cornerOrder.find((c) => !shown.has(c));
          if (spawnCorner === undefined) return;
          shown.add(spawnCorner);
          flyIn(spawnCorner, true);
        } else {
          // Skips a corner still mid-flight (e.g. its own initial-mount attach hasn't settled
          // yet) — flyOut()ing it now would fight that tween for the same x/y/scale/opacity.
          const shownInOrder = plan.cornerOrder.filter((c) => shown.has(c) && !busyCorners.has(c));
          const despawnCorner = shownInOrder[shownInOrder.length - 1];
          if (despawnCorner === undefined) return; // every shown corner is busy — flyIn's own onComplete retries
          flyOut(despawnCorner);
        }
      };
      reconcileRef.current = reconcile;

      // ----------------------------------------
      // Initial mount — every initially-shown corner attaches at once (a robot powering up, not a
      // queued sequence; the queue above is only for a later count change).
      // ----------------------------------------
      shownRef.current.forEach((corner) => flyIn(corner, false));

      // A lightweight registration token, not a real GSAP timeline — nothing is ever added to it
      // (no drift to parent, unlike the pre-docking design), so a genuine `gsap.timeline()` here
      // would just be a standing, never-used GSAP object per robot per context (the exact category
      // of cost the Task 13 perf investigation flagged). `timelineMap` only ever calls `.kill()` on
      // what's stored, so a plain stub satisfies the contract (same pattern the old per-pair
      // scheduler keys used, code review 2026-10-05).
      setTimeline(masterKey, { kill: () => {} } as unknown as ReturnType<typeof gsap.timeline>);
      return () => {
        killTimeline(masterKey);
        arcKillers.forEach((kill) => kill());
        reconcileRef.current = () => {};
      };
    },
    { scope: root, dependencies: [gem, enabled, reducedMotion], revertOnUpdate: true },
  );
}
