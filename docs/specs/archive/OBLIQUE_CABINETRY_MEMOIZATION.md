# Phase Spec: Oblique Cabinetry Memoization

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/todo/backlog.md #26](../todo/backlog.md#26-oblique-cabinetry-primitives-no-memo-boundary-anywhere--whole-panels-re-render-together)
(filed 2026-09-15, found live-verifying item 25). Same underlying bug *class* as items 21-25
(a value update forcing more re-render than the change actually needs), same session, but a
different mechanism and a different shared subsystem — the 14-primitive Oblique Cabinetry
Design System (`docs/COMPONENT_LIBRARY.md`) rather than the world-view actor tree. Not a
Crawford feature request; no paired `docs/intent/*.md`.

---

## 1. Overview & Claude Explanation

### 1.1 The actual mechanism, confirmed via code + live Profiler

React DevTools Profiler (Crawford, 2026-09-15) showed that during an automatic Audio Swell
tick, the *entire* affected `AudioRigEffectPanel` re-renders — every `CabinetBox`/`SliderLog`/
`SliderLinear`/`RadioButton`/`Lfo`/`SliderCenteredZero` inside it, not just the one field
actually swelling (`AudioRigEffectPanel x36, CabinetBox x36, SliderLog x36, SliderLinear x36`
— identical counts, everywhere, all the way down).

Root cause: **none of the 14 primitives are wrapped in `React.memo`** — confirmed via a repo
search (`grep -r "React.memo\|= memo(" src/components/ui/controls`, zero matches), unlike
`Factory`/`RobotBody`/`BubbleStream` (items 21-23), which all are. `useAudioStore`'s per-effect
selector (item 18) already scopes *which* panel re-renders correctly — `AudioRigEffectPanel`
re-rendering when one of its own effect's fields changes is correct, unavoidable behavior
(Zustand's immutable update means the whole per-effect settings object is a new reference
whenever *any* field inside it changes). What's missing is a bail-out boundary *below* that
point: with nothing downstream able to stop and say "my own props didn't change," every sibling
control re-executes its own render body too, even ones whose value never changed.

### 1.2 Why "just add `React.memo`" isn't enough — two more things have to be true first

Re-reading `AudioRigDrawer.tsx` and `voxelTrackMath.ts` while researching this spec found two
prerequisites `React.memo` alone can't satisfy:

**1.2.1 Unstabilized `onChange` closures.** `AudioRigDrawer.tsx` builds every callback inline,
fresh, on every render:

```typescript
// AudioRigDrawer.tsx:76 (paramRow) — and every other onChange in this file
{renderParamControl(param, effect[param.field], (v) => updateParam(param.field, v))}
```

`(v) => updateParam(param.field, v)` is a **new function object every single render** of
`AudioRigEffectPanel`. `React.memo`'s default shallow compare checks every prop with
`Object.is` — a fresh function reference fails that check every time, regardless of whether
`value` itself is unchanged. Memoizing `SliderLinear` alone would change *nothing* for this
panel: the `onChange` prop would still look "different" on every render.

**1.2.2 Unmemoized derived arrays feeding `VoxelTrack`.** `SliderLinear`/`SliderLog`/
`SliderCenteredZero` all call `computeVoxelBoxStates`/`computeVoxelBoxStatesCenteredZero`
(`voxelTrackMath.ts`) directly in their render body — a **pure function that returns a fresh
array every call**, even when `value`/`min`/`max`/`boxCount` are all unchanged. `VoxelTrack`
then maps that array into `CabinetBox` elements, each with a freshly-built `children` div
(`<div className="sc-voxel-track__fill" style={{ background: ... }} />` —
`VoxelTrack.tsx:89-92`). Since JSX always creates a new element object, `CabinetBox`'s
`children` prop is **never** `Object.is`-stable across two calls, even ones with
byte-identical visual output — a bare `React.memo(CabinetBox)` would never bail out for any
`VoxelTrack`-rendered box, because `VoxelTrack` itself re-executes (its own `states` prop is a
fresh array reference) and rebuilds every child from scratch every time.

**The actual fix chain**, deepest to shallowest, each layer a precondition for the one above it
to matter:

