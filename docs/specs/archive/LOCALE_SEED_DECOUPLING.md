# Phase Spec: Locale Seed Decoupling (pulled forward from Roadmap Phase 6)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/locale-seed-decoupling.md](../intent/locale-seed-decoupling.md) (confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 5's "Known Issue"](../todo/roadmap.md#5-sector-settings) (the coordinate dead-zone bug) and [§ 6's first Restructure bullet](../todo/roadmap.md#6-robot-melody--seed-engine) (the planet-agnostic seeding rule, generalized here from "robot spawn attributes" to everything locale-derived). Prior art / current architecture: [docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md). This spec deliberately does **not** cover Phase 6's melody rhythm-engine overhaul or robot ID determinism — those stay in Phase 6's original slot. This is a prerequisite for [Sector Settings](../intent/sector-settings.md) (Roadmap Phase 5); Sector Settings' own spec is written separately, after this one lands.

---

## 1. Overview & Claude Explanation

This phase makes locale-generated content genuinely independent of which planet a locale sits on, and structurally eliminates the coordinate "dead zone" bug in the same stroke. `src/utils/noiseMaps.ts`'s `getLocaleNoiseMap` currently derives a locale's noise map by *sampling* the planet's own simplex noise map at the locale's `(x, y)` — `planetMap(x, y)` → rescale to an integer `[0, 129599]` → `alea(integer)` seeds a fresh `createNoise2D`. Two problems fall out of that one mechanism: (1) the same coordinates produce different generated content on different planets (the coupling), and (2) simplex noise geometrically collapses toward (and at `(0,0)`, exactly reaches) zero at lattice-aligned points — `(0,0)`, `(0.5,0.5)`, `(1,1)`, even `(3.7,-8.2)` all showed measurable-to-total collapse across 8 different planet seeds, verified directly against `simplex-noise`/`alea` (see the roadmap's Known Issue for the exact numbers) — which matters most exactly where users will naturally type coordinates.

The fix is to stop sampling simplex noise as part of *deriving* the locale seed at all. Instead, the locale's `(x, y)` coordinates are hashed directly into a string key (`alea` over `` `${x}:${y}` ``, folding in the existing global seed-override the same way `derivePlanetSeed` already does for planet names) and that string seeds `createNoise2D` directly — the same string-hashing approach that already works without this problem for planet names. `getLocaleNoiseMap` drops its `planetId`/`planetName` parameters entirely; the planet is no longer part of the locale-derivation chain in any form. One mechanism change resolves both bugs — this is not two fixes bolted together.

**X and Y stay two separate inputs for the user, but exactly one concatenated value for the seed.** Sector Settings (downstream) presents X and Y as two independent fields via the `CoordsInput` primitive — that's the right mental model for a user reasoning about "where on the plot am I." But for derivation purposes, `x` and `y` are not treated as two independent axes of variation (e.g. not fed as `noiseMap(x, y)`'s two separate sample-position arguments) — they're joined into a single string and that single string is the entire seed. This is why the key needs a separator character (`:`) rather than bare concatenation: `x=1, y=23` and `x=12, y=3` would both stringify to `"123"` without one, silently colliding two different plots onto the same seed. `:` can't appear in a valid numeric coordinate string, so `` `${x}:${y}` `` never collides this way.

