// ========================================
// HALO WAVES MOTION (docs/specs/ROBOT_HALO_AND_LIT_LINES.md)
// ========================================
// The GSAP side of haloWaves.ts: one timeline per station arc that walks the waves' maths each frame and
// writes the result straight to the `path.gem__wave` lines RobotGem draws (empty and invisible at rest) and
// to the trail strips it makes for the length of a run. The waves grow from the canvas centre RobotGem names
// on the group (`data-cx`, `data-cy`). `useHaloMotion.decorateArc` calls `playHaloWaves`
// and registers the timeline it returns. Visual only: nothing here touches AudioEngine or state.
//
// Each frame writes plain attributes, and only the ones that changed: a run touches up to 35 elements (five
// lines, thirty trail strips) and most are idle for most of it, so `gsap.set` per element per frame was
// the dominant cost. The forced reads are the matrices the pinned centre and the scene-unit sizes need while
// the robot scales and swims, once per frame per running robot: in the world (a robot is a mover inside an
// `.ocean-scene`) the scene sheet's and the gem group's `getScreenCTM()`, the pair read each frame because the
// deck camera's scroll moves the frame; for an avatar or card, the group's `getCTM()`. The sheet itself is a
// static stage child, so it is looked up once, when the arc's timeline is made, not on every frame.

// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import {
  WAVE_COUNTER_INDEX,
  WAVE_LINE_WIDTH,
  WAVE_TOTAL_SECONDS,
  WAVE_TRAIL_SIDES,
  mapPoint,
  matrixWithin,
  unmapPoint,
  waveState,
  wavePath,
  waveTrails,
  type Matrix2D,
  type WaveKind,
} from './haloWaves';

// ========================================
// TYPES
// ========================================
export interface PlayHaloWavesOptions {
  /** `g.gem` — the scope the waves' group and lines are found under. */
  group: SVGGElement;
  kind: WaveKind;
  /** The arc's length in seconds: a despawn run is squeezed into it; a spawn run takes WAVE_TOTAL_SECONDS. */
  duration: number;
  /** The battery dim, read each frame (it is never tweened, so an edit mid-run shows at once). */
  dimOpacity: () => number;
}

// ========================================
// HELPERS
// ========================================
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Two halves of a trail per edge, three edges. */
const TRAIL_STRIPS_PER_WAVE = 3 * WAVE_TRAIL_SIDES.length;

/** This group's transform to scene units, read off its current chain (the arc scales the robot from
 *  STATION_PORT_SCALE to 1 while the waves play, on top of the gem's and the row's own scale, and it swims
 *  away after), so the waves can be sized and pinned in scene units. null where the browser cannot say
 *  (jsdom has no getCTM).
 *
 *  In the world a robot is a mover (Phase 53): the gem draws in an svg of its own, inside a wrapper div that
 *  GSAP moves, so `getCTM()` stops at that svg and leaves the wrapper's swim out; pinned that way the waves
 *  would ride the robot. The scene's frame is then a static sheet's screen matrix, and the group's screen
 *  matrix is read against it. An avatar or card has no scene (`sheet` is null) and keeps `getCTM()`. */
function sceneMatrixOf(el: SVGGraphicsElement, sheet: SVGGraphicsElement | null): Matrix2D | null {
  const frame = sheet && typeof sheet.getScreenCTM === 'function' ? sheet.getScreenCTM() : null;
  const screen = frame && typeof el.getScreenCTM === 'function' ? el.getScreenCTM() : null;
  const ctm = frame && screen ? matrixWithin(frame, screen) : typeof el.getCTM === 'function' ? el.getCTM() : null;
  return ctm && Math.hypot(ctm.a, ctm.b) > 0.001 ? ctm : null;
}

/** Writes an attribute only when its value differs, so a line that is idle costs a read, not a style recalc. */
function setAttr(el: Element, name: string, value: string): void {
  if (el.getAttribute(name) !== value) el.setAttribute(name, value);
}

/** The trail strips of every wave: six pieces each, in the order `waveTrails` returns them, inserted behind the
 *  lines. Empty when RobotGem's gradients are not there (the waves are then bare lines). */
