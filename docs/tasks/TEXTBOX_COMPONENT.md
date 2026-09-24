# Implementation Plan: Textbox Component

Source spec: [docs/specs/TEXTBOX_COMPONENT.md](../specs/TEXTBOX_COMPONENT.md).
Source intent: [docs/intent/textbox-component.md](../intent/textbox-component.md).
Pure presentation addition — no `AudioEngine`/`BeatClock` change, no Zustand-shape change, no
`ControlSchema` variant added. Every task below either adds a brand-new file or extends
`docs/COMPONENT_LIBRARY.md`; none touch `CabinetBox.tsx`/`.css`, `src/types/controls.ts`,
`src/utils/traitColors.ts`, `src/types/traits.ts`, any domain config, or any existing primitive.

## Overview

This phase ships one new, self-contained primitive with no real consumer wired up yet (spec §2's
own "explicitly not touched" list — wiring `Textbox` into actual robot/company lore data is a later,
unscoped phase). That collapses this plan to 3 tasks: adding the one new runtime dependency the
spec requires, the primitive itself (`Textbox.tsx`/`.css`/`.test.tsx`, bundled — same reasoning
`OBLIQUE_CABINETRY_TEXT_INPUT.md`'s own Task 1 used for `TextInput`'s facade wiring, since the
component, its CSS, and its test coverage only make sense reviewed together), and a docs task.

## Architecture Decisions

- **The dependency add is its own task, first, not folded into the component task.** `Textbox.tsx`
  imports `dompurify` directly (spec §4); if the install and the import landed in the same task and
  something about the install went wrong (wrong package, missing types, lockfile conflict), the
  failure would be indistinguishable from a bug in `Textbox.tsx` itself. Splitting it out gives a
  fast, isolated failure point and lets `npm run build:types` confirm the dependency resolves
  *before* any component code depends on it.
- **`Textbox.tsx`/`.css`/`.test.tsx` land as one task, not split by file** — matching
  `OBLIQUE_CABINETRY_TEXT_INPUT.md`'s own Task 1 precedent exactly: the component, its CSS, and its
  test coverage are one reviewable unit, since none of the 10 test cases in spec §5 can pass without
  both the `.tsx` logic and the `.css` class names existing together. Unlike `Toggle`'s two-task
  "shared-primitive change, then consumer" split, there is no shared-primitive change here — spec
  §2 confirms `CabinetBox` needs zero modification, so there's nothing to isolate-and-verify first
  (same reasoning `OBLIQUE_CABINETRY_TEXT_INPUT.md`'s own Architecture Decisions section gives for
  the identical choice).
- **The docs task depends only on the component task**, not the dependency task directly (it's
  transitively covered) — `docs/COMPONENT_LIBRARY.md`'s new section describes `Textbox`'s shipped
  contract, settled once that task lands.
- **No task in this plan touches `CabinetBox.tsx`/`.css`, `src/types/controls.ts`,
  `src/utils/traitColors.ts`, `src/types/traits.ts`, any domain config file, or any existing
  primitive** — confirmed against spec §2's "explicitly not touched" list and §3's Strict Scope
  boundary. No real consumer is wired up in this plan (spec §7's own Forward Note defers that to a
  later, separate phase).

## Dependency Graph

```
Task 1 (package.json/lockfile — add dompurify)
        │
        ▼
Task 2 (Textbox.tsx/.css/.test.tsx — the primitive itself)
        │
        ▼
Task 3 (docs/COMPONENT_LIBRARY.md)
```
Strictly sequential — Task 2 imports the dependency Task 1 adds, and Task 3 documents what Task 2
actually shipped.

## Task List

### Phase 1: Foundation — the new dependency

