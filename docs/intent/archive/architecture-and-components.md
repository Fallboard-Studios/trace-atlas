# Intent: Roadmap Phase 1 — Architecture & Components

Confirmed via `interview-me` on 2026-08-20, against `docs/todo/roadmap.md` item 1.

## Outcome

Build Phase 1 in full:

- `ControlSchema` types in `src/types/controls.ts`
- Test-fixture data only — no real domain config files yet
- All 13 stateless UI primitives in `src/components/ui/`, built **one at a time**, each with a full TDD cycle, in this dependency order:
  1. Button
  2. Toggle
  3. Text Input
  4. Dual Label
  5. Stepper
  6. Stepper with active toggle
  7. Radio Button
  8. Slider — linear
  9. Slider — log
  10. Slider — centered zero
  11. Coords Input (composes Text Input)
  12. Accordion Container
  13. LFO Component (composes multiple primitives; most domain-specific, built last)
- `docs/COMPONENT_LIBRARY.md` documenting the primitive inventory and the `ControlSchema` contract, plus its entry added to CLAUDE.md's reference doc list — per the roadmap item's existing Docs requirement.

## User

The developer (Crawford) — this phase is the foundation later drawer phases (Audio Rig, Sector Settings, Robot Options, etc.) will build on.

## Why now

Phase 0 (LFO engine) just merged (PR #391). Phase 1 is the next roadmap item and needs to land before any drawer/domain wiring begins.

## Success

- All 14 items (types + fixtures + 13 components + doc) exist.
- Full Vitest + Testing Library coverage.
- Every component takes its content/behavior solely through schema props — zero hardcoded labels or domain logic.
- Visually spot-checked against the existing robot editor's live sliders/steppers by eye for comparison only — not by wiring the new primitives into that editor.

## Constraint

No real domain config files (`audioRigConfig.ts`, `robotOptionsConfig.ts`, `sectorSettingsConfig.ts`, etc.) — those stay scoped to their own later phases (4, 5, 9) since those phases haven't defined their fields yet.

## Out of scope

- Swapping new primitives into the existing robot editor (RobotAudioTab/RobotOscillatorsTab) — that swap is Phase 9's job.
- Any Storybook-style demo harness — verification is tests + informal eyeballing against existing UI, not a new preview mechanism.
- Any real domain data beyond test fixtures.

## Downstream

Next step: hand this confirmed intent to `planning-and-task-breakdown` (optionally via `spec-driven-development` first for a written spec) to produce the ordered task list.
