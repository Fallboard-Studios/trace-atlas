import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift, hslToString } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { FloodlightParams } from '../sceneryParams';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 floodlight row)
// ========================================

const MAST_W = 10;
const HEAD_W = 36;
const HEAD_H = 16;
const LIT_BAR_W = 28;
const LIT_BAR_H = 5;
const POOL_RX = 30;
const POOL_RY = 8;
/** "`glass.base` opacity `0.04 + 0.12 nd`". */
const BEAM_OPACITY_BASE = 0.04;
const BEAM_OPACITY_RANGE = 0.12;
/** "ground pool ellipse opacity `0.03 + 0.10 nd`". */
const POOL_OPACITY_BASE = 0.03;
const POOL_OPACITY_RANGE = 0.1;

/** The mast top, head box and lit bar, in scene units — shared with the work anchors. */
export function floodlightLayout(x: number, y: number, { mastH, headOffset }: FloodlightParams) {
  const mastTop = y - mastH;
  const headX = x + headOffset;
  const headTop = mastTop - HEAD_H;
  return {
    mast: { x0: x - MAST_W / 2, x1: x + MAST_W / 2, y: mastTop },
    head: { x0: headX - HEAD_W / 2, x1: headX + HEAD_W / 2, y: headTop, bottom: mastTop },
    litBar: { cx: headX, cy: headTop + HEAD_H / 2 },
  };
}

/**
 * Floodlight (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a mast, an offset head with a lit bar,
 * a beam polygon (one vertical edge, one 45° edge, from the head straight down to the ground
 * and diagonally back) and a ground pool — both the beam and pool use their own `nd`-scaled
 * opacity formula rather than the generic `lamp()` lightness lift (§1.9's header "lit" meaning),
 * since they're translucent overlays, not solid lit fills. Structural (§1.8) — fixed tones, no
 * stored shift.
 */
export const floodlight: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.floodlight;
  if (!p) return <g data-scenery="floodlight" />;
  const { mastH, headOffset } = p;

  const avgL = (eastL + westL) / 2;
  const mastFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, avgL * cap);
  const headFill = applyColorShift(colorTheme.shell.base, NO_SHIFT, avgL * cap);
  const litBarFill = lamp(colorTheme.glass.base, nightDepth);
  const beamFill = hslToString(colorTheme.glass.base);

  const { mast, head } = floodlightLayout(x, y, p);
  const mastTop = mast.y;
  const headX = x + headOffset;
  const headBottom = head.bottom;
  const headTop = head.y;

  const beamOpacity = BEAM_OPACITY_BASE + BEAM_OPACITY_RANGE * nightDepth;
  const poolOpacity = POOL_OPACITY_BASE + POOL_OPACITY_RANGE * nightDepth;
  const beamGroundX = headX + (y - headBottom);

  const beamPoints = [
    `${headX},${headBottom}`,
    `${headX},${y}`,
    `${beamGroundX},${y}`,
  ].join(' ');

  return (
    <g data-scenery="floodlight">
      <rect data-floodlight="mast" x={x - MAST_W / 2} y={mastTop} width={MAST_W} height={mastH} fill={mastFill} />
      <rect
        data-floodlight="arm"
        x={Math.min(x, headX)}
        y={mastTop - 1}
        width={Math.abs(headOffset)}
        height={2}
        fill={mastFill}
      />
      <rect data-floodlight="head" x={headX - HEAD_W / 2} y={headTop} width={HEAD_W} height={HEAD_H} fill={headFill} />
      <rect
        data-floodlight="lit-bar"
        x={headX - LIT_BAR_W / 2}
        y={headTop + (HEAD_H - LIT_BAR_H) / 2}
        width={LIT_BAR_W}
        height={LIT_BAR_H}
        fill={litBarFill}
      />
      <polygon data-floodlight="beam" points={beamPoints} fill={beamFill} opacity={beamOpacity} />
      <ellipse data-floodlight="pool" cx={beamGroundX} cy={y} rx={POOL_RX} ry={POOL_RY} fill={beamFill} opacity={poolOpacity} />
    </g>
  );
};
