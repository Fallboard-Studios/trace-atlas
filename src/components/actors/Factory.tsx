import React, { useMemo } from 'react';

import type { Actor } from '../../types/Actor';
import { selectVariantFromSeed, VARIANT_CONF } from './factoryVariants';
import { hashActorId } from './factoryBubbleProps';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from '../../systems/factoryPlacementSystem';
import { calcSilhouetteSize, bottomAnchorTransform } from './silhouetteUtils';
import { applyColorShift, shiftHSL, clamp } from '../../utils/colorUtils';
import { getLighting, getNightDepth, FLICKER_PERIOD, DAY_CYCLE_MEASURES } from '../../utils/lightingUtils';
import { ROOFTOP_RENDERERS, ROOFTOP_LAYOUT_PAINT } from './greebles/rooftopGreebles';
import { FACADE_RENDERERS, FACADE_LAYOUT_PAINT } from './greebles/facadeGreebles';
import type { RooftopGreeble, FacadeGreeble, GreebleRendererContext, GreebleElement, GreebleRenderer } from './greebles/greebleTypes';
import { useUIStore } from '../../stores/uiStore';

// ========================================
// DEBUG LIGHTING
// ========================================

/** Named lighting presets for visual testing.
 * east = sun-facing side multiplier, west = shadow-side multiplier.
 * Values >1 are valid (boost lightness beyond base).
 */
const LIGHTING_PRESETS = {
  dawn: { east: 1.1, west: 0.45 },
  morning: { east: 1.0, west: 0.6 },
  noon: { east: 0.9, west: 0.85 },
  evening: { east: 0.55, west: 1.0 },
  night: { east: 0.3, west: 0.3 },
} as const;

/**
 * Set to one of the preset keys to preview lighting.
 * Set to `null` to use the live day/night cycle driven by `currentMeasure`.
 */
const DEBUG_LIGHTING_PRESET = null as keyof typeof LIGHTING_PRESETS | null;

// ========================================
// CONSTANTS
// ========================================

/** Belt course thickness in normalised 0-100 SVG units. */
const BELT_H = 2;

// ========================================
// STATIC/DYNAMIC GREEBLE RESOLUTION
// (docs/specs/FACTORY_LIGHTING_RERENDER.md §1.3 — Task 4)
//
// A "slot" is one rooftop greeble or one facade zone's content, resolved once inside
// `staticVisual` (below): a static-only greeble (8 of 13 across both files — see the spec's
// §1.1 table) gets its final JSX computed immediately and cached as `rendered`; one of the 5
// lighting-dependent greebles gets only its geometry computed (`layout`), paired with the
// `paint` function that turns it into JSX fresh on every render. `ROOFTOP_LAYOUT_PAINT`/
// `FACADE_LAYOUT_PAINT`'s own key sets (Tasks 2-3) are how this tells the two cases apart —
// a greeble type present in one of those maps is dynamic; absent, it's static.
// ========================================

