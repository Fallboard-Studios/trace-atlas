# Implementation Plan: World Gem Material (Option A)

Spec: [docs/specs/WORLD_GEM_MATERIAL.md](../specs/WORLD_GEM_MATERIAL.md). Intent:
[docs/intent/world-gem-material.md](../intent/world-gem-material.md). Sketch (gate passed
2026-10-08): [docs/sketches/gem-factories.html](../sketches/gem-factories.html). Branch
`feature/world-gem` from `main` (`6802c8b4`). Roadmap Phase 44.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`,
`npm run build`, `npm run dev`, `npm run perf:idle` (after `npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

Twenty-two tasks in five phases. Phase 1 lands the pure material module and its two small
upstream edits (a depth parameter on `bevelDepth`, two exports from `gemShape.tsx`) with no
importer, plus the 90/45 helper's exemption. Phase 2 puts the ring on the factories — body, window
clip, belts, the re-centred facade grid and the rooftop greebles — and ends at Crawford's first dev
look. Phase 3 is the scenery: mass rings family by family, then the hairlines, then terrain. Phase
4 is the idle-paint gate and Crawford's visual checkpoint (stop and report at each). Phase 5 is
docs. Every task leaves types, lint and the suite green; RED first; one commit per task; every
geometry test is mutation-checked by breaking the rule it guards (the cap, the multiplier table,
the merge, the frame skip) and watching it fail.

## Architecture Decisions

- **The material is one pure module plus one draw-only component** (spec §1.8):
  `src/components/actors/material/worldGemMaterial.ts` computes points and colour strings;
  `GemRing.tsx` renders them. No renderer computes a tone. Reused as they are: `inset`,
  `edgeNormals`, `bevelDepth` (`polygon.ts`), `quantizeShade` (`gemShading.ts`),
  `facetMultiplier` and `gemOutlineStroke` (`gemShape.tsx`, newly exported), `applyColorShift`,
  `NO_SHIFT`. The 18 % cap, the multiplier table and the outline colour each exist once.
- **Rings are drawn in scene pixels; the factory's ring is a sibling of its scaled body** (spec
  assumption 1). The window clip and belt inset, which live in the 0–100 box, convert per axis.
- **Bevel 0 is proven, not promised.** Each renderer task's RED step captures a markup snapshot
  on the pre-change code; the GREEN step re-runs it with every `WORLD_GEM` piece mocked off
  (`vi.mock` of the material module) and must match byte for byte. The snapshots live beside the
  tests and are deleted in Task 21 once the docs land (they guard the transition, not the future).
- **Hairline = stroke attributes on the existing element** (spec assumption 4); the dome cap and
  cupola arcs are the only new elements. Element counts stay flat except for rings.
- **Rooftop greebles follow the world rule** (spec §7 Q1, Crawford 2026-10-08): blocks ring,
  thin parts hairline, curves hairline along the arc. machinery, waterTower and steppeRoof join
  `ROOFTOP_LAYOUT_PAINT` because a ring needs the hour.
- **Ring facets are exempt from the 90/45 helper via `[data-gem="ring"]`** (spec assumption 5,
  accepted) — the same skip shape the helper already has for `rotate(±45)` groups.
- **Factories before scenery, terrain last among the renderers.** The factory is the look's
  anchor (sixty per world) and the first thing Crawford judges live; terrain is the first cut if
  the perf gate misses, so it goes in last and comes out cleanly.
- **The `WORLD_GEM` switches are code constants only** (no setting, no UI); each is one ablation
  for the perf gate and one mock target for the bevel-0 tests.

## Dependency Graph

```
T1 record sketch+intent+spec
T2 bevelDepth depth param ─┐
T3 gemShape exports ───────┼─► T4 material constants/light/bevel/hairline ─► T5 ringFacets ─► T6 GemRing ─┐
T7 90/45 helper skip ──────┘                                                                            │
                                                                                                        ▼
        T8 Factory body ring ─► T9 clip + belts ─► T10 facade grid re-centre                   Checkpoint A
        T11 rooftop rings (needs T6) ─► T12 rooftop hairlines (needs T4)                            │
                                              │                                                     │
                                       Checkpoint B (Crawford's dev look, factories) ◄──────────────┘
                                              │
        T13 tank/wall/dome rings ─► T14 containers/scaffold/crane-load/vent rings ─► T15 wreck rings
        T16 member hairlines ─► T17 six-family hairlines + pipe bridges
        T18 terrain ring
                                       Checkpoint C (full suite, build, Crawford's dev look, world)
                                              │
        T19 perf gate (stop/report) ─► T20 Crawford's checkpoint + Pixel (stop/report)
                                              │
        T21 BUILDING_DESIGN / ROBOT_DESIGN / PERFORMANCE / docs test ─► T22 roadmap / backlog / idea header
```

Parallelisable: T2 ‖ T3 ‖ T7; T8→T9→T10 ‖ T11→T12; T13→T14→T15 ‖ T16→T17 ‖ T18.

## Task List

### Phase 1: Foundations (no importer)

## Task 1: Record the sketch, intent and spec

