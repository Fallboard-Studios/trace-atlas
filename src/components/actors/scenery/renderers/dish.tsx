import colorTheme from '../../../../constants/colorTheme.json';
import { applyColorShift } from '../../../../utils/colorUtils';
import { NO_SHIFT, lamp } from '../sceneryColor';
import type { DishParams } from '../sceneryParams';
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
 * The reflector and feed before the tilt, and the tilt itself (degrees about the post top) —
 * shared with the work anchors.
 */
export function dishLayout(x: number, y: number, { rx, postH, tiltRight }: DishParams) {
  const postTop = y - postH;
  const ry = rx * RY_FRAC;
  return {
    centre: { x, y: postTop },
    postHalfW: POST_W / 2,
    rx,
    ry,
    /** The feed stub, unrotated: x ± halfW, from y0 (its tip) down to y1 (the reflector's top). */
    feed: { halfW: FEED_W / 2, y0: postTop - ry - FEED_LEN, y1: postTop - ry },
    deg: (tiltRight ? 1 : -1) * 45,
  };
}

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
  const { postH } = p;
  const { centre, rx, ry, feed, deg } = dishLayout(x, y, p);
  const postTop = centre.y;

  const avgL = (eastL + westL) / 2;
  const postFill = applyColorShift(colorTheme.body.shadow, NO_SHIFT, avgL * cap);
  const dishFill = applyColorShift(colorTheme.shell.highlight, NO_SHIFT, avgL * cap);

  return (
    <g data-scenery="dish">
      <rect data-dish="post" x={x - POST_W / 2} y={postTop} width={POST_W} height={postH} fill={postFill} />
      <g transform={`rotate(${deg} ${x} ${postTop})`}>
        <ellipse data-dish="reflector" cx={x} cy={postTop} rx={rx} ry={ry} fill={dishFill} />
        <rect data-dish="feed" x={x - feed.halfW} y={feed.y0} width={FEED_W} height={FEED_LEN} fill={postFill} />
      </g>
      <circle data-dish="centre-light" cx={x} cy={postTop} r={CENTRE_LIGHT_R} fill={lamp(colorTheme.alert.powered, nightDepth)} />
    </g>
  );
};
