// ========================================
// HALO WAVES (experiment, Crawford 2026-10-12)
// ========================================
// An alternative to the gradient halo + ripple ring: on a station exit/enter arc, three triangular
// waves leave the robot's centre. Each is a triangle OUTLINE that grows from nothing until its
// inscribed circle has a radius of WAVE_BREAK_RADIUS, at which point the three edges break apart and
// keep travelling outward, perpendicular to themselves, for WAVE_DRIFT more scene units, shrinking
// toward the middle of each bar until it is gone (they do not fade). The second and third waves follow a beat behind, each fainter.
// Entering the station plays it in reverse. Pure maths only: `useHaloMotion.decorateWaves` feeds
// these to a proxy tween and writes the `d` attributes; nothing here touches GSAP, the DOM or
// AudioEngine. Distances are scene units — the caller divides by the halo group's own scale, since
// the robot is mid-scale (STATION_PORT_SCALE → 1) while the arc plays. A spawn run outlasts the 1 s arc at
// the speed below, so the caller also pins the waves' centre in the scene (`mapPoint`/`unmapPoint`) rather
// than letting them ride the robot as it swims away.

// ========================================
// TYPES
// ========================================
export type WaveKind = 'spawn' | 'despawn';

/** One wave at one instant: the triangle's inscribed radius, the half-length of each edge (shrinking to 0
 *  over the drift), and the wave's stroke opacity (0..1, before the battery dim). */
export interface WaveState {
  r: number;
  halfLength: number;
  alpha: number;
}

// ========================================
// CONSTANTS
// ========================================
/** Which halo plays on a station arc: the three triangular waves, or the original gradient ellipse and
 *  ripple ring (still rendered either way; with 'waves' the ellipse simply stays at opacity 0). */
export const HALO_STYLE: 'waves' | 'ellipse' = 'waves';

export const WAVE_COUNT = 4;

/** Each wave's peak opacity: every one fainter than the last. */
export const WAVE_AMPLITUDES: readonly number[] = [0.9, 0.5, 0.25, 0.12];

/** The triangle's inscribed radius when its edges break apart (Crawford 2026-10-12: 40; it was the station's
 *  100, then 45). Each edge is then 2 × √3 × 40 ≈ 139 long, and shrinks from there. */
export const WAVE_BREAK_RADIUS = 40;

/** How far past the break the edges keep travelling as they shrink away (Crawford: 50). */
export const WAVE_DRIFT = 50;

/** One wave's whole outward run, scene units. */
export const WAVE_TRAVEL = WAVE_BREAK_RADIUS + WAVE_DRIFT;

/** How fast the edges move outward, scene units per second (Crawford 2026-10-12: 150, then half of that, then
 *  25 % slower again: 56.25). */
export const WAVE_SPEED = 56.25;

/** How far apart the waves are, scene units, whatever the speed. */
export const WAVE_SPACING = 30;

/** A wave starts this many seconds after the one before it, so they stay WAVE_SPACING units apart. */
export const WAVE_STAGGER_SECONDS = WAVE_SPACING / WAVE_SPEED;

/** The whole spawn run, first wave out to last wave gone, seconds: the last starts (WAVE_COUNT − 1) staggers in
 *  and runs WAVE_TRAVEL / WAVE_SPEED. Longer than the 1 s station arc, so the waves run on a timeline of their own. */
export const WAVE_TOTAL_SECONDS = (WAVE_COUNT - 1) * WAVE_STAGGER_SECONDS + WAVE_TRAVEL / WAVE_SPEED;

/** The one extra triangle that travels the other way: inward, from WAVE_TRAVEL out to the centre, starting with
 *  the first wave and crossing it on the way. It is a wave of its own index (WAVE_COUNT, after the outward
 *  ones), drawn in the gem's light colour — the one colour a robot has besides its identity/company one
 *  (Crawford 2026-10-12: "the secondary color"). */
export const WAVE_COUNTER_INDEX = WAVE_COUNT;
export const WAVE_COUNTER_AMPLITUDE = 0.7;

/** Every path a robot draws: the outward waves, then the counter wave. */
export const WAVE_PATH_COUNT = WAVE_COUNT + 1;

