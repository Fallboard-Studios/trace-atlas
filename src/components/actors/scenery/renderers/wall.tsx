import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import type { SceneryRenderer } from '../sceneryTypes';

/** Cap rail thickness, scene units (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 wall row). */
const CAP_RAIL_H = 5;

const NO_SHIFT = { hueShift: 0, satShift: 0 };

/**
 * Structural tone only in this task (roadmap Phase 42 Task 11) — the body hue/sat shift comes
 * from `params.wall` (fresh per render via `Alea(actor.id)`), not a placement-stored shift; Task 13
 * folds it into `foldBodyShift`/`config.hueShift`/`config.satShift` like every other body-bearing
 * family. Two faces, no lit element (§1.9 table).
 */
export const wall: SceneryRenderer = ({ actor, params, cap, eastL, westL }) => {
  const { x, y } = actor.position;
  const p = params.wall;
  if (!p) return <g data-scenery="wall" />;

  const half = p.w / 2;
  const bodyShift = { hueShift: p.hueShift, satShift: p.satShift };
  const westFill = applyColorShift(colorTheme.body.base, bodyShift, westL * cap);
  const eastFill = applyColorShift(colorTheme.body.base, bodyShift, eastL * cap);
  const railFill = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, ((eastL + westL) / 2) * cap);

  return (
    <g data-scenery="wall">
      <rect x={x - half} y={y - p.h} width={half} height={p.h} fill={westFill} />
      <rect x={x} y={y - p.h} width={half} height={p.h} fill={eastFill} />
      <rect x={x - half} y={y - p.h} width={p.w} height={CAP_RAIL_H} fill={railFill} />
    </g>
  );
};