function makeTrailStrips(waveGroup: SVGGElement, waveCount: number): SVGPathElement[][] {
  const ids = [waveGroup.getAttribute('data-trail-id'), waveGroup.getAttribute('data-trail-counter-id')];
  if (!ids[0] || !ids[1]) return [];
  return Array.from({ length: waveCount }, (_, i) => {
    const fillId = i === WAVE_COUNTER_INDEX ? ids[1] : ids[0];
    return Array.from({ length: TRAIL_STRIPS_PER_WAVE }, (_, j) => {
      const strip = document.createElementNS(SVG_NS, 'path');
      strip.setAttribute('class', 'gem__wave-trail');
      strip.setAttribute('fill', `url(#${fillId}-${WAVE_TRAIL_SIDES[j % WAVE_TRAIL_SIDES.length]})`);
      strip.setAttribute('stroke', 'none');
      strip.setAttribute('d', '');
      strip.setAttribute('opacity', '0');
      waveGroup.insertBefore(strip, waveGroup.firstChild);
      return strip;
    });
  });
}

// ========================================
// PLAY
// ========================================
/** Builds the waves' timeline for one station arc, or null where the group carries no waves (nothing to draw).
 *  The caller registers it in `timelineMap`.
 *
 *  A timeline of its own, not a child of the arc's: a spawn run (WAVE_TOTAL_SECONDS) is longer than the 1 s arc,
 *  and a longer child would hold back the arc's onComplete, the robot's next step. A despawn run is squeezed
 *  into the arc, since the robot (and the waves inside it) is hidden when the arc ends. */
export function playHaloWaves({ group, kind, duration, dimOpacity }: PlayHaloWavesOptions): ReturnType<typeof gsap.timeline> | null {
  const waveGroup = group.querySelector<SVGGElement>('.gem__waves');
  const paths = waveGroup ? [...waveGroup.querySelectorAll<SVGPathElement>('.gem__wave')] : [];
  if (!waveGroup || paths.length === 0) return null;
  const cx = Number(waveGroup.getAttribute('data-cx'));
  const cy = Number(waveGroup.getAttribute('data-cy'));
  // The scene's frame of reference: a static sheet of the robot's own `.ocean-scene`, found once (null for an avatar or card).
  const sheet = group.closest('.ocean-scene')?.querySelector<SVGGraphicsElement>('svg.ocean-scene__sheet') ?? null;

  // Strips left by a run that was cut short (its timeline replaced) would stay as they were drawn.
  waveGroup.querySelectorAll('.gem__wave-trail').forEach((strip) => strip.remove());
  const strips = makeTrailStrips(waveGroup, paths.length);

  // Where the waves are centred in the scene: taken on the first frame, then held, so a spawn run, which
  // outlasts the arc, stays at the station when the robot swims off instead of riding along with it.
  let anchor: { x: number; y: number } | null = null;
  const proxy = { u: 0 };

  const tl = gsap.timeline();
  tl.to(
    proxy,
    {
      u: 1,
      duration: kind === 'spawn' ? WAVE_TOTAL_SECONDS : duration,
      ease: 'none',
      onUpdate: () => {
        const matrix = sceneMatrixOf(group, sheet);
        if (matrix && !anchor) anchor = mapPoint(matrix, cx, cy);
        const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
        const at = matrix && anchor ? unmapPoint(matrix, anchor.x, anchor.y) : { x: cx, y: cy };
        const dim = dimOpacity();
        paths.forEach((path, i) => {
          const state = waveState(kind, proxy.u, i);
          const opacity = String(state.alpha * dim);
          // A line's trail is behind it: on the inside of a wave moving out, the outside of one moving in
          // (the counter wave, or any wave while a despawn plays the run backwards).
          const movingOutward = (kind === 'spawn') !== (i === WAVE_COUNTER_INDEX);
          const trails = waveTrails(state, movingOutward, at.x, at.y, scale);
          (strips[i] ?? []).forEach((strip, j) => {
            const trail = trails[j];
            setAttr(strip, 'd', trail?.d ?? '');
            setAttr(strip, 'transform', trail?.transform ?? '');
            setAttr(strip, 'opacity', trail ? opacity : '0');
          });
          setAttr(path, 'd', wavePath(state, at.x, at.y, scale));
          setAttr(path, 'stroke-width', String(WAVE_LINE_WIDTH / scale));
          setAttr(path, 'opacity', opacity);
        });
      },
      // Whatever the last frame left: nothing drawn, and the trail strips go with the run.
      onComplete: () => {
        paths.forEach((path) => {
          setAttr(path, 'd', '');
          setAttr(path, 'opacity', '0');
        });
        strips.flat().forEach((strip) => strip.remove());
      },
    },
    0,
  );
  return tl;
}
