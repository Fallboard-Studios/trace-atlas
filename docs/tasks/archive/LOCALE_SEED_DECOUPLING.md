# Implementation Plan: Locale Seed Decoupling (pulled forward from Roadmap Phase 6)

Source spec: [docs/specs/LOCALE_SEED_DECOUPLING.md](../specs/LOCALE_SEED_DECOUPLING.md). Source intent: [docs/intent/locale-seed-decoupling.md](../intent/locale-seed-decoupling.md).

## Overview

Make locale-generated content genuinely independent of which planet a locale sits on, and structurally eliminate the coordinate dead-zone bug in the same change. `noiseMaps.ts`'s `getLocaleNoiseMap` stops sampling the planet's simplex noise map at `(x, y)` and instead hashes the two coordinate inputs into one concatenated string key, seeding `createNoise2D` directly — the same string-hashing approach `derivePlanetSeed` already uses safely for planet names. This is a small, mostly-mechanical change with a wide correctness payoff: one function's derivation changes, four call sites drop a now-dead planet lookup, and three of those four files get *smaller*, not larger.

## Architecture Decisions

Resolving spec §7's five open questions before any task is written, not during implementation:

- **§7.1 — Roadmap wording, resolved exactly.** Phase 5's Known Issue gets this line appended: *"**Resolved** — see [docs/specs/LOCALE_SEED_DECOUPLING.md](../specs/LOCALE_SEED_DECOUPLING.md); locale noise generation no longer samples through the planet's noise map, eliminating both the planet-coupling and the dead-zone collapse described above."* Phase 6's first Restructure bullet is struck through and annotated: *"~~Update robot spawning rules so attributes come from planet agnostic lat/long coords seed~~ — **done, and generalized to all locale-derived content** (not just robot spawn attributes) via [docs/specs/LOCALE_SEED_DECOUPLING.md](../specs/LOCALE_SEED_DECOUPLING.md), pulled forward ahead of this phase. The remaining Phase 6 bullets (robot ID determinism, the 16-16th-note measure grid, density/motif/variance restructuring) are unaffected and still pending."* This is deliberately narrow — it does not touch Phase 6's "About" paragraph or any other bullet.
- **§7.2/§7.3 — `DEFAULT_LOCALE.coordinates` stays exactly as-is; only its rationale comment changes.** Keep `{ x: 12.3456, y: 67.891 }` unchanged (spec's option (a)) rather than simplifying to a rounder value. Reasoning: the value is no longer load-bearing once the fix lands, so changing it buys nothing functionally and would read as an unrelated diff in review; minimal diffs preserve git blame continuity for a line that's already been touched once for exactly this reason. Consequence for the existing test: **keep** `localeStore.test.ts`'s `not.toEqual({ x: 0, y: 0 })` assertion (it still correctly documents "we didn't regress to the bad default"), but rewrite its `it(...)` description to drop the "structural dead zone" framing (no longer true — no coordinate is a dead zone anymore) in favor of "still avoids the old default's problem point, though no coordinate would break this now."
- **§7.4 — Same-planet coordinate collisions are accepted as intended, not a gap.** The confirmed intent doc's design is explicit: coordinates are the sole seed for locale-derived content, full stop. Two locales at identical coordinates — on the same planet or different ones — producing identical generated content is the consistent, intended reading of that design, not scope creep to special-case. No mitigation task exists in this plan; if collision-avoidance at locale-creation time is ever wanted, it's a separate, later decision with its own intent/spec.
- **§7.5 — Test-mock audit, resolved by inspection, not deferred.** Read all three files directly: `idleSystem.test.ts` tests `pickDestination` as a pure function via an injected mock `NoiseFunction2D` — it never touches `getLocaleNoiseMap`/`usePlanetStore` and needs zero changes. `spawnSystem.test.ts` and `interactionSystem.test.ts` exercise the real `useLocaleStore`/`usePlanetStore` (via `DEFAULT_LOCALE`/`DEFAULT_LOCALE_ID`, whose planet is always registered at module load) and contain no mock of `noiseMaps.ts` or `planetStore.ts` for this call path — so removing the planet lookup changes no currently-exercised branch in either file. **No task exists solely to "update mocks"** — each of Tasks 3–5 below carries this confirmation as a checked acceptance-criteria line instead of a follow-up, since there's nothing left to audit that wasn't already resolved here.
- **Foundation-first, consumers in parallel.** `noiseMaps.ts`'s new signature is a breaking change (not additive, unlike every prop-addition task in `AUDIO_RIG.md`'s plan) — the four consumer files won't type-check again until their own tasks land. That's expected, not a defect: Task 1 is a real foundation task, and "the whole project type-checks/builds/tests clean" is the Phase 2 checkpoint's job, not Task 1's. Once Task 1 lands, Tasks 2–5 (the four consumer files) are **fully independent of each other** — none shares a file or a code dependency with any other — so they can be done in any order, or in parallel across sessions/agents.

