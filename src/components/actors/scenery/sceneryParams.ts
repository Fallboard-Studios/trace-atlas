import Alea from 'alea';
import type { Actor, SceneryKind } from '../../../types/Actor';
import type { HSL } from '../../../utils/colorUtils';
import colorTheme from '../../../constants/colorTheme.json';

// ========================================
// TYPES
// Per-kind parameter shapes, one per row of docs/specs/WORLD_VIEW_DISTRICTS.md §1.9.
// Every kind carries its own `w` — the horizontal footprint `districts.ts`'s
// `spreadXs` uses to advance x for 'edges'/'center' rows, the same role
// `factoryWidthAt` plays for factory rows.
// ========================================

/** §1.9 row: tank. `hueShift`/`satShift` are the LOCAL-only range (roadmap Phase 42 Task 13) —
 *  `placeDistrict` folds them with the AS shift and lean via `foldBodyShift` into
 *  `Actor.config.hueShift`/`.satShift`, which `renderers/tank.tsx` reads instead of these. */
export interface TankParams { w: number; h: number; corner: number; beltCourses: number; hueShift: number; satShift: number }
/** §1.9 row: crane. */
export interface CraneParams { w: number; h: number; hangerFrac: number }
/** §1.9 row: pylon. */
export interface PylonParams { w: number; h: number }
/** §1.9 row: wall. `hueShift`/`satShift` are the LOCAL-only range (roadmap Phase 42 Task 13) —
 *  `placeDistrict` folds them with the AS shift and lean via `foldBodyShift` into
 *  `Actor.config.hueShift`/`.satShift`, which `renderers/wall.tsx` reads instead of these. */
export interface WallParams { w: number; h: number; hueShift: number; satShift: number }
/** §1.9 row: beacon. */
export interface BeaconParams { w: number; mastH: number; gemW: number }
/** §1.9 row: pipeline. */
export interface PipelineParams { w: number; d: number; e: number; riserH: number; riserRight: boolean }
/** §1.9 row: dome. `hueShift`/`satShift` are the LOCAL-only range (roadmap Phase 42 Task 14) —
 *  `placeDistrict` folds them with the AS shift and lean via `foldBodyShift` into
 *  `Actor.config.hueShift`/`.satShift`, which `renderers/dome.tsx` reads instead of these.
 *  `portholeLitRoll` is one seeded 0..1 draw per porthole (length === `portholes`), compared
 *  against the "seeded 40% + 60% × nd" threshold at render time so the lit fraction rises with
 *  `nightDepth` without re-rolling on every tick. */
export interface DomeParams { w: number; bh: number; ry: number; portholes: number; portholeLitRoll: number[]; hueShift: number; satShift: number }
/** §1.9 row: wreck. */
export interface WreckParams { w: number; h: number; deckhouseFrac: number; portholes: number }
/** §1.9 row: turbine. */
export interface TurbineParams { w: number; postH: number; bladeR: number }
/** §1.9 row: boulder. */
export interface BoulderParams { w: number; hFrac: number; count: number; hueShift: number; satShift: number }
/** §1.9 row: vent. */
export interface VentParams { w: number; steps: number }
/** §1.9 row: containers. `hueShift`/`satShift` are the LOCAL-only range (roadmap Phase 42 Task
 *  14) — folded like wall/tank/dome/scaffold into `Actor.config.hueShift`/`.satShift` and applied
 *  on top of whichever accent-pair hue a given box picks (not a replacement for it), so a Sector
 *  Settings retransmit still varies containers the same way it varies every other body-bearing
 *  family. `rowOffsets` (one per row, 0..10) and `labelLitRoll` (one bool per box slot, row-major,
 *  sized `cols * rows` as an upper bound) are both seeded once per actor. */
export interface ContainersParams { w: number; cols: number; rows: number; boxW: number; boxH: number; rowOffsets: number[]; labelLitRoll: boolean[]; hueShift: number; satShift: number }
/** §1.9 row: scaffold. `hueShift`/`satShift` are the LOCAL-only range (roadmap Phase 42 Task 14) —
 *  folded the same way as dome/wall/tank; `renderers/scaffold.tsx` reads the folded
 *  `Actor.config.hueShift`/`.satShift` for the solid-lower body instead of these. */
export interface ScaffoldParams { w: number; h: number; bays: number; solidFrac: number; hueShift: number; satShift: number }
/** §1.9 row: tether. */
export interface TetherParams { w: number; h1: number; dx: number; hasFloat: boolean }
/** §1.9 row: floodlight. */
export interface FloodlightParams { w: number; mastH: number; headOffset: number }
/** §1.9 row: dish. `postH` (90–170) and `tiltRight` (the `rotate(±45)` sign) were missing from
 *  the Task 11 first pass — the row's own "post 10 x (90–170)" and "rotate(±45)" never made it
 *  into the params shape until the renderer (Task 16) actually needed them. */
