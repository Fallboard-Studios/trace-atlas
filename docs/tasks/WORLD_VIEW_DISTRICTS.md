# Implementation Plan: World View Districts

Spec: [docs/specs/WORLD_VIEW_DISTRICTS.md](../specs/WORLD_VIEW_DISTRICTS.md). Intent:
[docs/intent/world-view-districts.md](../intent/world-view-districts.md). Sketch:
[docs/sketches/world-view-districts.html](../sketches/world-view-districts.html). Roadmap Phase 42
(proposed). Three branches in sequence — `feature/world-districts` (D1), `feature/world-scenery` (D2,
from D1's tip), `feature/world-atmosphere` (D3, from D2's tip) — started only after Phase 40 lands on
its integration branch; **never** from `feature/orbiting-polygons`.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`; perf gate `npm run build && npx vite preview --port 4173` then
`npm run perf:idle --throttle 1 --only none --url http://localhost:4173/trace-atlas/?session=…`.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Spec correction found while planning (carry into spec §1.2 / §1.8 before Task 2):** a factory's
> `config.row` is an index into *its district's* recipe, and `Factory.tsx`, `factoryBubbleProps.ts`
> and the recolor path all resolve the row to get the variant filter. So every placed actor must also
> store `config.district: DistrictName` (serialisable, written once by `placeDistrict`), and
> `getRowConfig(row)` becomes `getRecipeRow(district, row)`. Without it a reader cannot tell which
> table the index points into.

## Overview

Twenty-three tasks in three branches. **D1** (Tasks 1–10) replaces the fixed row table with nine
seeded district recipes, adds the terrain profile and ground lock, the hour-driven water column, the
real depth lightness cap and the derelict flag — with factories only, so "nine seeds read as nine
places" is judged before any new silhouette exists. **D2** (Tasks 11–19) lands the sixteen scenery
families through one dispatcher, in groups that share a mechanism (gem users, body-bearing items
that recolor, structural items, the bubble-venting vent), plus derived pipe bridges. **D3**
(Tasks 20–23) adds light shafts and marine snow. Every branch ends with Crawford's live gate, an
idle-paint perf gate that stops and reports, and a docs task. Every task leaves types, lint and the
suite green; RED first; one commit per task; mutation-check each rule test by breaking the constant
or branch it guards and naming the check in the commit message.

## Architecture Decisions

- **Pure modules first, scene wiring last, in every branch.** Terrain, recipes and the district pick
  are functions of a noise map and are fully tested without React; the placer composes them; the
  layers only draw what the placer wrote. Renderers in D2 are pure functions of a `SceneryContext`.
- **Recipe tables ship complete in D1, families light up by registry in D2.** `placeDistrict` skips
  any row whose kind is not in `SCENERY_RENDERERS`, so the tables are written once and each D2 task
  turns rows on by registering a renderer. Nothing is re-authored between branches.
- **Anchors, not y values.** Rows say *where an item stands* (ridge, floor, ground, offscreen); the
  placer resolves the base from the terrain profile and writes it into `Actor.position`. The
  floating-base bug becomes impossible by construction and is asserted by one invariant test that
  runs over every district and twenty seeds.
- **Readers migrate behind a new accessor.** Task 4 adds `getRecipeRow(district, row)` alongside the
  old `getRowConfig`; Task 5 migrates the three readers and deletes `FACTORY_ROWS`. The build is
  green between the two commits.
- **One shared body-colour fold.** `foldBodyShift()` is extracted from `createFactory` so factories
  and the five body-bearing scenery families compute identical stored shifts, and one generalised
  recolor path replays it. The parity test seeds a non-default lean so it cannot pass by
  coincidence (project memory: parity fixtures need distinguishing values).
- **Gem accents reuse Phase 39's tone quantisation, not its generator.** `gemShape.ts` imports
  `quantizeShade` from `gemShading.ts`; a rock or a beacon head is one polygon.
- **The perf gate is per branch and stops.** Static layers should cost paint on the lighting tick
  only; the D1 run with factories alone sets the real headroom from which the D2 element budget is
  derived (spec §7 Q1) before any family lands.

## Dependency Graph

```
D1  T1 terrainProfile ─┐
    T2 Actor types + districtRecipes ─┼─► T4 placeDistrict + getRecipeRow + ground-lock invariant ─► T5 migrate readers, delete FACTORY_ROWS ─┐
    T3 pickDistrict ───┘                                                                                                                   ├─► T7 TerrainLayer ─► T8 WaterColumn ─► Checkpoint A ─► T9 perf gate (stop) ─► T10 docs + roadmap
    T6 sceneDepth constants + Factory cap/derelict (independent of T4/T5) ─────────────────────────────────────────────────────────────────┘
D2  T11 scenery scaffolding + wall ─► T12 gemShape + pylon/beacon/boulder
                                   ─► T13 foldBodyShift + recolorActors + tank ─► T14 dome/scaffold/containers
                                   ─► T15 crane/pipeline/pipe bridges ─► T16 turbine/tether/floodlight/dish ─► T17 wreck/vent + bubbles
                                                                       Checkpoint B ─► T18 perf gate (stop) ─► T19 docs
D3  T20 LightShafts ─► T21 MarineSnow ─► Checkpoint C ─► T22 perf gate (stop) ─► T23 docs + roadmap
```

