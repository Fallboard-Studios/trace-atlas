# Implementation Plan: Fleet Params Content Rework

Source spec: [docs/specs/FLEET_PARAMS_CONTENT_REWORK.md](../specs/FLEET_PARAMS_CONTENT_REWORK.md). Source intent: [docs/intent/fleet-params-content-rework.md](../intent/fleet-params-content-rework.md). Pure UI restructuring plus one real bugfix (Tempo/Automatic Intensity wiring) — no `AudioEngine`/scheduling change, no new Zustand field, no new `Trait` value. Every task below touches only `src/components/panels/screen/nav/content/FleetParamsContent.tsx` (+ its new `.css`/its `.test.tsx`); no other file in the repo changes.

## Overview

Fix Pacing's 2 leaves (Tempo currently reads a nonexistent `globalAudio.tempo` field and silently no-ops; Automatic Intensity isn't rendered at all and would crash `AudioRigEffectPanel`'s own non-null assertion if it ever were, since neither key has a matching `AUDIO_RIG_CONFIG` entry `AudioRigEffectPanel` can generically dispatch), then restructure all 4 Fleet Params groups (Pacing, EQ & Filters, Time & Space, Output) into one uniform shape — one group-level accordion, colored by that group's own trait, containing a group-level `IntroPanel` plus its leaves as plain (non-accordioned) sections — wrapped in one always-open, spectral-traited outer panel with the section's own `IntroPanel` at the top.

## Architecture Decisions

