// ========================================
// useOrbiterMotion (docs/specs/ORBITING_POLYGONS.md §1.4)
// ========================================
// GSAP-owned motion for a robot's orbiters: mount state, drift and reduced motion (Task 8); the
// pair orbit scheduler (Task 9); count-change spawn/despawn arcs and the queue (Task 10); the size
// tween and live dial refs (Task 11). GSAP timelines only ever trigger semantic state — this hook
// never reads Zustand or calls AudioEngine.

// ========================================
// IMPORTS
// ========================================
import { useEffect, useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import alea from 'alea';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import type { RobotGem as RobotGemGeometry } from './polygon';
import {
  ORBIT_PAIRS,
  partnerOf,
  nextOrbit,
  ringPose,
  DESPAWN_ARC,
  SPAWN_ARC,
  type OrbiterPlan,
  type OrbitDraw,
  type ArcSpec,
} from './orbiterMotion';
import type { OrbiterDials } from './orbiterDials';

// ========================================
// TYPES
// ========================================
export interface UseOrbiterMotionOptions {
  /** `g.gem` — the GSAP scope this hook queries `.gem__orbiter[data-depth]` beneath. */
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
const DEPTHS = ['behind', 'rest', 'front'] as const;
type Depth = (typeof DEPTHS)[number];

/** Retry delay for a pair whose member is mid-arc when its orbit would otherwise start. */
const ORBIT_RETRY = 0.5;
/** Reduced-motion count-change fade duration (spawn/despawn). */
const ORBITER_FADE = 0.3;
/** Size-dial tween duration — 0 under reduced motion (a snap, not a glide). */
const ORBITER_SIZE_TWEEN = 0.5;

// ========================================
// HELPERS
// ========================================
function queryCopy(root: SVGGElement, corner: number, depth: Depth): SVGGElement | null {
  return root.querySelector<SVGGElement>(`.gem__orbiter--${ORBITER_CORNERS[corner]}[data-depth="${depth}"]`);
}

function queryLocal(copy: SVGGElement): SVGGElement | null {
  return copy.querySelector<SVGGElement>('.gem__orbiter-local');
}

/** A corner is "busy" while its own orbit or an arc is driving it — a plain DOM data attribute on
 *  its rest copy, so both mechanisms share one simple, observable signal. */
function isCornerBusy(root: SVGGElement, corner: number): boolean {
  return queryCopy(root, corner, 'rest')?.dataset.motionBusy === '1';
}

function markCornerBusy(root: SVGGElement, corner: number, busy: boolean): void {
  const rest = queryCopy(root, corner, 'rest');
  if (!rest) return;
  if (busy) rest.dataset.motionBusy = '1';
  else delete rest.dataset.motionBusy;
}

/** A fresh seeded stream for this robot's ongoing orbit draws, independent of the stream that
 *  built `plan` (that one is already spent). Seeded from the plan's own seeded fields, so it is
 *  still deterministic per `gemSeed` without the hook needing the seed itself. */
function orbitDrawRng(plan: OrbiterPlan): () => number {
  return alea(plan.cornerOrder.join(''), plan.initialWait[0], plan.initialWait[1]);
}

/** Hide every depth copy of a corner except `only` (or all three, when `only` is omitted). */
function hideCopiesExcept(root: SVGGElement, corner: number, only?: Depth): void {
  for (const depth of DEPTHS) {
    if (depth === only) continue;
    const copy = queryCopy(root, corner, depth);
    if (copy) gsap.set(copy, { display: 'none' });
  }
}

// ========================================
// HOOK
// ========================================
export function useOrbiterMotion({ root, robotId, context, gem, plan, dials, enabled }: UseOrbiterMotionOptions): void {
  const reducedMotion = prefersReducedMotion();
  const masterKey = `orbiters-${context}-${robotId}`;

  // Read at draw time, not mount time — a gap/duration/count/size edit affects only the next
  // orbit this scheduler draws or arc it plays, never the one already in flight (spec §1.4).
  const dialsRef = useRef(dials);
  useEffect(() => {
    dialsRef.current = dials;
  }, [dials]);

  // The explicit shown set and target count (spec §1.4's queue) — mutated by reconcile(), read
  // live by the pair schedulers, independent of the mount effect's own re-run conditions.
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
      const pairSchedulerActive: [boolean, boolean] = [false, false];
      const schedulerKeys = new Set<string>();
      const driftKillers = new Map<number, () => void>();
      const arcKillers = new Map<number, () => void>();

      const tl = gsap.timeline();

      for (let corner = 0; corner < 4; corner++) {
        for (const depth of DEPTHS) {
          const copy = queryCopy(rootEl, corner, depth);
          if (!copy) continue;
          const show = depth === 'rest' && shownRef.current.has(corner);
          gsap.set(copy, { transformOrigin: '50% 50%', display: show ? '' : 'none' });

          const local = queryLocal(copy);
          if (!local) continue;
          gsap.set(local, { scale: dials.size, x: 0, y: 0, transformOrigin: '50% 50%' });
        }
      }

      // ----------------------------------------
      // Drift (Task 8)
      // ----------------------------------------
      const startDrift = (corner: number) => {
        const rest = queryCopy(rootEl, corner, 'rest');
        const local = rest && queryLocal(rest);
        if (!local) return;
        const drift = plan.drift[corner];

        gsap.set(local, { x: -drift.ax });
        const xTween = gsap.to(local, { x: drift.ax, duration: drift.px / 2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        xTween.progress(drift.phase);
        tl.add(xTween, 0);

        gsap.set(local, { y: -drift.ay });
        const yTween = gsap.to(local, { y: drift.ay, duration: drift.py / 2, repeat: -1, yoyo: true, ease: 'sine.inOut' });
        yTween.progress(drift.phase2);
        tl.add(yTween, 0);

        driftKillers.set(corner, () => {
          xTween.kill();
          yTween.kill();
        });
      };

      const killDrift = (corner: number) => {
        driftKillers.get(corner)?.();
        driftKillers.delete(corner);
        const rest = queryCopy(rootEl, corner, 'rest');
        const local = rest && queryLocal(rest);
        if (local) gsap.set(local, { x: 0, y: 0 });
      };

      // ----------------------------------------
      // Pair orbit scheduler (Task 9) — lead/partner are resolved fresh on every draw, not fixed
      // at creation, so a scheduler can go solo or idle as the shown set changes (Task 10).
      // ----------------------------------------
      let reconcile: () => void = () => {};

      const createPairScheduler = (pairIndex: number) => {
        const [cornerA, cornerB] = ORBIT_PAIRS[pairIndex];
        pairSchedulerActive[pairIndex] = true;
        const schedulerKey = `orbit-${context}-${robotId}-${pairIndex}`;
        const activeDepth = new Map<number, Depth>();
        let current: { kill: () => void } = { kill: () => {} };

        const resetToRest = (corner: number) => {
          hideCopiesExcept(rootEl, corner, 'rest');
          const rest = queryCopy(rootEl, corner, 'rest');
          if (rest) gsap.set(rest, { display: '', x: 0, y: 0, scale: 1, opacity: 1 });
          activeDepth.set(corner, 'rest');
        };

        const applyPose = (corner: number, dir: 1 | -1, theta: number, open: number) => {
          const pose = ringPose(gem, corner, dir, theta, open);
          if (activeDepth.get(corner) !== pose.depth) {
            const prevDepth = activeDepth.get(corner);
            const prevCopy = prevDepth && queryCopy(rootEl, corner, prevDepth);
            if (prevCopy) gsap.set(prevCopy, { display: 'none' });
            const nextCopy = queryCopy(rootEl, corner, pose.depth);
            if (nextCopy) gsap.set(nextCopy, { display: '' });
            activeDepth.set(corner, pose.depth);
          }
          const active = queryCopy(rootEl, corner, pose.depth);
          if (active) gsap.set(active, { x: pose.x, y: pose.y, scale: pose.scale, opacity: pose.opacity });
        };

        const scheduleWait = (waitSeconds: number) => {
          current = gsap.delayedCall(waitSeconds, attemptDraw);
        };

        const attemptDraw = () => {
          const aShown = shownRef.current.has(cornerA);
          const bShown = shownRef.current.has(cornerB);
          if (!aShown && !bShown) {
            scheduleWait(dialsRef.current.orbitGap); // idle — nothing to orbit right now
            return;
          }
          const lead = aShown ? cornerA : cornerB;
          const partner = partnerOf(lead);
          const partnerShown = aShown && bShown;

          if (isCornerBusy(rootEl, lead) || (partnerShown && isCornerBusy(rootEl, partner))) {
            scheduleWait(ORBIT_RETRY);
            return;
          }

          const draw: OrbitDraw = nextOrbit(orbitRng, dialsRef.current);
          markCornerBusy(rootEl, lead, true);
          if (partnerShown) markCornerBusy(rootEl, partner, true);
          activeDepth.set(lead, 'rest');
          if (partnerShown) activeDepth.set(partner, 'rest');

          const proxy = { t: 0 };
          current = gsap.to(proxy, {
            t: 1,
            duration: dialsRef.current.orbitDuration,
            ease: 'sine.inOut',
            onUpdate: () => {
              const theta = proxy.t * Math.PI * 2;
              applyPose(lead, draw.dir, theta, draw.open);
              if (partnerShown) applyPose(partner, -draw.dir as 1 | -1, theta, draw.open);
            },
            onComplete: () => {
              resetToRest(lead);
              markCornerBusy(rootEl, lead, false);
              if (partnerShown) {
                resetToRest(partner);
                markCornerBusy(rootEl, partner, false);
              }
              scheduleWait(draw.wait);
              reconcile();
            },
          });
        };

        scheduleWait(plan.initialWait[pairIndex] * dialsRef.current.orbitGap);
        schedulerKeys.add(schedulerKey);
        setTimeline(schedulerKey, { kill: () => current.kill() } as unknown as ReturnType<typeof gsap.timeline>);
      };

      const ensurePairScheduler = (corner: number) => {
        const pairIndex = ORBIT_PAIRS.findIndex((pair) => pair.includes(corner));
        if (pairSchedulerActive[pairIndex]) return;
        createPairScheduler(pairIndex);
      };

      // ----------------------------------------
      // Spawn / despawn arcs and the queue (Task 10)
      // ----------------------------------------
      const runRingArc = (corner: number, spec: ArcSpec, onDone: () => void) => {
        const initialPose = ringPose(gem, corner, spec.dir, spec.from, 0);
        hideCopiesExcept(rootEl, corner, initialPose.depth);
        let activeDepth = initialPose.depth;
        const initialCopy = queryCopy(rootEl, corner, activeDepth);
        if (initialCopy) {
          gsap.set(initialCopy, { display: '', x: initialPose.x, y: initialPose.y, scale: initialPose.scale, opacity: initialPose.opacity });
        }

        const proxy = { u: 0 };
        const tween = gsap.to(proxy, {
          u: 1,
          duration: dialsRef.current.orbitDuration / 2,
          ease: 'sine.inOut',
          onUpdate: () => {
            const theta = spec.from + (spec.to - spec.from) * proxy.u;
            const pose = ringPose(gem, corner, spec.dir, theta, 0);
            if (activeDepth !== pose.depth) {
              const prevCopy = queryCopy(rootEl, corner, activeDepth);
              if (prevCopy) gsap.set(prevCopy, { display: 'none' });
              const nextCopy = queryCopy(rootEl, corner, pose.depth);
              if (nextCopy) gsap.set(nextCopy, { display: '' });
              activeDepth = pose.depth;
            }
            const active = queryCopy(rootEl, corner, pose.depth);
            if (active) gsap.set(active, { x: pose.x, y: pose.y, scale: pose.scale, opacity: pose.opacity });
          },
          onComplete: onDone,
        });
        arcKillers.set(corner, () => tween.kill());
      };

      const settleSpawn = (corner: number) => {
        arcKillers.delete(corner);
        markCornerBusy(rootEl, corner, false);
        arcInFlightRef.current = false;
        hideCopiesExcept(rootEl, corner, 'rest');
        const rest = queryCopy(rootEl, corner, 'rest');
        if (rest) gsap.set(rest, { display: '', x: 0, y: 0, scale: dialsRef.current.size, opacity: 1 });
        if (!reducedMotion) startDrift(corner);
        ensurePairScheduler(corner);
        reconcile();
      };

      const settleDespawn = (corner: number) => {
        arcKillers.delete(corner);
        markCornerBusy(rootEl, corner, false);
        arcInFlightRef.current = false;
        shownRef.current.delete(corner);
        hideCopiesExcept(rootEl, corner);
        killDrift(corner);
        reconcile();
      };

      const playSpawnArc = (corner: number) => {
        arcInFlightRef.current = true;
        shownRef.current.add(corner);
        markCornerBusy(rootEl, corner, true);

        if (reducedMotion) {
          const rest = queryCopy(rootEl, corner, 'rest');
          if (rest) {
            gsap.set(rest, { display: '', opacity: 0 });
            const tween = gsap.to(rest, { opacity: 1, duration: ORBITER_FADE });
            arcKillers.set(corner, () => tween.kill());
          }
          settleSpawn(corner);
          return;
        }
        runRingArc(corner, SPAWN_ARC, () => settleSpawn(corner));
      };

      const playDespawnArc = (corner: number) => {
        arcInFlightRef.current = true;
        markCornerBusy(rootEl, corner, true);
        killDrift(corner);

        if (reducedMotion) {
          const rest = queryCopy(rootEl, corner, 'rest');
          if (rest) {
            const tween = gsap.to(rest, { opacity: 0, duration: ORBITER_FADE });
            arcKillers.set(corner, () => tween.kill());
          }
          settleDespawn(corner);
          return;
        }
        runRingArc(corner, DESPAWN_ARC, () => settleDespawn(corner));
      };

      reconcile = () => {
        if (arcInFlightRef.current) return;
        const shown = shownRef.current;
        const target = targetCountRef.current;
        if (shown.size === target) return;
        if (shown.size < target) {
          const spawnCorner = plan.cornerOrder.find((c) => !shown.has(c));
          if (spawnCorner === undefined) return;
          if (isCornerBusy(rootEl, spawnCorner)) return; // mid-orbit — its own completion retries
          playSpawnArc(spawnCorner);
        } else {
          const shownInOrder = plan.cornerOrder.filter((c) => shown.has(c));
          const despawnCorner = shownInOrder[shownInOrder.length - 1];
          if (despawnCorner === undefined) return;
          if (isCornerBusy(rootEl, despawnCorner)) return; // mid-orbit — its own completion retries
          playDespawnArc(despawnCorner);
        }
      };
      reconcileRef.current = reconcile;

      // ----------------------------------------
      // Initial mount state
      // ----------------------------------------
      const orbitRng = orbitDrawRng(plan);
      if (!reducedMotion) {
        shownRef.current.forEach((corner) => startDrift(corner));
        ORBIT_PAIRS.forEach(([a, b], pairIndex) => {
          if (shownRef.current.has(a) || shownRef.current.has(b)) createPairScheduler(pairIndex);
        });
      }

      setTimeline(masterKey, tl);
      return () => {
        killTimeline(masterKey);
        schedulerKeys.forEach((key) => killTimeline(key));
        driftKillers.forEach((kill) => kill());
        arcKillers.forEach((kill) => kill());
        reconcileRef.current = () => {};
      };
    },
    { scope: root, dependencies: [gem, enabled, reducedMotion], revertOnUpdate: true },
  );
}
