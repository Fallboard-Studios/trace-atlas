# Phase Spec: Gem Polygon Robots — Branch A (seeded body, audio light)

> **Shipped (roadmap Phase 39, 2026-10-05)** — plan [docs/tasks/GEM_POLYGON_ROBOTS.md](../tasks/GEM_POLYGON_ROBOTS.md); as-built deviations are recorded inline and in the plan. Gate 1 (sketch) and Gate 2 (live) passed; the idle-paint gate closed with 3 facet tones on an accepted residual. Branch `back-to-gen-robots`.

Roadmap Phase 39. Idea: [docs/ideas/gem-polygon-robots.md](../ideas/gem-polygon-robots.md).
Intent: [docs/intent/gem-polygon-robots.md](../intent/gem-polygon-robots.md). Sketch:
[docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html) — **Gate 1 passed
2026-10-04** ("Looks great") with two amendments folded in below: the canvas grew to 80 tall so the
orbiters sit clear of the body at rest, and the orbiters ignore the width factor (always 24×16).

Replaces the four hand-drawn shapes (`RobotSleek/Angular/Organic/Industrial`), the Phase 37 greebles
and the Phase 38 layer sockets with one generated renderer. Branches B (audio → geometry/bevel/Mid
hue, orbiters = LFO links) and C (motion) are separate later specs; nothing from them lands here.

## Assumptions (correct these before the plan)

1. **Geometry is derived from a seed, never stored.** *(Crawford, 2026-10-04: geometry is
   determined by the seed.)* `Robot.gemSeed` is one seeded integer drawn at spawn; the vertex
   lists are produced by `getRobotGem(seed)`, a module-level cache (`Map<number, RobotGem>`) in
   front of the pure generator — computed once per seed for the life of the page, never in Zustand
   (the timelineMap pattern: runtime-only objects live in a module registry). The rejection loops
   therefore run once per robot, not per mount.
2. **Lit level of a Mid is continuous**, the Phase 38 `socketLitOpacity` curve applied to that
   layer's gain, blending the Mid's tone between dark and lit — so a gain drag slides, never pops.
3. **Light intensity keeps today's formula** (`calculateLampIntensity(layers, detail)` with `detail`
   from `bodyShapeFromAdsr`), split across the two Top lights equally. ADSR therefore still reaches
   the body through light brightness only.
4. **Body scale keeps today's formula** (`calculateBodyScale(octaveRange, bodyShape.scale)`, floor
   `BODY_SCALE_MIN` 0.735) applied to the whole canvas group about the canvas centre.
5. **Battery dims the lights (as today) and lowers facet contrast**; day/night multiplies lightness
   of every tone (as today's `applyLightnessMultiplier`). Both outside the audio memo.
6. **Element count roughly doubles per robot** (~85 SVG elements vs ~40). The idle-paint harness is
   the gate (§5); if it regresses, the first cut is orbiter boundary lines, then facet strokes.
7. **World position semantics are unchanged**: the robot `<g>` origin is the canvas top-left, as the
   96×72 body's was; the horizontal extent now varies per robot (80–160). No code outside
   `src/components/robot/` reads the body size (grep-confirmed), so spawn/placement is unaffected.

## 1. Overview & Claude Explanation

### 1.1 Data: `Robot.gemSeed` → `RobotGem`

The robot carries only the seed:

```ts
/** Seeded at spawn ('robot.gem.seed'); the geometry is getRobotGem(gemSeed), never stored. */
gemSeed: number;
```

`getRobotGem(seed)` (in `polygon.ts`) returns the cached `RobotGem` for that seed, generating it on
first request from an `alea(String(seed))` stream. `RobotGem` is runtime-only — it never enters
Zustand, a session or a test fixture's `Robot` literal (fixtures set `gemSeed`, the cache does the
rest):