- **The Tempo/Automatic Intensity bugfix ships as its own task, before the accordion restructure, not folded into it or deferred after it.** Today's code already calls `AudioRigEffectPanel effectKey={leaf.effectKey}` unconditionally for every leaf, Pacing's included — meaning `automaticEffects` (no matching `AUDIO_RIG_CONFIG` block) throws the moment its leaf's `hasApproached` gate opens, and `tempo` silently reads/writes a `globalAudio.tempo` field that doesn't exist. Restructuring the accordion wrapping *first*, while this leaf-rendering bug is still live underneath, would carry the crash into the new structure. Fixing it first, independent of accordion shape, means the restructuring task (Task 3) never touches broken leaf-rendering logic — it only relocates a `renderLeaf(effectKey)` call that already works.
- **The outer spectral wrapper (Task 2) is independent of both the bugfix and the group-accordion restructure** — it only adds one new wrapping `<div>`+CSS class around the existing top-level render, so it carries no dependency either way. Sequenced second (after the bugfix, before the restructure) purely to keep each task's diff small and reviewable one at a time against the same file, not because of a real ordering constraint.
- **The group-accordion restructure (Task 3) depends on both prior tasks**, since it's the task that actually calls `renderLeaf` (Task 1's output) from inside the new group-accordion loop, and nests that loop inside the outer wrapper (Task 2's output) rather than the current bare top-level `<div>`.
- **No task touches any file outside `FleetParamsContent.tsx`/`.css`/`.test.tsx`.** `AudioRigDrawer.tsx`, `audioRigConfig.ts`, `navTreeConfig.ts`, `useAccordionOpenState.ts`, `useSectionObserver.ts`, `AccordionContainer.tsx`, `IntroPanel.tsx` are all consumed exactly as they exist today (spec §2's "Explicitly not touched" list) — every task's dependency graph is internal to one file.

## Dependency Graph

```
Task 1 (Tempo/Automatic Intensity bugfix — renderLeaf + TempoControl)
    │
    ├──→ Task 3 (group-level accordions, uses renderLeaf from Task 1)
    │
Task 2 (outer spectral wrapper panel + CSS) ──→ Task 3 (nests the group loop inside it)
```

Tasks 1 and 2 don't read each other's output and could be done in either order; both must land before Task 3.

## Task List

### Phase 1: Foundation — independent fixes to the current (per-leaf-accordion) structure

- [x] **Task 1: Fix Tempo and Automatic Intensity leaf rendering** — **SUPERSEDED, no code change needed.** Discovered at implementation time: this task's premise (the spec's §1.4 analysis) was based on reading the branch's *uncommitted* `FleetParamsContent.tsx`, which had regressed this exact wiring while reaching for the `IntroPanel`/per-group restructuring (folded `tempo`/`automaticEffects` into the generic `FLEET_PARAMS_GROUPS`-driven `AudioRigEffectPanel` loop, commented out `bpm`). The committed `HEAD` version never had this bug — it already special-cases Pacing with a correctly-wired `SliderLinear`/`BPM_SCHEMA`-bound Tempo slider and a directly-rendered `AudioRigDrawer` for Automatic Effects, and its own test suite (19/19) already passes. Resolved by resetting `FleetParamsContent.tsx`/`FleetParamsContent.test.tsx` to `HEAD` (confirmed with Crawford before discarding) rather than re-deriving this logic. Tasks 2-3 proceed from that clean baseline.

  **Description:** Today, `FleetParamsContent.tsx`'s leaf loop calls `<AudioRigEffectPanel effectKey={leaf.effectKey} />` unconditionally for every leaf, including Pacing's `tempo` and `automaticEffects`. Neither key has a matching block in `AUDIO_RIG_CONFIG` in the way `AudioRigEffectPanel` expects for `automaticEffects` (it has none — `AudioRigEffectPanel`'s `AUDIO_RIG_CONFIG.find(b => b.key === effectKey)!` throws once that leaf's `hasApproached` gate opens), and `tempo`'s existing `AUDIO_RIG_CONFIG` entry is read/written through `globalAudio.tempo`, a field `GlobalAudioSettings` doesn't have, so dragging it today silently does nothing. Add a `renderLeaf(effectKey: SelectedFleetParamsEffect)` helper in `FleetParamsContent.tsx` that special-cases these 2 keys — `'tempo'` renders a new `TempoControl` component (reads `useAudioStore((s) => s.bpm)`/`setBPM`, renders one `SliderLinear` with the existing `BPM_SCHEMA`, wrapped in `getTraitColorStyle('composition')` to match `AUDIO_RIG_EFFECT_TRAIT.tempo`), `'automaticEffects'` renders the existing `AudioRigDrawer` component directly (already correctly wired to `pingVarianceAutomation`/`setPingVarianceAutomation` — this file already imports it, just never calls it) — and falls through to today's `<AudioRigEffectPanel effectKey={effectKey} />` for every other key. Wire the existing leaf loop to call `renderLeaf(leaf.effectKey)` instead of rendering `AudioRigEffectPanel` directly. This task does **not** touch the accordion/wrapper structure at all — it lands inside the current per-leaf-`AccordionContainer` shape, verifiable and mergeable on its own.

  **Acceptance criteria:**
  - [ ] Scrolling to (or otherwise mounting) the Automatic Intensity leaf no longer throws — it renders `AudioRigDrawer`'s existing content.
  - [ ] Dragging the Tempo slider changes `audioStore.bpm` via `setBPM`, and the slider's displayed value tracks `audioStore.bpm` — not `globalAudio.tempo`.
  - [ ] Dragging the Automatic Intensity slider changes `audioStore.pingVarianceAutomation` via `setPingVarianceAutomation`, exactly as it does today wherever `AudioRigDrawer` is otherwise rendered.
  - [ ] Every other leaf (EQ, HPF, LPF, Reverb, Delay, Compressor, Limiter) is pixel-for-pixel and behaviorally unchanged — `renderLeaf` falls through to the exact same `<AudioRigEffectPanel effectKey={effectKey} />` call these leaves render today.
  - [ ] `TempoControl` uses the existing `BPM_SCHEMA` and `getTraitColorStyle('composition')` — no new schema, no new `Trait` value.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx` passes, covering: Tempo leaf renders `TempoControl` (not `AudioRigEffectPanel`) and calling its `onChange` invokes `setBPM`; Automatic Intensity leaf renders `AudioRigDrawer` and calling its slider's `onChange` invokes `setPingVarianceAutomation`; every other leaf still renders via `AudioRigEffectPanel` unchanged.
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, open Fleet Params → Pacing, drag Tempo and confirm the app's actual playback tempo changes; drag Automatic Intensity and confirm it visibly affects ping variance automation as it did before this change.

  **Dependencies:** None.

  **Files:**
  - `src/components/panels/screen/nav/content/FleetParamsContent.tsx`
  - `src/components/panels/screen/nav/content/FleetParamsContent.test.tsx`

  **Estimated scope:** S (one file's render logic + a small new inline component, no structural change)

- [x] **Task 2: Outer spectral-traited wrapper panel**

  **Description:** Replace `FleetParamsContent`'s current bare `<div ref={sectionAnchorRef('fleetParams')}>` top-level wrapper with `<div ref={sectionAnchorRef('fleetParams')} className="fleet-params-content" style={getTraitColorStyle('spectral')}>` — a plain, non-collapsible, always-open container (confirmed via `/interview-me`: not an `AccordionContainer`) matching `fleetParams`'s own `trait: 'spectral'` in `navTreeConfig.ts`. Add a new co-located `FleetParamsContent.css` with the one `.fleet-params-content` class (this component currently has no CSS file of its own). No other content inside the component changes — the section-level `IntroPanel` and the group loop (in whatever shape they're in after/independent of Task 1) simply render one level deeper, inside this new wrapper instead of the old bare div.

  **Acceptance criteria:**
  - [ ] `FleetParamsContent` renders exactly one outer wrapper carrying the `'spectral'` trait's CSS custom properties (via `getTraitColorStyle('spectral')`).
  - [ ] The wrapper is a plain `<div>`, not an `AccordionContainer` — it never collapses.
  - [ ] `sectionAnchorRef('fleetParams')` still resolves to this same outer element (scrollspy/lazy-mount for the section-level anchor is unaffected).
  - [ ] A new `FleetParamsContent.css` file exists, imported by `FleetParamsContent.tsx`, defining `.fleet-params-content`.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx` passes, asserting the outer wrapper's class and trait-derived style.
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, open Fleet Params — confirm a visibly distinct (spectral) tint sits behind the whole section, including areas not covered by any group's own accordion color.

  **Dependencies:** None.

  **Files:**
  - `src/components/panels/screen/nav/content/FleetParamsContent.tsx`
  - `src/components/panels/screen/nav/content/FleetParamsContent.css` (new)
  - `src/components/panels/screen/nav/content/FleetParamsContent.test.tsx`

  **Estimated scope:** S (one wrapper element + one new small CSS file)

### Checkpoint: Foundation
- [x] `npm run build:types`, `npm run lint`, `npm test` (scoped to `FleetParamsContent.test.tsx` and direct dependencies) all clean.
- [x] Tempo and Automatic Intensity work correctly (Task 1, superseded — already correct at HEAD), and the outer spectral wrapper renders (Task 2) — both still inside the per-leaf-accordion structure at this point, not yet restructured into group accordions.
- [x] Reviewed with human before proceeding (WIP-vs-HEAD discovery surfaced and confirmed).

---

### Phase 2: The restructure

- [x] **Task 3: Group-level accordions replace per-leaf accordions**

  **Description:** This is the core rework. In `FleetParamsContent.tsx`: (1) add a `trait: Trait` field to each entry in the existing `FLEET_PARAMS_GROUPS` array (`composition`/`spectral`/`timeSpace`/`output` — the same 4 values already assigned to these groups in `navTreeConfig.ts` and `AUDIO_RIG_EFFECT_TRAIT`, restated at group granularity, not new); (2) replace the current per-leaf `AccordionContainer` (one per leaf, 7-9 today) with exactly one `AccordionContainer` per group (4 total), built from `useAccordionOpenState` called once per `group.nodeId` instead of the single hand-written `PACING_ACCORDION_SCHEMA.id`; (3) inside each group's accordion, render a group-level `IntroPanel` (`loreLabel={`${group.humanLabel} LORE TITLE`}`, trait `group.trait`, lorem-ipsum placeholder body, gated on that group's own `hasApproached`) followed by the group's leaves as plain anchor `<div>`s (`renderLeaf(leaf.effectKey)` from Task 1, still gated on each leaf's own `hasApproached`) with **no** `AccordionContainer` wrapping any individual leaf; (4) delete the now-fully-superseded dead constants `PACING_ACCORDION_SCHEMA`, `PACING_TEMPO_ID`, `PACING_AUTOMATIC_EFFECTS_ID` (their intent — one shared Pacing accordion — is now the uniform behavior of all 4 groups, not a Pacing-only special case); (5) update the two `useSectionObserver` calls so entering any group's own anchor sets `selectedFleetParamsEffect` to that group's first leaf's `effectKey` (generalizing today's Pacing-only `PACING_ACCORDION_SCHEMA.id → 'tempo'` case to all 4 groups), while entering any leaf's own anchor still sets that leaf's own `effectKey`, unchanged.

  **Acceptance criteria:**
  - [x] All 4 groups (Pacing, EQ & Filters, Time & Space, Output) render identically: one `AccordionContainer` (colored by `group.trait`) → one group `IntroPanel` → N leaf sections with no accordion of their own.
  - [x] Each group's accordion opens/closes independently — opening one never closes another (`useAccordionOpenState`'s existing per-id independence, now driven by 4 distinct `nodeId`s instead of 1).
  - [x] No `AccordionContainer` renders for any individual leaf (`fleetParams.pacing.tempo`, `fleetParams.eqFilters.eq`, etc.) — only the 4 group-level ones remain.
  - [x] Each group's `IntroPanel` only mounts once that group's own anchor has `hasApproached`; the section-level `IntroPanel` (Task 2) stays ungated, as it already is.
  - [x] Scrolling to a group's own anchor sets `selectedFleetParamsEffect` to that group's first leaf's `effectKey` (e.g. entering `fleetParams.eqFilters` sets `'eq3'`); scrolling to a leaf's own anchor still sets that leaf's own `effectKey`, unchanged from today.
  - [x] Every group `IntroPanel`'s `loreLabel` follows the `"${group.humanLabel} LORE TITLE"` convention.
  - [x] `PACING_ACCORDION_SCHEMA`, `PACING_TEMPO_ID`, `PACING_AUTOMATIC_EFFECTS_ID` no longer exist in the file.
  - [x] Pacing's Tempo/Automatic Intensity leaves render correctly inside this new group-accordion shape (via the new `renderLeaf` helper, built directly in this task since Task 1 was superseded — see its note above).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/nav/content/FleetParamsContent.test.tsx` passes (22/22) — the test file was rewritten wholesale for the new uniform-4-group shape (the old file's tests assumed only Pacing was special-cased, which no longer matches the confirmed spec of all 4 groups being uniform).
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.
  - [x] `npm run build` — production bundle builds cleanly (pre-existing >500kB chunk-size warning only, unrelated).
  - [ ] Manual check: `npm run dev` — not yet performed this session (automated verification only so far); still needed before Checkpoint: Complete is truly closed out.

  **Dependencies:** Task 1 (uses `renderLeaf`), Task 2 (nests inside the outer wrapper).

  **Files:**
  - `src/components/panels/screen/nav/content/FleetParamsContent.tsx`
  - `src/components/panels/screen/nav/content/FleetParamsContent.test.tsx`

  **Estimated scope:** M (one file, but the full structural rewrite of its render + observer wiring)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every acceptance criterion across Tasks 1-3 holds simultaneously (Tempo/Automatic Intensity work correctly, inside the new uniform 4-group-accordion structure, inside the spectral outer panel).
