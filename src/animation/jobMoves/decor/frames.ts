// ========================================
// IMPORTS
// ========================================
import { gemWidth, GEM_CANVAS_H, type RobotGem } from '../../../components/robot/gem/polygon';
import type { Vec2 } from '../../../types/Vec2';
import type { OrbiterCorner } from '../sceneToOrbiterLocal';

// ========================================
// TYPES
// ========================================
/** What a scene point needs to land in the row frame. */
export interface RowFrame {
  /** `robot.position` — the gem canvas's top-left in the scene (the `.robot` group's GSAP x/y). */
  robotPos: Vec2;
  gem: RobotGem;
  /** The robot row's scale — 1 in front, J4's back row smaller. */
  layerScale: number;
}

/** What an orbiter's local `x`/`y` needs to land in the row frame. */
export interface OrbiterRowFrame {
  gem: RobotGem;
  /** RobotBody's audio-driven body scale (0.735–1.69). */
  bodyScale: number;
  corner: OrbiterCorner;
}

// ========================================
// HELPERS
// ========================================
function assertScale(name: string, scale: number): void {
  if (!(scale > 0)) throw new RangeError(`${name}: scale ${scale} has no inverse`);
}

function canvasCentre(gem: RobotGem): Vec2 {
  return { x: gemWidth(gem) / 2, y: GEM_CANVAS_H / 2 };
}

/** A corner's dock centre — its part's box centre, in canvas units (what `sceneToOrbiterLocal` removes). */
function dockCentre(gem: RobotGem, corner: OrbiterCorner): Vec2 {
  const part = gem.orbiters[corner];
  return { x: part.x + part.w / 2, y: part.y + part.h / 2 };
}

// ========================================
// SCENE ↔ ROW LOCAL (docs/specs/JOB_DECORATION.md Assumption 4)
// ========================================
/**
 * The point, in the `.robot__work` group's frame, that sits on the scene `p`. The group lives in
 * `.robot__row` beside `g.gem`, so it is translated by `robotPos` and scaled by `layerScale` about
 * the canvas centre `c` but is not under `g.gem`'s body scale. The bob is not here: the group's
 * counter-bob cancels it. `{ x: c.x, y: c.y }` is the robot's centre at every layer scale.
 */
export function sceneToRowLocal(p: Vec2, { robotPos, gem, layerScale }: RowFrame): Vec2 {
  assertScale('sceneToRowLocal', layerScale);
  const c = canvasCentre(gem);
  return {
    x: c.x + (p.x - robotPos.x - c.x) / layerScale,
    y: c.y + (p.y - robotPos.y - c.y) / layerScale,
  };
}

/** The scene point a row-local point is drawn at — the inverse of `sceneToRowLocal` (tests only). */
export function rowLocalToScene(r: Vec2, { robotPos, gem, layerScale }: RowFrame): Vec2 {
  assertScale('rowLocalToScene', layerScale);
  const c = canvasCentre(gem);
  return {
    x: robotPos.x + c.x + (r.x - c.x) * layerScale,
    y: robotPos.y + c.y + (r.y - c.y) * layerScale,
  };
}

// ========================================
// ORBITER LOCAL ↔ ROW LOCAL
// ========================================
/**
 * Where an orbiter's centre is in the row frame, given its live GSAP `x`/`y` on
 * `.gem__orbiter-local`. Adds the corner's dock (so `{ 0, 0 }` is docked) then applies `g.gem`'s
 * body scale about the canvas centre. Composed with `sceneToOrbiterLocal` it equals
 * `sceneToRowLocal`, whatever the body scale.
 */
export function orbiterLocalToRowLocal(local: Vec2, { gem, bodyScale, corner }: OrbiterRowFrame): Vec2 {
  assertScale('orbiterLocalToRowLocal', bodyScale);
  const c = canvasCentre(gem);
  const dock = dockCentre(gem, corner);
  return {
    x: c.x + (local.x + dock.x - c.x) * bodyScale,
    y: c.y + (local.y + dock.y - c.y) * bodyScale,
  };
}

/** The orbiter `x`/`y` whose centre is at a row-local point — the inverse of `orbiterLocalToRowLocal` (tests only). */
export function rowLocalToOrbiterLocal(r: Vec2, { gem, bodyScale, corner }: OrbiterRowFrame): Vec2 {
  assertScale('rowLocalToOrbiterLocal', bodyScale);
  const c = canvasCentre(gem);
  const dock = dockCentre(gem, corner);
  return {
    x: c.x + (r.x - c.x) / bodyScale - dock.x,
    y: c.y + (r.y - c.y) / bodyScale - dock.y,
  };
}
