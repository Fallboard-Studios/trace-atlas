import type { ReactElement } from 'react';
import type { HSL } from '../../../utils/colorUtils';
import type { GemPoint } from '../../robot/gem/polygon';

// ========================================
// GREEBLE TYPE DEFINITIONS
// ========================================

/**
 * Rooftop greeble variants used to decorate factory roofs.
 * These are referenced in variant configuration and later mapped to
 * renderer functions.
 */
export type RooftopGreeble =
  | 'machinery'
  | 'antennae'
  | 'waterTower'
  | 'cupola'
  | 'crownSpire'
  | 'pitchedRoof'
  | 'steppeRoof'
  | 'pipesValves'; // decorative pipes and valve clusters

/**
 * Facade greeble variants used on the sides of buildings.
 */
export type FacadeGreeble =
  | 'squareWindows'
  | 'wideWindows'
  | 'tallWindows'
  | 'beltCourse'
  | 'pipesValves'; // decorative pipe/valve runs along facade edges

/**
 * Context object passed to every greeble renderer.  Contains the dimensions
 * of the building, a deterministic seed derived from the building's actor
 * ID, and the current color palette plus a lightness multiplier (for
 * day/night and atmospheric effects).
 */
export interface GreebleRendererContext {
  buildingWidth: number;
  buildingHeight: number;
  roofY: number; // y coordinate of the roof top in viewBox space (0-100)
  seed: number; // used for deterministic randomness inside renderers
  colors: {
    body: HSL;
    accent: HSL;
    greeble: HSL;
    illuminated: HSL;
  };
  lMultiplier: number; // 0..1 (plus >1 for brightness) applied to lightness
  /**
   * Optional vertical zone constraints (normalized 0-100 SVG coords).
   * When provided, facade renderers confine content to this vertical slice
   * rather than spanning the full building height.
   */
  zoneY?: number;      // top of the zone in normalized coords
  zoneHeight?: number; // height of the zone in normalized coords
  /**
   * East/west facade split support (prep for day/night).
   * Facade renderers use these to apply different lightness multipliers to
   * windows on the lit vs shaded side of the building.
   */
  eastLMultiplier?: number; // lightness multiplier for x >= frontCornerX (right / east face)
  westLMultiplier?: number; // lightness multiplier for x <  frontCornerX (left / west face)
  frontCornerX?: number;    // x split point in normalized 0-100 coords
  /**
   * When set, overrides the per-face unitSize calculation so both the east
   * and west grids use identical window dimensions.
   */
  fixedUnitSize?: number;
  /**
   * Darkness scalar (0 = noon, 1 = midnight) used to decide what fraction
   * of windows should appear illuminated. Derived from `getLighting` via
   * `getNightDepth`. When absent, no windows are lit.
   */
  nightDepth?: number;
  /**
   * Epoch counter that increments every `FLICKER_PERIOD` measures.
   * Changing this value re-rolls each window’s lit state independently,
   * producing the occasional on/off flicker without touching the LCG draws
   * that control window existence and opacity.
   */
  flickerEpoch?: number;
  /**
   * The hour's unit light vector (`worldLightVector`, docs/specs/WORLD_GEM_MATERIAL.md §1.4):
   * set by Factory.tsx's rooftop PAINT context only, never its layout context. When present, the
   * rooftop block greebles draw their world gem ring; absent, they render exactly as before.
   */
  light?: GemPoint;
}

/**
 * The concrete return type of every greeble renderer.  Using
 * `Record<string, unknown>` for the props parameter keeps TypeScript
 * strict-mode happy while still allowing callers to index into `.props`
 * (React 19 / TS 5.8+ changed the default to `props: unknown`).
 */
export type GreebleElement = ReactElement<Record<string, unknown>>;

/**
 * A renderer function draws a single greeble given the rendering context.
 * It may return `null` if it decides no element should be drawn.
 */
export type GreebleRenderer = (
  ctx: GreebleRendererContext,
) => GreebleElement | null;