**Description:** Commit the extended sketch (`docs/sketches/gem-factories.html`, modified), the
intent doc (`docs/intent/world-gem-material.md`, untracked) and the spec
(`docs/specs/WORLD_GEM_MATERIAL.md`) plus this plan, as they stand, so every later diff is code.

**Acceptance criteria:**
- [ ] `git status` is clean on `feature/world-gem` after the commit; no source file is touched.

**Verification:**
- [ ] `git log -1 --stat` lists exactly the four docs files.

**Dependencies:** None.

**Files:** `docs/sketches/gem-factories.html`, `docs/intent/world-gem-material.md`,
`docs/specs/WORLD_GEM_MATERIAL.md`, `docs/tasks/WORLD_GEM_MATERIAL.md`

**Estimated scope:** XS (docs commit)

## Task 2: `polygon.ts` — `bevelDepth(w, h, depth = GEM_BEVEL_DEPTH)`

**Description:** Give `bevelDepth` a third parameter defaulting to `GEM_BEVEL_DEPTH`, so the world
can pass its own depth through the one 18 % cap instead of copying it (spec §1.2). No call site
changes.

**Acceptance criteria:**
- [ ] `bevelDepth(w, h)` returns exactly what it did for every existing case in `polygon.test.ts`
      (those tests pass unmodified).
- [ ] `bevelDepth(200, 300, 8)` is 8; `bevelDepth(30, 300, 8)` is 5.4 (18 % of 30);
      `bevelDepth(200, 300, 0)` is 0.
