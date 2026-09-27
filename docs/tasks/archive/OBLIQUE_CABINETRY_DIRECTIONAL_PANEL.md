# Implementation Plan: Oblique Cabinetry — DirectionalPanel

Source spec: [docs/specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md](../specs/OBLIQUE_CABINETRY_DIRECTIONAL_PANEL.md).
Source intent: [docs/intent/oblique-cabinetry-directional-panel.md](../intent/oblique-cabinetry-directional-panel.md).
Not a numbered roadmap item — raised directly by Crawford after AccordionContainer (11.1.7) shipped; the
roadmap explicitly called `DirectionalPanel` out of scope for the original 11.1.x series. Pure presentation
change — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `DirectionalPanelSchema`/
`ControlSchema` change. Every task below either makes a small additive change to the already-shipped
`CabinetBox` primitive (11.1.1) or wires `DirectionalPanel` — this phase's only real consumer — through it.
None touch audio scheduling, any domain config, or any other primitive.

## Overview

Like `Toggle` (11.1.2) and unlike `RadioButton`/`AccordionContainer` (11.1.6/11.1.7), this phase needs a
small additive change to `CabinetBox` itself before its own consumer task — `autoHeight`, a new optional
prop letting the left-face wall size itself to 100% of the wrapper's real height (CSS only, no new
`ResizeObserver` — spec §1.1) instead of a caller-known fixed number. That collapses to 3 tasks: the
primitive change, the real consumer (`DirectionalPanel`'s Context-based facade wiring), and docs.

## Architecture Decisions

- **`CabinetBox`'s `autoHeight` prop (Task 1) is a separate task from `DirectionalPanel` itself (Task 2),
  not folded together** — same "component change before consumer" sequencing `Toggle`'s own Task 1→Task 2
  split established (11.1.2), for the same risk-isolation reason: `CabinetBox`'s own test suite (already
  covering every prior consumer's contract) stays provably unbroken by the additive change *before*
  `DirectionalPanel` starts depending on it.
- **`DirectionalPanel.tsx`/`.css`/`.test.tsx` land as one task, not split by file** — the Context-based
  nesting detection, the facade wiring, and the CSS scoping only make sense read together (the selector
  scoping in §1.3 depends on the exact wrapper structure §1.2/the code in §4 builds), same reasoning
  AccordionContainer's own single consumer task used.
- **The docs task depends only on the consumer task (Task 2), not Task 1** — `docs/COMPONENT_LIBRARY.md`'s
  note describes `DirectionalPanel`'s own shipped behavior (plus a mention of `CabinetBox`'s new
  capability), which isn't final until Task 2 lands; `autoHeight` isn't independently documented anywhere
  else, matching how `Toggle`'s own additive `CabinetBox` props were never given their own doc entry either.
- **No task in this plan touches `Button.tsx`/`.css`, `Toggle.tsx`/`.css`, `RadioButton.tsx`/`.css`,
  `AccordionContainer.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `cabinetBreakpoints.ts`,
  `useCabinetBoxHeight.ts`, `useAutoPanelOrientation.ts`, or any domain config file** — confirmed against
  spec §3's Strict Scope boundary. No real `DirectionalPanel` call site needs an edit, since the props
  contract doesn't change.

## Dependency Graph

```
Task 1 (CabinetBox.tsx/.test.tsx — autoHeight prop)
        │
        └──→ Task 2 (DirectionalPanel.tsx/.css/.test.tsx — Context + facade wiring)
                        │
                        └──→ Task 3 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — additive change to the already-shipped primitive

