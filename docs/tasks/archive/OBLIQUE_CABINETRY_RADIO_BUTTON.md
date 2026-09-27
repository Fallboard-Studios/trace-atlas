# Implementation Plan: Oblique Cabinetry — RadioButton (Roadmap Phase 11.1.6)

Source spec: [docs/specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md](../specs/OBLIQUE_CABINETRY_RADIO_BUTTON.md). Source intent: [docs/intent/oblique-cabinetry-radio-button.md](../intent/oblique-cabinetry-radio-button.md). Pure presentation change — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `RadioButtonSchema`/`ControlSchema` change. Every task below wires `RadioButton` — this phase's only touched component — through the already-shipped `CabinetBox` (11.1.1) and `useVoxelTrackGap` (11.1.3) primitives exactly as-is. None touch `CabinetBox` itself, `VoxelTrack`/`voxelTrackMath.ts`, audio scheduling, any domain config, or any other primitive.

## Overview

Unlike `Toggle` (11.1.2), which needed a small additive change to `CabinetBox` itself before its own consumer task, `RadioButton` needs **zero** changes to any shared primitive — every prop and hook it uses (`CabinetBox`'s defaults, `useVoxelTrackGap()`) already exists exactly in the shape this phase needs. That collapses this plan to one real implementation task (the full `RadioButton` rewrite — the first consumer with more than one `CabinetBox` per control) plus two small, low-risk follow-ups: a test proving the pattern holds at `CompanyButtonRow`'s real scale (up to `MAX_COMPANIES`), and a docs note.

## Architecture Decisions

- **No "shared-primitive change" task, unlike 11.1.2's Task 1→Task 2 split** — spec §1.1–§1.5 resolve every implementation-shape question by reusing `CabinetBox`/`useVoxelTrackGap` completely unmodified (no new prop, no new export, no rename). There is nothing to isolate-and-verify before the consumer task the way `Toggle`'s `boxHeight`/optional-`children` additions needed to be.
- **`RadioButton.tsx`/`.css`/`.test.tsx` land as one task, not split by file** — same "S, 3 files" shape as `Toggle`'s own consumer task (11.1.2's Task 2); the component, its row/tint CSS, and its tests are one cohesive change with no internal risk boundary worth a separate checkpoint.
- **`CompanyButtonRow.test.tsx`'s new long-list case is its own task, sequenced after the core change** — it exercises the shipped `RadioButton` at a different consumer's real ceiling (`MAX_COMPANIES` = 6, plus `None`/`All`), which the spec's own Docs/Commit-Pattern section (§6) already lists as a separate, independently reviewable commit. It's not gated by anything technical (the query-by-role assertions would equally pass against the pre-change markup) — kept sequential purely for a clean, reviewable diff order matching the spec's own grouping.
- **The docs task depends only on the core `RadioButton` task, not on `CompanyButtonRow`'s test** — `docs/COMPONENT_LIBRARY.md`'s note describes `RadioButton`'s own shipped rendering/contract, which is settled once Task 1 lands; it says nothing `CompanyButtonRow`-specific.
- **No task in this plan touches `CabinetBox.tsx`/`.css`, `VoxelTrack.tsx`, `voxelTrackMath.ts`, `useCabinetBoxHeight.ts`, any other primitive, or any domain config file** — confirmed against spec §3's Strict Scope boundary; `Lfo.tsx` (which composes `RadioButton`) needs no edit since the props contract doesn't change.

## Dependency Graph

```
Task 1 (RadioButton.tsx/.css/.test.tsx — per-option CabinetBox wiring)
        │
        ├──→ Task 2 (CompanyButtonRow.test.tsx — long-list coverage)
        │
        └──→ Task 3 (docs/COMPONENT_LIBRARY.md)
```

Tasks 2 and 3 both depend only on Task 1, not on each other — safe to do in either order (or in parallel) once Task 1 ships.

## Task List

### Phase 1: The consumer — `RadioButton`'s full per-option rewrite

