# Implementation Plan: Robot Section/Subsection Config Consolidation

Source spec: [docs/specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md](../specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md). No separate intent doc (spec's own §-front-matter explains why). Not yet slotted into any roadmap doc.

## Overview

One canonical table (`ROBOT_SECTIONS_CONFIG`, extending `robotSubsectionConfig.ts`) replaces 3 independently-authored copies of the same Probes/Companies section/subsection shape: `useNavTree.ts`'s `SECTION_CHILDREN`/`SUBSECTION_CHILDREN`, and the hand-inlined `AccordionSchema` literals + hand-typed id arrays duplicated across `RobotOptionsTab.tsx` (robot mode) and `CompanyOptionsSection.tsx` (company/All-Probes broadcast mode). 6 tasks across 5 phases: the data table first (zero consumers touched — pure addition, safest possible first step), then the nav tree migrates to read it, then a new shared shell component is built and tested in isolation, then each of the two content components migrates to it **one at a time, sequentially** — never both in one task, since together they carry ~1,978 lines of existing test coverage (spec §1.2) that must not regress, and a single bad assumption in the shared shell should surface on the first integration, not silently corrupt the second at the same time.

## Architecture Decisions

Resolving [spec §7](../specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md#7-open-questions--risks)'s open questions:

- **Resolves spec §7 open question 1 (hook vs. component): a component, `RobotSectionAccordionStack`, taking a `renderSubsection` render-prop** — closer to option (b) than the spec's own tentative "(a) hook" recommendation, on a fact check the spec itself didn't run: `RobotDisplaySection` (the structural difference the spec worried would fight a shared component) renders as a plain sibling *before* the accordion stack begins ([RobotOptionsTab.tsx:236](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L236)), not woven into any of the 4 sections — so `RobotOptionsTab` can render `<RobotDisplaySection />` then `<RobotSectionAccordionStack />` as two siblings, with nothing about the stack itself needing to know `RobotDisplaySection` exists. The other real difference (active vs. disabled trait styling, `CompanyOptionsSection`'s `active` flag) is threaded through as a `resolveStyle: (trait: Trait) => CSSProperties` prop instead of a structural fork. A component fully collapses the JSX shell (the thing actually duplicated, per spec §1.1 item 3) — a hook returning data that each caller still renders into near-identical JSX would leave the real duplication in place.
- **Resolves spec §7 open question 2: keep `FIRST_SUBSECTION_OF`/`SOURCE_OSCILLATOR_SUBSECTIONS`/`OSCILLATOR_LABELS` as thin one-line derived exports** reading from `ROBOT_SECTIONS_CONFIG`, rather than deleting them and updating every existing import site. Cheaper, and matches `resolveAccessibleName`'s own "one source, several narrow accessors" shape elsewhere in this codebase (`docs/COMPONENT_LIBRARY.md`).
- **Resolves spec §7 open question 6: 5 phases, each with its own checkpoint**, not one large phase. The data table (Task 1) and the nav-tree migration (Task 2) are low-risk and independently verifiable before either content component is touched at all; the shared shell (Task 3) ships with a fake `renderSubsection` and no real caller, exactly like `accordionSync.ts`'s own Task 1 in `NAV_ACCORDION_SYNC.md`, so its own correctness is provable before it's trusted with real, tested UI; `RobotOptionsTab.tsx` (Task 4) and `CompanyOptionsSection.tsx` (Task 5) integrate one at a time so a wrong assumption in the shared shell is caught against one 499-line test suite before it's ever pointed at the second, 520-line one.
- **Spec §7 open question 3 (verify the table against current shipped source) becomes Task 1's first acceptance criterion** — not a standalone step, since it's meaningless to check separately from actually writing the table.
- **Spec §7 open questions 4/5 (exact test-porting shape) are left as acceptance criteria on Tasks 1 and 2 respectively**, to be resolved by directly reading `robotSubsectionConfig.test.ts`/`useNavTree.test.ts` at that task's own start — matching `NAV_ACCORDION_SYNC.md`'s own precedent of leaving a small amount of task-time discovery rather than guessing the current test shape from outside it.

## Dependency Graph

```
Task 1 (ROBOT_SECTIONS_CONFIG data table + derived helpers)
        │
        ▼
Task 2 (useNavTree.ts migrates to read the table)
        │
        ▼
Task 3 (RobotSectionAccordionStack — new shared shell, fake caller only)
        │
        ▼
Task 4 (RobotOptionsTab.tsx migrates to the shared shell)
        │
        ▼
Task 5 (CompanyOptionsSection.tsx migrates to the shared shell)
        │
        ▼
Task 6 (docs/UI_SHELL.md)
```

Strictly linear, not a fan-out — unlike `NAV_ACCORDION_SYNC.md`'s Tasks 1/2, no two tasks here are independent of each other. Task 2 needs Task 1's table to exist; Task 3's shell needs nothing from Tasks 1/2 functionally, but is ordered after them so the nav tree (the lower-risk, already-tested consumer) is proven against the new table before the higher-risk shared-shell work starts; Tasks 4 and 5 each need Task 3's shell and are deliberately sequential, not parallel, per the Architecture Decisions above.

## Task List

### Phase 1: Foundation — the data table

- [x] **Task 1: `robotSubsectionConfig.ts` — extend to `ROBOT_SECTIONS_CONFIG`**

  **Description:** Replace the file's current narrow exports (`FIRST_SUBSECTION_OF`, `SOURCE_OSCILLATOR_SUBSECTIONS`, `OSCILLATOR_LABELS`) with the full `ROBOT_SECTIONS_CONFIG: RobotSectionEntry[]` table from [spec §2](../specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md#2-target-data-model), covering all 4 `RobotSection`s and their subsections — including `source`'s `ownAccordionLabel` (the one section with its own wrapping accordion) and `frequency`'s `mergedInto: 'rhythm'` (the one subsection with no accordion of its own, per spec §1.3). Re-implement the 3 old exports as one-line derived reads over the new table (Architecture Decisions above) so **zero other file needs to change in this task** — every existing import of `FIRST_SUBSECTION_OF`/`SOURCE_OSCILLATOR_SUBSECTIONS`/`OSCILLATOR_LABELS` keeps working unmodified. This task adds and extends; it does not yet delete anything from `useNavTree.ts`, `RobotOptionsTab.tsx`, or `CompanyOptionsSection.tsx` (Tasks 2/4/5).

  **Acceptance criteria:**
  - [x] Every `id`/`navLabel`/`accordionLabel`/`trait`/`ownAccordionLabel`/`mergedInto` value in `ROBOT_SECTIONS_CONFIG` is verified, at the moment this task is implemented, against current `main` source (`useNavTree.ts`'s `SECTION_CHILDREN`/`SUBSECTION_CHILDREN`, `RobotOptionsTab.tsx`'s/`CompanyOptionsSection.tsx`'s inline `AccordionSchema` literals) — not copied from the spec's own §2 code block without re-checking, in case `main` has moved since the spec was written (spec §7 open question 3). **Discovery**: `useNavTree.ts`'s own `SECTION_CHILDREN` (the thing transcribed) already disagrees with 2 pre-existing tests about the volume section's label (`'Levels'` in source vs. `'Output'` expected by tests) — transcribed the shipped value (`'Levels'`) per this task's zero-behavior-change scope; see the commit message and this plan's own closing note for detail. Not fixed here.
  - [x] `ROBOT_SECTIONS_CONFIG` has exactly 4 entries (`volume`, `melody`, `envelope`, `source`), in that order, matching `useNavTree.ts`'s current `ROBOT_SECTIONS` array order.
  - [x] `volume`, `melody`, `envelope` each have `ownAccordionLabel: undefined`; `source` has `ownAccordionLabel: 'Source'`.
  - [x] `melody`'s subsections are `[{ id: 'rhythm', ... }, { id: 'frequency', mergedInto: 'rhythm', accordionLabel: undefined, ... }]`, in that order.
  - [x] Every subsection other than `frequency` has a defined `accordionLabel` and no `mergedInto`.
  - [x] `firstSubsectionOf('volume')` returns `'audioSettings'`, `firstSubsectionOf('melody')` returns `'rhythm'`, etc. — behaviorally identical to the old `FIRST_SUBSECTION_OF` record for all 4 keys.
  - [x] The re-implemented `SOURCE_OSCILLATOR_SUBSECTIONS`/`OSCILLATOR_LABELS` (or their direct replacements, if call sites are updated in this same task rather than kept as compatibility shims — implementer's choice, either is acceptable as long as no *other* file changes) produce byte-identical values to today's.
  - [x] Every existing test in `robotSubsectionConfig.test.ts` (if any exist yet — check first) passes unmodified, or is extended (not rewritten) to cover the new table. (None existed; new file added.)

  **Verification:**
  - [x] `npx vitest run src/data/robotSubsectionConfig.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/robotSubsectionConfig.ts`, `src/data/robotSubsectionConfig.test.ts`

  **Estimated scope:** S (one file extended, one test file extended; zero consumers touched)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint` clean.
- [x] `ROBOT_SECTIONS_CONFIG` is fully correct and independently tested — no real consumer reads it yet (`useNavTree.ts`, `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx` are all byte-for-byte unchanged from `main`).
- [x] `npm test` (full suite) shows zero new failures — 18 pre-existing failures across 7 files, confirmed identical with these changes stashed (baseline for every later checkpoint in this plan).
- [ ] Reviewed with human before proceeding to Phase 2. **(Crawford asked to continue through Phase 4 without stopping for review at each checkpoint — proceeding per that instruction; full review deferred to the end.)**

---

### Phase 2: Nav tree migrates to the table

- [x] **Task 2: `useNavTree.ts` — `sectionChildNodes()` reads `ROBOT_SECTIONS_CONFIG`**

  **Description:** Delete `ROBOT_SECTIONS` ([useNavTree.ts:17](../../src/components/panels/screen/nav/useNavTree.ts#L17)), `SECTION_CHILDREN`, and `SUBSECTION_CHILDREN` ([useNavTree.ts:154-178](../../src/components/panels/screen/nav/useNavTree.ts#L154-L178)); rewrite `sectionChildNodes()` ([useNavTree.ts:180-189](../../src/components/panels/screen/nav/useNavTree.ts#L180-L189)) to map over `ROBOT_SECTIONS_CONFIG` per [spec §3.1](../specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md#31-usenavtreets-reads-the-table-instead-of-its-own-literals). The generated `NavTreeNodeSchema[]` shape (id/humanLabel/trait/children) must be pixel-for-pixel identical to today's output — this task changes *where* the tree's labels come from, never what the tree renders. No other function in `useNavTree.ts` (`select`, `isExpanded`, `expandNavAncestorsForId`, `isAutoExpandTier`, `isDeepestTwoLevels`, `isCollapsible`, `buildProbesSubtree`, `buildCompaniesSubtree`) changes.

  **Acceptance criteria:**
  - [x] `sectionChildNodes('probes.r1')` produces the exact same `NavTreeNodeSchema[]` tree (same ids, `humanLabel`s, `trait`s, nesting) as today's implementation, for at least one robot id and one company id — asserted directly, not just "the app looks the same." (Existing `useNavTree.test.ts` coverage already asserts this per-id/per-trait for both `probes.r1` and `companies.c1`/`probes.all` — a redundant new test was not added; see Checkpoint note.)
  - [x] The 4th-level "Pitches" (`frequency`) node still renders as its own nav-tree leaf (`probes.r1.melody.frequency`, `humanLabel: 'Pitches'`) even though it now carries `mergedInto` in the data table — `mergedInto` affects only the *content/accordion* side (Tasks 4/5), never nav-tree node generation, which still gets one tree node per subsection regardless of `mergedInto`.
  - [x] Every existing `useNavTree.test.ts` assertion about rendered tree shape/labels/ids for Probes/Companies subtrees passes unmodified.
  - [x] `ROBOT_SECTIONS`/`SECTION_CHILDREN`/`SUBSECTION_CHILDREN` are not imported directly by any test — nothing to port (checked at task start, per spec §7 open question 5).
  - [x] **Deviation from the plan, applied and noted:** `ROBOT_SECTIONS` (the local array) is *not* deleted outright as originally planned — it's still read by `asRobotSection`, an unrelated id-parsing type guard the spec's own file citation missed. Kept, but now derived as `ROBOT_SECTIONS_CONFIG.map((s) => s.id)` instead of a second hand-typed literal — satisfies the same "one source of truth" goal without breaking `asRobotSection`.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/useNavTree.test.ts` passes (1 pre-existing failure, unchanged from baseline — see below).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite) — same 17 named pre-existing failures as baseline, confirmed via git-stash A/B; zero new failures.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`, possibly `src/data/robotSubsectionConfig.test.ts` (if porting tests per the last acceptance criterion above)

  **Estimated scope:** S (one file's internals rewritten against an already-correct table; no new behavior)

### Checkpoint: Nav Tree Migrated
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (mod. pre-existing failures, unchanged).
- [x] The nav tree (Probes/Companies branches) is provably unchanged in rendered shape — `useNavTree.test.ts`'s own coverage is the proof, not a manual click-through at this checkpoint (that comes later, at Phase 4's own checkpoint, once there's something new to actually look at).
- [x] `RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` are still byte-for-byte unchanged from `main` — confirms this phase's own claimed scope (nav tree only) was honored.
- [ ] Reviewed with human before proceeding to Phase 3. **(Proceeding per Crawford's instruction to continue through Phase 4 without stopping; full review deferred to the end.)**

---

### Phase 3: Shared shell — built and tested in isolation

- [x] **Task 3: `RobotSectionAccordionStack.tsx` — the shared accordion-stack component**

  **Description:** New component, `src/components/panels/screen/nav/RobotSectionAccordionStack.tsx`, implementing [spec §3.2](../specs/ROBOT_SECTION_CONFIG_CONSOLIDATION.md#32-robotoptionstabtsx--companyoptionssectiontsx-map-over-the-table-instead-of-hand-authoring-jsx)'s shell extraction per the Architecture Decisions above (a component, not a hook). Props:

  ```typescript
  interface RobotSectionAccordionStackProps {
    prefix: string;                                                        // e.g. `probes.${robot.id}`, `probes.all`, `companies.${id}`
    isOpen: (id: string) => boolean;                                       // from the caller's own useAccordionOpenState
    setOpen: (id: string, open: boolean) => void;
    hasApproached: (id: string) => boolean;                                // from the caller's own useSectionObserver
    sectionAnchorRef: (id: string) => (el: HTMLDivElement | null) => void; // same shape as today's local helper in both files
    resolveStyle: (trait: Trait) => CSSProperties;                        // RobotOptionsTab passes getTraitColorStyle; CompanyOptionsSection passes the active/disabled ternary
    renderSubsection: (subsectionId: RobotSubsection, sectionId: RobotSection) => React.ReactNode;
  }
  ```

  Internally maps `ROBOT_SECTIONS_CONFIG`: for each section, renders a `sectionAnchorRef`-wrapped `<div>`; for `source` (the one section with `ownAccordionLabel` set), wraps its subsections' own accordions inside one additional outer `AccordionContainer`, matching today's nesting exactly ([RobotOptionsTab.tsx:306-356](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L306-L356)); for every other section, renders its single accordion-bearing subsection directly, no wrapping accordion. **Subsections with `mergedInto` set (only `frequency`) are skipped entirely** — no anchor div, no accordion, no `subsectionIds`/`accordionIds` entry — exactly as `frequency` is invisible to today's `subsectionIds` array; a merged subsection's own scroll anchor remains the responsibility of whatever `renderSubsection` returns for its merge-target sibling (e.g. `rhythm`'s `renderSubsection` call is still the one place `` `${prefix}.melody.frequency` `` gets passed down as `noteVarianceAnchorId`, computed from the config's `mergedInto` relationship rather than hand-typed). Also exports `sectionIds(prefix)`/`subsectionIds(prefix)`/`accordionIds(prefix)` helper functions derived from `ROBOT_SECTIONS_CONFIG`, replacing the hand-typed arrays both `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx` currently declare inline.

  Ships with **no real caller yet** — tested via a fake `renderSubsection` (e.g. returning a marker `<div data-testid={...}>`) and fake `isOpen`/`setOpen`/`hasApproached`/`sectionAnchorRef` implementations, mirroring `accordionSync.ts`'s own Task 1 precedent in `NAV_ACCORDION_SYNC.md` (independently correct and testable before Tasks 4/5 trust it with real, tested UI).

  **Acceptance criteria:**
  - [x] `accordionIds('probes.r1')` returns exactly the 8 ids today's `RobotOptionsTab.tsx` hand-builds (7 subsection ids + `` `probes.r1.source` ``), in the same order. **Deviation, noted:** `subsectionIds`/`accordionIds` live in `robotSubsectionConfig.ts`, not this component file — they're pure derivations of `ROBOT_SECTIONS_CONFIG` with no dependency on React, and keeping them out of the `.tsx` file avoided a real `react-refresh/only-export-components` lint warning at zero cost. `sectionIds(prefix)` (mentioned in the plan's own description) was not added — nothing needed it; only the 2 actually-consumed helpers were built (scope discipline).
  - [x] `subsectionIds('probes.r1')` returns exactly the 7 ids today's `RobotOptionsTab.tsx` hand-builds — `frequency`/Pitches excluded.
  - [x] Rendering `<RobotSectionAccordionStack>` with a fake `renderSubsection` produces one `AccordionContainer` per non-merged subsection, each with the correct `id`/`humanLabel` (from `accordionLabel`) and correct `open`/`onOpenChange` wired to the passed `isOpen`/`setOpen`.
  - [x] The `source` section's 4 subsections render nested inside one additional outer `AccordionContainer` (`id: `${prefix}.source``, `humanLabel: 'Source'`) — verified structurally (the outer accordion's content contains the 4 inner ones), not just "4 accordions exist somewhere."
  - [x] `volume`/`melody`/`envelope` render their single accordion-bearing subsection with **no** wrapping accordion at the section-level id — only a plain anchor `<div>` at `` `${prefix}.<section>` ``, matching today.
  - [x] `frequency` (or any subsection with `mergedInto` set, tested generically) produces no `AccordionContainer` and does not appear in the rendered output at all.
  - [x] `renderSubsection` is called with `hasApproached(id)` gating its result exactly as today's `hasApproached(...) ? <Content/> : null` pattern — i.e., the component itself calls `hasApproached` and only invokes `renderSubsection` (or renders its result) when true, matching the lazy-mount contract from `docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md`.
  - [x] `resolveStyle(trait)` is applied to each accordion's `style` prop exactly where `RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` currently apply their own module-level style constants.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/RobotSectionAccordionStack.test.tsx` passes (11 tests; `subsectionIds`/`accordionIds` coverage lives in `robotSubsectionConfig.test.ts` instead, alongside the table they derive from).
  - [x] `npm run build:types`, `npm run lint` clean (zero warnings, not just zero errors).

  **Dependencies:** Task 1 (reads `ROBOT_SECTIONS_CONFIG`). Does not depend on Task 2 functionally, but is sequenced after it per the Architecture Decisions above.

  **Files:** `src/components/panels/screen/nav/RobotSectionAccordionStack.tsx`, `src/components/panels/screen/nav/RobotSectionAccordionStack.test.tsx`

  **Estimated scope:** M (one new file, genuinely new composition logic — the `source`-nesting and `mergedInto`-skipping special cases are the real complexity in this whole plan, per spec §1.3)

### Checkpoint: Shared Shell Built
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (mod. the same 17 pre-existing failures, unchanged).
- [x] `RobotSectionAccordionStack` is fully correct and tested in isolation, with no real caller yet — `RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` are still byte-for-byte unchanged from `main`.
- [x] The `source`-wrapping and `frequency`-merging special cases (spec §1.3) are each covered by a dedicated, named test — not incidentally exercised by a broader test.
- [ ] Reviewed with human before proceeding to Phase 4. **(Proceeding per Crawford's instruction; full review deferred to the end.)**

---

### Phase 4: Integration — one call site at a time

- [x] **Task 4: `RobotOptionsTab.tsx` migrates to `RobotSectionAccordionStack`**

  **Description:** Replace [RobotOptionsTab.tsx:234-358](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L234-L358)'s hand-authored JSX shell with `<RobotDisplaySection robot={robot} />` followed by one `<RobotSectionAccordionStack>` call, `renderSubsection` dispatching to the existing 7 content components (`AudioSettingSection`, `PingControlsCompositionSection`, `PingContourDrawer`, `SignatureArrayLayer` ×3, `RobotDriftPanel`) exactly as today, with exactly the same props each currently receives. `resolveStyle` becomes a one-line wrapper around the 4 existing `OUTPUT_STYLE`/`COMPOSITION_STYLE`/`TIME_SPACE_STYLE`/`SPECTRAL_STYLE` module constants ([RobotOptionsTab.tsx:38-41](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L38-L41), unchanged). The local `subsectionIds`/`accordionIds` `useMemo`s ([RobotOptionsTab.tsx:181-204](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L181-L204)) are replaced by calls to `RobotSectionAccordionStack`'s exported `subsectionIds(prefix)`/`accordionIds(prefix)` helpers (Task 3). Everything **not** part of the shell — `useAccordionOpenState`/`useSectionObserver` wiring, `useState`/`useCallback` value derivations, every `applyXxx` handler, `startHidden`/`rootRef`/`viewFade` logic, the `latestRobot` ref pattern — is untouched.

  **Acceptance criteria:**
  - [x] Every existing `RobotOptionsTab.test.tsx` assertion passes unmodified — same rendered accordion ids/labels, same open/close behavior, same content per accordion, same `hasApproached` lazy-mount gating. (All 30 tests passed on the first run, zero test-file edits needed.)
  - [x] `noteVarianceAnchorId={`${prefix}.melody.frequency`}` (currently hand-typed, [RobotOptionsTab.tsx:284](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L284)) is still passed to `PingControlsCompositionSection` from the `rhythm` case of `renderSubsection` — computed from the subsection config's `mergedInto` relationship (or an equivalent explicit derivation), not silently dropped. (Kept as the same `` `${prefix}.melody.frequency` `` literal inside the `rhythm` case, not re-derived from `mergedInto` generically — see note below.)
  - [x] `RobotDisplaySection` still renders once, at the top, exactly as today — outside/before `RobotSectionAccordionStack`, not passed into it.
  - [x] File line count drops substantially — 361 → 324 lines (~10%). Modest at the single-file level since every doc comment was preserved verbatim (nothing stripped for brevity); the real duplication removed is cross-file — this exact shell no longer needs independent verification in Task 5's file. **Deviation, noted:** `subsectionIds`/`accordionIds` are imported directly from `@/data/robotSubsectionConfig` (aliased `computeSubsectionIds`/`computeAccordionIds`), not from `RobotSectionAccordionStack` — see Task 3's own note on where those helpers ended up living.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/RobotOptionsTab.test.tsx` passes.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite) — same 17 pre-existing failures as baseline; zero new failures.
  - [x] `npm run build` clean (production bundle).

  **Dependencies:** Task 3.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`, `src/components/panels/screen/console/RobotOptionsTab.test.tsx`

  **Estimated scope:** M (one file, but the highest-stakes rewrite in this plan — must reproduce ~200 lines of existing JSX behavior exactly through the new shared shell)

- [ ] **Task 5: `CompanyOptionsSection.tsx` migrates to `RobotSectionAccordionStack`**

  **Description:** Same migration as Task 4, applied to [CompanyOptionsSection.tsx:384-500](../../src/components/company/CompanyOptionsSection.tsx#L384-L500). `resolveStyle` here is the existing `active ? XXX_ACTIVE_STYLE : XXX_DISABLED_STYLE` ternary per trait ([CompanyOptionsSection.tsx:37-44](../../src/components/company/CompanyOptionsSection.tsx#L37-L44)), unchanged in logic, just relocated into the `resolveStyle` prop. `disabled={!active}` is still threaded into each content component's own props by `renderSubsection` exactly as today — `RobotSectionAccordionStack` itself has no `disabled` concept of its own, it only decides *which* accordion/content renders, never whether a control inside it is interactive. No `RobotDisplaySection` equivalent exists for this call site (per spec §1.1/`docs/UI_SHELL.md`, `CompanyRenameDeleteForm` plays that role one level up, in `CompaniesContent.tsx` — outside this component entirely, untouched).

  **Acceptance criteria:**
  - [ ] Every existing `CompanyOptionsSection.test.tsx` assertion passes unmodified — same rendered accordion ids/labels, same active/disabled styling and control-disabling behavior, same content per accordion.
  - [ ] `noteVarianceAnchorId` handling matches Task 4's own resolution exactly (both call sites derive it the same way — this is the one place a divergence between the two integrations would be easy to miss).
  - [ ] `resolveStyle` correctly threads `active` (this component's own state, not `RobotSectionAccordionStack`'s concern) into the active/disabled trait-style choice.
  - [ ] File line count drops substantially, same informal signal as Task 4.
  - [ ] `RobotSectionAccordionStack`'s own test suite (Task 3) still passes unmodified — this task should require zero changes to the shared component itself; if it turns out to, that's a sign Task 3's contract was incomplete, and the fix belongs in Task 3's own file with its own test coverage, not a `CompanyOptionsSection`-specific escape hatch bolted onto the shared component.

  **Verification:**
  - [ ] `npx vitest run src/components/company/CompanyOptionsSection.test.tsx` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] `npm test` (full suite) — zero new failures.
  - [ ] `npm run build` clean (production bundle).

  **Dependencies:** Task 4 (sequential, not because of a real code dependency, but per the Architecture Decisions above — proving the shell against one 499-line suite before trusting it with the second, 520-line one).

  **Files:** `src/components/company/CompanyOptionsSection.tsx`, `src/components/company/CompanyOptionsSection.test.tsx`

  **Estimated scope:** M (mirrors Task 4's shape and risk)

### Checkpoint: Integration Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Both `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx` render through `RobotSectionAccordionStack` — no hand-authored accordion JSX or hand-typed `subsectionIds`/`accordionIds` array remains in either file.
- [ ] `RobotSectionAccordionStack.tsx` required zero call-site-specific special-casing to serve both — if it did, that's worth surfacing to the human before Task 6, not quietly shipped.
- [ ] **Manual check (live browser) — not automated, flagged for Crawford before merge**, matching `NAV_ACCORDION_SYNC.md`'s own precedent: open a robot's Options and a company's Options side by side (or in sequence); confirm every accordion opens/closes/labels/scrolls identically to `main`, confirm the Source parent accordion still nests its 4 children correctly, confirm clicking "Pitches" in the nav still opens Composition and scrolls to Note Variance (the exact behavior `59959b5` shipped, per this session's earlier `/context-engineering` summary) in both robot mode and company/All-Probes mode.
- [ ] Reviewed with human before proceeding to Phase 5.

---

### Phase 5: Docs

- [ ] **Task 6: `docs/UI_SHELL.md` — document `ROBOT_SECTIONS_CONFIG`/`RobotSectionAccordionStack`**

  **Description:** Add a short note to `UI_SHELL.md`'s "Content model" section (alongside its existing `accordionSync`/`sectionRefs` descriptions) naming `ROBOT_SECTIONS_CONFIG` (`src/data/robotSubsectionConfig.ts`) as the single source for Probes/Companies' section/subsection shape, and `RobotSectionAccordionStack` as the shared shell both `RobotOptionsTab`/`CompanyOptionsSection` render through. Spot-check every named identifier against the final shipped source from Tasks 1–5, matching `NAV_ACCORDION_SYNC.md`'s own Task 6 convention for landing docs last.

  **Acceptance criteria:**
  - [ ] Names `ROBOT_SECTIONS_CONFIG`, `RobotSectionAccordionStack`, and the `mergedInto`/`ownAccordionLabel` special cases (§1.3) exactly matching shipped source.
  - [ ] Explicitly notes that `COMPONENT_LIBRARY.md`'s existing description of `RobotOptionsTab`/`CompanyOptionsSection` as separate hand-authored views (if it says that anywhere) is now stale and should be corrected in the same pass, or flagged if out of this task's own file scope.

  **Verification:**
  - [ ] Manual review — every documented name/behavior spot-checked directly against the final shipped code from Tasks 1–5.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change; full `npm test`/`npm run build` already reconfirmed clean at Checkpoint: Integration Complete).

  **Dependencies:** Task 1, Task 2, Task 3, Task 4, Task 5.

  **Files:** `docs/UI_SHELL.md`, possibly `docs/COMPONENT_LIBRARY.md` (per the second acceptance criterion above)

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint` clean (post-docs-change spot check); full `npm test`/`npm run build` confirmed clean at Checkpoint: Integration Complete.
- [ ] All automated acceptance criteria across all 6 tasks are met.
- [ ] `docs/UI_SHELL.md` reflects the shipped API — every documented name spot-checked against source.
- [ ] **Manual/live-browser check from Task 4/5's own checkpoint was performed** (or, if not, explicitly re-flagged here — do not let it silently lapse between checkpoints).
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The `ROBOT_SECTIONS_CONFIG` table (Task 1) is transcribed from the spec instead of freshly re-verified against `main`, silently reintroducing a stale label if anything changed between spec-writing and implementation | Medium | Task 1's first acceptance criterion requires re-checking every value against current source, not trusting the spec's own §2 code block verbatim |
| `RobotSectionAccordionStack` (Task 3)'s handling of the `source`-nesting/`frequency`-merging special cases (spec §1.3) is subtly wrong in a way neither integration task (4/5) happens to exercise, because both real call sites share the same config and would reproduce the same bug identically | Medium | Task 3's acceptance criteria require dedicated, named tests for both special cases *before* either real integration, using a fake `renderSubsection` — the special-case logic is proven correct on its own terms, not only by "the existing test suites still pass," which could pass even if a subtly wrong-but-consistent behavior shipped in both call sites at once |
| Integrating both `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx` in one task hides a shared-shell bug that only manifests in the second file's own edge cases (e.g. the `disabled` styling ternary) | Medium | Tasks 4 and 5 are sequential, not combined — Task 5's own acceptance criteria explicitly require that zero changes to `RobotSectionAccordionStack` itself are needed, surfacing exactly this failure mode if it occurs |
| `noteVarianceAnchorId`'s derivation (the one place `frequency`'s merge leaks into a real prop, not just internal component logic) is implemented two different ways across Tasks 4 and 5, silently drifting apart the way the original two files already had before this plan | Low–Medium | Explicit acceptance criterion in both Task 4 and Task 5 requiring the same derivation approach; Task 5 additionally requires the check to be against Task 4's own resolution, not derived independently |
| The docs update (Task 6) is skipped or rushed under time pressure once the code itself is green, leaving `COMPONENT_LIBRARY.md`/`UI_SHELL.md` describing a shell that no longer exists | Low | Called out explicitly as its own Checkpoint gate, matching `NAV_ACCORDION_SYNC.md`'s own precedent for flagging manual/doc steps rather than silently skipping them |

## Open Questions

None blocking — spec §7's open questions are all resolved above (Architecture Decisions) or converted into task-level acceptance criteria (Tasks 1/2). Nothing here needs a decision before Task 1 can start.