- [ ] **Task 1: Add `dompurify` as a runtime dependency**

  **Description:** Per spec §3: `npm install dompurify`. Confirm whether the installed version
  ships its own TypeScript types (recent `dompurify` majors bundle `index.d.ts`) by running
  `npm run build:types` with a throwaway `import DOMPurify from 'dompurify';` line — if type
  resolution fails, add `@types/dompurify` as a devDependency at that point rather than
  pre-emptively; if it succeeds, no `@types` package is added. Remove the throwaway import before
  finishing this task (Task 2 adds the real one).

  **Acceptance criteria:**
  - [ ] `dompurify` appears under `"dependencies"` in `package.json` (not `"devDependencies"` — it
    ships in the production bundle, per spec §3).
  - [ ] `package-lock.json` is updated and committed alongside `package.json`.
  - [ ] A throwaway `import DOMPurify from 'dompurify'` type-checks cleanly with
    `npm run build:types`; if it required adding `@types/dompurify`, that package is present in
    `"devDependencies"` and this fact is noted in the task's own commit message. The throwaway
    import itself is removed before this task is considered done — no real source file imports
    `dompurify` yet.
  - [ ] No other `package.json` entry changes (no accidental version bumps elsewhere from the
    install).

  **Verification:**
  - [ ] `npm run build:types` — zero TypeScript errors (with the throwaway import present, then
    confirmed still zero errors after removing it).
  - [ ] `npm run build` — production bundle builds cleanly with the new dependency in the tree.
  - [ ] `npm test` — full suite unaffected (no source changes yet).

  **Dependencies:** None.

  **Files:** `package.json`, `package-lock.json`

  **Estimated scope:** XS (dependency-only, no source change)

### Checkpoint: Dependency ready
- [ ] `npm run build:types`, `npm run build` both clean with `dompurify` installed.
- [ ] Confirmed whether `@types/dompurify` was needed (recorded in Task 1's own notes for Task 2 to
  reference).
- [ ] Reviewed with human before proceeding.

---

### Phase 2: The primitive itself

