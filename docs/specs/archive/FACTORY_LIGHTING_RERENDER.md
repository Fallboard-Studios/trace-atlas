# Phase Spec: Factory Lighting Re-render Isolation

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/todo/backlog.md #21](../todo/backlog.md#21-factory-every-instance-re-renders-oncesec-for-daynight-lighting)
("Factory: Every Instance Re-renders Once/Sec for Day/Night Lighting", decision recorded
2026-09-14). Not a Crawford feature request — a code-review-originated performance fix, so
there is no paired `docs/intent/*.md` doc; the backlog entry is the source. The backlog
recorded **option (a)** as the chosen fix shape ("isolate the lighting-dependent color
computation into a small child component ... memoized separately from the rest of the
factory's expensive, static geometry/greeble generation") but explicitly left the exact
mechanism undetermined. This Specify pass resolves that: confirmed directly with Crawford
(2026-09-14) as the **layout/paint split** (see §1.2) over a CSS-custom-property approach or
a coarse per-factory wrapper.

---

## 1. Overview & Claude Explanation

### 1.1 The actual cost, re-verified while writing this spec

`Factory.tsx:108` — `useUIStore((s) => s.activeLocaleLocalTime ?? 12)` — forces every
`FactoryInner` instance (~36 per locale) to re-render once per second (the wall-clock tick
`AttenuationStyleView.tsx` drives, `setInterval(tick, 1000)` — correctly not musical timing,
no CLAUDE.md violation). The existing `config` `useMemo` (`Factory.tsx:81-86`, variant/size/
frontCornerX selection) already isolates the *variant-selection* PRNG pass from this tick —
that part was never the problem. The real cost is that every rooftop/facade greeble call
(`ROOFTOP_RENDERERS[type](ctx)` / `FACADE_RENDERERS[type](ctx)`, `Factory.tsx:185-248`) runs
fresh on every one of those ~36×1/sec re-renders, and several of those renderers do real
work — seeded LCG loops deciding window/stack existence and position (`rooftopGreebles.tsx`,
`facadeGreebles.tsx`).

**Finding from re-reading both renderer files for this spec** (not established when the
backlog decision was written): of the 13 renderer functions in the two files, only **5**
actually read a lighting-dependent field (`eastLMultiplier`, `westLMultiplier`,
`nightDepth`, `flickerEpoch`, or `lMultiplier`) at all:

| File | Renderer | Reads a lighting field? |
|---|---|---|
| rooftopGreebles.tsx | `renderMachinery` | No — flat `colors.accent` |
| rooftopGreebles.tsx | `renderSteppeRoof` | No — flat `colors.accent` |
| rooftopGreebles.tsx | `renderAntennae` | No — flat `colors.accent` / fixed indicator color |
| rooftopGreebles.tsx | `renderWaterTower` | No — flat `colors.accent` |
| rooftopGreebles.tsx | `renderCupola` | No — flat `colors.accent` |
| rooftopGreebles.tsx | `renderPipesValves` | No — flat `colors.greeble` |
| rooftopGreebles.tsx | **`renderPitchedRoof`** | **Yes** — `eastLMultiplier`/`westLMultiplier` (shaded-path branch) |
| rooftopGreebles.tsx | **`renderCrownSpire`** | **Yes** — `eastLMultiplier`/`westLMultiplier` (shaded-path branch) |
| facadeGreebles.tsx | **`renderSquareWindows`** | **Yes** — via `renderWindowGrid`'s `lMultiplier`/`nightDepth`/`flickerEpoch` |
| facadeGreebles.tsx | **`renderWideWindows`** | **Yes** — same |
| facadeGreebles.tsx | **`renderTallWindows`** | **Yes** — same |
| facadeGreebles.tsx | `renderPipesValvesFacade` | No — flat `colors.greeble` (desaturated) |
| facadeGreebles.tsx | `renderBeltCourse` | No — flat `colors.accent`; also **not called by `Factory.tsx`'s render path at all** (its own doc comment confirms — belt courses render as inline `<rect>`s in `Factory.tsx` instead) |

The other 8 renderers' output is **already fully deterministic from spawn-time data** —
same seed, same building, same output, forever. They pay the full PRNG-loop cost every
tick today for zero visual reason; they just need to be memoized wholesale, with **no code
change inside `rooftopGreebles.tsx`/`facadeGreebles.tsx` at all**. Only the 5 lighting-
dependent renderers need an actual geometry/paint split. This narrows the real fix surface
considerably relative to how the backlog scoped it ("21 usage sites [of lighting fields]
across 752 lines" — real, but that count is usage *sites* of the fields inside those 5
functions plus `greebleTypes.ts`'s doc comments, not 21 functions needing rework).

Also found, out of scope: `RobotBody.tsx:52-55` has the *exact same* `activeLocaleLocalTime`
pattern — a `useMemo` keyed on a locally-derived `lightnessMultiplier`, recomputing the
entire robot visual (shape, greebles, colors) every tick for all 12 robots. Same bug class
as this backlog item, not filed anywhere. Flagged in §7, not addressed here — Crawford
should decide whether it becomes its own backlog item.

### 1.2 Judgment call: `useMemo`, not a new child component

The backlog's fix shape says "a small child component per factory (or per lit element),
memoized separately." This spec proposes achieving the identical outcome — the expensive,
static work isolated from the once/sec tick — via a single `useMemo` inside `FactoryInner`
itself, rather than introducing a new React component boundary. Reasoning:

- The actual mechanism that stops React from redoing work on an unrelated re-render is
  memoization, not componentization — `React.memo` on a new child would still re-run that
  child's own body every time *its own* `useUIStore` subscription fired, which is exactly
  today's problem one level down. A child component only helps here if paired with the same
  `useMemo` split proposed below, at which point the child component itself adds nothing
  but prop-drilling.
- No new file, no new prop contract to keep in sync with `Actor`/`GreebleRendererContext`
  shapes, smaller diff, same performance ceiling.

**This is a deviation from the decision doc's literal wording, confirmed with the same
outcome. Flagged explicitly in §7 for sign-off before Tasks/Implement.**

### 1.3 Redesigned data flow (`Factory.tsx`)

```typescript
// FactoryInner — restructured body (illustrative; see §4 for full renderer code)
const staticVisual = useMemo(() => {
  const row = actor.config?.row ?? DEFAULT_FACTORY_ROW;
  const rowCfg = getRowConfig(row);
  const config = selectVariantFromSeed(actor.id, actor.position.x, row, rowCfg?.availableFactoryTypes);
  const sizeRange = VARIANT_CONF[config.variant].sizeRange;
  const { width, height } = calcSilhouetteSize(config.noiseValue, sizeRange);
  const shift = { hueShift: actor.config?.hueShift ?? 0, satShift: actor.config?.satShift ?? 0 };
  const shiftedColors = { /* shiftHSL(...) for body/accent/greeble/illuminated, unchanged */ };
  const buildingSeed = hashActorId(actor.id);
  const buildingPhase = buildingSeed % FLICKER_PERIOD;
  const actualWidth = width * (actor.scaleX ?? 1);
  const actualHeight = height * (actor.scaleY ?? 1);

  const layoutCtx: GreebleRendererContext = {
    buildingWidth: actualWidth, buildingHeight: actualHeight, roofY: 1,
    seed: buildingSeed, colors: shiftedColors, lMultiplier: 1, // lMultiplier unused by layout fns
    frontCornerX: (config.frontCornerX / 100) * actualWidth,
  };

  // 8 static-only greebles: unchanged registries, called once, cached forever.
  const staticRooftopElement = actor.config?.rooftopGreeble && !(actor.config.rooftopGreeble in ROOFTOP_LAYOUT_PAINT)
    ? ROOFTOP_RENDERERS[actor.config.rooftopGreeble](layoutCtx)
    : null;
  // ...facade equivalent, plus the belt-course zone breakdown (geometry only — zoneY/
  // zoneHeight/per-zone seed offset, no color) when beltCourseCount > 0.

  // 5 dynamic greebles: geometry only, via the new compute*Layout functions (§4).
  const rooftopLayout = actor.config?.rooftopGreeble && actor.config.rooftopGreeble in ROOFTOP_LAYOUT_PAINT
    ? ROOFTOP_LAYOUT_PAINT[actor.config.rooftopGreeble]!.compute(layoutCtx)
    : null;
  const facadeLayout = /* same idea per zone, for facadeGreeble */ null;

  return { config, width, height, shiftedColors, buildingSeed, buildingPhase, actualWidth, actualHeight, staticRooftopElement, /* staticFacadeElement, */ rooftopLayout, facadeLayout };
}, [actor.id, actor.position.x, actor.config?.row, actor.config?.hueShift, actor.config?.satShift,
    actor.config?.rooftopGreeble, actor.config?.facadeGreeble, actor.config?.beltCourseCount,
    actor.scaleX, actor.scaleY]);

// Every render (cheap): the lighting tick and paint only.
const localTime = useUIStore((s) => s.activeLocaleLocalTime ?? 12);
// ...eastLMultiplier/westLMultiplier/nightDepth/flickerEpoch, eastFill/westFill — unchanged math.

const rooftopElement = staticVisual.rooftopLayout
  ? ROOFTOP_LAYOUT_PAINT[actor.config!.rooftopGreeble!]!.paint(staticVisual.rooftopLayout, paintCtx)
  : staticVisual.staticRooftopElement;
```

`actor.config?.isOffline`/`offlineSince` are deliberately **excluded** from the memo's
dependency array (see §3 — no current renderer reads them; adding them now would be
speculative for a feature — BUILDING_DESIGN.md Goal 3 — not yet implemented).

### 1.4 The two shapes of layout/paint split, worked in full

**Polygon-based (rooftop, `renderPitchedRoof`/`renderCrownSpire`):** geometry is a small,
fixed set of point strings; paint is 1-2 `applyColorShift` calls per polygon.

```typescript
// rooftopGreebles.tsx — ADDED
export interface PitchedRoofLayout {
  slopePoints: string;
  wallPoints: string;
}

/** Geometry only — no color. Stable for the building's lifetime. */
export function computePitchedRoofLayout(ctx: GreebleRendererContext): PitchedRoofLayout | null {
  const { buildingWidth: bw, roofY, frontCornerX } = ctx;
  if (frontCornerX === undefined) return null; // signals the fallback (no-lighting-context) path
  const h = frontCornerX;
  const ridgeY = roofY - h;
  return {
    slopePoints: `0,${roofY} ${frontCornerX},${roofY} ${frontCornerX},${ridgeY}`,
    wallPoints: `${frontCornerX},${ridgeY} ${bw},${ridgeY} ${bw},${roofY} ${frontCornerX},${roofY}`,
  };
}

/** Color only — cheap, safe to call every render. */
export function paintPitchedRoof(layout: PitchedRoofLayout | null, ctx: GreebleRendererContext): GreebleElement | null {
  if (!layout || ctx.eastLMultiplier === undefined || ctx.westLMultiplier === undefined) {
    // Exact fallback branch from today's renderPitchedRoof — unchanged.
    const h = ctx.buildingWidth;
    const apexX = ctx.frontCornerX ?? ctx.buildingWidth / 2;
    const points = `0,${ctx.roofY} ${ctx.buildingWidth},${ctx.roofY} ${apexX},${ctx.roofY - h}`;
    return <polygon points={points} fill={hslToString(ctx.colors.accent)} />;
  }
  const noShift = { hueShift: 0, satShift: 0 };
  const westFill = applyColorShift(ctx.colors.accent, noShift, ctx.westLMultiplier);
  const eastFill = applyColorShift(ctx.colors.accent, noShift, ctx.eastLMultiplier);
  return (
    <>
      <polygon points={layout.slopePoints} fill={westFill} style={{ transition: FILL_TRANSITION }} />
      <polygon points={layout.wallPoints} fill={eastFill} style={{ transition: FILL_TRANSITION }} />
    </>
  );
}

/** Unchanged signature — existing callers/tests keep working byte-identical. */
export function renderPitchedRoof(ctx: GreebleRendererContext): GreebleElement | null {
  return paintPitchedRoof(computePitchedRoofLayout(ctx), ctx);
}
```

`computeCrownSpireLayout`/`paintCrownSpire` follow the identical pattern — layout returns
`{ tiers: { y, frontX, frontW, sideW, height }[], antenna: { x, y, width, height } }`
computed from `bh`/`seed`/`frontCornerX` only (unchanged math, `rooftopGreebles.tsx:138-203`);
paint assigns `westFill`/`eastFill` per tier/antenna exactly as today. `renderCrownSpire`
becomes a thin wrapper the same way.

**Per-item grid (facade, `renderSquareWindows`/`renderWideWindows`/`renderTallWindows`, all
via the shared `renderWindowGrid`):** geometry is "which grid slots have a window, and
where"; paint is "is this window lit, and what's its opacity/fill" — both already
seed-driven today, just currently computed in the same pass.

```typescript
// facadeGreebles.tsx — ADDED
export interface WindowLayoutItem {
  x: number; y: number; unitW: number; unitH: number;
  face: 'east' | 'west' | 'single'; // which lightness multiplier applies at paint time
  seed: number; r: number; c: number; // reconstructs the exact litRng Alea key at paint time
  opacityBase: number; // the existing (0.15 + prng()*0.3) random component — static, seed-derived
}

/** Geometry + existence only. No isLit/opacity/fill — those are paint. */
export function computeWindowGridLayout(
  ctx: GreebleRendererContext,
  type: 'squareWindows' | 'wideWindows' | 'tallWindows',
  threshold: number,
): WindowLayoutItem[] {
  // Same east/west recursive split + LCG existence loop as today's renderWindowGrid
  // (facadeGreebles.tsx:100-190), but stops before computing isLit/opacity/fill — pushes
  // a WindowLayoutItem per surviving slot instead of a <rect>. Face-offset seed (+500 for
  // the west sub-grid) and the existing east/west variable-naming (see current code's own
  // "Left portion = west face" comment on the variable literally named `eastCtx`) are
  // preserved exactly, not corrected — out of scope for a pure perf refactor (§3).
  /* ... */
  return [];
}

/** Color/lit-state only — cheap map over precomputed items, safe every render. */
export function paintWindowGrid(items: WindowLayoutItem[], ctx: GreebleRendererContext): GreebleElement {
  const windowFill = hslToString(colorTheme.glass.base);
  const illuminatedFill = ctx.colors?.illuminated ? hslToString(ctx.colors.illuminated) : windowFill;
  const nightDepth = ctx.nightDepth ?? 0;
  const flickerEpoch = ctx.flickerEpoch ?? 0;
  return (
    <>
      {items.map((item) => {
        const litRng = Alea(`${item.seed}-${flickerEpoch}-${item.r}-${item.c}`);
        const isLit = nightDepth > 0 && litRng() < nightDepth;
        const lMult = item.face === 'east' ? ctx.eastLMultiplier ?? ctx.lMultiplier ?? 1
          : item.face === 'west' ? ctx.westLMultiplier ?? ctx.lMultiplier ?? 1
          : ctx.lMultiplier ?? 1;
        return (
          <rect
            key={`${item.face}-${item.r}-${item.c}`}
            x={item.x} y={item.y} width={item.unitW} height={item.unitH}
            fill={isLit ? illuminatedFill : windowFill}
            opacity={item.opacityBase * (isLit ? nightDepth : lMult)}
          />
        );
      })}
    </>
  );
}

export function renderWindowGrid(ctx: GreebleRendererContext, type: 'squareWindows' | 'wideWindows' | 'tallWindows', threshold: number): GreebleElement {
  return paintWindowGrid(computeWindowGridLayout(ctx, type, threshold), ctx);
}
```

Registries (both files, ADDED — only the 5 dynamic entries; the other 8 types are absent
from these maps, which is how `Factory.tsx` tells "static, just memoize the plain call"
apart from "dynamic, use compute+paint"):

```typescript
// rooftopGreebles.tsx
export const ROOFTOP_LAYOUT_PAINT: Partial<Record<RooftopGreeble, {
  compute: (ctx: GreebleRendererContext) => unknown;
  paint: (layout: unknown, ctx: GreebleRendererContext) => GreebleElement | null;
}>> = {
  pitchedRoof: { compute: computePitchedRoofLayout, paint: paintPitchedRoof as (l: unknown, c: GreebleRendererContext) => GreebleElement | null },
  crownSpire: { compute: computeCrownSpireLayout, paint: paintCrownSpire as (l: unknown, c: GreebleRendererContext) => GreebleElement | null },
};
```

(A facade equivalent, `FACADE_LAYOUT_PAINT`, with `squareWindows`/`wideWindows`/
`tallWindows` entries — each `compute` bound to its own `threshold`.) The `unknown`/cast
here is a pragmatic type-erasure for a small heterogeneous map — see §3's note on not
introducing a stricter layout/paint context type split; **flagged in §7** in case a
discriminated union is preferred instead once Tasks sizes the actual diff.

---

## 2. Target File Structure

```text
src/
├── components/
│   └── actors/
│       ├── Factory.tsx                       # MODIFIED — §1.3 staticVisual restructure
│       ├── Factory.test.tsx                  # NEW — §5, no test file exists today
│       └── greebles/
│           ├── rooftopGreebles.tsx           # MODIFIED — §1.4, pitchedRoof/crownSpire split
│           ├── rooftopGreebles.test.tsx      # MODIFIED — §5, new layout/paint assertions
│           ├── facadeGreebles.tsx            # MODIFIED — §1.4, window grid split
│           └── facadeGreebles.test.tsx       # MODIFIED — §5, new layout/paint assertions
```

**Explicitly not touched, and why:**

- `greebleTypes.ts` — `GreebleRendererContext` keeps its current single shape, reused for
  both layout and paint function signatures (§3). No new exported types beyond the two
  small per-greeble layout interfaces added directly in `rooftopGreebles.tsx`/
  `facadeGreebles.tsx` (§1.4).
- `renderMachinery`, `renderSteppeRoof`, `renderAntennae`, `renderWaterTower`,
  `renderCupola`, `renderPipesValves` (rooftop), `renderPipesValvesFacade`, `renderBeltCourse`
  (facade) — zero code changes. Memoized wholesale from `Factory.tsx` (§1.3); their own
  files/tests are untouched.
- `factoryVariants.ts`, `silhouetteUtils.ts`, `colorUtils.ts`, `lightingUtils.ts` — all
  reused exactly as today; no signature changes.
- `BubbleStream.tsx`, `FactoryBubbleStream.test.tsx` — bubble eligibility/rendering is
  unrelated to the lighting tick; unaffected.
- `RobotBody.tsx` — same bug pattern, deliberately out of scope (§1.1, §7).

No new dependency. No `uiStore.ts` change — `activeLocaleLocalTime`'s shape/semantics are
unchanged; this is purely about how often downstream consumers redo expensive work in
response to it.

---

## 3. Implementation Boundaries & Constraints

- **Strict Scope:** Touch only the files listed in §2 unless explicitly directed otherwise.
- **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public
  build assets.
- **Zero visual regression:** this is a pure performance refactor. For any given
  `(actor, activeLocaleLocalTime)` pair, rendered output (element structure, fills,
  opacities) must be byte-identical to today's — including the existing east/west
  variable-naming quirk in `renderWindowGrid` (§1.4) and every renderer's "fallback path"
  behavior when lighting context is absent (used by the existing unit tests' minimal
  `ctx` fixtures). Any observed difference during manual verification (§5) is a bug in the
  refactor, not an intended change.
- **Per CLAUDE.md:** no `setTimeout`/`setInterval`/`requestAnimationFrame` introduced —
  none is needed; this is pure `useMemo`-based memoization. No GSAP touched (nothing here
  is an animation in the CLAUDE.md sense — `FILL_TRANSITION` is a plain CSS `transition`,
  already the case today, unchanged). No Zustand state shape changes. No conflict with any
  "Absolutely forbidden"/Guardrail item identified.
- **`GreebleRendererContext` is not split into separate layout/paint types.** Reusing the
  existing shape for both `compute*`/`paint*` function signatures avoids touching every one
  of the 13 renderers' type signatures for a distinction only 5 of them need. Flagged as a
  judgment call in §7 — revisit if Tasks finds the `unknown`-typed `ROOFTOP_LAYOUT_PAINT`/
  `FACADE_LAYOUT_PAINT` maps (§1.4) too loose in practice.
- **`renderBeltCourse` is out of scope** — confirmed dead from `Factory.tsx`'s actual render
  path (belt courses render as inline `<rect>`s there instead); no memoization need.
- **`actor.config?.isOffline`/`offlineSince` are excluded from `staticVisual`'s dependency
  array** — no current renderer reads them for geometry or color; BUILDING_DESIGN.md's Goal
  3 (offline visual effects) isn't implemented yet. Do not implement Goal 3 as part of this
  fix — flagged in §7 for whoever picks that goal up next to re-check this memo's deps then.
- **`RobotBody.tsx`'s identical bug pattern is out of scope** — do not fix it as a "while
  I'm in here" addition; it's a separate component with its own test surface and its own
  backlog decision to make (§7).
- **No new dependency.**

---

## 4. Code Style & Architecture Conventions

Full code shapes given inline in §1.3–§1.4. Conventions:

- **Naming:** `compute<Greeble>Layout` / `paint<Greeble>` — verb-first, mirrors this
  codebase's existing `derive*`/`calc*`/`apply*` naming register (`deriveWindowGrid`,
  `calcSilhouetteSize`, `applyColorShift`). Existing `render<Greeble>` names are kept as
  thin compatibility wrappers, not renamed or removed.
- **Formatting:** matches each touched file's existing style exactly — plain exported
  functions (not classes), JSDoc on every new exported function matching the density
  already present in both greeble files.
- **`ROOFTOP_LAYOUT_PAINT`/`FACADE_LAYOUT_PAINT`:** `SCREAMING_SNAKE_CASE`, `Partial<Record<...>>`
  — same shape convention as `ROOFTOP_RENDERERS`/`FACADE_RENDERERS` (`Record<Greeble, GreebleRenderer>`),
  just partial since only some greeble types opt into the split.

---

## 5. Testing & Verification Requirements

- **Framework:** Vitest + React Testing Library.
- **Test File Locations:** Colocated, matching §2.

**`Factory.test.tsx` (NEW):** the codebase's first test file for this component. Reuse
`FactoryBubbleStream.test.tsx`'s fixture pattern (`makeActor`, `TEST_ATTENUATION_STYLE`,
`TEST_LOCALE`, `useAttenuationStyleStore`/`useLocaleStore` `setState`, `BubbleStream`
mocked) plus `useUIStore.setState({ activeLocaleLocalTime })` to drive the tick directly
without real timers.

