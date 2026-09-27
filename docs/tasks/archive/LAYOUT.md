# Implementation Plan: Layout (Roadmap Phase 2)

Source spec: [docs/specs/LAYOUT.md](../specs/LAYOUT.md). Source intent: [docs/intent/phase-2-layout.md](../intent/phase-2-layout.md).

## Overview

Collapse the shell's two layout modes (mobile stack vs. desktop 2-column grid + landscape tablet frame) into one layout that only scales, never reorients. Cut away the power-switch sleeve's matte area down to a small corner + thin top strip so `ScreenViewport` can grow to fill the freed space, rebuild `TransportBar` as a sticky-always mute+metadata bar (restart/pause removed, no replacement), delete `RobotList` outright, and strip every remaining desktop-reorientation media query from `Tablet.css`/`SleeveContainer.css`/`ScreenViewport.css`/`PowerRockerSwitch.css`. `ConsoleNavigation` stops rendering but stays otherwise untouched for Phase 3.

## Architecture Decisions

Resolving the spec's open questions concretely, so nothing gets invented ad hoc mid-Implement:

- **Cutaway mechanism (resolves spec §7.1):** `SleeveContainer`'s power instance stops being a full-width flex bar and becomes two independently-`position: absolute` pieces layered over `ScreenViewport`, not a shrunk grid/flex track:
  - `.sleeve-container__power-corner` — sized to fit `PowerRockerSwitch`'s actual rendered footprint (`width: fit-content` or a measured fixed value — measure against the real rendered switch during Task 7, don't guess a number now), `position: absolute; top: 0; left: 0`, above `ScreenViewport` in stacking order.
  - `.sleeve-container__top-strip` — `position: absolute; top: 0; left: var(--power-corner-width); right: 0; height: 16px`, same stacking tier, purely decorative (`aria-hidden`).
  - `Tablet.css`'s `.tablet` gains `position: relative` (needed as the containing block now that the power `SleeveContainer` is taken out of flex flow — it wasn't previously positioned). With the power instance out of flow, `ScreenViewport` naturally becomes flush with the top of `.tablet`, no separate margin hack needed there.
  - `ScreenViewport` reserves the horizontal band under the switch via its own content, not via a hole punched in its box: the mute+metadata bar gets `padding-top: 16px` (clears the top strip) and a left offset equal to `var(--power-corner-width)` (clears the switch corner) for its own height only — everything below the switch's bottom edge (`WorldView`, `Console`) is full-width, untouched.
  - This keeps the guardrail intact by construction: nothing moves between components, the switch just visually overlaps `ScreenViewport`'s box the same way a `z-index`-raised sibling always could.

- **GSAP cross-file dependency (resolves spec §7.2):** Keep `.transport-bar__displays` and `.transport-bar__btn` as the outer class names on the rebuilt bar's metadata container and surviving mute button respectively. `PowerRockerSwitch.tsx`'s `handlePowerOn` timeline needs zero changes — it already selects by class, not by count, and a `stagger` across a single matched element degenerates to a plain fade with no error. Verified explicitly in Task 9's acceptance criteria rather than assumed.

- **Grid row sizing after dropping `robotlist` (resolves spec §7.4):** `.screen-content`'s mobile grid had one track per area (`auto auto 1fr 1fr` for transport/worldview/console/robotlist). Dropping the `robotlist` area leaves `grid-template-rows: auto 1fr 1fr` — the metadata bar keeps its natural (`auto`) height, `WorldView` and `Console` keep the same 1:1 share of remaining space they already had relative to each other. No new proportion is being invented, just the dead track removed.

- **Decorative rail/gradient flip (spec §7.3) is NOT resolved here.** Whether to also remove `ScreenViewport.css`'s `min-width: 48em` stripe-direction/bevel-orientation flip is still an open question — it wasn't part of what Crawford confirmed in the interview. It gets its own task (Task 11), sequenced last and explicitly gated on a go/no-go answer before it's implemented, so it can't block or get bundled into the rest of the phase.

## Dependency Graph

```
Task 1 (index.css dead tokens)                                   ── independent

Task 2 (Tablet.css: remove reorientation, add position:relative)
    │
    ├── Task 3 (SleeveContainer.css: remove column-flip block)
    ├── Task 4 (PowerRockerSwitch.css: remove transform:none override)
    │
    └── Task 7 (SleeveContainer cutaway structure) ── needs Task 2's position:relative

Task 5 (delete RobotList, drop its render)
    │
    └── Task 6 (ScreenViewport.css: remove 2-col grid, 3-area single-column grid)
            │
            └── Task 8 (ScreenViewport: corner-exclusion CSS for the cutaway) ── needs Task 7

Task 7 ──→ Task 8 ──→ Task 9 (TransportBar rebuild: controls, metadata, sticky-always, wrap)

Task 9 ──→ Task 10 (docs/UI_SHELL.md update)

Task 11 (decorative rail/gradient flip) ── gated on human decision, no code dependency on anything else
```