Parallelisable: T1 ‖ T2 ‖ T3 ‖ T6. T4 needs T1–T3. T7 needs T4 (reads the profile the placer uses).
T12–T16 need T11 and are independent of each other; T14 needs T13; T17 needs T11.

---

## Task List

### Phase D1: Districts, terrain, water (`feature/world-districts`)

## Task 1: `terrainProfile.ts` — the two stepped profiles

**Description:** `getTerrainProfile(localeId, noiseMap)` → `{ ridge: Step[], ground: Step[] }` built
from four dataIds (`'terrain.ridge.run'`, `'terrain.ridge.step'`, `'terrain.ground.run'`,
`'terrain.ground.step'`, offset = step index), cached per locale like the noise maps; `ridgeYAt`,
`groundYAt`; a `Step` is `{ x0, y0, x1, y1 }` with `x1 − x0 === |y1 − y0|` or `y0 === y1`. Bands
and runs per spec §1.3 (ridge start 860, band 640–900, runs 80–260, steps `[-60,-40,0,0,40,60]`;
ground start 1050, band 1035–1075, runs 120–400, steps `[-20,0,0,0,20]`). Constants commented with
the §1.3 row they implement; the ground band's "raised above every midground floor" reason stated.

**Acceptance criteria:**
- [ ] Every step is horizontal or exactly 45°; profiles cover `0..1920` with no gap; every y stays
      inside its band; a clamped step shortens its 45° run to match (`dx === |dy|` still holds).
- [ ] `groundYAt`/`ridgeYAt` return the flat y on runs and interpolate linearly on slopes; querying
      x = 0 and x = 1920 never throws.
- [ ] Same locale → identical profile (two calls, deep-equal); two locales → different.
- [ ] Mutation check: changing the ground band floor 1035 → 1010 fails the "ground never below any
      midground floor (≤ 1030)" case.

**Verification:** `npx vitest run src/systems/terrainProfile.test.ts`; `npm run build:types`;
`npm run lint`. **Dependencies:** None. **Files:** `src/systems/terrainProfile.ts`,
`src/systems/terrainProfile.test.ts`. **Scope:** S.

## Task 2: Actor types and the nine recipe tables

**Description:** `ActorType.SCENERY`; `SceneryKind` (16 names) and `DistrictName` (9) in
`types/Actor.ts`; `Actor.config` gains `kind?: SceneryKind`, `district?: DistrictName`,
`derelict?: true`. `districtRecipes.ts`: the `DistrictRow` type (spec §1.2, `anchor` + optional
`floorY`, no literal `y`) and `RECIPES` — all nine tables exactly as spec §1.2, including rows for
families that do not exist yet. `DERELICT_RATIO = 0.25`, and per spec §7 Q5 the habitat and
construction tables set `derelict: 0` on their rows (recommendation adopted; flag in the commit).

**Acceptance criteria:**
- [ ] Every row: `depth` valid; `anchor` valid and `floorY` present iff `anchor === 'floor'`, within
      980–1000 (background) or 1015–1030 (midground); `spread` valid with its width field present;
      `count ≥ 1`; `kind` is `'factory'` or a `SceneryKind`; factory rows have ≥ 1 variant from
      `VARIANT_CONF`; any `derelict` in 0–1.
- [ ] `anchor === 'offscreen'` appears only on foreground rows; `anchor === 'ridge'` only on
      background rows.
- [ ] `RECIPES` has exactly the nine `DistrictName`s and no `legacy`; habitat and construction rows
      all carry `derelict: 0`.
- [ ] Mutation check: setting one dense row's `floorY` to 1050 fails the band case.

**Verification:** `npx vitest run src/systems/districtRecipes.test.ts`; `npm run build:types`.
**Dependencies:** None. **Files:** `src/types/Actor.ts`, `src/systems/districtRecipes.ts`,
`src/systems/districtRecipes.test.ts`. **Scope:** S.

## Task 3: `pickDistrict`

**Description:** `districts.ts` exports `DISTRICT_NAMES` (spec order) and
`pickDistrict(noiseMap)` — one `getSeededVal(noiseMap, 'locale.district', 0, 0, 1)` draw mapped to
`DISTRICT_NAMES[min(8, floor(v × 9))]`. Nothing else in this file yet.

**Acceptance criteria:**
- [ ] Deterministic per map; `v = 0` → `dense`, `v → 1` → `construction`, never out of range.
- [ ] Over the 121 coordinates `x, y ∈ {-200, -160, …, 200}` (real `getLocaleNoiseMap`s), every
      district appears ≥ 8 times.
- [ ] The dataId string is asserted literally (`'locale.district'`): renaming it is a world-generation
      break.

**Verification:** `npx vitest run src/systems/districts.test.ts`. **Dependencies:** None.
**Files:** `src/systems/districts.ts`, `src/systems/districts.test.ts`. **Scope:** XS.

## Task 4: `placeDistrict`, `getRecipeRow`, the ground-lock invariant

