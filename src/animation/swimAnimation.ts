// ========================================
// IMPORTS
// ========================================
import gsap from 'gsap';

import type { Robot } from '../types/Robot';
import type { Vec2 } from '../types/Vec2';
import { getRef } from '../utils/refs';
import { setTimeline, killTimeline } from './timelineMap';
import { SWIM_SPEED } from '../constants';

// ========================================
// CONSTANTS
// ========================================
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
 * Returns null, and does nothing else, for a robot with no mounted body (no `robot-${id}` ref):
 * there is nothing to swim, and `onComplete` is never called. The caller owns that case (the work
 * loop times the leg itself under the swim key, where `stopWorkLoop` can kill it).
 *
 * @param robot Robot to animate
 * @param destination Target destination
 * @param onComplete Optional callback when animation completes
 */
export function createSwimTimeline(
  robot: Robot,
  destination: Vec2,
  onComplete?: (robotId: string) => void
): gsap.core.Timeline | null {
  const ref = getRef(`robot-${robot.id}`);
  if (!ref) return null;

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

  setTimeline(`swim-${robot.id}`, tl, 'world');

  // Start the timeline (was paused during creation)
  tl.play();

  return tl;
}
