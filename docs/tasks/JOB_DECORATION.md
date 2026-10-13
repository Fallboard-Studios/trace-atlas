# Implementation Plan: Job Decorations

Spec: [docs/specs/JOB_DECORATION.md](../specs/JOB_DECORATION.md). Intent:
[docs/intent/job-decorations.md](../intent/job-decorations.md). Sketch:
[docs/sketches/job-decorations.html](../sketches/job-decorations.html) (Verdict 1, its defaults are the
constants). Branch `feature/job-decorations` from `various-small-fixes`' tip. Roadmap Phase 52 (proposed).

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf:idle --throttle 1 --only none` (after `npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: T1–T14 done and T16 docs done (2026-10-13). T14 perf gate missed, accepted by Crawford (2026-10-13). T15 Pixel run NOT RUN: Crawford could not test and asked to continue; it is still owed. See "Perf gate results".** Originally planned 2026-10-12. Spec assumptions 1–10 and open questions 1–5 are
> Crawford's to confirm before Task 1; the defaults the tasks assume are: no battery dim (Q1), identity
> colour (Q2), count-1 shapes as sketched (Q3), `onInterrupt` pinned by T6 (Q4), droplet numbers kept (Q5).

## Overview

Sixteen tasks in four phases. **Phase 1** is five pure or near-pure foundations with no visible effect:
the two row-local frames, the polyline helpers, the appended variation draws, the typed plan events, and
the load-tier plumbing threaded from the work loop into `buildJobTimeline`. **Phase 2** is the run
lifecycle (the riskiest piece: node creation, counter-bob, cleanup on complete and on kill) followed by six
vertical slices, one job each, every slice a pure state module plus its builder plus its wiring, visible in
the world as soon as it lands. Ordered simplest first (Maintenance, time-anchored only) to hardest (Salvage,
live positions + phases). **Phase 3** is the integration test, the idle-paint perf gate (stop and report)
and Crawford's visual gate. **Phase 4** is docs. Every task leaves types, lint and the suite green; RED
first; one commit per task; mutation-check each state test by breaking the constant it guards.

## Architecture Decisions

- **Pure state, thin builders.** Each `…State`/`…At` function returns plain shape data from
  `(t, events, variation, frames)`; tests pin the maths without the DOM. The `add…` builder only creates
  nodes once and writes attributes in one proxy tween's `onUpdate`. GSAP tests check node counts,
  cleanup and a few sampled attributes, never the maths.
- **Lifecycle before looks (T6 before T7–T12).** The group, the counter-bob and both cleanup paths are
  built and tested with a stub builder first, so every decoration task inherits a proven container and
  the `onInterrupt` question (Q4) is answered before any visual work.
- **Events from the plan (T4).** `planStep` grows a typed `events` field; decorations never re-derive
  tweened positions. Live orbiter positions are read with `gsap.getProperty` only where a shape is
  anchored to an orbiter.
- **Frames are pure inverses (T1)** of the frames `sceneToOrbiterLocal` already documents, tested by
  round trip.
- **Variation appended (T3).** Draw order extended after `sparks`; a pinned-seed test proves no existing
  draw moved.
- **Tier plumbing early, thresholds unbound (T5).** The work loop reads `robotLoad` beside `bpm` from the
  first slice, so binding the ladder after a perf miss is a constants change.
- **One slice per job, each independently revertable.** A slice's builder registers itself in
  `jobDecor.ts`'s dispatch table; removing a slice removes one entry and its files.

## Dependency Graph

```
T1 frames ─────────────┐
T2 polyline ───────────┤
T3 variation draws ────┼─► T6 jobDecor lifecycle (stub builder) ─► T7 maintenance ─► T8 vent ─► Checkpoint B
T4 plan events ────────┤                                                                   │
T5 decorTier + loop ───┘                                                                   ▼
        Checkpoint A                              T9 inspection ─► T10 fluid ─► T11 survey ─► T12 salvage
                                                                                                │
                                              Checkpoint C (visual gate) ◄── T13 integration ◄──┘
                                                                │
                                              T14 perf gate (STOP) ─► T15 Pixel + sign-off ─► T16 docs ─► Complete
```

