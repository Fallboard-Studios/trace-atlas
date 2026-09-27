# Spec: useGSAP Migration

## Objective
CLAUDE.md's animation rule reads: "Use `useGSAP` in components and store references in
`timelineMap`." In practice only 2 of 7 GSAP-touching components (`PowerRockerSwitch.tsx`,
`BubbleStream.tsx`) actually call `useGSAP`; the rest (`RobotFilterPanel.tsx`, `CabinetBox.tsx`,
`AccordionContainer.tsx`, `Robot.tsx`, `useLfoTargetGroup.ts`) create GSAP tweens/timelines
directly inside plain `useEffect`/`useLayoutEffect`, relying entirely on manual
`killTimeline()` calls for cleanup. That manual pattern is not currently leaking (each file
kills its own timeline key on unmount), so this migration is not a bugfix — it's closing the
gap between the documented rule and the code, and picking up what `useGSAP` gives for free:
- Automatic revert of every GSAP side effect created inside its callback (or via `contextSafe`)
  on unmount — a safety net that doesn't depend on a developer remembering a manual
  `killTimeline` call the next time this code is touched (exactly the bug just fixed in
  `PowerRockerSwitch.tsx`).
- Correct behavior under React 18 Strict Mode's mount→unmount→remount double-invoke, which
  `useGSAP` is built to handle and raw `useEffect` + imperative GSAP calls are not guaranteed to.
- One consistent authoring pattern across the codebase instead of two.

`timelineMap` stays exactly as it is — `setTimeline`/`killTimeline`/`getTimeline` remain the
addressable registry other code reads from (e.g. `BubbleStream`'s separate play/pause effect
does `timelineMap.get(...)`). This migration only changes *which React primitive* creates and
owns the GSAP side effects that get registered into it.

## Non-goals
- No visual/behavioral change. Every animation's timing, easing, and sequencing stays identical.
- No change to `timelineMap.ts`, `swimAnimation.ts`, or the non-React system modules
  (`interactionSystem.ts`, `idleSystem.ts`) — they're plain TS modules outside React and
  correctly don't use a React hook.
- No change to `PowerRockerSwitch.tsx` or `BubbleStream.tsx` — already the target pattern.

## Target pattern
Match `BubbleStream.tsx`'s existing shape, which already does this correctly:

```ts
useGSAP(() => {
  // ...build tl...
  setTimeline(key, tl);
  return () => killTimeline(key);
}, { dependencies: [...], scope: someRef /* only if selector-querying descendants */ });
```

For GSAP calls triggered from an event handler (a click, a store-driven effect) rather than
from `useGSAP`'s own dependency-driven callback, wrap the handler with the `contextSafe`
function `useGSAP` returns, per GSAP's own React guidance for animations created outside the
hook's callback:

```ts
const { contextSafe } = useGSAP({ scope, dependencies: [] }); // no mount-time animation needed
const animateTo = contextSafe((nextOpen: boolean) => {
  killTimeline(key); // still dedup a re-trigger, same as today
  const tl = gsap.timeline();
  // ...
  setTimeline(key, tl);
});
```

`killTimeline(key)` calls stay in place everywhere they are today (both the dedup-on-retrigger
calls at the top of each animate function, and any explicit unmount cleanup) — `contextSafe`
and dependency-array reverts are an added safety net, not a replacement for keeping
`timelineMap` itself tidy.

## Per-file plan

1. **`src/components/robot/Robot.tsx`** — the mount-time `useLayoutEffect` that does
   `setRef`/`gsap.set`/`handleRobotIdle` and returns `deleteRef` becomes `useGSAP` with
   `{ scope: ref, dependencies: [robotId] }`, same dependency array and same returned cleanup.
   Straight swap, no logic change — `useGSAP` behaves like `useLayoutEffect` under the hood, so
   the "no single frame at (0,0)" requirement in the existing comment still holds.

2. **`src/components/actors/BubbleStream.tsx`** — no change (reference pattern).

3. **`src/components/panels/screen/console/RobotFilterPanel.tsx`** — the mount-only
   `gsap.set(panelRef.current, { xPercent: -100 })` effect moves into a `useGSAP(() => {...},
   { scope: panelRef, dependencies: [isDesktop] })`. `animateTo()` (called from `handleToggle`
   and the selection-change effect) is wrapped in `contextSafe` from that same hook call.