## Dependency Graph

```
Task 1 (noiseMaps.ts + noiseMaps.test.ts)
    │
    ├──→ Task 2 (localeStore.ts + localeStore.test.ts)          ─┐
    ├──→ Task 3 (spawnSystem.ts + spawnSystem.test.ts)           │
    ├──→ Task 4 (idleSystem.ts + idleSystem.test.ts)             ├──→ Checkpoint: Foundation + consumers
    └──→ Task 5 (interactionSystem.ts + interactionSystem.test.ts)┘
                                                                    │
                                                                    ├──→ Task 6 (PROCEDURAL_GENERATION.md)
                                                                    └──→ Task 7 (roadmap.md)
                                                                            │
                                                                            └──→ Checkpoint: Complete
```

Tasks 2, 3, 4, 5 have no edges between them — they touch four disjoint files and can run in any order or concurrently once Task 1 is done.

## Task List

### Phase 1: Foundation

- [ ] **Task 1: `src/utils/noiseMaps.ts` — decouple `getLocaleNoiseMap` from planet identity**

  **Description:** Change `getLocaleNoiseMap`'s signature from `(localeId, planetId, planetName, x, y)` to `(localeId, x, y)`. Derive the seed as `alea(global ? \`${global}:${x}:${y}\` : \`${x}:${y}\`)` — a single concatenated string, per spec §1/§3/§4 — instead of sampling `getPlanetNoiseMap(planetId, planetName)(x, y)`. Rewrite the function's doc comment to state the new planet-invariant guarantee (the exact opposite of what it says today). Add `src/utils/noiseMaps.test.ts` (new file — this module has never had one) covering spec §5's 5 targets.

  **Acceptance criteria:**
  - [ ] `getLocaleNoiseMap`'s signature is exactly `(localeId: string, x: number, y: number): NoiseFunction2D` — no `planetId`/`planetName` parameter remains anywhere in its body, including no call to `getPlanetNoiseMap`.
  - [ ] The seed key is a single concatenated string (`` `${x}:${y}` ``, with the `:` separator — not bare concatenation, per spec's collision reasoning) — never two separate hash calls or a 2-argument function call keyed on `x` and `y` independently.
  - [ ] `getGlobalPlanetSeedOverride()` still folds into the key exactly as before (same fold-in shape, new key contents).
  - [ ] `getPlanetNoiseMap`, `tryGetLocaleNoiseMap`, `evictPlanetNoiseMap`, `evictLocaleNoiseMap` are untouched — verified by diff, not just by intent.
  - [ ] `noiseMaps.test.ts` asserts: (1) planet-invariance — two different `localeId`s at identical `(x,y)` produce identical `getSeededVal` output across ≥3 `dataId`s; (2) the four historically-bad coordinates (`(0,0)`, `(0.5,0.5)`, `(1,1)`, `(3.7,-8.2)`) each yield 8/8 distinct `getSeededVal` results across 8 different `dataId`s; (3) those same five coordinates (the four above + one high-precision control point) produce five mutually distinct noise functions; (4) the global seed override changes the result for a fixed `(x,y)`; (5) calling `getLocaleNoiseMap` twice with the same `localeId` returns the cached map both times regardless of a differing second-call `x`/`y`.

  **Verification:**
  - [ ] `npx vitest run src/utils/noiseMaps.test.ts` — all new tests passing.
  - [ ] `npm run build:types` — **expected to fail** on the four not-yet-updated consumer files (Tasks 2–5) at this point; confirm the *only* errors are the now-mismatched `getLocaleNoiseMap` call arities in `localeStore.ts`/`spawnSystem.ts`/`idleSystem.ts`/`interactionSystem.ts`, nothing else.
  - [ ] `npm run lint` clean for `noiseMaps.ts`/`noiseMaps.test.ts` themselves.

  **Dependencies:** None.

  **Files:** `src/utils/noiseMaps.ts`, `src/utils/noiseMaps.test.ts`

  **Estimated scope:** S (1 modified file, 1 new test file, pure function)

### Phase 2: Consumer call-site updates (fully parallel — each independent of the others)

- [ ] **Task 2: `src/stores/localeStore.ts` — update both call sites + default-coordinate comment**

  **Description:** Update the module-scope priming call and `addLocale()`'s call to the new 3-arg `getLocaleNoiseMap(id, x, y)` signature. Correct `DEFAULT_LOCALE.coordinates`'s rationale comment per the Architecture Decision above (value unchanged, comment rewritten to drop the "avoid the dead zone" framing in favor of describing the fix). Update `localeStore.test.ts`'s "avoid (0, 0)" test description per the same decision (assertion unchanged).

  **Acceptance criteria:**
  - [ ] Both call sites pass exactly `(localeId_or_id, coordinates.x, coordinates.y)` — no leftover `planetId`/`planet.name` argument.
  - [ ] `DEFAULT_LOCALE.coordinates` value is unchanged (`{ x: 12.3456, y: 67.891 }`); its comment no longer claims this specific point is uniquely safe.
  - [ ] The "default locale coordinates avoid (0, 0)" test's `it(...)` description no longer calls `(0,0)` a "structural dead zone" (that framing is now false for every coordinate, not just this one) — assertion body unchanged.
  - [ ] The "sampling the planet noise map... varies by planet seed" test (current line ~66) is confirmed to still pass unmodified — it calls `getPlanetNoiseMap` directly, untouched by this task — with a one-line comment added noting it does not test locale coupling.

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts` — all tests passing.
  - [ ] `npm run build:types` — no errors originating from this file.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (1 file + its test, two small call-site edits + one comment)

- [ ] **Task 3: `src/systems/spawnSystem.ts` — update both call sites, drop the dead planet lookup**

  **Description:** In `startSpawnScheduler` (~L108-110) and `spawnRobot` (~L355-357), remove the `const planet = usePlanetStore.getState().planets.find(...)` lookup and call `getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y)` directly off `locale` alone (guarded only by `locale` existing, not `locale && planet`). Remove the now-unused `usePlanetStore` import.

  **Acceptance criteria:**
  - [ ] Both call sites use the 3-arg signature; the noise-map guard is `locale ? getLocaleNoiseMap(...) : null` (not `locale && planet ? ... : null`).
  - [ ] No reference to `usePlanetStore` remains anywhere in the file (import removed).
  - [ ] Confirmed (already verified during planning, re-confirm post-edit): `spawnSystem.test.ts` requires **no** mock changes — it exercises the real default locale/planet via `DEFAULT_LOCALE`/`DEFAULT_LOCALE_ID`, which always resolves a real planet, so the removed lookup never drove a currently-tested branch.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts` — all existing tests passing unmodified.
  - [ ] `npm run build:types` — no errors originating from this file.
  - [ ] `npm run lint` clean (confirms the unused-import removal is complete).

  **Dependencies:** Task 1.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts` (verification only — no edits expected)

  **Estimated scope:** S (1 file, 2 mechanically identical call-site edits, 1 import removal)

- [ ] **Task 4: `src/systems/idleSystem.ts` — update the call site, drop the dead planet lookup**

  **Description:** Same pattern as Task 3, one call site (~L84-86) inside the function that calls `pickDestination`. Remove the `usePlanetStore` import.

  **Acceptance criteria:**
  - [ ] The call site uses the 3-arg signature; the guard is `locale ? getLocaleNoiseMap(...) : null`.
  - [ ] No reference to `usePlanetStore` remains in the file.
  - [ ] Confirmed (already verified during planning, re-confirm post-edit): `idleSystem.test.ts` requires **no** changes at all — it tests `pickDestination` directly via an injected mock `NoiseFunction2D` and never exercises this call site.

  **Verification:**
  - [ ] `npx vitest run src/systems/idleSystem.test.ts` — all existing tests passing unmodified.
  - [ ] `npm run build:types` — no errors originating from this file.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/systems/idleSystem.ts` (test file: verification only, no edits expected)

  **Estimated scope:** XS (1 file, 1 call-site edit, 1 import removal)

