# Robot Visual Design Guide

## Overview

A robot is a seeded stack of low-poly **gem polygons** (Roadmap Phase 39, spec
[GEM_POLYGON_ROBOTS.md](specs/GEM_POLYGON_ROBOTS.md), sketch
[gem-polygon-robots.html](sketches/gem-polygon-robots.html)), with four orbiters docked to its hull
(Roadmap Phase 40, spec [ORBITING_POLYGONS.md](specs/ORBITING_POLYGONS.md)). Its body is **identity
and seed, not audio**: the geometry comes from `Robot.gemSeed`, the colour from
`Robot.identityColor`. Audio reaches the backing, Mids and Top only through three continuous dials —
the two lights, each Mid polygon's lit level, and the body scale — so an audio edit can brighten, dim
or resize a robot but never change a count, a side, a line or a position there. The orbiters are the
one exception: composition settings (not audio) drive how many are attached and their size/line/strip
("Orbiters" below), and an attach/detach always animates — never a pop. Day/night lightness and
battery dimming are the two overlays.

The geometry is never stored: `Robot.gemSeed` is the only persisted value, and
`getRobotGem(gemSeed)` derives the parts on demand, cached per seed for the life of the page
(runtime-only, like `timelineMap` — never in Zustand, never in a session).

**Related references:**
- [Audio System Guide](AUDIO_SYSTEM.md) — AudioEngine, layered voices
- [Animation System Guide](ANIMATION_SYSTEM.md) — GSAP timeline patterns for robot motion
- [Procedural Generation](PROCEDURAL_GENERATION.md) — `getSeededVal`, the `'robot.gem.seed'` dataId
- [Performance](PERFORMANCE.md) — "Gem Polygon Robots — the Task 9 idle-paint gate"
- [Orbiting Polygons spec](specs/ORBITING_POLYGONS.md) — the orbiter dock/attach/detach design (Phase 40)

## The generator

`src/components/robot/gem/polygon.ts`, pure functions over a seeded stream (`alea`), ported from the
Gate 1 sketch. `generateRobotGem` lays out one robot on a canvas `GEM_CANVAS_H` (80) units tall and
80 × a seeded width factor (1, 1.25, 1.5, 1.75 or 2) wide:

| Part | Box | Rules | Lines | Lights | Z |
|---|---|---|---|---|---|
| Backing | 25k × 25, centred | `BASE_RULES`: convex, may be symmetric, no bevel, near-black | 0 | 0 | lowest |
| Mid left | 20–24k × 34–36, right edge on the centre line | `MAIN_RULES`: ≤ 2 concave, never symmetric | 2 | 0 | 2nd lowest |
| Mid right | 20–24k × 34–36, left edge on the centre line | `MAIN_RULES` | 2 | 0 | 3rd lowest |
| Orbiters ×4 | 24 × 16, docked at Top's four corners (Phase 40) — never stretched by the width factor | `ORBIT_RULES`: ≤ 4 concave corners, may be symmetric | 1 each | 0 | 2nd highest |
| Top | 32k × 32, centred | `MAIN_RULES` | 4 | 2 | highest |

(k = width factor.) Orbiters straddle Top's four corners — half tucked under it — by design: Phase
40 docks them to the hull, nestled between Mid and Top, rather than the Phase 39 layout that kept
them clear at the canvas corners for an orbit that no longer exists.

Every polygon has 8–12 sides, every edge at a multiple of 15°, at most 4 right angles, and touches
all four edges of its own box. `genPolygon` builds a chamfered rectangle — each corner left square,
cut once (`chamfer`), cut twice at complementary angles (`double`) or stepped with a slanted inner
wall (`step`, one concave corner) — with every cut capped at 45 % of its edge, then rejection-samples
until the rules hold **and** `bevelHolds`: the part's own bevel must not invert any edge (short edges
otherwise bow-tie under the inset).

Boundary lines (`genLine`) run from one inner edge to another as one 45° run plus one axis-aligned
run, at least 0.35 units clear of every facet edge (half the 0.8 stroke). Lights (`genLights`) sit
at two non-adjacent inner vertices, pulled 30 % toward the vertex mean. Each part retries its
outline until all its lines and lights fit, so the counts are guaranteed.

## Bevel and shading

Every part except the backing is a **bevel ring**: the outline, its inset by `bevelDepth(w, h)` =
min(2.5, 18 % of the short side), and one trapezoid facet per edge between them; the inset is the
flat face. `src/components/robot/gem/gemShading.ts`:

- **One light for every robot**, `GEM_LIGHT`, from the top-left. A facet's shade is its edge's
  outward normal · `GEM_LIGHT` (−1..1).
- `facetTone` moves the host colour's lightness by shade × `GEM_FACET_CONTRAST` (20).
- **`GEM_FACET_TONES` = 3**: shades are quantized to three levels (fully lit, neutral, fully
  shaded) before toning. This was a performance decision (the moving robot layer re-rasterizes
  every frame and its cost tracks paint operations); the extremes keep full contrast.
