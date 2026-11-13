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
  NOTE_EDGE_START,
  NOTE_FAN,
  NOTE_HEIGHT_SHARE,
  NOTE_MAX_LENGTH_SHARE,
  NOTE_MIN_PX,
  NOTE_ROLL_SIZE,
  NOTE_WAVE,
  NOTE_WAVE_COUNT,
  NOTE_WAVE_EDGE_GAIN,
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

/** Where a roll's rows run (noteRowGeometry). `row` is −0.5 (lowest) to 0.5 (highest); `across` is 0 at the roll's
 *  left edge and 1 at its right. */
export interface NoteRowGeometry {
  /** Room the fan and the wave need above and below the roll: a layer is the roll's box grown by `pad` each way. */
  pad: number;
  /** The top edge of a bar on this row, in the layer's units (0 is `pad` above the roll's top). */
  y: (row: number, across: number) => number;
  /** The bar's tilt in degrees, clockwise (CSS `rotate`): level through the straight middle, easing in past the
   *  fan's start to the row's own slope at the edge. */
  tilt: (row: number, across: number) => number;
}

// ========================================
// HELPERS
// ========================================
const DEGREES = 180 / Math.PI;

/** How far into the fan `across` is: 0 through the straight middle, rising to 1 at either edge (and held there
 *  beyond it), with its rate of change along `across`. */
function fanReach(across: number): { past: number; rate: number } {
  const fromCentre = Math.abs(2 * across - 1);
  const raw = (fromCentre - NOTE_EDGE_START) / (1 - NOTE_EDGE_START);
  if (raw <= 0) return { past: 0, rate: 0 };
  if (raw > 1) return { past: 1, rate: 0 };
  return { past: raw, rate: (Math.sign(2 * across - 1) * 2) / (1 - NOTE_EDGE_START) };
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
 * The rows across a roll (§1.3). A row holds its pitch height, bar a wave of NOTE_WAVE of the roll's height, until
 * NOTE_EDGE_START of the way from the centre to an edge. Past it the fan opens as the square of how far in it is
 * (so it grows from nothing, with no kink): the rows spread apart by up to NOTE_FAN of their middle spread, the wave
 * grows to NOTE_WAVE_EDGE_GAIN times, and a bar tilts toward its row's slope, by the same weight. NOTE_WAVE_COUNT
 * waves cross the roll, each row's shifted by its pitch, so the top and bottom rows wave together. Beyond the roll
 * the rows fan no further than at its edge, so `pad` holds them all.
 */
export function noteRowGeometry(box: RollBox, thickness: number): NoteRowGeometry {
  const travel = Math.max(0, box.h - thickness); // the rows' spread through the middle
  const wave = NOTE_WAVE * box.h;
  const pad = (NOTE_FAN / 2) * travel + NOTE_WAVE_EDGE_GAIN * wave + thickness;

  const y = (row: number, across: number) => {
    const { past } = fanReach(across);
    const fan = past * past;
    const amplitude = wave * (1 + (NOTE_WAVE_EDGE_GAIN - 1) * fan);
    const phase = 2 * Math.PI * (NOTE_WAVE_COUNT * across + row);
    return pad + travel / 2 - row * travel * (1 + NOTE_FAN * fan) + amplitude * Math.sin(phase);
  };

  const tilt = (row: number, across: number) => {
    const { past, rate } = fanReach(across);
    const fan = past * past;
    if (fan === 0) return 0; // the straight middle, most of a note's crossing: no trigonometry
    const fanRate = 2 * past * rate;
    const amplitude = wave * (1 + (NOTE_WAVE_EDGE_GAIN - 1) * fan);
    const phase = 2 * Math.PI * (NOTE_WAVE_COUNT * across + row);
    // dy/d(across), then over d(x)/d(across) = the roll's width
    const dy =
      -row * travel * NOTE_FAN * fanRate +
      wave * (NOTE_WAVE_EDGE_GAIN - 1) * fanRate * Math.sin(phase) +
      amplitude * Math.cos(phase) * 2 * Math.PI * NOTE_WAVE_COUNT;
    return fan * Math.atan(dy / box.w) * DEGREES;
  };

  return { pad, y, tilt };
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
