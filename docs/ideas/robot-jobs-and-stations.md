# Robot Jobs, Charging Stations and the Work Loop

Refined 2026-10-06 via the idea-refine skill, on branch `planning/jobs-locales-docking`. Proposed
roadmap Phase 43, sequenced **after** World View Districts (Phase 42, D1 + D2) — the building lists
below are written against the district families. Next step: `interview-me` → intent →
`spec-driven-development`.

> **Shipped (Phase 43, 2026-10-08).** Built as roadmap Phase 43 in four branches (J1–J4, PRs
> #537, #538, #539, #544), all merged. Intent:
> [docs/intent/robot-jobs-and-stations.md](../intent/robot-jobs-and-stations.md); spec:
> [docs/specs/ROBOT_JOBS_AND_STATIONS.md](../specs/ROBOT_JOBS_AND_STATIONS.md). Two directions
> below changed on the way: orbiter count no longer drives job speed (jobs last 6–10 s from the
> tempo, cut at the moves sketch), and the station is Crawford's own gem design. The depth layers
> also gained four redistributed tints and a 1 s dissolve at a sketch gate of their own. This page
> is history now; the as-built reference is [ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md) and
> [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md).

## Problem Statement

How might we make every robot visibly do work its world asks for — at buildings and charging
stations that belong to that world — without the animation ever affecting the music, the battery
timing or the World Clock replay?

## Recommended Direction

**The world dispatches the work.** Each host building carries a list of jobs. Readiness is lazy: a
building is *ready* when no robot holds it and its cooldown since it was last served has elapsed.
When a robot leaves a station or finishes a job it asks "who's ready?":

1. A ready building that hosts its current job → it keeps the job and swims to the nearest one.
2. None → it switches to a job no other robot holds (variety first; repeats only once every job is
   taken), weighted by how many ready buildings host each job, and swims to the nearest of those.
3. Nothing ready at all → it bobs in place and asks again after a short delay.

Nothing is scheduled. There are no standing per-building objects (the Phase 40 perf lesson) and no
new store state: reservations and cooldowns live in a runtime module map, like
`robotSystems.ts`'s `dockCycleCounters` — never on `Actor`, since any actor write re-renders every
factory layer in `OceanScene`. One robot per building. Each world's job mix differs because its
district's building mix differs.

**Battery on the measure clock, animation on its own time.** Every Active robot drains at one flat
rate (≈ 6 %/measure keeps today's ≈ 5 robots on screen). The job leaves the replay, which still
reproduces battery, docking and pitch drift exactly; the job becomes live state like position — on
the card, never persisted, never replayed. Animations run at their own wall-clock speed, so nothing
looks silly at 20 or 200 BPM. When a measure tick recalls a robot mid-job, it finishes the current
animation, then swims to the nearest station with a free slot — muted on the tick, as today's exit
swim already is.

**The work is the orbiters', built from a small move set.** At a building the robot bobs while its
orbiters detach and play the job's moves at the building's work anchors. Moves: `hover-pulse`,
`trace`, `ring`, `carry`, `fan`. Each host type exports `workAnchors(actor)` — a pure function of
the same `Alea(id)` parameters it renders from — so the system, the animation and the renderer
agree. Job time ≈ 5 s − per-orbiter rate × orbiter count: density drives speed, deliberately.
`gemSeed` varies each robot's take on a move, so a company's uniform-looking members still work
differently. A density change mid-job does not interrupt it: after the orbiters reattach they catch
up to the current count once (the existing attach/detach hop), not change by change. World orbiters
are not clipped (the gem is a plain `<g>` in the world view); their offsets must divide out the
body scale (up to 1.69×). The detail avatar keeps its orbiters attached.

**Stations.** 2–3 small, static, floating gem-style units per world, seeded from the locale noise
map like the rest of the world. Capacity 6 each, with slot lights showing occupancy. A robot enters
through a halo ripple (the halo's first real use — `useHaloMotion`'s `decorateArc`), is invisible
while charging, and exits the same station it entered. Stations draw at the top of the robots
layer. Initially Active robots start a locale by exiting a station.

**Depth.** A second moving robot layer behind the midground lets background buildings host jobs. A
robot switches layers wherever doing so wouldn't visibly clip anything; in the back layer it draws
at 0.75 scale. Bubbles sit between the two robot layers.

### The six jobs

| Job | Hosts | Move sketch |
|---|---|---|
| Vent Extraction *(existing)* | vent, Refinery, Stacks, tank | hover-pulse at the mouth, siphoning |
| Acoustic Survey *(existing)* | dish, pylon, Skyscraper, beacon | fan out, ring ping |
| Structural Inspection *(existing)* | scaffold, crane, wreck, Monolith, Skyscraper, dome | trace the outline |
| Fluid Monitoring *(existing)* | pipeline, tank, Refinery, dome | trace along the pipe |
| Salvage *(new)* | wreck, containers, Warehouse, any derelict item | carry a→b |
| Maintenance *(new)* | turbine, floodlight, crane, pylon, beacon, dome | ring a point, spark flicker |

No jobs: wall, boulder, tether, pipe bridges (not actors), anything in an `offscreen` row. The
districts' `dock` pad family is dropped (stations replace it).

**World guarantee (2b):** at least 3 job types, each with at least 4 on-screen hosts. Placement
needs a top-up pass — the wreck field recipe, for one, has only 2 vents.

### Lifecycle states (names final at spec)

- **Replayed lifecycle** (measure tick): Docked / Undocking / Active / Recalled — replacing today's
  inverted `Docking` (= leaving the dock) and `Departing` (= heading to it).
- **Live activity** (visual): Exiting / Transit / Working / Waiting / Returning / Entering.

Both show on the cards.

## Key Assumptions to Validate

- [ ] **Moves read as work at 1×.** Test: a motion sketch of the five moves on two host types
      before any code (the Phase 40 sketch gate).
- [ ] **Enough buildings are ready.** Test: a headless sim of the readiness loop over a seed grid,
      measuring robot time spent Waiting. Cooldown likely scales with the number of available
      hosts (few hosts → short cooldown so robots don't starve; many → longer, so work spreads).
- [ ] **Flat drain keeps today's on-screen count.** Test: `replayLifecycle` over many seeds,
      comparing the mean Active count to today's job-surcharged drain.
- [ ] **The station handoff has no seam at 20 or 200 BPM.** Test: sim at both tempos. Rule: a robot
      that lands Active before reaching its station turns back to work; a full station sends a
      robot to the next nearest.
- [ ] **Every district can satisfy 2b.** Test: a placement test over the district seed grid with
      the top-up pass.
- [ ] **The depth layers fit the perf budget.** A new moving layer plus the static back layer split
      in two (background / midground) is two more full-screen compositor layers (≈ 10 MB each on
      the Pixel 8). Test: the `perf:idle` gate on that branch, then Crawford's Pixel run.
- [ ] **Stations are cheap in a per-frame layer.** Everything in the robots layer re-rasterizes
      every frame, at a cost per shape. Test: shape count (merged paths, 3 facet tones, per
      Phase 39) and the `perf:idle` gate.

## MVP Scope

**In:** one job end to end on districts D1 + D2 — the lifecycle rewrite (flat drain, renamed
states, job out of replay, dead code out), the host table and `workAnchors` for that job's hosts,
stations with enter/exit, the readiness loop, one move.

**Then:** the full move set and all six jobs; the depth layers; the new card states.

**Suggested branch order (flexible):** sketch gate → lifecycle rewrite → hosts + anchors →
stations → the loop → the moves → depth layers → cards.

## Not Doing (and Why)

- **Time of day in job choice** — the hour is wall-clock (`computeLocaleHour`), measures follow
  tempo; the two can't share a replay. Dropped to keep it simple.
- **Per-job or per-orbiter battery drain** — jobs now change at wall-clock moments; flat drain keeps
  replay exact.
- **Jobs from audio controls or companies** — audio drives the look; companies already make their
  members look alike.
- **Lifecycle light colours (low-power red, charging yellow, full-power)** — no change to the
  Visual Mapping guardrail; today's battery dim overlay stays as is.
- **Visible building calls** (seeded call schedules with lights) — tempo-bound, adds timers and
  static-layer repaints. Could layer on lazy readiness later.
- **A colony economy** (work leaves marks that build up) — breaks the static scene and adds
  unreplayable state.
- **Job animations on cards or the detail avatar** — the avatar keeps orbiters attached so moves
  aren't constrained to its size.
- **Persisting or replaying job, position or cooldowns** — a live layer by design.
- **Power-cycle polish** — its own pass; for now a power cycle kills the work, swim and station
  animations.
- **Random wandering, bottom-only entry/exit, the lower-third low-battery rule** — replaced by the
  loop and the stations.
- **Dead code** — `interactionSystem.ts` (no callers), the factory production fields
  (`cooldownRemaining`, `productionInterval`, `isOffline`, `offlineSince`), `scoreJobAffinities` /
  `assignJob`, `JOB_BATTERY_DRAIN_SURCHARGE`, `JOB_MAX_ROBOTS_PER_TYPE`: deleted.
- **Travel between locales** — a locale is the world at one pair of coordinates; robots never leave
  it.

## Open Questions

- **Station design** — Crawford is drawing one; open to alternatives. Must be the gem art style.
- **Cooldown formula** — scaled by available-host count (see assumptions); the sim pins it, along
  with the Waiting retry delay and the job-time constants.
- **Layer-switch points** — "wherever it wouldn't clip something": needs a concrete rule (e.g.
  switch while the robot is fully clear of every midground silhouette, or while inside a station).
- **Station placement rule** — seeded positions in the water column; how far from hosts and from
  each other, and which depth layer(s) a station serves.
