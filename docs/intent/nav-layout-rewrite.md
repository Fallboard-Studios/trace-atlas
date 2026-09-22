# Intent: Navigation & Layout Rewrite

Confirmed via `/idea-refine` + `/interview-me`, 2026-09-22. Major, cross-cutting rewrite — no roadmap phase number assigned yet; this doc is the source of intent a spec-driven-development pass should work from. Touches `Header.tsx`, `Console.tsx`/`ConsolePanel.tsx`, `uiStore.ts`'s nav state, `RobotsTab.tsx`, `CompanyManager.tsx` and its CRUD children, `headerNavConfig.ts`, and every `AccordionContainer` consumer (`AudioRigDrawer`, `RobotOptionsTab`'s three drawers, `SectorSettingsDrawer`).

## Outcome

Replace the flat 3-tile Header nav (`RadioButton` → `audioRig`/`robots`/`settings`, switching `Console`'s content) with a schema-driven tree nav:

- **Desktop/tablet:** docked permanently at the left edge — a standing master-detail layout, always visible, no slide mechanic.
- **Mobile:** slides off-screen left; reopened via a persistent hamburger/menu affordance; auto-closes when a node is selected. Mobile is co-equal with desktop, not a degraded fallback — this app is built mobile-first and ships on the public internet.
- **Tree shape:** every navigable/editable thing in the app as nested nodes — Settings (Volume/Quality/Tempo/Sector Settings), Fleet Params (EQ & Filters → EQ/HPF/LPF, Time & Space → Reverb/Delay, Output → Compression/Limiter), Probes (All Probes bulk-edit node, then one node per robot with Volume/Melody/Envelope/Source children), Companies (one node per company with the same four children, plus company CRUD).
- **Expansion is accordion-of-one per level:** expanding one node at a given level (e.g. one probe's row) collapses whatever sibling was expanded at that level, keeping the visible list short regardless of how many probes/companies exist. Expansion state is separate from selection — peeking open a node's children doesn't change what's currently shown in the content area.
- **Selection and expansion are decoupled interactions:** clicking a node's name selects it (shows its content, reveals its children) and clicking its `+`/`-` toggles expansion only, without changing displayed content.
- **The nav is a real accessible tree**, not nested disclosure buttons: full APG tree-view pattern (`role="tree"`/`role="treeitem"`, `aria-expanded`, `aria-selected`, roving tabindex, arrow-key navigation — Up/Down move focus, Right expands/moves into children, Left collapses/moves to parent, Enter/Space activates). No existing Radix primitive covers this; it will be hand-rolled.
- **Content area** always shows exactly one thing and always has a close button. A leaf node (e.g. a probe's Volume) shows its controls plus short inline doc text about that control. A category node with no controls of its own (Fleet Params, EQ & Filters, Companies, Probes) shows longer landing-page doc text adapted from the relevant existing `docs/*.md` reference doc, or — for Probes specifically — the existing filterable robot card list (`RobotsTab`/`RobotFilterPanel`/`RobotSelectionCard`) rather than plain prose, reused as-is under the new nav rather than rebuilt.
- **`AccordionContainer` is retired entirely, app-wide** — every current consumer's content moves into tree nodes instead of accordion sections.
- **Company CRUD moves into nav interactions:** clicking the Companies parent node opens an inline create form in the content area (pre-filled generated name, same pattern as today's `CompanyCrudControls`); clicking a specific company's name opens that company's content with rename controls and a delete action. Delete is the one destructive/irreversible action in this flow and gets a confirmation step (likely the already-installed Radix `AlertDialog`) — the only confirmation dialog introduced by this rewrite. Every other action (including Reset Melody and any control that incidentally triggers melody regeneration) stays confirmation-free, matching existing app convention.
- **"All Probes"** is an implicit bulk-edit-every-robot node living under Probes, structurally mirroring what a company does but with no CRUD of its own — final naming may change if "All Probes" proves unclear once built.

## User

Crawford (solo dev), building for a mobile-first audience on the public internet — the app's only real user persona today, but the rewrite is explicitly not a "just for me, desktop-only" internal tool.

## Why now

The flat 3-tile model can't scale to "every leaf control individually reachable" (12 probes × 4 sections, up to 6 companies × 4 sections, plus global rig sections) without either hiding depth behind extra clicks or becoming unusable. This rewrite also retires `AccordionContainer` and the mass-simultaneous-mount problem it caused, superseding the in-flight, unmerged `bug/view-change-slowdown` (Roadmap 17.2.x) performance work rather than needing it — the new one-node-mounted-at-a-time content model sidesteps that problem by construction, so 17.2.x is treated as moot for this work, not a prerequisite.

## Success

- Any leaf control is reachable from the nav tree in a bounded, predictable number of taps, at any tree size (12 probes, up to 6 companies).
- The tree never shows more than one expanded branch per level — accordion-of-one holds at every level, verified with all 12 probes and multiple companies present.
- The nav tree passes as a real accessible tree: correct ARIA roles/states, full roving-tabindex arrow-key navigation, and a screen reader announces expand/collapse state and selection correctly.
- Documentation content is visibly part of the content area (not a separate panel/toggle) on both leaf and category nodes.
- Company deletion requires an explicit confirmation step; no other action introduces a new confirmation dialog.
- `AccordionContainer` has zero remaining consumers and is deleted from the codebase.
- `npm run build:types`, `npm run lint`, and `npm test` all pass clean; all interactive UI still lives inside `ScreenViewport`; `uiStore` stays JSON-serializable.

## Constraint

- **State model is additive, not a full replacement.** `selectedRobotId`/`selectedCompanyId` in `uiStore` stay as they are today (used throughout existing robot/company code, not just nav). A new `selectedSection` field (`'volume' | 'melody' | 'envelope' | 'source' | null` or equivalent) picks which section of the selected entity is shown. A handful of per-level `expandedId` fields (e.g. `expandedProbeId`, `expandedCompanyId`, `expandedFleetParamsCategory`) hold peek-without-navigating expansion state, independent of selection. No single opaque node-id scheme replacing all of this.
- CLAUDE.md guardrails hold throughout: all interactive UI stays inside `ScreenViewport` (never `SleeveContainer`); all nav/UI state stays JSON-serializable in Zustand (no timelines, DOM refs, or synth instances); GSAP timelines may only trigger semantic state changes, never call `AudioEngine` directly.
- Tree nodes are authored schema-driven, in a new `src/data/navTreeConfig.ts`, following the same typed-config-file convention every other part of the Design System already uses (`headerNavConfig.ts`, `robotOptionsConfig.ts`, `audioRigConfig.ts`, etc.) — `ControlSchema`-shaped nodes with an optional `children` array, no hardcoded labels or inline routing logic in components.
- Doc content does not have one fixed shape across all nodes — leaf nodes need short per-control help, category nodes need longer landing-page prose, and at least one category node (Probes) needs a full existing component (the robot list) instead of prose. The doc-content schema needs to accommodate this variance; the exact shape is not fixed by this doc and is open for the spec pass.
- Branches from current `main`; does not merge or build on top of `bug/view-change-slowdown`.

## Out of scope

- Search/filter-as-navigation — explicitly deferred to a possible v2, not part of this rewrite.
- Merging Companies into Probes as one top-level branch — rejected; Companies stays a distinct top-level node because bulk-editing robots via companies needs its own CRUD-backed list, structurally different from "All Probes."
- A confirmation dialog on Reset Melody or any other routinely-triggered regeneration action — unchanged from today's no-confirmation convention; company deletion is the sole new exception.
- Merging or building on top of `bug/view-change-slowdown` (Roadmap 17.2.x) — treated as moot; this rewrite's content-mounting model supersedes the problem that work was fixing.
- Finalizing "All Probes" as a permanent name — placeholder pending a clearer label once the tree is built and used.
- Exact doc-content authoring format/schema, exact keyboard-shortcut edge cases beyond the core APG pattern, exact visual/CSS design of the nav panel and content area — resolved at spec/implementation time, not fixed here.
