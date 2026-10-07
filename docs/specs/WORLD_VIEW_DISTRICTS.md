# Phase Spec: World View Districts (underwater districts, scenery families, atmosphere)

Roadmap Phase 42 (proposed; 41 is the halo spec). Intent:
[docs/intent/world-view-districts.md](../intent/world-view-districts.md) (confirmed 2026-10-05, four
questions). Sketch: [docs/sketches/world-view-districts.html](../sketches/world-view-districts.html)
(two passes accepted 2026-10-05; its defaults are every constant below unless a section says
otherwise). Sequenced after Phase 40 ([ORBITING_POLYGONS.md](ORBITING_POLYGONS.md)), which is in
flight; nothing here touches robots. Branch from whatever Phase 40 merges into — see §6.

Every locale becomes a seeded underwater **district**: one of nine row recipes replaces the single
fixed `FACTORY_ROWS` table, drawn over a seabed ridge, a stepped ground line and a water column that
follows the hour, and populated by seventeen static **scenery families** that obey the factory rules.
Shipped as a series of three branches: **D1** districts + terrain + water, **D2** the families,
**D3** atmosphere. This one spec covers all three; D2 and D3 constants are the sketch's and are
re-confirmed live at each branch's gate.

> **Amendment (2026-10-06):** the `dock` pad family is dropped — roadmap Phase 43 (Robot Jobs and
> Charging Stations, [docs/ideas/robot-jobs-and-stations.md](../ideas/robot-jobs-and-stations.md))
> replaces pads with floating charging stations. 16 `SceneryKind`s plus derived pipe bridges; the
> towers, yard and habitat recipes lose their dock rows. The sketch still draws pads; it is not
> updated. Phase 43 also builds on two things this spec already has — keep them: renderers read all
> geometry from `deriveSceneryParams(actor)` (its `workAnchors` reuse it outside React), and
> `config.derelict` / the row's `offscreen` anchor stay readable after placement (they gate which
> items can host jobs).

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (watch) / `npx vitest run <path>`
> - Dev server: `npm run dev`
> - Idle-paint gate: `npm run build && npx vite preview --port 4173`, then
>   `npm run perf:idle --throttle 1 --only none --url http://localhost:4173/trace-atlas/?session=…`

## Assumptions (correct these before the plan)

1. **Scenery items are `Actor`s.** `ActorType` gains one member, `SCENERY`; the family is
   `config.kind`. `Actor.config` is already serialisable and every actor consumer (`OceanScene`,
   `placeFactories`, `recolorFactoriesForAttenuationStyle`, `BubbleLayer`) filters by type, so the
   blast radius is three files plus the new renderer. Sessions do not diff actors (`sessionDiff.ts`
   never reads `actors`), so saves and `?session=` links are unaffected by the new type — they
   regenerate the locale from its coordinates, which is the accepted breaking change.
2. **Visuals derive from `id` + `config` at render, nothing else stored** — the factory pattern
   (`selectVariantFromSeed`). A scenery actor stores `kind`, `row` (recipe row index), `hueShift`,
   `satShift` and, where the family needs it, `derelict`. Sizes, counts and sub-seeds come from
   `Alea(id)` at render.
3. **Ground lock is done at placement time.** Rows carry a depth group and an *anchor*, never a
   literal `y`; `placeDistrict` writes the final base `y` into `Actor.position` from the terrain
   profile (§1.4). `Actor.position` stays honest and `bottomAnchorTransform` is unchanged.
4. **The terrain profile is a runtime derivation, not state** — `getTerrainProfile(localeId)` from
   the locale noise map, cached like `getRobotGem`, used by the placer and the back layer alike.
5. **The per-row lightness cap does not exist in code today.** `docs/BUILDING_DESIGN.md`
   ("Atmospheric Depth") documents a 60–70 / 80 / 100 % cap, but `Factory.tsx` applies none: depth
   today is the two overlay rects only. This spec makes the cap real (§1.7) at the sketch's
   0.7 / 0.85 / 1.0 and corrects the doc.
6. **The water column updates on the existing once-a-second lighting tick** (`activeLocaleLocalTime`
   from `uiStore`, written by `AttenuationStyleView`), exactly as `Factory.tsx` does. No new timer,
   no CSS transition on any fill (docs/ANIMATION_SYSTEM.md, scene-layer rules).
7. **Everything in this series is static per tick** except vent bubbles, which ride the existing
   `BubbleLayer`/`BubbleStream` path. The robots and bubbles layers are otherwise untouched.
8. **The perf baseline is the branch's own base commit**, measured in the same session with
   `npm run perf:idle` on one pinned world, per the Phase 39 method (docs/PERFORMANCE.md). Static
   additions should cost paint only on the lighting tick; the gate is "busy and paint within the
   17.2.5 noise band of base" per branch, with a stop-and-report if missed.