**Description:** `placeDistrict(localeId)` in `districts.ts`: picks the district, gets the terrain
profile, and for each recipe row runs the existing edges/full/center spread logic (moved out of
`placeFactories` into a shared `spreadXs(row, nextWidth)` helper that keeps the seeded
`'factory.spacing'` jitter), resolving each item's base y by anchor (spec §1.4), drawing
`config.derelict` from `'actor.derelict'` at offset actorIndex when the kind is derelict-capable,
and writing `config.district` + `config.row` on every actor. Factory rows call the existing
`createFactory`. Rows whose kind is not `'factory'` and not in `SHIPPED_SCENERY` (an exported
`Set<SceneryKind>`, empty in D1) place nothing. Adds `getRecipeRow(district, row)` to
`factoryPlacementSystem.ts` next to the still-present `getRowConfig`. `placeFactories` remains and
is untouched by this task.

**Acceptance criteria:**
- [ ] For every district and 20 seeds: every actor has `config.district` and `config.row`; the
      number of factory actors per row ≤ `count`; no non-factory actors exist (D1).
- [ ] **Ground-lock invariant:** every actor's base y is `ridgeYAt(x)` ±0.5 (anchor ridge),
      `groundYAt(x)` ±0.5 (ground), the row's `floorY` (floor) with `floorY ≤ groundYAt(x)` on
      midground rows, or ≥ 1080 (offscreen). Mutation check: resolving `ground` to a fixed 1050
      fails it.
- [ ] Derelict: with a row override of 1 every item of that row is derelict; with 0 none; with 0.25
      the 20-seed mean is 0.15–0.35. Derelict never set on a kind outside the capable set.
- [ ] Same locale → identical actors (deep-equal); `getRecipeRow('dense', 0)` returns dense row 0;
      out-of-range → `null`.

**Verification:** `npx vitest run src/systems/districts.test.ts src/systems/factoryPlacementSystem.test.ts`;
`npm run build:types`. **Dependencies:** T1, T2, T3. **Files:** `src/systems/districts.ts`,
`src/systems/districts.test.ts`, `src/systems/factoryPlacementSystem.ts`,
`src/systems/factoryPlacementSystem.test.ts`. **Scope:** M.

## Task 5: Migrate the readers; delete `FACTORY_ROWS` and `placeFactories`

**Description:** `worldTransition.initializeLocale` calls `placeDistrict`. `Factory.tsx`,
`factoryBubbleProps.ts` and `recolorFactoriesForAttenuationStyle` read the variant filter and depth
via `getRecipeRow(actor.config.district, actor.config.row)` (fallback `'dense'`, row
`DEFAULT_FACTORY_ROW`, documented as defensive only). `bubbleDepthScaleForRow` takes the depth
label. Delete `FACTORY_ROWS`, `getRowConfig`, `placeFactories` and their 25 + 2 + 4 test references,
rewriting those cases against recipes.

**Acceptance criteria:**
- [ ] `grep -rn "FACTORY_ROWS\|getRowConfig\|placeFactories" src` returns nothing.
- [ ] Rewritten tests: factory variant at render equals the variant chosen at placement for every
      row of every district (the "spawn and render agree" guarantee `createFactory` documents).
- [ ] `recolorFactoriesForAttenuationStyle` parity (existing test) still passes with recipe rows.
- [ ] OceanScene mount still populates an empty locale once and never twice (existing guard test).

**Verification:** `npm test` (full, since this is the breaking change); `npm run build`.
**Dependencies:** T4. **Files:** `src/systems/factoryPlacementSystem.ts` (+ test),
`src/systems/worldTransition.ts` (+ test), `src/components/actors/Factory.tsx`,
`src/components/actors/factoryBubbleProps.ts` (+ test). **Scope:** M (five implementation files;
the deletion is the point of the task).

## Task 6: `sceneDepth.ts` — the real lightness cap and derelict rendering

**Description:** `constants/sceneDepth.ts`: `ROW_L_CAP = { background: 0.7, midground: 0.85,
foreground: 1.0 }`, `DERELICT_L_CAP = 0.55`, `DERELICT_SAT = 0.4`, `WORLD_BOUNDS` (moved from the
placer; spec §7 Q3 — the test file imports it rather than redeclaring). `Factory.tsx` multiplies the
cap into `eastLMultiplier`/`westLMultiplier` before `applyColorShift`, and when
`config.derelict`: `nightDepth` 0, cap × `DERELICT_L_CAP`, body saturation × `DERELICT_SAT`, antenna
and rooftop indicator lights dark. Lit windows and indicators are never capped (spec §1.7).

**Acceptance criteria:**
- [ ] Background factory body lightness at noon = base × eastL × 0.7 (±1 rounding); foreground × 1.0.
- [ ] Derelict factory at hour 0: zero lit-window fills; body saturation 40 % of a non-derelict
      twin; the antenna light absent.
- [ ] A lit window's fill is identical in background and foreground rows (not capped).
- [ ] Mutation check: dropping the cap multiply fails the background case.

**Verification:** `npx vitest run src/components/actors/Factory.test.tsx`; `npm run build:types`.
**Dependencies:** T2 (the `derelict` field). **Files:** `src/constants/sceneDepth.ts`,
`src/components/actors/Factory.tsx`, `src/components/actors/Factory.test.tsx`,
`src/systems/factoryPlacementSystem.ts` (import), `src/systems/factoryPlacementSystem.test.ts`
(import). **Scope:** S.

## Task 7: `TerrainLayer`