- [ ] **Task 5: `src/systems/interactionSystem.ts` — update the call site, drop the dead planet lookup**

  **Description:** Same pattern as Task 3, one call site (~L49-51). Remove the `usePlanetStore` import.

  **Acceptance criteria:**
  - [ ] The call site uses the 3-arg signature; the guard is `locale ? getLocaleNoiseMap(...) : null`.
  - [ ] No reference to `usePlanetStore` remains in the file.
  - [ ] Confirmed (already verified during planning, re-confirm post-edit): `interactionSystem.test.ts` requires **no** mock changes — no mock in the file targets `noiseMaps.ts` or `planetStore.ts` for this call path.

  **Verification:**
  - [ ] `npx vitest run src/systems/interactionSystem.test.ts` — all existing tests passing unmodified.
  - [ ] `npm run build:types` — no errors originating from this file.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/systems/interactionSystem.ts` (test file: verification only, no edits expected)

  **Estimated scope:** XS (1 file, 1 call-site edit, 1 import removal)

### Checkpoint: Foundation + consumers complete
- [ ] `npm run build:types` — zero errors project-wide (this is the first point in the plan where a fully clean type-check is expected).
- [ ] `npm run lint` — zero errors project-wide.
- [ ] `npm test` — all tests passing, including `noiseMaps.test.ts` (new) and the four modified/re-verified consumer test files.
- [ ] `npm run build` — production bundle builds cleanly.
- [ ] Review with human before proceeding to docs.

---

### Phase 3: Docs

- [ ] **Task 6: `docs/PROCEDURAL_GENERATION.md` — resolve the planned-change callout**

  **Description:** Rewrite the Locale map bullet to remove its "Planned change (not yet implemented)" callout and describe the new single-hash derivation; update the two-tier model's opening description so the planet tier is described as still real for planet-level generation (`planetInitialHour`, `generateGlobalAudioSettings`/`generateGlobalLfoSettings`) but no longer feeding locale generation at all.

  **Acceptance criteria:**
  - [ ] No remaining "not yet implemented"/"planned change" language describing this specific decoupling.
  - [ ] The Locale map bullet's derivation description matches the shipped code exactly (concatenated `(x,y)` string → `alea` → `createNoise2D`), not the old two-step sample-and-rescale description.
  - [ ] The "two locales with identical coordinates on different planets get different noise maps" line is corrected to state the opposite.
  - [ ] The Gotchas section's existing points (don't rename a `dataId`, don't store a `NoiseFunction2D` in Zustand, etc.) are left untouched — this task only touches the Locale map derivation description.

  **Verification:**
  - [ ] Manual review — every rewritten claim spot-checked against the actually-shipped `noiseMaps.ts` from Task 1, not reconstructed from this plan or the spec.

  **Dependencies:** Task 1 (describes shipped behavior, not planned behavior).

  **Files:** `docs/PROCEDURAL_GENERATION.md`

  **Estimated scope:** XS (docs only)

- [ ] **Task 7: `docs/todo/roadmap.md` — Phase 5 Known Issue + Phase 6 Restructure bullet**

  **Description:** Apply the exact wording resolved in this plan's Architecture Decisions (§7.1) — append the resolution line to Phase 5's Known Issue, and strike through + annotate Phase 6's first Restructure bullet.

  **Acceptance criteria:**
  - [ ] Phase 5's Known Issue ends with the resolution pointer to `docs/specs/LOCALE_SEED_DECOUPLING.md`.
  - [ ] Phase 6's first Restructure bullet is struck through and annotated as done-and-generalized, with a link to the same spec.
  - [ ] No other part of Phase 6 (its "About" paragraph, its other Restructure bullets, its Docs section) is reworded — this task's diff is exactly these two spots.

  **Verification:**
  - [ ] Manual review — confirm the diff touches only the two intended spots in `roadmap.md`.

  **Dependencies:** Task 1 through Task 5 (describes the whole phase as complete).

  **Files:** `docs/todo/roadmap.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 7 tasks met.
