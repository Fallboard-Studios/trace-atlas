# Implementation Plan: Underline Link & Nav Panel Deepest-Level Auto-Expand

Source spec: [docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md](../specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md). Source intent: [docs/intent/nav-underline-link-and-auto-expand.md](../intent/nav-underline-link-and-auto-expand.md). Pure presentation + nav-tree-state change — no `AudioEngine`/`BeatClock` touched, no content-pane component touched (`SettingsContent`/`FleetParamsContent`/`RobotOptionsTab`/`CompanyOptionsSection` are all out of scope per the spec).

**Gate not yet cleared:** the spec's own §7 lists 3 corrections/discoveries (trait-color cascade doesn't actually work today; "auto-expand" means all siblings, not accordion-of-one, so 4 `uiStore` fields become dead; `UnderlineLink` needs GSAP not CSS) that the spec says need an explicit yes before Tasks. Crawford directed proceeding to Tasks anyway — this plan is written against the spec's own recommended resolution for all 3, but they remain open and should be confirmed before or during Phase 1/2 below, not silently treated as settled. See Open Questions.

## Overview

Ship a new `UnderlineLink` primitive (a 4px GSAP-driven pop bar, mirroring `CabinetBox`'s own timelineMap pattern in simplified form), then restyle the nav tree's two deepest levels to use it in place of today's `Button`+`CabinetBox` chrome, and change the tree's own expand semantics so the level directly beneath a branch/entity is always shown expanded (no independent toggle) rather than one-at-a-time. `UnderlineLink` ships first with zero consumers (component-before-consumer, `CabinetBox`/`Button`'s own precedent); the nav-tree state change (deleting 4 now-dead `uiStore` fields, replacing them with a pure id-shape predicate) is independent of it and can ship in parallel; both land before the tree's rendering code (`NavTreeNode`/`NavTree`) is wired to consume them.

## Architecture Decisions

- **`isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible` are plain module-level exports from `useNavTree.ts`, not part of `UseNavTreeResult`.** All 3 are pure functions of an id string alone — no store state, no closure needed — unlike `isExpanded`/`toggleExpand`/`select`/`isSelected`, which genuinely need the hook's live store reads. Exporting them standalone lets `NavTree.tsx` (§5.4 of the spec) and `NavTreeNode.tsx` use them without an extra `useNavTree()` call, and resolves spec §7 item 6 (left open there) in favor of "standalone," matching this file's own existing standalone-`asXxx`-guard convention rather than growing the hook's return type.
- **Deleting the 4 dead `uiStore` fields and adding the replacement predicate are one atomic task (Task 2), not two.** Splitting them would leave the tree in a broken state after just one half lands — `useNavTree.ts` references `expandedFleetParamsGroup`/`expandedSettingsLeaf`/`expandedProbeSection`/`expandedCompanySection` today, so deleting them from `uiStore.ts` alone fails `npm run build:types` immediately, and adding the new predicate without removing the old field-based logic it replaces would leave two contradictory expand mechanisms live at once. This is the same "leaves the system in a working state" rule the skill itself calls out, applied literally.
- **The new row chrome is its own component, `UnderlineLinkNavRow.tsx` (Task 3), not inlined into `NavTreeNode.tsx`.** It has real local state (hovered/focused/pressed → `popped`, mirroring `Button.tsx`'s own composition exactly) and a materially different JSX shape from the existing `Button`+`CabinetBox` branch — the same "component before consumer" split `CabinetBox`/`Button` themselves already used, and it lets `NavTreeNode.tsx`'s own diff stay a dispatch decision plus color-threading, not a second copy of hover/focus/press wiring.
- **Task 1 (`UnderlineLink`) and Task 2 (state-layer swap) touch disjoint files and have no dependency on each other — genuinely parallelizable.** Task 3 (`UnderlineLinkNavRow`) depends only on Task 1, not Task 2, since the new row never renders a toggle/expand control at all (auto-expand-tier nodes show no +/- by design) — it only needs `UnderlineLink` itself, a click handler, and a resolved color. This lets Task 3 start as soon as Task 1 lands, without waiting on Task 2.
- **Task 5 (`NavTree.tsx`'s `ArrowLeft` fix) depends only on Task 2, not Task 4 (`NavTreeNode.tsx`) — parallelizable with Task 4.** Both consume `isCollapsible` from Task 2, but neither reads the other's output.
- **No task in this plan touches `CabinetBox`, `Button`, `Toggle`, or any content-pane component** — confirmed against spec §3's Strict Scope boundary.

## Dependency Graph

```
Task 1 (UnderlineLink.tsx/.css/.test.tsx)        Task 2 (uiStore.ts + useNavTree.ts: delete 4 dead
        │                                                 fields, add isDeepestTwoLevels/
        │                                                 isAutoExpandTier/isCollapsible)
        ▼                                                 │              │
Task 3 (UnderlineLinkNavRow.tsx/.css/.test.tsx)            │              │
        │                                                  │              │
        └──────────────────┬───────────────────────────────┘              │
                            ▼                                             ▼
                  Task 4 (NavTreeNode.tsx/.css/.test.tsx)        Task 5 (NavTree.tsx/.test.tsx)
                            │
                            ▼
                  Task 6 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — independent primitive + state-layer swap (parallelizable)

- [x] **Task 1: `UnderlineLink` — the pop-bar primitive**

  **Description:** Add `src/components/ui/controls/UnderlineLink.tsx`/`.css` per spec §5.2/§1.4: a 4px-tall decorative bar (`aria-hidden="true"`, no text of its own) that pops 4px on a `popped` prop flip, via a GSAP timeline registered in `timelineMap` under a caller-supplied `timelineKey` — mirroring `CabinetBox`'s exact pop/flat-transition-vs-dependency-only-rerun distinction (a real `popped` transition animates via `fromTo`; anything else repositions instantly via `gsap.set()`), but with a single-axis `y` offset only, no oblique 2-wall polygon geometry. Reuses `cabinetAnimation.ts`'s `getCabinetPopDuration`/`getCabinetPopEase` as-is (including their direction-dependent in/out timing — a nice-to-carry-forward consistency, not scope creep, since both were already imported). Takes a `color` prop, applied as a `--underline-link-color` inline custom property — no color resolution of its own.

  **Acceptance criteria:**
  - [x] Renders `aria-hidden="true"`, no text content.
  - [x] Registers a GSAP timeline via `setTimeline` when `popped` flips (`0 → 4` / `4 → 0`), same duration source as `CabinetBox` (`getCabinetPopDuration`).
  - [x] Calls `killTimeline` on unmount.
  - [x] Still calls `setTimeline` under `prefers-reduced-motion` (stubbed true) at `duration: 0` — not skipped outright.
  - [x] A dependency-only re-run (`popped` unchanged, `timelineKey` changing) repositions via `gsap.set()`, not an animated replay — confirmed non-tautological (temporarily forced the branch off, watched the test fail, reverted).
  - [x] Applies the `color` prop as `--underline-link-color` on the rendered root.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/UnderlineLink.test.tsx` passes (12/12), using `vi.mock('@/animation/timelineMap', ...)` and a local `gsap` mock exposing `.fromTo()`/`.set()` call arguments, mirroring `CabinetBox.test.tsx`'s own conventions.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Manual check: none applicable yet — zero real consumers until Task 3, same "component before consumer" precedent `CabinetBox`'s own Task 5 used.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/UnderlineLink.tsx`, `src/components/ui/controls/UnderlineLink.css`, `src/components/ui/controls/UnderlineLink.test.tsx`

  **Estimated scope:** M (3 files; simplified relative to `CabinetBox` — single-axis tween, no geometry module, no `ResizeObserver` — but still a real GSAP+`timelineMap` integration with the same transition/non-transition distinction to get right)

- [x] **Task 2: Replace per-level accordion-of-one expand state with the auto-expand predicate**

  **Description:** Per spec §1.3/§5.1: delete `expandedFleetParamsGroup`, `expandedSettingsLeaf`, `expandedProbeSection`, `expandedCompanySection` and their setters from `uiStore.ts` (plus the doc comments describing them as "accordion-of-one... peeked open" for this tier — corrected, not silently removed). In `useNavTree.ts`, add the 3 plain exported predicates (`isDeepestTwoLevels`, `isAutoExpandTier`, `isCollapsible` — see Architecture Decisions), reusing the existing `asSettingsLeaf`/`asFleetParamsGroup`/`asRobotSection` guards. Update `isExpanded()`/`toggleExpand()` to check `isAutoExpandTier(id)` first (always-expanded / no-op respectively), removing the 4 now-dead field-based branches entirely. Update `select()`'s ancestor-auto-expand block to drop its now-redundant `setExpandedFleetParamsGroup`/`setExpandedSettingsLeaf`/`setExpandedProbeSection`/`setExpandedCompanySection` calls — `expandedTopLevelBranch`/`expandedProbeId`/`expandedCompanyId` are unaffected and keep their existing calls.

  **Acceptance criteria:**
  - [x] `expandedFleetParamsGroup`/`expandedSettingsLeaf`/`expandedProbeSection`/`expandedCompanySection` and their setters no longer exist anywhere in `uiStore.ts` — `grep -rn "expandedFleetParamsGroup\|expandedSettingsLeaf\|expandedProbeSection\|expandedCompanySection" src/` returns nothing.
  - [x] `isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible` are exported from `useNavTree.ts` as plain functions (not returned from the `useNavTree()` hook).
  - [x] `isAutoExpandTier(id)` is `true` for every mid-level Settings/Fleet Params id (`settings.quality`, `settings.sectorSettings`, `fleetParams.pacing`, `fleetParams.eqFilters`, `fleetParams.timeSpace`, `fleetParams.output`) and every Probes/Companies section id (`probes.<id>.melody`, `companies.<id>.envelope`, etc.), and `false` for every branch id, entity id, and deepest-leaf id.
  - [x] `isExpanded(id)` returns `true` for any `isAutoExpandTier`-matched id **with zero prior `toggleExpand`/`select` calls** — no ancestor state needs setting first.
  - [x] `toggleExpand(id)` on an `isAutoExpandTier`-matched id is a no-op — `isExpanded(id)` is `true` both before and after calling it.
  - [x] `isCollapsible(id)` is `false` exactly where `isAutoExpandTier(id)` is `true`, and `true` everywhere else (branch ids, entity ids, deepest-leaf ids — vacuously, since those never render a toggle regardless of `isCollapsible`'s value).
  - [x] Entity rows (`probes.r1`, `companies.c1`, `probes.all`) and branch rows are completely unaffected — `expandedProbeId`/`expandedCompanyId`/`expandedTopLevelBranch` still govern them exactly as before this task.
  - [x] `select()` on a deep id (e.g. `fleetParams.eqFilters.eq`) still sets `expandedTopLevelBranch`/`expandedProbeId`/`expandedCompanyId` as needed for entity/branch-level ancestor reveal, but issues no call to any of the 4 deleted setters (they no longer exist to call).

  **Deviation found during RED:** the initial `isAutoExpandTier` probes/companies branch didn't check for a 4th (subsection) id segment, so a subsection id like `probes.r1.melody.rhythm` was misidentified as its own parent section — a real bug caught by the new test suite, not assumed away. Fixed by also destructuring and excluding on a present 4th segment.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/useNavTree.test.ts src/stores/uiStore.test.ts` passes (79 + 57 tests) — obsolete tests for the 4 deleted fields/setters removed, new coverage added for every acceptance criterion above.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npx vitest run src/components/panels/screen/nav/navPanelViewsAndContent.integration.test.ts` passes — required one small update (a test asserting `expandedCompanySection` directly now asserts `isExpanded('companies.c1.source')` instead), not fully unmodified as originally anticipated, since that field no longer exists.

  **Dependencies:** None.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`, `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`

  **Estimated scope:** M (4 files; a real state-model deletion + a new predicate consumed by two existing functions — flagged as its own atomic task specifically so it never lands half-done, see Architecture Decisions)

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] `UnderlineLink` is importable and pops/repositions correctly in isolation (Task 1's own test suite) with zero real consumers yet.
- [ ] Every existing nav-tree test still passes with the new auto-expand predicate in place — no behavior change yet visible in the running app (`NavTreeNode`/`NavTree` haven't been wired to either change yet).
- [ ] Review with human before proceeding — this is the right point to confirm spec §7's items 1–3 (the gate noted at the top of this file) before the rendering-layer tasks build on top of them.

---

### Phase 2: The new row component (depends only on Task 1)

- [ ] **Task 3: `UnderlineLinkNavRow` — the deepest-two-levels row**

  **Description:** Add `src/components/panels/screen/nav/UnderlineLinkNavRow.tsx`/`.css` per spec §4/§5.3: a transparent `<button>` click target (mirroring `Button.css`'s own `.sc-button` split) wrapping a `DualLabel` (humanLabel only, no loreLabel) and an `UnderlineLink` beneath it. Local `hovered`/`focused`/`pressed` state computed exactly like `Button.tsx` (`onMouseEnter`/`onMouseLeave`/`onFocus`/`onBlur`/`onPointerDown`/`onPointerUp`/`onPointerCancel`/`onPointerLeave`, `popped = hovered || focused || pressed` — no `disabled` concept for a nav row), passed straight into `UnderlineLink`'s `popped` prop. Takes `{ node, onClick, color }` props — `onClick` is the row's own `select(node.id)` + `scrollToSection(node.id)` pairing, supplied by the caller (`NavTreeNode.tsx`, Task 4), not computed here. Row height is a first-pass value, noticeably shorter than a full `CabinetBox` row (spec's Boundaries — no fixed number specified here either; pick one, confirmed later in visual review).

  **Acceptance criteria:**
  - [ ] Renders `DualLabel` with `humanLabel` only (no `loreLabel` passed).
  - [ ] Renders `UnderlineLink`, passing the `color` prop straight through.
  - [ ] `fireEvent.mouseEnter`/`mouseLeave` toggles the popped state passed to `UnderlineLink`.
  - [ ] `fireEvent.focus`/`blur` toggles it independently of hover.
  - [ ] `fireEvent.pointerDown`/`pointerUp` toggles it independently of hover/focus.
  - [ ] Clicking the row calls the supplied `onClick` exactly once.
  - [ ] No `CabinetBox`/`Button` anywhere in this file — confirmed via import statements, not just visual inspection.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/UnderlineLinkNavRow.test.tsx` passes, `UnderlineLink` mocked (`vi.mock('@/components/ui/controls/UnderlineLink', ...)`, rendering `data-popped={popped}` — mirroring `Button.test.tsx`'s own choice to mock `CabinetBox`) so this file tests only the row's own event-to-state logic, not `UnderlineLink`'s already-proven internals (Task 1).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: none applicable yet — not wired into `NavTreeNode` until Task 4.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/nav/UnderlineLinkNavRow.tsx`, `src/components/panels/screen/nav/UnderlineLinkNavRow.css`, `src/components/panels/screen/nav/UnderlineLinkNavRow.test.tsx`

  **Estimated scope:** S (3 files, mechanical wiring against an already-proven `UnderlineLink` from Task 1 — same relationship `Button` (Task 6 of the Cabinetry plan) had to `CabinetBox`)

### Checkpoint: New row component ships
- [ ] `npm run build:types`, `npm run lint` clean; `UnderlineLinkNavRow.test.tsx` passes.
- [ ] `UnderlineLinkNavRow` renders and responds to hover/focus/press correctly in isolation, with zero real consumers yet — no visual change in the running app.
- [ ] Review with human before proceeding.

---

### Phase 3: Wiring the tree (depends on Tasks 2 and/or 3)

- [ ] **Task 4: `NavTreeNode.tsx` — row-chrome dispatch + ancestor color threading**

  **Description:** Per spec §5.3: `NavTreeNode` gains an `inheritedColor?: string` prop (undefined at the root call in `NavTree.tsx`). For each node it renders, it resolves its own color (`node.color`/`node.trait` via the existing `getRobotColorStyle`/`getTraitColorStyle`, unchanged) — if the node has no color/trait of its own, it uses `inheritedColor` instead. It passes its own resolved color down to every child it recurses into as that child's `inheritedColor`. When `isDeepestTwoLevels(node.id)` (Task 2's export) is true, it renders `UnderlineLinkNavRow` (Task 3) instead of the existing `Button`+`CabinetBox` branch, passing the resolved color through. The existing `Toggle` (+/-) is now gated on `hasChildren && isCollapsible(node.id)` (Task 2's export) instead of `hasChildren` alone — `aria-expanded` stays driven by `isExpanded()` regardless, so an auto-expand-tier row still correctly announces `aria-expanded="true"` even with no visible toggle control.

  **Acceptance criteria:**
  - [ ] A node matching `isDeepestTwoLevels` renders `UnderlineLinkNavRow`, not `Button`/`CabinetBox`/`Toggle`.
  - [ ] A branch or entity node (robot/"All Probes"/company) is unaffected — still `Button`+`CabinetBox`, `Toggle` present when it has children, `inheritedColor` accepted but unused by rows that already resolve their own trait/color.
  - [ ] An untraited leaf node beneath a traited mid-level node (e.g. `fleetParams.pacing.tempo` beneath `fleetParams.pacing`, `settings.quality.robotLoad` beneath `settings.quality`) receives that ancestor's resolved color as `UnderlineLinkNavRow`'s `color` prop — asserted directly against the prop value, not inferred from rendered CSS (jsdom doesn't resolve `color-mix()`, matching `CabinetBox.test.tsx`'s own documented caveat).
  - [ ] A node with its own explicit `trait` (e.g. `fleetParams.pacing` itself) uses its own resolved color, ignoring any `inheritedColor` it was passed.
  - [ ] An auto-expand-tier row (`isCollapsible(node.id) === false`) renders no `Toggle`, but its own `role="treeitem"` div still carries `aria-expanded="true"`.
  - [ ] A branch/entity row's own `aria-expanded` behavior (toggle present, reflects real click state) is unchanged from before this task.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/NavTreeNode.test.tsx` passes, covering every acceptance criterion above.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] `npm run build` clean.
  - [ ] Manual check (`npm run dev`): expand each of the 4 branches; confirm Settings'/Fleet Params' own mid-level children (and Probes'/Companies' own section-level children, once a robot/company is expanded) already show expanded with no separate click, render as plain text + underline, and are visibly shorter than the rows above them; hover/focus/tab through several at different depths and confirm each pops with the correct color, including an untraited leaf beneath a traited parent; confirm `prefers-reduced-motion` makes the pop snap instead of animating.

  **Dependencies:** Task 2, Task 3.

  **Files:** `src/components/panels/screen/nav/NavTreeNode.tsx`, `src/components/panels/screen/nav/NavTreeNode.css`, `src/components/panels/screen/nav/NavTreeNode.test.tsx`

  **Estimated scope:** M (3 files — the highest-risk task in this plan: first real composition of the new predicate, the new row component, and ancestor-color threading through existing recursion all at once; flagged explicitly, matching `CabinetBox`'s own Task 5 precedent in the Cabinetry plan)

- [ ] **Task 5: `NavTree.tsx` — `ArrowLeft` respects non-collapsible rows**

  **Description:** Per spec §5.4: `ArrowLeft`'s existing `if (row.hasChildren && isExpanded(row.id)) { toggleExpand(row.id); }` gains an `isCollapsible(row.id)` (Task 2's export) check — `if (row.hasChildren && isExpanded(row.id) && isCollapsible(row.id))` — so that a focused auto-expand-tier row falls through to the existing `else if (row.parentId) { setFocusedId(row.parentId); }` branch instead of silently no-op'ing. `ArrowRight` needs no change (already correct — `isExpanded()` is unconditionally `true` for this tier, so its "already expanded, move into first child" branch fires with no special-casing).

  **Acceptance criteria:**
  - [ ] `ArrowLeft` on a focused auto-expand-tier row moves focus to its parent row.
  - [ ] `ArrowLeft` on a focused, expanded, collapsible row (branch or entity) still collapses it exactly as before this task.
  - [ ] `ArrowRight` behavior is unchanged (regression-covered, not just asserted unchanged by omission).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/NavTree.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check (`npm run dev`): keyboard-navigate into an auto-expand-tier row and press Left — focus should move up to the parent row, not do nothing.

  **Dependencies:** Task 2.

  **Files:** `src/components/panels/screen/nav/NavTree.tsx`, `src/components/panels/screen/nav/NavTree.test.tsx`

  **Estimated scope:** S (2 files, a single added condition plus its regression test)

### Checkpoint: Tree wiring complete — first visible change
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes.
- [ ] The nav panel visibly shows the new chrome/auto-expand behavior end to end in the running app (Task 4's manual check).
- [ ] Keyboard navigation (arrow keys) works correctly through every tree depth, including the new non-collapsible tier (Task 5's manual check).
- [ ] Review with human before proceeding.

---

### Phase 4: Docs

- [ ] **Task 6: `docs/COMPONENT_LIBRARY.md` — `UnderlineLink` added to the primitive list**

  **Description:** Add `UnderlineLink` to `docs/COMPONENT_LIBRARY.md`'s primitive list, spot-checked against the actually-shipped `UnderlineLink.tsx`/`UnderlineLinkNavRow.tsx` (Tasks 1/3), not this plan's draft — note its GSAP+`timelineMap` pop mechanism (mirroring `CabinetBox` in simplified form) and that it carries no text of its own.

  **Acceptance criteria:**
  - [ ] `docs/COMPONENT_LIBRARY.md` documents `UnderlineLink`'s props and its use inside `UnderlineLinkNavRow` for the nav tree's two deepest levels.
  - [ ] No claim in the new entry is contradicted by the actual shipped source (spot-checked directly).

  **Verification:**
  - [ ] Manual review — spot-checked directly against the shipped `UnderlineLink.tsx`/`UnderlineLinkNavRow.tsx`.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 4.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes.
- [ ] All acceptance criteria across all 6 tasks are met.
- [ ] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [ ] Manual visual + keyboard pass completed by Crawford directly against the running app (this plan's tasks list manual checks at Tasks 4/5; no automated browser tooling is assumed available, matching this repo's own precedent in `docs/tasks/OBLIQUE_CABINETRY_FOUNDATION.md`).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The 3 corrections in spec §7 (trait cascade, auto-expand semantics, GSAP requirement) were never explicitly confirmed by Crawford — this plan proceeds on the spec's own recommended resolution for each | Medium — if any is wrong, Tasks 2–4 would need rework | Flagged at the top of this file and at the Foundation checkpoint as the right point to confirm before Phase 3 builds on top of them |
| `NavTreeNode.tsx` (Task 4) is the first real composition of 3 new pieces (the predicate, the new row, ancestor-color threading) at once — higher chance of a subtle wiring bug than a typical S-sized task | Medium — could stall Task 4 past a single focused session | Sized M and flagged explicitly (Architecture Decisions), same treatment `CabinetBox`'s own Task 5 got in the Cabinetry plan |
| Row height for the new chrome (Task 3) is an unspecified first-pass value | Low — cosmetic only | Confirmed later in Crawford's manual visual review, same convention `CABINET_POP_DISTANCE`'s own tuning history already established |
| Deleting 4 `uiStore` fields (Task 2) could have an undiscovered consumer beyond `useNavTree.ts` | Low — `grep` across `src/` before deleting is part of Task 2's own acceptance criteria, not just an assumption | Acceptance criteria explicitly require a `grep` confirming zero remaining references after the change |

## Open Questions

Carried forward from spec §7, not resolved by this plan — still need Crawford's explicit input:

1. **Trait-color cascade correction (spec §7 item 1).** This plan builds Task 4 on the spec's proposed fix (explicit ancestor-color threading via a new `inheritedColor` prop). If a different fix is preferred (e.g. loosening `NavTreeNode.css`'s reset instead), Task 4's approach changes; Tasks 1–3 are unaffected either way.
2. **Auto-expand-means-all-siblings correction, and deleting the 4 `uiStore` fields (spec §7 item 2).** Task 2 is built entirely around this reading. If accordion-of-one (only one sibling expanded at a time) is actually what's wanted instead, Task 2's design reverses significantly — this is the single highest-leverage confirmation to get before starting Task 2.
3. **`UnderlineLink` needs GSAP, not CSS (spec §7 item 3).** Task 1 is built around this. A CSS-only version would be a smaller task, but would break with `CabinetBox`'s own established precedent per the spec's own reasoning.

Resolved during Plan (not left open):

- ~~Should `isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible` live on `UseNavTreeResult` or as standalone exports?~~ **Resolved: standalone exports** (Architecture Decisions) — all 3 are pure functions of an id string, no store state needed, and standalone lets `NavTree.tsx` use `isCollapsible` without an extra hook call. Resolves spec §7 item 6.
- ~~Can the state-layer swap (Task 2) ship separately from the predicate additions?~~ **Resolved: no — one atomic task**, since either half alone leaves the tree in a broken or contradictory state (Architecture Decisions).
- ~~Does the new row need its own file, or can it be inlined into `NavTreeNode.tsx`?~~ **Resolved: its own file, `UnderlineLinkNavRow.tsx`** — real local state and a materially different JSX shape, matching `Button`'s own separation from `CabinetBox`.
