# Phase Spec: Job Decorations (six small animations on the orbiters' work)

Roadmap Phase 52 (proposed; 51 is the Guide). Intent: [docs/intent/job-decorations.md](../intent/job-decorations.md)
(confirmed 2026-10-12, 4 questions). Sketch: [docs/sketches/job-decorations.html](../sketches/job-decorations.html)
(Verdict 1, 2026-10-12: all six rows kept; Crawford's settings are its defaults and every constant below).
Builds on shipped Phase 43 ([ROBOT_JOBS_AND_STATIONS.md](ROBOT_JOBS_AND_STATIONS.md) §1.9, the moves in
`src/animation/jobMoves/`) and on the halo-waves precedent on `various-small-fixes`
(`src/components/robot/gem/haloWaves.ts` + `useHaloMotion.decorateArc`): pure maths, per-run SVG nodes,
one proxy tween, every knob one constant.

While a robot works, its job gains one decoration drawn over the orbiters: **tethers and motes** (Vent
Extraction), **ping arcs and a wired ring** (Acoustic Survey), **a scan trail and vertex ticks** (Structural
Inspection), **droplets and a spinning valve** (Fluid Monitoring), **a wired load** (Salvage), **sparks and a
flash** (Maintenance). Each is a pure function of the job's planned events, the orbiters' live positions and
the run's progress, written to a group of SVG nodes that exists only for that run. Two knobs per row vary
±15 % per robot. Nothing comes from BPM beyond the job's own duration, nothing from the audio engine.

## Assumptions (correct these before the plan)

1. **The job timeline is the only driver.** Every decoration is added to the `work-${robotId}` timeline
   `buildJobTimeline` already builds. *As built (Task 8):* the spec first said "one proxy tween
   `{ u: 0 → 1 }` whose `onUpdate` writes", but GSAP renders a timeline's children in start order, and a
   decoration window that opens before the moves (Vent's fade starts half a second ahead of the pulse)
   renders **first**, so its `onUpdate` read the orbiters' scales and positions from the previous update
   (Task 8's glow tests failed on a seek). The writes now run from the **timeline's own `onUpdate`**,
   which fires after every child has rendered, with the playhead time clamped to the window; attributes
   are written with `setAttribute` (cheaper than `gsap.set`). Seeks land because the update is a
   function of the playhead time and of the orbiters' current GSAP `x`/`y`/`scale` (read with
   `gsap.getProperty`), never of accumulated state. No second timeline, no `requestAnimationFrame`, no
   timers.
2. **The nodes live in `.robot__row`**, appended after `RobotBody`'s `g.gem` (so they draw over the body
   and the orbiters, as the sketch does), as one `<g class="robot__work">` created with
   `document.createElementNS` at job start and removed when the run ends or is killed. They therefore
   scale with the back row for free (the row's `scale(BACK_LAYER_SCALE)` about the canvas centre) and
   unmount with the robot. Idle robots carry no decoration nodes at all; cards and the avatar never get
   one (only the world robot reaches `buildJobTimeline`).
3. **The bob is countered**, as for the orbiters: the group gets `bob(group, 0, −BOB_PX / layerScale, …)`
   on the same timeline at 0, so a wire anchored to a site point holds still while the body bobs. (The
   orbiters' counter is `−BOB_PX / (bodyScale × layerScale)` because they sit inside `g.gem`'s scale; the
   group sits outside it.)
4. **Coordinates are row-local.** A scene point `p` maps to the group's frame by
   `sceneToRowLocal(p, { robotPos, gem, layerScale })` = `c + (p − robotPos − c) / layerScale`, `c` the
   gem canvas centre; an orbiter's live local `(x, y)` maps by
   `orbiterLocalToRowLocal((x, y), { gem, bodyScale, corner })` = `c + ((x, y) + dock(corner) − c) × bodyScale`.
   Both pure, both the inverses of the frames `sceneToOrbiterLocal` already documents; neither takes the
   bob (the counter-bob cancels it inside the group).
5. **A killed run cleans up.** `finishJobSilently` does `progress(1, true)` (events suppressed) then kills
   the key, and `killAllTimelines()` kills it outright on a world transition — neither fires `onComplete`.
   The group's removal is therefore registered on a call at the end of the decoration's window (a run
   that plays out; Task 6 used the tween's `onComplete`, Task 8 a `tl.call` once the writes moved to the
   timeline's `onUpdate`) **and** on the job timeline's `kill()` (every other end). *As built (Task 6):* the spec first named
   `onInterrupt` for the second, but GSAP fires it only `if (progress() < 1)` (`_interrupt`,
   gsap-core.js), and the silent finish has just set progress to 1 with callbacks muted — so it would have
   left the group in the document. `addJobDecor` wraps the timeline's `kill` instead (Task 6's
   silent-finish test fails without it); the work loop needs no change and no `cleanup` is returned (Q4).
6. **Colours are the robot's `identityColor` and `GEM_LIGHT_COLOR`** (the orbiters' own two), not the
   company colour the halo wears (Q2). Gradients allowed — `<linearGradient>` / `<radialGradient>` in the
   group's own `<defs>`, ids `work-${robotId}-…` (one world instance per robot, so no collision) — and no
   `<filter>` anywhere (the `RobotGem` guard test already forbids it; a new guard covers the group).
7. **Variation draws are appended to `Alea(`${gemSeed}:work`)`** after `sparks`, in this order: the
   sketch's own extras (`sparkDirs` 4×3×3, `moteDrift` 4×4, `swingPhase`, `loadSeed`), then the twelve
   ±15 % factors (§1.8). `variation.test.ts`'s draw-order test is extended, not changed; every existing
   draw keeps its value.
8. **Events come from the plan, not from the DOM.** `planStep` already knows each move's window, targets,
   ranks and routes; it grows a typed `events` field (§1.2) the decorations read. No decoration re-derives
   a tweened position: anything orbiter-anchored reads the orbiter's live `x`/`y` at update time; anything
   time-anchored (a mote's birth, a tick's pass, a spark chord) uses the event time the plan computed.
9. **Load tier plumbing ships, thresholds don't bind.** `decorTier(robotLoad)` (§1.9) returns
   `'none' | 'cheap' | 'all'` from constants that today map every preset to `'all'`. If the perf gate (§5)
   misses, the ladder is Light → `'none'`, Standard → `'cheap'`, Full → `'all'`, changed in those constants
   only; the fleet, its audibility and count are never touched.
10. **The perf baseline is `various-small-fixes`' tip** (halo waves included), measured in the same
    session with `npm run perf:idle` on the same pinned `?session=`. At rest this pass adds nothing: no
    node exists until a job starts. The cost is per working robot, per frame: up to ~40 `gsap.set`s on
    small paths/lines (Structural Inspection's trail is the heaviest, ~8 segments × 4 orbiters).

## Tech stack and commands

React 19, TypeScript 5.9, Zustand 5, GSAP 3 via `@gsap/react`, Vitest + Testing Library.
`npx vitest run <path>` · `npm test` · `npm run build:types` · `npm run lint` · `npm run build` ·
`npm run dev` · `npm run perf:idle --throttle 1 --only none` (after `npm run build && npx vite preview --port 4173`).
Tests that need real tween values call `vi.unmock('gsap')` (the global setup mocks it) and step
`gsap.globalTimeline` by hand, as `buildJobTimeline.test.ts` does.

## 1. Overview & Claude Explanation

### 1.1 The run (`src/animation/jobMoves/decor/jobDecor.ts`)

`addJobDecor(tl, input, plan)` is called by `addWork` after the moves and the reattach are on the
timeline, when `input.decorTier !== 'none'` and not under reduced motion:

1. Creates `<g class="robot__work" data-job={job}>` with a `<defs>` child, appends it to
   `robotEl.querySelector('.robot__row')` (a missing row — a test fixture — means no decoration, no
   throw).
2. Adds the counter-bob (Assumption 3) at 0.
3. Calls the job's builder (§1.3–§1.8) with a `DecorContext`: the group and its `<defs>`, the plan's
   `events`, `toRow` (the scene → row-local frame, Assumption 4), the robot's `WorkVariation`, the tier,
   and `run(t0, t1, write)`. The builder creates its nodes once (fixed counts, opacity 0) and calls `run`
   **once**: `write(t)` gets the timeline time on every update while the playhead is in the window
   (Assumption 1), plus one last write at the nearest edge when it leaves (a seek back, or the update
   past the end), where every shape is invisible. `run` clamps the window to `[0, jobDuration]` (a fade
   must never lengthen the timeline), and a builder that draws nothing, or whose window is empty after
   clamping, leaves no group. The context also carries `orbiters`, `restScales` and `pose(j)` (orbiter
   `j`'s live row-local centre and GSAP scale, through `orbiterLocalToRowLocal`) for the builders that
   anchor to an orbiter. Builders register in `DECOR_BUILDERS` (`decor/jobDecor.ts`).
4. Removes the group when the playhead passes the window's end and when the timeline is killed
   (Assumption 5). After that a seek back does not bring it back.

The builders are pure in the same way `haloWaves.ts` is: a `…State(u, events, variation, knobs)` function
returns plain shape data (points, radii, opacities, `d` strings) that the `add…` function writes. Every
shape's alpha is 0 at both ends of its window, so nothing pops at a move boundary or the reattach.

### 1.2 Plan events (`buildJobTimeline.ts`, `planStep`)

`PlannedStep` gains `events: MoveEvents`, a discriminated union by move:

| Move | `events` |
|---|---|
| `hoverPulse` | `{ kind: 'pulse', point, t0, t1, slot, orbs: { corner, start, target }[] }` |
| `fan` | `{ kind: 'fan', point, t0, t1, slot, orbs: { corner, start, target, dir }[] }` (`dir` = unit vector point → target) |
| `trace` | `{ kind: 'trace', route, t0, t1, run, orbs: { corner, start }[] }` (`route` in scene units, `start`/`run` from `traceTimes`) |
| `ring` | `{ kind: 'ring', centre, radius, direction, t0, t1, orbs: { corner, startAngle, sparkChords }[] }` |
| `carry` | `{ kind: 'carry', a, b, t0, t1, orbs: { corner, offset }[] }` |

`t0`/`t1` are the move's `[start, end]` from `moveWindows`; everything is in timeline seconds and scene
units. `buildJobTimeline.test.ts` pins each shape against the existing move maths (a pulse `start` equals
`t0 + rank × slot`; a ring `sparkChords` equals `sparkChords(v.sparks[corner], RING_SEGMENTS)`).
A ring that does not flicker (Acoustic Survey's) has `sparkChords: []` for every orbiter: the events say
what happens, and only Maintenance sparks. The run's events are kept on the timeline as
`tl.data = { events: MoveEvents[] }`, one per step in table order (`[]` under reduced motion, which
plans no moves); the types live in `decor/events.ts`.

### 1.3 Vent Extraction — tethers + motes (`decor/ventDecor.ts`)

Window: the pulse move, from `t0 − VENT_FADE` to `t1 + VENT_FADE` (`VENT_FADE` 0.5 s), alpha ramping over
`VENT_FADE` at both ends. Nodes per shown orbiter: one base wire `<line>`, one glow wire `<line>` with a
`<linearGradient gradientUnits="userSpaceOnUse">` (light colour, `stop-opacity` α → 0 at 60 %), and
`VENT_MOTES` (3) mote `<circle>`s; all in the group. *As built (Task 8):* the window alpha is
`clamp(min((t − (t0 − F)) / F, (t1 + F − t) / F))`, up over `[t0 − F, t0]` and down over `[t1, t1 + F]`
(the sketch's `windowAlpha` ends at `t1 + 0.4`; this follows the spec's `t1 + VENT_FADE`); the glow wire
is drawn (opacity 1) only while its gradient has any brightness; and tier `'cheap'` draws the motes only
(time-anchored, no live orbiter reads) — §1.9's tier lists name no vent shape, so this is the reading
that leaves vent something to draw.

- **Wire**: from the mouth (`events.point`, row-local) to the orbiter's live centre; identity colour,
  width `VENT_WIRE_WIDTH` 1.8, opacity `VENT_WIRE_OPACITY` 0.5 × window alpha.
- **Glow**: the gradient's `x1 y1 x2 y2` set to the same two points each frame; its start
  `stop-opacity` = pulse amount × window alpha, where pulse amount = `(scale − rest) / (rest × (HOVER_PULSE_SCALE − 1))`
  read from the orbiter's live `scale`, clamped 0–1; width `VENT_WIRE_WIDTH + 0.6`.
- **Motes**: mote `k` of orbiter `j` is born at `orbs[j].start + k × slot / VENT_MOTES`, lives
  `VENT_MOTE_LIFE` 1.8 s × factor; at age fraction `a` it sits at
  `mouth + (drift × 10 × a, −VENT_MOTE_RISE × smooth(a))`, `VENT_MOTE_RISE` 40 × factor,
  `drift = moteDrift[corner][k] − 0.5`; radius `VENT_MOTE_RADIUS` 3.4 × (1 − a); opacity 0.9 × (1 − a) ×
  window alpha; light colour. Not born or dead → opacity 0.

### 1.4 Acoustic Survey — ping arcs + wired ring (`decor/surveyDecor.ts`)

Two windows on one tween spanning fan `t0` to ring `t1`.

- **Ping arcs** (fan): per orbiter `SURVEY_ARCS` (3) `<path>`s. Arc `a` of orbiter `j` starts at
  `orbs[j].start + a × SURVEY_ARC_GAP` (0.15 s), lives `SURVEY_PING_LIFE` 1.4 s × factor; at age
  fraction `p` it is the arc of radius `3 + SURVEY_PING_REACH (36 × factor) × smooth(p)` centred on the
  orbiter's fan target (`events.orbs[j].target`, a fixed point — the orbiter only pulses there), spanning
  `SURVEY_PING_SPAN` 80° about `atan2(dir)`; width `1.2 → 0.3`, opacity `0.9 × (1 − p)`; light colour.
- **Wired ring** (ring, count ≥ 2): `n` chords (1 when `n` = 2), each a base `<line>` (identity colour,
  width `SURVEY_CHORD_WIDTH` 0.6, opacity `0.35 × SURVEY_CHORD_OPACITY`) and a glow `<line>` with a
  user-space gradient bright at both ends (light colour, `SURVEY_CHORD_OPACITY` 1 → 0 at 50 % → 1), end
  points = consecutive orbiters' live centres in lock order; all × window alpha with `SURVEY_RING_FADE`
  0.35 s edges inside `[ring.t0, ring.t1]`.

### 1.5 Structural Inspection — scan trail + vertex ticks (`decor/inspectionDecor.ts`)

Window: trace `t0` to `t1`.

- **Trail**: per orbiter `INSPECT_TRAIL_SEGMENTS` (8) `<line>`s. At time `t`, `u = (t − start) / run`;
  outside (0, 1] all hidden. Segment `k` runs from `polyAt(route, u − back × (k − 1) / N)` to
  `polyAt(route, u − back × k / N)`, `back = INSPECT_TRAIL_LENGTH (20 × factor) / polyLen(route)`, hidden
  once `u − back × k / N < 0`; width `INSPECT_TRAIL_WIDTH` 4 × fade, opacity `INSPECT_TRAIL_OPACITY` 1 ×
  fade, `fade = 1 − (k − 1) / N`; the first two segments light colour, the rest identity.
- **Ticks**: one `<line>` per interior vertex of the route (first and last excluded). The lead orbiter
  (rank 0) passes vertex `v` at `lead.start + v.u × run`; for `INSPECT_TICK_LIFE` 3 s × factor after, the
  tick is centred on the vertex, square to the vertex's direction (`polyVertices`), half-length
  `INSPECT_TICK_LENGTH (6) × min(1, age / 0.1) / 2`, opacity `0.9 × (1 − age / life)`; light colour.
  `polyAt`, `polyLen`, `polyVertices` are the sketch's, ported pure into `decor/polyline.ts`.

### 1.6 Fluid Monitoring — droplets + spinning valve (`decor/fluidDecor.ts`)

- **Droplets** (trace window): `FLUID_DROPS` (10) `<circle>`s. Drop `k` (1-based) is at
  `polyAt(route, (t − lead.start − k × FLUID_DROP_LAG) / run)`, `FLUID_DROP_LAG` 0.33 s × factor; hidden
  outside (0, 1]; `y` wobbles `± 0.8 × sin(9t + k)`; radius `FLUID_DROP_RADIUS` 3 × (0.6 + 0.4 × fade),
  opacity `0.85 × fade`, `fade = 1 − (k − 1) / FLUID_DROPS`; light colour. (At 200 BPM the last drops
  never start — Q5.)
- **Valve** (pulse window, `FLUID_VALVE_FADE` 0.3 s edges): a radial-gradient glow `<circle>` (light
  colour, `.9 / .25 / 0` at `0 / .5 / 1`, radius `1.4 × size`, opacity 0.5), an outer `<rect>` outline
  (light colour, width 1, opacity 0.9) and an inner filled `<rect>` (identity colour, 0.45 × size,
  opacity 0.8) at the valve point, `size = FLUID_VALVE_SIZE 14 × factor × window alpha`. Rotation:
  rate starts at `FLUID_SPIN_BASE` 90 °/s and gains `FLUID_SPIN_STEP` 90 °/s at each orbiter's pulse
  start (sorted); angle = the piecewise integral to `t`; the outer rect turns `+angle`, the inner `−angle`.

### 1.7 Salvage — wired load (`decor/salvageDecor.ts`)

Window: carry `t0` to `t1`, `f = (t − t0) / (t1 − t0)`, the move's own phases (`LOADED` .1,
`ARRIVED` .45, `DROPPED` .55, `RETURNED` .9 from `carry.ts`, exported).

- **Load scale**: `smooth(f / .1)` to `.1`, 1 to `.45`, `1 − smooth((f − .45) / .1)` to `.55`, 0 after.
- **Load**: centroid `m` of the live orbiter centres; swing `sw = sin(φ × 3π + swingPhase) × SALVAGE_SWING (10°) × sin(φπ)`
  for `φ = (f − .1) / .35` while carrying, else 0; centre `c = m + (sin(sw) , cos(sw)) × SALVAGE_HANG`
  (24 × factor). A diamond (`loadSeed < .5`) or hexagon `<polygon>`, size `SALVAGE_LOAD_SIZE` 12 × factor ×
  scale, fill = the identity colour 8 lightness points darker (`hexToHsl` / `hslToString` from
  `src/utils/colorUtils.ts`), stroke
  light colour .8, opacity `.95 × scale`, rotated `1.5 × sw`; a radial glow `<circle>` behind it
  (`1.8 × size`, opacity `.45 × scale`); one `<line>` per orbiter from its live centre to `c`, identity
  colour, width .7, opacity `SALVAGE_WIRE_OPACITY` 1 × scale.
- **Slack wires** (`f ∈ [.55, .9)`, `q = (f − .55) / .35`): one `<path>` per orbiter, a quadratic from
  its live centre to `drop = b + (0, SALVAGE_HANG)`, control point at the mid `x` and
  `max(y) + SALVAGE_SAG (16) × smooth(q)`; opacity `SALVAGE_WIRE_OPACITY × (1 − q)`. Hidden otherwise.

### 1.8 Maintenance — sparks + flash (`decor/maintenanceDecor.ts`)

Window: ring `t0` to `t1` plus one spark life (`MAINT_SPARK_LIFE × factor`), clamped to the job — *as
built (Task 7):* a chord near the end of the ring has most of its 1.2 s life left when the ring ends, so
a window that stopped at `t1` would remove the group with those sparks still lit (a pop). Per orbiter, per spark chord `k` (its `sparkChords`), event time
`t0 + (k + .5) / RING_SEGMENTS × (t1 − t0)` and event position = the ring point at angle
`startAngle + direction × 2π × RING_REVOLUTIONS × (k + .5) / RING_SEGMENTS` (a fixed point; the
orbiter is there then). Age fraction `a` over `MAINT_SPARK_LIFE` 1.2 s × factor:

- **Flash**: a radial-gradient `<circle>` at the event position, radius `MAINT_FLASH_RADIUS (12) × (1 − a / .5)`
  while `a < .5`, opacity .8; light colour.
- **Sparks**: `MAINT_SPARKS` (5) `<line>`s per chord, direction
  `angle + (sparkDirs[corner][chordIndex][s % 3] − .5) × MAINT_SPREAD (120°)` (`sparkDirs` has three
  draws per chord and a chord shows five sparks, so the index wraps, as in the sketch), from the event position
  `+ dir × MAINT_SPARK_REACH (30 × factor) × smooth(a)`, length `MAINT_SPARK_LENGTH (8) × (1 − a)`,
  opacity `1 − a`; spark 0 light colour, the rest identity.

Node counts are fixed per run, created once: `(1 + MAINT_SPARKS)` per spark chord, so at most
`orbiters × FLICKER_SPARKS × (1 + MAINT_SPARKS)` (two draws on one chord spark once, `sparkChords`
de-duplicates, and that chord gets one set of nodes). *As built:* the pure state is `sparkEvents(ring,
toRow)`, `sparkAt(t, event, s, v)`, `flashAt(t, event, v)` and `maintenanceWindow(ring, v, duration)`;
the plan's `v` on `sparkEvents` and `knobs` on `sparkAt` were dropped (the events need no variation and
the knobs are the `MAINT_*` constants). Positions are row-local, so reach and length scale with the back
row. A spark born in the last few chords can still be cut by the reattach (the window ends at the job's
end), at an alpha of at most about 0.3.

### 1.9 Variation and tier (`variation.ts`, `decor/decorTier.ts`)

`WorkVariation` gains, in draw order after `sparks`: `sparkDirs: number[4][3][3]`,
`moteDrift: number[4][4]`, `swingPhase` (`[0, 2π)`), `loadSeed` (`[0, 1)`), then
`decor: { ventRise, ventLife, surveyReach, surveyLife, trailLength, tickLife, dropLag, valveSize, hang, loadSize, sparkReach, sparkLife }`,
each `1 − DECOR_JITTER + rand() × 2 × DECOR_JITTER`, `DECOR_JITTER` 0.15. The "× factor" above is these.
Counts and opacities never vary.

`decorTier(robotLoad: number): 'none' | 'cheap' | 'all'` compares the Robot Load slider's value
(`useAudioStore.getState().robotLoad`, read once at job start in `work()` beside `bpm`) with
`DECOR_TIER_BELOW_STANDARD` / `DECOR_TIER_BELOW_FULL`, both `'all'` today (Assumption 9). `'cheap'` =
ticks, valve, sparks and flash (time-anchored, few nodes); `'all'` adds the wires, trails, arcs,
droplets and the load.

### 1.10 Reduced motion and what does not change

Reduced motion (`input.reducedMotion`) adds no group and no tween — the robot's opacity pulse plays
alone. The moves, their timing, targets, `moveWindows`, `jobDuration`, the lock/unlock contract, the
counter-bob on the orbiters, cards, the avatar, the station arcs and the halo are untouched. No new
dependency. The Visual Mapping guardrail is not amended: decorations are job state, not audio.

## 2. Target File Structure

```
src/animation/jobMoves/
  buildJobTimeline.ts / .test.ts     edit — PlannedStep.events, addJobDecor call, decorTier input
  jobMoveTable.ts                    edit — MoveEvents types (or decor/events.ts; plan decides)
  variation.ts / .test.ts            edit — appended draws (Assumption 7), DECOR_JITTER
  carry.ts                           edit — export LOADED/ARRIVED/DROPPED/RETURNED
  bob.ts                             NEW — `bob`, moved out of buildJobTimeline.ts so jobDecor.ts can share it without an import cycle
  decor/
    jobDecor.ts / .test.tsx          NEW — group lifecycle, counter-bob, builder dispatch, cleanup
    frames.ts / .test.ts             NEW — sceneToRowLocal, orbiterLocalToRowLocal
    polyline.ts / .test.ts           NEW — polyAt, polyLen, polyVertices (ported from the sketch)
    decorTier.ts / .test.ts          NEW — decorTier, DECOR_TIER_* constants
    ventDecor.ts / .test.ts          NEW — ventState + addVentDecor, VENT_*
    surveyDecor.ts / .test.ts        NEW — surveyState + addSurveyDecor, SURVEY_*
    inspectionDecor.ts / .test.ts    NEW — inspectionState + addInspectionDecor, INSPECT_*
    fluidDecor.ts / .test.ts         NEW — fluidState + addFluidDecor, FLUID_*
    salvageDecor.ts / .test.ts       NEW — salvageState + addSalvageDecor, SALVAGE_*
    maintenanceDecor.ts / .test.ts   NEW — maintenanceState + addMaintenanceDecor, MAINT_*
src/systems/workLoop.ts / tests      edit — decorTier passed into buildJobTimeline
src/components/robot/gem/RobotGem.test.tsx   edit — no <filter> guard extended to .robot__work
src/docs/jobDecorationDocs.test.ts   NEW — doc symbols/tables vs code
docs/ANIMATION_SYSTEM.md             edit — "Job decorations" after "Job moves"
docs/ROBOT_LIFECYCLE.md              edit — one line under the work loop
docs/PERFORMANCE.md                  add — the Phase 52 idle-paint gate
docs/todo/roadmap.md                 add — Phase 52
docs/intent/job-decorations.md       edit — Shipped header
docs/sketches/job-decorations.html   edit — STATUS header
```

## 3. Implementation Boundaries & Constraints

- **Always:** every shape's alpha 0 at both ends of its window; nodes created once per run, removed on
  complete *and* on kill; one write hook (`ctx.run`) per decoration; identity + light colour only; constants from
  the sketch's defaults, each `UPPER_SNAKE` with its sketch row in the comment; new variation draws
  appended, never inserted; `npm run build:types`, `npm run lint`, `npm test` before every commit;
  state functions unit-tested without the DOM.
- **Ask first:** changing any §1.3–§1.8 number (the sketch is binding — change it there first); varying
  a count or an opacity; a third varied knob per row; the company colour on any decoration; a
  decoration on cards or the avatar; binding the tier thresholds before the gate says so; touching move
  timing or targets; a scene-level layer instead of `.robot__row`.
- **Never:** BeatClock, Transport, `AudioEngine` or a store read inside a tween callback; timers or
  `requestAnimationFrame`; an SVG `<filter>`; a timeline, element or node list in Zustand or React
  state; a display string in a component; a pop; a per-run or audio-driven random source.

## 4. Code Style & Architecture Conventions

Same split as the halo waves: a pure state function computes shapes from `(u, events, variation,
frames)`; an `add…` function owns the nodes and the one tween. The state function is what the tests
pin:

```ts
/** Where orbiter j's mote k is at time t (row-local), or null when unborn or dead. Sketch: ventExtraction. */
export function moteAt(t: number, j: number, k: number, ev: PulseEvents, v: WorkVariation, mouth: Vec2): Mote | null {
  const born = ev.orbs[j].start + (k * ev.slot) / VENT_MOTES;
  const life = VENT_MOTE_LIFE * v.decor.ventLife;
  const a = (t - born) / life;
  if (a < 0 || a > 1) return null;
  const drift = v.moteDrift[ev.orbs[j].corner][k] - 0.5;
  return {
    x: mouth.x + drift * 10 * a,
    y: mouth.y - VENT_MOTE_RISE * v.decor.ventRise * smooth(a),
    r: VENT_MOTE_RADIUS * (1 - a),
    alpha: 0.9 * (1 - a),
  };
}
```

Class names `robot__work`, `robot__work-wire`, `-glow`, `-mote`, `-arc`, `-chord`, `-trail`, `-tick`,
`-drop`, `-valve`, `-load`, `-spark`, `-flash`; gradient ids `work-${robotId}-${name}[-j]`. Section
banners and file headers as in `ring.ts`.

## 5. Testing & Verification Requirements

- **`frames.test.ts`:** `sceneToRowLocal` ∘ its inverse is identity for 50 gems at layer 1 and 0.75;
  `orbiterLocalToRowLocal({0,0})` is the dock centre × bodyScale about `c`; a point mapped through
  `sceneToOrbiterLocal` then `orbiterLocalToRowLocal` equals `sceneToRowLocal` (1e-6).
- **`polyline.test.ts`:** `polyAt` at 0/1 returns the ends, constant speed across unequal segments;
  `polyVertices` u's non-decreasing, directions unit.
- **`variation.test.ts`:** draw order extended (Assumption 7); every `decor` factor in
  `[0.85, 1.15]` and spread over 500 seeds; the pre-existing draws' values unchanged for a pinned seed
  (mutation: inserting a draw before `sparks` fails it).
- **Per-decoration state tests** (no DOM): each row's defaults reproduce the sketch at three sampled
  times (hand-computed), alpha 0 at both window ends, hidden outside windows, factor scaling (rise ×
  1.15 moves a mote 15 % higher), count-1 and count-4 shapes, ring at `n = 2` has one chord, inspection
  ticks skip the route's ends, valve angle piecewise-linear with a slope step at each pulse start,
  slack wires only in `[.55, .9)`. Mutation checks: a constant halved fails its row.
- **`jobDecor.test.tsx`** (real GSAP, paused global timeline): a run appends exactly one
  `.robot__work` to `.robot__row` after `g.gem`; node counts per job as specified; `progress(0.5)`
  writes non-empty attributes; `progress(1)` → group removed; `kill()` mid-run → group removed
  (Assumption 5); reduced motion → no group; tier `'none'` → no group, `'cheap'` → only the cheap
  classes; no `<filter>`; the counter-bob keeps a wire end on its scene point while `.robot` bobs
  (sample three bob phases, 1e-3).
- **`buildJobTimeline.test.ts`:** `events` shapes (§1.2); the timeline's duration is still exactly
  `jobDuration(bpm)` with decorations on; the silent finish leaves no group; every orbiter at rest.
- **`workLoop` tests:** `decorTier` input passed from `robotLoad`; a stopped loop leaves no
  `.robot__work` in the document.
- **Docs test:** symbols exist in their files; ANIMATION_SYSTEM's decoration table rows match the
  `JOB_MOVES` keys; roadmap Phase 52 links intent, spec, plan, sketch; intent headed Shipped.
- **Perf gate (before the docs task; stop and report):** parent tip and this branch, production builds
  side by side, `npm run perf:idle --throttle 1 --only none`, same pinned `?session=` with several
  robots working, foreground, one run at a time, orphaned-Chrome count 0, four alternated rounds
  (docs/PERFORMANCE.md). Pass = busy and paint medians inside the parent's spread. Miss → bind the tier
  constants (Assumption 9) and re-measure at Standard; a second miss → halve `INSPECT_TRAIL_SEGMENTS`
  and `FLUID_DROPS` on `'cheap'`. Crawford picks the rung. Then his Pixel listen (Full): no new
  dropouts.
- **Gate (Crawford, by eye):** each job tellable from across the world at zoom 1; nothing pops at a
  move boundary or the reattach; wires read as wires; the back row's decorations shrink with it; two
  company-mates work visibly differently; reduced motion shows none.

## 6. Git & Workflow Context

- Branch `feature/job-decorations` off `various-small-fixes`' tip (the sketch, intent and halo-waves
  precedent live there); rebase onto main when that branch merges. One commit per task; the perf gate
  a stop-and-report; the visual gate before the docs task. `git branch --show-current` before every
  commit; commit messages via `-F <scratch file>`; the Edit tool for TS template literals.
- TDD per task (RED first); mutation-check each state test by breaking its constant. Roadmap
  `## 52. Job Decorations`.

## 7. Open Questions

1. **Battery dim.** The halo waves multiply their alpha by the robot's dim opacity. Decorations play
   only while Active (never critical), so the proposal is **no dim** — simpler, and the sketch has none.
   Confirm or route `dimOpacity` through the group's opacity.
2. **Identity vs company colour.** The halo wears the company colour; the orbiters and these
   decorations the identity colour (intent). Confirm identity.
3. **Count 1.** Vent/Survey/Inspection/Fluid/Maintenance degrade naturally; Salvage hangs the load on
   one wire; the survey polygon vanishes. Accept as sketched.
4. ~~**`onInterrupt` on timelines.**~~ Resolved in Task 6: it fires on a mid-run kill but not after the
   silent finish (progress already 1), so `kill()` is wrapped instead (Assumption 5).
5. **Droplet lag × count exceeds short runs.** At 200 BPM (6 s job, ~2.3 s trace) only ~7 of 10 drops
   start. Keep Crawford's numbers (sketch-binding) or cap `FLUID_DROPS × lag` at the run? Proposal: keep.
6. ~~**Load fill helper.**~~ Resolved while writing: `src/utils/colorUtils.ts` has `hexToHsl` and
   `hslToString`; the load fill uses them (§1.7).
