# Animation System Guide

## Overview
Animation in Trace Atlas is driven by GSAP and SVG transforms. The runtime is centered around a small set of helpers rather than a large abstraction layer:

- [src/animation/timelineMap.ts](../src/animation/timelineMap.ts) manages timeline lifecycle
- [src/utils/refs.ts](../src/utils/refs.ts) stores top-level SVG refs for helpers outside React
- [src/animation/swimAnimation.ts](../src/animation/swimAnimation.ts) contains the reusable robot swim timeline pattern
- [src/animation/robotMotionRegistry.ts](../src/animation/robotMotionRegistry.ts) lets the work loop reach React-owned robot motion (the halo arc, the orbiter lock)
- [src/animation/jobMoves/](../src/animation/jobMoves/) builds a working robot's job timeline, and [src/animation/stationRipple.ts](../src/animation/stationRipple.ts) a charging station's ripple
- [src/animation/layerSwitch.ts](../src/animation/layerSwitch.ts) finds where a robot may change robot row on a leg

The robots' motion is driven by the work loop, [src/systems/workLoop.ts](../src/systems/workLoop.ts) (Roadmap Phase 43); what it decides and when is in [ROBOT_LIFECYCLE.md](ROBOT_LIFECYCLE.md). This file covers the timelines it plays.

## Core Architecture

### Timeline registry
The timeline registry is a simple string-keyed map:

```typescript
export function setTimeline(id: string, timeline: Timeline): void {
  const existing = timelineMap.get(id);
  if (existing) {
    existing.kill();
  }

  timelineMap.set(id, timeline);
}

export function killTimeline(id: string): void {
  const timeline = timelineMap.get(id);
  if (timeline) {
    timeline.kill();
    timelineMap.delete(id);
  }
}
```

Two more exports exist alongside these: `getTimeline(id): Timeline | undefined` (plain lookup, no side effect) and `killAllTimelines(): void` (kills and clears every entry — used for full teardown/reset).

This is the supported pattern for keeping timelines out of React state and cleaning them up reliably.

### Ref registry
Top-level components register SVG elements with `setRef(key, element)` and animation helpers read them later with `getRef(key)`. This is how modules such as swim animation and the work loop find robot DOM nodes (`robot-${id}`) and a charging station's ripple (`station-front-${stationId}`) without coupling them to React render state. Two cleanup exports also exist: `deleteRef(key): void` (remove one) and `clearRefs(): void` (remove all — testing/reset).

## Current Runtime Pattern

### Swim animation
The reusable animation helper is [src/animation/swimAnimation.ts](../src/animation/swimAnimation.ts):

```typescript
function createSwimTimeline(
  robot: Robot,
  destination: Vec2,
  onComplete?: (robotId: string) => void,
): gsap.core.Timeline
```

Constants: `SWIM_SPEED = 120` px/s (duration = distance / SWIM_SPEED) · `TILT_ANGLE = 5` degrees.

Robots have no discernible front (Roadmap Phase 40, `docs/specs/ORBITING_POLYGONS.md` §1.6) — no
`scaleX` flip, no `targetDirection` parameter, no orientation phase to wait on; propulsion starts
at position 0 every time. The gem-polygon robots (Roadmap Phase 39) also have no propeller, so
there is no rotation tween for one.

Its caller is the work loop, for every leg to a work site's park or a station port. The leg's
`onComplete` writes the robot's `position` (the destination) and then continues the loop.

