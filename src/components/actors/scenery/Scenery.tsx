import React, { useMemo } from 'react';

import type { Actor, SceneryKind } from '../../../types/Actor';
import { getRecipeRow, deriveAsAccentPair } from '../../../systems/factoryPlacementSystem';
import { ROW_L_CAP, DERELICT_L_CAP } from '../../../constants/sceneDepth';
import { getLighting, getNightDepth, DAY_CYCLE_MEASURES } from '../../../utils/lightingUtils';
import { useUIStore } from '../../../stores/uiStore';
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../../../stores/attenuationStyleStore';
import { getAttenuationStyleNoiseMap } from '../../../utils/noiseMaps';
import type { AccentPair } from '../../../utils/accentLean';
import { deriveSceneryParams } from './sceneryParams';
import type { SceneryRenderer, SceneryContext } from './sceneryTypes';
import { wall } from './renderers/wall';

/**
 * Gem-accent build flag (docs/specs/WORLD_VIEW_DISTRICTS.md §1.10, spec §7 Q4) — removed in
 * roadmap Phase 42 Task 23 if it's never flipped off during D2's gate.
 */
export const SCENERY_GEM_ACCENTS = true;

/**
 * The scenery families lit up for rendering (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8). Growing
 * this registry (one entry per roadmap Phase 42 D2 task) is also what redefines
 * `districts.ts`'s `SHIPPED_SCENERY`, so a row's actor only starts getting placed once its
 * renderer exists here too.
 */
export const SCENERY_RENDERERS: Partial<Record<SceneryKind, SceneryRenderer>> = {
  wall,
};

const NO_ACCENT: AccentPair = { primary: 0, secondary: 0 };

interface SceneryProps {
  actor: Actor;
}

/**
 * Scenery family dispatcher (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8/§4) — reads `config.kind`
 * and hands off to `SCENERY_RENDERERS[kind]`, assembling the same `SceneryContext` every family
 * renderer expects. Memoised like `Factory`: scenery actors are static after spawn.
 */
const SceneryInner: React.FC<SceneryProps> = ({ actor }) => {
  const kind = actor.config?.kind;
  const renderer = kind ? SCENERY_RENDERERS[kind] : undefined;

  const district = actor.config?.district ?? 'dense';
  const row = actor.config?.row ?? 0;
  const depth = getRecipeRow(district, row)?.depth ?? 'foreground';
  const derelict = !!actor.config?.derelict;

  const params = useMemo(() => deriveSceneryParams(actor), [actor]);

  const attenuationStyle = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s));
  const accent = useMemo<AccentPair>(() => {
    if (!attenuationStyle) return NO_ACCENT;
    const asNoiseMap = getAttenuationStyleNoiseMap(attenuationStyle.id, attenuationStyle.name);
    return deriveAsAccentPair(asNoiseMap);
  }, [attenuationStyle]);

  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
  const lightMeasure = (localTime / 24) * DAY_CYCLE_MEASURES;
  const { eastL, westL } = getLighting(lightMeasure % DAY_CYCLE_MEASURES);
  const nightDepth = derelict ? 0 : getNightDepth(eastL, westL);
  const cap = ROW_L_CAP[depth] * (derelict ? DERELICT_L_CAP : 1);

  if (!renderer) return null;

  const ctx: SceneryContext = { actor, params, cap, eastL, westL, nightDepth, accent, gems: SCENERY_GEM_ACCENTS };
  return renderer(ctx);
};

export const Scenery = React.memo(SceneryInner);
export default Scenery;
