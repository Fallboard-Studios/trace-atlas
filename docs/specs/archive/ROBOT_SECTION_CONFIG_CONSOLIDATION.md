# Phase Spec: Robot Section/Subsection Config Consolidation

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Coverage: `npm run test:coverage`
> - Dev server: `npm run dev`
> - Format: `npm run format`

Source of intent: a code-organization review conversation with Crawford, 2026-09-27 (no separate `docs/intent/` doc — this spec's §1 *is* the write-up of that review, expanded with direct source citations). Follow-up to the Nav ↔ Accordion Sync work ([NAV_ACCORDION_SYNC.md](NAV_ACCORDION_SYNC.md), merged to `main` via PR #495) and [NAV_PANEL_VIEWS_AND_CONTENT.md](NAV_PANEL_VIEWS_AND_CONTENT.md) (the stacked-accordion view model this phase reorganizes the data for, without changing its behavior). **Status: not started.** This is a data-organization refactor, not a new feature — §7 lists the design decisions that need an explicit yes before Phase 3 (Tasks) is written, because two of them (the "Source" wrapping-accordion asymmetry, and whether to extract a shared render helper) materially change how much of `RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` gets touched.

---

## 1. Overview & Claude Explanation

### 1.1 The problem, evidenced from source

Crawford tried to rewrite a view built from panels/accordions/sliders and found the data hard to trace — "seemingly similar or even identical things were in disparate places." Direct source reading confirms this is real, and localizes it precisely: **leaf-level `ControlSchema` data (`src/data/*Config.ts`) is well-organized** — typed, one definition per control, correctly factored where it repeats (`robotOptionsConfig.ts`'s `makeLayerBlock()` for the 3 oscillator layers, [robotOptionsConfig.ts:356-424](../../src/data/robotOptionsConfig.ts#L356-L424)). The actual problem is one layer up, in the **section/subsection "shell"** — which accordions exist for a robot/company, their ids, order, labels, and trait — which is independently authored in at least three places that don't reference each other:

1. **`useNavTree.ts`'s `SECTION_CHILDREN`/`SUBSECTION_CHILDREN`** ([useNavTree.ts:154-178](../../src/components/panels/screen/nav/useNavTree.ts#L154-L178)) — the nav tree's own id→label→trait table, consumed by `sectionChildNodes()` to build `probes.<id>.*`/`companies.<id>.*` tree nodes.
2. **`robotSubsectionConfig.ts`** ([robotSubsectionConfig.ts](../../src/data/robotSubsectionConfig.ts)) — a second, *partial* copy of the same information (`FIRST_SUBSECTION_OF`, `SOURCE_OSCILLATOR_SUBSECTIONS`, `OSCILLATOR_LABELS`). Its own doc comment says it exists specifically so `RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` don't "hand-duplicate the exact same tree-order/label table and risk drifting apart" — a correct diagnosis that was only partially acted on.
3. **`RobotOptionsTab.tsx`** ([RobotOptionsTab.tsx](../../src/components/panels/screen/console/RobotOptionsTab.tsx), 361 lines) **and `CompanyOptionsSection.tsx`** ([CompanyOptionsSection.tsx](../../src/components/company/CompanyOptionsSection.tsx), 504 lines) — each hand-authors the *entire* accordion shell a third and fourth time, as literal inline JSX (`schema={{ id: ..., type: 'accordion', humanLabel: '...' }}` at each of 7 call sites per file). Within a single file, one subsection's id string (e.g. `` `${prefix}.melody.rhythm` ``) is hand-typed 4-5 separate times — `sectionAnchorRef`, the `subsectionIds` array, the `accordionIds` array, the `AccordionContainer`'s own `schema.id`, and the matching `isOpen`/`setOpen` calls. The two files are kept in sync only by comments pointing at each other ("see RobotOptionsTab.tsx's own matching comment").

**A concrete, already-real duplicate-value bug** (same class tracked in `docs/DUPLICATE_VALUE_AUDIT.md`, not yet an entry there): `robotSubsectionConfig.ts`'s `OSCILLATOR_LABELS` (`'Baseline Oscillator'`, `'Coaxial Oscillator'`, `'Harmonic Oscillator'`) is word-for-word duplicated inside `useNavTree.ts`'s `SUBSECTION_CHILDREN.source` array ([useNavTree.ts:172-176](../../src/components/panels/screen/nav/useNavTree.ts#L172-L176)) — two independent literals for the same 3 strings, neither importing the other.

**A better pattern already exists in the same codebase**: `FleetParamsContent.tsx` ([FleetParamsContent.tsx:65-109](../../src/components/panels/screen/nav/content/FleetParamsContent.tsx#L65-L109)) drives its own accordion stack from one `FLEET_PARAMS_GROUPS: FleetParamsGroupDef[]` array, rendered via `.map()`, rather than hand-copied JSX per group. Its own comment admits it still separately restates ids/labels/traits already in `navTreeConfig.ts` — so even this "good" example isn't fully DRY — but critically, Fleet Params has only *one* content component, so it never hit the worse failure mode Probes/Companies did: two full hand-copies of the same shell.

### 1.2 Objective

Collapse the section/subsection shell data for Probes/Companies (robot mode and company/All-Probes broadcast mode) into **one canonical table**, consumed by both the nav tree (`useNavTree.ts`) and the content views (`RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx`), so that adding, removing, reordering, or relabeling a subsection is a one-line change in one file instead of a coordinated edit across up to 4 files and roughly 15 hand-typed string occurrences.

**Non-goals, explicitly:**
- Leaf-level `ControlSchema` data (`src/data/*Config.ts`) — already good, not touched.
- `FleetParamsContent.tsx`'s own lesser duplication against `navTreeConfig.ts` — a real but smaller instance of the same class of problem, noted as a candidate follow-up, out of scope here (§1.1 explains why it's lower priority: one copy, not two).
- Any visible behavior change. Every id string, every rendered label, every accordion's open/closed default, every trait color, and every test assertion about DOM output must be unchanged. This is a pure data-organization refactor riding on ~1,978 lines of existing test coverage across the 3 files it touches most (`RobotOptionsTab.test.tsx` 499 lines, `CompanyOptionsSection.test.tsx` 520 lines, `useNavTree.test.ts` 959 lines) — those suites are the acceptance bar, not a formality to re-derive.
- `accordionSync.ts`, `useAccordionOpenState.ts`, `sectionRefs.ts`, `useSectionObserver.ts`, `AccordionContainer.tsx`, `robotOptionsActions.ts`, `companyOptions.ts` — none of these own the *shape* of the section/subsection tree; they consume ids generically. Untouched.

### 1.3 Correction — the "Source" section is structurally asymmetric

Not every `RobotSection` has the same shell shape, and the canonical table must represent this exactly, not paper over it:

- **`volume`, `melody`, `envelope`** each have exactly one *accordion-bearing* subsection (`audioSettings`, `rhythm`, `pingContour`), and that subsection's own `AccordionContainer` is the only accordion at that level — there is no separate wrapping accordion at the `.volume`/`.melody`/`.envelope` id (those ids are registered only as scroll anchors via `sectionAnchorRef`, never as an `AccordionContainer`).
- **`melody` additionally has a subsection with no accordion of its own**: `frequency` ("Pitches") has a nav-tree leaf and a `sectionRefs` scroll anchor (inside `PingControlsCompositionSection`, around its Note Variance slider — [RobotOptionsTab.tsx:260-266](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L260-L266)) but is folded into `rhythm`'s "Composition" accordion rather than getting one of its own. `openAccordionFromNav`'s existing sibling-fallback already handles a nav click landing on an id with no registered accordion (`docs/specs/NAV_ACCORDION_SYNC.md` §1.2) — this phase must preserve that exact merge, not "fix" it into a 1:1 mapping.
- **`source` is the one section with its own wrapping `AccordionContainer`** (id `` `${prefix}.source` ``), containing 4 independently-open nested accordions (`baselineOscillator`, `coaxialOscillator`, `harmonicOscillator`, `probeDrift`) — the only place in either file where an accordion nests inside another accordion.

The canonical table (§2) models this as a per-subsection `accordionLabel?: string` (absent for `frequency`, which instead carries `mergedInto: 'rhythm'`) plus a per-section `ownAccordionLabel?: string` (present only for `source`) — not a uniform "one accordion per subsection" shape that would misrepresent 2 of the 4 sections.

---

## 2. Target Data Model

Extend `robotSubsectionConfig.ts` — already the closest thing to a canonical home, per its own doc comment's stated intent — into the full table. Replaces `FIRST_SUBSECTION_OF`, `SOURCE_OSCILLATOR_SUBSECTIONS`, and `OSCILLATOR_LABELS` (all 3 fold into the richer shape below; nothing keeps the old narrower exports once every call site migrates).

```typescript
// src/data/robotSubsectionConfig.ts

import type { RobotSection, RobotSubsection } from '@/stores/uiStore';
import type { Trait } from '@/types/traits';

export interface RobotSubsectionEntry {
  id: RobotSubsection;
  /** Nav-tree row label (NavCabinetRow/NavTreeNode). May differ from accordionLabel — e.g.
   *  'rhythm''s nav label is 'Rhythm', its accordion trigger reads 'Composition' — both surfaces
   *  read this table instead of each hand-typing their own copy. */
  navLabel: string;
  /** This subsection's own AccordionContainer trigger label. Absent exactly when mergedInto is
   *  set (§1.3) — a subsection with no accordion of its own. */
  accordionLabel?: string;
  /** Set only for a subsection with no accordion of its own — the sibling subsection id whose
   *  accordion it scrolls into instead (§1.3's 'frequency' -> 'rhythm' case). Absent for every
   *  subsection that owns its own accordion. */
  mergedInto?: RobotSubsection;
}

export interface RobotSectionEntry {
  id: RobotSection;
  navLabel: string;
  trait: Trait;
  /** Present only for a section that wraps its subsections in its OWN accordion ('source') — its
   *  value is that wrapping accordion's trigger label. Absent for volume/melody/envelope, whose
   *  single accordion-bearing subsection's own accordion is that section's only chrome (§1.3). */
  ownAccordionLabel?: string;
  subsections: RobotSubsectionEntry[];
}

/** Tree order == render order, for both the nav tree (useNavTree.ts) and the stacked content
 *  views (RobotOptionsTab.tsx/CompanyOptionsSection.tsx) — one array, both consumers iterate it
 *  directly instead of each hand-declaring their own order (replaces useNavTree.ts's own
 *  ROBOT_SECTIONS/SECTION_CHILDREN/SUBSECTION_CHILDREN literals, §3.1). */
export const ROBOT_SECTIONS_CONFIG: RobotSectionEntry[] = [
  {
    id: 'volume', navLabel: 'Levels', trait: 'output',
    subsections: [
      { id: 'audioSettings', navLabel: 'Dynamics', accordionLabel: 'Levels' },
    ],
  },
  {
    id: 'melody', navLabel: 'Composition', trait: 'composition',
    subsections: [
      { id: 'rhythm', navLabel: 'Rhythm', accordionLabel: 'Composition' },
      { id: 'frequency', navLabel: 'Pitches', mergedInto: 'rhythm' },
    ],
  },
  {
    id: 'envelope', navLabel: 'Envelope', trait: 'timeSpace',
    subsections: [
      { id: 'pingContour', navLabel: 'Contour', accordionLabel: 'Envelope' },
    ],
  },
  {
    id: 'source', navLabel: 'Source', trait: 'spectral', ownAccordionLabel: 'Source',
    subsections: [
      { id: 'baselineOscillator', navLabel: 'Baseline Oscillator', accordionLabel: 'Baseline Oscillator' },
      { id: 'coaxialOscillator', navLabel: 'Coaxial Oscillator', accordionLabel: 'Coaxial Oscillator' },
      { id: 'harmonicOscillator', navLabel: 'Harmonic Oscillator', accordionLabel: 'Harmonic Oscillator' },
      { id: 'probeDrift', navLabel: 'Probe Drift', accordionLabel: 'Probe Drift' },
    ],
  },
];
```

Every literal string above is copied verbatim from current source (§1.1/§1.3 citations) — this is a reorganization, not a relabel. **Verification that this table is faithful to today's shipped behavior is itself a Task 1 acceptance criterion** (§7 open question 3), not an assumption this spec gets to make once and walk away from.

Small derived helpers (kept, not removed) live alongside the table for callers that only need one slice of it — e.g. `firstSubsectionOf(section): RobotSubsection` (replaces `FIRST_SUBSECTION_OF`) — implemented as a one-line lookup over `ROBOT_SECTIONS_CONFIG`, not a second hand-authored table.

---

## 3. Consumers

### 3.1 `useNavTree.ts` reads the table instead of its own literals

`ROBOT_SECTIONS`, `SECTION_CHILDREN`, and `SUBSECTION_CHILDREN` ([useNavTree.ts:17](../../src/components/panels/screen/nav/useNavTree.ts#L17), [useNavTree.ts:154-178](../../src/components/panels/screen/nav/useNavTree.ts#L154-L178)) are deleted; `sectionChildNodes()` ([useNavTree.ts:180-189](../../src/components/panels/screen/nav/useNavTree.ts#L180-L189)) maps over `ROBOT_SECTIONS_CONFIG` directly:

```typescript
import { ROBOT_SECTIONS_CONFIG } from '@/data/robotSubsectionConfig';

function sectionChildNodes(entityBranchPrefix: string): NavTreeNodeSchema[] {
  return ROBOT_SECTIONS_CONFIG.map((section) => ({
    id: `${entityBranchPrefix}.${section.id}`,
    humanLabel: section.navLabel,
    trait: section.trait,
    children: section.subsections.map((sub) => ({
      id: `${entityBranchPrefix}.${section.id}.${sub.id}`,
      humanLabel: sub.navLabel,
    })),
  }));
}
```

Every other function in `useNavTree.ts` (`select`, `isExpanded`, `isAutoExpandTier`, `isDeepestTwoLevels`, `isCollapsible`, `expandNavAncestorsForId`) is untouched — none of them own section/subsection *content*, only tree-navigation mechanics generic to any id shape.

### 3.2 `RobotOptionsTab.tsx` / `CompanyOptionsSection.tsx` map over the table instead of hand-authoring JSX

Both components currently repeat the identical 7-accordion shell (§1.1 item 3). This phase extracts the *shell* — id construction, `sectionAnchorRef` wiring, `subsectionIds`/`accordionIds` derivation, the `AccordionContainer` nesting (including `source`'s wrapping accordion, §1.3), and the `hasApproached`/`isOpen`/`setOpen` plumbing — into one shared piece, consumed by both files. Each file keeps 100% of its own value-resolution, event handlers, and disabled-state logic (`robotOptionsActions.ts`/`companyOptions.ts` wiring) exactly as-is; only the shell that was previously hand-copied is shared.

The shared piece's exact form (a hook returning render-ready structure vs. a component taking a `renderSubsection(id) => ReactNode` render-prop, matching `FleetParamsContent.tsx`'s own `renderLeaf()` precedent, §1.1) is **left open for Tasks** (§7 open question 1) — both are viable and the choice affects file count more than behavior. What's fixed by this spec: `subsectionIds`/`accordionIds` (currently hand-typed arrays in both files, [RobotOptionsTab.tsx:181-189](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L181-L189)/[204](../../src/components/panels/screen/console/RobotOptionsTab.tsx#L204) and the matching lines in `CompanyOptionsSection.tsx`) are derived from `ROBOT_SECTIONS_CONFIG` at both call sites, never hand-typed again; every `AccordionSchema` literal's `id`/`humanLabel` comes from the table, never a JSX-inline string literal.

---

## 4. Target File Structure

```text
src/data/
    ├── robotSubsectionConfig.ts        # MODIFIED — extended to ROBOT_SECTIONS_CONFIG (§2);
    │                                     #   FIRST_SUBSECTION_OF/SOURCE_OSCILLATOR_SUBSECTIONS/
    │                                     #   OSCILLATOR_LABELS fold into it, replaced by thin
    │                                     #   derived helpers where a caller needs just one slice
    └── robotSubsectionConfig.test.ts   # MODIFIED — covers the extended table + derived helpers

src/components/panels/screen/nav/
    ├── useNavTree.ts                    # MODIFIED — sectionChildNodes() reads
    │                                     #   ROBOT_SECTIONS_CONFIG (§3.1); ROBOT_SECTIONS/
    │                                     #   SECTION_CHILDREN/SUBSECTION_CHILDREN deleted
    └── useNavTree.test.ts               # MODIFIED only if deleted-literal coverage moves;
                                          #   every existing assertion about rendered tree
                                          #   shape/labels must keep passing unmodified (§1.2)

src/components/panels/screen/console/
    ├── RobotOptionsTab.tsx              # MODIFIED — shell extracted per §3.2
    └── RobotOptionsTab.test.tsx         # MODIFIED only if the extraction changes what's
                                          #   directly testable here vs. in the shared piece;
                                          #   every existing assertion keeps passing unmodified

src/components/company/
    ├── CompanyOptionsSection.tsx        # MODIFIED — shell extracted per §3.2
    └── CompanyOptionsSection.test.tsx   # same caveat as RobotOptionsTab.test.tsx above

[NEW, exact path/name TBD at Tasks, §7 open question 1 — e.g.
 src/components/panels/screen/console/useRobotSectionStack.ts, or a shared
 RobotSectionAccordionStack.tsx component]
    ├── [shared shell piece]             # NEW
    └── [shared shell piece].test.ts(x)  # NEW

docs/
└── UI_SHELL.md                          # MODIFIED — "Content model" section gains a short note
                                          #   naming ROBOT_SECTIONS_CONFIG as the shared source for
                                          #   Probes/Companies' section/subsection shape, alongside
                                          #   its existing accordionSync/sectionRefs descriptions
```

**Explicitly not touched, and why:**

- `src/data/*Config.ts` (`audioRigConfig.ts`, `robotOptionsConfig.ts`, `sectorSettingsConfig.ts`, `companyConfig.ts`, `lfoConfig.ts`) — leaf-level `ControlSchema` data, already well-factored (§1.2). Not this phase's problem.
- `FleetParamsContent.tsx`, `SettingsContent.tsx`, `navTreeConfig.ts` — Fleet Params/Settings have their own (smaller, single-copy) version of this pattern; explicitly out of scope (§1.2). A future follow-up could apply the same treatment, but bundling it here doubles this phase's blast radius for a lower-severity instance of the same bug class.
- `accordionSync.ts`, `useAccordionOpenState.ts`, `sectionRefs.ts`, `useSectionObserver.ts`, `AccordionContainer.tsx`/`.css` — none of these own section/subsection *content*, only generic id-keyed mechanics. No signature changes.
- `robotOptionsActions.ts`, `systems/companyOptions.ts` — the domain logic each content component wires its handlers to. Untouched.
- `SignatureArrayLayer`/`PingControlsCompositionSection`/`PingContourDrawer`/`AudioSettingSection`/`RobotDriftPanel` — the components rendered *inside* each accordion. Untouched; only what wraps them moves.
- Every id string currently in use (`probes.<id>.volume.audioSettings`, etc.) — byte-identical before and after. `accordionSync`, `sectionRefs`, scrollspy, and deep-link behavior all key off these exact strings; this phase changes where they're *declared*, never their value.

---

## 5. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §4 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Zero behavior change.** Every existing test in `robotSubsectionConfig.test.ts`, `useNavTree.test.ts`, `RobotOptionsTab.test.tsx`, and `CompanyOptionsSection.test.tsx` must keep passing — modified only where a test literally asserted against an internal literal this phase deletes (e.g. importing `SECTION_CHILDREN` directly), never where it asserts rendered output, ids, or labels.
* **No id strings change.** `ROBOT_SECTIONS_CONFIG` (§2) must reproduce every id/label/trait currently hand-typed across `useNavTree.ts`/`RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` exactly — this is a data-source consolidation, not a relabeling pass. Any label Crawford actually wants changed while this is fresh in view should be a separate follow-up, not folded silently into this refactor.
* **`source`'s wrapping-accordion asymmetry (§1.3) must stay expressible, not be generalized away.** Do not force `volume`/`melody`/`envelope` into a fake wrapping accordion just to make the table uniform — `ownAccordionLabel` being `undefined` for 3 of 4 sections is the correct, faithful representation of current behavior.
* **`frequency`'s accordion-less merge into `rhythm` (§1.3) must stay expressible.** Do not silently give `frequency` its own accordion as a side effect of "cleaning up" the data shape — that changes real UI behavior (an extra accordion appearing) and was not asked for.
* **This phase does not touch `AccordionSchema`, `ControlSchema`, or any type in `src/types/controls.ts`.** `RobotSubsectionEntry`/`RobotSectionEntry` (§2) are new, separate types describing the shell's own shape — not a replacement for or extension of `AccordionSchema`.
* **Out of scope, explicitly:** `FleetParamsContent.tsx`/`SettingsContent.tsx`/`navTreeConfig.ts`'s own version of this duplication (§4); any relabeling; any change to which content component renders inside which accordion; any change to accordion open/closed defaults, mobile sibling-closing, or nav↔accordion sync behavior (all shipped and tested in `NAV_ACCORDION_SYNC.md`).

---

## 6. Code Style & Architecture Conventions

Matches each touched file's existing style exactly (plain named exports, no `React.FC`, explicit prop interfaces where a new component/hook is introduced). §2's code block above is the concrete target shape for `robotSubsectionConfig.ts`; §3.1's block is the concrete target shape for `useNavTree.ts`'s `sectionChildNodes()`. The new shared shell piece (§3.2, §7 open question 1) should read as a direct sibling to `FleetParamsContent.tsx`'s own `renderLeaf()`/`.map()` pattern — the one already-working local precedent for "one array of section/leaf metadata drives a stacked-accordion view" — rather than inventing a new rendering convention.

Naming: `ROBOT_SECTIONS_CONFIG` (SCREAMING_SNAKE_CASE for the exported constant, matching every other `*_CONFIG`/`*_SCHEMA` export in `src/data/`), `RobotSectionEntry`/`RobotSubsectionEntry` (PascalCase types, matching `SignatureArrayLayerBlock`/`SignatureArrayParamSchema` in `robotOptionsConfig.ts`).

---

## 7. Open Questions & Risks

Design decisions found during Specify that need an explicit yes before Tasks:

1. **The shared shell piece's exact form isn't pinned down (§3.2).** Options: (a) a hook (e.g. `useRobotSectionStack`) that both components call and then render its returned structure themselves, keeping full JSX control per call site; (b) a component taking a `renderSubsection(id) => ReactNode` render-prop, closer to `FleetParamsContent.tsx`'s own `renderLeaf()` shape but as a reusable export instead of a private function. (a) gives each of the 2 call sites more flexibility for their diverging bits (RobotOptionsTab's `RobotDisplaySection`+Reset Melody button vs. CompanyOptionsSection's disabled-state styling); (b) is more DRY but may fight the fact that `RobotOptionsTab`/`CompanyOptionsSection` already differ in more than just "which value/handlers" — they differ in a few structural details too (e.g. only `RobotOptionsTab` renders `RobotDisplaySection` at the top). **Recommend (a)** given that structural difference, but confirm before Tasks.
2. **Whether to also delete `robotSubsectionConfig.ts`'s current narrow exports (`FIRST_SUBSECTION_OF`, `SOURCE_OSCILLATOR_SUBSECTIONS`, `OSCILLATOR_LABELS`) outright once every call site migrates to `ROBOT_SECTIONS_CONFIG`, or keep them as derived one-line helpers reading from the new table (§2's closing paragraph).** Recommend keeping thin derived helpers — cheaper than updating every existing import site to reach into `ROBOT_SECTIONS_CONFIG` directly, and it's exactly the "one source of truth, several narrow accessors" shape `ControlSchema`'s own `resolveAccessibleName` already models elsewhere in this codebase. Confirm before Tasks.
3. **§2's `ROBOT_SECTIONS_CONFIG` literal must be verified against the *current* shipped source at Tasks time, not trusted as transcribed here** — this spec was written from a direct read of `useNavTree.ts`/`RobotOptionsTab.tsx`/`CompanyOptionsSection.tsx` as of `main` at `8261763` (post-merge of PR #495, 2026-09-27), but Tasks should re-diff the table against source immediately before Task 1 lands, in case anything changes on `main` between now and implementation start.

Still open — flag for Plan/Tasks, not blocking this spec:

4. Whether `robotSubsectionConfig.test.ts`'s existing tests for `FIRST_SUBSECTION_OF`/`OSCILLATOR_LABELS` get rewritten against `ROBOT_SECTIONS_CONFIG` directly or kept as-is against the derived helpers from open question 2 — sketched here, exact shape left for Tasks.
5. Whether `useNavTree.test.ts`'s coverage for the now-deleted `SECTION_CHILDREN`/`SUBSECTION_CHILDREN`/`ROBOT_SECTIONS` (if any tests import them directly rather than only asserting rendered tree output) needs porting to `robotSubsectionConfig.test.ts` instead — needs a direct read of that 959-line file at Tasks time, not assumed here.
6. Whether this consolidation is worth doing as one phase touching all 4 files at once, or splitting into "extract the data table + update useNavTree.ts" as a first, lower-risk phase and "extract the shared shell + update both content components" as a second — given the size of the existing test suites this phase must not regress (§1.2), a 2-phase split with its own checkpoint in between may be safer than one large phase. Left for Plan.