- [ ] `gem.fixture.json` is unchanged (the robots' geometry does not move).

**Verification:**
- [ ] `npx vitest run src/components/robot/gem/polygon.test.ts src/components/robot/gem/robotGem.test.ts` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/components/robot/gem/polygon.ts`, `src/components/robot/gem/polygon.test.ts`

**Estimated scope:** XS (one signature)

## Task 3: `gemShape.tsx` — export `facetMultiplier` and `gemOutlineStroke`

**Description:** Export the existing private `facetMultiplier(rawShade)` and add
`gemOutlineStroke(): string` returning the outline the shape already draws
(`applyColorShift(colorTheme.body.shadow, NO_SHIFT, GEM_OUTLINE_L_MULTIPLIER)`), with `GemShape`
calling it. One copy of each value (docs/DUPLICATE_VALUE_AUDIT.md's bug class).

**Acceptance criteria:**
- [ ] `facetMultiplier(-1)`, `(0)`, `(1)` are 0.5, 1.1, 1.25; `facetMultiplier(0.4)` quantizes
      to the 1/3-step level and maps through the same table.
- [ ] `gemOutlineStroke()` equals the `stroke` attribute of `GemShape`'s outline polygon.
- [ ] Every existing `gemShape.test.tsx` case passes unmodified.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery/gemShape.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/components/actors/scenery/gemShape.tsx`, `src/components/actors/scenery/gemShape.test.tsx`

**Estimated scope:** XS (two exports)

## Task 4: `worldGemMaterial.ts` — constants, switches, `worldLightVector`, `worldBevel`, `hairline`

**Description:** Create `src/components/actors/material/worldGemMaterial.ts` with
`WORLD_BEVEL_PX` 8, `ROOF_BOX_BEVEL_FACTOR` 0.6, `RING_MIN_PX` 1, `RING_FACET_STROKE_PX` 0.6,
`HAIRLINE_PX` 1.5, `LIGHT_LATERAL_SPAN` 0.7 (each with a one-line comment naming its sketch
value), the `WORLD_GEM` switch object (`factories`, `massScenery`, `roofBoxes`, `terrain`,
`members`, `others`, all `true`, `as const`), `worldLightVector(eastL, westL): GemPoint`,
`worldBevel(w, h, scale = 1, depthPx = WORLD_BEVEL_PX): number` (through `bevelDepth`, floored
to 0 under `RING_MIN_PX`) and `hairline(scale = 1)` returning `{ stroke, strokeWidth }` or
`undefined` (spec §1.1–§1.3, §1.8). `ringFacets` is Task 5.

**Acceptance criteria:**
- [ ] `worldLightVector` is unit length; `[0, -1]` when `eastL === westL`; `x > 0` when east is
      brighter; over every integer measure of the `getLighting` cycle `|x| ≤ 1.02`.
- [ ] `worldBevel(200, 300)` is 8; `worldBevel(200, 300, 1.1)` is 8.8; `worldBevel(30, 300)` is
      5.4; `worldBevel(5, 300)` is 0 (under the floor); `worldBevel(200, 300, 1, 0)` is 0;
      `worldBevel(60, 40, 1, 8 * 0.6)` is 4.8.
- [ ] `hairline()` is `{ stroke: gemOutlineStroke(), strokeWidth: 1.5 }`; `hairline(0.5)` has
      `strokeWidth` 0.75; `hairline(0)` is `undefined`.

**Verification:**
- [ ] `npx vitest run src/components/actors/material/worldGemMaterial.test.ts` passes.
- [ ] Mutation check: set `LIGHT_LATERAL_SPAN` to 0.5 → the `|x| ≤ 1.02` test fails; set
      `RING_MIN_PX` to 0 → the floor test fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 2, Task 3.

**Files:** `src/components/actors/material/worldGemMaterial.ts`,
`src/components/actors/material/worldGemMaterial.test.ts`

**Estimated scope:** S (one new module + test)

## Task 5: `worldGemMaterial.ts` — `ringFacets`

**Description:** Add `ringFacets(pts, depth, light, faceLightAt, body, opts)` per spec §1.2:
`splitX` inserts a vertex on every horizontal edge that strictly crosses it; `skipEdge(a, b)` drops
a facet; the inner polygon is `inset(Q, depth)`, shades are `edgeNormals(Q)[i] · light` quantized
by `quantizeShade(·, 3)`; `fill` = `applyColorShift(body, NO_SHIFT, faceLightAt(midX) ×
facetMultiplier(q))`, `stroke` = the same at `facetMultiplier(-1)`; facets merge into one `d` per
(fill, stroke) pair in first-appearance order; `depth ≤ 0` → `[]`.

**Acceptance criteria:**
- [ ] A 100 × 50 rect at a 9 am light (`eastL` 1.05, `westL` 0.346) yields 4 facets before
      merging: top and right lit (1.25 ×), bottom and left shaded (0.5 ×); at noon (`eastL ===
      westL`) the left and right facets are neutral (1.1 ×).
- [ ] With `splitX` 40 the same rect yields 6 facets; the two top halves take their own
      `faceLightAt` (a step function at 40 gives them different fills); `splitX` on an edge
      endpoint inserts nothing; the inner polygon under the inserted vertex is directly beneath it.
- [ ] Facets with equal (fill, stroke) merge: the 9 am rect without a split has ≤ 2 paths and
      every outline edge's quad appears in exactly one `d`; `depth` 0 → `[]`;
      `skipEdge` on a closed terrain-like polygon drops exactly the frame edges.
- [ ] Every facet's outline edge is parallel to its inner edge (the miter keeps edges on the grid)
      on a rect, a 45°-shouldered hexagon and a stepped profile.

**Verification:**
- [ ] `npx vitest run src/components/actors/material/worldGemMaterial.test.ts` passes.
- [ ] Mutation check: swap the 1.25/0.5 entries → the 9 am test fails; key the merge on fill only
      → the split-face merge test fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 4.

**Files:** `src/components/actors/material/worldGemMaterial.ts`,
`src/components/actors/material/worldGemMaterial.test.ts`

**Estimated scope:** S (one function + tests)

## Task 6: `GemRing.tsx` — the draw-only ring

**Description:** `GemRing({ facets, scale = 1 })` renders `<g data-gem="ring">` with one `<path>`
per facet group (`d`, `fill`, `stroke`, `strokeWidth = RING_FACET_STROKE_PX × scale`,
`strokeLinejoin="round"`), or `null` when `facets` is empty (spec §1.2).

**Acceptance criteria:**
- [ ] Three facet groups → one `g[data-gem="ring"]` holding exactly three `path`s with the given
      attributes and `strokeWidth` 0.6 (0.66 at scale 1.1); no `style` attribute anywhere.
- [ ] Empty facets → renders nothing (no `g`).

**Verification:**
- [ ] `npx vitest run src/components/actors/material/GemRing.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 5.

**Files:** `src/components/actors/material/GemRing.tsx`, `src/components/actors/material/GemRing.test.tsx`

**Estimated scope:** XS (one component)

## Task 7: `sceneryTestHelpers.ts` — skip ring facets in `assertNinetyFortyFive`

**Description:** The helper ignores `polygon`/`line` descendants of a `[data-gem="ring"]` group,
the same way it ignores `rotate(±45)` groups (spec assumption 5); the NaN sweep still covers them.
Add a test file for the helper itself (it has none today).

**Acceptance criteria:**
- [ ] A bare polygon with a 67.5° edge fails; the same polygon inside `<g data-gem="ring">`
      passes; a `NaN` attribute inside the ring group still fails.
- [ ] Every scenery renderer test's existing 50-seed sweep passes unmodified.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** None.

**Files:** `src/components/actors/scenery/sceneryTestHelpers.ts`,
`src/components/actors/scenery/sceneryTestHelpers.test.ts`

**Estimated scope:** XS

### Checkpoint A: Foundations
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] The material module is complete and property-tested; nothing in the app imports it yet, so
      the world renders exactly as on `main`.
- [ ] Reviewed with Crawford before Phase 2.

---

### Phase 2: Factories

## Task 8: `Factory.tsx` — the body ring

**Description:** Compute `light = worldLightVector(eastLMultiplier, westLMultiplier)` beside
`roofLMultiplier`; `d = WORLD_GEM.factories ? worldBevel(W, H, scaleX) : 0` with `W = actualWidth`,
`H = actualHeight`; `ringFacets(rect(0,0,W,H), d, light, midX => (midX < fcPx ? westL : eastL) ×
lCap, bodyColor, { splitX: fcPx })` (`fcPx` is the rooftop context's `frontCornerX`); render
`<GemRing>` after the scaled group and before `rooftopElement` (spec §1.4). The RED step first
captures a per-variant markup snapshot of today's output.

**Acceptance criteria:**
- [ ] With the material module mocked so every `WORLD_GEM` piece is `false`, every variant's
      rendered markup equals the pre-change snapshot byte for byte (noon, 9 am, derelict,
      background row).
- [ ] With it on: exactly one `g[data-gem="ring"]` per factory, after the scaled `g` and before the
      rooftop greeble; at 9 am the ring's top-west and top-east facets have different fills and the
      east side is the lit tone of `bodyColor` at `eastL × lCap`; at noon the two top halves match;
      a derelict's facet fills carry the desaturated body; a background-row factory's carry the
      0.7 cap.
- [ ] The 17.2.5 transition guard finds no `style` on the ring; the item-21 memo spy test passes
      unmodified (the ring is tick-time work outside `staticVisual`).

**Verification:**
- [ ] `npx vitest run src/components/actors/Factory.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] `npm run dev`: a foreground factory shows a six-facet ring that re-lights across the hour.

