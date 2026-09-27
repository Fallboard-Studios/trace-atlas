# Implementation Plan: Redesign — Robot Detail Top Card

Source spec: [docs/specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md](../specs/ROBOT_DETAIL_TOP_CARD_REDESIGN.md). Source intent: [docs/intent/robot-detail-top-card-redesign.md](../intent/robot-detail-top-card-redesign.md). Touches presentation only (`RobotDisplaySection`) plus one new label schema entry — no `AudioEngine` change, no new Zustand field, no `controls.ts` type change. Both prerequisites this phase reuses (`isRobotAudible`, `AUDIBILITY_LABELS`) already shipped in Roadmap 15.2 — there is no foundation-predicate work here the way [docs/tasks/ROBOT_CARDS_REDESIGN.md](ROBOT_CARDS_REDESIGN.md) needed; this plan is smaller as a direct result.

## Overview

Add a new `status` field-level label schema to `robotSelectionConfig.ts`; restructure `RobotDisplaySection` from its current vertical row stack into a centered-avatar 3-column/2-row grid (Name/Job in row 1, Docking/Status in row 2, all four keeping their `DualLabel` captions) while leaving Battery and Company exactly as they render today; then document the new Status field in `ROBOT_DATA_GRID.md`. Docs land last, once the shipped shape is real and spot-checkable — same convention as every prior task plan in this repo.

## Architecture Decisions

- **The new schema entry (Task 1) ships alone first, even though it's tiny** — same "foundation lands first" precedent [docs/tasks/ROBOT_CARDS_REDESIGN.md](ROBOT_CARDS_REDESIGN.md) used for `isRobotAudible`, scaled down to fit how small this phase's actual foundation is. `RobotDisplaySection.tsx` (Task 2) needs `ROBOT_SELECTION_ROW_SCHEMAS.status` to exist before it can spread it into a `DualLabel`.
- **Battery and Company are asserted, not touched.** The spec's own Scope correction found both already render their labels correctly today via `SliderLinear`/`RadioButton`'s internal `DualLabel` composition. Task 2 includes regression assertions proving this (both labels still present, unchanged, in their existing position) specifically so a future edit to either primitive that accidentally drops the label doesn't go unnoticed — not because this phase has any reason to touch either row itself.
- **The grid restructure is one vertical slice (Task 2), not split into "layout" and "Status wiring" tasks.** They're the same DOM: adding Status as a fifth grid cell and restructuring the other three from a vertical stack into the grid are one coherent markup/CSS change, same reasoning `docs/tasks/ROBOT_CARDS_REDESIGN.md`'s Task 4 used for not splitting its own card restructure from its own new-field wiring.
- **Docs (Task 3) land last**, once the shipped Status label and lore text are both real — same "docs land last" precedent as every prior plan.

## Dependency Graph

```
Task 1 (robotSelectionConfig.ts — ROBOT_SELECTION_ROW_SCHEMAS.status)
    │
    └──→ Task 2 (RobotDisplaySection.tsx/.css — grid restructure + Status wiring)
                    │
                    └──→ Task 3 (docs/reference/ROBOT_DATA_GRID.md — Status field row)
```

## Task List

### Phase 1: Foundation

