# Implementation Plan: Robot Selection (Roadmap Phase 8)

Source spec: [docs/specs/ROBOT_SELECTION.md](../specs/ROBOT_SELECTION.md). Source intent:
[docs/intent/robot-selection.md](../intent/robot-selection.md).

## Overview

Build one shared color-source utility (`statusLightColors.ts`, on top of a small `hslToString`
extension), refactor the two existing status lights (`AccordionContainer`, `PowerRockerSwitch`)
onto it, add `RobotBody`'s day/night bypass, build the new Robot Selection card UI
(`robotSelectionConfig.ts`, `AudioStatusBadge`, `RobotSelectionCard`) on top of all of that, wire it
into `RobotsTab.tsx`, and separately fix the world-view click-through (`Console.tsx`'s
pointer-events + `Robot.tsx`'s click handler). The scope matches spec §2's file list exactly; this
plan sequences it and resolves spec §7's five open questions before any task is written.

## Architecture Decisions

Resolving spec §7's open questions up front, not during implementation:

- **§7.1 — Draft label copy, adopted as-is for now.** Spec §4's `JOB_TYPE_LABELS`/
  `DOCKING_STATE_LABELS`/`AUDIO_MODE_LABELS` ship verbatim as the initial draft. No further
  bikeshedding during implementation — Crawford reviews/edits them directly in
  `ROBOT_DATA_GRID.md` (and `robotSelectionConfig.ts` in lockstep) after this phase ships.
- **§7.2 — Avatar `viewBox`, resolved as "generous default + visual check."** No existing code
  renders a single robot in isolation today — every current usage (`Robot.tsx` inside
  `OceanScene.tsx`) places shape components directly into the World view's own shared SVG canvas
  with no per-robot `viewBox` at all; positioning comes entirely from the parent `<g>`'s GSAP
  transform, not a coordinate-space wrapper. `RobotSelectionCard` is the first isolated render, so
  there's no existing value to copy. Task 8 starts with a generous placeholder
  (`viewBox="-80 -80 160 160"`) and adjusts it by rendering the card in the dev server and looking
  at it — a visual-inspection task, not a code-reading one, so it isn't worth reverse-engineering
  every shape component's hardcoded path/polygon coordinates up front.
- **§7.3 — `.sc-button` is confirmed sufficient** for the `console--grid` pointer-events
  re-enable selector. Re-read `HubNav.tsx` during spec research: it maps `HUB_NAV_ITEMS` to
  `Button` and renders nothing else. No further check needed before Task 10.
- **§7.4 — Keyboard activation, resolved as a comment, not a code change.** `RobotSelectionCard`
  has no nested interactive elements today, so `Enter`/`Space` both safely map to the same
  `selectRobot` call. Task 8 adds a one-line comment flagging that a future nested interactive
  child (unlikely, but possible) would need `event.target === event.currentTarget` guarding —
  documented, not built defensively now for a case that doesn't exist.
- **§7.5 — `Console.test.tsx`/`Robot.test.tsx` stay scoped to this phase's new behavior.** Per
  spec §3's Strict Scope boundary — no backfill of pre-existing untested behavior
  (`Console.tsx` rendering `ConsolePanel`, `Robot.tsx`'s GSAP mount effect). If broader coverage
  is wanted later, that's a separate, explicitly-scoped task.

## Dependency Graph

```
Task 1 (colorUtils.ts: hslToString alpha)
        │
        └──→ Task 2 (statusLightColors.ts + test)
                    │
                    ├──→ Task 3 (AccordionContainer refactor + test)   ┐ parallel-safe
                    └──→ Task 4 (PowerRockerSwitch refactor + test)    ┘ with each other
                                    │
                                    └──→ Checkpoint: Color Unification

Task 5 (RobotBody.tsx: ignoreDaylight + test) ─────────────┐ independent of color work;
Task 6 (robotSelectionConfig.ts + test) ────────────────────┤ parallel-safe with Tasks 1–4
                                                             │
Task 2 + Task 6 ──→ Task 7 (AudioStatusBadge + test)        │
                                    │                        │
Task 5 + Task 6 + Task 7 ──→ Task 8 (RobotSelectionCard + test)
                                    │
                                    └──→ Checkpoint: Selection Components
                                    │
Task 8 ──→ Task 9 (RobotsTab.tsx rewired to cards + test)
                                    │
                                    └──→ Checkpoint: Selection Wired In

Task 10 (Console.tsx pointer-events + test) ┐ independent of Tasks 1–9;
Task 11 (Robot.tsx click routing + test)    ┘ parallel-safe with each other and with Tasks 1–9
                                    │
                                    └──→ Checkpoint: World-View Click-Through

Tasks 1–11 ──→ Task 12 (docs: ROBOT_DATA_GRID.md, ROBOT_DESIGN.md, UI_SHELL.md, roadmap.md)
```

Tasks 10–11 have no dependency on the card/color work at all and can be built and merged
independently (e.g. by a second agent/session) any time after this plan is approved. Tasks 3 and 4
are parallel-safe with each other once Task 2 lands. Tasks 5 and 6 are parallel-safe with each
other and with Tasks 1–4.

## Task List

### Phase 1: Shared Color Source

- [x] **Task 1: `src/utils/colorUtils.ts` — `hslToString` gains an optional `alpha`**

  **Description:** Add a second, optional parameter so a caller can get an `hsla()` string for
  glow/box-shadow use, without touching any existing call site.

  **Acceptance criteria:**
  - [x] `hslToString(hsl: HSL, alpha?: number): string` — omitted `alpha` returns the existing
    `hsl(h, s%, l%)` format, byte-identical to today's output
  - [x] A supplied `alpha` returns `hsla(h, s%, l%, alpha)`
  - [x] No existing exported signature (`shiftHSL`, `applyColorShift`, `clamp`) changes

  **Verification:**
  - [x] `npx vitest run src/utils/colorUtils.test.ts` — all passing, including the new case below
  - [x] `npm run build:types` passes

  **Dependencies:** None.

  **Files:** `src/utils/colorUtils.ts`, `src/utils/colorUtils.test.ts`

  **Estimated scope:** XS (2 files)

- [x] **Task 2: `src/utils/statusLightColors.ts` — the single status-light color source**

  **Description:** New file exporting `getStatusLightColor`, mapping the four semantic states to
  `colorTheme.json` families via `hslToString`.

  **Acceptance criteria:**
  - [x] `StatusLightState = 'purple' | 'red' | 'green' | 'amber'` exported
  - [x] `getStatusLightColor(state, glowAlpha = 0.6): { color: string; glow: string }` exported
  - [x] `purple` → `colorTheme.vent.base`, `red` → `colorTheme.alert.powered`, `green` →
    `colorTheme.indicator.powered`, `amber` → `colorTheme.strut.base`
  - [x] `color` uses `hslToString(hsl)` (no alpha); `glow` uses `hslToString(hsl, glowAlpha)`

  **Verification:**
  - [x] `npx vitest run src/utils/statusLightColors.test.ts` — all passing
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean

  **Dependencies:** Task 1.

  **Files:** `src/utils/statusLightColors.ts`, `src/utils/statusLightColors.test.ts`

  **Estimated scope:** XS (2 files)

### Checkpoint: Shared Color Source

- [x] `npx vitest run src/utils/colorUtils.test.ts src/utils/statusLightColors.test.ts` — all
  passing.
- [x] `npm run build:types` and `npm run lint` clean for both files.

### Phase 2: Color Unification (existing status lights)

- [x] **Task 3: `AccordionContainer` — consume `statusLightColors`**

  **Description:** Replace the CSS attribute-selector hardcoded hex with a computed inline style,
  keeping the pulse `animation` in CSS.

  **Acceptance criteria:**
  - [x] `contentActive === true` → inline `color`/`boxShadow` from `getStatusLightColor('green')`
  - [x] `contentActive === false` → from `getStatusLightColor('red')`
  - [x] `contentActive === undefined` → no inline style (existing unlit-dot behavior unchanged)
  - [x] `AccordionContainer.css`'s `[data-content-active='true'|'false']` rules drop `color`/
    `box-shadow`, keep `animation`
  - [x] `data-content-active` attribute itself is unchanged (still drives the animation selectors)

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/AccordionContainer.test.tsx` — all passing,
    including the updated color assertions
  - [x] `npm run build:types` passes
  - [ ] Manual check (`npm run dev`): open Audio Rig, confirm effect-enabled lights still read
    clearly red/green and still pulse — **not yet done, needs the human operator in a real
    browser**

  **Dependencies:** Task 2.

  **Files:** `src/components/ui/controls/AccordionContainer.tsx`,
  `src/components/ui/controls/AccordionContainer.css`,
  `src/components/ui/controls/AccordionContainer.test.tsx`

  **Estimated scope:** S (3 files)

- [x] **Task 4: `PowerRockerSwitch` — consume `statusLightColors`**

  **Description:** Same treatment as Task 3, for the three power-light states.

  **Acceptance criteria:**
  - [x] `data-power-state="off"` → inline color/glow from `getStatusLightColor('red')`
  - [x] `data-power-state="on"` → from `getStatusLightColor('green')`
  - [x] `data-transitioning="true"` → from `getStatusLightColor('amber')` (specificity/precedence
    over the power-state color preserved — transitioning wins while true, matching today's CSS
    cascade order)
  - [x] `PowerRockerSwitch.css`'s three `color`/`box-shadow` declarations removed, `animation`
    declarations kept

  **Verification:**
  - [x] `npx vitest run src/components/ui/physical/PowerRockerSwitch.test.tsx` — all passing
  - [x] `npm run build:types` passes
  - [ ] Manual check (`npm run dev`): power on/off the device, confirm the light still reads
    red/green/amber correctly at each stage and still pulses — **not yet done, needs the human
    operator in a real browser**

  **Dependencies:** Task 2 (parallel-safe with Task 3).

  **Files:** `src/components/ui/physical/PowerRockerSwitch.tsx`,
  `src/components/ui/physical/PowerRockerSwitch.css`,
  `src/components/ui/physical/PowerRockerSwitch.test.tsx`

  **Estimated scope:** S (3 files)

### Checkpoint: Color Unification

- [x] `npm test` passes for `AccordionContainer.test.tsx`, `PowerRockerSwitch.test.tsx`.
- [x] `grep -rn "#8b1a14\|#1a8f40\|#c08800" src` returns nothing — confirms no duplicated hex
  survives outside `statusLightColors.ts`'s own `colorTheme.json` lookups.
- [x] `npm run build` builds cleanly.

### Phase 3: Day/Night Bypass + Selection Data

- [x] **Task 5: `src/components/robot/RobotBody.tsx` — `ignoreDaylight` prop**

  **Description:** Add the optional prop; when true, `lightnessMultiplier` is fixed at a neutral
  `1` instead of derived from `uiStore.activeLocaleLocalTime`. Battery dim is untouched.

  **Acceptance criteria:**
  - [x] `RobotBodyProps` gains `ignoreDaylight?: boolean`
  - [x] `ignoreDaylight` omitted/false: behavior byte-identical to today (regression guard)
  - [x] `ignoreDaylight={true}`: rendered colors identical regardless of
    `activeLocaleLocalTime`'s value
  - [x] `computeBatteryDimOpacity`'s output/usage is unaffected either way
  - [x] `Robot.tsx`'s existing call site does **not** pass the new prop (in-world robots keep
    today's day/night behavior)

  **Verification:**
  - [x] `npx vitest run src/components/robot/RobotBody.test.tsx` — all passing (new file)
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Task 6 and with Phases 1–2).

  **Files:** `src/components/robot/RobotBody.tsx`, `src/components/robot/RobotBody.test.tsx`

  **Estimated scope:** S (2 files; first test file for this component, scoped to the new prop only
  per Architecture Decisions §7.5's spirit — not a retroactive full suite)

- [x] **Task 6: `src/data/robotSelectionConfig.ts` — schemas + draft value-label maps**

  **Description:** New data file: `DualLabelSchema` entries for the five card rows (exact
  `ROBOT_DATA_GRID.md` pairs), plus draft per-value label maps for `JobType`/`DockingState`/audio
  mode, plus the audio-mode-to-color map.

  **Acceptance criteria:**
  - [x] `ROBOT_SELECTION_ROW_SCHEMAS` — one `DualLabelSchema` per {name, job, battery, docking,
    audio}, matching `ROBOT_DATA_GRID.md`'s existing lore/human pairs exactly (no invented copy
    for these five — they're already confirmed, unlike the value maps below)
  - [x] `JOB_TYPE_LABELS: Record<JobType, {loreLabel, humanLabel}>` — all 4 `JobType` members
    covered
  - [x] `UNASSIGNED_JOB_LABEL` — one `{loreLabel, humanLabel}` for a robot with no `job`
  - [x] `DOCKING_STATE_LABELS: Record<DockingState, {loreLabel, humanLabel}>` — all 4
    `DockingState` members covered
  - [x] `AUDIO_MODE_LABELS` — covers all 4 `Robot['audioMode']` values (`'none'|'mute'|'solo'|
    'highlight'`)
  - [x] `AUDIO_STATUS_COLOR_MAP: Record<AudioMode, StatusLightState>` — `none→purple, mute→red,
    solo→green, highlight→amber`
  - [x] New test asserts every enum member is covered in every map (runtime-testable, mirroring
    `controls.test.ts`'s "every variant covered" pattern) — catches a silently-missing case if a
    future `JobType`/`DockingState`/`audioMode` value is added later

  **Verification:**
  - [x] `npx vitest run src/data/robotSelectionConfig.test.ts` — all passing
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Task 5 and with Phases 1–2).

  **Files:** `src/data/robotSelectionConfig.ts`, `src/data/robotSelectionConfig.test.ts`

  **Estimated scope:** S (2 files)

### Checkpoint: Day/Night Bypass + Selection Data

- [x] `npm test` passes for `RobotBody.test.tsx`, `robotSelectionConfig.test.ts`.
- [x] `npm run build:types` and `npm run lint` clean for both.

### Phase 4: New Selection Components

- [x] **Task 7: `src/components/selection/AudioStatusBadge.tsx` — colored dot**

  **Description:** New component: reads `Robot['audioMode']`, renders a dot colored via
  `getStatusLightColor(AUDIO_STATUS_COLOR_MAP[mode])`, accessible name from `AUDIO_MODE_LABELS`.

  **Acceptance criteria:**
  - [x] Accepts `{ audioMode: NonNullable<Robot['audioMode']> }`
  - [x] Inline `color`/`boxShadow` computed via `getStatusLightColor`, no hardcoded hex
  - [x] `role="img"`, `aria-label` includes both the human and lore label from
    `AUDIO_MODE_LABELS[audioMode]`
  - [x] All 4 `audioMode` values render a visibly distinct color (purple/red/green/amber)

  **Verification:**
  - [x] `npx vitest run src/components/selection/AudioStatusBadge.test.tsx` — all passing
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean

  **Dependencies:** Task 2, Task 6.

  **Files:** `src/components/selection/AudioStatusBadge.tsx`,
  `src/components/selection/AudioStatusBadge.css`,
  `src/components/selection/AudioStatusBadge.test.tsx`

  **Estimated scope:** S (3 files)

- [x] **Task 8: `src/components/selection/RobotSelectionCard.tsx` — the clickable card**

  **Description:** New component: a native clickable `<li>` composing the avatar (`RobotBody
  ignoreDaylight`), the five `DualLabel` rows + their live values, and `AudioStatusBadge`.

  **Acceptance criteria:**
  - [x] Native element (`<li role="button" tabIndex={0}>`), not the `Button` primitive
  - [x] `onClick` and `onKeyDown` (Enter/Space) both call `selectRobot(robot.id)` — see
    Architecture Decisions §7.4 for the documented single-activation-path comment
  - [x] Renders the robot's name (falling back to `id` per the existing `RobotsTab` convention),
    job label (`JOB_TYPE_LABELS[robot.job.type]` or `UNASSIGNED_JOB_LABEL` when `job` is
    undefined), `Math.round(robot.batteryLevel)` + `%`, and
    `DOCKING_STATE_LABELS[robot.docking].humanLabel`, each preceded by its `DualLabel` row from
    `ROBOT_SELECTION_ROW_SCHEMAS`
  - [x] Renders `AudioStatusBadge` with `robot.audioMode ?? 'none'`
  - [x] Avatar wrapped in an `<svg viewBox="-80 -80 160 160">` per Architecture Decisions §7.2,
    passing `ignoreDaylight` to `RobotBody`
  - [x] `aria-label` on the card resolves to the robot's name or id (same fallback rule)

  **Verification:**
  - [x] `npx vitest run src/components/selection/RobotSelectionCard.test.tsx` — all passing
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean
  - [ ] Manual check (`npm run dev`): render a card, visually confirm the avatar isn't clipped by
    the placeholder `viewBox` — adjust the value per Architecture Decisions §7.2 if it is —
    **not yet done, needs the human operator in a real browser**

  **Dependencies:** Task 5, Task 6, Task 7.

  **Files:** `src/components/selection/RobotSelectionCard.tsx`,
  `src/components/selection/RobotSelectionCard.css`,
  `src/components/selection/RobotSelectionCard.test.tsx`

  **Estimated scope:** M (3 files, the phase's most composed component)

### Checkpoint: Selection Components

- [x] `npm test` passes for `AudioStatusBadge.test.tsx`, `RobotSelectionCard.test.tsx`.
- [x] `npm run build:types` and `npm run lint` clean for both.
- [ ] Manual visual check per Task 8's note above — pending human operator.

### Phase 5: Wire Into RobotsTab

- [x] **Task 9: `src/components/panels/screen/console/RobotsTab.tsx` — render cards**

  **Description:** Replace the `Button`-per-robot list with one `RobotSelectionCard` per robot.

  **Acceptance criteria:**
  - [x] `RobotsTab` maps the active locale's robots to `RobotSelectionCard`s inside the existing
    `<ul className="robots-tab__list">`
  - [x] The old `ButtonSchema`/`Button` per-row rendering is removed
  - [x] `RobotsTab.css` updated for card layout — kept as-is (flex-column stack); already suits a
    list of cards, no dedicated `.robots-tab__row` rule existed to remove

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotsTab.test.tsx` — all passing
    (rewritten: card-content/role assertions replace the old button-role assertions; the
    fallback-to-id-on-blank/missing-name, "no + New Robot button", and "clicking a robot selects
    it" coverage all carry forward per spec §5)
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean
  - [ ] Manual check (`npm run dev`): open the Robots hub tile, confirm every robot renders as a
    card with avatar/name/job/battery/docking/audio-status, and clicking one opens
    `RobotEditorTab` for that robot — **not yet done, needs the human operator**

  **Dependencies:** Task 8.

  **Files:** `src/components/panels/screen/console/RobotsTab.tsx`,
  `src/components/panels/screen/console/RobotsTab.css`,
  `src/components/panels/screen/console/RobotsTab.test.tsx`

  **Estimated scope:** S (3 files)

### Checkpoint: Selection Wired In

- [x] `npm test` passes for `RobotsTab.test.tsx`.
- [x] `npm run build:types`, `npm run lint` clean. (`npm run build` re-run at the final Phase 8
  checkpoint rather than after every task.)
- [ ] Manual check per Task 9 above, plus: confirm a robot with no `job` (freshly `Docked`) shows
  "Unassigned" rather than a blank/crashing row — pending human operator.

### Phase 6: World-View Click-Through

- [x] **Task 10: `Console.tsx`/`Console.css` — pointer-events gate**

  **Description:** While the hub grid is showing (`activeHubTile === null`), `.console` stops
  swallowing clicks meant for the world view underneath, except on its own real buttons.

  **Acceptance criteria:**
  - [x] `Console` reads `activeHubTile` from `useUIStore` and renders `console console--grid`
    when `null`, plain `console` otherwise
  - [x] `Console.css` adds `.console--grid { pointer-events: none; }` and
    `.console--grid .sc-button { pointer-events: auto; }`
  - [x] No other `Console.css` rule changes

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/Console.test.tsx` — all passing (new
    file, scoped to the conditional class per Architecture Decisions §7.5)
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean
  - [ ] Manual check (`npm run dev`): on the hub grid, confirm HubNav's tiles are still clickable
    and clicking empty space between them does nothing (no accidental tile open) — **pending
    human operator**

  **Dependencies:** None (parallel-safe with everything in Phases 1–5).

  **Files:** `src/components/panels/screen/console/Console.tsx`,
  `src/components/panels/screen/console/Console.css`,
  `src/components/panels/screen/console/Console.test.tsx`

  **Estimated scope:** S (3 files; first test file for this component)

- [x] **Task 11: `Robot.tsx` — click also routes into the Robots tile**

  **Description:** `handleClick` calls `setActiveHubTile('robots')` in addition to
  `selectRobot(id)`, but only when no tile is currently open.

  **Acceptance criteria:**
  - [x] Reads `activeHubTile`/`setActiveHubTile` from `useUIStore`
  - [x] Click when `activeHubTile === null`: both `selectRobot(robot.id)` and
    `setActiveHubTile('robots')` are called
  - [x] Click when `activeHubTile` is already non-null: `selectRobot(robot.id)` is called,
    `setActiveHubTile` is **not** called (i.e. the active tile doesn't change)
  - [x] No other behavior in `Robot.tsx` changes (GSAP mount effect, ref registration untouched)

  **Verification:**
  - [x] `npx vitest run src/components/robot/Robot.test.tsx` — all passing (new file, scoped to
    the click/navigation behavior per Architecture Decisions §7.5)
  - [x] `npm run build:types` passes
  - [x] `npm run lint` clean

  **Dependencies:** None (parallel-safe with Task 10 and with everything in Phases 1–5).

  **Files:** `src/components/robot/Robot.tsx`, `src/components/robot/Robot.test.tsx`

  **Estimated scope:** S (2 files; first test file for this component)

### Checkpoint: World-View Click-Through

- [x] `npm test` passes for `Console.test.tsx`, `Robot.test.tsx` — and the full suite:
  1149/1149 passing project-wide, zero regressions.
- [x] `npm run build:types`, `npm run lint` clean project-wide.
- [ ] Manual check (`npm run dev`): from the hub grid, click a swimming robot — confirm it opens
  Robot Selection with that robot's card visibly selected/navigated into its editor; open Audio
  Rig or Settings and confirm world-view robots are no longer clickable; return to the hub grid
  and confirm they're clickable again. **Pending human operator** — deferred to the final
  Phase 8 checkpoint's manual run-through rather than repeated here.

### Phase 7: Docs

- [x] **Task 12: `ROBOT_DATA_GRID.md`, `ROBOT_DESIGN.md`, `UI_SHELL.md`, `roadmap.md`**

  **Description:** Document shipped behavior, per spec §2/§3 — the grid rows explicitly marked
  draft, everything else written against the final shipped API.

  **Acceptance criteria:**
  - [x] `docs/reference/ROBOT_DATA_GRID.md` gains a "Draft — pending review" heading at the
    bottom with rows for every `JOB_TYPE_LABELS`/`DOCKING_STATE_LABELS`/`AUDIO_MODE_LABELS` entry
    (mirroring `robotSelectionConfig.ts`'s final shipped copy, including any edits made during
    Task 6/8 review — not necessarily the plan's placeholder text verbatim)
  - [x] `docs/ROBOT_DESIGN.md`'s "Non-Audio Brightness Overlays" section documents
    `RobotBody`'s `ignoreDaylight` prop and where it's used (`RobotSelectionCard`)
  - [x] `docs/UI_SHELL.md`'s "Still planned (not yet built)" bullet about Phase 8's real card UI
    is folded into "Current implementation status" as shipped; a note is added about the
    `Console.css` pointer-events fix enabling world-view→hub-tile navigation
  - [x] `docs/todo/roadmap.md` § 8's bullets marked resolved, mirroring the strikethrough +
    pointer pattern used for prior phases, pointing at `docs/specs/ROBOT_SELECTION.md`

  **Verification:**
  - [x] Manual proofread: every claim spot-checked against the actually-shipped code (field
    names, exact label copy, file paths), not reconstructed from this plan
  - [x] Links resolve (relative paths correct)

  **Dependencies:** Tasks 1–11.

  **Files:** `docs/reference/ROBOT_DATA_GRID.md`, `docs/ROBOT_DESIGN.md`, `docs/UI_SHELL.md`,
  `docs/todo/roadmap.md`

  **Estimated scope:** S (4 files, text-only)

### Checkpoint: Complete

- [x] All acceptance criteria across Tasks 1–12 met.
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean project-wide
  (1149/1149 tests, zero lint/type errors, production build clean).
- [ ] Manual check (`npm run dev`): full run-through of spec §5's verification-steps list (card
  content, click routing both ways, day/night-invariant avatar with battery-dim intact, all four
  `AudioStatusBadge` colors, Accordion/PowerRocker lights unchanged in appearance). **Not yet
  done — needs the human operator running the real dev server/browser, not something verifiable
  from the CLI alone.**
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `console--grid`'s `pointer-events: none` accidentally blocks something inside `.console-panel__content` that isn't `HubNav` | Low | `ConsolePanel.tsx` only ever renders bare `HubNav` when `activeHubTile === null` (confirmed by reading it in spec research) — the grid state has no other content to protect |
| Refactoring `AccordionContainer`/`PowerRockerSwitch` onto inline styles subtly shifts their visible color (real HSL values differ slightly from the old hand-picked hex) | Low/cosmetic | Called out explicitly in Task 3/4's manual-check steps; a deliberate, expected shift per the confirmed intent (unifying to one source), not a defect |
| `RobotSelectionCard`'s placeholder `viewBox` clips or over-shrinks the avatar | Medium (visual only) | Task 8's acceptance criteria includes a manual visual check specifically for this, with Architecture Decisions §7.2 pre-authorizing an adjustment without needing a new round of spec review |
| A `Robot` fixture in an existing test file breaks once `RobotsTab.test.tsx` starts asserting on card content (job/battery/docking fields) it didn't need before | Medium | Task 9's rewrite explicitly carries forward the full existing assertion list (spec §5) rather than a partial rewrite, so any fixture gaps surface as failing tests immediately, not silently |
| Forgetting to gate `Robot.tsx`'s new `setActiveHubTile` call leaves world-view clicks changing tiles even when one is already open, contradicting the confirmed requirement | Medium | Task 11's acceptance criteria explicitly test both branches (`null` and non-`null` `activeHubTile`), not just the happy path |

## Open Questions

None remaining — spec §7's five items are resolved above under Architecture Decisions.
