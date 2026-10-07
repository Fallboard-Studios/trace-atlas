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
export const PYLON_TOP_HALF_WIDTH = 4;
const HEAD_GEM_W = 26;
const HEAD_GEM_H = 18;
const HEAD_GEM_OFFSET = 14;
const FALLBACK_HEAD_R = 5;
const FALLBACK_HEAD_OFFSET = 6;

/** The three cross-arms, bottom to top, as spans at their top edge — shared with the work anchors. */
export function pylonArms(x: number, y: number, w: number, h: number): { x0: number; x1: number; y: number }[] {
  return ARM_STEPS.map((i) => {
    const t = i / 4;
    const halfWidth = (w / 2) * (1 - t) + PYLON_TOP_HALF_WIDTH;
    return { x0: x - halfWidth - ARM_OVERHANG, x1: x + halfWidth + ARM_OVERHANG, y: y - h * t };
  });
}

/** The tapered tower's top edge, left to right: base corner, step-up, the narrow top, step-down. */
export function pylonTowerTop(x: number, y: number, w: number, h: number): { x: number; y: number }[] {
  const stepUpY = y - (h - (w / 2 - PYLON_TOP_HALF_WIDTH));
  return [
    { x: x - w / 2, y: stepUpY },
    { x: x - PYLON_TOP_HALF_WIDTH, y: y - h },
    { x: x + PYLON_TOP_HALF_WIDTH, y: y - h },
    { x: x + w / 2, y: stepUpY },
  ];
}

/** The head's centre: the gem head, or the plain indicator when gem accents are off. */
export function pylonHeadCentre(x: number, y: number, h: number, gems: boolean): { x: number; y: number } {
  return { x, y: y - h - (gems ? HEAD_GEM_OFFSET : FALLBACK_HEAD_OFFSET) };
}

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

  const towerPoints = [{ x: x - w / 2, y }, ...pylonTowerTop(x, y, w, h), { x: x + w / 2, y }]
    .map((pt) => `${pt.x},${pt.y}`)
    .join(' ');
  const head = pylonHeadCentre(x, y, h, gems);

  return (
    <g data-scenery="pylon">
      <polygon points={towerPoints} fill={steel} />
      {pylonArms(x, y, w, h).map((arm, i) => (
        <rect key={i} x={arm.x0} y={arm.y} width={arm.x1 - arm.x0} height={ARM_THICKNESS} fill={steel} />
      ))}
      {gems ? (
        <GemShape
          cx={head.x}
          cy={head.y}
          w={HEAD_GEM_W}
          h={HEAD_GEM_H}
          base={accentBase(accent.primary)}
          lit
          eastL={eastL}
          westL={westL}
          nightDepth={nightDepth}
        />
      ) : (
        <circle cx={head.x} cy={head.y} r={FALLBACK_HEAD_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
      )}
    </g>
  );
};