- [ ] Manual pass through all 4 groups in the running app, per Task 3's manual check.
- [ ] Review with human — this closes out `docs/specs/FLEET_PARAMS_CONTENT_REWORK.md`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Automatic Intensity's existing crash (non-null assertion in `AudioRigEffectPanel`) may already be latent in the current branch's uncommitted changes, masking other in-progress breakage | Medium | Task 1 fixes this first and independently, so its own test/manual check isolates and confirms the fix before any structural change lands on top of it |
| `useSectionObserver`'s group-anchor generalization (Task 3) changes `setSelectedFleetParamsEffect` behavior for 3 groups that previously had no group-level anchor mapping of their own (only Pacing did) | Low | Acceptance criteria explicitly pin the expected resolved `effectKey` per group (first leaf), and the test suite asserts it for all 4, not just Pacing |
| Deleting `PACING_ACCORDION_SCHEMA`/`PACING_TEMPO_ID`/`PACING_AUTOMATIC_EFFECTS_ID` (Task 3) could leave a dangling import or reference if anything outside this file happens to reach in | Low | `npm run build:types` surfaces any external reference immediately; spec §2 confirms no other file imports these |

## Open Questions

- Exact "before" per-leaf `AccordionContainer` count for Task 3's test assertions — read the current test file's own expectations at the start of Task 3 rather than assuming a number (spec §7 item 1, carried over).
- LFO target-selection styling (`AudioRigLfoGroup`'s `isTargeted` row class) — explicitly out of scope for this plan; noted so it isn't accidentally pulled into Task 3.
