import type { ReactElement } from 'react';
import type { Actor } from '../../../types/Actor';
import type { AccentPair } from '../../../utils/accentLean';
import type { SceneryParams } from './sceneryParams';

/**
 * Per-render context handed to a scenery family's pure renderer function
 * (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8/§4). Mirrors the information
 * Factory.tsx recomputes every lighting tick, but pre-assembled by
 * `Scenery.tsx` so every renderer sees the same shape.
 */
export interface SceneryContext {
  actor: Actor;
  /** `Alea(actor.id)`-derived parameters for this actor's kind (sceneryParams.ts), computed once. */
  params: SceneryParams;
  /** `ROW_L_CAP[depth] * (derelict ? DERELICT_L_CAP : 1)` — multiply into eastL/westL before applyColorShift. */
  cap: number;
  /** `getLighting(lightMeasure).eastL` — cap-free; the renderer applies `cap` itself. */
  eastL: number;
  /** `getLighting(lightMeasure).westL` — cap-free; the renderer applies `cap` itself. */
  westL: number;
  /** 0 when derelict (§1.6); otherwise `getNightDepth(eastL, westL)`. */
  nightDepth: number;
  /** The active Attenuation Style's accent pair (deriveAsAccentPair), for gem-accented families. */
  accent: AccentPair;
  /** `SCENERY_GEM_ACCENTS` build flag (spec §7 Q4) — gates gem-accented details. */
  gems: boolean;
}

/** A scenery family's renderer: a pure function of the context, per spec §1.8/§4. */
export type SceneryRenderer = (ctx: SceneryContext) => ReactElement;