**Dependencies:** Task 6.

**Files:** `src/components/actors/Factory.tsx`, `src/components/actors/Factory.test.tsx`,
`src/components/actors/__snapshots__/` (pre-change markup)

**Estimated scope:** S (one component + test)

## Task 9: `Factory.tsx` — window clip margin and belt inset

**Description:** The body clip rect becomes `x = mx, y = my, width = 100 − 2mx, height = 100 −
2my` with `mx = max(100d/W, 2)`, `my = max(100d/H, 2)`; belt rects run `bx … frontCornerX` and
`frontCornerX … 100 − bx` with `bx = 100d/W` (spec §1.4).

**Acceptance criteria:**
- [ ] `d = 0` → clip `2, 2, 96, 96` and full-width belts (the Task 8 snapshot still matches with
      the switch off).
- [ ] A 480 × 160 building at scale 1 (`d` 8): clip `x` 2 (8/480 < 2 %), `y` 5; a 160 × 440
      building: clip `x` 5, `y` 2 (within 0.01); belts start at `100d/W` and the east belt ends at
      `100 − 100d/W`.
- [ ] Facade content is still clipped by the body clip (a window placed at `x = 1` does not
      appear).

**Verification:**
- [ ] `npx vitest run src/components/actors/Factory.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 8.

**Files:** `src/components/actors/Factory.tsx`, `src/components/actors/Factory.test.tsx`

**Estimated scope:** XS

## Task 10: `Factory.tsx` — re-centre the facade grid inside the ring

**Description:** Shrink the facade zone bounds the window grid is derived over by the ring margin
per axis, so the grid is centred on the face inside the ring, as the sketch does (spec assumption
8, Crawford: "centering is great"). The contexts mix units today (`buildingWidth`/`buildingHeight`
in silhouette px, `zoneY`/`zoneHeight`/`frontCornerX` in box units — `Factory.tsx:186`), so work
out which fields the rendered x and y actually come from and adjust those; prove it on the
rendered rects, not the context. Touch only `Factory.tsx`'s context construction, not
`facadeGreebles.tsx`.

**Acceptance criteria:**
- [ ] With the switch off, the Task 8 snapshot still matches byte for byte (zone bounds at `d = 0`
      are today's).
- [ ] With it on, for squareWindows at 0, 1 and 2 belt courses: every window rect inside the clip
      lies within `[mx, 100 − mx] × [my, 100 − my]` in box units, and the gap from the ring's inner
      edge to the first window equals the gap after the last within one window slot, on both axes,
      for the west face. (The east face's pre-existing overflow past the clip — its grid is derived
      in silhouette px — is out of scope; note it in the test as a known quirk, do not fix it.)
- [ ] `staticVisual`'s dependency list is unchanged except for the ring depth's inputs it already
      has (`scaleX`, `scaleY`, size).

**Verification:**
- [ ] `npx vitest run src/components/actors/Factory.test.tsx src/components/actors/greebles` passes.
- [ ] `npm run build:types`, `npm run lint` clean.
- [ ] `npm run dev`: no half-window sits against a ring's inner edge on any variant.

**Dependencies:** Task 9.

**Files:** `src/components/actors/Factory.tsx`, `src/components/actors/Factory.test.tsx`

**Estimated scope:** S (layout contexts + tests; the unit quirk is the work)

## Task 11: `rooftopGreebles.tsx` — rings on the block greebles

**Description:** Add `light?: GemPoint` to `GreebleRendererContext` (set in `Factory.tsx`'s
rooftop paint context, never in the layout context); ring crownSpire tiers (as one two-faced rect
split at `frontCornerX`), pitchedRoof's slope triangle and wall (each at its own face's
multiplier), waterTower's body, machinery's stacks and steppeRoof's tiers (single-tone at
`lMultiplier`) at `WORLD_GEM.roofBoxes ? worldBevel(w, h, 1, WORLD_BEVEL_PX ×
ROOF_BOX_BEVEL_FACTOR) : 0` on `colors.accent`; move machinery, waterTower and steppeRoof into
`ROOFTOP_LAYOUT_PAINT` (rects computed once, fills + ring painted per tick), keeping
`renderMachinery` etc. as thin wrappers (spec §1.4, assumption 7).

**Acceptance criteria:**
- [ ] With `ctx.light` undefined every renderer's output is byte-identical to before (the
      `midgroundSilhouettes.test.tsx` and existing greeble tests pass unmodified).
- [ ] With `ctx.light` set: each listed greeble emits one `g[data-gem="ring"]` per block; a
      crownSpire tier's top facet is split at `frontCornerX` with the west/east fills; a 6 px tall
      tier emits no ring (the floor); `ROOFTOP_LAYOUT_PAINT` has `machinery`, `waterTower`,
      `steppeRoof` entries whose `compute` output is identical for two different lighting
      contexts.
- [ ] `Factory.test.tsx`'s existing "rooftop updates across a tick" cases pass for the three
      newly dynamic greebles.

**Verification:**
- [ ] `npx vitest run src/components/actors/greebles src/components/actors/Factory.test.tsx src/systems/midgroundSilhouettes.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 6, Task 8.

