# Implementation Plan: Oblique Cabinetry — Foundation & Button (Roadmap Phase 11.1.1)

Source spec: [docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md](../specs/OBLIQUE_CABINETRY_FOUNDATION.md). Source intent: [docs/intent/oblique-cabinetry-foundation.md](../intent/oblique-cabinetry-foundation.md). Pure presentation addition — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `ControlSchema`/`ButtonSchema` change. Every task below either adds a dependency-free math/constants module, a hook, the shared rendering primitive, or wires `Button` (the phase's only real consumer) through it. None touch audio scheduling, any domain config, or any drawer.

## Overview

Ship the shared Oblique Cabinetry rendering mechanism — viewport-width breakpoint tiers, the oblique-projection wall geometry, the pop/flat GSAP timing, a `matchMedia`-driven box-height hook, and the `CabinetBox` component itself (SVG walls + HTML front face) — then wire every real `Button` in the app through it as the first proof. Foundation modules (breakpoints, geometry, animation timing) are pure and mutually independent, so they ship first and in parallel; `CabinetBox` composes all three plus the new hook; `Button` is the only consumer this phase touches. Docs land last, once each piece's final shipped shape is real and spot-checkable.

## Architecture Decisions

- **Tasks 1–3 (breakpoints, geometry, animation timing) are independent pure modules with zero imports between them — genuinely parallelizable**, unlike `docs/tasks/DIRECTIONAL_PANEL.md`'s strictly-sequential precedent (that phase had only one component to build). This mirrors `docs/tasks/LFO_CONSOLIDATED_DISPLAY.md`'s Tasks 3–5 parallelization note more than `DIRECTIONAL_PANEL.md`'s single-file-chain shape.
- **`useCabinetBoxHeight` (Task 4) is its own task, not folded into `CabinetBox`,** because it has an independent, fully-mockable contract (`window.matchMedia` → a number) that `CabinetBox`'s own test suite would otherwise have to re-stub inline every time — same reasoning `useAutoSliderOrientation.ts` being its own file (not inlined into the 3 slider components that use it) already established in this codebase.
- **`CabinetBox.tsx`/`.css`/`.test.tsx` ship as one task (Task 5), not split further** — same precedent `DIRECTIONAL_PANEL.md`'s Task 2 and `LFO_CONSOLIDATED_DISPLAY.md`'s Task 2 both used: the `.tsx` is non-functional without its `.css` (renders unstyled, no wall shading, no reserved padding), and the test file is what proves spec §5's acceptance criteria. Sized **M, not S**, despite being 3 files — flagged explicitly because this task is genuinely the highest-risk one in this plan (real SVG polygon-attribute GSAP tweening + `ResizeObserver` + composing all of Tasks 2–4 for the first time), not a mechanical composition the way `DirectionalPanel`'s single `<div>` wrapper was.
- **`Button` is a separate task (Task 6) after `CabinetBox`, not merged into it** — `CabinetBox` ships with zero real consumers first, same "component before consumer" sequencing `docs/specs/DIRECTIONAL_PANEL.md § 2` and `useAutoSliderOrientation`'s own history both already established in this codebase. This also isolates risk: if `CabinetBox`'s own test suite (Task 5) passes but something about real-button wiring surfaces an issue, it's contained to Task 6 alone.
- **The 2 docs tasks (7, 8) depend on different upstream tasks and can run in parallel with each other** (`docs/CONSOLE_THEMING.md`'s geometry/shading notes only need `CabinetBox` — Task 5 — finished; `docs/COMPONENT_LIBRARY.md`'s Button note needs Task 6) — a more precise dependency than gating both on "everything," and safe to parallelize the same way `LFO_CONSOLIDATED_DISPLAY.md`'s Tasks 4/5 were once their shared prerequisite landed.
- **No task in this plan touches a drawer, a domain config file, or any other primitive** — confirmed against spec §3's Strict Scope boundary; `Toggle`/the 3 sliders are explicitly 11.1.2–11.1.5's own future plans, not tasks here.

## Dependency Graph

```
Task 1 (cabinetBreakpoints.ts)   Task 2 (cabinetGeometry.ts)   Task 3 (cabinetAnimation.ts)
        │                                  │                            │
        └──→ Task 4 (useCabinetBoxHeight.ts)
                  │                        │                            │
                  └────────────────────────┴────────────────────────────┘
                                            │
                                  Task 5 (CabinetBox.tsx/.css/.test.tsx)
                                       │              │
                                       │              └──→ Task 7 (docs/CONSOLE_THEMING.md)
                                       │
                                  Task 6 (Button.tsx/.css/.test.tsx)
                                            │
                                            └──→ Task 8 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — pure math and constants (parallelizable)

- [x] **Task 1: `cabinetBreakpoints.ts` — viewport-width tiers + box heights**

  **Description:** Add `src/utils/cabinetBreakpoints.ts` per spec §4's full shape: `CABINET_BREAKPOINT_MOBILE_MAX = 640`, `CABINET_BREAKPOINT_TABLET_MAX = 1024`, `CABINET_BOX_HEIGHT = { mobile: 32, tablet: 40, desktop: 48 }`, `CabinetTier` type. This is the JS-side source of truth `CabinetBox.css` (Task 5) independently mirrors via its own `@media` rules — see spec §1.3.

  **Acceptance criteria:**
  - [x] `CABINET_BREAKPOINT_MOBILE_MAX` (`640`) `< CABINET_BREAKPOINT_TABLET_MAX` (`1024`).
  - [x] `CABINET_BOX_HEIGHT.mobile` (`32`) `< .tablet` (`40`) `< .desktop` (`48`).
  - [x] `CabinetTier` is exported as `keyof typeof CABINET_BOX_HEIGHT`.
  - [x] No other file is imported by this module — it has zero dependencies.

  **Verification:**
  - [x] `npx vitest run src/utils/cabinetBreakpoints.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/cabinetBreakpoints.ts`, `src/utils/cabinetBreakpoints.test.ts`

  **Estimated scope:** XS (2 files, constants only)

- [x] **Task 2: `cabinetGeometry.ts` — oblique-projection wall math**

  **Description:** Add `src/utils/cabinetGeometry.ts` per spec §4: `computeCabinetGeometry(width, height, t)` returning `{ topFacePoints, leftFacePoints, frontFaceOffsetX, frontFaceOffsetY }` per spec §1.2's derivation — a pure function, no DOM, no GSAP. `t = 0` collapses both walls to the flat footprint edges with zero offset; `t = 1` produces the fully-popped `(2·height, height)` offset; intermediate `t` is a linear interpolation.

  **Acceptance criteria:**
  - [x] `computeCabinetGeometry(w, h, 0)` returns `frontFaceOffsetX/Y === 0` and both wall polygons' points match the flat footprint (spec §1.2's `t=0` case).
  - [x] `computeCabinetGeometry(w, h, 1)` returns `frontFaceOffsetX === 2·h`, `frontFaceOffsetY === h`, and both wall polygons' 3rd/4th points match that offset exactly.
  - [x] `computeCabinetGeometry(w, h, 0.5)` is the exact midpoint of the `t=0`/`t=1` outputs (asserted against the formula, not just "doesn't throw").
  - [x] Calling twice with identical arguments returns identical strings (pure function, no hidden state).

  **Verification:**
  - [x] `npx vitest run src/utils/cabinetGeometry.test.ts` passes, covering every acceptance criterion above (spec §5's 4 listed cases).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/cabinetGeometry.ts`, `src/utils/cabinetGeometry.test.ts`

  **Estimated scope:** S (2 files, pure math with real derivation to verify — not just a constant)

- [x] **Task 3: `cabinetAnimation.ts` — pop/flat timing**

  **Description:** Add `src/components/ui/controls/cabinetAnimation.ts`, mirroring `accordionAnimation.ts` exactly (spec §4): `CABINET_POP_DURATION = 0.25`, `getCabinetPopDuration(prefersReducedMotion: boolean): number` returning `0` when reduced motion is set, `CABINET_POP_DURATION` otherwise.

  **Acceptance criteria:**
  - [x] `getCabinetPopDuration(true)` returns `0`.
  - [x] `getCabinetPopDuration(false)` returns `CABINET_POP_DURATION`, which is `> 0`.
  - [x] File shape mirrors `accordionAnimation.ts` (same export names pattern, same JSDoc convention referencing the prefers-reduced-motion precedent).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/cabinetAnimation.test.ts` passes, mirroring `accordionAnimation.test.ts`'s own 2 cases.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/cabinetAnimation.ts`, `src/components/ui/controls/cabinetAnimation.test.ts`

  **Estimated scope:** XS (2 files, near-identical to an existing file)

### Checkpoint: Foundation modules
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite: 116 files, 1894 tests passing).
- [x] `grep -rn "cabinetBreakpoints\|cabinetGeometry\|cabinetAnimation" src/` shows all 3 new modules present with no consumer yet — no visual or behavioral change in the running app.
- [ ] Review with human before proceeding.

