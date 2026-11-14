# Animation System Guide

## Overview
Animation in Trace Atlas is driven by GSAP and SVG transforms. The runtime is centered around a small set of helpers rather than a large abstraction layer:

- [src/animation/timelineMap.ts](../src/animation/timelineMap.ts) manages timeline lifecycle
- [src/utils/refs.ts](../src/utils/refs.ts) stores top-level SVG refs for helpers outside React
- [src/animation/swimAnimation.ts](../src/animation/swimAnimation.ts) contains the reusable robot swim timeline pattern
- [src/animation/robotMotionRegistry.ts](../src/animation/robotMotionRegistry.ts) lets the work loop reach React-owned robot motion (the halo arc, the orbiter lock)
- [src/animation/jobMoves/](../src/animation/jobMoves/) builds a working robot's job timeline, and [src/animation/stationRipple.ts](../src/animation/stationRipple.ts) a charging station's ripple
- [src/animation/layerSwitch.ts](../src/animation/layerSwitch.ts) finds where a robot may change robot row on a leg
- [src/components/robot/notes/useNoteCloud.ts](../src/components/robot/notes/useNoteCloud.ts) moves a robot's note cloud ([below](#the-note-cloud))

The robots' motion is driven by the work loop, [src/systems/workLoop.ts](../src/systems/workLoop.ts) (Roadmap Phase 43); what it decides and when is in [ROBOT_LIFECYCLE.md](ROBOT_LIFECYCLE.md). This file covers the timelines it plays.

## Core Architecture

### Timeline registry
The timeline registry is a string-keyed map, and every entry carries a **scope**:

```typescript
export type TimelineScope = 'world' | 'ui';

export function setTimeline(id: string, timeline: Timeline, scope: TimelineScope = 'ui'): void {
  const existing = timelineMap.get(id);
  if (existing) {
    existing.kill();
  }

  timelineMap.set(id, timeline);
  scopes.set(id, scope);
  if (scope === 'world' && worldPaused && !timeline.paused()) {
    timeline.pause();           // registered while the world is paused: paused on arrival
    pausedByWorld.add(id);
  }
}

export function killTimeline(id: string): void {
  const timeline = timelineMap.get(id);
  if (timeline) {
    timeline.kill();
    timelineMap.delete(id);
  }
  scopes.delete(id);
  pausedByWorld.delete(id);
}
```

