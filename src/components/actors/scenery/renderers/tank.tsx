import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift, shiftHSL } from '../../../../utils/colorUtils';
import { DERELICT_SAT } from '../../../../constants/sceneDepth';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 tank row)
// ========================================

/** "45° shoulders of 0.3 w" — the top-corner bevel run, in both x and y. */
const SHOULDER_FRACTION = 0.3;
/** Belt course rects are "5 tall". */
const BELT_HEIGHT = 5;
/** Gauge circle radius is `0.08 w`. */
const GAUGE_R_FRAC = 0.08;
/** Gauge sits at `0.55 h` down from the top. */
const GAUGE_Y_FRAC = 0.55;

/**
 * Tank (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a belted storage cylinder with two bevelled
 * faces split at `corner`, a lit pressure gauge, and a body shift that's folded at placement
 * (roadmap Phase 42 Task 13, `foldBodyShift`) into `actor.config.hueShift`/`.satShift` — the
 * same stored-shift pattern as `wall`/factories — so a retransmit can recolor it.
 *
 * `corner` (0.35–0.65) always lands strictly between the two shoulder zones (0–0.3·w and
 * 0.7·w–w), so the west/east split is always a plain vertical edge, never cutting through a
 * bevel — the two polygons below rely on that.
 */
export const tank: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.tank;
  if (!p) return <g data-scenery="tank" />;
  const { w, h, corner, beltCourses } = p;
  const derelict = !!actor.config?.derelict;

  const bodyShift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const shiftedBody = shiftHSL(colorTheme.shell.shadow, bodyShift);
  // Derelict body saturation is 40% of normal (§1.6) — folded up front like Factory.tsx does,
  // so both faces pick it up for free. The depth cap itself is already folded into `cap` by
  // Scenery.tsx (ctx.cap = ROW_L_CAP[depth] * (derelict ? DERELICT_L_CAP : 1)).
  const bodyColor = derelict ? { ...shiftedBody, s: shiftedBody.s * DERELICT_SAT } : shiftedBody;
  const westFill = applyColorShift(bodyColor, NO_SHIFT, westL * cap);
  const eastFill = applyColorShift(bodyColor, NO_SHIFT, eastL * cap);
  const beltFill = applyColorShift(colorTheme.shell.base, NO_SHIFT, ((eastL + westL) / 2) * cap);

  const top = y - h;
  const shoulder = w * SHOULDER_FRACTION;
  const splitX = x - w / 2 + corner * w;

  const westPoints = [
    `${x - w / 2},${y}`,
    `${x - w / 2},${top + shoulder}`,
    `${x - w / 2 + shoulder},${top}`,
    `${splitX},${top}`,
    `${splitX},${y}`,
  ].join(' ');

  const eastPoints = [
    `${splitX},${top}`,
    `${x + w / 2 - shoulder},${top}`,
    `${x + w / 2},${top + shoulder}`,
    `${x + w / 2},${y}`,
    `${splitX},${y}`,
  ].join(' ');

  const gaugeR = GAUGE_R_FRAC * w;
  const gaugeY = top + GAUGE_Y_FRAC * h;
  const gaugeFill = derelict
    ? applyColorShift(colorTheme.indicator.off, NO_SHIFT, 1)
    : lamp(colorTheme.indicator.powered, nightDepth);

  return (
    <g data-scenery="tank">
      <polygon points={westPoints} fill={westFill} />
      <polygon points={eastPoints} fill={eastFill} />
      {Array.from({ length: beltCourses }, (_, i) => {
        const beltY = top + (h * (i + 1)) / (beltCourses + 1);
        return <rect key={i} x={x - w / 2} y={beltY - BELT_HEIGHT / 2} width={w} height={BELT_HEIGHT} fill={beltFill} />;
      })}
      <circle cx={x} cy={gaugeY} r={gaugeR} fill={gaugeFill} />
    </g>
  );
};
