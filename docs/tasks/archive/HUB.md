# Implementation Plan: Hub (Roadmap Phase 3)

Source spec: [docs/specs/HUB.md](../specs/HUB.md). Source intent: [docs/intent/phase-3-hub.md](../intent/phase-3-hub.md).

## Overview

Replace `ConsoleNavigation`'s Radix `Tabs.Root` bar with `HubNav`, a tile grid driven by a
new `src/data/hubNavConfig.ts`, rendered with the existing `Button` primitive (no new
`ControlSchema` variant). Session and Composition are deleted outright — tab, `uiStore`
entries, stub content, gone. `uiStore.ts`'s `ConsoleTab`/`activeConsoleTab` becomes a
shared `HubTile` type (new `src/types/hub.ts`) and `activeHubTile`, defaulting to `null`
(grid view) across four surviving tiles (`robotOptions`, `robotEditor`, `audioRig`,
`settings`). `ConsolePanel` becomes the full-screen-takeover switch: grid when
`activeHubTile` is `null`, otherwise a back `Button` plus the tile's content —
`RobotOptionsTab`/`RobotEditorTab` unmodified, `audioRig`/`settings` carrying forward
today's stub markup. One existing cross-tile call (`RobotOptionsTab.handleNewRobot` →
`setActiveConsoleTab('robotEditor')`) gets renamed, not dropped.

## Architecture Decisions

Resolving the spec's open questions (§7) concretely, so nothing gets invented ad hoc mid-Implement:

- **Tile copy (resolves spec §7.1):** Real lore/human label pairs for the four
  `HUB_NAV_ITEMS` entries, matching the existing ALL-CAPS-lore / Title-Case-human voice
  already established across the codebase (e.g. `loreLabel: 'CALIBRATE PING'` /
  `humanLabel: 'Reset Melody'` in `Button.test.tsx`; `loreLabel: 'DESIGNATION'` /
  `humanLabel: 'Robot Name'` in `TextInput.test.tsx`) and the "field equipment reporting
  what it's tuned to" fiction the roadmap's Phase 11 About paragraph names explicitly:

  | `target` | `loreLabel` | `humanLabel` |
  |---|---|---|
  | `robotOptions` | `UNIT ROSTER` | `Robot Options` |
  | `robotEditor` | `UNIT DIAGNOSTICS` | `Robot Editor` |
  | `audioRig` | `SIGNAL CHAIN` | `Audio Rig` |
  | `settings` | `SECTOR CONTROL` | `Settings` |

  `humanLabel`s match today's existing `TABS` array text (Title Case instead of the old
  all-caps CSS-driven look, matching how every other primitive's `humanLabel` is written
  — see the grep above, none of the existing `humanLabel` values are all-caps in source).
  **This is a content/voice judgment call, not an engineering constraint** — cheap to
  swap in Task 2 if Crawford wants different copy; nothing downstream depends on the
  specific strings.

- **Full-screen takeover layout (resolves spec §7.2):**
  - Back button: first child inside `.console-panel` when a tile is active, above the
    tile content — `.console-panel__back` wraps the `Button`, left-aligned. No separate
    back-button component; same `Button`+`ButtonSchema` pattern as tiles (per the
    confirmed intent).
  - Grid: `.hub-nav__grid` uses CSS Grid, `grid-template-columns: repeat(auto-fit,
    minmax(140px, 1fr))` — content-driven wrapping, not a viewport-based breakpoint,
    consistent with Phase 2's "scales, never reorients" shell philosophy.

- **`RobotEditorTab`'s now-redundant internal guard (spec §7.3):** confirmed kept as
  defensive code, not removed — it's a one-line no-op once `ConsolePanel` only renders
  the component when its tile is active, and removing it isn't part of this phase's scope
  (see spec §3, "internals are hands-off").

- **`uiStore` test coverage (resolves spec §7.4):** add a small `uiStore.test.ts` — none
  exists today, but the default flipping from `'session'` to `null` is exactly the kind of
  behavior change worth locking down directly rather than only observing indirectly
  through component tests. Scoped to just `activeHubTile`'s default and
  `setActiveHubTile`'s four accepted values — not a general `uiStore` test sweep.

