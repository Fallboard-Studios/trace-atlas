// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import type { NoiseFunction2D } from 'simplex-noise';
import { RobotState, DockingState } from '../types/Robot';
import useLocaleStore from '../stores/localeStore';
import { createSwimTimeline } from '../animation/swimAnimation';
import { getLocaleNoiseMap } from '../utils/noiseMaps';
import { getSeededVal } from '../utils/getSeededVal';
import { BATTERY_LOWER_THIRD_THRESHOLD } from '../constants';
import type { Vec2 } from '../types/Vec2';

// ========================================
// CONSTANTS
// ========================================
const WORLD_WIDTH = 1920;
const WORLD_HEIGHT = 1080;
const WORLD_MARGIN = 100; // Keep destinations away from edges
const IDLE_DELAY = 1.0; // Seconds before picking next destination
/** Distance outside the SVG viewBox for an exit destination — matches spawnSystem.ts's own OFFSCREEN_OFFSET. */
const OFFSCREEN_OFFSET = 150;

/** Default vertical range for pickDestination — the full world height, minus margin. */
const FULL_Y_RANGE = { min: WORLD_MARGIN, max: WORLD_HEIGHT - WORLD_MARGIN };
/** Low-battery confinement: lower third of the world view (still margin-clamped). */
const LOWER_THIRD_Y_RANGE = { min: Math.max(WORLD_MARGIN, WORLD_HEIGHT - WORLD_HEIGHT / 3), max: WORLD_HEIGHT - WORLD_MARGIN };
/** A robot's first destination after entering from its south-only spawn/dock spot — stays in the bottom half. */
const BOTTOM_HALF_Y_RANGE = { min: Math.max(WORLD_MARGIN, WORLD_HEIGHT / 2), max: WORLD_HEIGHT - WORLD_MARGIN };

// ========================================
// MODULE STATE
// ========================================
/** Track pending idle delays by robot ID to allow cleanup */
const pendingIdleDelays = new Map<string, gsap.core.Tween>();

/** Per-robot move counter — incremented each time a robot picks a new idle destination.
 *  Stores the robot's spawn index (for its unique noise channel) and current move count. */
const idleMoveCounters = new Map<string, { spawnIndex: number; count: number }>();

function getAndIncrementMoveCount(robotId: string): { spawnIndex: number; count: number } {
  const entry = idleMoveCounters.get(robotId) ?? { spawnIndex: 0, count: 0 };
  idleMoveCounters.set(robotId, { ...entry, count: entry.count + 1 });
  return entry;
}

/**
 * Seed the idle move counter for a robot at spawn time.
 * Pass the robot's spawn index so each robot gets its own noise channel.
 */
export function initRobotIdleCounter(robotId: string, spawnIndex: number): void {
  idleMoveCounters.set(robotId, { spawnIndex, count: 0 });
}

// ========================================
// EXPORTS
// ========================================

/**
 * Pick a destination within world bounds using seeded noise.
 * Each robot has a unique noise channel determined by its spawnIndex,
 * so robots never follow correlated paths regardless of their move count.
 * Falls back to Math.random if noiseMap is unavailable.
 *
 * `yRange` narrows the vertical band destinations are drawn from — defaults
 * to the full world height. Callers pass LOWER_THIRD_Y_RANGE/BOTTOM_HALF_Y_RANGE
 * (see handleRobotIdle) to keep a low-battery or just-surfaced robot near its
 * south-only entrance/exit rather than letting it range across the whole map.
 */
export function pickDestination(
  noiseMap: NoiseFunction2D | null,
  spawnIndex: number,
  moveCount: number,
  yRange: { min: number; max: number } = FULL_Y_RANGE
): Vec2 {
  if (noiseMap) {
    return {
      x: getSeededVal(noiseMap, `idle.target.x.${spawnIndex}`, moveCount, WORLD_MARGIN, WORLD_WIDTH - WORLD_MARGIN),
      y: getSeededVal(noiseMap, `idle.target.y.${spawnIndex}`, moveCount, yRange.min, yRange.max),
    };
  }
  return {
    x: WORLD_MARGIN + Math.random() * (WORLD_WIDTH - 2 * WORLD_MARGIN),
    y: yRange.min + Math.random() * (yRange.max - yRange.min),
  };
}