**Files:** `src/components/actors/greebles/greebleTypes.ts`,
`src/components/actors/greebles/rooftopGreebles.tsx`,
`src/components/actors/greebles/rooftopGreebles.test.tsx`, `src/components/actors/Factory.tsx`

**Estimated scope:** M (4 files; three greebles change render mode)

## Task 12: `rooftopGreebles.tsx` — hairlines on the thin parts and the cupola arc

**Description:** `{...(WORLD_GEM.members ? hairline() : undefined)}` on the antennae shaft, the
pipesValves pipes and valve discs, the waterTower stilts and the crownSpire antenna rod; one open
`<path d="M … A …" fill="none">` with the hairline along the cupola's arc, after the filled dome.
These stay static (the hairline colour is fixed).

**Acceptance criteria:**
- [ ] Each listed element carries `stroke === gemOutlineStroke()` and `strokeWidth` 1.5; the
      antenna indicator lights carry no stroke; the cupola has exactly one extra `path` whose `d`
      starts at `(cx − rx, roofY)` and ends at `(cx + rx, roofY)` with no closing `Z`.
- [ ] With `WORLD_GEM.members` mocked off, output is byte-identical to before.
- [ ] `midgroundSilhouettes.test.tsx` passes unmodified (stroke widening is measured both sides).

