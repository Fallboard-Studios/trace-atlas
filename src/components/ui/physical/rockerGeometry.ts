// ========================================
// GEOMETRY — single source of truth for the
// rocker's 8 SVG faces, rest vs. pressed, and
// for what the indicator light derives from them.
// ========================================

/** One rocker face's rest/pressed point sets. Previously each face's geometry
 *  was hand-copied 3x (initial gsap.set, animateRockerPress's press target,
 *  returnRocker's hardcoded FROM) — collapsed here into one table all three
 *  call sites read from, which also removes the drift that had crept into
 *  the loose copies (the power-glyph's pressed scaleY was 0.76 in one copy,
 *  0.74 in another — see POWER_SVG_PRESSED below; both describe the same
 *  "pressed" state and must agree). */
export interface RockerFace {
  className: string;
  rest: string;
  pressed: string;
}

export const ROCKER_FACES: RockerFace[] = [
  { className: 'rocker-top-edge', rest: '0,5   100,5   94,15  6,15', pressed: '0,5   100,5   100,5  0,5' },
  { className: 'rocker-top', rest: '6,15  94,15   97,44  3,44', pressed: '3,5   97,5    97,44  3,44' },
  { className: 'rocker-top-left', rest: '0,5   6,15    3,44   0,44', pressed: '0,5   3,5     3,44   0,44' },
  { className: 'rocker-top-right', rest: '94,15 100,5   100,44 97,44', pressed: '97,5  100,5   100,44 97,44' },
  { className: 'rocker-bottom-edge', rest: '0,85  100,85  100,85 0,85', pressed: '0,85  100,85  94,75  6,75' },
  { className: 'rocker-bottom', rest: '3,44  97,44   97,85  3,85', pressed: '3,44  97,44   94,75  6,75' },
  { className: 'rocker-bottom-left', rest: '0,44  3,44    3,85   0,85', pressed: '0,44  3,44    6,75   0,85' },
  { className: 'rocker-bottom-right', rest: '97,44 100,44  100,85 97,85', pressed: '97,44 100,44  100,85 94,75' },
];

/** The power-glyph nested SVG's own rest/pressed attr pair — same rest-vs-
 *  pressed shape as ROCKER_FACES, kept separate since it's one element with
 *  a different attr set (y + scaleY, not points). */
export const POWER_SVG_REST = { y: 54, scaleY: 1 };
export const POWER_SVG_PRESSED = { y: 50, scaleY: 0.76 };

/** Height of the rocker SVG's viewBox (`0 0 100 90`). */
export const ROCKER_VIEWBOX_HEIGHT = 90;

const pointYs = (points: string) => points.trim().split(/\s+/).map((pair) => Number(pair.split(',')[1]));
const topFace = ROCKER_FACES.find((face) => face.className === 'rocker-top')!;

/** The ridge: the line the top and bottom faces meet on, and the rocker's centre. The rocker rocks about it. */
export const RIDGE_Y = Math.max(...pointYs(topFace.rest));

/** The ridge as a percentage of the rocker's height: the light's pivot (transform-origin y). */
export const RIDGE_ORIGIN_PERCENT = (RIDGE_Y / ROCKER_VIEWBOX_HEIGHT) * 100;

// ----------------------------------------
// The indicator light lies ON the top face (Crawford, 2026-10-10), so it takes that face's pose.
// The face is drawn foreshortened at rest (shorter, narrower at its far edge) and full height flat when
// pressed. A surface turned about the ridge by θ is foreshortened by cos θ, so the angle that matches the drawn
// face is acos(rest height / flat height). Derived from the face's own points, not typed in beside them.
// ----------------------------------------
const restHeight = RIDGE_Y - Math.min(...pointYs(topFace.rest));
const flatHeight = RIDGE_Y - Math.min(...pointYs(topFace.pressed));

/** The light's rotateX (degrees) at rest: tilted forward like the top face, its far edge away from the viewer. */
export const LIGHT_REST_ANGLE = (Math.acos(restHeight / flatHeight) * 180) / Math.PI;

/** The light's rotateX when the rocker is pressed and the top face is flat. */
export const LIGHT_PRESSED_ANGLE = 0;

/** CSS perspective (px) for the light's tilt: tuned by eye so the far edge narrows about as much as the top
 *  face's does (88 against 94 wide), reading as a surface turned away rather than a squashed one. */
export const LIGHT_PERSPECTIVE = 220;