- [x] **Task 1: `RadioButton` — one `CabinetBox` per option, selected-only accent tint, gapped/wrapping row**

  **Description:** Replace `src/components/ui/controls/RadioButton.tsx` per spec §1.1/§4: keep `ToggleGroup.Root`/`ToggleGroup.Item` exactly as today for interaction, and render each option's `CabinetBox` as its own `Item`'s child — `popped={option.value === value}`, `timelineKey={\`cabinet-radio-${schema.id}-${option.value}\`}`, `option.label` as `children` (moves from being the `Item`'s own direct text). Pass no `boxHeight`, `frontWidth`/`frontHeight`, `popDistance`, `skipMountAnimation`, or `zIndex` override on any instance (spec §1.2/§1.3/§1.5 — every one of `CabinetBox`'s existing defaults is exactly what's wanted). Import `useVoxelTrackGap` from `./useCabinetBoxHeight` (unmodified, unrenamed — spec §1.5) and apply its resolved value as an inline `--cabinet-radio-gap` custom property on `ToggleGroup.Root`, following `Toggle.tsx`'s own `--cabinet-toggle-box-size` precedent. Replace `RadioButton.css` per spec §4: delete the bordered-pill container (`border`/`border-radius`/`overflow: hidden` on `.sc-radio-button__root`) and the `border-right` item dividers entirely; add `flex-wrap: wrap` + `gap: var(--cabinet-radio-gap, 8px)` on the root, `width: fit-content` + transparent/borderless reset on each item (mirroring `Button.css`'s own `.sc-button` rule), and a `.sc-radio-button__item[data-state='on'] .sc-cabinet-box__front { background-color: var(--color-accent); }` compound-selector rule for the selected-only tint (not `Button.css`'s unconditional class-scoped override — that would tint every option). Extend `RadioButton.test.tsx` with the 4 new cases from spec §5 — every existing case in the current file stays unchanged and passing.

  **Acceptance criteria:**
  - [x] Every existing `RadioButton.test.tsx` assertion (8 cases: one item per option, exactly the matching option `aria-checked`, `onChange` on selection, no `onChange` on deselect-to-empty, accessible-name fallback to `schema.id`, not-disabled-by-default, every item `data-disabled` when `disabled`, no `onChange` when disabled) passes unmodified.
  - [x] Renders exactly one `CabinetBox` per `schema.options` entry; `popped` is `true` only for the option whose `value` matches the component's own `value` prop, `false` for every other — computed in `RadioButton.tsx`, never read back from Radix's own `data-state`.
  - [x] Each `CabinetBox` receives a distinct `timelineKey` of the form `` `cabinet-radio-${schema.id}-${option.value}` `` — no two options share a key, and the prefix is distinct from `cabinet-button-`/`cabinet-toggle-`/any `VoxelTrack` prefix.
  - [x] No `CabinetBox` instance receives `boxHeight`, `frontWidth`/`frontHeight`, `popDistance`, `skipMountAnimation`, or `zIndex` — confirmed by direct inspection of the call site, not just by tests passing.
  - [x] `option.label` renders as `CabinetBox`'s own `children`, not as `ToggleGroup.Item`'s direct text content.
  - [x] `RadioButton.css`'s selected-only tint targets `.sc-radio-button__item[data-state='on'] .sc-cabinet-box__front` specifically — not an unconditional `.sc-radio-button__item .sc-cabinet-box__front` rule.
  - [x] `.sc-radio-button__root` no longer declares `border`, `border-radius`, or `overflow: hidden`; no `.sc-radio-button__item` rule declares `border-right`.
  - [x] `useVoxelTrackGap` is imported from its existing location and called unmodified — no new breakpoint constant table, no rename of the hook or its exports.
  - [x] `RadioButtonSchema`/`ControlSchema` (`src/types/controls.ts`) are untouched — `git diff src/types/controls.ts` is empty for this task.
  - [x] `CabinetBox.tsx`/`.css`, `cabinetGeometry.ts`, `cabinetAnimation.ts`, `cabinetBreakpoints.ts`, `useCabinetBoxHeight.ts`, `VoxelTrack.tsx`, `voxelTrackMath.ts` are all untouched — `git diff` for each is empty for this task.
  - [x] `disabled` continues to disable the whole `ToggleGroup.Root` at once; no per-item disabled logic is added.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/RadioButton.test.tsx` passes (12/12 — the existing 8 plus the 4 new cases). Confirmed genuinely RED first: 3 of the 4 new cases failed against the pre-change component (`CabinetBox` not rendered at all yet); the 4th (`data-state` reflects selection) already passed pre-change, since that's Radix's own existing behavior on `ToggleGroup.Item`, unaffected by whether `CabinetBox` is used inside it — kept as a regression guard for the new CSS rule that now depends on it, not as a RED-first case. All 4 mock `CabinetBox` the same way `Button.test.tsx` does, file-wide (verified this doesn't disturb the 8 existing tests, since none of them depend on `CabinetBox`'s real rendering — role/`aria-label`/`data-state`/`data-disabled` all live on `ToggleGroup.Item` itself).
  - [x] `npm run build:types` — zero TypeScript errors.
  - [x] `npm run lint` — zero ESLint errors.
  - [x] `npm run build` — production bundle builds cleanly (pre-existing chunk-size warning, unrelated).
  - [x] `npm test` (full suite) — 2123/2125 passing. The 2 remaining failures (`audioRigConfig.test.ts`'s slider-orientation-classification case and `AudioRigDrawer.test.tsx`'s 3-Band-EQ row-orientation case) are confirmed pre-existing and unrelated: reproduced identically with this task's changes `git stash`ed, so present on `main` before this task started. **Found and fixed one real issue not anticipated by the spec/plan:** `LfoTargetGroup.test.tsx`'s own local `gsap` mock (`timeline()` returning `{ to: vi.fn(), kill: vi.fn() }`) had no `.fromTo` — every `CabinetBox` that file exercised before this task (`SliderLinear`'s/`Toggle`'s voxel-track boxes, via `Lfo`) passes `skipMountAnimation`, which skips `CabinetBox`'s real tween path entirely. `RadioButton`'s boxes deliberately don't skip it (a newly-selected option's pop is a real transition, not a remount — spec §1.1/§3), making this the first render in that file to hit `CabinetBox`'s genuine first-mount `.fromTo()` chain, which the incomplete mock couldn't satisfy (`TypeError: tl.fromTo is not a function`, 13 failing tests). Fixed by extending the mock's `timeline()` return to a self-chainable object with a stubbed `fromTo`, mirroring `CabinetBox.test.tsx`'s own established mock shape for the same call pattern. Confirmed the 13 failures were genuinely caused by this task (not pre-existing) via the same `git stash` comparison above — `LfoTargetGroup.test.tsx` passed 144/144 on the stashed (pre-task) tree.
  - [ ] Manual check (spec §5): across Audio Setting, a Signature Array layer's Type row, Decay Mode, and the Companies drawer's button row — **not performed in this session** (no browser/devtools tooling configured). Flagged for Crawford to check directly against the running app before merge, same as Toggle's own Task 2 required a human-performed check.

  **Dependencies:** None (11.1.1 and 11.1.3 already shipped and merged to `main`).

  **Files:** `src/components/ui/controls/RadioButton.tsx`, `src/components/ui/controls/RadioButton.css`, `src/components/ui/controls/RadioButton.test.tsx`. **Scope ended up one file wider than planned**, discovered during verification rather than planning: `src/components/ui/controls/LfoTargetGroup.test.tsx`'s local `gsap` mock (see above) — not touched by choice, required to keep the full suite green.

  **Estimated scope:** S (3 files as planned; 4 actual, the 4th a test-mock fix in a file this task's change newly exercises)

### Checkpoint: RadioButton ships — first visible change
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` (full suite) all clean — 2123/2125, the 2 remaining failures confirmed pre-existing and unrelated (see Task 1's own verification notes).
- [x] Every real `RadioButton` call site in the app (`AUDIO_SETTING_SCHEMA`, `DECAY_MODE_SCHEMA`, the per-layer Type schemas, `Lfo.tsx`'s Shape row, `buildCompanyButtonRowSchema`) renders through the new per-option `CabinetBox` with zero call-site changes required — confirmed by `npm run build:types` alone surfacing nothing.
- [ ] Manual check — **not yet performed** (no browser tooling in this session); still open before this phase is considered fully verified.
- [ ] Review with human before proceeding.

---

### Phase 2: Scale coverage and docs

- [x] **Task 2: `CompanyButtonRow.test.tsx` — coverage at `MAX_COMPANIES` scale**

  **Description:** Add the one new test case from spec §5: build a `companies` array of exactly `MAX_COMPANIES` (6) entries, including at least one deliberately long generated-style name (e.g. `"Static Bloom Vanguard"`), render `CompanyButtonRow`, and assert all 8 resulting radio items (`None`, `All`, plus the 6 companies) are queryable via `getByRole('radio', { name: ... })`. Confirms the real `buildCompanyButtonRowSchema` output renders cleanly through Task 1's new per-option shape at the shape's actual ceiling, not just whatever shorter list any other existing test happens to use. Does not assert pixel-level wrapping (jsdom performs no real layout) — that's covered by Task 1's own manual check.

  **Acceptance criteria:**
  - [x] A new test builds a 6-entry `companies` array (matching `MAX_COMPANIES`), with at least one long name.
  - [x] All 8 resulting items (`None`, `All`, 6 companies) are found via `getByRole('radio', { name: ... })`.
  - [x] Every existing `CompanyButtonRow.test.tsx` assertion passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/components/company/CompanyButtonRow.test.tsx` passes (12/12 — 11 existing plus the 1 new case). Not RED-first in the bug-reproduction sense (this is coverage at scale, not a fix for a known-broken behavior) — confirmed it exercises real code by checking `getAllByRole('radio')` resolves to exactly `2 + MAX_COMPANIES` (8) elements, which would fail loudly if `buildCompanyButtonRowSchema` or `RadioButton`'s per-option rendering dropped or duplicated any entry at this scale. Pre-existing, unrelated React `act(...)` console warnings appear (from `CabinetBox`'s `ResizeObserver` callback firing after the initial render commit) — present for every test in this file post-Task-1, not specific to the new case, and don't affect pass/fail.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/company/CompanyButtonRow.test.tsx`

  **Estimated scope:** XS (1 file, test-only)

- [x] **Task 3: `docs/COMPONENT_LIBRARY.md` — RadioButton's internal rendering note**

  **Description:** Add a short note under `RadioButton`'s row (mirroring `Button`/`Toggle`/the sliders' own notes) — its internal rendering changed (one `CabinetBox` per option instead of a bordered pill of flat segments) while its `ControlSchema`/props contract stayed byte-for-byte identical, per spec §6.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `RadioButton` now renders through `CabinetBox` internally (one box per option, selected-only accent tint), with its props contract unchanged. Added as its own `### RadioButton's Oblique Cabinetry rendering (Roadmap Phase 11.1.6)` section, following the exact pattern `Button`/`Toggle`/the 3 sliders' own sections already use, immediately after `SliderCenteredZero`'s.
  - [x] The note is spot-checked against `RadioButton.tsx`'s actual shipped code (Task 1), not the spec's draft — the documented props shape (`{ schema: RadioButtonSchema; value: string; onChange: (value: string) => void; disabled?: boolean }`) matches `RadioButton.tsx`'s `RadioButtonProps` interface exactly (confirmed by direct comparison, not by re-reading the spec).

  **Verification:**
  - [x] Manual review — spot-checked directly against the shipped `RadioButton.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 1.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint` clean after every task; `npm run build` clean after Task 1 (no further source changes in Tasks 2–3 to re-verify against); `npm test` full suite passed after Task 1/2 (2123/2125, 2 pre-existing/unrelated failures — see Task 1's verification notes) and re-run clean after Task 2's new test (12/12 in `CompanyButtonRow.test.tsx`; no other source changed since the last full-suite run).
- [x] All acceptance criteria across all 3 tasks are met, **except** Task 1's manual check, which remains open (see below).
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [ ] **Manual check (Task 1) still outstanding** — no browser tooling was available in this implementing session; needs a human pass against the real running app (Audio Setting, a Signature Array layer's Type row, Decay Mode, and the Companies drawer's button row — see Task 1's own verification list) before this is called fully done, same as Toggle's own plan required a human-performed check at its Phase 2 checkpoint.
- [ ] Not yet reviewed with Crawford — **not ready for PR** until the manual check above is done and reviewed.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Row-wrap and wall/glow-clearance behavior (spec §1.5's calculated 8px-gap-vs-4px-bleed margin) can only be confirmed against real layout — jsdom performs none | Low–Medium — a miscalculation would only surface visually, not via any automated test | Task 1's manual check explicitly walks the Companies drawer at real overflow width, and explicitly checks for wall/glow overlap at every breakpoint, not just a jsdom-passing test suite |
| `useVoxelTrackGap` is reused, unrenamed, by a consumer with no "voxel track" in its own name — could read as confusing or accidental to a future contributor | Low — purely a readability concern, no behavioral risk | Spec §1.5 documents the reuse explicitly as a deliberate call (not a missed cleanup), with an inline comment at the call site pointing back to that reasoning; flagged again in this plan's Open Questions below |
| `Lfo.tsx` composes a 4-option `RadioButton` for every LFO-bearing target in the app — this phase multiplies the per-`Lfo`-instance `CabinetBox`/GSAP-timeline count by 4, on top of every other primitive's own timeline, compounding the "70–100+ primaries in a typical session" figure the LFO Drift spec already documents | Unknown until 11.2's dedicated performance pass — no action taken in this phase | Explicitly out of scope here (spec §7's forward note to 11.2); not this plan's job to resolve, only to avoid making 11.2's own pass a surprise |
| The `[data-state='on']` CSS selector (§1.4) depends on Radix's `ToggleGroup.Item` continuing to stamp that attribute | Low — today's pre-change `RadioButton.css` already keys off the same attribute for its own (now-superseded) segment coloring, so this isn't new reliance, just relocated | No separate mitigation needed; carried-forward existing behavior, not a new assumption |

## Open Questions

Resolved during Plan (not left open):

- ~~Does this phase need a separate "shared-primitive change" task before the consumer task, the way `Toggle`'s Task 1 did?~~ **Resolved: no** — spec §1.1–§1.5 confirm every `CabinetBox`/`useVoxelTrackGap` capability this phase needs already exists unmodified; there is nothing to isolate-and-verify first.
- ~~Does `CompanyButtonRow`'s new test need to gate or be gated by anything beyond Task 1?~~ **Resolved: depends only on Task 1**, sequenced after it purely for clean diff/commit ordering (matching spec §6), not because of any technical dependency — the query-by-role assertions it adds would equally pass against the pre-change markup.

Carried forward from spec §7, not blocking this plan:

1. **Whether `useVoxelTrackGap` should eventually be renamed to something RadioButton-neutral.** Resolved in the spec as "no, not in this phase" — reusing three already-shipped, stable slider files' own hook verbatim rather than touching them for a cosmetic rename. Flagged here again so a future contributor who finds the name confusing treats it as a fine standalone follow-up, not a sign this phase missed something.
2. **Forward note for 11.1.7–11.1.9:** `AccordionContainer` (11.1.7) and `Select` (11.1.8) are single-box, state-keyed consumers much closer in shape to `Toggle` than to this phase's N-boxes-per-control pattern; `TextInput`/`CoordsInput` (11.1.9) has no discrete option set at all. Nothing in this plan resolves either of those items' own open design questions.
3. **Forward note for 11.2 (accessibility/performance verification):** this phase's contribution to the app's total on-screen `CabinetBox`/GSAP-timeline count (via `Lfo.tsx`'s per-target Shape row, potentially dozens of instances × 4 boxes each) should be part of what 11.2's own performance pass measures, not assumed negligible.
