import type { WaveformType } from '../../types/Robot';

/** Every shape's table has exactly this many candidate greeble slots. */
export const SLOT_COUNT = 8;

/**
 * A candidate greeble placement, hand-measured from the shape's SVG after Phase 36
 * (docs/sketches/robot-greebles.html). `x`/`y` is the box's CENTER (not top-left), `w`/`h` its
 * full width/height — the same convention docs/specs/ROBOT_LAYER_MARKERS.md's socket markers
 * use. `rot` is an optional facing hint for a kind that cares about orientation (e.g. antenna).
 */
export interface GreebleSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  rot?: number;
}

interface FixtureBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ========================================
// RobotSleek (sine) — 96x72 body space
// ========================================
const SLEEK_SLOTS: readonly GreebleSlot[] = [
  { x: 21, y: 19, w: 6, h: 6 },
  { x: 36, y: 18, w: 4, h: 6 },
  { x: 50, y: 18, w: 12, h: 6 },
  { x: 64.5, y: 18, w: 5, h: 6 },
  { x: 21, y: 52, w: 6, h: 5 },
  { x: 36, y: 53, w: 4, h: 6 },
  { x: 50, y: 53, w: 12, h: 6 },
  { x: 64.5, y: 53, w: 5, h: 6 },
];

/** window, lamp, vent, and the two layer-socket positions reserved for Phase 38
 *  (docs/intent/robot-layer-markers.md) — entered here so no slot can ever take them. */
const SLEEK_FIXTURES: readonly FixtureBox[] = [
  { x: 24, y: 36, w: 16, h: 20 }, // window
  { x: 70, y: 36, w: 7, h: 7 }, // lamp
  { x: 54, y: 36, w: 12, h: 16 }, // vent
  { x: 36.5, y: 36, w: 4.8, h: 4.8 }, // coaxial socket (reserved)
  { x: 63.4, y: 36, w: 3.8, h: 3.8 }, // harmonic socket (reserved)
];

// ========================================
// RobotAngular (square) — 96x72 body space
// ========================================
const ANGULAR_SLOTS: readonly GreebleSlot[] = [
  { x: 32, y: 26, w: 6, h: 14 },
  { x: 42, y: 21.5, w: 10, h: 8 },
  { x: 52.5, y: 20, w: 5, h: 6 },
  { x: 67, y: 21.5, w: 4, h: 8 },
  { x: 32, y: 46, w: 6, h: 14 },
  { x: 42, y: 50.5, w: 10, h: 8 },
  { x: 52.5, y: 52, w: 5, h: 6 },
  { x: 67, y: 50.5, w: 4, h: 8 },
];

const ANGULAR_FIXTURES: readonly FixtureBox[] = [
  { x: 44, y: 36, w: 16, h: 16 }, // window
  { x: 73, y: 36, w: 6, h: 6 }, // lamp
  { x: 64, y: 36, w: 8, h: 16 }, // vent
  { x: 60, y: 22, w: 8, h: 4 }, // warning stripe (top)
  { x: 60, y: 50, w: 8, h: 4 }, // warning stripe (bottom)
  { x: 32, y: 36, w: 4.6, h: 4.6 }, // coaxial socket (reserved)
  { x: 48.5, y: 21, w: 2.8, h: 2.8 }, // harmonic socket (reserved)
];

// ========================================
// RobotOrganic (triangle) — 96x72 body space
// ========================================
const ORGANIC_SLOTS: readonly GreebleSlot[] = [
  { x: 28, y: 15, w: 8, h: 5 },
  { x: 48, y: 13, w: 14, h: 5 },
  { x: 67.5, y: 14, w: 5, h: 4 },
  { x: 28, y: 58, w: 8, h: 5 },
  { x: 48, y: 59, w: 14, h: 5 },
  { x: 67.5, y: 58, w: 5, h: 4 },
  { x: 72, y: 36, w: 10, h: 10 },
  { x: 70, y: 24, w: 8, h: 8 },
];