```ts
/** Box-local point, two decimals, units = canvas units (canvas is GEM_CANVAS_H = 80 tall). */
export type GemPoint = [number, number];

export interface GemPart {
  /** Top-left of the part's box on the canvas — layout is computed here, not in the renderer
   *  (Task 2), so RobotGem stays draw-only. */
  x: number; y: number;
  /** Bounding box the polygon fills (touches all four edges); orbiters are always 24×16. */
  w: number; h: number;
  /** Clockwise outline, 8–12 vertices, every edge at a multiple of 15°. Box-local. */
  pts: GemPoint[];
  /** The bevel inset of `pts` (the face); equals `pts` on the unbevelled backing (Task 2). */
  inner: GemPoint[];
  /** Boundary lines on the inner polygon: 2–3 points each, 0°/45°/90° segments only. */
  lines: GemPoint[][];
  /** Top polygon only: the two light positions. Empty elsewhere. */
  lights: GemPoint[];
}

export interface RobotGem {
  /** Canvas width = GEM_CANVAS_H × widthFactor. */
  widthFactor: 1 | 1.25 | 1.5 | 1.75 | 2;
  backing: GemPart;   // ~25k×25, convex, may be symmetric, no bevel
  orbiters: [GemPart, GemPart, GemPart, GemPart]; // 24×16, TL/TR/BL/BR, 1 line each
  midLeft: GemPart;   // 20–24k × 34–36, right edge on the canvas centre line, 2 lines — third-highest z
  midRight: GemPart;  // 20–24k × 34–36, left edge on the canvas centre line, 2 lines — second-highest z
  top: GemPart;       // 32k×32, 4 lines, 2 lights
}
```

> **Z-order correction (Task 2, 2026-10-04).** An earlier draft of this spec drew `midRight` below
> `midLeft`. Crawford's outline gives the Mid whose *left* edge is on the centre line (`midRight`)
> the second-highest z and the other the third, and the Gate 1 sketch draws them that way. Draw
> order is therefore backing → orbiters → midLeft → midRight → top throughout.

`gemSeed` is drawn at spawn in `spawnSystem.ts` like `identityColor`/`greebles`:
`Math.floor(getSeededVal(noiseMap, 'robot.gem.seed', spawnCount, 0, 2 ** 31))`. Not inherited on
the copy path, never user-edited, never diffed into a session (a reloaded session regenerates the
same seed, hence the same geometry). `Robot.greebles` and `generateGreebles`/`GREEBLE_COUNT_RANGE`/
`'robot.greeble.*'` are deleted (the dataIds are retired, not renamed — a breaking change to world
generation that is accepted: every robot's look changes anyway).

### 1.2 Generator (`src/components/robot/gem/polygon.ts`)

Pure functions over a `() => number` stream, ported 1:1 from the sketch's `<script>`:

- `genPolygon(R, w, h, rules)` — chamfered rectangle: each corner is `none` (a right angle),
  `chamfer` (1 extra side; angle ∈ {15,30,45,60,75}°), `double` (2 extra sides; complementary pairs
  (75,15) or (60,30) meeting at an interior vertex) or `step` (Main/orbiter only; 2 extra sides, one
  concave corner + one right angle, inner wall at 45° or 60°). Every cut's reach along an edge is
  capped at 45% of that edge (so two cuts never meet); a step's inner wall is floored at 20% of the
  short side or falls back to a chamfer. The `double` corner solves its two edges' intersection
  generally (the sketch's formula assumed equal cut lengths and drifted off the 15° grid otherwise —
  Task 1). Rejection-sampled until: 8 ≤ sides ≤ 12, right ≤ 4, concave ≤ `rules.maxConcave`,
  (Main) not mirror-symmetric on either axis, and **`bevelHolds(pts, bevelDepth(w, h))`** — the
  part's own bevel inverts no edge (Task 1: short step walls and leftover box edges bow-tied under
  a 2.5 bevel; one rejection rule covers every corner kind). `bevelDepth`/`GEM_BEVEL_DEPTH`
  therefore live in `polygon.ts`; `gemShading.ts` re-exports them.
  Rules: `BASE_RULES` (convex, symmetric ok, 0 concave), `MAIN_RULES` (≤2 concave, asymmetric),
  `ORBIT_RULES` (≤4 concave, symmetric ok). Edge-touch holds by construction (cuts < half an edge).
- `inset(pts, d)` — miter offset of every edge inward by `d`; outward normals from winding
  (signed area), not the centroid.
- `genLine(R, inner)` — a boundary line from one inner edge to another, routed as one 45° segment
  plus one axis-aligned segment (order seeded), endpoints 0.4 inside the inner polygon, and every
  segment at least `LINE_CLEARANCE` 0.35 from every inner edge (≈ half the 0.8 stroke, so the
  *drawn* line never touches a facet — Task 2 found lines bending past concave corners closer than
  that); up to 60 tries, else null.