`getLocaleNoiseMap` has exactly five call sites in the whole repo, all found and confirmed by direct grep, not assumed: `src/stores/localeStore.ts` (the module-scope priming call and inside `addLocale()`), and `src/systems/spawnSystem.ts` (twice — `startSpawnScheduler` and `spawnRobot`), `idleSystem.ts` (once, `pickDestination`'s caller), and `interactionSystem.ts` (once). All five currently look up the owning planet via `usePlanetStore.getState().planets.find(...)` for the sole purpose of passing `planet.name` into this call — grepped and confirmed `usePlanetStore` has no other use anywhere in `spawnSystem.ts`, `idleSystem.ts`, or `interactionSystem.ts`. Once the planet argument is gone, that lookup is dead code in all three system files, and the `usePlanetStore` import is removed alongside it — this phase nets out to *less* code in those three files, not more. `src/engine/AudioEngine.ts` consumes the registry only through `tryGetLocaleNoiseMap(localeId)` (a plain by-ID lookup, confirmed via grep to never reference `planetId`/`planetName`) and needs **no changes at all**.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── noiseMaps.ts                 # MODIFIED — getLocaleNoiseMap(localeId, x, y): drop planetId/planetName params;
│   │                                 #   derive via alea(`${global}:${x}:${y}` | `${x}:${y}`) instead of sampling
│   │                                 #   planetMap(x, y); rewrite the function's doc comment to state the new
│   │                                 #   planet-invariant guarantee (the exact opposite of what it says today)
│   └── noiseMaps.test.ts            # NEW — first test file this module has ever had; see § 5
├── stores/
│   ├── localeStore.ts               # MODIFIED — both getLocaleNoiseMap call sites (module-scope priming ~L49,
│   │                                 #   addLocale() ~L60) drop the planetId/planetName args; DEFAULT_LOCALE's
│   │                                 #   coordinate-rationale comment corrected (see § 3)
│   └── localeStore.test.ts          # MODIFIED — the "default locale coordinates avoid (0,0)" test's docstring
│                                     #   updated to describe the new structural guarantee, not a workaround
│                                     #   (see § 7.3); the "sampling the planet noise map... varies by planet seed"
│                                     #   test is untouched in behavior (it tests getPlanetNoiseMap directly, which
│                                     #   this spec does not change) — verified no assertion there needs editing
├── systems/
│   ├── spawnSystem.ts               # MODIFIED — 2 call sites (~L108-110 in startSpawnScheduler, ~L355-357 in
│   │                                 #   spawnRobot): remove the usePlanetStore planet lookup, call
│   │                                 #   getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y)
│   │                                 #   directly off `locale` alone; drop the now-unused usePlanetStore import
│   ├── spawnSystem.test.ts          # MODIFIED — update any test setup that stubs/relies on the old call shape
│   ├── idleSystem.ts                # MODIFIED — same pattern, 1 call site (~L84-86)
│   ├── idleSystem.test.ts           # MODIFIED — same caveat
│   ├── interactionSystem.ts         # MODIFIED — same pattern, 1 call site (~L49-51)
│   └── interactionSystem.test.ts    # MODIFIED — same caveat
docs/
├── PROCEDURAL_GENERATION.md         # MODIFIED — resolve the Locale map bullet's "Planned change (not yet
│                                     #   implemented)" callout; rewrite the two-tier description (planet tier
│                                     #   still real for planet-level generation — planetInitialHour,
│                                     #   generateGlobalAudioSettings/generateGlobalLfoSettings — but no longer
│                                     #   feeds locale generation at all)
└── todo/roadmap.md               # MODIFIED — § 5's Known Issue gets a resolution pointer to this doc; § 6's
                                      #   first Restructure bullet is marked as pulled forward and resolved here
                                      #   (exact wording left to Plan phase, see § 7.1)
```

**Confirmed NOT touched:** `src/engine/AudioEngine.ts` (consumes only `tryGetLocaleNoiseMap`, no signature change reaches it), `src/utils/seedUtils.ts` (`derivePlanetSeed`/`getGlobalPlanetSeedOverride` are reused as-is, not modified), `src/utils/getSeededVal.ts` (samples whatever `NoiseFunction2D` it's handed — indifferent to how that map was derived), `getPlanetNoiseMap`/`evictPlanetNoiseMap`/`evictLocaleNoiseMap`/`tryGetLocaleNoiseMap` (all four keep their exact current signatures). No new dependency.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **`getPlanetNoiseMap` is untouched and stays planet-seeded.** It's still the correct source for genuinely planet-level (not per-locale) generation — `planetInitialHour`, and Phase 4's `generateGlobalAudioSettings`/`generateGlobalLfoSettings` (the global Audio Rig chain and global LFOs are deliberately planet-wide). Do not fold this phase's "decouple locale from planet" goal into removing or altering planet-level seeding — that's out of scope and would break Phase 4.
* **No `Locale`/`Robot`/store type shape changes.** `Locale.planetId` stays exactly where it is — it's still needed for ownership/lookup purposes elsewhere (e.g. `removeLocale`/`removePlanet` cleanup, UI display); this spec only removes it from the *noise-derivation* call chain, not from the data model.
* **The global seed override must keep working.** `getGlobalPlanetSeedOverride()` (`?seed=`, `window.__GLOBAL_PLANET_SEED__`, `setGlobalPlanetSeedOverride`) folds into the new string key exactly the way it already folds into the old integer seed (`` `${global}:${intSeed}` ``) — same fold-in pattern, new key shape.
* **Locale noise derives from coordinates alone — not from `localeId`.** Two different locale IDs at the identical `(x, y)` (even on the same planet) will produce identical noise maps under this design. This is an intentional consequence of "coordinates are the world's true seed," not an oversight — flagged explicitly in § 7.4 as worth the human's sign-off, since it wasn't asked about directly during the intake interview.
* **`spawnSystem.ts`/`idleSystem.ts`/`interactionSystem.ts`'s `usePlanetStore` removal is a real deletion, not a no-op left in place.** Don't leave a now-pointless `const planet = ...` lookup or an unused import behind — both `npm run lint` and `npm run build:types` (`noUnusedLocals`) would otherwise flag it, and it's dead weight regardless.
* **No UI, audio, or animation surface.** This is pure seeding math and store plumbing — none of CLAUDE.md's audio-scheduling/GSAP-timeline guardrails are exercised by this phase in practice, beyond the general "state stays serializable" rule, which was already true (noise maps have never lived in Zustand) and stays true.
* **X and Y are two UI inputs but one seed value — never two.** Don't derive the locale seed by feeding `x` and `y` into a function's two separate arguments (e.g. `noiseMap(x, y)`, or two independent `alea(x)`/`alea(y)` calls combined afterward) — concatenate them into a single string first (`` `${x}:${y}` ``) and hash that one value. A separator is mandatory, not stylistic: bare concatenation (`` `${x}${y}` ``) lets two different coordinate pairs collide onto the same string (`x=1,y=23` and `x=12,y=3` both stringify to `"123"`), silently merging two different plots' seeds.
* **Numeric coordinates as string-hash input:** `` `${x}:${y}` `` relies on JS's spec-guaranteed deterministic `Number.prototype.toString()` — fine for this codebase's coordinate ranges (verified: no existing coordinate value anywhere near the range where `toString()` switches to exponential notation), but don't silently "normalize" or round the coordinates before hashing — the exact typed-in value must be what's hashed, or two visually-identical inputs could hash differently due to hidden float noise.
* **Module-load-time priming order is preserved.** `localeStore.ts`'s module-scope `getLocaleNoiseMap(...)` priming call, and `planetStore.ts`'s module-scope `getPlanetNoiseMap(...)` priming call, must both still run eagerly before first render — this phase changes what `getLocaleNoiseMap` accepts, not when either priming call fires.

---

## 4. Code Style & Architecture Conventions

**`noiseMaps.ts` — before/after of the one function that changes:**

```typescript
// BEFORE (current)
export function getLocaleNoiseMap(
  localeId: string,
  planetId: string,
  planetName: string,
  x: number,
  y: number,
): NoiseFunction2D {
  if (!localeMaps.has(localeId)) {
    const planetMap = getPlanetNoiseMap(planetId, planetName);
    const rawSeed = planetMap(x, y); // -1 to 1
    const intSeed = Math.round(((rawSeed + 1) / 2) * (360 * 360 - 1)); // 0–129,599
    const global = getGlobalPlanetSeedOverride();
    const aleaSeed = global ? `${global}:${intSeed}` : intSeed;
    localeMaps.set(localeId, createNoise2D(alea(aleaSeed)));
  }
  return localeMaps.get(localeId)!;
}
```

```typescript
// AFTER
/**
 * Create (or return cached) the 2D noise map for a locale.
 *
 * The locale seed is derived directly from the locale's own coordinates —
 * `alea(`${x}:${y}`)` — with no dependency on any planet. Two locales with
 * identical coordinates will have IDENTICAL noise maps regardless of which
 * planet either one is on. This is a deliberate reversal of the old
 * planet-coupled derivation (see docs/PROCEDURAL_GENERATION.md) and, as a
 * side effect, structurally eliminates the old dead-zone bug: because
 * derivation never samples simplex noise AT (x, y) — it only hashes the
 * coordinate pair as a string, the same way derivePlanetSeed hashes a
 * planet name — there is no lattice-alignment geometry left to collapse.
 */
export function getLocaleNoiseMap(
  localeId: string,
  x: number,
  y: number,
): NoiseFunction2D {
  if (!localeMaps.has(localeId)) {
    const global = getGlobalPlanetSeedOverride();
    const key = global ? `${global}:${x}:${y}` : `${x}:${y}`;
    localeMaps.set(localeId, createNoise2D(alea(key)));
  }
  return localeMaps.get(localeId)!;
}
```

**Call-site simplification pattern** (identical shape at all 3 system-file call sites — `spawnSystem.ts` ×2, `idleSystem.ts` ×1, `interactionSystem.ts` ×1):

```typescript
// BEFORE
const planet = locale ? usePlanetStore.getState().planets.find((p) => p.id === locale.planetId) : undefined;
const noiseMap = locale && planet
  ? getLocaleNoiseMap(localeId, locale.planetId, planet.name, locale.coordinates.x, locale.coordinates.y)
  : null;
```

```typescript
// AFTER
const noiseMap = locale
  ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y)
  : null;