Sequence:
- Resolves the robot SVG via `getRef(`robot-${robot.id}`)`. **If the ref isn't registered yet**, the function still returns an (empty) timeline and schedules `onComplete` via `gsap.delayedCall(estimatedDuration, ...)` so callers waiting on the callback don't hang.
- Kills any existing `swim-${robot.id}` timeline, sets `transformOrigin: '50% 50%'` once (the tilt below rotates about the centre).
- Animates to the destination over `distance / SWIM_SPEED` seconds, starting at position 0, eased `sine.inOut` (every leg starts and ends at rest).
- Applies a body tilt (`± TILT_ANGLE`, direction-dependent) that ramps in over the first 30% of the duration and back out over the last 30%.
- Stores the timeline in `timelineMap` under `swim-${robot.id}` and plays it (it's created `paused: true` so it can be registered before playing).

### Orbiter attach/detach — a worked key family
[src/components/robot/gem/useOrbiterMotion.ts](../src/components/robot/gem/useOrbiterMotion.ts)
(Roadmap Phase 40, `docs/specs/ORBITING_POLYGONS.md` §1.4) is a small reference for a hook that owns
several related keys per instance, not just one:

- **Master key** `orbiters-${context}-${robotId}` — one per rendered instance (the world and the
  avatar show the same robot at once; `setTimeline` kills a duplicate key on remount). It registers
  a lightweight `{ kill: () => {} }` stub, not a real `gsap.timeline()` — nothing is ever added to
  it, so a genuine timeline object would just be a standing, never-used GSAP allocation per robot
  per context. `timelineMap`'s contract only ever calls `.kill()` on what's stored, so a stub
  satisfies it.
- **Size-tween key** `orbiter-size-${context}-${robotId}` — `setTimeline` re-targets this one on
  every `size` dial edit rather than stacking a second tween, the standard "one key per concern"
  pattern this file's intro recommends.
- **No per-element key at all for the attach/detach hop itself** — each corner's `gsap.to()` is
  tracked in a local `Map<corner, killFn>` inside the closure, killed on unmount alongside the
  tracked keys above, but never registered in the shared `timelineMap`. A hook-local resource that
  never outlives its own effect doesn't need a globally-addressable key; only resources another
  module might need to find or kill (`killAllTimelines()` on a world transition, a debug inspector)
  belong in `timelineMap`.
- **Coordinating two sources of the same animation** — a spawn/despawn arc can be triggered by a
  live count-dial edit (queued, one at a time, via an `arcInFlightRef` boolean) *or* by the initial
  mount (every initially-shown corner flies in at once, deliberately not queued — a robot "powering
  up"). A plain `Set<number>` of busy corners, written at the start of either path and cleared on
  completion, is the single source of truth `reconcile()` checks before picking a target — cheaper
  and more robust than teaching the queued path's own boolean about the unqueued path's parallelism.
- **The lock** (Phase 43) — while a robot works, the job owns its orbiters, so the hook can be
  locked: see "Robot motion registry" below.

### Robot motion registry
[src/animation/robotMotionRegistry.ts](../src/animation/robotMotionRegistry.ts) (Phase 43, spec
§1.8) is the work loop's only bridge to motion that React owns, keyed by robot id, the same shape
as `refs.ts`:

- `registerArcDecorator(robotId, fn)` / `getArcDecorator(robotId)` / `deleteArcDecorator(robotId, owner?)`
  — `RobotBody` registers its world-context `decorateArc` (from `useHaloMotion`, memoised so an
  audio edit doesn't re-register it). The work loop calls it on every station arc, so the halo
  ripple rides on the arc's own timeline.
- `registerOrbiterWork(robotId, control)` / `getOrbiterWork(robotId)` / `deleteOrbiterWork(robotId, owner?)`
  — `useOrbiterMotion` (world context only) registers `{ lock(), unlock() }`. `lock()` finishes
  any attach/detach hop in flight (`progress(1)`), makes `reconcile()` return early and returns the
  shown `.gem__orbiter-local` groups at rest, in `cornerOrder`. Count changes while locked still
  update the target count. `unlock()` clears the lock and reconciles once, so the orbiters catch up
  to the current count without replaying each change.

Cards and the detail avatar never register, so a lookup always means the robot drawn in the
world. Deletes are **owner-checked**: an entry is removed only if it is still that owner's, so an
old mount's cleanup running after a remount can't strip the new entry. Both registrations run in a
`useLayoutEffect`: `Robot.tsx`'s mount is a layout effect too (`useGSAP`) and can play the exit arc
at once, and a passive effect would register too late for it.

### Job timeline
[src/animation/jobMoves/buildJobTimeline.ts](../src/animation/jobMoves/buildJobTimeline.ts) (spec
§1.9) builds **one paused timeline per job run**, keyed `` `work-${robotId}` ``, lasting exactly
`jobDuration(bpm)` (10 s at 20 BPM to 6 s at 200 BPM, the live tempo read at job start):

- **The bob** — the robot's `.robot` group moves ±`BOB_PX` (6) in whole cycles of about
  `BOB_CYCLE_SECONDS` (1.2), so it ends where it started.
- **Detach** — each locked orbiter flies from its dock to its target over `ATTACH_DURATION`
  (1 s). Targets are scene points mapped into the orbiter's own frame by `sceneToOrbiterLocal`
  (which inverts the robot translate, the `g.gem` scale about its centre and the corner's dock
  offset), so the output is the GSAP `x`/`y` of `.gem__orbiter-local`; `{ x: 0, y: 0 }` is docked.
- **The moves** — the job's row of `JOB_MOVES`, in order, each in its own window. See "Job moves"
  below.
- **Reattach** — back to `x: 0, y: 0` over `ATTACH_DURATION`. The flights sit inside the duration,
  not on top of it.
- **The counter-bob** — the orbiters live inside the `.robot` group, so the bob would carry a
  detached orbiter off its target. Each orbiter's `.gem__orbiter` copy group gets the same bob
  inverted and divided by the gem scale, so a detached orbiter holds still in the scene. The bob is
  zero at both ends, so a docked orbiter still rides with the body.
- **Reduced motion** — no bob and no flights: the robot's opacity dips 1 → 0.8 → 1 once per cycle,
  and the orbiters stay docked.

The caller (the work loop) locks the orbiters before building and unlocks them in its
`onComplete`; the timeline's only callback is that `onComplete`, never `AudioEngine`. Stopping the
loop runs a job to its end without the callback (`progress(1, true)`), so the orbiters are docked
and the bob at rest before the unlock.

### Job moves
[src/animation/jobMoves/](../src/animation/jobMoves/) (Phase 43 J3, spec §1.9) holds five moves.
Each is a pure target function plus an `add…` builder that puts tweens on the job timeline for the
locked orbiter groups. The targets are scene points; `buildJobTimeline` maps them into each
orbiter's frame with `sceneToOrbiterLocal`, so every tween is a plain `x`/`y`/`scale`/`opacity`
tween on `.gem__orbiter-local`, with no `onUpdate`. Seeks and the silent finish therefore land
exactly.

| Move | Builder (file) | What the orbiters do | Constants |
|---|---|---|---|
| `hoverPulse` | `addHoverPulse` (`hoverPulse.ts`) | gather on a ring round a site point, spaced by slot, and pulse in turn | `HOVER_GATHER_RADIUS` 14 u, `HOVER_PULSE_SCALE` 1.3 |
| `trace` | `addTrace` (`trace.ts`) | run a site path vertex to vertex at constant speed, each starting a stagger after the one before; wait on the first vertex before their turn and hold the last after it | `TRACE_STAGGER` 0.12 of the move |
| `ring` | `addRing` (`ring.ts`) | circle a site point, evenly phased, as a polyline of 15° chords | `RING_RADIUS` 24 u, `RING_RADIUS_JITTER` 0.15, `RING_REVOLUTIONS` 1.5, `RING_SEGMENTS` 36 |
| `fan` | `addFan` (`fan.ts`) | spread over an arc above a site point, left to right by slot, then ping in turn | `FAN_RADIUS` 40 u, `FAN_SPREAD_DEG` 120, `FAN_PING_SCALE` 1.5 |
| `carry` | `addCarry` (`carry.ts`) | side by side, shrink at one point (by 10 % of the move), carry to a second (45 %), set down and grow back (55 %), return (90 %), hold | `CARRY_SHRINK` 0.7, `CARRY_SPACING` 8 u |

Shared pieces: `addPolylineRun` (`trace.ts`) tweens vertex to vertex at constant speed for both the
trace and the ring, and `traceRoute` drops repeated vertices so no segment has zero length.
`addPulsesInTurn` (`hoverPulse.ts`) is the in-turn pulse that `addHoverPulse` and `addFan` share.
Maintenance's **spark flicker** (`addSparkFlicker`, `ring.ts`) rides on its ring: each orbiter's
`FLICKER_SPARKS` (3) draws land on chords (`sparkChords`, deduped), and on each one the orbiter
dips to opacity `FLICKER_OPACITY` (0.25) at the chord's middle and is back by its end.

**Which job runs which moves** is `JOB_MOVES` (`jobMoveTable.ts`), spec §1.9's table as data. Steps
name their targets by index: `points[0]` is the site's main point, Fluid Monitoring's valve is
`points[1]`, and Salvage carries `points[0]` → `points[1]`. `stepPoint` and `stepPath` resolve them,
and a `trace` of `pipe` on a site without one traces its `outline`. What each index is on each
host is in [BUILDING_DESIGN.md](BUILDING_DESIGN.md#jobs-hosts-and-moves).

| Job | Moves |
|---|---|
| `ventExtraction` | hoverPulse(`points[0]`) |
| `acousticSurvey` | fan(`points[0]`) → ring(`points[0]`) |
| `structuralInspection` | trace(`outline`) |
| `fluidMonitoring` | trace(`pipe`, else `outline`) → hoverPulse(`points[1]`) |
| `salvage` | carry(`points[0]` → `points[1]`) |
| `maintenance` | ring(`points[0]`) with the spark flicker |

**Timing.** `moveWindows(count, duration)` splits the time before the reattach equally between the
moves. The first move's approach is the detach (`ATTACH_DURATION`, capped at 40 % of its share,
which never binds at today's 6–10 s jobs). Each later move flies the orbiters from where the last
one left them to its own first targets in min(`MOVE_APPROACH_MAX_SECONDS` 0.35,
`MOVE_APPROACH_FRACTION` 0.25 × its share).

**Per-robot variation.** `workVariation(gemSeed)` (`variation.ts`) draws from the
robot's own Alea stream, keyed `` `${gemSeed}:work` ``, in this order: `order` (a shuffle of the four corners: who pulses
first, who leads a trace), `ringDirection` (±1), `radiusScale` (1 ± `RING_RADIUS_JITTER`),
`traceReversed`, `phase` (where the gather and the ring start round their point), then `sparks`
(Maintenance's flicker places, indexed by corner, so an orbiter keeps its sparks at any count). New
draws go at the end so no existing robot's take moves. `turnRanks(order, shown)` turns the order
into each shown orbiter's turn. Company members that look alike therefore work differently. The fan
doesn't turn with the phase: it always opens upward over the site.

Every move ends each orbiter at its rest scale and opacity, so the reattach only flies them home.
Reduced motion runs no move at all (see "Job timeline").

### Station arcs
A robot enters and leaves a charging station through one arc timeline, keyed
`` `station-${robotId}` `` (`workLoop.ts`'s `stationArc`), over `STATION_ARC_SECONDS` (1 s):

| Arc | Scale | Opacity (`autoAlpha`) | Ease (scale) |
|---|---|---|---|
| Exit (`'spawn'`) | `STATION_PORT_SCALE` (0.15) → 1 | 0 → 1 | √v, so the robot blooms out of the port |
| Entry (`'despawn'`) | 1 → 0.15 | 1 → 0 | `power1.in` (v²) |

The exit plays in the **back robot row** (Phase 43 J4, spec §1.6), between the station's back
plate (L4) and L3. A robot not already there is hidden at the port and moved to the back row
first (a layer switch with nothing to dissolve, see "Layer switch" below), and the arc plays on
the re-mounted body with `.robot__row` at `BACK_LAYER_SCALE`, so the robot grows from 0.11 to
0.75 overall. Its next leg to a front-row site or a station is then an ordinary back → front
switch. The entry plays in the front row, between L3 and L2.

Opacity is linear both ways, and the robot's halo ripple is added to the same timeline by its
registered `decorateArc(kind, duration, tl)` (outward on exit, inward on entry). Beside it,
`playStationRipple(stationId, kind, color, duration)` plays the station's own ring in the moving
robot's identity colour, keyed `stationRippleKey(stationId)` = `` `station-ripple-${stationId}` ``.
It animates the circle and gradient that `ChargingStation`'s front fragment draws (all clear at
rest) and finds through the `station-front-${stationId}` ref. A ripple already running wins and
the new one is skipped, so twelve robots exiting at world open play one. A charging robot is left
at `autoAlpha: 0` (`visibility: hidden`), out of the per-frame raster.

Reduced motion: both arcs are a `STATION_REDUCED_ARC_SECONDS` (0.3 s) opacity fade at scale 1,
with the halo decorator still called and no station ripple.

The station itself never animates: its geometry dials follow the global Audio Rig through React
renders, not tweens (spec §1.6).

### Layer switch
A robot works in one of two robot rows (Phase 43 J4, spec §1.10): the front row (`robots`), or
the back row (`robots-back`, behind the midground) while its destination is a background site or
it is exiting a station. `Robot.layer` (`'background'`, else front) says which, and `OceanScene`
renders each robot in its row's list, so a change of row is a React **re-mount**. The scene
stack is under "Scene layers" below.

- **The row scale.** The back row is drawn `BACK_LAYER_SCALE` (0.75) smaller. The scale is on
  `.robot__row`, a wrapper inside `Robot.tsx`'s `.robot` group, set with `svgOrigin` at the gem
  canvas centre. That is the point `g.gem` scales about, so the body scale and the row scale
  compose the way `sceneToOrbiterLocal` assumes (`.robot`'s own origin is its bounding box, and
  it carries the swim's `x`/`y` and tilt). The loop eases it `sine.inOut` over a swim into the
  other row, or straight from where it is on any other leg, and places it at once on adoption.
  The job timeline gets the row's scale too (`layerScale`).
- **The switch point.** `findLayerSwitchPoint(from, to, robotBox, midgroundBounds)` (pure,
  `layerSwitch.ts`) returns the first point on the straight leg, sampled every
  `LAYER_SWITCH_STEP` (20), that starts a **clear run**: the robot's box, `robotBoxAt(gem,
  bodyScale)`, overlaps no midground silhouette from there for as far as the second swim carries
  it in `LAYER_DISSOLVE_SECONDS` (1 s), `dissolveRunLength(remaining)`, or to the leg's end if it
  gets there sooner. The silhouettes are everything solid between the two rows,
  `getMidgroundSilhouettes` in `src/systems/midgroundSilhouettes.ts`: midground factory bodies and
  rooftop greebles, all midground scenery, pipe bridges and the ground line's steps, measured from
  the renderers' own JSX. Bubbles, vent plumes and floodlight beams are not silhouettes. A site
  with no switch point is skipped for that decision. A station leg with none switches where the
  robot is, since a robot can't skip going home.
- **The split leg.** The work loop's `legTo` swims to the switch point at the current row's
  scale, then on to the destination, each swim from rest. Front → back: at the switch point the
  robot moves to the back row (`moveToRow`), and once it has re-mounted it swims on, easing to
  0.75. Back → front: the robot stays in the back row and swims on, easing to 1; it re-mounts in
  front only when the swim and the dissolve are both done, at rest.
- **The dissolve.** The haze between the rows (tints B and C, 40 %) would pop at a re-mount, so
  for `LAYER_DISSOLVE_SECONDS` the robot is drawn twice. The copy is an SVG `<use>` of the
  robot's group (`#world-robot-{id}`), appended by the loop to `OceanScene`'s
  `#robot-dissolve-layer` (front row, after `#robot-layer`, found via
  `getRef('robot-dissolve-layer')`) and marked `data-dissolve-copy`. A `<use>` follows the live
  transforms of the group it points at across the two `<svg>`s. In both directions the **front
  copy fades and the back robot stays opaque**: 1 → 0 after a front → back switch, 0 → 1 before a
  back → front re-mount, after which the opaque copy goes. The fade is linear, keyed
  `` `dissolve-${robotId}` ``; a new dissolve ends the robot's earlier one first, and a fade's end
  removes only its own copy. It has no reduced-motion variant (it is already an opacity fade).
- **The re-mount.** `moveToRow` marks the robot (`markLayerSwitching` in
  `robotMotionRegistry.ts`), stores the leg's continuation in the run's `remounts`, and writes
  `layer`. On the new mount `useOrbiterMotion` (world only) sees `isLayerSwitching` and shows the
  orbiters docked at once, with no attach hop. `Robot.tsx` then calls `onRobotMounted`, which
  clears the mark (`clearLayerSwitching`) and runs the continuation, or adopts the robot if its
  leg was dropped in between. With no body mounted there is nothing to re-mount and the leg goes
  straight on.
- **Interruptions.** A recall or turn-back drops the leg (`dropLeg`: the swim, the bob and the
  dissolve go, and a pending re-mount adopts instead of continuing). `stopWorkLoop` removes every
  copy and forgets every pending re-mount.

`BACK_HOSTS_ENABLED` (true) is the switch for the whole row: false puts the world back to
midground and foreground hosts only, and with no background destination no robot changes row
except on a station exit.

### Robot timeline keys
Every robot key in `timelineMap`, and who kills it:

| Key | Owner | Lives | Killed by |
|---|---|---|---|
| `` `swim-${robotId}` `` | `swimAnimation.ts` via the work loop | one leg | the next swim (`setTimeline`), a recall in transit, a turn-back, `stopWorkLoop` |
| `` `work-${robotId}` `` | `buildJobTimeline` | one job | its own end; `stopWorkLoop` finishes it silently first |
| `` `bob-wait-${robotId}` `` | the work loop's wait | one `WAIT_RETRY_SECONDS` bob | its own end, a recall, `stopWorkLoop` |
| `` `station-${robotId}` `` | the work loop's `stationArc` | one arc | its own end, `stopWorkLoop` |
| `` `station-ripple-${stationId}` `` | `stationRipple.ts` | one ripple | its own end, `stopWorkLoop` (it matches `station-`) |
| `` `dissolve-${robotId}` `` | the work loop's `dissolve` | one layer-switch fade | its own end, the robot's next dissolve, a recall or turn-back (`dropLeg`), an adoption (`killLegs`), `stopWorkLoop` — each removes the `<use>` copy too |
| `` `orbiters-${context}-${robotId}` `` | `useOrbiterMotion` | the mount | unmount (a no-op stub, see above) |
| `` `orbiter-size-${context}-${robotId}` `` | `useOrbiterMotion` | one Size tween | the next Size edit, unmount |
| `` `halo-${context}-${robotId}` `` | `useHaloMotion` | one halo-dial tween | the next dial change, unmount |

`stopWorkLoop` kills every `work-`, `swim-`, `bob-wait-`, `station-` and `dissolve-` key
(`LOOP_KEY_PREFIXES`; power-off, and before every `startWorkLoop` in `initializeLocale`), removes
every dissolve copy and clears every pending layer-switch mark. Per robot there is at most one live job and one swim,
and no standing per-robot or per-building GSAP object (spec §1.12). A robot with no mounted body
gets a target-less timeline of the same length under the same key, because `createSwimTimeline`'s
no-ref fallback is an unkeyed `delayedCall` that `stopWorkLoop` couldn't find.

### Scene layers — what may move where
The ocean scene (`OceanScene.tsx`) is six stacked `<svg>` layers that share one viewBox and `xMidYMid slice` fit, each named by its `data-scene-layer` (Phase 43 J4 split the old back layer around a second robot row, spec §1.10). Back to front:

| Layer | Moves? | Contents |
|---|---|---|
| `back` | static | water column, light shafts, the terrain ridge, background factories/scenery and pipe bridges, tint A |
| `robots-back` | moving | `#station-l4-layer` (each station's back plate), `#robot-back-layer` (robots whose `layer` is `'background'`) |
| `mid` | static | tint B, midground factories/scenery and pipe bridges, tint C, the ground line |
| `bubbles` | moving | every building's and vent's bubbles |
| `robots` | moving | `#station-l3-layer`, `#robot-layer` (every other robot), `#robot-dissolve-layer` (layer-switch copies), `#station-front-layer` |
| `front` | static | tint D, foreground factories/scenery and pipe bridges |

The four **depth tints** (`DEPTH_TINTS`, full-screen `rect[data-depth-tint]`, each a gradient `#depth-tint-{slot}` defined in the layer that draws it) replaced the old two gradients. A is 0.06 and B 0.25 (`#0c1c4f` → `vent.shadow`), C 0.20 and D 0.10 (`vent.shadow`). Coverage, 1 − Π(1 − α): background buildings 49 %, back-row robots 46 %, midground 28 %, front-row robots, stations and bubbles 10 %, foreground 0. Only B and C sit between the robot rows, so a row switch gains or loses 40 % haze, which the dissolve blends. The haze is the scene's, not a robot overlay. No layer takes clicks (`pointer-events: none`); `.robot` takes them, in either row.

The moving layers carry `will-change: transform` (OceanScene.css) and are compositor layers of their own, so a per-frame transform write repaints only them. This is a roadmap 17.2.5 finding, not a style choice: with everything in one `<svg>`, every GSAP write re-rasterized all sixty factories at full viewport size on every frame. Chrome also promotes `mid`, which is static but painted above a composited layer; the J4 perf gate measured the two extra layers at about +31 ms paint per 6 s window and ≈ +17 MB on a Pixel 8, accepted (docs/PERFORMANCE.md "Robot Jobs J4"). Two rules follow:

`TerrainLayer` (the ridge/ground polygons) and `WaterColumn` (the gradient + surface glow) are
static-layer content, same as the factories: both re-fill on the once-a-second lighting tick only
(`activeLocaleLocalTime` → `getLighting`, whole-percent rounding), never per frame and never via a
CSS `transition` (roadmap Phase 42, docs/specs/WORLD_VIEW_DISTRICTS.md §1.3/§1.5).

`LightShafts` (Phase 42 D3, back layer, §1.12) is the same static-layer content, on the same
lighting tick. A moving variant was tried for the atmosphere layer's other element, `MarineSnow`
(continuous per-circle drift, a teleport, an opacity-only twinkle) and perf-measured against this
section's own rule before Crawford cut the element on visual grounds, not cost — see
docs/PERFORMANCE.md's Task 21 follow-up. The twinkle shape read as the cheapest and least
bug-like of the three (opacity-only, no position write), so a future "drift the snow" idea, if ever
revisited, is a moving-layer addition and must clear the same idle-paint gate this section
describes before it ships, not after.

- Anything that moves every frame goes in a moving layer (robots and station fragments in the two robot layers, bubbles in `BubbleLayer`), never inside the static factory layers.
- No CSS `transition`/`animation` on scene SVG fills or attributes — a running transition style-invalidates its element every frame, which is how the old `fill 4.8s` lighting fade kept the whole scene repainting. Lighting steps once a second instead.

Measure with `npm run perf:idle` before and after any change to what moves in the scene (docs/PERFORMANCE.md, "Idle paint & composite").

### UI and system animations
Other systems follow the same model:

- [src/components/ui/physical/PowerRockerSwitch.tsx](../src/components/ui/physical/PowerRockerSwitch.tsx) for SVG button/transport animations
- [src/components/actors/BubbleStream.tsx](../src/components/actors/BubbleStream.tsx) for looping particle effects

These modules register timelines in the shared map and clean them up during teardown.

## Contributor Rules

- Keep timelines and refs outside Zustand and React state.
- Prefer GSAP timelines over `setInterval` or `requestAnimationFrame` for motion.
- Use transforms such as `x`, `y`, `rotation`, and `scale` rather than layout properties.
- Keep semantic state changes in handlers; do not schedule audio directly inside GSAP timeline callbacks.
- Kill timelines on unmount or teardown when the owning entity is removed.

## What to Avoid

- Storing timelines in component state or Zustand
- Creating one-off animation loops with `requestAnimationFrame`
- Animating `width`, `height`, or other layout-affecting properties
- Triggering audio directly from timeline callbacks
- Leaving timelines running after cleanup

## Audit Checklist

- [ ] Timeline references live in the shared registry
- [ ] SVG refs are registered through `setRef` / `getRef`
- [ ] Cleanup uses `killTimeline` when the entity is removed
- [ ] Motion uses GSAP transforms instead of layout changes
- [ ] Audio scheduling stays outside animation callbacks
