import Alea from 'alea';
import type { FacadeGreeble, GreebleRenderer, GreebleRendererContext, GreebleElement } from './greebleTypes';
import type { HSL } from '../../../utils/colorUtils';
import { hslToString, clamp } from '../../../utils/colorUtils';
import colorTheme from '../../../constants/colorTheme.json';

// ========================================
// CONSTANTS
// ========================================

/**
 * Minimum building height (px) required per belt course.
 * Dividing buildingHeight by this threshold gives the course count.
 */
const BELT_COURSE_THRESHOLD = 90;

// ========================================
// TYPES
// ========================================

/**
 * Metadata for calculating a window grid.
 */
export interface WindowGrid {
  cols: number;
  rows: number;
  unitW: number;
  unitH: number;
  gapX: number;
  gapY: number;
  slotX: number;
  slotY: number;
  offsetX: number;
  offsetY: number;
}

// ========================================
// LAYOUT/PAINT SPLIT TYPES
// (docs/specs/archive/FACTORY_LIGHTING_RERENDER.md §1.4 — Task 3)
//
// Of this file's 5 renderers, only the window grid (squareWindows/wideWindows/tallWindows,
// all sharing `renderWindowGrid`) reads a lighting field. Its geometry — which grid slots
// have a window, and where — is split out into `computeWindowGridLayout` (static-input-only,
// safe to memoize once per factory) and `paintWindowGrid` (color/lit-state, cheap, safe every
// render). `render<Greeble>` stays a thin wrapper so every existing caller/test keeps working
// unchanged. `renderPipesValvesFacade`/`renderBeltCourse` are unaffected — already fully
// lighting-independent.
// ========================================

/**
 * One grid slot that survived the existence check — position, size, and the seed/
 * opacity-random component decided at that same existence-check pass. No isLit/final-opacity/
 * fill — those depend on `flickerEpoch`/`nightDepth`/the face's lightness multiplier, decided
 * at paint time.
 */
export interface WindowLayoutItem {
  x: number;
  y: number;
  unitW: number;
  unitH: number;
  /** Face-adjusted seed (already includes the +500 east-face offset when split) — paint
   *  reconstructs the exact per-window `litRng` Alea key from this plus `r`/`c`. */
  seed: number;
  r: number;
  c: number;
  /** The `0.15 + prng() * 0.3` random component — decided at layout time because it's drawn
   *  from the same interleaved LCG stream as the existence check itself, not a fresh draw. */
  opacityBase: number;
}

/**
 * Geometry for the window-grid renderers. `frontCornerX` present → the facade splits into
 * independent west (untranslated) and east (translated) sub-grids, same as before the split;
 * absent → a single ungrouped grid.
 */
export type WindowGridLayout =
  | { split: false; items: WindowLayoutItem[] }
  | { split: true; frontCornerX: number; west: WindowLayoutItem[]; east: WindowLayoutItem[] };

// ========================================
// HELPERS
// ========================================

/**
 * Calculates the number of belt courses for a given building height.
 * Returns 0 for buildings shorter than BELT_COURSE_THRESHOLD.
 * @param bh Building height in pixels.
 * @returns Number of belt courses.
 */
export function deriveBeltCourses(bh: number): number {
  return Math.floor(bh / BELT_COURSE_THRESHOLD);
}

/**
 * Calculates a window grid based on building dimensions and window type.
 * @param bw Building width.
 * @param bh Building height.
 * @param type Window type key.
 * @returns WindowGrid metadata.
 */
export function deriveWindowGrid(
  bw: number,
  bh: number,
  type: "squareWindows" | "wideWindows" | "tallWindows",
  fixedUnitSize?: number
): WindowGrid {
  const unitSize = fixedUnitSize ?? Math.max(4, bw * 0.06);

  let unitW = unitSize;
  let unitH = unitSize;

  if (type === "wideWindows") {
    unitW = unitSize * 2;
    unitH = unitSize * 0.5;
  } else if (type === "tallWindows") {
    unitW = unitSize * 0.5;
    unitH = unitSize * 2;
  }

  const gapX = type === "wideWindows" ? 1 : unitW * 0.5;
  const gapY = unitH * 0.5;
  const slotX = unitW + gapX;
  const slotY = unitH + gapY;

  const cols = Math.floor((bw + gapX) / slotX);
  const rows = Math.floor((bh + gapY) / slotY);

  const offsetX = (bw - (cols * slotX - gapX)) / 2;
  const offsetY = (bh - (rows * slotY - gapY)) / 2;

  return { cols, rows, unitW, unitH, gapX, gapY, slotX, slotY, offsetX, offsetY };
}