**Description:** `TerrainLayer` renders the ridge and ground polygons from `getTerrainProfile`,
closed to the bottom edge, fills per spec §1.3 from the lighting tick (`activeLocaleLocalTime` →
`getLighting`, rounded to whole percent). Exposes `data-terrain="ridge|ground"`. `OceanScene`
mounts the ridge before `#factory-background-layer` and the ground after `#gradient-mid-front`.

**Acceptance criteria:**
- [ ] Polygon point lists equal the profile's steps plus the two bottom corners; ridge comes before
      the background group and ground after the mid/front gradient in document order.
- [ ] Fill lightness at hour 12 vs hour 0 differs and matches §1.3 formulas within rounding; no
      element carries a `transition` style.
- [ ] Re-render at the same rounded hour produces identical attribute strings (no churn).

**Verification:** `npx vitest run src/components/panels/screen/worldView`; `npm run build`.
**Dependencies:** T4, T5. **Files:** `worldView/TerrainLayer.tsx`, `worldView/TerrainLayer.test.tsx`,
`worldView/OceanScene.tsx`, `worldView/OceanScene.test.tsx`. **Scope:** S.

## Task 8: `WaterColumn`

**Description:** Replaces the background `<rect fill={backgroundColor}>` with a `<linearGradient
id="water-{localeId}">` and the surface glow ellipse per spec §1.5, on the lighting tick, whole-percent
rounding, glow omitted when `d ≤ 0.2`. Removes the `backgroundColor` prop. `data-water` on the group.

**Acceptance criteria:**
- [ ] Stops at hours 0 / 6 / 12 / 18 match §1.5 within rounding; glow present at 12, absent at 0;
      glow `cx` moves with the hour.
- [ ] Gradient id carries the locale id (two scenes in one document would not collide).
- [ ] `OceanScene` no longer accepts `backgroundColor`; `.ocean-scene__layer` CSS background unchanged.

**Verification:** `npx vitest run src/components/panels/screen/worldView`; `npm run build`.
**Dependencies:** T7. **Files:** `worldView/WaterColumn.tsx`, `worldView/WaterColumn.test.tsx`,
`worldView/OceanScene.tsx`, `worldView/OceanScene.test.tsx`. **Scope:** S.

