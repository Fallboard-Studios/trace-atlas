// ========================================
// IMPORTS
// ========================================
import { gemWidth, GEM_CANVAS_H, type RobotGem } from '../../components/robot/gem/polygon';
import type { Robot } from '../../types/Robot';
import type { Vec2 } from '../../types/Vec2';

// ========================================
// TYPES
// ========================================
/** TL, TR, BL, BR — an index into `RobotGem.orbiters`. */
export type OrbiterCorner = 0 | 1 | 2 | 3;

export interface OrbiterFrame {
  /** `robot.position` — the gem canvas's top-left in the scene (the `.robot` group's GSAP x/y). */
  robotPos: Vec2;
  gem: RobotGem;
  /** RobotBody's audio-driven body scale (0.735–1.69). */
  bodyScale: number;
  /** The robot row's scale — 1 in front, J4's back row smaller. */
  layerScale: number;
  corner: OrbiterCorner;
}

// ========================================
// CENTRE VS POSITION (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.9, correction 5)
// ========================================
/**
 * The scene point a robot is centred on. Station ports and site `park`s are centres;
 * `robot.position` is the gem canvas's top-left. `g.gem` scales about the canvas centre, so the
 * centre doesn't depend on body or layer scale and neither function takes one. This pair is the
 * only conversion between the two.
 */
export function robotCentre(robot: Pick<Robot, 'position'>, gem: RobotGem): Vec2 {
  return { x: robot.position.x + gemWidth(gem) / 2, y: robot.position.y + GEM_CANVAS_H / 2 };
}

/** The `robot.position` that puts the robot's centre on `centre` — the inverse of `robotCentre`. */
export function positionForCentre(centre: Vec2, gem: RobotGem): Vec2 {
  return { x: centre.x - gemWidth(gem) / 2, y: centre.y - GEM_CANVAS_H / 2 };
}

// ========================================
// SCENE → ORBITER LOCAL (§1.9)
// ========================================
/**
 * The GSAP `x`/`y` to give a corner's `.gem__orbiter-local` group so that orbiter's centre lands
 * on the scene `point`. Undoes, outermost first, the `.robot` translate (`robotPos`), `g.gem`'s
 * `translate(c) scale(s) translate(−c)` (`s = bodyScale × layerScale`, `c` the canvas centre) and
 * the corner's dock (its part's box centre). The local group's own scale is about the orbiter's
 * centre, so it never moves that centre and plays no part here. `{ x: 0, y: 0 }` is docked.
 */
export function sceneToOrbiterLocal(point: Vec2, { robotPos, gem, bodyScale, layerScale, corner }: OrbiterFrame): Vec2 {
  const s = bodyScale * layerScale;
  if (!(s > 0)) throw new RangeError(`sceneToOrbiterLocal: scale ${s} has no inverse`);
  const cx = gemWidth(gem) / 2;
  const cy = GEM_CANVAS_H / 2;
  const part = gem.orbiters[corner];
  return {
    x: cx + (point.x - robotPos.x - cx) / s - (part.x + part.w / 2),
    y: cy + (point.y - robotPos.y - cy) / s - (part.y + part.h / 2),
  };
}