- `quantizeShade` is shared with world scenery (roadmap Phase 42 D2): `scenery/gemShape.tsx`
  imports it from `gemShading.ts` for its own three-tone gem accents, rather than re-deriving tone
  quantisation or reusing the robot generator (`getRobotGem`) — see BUILDING_DESIGN.md "Scenery
  families".

`RobotGem` draws each part's facets as one `<path>` per tone (`facetPaths` in `gemPaths.ts`), its
face as one polygon and its boundary lines as one path — about 40 drawn shapes per robot.

## Colour

`src/components/robot/gem/gemPalette.ts` — `gemPalette(gem, identityColor, daylight, midLit,
contrast)` resolves every colour `RobotGem` draws into a string; the renderer computes none.

| Part | Fill | Lines |
|---|---|---|
| Top, orbiters | `identityColor` | identity, lightness −26 |
| Mid | from near-neutral dark toward identity (lightness −16, saturation −18) by its lit level, keeping identity's hue | the matching dark→identity line tone |
| Backing | near-black, fixed | — |
| Lights | warm white, fixed (emissive) | — |

Facet fills are the face colour toned per quantized shade; the facet stroke is the fully shaded tone.

## What audio drives

Three continuous dials, all computed in `RobotBody`'s audio memo from `robotVisualHelpers.ts` — and
nothing else:

- **Lights** — `calculateLampIntensity(layers, detail)`: averaged audible layer gain blended with
  release (`bodyShapeFromAdsr(adsr).detail`), floored at `LAMP_MIN`; both lights equal.
- **Mid lit level** — `layerLitLevel(gain)`: Mid left ← Coaxial (`layers[1]`), Mid right ←
  Harmonic (`layers[2]`). Gain 0 or no layer → `MID_DARK_LEVEL`; otherwise `MID_LIT_MIN`..1 up to
  `MID_GAIN_MAX`. A gain drag slides the Mid's tone; nothing pops.
- **Body scale** — `calculateBodyScale(octaveRange, bodyShapeFromAdsr(adsr).scale)`: register step
  × attack bias, floored at `BODY_SCALE_MIN`; range 0.735–1.69, about the canvas centre.

Waveform, filter frequency, phase and detune have no visual mapping on gem robots (later branches
in [gem-polygon-robots.md](ideas/gem-polygon-robots.md) may map them to geometry or motion).

## Orbiters

The four orbiter polygons are the one part of the body composition settings drive directly (Roadmap
Phase 40, spec [ORBITING_POLYGONS.md](specs/ORBITING_POLYGONS.md)) — not audio, and never a pop.
`src/components/robot/gem/orbiterDials.ts` maps four composition fields to four dials, clamped to
their `constants/index.ts` ranges:

| Dial | Source | Rule |
|---|---|---|
| Count (1–4) | `rhythmicDensity` | <25 → 1, ≤50 → 2, ≤75 → 3, 76+ → 4 (`ORBITER_COUNT_BREAKS`) |
| Size | `rhythmicMotifLength.value` (0–8) | 0.75× … 1.25× (`ORBITER_SIZE_MIN/MAX`), 0.5 s tween on edit |
| Boundary-line width | `noteVariance.value` (0–8) | 0.3 … 1.1 (today's fixed Mid/Top 0.8 sits inside) |
| Strip opacity | `pitchRepeat` (0–100) | 0.35 … 1.0 — a centre stroke in `palette.light`, never battery-dimmed |

**Dock, don't orbit.** Each robot has a seeded corner order (`orbiterPlan(gemSeed)`, a stream
independent of the geometry generator's own — `gem.fixture.json` is untouched). The first `count`
corners of that order are *attached*: docked at Top's own corner (the generator table above), rigid
with the body, no idle motion. On spawn — including a robot's own first mount — every initially
attached corner flies a short hop into place (`useOrbiterMotion.ts`'s `flyIn`: dropped, shrunk and
faded, then `back.out` into its dock). A count increase flies in the next corner in order; a count
decrease flies the last-attached corner back out in reverse (`flyOut`) and hides it. Both are
animated, never a pop; `prefers-reduced-motion` swaps the hop for a 0.3 s opacity fade. At most one
count-driven attach/detach runs at a time per robot, tracked by a per-corner busy set so it can
never retarget a corner still mid-flight.

**Jobs lock the orbiters** (Roadmap Phase 43). In the world context only, `useOrbiterMotion`
registers `{ lock, unlock }` with `registerOrbiterWork` (`robotMotionRegistry.ts`). A working
robot's job locks them: any hop in flight finishes, count changes stop moving corners, and the job
flies the shown orbiters out to the building, works and flies them back to their docks. On unlock
the orbiters catch up to the current count in one pass, so a density edit mid-job never interrupts
the work and never pops. The hook knows only that it can be locked. Count still decides how many
orbiters work; it doesn't change how long a job takes. Cards and the detail avatar never lock
and never animate a job. The loop and the job timeline are in [ROBOT_LIFECYCLE.md](ROBOT_LIFECYCLE.md)
and [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#job-timeline).

## Non-audio overlays

Both are read outside the audio memo, so the once-a-second daylight tick never recomputes it
(backlog item 22).

- **Day/night** — the active locale's local time gives a 0..1 daylight multiplier that scales the
  lightness of every palette colour except the lights. `ignoreDaylight` pins it to 1.
- **Battery** — `computeBatteryDimOpacity(batteryLevel)` (1 / 0.75 / 0.5 / 0.1) multiplies the
  lights' opacity, and `batteryFacetContrast` lowers facet contrast with it, floored at
  `GEM_BATTERY_CONTRAST_FLOOR` (0.25) so the bevel never vanishes.

## Render contexts

- **World** — `Robot.tsx` owns the root `<g>` (GSAP sets position; React sets no transform — robots
  stopped mirroring on direction change in Phase 40, so there is no `scaleX` flip any more) and
  renders `RobotBody`, which composes `RobotGem` with the audio scale. `motion="world"` enables
  `useOrbiterMotion`.
  - **The back row** (Roadmap Phase 43 J4). A robot working at a background building, or exiting a
    station, is drawn in the back robot row, behind the midground, at `BACK_LAYER_SCALE` (0.75).
    That scale is on `.robot__row`, a wrapper between the root `<g>` and `RobotBody`, about the
    gem canvas centre, so it multiplies the body scale (0.735–1.69 becomes 0.55–1.27) without
    touching any dial. It is depth, not audio: the work loop eases it over the swim into or out of
    the row, never a pop, and the scene's depth tints haze that row like the buildings around it.
    Neither is a robot overlay, so day/night and battery stay the only two. The root `<g>` carries
    `id="world-robot-{id}"`, which the layer switch's dissolve copy points at
    ([ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#layer-switch)).
- **Detail avatar (96 px)** — `RobotDisplaySection` passes `motion="avatar"` (orbiters attach/detach
  here too) and `viewBox={gemMotionViewBox(gem)}` — the plain `gemViewBox` canvas, padded for an
  orbiter's dock position at its maximum size and its attach/detach flight; usually a small or zero
  pad, since the docks sit close to Top's own corners.
- **Selection card (64 px)** — no `motion` prop: orbiters render statically, the first `count` of
  the seeded order at `scale(size)`, no hook, no animation. `viewBox={gemViewBox(gem)}` (`0 0 W 80`),
  unchanged from Phase 39.
- Both avatar and card: `preserveAspectRatio="xMidYMid meet"` and `RobotBody ignoreDaylight
  ignoreScale` fit every robot to its tile at scale 1. Body scale shows in-world only.

## Data flow

```
spawnSystem: getSeededVal('robot.gem.seed') ──► Robot.gemSeed (persisted)
                                                   │
RobotBody ─ getRobotGem(gemSeed) [cache] ──► RobotGem geometry (runtime only)
        ├─ audio memo:       scale, lamp intensity, midLit   (audioAttributes, octaveRange)
        ├─ composition memo: orbiterDials(robot)             (density/motif/variance/pitchRepeat)
        ├─ orbiterPlan(gemSeed) [cache, :orbit stream]        — seeded cornerOrder, outside both memos
        ├─ outside:          daylight, battery dim, identityColor
        ├─ gemPalette(...) ──► RobotGem (draw-only)
        └─ useOrbiterMotion(root, plan, dials, enabled) ──► GSAP attach/detach on RobotGem's orbiters
```

`gemSeed` is drawn once at spawn, never user-edited, never inherited on the copy path and never
diffed into a session — a reloaded world regenerates the same seed, hence the same robot.

## Forbidden patterns

- Storing generated geometry (a `RobotGem`) in Zustand, a session or a fixture — only `gemSeed`.
- Any audio edit changing the backing/Mids/Top's layout — count, sides, lines, lights or position —
  or swapping geometry. Orbiters are the one exception, and only through their dials: an attach or
  detach always plays the hop (or its reduced-motion fade), never a pop.
- Computing a colour inside `RobotGem`, or drawing one element per facet or line.
- Hand-placed, per-shape positions — everything is generated relative to the part's own polygon.
- A palette for the body that ignores `identityColor`, or a new non-audio visual input beyond
  identity, seed, daylight and battery without amending the Visual Mapping guardrail.
- A React-owned `transform`/`display`/`opacity` on an orbiter's outer group in an animated context
  (`motion="world"`/`"avatar"`) — `useOrbiterMotion`'s GSAP is the only writer there.
- `requestAnimationFrame` loops or timers for robot visuals; GSAP owns motion.