```
computeVoxelBoxStates/…CenteredZero        →  wrap the call site in useMemo, keyed on the
(voxelTrackMath.ts)                            real scalar inputs — [value, min, max, boxCount]
        │                                      (or the centered-zero equivalent) — so the
        ▼                                      returned array is the SAME reference across
VoxelTrack                                     renders when nothing real changed.
        │                                   →  React.memo(VoxelTrackInner) — now that `states`
        ▼                                      can be stable, VoxelTrack can bail entirely,
CabinetBox                                     meaning it never re-executes its .map() and
        │                                      never rebuilds any CabinetBox/children at all.
        ▼                                   →  React.memo(CabinetBoxInner) too — for the
(the 14 primitives, each                       primitives that render CabinetBox directly
 composing CabinetBox/                         (RadioButton, one per option; Button; Toggle),
 VoxelTrack/DualLabel/                         not funneled through VoxelTrack.
 each other)                                →  React.memo every primitive — so that when a
                                                PARENT re-renders (e.g. AudioRigEffectPanel,
                                                correctly, because one field changed), every
                                                SIBLING control whose own schema/value/onChange
                                                genuinely didn't change can bail out too.
        │
        ▼
Call sites (AudioRigDrawer.tsx            →  wrap every onChange construction in useCallback
 first; others follow-up, §1.5)               with a correct, minimal dependency array — the
                                                one thing none of the above can fix from inside
                                                the shared library itself.
```

### 1.3 Per-primitive memo-safety audit

Every primitive's documented props contract (`docs/COMPONENT_LIBRARY.md`) already follows a
`{ schema, value, onChange, disabled? }` shape where `schema` is always a **stable, module-level
object** from a static config file (`audioRigConfig.ts` etc.) — confirmed via `AudioRigDrawer.tsx`
(`param.schema` traces back to `AUDIO_RIG_CONFIG`, built once at module load, never reconstructed
per-render). `value`/`disabled`/`verticalHeight`/`readOnly`/`boxHeight`/etc. are all primitives.
The only prop type that's ever genuinely risky for a default shallow-compare `React.memo` is
`children`/`ReactNode` — and it splits into two very different cases:

| Primitive | Takes external `children`? | Memo benefit |
|---|---|---|
| `DualLabel`, `Button`, `Toggle` (no children given), `TextInput`, `Stepper`, `StepperWithToggle`, `CoordsInput`, `RadioButton`, `SliderLinear`, `SliderLog`, `SliderCenteredZero`, `Lfo` | No — all content is internally composed from `schema`/`value`, never caller-supplied `children` | **Fully self-contained.** Memoizing these alone (plus the `VoxelTrack`/`computeVoxelBoxStates` chain for the 3 sliders) is guaranteed to work once callers pass stable `onChange` — no caller-side cooperation needed beyond that. |
| `AccordionContainer`, `DirectionalPanel`, `Toggle` (when a caller passes facade `children` — Header's Mute switch) | Yes — `children: ReactNode`, caller-supplied | **Conditional on the caller.** A caller that constructs its `children` inline (the overwhelmingly common case today) creates a fresh element every render regardless of memoizing the wrapper itself — `React.memo` here only pays off when the caller's own children construction happens to be referentially stable (e.g. itself the output of another memoized component). Still worth adding (never harmful, and correct for the cases where it *does* line up), but shouldn't be presented as a guaranteed win the way the leaf primitives are. |
| `VoxelTrack`, `CabinetBox` | `CabinetBox` takes internal `children` from its own callers (`VoxelTrack`, `Button`, `Toggle`, `RadioButton`, `AccordionContainer`, `DirectionalPanel`, `TextInput`) | Covered by §1.2.2's chain — `VoxelTrack`'s benefit depends on `computeVoxelBoxStates` being memoized upstream; `CabinetBox`'s benefit for `VoxelTrack`-driven boxes depends on `VoxelTrack` itself bailing (so it never rebuilds `children`); for `RadioButton`/`Button`/`Toggle`'s own direct `CabinetBox` calls, it depends on *those* primitives themselves being memoized (so *they* don't rebuild `children` either). |

`DualLabel` deserves a specific note: it's composed **internally** by every other primitive
(`docs/COMPONENT_LIBRARY.md`'s "DualLabel composition rule") — its own props (`loreLabel?`,
`humanLabel?`) are always plain strings pulled directly off a stable `schema` object, so it's
trivially, unconditionally memo-safe; its benefit is realized once its *parent* primitive is
memoized and bails (so `DualLabel` is never even reached), same shape as `CabinetBox`'s
dependency on `VoxelTrack`.

### 1.4 Scope: Audio Rig's own callback sites, not every drawer

This spec's own fix chain (§1.2) makes the **primitive-library half** (memoizing the 14
primitives + `DualLabel` + `VoxelTrack`, and memoizing the `voxelTrackMath.ts` call sites)
unconditionally safe to ship regardless of which call sites have been updated — a memoized
component with an unstabilized caller is no worse off than today (same re-render rate), never
worse. The **call-site half** (stabilizing `onChange` via `useCallback`) is what actually
determines whether any given drawer *benefits*. This spec scopes the call-site fix to
`AudioRigDrawer.tsx` only — the one drawer this session actually measured and confirmed the
problem in. `docs/COMPONENT_LIBRARY.md`'s own drawer list names several more likely carrying
the identical unstabilized-inline-closure pattern (`RobotOptionsTab`/`RobotAudioTab`/
`RobotOscillatorsTab`, `SectorSettingsDrawer`, `PingControlsDrawer`, `PingContourDrawer`,
`SignatureArrayDrawer`, `AudioSettingSection`, `CompanyManager`/`CompanyButtonRow`, and
`Header.tsx`'s own nav `RadioButton` — backlog item 1's duplication issue is a related but
distinct problem in the same family) — each should get the identical treatment in its own
follow-up pass once this one is implemented and verified, not folded in here. Same "prove the
mechanism on one real, measured case first" reasoning items 21→22 already used (Factory proven
first, RobotBody as a confirmed-smaller follow-up).

