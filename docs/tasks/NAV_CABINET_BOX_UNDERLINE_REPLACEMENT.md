# Implementation Plan: Replace Nav Row Underline with a Colored Cabinet Box

Source spec: [docs/specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md](../specs/NAV_CABINET_BOX_UNDERLINE_REPLACEMENT.md). Source intent: [docs/intent/nav-cabinet-box-underline-replacement.md](../intent/nav-cabinet-box-underline-replacement.md). Pure presentation change — no `AudioEngine`/`BeatClock` touched, no `uiStore` state added, no content-pane component touched, no change to which tree levels get this chrome or how auto-expand works (`useNavTree.ts` untouched).

**Gate cleared:** the spec's own §7 listed 2 corrections needing an explicit yes before Tasks — the 44px minimum-height floor blocking the confirmed ~4px design, and deleting (not deprecating) `UnderlineLink.*`. Crawford confirmed both ("those sound fine") before this plan was written. Still open, non-blocking: exact final naming (`NavCabinetRow` etc.), whether `NavTreeNode.tsx`'s local `useUnderlineChrome` variable gets renamed, and the first-pass 4px height/pop-distance tuning — see Open Questions.

## Overview

Extend `CabinetBox` with two new optional, default-preserving props (`color`, `enforceMinTouchHeight`), then replace the nav tree's `UnderlineLink`/`UnderlineLinkNavRow` pair with a single new `NavCabinetRow` that renders a bare, full-width, ~4px `CabinetBox` in the row's resolved trait/robot color, wired into `NavTreeNode.tsx` in place of the old row, with the old files deleted in that same task. `CabinetBox`'s own change ships first with zero real behavior change to any existing consumer (component-before-consumer, matching this codebase's own established precedent); `NavCabinetRow` ships next with zero real consumers; the tree wiring (and old-file deletion) lands last, in one atomic task, so the tree is never left with two contradictory row-chrome implementations coexisting for one nav level.

## Architecture Decisions

