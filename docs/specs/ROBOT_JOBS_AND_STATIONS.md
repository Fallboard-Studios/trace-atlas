# Phase Spec: Robot Jobs and Charging Stations (work loop, stations, job moves, depth layers)

Roadmap Phase 43. Intent: [docs/intent/robot-jobs-and-stations.md](../intent/robot-jobs-and-stations.md)
(confirmed 2026-10-06). Idea: [docs/ideas/robot-jobs-and-stations.md](../ideas/robot-jobs-and-stations.md).
Depends on Phase 42 ([WORLD_VIEW_DISTRICTS.md](WORLD_VIEW_DISTRICTS.md)) D1 + D2 for its host
buildings, Phase 40 ([ORBITING_POLYGONS.md](ORBITING_POLYGONS.md)) for the orbiters that do the work,
Phase 41 ([ROBOT_HALO_AND_LIT_LINES.md](ROBOT_HALO_AND_LIT_LINES.md)) for the halo ripple, and
narrows Phase 20.5 ([WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md](WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md)).

Robots stop wandering at random. Each world gets 2–3 seeded floating charging stations. A charged
robot exits its station, goes to the nearest **ready** host building for its job (or switches to a
job nobody holds), bobs while its orbiters detach and play the job's **moves** at the building's
**work anchors**, reattaches, and repeats until the measure tick recalls it; then it finishes the
job and swims back into a station, invisible while it charges. Battery, docking and pitch drift stay
on the measure clock and stay exactly replayable (one flat drain); everything visual — job, site,
station, position — is a live layer on wall-clock time that never touches audio.

Shipped as a **motion-sketch gate** then four branches: **J1** lifecycle + world data, **J2**
stations + the loop with one move + card states, **J3** all moves and all six jobs, **J4** depth
layers. This spec covers all four.

