# Intent: Test Coverage for Untested Core Modules (Roadmap Phase 19)

Confirmed via `interview-me` on 2026-09-27, ahead of a `spec-driven-development` pass.

## Outcome

One combined spec and one combined task file backfill unit tests for the 15 currently-untested modules the roadmap's Phase 19 flags as carrying real, unprotected logic — bringing them to the same regression-protection parity the rest of the codebase already has. `collisionSystem.ts`, the one other module the original source review flagged, needs no action here: it was removed outright on 2026-09-16 (unused, along with its own test file).

## Behavior

- Every file gets tests against its **current, shipped behavior only** — this is a pure backfill, not new functionality and not a refactor. No file under test changes.
- Per-file "done" bar: tests that specifically hit whatever risk the roadmap's own Phase 19 text already named for that file (e.g. `sliderLogMath.ts`'s `min = 0` epsilon-floor edge case, `lfoShared.ts`'s `centeredSwingFromRange` — documented as a real shipped bug twice — and its `connectAdditively` override-disable-then-restore sequence, `factoryVariants.ts`'s explicitly-documented load-bearing PRNG draw order), plus one basic smoke case (renders/computes without throwing on typical input). Not a coverage-percentage target — no coverage gate exists in the repo today (`npm run test:coverage` exists but nothing treats its output as a gate) and this phase doesn't add one.
- The 4 robot shape variants (`RobotAngular`, `RobotIndustrial`, `RobotOrganic`, `RobotSleek`) share one parametrized test file (`describe.each` over the four components), not four separate near-duplicate files — confirmed by inspection that all four share an identical `RobotSVGProps` signature (`colors`, `scale`, `detailLevel`, `shapeParams`, `dimOpacity`).
- The task file is a single flat phase covering all 15 files/modules, each its own independent task (no task depends on another), ending in one shared "Checkpoint: Complete" rather than a per-group checkpoint gate. The 5 informal groupings below organize the task list for readability only — they impose no ordering or dependency.

## Style / constraint

- Follows CLAUDE.md's existing testing stack and convention exactly: Vitest + React Testing Library, colocated test files (`Foo.ts` → `Foo.test.ts`, `Foo.tsx` → `Foo.test.tsx`). Component files (`RobotAngular.tsx` etc., `LocaleView.tsx`) get RTL-based render tests; pure logic/utility files get plain Vitest unit tests. No new dependency, no new test infrastructure.
- One spec, one task file — not 16 separate intent/spec/task trios. Every item here is the same kind of work (backfill tests against stable, unchanging behavior) with no design ambiguity per file, so splitting into per-file spec passes would be pure process overhead.

## Out of scope

- Any behavior change, refactor, or bug fix to the 15 files under test — a bug found incidentally during test-writing gets flagged, not silently fixed in the same task (matches this repo's own TDD-workflow precedent of stopping and reporting rather than quietly expanding scope).
- New coverage tooling or a coverage-percentage threshold/gate.
- `greebleTypes.ts` — confirmed pure type/interface definitions (`RooftopGreeble`, `FacadeGreeble`, `GreebleRendererContext`, etc.), zero runtime logic. Dropped from the file list entirely, not just deprioritized.
- Four separate test files for the robot shape variants (one shared parametrized file instead).
- Per-group checkpoint gates in the task file (one "Checkpoint: Complete" at the end instead).

## Known implementation note (not yet spec'd)

The 5 informal groupings for the task list, carried forward from the original proposal, to be finalized during the spec pass:
- **Audio/engine:** `lfoDrift.ts`, `lfoShared.ts`
- **Utils:** `getSeededVal.ts`, `refs.ts`, `helpers.ts`
- **UI/animation math:** `sliderLogMath.ts`, `accordionAnimation.ts`, `swimAnimation.ts`, `timelineMap.ts`
- **Robot visuals:** `RobotAngular.tsx`/`RobotIndustrial.tsx`/`RobotOrganic.tsx`/`RobotSleek.tsx` (one shared parametrized task)
- **World/actors:** `factoryVariants.ts`, `LocaleView.tsx`

15 files/12 tasks total (the 4 robot variants collapse into 1 task: 15 − 4 + 1 = 12). Exact task-level acceptance criteria per file are left for the spec-driven-development pass.