- **No new `*.css.test.ts` files.** `docs/tasks/LAYOUT.md`'s retroactive testing note
  found these structurally incapable of catching what actually matters (jsdom can't
  render CSS layout) and removed all six that existed. `HubNav.css`/`ConsolePanel.css`
  changes in this phase are verified through the real-rendering component tests
  (`HubNav.test.tsx`, `ConsolePanel.test.tsx`) plus manual visual/a11y checks instead.

## Dependency Graph

```
Task 1 (src/types/hub.ts: HubTile, HubNavItem)                    ── independent
    │
    ├── Task 2 (src/data/hubNavConfig.ts: HUB_NAV_ITEMS)
    │
    └── Task 3 (uiStore.ts: rename to activeHubTile/setActiveHubTile, default null)
            │
            ├── Task 4 (RobotEditorTab.tsx: rename activeConsoleTab read)
            ├── Task 5 (RobotOptionsTab.tsx: rename setActiveConsoleTab call)
            │
            └── Task 6 (HubNav.tsx + HubNav.css) ── needs Task 2, Task 3
                    │
                    └── Task 7 (ConsolePanel.tsx + ConsolePanel.css rewrite;
                                delete ConsoleNavigation.tsx/.css) ── needs Task 3, 4, 5, 6
                            │
                            └── Task 8 (HubNav.test.tsx, ConsolePanel.test.tsx)
                                    │
                                    └── Task 9 (docs/UI_SHELL.md update)
```

## Task List

### Phase 1: Shared types and store rename

- [x] **Task 1: Create `src/types/hub.ts`** — done

  **Description:** New file defining `HubTile` (`'robotOptions' | 'robotEditor' |
  'audioRig' | 'settings'`) and `HubNavItem` (`{ schema: ButtonSchema; target: HubTile }`).
  Single source of truth so `uiStore.ts` and `hubNavConfig.ts` both import from here rather
  than one importing from the other.

  **Acceptance criteria:**
  - [x] `HubTile` has exactly the four values above — no `session`/`composition`.
  - [x] `HubNavItem.schema` is typed as `ButtonSchema` (imported from `./controls`), not a
        new schema variant.

  **Verification:**
  - [x] `npm run build:types` clean.

  **Dependencies:** None.

  **Files:** `src/types/hub.ts` (new)

  **Estimated scope:** XS (1 file, types only)

- [x] **Task 2: Create `src/data/hubNavConfig.ts`** — done

  **Description:** `HUB_NAV_ITEMS: HubNavItem[]`, one entry per tile using the copy table
  in Architecture Decisions above. No labels live anywhere else after this.

  **Acceptance criteria:**
  - [x] Exactly four entries, `target` values matching `HubTile` exhaustively (order
        doesn't need to match the old `TABS` array, but must cover all four).
  - [x] Every entry's `schema.id` is unique and matches its `target` (e.g.
        `id: 'robotOptions'`).

  **Verification:**
  - [x] `npm run build:types` clean.

  **Dependencies:** Task 1.

  **Files:** `src/data/hubNavConfig.ts` (new)

  **Estimated scope:** XS (1 file, data only)

