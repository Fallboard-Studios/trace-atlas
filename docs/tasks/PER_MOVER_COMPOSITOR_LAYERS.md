# Implementation Plan: Per-Mover Compositor Layers

Source spec: [docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md](../specs/PER_MOVER_COMPOSITOR_LAYERS.md). Source intent:
[docs/intent/per-mover-compositor-layers.md](../intent/per-mover-compositor-layers.md). Roadmap Phase 53 (proposed).
Diagnosis: backlog item 26. Branch `perf/per-mover-layers` off `main`, **after the Deck camera idle no-op PR merges**
(spec "Dependency"; it is not a task here).

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`,
`npm run perf:idle -- --throttle 1 --only none --port 9301 --url <pinned ?session= link>` (after
`npm run build && npx vite preview --port 4173`), `npm run perf:trace -- <trace.json>`.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

Twenty-three tasks in six phases. **Phase 0 fails fast on the two things that could sink the design before a line of
product code exists:** a throwaway page proves that a small `<svg>` inside a `will-change` wrapper draws and composites
its overflow in every browser on the machine (spec assumptions 1 and 3), and the idle-paint harness learns the number
the whole phase is gated on and proves it on `main` (assumption 6), then records the baseline. **Phase 1** is three
pure foundations and one type widening. **Phase 2** builds the stage: every sheet becomes a child of one scaled
container, positioned in scene units, and the station fragments move to static sheets; the world looks identical and
nothing moves differently yet. **Phase 3** is the robot cut-over in four steps that each leave the suite green: the
dissolve copy becomes a mover (still drawn in place), then the robot itself becomes a mover with the copy mirroring it,
then the row switch becomes a slot write with no re-mount, then the dead re-mount machinery goes. **Phase 4** gives the
bubbles and the marker their movers and deletes the last stage-sized moving sheet. **Phase 5** is the harness gate and
the Pixel listen, both stop-and-report. **Phase 6** is docs. Every task: RED first, one commit, types, lint and the suite
green, every behavioural test mutation-checked (the boundary it guards broken on purpose, watched to fail).

## Architecture Decisions

- **Verify before building (Task 2).** Spec assumption 1 (layer bounds follow a small svg's visible overflow) is the
  one the whole mover design rests on, and assumption 3 (crisp raster under a scaled ancestor) decides whether the fit
  can live on one container. Both are checked on a throwaway page in Chrome and Firefox before Task 9; a failure
  triggers spec §7 Q1's fallback as a spec amendment, not an improvisation mid-build.
- **The metric is proved on `main` before it judges anything (Task 3).** `redrawn px²/frame` must read about four
  screens per frame on `main` and about none with the movers detached, or assumption 6 is wrong and the gate has no
  number. The perf-hygiene rule: reintroduce the bug the metric should detect, watch it report it.
- **Sheets enter the stage before anything becomes a mover (Task 9).** Moving the seven existing sheets under one
  scaled container is a pure coordinate-system change with no visual difference, so it ships and is checked alone.
  Every later task then positions its mover in scene units inside a stage that already fits.
- **The robot cut-over is four commits, not one, and the order is forced by the `<use>` copy.** A `<use>` draws its
  target *with* the target's own transform. While `.robot` still carries the swim's `x`/`y` (before Task 13) a copy
  wrapper must sit at the origin; once the wrapper carries them (Task 13) the copy must mirror the wrapper. So Task 12
  moves the copy onto a mover at the origin (visually identical), Task 13 moves the robot and adds the mirror in the
  same commit, and Task 14 makes the switch a slot write only once the robot no longer re-mounts. Splitting 13 further
  would leave a commit whose dissolve draws at the wrong place for a second per switch.
- **`Robot.layer` stays the state; the slot is derived in render** (spec assumption 9). The work loop writes `layer` as
  it does now; the mover's `data-scene-slot` follows it through `Robot`'s own re-render. No second writer of the
  slot, no DOM write from the loop.
- **Stations go to static sheets in their current z-order** (spec assumption 8, §7 Q2 resolved as `front`): L4 at the
  end of `back`, L3 in a new `stations` sheet, the front fragment at the start of `front`. The ripple's one-second
  repaint of `front` is accepted and watched in the gate's attribution.
- **Bubbles get one strip per stream, always promoted** (§7 Q3 resolved). If the gate's layer-memory line misses on the
  bubbles' account, the phase stops for Crawford's bubble redesign (his standing permission, 2026-10-16), not for a
  promote-only-mid-burst workaround.
- **The harness follows the markup in the same task that changes it** (Tasks 10, 16, 18), so `npm run perf:idle` runs
  at every commit and the gate task finds its selectors already right.
- **Docs guards are kept green task by task.** `robotJobsJ4Docs.test.ts` pins names this phase renames or removes; each
  task that changes one adjusts that test's rows in the same commit, and Task 22's new guard takes over the stack.

## Dependency Graph

```
T1 record intent + spec + plan
T2 browser spike (assumptions 1, 3) ─────────────────────────────┐  must pass before T13
T3 harness metric + proof on main ─→ T4 baseline on main          │
T5 sceneFit ─┐                                                   │
T6 sceneStack ┼─→ T9 the stage ─→ T10 harness + docs-guard follow-up ─→ T11 stations into static sheets
T7 useStageFit┘                                                  │
T8 RefElement ───────────────────────────────────────────────────┤
                                                                 ▼
                                        T12 dissolve copy on a mover (at the origin)
                                                                 ▼
                                        T13 the robot mover + the copy mirrors it   ◄── T2
                                                                 ▼
                                        T14 one robot list; row switch = slot write
                                                                 ▼
                                        T15 remove the re-mount machinery
                                                                 ▼
                                        T16 harness robot selectors
                                                            Checkpoint B (Crawford)