4. **`src/components/ui/controls/CabinetBox.tsx`** — two GSAP effects exist:
   - The one-time skew `useEffect` (mount-only, sets `skewX`/`skewY`) becomes
     `useGSAP(() => {...}, { scope: wrapperRef, dependencies: [] })`.
   - The geometry effect (re-runs on `[poppedT, width, boxHeight, timelineKey,
     resolvedPopDistance, skipMountAnimation]`) becomes a second `useGSAP` call with that same
     dependency array and `scope: wrapperRef`; the `prevPoppedRef` bookkeeping and all branching
     logic are unchanged, only the wrapping hook changes.
   - The ResizeObserver effect is untouched — it has nothing to do with GSAP.

5. **`src/components/ui/controls/AccordionContainer.tsx`** — the `defaultOpen` mount effect is
   plain DOM style writes, not GSAP; left as a normal `useEffect`. `animateTo()` (called from
   `handleValueChange`) is wrapped in `contextSafe` from a `useGSAP({ dependencies: [] })` call
   (no `scope` needed — every element `animateTo` touches is passed by ref directly, not
   selector-queried).

6. **`src/components/ui/controls/useLfoTargetGroup.ts`** — `select()`'s `gsap.timeline(...)`
   is wrapped in `contextSafe` from a `useGSAP({ dependencies: [] })` call (no scope — this hook
   has no DOM ref at all, it only ever builds a bookkeeping timeline for the transition delay).

The standalone `useEffect(() => () => killTimeline(key), [key])` cleanup that exists purely to
kill the timeline on unmount is **kept in every file, unchanged** — `useGSAP`'s own
`context.revert()` only kills the underlying GSAP tween/timeline object it tracked; it has no
knowledge of our separate `timelineMap` registry, so nothing else keeps that registry itself
tidy on unmount. `contextSafe`/scoped-context reverts are an added safety net on top of this,
never a replacement for it. (Caught live during implementation: removing this cleanup from
`AccordionContainer.tsx` broke its own "kills its GSAP timeline on unmount" test; the equivalent
removal from `RobotFilterPanel.tsx`/`CabinetBox.tsx` passed their tests anyway, but only because
each file's shared `timelineMap` mock happened to already have a call recorded from an unrelated
nested component in the same render tree — a false pass, not a real signal. Restored in all
three.)

## Tech stack
No change: React 19, TypeScript 5.9, GSAP 3 + `@gsap/react`'s `useGSAP`, Vitest + Testing Library.

## Commands
- Type-check: `npm run build:types`
- Test: `npm test`
- Lint: `npm run lint`

## Testing strategy
No new tests are needed — this is a refactor preserving existing behavior exactly. Each touched
file already has a test suite (`RobotFilterPanel.test.tsx`, `CabinetBox.test.tsx`,
`AccordionContainer.test.tsx` [via its own or a consumer test], `useLfoTargetGroup.test.ts`) that
exercises the animation-triggering interactions; the migration's own success bar is: **all
existing tests for these 5 files continue to pass unmodified**, plus `npm run build:types` and
`npm run lint` stay clean. If any existing test needs a change to keep passing, that's a signal
this migration accidentally changed behavior — stop and investigate rather than adjust the test.

## Boundaries
- **Always:** run type-check + the touched file's own test suite after each file's conversion,
  before moving to the next file.
- **Ask first:** if converting any file surfaces a real behavior difference (not just a
  different-shaped hook) — e.g., dependency-array timing changes when something animates.
- **Never:** change `timelineMap.ts`'s public API, or touch the non-React system modules.

## Implementation notes (found live)
- The `react-hooks/refs` ESLint rule can flag a `contextSafe(() => { if (!ref.current) ... })`
  call as "accessing a ref during render," since it can't statically see that `contextSafe`
  returns a wrapper without invoking it. Where this fired (`PowerRockerSwitch.tsx`), it's a false
  positive — the ref is only read once the wrapper is later called from a real event handler —
  and was silenced with a same-line `eslint-disable-next-line react-hooks/refs` plus a comment
  explaining why. It didn't fire on the other 3 `contextSafe` call sites in this migration; no
  general pattern change needed, just watch for it per-file.

## Success criteria
- All 5 files use `useGSAP` (directly or via `contextSafe`) for every GSAP call they make.
- `timelineMap` registration (`setTimeline`/`killTimeline`) is unchanged in behavior/keys.
- `npm run build:types`, `npm run lint`, and `npm test` all pass with no test changes required.
- No visual/behavioral regression (verified by the existing test suites, since these are
  jsdom/Vitest environments without a real GSAP ticker — timing correctness is already covered
  by those tests today).

## Open questions
None — this is a mechanical, well-scoped refactor of an already-understood pattern.