- **Baseline behavior (no refactor needed to pass — write and land first, per the backlog's
  own step ordering; see §7):** renders a factory of each `FactoryVariant` without
  crashing; body fill (`eastFill`/`westFill`) changes when `activeLocaleLocalTime` changes
  between a "day" and "night" value.
- **The regression test the whole fix is for:** spy on `selectVariantFromSeed` (or another
  function only the static/geometry path calls, e.g. `computeWindowGridLayout` once it
  exists) and assert its call count does **not** increase across two `act(() =>
  useUIStore.getState().setActiveLocaleLocalTime(...))` calls with different values on an
  already-mounted `Factory` — proving the expensive path only runs once per mount, not once
  per tick. Exact spy target left for Tasks to pick once the refactor's real call graph is
  final.
- **Visual-identity check for the 8 static-only greeble types:** render a factory with each
  of `machinery`/`steppeRoof`/`antennae`/`waterTower`/`cupola`/`pipesValves` (rooftop) and
  `pipesValves`/`squareWindows`-adjacent belt courses, capture `container.innerHTML`,
  change `activeLocaleLocalTime`, re-render, and assert the markup for that greeble is
  unchanged (proves the wholesale-memoization path doesn't drop updates it shouldn't, and
  doesn't accidentally freeze something that should change).
- **Lighting-dependent check for the 5 dynamic types:** for `pitchedRoof`/`crownSpire`/
  each window type, assert the rendered fill/opacity actually changes between a day and a
  night `activeLocaleLocalTime` value (proves the split didn't accidentally freeze the
  paint path along with the geometry).

**`rooftopGreebles.test.tsx` (MODIFIED):** add, per split renderer (`pitchedRoof`,
`crownSpire`):
- `compute*Layout(ctx)` returns the same layout object (deep-equal) regardless of
  `eastLMultiplier`/`westLMultiplier`/`nightDepth`/`flickerEpoch` values in `ctx` — proves
  it's genuinely lighting-independent.
- `paint*(layout, ctx)` produces different fills for two `ctx`s that differ only in
  `eastLMultiplier`/`westLMultiplier`, given the identical `layout`.
- `render*(ctx)` (the unchanged compatibility wrapper) still passes every existing
  assertion in this file byte-for-byte — no existing test in this file should need editing,
  only additions.

**`facadeGreebles.test.tsx` (MODIFIED):** same pattern for `computeWindowGridLayout`/
`paintWindowGrid`, plus: existence (which grid slots produce a `WindowLayoutItem`) is
identical across two calls with different `flickerEpoch`/`nightDepth` but the same `seed`
— proves existence is decided at layout time, not re-rolled by the paint-time tick.

* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass, including every existing
     `rooftopGreebles.test.tsx`/`facadeGreebles.test.tsx`/`FactoryBubbleStream.test.tsx`
     assertion unmodified.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated), closing the loop the backlog itself specified:**
  re-profile with React DevTools Profiler's Ranked view exactly as Crawford did to find
  this bug (2026-09-14) — open a locale with ~36 factories, record ~2s of idle time with
  the world view open, and confirm the once/sec `FactoryInner` re-render no longer shows
  the greeble-generation functions (`ROOFTOP_RENDERERS`/`FACADE_RENDERERS`/
  `computeWindowGridLayout` et al.) in the flame graph — only the cheap paint-side work
  (`applyColorShift` calls) should appear. Compare total main-thread time for the tick
  against the ~150ms baseline recorded in the backlog entry.

