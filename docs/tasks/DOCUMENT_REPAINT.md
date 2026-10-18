# The document-layer repaint: find it, fix it, re-run the Task 20 gate

> **Status (2026-10-17):** not started. Written after the Task 20 gate (roadmap Phase 53) missed on `screens/frame`
> (0.31 × `main`, limit 0.25) and attributed the miss to the **document layer repainting a full viewport nearly every
> frame on both builds**, cause unknown (PERFORMANCE.md "Per-Mover Compositor Layers — the Task 20 gate"). Crawford
> chose option 2 of the three recorded there: **find and fix the repaint, then re-run the gate unchanged.**

Written for: Crawford walking it step by step, and a fresh agent session picking it up cold.

**Branch:** `fix/document-repaint`, cut from `perf/per-mover-layers` (not `main`): the clamped paint-area metric, the
invalidation table and the R5/R6 harness additions live only on that branch. `perf/per-mover-layers` stays unmerged
until Phase 4 here lands.

**Model and effort:** the diagnosis (Phases 1–2) with Fable 5.1 at high effort. The fix and the re-measure (Phases 3–4)
can run on Opus 5.5 at medium once the culprit is proven.

**Not a spec.** This is a diagnosis; a spec is written in Phase 3 only if the fix touches architecture (scene stack,
camera follow loop, shell layers). A one-line CSS fix gets a commit and the gate re-run as its proof.

**Commands:** `npm run build && npx vite preview --port 4173` once, then
`npm run perf:idle -- --throttle 1 --port 9301 --url <pinned ?session= link> --only <ablations>` (window 6 s, the
stock window; a longer window drops the invalidation table). The pinned link and the method are in PERFORMANCE.md
"Pre-change baseline for Phase 53". **Hygiene (never relaxed):** one Chrome in the foreground at a time, no orphaned
Chrome between runs, A/B in the same session, three alternated rounds for any number that gets written down.

**Rules that apply:** CLAUDE.md guardrails (no timers for timing, no refs or timelines in state, GSAP for animation).
`docs/PERFORMANCE.md` is append-only and guarded by `src/docs/*.test.ts`: a new section, never an edit to the Task 20
section's numbers or verdicts.

---

## Phase 0 — Set up (S)

- [x] **T0.1 Cut the branch.** `git switch -c fix/document-repaint` from `perf/per-mover-layers`. The three untracked
  `global-pedals` docs carry across; leave them alone.
- [x] **T0.2 Confirm the baseline reproduces.** One stock round on `main` *and* one on the branch, same session, three
  alternated rounds. Expect the document layer at ≈ 0.99 (main) and ≈ 0.78 (branch) screens/frame with 279–345 paints
  in ~350 frames. If it does not reproduce, stop: the harness or the machine has changed, and the rest is moot.

**Gate 0:** the document repaint is present on both builds at roughly the recorded size. **PASSED (2026-10-17).**

**As measured (Phase 0).** `main` `4a9b3fec` from a throwaway worktree, bundle `index-CVUy7kf3.js` (identical to the
Task 20 build), served on :4183; `fix/document-repaint` `f6a512a3` (= `perf/per-mover-layers` tip + this plan), bundle
`index-Dil0Vyn4.js`, on :4181. Three alternated rounds (main, branch, …), fresh headless Chrome each, foreground, one
at a time; orphaned `trace-atlas-perf` Chrome 0 before and after. The unnamed painter (`''` in paint-by-node: a layer
with no owning node, avg clip 1 152 000 px² = exactly the 1280 × 900 viewport) is the document layer:

| Round | main screens/frame | main document paints / frames | branch screens/frame | branch document paints / frames |
|---|---|---|---|---|
| 1 | 3.09 | 357 / 361 | 0.95 | 280 / 358 |
| 2 | 3.09 | 357 / 361 | 0.91 | 277 / 358 |
| 3 | 3.10 | 355 / 361 | 0.91 | 277 / 358 |

Matches Task 20 (3.10 / 0.95). Two things to carry into Phase 1: the painter has **no owning node**, which is why no
`StyleRecalc`/`Layout` entry in the invalidation table names it; and on the branch it paints on ~77 % of frames against
~99 % on `main`, so something the branch changed (the stage scale 0.763? the movers?) already skips it one frame in four.

---

## Phase 1 — Narrow it down by switching things off (S–M)

Each step re-traces the same 6 s window with one thing off. The harness already has every ablation named below in
`scripts/perf/idle-paint.mjs` (`ABLATIONS`); none needs a rebuild. Read **the document layer's paint count and
screens/frame**, not the total. Run on `main` (fewer moving parts); confirm the winner on the branch once found.

- [x] **T1.1 Scene or shell?** `--only no-scene`. If the document repaint survives with the whole ocean scene hidden,
  the culprit is in the console shell (header, viewport chrome, drawers, nav). If it vanishes, it is inside the scene.
  This single run halves the search.