T17 bubble strip mover ─→ T18 BubbleLayer + bubbles sheet gone      (after T9, independent of T12–T16)
T19 marker mover + marker sheet gone + Sheet loses `moving`          (after T9 and T18)
                                                            Checkpoint C (Crawford, incl. Firefox)
T20 harness gate — STOP and report ─→ T21 Pixel listen (Crawford)
T22 docs + perMoverLayersDocs guard ─→ T23 roadmap, backlog, status headers
```

## Task List

### Phase 0: Record, verify, measure

- [ ] **Task 1: Cut the branch with the docs and the camera fix on `main`**

  **Description:** The intent, the spec and this plan land on `main` through `docs/per-mover-compositor-layers`
  (pushed 2026-10-16; PR Crawford's), and the camera idle no-op through its own fix branch (spec "Dependency"). Task 1
  is cutting `perf/per-mover-layers` from `main` once both are merged, so every later commit cites a spec that is in
  the tree and the baseline is taken in the world this phase ships into.

  **Acceptance criteria:**
  - [ ] `git merge-base --is-ancestor` holds for both PRs' merge commits; the three docs are tracked on the branch;
        relative links between them resolve.

  **Verification:**
  - [ ] `git log --oneline -3` on the new branch shows both merges.

  **Dependencies:** the two PRs merged. **Files:** none. **Scope:** XS.

- [ ] **Task 2: Browser spike — overflow bounds and raster scale (spec assumptions 1, 3) — STOP on a failure**

  **Description:** A throwaway page in the session scratchpad (never committed): a 1920 × 1080 `div` scaled to a
  1280-wide box the way §1.1's stage is, holding one `div` with `will-change: transform` and a 100 × 80 `<svg
  overflow="visible">` whose content draws a 1-px-stroke circle 90 units outside its box, moved across the stage by a
  CSS transform on the wrapper from a small script. Checked in Chrome and Firefox (and Safari if a device is to hand):
  (a) the outside content is visible and moves with the box; (b) Chrome's Layers panel shows the wrapper's layer
  bounds containing the circle, Firefox's paint flashing shows no repaint while only the transform changes;
  (c) at 150 % and 200 % zoom the stroke is as sharp as the same circle drawn directly in a `viewBox`-fitted svg
  beside it. Results go into the spec's Assumptions 1 and 3 as "Verified <date>: Chrome <ver> ✓, Firefox <ver> ✓".

  **Acceptance criteria:**
  - [ ] Both assumptions hold in every browser checked, recorded in the spec with versions and date.
  - [ ] A browser that clips or blurs → stop; §7 Q1's fallback is decided with Crawford and written into the spec
        before Task 9 starts.

  **Verification:**
  - [ ] The spec's Assumptions 1 and 3 carry the verification line.

  **Dependencies:** Task 1. **Files:** `docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md` (results only); the page stays in the
  scratchpad. **Scope:** S.

- [x] **Task 3: `scripts/perf/idle-paint.mjs` — `redrawn px²/frame`, `screens/frame`, the mover-aware readout, proved on `main`**

  **Description:** A pure helper in a new `scripts/perf/paint-area-lib.mjs` (`redrawnArea(events, { dpr, frames })` →
  `{ pxPerFrame, screensPerFrame }` given the viewport), unit-tested like `audio-load-lib.test.mjs`; the harness reports
  both numbers per ablation row and in the `console.table`, and the compositor-layer readout names a layer by
  `data-scene-slot` as well as `data-scene-layer` and prints movers' count and memory separately (no movers on `main`
  yet, so that line reads 0). Then the proof, on `main`'s production build at 1280 × 900, 1×, same pinned session,
  foreground, orphaned Chrome 0: stock and `detach-bubbles+robots`.

  **Acceptance criteria:**
  - [x] `redrawnArea` sums each `Paint` event's clip-quad area × dpr² and divides by the frame count; a window with no
        `Paint` events reads 0; the unit test feeds synthetic events and a mutation (drop the dpr²) fails it.
  - [x] On `main`, stock reads 3–5 screens/frame and `detach-bubbles+robots` under 0.2; the two numbers and the run's
        metadata are pasted under "Perf gate results" below.
  - [x] Stock not near 4 → stop and report: assumption 6 is wrong, the metric is redefined before Task 4.

  **Verification:**
  - [x] `npx vitest run scripts/perf` passes (the repo's `.test.mjs` runner, not `node --test`; 99 cases).
  - [x] `npm run perf:idle -- --throttle 1 --only detach-bubbles+robots --url …` prints the two columns.

  **Dependencies:** Task 1. **Files:** `scripts/perf/idle-paint.mjs`, `scripts/perf/paint-area-lib.mjs`,
  `scripts/perf/paint-area-lib.test.mjs`, this plan (results). **Scope:** M.

- [x] **Task 4: Baseline on `main` — docs/PERFORMANCE.md**

  **Description:** `main` with the camera no-op merged, production build, the pinned `?session=` link, 1×,
  `--only none`, three rounds, foreground, one at a time: `redrawn px²/frame`, `screens/frame`, busy, Paint,
  Compositor::Update, Layerize, frames, the compositor-layer readout. A new PERFORMANCE.md section "Pre-change
  baseline for Phase 53 — Per-Mover Compositor Layers (<date>)" in the format of the 17.2.6 baseline.

  **Acceptance criteria:**
  - [x] The section exists with the three rounds, medians and the min–max spread per column, and names the build hash,
        the link and the viewport.

  **Verification:**
  - [x] Three rows in the table; 0 orphaned Chrome before and after (`Get-CimInstance Win32_Process -Filter
        "Name='chrome.exe'"` filtered on `trace-atlas-perf`).

  **Dependencies:** Task 3. **Files:** `docs/PERFORMANCE.md`, `src/docs/perMoverBaselineDocs.test.ts` (added as shipped: a docs guard for these criteria; Task 22's guard covers the rest). **Scope:** S.

### Checkpoint 0: The design and the number stand
- [ ] Assumptions 1 and 3 verified in the spec; assumption 6 proved in this plan; the baseline recorded.
- [ ] Reviewed with Crawford before Phase 1.

---

### Phase 1: Foundations (nothing visible)

- [ ] **Task 5: `sceneFit.ts` — the slice fit as arithmetic**

  **Description:** `sceneFit(box, stage = WORLD_BOUNDS): StageFit` as spec §4: scale by the larger of the two ratios,
  centre horizontally, pin to the bottom. Pure; no DOM.

  **Acceptance criteria:**
  - [ ] 1920 × 1080 → `{ 1, 0, 0 }`; 1280 × 720 → `{ 2/3, 0, 0 }`; 2560 × 1080 (wider) → scale `4/3`, `x = 0`,
        `y = 1080 − 1440 = −360`; 1080 × 1080 (taller, unreachable but defined) → scale 1, `x = −420`, `y = 0`.
  - [ ] Every result equals what `xMidYMax slice` gives for the same box (a second implementation in the test computes
        the slice fit from the SVG definition and the two agree to 1e-9 over a grid of boxes).
  - [ ] A 0 × 0 box returns scale 0 (the hook, not this function, decides to skip it).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/sceneFit.test.ts`; `npm run build:types && npm run lint`.

  **Dependencies:** None. **Files:** `sceneFit.ts`, `sceneFit.test.ts` (both under
  `src/components/panels/screen/worldView/`). **Scope:** XS.

