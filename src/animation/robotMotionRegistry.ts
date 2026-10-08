// ========================================
// robotMotionRegistry (docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.8, Phase 43)
// ========================================
// The work loop's only bridge to React-owned robot motion, keyed by robot id — the same shape as
// `utils/refs.ts`'s setRef/getRef/deleteRef. World-context `RobotBody`s register on mount and
// delete on unmount; cards and the detail avatar never register, so a lookup always means the
// robot drawn in the world.
//
// Deletes take an optional owner: a delete only removes the entry if it is still that owner's,
// so an old mount's cleanup running after a new mount's register (a remount) can't strip the new one.

// ========================================
// IMPORTS
// ========================================
import type { ArcDecorator } from '../components/robot/gem/useHaloMotion';

// ========================================
// TYPES
// ========================================
/** What `useOrbiterMotion` (world only) hands the work loop for a job. */
export interface OrbiterWork {
  /** Stops count-change hops and returns the shown orbiters' `.gem__orbiter-local` groups, at
   *  rest, in `cornerOrder`. */
  lock(): SVGGElement[];
  /** Clears the lock and catches the count up in one pass. */
  unlock(): void;
}

// ========================================
// STATE
// ========================================
const arcDecorators = new Map<string, ArcDecorator>();
const orbiterWork = new Map<string, OrbiterWork>();

// ========================================
// HELPERS
// ========================================
function deleteOwned<T>(map: Map<string, T>, robotId: string, owner?: T): void {
  if (owner !== undefined && map.get(robotId) !== owner) return;
  map.delete(robotId);
}

// ========================================
// EXPORTS
// ========================================
export function registerArcDecorator(robotId: string, decorate: ArcDecorator): void {
  arcDecorators.set(robotId, decorate);
}

export function getArcDecorator(robotId: string): ArcDecorator | undefined {
  return arcDecorators.get(robotId);
}

/** Removes the robot's decorator — only if it is still `owner`'s, when an owner is given. */
export function deleteArcDecorator(robotId: string, owner?: ArcDecorator): void {
  deleteOwned(arcDecorators, robotId, owner);
}

export function registerOrbiterWork(robotId: string, control: OrbiterWork): void {
  orbiterWork.set(robotId, control);
}

export function getOrbiterWork(robotId: string): OrbiterWork | undefined {
  return orbiterWork.get(robotId);
}

/** Removes the robot's orbiter control — only if it is still `owner`'s, when an owner is given. */
export function deleteOrbiterWork(robotId: string, owner?: OrbiterWork): void {
  deleteOwned(orbiterWork, robotId, owner);
}

/** Clear both maps (for testing/reset). */
export function clearRobotMotionRegistry(): void {
  arcDecorators.clear();
  orbiterWork.clear();
}
