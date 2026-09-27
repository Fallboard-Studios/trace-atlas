# Implementation Plan: SliderLinear Read-Only Mode

Source spec: [docs/specs/SLIDER_LINEAR_READ_ONLY.md](../specs/SLIDER_LINEAR_READ_ONLY.md). Source intent: [docs/intent/slider-linear-read-only.md](../intent/slider-linear-read-only.md). Pure presentational addition to one primitive — no `SliderLinearSchema` change, no Zustand change, no `AudioEngine`/`BeatClock` involvement, and no existing consumer's behavior changes (`readOnly` omitted or `false` renders byte-for-byte identical output to today, per spec §3).

## Overview

Add an optional `readOnly` prop to `SliderLinear` that renders a second, non-interactive branch: the same `DualLabel` + `VoxelTrack` fill + value-label visual as the interactive slider, but `role="status"`, no `Slider.Root`/`Track`/`Thumb`, not a tab stop, no drag/keyboard interaction. Two tasks: the component change itself (with its own colocated tests), then the docs update recording the new contract.

## Architecture Decisions

- **One component, one branch — no new sibling component, no discriminated prop type** (spec §1.2/§4). `readOnly` short-circuits before any Radix element renders; `onChange` stays required in all modes.
- **No `aria-label` composition** (spec §1.4). The read-only branch relies on `role="status"`'s live-region behavior plus its own already-visible `DualLabel`/value text for the accessible name, rather than the intent doc's originally-worded "compose an `aria-label`" approach — avoids double-announcing the same label/value, since (unlike `AudioStatusBadge`) this element already renders real visible text.
- **`readOnly` takes precedence over `disabled`** when both are passed (spec §1.5) — locked in as its own acceptance criterion in Task 1 below, not left as an untested implicit behavior.
- **`data-readonly="true"` is a plain inspection/test hook, not a new styling variant** (spec §4) — the one new CSS rule it drives (`cursor: default`) is cosmetic only; every other rule in `SliderLinear.css` already applies unchanged via the shared `data-orientation` attribute.
- **Docs land last (Task 2)**, once the shipped prop's final shape is real and spot-checkable — same "docs land last" precedent [docs/tasks/LFO_CONSOLIDATED_DISPLAY.md](LFO_CONSOLIDATED_DISPLAY.md) set.
- **No task split between "add the prop" and "add its tests."** The entire spec is one coherent behavior change across 3 already-colocated files (`.tsx`/`.css`/`.test.tsx`) — splitting further would produce a task with no independent verification value of its own, contrary to this skill's vertical-slicing guidance.

## Dependency Graph

```
Task 1 (SliderLinear.tsx/.css/.test.tsx — the readOnly prop + branch)
    │
    └──→ Task 2 (docs/COMPONENT_LIBRARY.md)
```

## Task List

### Phase 1: Implementation

