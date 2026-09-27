# Phase Spec: Test Coverage for Untested Core Modules (Roadmap Phase 19)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Coverage: `npm run test:coverage`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/test-coverage-core-modules.md](../intent/test-coverage-core-modules.md), confirmed via `/interview-me`, 2026-09-27. Prior art this spec follows directly: `lfoEngine.test.ts`'s `vi.mock('tone', ...)` pattern (the established way this codebase fakes `Tone.LFO`/`Tone.Gain`/`Tone.getContext()` in tests — `lfoDrift.ts`'s own tests reuse it rather than inventing a second Tone-mocking approach); `vitest.setup.ts`'s global GSAP mock (already in place for every test file — `timelineMap.ts`/`swimAnimation.ts` tests run against it, no per-file GSAP mock needed). **Status: not started.**

---

## 1. Overview & Claude Explanation

### 1.1 What this phase is

A pure test-backfill pass across 15 modules the roadmap's Phase 19 flagged as carrying real, currently-unprotected logic (a 16th, `src/systems/collisionSystem.ts`, was removed outright on 2026-09-16 and needs no action; a 17th candidate, `greebleTypes.ts`, is confirmed pure types with zero runtime logic and drops out of scope entirely — verified directly by reading it, not assumed). Every file listed in §3 still exists and still has no test file today (verified directly, 2026-09-27) — nothing here is stale.

**Zero behavior changes.** Every test in this phase asserts what a file *already does*. If test-writing surfaces a real bug, the task stops and reports it rather than silently fixing it in the same commit — matching this repo's own TDD-workflow precedent (stop at gates, report honestly, don't expand scope without asking).

**One spec, one task file — not 15 separate ones.** Every item here is the same kind of work with no per-file design ambiguity, so a per-file intent/spec/task trio would be pure process overhead. The task file (downstream of this spec) is a single flat phase with 12 independent tasks (15 files − 4 robot shape variants + 1 shared task for those four = 12 — §3.4) and one "Checkpoint: Complete" at the end, not five per-group gates — no task here depends on another finishing first.

### 1.2 "Meaningful coverage" bar, confirmed via interview

Per file, "done" means:
1. Tests that specifically exercise whatever risk this phase's own roadmap text (or the file's own doc comments) already names for that file — not a generic call-it-and-snapshot pass.
2. One basic smoke case per exported function/component (typical input, no throw).

**Not** a coverage-percentage target. No coverage gate exists in this repo today (`npm run test:coverage` exists but nothing treats its output as a gate) and this phase does not add one.

---

## 2. Target File Structure

```text
src/engine/
├── lfoDrift.ts                                   # UNCHANGED — test target
├── lfoDrift.test.ts                              # NEW
├── lfoShared.ts                                  # UNCHANGED — test target
└── lfoShared.test.ts                             # NEW

src/utils/
├── getSeededVal.ts                               # UNCHANGED — test target
├── getSeededVal.test.ts                          # NEW
├── refs.ts                                       # UNCHANGED — test target
├── refs.test.ts                                  # NEW
├── helpers.ts                                    # UNCHANGED — test target
└── helpers.test.ts                               # NEW

src/components/ui/controls/
├── sliderLogMath.ts                              # UNCHANGED — test target
├── sliderLogMath.test.ts                         # NEW
├── accordionAnimation.ts                         # UNCHANGED — test target
└── accordionAnimation.test.ts                    # NEW

src/animation/
├── swimAnimation.ts                              # UNCHANGED — test target
├── swimAnimation.test.ts                         # NEW
├── timelineMap.ts                                # UNCHANGED — test target
└── timelineMap.test.ts                           # NEW

src/components/robot/
├── RobotAngular.tsx                              # UNCHANGED — test target
├── RobotIndustrial.tsx                           # UNCHANGED — test target
├── RobotOrganic.tsx                              # UNCHANGED — test target
├── RobotSleek.tsx                                # UNCHANGED — test target
└── robotShapeVariants.test.tsx                   # NEW — one shared parametrized file for all 4

src/components/actors/
├── factoryVariants.ts                            # UNCHANGED — test target
└── factoryVariants.test.ts                       # NEW

src/components/panels/screen/worldView/
├── LocaleView.tsx                                # UNCHANGED — test target
└── LocaleView.test.tsx                           # NEW
```

