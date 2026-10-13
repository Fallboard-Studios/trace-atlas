import type { RooftopGreeble, GreebleRendererContext, GreebleRenderer, GreebleElement } from './greebleTypes';
import { hslToString, applyColorShift } from '../../../utils/colorUtils';
import colorTheme from '../../../constants/colorTheme.json';
import type { GemPoint } from '../../robot/gem/polygon';
import { GemRing } from '../material/GemRing';
import {
  ROOF_BOX_BEVEL_FACTOR,
  WORLD_BEVEL_PX,
  WORLD_GEM,
  hairline,
  ringFacets,
  worldBevel,
  type RingOptions,
} from '../material/worldGemMaterial';

// ========================================
// WORLD GEM ROOF-BOX RINGS (docs/specs/WORLD_GEM_MATERIAL.md §1.4, assumption 7)
// ========================================
// Rooftop geometry is already in scene pixels, outside the scaled body group, so a ring is drawn
// directly. A block gets the ring at 0.6 x the building's depth, through the shared 18 % cap and
// the 1 px floor; it needs the hour's light, so no `ctx.light` means no ring and the renderer
// is byte-identical to before. Rings are drawn after ALL of a greeble's fills, never between them,
// so the fills keep their order and their child indexes; blocks never overlap, so nothing is
// painted over.

/** Ring depth for a roof box, before the cap and the floor. */
const ROOF_BOX_BEVEL_PX = WORLD_BEVEL_PX * ROOF_BOX_BEVEL_FACTOR;

