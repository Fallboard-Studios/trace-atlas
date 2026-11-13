// ========================================
// noteRows (docs/specs/ROBOT_NOTE_CLOUD.md §1.3)
// ========================================
// The note cloud's geometry, pure: the roll's box about the robot, a bar's thickness and length. Everything is in gem
// canvas units (the robot's own svg units) unless a name says pixels. No DOM, no GSAP, no engine.

// ========================================
// IMPORTS
// ========================================
import {
  NOTE_CROSSING_SECONDS,
  NOTE_HEIGHT_SHARE,
  NOTE_MAX_LENGTH_SHARE,
  NOTE_MIN_PX,
  NOTE_ROLL_SIZE,
} from '../../../constants';
import { GEM_CANVAS_H, gemWidth, type RobotGem } from '../gem/polygon';

// ========================================
// TYPES
// ========================================
/** A box in gem canvas units: its top-left corner and its size. */
export interface RollBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ========================================
// EXPORTS
// ========================================
/**
 * The roll (§1.3): a box centred on the gem canvas centre, NOTE_ROLL_SIZE times the box the robot's parts fill
 * (backing, Mids, Top and the docked orbiters) at the body's `scale`, which the body applies about the same centre
 * (RobotGem.tsx). The parts' box is centred too: it takes the parts' larger reach from the centre each way.
 */
export function rollBox(gem: RobotGem, scale: number): RollBox {
  const cx = gemWidth(gem) / 2;
  const cy = GEM_CANVAS_H / 2;
  let reachX = 0;
  let reachY = 0;
  for (const p of [gem.backing, gem.midLeft, gem.midRight, gem.top, ...gem.orbiters]) {
    reachX = Math.max(reachX, cx - p.x, p.x + p.w - cx);
    reachY = Math.max(reachY, cy - p.y, p.y + p.h - cy);
  }
  const halfW = reachX * scale * NOTE_ROLL_SIZE;
  const halfH = reachY * scale * NOTE_ROLL_SIZE;
  return { x: cx - halfW, y: cy - halfH, w: 2 * halfW, h: 2 * halfH };
}

/**
 * A bar's thickness (§1.3): NOTE_HEIGHT_SHARE of the roll's height, and never under NOTE_MIN_PX on screen, so at
 * `pxPerUnit` screen pixels per canvas unit it is at least NOTE_MIN_PX / pxPerUnit units. A scale that is not yet
 * known (zero, negative or not finite) leaves the share alone.
 */
export function noteThickness(rollHeight: number, pxPerUnit: number): number {
  const share = rollHeight * NOTE_HEIGHT_SHARE;
  if (!(pxPerUnit > 0) || !Number.isFinite(pxPerUnit)) return share;
  return Math.max(share, NOTE_MIN_PX / pxPerUnit);
}

/**
 * A bar's length (§1.3): the note's sounding length at the roll's speed (a note crosses `rollWidth` in
 * NOTE_CROSSING_SECONDS), never shorter than the bar is thick and never longer than NOTE_MAX_LENGTH_SHARE of the
 * width.
 */
export function noteLength(seconds: number, rollWidth: number, thickness: number): number {
  const travelled = (seconds * rollWidth) / NOTE_CROSSING_SECONDS;
  return Math.min(NOTE_MAX_LENGTH_SHARE * rollWidth, Math.max(thickness, travelled));
}
