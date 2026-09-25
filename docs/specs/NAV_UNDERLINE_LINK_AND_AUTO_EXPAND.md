# Phase Spec: Underline Link & Nav Panel Deepest-Level Auto-Expand

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/nav-underline-link-and-auto-expand.md](../intent/nav-underline-link-and-auto-expand.md), confirmed via `/interview-me`, 2026-09-25. Prior art this spec follows directly: `CabinetBox`/`cabinetGeometry.ts`/`cabinetAnimation.ts` (`docs/specs/OBLIQUE_CABINETRY_FOUNDATION.md`) — the pop-tween-via-GSAP-in-`timelineMap` pattern this phase's own `UnderlineLink` reuses in simplified form; `Button.tsx` — the hover/focus/pointerdown-pointerup `popped` computation this phase's new clickable row wrapper reuses verbatim; `traitColors.ts`'s `getTraitColorStyle`/`TRAIT_COLORS`; `useNavTree.ts`'s existing `asSettingsLeaf`/`asFleetParamsGroup`/`asRobotSection` id-shape guards, reused (not reinvented) for the new auto-expand predicate below. **Status: not started.** Everything below is a proposal for Crawford's review — §7 lists 3 corrections/discoveries beyond what the intent doc itself settled, and needs an explicit yes before Phase 3 (Tasks) is written.

---

## 1. Overview & Claude Explanation

### 1.1 What exists today

Per direct source reading (`NavTreeNode.tsx`, `NavTreeNode.css`, `NavTree.tsx`, `useNavTree.ts`, `navTreeConfig.ts`, `uiStore.ts`, `traitColors.ts`, `CabinetBox.tsx`):

