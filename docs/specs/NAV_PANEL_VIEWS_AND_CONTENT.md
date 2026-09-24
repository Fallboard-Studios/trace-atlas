# Phase Spec: Nav Panel — Scrollable Views + New Section Depth

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Coverage: `npm run test:coverage`
> - Dev server: `npm run dev`
> - Format: `npm run format`

Source of intent: [docs/intent/nav-panel-views-and-content.md](../intent/nav-panel-views-and-content.md), confirmed via `/interview-me`, 2026-09-24. Follow-up to the Navigation & Layout Rewrite ([NAV_LAYOUT_REWRITE.md](NAV_LAYOUT_REWRITE.md), all 22 tasks shipped on `feature/nav-layout-rewrite`). **Status: not started.** Everything below is a proposal for Crawford's review — §7 lists every assumption made beyond what the intent doc itself settled, and needs an explicit yes before Phase 3 (Tasks) is written.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today

Per direct source reading (`useNavTree.ts`, `ContentPane.tsx`, `ConsolePanel.tsx`, the 4 `nav/content/*Content.tsx` components, `RobotOptionsTab.tsx`, `uiStore.ts`):

- Every branch's content component (`SettingsContent`/`FleetParamsContent`/`ProbesContent`/`CompaniesContent`) **swaps**: it reads `uiStore`'s selected-leaf field for its branch and renders exactly one thing — either the selected leaf's own content, or a fallback (list/create-form/landing drawer) when nothing leaf-level is selected. Nothing is ever rendered alongside a sibling section; `RobotOptionsTab`'s `switch (section)` (lines 178–231) is the clearest example — one `case` renders, the other three don't exist in the tree at all.
- `AccordionContainer` — the collapsible-section primitive this repo used pre-rewrite — was **fully deleted** at Task 21 (`ce329a7`, "delete AccordionContainer and its supporting infrastructure"), once the swap-model above made every one of its 5 real consumers (`AudioRigDrawer`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`, `RobotFilterPanel`) redundant — a tree leaf now *is* the section, so there was nothing left to collapse. `AccordionContainer.tsx`/`.css`/`.test.tsx`, `accordionAnimation.ts`, and `src/testUtils/openAccordions.ts` are gone from the working tree, but fully recoverable from git history (`git show ce329a7^:src/components/ui/controls/AccordionContainer.tsx`, etc.) — `@radix-ui/react-accordion` itself is still a `package.json` dependency, untouched by the deletion. See §7 Q1.
- `useNavTree.ts`'s `select()`/`isSelected()`/`isExpanded()`/`toggleExpand()` all parse a node's `id` by splitting on `.` into at most 3 segments (`[branch, entityId, section]`) and mapping each segment through a typed `asXxx` guard into one of `uiStore`'s existing typed fields — never storing or trusting the id string itself as state (`navTreeConfig.ts`'s own doc comment: "never parsed to derive selection state" — true only in the sense that the *result* of parsing, not the id, is what's stored).
- Per-robot/per-company great-grandchildren don't exist yet: `sectionChildNodes()` (`useNavTree.ts`) generates exactly 4 flat leaves (Volume/Melody/Envelope/Source) per robot/company, shared by `buildProbesSubtree`/`buildCompaniesSubtree` — the same helper this spec extends for the new 4th level (§1.4).
- `PingControlsDrawer`/`SignatureArrayDrawer`/`PingContourDrawer` already group their controls into the exact shapes the new great-grandchildren need: `SignatureArrayDrawer` renders 3 `DirectionalPanel`s (Baseline/Coaxial/Harmonic, one `SignatureArrayLayer` each) followed by `RobotDriftPanel` — a 1:1 match for Baseline Oscillator/Coaxial Oscillator/Harmonic Oscillator/Probe Drift. `PingControlsDrawer` renders `FREQUENCY_PANEL_SCHEMA` (Octave Range + Note Variance) as a clean standalone match for "Frequency," but "Rhythm" doesn't cleanly exist yet — today's `RHYTHM_PANEL_SCHEMA` panel is nested *inside* `PHRASING_PANEL_SCHEMA` alongside the dev-only Click Track toggle and the Reset Melody button, which sits outside `RHYTHM_PANEL_SCHEMA` but inside `PHRASING_PANEL_SCHEMA`. See §7 Q4.
- `AudioSettingSection` (Volume/Output's only content) and `PingContourDrawer` (Envelope's only content) are already exactly one section each — no internal grouping to unpack, matching "Output → Audio Settings" and "Envelope → Ping Contour" 1:1.

### 1.2 What's changing, at a glance

Per-branch content components stop swapping and start rendering **one continuous scrollable view** — every section for the current context (the whole branch for Settings/Fleet Params; the selected robot, "All Probes," or selected company for Probes/Companies) stacked in tree order, each wrapped in a **controlled, single-open-at-a-time accordion**. Nav clicks and manual scrolling both drive the same selection state; that state, in turn, drives both the scroll position (on click) and which one accordion is open (always, regardless of how it changed). Probes and Companies also gain a 4th tree level (great-grandchildren) so their sections can be opened individually, matching Fleet Params' existing 3-level depth. Full rationale: [docs/intent/nav-panel-views-and-content.md](../intent/nav-panel-views-and-content.md).

### 1.3 State model — additive, extends NAV_LAYOUT_REWRITE.md §1.3

```typescript
// navTreeConfig.ts ids for probes.<id>.volume/melody/envelope/source stay EXACTLY as they are —
// this is a label-only rename (Output/Probe Drift are humanLabel changes; the underlying segment
// useNavTree.ts's asRobotSection() parses stays 'volume', matching RobotSection's existing value).
// Only Settings'/Header's own "Volume" are unaffected either way — this rename is scoped to the
// Probes/Companies section alone.
export type RobotSection = 'volume' | 'melody' | 'envelope' | 'source'; // UNCHANGED

// NEW — the 4th tree level, shared by Probes and Companies (mirrors RobotSection's own
// shared-across-both-branches shape). Flat union rather than nested per-section, because a
// subsection is always read alongside its already-known parent RobotSection — no ambiguity from
// flattening (no subsection name collides across sections).
export type RobotSubsection =
  | 'audioSettings'                                                            // Output's only child
  | 'rhythm' | 'frequency'                                                     // Melody's children
  | 'pingContour'                                                              // Envelope's only child
  | 'baselineOscillator' | 'coaxialOscillator' | 'harmonicOscillator' | 'probeDrift'; // Source's children

export interface UIStore {
  // ...existing fields (selectedRobotId, selectedCompanyId, allProbesSelected, selectedSection,
  // selectedSettingsLeaf, selectedFleetParamsEffect, expandedProbeId, expandedCompanyId,
  // expandedFleetParamsGroup, expandedTopLevelBranch, etc.) all RETAINED, unchanged...

  /** The open great-grandchild, when one is selected — null when only a RobotSection (or
   *  nothing) is selected. Shared by Probes and Companies, same reasoning as selectedSection. */
  selectedSubsection: RobotSubsection | null;
  /** Which section (if any) has ITS OWN children expanded in the tree, within whichever
   *  probe/company is itself expanded (expandedProbeId/expandedCompanyId) — the tree-row analog
   *  of expandedFleetParamsGroup, one level deeper. Separate fields per branch, matching
   *  expandedProbeId/expandedCompanyId's own existing split. */
  expandedProbeSection: RobotSection | null;
  expandedCompanySection: RobotSection | null;

  setSelectedSubsection: (s: RobotSubsection | null) => void;
  setExpandedProbeSection: (s: RobotSection | null) => void;
  setExpandedCompanySection: (s: RobotSection | null) => void;
}
```

All plain strings/`null` — no new non-serializable state, per CLAUDE.md.

### 1.4 Node-id shape — 4 segments for Probes/Companies

`sectionChildNodes()` (`useNavTree.ts`) grows a 3rd argument: each `RobotSection` leaf becomes a category node with its own `RobotSubsection` children, id `<entityBranchPrefix>.<section>.<subsection>` (e.g. `probes.all.source.probeDrift`, `companies.acme.melody.rhythm`). `select()`/`isSelected()`/`isExpanded()`/`toggleExpand()` destructure a 4th segment (`const [branch, entityId, section, subsection] = id.split('.')`) and map it through a new `asRobotSubsection()` guard into `selectedSubsection`, same pattern as every existing `asXxx` guard. Fleet Params' own ids are unaffected — its leaf level (EQ/HPF/LPF/etc.) is already the deepest node the tree has for that branch, matching where Probes/Companies' *new* leaf level (subsections) lands, not where their existing `RobotSection` level was.

### 1.5 Single-open-accordion model

Exactly one accordion is open anywhere in a given view at a time — never per-group, view-wide. This is **derived state, not separately tracked**: the *deepest non-null selected field* for whatever's on screen determines which one section is open:

- Settings: `selectedSettingsLeaf` (already leaf-level — no deeper field exists for this branch).
- Fleet Params: `selectedFleetParamsEffect`.
- Probes/Companies: `selectedSubsection` if set, else `selectedSection` itself acts as the open section (its only/first subsection opens — see §1.6's "first-leaf" rule).

A section component asks "am I the open one?" by comparing its own id against this derived value — no new boolean-per-section state, and no risk of two sections independently believing they're open.

### 1.6 Selection → scroll + accordion — the click/scroll contract

- **Click a top-level branch node** (Settings/Fleet Params/Probes/Companies, or — for Probes/Companies — a robot/"All Probes"/company): jump to the top of that view. Whichever field(s) selection would otherwise leave `null` get set to their *first* leaf in tree order instead (e.g. selecting a robot with no section chosen sets `selectedSection = 'volume'` and `selectedSubsection = 'audioSettings'`, opening Output's only subsection) — "first section expanded, rest closed" from the intent doc, realized as: nothing is ever selected all the way down to "no leaf," so §1.5's derived-open-section always resolves to something.
- **Click anything deeper** (a mid-level node or a leaf): scroll to that item's own section position in the same view. If it's a leaf (a `RobotSubsection`, a Fleet Params effect, a Settings leaf), only its own accordion opens. If it's a mid-level node (`RobotSection`, a Fleet Params group), its first leaf-descendant opens. Either way, setting the new deepest field is enough — §1.5 means every *other* accordion closes automatically, nothing to separately "close."
- **The scroll itself is an instant jump** — `element.scrollIntoView({ behavior: 'auto', block: 'start' })` or an equivalent immediate `scrollTop` assignment, never a GSAP tween. Per the intent doc's explicit confirmation, this does not conflict with CLAUDE.md's GSAP-for-animation rule because it isn't animated at all.
- **Scroll anchors:** each accordion-wrapped section needs a DOM node the click handler can scroll to. Given CLAUDE.md's `setRef`/`getRef` registry is documented as SVG-ref-specific (top-level SVG refs for animation modules), this spec proposes a small sibling registry (e.g. `sectionRefs.ts`, same shape as `timelineMap`'s key→value pattern but holding `HTMLElement` refs keyed by node id) rather than overloading `setRef`/`getRef` or routing DOM refs through `uiStore` (which CLAUDE.md forbids outright). See §7 Q3.
- **Scrollspy (manual scroll → selection):** an `IntersectionObserver` (or scroll-position comparison) watching each section's anchor updates the same selection fields a click would, but through a distinct action (e.g. `syncSelectionFromScroll(id)`) that skips the scroll-into-view step — otherwise a manual scroll would fight itself, re-triggering a jump back to the section that's merely coming into view. Both actions converge on the same `select()`-style field-setting logic; only the "also scroll" step differs. See §7 Q5 for the exact observer strategy.
- **Lazy mount, on approach:** the same `IntersectionObserver` doubles as a mount gate — a section's real content (its sliders/panels, not just its accordion shell) only constructs once its anchor first enters (or nears) the viewport, then stays mounted for the rest of that robot's/company's session even if scrolled back out of view or collapsed again. This is the same "lazy-mount, never torn back down" contract the deleted `AccordionContainer`'s own `hasOpened` flag already implemented (§1 "What exists today") — ported from an open-state trigger to an intersection trigger, since content now needs to become visible/relevant by scrolling near it, not only by an explicit open click. See §7 Q5/Q6.

---

## 2. Node → Content Mapping

| Nav path | Node kind | Section-accordion mapping | Existing component(s) | Notes |
|---|---|---|---|---|
| Settings | branch | — (page container) | `SettingsContent`, rewritten to render all 4 stacked | |
| Settings → Volume / Quality / Tempo / Sector Settings | leaf (= section) | Own accordion | `SliderLinear`/`AudioLoadPanel`/`BPM_SCHEMA` slider/`SectorSettingsDrawer`, unchanged internals | Already 1 level deep — no restructuring beyond accordion-wrapping |
| Fleet Params | branch | — | `FleetParamsContent`, rewritten to render all 3 groups × their leaves stacked | |
| Fleet Params → EQ & Filters / Time & Space / Output | mid-level (group) | Opens first child on click | — heading only, unchanged | |
| Fleet Params → …→ EQ / HPF / LPF / Reverb / Delay / Compressor / Limiter | leaf (= section) | Own accordion | `AudioRigEffectPanel`, unchanged internals | Already 2 levels deep — no restructuring beyond accordion-wrapping |
| Probes | branch (unchanged) | n/a | `RobotsTab`, unchanged | Not part of the view/accordion model — bare browse list, same as today |
| Probes → All Probes / Probe *N* | mid-level (entity) | Opens first child on click | `RobotOptionsPanel`, rewritten: `RobotDisplaySection` (individual robot only) + all 4 sections stacked, replacing the `switch (section)` | |
| …→ Output | mid-level (section) | Opens its 1 child on click | `AudioSettingSection` | Renamed from "Volume" — label only |
| …→ Output → Audio Settings | leaf (= subsection) | Own accordion | `AudioSettingSection`, unchanged internals | Section and subsection coincide 1:1 |
| …→ Melody | mid-level (section) | Opens first child (Rhythm) on click | `PingControlsDrawer`, internally restructured (§7 Q4) | |
| …→ Melody → Rhythm | leaf | Own accordion | `RHYTHM_PANEL_SCHEMA` content + Click Track toggle + Reset Melody, regrouped out of `PHRASING_PANEL_SCHEMA` | |
| …→ Melody → Frequency | leaf | Own accordion | `FREQUENCY_PANEL_SCHEMA` content, unchanged | |
| …→ Envelope | mid-level (section) | Opens its 1 child on click | `PingContourDrawer` | |
| …→ Envelope → Ping Contour | leaf | Own accordion | `PingContourDrawer`, unchanged internals | Section and subsection coincide 1:1 |
| …→ Source | mid-level (section) | Opens first child (Baseline Oscillator) on click | `SignatureArrayDrawer`, internally split into 4 (§below) | |
| …→ Source → Baseline / Coaxial / Harmonic Oscillator | leaf | Own accordion | The matching `SignatureArrayLayer` `DirectionalPanel`, unchanged internals | Already 3 separate `DirectionalPanel`s — split is mechanical |
| …→ Source → Probe Drift | leaf | Own accordion | `RobotDriftPanel`, unchanged internals | Renamed from "Robot Drift" — label only |
| Companies | branch (unchanged) | n/a | `CompanyCreateForm`, unchanged | Bare create form, same as today |
| Companies → Company *X* | mid-level (entity) | Opens first child on click | `CompanyRenameDeleteForm` (always shown, above the sections — not accordion-wrapped, matches the intent's "update and delete sections followed by sliders") + all 4 sections stacked via `CompanyOptionsSection` | |
| …→ Output/Melody/Envelope/Source (+ their subsections) | same as Probes | same as Probes | `CompanyOptionsSection`, same `section`/new `subsection` prop, broadcast-bound | Identical subsection set — reuses `sectionChildNodes()` |

**Not reused as-is:** `RobotOptionsPanel`'s `switch (section)` (replaced by stacked rendering), `PingControlsDrawer`'s `PHRASING_PANEL_SCHEMA` wrapper (Rhythm becomes its own top-level accordion boundary, absorbing Click Track + Reset Melody — §7 Q4), `SignatureArrayDrawer`'s single-root render (splits into 4 independently-accordion-wrapped children, each still using the existing `SignatureArrayLayer`/`RobotDriftPanel` components unchanged).

---

## 3. Target File Structure

```text
src/
├── data/
│   └── navTreeConfig.ts                    # MODIFIED — SECTION_CHILDREN (useNavTree.ts) grows subsection children
├── stores/
│   └── uiStore.ts                          # MODIFIED — §1.3 additions (selectedSubsection, expandedProbeSection, expandedCompanySection, RobotSubsection)
├── components/
│   ├── panels/screen/nav/
│   │   ├── useNavTree.ts                   # MODIFIED — 4-segment id parsing (§1.4), sectionChildNodes() grows a level
│   │   ├── useNavTree.test.ts              # MODIFIED — new coverage for the 4th level
│   │   └── content/
│   │       ├── SettingsContent.tsx         # MODIFIED — stacked render, no more selectedSettingsLeaf-gated switch
│   │       ├── FleetParamsContent.tsx      # MODIFIED — stacked render, no more selectedFleetParamsEffect-gated switch
│   │       ├── ProbesContent.tsx           # MODIFIED — bare-branch RobotsTab path unchanged; entity path renders stacked view
│   │       └── CompaniesContent.tsx        # MODIFIED — bare-branch create-form path unchanged; entity path renders stacked view
│   ├── panels/screen/console/
│   │   └── RobotOptionsTab.tsx             # MODIFIED — RobotOptionsPanel's switch(section) replaced by stacked accordions
│   ├── robot/
│   │   ├── PingControlsDrawer.tsx          # MODIFIED — Rhythm/Frequency become 2 independent accordion-wrapped sections
│   │   ├── PingContourDrawer.tsx           # UNCHANGED internals — gains 1 accordion wrapper at its call site
│   │   ├── SignatureArrayDrawer.tsx        # MODIFIED — splits into 4 independently-accordion-wrapped children
│   │   └── AudioSettingSection.tsx         # UNCHANGED internals — gains 1 accordion wrapper at its call site
│   ├── company/
│   │   └── CompanyOptionsSection.tsx       # MODIFIED — same section/subsection accordion wiring as RobotOptionsPanel
│   └── ui/controls/
│       ├── AccordionContainer.tsx          # RESTORED (from ce329a7^) + MODIFIED — controlled open/onOpenChange (§7 Q1)
│       ├── AccordionContainer.css          # RESTORED
│       └── AccordionContainer.test.tsx     # RESTORED + MODIFIED — controlled-mode coverage added
├── animation/
│   └── accordionAnimation.ts               # RESTORED (from ce329a7^)
├── utils/
│   └── sectionRefs.ts                      # NEW — scroll-anchor registry (§1.6, §7 Q3)
└── testUtils/
    └── openAccordions.ts                   # RESTORED + MODIFIED — controlled-mode helper signature
docs/
├── UI_SHELL.md                             # MODIFIED — view/accordion/scroll model documented
├── COMPONENT_LIBRARY.md                    # MODIFIED — AccordionContainer entry un-retired, controlled-mode documented
└── todo/roadmap.md                         # MODIFIED — new phase entry once a number is assigned
```

---

## 4. Implementation Boundaries & Constraints

* **Strict scope for this spec:** the view/accordion/scroll model itself (§1.5–1.6), the new `RobotSubsection` tree level and its `uiStore` wiring (§1.3–1.4), restoring and controlling `AccordionContainer`, and the Output/Probe Drift label renames. **Not in scope:** any doc content beyond an empty placeholder slot per section (next spec, per intent §Out of scope), any change to the bare Probes/Companies browse/create screens, any change to Fleet Params' own tree depth or labels, any internal-identifier rename (`RobotSection`'s `'volume'` value, `RobotDriftPanel`, `globalAudio.lfoDrift.robots` all stay as-is — intent §Out of scope).
* **Always:**
  * All new `uiStore` fields stay plain JSON-serializable primitives (CLAUDE.md).
  * All interactive UI stays inside `ScreenViewport`, never `SleeveContainer` (CLAUDE.md) — this spec adds no new top-level UI shell, only rewires existing content, so this is a "don't regress" constraint, not new work.
  * `AccordionContainer`'s restored GSAP expand/collapse tween keeps registering in `timelineMap` and getting killed on unmount, per its own pre-deletion precedent and CLAUDE.md's animation rule — the resurrection changes its open/close *trigger* (controlled prop vs. internal state), not its animation mechanism.
  * The single-open-accordion invariant (§1.5) is enforced by construction (derived from selection state, not a second source of truth) — never add a separate "which accordions are open" list that could drift out of sync with `selectedSection`/`selectedSubsection`/etc.
  * Scroll-into-view triggered by a nav click is instant, never GSAP-animated (intent §Confirmed, CLAUDE.md's animation rule applies to real animation, and this isn't one).
* **Ask first:** anything that reopens a decision in §7 before it's resolved; any new dependency (CLAUDE.md) — `@radix-ui/react-accordion` is already present so restoring `AccordionContainer` needs none, but the scrollspy mechanism (§7 Q5) should not reach for a new IntersectionObserver-wrapping library without asking first; any change to melody/audio-scheduling/animation architecture incidentally touched while restructuring `PingControlsDrawer`/`SignatureArrayDrawer` (CLAUDE.md).
* **Never:**
  * Never use `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` for the scroll-to-section jump or the scrollspy tracking — `IntersectionObserver` (not a timer loop) for the latter, direct DOM APIs for the former.
  * Never store a scroll-anchor `HTMLElement` ref, a GSAP timeline, or any other non-serializable value in `uiStore` — the new `sectionRefs.ts` registry (§1.6) or component-local refs only, matching `timelineMap`'s existing precedent.
  * Never let a section's local ephemeral state (e.g. `LfoTargetGroup`'s selected-target `useState`, `SignatureArrayDrawer`'s own doc comment on this) get treated as something that must reset on collapse — under the new model, collapsing an accordion no longer unmounts its content (§7 Q6 flags this as a real behavior reversal from what `SignatureArrayDrawer.tsx`'s own comment currently documents as "confirmed intended").
  * Never make the great-grandchild rename (`Output`, `Probe Drift`) ripple into internal identifiers — `RobotSection`'s `'volume'` literal, `CompanyOptionsSection`'s `section` prop values, `RobotDriftPanel`, `lfoDrift.robots` all keep their current spelling (intent §Out of scope, confirmed).

---

## 5. Code Style & Architecture Conventions

### 5.1 `sectionChildNodes()` grows a level (`useNavTree.ts`)

```typescript
// Illustrative — exact shape resolved during implementation.
const SUBSECTION_CHILDREN: Record<RobotSection, Omit<NavTreeNodeSchema, 'id'>[]> = {
  volume: [{ humanLabel: 'Audio Settings' }],
  melody: [{ humanLabel: 'Rhythm' }, { humanLabel: 'Frequency' }],
  envelope: [{ humanLabel: 'Ping Contour' }],
  source: [
    { humanLabel: 'Baseline Oscillator' },
    { humanLabel: 'Coaxial Oscillator' },
    { humanLabel: 'Harmonic Oscillator' },
    { humanLabel: 'Probe Drift' },
  ],
};

function sectionChildNodes(entityBranchPrefix: string): NavTreeNodeSchema[] {
  return ROBOT_SECTIONS.map((section, i) => ({
    id: `${entityBranchPrefix}.${section}`,
    ...SECTION_CHILDREN[i],
    // Output keeps humanLabel 'Volume' internally in SECTION_CHILDREN's own array today — only
    // the rendered label changes to 'Output'; id segment stays 'volume' (§1.4).
    children: SUBSECTION_CHILDREN[section].map((leaf, j) => ({
      id: `${entityBranchPrefix}.${section}.${SUBSECTION_IDS[section][j]}`,
      ...leaf,
    })),
  }));
}
```

### 5.2 Controlled `AccordionContainer` (restored + modified)

```tsx
// Illustrative — exact prop shape resolved during implementation. `open`/`onOpenChange` replace
// the deleted version's internal `useState(defaultOpen)`; `animateTo()`'s own GSAP tween logic
// (measured-height, overflow-then-fade sequencing) is otherwise reused unchanged.
interface AccordionContainerProps {
  schema: AccordionSchema;
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  style?: CSSProperties;
}
```

### 5.3 Section content component — one accordion per leaf

```tsx
// Illustrative shape for a view's stacked rendering (e.g. RobotOptionsPanel) — each section reads
// whether IT is the derived-open one (§1.5) rather than owning any open/closed state itself.
<AccordionContainer
  schema={OUTPUT_ACCORDION_SCHEMA}
  open={selectedSection === 'volume'} // Output has exactly 1 subsection, so section-level suffices
  onOpenChange={(open) => open && select('probes.all.volume.audioSettings')}
>
  <AudioSettingSection value={audioSettingValue} {...handlers} />
</AccordionContainer>
```

### 5.4 Naming and conventions

Matches `NAV_LAYOUT_REWRITE.md` §5.3 — kebab-case CSS classes for app-level composition (unchanged), `sc-` prefix reserved for `ControlSchema` primitives. Comments state *why*, matching every file read while researching this spec.

---

## 6. Testing & Verification Requirements

### 6.1 Framework and location

Vitest + React Testing Library, colocated, per repo convention — unchanged from `NAV_LAYOUT_REWRITE.md` §6.1.

### 6.2 New test coverage (minimum, expanded at task-breakdown time)

1. **4th-level tree structure:** every `RobotSection` under a robot/company node renders its correct `RobotSubsection` children (Output→1, Melody→2, Envelope→1, Source→4), for both Probes and Companies.
2. **Single-open-accordion invariant:** selecting any leaf anywhere in a view closes whichever other leaf was previously open, across sections (e.g. selecting Frequency while Baseline Oscillator was open closes Baseline Oscillator) — the core regression this spec must never allow.
3. **First-leaf-on-parent-select:** selecting a top-level branch, a robot/company, or a `RobotSection` opens that scope's first leaf-descendant in tree order and no other.
4. **Click vs. scrollspy don't fight:** a scrollspy-driven selection update does not re-trigger a scroll-into-view call (only a genuine nav click does) — a test asserting the scroll-anchor API is called exactly once per click, zero times per scrollspy sync.
5. **Ancestor auto-expand:** selecting a deeply-nested leaf (via click or scrollspy sync) sets `expandedProbeId`/`expandedProbeSection` (or the Companies equivalents) so every ancestor row is expanded in the tree.
6. **Rename correctness:** tree renders "Output" and "Probe Drift" as `humanLabel`s while `RobotSection`'s `'volume'` value and every internal identifier (`RobotDriftPanel`, `lfoDrift.robots`) remain unchanged — a grep-style guard test, matching Task 21's own precedent for identifier-cleanup verification.
7. **`AccordionContainer` controlled-mode regression:** restored component's existing animation-behavior tests (GSAP tween measurement, `prefers-reduced-motion`, lazy content mount) still pass unmodified in spirit, adapted only for the `open`/`onOpenChange` props replacing internal state.
8. **Existing behavior preserved:** every reused leaf component (§2 table) keeps its existing prop contract; `SignatureArrayLayer`/`RobotDriftPanel`/`AudioSettingSection`/`PingContourDrawer` internals are untouched — only their mounting/wrapping context changes.

### 6.3 Manual verification (not test-suite-checkable)

- Scroll-jump feel and scrollspy accuracy at real content heights/scroll velocities (jsdom can't exercise real scroll geometry, per `ACCORDION_LAZY_MOUNT.md`'s own precedent).
- Screen reader pass confirming a section's accordion state (`aria-expanded`) and the tree's own selection stay narratively coherent together (e.g. announcing "Melody, expanded" when scrollspy opens it, not just on click).
- `prefers-reduced-motion` snap behavior on the restored `AccordionContainer`'s expand/collapse tween (unchanged requirement, re-verify post-restoration).

### 6.4 Verification order

`npm run build:types` → `npm run lint` → new component/hook tests → migrated consumer tests → full `npm test` → `npm run build` → manual browser pass (scroll/scrollspy feel, all 4 branches) → screen reader pass.

---

## 7. Decisions & Open Questions

Confirmed via the intent doc's `/interview-me` pass: the view/accordion/scroll model itself (§1.5–1.6), doc placeholders reserved now, instant (non-animated) scroll, scrollspy enabled, ancestor auto-expand on select, single-open-accordion view-wide, and both renames as label-only. The items below are implementation-level assumptions this spec makes that the interview didn't reach — **need an explicit yes before Tasks.**

* **Q1 — Restore `AccordionContainer` from git history and make it controlled**, rather than building a new accordion primitive from scratch. **Confirmed 2026-09-24** — its GSAP tween logic (measured-height, overflow-then-fade sequencing, `prefers-reduced-motion` handling) is proven and non-trivial; rebuilding it would be pure duplication. The only real change is `open`/`onOpenChange` props replacing its deleted version's internal `useState`.
* **Q2 — `PingContourDrawer`/`AudioSettingSection` each get exactly 1 `AccordionContainer` wrapper at their call site**, since Envelope/Output each have exactly 1 subsection — their own internals stay untouched. **Confirmed 2026-09-24**, per §2's table.
* **Q3 — Scroll anchors live in a new `sectionRefs.ts` registry**, not `uiStore` (CLAUDE.md forbids non-serializable state there) and not `setRef`/`getRef` (CLAUDE.md scopes that registry to top-level SVG refs specifically). **Confirmed 2026-09-24** — a parallel, similarly-shaped registry.
* **Q4 — `PingControlsDrawer`'s `PHRASING_PANEL_SCHEMA` wrapper is retired**; Rhythm becomes its own top-level accordion boundary absorbing Click Track + Reset Melody (both currently inside/adjacent to `PHRASING_PANEL_SCHEMA`, not `RHYTHM_PANEL_SCHEMA` itself), and Frequency's existing `FREQUENCY_PANEL_SCHEMA` becomes the other. **Confirmed 2026-09-24** — no other grouping matches "Rhythm and Frequency as great grandchildren" from the intent doc as cleanly.
* **Q7 — Pagination (next/prev between sections instead of scroll) considered and rejected 2026-09-24.** The scroll + lazy-mount-on-approach model (Q5/Q6) already bounds memory to one entity's worth of content, since a whole view unmounts on navigating to a different robot/company/branch — pagination's own memory win only applies *within* one entity's 4–7 sections, a small gain for the cost of breaking full tree-click addressability (a paginated page can't be jumped to directly by an arbitrary deep tree click the way scroll-to-anchor can). Scrolling stands.
* **Q5 — Scrollspy uses `IntersectionObserver`**, not a scroll-position/`getBoundingClientRect` comparison loop. **Confirmed 2026-09-24** — additionally doubles as a lazy-mount gate: a section's real content only constructs the first time its anchor comes near the viewport, then stays mounted for the rest of that robot's/company's session (never unmounts again on scroll-away or on collapse) — directly resolves R2's "construct everything up front" perf concern, without reintroducing state loss (Q6). CLAUDE.md's "no `requestAnimationFrame` loops" guidance points the same direction even though it's written for musical timing, not scroll.
* **Q6 — Local ephemeral state (e.g. `SignatureArrayDrawer`'s `LfoTargetGroup` selected-target) survives accordion collapse/reopen and survives scrolling a mounted section out of view and back**, reversing what `SignatureArrayDrawer.tsx`'s own doc comment currently documents as "confirmed intended behavior" (that it resets, because the old swap-model unmounted on navigate-away). Under the new lazy-mount-on-approach model (Q5), a section only ever mounts once per robot/company session and never unmounts again short of navigating to a genuinely different robot/company entirely. **Confirmed 2026-09-24** as an acceptable, deliberate consequence — matches the old `AccordionContainer`'s own "lazy-mount, never torn back down" contract, just re-triggered by scroll proximity instead of an open click.

### Risks

* **R1 — Restoring deleted code is more than a `git checkout`.** The codebase has moved since `ce329a7^` (`RobotOptionsTab`, `SignatureArrayDrawer`, etc. have all changed shape since); `AccordionContainer.tsx` itself should restore cleanly (nothing else in this spec touches `CabinetBox`/`Toggle`/`DualLabel`, its own dependencies), but its 5 old consumers' integration code does not restore — this spec's §2 table describes fresh integration, not a revert.
* **R2 — Single-open-accordion-view-wide is a bigger behavior change than it sounds.** Today, a company's bulk-edit view and an individual robot's view are structurally identical (`CompanyOptionsSection`/`RobotOptionsPanel` both narrow to one section); after this spec, both render all 4 sections' worth of accordion shells at once (just one expanded). Largely mitigated by Q5's lazy-mount-on-approach: a section's actual content (and its `useMemo`/`useCallback` derivations) only constructs once scrolled near, not for all 4 up front — but the accordion *shells* themselves (and the scrollspy `IntersectionObserver` watching each) still all exist from first render, which is itself a small perf-shape change worth the eventual task breakdown measuring, not assumed free.
* **R3 — Scrollspy correctness under fast/thrown scrolling (mobile momentum scroll) is a real edge case.** `IntersectionObserver` threshold tuning affects whether the "current section" reads correctly mid-fling; `docs/PERFORMANCE.md`'s existing main-thread profiling concerns (Tone's 100ms lookahead vs. long tasks) make this worth a dedicated manual pass, not just unit coverage.
* **R4 — Test churn is large**, similar in kind to `NAV_LAYOUT_REWRITE.md`'s own R4 — every accordion consumer's test suite, `useNavTree.test.ts`, `RobotOptionsTab.test.tsx`, `CompanyOptionsSection.test.tsx` all need updates. Mitigated the same way: mechanical migration, reviewed as its own diff category, never a weakened assertion.
