import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { GemShape, accentBase } from '../gemShape';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 pylon row)
// ========================================

/** Cross-arm height fractions: ¼, ½, ¾ of the tower's height. */
const ARM_STEPS = [1, 2, 3] as const;
const ARM_THICKNESS = 5;
const ARM_OVERHANG = 14;
/** Half-width of the tower's narrow top (and the taper's flat top edge, 8 wide). */
const TOWER_TOP_HALF_WIDTH = 4;
const HEAD_GEM_W = 26;
const HEAD_GEM_H = 18;
const HEAD_GEM_OFFSET = 14;
const FALLBACK_HEAD_R = 5;
const FALLBACK_HEAD_OFFSET = 6;

/**
 * Pylon (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a tapered steel tower with three cross-arms,
 * topped by a gem head when gem accents are on, or a plain alert indicator when off.
 *
 * The "tapered polygon to an 8-wide top" is a single hexagon, not a free-angle trapezoid: it
 * climbs straight up from the base, then cuts in at exactly 45° to the narrow top, so every edge
 * stays on the §3 grid (the sketch's continuous taper wasn't 45° at every w/h combination).
 */
export const pylon: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth, accent, gems }) => {
  const { x, y } = actor.position;
  const p = params.pylon;
  if (!p) return <g data-scenery="pylon" />;
  const { w, h } = p;

  const m = (eastL + westL) / 2;
  const steel = applyColorShift(colorTheme.body.shadow, NO_SHIFT, m * cap * 1.15);

  const taperRun = w / 2 - TOWER_TOP_HALF_WIDTH;
  const stepUpY = y - (h - taperRun);
  const towerPoints = [
    `${x - w / 2},${y}`,
    `${x - w / 2},${stepUpY}`,
    `${x - TOWER_TOP_HALF_WIDTH},${y - h}`,
    `${x + TOWER_TOP_HALF_WIDTH},${y - h}`,
    `${x + w / 2},${stepUpY}`,
    `${x + w / 2},${y}`,
  ].join(' ');

  return (
    <g data-scenery="pylon">
      <polygon points={towerPoints} fill={steel} />
      {ARM_STEPS.map((i) => {
        const t = i / 4;
        const halfWidth = (w / 2) * (1 - t) + TOWER_TOP_HALF_WIDTH;
        return (
          <rect
            key={i}
            x={x - halfWidth - ARM_OVERHANG}
            y={y - h * t}
            width={halfWidth * 2 + ARM_OVERHANG * 2}
            height={ARM_THICKNESS}
            fill={steel}
          />
        );
      })}
      {gems ? (
        <GemShape
          cx={x}
          cy={y - h - HEAD_GEM_OFFSET}
          w={HEAD_GEM_W}
          h={HEAD_GEM_H}
          base={accentBase(accent.primary)}
          lit
          eastL={eastL}
          westL={westL}
          nightDepth={nightDepth}
        />
      ) : (
        <circle cx={x} cy={y - h - FALLBACK_HEAD_OFFSET} r={FALLBACK_HEAD_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
      )}
    </g>
  );
};
