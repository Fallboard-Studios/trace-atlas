# Phase Spec: World Palette Pull (factories & bubbles lean toward the console accents)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/world-palette-pull.md](../intent/world-palette-pull.md) (confirmed 2026-10-02). Idea one-pager: [docs/ideas/world-palette-pull.md](../ideas/world-palette-pull.md) — the intent wins where they differ (robots dropped, saturation lift added). Branch `feature/world-colors`, off `main` at `b620a00f` (PR #524, idle paint). Roadmap slot: **Phase 35**. First of three sequenced branches (→ parametric robot hull → layer pods); the other two are not specced.

Survey basis (2026-10-02, against the current tree):

- **Every factory variant's body is the same color.** All five `VARIANT_CONF` entries (`src/components/actors/factoryVariants.ts:78-143`) use `colorTheme.body.base` = `hsl(200, 15%, 19%)` (`src/constants/colorTheme.json`) as `body`; `accent`/`greeble`/`illuminated` draw from the same cold-graphite theme. Per-variant `colorRanges` then move it: Monolith sat +40..60, Stacks −60..−40, Refinery hue +60..150 / sat −35..20, Skyscraper hue ±120 / sat 0..30, Warehouse hue +45..60 / sat −30..20. So "very gray" is the base's 15% saturation at 19% lightness, with two variants (Stacks, Warehouse) usually pushed to near-zero saturation on top.
- **Color reaches the screen through one stored pair of numbers.** `Actor.config.hueShift` / `satShift` (`src/types/Actor.ts:43-49`) are written once at placement (`createFactory`, `factoryPlacementSystem.ts:108`) as `localShift + asShift` — the variant's seeded shift (`selectVariantFromSeed`, Alea on the actor id) plus the Attenuation Style's additive shift (`deriveAsColorShift`, `factoryPlacementSystem.ts:92`: `'factory.as.hueShift'` ±30°, `'factory.as.satShift'` ±20 pt, offset = factory index). Render applies them with `shiftHSL` to all four variant colors in `Factory.tsx:129-134` (`staticVisual`, computed once per mount), and `factoryBubbleProps.ts:66-67` takes the bubble tint from `shiftHSL(body, shift).h`. Nothing else reads them. `applyColorShift`'s lightness-multiplier path (`colorUtils.ts:89`) is called with a zero shift and handles day/night only.
- **Retransmit recolors in place.** `recolorFactoriesForAttenuationStyle(localeId, asId, asName)` (`factoryPlacementSystem.ts:280`) recomputes `localShift + asShift` for every factory and writes only `config.hueShift`/`satShift` (test: "changes only config.hueShift/config.satShift … everything else round-trips byte-identical", `factoryPlacementSystem.test.ts:469`). Called from `worldTransition.ts:241` on an Attenuation-Style-only retransmit.
- **Factories are never persisted.** `docs/SESSION_STORAGE.md` and `sessionDiff.ts` carry no actors; the backdrop regenerates from `(x, y)` + the Attenuation Style on every load and share-link import. No migration surface.
- **The console glass.** `NavPanel.css:52`, `ContentPane.css:31/46` and `Header.css:15` each set `--color-surface: rgba(26, 26, 26, 0.75)` — a 25%-transparent panel over the world view. This is the ceiling the intent's "half pull, modest lift" is set against.
- **The accent palette.** `ACCENT_COLORS` (18 hues + black/white/darkGray) and the stable 18-entry `ROBOT_IDENTITY_COLOR_NAMES` list (`src/constants/accentColors.ts`). Hex only — no HSL anywhere; `traitColors.ts` has private `hexToRgb`/`rgbToHsl` helpers, `colorUtils.ts` has none.
- **Seeding conventions.** `getSeededVal(noiseMap, dataId, offset, min, max)`; a single-value dataId must use a fixed non-zero, non-integer offset (PROCEDURAL_GENERATION.md "Gotchas" — the `consoleTheme.ts` collapse). Renaming a dataId is a breaking change to every world.

