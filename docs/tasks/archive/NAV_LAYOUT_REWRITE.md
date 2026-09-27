# Implementation Plan: Navigation & Layout Rewrite

Source spec: [docs/specs/NAV_LAYOUT_REWRITE.md](../specs/NAV_LAYOUT_REWRITE.md) (approved 2026-09-22, all §7 decisions resolved). Source intent: [docs/intent/nav-layout-rewrite.md](../intent/nav-layout-rewrite.md). No roadmap phase number assigned yet.

## Overview

Replace the 3-tile `RadioButton` nav in `Header` + `Console`/`ConsolePanel`'s tile switch with a schema-driven, always-accessible nav tree (docked left on desktop/tablet, slide-off-left + hamburger-reopen on mobile) and a single content pane, per spec §1–§6. Every leaf/category content component in spec §2's mapping table is **reused, not rebuilt** — the new work is the tree shell itself, `AccordionContainer`'s retirement from its 5 real consumers, and relocating Volume/Quality/Tempo/Companies-CRUD to their new tree homes.

**Ordering principle (spec §7 Q7): shell-first, then migrate.** Phase 1 builds `NavTree`/`NavPanel`/`ContentPane` + the `uiStore` additions, wired to **today's existing** `ConsolePanel`/`TILE_CONTENT` dispatch — the tree can select and expand, and shows today's tile content completely unchanged, with zero `AccordionContainer` removal. Phase 2 migrates each `AccordionContainer` consumer, relocates Volume/Quality/Tempo out of `Header`/`AudioRigDrawer`, and moves Companies CRUD into per-node interactions. The app is left in a working, testable state after every single task in both phases.

## Architecture Decisions

- **State stays additive** (spec §1.3) — `selectedRobotId`/`selectedCompanyId`/`allRobotsSelected` unchanged; new fields are `selectedSection`, `isNavPanelOpen`, `expandedProbeId`, `expandedCompanyId`, `expandedFleetParamsGroup`, all plain serializable values.
- **`HubTile` gains a 4th value, `'companies'`** (Q1) — keeps `ConsolePanel`'s existing `Record<HubTile, ...>` exhaustiveness guarantee.
- **Company delete uses Radix `AlertDialog`** (Q2) — the app's first confirmation dialog, already installed, unused elsewhere.
- **`CompanyManager.tsx` dissolves into the tree** (Q3) — `CompanyButtonRow`'s per-company color-coding moves into tree row styling.
- **Doc-content authoring is out of scope for this plan** (Q4) — deferred to its own follow-up spec; every node's content area leaves a stubbed slot, not fully wired.
- **Fleet Params' 3 groups (EQ & Filters / Time & Space / Output) are category-only** (Q5) — no group-level content, drill into EQ/HPF/LPF/Reverb/Delay/Compression/Limiter individually.
- **`Console.tsx` is repurposed into `ContentPane.tsx`** (Q6) — preserves its existing "render nothing so `WorldView` clicks pass through" behavior rather than re-deriving it.
- **The nav tree is a hand-rolled real ARIA tree** (spec §4 "Always") — `role="tree"`/`role="treeitem"`, roving `tabindex`, full APG Up/Down/Left/Right/Enter/Space — no Radix primitive covers this.
- **No `AccordionContainer` deletion until every consumer is migrated** (spec §4) — an intermediate state with some content still accordion-wrapped is expected mid-plan, not a defect.
- **Every animation (nav slide, expand/collapse) is a GSAP timeline in `timelineMap`**, triggering only semantic state changes — never a timer, never a direct `AudioEngine` call (CLAUDE.md, spec §4).
- **Stacked commits, one per task**, matching this repo's own precedent (`docs/tasks/ACCORDION_LAZY_MOUNT.md`). No push until Crawford says so.

## Dependency Graph

```
Phase 1 (shell, existing content unchanged)
──────────────────────────────────────────
Task 1 (uiStore + HubTile additions)
    │
    ├──→ Task 2 (navTreeConfig.ts static schema)
    │        │
    │        └──→ Task 3 (useNavTree hook — static + dynamic Probes/Companies branches)
    │                 │
    │                 └──→ Task 4 (NavTreeNode — structure/ARIA, no keyboard)
    │                          │
    │                          └──→ Task 5 (NavTree — roving tabindex + keyboard)
    │                                   │
    │                                   └──→ Task 6 (NavPanel — docked/slide shell + GSAP)
    │                                            │
    │                                            ├──→ Task 7 (NavToggleButton, mobile)
    │                                            └──→ Task 8 (ContentPane, from Console.tsx)
    │                                                     │
    │                                                     └──→ Task 9 (wire into ScreenViewport)
    │                                                              │
    │                                                              └──→ Task 10 (trim Header's old nav RadioButton)
    │                                                                       │
    │                                                                       └──→ CHECKPOINT 1
                                                                                     │
Phase 2 (migrate content, retire AccordionContainer)                               │
──────────────────────────────────────────────────────────────────────────────────┘
Task 11 (relocate global Volume → Settings)
Task 12 (relocate Tempo → Settings)
Task 13 (relocate Quality/AudioLoadPanel → Settings)
    │  (11–13 independent of each other, all depend on Checkpoint 1)
    └──→ CHECKPOINT 2
              │
Task 14 (migrate AudioRigDrawer off AccordionContainer)
Task 15 (migrate PingControlsDrawer off AccordionContainer)
Task 16 (migrate PingContourDrawer off AccordionContainer)
Task 17 (migrate SignatureArrayDrawer off AccordionContainer)
Task 18 (migrate RobotFilterPanel off AccordionContainer)
    │  (14–18 independent of each other, all depend on Checkpoint 2)
    └──→ CHECKPOINT 3
              │
Task 19 (Probes dynamic subtree + All Probes bulk-edit wiring)
    │
    └──→ Task 20 (Companies dynamic subtree + CRUD relocation + AlertDialog delete)
              │
              └──→ Task 21 (delete AccordionContainer + accordionAnimation.ts + openAccordions.ts)
                        │
                        └──→ Task 22 (docs: UI_SHELL.md, COMPONENT_LIBRARY.md, roadmap entry)
                                  │
                                  └──→ CHECKPOINT 4 (final)
```

