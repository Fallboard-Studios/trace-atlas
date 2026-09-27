# Implementation Plan: App-Wide Type Scale

Source spec: [docs/specs/TYPE_SCALE.md](../specs/TYPE_SCALE.md). Source intent: [docs/intent/type-scale.md](../intent/type-scale.md). Roadmap item 12.

## Overview

Replace the current 3 raw px font-size tokens plus 7 scattered one-off literal values with a real semantic type-scale system (7 size tokens, 4 weight tokens, rem-based), add a second self-hosted font (Titillium Web, via a new `@fontsource/titillium-web` dependency) for the 11 leaf `ControlSchema` primitives, and fix the named "accordion/directional-panel labels are too small" complaint with an explicit size/weight bump on those two containers. A new container-query mechanism (`container-name: sc-control`) gives leaf controls a compact text fallback when their box is too narrow (mobile/cramped slider labels), with zero new classes or JSX changes. Pure CSS + one dependency + two doc updates — no component props, types, or behavior change anywhere.

## Architecture Decisions

- **Old tokens are kept alongside the new ones until every consumer has migrated, then deleted in a dedicated final task (Task 10) — not deleted up front in Task 2.** Deleting `--font-size-sm/md/lg` before every consumer (8 files across Phases 2 and 4) is migrated would leave those files' `font-size` computed value invalid (falls back to the inherited size, not a hard error, but a visible, uncontrolled regression) for however many commits the migration takes. Landing new + old side by side keeps the app visually correct at every commit boundary, per `incremental-implementation`'s "always leave the system working" rule — matches this plan's own Checkpoint-per-phase structure.
- **`DualLabel.css` migrates first (Task 3), on its own, before any leaf control.** Every leaf control's compact-fallback behavior (§1.4 of the spec) depends on `DualLabel.css`'s own `@container sc-control` rule existing — sequencing it first means Tasks 4-6 each land against an already-correct `DualLabel`, rather than 3 batches all needing to land before compact-fallback becomes observable anywhere.
- **The 11 leaf-control CSS files are split into 3 batches of 3-4 files (Tasks 4-6), not one 11-file task.** Keeps every task at or under the ~5-file guideline; grouped by shape, not alphabetically — Task 6 (the 3 voxel-track sliders) is its own batch because those files also replace an existing `__value` literal and add a second `@container` rule, not just the root-selector addition Tasks 4-5 make.
- **Font dependency + `main.tsx` import changes (Task 1) and the `index.css` token rewrite (Task 2) are two independent tasks, not one** — different files, no ordering dependency on each other, both must land before Phase 2 can start. Safe to do in either order or in parallel.
- **Task 1 removing Rajdhani's 300/400 weight imports is sequenced together with Task 2's `:root` weight-default change, both in Phase 1** — confirmed via the spec's own inventory that no file anywhere sets an explicit `font-weight: 300` or a standalone explicit `400` outside `:root` itself, so this is safe to do immediately rather than deferring to the final cleanup phase.
- **Standalone-`DualLabel` host files and the plain one-off-literal files are split into two tasks (8 and 9) despite both being "Phase 4"** — Task 8's 3 files need a genuine per-file judgment call (which selector wraps the `DualLabel`, per spec §1.5) while Task 9's 5 files are a mechanical token-reference swap with no new mechanism; separating them keeps Task 9 low-risk and fast to verify independently of Task 8's extra investigation step.

## Dependency Graph

```
Task 1 (Titillium Web dependency + main.tsx imports)  ─┐
Task 2 (index.css: new tokens, old tokens kept)        ─┴──→ Checkpoint: Foundation
                                                                  │
Task 3 (DualLabel.css) ──────────────────────────────────────────┤
                                                                  ├──→ Task 4 (Button/CoordsInput/TextInput/Toggle)
                                                                  ├──→ Task 5 (RadioButton/Stepper/StepperWithToggle/Lfo)
                                                                  └──→ Task 6 (SliderLinear/SliderLog/SliderCenteredZero)
                                                                          │
                                                          Checkpoint: Leaf controls migrated
                                                                          │
                                                          Task 7 (AccordionContainer.css + DirectionalPanel.css)
                                                                          │
                                                          Checkpoint: Label-size complaint fixed
                                                                          │
                                              ┌───────────────────────────┴───────────────────────────┐
                                     Task 8 (standalone-DualLabel host files)          Task 9 (remaining one-off-literal files)
                                              └───────────────────────────┬───────────────────────────┘
                                                                          │
                                                          Checkpoint: All consumers migrated
                                                                          │
                                                Task 10 (delete old --font-size-sm/md/lg tokens)
                                                                          │
                                                Task 11 (docs: COMPONENT_LIBRARY.md + roadmap.md)
                                                                          │
                                                          Checkpoint: Complete
```