> **Amended 2026-10-07 (J1 as shipped, plan Task 16).** The plan's five planning-time corrections
> and the values J1 measured are folded in below, marked *(J1)* where they changed the text:
> 1. **Every branch leaves the app working** — J1 adds the `onLifecycleChange` seam with a
>    *legacy adapter* that keeps today's visuals; J2 swaps it for the loop and only then deletes
>    the wandering code (§1.1, Assumption 10).
> 2. **Initially Active robots exit a station at load** (§1.6).
> 3. **`chooseNextSite`, `siteCooldown` and `heldJobs` live in `src/systems/siteChoice.ts`** (J1),
>    not `workLoop.ts`, so the readiness sim could run before the loop exists (§1.7).
> 4. **"Held"** in the variety rule is defined precisely (§1.7).
> 5. **Centre vs position** — one conversion pair, `robotCentre` / `positionForCentre` (J2 Task
>    18) (§1.9).
>
> Values measured in J1: `BATTERY_DRAIN_ACTIVE` = 6 (§5.2 drain sim), site cooldown 0.4/3/30
> (§5.2 readiness sim, Crawford's pick) — re-pinned to **0.3/2/30** at Task 16b against the
> longer 6–10 s jobs. Pinned by the station sketch (Task 0a, 2026-10-07):
> the station box 200 × 200, `STATION_ARC_SECONDS` 1.0, the station design and the render-order
> and back-row-exit corrections in §1.6. Pinned by the moves sketch (Task 0b, 2026-10-07):
> `jobDuration(bpm)` 6–10 s from the tempo with orbiter count cut from timing, `JOB_WORK_RATE` and
> `JOB_MIN_SECONDS` retired, `ATTACH_DURATION` 1 s, the move constants and two paths per site
> (§1.5, §1.9). Code caught up at Task 16b. The port stays at the centre pending Crawford. Per-task detail ("As shipped") is in
> [docs/tasks/ROBOT_JOBS_AND_STATIONS.md](../tasks/ROBOT_JOBS_AND_STATIONS.md).

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (watch) / `npx vitest run <path>`
> - Dev server: `npm run dev`
> - Idle-paint gate: `npm run build && npx vite preview --port 4173`, then
>   `npm run perf:idle --throttle 1 --only none --url http://localhost:4173/trace-atlas/?session=…`

## Assumptions (correct these before the plan)

1. **Districts D1 + D2 have merged** and their spec holds as amended 2026-10-06: `placeDistrict`
   replaces `placeFactories`; scenery actors are `ActorType.SCENERY` with `config.kind`
   (16 `SceneryKind`s, no `dock`), `config.row` and `config.derelict`; renderers read geometry from
   `deriveSceneryParams(actor)`; a row's `anchor` (incl. `'offscreen'`) is recoverable from
   `config.row` + the district. Every reference below to a districts module is to that shipped code;
   re-verify names when J1 starts.
2. **Two state machines, one replayed.** `Robot.docking` (renamed values, §1.1) stays the
   measure-ticked, replayed lifecycle and the only thing audio reads. A new `Robot.activity` (§1.2)
   is the live visual state and replaces `Robot.state`/`RobotState`. Nothing audio-side reads
   `activity`; nothing the replay computes reads `activity`, `job`, `position` or `stationId`.
3. **Flat drain ≈ 6 %/measure.** Today's mean Active drain with balanced jobs is 2 + mean(1,3,5,7)
   = 6. J1 pins the integer by measurement (§5.2), choosing the value whose mean Active count over
   the seed grid is closest to today's. *(J1: measured and confirmed — `BATTERY_DRAIN_ACTIVE` = 6,
   mean Active 5.14 against the old rule's 5.05; table in docs/ROBOT_LIFECYCLE.md.)*
4. **The job is live state, not replayed or persisted.** `Robot.job` becomes a plain `JobType`
   written by the work loop; `assignedAtMeasure` goes. Sessions already never persist it
   (`sessionDiff.ts`, `types/session.ts`).
5. **Wall-clock for the visual layer.** Cooldowns and waits read `gsap.ticker.time` (through an
   injectable `now()`), so they pause with GSAP, not with the Transport. Every visual delay is a
   GSAP tween/timeline or `gsap.delayedCall` — never `setTimeout`/`setInterval`/`requestAnimationFrame`
   (CLAUDE.md), and never a standing repeat.
6. **The work loop reaches React-owned motion through a registry**, like `setRef`/`getRef`:
   `RobotBody` registers its world `decorateArc` and an orbiter work-lock; the loop looks them up by
   robot id. Cards and the detail avatar never register.
7. **Hosts are midground + foreground until J4.** The ≥3 × ≥4 coverage guarantee (§1.4) counts only
   those depths, so it holds whether or not J4 ships. Background hosts join the pool when J4 lands
   (`BACK_HOSTS_ENABLED`).
8. **Derelict items host Salvage and Structural Inspection only** (a dead tank doesn't vent).
   Wrecks are always derelict.
9. **Reduced motion** follows the existing patterns: swims unchanged (as today); station enter/exit
   and orbiter attach become 0.3 s fades in place; job moves become an in-place orbiter opacity
   pulse for the job's duration; `decorateArc` already no-ops.
10. **Dead code goes in two steps** *(J1, correction 1)*. **J1** deleted what nothing calls:
    `interactionSystem.ts`, the factory production fields (`cooldownRemaining`,
    `productionInterval`, `isOffline`, `offlineSince`, `PRODUCTION_INTERVAL`;
    `factoryBubbleProps.ts`'s `isActive` became `true`), `BATTERY_DRAIN_BASE` and
    `JOB_BATTERY_DRAIN_SURCHARGE`. **J2** (Task 24, when the loop replaces the legacy adapter)
    deletes what the adapter still uses: `idleSystem.ts` (whole module), `lifecycleVisuals.ts`,
    `Robot.destination`, `Robot.direction` (written, only ever read to copy itself), `RobotState`,
    `scoreJobAffinities`, `assignJob`, `JOB_MAX_ROBOTS_PER_TYPE`, `BATTERY_LOWER_THIRD_THRESHOLD`,
    `pickExitDestination`, and bottom-only `generateSpawnPosition` for docking.

## 1. Overview & Claude Explanation

### 1.1 Lifecycle (J1, `src/systems/robotSystems.ts`)

- **Renamed states** (`types/Robot.ts`), fixing today's inversion where `Docking` meant *leaving*
  the dock: `DockingState = { Docked: 'docked', Undocking: 'undocking', Active: 'active',
  Recalled: 'recalled' }`. Transitions and holds are unchanged: Docked → Undocking at
  `BATTERY_FULL_THRESHOLD`, Undocking → Active when the hold elapses, Active → Recalled at
  `BATTERY_CRITICAL_THRESHOLD` (subject to the never-zero-Active invariant, unchanged), Recalled →
  Docked when the hold elapses.
- **Flat drain:** `BATTERY_DRAIN_ACTIVE` (§Assumption 3) replaces `BATTERY_DRAIN_BASE` +
  `JOB_BATTERY_DRAIN_SURCHARGE`. Recharge, thresholds and clamps unchanged.
- **`RobotLifecycleSnapshot`** drops `job`, `octaveRange`, `rhythmicDensity`,
  `rhythmicMotifLength` (scoring-only); keeps `noteVariance` (pitch drift). `stepRobotLifecycle`
  loses `chooseJobForSnapshot`. Pitch drift (`reRollMelodyPitches`, seed formula) is untouched.
- **Landing effects shrink to audio + state:**
  - `beginRecall` (was `beginDeparting`): writes `docking: Recalled` + hold; **no swim**. Calls
    `onLifecycleChange(localeId, robotId, 'recalled')` (§1.7).
  - `beginUndocking` (was `beginDocking`): writes the hold only.
  - `landOnActive`: `docking: Active`, clears hold, `audioMode: 'none'`, then
    `onLifecycleChange(…, 'active')`. No `assignJob`, no `handleRobotIdle`.
  - `landOnDocked`: `docking: Docked`, clears hold, `audioMode: 'mute'`, drifted melody +
    `AudioEngine.registerRobotMelody` (unchanged), then `onLifecycleChange(…, 'docked')`. **No
    position write** — the loop owns position (§1.7). The dock-cycle counter stays (it seeds
    drift). *(J1: it moved to `src/systems/dockCycles.ts` — `getDockCycleCount` /
    `recordDockLanding` — so the tick and the legacy adapter read one counter without an import
    cycle.)*
- **The seam in J1 is a legacy adapter** *(correction 1)*. `onLifecycleChange` lives in
  `src/systems/lifecycleVisuals.ts`, and in J1 it does exactly what the landing effects did before,
  moved verbatim: `'recalled'` → the exit swim; `'active'` → `assignJob` + `handleRobotIdle({
  isReturning: true })`; `'docked'` → the off-screen dock spot. Behaviour parity is proven by the
  moved tests passing unmodified. `scoreJobAffinities`/`assignJob` moved there too. J2 (Task 24)
  re-points the seam at `workLoop.ts` and deletes the adapter. The tick itself never changes again
  after J1.
- The tick is a BeatClock subscriber, not a GSAP callback, so calling into the loop from it is
  allowed (today it calls `createSwimTimeline`/`handleRobotIdle` the same way).
- **(J2)** `worldTransition.ts`'s `initializeLocale` drops the initial `assignJob` pass and calls
  `stopWorkLoop(); startWorkLoop(localeId)` beside the lifecycle pair. `powerController.ts`'s
  `shutdown` and its orchestrated twin call `stopWorkLoop()` beside `stopRobotLifecycle()`.

### 1.2 Robot fields (J1, `types/Robot.ts`)

| Field | Change | Owner |
|---|---|---|
| `docking: DockingState` | values renamed (§1.1) | lifecycle tick |
| `activity: RobotActivity` | **new**, replaces `state: RobotState` | work loop |
| `job?: JobType` | was `{ type, assignedAtMeasure }`; now the bare type; `undefined` until first assignment | work loop |
| `stationId?: string` | **new** — the station the robot is in, heading to, or last left | work loop |
| `siteId?: string` | **new** — the actor id the robot holds (heading to or working at) | work loop |
| `layer?: 'background' \| 'foreground'` | existing, unused today; J4 gives it meaning (§1.10) | work loop |
| `position: Vec2` | unchanged shape; written by the loop on every leg's arrival | work loop |
| `state`, `destination`, `direction` | **removed** | — |

`RobotActivity = 'charging' | 'exiting' | 'transit' | 'working' | 'waiting' | 'returning' |
'entering'`. `JobType` gains `salvage` and `maintenance` (six). All fields stay JSON-serializable.

*(J1, correction 1.)* J1 shipped the renamed `docking` values, the bare `job` and the
`RobotActivity` type (`siteChoice.ts`'s `heldJobs` reads it structurally). The `activity`,
`stationId` and `siteId` fields arrive in J2 with their writer (Task 21), and `state`,
`destination` and `direction` go in J2 Task 24.

> **Shipped (J2, 2026-10-08).** As the table says. `activity` is required since Task 24:
> `spawnRobot` sets it from `docking` (Active → `'exiting'`, else `'charging'`) and
> `placeRosterAtStations` sets it again at the port. `state`, `destination`, `direction` and
> `RobotState` are gone, guarded by `types/Robot.test.ts`. `layer` is still unused (J4). Noticed,
> not touched: `Robot.lastInteractionMeasure` has had no writer since Task 6.

### 1.3 Hosts (J1, `src/systems/jobHosts.ts`)

`hostJobs(actor): JobType[]` — empty means "not a host". Factories by variant, scenery by `kind`;
an actor with `config.derelict` hosts `[salvage, structuralInspection]` instead of its normal list;
off screen means no job: any actor in an `offscreen` row, or whose drawn body lies wholly outside
the world's width (`x1 ≤ 0` or `x0 ≥ WORLD_WIDTH`), hosts nothing. A body that straddles an edge
still hosts, worked where it can be seen.

| Host | Jobs |
|---|---|
| Monolith | structuralInspection |
| Stacks | ventExtraction |
| Refinery | ventExtraction, fluidMonitoring |
| Skyscraper | acousticSurvey, structuralInspection |
| Warehouse | salvage |
| tank | ventExtraction, fluidMonitoring |
| crane | structuralInspection, maintenance |
| pylon | acousticSurvey, maintenance |
| beacon | acousticSurvey, maintenance |
| pipeline | fluidMonitoring |
| dome | structuralInspection, fluidMonitoring, maintenance |
| wreck | structuralInspection, salvage (always derelict) |
| turbine | maintenance |
| vent | ventExtraction |
| containers | salvage |
| scaffold | structuralInspection |
| floodlight | maintenance |
| dish | acousticSurvey |
| wall, boulder, tether | — |

Pipe bridges are not actors and never host. `isWorkSiteEligible(actor, { backHosts })` adds the
depth filter (§Assumption 7). *(J1)* Two orderings the table leaves open: off screen beats
derelict (an off-screen derelict hosts nothing), and a derelict non-host (wall, boulder, tether)
stays a non-host. An unresolvable row counts as foreground, like `Factory.tsx`'s fallback.

### 1.4 Coverage guarantee (J1, `src/systems/jobCoverage.ts`)

After `placeDistrict`, `ensureJobCoverage(localeId)` counts eligible midground + foreground hosts per
job. The world must have **≥ 3 job types with ≥ 4 hosts each**. If it doesn't, it appends items from
the district's `coverageTopUp` list — a new, ordered field on each recipe in `districtRecipes.ts`,
`{ kind, depth }[]` — one at a time, placed through the district placer's own row/spread/ground-lock
machinery at a seeded x (`'locale.coverage.x'`, offset by top-up index), until the rule holds or the
list is exhausted. Top-ups are ordinary actors (seeded, deterministic, recolored, counted by the
element budget). A recipe whose top-up list cannot satisfy the rule fails the coverage test (§5.1),
so the tables are fixed in data, never at runtime. Wreck field is the known case (2 vents).

*(J1, as shipped.)* The lists are `COVERAGE_TOP_UP: Record<DistrictName, CoverageTopUp[]>` beside
`RECIPES`, and the signature is the pure `ensureJobCoverage(actors, topUps, place)`, with
`placeDistrict` passing its own placer. Top-up `i` sits on row `recipe.length + i`, which
`getRecipeRow` resolves through `coverageTopUpRow` (ground-locked or on the midground floor,
`count: 1`, `derelict: 0`). Its x is in the middle 70 % of the width. Far more worlds fell short
than expected: 56 of 121 on the grid, not just wreck field. The missing third job is nearly always
acoustic survey or maintenance, so the lists lead with midground pylons. Every world passes after
top-ups (92 in all, at most 3 per world).

### 1.5 Work sites and anchors (J1, `src/systems/workSites.ts`)

`getWorkSite(actor): WorkSite`, pure, derived from the same parameters the renderer uses —
factories through a new `factoryGeometry(actor)` extracted from `Factory.tsx`'s `staticVisual`
(`selectVariantFromSeed` + `calcSilhouetteSize` + the `bottomAnchorTransform` maths: box
`x … x + w·sx`, `y − h·sy … y`), scenery through `deriveSceneryParams(actor)` plus one per-kind
anchor function beside it.

```typescript
interface WorkSite {
  id: string;                         // actor id
  depth: 'background' | 'midground' | 'foreground';
  jobs: JobType[];                    // hostJobs(actor)
  bounds: { x0: number; y0: number; x1: number; y1: number }; // silhouette box, scene units
  park: Vec2;                         // robot centre while working (scene units)
  points: Vec2[];                     // 2–4 work points: mouth, mast head, valve, roof corners…
  path: Vec2[];                       // ≥ 2-point polyline: top outline, pipe run, hull line…
}
```

- **Park:** robot centre at `(clamp(centre x ± seeded 0–40), roof − PARK_CLEARANCE)` with
  `PARK_CLEARANCE` = 70 (body half-height + margin), clamped into the world (`WORLD_MARGIN` 100).
- *(Task 0b, A2 confirmed)* **Two paths per site.** The sketch's jobs need both a silhouette line
  and a pipe run on the same host (structuralInspection traces the outline, fluidMonitoring the
  pipe), so `path` becomes `paths: { outline: Vec2[]; pipe?: Vec2[] }` — `outline` always present,
  `pipe` where the kind has one; `trace(pipe)` on a site without one falls back to the outline.
  J1's `workSites.ts` ships a single `path`; the split lands with T19's first consumer.
- **Foreground rule:** foreground buildings draw *over* the robots layer, so a foreground site's
  `points` and `path` lie on or above its top outline — orbiters work at the silhouette from
  outside, never behind its face. Midground and background sites may use facade points.
- Points are seeded per site (`Alea(actor.id + ':work')`), not per robot; per-robot variation comes
  from §1.9. *(J1)* The park's ± 40 sideways offset has its own stream (`Alea(actor.id + ':park')`).
- *(J1)* **Cached by the actor object (`WeakMap`), never the id.** Actor ids repeat across
  locales: 730 of 4210 over the grid, 652 of them with different geometry.
- *(J1)* Park and points use the part of the roof inside `[0, WORLD_WIDTH]`. A background
  Skyscraper's roof can sit above `WORLD_MARGIN + PARK_CLEARANCE`, so its clamped park lands
  below the roof line. Background sites are ineligible until J4, and J4 decides whether to drop
  them or park beside them.
- *(J1)* Scenery anchors live in `components/actors/scenery/sceneryWorkAnchors.ts`. Where the
  renderer's geometry was more than a one-liner, it moved into an exported layout helper that the
  renderer and the anchors both call (BUILDING_DESIGN.md "Robot jobs").

> **Shipped (J3, 2026-10-08; Task 29).** `path` became `paths: { outline, pipe? }` (type
> `WorkPaths`) at Task 29, not T19: the split waited for its first reader, Fluid Monitoring's
> `trace(pipe)`. Every kind's `outline` is its old `path` except the pipeline's, which is now its
> stepped top; the old run is its `pipe`. So a derelict pipeline's Structural Inspection traces
> the top, not the run. **Only the pipeline has a pipe.** The Refinery's pipes and valves aren't
> extracted, so Fluid Monitoring on a Refinery, tank or dome traces the outline (the fallback
> above). The background Skyscraper park clamp is still open for J4. The job → host → move table
> and each host's points are in
> [BUILDING_DESIGN.md](../BUILDING_DESIGN.md#jobs-hosts-and-moves).

### 1.6 Stations (J1 data, J2 render)

- `getStations(localeId): Station[]`, cached like `getRobotGem`. Count 2–3 (`'station.count'`).
  Positions `'station.x'` / `'station.y'` offset by index: x in [240, 1680], y in [220, 560], and
  re-drawn (next offset) until every pair is ≥ `STATION_MIN_SPACING` = 480 apart and the station's
  box overlaps no host's `bounds`. `Station = { id, center: Vec2, port: Vec2, capacity: 6 }`. Not
  state — derived from the seed on demand.
  *(J1, as shipped in `src/systems/stations.ts`.)* The pure core is `deriveStations(noiseMap,
  obstacles)`. `getStations(localeId)` caches it per placed world (keyed by the actors array) and
  returns `[]` for an unknown locale. The obstacles are every host's bounds at **every** depth
  (`hostObstacles`), so J4 can't move a station. Every draw hashes three samples (offset + `[0,
  137.42, 911.77]`) through `alea()`: a single sample at offset 0 took about 3 values across all
  worlds, and no world rolled 3 stations. A station that finds no spot in 16 candidates restarts
  the layout, up to 16 layouts. After that, the count steps down to 2, and then the overlap rule
  is dropped (spacing always holds). Result over the grid: 50 of 121 worlds have 3 stations, and
  no world needs the overlap fallback. *(Task 0a, 2026-10-07:)* the sketch pinned the box at
  **`STATION_BOX_W`/`STATION_BOX_H` = 200 × 200** (in code since T20; the grid still needs no
  overlap fallback at that size). `port` = the centre stays, marked open in the sketch header.
- **Design (Task 0a, `docs/sketches/robot-charging-station.html`):** same manufacturer as the
  robots — ACCENT palette, BACKING/MID_DARK, bevel ring with 3 facet tones, boundary lines. Four
  loosely triangular gem layers, L1 (front) to L4 (back), each rotated against the next; L4 is one
  solid piece in BACKING, L1–L3 are rings cut into three pieces with a gap; L1 is in the station's
  seeded accent, L2–L3 in MID_DARK. **Six of the nine pieces are the slots** (two per broken
  layer, seeded), lit back-to-front in the stored robot's `identityColor` in the lit-Mid style,
  each with one light dot — so the slot lights *are* the occupancy display. A small **port gem** at
  the centre of L1 and a **static halo** (radius 60) in the station accent both brighten with
  occupancy. **No bob** — this bullet's no-continuous-animation rule stands (Crawford's call).
  Four geometry dials are **driven live by the world's `GlobalAudioSettings`** (continuous in the
  dial's natural space, same rng stream, so a drag deforms the station without a pop — the robots'
  dial rule applied to the station): gap 10–25 u ← HPF cutoff (log 20 Hz → 20 kHz); band width
  8–16 u ← LPF cutoff (log); rotation spread 30–60° ← EQ3 mid (−12 → +12 dB); size falloff
  0.03–0.12 ← EQ3 tilt, low − high (−24 → +24 dB). Flat EQ and open filters give gap 10, band 16,
  spread 45°, falloff 0.075; filter Q is unused; every station in a world shares these four, and
  per-station variety comes from the seed (base rotation, corner jitter, cut style, slot picks).
  Bevel depth 5. Still TBD in the sketch header: depth-tint on/off and opacity, swim speed,
  back-row scale, enter/exit sides.
- **Render:** ~~`ChargingStation.tsx` (memoised) draws each station in the **front robots layer, after
  the robots** — a robot entering passes under it.~~ *(Task 0a correction:)* the station is **three
  fragments interleaved with the robots**, back to front: **L4 · exiting robots · L3 · entering
  robots · L2 · halo + ripple · L1**. SVG z is document order, so `OceanScene` renders the robots
  layer as siblings sorted by activity between the station fragments (`exiting` first, then
  everyone else), and a robot *entering* passes between L2 and L3, not under the whole station.
  Further, the **exiting robot appears in the back robot row** (§1.10, J4): L4 and the exiting
  robots live in `robots-back`, under the 0-1 depth gradient at `BACK_LAYER_SCALE`, and only L1–L3
  stay in `robots`. **T20 therefore depends on J4**; until J4 lands, exits use the front row
  (between L3 and L4 in the front layer, scale 1) as the fallback. Gem art style per the Design
  bullet; **≤ `STATION_SHAPE_BUDGET` = 25 shapes** each *(T20, Crawford's call: 16 can't hold
  four unshareable layers plus a colour per lit slot. Facets are shaded by one light and one dark
  overlay path per layer, so a lit slot costs one path: 19 empty, 25 full; see the plan's Task
  20)*. Six slot lights = the six slot pieces plus their dots. Lit = robots with that `stationId`
  and `activity === 'charging'`, read as one primitive key of their identity colours
  (`stationOccupancy.ts`), so only a change to this station's lit set re-renders it. No
  continuous animation on the station itself (confirmed at the sketch).
- **Enter / exit motion (Task 0a):** entering, the robot swims to the port and vanishes over
  `STATION_ARC_SECONDS` = **1.0** (scale 1 → 0.15 and opacity 1 → 0) while the halo ripple runs
  **inward** for the same arc; exiting, it appears at the port behind L3 (scale 0.15 → back-row
  scale, opacity 0 → 1) while the ripple runs **outward**, then swims off. The ripple is Phase
  41's ring (one whole cycle per arc, ring width 0.2) in the moving robot's `identityColor`; a
  ripple already running means the new one is **skipped**, so twelve robots exiting at world open
  play one ripple. Reduced motion: opacity only, no ripple.
- **Assignment:** at locale load, **every** robot is assigned a station by roster index modulo
  station count (capacity 6 × ≥ 2 stations ≥ 12, so it always fits — `assignStationsAtLoad` throws
  rather than overfill) and starts at the port. Docked robots start hidden (`activity:
  'charging'`); *(correction 2)* initially Active robots start `activity: 'exiting'` and
  `onRobotMounted` plays `exitStation` for them, so a fresh world opens with robots leaving their
  stations. A recalled robot picks the nearest station whose occupancy (robots with that
  `stationId` and activity `returning | entering | charging`) is below capacity, reserving the slot
  on decision (`nearestFreeStation`: a missing occupancy entry is empty, ties go to the earlier
  station, `null` when all are full).

> **Shipped (J2, 2026-10-08; Tasks 20, 21, 23).** Crawford's Task 0a design in
> `src/components/stations/` (`stationGem.ts`, `stationPaint.ts`, `stationOccupancy.ts`,
> `ChargingStation.tsx`). `OceanScene`'s robots layer is `#station-l4-layer`,
> `#station-l3-layer`, `#robot-layer`, `#station-front-layer`. **Not as specced:** exiting robots
> still draw in `#robot-layer` (above L3, under the front fragment), not between L4 and L3. That
> needs `OceanScene` to order robots by activity without remounting them, so it moves to J4.
> `STATION_SHAPE_BUDGET` is 25, not 16 (Crawford's call, Task 20). Slots light in **roster order**
> of the charging robots, not arrival order, so colours shift one slot when a lower-roster robot
> docks. The port scale is `STATION_PORT_SCALE` = 0.15 (this section's, over §1.7's 0.4), and the
> eases are the sketch's: √v out, v² in, opacity linear. The station ripple is
> `src/animation/stationRipple.ts`. The station doesn't dim at night (no rule here; Checkpoint C
> passed it). `port` = `center` stays open. Checkpoint C passed it all on 2026-10-08.

### 1.7 The work loop (J2, `src/systems/workLoop.ts`)

The visual-side state machine. Module state (runtime only, never Zustand — an `Actor` write would
re-render every factory layer): per locale, `siteState: Map<siteId, { heldBy?: robotId; readyAt: number }>`,
and the set of robots with a pending recall. Public surface:

- `startWorkLoop(localeId)` / `stopWorkLoop()` — idempotent singleton pair like the lifecycle's;
  `stop` kills every `work-*`, `station-*` and `swim-*` timeline and clears module state.
- `onRobotMounted(localeId, robotId)` — replaces `Robot.tsx`'s `handleRobotIdle` call. Docked or
  Undocking: hide at the station port (`autoAlpha: 0`), `activity: 'charging'`. Active or Recalled:
  release any held site and call `next()` from the store's `position` — this is also the whole
  power-cycle and remount story (§Out of scope: power-cycle polish).
- `onLifecycleChange(localeId, robotId, to)` — called by the tick (§1.1):
  - `'recalled'`: mark recall pending. `working` → let the job finish (its `onComplete` sees the
    flag). `transit` → kill the swim, release the site **with no cooldown** (the robot never worked
    there — *J1 readiness sim*), return now. `waiting` → return now. `exiting` → let the arc
    finish; its `next()` sees the flag.
  - `'active'`: if `charging` → `exitStation`. If `returning`/`entering` (still outside) → the
    **turn-back rule**: release the station slot, clear the flag, `next()`.
  - `'docked'`: no visual change; the robot keeps returning/entering and becomes `charging` when its
    entry finishes.
- `next(robotId)` — the only decision point. If recall is pending or `docking` is Recalled/Docked →
  `returnToStation`. Else `chooseNextSite(…)` (below) → `transit` (swim to `park`) → `working`; or
  `null` → `waiting` (one finite bob of `WAIT_RETRY_SECONDS` = 2, then `next()`).
- **`chooseNextSite(input): { siteId, job } | null`** — pure, `rand` injected. *(Correction 3:
  it lives in `src/systems/siteChoice.ts`, shipped in J1, with `siteCooldown` and `heldJobs`;
  `workLoop.ts` imports them.)*
  1. Ready sites = not held and `now ≥ readyAt`, eligible per §1.3.
  2. If the robot has a `job` and a ready site hosts it → the nearest such site (keep the job).
  3. Else pick a job among those with ≥ 1 ready site, preferring jobs **no other robot holds**
     (if every such job is held, all of them), weighted by its ready-site count; then the nearest
     ready site for it.
  4. None ready → `null`.

  *(J1)* Distance is Euclidean from the robot's centre to the site's `park`, and ties go to the
  earlier site. Keeping the job never draws `rand`, and a switch draws it exactly once. A
  multi-job site adds one to each of its jobs' weights.
- **Held** *(correction 4)*: `heldJobs(robots, selfId)` is the `job` of every *other* robot whose
  `docking` is Active and whose `activity` is `exiting | transit | working | waiting`. Charging,
  returning and entering robots hold nothing (their `job` is stale), and neither does a
  non-Active robot or one with no `activity`.
- **Cooldown:** on leaving a site, `readyAt = now + siteCooldown(eligibleSiteCount)`, where
  `siteCooldown(n) = clamp(n × COOLDOWN_PER_SITE, COOLDOWN_MIN, COOLDOWN_MAX)` — more buildings,
  longer rest, so work spreads; few buildings, short rest, so robots don't starve. First guesses
  were `0.6 s`, `4 s`, `30 s`. ~~Pinned by the readiness sim (§5.2): `0.4 s`, `3 s`, `30 s`
  (J1, Crawford's pick, 2026-10-07).~~ **Re-pinned by the Task 16b re-run at 6–10 s jobs (§5.2):
  `0.3 s`, `2 s`, `30 s`** *(Crawford, 2026-10-07)*.
- **Stations:** `exitStation` — at the port, `autoAlpha 0 → 1`, scale `0.4 → 1`, the registered
  `decorateArc('spawn', d, tl)`, `activity: 'exiting'` → `next()`. `returnToStation` — reserve a
  slot, `activity: 'returning'`, swim to the port, then `entering`: scale `1 → 0.4`, `autoAlpha → 0`,
  `decorateArc('despawn', d, tl)` → `activity: 'charging'`, `position = port`; if `docking` is
  already Active at that moment → `exitStation` (turn-back). `STATION_ARC_SECONDS` = 0.9.
- Swims reuse `createSwimTimeline` (key `swim-${id}`); each leg's `onComplete` writes
  `position` = the leg's destination, then continues. Every timeline's callbacks call only work-loop
  functions or store writes — never `AudioEngine` (Strict Separation).
- **Hidden tabs:** the Transport keeps ticking while GSAP slows, so the lifecycle can run ahead of
  the visuals. Every `next()` reconciles against `docking` first, so the visuals always converge.

> **Shipped (J2, 2026-10-08; Tasks 22–24).** `src/systems/workLoop.ts` holds the loop and
> `onLifecycleChange` itself (type `LifecycleChange`), which `robotSystems.ts` imports. Differences
> from the text above, each recorded in the plan: (1) **No recall flag.** Every decision reads
> `docking` (`next()` sends the robot home unless it's Active), so a flag would duplicate it.
> (2) **The arcs** use `STATION_PORT_SCALE` = **0.15** (§1.6's sketch value, not 0.4) and
> `STATION_ARC_SECONDS` = **1.0** (not 0.9). Reduced motion is a 0.3 s fade
> (`STATION_REDUCED_ARC_SECONDS`). (3) **Turn-back while entering finishes the arc first**:
> killing it would pop the robot to full size, so the arc's end sees Active and exits from the
> port. Returning turns back at once. (4) **`next()` does nothing while returning or entering**
> (the leg in flight decides); charging and Active → exit. (5) **Mounts adopt**: `startWorkLoop`
> adopts every mounted robot (a power-on mounts before the loop starts) and `onRobotMounted`
> adopts when the loop runs. Adopting drops the legs (a job is finished silently), abandons the
> site with no cooldown, then hides, exits or resumes the robot. With no loop, a mount only hides.
> (6) **`stop` also kills `bob-wait-*`** and runs a job in progress to its end without its
> callback, so the orbiters are docked when unlocked. (7) **Settle**: a leg cut short writes the
> body's GSAP x/y back to `position` before the next leg. (8) **Turn-backs only happen in a hidden
> tab**: critical → Active takes 20 measures, longer than any swim home.
> `workLoop.integration.test.ts` drives both cases at 200 BPM. Docs:
> [ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md).

### 1.8 Orbiter and halo hand-off (J2, `src/animation/robotMotionRegistry.ts`)

- `registerArcDecorator(robotId, fn)` / `getArcDecorator(robotId)` — `RobotBody` registers its
  world-context `decorateArc` (from `useHaloMotion`) on mount and removes it on unmount.
- `registerOrbiterWork(robotId, control)` / `getOrbiterWork(robotId)` — `useOrbiterMotion` (world
  context only) registers `{ lock(): SVGGElement[]; unlock(): void }`. `lock` returns the shown
  orbiters' `.gem__orbiter-local` groups in `cornerOrder` and sets a locked flag that makes
  `reconcile()` return early (count changes still update `targetCountRef`). `unlock` clears the flag
  and calls `reconcile()` once — the **catch-up**: the orbiters hop to the current count after
  reattaching, never replaying each intermediate change.
- `useOrbiterMotion`'s header note that it "stays ignorant of job animations" is replaced: it knows
  only that it can be locked.

> **Shipped (J2, 2026-10-08; Tasks 17, 23).** As above, plus: `lock` **finishes any hop in
> flight** (`progress(1)`) so every group is at rest; the deletes take an optional **owner** and
> remove only their own entry (a stale unmount can't strip a remount's); `decorateArc` is
> memoised so audio edits don't re-register it; and both registrations moved to
> `useLayoutEffect` so the first exit arc gets its halo ripple. **Open:** the lock doesn't stop
> `useOrbiterMotion`'s Size tween, so a Size edit mid-job would fight the pulse on `scale`. Docs:
> [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#robot-motion-registry).

### 1.9 Jobs and moves (J2: one move end to end; J3: all)

- **Job time:** ~~`jobDuration(job, orbiterCount) = max(JOB_MIN_SECONDS, JOB_BASE_SECONDS −
  JOB_WORK_RATE[job] × orbiterCount)`; `JOB_BASE_SECONDS` = 5, `JOB_MIN_SECONDS` = 1.5, rates 0.5–0.9
  per job (first guesses; the sketch pins them).~~ *(Task 0b, 2026-10-07, Crawford:)* **orbiter count
  no longer drives speed** — it "creates some weirdness" — and `JOB_WORK_RATE` and `JOB_MIN_SECONDS`
  retire with it. Every job runs for **`jobDuration(bpm) = JOB_BASE_SECONDS(bpm)`**, linear in the
  tempo over the Tempo slider's 20–200: `JOB_BASE_MAX_SECONDS` = **10** at 20 BPM down to
  `JOB_BASE_MIN_SECONDS` = **6** at 200 BPM (`10 − 4 × (bpm − 20) / 180`; 110 BPM → 8 s). Slower
  tempo, longer job. `bpm` is the live transport tempo, read at job start; a tempo change mid-job
  doesn't retime a running timeline. Orbiter count (`orbiterDials().count`, 1–4, never 0) still
  decides how many orbiters work. Code *(Task 16b, shipped)*: `jobDuration(bpm)` in
  `src/animation/jobMoves/jobDuration.ts`, clamped to 10 s below 20 BPM and 6 s above 200.
- **Flights inside the duration (Task 0b, A1 confirmed):** detach and reattach are part of
  `jobDuration`, not added to it — `ATTACH_DURATION` = **1.0 s** (was 0.5) each way. A two-move
  job at 6 s therefore has ≈ 3.3 s of actual work; at 10 s, ≈ 7.6 s.
- **One timeline per job run** (`work-${robotId}`): a bob on the robot's `<g>` (`y` ± `BOB_PX` = 6,
  finite repeats fitting the duration); the orbiters' **detach** (fly from dock to the first targets,
  `ATTACH_DURATION`), the job's **moves**, and **reattach** (fly back to `x: 0, y: 0`); then
  `unlock()` and the site's release. Killed and never left standing.
- **Five moves** (`src/animation/jobMoves/`), each a builder adding tweens to the job timeline for
  the locked orbiter groups, with pure target maths beside it:

| Move | What the orbiters do | Targets |
|---|---|---|
| `hoverPulse(point)` | gather around a point, pulse scale ×1.3 in turn | one `points` entry |
| `trace(path)` | run the polyline in a staggered line | `path` |
| `ring(point, r)` | circle a point at radius `r`, evenly phased | one `points` entry |
| `carry(a, b)` | move from `a` to `b` shrunk as if loaded, return | two `points` |
| `fan()` | spread into a fan above the site, then ping (scale up/down in sequence) | `points[0]` + offsets |

| Job | Moves |
|---|---|
| ventExtraction | hoverPulse(mouth) |
| acousticSurvey | fan → ring(point) |
| structuralInspection | trace(top outline) |
| fluidMonitoring | trace(pipe) → hoverPulse(valve) |
| salvage | carry(a → b) |
| maintenance | ring(point) with an opacity spark-flicker |

- **Move constants (Task 0b, kept as sketched):** gather radius 14 u and pulse ×1.3
  (`hoverPulse`); ring radius 24 u (±15 % per robot) and 1.5 revolutions per move (`ring`);
  trace stagger 0.12 of the move's length (`trace`); carry shrink ×0.7 (`carry`); fan radius 40 u,
  spread 120°, ping ×1.5 (`fan`); maintenance flicker dips to opacity 0.25, three per orbiter;
  `BOB_PX` 6 with a ≈1.2 s bob cycle (whole cycles fitting the duration). Within a job, moves
  split the duration equally; the first move's approach is the detach, later moves get
  min(0.35 s, 25 % of their share) to reach their first targets. Reduced motion: an in-place
  opacity pulse 0.8–1 on the whole robot, orbiters docked, no move targets. Names and values go to
  `constants/index.ts` at T19 (`hoverPulse`) and T29 (the rest).
- **Coordinates:** `sceneToOrbiterLocal(point, { robotPos, gem, bodyScale, layerScale, corner })`,
  pure — inverts the robot `<g>` translate, the `g.gem` `translate(c) scale(s) translate(−c)` (with
  `s = bodyScale × layerScale`) and the corner's dock offset. `robot.position` is the gem canvas's
  top-left, not its centre.
- **Centre vs position** *(correction 5)*: station ports and site `park`s are robot **centres**.
  One pure pair, `robotCentre(robot)` / `positionForCentre(centre)` (J2 Task 18), is the only
  conversion; spawn, the loop and the layer switch all use it.
- *(J1)* `jobDuration` shipped early, at `src/animation/jobMoves/jobDuration.ts`, for the readiness
  sim, as `jobDuration(job, count)` with `JOB_WORK_RATE` 0.7. *(Task 0b)* superseded — Task 16b
  rewrites it as `jobDuration(bpm)` and re-runs the readiness sim at 6–10 s, since Task 15 pinned
  the cooldown 0.4/3/30 against 2.2–4.3 s jobs. *(Task 16b)* done; the cooldown moved to 0.3/2/30
  (§1.7, §5.2).
- **Per-robot variation:** `Alea(gemSeed + ':work')` picks stagger, ring direction, radius ±15 %
  and trace direction — company members that look alike work differently.
- J2 ships `hoverPulse` + ventExtraction only (other jobs fall back to it); J3 adds the rest.

> **Shipped (J2, 2026-10-08; Tasks 18, 19).** `buildJobTimeline` runs `hoverPulse` on the site's
> first point for **every** job. Differences: `robotCentre(robot, gem)` / `positionForCentre(centre,
> gem)` take **no scale** (the centre is the fixed point of `g.gem`'s scale); a **counter-bob** on
> each `.gem__orbiter` copy keeps a detached orbiter still in the scene; gather targets are spaced
> by **slot, not corner** (corner spacing collides at count 3), the first directly above the
> point; the reattach restores nothing (the pulse already ends at rest — T29's flicker must too).
> Not yet: per-robot variation, and `WorkSite.path` → `paths` (both T28). Docs:
> [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#job-timeline).

> **Shipped (J3, 2026-10-08; Tasks 28, 29).** All five moves and the six-job table are in
> `src/animation/jobMoves/` (`hoverPulse.ts`, `trace.ts`, `ring.ts`, `fan.ts`, `carry.ts`,
> `variation.ts`, `jobMoveTable.ts`), with the constants above in `constants/index.ts`, plus
> `CARRY_SPACING` 8 u (the sketch's, kept in `carry.ts`) and `RING_SEGMENTS` 36. Differences from
> the text: (1) **Point roles are indices**, because sites name their points only by index. The
> mouth, mast or point is `points[0]`, Fluid Monitoring's valve is `points[1]`, and Salvage
> carries `points[0]` → `points[1]` (flagged at Task 29). (2) **Fluid Monitoring's `trace(pipe)`**
> traces the outline on every host but the pipeline (§1.5). (3) **The ring is a polyline** of 15°
> chords, not an `onUpdate`. Maintenance's flicker dips on 3 seeded chords per orbiter, indexed by
> corner. (4) **Variation also sets a turn order and a start phase**, and `hoverPulse` uses them
> too, a visible change to Vent Extraction: the first orbiter is no longer always straight above
> the mouth. The fan always opens upward. (5) The detach is capped at 40 % of the first move's
> share, which never binds at 6–10 s. (6) `buildJobTimeline` picks each move's routes and tweens
> in one exhaustive `planStep` (code review). Checkpoint D passed 2026-10-08, and so did the J3
> perf gate and the Pixel listen. Docs:
> [ANIMATION_SYSTEM.md](../ANIMATION_SYSTEM.md#job-moves).

### 1.10 Depth layers (J4, `OceanScene.tsx`)

- **Layer stack:** `back` (water, ridge, background buildings, tint A) → **`robots-back`**
  (moving) → **`mid`** (tint B, midground buildings and pipe bridges, tint C, the ground line —
  split out of today's `back`) → `bubbles` → `robots` → `front` (tint D, foreground buildings).
  Back-layer robots sit under tints B–D, which haze them like the buildings behind them — scene
  haze, not a robot overlay (Visual Mapping guardrail unchanged). The ground line is in `mid`
  because it is a midground silhouette (Task 32).
- **Depth tints** (sketch gate, `docs/sketches/robot-depth-tint.html`, Crawford 2026-10-08):
  four full-screen tints spread through the stack, replacing today's two (gradient-0-1 at .7 and
  gradient-1-2 at .5, which together put ~85 % haze on a back-row robot in one frame). Each sits at
  the edge of an existing static layer, so no new compositor layer:

  | Slot | Where | Opacity | Colour |
  |---|---|---|---|
  | A | top of `back`: over background buildings, under the back row | 0.06 | `#0c1c4f` → `vent.shadow` |
  | B | bottom of `mid`: over the back row, under the midground | 0.25 | `#0c1c4f` → `vent.shadow` |
  | C | top of `mid` (under the ground line): over the midground, under the front row | 0.20 | `vent.shadow` |
  | D | bottom of `front`: over the front row, under the foreground | 0.10 | `vent.shadow` |

  Coverage (1 − Π(1 − α)): background buildings 49 % (was 85 %), back-row robots 46 %, midground
  28 % (was 50 %), front-row robots, stations and bubbles 10 % (was 0), foreground 0 *(Task 33
  correction: the sketch's readout left D out of the two building rows and printed 44 % and 20 %;
  its rendered scene, which Crawford judged, has D over them, as this stack does)*. The pop at a
  switch is B and C together, 40 % (was 85 %), and the dissolve blends it. This changes every
  world's look, not only the robots'; Checkpoint E judges it on the real buildings.
- **Clicks:** both robot layers get `pointer-events: none` like the rest; `.robot` gets
  `pointer-events: auto`, so the front layer's full-screen `<svg>` stops blocking the back one.
- **Which layer:** `Robot.layer` — `'background'` while the robot's current destination is a
  background site, `'foreground'` otherwise (stations are front). `OceanScene` renders each robot
  in its layer's list.
- **Switching:** `findLayerSwitchPoint(from, to, robotBox, midgroundBounds): Vec2 | null`, pure —
  the first point along the straight leg (sampled every 20 units) where the robot's box overlaps no
  midground silhouette (`midgroundSilhouettes.ts`: everything solid between the robot rows; bubbles,
  plumes and light excluded, Crawford 2026-10-08) **and stays clear for the whole dissolve**: over
  the stretch the second swim covers in `LAYER_DISSOLVE_SECONDS`, or to the leg's end if it
  arrives sooner (Task 32b). The leg splits there: swim to the switch point, write `layer` +
  `position` (React re-mounts the robot in the other layer, `onRobotMounted` continues the leg),
  then swim on while the robot `<g>` eases between scale 1 and `BACK_LAYER_SCALE` = 0.75. No clear
  run → the site is skipped for this decision. Robots never pop through a building.
- **Dissolve** (sketch gate, Crawford 2026-10-08): `LAYER_DISSOLVE_SECONDS` = 1.0. At the switch
  point the robot is drawn in both rows for the dissolve: it re-mounts in its new row at full
  opacity, and a copy in the row it left fades — out (front → back) or in (back → front) — over
  it, so the haze blends instead of popping and the robot never goes see-through. The dissolve
  runs after the switch point in both directions. Proposed for Task 34: the copy is an SVG
  `<use href="#…">` of the robot's own group in the other layer's `<svg>` (one GSAP target, no
  second React mount or registry entry); confirm it renders the live transforms before relying on
  it.

  > **Shipped (Task 34) — the back → front direction differs.** As written, a robot re-mounted in
  > the front row at full opacity covers the back copy entirely, so the haze would still pop; the
  > sketch's own rule is that the *front* copy fades over an opaque back one in both directions. So
  > the copy is always a front-row `<use>` (OceanScene's `#robot-dissolve-layer`, after
  > `#robot-layer`) of the robot's group (`#world-robot-{id}`), and the robot is always the opaque
  > back one during the fade. **Front → back:** at the switch point the robot re-mounts in the back
  > row; the copy fades 1 → 0 over it, then goes. **Back → front:** the robot stays in the back row;
  > the copy fades 0 → 1 over it while it swims on; once the swim *and* the fade are done, the robot
  > re-mounts in front at rest under the now-opaque, identical copy, which then goes. The task's
  > criteria hold as written (copy 1 → 0 or 0 → 1, the re-mounted robot always opaque); only "a copy
  > in the row it left" is wrong for back → front. Cost: after a back → front fade the robot is drawn
  > twice for the rest of that swim. The `<use>` was checked in headless Chrome first: it follows
  > live transform changes on the referenced group and an inner scaled group across two inline
  > `<svg>`s, and resolves a gradient defined in the other one. **Scale:** the row scale is on a new
  > `.robot__row` wrapper inside `.robot`, set with `svgOrigin` at the gem canvas centre, which is the
  > frame `sceneToOrbiterLocal` assumes (`.robot`'s own origin is its bounding box's centre). It eases
  > over the second swim, or straight from where it is on any other leg. **No switch point for a station
  > leg** (sites with none are skipped, stations can't be): the robot switches where it is.
- **Re-mount without a flourish:** `RobotBody` skips the orbiters' initial-mount attach and the
  arc decorator re-registers silently when the remount is a layer switch (a runtime
  `layerSwitching` set in the registry, cleared after mount).

  > **Shipped (Task 34).** `markLayerSwitching` / `isLayerSwitching` / `clearLayerSwitching` in
  > `robotMotionRegistry.ts`. The loop marks the robot just before it writes `layer`.
  > `useOrbiterMotion` (a child, so it mounts before `Robot`'s own mount) then shows the shown
  > corners docked at once, with no hop and no reduced-motion fade, in the world context only.
  > `onRobotMounted` always clears the mark and runs the leg's continuation, or adopts the robot if
  > the leg was dropped in between. `RobotBody` itself needed no change: its decorator registration
  > was already silent, and the halo and strip flicker play nothing on mount.
- **Fallback:** if J4 fails its gates, it doesn't merge: `BACK_HOSTS_ENABLED` stays false and
  background buildings don't host. *(Task 34 flipped it to true on `feature/jobs-depth`; the gate
  is Task 35.)*

### 1.11 Cards and content (J2)

- `src/content/copy/probe.ts`: `probe.status.docking` options become `docked · undocking · active ·
  recalled` ("Docked / Undocking / Active / Recalled"); `probe.job` gains `salvage` ("Salvage") and
  `maintenance` ("Maintenance") with lore lines; new `probe.status.activity` with the seven
  activities ("Charging / Exiting / In transit / Working / Waiting / Returning / Entering"). Lore
  lines in the copy-tone voice (`docs/reference/copy-tone-guide.md`); Crawford reviews the words.
- `robotSelectionConfig.ts`: `ACTIVITY_LABELS = optionsRecord('probe.status.activity')` beside
  `DOCKING_STATE_LABELS`; `JOB_TYPE_LABELS` reads `robot.job` directly.
- `RobotSelectionCard`: status line `{docking} · {activity} · {audibility}`. `RobotDisplaySection`:
  an Activity row after Docked Status. No change to the avatar's orbiters.

> **Shipped (J2, 2026-10-08; Task 25).** As above. `probe.status.activity`'s field lore is
> "OPERATIONAL PHASE", with ALL-CAPS option lore lines. Both the docking and the activity word on
> the card line are **held** at their widest label (`HeldWord`, a stacked grid cell), so nothing
> after them reflows. `ROBOT_SELECTION_ROW_SCHEMAS.activity` captions the detail row. Checkpoint C
> (2026-10-08) took the lore lines and the card-line gap as reviewed.

### 1.12 Performance rules

- Per robot, at most one live work timeline and one swim; no standing per-robot or per-building
  GSAP objects, no ticker callbacks (the Phase 40 +63 % lesson). Waiting is a finite tween.
- Charging robots are `autoAlpha: 0` (`visibility: hidden`) — out of the per-frame raster.
- Nothing in the static layers changes because of work; slot lights live in the moving layer.
- Store writes: activity/site/job/position on transitions only (a handful per robot per job), never
  per frame. `OceanScene` keeps subscribing to robot ids only; J4 adds a per-robot `layer` selector.

## 2. Target File Structure

```text
src/
├── types/Robot.ts                       # DockingState renamed; RobotActivity; JobType +2; fields §1.2
├── constants/index.ts                   # BATTERY_DRAIN_ACTIVE; job/station/loop constants; removals
├── systems/
│   ├── robotSystems.ts                  # §1.1 — flat drain, renamed effects, scoring removed
│   ├── lifecycleVisuals.ts              # §1.1 (J1) — onLifecycleChange + legacy adapter; deleted J2
│   ├── dockCycles.ts                    # §1.1 (J1) — the dock-cycle counter (drift + dock spot)
│   ├── lifecycleSim.ts                  # §5.2 (J1) — drain sim, loop/readiness sim
│   ├── siteChoice.ts                    # §1.7 (J1) — chooseNextSite, siteCooldown, heldJobs
│   ├── workLoop.ts                      # §1.7 (J2) — the loop (imports siteChoice.ts)
│   ├── jobHosts.ts                      # §1.3 — hostJobs, isWorkSiteEligible
│   ├── jobCoverage.ts                   # §1.4 — ensureJobCoverage
│   ├── workSites.ts                     # §1.5 — getWorkSite (factories; scenery via sceneryWorkAnchors)
│   ├── stations.ts                      # §1.6 — getStations, station assignment
│   ├── districtRecipes.ts               # + coverageTopUp per recipe (from Phase 42)
│   ├── districts.ts                     # placeDistrict calls ensureJobCoverage (from Phase 42)
│   ├── spawnSystem.ts                   # stationId at spawn; no direction/idle counter
│   ├── worldTransition.ts               # no assignJob; work-loop start/stop
│   ├── powerController.ts               # stopWorkLoop beside stopRobotLifecycle
│   ├── idleSystem.ts                    # DELETED
│   └── interactionSystem.ts             # DELETED
├── animation/
│   ├── robotMotionRegistry.ts           # §1.8 (J2)
│   ├── swimAnimation.ts                 # unchanged API
│   └── jobMoves/                        # §1.9 — jobDuration.ts (J1), moveTargets.ts, sceneToOrbiterLocal.ts,
│                                        #   hoverPulse/trace/ring/carry/fan.ts, buildJobTimeline.ts
├── components/
│   ├── actors/Factory.tsx               # staticVisual reads factoryGeometry()
│   ├── actors/factoryGeometry.ts        # extracted, pure
│   ├── actors/scenery/sceneryWorkAnchors.ts # §1.5 (J1) — per-kind scenery anchors
│   ├── actors/factoryBubbleProps.ts     # isActive: true (isOffline gone)
│   ├── robot/Robot.tsx                  # mount → onRobotMounted
│   ├── robot/RobotBody.tsx              # registers decorateArc; layer-switch remount flag
│   ├── robot/gem/useOrbiterMotion.ts    # lock/unlock, registry
│   ├── stations/ChargingStation.tsx     # §1.6 (J2)
│   ├── selection/RobotSelectionCard.tsx # §1.11
│   ├── robot/RobotDisplaySection.tsx    # §1.11
│   └── panels/screen/worldView/
│       ├── OceanScene.tsx               # stations (J2); layer split + per-layer robots (J4)
│       └── OceanScene.css               # pointer-events on .robot (J4)
├── content/copy/probe.ts                # §1.11
└── data/robotSelectionConfig.ts         # ACTIVITY_LABELS
docs/
├── specs/ROBOT_JOBS_AND_STATIONS.md     # this file
├── tasks/ROBOT_JOBS_AND_STATIONS.md     # the plan (next)
├── sketches/robot-charging-station.html # Task 0a: the station (rolls + enter/exit), done
├── sketches/robot-jobs-and-stations.html# Task 0b: the moves and jobs panel, done
├── ROBOT_LIFECYCLE.md                   # rewritten (J1 lifecycle, J2 stations/loop)
├── ANIMATION_SYSTEM.md                  # registry, job timelines, scene stack (J4)
├── BUILDING_DESIGN.md                   # hosts, work sites, coverage
├── ROBOT_DESIGN.md                      # line on job animations; layer scale
├── PROCEDURAL_GENERATION.md             # station.*, locale.coverage.x, work seeds; idle.* retired
├── PERFORMANCE.md                       # one dated gate section per branch
├── SESSION_STORAGE.md                   # "never persisted" list reasons
└── todo/roadmap.md                      # Phase 43 status; backlog item 8 archived on ship
CLAUDE.md                                # ROBOT_LIFECYCLE reference-doc line (no guardrail change)
```

Colocated tests for every new module; existing tests for deleted modules are deleted with them.

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. Robot identity and the gem body (`polygon.ts`, `gemPalette.ts`,
  the dials) are untouched apart from the listed hook changes.
- **Replay parity is a gate:** the World Clock prove-it test (`robotSystems.test.ts`) must pass with
  the narrowed snapshot; replay and live must still agree field-for-field on `docking`,
  `batteryLevel`, `dockingHoldUntilMeasure`, `melody` and `dockCycleCount`.
- **CLAUDE.md rules hold:** no `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask`
  for any timing here; timelines registered in `timelineMap` and killed on stop/unmount; GSAP
  callbacks never call `AudioEngine`; nothing non-serializable in Zustand; Visual Mapping guardrail
  unchanged; every display string in `src/content/`.
- **Ask first:** any change to the never-zero-Active invariant, pitch drift, the Audio Load Budget,
  or a guardrail; any new dependency; anything that would make a static scene layer repaint more
  than on the lighting tick.
- **Never:** store module-level loop state on `Actor` (re-renders every factory); add a standing
  per-robot repeat; let a visual timing decide `docking`.

## 4. Code Style & Architecture Conventions

Pure decision and geometry functions with injected randomness and clock; side effects in thin
shells. Match `robotSystems.ts`/`idleSystem.ts` section banners and doc-comment density.

```typescript
// ========================================
// SITE CHOICE (pure — docs/specs/ROBOT_JOBS_AND_STATIONS.md §1.7)
// ========================================
export interface SiteChoiceInput {
  robot: { id: string; job?: JobType; centre: Vec2 };
  sites: readonly { id: string; jobs: readonly JobType[]; park: Vec2; ready: boolean }[];
  /** Jobs held right now by other Active robots — the variety rule's input. */
  heldJobs: ReadonlySet<JobType>;
  rand: () => number;
}

export function chooseNextSite({ robot, sites, heldJobs, rand }: SiteChoiceInput): { siteId: string; job: JobType } | null {
  const ready = sites.filter((s) => s.ready);
  if (ready.length === 0) return null;

  if (robot.job) {
    const keep = nearest(robot.centre, ready.filter((s) => s.jobs.includes(robot.job!)));
    if (keep) return { siteId: keep.id, job: robot.job };
  }

  const counts = readySiteCountsByJob(ready);
  const unheld = [...counts.keys()].filter((j) => !heldJobs.has(j));
  const job = weightedPick(unheld.length > 0 ? unheld : [...counts.keys()], counts, rand);
  const site = nearest(robot.centre, ready.filter((s) => s.jobs.includes(job)))!;
  return { siteId: site.id, job };
}
```

- Constants with intent comments in `constants/index.ts` (`BATTERY_DRAIN_ACTIVE`,
  `JOB_BASE_SECONDS`, `JOB_WORK_RATE`, `COOLDOWN_*`, `WAIT_RETRY_SECONDS`, `STATION_*`,
  `BACK_LAYER_SCALE`, `PARK_CLEARANCE`, `BOB_PX`).
- Timeline keys: `work-${robotId}`, `station-${robotId}`, `swim-${robotId}` (existing),
  `bob-wait-${robotId}`.
- New dataIds are dot-namespaced and offset by index (docs/PROCEDURAL_GENERATION.md):
  `station.count`, `station.x`, `station.y`, `locale.coverage.x`. Retired: `idle.target.x.*`,
  `idle.target.y.*`.

## 5. Testing & Verification Requirements

### 5.1 Unit (Vitest, colocated; TDD, RED first)

- `robotSystems.test.ts`: renamed transitions; flat drain for every Active robot regardless of
  `job`; landing effects no longer write position/job or start swims and do call
  `onLifecycleChange`; invariant and pitch-drift tests unchanged; **prove-it replay updated and
  mutation-checked** (a re-introduced job surcharge must break it).
- `jobHosts.test.ts`: the §1.3 table; derelict override; offscreen rows; non-hosts.
- `jobCoverage.test.ts`: over the districts seed grid (121 seeds), every world satisfies ≥ 3 × ≥ 4
  on midground + foreground; top-ups deterministic; element budgets still hold.
- `workSites.test.ts`: `factoryGeometry` matches `Factory.tsx`'s rendered box; foreground points on
  or above the top outline; park inside world margins; determinism per actor id.
- `stations.test.ts`: count 2–3, spacing ≥ 480, no host overlap, determinism; load assignment never
  exceeds capacity; nearest-free selection.
- `siteChoice.test.ts` *(J1)*: `chooseNextSite` keeps the job when it can, prefers unheld jobs,
  weights by ready count (seeded `rand`), returns null when nothing is ready; `siteCooldown` clamps;
  `heldJobs` per correction 4.
- `workLoop.test.ts`: one robot
  per site; recall mid-job finishes then returns; recall in transit/waiting returns now; turn-back
  when Active lands before entry; `onRobotMounted` for each docking state; `stopWorkLoop` kills every
  key; callbacks never touch `AudioEngine` (spy).
- `robotMotionRegistry.test.ts`, `useOrbiterMotion.test.tsx`: lock suppresses reconcile; unlock
  catches up to the current count in one pass, not per change.
- `jobMoves/*.test.ts`: `sceneToOrbiterLocal` round-trips through the real transform chain;
  each move's targets; `jobDuration` table; per-robot variation deterministic per `gemSeed`.
- `findLayerSwitchPoint.test.ts` (J4): first clear point; null when none.
- Content: `content.test.ts` passes with the new keys; no literals in components.

### 5.2 Headless sims (J1, stop and report)

- **Drain:** `replayLifecycle` over the seed grid at the current per-job drain vs flat 5/6/7 —
  pick the integer whose mean Active count is closest; record the table in docs/ROBOT_LIFECYCLE.md.
- **Readiness:** simulate the loop's decisions (pure `chooseNextSite` + `siteCooldown` + fixed job
  and swim durations) for 10 simulated minutes per seed; report mean and p95 time in `waiting` and
  how often a robot switches jobs; pin the `COOLDOWN_*` constants. Target: mean waiting < 10 % of
  active time, no robot waiting > 15 s.
- **Handoff:** lifecycle at 20 and 200 BPM with recorded swim/job durations — count turn-backs and
  confirm no robot is ever both `charging` and visible.

*(J1 results.)* **Drain:** flat 6 (mean Active 5.14 against the old rule's 5.05), confirmed
2026-10-07; table in docs/ROBOT_LIFECYCLE.md. **Readiness + handoff** (one sim, `runLoopSim` /
`runReadinessSim`, 121 seeds × 600 s at 20 and 200 BPM). The first-guess cooldown 0.6/4/30
missed: mean waiting 10.9 % at 20 BPM, longest wait 42 s. Crawford chose **0.4/3/30**, which gives
mean waiting 6.4 % / 3.7 % at 20 / 200 BPM and a 14 s longest wait at 200 BPM. **The "no wait
> 15 s" target can't be met at 20 BPM by any cooldown, zero included** (34 s at 0.4/3/30, accepted).
Waits there are measure-bound: when more robots are Active than there are sites, only a recall
frees one, and at 20 BPM a measure is 12 s. There are zero "charging while visible" cases and zero
turn-backs at both tempos. Turn-backs can't happen with these battery constants: the shortest
Docked stay (~20 measures) outlasts the longest walk home. At 200 BPM a robot can still be visibly
heading home up to ~17 s after it lands on Docked, which §1.7's `'docked'` rule allows. Full table:
plan Task 15.

*(Task 16b re-run, 2026-10-07.)* Jobs are now `jobDuration(bpm)`, 6–10 s, so the readiness sim
was re-run at 20, 110 and 200 BPM (121 seeds × 600 s). Longer jobs lowered waiting rather than
raising it, and roughly halved job switches per stint (3.92 → 1.52 at 20 BPM on 0.4/3/30). The old
pick went 1 s over the 15 s cap at 200 BPM. Crawford chose **0.3/2/30**:

| Cooldown | BPM | Mean waiting | p95 waiting | Longest wait | p95 wait | Switches / stint | Seeds missing a target |
|---|---|---|---|---|---|---|---|
| **0.3/2/30 (shipped)** | 20 | 1.2 % | 5.6 % | 20.0 s | 8.0 s | 1.40 | 4 / 121 |
| **0.3/2/30 (shipped)** | 110 | 1.2 % | 5.6 % | 14.0 s | 6.0 s | 0.36 | 1 / 121 |
| **0.3/2/30 (shipped)** | 200 | 1.3 % | 6.8 % | 10.0 s | 6.0 s | 0.23 | 1 / 121 |
| 0.4/3/30 (Task 15 pick) | 20 | 1.9 % | 7.7 % | 35.1 s | 6.1 s | 1.52 | 7 / 121 |
| 0.4/3/30 (Task 15 pick) | 110 | 1.8 % | 8.2 % | 14.0 s | 6.0 s | 0.44 | 1 / 121 |
| 0.4/3/30 (Task 15 pick) | 200 | 2.2 % | 8.9 % | 16.0 s | 6.0 s | 0.26 | 5 / 121 |

Turn-backs and "charging while visible" stay 0 everywhere. Full table: plan Task 16b.

### 5.3 Static checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build` — clean on every branch.

### 5.4 Perf gates (per branch, stop and report)

Method as docs/PERFORMANCE.md "Gem Polygon Robots — the Task 9 idle-paint gate": production builds
side by side, one pinned `?session=` world, `perf:idle --throttle 1 --only none`, rotated rounds,
same session. J1 is near-invisible (no visual change beyond robots' first moves) — gate on busy only.
J2/J3: busy and Paint within the 17.2.5 noise band of the branch's base, or stop and report with
per-element counts. J4: same, plus the extra compositor layers' memory noted; Crawford's Pixel run
is its gate.

### 5.5 Crawford's gates

- **Sketch gate** (before J1 code): `docs/sketches/robot-jobs-and-stations.html` — the five moves on
  two host types at 1×, a station enter/exit with the halo ripple and the placeholder station.
  Constants that pass become this spec's values. *(As run: split. Task 0a, the station, passed
  2026-10-07 in `docs/sketches/robot-charging-station.html` — §1.6 carries its values. Task 0b,
  the moves and jobs, passed 2026-10-07 in `docs/sketches/robot-jobs-and-stations.html` — §1.9
  carries its values, with one change of direction: duration follows BPM, not orbiter count.)*
- **J2/J3/J4 live:** a few worlds; can he tell what each robot is doing; no long waits; no pops at
  stations or layer switches. **Pixel listen:** no new dropouts — the hard line.
- **Halo gate:** Phase 41's deferred halo/ripple visual gate re-runs at J2 with its original
  wording, now that `decorateArc` has a caller.

## 6. Git & Workflow Context

- Crawford handles merges; agents commit one task per commit (TDD, RED first) on the branch named
  in the plan. Short imperative messages ending with the session's attribution line.
- Branches, each from the previous tip (J1 from districts D2's merge): `feature/jobs-lifecycle`
  (J1), `feature/jobs-loop` (J2), `feature/jobs-moves` (J3), `feature/jobs-depth` (J4). The sketch
  lands on `planning/jobs-locales-docking` or J1's first commit.

## 7. Open Questions

1. ~~**Station design** — Crawford's drawing arrives via the sketch; until then a placeholder gem.~~
   *Resolved (Task 0a, 2026-10-07):* the four-layer rotated-triangle gem in §1.6. Still open from
   that sketch: depth tint on/off and opacity, swim speed, back-row scale, enter/exit sides, and
   whether the port stays at the centre.
2. ~~**Coverage top-up lists** — written per recipe once D2's real hosts exist; wreck field first.~~
   *Resolved in J1 (Task 12):* lists for every district, led by midground pylons; see §1.4.
3. **J4 re-mount cost** — a layer switch re-mounts the robot (orbiter/halo/flicker hooks re-init).
   If that reads as a hitch at 1×, the alternative (one robot layer, midground occlusion by
   clipping) is a stop-and-report, not a silent swap.
4. **Lore copy** for Salvage, Maintenance and the seven activities — Crawford reviews.
5. **`BATTERY_DRAIN_ACTIVE`, cooldown constants, job rates** — pinned by §5.2 and the sketch.
   *J1:* drain 6 and cooldown 0.4/3/30 pinned. *Task 0a:* `STATION_ARC_SECONDS` = 1.0 and the
   station box 200 × 200 pinned (code moves at T20). *Task 0b:* `jobDuration(bpm)` 6–10 s,
   orbiter coupling cut, `JOB_WORK_RATE`/`JOB_MIN_SECONDS` retired, `ATTACH_DURATION` 1 s (code
   moved at Task 16b). *Task 16b:* the readiness re-run moved the cooldown to 0.3/2/30.
   **Resolved.**
6. *(Raised in J1.)* **Background Skyscraper parks** clamp below the roof (§1.5) — J4 decides:
   drop such sites or park beside them.