T1–T5 are independent of each other and may land in any order (or in parallel sessions). T7–T12 each
depend only on T6 and on whichever of T1–T4 their row uses; their order is a recommendation, not a
dependency.

## Phase 1: Foundations (nothing visible)

### Task 1: Row-local frames

**Description:** `decor/frames.ts` with `sceneToRowLocal(p, { robotPos, gem, layerScale })` and
`orbiterLocalToRowLocal(local, { gem, bodyScale, corner })` (spec Assumption 4), plus their inverses used
only by the tests. Pure; no GSAP.

**Acceptance criteria:**
- [ ] `sceneToRowLocal` = `c + (p − robotPos − c) / layerScale`, `c` the canvas centre from `gemWidth`/`GEM_CANVAS_H`.
- [ ] `orbiterLocalToRowLocal` = `c + (local + dockCentre(corner) − c) × bodyScale`; `{0,0}` → the dock centre scaled about `c`.
- [ ] For 50 seeded gems, layer 1 and 0.75, body 0.735/1/1.69: `sceneToOrbiterLocal` then `orbiterLocalToRowLocal` equals `sceneToRowLocal` within 1e-6; round trips are identity.
- [ ] A non-positive scale throws `RangeError` like `sceneToOrbiterLocal`.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/frames.test.ts`
- [ ] `npm run build:types && npm run lint`

**Dependencies:** None. **Files:** `src/animation/jobMoves/decor/frames.ts`, `frames.test.ts`. **Scope:** S.

### Task 2: Polyline helpers

**Description:** `decor/polyline.ts` ports the sketch's `polyLen`, `polyAt(route, u)` (constant speed,
clamped) and `polyVertices(route)` (each vertex's `u` and unit direction, incoming/outgoing averaged, the
ends one-sided). Pure.

**Acceptance criteria:**
- [ ] `polyAt` at 0 and 1 returns the ends; at 0.5 on two unequal segments lands by length, not by vertex count; a one-vertex route returns that vertex.
- [ ] `polyVertices` u's are non-decreasing from 0 to 1; directions have unit length; a repeated vertex gets the neighbour's direction (no NaN).
- [ ] `polyLen` of a closed-looking route (first = last) counts every segment.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/polyline.test.ts`

**Dependencies:** None. **Files:** `decor/polyline.ts`, `polyline.test.ts`. **Scope:** S.

### Task 3: Appended variation draws

**Description:** `workVariation` gains, after `sparks` and in this order, `sparkDirs` (4×3×3), `moteDrift`
(4×4), `swingPhase`, `loadSeed`, then `decor` (twelve factors in `[1 − DECOR_JITTER, 1 + DECOR_JITTER]`,
`DECOR_JITTER` 0.15 in `constants/index.ts`, keys per spec §1.9). `carry.ts` exports `LOADED`, `ARRIVED`,
`DROPPED`, `RETURNED`.

