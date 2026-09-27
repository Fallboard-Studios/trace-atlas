# Phase Spec: RobotBody Lighting Re-render Isolation

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/todo/backlog.md #22](../todo/backlog.md#22-robotbody-every-robot-re-renders-oncesec-for-daynight-lighting)
("RobotBody: Every Robot Re-renders Once/Sec for Day/Night Lighting", filed 2026-09-14 during
the item 21 spec pass). Same bug class as item 21
([docs/specs/FACTORY_LIGHTING_RERENDER.md](FACTORY_LIGHTING_RERENDER.md)) — the once/sec
`activeLocaleLocalTime` UI tick forces more recomputation than the lighting change actually
needs — but a much smaller fix: one component, one `useMemo`, no registries, no multi-file
split. Not a Crawford feature request; no paired `docs/intent/*.md`.

---

## 1. Overview & Claude Explanation

### 1.1 The actual cost — smaller than item 21's, confirmed by re-reading the code

`RobotBody.tsx:52-55` derives `lightnessMultiplier` from `useUIStore((s) =>
s.activeLocaleLocalTime ?? 12)`. The `visual` `useMemo` (`RobotBody.tsx:61-130`) depends on
`[robot.audioAttributes, robot.octaveRange, lightnessMultiplier]` — folding the tick into the
same memo as everything else means the whole block re-runs every second.

**Re-checked directly against `robotVisualHelpers.ts`/`robotVisualMapper.ts` for this spec:**
`lightnessMultiplier` is read in exactly **one** place inside that memo —
`applyLightnessMultiplier(baseColors, lightnessMultiplier)` — a cheap function (3 regex parses
+ 3 template-string rebuilds on 3 short HSL strings). Every other computation inside the memo
(`selectRobotShape`, `shapeParamsFromAudio`, `calculateScale`, `calculateDetailLevel`,
`calculateGreebleCount`/`Size`/`Persistence`/`PlacementBias`, `mapVisualAudioToProps`,
`generateColors` itself for the *base* colors) depends only on `robot.audioAttributes`/
`robot.octaveRange` — confirmed via a direct search: neither `robotVisualHelpers.ts` nor
`robotVisualMapper.ts` reads `lightnessMultiplier` or `activeLocaleLocalTime` anywhere. Unlike
item 21, there's no seeded-PRNG geometry generation happening here at all — this is closed-form
math on a handful of ADSR/filter numbers, so the *absolute* per-call cost is smaller than
Factory's window-grid loops. It's still real, unnecessary, continuous work for all 12 robots,
every second, indefinitely, for as long as the world view is open — and, per the backlog's own
framing, the same *architectural* bug (a lighting-tick value coarsening a memo's dependency
array to force full recomputation of otherwise-static-per-spawn work).

### 1.2 The fix: split the memo by dependency, nothing more

No registries, no layout/paint split, no new files — this is genuinely a one-`useMemo` split:

```typescript
// RobotBody.tsx — MODIFIED
export const RobotBody = memo(function RobotBody({ robot, ignoreDaylight }: RobotBodyProps) {
  const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
  const lightnessMultiplier = ignoreDaylight
    ? 1
    : 0.5 + 0.5 * Math.sin(((localTime - 6) / 24) * Math.PI * 2);

  const dimOpacity = computeBatteryDimOpacity(robot.batteryLevel);

  // Everything audio-derived — no lightnessMultiplier anywhere in this memo or its deps.
  const audioVisual = useMemo(() => {
    const { adsr, filterFreq, visualAudioMap } = robot.audioAttributes;
    const octaveRange = robot.audioAttributes.octaveRange ?? robot.octaveRange;
    const layerType = robot.audioAttributes.layers?.[0]?.type;
    const waveform = layerType ?? robot.audioAttributes.waveform;
    const attrsForColor = { ...robot.audioAttributes, waveform } as AudioAttributes;

    const baseColors = generateColors(attrsForColor); // was: colors = applyLightnessMultiplier(...) — moved out
    const mapped = mapVisualAudioToProps(visualAudioMap);

    /* ...unchanged shapeParams/microVariants/greeble* derivation... */

    return {
      Component: selectRobotShape(waveform),
      baseColors, // NEW — was `colors`, lightness applied below instead
      scale: calculateScale(octaveRange),
      detailLevel: detail,
      shapeParams,
      microVariants,
      greebleCount,
      greebleSize,
      greeblePersistence,
      greeblePlacementBias,
      lightsProps: mapped.lightsProps,
    };
  }, [robot.audioAttributes, robot.octaveRange]) as { /* ...same shape, baseColors: RobotColors instead of colors... */ };

  // Cheap — recomputed every render/tick, same as Factory.tsx's own body/belt fills.
  const colors = applyLightnessMultiplier(audioVisual.baseColors, lightnessMultiplier);

  const { Component, scale, detailLevel, shapeParams, microVariants, greebleCount, greebleSize, greeblePersistence, greeblePlacementBias } = audioVisual;

  return (
    <Component colors={colors} scale={scale} detailLevel={detailLevel} shapeParams={shapeParams}
      microVariants={microVariants} greebleCount={greebleCount} greebleSize={greebleSize}
      greeblePersistence={greeblePersistence} greeblePlacementBias={greeblePlacementBias}
      dimOpacity={dimOpacity} />
  );
});
```

No other file changes. `generateColors`, `applyLightnessMultiplier`, and every other
`robotVisualHelpers.ts`/`robotVisualMapper.ts` export keep their exact current signatures —
this is purely a call-site restructure inside `RobotBody.tsx`.

### 1.3 No judgment calls requiring sign-off