- [x] **Task 3: `uiStore.ts` — rename `ConsoleTab`/`activeConsoleTab` to `HubTile`/`activeHubTile`** — done

  **Description:** Remove the local `ConsoleTab` type (import `HubTile` from
  `@/types/hub.ts` instead). Rename `activeConsoleTab` → `activeHubTile`, default `null`
  (was `'session'`). Rename `setActiveConsoleTab` → `setActiveHubTile`. Add
  `uiStore.test.ts` per the Architecture Decision above.

  **Acceptance criteria:**
  - [x] `useUIStore.getState().activeHubTile` is `null` on store init.
  - [x] `setActiveHubTile` only accepts `HubTile | null`.
  - [x] No remaining reference to `ConsoleTab`/`activeConsoleTab`/`setActiveConsoleTab`
        anywhere in `src/` (this task only touches the store itself — Tasks 4–7 fix the
        call sites; the grep check belongs to the Phase 1 checkpoint below, not this task).

  **Verification:**
  - [x] `npm run build:types` — will show type errors at every un-migrated call site
        (`RobotEditorTab.tsx`, `RobotOptionsTab.tsx`, `ConsoleNavigation.tsx`,
        `ConsolePanel.tsx`) until Tasks 4–7 land; expected to be red until this whole
        phase's Task 7 completes.
  - [x] `npm test` — new `uiStore.test.ts` passes.

  **Dependencies:** Task 1.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts` (new)

  **Estimated scope:** S (1 file + 1 new test file)

### Phase 2: Migrate existing call sites

- [x] **Task 4: `RobotEditorTab.tsx` — rename `activeConsoleTab` read** — done

  **Description:** `const activeHubTile = useUIStore((s) => s.activeHubTile);` and the
  guard `if (activeHubTile !== 'robotEditor') return null;`. No other change — component
  internals are hands-off per spec §3.

  **Acceptance criteria:**
  - [x] Component behavior is identical to today when `activeHubTile === 'robotEditor'`.

  **Verification:**
  - [x] `npm run build:types` clean for this file.

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/console/RobotEditorTab.tsx`

  **Estimated scope:** XS (1 file, rename only)

