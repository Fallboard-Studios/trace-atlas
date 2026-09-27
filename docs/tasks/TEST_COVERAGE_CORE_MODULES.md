# Implementation Plan: Test Coverage for Untested Core Modules (Roadmap Phase 19)

Source spec: [docs/specs/TEST_COVERAGE_CORE_MODULES.md](../specs/TEST_COVERAGE_CORE_MODULES.md). Source intent: [docs/intent/test-coverage-core-modules.md](../intent/test-coverage-core-modules.md). Roadmap: [docs/todo/roadmap.md § 19](../todo/roadmap.md#19-test-coverage-untested-core-modules).

**Correction to the intent/spec docs' own file count:** both say "15 files/14 tasks" — an arithmetic slip. 15 target files collapse to **12 test files / 12 tasks** once the 4 robot shape variants share one file (15 − 4 + 1 = 12, not 14). Confirmed by re-counting the spec's own §2 Target File Structure listing. No other content changes; this doesn't affect scope, only the task count.

## Overview

12 independent tasks, one per new test file, backfilling unit tests for 15 currently-untested production files (9 single-file tasks, 1 task covering 4 robot shape variants in one shared parametrized file, 2 more single-file tasks). Every task is a leaf — none depends on another finishing first, since each targets a different, currently-stable production file with no shared state between tasks. There is one flat phase and a single "Checkpoint: Complete" at the end, per the confirmed intent (no per-group gates). Tasks are grouped below into the same 5 informal headings the spec uses, for readability only — the grouping implies no ordering.

## Architecture Decisions

- **No dependency graph needed.** Every task reads its own target file plus already-existing, unmodified test infrastructure (`vitest.setup.ts`'s global GSAP mock, `lfoEngine.test.ts`'s established Tone-mocking pattern). No task's test file imports another task's test file, and no task modifies a file another task also touches. This is the degenerate case of a dependency graph — 12 disconnected nodes — so §"Dependency Graph" below is a flat list rather than a tree.
- **Tasks can run in any order, including fully in parallel across sessions.** Ordering below (grouped by area) is for human readability while reviewing, not a build requirement.
- **Zero production-code changes is enforced per-task, not just at the end.** Each task's acceptance criteria include an explicit "no production file modified" check, so a task that discovers a real bug reports it (Risks table, below) rather than quietly fixing it and blending the fix into a test-only commit.
- **One commit per task**, matching this repo's own TDD-workflow convention — each task's new test file lands as its own commit once its acceptance criteria and verification steps pass.

## Dependency Graph

```
Task 1 (lfoShared.test.ts)        Task 2 (lfoDrift.test.ts)*
Task 3 (getSeededVal.test.ts)     Task 4 (refs.test.ts)
Task 5 (helpers.test.ts)          Task 6 (sliderLogMath.test.ts)
Task 7 (accordionAnimation.test.ts)  Task 8 (swimAnimation.test.ts)
Task 9 (timelineMap.test.ts)      Task 10 (robotShapeVariants.test.tsx)
Task 11 (factoryVariants.test.ts) Task 12 (LocaleView.test.tsx)

  — all 12 are independent leaves; no edges —

* Task 2 imports real (unmocked) lfoShared.ts internally, but does not
  depend on Task 1 having been done first — lfoShared.ts is already
  shipped, stable production code either way.
```

## Task List

### Backfill tests (one flat phase — order below is for readability only)

#### Audio / Engine

- [x] **Task 1: `lfoShared.test.ts` — pure helpers + `connectAdditively`/`isAudioContextRunning`**

  **Description:** New `src/engine/lfoShared.test.ts`. `clamp`/`centeredSwingFromRange` are pure and need no mocking; `isAudioContextRunning` needs a `Tone.getContext` stub; `connectAdditively` uses plain fake Signal-like/Param-like destination objects plus a `connect` spy on the source, per spec §3.1/§5.1.

  **Acceptance criteria:**
  - [x] `clamp`: below-range, above-range, and in-range inputs all return the expected clamped value.
  - [x] `centeredSwingFromRange`: a value near `min` gets a swing bounded by its distance to `min`; a value near `max` gets a swing bounded by its distance to `max`; a value at the midpoint gets `±halfSpan` (half the total range).
  - [x] `centeredSwingFromRange` with a non-finite `currentValue` (`NaN`, `Infinity`) returns `{ min: 0, max: 0 }` — the named risk from the file's own comment ("connecting an LFO whose output is NaN poisons the live Web Audio graph").
  - [x] `isAudioContextRunning` returns `true` when `Tone.getContext()` reports `{ state: 'running' }`, `false` for `'suspended'`, and `false` (not a thrown error) when `Tone.getContext` itself throws.
  - [x] `connectAdditively`: `destination.override` is set to `false` before `.connect()` fires; the destination's pre-connect `value` is restored after `.connect()`; a non-finite pre-connect value is **not** written back.
  - [x] No production file modified.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoShared.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/lfoShared.test.ts`

  **Estimated scope:** S (one new file, pure functions plus one light Tone stub)

- [x] **Task 2: `lfoDrift.test.ts` — drift pools, attach/detach, silence guard, suppression**

  **Description:** New `src/engine/lfoDrift.test.ts`, `vi.mock('tone', ...)` reusing `lfoEngine.test.ts`'s established fake (`LFO`/`Gain` with Signal-like/Param-like connect-reset simulation). Real (unmocked) `lfoShared.ts` runs underneath. Per spec §3.1.

  **Acceptance criteria:**
  - [x] `driftGroupForTarget`: `'eq3.'`/`'lpf.'`/`'hpf.'`-prefixed targets route to `'eq3'`/`'filterLPF'`/`'filterHPF'`; anything else routes to `'robots'`.
  - [x] `attachDrift` on a fresh key creates a link (verified via a subsequent successful `refreshRateDriftGain`/`refreshDepthDriftGain` call); calling it twice for the same key is idempotent — **mutation-tested**: removing `lfoDrift.ts`'s own `if (driftLinks.has(key)) return;` guard was caught by asserting no second `Gain` pair is constructed (an earlier draft of this assertion checked `Tone.LFO` call counts instead, which passed even with the guard removed — `getOrCreateDriftPool`'s own separate idempotency masked it; fixed to check the actual thing the guard protects).
  - [x] `detachDrift` on an unlinked key is a safe no-op; on a linked key it disconnects and disposes both Gains and removes the key (a subsequent refresh call for that key becomes a no-op again).
  - [x] **Named risk — depth silence guard:** a primary with `amplitude.value <= 0` has `depthDriftConnected === false` (disconnecting if it was previously connected); a primary with `amplitude.value > 0` connects lazily only on the 0→nonzero transition, and its Gain value follows `globalDepthDriftByGroup[group] * swing.max`.
  - [x] `setGlobalRateDrift`/`setGlobalDepthDrift` clamp to `[-1, 1]`, refresh only links in the given group (a link in a different group is provably untouched), and are safe no-ops with zero links in the target group.
  - [x] `setDriftSuppressed(true)` detaches every currently-linked key; `attachDrift` while suppressed is a no-op; `setDriftSuppressed(false)` clears the flag only (does not itself re-attach anything); `isDriftSuppressed()` reflects the current flag.
  - [x] A group's drift pool is built lazily on first `attachDrift` for that group and reused (not rebuilt) on a second `attachDrift` in the same group — verified per-group (`eq3`=3, `filterLPF`=2, `filterHPF`=2, `robots`=8), each group's pool sized and built independently.
  - [x] No production file modified — confirmed via `git diff --exit-code` after the mutation check above, not just self-report.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoDrift.test.ts` passes (16 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (imports real `lfoShared.ts`, which is stable, unmodified production code).

  **Files:** `src/engine/lfoDrift.test.ts`

  **Estimated scope:** M (one new file, but the most involved mock setup of the 12 tasks — reuses, doesn't invent, `lfoEngine.test.ts`'s fake)

#### Utils

- [x] **Task 3: `getSeededVal.test.ts` — determinism + range remap**

  **Description:** New `src/utils/getSeededVal.test.ts`. Per spec §3.2.

  **Acceptance criteria:**
  - [x] `precomputeDataX(dataId)` is deterministic: same `dataId` (and same mocked seed-override state) produces the same output on repeated calls; a different `dataId` produces a different output.
  - [x] Mocking `getGlobalAttenuationStyleSeedOverride()` to two different values, with the same `dataId`, produces two different `precomputeDataX` outputs — proves the override is actually folded into the key, not ignored.
  - [x] `getSeededVal(noiseMap, dataId, offset, min, max)` with a stub `noiseMap` returning a fixed value: `-1 → min`, `1 → max`, `0 → (min+max)/2`.
  - [x] Default `offset`/`min`/`max` (`0`/`0`/`1`) behave as documented.
  - [x] No production file modified.

  **Verification:**
  - [x] `npx vitest run src/utils/getSeededVal.test.ts` passes (7 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/getSeededVal.test.ts`

  **Estimated scope:** S

- [x] **Task 4: `refs.test.ts` — full `Map`-wrapper contract**

  **Description:** New `src/utils/refs.test.ts`. Trivial wrapper, but currently has zero coverage; full contract per spec §3.2.

  **Acceptance criteria:**
  - [x] `setRef`/`getRef` round-trip for a given key.
  - [x] `getRef` on an unset key returns `undefined`.
  - [x] `deleteRef` removes a key (subsequent `getRef` is `undefined`) and is a safe no-op on an already-absent key.
  - [x] `clearRefs` empties the registry — `getRef` for any previously-set key returns `undefined` afterward.
  - [x] No production file modified.

  **Verification:**
  - [x] `npx vitest run src/utils/refs.test.ts` passes (5 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/refs.test.ts`

  **Estimated scope:** XS (one file, ~4 trivial assertions)

- [x] **Task 5: `helpers.test.ts` — `swallow`/`devWarn`/`getScreenViewportDomNode`**

  **Description:** New `src/utils/helpers.test.ts`. `devWarn`'s `DEV_TUNING` gate needs a per-test `vi.doMock('../constants', ...)` + `vi.resetModules()` + dynamic re-import for both branches (a plain top-level `vi.mock` can't vary per-test), per spec §3.2.

  **Acceptance criteria:**
  - [x] `swallow(err, ctx)` calls `console.warn` (spy) with a message containing `ctx` when provided, and the `'ignored error'` fallback when `ctx` is omitted.
  - [x] `swallow` does not itself throw even when the mocked `console.warn` is set to throw (the file's own defensive `try/catch`).
  - [x] `devWarn(...)` calls `console.warn` when `DEV_TUNING` is mocked `true`, and does not call it when mocked `false` — **mutation-tested**: removing the `if (DEV_TUNING)` gate in `helpers.ts` was caught by the false-branch test.
  - [x] `getScreenViewportDomNode()` returns the element when a DOM node with `id="screen-viewport"` exists (jsdom), and `null` when it doesn't.
  - [x] No production file modified — confirmed via `git diff --exit-code` after the mutation check.

  **Verification:**
  - [x] `npx vitest run src/utils/helpers.test.ts` passes (7 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/helpers.test.ts`

  **Estimated scope:** S (one file, two small per-test mocks for the `DEV_TUNING` branches)

#### UI / Animation Math

- [x] **Task 6: `sliderLogMath.test.ts` — epsilon-floor curve, `min = 0` edge case**

  **Description:** New `src/components/ui/controls/sliderLogMath.test.ts`. Per spec §3.3.

  **Acceptance criteria:**
  - [x] `sliderLogValueToT(value, min, max)` with `value <= min` returns exactly `0` — **named risk:** `sliderLogValueToT(0, 0, 100)` must be `0`, not `NaN`/`-Infinity` from a raw `log(0/floor)`.
  - [x] `sliderLogValueToT(max, min, max)` returns exactly `1`.
  - [x] `sliderLogTToValue(t, min, max)` with `t <= 0` returns exactly `min` — **named risk**, same `min = 0` case: must return exactly `0`, not `LOG_EPSILON` or `NaN`.
  - [x] `sliderLogTToValue(1, min, max)` returns `max`.
  - [x] Round-trip: for 2 `(min, max)` pairs (including `min = 0`) and 5 sample values each between `min` and `max`, `sliderLogTToValue(sliderLogValueToT(v, min, max), min, max) ≈ v` (within floating-point tolerance).
  - [x] No production file modified.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/sliderLogMath.test.ts` passes (6 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/sliderLogMath.test.ts`

  **Estimated scope:** S

- [x] **Task 7: `accordionAnimation.test.ts` — reduced-motion branching + documented invariants**

  **Description:** New `src/components/ui/controls/accordionAnimation.test.ts`. Per spec §3.3.

  **Acceptance criteria:**
  - [x] `getAccordionDuration(true)` returns `0`; `getAccordionDuration(false)` returns `ACCORDION_DURATION` (`0.25`).
  - [x] `getAccordionFadeDuration(true)` returns `0`; `getAccordionFadeDuration(false)` returns `ACCORDION_FADE_DURATION` (`0.15`).
  - [x] `ACCORDION_FADE_DURATION < ACCORDION_DURATION` (pins the file's own "fade is sequenced, never simultaneous" invariant).
  - [x] `FIRST_OPEN_MAX_SETTLE_TICKS` is a positive integer.
  - [x] No production file modified.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/accordionAnimation.test.ts` passes (6 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/accordionAnimation.test.ts`

  **Estimated scope:** XS

- [x] **Task 8: `swimAnimation.test.ts` — no-ref path, timeline replacement, offset math, propeller count**

  **Description:** New `src/animation/swimAnimation.test.ts`. Runs against `vitest.setup.ts`'s global GSAP mock; uses real `refs.ts`/`timelineMap.ts` (unmocked) to register a fake ref and observe timeline replacement. Per spec §3.3.

  **Real gap found in shared test infrastructure, not in `swimAnimation.ts`:** `createSwimTimeline` calls `tl.play()` (it builds the timeline `paused: true` so it can register it via `setTimeline` before anything plays, then plays it right before returning) — no prior consumer's test exercised this call, so `vitest.setup.ts`'s global GSAP mock had no `.play()` method, same masking pattern as its own documented `.kill()`/`.set()` gaps. Per spec §4 ("touch `vitest.setup.ts` only... to add a mock that must be global"), added `play: () => obj as TimelineObj` to the mock (+ the `TimelineObj` interface), with a comment matching the file's existing style. **Full suite re-run after the change: 183 files / 3858 tests, all green** — confirmed safe before proceeding, not just assumed.

  **Acceptance criteria:**
  - [x] Calling `createSwimTimeline` for a robot id with no registered ref does not throw, returns a timeline (the GSAP mock's shape), and — when `onComplete` is supplied — schedules it via the mocked `gsap.delayedCall` (assert `delayedCall` was called with the estimated duration and the callback; per `vitest.setup.ts`'s own mock, it does **not** auto-fire, unlike `.timeline()`'s `onComplete`).
  - [x] With a real ref registered (via `setRef`) and a prior timeline already stored under `` `swim-${robot.id}` ``, calling `createSwimTimeline` again removes the prior timeline from `timelineMap` (`killTimeline` was called) and registers the new one under the same key.
  - [x] **Named risk — absolute vs. relative offsets:** when `targetDirection` differs from the robot's current `direction` (a flip is needed), the propulsion tween's start offset is `ORIENTATION_DURATION - PROPULSION_OVERLAP`, not `0` — **mutation-tested**: hardcoding `propulsionStart = 0` in `swimAnimation.ts` was caught by this assertion.
  - [x] With a fake ref whose `.querySelector('.propeller')` returns an element, the propeller tween's `repeat` value is `Math.ceil(duration / PROPELLER_ROTATION_SPEED) - 1`.
  - [x] With no `.propeller` child present, no propeller tween is attempted and nothing throws.
  - [x] `calculateDuration`'s output (exercised indirectly) matches `distance / SWIM_SPEED` for a known (diagonal) `from`/`to` pair.
  - [x] No production file modified — `swimAnimation.ts` confirmed via `git diff --exit-code` after the mutation check; `refs.ts`/`timelineMap.ts` used read/write only. `vitest.setup.ts` was modified, deliberately and within the spec's own allowance (above).

  **Verification:**
  - [x] `npx vitest run src/animation/swimAnimation.test.ts` passes (7 tests).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full `npx vitest run` (whole suite): 183 files / 3858 tests, all green after the `vitest.setup.ts` change.

  **Dependencies:** None.

  **Files:** `src/animation/swimAnimation.test.ts`, `vitest.setup.ts` (added a missing `.play()` no-op to the global GSAP mock — see above)

  **Estimated scope:** M (one file, but several distinct behaviors — no-ref path, replacement, offset math, propeller count — each needs its own fake-ref/DOM setup)

- [x] **Task 9: `timelineMap.test.ts` — registry lifecycle**

  **Description:** New `src/animation/timelineMap.test.ts`. Runs against the global GSAP mock; construct fake timelines via the mocked `gsap.timeline()`. Per spec §3.3.

  **Acceptance criteria:**
  - [x] `setTimeline`/`getTimeline` round-trip for a given id.
  - [x] `setTimeline` on an id already present calls `.kill()` on the *previous* timeline before overwriting it — **mutation-tested**: removing `setTimeline`'s own `existing.kill()` call was caught.
  - [x] `killTimeline` on a present id calls `.kill()` and removes the entry (`getTimeline` afterward is `undefined`); on an absent id it's a safe no-op.
  - [x] `killAllTimelines` calls `.kill()` on every entry and empties the map (`timelineMap.size === 0`, `getTimeline` for any previously-set id is `undefined`).
  - [x] No production file modified.

  **Verification:**
  - [x] `npx vitest run src/animation/timelineMap.test.ts` passes (5 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/animation/timelineMap.test.ts`

  **Estimated scope:** S

#### Robot Visuals

- [x] **Task 10: `robotShapeVariants.test.tsx` — one shared parametrized file for all 4 variants**

  **Description:** New `src/components/robot/robotShapeVariants.test.tsx`, `describe.each` over `RobotAngular`/`RobotIndustrial`/`RobotOrganic`/`RobotSleek` — confirmed by direct read that all four share an identical `RobotSVGProps` contract and the same `detailLevel`/`dimOpacity`/`.propeller` behavior. Per spec §3.4/§5.3. **One file for four production files — do not split into four test files.** Every `render()` call wraps its component in `<svg>...</svg>`, matching the established convention in `Robot.test.tsx`/`RobotBody.test.tsx` — a bare root `<g>` triggers a harmless-but-noisy "unrecognized tag" jsdom warning otherwise.

  **Acceptance criteria:**
  - [x] Each of the 4 variants renders without throwing given typical `colors`/`scale`/`detailLevel` props.
  - [x] Each variant renders its `.details`-classed group only when `detailLevel > 0.5` (assert both `detailLevel = 0.5` → absent and `detailLevel = 0.6` → present — the guard is a strict `>`) — **mutation-tested** (on `RobotAngular`, representative of all 4): changing `detailLevel > 0.5` to `>= 0.5` was caught by the `0.5` case.
  - [x] Each variant applies `dimOpacity` (default `1` when omitted) as the `opacity` attribute on its viewport group(s) — assert both the default and an explicit non-default value (`0.4`). (Selector note: `[opacity="1"]` uniquely identifies the dimOpacity group in the default case — every other opacity attribute in these components is a static decorative value below 1.)
  - [x] Each variant's root `<g transform="scale(...)">` reflects `scale * (1 + scaleBias)` — default (no `shapeParams`, `scaleBias = 0`) produces `scale(${scale})`; a supplied `scaleBias` changes the rendered value predictably.
  - [x] Each variant renders a `.propeller`-classed element (the element `swimAnimation.ts`'s own code queries for).
  - [x] No production file modified (`RobotAngular.tsx`/`RobotIndustrial.tsx`/`RobotOrganic.tsx`/`RobotSleek.tsx` all read-only) — confirmed via `git diff --exit-code` after the mutation check.

  **Verification:**
  - [x] `npx vitest run src/components/robot/robotShapeVariants.test.tsx` passes (24 tests — 6 per variant × 4).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/robot/robotShapeVariants.test.tsx`

  **Estimated scope:** M (one file, but exercises 4 production components via `describe.each` — more assertions than a typical S task, no new mocking complexity)

#### World / Actors

- [x] **Task 11: `factoryVariants.test.ts` — bubble eligibility, variant weighting, seeded determinism**

  **Description:** New `src/components/actors/factoryVariants.test.ts`. Per spec §3.5.

  **Open Question 1 resolved:** pinned a literal regression snapshot (`toMatchInlineSnapshot()`, Vitest-populated via `-u` from real output, then re-run unpinned to confirm stability) rather than only the weaker determinism property — the stronger guard for the file's own "PRNG draw order must not change" warning.

  **Acceptance criteria:**
  - [x] `isBubbleEligible`: each of the 4 `BUBBLE_PURPOSES` (`heavyIndustry`, `chemicalProcessing`, `pipeWorks`, `storageLogistics`) returns `true`; `observationComms` returns `false`; `undefined` returns `true` (documented fallback).
  - [x] `getVariantFromNoise`: with the default 5-variant list, a `noiseValue` near `0` resolves to `Monolith` (first/heaviest-weighted) and near `1` resolves to `Warehouse` (last); a custom shorter `availableTypes` list re-weights correctly per the triangular-number weighting; a `noiseValue` of exactly `1` still resolves to the last entry via the final fallback `return`, not `undefined`.
  - [x] **Named risk — PRNG draw order:** calling `selectVariantFromSeed` twice with an identical `(actorId, x, row)` produces byte-identical output on every field (determinism), plus one pinned known-seed snapshot — **mutation-tested**: swapping the `hueShift`/`satShift` draw order (lines 231–232) was caught by the pinned snapshot.
  - [x] `frontCornerX` is always an integer in `[25, 75]` inclusive, checked across 5 different seeds.
  - [x] `beltCourseCount` is `0` when the resolved variant's `maxBeltCourses` is `0` (`Warehouse`, forced via a single-entry `availableTypes`), and otherwise an integer in `[0, maxBeltCourses]` (checked against `Skyscraper`'s `maxBeltCourses: 3`, across 5 seeds).
  - [x] No production file modified — confirmed via `git diff --exit-code` after the mutation check.

  **Verification:**
  - [x] `npx vitest run src/components/actors/factoryVariants.test.ts` passes (15 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/actors/factoryVariants.test.ts`

  **Estimated scope:** M (one file, several distinct pure functions plus a determinism/regression check)

- [x] **Task 12: `LocaleView.test.tsx` — existence guard + prop pass-through**

  **Description:** New `src/components/panels/screen/worldView/LocaleView.test.tsx`. Mocks `@/stores/localeStore`'s `useLocaleStore` and `./OceanScene` (asserting `OceanScene` receives `localTime`). Per spec §3.5.

  **Acceptance criteria:**
  - [x] With `localeId` present in the mocked store's `locales` map, renders the `.locale-view` wrapper and the mocked `OceanScene` with the passed-through `localTime` prop.
  - [x] With `localeId` absent from `locales`, renders nothing (`null`) and `OceanScene` is never invoked — **mutation-tested**: removing the `if (!localeExists) return null;` guard was caught.
  - [x] The mocked store selector returns a plain boolean (matching the real `localeId in s.locales` shape) — no assertion needed on *why* this avoids extra re-renders, just that the mock's shape matches production.
  - [x] No production file modified — confirmed via `git diff --exit-code` after the mutation check.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/worldView/LocaleView.test.tsx` passes (2 tests).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/worldView/LocaleView.test.tsx`

  **Estimated scope:** S

### Checkpoint: Complete
- [x] All 12 new test files pass individually (`npx vitest run <file>` for each).
- [x] Full `npm test` is clean: 187 files / 3904 tests, all green — 12 new files added, zero regressions to the existing suite. **No pre-existing flaky failures hit on this run** (the known `audioSwells.test.ts`/`CompanyCrudControls.test.tsx`/`factoryPlacementSystem.test.ts` intermittent-under-parallel-run failures — `docs/todo/backlog.md` item 15 — happened not to reproduce this run; still a known, unrelated intermittency, not something this phase fixed).
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [x] Zero production files were modified across all 12 tasks — verified by `git diff --name-only main...tests/core-modules-coverage`, not just each task's own self-report. The one non-test file this branch touches is `vitest.setup.ts` (Task 8's deliberate, spec-permitted `.play()` mock addition).
- [x] No real production bug was found during test-writing — every mutation check targeted the test's own assertion strength, not a live discrepancy between shipped behavior and its own documentation/comments. The one real finding (`vitest.setup.ts`'s missing `.play()`) is a test-infrastructure gap, not a production bug, and was fixed within the spec's own explicit allowance rather than left open.
- [ ] Reviewed with human before merge.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Writing a test for a file surfaces a real, pre-existing bug (e.g. an off-by-one in `factoryVariants.ts`'s weighting, or a genuine edge case `sliderLogMath.ts` doesn't actually handle correctly) | Medium | Per the confirmed intent, a found bug is reported and left for a separate, explicitly-scoped fix — never patched silently inside this phase's test-only commits. Each task's Checkpoint criteria include "no production file modified" specifically to catch scope creep here. |
| `lfoDrift.test.ts` (Task 2)'s Tone mock drifts out of sync with `lfoEngine.test.ts`'s own fake if that file changes after this task is written, since both fakes simulate the same Tone connect/reset behavior independently | Low | Task 2 explicitly reuses `lfoEngine.test.ts`'s fake shape rather than writing a divergent one; if a future edit to `lfoEngine.test.ts`'s fake fixes a bug in the simulation, `lfoDrift.test.ts` should be revisited — flagged here so it isn't forgotten, not because it's expected to happen during this phase. |
| `robotShapeVariants.test.tsx` (Task 10)'s shared-file approach means a future 5th robot variant, or a variant that legitimately diverges from the shared contract, has nowhere obvious to add a divergent test | Low | Not a risk to this phase (only 4 variants exist today, confirmed identical) — noted so a future contributor doesn't fight the shared-file structure if a real divergence appears; splitting one variant back out to its own file at that point is a small, contained change. |
| `swimAnimation.test.ts` (Task 8)'s assertions about GSAP `.to()` call arguments are coupled to `vitest.setup.ts`'s current mock shape, which could change for unrelated reasons (e.g. a future task adding a new mocked method) | Low | Task 8's own acceptance criteria are written against the mock's *documented* behavior (its own code comments), not incidental details; if the global mock's shape changes, `swimAnimation.test.ts` would need updating regardless of when that happens — not specific to being built in this phase. |

## Open Questions

Carried forward from the spec (§7), both non-blocking:

1. **`selectVariantFromSeed`'s regression-snapshot pin (Task 11).** The spec leaves it open whether to pin one full known-seed output as a literal snapshot object versus asserting only the weaker "same input twice → identical output" determinism property. **Left to Task 11 to decide** — a literal pin is the stronger guard against the file's own "PRNG draw order must not change" warning, but is more brittle if the schema legitimately changes later.
2. **`swimAnimation.test.ts`'s `gsap.delayedCall` assertion (Task 8).** Depends on `vitest.setup.ts`'s mock continuing to *not* auto-fire `delayedCall` (unlike `.timeline()`'s `onComplete`). This is true today and documented in the setup file's own comment. **Task 8 should re-read `vitest.setup.ts` directly before writing this assertion**, rather than trusting this plan's description of it, in case the mock has changed since this plan was written.