/**
 * Geometry for one ungrouped window grid (no east/west split) — which slots have a window,
 * and where. No color/lit-state. Reads only static fields (`buildingWidth`/`buildingHeight`/
 * `zoneY`/`zoneHeight`/`seed`/`fixedUnitSize`), so the same input always produces the same
 * set of items regardless of the lighting tick.
 */
function computeWindowGridItems(
  ctx: GreebleRendererContext,
  type: 'squareWindows' | 'wideWindows' | 'tallWindows',
  threshold: number,
): WindowLayoutItem[] {
  const { buildingWidth: bw, buildingHeight: bh, seed } = ctx;
  const zoneY = ctx.zoneY ?? 0;
  const effectiveHeight = ctx.zoneHeight ?? bh;
  const grid = deriveWindowGrid(bw, effectiveHeight, type, ctx.fixedUnitSize);
  const items: WindowLayoutItem[] = [];

  // Simple LCG for deterministic grid; seed already carries zone offset from caller
  let s = seed + (type === 'wideWindows' ? 100 : type === 'tallWindows' ? 200 : 0);
  const prng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (prng() < threshold) {
        const x = grid.offsetX + c * grid.slotX;
        const y = zoneY + grid.offsetY + r * grid.slotY;
        // Drawn from the same interleaved LCG stream as the existence check above (not a
        // fresh draw at paint time) — genuinely layout-time, not paint-time.
        const opacityBase = 0.15 + prng() * 0.3;
        items.push({ x, y, unitW: grid.unitW, unitH: grid.unitH, seed, r, c, opacityBase });
      }
    }
  }

  return items;
}

/**
 * Geometry for `renderSquareWindows`/`renderWideWindows`/`renderTallWindows` (via the shared
 * `renderWindowGrid`). Respects optional `zoneY`/`zoneHeight` on the context to confine
 * windows to a vertical slice (e.g. between belt courses). When `frontCornerX` is defined,
 * splits into two independent grids — one per face — so no window is clipped or bisected by
 * the front corner edge, exactly as before this split (docs/specs/archive/FACTORY_LIGHTING_RERENDER.md
 * §1.4): the west (left, untranslated) sub-grid pairs with `westLMultiplier` at paint time; the
 * east (right, translated by `frontCornerX`) sub-grid pairs with `eastLMultiplier` and uses its
 * own `+500` seed offset so the two faces' patterns don't mirror each other.
 *
 * @param ctx - Greeble renderer context.
 * @param type - Window type key.
 * @param threshold - Probability (0..1) of a window spawning at a grid slot.
 */
export function computeWindowGridLayout(
  ctx: GreebleRendererContext,
  type: 'squareWindows' | 'wideWindows' | 'tallWindows',
  threshold: number,
): WindowGridLayout {
  const { buildingWidth: bw, seed, frontCornerX } = ctx;

  if (frontCornerX !== undefined) {
    // Derive unit size from the full building width so both faces share the same window
    // dimensions; only the column count varies per face.
    const sharedUnitSize = ctx.fixedUnitSize ?? Math.max(4, bw * 0.06);
    const westCtx: GreebleRendererContext = {
      ...ctx,
      buildingWidth: frontCornerX,
      frontCornerX: undefined,
      eastLMultiplier: undefined,
      westLMultiplier: undefined,
      fixedUnitSize: sharedUnitSize,
    };
    const eastCtx: GreebleRendererContext = {
      ...ctx,
      buildingWidth: bw - frontCornerX,
      seed: seed + 500,
      frontCornerX: undefined,
      eastLMultiplier: undefined,
      westLMultiplier: undefined,
      fixedUnitSize: sharedUnitSize,
    };
    return {
      split: true,
      frontCornerX,
      west: computeWindowGridItems(westCtx, type, threshold),
      east: computeWindowGridItems(eastCtx, type, threshold),
    };
  }

  return { split: false, items: computeWindowGridItems(ctx, type, threshold) };
}

