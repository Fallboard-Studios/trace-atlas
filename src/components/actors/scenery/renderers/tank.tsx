import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift, shiftHSL } from '../../../../utils/colorUtils';
import { DERELICT_SAT } from '../../../../constants/sceneDepth';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';
import { GemRing } from '../../material/GemRing';
import { WORLD_GEM, ringFacets, worldBevel, worldLightVector } from '../../material/worldGemMaterial';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 tank row)
// ========================================

/** "45° shoulders of 0.3 w" — the top-corner bevel run, in both x and y. */
export const TANK_SHOULDER_FRACTION = 0.3;
/** Belt course rects are "5 tall". */
const BELT_HEIGHT = 5;
/** Gauge circle radius is `0.08 w`. */
const GAUGE_R_FRAC = 0.08;
/** Gauge sits at `0.55 h` down from the top. */
export const TANK_GAUGE_Y_FRAC = 0.55;

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
  const shoulder = w * TANK_SHOULDER_FRACTION;
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

  // The world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5): the whole shouldered hexagon as one
  // outline, top and bottom split at the corner so each half takes its own face's light. The belt
  // courses sit inside it, inset by its depth on both sides. Depth 0 changes nothing.
  const d = WORLD_GEM.massScenery ? worldBevel(w, h) : 0;
  const ring = ringFacets(
    [[x - w / 2, y], [x - w / 2, top + shoulder], [x - w / 2 + shoulder, top], [x + w / 2 - shoulder, top], [x + w / 2, top + shoulder], [x + w / 2, y]],
    d,
    worldLightVector(eastL, westL),
    (midX) => (midX < splitX ? westL : eastL) * cap,
    bodyColor,
    { splitX },
  );

  const gaugeR = GAUGE_R_FRAC * w;
  const gaugeY = top + TANK_GAUGE_Y_FRAC * h;
  const gaugeFill = derelict
    ? applyColorShift(colorTheme.indicator.off, NO_SHIFT, 1)
    : lamp(colorTheme.indicator.powered, nightDepth);

  return (
    <g data-scenery="tank">
      <polygon points={westPoints} fill={westFill} />
      <polygon points={eastPoints} fill={eastFill} />
      <GemRing facets={ring} />
      {Array.from({ length: beltCourses }, (_, i) => {
        const beltY = top + (h * (i + 1)) / (beltCourses + 1);
        return <rect key={i} x={x - w / 2 + d} y={beltY - BELT_HEIGHT / 2} width={w - 2 * d} height={BELT_HEIGHT} fill={beltFill} />;
      })}
      <circle cx={x} cy={gaugeY} r={gaugeR} fill={gaugeFill} />
    </g>
  );
};