- [ ] **Task 6: `sceneStack.ts` — `SCENE_SLOTS` and `slotForLayer`**

  **Description:** The ordered tuple of the nine slots (spec §1.2) and `slotForLayer(layer?: Robot['layer'])`. Pure.

  **Acceptance criteria:**
  - [ ] `SCENE_SLOTS` is `['back', 'robots-back', 'mid', 'bubbles', 'stations', 'robots', 'dissolve', 'front',
        'marker']`, readonly.
  - [ ] `slotForLayer('background')` → `'robots-back'`; `'foreground'` and `undefined` → `'robots'`.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/sceneStack.test.ts`; types and lint clean.

  **Dependencies:** None. **Files:** `sceneStack.ts`, `sceneStack.test.ts`. **Scope:** XS.

- [ ] **Task 7: `useStageFit.ts` — a ResizeObserver writes three custom properties**

  **Description:** `useStageFit(ref: RefObject<HTMLElement>)`: a `ResizeObserver` on the element writes
  `--stage-scale`, `--stage-x`, `--stage-y` from `sceneFit` on every resize entry; a zero-sized box writes nothing;
  unmount disconnects. The mock pattern is `Header.test.tsx`'s / `CabinetBox.test.tsx`'s `ResizeObserver` stub. No
  GSAP, no timer.

  **Acceptance criteria:**
  - [ ] One entry of 2560 × 1080 writes `--stage-scale: 1.3333…`, `--stage-x: 0px`, `--stage-y: -360px` on the element.
  - [ ] A 0 × 0 entry leaves the three properties untouched; a later real entry writes them.
  - [ ] Unmount calls `disconnect`; no `requestAnimationFrame`/`setTimeout` in the file (a test greps the source).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/useStageFit.test.ts`; types and lint clean.

  **Dependencies:** Task 5. **Files:** `useStageFit.ts`, `useStageFit.test.ts`. **Scope:** S.

- [ ] **Task 8: `refs.ts` — `RefElement`**

  **Description:** `export type RefElement = SVGElement | HTMLElement`; `setRef`/`getRef` typed on it; the consumers
  that annotate the type (`buildJobTimeline`'s `robotEl`, `swimAnimation`, `deckCamera`, `workLoop`'s `bodyOf`/`place`,
  `FollowedRobotMarker`) follow. Type-only; no behaviour changes.

  **Acceptance criteria:**
  - [ ] `refs.test.ts` round-trips an `HTMLDivElement` and an `SVGGElement`.
  - [ ] Every existing test passes unmodified.

  **Verification:**
  - [ ] `npm run build:types && npm run lint && npm test`.

  **Dependencies:** None. **Files:** `src/utils/refs.ts`, `refs.test.ts`, the type annotations in the five consumers.
  **Scope:** S.

### Checkpoint 1: Foundations
- [ ] Types, lint, full suite clean; nothing in the app has changed.

---

### Phase 2: The stage