- **`CabinetBox`'s 2 new props ship as their own task (Task 1), fully covered by tests, before any nav-panel file references either one.** Matches this codebase's own "component before consumer" convention (`CabinetBox`/`Button`, `UnderlineLink`/`UnderlineLinkNavRow` in the prior nav phase) — the existing 44px-floor regression test must keep passing unmodified as direct proof the change is additive, which is easiest to verify in isolation before any consumer exists to also (accidentally) exercise it.
- **Deleting `UnderlineLink.tsx`/`.css`/`.test.tsx` and `UnderlineLinkNavRow.tsx`/`.css`/`.test.tsx` happens in the same task as wiring `NavCabinetRow` into `NavTreeNode.tsx` (Task 3), not split out.** The same "leaves the system in a working state" rule the prior nav phase's plan applied to its own `uiStore` field deletion applies here: `NavTreeNode.tsx` is the only consumer of `UnderlineLinkNavRow`, so deleting the old files before rewiring `NavTreeNode.tsx` breaks the build, and rewiring `NavTreeNode.tsx` without deleting the old files leaves genuinely dead code sitting in the tree, which the spec (§4) explicitly says not to do.
- **`NavCabinetRow` (Task 2) depends only on Task 1, not on any nav-tree state logic.** It renders no toggle/expand control (unchanged from `UnderlineLinkNavRow` — this row never had one) and needs nothing from `useNavTree.ts` beyond what `NavTreeNode.tsx` already passes it (`node`, `color`, `onClick`) — so it can be built and fully tested in isolation immediately after Task 1, in parallel with nothing else in this plan (there is nothing else independent to parallelize against here — this is a small, linear, 3-task chain, unlike the prior nav phase's wider Phase 1 fan-out).
- **No task in this plan touches `useNavTree.ts`, `uiStore.ts`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, or `useCabinetBoxHeight.ts`** — confirmed against spec §3's Strict Scope boundary. `NavCabinetRow` passes literal `boxHeight={4}`/`popDistance={4}` overrides through `CabinetBox`'s existing prop contract; no new geometry/timing derivation anywhere.
- **`NavTreeNode.tsx`'s `resolvedColor`/`inheritedColor` computation is untouched by every task in this plan** — Task 3 changes only which component consumes `resolvedColor` (`NavCabinetRow` instead of `UnderlineLinkNavRow`), never how it's computed.

## Dependency Graph

```
Task 1 (CabinetBox.tsx/.css/.test.tsx: color + enforceMinTouchHeight props)
        │
        ▼
Task 2 (NavCabinetRow.tsx/.css/.test.tsx — new, isolated, zero real consumers yet)
        │
        ▼
Task 3 (NavTreeNode.tsx swap + delete UnderlineLink*/.UnderlineLinkNavRow* — atomic)
        │
        ▼
Task 4 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — `CabinetBox`'s new props, zero consumers yet

- [ ] **Task 1: `CabinetBox` — add `color` and `enforceMinTouchHeight` props**

  **Description:** Per spec §1.3/§4/§5.1: add two new optional props to `CabinetBoxProps`. `color?: string` — when provided, overrides `--color-accent`/`--color-surface` for this instance's backing, both walls, **and** front face (all three, not the walls-only or front-only precedents `Toggle`/`RadioButton`/`Button` already established) via a new `--cabinet-box-color` inline custom property, read in `CabinetBox.css` as `var(--cabinet-box-color, var(--color-accent))` / `var(--cabinet-box-color, var(--color-surface))` in place of the current unconditional `var(--color-accent)`/`var(--color-surface)` reads. `enforceMinTouchHeight?: boolean` (default `true`) — controls whether `--cabinet-box-height` floors at 44px (`Math.max(boxHeight, enforceMinTouchHeight ? 44 : 0)`); the left-face wall's own height (`leftFaceHeight = frontHeight ?? boxHeight`) already uses the raw, unfloored `boxHeight` today and needs no code change — only the front-face-driving `--cabinet-box-height` custom property does. Both props omitted must leave every existing consumer's rendered CSS output byte-for-byte identical to before this task.

  **Acceptance criteria:**
  - [ ] Omitting `color` entirely: no `--cabinet-box-color` inline style appears on the wrapper.
  - [ ] Providing `color="#ff0000"`: `--cabinet-box-color: #ff0000` appears as an inline custom property on the wrapper.
  - [ ] `CabinetBox.css`'s backing/top-face/left-face-inner/front-face rules all read `var(--cabinet-box-color, <existing-default>)` — confirmed by reading the stylesheet source directly (jsdom doesn't resolve `color-mix()`/cascaded custom properties, matching this file's own already-documented caveat), not by asserting rendered colors.
  - [ ] The existing "floors `--cabinet-box-height` at 44px, even when a smaller `boxHeight` override is given" test is **unmodified** and still passes — proves `enforceMinTouchHeight`'s default (`true`) preserves today's behavior exactly.
  - [ ] `enforceMinTouchHeight={false}` with `boxHeight={4}` produces `--cabinet-box-height: 4px`, not `44px`.
  - [ ] `enforceMinTouchHeight={false}` with `boxHeight={60}` is unaffected — `--cabinet-box-height: 60px` either way (the floor never mattered at that size).
  - [ ] `color` and `enforceMinTouchHeight` are independent — asserting one's behavior does not depend on the other being set.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx` passes, including every pre-existing test unmodified.
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: none applicable yet — zero real consumers until Task 2, same "component before consumer" precedent this codebase already established for `CabinetBox`→`Button` and `UnderlineLink`→`UnderlineLinkNavRow`.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/CabinetBox.tsx`, `src/components/ui/controls/CabinetBox.css`, `src/components/ui/controls/CabinetBox.test.tsx`

  **Estimated scope:** S (3 files, two small additive props on an already-well-tested component — no new geometry, no new animation path, just 2 conditional style reads and one `Math.max` argument change)

### Checkpoint: Foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test` all clean.
- [ ] Every existing `CabinetBox` consumer (`Button`, `Toggle`, `RadioButton`, `VoxelTrack`, `AccordionContainer`) is unaffected — spot-check at least `Button.test.tsx`/`Toggle.test.tsx` still pass unmodified.
- [ ] Review with human before proceeding.

---

### Phase 2: The new row component (depends only on Task 1)

- [ ] **Task 2: `NavCabinetRow` — the deepest-two-levels row, rebuilt on `CabinetBox`**

  **Description:** Add `src/components/panels/screen/nav/NavCabinetRow.tsx`/`.css` per spec §5.2: a transparent `<button className="sc-nav-cabinet-row">` click target (mirroring `Button.css`'s own `.sc-button` split — identical shape to `UnderlineLinkNavRow`'s existing wrapper) containing a `DualLabel` (humanLabel only) and a bare, textless `CabinetBox` beneath it — `popped` computed from local `hovered`/`focused`/`pressed` state exactly as `UnderlineLinkNavRow` does today, passed into `CabinetBox`. `CabinetBox` receives `color` (passed straight through from this component's own `color` prop), `boxHeight={4}`, `popDistance={4}`, `enforceMinTouchHeight={false}` (Task 1's new prop — this box is not itself the touch target; the wrapping `<button>` is), and a `timelineKey` of `` `cabinet-nav-row-${node.id}` ``. `NavCabinetRow.css` adds `width: 100%` on `.sc-nav-cabinet-row .sc-cabinet-box`/`.sc-cabinet-box__front` so the box spans the full row rather than `CabinetBox`'s own content-sized default — no new `CabinetBox` prop needed for this (the existing `ResizeObserver` measurement already picks up whatever real width CSS produces, the same pattern `VoxelTrack`'s own straddling boxes rely on).

  **Acceptance criteria:**
  - [ ] Renders `DualLabel` with `humanLabel` only (no `loreLabel` passed).
  - [ ] Renders a `CabinetBox` with no `children`.
  - [ ] `fireEvent.mouseEnter`/`mouseLeave` toggles the `popped` prop passed to `CabinetBox`.
  - [ ] `fireEvent.focus`/`blur` toggles it independently of hover.
  - [ ] `fireEvent.pointerDown`/`pointerUp` toggles it independently of hover/focus.
  - [ ] Clicking the row calls the supplied `onClick` exactly once.
  - [ ] `CabinetBox` receives `boxHeight={4}`, `popDistance={4}`, `enforceMinTouchHeight={false}`, `timelineKey={cabinet-nav-row-<node.id>}`, and this component's own `color` prop passed straight through.
  - [ ] No `UnderlineLink`/`Button` anywhere in this file — confirmed via import statements.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/NavCabinetRow.test.tsx` passes, `CabinetBox` mocked (`vi.mock('@/components/ui/controls/CabinetBox', ...)`, rendering the received props as `data-*` attributes — mirroring `UnderlineLinkNavRow.test.tsx`'s own choice to mock `UnderlineLink`) so this file tests only the row's own event-to-prop wiring, not `CabinetBox`'s already-proven internals (Task 1).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: none applicable yet — not wired into `NavTreeNode` until Task 3.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/nav/NavCabinetRow.tsx`, `src/components/panels/screen/nav/NavCabinetRow.css`, `src/components/panels/screen/nav/NavCabinetRow.test.tsx`

  **Estimated scope:** S (3 new files, mechanical wiring against an already-proven `CabinetBox` from Task 1 — same relationship `UnderlineLinkNavRow` had to `UnderlineLink`)