```

Remove the corresponding `import { usePlanetStore } from '../stores/planetStore';` from all three files once this is the only use (confirmed via grep it is, in every one of the three).

**`localeStore.ts` call sites** follow the same param-drop, no structural change otherwise:

```typescript
// module scope (near current line 49)
getLocaleNoiseMap(DEFAULT_LOCALE_ID, DEFAULT_LOCALE.coordinates.x, DEFAULT_LOCALE.coordinates.y);

// inside addLocale()
getLocaleNoiseMap(toAdd.id, toAdd.coordinates.x, toAdd.coordinates.y);
```

* **Naming Conventions:** No new files besides the test file (`noiseMaps.test.ts`, matching every other `src/utils/*.ts` module's existing `.test.ts` colocation convention). No new exports beyond the modified `getLocaleNoiseMap` signature itself.
* **Formatting:** Match `noiseMaps.ts`'s existing section-comment banner style (`// ====== IMPORTS ======` etc.) already present in the file — don't introduce a different comment convention.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library (though this phase touches no React components).
* **Test File Location:** Colocate (`noiseMaps.ts` → `noiseMaps.test.ts`, new).
* **`noiseMaps.test.ts` (new) — coverage targets:**
  1. **Planet-invariance (the core guarantee):** `getLocaleNoiseMap('locale-a', x, y)` and `getLocaleNoiseMap('locale-b', x, y)` — two different locale IDs, identical coordinates — produce noise functions whose `getSeededVal` output is identical across a range of `dataId`s. This is the regression test that protects the guarantee against a future edit accidentally reintroducing a planet argument into the hash.
  2. **Dead-zone regression, reframed:** the four coordinates the roadmap's Known Issue names as problematic under the *old* derivation — `(0,0)`, `(0.5,0.5)`, `(1,1)`, `(3.7,-8.2)` — each produce a noise function that is **not degenerate**: sampling `getSeededVal` across ≥8 different `dataId`s at each of these coordinates yields 8 distinct values (not a collapse to a repeated or constant value). Note this test is reframed from the old bug report's framing (which varied *planet seed* at a fixed coordinate) — since planet no longer factors in at all, there is nothing left to vary along that axis; what's tested here is that the coordinate-hash itself, evaluated at exactly these historically-bad points, behaves the same as any other point.
  3. **Distinctness across coordinates:** `(0,0)`, `(0.5,0.5)`, `(1,1)`, `(3.7,-8.2)`, and a normal high-precision point each produce **mutually distinct** noise functions (no two of these five collapse to the same underlying map) — guards against the string-hash accidentally colliding at exactly the points that used to be special-cased.
  4. **Global seed override still folds in:** with `setGlobalPlanetSeedOverride('x')` active, `getLocaleNoiseMap` for a given `(x, y)` differs from the same call with the override cleared — confirms the override isn't silently dropped by the new derivation.
  5. **Caching behavior unchanged:** calling `getLocaleNoiseMap` twice with the same `localeId` (even with different `x`/`y` on the second call) returns the same cached map both times — matches the existing `localeMaps.has(localeId)` cache-on-first-call behavior, unchanged by this phase.
* **`localeStore.test.ts` (modified):**
  - Update the "default locale coordinates avoid (0, 0)" test's description/comment to state the new framing (structural guarantee, not a hand-picked workaround) — the assertion itself (`not.toEqual({ x: 0, y: 0 })`) can stay if a round, memorable default is still preferred, or be dropped/relaxed now that no coordinate is unsafe; decide during Plan (§ 7.3).
  - Verify the "sampling the planet noise map... varies by planet seed" test (current line 66) still passes unmodified — it calls `getPlanetNoiseMap` directly, which this phase does not touch — and add a one-line comment noting why it's unaffected, so a future reader doesn't assume it tests the (now-removed) locale coupling.
* **`spawnSystem.test.ts` / `idleSystem.test.ts` / `interactionSystem.test.ts` (modified):** update any test setup/mocks that assumed the old 5-arg `getLocaleNoiseMap` call shape or stubbed `usePlanetStore` for this purpose specifically — audit each file's existing mocks during Plan/implementation rather than assuming none exist.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (this also catches any leftover 5-arg call site).
  2. `npm run lint` — zero ESLint errors (catches the now-unused `usePlanetStore` imports if any are missed).
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/locale-seed-decoupling`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences (e.g. `Decouple locale noise map derivation from planet identity`), roughly one commit per file group in § 2 (noiseMaps.ts + test, localeStore.ts + test, the three system files + tests together since they share one mechanical pattern, doc updates last).

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently during coding:

1. **Exact roadmap.md wording for both touched sections.** § 5's Known Issue needs a resolution pointer (e.g. "Resolved — see docs/specs/LOCALE_SEED_DECOUPLING.md") and § 6's first Restructure bullet needs to reflect that this slice was pulled forward and completed here, without rewriting Phase 6's remaining scope (rhythm engine, robot IDs) in a way that implies they're also done. Draft the exact paragraph during Plan, same as `AUDIO_RIG.md`'s § 7.1 precedent.
2. **`localeStore.test.ts`'s "avoid (0,0)" test — keep, relax, or drop?** Now that no coordinate is structurally unsafe, `DEFAULT_LOCALE.coordinates` no longer *needs* to be the specific verified-safe point it is today (`{ x: 12.3456, y: 67.891 }`). Two options: (a) leave the value as-is, just fix the comment/test framing (minimal diff, preserves git blame continuity), or (b) simplify it back toward a rounder, more memorable default (e.g. `{ x: 0, y: 0 }` or similar) now that it's provably safe, as a small demonstration that the fix is real. Confirm which during Plan — this is a one-line value change either way, low risk, but a deliberate choice either direction.
3. **Whether the "avoid (0,0)" assertion itself should be deleted or repurposed.** If the default coordinate value changes to something like `(0,0)` per option (b) above, the existing test asserting `not.toEqual({ x: 0, y: 0 })` would need to be deleted, not just reworded — flag this dependency explicitly in the Plan's task list so it isn't missed.
4. **Same-planet coordinate collisions are now literally identical, not just "possible."** Because `localeId` never enters the hash, two locales at the exact same `(x, y)` — even on the same planet — are now indistinguishable in every locale-derived respect (robots, idle behavior, interaction sounds, melody, velocity variance). This wasn't directly asked about during the intake interview (which focused on cross-planet invariance) and is worth an explicit human sign-off before implementation: is this acceptable (coordinates are the sole source of truth, full stop), or should collision-avoidance/disambiguation be added at the point locales are created (out of this spec's scope either way, but worth knowing before or after implementation, not discovered by surprise later)?
5. **`spawnSystem.ts`/`idleSystem.ts`/`interactionSystem.ts` test mocks — unaudited.** This spec's grep confirmed `usePlanetStore` has no other production-code use in these three files, but their existing `.test.ts` files weren't individually read line-by-line for mocks/spies targeting the old call signature. Audit each during implementation, not assumed clean here.
