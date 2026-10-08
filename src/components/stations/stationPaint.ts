// ========================================
// STATION PAINT (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.6, Phase 43 Task 20)
// ========================================
// Turns a station's geometry and its stored robots' colours into the paths ChargingStation.tsx
// draws, so the component computes no colour and no path. Same manufacturer as the robots
// (gemPalette.ts): BACKING, MID_DARK, the station's accent, the lit-Mid style and the light dots.
//
// Shading by overlay (Crawford's call, 2026-10-07): each layer's pieces are flat base fills, and
// its bevel facets are two overlay paths on top — white on the lit-facing facets, black on the
// far ones, quantised to the robots' three tones. The layers can't share paths (robots draw
// between them, spec §1.6), and a robot-style tone set per colour would cost three paths per lit
// slot; this way a lit slot costs one. STATION_SHAPE_BUDGET is this module's measured ceiling.

// ========================================
// IMPORTS
// ========================================
import { linesPath, quadPath } from '../robot/gem/gemPaths';
import { GEM_BACKING, GEM_BACKING_STROKE, GEM_LIGHT_COLOR, GEM_MID_DARK, gemMidLitFace } from '../robot/gem/gemPalette';
import { GEM_FACET_TONES, partFacetShades, quantizeShade } from '../robot/gem/gemShading';
import type { GemPoint } from '../robot/gem/polygon';
import type { StationGeometry, StationPiece } from './stationGem';
import { STATION_CAPACITY } from '@/constants';
import { clamp, hexToHsl, hslToString } from '@/utils/colorUtils';

// ========================================
// CONSTANTS
// ========================================
/** Back to front — the order ChargingStation's fragments interleave with the robots. */
export const STATION_LAYER_KEYS = ['l4', 'l3', 'l2', 'l1'] as const;

/** Overlay strength on the lit-facing / far facets. Roughly the robots' ±20 lightness facet
 *  contrast on MID_DARK and on a mid accent; tune by eye at Checkpoint C. */
const FACET_LIGHT_OPACITY = 0.25;
const FACET_DARK_OPACITY = 0.4;
/** Boundary lines: the robots' 0.8 stroke, as a dark overlay so one path suits any piece colour. */
const LINE_WIDTH = 0.8;
const LINE_OPACITY = 0.3;
/** Backing outline, as the robots' backing. */
const BACKING_STROKE_WIDTH = 0.5;
/** A slot dot: a core of radius 1.5 under a glow out to 3.2, drawn as one circle with a wide
 *  stroke in the same colour (sketch values: core 1 / 0.18, glow 0.22 / 0.05, on / off). */
const DOT_R = 1.5;
const DOT_GLOW_WIDTH = 3.4;
const DOT_ON = { core: 1, glow: 0.22 };
const DOT_OFF = { core: 0.18, glow: 0.05 };
/** The port gem: the accent darkened when empty, brightening and saturating as slots fill. */
const PORT_DL_EMPTY = -30;
const PORT_DL_FULL_GAIN = 34;
const PORT_DS_FULL_GAIN = 10;
/** The static halo's opacity at its gradient peak: 0.12 empty → 0.42 full (sketch). */
export const STATION_HALO_PEAK = 0.42;
const HALO_EMPTY = 0.12;
const HALO_FULL_GAIN = 0.3;

// ========================================
// TYPES
// ========================================
export type StationShapeRole = 'base' | 'slot' | 'port' | 'facetLight' | 'facetDark' | 'lines' | 'dotsOff' | 'dotsOn';

export interface StationShape {
  key: string;
  role: StationShapeRole;
  d: string;
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeOpacity?: number;
  /** The slot a 'slot' shape lights. */
  slot?: number;
}

export interface StationPaint {
  l4: StationShape[];
  l3: StationShape[];
  l2: StationShape[];
  l1: StationShape[];
  /** The halo circle's opacity; its gradient peaks at STATION_HALO_PEAK. */
  haloOpacity: number;
}

// ========================================
// HELPERS
// ========================================
const r2 = (n: number) => Number(n.toFixed(2));