- `genLights(R, inner)` — two non-adjacent inner vertices, each pulled 30% toward the vertex mean.
- `generateRobotGem(R)` — width factor from {1, 1.25, 1.5, 1.75, 2}, then the parts in draw order
  (backing, four orbiters, midLeft, midRight, top). Each part retries its whole outline until all
  its lines and lights fit, so the counts are guaranteed.

Determinism: the same stream seed yields byte-identical `RobotGem`; `robotGem.test.ts` pins one
fixture seed's output (`gem.fixture.json`).

### 1.3 Bevel and facet shading (`gemShading.ts`)

- Bevel depth `d = min(GEM_BEVEL_DEPTH 2.5, 0.18 × min(w, h))`; facets are the quads
  `[outer[i], outer[i+1], inner[i+1], inner[i]]`; the face is the inner polygon. Backing has no bevel.
- One light direction for every robot: `GEM_LIGHT = normalize(-0.55, -0.83)` (top-left).
  `shade_i = n_i · GEM_LIGHT ∈ [-1, 1]`.
- `facetTone(baseHex, shade, contrast)` → `hsl(h, s, l + shade × contrast)`; default
  `GEM_FACET_CONTRAST = 20` (the sketch's slider value Crawford judged). Facet stroke = the darkest
  facet tone, width 0.25.
- Day/night: `l` of every tone is multiplied by `lightnessMultiplier` (replaces
  `applyLightnessMultiplier` on `RobotColors`; same function shape on `GemPalette`).
- Battery: `contrast × max(dimOpacity, 0.25)`; lights opacity × `dimOpacity` (today's lamp rule).

### 1.4 Colour (`gemPalette.ts`)

| Part | Fill | Lines |
|---|---|---|
| Backing | `GEM_BACKING` `#0e1013`, stroke `#1c2026` 0.5 | none |
| Top, orbiters | `robot.identityColor` | `tone(identity, l−26)` |
| Mid, lit level `t` | blend(`GEM_MID_DARK` `#262a31`, `tone(identity, l−16, s−18)`, t) | blend(`tone(MID_DARK, l−8)`, `tone(identity, l−32, s−18)`, t) |
| Lights | `GEM_LIGHT_COLOR` `#fff3c4`: r 1.4 core + r 3 halo at opacity 0.18 | — |

`t = layerLitLevel(gain)` — `socketLitOpacity` renamed, same constants (`SOCKET_DARK` → `MID_DARK_LEVEL`
0.15, `SOCKET_MIN` → `MID_LIT_MIN` 0.4, normalised by 1.2, clamped). `midLeft` ← `layers[1]`
(Coaxial), `midRight` ← `layers[2]` (Harmonic); `layers` undefined → both dark.

Light opacity: `(LAMP_MIN + (1 − LAMP_MIN) × lampIntensity) × dimOpacity`, both lights equal.

### 1.5 Renderer (`RobotGem.tsx`) and `RobotBody`

`RobotGem` is a draw-only memo component: props `gem`, `palette` (every resolved colour string),
`lightOpacity`, `midLit: [number, number]`, `facetContrast`, `scale`. It emits:

```
g.gem (transform: scale about canvas centre)
  g.gem__backing   polygon.gem__face
  g.gem__orbiter ×4 (.gem__orbiter--tl/--tr/--bl/--br)   polygon.gem__facet ×sides, polygon.gem__face, polyline.gem__line
  g.gem__mid.gem__mid--left, g.gem__mid.gem__mid--right   facets, face, lines ×2
  g.gem__top       facets, face, lines ×4, g.gem__light ×2
```

Z order is DOM order: backing, orbiters, midLeft, midRight, top. Part translation is the §1.1
layout on a canvas `W = 80 × widthFactor` by `GEM_CANVAS_H = 80`: backing centred; top centred;
mids centred vertically, flush to the centre line; orbiters at the four corners. No colour is
computed inside the renderer.

`RobotBody` keeps its structure: the audio memo computes `lampIntensity`, `scale`, `midLit`
(replacing `Component/baseColors/shapeParams/microVariants/socketLit`); `identityColor`,
`dimOpacity`, `lightnessMultiplier` and `getRobotGem(robot.gemSeed)` are read outside it (the cache
makes the gem lookup a Map hit, so it needs no memo of its own); `gemPalette(identity,
lightnessMultiplier, midLit)` is built outside the memo (cheap, like today's
`applyLightnessMultiplier`). Props: `robot`, `ignoreDaylight`; `hideGreebles` is removed.

### 1.6 Render contexts

- **World** (`Robot.tsx`): unchanged — GSAP owns the root `<g>`; `RobotBody` draws into it. The
  flip (`scaleX: -1`, `transformOrigin: 50% 50%`) works on the new bbox as before.
- **Avatar** (`RobotDisplaySection`, 96 px) and **card** (`RobotSelectionCard`, 64 px): viewBox
  becomes per-robot `gemViewBox(getRobotGem(robot.gemSeed))` = `0 0 ${gemWidth} 80` with
  `preserveAspectRatio="xMidYMid meet"` — the whole canvas, orbiters included, letterboxed
  (Crawford's call, 2026-10-04). Both also pass **`ignoreScale`**, so `RobotBody` draws them at
  scale 1. *(Task 8 finding: body scale runs 0.735–1.69, and scaling about the centre pushed the
  corner orbiters out of a `0 0 W 80` viewBox whenever scale > 1. Crawford chose "fit each
  robot" over a fixed padded frame: every robot fills its tile; scale shows in-world only. Fit
  at scale 1 is pixel-identical to scaling and fitting the viewBox to the scaled extent.)*

### 1.7 Removed

Files: `RobotSleek.tsx`, `RobotAngular.tsx`, `RobotOrganic.tsx`, `RobotIndustrial.tsx`,
`RobotGreebles.tsx`, `RobotLayerSockets.tsx`, `greebleSlots.ts`, their tests,
`robotShapeVariants.test.tsx`, and the three docs tests `robotLiveVisualsDocs`, `robotGreeblesDocs`,
`robotLayerMarkersDocs` (replaced by one `gemPolygonRobotsDocs.test.ts`).
From `robotVisualHelpers.ts`: `selectRobotShape`, `RobotSVGComponent`, `RobotColors`,
`generateColors`, `hueOffset`, `toSaturation`, `toLuminance`, `shapeParamsFromAudio`,
`ShapeParams`, `MicroVariants`, `calculateScale`, `applyLightnessMultiplier`, `identityGlass`,
`SOCKET_*`. Kept: `bodyShapeFromAdsr`, `BODY_NORMALISER`, `calculateBodyScale`, `BODY_SCALE_MIN`,
`LAMP_MIN`, `calculateLampIntensity`, `computeBatteryDimOpacity`, and `socketLitOpacity` renamed
`layerLitLevel`. From `Robot.ts`: `Greeble`, `greebles`. From `spawnSystem.ts`: `generateGreebles`,
`GREEBLE_COUNT_RANGE`. The window and lamp are gone with the shapes (Crawford's call).

### 1.8 Guardrail rewrite (one commit, three places + ROBOT_DESIGN.md)

CLAUDE.md, `.github/copilot-instructions.md` and `Robot.ts`'s `identityColor` comment replace the
"three documented non-audio carriers" sentence with:

> Visual Mapping: "A robot's body is seeded, permanent gem-polygon geometry (derived from `Robot.gemSeed`) in its
> `identityColor` — identity and seed, not audio. Audio reaches the body only through continuous
> dials defined in ROBOT_DESIGN.md: the two Top lights (layer gain / envelope), each Mid polygon's
> lit level (its layer's gain) and the body scale (octave range). Day/night lightness and battery
> dimming remain the two overlay exceptions. No count, side, line or position may change on an
> audio edit."

ROBOT_DESIGN.md is rewritten around §1.1–§1.6 (the rulebook, bevel, palette, layout, what audio
drives). The new docs test asserts the new sentence in all three places and the absence of
`greebles`/`socket`/`window glass` wording.

### 1.9 What does not change

Spawn position semantics; swim/idle timelines; `Robot.tsx`; `RobotBody`'s audio-memo / non-audio
split and its item-22 spy test; `RobotSelectionCard`/`RobotDisplaySection` beyond the viewBox and
the dropped prop; session storage; the audio engine; content strings (the robot body has none).

## 2. Target File Structure

```
src/components/robot/gem/
  polygon.ts               NEW — rules, genPolygon, inset, genLine, genLights, generateRobotGem, getRobotGem (seed cache), gemWidth, GEM_CANVAS_H
  polygon.test.ts          NEW — property tests over seeds + one pinned fixture
  gemShading.ts            NEW — GEM_BEVEL_DEPTH, GEM_LIGHT, GEM_FACET_CONTRAST, edgeNormals, facetTone
  gemShading.test.ts       NEW
  gemPalette.ts            NEW — GEM_* colours, tone(), gemPalette(), layerLitLevel (moved)
  gemPalette.test.ts       NEW
  RobotGem.tsx             NEW — draw-only renderer
  RobotGem.test.tsx        NEW
src/components/robot/
  RobotBody.tsx            rewrite — composes RobotGem; memo split kept
  RobotBody.test.tsx       rewrite
  robotVisualHelpers.ts    edit — §1.7 removals; layerLitLevel re-exported from gemPalette or moved
  robotVisualHelpers.test.ts  edit
  RobotDisplaySection.tsx  edit — per-robot viewBox
  RobotSleek/Angular/Organic/Industrial.tsx, RobotGreebles.tsx, RobotLayerSockets.tsx, greebleSlots.ts (+tests), robotShapeVariants.test.tsx   DELETE
src/components/selection/RobotSelectionCard.tsx   edit — per-robot viewBox, no hideGreebles
src/types/Robot.ts         edit — gemSeed field, Greeble/greebles removed, identityColor comment (GemPoint/GemPart/RobotGem live in polygon.ts: runtime-only, not state)
src/systems/spawnSystem.ts edit — gemSeed draw ('robot.gem.seed'), greeble code removed
src/systems/spawnSystem.test.ts   edit
src/docs/gemPolygonRobotsDocs.test.ts   NEW (replaces the three robot docs tests)
test fixtures building Robot objects (RobotBody/RobotDisplaySection/RobotSelectionCard/AudioEngine/localeStore/audioBudgetSystem/idleSystem/interactionSystem/robotSystems/worldTransition tests)   edit — greebles → gemSeed (any integer; the cache derives the geometry)
CLAUDE.md, .github/copilot-instructions.md, docs/ROBOT_DESIGN.md   rewrite per §1.8
docs/todo/roadmap.md       add — Phase 39
docs/ideas/robot-visual-rework.md, docs/ideas/layer-pods-and-follow-through.md   edit — superseded headers
```

## 3. Implementation Boundaries & Constraints

- **Always:** the rulebook holds for every generated part (tested over thousands of seeds, not
  asserted by hand); geometry/lines/lights/width are seeded and permanent; every audio-driven value
  is continuous (lights, Mid lit level, scale); `RobotGem` computes no colour; `npm run build:types`,
  `npm run lint`, `npm test` before every commit; the sketch stays the visual reference — a change
  to a rule, cap or constant lands in the sketch first.
- **Ask first:** any new audio → visual mapping (that is Branch B); any motion (Branch C); changing
  part sizes or the 80-tall canvas; cutting elements for perf beyond §Assumption 6's order; a
  storing generated geometry on the robot (it is derived from `gemSeed`, by Crawford's call).
- **Never:** regenerate geometry on an audio edit; pop a part in or out; hand-place anything per
  shape; put a `RobotGem` in Zustand (only `gemSeed` is state); timers or `requestAnimationFrame`;
  display strings in components.

## 4. Code Style & Architecture Conventions

Same split as the lamp/greebles/sockets: a pure module computes numbers (`polygon.ts`,
`gemShading.ts`), a palette module resolves colours, `RobotBody` composes, a draw-only memo
component renders. The generator takes a stream, never `Math.random()`:

```ts
export function generateRobotGem(R: () => number): RobotGem {
  const widthFactor = pick(R, WIDTH_FACTORS);
  const k = widthFactor;
  const backing = makePart(R, 25 * k, 25, BASE_RULES, { lines: 0, lights: 0 });
  const orbiters = CORNERS.map(() => makePart(R, ORBITER_W, ORBITER_H, ORBIT_RULES, { lines: 1, lights: 0 }));
  …
}
```

Class names as in §1.5 for tests. Constants `UPPER_SNAKE` with a one-line comment naming the
sketch value they came from.

## 5. Testing & Verification Requirements

- **`polygon.test.ts`:** over ≥ 2 000 seeds × every part: 8 ≤ sides ≤ 12; right ≤ 4; concave ≤
  rule; every edge direction within 1e-6 of a 15° multiple; all four box edges touched; no
  self-intersection; Main parts asymmetric; `inset(pts, d)` vertices all inside `pts`; every line
  point inside the inner polygon; orbiters exactly 24×16 for every width factor; same seed →
  deep-equal output; one pinned fixture (`gem.fixture.json`).
- **`gemShading.test.ts`:** normals point outward on a clockwise and a counter-clockwise polygon;
  a top-left edge shades > 0, bottom-right < 0; `facetTone` monotonic in shade.
- **`gemPalette.test.ts`:** `layerLitLevel` cases carried over from `socketLitOpacity`; `t = 0` →
  `GEM_MID_DARK`, `t = 1` → the lit tone; lightness multiplier scales every entry.
- **`RobotGem.test.tsx`:** DOM order backing → orbiters → mid--left → mid--right → top; facet count =
  sides per bevelled part; 0 facets on the backing; 4/2/2/1 lines; exactly 2 `.gem__light` in the
  top only; fills equal the palette strings passed in; `scale` lands on `g.gem`'s transform.
- **`RobotBody.test.tsx`:** item-22 spy test (lightness tick does not recompute the audio memo)
  kept; changing only `identityColor` changes Top/orbiter fills and nothing in the memo;
  `layers[1].gain` 0 → 1 changes only `mid--left`'s tone; critical battery multiplies light
  opacity by 0.1 and lowers facet contrast; `layers` undefined → both Mids `GEM_MID_DARK`.
- **`spawnSystem.test.ts`:** `gemSeed` is an integer on every spawned robot; same noise map/offset
  → same `gemSeed`; a copy-spawned robot gets its own `gemSeed`, not the source's; no `greebles`.
  `polygon.test.ts` adds: `getRobotGem(s)` returns the same object reference twice (cache hit) and
  deep-equals `generateRobotGem(alea(String(s)))`.
- **Card/avatar tests:** viewBox equals `0 0 ${80 × widthFactor} 80`; `.gem` present.
- **Docs test:** §1.8 sentence present in CLAUDE.md, copilot-instructions and `Robot.ts`; no
  `greebles`/`socket`/`window glass` wording in any of the three or ROBOT_DESIGN.md.
- **Perf gate (before the docs task):** `npm run build && npx vite preview --port 4173`, then
  `npm run perf:idle` on the same `?session=` link, main vs branch, foreground, one run at a time,
  no orphaned Chrome (docs/PERFORMANCE.md). Pass = paint totals within the 17.2.5 noise band; fail
  → Assumption 6's cut order, re-measure.
- **Gate 2 (Crawford, by eye):** the live world, the 96 px avatar and the 64 px card all show the
  new robots; a robot is recognisably the same across the three; a gain drag re-lights its Mid
  live; a company broadcast re-lights every member; day/night and battery still read; the Pixel
  listen shows no new audio dropouts.

## 6. Git & Workflow Context

- Branch `robot-rethink` (at `main`). One commit per task; the guardrail rewrite its own commit;
  deletions their own commit after the swap is green. PowerShell 5.1: no double quotes inside
  `-m @'…'@`. Roadmap `## 39. Gem Polygon Robots (Branch A)`.
- TDD per task: failing test first, mutation-check the rule tests by breaking a cap and watching
  them fail, one commit per task, stop and report at the perf gate and Gate 2.

## 7. Open Questions (Crawford, before or during the plan)

1. **Facet contrast / bevel depth** — 20 / 2.5 are the sketch defaults; tune by eye in the sketch
   before the constants are pinned, or accept as-is.
2. **Battery → contrast floor 0.25** (Assumption 5) — by eye once live.
3. **Split the light intensity equally across the two lights** (Assumption 3), or give one the
   lamp's role and leave the other at a fixed glow? Equal is assumed.
4. ~~Stored geometry vs stored seed~~ — **resolved 2026-10-04: seed only** (Assumption 1).
