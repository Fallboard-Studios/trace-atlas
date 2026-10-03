# Implementation Plan: World Palette Pull

Source spec: [docs/specs/WORLD_PALETTE_PULL.md](../specs/WORLD_PALETTE_PULL.md). Source intent: [docs/intent/world-palette-pull.md](../intent/world-palette-pull.md). Idea: [docs/ideas/world-palette-pull.md](../ideas/world-palette-pull.md). Branch `feature/world-colors`, off `main` at `b620a00f`. Roadmap slot: Phase 35 (added in Task 7).

> Process note: `planning-and-task-breakdown` asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house rhythm: RED test first, one commit per task, mutation-check at the named gates, stop and report at every checkpoint.

## Overview

Factories (and, through them, bubbles) lean toward the console's accent palette: each Attenuation Style seeds a primary accent hue plus its nearest wheel neighbour; at placement and on a style retransmit, every factory's final body hue is pulled `ACCENT_PULL_FRACTION` (0.5) of the way to one of the two and its saturation lifted by `ACCENT_SAT_LIFT` (15), both folded into the `config.hueShift`/`satShift` the actor already stores. Seven tasks in three phases: two pure foundations with no importers (1–2), four pieces of wiring at the two write sites plus a bubble pin (3–6), docs last (7). No render path, no robot file, no store shape and no CSS changes anywhere. The tree is green at every commit because the new `createFactory` parameter is optional with a no-op default, and `placeFactories`/`recolor` only start passing it in Tasks 4–5.

## Architecture Decisions

- **Resolves spec §7 item 1 (CLOSED by Crawford): no lightness term.** `l` stays untouched; some buildings staying grey is accepted. The visual checkpoint (Checkpoint B) judges hue/sat only and may tune the two constants, never add a third.
- **Resolves spec §7 item 2 (CLOSED by Crawford): the accent pair is per Attenuation Style.** Drawn once per `placeFactories`/`recolor` call from the AS noise map at a fixed non-integer offset (`ACCENT_PAIR_OFFSET`), so every locale under one style shares it and a retransmit moves the whole skyline.
- **Spec §7 items 3–5 stay as specced for the first build**: secondary = nearest other accent hue; per-factory primary/secondary pick by seeded coin on the factory index; constants 0.5 / +15. Any change is one tuning commit after Checkpoint B, not a plan change.
- **Fold at write time, not render time** (spec assumption 1). `createFactory` grows one optional trailing parameter `accentTarget?: number`; `undefined` ⇒ today's bytes. `Factory.tsx`, `factoryBubbleProps.ts`, `Actor.ts` are untouched — Task 6 is a test-only proof of that.
- **Foundations have no importers when they land** (Tasks 1–2) and their tests are the oracle for Tasks 3–5; nothing re-derives hue math in a placement test.
- **`hexToHsl` lives in `colorUtils.ts`** (the world-layer colour module) and `traitColors.ts`'s private helpers delegate to it — one conversion, not two (docs/DUPLICATE_VALUE_AUDIT.md's class). Its oracle is pinned from `traitColors.ts`'s current output *before* the refactor (Task 1's RED step), so parity is proven, not assumed.
- **Test-only exports mirror the existing precedent**: `deriveAsAccentPair`/`pickAccentTarget` are exported from `factoryPlacementSystem.ts` only so tests can assert "target ∈ pair", the way `generateCompanyIdentityColor` is exported from `spawnSystem.ts`. `deriveAsColorShift` stays private.
- **Task 5 (recolor) is separate from Task 4 (placement)** even though the code is near-identical: recolor has its own byte-identical-everything-else test suite and its own retransmit semantics; keeping it a separate commit keeps a regression bisectable.

## Dependency Graph

