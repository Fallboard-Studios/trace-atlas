# Implementation Plan: Nav Panel — Scrollable Views + New Section Depth

Source spec: [docs/specs/NAV_PANEL_VIEWS_AND_CONTENT.md](../specs/NAV_PANEL_VIEWS_AND_CONTENT.md) (approved 2026-09-24, all §7 decisions resolved). Source intent: [docs/intent/nav-panel-views-and-content.md](../intent/nav-panel-views-and-content.md). No roadmap phase number assigned yet.

## Overview

Replace every branch's content-swap model (`SettingsContent`/`FleetParamsContent`/`ProbesContent`/`CompaniesContent`, each rendering exactly one selected leaf) with a single continuous scrollable view per branch/entity, where every section stacks in tree order inside a controlled, single-open-at-a-time accordion. Nav clicks scroll instantly to a section and open it (closing every other); manual scrolling does the same in reverse via an `IntersectionObserver`, which doubles as a lazy-mount gate so a section's real content only constructs once scrolled near, then stays mounted for the rest of that entity's session (spec §1.5–1.6). Probes and Companies also gain a 4th tree level (`RobotSubsection`) so Rhythm/Frequency/Ping Contour/Baseline-Coaxial-Harmonic Oscillator/Probe Drift are each individually addressable, matching Fleet Params' existing depth. `AccordionContainer` — deleted at `NAV_LAYOUT_REWRITE.md` Task 21 — is restored from git history and converted from internally-stateful to controlled.

**Ordering principle: infra-first, then one vertical slice per branch, cheapest first.** Phase 1 builds every shared piece (state, tree schema, controlled accordion, scroll/observer infra) with no content component touched yet. Phase 2 proves the whole model end-to-end on Settings — the only branch with no restructuring or new tree depth, so it's the cheapest place to catch a wrong assumption in the shared infra before repeating it 3 more times. Phases 3–5 repeat the now-proven pattern on Fleet Params, then Probes (the branch that actually needs the restructuring and new depth), then Companies (which reuses Probes' restructured drawers directly). Phase 6 is cross-branch regression coverage and docs. The app stays in a working, testable state after every task.

## Architecture Decisions

- **State stays additive** (spec §1.3) — every existing `uiStore` field is unchanged; new fields are `selectedSubsection`, `expandedProbeSection`, `expandedCompanySection`, and the `RobotSubsection` type, all plain serializable values.
- **4-segment node ids for Probes/Companies** (spec §1.4) — `<branch>.<entity>.<section>.<subsection>`; `useNavTree.ts`'s parsing grows one segment. Fleet Params/Settings ids are unaffected.
- **Exactly one accordion open anywhere in a view, derived not tracked** (spec §1.5) — a section asks "am I the deepest selected id?" rather than owning open/closed state; there is no second source of truth to drift out of sync.
- **Scroll-to-section is an instant jump, never GSAP** (spec §1.6, confirmed) — it isn't animation, so CLAUDE.md's GSAP-for-animation rule doesn't apply.
- **Scroll anchors live in a new `sectionRefs.ts` registry** (spec §7 Q3) — not `uiStore` (non-serializable), not `setRef`/`getRef` (CLAUDE.md scopes that to top-level SVG refs).
- **`AccordionContainer` is restored from git history (`ce329a7^`) and made controlled** (spec §7 Q1) — `open`/`onOpenChange` props replace its deleted version's internal `useState`; its GSAP tween logic is otherwise reused unchanged. The old accordion-specific config exports (`VOLUME_ACCORDION_SCHEMA` etc.) are **not** restored — they wrapped the old, coarser leaf granularity and don't match the new subsection-level sections.
- **The same `IntersectionObserver` drives scrollspy AND lazy-mount** (spec §7 Q5/Q6, confirmed) — a section's real content constructs once its anchor nears the viewport and never unmounts again short of navigating to a different robot/company/branch, matching the deleted `AccordionContainer`'s own "lazy-mount, never torn back down" contract.
- **`PingControlsDrawer`'s `PHRASING_PANEL_SCHEMA` wrapper is retired** (spec §7 Q4) — Rhythm becomes its own top-level section (absorbing Click Track + Reset Melody), Frequency stays as `FREQUENCY_PANEL_SCHEMA`.
- **`SignatureArrayDrawer` splits into 4 independently-renderable pieces** (Baseline/Coaxial/Harmonic Oscillator, Probe Drift) — each already exists as its own `DirectionalPanel`/`RobotDriftPanel`; the split is exposing them separately, not rebuilding them.
- **Output/Probe Drift renames are label-only** (spec §1.3, intent confirmed) — `RobotSection`'s `'volume'` value, `RobotDriftPanel`, `lfoDrift.robots`, and every other internal identifier are untouched.
- **Pagination was considered and rejected** (spec §7 Q7) — scrolling + lazy-mount-on-approach already bounds memory to one entity's session; pagination's extra savings weren't worth losing full tree-click addressability.
- **Stacked commits, one per task**, matching this repo's own precedent (`docs/tasks/NAV_LAYOUT_REWRITE.md`, `docs/tasks/ACCORDION_LAZY_MOUNT.md`). No push until Crawford says so.