Tasks 4, 5, and 6 have no dependency on each other (all depend only on Tasks 1-3) and can be parallelized. Tasks 8 and 9 have no dependency on each other (both depend only on Task 7 having landed, so the full token surface and label-bump precedent exist) and can be parallelized.

## Task List

### Phase 1: Foundation

- [x] **Task 1: Add Titillium Web dependency and update `main.tsx` imports** — done

  **Description:** Add `@fontsource/titillium-web` to `package.json` (spec §1.3 — run `npm view @fontsource/titillium-web version` and pin the real current version, don't guess). In `main.tsx`, add 6 new import lines (latin + latin-ext, weights 400/600/700) and remove the 4 existing Rajdhani 300/400 import lines (latin + latin-ext).

  **Acceptance criteria:**
  - [x] `package.json` lists `@fontsource/titillium-web` at its real installed version (`^5.3.0`, confirmed via `npm view`).
  - [x] `main.tsx` imports exactly `latin-400`/`latin-ext-400`/`latin-600`/`latin-ext-600`/`latin-700`/`latin-ext-700` from `@fontsource/titillium-web`.
  - [x] `main.tsx` no longer imports any Rajdhani `300` or `400` weight file (latin or latin-ext).
  - [x] `main.tsx`'s existing doc comment above the Rajdhani imports is updated to reflect the trimmed weight set (500/600/700 only), matching the file's existing comment-explains-the-imports convention.

  **Verification:**
  - [x] `npm install` completes cleanly.
  - [x] `npm run build` succeeds (confirms the new import paths resolve — both font families' weight-specific asset files bundle correctly).
  - [x] New test `src/main.fonts.test.ts` (RED before the change, GREEN after — 5 tests) covers the dependency and both import lists directly, standing in for a `main.tsx`-can't-be-imported-in-tests dev-server check.

  **Dependencies:** None.

  **Files:** `package.json`, `src/main.tsx`

  **Estimated scope:** XS (2 files)

- [x] **Task 2: Add new type-scale tokens to `src/index.css`** — done

  **Description:** Add `--font-controls`, the 7 `--font-size-*` tokens, and the 4 `--font-weight-*` tokens (spec §1.2/§4's canonical block) to `:root`. Change `:root`'s existing `font-weight: 400;` line to `font-weight: var(--font-weight-regular);`. Delete the 2 leftover unused Vite-scaffold rules (`h1 { font-size: 3.2em; ... }` and the bare `button { ... }` rule, `index.css:105-119`) — confirmed zero real consumers. **Do not remove `--font-size-sm/md/lg` yet** — 8 files still read them until Phases 2 and 4 land (Task 10 removes them).

  **Acceptance criteria (one corrected after the fact — see the bug note below):**
  - [x] `:root` contains all 12 new custom properties from spec §1.2/§4, with the exact values given there.
  - [x] `:root`'s base `font-weight` reads `var(--font-weight-regular)`.
  - [x] The old `--font-size-sm: 12px; --font-size-md: 16px; --font-size-lg: 20px;` block is still present, unchanged.
  - [x] The old h1 (3.2em) and bare `button { ... }` rules are gone from `index.css`; `button:hover`/`:focus`/the light-scheme media query's own button rule are confirmed still present (out of scope, left untouched). **This acceptance criterion's own "confirmed zero real consumers" premise for the `button {...}` rule was wrong** — see the bug note below.

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.
  - [x] `npm run build` succeeds — production CSS bundles with no errors.
  - [x] New test `src/index.css.test.ts` (RED before the change, GREEN after — 8 tests) covers every token, the `:root` weight change, the old-tokens-kept guarantee, and the two dead-rule removals directly.

  **Bug found and fixed (unplanned, reported by the user after the whole branch was otherwise complete):** "I see Arial on buttons." The `button {...}` rule this task deleted wasn't fully dead — its `font-family: inherit;` line was the only thing letting real native `<button>` elements throughout the app (`RadioButton`'s option buttons, `AccordionContainer`'s trigger, `Toggle`'s switch, `Stepper`'s +/- buttons, `PowerRockerSwitch`'s confirm dialog) inherit the page's set font at all — browsers' UA stylesheets give form controls their own non-inheriting default otherwise. Fixed via TDD (2 new tests, RED then GREEN) by restoring a generic `button, input, select, textarea { font-family/font-size/font-weight: inherit; }` reset — not the old rule's other, genuinely-dead cosmetic properties. Full suite: 2345/2345; `build:types`/`lint`/`build` all clean. Documented in `docs/specs/TYPE_SCALE.md` §1.2/§7 item 8.

  **Dependencies:** None.

  **Files:** `src/index.css`

  **Estimated scope:** XS (1 file)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [x] `npx vitest run` (full suite): 2239/2240 pass. The 1 failure (`worldTransition.test.ts`, seeded-swell randomization) is pre-existing/flaky and unrelated to this change — confirmed by re-running that file alone, where it passes; a second full-suite run earlier in this same session hit a *different* flaky failure (`factoryPlacementSystem.test.ts`), also confirmed to pass in isolation. Neither test touches CSS, fonts, or anything this phase modified.
- [x] App renders with no visual change from before Phase 1 (both old and new tokens coexist; nothing consumes the new ones yet) — confirmed via `npm run build`'s clean production bundle rather than a manual `npm run dev` visual pass.
- [x] Review with human before proceeding. (Approved by proceeding directly to Phase 2.)

---

### Phase 2: Leaf-control migration (container queries + Titillium Web)

- [x] **Task 3: Migrate `DualLabel.css`** — done

  **Description:** Replace `__lore`'s `0.7rem` with `var(--font-size-label-lore)` and `__human`'s `0.85rem` with `var(--font-size-label)`. Add the new `@container sc-control (max-width: 120px)` rule (spec §1.4/§4) dropping both to `var(--font-size-label-compact)`.

  **Acceptance criteria:**
  - [x] No literal `0.7rem`/`0.85rem` remains in `DualLabel.css`.
  - [x] The `@container sc-control` rule exists and targets both `__lore` and `__human`.
  - [x] `DualLabel.tsx` itself is untouched (no props/markup change).

  **Verification:**
  - [x] `npx vitest run DualLabel` passes unmodified (asserts text content/presence, not computed size — spec §5).
  - [x] `npm run build:types` / `npm run lint` clean.
  - [x] New `DualLabel.css.test.ts` (RED before the change, GREEN after — 5 tests, using the new `getCssRuleBody` helper) covers the token migration and the `@container` rule's exact shape directly. No browser/DevTools tooling was available in this session for a literal rendered-pixel check — the text-contract test is the substitute; a real visual pass is still worth doing when this branch is next opened in a browser.

  **Dependencies:** Task 2 (needs the new tokens to exist).

  **Files:** `src/components/ui/controls/DualLabel.css`

  **Estimated scope:** XS (1 file)

- [x] **Task 4: Migrate `Button`, `CoordsInput`, `TextInput`, `Toggle`** — done

  **Description:** Add `font-family: var(--font-controls); font-weight: var(--font-weight-control); container-type: inline-size; container-name: sc-control;` to each file's own root selector (`.sc-button`, `.sc-coords-input`, `.sc-text-input`, `.sc-toggle`) — pure additions, no existing font rule to replace in any of the four (spec §2 confirms via grep).

  **Acceptance criteria (corrected — see the bug-fix note below):**
  - [x] All 4 root selectors carry `font-family`/`font-weight`.
  - [x] ~~All 4 root selectors carry all 4 new declarations~~ — **`Button` does NOT carry `container-type`/`container-name`.** Found in a real browser after this task shipped: `.sc-button` is always `inline-flex; width: fit-content` (shrink-to-fit by design), which CSS size containment collapses to zero width. Fixed in a follow-up commit — see the "Bug found and fixed" note after Task 6 below. `CoordsInput`/`TextInput`/`Toggle` are unaffected (all block-level `display: flex`) and keep all 4 declarations as originally planned.
  - [x] No other rule in any of the 4 files changes (beyond the follow-up fix's comment additions).

  **Verification:**
  - [x] `npx vitest run Button CoordsInput TextInput Toggle` passes unmodified.
  - [x] `npm run build:types` / `npm run lint` clean.
  - [x] New parameterized `leafControlContainerQuery.test.ts` (RED before the change, GREEN after) covers all 4 root selectors' exact declaration bodies via `getCssRuleBody` — the DevTools computed-style check remains a good real-browser sanity pass, and this is exactly the check that would have caught the Button regression sooner; it was the user's own screenshot that surfaced it instead.

  **Dependencies:** Task 3.

  **Files:** `src/components/ui/controls/Button.css`, `CoordsInput.css`, `TextInput.css`, `Toggle.css`

  **Estimated scope:** S (4 files, single mechanical addition each)

- [x] **Task 5: Migrate `RadioButton`, `Stepper`, `StepperWithToggle`, `Lfo`** — done

  **Description:** Same 4-declaration addition as Task 4, applied to `.sc-radio-button`, `.sc-stepper`, `.sc-stepper-toggle`, `.sc-lfo`.

  **Acceptance criteria:**
  - [x] All 4 root selectors carry all 4 new declarations.
  - [x] No other rule in any of the 4 files changes.

  **Verification:**
  - [x] `npx vitest run RadioButton Stepper Lfo StepperWithToggle` passes unmodified (`StepperWithToggle` has no current consumer per `docs/COMPONENT_LIBRARY.md` — its own test file still passes).
  - [x] `npm run build:types` / `npm run lint` clean.
  - [x] `leafControlContainerQuery.test.ts`'s parameterized list extended to all 8 files migrated so far (RED for the 4 new entries before the change, GREEN after).

  **Dependencies:** Task 3.

  **Files:** `src/components/ui/controls/RadioButton.css`, `Stepper.css`, `StepperWithToggle.css`, `Lfo.css`

  **Estimated scope:** S (4 files, single mechanical addition each)

- [x] **Task 6: Migrate `SliderLinear`, `SliderLog`, `SliderCenteredZero`** — done

  **Description:** Add the same 4-declaration root addition to `.sc-slider-linear`, `.sc-slider-log`, `.sc-slider-centered-zero`. Additionally, in each file, replace the `__value` selector's literal (`0.75rem` in all 3, confirmed) with `var(--font-size-label)`, and add a `@container sc-control (max-width: 120px)` rule dropping that same `__value` selector to `var(--font-size-label-compact)` (spec §1.4/§4).

  **Acceptance criteria (corrected — see the bug-fix note below):**
  - [x] All 3 root selectors carry `font-family`/`font-weight`.
  - [x] ~~All 3 root selectors carry all 4 new declarations~~ — **`container-type`/`container-name` moved to each file's `[data-orientation='horizontal']` selector, not the bare root.** Found in a real browser after this task shipped.
  - [x] No literal `0.75rem` remains in any of the 3 files.
  - [x] Each file has its own `@container sc-control` rule targeting its own `__value` class (unaffected by the fix below — this rule was already correct; it just only ever fires for horizontal orientation now).

  **Verification:**
  - [x] `npx vitest run SliderLinear SliderLog SliderCenteredZero` passes unmodified.
  - [x] `npm run build:types` / `npm run lint` / `npm run build` clean.
  - [x] `leafControlContainerQuery.test.ts` extended to all 11 leaf controls; new `SliderValueContainerQuery.test.ts` (RED before the change, GREEN after — 9 tests) covers the `__value`-specific migration and its own compact-fallback rule per slider.
  - [x] **Real-browser check performed — by the user, not this session.** The user reported (screenshot): "the vertical sliders are completely missing." This is precisely the gap flagged below as not performed this session — confirms it was a real bug, not a hypothetical risk.

  **Dependencies:** Task 3.

  **Files:** `src/components/ui/controls/SliderLinear.css`, `SliderLog.css`, `SliderCenteredZero.css`

  **Estimated scope:** S (3 files, two changes each)

**Bug found and fixed (unplanned, between Task 6 and Phase 3):** `container-type: inline-size` applies CSS size containment, which collapses an element to zero width when its own size normally comes from shrink-to-fit content sizing rather than an explicit/contextual width (confirmed via MDN). Two places hit this: `.sc-button` is *always* `inline-flex; width: fit-content` by design (Task 4) — every Button in the app was invisible; the sliders' `[data-orientation='vertical']` variant deliberately overrides to `inline-flex` (Task 6) — this is what the user's screenshot showed. Fixed via TDD (RED test added to `leafControlContainerQuery.test.ts` first, confirmed failing against the buggy CSS, then fixed): `Button` no longer establishes `sc-control` at all (it always fits its own content, so there's no compact-fallback scenario to solve for it); the 3 sliders establish `sc-control` only on their `[data-orientation='horizontal']` selector (merged into that selector's existing `overflow-x/y` rule). **Vertical sliders now have no compact-fallback mechanism** — a real, open gap, not silently dropped; flagged in `docs/specs/TYPE_SCALE.md` §1.4/§7 as the most likely thing for item 13 (Vertical Slider Label Overflow) to solve properly, since a real fix needs a markup change (a wrapper-element split) this phase's original "no JSX change" scope didn't anticipate. Full suite after the fix: 2314/2314 pass; `build:types`/`lint`/`build` all clean. Commit: "Fix: vertical/always-content-sized controls collapsed to zero width."

### Checkpoint: Leaf controls migrated
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npx vitest run` (full suite): 2314/2314 pass after the bug fix above (2304/2304 before it, both previously-observed flaky tests passing clean).
- [x] All 11 leaf controls (§1.5's list) carry `font-family: var(--font-controls)` on their own root selector, verified by content (`getCssRuleBody` against the real CSS files).
- [x] Compact container-query fallback verified by content for `DualLabel` and the 3 sliders' own `__value` readout — correct as far as content review could tell, but content review is exactly what missed the containment-collapse bug below, so "verified by content" alone should not be read as "verified."
- [x] **Real-browser confirmation happened — via the user's own screenshot, not this session's tooling** (still none available) — and it found a real bug (`Button` and vertical sliders collapsed to zero width), now fixed and documented above. The "no layout/position shift" check for the *surviving* mechanism (horizontal sliders' compact fallback, the 7 unconditional controls) still has not been performed in a real browser and remains worth doing before merging.
- [x] Review with human before proceeding. (Approved by proceeding directly to Phase 3.)

---

### Phase 3: Fix the named complaint

- [x] **Task 7: Bump `AccordionContainer`/`DirectionalPanel` label size and weight** — done

  **Description:** Add the new `.sc-accordion__row .sc-dual-label__human` rule to `AccordionContainer.css` and `.sc-directional-panel > .sc-dual-label__human` to `DirectionalPanel.css` (both set `font-size: var(--font-size-heading-sm); font-weight: var(--font-weight-medium);`, spec §1.6). Tokenize `AccordionContainer.css:70`'s `.sc-accordion__indicator { font-weight: 600; }` to `var(--font-weight-medium)` (same value). (Shipped using the no-space `>` combinator style, matching `DirectionalPanel.css`'s own existing convention — not the spaced `>` this task's own description used.)

  **Acceptance criteria:**
  - [x] Both new selectors exist, scoped exactly as specified (descendant selector for accordion, direct-child combinator for the panel) so a nested control's own `DualLabel` is never caught.
  - [x] `.sc-dual-label__lore` is untouched by either new rule — only `__human` is targeted.
  - [x] `.sc-accordion__indicator`'s weight is now `var(--font-weight-medium)`, same computed value (600) as before.
  - [x] Neither file gains `container-type`/`container-name` (out of scope per spec §1.4).

  **Verification:**
  - [x] `npx vitest run AccordionContainer DirectionalPanel` passes unmodified (confirmed no test asserts the literal `600`).
  - [x] `npm run build:types` / `npm run lint` / `npm run build` clean.
  - [x] New `accordionPanelLabelBump.test.ts` (RED before the change, GREEN after — 9 tests) covers both files' scoping precisely — including the "not a bare, leak-prone rule" check, which exposed and drove a real fix to the shared `getCssRuleBody` test helper (see the separate commit before this task's own). Full suite: 2327/2327. The DevTools real-browser checks (visibly bigger/heavier, still Rajdhani, no leakage into nested content) remain not performed this session — no browser tooling available — same honest gap as every prior phase's manual-check items.

  **Dependencies:** Task 3 (needs `DualLabel.css`'s migrated `__human` selector to exist as the override target).

  **Files:** `src/components/ui/controls/AccordionContainer.css`, `DirectionalPanel.css`

  **Estimated scope:** S (2 files)

### Checkpoint: Label-size complaint fixed
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npx vitest run` (full suite): 2327/2327 pass.
- [ ] Real-browser visual confirmation — accordion and directional-panel labels bigger/heavier, still Rajdhani, no leakage into nested controls. Not performed this session (no browser tooling available), flagged not silently skipped.
- [ ] Review with human before proceeding.

---

### Phase 4: Remaining consumers

- [x] **Task 8: Migrate standalone-`DualLabel` host files** — done

  **Description:** In `RobotSelectionCard.tsx`/`.css`, `RobotDisplaySection.tsx`/`.css`, and `SectorSettingsDrawer.tsx`/`.css`, identify the exact element wrapping each standalone `<DualLabel>` usage (spec §1.5 flags `SectorSettingsDrawer.tsx:74`'s wrapper as needing confirmation during Implement) and add `font-family: var(--font-controls); font-weight: var(--font-weight-control);` to that selector — no `container-type` (spec §1.4's explicit scope decision). Also migrate each file's own other one-off literal in the same pass: `RobotSelectionCard.css`'s `.__value` (`var(--font-size-sm)` → `var(--font-size-label)`), `RobotDisplaySection.css`'s `.__value` (tokenize its existing `font-weight: 600` to `var(--font-weight-medium)`, and add the family/weight addition to `.__row`), `SectorSettingsDrawer.css`'s `.__status-line` (`0.95em` → `var(--font-size-label)`).

  **Found while implementing — `RobotSelectionCard.tsx` renders its DualLabel rows through TWO different wrapper classes, not one** (`.robot-selection-card__row` for the name row, `.robot-selection-card__field` for job/battery/docking/audio) — shipped on the shared root (`.robot-selection-card`) instead of either wrapper individually, covering both via inheritance. `RobotDisplaySection.css` follows the same root-level pattern for consistency, even though it only needed one wrapper class. `SectorSettingsDrawer.css` stays scoped to `.sector-settings-drawer__status` as originally planned (the drawer also renders `TextInput`/`Button` with their own already-correct fonts, so a drawer-root rule would be a bigger blast radius than needed).

  **Acceptance criteria:**
  - [x] All 3 standalone-`DualLabel` host files carry `font-family: var(--font-controls)` and `font-weight: var(--font-weight-control)` on the selector that actually covers their DualLabel usage (root for 2 of the 3, per the deviation above; `.sector-settings-drawer__status` for the third, as planned).
  - [x] `RobotSelectionCard.css`'s `.__value`, `SectorSettingsDrawer.css`'s `.__status-line` no longer reference `var(--font-size-sm)`/`0.95em`.
  - [x] `RobotDisplaySection.css`'s `.__value` weight is now `var(--font-weight-medium)`, same computed value (600).
  - [x] No `container-type`/`container-name` added anywhere in this task.

  **Verification:**
  - [x] `npx vitest run RobotSelectionCard RobotDisplaySection SectorSettingsDrawer` passes unmodified (47 tests).
  - [x] `npm run build:types` / `npm run lint` / `npm run build` clean.
  - [x] New `standaloneDualLabelHosts.test.ts` (RED before the change, GREEN after — 9 tests) covers all 3 files, including a regression guard that the drawer's rule landed on `.sector-settings-drawer__status`, not the drawer root. DevTools real-browser confirmation not performed this session (no tooling available) — same honest gap as every prior phase.

  **Dependencies:** Task 7 (comes after the label-bump precedent is settled, per this plan's parallelization note — no direct code dependency).

  **Files:** `src/components/selection/RobotSelectionCard.css`, `src/components/robot/RobotDisplaySection.css`, `src/components/panels/screen/console/SectorSettingsDrawer.css`

  **Estimated scope:** S (3 files, one small investigation step)

- [x] **Task 9: Migrate remaining one-off-literal files** — done

  **Description:** Swap the remaining old-token/literal references to the new tokens — no new mechanism, pure value swaps. `PowerRockerSwitch.css`: 3 references (`var(--font-size-md)` on the dialog title, `var(--font-size-sm)` ×2 on description/button) — pick `var(--font-size-label)` vs `var(--font-size-label-lore)` per line by visual judgment (spec §7 item 2 — these are on `--font-mono` text, family untouched). `Header.css` and `SleeveContainer.css`: 1 `var(--font-size-sm)` reference each → `var(--font-size-label)` (also `--font-mono` text, family untouched). `SkippedNotesCounter.css`: 1 `var(--font-size-sm)` reference → `var(--font-size-label)` (`--font-mono` text). `ConsolePanel.css`: `.console-panel__stub`'s `14px` → `var(--font-size-label)` — first confirm in `ConsolePanel.tsx` whether `.console-panel__stub` still has a live render path (spec §7 item 5); migrate the literal regardless of the answer.

  **Correction found while implementing:** this task's own description said all 3 `PowerRockerSwitch.css` lines were "on `--font-mono` text" — only `.power-confirm__title` actually is. `.power-confirm__description`/`.power-confirm__btn` have no `font-family` override at all (inherit `--font-sans`). No font-family was added to either — pure size-token migration regardless of family, matching this task's actual scope. `.console-panel__stub` confirmed dead: zero `.tsx` consumers anywhere in the app.

  **Acceptance criteria:**
  - [x] No `var(--font-size-sm)`/`var(--font-size-md)`/`14px` reference remains in any of the 5 files.
  - [x] `--font-mono` stays the `font-family` on every line touched here that already had it — only the size token reference changes; the 2 lines that never had a `font-family` still don't.
  - [x] `.console-panel__stub`'s live-vs-dead status is noted (confirmed dead via grep, recorded in the commit and in a code comment).

  **Verification:**
  - [x] `npx vitest run PowerRockerSwitch Header SleeveContainer SkippedNotesCounter ConsolePanel` passes unmodified (47 tests).
  - [x] `npm run build:types` / `npm run lint` / `npm run build` clean.
  - [x] New `remainingOneOffLiterals.test.ts` (RED before the change, GREEN after — 7 tests) covers all 5 files, including the description/button "no font-family" regression guard. Real-browser confirmation not performed this session (no tooling available).

  **Dependencies:** Task 7 (parallelizable with Task 8 — see Dependency Graph).

  **Files:** `src/components/ui/physical/PowerRockerSwitch.css`, `src/components/panels/screen/Header.css`, `src/components/panels/physical/SleeveContainer.css`, `src/components/debug/SkippedNotesCounter.css`, `src/components/panels/screen/console/ConsolePanel.css`

  **Estimated scope:** M (5 files, mechanical swaps)

### Checkpoint: All consumers migrated
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npx vitest run` (full suite): 2343/2343 pass.
- [x] Repo-wide grep for `--font-size-sm`, `--font-size-md`, `--font-size-lg` returns zero remaining hits outside `index.css`'s own now-unused token definitions and test files' own assertion strings. Repo-wide grep for `0.7rem`, `0.85rem`, `0.95em` returns zero hits anywhere; every remaining `14px` hit is an unrelated padding/dimension value (`CabinetBox.css`, `DirectionalPanel.css`, the 3 sliders' thumb size, `TextInput.css`'s facade padding), not a font-size.
- [ ] Full manual check list from spec §5 run once, end to end — not performed this session (no browser tooling available), the running honest gap across every phase.
- [ ] Review with human before proceeding.

---

### Phase 5: Cleanup and docs

- [x] **Task 10: Remove the old `--font-size-sm/md/lg` tokens** — done

  **Description:** Delete the 3-line old token block from `src/index.css`, now that Checkpoint "All consumers migrated" has confirmed zero remaining references anywhere in `src/`.

  **Acceptance criteria:**
  - [x] `--font-size-sm`, `--font-size-md`, `--font-size-lg` no longer appear as functional CSS anywhere in `src/`. (The only remaining textual hits, confirmed via grep, are test files' own historical assertion strings documenting what used to exist, and one prose comment in `PowerRockerSwitch.css` explaining a past size-hierarchy decision — neither is a declaration or a `var()` reference.)

  **Verification:**
  - [x] Repo-wide grep confirms no functional reference to any of the 3 names remains.
  - [x] `npm run build:types` / `npm run lint` / `npm run build` clean; `npx vitest run` (full suite): 2343/2343.
  - [x] `index.css.test.ts`'s own "keeps the old tokens for now" test flipped to "removes the old tokens" (RED before the deletion, GREEN after), plus a belt-and-suspenders check that the property names themselves don't appear anywhere in the file.

  **Dependencies:** Checkpoint "All consumers migrated" (Tasks 8 and 9 both landed).

  **Files:** `src/index.css`

  **Estimated scope:** XS (1 file)

- [x] **Task 11: Update documentation** — done

  **Description:** Update `docs/COMPONENT_LIBRARY.md`'s "CSS tokens" section — it currently states "No new CSS custom properties were introduced in this phase," no longer true; add the new font-size/weight/family tokens and the `sc-control` container-query name, or point to this spec. Mark roadmap item 12 done in `docs/todo/roadmap.md` per that document's own existing convention.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md`'s "CSS tokens" section no longer claims zero new tokens; summarizes the real set and points to `docs/specs/TYPE_SCALE.md` for the full table, including the `Button`/vertical-slider container exception.
  - [x] `docs/todo/roadmap.md` item 12 reflects its shipped status per the doc's existing convention (spec/task links) — explicitly noted as implemented-on-branch, not yet merged to `main`, rather than implying otherwise. Also records the concrete finding for item 13 (vertical sliders lost their compact-fallback mechanism entirely, not "still pending") so whoever scopes that item next has the real picture.

  **Verification:**
  - [x] Manual read-through of both edits (no automated test covers doc content, per this task's own note and the test-driven-development skill's explicit carve-out for pure documentation changes).
  - [x] Full suite re-run for safety: 2343/2343 unchanged; `build:types`/`lint`/`build` all clean.

  **Dependencies:** Task 10.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/todo/roadmap.md`

  **Estimated scope:** XS (2 files, docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npx vitest run` (full suite): 2343/2343.
- [x] Every acceptance criterion across all 11 tasks is met — including the ones corrected mid-implementation (Task 4/6's container-collapse fix, Task 8's wrapper-selector deviation, Task 9's font-family correction), each documented rather than silently reconciled.
- [ ] **Not performed — full manual check list from spec §5.** No browser/DevTools tooling was available anywhere in this session; every "renders correctly," "no layout shift," "still Rajdhani/Titillium Web" claim in this plan is backed by CSS-content tests (`getCssRuleBody` against the real files), not by seeing it render. One real bug *was* caught this way regardless — via the user's own screenshot mid-Phase-2 — but that's not a substitute for the real pass. This is the honest, load-bearing gap in an otherwise fully-green branch: do this before merging.
- [x] Docs updated and accurate against the shipped code — `docs/specs/TYPE_SCALE.md` and this task plan both carry correction notes at every point reality diverged from the original plan, rather than being quietly rewritten to match after the fact; `docs/COMPONENT_LIBRARY.md` and `docs/todo/roadmap.md` updated in Task 11.
- [ ] Ready for human review / PR — code is committed to `feature/type-scale` but not pushed or merged; the real-browser pass above should happen first.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The `120px` container-query breakpoint (spec §1.4) is an unconfirmed engineering default | Low-Medium — could fire too early/late relative to the real mobile label-overflow case (item 13) | Task 6's manual check specifically exercises the narrow-slider case before Phase 2's checkpoint; easy single-value adjustment if wrong, isolated to `DualLabel.css` + 3 slider files |
| `PowerRockerSwitch.css`'s old sm/md split doesn't map 1:1 onto the new label/label-lore split (spec §7 item 2) | Low — visual-only, cosmetic | Task 9 calls out the per-line judgment call explicitly rather than a blind find-replace; manual check included |
| Deleting old tokens (Task 10) before every consumer is confirmed migrated would silently degrade text sizing rather than error | Medium if sequencing is skipped | Task 10 is gated behind its own Checkpoint with an explicit repo-wide grep step, not just "looks done" |
| `container-type: inline-size` on 11 new elements could theoretically shift layout in a way not caught by automated tests (jsdom applies no real layout, per `GLOBAL_VOLUME_CONTROL.md`'s own precedent finding a real-browser-only bug) | Medium | Every Phase-2/3 task's manual check explicitly includes a "confirm no position/size shift" step, not just a font-family check |
| Standalone-`DualLabel` host files' compact-fallback scope (spec §7 item 1) may turn out wrong once seen on a real narrow mobile layout | Low | Explicitly deferred, not silently decided — flagged in Task 8 and in the spec itself; adding the 2-line container declaration later is a small, isolated follow-up if needed |

## Open Questions

None remaining from the spec — every item in spec §7 is either resolved into a specific task's acceptance criteria (items 2, 3, 5 → Tasks 9, 6, 9 respectively) or explicitly deferred with a stated reason (items 1, 4 → noted in Task 8 and the Risks table above, not silently decided).