- [x] **Task 1: `CabinetBox` — `autoHeight` prop**

  **Description:** Modify `src/components/ui/controls/CabinetBox.tsx` per spec §1.1/§4: add an optional
  `autoHeight?: boolean` prop; thread it into the left-face wall's inline style so
  `height: autoHeight ? '100%' : \`${leftFaceHeight}px\`` replaces the current unconditional
  `` `${leftFaceHeight}px` ``. No other logic in the file changes — `leftFaceHeight`'s own computation
  (`frontHeight ?? boxHeight`), the width `ResizeObserver`, the geometry effect, and every other prop are
  untouched. Extend `CabinetBox.test.tsx` with the 2 new cases from spec §5.

  **Acceptance criteria:**
  - [x] Every existing `CabinetBox.test.tsx` assertion (every prior consumer's own contract — `children`
    rendering, timeline registration/kill, reduced-motion, wall/glow tweening, border-box measurement,
    `boxHeight`/`skipMountAnimation`/`frontWidth`/`frontHeight`/`popDistance`/`zIndex` overrides) still
    passes unmodified — `autoHeight` is optional and no existing test passes it.
  - [x] `render(<CabinetBox popped timelineKey="test-box" autoHeight>x</CabinetBox>)` applies `height:
    100%` on the left-face wall's inline style — not a pixel value.
  - [x] `render(<CabinetBox popped timelineKey="test-box" boxHeight={48}>x</CabinetBox>)` (no `autoHeight`)
    still applies `height: 48px` on the left-face wall — proves the new prop doesn't leak into the default
    path.
  - [x] `Button.tsx`/`Toggle.tsx`/`RadioButton.tsx`/`AccordionContainer.tsx`'s own call sites are untouched
    — `git diff` on each is empty for this task.
  - [x] No new `ResizeObserver`, no new state, no new effect added to `CabinetBox.tsx` — the width
    `ResizeObserver` and the geometry effect are byte-for-byte unchanged apart from the one conditional in
    the left-face wall's `style` prop. Added a 3rd test explicitly pinning `MockResizeObserver.instances`
    to length 1 with `autoHeight` set, as a regression guard beyond what spec §5 itself listed.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx` passes (65/65 — 62 existing plus 3
    new). Confirmed genuinely RED first: the "sizes the left-face wall's height to 100%" case failed
    (`expected '48px' to be '100%'`) before the implementation change; the other 2 new cases already passed
    pre-change (they assert the *unchanged* default path), consistent with `Toggle`'s own Task 1 precedent
    where one addition was confirmed RED at the type-check level instead.
  - [x] `npm run build:types` — zero TypeScript errors.
  - [x] `npm run lint` — zero ESLint errors.
  - [x] `npm run build` — production bundle builds cleanly (pre-existing chunk-size warning, unrelated).
  - [x] `npm test` (full suite) — 2133/2135 passing. The 2 remaining failures
    (`audioRigConfig.test.ts`'s slider-orientation-classification case and `AudioRigDrawer.test.tsx`'s
    3-Band-EQ row-orientation case) are the same pre-existing/unrelated pair recorded in AccordionContainer's
    own plan.
  - [x] Manual check: none applicable yet — `autoHeight` has zero real consumers until Task 2, same
    "component before consumer" precedent `Toggle`'s own Task 1→2 split used.

  **Dependencies:** None (11.1.1 and every prior Cabinetry item already shipped and merged to `main`).

  **Files:** `src/components/ui/controls/CabinetBox.tsx`, `src/components/ui/controls/CabinetBox.test.tsx`

  **Estimated scope:** XS (2 files, a single additive/optional change — the lowest-risk task in this plan)

### Checkpoint: Foundation change ships
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` all clean (full suite: 2133/2135,
  2 pre-existing/unrelated failures) — confirms the additive change is genuinely non-breaking for every
  existing consumer.
- [x] `CabinetBox` accepts `autoHeight` (verified by its own test suite) with zero other file in the app
  referencing it yet.
- [x] Review with human before proceeding.

---

### Phase 2: The real consumer

