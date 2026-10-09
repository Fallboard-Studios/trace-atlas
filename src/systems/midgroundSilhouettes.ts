// ========================================
// midgroundSilhouettes (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.10, Phase 43 Task 32)
// ========================================
// Everything solid drawn between the two robot layers: the midground factories (body and rooftop
// greeble), the midground scenery, the midground pipe bridges and the stepped ground line. A robot
// changes robot layer only where its box overlaps none of these (animation/layerSwitch.ts), so it
// never pops through one. Bubbles, plumes and light (SILHOUETTE_DECORATION) are not silhouette —
// Crawford's call, 2026-10-08.
//
// Every box is measured from the renderer's own output (svgElementExtent) or its own layout
// function, never a copy of its maths; midgroundSilhouettes.test.tsx holds each against the real
// render over the 121-seed grid.

// ========================================
// IMPORTS
// ========================================
import { getRecipeRow } from './factoryPlacementSystem';
import { getTerrainProfile, type Step } from './terrainProfile';
import type { Box } from './stations';
import { factoryGeometry } from '../components/actors/factoryGeometry';
import { hashActorId } from '../components/actors/factoryBubbleProps';
import { ROOFTOP_RENDERERS } from '../components/actors/greebles/rooftopGreebles';
import { pipeBridgeLayout, type BridgeRect } from '../components/actors/scenery/pipeBridgeLayout';
import { SCENERY_GEM_ACCENTS, SCENERY_RENDERERS } from '../components/actors/scenery/Scenery';
import { deriveSceneryParams } from '../components/actors/scenery/sceneryParams';
import { WORLD_BOUNDS } from '../constants/sceneDepth';
import { useLocaleStore } from '../stores/localeStore';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { svgElementExtent, type Extent } from '../utils/svgElementExtent';
import { ActorType, type Actor } from '../types/Actor';

// ========================================
// CONSTANTS
// ========================================
/** Geometry never reads colour: any palette will do. */
const ANY_HSL = { h: 0, s: 0, l: 50 };
const ANY_COLORS = { body: ANY_HSL, accent: ANY_HSL, greeble: ANY_HSL, illuminated: ANY_HSL };

// ========================================
// HELPERS
// ========================================
const shifted = (e: Extent, dx: number, dy: number): Box => ({ x0: e.x0 + dx, y0: e.y0 + dy, x1: e.x1 + dx, y1: e.y1 + dy });

const rectBox = (r: BridgeRect): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.width, y1: r.y + r.height });

/** The depth OceanScene draws the actor at — an unresolvable row isn't drawn in any group. */
const depthOf = (a: Actor) => getRecipeRow(a.config?.district ?? 'dense', a.config?.row ?? -1)?.depth;

/**
 * A factory's body box, then its rooftop greeble's, measured from the greeble renderer with the
 * context Factory.tsx gives it (drawn in the body's translate, outside its scale). A derelict
 * factory's antenna goes dark and Factory.tsx doesn't draw it, so neither is it a silhouette.
 */
function factorySilhouettes(actor: Actor): Box[] {
  const { width, height, frontCornerX, box } = factoryGeometry(actor);
  const type = actor.config?.rooftopGreeble;
  if (!type || (actor.config?.derelict && type === 'antennae')) return [box];
  const buildingWidth = width * (actor.scaleX ?? 1);
  const greeble = svgElementExtent(ROOFTOP_RENDERERS[type]({
    buildingWidth,
    buildingHeight: height * (actor.scaleY ?? 1),
    roofY: 1,
    seed: hashActorId(actor.id),
    colors: ANY_COLORS,
    lMultiplier: 1,
    eastLMultiplier: 1,
    westLMultiplier: 1,
    frontCornerX: (frontCornerX / 100) * buildingWidth,
  }));
  return greeble ? [box, shifted(greeble, box.x0, box.y0)] : [box];
}

/** A scenery actor's drawn box, measured from its family renderer. Empty for an unknown kind. */
function scenerySilhouettes(actor: Actor): Box[] {
  const kind = actor.config?.kind;
  const renderer = kind ? SCENERY_RENDERERS[kind] : undefined;
  if (!renderer) return [];
  const extent = svgElementExtent(renderer({
    actor,
    params: deriveSceneryParams(actor),
    cap: 1,
    eastL: 1,
    westL: 1,
    nightDepth: 1,
    accent: { primary: 0, secondary: 0 },
    gems: SCENERY_GEM_ACCENTS,
  }));
  return extent ? [extent] : [];
}

// ========================================
// API
// ========================================
/** The solid boxes one factory or scenery actor draws, at any depth, in scene units. Pure. */
export function actorSilhouettes(actor: Actor): Box[] {
  if (actor.type === ActorType.FACTORY) return factorySilhouettes(actor);
  if (actor.type === ActorType.SCENERY) return scenerySilhouettes(actor);
  return [];
}

/** The ground line's boxes: each step from its higher end down to the scene's bottom. */
export function groundSilhouettes(ground: readonly Step[]): Box[] {
  return ground.map((s) => ({ x0: s.x0, y0: Math.min(s.y0, s.y1), x1: s.x1, y1: WORLD_BOUNDS.height }));
}

/**
 * Everything solid between the robot layers (spec §1.10): every midground actor's silhouettes,
 * then the midground pipe bridges (bar and post), then the ground. Pure.
 */
export function midgroundSilhouettes(actors: readonly Actor[], ground: readonly Step[]): Box[] {
  const mid = actors.filter((a) => depthOf(a) === 'midground');
  const bridges = pipeBridgeLayout(mid.filter((a) => a.type === ActorType.FACTORY))
    .flatMap(({ bar, post }) => [rectBox(bar), rectBox(post)]);
  return [...mid.flatMap(actorSilhouettes), ...bridges, ...groundSilhouettes(ground)];
}

/** A locale's midground silhouettes, from its actors and its ground. [] for an unknown locale. */
export function getMidgroundSilhouettes(localeId: string): Box[] {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return [];
  const noiseMap = getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y);
  return midgroundSilhouettes(locale.actors, getTerrainProfile(localeId, noiseMap).ground);
}