type GreebleSlot =
  | { rendered: GreebleElement | null }
  | { layout: unknown; paint: (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null };

function resolveGreebleSlot<T extends string>(
  type: T | undefined,
  renderers: Record<T, GreebleRenderer>,
  layoutPaint: Partial<Record<T, {
    compute: (ctx: GreebleRendererContext) => unknown;
    paint: (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null;
  }>>,
  layoutCtx: GreebleRendererContext,
): GreebleSlot {
  if (!type) return { rendered: null };
  const dynamic = layoutPaint[type];
  if (dynamic) return { layout: dynamic.compute(layoutCtx), paint: dynamic.paint };
  return { rendered: renderers[type](layoutCtx) };
}

function paintSlot(slot: GreebleSlot, paintCtx: GreebleRendererContext): GreebleElement | null {
  return 'rendered' in slot ? slot.rendered : slot.paint(slot.layout, paintCtx);
}

/** One facade zone's static geometry: its vertical bounds (undefined when there are no belt
 *  courses — a single zone spanning the whole facade) and its resolved greeble slot. */
interface FacadeZoneStatic {
  zoneY: number | undefined;
  zoneHeight: number | undefined;
  slot: GreebleSlot;
}

// ========================================
// COMPONENT
// ========================================

interface FactoryProps {
  actor: Actor;
}

/**
 * The building's bubbles are NOT rendered here any more (roadmap 17.2.5): they live in
 * `BubbleLayer`, a scene layer of their own, so their per-frame transform writes stop repainting
 * every static factory in this layer. See `factoryBubbleProps.ts` for the vent derivation.
 */
const FactoryInner: React.FC<FactoryProps> = ({ actor }) => {
  // Everything below is actor-derived and fixed for the factory's lifetime (per-instance
  // config fields are all documented "read-only after spawn" — see Actor.ts) — computed once
  // per mount, never recomputed by the once/sec lighting tick that drives the render below.
  // docs/specs/FACTORY_LIGHTING_RERENDER.md §1.3 (backlog item 21).
  const staticVisual = useMemo(() => {
    const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
    const district = actor.config?.district ?? 'dense';
    const rowCfg = getRecipeRow(district, row);
    const available = rowCfg?.variants;
    const config = selectVariantFromSeed(actor.id, actor.position.x, row, available);

    const sizeRange = VARIANT_CONF[config.variant].sizeRange;
    const { width, height } = calcSilhouetteSize(config.noiseValue, sizeRange);

    const hueShift = actor.config?.hueShift ?? 0;
    const satShift = actor.config?.satShift ?? 0;
    const shift = { hueShift, satShift };
    const frontCornerX = config.frontCornerX;

    // Per-building phase offset (0..FLICKER_PERIOD-1) staggers window rerolls
    // across FLICKER_PERIOD consecutive measures so no two buildings re-render
    // in the same frame at an epoch boundary.
    const buildingSeed = hashActorId(actor.id);
    const buildingPhase = buildingSeed % FLICKER_PERIOD;

    // Pre-shift the palette so all greebles (roof + facade) share the
    // building's per-instance hue/sat variation.
    const rawColors = VARIANT_CONF[config.variant].colors;
    const shiftedColors = {
      body: shiftHSL(rawColors.body, shift),
      accent: shiftHSL(rawColors.accent, shift),
      greeble: shiftHSL(rawColors.greeble, shift),
      illuminated: shiftHSL(rawColors.illuminated, shift),
    };

    // Actual pixel dimensions after actor scale is applied.
    // The scale group inside multiplies by (scaleX/Y ?? 1), so rooftop greebles —
    // which render outside that group — must use these values, not bare width/height.
    const actualWidth = width * (actor.scaleX ?? 1);
    const actualHeight = height * (actor.scaleY ?? 1);

    // Layout-only context: lighting fields carry dummy defined values, never read for their
    // actual value by any layout function — but computePitchedRoofLayout/computeCrownSpireLayout
    // both branch on eastLMultiplier/westLMultiplier's *definedness* (shaded vs. unshaded
    // fallback shape), and a real Factory always has real lighting at paint time, so this must
    // signal "defined" here too or every dynamic rooftop greeble would silently freeze on the
    // unshaded fallback shape forever (caught by Factory.test.tsx's own pitchedRoof/crownSpire
    // lighting-changes assertions during this task's GREEN step). Static-only renderers get
    // their final JSX computed right here too — they never read a lighting field at all
    // (spec §1.1), so the dummy values are inert for them either way.
    const rooftopLayoutCtx: GreebleRendererContext = {
      buildingWidth: actualWidth,
      buildingHeight: actualHeight,
      roofY: 1,
      seed: buildingSeed,
      colors: shiftedColors,
      lMultiplier: 1,
      eastLMultiplier: 1,
      westLMultiplier: 1,
      frontCornerX: (frontCornerX / 100) * actualWidth,
    };
    const rooftopSlot = resolveGreebleSlot<RooftopGreeble>(
      actor.config?.rooftopGreeble, ROOFTOP_RENDERERS, ROOFTOP_LAYOUT_PAINT, rooftopLayoutCtx,
    );

    // Facade: belt courses + window zones. Zone bounds/seeds and each zone's resolved
    // greeble slot are static geometry; only the fills applied at paint time are
    // lighting-dependent (§1.3).
    const beltCourseCount = actor.config?.beltCourseCount ?? 0;
    const facadeGreeble = actor.config?.facadeGreeble;
    const facadeZones: FacadeZoneStatic[] = [];
    const beltSeparatorYs: number[] = [];

    if (facadeGreeble) {
      const baseFacadeLayoutCtx: GreebleRendererContext = {
        buildingWidth: width,
        buildingHeight: height,
        roofY: 1,
        seed: buildingSeed,
        colors: shiftedColors,
        lMultiplier: 1,
        frontCornerX,
      };
      if (beltCourseCount === 0) {
        // No belt courses — windows span full facade height
        facadeZones.push({
          zoneY: undefined,
          zoneHeight: undefined,
          slot: resolveGreebleSlot<FacadeGreeble>(facadeGreeble, FACADE_RENDERERS, FACADE_LAYOUT_PAINT, baseFacadeLayoutCtx),
        });
      } else {
        // Divide facade into (beltCourseCount + 1) window zones separated by belt rects
        const totalBeltH = beltCourseCount * BELT_H;
        const zoneH = (100 - totalBeltH) / (beltCourseCount + 1);
        for (let i = 0; i <= beltCourseCount; i++) {
          const zoneY = i * (zoneH + BELT_H);
          const zoneLayoutCtx: GreebleRendererContext = {
            ...baseFacadeLayoutCtx,
            zoneY,
            zoneHeight: zoneH,
            // independent seed per zone for varied window patterns
            seed: buildingSeed + 1000 * (i + 1),
          };
          facadeZones.push({
            zoneY,
            zoneHeight: zoneH,
            slot: resolveGreebleSlot<FacadeGreeble>(facadeGreeble, FACADE_RENDERERS, FACADE_LAYOUT_PAINT, zoneLayoutCtx),
          });
          if (i < beltCourseCount) beltSeparatorYs.push(zoneY + zoneH);
        }
      }
    }

    return {
      config, width, height, frontCornerX, buildingSeed, buildingPhase, shiftedColors,
      actualWidth, actualHeight, rooftopSlot, facadeGreeble, beltCourseCount, facadeZones,
      beltSeparatorYs,
    };
  }, [
    actor.id, actor.position.x, actor.config?.row, actor.config?.district, actor.config?.hueShift, actor.config?.satShift,
    actor.config?.rooftopGreeble, actor.config?.facadeGreeble, actor.config?.beltCourseCount,
    actor.scaleX, actor.scaleY,
  ]);

  const {
    config, width, height, frontCornerX, buildingSeed, buildingPhase, shiftedColors,
    actualWidth, actualHeight, rooftopSlot, facadeGreeble, beltCourseCount, facadeZones,
    beltSeparatorYs,
  } = staticVisual;

  // Everything below is cheap and recomputed every render, in step with the once/sec tick.

  // Resolve east/west lightness multipliers:
  // debug preset overrides the live cycle (useful for visual testing).
  //
  // Derive lightMeasure from the active locale's local time so building
  // lighting tracks Attenuation Style day/night, not the audio transport position.
  // activeLocaleLocalTime is a 0..24 float written by AttenuationStyleView every second.
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
  const lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES;
  // flickerEpoch: phased per building so window rerolls are spread across
  // FLICKER_PERIOD consecutive measures rather than all firing at once.
  const flickerEpoch = Math.floor((lightMeasure + buildingPhase) / FLICKER_PERIOD);

  const preset = DEBUG_LIGHTING_PRESET ? LIGHTING_PRESETS[DEBUG_LIGHTING_PRESET] : null;

  // Map the quantised `lightMeasure` (0..dayLength-1) into the 0..95 cycle
  // expected by `getLighting`. This keeps the relative sun position correct
  // even when `dayLengthMeasures` is changed from the default 96.
  const eastLMultiplier = (() => {
    if (preset) return preset.east;
    const cycleMeasure = lightMeasure % DAY_CYCLE_MEASURES;
    return getLighting(cycleMeasure).eastL;
  })();
  const westLMultiplier = (() => {
    if (preset) return preset.west;
    const cycleMeasure = lightMeasure % DAY_CYCLE_MEASURES;
    return getLighting(cycleMeasure).westL;
  })();

  const nightDepth = getNightDepth(eastLMultiplier, westLMultiplier);
  /** Average used for elements spanning the full roof width */
  const roofLMultiplier = (eastLMultiplier + westLMultiplier) / 2;

  // Apply lightness multipliers to body color using already-shifted palette
  const eastFill = applyColorShift(shiftedColors.body, { hueShift: 0, satShift: 0 }, eastLMultiplier);
  const westFill = applyColorShift(shiftedColors.body, { hueShift: 0, satShift: 0 }, westLMultiplier);

  const transform = bottomAnchorTransform(actor, height);
  const safeId = String(actor.id).replace(/[^a-zA-Z0-9-_]/g, '-');
  const bodyClipId = `body-clip-${safeId}`;
  const westClipId = `west-clip-${safeId}`;

  const rooftopPaintCtx: GreebleRendererContext = {
    buildingWidth: actualWidth,
    buildingHeight: actualHeight,
    roofY: 1,
    seed: buildingSeed,
    colors: shiftedColors,
    lMultiplier: roofLMultiplier,
    eastLMultiplier,
    westLMultiplier,
    frontCornerX: (frontCornerX / 100) * actualWidth,
    nightDepth,
    flickerEpoch,
  };
  const rooftopElement = paintSlot(rooftopSlot, rooftopPaintCtx);

  // ----------------------------------------
  // Facade: belt courses + window zones
  // ----------------------------------------
  let facadeContent: React.ReactElement | null = null;
  let beltContent: React.ReactElement | null = null;
  if (facadeGreeble) {
    const makeZonePaintCtx = (zone: FacadeZoneStatic): GreebleRendererContext => ({
      buildingWidth: width,
      buildingHeight: height,
      roofY: 1,
      seed: buildingSeed,
      colors: shiftedColors,
      lMultiplier: roofLMultiplier,
      eastLMultiplier,
      westLMultiplier,
      frontCornerX,
      zoneY: zone.zoneY,
      zoneHeight: zone.zoneHeight,
      nightDepth,
      flickerEpoch,
    });

    if (beltCourseCount === 0) {
      // No belt courses — windows span full facade height
      facadeContent = paintSlot(facadeZones[0].slot, makeZonePaintCtx(facadeZones[0]));
    } else {
      const accentBase = shiftedColors.accent;
      const beltAccent = { ...accentBase, l: clamp(accentBase.l + 5, 0, 100) };
      const noShift = { hueShift: 0, satShift: 0 };
      const eastBeltFill = applyColorShift(beltAccent, noShift, eastLMultiplier);
      const westBeltFill = applyColorShift(beltAccent, noShift, westLMultiplier);

      const zoneElements: React.ReactElement[] = [];
      facadeZones.forEach((zone, i) => {
        const zoneEl = paintSlot(zone.slot, makeZonePaintCtx(zone));
        if (zoneEl) {
          zoneElements.push(<React.Fragment key={`zone-${i}`}>{zoneEl}</React.Fragment>);
        }
      });
      const beltElements: React.ReactElement[] = beltSeparatorYs.map((by, i) => (
        // Belt separators: left rect = west face, right rect = east face
        <React.Fragment key={`belt-${i}`}>
          <rect x={0} y={by} width={frontCornerX} height={BELT_H} fill={westBeltFill} />
          <rect x={frontCornerX} y={by} width={100 - frontCornerX} height={BELT_H} fill={eastBeltFill} />
        </React.Fragment>
      ));
      facadeContent = <>{zoneElements}</>;
      beltContent = <>{beltElements}</>;
    }
  }

  return (
    <>
      <g
        transform={transform}
        data-factory-type={config.variant}
        data-rooftop-greeble={actor.config?.rooftopGreeble ?? 'none'}
        data-facade-greeble={actor.config?.facadeGreeble ?? 'none'}
      >
        <defs>
          {/* Full body clip — keeps facade greebles inside building bounds */}
          <clipPath id={bodyClipId}>
            <rect x="2" y="2" width="96" height="96" />
          </clipPath>
          {/* Right-face clip (x ≥ frontCornerX) — left/west is the base rect */}
          <clipPath id={westClipId}>
            <rect x={frontCornerX} y={0} width={100 - frontCornerX} height={100} />
          </clipPath>
        </defs>

        <g transform={`scale(${(width * (actor.scaleX ?? 1)) / 100}, ${(height * (actor.scaleY ?? 1)) / 100})`}>
          {/* Body: base rect = left (west) face; overlay clipped to right (east) face */}
          {/* No CSS transition on these fills (roadmap 17.2.5): a running `fill` transition
              style-invalidates its element every frame, and with lightness stepping every ~2 s
              some fill was always mid-transition — the whole scene repainted at idle. */}
          <rect x="0" y="0" width="100" height="100" fill={westFill} />
          <g clipPath={`url(#${westClipId})`}>
            <rect x="0" y="0" width="100" height="100" fill={eastFill} />
          </g>
          {/* Facade greebles clipped to body bounds */}
          <g clipPath={`url(#${bodyClipId})`}>{facadeContent}</g>
          {/* Belt separators rendered outside the body clip so they span full width */}
          {beltContent}
        </g>
        {/* rooftop greeble rendered outside scaled group so it's not clipped */}
        {rooftopElement}
      </g>
      {/* end scaled/positioned factory group */}
    </>
  );
};

/**
 * Factory building component. Wrapped in React.memo because factory actors
 * are static after spawn — prevents re-renders driven by robot state updates.
 */
export const Factory = React.memo(FactoryInner);
export default Factory;
