# World Gem Material (Option A)

> **Sketch gate passed (roadmap Phase 44, 2026-10-08)** — sketch
> [docs/sketches/gem-factories.html](../sketches/gem-factories.html) (merged, PR #540). Intent, spec
> and plan not started. This file is the hand-over: every decision made in the 2026-10-08 session and
> everything the sketch's code does that the real code should copy. The next session starts at
> `interview-me` with this file and the sketch open, not at a blank page.

Written 2026-10-08 from a sketch-first discussion (not the idea-refine skill): Crawford asked
"what if the world and buildings matched the gem style?", the options were laid out in chat, option A
was sketched, judged, then expanded past the factories on request.

## Problem Statement

How might we make the gem robots (Phase 39) and the world they sit in read as one carved material,
without changing a single silhouette, window, greeble or placement rule — and without touching the
per-frame cost of the scene?

Crawford's framing: today "it does sort of feel like one style is randomly placed on another." The
world was already most of the way there (90/45 grid everywhere, `quantizeShade` shared with scenery's
gem accents, gem charging stations, Phase 35's accent lean), but the sixty factories per world are
flat two-tone rectangles and set the look.

## The design, in one paragraph

Every **mass** in the world gets the robots' bevel ring: an inset copy of its outline at depth `d`,
one trapezoid facet per outline edge between the two, the flat face inside untouched. Each facet's
shade is its edge's outward normal dotted with a light vector, quantized to three tones
(`quantizeShade(shade, 3)` from `gemShading.ts`) and applied as the scenery gem's multipliers
(`gemShape.tsx`: shaded ×0.5, neutral ×1.1, lit ×1.25) on the face's own lightness; the facet stroke
is the fully shaded tone. No outline stroke around it (ruled out 2026-10-08 — the scenery gem
accents keep theirs, buildings don't). The face inside the ring is exactly today's fill,
so **bevel 0 is byte-identical to today** — option A is a pure addition. The light on a building
comes from the hour, not from the robots' fixed top-left light: sideways by `(eastL − westL) / 0.7`
(0.7 is the lighting curve's widest east/west gap), always from above, normalized. At 9 am the east
(right) facet and the top are lit and the west and bottom shaded; at noon the sides go neutral; at
night everything is dark anyway.

## Decisions already made (Crawford, 2026-10-08)

1. **Material, not form.** Option A only. Option B (chamfered silhouettes) and C (buildings as
   stacked gem parts like the stations) are not being built.
2. **The east/west sun wins.** Buildings never take the robots' top-left light. The robots keep
   theirs.
3. **The windows stay.** No emissive vertex lights in their place.
4. **"A great little blend of both art styles"** — the sketch gate verdict on the factories.
5. **Expand past the factories** — asked for and sketched; the rule below is proposed, not yet
   ruled on.
6. **The dials (sketch verdicts, 2026-10-08):** bevel **8 px**, facet contrast **1.0**, lateral sun
   **1.0**, **no outline**, **no boundary lines on faces**, **roof boxes bevelled: yes**. So the
   material is the ring and its three tones alone — the scenery gem outline stroke does *not* carry
   over to buildings (boulders, beacon and pylon heads keep theirs; they are unchanged).

## The rule for what gets the ring (proposed in the sketch, open)

**Mass gets the ring, members stay lines.**

| Gets the ring (mass) | Stays as is (member / curve / already gem) |
|---|---|
| Factories (the rectangle, split at the front corner) | Crane posts and beam, pylon tower and arms, scaffold frame (posts, levels, braces), masts |
| Tank body (the shouldered polygon), wall, dome **base** block, scaffold **solid** block | Dome cap (arcs are never faceted — the 90/45 rule) |
| Each container box, wreck hull + deckhouse + funnel, crane load, each vent step | Pipelines, tethers, floodlights, dishes, pipe bridges (not in the sketch; members by the same rule) |
| Terrain: the ridge and ground profiles (own switch) | Boulders, beacon heads, pylon heads (`GemShape`), charging stations — already gem |
| Rooftop greeble boxes (own switch, at 0.6 × the building's bevel) | Windows, belts, lights, portholes — unchanged, drawn inside the ring |

Members get nothing. (The sketch's "members outline" switch predates the no-outline ruling and is
moot.)

## What the sketch's code does that the real code should copy

- **Bevel depth** `d = min(bevel, 18 % of the short side)` — the robots' own cap (`bevelDepth`).
  Default 8 px in the sketch; a robot's is 2.5 units on an 80-unit body, so 8 px on a 200–660 px
  building is the same proportion.
- **Two-faced bodies split their top and bottom facets at the front corner**, each half toned from
  its own face's light (`westL` / `eastL`), the same split as the facade. Left facet is west, right
  facet is east. Single-tone bodies (containers, vent steps, crane load, roof boxes) use the roof
  average.
- **Window margin** becomes `max(d, today's 2 % body clip)`, so windows and belts sit inside the ring
  and bevel 0 changes nothing.
- **Belt courses** span the face inside the ring, not the full width.
- **Vents** are ringed step by step as stacked blocks. The union polygon's ledges (~3 px) are narrower
  than the bevel and a single ring self-intersects.
- **Terrain** rings the profile polygon with the frame edges skipped (no facets on x = 0, x = W or
  the bottom).
- **The generic ring** is the robot generator's own `inset` + `edgeNormals` over any polygon, so no
  new geometry code is needed for the scenery families; the factory's rectangle can use the same
  path or the explicit six-facet version — same output.
- **Colour math** goes through `applyColorShift`'s whole-percent lightness rounding, so a facet fill
  only changes string when the lighting tick moves it, like every other static fill.
- **No CSS transition on any facet fill** (the 17.2.5 rule, docs/ANIMATION_SYSTEM.md).
- **Derelict** folds exactly as today: the body is desaturated and capped before the ring is toned,
  so the ring dims with its building.

## Key Assumptions to Validate

- [ ] The ring reads at the live 1920 × 1080 scale on a tablet-width screen, not just at the
      sketch's half size. Test: Crawford's dev look at bevel 8 and 12.
- [ ] A building still reads as a silhouette (BUILDING_DESIGN.md's first pillar) with the ring on.
      Test: the sketch's bevel slider — find the depth where it stops.
- [ ] A robot still pops against a gem building. Test: the sketch's robot-beside-building rows at
      9 am and 10 pm. Candidate rules if not: scale and identity colour alone, or a boulder-style
      "neutral and unlit" carve-out for buildings.
- [ ] The idle-paint gate is flat. Expected: static-layer content only, roughly +9 shapes per factory
      and about +170 across a world's scenery and terrain, on top of the ~2,500 static shapes the
      Districts gates measured as free (docs/PERFORMANCE.md, Task 18 / Task 22). Run
      `npm run perf:idle` in the D2 gate's shape; the Pixel is the honest gate.
- [ ] Night: the ring still reads with lit windows at deep night, when every face is near the
      lightness floor and the three tones compress.

## MVP Scope

- The ring helper (one module, pure), unit-tested on a rectangle, a shouldered tank polygon, a
  concave polygon and the terrain profile (frame edges skipped).
- `Factory.tsx`: the six facets, split at the front corner; window margin and belt span inset by
  `d`; rooftop greeble boxes bevelled at 0.6 × `d` (ruled in).
- The mass scenery renderers: tank, wall, dome (base only), containers, scaffold (solid only), wreck
  (hull, deckhouse, funnel), vent (per step), crane (load).
- `TerrainLayer`: ridge and ground, behind a flag.
- One shared set of constants (bevel 8, roof-box factor 0.6, the 18 % cap; facet multipliers reused
  from `gemShape.tsx`, not redeclared — docs/DUPLICATE_VALUE_AUDIT.md's bug class).
- Perf gate, then BUILDING_DESIGN.md ("Color System" and "Scenery families") and ROBOT_DESIGN.md
  ("Bevel and shading" gains a line that the world shares the quantizer and the light rule differs).

## Not Doing (and Why)

- **Options B and C** — Crawford chose A; both change silhouettes and the geometry every greeble,
  clip path and ground-lock is written against.
- **The robots' light on buildings** — ruled out; the hour-driven east/west sun is the only sunlight.
- **Replacing windows** — ruled out; they stay.
- **Faceting curves** (the dome cap, dish ellipses, turbine blades) — never; the 90/45 rule.
- **An outline stroke on any building or mass** — ruled out 2026-10-08; the ring's three tones are
  the whole material. Members (posts, beams, masts, frames) therefore get nothing at all.
- **Boundary lines on building faces by default** — the gem vocabulary's lines fight a window wall;
  the sketch has them behind a switch, off, for Crawford to judge.
- **Any per-frame cost** — nothing here moves; a ring belongs only in the static layers.

## Open Questions

- The world-section switches: is "mass gets the ring, members stay lines" the rule, and is terrain
  in? Terrain is the subtlest of the switches at 8 px and may want its own depth. (With the outline
  ruled out, the members switch is moot — members get nothing.)
- Does the top facet stay split at the front corner, or read better as one piece? (One piece is also
  two fewer fill strings per building; not a reason either way.)
- Sequencing against Phase 43's J4 (depth layers) and the open Pixel listens.
