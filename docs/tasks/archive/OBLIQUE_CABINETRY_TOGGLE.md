# Implementation Plan: Oblique Cabinetry — Toggle (Roadmap Phase 11.1.2)

Source spec: [docs/specs/OBLIQUE_CABINETRY_TOGGLE.md](../specs/OBLIQUE_CABINETRY_TOGGLE.md). Source intent: [docs/intent/oblique-cabinetry-toggle.md](../intent/oblique-cabinetry-toggle.md). Pure presentation change — no `AudioEngine`/`BeatClock` change, no new Zustand field, no `ToggleSchema`/`ControlSchema` change. Every task below either makes a small additive change to the already-shipped `CabinetBox` primitive (11.1.1) or wires `Toggle` — this phase's only real consumer — through it. None touch audio scheduling, any domain config, or any other primitive.

## Overview

Give `CabinetBox` (shipped in 11.1.1, unmodified in mechanism) two small additive capabilities it doesn't have yet — a fixed-height override and optional `children` — then delete `Toggle`'s pill-track-and-thumb visual entirely and replace it with a bare 32×32px `CabinetBox`, popped when checked, flat when off. Unlike 11.1.1 (which had to build the whole mechanism from nothing), this phase's foundation work is a single small task; the bulk of the real work is the second task, wiring the one real consumer.

## Architecture Decisions