/** Color/lit-state pass over one face's `WindowLayoutItem[]` — cheap, safe every render. */
function paintWindowItems(items: WindowLayoutItem[], ctx: GreebleRendererContext): GreebleElement {
  const windowFill = hslToString(colorTheme.glass.base);
  const illuminatedFill = ctx.colors?.illuminated ? hslToString(ctx.colors.illuminated) : windowFill;
  const lMult = ctx.lMultiplier ?? 1;
  const nightDepth = ctx.nightDepth ?? 0;
  const flickerEpoch = ctx.flickerEpoch ?? 0;

  return (
    <>
      {items.map((item) => {
        // Independent Alea seed per window+epoch so lit state never interferes with the
        // LCG draws that decided existence and opacityBase at layout time.
        const litRng = Alea(`${item.seed}-${flickerEpoch}-${item.r}-${item.c}`);
        const isLit = nightDepth > 0 && litRng() < nightDepth;
        // Lit windows use the night-depth multiplier; unlit windows use the face lightness
        // multiplier — same split as before, just applied to a precomputed opacityBase.
        // Rounded to 2 decimal places (100 distinct levels, visually indistinguishable from
        // full float precision) — nightDepth/lMult are continuous, never-repeating floats
        // sampled every tick, so an unrounded product would produce a genuinely different
        // number on every render, forcing a real DOM write every tick even when the visual
        // change is imperceptible. Same fix shape as applyColorShift's lightness rounding
        // (colorUtils.ts).
        const opacity = Math.round(item.opacityBase * (isLit ? nightDepth : lMult) * 100) / 100;
        return (
          <rect
            key={`${item.r}-${item.c}`}
            x={item.x}
            y={item.y}
            width={item.unitW}
            height={item.unitH}
            fill={isLit ? illuminatedFill : windowFill}
            opacity={opacity}
          />
        );
      })}
    </>
  );
}

/**
 * Color-only pass over a `computeWindowGridLayout` result. Cheap — one Alea draw + one
 * multiplication per window — safe to call on every render/tick, unlike the geometry above.
 */
export function paintWindowGrid(layout: WindowGridLayout, ctx: GreebleRendererContext): GreebleElement {
  if (!layout.split) {
    return paintWindowItems(layout.items, ctx);
  }
  const westCtx: GreebleRendererContext = { ...ctx, lMultiplier: ctx.westLMultiplier ?? ctx.lMultiplier };
  const eastCtx: GreebleRendererContext = { ...ctx, lMultiplier: ctx.eastLMultiplier ?? ctx.lMultiplier };
  return (
    <>
      {paintWindowItems(layout.west, westCtx)}
      <g transform={`translate(${layout.frontCornerX}, 0)`}>{paintWindowItems(layout.east, eastCtx)}</g>
    </>
  );
}

/**
 * Renders a grid of windows based on a probability threshold. Kept as a thin compatibility
 * wrapper over `computeWindowGridLayout`/`paintWindowGrid`
 * (docs/specs/archive/FACTORY_LIGHTING_RERENDER.md §1.4) — byte-identical output to before the split.
 * @param ctx Greeble renderer context.
 * @param type Window type key.
 * @param threshold Probability (0..1) of a window spawning at a grid slot.
 * @returns JSX.Element fragment.
 */
function renderWindowGrid(
  ctx: GreebleRendererContext,
  type: 'squareWindows' | 'wideWindows' | 'tallWindows',
  threshold: number
): GreebleElement {
  return paintWindowGrid(computeWindowGridLayout(ctx, type, threshold), ctx);
}

// ========================================
// REGISTRY
// ========================================