---

### Phase 2: The hook

- [x] **Task 4: `useCabinetBoxHeight` — live breakpoint-tier hook**

  **Description:** Add `src/components/ui/controls/useCabinetBoxHeight.ts` per spec §4: resolves the current numeric box height via `window.matchMedia` against Task 1's `CABINET_BREAKPOINT_MOBILE_MAX`/`CABINET_BREAKPOINT_TABLET_MAX`, re-resolving on each query's `change` event, defaulting to `desktop` when `matchMedia` is unavailable (e.g. non-browser test environments without a stub).

  **Acceptance criteria:**
  - [x] Returns `48` (desktop) when neither the mobile nor tablet media query matches.
  - [x] Returns `40` (tablet) when only the tablet query matches.
  - [x] Returns `32` (mobile) when the mobile query matches, regardless of the tablet query's own state (mobile checked first).
  - [x] Re-resolves when a stubbed query's `change` listener fires (not just on mount).
  - [x] Cleans up both `change` listeners on unmount.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/useCabinetBoxHeight.test.ts` passes, using a `stubMatchMedia`-style helper generalized to answer the mobile and tablet queries independently (mirroring `AccordionContainer.test.tsx`'s own `stubMatchMedia` convention).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (`cabinetBreakpoints.ts`).

  **Files:** `src/components/ui/controls/useCabinetBoxHeight.ts`, `src/components/ui/controls/useCabinetBoxHeight.test.ts`

  **Estimated scope:** S (2 files, one hook with real `matchMedia` mocking to get right)

### Checkpoint: Hook ships
- [x] `npm run build:types`, `npm run lint` clean; `useCabinetBoxHeight.test.ts` passes (full-suite `npm test` re-run deferred to the next checkpoint, unchanged since Phase 1's clean run).
- [x] `useCabinetBoxHeight` is importable and correctly resolves all 3 tiers in isolation (verified by its own test suite) with zero other files in the app referencing it yet.
- [ ] Review with human before proceeding.

---

### Phase 3: The shared component

- [x] **Task 5: `CabinetBox` — the shared cabinet-box rendering primitive**

  **Description:** Add `src/components/ui/controls/CabinetBox.tsx` per spec §4's full shape: `{ popped, timelineKey, children }` props; measures its own front face's width via `ResizeObserver` (mirroring `useAutoSliderOrientation.ts`'s pattern); on `popped`/`width`/`boxHeight` change, computes the `t=0`/`t=1` endpoints via Task 2's `computeCabinetGeometry` and `fromTo`-tweens the wall polygons' `points` attributes and the front face's `x`/`y` via GSAP, at Task 3's `getCabinetPopDuration`-resolved duration, registered in `timelineMap` under the caller-supplied `timelineKey`; kills the timeline on unmount. Add `src/components/ui/controls/CabinetBox.css` per spec §4: the `--cabinet-box-height` custom property + its 2 `@media` overrides (spec §1.3, manually mirroring Task 1's constants), `.sc-cabinet-box` (reserves the popped footprint via `padding-right`/`padding-bottom`, spec §1.6), `.sc-cabinet-box__walls` (`position: absolute; inset: 0; overflow: visible; pointer-events: none`), the `color-mix()` wall shading (spec §1.4), and `.sc-cabinet-box__front`'s surface styling. Add `CabinetBox.test.tsx` covering spec §5's 5 listed cases.

  **Acceptance criteria:**
  - [x] Renders `children` inside `.sc-cabinet-box__front`.
  - [x] Registers a GSAP timeline via `setTimeline` when `popped` changes, once a non-zero width has been reported by the (mocked) `ResizeObserver`.
  - [x] Calls `killTimeline` on unmount.
  - [x] Still calls `setTimeline` under `prefers-reduced-motion` (stubbed true) — the timeline registers at `duration: 0`, it is not skipped outright (spec §3's explicit boundary).
  - [x] Renders exactly one `.sc-cabinet-box__top-face` and one `.sc-cabinet-box__left-face` `<polygon>`, both inside an `aria-hidden`, `focusable="false"` `<svg>`.
  - [x] `.sc-cabinet-box__walls` carries `pointer-events: none` in the CSS — never a hit-testable element (confirmed by reading the shipped CSS directly, per `VERTICAL_SLIDERS.md`'s own precedent of not unit-testing CSS-only rules).
  - [x] No `foreignObject` anywhere in the file (spec §1.1).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx` passes (6/6), using `vi.mock('@/animation/timelineMap', ...)`, the `stubMatchMedia` helper, and a `MockResizeObserver` (mirroring `useAutoSliderOrientation.test.ts`'s own class) — all 3 conventions this codebase already established, not new ones. `observer.fire(...)` calls needed wrapping in `act()` (same as that file's own convention) to avoid an async-update timing gap — caught during RED→GREEN, not left as a flaky test.
  - [x] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [x] Manual check: none applicable yet — `CabinetBox` has zero real consumers until Task 6, same "component before consumer" precedent `DirectionalPanel`'s own Task 2 used.

  **Dependencies:** Task 2, Task 3, Task 4.

  **Files:** `src/components/ui/controls/CabinetBox.tsx`, `src/components/ui/controls/CabinetBox.css`, `src/components/ui/controls/CabinetBox.test.tsx`

  **Estimated scope:** M (3 files, but the highest-risk task in this plan — first real integration of SVG attribute-tweening, `ResizeObserver`, and 3 upstream modules at once; flagged explicitly, see Architecture Decisions)

