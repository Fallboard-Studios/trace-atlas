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
const ORIENTATION_DURATION = 0.5; // seconds to flip orientation
const PROPULSION_OVERLAP = 0.2; // seconds of overlap between orientation and propulsion phases

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
 * Create GSAP timeline for robot swim animation with directional orientation
 * Implements sequenced Turn-then-Swim behavioral pattern:
 * 1. Orientation Phase (if needed): Flip robot orientation via scaleX transform
 * 2. Propulsion Phase: Animate movement with slight overlap for fluid feel
 * 
 * @param robot Robot to animate
 * @param destination Target destination
 * @param targetDirection Intended facing direction ('left' | 'right')
 * @param onComplete Optional callback when animation completes
 */
export function createSwimTimeline(
  robot: Robot,
  destination: Vec2,
  targetDirection: 'left' | 'right',
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

  // ========================================
  // INITIALIZATION: Ensure scaleX matches stored direction, set transform origin
  // ========================================
  const currentScaleX = robot.direction === 'right' ? 1 : -1;
  const targetScaleX = targetDirection === 'right' ? 1 : -1;
  const needsFlip = currentScaleX !== targetScaleX;

  // Create main timeline with optional arrival handler
  const tl = gsap.timeline({
    paused: true, // Start paused so we can register it first
    onComplete: onComplete ? () => {
      onComplete(robot.id);
    } : undefined,
  });

  // Always set transformOrigin first to ensure flips occur around center
  tl.set(ref, { transformOrigin: '50% 50%' });

  // ========================================
  // ORIENTATION PHASE: Flip if direction changed
  // ========================================
  if (needsFlip) {
    tl.to(ref, {
      scaleX: targetScaleX,
      duration: ORIENTATION_DURATION,
      ease: 'power1.inOut',
    });
  }

  // ========================================
  // PROPULSION PHASE: Movement with overlap
  // ========================================
  // Use absolute start time so all parallel tweens share the same anchor.
  // Relative offsets like "-=0.2" shift based on the *current* timeline end,
  // which drifts as tweens are added — causing the timeline to grow far
  // beyond the intended swim duration.
  const propulsionStart = needsFlip ? ORIENTATION_DURATION - PROPULSION_OVERLAP : 0;

  tl.to(ref, {
    x: destination.x,
    y: destination.y,
    duration,
    ease: 'sine.inOut',
  }, propulsionStart);

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
    propulsionStart
  );

  tl.to(
    ref,
    {
      rotation: 0,
      duration: duration * 0.3,
      ease: 'sine.in',
    },
    propulsionStart + duration * 0.7
  );

  setTimeline(`swim-${robot.id}`, tl);

  // Start the timeline (was paused during creation)
  tl.play();

  return tl;
}
