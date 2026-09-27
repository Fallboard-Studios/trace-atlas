# Implementation Plan: Redesign — Robot Cards

Source spec: [docs/specs/ROBOT_CARDS_REDESIGN.md](../specs/ROBOT_CARDS_REDESIGN.md). Source intent: [docs/intent/robot-cards-redesign.md](../intent/robot-cards-redesign.md). Touches presentation (`RobotSelectionCard`) plus one small, pure-logic extraction (the shared audibility predicate) — no `AudioEngine` scheduling behavior change, no new Zustand field, no schema/type change.

## Overview

Extract the mute/solo audibility rule out of `AudioEngine.ts`'s inline `triggerWithCap` check into one shared, exported `isRobotAudible` function; refactor the engine to call it; add the new `AUDIBILITY_LABELS` value map and drop two now-dead `ROBOT_SELECTION_ROW_SCHEMAS` entries; then restructure `RobotSelectionCard` into its two-region shape (a clickable top half with the avatar/meta text/battery slider, a plain bottom half with just the company picker), consuming both. Docs land last, once the shipped shape is real and spot-checkable.

## Architecture Decisions

- **The shared predicate ships alone, first, with its own tests, before anything consumes it.** Same "foundation lands first" precedent [docs/tasks/LFO_CONSOLIDATED_DISPLAY.md](LFO_CONSOLIDATED_DISPLAY.md) and [docs/tasks/SLIDER_LINEAR_READ_ONLY.md](SLIDER_LINEAR_READ_ONLY.md) both used — nothing about `isRobotAudible`'s own correctness depends on either of its two call sites.
- **The `AudioEngine.ts` refactor (Task 2) and the config changes (Task 3) are independent of each other and can land in either order, or in parallel, once Task 1 exists.** Task 2 touches only `AudioEngine.ts`; Task 3 touches only `robotSelectionConfig.ts`. Neither reads the other's file. Both must land before Task 4, which consumes both.
- **Task 2 is verified by proving *nothing changed*, not by asserting new behavior.** The whole point of extracting `isRobotAudible` is that `AudioEngine.test.ts`'s existing mute/solo assertions keep passing completely unmodified — that's the acceptance criterion, not a new test.
- **The card restructure (Task 4) is one vertical slice, not split into "markup" and "styles" tasks.** `RobotSelectionCard.tsx`/`.css`/`.test.tsx` change together as one coherent unit — same reasoning `docs/tasks/SLIDER_LINEAR_READ_ONLY.md`'s Architecture Decisions used for not splitting implementation from its own colocated tests.
- **Docs (Task 5) land last**, once `AUDIBILITY_LABELS`'s final values and the shipped card are both real, matching the "docs land last" precedent in every prior task plan in this repo.

## Dependency Graph

```
Task 1 (isRobotAudible + its own test)
    │
    ├──→ Task 2 (AudioEngine.ts — triggerWithCap calls isRobotAudible)
    │
    └──→ Task 4 (RobotSelectionCard.tsx/.css restructure)
                    ▲
Task 3 (robotSelectionConfig.ts — AUDIBILITY_LABELS + drop dead entries) ──┘

Task 2, Task 3, Task 4 ──→ Task 5 (docs/reference/ROBOT_DATA_GRID.md)
```

## Task List

### Phase 1: Foundation