**Explicitly not touched, and why:**

- `src/components/actors/greebles/greebleTypes.ts` — pure `type`/`interface` exports (`RooftopGreeble`, `FacadeGreeble`, `GreebleRendererContext`, `GreebleElement`, `GreebleRenderer`), zero runtime code. Confirmed by direct read; there is nothing to test.
- `src/systems/collisionSystem.ts` — removed 2026-09-16, along with its own test file and its references in `powerController.ts`. Does not exist; no action.
- Every file's own production code — this phase adds test files only. No `.ts`/`.tsx` file listed above under "UNCHANGED — test target" is modified.
- `vitest.setup.ts` — the existing global GSAP mock and `ResizeObserver` polyfill already cover what `swimAnimation.test.ts`/`timelineMap.test.ts` need; no change required.

---

## 3. Per-Module Test Targets

Each numbered item below becomes one task in the downstream task file (§ mapping noted per item). Function/behavior names are taken directly from the current source, not paraphrased.

### 3.1 Audio/Engine

**`src/engine/lfoShared.ts`** — pure helpers, no Tone mocking needed except where noted:
- `clamp(value, min, max)`: below-range, above-range, and in-range inputs.
- `isAudioContextRunning()`: needs `vi.mock('tone', ...)` (or a spy on `Tone.getContext`) returning `{ state: 'running' }` and `{ state: 'suspended' }`; also the `try/catch` path — `Tone.getContext` throwing returns `false`, not a thrown error.
- `centeredSwingFromRange(range, currentValue)`: the documented "bounded by nearer edge" behavior — a value near `min` gets a small swing bounded by `min`-distance, a value near `max` gets a small swing bounded by `max`-distance, a value at the midpoint gets `±halfSpan`. **Named risk:** the non-finite guard — `NaN`/`Infinity` input must return `{ min: 0, max: 0 }`, never propagate into the swing math (the file's own comment: "connecting an LFO whose output is NaN poisons the live Web Audio graph").
- `connectAdditively(source, destination)`: use plain fake objects (`{ value: N, override: true }` for a Signal-like destination, `{ value: N }` with no `override` key for a Param-like destination — mirroring `lfoEngine.test.ts`'s own `fakeParamMarker` convention) and a `connect` spy on `source`. Assert: `destination.override` is set `false` before `.connect()` is called; the pre-connect `value` is restored after `.connect()`; a non-finite pre-connect value is **not** written back (the file's own guard).

**`src/engine/lfoDrift.ts`** — needs `vi.mock('tone', ...)` following `lfoEngine.test.ts`'s established fake (`LFO`, `Gain`, connect/disconnect/dispose simulating real override-reset behavior); import real `lfoShared.ts` (not mocked) so `centeredSwingFromRange`/`connectAdditively` run for real against the fakes.
- `driftGroupForTarget(target)`: `'eq3.'`-prefixed → `'eq3'`, `'lpf.'`-prefixed → `'filterLPF'`, `'hpf.'`-prefixed → `'filterHPF'`, anything else (a `RobotLfoTargetId`) → `'robots'`.
- `attachDrift`/`detachDrift`: a fresh key creates a `DriftLink` (verify via a subsequent `refreshRateDriftGain`/`refreshDepthDriftGain` no-throw, or by asserting the pool-selection `connect` calls fired); calling `attachDrift` twice for the same key is idempotent (second call is a no-op — no second pool-oscillator `connect`); `detachDrift` on an unlinked key is a safe no-op; `detachDrift` on a linked key disconnects and disposes both Gains and removes the key (a subsequent `refreshRateDriftGain`/`refreshDepthDriftGain` for that key becomes a no-op again).
- **Named risk — the depth silence guard** (`refreshDepthDriftGain`): a primary whose current `amplitude.value` is `<= 0` must leave (or make) `depthDriftConnected === false` and call `.disconnect()` if it was previously connected — a primary deliberately silenced by its own Depth must stay silent regardless of global drift, per the file's own §1.3 comment. A primary whose amplitude is `> 0` connects lazily (only on the transition from 0 to nonzero, not on every refresh call) and its Gain value follows `globalDepthDriftByGroup[group] * swing.max`.
- `setGlobalRateDrift`/`setGlobalDepthDrift`: clamps to `[-1, 1]`; refreshes only links belonging to the given group — a link in a different group is untouched (assert its Gain value is unchanged after another group's setter runs); a safe no-op with zero links in the target group.
- `setDriftSuppressed(true)`: detaches every currently-linked key (asserted via each link's Gains being disconnected/disposed); `attachDrift` while suppressed is a no-op (no link created, no pool built). `setDriftSuppressed(false)` clears the flag only — does not itself re-attach anything (matches the file's own comment: "lfoEngine, which knows what is connected, re-attaches each primary"). `isDriftSuppressed()` reflects the current flag.
- Pool sizing (`getOrCreateDriftPool`, exercised indirectly via `attachDrift`): a group's pool is built lazily on first `attachDrift` for that group and reused (not rebuilt) on a second `attachDrift` in the same group — assert `Tone.LFO` the mocked constructor is called exactly `DRIFT_POOL_SIZE[group]` times total across two `attachDrift` calls in the same group, not `2 × size`.

### 3.2 Utils

**`src/utils/getSeededVal.ts`**:
- `precomputeDataX(dataId)`: same `dataId` (and same global seed override state) → same output every call (determinism); different `dataId` → a different output (not asserting exact values, just inequality, since `alea`'s output isn't hand-computed here). With `getGlobalAttenuationStyleSeedOverride()` mocked to return a value, the key becomes `` `${global}:${dataId}` `` — assert this by checking that the same `dataId` under two different mocked override values produces two different outputs (proves the override is actually folded into the key, not ignored).
- `getSeededVal(noiseMap, dataId, offset, min, max)`: with a stub `noiseMap` returning a fixed value in `[-1, 1]`, assert the `[-1,1] → [min,max]` linear remap is correct at the extremes (`-1 → min`, `1 → max`) and the midpoint (`0 → (min+max)/2`); default `offset`/`min`/`max` (`0`/`0`/`1`) behave as documented.

**`src/utils/refs.ts`** — trivial `Map` wrapper, but untested; full behavioral contract:
- `setRef`/`getRef` round-trip; `getRef` on an unset key returns `undefined`; `deleteRef` removes a key (subsequent `getRef` is `undefined`) and is a safe no-op on an already-absent key; `clearRefs` empties the map (subsequent `getRef` for any previously-set key is `undefined`).

**`src/utils/helpers.ts`**:
- `swallow(err, ctx)`: calls `console.warn` (spy) with a message containing `ctx` when provided, and a fallback ("ignored error") when `ctx` is omitted; the `try/catch` around the `console.warn` call itself doesn't throw even if `console.warn` is stubbed to throw (the file's own defensive fallback).
- `devWarn(...args)`: gated on `DEV_TUNING` (`src/constants/index.ts`, `= import.meta.env.DEV`). Test both branches by mocking `@/constants` per-test (`vi.mock('@/constants', () => ({ DEV_TUNING: true }))` / `false`, following the same per-file-mock pattern `lfoEngine.test.ts` uses for `tone`) — asserting `console.warn` is called when `true` and not called when `false`.
- `getScreenViewportDomNode()`: returns the element when a DOM node with `id="screen-viewport"` exists (jsdom `document.getElementById`), `null` when it doesn't.

### 3.3 UI / Animation Math

**`src/components/ui/controls/sliderLogMath.ts`**:
- `sliderLogValueToT(value, min, max)`: `value <= min` → exactly `0` (**named risk** — the `min = 0` edge case: `sliderLogValueToT(0, 0, 100)` must be `0`, not `-Infinity`/`NaN` from a raw `log(0/floor)`); a value at `max` → `1`; a midpoint value's `t` round-trips through `sliderLogTToValue` back to (approximately) the original value.
- `sliderLogTToValue(t, min, max)`: `t <= 0` → exactly `min` (**named risk**, same `min = 0` case: must return exactly `0`, not `floor` (`LOG_EPSILON`) or `NaN`); `t = 1` → `max`.
- Round-trip property test: for several `(min, max)` pairs including `min = 0` (Attack/Decay/Release's real range per the file's own comment) and a non-zero `min`, `sliderLogTToValue(sliderLogValueToT(v, min, max), min, max) ≈ v` for a handful of `v` samples between `min` and `max`.

**`src/components/ui/controls/accordionAnimation.ts`**:
- `getAccordionDuration(prefersReducedMotion)`: `true` → `0`; `false` → `ACCORDION_DURATION` (`0.25`).
- `getAccordionFadeDuration(prefersReducedMotion)`: `true` → `0`; `false` → `ACCORDION_FADE_DURATION` (`0.15`).
- Smoke assertion that `ACCORDION_FADE_DURATION < ACCORDION_DURATION` and `FIRST_OPEN_MAX_SETTLE_TICKS` is a positive integer — these are the file's own documented invariants (fade must be shorter and sequenced, never simultaneous, with the height tween), worth pinning so a future edit can't invert them silently.

**`src/animation/swimAnimation.ts`** — runs against `vitest.setup.ts`'s global GSAP mock (no local GSAP mock needed); needs `setRef`/`clearRefs` (`src/utils/refs.ts`, real — not mocked, this is exactly the kind of cross-module use `refs.ts`'s own tests in §3.2 protect) to register a fake `SVGGElement`-shaped ref (jsdom-created `<g>` with a `.propeller` child) before calling `createSwimTimeline`.
- No-ref path: calling with a robot id that has no registered ref does not throw, returns a `gsap.timeline()`-shaped object (the mock's), and — when `onComplete` is provided — still calls it (via the mocked `gsap.delayedCall`, which per `vitest.setup.ts` returns `{ kill: () => {} }` and does **not** auto-fire — assert the callback is *scheduled*, i.e. `delayedCall` was called with the estimated duration and the callback, not that it fired synchronously).
- With-ref path: `calculateDistance`/`calculateDuration` (module-private, exercised indirectly) — a known `from`/`to` pair produces the expected duration (`distance / SWIM_SPEED`); `killTimeline` is called with `` `swim-${robot.id}` `` before building the new timeline (register a real timeline first via `setTimeline`, then call `createSwimTimeline` again, assert the first is gone from `timelineMap`); the new timeline is itself registered under the same key.
- **Named risk — absolute vs. relative timeline offsets**: when `targetDirection` differs from the robot's current `direction` (`needsFlip = true`), the propulsion phase's start offset is `ORIENTATION_DURATION - PROPULSION_OVERLAP`, not `0` — assert this by spying on the mock timeline's `.to()` calls and checking the position argument passed for the propulsion/propeller/tilt tweens when a flip is needed vs. not.
- Propeller rotation count: with a fake ref whose `.querySelector('.propeller')` returns an element, `numRotations = Math.ceil(duration / PROPELLER_ROTATION_SPEED)` — assert the `repeat` value passed to `.to()` for the propeller tween is `numRotations - 1`. With no `.propeller` child present, no propeller tween is attempted (no throw from a `null` `querySelector` result).

**`src/animation/timelineMap.ts`** — runs against the global GSAP mock; construct fake timeline objects via `gsap.timeline()` from the (mocked) import so `.kill()` exists.
- `setTimeline`/`getTimeline` round-trip; `setTimeline` with an id already present calls `.kill()` on the *previous* timeline (spy on the old timeline's `kill`) before overwriting it in the map.
- `killTimeline`: on a present id, calls `.kill()` and removes the entry (`getTimeline` afterward is `undefined`); on an absent id, is a safe no-op (no throw, no call to anything).
- `killAllTimelines`: calls `.kill()` on every entry and empties the map (`timelineMap.size === 0` afterward, `getTimeline` for any previously-set id is `undefined`).

### 3.4 Robot Visuals — one shared parametrized task

**`src/components/robot/robotShapeVariants.test.tsx`** — `describe.each([RobotAngular, RobotIndustrial, RobotOrganic, RobotSleek])`, confirmed via direct read that all four share an identical `RobotSVGProps` contract (`colors`, `scale`, `detailLevel`, `shapeParams?`, `dimOpacity?`) and the same three behavioral hooks:
- Renders without throwing given typical `colors`/`scale`/`detailLevel` props (RTL `render`).
- `detailLevel > 0.5` renders the extra detail group (query by the `.details` class each variant uses); `detailLevel <= 0.5` (including exactly `0.5`, since the guard is a strict `>`) does not render it.
- `dimOpacity` (default `1` when omitted) is applied as the `opacity` attribute on the viewport group(s) each variant marks with it — assert the default case (`dimOpacity` omitted → `opacity="1"`) and an explicit value (e.g. `0.4`).
- `shapeParams.scaleBias`/`torsoAspect`/`appendageLength` (each optional, defaulting to `0`/`1`/`1`) feed into the root `<g transform="scale(...)">` — assert the default (no `shapeParams`) produces `scale(${scale})` and a supplied `scaleBias` changes the rendered transform's numeric value predictably (`scale * (1 + scaleBias)`).
- A `.propeller`-classed element exists in the output (the element `swimAnimation.ts`'s own `.querySelector('.propeller')` call — §3.3 — depends on existing across every variant that gets swum).

Four separate test files are explicitly out of scope (§ intent doc) — this is the one task in the whole phase that produces a single test file covering four production files.

### 3.5 World / Actors

**`src/components/actors/factoryVariants.ts`**:
- `isBubbleEligible(purpose)`: each of the 4 `BUBBLE_PURPOSES` (`heavyIndustry`, `chemicalProcessing`, `pipeWorks`, `storageLogistics`) → `true`; `observationComms` → `false`; `undefined` → `true` (the documented fallback-to-`heavyIndustry` behavior).
- `getVariantFromNoise(noiseValue, row, availableTypes)`: with the default 5-variant list, `noiseValue` near `0` resolves to the first (heaviest-weighted) entry (`Monolith`) and `noiseValue` near `1` resolves to the last (`Warehouse`); a custom, shorter `availableTypes` list re-weights correctly (assert against the documented "earlier entries get a larger share" triangular-number weighting, e.g. a 2-entry list splits at the noise value implied by `total = 3`, `cumulative` after entry 1 `= 2/3`); a `noiseValue` of exactly `1` (or any value the loop's `<` comparisons never catch, a floating-point edge) falls through to the final `return availableTypes[n - 1]` line, not undefined.
- **Named risk — `selectVariantFromSeed`'s PRNG draw order** (the file's own comment: "must not be changed without updating tests"): with a fixed `actorId`, assert the 8 documented draws happen in the documented order by checking that changing only *one* input that affects an early draw (e.g. `x`, which feeds draw 1's simplex noise) changes the *variant* but does **not** change whether `beltCourseCount`/`frontCornerX` remain within their own valid bounds — and, more directly, that calling `selectVariantFromSeed` twice with the identical `(actorId, x, row)` produces byte-identical output on every field (determinism — the core property the "must not be changed" comment protects). If practical, pin one full known-seed output as a literal regression snapshot (a fixed `actorId`/`x`/`row` and its exact returned object) so a future accidental reordering of the 8 `prng()` calls fails loudly instead of silently reshuffling which field gets which draw.
- `frontCornerX` bounds: always an integer in `[25, 75]` inclusive, across several seeds.
- `beltCourseCount` bounds: `0` when the resolved variant's `maxBeltCourses` is `0` (e.g. `Warehouse`); otherwise an integer in `[0, maxBeltCourses]` inclusive.

**`src/components/panels/screen/worldView/LocaleView.tsx`** — RTL render test; mock `@/stores/localeStore`'s `useLocaleStore` and mock the `OceanScene` child (`vi.mock('./OceanScene', ...)`, asserting it receives `localTime` as a prop) so this test targets `LocaleView`'s own logic, not `OceanScene`'s.
- `localeId` present in the mocked store's `locales` map → renders the `.locale-view` wrapper and `OceanScene` with the passed-through `localTime`.
- `localeId` absent from `locales` → renders `null` (nothing — assert via `container.firstChild === null` or equivalent, and that `OceanScene` was never invoked).
- The store selector reads only `localeId in s.locales` (a boolean), not the locale object itself (the file's own comment flags this as a deliberate re-render-avoidance fix) — not independently testable via RTL alone (Zustand's actual re-render behavior isn't exercised by a single mocked render), so this point is **documentation, not an assertion**: the test's mock should return a plain boolean from the selector to match the real shape, but the "why" is out of this test's reach and doesn't need asserting.

---

## 4. Implementation Boundaries & Constraints

* **Strict Scope:** Touch only the 14 new test files listed in §2, plus (only if a task's own §3 entry requires it) `vitest.setup.ts` — and only to add a mock that must be global rather than per-file; expect this not to be needed, since GSAP is already global and Tone mocking is established as per-file (`lfoEngine.test.ts` precedent).
* **Zero production-code changes.** Every `.ts`/`.tsx` file under test in §2 is read-only for this phase. A real bug found while writing a test (e.g. an off-by-one, an unguarded edge case) is reported and left for a separate, explicitly-scoped fix — never silently patched in the same task/commit.
* **No new dependency, no new test-infrastructure module.** Vitest + React Testing Library, exactly as CLAUDE.md specifies; reuse `vitest.setup.ts`'s existing GSAP mock and `lfoEngine.test.ts`'s existing Tone-mocking pattern rather than building a shared test-helper module — 14 independent tasks don't justify a new shared abstraction for two files (`lfoDrift.test.ts`) that need Tone mocking.
* **No coverage-percentage gate added.** `npm run test:coverage` stays exactly as it is today — reported, not enforced.
* **Determinism-sensitive tests use fixed seeds, not `Math.random()`** — matches every existing seeded-generation test in this codebase (`getSeededVal.test.ts`, `factoryVariants.test.ts` both call `alea`-backed functions with literal string/number seeds, never a random one).
* **Out of scope, per the confirmed intent:** any refactor of a file under test; a coverage-percentage threshold or new coverage tooling; four separate robot-variant test files (one shared parametrized file instead, §3.4); per-group checkpoint gates in the task file (one "Checkpoint: Complete" at the end).

---

## 5. Code Style & Architecture Conventions

### 5.1 Pure-function test shape (e.g. `sliderLogMath.test.ts`, `getSeededVal.test.ts`)

```typescript
import { describe, it, expect } from 'vitest';
import { sliderLogValueToT, sliderLogTToValue } from './sliderLogMath';

describe('sliderLogValueToT', () => {
  it('maps value <= min to exactly 0, including min = 0', () => {
    expect(sliderLogValueToT(0, 0, 100)).toBe(0);
    expect(sliderLogValueToT(-5, 0, 100)).toBe(0);
  });

  it('maps max to exactly 1', () => {
    expect(sliderLogValueToT(100, 0, 100)).toBe(1);
  });
});
```

### 5.2 Tone-mocked test shape (`lfoDrift.test.ts`) — reuses `lfoEngine.test.ts`'s fake

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('tone', () => ({
  LFO: vi.fn(/* same shape as lfoEngine.test.ts's fake — frequency: Signal-like, amplitude: Param-like */),
  Gain: vi.fn(/* connect/disconnect/dispose spies */),
  getContext: vi.fn(() => ({ state: 'running' })),
}));

import { attachDrift, detachDrift, driftGroupForTarget } from './lfoDrift';

describe('driftGroupForTarget', () => {
  it('routes eq3./lpf./hpf.-prefixed targets to their own group, everything else to robots', () => {
    expect(driftGroupForTarget('eq3.low')).toBe('eq3');
    expect(driftGroupForTarget('lpf.frequency')).toBe('filterLPF');
    expect(driftGroupForTarget('hpf.frequency')).toBe('filterHPF');
    expect(driftGroupForTarget('robot-1.volume')).toBe('robots');
  });
});
```

### 5.3 RTL component test shape (`robotShapeVariants.test.tsx`, `LocaleView.test.tsx`)

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RobotAngular } from './RobotAngular';
import { RobotIndustrial } from './RobotIndustrial';
import { RobotOrganic } from './RobotOrganic';
import { RobotSleek } from './RobotSleek';

const VARIANTS = [
  ['RobotAngular', RobotAngular],
  ['RobotIndustrial', RobotIndustrial],
  ['RobotOrganic', RobotOrganic],
  ['RobotSleek', RobotSleek],
] as const;

describe.each(VARIANTS)('%s', (_name, Component) => {
  const baseProps = { colors: { primary: '#111', secondary: '#222', accent: '#333' }, scale: 1, detailLevel: 0.2 };

  it('renders without throwing', () => {
    expect(() => render(<Component {...baseProps} />)).not.toThrow();
  });

  it('renders the detail group only when detailLevel > 0.5', () => {
    const { container: low } = render(<Component {...baseProps} detailLevel={0.5} />);
    expect(low.querySelector('.details')).toBeNull();

    const { container: high } = render(<Component {...baseProps} detailLevel={0.6} />);
    expect(high.querySelector('.details')).not.toBeNull();
  });
});
```

* **Naming:** test files match their target's own name exactly (`Foo.ts` → `Foo.test.ts`), per CLAUDE.md — except `robotShapeVariants.test.tsx`, which deliberately doesn't match a single source file 1:1 since it covers four (named after what it tests, not a single component).
* **Formatting:** matches each touched directory's existing test-file style (`describe`/`it`, `vi.mock` at the top of the file before any import of the module under test, per `lfoEngine.test.ts`'s own layout).

---

## 6. Testing Strategy

* **Framework:** Vitest + React Testing Library, per CLAUDE.md — no new framework or library.
* **Test file location:** colocated, exactly matching every existing test file in this repo (§5's naming note above).
* **Mocking:**
  - GSAP: already global via `vitest.setup.ts` — `swimAnimation.test.ts`/`timelineMap.test.ts` need no local mock.
  - Tone: per-file `vi.mock('tone', ...)`, reusing `lfoEngine.test.ts`'s established fake shape (Signal-like `frequency` with `override`, Param-like `amplitude` tagged via a symbol marker) — only `lfoDrift.test.ts` needs this; `lfoShared.test.ts` only needs a `Tone.getContext` stub for `isAudioContextRunning`.
  - Zustand stores: `LocaleView.test.tsx` mocks `@/stores/localeStore`'s `useLocaleStore` directly (a plain `vi.mock`), matching how other component tests in this codebase stub a single store hook without mounting a real store.
  - `@/constants`: `helpers.test.ts` mocks `DEV_TUNING` per-test to exercise both branches of `devWarn`.
* **Verification per task:** `npx vitest run <path/to/File.test.ts>` passes in isolation; `npm run build:types` and `npm run lint` clean; no change to any file outside §2's new-test-file list.
* **Verification at Checkpoint: Complete:** full `npm test` clean (14 new files, zero regressions to the existing suite — note any *pre-existing* flaky failures the same way prior phases have, rather than treating them as caused by this work); `npm run build:types`/`npm run lint`/`npm run build` all clean.

---

## 7. Open Questions & Risks

None blocking — the confirmed intent doc already resolved every design question this phase had (robot-variant test grouping, coverage bar, task-file flatness). Two implementation-level notes worth flagging for Tasks, not requiring a decision now:

1. **`selectVariantFromSeed`'s regression-snapshot pin (§3.5)** is written as "if practical" — a literal snapshot of one known seed's full output is the strongest guard against the documented "PRNG draw order must not change" risk, but it's also the most brittle to maintain if the schema legitimately changes later. Left to Tasks to decide whether to pin a literal object or assert the weaker "same input twice → identical output" determinism property alone.
2. **`swimAnimation.test.ts`'s `gsap.delayedCall` assertion (§3.3, no-ref path)** depends on `vitest.setup.ts`'s mock continuing to *not* auto-fire `delayedCall` (unlike `.timeline()`'s `onComplete`, which does auto-fire via microtask) — this is already true today and documented in the setup file's own comment, but Tasks should re-read that mock before writing the assertion rather than assuming its shape from this spec alone, in case it's changed since 2026-09-27.