- [x] **T1.2 Shell branch:** `--only all-anim-off`, then `--only all-anim-off+no-header`. The first switches off every
  known CSS animation (bridge flicker, rocker pulse, scene transitions); the second also hides the header. `no-rocker-pulse`
  alone is already cleared (PERFORMANCE.md) and need not be re-run.
- [x] **T1.3 Scene branch:** `--only static-scene` (robots, bubbles and transitions off), then `--only no-gradient-rects`
  and `--only no-factories`, `--only no-stations`. Promoted movers were already shown not to be the document's painter
  (their paints land in their own layers), so the suspects are the things *without* their own layer.
- [x] **T1.4 Read the invalidation table** (printed with `--attribution`, the default, for each 6 s window). Look for the
  top `StyleRecalc` / `Layout` reasons whose node is **outside** the stage, or on the stage root itself. A reason that
  fires ~300 times per window on one node is the shape of the answer. Record the top 8 in the write-up.
- [x] **T1.5 Add an ablation if needed.** If T1.1–T1.4 point at something with no existing switch, add one entry to
  `ABLATIONS` (a CSS snippet, or a sticky `js:` node removal) and re-run. Keep the entry; it becomes the proof.

**Gate 1:** one ablation makes the document layer's paints drop from ~300 to a handful in the window, on both builds,
and the invalidation table names a node and reason consistent with it. If no ablation does, go to Phase 2.

**Gate 1 outcome (2026-10-17): FOUND, and it is in the harness, not the product.** Phase 2 is not needed.

**What the ablations said (T1.1–T1.3, all on `main`, one run each).** `no-scene` takes the repaint with it (Paint n
1091 → 32, 3.11 → 0.08 screens/frame), so it is inside the scene. But *every* scene-side switch leaves the paint count
untouched: `static-scene` 1054, `no-robots` 1060, `no-gradient-rects` 1063, `no-factories` 1054, `no-stations` 1058,
`no-fill-transitions` 1046 (stock 1082–1094), all at 3.12–3.15 screens/frame. Hiding the robots does not stop "the
document" painting. So the driver was not scene content, and the invalidation table could never name it: the painter
has no node.

**What the raw trace says (T1.4/T1.5, a scratch probe at
`C:\Users\Crawford\AppData\Local\Temp\claude\c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7\02173d54-d74c-45b9-be6d-aa0ea8fb65c6\scratchpad\probe-paints.mjs`,
3 s windows, same launch and power-on as the harness).** The unnamed painter is the `Paint` event with
`nodeName: "#document"`, `nodeId: 2`, `layerId: 0`, clip = the 1280 × 900 viewport. On both builds, 179 frames:

| | main | branch |
|---|---|---|
| `#document` Paint events | 179 | 179 |
| …that wrap other Paint events (by timestamp and duration) | 179 | 179 |
| …that stand alone | 0 | 0 |
| other Paint events outside a `#document` Paint | 0 | 0 |
| `RasterTask` events for the document's compositor layer (layer 9, 1280 × 900) | 4 | 4 |
| frames in which that layer rastered | 1 | 1 |

The `#document` `Paint` is Chrome's whole-frame paint pass (`LocalFrameView::PaintTree`): it opens once per frame
that paints anything and the per-layer `Paint` events (the moving sheets on `main`; the robot movers on the branch)
sit inside it. Its self time is bookkeeping (≈ 43 ms of 203 ms over 3 s on `main`). The document's actual compositor
layer rastered on **one frame in 179**. There is no document repaint. `scripts/perf/paint-area-lib.mjs`
`paintEventArea` sees a complete `Paint` with a viewport-sized clip and no layer of its own, and charges one viewport
per frame for it. That charge is the whole of the miss:

| | main | branch |
|---|---|---|
| measured `screens/frame` (Phase 0 medians) | 3.09 | 0.91 |
| the wrapper's charge (document paints ÷ frames × 1 viewport) | 357/361 = 0.99 | 277/358 = 0.77 |
| without the wrapper | ≈ 2.10 | ≈ 0.14 |
| ratio | | **≈ 0.07 ×** (limit 0.25) |

**Side findings, not this task's (file them):** (1) the branch promotes a `g.gem__part` (70 × 190) and a
`circle.robot__work-drop` to compositor layers of their own, plus six small unnamed layers (116, 112–118), and the
gem part rasters every frame; cheap, but unexplained. (2) Both builds force a synchronous style-and-layout inside the
rAF callback every frame (`Blink.ForcedStyleAndLayout` under `FunctionCall v@index:217`, two `Layout`s per frame):
a layout-read-after-write in the swim tick, worth its own look. (3) `EventHandler::handleMouseMoveEvent` + hit test
at the top of every frame: Chrome's fake mouse move after layout; harmless, but it means layout changes every frame.