## Dependency Graph

```
Phase 1 (shared infra, no content component touched yet)
──────────────────────────────────────────────────────
Task 1 (uiStore: selectedSubsection, expandedProbeSection/CompanySection, RobotSubsection)
    │
    ├──→ Task 2 (navTreeConfig/useNavTree: 4-segment ids, subsection children, renames)
    │        │
    │        └──→ Task 5 (sectionRefs.ts registry + scrollToSection util)
    │                 │
    │                 └──→ Task 6 (useSectionObserver: scrollspy sync + lazy-mount gate)
    │
Task 3 (restore AccordionContainer + accordionAnimation.ts, as-was)
    │
    └──→ Task 4 (AccordionContainer: controlled open/onOpenChange)
              │
              └──→ CHECKPOINT 1 (Tasks 1,2,4,6 all land — infra complete, nothing wired to content yet)
                        │
Phase 2 (Settings — proves the pattern, no restructuring needed)                    │
──────────────────────────────────────────────────────────────────────────────────┘
Task 7 (SettingsContent — stacked view, accordions, scroll, scrollspy, lazy-mount)
    │
    └──→ CHECKPOINT 2 (pattern proven end-to-end on the simplest branch)
              │
Phase 3 (Fleet Params — same pattern, 2-level nesting)                             │
────────────────────────────────────────────────────────────────────────────────────┘
Task 8 (FleetParamsContent — stacked view, group-node "opens first child")
    │
    └──→ CHECKPOINT 3
              │
Phase 4 (Probes — new tree depth + drawer restructuring)                           │
────────────────────────────────────────────────────────────────────────────────────┘
Task 9 (PingControlsDrawer split — Rhythm absorbs Phrasing's siblings, Frequency as-is)
Task 10 (SignatureArrayDrawer split — 4 independently-renderable pieces)
    │  (9–10 independent of each other, both depend on Checkpoint 2)
    └──→ Task 11 (RobotOptionsPanel — stacked view replacing switch(section))
              │
              └──→ Task 12 (ProbesContent — verify entity routing / bare browse-list untouched)
                        │
                        └──→ CHECKPOINT 4
                                  │
Phase 5 (Companies — reuses Probes' restructured drawers)                          │
────────────────────────────────────────────────────────────────────────────────────┘
Task 13 (CompanyOptionsSection + CompaniesContent — same wiring as Task 11)
    │
    └──→ CHECKPOINT 5
              │
Phase 6 (cross-branch regression + docs)                                           │
────────────────────────────────────────────────────────────────────────────────────┘
Task 14 (cross-branch guard tests: single-open invariant, ancestor auto-expand, rename grep)
    │
    └──→ Task 15 (docs: UI_SHELL.md, COMPONENT_LIBRARY.md, roadmap entry)
              │
              └──→ CHECKPOINT 6 (final)
```

---

## Task List

### Phase 1: Shared infrastructure (no content component touched yet)