- [x] **Task 5: `RobotOptionsTab.tsx` — rename `setActiveConsoleTab` call** — done

  **Description:** `handleNewRobot`'s `useUIStore.getState().setActiveConsoleTab('robotEditor')`
  becomes `useUIStore.getState().setActiveHubTile('robotEditor')`. This is the one existing
  cross-tile navigation behavior in the codebase (auto-navigate to the editor after
  spawning a robot) — must survive the rename, not be dropped.

  **Acceptance criteria:**
  - [x] Spawning a robot via `handleNewRobot` still results in `activeHubTile ===
        'robotEditor'` and `selectedRobotId` set to the new robot's id.

  **Verification:**
  - [x] `npm run build:types` clean for this file.
  - [x] `npm test` — existing `RobotOptionsTab`-adjacent coverage (via `RobotAudioTab.test.tsx`
        or a new assertion) confirms the post-spawn navigation still lands correctly.

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`

  **Estimated scope:** XS (1 file, rename only)

### Checkpoint: Rename cascade complete
- [x] `npm run build:types` clean — confirms no leftover `ConsoleTab`/`activeConsoleTab`/`setActiveConsoleTab` references outside `ConsoleNavigation.tsx`/`ConsolePanel.tsx` (fixed next).
- [x] `grep -rn "ConsoleTab\|activeConsoleTab\|setActiveConsoleTab" src/` shows matches only in the two files Task 7 replaces.

---

### Phase 3: Build `HubNav`, rebuild `ConsolePanel`, delete `ConsoleNavigation`

- [x] **Task 6: Create `HubNav.tsx` + `HubNav.css`** — done (test-first: `HubNav.test.tsx` written before the component, not deferred to Task 8)

  **Description:** Maps `HUB_NAV_ITEMS` to `<Button>` primitives inside a
  `.hub-nav__grid` (CSS Grid, `repeat(auto-fit, minmax(140px, 1fr))` per the Architecture
  Decision above). Each `Button`'s `onClick` calls `setActiveHubTile(item.target)`. No
  `Tabs.Root`, no hardcoded label array — matches the Code Style example in spec §4.

  **Acceptance criteria:**
  - [x] Renders exactly four `Button`s, one per `HUB_NAV_ITEMS` entry.
  - [x] Clicking a tile calls `setActiveHubTile` with that entry's `target`.
  - [x] No literal label strings appear in `HubNav.tsx` — all text traces to
        `hubNavConfig.ts`.

  **Verification:**
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2, Task 3.

  **Files:** `src/components/panels/screen/console/HubNav.tsx` (new), `src/components/panels/screen/console/HubNav.css` (new)

  **Estimated scope:** S (2 new files)

- [x] **Task 7: Rebuild `ConsolePanel.tsx`/`.css`; delete `ConsoleNavigation.tsx`/`.css`** — done (test-first: `ConsolePanel.test.tsx` written before the rewrite, not deferred to Task 8)

  **Description:** `ConsolePanel` renders `<HubNav />` when `activeHubTile === null`;
  otherwise a back `Button` (local `ButtonSchema` constant, per spec §4) plus the active
  tile's content via a `renderTile` switch covering exactly `robotOptions` → `RobotOptionsTab`,
  `robotEditor` → `RobotEditorTab`, `audioRig` → today's stub markup, `settings` → today's
  stub markup. Session/Composition cases are removed entirely — no `default` case falling
  back to a stub either, since `activeHubTile === null` is handled by the grid branch, not
  the switch. `ConsolePanel.css` drops `.console-nav__list`/`.console-nav__trigger`
  (Tabs-specific) and adds `.console-panel__back` (back-button wrapper). Delete
  `ConsoleNavigation.tsx` and its unused CSS rules once nothing imports it.

  **Acceptance criteria:**
  - [x] `activeHubTile === null` renders `HubNav` and nothing else.
  - [x] Each of the four tile values renders its correct content plus the back button.
  - [x] Clicking the back button calls `setActiveHubTile(null)`.
  - [x] `ConsoleNavigation.tsx`/`.css` no longer exist; no remaining import of either
        anywhere in `src/`.
  - [x] `grep -rn "session\|composition" src/components/panels/screen/console/` returns
        nothing tied to the old tab values (matches on unrelated words like "session" in
        comments are fine — check for the literal tab-value usage, not the substring).

  **Verification:**
  - [x] `npm run build:types`, `npm run lint` clean — this is the point where the rename
        cascade started in Task 3 goes fully green.
  - [x] `npm run build` clean.

  **Dependencies:** Task 3, Task 4, Task 5, Task 6.

  **Files:** `src/components/panels/screen/console/ConsolePanel.tsx`, `src/components/panels/screen/console/ConsolePanel.css`, `src/components/panels/screen/console/ConsoleNavigation.tsx` (deleted), `src/components/panels/screen/console/ConsoleNavigation.css` (deleted, if present — current file is CSS-in-`ConsolePanel.css`; confirm no separate file exists before deleting)

  **Estimated scope:** M (2 rewritten files + 1–2 deletions)

### Checkpoint: Navigation rebuild complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [x] Manual: dev server opens on the tile grid; each tile takes over full-screen with a working back button; spawning a robot from Robot Options still lands on Robot Editor. Confirmed by Crawford. Noted in passing: the New Robot button/spawn system is superseded by Phase 7's Battery/Docking/Job lifecycle — out of scope here, no action needed this phase.

---

### Phase 4: Tests and docs

- [x] **Task 8: `HubNav.test.tsx` + `ConsolePanel.test.tsx`** — superseded, folded into Tasks 6/7

  **What actually happened:** rather than deferring both test files to this task, each was
  written test-first as part of the component that needed it — `HubNav.test.tsx` before
  `HubNav.tsx` in Task 6, `ConsolePanel.test.tsx` before the `ConsolePanel.tsx` rewrite in
  Task 7 — giving a real red→green cycle instead of writing tests against already-built
  code. All of this task's acceptance criteria are satisfied by what Tasks 6/7 shipped;
  see those entries for detail. One coverage item not in the original criteria: `HubNav`'s
  click assertion checks the real resulting `activeHubTile` store state rather than a
  mocked setter, after an early version that monkey-patched `setActiveHubTile` mid-test
  produced a React "not wrapped in act()" warning (the mounted component was subscribed to
  the action reference; replacing it while mounted amounted to an unwrapped state update).
  Reading real state back matches the pattern already used elsewhere in the suite (e.g.
  `RobotAudioTab.test.tsx`).

- [x] **Task 9: `docs/UI_SHELL.md` update** — done

  **Description:** Per the roadmap's Docs note and spec §2: fold "Planned Replacement:
  Hub Tiles" into a renamed "Console Navigation" section for the tab→tile,
  surviving-tiles, and Session/Composition-dropped points; drop "not yet implemented"
  framing for those points specifically. Keep the `robotOptions`/`robotEditor` points
  under "planned" framing until Phases 7 and 9 land — this phase doesn't touch their
  internals, so the doc shouldn't claim they're done.

  **Acceptance criteria:**
  - [x] No section titled "Planned Replacement: Hub Tiles" remains.
  - [x] "Console Navigation" section accurately describes `HubNav` + the full-screen
        takeover model as shipped, for the points confirmed this phase.
  - [x] `robotOptions`/`robotEditor` still read as planned/unfinished, matching reality.

  **Verification:**
  - [x] Manual read-through against the actual shipped behavior from Task 7/8.

  **Dependencies:** Task 7, Task 8.

  **Files:** `docs/UI_SHELL.md`

  **Estimated scope:** S (docs only)

### Final Checkpoint (original four-tile scope)
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Manual a11y check: keyboard/focus navigation through the tile grid and back button. Confirmed by Crawford.
- [ ] Review with human before merging. — superseded by Phase 5 below; re-review after it lands.

---

## Phase 5 (Amendment): Fold `robots` into a list+detail flow

Source: [docs/intent/phase-3-hub.md](../intent/phase-3-hub.md)'s Amendment section,
[docs/specs/HUB.md §8](../specs/HUB.md). Requested by Crawford after the four-tile version
above shipped; two open questions (back-button nesting, spawn-controls fate) resolved
directly with him before starting.

### Dependency graph

```
Task 10 (types/hub.ts: HubTile -> 3 values)
    │
    ├── Task 11 (hubNavConfig.ts: collapse robotOptions+robotEditor -> robots)
    │
    └── Task 12 (RobotEditorTab.tsx: remove now-invalid activeHubTile guard)
            │
            └── Task 13 (RobotsTab.tsx/.css/.test.tsx: new list + New Robot)
                    │
                    └── Task 14 (ConsolePanel.tsx: nested render/back logic;
                                 delete RobotOptionsTab.tsx/.css/.test.tsx)
                            │
                            └── Task 15 (docs/UI_SHELL.md update)