/**
 * Renders a probabilistic grid of 1:1 square windows across the facade.
 * Window density threshold is 40% — roughly 2 in 5 grid slots are filled.
 * Respects `ctx.zoneY` / `ctx.zoneHeight` when rendering inside belt-course zones.
 * Window opacity is modulated by the east/west lightness multipliers from `ctx`.
 *
 * @param ctx - Greeble renderer context providing building dimensions and colors.
 * @returns A React fragment of window rects, or null when the grid yields no windows.
 */
export function renderSquareWindows(ctx: GreebleRendererContext): GreebleElement | null {
  return renderWindowGrid(ctx, "squareWindows", 0.4);
}

/**
 * Renders a probabilistic grid of wide (4:1 aspect) windows across the facade.
 * Window density threshold is 30%. Wide windows suit industrial or warehouse
 * silhouettes and produce a horizontal rhythm on the facade.
 * Respects zone constraints and east/west opacity split from `ctx`.
 *
 * @param ctx - Greeble renderer context providing building dimensions and colors.
 * @returns A React fragment of window rects, or null when the grid yields no windows.
 */
export function renderWideWindows(ctx: GreebleRendererContext): GreebleElement | null {
  return renderWindowGrid(ctx, "wideWindows", 0.3);
}

/**
 * Renders a probabilistic grid of tall (1:4 aspect) windows across the facade.
 * Window density threshold is 30%. Tall windows suit skyscraper and stacks
 * silhouettes and produce a vertical rhythm on the facade.
 * Respects zone constraints and east/west opacity split from `ctx`.
 *
 * @param ctx - Greeble renderer context providing building dimensions and colors.
 * @returns A React fragment of window rects, or null when the grid yields no windows.
 */
export function renderTallWindows(ctx: GreebleRendererContext): GreebleElement | null {
  return renderWindowGrid(ctx, "tallWindows", 0.3);
}

/**
 * Renders decorative vertical pipe segments with round valve discs along the
 * left or right facade edge (or both). Pipes run vertically with short
 * horizontal branches at junctions. Layout is seeded from `ctx.seed`.
 * Uses `ctx.colors.greeble` at –15% saturation for a desaturated, watery look.
 * Respects `ctx.frontCornerX` to constrain branches within the selected face.
 *
 * @param ctx - Greeble renderer context providing building dimensions and colors.
 * @returns A React fragment of pipe rects and valve circles, or null when empty.
 */
export function renderPipesValvesFacade(ctx: GreebleRendererContext): GreebleElement | null {
  const { buildingWidth: bw, buildingHeight: bh, zoneY = 0, zoneHeight = bh, seed, frontCornerX } = ctx;
  const desat: HSL = { ...ctx.colors.greeble, s: clamp(ctx.colors.greeble.s - 15, 0, 100) };
  const fill = hslToString(desat);
  let s = seed + 800;
  const prng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const elements: GreebleElement[] = [];
  // vertical edge pipes (one or two L‑shaped runs)
  const primarySide: 'left' | 'right' = frontCornerX !== undefined
    ? (frontCornerX < bw / 2 ? 'left' : 'right')
    : prng() < 0.5 ? 'left' : 'right';

  const drawSide = (side: 'left' | 'right') => {
    const xPos = side === 'left' ? 2 : bw - 4;
    const horizontalMaxLen = frontCornerX !== undefined
      ? side === 'left'
        ? Math.max(0, frontCornerX - xPos)
        : Math.max(0, xPos - frontCornerX)
      : bw - xPos - 5;
    const countHere = 2 + Math.floor(prng() * 3);
    for (let i = 0; i < countHere; i++) {
      const len = zoneHeight * (0.2 + prng() * 0.3);
      const y = zoneY + prng() * (zoneHeight - len);
      elements.push(<rect key={`facade-pv-${side}-${i}`} x={xPos} y={y} width={2} height={len} fill={fill} />);
      elements.push(<circle key={`facade-vv-${side}-${i}`} cx={xPos + 1} cy={y} r={2} fill={fill} />);
      const hlen = prng() * horizontalMaxLen;
      const hy = zoneY + 1;
      if (side === 'left') {
        elements.push(<rect key={`facade-ph-${side}-${i}`} x={xPos} y={hy} width={hlen} height={2} fill={fill} />);
        elements.push(<circle key={`facade-vh-${side}-${i}`} cx={xPos} cy={hy + 1} r={2} fill={fill} />);
      } else {
        elements.push(<rect key={`facade-ph-${side}-${i}`} x={xPos - hlen} y={hy} width={hlen} height={2} fill={fill} />);
        elements.push(<circle key={`facade-vh-${side}-${i}`} cx={xPos} cy={hy + 1} r={2} fill={fill} />);
      }
    }
  };

  drawSide(primarySide);
  // sometimes also draw on opposite facade (33% chance)
  if (prng() < 0.33) {
    drawSide(primarySide === 'left' ? 'right' : 'left');
  }

  return elements.length ? <>{elements}</> : null;
}

