# Intent: Nav ↔ Accordion Sync

Confirmed via `interview-me` on 2026-09-26, ahead of a `spec-driven-development` pass.

## Outcome

Nav clicks and content accordions become bidirectionally linked:

1. **Nav → content:** clicking a nav link opens the appropriate content view, scrolls to the target, and — if the target lives inside an accordion — opens that accordion. On mobile, other open accordions *within the same view/panel* close first.
2. **Content → nav:** opening an accordion puts the related nav item into its active state — its nav section expands if needed (auto-expanding any collapsed ancestor branch so the active item is visible), and its cabinetry underline pops. Closing an accordion never collapses nav sections or deselects anything — it only un-pops the underline.

## Behavior

- Direction 1 (nav→content):
  - Reuses the existing `select(node.id)` + `scrollToSection(node.id)` path in [NavTreeNode.tsx](../../src/components/panels/screen/nav/NavTreeNode.tsx) and [sectionRefs.ts](../../src/utils/sectionRefs.ts) — view switching already works today via `uiStore`'s `selectedSection`/`selectedSubsection` and is untouched by this feature.
  - New: the click also opens the accordion containing the target section, via a new imperative registry (mirroring `sectionRefs.ts`'s pattern) that lets the nav layer reach into the target view's local `useAccordionOpenState` instance.
  - Mobile-only: before opening the target accordion, other open accordions are closed, scoped strictly to the same view/panel — not app-wide.
  - Desktop: no auto-closing of sibling accordions; multiple accordions may stay open simultaneously, unchanged from today.
- Direction 2 (content→nav):
  - Opening an accordion calls into `uiStore` to expand any collapsed ancestor nav branch (`expandedTopLevelBranch` etc.) covering the corresponding nav item, and marks that item's cabinetry underline as popped.
  - `NavCabinetRow.tsx`'s `popped` computation (currently `hovered || focused || pressed`) gains an additional OR'd condition sourced from this new "section is open" signal.
  - Closing an accordion only reverts the popped signal — it must not collapse `expandedTopLevelBranch`/ancestor nav state or change `selectedSection`/`selectedSubsection`.

## Style / constraint

- Built via a **lightweight imperative registry**, not by lifting `useAccordionOpenState` into `uiStore`. This preserves the deliberate 2026-09-24 reversal (documented in `useAccordionOpenState.ts`) that took accordion open/closed state out of any shared store and made it local per view.
- The registry is the one piece of new shared plumbing and serves both directions — Direction 1 needs it to open the right view's accordion from a nav click; Direction 2 needs the reverse: the accordion's own `setOpen` call sites notifying the nav layer.

## Out of scope

- Lifting `useAccordionOpenState` into `uiStore` (a bigger architectural change than needed here).
- Any change to view-switching itself (`select()`, `selectedSection`/`selectedSubsection`) — already works.
- Desktop auto-closing of sibling accordions.
- URL/deep-link anchor changes.
- Any change to `NavCabinetRow`'s hover/focus/press pop behavior beyond OR'ing in the new condition.

## Known implementation note (not yet spec'd)

The registry's exact shape (keyed by section id like `sectionRefs.ts`, storing `{ isOpen, open, close }` callbacks per view instance) and how `NavCabinetRow` subscribes to it (context, external store via `useSyncExternalStore`, or another mechanism) are left for the `spec-driven-development` pass to formalize.
