# Phase Spec: Navigation & Layout Rewrite

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Coverage: `npm run test:coverage`
> - Dev server: `npm run dev`
> - Format: `npm run format`

Source of intent: [docs/intent/nav-layout-rewrite.md](../intent/nav-layout-rewrite.md), confirmed via `/idea-refine` + `/interview-me`, 2026-09-22. No roadmap phase number assigned yet — this is the spec that would seed one. **Status: not started.** Everything below is a proposal for Crawford's review, not yet implemented; §7 lists every decision that still needs an explicit yes before Phase 3 (Tasks) can be written.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today

Per `docs/UI_SHELL.md` and direct source reading (`Header.tsx`, `Console.tsx`, `ConsolePanel.tsx`, `uiStore.ts`):

- `Header` renders three rows: Mute `Toggle` + global volume `SliderLinear` (row 1, bound to `audioStore`), a locale/time/temperature status readout (row 2), and a 3-option `RadioButton` (row 3, `HEADER_NAV_SCHEMA` from `headerNavConfig.ts`) that writes `uiStore.activeHubTile` (`'robots' | 'audioRig' | 'settings' | null`).
- `Console` renders nothing when `activeHubTile === null` (the blank hub — `WorldView` shows through unobstructed) and otherwise renders `ConsolePanel`, which switches on `activeHubTile` through a `TILE_CONTENT` record: `robots` → `RobotsTab` (list) or `RobotOptionsTab` (detail, gated on `uiStore.selectedRobotId`), `audioRig` → `AudioRigDrawer`, `settings` → `SectorSettingsDrawer`.
- `RobotsTab` renders `RobotFilterPanel` + a `RobotSelectionCard` list + `CompanyManager` (`CompanyButtonRow` + `CompanyCrudControls`, Create/Rename/Delete against `uiStore.selectedCompanyId`) + `CompanyOptionsSection` (the bulk-edit panel bound to the selected company).
- `RobotOptionsTab` renders `RobotDisplaySection` (read-only meta) + `AudioSettingSection` (Volume + its LFO) + three `AccordionContainer`-wrapped drawers: `PingControlsDrawer` (**Melody** — density/motif/pitch-repeat/octave/click-track), `PingContourDrawer` (**Envelope** — the shared ADSR), `SignatureArrayDrawer` (**Source** — the 3 oscillator layers).
- `AudioRigDrawer` renders `AccordionContainer`-wrapped groups (EQ & Filters / Time & Space / Output, `AUDIO_RIG_ACCORDION_GROUPS`) for the 7 global effect blocks, plus two ungrouped "Transport & Composition" panels that are **not** accordion-wrapped: `BPM_SCHEMA` (Tempo) and `AudioLoadPanel` (the Robot Load / Effects Load preset dial — the closest existing thing to "Quality").
- `SectorSettingsDrawer` renders Attenuation Style (name + presets) and Plot Tuning (coordinates + presets) under one shared Retransmit action — no accordion wrap.
- `AccordionContainer` (`src/components/ui/controls/AccordionContainer.tsx`) is a real primitive in the 14-strong Design System (`docs/COMPONENT_LIBRARY.md`), lazy-mounting its children on first open (Roadmap 17.2.2, unmerged on `bug/view-change-slowdown`) and animating via a `timelineMap`-registered GSAP timeline.

### 1.2 What's changing, at a glance

Replace the 3-tile `RadioButton` + `Console`/`ConsolePanel` tile switch with a schema-driven, always-present nav tree (docked left on desktop/tablet, slide-off-left + hamburger-reopen on mobile) and a single content pane. Full rationale and confirmed decisions: [docs/intent/nav-layout-rewrite.md](../intent/nav-layout-rewrite.md). The state-model and per-node content mapping below is this spec's own contribution — the intent doc deliberately left it open.

### 1.3 State model — additive, not a replacement