**Acceptance criteria:**
- [ ] For a pinned seed, every pre-existing field (`order`, `ringDirection`, `radiusScale`, `traceReversed`, `phase`, `sparks`) keeps the value the current test fixture shows (mutation: inserting one draw before `sparks` fails this).
- [ ] The draw-order test extends to the new fields in the stated order.
- [ ] Over 500 seeds every `decor` factor stays in `[0.85, 1.15]` and spreads (min < 0.9, max > 1.1); `swingPhase` in `[0, 2π)`; `loadSeed` in `[0, 1)`; both `loadSeed < 0.5` and `≥ 0.5` occur.
- [ ] Counts and opacities have no factor (the `decor` key set is exactly the twelve).

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/variation.test.ts src/animation/jobMoves/carry.test.ts`

**Dependencies:** None. **Files:** `variation.ts`, `variation.test.ts`, `carry.ts`, `constants/index.ts`. **Scope:** S.

### Task 4: Typed plan events

**Description:** `PlannedStep` gains `events: MoveEvents` (spec §1.2 union, in `decor/events.ts`) filled by
`planStep` for all five moves from the data it already computes: windows, targets, ranks/starts, routes,
ring angles and spark chords, carry offsets. `buildJobTimeline` keeps the events per step on the
returned timeline's `data` (`{ events: MoveEvents[] }`) for T6 and the tests. No behaviour change.

**Acceptance criteria:**
- [ ] For each job at 20 and 200 BPM, `events[k].t0/t1` equal `moveWindows(...)[k].start/end`.
- [ ] Pulse/fan `orbs[j].start` = `t0 + ranks[j] × slot`; trace `starts`/`run` match `traceTimes`; ring `sparkChords` equal `sparkChords(v.sparks[corner], RING_SEGMENTS)` and `startAngle` matches `ringStartAngles`; carry `offset` matches `carryTargets`.
- [ ] Targets are scene units (a pulse target equals `hoverPulseTargets(...)[j]`).
- [ ] Existing `buildJobTimeline` tests unchanged and green; the timeline still lasts exactly `jobDuration(bpm)`.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/buildJobTimeline.test.ts`

**Dependencies:** None. **Files:** `decor/events.ts`, `buildJobTimeline.ts`, `buildJobTimeline.test.ts`. **Scope:** S.

### Task 5: Load tier plumbing

**Description:** `decor/decorTier.ts`: `decorTier(robotLoad)` → `'none' | 'cheap' | 'all'` from
`DECOR_TIER_BELOW_STANDARD` and `DECOR_TIER_BELOW_FULL` (both `'all'` today) against
`AUDIO_LOAD_PRESETS`. `JobTimelineInput` gains `decorTier`; `work()` in `workLoop.ts` passes
`decorTier(useAudioStore.getState().robotLoad)` beside `bpm`. Unused by the timeline until T6.

**Acceptance criteria:**
- [ ] `decorTier(0.2)`, `(0.6)`, `(1)` are all `'all'` with today's constants; a test that temporarily substitutes the ladder (`'none'`/`'cheap'`) gets Light → none, Standard → cheap, Full → all, and a value between presets takes the lower tier.
- [ ] A workLoop test sees `buildJobTimeline` called with `decorTier: 'all'` and, with `robotLoad` set to 0.2 and the ladder substituted, `'none'`.
- [ ] No store read inside any tween callback (grep-level test on `jobDecor`/`buildJobTimeline` sources for `useAudioStore`: absent).

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/decorTier.test.ts src/systems/workLoop.test.ts`

**Dependencies:** None. **Files:** `decor/decorTier.ts`, `decorTier.test.ts`, `buildJobTimeline.ts`, `workLoop.ts`, `workLoop.test.ts`. **Scope:** M.

### Checkpoint A: Foundations
- [ ] `npm test`, `npm run build:types`, `npm run lint` green; `npm run build` clean.
- [ ] Nothing visible changed (no `.robot__work` exists anywhere yet).

## Phase 2: Lifecycle, then one slice per job

### Task 6: Run lifecycle with a stub builder

**Description:** `decor/jobDecor.ts`: `addJobDecor(tl, input, events)` creates `<g class="robot__work"
data-job>` + `<defs>` in `robotEl.querySelector('.robot__row')` after `g.gem`, adds the counter-bob
(`−BOB_PX / layerScale`), looks the job up in a `BUILDERS` table (empty entries → no group), and registers
removal on the builder tween's `onComplete` and the job timeline's `onInterrupt`. `addWork` calls it when
`decorTier !== 'none'` and not reduced. `RobotGem.test.tsx`'s no-`<filter>` guard extends to any
`.robot__work`. The test injects a stub builder that adds one proxy tween and one `<line>`.

**Acceptance criteria:**
- [ ] A run appends exactly one `.robot__work` to `.robot__row`, last child, with a `<defs>`; a second run for the same robot (after the first's kill) leaves one.
- [ ] `progress(1)` removes the group; `kill()` at `progress(0.4)` removes the group (Q4 — if `onInterrupt` does not fire, the fallback `cleanup` path from spec Assumption 5 is built here instead and the spec amended).
- [ ] `reducedMotion: true` or `decorTier: 'none'` → no group, no extra tweens; a job with no builder → no group.
- [ ] Counter-bob: at three bob phases, a stub line whose end is set to `sceneToRowLocal(P)` stays on scene point `P` (compose the `.robot` y and the group y; 1e-3), at layer 1 and 0.75.
- [ ] A missing `.robot__row` (fixture) → no group, no throw; the silent finish (`progress(1, true)` then kill) leaves no group.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/jobDecor.test.tsx src/animation/jobMoves/buildJobTimeline.test.ts src/components/robot/gem/RobotGem.test.tsx`