## Testing note (retroactive — read before trusting `*.css.test.ts` references below)

Tasks 1-9 below each reference `*.css.test.ts` files (`index.css.test.ts`, `Tablet.css.test.ts`,
`SleeveContainer.css.test.ts`, `ScreenViewport.css.test.ts`, `TransportBar.css.test.ts`,
`PowerRockerSwitch.css.test.ts`) as TDD verification — reading the stylesheet source as text
and regex-matching for declarations/selectors, since jsdom has no CSS cascade and can't render
layout. **All six were deleted after the fact and are not present in the repo.** Every real bug
found during the cutaway work (the flex-flow issue, the geometry mismatch, the solid-background
bug, the `width: 200px` containing-block issue) was found by Crawford looking at a screenshot,
never by one of these tests failing — jsdom's inability to render CSS meant they were
structurally incapable of catching the thing that actually mattered (visual correctness), and
the "duplication guard" tests that could theoretically catch something were written *after*
already finding and fixing those bugs by hand, documenting a decision rather than detecting a
regression. Meanwhile they cost three rounds of manual rewrites as the real design evolved —
real maintenance cost, zero demonstrated catches. Removed in one pass; component tests that
actually render (`SleeveContainer.test.tsx`, `ScreenViewport.test.tsx`, `TransportBar.test.tsx`)
were kept — they exercise real React rendering and store integration, a different category from
regexing a stylesheet's source text. Full suite after removal: 57 files, 691/691 passing;
`build:types`/`lint`/`build` all clean, build output byte-identical (test-only change).
The task entries below are left as an honest historical record of what was done and verified
*at the time* — the tests existed and passed when each entry was written — rather than rewritten
to pretend otherwise.

## Task List

### Phase 1: De-reorient the outer frame

- [x] **Task 1: Remove dead sleeve-width tokens from `index.css`** — done

  **Description:** Delete `--sleeve-width-tablet` and `--sleeve-width-desktop` — defined in `index.css` but never referenced anywhere in `src/` (confirmed by grep in the spec's grounding pass). `--sleeve-width` itself stays; it's the one actually used.

  **Acceptance criteria:**
  - [ ] `--sleeve-width-tablet`/`--sleeve-width-desktop` no longer appear in `index.css`.
  - [ ] `grep -r "sleeve-width-tablet\|sleeve-width-desktop" src/` returns zero matches.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.

  **Dependencies:** None.

  **Files:** `src/index.css`, `src/index.css.test.ts` (new)

  **Estimated scope:** XS (1 file, deletion only)

- [x] **Task 2: `Tablet.css` — remove row-flip/width-scaling, add `position: relative`** — done

  **Description:** Delete the `min-width: 48em/64em/80em/92em` blocks that flip `.tablet` to `flex-direction: row` and progressively widen it. `.tablet` stays `flex-direction: column` at every size, sized by its existing base (mobile) rules only. Add `position: relative` to `.tablet` — required as the containing block for Task 7's absolutely-positioned power corner/top strip (it isn't positioned today).

  **Acceptance criteria:**
  - [ ] No `@media` blocks remain in `Tablet.css`.
  - [ ] `.tablet` has `position: relative`.
  - [ ] At every viewport width, `.tablet` stays a column (`SleeveContainer` / `ScreenViewport` / `SleeveContainer` stacked top-to-bottom).

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [ ] Manual: resize the dev server window from narrow to ultra-wide — confirm the tablet frame never flips to a row layout, only scales.

  **Dependencies:** None.

  **Files:** `src/components/tablet/Tablet.css`, `src/components/tablet/Tablet.css.test.ts` (new)

  **Estimated scope:** XS (1 file)

- [x] **Task 3: `SleeveContainer.css` — remove column-flip block** — done

  **Description:** Delete the `min-width: 48em` block that flips `.sleeve-container` to `flex-direction: column` (vertical bar) and rotates `.sleeve-logo` -90°. The base (mobile) rules — horizontal bar, `height: var(--sleeve-width)`, unrotated logo — apply at every size now, matching Task 2's decision that the sleeve never reorients.

  **Acceptance criteria:**
  - [ ] No `@media` blocks remain in `SleeveContainer.css` outside what Task 7 adds for the cutaway.
  - [ ] `.sleeve-logo` never rotates at any viewport width.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [ ] Manual: confirm the non-power `SleeveContainer` (bottom bar) stays a plain horizontal strip with an upright "PELAGOS" logo at every width.

  **Dependencies:** Task 2 (sequenced together as the outer-frame phase; no hard code dependency).

  **Files:** `src/components/panels/physical/SleeveContainer.css`, `src/components/panels/physical/SleeveContainer.css.test.ts` (new)

  **Estimated scope:** XS (1 file)

