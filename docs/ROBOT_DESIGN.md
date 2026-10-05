# Robot Visual Design Guide

## Overview

A robot is a seeded stack of low-poly **gem polygons** (Roadmap Phase 39, spec
[GEM_POLYGON_ROBOTS.md](specs/GEM_POLYGON_ROBOTS.md), sketch
[gem-polygon-robots.html](sketches/gem-polygon-robots.html)). Its body is **identity and seed, not
audio**: the geometry comes from `Robot.gemSeed`, the colour from `Robot.identityColor`. Audio
reaches the body only through three continuous dials — the two lights, each Mid polygon's lit
level, and the body scale — so an audio edit can brighten, dim or resize a robot but never change a
count, a side, a line or a position. Day/night lightness and battery dimming are the two overlays.

The geometry is never stored: `Robot.gemSeed` is the only persisted value, and
`getRobotGem(gemSeed)` derives the parts on demand, cached per seed for the life of the page
(runtime-only, like `timelineMap` — never in Zustand, never in a session).

**Related references:**
- [Audio System Guide](AUDIO_SYSTEM.md) — AudioEngine, layered voices
- [Animation System Guide](ANIMATION_SYSTEM.md) — GSAP timeline patterns for robot motion
- [Procedural Generation](PROCEDURAL_GENERATION.md) — `getSeededVal`, the `'robot.gem.seed'` dataId
- [Performance](PERFORMANCE.md) — "Gem Polygon Robots — the Task 9 idle-paint gate"

## The generator

`src/components/robot/gem/polygon.ts`, pure functions over a seeded stream (`alea`), ported from the
Gate 1 sketch. `generateRobotGem` lays out one robot on a canvas `GEM_CANVAS_H` (80) units tall and
80 × a seeded width factor (1, 1.25, 1.5, 1.75 or 2) wide:

| Part | Box | Rules | Lines | Lights | Z |
|---|---|---|---|---|---|
| Backing | 25k × 25, centred | `BASE_RULES`: convex, may be symmetric, no bevel, near-black | 0 | 0 | lowest |
| Orbiters ×4 | 24 × 16, one per corner — never stretched by the width factor | `ORBIT_RULES`: ≤ 4 concave corners, may be symmetric | 1 each | 0 | 2nd lowest |
| Mid left | 20–24k × 34–36, right edge on the centre line | `MAIN_RULES`: ≤ 2 concave, never symmetric | 2 | 0 | 3rd highest |
| Mid right | 20–24k × 34–36, left edge on the centre line | `MAIN_RULES` | 2 | 0 | 2nd highest |
| Top | 32k × 32, centred | `MAIN_RULES` | 4 | 2 | highest |

(k = width factor.) The 80-unit height keeps the orbiters clear of the body at rest; contact is
reserved for animation.

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

## Non-audio overlays

Both are read outside the audio memo, so the once-a-second daylight tick never recomputes it
(backlog item 22).

- **Day/night** — the active locale's local time gives a 0..1 daylight multiplier that scales the
  lightness of every palette colour except the lights. `ignoreDaylight` pins it to 1.
- **Battery** — `computeBatteryDimOpacity(batteryLevel)` (1 / 0.75 / 0.5 / 0.1) multiplies the
  lights' opacity, and `batteryFacetContrast` lowers facet contrast with it, floored at
  `GEM_BATTERY_CONTRAST_FLOOR` (0.25) so the bevel never vanishes.

## Render contexts

- **World** — `Robot.tsx` owns the root `<g>` (GSAP sets position and the `scaleX` flip; React
  sets no transform) and renders `RobotBody`, which composes `RobotGem` with the audio scale.
- **Detail avatar (96 px) and selection card (64 px)** — `viewBox={gemViewBox(gem)}` (`0 0 W 80`),
  `preserveAspectRatio="xMidYMid meet"`, and `RobotBody ignoreDaylight ignoreScale`: every robot is
  fitted to its tile at scale 1, orbiters included. Body scale shows in-world only.

## Data flow

```
spawnSystem: getSeededVal('robot.gem.seed') ──► Robot.gemSeed (persisted)
                                                   │
RobotBody ─ getRobotGem(gemSeed) [cache] ──► RobotGem geometry (runtime only)
        ├─ audio memo: scale, lamp intensity, midLit   (audioAttributes, octaveRange)
        ├─ outside:    daylight, battery dim, identityColor
        └─ gemPalette(...) ──► RobotGem (draw-only)
```

`gemSeed` is drawn once at spawn, never user-edited, never inherited on the copy path and never
diffed into a session — a reloaded world regenerates the same seed, hence the same robot.

## Forbidden patterns

- Storing generated geometry (a `RobotGem`) in Zustand, a session or a fixture — only `gemSeed`.
- Any audio edit changing a part's count, sides, lines, lights or position, or swapping geometry.
- Computing a colour inside `RobotGem`, or drawing one element per facet or line.
- Hand-placed, per-shape positions — everything is generated relative to the part's own polygon.
- A palette for the body that ignores `identityColor`, or a new non-audio visual input beyond
  identity, seed, daylight and battery without amending the Visual Mapping guardrail.
- `requestAnimationFrame` loops or timers for robot visuals; GSAP owns motion.
