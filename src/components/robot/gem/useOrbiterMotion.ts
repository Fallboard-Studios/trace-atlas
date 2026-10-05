// ========================================
// useOrbiterMotion (docs/specs/ORBITING_POLYGONS.md §1.4)
// ========================================
// GSAP-owned motion for a robot's orbiters. This file covers mount state, drift and reduced
// motion (Task 8) and the pair orbit scheduler (Task 9); count-change arcs (Task 10) and the size
// tween (Task 11) land in later commits. GSAP timelines only ever trigger semantic state — this
// hook never reads Zustand or calls AudioEngine.

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
import { ORBIT_PAIRS, partnerOf, nextOrbit, ringPose, type OrbiterPlan, type OrbitDraw } from './orbiterMotion';
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

/** Retry delay for a pair whose member is mid-arc (Task 10) when its orbit would otherwise start. */
const ORBIT_RETRY = 0.5;

// ========================================
// HELPERS
// ========================================
function queryCopy(root: SVGGElement, corner: number, depth: Depth): SVGGElement | null {
  return root.querySelector<SVGGElement>(`.gem__orbiter--${ORBITER_CORNERS[corner]}[data-depth="${depth}"]`);
}

function queryLocal(copy: SVGGElement): SVGGElement | null {
  return copy.querySelector<SVGGElement>('.gem__orbiter-local');
}

/** A corner is "busy" while its own orbit (this file) or an arc (Task 10) is driving it — a
 *  plain DOM data attribute on its rest copy, so both mechanisms share one simple, observable
 *  signal without needing to coordinate through a React ref neither owns outright. */
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

// ========================================
// HOOK
// ========================================
export function useOrbiterMotion({ root, robotId, context, gem, plan, dials, enabled }: UseOrbiterMotionOptions): void {
  const reducedMotion = prefersReducedMotion();
  const masterKey = `orbiters-${context}-${robotId}`;

  // Read at draw time, not mount time — a gap/duration/count/size edit affects only the next
  // orbit this scheduler draws, never the one already in flight (spec §1.4).
  const dialsRef = useRef(dials);
  useEffect(() => {
    dialsRef.current = dials;
  }, [dials]);

  useGSAP(
    () => {
      if (!enabled || !root.current) return;
      const rootEl = root.current;

      const shown = new Set(plan.cornerOrder.slice(0, dials.count));
      const tl = gsap.timeline();
      const schedulerKeys: string[] = [];

      for (let corner = 0; corner < 4; corner++) {
        for (const depth of DEPTHS) {
          const copy = queryCopy(rootEl, corner, depth);
          if (!copy) continue;
          const show = depth === 'rest' && shown.has(corner);
          gsap.set(copy, { transformOrigin: '50% 50%', display: show ? '' : 'none' });

          const local = queryLocal(copy);
          if (!local) continue;
          gsap.set(local, { scale: dials.size, x: 0, y: 0, transformOrigin: '50% 50%' });
        }
      }

      if (!reducedMotion) {
        shown.forEach((corner) => {
          const rest = queryCopy(rootEl, corner, 'rest');
          const local = rest && queryLocal(rest);
          if (!local) return;
          const drift = plan.drift[corner];

          gsap.set(local, { x: -drift.ax });
          const xTween = gsap.to(local, {
            x: drift.ax,
            duration: drift.px / 2,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
          xTween.progress(drift.phase);
          tl.add(xTween, 0);

          gsap.set(local, { y: -drift.ay });
          const yTween = gsap.to(local, {
            y: drift.ay,
            duration: drift.py / 2,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
          });
          yTween.progress(drift.phase2);
          tl.add(yTween, 0);
        });

        const rng = orbitDrawRng(plan);

        ORBIT_PAIRS.forEach(([a, b], pairIndex) => {
          const leadShown = shown.has(a);
          const partnerShown = shown.has(b);
          if (!leadShown && !partnerShown) return;
          const lead = leadShown ? a : b;
          const partner = partnerOf(lead);

          const schedulerKey = `orbit-${context}-${robotId}-${pairIndex}`;
          schedulerKeys.push(schedulerKey);
          const activeDepth = new Map<number, Depth>([[lead, 'rest'], [partner, 'rest']]);
          let current: { kill: () => void } = { kill: () => {} };

          const resetToRest = (corner: number) => {
            (['behind', 'front'] as const).forEach((d) => {
              const copy = queryCopy(rootEl, corner, d);
              if (copy) gsap.set(copy, { display: 'none' });
            });
            const rest = queryCopy(rootEl, corner, 'rest');
            if (rest) gsap.set(rest, { display: '', x: 0, y: 0, scale: 1, opacity: 1 });
            activeDepth.set(corner, 'rest');
          };

          const applyPose = (corner: number, dir: 1 | -1, theta: number, open: number) => {
            const pose = ringPose(gem, corner, dir, theta, open);
            if (activeDepth.get(corner) !== pose.depth) {
              const prevCopy = queryCopy(rootEl, corner, activeDepth.get(corner)!);
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
            const stillShowsPartner = shown.has(partner);
            if (isCornerBusy(rootEl, lead) || (stillShowsPartner && isCornerBusy(rootEl, partner))) {
              scheduleWait(ORBIT_RETRY);
              return;
            }

            const draw: OrbitDraw = nextOrbit(rng, dialsRef.current);
            markCornerBusy(rootEl, lead, true);
            if (stillShowsPartner) markCornerBusy(rootEl, partner, true);

            const proxy = { t: 0 };
            current = gsap.to(proxy, {
              t: 1,
              duration: dialsRef.current.orbitDuration,
              ease: 'sine.inOut',
              onUpdate: () => {
                const theta = proxy.t * Math.PI * 2;
                applyPose(lead, draw.dir, theta, draw.open);
                if (stillShowsPartner) applyPose(partner, -draw.dir as 1 | -1, theta, draw.open);
              },
              onComplete: () => {
                resetToRest(lead);
                markCornerBusy(rootEl, lead, false);
                if (stillShowsPartner) {
                  resetToRest(partner);
                  markCornerBusy(rootEl, partner, false);
                }
                scheduleWait(draw.wait);
              },
            });
          };

          scheduleWait(plan.initialWait[pairIndex] * dialsRef.current.orbitGap);
          setTimeline(schedulerKey, { kill: () => current.kill() } as unknown as ReturnType<typeof gsap.timeline>);
        });
      }

      setTimeline(masterKey, tl);
      return () => {
        killTimeline(masterKey);
        schedulerKeys.forEach((key) => killTimeline(key));
      };
    },
    { scope: root, dependencies: [gem, enabled, reducedMotion], revertOnUpdate: true },
  );
}