**Verification:**
- [ ] `npx vitest run src/components/actors/greebles src/systems/midgroundSilhouettes.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 4.

**Files:** `src/components/actors/greebles/rooftopGreebles.tsx`,
`src/components/actors/greebles/rooftopGreebles.test.tsx`

**Estimated scope:** S

### Checkpoint B: Factories (Crawford's dev look)
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] `npm run dev` on a pinned `?session=` world at 9 am, noon, 3 pm and 10 pm: every factory
      carries the six-facet ring lit by the hour; windows and belts sit inside it; the rooftop
      blocks are ringed at 0.6× and the thin parts outlined; a derelict's ring dims with it;
      scenery and terrain are still as on `main`.
- [ ] Crawford judges the factories before Phase 3 — the ring depth, the window centring and the
      roof-box set are the three things to look at.

---

### Phase 3: Scenery and terrain

## Task 13: `tank.tsx`, `wall.tsx`, `dome.tsx` — rings on the two-faced bodies

**Description:** Per spec §1.5: tank rings its shouldered hexagon with `splitX` at the corner and
insets its belts by `d` on both sides; wall rings its full rect split at `x` and moves the cap rail
inside the ring (`x − half + d, top + d, w − 2d`); dome rings its base rect split at `x`. Each
passes its already-folded body colour and `faceL × cap`. Each RED step snapshots the renderer's
markup for three seeds first.

**Acceptance criteria:**
- [ ] With `WORLD_GEM.massScenery` mocked off each renderer's markup equals its pre-change
      snapshot.
- [ ] On: one `g[data-gem="ring"]` after the body polygons and before the gauge / portholes;
      the tank's ring has 8 facets (6 edges + the split) and its belts start at `x − w/2 + d`;
      the wall's rail is at `top + d` and `w − 2d` wide; the dome's cap paths, portholes, hatch and
      mast are unchanged.
- [ ] The 50-seed `assertNinetyFortyFive` sweep and every existing case pass.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery/renderers/tank.test.tsx src/components/actors/scenery/renderers/wall.test.tsx src/components/actors/scenery/renderers/dome.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 6, Task 7.

**Files:** `renderers/tank.tsx`, `renderers/wall.tsx`, `renderers/dome.tsx` and their tests
(under `src/components/actors/scenery/`)

**Estimated scope:** M (3 renderers + 3 tests)

## Task 14: `containers.tsx`, `scaffold.tsx`, `crane.tsx`, `vent.tsx` — rings on the single-tone and split blocks

**Description:** Per spec §1.5: each container box (single-tone at its ambient, before its label);
the scaffold's solid lower block (split at `x`); the crane's load (ambient); each vent step as its
own ring (the body's lit level). Snapshots first, as Task 13.

**Acceptance criteria:**
- [ ] Switch off → pre-change snapshots match.
- [ ] On: one ring per container box drawn before the box's label; one ring on the scaffold's
      solid block and none on its frame; one ring on the crane's load, none on its posts/beam;
      one ring per vent step, each with 4 facets, plumes and mouth glow unchanged.
- [ ] 50-seed sweeps and existing cases pass.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery/renderers/containers.test.tsx …/scaffold.test.tsx …/crane.test.tsx …/vent.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 13 (same pattern, proven once).

**Files:** `renderers/containers.tsx`, `renderers/scaffold.tsx`, `renderers/crane.tsx`,
`renderers/vent.tsx` and their tests

**Estimated scope:** M (4 renderers + 4 tests; rings only — the crane's hairlines are Task 16)

## Task 15: `wreck.tsx` — hull, deckhouse and funnel rings

**Description:** Ring the hull as one quadrilateral `[x−w/2, y] [x−w/2, top] [splitX, top]
[x1, y]` with `faceLightAt` = `westL`/`eastL` × the wreck's own 0.5-folded cap on `splitX`, drawn
last (over the keel strip, as sketched); ring the deckhouse and funnel at the superstructure
average on `shell.shadow`. Deck rail, portholes and keel strip unchanged.

**Acceptance criteria:**
- [ ] Switch off → snapshot matches.
- [ ] On: three `g[data-gem="ring"]`; the hull's is the last child; its raked-bow facet is on a
      45° edge and the sweep passes (the 67.5° joins are inside the ring group); facet fills use
      `cap × 0.5`.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery/renderers/wreck.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 14.

**Files:** `renderers/wreck.tsx`, `renderers/wreck.test.tsx`

**Estimated scope:** S

## Task 16: Members — hairlines on pylon, scaffold frame, crane, dome mast and cap arc, beacon

**Description:** `{...(WORLD_GEM.members ? hairline() : undefined)}` on: pylon tower polygon and
cross-arm rects; scaffold posts, levels, braces; crane posts, beam, knee brace and the hanger —
which becomes a `<rect data-crane="hanger">` 3 wide centred on `hangerX` from `beamBottom` to
`hangerBottomY`; dome mast, plus one open arc `path` with the hairline after the two cap halves;
beacon mast and foot plate (spec §1.6). `GemShape` heads and lamps untouched.

**Acceptance criteria:**
- [ ] Switch off → each renderer's snapshot matches, except the crane whose hanger is now a rect
      (asserted explicitly: same x-centre, top, bottom and 3 px width as the old line).
- [ ] On: every listed element carries the hairline stroke and width 1.5; `GemShape` groups,
      lamps, portholes and the dome's hatch carry none; the dome's arc path has no `Z` and spans
      `(x − rx, top)` to `(x + rx, top)`.
- [ ] `crane.test.tsx`'s load test, `sceneryWorkAnchors.test.tsx` and
      `midgroundSilhouettes.test.tsx` pass unmodified.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery src/systems/midgroundSilhouettes.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 4 (and Task 13/14 for the shared files — do this after them to avoid
merge noise in `dome.tsx`, `scaffold.tsx`, `crane.tsx`).

**Files:** `renderers/pylon.tsx`, `renderers/scaffold.tsx`, `renderers/crane.tsx`,
`renderers/dome.tsx`, `renderers/beacon.tsx` and their tests

**Estimated scope:** M (5 renderers; attribute spreads + one rect + one arc)

## Task 17: The six families — hairlines on dish, turbine, floodlight, tether, pipeline, pipe bridges

**Description:** `{...(WORLD_GEM.others ? hairline() : undefined)}` on dish (post, reflector
ellipse, feed), turbine (post, nacelle, both blades, hub circle), floodlight (mast, arm, head),
tether (anchor, line, dog-leg, riser), pipeline (stanchions, pipe, riser, flange) and
`pipeBridges.tsx` (bar, post). Lit bars, beams, pools, highlight strip, valve, float, hub light,
centre light untouched (spec §1.6).

**Acceptance criteria:**
- [ ] Switch off → snapshots match for all six.
- [ ] On: each listed element carries the hairline; each listed exception carries no stroke;
      elements inside the `rotate(±45)` groups carry it too.
- [ ] 50-seed sweeps, `sceneryWorkAnchors.test.tsx`, `pipeBridges.test.tsx` and
      `midgroundSilhouettes.test.tsx` pass.

**Verification:**
- [ ] `npx vitest run src/components/actors/scenery src/systems/midgroundSilhouettes.test.tsx` passes.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 16.

**Files:** `renderers/dish.tsx`, `renderers/turbine.tsx`, `renderers/floodlight.tsx`,
`renderers/tether.tsx`, `renderers/pipeline.tsx`, `pipeBridges.tsx` and their tests

**Estimated scope:** M (6 files, attribute spreads only — split into two commits if the diff
reads badly)

## Task 18: `TerrainLayer.tsx` — the terrain ring

**Description:** After the polygon, `<GemRing>` of `ringFacets(points, WORLD_GEM.terrain ?
WORLD_BEVEL_PX : 0, light, () => fillMultiplier, base, { skipEdge })`, where `skipEdge` drops an
edge whose endpoints both lie on `x = 0`, `x = width` or `y = height`, and `fillMultiplier`/`base`
are the polygon's own (spec §1.7). The `data-terrain` polygon's `points` string is unchanged.

**Acceptance criteria:**
- [ ] Every existing `TerrainLayer.test.tsx` case passes unmodified (the `points` strings).
- [ ] Switch off → no ring; on → one `g[data-gem="ring"]` after each polygon; no facet's outline
      edge lies on the frame; over 200 seeds for both profiles `bevelHolds(points, 8)` is true and
      every facet's outline edge is a profile step or run.
- [ ] At 9 am a 45° rising-to-the-right step is lit and its mirror shaded; flat runs are lit.

**Verification:**
- [ ] `npx vitest run src/components/panels/screen/worldView/TerrainLayer.test.tsx` passes.
- [ ] Mutation check: drop `skipEdge` → the frame test fails.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 6.

**Files:** `src/components/panels/screen/worldView/TerrainLayer.tsx`,
`src/components/panels/screen/worldView/TerrainLayer.test.tsx`

**Estimated scope:** S

### Checkpoint C: The world
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (note any
      pre-existing unrelated failures explicitly).
- [ ] `midgroundSilhouettes.test.tsx` and every `sceneryWorkAnchors` test green unmodified.
- [ ] `npm run dev` on the three pinned worlds (`dense`, `ventfield`, `yard`) at 9 am and 10 pm:
      every mass is ringed, every member and thin part outlined, terrain steps take the sun, the
      hairline reads on the darkest steel (or its colour is flagged for re-tune), nothing moves per
      frame.
- [ ] Crawford's dev look before the gate.

---

### Phase 4: Gates

## Task 19: Idle-paint perf gate

**Description:** The Districts D2 gate's shape (docs/PERFORMANCE.md, "Task 18 D2 perf gate"):
production builds of `main` (`6802c8b4`) and the branch served side by side; `dense`,
`ventfield`, `yard` pinned by `?session=` (coordinates found as the D2 gate did);
`npm run perf:idle --throttle 1 --only none --port 9301`; foreground, one call at a time,
orphaned-Chrome count 0 before and after; three rounds per world per build, order rotated. Then
one ablation round each with `WORLD_GEM.members`/`.others` off and `.terrain` off, built from
patches never committed.

**Acceptance criteria:**
- [ ] Pass: median idle busy and Paint on the branch within each build's own round-to-round
      spread on every world. Miss: cut in the spec's order (hairlines, then terrain; never
      factories or mass) and re-measure; a small residual is acceptable if the Pixel feels no
      worse (Phase 39 precedent).
- [ ] The run — commits, ports, coordinates, rounds, numbers, verdict — is recorded in
      PERFORMANCE.md in the D2 gate's table format.

**Verification:**
- [ ] **Stop and report** the numbers before any cut.

**Dependencies:** Checkpoint C.

**Files:** `docs/PERFORMANCE.md` (+ `worldGemMaterial.ts` only if a cut is taken)

**Estimated scope:** S (measurement, no code unless a cut)

## Task 20: Crawford's checkpoint and the Pixel

**Description:** The spec §5 checkpoint, by eye: the live 1920 × 1080 world at 9 am, noon, 3 pm
and 10 pm — a factory still reads as a silhouette; a robot still pops against a gem building; the
ring still reads with lit windows at deep night; the hairline reads on the darkest steel or its
colour is re-tuned (the lever is colour, not weight); the window grid sits centred inside the
ring. Then the Pixel for dropouts (none expected: nothing here touches audio or a moving layer).

**Acceptance criteria:**
- [x] Crawford signs off, or names the change; a colour re-tune lands as one constant in the
      sketch first, then in `worldGemMaterial.ts`/`gemShape.tsx`.

**Verification:**
- [x] Manual (Crawford). **Stop and report.**

**Dependencies:** Task 19.

**Files:** none unless re-tuned.

**Estimated scope:** XS

---

### Phase 5: Docs

## Task 21: BUILDING_DESIGN / ROBOT_DESIGN / PERFORMANCE and the docs test; drop the transition snapshots

**Description:** BUILDING_DESIGN.md "Color System" gains the material (ring, three tones, the
hour's light vector, the hairline, what is left alone); "Scenery families" gains the per-family
ring/hairline table; "The 90/45 test helper" records the `data-gem="ring"` exemption; "Rooftop
Greebles" entries note ring/hairline. ROBOT_DESIGN.md "Bevel and shading" says the world shares
`quantizeShade`, `inset`/`edgeNormals` and `bevelDepth`'s cap, and lights by the hour instead of
`GEM_LIGHT`. PERFORMANCE.md carries the Task 19 record. `src/docs/worldGemMaterialDocs.test.ts`
makes the criteria executable. Delete the pre-change markup snapshots from Tasks 8 and 13–17 (they
guarded the transition; the switch-off tests become plain "renders no ring/hairline" assertions).
Spot-check every named identifier against the shipped source.

**Acceptance criteria:**
- [ ] The docs test asserts: "Color System" names the ring, three tones and hairline; "The 90/45
      test helper" mentions `data-gem`; ROBOT_DESIGN.md's "Bevel and shading" mentions the world's
      light rule; PERFORMANCE.md has a Phase 44 gate section.
- [ ] No `__snapshots__` from this phase remain; the switch-off tests still pass.

**Verification:**
- [ ] `npx vitest run src/docs/worldGemMaterialDocs.test.ts` passes; `npm test` clean.
- [ ] `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 20.