/** The first stretch of a wave fades in over this many scene units, so a point never pops. */
export const WAVE_FADE_IN = 12;

/** Stroke width, scene units. */
export const WAVE_LINE_WIDTH = 2.5;

/** The trail behind every line, scene units: one gradient on the side the line has come from, so a wave reads as a bright
 *  line with a fading tail (Crawford 2026-10-12: after trying kites and notches on both sides, "too much"; the final
 *  numbers are 12 deep at the middle, 1 at the ends, a kite). It is
 *  `ends` deep at the ends of a bar and `middle` deep at its middle, running straight between the two, and fades from
 *  the line's own strength to nothing. Nothing is drawn ahead of the line. */
export interface TrailProfile {
  ends: number;
  middle: number;
}
export const WAVE_TRAIL: TrailProfile = { ends: 1, middle: 12 };

/** Height of an equilateral triangle's half-side over its inscribed radius: side = 2 × √3 × r. */
const SQRT3 = Math.sqrt(3);

/** The three edge normals of a point-up triangle in SVG space (y down): the flat bottom edge faces down,
 *  the other two face up-left and up-right. */
const NORMAL_ANGLES = [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6] as const;

// ========================================
// STATE
// ========================================
/** Wave `index` (0 = the first and strongest; WAVE_COUNTER_INDEX = the counter wave, which moves inward) at run
 *  progress `u` (0..1 of WAVE_TOTAL_SECONDS; the caller may play the run faster or slower, e.g. a despawn
 *  squeezed into the arc). */
export function waveState(kind: WaveKind, u: number, index: number): WaveState {
  const seconds = (kind === 'spawn' ? u : 1 - u) * WAVE_TOTAL_SECONDS;
  const counter = index === WAVE_COUNTER_INDEX;
  const travelled = Math.min(WAVE_TRAVEL, Math.max(0, (seconds - (counter ? 0 : index * WAVE_STAGGER_SECONDS)) * WAVE_SPEED));
  // The counter wave is the same run walked from the far end in: the same edge-length rule, read at the
  // mirrored distance, so it appears as bars at the far end, closes up into a triangle at the break and shrinks
  // to the centre.
  const r = counter ? WAVE_TRAVEL - travelled : travelled;
  // Growing, each edge is as long as the triangle needs; past the break it shrinks toward its own middle,
  // reaching 0 as the wave ends — the wave does not fade, it is used up.
  const halfLength = SQRT3 * (r <= WAVE_BREAK_RADIUS ? r : WAVE_BREAK_RADIUS * (1 - (r - WAVE_BREAK_RADIUS) / WAVE_DRIFT));
  const fadeIn = Math.min(1, r / WAVE_FADE_IN);
  // A wave not yet launched, or already gone, draws nothing.
  const alpha = r <= 0 || r >= WAVE_TRAVEL ? 0 : (counter ? WAVE_COUNTER_AMPLITUDE : (WAVE_AMPLITUDES[index] ?? 0)) * fadeIn;
  return { r, halfLength, alpha };
}

// ========================================
// PATH
// ========================================
const f = (n: number) => Number(n.toFixed(2));