---

## 6. Documentation & Git/Workflow Context

- **`docs/BUILDING_DESIGN.md` update:** the "Greeble Renderers" section's `GreebleRenderer`
  type signature and prose describe renderers as single-pass `(ctx) => JSX` functions;
  worth a short addendum once implemented noting the layout/paint split exists internally
  for the 5 lighting-dependent renderers, and that `render<Greeble>` remains the stable
  public entry point. Not required before merge; flagged so it isn't silently missed.
- **Git Handling:** Human operator handles all branch creation, staging, commits, and
  merges manually.
- **Branch:** `refactor/factory-timing` (already cut from `main` at the start of this
  session — confirmed via `git merge-base`).
- **Commit Pattern:** No enforced conventional-commit format — short, imperative,
  descriptive sentences. Given the backlog's own specified ordering (tests before refactor,
  §7), expect at least: (1) `Factory.test.tsx` baseline tests, (2) rooftop split, (3)
  facade split, (4) `Factory.tsx` `staticVisual` restructure — left for the Plan/Tasks phase
  to actually sequence and size.
- **`docs/todo/backlog.md` item 21:** once this spec is approved, add a line linking to this
  file (matching how other backlog items reference their spec once one exists); once shipped
  and live-re-profiled per §5's manual check, mark the item fixed with the profiler evidence,
  matching items 14-18's own "found → fixed → live-verified" documentation pattern.