- Every tree row (`NavTreeNode.tsx`) renders identically regardless of depth: a `Button` (full `CabinetBox` pop chrome, `DualLabel` text) for the name, plus a `Toggle` (+/-) when `node.children` is non-empty. There is no shorter/lighter row variant anywhere in the tree today.
- Trait/identity color is applied via one inline style per row: `node.color ? getRobotColorStyle(node.color) : node.trait ? getTraitColorStyle(node.trait) : undefined` (`NavTreeNode.tsx`), spreading 4 `--color-accent-*` custom properties onto that row's own wrapping `<div className="nav-tree-node">`.
- **`NavTreeNode.css` unconditionally resets those same 4 properties to `transparent` on every `.nav-tree-node`** (its own comment: *"resetting all 4 on every row means only a row with its OWN inline override ever shows one"*), added specifically to stop a company's identity color bleeding onto its own section children. Because this reset is an unscoped class-selector rule, it applies to *every* row's own element regardless of depth or trait — see §1.2, this directly contradicts a different, stale doc comment elsewhere.
- "Expanded" state is **not** a set of expanded node ids — it's one nullable field per tree *level*, true accordion-of-one at each level: `expandedTopLevelBranch` (branch), `expandedProbeId`/`expandedCompanyId` (entity), `expandedProbeSection`/`expandedCompanySection` (section, one level inside a specific expanded entity), `expandedFleetParamsGroup` (Fleet Params' 4 groups), `expandedSettingsLeaf` (Settings' 2 children). Only one sibling at any given level can be expanded at a time — e.g. `expandedFleetParamsGroup` can hold `'pacing'` **or** `'eqFilters'`, never a record of several groups open simultaneously.
- `useNavTree.ts`'s `select()`/`isSelected()`/`isExpanded()`/`toggleExpand()` all parse a node's `id` by splitting on `.`, mapping each segment through a typed `asXxx` guard (`asSettingsLeaf`, `asFleetParamsGroup`, `asRobotSection`, `asRobotSubsection`, `asTopLevelBranch`) — never trusting the id string itself as stored state, only its *parsed* result.
- Tree depth varies by branch: Settings/Fleet Params are 3 levels (branch → mid → leaf); Probes/Companies are 4 levels (branch → entity → section → subsection).

### 1.2 Correction — trait color does NOT cascade to untraited descendants today

The intent doc (and a doc comment in `navTreeConfig.ts` itself: *"a node with neither `color` nor `trait` set... simply inherits whichever ancestor's row last set the 4 `--color-accent-*` custom properties, via ordinary CSS cascade"*) assumes plain CSS inheritance carries a traited ancestor's color down to an untraited descendant row. **This is not what actually happens.** CSS custom properties are inherited *only when no declaration at all matches the element itself*; `NavTreeNode.css`'s `.nav-tree-node { --color-accent-a: transparent; ... }` rule matches literally every row (same class, every depth), so it supplies an explicit value at every element — which wins over inheritance regardless of specificity, for every row that has no *higher*-specificity override (i.e. no inline style). Concretely: an untraited leaf row's 4 accent properties resolve to the literal string `"transparent"` at that row's own scope, not to whatever its nearest traited ancestor resolved to.

This matters directly here because **every node in the two "lowest levels" this phase targets is exactly this untraited case** — in all three branch shapes, the level directly above the lowest one already carries an explicit `trait` (`settings.quality`/`settings.sectorSettings`, `fleetParams.pacing`/`eqFilters`/`timeSpace`/`output`, and Probes'/Companies' own section-level `SECTION_CHILDREN`), while the lowest level itself (Settings/Fleet Params' leaves; Probes'/Companies' subsections) carries none. Reusing "the existing cascade, as it works today" literally would mean **the underline renders with no visible color at all** for every leaf-level row — not matching "the item's own trait or its parent's trait" from the confirmed intent.

**Resolution proposed here:** `UnderlineLink`'s color is resolved in JavaScript, not CSS cascade — `useNavTree.ts` (or `NavTreeNode.tsx`, whichever ends up cleaner at Tasks time) walks up from a node to its nearest ancestor with an explicit `trait`/`color` and resolves the same `getTraitColorStyle`/`getRobotColorStyle` value directly, passed to `UnderlineLink` as a prop — not inherited via CSS at all. This needs no new data on the schema: `nodes` (the already-built tree) already has every ancestor's own `trait`/`color` available to walk during the same top-down render pass `NavTreeNode`'s recursion already performs (a parent can pass its own resolved trait color down as a prop to its children, alongside `depth`/`focusedId` — the same mechanism, no separate lookup pass needed). See §4.2.

### 1.3 Correction — "expanded by default" means ALL siblings, not accordion-of-one; the existing per-level fields become dead

The intent's Fleet Params example is explicit: *"they'll see all of the relevant global synth effects expanded out"* — all 4 groups (Pacing, EQ & Filters, Time & Space, Output) simultaneously, not one at a time. This cannot be expressed by the existing accordion-of-one fields (`expandedFleetParamsGroup`/`expandedSettingsLeaf`/`expandedProbeSection`/`expandedCompanySection` each hold at most one value). Retrofitting them to hold a set would be new, redundant state for something that's actually **unconditional**: once a branch (or, for Probes/Companies, an entity) is itself expanded, its own mid-level/section-level children are *always* rendered expanded — there is no independent "collapse just this one" interaction at that tier anymore, so there is nothing left for a stored per-node boolean to represent.

**Resolution proposed here:** delete `expandedFleetParamsGroup`, `expandedSettingsLeaf`, `expandedProbeSection`, `expandedCompanySection` (and their setters) from `uiStore` entirely — each was tracking exactly this tier and only this tier. Replace with a **pure id-shape predicate** inside `useNavTree.ts`, reusing the existing `asSettingsLeaf`/`asFleetParamsGroup`/`asRobotSection` guards (§4.1) — no new stored state, matching this file's own "parse the id, don't trust a flag" convention (§1.1). `isExpanded()` returns `true` unconditionally for any id this predicate matches; `toggleExpand()` no-ops for the same ids (nothing to toggle); `select()`'s ancestor-auto-expand block drops its now-redundant `setExpandedFleetParamsGroup`/`setExpandedSettingsLeaf`/`setExpandedProbeSection`/`setExpandedCompanySection` calls (visibility no longer depends on them). `expandedProbeId`/`expandedCompanyId`/`expandedTopLevelBranch` are **unchanged** — entity rows and branch rows keep today's real, independently-toggleable accordion-of-one behavior exactly as-is; only the tier *directly beneath* them changes.

`NavTreeNode.tsx` stops rendering the `Toggle` (+/-) for nodes this predicate matches (nothing to click), and `NavTree.tsx`'s `ArrowLeft` keyboard handler needs the same predicate to know whether "collapse" is even a legal action here, or whether Left should instead move focus to the parent row (§4.3).

### 1.4 Correction — the pop must go through GSAP + `timelineMap`, not a CSS-only transition

The intent doc's Constraint section stated `UnderlineLink` needs no GSAP, reasoning (incorrectly) from "matching `CabinetBox`'s own precedent of only using GSAP for its animated pop tween, not static hover states" — but the underline's *entire* affordance **is** a hover/focus/press-triggered pop tween, the exact thing that sentence describes `CabinetBox` already doing via GSAP. CLAUDE.md's animation guardrail (*"Animation must use GSAP timelines and keep timelines in `timelineMap`"*) and every existing pop-capable primitive (`CabinetBox`, and transitively `Button`/`Toggle`) apply GSAP to precisely this class of effect. There is no principled reason for `UnderlineLink` to be the one exception. **Corrected here:** `UnderlineLink` drives its pop via GSAP, registered in `timelineMap`, following `CabinetBox`'s own `getCabinetPopDuration(prefersReducedMotion)`/`setTimeline`/`killTimeline` shape — simplified, since a 4px bar needs only a single-axis offset tween (no oblique wall-polygon geometry), not `cabinetGeometry.ts`'s full 2-wall derivation. See §4.2.

### 1.5 What's changing, at a glance

1. **New `UnderlineLink` primitive** (`src/components/ui/controls/UnderlineLink.tsx`/`.css`) — a 4px-tall bar with a `CabinetBox`-style top-face/side-face pop, GSAP-driven, protruding 4px on hover/focus/press. Takes no label text of its own; takes a resolved color.
2. **A new row-chrome variant** for the two deepest tree levels (§1.6) — plain `DualLabel` (humanLabel only) + `UnderlineLink` beneath it, inside a transparent `<button>` click target (mirroring `Button.css`'s own `.sc-button` split), replacing the current `CabinetBox`+`Button` row entirely at those levels. Shorter than today's rows.
3. **Auto-expand for the tier directly beneath a branch/entity** (§1.3) — always expanded once its own ancestor is expanded, no independent toggle, 4 now-dead `uiStore` fields removed.
4. **Explicit ancestor-trait resolution** for the underline's color (§1.2), since CSS cascade does not actually supply it today.

### 1.6 Exactly which tree levels change

| Branch | Depth 1 (branch) | Depth 2 | Depth 3 | Depth 4 |
|---|---|---|---|---|
| Settings | unchanged (`Button`+`CabinetBox`, manual toggle) | **auto-expand + UnderlineLink** (Quality/Presets) | **UnderlineLink** (Robot Load/Effects Load/Attenuation Style/Coordinates) | — |
| Fleet Params | unchanged | **auto-expand + UnderlineLink** (Pacing/EQ & Filters/Time & Space/Output) | **UnderlineLink** (Tempo/Automatic Effects/3-Band EQ/.../Limiter) | — |
| Probes / Companies | unchanged | unchanged (a robot/"All Probes"/company — `Button`+`CabinetBox`, manual toggle via `expandedProbeId`/`expandedCompanyId`, untouched) | **auto-expand + UnderlineLink** (Output/Composition/Envelope/Source) | **UnderlineLink** (Rhythm/Pitches/Contour/Baseline Oscillator/.../Probe Drift) |

---

## 2. Node → Row-Chrome Mapping

`NavTreeNode.tsx` picks its own rendering purely from `depth` and `branch` (the id's own first segment) — no new schema field (§1.3 already ruled one out for auto-expand; the same reasoning applies to row chrome, since both properties are fully derivable from context already available at render time):

```typescript
// New in useNavTree.ts, exported on UseNavTreeResult alongside isExpanded/isSelected/select/toggleExpand.
// Reuses the SAME asSettingsLeaf/asFleetParamsGroup/asRobotSection guards §1.3 introduces for the
// auto-expand predicate — a node is "the deepest 2 levels" if it, or its own parent, matches one of
// these shapes. See §4.1 for the shared predicate both isAutoExpandTier and isDeepestTwoLevels build on.
function isDeepestTwoLevels(id: string): boolean { /* §4.1 */ }
```

`NavTreeNode` already recurses with `depth` and has the parsed `node.id` in scope — no lookup against `nodes` is needed at render time.

---

## 3. Target File Structure

```text
src/
└── components/ui/controls/
    ├── UnderlineLink.tsx              # NEW — the 4px underline pop primitive (§4.2)
    ├── UnderlineLink.css              # NEW
    └── UnderlineLink.test.tsx         # NEW

src/components/panels/screen/nav/
    ├── NavTreeNode.tsx                # MODIFIED — depth/branch-driven row-chrome switch (§4.3);
    │                                   #   resolves+threads ancestor trait color down for §1.2's fix
    ├── NavTreeNode.css                 # MODIFIED — no change to the existing reset itself (§1.2's
    │                                   #   fix works around it, not by changing this file); may gain
    │                                   #   a shorter-row rule for the new chrome variant
    ├── NavTreeNode.test.tsx            # MODIFIED — new coverage for chrome selection, ancestor-color
    │                                   #   resolution, auto-expand rendering (no Toggle rendered)
    ├── NavTree.tsx                     # MODIFIED — ArrowLeft honors the new non-collapsible tier (§4.3)
    ├── NavTree.test.tsx                # MODIFIED
    └── useNavTree.ts                   # MODIFIED — §1.2's ancestor-trait resolution, §1.3's
                                         #   auto-expand predicate replacing 4 dead fields, isCollapsible
                                         #   added to UseNavTreeResult
    └── useNavTree.test.ts              # MODIFIED

src/stores/
    ├── uiStore.ts                      # MODIFIED — DELETE expandedFleetParamsGroup, expandedSettingsLeaf,
    │                                   #   expandedProbeSection, expandedCompanySection (+ their setters,
    │                                   #   + the now-unused FleetParamsGroup/SettingsLeaf-typed fields'
    │                                   #   own doc comments referencing "accordion-of-one... peeked
    │                                   #   open" for this tier — corrected, not just deleted silently)
    └── uiStore.test.ts                 # MODIFIED — remove coverage for the 4 deleted fields/setters

docs/
└── COMPONENT_LIBRARY.md                # MODIFIED — UnderlineLink added to the primitive list
```

**Explicitly not touched, and why:**

- `CabinetBox.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `useCabinetBoxHeight.ts` — `UnderlineLink` is a new, simpler sibling primitive (§1.4), not a `CabinetBox` modification. Branch-level and entity-level rows keep rendering through the existing `Button`/`CabinetBox` path, completely unchanged.
- `Button.tsx`/`.css`, `Toggle.tsx`/`.css` — unchanged; still used as-is for branch/entity rows and the entity-level +/- toggle.
- `navTreeConfig.ts` — no schema field added (§1.3/§2); the existing `trait`/`humanLabel`/`children` shape is untouched. `useNavTree.ts`'s `SECTION_CHILDREN`/`SUBSECTION_CHILDREN` (Probes/Companies' dynamically-generated levels) are likewise untouched in shape, only consumed differently by the new predicates.
- `traitColors.ts` — `getTraitColorStyle`/`getRobotColorStyle`/`TRAIT_COLORS` are reused exactly as they exist; no new color derivation function.
- Any content component (`SettingsContent.tsx`, `FleetParamsContent.tsx`, `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx`) — this phase is nav-tree-only; the content-pane accordions/scrollspy these components own are untouched.

---

## 4. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the files listed in §3 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No new `uiStore` state for auto-expand or row chrome.** Both are pure functions of a node's `id` string and `depth` — consistent with `useNavTree.ts`'s own established "parse the id, don't trust a stored flag" convention (§1.1). Do not add an `autoExpand`/`chromeVariant` field to `NavTreeNodeSchema`.
* **`expandedFleetParamsGroup`/`expandedSettingsLeaf`/`expandedProbeSection`/`expandedCompanySection` are deleted, not deprecated.** Per CLAUDE.md/this codebase's own demonstrated convention (`AccordionContainer`'s full removal, `NAV_LAYOUT_REWRITE.md` Task 21): genuinely dead state is removed outright, not left inert "in case something needs it later."
* **Entity rows (a robot, "All Probes", a company) and branch rows keep 100% of today's behavior** — `Button`+`CabinetBox` chrome, real `Toggle`, `expandedProbeId`/`expandedCompanyId`/`expandedTopLevelBranch` untouched. Do not extend the auto-expand predicate to match these ids.
* **`UnderlineLink`'s pop is a GSAP timeline registered in `timelineMap`**, keyed uniquely per instance (e.g. `` `underline-link-${node.id}` ``), killed on unmount — `CabinetBox`'s exact pattern (§1.4), not a CSS-only `transition`. Still calls `setTimeline` under `prefers-reduced-motion` at `duration: 0`, matching every existing GSAP-driven primitive.
* **`UnderlineLink` renders no text of its own.** The row's `DualLabel` (humanLabel only, no loreLabel — matching today's tree rows) is a sibling, not a child.
* **The transparent `<button>` click target computes `popped` exactly like `Button.tsx`** (`!disabled && (hovered || focused || pressed)`, via `pointerdown`/`pointerup` not `click`) and passes it straight into `UnderlineLink`'s own `popped` prop — no new event-handling pattern invented.
* **Ancestor trait-color resolution (§1.2) happens during `NavTreeNode`'s existing top-down recursion** — a parent already renders its children in a `.map()`; it can pass its own resolved trait color (its own `node.trait`/`node.color`, or the color it itself received from *its* parent) down as a new prop alongside `depth`/`focusedId`. Do not introduce a separate tree-walk/lookup function that re-traverses `nodes` from scratch per row.
* **No change to `NavTreeNode.css`'s `.nav-tree-node` reset itself** — §1.2's fix works around the reset (resolving color in JS, passed as a prop/inline style directly to `UnderlineLink`), not by loosening or removing the reset, which still correctly does its original job of stopping company-color bleed onto section children for entity/branch-level rows.
* **Row height for the 2 new-chrome levels is a first-pass value** — pick something noticeably shorter than today's full `CabinetBox` row height (32/40/48px per breakpoint), confirmed later in Crawford's manual visual review, not specified further here.
* **Out of scope, per the intent doc:** any change to `CabinetBox` itself; any change to branch-level or entity-level row chrome; new color-resolution logic beyond "walk to nearest ancestor with an explicit trait/color" (no new palette, no new `Trait` values).

---

## 5. Code Style & Architecture Conventions

### 5.1 `useNavTree.ts` — the shared id-shape predicate (§1.2, §1.3)

```typescript
/** True for exactly the 2 tree levels this phase gives auto-expand + UnderlineLink chrome to: a
 *  Settings/Fleet Params mid-level node (2 segments, entityId is a valid SettingsLeaf/
 *  FleetParamsGroup) and its own leaf children (3 segments, same branch); a Probes/Companies
 *  section-level node (3 segments, `section` is a valid RobotSection) and its own subsection
 *  children (4 segments, same branch+section). Reuses the existing asSettingsLeaf/
 *  asFleetParamsGroup/asRobotSection guards — no new id vocabulary. */
function isDeepestTwoLevels(id: string): boolean {
  const [branch, entityId, section] = id.split('.');
  if (branch === 'settings' && entityId && asSettingsLeaf(entityId)) return true;
  if (branch === 'fleetParams' && entityId && asFleetParamsGroup(entityId)) return true;
  if ((branch === 'probes' || branch === 'companies') && section && asRobotSection(section)) return true;
  return false;
}

/** True for exactly the "auto-expand" tier — the UPPER of the 2 levels isDeepestTwoLevels covers
 *  (a mid-level Settings/Fleet Params node, or a Probes/Companies section node): always rendered
 *  expanded once its own ancestor (branch, or entity) is expanded, no independent collapse. This
 *  is a strict subset of isDeepestTwoLevels — a node with children AND no `section` segment of its
 *  own (Settings/Fleet Params' 2-segment shape) or exactly one `section` segment (Probes/
 *  Companies' 3-segment shape) vs. isDeepestTwoLevels' leaf shapes, which have no children. */
function isAutoExpandTier(id: string): boolean {
  const [branch, entityId, section] = id.split('.');
  if (branch === 'settings' && entityId && !section) return asSettingsLeaf(entityId) !== null;
  if (branch === 'fleetParams' && entityId && !section) return asFleetParamsGroup(entityId) !== null;
  if ((branch === 'probes' || branch === 'companies') && entityId && section) return asRobotSection(section) !== null;
  return false;
}
```

`isExpanded()`/`toggleExpand()` gain one new branch each, at the top, before any existing logic:

```typescript
function isExpanded(id: string): boolean {
  if (isAutoExpandTier(id)) return true; // NEW — always expanded once visible, §1.3
  const [branch, entityId, section] = id.split('.');
  // ...existing logic UNCHANGED below, minus the now-deleted expandedFleetParamsGroup/
  // expandedSettingsLeaf/expandedProbeSection/expandedCompanySection branches (dead — every id
  // they used to handle is now caught by the isAutoExpandTier check above instead).
}

function toggleExpand(id: string): void {
  if (isAutoExpandTier(id)) return; // NEW — not independently collapsible, §1.3
  // ...existing logic UNCHANGED below, same 4 dead branches removed.
}

/** NEW on UseNavTreeResult — NavTreeNode/NavTree use this to decide whether to render a Toggle
 *  (+/-) at all, and whether ArrowLeft should attempt a collapse or move focus to the parent. */
function isCollapsible(id: string): boolean {
  return !isAutoExpandTier(id);
}
```

`select()`'s ancestor-auto-expand block drops its now-dead calls:

```typescript
// BEFORE (deleted):
//   if (branch === 'fleetParams' && entityId) { const group = asFleetParamsGroup(entityId); if (group) setExpandedFleetParamsGroup(group); }
//   if (branch === 'settings' && entityId) { const leaf = asSettingsLeaf(entityId); if (leaf) setExpandedSettingsLeaf(leaf); }
//   ...and, inside the probes/companies block: `if (sec) setExpandedProbeSection(sec);` / `setExpandedCompanySection(sec);`
// AFTER: isExpanded() no longer consults any of these fields for this tier (isAutoExpandTier
// always returns true for them), so nothing needs to be written on selection anymore. Only
// expandedTopLevelBranch/expandedProbeId/expandedCompanyId (entity-level, unaffected) remain.
```

### 5.2 `UnderlineLink.tsx`/`.css` (new)

```tsx
import { useEffect, useRef, type CSSProperties } from 'react';
import gsap from 'gsap';
import { getCabinetPopDuration } from './cabinetAnimation'; // reused as-is, same timing as CabinetBox
import { setTimeline, killTimeline } from '@/animation/timelineMap';
import './UnderlineLink.css';

interface UnderlineLinkProps {
  /** Whether the bar should be popped (protruding 4px) — the caller (the row's own transparent
   *  <button>) computes this from hover/focus/press, mirroring Button.tsx exactly. */
  popped: boolean;
  /** Unique timelineMap key, e.g. `underline-link-${node.id}`. */
  timelineKey: string;
  /** Resolved accent color — either this node's own trait/robot color, or its nearest ancestor's
   *  (§1.2). Passed directly, not read from CSS cascade. */
  color: string;
}

/**
 * A 4px-tall decorative underline with a CabinetBox-style pop (top-face + side-face wall, GSAP-
 * driven, registered in timelineMap) — no text of its own. Single-axis offset only (no oblique
 * 2-wall polygon derivation; a straight bar has no need for cabinetGeometry.ts's full geometry).
 * See docs/specs/NAV_UNDERLINE_LINK_AND_AUTO_EXPAND.md §1.4/§4.2.
 */
export function UnderlineLink({ popped, timelineKey, color }: UnderlineLinkProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const prevPoppedRef = useRef<boolean | null>(null);

  useEffect(() => () => killTimeline(timelineKey), [timelineKey]);

  useEffect(() => {
    if (!barRef.current) return;
    const isTransition = prevPoppedRef.current === null || prevPoppedRef.current !== popped;
    prevPoppedRef.current = popped;
    // CABINET_POP_DISTANCE-equivalent for this primitive — a plain vertical offset, not the 2:1
    // oblique vector (that vector exists to simulate a box's front face sliding toward the
    // viewer; a flat underline just drops straight down as it "protrudes").
    const target = popped ? 4 : 0;

    if (!isTransition) {
      gsap.set(barRef.current, { y: target });
      return;
    }
    const prefersReducedMotion = typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = getCabinetPopDuration(prefersReducedMotion);
    const tl = gsap.timeline();
    tl.fromTo(barRef.current, { y: popped ? 0 : 4 }, { y: target, duration, ease: 'power2.out' }, 0);
    setTimeline(timelineKey, tl);
  }, [popped, timelineKey]);

  return (
    <div className="sc-underline-link" aria-hidden="true" style={{ '--underline-link-color': color } as CSSProperties}>
      <div ref={barRef} className="sc-underline-link__bar" />
    </div>
  );
}

export default UnderlineLink;
```

`aria-hidden="true"` — this is a pure decoration beneath the row's own real `DualLabel`/`<button>`, which already carries the accessible name; `UnderlineLink` has no semantics of its own to announce, matching the confirmed intent's "no text of its own."

### 5.3 `NavTreeNode.tsx` — row-chrome switch + ancestor-color threading

```tsx
interface NavTreeNodeProps {
  node: NavTreeNodeSchema;
  depth: number;
  focusedId?: string;
  /** Resolved trait/robot color inherited from the nearest traited/colored ancestor — undefined
   *  at the root call (NavTree.tsx), set by a parent NavTreeNode for every child it renders.
   *  Only actually consumed by isDeepestTwoLevels(node.id) rows (§1.2); branch/entity rows keep
   *  computing their own colorStyle exactly as today and ignore this prop. */
  inheritedColor?: string;
}

export function NavTreeNode({ node, depth, focusedId, inheritedColor }: NavTreeNodeProps) {
  const { isExpanded, isSelected, select, toggleExpand, isCollapsible } = useNavTree();
  const hasChildren = !!node.children && node.children.length > 0;
  const expanded = hasChildren ? isExpanded(node.id) : false;
  const selected = isSelected(node.id);
  const showToggle = hasChildren && isCollapsible(node.id); // NEW — no Toggle for the auto-expand tier

  const ownColorStyle = node.color ? getRobotColorStyle(node.color) : node.trait ? getTraitColorStyle(node.trait) : undefined;
  const resolvedUnderlineColor = /* node.trait/color's own --color-accent, else inheritedColor */;
  const colorForChildren = node.trait || node.color ? /* this node's own resolved accent */ : inheritedColor;

  if (isDeepestTwoLevels(node.id)) {
    return <UnderlineLinkRow node={node} depth={depth} focusedId={focusedId} color={resolvedUnderlineColor} />;
  }

  return (
    // ...existing Button+CabinetBox row, unchanged, except:
    //  - the Toggle is now gated on `showToggle` instead of `hasChildren`
    //  - each child gets `inheritedColor={colorForChildren}` passed down
  );
}
```

The exact shape of `resolvedUnderlineColor`/`colorForChildren` (which of `--color-accent`/`--color-accent-a` a single hex-ish string should read, given `getTraitColorStyle` returns a 4-property `CSSProperties` object, not one string) is left for Tasks to pin down against `UnderlineLink`'s real prop contract — likely `getTraitColorStyle(trait)['--color-accent']` read directly, rather than re-deriving color-mix output by hand.

### 5.4 `NavTree.tsx` — ArrowLeft respects non-collapsible rows

```typescript
case 'ArrowLeft':
  e.preventDefault();
  if (row.hasChildren && isExpanded(row.id) && isCollapsible(row.id)) {
    toggleExpand(row.id);
  } else if (row.parentId) {
    setFocusedId(row.parentId);
  }
  break;
```

(Previously: `if (row.hasChildren && isExpanded(row.id)) { toggleExpand(row.id); }` — without the `isCollapsible` check, Left would silently no-op forever on an auto-expand-tier row instead of moving focus up.) `ArrowRight` needs no change — `isExpanded()` already returns `true` unconditionally for this tier, so its "already expanded, move into first child" branch fires correctly with no special-casing.

### 5.5 Naming and conventions

`UnderlineLink` (PascalCase component), `sc-underline-link`/`sc-underline-link__bar` (`sc-` prefix + BEM-style element suffix, matching every other primitive), `isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible` (matching `asXxx`/`isXxx` naming already established in `useNavTree.ts`). Formatting matches each touched file's existing style exactly.

---

## 6. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, colocated test files (matching every file in §3).
* **`UnderlineLink.test.tsx` (new)**, following `CabinetBox.test.tsx`'s own conventions (`vi.mock('@/animation/timelineMap', ...)`, a local `gsap` mock exposing `.fromTo()`/`.set()` call arguments):
  1. Registers a GSAP timeline via `setTimeline` when `popped` flips.
  2. Calls `killTimeline` on unmount.
  3. Still calls `setTimeline` under `prefers-reduced-motion` (duration `0`).
  4. A non-transition re-run (`popped` unchanged, some other dependency changing) repositions via `gsap.set()`, not an animated replay — same class of fix `CabinetBox` already carries (§1.9 of `OBLIQUE_CABINETRY_FOUNDATION.md`); confirmed non-tautological the same way that fix's own tests were (temporarily break it, watch the test fail, revert).
  5. Renders `aria-hidden="true"` and no text content.
  6. Applies the `color` prop as `--underline-link-color`.
* **`useNavTree.test.ts` (modified):**
  1. `isAutoExpandTier`-covered ids (`fleetParams.pacing`, `fleetParams.eqFilters`, `settings.quality`, `probes.<id>.melody`, `companies.<id>.envelope`, etc.) report `isExpanded === true` with **zero** prior `toggleExpand`/`select` calls (no ancestor expansion needed to make them report expanded — only their own ancestor being rendered at all matters, which the tree's recursive rendering already guarantees).
  2. `toggleExpand()` on the same ids is a no-op — `isExpanded()` reports `true` both before and after.
  3. `isCollapsible()` is `false` for auto-expand-tier ids, `true` for branch/entity ids and any leaf with no children (vacuously — `NavTreeNode` never renders a Toggle for a childless node regardless).
  4. Entity rows (`probes.r1`, `companies.c1`, `probes.all`) are completely unaffected — `expandedProbeId`/`expandedCompanyId` still govern them, `isAutoExpandTier` never matches them.
  5. Delete the now-obsolete tests for `expandedFleetParamsGroup`/`expandedSettingsLeaf`/`expandedProbeSection`/`expandedCompanySection` (there is no replacement assertion needed — the behavior they covered is now the unconditional `isAutoExpandTier` case above).
* **`uiStore.test.ts` (modified):** delete coverage for the 4 removed fields/setters.
* **`NavTreeNode.test.tsx` (modified):**
  1. A node matching `isDeepestTwoLevels` renders `UnderlineLink` + `DualLabel`, no `Button`/`CabinetBox`, no `Toggle`.
  2. A branch/entity node is unaffected — still `Button`+`CabinetBox`, `Toggle` present when it has children.
  3. **Ancestor color resolution (§1.2):** a leaf-level (untraited) node under a traited mid-level node receives that ancestor's resolved color as `UnderlineLink`'s `color` prop — asserted directly (not inferred from CSS, which jsdom doesn't resolve — same caveat `CabinetBox.test.tsx` already documents for `color-mix()`). A node with its own explicit `trait` uses its own, not its parent's.
  4. `aria-expanded` is still `true` on an auto-expand-tier row's own `role="treeitem"` div (ARIA semantics unaffected by the missing Toggle button).
* **`NavTree.test.tsx` (modified):** ArrowLeft on a focused auto-expand-tier row moves focus to its parent instead of no-op'ing; ArrowLeft on a focused entity/branch row still collapses it as today.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check:** open the nav panel, expand each of the 4 top-level branches in turn — Settings/Fleet Params' own mid-level children should already be visibly expanded with no separate click; expand a robot/company and confirm its own sections auto-expand the same way, while the robot/company row itself still requires an explicit click to expand and can still be collapsed. Confirm the two lowest levels render as plain text + underline (no boxed button), visibly shorter than the rows above them. Hover/focus/tab through several underline rows at different depths and confirm each pops with the correct color — an untraited leaf beneath a traited mid-level node should show that ancestor's color, not no color. Confirm `prefers-reduced-motion` makes the pop snap instead of animating. Confirm Left-arrow keyboard nav moves up out of an auto-expand-tier row instead of doing nothing.

---

## 7. Open Questions & Risks

Corrections found during Specify, not present in (or contradicting) the confirmed intent doc — **all 3 need an explicit yes before Tasks:**

1. **Trait-color cascade doesn't work today (§1.2).** The confirmed intent says "reuse the existing cascade, no new logic" — but `NavTreeNode.css`'s own reset rule already blocks that cascade for every untraited row, which is every node this phase targets. Proposed fix: resolve ancestor color explicitly in JS during `NavTreeNode`'s existing recursion (no new lookup pass, no CSS change). Confirm this is acceptable, or that a different fix (e.g. loosening the CSS reset, scoping it more narrowly) is preferred instead.
2. **"Expanded by default" means ALL siblings, and 4 `uiStore` fields become dead (§1.3).** Not explicit in the confirmed intent's wording, inferred from the Fleet Params example ("all of the relevant global synth effects"). Confirm this reading, and confirm deleting `expandedFleetParamsGroup`/`expandedSettingsLeaf`/`expandedProbeSection`/`expandedCompanySection` outright (rather than leaving them in place unused, or repurposing them) is the right call.
3. **`UnderlineLink` needs GSAP + `timelineMap`, contradicting the intent doc's own "CSS transition is sufficient" line (§1.4).** That line was this agent's own error during the interview, not something Crawford specifically asked for — flagged here rather than silently overridden.

Still open — flag for Plan/Tasks, not blocking this spec:

4. First-pass row height for the 2 new-chrome levels (no fixed number; §4/Boundaries) — pick a value, confirm visually later, same convention as `CABINET_POP_DISTANCE`'s own tuning history.
5. The exact string `UnderlineLink`'s `color` prop expects (`getTraitColorStyle(trait)['--color-accent']` vs. a raw hex from `TRAIT_COLORS` directly) — sketched in §5.3, final shape left for Tasks.
6. Whether `isDeepestTwoLevels`/`isAutoExpandTier`/`isCollapsible` belong on `UseNavTreeResult` (as drafted, §5.1) or as standalone exports from `useNavTree.ts` usable without the hook (e.g. from `NavTree.tsx`'s `flattenVisible`, which today takes `isExpanded` but not `isCollapsible`, and would need it too, per §5.4) — a small wiring detail, not an open design question.
