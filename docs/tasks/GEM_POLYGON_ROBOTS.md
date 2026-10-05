# Implementation Plan: Gem Polygon Robots — Branch A

Spec: [docs/specs/GEM_POLYGON_ROBOTS.md](../specs/GEM_POLYGON_ROBOTS.md). Intent:
[docs/intent/gem-polygon-robots.md](../intent/gem-polygon-robots.md). Sketch (Gate 1 passed
2026-10-04): [docs/sketches/gem-polygon-robots.html](../sketches/gem-polygon-robots.html). Branch
`back-to-gen-robots` from `main` (`fe306004`), record commit `1db5d0a3`. Roadmap Phase 39.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`,
`npm run build`, `npm run dev`, `npm run perf:idle` (after `npm run build && npx vite preview --port 4173`).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the
repo convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

Thirteen tasks in four phases. Phase 1 builds the generator, shading and palette as pure modules
with no importer, each property-tested over thousands of seeds. Phase 2 adds the seed to the robot,
the renderer, and swaps `RobotBody` over to it — the first moment the live app shows the new
robots — ending at Crawford's Gate 2. Phase 3 is the idle-paint perf gate (stop and report). Phase
4 deletes the four shapes, greebles and sockets, rewrites the guardrail and docs. Every task leaves
types, lint and the suite green; RED first, one commit per task; mutation-check every rule test by
breaking the cap it guards and watching it fail.

## Architecture Decisions

- **Seed only in state** (Crawford, 2026-10-04): `Robot.gemSeed: number`; `getRobotGem(seed)` is a
  module-level `Map` cache in front of the pure generator. Fixtures set an integer and the cache
  derives the geometry, so the 13 test files that build `Robot` literals change one line each.
- **Port the sketch, don't redesign it.** `polygon.ts` is the sketch's `<script>` with types; the
  rule constants carry a comment naming their sketch value. A rule change lands in the sketch first.
- **Old and new coexist through Phase 2.** `RobotBody` switches renderer in Task 7 while the shape
  files still exist unused; deletion waits for Gate 2 and the perf gate so a "no" at either is a
  one-commit revert of the swap, not a restore of ten files.
- **Memo split survives.** Task 7 copies today's `RobotBody` line for line: audio values in the
  memo, identity/battery/daylight/gem outside; the item-22 spy test is the guard.

## Dependency Graph

```
T1 polygon rules+inset ─► T2 lines/lights/generateRobotGem/cache ─┐
T3 gemShading ──────────────────────────────────────────────────────┼─► T5 RobotGem renderer ─┐
T4 gemPalette (+layerLitLevel move) ────────────────────────────────┘                          ├─► T7 RobotBody swap ─► T8 card/avatar viewBox ─► Checkpoint B (Gate 2)
T6 gemSeed on type + spawn + fixtures ──────────────────────────────────────────────────────────┘                                                      │
                                                                                                                  T9 perf gate ◄─────────────────────┘
                                                                                                                       │
                                            T10 delete components/helpers ─► T11 delete greeble data ─► T12 guardrail + docs test ─► T13 ROBOT_DESIGN/roadmap/headers
