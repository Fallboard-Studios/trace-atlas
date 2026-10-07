import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { DERELICT_SAT } from '../../../../constants/sceneDepth';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 dome row)
// ========================================

/** The dome arc's saturation boost over `shell.base`, before the body shift. */
const DOME_SAT_BOOST = 10;
/** Hatch footprint, scene units. */
const HATCH_W = 28;
export const DOME_HATCH_H = 14;
/** Porthole radius. */
const PORTHOLE_R = 7;
/** Portholes are spread across this angular span either side of the dome's apex. */
const PORTHOLE_ANGLE_SPAN_DEG = 70;
/** "seeded 40% + 60% × nd": a porthole's own seeded roll must fall under this threshold to be lit. */
const PORTHOLE_LIT_BASE = 0.4;
const PORTHOLE_LIT_ND_SCALE = 0.6;
/** Mast height above the dome apex, and the light's radius. */
export const DOME_MAST_H = 26;
const MAST_W = 4;
const MAST_LIGHT_R = 5;

/**
 * The porthole centres, spread over ±70° of the dome's arc from its apex — each one on the arc
 * itself. Shared with the work-site anchors (Phase 43), so the two can't drift.
 */
export function domePortholeCentres(x: number, top: number, rx: number, ry: number, count: number): { x: number; y: number }[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0 : -1 + (2 * i) / (count - 1);
    const theta = (t * PORTHOLE_ANGLE_SPAN_DEG * Math.PI) / 180;
    return { x: x + rx * Math.sin(theta), y: top - ry * Math.cos(theta) };
  });
}

/**
 * Dome (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a two-faced base block topped by a half-ellipse
 * dome (two SVG arcs meeting at the actor's own x — `assertNinetyFortyFive` treats these as
 * decoration, same exception the sketch's turbine/dish `rotate(45)` groups get), a seeded row of
 * portholes whose lit fraction rises with `nightDepth`, a hatch, and a lit mast — all dark when
 * `config.derelict` (§1.6), same "force it off, don't rely on nd===0" pattern `tank.tsx` uses.
 */
export const dome: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.dome;
  if (!p) return <g data-scenery="dome" />;
  const { w, bh, ry, portholes, portholeLitRoll } = p;
  const derelict = !!actor.config?.derelict;

  const bodyShift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const westMult = westL * cap;
  const eastMult = eastL * cap;
  // Derelict body saturation is 40% of normal (§1.6) — folded up front, same as tank.tsx, so
  // both the base block and the dome cap pick it up for free.
  const satMult = derelict ? DERELICT_SAT : 1;

  const bodyBase = { ...colorTheme.body.base, s: colorTheme.body.base.s * satMult };
  const domeBase = { ...colorTheme.shell.base, s: (colorTheme.shell.base.s + DOME_SAT_BOOST) * satMult };

  const rx = w / 2;
  const top = y - bh;
  const apex = top - ry;

  const westFill = applyColorShift(bodyBase, bodyShift, westMult);
  const eastFill = applyColorShift(bodyBase, bodyShift, eastMult);
  const domeWestFill = applyColorShift(domeBase, bodyShift, westMult);
  const domeEastFill = applyColorShift(domeBase, bodyShift, eastMult);
  const ambient = applyColorShift(colorTheme.shell.shadow, NO_SHIFT, ((eastL + westL) / 2) * cap);

  const westArcD = `M ${x - rx},${top} A ${rx},${ry} 0 0 1 ${x},${apex} L ${x},${top} Z`;
  const eastArcD = `M ${x},${apex} A ${rx},${ry} 0 0 1 ${x + rx},${top} L ${x},${top} Z`;

  const threshold = PORTHOLE_LIT_BASE + PORTHOLE_LIT_ND_SCALE * nightDepth;
  const portholePositions = domePortholeCentres(x, top, rx, ry, portholes).map((c, i) => ({
    cx: c.x,
    cy: c.y,
    lit: !derelict && portholeLitRoll[i] < threshold,
  }));

  const hatchFill = ambient;
  const mastFill = ambient;

  return (
    <g data-scenery="dome">
      <rect x={x - rx} y={top} width={rx} height={bh} fill={westFill} />
      <rect x={x} y={top} width={rx} height={bh} fill={eastFill} />
      <path d={westArcD} fill={domeWestFill} />
      <path d={eastArcD} fill={domeEastFill} />
      {portholePositions.map((porthole, i) => (
        <circle
          key={i}
          data-dome="porthole"
          data-lit={porthole.lit}
          cx={porthole.cx}
          cy={porthole.cy}
          r={PORTHOLE_R}
          fill={porthole.lit ? lamp(colorTheme.glass.base, nightDepth) : applyColorShift(colorTheme.shadowDepth, NO_SHIFT, cap)}
        />
      ))}
      <rect x={x - HATCH_W / 2} y={y - DOME_HATCH_H} width={HATCH_W} height={DOME_HATCH_H} fill={hatchFill} />
      <rect x={x - MAST_W / 2} y={apex - DOME_MAST_H} width={MAST_W} height={DOME_MAST_H} fill={mastFill} />
      {!derelict && (
        <circle data-dome="mast-light" cx={x} cy={apex - DOME_MAST_H} r={MAST_LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
      )}
    </g>
  );
};
