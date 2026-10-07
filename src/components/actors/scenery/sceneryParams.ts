import Alea from 'alea';
import type { Actor, SceneryKind } from '../../../types/Actor';

// ========================================
// TYPES
// Per-kind parameter shapes, one per row of docs/specs/WORLD_VIEW_DISTRICTS.md §1.9.
// Every kind carries its own `w` — the horizontal footprint `districts.ts`'s
// `spreadXs` uses to advance x for 'edges'/'center' rows, the same role
// `factoryWidthAt` plays for factory rows.
// ========================================

/** §1.9 row: tank. */
export interface TankParams { w: number; h: number; corner: number; beltCourses: number }
/** §1.9 row: crane. */
export interface CraneParams { w: number; h: number; hangerFrac: number }
/** §1.9 row: pylon. */
export interface PylonParams { w: number; h: number }
/** §1.9 row: wall. */
export interface WallParams { w: number; h: number; hueShift: number; satShift: number }
/** §1.9 row: beacon. */
export interface BeaconParams { w: number; mastH: number; gemW: number }
/** §1.9 row: pipeline. */
export interface PipelineParams { w: number; d: number; e: number; riserH: number; riserRight: boolean }
/** §1.9 row: dome. */
export interface DomeParams { w: number; bh: number; portholes: number }
/** §1.9 row: wreck. */
export interface WreckParams { w: number; h: number; deckhouseFrac: number; portholes: number }
/** §1.9 row: turbine. */
export interface TurbineParams { w: number; postH: number; bladeR: number }
/** §1.9 row: boulder. */
export interface BoulderParams { w: number; hFrac: number; count: number }
/** §1.9 row: vent. */
export interface VentParams { w: number; steps: number }
/** §1.9 row: containers. */
export interface ContainersParams { w: number; cols: number; rows: number; boxW: number; boxH: number }
/** §1.9 row: scaffold. */
export interface ScaffoldParams { w: number; h: number; bays: number; solidFrac: number }
/** §1.9 row: tether. */
export interface TetherParams { w: number; h1: number; dx: number; hasFloat: boolean }
/** §1.9 row: floodlight. */
export interface FloodlightParams { w: number; mastH: number; headOffset: number }
/** §1.9 row: dish. */
export interface DishParams { w: number; rx: number }

/**
 * Per-actor scenery parameters (docs/specs/WORLD_VIEW_DISTRICTS.md §1.8/§4):
 * `Alea(actor.id)`-derived once per actor, keyed only by that actor's own
 * `config.kind` — a wall actor's `SceneryParams` carries `wall`, never any
 * other kind's key.
 */
export interface SceneryParams {
  tank?: TankParams;
  crane?: CraneParams;
  pylon?: PylonParams;
  wall?: WallParams;
  beacon?: BeaconParams;
  pipeline?: PipelineParams;
  dome?: DomeParams;
  wreck?: WreckParams;
  turbine?: TurbineParams;
  boulder?: BoulderParams;
  vent?: VentParams;
  containers?: ContainersParams;
  scaffold?: ScaffoldParams;
  tether?: TetherParams;
  floodlight?: FloodlightParams;
  dish?: DishParams;
}

// ========================================
// RANGE GENERATORS
// One per kind, each drawing from a shared `Alea(actor.id)` prng in a fixed
// order (determinism — same id, same draws, every call). Every range is
// commented with the §1.9 row it implements.
// ========================================

const lerp = (rng: () => number, min: number, max: number): number => min + rng() * (max - min);
const int = (rng: () => number, min: number, max: number): number => Math.floor(lerp(rng, min, max + 1));

type Draw<T> = (rng: () => number) => T;