Per intent §Constraint, `uiStore` keeps `selectedRobotId`/`selectedCompanyId`/`allRobotsSelected` exactly as they are (both fields are read by non-nav code — `Robot.tsx`'s world-view glow, `CompanyOptionsSection`, `robotAudibility.ts` callers — so collapsing them into a generic node-id would ripple well past the nav itself). Proposed additions:

```typescript
// A leaf "section" within whatever entity is selected (a robot, a company, or the implicit
// "All Probes" bulk-edit target). Matches the 4 children every probe/company node has in the
// confirmed tree sketch. null when a category/entity node itself is selected (no section chosen).
export type RobotSection = 'volume' | 'melody' | 'envelope' | 'source';

export interface UIStore {
  // ...existing fields...
  activeHubTile: HubTile | null; // RETAINED — see §1.4/§7 Q1 for what it means after this change
  selectedSection: RobotSection | null;
  isNavPanelOpen: boolean; // mobile only; desktop/tablet ignore this and stay docked-open
  expandedProbeId: string | null;       // accordion-of-one within the Probes branch
  expandedCompanyId: string | null;     // accordion-of-one within the Companies branch
  expandedFleetParamsGroup: 'eqFilters' | 'timeSpace' | 'output' | null; // within Fleet Params
  setSelectedSection: (s: RobotSection | null) => void;
  setNavPanelOpen: (open: boolean) => void;
  setExpandedProbeId: (id: string | null) => void;
  setExpandedCompanyId: (id: string | null) => void;
  setExpandedFleetParamsGroup: (g: 'eqFilters' | 'timeSpace' | 'output' | null) => void;
}
```

All plain strings/booleans/`null` — no new non-serializable state, per CLAUDE.md.

### 1.4 What `activeHubTile` means going forward

`activeHubTile`'s 3 values (`'robots' | 'audioRig' | 'settings'`) map naturally onto 3 of the tree's top-level branches (Probes, Fleet Params, Settings) — reusing it as "which top-level branch is active" avoids inventing a fourth parallel field and keeps `ConsolePanel`'s existing `Record<HubTile, ...>` dispatch pattern largely intact. **This needs a 4th value for Companies** (§7 Q1) — `HubTile` becomes `'robots' | 'audioRig' | 'settings' | 'companies'`, a one-line type change with the same "TypeScript enforces every tile is covered" guarantee `ConsolePanel.tsx`'s own comment already calls out.

### 1.5 Node-id shape

Tree nodes are identified by a plain string id, namespaced by branch, used only for expansion bookkeeping (`expandedProbeId` etc. store an entity id directly, e.g. a robot's own `id`) and for `NAV_TREE_SCHEMA` authoring (`src/data/navTreeConfig.ts`) — **never** parsed to derive selection state. Selection always goes through the existing typed fields (`activeHubTile`, `selectedRobotId`, `selectedCompanyId`, `allRobotsSelected`, `selectedSection`). A tree node's `onSelect` handler is a small typed action (see §5.1), not a generic "select(nodeId)" dispatcher — this keeps the additive-state-model promise real rather than nominal.

---

## 2. Node → Content Mapping

This table is the concrete resolution of the intent doc's tree sketch against real components — the single most load-bearing part of this spec, since it determines how much of the existing `RobotOptionsTab`/`AudioRigDrawer`/`SectorSettingsDrawer`/`CompanyManager` code is reused vs. restructured.

| Nav path | Node kind | Content shown | Existing component(s) reused | Notes |
|---|---|---|---|---|
| Settings | category | Landing doc (prose) | — new | See §7 Q4 for doc content |
| Settings → Volume | leaf | Global volume slider | `Header`'s current `SliderLinear`/`VOLUME_SCHEMA`, relocated | Mute stays in `Header`; only the slider moves |
| Settings → Quality | leaf | `AudioLoadPanel` | `AudioLoadPanel.tsx`, relocated from `AudioRigDrawer` | Robot Load / Effects Load preset dial — the only existing concept matching "Quality" |
| Settings → Tempo | leaf | `BPM_SCHEMA` slider | `audioRigConfig.ts`'s `BPM_SCHEMA` + its existing `audioStore.bpm` binding, relocated from `AudioRigDrawer` | Currently rendered bare in AudioRigDrawer's "Transport & Composition" area |
| Settings → Sector Settings | leaf | Attenuation Style + Plot Tuning | `SectorSettingsDrawer.tsx`, as-is | No accordion wrap today — moves in whole |
| Fleet Params | category | Landing doc | — new | |
| Fleet Params → EQ & Filters | category | Landing doc, or the group's own params if treated as a leaf (§7 Q5) | `AUDIO_RIG_ACCORDION_GROUPS.eqFilters` content | Was an `AccordionContainer` group; becomes tree nodes |
| Fleet Params → EQ & Filters → EQ / HPF / LPF | leaf | Per-effect params | `AudioRigDrawer`'s existing per-effect `DirectionalPanel`/param rendering (`renderParamControl`), regrouped | 3-Band EQ, LPF, HPF are 3 of the 7 global effect blocks |
| Fleet Params → Time & Space → Reverb / Delay | leaf | Per-effect params | Same `AudioRigDrawer` machinery | |
| Fleet Params → Output → Compression / Limiter | leaf | Per-effect params + Compressor's Decay-mode `RadioButton` | Same, plus `DECAY_MODE_SCHEMA` | |
| Probes | category | `RobotsTab`'s existing filterable card list | `RobotFilterPanel` + `RobotSelectionCard` list, as-is | The "browse" view (intent §Q2) |
| Probes → All Probes | leaf-group (bulk edit) | `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer` bound to every robot | New bulk-edit wiring — no existing "all robots" broadcast target; `CompanyOptionsSection`'s broadcast pattern is the closest precedent | Naming placeholder, per intent |
| Probes → Probe *N* | category | `RobotDisplaySection` (read-only meta) | `RobotDisplaySection.tsx`, as-is | Selecting a probe by name always shows its display section first |
| Probes → Probe *N* → Volume | leaf | `AudioSettingSection` | as-is, single-robot call site (`RobotOptionsTab`'s existing binding) | |
| Probes → Probe *N* → Melody | leaf | `PingControlsDrawer` | as-is | |
| Probes → Probe *N* → Envelope | leaf | `PingContourDrawer` | as-is | |
| Probes → Probe *N* → Source | leaf | `SignatureArrayDrawer` | as-is | |
| Companies | category | Create form | `CompanyCrudControls`'s existing Create half, relocated | Per intent: clicking the parent node creates |
| Companies → Company *X* | category | Rename/Delete form + `RobotDisplaySection`-equivalent summary | `CompanyCrudControls`'s existing Rename/Delete half, relocated; Delete gains a confirmation step (§7 Q2) | |
| Companies → Company *X* → Volume/Melody/Envelope/Source | leaf | Same 4 drawers, company-broadcast binding | `CompanyOptionsSection.tsx`'s existing snapshot-bound wiring, as-is | |

**Every leaf/category content component listed above is reused, not rebuilt.** The rewrite's real new work is: the tree nav itself (§5), the `AccordionContainer` retirement inside `AudioRigDrawer`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`/`RobotFilterPanel` (replacing accordion sections with tree nodes — §4), relocating Volume/Quality/Tempo out of `Header`/`AudioRigDrawer` into Settings, and the Companies CRUD relocation.

---

## 3. Target File Structure

```text
src/
├── data/
│   └── navTreeConfig.ts                    # NEW — NAV_TREE_SCHEMA, schema-driven per §1.5/§5.1
├── stores/
│   └── uiStore.ts                          # MODIFIED — §1.3 fields; HubTile gains 'companies' (§1.4)
├── types/
│   └── hub.ts                              # MODIFIED — HubTile += 'companies'
├── components/
│   ├── panels/screen/
│   │   ├── Header.tsx                      # MODIFIED — drop nav RadioButton + volume slider, keep power/mute/status
│   │   ├── Header.css                      # MODIFIED — layout simplification following the above
│   │   └── nav/                            # NEW directory
│   │       ├── NavTree.tsx                 # NEW — root tree, owns APG roving-tabindex + keyboard handling
│   │       ├── NavTree.css
│   │       ├── NavTreeNode.tsx             # NEW — one row: name (select) + separate +/- (expand), recursive
│   │       ├── NavTreeNode.css
│   │       ├── NavPanel.tsx                # NEW — docked (desktop/tablet) vs. slide-off (mobile) shell, houses NavTree
│   │       ├── NavPanel.css
│   │       ├── NavToggleButton.tsx         # NEW — persistent hamburger/reopen affordance, mobile only
│   │       └── useNavTree.ts               # NEW — resolves uiStore selection/expansion state against NAV_TREE_SCHEMA
│   └── panels/screen/console/
│       ├── Console.tsx                     # MODIFIED — or retired; content pane logic moves near NavPanel (§7 Q6)
│       ├── ConsolePanel.tsx                # MODIFIED — TILE_CONTENT dispatch extended for 'companies', §1.4
│       ├── ContentPane.tsx                 # NEW — the single content area + its always-present close button
│       ├── AudioRigDrawer.tsx              # MODIFIED — AccordionContainer groups removed, BPM/AudioLoadPanel relocated out
│       ├── SectorSettingsDrawer.tsx        # UNCHANGED in content, relocated under Settings
│       └── RobotFilterPanel.tsx            # MODIFIED — its own AccordionContainer usage removed
│   ├── robot/
│   │   ├── PingControlsDrawer.tsx          # MODIFIED — AccordionContainer wrapper removed (tree node is the section now)
│   │   ├── PingContourDrawer.tsx           # MODIFIED — same
│   │   └── SignatureArrayDrawer.tsx        # MODIFIED — same, LfoTargetGroup internals unaffected
│   └── company/
│       ├── CompanyManager.tsx              # MODIFIED or retired — CompanyButtonRow/CrudControls relocate into nav (§7 Q3)
│       └── CompanyCrudControls.tsx         # MODIFIED — Create half moves to Companies-parent-click, Rename/Delete to per-company node; Delete gains confirmation
└── testUtils/
    └── (openAccordions.ts likely retired once no AccordionContainer consumers remain — confirm at implementation time)
docs/
├── UI_SHELL.md                             # MODIFIED — nav/console section rewritten for the tree model
├── COMPONENT_LIBRARY.md                    # MODIFIED — AccordionContainer entry marked retired/removed once consumers are gone
└── todo/roadmap.md                         # MODIFIED — new phase entry once a number is assigned
```

`AccordionContainer.tsx` itself (and `accordionAnimation.ts`) are deleted only once every consumer above is migrated — tracked as the last task in the eventual task breakdown, not a first step (see §4, "Always").

---

## 4. Implementation Boundaries & Constraints

* **Strict scope for this spec:** the nav/content shell (`NavTree`/`NavPanel`/`ContentPane`), the `uiStore` additions in §1.3, the `HubTile` extension, the Companies CRUD relocation, and removing `AccordionContainer` from its 5 real consumers (`AudioRigDrawer`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`, `RobotFilterPanel`). **Not in scope:** redesigning any leaf content component's own internals (every component in the §2 table's "reused" column keeps its existing props/behavior) or the doc-content authoring system beyond what §7 Q4 resolves.
* **Always:**
  * All interactive UI stays inside `ScreenViewport` — `NavPanel` is a new sibling of `Header`/`WorldView`/`ContentPane` inside it, never inside `SleeveContainer` (CLAUDE.md, non-negotiable).
  * All new `uiStore` fields stay plain JSON-serializable primitives (CLAUDE.md).
  * `AccordionContainer` is deleted only after its last real consumer is migrated — an intermediate state with some content still accordion-wrapped and some in the new tree is expected mid-implementation, not a defect.
  * The tree implements the full APG tree-view pattern per intent §Success: `role="tree"`/`role="treeitem"`, `aria-expanded`, `aria-selected`, roving `tabindex` (one `tabindex="0"` at a time, everything else `-1`), Up/Down/Left/Right/Enter/Space per the [WAI-ARIA APG Tree View pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/) — no existing Radix primitive covers this (`docs/UI_SHELL.md`'s installed-primitives list has no tree), so it is hand-rolled per intent.
  * GSAP timelines used for the nav slide/expand animations only ever trigger semantic state changes (`setNavPanelOpen`, `setExpandedProbeId`, etc.) — never call `AudioEngine` directly (CLAUDE.md).
  * Every new component follows this repo's `ControlSchema`/typed-config-file convention where it renders schema-driven content (`navTreeConfig.ts` mirrors `headerNavConfig.ts`'s existing shape).
* **Ask first:** anything that reopens a decision in §7 before it's resolved; any new dependency (CLAUDE.md — e.g. if a real ARIA tree turns out to need a library rather than a hand-rolled implementation, that's a boundary case requiring explicit sign-off, not a default); any change to melody/audio-scheduling/animation architecture incidentally touched while relocating Tempo/Quality/Volume controls (CLAUDE.md).
* **Never:**
  * Never use `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` for the nav slide-in/out or expand/collapse animation — GSAP timelines in `timelineMap`, per every existing primitive's own precedent (`AccordionContainer`, `PowerRockerSwitch`).
  * Never store a GSAP timeline, DOM ref, or the tree's own transient focus state in `uiStore` — `NavTree`'s roving-tabindex focus target is component-local (`useState`/`useRef`), matching `useLfoTargetGroup`'s existing "selection is local, ephemeral state, never Zustand" precedent (`docs/COMPONENT_LIBRARY.md`).
  * Never remove a Roadmap doc's historical record — `docs/UI_SHELL.md`'s rewrite documents the new model going forward; it doesn't need to preserve the old prose, but `docs/specs/HEADER_HUB_CONSOLIDATION.md` and the other superseded specs stay in place as history, per this repo's existing convention (e.g. how Phase 3's `HubNav` history is still referenced, not deleted, in later docs).
  * Never introduce a confirmation dialog anywhere except company deletion (intent §Out of scope) — Reset Melody and every other routinely-triggered action stays confirmation-free.

---

## 5. Code Style & Architecture Conventions

### 5.1 `navTreeConfig.ts` shape

```typescript
// src/data/navTreeConfig.ts
// Static tree shape only — no per-robot/per-company entries (those are generated at render time
// by NavTree.tsx from localeStore's live robots/companies, keyed by their own ids). Mirrors
// headerNavConfig.ts's "schema-driven, zero hardcoded routing logic in components" convention.

export interface NavTreeNodeSchema {
  id: string;              // stable within its own branch, e.g. 'settings.volume'
  loreLabel?: string;      // DualLabel convention, reused for the tree's own row label
  humanLabel: string;
  children?: NavTreeNodeSchema[]; // static children; dynamic branches (Probes/Companies) resolved separately
  docId?: string;          // §7 Q4 — key into whatever doc-content store is decided
}

export const NAV_TREE_SCHEMA: NavTreeNodeSchema[] = [
  {
    id: 'settings', humanLabel: 'Settings',
    children: [
      { id: 'settings.volume', humanLabel: 'Volume' },
      { id: 'settings.quality', humanLabel: 'Quality' },
      { id: 'settings.tempo', humanLabel: 'Tempo' },
      { id: 'settings.sectorSettings', humanLabel: 'Sector Settings' },
    ],
  },
  {
    id: 'fleetParams', humanLabel: 'Fleet Params',
    children: [
      { id: 'fleetParams.eqFilters', humanLabel: 'EQ & Filters', children: [
        { id: 'fleetParams.eqFilters.eq', humanLabel: 'EQ' },
        { id: 'fleetParams.eqFilters.hpf', humanLabel: 'HPF' },
        { id: 'fleetParams.eqFilters.lpf', humanLabel: 'LPF' },
      ] },
      // ...Time & Space, Output, same shape
    ],
  },
  // Probes / Companies: only the static parent node lives here ({ id: 'probes', humanLabel:
  // 'Probes', children: [{ id: 'probes.all', humanLabel: 'All Probes', children: [...] }] });
  // per-robot/per-company subtrees are generated in NavTree.tsx from live store data, not authored
  // statically, since they vary with the roster/company list at runtime.
];
```

### 5.2 `NavTreeNode.tsx` — selection vs. expansion, decoupled

```tsx
// Illustrative — exact prop shape resolved during implementation.
function NavTreeNode({ node, depth, isExpanded, isSelected, onSelect, onToggleExpand }: NavTreeNodeProps) {
  return (
    <div role="treeitem" aria-expanded={node.children ? isExpanded : undefined} aria-selected={isSelected} aria-level={depth}>
      <button className="nav-tree-node__name" onClick={() => onSelect(node.id)}>
        {node.humanLabel}
      </button>
      {node.children && (
        <button
          className="nav-tree-node__toggle"
          aria-label={isExpanded ? `Collapse ${node.humanLabel}` : `Expand ${node.humanLabel}`}
          onClick={(e) => { e.stopPropagation(); onToggleExpand(node.id); }}
        >
          {isExpanded ? '−' : '+'}
        </button>
      )}
      {isExpanded && node.children && (
        <div role="group">
          {node.children.map((child) => <NavTreeNode key={child.id} node={child} depth={depth + 1} {...{/* ... */}} />)}
        </div>
      )}
    </div>
  );
}
```

Matches `AccordionContainer`'s existing `+`/`−` precedent (`docs/COMPONENT_LIBRARY.md`: "a decorative `+`/`−` open-state indicator... `aria-hidden`; `aria-expanded` on the trigger itself already carries the real open/closed state") — reused here rather than invented fresh, except the indicator is now its own separately-clickable element (decoupled selection per intent), not decorative.

### 5.3 Naming and conventions

PascalCase components, `sc-`-prefixed CSS classes are reserved for the `ControlSchema` primitive inventory (`docs/COMPONENT_LIBRARY.md`) — `NavTree`/`NavPanel`/`ContentPane` are app-level composition, not new primitives, so they follow `Header.css`/`Console.css`'s existing `kebab-case` class convention instead (e.g. `.nav-tree`, `.nav-panel`, `.content-pane`). Comments state *why*, matching every file read while researching this spec.

---

## 6. Testing & Verification Requirements

### 6.1 Framework and location

Vitest + React Testing Library, colocated (`NavTree.test.tsx` next to `NavTree.tsx`, etc.), per repo convention.

### 6.2 New test coverage (minimum, expanded at task-breakdown time)

1. **Tree structure:** `NAV_TREE_SCHEMA` renders every static node; per-robot/per-company nodes render for exactly the current roster/company list.
2. **Selection vs. expansion decoupling:** clicking a node's name selects it and expands it; clicking only its `+`/`-` toggles expansion without changing `selectedRobotId`/`selectedSection`/etc.
3. **Accordion-of-one:** expanding Probe 3 while Probe 1 was expanded collapses Probe 1's row; same for Companies and for Fleet Params' 3 groups, independently of each other (expanding a probe never affects the companies branch's own expanded node).
4. **Keyboard/ARIA:** roving tabindex (exactly one `tabindex="0"` at a time), Up/Down move focus among visible rows, Right expands/moves into children, Left collapses/moves to parent, Enter/Space activates — via `@testing-library/user-event`, matching how this repo already drives keyboard interaction in `RadioButton`/`Toggle` tests.
5. **Content pane close button:** always present when any node is selected, clears the selection state back to the branch's own blank/landing state.
6. **`AccordionContainer` retirement regression:** once each consumer migrates, its own test suite's `openAllAccordions()` calls are removed (no orphaned calls against a component that no longer has one); a final guard test (or a `grep`-style check documented in the task list) confirms zero remaining `AccordionContainer` imports outside the component's own file, before deletion.
7. **Companies relocation:** Create fires from the Companies parent node click; Rename/Delete fire from a specific company node; Delete requires confirmation (exact mechanism per §7 Q2) before `removeCompany` is called.
8. **Existing behavior preserved:** every reused leaf component (§2 table) keeps its existing prop contract and existing tests pass with only their mounting context changed (a tree-node content slot instead of an accordion/tile), mirroring how `ACCORDION_LAZY_MOUNT.md`'s own test migration worked (mechanical, one shared helper, no weakened assertions).

### 6.3 Manual verification (not test-suite-checkable)

- Mobile slide-off/reopen feel at real widths (per this repo's own "jsdom can't see this" precedent, `ACCORDION_LAZY_MOUNT.md` §5.3.7).
- Screen reader pass (NVDA/VoiceOver) confirming the tree announces expand/collapse and selection correctly — the concrete deliverable behind intent §Success's "a screen reader announces... correctly."
- `prefers-reduced-motion` snap behavior on the nav slide/expand animations.

### 6.4 Verification order

`npm run build:types` → `npm run lint` → new component tests → migrated consumer tests → full `npm test` → `npm run build` → manual browser pass (mobile/tablet/desktop widths) → screen reader pass.

---

## 7. Decisions (resolved 2026-09-22, Crawford)

All 7 walked through and confirmed — every one landed on this spec's own recommendation.

* **Q1 — `HubTile` gains a 4th value, `'companies'`.** Confirmed. Keeps the existing "TypeScript enforces every tile is covered" `Record<HubTile, ...>` pattern intact rather than nesting a second switch inside `'robots'`.
* **Q2 — Company delete confirmation uses Radix `AlertDialog`.** Confirmed. The app's first confirmation dialog; establishes the real pattern rather than a bespoke inline two-click convention.
* **Q3 — `CompanyManager.tsx` dissolves into the nav tree**, not kept as a standalone component. Confirmed. `CompanyButtonRow`'s per-company color-coding (`RadioButtonSchema.color`) needs a new home in tree row styling — tracked as an implementation task, not a further open question (the color data itself, `Company.color`, is unaffected; only its rendering surface moves).
* **Q4 — Doc-content authoring is split into its own follow-up spec**, written once the tree shell itself works. Confirmed. This spec proceeds with every node's content area leaving room for a doc-text slot (stubbed/placeholder), not fully wired.
* **Q5 — "Fleet Params → EQ & Filters" is category-only**, no content of its own beyond a landing doc; EQ/HPF/LPF are the only leaves under it. Confirmed. Applies identically to Time & Space (Reverb/Delay) and Output (Compression/Limiter).
* **Q6 — `Console.tsx` is repurposed into `ContentPane.tsx`**, not deleted-and-rewritten. Confirmed. Preserves the existing "render nothing so `WorldView` clicks pass through" behavior (`docs/UI_SHELL.md`) rather than re-deriving it.
* **Q7 — Sequencing is shell-first, then migrate.** Confirmed. Milestone 1: `NavTree`/`NavPanel`/`ContentPane` (from `Console.tsx`) + the `uiStore` additions (§1.3) + `HubTile`'s 4th value, wired to the **existing** `ConsolePanel`/`TILE_CONTENT` dispatch with **zero** `AccordionContainer` removal yet — the tree can select/expand and show today's tile content unchanged. Milestone 2: migrate each `AccordionContainer` consumer per §2's table (`AudioRigDrawer`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`, `RobotFilterPanel`), relocate Volume/Quality/Tempo out of `Header`/`AudioRigDrawer` into Settings, and relocate Companies CRUD out of `CompanyCrudControls`' current shape into per-node interactions (Q3). This is the ordering Phase 2 (Plan) should build its dependency graph from.

### Risks

### Risks

* **R1 — Hand-rolled ARIA tree is a real accessibility risk if under-tested.** No Radix primitive to lean on (confirmed, `docs/UI_SHELL.md`'s installed list); mitigated by §6.2 items 4 and §6.3's screen-reader pass being non-optional, not deferred.
* **R2 — Losing `AccordionContainer`'s lazy-mount benefit.** Intent treats 17.2.x as moot because "one node mounted at a time" sidesteps the mass-mount problem — true for the content pane, but `NavTree` itself, once it renders 12 probe subtrees × 4 children + up to 6 company subtrees × 4 children (per accordion-of-one, only one branch's children are ever expanded/mounted at a time if expansion also lazy-mounts, an implementation detail not yet fixed — worth deciding alongside Q7).
* **R3 — Relocating Tempo/Quality out of `AudioRigDrawer` touches audio-adjacent UI wiring.** Per CLAUDE.md, ask-first applies if this starts to look like more than a relocation (e.g. if `AudioLoadPanel`'s "next to Tempo in Transport & Composition" comment implies a coupling beyond physical layout — unverified, check at implementation time).
* **R4 — Test churn is large and cuts across many files** (every `AccordionContainer` consumer's own test suite, `Header.test.tsx`, `Console.test.tsx`/`ConsolePanel.test.tsx`, `CompanyCrudControls.test.tsx`), similar in kind to `ACCORDION_LAZY_MOUNT.md`'s R4 but larger in scope — mitigated the same way: mechanical migration, never a weakened assertion, reviewed as its own diff category.