interface RoofRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const rectPts = ({ x, y, w, h }: RoofRect): GemPoint[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** One roof block's ring element, or null when it is off, unlit or smaller than the floor allows. */
function roofBoxRing(
  key: string,
  ctx: GreebleRendererContext,
  pts: GemPoint[],
  size: { w: number; h: number },
  faceLightAt: (midX: number) => number,
  opts?: RingOptions,
): GreebleElement | null {
  if (!WORLD_GEM.roofBoxes || !ctx.light) return null;
  const depth = worldBevel(size.w, size.h, 1, ROOF_BOX_BEVEL_PX);
  const facets = ringFacets(pts, depth, ctx.light, faceLightAt, ctx.colors.accent, opts);
  return facets.length > 0 ? <GemRing key={key} facets={facets} /> : null;
}

/** The 1.5 px hairline for a really thin part (shaft, pipe, stilt, rod), or nothing when it is off. */
const thinPart = () => (WORLD_GEM.members ? hairline() : undefined);

const present = (els: Array<GreebleElement | null>): GreebleElement[] => els.filter((e): e is GreebleElement => e !== null);

// ========================================
// LAYOUT/PAINT SPLIT TYPES
// (docs/specs/FACTORY_LIGHTING_RERENDER.md §1.4 — Task 2)
//
// Of this file's 8 renderers, only pitchedRoof/crownSpire read a lighting field
// (eastLMultiplier/westLMultiplier). Their geometry is split out into a `compute*Layout`
// function (static-input-only, safe to memoize once per factory) and a `paint*` function
// (color only, cheap, safe every render). `render<Greeble>` stays a thin wrapper over the
// two so every existing caller/test keeps working unchanged. The other 6 renderers in this
// file are unaffected — their entire output is already lighting-independent.
// ========================================

/** Geometry for `renderPitchedRoof`'s shaded (frontCornerX-aware) branch. */
export interface PitchedRoofLayout {
  slopePoints: string;
  wallPoints: string;
  /** The same two polygons as numbers (and their bounding sizes), for the world gem rings. */
  slope: { pts: GemPoint[]; w: number; h: number };
  wall: { pts: GemPoint[]; w: number; h: number };
}

/** One tier of `renderCrownSpire`'s shaded (frontCornerX-aware) branch. `sideX` is stored
 *  verbatim as `frontCornerX` (not re-derived as `frontX + frontW`) so paint can't drift
 *  from the original single-variable value by even a float-rounding hair. */
interface CrownSpireShadedTier {
  y: number;
  frontX: number;
  frontW: number;
  sideX: number;
  sideW: number;
  height: number;
}

/** One tier of `renderCrownSpire`'s unshaded fallback branch — no per-face split. */
interface CrownSpireUnshadedTier {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Geometry for `renderCrownSpire`, covering both its shaded and unshaded branches. */
export type CrownSpireLayout =
  | { shaded: true; tiers: CrownSpireShadedTier[]; antenna: { x: number; y: number; width: number; height: number } }
  | { shaded: false; tiers: CrownSpireUnshadedTier[]; antenna: { x: number; y: number; width: number; height: number } };

// ========================================
// ROOFTOP GREEBLE RENDERERS
// ========================================

/**
 * Renders a procedural machinery cluster on the rooftop. The building width
 * is divided into 5-8 equal columns; each column has a 30% seeded chance of
 * sporting a stack rectangle (height 3-10% of building height). Determinism
 * is guaranteed by a local LCG seeded from `ctx.seed`.
 * Returns `null` when no stacks are generated.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React fragment of stack rects, or null if no stacks generated.
 */
export function renderMachinery(ctx: GreebleRendererContext): GreebleElement | null {
  return paintMachinery(computeMachineryLayout(ctx), ctx);
}

/** Geometry for `renderMachinery` — each stack's rect and its column index (its React key). */
export interface MachineryLayout {
  stacks: Array<RoofRect & { key: number }>;
}

/**
 * The stacks' positions and sizes. Reads only `buildingWidth`/`buildingHeight`/`roofY`/`seed`, so
 * the same input gives the same layout whatever the hour (docs/specs/WORLD_GEM_MATERIAL.md
 * assumption 7: machinery now needs the hour for its rings, so it joins the layout/paint split).
 */
export function computeMachineryLayout(ctx: GreebleRendererContext): MachineryLayout {
  const { buildingWidth: bw, buildingHeight: bh, roofY, seed } = ctx;

  const colCount = Math.min(8, 5 + Math.floor(bw / 40)); // 5-8 columns
  const colW = bw / colCount;
  const stackW = Math.max(4, colW * 0.4);

  let r = seed;
  const prng = (): number => {
    r = (r * 1664525 + 1013904223) & 0xffffffff;
    return (r >>> 0) / 2 ** 32;
  };

  const stacks: MachineryLayout['stacks'] = [];
  for (let i = 0; i < colCount; i++) {
    if (prng() < 0.3) {
      const stackH = bh * (0.03 + prng() * 0.07); // 3-10% of building height
      const cx = colW * i + colW / 2;
      const x = cx - stackW / 2;
      const y = roofY - stackH;
      stacks.push({ key: i, x, y, w: stackW, h: stackH });
    }
  }
  return { stacks };
}

/** Fills and rings over a `computeMachineryLayout` result — cheap, safe on every tick. */
export function paintMachinery(layout: MachineryLayout, ctx: GreebleRendererContext): GreebleElement | null {
  if (layout.stacks.length === 0) return null;
  const fill = hslToString(ctx.colors.accent);
  const fills = layout.stacks.map((s) => <rect key={s.key} x={s.x} y={s.y} width={s.w} height={s.h} fill={fill} />);
  // single-tone at the roof average
  const rings = present(layout.stacks.map((s) => roofBoxRing(`ring-${s.key}`, ctx, rectPts(s), s, () => ctx.lMultiplier)));
  return <>{[...fills, ...rings]}</>;
}

/**
 * Renders a steppe (ziggurat) roof with 1-3 progressively narrower tiers.
 * Tier count is derived deterministically from the seed (1-3 tiers).
 * Each tier is 2% of building height, centered, and uses 80/60/40% of build width.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React fragment containing the stacked tier rectangles.
 */
export function renderSteppeRoof(ctx: GreebleRendererContext): GreebleElement | null {
  return paintSteppeRoof(computeSteppeRoofLayout(ctx), ctx);
}

/** Geometry for `renderSteppeRoof` — each tier's rect and its index (its React key). */
export interface SteppeRoofLayout {
  tiers: Array<RoofRect & { key: number }>;
}

/** The tiers' positions and sizes — `buildingWidth`/`buildingHeight`/`roofY`/`seed` only. */
export function computeSteppeRoofLayout(ctx: GreebleRendererContext): SteppeRoofLayout {
  const tierCount = 1 + (ctx.seed % 3); // 1..3 tiers based on seed
  const tierWidthPcts = [0.8, 0.6, 0.4] as const;
  const tierH = ctx.buildingHeight * 0.02; // 2% of building height per tier

  const tiers: SteppeRoofLayout['tiers'] = [];
  for (let i = 0; i < tierCount; i++) {
    const w = ctx.buildingWidth * tierWidthPcts[i];
    const x = (ctx.buildingWidth - w) / 2; // centre each tier
    const y = ctx.roofY - tierH * (i + 1); // stack upward from roof
    tiers.push({ key: i, x, y, w, h: tierH });
  }
  return { tiers };
}

/** Fills and rings over a `computeSteppeRoofLayout` result — cheap, safe on every tick. */
export function paintSteppeRoof(layout: SteppeRoofLayout, ctx: GreebleRendererContext): GreebleElement | null {
  const fill = hslToString(ctx.colors.accent);
  const fills = layout.tiers.map((t) => <rect key={t.key} x={t.x} y={t.y} width={t.w} height={t.h} fill={fill} />);
  // single-tone at the roof average; a tier under the 1 px floor draws no ring
  const rings = present(layout.tiers.map((t) => roofBoxRing(`ring-${t.key}`, ctx, rectPts(t), t, () => ctx.lMultiplier)));
  return <>{[...fills, ...rings]}</>;
}

/**
 * Renders a pitched roof with a lean-to profile matching the building's
 * pseudo-3/4 perspective:
 *
 * - **Front slope** (west face, lighter): a triangle from the full front-face
 *   base up to the ridge at `frontCornerX`. The slope diagonal faces the viewer.
 * - **Side wall** (east face, darker): a flat vertical rectangle spanning the
 *   side face at the same ridge height — reads as a straight-up parapet wall.
 *
 * The two polygons share a vertical edge at `x = frontCornerX`. Ridge height
 * equals the front-face width (1:1 pitch on the visible slope).
 *
 * Falls back to a single centred triangle when lighting context is absent.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React SVG element forming the roof.
 */
/**
 * Geometry for the shaded (frontCornerX-aware) branch of `renderPitchedRoof` — no color.
 * Reads only static fields (`buildingWidth`, `roofY`, `frontCornerX`), so the same input
 * always produces the same output regardless of lighting; safe to compute once per factory
 * and reuse across every lighting tick (docs/specs/FACTORY_LIGHTING_RERENDER.md §1.4).
 *
 * @returns `null` when `frontCornerX`/`eastLMultiplier`/`westLMultiplier` aren't all present
 *   — matches the original branch condition exactly (this decides which *shape* to draw, not
 *   just which color, so it must mirror the paint-time check even though layout itself never
 *   reads the multipliers' values) — signals the caller to use the unshaded single-polygon
 *   fallback shape instead (see `paintPitchedRoof`).
 */
export function computePitchedRoofLayout(ctx: GreebleRendererContext): PitchedRoofLayout | null {
  const { buildingWidth: bw, roofY, frontCornerX, eastLMultiplier, westLMultiplier } = ctx;
  if (frontCornerX === undefined || eastLMultiplier === undefined || westLMultiplier === undefined) return null;
  const h = frontCornerX;
  const ridgeY = roofY - h;
  return {
    // Front slope: right triangle — base along eave, vertical right edge at corner.
    slopePoints: `0,${roofY} ${frontCornerX},${roofY} ${frontCornerX},${ridgeY}`,
    // Side wall: flat rectangle — straight vertical parapet over the side face.
    wallPoints: `${frontCornerX},${ridgeY} ${bw},${ridgeY} ${bw},${roofY} ${frontCornerX},${roofY}`,
    slope: { pts: [[0, roofY], [frontCornerX, roofY], [frontCornerX, ridgeY]], w: frontCornerX, h: h },
    wall: { pts: [[frontCornerX, ridgeY], [bw, ridgeY], [bw, roofY], [frontCornerX, roofY]], w: bw - frontCornerX, h },
  };
}

/**
 * Color-only pass over a `computePitchedRoofLayout` result. Cheap — one `applyColorShift`
 * call per polygon — safe to call on every render/tick, unlike the geometry above.
 *
 * @param layout - Result of `computePitchedRoofLayout`, or `null` to use the unshaded
 *   fallback (single centred triangle, no east/west split).
 */
export function paintPitchedRoof(layout: PitchedRoofLayout | null, ctx: GreebleRendererContext): GreebleElement | null {
  if (!layout) {
    const { buildingWidth: bw, roofY, frontCornerX } = ctx;
    const h = bw;
    const apexX = frontCornerX ?? bw / 2;
    const points = `0,${roofY} ${bw},${roofY} ${apexX},${roofY - h}`;
    return <polygon points={points} fill={hslToString(ctx.colors.accent)} />;
  }

  const noShift = { hueShift: 0, satShift: 0 };
  const westFill = applyColorShift(ctx.colors.accent, noShift, ctx.westLMultiplier!);
  const eastFill = applyColorShift(ctx.colors.accent, noShift, ctx.eastLMultiplier!);

  // Each polygon's ring is lit from its own face's multiplier, drawn after both fills.
  const rings = present([
    roofBoxRing('ring-slope', ctx, layout.slope.pts, layout.slope, () => ctx.westLMultiplier!),
    roofBoxRing('ring-wall', ctx, layout.wall.pts, layout.wall, () => ctx.eastLMultiplier!),
  ]);

  return (
    <>
      <polygon points={layout.slopePoints} fill={westFill} />
      <polygon points={layout.wallPoints} fill={eastFill} />
      {rings}
    </>
  );
}

/**
 * Renders a pitched roof with a lean-to profile matching the building's
 * pseudo-3/4 perspective:
 *
 * - **Front slope** (west face, lighter): a triangle from the full front-face
 *   base up to the ridge at `frontCornerX`. The slope diagonal faces the viewer.
 * - **Side wall** (east face, darker): a flat vertical rectangle spanning the
 *   side face at the same ridge height — reads as a straight-up parapet wall.
 *
 * The two polygons share a vertical edge at `x = frontCornerX`. Ridge height
 * equals the front-face width (1:1 pitch on the visible slope).
 *
 * Falls back to a single centred triangle when lighting context is absent.
 *
 * Kept as a thin compatibility wrapper over `computePitchedRoofLayout`/`paintPitchedRoof`
 * (docs/specs/FACTORY_LIGHTING_RERENDER.md §1.4) — byte-identical output to before the split;
 * callers that don't care about the layout/paint separation (existing tests, ad-hoc use)
 * can keep calling this directly.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React SVG element forming the roof.
 */
export function renderPitchedRoof(ctx: GreebleRendererContext): GreebleElement | null {
  return paintPitchedRoof(computePitchedRoofLayout(ctx), ctx);
}

/**
 * Renders a step-pyramid (ziggurat) crown spire above the roofline.
 *
 * **Shaded path** (when `frontCornerX`, `eastLMultiplier`, `westLMultiplier`
 * are all present): Each tier produces two rects sharing a vertical edge at
 * `frontCornerX`:
 * - Front face (west, lighter): insets from the left each tier.
 * - Side face  (east, darker):  insets from the right each tier.
 * The antenna rod sits centred on the top tier’s front face.
 *
 * **Fallback path** (no lighting context): original centered rectangles
 * — preserves the existing 2D silhouette when context is absent.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React fragment containing tier rectangles and an antenna rect.
 */
/**
 * Geometry for `renderCrownSpire` — tier positions/sizes and the antenna rect. No color.
 * Reads only static fields (`buildingWidth`, `buildingHeight`, `roofY`, `seed`,
 * `frontCornerX`) plus the *definedness* (not the value) of `eastLMultiplier`/
 * `westLMultiplier` to pick shaded vs. unshaded branching — so the same input always
 * produces the same output regardless of the lighting tick
 * (docs/specs/FACTORY_LIGHTING_RERENDER.md §1.4).
 */
export function computeCrownSpireLayout(ctx: GreebleRendererContext): CrownSpireLayout {
  const { buildingWidth: bw, buildingHeight: bh, roofY, seed, frontCornerX, eastLMultiplier, westLMultiplier } = ctx;
  const stepCount = 2 + (seed % 2); // 2 or 3 tiers from seed
  const totalStepH = bh * 0.15;
  const stepH = totalStepH / stepCount;
  const antennaW = 2;
  const antennaH = bh * 0.08;
  const antennaY = roofY - totalStepH - antennaH;

  if (frontCornerX !== undefined && eastLMultiplier !== undefined && westLMultiplier !== undefined) {
    // How aggressively each face insets per tier (0 = no inset at bottom, 1 = full width at top)
    const INSET_RATE = 0.65;
    const tiers: CrownSpireShadedTier[] = [];
    for (let i = 0; i < stepCount; i++) {
      const t = i / stepCount; // 0 at bottom, approaches 1 at top
      const y = roofY - stepH * (i + 1);
      // Front face: right edge fixed at frontCornerX; left edge steps inward
      const leftX = frontCornerX * t * INSET_RATE;
      const frontW = frontCornerX - leftX;
      // Side face: left edge fixed at frontCornerX; right edge steps inward
      const sideW = (bw - frontCornerX) * (1 - t * INSET_RATE);
      tiers.push({ y, frontX: leftX, frontW, sideX: frontCornerX, sideW, height: stepH });
    }
    const topT = (stepCount - 1) / stepCount;
    const topLeftX = frontCornerX * topT * INSET_RATE;
    const topFrontW = frontCornerX - topLeftX;
    const antennaX = topLeftX + topFrontW / 2 - antennaW / 2;
    return { shaded: true, tiers, antenna: { x: antennaX, y: antennaY, width: antennaW, height: antennaH } };
  }

  const widthPcts2 = [1.0, 0.5] as const;
  const widthPcts3 = [1.0, 0.65, 0.3] as const;
  const widthPcts = stepCount === 2 ? widthPcts2 : widthPcts3;
  const tiers: CrownSpireUnshadedTier[] = [];
  for (let i = 0; i < stepCount; i++) {
    const w = bw * widthPcts[i];
    const x = (bw - w) / 2;
    const y = roofY - stepH * (i + 1);
    tiers.push({ x, y, width: w, height: stepH });
  }
  const antennaX = (bw - antennaW) / 2;
  return { shaded: false, tiers, antenna: { x: antennaX, y: antennaY, width: antennaW, height: antennaH } };
}

/**
 * Color-only pass over a `computeCrownSpireLayout` result. Cheap — 1-2 `applyColorShift`
 * calls total, reused across every tier — safe to call on every render/tick.
 */
export function paintCrownSpire(layout: CrownSpireLayout, ctx: GreebleRendererContext): GreebleElement | null {
  const elements: GreebleElement[] = [];

  if (layout.shaded) {
    const noShift = { hueShift: 0, satShift: 0 };
    const westFill = applyColorShift(ctx.colors.accent, noShift, ctx.westLMultiplier!);
    const eastFill = applyColorShift(ctx.colors.accent, noShift, ctx.eastLMultiplier!);
    layout.tiers.forEach((tier, i) => {
      elements.push(
        <rect key={`front-${i}`} x={tier.frontX} y={tier.y} width={tier.frontW} height={tier.height} fill={westFill} />,
        <rect key={`side-${i}`} x={tier.sideX} y={tier.y} width={tier.sideW} height={tier.height} fill={eastFill} />,
      );
    });
    elements.push(
      <rect key="antenna" x={layout.antenna.x} y={layout.antenna.y} width={layout.antenna.width} height={layout.antenna.height} fill={westFill} {...thinPart()} />,
    );
    // One two-faced ring per tier: the union of its front and side rects, the top and bottom
    // facets split at the front corner so each half takes its own face's light. Drawn after all
    // the fills (tiers are stacked, never overlapping).
    layout.tiers.forEach((tier, i) => {
      const w = tier.sideX + tier.sideW - tier.frontX;
      const ring = roofBoxRing(
        `ring-${i}`, ctx, rectPts({ x: tier.frontX, y: tier.y, w, h: tier.height }), { w, h: tier.height },
        (midX) => (midX < tier.sideX ? ctx.westLMultiplier! : ctx.eastLMultiplier!),
        { splitX: tier.sideX },
      );
      if (ring) elements.push(ring);
    });
  } else {
    const fill = hslToString(ctx.colors.accent);
    layout.tiers.forEach((tier, i) => {
      elements.push(<rect key={`step-${i}`} x={tier.x} y={tier.y} width={tier.width} height={tier.height} fill={fill} />);
    });
    elements.push(
      <rect key="antenna" x={layout.antenna.x} y={layout.antenna.y} width={layout.antenna.width} height={layout.antenna.height} fill={fill} {...thinPart()} />,
    );
  }

  return <>{elements}</>;
}

/**
 * Renders a step-pyramid (ziggurat) crown spire above the roofline.
 *
 * **Shaded path** (when `frontCornerX`, `eastLMultiplier`, `westLMultiplier`
 * are all present): Each tier produces two rects sharing a vertical edge at
 * `frontCornerX`:
 * - Front face (west, lighter): insets from the left each tier.
 * - Side face  (east, darker):  insets from the right each tier.
 * The antenna rod sits centred on the top tier’s front face.
 *
 * **Fallback path** (no lighting context): original centered rectangles
 * — preserves the existing 2D silhouette when context is absent.
 *
 * Kept as a thin compatibility wrapper over `computeCrownSpireLayout`/`paintCrownSpire`
 * (docs/specs/FACTORY_LIGHTING_RERENDER.md §1.4) — byte-identical output to before the split.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React fragment containing tier rectangles and an antenna rect.
 */
export function renderCrownSpire(ctx: GreebleRendererContext): GreebleElement | null {
  return paintCrownSpire(computeCrownSpireLayout(ctx), ctx);
}

/**
 * Renders a single antenna: a tall vertical shaft with an indicator light at
 * the top. If the antenna is taller than 15% of building height, a second
 * static mid-point light is added (flicker animation deferred to later).
 *
 * Shaft width: 2-4px (seeded); height: 10-25% of building height (seeded).
 * Indicator light color: colorTheme.indicator.powered.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React fragment containing the shaft rect and light circle(s).
 */
export function renderAntennae(ctx: GreebleRendererContext): GreebleElement | null {
  const { buildingWidth: bw, buildingHeight: bh, roofY, seed } = ctx;

  // Derive shaft dimensions from seed
  const lineW = 2 + (seed % 3); // 2, 3, or 4 px
  const heightPct = 0.1 + (seed % 100) / 100 * 0.15; // 10-25% of bh
  const lineH = bh * heightPct;
  const isTall = heightPct > 0.15;

  const lineX = (bw - lineW) / 2;
  const lineY = roofY - lineH;

  const shaftFill = hslToString(ctx.colors.accent);
  const lightFill = hslToString(colorTheme.indicator.powered);
  const lightR = Math.max(2, lineW * 1.5);

  const elements: GreebleElement[] = [
    <rect key="shaft" x={lineX} y={lineY} width={lineW} height={lineH} fill={shaftFill} {...thinPart()} />,
    <circle key="top-light" cx={bw / 2} cy={lineY} r={lightR} fill={lightFill} />,
  ];

  if (isTall) {
    const midY = lineY + lineH * 0.5;
    elements.push(
      <circle key="mid-light" cx={bw / 2} cy={midY} r={lightR} fill={lightFill} />,
    );
  }

  return <>{elements}</>;
}

/**
 * Renders a water tower composed of three vertical sections:
 * - Bottom third: 2-4 evenly-spaced support stilts (2px-wide rects)
 * - Middle third: a solid rectangular tank body
 * - Top third: a triangular cap (polygon)
 *
 * Width is ~15% of building width; total height is 15-20% of building height,
 * both derived deterministically from `ctx.seed`. Tower is horizontally centred.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React fragment containing stilt rects, body rect, and cap polygon.
 */
export function renderWaterTower(ctx: GreebleRendererContext): GreebleElement | null {
  return paintWaterTower(computeWaterTowerLayout(ctx), ctx);
}

/** Geometry for `renderWaterTower` — the tank body, the cap's points and the stilts. */
export interface WaterTowerLayout {
  body: RoofRect;
  capPoints: string;
  stilts: Array<RoofRect & { key: number }>;
}

/** The tower's positions and sizes — `buildingWidth`/`buildingHeight`/`roofY`/`seed` only. */
export function computeWaterTowerLayout(ctx: GreebleRendererContext): WaterTowerLayout {
  const { buildingWidth: bw, buildingHeight: bh, roofY, seed } = ctx;

  const totalH = bh * (0.15 + (seed % 6) * (0.05 / 5)); // 15-20% of building height
  const totalW = bw * 0.15;
  const thirdH = totalH / 3;
  const leftX = (bw - totalW) / 2;

  const body = { x: leftX, y: roofY - 2 * thirdH, w: totalW, h: thirdH };

  const capBaseY = roofY - 2 * thirdH; // bottom of cap = top of body
  const capPoints =
    `${leftX},${capBaseY} ${leftX + totalW},${capBaseY} ${leftX + totalW / 2},${roofY - totalH}`;

  const stiltCount = 2 + (seed % 3); // 2, 3, or 4 stilts
  const stiltW = 2;
  const stiltH = thirdH;
  const stiltY = roofY - thirdH;
  const slotW = totalW / stiltCount;
  const stilts: WaterTowerLayout['stilts'] = [];
  for (let i = 0; i < stiltCount; i++) {
    const stiltX = leftX + slotW * i + slotW / 2 - stiltW / 2; // centred in slot
    stilts.push({ key: i, x: stiltX, y: stiltY, w: stiltW, h: stiltH });
  }
  return { body, capPoints, stilts };
}

/** Fills and the body's ring over a `computeWaterTowerLayout` result — cheap, safe on every tick. */
export function paintWaterTower(layout: WaterTowerLayout, ctx: GreebleRendererContext): GreebleElement | null {
  const fill = hslToString(ctx.colors.accent);
  const { body } = layout;
  const elements: GreebleElement[] = [
    <rect key="body" x={body.x} y={body.y} width={body.w} height={body.h} fill={fill} />,
    <polygon key="cap" points={layout.capPoints} fill={fill} />,
    ...layout.stilts.map((s) => (
      <rect key={`stilt-${s.key}`} x={s.x} y={s.y} width={s.w} height={s.h} fill={fill} {...thinPart()} />
    )),
  ];
  // The tank body is the block; the cap and stilts are thin parts. Single-tone at the roof average.
  const ring = roofBoxRing('ring-body', ctx, rectPts(body), body, () => ctx.lMultiplier);
  if (ring) elements.push(ring);
  return <>{elements}</>;
}

/**
 * Renders a rounded cupola dome above the roofline using an SVG arc path.
 * The dome spans 40-60% of building width (seeded) and rises ~12% of building
 * height. The arc traces the upper half of an ellipse, filled with the accent
 * color, with a straight line closing the base along `roofY`.
 *
 * @param ctx - The greeble renderer context providing dimensions and colors.
 * @returns A React SVG path element forming the filled dome shape.
 */
export function renderCupola(ctx: GreebleRendererContext): GreebleElement | null {
  const { buildingWidth: bw, buildingHeight: bh, roofY, seed } = ctx;

  const cupolaW = bw * (0.4 + (seed % 100) / 100 * 0.2); // 40-60% of building width
  const cupolaH = bh * 0.12; // 12% of building height
  const cx = bw / 2;
  const rx = cupolaW / 2;
  const ry = cupolaH;

  // Upper half of an ellipse: arc from left edge to right edge along roofY,
  // sweeping clockwise (sweep-flag=1) which traces through the top of the dome.
  const arc = `M ${cx - rx},${roofY} A ${rx},${ry} 0 0 1 ${cx + rx},${roofY}`;
  const dome = <path d={`${arc} Z`} fill={hslToString(ctx.colors.accent)} />;

  // The hairline runs along the arc only: the dome's base edge is not outlined. It is one open
  // path of its own, after the filled dome (docs/specs/WORLD_GEM_MATERIAL.md §1.6). With the
  // members switch off the cupola is the single filled path it always was.
  const line = thinPart();
  if (!line) return dome;
  return (
    <>
      {dome}
      <path d={arc} fill="none" {...line} />
    </>
  );
}

// ---------------------------------------
// pipes & valves renderer
// ---------------------------------------

/**
 * Renders a handful of horizontal/vertical pipe segments with round valve
 * discs attached. Pipes are laid out along the roof with a simple LCG pattern
 * seeded from `ctx.seed`. Valves are circles at pipe junctions. Primarily
 * uses `ctx.colors.greeble` for fill.
 */
export function renderPipesValves(ctx: GreebleRendererContext): GreebleElement | null {
  const { buildingWidth: bw, buildingHeight: bh, roofY, seed } = ctx;
  const fill = hslToString(ctx.colors.greeble);
  let s = seed + 500;
  const prng = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const elements: GreebleElement[] = [];
  // up to 4 pipes
  const count = 2 + Math.floor(prng() * 3);
  for (let i = 0; i < count; i++) {
    const isHorizontal = prng() < 0.5;
    if (isHorizontal) {
      // horizontal pipes hug the roofline; small vertical jitter 0‑5px
      const y = roofY - (prng() * 5);
      const len = bw * (0.3 + prng() * 0.4);
      const x = prng() * (bw - len);
      elements.push(<rect key={`pipe-h-${i}`} x={x} y={y} width={len} height={2} fill={fill} {...thinPart()} />);
      // valve at the left end sitting on roof
      elements.push(<circle key={`valve-h-${i}`} cx={x} cy={y + 1} r={3} fill={fill} {...thinPart()} />);
    } else {
      // vertical pipes start at roof and descend
      const len = bh * (0.1 + prng() * 0.1); // somewhat longer
      const x = prng() * bw;
      const y = roofY - len;
      elements.push(<rect key={`pipe-v-${i}`} x={x} y={y} width={2} height={len} fill={fill} {...thinPart()} />);
      // valve at top on roof
      elements.push(<circle key={`valve-v-${i}`} cx={x + 1} cy={roofY} r={3} fill={fill} {...thinPart()} />);
    }
  }
  return elements.length ? <>{elements}</> : null;
}

// ========================================
// EXPORTS
// ========================================

/** Registry mapping every RooftopGreeble variant to its renderer function. */
export const ROOFTOP_RENDERERS: Record<RooftopGreeble, GreebleRenderer> = {
  machinery: renderMachinery,
  antennae: renderAntennae,
  waterTower: renderWaterTower,
  cupola: renderCupola,
  crownSpire: renderCrownSpire,
  pitchedRoof: renderPitchedRoof,
  steppeRoof: renderSteppeRoof,
  pipesValves: renderPipesValves,
};

/**
 * Registry of the layout/paint pair for every `RooftopGreeble` that actually reads a
 * lighting field — only `pitchedRoof`/`crownSpire` (docs/specs/FACTORY_LIGHTING_RERENDER.md
 * §1.1). Deliberately `Partial`: a type absent from this map is static-only and gets
 * memoized wholesale by its caller (`Factory.tsx`, Task 4) via the plain `ROOFTOP_RENDERERS`
 * entry above instead — the map's own key set is how the caller tells the two cases apart.
 * `unknown`-typed pragmatically (confirmed 2026-09-14, spec §7.2) rather than a discriminated
 * union — each entry's own `compute`/`paint` pair is already fully typed against each other.
 */
export const ROOFTOP_LAYOUT_PAINT: Partial<Record<RooftopGreeble, {
  compute: (ctx: GreebleRendererContext) => unknown;
  paint: (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null;
}>> = {
  pitchedRoof: {
    compute: computePitchedRoofLayout,
    paint: paintPitchedRoof as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
  crownSpire: {
    compute: computeCrownSpireLayout,
    paint: paintCrownSpire as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
  // Phase 44: the world gem roof-box ring needs the hour, so these three leave the static slot.
  machinery: {
    compute: computeMachineryLayout,
    paint: paintMachinery as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
  waterTower: {
    compute: computeWaterTowerLayout,
    paint: paintWaterTower as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
  steppeRoof: {
    compute: computeSteppeRoofLayout,
    paint: paintSteppeRoof as (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null,
  },
};