- [ ] **Task 9: `OceanScene.tsx` / `.css` — every sheet becomes a child of one scaled stage**

  **Description:** `.ocean-scene` gains one child, `div.ocean-scene__stage` (spec §1.1), fitted by `useStageFit` on the
  scene ref. `SceneLayer` becomes `Sheet({ slot, moving?, children })`: `<svg class="ocean-scene__sheet"
  data-scene-slot=… viewBox="0 0 1920 1080">` filling the stage, no `preserveAspectRatio`. The seven existing sheets
  move inside the stage unchanged in content and order; the moving ones keep `will-change` for now (the `moving`
  prop survives until Task 19). CSS: the stage's transform from the three properties with their defaults; every slot's
  `z-index` in `SCENE_SLOTS` order; `.ocean-scene__sheet` and the `.mover` rules (spec §1.3; no mover exists yet);
  `WorldView.css`'s dimmed rules retargeted to `.ocean-scene__sheet` and `.mover`. Tests follow: `OceanScene.test.tsx`'s
  scene-layer block, `OceanScene.css.test.ts`, `OceanScene.clicks.test.tsx` (its `svg.ocean-scene__layer` /
  `data-scene-layer` selectors), `WorldView.test.tsx` if it names the class.

  **Acceptance criteria:**
  - [ ] The stage is `.ocean-scene`'s only child, `1920 × 1080`, `transform-origin: 0 0`, transform reading the three
        properties; the seven sheets are its children in the old order, each `viewBox="0 0 1920 1080"` with no
        `preserveAspectRatio`.
  - [ ] `OceanScene.css.test.ts`: every `SCENE_SLOTS` entry has a `z-index` and they increase in slot order; `.mover`
        is absolute, `will-change: transform`, `pointer-events: none`; sheets fill the stage and take no pointer events;
        `.robot` takes them; `ocean-scene__layer` appears nowhere in `src/`.
  - [ ] Pre-existing behaviour tests (tints, re-render cascade, clicks on both rows) pass with selectors updated only.
  - [ ] Live (`npm run dev`): the world is pixel-identical at 16:9 and at a wider window; resizing refits with no drift
        between a robot and its building; portrait emulation still pans.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/`; types and lint clean.
  - [ ] Manual: the live checks above, Chrome and Firefox.

  **Dependencies:** Tasks 5, 6, 7. **Files:** `OceanScene.tsx`, `OceanScene.css`, `OceanScene.test.tsx`,
  `OceanScene.css.test.ts`, `OceanScene.clicks.test.tsx`, `WorldView.css`. **Scope:** L (six files, but one mechanical
  change: the same markup rename in each; no logic beyond the stage div).

- [ ] **Task 10: Harness and docs-guard follow-up for the stage**

  **Description:** `idle-paint.mjs`: `SCENE_LAYERS` becomes `SCENE_SLOTS`' names and the per-slot element count reads
  `[data-scene-slot="…"]`; the layer readout already reads the attribute (Task 3). `robotJobsJ4Docs.test.ts`: the
  "lists the seven layers" and "marks exactly the moving layers" cases read `<Sheet slot="…"` instead of
  `<SceneLayer name="…"`.

  **Acceptance criteria:**
  - [ ] `npm run perf:idle -- --only none` on this branch prints a non-"absent" element count for every present slot.
  - [ ] `npx vitest run src/docs/robotJobsJ4Docs.test.ts` passes.

  **Verification:** as above; types and lint clean.

  **Dependencies:** Task 9. **Files:** `scripts/perf/idle-paint.mjs`, `src/docs/robotJobsJ4Docs.test.ts`. **Scope:** XS.

- [ ] **Task 11: Stations into static sheets**

  **Description:** `OceanScene` renders each station's `l4` fragment at the end of `back` (after tint A), its `l3`
  fragment in a new static `stations` sheet between `bubbles` and `robots`, and its `front` fragment at the start of
  `front` (before tint D). The two robot sheets then hold robots only. `ChargingStation.tsx` untouched.

  **Acceptance criteria:**
  - [ ] `#station-l4-layer` is `back`'s last child; `#station-l3-layer` is in `[data-scene-slot="stations"]`;
        `#station-front-layer` precedes `rect[data-depth-tint="D"]` in `front`; `[data-scene-slot="robots"]` and
        `robots-back` contain `.robot` groups and nothing else.
  - [ ] The harness's "Robots stack" line still counts L4, L3 and front elements.
  - [ ] Live: a station exit and entry look as before; the ripple plays; a Docked robot is hidden.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/OceanScene.test.tsx`; types and lint clean; manual.

  **Dependencies:** Task 10. **Files:** `OceanScene.tsx`, `OceanScene.test.tsx`. **Scope:** S.

### Checkpoint A: The stage (Crawford, dev server)
- [ ] The world is identical to `main` by eye at 16:9, wider, and in portrait emulation; a resize refits cleanly.
- [ ] `npm run perf:idle` runs on the branch (numbers recorded, not gated: the moving sheets are still full-size).
- [ ] Types, lint, full suite, `npm run build` clean.

---

### Phase 3: The robots

- [x] **Task 12: The dissolve copy becomes a mover (drawn at the origin)** (automated criteria done; the live crossfade look is Checkpoint B's)

  **Description:** `OceanScene` replaces the `#robot-dissolve-layer` `<g>` with `div.ocean-scene__dissolve
  [data-scene-slot="dissolve"]`, a stage child registered under the same ref key. `workLoop.ts`'s `dissolve()` appends
  `div.mover.mover--dissolve[data-dissolve-copy=<id>] > svg[viewBox = the robot's canvas, overflow visible] > use
  [href="#world-robot-<id>"]` and tweens the wrapper's `opacity`; the wrapper sits at the origin, because `.robot` still
  carries the swim's transform and the `<use>` draws it in place. `removeCopy`, `endDissolve` and `stopWorkLoop`'s sweep
  select `.mover--dissolve[data-dissolve-copy]`.

  **Acceptance criteria:**
  - [x] `workLoop.test.ts`'s dissolve cases pass against the new nodes: the copy is a `.mover--dissolve` in the dissolve
        div, its `use` points at `#world-robot-<id>`, the wrapper's opacity fades 1 → 0 (`'out'`) / 0 → 1 (`'in'`) over
        `LAYER_DISSOLVE_SECONDS`, the robot stays opaque, the copy goes at the right moment; `stopWorkLoop` removes every
        copy; a recall mid-fade drops it.
  - [x] The copy wrapper has no `x`/`y` write in this task (a test asserts the wrapper's transform is unset).
  - [ ] Live: a row switch each way shows the one-second crossfade exactly as before.

  **Verification:**
  - [ ] `npx vitest run src/systems/workLoop.test.ts src/components/panels/screen/worldView/OceanScene.test.tsx`;
        types and lint clean; manual.

  **Dependencies:** Task 11, Task 8. **Files:** `OceanScene.tsx`, `OceanScene.test.tsx`, `src/systems/workLoop.ts`,
  `workLoop.test.ts`. **Scope:** M.

- [x] **Task 13: The robot mover, and the copy mirrors it — needs Task 2's pass** (automated criteria done; the live look is Checkpoint B's)

  **Description:** `Robot` returns the mover of spec §1.4: `div.mover.mover--robot[data-robot-id]
  [data-scene-slot=slotForLayer(robot.layer)] > svg.mover__svg[width = gemWidth, height = GEM_CANVAS_H, overflow
  visible] > g#world-robot-<id>.robot > g.robot__row > RobotBody`. The ref, `setRef`, the mount `gsap.set` and
  `onRobotMounted` move to the wrapper; `.robot` loses its transform. `OceanScene` renders both robot lists as stage
  children and deletes the `robots-back` and `robots` sheets. `dissolve()` places the copy wrapper at the body's live
  `x`/`y`/`rotation` and mirrors them from the timeline's `onUpdate` (three `gsap.quickSetter`s). The clicks test's
  "which row" cases read `data-scene-slot` on the mover.

  **Acceptance criteria:**
  - [x] `Robot.test.tsx`: the registered ref is the wrapper; the mount `gsap.set` targets it; the slot follows
        `layer` (background → `robots-back`, else `robots`); the inner svg is the gem canvas and `overflow="visible"`;
        `#world-robot-<id>` and the single `.robot__row` child are unchanged; the click-routing, glow and halo cases pass.
  - [x] `OceanScene.test.tsx`: no sheet named `robots` or `robots-back`; each robot is a `.mover--robot` stage child in
        the slot its row names (one back-row and one front-row fixture at different positions).
  - [x] `workLoop.test.ts`: the copy's `x`/`y`/`rotation` equal the body's at creation and after seeking the swim and
        the dissolve to 0.5 (mutation: drop the `onUpdate` and the seek case fails); `settle` reads the wrapper's
        position; `hideAtStation` hides the wrapper.
  - [x] `OceanScene.clicks.test.tsx`: nothing outside `.robot` takes pointer events — stage, sheets and movers
        included; a back-slot and a front-slot robot each select on click.
  - [ ] Live: a swim, a job (orbiters out to the roof, the decoration reaching the vent or outline, nothing clipped),
        a selection halo, a station arc, a row switch — identical to `main` by eye; the deck camera and the marker still
        follow a robot in portrait emulation.

  **Verification:**
  - [ ] `npx vitest run src/components/robot src/components/panels/screen/worldView src/systems/workLoop.test.ts`;
        types and lint clean; manual, Chrome and Firefox.

  **Dependencies:** Task 12, Task 2 (passed). **Files:** `src/components/robot/Robot.tsx`, `Robot.test.tsx`,
  `OceanScene.tsx`, `OceanScene.test.tsx`, `OceanScene.clicks.test.tsx`, `src/systems/workLoop.ts`,
  `workLoop.test.ts`. **Scope:** L (seven files; the atomic cut-over the Architecture Decisions explain — the robot's
  transform and the copy's mirror cannot land apart without a wrong frame per switch).

- [ ] **Task 14: One robot list; the row switch is a slot write**

  **Description:** `OceanScene` renders one `useShallow` list of robot ids; a row change re-renders the robot's slot
  and never re-mounts it. `workLoop.ts`: `moveToRow` writes `layer` and returns; `intoBackRow` writes, dissolves `'out'`
  and swims on; `intoFrontRow` writes `'foreground'` and removes the copy when swim and fade have both settled;
  `exitStation` writes the back row and plays the arc at once; `LoopRun.remounts` and its uses in `killLegs`,
  `dropLeg`, `stopWorkLoop` and `onRobotMounted` go; the `markLayerSwitching`/`clearLayerSwitching` calls go (the
  registry still exports them until Task 15).

  **Acceptance criteria:**
  - [ ] `OceanScene.test.tsx`: a robot whose `layer` flips keeps its mount (`onRobotMounted` called once) and changes
        slot; the roster-change case still re-renders the list.
  - [ ] `workLoop.test.ts`, the §1.5 cases replacing the re-mount ones: front → back writes `layer` at the switch point
        and swims on at once, easing the row to 0.75; back → front writes `layer` only after both swim and fade settle
        and removes the copy in the same call; no body → `layer` flips and the leg continues; the station exit of a
        front-row robot writes the back row and starts the arc in the same tick; a plain mount mid-dissolve ends the
        dissolve; `stopWorkLoop` no longer references pending re-mounts.
  - [ ] Every `remounts`/`markLayerSwitching` reference is gone from `workLoop.ts` (a test greps the source).
  - [ ] Live: a row switch each way, a station exit from the front row, a recall mid-switch — no pop, no hang, no robot
        left behind the midground without its copy.

  **Verification:**
  - [ ] `npx vitest run src/systems src/components/panels/screen/worldView/OceanScene.test.tsx`; types and lint clean;
        manual.

  **Dependencies:** Task 13. **Files:** `OceanScene.tsx`, `OceanScene.test.tsx`, `src/systems/workLoop.ts`,
  `workLoop.test.ts`, `workLoop.integration.test.ts` (fixture mounts a mover). **Scope:** M.

- [ ] **Task 15: Remove the re-mount machinery**

  **Description:** `robotMotionRegistry.ts` loses the `layerSwitching` set and `markLayerSwitching`,
  `isLayerSwitching`, `clearLayerSwitching`; `useOrbiterMotion.ts` loses its `isLayerSwitching` branch (a world mount
  always attaches); their tests lose the matching cases; `robotJobsJ4Docs.test.ts` drops the three identifier rows.

  **Acceptance criteria:**
  - [ ] No file in `src/` names the three exports (a test greps); `__reset` still clears the two maps.
  - [ ] `useOrbiterMotion.test.tsx`: the three "marked world mount" cases are gone; every attach case passes.

  **Verification:**
  - [ ] `npx vitest run src/animation/robotMotionRegistry.test.ts src/components/robot/gem/useOrbiterMotion.test.tsx
        src/docs/robotJobsJ4Docs.test.ts`; types and lint clean.

  **Dependencies:** Task 14. **Files:** `robotMotionRegistry.ts`, `robotMotionRegistry.test.ts`,
  `useOrbiterMotion.ts`, `useOrbiterMotion.test.tsx`, `src/docs/robotJobsJ4Docs.test.ts`. **Scope:** S.

- [ ] **Task 16: Harness robot selectors**

  **Description:** `idle-paint.mjs`: `ROBOT_GROUPS` = `.mover--robot .robot`, the `no-robots` ablation hides
  `.mover--robot`, `detach-bubbles+robots` removes `.mover--robot`, the "Robots stack" readout counts `.mover--robot`
  per slot.

  **Acceptance criteria:**
  - [ ] `npm run perf:idle -- --only no-robots` on the branch reports 12 robots in the scene line and a `no-robots`
        row whose `screens/frame` is below stock's.

  **Verification:** the run above.

  **Dependencies:** Task 15. **Files:** `scripts/perf/idle-paint.mjs`. **Scope:** XS.

### Checkpoint B: Robots as movers (Crawford, dev server, Chrome and Firefox)
- [ ] A swim, a job on the widest building in view, a selection and a company halo, a station exit and entry, a row
      switch each way, a recall mid-switch, clicks on both rows, the camera and marker in portrait emulation: identical
      to `main` by eye; nothing clipped at a mover's edge.
- [ ] Types, lint, full suite, `npm run build` clean.
- [ ] Reviewed with Crawford before Phase 4.

---

### Phase 4: Bubbles and the marker

- [ ] **Task 17: `BubbleStream.tsx` — a strip mover per stream**

  **Description:** The seeded per-bubble parameters move from the `useGSAP` body into the `config` memo (same seeds,
  same draws, same order); render returns `div.mover.mover--bubbles[data-scene-slot="bubbles"]` at
  `left = ventX − W / 2`, `top = ventY + margin − H` holding `svg[width=W, height=H, viewBox="0 0 W H"]` and the
  circles at local `(W / 2, H − margin)`, with `margin = radius × POP_SCALE`, `W = 2 × (maxWobbleAmp + margin)`,
  `H = maxRisePx + 2 × margin` (spec §1.6). Timelines, `isActive`, reduced motion unchanged.

  **Acceptance criteria:**
  - [ ] For a fixed seed the strip's `W`/`H`/`left`/`top` are the formula's values and every circle sits at
        `(W / 2, H − margin)`; `depthScale = 1/3` shrinks all four.
  - [ ] The existing rendering, transform-motion, `isActive` and reduced-motion cases pass unmodified apart from the
        query root.
  - [ ] The parameters drawn in the memo equal those the old effect drew for the same seed (a parity case keeps the
        old derivation inline in the test).

  **Verification:**
  - [ ] `npx vitest run src/components/actors/BubbleStream.test.tsx`; types and lint clean.

  **Dependencies:** Task 9. **Files:** `BubbleStream.tsx`, `BubbleStream.test.tsx`. **Scope:** S.

- [ ] **Task 18: `BubbleLayer` as a fragment; the `bubbles` sheet goes; harness bubble selectors**

  **Description:** `BubbleLayer` returns a fragment of streams; `OceanScene` renders it as a stage child and deletes the
  `bubbles` sheet. `idle-paint.mjs`: `BUBBLES` = `.mover--bubbles circle` (plus the pre-split factory-layer selectors it
  keeps for old builds).

  **Acceptance criteria:**
  - [ ] `OceanScene.test.tsx`: no sheet named `bubbles`; one `.mover--bubbles` stage child per eligible actor, in the
        `bubbles` slot.
  - [ ] `BubbleLayer.test.tsx`: no wrapping `<svg>`; one stream per eligible actor.
  - [ ] Live: bubbles rise behind the robots and under the foreground, pop at the top, bursts staggered as before.

  **Verification:**
  - [ ] `npx vitest run src/components/actors src/components/panels/screen/worldView/OceanScene.test.tsx`; types and
        lint clean; `npm run perf:idle -- --only no-bubbles` counts circles; manual.

  **Dependencies:** Task 17. **Files:** `BubbleLayer.tsx`, `BubbleLayer.test.tsx`, `OceanScene.tsx`,
  `OceanScene.test.tsx`, `scripts/perf/idle-paint.mjs`. **Scope:** S.

- [ ] **Task 19: The marker mover; the last moving sheet goes; `Sheet` loses `moving`**

  **Description:** `Marker` returns `div.mover.mover--marker[data-scene-slot="marker"][data-followed-robot]` holding an
  origin-centred `svg[viewBox="−W/2 −H/2 W H", overflow visible]` and the unchanged drawing (spec §1.7); `place()` sets
  the wrapper's `x`/`y` and `visibility`. `OceanScene` renders it as a stage child and deletes the `marker` sheet;
  `Sheet` loses its `moving` prop and `OceanScene.css` the `--moving` rule; `OceanScene.css.test.ts` and
  `robotJobsJ4Docs.test.ts`'s "moving" case follow (no sheet moves any more).

  **Acceptance criteria:**
  - [ ] `FollowedRobotMarker.test.tsx`: every existing case passes against the wrapper; `place` writes the wrapper;
        the svg is `overflow="visible"` and origin-centred; the back-row square is still scaled.
  - [ ] No `will-change` on any `.ocean-scene__sheet` (css test); no `moving` prop (grep).
  - [ ] Live, portrait emulation: the marker rides the followed robot with its caption.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView src/docs/robotJobsJ4Docs.test.ts`; types and lint
        clean; manual.

  **Dependencies:** Task 18. **Files:** `FollowedRobotMarker.tsx`, `FollowedRobotMarker.test.tsx`, `OceanScene.tsx`,
  `OceanScene.css`, `OceanScene.css.test.ts`, `src/docs/robotJobsJ4Docs.test.ts`. **Scope:** M.

### Checkpoint C: Everything moves on its own sheet (Crawford, Chrome and Firefox)
- [ ] Spec §5.3's whole list, in Chrome and again in Firefox; Safari if a device is to hand.
- [ ] Types, lint, full suite, `npm run build` clean.
- [ ] Reviewed with Crawford before the gate.

---

### Phase 5: Gates

- [ ] **Task 20: Harness gate — STOP and report**

  **Description:** Spec §5.2 items 3: this branch against `main` (built in a throwaway worktree, served on a second
  port, bundle names checked), same pinned session, 1×, `--only none`, three rounds alternated, foreground, one at a
  time, orphaned Chrome 0. Medians and `main`'s spread per column; the compositor-layer readout per side; the stock
  attribution's top painters. Recorded in docs/PERFORMANCE.md "Per-Mover Compositor Layers — the Task 20 gate" and
  under "Perf gate results" below. Do not act on a miss.

  **Acceptance criteria:**
  - [ ] Pass: median `screens/frame` ≤ 0.25 × `main`'s; median busy and Paint within `main`'s spread; layer-memory
        estimate ≤ `main`'s. Compositor::Update, Layerize and the mover count recorded, not gated.
  - [ ] Miss → stop with the numbers. A bubbles-driven memory miss goes to Crawford's bubble redesign (spec §7 Q3); a
        ripple-driven paint miss to per-station sheets (§7 Q2); anything else is his call.

  **Verification:**
  - [ ] The run table in this file and in PERFORMANCE.md.

  **Dependencies:** Task 19. **Files:** `docs/PERFORMANCE.md`, this plan. **Scope:** S.

- [ ] **Task 21: Pixel listen (Crawford)**

  **Description:** Spec §5.2 item 4: the LAN production preview, landscape, Full Audio Load, the same link, `?debug`,
  three minutes on this branch and on `main`; the overlay's underrun count is the record.

  **Acceptance criteria:**
  - [ ] Both counts written here with the date; the branch's not above the recorded run-to-run spread.
  - [ ] Not run → recorded as "not run", never as a pass (the Deck Camera Task 11 rule).

  **Dependencies:** Task 20. **Files:** this plan, `docs/PERFORMANCE.md`. **Scope:** —.

---

### Phase 6: Docs

- [ ] **Task 22: Docs and the `perMoverLayersDocs` guard**

  **Description:** `ANIMATION_SYSTEM.md`: "Scene layers — what may move where" becomes "Scene stack — the stage, the
  sheets and the movers" (the slot table in `SCENE_SLOTS` order, which slots are movers, the fit, the rules that
  follow); "Layer switch" rewritten for the slot write and the mover copy; the ref-registry paragraph's element type;
  the dissolve key row. `ROBOT_DESIGN.md` render contexts: the world body in a mover, the swim pivot.
  `BUILDING_DESIGN.md`: the three station fragments' sheets. `PERFORMANCE.md`: the harness's new columns in "The
  localizer". A new `src/docs/perMoverLayersDocs.test.ts` in the J4 guard's pattern pins all of it (spec §5.1's list)
  and fails on a renamed export. Every name spot-checked against the shipped source, not this plan.

  **Acceptance criteria:**
  - [ ] `npx vitest run src/docs/` passes, including the new guard; a mutation (rename `slotForLayer` in the doc) fails
        it.
  - [ ] No doc names `markLayerSwitching`, `isLayerSwitching`, `clearLayerSwitching`, `robot-back-layer`,
        `robot-layer`, `ocean-scene__layer--moving` or `remounts` as current.

  **Verification:** as above; types and lint clean.

  **Dependencies:** Task 21. **Files:** the four docs, `src/docs/perMoverLayersDocs.test.ts`. **Scope:** M.

- [ ] **Task 23: Roadmap 53, backlog 26, status headers**

  **Description:** Roadmap Phase 53 in Phase 52's shape (links, status, About, Not Doing: the audio-headroom default,
  machine-side fixes, the re-mount path); backlog item 26 → a shipped pointer (candidates 1 and 2 done, 3 not taken);
  the intent, spec and this plan gain a "Shipped"/status header naming the gates' outcomes, including a Pixel listen
  that was not run.

  **Acceptance criteria:**
  - [ ] `perMoverLayersDocs.test.ts`'s roadmap and header cases pass.

  **Verification:** `npx vitest run src/docs/perMoverLayersDocs.test.ts`; lint clean.

  **Dependencies:** Task 22. **Files:** `docs/todo/roadmap.md`, `docs/todo/backlog.md`, the intent, the spec, this
  plan. **Scope:** XS.

### Checkpoint: Complete
- [ ] Types, lint, full suite, `npm run build` clean.
- [ ] Every automated acceptance criterion met; the two gates recorded with numbers, a skipped Pixel listen flagged.
- [ ] Docs match the shipped source; every named identifier spot-checked.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A browser clips a mover's overflow or blurs under the scaled stage (assumptions 1, 3) | High | Task 2 before any product code; a failure amends the spec (§7 Q1) before Task 9 |
| `Paint`'s clip is not the repaint rect, so the gate has no number (assumption 6) | High | Task 3 proves the metric on `main` by mutation before the baseline; stock ≈ 4, detached ≈ 0 |
| The `<use>` copy draws at the wrong place between the two halves of the cut-over | Medium | Task 12 pins the copy at the origin while `.robot` carries the transform; Task 13 moves both in one commit and pins the mirror by seeking |
| A frame shows the robot behind the midground with no copy at a slot write (assumption 5) | Medium | Task 14's manual check watches every switch direction for a flash; if seen, the copy's removal moves to the next `gsap.ticker` tick |
| Fifty bubble strips cost more layer memory than the one sheet they replace | Medium | Task 20's layer-memory line is gated; a miss goes to Crawford's bubble redesign (§7 Q3), not a workaround |
| The station ripple's one-second repaint of `front` shows up in the attribution | Low | Task 20 records top painters; per-station sheets are the named fallback (§7 Q2) |
| A docs guard (`robotJobsJ4Docs.test.ts`) goes red mid-branch | Low | Tasks 10, 15 and 19 adjust its rows in the same commit as the change it pins |
| The harness's selectors silently match nothing between Tasks 13 and 16 | Low | No gate runs in that window; Task 16 restores them before Checkpoint B |
| Main-thread Compositor::Update does not fall (the fix-3 finding) and is read as a miss | Low | It is recorded, not gated (spec §5.2); the gate is redrawn area, busy, Paint and memory |
| Firefox or Safari behave differently from Chromium in ways the harness cannot see | Medium | Task 2 checks both assumptions there; Checkpoints B and C repeat the manual list in Firefox |

## Open Questions

1. **Q1 Overflow clipping fallback.** **Open until Task 2.** Resolved there: verified, or the wrapper box sized to the
   robot's reach as the spec's Q1 describes, written into the spec before Task 9.
2. **Q2 Station front fragments in `front`.** **Resolved** (Architecture Decisions): `front`; Task 20's attribution
   watches the ripple; per-station sheets if it is a top painter.
3. **Q3 Bubble strips always promoted.** **Resolved**: always; Task 20's memory line decides; a bubbles-driven miss
   stops for Crawford's redesign (his permission, 2026-10-16).
4. **Q4 Camera no-op first.** **Resolved**: the branch is cut from `main` after that PR merges; Task 4's baseline is
   taken there.
5. **Q5 Roadmap number.** **Resolved**: 53.
6. **Q6 Swim pivot.** **Resolved**: the canvas centre; accepted.
7. **Browsers.** The app targets every modern browser (Crawford, 2026-10-16). The harness measures Chromium only;
   Firefox is covered by Task 2 and the two checkpoints; Safari is unverified unless a device turns up — recorded in
   Task 2's spec line either way.

## Perf gate results

(Task 3's proof on `main`, Task 4's baseline and Task 20's A/B go here, in run order, with build hashes, the link, the
viewport, and orphaned-Chrome counts before and after.)

### Task 3 — the metric proved on `main` (2026-10-17)

`main` `4a9b3fec` (camera no-op merged), production build from a clean `git worktree` (`index-CVUy7kf3.js`, :4183),
headless Chrome, 1280 × 900 at 1×, `--throttle 1`, 6 s windows, pinned `?session=` world (style `alpha`, `(0, 50)`,
`DEFAULT_GLOBAL_AUDIO_SETTINGS`, no overrides, version 2), foreground, one run at a time, orphaned `trace-atlas-perf`
Chrome 0 before and after. Run: `--only detach-bubbles,detach-bubbles+robots` (the second ablation removes only the
robots, so the first is needed to take the bubbles out too).

| Window | frames | redrawn px²/frame | screens/frame | Paint n | busy (ms) |
|---|---|---|---|---|---|
| stock | 360 | 5 317 862 | **4.62** | 1085 | 2034 |
| detach-bubbles | 334 | 5 413 324 | 4.70 | 1024 | 3231 |
| detach-bubbles+robots | 1 | 0 | **0** | 0 | 138 |

Stock is inside the 3–5 band and the detached window reads 0 (< 0.2): the acceptance criteria hold. The stock
attribution is three painters per frame: the document (clip 1 152 000 = the viewport), and the two moving sheets
(`robots-back` and `robots`, clip ≈ 2 074 680). 1 + 1.8 + 1.8 = 4.6.

Also run, for comparison only (this branch at `14bdcf97` + the Task 3 harness, built to a scratch `--outDir`,
`index-CBxihiz2.js`, :4184, same link): stock **4.85** and **4.82** (two runs), detach-bubbles 4.95 / 4.99,
detach-bubbles+robots **0** (frames 1) in the second run. The first run read 0.48 (360 frames, 114 Paint events, 1502 ms
busy) in that last window and was not reproduced; recorded as a one-off, not investigated.

**Caveats the metric carries into Task 20 (not blocking Task 4):**
- The sheet clips read **1920 × 1080 = 2 073 600**, the scene's own units, not device px (the layer is 1465 × 824 CSS
  px). `main` and the branch agree because both report the same local space, but the figure is only comparable at one
  viewport; a phone run is not comparable to a desktop run in `px²/frame`, only in `screens/frame` against its own
  viewport, and even that is approximate while the stage scale is not 1.
- The Task 2 spike saw a promoted mover emit a `Paint` with an unbounded clip (−8 388 608 … 8 388 607) and the document
  keep painting its whole page every frame. A mover exists nowhere on this branch yet, so that is **unproved**; the
  first mover (Task 13) is where it shows. If it does, `redrawnArea` needs a clamp or the signal changes (raster work)
  before Task 20 reads it. Decision deferred to then.

### Task 4 — the baseline on `main` (2026-10-17)

Recorded in full in [PERFORMANCE.md](../PERFORMANCE.md) ("Pre-change baseline for Phase 53"), guarded by
`src/docs/perMoverBaselineDocs.test.ts`. `main` `4a9b3fec`, bundle `index-CVUy7kf3.js`, the same pinned link and 1280 × 900
at 1× as Task 3, three foreground rounds, orphaned Chrome 0 before and after. The headline for Task 20 to beat:
**`screens/frame` 4.63 (4.63–4.67)**; median busy 1694 ms (1674–1719), Paint 177 ms (161–185), Compositor::Update 139 ms
(136–146), Layerize 141 ms (138–147), 360 frames; compositor layers 28 (24 drawing, ≈ 37.8 MB), `Mover layers: 0`.