### Checkpoint A: D1 live gate (Crawford, `npm run dev`) — stop and report
- [ ] Full suite, types, lint, build green.
- [ ] Nine seeds (the sketch's strip seeds are a start) read as nine places with factories alone.
- [ ] No floating base at any seed; the ridge reads as terrain; the water reads as water at 0 / 6 /
      12 / 18 h; the depth cap reads as depth without the gradient rects looking doubled.
- [ ] Spec §7 Q2 (ridge-anchored towers above the frame) judged here.

## Task 9: D1 perf gate — stop and report

**Description:** Spec §5.3 method: base vs branch production builds served side by side, one pinned
`?session=` world per district under test (at least `dense` and `ventfield`), `npm run perf:idle
--throttle 1 --only none`, three rounds, order rotated, foreground, orphaned Chrome 0. Record a
dated section in docs/PERFORMANCE.md. From the stock paint-by-node rows, derive the D2 element
budget (spec §7 Q1) and write it into `districtRecipes.ts` as `SCENERY_SHAPE_BUDGET` with its
reason.

**Acceptance criteria:**
- [ ] Busy and `Paint` within the 17.2.5 noise band of base on every pinned world; `Layout SVG
      changed` per frame unchanged.
- [ ] PERFORMANCE.md section has the table, the method line and the budget derivation.
- [ ] A miss is reported with the table; nothing is tuned in this task.

**Verification:** the harness runs; `npm run build:types` after the constant lands.
**Dependencies:** Checkpoint A. **Files:** `docs/PERFORMANCE.md`, `src/systems/districtRecipes.ts`
(+ test for the budget). **Scope:** S.

## Task 10: D1 docs and roadmap

**Description:** BUILDING_DESIGN.md: "Placement & Rows (runtime)" → "Districts" (recipe shape,
anchors, the ground-lock invariant, the `config.district` field); "Atmospheric Depth" corrected to
`ROW_L_CAP` and "now applied"; a "Derelict" paragraph. PROCEDURAL_GENERATION.md call-site table:
`'locale.district'`, `'terrain.*'`, `'actor.derelict'`; a Gotcha on the accepted world-generation
break. ANIMATION_SYSTEM.md scene-layers paragraph: terrain and water are static-layer content on the
lighting tick. Roadmap: Phase 42 entry (Create / About / Not Doing) with D1 shipped, D2/D3 planned.
Spec: fold the plan-time correction (`config.district`, `getRecipeRow`) into §1.2 / §1.8.

**Acceptance criteria:**
- [ ] `src/content/content.test.ts` and any docs tests green; no stale reference to
      `FACTORY_ROWS`/`placeFactories` in docs (`grep -rn docs`), except the archive.
- [ ] CLAUDE.md "Reference docs" line for BUILDING_DESIGN.md mentions districts.

**Verification:** `npm test`; `grep`. **Dependencies:** T9. **Files:** `docs/BUILDING_DESIGN.md`,
`docs/PROCEDURAL_GENERATION.md`, `docs/ANIMATION_SYSTEM.md`, `docs/todo/roadmap.md`, `CLAUDE.md`,
`docs/specs/WORLD_VIEW_DISTRICTS.md`. **Scope:** S (docs only).

---

### Phase D2: Scenery families (`feature/world-scenery`, from D1's tip)

## Task 11: Scenery scaffolding, dispatcher, and the first family (wall)

**Description:** `scenery/sceneryTypes.ts` (`SceneryContext`, `SceneryRenderer`, spec §4);
`scenery/sceneryParams.ts` (`deriveSceneryParams(actor)` — the per-kind `Alea(id)` ranges of spec
§1.9, all 16 kinds, each range commented with its row; also `maxShapes(kind)` for the budget test);
`scenery/Scenery.tsx` (memoised; builds the context from `config`, `ROW_L_CAP`, the lighting tick,
`deriveAsAccentPair`, `SCENERY_GEM_ACCENTS = true`; dispatches on `SCENERY_RENDERERS[kind]`);
`SHIPPED_SCENERY` becomes `new Set(Object.keys(SCENERY_RENDERERS))`. `OceanScene` renders
`SCENERY` actors per depth interleaved with factories in `config.row` order. A test helper
`assertNinetyFortyFive(svgRoot)` checks every `rect`/`polygon`/`line` edge is horizontal, vertical or
45° (ignoring `rotate(±45)` groups' interiors, which are the grid by construction). First renderer:
`renderers/wall.tsx` (structural tone only in this task; its body shift comes with T13).

**Acceptance criteria:**
- [ ] `placeDistrict` on `outskirts` now yields wall actors with `config.kind === 'wall'`, in the
      foreground, bases on the ground profile (the T4 invariant test picks them up unchanged).
- [ ] `<OceanScene>` renders `[data-scenery="wall"]` inside `[data-scene-layer="front"]`, after the
      factories of lower row index and before those of higher.
- [ ] Wall: two faces, west/east fills differ at hour 9; cap rail present; `assertNinetyFortyFive`
      passes over 50 seeds; no NaN attributes.
- [ ] `deriveSceneryParams` is deterministic and every value inside its §1.9 range across 200 ids
      per kind; `maxShapes` ≥ the rendered element count for wall.
- [ ] Mutation check: removing the row-order sort fails the interleave case.

**Verification:** `npx vitest run src/components/actors/scenery src/components/panels/screen/worldView src/systems/districts.test.ts`;
`npm run build`. **Dependencies:** D1 complete. **Files:** `scenery/sceneryTypes.ts`,
`scenery/sceneryParams.ts` (+ test), `scenery/Scenery.tsx` (+ test), `scenery/renderers/wall.tsx`
(+ test), `worldView/OceanScene.tsx` (+ test), `src/systems/districts.ts`. **Scope:** M.

## Task 12: `gemShape.ts` and the gem users — pylon, beacon, boulder

**Description:** `scenery/gemShape.ts` (`GemShape` component, spec §1.10: chamfer 0.3·min(w,h),
three facet tones via `quantizeShade` from `gem/gemShading.ts`, side facet on the brighter face,
outline stroke 2; `accentBase(hue)`; lit lightness × lerp(0.9, 1.6, nd)). Renderers `pylon.tsx`
(gem head when `gems`, else alert circle), `beacon.tsx` (gems-only: `placeDistrict` skips beacon rows
when `SCENERY_GEM_ACCENTS` is false), `boulder.tsx` (1–3 unlit neutral gems, sunk 8).

**Acceptance criteria:**
- [ ] `GemShape` emits exactly four polygons + one outline; tone fills are three distinct values that
      pass through `quantizeShade`; the side facet is on the east when `eastL ≥ westL`, else west.
- [ ] Pylon: cross-arms at ¼ steps; head is a gem with gems on and a circle with gems off (both
      asserted).
- [ ] Boulder: n gems with bottoms at `y + 8`; no lit element at any hour; saturation ≤ 12 + 8.
- [ ] `assertNinetyFortyFive` over 50 seeds for each; `maxShapes` holds.

**Verification:** `npx vitest run src/components/actors/scenery`. **Dependencies:** T11.
**Files:** `scenery/gemShape.tsx` (+ test), `renderers/pylon.tsx`, `renderers/beacon.tsx`,
`renderers/boulder.tsx` (+ tests), `src/systems/districts.ts` (beacon skip). **Scope:** M.

## Task 13: `foldBodyShift`, `recolorActorsForAttenuationStyle`, tank (and wall's body)

**Description:** Extract `foldBodyShift(baseBody, localShift, asShift, accentTarget)` from
`createFactory`; `placeDistrict` stores `hueShift`/`satShift` for body-bearing scenery (wall, tank,
dome, containers, scaffold — each kind's base body and local ranges in `sceneryParams.ts`).
`recolorFactoriesForAttenuationStyle` → `recolorActorsForAttenuationStyle`: iterates every actor
with a body, factory or scenery, re-deriving the local shift and folding the new style's shift and
lean. `renderers/tank.tsx` (two faces with 45° shoulders, belts, gauge; derelict-capable). Wall
switches from a fixed tone to its stored shift.

**Acceptance criteria:**
- [ ] `createFactory` output is byte-identical to pre-task for a fixed input (regression fixture).
- [ ] Parity: recolor under style B equals fresh placement under style B, actor for actor, for a
      locale containing factories, walls and tanks — fixture asserts the lean moved at least one
      actor's hue by ≥ 10° so the test cannot pass with lean disabled.
- [ ] Tank: shoulder polygons' slanted edges are 45°; gauge circle `indicator.powered` lit / `off`
      when derelict; cap × 0.55 and sat × 0.4 when derelict.
- [ ] Mutation check: skipping scenery in the recolor loop fails parity.

**Verification:** `npx vitest run src/systems src/components/actors/scenery`. **Dependencies:** T11.
**Files:** `src/systems/factoryPlacementSystem.ts` (+ test), `src/systems/districts.ts`,
`src/systems/worldTransition.ts` (rename call), `renderers/tank.tsx` (+ test), `renderers/wall.tsx`.
**Scope:** M.

## Task 14: Body-bearing families — dome, scaffold, containers

**Description:** `renderers/dome.tsx` (two-faced base, half-ellipse dome split at centre via two
arc paths, 3–6 portholes on the dome curve, hatch, mast light; derelict-capable),
`renderers/scaffold.tsx` (solid lower 25–45 %, posts per bay, levels every 60, 45° braces in
alternating bays, top light; derelict → `shell.shadow` frame, no light), `renderers/containers.tsx`
(cols × rows boxes alternating the accent pair, label squares). Params already in T11.

**Acceptance criteria:**
- [ ] Dome: the two dome paths meet at `x` with west/east fills; porthole count = params; portholes
      lit fraction rises with `nightDepth`; derelict → none lit, mast light absent.
- [ ] Scaffold: brace polygons are 45° parallelograms of length `min(bay, 60)`; braces only in
      alternating bays (asserted by count = ⌈bays·levels/2⌉ ± 1).
- [ ] Containers: upper rows have one fewer box; adjacent boxes alternate hue between the pair.
- [ ] `assertNinetyFortyFive` (dome's arcs excepted as ellipse decoration) over 50 seeds; `maxShapes`
      holds for all three.

**Verification:** `npx vitest run src/components/actors/scenery`. **Dependencies:** T13.
**Files:** `renderers/dome.tsx`, `renderers/scaffold.tsx`, `renderers/containers.tsx` (+ 3 tests).
**Scope:** M.

## Task 15: Structural families — crane, pipeline, and derived pipe bridges

**Description:** `renderers/crane.tsx`, `renderers/pipeline.tsx` (top highlight strip, stanchions
every 110, riser with flange and valve at the seeded end), and `scenery/pipeBridges.tsx` — a per-depth
component that takes that depth's factory actors, finds x-adjacent pairs in one row with facade gap
60–260, and draws the bar and post per spec §1.9 (no actor created). `OceanScene` mounts
`PipeBridges` after each depth's actors.

**Acceptance criteria:**
- [ ] Crane: posts lit west/east separately; knee brace triangle is 45°; load hangs at
      `0.2–0.8 w`; beam-end light present.
- [ ] Pipeline: stanchion count = ⌊(w − 60) / 110⌋ + 1; riser at the seeded side; valve circle lit.
- [ ] Pipe bridges: a fixture row with gaps 40 / 120 / 300 yields exactly one bridge; its bar spans
      the gap + 20 and its post reaches the lower base; two seeds move the bar height within
      `+40..+100` of the higher roof.
- [ ] `assertNinetyFortyFive` over 50 seeds; budgets hold.

**Verification:** `npx vitest run src/components/actors/scenery src/components/panels/screen/worldView`.
**Dependencies:** T11. **Files:** `renderers/crane.tsx`, `renderers/pipeline.tsx`,
`scenery/pipeBridges.tsx` (+ 3 tests), `worldView/OceanScene.tsx`. **Scope:** M.

## Task 16: Structural families — turbine, tether, floodlight, dish

**Description:** Four small renderers per spec §1.9: `turbine.tsx` (blades in one `rotate(45)`
group, hub light), `tether.tsx` (anchor, vertical, one 45° parallelogram dog-leg, vertical to y −20,
optional float), `floodlight.tsx` (beam polygon with one vertical and one 45° edge, opacity
`0.04 + 0.12 nd`, ground pool ellipse), `dish.tsx` (ellipse in `rotate(±45)` with feed stub, centre
light). (The `dock` pad family was dropped 2026-10-06 — roadmap Phase 43's charging stations
replace it; see the spec's amendment note.)

**Acceptance criteria:**
- [ ] Turbine: blade rects are inside a `rotate(45 …)` group; hub radius 11.
- [ ] Tether: the dog-leg polygon's slanted edges are 45° and `|dx|` 40–90; the top segment ends at
      y −20; float present on the seeds the params flag.
- [ ] Floodlight: beam opacity 0.04 at hour 12 and 0.16 at hour 0 (±0.005); one beam edge
      vertical, one 45°.
- [ ] `assertNinetyFortyFive` over 50 seeds each; budgets hold.

**Verification:** `npx vitest run src/components/actors/scenery`. **Dependencies:** T12 (GemShape).
**Files:** `renderers/turbine.tsx`, `renderers/tether.tsx`, `renderers/floodlight.tsx`,
`renderers/dish.tsx` (+ 4 tests). **Scope:** M (four small files; split into
16a/16b if any renderer runs past ~80 lines).

## Task 17: Wreck, vent, and vents that vent bubbles

**Description:** `renderers/wreck.tsx` (stern block, 45° raked bow, deck rail, deckhouse + funnel,
dead portholes, keel shadow; always derelict: cap × 0.5, sat 6) and `renderers/vent.tsx` (stepped
cone, static plume ellipses, mouth glow). `getFactoryBubbleProps` → `getActorBubbleProps` (vent →
mouth position, `isActive: true`, `bodyHue: vent.shadow.h`, depth scale by depth label; other
scenery → `null`); `BubbleLayer` takes all actors; `OceanScene.bubbleBuildingCount` counts vents.
`districtRecipes.test.ts` asserts ≤ 9 vents per district.

**Acceptance criteria:**
- [ ] Wreck: bow polygon's raked edge is 45° (`x1 − h`); no lit element at any hour; `config.derelict`
      absent (always-derelict is the renderer's rule, not a flag).
- [ ] Vent: step count = params; each step narrower by `0.9 × step` (min 14); mouth circle opacity
      `0.5 + 0.4 nd × glow`.
- [ ] `getActorBubbleProps(vent)` → `ventY` = the top step's y; a `BubbleStream` renders per vent in
      `[data-scene-layer="bubbles"]`; wall/tank → `null`; the existing factory cases unchanged.
- [ ] `bubbleBuildingCount` with 3 eligible factories and 2 vents = 5.

**Verification:** `npx vitest run src/components/actors src/components/panels/screen/worldView src/systems/districtRecipes.test.ts`;
`npm run build`. **Dependencies:** T11. **Files:** `renderers/wreck.tsx`, `renderers/vent.tsx`
(+ tests), `actors/factoryBubbleProps.ts` (+ test), `actors/BubbleLayer.tsx`,
`worldView/OceanScene.tsx`. **Scope:** M.

### Checkpoint B: D2 live gate (Crawford, `npm run dev`) — stop and report
- [ ] Full suite, types, lint, build green; every district places every row of its table.
- [ ] Each family judged in its districts; derelict legible at night; wrecks read as wrecks.
- [ ] Gem accents rhyme with the robots rather than read as robots (boulders especially).
- [ ] A Sector Settings retransmit recolors walls/tanks/domes/containers/scaffolds with the skyline.
- [ ] Vents bubble; aggregate bubble rate feels unchanged.

## Task 18: D2 perf gate — stop and report

**Description:** Same method as T9 against the D1 tip, on `dense`, `ventfield` and `yard` pinned
worlds (heaviest scenery, most bubbles, most body-bearing items). Confirm the T9-derived
`SCENERY_SHAPE_BUDGET` is met by the budget test and by the harness's element counts. Dated section
in PERFORMANCE.md.

**Acceptance criteria:**
- [ ] Busy and `Paint` within the noise band of D1 on every pinned world; bubbles-layer cost rises
      by no more than the vent count's share of the existing streams.
- [ ] A miss is reported with the table and the per-family paint-by-node rows, not tuned away; the
      lever offered is "which families earn a spot".

**Verification:** the harness. **Dependencies:** Checkpoint B. **Files:** `docs/PERFORMANCE.md`.
**Scope:** S.

## Task 19: D2 docs

**Description:** BUILDING_DESIGN.md gains a "Scenery families" section (the §1.9 table, the
`SceneryContext` contract, gem accents, body-bearing vs structural, recolor coverage, the 90/45 test
helper); "Goal 2 — Bubble Streams" notes vents. PROCEDURAL_GENERATION.md: `Alea(actor.id)` at render
for scenery parameters, `'actor.derelict'`. ROBOT_DESIGN.md: one line that `gemShading.quantizeShade`
is shared with scenery. Roadmap Phase 42: D2 shipped.

**Acceptance criteria:**
- [ ] Docs tests green; every `SceneryKind` named in BUILDING_DESIGN.md; no stale
      `recolorFactoriesForAttenuationStyle`/`getFactoryBubbleProps` references in docs.

**Verification:** `npm test`; `grep`. **Dependencies:** T18. **Files:** `docs/BUILDING_DESIGN.md`,
`docs/PROCEDURAL_GENERATION.md`, `docs/ROBOT_DESIGN.md`, `docs/todo/roadmap.md`. **Scope:** S.

---

### Phase D3: Atmosphere (`feature/world-atmosphere`, from D2's tip)

## Task 20: `LightShafts`

**Description:** Back-layer component after `WaterColumn`, before the ridge: 3–5 polygons (one
vertical edge, one 45° edge) from the top edge, seeded on the locale map (`'atmos.shaft.x'`,
`'atmos.shaft.w'`, `'atmos.shaft.depth'`, offset = index; `'atmos.shaft.dir'` once), filled by a
vertical gradient `glass.base` at opacity `0.11 × (1 − nd)` → 0; renders nothing when that opacity
< 0.005. `data-atmos="shafts"`.

**Acceptance criteria:**
- [ ] Polygon count 3–5 per locale, deterministic; each has exactly one vertical edge and one 45°
      edge; depth 420–760.
- [ ] Gradient top opacity 0.11 at hour 12 (±0.001); the group is absent at hour 0.
- [ ] Gradient id carries the locale id.

**Verification:** `npx vitest run src/components/panels/screen/worldView`. **Dependencies:** D2
complete. **Files:** `worldView/LightShafts.tsx` (+ test), `worldView/OceanScene.tsx` (+ test).
**Scope:** S.

## Task 21: `MarineSnow`

**Description:** Front-layer component after the foreground row: 140 circles, r 1.2–3, seeded
positions (`'atmos.snow.x'`, `'atmos.snow.y'`, `'atmos.snow.r'`, `'atmos.snow.a'`, offset = index),
`shell.highlight`, opacity `(0.08–0.3) × lerp(0.6, 1, 1 − nd)`. `data-atmos="snow"`. The D3 budget
test asserts atmosphere ≤ 200 shapes.

**Acceptance criteria:**
- [ ] Exactly 140 circles, deterministic per locale, every attribute in range; opacity at hour 0 is
      0.6× its hour-12 value (±0.005).
- [ ] Rendered inside `[data-scene-layer="front"]` after `#factory-foreground-layer`.

**Verification:** `npx vitest run src/components/panels/screen/worldView src/systems/districtRecipes.test.ts`.
**Dependencies:** T20. **Files:** `worldView/MarineSnow.tsx` (+ test), `worldView/OceanScene.tsx`,
`src/systems/districtRecipes.test.ts`. **Scope:** S.

### Checkpoint C: D3 live gate (Crawford, `npm run dev`) — stop and report
- [ ] Shafts sell "underwater" at 9 / 12 / 15 h without fighting the depth gradients; gone at night.
- [ ] Snow is felt, not seen; nothing reads as a bug at 1024 px or on the Pixel.

## Task 22: D3 perf gate — stop and report

**Description:** Same method as T9 against the D2 tip on two pinned worlds, at hour 12 (shafts on)
and hour 0 (off) — the pinned session's hour is set by its coordinates, so pick coordinates for each.
Dated PERFORMANCE.md section.

**Acceptance criteria:**
- [ ] Within the noise band of D2 in both hours; the front layer's `Layout SVG changed` count
      unchanged (snow is static).

**Verification:** the harness. **Dependencies:** Checkpoint C. **Files:** `docs/PERFORMANCE.md`.
**Scope:** S.

## Task 23: D3 docs, roadmap close-out, spec "Shipped" headers

**Description:** ANIMATION_SYSTEM.md: atmosphere is static-layer content, and the "drift the snow"
idea is named as a moving-layer, perf-gated future. BUILDING_DESIGN.md: an "Atmosphere" paragraph.
Roadmap Phase 42 marked shipped with the three branch tips, the Not Doing list from the intent, and
decisions made while building. Intent/spec/sketch headers gain the `> **Shipped**` line in the Phase
39 style. Sketch header verdict blanks filled from Checkpoints A–C.

**Acceptance criteria:**
- [ ] Docs tests green; roadmap entry links intent, spec, plan, sketch; CLAUDE.md Reference docs
      line current.

**Verification:** `npm test`. **Dependencies:** T22. **Files:** `docs/ANIMATION_SYSTEM.md`,
`docs/BUILDING_DESIGN.md`, `docs/todo/roadmap.md`, the intent, spec and sketch headers, `CLAUDE.md`.
**Scope:** S.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Replacing `FACTORY_ROWS` breaks 31 existing test references and every world at once | High | T4 adds the new accessor beside the old; T5 is one dedicated commit with the full suite as its gate; breaking worlds is the accepted intent decision |
| A midground base peeks above a low ground step (the sketch's floating bug returns) | Med | Ground band raised to 1035–1075 (T1 mutation check) and the T4 invariant test runs every district × 20 seeds |
| Scenery element count blows the idle-paint band (Phase 39 lesson: cost is per element) | High | T9 measures factories-only first and derives the D2 budget; `maxShapes` per kind is asserted against the budget in tests before any renderer lands; T18 stops and reports with per-family rows |
| Vent `BubbleStream`s add GSAP timelines to the moving layer | Med | ≤ 9 vents per district asserted; T18 watches the bubbles-layer row specifically |
| `rotate(45)` groups defeat a naive 90/45 assertion, or a renderer sneaks a non-grid edge | Low | `assertNinetyFortyFive` treats rotated groups as grid-by-construction and checks everything else; every renderer test runs it over 50 seeds |
| Recolor on retransmit silently skips scenery (parity passes by coincidence) | Med | T13 fixture forces a ≥ 10° lean move and a mutation check that skipping scenery fails |
| Ridge-anchored towers poke above the frame | Low | Judged at Checkpoint A (spec §7 Q2); fallback is anchoring at the ridge foot — a one-row data change |
| Starting D1 on the wrong base (Phase 40 still open) | Med | Plan header and §6 say so; first commit's parent is checked at Task 1 |

## Open Questions (carried from spec §7, with the plan's recommendation)

1. **Element budget** — set by T9's measurement, not guessed; the `SCENERY_SHAPE_BUDGET` constant
   is written with its derivation.
2. **Ridge towers above the frame** — Checkpoint A.
3. **`WORLD_BOUNDS` relocation** — T6 moves it to `sceneDepth.ts` and the test imports it (adopted).
4. **Gem accents flag** — `SCENERY_GEM_ACCENTS = true` build constant in T11; removed in T23 if it
   was never flipped during D2's gate.
5. **Derelict ratio for habitat/construction** — 0, adopted in T2 (flagged in its commit for
   Crawford to reverse by editing two tables).
6. **New (plan-time):** `config.district` on every actor — the spec correction at the top; T10 folds
   it into the spec.