const ORGANIC_FIXTURES: readonly FixtureBox[] = [
  { x: 32, y: 36, w: 26, h: 26 }, // window
  { x: 60, y: 24, w: 9, h: 9 }, // lamp
  { x: 56, y: 36, w: 14, h: 18 }, // vent
  { x: 47, y: 36, w: 3.6, h: 3.6 }, // coaxial socket (reserved)
  { x: 72, y: 48, w: 4, h: 4 }, // harmonic socket (reserved)
];

// ========================================
// RobotIndustrial (sawtooth) — 96x72 body space
// ========================================
const INDUSTRIAL_SLOTS: readonly GreebleSlot[] = [
  { x: 40, y: 20, w: 8, h: 12 },
  { x: 59.5, y: 21, w: 5, h: 6 },
  { x: 15, y: 20.5, w: 6, h: 5 },
  { x: 15.5, y: 36, w: 7, h: 14 },
  { x: 72, y: 22, w: 14, h: 8 },
  { x: 40, y: 39, w: 6, h: 8 },
  { x: 72, y: 50, w: 14, h: 8 },
  { x: 88.5, y: 36, w: 5, h: 14 },
];

const INDUSTRIAL_FIXTURES: readonly FixtureBox[] = [
  { x: 28, y: 26, w: 16, h: 12 }, // window
  { x: 80, y: 36, w: 8, h: 16 }, // lamp housing
  { x: 50, y: 26, w: 12, h: 16 }, // vent
  { x: 24, y: 50, w: 8, h: 4 }, // warning stripe (left)
  { x: 56, y: 50, w: 8, h: 4 }, // warning stripe (right)
  { x: 40, y: 50, w: 6, h: 6 }, // coaxial socket (reserved)
  { x: 60, y: 55, w: 5, h: 5 }, // harmonic socket (reserved)
];

export interface Pos {
  x: number;
  y: number;
}

// ========================================
// Layer socket positions (Phase 38) — the same two points as each shape's "reserved" entries
// at the tail of its FIXTURE_BOXES array above; transcribed from the Phase 37 sketch header.
// ========================================
const SLEEK_SOCKETS: readonly [Pos, Pos] = [
  { x: 36.5, y: 36 }, // coaxial
  { x: 63.4, y: 36 }, // harmonic
];

const ANGULAR_SOCKETS: readonly [Pos, Pos] = [
  { x: 32, y: 36 }, // coaxial
  { x: 48.5, y: 21 }, // harmonic
];

const ORGANIC_SOCKETS: readonly [Pos, Pos] = [
  { x: 47, y: 36 }, // coaxial
  { x: 72, y: 48 }, // harmonic
];

const INDUSTRIAL_SOCKETS: readonly [Pos, Pos] = [
  { x: 40, y: 50 }, // coaxial
  { x: 60, y: 55 }, // harmonic
];

/** Coaxial, Harmonic socket centers per shape; hand-measured in
 *  docs/sketches/robot-greebles.html, also reserved as fixtures above. Pulse = sine. */
export const SOCKET_POSITIONS: Record<WaveformType, readonly [Pos, Pos]> = {
  sine: SLEEK_SOCKETS,
  square: ANGULAR_SOCKETS,
  triangle: ORGANIC_SOCKETS,
  sawtooth: INDUSTRIAL_SOCKETS,
  pulse: SLEEK_SOCKETS,
};

/** Hand-measured from each shape's SVG after Phase 36; every slot clears the window, lamp,
 *  rivets and the .details group in its shown state (docs/sketches/robot-greebles.html). */
export const GREEBLE_SLOTS: Record<WaveformType, readonly GreebleSlot[]> = {
  sine: SLEEK_SLOTS,
  square: ANGULAR_SLOTS,
  triangle: ORGANIC_SLOTS,
  sawtooth: INDUSTRIAL_SLOTS,
  pulse: SLEEK_SLOTS,
};

/** The fixtures each shape's slot table was measured around — see greebleSlots.test.ts's
 *  collision guard. */
export const FIXTURE_BOXES: Record<WaveformType, readonly FixtureBox[]> = {
  sine: SLEEK_FIXTURES,
  square: ANGULAR_FIXTURES,
  triangle: ORGANIC_FIXTURES,
  sawtooth: INDUSTRIAL_FIXTURES,
  pulse: SLEEK_FIXTURES,
};