### Checkpoint: New row component ships
- [ ] `npm run build:types`, `npm run lint` clean; `NavCabinetRow.test.tsx` passes.
- [ ] `NavCabinetRow` renders and responds to hover/focus/press correctly in isolation, with zero real consumers yet — `UnderlineLinkNavRow` is still what actually renders in the running app at this point, so there is no visual change yet.
- [ ] Review with human before proceeding.

---

### Phase 3: Wiring the tree — atomic swap + deletion

- [ ] **Task 3: `NavTreeNode.tsx` swap to `NavCabinetRow`; delete `UnderlineLink*`/`UnderlineLinkNavRow*`**

  **Description:** Per spec §2/§4: `NavTreeNode.tsx` swaps its `UnderlineLinkNavRow` import/render for `NavCabinetRow` (Task 2), passing the exact same `node`/`color={resolvedColor}`/`onClick` props it already computes today — `resolvedColor`/`inheritedColor` computation itself is untouched (Architecture Decisions). In the same task, delete `src/components/ui/controls/UnderlineLink.tsx`/`.css`/`.test.tsx` and `src/components/panels/screen/nav/UnderlineLinkNavRow.tsx`/`.css`/`.test.tsx` outright — this is the first point at which they become genuinely unreferenced, so this is the correct, and only correct, point to remove them (splitting this into "swap" then "delete later" would leave dead code sitting in the tree in between, which the spec explicitly says not to do).

  **Acceptance criteria:**
  - [ ] `NavTreeNode.tsx` renders `NavCabinetRow`, not `UnderlineLinkNavRow`, for every node matching `isDeepestTwoLevels` — same condition, same props, only the component changed.
  - [ ] A branch or entity node (robot/"All Probes"/company) is completely unaffected — still `Button`+`CabinetBox`, `Toggle` present when it has children; this task changes nothing about that branch.
  - [ ] `resolvedColor` computation and its threading to `inheritedColor` for children is byte-for-byte unchanged — this task only changes which component receives the already-computed value.
  - [ ] `grep -rn "UnderlineLink" src/` returns nothing (no lingering import, no stray reference in a comment describing current behavior — historical doc references in `docs/` are handled by Task 4, not this one).
  - [ ] `src/components/ui/controls/UnderlineLink.tsx`, `.css`, `.test.tsx` no longer exist.
  - [ ] `src/components/panels/screen/nav/UnderlineLinkNavRow.tsx`, `.css`, `.test.tsx` no longer exist.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/NavTreeNode.test.tsx` passes, with every prior `UnderlineLinkNavRow`-referencing assertion retargeted to `NavCabinetRow` (same coverage, renamed references only — no new behavior to test here beyond "the right component is now rendered").
  - [ ] `npm run build:types`, `npm run lint` clean — a stray reference to a deleted file surfaces immediately as a build error here, which is the actual proof the deletion is complete, not just the `grep` above.
  - [ ] `npm run build` clean.
  - [ ] `npm test` — full suite passes, confirming no other file anywhere in the repo still imported `UnderlineLink`/`UnderlineLinkNavRow`.
  - [ ] Manual check (`npm run dev` + real browser): tab/hover through several rows at the two deepest tree levels — confirm each pops 4px with the full wall/glow/front-face `CabinetBox` animation (not a flat `translateY`), entirely tinted in that row's resolved color, full row width, not a small square. Confirm an untraited leaf beneath a traited mid-level node shows the ancestor's color. Confirm `prefers-reduced-motion` still snaps instead of animating. Separately spot-check Header's Mute button and one other existing `CabinetBox` consumer (e.g. a `Toggle`) are pixel-identical to before this whole plan. Report back to Crawford on whether the ~4px height reads well, per his own flagged uncertainty at intent time.

  **Dependencies:** Task 2.

  **Files:** `src/components/panels/screen/nav/NavTreeNode.tsx`, `src/components/panels/screen/nav/NavTreeNode.test.tsx`, plus the 6 deleted files above.

  **Estimated scope:** M (2 edited files + 6 deletions — the actual code change is small since `resolvedColor`/dispatch logic is unchanged, but this is the task where the build can genuinely break if any stray reference to the deleted files was missed, so it's sized up from S accordingly)

### Checkpoint: Tree wiring complete — first visible change
- [ ] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` all clean.
- [ ] **The nav panel's new `CabinetBox`-based row chrome has been visually confirmed in the running app** (Task 3's own manual-check item) — if no browser automation is available in the implementing session, this is explicitly called out as outstanding, not silently skipped, matching the prior nav phase's own honest handling of the same limitation.
- [ ] Crawford has given feedback on the ~4px resting height specifically (his own flagged uncertainty) — retune `NAV_CABINET_ROW_BOX_HEIGHT`/`NAV_CABINET_ROW_POP_DISTANCE` in `NavCabinetRow.tsx` in a fast follow-up if needed; not a blocker for Task 4.
- [ ] Review with human before proceeding.