---

## 7. Open Questions & Risks

Resolved during Specify:

- ~~CSS custom properties vs. layout/paint split vs. coarse per-factory wrapper?~~
  **Resolved: layout/paint split** (confirmed directly, this session).
- ~~Which of the 13 renderers actually need the split?~~ **Resolved: 5** — `pitchedRoof`,
  `crownSpire` (rooftop), `squareWindows`/`wideWindows`/`tallWindows` (facade) — the other 8
  read no lighting field and are memoized wholesale instead (§1.1).

Resolved after Specify (confirmed directly with Crawford, 2026-09-14 — see
`docs/tasks/FACTORY_LIGHTING_RERENDER.md`'s "Confirm Open Judgment Calls" checkpoint):

- ~~**`useMemo` vs. a new child component (§1.2)?**~~ **Resolved: `useMemo`.** The plain
  memoization boundary this spec already proposed stands — no new child component. §1.3's
  restructure is implemented as written.
- ~~**`ROOFTOP_LAYOUT_PAINT`/`FACADE_LAYOUT_PAINT`'s `unknown`-typed shape vs. a
  discriminated union (§1.4, §3)?**~~ **Resolved: keep the pragmatic `unknown`-typed
  maps.** No discriminated union — the loose typing this spec already proposed stands.

Still open — flag for Tasks/implementation, not blocking this spec:

1. **`RobotBody.tsx`'s identical `activeLocaleLocalTime` re-render pattern (§1.1, §3).**
   Found during this spec's research. Now filed as
   [docs/todo/backlog.md #22](../todo/backlog.md#22-robotbody-every-robot-re-renders-oncesec-for-daynight-lighting) —
   not part of this spec or its task breakdown.
2. **Test-writing order relative to the backlog's own 3-step plan.** The backlog says
   "(1) add test coverage for `Factory.tsx` first ... (2) a spec-driven-development pass ...
   (3) implement" — this spec is step 2, produced before `Factory.test.tsx` (step 1) exists.
   `docs/tasks/FACTORY_LIGHTING_RERENDER.md`'s Task 1 sequences the new baseline tests as
   the first implementation task (so they also serve as a safety net during the refactor
   itself) — resolved there, not by this spec directly.
3. **`docs/BUILDING_DESIGN.md` addendum (§6)** — not performed as part of writing this spec;
   tracked as Task 5's optional closing item in the task breakdown.
