import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { GemShape, accentBase } from '../gemShape';
import { NO_SHIFT } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 beacon row)
// ========================================

const MAST_WIDTH = 10;
const FOOT_HEIGHT = 12;
/** The gem's height is 0.66× its width (§1.9); its centre sits this fraction of its own width
 *  above the mast top, so its bottom edge meets the mast. */
const GEM_H_FRAC = 0.66;
const GEM_CENTER_OFFSET_FRAC = 0.33;

/**
 * Beacon (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a mast and foot topped by a gem — the
 * gems-only family. `districts.ts` skips beacon rows entirely when `SCENERY_GEM_ACCENTS` is
 * false, so this renderer never needs a non-gem fallback branch (unlike pylon's).
 */
export const beacon: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth, accent }) => {
  const { x, y } = actor.position;
  const p = params.beacon;
  if (!p) return <g data-scenery="beacon" />;
  const { w, mastH, gemW } = p;

  const m = (eastL + westL) / 2;
  const steel = applyColorShift(colorTheme.body.shadow, NO_SHIFT, m * cap * 1.15);

  return (
    <g data-scenery="beacon">
      <rect x={x - MAST_WIDTH / 2} y={y - mastH} width={MAST_WIDTH} height={mastH} fill={steel} />
      <rect x={x - w / 2} y={y - FOOT_HEIGHT} width={w} height={FOOT_HEIGHT} fill={steel} />
      <GemShape
        cx={x}
        cy={y - mastH - gemW * GEM_CENTER_OFFSET_FRAC}
        w={gemW}
        h={gemW * GEM_H_FRAC}
        base={accentBase(accent.primary)}
        lit
        eastL={eastL}
        westL={westL}
        nightDepth={nightDepth}
      />
    </g>
  );
};