9. **Robots keep their idle ranges.** `idleSystem` picks destinations over the full world height;
   a robot may pass in front of the ridge or behind a foreground item. Accepted; the robots layer
   sits between back and front as today.

## 1. Overview & Claude Explanation

### 1.1 District pick (`src/systems/districts.ts`, D1)

- `pickDistrict(noiseMap): DistrictName` — one `getSeededVal(noiseMap, 'locale.district', 0, 0, 1)`
  draw on the **locale** map, mapped to `DISTRICT_NAMES[floor(v × 9)]`. Own dataId so it is
  independent of every other draw; a 121-coordinate grid must land every district at least 8 times
  (the sketch's spread was 9–18 of 121).
- `DISTRICT_NAMES` = `dense · outskirts · towers · yard · derelict · habitat · wreckfield · ventfield ·
  construction`. No `legacy`.
- `placeFactories(localeId)` becomes `placeDistrict(localeId)`: picks the district, builds the
  terrain profile, places every row of its recipe, writes `actors` once via `setLocaleData`. The
  `worldTransition.ts` call site and the OceanScene mount guard (`actors.length === 0`) are unchanged.

### 1.2 Recipes (`src/systems/districtRecipes.ts`, D1 tables, D2 content)

A recipe is an ordered list of rows:

```ts
interface DistrictRow {
  depth: 'background' | 'midground' | 'foreground';
  anchor: 'ridge' | 'floor' | 'ground' | 'offscreen';   // §1.4
  floorY?: number;                                       // anchor 'floor' only, 980–1030
  spread: 'full' | 'center' | 'edges';
  count: number;
  centerWidth?: number;                                  // 'center' — fraction of WORLD_BOUNDS.width
  edgeWidth?: number;                                    // 'edges'  — fraction per side
  kind: 'factory' | SceneryKind;
  variants?: FactoryVariant[];                           // kind 'factory' only
  derelict?: number;                                     // per-row override of DERELICT_RATIO
}
```

> **Plan-time correction (carried in, Task 10):** a row index alone is ambiguous — `Factory.tsx`,
> `factoryBubbleProps.ts` and the recolor path all resolve `config.row` into a variant filter, and a
> row index is only meaningful relative to *which* district's table it indexes into. Every placed
> actor therefore also stores `config.district: DistrictName` (serialisable, written once by
> `placeDistrict`), and the old `getRowConfig(row)` becomes `getRecipeRow(district, row)`, which
> looks up `RECIPES[district][row]`.

Spread semantics are today's three (`placeFactories`' edges/full/center loops, including the
seeded `factory.spacing` jitter for center). Factory rows keep their variant filters. A row whose
`kind` is a family not yet shipped places nothing (D1 ships the tables with every row; D2 lights
them up family by family). The nine recipes, as sketched (B/M/F = depth; anchor shown only where
not the depth's default — background `floor`, midground `floor`, foreground `ground`):

| District | Rows |
|---|---|
| **dense** | B: Skyscraper center 3 (0.3) *ridge*; Skyscraper center 5 (0.5); Monolith full 24; pylon full 6 · M: Refinery/Stacks full 5; Refinery/Stacks/Warehouse full 4; tank full 3; pipeline center 1 (0.6) · F: Refinery center 8 (0.5) *offscreen*; Warehouse edges 4 (0.05); Warehouse/Monolith edges 3 (0.2); Warehouse edges 8 (0.3) *offscreen*; crane edges 2 (0.25); floodlight edges 2 (0.12); containers edges 2 (0.3) |
| **outskirts** | B: Skyscraper center 2 (0.35); pylon full 5; boulder full 4; turbine edges 2 (0.3) · M: Refinery/Warehouse edges 2 (0.15); tank center 2 (0.3); dish center 1 (0.2) · F: wall full 6; Warehouse edges 2 (0.1); beacon center 2 (0.5); tether full 2 |
| **towers** | B: Skyscraper center 5 (0.35) *ridge*; Skyscraper center 4 (0.5); dish edges 2 (0.25) · M: Monolith edges 4 (0.2); pylon edges 2 (0.08); dome edges 2 (0.35) · F: Warehouse edges 4 (0.2); wall center 4 (0.4); tether edges 2 (0.05) |
| **yard** | B: Monolith full 10 · M: tank full 6; Stacks edges 2 (0.2); containers full 4; pipeline center 1 (0.7) · F: crane full 3; Warehouse edges 6 (0.3) *offscreen*; wall full 8; beacon edges 2 (0.08); floodlight edges 2 (0.18) |
| **derelict** | B: Skyscraper full 3 (derelict 0.8); Monolith full 12 (0.8); vent edges 2 (0.2) · M: Refinery/Stacks full 4 (0.6); tank edges 2 (0.1, 0.6); pylon center 3 (0.4); scaffold center 1 (0.3, derelict 1) · F: Warehouse edges 4 (0.25, 0.6); wall full 5; wreck center 1 (0.3); boulder full 3 |
| **habitat** | B: Skyscraper center 2 (0.3); pylon full 4; turbine edges 2 (0.2) · M: dome full 3; dish edges 2 (0.1); pipeline center 1 (0.5) · F: dome center 1 (0.25); floodlight edges 2 (0.15); tether full 3; wall edges 3 (0.25); beacon edges 2 (0.06) |
| **wreckfield** | B: Monolith full 6 (derelict 0.9); boulder full 5; vent center 2 (0.4) · M: wreck edges 2 (0.3); boulder full 4; pylon center 1 (0.2) · F: wreck center 1 (0.4); boulder edges 4 (0.25); tether edges 2 (0.08); Warehouse edges 2 (0.12, derelict 0.7) |
| **ventfield** | B: vent full 6; Refinery center 2 (0.3); boulder edges 2 (0.2) · M: pipeline full 2; tank edges 2 (0.15); vent center 3 (0.5) · F: boulder edges 3 (0.25); pipeline center 1 (0.4); floodlight center 1 (0.15); Refinery/Stacks edges 2 (0.1) |
| **construction** | B: Skyscraper center 2 (0.4); Monolith full 6 · M: scaffold full 3; containers edges 3 (0.3); pipeline center 1 (0.4) · F: crane full 3; containers edges 4 (0.3); floodlight edges 2 (0.1); wall center 2 (0.4) |

Row order within a depth is draw order (first drawn is furthest back). The tables are data: a
`districtRecipes.test.ts` asserts every row's fields are in range, every `kind` is a known family,
every factory row has variants, and every district stays under its element budget (§5.3).

### 1.3 Terrain (`src/systems/terrainProfile.ts` + `TerrainLayer` in the back layer, D1)

- `getTerrainProfile(localeId)` → `{ ridge: Step[]; ground: Step[] }`, two 90/45 stepped profiles
  across `0..WORLD_BOUNDS.width`, built with the locale noise map (dataIds `'terrain.ridge.run'`,
  `'terrain.ridge.step'`, `'terrain.ground.run'`, `'terrain.ground.step'`, offset = step index).
  Every step is horizontal or exactly 45° (`dx === |dy|`).
  - Ridge: starts at y 860, band **640–900**, runs 80–260, steps from `[-60, -40, 0, 0, 40, 60]`.
  - Ground: starts at y 1050, band **1035–1075**, runs 120–400, steps from `[-20, 0, 0, 0, 20]`.
    (Sketch had 1010–1060; raised so a midground `floor` base ≤ 1030 is always buried — §1.4.)
- `groundYAt(profile.ground, x)` / `ridgeYAt(profile.ridge, x)` — the profile's y at an x, linear on
  the 45° runs.
- Drawn in the static back layer: the ridge polygon **before** the background row at fill
  `shadowDepth` lightened by `1 + m × 1.2` (m = mean of east/west multipliers), the ground polygon
  **after** the midground row and its gradient at `body.shadow × m × 0.9`. Both close to the bottom
  edge. Both re-fill on the lighting tick only.

### 1.4 Ground lock (D1)

Anchors, resolved by `placeDistrict` into `Actor.position.y`:

| Anchor | Base y | Who |
|---|---|---|
| `ridge` | `ridgeYAt(x)` | background rows meant to stand on the ridge (tall towers) |
| `floor` | `row.floorY` (980–1000 background, 1015–1030 midground) | default for background and midground; the base is behind the ridge body or buried under the ground polygon |
| `ground` | `groundYAt(x)` | default for foreground; the base sits exactly on the ground line |
| `offscreen` | `WORLD_BOUNDS.height + 100` | foreground rows whose base is cut by the frame (today's 1180/1200) |

Invariant (tested): after placement, every actor's base is on a profile, under the ground polygon,
or at/below the frame bottom. No visible base floats. Pipe bridges (§1.9) are the one derived
element and span two factory bases, so they inherit the invariant.

### 1.5 Water column (`WaterColumn` in the back layer, D1)

Replaces the flat `backgroundColor` rect. One `<linearGradient id="water-{localeId}">` vertical,
two stops, plus a surface glow:

| Element | Value (d = 1 − nightDepth) |
|---|---|
| top stop | `hsl(200, 45 %, lerp(8, 30, d))` |
| bottom stop | `hsl(230, 45 %, lerp(4, 12, d))` |
| surface glow | `<ellipse cx=lerp(300, 1620, hour/24) cy=60 rx=360 ry=70>` fill `hsl(192, 50 %, 70 %)` opacity `0.08 × d`, omitted when `d ≤ 0.2` |

`nightDepth` from `getNightDepth(getLighting(lightMeasure))` with `lightMeasure` derived as in
`Factory.tsx`. Values are rounded to whole percent before they reach the attribute, so the gradient
steps once every ~2 s like the facades. The two depth-gradient overlay rects stay as they are.
`OceanScene`'s `backgroundColor` prop is removed.

### 1.6 Derelict (D1 flag, D2 use on tanks/domes/scaffolds)

- Per actor `config.derelict?: true`, decided at placement: `getSeededVal(noiseMap,
  'actor.derelict', actorIndex, 0, 1) < ratio`, ratio = `row.derelict ?? DERELICT_RATIO` (0.25).
  Families that can be derelict: factory, tank, dome, scaffold. Wrecks are always derelict and
  carry no flag.
- Render: `nightDepth` forced to 0 (no lit windows, no lit indicators), lightness cap × 0.55, body
  saturation × 0.4. Factories: the antenna light and any rooftop indicator are also dark.
- The derelict district overrides per row (0.6–0.8, scaffold 1); other districts use the default.

### 1.7 Depth lightness caps (`src/constants/sceneDepth.ts`, D1)

`ROW_L_CAP = { background: 0.7, midground: 0.85, foreground: 1.0 }`, multiplied into the east/west
multipliers before they reach `applyColorShift` — in `Factory.tsx` for factories (new; see
Assumption 5) and in every scenery renderer. `docs/BUILDING_DESIGN.md`'s "Atmospheric Depth" table
is corrected to these values and to say the cap is now applied. Lit elements (`indicator.powered`,
`alert.powered`, `glass.base`, lit windows) are **not** capped — a light is a light at any depth.

### 1.8 Scenery actors (`src/components/actors/scenery/`, D2)

- `ActorType.SCENERY`; `Actor.config.kind: SceneryKind` with `SceneryKind` = `tank · crane · pylon ·
  wall · beacon · pipeline · dome · wreck · turbine · boulder · vent · containers · scaffold · tether ·
  floodlight · dish` (16; pipe bridges are derived, §1.9).
- `Scenery.tsx` (memoised like `Factory`) reads `kind` and dispatches to `SCENERY_RENDERERS[kind]`,
  each a pure function `(ctx: SceneryContext) => JSX` where `ctx` carries the actor, the
  `Alea(id)`-seeded parameters (derived once in a `useMemo`, the `staticVisual` pattern), the
  depth cap, the east/west multipliers, `nightDepth`, the style's accent pair and the gem flag.
- `OceanScene` renders scenery in the same depth groups as factories, interleaved in recipe row
  order (one sorted list per depth, by row index), so z-order is the recipe's.
- Every scenery actor also carries `config.district` and `config.row`, same as factories (§1.2's
  plan-time correction), so render-time readers resolve the family's row via
  `getRecipeRow(district, row)` the same way `Factory.tsx` does.
- Colour: families with a body (tank, wall, dome, containers, scaffold) store `hueShift`/`satShift`
  computed like `createFactory` (variant-style base + locale shift + AS shift + Phase 35 lean, via a
  shared `foldBodyShift()` extracted from `createFactory`), so `recolorFactoriesForAttenuationStyle`
  — generalised to every actor with a body and renamed `recolorActorsForAttenuationStyle` —
  recolors them on retransmit, factory for factory, item for item (parity-tested). Structural
  families (crane, pylon, pipeline, turbine, tether, floodlight, dish, wreck, vent, boulder)
  use fixed palette tones and store no shift.

### 1.9 The families (D2) — shapes and constants

All dimensions in scene units (viewBox 1920 × 1080), ranges drawn from `Alea(id)`; two faces split
at `corner` and lit west/east; "lit" means `lamp(colour, nightDepth)` = lightness × lerp(0.5, 1, nd).

| Kind | Rows | Shape and constants | Lit element |
|---|---|---|---|
| tank | M, F | w 90–150, h 140–260, 45° shoulders of `0.3 w`, corner 0.35–0.65, 1–3 belt courses (5 tall, `shell.base`); body `shell.shadow` + shift; derelict-capable | gauge circle r `0.08 w` at `0.55 h`, `indicator.powered` (off: `indicator.off`) |
| crane | F | w 220–360, h 260–380, posts 14, beam 18 (±30 overhang), 45° knee brace 40, hanger at 0.2–0.8 w, load 80 × 50 `vent.base`; `body.shadow` × 1.2 | beam-end `alert.powered` r 5 |
| pylon | B, M | w 60–90, h 260–420, tapered polygon to a 8-wide top, three cross-arms (5 tall) at ¼ steps; `body.shadow` × 1.15 | head: gem 26 × 18 when gems on, else `alert.powered` r 5 |
| wall | F | w 160–420, h 28–70, body `body.base` hue +40..60, sat −30..0 + lean, cap rail 5 `shell.shadow` | none |
| beacon | F | mast 10 × (120–220), foot 60 × 12, gem `gw` 40–64 by `0.66 gw` on top; gems-only family (placed nothing when gems off) | the gem |
| pipeline | M, F | w 320–720, pipe d 14–22 at elevation e 34–60, top highlight strip `0.35 d` `shell.base`, stanchions 8 wide every 110, riser d × (90–220) at a seeded end with flange and valve circle | valve `alert.powered` |
| dome | M, F | w 170–300, base bh 30–60 (`body.base`, two faces), half-ellipse dome ry `0.28–0.42 w` split at centre (`shell.base` +10 sat + lean), 3–6 portholes r 7 on the dome, hatch 28 wide, mast 26 with light; derelict-capable | portholes `glass.base` (seeded 40 % + 60 % × nd), mast `alert.powered` |
| wreck | M, F | w 340–580, h 70–120, stern block + 45° raked bow (`x1 − h`), deck rail 5, deckhouse `0.2–0.3 w` × 46 + funnel 40, 4–9 dead portholes r 6 `shadowDepth`, keel shadow 10; body `body.base` sat 6, cap × 0.5; always derelict | none |
| turbine | B | post 14 × (170–290), nacelle 68 × 24, hub r 11 `shell.highlight`, two 12-wide blades of `2R` (R 60–95) in a `rotate(45)` group — the 45° grid; static | hub `alert.powered` r 4 |
| boulder | B, M, F | 1–3 gems, w 60–150, h `0.5–0.75 w`, bottom sunk 8; `body.base` sat 12, hue ±12, sat ±6; never lit; `gem()` shading (§1.10) | none |
| vent | B, M | base wb 44–90, 4–6 steps of 22–44 tall narrowing by `0.9 × step`, `shadowDepth × 1.3`; plume ellipses opacity 0.06 / 0.03 (static); **bubble stream** at the mouth (§1.11) | mouth circle r `0.45 w_top` `alert.powered`, opacity `0.5 + 0.4 nd` |
| containers | M, F | cols 2–4 × rows 1–3 of (72–110) × (36–44) boxes, upper rows one fewer, row offset 0–10; alternating the style's accent pair at s 35 l 30; one 7 × 7 label square each | label `indicator.powered` (seeded) |
| scaffold | M | w 160–260, h 220–380, solid lower 25–45 % (`body.base` + shift, two faces), posts 6 wide per bay (2–3 bays), levels every 60 (5 tall, ±8 overhang), 45° braces `min(bay, 60)` in alternating bays; frame `shell.base`; derelict-capable (`shell.shadow`, no light) | top-corner `alert.powered` r 5 |
| tether | F | anchor 36 × 16, line 3 wide up h1 120–320, one 45° dog-leg of `|dx|` 40–90, then vertical to y −20 (off frame); 60 % carry a float ellipse 9 × 14 `alert.powered` above the dog-leg; `shell.shadow` × 1.1 | none |
| floodlight | F | mast 10 × (190–310), arm to a head 36 × 16 offset ±14, lit bar 28 × 5; beam polygon with one vertical edge and one 45° edge from the head to the ground, `glass.base` opacity `0.04 + 0.12 nd`; ground pool ellipse opacity `0.03 + 0.10 nd` | head bar `glass.base` |
| dish | B, M | post 10 × (90–170), ellipse rx 30–48 × `0.32 rx` `shell.highlight` in a `rotate(±45)` group with a feed stub | centre `alert.powered` r 4 |

**Pipe bridges** (derived, D2): for each pair of x-adjacent factory actors in one row whose facade
gap is 60–260, a 10-tall bar `shell.shadow` spanning the gap (+10 each side) at
`max(roofA, roofB) + 40 + seed × 60` with an 8-wide post to the lower base. Rendered by the row's
depth group after its factories; no actor is created.

### 1.10 Gem accents (D2)

`src/components/actors/scenery/gemShape.ts` draws a chamfered polygon in the Phase 39 vocabulary:
chamfer `0.3 × min(w, h)`, upper facet (tone × 1.25), lower facet (× 0.5), side facet on the
brighter face (× 1.1), outline stroke 2 `body.shadow`. It **reuses** `gemShading.ts`'s tone
quantisation (`quantizeShade`) rather than re-deriving tones; it does not reuse the robot generator
(`getRobotGem`), since a rock or a beacon head is one polygon, not a body. Lit gems use
`accentBase(primary) = hsl(primary, 55, 42)` at lightness × lerp(0.9, 1.6, nd); boulders pass their
own neutral base and `lit: false`. Placed on: pylon heads, Skyscrapers (one 26-tall panel at
`roof + 40`, 60 % of towers by seed, never derelict), beacons, boulders.

### 1.11 Vents vent bubbles (D2)

`getFactoryBubbleProps` becomes `getActorBubbleProps(actor)`: factories as today; a `vent` actor
returns `{ ventX: x, ventY: mouthY, seed: hashActorId(id), isActive: true, bodyHue: vent.shadow.h,
depthScale: by depth }`; every other actor `null`. `OceanScene`'s `bubbleBuildingCount` counts
vents too, so the aggregate burst rate stays level. Vents per district are capped at 9 (ventfield
has 9) because each stream is a GSAP timeline in the moving layer (§5.3).

### 1.12 Atmosphere (D3)

- **Light shafts** — `LightShafts` in the back layer, after the water column and before the ridge:
  3–5 polygons from the top edge, each `x` −200..1920, width 50–160, depth 420–760, one vertical
  edge and one 45° edge (seeded direction, one per locale), filled by a vertical gradient from
  `glass.base` at opacity `0.11 × (1 − nd)` to 0. Omitted entirely when that opacity < 0.005.
- **Marine snow** — `MarineSnow` in the **front** static layer, after the foreground row: 140
  circles r 1.2–3 at seeded positions, `shell.highlight`, opacity `(0.08–0.3) × lerp(0.6, 1, 1 − nd)`.
  Static. Drifting it is out of scope.
- Both subscribe to the lighting tick like the water column; both have dataIds on the locale map
  (`'atmos.shaft.*'`, `'atmos.snow.*'`).

## 2. Target File Structure

```text
src/
├── types/Actor.ts                                   # + ActorType.SCENERY, config.kind/derelict (D1 flag, D2 kind)
├── constants/sceneDepth.ts                          # ROW_L_CAP, DERELICT_RATIO, WORLD_BOUNDS (moved from the placer)
├── systems/
│   ├── districts.ts                                 # pickDistrict, DISTRICT_NAMES, placeDistrict (replaces placeFactories)
│   ├── districtRecipes.ts                           # DistrictRow, RECIPES (the nine tables), element budgets
│   ├── terrainProfile.ts                            # getTerrainProfile, groundYAt, ridgeYAt, Step
│   ├── factoryPlacementSystem.ts                    # keeps createFactory/foldBodyShift/getRowConfig(recipe-aware)/recolorActorsForAttenuationStyle
│   └── worldTransition.ts                           # placeFactories → placeDistrict (one line)
├── components/
│   ├── actors/
│   │   ├── Factory.tsx                              # applies ROW_L_CAP and derelict (§1.6–1.7); otherwise unchanged
│   │   ├── factoryBubbleProps.ts                    # getFactoryBubbleProps → getActorBubbleProps (D2)
│   │   ├── BubbleLayer.tsx                          # takes all actors, filters via getActorBubbleProps (D2)
│   │   └── scenery/
│   │       ├── Scenery.tsx                          # dispatcher, memoised
│   │       ├── sceneryTypes.ts                      # SceneryKind, SceneryContext, SceneryRenderer
│   │       ├── sceneryParams.ts                     # per-kind Alea(id) parameter derivation (the GEN table)
│   │       ├── gemShape.ts                          # §1.10
│   │       ├── pipeBridges.tsx                      # §1.9 derived element
│   │       └── renderers/<kind>.tsx                 # one file per family (16)
│   └── panels/screen/worldView/
│       ├── OceanScene.tsx                           # WaterColumn, TerrainLayer, scenery per depth, atmosphere layers
│       ├── WaterColumn.tsx                          # §1.5
│       ├── TerrainLayer.tsx                         # §1.3 (ridge + ground polygons)
│       ├── LightShafts.tsx                          # §1.12 (D3)
│       └── MarineSnow.tsx                           # §1.12 (D3)
docs/
├── specs/WORLD_VIEW_DISTRICTS.md                    # this file
├── tasks/WORLD_VIEW_DISTRICTS.md                    # the plan (next)
├── BUILDING_DESIGN.md                               # Placement & Rows rewritten; Atmospheric Depth corrected; scenery section
├── PROCEDURAL_GENERATION.md                         # new dataIds in the call-site table
├── ANIMATION_SYSTEM.md                              # scene layers: terrain/water/atmosphere are static-layer content
├── PERFORMANCE.md                                   # one dated gate section per branch
└── todo/roadmap.md                                  # Phase 42 entry
```

Tests colocated (`*.test.ts(x)`) for every new module; `factoryPlacementSystem.test.ts` (25
references to the row table), `Factory.test.tsx` (2) and `factoryBubbleProps.test.ts` (4) are
rewritten against recipes.

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. Robots (`src/components/robot/**`, `Robot.tsx`, swim/idle
  systems) are not touched; Phase 40 and 41 own them.
- **Static only:** every new element lives in the static back or front `<svg>` layer. No GSAP, no
  `requestAnimationFrame`, no CSS `transition`/`animation` on any scene fill or attribute. The one
  moving addition is vent `BubbleStream`s in the existing bubbles layer.
- **Factory rules bind every family:** two faces, 90/45 outlines (a `rotate(45)` group counts as the
  45° grid; nothing else rotates), single-colour squares/rectangles/circles/ellipses for decoration,
  ground-locked, seeded. A family that cannot be drawn under these rules is cut, not excepted.
- **Seeding:** every draw goes through `getSeededVal` on the locale map with a dot-namespaced
  dataId and an index offset, or through `Alea(actor.id)` at render — never `Math.random()`. Retiring
  `FACTORY_ROWS` and the `'factory.scale'`/`'factory.spacing'` *offsets' meaning* is an accepted
  breaking change to world generation (intent); existing dataIds are not renamed.
- **State:** `Actor.config` stays JSON-serialisable; the terrain profile and derived parameters are
  runtime-only. No new Zustand fields.
- **Content layer:** nothing here is user-facing text. If a label is ever needed it goes through
  `src/content/`.
- **Protected:** `.env*`, `node_modules/`, `public/`.

## 4. Code Style & Architecture Conventions

```ts
// sceneryTypes.ts — a renderer is a pure function of the actor and the per-tick lighting.
export interface SceneryContext {
  actor: Actor;
  params: SceneryParams;          // Alea(actor.id)-derived once per actor (sceneryParams.ts)
  cap: number;                    // ROW_L_CAP[depth] × (derelict ? 0.55 : 1)
  eastL: number; westL: number;   // getLighting(lightMeasure) — already cap-free, cap applied by the renderer
  nightDepth: number;             // 0 when derelict
  accent: AccentPair;             // the style's pair (deriveAsAccentPair)
  gems: boolean;                  // SCENERY_GEM_ACCENTS
}
export type SceneryRenderer = (ctx: SceneryContext) => React.ReactElement;

// renderers/pylon.tsx — two faces, 90/45, one lit element.
export const pylon: SceneryRenderer = ({ actor, params, cap, eastL, westL, nightDepth, accent, gems }) => {
  const { x, y } = actor.position; const { w, h } = params.pylon;
  const m = ((eastL + westL) / 2) * cap;
  const steel = hslToString(scaleL(colorTheme.body.shadow, m * 1.15));
  return (
    <g data-scenery="pylon">
      <polygon points={`${x - w / 2},${y} ${x - 4},${y - h} ${x + 4},${y - h} ${x + w / 2},${y}`} fill={steel} />
      {[1, 2, 3].map((i) => { const t = i / 4, hw = (w / 2) * (1 - t) + 4;
        return <rect key={i} x={x - hw - 14} y={y - h * t} width={hw * 2 + 28} height={5} fill={steel} />; })}
      {gems
        ? <GemShape cx={x} cy={y - h - 14} w={26} h={18} base={accentBase(accent.primary)} lit eastL={eastL} westL={westL} nightDepth={nightDepth} />
        : <circle cx={x} cy={y - h - 6} r={5} fill={lamp(colorTheme.alert.powered, nightDepth)} />}
    </g>
  );
};
```

- Components PascalCase, data/system modules camelCase, one renderer per file named after its
  `SceneryKind`. Plain named function exports, explicit prop interfaces, colocated CSS only where a
  component needs any (none expected: scene SVG is attribute-styled).
- Constants with intent comments (`ROW_L_CAP`, `DERELICT_RATIO`, every range in `sceneryParams.ts`),
  each citing the §1.9 row it implements.
- `data-scenery="<kind>"` on every scenery root `<g>` and `data-terrain="ridge|ground"`,
  `data-water`, `data-atmos="shafts|snow"` on the layer pieces — the test and perf-harness hooks,
  matching `data-scene-layer`.

## 5. Testing & Verification Requirements

### 5.1 Unit (Vitest, colocated)

- `districts.test.ts`: `pickDistrict` is deterministic per map; a 121-coordinate grid lands every
  district ≥ 8 times; `placeDistrict` is idempotent-safe (same locale → identical actors), writes
  every actor's `config.row` and `kind`, and respects each row's `count`.
- `districtRecipes.test.ts`: §1.2 field ranges; every kind known; every factory row has variants;
  element budgets (§5.3) hold using `sceneryParams`' maximum shape counts.
- `terrainProfile.test.ts`: every step horizontal or 45°; bands respected; profile covers
  `0..1920`; `groundYAt`/`ridgeYAt` exact on flats and linear on slopes; deterministic per locale.
- **Ground-lock invariant** (`districts.test.ts`): for every district and 20 seeds, every actor's
  base is on its profile (±0.5), ≤ `groundYAt(x)` with anchor `floor` in midground, or ≥ 1080.
  Mutation check: replacing `groundYAt` with the row's raw y fails it.
- `WaterColumn.test.tsx` / `TerrainLayer.test.tsx`: stops/fills at hours 0, 6, 12, 18 match §1.5
  and §1.3 within rounding; no `transition` style on any element; glow omitted at night.
- `Factory.test.tsx`: cap applied per depth (background fill lightness = base × eastL × 0.7);
  derelict → `nightDepth` 0, no lit window, cap × 0.55.
- `recolorActorsForAttenuationStyle` parity: a recolor equals a fresh placement under the new
  style, for factories **and** body-bearing scenery (fixture with a non-default lean so the test
  cannot pass by coincidence).
- Per family (`renderers/<kind>.test.tsx`): renders under `data-scenery`, two faces with
  west/east fills at a non-noon hour, the lit element present and dark when derelict (where
  applicable), every `rect`/`polygon` edge horizontal, vertical or 45° (a helper asserts the
  polygon point lists), no NaN attributes across 50 seeds.
- `getActorBubbleProps.test.ts`: vent → mouth position; non-vent scenery → null; factories as
  before (existing cases kept).
- `OceanScene.test.tsx`: scenery actors render in their depth layer in row order; counts of
  `data-scene-layer` unchanged (4); `backgroundColor` prop gone.

### 5.2 Static checks

`npm run build:types`, `npm run lint`, `npm run build` clean per task.

### 5.3 Perf gate (per branch, stop and report)

Method as docs/PERFORMANCE.md "Gem Polygon Robots — the Task 9 idle-paint gate": production
builds of base and branch served side by side, one pinned `?session=` world per district under
test (at least `dense` and `ventfield`, the two heaviest), `npm run perf:idle --throttle 1 --only
none`, three rounds, order rotated, foreground, orphaned Chrome 0.

- **Gate:** main busy and `Paint` within the 17.2.5 noise band of base; `Layout SVG changed`
  invalidations per frame unchanged (static layers must not re-lay-out between ticks).
- **Element budgets** (asserted in `districtRecipes.test.ts`, maximum shapes per district from the
  parameter ranges): scenery ≤ 700 shapes per scene in D2, atmosphere ≤ 200 in D3, vents ≤ 9 per
  district (each is a `BubbleStream`).
- A miss is reported with the table, not tuned away silently; the sketch's "which families earn
  a spot" question is the lever.

### 5.4 Crawford's gates (live, `npm run dev`)

- **D1 gate:** nine seeds read as nine places with factories alone; no floating base at any seed;
  water reads as water at 0 / 6 / 12 / 18 h; the ridge reads as terrain.
- **D2 gate:** each family on, then off, in its districts; derelict legible at night; gem accents
  rhyme with the robots rather than read as robots; a retransmit recolors scenery with the skyline.
- **D3 gate:** shafts sell "underwater" without fighting the depth gradients; snow is felt, not seen.

## 6. Git & Workflow Context

- Human operator handles branches, staging, commits and merges. One commit per task, RED first,
  mutation checks named in the commit message (the TDD workflow used on Phases 39–40).
- Branches: `feature/world-districts` (D1), `feature/world-scenery` (D2, from D1's tip),
  `feature/world-atmosphere` (D3, from D2's tip). D1 branches from the integration branch Phase 40
  lands on (`back-to-gen-robots` lineage); do not start D1 on `feature/orbiting-polygons`.
- Docs tasks per branch: BUILDING_DESIGN.md (Placement & Rows → Districts; Atmospheric Depth
  corrected; a Scenery section), PROCEDURAL_GENERATION.md call-site table, ANIMATION_SYSTEM.md
  scene-layer paragraph, PERFORMANCE.md gate section, roadmap Phase 42 (D1 creates it; D2/D3 extend).

## 7. Open Questions

1. **Element budget numbers** (700 / 200) are first guesses from the sketch's ~550 main-stage
   children. The D1 perf run with factories-only recipes sets the real headroom; D2's budget is
   derived from it before any family lands.
2. **Ridge band for `ridge`-anchored towers:** towers standing on a 640–900 ridge may poke above
   the frame top. Accepted in the sketch; confirm at the D1 gate or lower the anchor to the ridge
   foot.
3. **`WORLD_BOUNDS` relocation** to `constants/sceneDepth.ts` — the test file declares its own
   copy; decide whether to import the constant or keep the copy (the duplicate-value audit's class).
4. **Gem accent flag:** a build constant (`SCENERY_GEM_ACCENTS = true`) or dropped once the D2 gate
   accepts gems. Recommendation: constant, removed in D3 if never flipped.
5. **Derelict ratio per district** beyond the derelict district: all 0.25, or 0 for habitat and
   construction (new places are not abandoned)? Recommendation: 0 for those two; set in the tables.