```
Task 1 (colorUtils.hexToHsl + traitColors dedupe)
   │
   └─→ Task 2 (utils/accentLean.ts — hues, arcs, computeAccentLean)
            │
      ── Checkpoint A ──
            │
            └─→ Task 3 (createFactory: optional accentTarget, fold)          ← 2
                     ├─→ Task 4 (placeFactories: pair + pick + pass)         ← 3
                     └─→ Task 5 (recolorFactoriesForAttenuationStyle: fold)  ← 3, 4 (reuses 4's helpers)
                              │
                     Task 6 (factoryBubbleProps test pin)                    ← 2 (test-only)
      ── Checkpoint B (full suite, build, Crawford's visual check, tuning) ──
            │
      Task 7 (BUILDING_DESIGN, PROCEDURAL_GENERATION, roadmap §35)          ← all
      ── Checkpoint C (final) ──
```

Parallelisable: 6 ‖ 3–5 (6 only needs 2). Everything else is a chain.

## Task List

### Phase 1: Foundations (no importers yet)

- [x] **Task 1: `src/utils/colorUtils.ts` — `hexToHsl`, and `traitColors.ts` delegates to it** — commit `84f3b4cf`. As built: oracle values pinned from a verbatim scratch copy of the pre-refactor private helpers (teal / burntOrange); `traitColors.test.ts` gained the whole-palette `desaturateHex(x, 0) === x` sweep (only the orange case existed).

  **Description:** Add `export function hexToHsl(hex: string): HSL` to `colorUtils.ts` (6-digit `#rrggbb` only — the 18 accent hues are all 6-digit; `white: '#fff'` is not in `ROBOT_IDENTITY_COLOR_NAMES`). Then replace `traitColors.ts`'s private `hexToRgb` + `rgbToHsl` pair with a call to it inside `desaturateHex` (keep `hslToRgb`/`rgbToHex` there — they have no colorUtils equivalent and are out of scope). RED step first: pin, in `colorUtils.test.ts`, the current `traitColors.ts` output for two accent hex values (compute them with the private helpers *before* editing, via `desaturateHex(hex, 0)` round-trip, which returns the hex unchanged only if h/s/l survive) so the delegation is a proven parity refactor.

  **Acceptance criteria:**
  - [ ] `hexToHsl('#ff0000')` → h 0, s 100, l 50; `'#00ff00'` → h 120; `'#0000ff'` → h 240; `'#000000'` → l 0, s 0; `'#ffffff'` → l 100, s 0. Output ranges: h ∈ [0, 360), s/l ∈ [0, 100], all as numbers (not rounded — callers round if they need to; `ACCENT_HUES` in Task 2 stores raw).
  - [ ] Two accent hexes (`ACCENT_COLORS.teal`, `ACCENT_COLORS.burntOrange`) produce the same h/s/l `traitColors.ts`'s private helpers produced before the refactor (pinned values in the test, with a comment saying where they came from).
  - [ ] `traitColors.test.ts` passes **unmodified**; `desaturateHex(x, 0)` still returns `x` for every `ACCENT_COLORS` hue (add that sweep to `traitColors.test.ts` only if it is not already there — check first).

  **Verification:**
  - [ ] `npx vitest run src/utils/colorUtils.test.ts src/utils/traitColors.test.ts` passes (RED first for the new cases).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/colorUtils.ts`, `src/utils/colorUtils.test.ts`, `src/utils/traitColors.ts`

  **Estimated scope:** S (one new function, one delegation, tests)

- [x] **Task 2: `src/utils/accentLean.ts` — accent hues, arcs, `computeAccentLean`** — commit `8bdae4ae`. As built: `computeAccentLeanWith` adds `+ 0` so a negative arc × fraction 0 yields `+0`, not `-0` (caught by the fraction-0 case). Mutation 1 (long-way `hueArc`) went red in 3 tests as predicted; mutation 2 (`ACCENT_PULL_FRACTION = 1`) was caught by the constant-pin test, **not** the half-arc sweep — the sweep passes explicit fractions by design so Checkpoint B tuning can't break it; the pin is the intended tripwire.

  **Description:** New pure module per spec §1.1: `ACCENT_PULL_FRACTION = 0.5`, `ACCENT_SAT_LIFT = 15` (each with the glass-overlay "why this number" doc comment), `ACCENT_HUES` (18 entries, `ROBOT_IDENTITY_COLOR_NAMES` order, computed once at import via `hexToHsl`), `hueArc`, `nearestAccentIndex`, `secondaryFor`, `AccentPair`, `computeAccentLeanWith(body, targetHue, fraction, lift)` and `computeAccentLean(body, targetHue)` which binds the two constants. No store, React, Tone or content import. Nothing imports it yet.

  **Acceptance criteria:**
  - [ ] `hueArc`: 350→10 = +20; 10→350 = −20; 0→180 = 180 (not −180); 90→90 = 0; result always in (−180, 180].
  - [ ] `nearestAccentIndex` picks by shortest arc including across 360° (a hue of 358 is nearer an accent at 5° than one at 340° — construct from real `ACCENT_HUES` values, not synthetic). `secondaryFor(i) !== i` for all 18 `i`, and `|hueArc(ACCENT_HUES[i], ACCENT_HUES[secondaryFor(i)])| ≤ 60` for all `i` (fails loudly if the palette ever grows a gap wider than analogous).
  - [ ] `computeAccentLeanWith` property sweep (body hues 0..359 step 15 × every `ACCENT_HUES` target): `hueShift === hueArc(body.h, target) * fraction` exactly, `satShift === lift`; fraction 0 ⇒ `hueShift` 0; fraction 1 ⇒ `(body.h + hueShift + 360) % 360` lands on the target within 1e-9. `computeAccentLean` equals `computeAccentLeanWith(…, ACCENT_PULL_FRACTION, ACCENT_SAT_LIFT)`.
  - [ ] `ACCENT_HUES.length === 18`, each ∈ [0, 360), `ACCENT_HUES[i] === hexToHsl(ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[i]]).h`.

  **Verification:**
  - [ ] `npx vitest run src/utils/accentLean.test.ts` passes (RED first per function).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] **Mutation check:** flip `hueArc` to the long way round (drop the wrap) and watch the 350→10 case go red; set `ACCENT_PULL_FRACTION` to 1 and watch the half-arc sweep go red.

  **Dependencies:** Task 1.

  **Files:** `src/utils/accentLean.ts`, `src/utils/accentLean.test.ts`

  **Estimated scope:** S (one new module + test)

### Checkpoint A: Foundations
- [x] `npm run build:types`, `npm run lint` clean; `npx vitest run src/utils` green (36 files, 927 tests, 2026-10-02).
- [x] Proven so far: hex→HSL is one shared conversion with pinned parity; the hue math is exact and wrap-safe; the 18-hue table matches the palette; nothing in the app has changed behaviour (no importers).
- [ ] Reviewed with Crawford before Phase 2.

---

### Phase 2: Core wiring (the two write sites) and the bubble pin

- [x] **Task 3: `createFactory` — optional `accentTarget`, lean folded into the stored shift** — commit `3c24926f`. As built: 5 tests (parity with explicit `undefined`, exact delta, closer-not-overshoot for 4 targets, short-way-round seam case, non-colour fields identical). Mutation (lean from unshifted base) went red in 3 tests. Process note: restoring the mutation with `git checkout --` also wiped the uncommitted implementation — reapplied from the recorded edits; later mutations restore from a temp backup copy instead.

  **Description:** Spec §1.3. Add `accentTarget?: number` (degrees) as the trailing parameter after `asShift`. When `undefined`, output is byte-identical to today. When present: `combined = local + asShift`; `bodyBeforeLean = shiftHSL(VARIANT_CONF[variant].colors.body, combined)`; `lean = computeAccentLean(bodyBeforeLean, accentTarget)`; store `combined + lean`. `placeFactories` and `recolor` do **not** pass it yet (Tasks 4–5), so the live app is unchanged after this commit. Comment cites `docs/specs/WORLD_PALETTE_PULL.md §1.3`.

  **Acceptance criteria:**
  - [ ] **Parity (non-default fixture rule):** `createFactory(pos, 1, 1, id, { hueShift: 10, satShift: -5 })` with and without a trailing `undefined` produce identical `config` (`toStrictEqual` on the whole actor). The existing "no asShift = zero asShift" test still passes unmodified.
  - [ ] With `accentTarget`, `config.hueShift − (local.hueShift + as.hueShift) === computeAccentLean(shiftHSL(body, combined), target).hueShift` (exact), and `config.satShift − (local.satShift + as.satShift) === ACCENT_SAT_LIFT`. Computed in the test from `selectVariantFromSeed` + `VARIANT_CONF`, with a non-zero `asShift`.
  - [ ] Post-lean body hue is strictly closer to the target than pre-lean (`|hueArc(after, target)| < |hueArc(before, target)|`) when `before ≠ target`, and never overshoots (`sign(hueArc(after, target)) === sign(hueArc(before, target))` or `after === target`). Covered for a target on each side of the body hue, including one across the 0/360 seam (choose `pos`/`id` fixtures whose variant+shift land the body near 350° — if none does cheaply, pass a target of 5° against the h≈200 graphite body and assert the arc shrinks the short way, via 360, not through 100°).
  - [ ] Everything else on the actor (`id`, `position`, `scaleX/Y`, `config.row/rooftopGreeble/facadeGreeble/beltCourseCount/purpose`) is identical with and without `accentTarget`.

  **Verification:**
  - [ ] `npx vitest run src/systems/factoryPlacementSystem.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] **Mutation check:** compute the lean from the *unshifted* `colors.body` instead of `bodyBeforeLean` and watch the delta-equality case go red.

  **Dependencies:** Task 2.

  **Files:** `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`

  **Estimated scope:** S (one function, tests)