- [x] **Task 1: `isRobotAudible` — the shared audibility predicate**

  **Description:** Add `src/utils/robotAudibility.ts`, exporting `isRobotAudible(audioMode: Robot['audioMode'], localeRobots: Robot[]): boolean` (spec §1.2): `false` when `audioMode === 'mute'`; `false` when any entry in `localeRobots` has `audioMode === 'solo'` and this `audioMode` isn't `'solo'`; `true` otherwise. Pure function, no store/engine imports — mirrors `AudioEngine.ts`'s existing `triggerWithCap` mute/solo check exactly (spec §1.2), just taking the already-resolved `audioMode` value instead of doing its own lookup.

  **Acceptance criteria:**
  - [x] Returns `false` when `audioMode` is `'mute'`, regardless of `localeRobots`' contents (including empty).
  - [x] Returns `true` when `audioMode` is `'none'`, `undefined`, or `'highlight'` and no entry in `localeRobots` has `audioMode === 'solo'`.
  - [x] Returns `false` when some entry in `localeRobots` has `audioMode === 'solo'` and this `audioMode` is anything other than `'solo'`.
  - [x] Returns `true` when `audioMode` is `'solo'`, even if it's the only `'solo'` entry present in `localeRobots`.
  - [x] Returns `true` for an empty `localeRobots` array, unless `audioMode` is itself `'mute'`.
  - [x] The file imports nothing from `@/engine/*` or `@/stores/*` — a pure function over its two arguments only.

  **Verification:**
  - [x] `npx vitest run src/utils/robotAudibility.test.ts` passes, covering every acceptance criterion above.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/robotAudibility.ts`, `src/utils/robotAudibility.test.ts`

  **Estimated scope:** XS (one pure function, no consumers yet)

### Checkpoint: Foundation predicate
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `isRobotAudible` has no consumers yet and no dead-code lint warnings (it's exported, so this should already be clean).
- [ ] Review with human before proceeding.

---

### Phase 2: Consumers of the predicate (parallelizable — neither reads the other's file)

- [x] **Task 2: `AudioEngine.ts` — `triggerWithCap` calls `isRobotAudible`**

  **Description:** In `src/engine/AudioEngine.ts`'s `triggerWithCap`, replace the inline mute/solo check (the two `if` statements between `getActiveLocaleRobots()` and the `// Highlight attenuation...` comment, spec §1.2) with a single call: `if (!isRobotAudible(robotFromStore?.audioMode, localeRobots)) { return false; }`. The `// Highlight attenuation is handled in scheduleNote...` comment and everything in `scheduleNote` are untouched — this task touches only the mute/solo gate, not velocity attenuation.

  **Acceptance criteria:**
  - [x] `triggerWithCap` calls `isRobotAudible` instead of re-deriving the mute/solo rule inline.
  - [x] No observable behavior change: a muted robot's notes are still suppressed; a non-solo robot is still suppressed whenever any robot is soloed; an unfound `robotFromStore` (empty `localeRobots` guard) behaves identically to before.
  - [x] The `scheduleNote` highlight-attenuation branch is untouched, byte-for-byte.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes **with zero test-file edits** — this is the acceptance proof, not a formality: if any existing assertion needs changing to pass, the refactor changed behavior and is wrong. (101/101 passed, unmodified.)
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/engine/AudioEngine.ts`

  **Estimated scope:** XS (one call-site swap in one existing function)

- [x] **Task 3: `robotSelectionConfig.ts` — `AUDIBILITY_LABELS`, drop dead `.battery`/`.audio`**

  > **Discovered during implementation:** removing `.battery`/`.audio` here breaks `npm run build:types` until Task 4 rewrites `RobotSelectionCard.tsx` (its only remaining referrer) — the two tasks are not independently shippable the way this plan's Architecture Decisions assumed. Implemented and committed together in one commit rather than two, to avoid an intermediate non-compiling commit in history; checkboxes below are still tracked per-task since each task's own acceptance criteria were independently verified before the combined commit.

  **Description:** Add `AUDIBILITY_LABELS: Record<'emitting' | 'disabled', ValueLabel>` (spec §1.3: `emitting`/`disabled` keys, `loreLabel`/`humanLabel` pairs, draft values `'ACOUSTIC EMISSION ACTIVE'`/`'Emitting'` and `'ACOUSTIC EMISSION SUPPRESSED'`/`'Disabled'`). Remove `ROBOT_SELECTION_ROW_SCHEMAS.battery` and `.audio` (spec §1.5 item 1 — confirmed dead once Task 4 ships, since `RobotDisplaySection` already moved off `.battery` in Roadmap 15.1 and never used `.audio`). `.name`/`.job`/`.docking` are untouched — `RobotDisplaySection` still consumes them.

  **Acceptance criteria:**
  - [x] `AUDIBILITY_LABELS.emitting`/`.disabled` both have non-empty `loreLabel`/`humanLabel`.
  - [x] `ROBOT_SELECTION_ROW_SCHEMAS` no longer has `.battery` or `.audio` keys.
  - [x] `ROBOT_SELECTION_ROW_SCHEMAS.name`/`.job`/`.docking` are unchanged.
  - [x] No remaining reference to `ROBOT_SELECTION_ROW_SCHEMAS.battery` or `.audio` anywhere in `src/` (grep confirms only `RobotSelectionCard.tsx`, itself rewritten in Task 4, ever referenced `.battery`; `.audio` had no consumer at all).

  **Verification:**
  - [x] `npx vitest run src/data/robotSelectionConfig.test.ts` passes — existing `ROBOT_SELECTION_ROW_SCHEMAS` shape assertion drops `.battery`/`.audio`; new `describe('AUDIBILITY_LABELS')` block covers both keys.
  - [x] `npm run build:types` clean — verified once Task 4 also landed (see the discovered-coupling note above; `.battery`/`.audio` removal alone does not compile until then).
  - [x] `npm run lint` clean.

  **Dependencies:** None (independent of Task 1/2 — pure data-file change).

  **Files:** `src/data/robotSelectionConfig.ts`, `src/data/robotSelectionConfig.test.ts`

  **Estimated scope:** XS (one config file, additive plus two dead-key removals)

### Checkpoint: Predicate consumers + config ready
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] `AudioEngine.test.ts` required zero edits (Task 2's own proof).
- [ ] Review with human before proceeding.

---

### Phase 3: The card itself

- [x] **Task 4: `RobotSelectionCard` — two-region restructure**

  > **Discovered during implementation:** two downstream test files, outside this plan's original §2 file list, asserted on the old card DOM shape and needed updating alongside this task — `src/components/panels/screen/console/RobotsTab.test.tsx` (an integration test rendering real `RobotSelectionCard`s, checking for a standalone `"Active"` text node and a `role="status"` audio badge, both gone) and `src/components/robot/standaloneDualLabelHosts.test.ts` (a TYPE_SCALE.md regression guard asserting `.robot-selection-card__value`'s font-size token — that class no longer exists, replaced by `.__name`/`.__job`/`.__status-line`). Both retargeted to the new structure, not deleted.

  **Description:** Rewrite `RobotSelectionCard.tsx` and `RobotSelectionCard.css` per spec §4: the outer `<li className="robot-selection-card">` keeps only `getRobotColorStyle` and its border/background/padding (no `role`/`tabIndex`/handlers/`cursor`). A new `.robot-selection-card__top` `<div>` takes over the activation contract (`role="button"`, `tabIndex`, `onClick`/`onKeyDown` → `selectRobot`, `aria-label`), containing `.robot-selection-card__meta-row` (avatar + a `.robot-selection-card__meta-text` column of three bare `<span>`s — `__name` styled larger/heavier via `--font-size-heading-sm`/`--font-weight-medium`, `__job`, and `__status-line` joining `dockingLabel.humanLabel` and the audibility-derived `statusLabel.humanLabel` with " · ") followed by the read-only `SliderLinear` Battery row (`BATTERY_READOUT_SCHEMA`, `readOnly`, label kept). A new `.robot-selection-card__bottom` `<div>`, no handlers, holds the company `RadioButton`. `stopBubble` and every `DualLabel`/`AudioStatusBadge` usage in this file are deleted.

  **Acceptance criteria:**
  - [x] `screen.getByRole('button')` resolves to `.robot-selection-card__top`, not the outer `<li>`; the `<li>` itself carries no `role`, `tabIndex`, or click/keydown handlers.
  - [x] Clicking or keyboard-activating (`Enter`/`Space`) anywhere inside `.robot-selection-card__top` — avatar, any text line, or the battery slider — calls `selectRobot` with this robot's id.
  - [x] Clicking the company `RadioButton` never calls `selectRobot`, and the implementation contains no `stopBubble` function or its call sites — the sibling-region structure alone accounts for the isolation.
  - [x] Name, Job, and the combined "Docking · Status" line render as bare text (no `DualLabel`, no lore/human caption) — `screen.queryByText(/ROBOT IDENTIFIER|ASSIGNED PROTOCOL|DOCKING STATE/)` all resolve to nothing in this card.
  - [x] The "Docking · Status" line reads e.g. `"Active · Emitting"` for an audible robot and `"Active · Disabled"` for a muted one, using `isRobotAudible(robot.audioMode, localeRobots)` (Task 1) against every robot in the current locale, not just this robot's own `audioMode` — a robot with `audioMode: 'none'` flips from "Emitting" to "Disabled" once another robot in the same locale becomes `'solo'`.
  - [x] Battery renders via the read-only `SliderLinear` (`role="status"`, `data-readonly="true"`, formatted `{Math.round(robot.batteryLevel)}%`) with its label still visible ("Battery Data") — no `role="slider"` anywhere in the card.
  - [x] No `AudioStatusBadge` (or any other `role="status"` dot) renders anywhere in this card.
  - [x] `.robot-selection-card__meta-grid`, `__field`, `__value`, `__row`, `__row--name`, `__row--company` no longer exist in `RobotSelectionCard.css`.

  **Verification:**
  - [x] `npx vitest run src/components/selection/RobotSelectionCard.test.tsx` passes (28/28) — every existing test re-targeted to the new structure where needed (button role, value classes), plus new coverage for the combined status line (both audible and locale-wide-solo-silenced cases), the battery slider, and the absence of `AudioStatusBadge`.
  - [x] `npm run build:types` clean — surfaces any leftover reference to `DualLabel`, `AudioStatusBadge`, `ROBOT_SELECTION_ROW_SCHEMAS`, or `stopBubble` in this file.
  - [x] `npm run lint` clean.
  - [x] Full suite: `npx vitest run` — 140/140 files, 2473/2473 tests, including the two retargeted downstream files noted above. `npm run build` clean.
  - [ ] Manual check: `npm run dev`, open the Robots tile — confirm each card shows avatar + bolder Name + Job + "Docking · Status", then the labeled battery slider, then the company picker. Click across the top region (avatar/text/slider) and confirm selection; click a company option and confirm it doesn't select. Set one robot to Solo via Robot Options and confirm every *other* card flips to "Disabled" while the soloed one stays "Emitting."

  **Dependencies:** Task 1 (`isRobotAudible`), Task 3 (`AUDIBILITY_LABELS`, and `BATTERY_READOUT_SCHEMA` already shipped in Roadmap 15.1).

  **Files:** `src/components/selection/RobotSelectionCard.tsx`, `src/components/selection/RobotSelectionCard.css`, `src/components/selection/RobotSelectionCard.test.tsx`; plus, discovered during implementation: `src/components/panels/screen/console/RobotsTab.test.tsx`, `src/components/robot/standaloneDualLabelHosts.test.ts`

  **Estimated scope:** M (3 files, the full vertical slice of the redesign itself)

### Checkpoint: Card shipped
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual pass (Task 4's own manual check) confirms the redesigned card end-to-end, including the locale-wide Solo → Disabled behavior — not yet run.
- [x] No remaining reference anywhere in `src/` to `.robot-selection-card__meta-grid`/`__field`/`__value`/`__row--name`/`__row--company`, `stopBubble` (this file's own), or `ROBOT_SELECTION_ROW_SCHEMAS.battery`/`.audio` (grep-confirmed).
- [ ] Review with human before proceeding.

---

### Phase 4: Docs

- [x] **Task 5: `docs/reference/ROBOT_DATA_GRID.md` — Emitting/Disabled draft rows**

  **Description:** Append two rows to the existing "Draft — pending review" table (spec §6), matching the format of the Job Data/Docked Status/Audio Setting value rows already there:

  | English Label | Lore Label | Field | Notes |
  |---|---|---|---|
  | Emitting | ACOUSTIC EMISSION ACTIVE | `AUDIBILITY_LABELS.emitting` | Card Status value — true audibility (not muted, and not excluded by another robot's Solo) |
  | Disabled | ACOUSTIC EMISSION SUPPRESSED | `AUDIBILITY_LABELS.disabled` | Card Status value |

  **Acceptance criteria:**
  - [x] Both rows appended to the existing draft table, same column shape as its neighbors.
  - [x] Values match `AUDIBILITY_LABELS`'s actual shipped `loreLabel`/`humanLabel` strings exactly (spot-checked against Task 3's final code).

  **Verification:**
  - [x] Manual review — spot-checked against the shipped `robotSelectionConfig.ts`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change, no behavioral impact — `npm test`/`npm run build` already verified clean against the same unchanged source at the prior checkpoint).

  **Dependencies:** Task 3 (documents its final values), Task 4 (documents the shipped consumer).

  **Files:** `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 5 tasks are met, except the one still-open manual browser check noted under Task 4.
