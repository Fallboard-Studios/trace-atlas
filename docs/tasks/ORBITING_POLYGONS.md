# Implementation Plan: Orbiting Polygons

Spec: [docs/specs/ORBITING_POLYGONS.md](../specs/ORBITING_POLYGONS.md). Intent:
[docs/intent/orbiting-polygons.md](../intent/orbiting-polygons.md). Branch
`feature/orbiting-polygons` from `back-to-gen-robots` (Phase 39 tip, unmerged). Roadmap Phase 40.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`,
`npm run build`, `npm run dev`, `npm run perf:idle --throttle 1 --only none` (after
`npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status: shipped, redesigned mid-build (2026-10-05), commit `7963135c`.** Tasks T1–T12 below
> built the orbit/drift design exactly as written and it's a complete, accurate record of that
> work — Gate 1 passed, Checkpoint C (the visual gate) passed, everything through T12 is real and
> unchanged. **T13 (the perf gate) missed** at +63% busy over the Phase 39 baseline, and rather than
> work the ladder in T13's own description, Crawford redesigned the feature: drift and the ring
> orbit are cut entirely; orbiters now dock at Top's corners on spawn and sit rigid with the body.
> T14–T16 (guardrail rewrite, ROBOT_DESIGN.md, roadmap) describe the *old* design's doc changes and
> were never executed as written — the actual doc updates for the shipped design are recorded in
> the spec itself (§8–§10) and in [[orbiting-polygons-redesigned-to-docking]], not here. See the
> spec's own header for the full story. This file is kept as the historical build record of T1–T12
> and is not being rewritten task-by-task to match the redesign.
>
> **Gate 1 (T1, the motion sketch) passed 2026-10-05.** Four spec changes came out of it and are
> folded into the tasks below (see the spec's Gate 1 note): one paired corner→centre hoop instead of
> x/y/z rings (no tilt band, seeded openness 0–0.3), orbits 4–8 s / drift 6–10 s, arcs with zero
> seeded freedom and drift faded out, and the one-arc-at-a-time queue over an explicit shown set.
> Remaining defaults Crawford kept at the gate: Q3 arc = `orbitDuration / 2`, Q4 behind dim 0.8,
> Q5 line/strip immediate. Q2 (drift always-on) is decided by the perf gate, T13.

## Overview

Sixteen tasks in five phases. Phase 1 is the optional motion sketch plus three pure modules (dials,
seeded plan, ring geometry) with no importer, each unit-tested without GSAP. Phase 2 changes the
renderer and `RobotBody` so the *static* dials (count, size, line width, strip) are visible on cards
and in the world before anything moves, and removes the flip — the first checkpoint Crawford can
see. Phase 3 builds the GSAP controller in four slices (mount + drift, orbits, count arcs, size)
and wires the world and avatar — the visual gate. Phase 4 is the idle-paint perf gate (stop and
report). Phase 5 rewrites the guardrail and docs. Every task leaves types, lint and the suite green;
RED first; one commit per task; mutation-check each rule test by breaking the constant it guards.

## Architecture Decisions

- **Pure first, GSAP last.** `ringPose`, `nextOrbit`, `orbiterPlan` and `orbiterDials` are
  functions of numbers; the hook only feeds them to tweens. Every rule is tested in T2–T4, so the
  GSAP tests in T8–T11 only check *which* tweens exist, not the maths.
- **Static dials ship before motion** (T5–T7). Cards never animate, so count/size/line/strip are
  fully exercised, visible and reviewable with no timeline in the tree; the controller then only
  adds motion on top of a correct resting layout.
- **Depth twins, GSAP-owned display** (spec Assumption 3–4). React emits all copies in animated
  contexts with no transform or display; the hook's mount `gsap.set` is the single source of truth
  for what is shown. A card is the `motion: false` path with React-owned count and scale.
- **One instance key per context.** `orbiters-${context}-${robotId}` — the avatar and the world
  show the same robot simultaneously, and `setTimeline` kills on duplicate keys.
- **Dial edits never interrupt motion.** Gap/duration are read from a ref when the next orbit is
  drawn; count changes queue behind in-flight arcs/orbits; size re-targets one keyed tween.
- **Flip removal is its own early commit** (T7b) — independent, low-risk, and reverting it alone
  must stay a one-commit operation.

## Dependency Graph

```
T1 motion sketch (Gate 1 — DONE, passed) ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐ (pinned the constants for T4/T8–T10)
T2 orbiterDials ──────────────────────────────┐                                          ┊
T3 orbiterPlan + nextOrbit ───────────────────┼─► T6 RobotGem motion mode (twins) ─┐     ┊
T4 ringPose + arcs + gemMotionViewBox ────────┤                                    ├─► T8 hook: mount + drift + reduced motion
T5 RobotGem strip + line width (static) ──────┴─► T7 RobotBody memo + static wiring ┘        │
T7b flip removal (independent)                                   Checkpoint B ◄──┘           ▼
                                                                                   T9 orbit scheduler ─► T10 count arcs + queue ─► T11 size tween + dial refs
                                                                                                                                          │
                                                                                   T12 wire world + avatar viewBox ◄──────────────────────┘
                                                                                          │
                                                                                   Checkpoint C (visual gate) ─► T13 perf gate (stop) ─► T14 guardrail + docs tests ─► T15 ROBOT_DESIGN/ANIMATION/PERFORMANCE ─► T16 roadmap + headers
```

Parallelisable: T2 ‖ T3 ‖ T4 ‖ T5 ‖ T7b (T1 alongside, by Crawford). T6 needs T3–T5. T7 needs T2,
T6. T8 needs T4, T7. T9–T11 sequential. T12 needs T11.

## Task List

### Phase 1: Gate 1 and pure modules (no importer)

## Task 1: Motion sketch (Gate 1) — **DONE 2026-10-05, passed**

**Description:** Extend `docs/sketches/gem-polygon-robots.html` (it already has the generator)
with a "Motion" panel: drift on every orbiter, buttons to fire orbits and arcs, sliders for the six
dials and every tuning constant. Plain JS `requestAnimationFrame` *in the sketch only*.

**As built:** four stages (world 2 px/unit in the avatar frame, 96 px avatar padded, 96 px
unpadded, 64 px card static), composition dials, tuning sliders, time multiplier, reduced-motion
and ring-path overlays. Verdicts and corrections are in the file's header comment. Found and fixed
at the gate, in order: x/y/z rings ran along the canvas edges (→ the corner→centre hoop); speeds
too fast (→ 4–8 s orbits, 6–10 s drift); despawning poly visibly vanished (→ drift faded over
arcs, openness forced to 0 on arcs); the spawn/despawn queue looped when the count changed
mid-arc (→ one arc at a time over an explicit shown set); the orbit clipped the stationary partner
at the far corner (→ paired orbits, tilt band dropped, openness seeded). A jsdom harness drove the
queue (eleven density changes in 1.3 s) and the pair geometry; both clean.

**Acceptance criteria:**
- [x] Every spec §1.1/§1.2/§4 constant has a control, defaulting to the spec value.
- [x] Crawford's verdicts recorded in the sketch header; Q1, Q3, Q4 answered.
- [x] Changed values carried into the spec (Gate 1 note, §1.1, §1.2, §1.4, §1.7, §4, §5, §7).

**Files:** `docs/sketches/gem-polygon-robots.html`, `docs/specs/ORBITING_POLYGONS.md`. **Scope:** M.

## Task 2: `orbiterDials.ts`

**Description:** `OrbiterDials`, `orbiterDials(robot)` and the constants of spec §1.1
(`ORBITER_COUNT_BREAKS`, `ORBITER_SIZE_MIN/MAX`, `ORBITER_LINE_BASE`, `ORBITER_STRIP_OPACITY_MIN`,
`ORBIT_GAP_BASE/PER_OCTAVE`, `ORBIT_DURATION_BASE/PER_OCTAVE`), each commented with its intent-table
row. Inputs resolved with the melody defaults from `engine/melodyGenerator.ts`
(`DEFAULT_RHYTHMIC_DENSITY`, `DEFAULT_RHYTHMIC_MOTIF_LENGTH`, `DEFAULT_NOTE_VARIANCE`,
`DEFAULT_PITCH_REPEAT`), octaves from `audioAttributes.octaveRange ?? robot.octaveRange`, every
input clamped to its `constants/index.ts` range.

**Acceptance criteria:**
- [ ] Count: density 0/24 → 1, 25/50 → 2, 51/75 → 3, 76/100 → 4.
- [ ] Size 0.75 / 1.0 / 1.25 at motif value 0 / 4 / 8; line 0.3 / 1.1 at variance 0 / 8; strip
      0.35 / 1.0 at pitchRepeat 0 / 100; gap 8.5 / 14.5 s at min octave 1 / 7 (post-Checkpoint-C
      correction: halved from the Gate 1 numbers 17 / 29 s); duration 4 / 8 s at max octave 1 / 7
      (Gate 1 numbers: `4 + (max − 1) × 2/3`); `[2, 5]` → gap 9.5, duration 6.67.
- [ ] All fields undefined → `{ count: 2, size: 1.25, lineWidth: 0.3, stripOpacity: 0.35 }` with
      octaves from `robot.octaveRange`; `audioAttributes.octaveRange` wins when present.
- [ ] Density 150 and −5, motif value 12, pitchRepeat 200 clamp to the range ends; a `value` is used
      regardless of its `active` flag.
- [ ] Mutation check in the commit message: changing `ORBITER_COUNT_BREAKS[1]` to 49 fails the
      density-50 case.

**Verification:** `npx vitest run src/components/robot/gem/orbiterDials.test.ts`; `npm run build:types`;
`npm run lint`. **Dependencies:** None. **Files:** `gem/orbiterDials.ts`, `gem/orbiterDials.test.ts`.
**Scope:** S.

## Task 3: `orbiterMotion.ts` — seeded plan and orbit draws

**Description:** `OrbiterPlan`, `orbiterPlan(gemSeed)` (Map-cached, stream
`alea(`${gemSeed}:orbit`)`), `ORBIT_PAIRS = [[0, 3], [1, 2]]`, `partnerOf(c) = 3 − c`,
`nextOrbit(R, dials)` → `{ dir, open, wait }`, and the constants `DRIFT_AMPLITUDE = [2, 3]`,
`DRIFT_PERIOD = [6, 10]` (Gate 1), `ORBIT_OPEN_MAX = 0.3`. The plan carries a seeded corner-order
permutation, per-corner drift `{ ax, ay, px, py, phase, phase2 }` and a per-**pair** `initialWait`
fraction in `[0, 1)`.

**Acceptance criteria:**
- [ ] `orbiterPlan(s) === orbiterPlan(s)` (same reference) and deep-equals a fresh build from the
      `:orbit` stream; different seeds differ; `getRobotGem(s)` is byte-identical before and after
      (the geometry stream is untouched — assert against `gem.fixture.json`).
- [ ] Over ≥ 1 000 seeds: `cornerOrder` is a permutation of 0–3; `ax, ay ∈ [2, 3]`;
      `px, py ∈ [6, 10]`; `phase, phase2 ∈ [0, 1)`; `initialWait` has two entries in `[0, 1)`.
- [ ] `nextOrbit`: dir ∈ {1, −1}, `open ∈ [0, 0.3]`, `wait ∈ [gap, 2·gap)` over ≥ 1 000 draws for
      gap 17 and 29; both directions occur; `partnerOf` maps 0↔3, 1↔2.

**Verification:** `npx vitest run src/components/robot/gem/orbiterMotion.test.ts src/components/robot/gem/robotGem.test.ts`.
**Dependencies:** None. **Files:** `gem/orbiterMotion.ts`, `gem/orbiterMotion.test.ts`. **Scope:** S.

## Task 4: `ringPose`, arc ranges, `gemMotionViewBox`

**Description:** In `orbiterMotion.ts`: `cornerFrame(gem, corner)` → `{ cx, cy, ux, uy, r }` (rest
centre, unit vector toward the canvas centre, its length), `RingPose`,
`ringPose(gem, corner, dir, θ, open)` per spec §1.2 (ported 1:1 from the sketch's `ringPose`),
`ORBIT_FRONT_SCALE = 0.15`, `ORBIT_BEHIND_SCALE = 0.2`, `ORBIT_BEHIND_DIM = 0.2`,
`DESPAWN_ARC = { dir: -1, from: 0, to: π/2 }`, `SPAWN_ARC = { dir: 1, from: 3π/2, to: 2π }` (both
`open 0`), and `gemMotionViewBox(gem)` (spec §1.7: canvas padded by the sampled hoop reach at
`open 0.3` + half an orbiter at 1.15 + drift 3, rounded up, symmetric).

**Acceptance criteria:**
- [ ] θ = 0 and 2π → offset (0, 0), scale 1, opacity 1, `rest`, for every dir/corner/open.
- [ ] `open 0`, θ = π → exactly the partner's rest position (`2r·û`); θ = π/2, dir 1 → `front`,
      scale 1.15, opacity 1, the orbiter centre on the canvas centre; 3π/2 → `behind`, scale 0.8,
      opacity 0.8. `open 0.3`, θ = π/2 → `0.3·r` off the line, perpendicular.
- [ ] Pair identity: for every corner, θ ∈ {π/6 … 2π} and open ∈ {0, 0.3},
      `ringPose(i, dir, θ, open)` and `ringPose(3 − i, −dir, θ, open)` are mirror images through the
      canvas centre (same hoop), with opposite `depth` and equal `scale` factor magnitude.
- [ ] Despawn arc: starts `rest`, ends `behind` at the canvas centre (±1e-6); spawn arc: the reverse.
- [ ] `gemMotionViewBox`: for every Phase 39 fixture width factor and all four corners, every
      sample of `ringPose` over θ (step π/180) at `open 0.3`, both dirs, scale 1.15 plus drift 3 and
      half an orbiter lies inside the box; the box is centred on the canvas; the hoop at `open 0`
      needs no pad beyond the orbiter's own half-size + drift.
- [ ] Mutation checks: `ORBIT_FRONT_SCALE` → 0.1 fails the 1.15 case; dropping the `across` term
      fails the pair-identity case at `open 0.3`.

**Verification:** `npx vitest run src/components/robot/gem/orbiterMotion.test.ts`.
**Dependencies:** T3 (file). **Files:** `gem/orbiterMotion.ts`, `gem/orbiterMotion.test.ts`.
**Scope:** S.

### Checkpoint A: Pure modules
- [ ] T2–T4 green; `npm run build:types`; `npm run lint`; full `npm test` unchanged elsewhere.
- [ ] Nothing imports the new modules yet (`grep -rn "orbiterDials\|orbiterMotion" src` → tests only).
- [ ] Mutation checks from T2 and T4 recorded in their commit messages.
- [ ] Every constant equals the sketch's current default (`ORBIT_OPEN_MAX` 0.3, `DRIFT_PERIOD`
      [6, 10], duration `4 + (max − 1) × 2/3`); if the sketch moved, the spec moves first.

### Phase 2: Static dials visible, flip gone

## Task 5: `RobotGem` — strip path, line-width dial, static orbiter count/size (Q5)

**Description:** Add the `orbiters` prop (`lineWidth`, `stripOpacity`, `size`, `count`,
`cornerOrder`, `motion`) and implement the **`motion: false`** path only: render the first `count`
corners of `cornerOrder`, each as `g.gem__orbiter[data-depth=rest]` › `g.gem__orbiter-local`
(`transform="scale(size)"`, `transform-origin` at the part centre) › the existing corner group.
`BevelledPart` gains `lineWidth` and an optional strip: `path.gem__strip` with the lines' `d`,
stroke `palette.light`, width `lineWidth / 3`, opacity `stripOpacity`, round caps, after
`.gem__lines`. Replace `LINE_WIDTH` with `BODY_LINE_WIDTH = 0.8` for Mids/Top. Immediate updates,
no tween (**Q5 default**). Give `RobotGem` a `ref` prop forwarded to `g.gem` (React 19). Until T7
lands, `RobotBody` passes a temporary `{ count: 4, size: 1, lineWidth: 0.8, stripOpacity: 0, cornerOrder: [0,1,2,3], motion: false }`
so the live app is pixel-identical.

**Acceptance criteria:**
- [ ] `count: 2, cornerOrder: [3, 0, 1, 2]` → exactly `.gem__orbiter--br` and `--tl`, in that DOM
      order, between backing and `mid--left`; both `[data-depth=rest]`.
- [ ] `.gem__orbiter-local` carries `scale(0.75)` for `size: 0.75`; `.gem__lines` of an orbiter has
      `stroke-width` = `lineWidth`; `.gem__strip` exists per shown orbiter with `d` ===
      `.gem__lines`' `d`, stroke === `palette.light`, width `lineWidth / 3` (2 dp), opacity ===
      `stripOpacity`; `stripOpacity: 0` still renders it (opacity 0, not absent).
- [ ] Mid and Top `.gem__lines` keep `stroke-width` 0.8; no `.gem__strip` on them.
- [ ] Every existing `RobotGem.test.tsx` assertion still passes with the temporary prop.

**Verification:** `npx vitest run src/components/robot/gem/RobotGem.test.tsx src/components/robot/RobotBody.test.tsx`.
**Dependencies:** None. **Files:** `gem/RobotGem.tsx`, `gem/RobotGem.test.tsx`, `RobotBody.tsx`.
**Scope:** S.

## Task 6: `RobotGem` — motion mode (depth twins, nested groups)

**Description:** Implement the **`motion: true`** path: all four corners × three copies —
`[data-depth=behind]` emitted before the backing, `rest` in today's slot, `front` after the Top —
each `g.gem__orbiter` › `g.gem__orbiter-local` › corner group, with **no** `transform`, `display`
or `opacity` attribute on the two outer groups (GSAP owns them). Shared `OrbiterCopy` helper so
the static path and the three copies render one component.

**Acceptance criteria:**
- [ ] `motion: true` → 12 `.gem__orbiter` (4 per depth), DOM order: 4 behind → backing → 4 rest →
      mid--left → mid--right → top → 4 front; `count`/`size` are ignored in this mode (all 12 present,
      no React scale).
- [ ] No `.gem__orbiter` or `.gem__orbiter-local` has a `transform`, `style`, `display` or `opacity`
      attribute; the inner corner group still has `translate(x y)`.
- [ ] Each copy has its own strip/lines with the dial attributes (T5's assertions hold per copy).
- [ ] `motion: false` output is unchanged from T5 (snapshot of DOM order and class list).

**Verification:** `npx vitest run src/components/robot/gem/RobotGem.test.tsx`. **Dependencies:** T5.
**Files:** `gem/RobotGem.tsx`, `gem/RobotGem.test.tsx`. **Scope:** S.

## Task 7: `RobotBody` — composition memo, `motion` prop, static wiring

**Description:** Add `motion?: 'world' | 'avatar'`; a `composition` memo
(`orbiterDials(robot)`, deps: the five fields, `robot.octaveRange`, `audioAttributes.octaveRange`)
separate from the audio memo; `plan = orbiterPlan(robot.gemSeed)` outside both; a `gemRef`; pass
`orbiters = { ...composition, cornerOrder: plan.cornerOrder, motion: motion !== undefined }` to
`RobotGem`. Remove T5's temporary prop. No hook call yet (T8) — in this task an animated context
renders the 12 hidden-by-nothing copies, so **do not pass `motion` from any caller yet**; every
caller stays on the static path and cards/world/avatar all show correct count/size/line/strip.

**Acceptance criteria:**
- [ ] A robot with `rhythmicDensity: 80` draws 4 orbiters, `rhythmicDensity: 10` draws 1, in the
      seeded corner order; `rhythmicMotifLength.value` 0 → `scale(0.75)`; `noteVariance.value` 8 →
      line 1.1; `pitchRepeat` 100 → strip opacity 1.
- [ ] Item-22 spy test kept (daylight tick recomputes neither memo); an `adsr` edit does not
      recompute the composition memo; a density edit does not recompute the audio memo.
- [ ] `motion` undefined → `RobotGem` receives `motion: false`; `'world'` → `true` (prop-level
      test; callers unchanged).
- [ ] `RobotSelectionCard.test.tsx`: a density-80 robot's card shows 4 orbiters, density-10 shows 1;
      viewBox still `0 0 ${80k} 80`.

**Verification:** `npx vitest run src/components/robot src/components/selection`; `npm run dev`
and eyeball a card and the world. **Dependencies:** T2, T6. **Files:** `RobotBody.tsx`,
`RobotBody.test.tsx`, `RobotSelectionCard.test.tsx`. **Scope:** S.

## Task 7b: Flip removal (independent — spec §1.6)

**Description:** `Robot.tsx`: drop `scaleX` from the mount `gsap.set`, rewrite the doc comment.
`swimAnimation.ts`: delete `ORIENTATION_DURATION`, `PROPULSION_OVERLAP`, the orientation phase and
the `targetDirection` parameter; propulsion starts at 0. `idleSystem.ts` / `robotSystems.ts`: stop
passing direction (they still compute/store it). Update the two flip tests in
`swimAnimation.test.ts` to "adds no scaleX tween" and "propulsion at position 0 regardless of
direction"; `Robot.test.tsx` gains "mount set has no scaleX".

**Acceptance criteria:**
- [ ] No `scaleX` anywhere in `src/components/robot/Robot.tsx` or `src/animation/swimAnimation.ts`
      (grep in a test).
- [ ] A robot facing left swimming right: propulsion tween position 0, duration = distance / 120,
      tilt tweens unchanged; `transformOrigin: '50% 50%'` still set (the tilt needs it).
- [ ] `Robot.direction` still updated by `handleRobotIdle` and preserved by `robotSystems`
      (existing tests pass unchanged).
- [ ] `npm run build:types` clean — no caller still passes three positional args.

**Verification:** `npx vitest run src/animation src/systems/idleSystem.test.ts src/systems/robotSystems.test.ts src/components/robot/Robot.test.tsx`.
**Dependencies:** None. **Files:** `Robot.tsx`, `Robot.test.tsx`, `swimAnimation.ts`,
`swimAnimation.test.ts`, `idleSystem.ts`, `robotSystems.ts`. **Scope:** M (6 files, mechanical).

### Checkpoint B: Static dials live, no flip (Crawford, 5 minutes in `npm run dev`)
- [ ] Full suite, types, lint green.
- [ ] Cards and world show per-robot orbiter count/size/line/strip; a density drag in Robot Options
      changes the count on the card and in the world (pop is expected here — arcs come in T10).
- [ ] Robots swim without flipping; the tilt still reads.
- [ ] Review the thin lines on low-variance robots (0.3) — the table value, flag if it reads too faint.

### Phase 3: Motion

## Task 8: `useOrbiterMotion` — mount state, drift, reduced motion (Q2)

**Description:** New hook per spec §1.4 with only the mount behaviour: `useGSAP` (scope `root`,
deps `[gem, enabled, reducedMotion]`, `revertOnUpdate`) that queries the 12 copies, `gsap.set`s
the first `count` corners' rest copies shown and every other copy `display: 'none'`, local groups
`scale: size`, both groups `transformOrigin: '50% 50%'`, then per shown corner the drift pair
(`x: ±ax`, `y: ±ay`, `yoyo`, `repeat: -1`, `sine.inOut`, durations `px/2`, `py/2`, started at
`progress(phase)`) inside a master timeline keyed `orbiters-${context}-${robotId}`, registered in
`timelineMap`, killed on cleanup. `prefersReducedMotion()` read on mount (BubbleStream's helper,
lifted to `src/utils/reducedMotion.ts`): no drift tweens. `enabled: false` → return before
creating anything. **Q2 default:** drift on every shown orbiter.

**Acceptance criteria:**
- [ ] After mount with `count: 2`: the two first-order corners' rest copies have `display` `''`,
      the other 10 copies `none`; local groups scaled to `size`.
- [ ] `timelineMap.has('orbiters-world-r1')`; unmount → gone; mounting `world` and `avatar` for one
      id registers two keys and neither kills the other.
- [ ] Two repeating yoyo tweens per shown corner, none for hidden corners; progress at mount equals
      the plan's `phase` (±1e-6).
- [ ] `matchMedia` mocked to reduce → no `repeat: -1` tweens, display state as above.
- [ ] `enabled: false` → no `gsap.*` calls, no key.
- [ ] `BubbleStream` still passes its reduced-motion tests after the helper move.

**Verification:** `npx vitest run src/components/robot/gem/useOrbiterMotion.test.tsx src/components/actors/BubbleStream.test.tsx`.
**Dependencies:** T4, T7. **Files:** `gem/useOrbiterMotion.ts`, `gem/useOrbiterMotion.test.tsx`,
`utils/reducedMotion.ts`, `actors/BubbleStream.tsx`. **Scope:** M.

## Task 9: Pair orbit scheduler and the twin swap

**Description:** Per **pair** with a shown member, a scheduler keyed
`orbit-${context}-${robotId}-${pair}`: wait `initialWait[pair] × orbitGap`, then — if neither
member is mid-arc, else retry after `ORBIT_RETRY` 0.5 s — `nextOrbit(R, dialsRef.current)` → one
proxy tween `{ t: 0 → 1 }` over `orbitDuration`, `sine.inOut`, whose `onUpdate` evaluates
`ringPose(gem, c, dir, 2π·t, open)` for the lead and `ringPose(gem, 3 − c, −dir, 2π·t, open)` for
the partner (if shown) and `gsap.set`s each active copy's `x`, `y`, `scale`, `opacity`, swapping
`display` across that corner's three copies when its `depth` changes; on complete, hide the
non-rest copies, reset the rest copies to pose 0, draw the next `wait`/`dir`/`open` and rebuild.
The robot's orbit `Rng` lives in a ref seeded from `plan`. Skipped entirely under reduced motion.

**Acceptance criteria:**
- [ ] After `initialWait × gap` seconds (`tl.time()` advance), exactly one proxy tween is running
      for that pair; with both members shown, at `t = 0.5` (θ = π/2) the lead's displayed copy and
      the partner's displayed copy are both at the canvas centre, one `front` one `behind`; at
      `t = 0.75`-ish each is near the other's corner; at completion only the rest copies, at
      `x: 0, y: 0, scale: size, opacity: 1`.
- [ ] With the partner hidden, the lead orbits alone and the partner's copies stay `display: none`.
- [ ] A pair whose member is mid-arc does not start; it starts within 0.5 s of the arc ending.
- [ ] Successive orbits for one pair are separated by `[gap, 2·gap)`; the keys exist while a member
      is shown and are killed on unmount; a pair with no shown member has no key.
- [ ] No `onUpdate`/`onComplete` reads `useLocaleStore` (spy on `getState`).
- [ ] Mutation checks: breaking the swap condition (`depth` compare) fails the front-only display
      case; dropping the partner's `−dir` fails the "one front, one behind" case.

**Verification:** `npx vitest run src/components/robot/gem/useOrbiterMotion.test.tsx`.
**Dependencies:** T8. **Files:** `gem/useOrbiterMotion.ts`, `gem/useOrbiterMotion.test.tsx`.
**Scope:** S.

## Task 10: Count changes — spawn/despawn arcs and the queue (Q3)

**Description:** Target-count ref + an explicit shown set + `reconcile()` with the five Gate 1
rules (spec §1.4): one arc at a time per robot; spawn = first unshown corner in `cornerOrder`
(show at `SPAWN_ARC` start, play the arc over `orbitDuration / 2`, then start its drift and, if
absent, its pair's scheduler); despawn = last shown corner in `cornerOrder` (play `DESPAWN_ARC` on
the exact centre line, hide, kill its drift); never spawn a shown corner or despawn a hidden one; a
corner mid-orbit is left to finish. Drift gain fades `1 → 0` over a despawn arc and `0 → 1` over a
spawn arc. Every arc and orbit completion calls `reconcile()` again. An effect on `dials.count` sets
the target and calls `reconcile()`. Reduced motion: a 0.3 s opacity tween on the rest copy instead
of the arc.

**Acceptance criteria:**
- [ ] 2 → 3: one spawn arc on the first unshown corner, starting displayed `behind` at the canvas
      centre with drift gain 0, ending `rest` at the corner with drift gain 1, after which that
      corner has drift and its pair has a scheduler.
- [ ] 2 → 4: the second arc starts only after the first completes (`progress(1)`); 2 → 4 → 2 within
      one arc: the queue settles at 2 with every tween cleaned up (no stray keys).
- [ ] 3 → 2: the last shown corner despawns via the `open 0`, `dir −1` arc, drift gain reaching 0 at
      the hide, ending hidden; its drift tween is gone; its pair's scheduler survives (solo or idle).
- [ ] **The Gate 1 loop case:** 3 → 2, then → 4 while that despawn is mid-arc: settles at 4 after
      exactly two further arcs; after every completion the shown set is a subset of `cornerOrder`
      with no corner spawned twice (assert the set, not a count).
- [ ] A despawn requested while that corner is mid-orbit waits for the orbit to finish; a pair
      orbit requested while a member is mid-arc waits (T9's retry).
- [ ] Reduced motion: count change tweens `opacity` over 0.3 s on the rest copy; no arc.
- [ ] Mutation checks: removing the one-arc guard fails the loop case; indexing the spawn target
      by `cornerOrder[shown.length]` instead of the first unshown corner fails the loop case.

**Verification:** `npx vitest run src/components/robot/gem/useOrbiterMotion.test.tsx`.
**Dependencies:** T9. **Files:** `gem/useOrbiterMotion.ts`, `gem/useOrbiterMotion.test.tsx`.
**Scope:** M.

## Task 11: Size tween and live dial refs

**Description:** Effect on `dials.size`: `gsap.to(localGroups, { scale, duration: 0.5, ease:
'power2.out' })` keyed `orbiter-size-${context}-${robotId}` (re-targets, never stacks); duration 0
under reduced motion. `dialsRef.current = dials` every render so gap/duration/count reach the
scheduler without rebuilding anything. Constants `ORBITER_SIZE_TWEEN = 0.5`, `ORBITER_FADE = 0.3`.

**Acceptance criteria:**
- [ ] Size 1.0 → 1.25: one `scale` tween, duration 0.5, on all shown local groups (and hidden ones,
      so a later spawn is already the right size); a second change mid-tween replaces it (one key,
      one active tween).
- [ ] Changing `orbitGap` / `orbitDuration` while an orbit runs: that tween's duration is unchanged;
      the next `nextOrbit` draw uses the new values.
- [ ] Reduced motion: scale set with duration 0.

**Verification:** `npx vitest run src/components/robot/gem/useOrbiterMotion.test.tsx`.
**Dependencies:** T10. **Files:** `gem/useOrbiterMotion.ts`, `gem/useOrbiterMotion.test.tsx`.
**Scope:** S.

## Task 12: Wire the world and the avatar

**Description:** `RobotBody` calls `useOrbiterMotion({ root: gemRef, robotId, context: motion,
gem, plan, dials: composition, enabled: motion !== undefined })`. `Robot.tsx` passes
`motion="world"`; `RobotDisplaySection` passes `motion="avatar"` and `viewBox={gemMotionViewBox(gem)}`.
Cards unchanged.

**Acceptance criteria:**
- [ ] `RobotBody` with `motion="world"` registers `orbiters-world-<id>`; without `motion`, no key.
- [ ] `RobotDisplaySection.test.tsx`: avatar viewBox === `gemMotionViewBox(getRobotGem(seed))`;
      `.gem__orbiter[data-depth=front]` present in the avatar; card test: none present, viewBox
      still `0 0 ${80k} 80`.
- [ ] `Robot.test.tsx` (RobotBody mocked) unchanged; an integration render of `<Robot>` with the
      real body registers the world key and kills it on unmount.
- [ ] `npm run build` clean.

**Verification:** `npx vitest run src/components/robot src/components/selection`; `npm run build`.
**Dependencies:** T11. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`, `Robot.tsx`,
`RobotDisplaySection.tsx`, `RobotDisplaySection.test.tsx`. **Scope:** M.

### Checkpoint C: Visual gate (Crawford, spec §5 "Gate") — stop and report
- [ ] Full suite, types, lint, build green.
- [ ] World: drift at rest, occasional rings with the front/behind size and dimming, arcs on a
      density drag with several edits queuing, smooth Phrase Length resize, Note Variance / Pitch
      Repeat readable on the lines, no flip; orbits overlap swims without lag.
- [ ] Avatar: the same, nothing clipped at any width factor (check a k = 2 robot); the smaller body
      (≈ 62 %) is acceptable — or revisit Q1.
- [ ] Cards static and correct. Reduced motion (OS setting): fades only.
- [ ] Verdicts on Q2–Q5 if not already given; any constant change lands in the sketch, then code.

### Phase 4: Perf gate

## Task 13: Idle-paint perf gate (stop and report; spec §5, Q2)

**Description:** Production builds of the Phase 39 tip (`back-to-gen-robots`) and this branch
served side by side; `npm run perf:idle --throttle 1 --only none` on the same pinned `?session=`
world, foreground, one run at a time, orphaned-Chrome count 0 before, three rounds with the order
rotated ([[perf-harness-measurement-hygiene]], docs/PERFORMANCE.md). Record busy, paint, layout,
compositor and drawn shapes per robot. Pass = busy and paint medians within the parent's
run-to-run spread (~±2 % busy, ~±5 % paint). On a miss, build throwaway variants for the ladder
(never committed): (1) drift period floor 4 s / amplitude 2, (2) drift on the selected robot and
avatar only, (3) no drift. Crawford picks the rung.

**Acceptance criteria:**
- [x] A results table (both builds, three rounds each, plus any variants) and the method line
      written up — [[orbiting-polygons-task13-perf-gate-miss]], not docs/PERFORMANCE.md as planned
      (superseded before a doc landing task ran).
- [x] Shapes per robot checked — not the cause; the gap was JS/scheduler overhead (paint was
      actually *better*, −9%).
- [x] **Missed, +63% busy.** Every rung in the original ladder (drift period/amplitude, drift on
      the selected robot only) was superseded before being tried — the ladder's own diagnostic work
      (a later, unplanned probe: consolidating the 24 standing per-pair schedulers into one shared
      ticker) also measured flat, which is what led to cutting the mechanism outright instead of
      working this ladder further. See spec §8 and [[orbiting-polygons-redesigned-to-docking]].

**Verification:** the table. **Dependencies:** T12. **Files:** none (or the rung's edit in
`gem/useOrbiterMotion.ts` / `orbiterMotion.ts` + tests). **Scope:** S–M.

### Phase 5: Guardrail and docs

## Task 14: Guardrail rewrite + docs tests

**Description:** Replace the Visual Mapping line in `CLAUDE.md` and `.github/copilot-instructions.md`
with spec §1.8's sentence (identical in both); update `Robot.ts`'s `identityColor` comment to say
audio *and composition settings* reach the body only through ROBOT_DESIGN.md's dials. Update
`src/docs/gemPolygonRobotsDocs.test.ts`: the `GUARDRAIL` constant, and the heading list gains
`Orbiter motion` after `What audio drives` (T15 adds the section — land T14 and T15 together or T14's
heading test will be red until T15; the plan expects them as consecutive commits with the suite
green only after T15). Add `src/docs/orbitingPolygonsDocs.test.ts` with the Phase 40 assertions
(roadmap entry links intent/spec/plan; intent doc headed Shipped; idea doc Branch C headed
superseded; ROBOT_DESIGN.md names `orbiterDials`, `ringPose`, `gemMotionViewBox`,
`useOrbiterMotion`, `orbiterPlan`, each of which exists in its file).

**Acceptance criteria:**
- [ ] Both instruction files carry the new sentence, byte-identical; the old "No count, side, line
      or position" wording is absent from both and from `Robot.ts`.
- [ ] `gemPolygonRobotsDocs.test.ts` green except the heading-list case until T15.
- [ ] `orbitingPolygonsDocs.test.ts` written RED (it goes green in T16).

**Verification:** `npx vitest run src/docs`. **Dependencies:** T13. **Files:** `CLAUDE.md`,
`.github/copilot-instructions.md`, `src/types/Robot.ts`, `src/docs/gemPolygonRobotsDocs.test.ts`,
`src/docs/orbitingPolygonsDocs.test.ts`. **Scope:** S.

## Task 15: ROBOT_DESIGN.md, ANIMATION_SYSTEM.md, PERFORMANCE.md

**Description:** ROBOT_DESIGN.md: new `## Orbiter motion` (the six dials with their sources and
ranges, the drift, the three rings and arcs, depth twins and GSAP-owned display, keys, the queue,
reduced motion, the card exception, `gemMotionViewBox`); "Render contexts" drops the flip and names
the avatar viewBox; "Forbidden patterns" swaps "position" for "the backing/Mids/Top's layout" and
adds a React-owned transform on an orbiter group; "Data flow" gains the composition memo and
`orbiterPlan`. ANIMATION_SYSTEM.md: the orbiter key family and the twin/display pattern as a worked
example of GSAP-owned z-order. PERFORMANCE.md: the Phase 40 gate section from T13.

**Acceptance criteria:**
- [ ] `gemPolygonRobotsDocs.test.ts` fully green (heading list, symbols, no stale wording).
- [ ] ROBOT_DESIGN.md has no `scaleX`/flip wording; every named symbol exists (the docs test's
      symbol table extended).
- [ ] PERFORMANCE.md's new section has the method line and the T13 table.

**Verification:** `npx vitest run src/docs`. **Dependencies:** T14. **Files:** `docs/ROBOT_DESIGN.md`,
`docs/ANIMATION_SYSTEM.md`, `docs/PERFORMANCE.md`, `src/docs/gemPolygonRobotsDocs.test.ts`. **Scope:** S.

## Task 16: Roadmap, Shipped/superseded headers, spec as-built notes

**Description:** `docs/todo/roadmap.md` `## 40. Orbiting Polygons` (About / decisions made while
building / Not Doing — the Top/Mid pass, job animations, idle bob, LFO links, card animation),
linking intent, spec, plan and the sketch if T1 ran. Headers: intent doc "Shipped (roadmap Phase
40, <date>)"; idea doc's Branch C paragraph headed "Superseded by docs/intent/orbiting-polygons.md
(Phase 40)"; spec header "Shipped" plus inline as-built deviations; this plan's status notes per
task. Phase 39 roadmap "Not Doing" bullet for Branch C updated to point here.

**Acceptance criteria:**
- [ ] `orbitingPolygonsDocs.test.ts` green; full `npm test`, `build:types`, `lint`, `build` green.
- [ ] Every open question in spec §7 has a recorded answer (or "deferred to <where>").

**Verification:** `npm test`; `npm run build`. **Dependencies:** T15. **Files:** `docs/todo/roadmap.md`,
`docs/intent/orbiting-polygons.md`, `docs/ideas/gem-polygon-robots.md`,
`docs/specs/ORBITING_POLYGONS.md`, `docs/tasks/ORBITING_POLYGONS.md`. **Scope:** S.

### Checkpoint D: Complete
- [ ] All acceptance criteria met; suite/types/lint/build green; perf gate recorded.
- [ ] Crawford's final review; Pixel listen (no new dropouts); push; PR after (or stacked on) the
      Phase 39 PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Drift keeps the robot layer repainting every frame (Assumption 7, Q2) | High — could fail the gate on desktop and hurt the Pixel | T13's ladder; T8 isolates drift so rungs 2–3 are a one-function change; Crawford may pick a rung before T8 |
| `display` toggles via `gsap.set` on SVG `<g>` behave differently across browsers (hidden subtree still laid out) | Med — gate numbers or a visible ghost | T13 checks shapes/robot; fallback is `visibility` + `pointer-events: none`, tested the same way |
| GSAP `transformOrigin: '50% 50%'` on a group whose bbox GSAP measures once — drift shifts the bbox | Low — scale about a slightly wrong centre | Scale lives on `gem__orbiter-local` whose own bbox is the corner polygon; T8 asserts the origin on that group, T1/Checkpoint C catch any wobble |
| Twelve robots × 4 schedulers + drift pairs ≈ 150 live tweens | Low — GSAP handles thousands; memory on unmount | T8/T12 assert every key dies on unmount; `killAllTimelines` on world transition already exists |
| `useGSAP` `revertOnUpdate` on `gem`/`enabled` changes resets display state mid-arc | Low | Deps are mount-stable per robot; count/size go through effects + refs (T10/T11), never through the `useGSAP` deps |
| A pair orbit and an arc on the same corner overlap (e.g. a despawn target is the partner of a pair about to start) | Med — two tweens on one copy's transform | T9's "retry if either member is mid-arc" + T10's "one arc at a time" + "mid-orbit waits"; the loop-case test covers the interleaving |
| Thin 0.3 lines on low-variance robots read as missing | Low — table value, by design | Checkpoint B flags it; a change is a spec/table edit, not a code decision |
| Docs test heading list goes red between T14 and T15 | Low | Land T14 and T15 back to back; never leave the branch there overnight |

## Open Questions (spec §7, after Gate 1)

1. ~~Ring shape~~ — resolved: the paired corner→centre hoop (T4, T9).
2. Drift always-on vs a pre-chosen ladder rung (T8, T13) — always-on, the perf gate decides.
3. ~~Arc duration~~ — `orbitDuration / 2` kept.
4. ~~Behind dim~~ — 0.8 kept.
5. ~~Line/strip tween~~ — immediate kept.
6. ~~Motion sketch~~ — done, passed.