const RANGE_TABLE: { [K in SceneryKind]: Draw<NonNullable<SceneryParams[K]>> } = {
  // tank (M, F): w 90-150, h 140-260, corner 0.35-0.65, 1-3 belt courses.
  tank: (rng): TankParams => ({ w: lerp(rng, 90, 150), h: lerp(rng, 140, 260), corner: lerp(rng, 0.35, 0.65), beltCourses: int(rng, 1, 3) }),
  // crane (F): w 220-360, h 260-380, hanger at 0.2-0.8 w.
  crane: (rng): CraneParams => ({ w: lerp(rng, 220, 360), h: lerp(rng, 260, 380), hangerFrac: lerp(rng, 0.2, 0.8) }),
  // pylon (B, M): w 60-90, h 260-420.
  pylon: (rng): PylonParams => ({ w: lerp(rng, 60, 90), h: lerp(rng, 260, 420) }),
  // wall (F): w 160-420, h 28-70, body hue +40..60, sat -30..0 (lean added at placement, T13).
  wall: (rng): WallParams => ({ w: lerp(rng, 160, 420), h: lerp(rng, 28, 70), hueShift: lerp(rng, 40, 60), satShift: lerp(rng, -30, 0) }),
  // beacon (F): mast 10 x (120-220), foot 60 x 12, gem gw 40-64.
  beacon: (rng): BeaconParams => ({ w: 60, mastH: lerp(rng, 120, 220), gemW: lerp(rng, 40, 64) }),
  // pipeline (M, F): w 320-720, pipe d 14-22, elevation e 34-60, riser d x (90-220) at a seeded end.
  pipeline: (rng): PipelineParams => ({ w: lerp(rng, 320, 720), d: lerp(rng, 14, 22), e: lerp(rng, 34, 60), riserH: lerp(rng, 90, 220), riserRight: rng() < 0.5 }),
  // dome (M, F): w 170-300, base bh 30-60, 3-6 portholes.
  dome: (rng): DomeParams => ({ w: lerp(rng, 170, 300), bh: lerp(rng, 30, 60), portholes: int(rng, 3, 6) }),
  // wreck (M, F): w 340-580, h 70-120, deckhouse 0.2-0.3 w, 4-9 dead portholes.
  wreck: (rng): WreckParams => ({ w: lerp(rng, 340, 580), h: lerp(rng, 70, 120), deckhouseFrac: lerp(rng, 0.2, 0.3), portholes: int(rng, 4, 9) }),
  // turbine (B): post 14 x (170-290), blades of 2R (R 60-95) in a rotate(45) group.
  turbine: (rng): TurbineParams => { const bladeR = lerp(rng, 60, 95); return { w: bladeR * 2, postH: lerp(rng, 170, 290), bladeR }; },
  // boulder (B, M, F): 1-3 gems, w 60-150, h 0.5-0.75 w.
  boulder: (rng): BoulderParams => ({ w: lerp(rng, 60, 150), hFrac: lerp(rng, 0.5, 0.75), count: int(rng, 1, 3) }),
  // vent (B, M): base wb 44-90, 4-6 steps.
  vent: (rng): VentParams => ({ w: lerp(rng, 44, 90), steps: int(rng, 4, 6) }),
  // containers (M, F): cols 2-4 x rows 1-3 of (72-110) x (36-44) boxes.
  containers: (rng): ContainersParams => {
    const cols = int(rng, 2, 4); const rows = int(rng, 1, 3); const boxW = lerp(rng, 72, 110); const boxH = lerp(rng, 36, 44);
    return { w: cols * boxW, cols, rows, boxW, boxH };
  },
  // scaffold (M): w 160-260, h 220-380, 2-3 bays, solid lower 25-45%.
  scaffold: (rng): ScaffoldParams => ({ w: lerp(rng, 160, 260), h: lerp(rng, 220, 380), bays: int(rng, 2, 3), solidFrac: lerp(rng, 0.25, 0.45) }),
  // tether (F): anchor 36 x 16, line up h1 120-320, dog-leg |dx| 40-90, 60% carry a float.
  tether: (rng): TetherParams => ({ w: 36, h1: lerp(rng, 120, 320), dx: lerp(rng, 40, 90), hasFloat: rng() < 0.6 }),
  // floodlight (F): mast 10 x (190-310), head offset ±14.
  floodlight: (rng): FloodlightParams => ({ w: 40, mastH: lerp(rng, 190, 310), headOffset: lerp(rng, -14, 14) }),
  // dish (B, M): post 10 x (90-170), ellipse rx 30-48.
  dish: (rng): DishParams => { const rx = lerp(rng, 30, 48); return { w: rx * 2, rx }; },
};

/**
 * Conservative upper bound on the number of `rect`/`polygon`/`circle`/`ellipse`/`line`
 * elements a kind's shipped renderer can emit, for the scenery element budget
 * (`SCENERY_SHAPE_BUDGET`, districtRecipes.ts) and per-renderer shape-count tests
 * (spec §5.1). Not wired into any placement logic — a ceiling only.
 */
const MAX_SHAPES: Record<SceneryKind, number> = {
  tank: 10,
  crane: 8,
  pylon: 6,
  wall: 3,
  beacon: 6,
  pipeline: 8,
  dome: 12,
  wreck: 16,
  turbine: 6,
  boulder: 6,
  vent: 10,
  containers: 24,
  scaffold: 24,
  tether: 5,
  floodlight: 6,
  dish: 5,
};

// ========================================
// EXPORTS
// ========================================

/**
 * Per-actor, per-kind scenery parameters (docs/specs/WORLD_VIEW_DISTRICTS.md
 * §1.8/§4): `Alea(actor.id)`-derived once per actor, in draw order fixed by
 * `RANGE_TABLE`. `actor.config.kind` is required — an actor with no kind
 * (not a scenery actor) gets an empty params object.
 */
export function deriveSceneryParams(actor: Actor): SceneryParams {
  const kind = actor.config?.kind;
  if (!kind) return {};
  const rng = Alea(actor.id);
  return { [kind]: RANGE_TABLE[kind](rng) } as SceneryParams;
}

/** See `MAX_SHAPES` above. */
export function maxShapes(kind: SceneryKind): number {
  return MAX_SHAPES[kind];
}
