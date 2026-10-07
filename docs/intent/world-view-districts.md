# Intent: World View Districts

Confirmed 2026-10-05 via the interview-me skill (four questions, every guess confirmed), from the
sketch [docs/sketches/world-view-districts.html](../sketches/world-view-districts.html) (two passes,
both "love everything"). Ahead of a `spec-driven-development` pass. Sequenced **after** Phase 40
(Orbiting Polygons, in flight on `feature/orbiting-polygons`); nothing here touches that branch.

> **Amendment (2026-10-06):** the docking pads family is dropped. Roadmap Phase 43 (Robot Jobs and
> Charging Stations, [docs/ideas/robot-jobs-and-stations.md](../ideas/robot-jobs-and-stations.md))
> replaces pads with 2–3 floating charging stations that robots enter, which settles the "robots
> docking on the pads" out-of-scope item below. That makes seventeen families, counting pipe
> bridges, and no dock masts among the gem accents. Phase 43 builds on D1 + D2: its host buildings
> are these families. See the spec's amendment note. The rules below are the original ask,
> unedited.

- **Outcome:** Every locale becomes a seeded underwater district: one of nine recipes, drawn over a
  seabed ridge, a stepped ground line and a water column that follows the hour, populated by
  eighteen silhouette families and two atmosphere layers. Shipped as a **series of three branches**:
  districts + terrain + water first, the families next, atmosphere last.
- **User:** Crawford and anyone watching the world — different coordinates read as different places.
- **Why now:** `FACTORY_ROWS` (`src/systems/factoryPlacementSystem.ts`) is one fixed nine-row
  recipe, so every coordinate shows the same skyline in different colours — "only buildings,
  everywhere". The gem robots (Phase 39) now have a settled look the world should match.
- **Success:** Nine seeds read as nine places. Every ground-locked item sits on the terrain. The
  scene stays static per lighting tick; each branch passes the `npm run perf:idle` gate the way
  Phase 39 Task 9 did. Crawford signs off each branch live.
- **Constraint:** The factory rules hold for everything new — two faces lit east/west by
  `getLighting`, 90/45 outlines, single-colour squares / rectangles / circles / ellipses for
  decoration, the current palette plus the Phase 35 accent lean, ground-locked, seeded per locale
  with no new state. Underwater only. Changing what existing coordinates and saved `?session=`
  links show is **accepted** (Crawford: "not worried about existing saves").
- **Out of scope:** The coast framing (comparison-only in the sketch; cut). Today's row table as a
  tenth district. Robots docking on the pads. Any motion beyond the bubbles that already exist.
  Global audio parameters driving the world (a separate session).

## Behavior

### Branch 1 — districts, terrain, water

- `placeFactories` picks one of nine **district recipes** per locale from its own seeded draw (a
  new dataId, e.g. `'locale.district'`, on the locale noise map), independent of every other draw so
  neighbouring coordinates do not share a district by hash accident. The sketch's spread over a
  121-seed grid was even; keep it so.
- A recipe is a row table like today's: `y`, spread (`full` / `center` / `edges`), count, depth
  group, and a **kind** — `factory` with its variant filter, or one of the new families. Nine
  recipes: dense industrial, outskirts, tower cluster, storage yard, derelict district, habitat
  colony, wreck field, vent field, construction site. Rows whose kind is a family that has not yet
  shipped place nothing until Branch 2 lands them (the recipe tables are written once).
- **Terrain:** a seabed ridge (a 90/45 stepped profile, drawn before the background row at a
  lightness cap below it) and a stepped ground line under the foreground. Both are seeded per
  locale, static, in the static back layer.
- **Ground lock:** every ground-locked item's base sits on the ground profile at its x. This fixes
  the floating foreground buildings the sketch exposed (the legacy `y: 900` foreground row sits above
  the ground line); the per-district row tables are where those y values get rewritten.
- **Water column:** the flat `#0a1128` background rect becomes a vertical gradient whose lightness
  follows the locale hour via `getLighting` (dark at night, lit from above by day) plus a faint
  surface glow near the top edge. Reads once a second from `activeLocaleLocalTime`, like the
  factories; **no CSS transition** (docs/ANIMATION_SYSTEM.md, scene-layer rules). Today's two
  depth-gradient overlay rects stay.
- **Derelict** is a per-item flag: the same factory variant with `nightDepth` forced to 0 (no lit
  windows), a lower lightness cap (sketch: ×0.55) and desaturated body. Ratio is per recipe (the
  derelict district ~0.6–0.8, most others the default 0.25 — a value for the spec to pin).

### Branch 2 — the families

Each family is a static silhouette in the factory rules, ground-locked, seeded from the locale map,
with the depth group's lightness cap applied. The sketch's shapes are the reference; the spec pins
sizes and which rows each may occupy.

