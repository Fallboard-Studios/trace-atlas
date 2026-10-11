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

/** Height of the rocker SVG's viewBox (`0 0 100 90`). */
export const ROCKER_VIEWBOX_HEIGHT = 90;

const pointsOf = (points: string) => points.trim().split(/\s+/).map((pair) => pair.split(',').map(Number) as [number, number]);
const pointYs = (points: string) => pointsOf(points).map((point) => point[1]);
const topFace = ROCKER_FACES.find((face) => face.className === 'rocker-top')!;
const bottomFace = ROCKER_FACES.find((face) => face.className === 'rocker-bottom')!;

/** The ridge: the line the top and bottom faces meet on, and the rocker's centre. The rocker rocks about it. */
export const RIDGE_Y = Math.max(...pointYs(topFace.rest));

// ----------------------------------------
// The power glyph is printed on the BOTTOM face, so it takes that face's pose, turned about the same ridge as
// the faces and the light. The bottom face is flat at rest; pressed, it is drawn foreshortened (its far edge
// comes in toward the ridge) and narrower at that far edge. The glyph's pose is a scale about the ridge, derived
// from those points. It used to be tweened as a `y` attribute plus a scale about its own centre, which landed it
// ~3 units too high when pressed (measured in Chrome): that moved it as if it were not on the face.
// ----------------------------------------

/** The nested SVG that holds the glyph, in the rocker's viewBox units (JSX and the pose below read this).
 *  Its own 100×100 viewBox is stretched to this rect (preserveAspectRatio none), so 51×23 here draws square. */
export const POWER_GLYPH = { x: 25, y: 54, width: 51, height: 23 };

/** The pivot, in viewBox coordinates (GSAP svgOrigin): the ridge, on the face's centre line. */
export const POWER_GLYPH_ORIGIN = { x: 50, y: RIDGE_Y };

const bottomRest = pointsOf(bottomFace.rest);
const bottomPressed = pointsOf(bottomFace.pressed);
const farEdgeRest = Math.max(...bottomRest.map((point) => point[1]));
const farEdgePressed = Math.max(...bottomPressed.map((point) => point[1]));
// Where the glyph's centre sits down the face, 0 at the ridge and 1 at the far edge.
const glyphCentreDownFace = (POWER_GLYPH.y + POWER_GLYPH.height / 2 - RIDGE_Y) / (farEdgeRest - RIDGE_Y);
const widthAtRidge = bottomPressed[1][0] - bottomPressed[0][0];
const widthAtFarEdge = bottomPressed[2][0] - bottomPressed[3][0];
const restWidth = bottomRest[1][0] - bottomRest[0][0];

/** The glyph's scale when the rocker is pressed: the face's foreshortening, and its width where the glyph sits. */
export const POWER_GLYPH_PRESSED = {
  scaleX: (widthAtRidge + (widthAtFarEdge - widthAtRidge) * glyphCentreDownFace) / restWidth,
  scaleY: (farEdgePressed - RIDGE_Y) / (farEdgeRest - RIDGE_Y),
};

/** The glyph's scale at rest: the face is flat. */
export const POWER_GLYPH_REST = { scaleX: 1, scaleY: 1 };

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