- [x] **Task 4: `PowerRockerSwitch.css` — remove `transform: none` override** — done

  **Description:** Delete the `min-width: 48em { .rocker-panel { transform: none } }` block. The base (mobile) `translateX(100%) rotate(90deg)` transform applies at every size now, matching the sleeve staying a horizontal bar always.

  **Acceptance criteria:**
  - [ ] No `@media` blocks remain in `PowerRockerSwitch.css` other than the existing `prefers-reduced-motion` one (untouched).
  - [ ] `.rocker-panel`'s rotated transform applies at every viewport width.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [ ] Manual: confirm the power switch renders in the same rotated orientation at every width — no snap-to-unrotated at ≥48em.

  **Dependencies:** Task 2, Task 3 (sequenced together; verify visually alongside them).

  **Files:** `src/components/ui/physical/PowerRockerSwitch.css`, `src/components/ui/physical/PowerRockerSwitch.css.test.ts` (new)

  **Estimated scope:** XS (1 file)

### Checkpoint: Outer frame de-reorientation
- [x] `npm run build:types`, `npm run lint`, `npm test` (58 files, 688/688 passing), `npm run build` all clean.
- [x] Structural tests confirm zero `@media` blocks remain in `Tablet.css`/`SleeveContainer.css`, and exactly the pre-existing `prefers-reduced-motion` block remains in `PowerRockerSwitch.css` — no reorientation logic left in any of the three files.
- [ ] Manual resize check in a running browser (`npm run dev`) — not yet performed this session; recommended before merging.
- [ ] Review with human before proceeding.

---

### Phase 2: Content grid cleanup (independent of the cutaway)

