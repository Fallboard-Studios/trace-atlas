# Deck scroller compositing: an A/B of the two mitigations the Task 11 follow-up named

> **Status (2026-10-18): Phases 0 and 1 done** (Gate 0 passed; Gate 1 recorded, results under each gate below), on
> `feature/deck-scroller-compositing`. T2.1 (Pixel) skipped by Crawford: stock already composites the scroller at
> DPR ≥ 1.5. Next: T2.2, Crawford's desktop look at DPR 1.25, then Gate 2. Set up at Crawford's request after the Phase 5 investigation in
> [DOCUMENT_REPAINT.md](DOCUMENT_REPAINT.md) found that the deck camera's pans re-raster the console shell's compositor
> layer every frame, with no `Paint` ([PERFORMANCE.md](../PERFORMANCE.md) "Follow-up, same day: the shell layer and the
> marker sheet are the deck camera"). Nothing here is decided: this is a measurement, and whether a pan's raster cost is
> worth a change to the scroller is Crawford's call at Gate 2.

Written for: Crawford walking it step by step, and a fresh agent session picking it up cold.

**Not a spec.** Each variant is one CSS declaration on `.world-view__scroller` (`src/components/panels/screen/worldView/WorldView.css`).
A one-line CSS change gets a commit and the measurement as its proof (the convention DOCUMENT_REPAINT.md set); a spec is
written only if Gate 2 picks a variant **and** the look or the layer structure changes in a way ROBOT_DESIGN.md or
ANIMATION_SYSTEM.md describes.

**Branch:** `feature/deck-scroller-compositing`, cut from `perf/per-mover-layers` (the raster column, `rasteredArea`, and
the per-window raster-by-layer table live only there). If `perf/per-mover-layers` has merged by the time this starts, cut
from `main` instead; the harness is the same either way.

**Model and effort:** the builds and the desktop rounds (Phase 1) can run on Opus 5.5 at medium: the method is fixed and
the numbers are read, not interpreted. Gate 2's reading, and any spec, with Fable 5.1 at high.

**Rules that apply:** CLAUDE.md guardrails (GSAP for animation, no refs or timelines in state, the UI Shell rule). The
camera module (`src/animation/deckCamera.ts`) is not touched: it writes `scrollLeft` and keeps writing `scrollLeft`.
`docs/PERFORMANCE.md` is append-only and guarded by `src/docs/*.test.ts`: a new section, never an edit to an older one.
**Hygiene (never relaxed):** one Chrome in the foreground at a time, no orphaned `trace-atlas-perf` Chrome between runs
(filtered `Win32_Process` query on `Name='chrome.exe'`, 0 before and 0 after), A/B in one session, three rounds with the
start order rotated for any number that gets written down.

---

## What is being measured, and why a 30 s window

The deck camera (Phase 46) scrolls `.world-view__scroller` by writing `scrollLeft` from a 1.4 s GSAP tween
(`DECK_CAMERA_PAN_S`), follows the picked robot for up to 20 s (`DECK_CAMERA_FOLLOW_MS`), rests 3 s
(`DECK_CAMERA_COOLDOWN_MS`) and picks again. The scroller is `overflow-x: auto` with no layer of its own in any LayerTree
read, so its scrolling contents draw into `div.screen-content`'s compositor layer, and every frame the offset changes cc
re-rasters that layer's damaged tiles (4 of them at 1280 × 900) with no `Paint` event. The camera runs on every viewport
narrower than the stage's 16:9: every phone in portrait, and the harness's own 1280 × 900.

A 6 s window catches a pan, part of one, or none (Phase 5 read 29–35 shell-layer raster frames per window; three scratch
probes read 0–4), so this task uses **`--window 30000`**: one camera cycle is at most 1.4 + 20 + 3 s, so a 30 s window
always holds at least one pan and most of a follow. A window over 6 s is traced without the invalidation table
(`world-state-lib.mjs` `traceCategories`), which this task does not need. The 30 s figures are comparable only with each
other, never with the 6 s sections of PERFORMANCE.md.

**The variants** (one CSS declaration each, added to the existing `.world-view__scroller` rule, nothing removed):

| Variant | Declaration | What it should do | What to watch |
|---|---|---|---|
| A, stock | none | the baseline | — |
| B | `will-change: scroll-position` | Chrome composites the scroller: the scrolling contents get a layer of their own, and a scroll is a transform on the compositor, no re-raster | a new layer the size of `scrollWidth × clientHeight` (≈ 1543 × 824 at 1280 × 900, more at a phone's DPR), so layer memory rises; composited scrollers can lose LCD text anti-aliasing, but the only text under the scroller is the world's own (the meta box is a sibling, `WorldView.tsx`) |
| C | `contain: paint` | clips the scroller's paint to its box; on its own it does **not** composite the scroller, so the expectation is little or no change in the raster column | if it does nothing, that is the result; it is here because the Task 11 follow-up named it, not because it is expected to win |

---

## Phase 0 — Set up (S)

- [x] **T0.1 Cut the branch** as above. The three untracked `global-pedals` docs, if still untracked, carry across; leave them alone.
- [x] **T0.2 Three builds, three ports.** From the branch tip: variant A is the tip as it is; B and C are the one-line
  edits, each built to its own scratch `--outDir` (`npx vite build --outDir <scratch>/b`) and served with
  `npx vite preview --outDir <scratch>/b --port 4185` (A on :4184, B on :4185, C on :4186; :4181 and :4183 may still be
  serving the Phase 5 builds, leave them). **Never commit B or C before Gate 2**: build from a working-tree edit, then
  restore the file from a `cp` backup (not `git checkout --`, DOCUMENT_REPAINT.md's lesson). Record each served bundle
  hash from the served HTML, and that A's hash equals the tip's own build.
- [x] **T0.3 Confirm the camera runs in each build** before any round: on each port, at 1280 × 900, `.world-view__scroller.scrollLeft`
  read through the harness's `Runtime.evaluate` path (or a scratch probe) changes between two reads 10 s apart after
  power-on. A build whose scroller does not scroll is not measuring the camera.
- [x] **T0.4 Confirm variant B composites the scroller:** the harness's `Compositor layers:` line for B lists a layer whose
  node is `div.world-view__scroller` (or the LayerTree read in a scratch probe does); A and C list none. If B does not
  composite it, stop: the declaration did not take, and the rest is moot.

**Gate 0:** three served builds, the camera moving in all three, B's scroller composited and A's and C's not.

**Gate 0 result (2026-10-18): PASSED.**

- **T0.1:** `feature/deck-scroller-compositing` cut from `perf/per-mover-layers` at `c456ee82` (not merged to `main`);
  the three `global-pedals` docs carried across untracked.
- **T0.2:** built with `npx vite build --outDir <scratch>/{a,b,c}`. B and C were each made by adding one line after
  `scrollbar-width: none;` in a working-tree copy, then the file was restored from a `cp` backup (`git diff` empty
  afterwards). Each built CSS rule was read back from `assets/*.css`; only the added declaration differs. A is the clean
  tip with no edit, so its bundle is the tip's own build. Served bundles, read from each port's HTML:

  | Variant | Port | JS bundle | CSS bundle |
  |---|---|---|---|
  | A, stock | :4184 | `index-Dil0Vyn4.js` | `index-BtavptJm.css` |
  | B, `will-change: scroll-position` | :4185 | `index-BSuw5Pa7.js` | `index-BZMeQvU9.css` |
  | C, `contain: paint` | :4186 | `index-Ds3mB9Ot.js` | `index-CM3rPZB5.css` |

  (The JS hash changes with the CSS hash because the entry chunk references the stylesheet; no source besides the CSS
  line differs.)
- **T0.3:** a scratch probe (the harness's launch and power-on, then `scrollLeft` once a second for 25 s, at 1280 × 900,
  pinned link) read the camera moving on all three: 217 px for the first ~8 s after the settle, a pan, then 0 for the
  rest (A `217 … 176 33 0 …`, B `217 … 178 35 0 …`, C `217 … 192 50 0 …`). `scrollWidth` 1465, `clientWidth` 1248,
  `clientHeight` 824 on all three, so the scroll range at 1280 × 900 is 217 px, not the ≈ 295 px the 1543-wide
  estimate above implied.
- **T0.4:** the same probe read one LayerTree snapshot per build, with every layer's owning node. **B:** two layers owned
  by `div.world-view__scroller`, a 1248 × 824 container that draws nothing and a **1465 × 824 scrolling-contents layer
  that draws** (≈ 4.6 MiB at 1×, before DPR); and `div.screen-content`'s layer **stops drawing content**
  (`drawsContent` false; true on A and C). **A and C:** no layer owned by the scroller; `div.screen-content` draws.
  The harness's own `Compositor layers:` line names only scene slots, so it does not show the scroller layer; T1.1
  reads it from the raster-by-layer table instead. LayerTree reports every layer as a child of the root, so nesting
  under the new layer cannot be read from it; the sheet and mover counts are compared in T1.1 as the Risks row says.
  Totals per snapshot (unscaled, the probe's own sum): A 38 layers / 34 drawing / 31.3 MB, B 40 / 34 / 32.0, C 36 / 33
  / 31.2. Counts move between reads of the same build (A read 35 and 38) because bubble layers come and go, so they
  are not compared here.

---

## Phase 1 — Desktop rounds (M)

Pinned world: the Phase 53 baseline's `?session=` link (PERFORMANCE.md "Pre-change baseline for Phase 53"), port changed
per variant. Command, per variant and round:

```text
npm run perf:idle -- --throttle 1 --window 30000 --only none --port 9301 --url <link on that port>
```

- [x] **T1.1 Three rotated rounds at 1280 × 900**, A B C, then B C A, then C A B, each a fresh headless Chrome, foreground,
  one run per call. From each run record: `rastered px²/frame`, `rastered screens/frame`, `unresolved raster layers`,
  `late layers`, `redrawn px²/frame`, `screens/frame`, busy, Paint, Compositor::Update, Layerize, frames, long tasks, and
  from the stock raster-by-layer table the **shell layer's frames rastered and tasks** (`div.screen-content`) and, for B,
  the scroller layer's own row. Record the `Compositor layers:` line and `Mover layers:` of each variant.
- [x] **T1.2 One control round at 1600 × 900** (`--width 1600`), A B C: the camera stands down at 16:9 (`scrollRange()`
  is 0), so the three variants must read alike there, shell layer at ≤ 7 frames in 30 s on all three. A variant that
  differs from A at 1600 × 900 changed something other than the camera's cost.
- [x] **T1.3 Write the rounds up** as a new appended PERFORMANCE.md section "Deck scroller compositing — the desktop A/B
  (date)": one results table per variant (Round rows 1–3, Median, Min–max, the columns above), the 1600 × 900 control
  table, the layer readouts, the builds (hashes, ports, tip commit), the method and hygiene sentence, and the reading.
  Guard it with a sibling of `src/docs/perMoverRasterDocs.test.ts` (tables agree with their medians and ranges; both area
  columns against their px² over the viewport; the control round names all three variants).

**Gate 1 (recorded, read at Gate 2):** for each variant against A, medians over the three rounds: the shell layer's
frames rastered; `rastered screens/frame`; busy, Paint and Compositor::Update inside A's min–max or not; layer memory in
MB. Expected if B works: shell layer frames ≈ 0 and `rastered screens/frame` lower by the shell's share (≈ 0.1 of
`main`'s 3.23 at 6 s; different at 30 s, read it), a new scroller layer of ≈ 5 MB at 1×, Compositor::Update possibly
higher. Expected for C: no change. A MISS here is not a stop: this phase records, Gate 2 decides.

**Gate 1 result (2026-10-18, recorded):** written up and guarded in PERFORMANCE.md "Deck scroller compositing — the
desktop A/B (2026-10-18)" (`src/docs/deckScrollerCompositingDocs.test.ts`, 8 doc mutants killed). Medians against A:

| | A, stock | B, `will-change: scroll-position` | C, `contain: paint` |
|---|---|---|---|
| shell layer frames rastered (30 s) | 140 | **0** | 142 |
| scroller layer frames rastered | — (no layer) | 48 | — (no layer) |
| `rastered screens/frame` | 0.29 | **0.25** (0.86 × A) | 0.29 |
| busy / Paint / Compositor::Update (ms) | 9827 / 1505 / 1463 | 9720 / 1484 / 1427 | 9776 / 1487 / 1448 |
| compositor layer memory, 1× | 24.2 MB | 24.9 MB (**+ 0.7**) | 24.2 MB |

B and C both sit just under A's min–max on the three main-thread columns, so those are session spread, not B. B
removes the camera's share of the shell raster (≈ 92 frames per 30 s) and keeps the ≈ 48 per-second frames, which move
to its scroller layer; C does nothing, as expected, and is dropped from Phase 2 (open question 2's default). Two
corrections to this plan: the scroll range at 1280 × 900 is 217 px (`scrollWidth` 1465), so B's layer is 1465 × 824, not
≈ 1543; and the T1.2 expectation "≤ 7 shell frames in 30 s" was wrong: the control reads 47–48 on every variant (in B,
on the scroller layer), the per-second raster inside the scroller that a 6 s window barely caught.

**A finding that changes Phase 2.** Stock Chrome composites the scroller **by itself** at DPR ≥ 1.5 or in mobile mode
(scratch probe on stock A: not composited at DPR 1 and 1.25 desktop; composited at DPR 1.5, 2, and DPR 1 with
`mobile: true`; one harness run each of A and B at the phone emulation reads the same scroller layer and the same 62.8 MB).
So the camera's per-pan shell raster is a **low-DPI desktop** cost, and on the Pixel (DPR ≈ 2.6, mobile) stock already
does what B does. T2.1's underrun A/B would compare two builds with the same layers. **Open, for Crawford at Gate 2:**
run T2.1 as written anyway, replace it with a check that the Pixel's own LayerTree (remote DevTools, Layers panel) shows
the scroller layer on stock, or drop it; and what DPR the desktop window Crawford hears the underruns on runs at (Windows
display scaling 100 % or 125 % is DPR 1 or 1.25, the case B changes).

---

## Phase 2 — The Pixel and the look (S, Crawford)

- [ ] **T2.1 Pixel underruns, A vs B** (C only if Phase 1 showed it did anything): the LAN production preview of each
  (`npx vite preview --host --outDir …`), the same pinned link, **portrait** (where the camera runs), Full Audio Load, the
  `?debug` overlay open, three minutes each, A then B then A, in one sitting. Record each listen's overlay underrun count
  and whether anything was audible, in Crawford's own words, the way the Task 21 Pixel section does. Expect B at or below
  A; the camera's raster cost is the phone's cost, and this is the measurement that matters.
  **SKIPPED (Crawford, 2026-10-18):** stock already composites the scroller on the Pixel (Gate 1 result), so the A/B would
  compare identical layers. The phone was never where this cost lands.
- [ ] **T2.2 The look, B against A, same phone and a desktop window narrower than 16:9** (1280 × 900 in Chrome): a camera
  pan and a follow look the same (no snap, no blur, no shimmer of the world's text or hairlines while scrolling, the
  marker tracks the robot); a swipe and a wheel still freeze and release the camera; the dimmed world (a hub tile open)
  still dims. **This is a MISS if the look changed.**
  **Narrowed (2026-10-18):** desktop only, since the phone is identical on A and B. Crawford's desktop runs at Windows
  125 % scaling, DPR 1.25, which is the case B changes: the Phase 0 probe at DPR 1.25 reads stock with no scroller layer
  and B with the 1465 × 824 scrolling-contents layer and the shell layer not drawing, exactly as at DPR 1. B's layer
  memory there is ≈ + 1.1 MB (the + 0.7 MB at 1× times 1.25²). DPR 1.25 is also where Chrome keeps LCD sub-pixel text on
  stock and drops it on a composited scroller, so the world's text and hairlines are the thing to look at.

**Gate 2 (Crawford's decision):** adopt B, adopt nothing, or ask for a spec. Adopt B only if Gate 1 shows the shell layer
quiet and busy/Paint within A's spread, T2.1 shows the Pixel at or below A, and T2.2 passes; the layer-memory increase is
stated in the decision, not hidden. If adopted: commit the one line with the WorldView.css test updated
(`src/components/panels/screen/worldView/WorldView.css.test.ts` pins the `.world-view__scroller` rule body), a sentence
in ANIMATION_SYSTEM.md's deck camera section saying the scroller is composited and why, and the Gate 2 decision written
into the PERFORMANCE.md section as a dated paragraph. If not adopted: the section records why, and the scroller stays as
it is.

---

## Then (not tasks here)

- `perf/per-mover-layers` PR (Crawford's), with or before this branch.
- The two Phase 5 findings that are not the camera stay open: the `dissolve` div and `mid` sheet rastering about four
  times a second on the branch, and the seven single-tile layers in neither LayerTree snapshot
  ([DOCUMENT_REPAINT.md](DOCUMENT_REPAINT.md) Phase 5, findings 2 and 3).

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| A 30 s window on a busy page can overflow Chrome's trace buffer and quietly hold only the first part (R5's lesson) | the rounds measure less than they claim | the harness prints `truncationWarning` and the `frames` column; a round with under 30 × 60 × 0.5 frames is discarded and re-run, and the frame count is in the table |
| B's new layer costs more memory on the Pixel than it saves in raster | a desktop PASS and a phone regression | T2.1 is on the phone; memory is read from the `Compositor layers:` line per variant and stated at Gate 2 |
| `will-change: scroll-position` changes how the sheets inside the scroller composite (they are `position: absolute` layers inside a now-composited scroller) | the Phase 53 layer structure moves under the robots | T0.4 and T1.1 read the whole `Compositor layers:` line per variant; the sheet and mover counts must match A's |
| The camera's timing differs between variants in a round (a pan caught in one window and not another) | noise read as signal | 30 s windows (≥ 1 pan each), three rotated rounds, medians; the shell layer's frames are read, not inferred |

## Open questions

1. Should the camera's raster cost be measured on `main` too, or only on the branch? **Open.** The branch is what ships
   next and what the harness column exists on; `main` would need its own three rounds. Default: branch only.
2. Is C worth building at all? **Open.** It is in the Task 11 follow-up's list, and one build and three rounds is cheap;
   default: build it, and drop it from Phase 2 if Phase 1 shows no change.
