import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { CraneParams } from '../sceneryParams';
import type { SceneryRenderer } from '../sceneryTypes';
import { GemRing } from '../../material/GemRing';
import { WORLD_GEM, hairline, ringFacets, worldBevel, worldLightVector } from '../../material/worldGemMaterial';

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
export const CRANE_BEAM_END_LIGHT_R = 5;
/** `body.shadow` × 1.2, per §1.9. */
const STEEL_LIGHTNESS_MULT = 1.2;

/** The crane's beam, hanger and load, in scene units — shared with the work anchors. */
export function craneLayout(x: number, y: number, { w, h, hangerFrac }: CraneParams) {
  const beamBottom = y - h;
  const hangerX = x - w / 2 + hangerFrac * w;
  const hangerBottomY = beamBottom + HANGER_DROP;
  return {
    beamBottom,
    beamTop: beamBottom - BEAM_H,
    beamLeft: x - w / 2 - BEAM_OVERHANG,
    beamRight: x + w / 2 + BEAM_OVERHANG,
    hangerX,
    hangerBottomY,
    load: { x: hangerX - LOAD_W / 2, y: hangerBottomY, w: LOAD_W, h: LOAD_H },
  };
}

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
  const { w, h } = p;

  const half = w / 2;
  const westFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, westL * cap * STEEL_LIGHTNESS_MULT);
  const eastFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, eastL * cap * STEEL_LIGHTNESS_MULT);
  const frameFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, ((eastL + westL) / 2) * cap * STEEL_LIGHTNESS_MULT);
  const loadFill = applyColorShift(colorTheme.vent.base, NO_SHIFT, ((eastL + westL) / 2) * cap);

  const { beamBottom, beamTop, beamLeft, beamRight, hangerX, hangerBottomY, load } = craneLayout(x, y, p);

  const member = WORLD_GEM.members ? hairline() : undefined;

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

  // The world gem ring (docs/specs/WORLD_GEM_MATERIAL.md §1.5): only the hanging load is mass; the
  // posts, beam, brace and hanger are members. Single-tone at the load's own ambient light.
  const loadRing = ringFacets(
    [[load.x, load.y], [load.x + load.w, load.y], [load.x + load.w, load.y + load.h], [load.x, load.y + load.h]],
    WORLD_GEM.massScenery ? worldBevel(load.w, load.h) : 0,
    worldLightVector(eastL, westL),
    () => ((eastL + westL) / 2) * cap,
    colorTheme.vent.base,
  );

  return (
    <g data-scenery="crane">
      {/* members: the posts, beam, brace and hanger take the hairline (docs/specs/WORLD_GEM_MATERIAL.md §1.6) */}
      <rect data-crane="post-west" x={westPostX} y={beamBottom} width={POST_W} height={h} fill={westFill} {...member} />
      <rect data-crane="post-east" x={eastPostX} y={beamBottom} width={POST_W} height={h} fill={eastFill} {...member} />
      <rect data-crane="beam" x={beamLeft} y={beamTop} width={beamRight - beamLeft} height={BEAM_H} fill={frameFill} {...member} />
      <polygon data-crane="knee-brace" points={bracePoints} fill={frameFill} {...member} />
      {/* The hanger was a stroked <line>; a 3 px wide rect draws the identical strip, and takes the
          hairline like every other thin member. */}
      <rect
        data-crane="hanger"
        x={hangerX - HANGER_STROKE / 2}
        y={beamBottom}
        width={HANGER_STROKE}
        height={hangerBottomY - beamBottom}
        fill={frameFill}
        {...member}
      />
      <rect data-crane="load" x={load.x} y={load.y} width={load.w} height={load.h} fill={loadFill} />
      <GemRing facets={loadRing} />
      <circle data-crane="beam-end-light" cx={beamRight} cy={(beamTop + beamBottom) / 2} r={CRANE_BEAM_END_LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
    </g>
  );
};
