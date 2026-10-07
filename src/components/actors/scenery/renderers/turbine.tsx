import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 turbine row)
// ========================================

const POST_W = 14;
const NACELLE_W = 68;
const NACELLE_H = 24;
/** "hub r 11 `shell.highlight`". */
const HUB_R = 11;
const HUB_LIGHT_R = 4;
/** "two 12-wide blades of `2R`". */
const BLADE_W = 12;

/**
 * Turbine (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a post, a nacelle, and two blades forming
 * one `2R`-long rotor — a single `rotate(45 …)` group around the hub, the 45° grid
 * `sceneryTestHelpers.ts`'s `assertNinetyFortyFive` exempts by construction. Static (no lit
 * motion), structural (§1.8) — fixed `body.shadow`/`shell.highlight` tones, no stored shift.
 */
export const turbine: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.turbine;
  if (!p) return <g data-scenery="turbine" />;
  const { postH, bladeR } = p;

  const avgL = (eastL + westL) / 2;
  const steelFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, avgL * cap);
  const hubFill = applyColorShift(colorTheme.shell.highlight, NO_SHIFT, avgL * cap);

  const postTop = y - postH;
  const hubX = x;
  const hubY = postTop - NACELLE_H;

  return (
    <g data-scenery="turbine">
      <rect data-turbine="post" x={x - POST_W / 2} y={postTop} width={POST_W} height={postH} fill={steelFill} />
      <rect data-turbine="nacelle" x={x - NACELLE_W / 2} y={hubY} width={NACELLE_W} height={NACELLE_H} fill={steelFill} />
      <g transform={`rotate(45 ${hubX} ${hubY})`}>
        <rect data-turbine="blade" x={hubX - BLADE_W / 2} y={hubY - bladeR} width={BLADE_W} height={bladeR} fill={steelFill} />
        <rect data-turbine="blade" x={hubX - BLADE_W / 2} y={hubY} width={BLADE_W} height={bladeR} fill={steelFill} />
      </g>
      <circle data-turbine="hub" cx={hubX} cy={hubY} r={HUB_R} fill={hubFill} />
      <circle data-turbine="hub-light" cx={hubX} cy={hubY} r={HUB_LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
    </g>
  );
};