---

### Phase 4: Docs

- [ ] **Task 4: `docs/COMPONENT_LIBRARY.md` — rewrite the `UnderlineLink`/`UnderlineLinkNavRow` section for `NavCabinetRow` + `CabinetBox`'s new props**

  **Description:** Replace `docs/COMPONENT_LIBRARY.md`'s existing `UnderlineLink`/`UnderlineLinkNavRow` section (the `### UnderlineLink / UnderlineLinkNavRow` heading and its 3 paragraphs) with a `### NavCabinetRow` section describing the actually-shipped component, spot-checked against the real `NavCabinetRow.tsx`/`CabinetBox.tsx` (Tasks 1–3), not this plan's draft. Also add `CabinetBox`'s own entry (wherever its existing prop list is documented) covering the 2 new props (`color`, `enforceMinTouchHeight`) the same way prior additive `CabinetBox` props (`boxHeight`, `autoHeight`, `skipMountAnimation`) are each documented as their own "Update" paragraph under the existing `CabinetBox`/`Button`/`Toggle` entries.

  **Acceptance criteria:**
  - [ ] `docs/COMPONENT_LIBRARY.md` documents `NavCabinetRow`'s props and its use inside `NavTreeNode.tsx` for the nav tree's two deepest levels, replacing (not merely supplementing) the old `UnderlineLink`/`UnderlineLinkNavRow` section.
  - [ ] `docs/COMPONENT_LIBRARY.md` documents `CabinetBox`'s new `color`/`enforceMinTouchHeight` props, including that both are optional/default-preserving and that `enforceMinTouchHeight={false}` is only correct when the `CabinetBox` instance is not itself the real touch target.
  - [ ] No claim in either new/updated section is contradicted by the actual shipped source (spot-checked directly, not assumed from this plan).

  **Verification:**
  - [ ] Manual review — spot-checked directly against the shipped `CabinetBox.tsx`/`NavCabinetRow.tsx`/`NavTreeNode.tsx`.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 3.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` all clean.
- [ ] All acceptance criteria across all 4 tasks are met, except any manual browser check noted as outstanding due to environment limitations.
- [ ] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature; no `UnderlineLink` reference remains anywhere in `src/`.
- [ ] Crawford's ~4px height/pop-distance feedback has been collected and, if needed, a follow-up tuning task filed — not blocking this checkpoint itself.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The 44px-floor bypass (Task 1) is a real, tested accessibility guard for genuine touch targets (e.g. Header's Mute) — a mistake here could accidentally weaken it for a consumer that IS a real touch target | Medium — accessibility regression if `enforceMinTouchHeight={false}` is ever passed somewhere it shouldn't be | Task 1's acceptance criteria require the existing 44px-floor test to stay unmodified and passing; Task 3's manual check explicitly spot-checks Header's Mute button is unaffected; `enforceMinTouchHeight`'s own doc comment (spec §5.1) states plainly it must only be `false` when the box itself isn't the touch target |
| Task 3 (atomic swap + 6-file deletion) is the single point where a missed reference to a deleted file breaks the build | Low — caught immediately by `npm run build:types`/`npm run build`, not a silent failure | `grep -rn "UnderlineLink" src/` is an explicit acceptance criterion, backed by the build itself as the real proof |
| First-pass ~4px height may not read well once seen live (Crawford's own flagged uncertainty, carried from the intent doc) | Low — cosmetic only, isolated to 2 constants in `NavCabinetRow.tsx` | Called out explicitly at the Phase 3 checkpoint as a fast follow-up, not treated as a blocker for Task 4/docs |

## Open Questions

Carried forward from spec §7, non-blocking:

1. **Exact final naming** (`NavCabinetRow`/`sc-nav-cabinet-row`/`cabinet-nav-row-${id}`) — used throughout this plan as proposed by the spec; Crawford may prefer different names once he sees the diff. Renaming after the fact would be a small, mechanical follow-up, not a redesign.
2. **Whether `NavTreeNode.tsx`'s local `useUnderlineChrome` variable gets renamed** alongside the component swap — cosmetic only, left to whoever implements Task 3 to decide in the moment.

Resolved before this plan was written (spec §7, confirmed by Crawford — "those sound fine"):

- ~~Should the 44px minimum-height floor be bypassable?~~ **Resolved: yes**, via the new opt-in `enforceMinTouchHeight` prop (Task 1), default `true` so every existing consumer is unaffected.
- ~~Should `UnderlineLink.tsx`/`.css`/`.test.tsx` be deleted outright or kept as an unused-but-available primitive?~~ **Resolved: deleted outright**, in the same task that makes them genuinely unreferenced (Task 3), not left in place.