**Dependencies:** T1, T4, T5. **Files:** `decor/jobDecor.ts`, `jobDecor.test.tsx`, `buildJobTimeline.ts`, `RobotGem.test.tsx`. **Scope:** M.

### Task 7: Maintenance — sparks + flash

**Description:** `decor/maintenanceDecor.ts`: `sparkEvents(events, v)` (per orbiter per chord: time and
ring position), `sparkAt(t, event, s, v, knobs)` and `flashAt(t, event)`; `addMaintenanceDecor` creates
`orbiters × FLICKER_SPARKS × (1 + MAINT_SPARKS)` nodes and one tween over the ring window. Registers in
`BUILDERS`. Constants `MAINT_*` from the sketch (5, 30, 8, 1.2, 120°, 12).

**Acceptance criteria:**
- [ ] Event time `t0 + (k + .5) / RING_SEGMENTS × (t1 − t0)`; event position on the ring at the chord's middle angle (matches `ringRoute` interpolation within 1e-6).
- [ ] Spark `s` of a chord at age fraction `a`: direction `angle + (sparkDirs[corner][chordIndex][s] − .5) × spread`, offset `reach × factor × smooth(a)`, length `8 × (1 − a)`, alpha `1 − a`; hidden outside `[0, life × factor]`; spark 0 light colour, others identity.
- [ ] Flash radius `12 × (1 − a / .5)` while `a < .5`, else hidden.
- [ ] `sparkLife`/`sparkReach` factors scale their quantities by exactly the factor (mutation: halving `MAINT_SPARK_REACH` fails).
- [ ] GSAP test: node count as above, `progress(eventTime / D + ε)` writes non-zero opacity on that chord's sparks, group gone at the end.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/maintenanceDecor.test.ts src/animation/jobMoves/decor/jobDecor.test.tsx`
- [ ] Manual: `npm run dev`, watch a Maintenance job (Vent-less hosts: masts/dishes) — sparks and a flash at the flicker dips.

**Dependencies:** T3, T6. **Files:** `decor/maintenanceDecor.ts`, `maintenanceDecor.test.ts`, `decor/jobDecor.ts`, `constants/index.ts`. **Scope:** S.

### Task 8: Vent Extraction — tethers + motes

**Description:** `decor/ventDecor.ts`: `moteAt(t, j, k, ev, v, mouth)` (spec §4 snippet), `pulseAmount(scale,
rest)`, `wireGlowAlpha`; `addVentDecor` creates per orbiter a base wire, a glow wire with a user-space
`<linearGradient>` in `<defs>` (id `work-${id}-vent-j`), and `VENT_MOTES` circles; one tween from
`t0 − VENT_FADE` to `t1 + VENT_FADE`. The first builder to read live orbiter positions
(`orbiterLocalToRowLocal(gsap.getProperty x/y)`) and live `scale`.

