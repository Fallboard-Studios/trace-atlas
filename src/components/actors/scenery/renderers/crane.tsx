import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 crane row)
// ========================================

const POST_W = 14;
const BEAM_H = 18;
const BEAM_OVERHANG = 30;
/** "45° knee brace 40" — the diagonal run's length, in both x and y. */
const KNEE_BRACE_LEN = 40;
const KNEE_BRACE_THICKNESS = 4;
const LOAD_W = 80;
const LOAD_H = 50;
const HANGER_DROP = 36;
const HANGER_STROKE = 3;
const BEAM_END_LIGHT_R = 5;
/** `body.shadow` × 1.2, per §1.9. */
const STEEL_LIGHTNESS_MULT = 1.2;

/**
 * Crane (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): two posts lit west/east, a beam with
 * overhang, one 45° knee brace reusing scaffold.tsx's parallelogram-brace shape, a hanging
 * load, and a lit beam-end light. Structural (§1.8) — fixed `body.shadow` tones, no stored
 * shift, so it's untouched by `recolorActorsForAttenuationStyle`.
 */
export const crane: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.crane;
  if (!p) return <g data-scenery="crane" />;
  const { w, h, hangerFrac } = p;

  const half = w / 2;
  const westFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, westL * cap * STEEL_LIGHTNESS_MULT);
  const eastFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, eastL * cap * STEEL_LIGHTNESS_MULT);
  const frameFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, ((eastL + westL) / 2) * cap * STEEL_LIGHTNESS_MULT);
  const loadFill = applyColorShift(colorTheme.vent.base, NO_SHIFT, ((eastL + westL) / 2) * cap);

  const beamBottom = y - h;
  const beamTop = beamBottom - BEAM_H;
  const beamLeft = x - half - BEAM_OVERHANG;
  const beamRight = x + half + BEAM_OVERHANG;

  const westPostX = x - half;
  const eastPostX = x + half - POST_W;

  // Same parallelogram-brace shape scaffold.tsx's 45° braces use, anchored at the east post's
  // top corner and running up-and-in toward the beam.
  const half45 = KNEE_BRACE_THICKNESS / 2;
  const bracePoints = [
    `${eastPostX - half45},${beamBottom - half45}`,
    `${eastPostX - KNEE_BRACE_LEN - half45},${beamBottom - KNEE_BRACE_LEN - half45}`,
    `${eastPostX - KNEE_BRACE_LEN + half45},${beamBottom - KNEE_BRACE_LEN + half45}`,
    `${eastPostX + half45},${beamBottom + half45}`,
  ].join(' ');

  const hangerX = x - half + hangerFrac * w;
  const hangerBottomY = beamBottom + HANGER_DROP;

  return (
    <g data-scenery="crane">
      <rect data-crane="post-west" x={westPostX} y={beamBottom} width={POST_W} height={h} fill={westFill} />
      <rect data-crane="post-east" x={eastPostX} y={beamBottom} width={POST_W} height={h} fill={eastFill} />
      <rect data-crane="beam" x={beamLeft} y={beamTop} width={beamRight - beamLeft} height={BEAM_H} fill={frameFill} />
      <polygon data-crane="knee-brace" points={bracePoints} fill={frameFill} />
      <line data-crane="hanger" x1={hangerX} y1={beamBottom} x2={hangerX} y2={hangerBottomY} stroke={frameFill} strokeWidth={HANGER_STROKE} />
      <rect data-crane="load" x={hangerX - LOAD_W / 2} y={hangerBottomY} width={LOAD_W} height={LOAD_H} fill={loadFill} />
      <circle data-crane="beam-end-light" cx={beamRight} cy={(beamTop + beamBottom) / 2} r={BEAM_END_LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
    </g>
  );
};