- [x] `docs/reference/ROBOT_DATA_GRID.md` reflects the shipped labels.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `isRobotAudible`'s extraction subtly changes `AudioEngine.ts` behavior (e.g. argument-order mistake, or losing the `localeRobots.length > 0` guard's effect) | High if it happens — a real audio-scheduling regression, not just a UI bug | Task 2's acceptance criterion is explicitly "zero edits to `AudioEngine.test.ts`," not a new assertion — any required test change is treated as a signal the task failed, not as routine test maintenance |
| `ROBOT_SELECTION_ROW_SCHEMAS.battery`/`.audio` removal (Task 3) lands before Task 4 rewrites `RobotSelectionCard.tsx`, leaving a real compile error in between if the two are merged separately out of order | Low — both are small, fast tasks in the same PR/branch in practice | `npm run build:types` is a required verification step on both tasks; Task 3's own acceptance criteria already require zero remaining references before Task 4 starts, so the ordering is self-enforcing within this plan |
| The "Docking · Status" locale-wide-solo test (Task 4) requires seeding more than one robot into the store within a single test — easy to under-test with only a single-robot fixture, the same shape every other `RobotSelectionCard.test.tsx` case uses today | Medium — the entire point of extracting `isRobotAudible` was this cross-robot case; a card-level test suite that never exercises it would leave the riskiest behavior unverified at the UI layer | Task 4's acceptance criteria explicitly require a second robot in the locale store for the solo-silencing case, not just unit coverage of `isRobotAudible` in isolation (Task 1 already covers the pure-function logic; Task 4 must additionally prove the card wires it correctly) |
| ~~`BATTERY_READOUT_SCHEMA` (a single shared, static object) was passed unmodified to every robot's `SliderLinear` in the list — `SliderLinear` derives `VoxelTrack`'s GSAP `timelineKeyPrefix` directly from `schema.id`, and `timelineMap` (`src/animation/timelineMap.ts`) is one module-global `Map`, so all ~12 simultaneously-rendered cards fought over identical timeline keys~~ | **Materialized — found via `/code-review-and-quality`, not caught by the original test suite** (no test rendered multiple real, unmocked `VoxelTrack`/`CabinetBox` instances together and asserted on timeline-key identity). Every mount/update, one robot's `setTimeline` call killed a sibling robot's still-live pop-in animation for the same box index — a real, everyday visual bug (the roster is always 12). **Fixed:** `RobotSelectionCard.tsx` now derives a per-robot id (`` `${BATTERY_READOUT_SCHEMA.id}.${robot.id}` ``) before passing the schema to `SliderLinear`; `RobotDisplaySection`'s own use of the schema was unaffected (only one robot shown there at a time — exactly the case the primitive's "unique per-slider-instance" contract expects). Regression test added: renders two cards together with `VoxelTrack` mocked to expose `timelineKeyPrefix`, asserts the two prefixes differ. | Resolved — no longer open. |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **`ROBOT_SELECTION_ROW_SCHEMAS.battery`/`.audio` removal (Task 3)** — this plan's own judgment call, low risk (grep-confirmed zero remaining consumers), flagged for Crawford's awareness rather than left silent.
2. **`AudioStatusBadge` kept with zero real consumers after Task 4** — matches the existing `Stepper` precedent in this codebase; worth explicit sign-off since it's a whole component, not a config entry.
3. **Exact avatar sizing/column proportions** in `.robot-selection-card__meta-row` — Task 4's own CSS is a starting point, not a pixel-perfect mandate; revisit if a real screenshot review calls for adjustment.
