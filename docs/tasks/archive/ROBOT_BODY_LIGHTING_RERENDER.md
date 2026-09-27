# Implementation Plan: RobotBody Lighting Re-render Isolation

Source spec: [docs/specs/ROBOT_BODY_LIGHTING_RERENDER.md](../specs/ROBOT_BODY_LIGHTING_RERENDER.md).
Source backlog item: [docs/todo/backlog.md #22](../todo/backlog.md#22-robotbody-every-robot-re-renders-oncesec-for-daynight-lighting).
One task — the spec's own §1.3 confirms there's no real mechanism fork to size separately from
the fix itself, unlike item 21's multi-task breakdown.

## Overview

Split `RobotBody.tsx`'s single `visual` `useMemo` (currently keyed on `[robot.audioAttributes,
robot.octaveRange, lightnessMultiplier]`) so the lighting-driven color step is no longer inside
the same memo as the audio-derived shape/greeble computation. Confirmed via direct code search
that `lightnessMultiplier` is read in exactly one place (`applyLightnessMultiplier`) and nowhere
else in the pipeline — a pure dependency-array split, no new files.

## Architecture Decisions

- **One task, not several** — the fix is a single, small, well-understood restructure inside one
  file. Splitting it further (e.g. "write the test" / "make the change" as separate tasks) would
  fight the natural TDD red→green cycle rather than help it; per `planning-and-task-breakdown`'s
  own sizing table this is comfortably **S** (1 file + its test, well under the "more than ~5
  files" / "more than one focused session" thresholds that call for a breakdown).
- **Regression test spies on `shapeParamsFromAudio`, not a `robotVisualHelpers.ts`-internal
  self-call** — same cross-module-vs-same-module distinction item 21's Task 4 discovered
  (`vi.spyOn` can't observe a function calling a sibling function defined in the same file under
  this project's Vite/Vitest SSR transform). `shapeParamsFromAudio` is called by `RobotBody.tsx`
  across a real module boundary, so a spy on it is actually observable.

## Dependency Graph

```
Task 1 (RobotBody.tsx split + regression test) — no dependencies, single task
```

## Task List

- [x] **Task 1: Split `visual` into `audioVisual` (memoized) + `colors` (per-render)**

  **Description:** `RobotBody.tsx`'s `visual` `useMemo` becomes `audioVisual`, dependency array
  narrowed to `[robot.audioAttributes, robot.octaveRange]` (drops `lightnessMultiplier`).
  Returns `baseColors` (the pre-lightness `generateColors` output) instead of `colors`.
  `applyLightnessMultiplier(audioVisual.baseColors, lightnessMultiplier)` moves outside the
  memo, computed fresh every render. No other logic inside the memo changes. Spec §1.2.

  **Acceptance criteria:**
  - [x] Every existing `RobotBody.test.tsx` test (day/night color varies without
        `ignoreDaylight`; frozen with `ignoreDaylight`; battery dim independent of
        `ignoreDaylight`) passes unmodified, byte-for-byte.
  - [x] **The regression test the fix is for:** a new test spies on `shapeParamsFromAudio`
        (`robotVisualHelpers.ts`), renders a `RobotBody`, records the call count at mount, then
        fires 3 `act(() => useUIStore.getState().setActiveLocaleLocalTime(...))` calls with
        different values on the same mounted instance, and asserts the call count is unchanged
        from the post-mount value. Confirmed red first (1 call at mount → 4 after 3 ticks
        against pre-fix code), then green (stays at 1).
  - [x] `audioVisual`'s dependency array contains no `activeLocaleLocalTime`-derived value —
        narrowed to `[robot.audioAttributes, robot.octaveRange]`.
  - [x] `colors` (the final, lightness-adjusted value passed to `<Component colors={colors}
        .../>`) still updates every render/tick — covered by the existing "regression guard:
        without ignoreDaylight, color still varies" test, passing unmodified against the new
        code path.

  **Verification:**
  - [x] `npx vitest run src/components/robot/RobotBody.test.tsx` passes (4 tests — 3
        pre-existing + 1 new regression test).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] `npm test` (full suite, 143 files / 2579 tests) passes.
  - [x] `npm run build` succeeds (pre-existing chunk-size warning only, unrelated).

  **Dependencies:** None.

  **Files:** `src/components/robot/RobotBody.tsx`, `src/components/robot/RobotBody.test.tsx`

  **Estimated scope:** S (1 file + its test; small, well-understood dependency-array split)

### Checkpoint: Complete

- [x] `npm run build:types`, `npm run lint`, `npm test` (143/143, 2579/2579), `npm run build`
      all clean.
- [x] The regression spy test is green against the new code and was confirmed red against the
      old code.
- [x] `docs/todo/backlog.md` item 22 marked fixed, linking this plan and the spec.
- [ ] Live profiler re-check — genuinely deferred, same category as items 21/23's own deferred
      manual verification (no live browser with React DevTools available in this session).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Regression spy test written loosely enough to pass without the fix (false green) | Medium — the one test proving the bug is fixed silently doesn't | Acceptance criteria explicitly require confirming red against pre-fix code first |
| Spying on a same-module internal reference again (the exact mistake made once already in item 21 Task 4) | Low — would just mean 0 calls observed either way, an obviously-wrong signal, easy to catch | Task explicitly names `shapeParamsFromAudio` (a real cross-module call) as the spy target, with the reasoning written into both the spec and this plan so it isn't re-discovered the hard way |

## Open Questions

None — spec §7 confirms no unresolved judgment calls for this item.