- **`CabinetBox`'s additive props (Task 1) are a separate task from `Toggle` itself (Task 2), not folded together** — same "component change before consumer" sequencing 11.1.1's own Task 5→Task 6 split established (`CabinetBox` before `Button`). This keeps `CabinetBox`'s own test suite (already covering 11.1.1's full contract) provably unbroken by the additive change *before* `Toggle` starts depending on it, isolating risk the same way.
- **Only 2 tasks carry real code** (`CabinetBox`'s additive props, then `Toggle`), plus one docs task — smaller than 11.1.1's 8 tasks because the shared mechanism (projection math, timing, breakpoint hook, the resize-flicker fix, the JS/CSS duplication collapse) is fully reused unmodified. There is no equivalent of 11.1.1's Phase 1 (foundation math modules) or Phase 3 (the primitive itself) to redo here.
- **The docs task (Task 3) depends only on Task 2**, not Task 1 — `docs/COMPONENT_LIBRARY.md`'s note describes `Toggle`'s shipped behavior, which isn't final until Task 2 lands; `CabinetBox`'s own additive props aren't independently documented anywhere (they're an internal implementation detail of how `Toggle` renders, not a new public capability worth its own doc section — matching how 11.1.1 never documented `CabinetBox`'s props shape as its own doc entry either, only `Button`'s/`Toggle`'s consumer-facing behavior).
- **No task in this plan touches a drawer, a domain config file, `Button`, or any other primitive** — confirmed against spec §3's Strict Scope boundary; the 3 sliders remain 11.1.3–11.1.5's own future plans.

## Dependency Graph

```
Task 1 (CabinetBox.tsx additive props: boxHeight, optional children)
        │
        └──→ Task 2 (Toggle.tsx/.css/.test.tsx — wired through CabinetBox)
                        │
                        └──→ Task 3 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Foundation — additive change to the already-shipped primitive

- [x] **Task 1: `CabinetBox` — `boxHeight` override + optional `children`**

  **Description:** Modify `src/components/ui/controls/CabinetBox.tsx` per spec §1.2/§4: add an optional `boxHeight?: number` prop that, when supplied, is used instead of `useCabinetBoxHeight()`'s resolved value (the hook is still called unconditionally — Rules of Hooks — its result simply goes unused when overridden); make the existing `children` prop optional (`children?: ReactNode`, was required). No other logic in the file changes — the geometry effect, the resize-flicker fix, the glow tween, and the `--cabinet-box-height`/`--cabinet-pop-distance` inline custom properties are all untouched, just now fed by `boxHeight` (the resolved value, override-or-hook) instead of the hook's return value directly. Extend `CabinetBox.test.tsx` with the 2 new cases from spec §5.

  **Acceptance criteria:**
  - [x] Every existing `CabinetBox.test.tsx` assertion (11.1.1's full suite — `children` rendering, timeline registration/kill, reduced-motion, wall/glow tweening, border-box measurement, the resize-flicker fix) still passes unmodified — both new props are optional and no existing test passes either one.
  - [x] `render(<CabinetBox popped={false} timelineKey="test-box" />)` (no `children` at all) renders with no error and an empty `.sc-cabinet-box__front`.
  - [x] `render(<CabinetBox popped={false} timelineKey="test-box" boxHeight={32}>x</CabinetBox>)` applies `--cabinet-box-height: 32px` on the wrapper — not the `matchMedia`-resolved value (48, under this test file's existing `stubMatchMedia(false)` default) — proving the override wins over the hook's own resolved value.
  - [x] `Button.tsx`'s call site is untouched — it passes `children` and never `boxHeight`, and behaves identically (`git diff src/components/ui/controls/Button.tsx` is empty for this task).

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/CabinetBox.test.tsx` passes (15/15), covering both new cases from spec §5 alongside 11.1.1's full existing suite unmodified. Confirmed both new tests were genuinely RED first: the `boxHeight` test failed at the test-runner level (`expected '48px' to be '32px'`) before the fix; the omitted-`children` test already passed at runtime (React tolerates a missing `children` prop fine) but was confirmed RED at the type-check level instead (`npm run build:types` reported both new call sites as type errors pre-fix).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) re-confirmed clean: 118 files, 1923 tests.
  - [x] Manual check: none applicable yet — `boxHeight`/optional `children` have zero real consumers until Task 2, same "component before consumer" precedent 11.1.1's own Task 5→6 split used.

  **Dependencies:** None (11.1.1 already shipped and merged to `main`).

  **Files:** `src/components/ui/controls/CabinetBox.tsx`, `src/components/ui/controls/CabinetBox.test.tsx`

  **Estimated scope:** XS (2 files, both changes additive and optional — the lowest-risk task in this plan)

### Checkpoint: Foundation change ships
- [x] `npm run build:types`, `npm run lint`, `npm run build`, `npm test` all clean (full suite, not just `CabinetBox.test.tsx`) — confirms the additive change is genuinely non-breaking for `Button` and every other real consumer.
- [x] `CabinetBox` accepts `boxHeight`/optional `children` (verified by its own test suite) with zero other file in the app referencing either yet.
- [ ] Review with human before proceeding.

---

### Phase 2: The real consumer

- [x] **Task 2: `Toggle` — wired through `CabinetBox`**

  **Description:** Replace `src/components/ui/controls/Toggle.tsx` per spec §4's full replacement: delete `Switch.Thumb`, render `<CabinetBox popped={value} boxHeight={CABINET_TOGGLE_BOX_SIZE} timelineKey={\`cabinet-toggle-${schema.id}\`} />` (no `children`) as `Switch.Root`'s only child; export `CABINET_TOGGLE_BOX_SIZE = 32`; apply `--cabinet-toggle-box-size` as an inline style on `Switch.Root` (spec §1.2 — one JS source for the fixed size, read by both the `boxHeight` prop and the CSS width/height override, not two independently hand-typed `32`s). `popped` is `value` unconditionally — no `!disabled` guard (spec §1.4, a deliberate departure from `Button`'s own rule, reasoned through explicitly there). Replace `Toggle.css` per spec §4: delete the pill-track background/`[data-state='checked']` color rule, `.sc-toggle__thumb`, and the component-local `prefers-reduced-motion` block entirely (`CabinetBox` already owns all of this); add `.sc-toggle__root { width: fit-content; ... }` (mirroring `Button.css`'s own `.sc-button` transparent-click-target rule) and the scoped `.sc-toggle__root .sc-cabinet-box__front` size override. Extend `Toggle.test.tsx` with the 6 new cases from spec §5 — every existing test in the current file stays unchanged and passing.

  **Acceptance criteria:**
  - [x] Every existing `Toggle.test.tsx` assertion (all 10 cases: `aria-checked` both values, controlled-no-internal-state, `onChange(!value)` on click, `DualLabel` rendering, `isActive` class present/absent, accessible-name fallback, not-disabled-by-default, disabled attribute, no `onChange` when disabled while clicked) still passes unmodified.
  - [x] `CabinetBox` receives `popped="true"` when `value` is `true`, `"false"` when `value` is `false`.
  - [x] `CabinetBox` receives `boxHeight={32}` (`CABINET_TOGGLE_BOX_SIZE`) regardless of any `matchMedia` stubbing — proves the size isn't accidentally breakpoint-derived.
  - [x] `CabinetBox` receives `timelineKey={\`cabinet-toggle-${schema.id}\`}` — distinct from `Button`'s own `cabinet-button-` prefix.
  - [x] `popped` stays `"true"` when `value` is `true` **and** `disabled` is also `true` (spec §1.4's resolved-by-reasoning decision, directly exercised so a future change to it fails a named test).
  - [x] No `.sc-toggle__thumb` element exists anywhere in the rendered output (guards against silently reintroducing the deleted pill/thumb markup).
  - [x] `ToggleSchema`/`ControlSchema` are untouched — `git diff src/types/controls.ts` is empty for this task.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Toggle.test.tsx` passes (17/17 — the existing 10 plus 6 new cases; §5 anticipated 16, one extra "popped=false" case was added alongside "popped=true" for direct symmetry), mocking `CabinetBox` directly (`vi.mock('./CabinetBox', ...)`, rendering `data-popped`/`data-box-height`/`data-timeline-key`), mirroring `Button.test.tsx`'s own precedent of keeping this file's assertions about `Toggle`'s own event-to-prop logic isolated from `CabinetBox`'s already-proven internals (Task 1 / 11.1.1). Confirmed all 6 new tests were genuinely RED first (mock `CabinetBox` absent from the rendered output; the old `.sc-toggle__thumb` present) before the implementation change.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm run build` clean.
  - [x] Full suite (`npm test`) re-confirmed clean: 118 files, 1929 tests — including `StepperWithToggle.test.tsx` (unmodified, composes `Toggle` internally) and `PingControlsDrawer.test.tsx` (the one real `Toggle` consumer's own test file), both unmocked against the real `Toggle`. One unrelated flaky failure on the first full-suite run (`audioSwells.test.ts`), confirmed pre-existing and unrelated by re-running it in isolation (65/65 clean) and re-running the full suite (clean on the second pass) — same non-issue pattern 11.1.1's own Task 6 checkpoint already recorded once.
  - [x] **Manual check completed — by Crawford, directly against the running app (Chrome, `npm run dev`)**, not via automated browser tooling (none was configured in the implementing session). Reached via Robot Selection → a robot → Ping Controls → Phrasing panel (the toggle only renders under `DEV_TUNING`). **Found and fixed one real issue not anticipated by the spec:** clicking the box parked a blinking text caret on it — Chrome's "Navigate pages with a text cursor" mode looks for the nearest text node, finds none inside the bare box, and reads as "this is editable text." Fixed with `user-select: none` on `.sc-toggle__root`, mirroring the sliders' own existing precedent for the same reason (`SliderLinear.css`/`SliderLog.css`/`SliderCenteredZero.css`'s own `.sc-slider-*__root` rule) — Toggle is just the first non-slider control whose box has no real text of its own to make the issue obvious. **Noticed but not fixed: `Button` may have the same latent issue** (it has real label text inside its box, so the failure mode may be less visible, but it was never actually checked) — flagged for Crawford, out of this task's scope to fix unilaterally. Every other item checked clean: flat 32×32px box at rest, full pop with the same protrusion/glow as a `Button`, keyboard toggling and focus ring both work, transition snaps under "reduce motion."

  **Dependencies:** Task 1.

  **Files:** `src/components/ui/controls/Toggle.tsx`, `src/components/ui/controls/Toggle.css`, `src/components/ui/controls/Toggle.test.tsx`

  **Estimated scope:** S (3 files, mechanical wiring against an already-proven `CabinetBox`, same shape as 11.1.1's own `Button` task)

### Checkpoint: Toggle ships — first visible change
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (118 files, 1929 tests, after confirming one first-run failure was the pre-existing `audioSwells.test.ts` flake, unrelated to this change).
- [x] The one real `Toggle` call site in the app (`PingControlsDrawer.tsx`'s Click Track Active toggle) renders through `CabinetBox` with no call-site changes required — confirmed by `npm run build:types` alone surfacing nothing, since `Toggle`'s props contract didn't change.
- [x] **Manual check completed against the real running app (Chrome) — found and fixed a real bug** (the caret-browsing text cursor, see Task 2's own verification notes) not anticipated by the spec. Every other visual/behavioral point checked clean.
- [x] Reviewed with Crawford — confirmed good as shipped: the disabled+checked `popped` behavior (spec §1.4/§7 item 1) reads correctly, and `Button`'s own possible latent `user-select` issue is left alone (not reported, not fixed).

---

### Phase 3: Docs

- [x] **Task 3: `docs/COMPONENT_LIBRARY.md` — Toggle's internal rendering note**

  **Description:** Add a short note under `Toggle`'s row (mirroring `Button`'s own note from 11.1.1) — its internal rendering changed (cabinet SVG/GSAP box instead of a pill track + sliding thumb) while its `ControlSchema`/props contract stayed byte-for-byte identical, per spec §6.

  **Acceptance criteria:**
  - [x] `docs/COMPONENT_LIBRARY.md` documents that `Toggle` now renders through `CabinetBox` internally, with its props contract unchanged.
  - [x] The note is spot-checked against `Toggle.tsx`'s actual shipped code (Task 2), not the spec's draft — the documented props shape (`{ schema: ToggleSchema; value: boolean; onChange: (value: boolean) => void; disabled?: boolean }`) matches `Toggle.tsx`'s `ToggleProps` interface exactly.

  **Verification:**
  - [x] Manual review — spot-checked directly against the shipped `Toggle.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean (docs-only change).

  **Dependencies:** Task 2.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm run build` all clean; `npm test` full suite passes (118 files, 1929 tests).
- [x] All acceptance criteria across all 3 tasks are met. Task 2's manual check is now complete (done directly by Crawford in Chrome, not via automated browser tooling — none is configured in this environment) — see Task 2's own verification notes for what it found.
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped feature.
- [x] **Post-ship fix, found during the manual check, not anticipated by the original spec/tasks:** Chrome's "Navigate pages with a text cursor" mode parked a blinking caret on the bare toggle box on click. Fixed with `user-select: none` on `.sc-toggle__root`, mirroring the sliders' own existing precedent for the same reason. Shipped as its own commit, verified (lint/full suite) same as every other change here.
- [x] Ready for PR — reviewed and confirmed good by Crawford (Phase 2 checkpoint). No open items remain.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The disabled+checked `popped` behavior (spec §1.4) was resolved by reasoning during Specify, not directly interviewed — Crawford may actually want "disabled toggles always render flat," matching `Button`'s literal rule | Low–Medium — a one-line change (`popped={!disabled && value}` vs. `popped={value}`) if wrong, but a visible behavior difference from what's shipped | Task 2's acceptance criteria pin the current decision to a named, explicit test (not an incidental side effect) specifically so it's easy to spot and flip in review; the Phase 2 checkpoint calls this out by name for human review before merge |
| `CabinetBox`'s `boxHeight` override (Task 1) is a small API surface change to an already-shipped, `Button`-proven component — a mistake here risks a regression in `Button`, not just `Toggle` | Low — both new props are optional and additive, and Task 1's own acceptance criteria explicitly require `Button`'s call site and full existing `CabinetBox.test.tsx` suite to stay unmodified and passing | Task 1 is its own task/checkpoint, shipped and full-suite-verified *before* `Toggle` (Task 2) starts depending on it — isolates any regression to Task 1 alone, same "component before consumer" sequencing 11.1.1 used for the same reason |
| `StepperWithToggle` composes `Toggle` internally but has no live consumer today — a regression there wouldn't be caught by any real user-facing check | Low — no live consumer means no production impact even if missed | `StepperWithToggle.test.tsx`'s own existing suite is explicitly named in Task 2's verification steps as must-stay-passing, unmocked, so a regression is still caught by CI/local test runs even without a real consumer to notice it manually |

## Open Questions

Resolved during Plan (not left open):

- ~~Does `CabinetBox`'s additive change need its own phase, or can it be folded into the `Toggle` task?~~ **Resolved: separate task/phase**, mirroring 11.1.1's own "component before consumer" split (`CabinetBox` before `Button`) for the same risk-isolation reason.
- ~~Does the docs task depend on both tasks, or just one?~~ **Resolved: Task 3 depends only on Task 2** — `CabinetBox`'s additive props aren't independently documented (an internal implementation detail, not a new public capability), only `Toggle`'s consumer-facing behavior is.

Carried forward from spec §7, not blocking this plan:

1. **The disabled+checked `popped` decision** (spec §1.4/§7 item 1) — resolved by reasoning, not directly interviewed. Flagged above in Risks and at the Phase 2 checkpoint for explicit human review before merge, rather than assumed correct.
2. **Forward note for 11.1.3–11.1.5 (the sliders):** this phase's `CabinetBox` additions (`boxHeight` override, optional `children`) are `Toggle`-driven conveniences on the existing single-box primitive — the sliders build a genuinely different rendering shape (the voxel-track system) and may or may not reuse either addition. Not this plan's concern to resolve; noted so 11.1.3's own plan doesn't assume they carry forward automatically.