- [x] **Task 1: `robotSelectionConfig.ts` — add `ROBOT_SELECTION_ROW_SCHEMAS.status`**

  **Description:** Add a new `status` entry to `ROBOT_SELECTION_ROW_SCHEMAS` (spec §1.3): `{ id: 'robotSelection.status', type: 'dualLabel', loreLabel: 'ACOUSTIC EMISSION STATE', humanLabel: 'Status' }`. Flag it as a best-guess draft in a code comment, same convention `AUDIBILITY_LABELS` already uses in this file. `.name`/`.job`/`.docking` are untouched. No other export in this file changes — `AUDIBILITY_LABELS`, `BATTERY_READOUT_SCHEMA`, `JOB_TYPE_LABELS`, `DOCKING_STATE_LABELS` all already exist from Roadmap 15.2/15.1 and need no edits.

  **Acceptance criteria:**
  - [x] `ROBOT_SELECTION_ROW_SCHEMAS.status` exists with non-empty `loreLabel` and `humanLabel` strings.
  - [x] `ROBOT_SELECTION_ROW_SCHEMAS.name`/`.job`/`.docking` are byte-for-byte unchanged.
  - [x] The object literal still satisfies `Record<string, DualLabelSchema>` with no type assertion changes.
  - [x] No other export in `robotSelectionConfig.ts` is modified.

  **Verification:**
  - [x] `npx vitest run src/data/robotSelectionConfig.test.ts` passes — existing `ROBOT_SELECTION_ROW_SCHEMAS` shape assertion extended to cover `.status` alongside `.name`/`.job`/`.docking`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/robotSelectionConfig.ts`, `src/data/robotSelectionConfig.test.ts`

  **Estimated scope:** XS (one config file, one additive key)

### Checkpoint: Foundation schema
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `ROBOT_SELECTION_ROW_SCHEMAS.status` has no consumers yet and no dead-code lint warnings (exported, so this should already be clean).
- [x] Review with human before proceeding.

---

### Phase 2: The card itself

- [x] **Task 2: `RobotDisplaySection` — centered-avatar grid + Status field**

  > **Discovered during implementation:** `src/components/robot/standaloneDualLabelHosts.test.ts` (a TYPE_SCALE.md regression guard, outside this plan's original file list) carried a comment describing `RobotDisplaySection.tsx` as having "only one wrapper class (`.robot-display-section__row`)" — stale once this task removed that class. Fixed alongside (comment only; no assertion in that file referenced the class, so no test logic changed) — same class of downstream-comment surprise `docs/tasks/ROBOT_CARDS_REDESIGN.md`'s own Task 4 found in this same file for the 15.2 sibling change.

  **Description:** Rewrite `RobotDisplaySection.tsx` and `RobotDisplaySection.css` per spec §4. Restructure the avatar plus Name/Job/Docking rows into a `.robot-display-section__grid` (3-column `1fr auto 1fr` / 2-row CSS Grid): avatar in the center column spanning both rows; Name (row 1, col 1) and Job (row 1, col 3) above; Docking (row 2, col 1) and the new Status field (row 2, col 3) below. Each of the four fields keeps its `DualLabel` lore/human caption, stacked above its value (`.robot-display-section__field`, replacing the old `.robot-display-section__row`'s side-by-side layout). Wire Status using the already-shipped `isRobotAudible(audioMode, anySolo)` (note: boolean `anySolo`, not a robots array — the pre-refactor signature in `ROBOT_CARDS_REDESIGN.md`'s own code samples is stale) and `AUDIBILITY_LABELS`, deriving `anySolo` the same boolean-selector way `RobotSelectionCard.tsx` already does. Battery (`SliderLinear`) and Company (`RadioButton`) keep their exact current markup and position directly below the grid — no wrapping `<div>`, no new `DualLabel` (spec's Scope correction: both already compose their own label internally).

  **Acceptance criteria:**
  - [x] Avatar renders centered, spanning both grid rows in the middle column; Name/Job render in row 1 (left/right); Docking/Status render in row 2 (left/right).
  - [x] All four grid fields (Name, Job, Docking, Status) render their `DualLabel` caption (`.sc-dual-label__human` text matching each field's `humanLabel`: "Robot Name", "Job Data", "Docked Status", "Status") — none are bare/unlabeled.
  - [x] Status text reads "Emitting" for an audible robot (`audioMode: 'none'`, no other robot in the locale `solo`) and "Disabled" for a muted robot (`audioMode: 'mute'`), via `isRobotAudible`.
  - [x] Status reflects locale-wide solo: a robot with `audioMode: 'none'` flips from "Emitting" to "Disabled" once another robot in the same locale (added to the store) has `audioMode: 'solo'`, and back once that solo robot is removed/reassigned.
  - [x] Battery's `SliderLinear` still renders its own `.sc-dual-label__human` reading "Battery Data" — unchanged from before this task, at the same position (directly below the grid).
  - [x] Company's `RadioButton` still renders its own `.sc-dual-label__human` reading "Company" — unchanged from before this task, at the same position (directly below Battery), with no wrapping `<div>` around it (removed — it's now a direct child, matching how `SliderLinear` was already a direct child).
  - [x] No `.robot-display-section__row` class remains in `RobotDisplaySection.css` — replaced by `.robot-display-section__grid`/`__field`/`__field--*`.
  - [x] `React.memo` wrapping (`RobotDisplaySection = memo(RobotDisplaySectionInner)`) is unchanged.

  **Verification:**
  - [x] `npx vitest run src/components/robot/RobotDisplaySection.test.tsx` passes (23/23) — the existing "renders Name/Job/Docking as plain text" test updated for 4 values (Name/Job/Docking/Status) instead of 3; existing Battery and company-assignment tests pass with no logic changes; new tests cover Status audibility (both the simple mute case and the locale-wide-solo case) and the DualLabel-caption-presence assertion for all four fields plus the Battery/Company label-regression checks.
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.
  - [x] Full suite: `npx vitest run` — 143/143 files, 2712/2712 tests, including the retargeted comment in `standaloneDualLabelHosts.test.ts` noted above. No component asserted on the old DOM shape.
  - [x] `npm run build` clean.
  - [x] Manual check (spec §5): `npm run dev`, open Robot Options for any robot. Confirm avatar centered with Name/Job above (left/right) and Docking/Status below (left/right), each with a visible caption above its value; Battery slider and Company picker render below, unchanged. Resize to the narrowest supported width and confirm no field's text overflows its column illegibly. Set one robot's Audio Setting to Solo (via a different robot's Robot Options) and confirm this robot's own Status flips to "Disabled." — confirmed by Crawford.

  **Dependencies:** Task 1 (`ROBOT_SELECTION_ROW_SCHEMAS.status`). External (already shipped, no task here): `isRobotAudible` (`src/utils/robotAudibility.ts`), `AUDIBILITY_LABELS` (Roadmap 15.2).

  **Files:** `src/components/robot/RobotDisplaySection.tsx`, `src/components/robot/RobotDisplaySection.css`, `src/components/robot/RobotDisplaySection.test.tsx`; plus, discovered during implementation: `src/components/robot/standaloneDualLabelHosts.test.ts` (comment only)

  **Estimated scope:** M (3 files, the full vertical slice of the redesign)

### Checkpoint: Card shipped
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Manual pass (Task 2's own manual check) confirms the redesigned card end-to-end, including the locale-wide Solo → Disabled behavior and the narrow-width text-overflow check — confirmed by Crawford.
- [x] No remaining reference anywhere in `src/` to `.robot-display-section__row` (grep-confirmed).
- [x] Review with human before proceeding.

---

### Phase 3: Docs

- [x] **Task 3: `docs/reference/ROBOT_DATA_GRID.md` — Status field row**

  **Description:** Append one row to the confirmed table (not the Draft table — this is a field, matching the shape of "Docked Status"/"Company" above it, per spec §6), flagged inline as unconfirmed since its lore label is this phase's own best guess:

  | English Label | Lore Label | Component | Min Value | Max Value | Has LFO | Notes |
  |---|---|---|---|---|---|---|
  | Status | ACOUSTIC EMISSION STATE *(draft, unconfirmed)* | Dual Label Component | N/A | N/A | No | Display only. True audibility (`isRobotAudible`) — Robot Options' own Status field, Roadmap 15.3. Values: Emitting, Disabled (see Draft table below) |

  **Acceptance criteria:**
  - [x] Row appended to the confirmed table, same column shape as its neighbors, with the "draft, unconfirmed" flag on the Lore Label cell.
  - [x] `Lore Label`/`English Label` values match `ROBOT_SELECTION_ROW_SCHEMAS.status`'s actual shipped `loreLabel`/`humanLabel` exactly (spot-checked against Task 1's final code).

  **Verification:**
  - [x] Manual review — spot-checked against the shipped `robotSelectionConfig.ts`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change, no behavioral impact — `npm test`/`npm run build` already verified clean against the same unchanged source at the prior checkpoint).

  **Dependencies:** Task 1 (documents its final values), Task 2 (documents the shipped consumer).

  **Files:** `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 3 tasks are met, including the manual browser check under Task 2 — confirmed by Crawford.
