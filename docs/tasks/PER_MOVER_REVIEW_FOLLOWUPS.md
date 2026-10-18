# Follow-ups: Per-Mover Compositor Layers code review

> **Status (2026-10-17):** **Phase A is built** (R1–R4, commits `43a0802a`…`4d754d94` on `perf/per-mover-layers`; see
> "As shipped (Phase A)" below); Checkpoint A waits only on Crawford's review. **Phase B is built** (R5: busy is a MISS, stopped for Crawford; R6: all three gates PASS; see "As shipped (Phase B)" below) and waits on Crawford's review. Phase C is not started.
> Written from a five-axis code review of `perf/per-mover-layers`
> at tip `b528d32d` (28 commits, 57 files, +5133/−1035). The review's verdict: **the code is approvable; the branch is
> not ready to merge** because it has not met its own "Ready for PR" criteria (see "Open before merge", below, which
> are Crawford's calls and are not tasks).

Source plan: [docs/tasks/PER_MOVER_COMPOSITOR_LAYERS.md](PER_MOVER_COMPOSITOR_LAYERS.md) (Tasks 1–23, all done).
Source spec: [docs/specs/PER_MOVER_COMPOSITOR_LAYERS.md](../specs/PER_MOVER_COMPOSITOR_LAYERS.md). Roadmap Phase 53.
No new spec is needed for any item here: the work is parity-preserving cleanup, two measurements the original spec
already knows how to react to (Q3), and two decisions that are Crawford's. If a measurement misses, the reaction is
the spec's, or a short amendment to it, not a new document.

Written for: Crawford, and a fresh agent session picking this up cold. Task ids are `R1…R7` so they never collide with
the plan's Tasks 1–23.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run perf:idle -- --throttle 1 --only none --port 9301 --url <pinned ?session= link>` (after `npm run build &&
npx vite preview --port 4173`). Perf method and the pinned link: [docs/PERFORMANCE.md](../PERFORMANCE.md)
"Pre-change baseline for Phase 53" and "Per-Mover Compositor Layers — the Task 20 gate". Perf hygiene: foreground, one
run at a time, no orphaned Chrome, A/B in the same session, three alternated rounds.

## What the review checked (so it is not redone)

- Types clean, lint 0 errors (the 4 old warnings), full suite green on a second run: 368 files / 12406 tests. The
  first run had 2 failures: one was the documented-flaky `sceneToOrbiterLocal` round trip, the other was not identified
  and passed on re-run. Per the standing rule, **flaky tests are not chased.**
- Six mutation checks, each killed by the existing tests (then the file restored with `git checkout --`):
  `matrixWithin(frame, screen)` → `screen` (2 failures); `stripH = maxRisePx + 2 * margin` → `+ margin` (7);
  marker `xPercent/yPercent: -50` → `0` (1); drop `removeCopy` after the `'foreground'` write in `intoFrontRow` (4);
  drop `stopFollowing` from `stopWorkLoop` (1); invert `slotForLayer` (6). Reuse this list after any of the changes below.
- CLAUDE.md guardrails hold (no synths in components, no timelines/refs in state, nothing in the timeline or follower
  code calls `AudioEngine`). The dissolve follower is a `gsap.ticker` listener, not a timeline, so it lives outside
  `timelineMap` without breaking that rule. No security findings.
- **Not checked by the review: anything that needs a live browser.** Two bugs were already found only live (the halo
  waves riding the robot; the dissolve copy freezing), so this matters.

## Task list

Every task: RED first where there is behaviour, one commit, types + lint + the touched tests green, then the full
suite before the phase checkpoint; behavioural changes mutation-checked (break the guarded line on purpose, watch it
fail). Line numbers are at `b528d32d` and may drift.

### Phase A: One-shots (parity-preserving)

- [x] **R1: `intoFrontRow` early return leaves the dissolve copy and its follower**

  **Description:** In `src/systems/workLoop.ts` `intoFrontRow` (about line 511) the `settled` callback returns at
  `if (!here) return;` without calling `removeCopy(robot.id)`, so a copy and its `gsap.ticker` follower stay until the
  next `stopWorkLoop`. **Honest sizing:** `Robot.tsx` documents the roster as fixed at 12 and never removed, so this
  path is close to unreachable; this is a one-line guard with a test, not a bug hunt.

  **Acceptance criteria:**
  - [x] RED first: a test where the robot is gone from the roster when both swim and fade settle shows the copy
        removed and its follower off the ticker (the `followers` tests at `workLoop.test.ts` ~1590–1760 show how to
        capture ticker listeners).
  - [x] Every existing `workLoop` case passes unmodified.
  - [x] Mutation: delete the new `removeCopy` call; the new test fails.

  **Verification:** `npx vitest run src/systems/workLoop.test.ts`; types and lint clean.

  **Dependencies:** None. **Files:** `src/systems/workLoop.ts`, `src/systems/workLoop.test.ts`. **Scope:** XS.

- [x] **R2: Delete the `moveToRow` pass-through**

  **Description:** `moveToRow(loop, robot, layer)` (`workLoop.ts` ~468) is now only `write(loop, robot.id, { layer })`.
  Call `write` directly at its three call sites (`intoBackRow`, `intoFrontRow`, `exitStation`) and delete the function.
  Its doc comment carries the explanation of *why* the write is enough (Zustand renders through
  `useSyncExternalStore`, React's slot write lands in a microtask before the next paint, and a dissolve started or
  removed in the same call keeps that frame whole): keep that reasoning, as a comment at the two row-switch call
  sites or in the file header, not lost with the function.

  **Acceptance criteria:**
  - [x] No `moveToRow` in `src/` (a grep, non-test files).
  - [x] Every existing `workLoop` case passes unmodified (pure refactor).
  - [x] The "write, then dissolve/remove the copy in the same call" reasoning is still in the file.

  **Verification:** `npx vitest run src/systems/workLoop.test.ts src/systems/workLoop.integration.test.ts`; types and
  lint clean.

  **Dependencies:** R1 (same file, avoid a conflict). **Files:** `src/systems/workLoop.ts`. **Scope:** XS.

- [x] **R3: Halo waves — find the sheet once, and fix the header**

  **Description:** `sceneMatrixOf` in `src/components/robot/gem/haloWavesMotion.ts` (~65) does an `el.closest` plus a
  `querySelector('svg.ocean-scene__sheet')` and two `getScreenCTM` reads on every frame of every running station arc.
  Resolve the sheet once when the arc's timeline is made (in `playHaloWaves`), keep the two matrix reads per frame
  (they are needed: the deck camera's scroll changes the frame), and rewrite the file header's "the one forced read is
  `getCTM()`" (line 12), which is no longer true. An avatar or card (no `.ocean-scene`) keeps the `getCTM()` path.

  **Acceptance criteria:**
  - [x] RED first: a spy on `Element.prototype.querySelector` (or `closest`) sees the sheet looked up at most once
        across ten frames of one arc; it fails on the current code.
  - [x] The two world-shaped cases in `useHaloMotion.test.tsx` ("the waves stay where the arc began…", "sizes the lines
        in scene units…") and the three `matrixWithin` cases pass unmodified.
  - [x] The header describes what is actually read per frame.
  - [x] Mutation: replace `matrixWithin(frame, screen)` with `screen`; the same 2 tests fail as in the review.

  **Verification:** `npx vitest run src/components/robot/gem`; types and lint clean.

  **Dependencies:** None. **Files:** `haloWavesMotion.ts`, `useHaloMotion.test.tsx`. **Scope:** S.

- [x] **R4: Tidy — stale comments and two harness inconsistencies**

  **Description:** One commit of small corrections, each verified against the shipped source (not this list):
  - Stale prose: `workLoop.ts` ~374 ("stays until the front re-mount takes over"); `buildJobTimeline.ts:53` (`robotEl`
    is the robot's *mover wrapper* now, not "the `.robot` group"); `OceanScene.tsx` ~127 ("five stacked SVG sheets":
    there are four, `back`, `mid`, `stations`, `front`); `Robot.tsx` ~92 ("the whole remount and power-on story").
  - `scripts/perf/scene-markup-lib.mjs` `BUBBLE_CIRCLES` (~45) still lists `#factory-{background,midground,
    foreground}-layer circle`. On this branch those match non-bubble building circles, so `detach-bubbles` also deletes
    them. Those three selectors only served builds older than the 17.2.5 layer split; `main` already has the bubbles
    sheet, so they are no longer a supported A/B target. Drop them and update `scene-markup-lib.test.mjs`; confirm
    nothing else (docs guards, PERFORMANCE.md prose) names them first.
  - `scripts/perf/idle-paint.mjs` ~243: `p.area += Math.min(area, view.layerAreas?.get(nodeId) ?? area)` leaves an
    unresolved node unbounded in the per-node attribution table, while `redrawnArea` caps it at one viewport and counts
    it. Use one rule in both (give `paint-area-lib.mjs` a per-event helper both call, tested).

  **Acceptance criteria:**
  - [x] RED first for the two harness items (unit tests in `scene-markup-lib.test.mjs` / `paint-area-lib.test.mjs`).
  - [x] No behaviour change in the app; `npx vitest run scripts/perf src/docs` passes.
  - [x] `npm run perf:idle -- --only detach-bubbles` on the branch removes bubble circles only (compare circle counts
        in a factory sheet before and after).

  **Verification:** as above; types and lint clean.

  **Dependencies:** None. **Files:** the four named, plus `scene-markup-lib.test.mjs`, `paint-area-lib.mjs`,
  `paint-area-lib.test.mjs`. **Scope:** S.

### Checkpoint A: One-shots
- [x] `npm run build:types`, `npm run lint`, full `npm test` clean.
- [x] The six mutants from "What the review checked" re-run and still killed.
- [ ] Reviewed with Crawford before Phase B.

### As shipped (Phase A, 2026-10-17)

Suite at the end: 368 files / 12426 tests green (the review's baseline was 12406); types clean; lint 0 errors, the 4
old warnings. Commits: R1 `43a0802a`, R2 `c5de1ff1`, R3 `0415275c`, R4 `d20fcca6` + `4d754d94`. Where it differs from
the plan above:

- **R1:** three tests, not one: the copy and its ticker follower go whichever of the swim and the fade settles last
  (two orders), plus a guard that a missing robot is not written back or sent on (it passed before the fix, by design).
  The new `removeCopy` is the only change in `workLoop.ts`; deleting it fails 2.
- **R2 reached further than "Files: workLoop.ts".** `moveToRow` was named in `docs/ANIMATION_SYSTEM.md` (four places) and
  required by two docs guards (`robotJobsJ4Docs.test.ts`, `perMoverLayersDocs.test.ts`), so all three changed. The
  positive "names moveToRow, source defines it" rows are gone and `perMoverLayersDocs` gained a negative check (neither
  the doc nor `workLoop.ts` names it), which was the RED. The reasoning moved into `workLoop.ts`'s header. The *historic*
  spec and task docs (`PER_MOVER_COMPOSITOR_LAYERS.md`, `ROBOT_JOBS_AND_STATIONS.md`) still say `moveToRow`: they record
  what was planned, so they were left.
- **R3:** the sheet is resolved at the top of `playHaloWaves` and passed to `sceneMatrixOf`. Three tests: at most one
  `closest`/`querySelector` for the scene across ten frames; both `getScreenCTM` reads still happen every frame (guards
  over-caching); an avatar keeps `getCTM` and looks once. Mutants: `screen` (the same 2 as the review), dropping the
  `getCTM` fallback (1), never reading the sheet (3).
- **R4:** every listed item was real and where the list put it. Two things beyond the list,
  both in the harness: the scene line said "circles in the bubble/factory layers" (now "bubble circles"), and the per-node
  table used the clip's *bounding box* where the headline uses the *shoelace area*. The shared `paintEventArea` uses the
  shoelace, identical for the axis-aligned clips Chrome reports and different only for a rotated quad. The old source guard
  that pinned the per-node rule (`?? area`) was replaced by one pinning `paintEventArea`.
  **Live check (the third bullet):** run against a fresh build of the tip, but with a scratch CDP script that applies the
  harness's own `detach-bubbles` expression, not `npm run perf:idle` itself (that prints no factory-sheet count): 147 circles
  inside the three factory layers before and after, bubble circles 43 → 0. The old selector set matched 190 on the same
  page, so the bug was real: `detach-bubbles` (and `no-bubbles`, which hides by the same selector) took 147 building
  circles with them. Any ablation row recorded on this branch with those variants would overstate what removing bubbles
  alone does; I did not look for such rows in PERFORMANCE.md. The gate numbers (`--only none`) do not use them.
- **Noticed, not touched (R4 scope):** the same stale "the `.robot` group's GSAP x/y" claim is in `sceneToOrbiterLocal.ts:15`,
  `decor/frames.ts:13`, `sceneToOrbiterLocal.test.tsx:56` and `buildJobTimeline.test.ts:47`. `robot.position` is the
  mover's x/y now.
- **Checkpoint A mutants:** all six killed. Counts match the review for 1–5 (2, 7, 1, 4, 1); #6 ran a wider test scope
  (`worldView` + `robot`) and failed 14.

---

### Phase B: Measure first (no spec unless one misses)

Both measurements are A/B against `main` in one session, three alternated rounds, medians and spread, recorded in
`docs/PERFORMANCE.md` and guarded the way the Task 20 gate is (`src/docs/perMoverGateDocs.test.ts` is the pattern).
Neither is acted on in the same step that measures it. **They share a setup with the open document-layer repaint
investigation (Task 20's miss): do them in the same session.**

- [x] **R5: Bubble strips with bubbles actually drawing (spec Q3)** — measured 2026-10-17, **busy is a MISS, stopped for Crawford** ("As shipped (Phase B)" below)

  **Description:** The Task 20 idle window never saw a bubble strip draw, so the layer-memory pass says nothing about
  ~50 always-promoted strips while bubbles are active. Measure a window that contains bursts. A burst is scheduled every
  `TARGET_GLOBAL_BURST_INTERVAL_SECONDS × totalBuildings` seconds (`BubbleStream.tsx`), so either lengthen the window
  (`--window`) to cover several, or start the streams' timelines from the page (they are in `timelineMap`, keys
  `bubble-<actorId>`) and say so in the record. Read the layer count and memory with strips drawing, `screens/frame`, busy,
  Paint, Compositor::Update and Layerize, on `main` and the branch.

  **Acceptance criteria:**
  - [ ] **Not met on busy** (layer memory and Paint pass). Pass: branch layer memory (stage scale applied) ≤ `main`'s in the same window; busy and Paint within `main`'s
        spread. Compositor::Update and Layerize recorded, not gated (as in Task 20).
  - [x] Miss → **stop and report.** Per spec §7 Q3 and Crawford's standing permission (2026-10-16) the reaction is his
        bubble redesign, not a promote-only-mid-burst workaround.
  - [x] Recorded under PERFORMANCE.md with build hashes, the link, the viewport, and orphaned-Chrome counts.

  **Dependencies:** none (Phase A is independent). **Files:** `docs/PERFORMANCE.md`, a docs guard, this file.
  **Scope:** S.

- [x] **R6: The dimmed world (`data-dimmed`)** — measured 2026-10-17, **all three gates PASS** ("As shipped (Phase B)" below)

  **Description:** `WorldView.css` puts `filter: brightness(0.42)` on every `.mover` (and `brightness(0.42) blur(2px)`
  on each sheet) whenever a hub tile is open (`WorldView.tsx`: `dimmed = activeHubTile !== null`). That makes every
  robot, bubble strip and the marker its own filtered surface, a state the gate never ran in, and the state the app is
  in whenever a branch is open. Measure `main` against the branch with a tile open. `--steps "<hub tile name>"` clicks a
  button after power-on and is the likely route; first have the harness print whether `.world-view` has `data-dimmed`
  so a run cannot silently be undimmed.

  **Acceptance criteria:**
  - [x] The harness reports the dimmed attribute for each run; a run where it is absent is rejected.
  - [x] Pass: branch busy, Paint and `screens/frame` not above `main`'s dimmed medians (inside `main`'s spread).
  - [x] (Not triggered: no miss.) Miss → **stop and report.** Any fix changes how the dimmed world is produced, which is a look decision: it
        needs Crawford and a short amendment to the spec, not a quiet change. (Possible direction, not a plan: one
        dimming layer instead of a filter per mover.)

  **Dependencies:** none. **Files:** `scripts/perf/idle-paint.mjs` (+ test), `docs/PERFORMANCE.md`, a docs guard,
  this file. **Scope:** S–M (the harness change is the unknown).

### Checkpoint B: Measurements
- [x] R5 and R6 recorded with numbers, hashes and orphaned-Chrome counts; any miss written as a miss. (R5 is a miss on busy; R6 passes.)
- [ ] Reviewed with Crawford.

### As shipped (Phase B, 2026-10-17)

Records are in [docs/PERFORMANCE.md](../PERFORMANCE.md); guards `src/docs/perMoverReviewR5Docs.test.ts` and (R6) `perMoverReviewR6Docs.test.ts`, sharing `src/docs/perfDocTables.ts`. Harness commits: `c1414fbe` (R6's dimmed report and R5's bubble readout), `f4d20775` (the trace-buffer fix).

**R5, as measured (a MISS on busy, not acted on).** Where it differs from the plan above:

- **The pinned world has no bubbles.** The Task 20 world (`alpha`, `(0, 50)`) has 2 factories and **0 bubble circles**, so the Task 20 window could never have seen a strip; "no bubble strip appears among the drawing layers" was a fact about that world. R5 uses `alpha` at `(-100, -100)` (18 factories, 135 circles, 18 streams) after trying nine locales; **18 streams is the most found**, not the spec's "fifty-odd". The world follows `(x, y)`, not the style.
- **`--window` alone did not work.** A 30 s window held only the first ~5.8 s of events (325 frames): the trace buffer fills in about 6 s with invalidation tracking on. `traceCategories` now drops that category over 6 s (1799–1801 frames, a 30.0 s span) and `truncationWarning` flags a window under 30 frames/s. A long window's busy time is not comparable with a 6 s one's.
- **Result:** busy 10330 ms (10251–10410) against `main`'s 9566 (9514–9572): **MISS**, +8 %. Paint 1559 against 1575: PASS. Layer memory 29.7 MB against 42.4 MB: PASS (18 strips ≈ 0.85 MB against the one sheet's ≈ 4.60 MB). Compositor::Update 1940 → 2287 ms and Layerize 1948 → 2294 ms (+18 %), recorded, not gated.
- **The Paint column cannot see the bubbles.** 135 circles animate (0–23 visible at a time), yet the bubble layers' Paint events total 42–44 in 30 s on both builds. Hypothesis, unproved: SVG child transform/opacity changes re-layerize without re-recording. So `screens/frame` is blind to them and busy / Compositor::Update / Layerize are the columns that see them. `screens/frame` from a 30 s window is also inflated by unresolved Paints (the layer map is read once, before the window), so it was recorded and not read.
- **Diagnostic, one run each:** detaching the circles takes ≈ 200 ms off Compositor::Update on both builds, and the branch's extra ≈ 330 ms remains. So the gap is not the circles' motion; whether it is the strip layers themselves was **not** separated (the strip `div`s stay after the detach).
- **Open for Crawford** (written into the PERFORMANCE.md section): accept; the Q3 bubble redesign; or first separate the strips from the other movers (a sticky ablation that removes the strip `div`s, not built).
- **Option (3) done, 2026-10-18: the strips separated** (PERFORMANCE.md "review follow-up R5, option 3: the strips separated"; harness `2d05d6d8`, `1eb022d2`; guard `src/docs/perMoverStripsDocs.test.ts`). In window 2, branch − `main`: Compositor::Update +357 → +342 → +226 ms and busy +564 → +457 → +94 ms (bubbles present → circles detached → strips detached). The circles' motion is not the gap (it costs both builds the same); the 18 strip layers standing in the page are about a third of the Compositor::Update gap and roughly half the busy gap; the rest is the robot movers and follows how many robots are moving (+13 ms in a later, quieter window). Still open for Crawford: accept or the bubble redesign; the redesign can only reach the strips' share.

**R6, as measured (all three gates PASS).** Where it differs from the plan above:

- **The harness part was built first** (`c1414fbe`): `--expect-dimmed yes|no|any` reads `data-dimmed` on `.world-view` after the steps and again after the windows and throws if it is not what was asked; every run prints `World: dimmed|undimmed|no world view`. Both rejections were tried live (Deck asked for dimmed; Fleet Params asked for undimmed). A one-word message fix ("an undimmed world") came with the R6 commit.
- **The world is R5's, not Task 20's:** the dim is per mover, and the Task 20 world has no bubble strips to filter. One world, one tile (`--steps "Fleet Params"`, 58 cabinet boxes on both builds), the stock 6 s window with every category traced.
- **Result:** busy 3555 ms against `main`'s 3654 (3651–3717); Paint 221 against 259 (258–262); `screens/frame` 1.93 against 3.19 (0.61 × `main`). All below `main`'s whole spread. Compositor::Update 520 → 567 ms (+9 %), recorded, not gated. The branch's `screens/frame` includes up to 0.83 of unresolved Paints, so it is an upper bound, and still passes.
- **The rule used:** "not above `main`'s dimmed medians" read as branch median ≤ `main` median (stricter than the top of the spread); the branch is below `main`'s minimum on both time columns, so the reading does not matter here.
- **Not tested:** whether the dimmed world *looks* the same (the `blur(2px)` inside the scaled stage); that stays Crawford's at Checkpoint B.

---

### Phase C: Decisions that are Crawford's (not buildable yet)

- [ ] **R7a: Trim the Phase 53 docs guards — after the gate decision**

  **Description:** `src/docs/perMoverBaselineDocs.test.ts`, `perMoverGateDocs.test.ts`, `perMoverPixelDocs.test.ts`
  and `perMoverLayersDocs.test.ts` total about 930 lines and recompute medians from PERFORMANCE.md's prose tables and
  pin the MISS wording. Whatever Crawford decides about Task 20's miss (accept / fix and re-run / amend the criterion)
  forces edits to them, so trimming first means doing it twice. **Question for Crawford:** those guards exist to stop a
  miss being written up as a pass, and `perMoverGateDocs` fails if a verdict disagrees with its numbers. Keep that
  enforcement in some form (a smaller check that the verdict word matches the comparison), or drop it for structural
  checks only (headings exist, named identifiers resolve)?

  **Dependencies:** Crawford's Task 20 decision. **Scope:** S–M.

- [ ] **R7b: Split the PR?**

  **Description:** 28 commits, 57 files. The stage (plan Tasks 5–11) is a pure refactor that should look identical, so
  it could land alone; then the robots (12–16, with the halo fix), then the bubbles and marker (17–19), then the
  harness and docs. Against that: the stage alone ships no performance benefit (sheets stay promoted until the robots
  move), and the commits interleave harness and docs work. It pushes branches, so it is only done on Crawford's say.

  **Dependencies:** Crawford. **Scope:** M (mechanical git work).

## Open before merge (Crawford's calls, from the plan's own "Ready for PR" list; not tasks)

1. **Task 20's `screens/frame` MISS:** 0.95 vs `main`'s 3.10 is 0.31 × (limit 0.25). The targeted work fell from ≈2.07 to
   ≈0.16 screens/frame; the miss is the document layer repainting a full viewport per frame on both builds, cause
   unknown. Accept and file it, fix it and re-run, or amend the criterion as a stated decision.
   **RESOLVED 2026-10-17 (option 2, then found to be the harness):** there was no document repaint; the painter was Chrome's whole-frame `#document` `Paint` wrapper, charged as a viewport per frame. Fixed in the harness (`998207a5`), gate re-run passes all four criteria at 0.08 × `main` (PERFORMANCE.md "the Task 20 gate, re-run with the frame wrappers left out"; [DOCUMENT_REPAINT.md](DOCUMENT_REPAINT.md)). The Task 20 section stands as written. R5's busy MISS (item on its own) is unaffected.
2. **Checkpoints B and C were never signed.** The Chrome and Firefox look list (plan Checkpoints B and C, spec §5.3)
   should include **a station exit with halo waves** — the halo test stubs `getScreenCTM`, so nothing but a live
   browser shows how Chrome, Firefox and Safari resolve it through an HTML ancestor's CSS transform.
3. **No `main` underrun count from the Pixel** (Task 21), so its not-above-`main` bullet is open.
4. **FYI, no action planned:** the dim `blur(2px)` now sits inside the scaled stage, so its effective radius is 2 × the
   stage scale (~1.3 px at 1280 wide, ~2.7 px at 2560) — a small look change in a phase whose spec says no look changes.
   Raise it if the dimmed world looks different at Checkpoint B.