---

## Task List

### Phase 1: Shell (nav tree + content pane, today's content unchanged)

- [ ] **Task 1: `uiStore` and `HubTile` additions**

  **Description:** Add the spec §1.3 fields/actions to `uiStore.ts` (`RobotSection` type, `selectedSection`, `isNavPanelOpen`, `expandedProbeId`, `expandedCompanyId`, `expandedFleetParamsGroup`, and their setters) and extend `HubTile` in `src/types/hub.ts` with `'companies'`. No UI changes yet — this is pure state-layer groundwork every later task builds on.

  **Acceptance criteria:**
  - [ ] `UIStore` interface and its `create<UIStore>()` implementation both include every new field/action from spec §1.3, all plain strings/booleans/`null`.
  - [ ] `HubTile` is `'robots' | 'audioRig' | 'settings' | 'companies'`; `ConsolePanel.tsx`'s `TILE_CONTENT: Record<HubTile, ...>` fails to compile until a `'companies'` entry is added (confirms the exhaustiveness guarantee still holds).
  - [ ] `ConsolePanel.tsx` gains a placeholder `'companies'` entry (e.g. rendering `CompanyManager` as today, unchanged) purely to keep the build green — real relocation is Task 20.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- uiStore` passes (new/updated `uiStore.test.ts` covering each new setter).
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`, `src/types/hub.ts`, `src/components/panels/screen/console/ConsolePanel.tsx`

  **Estimated scope:** S (3-4 files).

