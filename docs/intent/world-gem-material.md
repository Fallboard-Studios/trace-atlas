# Intent: World Gem Material (Option A)

> **Intent confirmed (roadmap Phase 44, 2026-10-08)** — spec and plan not started. Idea
> [docs/ideas/world-gem-material.md](../ideas/world-gem-material.md), sketch
> [docs/sketches/gem-factories.html](../sketches/gem-factories.html) (sketch gate passed; the sketch
> was extended and re-judged the same day, see "Supersedes the idea doc" below). Where this file and the
> idea doc differ, this file wins.

Confirmed via `interview-me` on 2026-10-08, ahead of a `spec-driven-development` pass.

## Outcome

Everything solid in the world reads as one carved material with the gem robots (Phase 39), with nothing
left in the old flat style. **Mass** — factories and their roof boxes, tanks, walls, dome bases,
containers, scaffold solid blocks, wreck hulls, deckhouses and funnels, vent steps, crane loads, and the
terrain's ridge and ground profiles — gets the robots' bevel ring: an 8 px inset outline, one facet per
edge, three quantized tones, no outline stroke. **Everything else solid** — members, curves and the thin
parts of the remaining families — gets a **1.5 px hairline outline** instead. Silhouettes, windows,
belts and greebles do not change, and a bevel of 0 renders byte-for-byte as today.

## Behavior

- **The ring is the robots' ring, lit by the hour.** The inner polygon and edge normals come from the
  robot generator's `inset` / `edgeNormals` (`src/components/robot/gem/polygon.ts`); tones go through
  `quantizeShade(shade, 3)` (`gemShading.ts`) and the scenery gem's 0.5 / 1.1 / 1.25 multipliers
  (`gemShape.tsx`) on the face's own lightness; the facet stroke is the fully shaded tone. Facet
  contrast is 1.0.
- **Depth is 8 px × the item's own scale, capped at 18 % of its short side** (the robots' own cap). On
  a foreground factory that is 8 px; a midground or background item's ring shrinks with it.
- **The sun on a building is the hour's east/west sun, never the robots' top-left light.** The light
  vector is sideways by `(eastL − westL) / 0.7` (lateral strength 1.0), always from above, normalized.
  The robots keep their fixed top-left light. At 9 am the east (right) facet and the top are lit and the
  west and bottom shaded; at noon the sides go neutral.
- **Two-faced bodies split their top and bottom facets at the front corner**, each half toned from its own
  face's light, matching the facade's west/east split. Single-tone bodies (containers, vent steps, crane
  load, roof boxes) use the roof average. Roof boxes are bevelled at 0.6 × their building's bevel.
- **The face inside the ring is exactly today's fill.** Windows and belt courses sit inside the ring
  (margin becomes `max(ring depth, today's 2 % clip)`), and belts span the face, not the full width.
  Derelict folds as today: the body is desaturated and capped before the ring is toned, so the ring dims
  with its building.
- **Vents are ringed step by step**, as stacked blocks — the union polygon's ledges are narrower than the
  bevel and a single ring would self-intersect.
- **Terrain rings its profile polygons** with the frame edges (x = 0, x = W, the bottom) skipped, so each
  45° step and flat run takes the sun like a facet.
- **The hairline is 1.5 px × the item's scale, in `body.shadow` at 0.8 lightness** (the scenery gem
  outline's colour, never lit). It goes on:
  - members — pylon tower and crossarms, scaffold posts, levels and braces, crane posts, beam, brace and
    hanger, dome and beacon masts, the beacon's base plate;
  - curves — the dome cap along its arc only (the base edge belongs to the ring), the dish reflector,
    the turbine hub;
  - the six families the sketch's world scene omits, wherever a part is solid: dish (post, reflector,
    feed), turbine (post, nacelle, blades, hub), floodlight (mast, arm, head), tether (anchor, line,
    dog-leg, riser), pipeline (stanchions, pipe, riser, flange) and pipe bridges (bar, post).
- **A thin line's "casing" is the same hairline round its rect.** The live tether, pipeline and bridge
  parts are 3–22 px rects, not strokes, so there is no separate casing mechanism; the crane hanger, the
  one stroked `<line>`, becomes a rect of the same footprint.
- **Left exactly as they are:** boulders, beacon heads, pylon heads and the charging stations (already
  gem); windows, belt courses, lamps, portholes, indicator lights; wreck deck and keel strips, the wall's
  top stripe, the dome's hatch plate; the floodlight's translucent beam and pool, vent glows, the
  pipeline's highlight strip and the tether float.
- **It is always on.** No player-facing setting and no UI. The pieces (factories, mass scenery, terrain,
  members, everything else, bevel 0) exist as code constants only, for tests and the idle-paint A/B.
