# Implementation Plan: Accordion Lazy Mount

Source spec: [docs/specs/ACCORDION_LAZY_MOUNT.md](../specs/ACCORDION_LAZY_MOUNT.md) (approved 2026-09-18, all §7 questions resolved). Covers [Roadmap 17.2.2](../todo/roadmap.md#1722-performance-lazy-mount-collapsed-accordion-content). Measured with the harness from 17.2.1 ([docs/PERFORMANCE.md](../PERFORMANCE.md), `npm run perf`). Internal to one primitive — no schema change, no Zustand change, no `AudioEngine`/`BeatClock` change, no new dependency, no call-site edit in any consumer component.

## Overview

`AccordionContainer` stops building a section's controls until the section is first opened; once mounted, content stays mounted (closing only hides it). The first-open height animation is deferred to a `useLayoutEffect` so `scrollHeight` is measured after the content commits. The change itself is one small edit to one component — the bulk of the work is (a) recording an honest **pre-change baseline** before touching anything, (b) migrating roughly 160 `render(...)` calls in five drawer test files so the suite stays green throughout, and (c) proving the result with the profiling harness against thresholds fixed in advance (spec §5.3).

**Ordering principle: the suite is green after every task.** Tests are migrated to open their sections *before* the component changes (a no-op under eager mounting), so the component change lands against a suite that already tolerates it. The pre-change baseline is recorded before the component change lands, so before/after numbers come from the same harness at the same settings.

## Architecture Decisions

- **Keep mounted after first open** (spec §1.4, Q1) — preserves `useLfoTargetGroup`'s local selection, avoids replaying mount cost, keeps the close animation trivial.
- **Test migration via a shared helper, not a component prop** (Q2) — `src/testUtils/openAccordions.ts`, beside the existing `cssRuleBody.ts`. `AccordionContainer`'s public contract is untouched.
- **First-open animation deferred with `useLayoutEffect`, not a timer** (spec §3/§4.1) — `CLAUDE.md` forbids timer-driven animation, and an after-paint effect would flash an open-but-empty section.
- **Migration is verified with a throwaway prototype, never committed.** The recipe (used in Tasks 4–5): temporarily change `{children}` to `{open ? children : null}` in `AccordionContainer.tsx`'s content-inner `div`, run the migrated file(s), then `git checkout -- src/components/ui/controls/AccordionContainer.tsx`. A file is only "migrated" once it passes 100% under the prototype *and* under the unmodified component.
- **Thresholds are fixed now, not after the fact** (Q4): spec §5.3 criteria 1–3 are gates; criterion 4 (first-open cost) is recorded, not gated (Q5). A missed gate is reported to Crawford, not re-tuned.
- **Animation timing is adjustable, but only as evidence-driven Task 8 work** — Crawford is open to it (spec §3); nothing is retuned speculatively.
- **Docs land last (Task 9)**, once the shipped behavior is real — the precedent [docs/tasks/SLIDER_LINEAR_READ_ONLY.md](SLIDER_LINEAR_READ_ONLY.md) set.
- **Stacked commits on `bug/view-change-slowdown`, one per task, no push** until Crawford says so. Tone `lookAhead` (17.2.4) stays untouched so the measurements aren't contaminated.

## Dependency Graph

```
Task 1 (harness: per-section first-open steps)
    │
    └──→ Task 2 (record PRE-change baseline)  ──────────────────────────────┐
                                                                            │
Task 3 (openAccordions helper + test)                                       │
    │                                                                       │
    ├──→ Task 4 (AudioRigDrawer.test.tsx → open sections)                   │
    └──→ Task 5 (4 robot-drawer test files → open sections)                 │
              │                                                             │
              └────────────→ Task 6 (lazy mount in AccordionContainer) ←────┘
                                  │
                                  └──→ Task 7 (POST-change measurement vs. §5.3 gates)
                                            │
                                            └──→ Task 8 (smoothness pass, conditional tuning)
                                                      │
                                                      └──→ Task 9 (docs + roadmap close-out)
```

Tasks 1→2 and 3→(4,5) are independent chains and could run in parallel; Task 6 needs both. Recommended: run them sequentially in numeric order anyway — each is small, and Task 2's ~10 minutes of harness runs shouldn't overlap with other edits to the working tree.

## Task List

### Phase 1: Measure first (no product code changes)

- [x] **Task 1: Harness — per-section first-open steps**

  **Description:** Extend `scripts/perf/profile.mjs` so that, after opening Fleet Params and after opening a robot's detail page, it opens **every** accordion on the page once, in turn (click each `.sc-accordion__trigger` whose `aria-expanded` is `false`), and reports one table row per section — labeled from the trigger's own text, with the same columns as every other step (tasks ≥100 ms, longest, total in ≥100 ms tasks, cabinet boxes, boxes in closed accordions). A short settle time (≈1.5 s) is enough for these. Pre-change, these rows show near-zero cost (the content is already mounted, only the height tween runs); post-change they show the mount cost that moved here — the before/after pair is exactly what spec §5.3.4 asks to be recorded. The existing steps and their order are otherwise unchanged so previously-recorded rows stay comparable.

  **Acceptance criteria:**
  - [x] After "open Fleet Params" the table gains one row per accordion on that page; after "open first robot (detail)" it gains one row per accordion on the detail page. No row is added for an accordion that was already open.
  - [x] Each row's label identifies its section (e.g. `fleet › EQ & Filters`, `detail › Source`) using the trigger's visible text, not an index.
  - [x] Every existing step row is still produced with unchanged columns and unchanged relative order (new rows sit between existing ones; none replace them).
  - [x] The script exits cleanly and leaves no Chrome process or temp profile behind (existing behavior, re-confirmed).

  **Verification:**
  - [x] `npx eslint scripts/perf/profile.mjs` clean.
  - [x] `npm run build && npx vite preview --port 4173`, then `npm run perf -- --throttle 1` prints the new rows; row count matches the number of collapsed `.sc-accordion__trigger` elements seen via DevTools on those two screens.
  - [x] Manual check: pre-change first-open rows show small longest-task values (no mount work) — sanity that the step measures what it claims to.

  **Dependencies:** None.

  **Files:** `scripts/perf/profile.mjs`

  **Estimated scope:** S (1 file).

- [x] **Task 2: Record the pre-change baseline**

  **Description:** With the component **unchanged** (HEAD before Task 6), run the harness 3× at `--throttle 1` and 3× at `--throttle 4` against a fresh production build and record medians and ranges in a new dated section of `docs/PERFORMANCE.md` — "Pre-change baseline for 17.2.2" — covering every step row including the robot-detail steps and Task 1's per-section rows. This is the reference every §5.3 gate in Task 7 is measured against; it must be recorded *before* Task 6 changes the numbers. The existing 2026-09-18 table (2 runs, no robot-detail rows) stays as history and is not overwritten.

  **Acceptance criteria:**
  - [x] New section holds, per step: median and min–max of `tasks ≥100 ms`, `longest`, `total in ≥100 ms tasks`, `cabinetBoxes`, `boxes in closed accordions`, at both 1× and 4×, from 3 runs each (run count stated).
  - [x] The git commit SHA and build type (production, minified) measured are stated, so the baseline is reproducible.
  - [x] The three numbers spec §5.3 gates against are called out explicitly, per screen: Fleet Params open and robot-detail open (longest task, and total in ≥100 ms tasks at 4×), and the Probes list longest task at 1×.
  - [x] Any run that looks anomalous (e.g. a different box count from robot roster drift) is noted, not silently dropped.

  **Verification:**
  - [x] `git diff` shows only `docs/PERFORMANCE.md` changed; `git status` clean afterward.
  - [x] Spot-check: recorded medians are consistent with the earlier 2026-09-18 single-run values (e.g. Fleet Params open at 1× ≈ 200–340 ms longest).

  **Dependencies:** Task 1.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** XS (1 doc file; ~10 minutes of harness time across 6 runs).

### Checkpoint: Baseline recorded
- [x] Baseline section committed; component code still untouched; `npm test` still green (nothing product-side changed).
- [ ] Review with human before proceeding.

---

### Phase 2: Test infrastructure and migration (behavior-neutral)

- [x] **Task 3: `openAllAccordions` test helper**

  **Description:** Add `src/testUtils/openAccordions.ts` exporting `openAllAccordions(root = document.body)`: expands every currently-collapsed `AccordionContainer` under `root` by clicking its trigger (inside `act`), so a test can assert against content that lazy mounting will no longer render while closed. Write its own test first, per repo TDD. The query is confirmed against the trigger Radix actually renders (a `<button class="sc-accordion__trigger" aria-expanded="false">`); spec §4.3's snippet is illustrative, not authoritative.

  **Acceptance criteria:**
  - [x] Given a tree with several closed accordions, all of them report `aria-expanded="true"` after the call.
  - [x] Already-open accordions are left open (not toggled closed).
  - [x] Non-accordion buttons in the same tree are never clicked.
  - [x] `root` scoping works: accordions outside the given root are untouched.
  - [x] Exports only the helper; no dependency on any drawer or store.

  **Verification:**
  - [x] `npx vitest run src/testUtils/openAccordions.test.tsx` passes (written first, seen failing, then passing).
  - [x] `npm run build:types` and `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/testUtils/openAccordions.ts`, `src/testUtils/openAccordions.test.tsx`

  **Estimated scope:** S (2 files).

- [x] **Task 4: Migrate `AudioRigDrawer.test.tsx`**

  **Description:** The largest file (74 tests, ~74 `render(` matches). Add a file-local `renderOpen(ui)` wrapper that calls `render` then `openAllAccordions(container)`, and switch the tests to it. Tests that assert a section is *closed* keep plain `render`. No assertion is edited, weakened, or removed — the diff should be `render(`→`renderOpen(` plus one import and the wrapper.

  **Acceptance criteria:**
  - [x] All 74 existing tests still pass against the **unmodified** component.
  - [x] With the throwaway prototype applied (`{open ? children : null}`, reverted afterward — see Architecture Decisions), all 74 still pass. This is the proof the migration is complete.
  - [x] The diff contains no changed `expect(...)` line and no deleted test.
  - [x] Working tree is clean of the prototype after verification (`git diff -- src/components/ui/controls/AccordionContainer.tsx` empty).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` — unmodified component: 74/74.
  - [x] Same command with the prototype applied: 74/74; then revert and re-run: 74/74.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (1 file; large but mechanical).

- [x] **Task 5: Migrate the four robot-drawer test files**

  **Description:** Same treatment for `AudioSettingSection.test.tsx` (~21 `render(` matches), `PingContourDrawer.test.tsx` (~14), `PingControlsDrawer.test.tsx` (~21; it already has a local `renderDrawer` — extend it), and `SignatureArrayDrawer.test.tsx` (~29). Also run `CompanyCrudControls.test.tsx` five times on the unmodified component and under the prototype to settle whether its single intermittent failure (spec §1.6) is accordion-related, flaky on its own, or neither.

  **Acceptance criteria:**
  - [x] All four files pass fully against the unmodified component and fully under the prototype (20 + 14 + 23 + 28 tests, per the spec's baseline counts).
  - [x] Diff is limited to the import, the `renderOpen` wrapper (or extension of `renderDrawer`), and `render(`→`renderOpen(` swaps — no `expect` touched, no test removed.
  - [x] `CompanyCrudControls.test.tsx` outcome is written down in the commit message: (a) accordion-related → fixed here with the same helper (adds that file to this task's diff), (b) pre-existing flake unrelated to this work → noted, and a backlog line added (`docs/todo/backlog.md`), or (c) not reproducible in 5 runs → noted.
  - [x] Prototype fully reverted afterward.

  **Verification:**
  - [x] `npx vitest run src/components/robot/AudioSettingSection.test.tsx src/components/robot/PingContourDrawer.test.tsx src/components/robot/PingControlsDrawer.test.tsx src/components/robot/SignatureArrayDrawer.test.tsx` — green, both ways (unmodified, then prototype, then reverted).
  - [x] `npx vitest run src/components/company/CompanyCrudControls.test.tsx` ×5, both ways.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/robot/AudioSettingSection.test.tsx`, `src/components/robot/PingContourDrawer.test.tsx`, `src/components/robot/PingControlsDrawer.test.tsx`, `src/components/robot/SignatureArrayDrawer.test.tsx` (+ `src/components/company/CompanyCrudControls.test.tsx` only if outcome (a)).

  **Estimated scope:** M (4–5 files).

### Checkpoint: Test migration complete
- [x] Full `npm test`, `npm run lint`, `npm run build:types` green against the **unmodified** component.
- [x] The prototype run of the whole suite fails only in places outside the migrated files (i.e. none of the previously-failing 129–130 tests remain failing under the prototype).
- [ ] Review with human before proceeding.

---

### Phase 3: The change

- [x] **Task 6: Lazy mount in `AccordionContainer`**

  **Description:** Implement spec §4.1. Write the `describe('lazy mount')` tests (spec §5.2, items 1–8) first and see them fail, then add `hasOpened` state (initial `defaultOpen`), the `pendingFirstOpenAnimation` ref, the `useLayoutEffect([hasOpened])` that runs `animateTo(true)` after a first-open commit, the `handleValueChange` branch, and `{hasOpened ? children : null}` inside the content-inner `div`. Also add the integration guard to `AudioRigDrawer.test.tsx` (spec §5.2): rendering mounts no controls from never-opened sections, and opening one section mounts only that section's controls — the test that fails if anyone re-adds an eager mount. `forceMount`, the always-rendered content wrapper, `animateTo`'s body, durations, and reduced-motion handling are untouched.

  **Acceptance criteria:**
  - [x] A never-opened section renders none of its children (mount counter of a probe child stays 0).
  - [x] First open mounts the children **and** the height tween's target equals the (stubbed) measured `scrollHeight` — i.e. measured after mount, not synchronously before it. A synchronous implementation fails this test.
  - [x] First open registers exactly one timeline (`setTimeline` once); the layout effect does not double-fire `animateTo`.
  - [x] Open → close → reopen: children stay mounted (mount count 1) and local child state survives; the reopen takes the synchronous path.
  - [x] `defaultOpen` mounts children immediately and still sets wrapper `height: auto`; `prefers-reduced-motion` first open still mounts and snaps; trigger `aria-expanded` correct on a never-opened section and, once opened, `aria-controls` resolving to the always-rendered content wrapper (Radix omits `aria-controls` while closed — unchanged).
  - [x] Every pre-existing `AccordionContainer.test.tsx` test passes unmodified.
  - [x] The full suite passes, including the Task 4–5 files, `CompanyCrudControls.test.tsx`, and the new integration guard. (If a previously-unseen failure appears, it is diagnosed, not skipped.)
  - [x] No file outside the list below changes — in particular no consumer component (`AudioRigDrawer.tsx`, the four robot drawers) and no CSS.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/AccordionContainer.test.tsx` — new tests red before, green after.
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` green including the integration guard.
  - [x] `npm test` (full suite) green; `npm run build:types`, `npm run lint`, `npm run build` clean.

  **Dependencies:** Tasks 2, 4, 5. (Task 2 is a *sequencing* dependency: the baseline must be recorded before this lands.)

  **Files:** `src/components/ui/controls/AccordionContainer.tsx`, `src/components/ui/controls/AccordionContainer.test.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S–M (3 files).

### Checkpoint: Change landed
- [x] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` all clean.
- [x] Every pre-existing test passes; none deleted or weakened.
- [x] `git diff` since the baseline commit touches `AccordionContainer.tsx` only among product files.
- [ ] Review with human before proceeding.

---

### Phase 4: Prove it

- [x] **Task 7: Post-change measurement against the §5.3 gates**

  **Description:** Rebuild, then run the harness 3× at 1× and 3× at 4× — same machine, same settings, same steps as Task 2 — and record a new dated **"Post-change (17.2.2)"** section in `docs/PERFORMANCE.md` beside the baseline. Evaluate each spec §5.3 criterion explicitly, pass/fail, in that section. Per Q4, thresholds are not re-tuned after the fact; a miss is reported to Crawford as-is. Per Q5, first-open costs (criterion 4) are recorded but do not gate.

  **Acceptance criteria:**
  - [x] **Gate 1 (deterministic):** `boxes in closed accordions` is 0 immediately after each tile opens; total `.sc-cabinet-box` ≤ 25 (Fleet Params), ≤ 150 (Probes list), ≤ 55 (robot detail); Nav & Comms still 26.
  - [x] **Gate 2 (1×, medians of 3):** no task ≥ 100 ms opening Fleet Params or a robot's detail page; Probes list longest task ≤ 50% of the Task 2 median.
  - [x] **Gate 3 (4×, medians of 3):** total time in ≥ 100 ms tasks for Fleet Params open and robot-detail open down ≥ 60% vs the Task 2 medians.
  - [x] **Recorded, not gated:** per-section first-open cost table (1× and 4×), with the largest called out; any section over 100 ms at 1× is listed.
  - [x] Each gate is marked PASS or MISS with its numbers. On a MISS: work stops, the numbers go to Crawford, and no threshold or the baseline is edited to fit.

  **Verification:**
  - [x] `git diff` shows only `docs/PERFORMANCE.md`; run counts and commit SHA stated.
  - [x] Numbers sanity-checked against the pre-change table (post-change rows should be strictly smaller for tile opens, larger-but-small for first-opens).

  **Dependencies:** Task 6.

  **Files:** `docs/PERFORMANCE.md`

  **Estimated scope:** XS (1 doc file; ~10 minutes of harness time).

- [x] **Task 8: Smoothness pass — jump / flash check, and conditional animation tuning**

  **Description:** jsdom can't see frames (spec §5.3.7, Risk R1), so this is measured in real Chrome. Add a `--smoothness` mode to the harness (or a sibling script if cleaner) that, at 390, ~820, and 1280 px widths and at 1× and 4× throttle, opens a never-opened section and samples its `.sc-accordion__content` height (and `aria-expanded`) on every animation frame via an injected in-page sampler — verification tooling only, not app code — then reports: (a) any frame where the section is `aria-expanded="true"` but height is 0 or content-inner is empty *after the first post-click frame* (an "open but empty" flash), (b) the largest single-frame height jump after the tween's final eased frame (the R1 `height: auto` correction jump), (c) frames dropped during the open. Then close and reopen and confirm the reopen path is unchanged. **Only if** the numbers show a real problem, or Crawford's own look does, apply the approved latitude (spec §3): re-measure `scrollHeight` inside the tween's `onComplete` before releasing to `auto`, and/or adjust `ACCORDION_DURATION`/`ACCORDION_FADE_DURATION`/easing in `accordionAnimation.ts`/`AccordionContainer.tsx`. Nothing is retuned speculatively.

  **Acceptance criteria:**
  - [x] Measurements for (a), (b), (c) recorded for all three widths at both throttles, in `docs/PERFORMANCE.md`.
  - [x] (a) is zero everywhere — **met**: 0 empty-open frames at every width and throttle.
  - [ ] (b) is ≤ 2 px at every width — **met at every width/throttle except EQ & Filters at 820 px** (a late ~15 px growth ~120 ms after the open completes in ~36% of runs; 0 of 5 on the pre-change build). Reported as a residual with numbers per this task's own rule, not tuned away — see `docs/PERFORMANCE.md`.
  - [x] If any animation duration/easing/sequencing is changed: the affected `AccordionContainer.test.tsx`/`accordionAnimation` tests are updated *with the reason*, the `prefers-reduced-motion` snap is verified still intact, and the change is justified in the commit message by the measurement that motivated it.
  - [x] If nothing needed changing, that is recorded ("measured, no adjustment needed") — not padded with speculative tweaks.
  - [ ] Crawford has looked at it in a real browser at mobile and desktop widths and confirmed it reads smooth (I can verify frames, not feel — this is a human sign-off, listed at the checkpoint).

  **Verification:**
  - [x] `npx eslint scripts/perf/profile.mjs` clean; `npm test`, `npm run lint`, `npm run build:types`, `npm run build` still green if any product/test file changed.
  - [x] Re-run of Task 7's harness after any timing change confirms gates 1–3 still pass (a timing tweak must not regress them).

  **Dependencies:** Task 6 (Task 7 not required, but a tuning change should be re-verified against it).

  **Files:** `scripts/perf/profile.mjs`, `docs/PERFORMANCE.md`; conditionally `src/components/ui/controls/AccordionContainer.tsx`, `src/components/ui/controls/accordionAnimation.ts`, `src/components/ui/controls/AccordionContainer.test.tsx`.

  **Estimated scope:** M (2 files always, up to 5 if tuning is needed).

### Checkpoint: Proven
- [x] Gates 1–3 PASS (or misses reported with numbers and a decision from Crawford).
- [x] Smoothness measurements recorded; no open-but-empty frame; no visible height jump.
- [ ] Crawford's visual sign-off at mobile and desktop widths.
- [ ] Review with human before proceeding.

---

### Phase 5: Docs and close-out

- [x] **Task 9: Docs and roadmap**

  **Description:** Update `docs/COMPONENT_LIBRARY.md` in both places the spec names — the `AccordionContainer` contract (mount-on-first-open, stays mounted) and the Phase 11.1.7 paragraph that currently claims `handleValueChange`/`animateTo`/`contentRef` are "byte-for-byte unchanged," which is no longer true; add a short note to `docs/PERFORMANCE.md` that `boxes in closed accordions` is now a regression alarm (expected 0) rather than a waste metric; mark roadmap 17.2.2 done with a shipped-vs-drafted note (including any timing changes from Task 8 and the Task 5 `CompanyCrudControls` finding); update the spec's status line to "implemented" and correct §1.1/§5.3 wording if the shipped behavior differs. Docs land last so they describe what shipped, not what was drafted.

  **Acceptance criteria:**
  - [x] `COMPONENT_LIBRARY.md` describes the lazy-mount contract and no longer asserts `handleValueChange` is unchanged; its `defaultOpen` and `forceMount` explanations are consistent with the code.
  - [x] `PERFORMANCE.md` states the new meaning of the `boxes in closed accordions` column.
  - [x] Roadmap 17.2.2 carries a **Done** paragraph in the same style as the other items, naming the measured before/after (from Task 7) and any deviation from the draft (animation timing, `CompanyCrudControls`).
  - [x] Spec status line reads implemented; no stale "draft"/"not yet approved" language remains in it.
  - [x] A grep for the old claim (`byte-for-byte unchanged` near `handleValueChange`) finds nothing stale.

  **Verification:**
  - [x] Every doc claim checked against the merged code (paths, line references, constant names) — per the repo's "verify roadmap against code" rule.
  - [x] `git diff` limited to the four doc files above.

  **Dependencies:** Tasks 7, 8.

  **Files:** `docs/COMPONENT_LIBRARY.md`, `docs/PERFORMANCE.md`, `docs/todo/roadmap.md`, `docs/specs/ACCORDION_LAZY_MOUNT.md`

  **Estimated scope:** M (4 doc files).

### Checkpoint: Complete
- [x] All spec §5.3 criteria met (or explicitly reported as missed with numbers).
- [x] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [x] Working tree clean; one commit per task on `bug/view-change-slowdown`, unpushed.
- [x] Ready for review — and for 17.2.3, whose baseline is now this task's post-change section.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| First-open measures unsettled content, causing a height jump when `height: auto` takes over (spec R1) | Med | Task 8 measures the jump per width at 1×/4× and has approved latitude to re-measure in `onComplete` and/or retune timing. |
| Post-change numbers miss a gate (e.g. the Probes list can't reach ≤ 50% because ~137 non-accordion boxes remain) | Med | Gates were fixed up front (Q4); a miss is reported with numbers, not re-tuned. The remaining cost is 17.2.3/17.2.5's job by design. |
| Baseline drifts between Task 2 and Task 7 (robot roster grows over a run; machine load) | Med | 3 runs each, medians and ranges, same machine and settings; box-count drift noted, not hidden (`docs/PERFORMANCE.md` already documents the variance). |
| A test-migration edit silently weakens an assertion (spec R4) | Med | Tasks 4–5 require a diff with no changed `expect` line and no deleted test; reviewer checks the diff for `render`→`renderOpen` and nothing else. |
| Task 6 surfaces a failure the prototype run didn't (the prototype rendered on `open`, not `hasOpened`) | Low | Full-suite run is a Task 6 acceptance criterion; new failures are diagnosed, never skipped. |
| The one `CompanyCrudControls` intermittent failure is a real, separate flake | Low | Task 5 settles it with 5 runs both ways and records the outcome in the commit message and (if separate) the backlog. |
| Harness timing steps mutate app state, making later steps non-comparable | Low | Task 1 places per-section opens after the corresponding tile-open step; the tile is remounted by later steps (`back to …`), which resets section state. |

## Open Questions

None blocking. Spec §7's five questions are resolved (Crawford, 2026-09-18). One item to watch rather than decide now: if Task 8's measurements show the deferred first-open animation needs more than the approved timing/easing latitude (e.g. a structural change to how the height is measured), stop and bring it back as a spec amendment rather than expanding the task in place.

---

## As Shipped — deviations from this plan (2026-09-18)

All nine tasks were implemented and committed one by one on `bug/view-change-slowdown`; the suite was green after every task. Where reality differed from the plan above:

- **Task 2 was run twice.** Overlapping background launches collided on the debugging port and left orphaned Chrome processes running the app, contaminating the first batch; it was discarded and re-run sequentially in the foreground with nothing else running. (A first-draft column of 4× "pre" values copied from the discarded batch was caught in a self-check and fixed in its own commit.)
- **Task 3's test is `.tsx`, not `.ts`** (JSX fixtures); spec and plan were updated to match.
- **Task 4/5:** one `AudioRigDrawer` test ("does not auto-open the parent EQ & Filters accordion…") asserts a section stays *closed*, so it keeps plain `render()`. `CompanyCrudControls.test.tsx`'s intermittent failure was outcome (c) — 45/45 in isolation both ways — and turned out to be one of three pre-existing full-suite flakes (`docs/todo/backlog.md` item 29), reproducible on the commit before any of this work.
- **Task 6 corrected a spec claim:** Radix sets `aria-controls` only while open; the RED phase caught the wrong assertion.
- **Task 8 grew to four commits** (harness sampler; wait-for-settle; tween-to-laid-out-height; a frame-rate-independent snap metric) after measuring in real Chrome showed the plain lazy mount regressed the two heaviest sections' open animation from ~12 tween frames to 3. The harness's own first two versions had bugs (a sampler that leaked stale frame loops between toggles; a snap metric that reported a slow-frame artifact as a 2,032 px jump), each found by inspecting raw frames and fixed. Product changes beyond the plan: `FIRST_OPEN_MAX_SETTLE_TICKS` in `accordionAnimation.ts`, and `AccordionContainer.tsx` measuring the inner wrapper's laid-out height. No duration/easing/sequence changed. Full account: spec §8.
- **Task 8's two open items:** the ≤ 2 px criterion has one documented residual (EQ & Filters at 820 px), and Crawford's own look at the open animation on a real device has not happened.
- **Task 7 was re-verified** on the final build after Task 8's changes (all gates still pass; a same-session A/B of the previous and final component showed the changes cost nothing measurable, and separated ~15–35% machine drift from code).