- [x] **Task 1: `readOnly` prop + non-interactive render branch**

  **Description:** In `src/components/ui/controls/SliderLinear.tsx`, add `readOnly?: boolean` to `SliderLinearProps`. The shared setup (`wrapperRef`, resolved `orientation`, `useVoxelTrackSlider`'s `boxSize`/`gap`/`boxCount`/`rootStyle`, `computeVoxelBoxStates`, the `valueLabel` element) stays exactly as today and feeds both branches unchanged (spec §1.3) — none of it is Radix-specific. When `readOnly` is `true`, return the plain `<div role="status" data-readonly="true">` tree from spec §4 (the same `DualLabel` + orientation-ordered value label + a plain root/track `<div>` pair wrapping `VoxelTrack`, `data-orientation` set manually) instead of the existing `Slider.Root`/`Track`/`Range`/`Thumb` markup; `readOnly` takes precedence over `disabled` (spec §1.5 — when both are passed, the read-only branch renders regardless). Add the one new CSS rule to `SliderLinear.css`:
  ```css
  .sc-slider-linear[data-readonly='true'] {
    cursor: default;
  }
  ```
  Extend `SliderLinear.test.tsx` with the new `describe('readOnly')` block from spec §5, alongside every existing test left untouched.

  **Acceptance criteria:**
  - [x] `SliderLinearProps` includes `readOnly?: boolean`; every existing call site (none pass it today) is unaffected — omitted/`false` renders byte-for-byte identical output to before this task.
  - [x] `readOnly={true}` renders `role="status"` and `data-readonly="true"` on the outer wrapper, and renders **no** element with `role="slider"` anywhere (confirms no Radix `Slider.Root`/`Track`/`Thumb` leaks into this branch).
  - [x] The read-only branch shows the same `DualLabel` (lore/human) row and the same formatted `{value}{unit}` text as the interactive branch (including the "no unit" bare-value case), in the same orientation-dependent DOM order (value-before-track when vertical, value-after-track when horizontal) the interactive branch's own tests already assert.
  - [x] The read-only branch renders `VoxelTrack` with `states` computed via the identical `computeVoxelBoxStates(value, schema.min, schema.max, boxCount)` call the interactive branch uses — same colors, same fill, no desaturation or other visual divergence.
  - [x] All three orientations (`horizontal`/`vertical`/`auto`) resolve and size identically between the two branches for the same schema/props (same `rootStyle`/`data-orientation` values).
  - [x] `onChange` is never invoked anywhere in the read-only branch (nothing in that branch's markup can fire it).
  - [x] Passing both `disabled={true}` and `readOnly={true}` produces output identical to `readOnly={true}` alone — no `data-disabled` attribute, no `role="slider"`.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` passes — every pre-existing test unmodified and still green, plus the new `readOnly` block covering every criterion above.
  - [x] `npm run build:types` clean.
  - [x] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/SliderLinear.tsx`, `src/components/ui/controls/SliderLinear.css`, `src/components/ui/controls/SliderLinear.test.tsx`

  **Estimated scope:** S (one component, its own colocated styles/tests, no consumers to update yet)

### Checkpoint: Implementation complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Every pre-existing `SliderLinear.test.tsx` assertion still passes unmodified (proves zero regression to the interactive branch).
- [ ] Review with human before proceeding.

---

### Phase 2: Docs

- [x] **Task 2: `docs/COMPONENT_LIBRARY.md` — document the `readOnly` prop**

  **Description:** Update `SliderLinear`'s prop-table row (currently `{ schema: SliderLinearSchema; value: number; onChange: (value: number) => void; disabled?: boolean; verticalHeight?: number }`) to include `readOnly?: boolean`. Add a short subsection directly after "`SliderLinear`'s Oblique Cabinetry rendering (Roadmap Phase 11.1.3)" — e.g. "`SliderLinear`'s `readOnly` mode (Roadmap Phase 15.1)" — stating that `readOnly` renders `role="status"` with no Radix widget, no thumb, and a visually identical `VoxelTrack` fill: a live readout, not a disabled slider. Point at `docs/specs/SLIDER_LINEAR_READ_ONLY.md` for the full reasoning (spec §1.2, §1.4).

  **Acceptance criteria:**
  - [x] `SliderLinear`'s prop-table row lists `readOnly?: boolean`.
  - [x] The new subsection states the `role="status"`/no-widget-semantics behavior and links to the spec.
  - [x] No claim in the new section is contradicted by Task 1's actual shipped code (spot-check against the final `SliderLinear.tsx`).

  **Verification:**
  - [x] Manual review — every documented detail spot-checked directly against the shipped `SliderLinear.tsx`.
  - [x] `npm run build:types`, `npm run lint` clean (`npm test`/`npm run build` already verified clean at Task 1's checkpoint against the same, unchanged source — docs-only change, no behavioral impact).

  **Dependencies:** Task 1.

  **Files:** `docs/COMPONENT_LIBRARY.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] Both tasks' acceptance criteria met.
- [x] `docs/COMPONENT_LIBRARY.md` reflects the shipped prop.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The no-`aria-label` accessible-name approach (Architecture Decisions; spec §1.4) is a judgment call never itself confirmed via `/interview-me` | Low today — no real consumer exists yet for anyone to hear it read aloud | Spec §7 item 1 already flags this for a real screen-reader check once Roadmap 18 (Cabinetry Accessibility Verification) runs, or sooner once 15.2/15.3 wire up a real consumer |
| No real consumer exists yet, so no manual visual/behavioral check is possible within this plan's own scope | Low — this is a primitive-only change; the first real-world check happens naturally in 15.2 or 15.3 | Noted explicitly in spec §5/§7 item 3 so it isn't mistaken for a skipped step here; not this plan's responsibility to fabricate a throwaway harness |
| `disabled`+`readOnly` passed together has no real caller today | Low | Covered by its own acceptance criterion in Task 1 regardless, so the precedence rule is locked in and tested before any real caller could get it wrong |

## Open Questions

Resolved during Plan (not left open):

- ~~Does this need more than one implementation task?~~ **Resolved: no** — the entire spec touches 3 already-colocated code files with one coherent behavior change; see Architecture Decisions.

Carried forward from spec §7, not blocking this plan:

1. The accessible-name deviation (§1.4) and the no-manual-check note (§5) — both already listed in Risks above; revisit once a real consumer (15.2 or 15.3) exists.
2. `disabled`+`readOnly` precedence (§1.5) — resolved and tested here, but flagged again in case a future consumer finds a real reason to want the opposite precedence.
