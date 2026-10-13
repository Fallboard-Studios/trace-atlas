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
import { HALO_STYLE, WAVE_COUNTER_INDEX, WAVE_LINE_WIDTH, WAVE_TOTAL_SECONDS, mapPoint, unmapPoint, waveState, wavePath, waveTrails, WAVE_TRAIL_SIDES, type Matrix2D } from './haloWaves';

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

/** This group's transform to scene units, read off its current chain (the arc scales the robot from
 *  STATION_PORT_SCALE to 1 while the waves play, on top of the gem's and the row's own scale, and it swims
 *  away after) — so the waves can be sized, and pinned, in scene units. null where the browser cannot say
 *  (jsdom has no getCTM). */
function sceneMatrixOf(el: SVGGraphicsElement): Matrix2D | null {
  const ctm = typeof el.getCTM === 'function' ? el.getCTM() : null;
  return ctm && Math.hypot(ctm.a, ctm.b) > 0.001 ? ctm : null;
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
  const wavesKey = `halo-waves-${context}-${robotId}`;

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
  // Keyed on the dial's values: RobotBody hands over a brand-new object every render, and a tween per
  // render (0.5 s of attribute writes each) kept every halo writing on every frame while nothing changed.
  const stopsKey = halo.stops.map((s) => `${s.offset}:${s.opacity}`).join('|');
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
    { scope: root, dependencies: [halo.rx, halo.ry, stopsKey, enabled, reducedMotion], revertOnUpdate: true },
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
  // The waves' own timeline (see decorateArc) is killed with the robot's body.
  useEffect(() => () => killTimeline(wavesKey), [wavesKey]);

  const decorateArc = useCallback<ArcDecorator>((kind, duration, arcTl) => {
    if (reducedMotion || !root.current) return;
    const group = root.current;
    const wavePaths = HALO_STYLE === 'waves' ? [...group.querySelectorAll<SVGPathElement>('.gem__wave')] : [];
    const waveCentre = queryHaloEllipse(group);
    // Waves when the style says so and their paths are drawn; otherwise the ripple ring below.
    if (wavePaths.length > 0 && waveCentre) {
      const paths = wavePaths;
      const cx = Number(waveCentre.getAttribute('cx'));
      const cy = Number(waveCentre.getAttribute('cy'));
      const waveProxy = { u: 0 };
      // The trails (RobotGem's gradients, named on the waves' group): six pieces per wave, two halves of a fading tail
      // behind each line, made here for the length of a run and removed at its end, so a robot at rest carries none. Without the gradients (a render
      // that lacks them) the waves are bare lines.
      const waveGroup = group.querySelector<SVGGElement>('.gem__waves');
      const trailIds = [waveGroup?.getAttribute('data-trail-id'), waveGroup?.getAttribute('data-trail-counter-id')];
      const trailEls: SVGPathElement[][] = [];
      // Strips left by a run that was cut short (its timeline replaced) would stay as they were drawn.
      waveGroup?.querySelectorAll('.gem__wave-trail').forEach((strip) => strip.remove());
      if (waveGroup && trailIds[0] && trailIds[1]) {
        paths.forEach((_, i) => {
          const fillId = i === WAVE_COUNTER_INDEX ? trailIds[1] : trailIds[0];
          // The order waveTrails returns them in: WAVE_TRAIL_SIDES, edge by edge.
          const strips = Array.from({ length: 3 * WAVE_TRAIL_SIDES.length }, (_, j) => {
            const side = WAVE_TRAIL_SIDES[j % WAVE_TRAIL_SIDES.length];
            const strip = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            strip.setAttribute('class', 'gem__wave-trail');
            strip.setAttribute('fill', `url(#${fillId}-${side})`);
            strip.setAttribute('stroke', 'none');
            strip.setAttribute('d', '');
            strip.setAttribute('opacity', '0');
            // Behind the lines.
            waveGroup.insertBefore(strip, waveGroup.firstChild);
            return strip;
          });
          trailEls.push(strips);
        });
      }
      // Where the waves are centred in the scene: taken on the first frame, then held, so a spawn run — which
      // outlasts the arc — stays at the station when the robot swims off, instead of riding along with it.
      let anchor: { x: number; y: number } | null = null;
      // A timeline of its own, not a child of the arc's: a spawn run (WAVE_TOTAL_SECONDS) is longer than the
      // 1 s arc, and a longer child would hold back the arc's onComplete — the robot's next step. A despawn
      // run is squeezed into the arc, since the robot (and the halo inside it) is hidden when the arc ends.
      const wavesTl = gsap.timeline();
      wavesTl.to(
        waveProxy,
        {
          u: 1,
          duration: kind === 'spawn' ? WAVE_TOTAL_SECONDS : duration,
          ease: 'none',
          onUpdate: () => {
            const matrix = sceneMatrixOf(group);
            if (matrix && !anchor) anchor = mapPoint(matrix, cx, cy);
            const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
            const centre = matrix && anchor ? unmapPoint(matrix, anchor.x, anchor.y) : { x: cx, y: cy };
            paths.forEach((path, i) => {
              const state = waveState(kind, waveProxy.u, i);
              // A line's trail is behind it: on the inside of a wave moving out, the outside of one moving in
              // (the counter wave, or any wave while a despawn plays the run backwards).
              const movingOutward = (kind === 'spawn') !== (i === WAVE_COUNTER_INDEX);
              const trails = waveTrails(state, movingOutward, centre.x, centre.y, scale);
              (trailEls[i] ?? []).forEach((strip, j) => {
                const trail = trails[j];
                gsap.set(strip, {
                  attr: { d: trail?.d ?? '', transform: trail?.transform ?? '' },
                  opacity: trail ? state.alpha * dimOpacityRef.current : 0,
                });
              });
              gsap.set(path, {
                attr: { d: wavePath(state, centre.x, centre.y, scale), 'stroke-width': WAVE_LINE_WIDTH / scale },
                opacity: state.alpha * dimOpacityRef.current,
              });
            });
          },
          // Whatever the last frame left: nothing drawn.
          onComplete: () => {
            paths.forEach((path) => gsap.set(path, { attr: { d: '' }, opacity: 0 }));
            // The trail strips go with the run.
            trailEls.flat().forEach((strip) => strip.remove());
          },
        },
        0,
      );
      setTimeline(wavesKey, wavesTl);
      return;
    }
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
  }, [reducedMotion, root, wavesKey]);

  return { decorateArc };
}