- [x] **Task 2: `DirectionalPanel` — Context-based top-level detection + permanently-popped facade**

  **Description:** Replace `src/components/ui/controls/DirectionalPanel.tsx` per spec §1.2/§1.3/§4: add an
  internal (not exported) `DirectionalPanelNestingContext` (`createContext(false)`); read it via
  `useContext` to determine `isNested`; render the existing panel markup unwrapped when nested, or wrapped
  in a new `<div className="sc-directional-panel-facade">` containing a `CabinetBox`
  (`popped` literal `true`, `skipMountAnimation`, `autoHeight`, `timelineKey={\`cabinet-directional-panel-facade-${schema.id}\`}`)
  when top-level; always re-provide `true` to `children` via the Context provider regardless of which
  branch rendered, so nesting propagates transitively. Replace `DirectionalPanel.css` per spec §4: add the
  2 new direct-child-combinator-scoped rules (`.sc-directional-panel-facade > .sc-cabinet-box`/
  `> .sc-cabinet-box__front`, the latter setting `display: block; width: 100%; height: auto; padding: 12px
  14px;`) — no existing rule changes. Extend `DirectionalPanel.test.tsx` per spec §5: mock `CabinetBox`
  file-wide; restructure the existing "observes its own parent element, not its own box" test into 2 cases
  (nested-still-measures-true-parent; top-level-now-measures-the-facade); add the 3 new facade-wiring cases.

  **Acceptance criteria:**
  - [x] Every existing `DirectionalPanel.test.tsx` assertion **except** "observes its own parent element,
    not its own box" (children rendering, label presence/absence/fallback, `data-orientation` for
    `'row'`/`'column'`/`'auto'`-before-measurement, children order, `'auto'`-flips-to-row-once-wide-enough)
    passes unmodified.
  - [x] The parent-element test is restructured into 2 cases (spec §5 item 1), not deleted: a genuinely
    nested panel still measures its true DOM parent (the outer panel's own `.sc-directional-panel__content`);
    a top-level panel now measures the mocked `CabinetBox` element instead of the true DOM parent, with
    `MockResizeObserver.instances` still exactly length 1.
  - [x] A standalone (top-level) `DirectionalPanel` renders exactly one `[data-testid="cabinet-box"]`, keyed
    `` `cabinet-directional-panel-facade-${schema.id}` ``.
  - [x] A `DirectionalPanel` nested inside another renders **zero** of its own `[data-testid="cabinet-box"]`
    — exactly one total for the pair (the outer's).
  - [x] Nesting 3 levels deep still renders exactly one facade (the outermost) — the Context propagates
    transitively, not just one level.
  - [x] `.sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front`/
    `.sc-directional-panel-facade > .sc-cabinet-box` are the only new CSS rules — no existing
    `.sc-directional-panel`/`.sc-directional-panel__content` rule is modified.
  - [x] `DirectionalPanelSchema`/`ControlSchema` (`src/types/controls.ts`) are untouched — `git diff
    src/types/controls.ts` is empty for this task.
  - [x] `CabinetBox.tsx`/`.css`, `useAutoPanelOrientation.ts`, `cabinetGeometry.ts`, `cabinetAnimation.ts`,
    `cabinetBreakpoints.ts`, `useCabinetBoxHeight.ts` are all untouched — `git diff` for each is empty for
    this task.
  - [x] `DirectionalPanelNestingContext` is not exported from `DirectionalPanel.tsx`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/DirectionalPanel.test.tsx` passes (16/16 — 11 existing
    minus the 1 restructured (now 2) plus the 3 new facade-wiring cases). Confirmed genuinely RED first: 4
    of the 5 new/restructured cases failed before the implementation change (the top-level-measures-facade
    case, and all 3 new facade-wiring cases); the nested-still-measures-true-parent case already passed
    pre-change, since nested behavior is genuinely unaffected by this task — a legitimate regression guard,
    not a RED-first case.
  - [x] `npm run build:types` — zero TypeScript errors.
  - [x] `npm run lint` — zero ESLint errors.
  - [x] `npm run build` — production bundle builds cleanly (pre-existing chunk-size warning, unrelated).
  - [x] `npm test` (full suite) — 2137/2139 passing. The 2 remaining failures are the same
    pre-existing/unrelated pair recorded in AccordionContainer's own plan. **Found and fixed one real issue
    not anticipated by the spec's own acceptance criteria (though flagged as a risk to verify):**
    `SignatureArrayDrawer.test.tsx`'s "wraps its content in one Source accordion containing 4 top-level
    panels" test used a direct-child selector (`.signature-array-drawer > .sc-directional-panel`) that
    assumed a top-level panel's own root was a direct child of the drawer — no longer true now that it sits
    inside its own facade. Fixed by extending the selector through the full facade chain
    (`.signature-array-drawer > .sc-directional-panel-facade > .sc-cabinet-box > .sc-cabinet-box__front >
    .sc-directional-panel`), which uniquely identifies "top-level" the same way the plain direct-child
    selector used to. Confirmed this was the only such pattern in any of the 6 real consumers' own test
    files — every other `:scope >`/`.closest()` usage checks a relationship *within* a single
    `.sc-directional-panel` (e.g. its own `__content` child) or *between* two already-nested panels, both
    unaffected by the facade wrapper, per the spec's own audit.
  - [x] **Manual check completed — by Crawford, directly against the running app**, not via automated
    browser tooling (none was configured in the implementing session). Confirmed good across the real
    consumers (spec §5's checklist): every top-level panel reads framed with no animation ever, nested
    panels stay unframed with no facade-inside-facade stacking, `orientation="auto"` panels still flip
    correctly despite the facade-padding offset, and the facade's vertical padding reads right against both
    short and tall (multi-row EQ) panels. No issues found or fixed.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/DirectionalPanel.tsx`, `src/components/ui/controls/DirectionalPanel.css`, `src/components/ui/controls/DirectionalPanel.test.tsx`. **Scope ended up one file wider than
  planned**, discovered during verification rather than planning: `src/components/robot/SignatureArrayDrawer.test.tsx`'s own direct-child selector (see above) — not touched by choice, required to keep
  the full suite green.

  **Estimated scope:** S (3 files as planned; 4 actual, the 4th a real consumer test fix the spec's own §5
  flagged as a risk to verify, not something left unaudited)

### Checkpoint: DirectionalPanel ships — first visible change
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` (full suite) all clean — 2137/2139,
  the 2 remaining failures confirmed pre-existing and unrelated (see Task 2's own verification notes).
- [x] Every real `DirectionalPanel` call site in the app renders through the new Context-based facade logic
  with zero call-site changes required — confirmed by `npm run build:types` alone surfacing nothing, since
  the props contract didn't change.
- [x] **Manual check completed against the real running app — confirmed good by Crawford**, no issues
  found (see Task 2's own verification notes).
- [x] Review with human before proceeding.

---

### Phase 3: Docs

- [x] **Task 3: `docs/COMPONENT_LIBRARY.md` — DirectionalPanel's internal rendering note**

  **Description:** Add a short note under `DirectionalPanel`'s existing section (mirroring every prior
  item's own "internal rendering changed, contract didn't" note) — its internal rendering changed for
  top-level instances only (a permanently-popped `CabinetBox` facade, detected via an internal Context
  rather than a caller-supplied flag) while its `{ schema, children }` contract stayed byte-for-byte
  identical, per spec §6. Also note `CabinetBox`'s own new `autoHeight` capability, mirroring how `Toggle`'s
  additive `CabinetBox` changes got a mention in `Toggle`'s own note.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `DirectionalPanel` now renders through `CabinetBox`
    internally for top-level instances, with its props contract unchanged, and mentions `autoHeight`. Added
    as its own `### DirectionalPanel's Oblique Cabinetry rendering` section, following the exact pattern
    `Button`/`Toggle`/`RadioButton`/`AccordionContainer`'s own sections use, immediately after
    `AccordionContainer`'s.
  - [x] The note is spot-checked against `DirectionalPanel.tsx`'s actual shipped code (Task 2), not the
    spec's draft.

  **Verification:**
  - [x] Manual review — spot-checked directly against the shipped `DirectionalPanel.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 2.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint` clean after every task; `npm run build` clean after Task 2 (no
  further source changes in Task 3 to re-verify against); `npm test` full suite passed after Task 2
  (2137/2139, 2 pre-existing/unrelated failures — see Task 2's verification notes) with no source change
  since to warrant a re-run.
- [x] All acceptance criteria across all 3 tasks are met, including Task 2's manual check.
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [x] **Manual check completed against the real running app (Task 2) — confirmed good by Crawford**, no
  issues found.
- [x] Reviewed with Crawford — ready for PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The `autoHeight` → `height: 100%` mechanism (spec §1.1) replaces what the intent doc's own interview confirmed (a `ResizeObserver`) — a real, deliberate substitution, not something Crawford explicitly re-confirmed | Low–Medium — functionally equivalent and lower-risk than the originally-floated approach, but a divergence from a literal confirmed answer | Spec §7 flags this prominently as "surfaced for explicit review, not silently substituted"; the Phase 1 checkpoint's human review is the point to catch it if the heavier version is actually wanted |
| `orientation="auto"` panels now measure `.sc-cabinet-box__front` instead of their true DOM parent (spec §1.4) — `AUTO_PANEL_ROW_MIN_WIDTH` (640px) was already a first-pass, unconfirmed-in-the-real-app guess before this change | Low–Medium — a miscalculation only surfaces visually (a panel flipping row/column at a subtly wrong width), not via jsdom | Task 2's manual check explicitly includes EQ & Filters' own row-when-there's-room layout, the one real `'auto'` consumer with visible stakes |
| 6 real consumers' own test files query `DirectionalPanel` nesting structure via `.closest()`/`:scope >` selectors — audited as unaffected, but the audit is reasoning, not a test run | Low — if the audit is wrong, it fails loudly (a specific, named test breaks) rather than silently | Task 2's own verification step explicitly calls out running the full suite (not the audit alone) as the actual gate; each consumer's test file is named individually so a failure is easy to trace back |
| `DirectionalPanelNestingContext` is a new mechanism (this codebase's control primitives have used local `useState`/props exclusively until now, never Context) | Low — a well-understood, standard React pattern; internal-only, not exported, so its blast radius is contained to this one file | Acceptance criteria explicitly require the Context to stay unexported and tested only through observed behavior (facade present or not), not through direct context inspection |

## Open Questions

Resolved during Plan (not left open):

- ~~Does this phase need a separate "shared-primitive change" task before the consumer task, the way
  `Toggle`'s Task 1 did?~~ **Resolved: yes** — unlike `RadioButton`/`AccordionContainer`, this phase's
  `autoHeight` prop is a genuine (if small) addition to `CabinetBox` itself, warranting the same
  risk-isolation split `Toggle`'s own plan used.
- ~~Does the docs task depend on both tasks, or just the consumer task?~~ **Resolved: Task 3 depends only
  on Task 2** — `autoHeight` isn't independently documented anywhere, matching `Toggle`'s own precedent.

Carried forward from spec §7, not blocking this plan:

1. **The `autoHeight`-via-CSS-percentage substitution** (spec §7 item 1) — resolved by reasoning during
   Specify, not directly re-confirmed against the interview's own literal "add a `ResizeObserver`" answer.
   Flagged above in Risks and at the Phase 1 checkpoint for explicit human review before merge.
2. **The `orientation="auto"` measurement-target shift** (spec §1.4/§7 item 2) — a real, accepted, but
   newly-introduced behavior change for the one existing test that directly asserted the old target; pinned
   as an explicit regression guard in Task 2 rather than left implicit.