**Acceptance criteria:**
- [ ] `moteAt` reproduces the spec formula; null when unborn/dead; `ventRise`/`ventLife` factors apply.
- [ ] `pulseAmount` is 0 at rest, 1 at `rest × HOVER_PULSE_SCALE`, clamped.
- [ ] Window alpha 0 at `t0 − VENT_FADE` and `t1 + VENT_FADE`, 1 inside; every node opacity 0 at both ends.
- [ ] GSAP test: wire endpoints at `progress` mid-pulse equal the mouth (row-local) and the orbiter's live centre (1e-3); the gradient's `x1..y2` track them; glow `stop-opacity` > 0 only during that orbiter's pulse slot; node count `orbiters × (2 + VENT_MOTES)`.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/ventDecor.test.ts src/animation/jobMoves/decor/jobDecor.test.tsx`
- [ ] Manual: a Vent Extraction job — wires to the stack, glow on each pulse, motes rising.

**Dependencies:** T1, T3, T6. **Files:** `decor/ventDecor.ts`, `ventDecor.test.ts`, `decor/jobDecor.ts`, `constants/index.ts`. **Scope:** M.

### Checkpoint B: First two decorations live
- [ ] Suite, types, lint green; build clean.
- [ ] Crawford's dev look (optional, early signal): sizes and colours match the sketch at his settings; no pop at the reattach; the back row's decorations shrink with it. Report before continuing if anything reads wrong.

### Task 9: Structural Inspection — scan trail + vertex ticks

**Description:** `decor/inspectionDecor.ts`: `trailSegments(t, orbIndex, ev, v)` (N segments along the route
behind `u`), `tickAt(t, vertex, ev, v)`; `addInspectionDecor` creates `orbiters × INSPECT_TRAIL_SEGMENTS`
lines + one line per interior vertex, one tween over the trace window. Uses T2's helpers.

**Acceptance criteria:**
- [ ] Segment `k` spans `polyAt(route, u − back(k − 1)/N)` → `polyAt(route, u − back k/N)`, hidden when its tail `u` < 0 or the orbiter's `u` ∉ (0, 1]; width `4 × fade`, opacity `1 × fade`; first two segments light colour.
- [ ] `trailLength` factor scales `back`; the trail length in scene units equals `20 × factor` along the route (sum of segment lengths, 1e-3) when fully extended on a straight route.
- [ ] Ticks: only interior vertices; pass time `lead.start + v.u × run` (lead = rank 0); half-length grows over 0.1 s; opacity `0.9 × (1 − age / (3 × tickLife))`; perpendicular to the vertex direction (dot product 0).
- [ ] GSAP test: node counts; at `progress` mid-run the lead's first trail segment's start equals the lead orbiter's live centre (1e-3).

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/inspectionDecor.test.ts src/animation/jobMoves/decor/jobDecor.test.tsx`
- [ ] Manual: a Structural Inspection job on a factory — trails along the roofline, ticks at the corners.

**Dependencies:** T2, T3, T6. **Files:** `decor/inspectionDecor.ts`, `inspectionDecor.test.ts`, `decor/jobDecor.ts`, `constants/index.ts`. **Scope:** M.

### Task 10: Fluid Monitoring — droplets + spinning valve

**Description:** `decor/fluidDecor.ts`: `dropAt(t, k, ev, v)`, `valveAngle(t, pulseStarts, base, step)`
(piecewise integral), `valveState(t, ev)`; `addFluidDecor` creates `FLUID_DROPS` circles, a radial-gradient
glow circle (gradient in `<defs>`), two rects; one tween from trace `t0` to pulse `t1`.

**Acceptance criteria:**
- [ ] Drop `k` at `polyAt(route, (t − lead.start − k × lag × dropLag) / run)`, hidden outside (0, 1]; wobble `±0.8 sin(9t + k)`; radius/opacity fade by `k`.
- [ ] `valveAngle` is continuous, piecewise linear, slope `base + n × step` after `n` pulse starts (exact at three sampled times); the outer rect rotates `+angle`, the inner `−angle`.
- [ ] Valve size `14 × valveSize × windowAlpha`, alpha 0 at pulse `t0` and `t1` (0.3 s edges).
- [ ] At 200 BPM with defaults, drops whose `(k × lag) > run` never show (Q5 recorded, not "fixed").
- [ ] GSAP test: node count `FLUID_DROPS + 3`; the `transform` attribute of the outer rect carries `rotate(angle cx cy)` matching `valveAngle` (1e-2) at a sampled time.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/fluidDecor.test.ts src/animation/jobMoves/decor/jobDecor.test.tsx`
- [ ] Manual: a Fluid Monitoring job on the pipeline/refinery — drops along the pipe, the valve spinning faster each pulse.

