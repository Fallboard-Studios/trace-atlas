import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 pipeline row)
// ========================================

const STANCHION_W = 8;
/** Stanchions run "every 110" — the spacing the acceptance-criteria count formula assumes. */
const STANCHION_SPACING = 110;
/** "top highlight strip `0.35 d`". */
const HIGHLIGHT_FRAC = 0.35;
const FLANGE_W_MULT = 1.6;
const FLANGE_H = 6;
const VALVE_R_MULT = 0.3;

/**
 * Pipeline (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): an elevated horizontal pipe on
 * stanchions, with a highlight strip, and a riser at one seeded end carrying a flange and a
 * lit valve. Structural (§1.8) — fixed `shell` tones, no stored shift. Every element is
 * axis-aligned (no 45° edges in this family), so there's no `assertNinetyFortyFive` concern
 * beyond the NaN sweep.
 */
export const pipeline: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.pipeline;
  if (!p) return <g data-scenery="pipeline" />;
  const { w, d, e, riserH, riserRight } = p;

  const half = w / 2;
  const avgL = (eastL + westL) / 2;
  const pipeFill = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, avgL * cap);
  const highlightFill = applyColorShift(colorTheme.shell.base, NO_SHIFT, avgL * cap);

  const pipeBottom = y - e;
  const pipeTop = pipeBottom - d;
  const highlightH = d * HIGHLIGHT_FRAC;

  const stanchionCount = Math.floor((w - 60) / STANCHION_SPACING) + 1;
  const stanchionStep = stanchionCount > 1 ? (w - STANCHION_W) / (stanchionCount - 1) : 0;

  const riserX = riserRight ? x + half - d : x - half;
  const riserTop = pipeTop - riserH;
  const flangeW = d * FLANGE_W_MULT;
  const flangeX = riserX + d / 2 - flangeW / 2;
  const flangeTop = riserTop - FLANGE_H;
  const valveR = d * VALVE_R_MULT;

  return (
    <g data-scenery="pipeline">
      {Array.from({ length: stanchionCount }, (_, i) => (
        <rect
          key={i}
          data-pipeline="stanchion"
          x={x - half + i * stanchionStep}
          y={pipeBottom}
          width={STANCHION_W}
          height={e}
          fill={pipeFill}
        />
      ))}
      <rect data-pipeline="pipe" x={x - half} y={pipeTop} width={w} height={d} fill={pipeFill} />
      <rect data-pipeline="highlight" x={x - half} y={pipeTop} width={w} height={highlightH} fill={highlightFill} />
      <rect data-pipeline="riser" x={riserX} y={riserTop} width={d} height={riserH} fill={pipeFill} />
      <rect data-pipeline="flange" x={flangeX} y={flangeTop} width={flangeW} height={FLANGE_H} fill={highlightFill} />
      <circle data-pipeline="valve" cx={riserX + d / 2} cy={flangeTop - valveR} r={valveR} fill={lamp(colorTheme.alert.powered, nightDepth)} />
    </g>
  );
};
