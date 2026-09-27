# Implementation Plan: Oblique Cabinetry — Compositor-Driven Wall Rendering

Source spec: [docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md](../specs/OBLIQUE_CABINETRY_WALL_RENDERING.md). Not new roadmap scope — a rendering-mechanism fix to `CabinetBox`, the already-shipped shared primitive `Button`/`Toggle`/`VoxelTrack` (and therefore `SliderLinear`) all depend on. Pure presentation/performance change — no `AudioEngine`/`BeatClock` change, no Zustand-shape change, no `ControlSchema` change, and (per spec §1.6) no consumer file is expected to need editing at all.

## Overview

Replace `CabinetBox`'s SVG `<polygon>` walls — whose `points` attribute GSAP tweens directly, forcing main-thread layout/paint every frame and visibly lagging behind the front face's compositor-driven `transform` tween — with two plain `<div>`s using a fixed CSS skew (set once, never animated) and an animated `scale` equal to the pop progress `t` itself. This is a small, tightly-scoped rewrite of one already-cohesive primitive: unlike prior Cabinetry plans, there's no independent foundation-module fan-out to parallelize — `cabinetGeometry.ts`'s renamed/narrowed export must ship before `CabinetBox.tsx` can consume it, and `CabinetBox.tsx` must ship (and be visually confirmed correct) before the docs describing its mechanism are rewritten. Three tasks, strictly sequential.

## Architecture Decisions