**Dependencies:** T2, T3, T6. **Files:** `decor/fluidDecor.ts`, `fluidDecor.test.ts`, `decor/jobDecor.ts`, `constants/index.ts`. **Scope:** M.

### Task 11: Acoustic Survey — ping arcs + wired ring

**Description:** `decor/surveyDecor.ts`: `pingArc(t, j, a, ev, v)` (arc path data), `chordState(t, ringEv)`
(window alpha); `addSurveyDecor` creates `orbiters × SURVEY_ARCS` paths plus, for `n ≥ 2`, `n` (or 1 when
`n = 2`) base lines and glow lines with ends-bright user-space gradients; one tween from fan `t0` to ring `t1`.

**Acceptance criteria:**
- [ ] Arc `a` of orbiter `j`: starts `orbs[j].start + a × 0.15`, life `1.4 × surveyLife`; radius `3 + 36 × surveyReach × smooth(p)`; span 80° about `atan2(dir)`; width `1.2 → 0.3`; alpha `0.9 (1 − p)`; path `d` uses the large-arc flag correctly for spans ≤ 180°.
- [ ] Chords: `n = 1` → none; `n = 2` → one; `n ≥ 3` → `n` consecutive pairs in lock order; alpha 0 at ring `t0` and `t1` with 0.35 s edges.
- [ ] GSAP test: chord endpoints at `progress` mid-ring equal consecutive orbiters' live centres (1e-3); gradient `x1..y2` track them; arcs hidden during the ring.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/surveyDecor.test.ts src/animation/jobMoves/decor/jobDecor.test.tsx`
- [ ] Manual: an Acoustic Survey job on a mast — arcs on each ping, the polygon turning with the ring.

**Dependencies:** T1, T3, T6. **Files:** `decor/surveyDecor.ts`, `surveyDecor.test.ts`, `decor/jobDecor.ts`, `constants/index.ts`. **Scope:** M.

### Task 12: Salvage — wired load

**Description:** `decor/salvageDecor.ts`: `loadScale(f)`, `loadPose(f, centres, v)` (centre, swing, shape
points), `slackWire(f, from, b)`; `addSalvageDecor` creates the glow circle, the polygon, `n` wires and `n`
slack paths; one tween over the carry window. Load fill via `hexToHsl`/`hslToString` (−8 lightness).