- [x] `docs/reference/ROBOT_DATA_GRID.md` reflects the shipped Status field.
- [x] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `isRobotAudible` is called with the stale pre-refactor signature (`localeRobots: Robot[]`) instead of the current `(audioMode, anySolo: boolean)` — easy mistake if copying from `ROBOT_CARDS_REDESIGN.md`'s own code samples, which predate the perf-fix refactor | High if it happens — a type error at best, a silent wrong-behavior bug at worst if a stale array-shaped value is coerced | Spec explicitly calls this out (§1.2, §3); Task 2's description repeats the warning inline rather than assuming it's remembered from the spec alone; `npm run build:types` will catch a literal type mismatch regardless |
| The Battery/Company "no change needed" assumption (this spec's own Scope correction) turns out wrong once actually touched — e.g. some other recent change altered `SliderLinear`/`RadioButton`'s internal label composition since this was last verified | Medium — would mean silently shipping a card missing a label, the exact class of bug the Scope correction was written to prevent | Task 2's acceptance criteria explicitly require regression assertions proving both labels are still present and unchanged, not just an assumption carried from the spec — if either fails, that's a signal to stop and re-verify against the live primitive, not silently patch around it |
| The new 3-column grid text (especially Job's/Status's `humanLabel`+value pairs) overflows illegibly at the narrowest supported mobile width — no existing precedent in this codebase for a 2-sided grid this narrow | Medium — a real, user-visible legibility bug, but low technical risk to fix (CSS-only) | Task 2's manual check explicitly includes a narrow-width resize pass, called out separately from the rest of the manual check rather than folded in silently |
| Some other component renders `RobotDisplaySection` and asserts on its old DOM shape (`.robot-display-section__row`, `__value` count) the way `RobotsTab.test.tsx`/`standaloneDualLabelHosts.test.ts` did for `RobotSelectionCard` in the 15.2 plan | Low-Medium — `RobotDisplaySection` has one real consumer (`RobotOptionsTab.tsx`); grep during implementation should confirm quickly, but the 15.2 precedent shows this class of surprise is real in this codebase | Task 2's verification step explicitly includes a full-suite run (`npx vitest run`), not just the component's own test file, to surface any such downstream assertion the same way 15.2's Task 4 discovered its own two |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **Grid column/row proportions and gap sizing** — the spec's own CSS is a starting point, not a pixel-perfect mandate. Revisit after Task 2's manual check if the 96px avatar feels cramped against narrow-column text.
2. **Left/right text alignment** (Name/Docking left, Job/Status right) — a cosmetic default, flagged for Crawford's visual review; trivial to flip in CSS alone if it reads wrong once actually rendered.
3. **Status's lore label ("ACOUSTIC EMISSION STATE") and the Task 3 docs row** are both unconfirmed drafts, same status as every other best-guess lore label in `robotSelectionConfig.ts` — pending Crawford's review, not blocking implementation.
