import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift, shiftHSL } from '../../../../utils/colorUtils';
import type { SceneryRenderer } from '../sceneryTypes';
import { GemRing } from '../../material/GemRing';
import { WORLD_GEM, ringFacets, worldBevel, worldLightVector } from '../../material/worldGemMaterial';

/** Cap rail thickness, scene units (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 wall row). */
const CAP_RAIL_H = 5;

const NO_SHIFT = { hueShift: 0, satShift: 0 };

/**
 * Two faces, no lit element (§1.9 table). The body hue/sat shift is folded at placement time
 * (roadmap Phase 42 Task 13, `foldBodyShift`) into `actor.config.hueShift`/`.satShift` — the
 * same stored-shift pattern factories use — rather than read fresh from `params.wall` on every
 * render, so a Sector Settings retransmit (`recolorActorsForAttenuationStyle`) can recolor it.
 */
export const wall: SceneryRenderer = ({ actor, params, cap, eastL, westL }) => {
  const { x, y } = actor.position;
  const p = params.wall;
  if (!p) return <g data-scenery="wall" />;

  const half = p.w / 2;
  const bodyShift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const westFill = applyColorShift(colorTheme.body.base, bodyShift, westL * cap);
  const eastFill = applyColorShift(colorTheme.body.base, bodyShift, eastL * cap);
  const railFill = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, ((eastL + westL) / 2) * cap);

  // The world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5): the full rect, top and bottom split
  // at the centre line so each half takes its own face's light. The cap rail moves inside it,
  // inset by the depth from the top and both sides, or the ring's top facet would bury it.
  const d = WORLD_GEM.massScenery ? worldBevel(p.w, p.h) : 0;
  const ring = ringFacets(
    [[x - half, y - p.h], [x + half, y - p.h], [x + half, y], [x - half, y]],
    d,
    worldLightVector(eastL, westL),
    (midX) => (midX < x ? westL : eastL) * cap,
    shiftHSL(colorTheme.body.base, bodyShift),
    { splitX: x },
  );

  return (
    <g data-scenery="wall">
      <rect x={x - half} y={y - p.h} width={half} height={p.h} fill={westFill} />
      <rect x={x} y={y - p.h} width={half} height={p.h} fill={eastFill} />
      <rect x={x - half + d} y={y - p.h + d} width={p.w - 2 * d} height={CAP_RAIL_H} fill={railFill} />
      <GemRing facets={ring} />
    </g>
  );
};
