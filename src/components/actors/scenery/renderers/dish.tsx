import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { SceneryRenderer } from '../sceneryTypes';

// ========================================
// CONSTANTS (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9 dish row)
// ========================================

const POST_W = 10;
/** "ellipse rx 30-48 x `0.32 rx`". */
const RY_FRAC = 0.32;
const FEED_W = 3;
const FEED_LEN = 14;
const CENTRE_LIGHT_R = 4;

/**
 * Dish (docs/specs/WORLD_VIEW_DISTRICTS.md §1.9): a post topped by an ellipse reflector and a
 * feed stub, both inside one `rotate(±45 …)` group (the sign from the seeded `tiltRight`) —
 * the 45° grid `sceneryTestHelpers.ts`'s `assertNinetyFortyFive` exempts by construction.
 * Structural (§1.8) — fixed `body.shadow`/`shell.highlight` tones, no stored shift.
 */
export const dish: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth }) => {
  const { x, y } = actor.position;
  const p = params.dish;
  if (!p) return <g data-scenery="dish" />;
  const { rx, postH, tiltRight } = p;
  const ry = rx * RY_FRAC;

  const avgL = (eastL + westL) / 2;
  const postFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, avgL * cap);
  const dishFill = applyColorShift(colorTheme.shell.highlight, NO_SHIFT, avgL * cap);

  const postTop = y - postH;
  const sign = tiltRight ? 1 : -1;

  return (
    <g data-scenery="dish">
      <rect data-dish="post" x={x - POST_W / 2} y={postTop} width={POST_W} height={postH} fill={postFill} />
      <g transform={`rotate(${sign * 45} ${x} ${postTop})`}>
        <ellipse data-dish="reflector" cx={x} cy={postTop} rx={rx} ry={ry} fill={dishFill} />
        <rect data-dish="feed" x={x - FEED_W / 2} y={postTop - ry - FEED_LEN} width={FEED_W} height={FEED_LEN} fill={postFill} />
      </g>
      <circle data-dish="centre-light" cx={x} cy={postTop} r={CENTRE_LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
    </g>
  );
};