```

- [x] **Task 10: `src/types/hub.ts` — `HubTile` shrinks to `'robots' | 'audioRig' | 'settings'`** — done

  **Description:** Drop `'robotOptions'`/`'robotEditor'`, add `'robots'`. `HubNavItem` shape unchanged.

  **Acceptance criteria:**
  - [x] `HubTile` has exactly the three values above.

  **Verification:**
  - [x] `npm run build:types` — expected red at every call site still using the old values, same pattern as Task 3.

  **Dependencies:** None.

  **Files:** `src/types/hub.ts`

- [x] **Task 11: `hubNavConfig.ts` — collapse `robotOptions` + `robotEditor` into one `robots` entry** — done

  **Description:** Remove the `robotEditor` entry entirely (no longer grid-selectable). Rename the `robotOptions` entry's `id`/`target` to `robots`, `humanLabel` to `"Robots"`, keep `loreLabel: 'UNIT ROSTER'` (fits a roster/list at least as well as it fit the old spawn-config screen).

  **Acceptance criteria:**
  - [x] Exactly three entries: `robots`, `audioRig`, `settings`.

  **Verification:**
  - [x] `npm run build:types` clean.

  **Dependencies:** Task 10.

  **Files:** `src/data/hubNavConfig.ts`

- [x] **Task 12: `RobotEditorTab.tsx` — remove the now type-invalid `activeHubTile` guard** — done

  **Description:** `if (activeHubTile !== 'robotEditor') return null;` no longer type-checks (`'robotEditor'` isn't a `HubTile` value). Remove the guard and its `activeHubTile` read entirely — `ConsolePanel` (Task 14) will only mount this component when `selectedRobotId` is already set, and the existing `if (!selectedRobotId) return <div>...` fallback stays as the real defensive check.

  **Acceptance criteria:**
  - [x] No reference to `activeHubTile` remains in this file.
  - [x] The `!selectedRobotId` empty-state fallback is unchanged.

  **Verification:**
  - [x] `npm run build:types` clean for this file.

  **Dependencies:** Task 10.

  **Files:** `src/components/panels/screen/console/RobotEditorTab.tsx`

- [x] **Task 13: Create `RobotsTab.tsx`/`.css`/`.test.tsx`** — done

  **Description:** Lists every robot in the active locale (name via the `Button` primitive, `humanLabel: robot.name ?? robot.id`) plus a `"+ New Robot"` action at the top, reusing the spawn logic `RobotOptionsTab.handleNewRobot` had — minus the tile-switch, since we're already inside the `robots` tile: spawn, then `selectRobot(newRobot.id)` only. Clicking a robot row calls `selectRobot(robot.id)`. No avatar/job/battery card — that's Phase 8's job once Battery/Job data exists (see intent doc's Amendment).

  **Acceptance criteria:**
  - [x] Renders one `Button` per robot in the active locale, `humanLabel` = robot name (or id fallback).
  - [x] Clicking a robot row calls `selectRobot` with that robot's id.
  - [x] "+ New Robot" spawns a robot and selects it (`selectRobot`), without touching `activeHubTile`.

  **Verification:**
  - [x] `npm test` — new test passes (test-first, per this phase's established pattern).

  **Dependencies:** Task 12 (sequenced after, not a hard code dependency — grouped to land alongside the tile it replaces).

  **Files:** `src/components/panels/screen/console/RobotsTab.tsx` (new), `.css` (new), `.test.tsx` (new)

- [x] **Task 14: `ConsolePanel.tsx` — nested render/back logic; delete `RobotOptionsTab.tsx`/`.css`/`.test.tsx`** — done

  **Description:** `renderTile('robots')` switches on `selectedRobotId`: `null` → `RobotsTab`, set → `RobotEditorTab`. Back button becomes tile-aware: if `activeHubTile === 'robots' && selectedRobotId`, clear `selectedRobotId` (stay on `robots`, return to list); otherwise clear `activeHubTile` (return to grid). Delete `RobotOptionsTab.tsx`/`.css`/`.test.tsx` — fully superseded.

  **Acceptance criteria:**
  - [x] Selecting `robots` with no robot selected shows `RobotsTab`.
  - [x] Selecting a robot (from `RobotsTab` or carried over from a prior session) shows `RobotEditorTab`.
  - [x] Back from the robot editor returns to `RobotsTab`, same tile, `activeHubTile` unchanged.
  - [x] Back from `RobotsTab` (no robot selected) or any other tile returns to the grid.
  - [x] `RobotOptionsTab.tsx`/`.css`/`.test.tsx` no longer exist; no remaining import anywhere in `src/`.

  **Verification:**
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` — full suite passes.
  - [x] `npm run build` clean.

  **Dependencies:** Task 11, Task 12, Task 13.

  **Files:** `src/components/panels/screen/console/ConsolePanel.tsx`, `RobotOptionsTab.tsx` (deleted), `RobotOptionsTab.css` (deleted), `RobotOptionsTab.test.tsx` (deleted)

- [x] **Task 15: `docs/UI_SHELL.md` update** — done

  **Description:** Update the "Console Navigation" section's implementation-status bullets for the `robots` tile (list + New Robot, nested editor) and note `robotEditor` is no longer a standalone tile.

  **Acceptance criteria:**
  - [x] No remaining reference to a standalone `robotOptions`/`robotEditor` tile pair.

  **Verification:**
  - [x] Manual read-through against shipped behavior.

  **Dependencies:** Task 14.

  **Files:** `docs/UI_SHELL.md`

### Final Checkpoint (Phase 5)
- [x] `npm run build:types`, `npm run lint`, `npm test` (61 files / 710 tests), `npm run build` all clean.
- [ ] Manual check: Robots tile shows a list, "+ New Robot" works, selecting a robot shows its editor, back returns to the list, back again returns to the grid.
- [ ] Review with human before merging.