```

Parallelisable: T1→T2 ‖ T3 ‖ T4 ‖ T6. T5 needs T2, T3, T4. T7 needs T5, T6.

## Task List

### Phase 1: Pure modules (no importer)

## Task 1: `polygon.ts` — rules, `genPolygon`, `inset`

**Description:** Port the sketch's corner-cut generator and miter inset to
`src/components/robot/gem/polygon.ts`: `GemPoint`, `PolygonRules`, `BASE_RULES` / `MAIN_RULES` /
`ORBIT_RULES`, `TAN`, `CORNERS`, `genPolygon(R, w, h, rules)` (with the 45 %-of-edge cap and the
25 %-of-short-side step floor), `edgeNormals` (winding-based), `inset(pts, d)`, `isSymmetric`,
`pointInPolygon`. Stream type `Rng = () => number`.

**Acceptance criteria:**
- [ ] Over ≥ 2 000 seeds (`alea`) × box sizes {25×25, 32×32, 24×36, 24×16} × each rule set: 8 ≤
      sides ≤ 12; right ≤ 4; concave ≤ `rules.maxConcave`; every edge angle within 1e-6 of a 15°
      multiple; all four box edges touched; `MAIN_RULES` output never mirror-symmetric; `BASE_RULES`
      output convex; no self-intersection (no two non-adjacent edges cross).
- [ ] `inset(pts, min(2.5, 0.18 × min(w, h)))` vertices all inside `pts` for every polygon above.
- [ ] `genPolygon` never returns null across the sweep.
- [ ] Mutation check recorded in the commit message: raising the edge cap to 0.6 makes the
      self-intersection test fail; removing the step floor makes the inset test fail.

**Verification:** `npx vitest run src/components/robot/gem/polygon.test.ts`; `npm run build:types`;
`npm run lint`. **Dependencies:** None. **Files:** `gem/polygon.ts`, `gem/polygon.test.ts`.
**Scope:** M.

## Task 2: Lines, lights, `generateRobotGem`, `getRobotGem`, `gemWidth`

**Description:** Add `genLine(R, inner)` (45° + axis segment, endpoints 0.4 inside, ≤ 60 tries),
`genLights(R, inner)` (two non-adjacent inner vertices pulled 30 % to the centroid), `GemPart`,
`RobotGem`, `WIDTH_FACTORS`, `GEM_CANVAS_H = 80`, `ORBITER_W = 24`, `ORBITER_H = 16`,
`generateRobotGem(R)` in draw order (backing, 4 orbiters, midLeft, midRight, top — see the spec's z-order correction),
`gemWidth(gem)`, and `getRobotGem(seed)` — a `Map<number, RobotGem>` cache over
`generateRobotGem(alea(String(seed)))`. Pin one fixture seed's output to `gem.fixture.json`.

**Acceptance criteria:**
- [ ] Over ≥ 2 000 seeds: every line has 2–3 points, every segment at 0°/45°/90° (±1e-6), every
      point inside the part's inner polygon; top has 4 lines + 2 lights, mids 2 + 0, orbiters 1 + 0,
      backing 0 + 0; the two lights are non-adjacent inner vertices; orbiters are exactly 24×16 for
      every width factor; mids are 20–24k × 34–36; `gemWidth` = 80 × widthFactor.
- [ ] `getRobotGem(s) === getRobotGem(s)` (same reference) and deep-equals
      `generateRobotGem(alea(String(s)))`; different seeds differ.
- [ ] `getRobotGem(FIXTURE_SEED)` deep-equals `gem.fixture.json`.

**Verification:** `npx vitest run src/components/robot/gem/polygon.test.ts`; `npm run build:types`.
**Dependencies:** T1. **Files:** `gem/polygon.ts`, `gem/robotGem.test.ts`, `gem/gem.fixture.json`.
**Scope:** S.

## Task 3: `gemShading.ts`

**Description:** `GEM_BEVEL_DEPTH = 2.5`, `GEM_LIGHT` (normalised (−0.55, −0.83)),
`GEM_FACET_CONTRAST = 20`, `bevelDepth(w, h)`, `facetShade(normal)`,
`facetTone(baseHex, shade, contrast)` → an `hsl()` string, and `hexToHsl`. Uses T1's
`edgeNormals`.

**Acceptance criteria:**
- [ ] `edgeNormals` point outward on a clockwise square and a counter-clockwise square (dot with
      edge-midpoint-minus-centroid > 0 on all four).
- [ ] A top edge and a left edge shade > 0; bottom and right < 0; `facetTone` lightness is
      monotonic in shade; contrast 0 returns the base lightness.
- [ ] `bevelDepth(24, 16)` = 2.5 (cap not hit), `bevelDepth(10, 10)` = 1.8.

**Verification:** `npx vitest run src/components/robot/gem/gemShading.test.ts`.
**Dependencies:** T1. **Files:** `gem/gemShading.ts`, `gem/gemShading.test.ts`. **Scope:** S.

## Task 4: `gemPalette.ts` and `layerLitLevel`

**Description:** `GEM_BACKING`, `GEM_BACKING_STROKE`, `GEM_MID_DARK`, `GEM_LIGHT_COLOR`,
`tone(hex, dl, ds)`, `blendHsl(a, b, t)`, and `gemPalette(identityHex, lightnessMultiplier,
midLit: [number, number], facetContrast)` returning every fill/line/stroke string the renderer
needs (`GemPalette`). Rename `socketLitOpacity` → `layerLitLevel` **in place in
`robotVisualHelpers.ts`** (spec §1.7) with its constants renamed (`MID_DARK_LEVEL` 0.15,
`MID_LIT_MIN` = `LAMP_MIN`, `MID_GAIN_MAX` 1.2), keeping the old names as aliases until T10 so the
sockets keep compiling. *(As built: an earlier draft moved it into `gemPalette.ts`, which would
cycle with `LAMP_MIN`; the palette takes the lit level as an input instead. It also takes `gem`,
because facet tones depend on each edge's normal.)*

**Acceptance criteria:**
- [ ] `layerLitLevel` cases carried over verbatim from `socketLitOpacity`'s tests (0/undefined →
      0.15; 1.2 → 1; 2 → 1; 0.2 → 0.4 + 0.6 × (0.2/1.2); monotonic).
- [ ] `midLit = 0` → mid fill `GEM_MID_DARK`; `midLit = 1` → `tone(identity, −16, −18)`; 0.5 lies
      between in lightness.
- [ ] `lightnessMultiplier` 0.5 halves the lightness of every entry vs 1; top/orbiter fill is the
      identity hex's hue/sat exactly at multiplier 1.

**Verification:** `npx vitest run src/components/robot/gem/gemPalette.test.ts src/components/robot/robotVisualHelpers.test.ts`.
**Dependencies:** None. **Files:** `gem/gemPalette.ts`, `gem/gemPalette.test.ts`,
`robotVisualHelpers.ts`, `robotVisualHelpers.test.ts`. **Scope:** S.

### Checkpoint A: Pure modules
- [ ] T1–T4 green, `npm run build:types`, `npm run lint`, full `npm test` unchanged elsewhere.
- [ ] Nothing imports `gem/` yet (`grep -rn "robot/gem" src` → only tests).
- [ ] Both mutation checks from T1 recorded.

### Phase 2: Renderer and the swap

## Task 5: `RobotGem.tsx` draw-only renderer

**Description:** Memo component taking `gem`, `palette`, `lightOpacity`, `scale` (as built: the
palette already carries the Mid lit levels and facet contrast, so `midLit`/`facetContrast` props
were dropped); emits the spec §1.5 DOM (`g.gem` scaled about the canvas centre; backing, four
orbiters, mid--left, mid--right, top; facets, face, lines, two lights). No colour computed inside.

**Acceptance criteria:**
- [ ] DOM order backing → orbiter ×4 → `.gem__mid--left` → `.gem__mid--right` → `.gem__top`.
- [ ] `.gem__facet` count per bevelled part = that part's side count; 0 on the backing; lines
      4/2/2/1; exactly 2 `.gem__light` and only inside `.gem__top`; light opacity attribute equals
      `lightOpacity`.
- [ ] Every fill equals the string in the palette passed in (no `hsl(` literal in the file).
- [ ] `g.gem`'s transform contains `scale(${scale})` with the canvas centre as origin; drawable
      element count asserted **exactly** = 1 + Σ(sides + 1 + lines) + 2 per light, so perf cuts are
      visible. (As built: "≤ 100" was wrong — an all-12-sided robot draws ~120.)

**Verification:** `npx vitest run src/components/robot/gem/RobotGem.test.tsx`.
**Dependencies:** T2, T3, T4. **Files:** `gem/RobotGem.tsx`, `gem/RobotGem.test.tsx`. **Scope:** S.

## Task 6: `gemSeed` on the type and at spawn

**Description:** `Robot.gemSeed: number` (required) with the spec §1.1 comment; `spawnSystem.ts`
draws `Math.floor(getSeededVal(noiseMap, 'robot.gem.seed', spawnCount, 0, 2 ** 31))` beside
`identityColor`, outside the copy branch. The required field fans out to every `Robot` literal in
tests (13 files, one `gemSeed: <int>` line each) — mechanical, accepted over the ~5-file guideline
because a temporary optional field would need a fallback in T7 that would then have to be removed.

**Acceptance criteria:**
- [ ] Every spawned robot has an integer `gemSeed` in [0, 2³¹); same noise map + offset → same
      seed; a copy-spawned robot's `gemSeed` differs from its source's and equals an independent
      spawn's at the same count.
- [ ] `npm run build:types` clean across all fixtures; no fixture gains a `RobotGem`.

**Verification:** `npx vitest run src/systems/spawnSystem.test.ts`; `npm run build:types`;
`npm test`. **Dependencies:** None (T2 for the type import only). **Files:** `types/Robot.ts`,
`systems/spawnSystem.ts`, `systems/spawnSystem.test.ts`, + 13 fixture files (one line each).
**Scope:** M (mechanical).

## Task 7: `RobotBody` composes `RobotGem` — the swap

**Description:** Rewrite `RobotBody`: the audio memo returns `lampIntensity`, `scale`, `midLit`
(`layerLitLevel` of `layers[1]`/`[2]`); outside it, `identityColor`, `dimOpacity`,
`lightnessMultiplier`, `getRobotGem(robot.gemSeed)`, `gemPalette(...)`, light opacity
`(LAMP_MIN + (1 − LAMP_MIN) × lampIntensity) × dimOpacity`, facet contrast
`GEM_FACET_CONTRAST × max(dimOpacity, 0.25)`. Drop `hideGreebles`. Rewrite `RobotBody.test.tsx`;
the shape files, greebles and sockets are left in place, unused.

**Acceptance criteria:**
- [ ] Item-22 spy test kept (a lightness tick does not recompute the audio memo); same for a
      battery-only and an identity-only change.
- [ ] Changing only `identityColor` changes `.gem__top`/`.gem__orbiter` face fills and nothing in
      the memo; `layers[1].gain` 0 → 1 changes only `.gem__mid--left`'s fill; `layers` undefined →
      both mids `GEM_MID_DARK`; critical battery multiplies light opacity by 0.1 and lowers contrast.
- [ ] `Robot.tsx` untouched; `npm run dev` shows gem robots swimming and flipping.

**Verification:** `npx vitest run src/components/robot/RobotBody.test.tsx`; `npm test`;
`npm run dev`. **Dependencies:** T5, T6. **Files:** `RobotBody.tsx`, `RobotBody.test.tsx`.
**Scope:** M.

## Task 8: Card and avatar viewBox

**Description:** `RobotSelectionCard` and `RobotDisplaySection` use
`viewBox={gemViewBox(getRobotGem(robot.gemSeed))}` with `preserveAspectRatio="xMidYMid meet"` and
pass `ignoreScale` to `RobotBody` (as built — see the spec §1.6 finding: scale > 1 clipped the
orbiters; Crawford chose "fit each robot"). The card's `hideGreebles` was already dropped in T7.

**Acceptance criteria:**
- [ ] Both tests assert the per-robot viewBox for width factors 1 and 2, letterboxing, and scale 1
      on a maximum-scale (bass, instant-attack) robot.
- [ ] No `hideGreebles` anywhere in `src/` outside the docs tests.

**Verification:** `npx vitest run src/components/selection/RobotSelectionCard.test.tsx src/components/robot/RobotDisplaySection.test.tsx`.
**Dependencies:** T7. **Files:** `RobotSelectionCard.tsx`, `.test.tsx`, `RobotDisplaySection.tsx`,
`.test.tsx`. **Scope:** S.

### Checkpoint B: Gate 2 (Crawford, by eye — stop and report)

> **Passed 2026-10-05** (Crawford: "Passed — do T9–T13"). Tuning constants accepted as-is.
- [ ] World, 96 px avatar and 64 px card all show gem robots; each is recognisably the same robot
      across the three; the orbiters sit clear of the body at rest.
- [ ] A gain drag re-lights its Mid live; a company broadcast re-lights every member; day/night and
      battery still read; a waveform change does not alter the geometry.
- [ ] Spec §7 tuning items (contrast 20, bevel 2.5, battery contrast floor 0.25, equal lights)
      accepted or adjusted — adjustments go to the sketch first, then the constants.
- [ ] A "no" here = revert T7/T8 (two commits); T1–T6 stay as the record.

### Phase 3: Perf gate

## Task 9: Idle-paint A/B

> **Run 2026-10-05 — gate MISSED; stopped and reported** (docs/PERFORMANCE.md "Gem Polygon Robots —
> the Task 9 idle-paint gate"). Paint +94 %, busy +14 %, outside noise in every round. Cause is
> element count (~87 shapes/robot vs ~35), not area. Cut 1 (orbiter lines) changes nothing; cut
> 1+2 (facet strokes) recovers ~30 ms paint of ~185. T10–T13 wait for Crawford's decision.
>
> **Decision 2026-10-05 (Crawford): merge into paths.** Estimated drawn shapes per robot over 500
> robots: today 87.7, exact-tone merge 78.6, 4 tones 47.0, 3 tones 39.8 (old robots ≈ 35). Exact
> merging alone cannot pass (paint has tracked shape count), so T9a builds the merge (no visual
> change) and T9b quantizes tones, sketch-checked before it lands.

## Task 9a: Facets and lines drawn as merged paths

**Description:** `RobotGem` draws each bevelled part's facets as one `<path class="gem__facets">` per
distinct facet fill (subpaths = that fill's facet quads, first-appearance order) and the part's
boundary lines as one `<path class="gem__lines">`. Pure path builders in `gem/gemPaths.ts`. No
palette change — at today's per-edge tones this is visually unchanged (stroke overlap order at
shared facet edges may differ by a fraction of the 0.25 stroke).

**Acceptance criteria:**
- [ ] Facet subpaths across a part's `.gem__facets` paths = its side count; one path per distinct
      fill; each subpath is that facet's outline/inset quad; lines one path per part with
      subpaths = line count; element-count formula updated.
- [ ] Every fill/stroke still a palette string; RobotBody/avatar/card tests re-pointed.

**Verification:** `npx vitest run src/components/robot/`; `npm test`. **Dependencies:** T9.
**Files:** `gem/gemPaths.ts` (+test), `gem/RobotGem.tsx` (+test), `RobotBody.test.tsx`,
`RobotDisplaySection.test.tsx`. **Scope:** M.

## Task 9b: Quantized facet tones (sketch-gated)

> **Done 2026-10-05.** Measured (docs/PERFORMANCE.md follow-up): 3 tones → busy +6 % / paint
> +34 % over main (from +14 % / +94 %); merge-only was worse than unmerged, so 9a only pays off
> with tones. Crawford: **ship 3 tones, residual accepted.** `GEM_FACET_TONES = 3`.

**Description:** Facet shade quantized to `GEM_FACET_TONES` levels per part (3 or 4) before
`facetTone`, so T9a's merge collapses to ~40–47 shapes per robot. Sketch gets a tones toggle; a
3-tone build is A/B'd against `main` with T9's method. **Stop and report** with the sketch and the
numbers — lands only on Crawford's yes.

**Dependencies:** T9a. **Files:** `gem/gemShading.ts`, `gem/gemPalette.ts` (+tests), the sketch,
`docs/PERFORMANCE.md`. **Scope:** S + measurement.

**Description:** `npm run build && npx vite preview --port 4173`, then `npm run perf:idle` on the
same `?session=` link on `main` and on this branch, foreground, one run at a time, no orphaned
Chrome (docs/PERFORMANCE.md). Add a row to the PERFORMANCE.md baseline table.

**Acceptance criteria:**
- [ ] Paint/composite totals within the 17.2.5 noise band of `main`, recorded with both numbers.
- [ ] On a miss: drop orbiter lines (T5's count assertion updated), re-measure; still a miss →
      drop facet strokes; still a miss → stop and report.

**Verification:** the two harness outputs in the commit message. **Dependencies:** Checkpoint B.
**Files:** `docs/PERFORMANCE.md` (+ `gem/RobotGem.tsx` only on a miss). **Scope:** XS–S.

### Phase 4: Deletions, guardrail, docs

## Task 10: Delete the shape, greeble and socket components and dead helpers

> **As built (2026-10-05):** `RobotGreebles.tsx` and `greebleSlots.ts` moved to Task 11 —
> `spawnSystem.ts` still imports their `KIND_COUNT`/`SLOT_COUNT` for the greeble draws Task 11
> removes. `calculateScale` kept (`calculateBodyScale` calls it; the spec listed it in error).
> The old docs tests lose only their rows for deleted symbols (the T7 precedent); their
> guardrail assertions live until Task 12. Removal pinned by `legacyRemoval.test.ts`.

**Description:** Delete `RobotSleek/Angular/Organic/Industrial.tsx`, `RobotGreebles.tsx`,
`RobotLayerSockets.tsx`, `greebleSlots.ts`, their tests and `robotShapeVariants.test.tsx`. Remove
from `robotVisualHelpers.ts`: `selectRobotShape`, `RobotSVGComponent`, `RobotColors`,
`generateColors`, `hueOffset`, `toSaturation`, `toLuminance`, `shapeParamsFromAudio`, `ShapeParams`,
`MicroVariants`, `calculateScale`, `applyLightnessMultiplier`, `identityGlass`, the `SOCKET_*`
re-exports; prune their tests. Keep `bodyShapeFromAdsr`, `BODY_NORMALISER`, `calculateBodyScale`,
`BODY_SCALE_MIN`, `LAMP_MIN`, `calculateLampIntensity`, `computeBatteryDimOpacity`.

**Acceptance criteria:**
- [ ] `grep -rn "RobotSleek\|RobotGreebles\|RobotLayerSockets\|greebleSlots\|identityGlass\|socketLitOpacity\|generateColors" src` → nothing.
- [ ] Suite, types, lint green; the three robot docs tests still pass (they are replaced in T12).

**Verification:** `npm test`; `npm run build:types`; `npm run lint`. **Dependencies:** T9.
**Files:** 12 deletions + `robotVisualHelpers.ts`/`.test.ts`. **Scope:** M (deletion).

## Task 11: Delete the greeble data

**Description:** Remove `Greeble`, `Robot.greebles`, `generateGreebles`, `GREEBLE_COUNT_RANGE` and
the `'robot.greeble.*'` draws; remove the `greebles:` line from the 13 fixtures and the greeble
cases from `spawnSystem.test.ts`.

**Acceptance criteria:**
- [ ] `grep -rni "greeble" src` → nothing outside `src/docs/` (T12 clears that).
- [ ] Suite, types, lint green.

**Verification:** `npm test`; `npm run build:types`. **Dependencies:** T10. **Files:**
`types/Robot.ts`, `spawnSystem.ts`, `spawnSystem.test.ts`, + 13 fixture files (one line each).
**Scope:** M (mechanical).

## Task 12: Guardrail rewrite and the docs test

**Description:** Replace the "three documented non-audio carriers" sentence in CLAUDE.md,
`.github/copilot-instructions.md` and `Robot.ts`'s `identityColor` comment with spec §1.8's
sentence (one commit, three places). Replace `robotLiveVisualsDocs`, `robotGreeblesDocs` and
`robotLayerMarkersDocs` tests with `gemPolygonRobotsDocs.test.ts`.

**Acceptance criteria:**
- [ ] The new test asserts the §1.8 sentence in all three places and that none of them, nor
      ROBOT_DESIGN.md, contains `greebles`, `socket` or `window glass`.
- [ ] RED first: the new test fails on the pre-rewrite wording.

**Verification:** `npx vitest run src/docs/`; `npm test`. **Dependencies:** T11. **Files:**
`CLAUDE.md`, `.github/copilot-instructions.md`, `types/Robot.ts`, `src/docs/` (3 deletions, 1 new).
**Scope:** S.

## Task 13: ROBOT_DESIGN.md, roadmap, superseded headers

**Description:** Rewrite `docs/ROBOT_DESIGN.md` around spec §1.1–§1.6 (rulebook, bevel, palette,
layout, what audio drives, the two overlays, forbidden patterns). Add roadmap `## 39. Gem Polygon
Robots (Branch A)` with the decisions and gates. Add "superseded by gem-polygon-robots" headers to
`docs/ideas/robot-visual-rework.md` and `docs/ideas/layer-pods-and-follow-through.md`; add a
"Shipped" header to the sketch; mark the spec and intent Shipped.

**Acceptance criteria:**
- [ ] `gemPolygonRobotsDocs.test.ts` extended to pin ROBOT_DESIGN.md's section headings and the
      roadmap entry; `npm test` green.
- [ ] CLAUDE.md's reference-docs line for ROBOT_DESIGN.md updated to describe the generator.

**Verification:** `npm test`; `npm run lint`. **Dependencies:** T12. **Files:** `ROBOT_DESIGN.md`,
`docs/todo/roadmap.md`, two idea docs, the sketch, spec, intent, CLAUDE.md, the docs test.
**Scope:** M (docs).

### Checkpoint C: Complete (Crawford)
- [ ] `npm test`, `npm run build:types`, `npm run lint`, `npm run build` all clean.
- [ ] `git diff --name-only main...HEAD` contains nothing outside the files named above.
- [ ] Crawford's final review; Pixel listen for new dropouts; push + PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Element count ~doubles per robot and idle paint regresses | High | T9 gate before any deletion; cut order fixed in the spec (orbiter lines → facet strokes); T5 asserts the count so cuts are visible |
| Gate 2 "no" after the swap | Med | T7/T8 are the only live-app commits; revert is two commits, modules stay |
| A rule test passes by coincidence (sketch-ported code, sketch-ported test) | Med | Mutation checks in T1 are mandatory and recorded in the commit |
| `gemSeed` fan-out touches 13 fixture files twice (T6 add, T11 remove greebles) | Low | Both mechanical one-liners; done as their own commits so the diff is reviewable |
| A different per-robot canvas width shifts world placement feel | Low | Position semantics unchanged (top-left); checked by eye at Gate 2 |
| `'robot.greeble.*'` dataIds retired = breaking change to world generation | Accepted | Every robot's look changes anyway; noted in the roadmap entry |

## Open Questions

- Spec §7.1–7.3 (contrast, bevel depth, battery floor, equal lights) — decided at Checkpoint B by
  eye; no task blocks on them.