- [ ] **Task 2: `navTreeConfig.ts` static schema**

  **Description:** Author `src/data/navTreeConfig.ts` per spec §5.1 — `NavTreeNodeSchema` type plus `NAV_TREE_SCHEMA`, covering the fully static branches (Settings and its 4 children; Fleet Params and its 3 groups × their leaves) and the static *parent* nodes for the dynamic branches (`{ id: 'probes', humanLabel: 'Probes', children: [{ id: 'probes.all', humanLabel: 'All Probes', children: [...] }] }` and the equivalent `companies` parent with no static per-company children). No component reads this yet.

  **Acceptance criteria:**
  - [ ] `NAV_TREE_SCHEMA` contains all 4 top-level branches (Settings, Fleet Params, Probes, Companies) matching spec §2's table exactly — node ids namespaced by branch (e.g. `settings.volume`, `fleetParams.eqFilters.eq`).
  - [ ] A type-level or runtime test asserts every leaf id referenced elsewhere in this plan (Tasks 11–20) exists in the schema, catching a typo'd id early.
  - [ ] File follows the existing typed-config-file convention (`headerNavConfig.ts`'s doc-comment style, no hardcoded labels elsewhere).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- navTreeConfig` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1 (imports nothing from it directly, but establishes the id-naming convention `useNavTree` in Task 3 relies on).

  **Files:** `src/data/navTreeConfig.ts`, `src/data/navTreeConfig.test.ts`

  **Estimated scope:** S (1-2 files).

- [ ] **Task 3: `useNavTree` hook — resolves live state against the schema**

  **Description:** `src/components/panels/screen/nav/useNavTree.ts` merges `NAV_TREE_SCHEMA`'s static nodes with dynamically-generated per-robot (`probes.<robotId>.*`) and per-company (`companies.<companyId>.*`) subtrees, read live from `localeStore`. Exposes, for a given node id: whether it's expanded, whether it's selected, and callbacks to select/toggle-expand it — translating between the tree's generic node ids and the typed `uiStore` fields (`activeHubTile`, `selectedRobotId`, `selectedCompanyId`, `selectedSection`, the three `expandedXxxId` fields) per spec §1.5's "never parse a node id to derive selection" rule.

  **Acceptance criteria:**
  - [ ] Selecting `probes.<id>` sets `selectedRobotId` and `activeHubTile: 'robots'`; selecting `probes.<id>.volume` additionally sets `selectedSection: 'volume'`; equivalent mapping for `companies.<id>.*` and the 4 static branches.
  - [ ] Expanding `probes.<id>` sets `expandedProbeId` to that robot's id and clears it if a *different* probe is expanded (accordion-of-one, spec §Success) — verified with 2+ robots in a test locale.
  - [ ] Expanding a Fleet Params group (e.g. `fleetParams.eqFilters`) sets `expandedFleetParamsGroup` and collapses any other expanded group at that level; independent of `expandedProbeId`/`expandedCompanyId` (each level's accordion-of-one doesn't cross branches).
  - [ ] Per-robot/per-company generated nodes track `localeStore`'s live roster/company list — adding or removing a robot/company changes the hook's output without a remount.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- useNavTree` passes, covering each mapping above plus the accordion-of-one cases.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`

  **Estimated scope:** M (2 files, non-trivial logic).

- [ ] **Task 4: `NavTreeNode` — structure and ARIA attributes (no keyboard yet)**

  **Description:** `NavTreeNode.tsx` renders one row recursively per spec §5.2: a name button (click = select), a separate `+`/`-` button (click = toggle-expand only, `stopPropagation`ed), and `role="treeitem"`/`aria-expanded`/`aria-selected`/`aria-level` wired to `useNavTree`'s per-node state. Children render in a `role="group"` wrapper when expanded. Keyboard/focus management is explicitly deferred to Task 5 — this task proves the structure and decoupled click behavior only.

  **Acceptance criteria:**
  - [ ] Clicking a node's name selects it (verified via a mocked `useNavTree`) and does not change any *other* node's expansion.
  - [ ] Clicking a node's `+`/`-` toggles that node's expansion only — the click never fires the name's `onSelect`.
  - [ ] A node with `children` (schema-defined or dynamically generated) renders `+`/`-`; a leaf with none does not.
  - [ ] `aria-expanded`/`aria-selected`/`aria-level` values match the underlying state exactly, including `aria-expanded={undefined}` on leaves (not `false` — matches `AccordionContainer`'s own precedent per spec §5.2).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- NavTreeNode` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/nav/NavTreeNode.tsx`, `src/components/panels/screen/nav/NavTreeNode.css`, `src/components/panels/screen/nav/NavTreeNode.test.tsx`

  **Estimated scope:** M (3 files).

- [ ] **Task 5: `NavTree` — roving tabindex and full keyboard navigation**

  **Description:** `NavTree.tsx` is the `role="tree"` root, rendering top-level `NavTreeNode`s and owning the APG roving-tabindex pattern (spec §4 "Always"): exactly one visible row has `tabindex="0"` at a time (the last-focused, or the first on mount), every other visible row `tabindex="-1"`. Implements Up/Down (move focus among currently-visible rows), Right (expand / move into first child), Left (collapse / move to parent), Enter/Space (activate = select). Focus state is component-local (`useState`/`useRef`), never `uiStore` (spec §4 "Never", matching `useLfoTargetGroup`'s precedent).

  **Acceptance criteria:**
  - [ ] At any moment, exactly one rendered `treeitem` has `tabindex="0"`; all others have `tabindex="-1"`.
  - [ ] Up/Down move the roving tabindex (and DOM focus) to the previous/next *visible* row, skipping collapsed nodes' hidden children.
  - [ ] Right on a collapsed parent expands it without moving focus; Right on an already-expanded parent (or a leaf) moves focus to its first child (parent) or does nothing (leaf).
  - [ ] Left on an expanded parent collapses it without moving focus; Left on a collapsed node or a leaf moves focus to its parent.
  - [ ] Enter/Space on a focused row selects it, identical to a click on its name.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- NavTree.test` passes, using `@testing-library/user-event` keyboard simulation for every case above, against a fixture tree at least 3 levels deep with 2+ siblings per level.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/components/panels/screen/nav/NavTree.tsx`, `src/components/panels/screen/nav/NavTree.css`, `src/components/panels/screen/nav/NavTree.test.tsx`

  **Estimated scope:** M (3 files, highest-risk task in Phase 1 — isolated deliberately per spec §7 Q7's rationale).

- [ ] **Task 6: `NavPanel` — docked (desktop/tablet) vs. slide-off (mobile) shell**

  **Description:** `NavPanel.tsx` wraps `NavTree` and resolves the two layout modes: permanently docked at the left edge above a fixed viewport width (desktop/tablet, no slide mechanic — spec §7 Q3 variation, confirmed as the near-free case), and off-canvas sliding on/off from the left below it, driven by `uiStore.isNavPanelOpen` via a GSAP timeline registered in `timelineMap` (`setTimeline`/`killTimeline`, respecting `prefers-reduced-motion`, matching `AccordionContainer`'s existing animation precedent). Selecting a node (via `useNavTree`) also sets `isNavPanelOpen: false` on mobile only (spec: "mobile also auto-collapses the nav panel on content select").

  **Acceptance criteria:**
  - [ ] Above the desktop/tablet breakpoint, `NavPanel` renders permanently visible with no slide animation and ignores `isNavPanelOpen`.
  - [ ] Below that breakpoint, `isNavPanelOpen: false` renders the panel off-screen left (or `aria-hidden`/not in the tab order while closed — decide and test one consistently) and `true` slides it into view.
  - [ ] Selecting any node while below the breakpoint sets `isNavPanelOpen: false` afterward; selecting a node at desktop/tablet width leaves `isNavPanelOpen` untouched.
  - [ ] `prefers-reduced-motion` snaps the slide instantly (0-duration), matching `getAccordionDuration`'s existing convention.
  - [ ] The timeline is registered in `timelineMap` and killed on unmount — no orphaned GSAP instance.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- NavPanel` passes (mock `matchMedia` for both breakpoint states; assert `setTimeline`/`killTimeline` calls via the existing `timelineMap` test double pattern).
  - [ ] `npm run lint` clean.
  - [ ] Manual check (jsdom can't see real animation frames, per this repo's own precedent): slide feel at real mobile width, no flash of unstyled/mid-transition content.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/nav/NavPanel.tsx`, `src/components/panels/screen/nav/NavPanel.css`, `src/components/panels/screen/nav/NavPanel.test.tsx`

  **Estimated scope:** M (3 files).

- [ ] **Task 7: `NavToggleButton` — persistent mobile reopen affordance**

  **Description:** A small, always-rendered (mobile breakpoint only) button that toggles `uiStore.isNavPanelOpen`, per spec's confirmed "persistent hamburger/menu button" answer. Lives inside `ScreenViewport` (never `SleeveContainer`, CLAUDE.md), visible regardless of what `ContentPane` currently shows.

  **Acceptance criteria:**
  - [ ] Renders only below the mobile/tablet breakpoint (or is visually/functionally inert above it — pick one and test it).
  - [ ] Clicking it toggles `isNavPanelOpen`; its own accessible name/state (`aria-expanded` or `aria-pressed`) reflects the panel's current open/closed state.
  - [ ] Remains reachable (correct tab order, not obscured) whether `ContentPane` is empty or showing content.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- NavToggleButton` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/components/panels/screen/nav/NavToggleButton.tsx`, `src/components/panels/screen/nav/NavToggleButton.css`, `src/components/panels/screen/nav/NavToggleButton.test.tsx`

  **Estimated scope:** S (2-3 files).

- [ ] **Task 8: `ContentPane` — repurpose `Console.tsx`, add the close button**

  **Description:** Per spec §7 Q6, rename/restructure `Console.tsx` into `ContentPane.tsx`, preserving its "render nothing (not an empty wrapper) when nothing is selected, so `WorldView` clicks pass through" behavior — now gated on whichever `uiStore` fields currently indicate "something is selected" (`activeHubTile !== null`, unchanged condition for this task) rather than being rewritten from scratch. Adds an always-present close button when content is shown, clearing the relevant selection state back to that branch's blank/landing state. Still renders through the **existing, unmigrated** `ConsolePanel`/`TILE_CONTENT` — no content component changes yet.

  **Acceptance criteria:**
  - [ ] With nothing selected, `ContentPane` renders `null` (not an empty div) — `WorldView` remains clickable underneath, exactly matching today's `Console.tsx` behavior (regression-tested against the existing `Console.test.tsx` cases, ported over).
  - [ ] With something selected, a close button is always visible and, when clicked, clears the selection back to the blank state (`activeHubTile: null` and/or `selectedRobotId`/`selectedCompanyId`/`selectedSection: null` as appropriate to what was open).
  - [ ] Existing `ConsolePanel` back-button behavior (robot-detail → list) is unaffected — this task doesn't touch `ConsolePanel.tsx`'s own dispatch logic beyond Task 1's placeholder.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- ContentPane` passes; old `Console.test.tsx` cases pass under the new name/file.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/console/ContentPane.tsx` (from `Console.tsx`), `src/components/panels/screen/console/ContentPane.css`, `src/components/panels/screen/console/ContentPane.test.tsx`, delete `Console.tsx`/`Console.css`/`Console.test.tsx`

  **Estimated scope:** S (rename + small addition, 3-4 files).

- [ ] **Task 9: Wire `NavPanel`/`NavToggleButton`/`ContentPane` into `ScreenViewport`**

  **Description:** Compose the new pieces as siblings of `Header`/`WorldView` inside `ScreenViewport` (never inside `SleeveContainer`, CLAUDE.md non-negotiable) — `NavPanel` and `NavToggleButton` alongside `ContentPane` (replacing the old bare `Console` render). This is the integration task that makes the new shell actually reachable in the running app for the first time.

  **Acceptance criteria:**
  - [ ] `ScreenViewport` renders `Header`, `WorldView`, `NavPanel`, `NavToggleButton` (mobile), `ContentPane`, all inside `ScreenViewport` — grep confirms no new interactive element lands inside `SleeveContainer`.
  - [ ] Selecting a node in `NavTree` (e.g. `robots` branch) shows the same `RobotsTab` content today's Header `RadioButton` nav would have shown — content is provably unchanged, only the trigger UI is new.
  - [ ] `WorldView` click-through still works when nothing is selected (Task 8's regression test extended to this integrated tree).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test` (full suite) passes.
  - [ ] `npm run build` succeeds.
  - [ ] Manual check: `npm run dev`, click through Settings/Fleet Params/Probes/Companies via the new tree, confirm each shows the same content the old 3-tile nav showed for the 3 tiles that already existed.

  **Dependencies:** Task 7, Task 8.

  **Files:** `src/components/panels/physical/ScreenViewport.tsx`, `src/components/panels/physical/ScreenViewport.css`, `src/components/panels/physical/ScreenViewport.test.tsx`

  **Estimated scope:** S (2-3 files).

- [ ] **Task 10: Trim Header's old tile-nav `RadioButton`**

  **Description:** Remove `Header`'s row-3 `RadioButton` (`HEADER_NAV_SCHEMA`) and its `handleNavChange`/`handleNavDeselect` wiring, now fully superseded by `NavTree`. `Header` keeps the power rocker (rendered by `SleeveContainer`, unaffected), the Mute `Toggle`, and the status readout row. **The volume `SliderLinear` stays in `Header` for now** — it doesn't move until Task 11 gives `settings.volume` real content, so global volume control is never unavailable mid-migration. `headerNavConfig.ts` becomes unused and is deleted in this task (nothing else imports `HEADER_NAV_SCHEMA`).

  **Acceptance criteria:**
  - [ ] `Header.tsx` no longer imports or renders `RadioButton`/`HEADER_NAV_SCHEMA`; the nav-related handlers are removed.
  - [ ] `Header`'s Mute toggle and volume slider both still function exactly as before this task.
  - [ ] `headerNavConfig.ts` is deleted; `npm run build:types` confirms nothing else references it.
  - [ ] `docs/UI_SHELL.md`'s "Console Navigation" section gets a short note that navigation now lives in `NavTree`, not a full rewrite yet (the full doc rewrite is Task 22).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test` (full suite, including updated `Header.test.tsx`) passes.
  - [ ] `npm run lint` clean.
  - [ ] Manual check: Header visually shows only power/mute/volume/status; all navigation happens through the tree.

  **Dependencies:** Task 9.

  **Files:** `src/components/panels/screen/Header.tsx`, `src/components/panels/screen/Header.css`, `src/components/panels/screen/Header.test.tsx`, delete `src/data/headerNavConfig.ts` (+ its test if any), `docs/UI_SHELL.md`

  **Estimated scope:** S (4-5 files).

### CHECKPOINT 1 — Shell complete

- [ ] Full suite green: `npm test`
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean
- [ ] Manual: every one of today's 3 tiles (Robots/Audio Rig/Sector Settings) is reachable only through the new tree, content identical to before, `WorldView` click-through still works, mobile slide + reopen button work at a real phone width
- [ ] Screen reader spot-check on the tree itself (not yet gating — full pass is Checkpoint 4) — catch anything glaringly broken before building more on top of it
- [ ] **Review with Crawford before starting Phase 2**

---

### Phase 2: Migrate content, retire `AccordionContainer`

- [ ] **Task 11: Relocate global Volume to Settings → Volume**

  **Description:** Move the volume `SliderLinear`/`VOLUME_SCHEMA` currently in `Header` (row 1) to render as `settings.volume`'s content in `ContentPane`, bound to the same `audioStore.volume`/`setVolume`. Remove it from `Header` once relocated — Mute stays.

  **Acceptance criteria:**
  - [ ] Selecting Settings → Volume in the tree shows the slider, live-bound to `audioStore.volume`, identical behavior (0–100%, 1% steps) to today's Header instance.
  - [ ] `Header.tsx` no longer renders the volume slider; its row-1 layout adjusts to Mute alone.
  - [ ] Muting still works from `Header` regardless of whether Settings → Volume is currently selected.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test` (updated `Header.test.tsx` + new content test) passes.
  - [ ] `npm run lint` clean.
  - [ ] Manual: adjusting volume from the new location audibly changes output.

  **Dependencies:** Checkpoint 1.

  **Files:** `src/components/panels/screen/Header.tsx`, `src/components/panels/screen/Header.css`, new content component under `src/components/panels/screen/nav/content/` (naming resolved at implementation time) + its test

  **Estimated scope:** S (3 files).

- [ ] **Task 12: Relocate Tempo to Settings → Tempo**

  **Description:** Move `BPM_SCHEMA`'s slider out of `AudioRigDrawer`'s "Transport & Composition" area into `settings.tempo`'s content, same `audioStore.bpm` binding, unchanged behavior.

  **Acceptance criteria:**
  - [ ] Selecting Settings → Tempo shows the BPM slider, live-bound, identical range/step to today.
  - [ ] `AudioRigDrawer.tsx` no longer renders `BPM_SCHEMA` in its own layout.
  - [ ] Verify per spec R3: confirm (grep + a quick read of `audioBudgetSystem`/tempo consumers) that nothing coupled BPM's *rendering location* to a side effect beyond the store write — if something is found, stop and flag rather than silently patching around it (CLAUDE.md ask-first boundary).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test` (updated `AudioRigDrawer.test.tsx` + new content test) passes.
  - [ ] `npm run lint` clean.
  - [ ] Manual: changing tempo from the new location audibly changes playback speed.

  **Dependencies:** Checkpoint 1. (Independent of Task 11.)

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, new content component + test

  **Estimated scope:** S (2-3 files).

- [ ] **Task 13: Relocate Quality (`AudioLoadPanel`) to Settings → Quality**

  **Description:** Move `AudioLoadPanel` out of `AudioRigDrawer` into `settings.quality`'s content, unchanged internals (`audioStore.robotLoad`/`effectsLoad`, the preset/fine-slider trio).

  **Acceptance criteria:**
  - [ ] Selecting Settings → Quality shows `AudioLoadPanel`, fully functional (preset radio + 2 sliders + the load-description readout).
  - [ ] `AudioRigDrawer.tsx` no longer renders `AudioLoadPanel`.
  - [ ] `AudioLoadPanel.tsx`'s own doc comment ("next to Tempo in Transport & Composition") is updated to reflect its new home, or removed if no longer accurate.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- AudioLoadPanel` and updated `AudioRigDrawer.test.tsx` pass.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 1. (Independent of Tasks 11–12.)

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioLoadPanel.tsx`, new content wiring

  **Estimated scope:** S (2-3 files).

### CHECKPOINT 2 — Settings branch fully populated

- [ ] Full suite green, `npm run build:types`/`lint`/`build` clean
- [ ] Manual: Settings → Volume/Quality/Tempo/Sector Settings all functional from the tree; `Header` shows only power/mute/status; `AudioRigDrawer` no longer has Transport & Composition's bare params
- [ ] **Review with Crawford before starting the `AccordionContainer` migration**

- [ ] **Task 14: Migrate `AudioRigDrawer` off `AccordionContainer`**

  **Description:** Remove the 3 `AccordionContainer`-wrapped groups (`AUDIO_RIG_ACCORDION_GROUPS`) from `AudioRigDrawer.tsx`. Per spec §7 Q5, each effect (EQ, HPF, LPF, Reverb, Delay, Compression, Limiter) becomes its own tree leaf's content — `AudioRigDrawer`'s existing `renderParamControl`/`paramRow`/per-effect `DirectionalPanel` rendering is reused, just invoked per-leaf instead of inside an accordion section. `AudioRigDrawer.tsx` itself likely splits into one small content component per effect (or a single component parameterized by effect key) rather than one monolithic drawer.

  **Acceptance criteria:**
  - [ ] Selecting Fleet Params → EQ & Filters → EQ shows only EQ's params; HPF/LPF equivalently — no accordion, no group-level content (per Q5, category-only groups).
  - [ ] Time & Space (Reverb/Delay) and Output (Compression + its Decay-mode `RadioButton` + Limiter) behave the same way.
  - [ ] `AccordionContainer` no longer appears in `AudioRigDrawer.tsx`'s imports.
  - [ ] Every existing `AudioRigDrawer` behavior test (rig-wide bypass semantics if any remain, per-param `updateParam` dispatch, `AudioLoadPanel`/BPM already relocated in Tasks 12–13) still passes, migrated per §6.2 item 8's "mechanical, no weakened assertion" rule.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- AudioRig` passes (updated/split test files).
  - [ ] `npm run lint` clean.
  - [ ] Manual: dragging a slider under each of the 7 relocated leaves audibly changes that effect.

  **Dependencies:** Checkpoint 2.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx` (+ split files as needed), `src/components/panels/screen/console/AudioRigDrawer.css`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx` (+ split test files), `src/data/audioRigConfig.ts` (if grouping constants need adjusting)

  **Estimated scope:** L — **flagged for further breakdown at implementation time** if it exceeds ~5 files once the per-effect split is designed; likely splits into one task per effect group (EQ & Filters / Time & Space / Output) rather than one task for all 7 effects.

- [ ] **Task 15: Migrate `PingControlsDrawer` (Melody) off `AccordionContainer`**

  **Description:** Remove `PingControlsDrawer`'s `AccordionContainer` wrapper — its content (density/motif/pitch-repeat/octave/click-track) becomes a probe's `Melody` leaf content directly, reusing the component's existing props/internals unchanged.

  **Acceptance criteria:**
  - [ ] Selecting Probes → Probe *N* → Melody shows `PingControlsDrawer`'s content with no accordion chrome, fully functional (density slider, motif toggle, etc.).
  - [ ] `AccordionContainer` no longer appears in `PingControlsDrawer.tsx`'s imports.
  - [ ] `openAllAccordions()` calls in this component's own test file are removed (nothing left to open).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- PingControlsDrawer` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 2. (Independent of Task 14, 16-18.)

  **Files:** `src/components/robot/PingControlsDrawer.tsx`, `src/components/robot/PingControlsDrawer.css` (if any), `src/components/robot/PingControlsDrawer.test.tsx`

  **Estimated scope:** S (2-3 files).

- [ ] **Task 16: Migrate `PingContourDrawer` (Envelope) off `AccordionContainer`**

  **Description:** Same treatment as Task 15 for the ADSR envelope drawer, becoming a probe's `Envelope` leaf content.

  **Acceptance criteria:** (mirrors Task 15)
  - [ ] Selecting Probes → Probe *N* → Envelope shows the ADSR controls with no accordion chrome, fully functional.
  - [ ] `AccordionContainer` no longer appears in `PingContourDrawer.tsx`'s imports.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- PingContourDrawer` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 2. (Independent of Task 14-15, 17-18.)

  **Files:** `src/components/robot/PingContourDrawer.tsx`, `src/components/robot/PingContourDrawer.test.tsx`

  **Estimated scope:** S (2 files).

- [ ] **Task 17: Migrate `SignatureArrayDrawer` (Source) off `AccordionContainer`**

  **Description:** Same treatment for the 3-layer oscillator drawer, becoming a probe's `Source` leaf content. `LfoTargetGroup`/`useLfoTargetGroup` internals (per-layer selected-target state) are unaffected — confirm they survive the accordion removal unchanged (this component's existing "survives close/reopen" test coverage from the lazy-mount era, if any, gets ported rather than dropped).

  **Acceptance criteria:**
  - [ ] Selecting Probes → Probe *N* → Source shows all 3 layers' controls with no accordion chrome, fully functional, including each layer's `LfoTargetGroup`.
  - [ ] `AccordionContainer` no longer appears in `SignatureArrayDrawer.tsx`'s imports.
  - [ ] A layer's `LfoTargetGroup` selected-target state still behaves correctly when navigating away from and back to Source (component remounts fresh — confirm this is the intended behavior now that there's no "stays mounted" accordion guarantee, and document if it differs from today).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- SignatureArrayDrawer` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 2. (Independent of Task 14-16, 18.)

  **Files:** `src/components/robot/SignatureArrayDrawer.tsx`, `src/components/robot/SignatureArrayDrawer.test.tsx`

  **Estimated scope:** M (2 files, but the LFO-target-state question above needs a real answer, not just mechanical migration).

- [ ] **Task 18: Migrate `RobotFilterPanel` off `AccordionContainer`**

  **Description:** Remove `RobotFilterPanel`'s own `AccordionContainer` usage (its filter controls, whatever they currently collapse behind) — becomes always-visible content within the Probes category's landing view (the existing `RobotsTab` list), matching spec §2's "Probes → category → `RobotsTab`'s existing filterable card list, as-is" mapping.

  **Acceptance criteria:**
  - [ ] Filter controls are visible and functional without needing to open an accordion first.
  - [ ] `AccordionContainer` no longer appears in `RobotFilterPanel.tsx`'s imports.
  - [ ] `RobotsTab`'s existing card list + filter behavior is otherwise unchanged.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- RobotFilterPanel` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 2. (Independent of Task 14-17.)

  **Files:** `src/components/panels/screen/console/RobotFilterPanel.tsx`, `src/components/panels/screen/console/RobotFilterPanel.css`, `src/components/panels/screen/console/RobotFilterPanel.test.tsx`

  **Estimated scope:** S (3 files).

### CHECKPOINT 3 — Every real drawer off `AccordionContainer`

- [ ] Full suite green, `npm run build:types`/`lint`/`build` clean
- [ ] `grep -r "AccordionContainer" src/components` returns only `AccordionContainer.tsx`/`.css`/`.test.tsx` themselves and `src/testUtils/openAccordions.ts` — no remaining product consumer
- [ ] Manual: every relocated leaf (7 effects, Melody/Envelope/Source per probe) functions with no accordion chrome anywhere in the app
- [ ] **Review with Crawford before Companies work and deletion**

- [ ] **Task 19: Probes dynamic subtree + "All Probes" bulk-edit wiring**

  **Description:** Wire the `probes.<robotId>.*` dynamic subtree (already resolved by `useNavTree`, Task 3) to real content, and build the `probes.all` bulk-edit target — the one genuinely new piece of logic in this migration (spec §2 flags it as having no existing broadcast precedent beyond `CompanyOptionsSection`'s single-company pattern). Reuses `robotOptionsActions`' existing `applyXxx` functions, looped across every robot in the active locale, mirroring `CompanyOptionsSection`'s existing snapshot-bound broadcast shape but scoped to "every robot" instead of one company's members.

  **Acceptance criteria:**
  - [ ] Selecting Probes → Probe *N* shows `RobotDisplaySection`; its Volume/Melody/Envelope/Source children show the same single-robot content Tasks 15-17 already migrated, scoped to that specific robot (no regression from earlier tasks).
  - [ ] Selecting Probes → All Probes → Volume (etc.) shows the same 4 drawer components bound to a broadcast target; editing a field there calls the matching `applyXxx` once per robot in the active locale (verified via a spy/mock, not just "the UI renders").
  - [ ] A broadcast edit under All Probes does not silently desync from a subsequent single-robot edit — editing one robot afterward changes only that robot (matches Companies' existing "broadcast, not link" semantics, spec intent doc).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- probesAll` (or equivalent new test file) passes, covering the fan-out call count.
  - [ ] `npm run lint` clean.
  - [ ] Manual: an All Probes Volume edit is audible across every robot in the locale.

  **Dependencies:** Checkpoint 3.

  **Files:** new bulk-edit wiring module (naming resolved at implementation time, likely `src/systems/robotOptionsActions.ts` gains an `applyToAll` variant or a thin wrapper), `src/components/panels/screen/nav/content/` (All Probes content component) + tests

  **Estimated scope:** M (3-4 files).

- [ ] **Task 20: Companies dynamic subtree + CRUD relocation**

  **Description:** Dissolve `CompanyManager`/`CompanyButtonRow` (spec §7 Q3) — the Companies parent node's content becomes the Create form (staged draft + submit, reusing `CompanyCrudControls`' existing Create half verbatim); each `companies.<id>` node's content becomes the Rename form plus a Delete action wrapped in a Radix `AlertDialog` confirmation (Q2); each company's Volume/Melody/Envelope/Source children reuse `CompanyOptionsSection`'s existing broadcast-bound drawers unchanged. Per-company color-coding (`Company.color`, previously `CompanyButtonRow`'s per-button tint) moves into the corresponding tree row's own styling.

  **Acceptance criteria:**
  - [ ] Clicking the Companies parent node shows the Create form; submitting creates a company and it appears as a new child node without a remount of the whole tree.
  - [ ] Clicking a specific company's name shows Rename (staged draft + submit, unchanged behavior from today) and a Delete button; clicking Delete opens an `AlertDialog`, and only confirming it calls `removeCompany` — cancelling leaves the company untouched.
  - [ ] Each company's Volume/Melody/Envelope/Source children show `CompanyOptionsSection`'s existing broadcast-bound content, functionally identical to today.
  - [ ] Each company's tree row is tinted with `Company.color`, matching the visual cue `CompanyButtonRow`'s buttons previously provided.
  - [ ] `CompanyManager.tsx`/`CompanyButtonRow.tsx` are deleted; nothing imports them.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- Compan` passes (updated `CompanyCrudControls.test.tsx`, new tree-node tests, `AlertDialog` cancel/confirm coverage).
  - [ ] `npm run lint` clean.
  - [ ] Manual: create → rename → delete-with-confirm round trip works end to end from the tree.

  **Dependencies:** Task 19 (reuses the same dynamic-subtree/content-wiring pattern established there).

  **Files:** `src/components/company/CompanyCrudControls.tsx`, delete `src/components/company/CompanyManager.tsx` + `CompanyButtonRow.tsx` (+ their tests), `src/components/panels/screen/nav/NavTreeNode.tsx` (color styling hook), new Delete-confirmation component + test

  **Estimated scope:** M (5 files — at the upper bound; if the `AlertDialog` wiring proves nontrivial, split delete-confirmation into its own task).

- [ ] **Task 21: Delete `AccordionContainer` and its supporting infrastructure**

  **Description:** With Checkpoint 3 confirming zero remaining consumers, delete `AccordionContainer.tsx`/`.css`/`.test.tsx`, `accordionAnimation.ts` (+ test), `src/testUtils/openAccordions.ts` (+ test), and the `AccordionSchema`/`'accordion'` variant from `src/types/controls.ts` (`CONTROL_SCHEMA_TYPES` drops to 13).

  **Acceptance criteria:**
  - [ ] `grep -r "AccordionContainer\|AccordionSchema" src` returns nothing.
  - [ ] `ControlSchema`/`CONTROL_SCHEMA_TYPES` no longer include `'accordion'`; `controls.test.ts`'s "all variants covered" assertion is updated to the new count and still passes.
  - [ ] No orphaned CSS custom properties or class rules referencing `.sc-accordion*` remain in `index.css` or elsewhere.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test` (full suite) passes.
  - [ ] `npm run lint` clean.
  - [ ] `npm run build` succeeds.

  **Dependencies:** Task 20.

  **Files:** delete `src/components/ui/controls/AccordionContainer.tsx`/`.css`/`.test.tsx`, `src/components/ui/controls/accordionAnimation.ts` (+ test), `src/testUtils/openAccordions.ts` (+ test); modify `src/types/controls.ts`, `src/types/controls.test.ts`

  **Estimated scope:** S (mechanical deletion, ~6 files touched but each is trivial).

- [ ] **Task 22: Documentation — `UI_SHELL.md`, `COMPONENT_LIBRARY.md`, roadmap entry**

  **Description:** Rewrite `docs/UI_SHELL.md`'s nav/console sections to describe the tree model as it actually shipped (not this plan's draft — record any deviations found during implementation, per this repo's own "As Shipped" convention, e.g. `ACCORDION_LAZY_MOUNT.md` §8). Remove `AccordionContainer`'s entry from `docs/COMPONENT_LIBRARY.md`'s primitive table (13 primitives, not 14) and fold its "Lazy mounting" subsection into a historical note rather than deleting the record outright. Add a numbered roadmap entry (docs/todo/roadmap.md) once Crawford assigns one, linking this spec/task doc, marked done with any shipped-vs-drafted notes.

  **Acceptance criteria:**
  - [ ] `docs/UI_SHELL.md` accurately describes `NavTree`/`NavPanel`/`ContentPane` and every relocated control's real location — no stale references to `HEADER_NAV_SCHEMA`, `HubNav`, or the old 3-tile model as current.
  - [ ] `docs/COMPONENT_LIBRARY.md`'s primitive count and table reflect `AccordionContainer`'s removal.
  - [ ] `docs/todo/roadmap.md` gains an entry per this repo's existing phase-entry convention, cross-linking the intent/spec/task docs.
  - [ ] `CLAUDE.md`'s reference-doc list is checked for any line that needs updating (e.g. if `UI_SHELL.md`'s one-line description changes materially).

  **Verification:**
  - [ ] Doc-only change — no test/build impact expected; `npm run lint`/`build:types` still run to confirm no accidental code touch.

  **Dependencies:** Task 21.

  **Files:** `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md`, `docs/todo/roadmap.md`, `CLAUDE.md` (if needed)

  **Estimated scope:** S (docs only).

### CHECKPOINT 4 — Final

- [ ] Full suite green: `npm test`, `npm run test:coverage` reviewed for any regression in covered lines
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean
- [ ] Manual: full click-through of every branch/leaf in spec §2's mapping table, at mobile/tablet/desktop widths
- [ ] Screen reader pass (NVDA/VoiceOver) on the tree — the concrete deliverable behind spec §Success's accessibility bar (spec §6.3)
- [ ] `prefers-reduced-motion` verified on both the nav slide and any remaining expand/collapse animation
- [ ] Every "Always"/"Never" boundary in spec §4 spot-checked against the final diff (no interactive UI in `SleeveContainer`, no non-serializable `uiStore` field, no timer-driven animation, no new confirmation dialog beyond company delete)
- [ ] **Final review with Crawford — ready for PR**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Hand-rolled ARIA tree (Task 5) under-tested | High — accessibility regression, hardest to retrofit later | Isolated as its own task with the heaviest keyboard-test requirement in the plan (spec §6.2 item 4); Checkpoint 1 includes an early screen-reader spot-check, not deferred entirely to Checkpoint 4 |
| Task 14 (`AudioRigDrawer` migration) undersized in this plan | Medium — could blow past M/L sizing once the per-effect split is designed | Explicitly flagged in the task itself as a likely further breakdown point; do the design pass first, re-split before implementing if it's more than ~5 files |
| Relocating Tempo/Quality touches audio-adjacent wiring (spec R3) | Medium — could silently change behavior beyond layout | Task 12 has an explicit "confirm no coupling beyond the store write" step with an ask-first escape hatch per CLAUDE.md |
| `SignatureArrayDrawer`'s `LfoTargetGroup` local state no longer "survives collapse" the way `AccordionContainer`'s lazy-mount guaranteed (spec R2) | Low-medium — a UX regression (losing your LFO target selection when navigating away and back) | Task 17 explicitly calls this out as needing a real answer, not silent acceptance; flag to Crawford if it reads as a regression once built |
| Company `AlertDialog` is the app's first confirmation dialog | Low — first-of-its-kind risk, no existing pattern to copy | Task 20 scoped to allow splitting the delete-confirmation piece out on its own if it proves nontrivial |
| Test churn across ~15 files in Phase 2 | Medium — easy for a reviewer to skim past a quietly-weakened assertion | Every migration task requires the existing test file's assertions to survive, mechanically ported (same rule `ACCORDION_LAZY_MOUNT.md` R4 already established and shipped under) |

## Open Questions

- Exact desktop/tablet vs. mobile breakpoint value for `NavPanel`'s docked/slide switch — not fixed in the spec; resolve during Task 6 by checking existing breakpoint constants (`Header.css`'s 430/480/880/1220px tiers, or `CabinetBox`'s mobile≤640/tablet≤1024/desktop breakpoints) rather than inventing a new one.
- Whether a closed `NavPanel` on mobile should be `aria-hidden`/removed from tab order or merely visually off-screen — Task 6 acceptance criteria calls for picking one and testing it; no default is set here.
- Doc-content slots (spec §7 Q4) are explicitly out of scope for every task above — each new content component leaves room for one but does not wire real doc text. A follow-up spec is expected before that slot is filled in.