- [x] **Task 5: Delete `RobotList`** — done

  **Description:** Delete `RobotList.tsx`/`RobotList.css` and drop `{isPoweredOn && <RobotList />}` from `ScreenViewport.tsx`. No replacement, no parking for reuse — per the confirmed intent, Phase 8's Robot Selection tile is different enough in shape.

  **Acceptance criteria:**
  - [ ] `RobotList.tsx`/`RobotList.css` no longer exist.
  - [ ] `ScreenViewport.tsx` no longer imports or renders `RobotList`.
  - [ ] No remaining reference to `RobotList` anywhere in `src/` (grep confirms zero matches).

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [ ] `npm test` — no test suite references the deleted files (none existed for `RobotList` itself; confirm nothing else imported it).

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/RobotList.tsx` (deleted), `src/components/panels/screen/RobotList.css` (deleted), `src/components/panels/physical/ScreenViewport.tsx`, `src/components/panels/physical/ScreenViewport.test.tsx` (new)

  **Estimated scope:** S (2 deletions + 1 edit)

- [x] **Task 6: `ScreenViewport.css` — remove two-column grid, drop `robotlist` area** — done

  **Description:** Delete the `min-width: 64em` block (the two-column `.screen-content` grid + its `.screen-occlusion` override). Update the base `.screen-content` to 3 grid areas (`transport worldview console`, one per row) with `grid-template-rows: auto 1fr 1fr` per this plan's Architecture Decision above — the `robotlist` area is gone, no reflow logic replaces it.

  **Acceptance criteria:**
  - [ ] No `@media` blocks remain in `ScreenViewport.css` related to the content grid.
  - [ ] `.screen-content`'s `grid-template-areas` lists exactly `transport`, `worldview`, `console` (no `robotlist`).
  - [ ] Layout doesn't reorient into two columns at any width.

  **Verification:**
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` clean.
  - [ ] Manual: confirm `WorldView` and `Console` stack in a single column, sharing space evenly, at every viewport width.

  **Dependencies:** Task 5 (grid areas reference `RobotList`'s old slot; sequence after its removal to avoid an intermediate broken state).

  **Files:** `src/components/panels/physical/ScreenViewport.css`, `src/components/panels/physical/ScreenViewport.css.test.ts` (new)

  **Estimated scope:** S (1 file)

### Checkpoint: Content grid cleanup
- [x] `npm run build:types`, `npm run lint`, `npm test` (60 files, 697/697 passing), `npm run build` all clean.
- [x] `RobotList` is fully gone — deleted files, no remaining references anywhere in `src/` outside the new tests' own comments/assertions. `.screen-content` is single-column with exactly 3 areas at every width.
- [ ] Manual visual check in a running browser (`npm run dev`) — not yet performed this session; recommended before merging, alongside Phase 1's outstanding manual check.
- [ ] Review with human before proceeding.

---

### Phase 3: Cutaway + rebuilt mute/metadata bar

- [x] **Task 7: `SleeveContainer` — cutaway structure** — done

  **Description:** Per this plan's Architecture Decision above, split the `hasPowerSwitch` instance into `.sleeve-container__power-corner` (houses `PowerRockerSwitch`, `position: absolute`, sized to the switch's real rendered footprint — measure it, don't guess) and `.sleeve-container__top-strip` (thin 16px decorative lip to its right, `position: absolute`, `aria-hidden`), both above `ScreenViewport` in stacking order. Define `--power-corner-width` (measured value) as a CSS custom property so Task 8 can reference the same number. The non-power `SleeveContainer` instance (bottom bar) is unchanged — still the plain full-width bar from Phase 1.

  **Deviation from plan, caught and fixed before completion:** `--power-corner-width` was first defined on `.sleeve-container` itself, but `ScreenViewport.css` (Task 8) is a *sibling* under `.tablet`, not a descendant of `.sleeve-container` — a `var()` reference from a sibling stylesheet can't see a custom property scoped to another element. Moved the definition to `:root` in `index.css`, alongside `--sleeve-width`, matching that file's existing convention for shared layout tokens. `SleeveContainer.css` now only consumes it via `var()`.

  **Implementation note — `--power-corner-width: 150px` is a reasoned estimate, not a live measurement.** `PowerRockerSwitch`'s own box is ~59px wide × ~147px tall before its 90° rotation (computed from `PowerRockerSwitch.css`'s `rocker-light-housing`/`rocker-bezel`/`rocker-el` dimensions plus the `.rocker-panel` gap); CSS transforms are paint-only and don't reflow around the rotated visual footprint, so 150px is this session's best estimate of that footprint's width without a live browser to measure against. Flagged in code comments in both `index.css` and this task — needs visual confirmation.

  **Acceptance criteria:**
  - [ ] `hasPowerSwitch` instance renders both `.sleeve-container__power-corner` (containing `PowerRockerSwitch`) and `.sleeve-container__top-strip`.
  - [ ] Non-power instance renders unchanged (just the `sleeve-logo`, no cutaway markup).
  - [ ] `--power-corner-width` is defined once and reused, not hardcoded in two places.
  - [ ] No interactive element other than `PowerRockerSwitch` exists inside `SleeveContainer`'s markup (guardrail check).

  **Verification:**
  - [x] `npx vitest run SleeveContainer` — `SleeveContainer.test.tsx` (7 tests, real `PowerRockerSwitch` rendered with the same dependency mocks `PowerRockerSwitch.test.tsx` already uses): `hasPowerSwitch` instance renders the corner + strip + `PowerRockerSwitch`'s button, no `sleeve-logo`, and exactly one interactive element (guardrail check); non-power instance renders only the logo, no cutaway markup, zero interactive elements.
  - [x] `SleeveContainer.css.test.ts` extended (Task 3's 4 tests kept, Task 7 added 3 more) + `index.css.test.ts` extended with 2 tests for the `:root`-scoped token — all stylesheet-source assertions, same jsdom-has-no-cascade approach as prior tasks.
  - [x] `npm run build:types`, `npm run lint` clean. Full suite: 61 files, 710/710 passing (+13 net from this task: 7 in the new component test, 3 in the extended CSS test, 2 in `index.css.test.ts`, minus the 1 assertion rewritten in place). `npm run build` clean (1170 modules).
  - [ ] Manual: confirm the power switch renders in its corner, doesn't visually break, and the thin strip is visible to its right — not yet performed this session (no browser/devtools tool loaded); **the 150px width estimate above specifically needs this check**.

  **Dependencies:** Task 2 (needs `.tablet`'s `position: relative`).

  **Files:** `src/components/panels/physical/SleeveContainer.tsx`, `src/components/panels/physical/SleeveContainer.css`, `src/components/panels/physical/SleeveContainer.test.tsx` (new), `src/components/panels/physical/SleeveContainer.css.test.ts` (extended), `src/index.css` (`--power-corner-width` added), `src/index.css.test.ts` (extended)

  **Estimated scope:** M (new structure + CSS + new test file) — grew slightly beyond plan due to the cross-file custom-property scoping fix.

  **Follow-up correction (found while starting Task 8, fixed as part of it below):** the plan's Architecture Decision says the power `SleeveContainer` instance is "taken out of flex flow" so `ScreenViewport` can become flush with the top — but the implementation above only made the two *children* `position: absolute`, leaving the `<aside>` root still `position: relative` and still claiming its normal 64px flex slot in `.tablet`'s column. A screenshot mid-Task-8 confirmed this: the old (pre-Task-9) `TransportBar` still rendered directly below a persistent 64px band, nothing freed up. Fixed by adding a `.sleeve-container--cutaway` modifier class (applied only to the `hasPowerSwitch` instance's root) with `position: absolute; top: 0; left: 0` — same width/height as the base rule, just removed from flow. 2 new tests added to `SleeveContainer.test.tsx`/`SleeveContainer.css.test.ts`, TDD'd RED→GREEN.

  **Second follow-up correction (found from a screenshot after Task 9 landed):** the geometry itself was wrong, not just the flow issue above. Crawford's follow-up spec: the switch (~150x60px) sits centered in a sleeve corner with `--power-corner-margin` (20px) of breathing room on **all four sides** (making the corner ~190x100px, not a flat 150x64px hugging the switch with no padding), and the thin strip along the rest of the top matches that same margin as its own height (not an arbitrary hardcoded 16px) — a stepped sleeve edge, tall under the switch and short everywhere else. Also caught in the same pass: the strip's height had been hardcoded as `16px` in *two* places (`SleeveContainer.css` and `ScreenViewport.css`) — the exact "second hardcoded number that could drift" mistake `--power-corner-width` was already built to avoid. Fixed by introducing `--power-switch-width`/`--power-switch-height`/`--power-corner-margin` at `:root` (`index.css`), with `--power-corner-width`/`--power-corner-height` now `calc()`-derived from them instead of flat numbers, and both the strip's height and `ScreenViewport.css`'s `padding-top` now reference `var(--power-corner-margin)` instead of a literal `16px`. 7 new tests across `index.css.test.ts`, `SleeveContainer.css.test.ts`, and `ScreenViewport.css.test.ts`, TDD'd RED→GREEN.

  **Third follow-up correction (a real bug, found from a still-flat-looking screenshot after the second correction):** `.sleeve-container--cutaway` overrode `position`/`top`/`left`/`height` but never `width`/`background` — so it still inherited the base rule's `width: 100%` and solid `background: var(--color-surface)`, painting a solid, full-width, ~100px-tall rectangle across the **entire** top of the tablet, covering the stepped edge, the strip, and `TransportBar` underneath everywhere except where the switch itself poked through. Fixed at the time by adding `background: transparent` to the `--cutaway` root, making it a pure positioning anchor with no paint of its own — only its two children render anything visible. 1 new test, TDD'd RED→GREEN.

  **Manual revision by Crawford, confirmed and locked in (not reverted):** after the third correction, `.sleeve-container`'s base `width` was hand-edited from `100%` to a fixed `200px` (affecting both instances), the `--cutaway` root's `background: transparent` override was removed, and `PowerRockerSwitch.css`'s `.rocker-panel` transform lost its `translateX(100%)` (kept only `rotate(90deg)`) — done directly in the editor, outside the TDD loop. Surfaced explicitly and confirmed as the intended design, with one material consequence flagged and confirmed before locking in: `.sleeve-container__top-strip`'s `right: 0` now resolves against the 200px-wide `--cutaway` root (its containing block) rather than the tablet's true right edge, so the strip is a small ~10px sliver next to the corner, not a strip spanning the rest of the top as `docs/intent/phase-2-layout.md` originally described (amended there accordingly). The `background: transparent` removal is no longer a regression at this width — the root's solid background is now scoped near the corner's own ~200px footprint rather than the full tablet width, so the original full-width-band bug doesn't apply. All three prior TDD tests updated in place (not deleted) to assert the new confirmed values, with comments explaining the reversal for anyone reading the test file later. Full suite: 63 files, 735/735 passing. `build:types`, `lint`, `build` all clean.

  **Follow-on simplification (same session, Crawford's framing: "keep content out of the viewport's shared area with the power switch"):** with the sleeve now a flat width for both instances instead of spanning the rest of the top, the "shared area" collapsed to one box — `x: 0..--sleeve-bar-width`, at any height — so `ScreenViewport.css`'s two-part exclusion (`padding-top` for the strip's height, `padding-left` for the corner's width) was simplified to a single `padding-left: var(--sleeve-bar-width)`; nothing in the sleeve extends past that width at all now, so no separate vertical exclusion is needed. Also introduced `--sleeve-bar-width: 200px` at `:root` (`index.css`) so `SleeveContainer.css`'s own width and this exclusion share one source instead of the bare `200px` literal that was sitting alone in `SleeveContainer.css` with nothing else referencing it. 5 tests updated/added across `index.css.test.ts`, `SleeveContainer.css.test.ts`, and `ScreenViewport.css.test.ts` (including one asserting the old `padding-top` rule is gone, guarding against it creeping back as dead code), TDD'd RED→GREEN. Full suite: 63 files, 737/737 passing. `build:types`, `lint`, `build` all clean.

- [x] **Task 8: `ScreenViewport` — reserve space for the cutaway** — done

  **Description:** Add the padding/offset exclusion described in this plan's Architecture Decision: the metadata bar's own container gets `padding-top: 16px` (clears the top strip) and a left offset of `var(--power-corner-width)` (clears the switch corner) for its own height; everything below is unaffected. No DOM changes needed in `ScreenViewport.tsx` itself beyond what Task 5 already did — this is a CSS-only task.

  **Implementation:** `.screen-content .transport-bar { padding-top: 16px; padding-left: var(--power-corner-width); }` in `ScreenViewport.css` — a descendant selector from the layout-owning file reaching down to `TransportBar`'s own root class, rather than editing `TransportBar.css` directly, matching the plan's file scoping. Padding (not margin) was used deliberately — `.transport-bar` is `position: sticky`, and margin on a sticky element can interact awkwardly with its own `top: 0` offset; padding doesn't have that risk.

  **Acceptance criteria:**
  - [x] Nothing in `ScreenViewport`'s rendered content visually overlaps `SleeveContainer`'s power corner or top strip at any viewport width. *(Structurally true now that the exclusion exists — full confirmation is the pending manual check below.)*
  - [x] `WorldView`/`Console` (below the bar) are unaffected — full width, no reserved space. Verified directly: no `padding-left` rule exists for either selector.

  **Verification:**
  - [x] `ScreenViewport.css.test.ts` extended with 3 new stylesheet-source tests (padding-top, padding-left reusing the shared token, and confirming world-view/console are untouched) — TDD'd RED→GREEN (2 of 3 were genuinely RED; the "untouched" one was already true and stayed green as a baseline check).
  - [x] `npm run build:types`, `npm run lint` clean. Full suite: 61 files, 716/716 passing (+6 net: 2 from the Task 7 correction, 3 from this task's `ScreenViewport.css.test.ts`, 1 net from combining/dedup). `npm run build` clean (1170 modules).
  - [ ] Manual: confirm no visual overlap between the switch/strip and the (still old, pre-Task-9) `TransportBar` content across viewport widths — not yet performed this session (no browser/devtools tool loaded). `TransportBar` itself still shows its pre-Task-9 restart/pause/mute/measure/BPM content, so this check is most meaningful once Task 9 lands.

  **Dependencies:** Task 6, Task 7.

  **Files:** `src/components/panels/physical/ScreenViewport.css`, `src/components/panels/physical/ScreenViewport.css.test.ts` (extended). Plus the Task 7 correction above: `src/components/panels/physical/SleeveContainer.tsx`, `src/components/panels/physical/SleeveContainer.css`, `src/components/panels/physical/SleeveContainer.test.tsx`, `src/components/panels/physical/SleeveContainer.css.test.ts`.

  **Estimated scope:** S (1 file, CSS only) — the Task 7 correction added scope beyond this task's own file, but that work belonged to Task 7's responsibility, not Task 8's.

- [x] **Task 9: `TransportBar` rebuild — controls, metadata, sticky-always, wrap** — done

  **Description:** Remove restart, pause/play, and `isPaused` state entirely (no replacement). Add a metadata readout — planet name (seed), locale coordinates, BPM, time — reading directly from `planetStore`/`localeStore`/`audioStore`/`constants/time.ts` (existing hooks, no new data file per spec). Remove the `min-width: 48em { position: relative }` override so the bar stays `position: sticky` at every size. Change the row to `flex-wrap: wrap` so metadata drops to a new line when there's no room next to mute, per the confirmed intent. Keep `.transport-bar__displays`/`.transport-bar__btn` as the outer class names (this plan's Architecture Decision resolving spec §7.2) — verify `PowerRockerSwitch.tsx`'s power-on animation still fires correctly against the rebuilt markup.

  **Implementation note:** `.transport-bar`'s fixed `height: var(--transport-height)` was dropped in favor of `min-height` only — a fixed height would clip the metadata row once it wraps onto a second line, defeating the whole point of the wrap requirement.

  **Deviation from the test plan, caught before it mattered:** Radix `Toolbar.ToggleItem` (used for both the old pause toggle and the surviving mute toggle) renders `role="radio"`, not `"button"`. The first draft of the restart/pause-absence test queried `getByRole('button', { name: /pause/i })` — which would have returned `null` regardless of whether pause actually existed, silently passing even with a stray pause control left behind. Caught and fixed before implementing: switched to `role: 'radio'` for the pause/mute queries.

  **Acceptance criteria:**
  - [x] No restart or pause/play controls remain in the DOM; `isPaused` state is removed.
  - [x] Mute toggle behavior is unchanged (still calls `AudioEngine.setMasterVolume`/`store.setMuted`) — verified via a real click against real Zustand stores, not a mock.
  - [x] Metadata readout displays planet name, locale coordinates, BPM, and time, sourced from existing store hooks only.
  - [x] The bar is `position: sticky` at every viewport width (no override turns it off).
  - [x] Mute + metadata sit in one row when there's room; metadata wraps to a new line when there isn't (content-driven `flex-wrap: wrap`, not a new viewport breakpoint).
  - [ ] `PowerRockerSwitch.tsx`'s `handlePowerOn` fade-in animation still visibly fires on the mute button and metadata block on power-on — not yet manually confirmed (no browser/devtools tool loaded this session); the class names it targets (`.transport-bar__displays`, `.transport-bar__btn`) are unchanged, so this should hold, but wants an eyes-on check.

  **Verification:**
  - [x] `npx vitest run TransportBar` — `TransportBar.test.tsx` (8 tests, real `planetStore`/`localeStore`/`audioStore`/`uiStore` fixtures via `setState`, no mocks — `AudioEngine.getMasterVolume`/`setMasterVolume` are real, side-effect-safe calls): planet name, rounded coordinates, HH:MM time, BPM, no restart/pause, mute toggle flips `isMuted`, mute disables when powered off, no crash/no "undefined" when the active locale is missing. `TransportBar.css.test.ts` (4 tests): no `@media`, no lingering `position: relative`, `position: sticky` unconditional, `flex-wrap: wrap` present.
  - [x] `npm run build:types`, `npm run lint` clean (one import-order autofix needed in the new test file).
  - [x] `npm run build` clean (1170 modules).
  - [ ] Manual: `npm run dev`, power on, confirm the power-on fade-in animation still plays on the rebuilt bar; resize narrow enough to trigger the metadata wrap and confirm it wraps cleanly; confirm sticky behavior holds at every width. Not yet performed this session.

  **Noticed but not touched (pre-existing, out of scope):** clicking mute logs a React warning — `ToggleGroup is changing from uncontrolled to controlled` (`value={isMuted ? 'mute' : undefined}` starts as `undefined`, becomes `'mute'` after first toggle). This pattern predates this task unchanged; fixing it wasn't part of Task 9. **Resolved by the follow-up fix below**, as a side effect.

  **Follow-up fix (same session, Crawford's framing: "I see the actual thing i'm not liking, it's ToggleGroup. it should be a toggle, but it's alone."):** `Toolbar.ToggleGroup` (Radix's radiogroup pattern, for choosing among multiple mutually-exclusive options) was vestigial — it originally wrapped two groups (pause + mute), each legitimately a group-of-one at the time, but once restart/pause were removed earlier in this same task, mute was left as a single `Toolbar.ToggleItem` alone inside its own `Toolbar.ToggleGroup`, rendering an unnecessary `role="radiogroup"` > `role="radio"` structure for what's conceptually one push-button with a pressed state. Fixed by switching to `Toolbar.Button` (plain, `role="button"`) with manual `aria-pressed={isMuted}` — the correct ARIA pattern for a standalone toggle. 3 tests updated (role changed from `radio` to `button`, plus explicit assertions that no `radio`/`radiogroup` role exists), TDD'd RED→GREEN. Also incidentally resolved the "noticed but not touched" React warning above, since `ToggleGroup`'s controlled/uncontrolled `value` prop no longer exists at all. Full suite: 57 files, 692/692 passing. `build:types`, `lint`, `build` all clean.

  **Dependencies:** Task 7, Task 8 (bar needs the reserved space to sit in).

  **Files:** `src/components/panels/screen/TransportBar.tsx`, `src/components/panels/screen/TransportBar.css`, `src/components/panels/screen/TransportBar.test.tsx` (new), `src/components/panels/screen/TransportBar.css.test.ts` (new)

  **Estimated scope:** M (behavior removal + new read-only metadata logic + CSS)

### Checkpoint: Cutaway + mute/metadata bar complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual pass across mobile/~48em/~64em/92em+ widths: no reorientation anywhere, cutaway renders correctly, mute+metadata bar is sticky and wraps as expected, power-on animation still fires.
- [ ] Review with human before proceeding — this is the phase's core visual deliverable.

---

### Phase 4: Docs and the gated decorative-flip decision

- [x] **Task 10: `docs/UI_SHELL.md` update** — done

  **Description:** Update the Overview's list of what `ScreenViewport` renders — drop `RobotList`, and describe `TransportBar` as the sticky mute+metadata bar rather than the old transport controls. Per the roadmap's own Docs note for this phase.

  **Implementation:** Rewrote the Overview's render-list sentence to list `TransportBar`, `WorldView`, `Console` (no `RobotList`), added a clause describing `TransportBar` as "a sticky mute+metadata bar — a mute toggle plus a read-only readout of planet name, locale coordinates, local time, and BPM; it has no restart or pause/play controls," and a separate note that `RobotList` was removed in this phase with Phase 8 as its replacement.

  **First attempt, reverted: a regex-based "doc-accuracy" test.** Initially wrote `src/UI_SHELL.docs.test.ts`, matching this session's CSS-source-text pattern. Crawford correctly called this an anti-pattern, and on reflection it is one: CSS has a formal grammar, so asserting a selector/property exists is a real structural fact. Prose doesn't — regex-matching English for "does it roughly say the right thing" isn't verifying a fact, it's asserting my own writing contains certain words, written in the same change as the assertion, with no independent oracle. The brittleness showed up immediately: my own accurate sentences ("no restart or pause/play controls," "`RobotList` was removed") kept triggering my own word bans, requiring increasingly specific anchoring just to stop the test from red-flagging correct prose — a sign the test was fighting the writing, not verifying it. TDD's own skill doc already named this exact case in its "When NOT to use" list; that should have been surfaced as a choice rather than proceeded past on the CSS-test pattern's momentum. Deleted the test; verification is manual review, which is the honest method for prose.

  **Acceptance criteria:**
  - [x] `RobotList` no longer appears in the Overview's list of rendered components (a separate removal note, outside that list, is fine and intentional).
  - [x] `TransportBar`'s description matches its rebuilt behavior (mute + metadata, sticky-always).

  **Verification:**
  - [x] `npm run build:types`, `npm run lint` clean. Full suite: 63 files, 737/737 passing (no test file added for this task — see note above). `npm run build` clean — identical output hashes to before, confirming zero runtime impact from a docs-only change.
  - [x] Manual review — read the updated section against the shipped `TransportBar.tsx`/`ScreenViewport.tsx`, confirms it matches.

  **Dependencies:** Task 9.

  **Files:** `docs/UI_SHELL.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 11: `ScreenViewport.css` decorative rail/gradient flip** — done, confirmed "remove it"

  **Description:** Per spec §7.3, `ScreenViewport.css`'s `min-width: 48em` block also flips `.screen-viewport::before`'s stripe direction and `.screen-rail`'s bevel orientation from vertical (mobile) to horizontal (desktop) — purely decorative, written to accompany the physical sleeve reorientation this phase removes everywhere else. Crawford confirmed: remove it, keep the mobile/vertical-bevel look at every size, fully consistent with the rest of the phase.

  **No test written, deliberately.** Per the earlier CSS-source-text test retrospective (see the Testing note above the Task List) — this is a pure decorative-CSS removal with no logic to verify and no independent oracle beyond "were the right lines deleted," which `git diff` and manual review already cover. Writing a regex test here would repeat the exact anti-pattern just removed.

  **Acceptance criteria:**
  - [x] The `min-width: 48em` block affecting `.screen-viewport::before`/`.screen-rail` is deleted.
  - [x] Decorative bevels/stripes stay in their mobile (vertical) orientation at every width — confirmed structurally (no `@media` block remains in the file at all).

  **Verification:**
  - [x] `npm run build:types`, `npm run lint` clean. Full suite: 57 files, 692/692 passing (unchanged — no test added or removed). `npm run build` clean, CSS output shrank slightly as expected.
  - [ ] Manual: confirm the decorative bevel/stripe look is consistent across all widths in a running browser — not yet performed this session (no browser/devtools tool loaded).

  **Dependencies:** None technically, was blocked on the human decision above — now unblocked and done.

  **Files:** `src/components/panels/physical/ScreenViewport.css`

  **Estimated scope:** XS (1 file, once unblocked)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test` (57 files, 692/692), `npm run build` all clean.
- [x] All acceptance criteria across Tasks 1-11 met.
- [x] `docs/UI_SHELL.md` reflects the shipped shell.
- [ ] Manual visual pass in a running browser across viewport widths — not yet performed this session (no browser/devtools tool loaded), and the single most valuable remaining verification step now that every task is code-complete.
- [ ] Ready for human review / PR — pending the manual pass above, and code is uncommitted per this session's standing policy (commit only when explicitly told).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `--power-corner-width` is guessed too small/large, causing content to peek out from under the switch or leaving an ugly gap | Medium — visual bug, easy to miss without checking every width | Task 7 measures the real rendered `PowerRockerSwitch` footprint before picking the value; Task 8's manual check explicitly looks for overlap across widths |
| `PowerRockerSwitch.tsx`'s power-on animation silently stops animating anything if class names drift during the `TransportBar` rebuild | Medium — no error, just a missing visual effect, easy to miss | This plan's Architecture Decision pins the class names down explicitly; Task 9's acceptance criteria include a manual check of the animation firing, not just a code review |
| Removing `SleeveContainer`'s flex-flow participation (Task 7's `position: absolute`) could affect `.tablet`'s `justify-content: space-between` sizing for the remaining flex children | Low — only 2 flex children remain (`ScreenViewport`, bottom `SleeveContainer`) once the top one is absolute | Covered by Task 2/7's manual checks; `.tablet`'s `justify-content` may need revisiting once only one true flex sibling plus the absolute one remain — flag during Task 7 if the bottom sleeve's positioning looks off |
| Task 11 gets implemented anyway "for consistency" without an explicit answer | Low but easy to do by habit, since it's textually adjacent to Task 6's grid removal | Task 11 is a separate task with its own explicit gate note; the Complete checkpoint requires it be either done or explicitly deferred with a reason, not silently skipped or silently bundled in |

## Open Questions

Only one item remains open, carried forward from spec §7.3 — everything else (§7.1, §7.2, §7.4) is resolved into concrete Architecture Decisions above:

1. **Decorative rail/gradient flip (Task 11):** remove it (mobile/vertical bevel look at every size, matching the rest of this phase's "no reorientation" direction), or keep it as a deliberate exception? Needs Crawford's explicit answer before Task 11 starts.