**Files:** `docs/BUILDING_DESIGN.md`, `docs/ROBOT_DESIGN.md`, `docs/PERFORMANCE.md`,
`src/docs/worldGemMaterialDocs.test.ts`, the snapshot files

**Estimated scope:** S (docs + one test)

## Task 22: Roadmap, backlog archive, idea-doc header, CLAUDE.md reference line

**Description:** `docs/todo/roadmap.md` § 44: intent/spec/plan/shipped status, the three rulings
that superseded the idea doc (members hairline, terrain in, hairline on everything non-mass), the
rooftop rule, the gate verdict; move backlog item 9 to `docs/todo/archive`; add a superseded
header to `docs/ideas/world-gem-material.md` pointing at the intent's rulings; CLAUDE.md's
`BUILDING_DESIGN.md` reference line mentions the gem material (Phase 44).

**Acceptance criteria:**
- [ ] The docs test's roadmap and backlog assertions pass (no "spec and plan not started"; item 9
      absent from backlog.md and present in the archive).
- [ ] CLAUDE.md's reference line names the material; `src/content/content.test.ts` and every
      existing docs test stay green.

**Verification:**
- [ ] `npm test` clean; `npm run build:types`, `npm run lint` clean.

**Dependencies:** Task 21.

**Files:** `docs/todo/roadmap.md`, `docs/todo/backlog.md`, `docs/todo/archive/…`,
`docs/ideas/world-gem-material.md`, `CLAUDE.md`

**Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion above is met; the perf record is in PERFORMANCE.md.
- [ ] Docs reflect the shipped API — every documented name spot-checked against source.
- [ ] Any manual check not performed in-session (Checkpoints B/C, Task 20, the Pixel) is flagged
      here explicitly.
- [ ] Ready for Crawford's final review / PR to `main`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The factory's non-uniform `scale(sx, sy)` leaks into the ring or the margins (a stretched ring, a per-axis margin wrong by `sx/sy`) | High | The ring is a pixel-space sibling (Task 8); the clip/belt margins are asserted on a wide-short and a tall-narrow building (Task 9). |
| The facade contexts' mixed units (silhouette px vs box units) make the re-centring land in the wrong space | High | Task 10 proves centring on rendered rects, west face only, and names the east-face overflow as pre-existing and out of scope rather than "fixing" it silently. |
| A ring facet's 67.5° join breaks every scenery 50-seed sweep | Medium | Task 7 lands the exemption before any ring is drawn; the helper has its own test so the skip cannot silently widen. |
| `bevelHolds` fails on a short terrain step and a facet bow-ties | Medium | Task 18's 200-seed `bevelHolds(points, 8)` sweep; the shortest live step is 28 px vs ~6.6 px of miter shortening. |
| Three rooftop greebles become dynamic and repaint per tick for nothing when `ctx.light` is absent | Low | Task 11 asserts `compute` is lighting-independent and byte-identity without `light`; the paint cost is the same class as crownSpire's today. |
| The hairline vanishes on the darkest steel | Low | Accepted as sketched; Task 20 names the colour as the only lever and routes a re-tune through the sketch first. |
| Stroke widening nudges the midground silhouette boxes and a layer-switch test goes red | Low | `svgElementExtent` measures the box and the shapes the same way; `midgroundSilhouettes.test.tsx` is in Tasks 11, 12, 16 and 17's verification. |
| The "bevel 0 is byte-identical" promise erodes over 15 renderer edits | Medium | Every renderer task RED-steps a pre-change snapshot and GREEN-checks it with the switches mocked off; Task 21 removes the snapshots only after everything has landed. |
| Perf gate misses and a cut lands silently | High | Task 19 stops and reports before any cut; cuts are `WORLD_GEM` flags (one-line, reversible), never deletions; factories and mass are never cut. |

## Open Questions

All five spec open questions were resolved by Crawford on 2026-10-08 and are folded into spec
assumptions 5, 7, 8, 9 (see spec §7). Nothing is open for the plan.

1. Rooftop greeble set — **Resolved:** blocks ring, thin parts hairline, cupola arc hairline (Task 11, 12).
2. Windows at the ring edge — **Resolved:** re-centre inside the ring (Task 10).
3. Wall cap rail — **Resolved:** moved inside the ring (Task 13).
4. 90/45 exemption for ring facets — **Resolved:** accepted (Task 7).
5. Tank belts inset — **Resolved:** yes (Task 13).