- [ ] Both docs (`PROCEDURAL_GENERATION.md`, `roadmap.md`) reflect the shipped behavior, spot-checked against source — not against this plan.
- [ ] Ready for human review / PR, and ready to unblock the Sector Settings spec (which depends on this phase).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 1 is a breaking (non-additive) signature change, unlike every task in `AUDIO_RIG.md`'s plan | Low — expected, not a defect | Explicitly called out in Architecture Decisions and Task 1's verification step; the project-wide clean build is the Phase 2 checkpoint's job, not Task 1's |
| String-hash key relies on `Number.prototype.toString()` determinism | Low | Spec §3 already confirms no existing coordinate approaches exponential-notation range; `noiseMaps.test.ts` Task 1's distinctness assertions would surface a collision if one existed |
| A future edit reintroduces `planetId`/`localeId` into the hash without realizing it breaks the planet-invariance guarantee | Low | `noiseMaps.test.ts`'s planet-invariance test (Task 1, criterion 1) is a standing regression guard, not a one-time check |
| Same-planet coordinate collisions (Architecture Decision §7.4) surprise a future contributor who didn't read this plan | Low | Documented explicitly in both the spec (§7.4) and this plan's Architecture Decisions, not left implicit in code alone |

## Open Questions

None remaining — all five items in spec §7 are resolved above: §7.1 (roadmap wording) → Task 7, exact text fixed in Architecture Decisions; §7.2/§7.3 (default coordinate + its test) → Task 2, resolved as "keep value, fix comment/description"; §7.4 (same-planet collisions) → confirmed accepted-as-intended, no task; §7.5 (test-mock audit) → resolved by direct inspection above, folded into Tasks 3–5's acceptance criteria rather than a separate task.