- **No parallel foundation phase, unlike `OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s own plan** — that plan had 3 genuinely independent modules feeding a later consumer; this one is a single primitive's internals being swapped end to end, so `cabinetGeometry.ts` → `CabinetBox.tsx` → docs is a straight line, not a graph with parallel branches.
- **`CabinetBox.tsx`/`.css`/`.test.tsx` stay one task (Task 2), not split by file** — mirrors `OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s own Task 5/6 precedent (component + its styles + its tests bundled as one vertical slice) rather than splitting test-writing out separately; the rendering swap and its test coverage are too tightly coupled to review independently (a wall-scale assertion is meaningless without the div structure it's asserting against, and vice versa).
- **The skew-direction empirical check (spec §7 item 1, the single highest-risk item in the spec) is folded into Task 2's own acceptance criteria and this plan's Checkpoint after Task 2 — not a separate task.** It has no files of its own to touch (it's a verification of Task 2's output, not new implementation), and the spec is explicit that this must be confirmed before the work is considered done — giving it a dedicated checkpoint gate (human sign-off required before Task 3 starts) makes that non-skippable without inventing a task with nothing to build.
- **Docs (Task 3) depend on Task 2 alone, not on any separate "verification task"** — `docs/CONSOLE_THEMING.md`'s rewritten paragraph must describe the *actual shipped* mechanism, so it can only be written accurately once Task 2's checkpoint (including the skew-direction confirmation) has passed.
- **No task in this plan touches `Button.tsx`, `Toggle.tsx`, `VoxelTrack.tsx`, `SliderLinear.tsx`, or any of their `.css`/`.test.tsx` files** — confirmed against spec §1.6/§2's explicit boundary. Task 2's own acceptance criteria include re-running all four consumers' existing test suites and a manual spot-check, specifically to *prove* this boundary held, not merely to assume it.

## Dependency Graph

```
Task 1 (cabinetGeometry.ts + .test.ts —
        computeCabinetGeometry renamed to
        computeCabinetFrontFaceOffset,
        polygon math dropped, 2 new skew
        constants added)
        │
        ▼
Task 2 (CabinetBox.tsx/.css/.test.tsx —
        SVG polygon walls replaced with 2
        skewed/scaled <div>s; empirical
        skew-direction verification)
        │
        ▼
Task 3 (docs/CONSOLE_THEMING.md +
        docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md
        correction note)
```

## Task List

### Phase 1: Foundation — the pure math

- [x] **Task 1: `cabinetGeometry.ts` — `computeCabinetGeometry` renamed to `computeCabinetFrontFaceOffset`; two new fixed skew constants**

  **Description:** Per spec §1.3/§4: rename `computeCabinetGeometry(width, height, t, popDistance)` to `computeCabinetFrontFaceOffset(t, popDistance)` — drop the `width`/`height` params (the front-face offset never used them) and the `topFacePoints`/`leftFacePoints` fields from its return shape entirely (only `frontFaceOffsetX`/`frontFaceOffsetY` remain). Add `CABINET_TOP_FACE_SKEW_DEG = Math.atan(2) * (180 / Math.PI)` and `CABINET_LEFT_FACE_SKEW_DEG = Math.atan(0.5) * (180 / Math.PI)`. `CABINET_POP_DISTANCE`, `VOXEL_TRACK_POP_DISTANCE`, `VOXEL_TRACK_POP_DISTANCE_MIN_RATIO` are untouched — same values, same exports.

  **Acceptance criteria:**
  - [x] `computeCabinetFrontFaceOffset(0)` returns `{ frontFaceOffsetX: 0, frontFaceOffsetY: 0 }`; `computeCabinetFrontFaceOffset(1, D)` returns `{ frontFaceOffsetX: 2*D, frontFaceOffsetY: D }` for a representative `D`; an intermediate `t` (e.g. `0.5`) matches the formula directly, not just "doesn't throw".
  - [x] `popDistance` defaults to `CABINET_POP_DISTANCE` when omitted — mirrors the old `computeCabinetGeometry`'s own default-param test.
  - [x] Pure function: identical inputs return identical output across two calls.
  - [x] `CABINET_TOP_FACE_SKEW_DEG` equals `Math.atan(2) * (180 / Math.PI)` computed independently in the test (not a hardcoded literal, so a future change to the projection ratio can't silently desync a stale copied number); `CABINET_LEFT_FACE_SKEW_DEG` equals `Math.atan(0.5) * (180 / Math.PI)` the same way; their sum is `90` within floating-point tolerance.
  - [x] `CABINET_POP_DISTANCE`, `VOXEL_TRACK_POP_DISTANCE`, `VOXEL_TRACK_POP_DISTANCE_MIN_RATIO` are byte-identical to before this task (`git diff` on those 3 lines is empty).
  - [x] No `topFacePoints`/`leftFacePoints`/polygon-string test case remains in `cabinetGeometry.test.ts` — every such case is replaced by an equivalent `computeCabinetFrontFaceOffset` case, not left alongside a now-dead export.

  **Verification:**
  - [x] `npx vitest run src/utils/cabinetGeometry.test.ts` passes (12 tests).
  - [x] `npm run build:types` — confirmed failing, exactly and only at `CabinetBox.tsx`/`CabinetBox.test.tsx`'s old `computeCabinetGeometry` references (3 errors, all in those 2 files) — proves the rename is real, to be fixed by Task 2.
  - [x] `npm run lint` clean on the 2 changed files.

  **Dependencies:** None.

  **Files:** `src/utils/cabinetGeometry.ts`, `src/utils/cabinetGeometry.test.ts`

  **Estimated scope:** S (2 files, pure math — a rename, a narrowed signature, and 2 derived constants)

### Checkpoint: Foundation math ships
- [x] `npm run build:types` fails loudly (not silently) anywhere still referencing the old `computeCabinetGeometry` name or its polygon fields — confirms the rename is real, not additive-only. (Confirmed: exactly 3 errors, all in `CabinetBox.tsx`/`CabinetBox.test.tsx`.)
- [x] `npm run lint` clean on the changed files (full-repo `build:types`/`build` deliberately not clean yet — see above).
- [x] `npx vitest run src/utils/cabinetGeometry.test.ts` passes in isolation (12 tests).
- [x] Review with human before proceeding — low-risk task, but nothing downstream (Task 2) can start correctly until the new signature is confirmed.

---

### Phase 2: The rendering swap

- [x] **Task 2: `CabinetBox` — SVG polygon walls replaced with two fixed-skew, scale-tweened `<div>`s**

  **Description:** Per spec §1.2/§1.4/§1.5/§4: `topFaceRef`/`leftFaceRef` become `HTMLDivElement` refs (were `SVGPolygonElement`). Add a mount-only `useEffect` (`[]` deps) that calls `gsap.set(topFaceRef.current, { skewX: CABINET_TOP_FACE_SKEW_DEG })` and `gsap.set(leftFaceRef.current, { skewY: CABINET_LEFT_FACE_SKEW_DEG })` exactly once — never inside the main geometry effect. In that geometry effect, every branch (`!isTransition` reposition, `isFirstRun && skipMountAnimation`, and the animated `gsap.timeline()` transition) swaps its two wall `attr: { points }` calls for `scaleY`/`scaleX` calls using `poppedT`/`fromPopped` **directly** (no function call — the wall scale *is* `t`); the front face's `x`/`y` calls switch from `computeCabinetGeometry(width, boxHeight, t, popDistance)` to `computeCabinetFrontFaceOffset(t, popDistance)` (Task 1). JSX: `.sc-cabinet-box__walls` becomes a `<div>` (was `<svg>`) wrapping two sized `<div>`s (`.sc-cabinet-box__top-face` — inline `width: ${width}px; height: ${resolvedPopDistance}px`; `.sc-cabinet-box__left-face` — inline `width: ${2*resolvedPopDistance}px; height: ${boxHeight}px`), both `position: absolute; top:0; left:0; transform-origin: top left` via CSS. `CabinetBox.css`: `fill` → `background-color` on both face classes; the SVG-intrinsic-size-fix comment/rule on `.sc-cabinet-box__walls` is removed (structurally impossible with a `<div>`, per spec §1.5); a new comment on `.sc-cabinet-box__top-face`/`__left-face` states neither may ever carry a `transform:` CSS rule (GSAP owns it entirely, per spec §1.4/§3).

  **Acceptance criteria:**
  - [x] Renders exactly one `.sc-cabinet-box__top-face` and one `.sc-cabinet-box__left-face` `<div>` (not `<polygon>`) inside an `aria-hidden` `.sc-cabinet-box__walls` `<div>` (not `<svg>`).
  - [x] The top-face div's inline `style.width` matches the measured (border-box) front-face width exactly; its `style.height` matches `resolvedPopDistance`. The left-face div's inline `style.width` matches `2 * resolvedPopDistance`; its `style.height` matches `boxHeight`. (These are **new, more direct** assertions than existed before — width/height are no longer routed through a mocked function call at all.)
  - [x] `skewX`/`skewY` are set via `gsap.set()` exactly once per mount, with the exact `CABINET_TOP_FACE_SKEW_DEG`/`CABINET_LEFT_FACE_SKEW_DEG` values — a subsequent `popped` change does **not** re-invoke `gsap.set()` with a `skewX`/`skewY` key (guards against the skew accidentally migrating into the main geometry effect later).
  - [x] Every existing tween-target test that asserted `attr: { points: ... }` now asserts the equivalent `scaleY` (top face) / `scaleX` (left face) value, preserving the exact same *behavioral* claim each test already made: mount-in-from-the-numeric-opposite, a real transition animates from the actual previous value (not the opposite), the dependency-only-reposition branch uses `gsap.set()` not `fromTo()`, `skipMountAnimation` skips the tween entirely on first mount, and `prefers-reduced-motion` still registers a timeline at `duration: 0`.
  - [x] `computeCabinetGeometry` is fully replaced by `computeCabinetFrontFaceOffset` in the test file's mock (`vi.mock('@/utils/cabinetGeometry', ...)`) and every call-argument assertion — `(width, height, t, popDistance)` becomes `(t, popDistance)`.
  - [x] Every other existing describe block not touched by the above (glow tween direction/value including the fractional-`popped` cases, timeline registration/cleanup, `frontWidth`/`frontHeight`, `zIndex`, `popDistance` override, the "static backing" block) still passes with no behavioral change — proves this is a rendering-mechanism swap, not a behavior change. (50 tests total in `CabinetBox.test.tsx`, all passing.)
  - [x] `grep -n "transform:" src/components/ui/controls/CabinetBox.css` shows no match on `.sc-cabinet-box__top-face`/`__left-face` — confirms GSAP owns the transform exclusively (spec §3's explicit constraint). (Only a warning *comment* mentioning `transform:` matches — no actual rule.)
  - [x] **Empirical skew-direction verification (spec §7 item 1 — the highest-risk item in the spec, do not skip):** confirmed via a new dedicated test file, `cabinetWallGeometry.verify.test.ts`, using the REAL `gsap` library (not mocked) — parses GSAP's own written transform-function string (jsdom doesn't normalize to a single `matrix(...)`, so the test composes the matrix itself per the CSS spec's own left-to-right rule) and confirms the resulting corners land exactly where the old polygon math did, at both `t=1` and a fractional `t=0.4`. This *also* empirically confirmed a second, separately real risk found during this task (not anticipated in the spec): GSAP has its own **fixed internal composition order** (translate → scale → skew → rotation, confirmed both via GSAP's own docs and by observing its actual written output) — this design's correctness depends on scale applying *before* skew, which is what GSAP does, but was not independently verified until this test. Not skipped in favor of the running app; both are valid per spec §5's own "either/or."
  - [x] `Button`, `Toggle`, `VoxelTrack` (and therefore `SliderLinear`) render and animate identically to before this task — confirmed by re-running all 4 of their existing test suites fully unmodified (see Verification below); the real-running-app spot-check is still outstanding (see Manual check below).
  - [x] `git diff` touches `src/components/ui/controls/CabinetBox.tsx`, `CabinetBox.css`, `CabinetBox.test.tsx`, and `src/utils/cabinetGeometry.ts`/`.test.ts` (Task 1, already shipped) as planned — **plus two files not anticipated in this task's own "Files" list below, found necessary during verification, not scope creep:** a new `cabinetWallGeometry.verify.test.ts` (the empirical-verification test above — genuinely new test coverage, not a consumer change) and a one-line fix to `LfoTargetGroup.test.tsx`'s own local `gsap` mock (see Verification below — its render tree includes `CabinetBox` transitively, and that mock didn't stub `gsap.set` since nothing had called it unconditionally before this task). No consumer *component* file (`Button.tsx`/`Toggle.tsx`/`VoxelTrack.tsx`/`SliderLinear.tsx`) was edited — spec §1.6's actual boundary — but its own "Files" list undercounted by 2 test-infrastructure files; recorded here rather than silently expanding scope.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx` passes in full (50 tests).
  - [x] `npx vitest run src/components/ui/controls/Button.test.tsx src/components/ui/controls/Toggle.test.tsx src/components/ui/controls/VoxelTrack.test.tsx src/components/ui/controls/SliderLinear.test.tsx` all pass **unmodified** — direct proof the contract boundary held for every real consumer, not just an assumption.
  - [x] **Found via the full-suite run, not anticipated by this task's own plan:** `LfoTargetGroup.test.tsx` failed (`TypeError: gsap.set is not a function`) — its render tree includes `Lfo` → `SliderLinear`/`Toggle` → `CabinetBox` transitively, and its own local `vi.mock('gsap', ...)` only stubbed `timeline`, never needing `set` before this task (`CabinetBox`'s wall-skew effect now calls `gsap.set()` unconditionally on mount). Fixed with a one-line addition (`set: vi.fn()`) to that mock, not a `CabinetBox` change. Searched every other local `gsap` mock in the repo (`useLfoTargetGroup.test.ts`, `AudioEngine.test.ts`, `interactionSystem.test.ts`) and confirmed none of the other 3 are affected (none render a `CabinetBox`-containing tree).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) clean — 122 files, 2064 tests.
  - [ ] **Manual check (non-optional — see the empirical-verification acceptance criterion above):** load the app, confirm a `Button`/`Toggle` pops correctly at each breakpoint, then drag a multi-box `SliderLinear` (15+ boxes, e.g. a desktop-width EQ gain slider) and confirm the front face and both walls now read as moving together — the original "top wall fills in after the facade" symptom is gone, under `prefers-reduced-motion` both normal and enabled. **Outstanding — no browser-automation tool available in this environment (confirmed via `ToolSearch`); flagged for Crawford to perform in the running app**, same honest gap prior Cabinetry task docs have recorded rather than skipping silently. The automated empirical-geometry test above is real evidence but is not a substitute for seeing it actually animate.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/CabinetBox.tsx`, `src/components/ui/controls/CabinetBox.css`, `src/components/ui/controls/CabinetBox.test.tsx`. **Actually also touched** (found necessary during verification, see Acceptance criteria/Verification above): `src/components/ui/controls/cabinetWallGeometry.verify.test.ts` (new), `src/components/ui/controls/LfoTargetGroup.test.tsx` (one-line mock fix).

  **Estimated scope:** M (3 files planned, 5 actually touched — the core and highest-risk task in this plan; rewrites the rendering mechanism of an already-shipped, heavily-depended-on reference primitive; every verification step above is non-optional, not a nice-to-have)

### Checkpoint: CabinetBox ships — the fix itself
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (122 files, 2064 tests).
- [x] **The skew-direction empirical verification is confirmed — via `cabinetWallGeometry.verify.test.ts` against the real `gsap` library**, not mocked assertions or algebra alone. This also surfaced and confirmed a second real dependency the spec didn't separately flag: the design's correctness depends on GSAP's own fixed scale-before-skew composition order, now directly observed rather than assumed.
- [ ] **The original complaint — the top wall visibly filling in after the front facade during a slider drag — still needs confirming gone in the real running app.** No browser-automation tool is available in this environment (confirmed via `ToolSearch`); this is the one item at this checkpoint that automated testing cannot close out. Flagged for Crawford.
- [ ] `Button`/`Toggle`/`VoxelTrack`/`SliderLinear` spot-checked visually in the running app — their test suites are confirmed unchanged and passing (strong evidence), but not a substitute for eyes on the actual rendered UI.
- [ ] Review with human before proceeding — highest-value checkpoint in this plan. **Everything automatable is done and green; the remaining items are the real-browser spot-check only.**

---

### Phase 3: Docs

- [x] **Task 3: Docs brought in line with the shipped mechanism**

  **Description:** Per spec §6: update `docs/CONSOLE_THEMING.md`'s Oblique Cabinetry projection-vector paragraph, which currently describes `computeCabinetGeometry`'s polygon-string output tweened by GSAP, to describe the fixed-skew/scaled-`<div>` mechanism instead — spot-checked against the actually-shipped `CabinetBox.tsx`/`.css` (Task 2), not this spec's draft code. The underlying `(2·popDistance, popDistance)` projection vector itself is unchanged and should not be re-derived. Add a short post-implementation correction note to `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md` (matching that doc's own established correction-note pattern) pointing to `docs/specs/OBLIQUE_CABINETRY_WALL_RENDERING.md` — its own §1.2 oblique-projection derivation and §1.8 glow mechanism are still accurate; only §4's SVG/`<polygon>` code block is superseded for rendering purposes.

  **Acceptance criteria:**
  - [x] `docs/CONSOLE_THEMING.md`'s projection-vector paragraph describes two `<div>`s with a fixed `skewX`/`skewY` (set once) and an animated `scaleY`/`scaleX` equal to `t`, not SVG `<polygon>` point-string tweening. Also updated: the `color-mix()` code block (`fill` → `background-color`), and the glow paragraph's "walls SVG" reference.
  - [x] No claim in the updated paragraph is contradicted by the actual shipped `CabinetBox.tsx`/`.css` — spot-checked directly (`grep`'d the exact constant names/exports the new prose cites: `CABINET_TOP_FACE_SKEW_DEG`, `CABINET_LEFT_FACE_SKEW_DEG`, `computeCabinetFrontFaceOffset`, all confirmed present with matching values).
  - [x] `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md` gains a correction note (after §1.2's own derivation) pointing to this spec, without restating or duplicating the derivation already written there.

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped `CabinetBox.tsx`/`.css`/`cabinetGeometry.ts`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change — confirmed no regression).

  **Dependencies:** Task 2.

  **Files:** `docs/CONSOLE_THEMING.md`, `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes.
- [x] All acceptance criteria across all 3 tasks are met, except the one item no automated tool in this environment can close: the real-browser manual spot-check.
- [x] `docs/CONSOLE_THEMING.md` and `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md` both reflect the shipped mechanism.
- [ ] **Manual check still outstanding — no browser-automation tool available in this environment (confirmed via `ToolSearch`).** Everything automatable (unit tests including the real-`gsap` empirical geometry verification, type-check, lint, build, full suite) is done and green. Flagged for Crawford: drag a multi-box `SliderLinear` and confirm the front face and both walls now move together with no lag, at each breakpoint, with `prefers-reduced-motion` both off and on.
- [ ] Ready for PR pending that check.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Skew direction (`skewX(63.435deg)`/`skewY(26.565deg)`) is algebraically derived, not yet empirically confirmed — CSS skew sign conventions are a known footgun, and this codebase has already hit a real, un-caught-until-rendered geometry mistake once (`OBLIQUE_CABINETRY_FOUNDATION.md §1.2`'s height-scaling correction) | High if wrong — every popped box in the app would render with visibly incorrect wall geometry | Named as its own non-optional acceptance criterion in Task 2, re-asserted at Task 2's own checkpoint requiring explicit human confirmation before Task 3 (docs) starts |
| Mixing GSAP-owned transform components with any CSS-authored `transform:` rule on the same element silently drops whichever GSAP didn't just write — an easy mistake for a future edit to reintroduce (e.g. a `:hover` rule added to `.sc-cabinet-box__top-face` later) | Medium — would silently break the skew with no error, only a visual defect | Task 2's own acceptance criteria include a `grep` check confirming no `transform:` rule exists on either wall class today; `CabinetBox.css` gains an explicit comment warning against it, and this spec's own §3 boundary states it outright |
| `CabinetBox` is consumed by 4 real components (`Button`, `Toggle`, `VoxelTrack`, `SliderLinear`) whose own files this plan never touches — a subtle prop-contract mismatch would only surface at their own test suites or in the running app, not in `CabinetBox.test.tsx` alone | Medium — a regression here would be app-wide, not isolated | Task 2's verification step explicitly re-runs all 4 consumers' existing test suites unmodified, plus a manual spot-check across all of them, not just `CabinetBox.test.tsx` |
| No profiling was done before writing the spec — the fix is diagnosed qualitatively (SVG attribute animation is main-thread-bound), not measured | Low — the fix is correct either way per the diagnosis in spec §1.1, but the *magnitude* of improvement is unverified | Out of scope for this plan (spec §7 item 3) — flagged for 11.2's performance pass to measure, using this as a before/after data point if useful |

## Open Questions

Resolved during Plan (not left open):

- ~~Should the skew-direction verification be its own task?~~ **Resolved: no — folded into Task 2's own acceptance criteria and this plan's Checkpoint after Task 2**, since it has no files of its own to touch and is a verification of Task 2's output, not separate implementation (Architecture Decisions).
- ~~Can any task in this plan run in parallel with another?~~ **Resolved: no** — unlike prior Cabinetry plans, this is a strictly sequential rewrite of one primitive (math → component → docs), with no independent foundation modules to fan out.

Carried forward from spec §7, not blocking this plan:

1. **Skew sign convention** (spec §7 item 1) — the single highest-risk item in this plan; see Risks table above and Task 2's own checkpoint.
2. **Whether to preserve any trace of the removed `topFacePoints`/`leftFacePoints` shape for future readers** (spec §7 item 2) — left as a Task 1 implementation-time judgment call; this plan and the spec's own §1.1–§1.3 narrative, plus git history, are treated as sufficient without a dedicated compatibility shim.
3. **11.2's performance pass** should treat this fix as its baseline "before" data point where useful — no specific metric is defined in this plan, consistent with the spec's own qualitative-diagnosis-only scope (§7 item 3).