/**
 * Renders horizontal decorative belt courses evenly spaced across the full
 * facade width. This renderer is kept in the registry for completeness but is
 * **not** rendered via `FACADE_RENDERERS` in Factory.tsx — belt courses are
 * instead drawn directly as `<rect>` separators between window zones, using
 * `actor.config.beltCourseCount` (chosen at spawn from `maxBeltCourses`).
 *
 * Useful as a standalone renderer in tests or future deferred-render contexts.
 *
 * Course count: `Math.floor(buildingHeight / BELT_COURSE_THRESHOLD)`.
 * Course fill: `ctx.colors.accent` with lightness bumped +5%.
 * Course height: 2–3% of building height (seeded random per course).
 *
 * @param ctx - Greeble renderer context providing building dimensions and colors.
 * @returns A React fragment of belt-course rects, or null when count is zero.
 */
export function renderBeltCourse(ctx: GreebleRendererContext): GreebleElement | null {
  const { buildingWidth: bw, buildingHeight: bh, seed, colors } = ctx;
  const count = deriveBeltCourses(bh);
  if (count === 0) return null;

  let s = seed + 300;
  const prng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  const fill = hslToString({ ...colors.accent, l: clamp(colors.accent.l + 5, 0, 100) });
  const spacing = bh / count;
  const courses: GreebleElement[] = [];

  for (let i = 0; i < count; i++) {
    const courseH = bh * (0.02 + prng() * 0.01);
    const y = i * spacing + spacing / 2 - courseH / 2;
    courses.push(
      <rect
        key={`belt-${i}`}
        x={0}
        y={y}
        width={bw}
        height={courseH}
        fill={fill}
      />
    );
  }

  return <>{courses}</>;
}

/**
 * Registry of all facade greeble renderers.
 */
export const FACADE_RENDERERS: Record<FacadeGreeble, GreebleRenderer> = {
  squareWindows: renderSquareWindows,
  wideWindows: renderWideWindows,
  tallWindows: renderTallWindows,
  beltCourse: renderBeltCourse,
  pipesValves: renderPipesValvesFacade,
};

/**
 * Registry of the layout/paint pair for every `FacadeGreeble` that actually reads a lighting
 * field — only the 3 window types (docs/specs/archive/FACTORY_LIGHTING_RERENDER.md §1.1).
 * Deliberately `Partial`: a type absent from this map is static-only and gets memoized
 * wholesale by its caller (`Factory.tsx`, Task 4) via the plain `FACADE_RENDERERS` entry
 * above instead. `unknown`-typed pragmatically (confirmed 2026-09-14, spec §7.2) rather than
 * a discriminated union — each entry's own `compute`/`paint` pair is already fully typed
 * against each other.
 */
export const FACADE_LAYOUT_PAINT: Partial<Record<FacadeGreeble, {
  compute: (ctx: GreebleRendererContext) => unknown;
  paint: (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null;
}>> = {
  squareWindows: {
    compute: (ctx) => computeWindowGridLayout(ctx, 'squareWindows', 0.4),
    paint: paintWindowGrid as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
  wideWindows: {
    compute: (ctx) => computeWindowGridLayout(ctx, 'wideWindows', 0.3),
    paint: paintWindowGrid as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
  tallWindows: {
    compute: (ctx) => computeWindowGridLayout(ctx, 'tallWindows', 0.3),
    paint: paintWindowGrid as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
};