- **Static layers only.** A ring or hairline never moves, repaints on the existing once-a-second lighting
  tick, and takes no CSS transition on any facet fill (roadmap 17.2.5's rule). Facets that share a tone
  are merged into one path per tone, as the robots' `facetPaths` do — done up front, not as a later cut.

## Style / constraint

- **Reuse, don't redeclare.** `quantizeShade`, `inset` and `edgeNormals` are imported as they are. The
  facet multipliers are exported from `gemShape.tsx` rather than redeclared (docs/DUPLICATE_VALUE_AUDIT.md's
  bug class), and `bevelDepth` gains a depth parameter instead of a second copy of its 18 % cap.
- **Judged by eye, then by the harness.** The sketch gate is the look (passed: "a great little blend of
  both art styles"). The formal gate is `npm run perf:idle` in the Districts D2 gate's shape — idle busy
  and paint within the noise band — on a pinned `?session=` world, then the Pixel.
- **If the gate misses, cut in this order** until it holds: the facet merge (already in), then the hairlines
  on members and the extra families, then terrain. Factories and mass scenery are never cut. A small
  accepted residual is fine if the Pixel feels no worse (the Phase 39 precedent: +6 % accepted).
- **Hairline weight is a tuned value, not a derived one.** 1.5 px was chosen by eye in the sketch (1 px
  vanished at the stages' half size, 2 px was tried and passed over). At the sketch's half-size stages it
  draws at ~0.75 screen px.
- **Matches the 90/45 grid rule:** curves are outlined along their edge, never faceted.

## Out of scope

- **Option B (chamfered silhouettes) and option C (buildings as stacked gem parts)** — rejected; both
  change the silhouette-first pillar and the geometry every greeble, clip path and ground-lock is
  written against.
- **The robots' top-left light on buildings** — ruled out; the hour's east/west sun is the world's only
  sunlight.
- **Replacing the windows** (e.g. with emissive vertex lights) — ruled out; the windows stay.
- **Faceting curves** — the dome cap, dish reflector, turbine hub and blades are never faceted.
- **An outline stroke on mass, and boundary lines on building faces** — ruled out; the ring's three
  tones are the whole material on mass.
- **Anything already in the gem vocabulary** (boulders, beacon and pylon heads, charging stations).
- **A player-facing toggle or any new UI**, and any per-frame cost.
- **Greeble-variety follow-ups** — backlog item 9 is superseded; any greeble work is a later, separate
  item.
- **Changes to placement, variant selection, silhouettes or the ground-lock geometry.**

## Supersedes the idea doc

Three rulings made after the idea doc was written; fold them into it when the spec lands:

1. **Members get an outline.** The idea doc said members get nothing and treated the sketch's "members
   outline" switch as moot. They now get the 1.5 px hairline, with mass staying outline-free.
2. **Terrain is in.** The idea doc left it open as its own switch; it is ruled in (the switch survives
   only as a code constant for the A/B).
3. **Everything else solid gets the hairline too** — curves and the six families the world scene left
   out. The idea doc said "members get at most a thin outline behind a switch" and "arcs are never
   faceted"; the second still holds.

## Known implementation note (not yet spec'd)

- **Factory.tsx draws its body in a 0–100 box under `scale(width / 100, height / 100)`**
  (`Factory.tsx:389`), so an 8 px ring built in that space would stretch unevenly on every non-square
  building, and the existing 2 % body clip (`:381`) is already per-axis. The spec must pick: build the
  ring and the margin in pixel space (actual size is `width × scaleX`, `height × scaleY`; the rooftop
  greebles already render outside the scaled group) or correct each axis. The scenery renderers work in
  scene pixels and are unaffected.
- **The sketch's `bevel × s` scale rule** needs checking against how the live depth rows actually scale
  actors, and the terrain ring (drawn at scale 1 in the sketch) against the live ridge and ground
  profiles.
- **Pipe bridges are not scenery actors.** `pipeBridges.tsx` derives them at render time from the placed
  factories, in a fixed colour with no lighting, so the hairline goes in that component, not the
  `Scenery.tsx` dispatcher.
- **Crane hanger as a rect** changes one element's tag in the live renderer; check
  `crane.test.tsx` and the work anchors (`sceneryWorkAnchors.ts`) for anything that reads it.
- **The hairline's colour can vanish on the darkest steel** (turbine, dish post, pylon are nearly the same
  tone as `body.shadow × 0.8`). Crawford accepted the look as sketched; if the live view loses it, the
  lever is the hairline colour, not its weight.
- **Docs to update when it ships:** BUILDING_DESIGN.md ("Color System", "Scenery families"),
  ROBOT_DESIGN.md ("Bevel and shading": the world shares the quantizer, the light rule differs),
  PERFORMANCE.md (the gate), the roadmap entry, and an archive move for backlog item 9.
- **Sequencing:** Phase 43 is complete and merged, so nothing blocks this; the open Pixel listens are
  unrelated audio work.
