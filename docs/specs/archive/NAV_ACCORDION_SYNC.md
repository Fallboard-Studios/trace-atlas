# Phase Spec: Nav ↔ Accordion Sync

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/nav-accordion-sync.md](../intent/nav-accordion-sync.md), confirmed via `/interview-me`, 2026-09-26. Prior art this spec follows directly: `sectionRefs.ts` (the module-level `Map`-registry pattern this phase's own new registry reuses); `NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md` / `NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md` (`NavCabinetRow`'s existing hover/focus/press `popped` computation, which this phase extends rather than replaces); `useAccordionOpenState.ts`'s own doc comment recording Crawford's 2026-09-24 decision to keep accordion state local per view, not in `uiStore` — this spec's registry is designed specifically to honor that decision rather than reopen it. **Status: not started.** §7 lists 2 discoveries beyond what the intent doc itself settled, and needs an explicit yes before Phase 3 (Tasks) is written.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today

Per direct source reading (`NavTreeNode.tsx`, `NavCabinetRow.tsx`, `sectionRefs.ts`, `useAccordionOpenState.ts`, `useNavTree.ts`, `uiStore.ts`, `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx`, `SettingsContent.tsx`, `FleetParamsContent.tsx`):

- **Accordion ids and nav-tree node ids are the same string.** `RobotOptionsTab.tsx` builds its accordion schemas with ids like `` `${prefix}.melody.rhythm` `` (`prefix = probes.${robot.id}`) — the exact id `useNavTree.ts` assigns that tree node. The same is true for `CompanyOptionsSection.tsx`, `SettingsContent.tsx`, and `FleetParamsContent.tsx`. This id-sharing is the load-bearing fact this whole spec builds on: a "target id" from a nav click and an "accordion id" from a content view are the same key space, with one exception (§1.2).
- **Nav → content already does most of the work.** `NavTreeNode.tsx`'s click handlers (the plain `Button` row and `NavCabinetRow`, lines ~101–104 and ~110–116) already call `select(node.id)` then `scrollToSection(node.id)`. `select()` (`useNavTree.ts` line 289) already performs full ancestor auto-expand — `setExpandedTopLevelBranch`, and `setExpandedProbeId`/`setExpandedCompanyId` for Probes/Companies — so the clicked node's own nav-tree ancestors are already guaranteed visible after a click, and view-switching (`activeHubTile`, `selectedSettingsLeaf`, `selectedFleetParamsEffect`, etc.) is already handled. **None of this needs to change.** What's missing is purely: opening the target's accordion, and (mobile only) closing that view's other open accordions first.
- **Accordion open/closed state is local, per view, on purpose.** `useAccordionOpenState.ts` returns `{ isOpen, setOpen }` backed by `useState<Record<string, boolean>>`, one hook instance per stacked view (`RobotOptionsTab`, `CompanyOptionsSection`, `SettingsContent`, `FleetParamsContent`). Its own doc comment records that this is a deliberate 2026-09-24 reversal of an earlier store-driven design — "nothing here is driven by nav clicks or scrollspy." `scrollToSection` and `useSectionObserver`'s scrollspy already coexist with this hook without touching it. There is currently no way for code outside a given view to read or change that view's accordion state — no registry, no store, no context.
- **`NavCabinetRow.tsx`'s `popped` is local UI-only state**: `hovered || focused || pressed`, computed via plain `useState` inside the row itself (lines 38–41). It has no awareness of accordion state, uiStore, or anything outside its own DOM events.
- **The nav tree's own "expanded" concept is unrelated to content accordions.** `isAutoExpandTier`/`isDeepestTwoLevels` (`useNavTree.ts`) govern whether a *nav-tree row* renders expanded/collapsed and which chrome (`NavCabinetRow` vs. `Button`+`CabinetBox`+`Toggle`) it uses — this is about the tree's own visual nesting, not about whether a content-pane accordion is open. The two concepts share an id space but are otherwise independent; this spec does not touch `isAutoExpandTier`/`isDeepestTwoLevels`/`isCollapsible` at all.

### 1.2 Correction — one nav id has no accordion to open