**Acceptance criteria:**
- [ ] `loadScale`: 0 at `f = 0`, 1 on `[.1, .45]`, 0 from `.55`, smooth in between (uses `carry.ts`'s exported phases).
- [ ] Swing is 0 outside the carry phase and at its ends, bounded by `10°`; `swingPhase` shifts it; centre hangs `24 × hang` below the live centroid along the swung direction.
- [ ] Shape: diamond for `loadSeed < .5`, hexagon otherwise; size `12 × loadSize × scale`; polygon rotated `1.5 × sw`.
- [ ] Slack wires exist only for `f ∈ [.55, .9)`: quadratic from the live orbiter centre to `b + (0, 24 × hang)`, sag `16 × smooth(q)`, alpha `1 − q`.
- [ ] GSAP test: node count `2 + 2n`; at `progress` mid-carry each wire's end equals the load centre and its start the orbiter's live centre (1e-3); at `f = .95` every node opacity 0.

**Verification:**
- [ ] `npx vitest run src/animation/jobMoves/decor/salvageDecor.test.ts src/animation/jobMoves/decor/jobDecor.test.tsx`
- [ ] Manual: a Salvage job at a warehouse — the load lifts, swings, drops; wires sag and fade on the way back.

**Dependencies:** T1, T3, T6. **Files:** `decor/salvageDecor.ts`, `salvageDecor.test.ts`, `decor/jobDecor.ts`, `constants/index.ts`. **Scope:** M.

## Phase 3: Integration and gates

### Task 13: Work-loop integration

**Description:** `workLoop.integration.test.ts` gains: a job run with real GSAP shows one `.robot__work`
while working and none after; `stopWorkLoop()` mid-job leaves none; a `robotLoad` edit mid-job does not
retime or remove the running decoration (read once at job start); reduced motion → none. Fix anything
these surface.

**Acceptance criteria:**
- [ ] The four cases above pass against the real loop with the paused global timeline stepped per frame (the file's existing harness).
- [ ] `killAllTimelines()` (world transition) leaves no `.robot__work` in the document.

**Verification:**
- [ ] `npx vitest run src/systems/workLoop.integration.test.ts`, then `npm test`

**Dependencies:** T6–T12. **Files:** `workLoop.integration.test.ts` (+ fixes). **Scope:** S.

### Checkpoint C: Visual gate (Crawford, by eye)
- [ ] Each job tellable from across the world at zoom 1; nothing pops at a move boundary or the reattach; wires read as wires; back-row decorations shrink with the row; two company-mates work visibly differently; reduced motion shows none.
- [ ] Record verdicts in the sketch's STATUS header and the spec; a constant change lands in the sketch first.

### Task 14: Idle-paint perf gate — STOP and report

**Description:** Parent tip (`various-small-fixes`) and this branch, production builds served side by side,
`npm run perf:idle --throttle 1 --only none`, one pinned `?session=` with several robots working,
foreground, one run at a time, orphaned Chrome 0, four alternated rounds (docs/PERFORMANCE.md,
`perf-harness-measurement-hygiene`). Report medians and the parent's spread; do not act on a miss.

**Acceptance criteria:**
- [ ] Busy and paint medians inside the parent's run-to-run spread → pass, recorded in the plan and docs/PERFORMANCE.md.
- [ ] Miss → stop; Crawford picks the rung: (1) bind the tier ladder (T5 constants) and re-measure at Standard; (2) halve `INSPECT_TRAIL_SEGMENTS` and `FLUID_DROPS` on `'cheap'`; each rung its own commit and re-measure.

**Verification:**
- [x] The run table in this file under "Perf gate results".

**Dependencies:** T13. **Files:** this plan, `docs/PERFORMANCE.md` (results only). **Scope:** S.

### Task 15: Pixel listen + sign-off (Crawford)

**Description:** Crawford runs the branch on the Pixel at Full with a working fleet: no new dropouts, no
visible stutter on a job. Any tuning request goes to the sketch first, then the constant, then this plan.

**Status: NOT RUN (2026-10-13).** Crawford could not test on the Pixel and asked to continue as if it were fine. That is a
decision to proceed, recorded as such in docs/PERFORMANCE.md; it is not a pass, and this task stays open until he runs it
(LAN production preview, Full, working fleet, about 3 minutes, `?debug` optional).

**Acceptance criteria:**
- [ ] "Pixel is fine" (or the tuning loop closed) recorded here with the date.

**Dependencies:** T14. **Scope:** —.

## Phase 4: Docs

### Task 16: Docs and roadmap

**Description:** ANIMATION_SYSTEM.md gains "Job decorations" after "Job moves" (the lifecycle, the frames,
the per-job table, the tier, the keys); ROBOT_LIFECYCLE.md one line under the work loop; PERFORMANCE.md
the Phase 52 gate row; roadmap `## 52. Job Decorations` (About, decisions, links); intent headed Shipped;
sketch STATUS header; `src/docs/jobDecorationDocs.test.ts` pins symbols and the table against `JOB_MOVES`.

**Acceptance criteria:**
- [x] Docs test green: every named symbol exists in its file; the decoration table's job keys equal `Object.keys(JOB_MOVES)`; roadmap entry links intent, spec, plan, sketch; intent headed Shipped.
- [x] No doc claims a number that differs from its constant (the test reads the constants).

**Verification:**
- [x] `npx vitest run src/docs/jobDecorationDocs.test.ts`, then `npm test`

**Dependencies:** T15. **Files:** the five docs, the roadmap, the intent, the sketch header, the docs test. **Scope:** M (docs only).

### Checkpoint: Complete
- [ ] All acceptance criteria met; suite, types, lint, build green.
- [ ] Spec open questions 1–5 each carry a recorded answer.
- [ ] Branch pushed; PR references spec §1 per decoration.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `onInterrupt` does not fire for a killed timeline → leaked nodes after the silent finish or a world transition | High | T6 pins it first with a stub; fallback `cleanup` path specified (Assumption 5) |
| Per-frame `gsap.set` on ~40 nodes per working robot pushes idle paint past J4's accepted ceiling on the Pixel | High | T14 gate with the ladder; tier plumbing already in place (T5); node counts fixed per run |
| Reading live orbiter `x`/`y` inside `onUpdate` sees a stale value on a seek | Med | T6/T8 tests sample at `progress()` after `gsap.globalTimeline` is stepped, the same harness as T22/T23 of Phase 43 |
| Gradient `userSpaceOnUse` coordinates in a scaled row read wrong on the back row | Med | T8/T11 tests at layer 0.75; Checkpoint B's back-row look |
| Crawford's "big" numbers overwhelm the world at zoom 1 | Med | Checkpoint C; every number is one constant and the sketch is binding |
| Appended draws accidentally reorder existing variation | Low | T3's pinned-seed test + mutation check |

## Open Questions

Carried from the spec §7, defaults assumed above: Q1 no battery dim; Q2 identity colour; Q3 count-1 as
sketched; Q4 pinned by T6; Q5 droplet numbers kept. Any change lands in the spec before the task that
depends on it.

## Perf gate results

**Task 14, 2026-10-13: MISSED on busy and paint. Crawford accepted it and sent it to the Pixel run (T15); no rung applied.** Full method,
buckets and reasoning: [docs/PERFORMANCE.md](../PERFORMANCE.md) "Job Decorations — the Task 14 perf gate".

Branch `37ed92cb` (T13) vs parent `07274cf6` (`various-small-fixes`, the merge base), production builds side by
side, one pinned world (`alpha`, (0, 50), defaults), `npm run perf:idle --throttle 1 --only none`, foreground,
0 orphaned Chrome, four alternated rounds:

| Round (order) | Branch busy / paint (ms) | Parent busy / paint (ms) |
|---|---|---|
| 1 (branch first) | 1962 / 179 | 1741 / 153 |
| 2 (parent first) | 1987 / 184 | 1704 / 158 |
| 3 (branch first) | 1919 / 181 | 1773 / 153 |
| 4 (parent first) | 1832 / 184 | 1753 / 155 |
| **Median** | **1941 / 183** | **1747 / 154** |

Busy +11 %, paint +18.5 %. The parent's spread (busy 1704–1773, paint 153–158) excludes every branch run on both
metrics. About 172 of the 194 ms busy increase is `Animation frame` (the decorations' per-frame writes);
`TimerFire` is level, so it is not drift. Paint is the moving layers and the root (+27 of +28.5 ms).

**Rung note for Crawford's decision.** `decorTier` is `'all'` at Full whatever the ladder, so rung 1 (bind the
ladder) and rung 2 (halve trail segments and drops on `'cheap'`) cannot lower the cost measured here: the harness
and the Pixel run at Full. The options are in the T14 report.