Further exports: `getTimeline(id): Timeline | undefined` (plain lookup, no side effect), `getTimelineScope(id): TimelineScope | undefined` (the scope an id was registered under, `undefined` for an unknown id — the way a test proves a registration's scope by code), `pauseWorldTimelines()` / `resumeWorldTimelines()` (below) and `killAllTimelines(): void` (kills and clears every entry, the scopes and the world pause — used for full teardown/reset).

**The two scopes (`docs/specs/OFF_SCREEN.md` assumption 3).** `'world'` is everything that moves in the world — swims, job moves, station arcs and ripples, halo waves, orbiters, bubbles, strip flicker, the note clouds, the deck camera's float — and pauses as one set when the power rocker pauses the world. `'ui'`, the default, is the tablet's own chrome — the rocker, the nav, cabinet pops, the roster glide, the section tabs, the off screen's own theatre — which keeps running while the world is paused. **The rule: every world mover passes `'world'`; nothing else does.** The default is `'ui'` on purpose: a mover that forgets its scope keeps moving through a pause, which is visible, rather than a UI timeline freezing, which would look broken (spec §7 Q7). Each registration's scope is pinned in its module's test through `getTimelineScope`.

`pauseWorldTimelines()` pauses every `'world'` entry that is playing and remembers which (a module-level set), then raises a flag; while the flag is up a `'world'` timeline that is already playing when it is registered is paused on registration. *Corrected 2026-10-31 ([OFF_SCREEN_REVIEW_FOLLOWUPS](tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md) R26, item 1):* this used to say a robot that re-renders while the tablet is off does not start swimming, and the guard does not promise that. A timeline built `{ paused: true }` and played after `setTimeline`, as the swims, the work loop's dissolve and work moves, the station ripples and the deck camera's float are, is not playing when it is registered, so its `play()` runs under the pause. While the world is paused nothing starts those but the deck camera, whose tick runs on `gsap.ticker`, so the tick does nothing while the world is paused: measured headless, its float otherwise played from 0 to 1 behind the off screen. A module that can start a `'world'` timeline during a pause must check `getWorldState()` itself. `resumeWorldTimelines()` plays exactly the entries it paused — one a module had paused on purpose stays paused across a power cycle — and lowers the flag. Both are idempotent and touch no `'ui'` entry. `powerController.pause()` / `resume()` (`src/systems/powerController.ts`) are their only callers, in the order [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#power-is-a-pause) gives.

This is the supported pattern for keeping timelines out of React state and cleaning them up reliably.

### Ref registry
Top-level components register elements with `setRef(key, element)` and animation helpers read them later with `getRef(key)`. An element is a `RefElement` (`SVGElement | HTMLElement`, `src/utils/refs.ts`): a robot's ref is its **mover**, an HTML `div`, the dissolve slot's ref is a `div`, and a charging station's ripple ref is an SVG `<g>`. This is how modules such as swim animation and the work loop find robot DOM nodes (`robot-${id}`) and a charging station's ripple (`station-front-${stationId}`) without coupling them to React render state. Two cleanup exports also exist: `deleteRef(key): void` (remove one) and `clearRefs(): void` (remove all — testing/reset).

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
  pattern this file's intro recommends. `setTimeline` kills the old tween where it stands and the
  new one eases on from there. Its `useGSAP` passes no `revertOnUpdate`: a revert writes the scale
  back to what it was before the reverted tween first ran, which snapped the orbiters to their
  mount size on every edit after the first (`useOrbiterMotion.size.test.tsx`, on real GSAP).
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
  audio edit doesn't re-register it). The work loop calls it on every station arc; it plays the halo's
  triangular waves on a timeline of their own (`halo-waves-{context}-{robotId}`), not on the arc's.
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

- **The bob** — the robot's `.robot` group moves ±`BOB_PX` (3) in whole cycles of about
  `BOB_CYCLE_SECONDS` (2.4), so it ends where it started: 3 cycles in a 6 s job, 4 in a 10 s one. It was ±6 on a
  1.2 s cycle until 2026-11-12, when Crawford halved the distance and doubled the cycle (the note cloud spec §1.11),
  a quarter of the old speed.
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

### Job decorations
[src/animation/jobMoves/decor/](../src/animation/jobMoves/decor/) (Phase 52, spec
[JOB_DECORATION.md](specs/JOB_DECORATION.md)) draws one small flourish over a working robot's orbiters,
one per job, as SVG nodes made for the run and removed when it ends. They are animation only: no
`AudioEngine`, `BeatClock` or store is read or written (Strict Separation), the job's moves and timing are
untouched, and cards and the detail avatar never get them. Every shape wears the robot's `identityColor` or
the gem light colour, with gradients but no SVG filter (a test pins it in `RobotGem.test.tsx`).

**The run** ([jobDecor.ts](../src/animation/jobMoves/decor/jobDecor.ts)). `addWork` calls `addJobDecor(tl, run)`
after the moves are on the job timeline. When the tier is not `'none'`, the robot has a `.robot__row` and the
job has an entry in `DECOR_BUILDERS`, it appends one `<g class="robot__work" data-job>` (with its own `<defs>`)
as the **last child of `.robot__row`**, after `g.gem`: it draws over the body and the orbiters, scales with
the back row for free and unmounts with the robot. Idle robots carry none; reduced motion plans no moves, so
`addWork` is never reached and it gets none.

- **One write hook.** `addWork` hands the builder a `DecorRun` (the plan's events, the variation, the orbiters' rest
  scales); the builder gets a `DecorContext` (`ctx`: the group, its `<defs>`, the tier, the frame helpers). It makes
  its nodes once and calls `ctx.run(t0, t1, write)` once. `write(t)` runs
  from the job timeline's own `onUpdate`, so it fires after every child tween has rendered: a decoration that
  reads an orbiter (`ctx.pose(j)`, the GSAP `x`/`y`/`scale` through `orbiterLocalToRowLocal`) never sees the
  previous update's value, and a seek or the silent finish lands exactly. A playhead leaving the window gets one
  last `write` at the nearest edge, where every shape is invisible. There is no tween of its own per
  decoration, and no store read inside the callback.
- **Frames** ([frames.ts](../src/animation/jobMoves/decor/frames.ts)). Everything is drawn in the group's
  row-local frame: `sceneToRowLocal` maps a scene point (a site point, a route, a vent mouth) into it, and
  `orbiterLocalToRowLocal` maps an orbiter's live position. Sizes scale with the row, so a back-row robot's
  decorations shrink with it. [polyline.ts](../src/animation/jobMoves/decor/polyline.ts) (`polyLen`, `polyAt`,
  `polyVertices`) walks a route for the trail, the ticks and the droplets.
- **The counter-bob.** The group sits outside `g.gem`, so the body's bob would carry it. `addJobDecor` adds
  the bob inverted over the layer scale (`BOB_PX` (3) ÷ `layerScale`), so a wire anchored to a site point stays
  on it.
- **Cleanup.** The group is removed by a `tl.call` at the window's end and by a wrap of `tl.kill`. GSAP's
  `onInterrupt` fires only below progress 1, so it would miss the work loop's silent finish
  (`progress(1, true)`, then kill); every path ends in `kill()`, so the wrap covers a world transition
  (`killAllTimelines`), `stopWorkLoop` and the complete. [workLoop.integration.test.ts](../src/systems/workLoop.integration.test.ts)
  pins each against the real loop.
- **Plan events** ([events.ts](../src/animation/jobMoves/decor/events.ts)). `planStep` in `buildJobTimeline.ts`
  fills a typed `MoveEvents` per step (times, routes, ring angles, per-orbiter starts), so a decoration reads
  the plan instead of re-deriving a tweened position.

| Job | Builder | Draws | Tier `'cheap'` | Counts |
|---|---|---|---|---|
| `ventExtraction` | [ventDecor.ts](../src/animation/jobMoves/decor/ventDecor.ts) `addVentDecor` | A wire from each orbiter to the vent mouth that brightens from the mouth on its pulse (`wireGlowAlpha`), and motes that rise off the mouth (`moteAt`). The orbiter's pulse is `pulseAmount` against `HOVER_PULSE_SCALE` (1.3). | motes only | `VENT_MOTES` (3) per orbiter |
| `acousticSurvey` | [surveyDecor.ts](../src/animation/jobMoves/decor/surveyDecor.ts) `addSurveyDecor` | Small arcs leave each orbiter on every fan ping (`pingArc`), widening and thinning; during the ring the orbiters are wired into a faint polygon, bright at the corners (`chordState`). | nothing | `SURVEY_ARCS` (3) per orbiter |
| `structuralInspection` | [inspectionDecor.ts](../src/animation/jobMoves/decor/inspectionDecor.ts) `addInspectionDecor` | A short trail behind each orbiter along the outline (`trailSegments`) and a tick at every interior vertex as the lead passes (`tickAt`). | ticks only | `INSPECT_TRAIL_SEGMENTS` (8) per orbiter |
| `fluidMonitoring` | [fluidDecor.ts](../src/animation/jobMoves/decor/fluidDecor.ts) `addFluidDecor` | Droplets flowing along the pipe behind the lead (`dropAt`), and at the valve a square that spins faster with each pulse (`valveAngle`). | valve only | `FLUID_DROPS` (10) |
| `salvage` | [salvageDecor.ts](../src/animation/jobMoves/decor/salvageDecor.ts) `addSalvageDecor` | A gem load hung on wires between the orbiters: it grows at pick-up (`loadScale`), swings on the carry, shrinks at the drop; the wires go slack on the return (`slackWire`). | nothing | one load, two wires per orbiter |
| `maintenance` | [maintenanceDecor.ts](../src/animation/jobMoves/decor/maintenanceDecor.ts) `addMaintenanceDecor` | On every flicker chord the orbiter throws line sparks outward (`sparkAt`) and a brief flash (`flashAt`). | same as `'all'` | `MAINT_SPARKS` (5) per orbiter and chord |

The table's job keys are `JOB_MOVES`' and `DECOR_BUILDERS`'; a docs test pins that, and pins every number
written here as `NAME` (value) against `src/constants/index.ts`. Each job's other knobs (`VENT_FADE` (0.5),
`SURVEY_PING_LIFE` (1.4), `INSPECT_TICK_LIFE` (3), `FLUID_DROP_LAG` (0.33), `FLUID_VALVE_SIZE` (14),
`SALVAGE_HANG` (24), `SALVAGE_SWING_DEG` (10), `MAINT_SPARK_LIFE` (1.2)) are one constant each, with the
sketch's defaults ([job-decorations.html](sketches/job-decorations.html)).

Each builder is the pure-state pattern of `haloWaves.ts`: the named functions are maths on `(t, events,
variation, frames)` and return plain shape data, and the `add…` builder only creates nodes and writes
attributes. A window ends after the last shape it draws (a spark, tick or arc life), clamped to the job, so
nothing is cut; every shape is invisible at both ends of its window, so nothing pops at a move boundary or the
reattach.

**Variation.** Twelve factors per robot (`ventRise`, `ventLife`, `surveyReach`, `surveyLife`, `trailLength`,
`tickLife`, `dropLag`, `valveSize`, `hang`, `loadSize`, `sparkReach`, `sparkLife`), each within ±`DECOR_JITTER`
(0.15) of the sketched value, plus the seeded `sparkDirs`, `moteDrift`, `swingPhase` and `loadSeed`. They are
appended to the end of the `${gemSeed}:work` stream in `variation.ts`, so no existing draw moved; counts and
opacities never vary. A robot works the same way every job.

**Tier.** `decorTier(robotLoad)` ([decorTier.ts](../src/animation/jobMoves/decor/decorTier.ts)) is read once per
job start in `work()`, beside `bpm`, and handed to `buildJobTimeline`. The ladder is **unbound**:
`DECOR_TIER_BELOW_STANDARD` and `DECOR_TIER_BELOW_FULL` are both `'all'`, so every Audio Load preset draws
everything. **Full is always `'all'`**, so binding the ladder (Light `'none'`, Standard `'cheap'`) can never
lower the Full-tier cost. The idle-paint gate measured that cost at +11 % busy and +18.5 % paint against the
parent ([PERFORMANCE.md](PERFORMANCE.md), "Job Decorations — the Task 14 perf gate"); it was accepted, and the
Pixel run that is meant to judge it has not been done.

**Keys.** Decorations add no `timelineMap` key: they live on the existing `work-${robotId}` timeline and die
with it.

### Station arcs
A robot enters and leaves a charging station through one arc timeline, keyed
`` `station-${robotId}` `` (`workLoop.ts`'s `stationArc`), over `STATION_ARC_SECONDS` (1 s):

| Arc | Scale | Opacity (`autoAlpha`) | Ease (scale) |
|---|---|---|---|
| Exit (`'spawn'`) | `STATION_PORT_SCALE` (0.15) → 1 | 0 → 1 | √v, so the robot blooms out of the port |
| Entry (`'despawn'`) | 1 → 0.15 | 1 → 0 | `power1.in` (v²) |

The exit plays in the **back robot row** (Phase 43 J4, spec §1.6), between the station's back
plate (L4) and L3. A robot not already there is written to the back row first (a
slot write with nothing to dissolve, see "Layer switch" below), and the arc plays on the same
body in the same call, with `.robot__row` at `BACK_LAYER_SCALE`, so the robot grows from 0.11 to
0.75 overall. Its next leg to a front-row site or a station is then an ordinary back → front
switch. The entry plays in the front row, between L3 and L2.

Opacity is linear both ways, and the robot's halo waves are started by its registered
`decorateArc(kind, duration, tl)` (outward on exit, inward on entry) on a timeline of their own, since a spawn run
outlasts the arc. Beside it,
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
it is exiting a station. `Robot.layer` (`'background'`, else front) says which, and the robot's
mover carries it as `data-scene-slot` (`slotForLayer(layer)`, `sceneStack.ts`), so a change of row is
a **slot write**, a write of `layer`: `Robot.tsx` re-renders with the new slot, the
stylesheet moves its z-index, and nothing is re-mounted (Phase 53). The stack, and the stage whose
single scale (`sceneFit`, written by `useStageFit`) puts every mover's scene-unit `x`/`y` on the
screen, are under "Scene stack" below.

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
  scale, then on to the destination, each swim from rest. Front → back: at the switch point
  `layer` is written and the robot swims on at once, easing to 0.75. Back → front:
  the robot stays in the back row and swims on, easing to 1; `layer` is written, and the copy
  removed, in one call when the swim and the dissolve are both done, at rest.
- **The dissolve.** The haze between the rows (tints B and C, 40 %) would pop at the slot write, so
  for `LAYER_DISSOLVE_SECONDS` the robot is drawn twice. The copy is a mover (`.mover--dissolve`, holding an SVG `<use>`) of the
  robot's group (`#world-robot-{id}`), appended by the loop to `OceanScene`'s
  dissolve div (`data-scene-slot="dissolve"`, over the front robots, found via
  `getRef('robot-dissolve-layer')`) and marked `data-dissolve-copy` (`removeCopy`, a fade's end and the `stopWorkLoop` sweep all select `.mover--dissolve[data-dissolve-copy]`). The robot's x/y/rotation
  are its mover's, which a `<use>` of the group does not carry, so the copy's wrapper is placed at the
  body's pose and mirrored every frame by a `gsap.ticker` listener that lives exactly as long as
  the copy (not from the fade's `onUpdate`: a back → front copy outlives its fade). In both directions the **front
  copy fades and the back robot stays opaque**: 1 → 0 after a front → back switch, 0 → 1 before a
  back → front switch, whose slot write takes the opaque copy away in the same call. The fade is linear, keyed
  `` `dissolve-${robotId}` ``; a new dissolve ends the robot's earlier one first, and a fade's end
  removes only its own copy. It has no reduced-motion variant (it is already an opacity fade).
- **No re-mount.** The row switch writes `layer` and nothing else, body or no body. The write reaches
  the DOM before the next frame paints (Zustand renders through `useSyncExternalStore`), so the copy
  the same call starts or removes keeps that frame whole. `onRobotMounted` runs once per real mount,
  where the loop adopts the robot; `useOrbiterMotion`'s world mount always attaches its orbiters.
- **Interruptions.** A recall or turn-back drops the leg (`dropLeg`: the swim, the bob and the
  dissolve go). `stopWorkLoop` removes every copy; a robot already written to the other row stays
  there.

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
| `` `dissolve-${robotId}` `` | the work loop's `dissolve` | one layer-switch fade | its own end, the robot's next dissolve, a recall or turn-back (`dropLeg`), an adoption (`killLegs`), `stopWorkLoop` — each removes the `.mover--dissolve` copy too |
| `` `orbiters-${context}-${robotId}` `` | `useOrbiterMotion` | the mount | unmount (a no-op stub, see above) |
| `` `orbiter-size-${context}-${robotId}` `` | `useOrbiterMotion` | one Size tween | the next Size edit, unmount |
| `` `halo-waves-${context}-${robotId}` `` | `useHaloMotion` (`playHaloWaves`) | one station arc's triangular waves; a spawn run outlasts the 1 s arc | its own end, the next arc's run, unmount |
| `` `note-belt-${robotId}` `` | `useNoteCloud` | the mount; a re-size's rebuild replaces it | the rebuild (`setTimeline`), unmount |
| `` `note-resize-${robotId}` `` | `useNoteCloud` | one re-size fade (out, rebuild, back in) | the next re-size, unmount |

Every key in this table is registered as `'world'` (the registry's scope, above): the work loop's six
`setTimeline` calls, `swimAnimation.ts`, `buildJobTimeline.ts`, `stationRipple.ts`, `useHaloMotion`,
`useOrbiterMotion`'s motion tween, `useStripFlicker`, `useNoteCloud`'s two, `BubbleStream.tsx` and `deckCamera.ts`'s float all
pass it, so a power-off freezes them in place and a power-on plays them again from where they stopped. The one
exception is `useOrbiterMotion`'s master key (`` `orbiters-${context}-${robotId}` ``), a kill-only token with
no motion in it, which keeps the `'ui'` default on purpose and is pinned so in its test.

`stopWorkLoop` kills every `work-`, `swim-`, `bob-wait-`, `station-` and `dissolve-` key
(`LOOP_KEY_PREFIXES`; a world change, and before every `startWorkLoop` in `initializeLocale` — a power-off
no longer reaches it, since power is a pause), removes
every dissolve copy; no robot is ever re-mounted for a row switch, so there is nothing else to clear. Per robot there is at most one live job and one swim,
and no standing per-robot or per-building GSAP object (spec §1.12). A robot with no mounted body
gets a target-less timeline of the same length under the same key, because `createSwimTimeline`'s
no-ref fallback is an unkeyed `delayedCall` that `stopWorkLoop` couldn't find.

### Scene stack — the stage, the sheets and the movers
The ocean scene (`OceanScene.tsx`) is one **stage**, `div.ocean-scene__stage`, 1920 × 1080 scene units, inside `.ocean-scene`. The stage carries the `xMidYMax slice` fit as a single CSS transform: `sceneFit(box)` (pure, `sceneFit.ts`) returns the scale and offsets that fill the box with the world, cropping the top of it and never the ground, and `useStageFit` (a `ResizeObserver` on `.ocean-scene`) writes them as `--stage-scale`, `--stage-x` and `--stage-y`, once per resize and never per frame. Every child of the stage is positioned in scene units and wears a `data-scene-slot`, which `OceanScene.css` gives a `z-index`; `SCENE_SLOTS` (`sceneStack.ts`) is the one ordered list. Four slots are static `<svg class="ocean-scene__sheet">` sheets; the rest hold **movers**, small `div`s that are compositor layers of their own. (Phase 43 J4 split the old back sheet around a second robot row, spec §1.10; Phase 53 made each robot, each bubble stream and the marker a mover, so the old robot, bubbles and marker sheets are gone and no sheet moves.) The slots, back to front:

| Slot | Kind | Contents |
|---|---|---|
| `back` | static sheet | water column, light shafts, the terrain ridge, background factories/scenery and pipe bridges, tint A, `#station-l4-layer` (each station's back plate), last |
| `robots-back` | movers | every robot whose `layer` is `'background'`, each a `div.mover.mover--robot`, behind `mid` |
| `mid` | static sheet | tint B, midground factories/scenery and pipe bridges, tint C, the ground line |
| `bubbles` | movers | every building's and vent's bubbles, one `div.mover.mover--bubbles` strip per `BubbleStream`, over `mid` |
| `stations` | static sheet | `#station-l3-layer` (each station's middle fragment) |
| `robots` | movers | every other robot, each a `div.mover.mover--robot`, over `stations` |
| `dissolve` | movers | the layer switch's copies, `div.mover.mover--dissolve`, appended by the work loop to this slot's empty `div` (`getRef('robot-dissolve-layer')`) |
| `front` | static sheet | `#station-front-layer` (each station's front fragment: halo and ripple), first, then tint D, foreground factories/scenery and pipe bridges |
| `marker` | mover | the singled-out robot's marker (`FollowedRobotMarker`: the robot under the pointer, else the Deck camera's followed robot), a `div.mover.mover--marker` in front of every building |

A **mover** is `div.mover` (`position: absolute; will-change: transform; pointer-events: none`) holding an `<svg overflow="visible">` sized to its own drawing, so a mover's compositor layer is only as big as what it draws, halo, orbiters and job decorations included. A robot's svg is its gem canvas and the `.robot` group inside carries no transform; `getRef('robot-<id>')` is the mover, and the swim, the job's bob and the station arc write its `x`, `y` and rotation in scene units, which the stage's one scale turns into pixels. A bubble strip is sized once from its stream's seeded rise and wobble, with the vent at its bottom-centre. The marker is placed on the singled-out robot's canvas centre each frame. The dissolve copy holds an SVG `<use>` of the robot's group. A robot changing rows changes only its `data-scene-slot` (see "Layer switch").

Each station's three fragments are plain groups in three sheets, not sheets of their own: `#station-l4-layer` is the last child of `back`, `#station-l3-layer` is all of `stations`, and `#station-front-layer` is the first child of `front` (before tint D). All three are static; only the one-second ripple animates one.

The four **depth tints** (`DEPTH_TINTS`, full-screen `rect[data-depth-tint]`, each a gradient `#depth-tint-{slot}` defined in the layer that draws it) replaced the old two gradients. A is 0.06 and B 0.25 (`#0c1c4f` → `vent.shadow`), C 0.20 and D 0.10 (`vent.shadow`). Coverage, 1 − Π(1 − α): background buildings 49 %, back-row robots 46 %, midground 28 %, front-row robots, stations and bubbles 10 %, foreground 0. Only B and C sit between the robot rows, so a row switch gains or loses 40 % haze, which the dissolve blends. The haze is the scene's, not a robot overlay. No layer takes clicks (`pointer-events: none`); `.robot` takes them, in either row.

The movers (`.mover`) carry `will-change: transform` (OceanScene.css) and are compositor layers of their own, so a per-frame transform write moves a small layer and repaints nothing, and a change inside a mover (orbiters flying, a burst rising) repaints that mover's patch; no sheet is promoted by us. This is a roadmap 17.2.5 and 53 finding, not a style choice: with everything in one `<svg>`, every GSAP write re-rasterized all sixty factories at full viewport size on every frame, and with the robots, bubbles and marker on four stage-sized sheets each write still repainted a whole viewport per sheet. Chrome promotes `mid` and the empty `dissolve` div anyway, because they are painted above composited layers; they draw nothing per frame. The measured effect and the one gate miss are in docs/PERFORMANCE.md ("Per-Mover Compositor Layers — the Task 20 gate"). The dimming rule follows the split: `.world-view[data-dimmed]` blurs and dims the sheets and only dims the movers.

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

Two rules follow from all of this:

- Anything that moves every frame is a mover (robots in the two robot slots, bubbles as one strip mover per `BubbleStream`, the followed-robot marker; the station fragments are static, and only the one-second ripple animates one), never inside the static factory layers.
- No CSS `transition`/`animation` on scene SVG fills or attributes — a running transition style-invalidates its element every frame, which is how the old `fill 4.8s` lighting fade kept the whole scene repainting. Lighting steps once a second instead.

Measure with `npm run perf:idle` before and after any change to what moves in the scene (docs/PERFORMANCE.md, "Idle paint & composite").

### The note cloud
Backlog 79, spec [ROBOT_NOTE_CLOUD.md](specs/ROBOT_NOTE_CLOUD.md). What the cloud draws and why is in
[ROBOT_DESIGN.md](ROBOT_DESIGN.md#the-note-cloud--the-third-overlay); where its notes come from is in
[AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#note-events--audio-to-the-picture). This is how it moves.
`src/components/robot/notes/useNoteCloud.ts`, called by `RobotBody` on the robot screen's desk avatar
alone (never in the world since 2026-11-13, spec §8.4; never on a card), owns it all. Its cost was
measured for world clouds at Gate 1 (PERFORMANCE.md, "Note cloud — the Task 17 cost run" and "Note
cloud — the battery bands, the Task 17d cost run") and with early notes at Gate 4 ("Note cloud — early
notes, the Task 36 runs"); with one cloud on screen those figures no longer apply.

- **The layers.** `NoteCloudLayer` (`NoteCloudLayers.tsx`) renders a wrapper (`.note-layer`, masked,
  `pointer-events: none`, `aria-hidden`) holding an empty belt (`.note-layer__belt`). The avatar's
  box holds a pair, `.note-layer--behind` in a frame before the svg and `.note-layer--front` in one
  after it. The box holding a pair carries `data-note-cloud`, and the hook finds it from inside the svg
  (`closest('[data-note-cloud]')`), then the pair under it, so nothing is passed down. React renders
  no children in a belt and never reconciles what the hook appends. A wrapper is `display: none` and
  its belt drops `will-change` while it has no live note, so an idle cloud costs no layer. Neither is
  rendered under reduced motion or `?notes=off` (`isNoteCloudEnabled`, `debugParams.ts`).
- **The belt.** One `gsap.to` per robot per context, linear and `repeat: -1`, moves both belts left by
  the roll's width each `NOTE_CROSSING_SECONDS`; it is registered `'world'` as
  `` `note-belt-${robotId}` ``, so a power-off pause freezes the cloud mid-flight. Its
  `onUpdate` is the one pass a frame: it writes both belts' `translate`, removes a note whose right end
  has crossed the roll's left edge, and settles each live note. A note's place is kept in unwrapped
  belt units, so its x changes only when the belt wraps, and the rows' wave and fan move it across
  its row by a write only when it moves a whole quantum (`NOTE_QUANTUM_UNITS`, `NOTE_QUANTUM_DEGREES`;
  through the straight middle most frames write nothing). Its white copy (`.note__hot`) takes its
  opacity from the belt's own time: up over `NOTE_HOT_IN_SECONDS` as the note leaves the speakers,
  held for its length, down over `NOTE_COOL_SECONDS`. No tween and no timer per note.
- **A note arriving.** `subscribeDrawnNotes` hands the hook a drawn note and its event. It places
  nothing while the tab is hidden or the world is not `'running'` (`getWorldState()`); the model has
  counted the note either way. Otherwise one
  `div.note` with its `.note__hot` child is appended to the front or behind belt at "now" plus the
  event's `lead` at the belt's speed, and the first live note wakes the layers. The lead is about
  0.7 s, because the first cloud built asks the engine for early notes (`setNotePreviewSeconds` with
  `NOTE_PREVIEW_SECONDS`, 0.4625 s, and the last cloud to go withdraws the ask). So a bar lands about
  halfway between the roll's right edge and "now" and rides in under the mask, which clears where it
  lands (`NOTE_KNOWN_AHEAD_SECONDS + NOTE_PREVIEW_SECONDS` of travel right of "now").
- **Strength and re-size.** The layers' opacity is `NOTE_PEAK_STRENGTH` (0.5625), set when the cloud is
  built; nothing else changes it but a re-size. A gem or body-scale change fades both layers out over
  `NOTE_WAKE_SECONDS`, rebuilds the roll at the latest size from a `.call` (dropping the notes in
  flight and starting a new belt), and fades back to the peak, on
  `` `note-resize-${robotId}` `` (`'world'`). A second change mid-fade replaces it from
  wherever the layers are.
- **Pixels per unit.** A bar's 4-pixel floor needs the screen scale, read when a note arrives and never
  by a layout read: `--note-fit-scale`, which the avatar's box writes from its `ResizeObserver` and its
  frames' CSS reads to place the layers on the svg's fit.
- **The model's life.** `noteCloudModel` outlives an effect re-run; the cloud's unmount (closing the
  robot screen) forgets the robot's range and run (`clearNoteCloudModel`).

### Layout-rework timelines (Phase 45)

Three families of UI timelines, all in `timelineMap`, none touching audio:

| Key | Owner | Lives | Killed by |
|---|---|---|---|
| `nav-panel-width` | `NavPanel` (`useNavPanelWidth`) | one 0.25 s tween of the `--nav-panel-expand` factor on `#screen-viewport`, as Probes opens or closes its entity list; `NavPanel.css` derives `--nav-panel-width` from it and `ContentPane`'s left edge reads the same variable | the next change, unmount (which also removes the property). The first value is set at once, and so is every change under reduced motion |
| ``roster-move-${robotId}`` | `RosterBoard` (`useRosterGlide`) | one `ROSTER_GLIDE_DURATION` (0.45 s) `Flip` glide of the roster tiles after a Move pick: `Flip.getState` before the `assignRobotToCompany` write, `Flip.from` in a `useLayoutEffect` keyed on the row order | its own end, a second pick (the first is finished to its end first), unmount. Skipped under reduced motion (focus still follows the tile) |
| ``section-tab-${instanceId}-${itemId}`` | `SectionTabs`, one per trigger | the `CabinetBox` pop of a tab | unmount (the same `CabinetBox` pop timeline every cabinet control registers) |

The glide imports `Flip` from `gsap/dist/Flip`: `gsap/Flip` fails type-checking on Windows (`TS1149`, the `Flip.d.ts`/`flip.d.ts` casing); the global gsap mock in tests has a no-op `registerPlugin` and the tests mock `gsap/dist/Flip` with a recording fake. The header's old slide out of the nav's way is gone: the nav no longer reaches the header.

### Deck camera (Phase 46)

On a viewport narrower than the stage's 16:9 the world view is a horizontal scroller, and `src/animation/deckCamera.ts` pans it on its own. It follows one robot at a time, and the loop is: **pick** a robot, **float** to it, **follow** it, rest for a **cooldown**, pick again. Spec: [docs/specs/DECK_CAMERA_FOLLOW.md](specs/DECK_CAMERA_FOLLOW.md).

The module is runtime-only, in the pattern of `timelineMap` and the ref registry: module-level variables, no React, no Zustand state of its own. It reads robots from the locale store and nothing else from the app's stores except the three `uiStore` fields below. It never reads audio state and never calls `AudioEngine` (Strict Separation).

**The loop.** One `gsap.ticker` handler, added in `registerDeckScroller` and removed when the scroller goes, does all per-frame work. Every clock is a `performance.now()` comparison inside it; there are no timers.

**The scroller's dimensions are measured, never read per frame.** `scrollWidth` and `clientWidth` are read once when the scroller is registered and again on each resize (a `ResizeObserver` on the scroller); read right after GSAP's transform writes they force a layout, and the old ticker read them every frame. **With nothing to scroll** — any viewport at or wider than the stage's 16:9, which is every desktop window — the camera stands down: the ticker returns at once, `moveCameraTo` starts nothing, the edit-return overrides do nothing and the marker never appears for the camera (it still frames the robot under the pointer, `robotAttention.ts`). A resize that opens a range lets the next tick pick; one that closes it ends any float or follow (backlog item 26, candidate 2, 2026-10-16).

**The scroller is composited** (`will-change: scroll-position` on `.world-view__scroller`, 2026-10-18). The camera writes `scrollLeft` and nothing else, so a composited scroller turns each pan into a compositor scroll of the scroller's own layer. Without it, Chrome on a desktop below DPR 1.5 draws the scroller into the console shell's layer (`div.screen-content`) and re-rasters that layer on every frame of a pan with no `Paint` event; at DPR ≥ 1.5 and on mobile Chrome composites the scroller anyway, so phones were never affected. The cost is the scroller's layer, ≈ 0.7 MB at 1× on 1280 × 900. Measured in [tasks/DECK_SCROLLER_COMPOSITING.md](tasks/DECK_SCROLLER_COMPOSITING.md) and PERFORMANCE.md "Deck scroller compositing — the desktop A/B"; `contain: paint` was measured too and did nothing.

1. **Pick** (`pick(candidateIds)`): among the candidates, the lowest battery above `DECK_CAMERA_MIN_BATTERY_PCT`, else the lowest overall; a tie goes to the robot whose target is nearest the scroller's current position. An empty pool returns `null` and restarts the cooldown. The ticker picks from `undockedRobotIds()` (robots that are `Active` or `Recalled`; docked ones are never chosen, and a robot's position on screen never matters).
2. **Float** (`moveCameraTo(robotId)`): a `gsap` timeline of length `DECK_CAMERA_PAN_S` eases a progress value from 0 to 1, and on each update writes `scrollLeft = start + progress × (live target − start)`, re-reading the robot's target every frame (its live scene x scaled to the stage's pixel width, centred, clamped to the scroll range; `deckCameraTargetFor` exposes it for tests). It chases the robot rather than scrolling to a snapshot: a fixed target landed where the robot *was* at pick time, and a robot that moved meanwhile got a hard jump on the first follow write (worst when it crossed the camera's path; Crawford, 2026-10-12). Landing on the live target means the follow's first write is no jump, and since the ease flattens to zero slope at the end the camera arrives at the robot's own velocity. If the robot's ref vanishes mid-float the last known target holds. It is registered in `timelineMap` under `DECK_CAMERA_TIMELINE_ID`, so a new float kills the old one. Under `prefers-reduced-motion` the duration is 0 and `onComplete` writes the landing position itself.
3. **Follow**: once the float lands, each tick writes the subject's live target to `scrollLeft` until `DECK_CAMERA_FOLLOW_MS` is up, the robot docks, or it leaves the locale.
4. **Cooldown**: `DECK_CAMERA_COOLDOWN_MS` of rest, then the ticker picks again. The first pick after boot has no wait.

**The three overrides** (all in the same module):

- **Touch and wheel.** `pointerdown`/`touchstart` on the scroller freeze the camera and kill any float in flight; `pointerup`/`touchend` (or `pointercancel`/`touchcancel`, so an interrupted touch cannot leave the camera held) start the cooldown. A `wheel` does both at once. There is no `scroll` listener, so the camera's own writes can never be mistaken for the user.
- **Robot edit-return.** The module subscribes to `uiStore` and remembers the last `selectedRobotId`. When `activeHubTile` goes from set to `null` (the Deck is back), it floats straight to that robot with no cooldown wait, if the robot is still undocked; if it is docked, nothing happens and the loop carries on.
- **Company edit-return.** The same edge with `selectedCompanyId`: `pick` from that company's undocked members, or from every undocked robot when it has none.

**Who may call in.** Nothing else may call into the module. `WorldView` registers the scroller (`registerDeckScroller`); `src/systems/robotAttention.ts` reads the followed robot (`getFollowedRobotId`, `subscribeFollowedRobot`) for the singled-out robot (`getSingledOutRobotId`, `subscribeSingledOut`), which `FollowedRobotMarker` draws its marker on and `RobotBody` undims its note cloud for. There is no manual "jump to this robot" control and no tap-to-pan; a new trigger belongs inside the module, behind the loop's own rules.

### UI and system animations
Other systems follow the same model:

- [src/components/ui/physical/PowerRockerSwitch.tsx](../src/components/ui/physical/PowerRockerSwitch.tsx) for the rocker's press (`power-rocker`), return (`power-rocker-return`) and the one click sequence (`power-rocker-sequence`: a 0.18 s hold, then the act, 0.5 s later the return). Since power became a pause (`docs/specs/OFF_SCREEN.md` assumption 6) the same sequence serves both directions — the act is `powerController.pause()` while powered and `powerController.powerOnSequence()` otherwise — and there is no confirm dialog and no `power-rocker-confirm-delay`. All three stay `'ui'`, so the rocker returns while the world it just paused does not move.
- [src/animation/offScreenTheatre.ts](../src/animation/offScreenTheatre.ts) for the off screen's three `'ui'` timelines: `off-screen-boot` (`startOffScreenBoot(dark)`, a fresh page's only: 0.5 s dark, a 1 s flicker of the screen's `off-screen__dark` layer, then ready; `skipOffScreenBoot()` jumps to the end on a tap, which the dark layer takes while it is up, so the tap selects nothing it hides; `gsap.matchMedia` jumps to ready under `prefers-reduced-motion: reduce`; the returned stop kills it on unmount) and `off-screen-fade` (`fadeOffScreen()`: the screen's parts, the veil, the dark layer and the column, tween to transparent over 0.4 s, never the root, since an ancestor below opacity 1 is a backdrop root and the veil's blur dropped out on the fade's first frame ([OFF_SCREEN_REVIEW_FOLLOWUPS](tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md) R26, item 2), and a promise resolves, which `powerController.powerOnSequence()` awaits **before** waking anything, so the veil is gone before the power flag unmounts the screen; the screen is `inert` from the fade's first frame, through a slow start's transparent wait too; it resolves at once with no screen mounted). `restoreOffScreen()` undoes the fade, opaque and taking input again, when the start after it fails ([OFF_SCREEN_REVIEW_FOLLOWUPS](tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md) R19). And `off-screen-fade-in` (`fadeInOffScreen(root)`, the fade's reverse, played instead of the boot theatre when the screen mounts over a world just paused, `getWorldState() === 'paused'`; [OFF_SCREEN_FINAL_FIXES](tasks/OFF_SCREEN_FINAL_FIXES.md) F6): the dark layer hidden at once, the veil and the column tweened from transparent to opaque over the same 0.4 s, shown at once under reduced motion; `fadeOffScreen` kills it first on a power-on mid-fade, and the returned stop kills it on unmount. The screen registers its root under `OFF_SCREEN_REF_KEY` (`'off-screen'`) in the ref registry for the fade to find. Semantic only: the fade resolves a promise and the controller does the rest — nothing here touches the audio.
- [src/components/actors/BubbleStream.tsx](../src/components/actors/BubbleStream.tsx) for looping particle effects (`'world'`)
- [src/animation/sceneWash.ts](../src/animation/sceneWash.ts) for the scene wash's `'ui'` timeline `scene-wash`, one fade at a time ([below](#the-scene-wash))

These modules register timelines in the shared map and clean them up during teardown.

### The scene wash
`docs/tasks/OFF_SCREEN_REVISIONS.md` Tasks 12 and 13 (Crawford's note 7, 2026-10-31). A user-gesture world change — a save pick or a New Transmission editor commit on the off screen, Scan, a Current restore — is a smooth cut (an aspect family change re-deals the live roster in place and never washes, `docs/tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md` R33, and a theme change re-derives it in place and never washes either, `docs/tasks/OFF_SCREEN_FINAL_FIXES.md` F7–F8): the old world fades under a wash in the sea's own colours, the rebuild runs under it, and the new world fades in. Three pieces, kept apart so the timelines only ever set semantic state (CLAUDE.md, Strict Separation):

- **The state, `uiStore.sceneWash`:** `'clear'`, `'covering'`, `'covered'` or `'uncovering'`, a JSON string.
- **The request, `src/systems/worldChange.ts`.** `requestWorldChange(change)` keeps the latest change at module scope (a function, never in a store) and sets `'covering'`; a request while covering replaces the pending change, and one while uncovering covers again. When the state becomes `'covered'`, a store subscription hands the run to a resolved promise, so it starts once the call that set `'covered'` (the cover's `onComplete`, which GSAP calls mid-tick) has returned and no world change runs on GSAP's call stack ([OFF_SCREEN_REVIEW_FOLLOWUPS](tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md) R12). The run takes the pending change, and any change it asks for in turn before the uncover, then sets `'uncovering'` in a `finally`, so a throwing change still uncovers; the throw is logged. A request between the landing and the run replaces the pending change, as one while covering does. If the cover was let go first (the wash detached, or a reduced-motion request ran at once), the state is no longer `'covered'` and the run does nothing. Under `prefers-reduced-motion`, or while no wash is attached, the change runs at once and the state stays `'clear'`. `attachSceneWash()` is how the wash says it is mounted; detaching mid-cover runs the pending change and clears.
- **The wash, `src/animation/sceneWash.ts`.** `startSceneWash()` reads `WorldView`'s element from the ref registry (`'world-wash'`: `div.world-view__wash`, over the scroller and under `MetaBox`, `opacity: 0`, `pointer-events: none`, no `will-change`, so it promotes no layer at rest), attaches, and follows the store. `'covering'` paints a top-to-bottom gradient of the water column's own two stops at the current hour (`waterColumnColors`, `src/utils/waterColumnColors.ts`, shared with `WaterColumn`), when it starts from `'clear'` only (a re-cover while uncovering keeps the colours it shows: [OFF_SCREEN_REVIEW_FOLLOWUPS](tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md) R21), and fades it to opaque over `SCENE_WASH_SECONDS` (0.5 s) on the `'ui'` timeline `scene-wash`, whose `onComplete` sets `'covered'`. `'uncovering'` fades it out over 0.5 s and sets `'clear'`; a `'clear'` set from outside snaps it transparent. From the cover's start to `'clear'` it carries `will-change: opacity`, set with the paint and released with the snap, so both fades are the compositor's: without it the whole wash re-rastered in every frame of each fade, about 0.9 of a screen per frame on a desk ([OFF_SCREEN_REVIEW_FOLLOWUPS](tasks/OFF_SCREEN_REVIEW_FOLLOWUPS.md) R26, item 5). Each state is acted on once, however the store's listeners nest, and registering a fade kills the one running. Being `'ui'`, it plays over a paused world. `WorldView` registers the element and starts the wash in its `useGSAP`, and stops it and drops the ref on unmount.

**The fade-out waits a frame.** The change, a whole world rebuilt in a few hundred milliseconds, runs just after the cover's completion, which GSAP calls from its root timeline mid-tick: on the request module's resolved promise, once GSAP's frame callback has returned, so still before the next frame. A tween made then is stamped at that tick's start, and the next tick, after the rebuild, finds most of its 0.5 s gone: measured on a Roll, about 75 ms of the fade-out showed. So the fade-out starts from a `gsap.ticker` listener that skips the frame it was added in. The root updates first on every tick, so on the next frame the tween is stamped after the rebuild and all of it shows. A new state, or the stop, removes a listener still waiting.

Callers wrap their whole synchronous body, the retransmit or apply and their own follow-ups, in the request. The boot, the link boot and `applySessionPayload`'s own retransmit never go through it, and a Retransmit with nothing edited asks for nothing.

## Contributor Rules

- Keep timelines and refs outside Zustand and React state.
- Prefer GSAP timelines over `setInterval` or `requestAnimationFrame` for motion.
- Use transforms such as `x`, `y`, `rotation`, and `scale` rather than layout properties.
- Keep semantic state changes in handlers; do not schedule audio directly inside GSAP timeline callbacks.
- Send a user-gesture world change through `requestWorldChange`; never start a rebuild from a timeline callback. The wash's timelines only set `uiStore.sceneWash`.
- Kill timelines on unmount or teardown when the owning entity is removed.
- Register every world mover with `setTimeline(id, tl, 'world')` and pin the scope in its test with `getTimelineScope`; leave the tablet's own chrome on the `'ui'` default.

## What to Avoid

- Storing timelines in component state or Zustand
- Creating one-off animation loops with `requestAnimationFrame`
- Animating `width`, `height`, or other layout-affecting properties
- Triggering audio directly from timeline callbacks
- Leaving timelines running after cleanup
- Registering a world mover without `'world'` (it keeps moving while the tablet is off), or pausing a timeline by hand where the scope would do it

## Audit Checklist

- [ ] Timeline references live in the shared registry
- [ ] Every world mover is registered as `'world'`, and its test asserts the scope
- [ ] SVG refs are registered through `setRef` / `getRef`
- [ ] Cleanup uses `killTimeline` when the entity is removed
- [ ] Motion uses GSAP transforms instead of layout changes
- [ ] Audio scheduling stays outside animation callbacks