`RobotOptionsTab.tsx` (~line 224) documents that Rhythm and Pitches were merged into one "Composition" accordion reusing the old `.rhythm` id; the nav tree still exposes a separate "Pitches" leaf (a distinct node id) with no matching `sectionRefs`/accordion anchor of its own. `scrollToSection` already no-ops safely for it (`sectionRefs.ts`'s own documented no-op-on-unregistered-id contract). This phase's new "open the accordion for the clicked id" step must have the same no-op safety: **not every valid nav id maps to a registered accordion** — the registry lookup in §4.2 must tolerate a miss exactly like `scrollToSection` already does, not throw or warn.

### 1.3 What's changing, at a glance

1. **A new imperative registry**, `src/utils/accordionSync.ts`, mirroring `sectionRefs.ts`'s module-level-`Map` shape but for accordion open state instead of scroll anchors — the one piece of new shared plumbing, serving both directions.
2. **`useAccordionOpenState` registers itself** with that registry on mount (one registration per id it manages) and unregisters on unmount, so the registry always reflects whichever view instance currently owns a given id.
3. **`NavTreeNode.tsx`'s click handlers** additionally call the registry's `openFromNav(id, { closeSiblings: isMobile })` after `select(node.id)`/`scrollToSection(node.id)` — mobile-only sibling-closing, scoped to the one view instance that owns the target id (never app-wide, since the registry is keyed per-id but each view's ids all share one hook instance and one `openIds` record).
4. **`NavCabinetRow.tsx`'s `popped` computation** gains a new OR'd condition — subscribed via `useSyncExternalStore` to the registry's live "is this id's accordion open" signal for `node.id` — alongside its existing `hovered || focused || pressed`.
5. **Every `AccordionContainer`'s `onOpenChange` call site** (`RobotOptionsTab`, `CompanyOptionsSection`, `SettingsContent`, `FleetParamsContent`) is unchanged in its own signature — the ancestor-nav-expand side effect of *opening* an accordion happens inside `useAccordionOpenState`'s own `setOpen`, not at each of the ~11 call sites, so no content component needs to know this feature exists.

---

## 2. Direction 1: Nav Click → Open Content Accordion

### 2.1 Behavior

Clicking a nav row (`Button` row or `NavCabinetRow`) already selects and scrolls. This phase adds, after `scrollToSection(node.id)`:

```typescript
openAccordionFromNav(node.id, { closeSiblings: isNavPanelOpenMobile });
```

- If `node.id` has no registered accordion (§1.2, or a branch/entity row that isn't itself an accordion), this is a safe no-op — matching `scrollToSection`'s own contract.
- If it does, that view's own `setOpen(node.id, true)` fires. On mobile (`closeSiblings: true`), every *other* id currently open in that same view instance closes first — never ids belonging to a different view instance, and never anything on desktop.
- Ancestor nav-tree expansion (branch/entity level) is **already handled** by the existing `select(node.id)` call (§1.1) — this phase adds no new ancestor-expand logic on the nav→content side.

### 2.2 "Same view/panel" scope for mobile sibling-closing

Confirmed in `/interview-me`: sibling-closing is scoped to "only within the same view," which maps directly onto "the same `useAccordionOpenState` hook instance" — there is exactly one instance per stacked view (one `RobotOptionsTab` per robot, one `CompanyOptionsSection` per company, one `SettingsContent`, one `FleetParamsContent`), and each instance's `openIds` record already only ever holds that view's own ids. No new grouping concept is needed: registering by id and closing "every other id this same hook instance currently owns" is automatically view-scoped, because two different views never share an id.

### 2.3 Determining mobile vs. desktop

`uiStore.isNavPanelOpen` is the existing mobile-nav-panel-open flag (`docs/UI_SHELL.md`). This phase does **not** reuse it to detect "is this a mobile viewport" — that flag tracks whether the nav panel itself is currently open, not viewport width, and could in principle be true on a desktop-width window. The correct mobile/desktop signal is whatever CSS-breakpoint-driven mechanism the rest of the codebase already uses for responsive behavior (e.g. `docs/AUDIO_RIG_RESPONSIVE_LAYOUT.md`'s pattern, or an existing `useIsMobile`-shaped hook if one exists) — **left for Tasks to locate and confirm** (§7, open question 1); do not invent a new breakpoint constant if an existing one covers this.

---

## 3. Direction 2: Accordion Open/Close → Nav Pop State

### 3.1 Behavior

- **Opening** an accordion (`setOpen(id, true)`, from any source — a click on the accordion header itself, or Direction 1's `openAccordionFromNav`) does two things beyond today's local `openIds` update:
  1. Ancestor nav-tree expansion — the same branch/entity-level calls `select()` already makes (`setExpandedTopLevelBranch`, `setExpandedProbeId`/`setExpandedCompanyId`), so the corresponding nav row is guaranteed visible even if the user opened the accordion by scrolling and clicking its header directly, without ever having clicked the nav.
  2. The registry's "is `id` open" signal for that id flips true, which `NavCabinetRow.tsx` (§4.3) reads to pop.
- **Closing** an accordion (`setOpen(id, false)`) does *only* the second thing in reverse — the registry's signal flips false, unpopping the row. It must **never** call `setExpandedTopLevelBranch(null)`/`setExpandedProbeId(null)`/`setExpandedCompanyId(null)` or touch `selectedSection`/`selectedSubsection` — per the confirmed intent, closing an accordion must not collapse anything nav-side.
- A node whose chrome is the older `Button`+`CabinetBox` row (branch/entity level, not `isDeepestTwoLevels`) has no pop concept today and gains none here — only `NavCabinetRow`-chrome rows (§1.6 of `NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md`) are affected, since those are the only rows an accordion id can ever resolve to (every accordion id in §1.1's examples is 3–4 segments deep, always inside `isDeepestTwoLevels` territory).

### 3.2 Where the ancestor-expand call lives

`useAccordionOpenState`'s own `setOpen` is the single choke point every accordion open/close already passes through (§1.3 point 5) — the ancestor-expand side effect belongs inside `setOpen` itself (only on the `open === true` branch), not duplicated across the ~11 `onOpenChange` call sites in `RobotOptionsTab`/`CompanyOptionsSection`/`SettingsContent`/`FleetParamsContent`. This keeps content components unaware of the feature entirely, matching how they're already unaware of `scrollToSection`/`useSectionObserver`.

---

## 4. Target File Structure

```text
src/
└── utils/
    ├── accordionSync.ts              # NEW — the id → {isOpen, open, close} registry (§4.1/§4.2)
    └── accordionSync.test.ts         # NEW

src/components/panels/screen/nav/
    ├── useAccordionOpenState.ts       # MODIFIED — registers/unregisters with accordionSync;
    │                                   #   setOpen's `open===true` branch triggers ancestor
    │                                   #   nav-expand (§3.2); adds openExclusive() for §2.1's
    │                                   #   mobile close-siblings path
    ├── useAccordionOpenState.test.ts  # MODIFIED
    ├── NavTreeNode.tsx                 # MODIFIED — click handlers call openAccordionFromNav
    │                                   #   after scrollToSection (§2.1)
    ├── NavTreeNode.test.tsx            # MODIFIED
    ├── NavCabinetRow.tsx               # MODIFIED — popped gains the registry-subscribed
    │                                   #   "section open" condition (§4.3)
    └── NavCabinetRow.test.tsx          # MODIFIED

docs/
└── UI_SHELL.md                        # MODIFIED — documents the new registry alongside its
                                        #   existing sectionRefs/scrollToSection description
```

**Explicitly not touched, and why:**

- `sectionRefs.ts` — untouched; this phase's registry is a new sibling module, not a change to the scroll-anchor registry.
- `useNavTree.ts`'s `select()`, `isExpanded()`, `isAutoExpandTier`, `isDeepestTwoLevels`, `isCollapsible` — untouched. `select()` already does everything Direction 1 needs on the ancestor-expand front (§1.1); this phase never calls `select()` a second time or duplicates its logic.
- `uiStore.ts` — no new fields. `setExpandedTopLevelBranch`/`setExpandedProbeId`/`setExpandedCompanyId` are reused exactly as they exist; nothing new is added to the store, consistent with `useAccordionOpenState`'s own local-state design (§1.1) and CLAUDE.md's state-must-stay-JSON-serializable rule (moot here since nothing new is being stored at all).
- `AccordionContainer.tsx`/`.css`/`accordionAnimation.ts` — untouched; this phase changes *when* `onOpenChange`/`open` fire, never the component itself.
- `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx`, `SettingsContent.tsx`, `FleetParamsContent.tsx` — untouched. Every one of their `useAccordionOpenState(...)` call sites keeps its existing signature; the new behavior is entirely inside the hook.
- `Button.tsx`, `CabinetBox.tsx` — untouched; `NavCabinetRow`'s own local hover/focus/press computation is extended, not replaced or moved into a shared primitive.

---

## 5. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §4 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No new `uiStore` state.** Accordion open/closed state stays exactly where `useAccordionOpenState` already keeps it (local `useState`, one instance per view) — per Crawford's 2026-09-24 decision recorded in that hook's own doc comment. The registry is a plain module-level `Map` (mirroring `sectionRefs.ts`), not a store.
* **The registry never becomes the source of truth for accordion open/closed state.** It's a live *mirror* — each `useAccordionOpenState` instance still owns its own `openIds` and pushes updates into the registry (on mount, on every `setOpen`, and clears its own ids on unmount); the registry never independently decides an accordion's state or is read by `AccordionContainer` itself.
* **Direction 1 never re-implements ancestor nav expansion.** `select(node.id)` (already called by every nav click, untouched by this phase) already expands `expandedTopLevelBranch`/`expandedProbeId`/`expandedCompanyId` as needed. Do not add a second ancestor-expand code path in `NavTreeNode.tsx`'s click handler.
* **Direction 2's ancestor-expand call fires only on `open === true`.** Closing an accordion must leave `expandedTopLevelBranch`/`expandedProbeId`/`expandedCompanyId`/`selectedSection`/`selectedSubsection` completely untouched — per the confirmed intent ("don't close any sections... un-pop the underline" only).
* **Mobile close-siblings is scoped to one `useAccordionOpenState` instance's own ids, never cross-view or app-wide.** Since each view manages a disjoint id namespace (§2.2), this falls out naturally from implementing it as a method on the hook itself rather than a global registry operation.
* **Desktop is completely unaffected** — no auto-closing of sibling accordions on desktop, regardless of how the accordion was opened (accordion-header click or nav click).
* **`NavCabinetRow`'s existing `hovered || focused || pressed` computation is extended with `||`, not replaced.** A row must still pop on hover/focus/press exactly as today, independent of whether its accordion is open.
* **A miss in the registry (an id with no registered accordion, §1.2) is a silent no-op**, matching `scrollToSection`'s own established contract — never a thrown error, console warning, or crash.
* **Out of scope, per the intent doc:** lifting `useAccordionOpenState` into `uiStore`; any change to view-switching (`select()`'s branch/settings-leaf/fleet-params-effect logic); desktop sibling-closing; URL/deep-link anchor behavior; any change to `NavCabinetRow`'s hover/focus/press mechanics themselves.

---

## 6. Code Style & Architecture Conventions

### 6.1 `src/utils/accordionSync.ts` (new) — registry shape

```typescript
/**
 * Live mirror of accordion open/closed state, keyed by the same ids sectionRefs.ts uses for scroll
 * anchors and useNavTree.ts uses for nav-tree nodes (they're the same id space, docs/specs/
 * NAV_ACCORDION_SYNC.md §1.1). Each useAccordionOpenState instance registers the ids it owns on
 * mount and pushes every state change here; NavCabinetRow subscribes to read "is this id open"
 * without owning that state itself. This registry is a mirror, never the source of truth — the
 * owning useAccordionOpenState instance's own React state remains authoritative.
 */

interface AccordionEntry {
  isOpen: boolean;
  /** Opens this id in its owning view; closeSiblings closes every other id that same view
   *  instance currently has open first (mobile nav-click path only, §2.1/§2.2). */
  open: (closeSiblings: boolean) => void;
}

const registry = new Map<string, AccordionEntry>();
const listeners = new Map<string, Set<() => void>>();

export function registerAccordion(id: string, entry: AccordionEntry): void { /* ... */ }
export function unregisterAccordion(id: string): void { /* ... */ }
/** Called by useAccordionOpenState on every isOpen change for one of its ids — notifies subscribers. */
export function updateAccordionOpen(id: string, isOpen: boolean): void { /* ... */ }

/** Direction 1's entry point — a safe no-op if `id` isn't registered (§1.2). */
export function openAccordionFromNav(id: string, opts: { closeSiblings: boolean }): void {
  registry.get(id)?.open(opts.closeSiblings);
}

/** Direction 2's read side — for useSyncExternalStore in NavCabinetRow (§6.3). */
export function isAccordionOpen(id: string): boolean {
  return registry.get(id)?.isOpen ?? false;
}
export function subscribeAccordionOpen(id: string, cb: () => void): () => void { /* add/remove from listeners.get(id) */ }
```

### 6.2 `useAccordionOpenState.ts` — registration + ancestor-expand + `openExclusive`

```typescript
// On mount/id-set change: registerAccordion(id, { isOpen: ..., open: (closeSiblings) => ... }) for
// every id this instance currently manages; unregisterAccordion(id) for ids it no longer manages
// and on unmount. Mirrors sectionRefs.ts's own register-on-mount/clear-on-unmount convention.

const setOpen = useCallback((id: string, open: boolean) => {
  setOpenIds((prev) => ({ ...prev, [id]: open }));
  updateAccordionOpen(id, open);
  if (open) {
    // Ancestor nav-expand, §3.2 — the same branch/entity-level calls select() already makes,
    // reused directly (exact function TBD at Tasks: either a small shared helper extracted from
    // useNavTree.ts's own ancestor-expand block, or useUIStore's setters called directly here
    // with the same id-parsing useNavTree.ts already does — see open question 2, §7).
  }
}, []);

const openExclusive = useCallback((id: string, closeSiblings: boolean) => {
  setOpenIds((prev) => {
    if (!closeSiblings) return { ...prev, [id]: true };
    const next: Record<string, boolean> = {};
    for (const key of Object.keys(prev)) next[key] = key === id;
    next[id] = true;
    return next;
  });
  updateAccordionOpen(id, true);
  // + the same ancestor nav-expand call setOpen's open===true branch makes.
}, []);
```

### 6.3 `NavCabinetRow.tsx` — popped gains the registry signal

```tsx
import { useSyncExternalStore } from 'react';
import { isAccordionOpen, subscribeAccordionOpen } from '@/utils/accordionSync';

// inside NavCabinetRow:
const sectionOpen = useSyncExternalStore(
  (cb) => subscribeAccordionOpen(node.id, cb),
  () => isAccordionOpen(node.id),
);
const popped = hovered || focused || pressed || sectionOpen;
```

### 6.4 `NavTreeNode.tsx` — click handlers call into Direction 1

```tsx
onClick={() => {
  select(node.id);
  scrollToSection(node.id);
  openAccordionFromNav(node.id, { closeSiblings: isMobileViewport /* §2.3 */ });
}}
```

Applied identically to both the plain `Button` row's `onClick` and `NavCabinetRow`'s `onClick` prop (`NavTreeNode.tsx` currently has two near-identical click handlers, lines ~101–104 and ~110–116 — both get the same one-line addition).

### 6.5 Naming and conventions

`accordionSync.ts` (matches `sectionRefs.ts`'s lowerCamelCase module naming), `registerAccordion`/`unregisterAccordion`/`updateAccordionOpen`/`isAccordionOpen`/`subscribeAccordionOpen`/`openAccordionFromNav` (verb-first, matching `setSectionRef`/`getSectionRef`/`clearSectionRef`/`scrollToSection`'s own naming pattern). Formatting matches each touched file's existing style exactly.

---

## 7. Open Questions & Risks

Corrections/discoveries found during Specify, not present in (or contradicting) the confirmed intent doc — **both need an explicit yes before Tasks:**

1. **The mobile/desktop signal for §2.3 isn't identified yet.** The confirmed intent says "mobile" without specifying the detection mechanism, and `uiStore.isNavPanelOpen` is a poor fit (it tracks panel-open state, not viewport width). Tasks needs to locate whatever existing responsive-breakpoint mechanism the codebase already uses (CSS media query read via a hook, a `matchMedia` utility, etc. — `docs/AUDIO_RIG_RESPONSIVE_LAYOUT.md` may already have this) rather than introducing a new one. Confirm this is fine to resolve at Tasks time, or specify the mechanism now if you already have one in mind.
2. **The exact code path for Direction 2's ancestor-expand call (§3.2/§6.2) isn't pinned down.** Two options: (a) extract a small shared helper from `useNavTree.ts`'s existing ancestor-expand block in `select()` and call it from `useAccordionOpenState.setOpen`, or (b) have `useAccordionOpenState.setOpen` parse the id and call `useUIStore`'s setters directly, duplicating (not sharing) the small amount of id-parsing logic `useNavTree.ts` already has. (a) avoids duplication but means `useAccordionOpenState.ts` (a nav-adjacent but currently nav-tree-independent hook) takes a new dependency on `useNavTree.ts`'s internals; (b) keeps the two hooks fully independent at the cost of ~5 duplicated lines. Confirm a preference, or leave it for Tasks to decide.

Still open — flag for Plan/Tasks, not blocking this spec:

3. Whether `accordionSync.ts`'s registry should key strictly 1:1 (one entry per id, last-registered-wins on a collision) or defensively warn on a double-registration — `sectionRefs.ts`'s own `setSectionRef` silently replaces on collision (its own doc comment: "replacing any stale entry"); this phase should probably match that exactly, but confirm at Tasks.
4. Test coverage for the `useSyncExternalStore` wiring in `NavCabinetRow.test.tsx` needs to exercise both "accordion opens elsewhere while this row is mounted" (subscription fires) and "row mounts after the accordion is already open" (initial snapshot is correct) — sketched here, exact test shape left for Tasks.