Unlike item 21 (§7.1/§7.2 of that spec), there's no real mechanism fork here to confirm before
starting: the dependency-driven `useMemo` split is the obviously-correct, smallest fix, and the
backlog's own "not yet determined" language was hedging against a *bigger* split turning out to
be necessary — re-reading the code for this spec confirmed it isn't. Nothing here contradicts
CLAUDE.md's guardrails (no synths, timelines, refs, or non-serialisable state touched; no
`setInterval`/`requestAnimationFrame` introduced).

---

## 2. Target File Structure

```text
src/
└── components/
    └── robot/
        ├── RobotBody.tsx        # MODIFIED — §1.2
        └── RobotBody.test.tsx   # MODIFIED — new regression test (§5); existing 3 tests untouched
```

**Explicitly not touched, and why:**

- `robotVisualHelpers.ts` / `robotVisualMapper.ts` — every function keeps its exact current
  signature and behavior; confirmed neither reads `lightnessMultiplier`/`activeLocaleLocalTime`
  (§1.1). `generateColors` returns *base* colors regardless — `RobotBody.tsx` already applies
  the lightness multiplier as a separate step today, just inside the wrong memo.
- `RobotSleek.tsx`/`RobotAngular.tsx`/`RobotOrganic.tsx`/`RobotIndustrial.tsx` (the 4
  `RobotSVGComponent` shape renderers) — already `React.memo`-wrapped (confirmed via a repo
  search this session), already receive `colors` as a prop; unaffected by where `colors` gets
  computed on the parent side.
- `computeBatteryDimOpacity`/`dimOpacity` — already outside the `visual` memo today (a separate,
  non-audio, non-lighting signal); untouched.
- `Robot.tsx` (the actor wrapper that renders `RobotBody`) — no prop contract change.

No new dependency. No `uiStore.ts` change.

---

## 3. Implementation Boundaries & Constraints

- **Strict Scope:** Touch only the files listed in §2.
- **Zero visual regression:** for a given `(robot, activeLocaleLocalTime, ignoreDaylight)`
  tuple, rendered output must be byte-identical to today's. This is a pure performance
  refactor — `RobotBody.test.tsx`'s existing 3 tests (day/night color varies;
  `ignoreDaylight` freezes it; battery dim is independent of `ignoreDaylight`) must pass
  unmodified.
- **Per CLAUDE.md:** no `setTimeout`/`setInterval`/`requestAnimationFrame` introduced (none
  needed). No GSAP touched. No Zustand state shape change.
- **Melody/robot-lifecycle guardrails are not implicated** — this touches only the visual
  color pipeline, nothing in `docs/ROBOT_LIFECYCLE.md`/`docs/MELODY_SYSTEM.md` territory.

---

## 4. Code Style & Architecture Conventions

Full code shown in §1.2. Naming: `audioVisual` (was `visual`) — reflects that it's now
genuinely audio-only, not "the whole visual bundle." `baseColors` (was the intermediate local
`baseColors` already used inside the memo, now also the field name on the returned object,
replacing `colors`) — signals "not yet lightness-adjusted" at the point of use.

---

## 5. Testing & Verification Requirements

- **Framework:** Vitest + React Testing Library. `RobotBody.tsx` renders plain SVG shape
  components with no GSAP involvement — unlike `BubbleStream` (item 23), direct rendering in
  tests is safe and already the established pattern in `RobotBody.test.tsx`.
- **Existing tests (unmodified):** the 3 tests in `RobotBody.test.tsx` (regression guard, day/
  night varies; `ignoreDaylight` freezes it; battery dim independent of `ignoreDaylight`) must
  keep passing exactly as written.
- **New regression test — the one this fix is for:** spy on a function called only inside
  `audioVisual` and only reachable across a real module boundary (`RobotBody.tsx` imports from
  `robotVisualHelpers.ts`/`robotVisualMapper.ts`) — `shapeParamsFromAudio` is a good candidate
  (cross-module, currently unmemoized, not used anywhere else in the render path). Per item 21's
  own Task 4 finding, do **not** spy on a function `robotVisualHelpers.ts` calls internally on
  itself (same-module references aren't observable via `vi.spyOn` under this project's Vite/
  Vitest SSR transform — confirmed directly there, applies equally here). Assert the spy's call
  count stays flat across multiple `act(() => useUIStore.getState().setActiveLocaleLocalTime(...))`
  calls on an already-mounted `RobotBody`, after an initial non-zero count at mount. Must be
  confirmed red against pre-fix code before treating it as done (same discipline as item 21
  Task 4).
* **Verification Steps:**
  1. `npx vitest run src/components/robot/RobotBody.test.tsx` passes.
  2. `npm run build:types` — zero TypeScript errors.
  3. `npm run lint` — zero ESLint errors.
  4. `npm test` — full suite passes.
  5. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated, same caveat as item 21's Task 5):** re-profiling in a live
  browser with React DevTools needs Crawford or a future session with one — not performed as
  part of this spec/implementation.

---

## 6. Documentation & Git/Workflow Context

- **Branch:** `refactor/factory-timing` (same branch item 21/23 landed on).
- **Commit Pattern:** Given the small scope, one implementation commit (test + fix together,
  TDD red→green) is reasonable rather than a multi-task breakdown the size of item 21's — sized
  in the task file per `planning-and-task-breakdown`.
- **`docs/todo/backlog.md` item 22:** mark fixed once implemented and verified, linking this
  spec (matching item 23's same-session found→fixed precedent).

---

## 7. Open Questions & Risks

None blocking. The one thing genuinely deferred is the live profiler re-check (§5's manual
check), same category as items 21/23's own deferred live-verification steps.