### 1.5 No other judgment calls requiring sign-off

Unlike item 21, the mechanism itself isn't in question — `React.memo` + `useMemo` +
`useCallback` are the only tools in play, no CSS-var/child-component/registry-style fork to
choose between. The one real scope decision (§1.4, Audio Rig only vs. every drawer) is a
sizing call, not an architectural one, and is resolved above by precedent.

---

## 2. Target File Structure

```text
src/
├── components/ui/controls/
│   ├── CabinetBox.tsx              # MODIFIED — React.memo(CabinetBoxInner)
│   ├── CabinetBox.test.tsx         # MODIFIED — new memo-behavior tests
│   ├── VoxelTrack.tsx              # MODIFIED — React.memo(VoxelTrackInner)
│   ├── VoxelTrack.test.tsx         # MODIFIED — new memo-behavior tests
│   ├── DualLabel.tsx               # MODIFIED — React.memo
│   ├── DualLabel.test.tsx          # MODIFIED
│   ├── Button.tsx / .test.tsx              # MODIFIED — React.memo, each
│   ├── Toggle.tsx / .test.tsx              # MODIFIED — React.memo, each
│   ├── TextInput.tsx / .test.tsx           # MODIFIED — React.memo, each
│   ├── Stepper.tsx / .test.tsx             # MODIFIED — React.memo, each
│   ├── StepperWithToggle.tsx / .test.tsx   # MODIFIED — React.memo, each
│   ├── CoordsInput.tsx / .test.tsx         # MODIFIED — React.memo, each
│   ├── RadioButton.tsx / .test.tsx         # MODIFIED — React.memo, each
│   ├── SliderLinear.tsx / .test.tsx        # MODIFIED — React.memo + useMemo(computeVoxelBoxStates)
│   ├── SliderLog.tsx / .test.tsx           # MODIFIED — React.memo + useMemo(computeVoxelBoxStates)
│   ├── SliderCenteredZero.tsx / .test.tsx  # MODIFIED — React.memo + useMemo(computeVoxelBoxStatesCenteredZero)
│   ├── Lfo.tsx / .test.tsx                 # MODIFIED — React.memo, each
│   ├── AccordionContainer.tsx / .test.tsx  # MODIFIED — React.memo (§1.3's conditional-benefit case)
│   └── DirectionalPanel.tsx / .test.tsx    # MODIFIED — React.memo (§1.3's conditional-benefit case)
├── utils/
│   └── voxelTrackMath.ts           # UNCHANGED — computeVoxelBoxStates/…CenteredZero stay pure,
│                                    #   plain functions; memoization is the caller's job (useMemo
│                                    #   at each of the 3 slider call sites), not this module's.
└── components/panels/screen/console/
    ├── AudioRigDrawer.tsx          # MODIFIED — every inline onChange wrapped in useCallback
    └── AudioRigDrawer.test.tsx     # MODIFIED — new regression tests proving the cascade is gone
```