function outlinePath(pts: readonly GemPoint[]): string {
  return `${pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${r2(x)},${r2(y)}`).join('')}Z`;
}

function dotPath([cx, cy]: GemPoint): string {
  return `M${r2(cx - DOT_R)},${r2(cy)}a${DOT_R},${DOT_R} 0 1,0 ${2 * DOT_R},0a${DOT_R},${DOT_R} 0 1,0 ${-2 * DOT_R},0`;
}

const vertexMean = (pts: readonly GemPoint[]): GemPoint => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];

/** The facet quads of one bevelled outline, split by quantised shade into light / dark. */
function facetQuads(pts: readonly GemPoint[], face: readonly GemPoint[]): { light: string; dark: string } {
  let light = '';
  let dark = '';
  partFacetShades(pts).forEach((shade, i) => {
    const q = quantizeShade(shade, GEM_FACET_TONES);
    if (q === 0) return;
    const j = (i + 1) % pts.length;
    const quad = quadPath([pts[i], pts[j], face[j], face[i]]);
    if (q > 0) light += quad;
    else dark += quad;
  });
  return { light, dark };
}

function portFill(accentHex: string, filled: number): string {
  const lit = filled / STATION_CAPACITY;
  const { h, s, l } = hexToHsl(accentHex);
  return hslToString({
    h: Math.round(h),
    s: Math.round(clamp(s + lit * PORT_DS_FULL_GAIN, 0, 100)),
    l: Math.round(clamp(l + PORT_DL_EMPTY + lit * PORT_DL_FULL_GAIN, 0, 100)),
  });
}

/**
 * One broken layer: its unlit pieces as one base path, each lit slot as its own path, the port on
 * L1, then the facet overlays, the boundary lines and the slot dots.
 */
function brokenLayer(
  pieces: readonly StationPiece[],
  baseFill: string,
  litColors: readonly string[],
  port?: { pts: readonly GemPoint[]; face: readonly GemPoint[]; fill: string },
): StationShape[] {
  const isLit = (p: StationPiece) => p.slot >= 0 && p.slot < litColors.length;
  const shapes: StationShape[] = [];

  const unlit = pieces.filter((p) => !isLit(p));
  if (unlit.length) shapes.push({ key: 'base', role: 'base', d: unlit.map((p) => outlinePath(p.pts)).join(''), fill: baseFill });
  for (const p of pieces.filter(isLit).sort((a, b) => a.slot - b.slot)) {
    shapes.push({ key: `slot-${p.slot}`, role: 'slot', d: outlinePath(p.pts), fill: gemMidLitFace(litColors[p.slot]), slot: p.slot });
  }
  if (port) shapes.push({ key: 'port', role: 'port', d: outlinePath(port.pts), fill: port.fill });

  let light = '';
  let dark = '';
  for (const { pts, face } of [...pieces, ...(port ? [port] : [])]) {
    const q = facetQuads(pts, face);
    light += q.light;
    dark += q.dark;
  }
  if (light) shapes.push({ key: 'facet-light', role: 'facetLight', d: light, fill: '#ffffff', fillOpacity: FACET_LIGHT_OPACITY });
  if (dark) shapes.push({ key: 'facet-dark', role: 'facetDark', d: dark, fill: '#000000', fillOpacity: FACET_DARK_OPACITY });

  const lines = linesPath(pieces.flatMap((p) => (p.line ? [p.line] : [])));
  if (lines) {
    shapes.push({ key: 'lines', role: 'lines', d: lines, fill: 'none', stroke: '#000000', strokeWidth: LINE_WIDTH, strokeOpacity: LINE_OPACITY });
  }

  const slots = pieces.filter((p) => p.slot >= 0).sort((a, b) => a.slot - b.slot);
  const dots = (on: boolean) => slots.filter((p) => isLit(p) === on).map((p) => dotPath(vertexMean(p.face))).join('');
  for (const on of [false, true]) {
    const d = dots(on);
    if (!d) continue;
    const level = on ? DOT_ON : DOT_OFF;
    shapes.push({
      key: on ? 'dots-on' : 'dots-off',
      role: on ? 'dotsOn' : 'dotsOff',
      d,
      fill: GEM_LIGHT_COLOR,
      fillOpacity: level.core,
      stroke: GEM_LIGHT_COLOR,
      strokeWidth: DOT_GLOW_WIDTH,
      strokeOpacity: level.glow,
    });
  }
  return shapes;
}

// ========================================
// API
// ========================================
/**
 * @param geometry  stationGeometry at the world's current dials
 * @param accentHex the station's seeded accent (StationRoll.accent)
 * @param litColors identity colours of the robots charging here, in slot order (extra ignored)
 */
export function stationPaint(geometry: StationGeometry, accentHex: string, litColors: readonly string[]): StationPaint {
  const lit = litColors.slice(0, STATION_CAPACITY);
  const [l1, l2, l3, l4] = geometry.layers;
  return {
    l4: [{ key: 'base', role: 'base', d: outlinePath(l4.outer), fill: GEM_BACKING, stroke: GEM_BACKING_STROKE, strokeWidth: BACKING_STROKE_WIDTH }],
    l3: brokenLayer(l3.pieces, GEM_MID_DARK, lit),
    l2: brokenLayer(l2.pieces, GEM_MID_DARK, lit),
    l1: brokenLayer(l1.pieces, accentHex, lit, { pts: geometry.port, face: geometry.portFace, fill: portFill(accentHex, lit.length) }),
    haloOpacity: (HALO_EMPTY + (HALO_FULL_GAIN * lit.length) / STATION_CAPACITY) / STATION_HALO_PEAK,
  };
}

/** Drawn shapes: every path in the four layers plus the halo and ripple circles. */
export function stationShapeCount(paint: StationPaint): number {
  return paint.l4.length + paint.l3.length + paint.l2.length + paint.l1.length + 2;
}