- [ ] **Task 2: `Textbox` — new primitive (`Textbox.tsx`/`.css`/`.test.tsx`)**

  **Description:** Create `src/components/ui/controls/Textbox.tsx` per spec §1/§4: a
  `React.memo`-wrapped component (`TextboxInner`/`export const Textbox = memo(TextboxInner)`,
  matching the codebase's existing `React.memo` boundary convention) taking `{ html: string;
  cabinetry?: boolean; trait?: Trait }`. Sanitizes `html` via `DOMPurify.sanitize` unconditionally
  before rendering it with `dangerouslySetInnerHTML` on an inner `.sc-textbox__content` element.
  Resolves the accent style via `getTraitColorStyle(trait ?? 'header')` and applies it on the root
  `.sc-textbox` element. When `cabinetry` is `true`, wraps the content in `CabinetBox` with
  `popped`/`skipMountAnimation`/`autoHeight` all literal `true` and `timelineKey` built from
  `` `cabinet-textbox-${useId()}` `` (spec §1.2 — resolved via `useId()`, no new `id` prop), and adds
  the literal `hasCabinetry` class to the root alongside `sc-textbox`. When `cabinetry` is `false`
  (the default), no `CabinetBox` is rendered at all and the root carries only `sc-textbox`. Create
  `Textbox.css` per spec §4: base `.sc-textbox`/`.sc-textbox__content` rules plus the
  `.sc-textbox.hasCabinetry > .sc-cabinet-box`/`...> .sc-cabinet-box > .sc-cabinet-box__front`
  facade-sizing rules (mirroring `TextInput.css`'s own `display: block; width: 100%; height: auto;
  padding: 12px 14px` front-face override). Create `Textbox.test.tsx` per spec §5: mock
  `CabinetBox` (same pattern `TextInput.test.tsx`/`Button.test.tsx`/`Toggle.test.tsx` already use)
  and mock `dompurify` as a pass-through spy, then implement all 10 test cases listed in spec §5.

  **Acceptance criteria:**
  - [ ] Renders sanitized HTML via `dangerouslySetInnerHTML` (spec §5 case 1) — e.g. `<strong>hi
    </strong>` renders a real `<strong>` element.
  - [ ] `DOMPurify.sanitize` is called with the raw `html` prop on every render, regardless of
    `cabinetry`'s value (spec §5 case 2) — sanitization is never gated behind cabinetry.
  - [ ] `cabinetry` omitted or explicitly `false` renders no `CabinetBox` and the root's `className`
    is exactly `'sc-textbox'` (spec §5 cases 3-4).
  - [ ] `cabinetry={true}` renders a `CabinetBox` with `popped`/`skipMountAnimation`/`autoHeight`
    all `"true"`, and the root's `className` is `'sc-textbox hasCabinetry'` (spec §5 case 5).
  - [ ] `timelineKey` starts with `cabinet-textbox-` and is non-empty when `cabinetry={true}` (spec
    §5 case 6); two simultaneously-rendered `cabinetry={true}` instances get two distinct
    `timelineKey` values (spec §5 case 7).
  - [ ] `trait="output"` applies `getTraitColorStyle('output')`'s exact `--color-accent-a`/`-b`
    values on the root (spec §5 case 8); omitting `trait` falls back to
    `getTraitColorStyle('header')`'s exact values (spec §5 case 9).
  - [ ] The trait style is present identically regardless of `cabinetry`'s value (spec §5 case 10).
  - [ ] No `ControlSchema` variant is added — `git diff src/types/controls.ts` is empty for this
    task.
  - [ ] `CabinetBox.tsx`/`.css` are untouched — `git diff` empty for both.
  - [ ] Every `CabinetBox` prop passed when `cabinetry` is `true` (`popped`, `skipMountAnimation`,
    `autoHeight`) is a literal in the JSX, never a variable derived from other state (spec §3).

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/Textbox.test.tsx` — confirmed genuinely RED
    first (written against not-yet-created `Textbox.tsx`, or against a stub that doesn't yet
    satisfy each case), then GREEN after implementation, all 10 cases passing.
  - [ ] `npm run build:types` — zero TypeScript errors.
  - [ ] `npx eslint .` — zero errors.
  - [ ] `npm run build` — production bundle builds cleanly.
  - [ ] `npm test` (full suite) — no existing test file's results change; this task only adds new
    files.

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/Textbox.tsx`, `src/components/ui/controls/Textbox.css`,
  `src/components/ui/controls/Textbox.test.tsx`

  **Estimated scope:** M (3 files, one new primitive with two rendering branches — same shape class
  as `TextInput`'s own facade task, slightly larger test surface since this is a new component
  rather than a modification)

### Checkpoint: Textbox ships — first visible new primitive
- [ ] `npm run build:types`, `npx eslint .`, `npm run build` all clean; `npm test` full suite passes
  with no regressions against the pre-Task-1 baseline.
- [ ] All 10 acceptance-criteria-mapped test cases pass.
- [ ] Manual check: a throwaway local render (removed before committing, per spec §5's own manual
  check note) confirms HTML tags render as expected, a `<script>` tag is stripped, `cabinetry=true`
  shows the oblique-cabinetry panel framing content of varying height without clipping, a `trait`
  prop visibly recolors the panel, and omitting `trait` shows Header's own teal/green.
- [ ] Reviewed with human before proceeding.

---

### Phase 3: Docs

- [ ] **Task 3: `docs/COMPONENT_LIBRARY.md` — new "Display-only primitives" section**

  **Description:** Per spec §6: add a new top-level section, **"Display-only primitives (no
  `ControlSchema`)"**, placed after the existing `AccordionContainer` entry and before "Shared
  composition components". Document `Textbox`'s props (`html`, `cabinetry?`, `trait?`), the
  `hasCabinetry` class, the `getTraitColorStyle('header')` fallback, and note explicitly that it
  ships with no real data-driven consumer yet — a later phase wires it into robot/company lore
  copy. Spot-check the documented props shape against `Textbox.tsx`'s actual shipped
  `TextboxProps` interface, not the spec's draft.

  **Acceptance criteria:**
  - [ ] `docs/COMPONENT_LIBRARY.md` has a new `## Display-only primitives (no ControlSchema)`
    section in the position described above, distinct from both the 14-primitive `ControlSchema`
    table and the "Shared composition components" section (spec §6 explains why it's neither).
  - [ ] The section documents `Textbox`'s exact props shape as shipped, the `hasCabinetry` class
    behavior, and the `'header'` trait fallback.
  - [ ] The section states plainly that `Textbox` has no real consumer wired up yet as of this
    phase.
  - [ ] The documented props shape is spot-checked against `Textbox.tsx`'s real
    `TextboxProps` interface (Task 2's shipped code), not copied from the spec unverified.

  **Verification:**
  - [ ] Manual review — spot-checked directly against the shipped `Textbox.tsx`.
  - [ ] `npm run build:types`, `npx eslint .` clean (docs-only change, expected no-op).

  **Dependencies:** Task 2.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npx eslint .`, `npm run build` all clean after every task; `npm test`
  full suite passes with no regressions introduced by Tasks 1-2 (Task 3 is docs-only, no re-run
  needed).
- [ ] All acceptance criteria across all 3 tasks are met, including Task 2's manual check.
- [ ] `docs/COMPONENT_LIBRARY.md` reflects the shipped component.
- [ ] Reviewed with Crawford — ready for PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `dompurify`'s sanitized output could strip HTML the real (not-yet-written) lore/description data actually relies on, since no real content sample exists to test against yet — this plan only exercises hand-written test fixtures | Medium — won't surface until a later phase wires in real data | Task 2's manual check uses a deliberately varied hand-written sample (bold/italic/paragraph tags plus a `<script>` tag); the later wiring phase (spec §7's Forward Note) should re-verify against real authored content once it exists, not assume this phase's fixtures are representative |
| `useId()`-derived `timelineKey` (spec §1.2) is a novel resolution for this codebase — every other `CabinetBox` consumer keys off a `schema.id` that already existed for other reasons | Low — `useId()` is a stable, well-established React primitive for exactly this "unique per mounted instance" need | Task 2's acceptance criteria explicitly test uniqueness across two simultaneous instances (spec §5 case 7), not just presence of a key |
| `autoHeight`'s left-face-wall-to-100% mechanism has only been proven against `DirectionalPanel`'s arbitrary block content and `TextInput`'s `DualLabel`+`<input>` combination, not arbitrary sanitized HTML (which could include block-level elements of very different heights, e.g. a `<pre>` block) | Low — the mechanism itself is content-agnostic (resolves against real CSS height regardless of what produces it) | Task 2's manual check includes content of varying height/structure, not just a single short string |
| No real consumer exists yet to prove the component against actual app data | None for this plan's own scope (explicitly deferred, spec §7) | Flagged in the Forward Note below so it isn't mistaken for an oversight |

## Open Questions

Resolved during Plan (not left open):

- ~~Should the `dompurify` install and the component code land in the same task?~~ **Resolved:
  no, split into Task 1/Task 2** — isolates a dependency-resolution failure from a component-logic
  failure, and lets type-checking confirm the dependency before any real import depends on it.
- ~~Does this phase need a separate "shared-primitive change" task before the component task, the
  way `Toggle`'s Task 1 did?~~ **Resolved: no** — spec §2 confirms `CabinetBox` needs zero
  modification; there is nothing to isolate-and-verify first (same resolution
  `OBLIQUE_CABINETRY_TEXT_INPUT.md` reached for the identical question).

Carried forward from spec §7, not blocking this plan:

1. **`useId()` as the `timelineKey` source, rather than a new `id` prop.** Resolved in the spec by
   direct reasoning, not directly interviewed. Flagged again here only because Task 2 is where it
   actually gets implemented and test-verified (case 7 above) — if Crawford wants an explicit `id`
   prop instead after seeing it in the running app, that's a small, isolated follow-up to Task 2,
   not a plan-wide change.
2. **Forward note (unscoped by this plan):** wiring `Textbox` into a real first-party HTML data
   source (robot/company lore or description copy) and choosing that consumer's own `trait` value
   is the natural next phase — no task above does this, matching spec §7's own Forward Note.