### Checkpoint: Shared component ships
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (118 files, 1906 tests).
- [x] `CabinetBox` is importable and renders/animates correctly in isolation (verified by its own test suite) with zero other files in the app referencing it yet.
- [ ] Review with human before proceeding — this is the highest-value checkpoint to catch a geometry or layout mistake before it propagates into `Button`.

---

### Phase 4: The first real consumer

- [x] **Task 6: `Button` — wired through `CabinetBox`**

  **Description:** Replace `src/components/ui/controls/Button.tsx` per spec §4's full replacement: local `hovered`/`focused`/`pressed` state via `onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`/`onPointerDown`/`onPointerUp`/`onPointerCancel`/`onPointerLeave`; `popped = !disabled && (hovered || focused || pressed)` (spec §1.5); renders `<CabinetBox popped={popped} timelineKey={\`cabinet-button-${schema.id}\`}>` wrapping the existing `DualLabel`. Replace `Button.css` per spec §4: `.sc-button` becomes a transparent click target (`padding: 0; border: none; background: transparent`), preserving the existing `Console.css` cross-module comment about `.console--grid .sc-button` unchanged (class name is not renamed); `:focus-visible`'s outline stays declared here, on the real `<button>` (spec §1.7). Extend `Button.test.tsx` with the new hover/focus/press coverage — every existing test in the current file stays unchanged and passing.

  **Acceptance criteria:**
  - [x] Every existing `Button.test.tsx` assertion (accessible name resolution, `onClick` firing, `disabled` blocking `onClick`) still passes unmodified.
  - [x] `fireEvent.mouseEnter`/`mouseLeave` toggles the popped state.
  - [x] `fireEvent.focus`/`blur` toggles the popped state independently of hover.
  - [x] `fireEvent.pointerDown`/`pointerUp` toggles the popped state independently of hover/focus (spec §1.5 — the touch-support case).
  - [x] A disabled button does not pop on `mouseEnter`/`focus`/`pointerDown` — the `!disabled` guard is directly tested, not inferred from platform behavior.
  - [x] `ButtonSchema`/`ControlSchema` are untouched — `git diff src/types/controls.ts` is empty for this task.
  - [x] `.sc-button`'s class name is unchanged (the `Console.css` cross-module dependency comment still holds).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Button.test.tsx` passes (13/13), covering every acceptance criterion above (spec §5's 4 new cases plus the existing 7 — plus 2 extra: an initial-flat-state check and the pointerCancel/pointerLeave symmetry case). Implementation choice made: `CabinetBox` is mocked in `Button.test.tsx` (`vi.mock('./CabinetBox', ...)`, rendering `data-popped={popped}`) rather than asserted via `setTimeline` calls — keeps this file testing Button's own event-to-state logic in isolation from CabinetBox's already-proven internals (Task 5), per spec §7 item 3's "either acceptable" framing.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) re-confirmed clean after this task: 118 files, 1912 tests — including every other real `Button` consumer's own test file (`ConsolePanel`, `HubNav`, `SectorSettingsDrawer`, `CompanyCrudControls`, `PingControlsDrawer`), unmocked, rendering the real `CabinetBox` — safe because of `vitest.setup.ts`'s existing global `gsap` mock and no-op `ResizeObserver` polyfill (confirmed by reading that file, not assumed).
  - [ ] **Manual check not performed — no browser automation tool (chrome-devtools MCP) is configured in this environment.** Confirmed via `ToolSearch`, not skipped silently. Still needed before this ships for real: open a drawer with a real `Button` (e.g. Robot Options' "Reset Melody"), confirm it renders flat at rest and pops fully on hover/focus/press at each of the 3 breakpoints; confirm `Tab` focus shows the outline ring clearly on top of the popped box; confirm `CompanyCrudControls.tsx`'s Create/Delete Company buttons and `PingControlsDrawer.tsx`'s Reset Melody button never pop while disabled; confirm the pop snaps instantly under "reduce motion".

  **Dependencies:** Task 5.

  **Files:** `src/components/ui/controls/Button.tsx`, `src/components/ui/controls/Button.css`, `src/components/ui/controls/Button.test.tsx`

  **Estimated scope:** S (3 files, mechanical wiring against an already-proven `CabinetBox` from Task 5)

### Checkpoint: Button ships — first visible change
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (118 files, 1912 tests — one unrelated flaky failure on the first run, `audioSwells.test.ts`, confirmed pre-existing and unrelated by re-running it in isolation (65/65 clean) and re-running the full suite (clean on the second pass) before treating it as a non-issue).
- [x] Every real `Button` call site in the app (`HubNav`, `ConsolePanel`, `SectorSettingsDrawer`, `CompanyCrudControls`, `PingControlsDrawer`) renders through `CabinetBox` with no call-site changes required — confirmed by `npm run build:types` alone surfacing nothing, since the props contract didn't change.
- [ ] **Manual pass not completed — no browser automation available in this environment (see Task 6's own verification notes).** Outstanding before merge.
- [ ] Review with human before proceeding.

---

### Phase 5: Docs (parallelizable once their own prerequisite lands)

- [x] **Task 7: `docs/CONSOLE_THEMING.md` — cabinet geometry/shading notes**

  **Description:** Add the cabinet geometry/projection-vector notes (spec §1.2) and the `color-mix()` face-shading approach (spec §1.4) to `docs/CONSOLE_THEMING.md`, per roadmap 11.1.1's own Docs bullet — spot-checked against `CabinetBox.tsx`/`.css`'s actual shipped shape (Task 5), not the spec's draft numbers, in case anything shifted during implementation.

  **Acceptance criteria:**
  - [x] `docs/CONSOLE_THEMING.md` documents the 2:1 oblique projection vector and the wall-polygon derivation, matching `cabinetGeometry.ts`'s actual shipped formula.
  - [x] Documents the `color-mix()` face-shading technique and its relationship to `docs/specs/CONSOLE_THEMING.md § 1.3`'s own precedent.
  - [x] No claim in the new section is contradicted by the actual shipped source (spot-checked line-by-line against `cabinetGeometry.ts`/`CabinetBox.css`/`cabinetBreakpoints.ts`).

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped `CabinetBox.tsx`/`.css`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 5.

  **Files:** `docs/CONSOLE_THEMING.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 8: `docs/COMPONENT_LIBRARY.md` — Button's internal rendering note**

  **Description:** Add a short note under `Button`'s row (or a new subsection, mirroring "Slider orientation") — its internal rendering changed (cabinet SVG/GSAP instead of flat markup) while its `ControlSchema`/props contract stayed byte-for-byte identical, per spec §6.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `Button` now renders through `CabinetBox` internally, with its props contract unchanged.
  - [x] The note is spot-checked against `Button.tsx`'s actual shipped code (Task 6), not the spec's draft — the documented props shape (`{ schema: ButtonSchema; onClick: () => void; disabled?: boolean }`) matches `Button.tsx`'s `ButtonProps` interface exactly.

  **Verification:**
  - [x] Manual review — spot-checked directly against the shipped `Button.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 6.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (118 files, 1912 tests).
- [x] All acceptance criteria across all 8 tasks are met, except Task 6's manual browser check (no `chrome-devtools` MCP configured in this environment — see Task 6's verification notes and the Phase 4 checkpoint above).
- [x] `docs/CONSOLE_THEMING.md` and `docs/COMPONENT_LIBRARY.md` both reflect the shipped feature.
- [x] **Manual visual check completed — by Crawford, directly against the running app**, not via automated browser tooling (none was configured in the implementing session). This is *more* verification than the original checklist item anticipated, not less: it ran across several rounds of real iteration (see "Post-ship refinements" below), not a single pass. Ready for PR as far as this checklist is concerned.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| ~~`--cabinet-box-height`'s breakpoint numbers are duplicated between `cabinetBreakpoints.ts` (Task 1) and `CabinetBox.css` (Task 5), by necessity — CSS cannot import JS constants (spec §1.3/§7)~~ | **Resolved** — a code review flagged this as a real recurring signal (`CABINET_POP_DISTANCE` had gone stale in prose three times), not a one-off; collapsed to one source rather than guarded more carefully. See Post-ship refinements below | `CabinetBox.tsx` now applies both `--cabinet-box-height` and `--cabinet-pop-distance` as inline custom properties computed directly from the JS constants; `CabinetBox.css` no longer redeclares either |
| `CabinetBox` (Task 5) is the first real use of GSAP SVG-attribute tweening + `ResizeObserver` composed together in this codebase — higher chance of a subtle timing/measurement bug than a typical S-sized task | Medium — could stall Task 5 past a single focused session | Sized M, not S, specifically to flag this (Architecture Decisions); its own Checkpoint is called out as "the highest-value checkpoint to catch a mistake before it propagates into Button" |
| ~~The exact `color-mix()` lighten/darken percentages (20% white / 25% black) are a first-pass aesthetic guess, not confirmed against a real rendered screenshot (spec §7 item 2)~~ | **Resolved** — confirmed as-is during the post-ship visual review below; not changed | The review that added the glow and removed `border-radius` left the wall fill `color-mix()` percentages untouched, i.e. implicitly approved |
| `Button.test.tsx`'s new hover/focus/press coverage (Task 6) could assert against `CabinetBox`'s mocked `setTimeline` calls or a lower-level exposed `popped` value — left as an implementation choice, not pinned down in the spec (spec §7 item 3) | Low — either satisfies the same acceptance criterion | Task 6's acceptance criteria describe the *behavior* to test (popped toggles per event), not the exact assertion mechanism — implementer's choice, doesn't block review |

## Open Questions

Resolved during Plan (not left open):

- ~~Can Tasks 1–3 run in parallel?~~ **Resolved: yes — confirmed zero imports between `cabinetBreakpoints.ts`, `cabinetGeometry.ts`, and `cabinetAnimation.ts`.** See Architecture Decisions.
- ~~Should `useCabinetBoxHeight` be folded into `CabinetBox.tsx` directly instead of its own task/file?~~ **Resolved: no — kept as its own file/task, matching `useAutoSliderOrientation.ts`'s own precedent of being extracted rather than inlined**, and so `CabinetBox.test.tsx` can mock it cleanly instead of re-stubbing `matchMedia` inline.
- ~~Do the two docs tasks need to wait for both Task 5 and Task 6?~~ **Resolved: no — `docs/CONSOLE_THEMING.md` (Task 7) only needs Task 5; `docs/COMPONENT_LIBRARY.md` (Task 8) needs Task 6.** More precise than gating both on "everything," and lets them run in parallel with each other (and Task 7 in parallel with Task 6).

Carried forward from spec §7, not blocking this plan:

1. ~~The breakpoint-number duplication between `cabinetBreakpoints.ts` and `CabinetBox.css`~~ (spec §7 item 1) — **resolved**, see the Risks table above and Post-ship refinements below.
2. ~~`color-mix()` percentage tuning~~ (spec §7 item 2) — **resolved**, see the Risks table above.
3. **Real disabled `Button` consumers already exist** (`CompanyCrudControls.tsx`, `PingControlsDrawer.tsx`, confirmed by grep during the spec pass, spec §7 item 4) — Task 6's manual check exercises these directly rather than needing a devtools override.

## Post-ship refinements (beyond the original 8 tasks)

Real, shipped changes made after all 8 tasks above were already complete and merged into this plan's own history — driven entirely by Crawford iterating against the real running app, not by any gap in the original spec/plan. Recorded here so this history isn't lost, and so anyone picking up 11.1.2 (`Toggle`) onward knows `CabinetBox` as it stands *now* — not as originally shipped by Task 5 — is the reference to match. Full rationale for all of these: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.2` and `§ 1.8`.

- **`CABINET_POP_DISTANCE` retuned by feel, more than once** (16 → 4 → 2) — each change verified against the real rendered box, not a theoretical target. Tests were written to derive their expected values from the constant itself (`cabinetGeometry.test.ts`), specifically so they wouldn't need editing on the next retune.
- **Hit-area padding bug fixed**: `.sc-button` had no explicit `width`, so a flex/grid parent's default stretch (`HubNav.css`'s grid specifically) sized the real `<button>` to fill its whole cell while `CabinetBox`'s visible content stayed shrink-wrapped inside it — an invisible clickable/hoverable dead zone well past the visible box. Fixed with `width: fit-content` on `.sc-button`. `HubNav.css` gained `justify-items`/`align-items: center` as a direct follow-up, since its tile buttons had been relying on that same stretch to fill their grid cells.
- **Front face's border-box, not content-box, is what the wall geometry measures**: the front face has its own horizontal padding, and `ResizeObserver`'s `contentRect` always reports content-box regardless of the `box` option — so the walls were rendering narrower than the front face's real width, leaving padding sticking out past the Top Face's edge. Fixed by observing with `{ box: 'border-box' }` and reading `borderBoxSize` (falling back to `contentRect.width` when unavailable).
- **Pop-proportional glow added**: the walls glow via `filter: drop-shadow()`, scaled by a `--cabinet-glow` custom property tweened by the same GSAP timeline that drives the pop offset, set on a shared wrapper (not the front face) since the walls are a sibling, not a descendant. A `blur()`/`contrast()` "goo" corner-rounding attempt was tried first and explicitly rejected (read as too soft/melty at this scale) before the glow idea replaced it.
- **`.sc-cabinet-box__front`'s `border-radius: 4px` removed** — sharp corners read as a cleaner match for the walls' own straight-edged geometry.

All of the above shipped with real test coverage (TDD RED→GREEN, one commit per change) and full-suite/build verification, same discipline as the original 8 tasks — not exempted from it just because they came after the checkpoint above was first reached.

### Found by a `code-review-and-quality` pass, not the manual visual check

Two more real fixes, from a five-axis review run against this task file's own scope after the refinements above had already shipped. Both are recorded here for the same reason as the rest of this section — full rationale: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.3` and `§ 1.9`.

- **Resize-while-popped flicker fixed.** The geometry effect re-runs whenever `popped`, `width`, or `boxHeight` change, but had computed `from`/`to` purely from the current `popped` value — assuming every run was a transition starting from the opposite state. A `width`/`boxHeight`-only re-run (e.g. resizing the browser across a breakpoint while a `Button` is still focused) incorrectly replayed the whole flat↔full tween, visibly flattening and re-popping an already-popped box. **This is exactly the class of bug a manual pop-in/pop-out check can't surface** — it only manifests on a *dependency* change during an *unrelated* interaction, not on the interaction the manual check exercises directly. Fixed by tracking the `popped` value the effect last actually ran for in a ref; a dependency-only re-run now repositions instantly via `gsap.set()` instead of replaying the animation. Confirmed via TDD: a test reproduced the bug (RED, 4 spurious `fromTo` calls) against the pre-fix code before the fix was applied.
- **The breakpoint/pop-distance CSS duplication was collapsed, not just left documented.** Raised as a review finding (Consider-severity, not blocking) rather than left as a permanently-accepted risk: `CABINET_POP_DISTANCE` alone had already gone stale in prose three separate times across this plan's own history as it was retuned by feel — a real recurring signal. Discussed with Crawford directly (three options presented: collapse to one source, add a drift-detection test, or leave as documented duplication) rather than implemented unilaterally; "collapse to one source" was the chosen direction. `CabinetBox.tsx` now applies `--cabinet-box-height`/`--cabinet-pop-distance` as inline custom properties computed from the JS constants; `CabinetBox.css`'s `@media` blocks are gone.

Same TDD discipline as everything else in this file — both fixes have real, non-tautological test coverage (the flicker fix's RED state was confirmed against the pre-fix implementation, not assumed) and were verified against the full suite/build before committing.

### Found via a live `/interview-me` pass, 2026-09-09

Two more real, confirmed changes — this time driven directly by Crawford iterating against the running app during 11.1.3 (`VoxelTrack`) work, rather than either the original visual pass or a code-review finding. Recorded here for the same reason as the rest of this section. Full rationale: `docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md § 1.6`'s and `§ 1.4`'s post-implementation corrections.

- **The hit-area padding reservation (§1.6, `padding-right`/`padding-bottom` on `.sc-cabinet-box`) was removed entirely**, for every consumer — not narrowed, not replaced with an equivalent mechanism. `Button`/`Toggle`'s hit area now ends at `CabinetBox`'s flat, resting-state footprint; it no longer extends to cover the popped-out area the way it did from Task 5 onward. Confirmed intentional directly with Crawford, not inferred.
- **A new always-opaque `.sc-cabinet-box__backing` layer replaces it**: sized to exactly the wrapper's own (now-unreserved) box, sitting behind the walls and front face, accent-tinted at 40% opacity. As `--cabinet-glow` tweens `0 → 1`, the walls (only the walls — the front face stays fully opaque so real content/labels stay legible) fade toward 50% opacity on the same tween, letting the backing show through the popped facade instead of the wrapper reserving layout room to contain it.
- **`Button`'s front face is now accent-tinted, not surface-tinted** — `.sc-button .sc-cabinet-box__front { background-color: var(--color-accent); }`, scoped to `Button` specifically since its front face carries real text (`DualLabel`) and reads as the "live" surface. `CabinetBox.css`'s own `--color-surface` stays the default for every textless consumer (`Toggle`'s bare box, every `VoxelTrack` box) — "any front facade with text on it," not a base `CabinetBox` change. Not yet verified for contrast against `--color-text-primary`; flagged for 11.2's own accessibility pass.

`docs/CONSOLE_THEMING.md`'s Oblique Cabinetry section and `docs/todo/roadmap.md`'s 11.1.1/11.1.2 Create bullets — both of which had stated the old padding-reservation and surface-only front-face behavior as current — are corrected in the same pass as this note.

### Residual straddle-boundary flicker, 2026-09-09 — the top wall specifically, not the whole box

Reported directly by Crawford, after the `skipMountAnimation` fix (`docs/specs/OBLIQUE_CABINETRY_SLIDER_LINEAR.md`'s 2026-09-09 addendum to §1.8) had already shipped: sliding a `VoxelTrack` value across a box boundary still flickered — specifically the **top wall** of whichever box sits one index below/left of the box that just became (or just stopped being) the straddling one, on every crossing, in both directions. Narrower than the original bug (that one flashed the *whole* box, walls scale and all) and easy to mistake for the same defect not being fully fixed — it's a different mechanism.

`skipMountAnimation` fixed the wall **scale/position** on a fresh mount (the geometry effect now `gsap.set()`s directly to the target instead of tweening from the opposite state) — but the top-face div's own **width** was never part of that effect at all. It comes from a separate `useState(0)` initialized to a hardcoded `0`, corrected only once the front face's `ResizeObserver` fires its first callback (asynchronous — after the fresh mount's first paint). Every straddle-boundary crossing remounts a `CabinetBox` (React can't reuse a fiber across the plain-`CabinetBox`-vs-straddle-wrapper element-type change at the same key — the same reconciliation fact `skipMountAnimation`'s own root cause rests on), which resets this state to `0` again — so the top wall rendered fully scaled/positioned (thanks to `skipMountAnimation`) but at **zero width**, for the one-or-so frames until the observer's first callback corrected it. A collapsed-to-nothing top wall reads as a flicker, not a fully-missing box, which is why it was easy to miss in the original fix's own manual check.

Fixed by initializing that state from a real, already-known value instead of `0`: `frontWidth` (exact — every `VoxelTrack` straddle-piece box already receives its true width as a prop, never needing to wait on measurement in the first place) when given, `boxHeight` otherwise (exact for any square front — every ordinary `VoxelTrack` box and `Toggle`'s own bare box; a reasonable non-zero guess for `Button`, corrected moments later by the observer same as before, never a regression there). Required reordering `useCabinetBoxHeight()`'s call above the `useState` line so `boxHeight` is available to the initializer — a plain-`const` reordering, not a hook-call reordering, so Rules of Hooks is unaffected.

Shipped with real TDD coverage: two new `CabinetBox.test.tsx` cases assert the top-face div's width on the very first paint, before any `ResizeObserver.fire()` — one for the `boxHeight` fallback, one for an explicit `frontWidth` override — both RED-confirmed by stashing the fix back out and re-running against the pre-fix component (both failed with `'0px'`, not the expected value) before reapplying. Full suite (122 files / 2087 tests), lint, and type-check verified green.