ASSUMPTIONS I'm making beyond the intent's decisions (correct now or I'll proceed with these):

1. **The lean is folded into the stored `hueShift`/`satShift` at placement and recolor time, not applied at render.** `Actor` shape, `Factory.tsx`, `factoryBubbleProps.ts` and every renderer stay byte-identical; the two write sites (`createFactory` via `placeFactories`, and `recolorFactoriesForAttenuationStyle`) gain one step. A hue *pull* is non-linear in the target, but once the final pre-lean hue is known at write time it reduces to one additive delta, which is exactly what the pipeline already stores.
2. **The accent pair is per Attenuation Style, not per locale.** It is sampled from the AS noise map with a fixed offset, so every locale under one style shares the pair. This matches the existing rule that the style owns factory color (retransmit recolors; coordinates don't). The intent said "per locale"; per-style is the stricter reading and is what the retransmit path already implies. Flagged in §7.
3. **"One or two accent hues" = a seeded primary from the 18, plus its nearest hue-wheel neighbour among the 18 as secondary.** Analogous by construction (the 18 hues are at most ~51° apart, PROCEDURAL/accentColors.ts comments), no trait semantics borrowed. Each factory leans toward one of the two by a seeded coin keyed on its index.
4. **The lean is computed from the body hue and applied equally to all four variant colors.** That is how the existing shift already behaves (one `shift` object, four `shiftHSL` calls), so accent/greeble/illuminated keep their fixed relationship to the body.
5. **Lightness is untouched.** The intent fixes hue and saturation only. §7 records that at 19% lightness a saturation lift may read weaker than hoped; if Crawford's visual checkpoint says so, a lightness term is a spec amendment, not a silent addition.
6. **Constants, not schema.** Pull fraction, saturation lift and the secondary-hue rule are named module constants in one new file, tuned by eye, never UI-exposed, never stored.
7. **`createFactory`'s signature grows by one optional parameter with a no-op default**, so the existing "no asShift ⇒ identical to zero asShift" regression test and every direct test caller keep passing unchanged.
8. **Bubbles need no code.** They read the stored shift; they inherit the lean for free. A test pins this.
9. **No robot file is touched.** Not `robotVisualHelpers.ts`, not ROBOT_DESIGN.md.

---

## 1. Overview & Claude Explanation

Each Attenuation Style picks, from its own seed, a primary accent hue out of the console's 18 and that hue's nearest neighbour on the wheel. At placement (and again on an Attenuation-Style-only retransmit) every factory's final body hue is pulled halfway toward one of those two hues, and its saturation is lifted by a fixed amount, with both results folded into the `hueShift`/`satShift` the factory already stores. Rendering, bubbles, day/night, variant selection and greebles are unchanged; they simply receive different numbers. The world stops averaging to grey, the skyline reads as one family that belongs with the console palette, and the 25%-transparent console panels over it stay clean because the pull is half and the lift is modest. Robots are not part of this phase.

### 1.1 New module: `src/utils/accentLean.ts`

Pure functions and constants; no store, no React, no content import.

```ts
import type { HSL, ColorShift } from './colorUtils';
import { ACCENT_COLORS, ROBOT_IDENTITY_COLOR_NAMES } from '@/constants/accentColors';

/** Fraction of the shortest hue arc the body travels toward its target accent hue. 0 = off,
 *  1 = snap. Crawford's call: half — the console's 25%-transparent panels sit over the world,
 *  and a full snap oversaturates them. Tune by eye, never store. */
export const ACCENT_PULL_FRACTION = 0.5;

/** Percentage points added to the body's saturation. The graphite base is 15% at 19%
 *  lightness; a hue pull alone is invisible there. Tune by eye. */
export const ACCENT_SAT_LIFT = 15;

/** The 18 accent hues, in ROBOT_IDENTITY_COLOR_NAMES order, as HSL — computed once at import. */
export const ACCENT_HUES: readonly number[];

/** Shortest signed arc from `from` to `to` in degrees, in (-180, 180]. */
export function hueArc(from: number, to: number): number;

/** Index into ROBOT_IDENTITY_COLOR_NAMES of the hue nearest `hue` by shortest arc. */
export function nearestAccentIndex(hue: number): number;

/** A style's two lean targets: a seeded primary plus its nearest other accent on the wheel. */
export interface AccentPair { primary: number; secondary: number } // degrees

export function secondaryFor(primaryIndex: number): number; // index of nearest other accent hue

/** The additive delta that moves `body` (the FINAL pre-lean body color: variant base + local +
 *  AS shift already applied) ACCENT_PULL_FRACTION of the way to `targetHue` and lifts its
 *  saturation by ACCENT_SAT_LIFT. Returned as a ColorShift so callers simply add it to the
 *  hueShift/satShift they already store. */
export function computeAccentLean(body: HSL, targetHue: number): ColorShift;
```

`computeAccentLean` is `{ hueShift: hueArc(body.h, targetHue) * ACCENT_PULL_FRACTION, satShift: ACCENT_SAT_LIFT }`. Saturation clamping stays where it is today (`shiftHSL` clamps 0..100 at render); the lean never clamps itself, so it composes additively like the AS shift does.

`hexToHsl(hex: string): HSL` is added to `colorUtils.ts` (the world-layer color module) and `traitColors.ts`'s private `hexToRgb`/`rgbToHsl` are replaced by a call to it — one conversion, not two (docs/DUPLICATE_VALUE_AUDIT.md's class of finding). `traitColors.test.ts` must stay green unchanged.

### 1.2 Seeding the pair and the per-factory pick (`factoryPlacementSystem.ts`)

```ts
/** Fixed non-zero, non-integer offset for the style-level single-value draw — see
 *  PROCEDURAL_GENERATION.md "Gotchas" (consoleTheme.ts's near-lattice collapse). */
const ACCENT_PAIR_OFFSET = 0.37;

function deriveAsAccentPair(asNoiseMap: NoiseFunction2D): AccentPair {
  const i = clampIndex(Math.floor(getSeededVal(asNoiseMap, 'factory.as.accentPrimary', ACCENT_PAIR_OFFSET, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
  return { primary: ACCENT_HUES[i], secondary: ACCENT_HUES[secondaryFor(i)] };
}

/** Which of the pair this factory leans toward — seeded coin per factory index. */
function pickAccentTarget(asNoiseMap: NoiseFunction2D, pair: AccentPair, index: number): number {
  return getSeededVal(asNoiseMap, 'factory.as.accentPick', index, 0, 1) < 0.5 ? pair.primary : pair.secondary;
}
```

Two new dataIds, both on the **Attenuation Style** map: `'factory.as.accentPrimary'` (single value, fixed offset) and `'factory.as.accentPick'` (offset = factory index, same convention as `'factory.as.hueShift'`). They are seed keys from the day they land (PROCEDURAL_GENERATION.md's rename caution). Clamping mirrors `generateRobotIdentityColor`'s own clamped index.

### 1.3 Folding the lean into the stored shift

`createFactory(position, row, scale, id, asShift, accentTarget?: number)` — the new last parameter is the target hue in degrees; `undefined` means no lean (today's behaviour, byte-identical). When present:

```ts
const combined = { hueShift: hueShift + asShift.hueShift, satShift: satShift + asShift.satShift };
const bodyBeforeLean = shiftHSL(VARIANT_CONF[variant].colors.body, combined);
const lean = computeAccentLean(bodyBeforeLean, accentTarget);
config.hueShift = combined.hueShift + lean.hueShift;
config.satShift = combined.satShift + lean.satShift;
```

`placeFactories` derives the pair once per call from `asNoiseMap` (null ⇒ no lean, same fallback shape as the zero `asShift`), and passes `pickAccentTarget(asNoiseMap, pair, index)` per factory. `recolorFactoriesForAttenuationStyle` does the identical computation per factory with the **new** style's map, so a retransmit moves the skyline to the new style's pair; it still writes only `config.hueShift`/`satShift`.

The variant's `body` is the reference color because it is what the bubble tint and the dominant facade fill derive from; the same delta applies to the other three colors through the existing single `shift` object (assumption 4).

### 1.4 What does not change

`Factory.tsx`, `factoryBubbleProps.ts`, `BubbleStream.tsx`, `factoryVariants.ts` (`VARIANT_CONF`, `colorRanges`, `selectVariantFromSeed`'s PRNG draw order), `colorTheme.json`, `Actor.ts`, `applyColorShift`, `lightingUtils.ts`, `worldTransition.ts`'s call, Session Storage, Shareable Link, every robot file, every CSS file.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── accentLean.ts                 NEW — constants, hue math, computeAccentLean
│   ├── accentLean.test.ts            NEW
│   ├── colorUtils.ts                 + hexToHsl
│   ├── colorUtils.test.ts            + hexToHsl cases
│   └── traitColors.ts                private hex→HSL helpers replaced by colorUtils.hexToHsl (behaviour-identical)
├── systems/
│   ├── factoryPlacementSystem.ts     deriveAsAccentPair, pickAccentTarget; createFactory/placeFactories/recolor fold the lean in
│   └── factoryPlacementSystem.test.ts + lean determinism / pair / recolor / default-unchanged cases
└── components/actors/
    └── factoryBubbleProps.test.ts    + "bubble hue follows the leaned body hue" case (no source change)
docs/
├── BUILDING_DESIGN.md                "Color System": the lean step, its two dataIds, the constants
├── PROCEDURAL_GENERATION.md          call-site table row for factoryPlacementSystem.ts gains the two dataIds
├── todo/roadmap.md                   Phase 35 entry
└── specs/WORLD_PALETTE_PULL.md       this file
```

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** touch only the files in §2. In particular no file under `src/components/robot/`, no `robotVisualHelpers.ts`, no `ROBOT_DESIGN.md`, no CSS.
* **Protected Paths:** never modify `.env*`, `node_modules/`, public build assets.
* **No display strings** — this phase has no UI. If any label is ever needed it goes through `src/content/`.
* **Determinism:** every new draw goes through `getSeededVal` on the Attenuation Style map with a stable dot-namespaced dataId; `Math.random()` only as the existing no-noise-map fallback shape (and here the fallback is "no lean", not a random lean). Same style + same coordinates ⇒ byte-identical `config`.
* **Serializability:** nothing new is stored; `Actor.config` keeps its two numbers.
* **Additive, never replacing:** the lean adds to `localShift + asShift`; it must not reset, clamp or overwrite either. The existing AS-shift tests are the model.
* **No render-path cost:** zero new work in `Factory.tsx`'s per-tick render or `staticVisual` memo (17.2.5's idle-paint ledger stays as measured).
* **Ask first:** any lightness term (assumption 5), any change to `VARIANT_CONF.colorRanges`, any change to `AS_FACTORY_*_SHIFT_RANGE`, any new dependency.
* **Never:** touch robot color, relax the robot "visuals map strictly to audio" guardrail (that is the next branch's explicit amendment, not this one's), rename an existing dataId.

---

## 4. Code Style & Architecture Conventions

```ts
// src/utils/accentLean.ts — pure, importable from systems and tests alike
export function computeAccentLean(body: HSL, targetHue: number): ColorShift {
  return {
    hueShift: hueArc(body.h, targetHue) * ACCENT_PULL_FRACTION,
    satShift: ACCENT_SAT_LIFT,
  };
}

// src/systems/factoryPlacementSystem.ts — the fold, same shape as the existing asShift sum
const combined = { hueShift: hueShift + asShift.hueShift, satShift: satShift + asShift.satShift };
const lean = accentTarget === undefined
  ? { hueShift: 0, satShift: 0 }
  : computeAccentLean(shiftHSL(VARIANT_CONF[variant].colors.body, combined), accentTarget);
```

* Named constants with a doc comment stating *why the number* (the glass-overlay reason), matching `AS_FACTORY_HUE_SHIFT_RANGE`'s own comment style.
* Private helpers stay private to `factoryPlacementSystem.ts` unless a test needs them, mirroring `deriveAsColorShift` (private) vs `generateCompanyIdentityColor` (exported only for tests).
* Comments cite this spec by section (`docs/specs/WORLD_PALETTE_PULL.md §1.3`) the way the AS-shift code cites ATTENUATION_STYLE.md §1.2.
* Prettier/ESLint as configured; no new lint exceptions.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest, colocated.
* **TDD:** each task RED first, one commit per task (Crawford's workflow — see docs/CONTRIBUTION_GUIDE.md and the tdd-incremental-workflow convention).

**`accentLean.test.ts`**
- `hueArc` returns the shortest signed arc, including wrap-around (350→10 = +20, 10→350 = −20, 0→180 = 180).
- `nearestAccentIndex` picks the nearest of the 18 by shortest arc, including across 360°.
- `secondaryFor(i)` is never `i`, and is the nearest *other* accent; for every `i` the pair is ≤ 60° apart (analogous by construction).
- `computeAccentLean` with `ACCENT_PULL_FRACTION` = 0.5 halves the arc (property test over a sweep of body hues and targets: `|lean.hueShift| === |arc| / 2`, same sign), `satShift === ACCENT_SAT_LIFT`.
- Fraction 0 ⇒ zero hue delta; fraction 1 ⇒ lands exactly on target (test via a local re-implementation with the constant injected, or export a `computeAccentLeanWith(fraction, lift)` and have the public one bind the constants).
- `ACCENT_HUES` has 18 entries, each in [0, 360), and `ACCENT_HUES[i]` equals `hexToHsl(ACCENT_COLORS[ROBOT_IDENTITY_COLOR_NAMES[i]]).h`.

**`colorUtils.test.ts`**
- `hexToHsl` on `#fff`-style shorthand is out of scope (ACCENT_COLORS are 6-digit except `white: '#fff'`, which is not in the 18) — test 6-digit only, plus `#000000`, `#ff0000` (h 0), `#00ff00` (h 120), `#0000ff` (h 240), and one accent round-trip against `traitColors.ts`'s former output (pin a value from the current private helpers before the refactor).

**`factoryPlacementSystem.test.ts`** (extend the existing `describe` blocks)
- `createFactory` with no `accentTarget` produces byte-identical `config` to today (regression guard, alongside the existing no-asShift case).
- With an `accentTarget`, stored `hueShift` differs from `local + as` by exactly `computeAccentLean(...)`'s delta, and `satShift` by `ACCENT_SAT_LIFT`.
- The post-lean body hue is strictly closer to the target than the pre-lean hue (unless already equal), and never overshoots it.
- `placeFactories`: two locales under the **same** Attenuation Style get the same pair (every factory's target ∈ that pair); two different styles differ in at least one factory's stored shift (same guard shape as the existing "distinct from another Attenuation Style's" test). Mock the maps the way that test already does.
- `placeFactories` with no resolvable Attenuation Style ⇒ no lean (not a crash), extending the existing fallback test.
- The pair draw uses `ACCENT_PAIR_OFFSET`, not 0: assert via a `getSeededVal` spy that `'factory.as.accentPrimary'` is called with a non-integer offset (the lattice-collapse guard, PROCEDURAL_GENERATION.md).
- Spread guard, same family as the LFO Bank's measured-share tests: across 50 synthetic style names, the primary index covers at least 10 of the 18 (fails if the dataId hashes near a lattice point).
- `recolorFactoriesForAttenuationStyle`: still changes only `config.hueShift`/`satShift`; still idempotent; now moves every factory to the **new** style's pair (its post-recolor target ∈ new pair, ∉ old pair when the pairs are disjoint).
- **Parity fixture rule** (memory `parity-test-fixture-non-default-values`): every "unchanged"/"identical" assertion seeds a non-default `asShift` and a non-zero local shift, so it cannot pass by both sides being zero.

**`factoryBubbleProps.test.ts`**
- With a leaned `config.hueShift`, the bubble fill hue equals `shiftHSL(body, config).h` — i.e. the bubble follows the stored shift, no separate rule. (Existing test already asserts this shape with `hueShift: 10`; add a case using a `computeAccentLean`-derived value so the link to this phase is explicit.)

**Verification steps**
1. `npm run build:types` — zero errors.
2. `npm run lint` — zero errors.
3. `npm test` — full suite green (watch the known-flaky unmocked-random tests listed in memory; re-run once, don't edit assertions).
4. `npm run build` — clean bundle.
5. **Visual checkpoint (Crawford, by eye, the actual success criterion):** `npm run dev`, same `?session=` link before and after, with the Nav panel and a Content pane open over the world. Pass = visibly less grey; buildings read as one family that belongs with the console; robots stand out rather than blend; the 75%-opaque panels are not muddy or oversaturated. Also retransmit a new Attenuation Style and confirm the skyline moves to a different family. If it fails on strength only, tune `ACCENT_PULL_FRACTION` / `ACCENT_SAT_LIFT` and re-check; if it fails on lightness, stop and amend (§7 item 1).
6. Optional: `npm run perf` A/B is **not** required — no render-path change — but if the idle-paint ledger is re-run for any other reason, note that this phase landed.

---

## 6. Git & Workflow Context

* **Branch:** `feature/world-colors` (already checked out; the docs/ideas and docs/intent files from this session are untracked on it).
* **Commits:** one per task, short imperative sentences, each ending with the attribution line in the session reminder. Spec and docs commit first, then the TDD tasks in §5's order: `accentLean` → `hexToHsl` + traitColors dedupe → placement fold → recolor fold → bubble test → docs.
* **Roadmap:** add **Phase 35 "World Palette Pull"** to `docs/todo/roadmap.md` in the established shape (requested-by, status, link to intent/spec, Not Doing list carried from the intent).
* **PR:** opens against `main` once the visual checkpoint passes; description links §1 of this spec and the intent; reviewed by one other contributor; lint/types/tests run locally (no CI).

---

## 7. Open Questions (need Crawford before or during the plan)

Crawford's answers, 2026-10-02 (before planning): items 1 and 2 are **closed** as recorded below. A simpler "replace the base with a jittered accent" model was also considered and rejected in favour of this pull model.

1. **Lightness. CLOSED — no lightness term.** Crawford: "I'm ok with there still being gray buildings." Assumption 5 stands as final: `l` is untouched, some buildings (notably Stacks/Warehouse after their negative variant sat ranges) will still read grey, and that is accepted, not a bug. The visual checkpoint judges hue/sat only.
2. **Per-style vs per-locale pair. CLOSED — per style** (assumption 2 confirmed). Two locales under one Attenuation Style share the pair; retransmitting the style moves the skyline to the new style's pair.
3. **Secondary rule** (assumption 3). Specced: nearest other accent hue. Alternative considered: pick one of `TRAIT_COLORS`' seven analogous pairs. Rejected for now because it imports UI trait semantics into the world for no visible gain; easy to swap if the nearest-neighbour pairs look too tight.
4. **Primary/secondary split.** Specced: seeded coin per factory. Alternative: by row (background rows secondary, foreground primary) for depth separation. Decide at the checkpoint.
5. **Starting constants.** `0.5` and `+15` are the spec's first guesses; the half is the intent, the lift is not. Expect one tuning commit after the checkpoint.
