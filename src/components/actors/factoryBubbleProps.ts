import Alea from 'alea';

import type { Actor } from '../../types/Actor';
import { selectVariantFromSeed, VARIANT_CONF, isBubbleEligible } from './factoryVariants';
import { getRecipeRow, DEFAULT_FACTORY_ROW } from '../../systems/factoryPlacementSystem';
import type { DistrictRow } from '../../systems/districtRecipes';
import { calcSilhouetteSize } from './silhouetteUtils';
import { shiftHSL } from '../../utils/colorUtils';

/**
 * Everything a building's `BubbleStream` needs, derived from the actor alone (roadmap 17.2.5).
 *
 * Bubbles used to be rendered by `Factory.tsx` itself, inside the one scene `<svg>`, so every
 * bubble's GSAP transform write repainted the whole static factory skyline around it. They now live
 * in their own compositor layer (`BubbleLayer`), which means the vent position, seed, tint and depth
 * are computed here, once per actor, rather than inside Factory's render.
 */
export interface FactoryBubbleProps {
  actorId: string;
  /** Vent x in scene coordinates — seeded to 20–80 % across the facade. */
  ventX: number;
  /** Vent y in scene coordinates — the roofline. */
  ventY: number;
  /** Deterministic seed for sizing/timing variation (the full-id hash). */
  seed: number;
  /** False while the building is offline — the stream rewinds and pauses. */
  isActive: boolean;
  /** Hue of the building's (shifted) body colour, mixed faintly into the bubble fill. */
  bodyHue: number;
  /** foreground 1, midground 0.5, background 1/3 — scales radius, wobble and minimum rise. */
  depthScale: number;
}

/**
 * Deterministic pseudo-random integer derived from the full actor id, used as the building seed.
 * Real factory ids all share a `factory-{index}-` prefix (see `factoryPlacementSystem.ts`'s
 * `generateFactoryId`), so seeding from only a fixed-length prefix — the previous
 * `parseInt(id.slice(0, 8), 16)` — landed on the same value for every building. Reuses the same
 * `Alea` PRNG every other id-seeded value in this codebase goes through (e.g.
 * `factoryVariants.ts`'s `selectVariantFromSeed`) rather than a bespoke hash.
 */
export function hashActorId(id: string): number {
  return Math.floor(Alea(id)() * 0x100000000);
}

/** Bubble depth scale from the row's depth label: foreground 1, midground 0.5, background 1/3,
 *  unknown (no recipe row, e.g. an out-of-range row) 1. */
export function bubbleDepthScaleForRow(depth: DistrictRow['depth'] | undefined): number {
  return depth === 'background' ? 1 / 3 : depth === 'midground' ? 0.5 : 1;
}

/** The bubble props for a factory actor, or null when its purpose has no vent. */
export function getFactoryBubbleProps(actor: Actor): FactoryBubbleProps | null {
  if (!isBubbleEligible(actor.config?.purpose)) return null;

  // Same silhouette derivation as Factory.tsx's staticVisual — the vent must sit on the roof the
  // building actually draws.
  const district = actor.config?.district ?? 'dense';
  const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
  const rowCfg = getRecipeRow(district, row);
  const config = selectVariantFromSeed(actor.id, actor.position.x, row, rowCfg?.variants);
  const { width, height } = calcSilhouetteSize(config.noiseValue, VARIANT_CONF[config.variant].sizeRange);
  const actualWidth = width * (actor.scaleX ?? 1);
  const actualHeight = height * (actor.scaleY ?? 1);

  const buildingSeed = hashActorId(actor.id);
  const ventXnorm = (buildingSeed % 60) + 20; // 20–80 % of normalised width

  const shift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const bodyHue = shiftHSL(VARIANT_CONF[config.variant].colors.body, shift).h;

  return {
    actorId: actor.id,
    ventX: actor.position.x + (ventXnorm / 100) * actualWidth,
    ventY: actor.position.y - actualHeight,
    seed: buildingSeed,
    isActive: !(actor.config?.isOffline ?? false),
    bodyHue,
    depthScale: bubbleDepthScaleForRow(rowCfg?.depth),
  };
}
