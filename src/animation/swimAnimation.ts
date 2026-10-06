// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import type { Robot } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';
import { getRef } from '../utils/refs';
import { setTimeline, killTimeline } from './timelineMap';
import { DEV_TUNING } from '../constants';

// ========================================
// CONSTANTS
// ========================================
const SWIM_SPEED = 120; // pixels per second
const TILT_ANGLE = 5; // degrees of body tilt during movement

// ========================================
// HELPERS
// ========================================

/**
 * Calculate distance between two points
 */
function calculateDistance(from: Vec2, to: Vec2): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate swim duration based on distance
 */
function calculateDuration(from: Vec2, to: Vec2): number {
  const distance = calculateDistance(from, to);
  return distance / SWIM_SPEED;
}

// ========================================
// EXPORTS
// ========================================

/**
 * Create GSAP timeline for robot swim animation.
 *
 * Robots have no discernible front (Roadmap Phase 40, docs/specs/ORBITING_POLYGONS.md §1.6), so
 * there is no orientation/flip phase any more — propulsion starts immediately.
 *
 * @param robot Robot to animate
 * @param destination Target destination
 * @param onComplete Optional callback when animation completes
 */
export function createSwimTimeline(
  robot: Robot,
  destination: Vec2,
  onComplete?: (robotId: string) => void
): gsap.core.Timeline {
  const ref = getRef(`robot-${robot.id}`);

  // If ref not found, log warning and still create timeline with callback
  // (for edge cases where ref might be registered late)
  if (!ref) {
    if (DEV_TUNING) console.warn(`[SwimAnimation] No ref found for robot ${robot.id}, deferring animation`);
    const tl = gsap.timeline();
    if (onComplete) {
      const estimatedDuration = calculateDuration(robot.position, destination);
      gsap.delayedCall(estimatedDuration, () => onComplete(robot.id));
    }
    return tl;
  }

  killTimeline(`swim-${robot.id}`);

  const duration = calculateDuration(robot.position, destination);

  // Create main timeline with optional arrival handler
  const tl = gsap.timeline({
    paused: true, // Start paused so we can register it first
    onComplete: onComplete ? () => {
      onComplete(robot.id);
    } : undefined,
  });

  // The tilt rotates about the centre; set once, no flip to coordinate it with any more.
  tl.set(ref, { transformOrigin: '50% 50%' });

  // ========================================
  // PROPULSION PHASE: starts immediately — no orientation phase to wait on
  // ========================================
  tl.to(ref, {
    x: destination.x,
    y: destination.y,
    duration,
    ease: 'sine.inOut',
  }, 0);

  // ========================================
  // BODY TILT (optional polish)
  // ========================================
  const dx = destination.x - robot.position.x;
  const tiltDirection = dx > 0 ? TILT_ANGLE : -TILT_ANGLE;

  tl.to(
    ref,
    {
      rotation: tiltDirection,
      duration: duration * 0.3,
      ease: 'sine.out',
    },
    0
  );

  tl.to(
    ref,
    {
      rotation: 0,
      duration: duration * 0.3,
      ease: 'sine.in',
    },
    duration * 0.7
  );

  setTimeline(`swim-${robot.id}`, tl);

  // Start the timeline (was paused during creation)
  tl.play();

  return tl;
}
