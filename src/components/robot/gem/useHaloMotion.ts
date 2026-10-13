// ========================================
// useHaloMotion (docs/specs/ROBOT_HALO_AND_LIT_LINES.md §1.4)
// ========================================
// GSAP-owned motion for a robot's halo: `decorateArc` plays the triangular waves (haloWavesMotion.ts)
// across a spawn/despawn station arc (Amendment, 2026-10-06: the halo is invisible except during that arc,
// on every robot, in every context — see spec §1). This hook never reads Zustand or calls AudioEngine; the
// battery dim (`dimOpacity`) is computed by `RobotBody` and handed in as a plain prop.

// ========================================
// IMPORTS
// ========================================
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type gsap from 'gsap';

import { setTimeline, killTimeline } from '../../../animation/timelineMap';
import { prefersReducedMotion } from '../../../utils/reducedMotion';
import { playHaloWaves } from './haloWavesMotion';

// ========================================
// TYPES
// ========================================
export type ArcKind = 'spawn' | 'despawn';

/** The arc timeline's own kind and duration, and the timeline itself — the work loop (Phase 43)
 *  reaches it through robotMotionRegistry and calls it once per station exit/entry arc, after the
 *  arc timeline is built and before it plays. The halo's waves run on a timeline of their own and
 *  leave `arcTl` untouched. */
export type ArcDecorator = (kind: ArcKind, duration: number, arcTl: ReturnType<typeof gsap.timeline>) => void;

export interface UseHaloMotionOptions {
  /** `g.gem` — the scope the waves' group is found under. */
  root: RefObject<SVGGElement | null>;
  robotId: string;
  context: 'world' | 'avatar';
  /** Battery dim — read live by `decorateArc` via a ref; never tweened by this hook. */
  dimOpacity: number;
}

export interface UseHaloMotionResult {
  decorateArc: ArcDecorator;
}

// ========================================
// HOOK
// ========================================
export function useHaloMotion({ root, robotId, context, dimOpacity }: UseHaloMotionOptions): UseHaloMotionResult {
  const reducedMotion = prefersReducedMotion();
  const wavesKey = `halo-waves-${context}-${robotId}`;

  // Read live by decorateArc — dimOpacity is never tweened, so a battery edit between arcs needs no
  // gsap.* call at all; only the next arc ever shows it.
  const dimOpacityRef = useRef(dimOpacity);
  useEffect(() => {
    dimOpacityRef.current = dimOpacity;
  }, [dimOpacity]);

  // The robot's body unmounting kills a run still in flight.
  useEffect(() => () => killTimeline(wavesKey), [wavesKey]);

  // Plays the waves on a timeline of their own, registered under `wavesKey`: a new run replaces the old
  // one. Reduced motion: a no-op (the arc's own 0.3s fade plays alone). Memoised (Phase 43): `RobotBody`
  // registers it in robotMotionRegistry, and a fresh function every render would re-register on every
  // audio edit. Everything it reads live is a ref.
  const decorateArc = useCallback<ArcDecorator>(
    (kind, duration) => {
      if (reducedMotion || !root.current) return;
      const waves = playHaloWaves({ group: root.current, kind, duration, dimOpacity: () => dimOpacityRef.current });
      if (waves) setTimeline(wavesKey, waves);
    },
    [reducedMotion, root, wavesKey],
  );

  return { decorateArc };
}