/** The part of an SVG matrix the waves need (what `getCTM()` returns). */
export interface Matrix2D {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

/** A point in an element's own units → the viewport's units. */
export function mapPoint(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

/** A point in the viewport's units → an element's own units (the inverse of `mapPoint`). */
export function unmapPoint(m: Matrix2D, x: number, y: number): { x: number; y: number } {
  const det = m.a * m.d - m.b * m.c || 1;
  const dx = x - m.e;
  const dy = y - m.f;
  return { x: (m.d * dx - m.c * dy) / det, y: (-m.b * dx + m.a * dy) / det };
}

/** Which half of a bar, either side of its middle, a piece of the trail is on. */
export type TrailSide = 'right' | 'left';
export const WAVE_TRAIL_SIDES: readonly TrailSide[] = ['right', 'left'];

/** One half of one edge's trail: a shape in the edge's own frame (x along the edge from its middle, y running back from
 *  the line) and the matrix that stands it on the edge. */
export interface WaveTrail {
  d: string;
  transform: string;
  side: TrailSide;
}

/** The gradient of one half of the trail, in objectBoundingBox units (so it needs no knowledge of the bar's length).
 *  The half is bounded by the line, the bar's end and one slanted edge running from the end's depth to the middle's;
 *  the gradient is full strength at the point of the line farthest from that slanted edge — the middle of the line,
 *  where the tail is deepest — and fades along the direction square to the edge, to nothing on it. `x1,y1` is that
 *  point, `x2,y2` the nearest point of the slanted edge; the left half is the right one mirrored. (Were the profile
 *  flipped, deepest at the ends, the start would be the bar's end instead; the arithmetic is the same.) */
export function trailGradient(side: TrailSide): { x1: number; y1: number; x2: number; y2: number } {
  const { ends, middle } = WAVE_TRAIL;
  const slope = 1 - Math.min(ends, middle) / Math.max(ends, middle); // how much the slanted edge falls, in box units, per unit of x
  const x = slope / (1 + slope * slope);
  const y = 1 / (1 + slope * slope);
  const fromMiddle = middle > ends;
  return (side === 'right') === fromMiddle ? { x1: 0, y1: 0, x2: f(x), y2: f(y) } : { x1: 1, y1: 0, x2: f(1 - x), y2: f(y) };
}

/** The trails of one wave: two halves per edge, six in all (right then left, edge by edge), in the halo group's own
 *  units (`scale` as for `wavePath`), behind the line: on the inside of an outward wave's edges, the outside of an
 *  inward one's. Empty while the wave is not drawn. */
export function waveTrails(state: WaveState, movingOutward: boolean, cx: number, cy: number, scale: number): WaveTrail[] {
  if (state.alpha <= 0 || state.r <= 0) return [];
  const r = state.r / scale;
  const h = state.halfLength / scale;
  const ends = WAVE_TRAIL.ends / scale;
  const middle = WAVE_TRAIL.middle / scale;
  const piece = (side: TrailSide) => {
    const x = side === 'right' ? h : -h;
    return `M0 0L${f(x)} 0L${f(x)} ${f(ends)}L0 ${f(middle)}Z`;
  };
  return NORMAL_ANGLES.flatMap((angle) => {
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const behind = movingOutward ? -1 : 1;
    // x axis: along the edge (the way wavePath draws it); y axis: back from the line.
    const transform = `matrix(${f(ny)} ${f(-nx)} ${f(behind * nx)} ${f(behind * ny)} ${f(cx + nx * r)} ${f(cy + ny * r)})`;
    return WAVE_TRAIL_SIDES.map((side) => ({ d: piece(side), transform, side }));
  });
}

/** The `d` attribute of one wave centred on (cx, cy), in the halo group's own units: `scale` is that
 *  group's scale to the scene (distances in `state` are scene units, so they divide by it). Until the edges
 *  reach the station's size they are one closed triangle, so the corners join; after, three separate
 *  bars of fixed length. Empty while the wave is not drawn. */
export function wavePath(state: WaveState, cx: number, cy: number, scale: number): string {
  if (state.alpha <= 0 || state.r <= 0) return '';
  const r = state.r / scale;
  const h = state.halfLength / scale;
  const segments = NORMAL_ANGLES.map((angle) => {
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    const mx = cx + nx * r;
    const my = cy + ny * r;
    // The edge's direction is the normal turned a quarter.
    return { x1: mx - ny * h, y1: my + nx * h, x2: mx + ny * h, y2: my - nx * h };
  });
  if (state.r < WAVE_BREAK_RADIUS) {
    // Joined: the three vertices, bottom-left and bottom-right (edge 0's ends) and the apex (edge 2's end).
    const [bottom, , right] = segments;
    return `M${f(bottom.x1)} ${f(bottom.y1)}L${f(bottom.x2)} ${f(bottom.y2)}L${f(right.x2)} ${f(right.y2)}Z`;
  }
  return segments.map((s) => `M${f(s.x1)} ${f(s.y1)}L${f(s.x2)} ${f(s.y2)}`).join('');
}