| Family | Shape (sketch) | Note |
|---|---|---|
| Tanks / silos | rectangle, 45° shoulders, belt courses, one lit gauge circle | derelict-capable |
| Gantry cranes | two posts, beam, 45° knee brace, hanging load rectangle | |
| Pipe bridges | bar on a post between two neighbouring factories in a row (gap 60–260) | placer looks at neighbours |
| Pylons / masts | 45° braced taper, lit head | gem head when gem accents are on |
| Walls / berms | short wide two-faced rectangles, foreground edges | |
| Beacons | short mast carrying one large gem | gem accents |
| Pipelines | seabed pipe run on stanchions, riser + valve at one end | lit top/bottom, not east/west |
| Habitat domes | two-faced base, half-ellipse dome split at centre, porthole row, hatch, status mast | derelict-capable |
| Wrecks | sunken hull, 45° raked bow, deckhouse, funnel, dead portholes | always derelict |
| Tidal turbines | post, nacelle, hub, four blades on the 45° grid | static; spin is a later motion pass |
| Gem boulders | 1–3 chamfered three-tone polygons, neutral colour, never lit, half-sunk | the robots' vocabulary as rock |
| Vent chimneys | stepped 90/45 cone, glowing mouth | **vents real bubbles** through the existing `BubbleLayer`/`BubbleStream` path, same as bubble-eligible factories; the chimney itself is static |
| Container stacks | boxes in the style's two accent hues, lit label squares | |
| Scaffolds | solid lower floors, open frame with 45° braces above, warning light | derelict-capable (abandoned) |
| Mooring tethers | anchor block, line up out of frame with one 45° dog-leg, optional float | the surface is above the frame |
| Floodlights | mast, lit head, 45° beam (one vertical edge, one 45° edge) that strengthens at night | |
| Docking pads | low slab, edge lights, gem on a short mast | decoration in this series (see Out of scope) |
| Sonar dishes | post, 45°-tilted ellipse, feed stub, light | |

- **Gem accents** (one toggle in the sketch, one flag in the spec): the Phase 39 gem vocabulary —
  chamfered polygon on the 15° grid, three facet tones, lit from the brighter face — planted as
  infrastructure: pylon heads, a lit panel high on Skyscrapers, beacons, dock masts, and boulders in
  neutral colour. Colour is the style's accent hue, so they rhyme with the robots. Reuse the gem
  generator's shading, do not fork it.

### Branch 3 — atmosphere

- **Light shafts:** 3–5 translucent 45° bands from the top edge (one vertical edge, one 45° edge),
  fading with depth, opacity scaling with daylight; gone at night. Static.
- **Marine snow:** a seeded field of ~140 tiny low-opacity circles. Static. Drifting it would be a
  moving-layer, perf-gated change and is not part of this series.
- Both live in static layers and must not fight the depth gradients (gate question).

## Style / constraint

- Factories' rules are the rulebook (docs/BUILDING_DESIGN.md: silhouette-first, 90/45, atmospheric
  depth, deterministic randomness). Every new family follows them; none is exempt.
- Scene layers stay as roadmap 17.2.5 left them (docs/ANIMATION_SYSTEM.md): everything in this
  series is static and goes in the static back/front layers; nothing per-frame; no CSS transitions
  on scene fills. Vent bubbles are the one moving addition and ride the existing bubble layer.
- Seeding follows docs/PROCEDURAL_GENERATION.md: dot-namespaced dataIds, offset by index; new
  dataIds are additions, and retiring today's row table is a breaking change to world generation,
  accepted like Phase 39's greeble retirement.
- Colour: palette from `colorTheme.json`; body hues through the variant shift ranges and the
  Phase 35 accent lean; lit elements use `indicator.powered` / `alert.powered` / `glass.base`.
- Idle paint is the gate per branch (docs/PERFORMANCE.md, "Gem Polygon Robots — the Task 9
  idle-paint gate" is the method). Element count is what costs (Phase 39 finding), so the spec caps
  counts per recipe.

## Out of scope

- **Coast framing** — the sketch keeps it for comparison only; the world is underwater, full stop.
- **Legacy row table as a district** — dropped; one in ten worlds looking like today defeats the
  point.
- **Preserving existing worlds / saved links** — accepted breaking change.
- **Robots docking on docking pads** (Docking state position from a pad) — a later phase; pads are
  decoration here.
- **Turbine spin, drifting snow, swaying tethers, any new motion** — later, perf-gated passes.
- **Audio → world mapping** (global audio parameters driving recipe, derelict ratio, lighting) —
  separate session. The recipe pick and the derelict ratio are kept as explicit per-locale values so
  that session has clean targets.
- **Robot visuals** — untouched; Phase 40 continues on its own branch.

## Known implementation note (not yet spec'd)

- Whether non-factory families are `Actor`s with new `ActorType`s rendered by their own components
  (the obvious shape, since `Actor.config` is already serialisable and the recolor path iterates
  actors), or a lighter non-actor "scenery" list on the locale. The spec decides; the former keeps
  `recolorFactoriesForAttenuationStyle` semantics for free.
- Exact ground-lock mechanism: rows carry a depth-group y and the terrain profile supplies the
  final base y at placement time, or the profile is sampled at render time. Placement time keeps
  `Actor.position` honest.
- The water gradient's exact stops, the surface-glow ellipse, the ridge's y band (sketch: 640–900)
  and the ground band (1010–1060) are sketch values for the spec to confirm or re-tune live.
- Derelict ratios per recipe, the lightness caps (0.7 / 0.85 / 1.0 as today), and per-recipe
  element budgets.
