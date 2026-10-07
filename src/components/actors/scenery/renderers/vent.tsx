import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import { ventSteps } from '../sceneryParams';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 vent row)
// ========================================

/** "shadowDepth x 1.3" — the stepped cone's own lightness boost before the lighting multiply. */
const BODY_LIGHTNESS_MULT = 1.3;
/** "mouth circle r 0.45 w_top". */
const MOUTH_R_FRAC = 0.45;
/** "opacity 0.5 + 0.4 nd". */
const MOUTH_OPACITY_BASE = 0.5;
const MOUTH_OPACITY_ND_SCALE = 0.4;
/** "plume ellipses opacity 0.06 / 0.03 (static)" — the inner (closer to the mouth) and outer plume. */
const PLUME_OPACITY_INNER = 0.06;
const PLUME_OPACITY_OUTER = 0.03;
const PLUME_INNER_RX_FRAC = 0.6;
const PLUME_INNER_RY_FRAC = 0.3;
const PLUME_OUTER_RX_FRAC = 0.9;
const PLUME_OUTER_RY_FRAC = 0.45;
const PLUME_INNER_OFFSET = 10;
const PLUME_OUTER_OFFSET = 24;

/**
 * Vent (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9/§1.11): a stepped cone narrowing toward its
 * mouth (`ventSteps`, shared with `getActorBubbleProps` so the real `BubbleStream` mouth matches
 * this drawing exactly), two static decorative plume ellipses, and a lit mouth glow whose
 * opacity (not just lightness) rises with `nightDepth`. Structural (§1.8) — fixed `shadowDepth`
 * tone, no stored shift.
 */
export const vent: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.vent;
  if (!p) return <g data-scenery="vent" />;

  const steps = ventSteps(p);
  const avgL = (eastL + westL) / 2;
  const bodyFill = applyColorShift(colorTheme.shadowDepth, NO_SHIFT, avgL * cap * BODY_LIGHTNESS_MULT);
  const plumeFill = applyColorShift(colorTheme.glass.base, NO_SHIFT, avgL * cap);

  let top = y;
  const rects = steps.map((step) => {
    top -= step.height;
    return { x: x - step.width / 2, y: top, width: step.width, height: step.height };
  });
  const mouthY = top;
  const topWidth = steps[steps.length - 1].width;
  const mouthR = MOUTH_R_FRAC * topWidth;
  const mouthOpacity = MOUTH_OPACITY_BASE + MOUTH_OPACITY_ND_SCALE * nightDepth;

  return (
    <g data-scenery="vent">
      {rects.map((r, i) => (
        <rect key={i} data-vent="step" x={r.x} y={r.y} width={r.width} height={r.height} fill={bodyFill} />
      ))}
      <ellipse
        data-vent="plume"
        cx={x}
        cy={mouthY - PLUME_INNER_OFFSET}
        rx={topWidth * PLUME_INNER_RX_FRAC}
        ry={topWidth * PLUME_INNER_RY_FRAC}
        fill={plumeFill}
        opacity={PLUME_OPACITY_INNER}
      />
      <ellipse
        data-vent="plume"
        cx={x}
        cy={mouthY - PLUME_OUTER_OFFSET}
        rx={topWidth * PLUME_OUTER_RX_FRAC}
        ry={topWidth * PLUME_OUTER_RY_FRAC}
        fill={plumeFill}
        opacity={PLUME_OPACITY_OUTER}
      />
      <circle data-vent="mouth-glow" cx={x} cy={mouthY} r={mouthR} fill={lamp(colorTheme.alert.powered, nightDepth)} opacity={mouthOpacity} />
    </g>
  );
};