export interface DishParams { w: number; rx: number; postH: number; tiltRight: boolean }

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
  // tank (M, F): w 90-150, h 140-260, corner 0.35-0.65, 1-3 belt courses. body shell.shadow +
  // shift (lean folded at placement, Task 13) — hue ±20, sat ±15 is a first-pass range (spec §1.9
  // gives no explicit numbers for tank, unlike wall's +40..60/-30..0); tune here if a manual check
  // finds it reads as invisible or overwhelming, same caveat as AS_FACTORY_HUE_SHIFT_RANGE.
  tank: (rng): TankParams => ({
    w: lerp(rng, 90, 150), h: lerp(rng, 140, 260), corner: lerp(rng, 0.35, 0.65), beltCourses: int(rng, 1, 3),
    hueShift: lerp(rng, -20, 20), satShift: lerp(rng, -15, 15),
  }),
  // crane (F): w 220-360, h 260-380, hanger at 0.2-0.8 w.
  crane: (rng): CraneParams => ({ w: lerp(rng, 220, 360), h: lerp(rng, 260, 380), hangerFrac: lerp(rng, 0.2, 0.8) }),
  // pylon (B, M): w 60-90, h 260-420.
  pylon: (rng): PylonParams => ({ w: lerp(rng, 60, 90), h: lerp(rng, 260, 420) }),
  // wall (F): w 160-420, h 28-70, body hue +40..60, sat -30..0 + lean (folded at placement, Task 13).
  wall: (rng): WallParams => ({ w: lerp(rng, 160, 420), h: lerp(rng, 28, 70), hueShift: lerp(rng, 40, 60), satShift: lerp(rng, -30, 0) }),
  // beacon (F): mast 10 x (120-220), foot 60 x 12, gem gw 40-64.
  beacon: (rng): BeaconParams => ({ w: 60, mastH: lerp(rng, 120, 220), gemW: lerp(rng, 40, 64) }),
  // pipeline (M, F): w 320-720, pipe d 14-22, elevation e 34-60, riser d x (90-220) at a seeded end.
  pipeline: (rng): PipelineParams => ({ w: lerp(rng, 320, 720), d: lerp(rng, 14, 22), e: lerp(rng, 34, 60), riserH: lerp(rng, 90, 220), riserRight: rng() < 0.5 }),
  // dome (M, F): w 170-300, base bh 30-60, dome ry 0.28-0.42 w, 3-6 portholes, each with its own
  // seeded lit-threshold roll. body body.base + shift (lean folded at placement, Task 14) — hue
  // +-20, sat +-15 is a first-pass range (spec §1.9 gives no explicit numbers for dome's body,
  // same caveat as tank's), tune here if a manual check finds it reads wrong.
  dome: (rng): DomeParams => {
    const w = lerp(rng, 170, 300);
    const bh = lerp(rng, 30, 60);
    const ry = lerp(rng, 0.28, 0.42) * w;
    const portholes = int(rng, 3, 6);
    const portholeLitRoll = Array.from({ length: portholes }, () => rng());
    const hueShift = lerp(rng, -20, 20);
    const satShift = lerp(rng, -15, 15);
    return { w, bh, ry, portholes, portholeLitRoll, hueShift, satShift };
  },
  // wreck (M, F): w 340-580, h 70-120, deckhouse 0.2-0.3 w, 4-9 dead portholes.
  wreck: (rng): WreckParams => ({ w: lerp(rng, 340, 580), h: lerp(rng, 70, 120), deckhouseFrac: lerp(rng, 0.2, 0.3), portholes: int(rng, 4, 9) }),
  // turbine (B): post 14 x (170-290), blades of 2R (R 60-95) in a rotate(45) group.
  turbine: (rng): TurbineParams => { const bladeR = lerp(rng, 60, 95); return { w: bladeR * 2, postH: lerp(rng, 170, 290), bladeR }; },
  // boulder (B, M, F): 1-3 gems, w 60-150, h 0.5-0.75 w; body.base sat 12, hue +-12, sat +-6.
  boulder: (rng): BoulderParams => ({
    w: lerp(rng, 60, 150),
    hFrac: lerp(rng, 0.5, 0.75),
    count: int(rng, 1, 3),
    hueShift: lerp(rng, -12, 12),
    satShift: lerp(rng, -6, 6),
  }),
  // vent (B, M): base wb 44-90, 4-6 steps.
  vent: (rng): VentParams => ({ w: lerp(rng, 44, 90), steps: int(rng, 4, 6) }),
  // containers (M, F): cols 2-4 x rows 1-3 of (72-110) x (36-44) boxes, one seeded row offset
  // (0-10) per row and one seeded label-lit roll per box slot. Box hue comes from the style's
  // accent pair (§1.9), not body.base — hue +-20, sat +-15 is the per-actor variety shift folded
  // on top of whichever accent hue a box picks (Task 14; same first-pass-range caveat as dome).
  containers: (rng): ContainersParams => {
    const cols = int(rng, 2, 4); const rows = int(rng, 1, 3); const boxW = lerp(rng, 72, 110); const boxH = lerp(rng, 36, 44);
    const rowOffsets = Array.from({ length: rows }, () => lerp(rng, 0, 10));
    const labelLitRoll = Array.from({ length: cols * rows }, () => rng() < 0.5);
    const hueShift = lerp(rng, -20, 20);
    const satShift = lerp(rng, -15, 15);
    return { w: cols * boxW, cols, rows, boxW, boxH, rowOffsets, labelLitRoll, hueShift, satShift };
  },
  // scaffold (M): w 160-260, h 220-380, 2-3 bays, solid lower 25-45%. body body.base + shift
  // (lean folded at placement, Task 14) — hue +-20, sat +-15 is a first-pass range, same caveat
  // as dome/tank above.
  scaffold: (rng): ScaffoldParams => {
    const w = lerp(rng, 160, 260);
    const h = lerp(rng, 220, 380);
    const bays = int(rng, 2, 3);
    const solidFrac = lerp(rng, 0.25, 0.45);
    const hueShift = lerp(rng, -20, 20);
    const satShift = lerp(rng, -15, 15);
    return { w, h, bays, solidFrac, hueShift, satShift };
  },
  // tether (F): anchor 36 x 16, line up h1 120-320, dog-leg |dx| 40-90, 60% carry a float.
  tether: (rng): TetherParams => ({ w: 36, h1: lerp(rng, 120, 320), dx: lerp(rng, 40, 90), hasFloat: rng() < 0.6 }),
  // floodlight (F): mast 10 x (190-310), head offset ±14.
  floodlight: (rng): FloodlightParams => ({ w: 40, mastH: lerp(rng, 190, 310), headOffset: lerp(rng, -14, 14) }),
  // dish (B, M): post 10 x (90-170), ellipse rx 30-48 x 0.32 rx in a rotate(+-45) group.
  dish: (rng): DishParams => {
    const rx = lerp(rng, 30, 48);
    const postH = lerp(rng, 90, 170);
    const tiltRight = rng() < 0.5;
    return { w: rx * 2, rx, postH, tiltRight };
  },
};

