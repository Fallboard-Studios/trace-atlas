import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 tether row)
// ========================================

const ANCHOR_W = 36;
const ANCHOR_H = 16;
const LINE_W = 3;
/** The final vertical run always ends here, off the top of the frame. */
const OFF_FRAME_Y = -20;
const FLOAT_W = 9;
const FLOAT_H = 14;
const FLOAT_GAP = 10;
/** "`shell.shadow` × 1.1". */
const STEEL_LIGHTNESS_MULT = 1.1;

/**
 * Tether (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): an anchor, a vertical line, one 45°
 * dog-leg of `|dx|` 40–90 (the same parallelogram-brace shape scaffold.tsx/crane.tsx use), then
 * a vertical run to y = -20 (off frame) — and, on 60% of seeds, a lit float just above the
 * dog-leg. Structural (§1.8) — fixed `shell.shadow` tone, no stored shift.
 */
export const tether: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.tether;
  if (!p) return <g data-scenery="tether" />;
  const { h1, dx, hasFloat } = p;

  const avgL = (eastL + westL) / 2;
  const fill = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, avgL * cap * STEEL_LIGHTNESS_MULT);

  const anchorTop = y - ANCHOR_H;
  const lineTopY = anchorTop - h1;
  const kinkX = x + dx;
  const kinkY = lineTopY - dx;

  const half45 = LINE_W / 2;
  const doglegPoints = [
    `${x - half45},${lineTopY + half45}`,
    `${kinkX - half45},${kinkY + half45}`,
    `${kinkX + half45},${kinkY - half45}`,
    `${x + half45},${lineTopY - half45}`,
  ].join(' ');

  return (
    <g data-scenery="tether">
      <rect data-tether="anchor" x={x - ANCHOR_W / 2} y={anchorTop} width={ANCHOR_W} height={ANCHOR_H} fill={fill} />
      <rect data-tether="line" x={x - half45} y={lineTopY} width={LINE_W} height={anchorTop - lineTopY} fill={fill} />
      <polygon data-tether="dogleg" points={doglegPoints} fill={fill} />
      <rect data-tether="riser" x={kinkX - half45} y={OFF_FRAME_Y} width={LINE_W} height={kinkY - OFF_FRAME_Y} fill={fill} />
      {hasFloat && (
        <ellipse
          data-tether="float"
          cx={kinkX}
          cy={kinkY - FLOAT_GAP}
          rx={FLOAT_W / 2}
          ry={FLOAT_H / 2}
          fill={lamp(colorTheme.alert.powered, nightDepth)}
        />
      )}
    </g>
  );
};
