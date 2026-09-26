# Implementation Plan: Nav ↔ Accordion Sync

Source spec: [docs/specs/NAV_ACCORDION_SYNC.md](../specs/NAV_ACCORDION_SYNC.md). Source intent: [docs/intent/nav-accordion-sync.md](../intent/nav-accordion-sync.md). Not yet slotted into [docs/todo/roadmap.md](../todo/roadmap.md).

## Overview

A new `accordionSync.ts` registry (mirroring `sectionRefs.ts`'s module-level-`Map` shape) lets `NavCabinetRow` read live accordion-open state and lets nav clicks open a target accordion, without lifting `useAccordionOpenState`'s local per-view state into `uiStore`. `useNavTree.ts`'s existing ancestor-auto-expand logic (already run by every `select()` call) is extracted into a standalone `expandNavAncestorsForId` so `useAccordionOpenState.setOpen` can reuse it verbatim when an accordion opens from any source, not just a nav click. Six tasks: two independent foundation pieces (the registry; the extracted helper), two pieces of core wiring that each depend on both foundations (`useAccordionOpenState`'s registration + ancestor-expand + `openExclusive`; `NavCabinetRow`'s pop signal), one integration task wiring nav clicks to the whole thing, and docs last.

## Architecture Decisions

- **Resolves spec §7 open question 1 (mobile detection): reuse `useCabinetTier()`.** [useCabinetBoxHeight.ts](../../src/components/ui/controls/useCabinetBoxHeight.ts)'s `useCabinetTier()` already resolves the exact `'mobile' | 'tablet' | 'desktop'` tier via `matchMedia`, and [useResponsivePanelOrientation.ts](../../src/components/ui/controls/useResponsivePanelOrientation.ts) already reuses it for an unrelated mobile/desktop behavior split. Mobile-only sibling-closing (§2.1/§2.3 of the spec) reads `useCabinetTier() === 'mobile'` — no new breakpoint constant, no new `matchMedia` listener, consistent with `cabinetBreakpoints.ts`'s own "sole source of truth for tier" framing.
- **Resolves spec §7 open question 2 (where the ancestor-expand call lives): option (a), extract and share.** `useNavTree.ts`'s `select()` already contains the exact branch/entity-level ancestor-expand logic (`setExpandedTopLevelBranch`, `setExpandedProbeId`/`setExpandedCompanyId`) Direction 2 needs. Duplicating ~5 lines of id-parsing at a second call site risks the two copies drifting (e.g. if a future branch type is added and only one copy is updated). Extracting `expandNavAncestorsForId(id: string): void` as a plain function — implemented with `useUIStore.getState()` setters, not a hook, so it's callable from `useAccordionOpenState.setOpen` without violating the Rules of Hooks — keeps a single source of truth. `select()` is refactored to call it too, so behavior is provably identical before and after (Task 2's own regression tests cover this).
- **Task 1 (`accordionSync.ts`) and Task 2 (`expandNavAncestorsForId` extraction) have no dependency on each other** — one is a brand-new module, the other is a refactor of existing, already-tested logic in a different file. Both are prerequisites for Tasks 3–5 and can be built in either order (or in parallel across two sessions).
- **Task 3 (`useAccordionOpenState.ts`) depends on both Task 1 and Task 2** — it registers with the Task 1 registry and calls Task 2's extracted helper on open.
- **Task 4 (`NavCabinetRow.tsx`) depends only on Task 1** — it only reads the registry (`isAccordionOpen`/`subscribeAccordionOpen`), never writes to it, so it doesn't need Task 2 or Task 3 to exist yet. It's ordered after Task 3 below only so Checkpoint 2 can verify both halves of "core wiring" together, not because of a real code dependency.
- **Task 5 (`NavTreeNode.tsx`) depends on Task 1, Task 3, and Task 4** — it's the integration point: it calls the registry's `openAccordionFromNav` (Task 1) which only does anything useful once views actually register (Task 3), and the visible effect (the row popping) requires Task 4. Building it before the other three would produce a click handler with nothing to observably verify.
- **Task 6 (docs) depends on all of Tasks 1–5** — same "land last, spot-check against final shipped source" convention `docs/tasks/GLOBAL_VOLUME_CONTROL.md`'s own Task 3 used.

## Dependency Graph

```
Task 1 (accordionSync.ts registry)          Task 2 (expandNavAncestorsForId extraction)
        │                                              │
        └───────────────────┬──────────────────────────┘
                             │
              ┌──────────────┴───────────────┐
              │                               │
   Task 3 (useAccordionOpenState.ts:   Task 4 (NavCabinetRow.tsx:
   registration + ancestor-expand +    registry-subscribed pop
   openExclusive) — needs 1 + 2        signal) — needs only 1
              │                               │
              └──────────────┬────────────────┘
                              │
              Task 5 (NavTreeNode.tsx: nav-click → openAccordionFromNav,
                       mobile detection via useCabinetTier)
                              │
              Task 6 (docs/UI_SHELL.md)
```

## Task List

### Phase 1: Foundation — registry and shared helper

- [x] **Task 1: `accordionSync.ts` — the id-keyed open-state registry**

  **Description:** New module `src/utils/accordionSync.ts`, mirroring `sectionRefs.ts`'s module-level-`Map` pattern. Exports `registerAccordion(id, entry)`/`unregisterAccordion(id)` (write side, called by `useAccordionOpenState` in Task 3), `isAccordionOpen(id)`/`subscribeAccordionOpen(id, cb)` (read side, called by `NavCabinetRow` in Task 4 via `useSyncExternalStore`), `updateAccordionOpen(id, isOpen)` (notifies subscribers on a state change), and `openAccordionFromNav(id, { closeSiblings })` (write side, called by `NavTreeNode` in Task 5). A lookup miss on any read/write function is a silent no-op (spec §1.2/§5) — never a throw or console warning, matching `sectionRefs.ts`'s own `getSectionRef`/`scrollToSection` contract. This task ships the registry with no real caller yet — it's pure new code, independently testable via a fake `registerAccordion` entry.

  **Acceptance criteria:**
  - [x] `registerAccordion(id, entry)` followed by `isAccordionOpen(id)` returns `entry.isOpen`'s current value; `unregisterAccordion(id)` makes a subsequent `isAccordionOpen(id)` return `false`.
  - [x] `openAccordionFromNav(id, { closeSiblings: false })` on a registered id calls that entry's `open(false)`.
  - [x] `openAccordionFromNav(id, { closeSiblings: true })` calls `open(true)`.
  - [x] `openAccordionFromNav('not-registered', { closeSiblings: false })` does not throw.
  - [x] `isAccordionOpen('not-registered')` returns `false`, not `undefined` and not a throw.
  - [x] `subscribeAccordionOpen(id, cb)` registers `cb`; a subsequent `updateAccordionOpen(id, true)` calls `cb` exactly once; the subscription's returned unsubscribe function stops further calls.
  - [x] Registering a second entry under an id already registered replaces the first (matches `sectionRefs.ts`'s `setSectionRef` "replacing any stale entry" contract, spec §7 item 3) — asserted directly, not left implicit.
  - [x] Multiple independent subscribers to the same id each receive their own `updateAccordionOpen` notification.

  **Verification:**
  - [x] `npx vitest run src/utils/accordionSync.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/accordionSync.ts`, `src/utils/accordionSync.test.ts`

  **Estimated scope:** S (one new file, no existing code touched)

- [x] **Task 2: `useNavTree.ts` — extract `expandNavAncestorsForId`**

  **Description:** Extract `select()`'s existing ancestor-auto-expand block (`useNavTree.ts` ~lines 300–305: `setExpandedTopLevelBranch`/`setExpandedProbeId`/`setExpandedCompanyId`, driven by `asTopLevelBranch`) into a standalone exported function `expandNavAncestorsForId(id: string): void`, implemented via `useUIStore.getState()` rather than the hook-bound setters `select()` currently closes over — so it's callable from outside a component/hook (Task 3 needs to call it from `useAccordionOpenState`, which is a hook but must not create a second, divergent copy of this parsing logic). `select()` itself is refactored to call `expandNavAncestorsForId(id)` in place of its own inline block — a pure refactor, provably behavior-preserving via existing `useNavTree.test.ts` coverage for `select()`'s ancestor-expand effects, which must keep passing unmodified.

  **Acceptance criteria:**
  - [x] `expandNavAncestorsForId` is exported from `useNavTree.ts` and callable with no hook/component context (uses `useUIStore.getState()`, not the `useUIStore()` hook).
  - [x] `expandNavAncestorsForId('probes.r1.melody.rhythm')` sets `expandedTopLevelBranch` to `'probes'` and `expandedProbeId` to `'r1'`, matching exactly what `select('probes.r1.melody.rhythm')` already did before this refactor.
  - [x] `expandNavAncestorsForId('companies.c1.envelope')` sets `expandedTopLevelBranch` to `'companies'` and `expandedCompanyId` to `'c1'`.
  - [x] `expandNavAncestorsForId('settings.quality')` sets `expandedTopLevelBranch` to `'settings'` and does not touch `expandedProbeId`/`expandedCompanyId`.
  - [x] `expandNavAncestorsForId` on an id with an invalid/unrecognized branch segment is a no-op (matches `asTopLevelBranch`'s existing null-return contract).
  - [x] Every existing `useNavTree.test.ts` test covering `select()`'s ancestor-expand behavior still passes unmodified — proving the refactor is behavior-preserving, not just a new code path.
  - [x] `select()`'s own implementation now calls `expandNavAncestorsForId(id)` rather than containing the inline block itself — asserted by code review / diff inspection, not a runtime test.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/useNavTree.test.ts` passes, including new direct tests of `expandNavAncestorsForId` and all pre-existing `select()` tests unmodified.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`

  **Estimated scope:** S (one file, extraction refactor + new direct test coverage)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint` clean.
- [x] `accordionSync.ts` is fully correct and tested in isolation, with no real caller yet.
- [x] `expandNavAncestorsForId` is fully correct and tested in isolation; `select()`'s existing behavior is provably unchanged.
- [ ] Reviewed with human before proceeding to Phase 2.

---

### Phase 2: Core wiring — each direction's own half

- [x] **Task 3: `useAccordionOpenState.ts` — registration, ancestor-expand on open, `openExclusive`**

  **Description:** `useAccordionOpenState` registers every id in its current `openIds` keys with `accordionSync.registerAccordion` on mount/id-set change (each entry's `isOpen` reads that id's current `openIds[id]`; each entry's `open(closeSiblings)` calls the hook's own state setter), and unregisters on unmount (mirroring `sectionRefs.ts`'s own register-on-mount/clear-on-unmount convention, spec §1.3/§6.2). `setOpen(id, open)` calls `updateAccordionOpen(id, open)` after its existing `setOpenIds` update, and — only when `open === true` — calls `expandNavAncestorsForId(id)` (Task 2). A new `openExclusive(id, closeSiblings)` method: when `closeSiblings` is `true`, sets every other id this instance currently manages to closed and `id` to open in one `setOpenIds` update (spec §2.2, scoped to this hook instance's own ids only — never cross-view); when `false`, behaves like `setOpen(id, true)`. `openExclusive` also calls `updateAccordionOpen`/`expandNavAncestorsForId` exactly as `setOpen`'s open path does.

  **Acceptance criteria:**
  - [x] Mounting the hook with a non-null `defaultOpenId` registers that id with `accordionSync`, and `isAccordionOpen(defaultOpenId)` (from `accordionSync`) returns `true` immediately.
  - [x] Calling `setOpen(id, true)` for a previously-unregistered id registers it and makes `isAccordionOpen(id)` return `true`.
  - [x] Calling `setOpen(id, false)` makes `isAccordionOpen(id)` return `false`.
  - [x] Unmounting the hook unregisters every id it had registered — `isAccordionOpen(id)` returns `false` afterward for each.
  - [x] `setOpen(id, true)` calls `expandNavAncestorsForId(id)` exactly once; `setOpen(id, false)` does **not** call it (spec §3.1/§3.2 — closing must never touch nav-ancestor expansion).
  - [x] `openExclusive(id, true)` on a hook instance with multiple ids currently open closes every other id and opens `id` — verified via `isOpen(otherId) === false` for each previously-open sibling and `isOpen(id) === true`, in one state update (not two renders).
  - [x] `openExclusive(id, false)` behaves identically to `setOpen(id, true)` — no sibling closing.
  - [x] `openExclusive(id, true)` also calls `expandNavAncestorsForId(id)`.
  - [x] `resetKey`-driven resets (existing behavior) still unregister/re-register correctly — mounting two different `resetKey`s in sequence (e.g. switching robots) leaves `accordionSync` reflecting only the current key's ids, not a stale mix of both.
  - [x] Every existing `useAccordionOpenState.test.ts` test (the 8 already listed in the file, covering `isOpen`/`setOpen`/`resetKey`) still passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/useAccordionOpenState.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/components/panels/screen/nav/useAccordionOpenState.ts`, `src/components/panels/screen/nav/useAccordionOpenState.test.ts`

  **Estimated scope:** M (one file, three new behaviors added to an existing hook, registration lifecycle needs a `useEffect`)

- [x] **Task 4: `NavCabinetRow.tsx` — registry-subscribed pop signal**

  **Description:** `NavCabinetRow`'s `popped` computation (currently `hovered || focused || pressed`) gains a fourth OR'd condition read via `useSyncExternalStore(subscribeAccordionOpen bound to node.id, isAccordionOpen bound to node.id)` (spec §3.1/§6.3). No change to the existing hover/focus/press state or handlers. `node.id` is already a prop-derived value already in scope (via the existing `node` prop) — no new prop needed on `NavCabinetRow` itself.

  **Acceptance criteria:**
  - [x] A `NavCabinetRow` whose `node.id` is registered as open in `accordionSync` (via a test calling `registerAccordion`/`updateAccordionOpen` directly, or via `useAccordionOpenState` in an integration test) renders with its pop state active, with no hover/focus/press.
  - [x] A `NavCabinetRow` still pops on hover/focus/press exactly as before, independent of registry state — existing hover/focus/press tests in `NavCabinetRow.test.tsx` pass unmodified.
  - [x] When the registry's state for `node.id` changes after mount (simulating an accordion opening elsewhere while this row is already rendered), the row re-renders and pops without requiring a remount — proving the `useSyncExternalStore` subscription actually fires, not just that the initial snapshot is correct.
  - [x] A `NavCabinetRow` for an id never registered in `accordionSync` behaves exactly as it does today (hover/focus/press only) — the no-op-on-miss contract from Task 1 flows through correctly.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/NavCabinetRow.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/nav/NavCabinetRow.tsx`, `src/components/panels/screen/nav/NavCabinetRow.test.tsx`

  **Estimated scope:** S (one file, one new hook call, one OR'd condition)

### Checkpoint: Core wiring
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite: 18 pre-existing, unrelated failures confirmed identical before and after this phase's changes; zero new failures).
- [x] Direction 2 (accordion open/close → nav pop + ancestor expand) is fully provable end-to-end via unit tests: opening an accordion via `useAccordionOpenState.setOpen`/`openExclusive` is observable both as `accordionSync.isAccordionOpen` flipping true and as `uiStore`'s `expandedTopLevelBranch`/`expandedProbeId`/`expandedCompanyId` updating; closing only reverts the pop signal.
- [x] `NavCabinetRow` correctly reflects registry state without needing any nav-click wiring yet (Task 5 not started).
- [ ] Reviewed with human before proceeding to Phase 3.

---

### Phase 3: Integration — nav click drives content

- [ ] **Task 5: `NavTreeNode.tsx` — nav click opens the target accordion**

  **Description:** Both of `NavTreeNode.tsx`'s click handlers (the plain `Button` row's `onClick` and `NavCabinetRow`'s `onClick` prop) add one call after their existing `select(node.id)`/`scrollToSection(node.id)`: `openAccordionFromNav(node.id, { closeSiblings: useCabinetTier() === 'mobile' })` (spec §2.1/§2.3, Architecture Decisions above). A miss (an id with no registered accordion — e.g. the "Pitches" leaf, spec §1.2) is already a safe no-op per Task 1's contract, so no special-casing is needed here.

  **Acceptance criteria:**
  - [ ] Clicking a nav row whose id is a registered, closed accordion (in a test wiring a real `useAccordionOpenState` instance alongside the tree, or mocking `accordionSync`) results in that accordion becoming open.
  - [ ] On a mobile viewport (`useCabinetTier() === 'mobile'`, mocked in the test), clicking a nav row for an accordion in the same view as another already-open accordion closes the other one first — verified via the owning `useAccordionOpenState` instance's `isOpen` for the sibling id.
  - [ ] On a non-mobile viewport (`'tablet'` or `'desktop'`), the same click leaves sibling accordions open.
  - [ ] Clicking a nav row for an id with no registered accordion (e.g. a branch/entity row, or the "Pitches" leaf) does not throw and preserves all existing `select`/`scrollToSection` behavior exactly as before this task.
  - [ ] `select(node.id)` and `scrollToSection(node.id)` are still called exactly as before — this task only adds a third call, never reorders or removes the first two.
  - [ ] Both click-handler call sites (`Button` row and `NavCabinetRow` row) get the identical new call — asserted for both, not just one.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/NavTreeNode.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check (live browser): on a narrow/mobile-width window, open one accordion in a robot's options, then click a different nav leaf within the same robot — confirm the first accordion closes and the new target opens, expanded and scrolled into view, with its own nav row popped. Widen to desktop width and repeat — confirm the first accordion stays open alongside the newly opened one. Click the "Pitches" leaf (or any leaf with no live accordion) and confirm no crash and existing scroll/select behavior still works.

  **Dependencies:** Task 1, Task 3, Task 4.

  **Files:** `src/components/panels/screen/nav/NavTreeNode.tsx`, `src/components/panels/screen/nav/NavTreeNode.test.tsx`

  **Estimated scope:** S (one file, one new call at two existing call sites)

### Checkpoint: Integration
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean — full suite.
- [ ] `npm run build` clean (production bundle).
- [ ] The full feature is provable end-to-end via the automated suite: nav click → target accordion opens (+ mobile sibling-closing) → target nav row pops; accordion open/close (from any source) → nav ancestor expansion + pop, close never collapsing nav state.
- [ ] Manual check from Task 5 above — flagged for the human before merge.
- [ ] Reviewed with human before proceeding to Phase 4.

---

### Phase 4: Docs

- [ ] **Task 6: `docs/UI_SHELL.md` — document the registry**

  **Description:** Add a short section alongside the existing `sectionRefs`/`scrollToSection` description covering: `accordionSync.ts`'s purpose (a live mirror of accordion open state, never the source of truth), which two directions it serves, and the fact that `useAccordionOpenState` remains the sole owner of real accordion state (2026-09-24 decision, unchanged by this feature). Spot-checked every named identifier against the final shipped source from Tasks 1–5.

  **Acceptance criteria:**
  - [ ] Names `accordionSync.ts`, `registerAccordion`/`unregisterAccordion`/`isAccordionOpen`/`subscribeAccordionOpen`/`openAccordionFromNav`, and `expandNavAncestorsForId` exactly matching shipped source.
  - [ ] Explicitly states the registry is a mirror, not a store — `useAccordionOpenState`'s local `useState` remains authoritative.
  - [ ] Notes the mobile-only sibling-closing behavior and that desktop is unaffected.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked directly against the final shipped code from Tasks 1–5.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change; full `npm test`/`npm run build` already reconfirmed clean at Checkpoint: Integration).

  **Dependencies:** Task 1, Task 2, Task 3, Task 4, Task 5.

  **Files:** `docs/UI_SHELL.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint` clean (post-docs-change spot check); full `npm test`/`npm run build` confirmed clean at Checkpoint: Integration.
- [ ] All automated acceptance criteria across all 6 tasks are met.
- [ ] `docs/UI_SHELL.md` reflects the shipped API — every documented name spot-checked against source.
- [ ] Manual/live-browser check from Task 5 completed and confirmed by Crawford.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `useSyncExternalStore`'s subscribe/getSnapshot functions are recreated every render in `NavCabinetRow` (a common footgun — a new function identity each render can cause needless resubscription or, with a naive implementation, an infinite render loop) | Medium | Task 4's acceptance criteria require the re-render-without-remount test, which would surface a naive per-render resubscription bug; implementation should bind `subscribeAccordionOpen`/`isAccordionOpen` to `node.id` via `useCallback` or module-level functions with a stable `id` closure, not inline arrow functions redefined each render |
| Extracting `expandNavAncestorsForId` (Task 2) subtly changes `select()`'s behavior if the extraction isn't a faithful copy (e.g. reading `useUIStore.getState()` vs. the hook-bound setters closes over different timing) | Medium | Task 2's acceptance criteria explicitly require every pre-existing `useNavTree.test.ts` `select()` ancestor-expand test to keep passing unmodified, proving behavior parity before any new caller is added |
| `useAccordionOpenState`'s registration effect (Task 3) could leak stale registrations across `resetKey` changes if unregister-then-reregister isn't ordered correctly relative to React's state-adjustment-during-render pattern the hook already uses for `resetKey` | Medium | Task 3's acceptance criteria explicitly test the resetKey-then-registry-reflects-only-current-key case |
| Mobile sibling-closing (Task 5) accidentally closes accordions in a different view instance if `openExclusive`'s scoping assumption ("one hook instance owns a disjoint id namespace per view," spec §2.2) is ever violated by a future view reusing an id another view also uses | Low | `openExclusive` only ever mutates its own hook instance's `openIds` — it has no way to reach another instance's state even if ids collided, so this failure mode is structurally prevented, not just tested around |
| Manual browser check (Task 5, Checkpoint: Integration) is not automated and could be skipped under time pressure | Low — no correctness risk to the automated suite, only a UX-feel/visual risk | Called out explicitly as a Checkpoint gate, matching `docs/tasks/GLOBAL_VOLUME_CONTROL.md`'s own precedent for flagging manual checks rather than silently skipping them |

## Open Questions

Carried forward from spec §7, resolved here:

1. ~~The mobile/desktop signal for §2.3 isn't identified yet.~~ **Resolved** (Architecture Decisions above): `useCabinetTier() === 'mobile'`, reusing the existing tier hook — no new breakpoint mechanism.
2. ~~The exact code path for Direction 2's ancestor-expand call isn't pinned down.~~ **Resolved** (Architecture Decisions above): option (a) — extract `expandNavAncestorsForId` from `useNavTree.ts`'s `select()` and share it, rather than duplicating id-parsing logic in `useAccordionOpenState.ts`.
3. ~~Whether `accordionSync.ts`'s registry should warn on a double-registration.~~ **Resolved**: match `sectionRefs.ts`'s own silent-replace contract exactly (Task 1's acceptance criteria assert this directly).
4. ~~Test coverage shape for the `useSyncExternalStore` wiring.~~ **Resolved**: Task 4's acceptance criteria cover both the initial-snapshot-correct case and the subscription-fires-after-mount case explicitly.