/**
 * Conservative upper bound on the number of `rect`/`polygon`/`circle`/`ellipse`/`line`
 * elements a kind's shipped renderer can emit, for the scenery element budget
 * (`SCENERY_SHAPE_BUDGET`, districtRecipes.ts) and per-renderer shape-count tests
 * (spec §5.1). Not wired into any placement logic — a ceiling only.
 */
const MAX_SHAPES: Record<SceneryKind, number> = {
  tank: 10,
  // 2 posts + beam + knee brace + hanger line + load + beam-end light (Task 15).
  crane: 8,
  // 1 tapered tower + 3 cross-arms + 5-shape gem head (GemShape, Task 12's largest branch).
  pylon: 9,
  wall: 3,
  // mast rect + foot rect + 5-shape gem head.
  beacon: 7,
  // pipe + highlight + riser + flange + valve (5) + up to 7 stanchions at w=720
  // (⌊(720-60)/110⌋+1, Task 15's own acceptance formula) — raised from the Task 11
  // first-pass guess of 8, which never accounted for the stanchion count scaling with w.
  pipeline: 12,
  // 2 base rects + 2 dome arc paths + up to 6 portholes + hatch rect + mast rod + mast light.
  dome: 13,
  wreck: 16,
  turbine: 6,
  // up to 3 gems x 5 shapes each (GemShape).
  boulder: 15,
  vent: 10,
  containers: 24,
  scaffold: 24,
  tether: 5,
  floodlight: 6,
  dish: 5,
};

/**
 * The pre-shift base body colour for each body-bearing scenery family (docs/specs/
 * WORLD_VIEW_DISTRICTS.md §1.8) — the "variant base" equivalent for scenery that
 * `foldBodyShift` (factoryPlacementSystem.ts) computes the Phase 35 lean from, exactly as
 * `VARIANT_CONF[variant].colors.body` does for factories. Only kinds present here get a
 * stored, AS-recolorable shift (`placeDistrict`/`recolorActorsForAttenuationStyle`); dome,
 * containers and scaffold join here in roadmap Phase 42 Task 14. Structural families (crane,
 * pylon, boulder, …) are deliberately absent — they store no shift (§1.8).
 *
 * `containers` is the one entry whose renderer doesn't actually paint this colour (its boxes
 * paint the style's accent pair instead, §1.9) — `body.base` here is only the lean's reference
 * direction, same role it plays for dome/scaffold/wall; the fold's *output* shift still lands on
 * `Actor.config` and still gets applied on top of the accent hue at render time, so retransmit
 * still moves containers the same way it moves every other body-bearing family.
 */
export const BODY_BEARING_BASE: Partial<Record<SceneryKind, HSL>> = {
  wall: colorTheme.body.base,
  tank: colorTheme.shell.shadow,
  dome: colorTheme.body.base,
  scaffold: colorTheme.body.base,
  containers: colorTheme.body.base,
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
