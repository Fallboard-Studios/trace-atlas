// ========================================
// useOrbiterMotion (docs/specs/ORBITING_POLYGONS.md §1.4)
// ========================================
// GSAP-owned motion for a robot's orbiters. This file currently covers mount state, drift and
// reduced motion (Task 8); the pair orbit scheduler (Task 9), count-change arcs (Task 10) and the
// size tween (Task 11) land in later commits. GSAP timelines only ever trigger semantic state —
// this hook never reads Zustand or calls AudioEngine.

// ========================================
// IMPORTS
// ========================================
import type { RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import type { RobotGem as RobotGemGeometry } from './polygon';
import type { OrbiterPlan } from './orbiterMotion';
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

// ========================================
// HELPERS
// ========================================
function queryCopy(root: SVGGElement, corner: number, depth: Depth): SVGGElement | null {
  return root.querySelector<SVGGElement>(`.gem__orbiter--${ORBITER_CORNERS[corner]}[data-depth="${depth}"]`);
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

  useGSAP(
    () => {
      if (!enabled || !root.current) return;
      const rootEl = root.current;

      const shown = new Set(plan.cornerOrder.slice(0, dials.count));
      const tl = gsap.timeline();

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
      }

      setTimeline(masterKey, tl);
      return () => killTimeline(masterKey);
    },
    { scope: root, dependencies: [gem, enabled, reducedMotion], revertOnUpdate: true },
  );
}