**Explicitly not touched, and why:**

- `voxelTrackMath.ts`'s own functions — already pure, already correct; the fix is memoizing
  their *call sites*, not changing their implementation.
- Every other drawer named in §1.4 — flagged as follow-up work, not touched here.
- `useVoxelTrackSlider.ts`, `useCabinetBoxHeight.ts`, `useAutoSliderOrientation.ts`,
  `sliderLogMath.ts` — already return/derive plain primitives or are already internally
  memoized (`useVoxelTrackSlider`'s own `rootStyle` is already a `useMemo`); nothing here needs
  to change for this fix.
- `docs/COMPONENT_LIBRARY.md`'s documented `ControlSchema`/props contracts — unchanged. This is
  purely an internal rendering-performance change; every primitive's public prop shape stays
  byte-for-byte identical. (A new *implicit* expectation — "pass a stable `onChange`" — is
  real, but it's a performance contract, not a type-level one; see §3.)

---

## 3. Implementation Boundaries & Constraints

- **Strict Scope:** Touch only the files listed in §2.
- **Zero visual/behavioral regression:** every primitive's rendered output and interactive
  behavior (click, drag, keyboard, focus) must be identical to today's for any given
  `(schema, value, disabled, ...)` tuple. This is a pure performance refactor — every existing
  test for every touched file must pass unmodified.
- **No custom `React.memo` comparator anywhere** — §1.3 confirms every primitive's real props
  are either primitives or stable config objects; the default shallow compare is correct. If a
  primitive is found during implementation to need one, treat that as a sign its own props
  contract has an untracked instability, not a reason to reach for a comparator function.
  Flag it instead of silently working around it.
- **`onChange` becomes an implicit performance contract, not just a type contract.** A consumer
  that keeps constructing `onChange` inline (as `AudioRigDrawer.tsx` does today) gets zero
  benefit from a memoized primitive — not a bug, just an unrealized opportunity, same as any
  other drawer not yet migrated (§1.4). Document this plainly wherever `React.memo` is added
  (matching this session's own established comment density for prior perf fixes).
- **Per CLAUDE.md:** no `setTimeout`/`setInterval`/`requestAnimationFrame` introduced or
  touched. No GSAP architecture change — `CabinetBox`'s existing GSAP timeline logic
  (`timelineMap`, `setTimeline`/`killTimeline`) is untouched; only the outer function component
  gains a memo wrapper. No Zustand state shape changes.
- **`AccordionContainer`/`DirectionalPanel` get `React.memo` too, despite §1.3's conditional
  benefit** — consistency with the other 12, and correct for the cases (a memoized ancestor
  passing them stable children) where it does help. Do not skip them or treat their weaker
  guarantee as a reason to leave them out.

---

## 4. Code Style & Architecture Conventions

**Primitive memoization** — the `XxxInner`/`React.memo(XxxInner)` pattern `Factory.tsx`/
`BubbleStream.tsx`/the Robot shape components already use in this codebase, applied uniformly
across all 14 (+`DualLabel`, +`VoxelTrack`) for consistency, even though `RobotBody.tsx`'s own
inline `memo(function RobotBody(...) {...})` form is a valid alternative this codebase also
uses — the `Inner`-named form is preferred here specifically because several of these files
(`CabinetBox.tsx` especially) carry extensive JSDoc anchored to the function declaration that
reads more naturally split from the export line:

```typescript
// CabinetBox.tsx — MODIFIED
function CabinetBoxInner({ popped, timelineKey, /* ...unchanged... */ }: CabinetBoxProps) {
  // ...entirely unchanged internals...
}

export const CabinetBox = React.memo(CabinetBoxInner);
```

**Derived-array memoization** — `useMemo`, keyed on the real scalar inputs, at each of the 3
slider components' own call sites (not inside `voxelTrackMath.ts`):

```typescript
// SliderLinear.tsx — MODIFIED
const { boxSize, gap, boxCount, rootStyle } = useVoxelTrackSlider(wrapperRef, orientation, verticalHeight);
const states = useMemo(
  () => computeVoxelBoxStates(value, schema.min, schema.max, boxCount),
  [value, schema.min, schema.max, boxCount],
);
```

(`SliderCenteredZero.tsx` mirrors this with `computeVoxelBoxStatesCenteredZero` and its own
argument list; `SliderLog.tsx` per its own existing `t`-space adaptation, documented in
`docs/COMPONENT_LIBRARY.md`'s `SliderLog` section — same `useMemo` shape, different inputs.)

**Callback stabilization** — `useCallback` at each `onChange` construction site in
`AudioRigDrawer.tsx`. The trickiest part: `updateParam`/`paramRow`/`renderParamControl` are
plain functions called during render, not hooks — `useCallback` can only wrap a callback at the
point it's actually *created inside a component's render body*, so the fix has to move the
per-field closure construction into `AudioRigEffectPanel`'s own body (where hooks are legal),
keyed per field, rather than `paramRow`'s current standalone-function shape:

```typescript
// AudioRigDrawer.tsx — AudioRigEffectPanel, illustrative shape
function AudioRigEffectPanel({ effectKey }: AudioRigEffectPanelProps) {
  // ...
  const updateParam = useCallback((field: string, value: number) => {
    // ...unchanged body...
  }, [effectKey]); // or whatever updateParam's own real dependencies resolve to

  // Per-field stable callbacks — one useCallback per param the panel renders, keyed by field
  // name so each slider's own onChange reference stays stable across renders where THAT
  // field's identity hasn't changed, even while sibling fields' values do.
  const makeFieldOnChange = useCallback(
    (field: string) => (v: number) => updateParam(field, v),
    [updateParam],
  );
  // ...
}
```

The exact mechanical shape (a `useCallback`-memoized factory vs. one `useCallback` per named
field vs. restructuring `paramRow` to accept `field` + a stable `updateParam` and build its own
`useCallback` internally) is left for the Tasks phase to pick concretely — flagged in §7,
not decided here, since it depends on details (how many distinct call shapes
`AudioRigEffectPanel`/`AudioRigLfoGroup`/the Compressor/Delay/Reverb hand-composed blocks each
need) not fully mapped out in this Specify pass.

---

## 5. Testing & Verification Requirements

- **Framework:** Vitest + React Testing Library, matching every existing test file for these
  components.
- **Existing tests, every touched file:** must pass unmodified — this is the same "byte-identical
  output, zero behavioral regression" bar items 21-25 held themselves to.
- **New memo-structural tests**, one per primitive (matching item 23's `BubbleStream.test.tsx`
  pattern where a real render-based test isn't practical, or a real render-based re-render-count
  test where it is): assert the export is genuinely `React.memo`-wrapped
  (`$$typeof === Symbol.for('react.memo')`), and where GSAP/Radix internals don't block a real
  render (most of these primitives, unlike `BubbleStream`, have no GSAP effect that breaks under
  the test-mocked `gsap` — `CabinetBox` itself does use GSAP, but its own existing
  `CabinetBox.test.tsx` already renders it directly today, so the mock gap `BubbleStream` hit
  doesn't apply here — confirm this directly before assuming either way, per this session's own
  "don't assume, check" precedent from item 23), a real render-based test: mount the primitive
  inside a re-rendering parent that passes identical props, assert the primitive's own render
  body did not re-execute (e.g. via a render-count spy, or `React.Profiler`'s `onRender`).
- **`SliderLinear`/`SliderLog`/`SliderCenteredZero`: `computeVoxelBoxStates` call-count
  regression test** — spy on the relevant `voxelTrackMath.ts` export (a real cross-module call
  from each slider component — confirm this is genuinely cross-module, not a same-file
  reference, before relying on `vi.spyOn` to observe it, per item 21 Task 4's and item 22's own
  hard-learned lesson), render the slider, force 2-3 parent re-renders with the identical
  `value`/`schema`/`boxCount`, assert the spy's call count stays flat after the initial mount
  call. Must be confirmed red against pre-fix code before being treated as done.
- **`AudioRigDrawer.tsx`: end-to-end cascade regression test** — the one that actually proves
  the originally-reported bug is fixed. Render `AudioRigEffectPanel` (or `AudioRigDrawer` as a
  whole, whichever existing test setup this file's own `AudioRigDrawer.test.tsx` already uses),
  change one field's value (simulating an audio-swell-driven `setGlobalAudio` call), and assert
  that a *sibling* control's own render body did not re-execute — e.g. spy on
  `computeVoxelBoxStates` again, or on a distinguishing per-primitive marker, scoped to a
  slider that did *not* receive the changed field. Must be confirmed red first.
* **Verification Steps:**
  1. `npx vitest run src/components/ui/controls/ src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes.
  2. `npm run build:types` — zero TypeScript errors.
  3. `npm run lint` — zero ESLint errors.
  4. `npm test` — full suite passes, including every existing test for every one of the 14
     primitives and every drawer that composes them (`RobotOptionsTab`, `SectorSettingsDrawer`,
     etc. — unmodified, but must keep passing since they import these now-memoized components).
  5. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** `npm run dev`, open Audio Rig, let an Audio Swell run,
  React DevTools Profiler Ranked/Flamegraph view — confirm only the actually-swelling field's
  own control shows real render duration, not the whole panel. Live re-verification, same
  deferred-to-Crawford category as items 21/23/24/25's own manual checks.

---

## 6. Documentation & Git/Workflow Context

- **`docs/COMPONENT_LIBRARY.md` update:** likely warranted — a short note that all 14 primitives
  (+`DualLabel`, +`VoxelTrack`) are `React.memo`-wrapped, and that consumers should pass a
  stable `onChange` (`useCallback`) to actually benefit. Not performed as part of writing this
  spec; flagged so it isn't silently missed once implementation lands.
- **Branch:** `refactor/factory-timing` (same branch items 21-25 landed on) unless Crawford
  wants a fresh branch given this is a genuinely different subsystem — flagged, not decided
  here.
- **Commit Pattern:** given the real size (16 primitive/utility files + `AudioRigDrawer.tsx`),
  multiple commits following the eventual task breakdown, not one large one — mirroring items
  21's own multi-task, multi-commit shape rather than 23-25's single-commit-per-fix shape.
- **`docs/todo/backlog.md` item 26:** mark fixed once implemented and verified, linking this
  spec and the eventual task file, matching every other item this session.

---

## 7. Open Questions & Risks

Resolved during Specify:

- ~~Is a custom `React.memo` comparator needed anywhere?~~ **Resolved: no** — every real prop is
  a primitive or a stable config object (§1.3); if implementation finds an exception, that's a
  signal to fix the instability at its source, not add a comparator.
- ~~Which primitives get memoized — all 14, or just the ones Audio Rig uses?~~ **Resolved: all
  14 + `DualLabel` + `VoxelTrack`** — safe regardless of caller readiness (§1.4), and every
  other drawer benefits automatically once its own call site is stabilized in a later pass.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **The exact mechanical shape of `AudioRigDrawer.tsx`'s callback stabilization (§4).** Several
   viable approaches (a `useCallback`-memoized factory function, one `useCallback` per named
   field, restructuring `paramRow`'s own signature) — not chosen here; needs Tasks to map every
   real call shape in the file first (`paramRow`, `AudioRigLfoGroup`, the hand-composed
   Compressor/Delay/Reverb blocks each build `onChange` slightly differently).
2. **Whether `CabinetBox.tsx`'s existing tests already render it directly (GSAP mock
   compatibility), or hit the same `tl.add()` gap `BubbleStream` did (§5).** Not confirmed in
   this Specify pass — check directly before assuming either way.
3. **`docs/COMPONENT_LIBRARY.md` update (§6)** — not performed; a real doc pass once
   implementation lands.
4. **Branch choice (§6)** — left for Crawford.
5. **Follow-up drawers (§1.4)** — `RobotOptionsTab`/`RobotAudioTab`/`RobotOscillatorsTab`,
   `SectorSettingsDrawer`, `PingControlsDrawer`, `PingContourDrawer`, `SignatureArrayDrawer`,
   `AudioSettingSection`, `CompanyManager`/`CompanyButtonRow`, `Header.tsx`'s nav `RadioButton`
   — each likely needs the identical callback-stabilization treatment in its own follow-up spec/
   task pass before benefiting from this one. Not scoped or sized here.