/**
 * Every robot enters and exits exclusively via the bottom of the world view —
 * matches spawnSystem.ts's generateSpawnPosition, which spawns/docks every
 * robot south-only now. Used to send a Departing robot visibly swimming
 * off-screen before it docks (robotSystems.ts's beginDeparting): straight
 * down from its current position, not the nearest edge.
 */
export function pickExitDestination(pos: Vec2): Vec2 {
  return { x: pos.x, y: WORLD_HEIGHT + OFFSCREEN_OFFSET };
}

/**
 * Handle robot entering idle state
 * Picks a destination and triggers swim animation.
 *
 * `opts.isReturning` marks a robot's first move after entering from its
 * south-only spawn/dock spot — locale-load mount (Robot.tsx) and a dock-cycle
 * landing (robotSystems.ts's landOnActive) both pass it, so that first
 * on-screen destination stays in the bottom half rather than jumping
 * anywhere on the map. Absent that, a robot below BATTERY_LOWER_THIRD_THRESHOLD
 * is confined to the lower third instead, so it stays close to its exit
 * as its battery runs down.
 */
export function handleRobotIdle(localeId: string, robotId: string, opts?: { isReturning?: boolean }): void {
  const store = useLocaleStore.getState();
  const robot = store.getRobotById(localeId, robotId);

  if (!robot) {
    // Genuinely unexpected — the only case worth a warning (backlog.md #12). A robot that
    // exists but isn't Idle/Active (most robots spawn Docked, and Robot.tsx calls this
    // unconditionally on every mount) is an ordinary, common precondition, not a bug — logged
    // here used to fire a console.warn (with React's dev-mode component-stack dump riding along)
    // on 10 of 12 robots every locale load.
    console.warn(`[IdleSystem] Robot ${robotId} not found`);
    return;
  }
  if (robot.state !== RobotState.Idle || robot.docking !== DockingState.Active) return;

  const locale = store.getLocaleById(localeId);
  const noiseMap = locale
    ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y)
    : null;

  const { spawnIndex, count } = getAndIncrementMoveCount(robotId);

  const yRange = opts?.isReturning
    ? BOTTOM_HALF_Y_RANGE
    : robot.batteryLevel < BATTERY_LOWER_THIRD_THRESHOLD
      ? LOWER_THIRD_Y_RANGE
      : FULL_Y_RANGE;

  const destination = pickDestination(noiseMap, spawnIndex, count, yRange);

  const direction = destination.x > robot.position.x ? 'right' : 'left';

  // Pass PRE-UPDATE robot to createSwimTimeline so it knows the old direction
  // and can correctly determine whether a flip animation is needed.
  createSwimTimeline(robot, destination, direction, () => handleRobotArrival(localeId, robotId));

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    state: RobotState.Moving,
    destination,
    direction,
  });
}

/**
 * Handle robot arrival at destination
 * Returns robot to idle state and schedules next destination pick
 */
export function handleRobotArrival(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);

  if (!robot || !robot.destination) {
    return;
  }

  useLocaleStore.getState().updateRobot(localeId, robotId, {
    state: RobotState.Idle,
    position: robot.destination, // Sync store position to where robot actually is
    destination: null,
  });

  // Schedule next destination pick after delay (using GSAP instead of setTimeout)
  // Store the tween so we can cancel it if the robot is removed before it fires
  const delayTween = gsap.delayedCall(IDLE_DELAY, () => {
    pendingIdleDelays.delete(robotId); // Clean up the stored reference
    handleRobotIdle(localeId, robotId);
  });

  pendingIdleDelays.set(robotId, delayTween);
}

/**
 * Cancel any pending idle delay for a robot
 * Called when a robot is removed to prevent orphaned timers
 */
export function cancelPendingIdleDelay(robotId: string): void {
  const delayTween = pendingIdleDelays.get(robotId);
  if (delayTween) {
    delayTween.kill();
    pendingIdleDelays.delete(robotId);
  }
  idleMoveCounters.delete(robotId);
}