- [x] **Task 4: `placeFactories` — seed the style's pair, pick per factory, pass the target** — commit `98809eb7`. As built: `ACCENT_PAIR_OFFSET = 0.37`; the existing fixture names `as-planet-alpha`/`as-planet-beta` draw different primaries (no rename needed); the same-style test also asserts the coin really splits (both targets used across the skyline). Mutation (offset → 0) was caught by the offset spy only — the spread guard still passed at offset 0, so this dataId's hash is not near a lattice point today; the spread guard stays as the tripwire for the future.

  **Description:** Spec §1.2. Add `ACCENT_PAIR_OFFSET = 0.37` (doc comment citing PROCEDURAL_GENERATION.md's lattice gotcha), `deriveAsAccentPair(asNoiseMap): AccentPair` (dataId `'factory.as.accentPrimary'`, fixed offset, clamped index — mirror `generateRobotIdentityColor`'s clamp) and `pickAccentTarget(asNoiseMap, pair, index)` (dataId `'factory.as.accentPick'`, offset = factory index, `< 0.5` ⇒ primary). Both exported for tests only (comment says so). `placeFactories` derives the pair once when `asNoiseMap` is non-null and passes `pickAccentTarget(...)` into `createFactory` via `nextFactory`; a null `asNoiseMap` passes `undefined` (no lean — same fallback shape as the zero `asShift`).

  **Acceptance criteria:**
  - [ ] **Same style ⇒ same pair; every factory leans to one of it:** two locales under one Attenuation Style (reuse the existing two-locale fixture shape at identical coordinates) — `deriveAsAccentPair` returns equal pairs for both calls, and for each placed factory the stored `hueShift` equals `local + as + computeAccentLean(body, p).hueShift` for *either* `p = pair.primary` *or* `pair.secondary` (one of the two must match exactly).
  - [ ] **Different styles differ:** the existing "distinct from another Attenuation Style's" test still passes (it already asserts some shift differs); add that the two styles' `deriveAsAccentPair` results differ for the fixture names, or — if they happen to collide — swap one fixture name and note it in the test.
  - [ ] **Orphan fallback:** the existing "no resolvable Attenuation Style ⇒ stored equals pure local shift" test passes unmodified (no lean when there's no AS map).
  - [ ] **Lattice guard:** `getSeededVal` is called with dataId `'factory.as.accentPrimary'` and an offset that is non-zero and non-integer (spy via `vi.spyOn` on the `getSeededVal` module export; assert `Number.isInteger(offset) === false`).
  - [ ] **Spread guard:** across 50 synthetic style names (`accent-spread-${i}`), `deriveAsAccentPair(...).primary` takes ≥ 10 distinct values of the 18. Use real `createNoise2D(alea(deriveAttenuationStyleSeed(name)))` maps, not mocks, so the test measures the real hash. If it fails, change `ACCENT_PAIR_OFFSET`, never the threshold.
  - [ ] `pickAccentTarget` returns `pair.primary` when the seeded value is `< 0.5` and `pair.secondary` otherwise (mock the map to return fixed values for the two branches).

  **Verification:**
  - [ ] `npx vitest run src/systems/factoryPlacementSystem.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] **Mutation check:** set `ACCENT_PAIR_OFFSET` to `0` and watch the lattice-guard case go red (and very likely the spread guard too — note which).

  **Dependencies:** Task 3.

  **Files:** `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`

  **Estimated scope:** S (two helpers, one wiring line, tests)

- [x] **Task 5: `recolorFactoriesForAttenuationStyle` — recompute the lean against the new style** — commit `2c0a4f95`. As built: both new tests RED first (the "equals fresh placement" case failed by ~19° before the fold); all 5 pre-existing recolor tests unmodified and green. Mutation (skip the lean) went red in both new tests.

  **Description:** Spec §1.3, last paragraph. Inside the existing `locale.actors.map`, derive the **new** style's pair once (from `asNoiseMap`), and per factory compute `combined = localShift + deriveAsColorShift(asNoiseMap, index)` then `lean = computeAccentLean(shiftHSL(body, combined), pickAccentTarget(asNoiseMap, pair, index))`, writing `combined + lean` into `config.hueShift`/`satShift` only. Use the same `variant` lookup the function already does for `localShift`. Still writes nothing else.

  **Acceptance criteria:**
  - [ ] Existing suite passes unmodified: "changes only `config.hueShift`/`config.satShift` — everything else round-trips byte-identical", idempotent under repeated calls, no-op on zero factories, no-op on a nonexistent locale, `DEFAULT_FACTORY_ROW` fallback.
  - [ ] **Moves to the new pair:** place under style A, recolor to style B (fixture names chosen so `deriveAsAccentPair` differs — assert that precondition in the test); after recolor, each factory's stored `hueShift` equals `local + asB + computeAccentLean(body, p).hueShift` for `p ∈ pairB`, and for at least one factory it does **not** equal the same formula with `p ∈ pairA` (the "parity fixture must distinguish" rule).
  - [ ] Recolor result equals what `placeFactories` would produce fresh under style B at the same coordinates, factory for factory (`config.hueShift`/`satShift` exact) — the two write sites agree.

  **Verification:**
  - [ ] `npx vitest run src/systems/factoryPlacementSystem.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.
  - [ ] **Mutation check:** have recolor skip the lean (write `combined` only) and watch the "equals fresh placement" case go red.

  **Dependencies:** Tasks 3, 4.

  **Files:** `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`

  **Estimated scope:** S (one function body, tests)

- [x] **Task 6: `factoryBubbleProps.test.ts` — bubbles inherit the leaned hue (test-only)** — commit `39a43d27`. Passed first run against unchanged source, as intended (a pin, not a RED/GREEN).

  **Description:** Spec §5. No source change. Add a case alongside the existing `hueShift: 10, satShift: -5` test: build an actor whose `config.hueShift`/`satShift` are `base + computeAccentLean(shiftHSL(body, base), someAccentHue)`, and assert the bubble fill hue equals `shiftHSL(VARIANT_CONF[variant].colors.body, config).h` — i.e. the bubble follows the stored shift, so the lean reaches it with no rule of its own. Comment ties the case to this phase.

  **Acceptance criteria:**
  - [ ] New case passes against unchanged `factoryBubbleProps.ts`; the assertion uses a lean-derived shift, not a hand-typed one.
  - [ ] `git diff --stat` for this commit shows only the test file.

  **Verification:**
  - [ ] `npx vitest run src/components/actors/factoryBubbleProps.test.ts` passes.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/components/actors/factoryBubbleProps.test.ts`

  **Estimated scope:** XS (test only)

### Checkpoint B: Wiring complete — the real success criterion
- [x] `npm run build:types`, `npm run lint`, `npm test` all clean (full suite: 215 files / 4913 tests green on the first run, 2026-10-02; none of the known-flaky tests tripped).
- [x] `npm run build` clean.
- [ ] **Crawford's visual check (`npm run dev`):** same `?session=` link on `main` and on this branch, with the Nav panel and a Content pane open over the world. Pass = visibly less grey; buildings read as one family that belongs with the console; robots stand out rather than blend; the 75%-opaque panels are not muddy or oversaturated. Then retransmit a different Attenuation Style and confirm the skyline moves to a different family. Some buildings still reading grey is **expected and accepted** (spec §7 item 1).
- [x] If strength is off, one tuning commit changes `ACCENT_PULL_FRACTION` and/or `ACCENT_SAT_LIFT` only (Task 2's sweep tests are constant-agnostic by design — only the `computeAccentLean === computeAccentLeanWith(…constants)` binding case reads them, and it stays green). Record the final numbers in the spec's §1.1 and §7 item 5. **As built (2026-10-02):** Crawford's first look — "a little too heavy on the red, otherwise it looks great … like candy a lot of the time". Not a strength problem across the board, so neither constant moved; the tuning commit instead added a warm-band saturation cap (`isWarmHue`, `ACCENT_WARM_BAND_START/END` 330/45, `ACCENT_WARM_SAT_CAP` 45 — spec §1.1 amendment), RED-first in `accentLean.test.ts` (5 new cases), and the Task 3/4/5 saturation assertions were changed to follow the matched target's `computeAccentLean(...).satShift` rather than a flat lift (they had been passing only because no fixture skyline landed warm). **Second look:** "red looks good now" but "a lime green sticks out from time to time" → the warm band became row 1 of `SAT_CAP_BANDS` and lime (`{ 80, 115, 45 }`) row 2, via `satCapFor(hue)`; yellow/emerald/green pinned uncapped by name (5 more RED-first cases). Awaiting Crawford's third look.
- [ ] Reviewed with Crawford before docs.

---

### Phase 3: Docs

- [ ] **Task 7: BUILDING_DESIGN.md, PROCEDURAL_GENERATION.md, roadmap §35 — document the shipped behaviour**

  **Description:** BUILDING_DESIGN.md "Color System": add the lean step after the AS-shift paragraph (what it does, the two constants and their final tuned values, the body-as-reference rule, that bubbles inherit it, that lightness is deliberately untouched and grey buildings are accepted). PROCEDURAL_GENERATION.md call-site table: `factoryPlacementSystem.ts` row gains `'factory.as.accentPrimary'` (fixed offset, Attenuation Style map) and `'factory.as.accentPick'`; "Gotchas" gets a one-line pointer that `ACCENT_PAIR_OFFSET` exists because of the lattice collapse. `docs/todo/roadmap.md`: **Phase 35 "World Palette Pull"** in the house shape (requested-by 2026-10-02, links to idea/intent/spec/plan, status, About, Not Doing carried from the intent — robots, Ballast neutrals, per-building variety, hard snap, lightness). Spot-check every identifier against the final shipped source, not this plan.

  **Acceptance criteria:**
  - [ ] Every named constant, function and dataId in the three docs exists with that exact name in the shipped code.
  - [ ] The roadmap entry's Not Doing list matches the intent's Out of scope plus the two closed §7 items.
  - [ ] Both `docs/ideas/world-palette-pull.md` and `docs/intent/world-palette-pull.md` get a one-line "Shipped — see spec/plan" header note (they are currently untracked; this commit adds them to git too).

  **Verification:**
  - [ ] Manual review against source.
  - [ ] `npm run build:types`, `npm run lint` clean (docs-only change; also catches `src/content/content.test.ts` and any docs-reference test if one exists — run `npm test` once more).

  **Dependencies:** All prior tasks.

  **Files:** `docs/BUILDING_DESIGN.md`, `docs/PROCEDURAL_GENERATION.md`, `docs/todo/roadmap.md`, `docs/ideas/world-palette-pull.md`, `docs/intent/world-palette-pull.md`

  **Estimated scope:** S (docs only, five files)

### Checkpoint C: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All automated acceptance criteria across Tasks 1–7 met.
- [ ] Docs match shipped names.
- [ ] Checkpoint B's visual check explicitly recorded as done (with the final constants) or explicitly flagged as outstanding — never silently skipped.
- [ ] Ready for PR against `main` (description links spec §1 + intent; one other reviewer; attribution line per session reminder).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `'factory.as.accentPrimary'` hashes near a simplex lattice point and 50 styles collapse to 3–4 primaries (the `consoleTheme.ts` failure) | High — the whole "per style" variety disappears silently | Task 4's lattice-guard spy (non-integer offset) **and** the measured spread guard over 50 real maps; fix is the offset constant, never the threshold |
| Lean computed from the unshifted variant base instead of the final pre-lean body, so the pull aims from the wrong place | Medium — wrong but plausible-looking colours | Task 3's exact delta-equality criterion + its named mutation check |
| Placement and recolor drift apart (one folds the lean, the other doesn't, or they pick differently) | High — retransmit shows a different skyline than a fresh load of the same style | Task 5's "recolor equals fresh placement, factory for factory" criterion |
| `traitColors.ts` delegation changes a UI colour by a rounding difference | Medium — every trait pair's disabled state shifts | Task 1 pins pre-refactor values and requires `traitColors.test.ts` unmodified |
| Saturation overshoots 100 on Monolith (+40..60 variant, +20 AS, +15 lift) | Low — visually just "fully saturated" | Already clamped at render by `shiftHSL`; no new clamp (spec: the lean composes additively like the AS shift) |
| Stored `hueShift` drifts below −360 and `shiftHSL`'s single `+ 360` stops normalising | Low — current worst case ≈ −120 −30 −90 = −240 | Structurally fine today; Task 3's seam test covers the wrap direction. Noted, not tested further |
| Crawford's checkpoint finds it too weak and the reflex is to add lightness | Medium — reopens a closed decision | Checkpoint B wording: tune the two constants only; grey buildings are accepted (§7 item 1 closed) |
| `createFactory`'s new trailing parameter breaks a direct test caller passing positional args | Low | Optional trailing param; Task 3's parity criterion covers the default |

## Open Questions

1. Lightness term. **Resolved** (Crawford, 2026-10-02): none; grey buildings accepted.
2. Per-style vs per-locale pair. **Resolved** (Crawford, 2026-10-02): per style.
3. Secondary rule (nearest other accent vs a `TRAIT_COLORS` pair). **Deferred to Checkpoint B** — build nearest-neighbour; swap only if the pairs look too tight on screen.
4. Primary/secondary split (seeded coin vs by row). **Deferred to Checkpoint B** — build the coin; by-row is a one-helper swap if depth separation is wanted.
5. Starting constants 0.5 / +15. **Open until Checkpoint B** — the half is the intent, the lift is a first guess; one tuning commit expected.