- [ ] **Task 1: `uiStore` additions**

  **Description:** Add spec §1.3's new fields to `uiStore.ts`: the `RobotSubsection` type (`'audioSettings' | 'rhythm' | 'frequency' | 'pingContour' | 'baselineOscillator' | 'coaxialOscillator' | 'harmonicOscillator' | 'probeDrift'`), `selectedSubsection: RobotSubsection | null`, `expandedProbeSection: RobotSection | null`, `expandedCompanySection: RobotSection | null`, and their setters. Pure state-layer groundwork — no component reads these yet.

  **Acceptance criteria:**
  - [ ] `UIStore` interface and its `create<UIStore>()` implementation both include every new field/action, all plain strings/`null`.
  - [ ] `selectRobot`/`selectCompany`/any existing action that already resets `selectedSection` on entity change also resets `selectedSubsection` (mirrors the existing "stale selectedSection" bugfix precedent, `NAV_LAYOUT_REWRITE.md`'s Task-114c1a1-equivalent fix) — otherwise switching robots could leave a stale subsection selected against the new robot's tree.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- uiStore` passes (new/updated `uiStore.test.ts` covering each new setter and the reset-on-entity-change behavior).
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`

  **Estimated scope:** S (2 files).

- [ ] **Task 2: `navTreeConfig`/`useNavTree` — 4-segment ids, subsection children, renames**

  **Description:** `useNavTree.ts`'s `sectionChildNodes()` grows a subsection level per spec §5.1 (`SUBSECTION_CHILDREN` table: Output→Audio Settings; Melody→Rhythm, Frequency; Envelope→Ping Contour; Source→Baseline/Coaxial/Harmonic Oscillator, Probe Drift), shared by both `buildProbesSubtree`/`buildCompaniesSubtree` since `sectionChildNodes()` already is. `select()`/`isSelected()`/`isExpanded()`/`toggleExpand()` destructure a 4th id segment (`[branch, entityId, section, subsection]`) through a new `asRobotSubsection()` guard into `selectedSubsection`. The `'volume'` section's rendered `humanLabel` becomes "Output" and the Source section's `probeDrift` subsection's `humanLabel` becomes "Probe Drift" — both label-only; every id segment (`volume`, etc.) is unchanged.

  **Acceptance criteria:**
  - [ ] Every `RobotSection` under a robot/company node has exactly the right `RobotSubsection` children (Output→1, Melody→2, Envelope→1, Source→4), for both Probes and Companies subtrees.
  - [ ] Selecting `probes.<id>.source.probeDrift` sets `selectedSection: 'source'` AND `selectedSubsection: 'probeDrift'`; equivalent for every other subsection and for `companies.<id>.*`.
  - [ ] Expanding `probes.<id>.melody` sets `expandedProbeSection: 'melody'` and clears it if a *different* section under the *same* probe is expanded (accordion-of-one, one level deeper than `expandedProbeId`); independent of `expandedCompanySection`.
  - [ ] Tree renders "Output" and "Probe Drift" as `humanLabel`s; `asRobotSection('volume')` and every other internal parse still succeeds unchanged (id segments untouched).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- useNavTree` passes, covering every mapping above.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/nav/useNavTree.ts`, `src/components/panels/screen/nav/useNavTree.test.ts`

  **Estimated scope:** M (2 files, non-trivial logic).

- [ ] **Task 3: Restore `AccordionContainer` and its supporting files, as-was**

  **Description:** Restore `AccordionContainer.tsx`/`.css`/`.test.tsx`, `accordionAnimation.ts`, and `src/testUtils/openAccordions.ts`/`.test.tsx` from `ce329a7^` (the commit before Task 21's deletion), plus the `AccordionSchema` type and `'accordion'` variant back into `types/controls.ts`. A straight restore — no behavior change, no controlled-mode conversion yet (Task 4). The old per-drawer accordion config constants (`VOLUME_ACCORDION_SCHEMA`, `MELODY_ACCORDION_SCHEMA`, `ENVELOPE_ACCORDION_SCHEMA`, `SOURCE_ACCORDION_SCHEMA`, `TRANSPORT_COMPOSITION_ACCORDION_SCHEMA`, `AUDIO_RIG_ACCORDION_GROUPS`, `accordionSchema()`) are **not** restored — they matched the old, coarser leaf granularity and have no home in this plan; each content task (7/8/11/13) authors its own fresh `AccordionSchema` values at the new, finer granularity instead.

  **Acceptance criteria:**
  - [ ] `AccordionContainer` renders and animates exactly as it did pre-deletion (uncontrolled, `defaultOpen`-driven) — this task changes nothing about its behavior, only brings the files back.
  - [ ] No consumer wires it up yet — it's dead code again, temporarily, same as immediately pre-Task-21.
  - [ ] `grep -r "AccordionContainer\|AccordionSchema" src` finds real, intentional usages only (the restored files themselves), not orphaned partial references.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- AccordionContainer` passes (restored test suite, unmodified).
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/AccordionContainer.tsx`, `.css`, `.test.tsx`, `src/components/ui/controls/accordionAnimation.ts`, `src/testUtils/openAccordions.ts`, `.test.tsx`, `src/types/controls.ts`, `src/types/controls.test.ts`

  **Estimated scope:** S (restore, not author — mechanical).

- [ ] **Task 4: `AccordionContainer` — controlled `open`/`onOpenChange`**

  **Description:** Replace `AccordionContainerInner`'s internal `useState(defaultOpen)` (and the `hasOpened`-never-resets lazy-mount tracking) with `open`/`onOpenChange` props per spec §5.2. `animateTo()`'s GSAP tween logic (measured-height, overflow-then-fade sequencing, `prefers-reduced-motion` handling) is otherwise untouched. Lazy-mount responsibility moves out of this component entirely — Task 6's `useSectionObserver` becomes the thing that decides whether a section's children exist in the tree at all; `AccordionContainer` itself just answers "open or closed" for whatever's handed to it.

  **Acceptance criteria:**
  - [ ] `AccordionContainer` has no internal open/closed state — `open` fully drives `aria-expanded` and the animated height/opacity.
  - [ ] Toggling `open` externally (parent re-render with a new prop value) triggers the same GSAP tween `animateTo()` triggered internally before.
  - [ ] `prefers-reduced-motion` snap behavior is unchanged.
  - [ ] `openAccordions.ts` test helper's signature updates to drive the new controlled prop instead of simulating a click on an internal-state trigger.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- AccordionContainer` passes with controlled-mode assertions added.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/components/ui/controls/AccordionContainer.tsx`, `.test.tsx`, `src/testUtils/openAccordions.ts`, `.test.tsx`

  **Estimated scope:** S (1-2 files, focused change).

- [ ] **Task 5: `sectionRefs.ts` registry + `scrollToSection` util**

  **Description:** New `src/utils/sectionRefs.ts` (or `src/animation/sectionRefs.ts`, matching `timelineMap`'s own location convention) — a `Map<string, HTMLElement>` keyed by node id, with `setSectionRef`/`getSectionRef`/`clearSectionRef` mirroring `setRef`/`getRef`'s shape but scoped to content-pane section anchors instead of top-level SVG refs (spec §7 Q3). Plus a `scrollToSection(id: string)` util performing the instant jump (`scrollIntoView({ behavior: 'auto', block: 'start' })` or equivalent).

  **Acceptance criteria:**
  - [ ] `setSectionRef(id, el)` / `getSectionRef(id)` round-trip correctly; unmounting a section clears its own entry (no stale-element leaks across a robot/company switch).
  - [ ] `scrollToSection(id)` is a no-op (not a throw) when no ref is registered for that id yet — content that hasn't lazy-mounted shouldn't crash a click.
  - [ ] No GSAP timeline involved — confirmed via a test asserting no `timelineMap` entry is created by a `scrollToSection` call.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- sectionRefs` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 2 (uses the same node-id shape).

  **Files:** `src/utils/sectionRefs.ts`, `src/utils/sectionRefs.test.ts`

  **Estimated scope:** S (1-2 files).

- [ ] **Task 6: `useSectionObserver` — scrollspy sync + lazy-mount gate**

  **Description:** A hook wrapping one `IntersectionObserver` per content-pane view, watching every registered section anchor (via Task 5's registry). On intersection, it (a) calls a `syncSelectionFromScroll(id)`-style action that sets the same `uiStore` fields a click would, WITHOUT calling `scrollToSection` (spec §1.6 — avoids fighting a manual scroll), and (b) exposes a per-section `hasApproached(id): boolean` that flips `true` the first time a section nears the viewport and never flips back — the lazy-mount gate spec §7 Q5/Q6 confirmed. `syncSelectionFromScroll` also sets the ancestor expand fields (`expandedProbeId`/`expandedProbeSection`/etc.) so the tree stays in sync with scroll position, same as a click would.

  **Acceptance criteria:**
  - [ ] Scrolling a mocked/simulated intersection sequence updates `selectedSection`/`selectedSubsection`/etc. without ever calling `scrollToSection`.
  - [ ] A section's `hasApproached` flips to `true` on first intersection and stays `true` even after it scrolls back out of view.
  - [ ] Selecting via scrollspy also sets ancestor expand fields, matching what a click on the same node would set (ancestor auto-expand, spec §1.6).
  - [ ] No `setTimeout`/`setInterval`/`requestAnimationFrame` polling loop anywhere in the implementation — `IntersectionObserver` only (CLAUDE.md).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- useSectionObserver` passes (jsdom's `IntersectionObserver` mocked/polyfilled per this repo's existing test-setup convention).
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/nav/useSectionObserver.ts`, `.test.ts`

  **Estimated scope:** M (1-2 files, the trickiest piece of shared infra).

### CHECKPOINT 1 — Infra complete
- [ ] `npm run build:types && npm run lint && npm test` all clean.
- [ ] `AccordionContainer` is controlled and tested standalone; `sectionRefs`/`useSectionObserver` are tested standalone. **Nothing is wired into any content component yet** — this checkpoint exists so a mistake in shared infra is caught once, not 4 times.
- [ ] Review with Crawford before proceeding to Phase 2.

---

### Phase 2: Settings (proves the pattern — no restructuring, no new tree depth)

- [ ] **Task 7: `SettingsContent` — stacked view**

  **Description:** Rewrite `SettingsContent.tsx` to render all 4 children (Volume/Quality/Tempo/Sector Settings) stacked, each wrapped in a controlled `AccordionContainer` (`open` derived from `selectedSettingsLeaf === <this leaf>`, per §1.5), each registering a scroll anchor via `setSectionRef`, each gated by `useSectionObserver`'s `hasApproached` for lazy mount. Selecting the bare `settings` branch node scrolls to top and opens Volume (first leaf); selecting any leaf directly scrolls to it and opens only it. This is the first end-to-end proof of spec §1.5/§1.6's full contract.

  **Acceptance criteria:**
  - [ ] All 4 sections render as accordion shells on branch entry; only the derived-open one's real content is mounted until scrolled near (lazy-mount gate, Task 6).
  - [ ] Clicking "Settings" (bare branch) scrolls to top and Volume's accordion is the only one open.
  - [ ] Clicking "Tempo" scrolls to Tempo's anchor and only Tempo's accordion is open (Volume/Quality/Sector Settings all close if any was open).
  - [ ] Manually scrolling past Quality into Tempo's section (simulated intersection) updates `selectedSettingsLeaf` to `'tempo'` without calling `scrollToSection`.
  - [ ] Existing Volume/Quality/Tempo/Sector Settings content (`SliderLinear`/`AudioLoadPanel`/`BPM_SCHEMA` slider/`SectorSettingsDrawer`) is unchanged internally — only newly wrapped.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- SettingsContent` passes, covering every acceptance criterion above.
  - [ ] `npm run lint` clean.
  - [ ] Manual: open Settings in the dev server, confirm scroll/accordion/scrollspy feel matches the spec before Phase 3 repeats the pattern.

  **Dependencies:** Task 2, Task 4, Task 6.

  **Files:** `src/components/panels/screen/nav/content/SettingsContent.tsx`, `.test.tsx`

  **Estimated scope:** M (2 files, first real application of the pattern).

### CHECKPOINT 2 — Pattern proven
- [ ] `npm test` clean; Settings branch manually verified end-to-end (click-to-scroll, scrollspy, lazy-mount, single-open-accordion).
- [ ] Review with Crawford — confirm the pattern generalizes before repeating it 3 more times, since Tasks 8/11/13 all copy this shape.

---

### Phase 3: Fleet Params (same pattern, 2-level nesting)

- [ ] **Task 8: `FleetParamsContent` — stacked view, group-node "opens first child"**

  **Description:** Rewrite `FleetParamsContent.tsx` to render all 3 groups (EQ & Filters/Time & Space/Output) × their leaves (EQ/HPF/LPF, Reverb/Delay, Compressor/Limiter) stacked — each *leaf* wrapped in a controlled `AccordionContainer`; each *group* is heading-only (no accordion of its own, matching spec §2's "mid-level (group)" row). Clicking a group node opens its first leaf and scrolls to the group's heading; clicking a leaf opens only it.

  **Acceptance criteria:**
  - [ ] All 7 leaves render as accordion shells; content lazy-mounts per Task 6.
  - [ ] Clicking "EQ & Filters" scrolls to its heading and opens "3-Band EQ" (first child) only.
  - [ ] Clicking "Limiter" scrolls to it directly and opens only Limiter, closing any previously-open leaf anywhere in the view (cross-group single-open, e.g. closing an open Reverb).
  - [ ] Existing `AudioRigEffectPanel` per-effect rendering is unchanged internally — only newly wrapped.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- FleetParamsContent` passes.
  - [ ] `npm run lint` clean.
  - [ ] Manual: dev-server pass on Fleet Params, same checks as Settings.

  **Dependencies:** Task 2, Task 4, Task 6, Checkpoint 2.

  **Files:** `src/components/panels/screen/nav/content/FleetParamsContent.tsx`, `.test.tsx`

  **Estimated scope:** M (2 files).

### CHECKPOINT 3
- [ ] `npm test` clean; Fleet Params branch manually verified, including the cross-group single-open case (the first real test of §1.5's "whole view, not per-group" rule).

---

### Phase 4: Probes (new tree depth + drawer restructuring)

- [ ] **Task 9: `PingControlsDrawer` split — Rhythm absorbs Phrasing's siblings**

  **Description:** Retire the `PHRASING_PANEL_SCHEMA` wrapper. Expose Rhythm (Density/Motif Length/Pitch Repeat sliders + the dev-only Click Track toggle + Reset Melody button — everything currently inside or adjacent to `PHRASING_PANEL_SCHEMA`) and Frequency (`FREQUENCY_PANEL_SCHEMA`'s existing Octave Range + Note Variance content, unchanged) as two independently-renderable pieces instead of one drawer's fixed internal layout — e.g. named exports `PingControlsRhythmSection`/`PingControlsFrequencySection`, or a `part` prop; exact shape decided at implementation time as long as both pieces are independently mountable by Task 11.

  **Acceptance criteria:**
  - [ ] Rhythm's piece renders Density/Motif Length/Pitch Repeat/Click Track(dev-only)/Reset Melody with identical behavior (including `generationDisabled`/`pitchRepeatDisabled` cross-field gating) to today's `PHRASING_PANEL_SCHEMA` content.
  - [ ] Frequency's piece renders Octave Range Min/Max + Note Variance identically to today's `FREQUENCY_PANEL_SCHEMA` content.
  - [ ] Both pieces are independently mountable/unmountable (no shared local state between them that would break if only one is lazy-mounted).
  - [ ] All existing `PingControlsDrawer` prop-contract tests still pass, adapted only for the new mounting shape.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- PingControlsDrawer` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 2 (pattern proven before restructuring content around it).

  **Files:** `src/components/robot/PingControlsDrawer.tsx`, `.test.tsx`

  **Estimated scope:** M (2 files, real restructuring, not just wrapping).

- [ ] **Task 10: `SignatureArrayDrawer` split — 4 independently-renderable pieces**

  **Description:** Expose Baseline Oscillator/Coaxial Oscillator/Harmonic Oscillator (today's 3 `SignatureArrayLayer` instances, one per fixed layer slot) and Probe Drift (today's `RobotDriftPanel`, rendered last) as 4 independently-mountable pieces instead of one drawer that always renders all 4 in sequence. Since these are already 4 separate sub-renders internally, this is closer to Task 9's Frequency half (mechanical exposure) than its Rhythm half (real regrouping).

  **Acceptance criteria:**
  - [ ] Each of the 4 pieces renders identically to its current in-sequence rendering (same props, same `heldOffTargets`/`LfoTargetGroup` behavior).
  - [ ] Each piece is independently mountable — `RobotDriftPanel`'s own `useAudioStore` subscription in particular must work correctly whether or not its Oscillator siblings are currently mounted.
  - [ ] All existing `SignatureArrayDrawer` prop-contract tests still pass, adapted only for the new mounting shape.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- SignatureArrayDrawer` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Checkpoint 2.

  **Files:** `src/components/robot/SignatureArrayDrawer.tsx`, `.test.tsx`

  **Estimated scope:** S-M (2 files, mostly mechanical).

- [ ] **Task 11: `RobotOptionsPanel` — stacked view replacing `switch (section)`**

  **Description:** Replace `RobotOptionsTab.tsx`'s `RobotOptionsPanel`'s `switch (section)` (currently rendering exactly one of `AudioSettingSection`/`PingControlsDrawer`/`PingContourDrawer`/`SignatureArrayDrawer`/`RobotDisplaySection`) with: `RobotDisplaySection` always at top (unwrapped, per spec §2's "individual robot views keep metadata at top"), followed by all 4 sections stacked — Output (`AudioSettingSection`, 1 accordion, its only subsection is Audio Settings), Melody (2 accordions, Task 9's Rhythm/Frequency pieces), Envelope (`PingContourDrawer`, 1 accordion, its only subsection is Ping Contour), Source (4 accordions, Task 10's pieces). Each accordion's `open` derives from `selectedSection`/`selectedSubsection` per §1.5; scroll anchors registered per section AND per subsection (a subsection click needs its own anchor even when its parent section only has one child, since a mid-level section click scrolls to the section heading while a leaf click scrolls to the leaf itself, per §1.6).

  **Acceptance criteria:**
  - [ ] Selecting a robot with no section chosen shows `RobotDisplaySection` + all 4 sections, with Output's Audio Settings accordion open (first leaf) and the view scrolled to top.
  - [ ] Selecting `probes.<id>.source.probeDrift` scrolls to Probe Drift and opens only it, closing whatever else was open (e.g. an open Frequency).
  - [ ] Selecting `probes.<id>.melody` (mid-level, no subsection) scrolls to Melody's heading and opens Rhythm (its first child) only.
  - [ ] "All Probes" (`allProbesSelected`) renders the identical stacked structure, bound to `CompanyOptionsSection`'s existing broadcast wiring instead of a single robot's — no `RobotDisplaySection` shown for All Probes (matches spec §2, metadata block is individual-robot-only).
  - [ ] A section's real content is absent from the DOM until `hasApproached` flips true for it (Task 6) — verified by asserting `AudioSettingSection`/etc. aren't rendered until their anchor's simulated intersection fires.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- RobotOptionsTab` passes, covering every acceptance criterion above.
  - [ ] `npm run lint` clean.
  - [ ] Manual: dev-server pass on an individual robot and on All Probes.

  **Dependencies:** Task 9, Task 10.

  **Files:** `src/components/panels/screen/console/RobotOptionsTab.tsx`, `.test.tsx`

  **Estimated scope:** L (largest single task in this plan — the core Probes assembly; if it proves too large once started, split "individual robot" and "All Probes" wiring into two sub-tasks rather than force one PR).

- [ ] **Task 12: `ProbesContent` — verify entity routing / bare browse-list untouched**

  **Description:** Confirm `ProbesContent.tsx`'s existing routing (`selectedRobotId` → `RobotOptionsTab`; `allProbesSelected` → `CompanyOptionsSection`; else → `RobotsTab`) still holds with Task 11's changes — the bare "Probes" browse list is explicitly out of scope for the view/accordion/scroll model (spec §2) and must keep rendering exactly as it does today.

  **Acceptance criteria:**
  - [ ] Bare `probes` branch selection still renders `RobotsTab` (filterable card list) unchanged — no accordion, no scroll model applied to it.
  - [ ] `RobotOptionsTab`/`CompanyOptionsSection` routing is otherwise unaffected by this plan's changes.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- ProbesContent` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 11.

  **Files:** `src/components/panels/screen/nav/content/ProbesContent.tsx`, `.test.tsx` (likely no code change — a verification task; a change here is a signal something leaked scope from Task 11).

  **Estimated scope:** XS (verification-only, 1 file).

### CHECKPOINT 4
- [ ] `npm test` clean; Probes branch manually verified for both an individual robot and All Probes, including the new 4th tree level and lazy-mount behavior.
- [ ] Review with Crawford — this is the largest phase; confirm before Companies repeats its shape.

---

### Phase 5: Companies (reuses Probes' restructured drawers)

- [ ] **Task 13: `CompanyOptionsSection` + `CompaniesContent` — same wiring as Task 11**

  **Description:** Apply Task 11's exact pattern to `CompanyOptionsSection.tsx` (bound to a company's broadcast snapshot instead of one robot) and rewrite `CompaniesContent.tsx` so a selected company renders `CompanyRenameDeleteForm` (unwrapped, at top — the intent doc's "update and delete sections") followed by the same 4 stacked sections, reusing Tasks 9/10's restructured `PingControlsDrawer`/`SignatureArrayDrawer` pieces and `sectionChildNodes()`'s already-shared subsection tree (Task 2 — no new tree-schema work needed here).

  **Acceptance criteria:**
  - [ ] Selecting a company with no section shows `CompanyRenameDeleteForm` + all 4 sections, Output's Audio Settings open, scrolled to top.
  - [ ] Selecting `companies.<id>.melody.rhythm` scrolls to Rhythm and opens only it.
  - [ ] The bare "Companies" branch (create form) is unaffected — same "not part of the view model" carve-out as bare Probes (spec §2).
  - [ ] Broadcast semantics (editing a section edits every member robot) are unchanged from today's `CompanyOptionsSection` behavior.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm test -- CompanyOptionsSection CompaniesContent` passes.
  - [ ] `npm run lint` clean.
  - [ ] Manual: dev-server pass on a company.

  **Dependencies:** Task 11 (mirrors its pattern directly), Task 9, Task 10.

  **Files:** `src/components/company/CompanyOptionsSection.tsx`, `.test.tsx`, `src/components/panels/screen/nav/content/CompaniesContent.tsx`, `.test.tsx`

  **Estimated scope:** M (4 files, but mechanically mirrors Task 11 — should be materially faster than it).

### CHECKPOINT 5
- [ ] `npm test` clean; Companies branch manually verified end-to-end.

---

### Phase 6: Cross-branch regression + docs

- [ ] **Task 14: Cross-branch guard tests**

  **Description:** Add tests that specifically span more than one branch/section, which no single content task above is positioned to catch on its own: the single-open-accordion invariant holding *across* all 4 branches' own content (not just within one), ancestor auto-expand correctness for every branch (`expandedTopLevelBranch`/`expandedProbeId`/`expandedProbeSection`/`expandedCompanyId`/`expandedCompanySection`/`expandedFleetParamsGroup` all set correctly for a given deep selection), and a rename-correctness grep-style guard (Output/Probe Drift `humanLabel`s present; `'volume'`, `RobotDriftPanel`, `lfoDrift.robots` and every other internal identifier byte-for-byte unchanged), matching Task 21's own precedent from `NAV_LAYOUT_REWRITE.md`.

  **Acceptance criteria:**
  - [ ] A test selecting a leaf in Probes, then a leaf in Fleet Params in the same session, confirms no stale accordion-open state leaks between branches.
  - [ ] A test selecting `companies.<id>.source.probeDrift` directly (no intermediate clicks) asserts every ancestor expand field is set correctly in one step.
  - [ ] `grep -r "'volume'" src/stores src/data | grep -v test` (or equivalent) still finds `RobotSection`'s value untouched; `grep -rn "Output" src/data/navTreeConfig.ts` (or wherever `SECTION_CHILDREN`/`SUBSECTION_CHILDREN` moved) finds only the display-label change.

  **Verification:**
  - [ ] `npm test` (full suite) clean.
  - [ ] `npm run build` clean.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 7, Task 8, Task 11, Task 13.

  **Files:** New cross-cutting test file(s), e.g. `src/components/panels/screen/nav/navPanelViews.integration.test.tsx`.

  **Estimated scope:** S-M (1-2 new test files).

- [ ] **Task 15: Docs — `UI_SHELL.md`, `COMPONENT_LIBRARY.md`, roadmap entry**

  **Description:** Update `docs/UI_SHELL.md`'s nav/content section to describe the view/accordion/scroll/lazy-mount model (superseding `NAV_LAYOUT_REWRITE.md`'s "one thing mounted at a time" description, which this plan directly reverses — spec §7 Q6). Un-retire `COMPONENT_LIBRARY.md`'s `AccordionContainer` entry, documenting its new controlled-mode contract. Add a `docs/todo/roadmap.md` entry once a phase number is assigned.

  **Acceptance criteria:**
  - [ ] `UI_SHELL.md` no longer describes the swap-model as current behavior; describes click-to-scroll, scrollspy, single-open-accordion, and lazy-mount-on-approach instead.
  - [ ] `COMPONENT_LIBRARY.md`'s `AccordionContainer` entry reflects `open`/`onOpenChange` (controlled), not `defaultOpen` (uncontrolled).
  - [ ] Roadmap entry added, cross-linking this plan, its spec, and its intent doc (matching every other roadmap entry's own citation style).

  **Verification:**
  - [ ] Docs reviewed for accuracy against the actually-shipped code (not just the plan) — read the final component files, not this task list, before writing doc prose.

  **Dependencies:** Task 14.

  **Files:** `docs/UI_SHELL.md`, `docs/COMPONENT_LIBRARY.md`, `docs/todo/roadmap.md`

  **Estimated scope:** S (3 files, doc-only).

### CHECKPOINT 6 — Final
- [ ] Full suite green (`npm test`), `npm run build:types`/`npm run lint`/`npm run build` all clean.
- [ ] Manual browser pass: scroll/scrollspy/accordion feel on all 4 branches, mobile nav slide-off unaffected, `prefers-reduced-motion` snap behavior on the restored `AccordionContainer`.
- [ ] Screen reader pass: a section's `aria-expanded` state and the tree's own selection narrate coherently together, including when scrollspy (not a click) changes them.
- [ ] All 6 of spec §7's confirmed decisions verified against the shipped code, not just this plan.
- [ ] Review with Crawford before merge.