**Decision for Crawford (Phase 3's shape).** The product has nothing to fix. The gate's metric does. Two ways:

- **(a) Minimal, keeps the metric's definition:** `paintEventArea` ignores a `Paint` whose `nodeName` is `#document`
  when it wraps other `Paint` events in the same window, counting it only when it stands alone (a genuine root-layer
  repaint with nothing nested would then still be charged). TDD in `paint-area-lib.test.mjs` with the nesting fixture
  above. Then Phase 4 re-runs the gate with the corrected harness and records the method change the way `6e3b07cb`
  was recorded. Recommended.
- **(b) Better metric, bigger change:** read `RasterTask` per compositor layer (as the probe does) and report
  re-rastered area per frame = Σ (frames a layer rastered × its area) ÷ frames. That is literally what Phase 53 set
  out to reduce, and what the desktop-underrun finding named. It is a new column, not a replacement, and a new
  baseline; its own small task after (a).

---

## Phase 2 — If style switches do not find it (M) — NOT NEEDED, see Gate 1 outcome

A document-layer repaint can come from the compositor rather than from a style change: a `will-change`, `filter` or
`backdrop-filter` on an element Chrome cannot promote; a `transform` on an ancestor of the stage; a per-frame JS write
that sets an attribute to its current value. The invalidation table does not always show these.

- [ ] **T2.1 Full trace.** `npm run perf:trace` on the stock window and read the `Paint` events on the document layer:
  their `clip`, and which `UpdateLayer` / `Layerize` events precede them. A paint preceded every frame by a compositor
  update of a root-level layer points at promotion, not style.
- [ ] **T2.2 Per-frame JS writers.** With Chrome DevTools open on the preview (the `browser-testing-with-devtools` skill),
  record 3 s of Performance and look at who runs every frame: the `gsap.ticker` listeners (the dissolve follower, the
  deck camera's follow loop), any Zustand subscriber that writes to a root element, React commits per frame. Any writer
  whose target is outside the stage is a suspect; stub it with a sticky `js:` ablation and re-run Phase 1's measurement.
- [ ] **T2.3 Layer tree.** Read `Mover layers:` and the compositor-layer readout for a layer that is viewport-sized and
  **not** one of the five named sheets. An unnamed viewport-sized drawing layer that was not in the Task 4 baseline is a
  finding on its own.

**Gate 2:** same as Gate 1. If still not found after T2.3, stop and write up what was ruled out; the decision returns
to Crawford with options 1 and 3 from the Task 20 section.

---

## Phase 3 — Fix it (S, or M with a spec)

- [ ] **T3.1 Decide the shape.** If the cause is a single CSS rule or a stray animation: fix in place, one commit. If it
  is the camera loop, the scene stack, a shell layer or a React render pattern: write `docs/specs/DOCUMENT_REPAINT.md`
  first (short; what changes, what must not change in the look, the gate), and get Crawford's nod before T3.2.
- [ ] **T3.2 Fix it, TDD where there is logic.** A unit test only where a function changes; a CSS-only fix has no unit
  test, and the measurement is its test. Guardrails: no `setTimeout`/`rAF` for timing, no refs in state; if the fix
  touches a GSAP ticker, it stays outside `timelineMap` the way the dissolve follower does.
- [ ] **T3.3 Prove it on the branch.** Three alternated stock rounds, branch fixed vs branch unfixed, same session. The
  document layer's paints drop to a handful; busy and Paint do not rise. **This is a MISS if the look changed** — check
  Checkpoint B's list (a station exit with halo waves; the dimmed world) in a live browser.

**Gate 3:** the document repaint is gone on the fixed branch, the look is unchanged, suite green, types clean, lint 0
errors.

---

## Phase 4 — Re-run the Task 20 gate, unchanged (S)

- [ ] **T4.1 Merge** `fix/document-repaint` into `perf/per-mover-layers`. Also apply the fix to `main` **for the
  measurement only** (a throwaway local branch, not pushed) so both sides are measured without the repaint; the gate
  compares the phase's work, and the fix is not the phase's.
- [ ] **T4.2 Re-run the gate exactly as written**: same world, same window, three alternated rounds, all four criteria.
  Write a new PERFORMANCE.md section "Per-Mover Compositor Layers — the Task 20 gate, re-run after the document repaint
  fix (date)" with its own tables and PASS/MISS words. Do not edit the original Task 20 section.
- [ ] **T4.3 Extend the docs guard.** `src/docs/perMoverGateDocs.test.ts` pins the original section; add the re-run
  section to it (or a sibling test) so its verdict words are checked against its numbers the same way. This is the last
  edit those guards get before R7a trims them.
- [ ] **T4.4 Re-measure R5** (bubble strips, busy MISS) on the fixed branch, since the document repaint may have been
  part of its busy time. Record the result under R5; its decision stays Crawford's.

**Gate 4:** all four Task 20 criteria PASS on the re-run. If `screens/frame` still misses with the document repaint gone,
the miss is real and the decision returns to Crawford (options 1 and 3).

---

## Then (not tasks here)

- R7a trims the docs guards once, as planned.
- Checkpoints B and C (live look in Chrome and Firefox) and the Pixel underrun count (Task 21) remain Crawford's.
- `perf/per-mover-layers` PR.

## Decision log

- 2026-10-17 — Option 2 chosen (fix and re-run; the gate criterion stays untouched). Branch off `perf/per-mover-layers`
  because the harness lives there. No spec until the cause is known.
