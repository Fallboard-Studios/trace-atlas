# Implementation Plan: Attenuation Style (Roadmap Phase 10.1)

Source spec: [docs/specs/ATTENUATION_STYLE.md](../specs/ATTENUATION_STYLE.md). Source intent: [docs/intent/attenuation-style.md](../intent/attenuation-style.md). No hard dependency on any unshipped phase — Locale Seed Decoupling and Sector Settings (both already shipped) are prior art this phase extends, not blocking prerequisites.

## Overview

Two independent mechanisms land side by side, converging only in `worldTransition.ts`: (1) World Time moves from `Planet` to `Locale` — `dayStartTimestamp` is computed once from a locale's own x-coordinate instead of derived from a planet-size table, and the retransmit branch that recalculates it inverts; (2) factories gain a second, additive, AS-seeded color component, recomputed in place on an AS-only retransmit without touching position/count/id/variant. A third, purely cosmetic thread (user-facing copy: "Planet" → "Attenuation Style" in a handful of strings) rides along independently of both. Per the spec's own §1.2 finding, the factory-recolor mechanism (`factoryPlacementSystem.ts`) touches none of the `Planet` fields being deleted — it is a genuinely independent leaf, not downstream of the time-formula work, which is why the dependency graph below fans out wider in Phase 1 than a first read of the spec might suggest.

## Architecture Decisions

Resolving spec §7's open items before any task is written:

- **§7 item 1 (`PLANET_NAME_PRESETS`' four values are TBD) — no task invents replacement copy.** The intent doc explicitly scopes this out ("left as a TBD for implementation time, not decided here"); Task 12 below ships the four entries structurally unchanged (still Kryndara/Vessport Null/Halcyon Drift/The Rusting) alongside the schema-label copy that *is* in scope. A follow-up task to rename them is a separate, later unit of work, not part of this plan.
- **§7 item 2 (`AS_FACTORY_HUE_SHIFT_RANGE`/`AS_FACTORY_SAT_SHIFT_RANGE` magnitude) — ship the spec's proposed defaults (`±30`/`±20`), validate at the Phase 3 checkpoint's manual check, adjust only if visually inadequate.** Not worth a separate gating task — the values are two constants in one file (Task 5), trivial to tune in place if the manual check finds them wrong, and re-verification is the same manual check either way.
- **§7 item 3 (`Planet.locales: string[]` staleness) — no action.** Confirmed unrelated to this phase's own correctness (the spec's own finding: `removePlanet`'s eviction cascade is the only reader, untouched here). Carried forward as a standing note, same treatment SECTOR_SETTINGS.md's plan gave it originally.
- **Task 5 (`factoryPlacementSystem.ts`) is a Phase 1 leaf, not gated behind the time-formula work.** Confirmed by direct inspection of the spec's own code sketch: `deriveAsColorShift`/`createFactory`'s new `asShift` param/`placeFactories`'s new planet lookup/`recolorFactoriesForAttenuationStyle` reference only `Planet.id`/`Planet.name` — neither field is touched by Task 1's deletions. This is the plan's one genuine surprise relative to a literal reading of the spec's file list, which interleaves both mechanisms' files by directory rather than by dependency.
- **Independent leaf tasks (Phase 1) share no dependencies on each other** — buildable and testable in any order or in parallel, same posture SECTOR_SETTINGS.md's plan used for its own four independent leaf fixes.

## Dependency Graph

```
Task 1  (types/planet.ts)        ─────┬──────────────────────┬─────────────────────────┐
Task 2  (types/locale.ts)        ─────┼───┬──────────────────┼─────┬───────────────────┤
Task 3  (constants/time.ts)      ─────┼───┼───┬──────────────┼─────┼─────────────┐     │
Task 4  (utils/seedUtils.ts)     ─────┘   │   │              │     │             │     │
Task 5  (factoryPlacementSystem) ─────────┼───┼──────────────┼─────┼──────→ Task 12 ────┤
Task 6  (docs comment fixes)     (soft-follows Task 1; no compile dependency)     │     │
Task 7  (sectorSettingsConfig)   (independent — no dependents)                    │     │
Task 8  (SectorSettingsDrawer comment) (independent — no dependents)              │     │
                                          │   │              │     │             │     │
                                          ▼   ▼              │     ▼             │     │
                                     Task 9 (planetStore) ────┘     Task 10 (localeStore)
                                          │                              │
                                          └──────────────┬───────────────┘
                                                          ▼
                                              Task 12 (worldTransition.ts)
                                                          │
                                              Task 13 (PlanetView+LocaleView) ←── Task 10
                                                          │
                                                          ▼
                                              Task 14 (docs/BUILDING_DESIGN.md) ←── Task 5

Task 11 (TransportBar.tsx) ←── Task 1   (parallel to Tasks 9/10, not on their path)
```

Tasks 1–8 share no edges between them (8-way parallel fan-out). Task 9 depends only on Task 1; Task 10 depends only on Tasks 2 and 3; Task 11 depends only on Task 1 — all three are Phase 2 parallel siblings. Task 12 depends on Tasks 1, 2, 3, 5, and 9 (needs `Planet`/`Locale`'s new shapes, `DAY_DURATION_MS`, `recolorFactoriesForAttenuationStyle`, and `planetStore.ts`'s `addPlanet` already rewritten). Task 13 depends on Tasks 2, 3, and 10 — not on Task 12; it reads store state directly and calls no `worldTransition.ts` function, so it's a Phase 3 parallel sibling to Task 12, not downstream of it. Task 14 depends only on Task 5 and is sequenced last so it can describe confirmed-working behavior rather than code-review-only behavior.

## Task List

### Phase 1: Independent foundations (parallel, 8-way fan-out)

- [x] **Task 1: `src/types/planet.ts` — delete `PlanetSize` and every dead/moved `Planet`/`PlanetState` field**

  **Description:** Delete `PlanetSize`, `Planet.size`, `Planet.dayStartTimestamp`, `Planet.currentHour`, and `PlanetState.setPlanetSize`/`setDayStartTimestamp`/`setCurrentHour`, per spec §4's diff. `Planet` becomes `{ id, name, locales, currentLocaleId? }`; `PlanetState` becomes `{ planets, addPlanet, removePlanet, setCurrentLocale }`.

  **Acceptance criteria:**
  - [ ] `PlanetSize` is not exported from this file (or anywhere).
  - [ ] `Planet` has exactly 4 fields: `id`, `name`, `locales`, `currentLocaleId?`.
  - [ ] `PlanetState` has exactly 4 members: `planets`, `addPlanet`, `removePlanet`, `setCurrentLocale`.

  **Verification:**
  - [ ] `npm run build:types` — **expected to show multiple errors** at every file still referencing the deleted fields/type (`planetStore.ts`, `worldTransition.ts`, `PlanetView.tsx`, `TransportBar.test.tsx`, `planetStore.test.ts`) until Phase 2/3 land. Confirm no error appears outside that expected set.
  - [ ] `npm run lint` clean for this file itself.

  **Dependencies:** None.

  **Files:** `src/types/planet.ts`

  **Estimated scope:** XS (1 file, interface trim)

- [x] **Task 2: `src/types/locale.ts` — `Locale` gains `dayStartTimestamp`**

  **Description:** Add `dayStartTimestamp: number` to the `Locale` interface, per spec §4's diff. No new `LocaleState` setter — `setLocaleData` already carries arbitrary partial updates.

  **Acceptance criteria:**
  - [ ] `Locale.dayStartTimestamp: number` (required, not optional) is present.
  - [ ] `LocaleState`'s member list is otherwise unchanged.

  **Verification:**
  - [ ] `npm run build:types` — **expected to show errors** at every object literal typed as `Locale` that doesn't yet supply `dayStartTimestamp` (`localeStore.ts`'s `DEFAULT_LOCALE`, `worldTransition.ts`'s `buildLocale`, any inline `Locale` test fixtures) until their own tasks land.
  - [ ] `npm run lint` clean for this file itself.

  **Dependencies:** None.

  **Files:** `src/types/locale.ts`

  **Estimated scope:** XS (1 file, one field added)

- [x] **Task 3: `src/constants/time.ts` (+ test) and `src/constants/index.ts` — `DAY_DURATION_MS`/`computeLocaleHour`**

  **Description:** Replace `PLANET_DURATION_MS`/`computePlanetHour`/`computeLocalTime` with `DAY_DURATION_MS = 6 * 60_000` and `computeLocaleHour(dayStartTimestamp: number): number`, per spec §4's full-file sketch. Update `constants/index.ts`'s barrel re-export and doc comment to match (no confirmed importers of the barrel form today — kept in sync anyway so the module compiles).

  **Acceptance criteria:**
  - [ ] `DAY_DURATION_MS === 360000`.
  - [ ] `computeLocaleHour(dayStartTimestamp)` takes exactly one parameter (no size argument).
  - [ ] `PLANET_DURATION_MS`, `computePlanetHour`, `computeLocalTime` are not exported from `time.ts` or `index.ts`.

  **Verification:**
  - [ ] `npx vitest run src/constants/time.test.ts` — per spec §5: returns `0` at `dayStartTimestamp = Date.now()`; returns `~12` at `dayStartTimestamp = Date.now() - DAY_DURATION_MS/2`; wraps correctly past 24.
  - [ ] `npm run build:types` — **expected to show errors** at every remaining importer of the deleted exports until their own tasks land.
  - [ ] `npm run lint` clean for the modified files themselves.

  **Dependencies:** None.

  **Files:** `src/constants/time.ts`, `src/constants/time.test.ts`, `src/constants/index.ts`

  **Estimated scope:** XS (pure functions, no store dependency)

- [x] **Task 4: `src/utils/seedUtils.ts` (+ test) — delete `planetInitialHour`**

  **Description:** Remove `planetInitialHour` (the letter-average algorithm) entirely. `derivePlanetSeed`/override machinery (`setGlobalPlanetSeedOverride`, `getGlobalPlanetSeedOverride`, `generateRandomPlanetName`, `resolveDefaultPlanetName`) are untouched — this phase deletes exactly one function from this file.

  **Acceptance criteria:**
  - [ ] `planetInitialHour` is not exported from this file.
  - [ ] Every other export in the file is byte-identical to before.

  **Verification:**
  - [ ] `npx vitest run src/utils/seedUtils.test.ts` — `planetInitialHour` coverage removed, every other existing test still passing.
  - [ ] `npm run build:types` — **expected to show errors** at `planetStore.ts`/`worldTransition.ts` until their own tasks land.
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/seedUtils.ts`, `src/utils/seedUtils.test.ts`

  **Estimated scope:** XS (1 function removed)

- [x] **Task 5: `src/systems/factoryPlacementSystem.ts` (+ test) — AS-seeded factory recolor mechanism**

  **Description:** Add `deriveAsColorShift` (private), extend `createFactory` with an additive `asShift: ColorShift = { hueShift: 0, satShift: 0 }` parameter, extend `placeFactories` to resolve the locale's own planet internally and pass a real `asShift` to every factory it creates, and add the new exported `recolorFactoriesForAttenuationStyle(localeId, planetId, planetName)` — all per spec §4's full code sketch. This is the phase's single largest and most consequential task; budget the most review attention here.

  **Acceptance criteria:**
  - [ ] `createFactory` called with no `asShift` argument produces the exact same `hueShift`/`satShift` as before this task (regression-safe default).
  - [ ] `createFactory` called with a supplied `asShift` sums it into the stored `hueShift`/`satShift` — never replaces the locally-derived values.
  - [ ] `placeFactories`'s exported signature is unchanged (`(localeId: string): Actor[]`) — the new planet lookup is internal, not a new parameter.
  - [ ] `placeFactories` falls back to a zero `asShift` (not a crash) when the locale's `planetId` doesn't resolve to any planet currently in `usePlanetStore`.
  - [ ] `recolorFactoriesForAttenuationStyle` changes only `config.hueShift`/`config.satShift` on every `FACTORY`-type actor in the given locale — `id`/`position`/`scaleX`/`scaleY`/`rotation`/`config.row`/`rooftopGreeble`/`facadeGreeble`/`beltCourseCount`/`purpose`/`isOffline`/`offlineSince` all round-trip byte-identical.
  - [ ] `recolorFactoriesForAttenuationStyle` is idempotent under repeated calls with the same `(planetId, planetName)` — same output every time, no drift.
  - [ ] `recolorFactoriesForAttenuationStyle` on a locale with zero factories, or a nonexistent locale id, is a safe no-op (no throw).

  **Verification:**
  - [ ] `npx vitest run src/systems/factoryPlacementSystem.test.ts` — all 6 coverage points from spec §5 passing.
  - [ ] `npm run build:types`, `npm run lint` clean (this file has no dependency on anything being deleted elsewhere — should compile cleanly even mid-phase).

  **Dependencies:** None.

  **Files:** `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`

  **Estimated scope:** M (1 file, 4 functions touched/added — the phase's real complexity)

- [x] **Task 6: Stale `currentHour` reference cleanup — `harmonySystem.ts` comment + `CONTRIBUTION_GUIDE.md` line**

  **Description:** Correct `harmonySystem.ts`'s doc comment (already inaccurate before this phase — claims the hour comes from `selectCurrentPlanet(...)?.currentHour`, when the real source is `beatClock.ts`'s own `getCurrentHour()`) and drop `currentHour` from `docs/CONTRIBUTION_GUIDE.md:37`'s `planetStore` description, per spec §4/§2. No functional code change in either file.

  **Acceptance criteria:**
  - [ ] `harmonySystem.ts`'s comment above `EighthNotes` names `beatClock.ts`'s `getCurrentHour()` as the real source, not `Planet.currentHour`.
  - [ ] `docs/CONTRIBUTION_GUIDE.md`'s `planetStore` line no longer mentions `currentHour`.
  - [ ] `harmonySystem.test.ts` is untouched — its own local `currentHour` variable mocks `beatClock.getCurrentHour()` and is unrelated; confirm this explicitly rather than "fixing" it.

  **Verification:**
  - [ ] Manual review — diff touches only the named comment/line in each file.
  - [ ] `npx vitest run src/engine/harmonySystem.test.ts` unaffected (no assertions reference the comment text).

  **Dependencies:** None (no compile dependency; sequenced after Task 1 in spirit only, since the comment asserts a deletion that should actually have landed by the time this merges).

  **Files:** `src/engine/harmonySystem.ts`, `docs/CONTRIBUTION_GUIDE.md`

  **Estimated scope:** XS (2 files, comment/line only)

- [x] **Task 7: `src/data/sectorSettingsConfig.ts` (+ test) — `PLANET_NAME_SCHEMA` copy**

  **Description:** Update `PLANET_NAME_SCHEMA`'s `loreLabel`/`humanLabel`/`placeholder` to AS-flavored copy (`'ATTENUATION SEED'`/`'Attenuation Style'`/`'Enter a new attenuation style…'`), per spec §4. `PLANET_NAME_PRESETS`' four `label`/`value` pairs stay unchanged (§7 item 1 — TBD, not decided here). No identifier renamed.

  **Acceptance criteria:**
  - [ ] `PLANET_NAME_SCHEMA.humanLabel === 'Attenuation Style'`, `.placeholder === 'Enter a new attenuation style…'`, `.loreLabel === 'ATTENUATION SEED'`.
  - [ ] `PLANET_NAME_PRESETS` still has exactly 4 entries, values unchanged from before this task.
  - [ ] No exported identifier (`PLANET_NAME_SCHEMA`, `PLANET_NAME_PRESETS`, `COORDS_SCHEMA`, etc.) is renamed.

  **Verification:**
  - [ ] `npx vitest run src/data/sectorSettingsConfig.test.ts` — label-text assertions updated to the new copy; preset-count assertions unchanged; passing.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/sectorSettingsConfig.ts`, `src/data/sectorSettingsConfig.test.ts`

  **Estimated scope:** XS (string literals only)

- [x] **Task 8: `SectorSettingsDrawer.tsx` — doc-comment wording**

  **Description:** Update the file's own top-of-component doc comment ("Planet Calibration (reseed the planet) and Plot Tuning...") to read "Attenuation Style" framing, per spec §2. No JSX or logic change — no literal "Planet Calibration" string is actually rendered anywhere in this component (confirmed by direct inspection during Specify).

  **Acceptance criteria:**
  - [ ] The doc comment reads "Attenuation Style" rather than "Planet Calibration."
  - [ ] Zero JSX/logic diff — `git diff` for this file touches only comment lines.

  **Verification:**
  - [ ] Manual review — confirm no rendered-string change.
  - [ ] `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` — unmodified, still passing (no behavior change).

  **Dependencies:** None.

  **Files:** `src/components/panels/screen/console/SectorSettingsDrawer.tsx`

  **Estimated scope:** XS (comment only)

### Checkpoint: Foundations complete

- [x] `npx vitest run src/constants/time.test.ts src/utils/seedUtils.test.ts src/systems/factoryPlacementSystem.test.ts src/data/sectorSettingsConfig.test.ts src/engine/harmonySystem.test.ts src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` — all passing.
- [x] `npm run build:types` — confirmed remaining errors are isolated to `worldTransition.ts`, `PlanetView.tsx`, `LocaleView.tsx`, `localeStore.ts`, `TransportBar.test.tsx`, and inline `Locale` test fixtures — all Task 2/12/13's own known-pending scope, nothing else.
- [x] `npm run lint` clean across every file touched (repo-wide `npm run lint` clean, not just the touched set).
- [x] Review with human before proceeding — flagged inline per Task 5's commit; awaiting human review before Phase 2.

**Deviation from the plan as written:** Task 9 (`planetStore.ts`) was pulled forward into this phase, out of its planned Phase 2 slot. Tasks 1/3/4 left `planetStore.ts` referencing deleted symbols not just at the type level but inside `DEFAULT_PELAGOS`'s eager module-load-time computation (`makeDayStartTimestamp`) — every test that transitively imports `localeStore.ts` (the large majority of the suite) crashed at runtime, not just at `build:types` as the plan's own Risk section anticipated (27 test files / 31 tests failing at the worst point). Task 9 depends only on Task 1, already done, so this doesn't violate the plan's dependency graph — it corrects an underestimate in the Risk section, not a resequencing of real dependencies. Full detail in the Task 9 commit message.

---

### Phase 2: Stores + copy-dependent consumer (parallel siblings)

- [x] **Task 9: `src/stores/planetStore.ts` (+ test) — drop `PlanetSize`/`dayStartTimestamp`/`currentHour` machinery**

  **Description:** Delete `makeDayStartTimestamp`, `DEFAULT_PELAGOS.size`/`.dayStartTimestamp`/`.currentHour`, `addPlanet`'s internal `dayStartTimestamp` recompute block, and the `setPlanetSize`/`setDayStartTimestamp`/`setCurrentHour` actions — `addPlanet` becomes a straightforward name-uniqueness-checked push plus its existing `getPlanetNoiseMap(planet.id, planet.name)` priming call, unchanged.

  **Acceptance criteria:**
  - [ ] `DEFAULT_PELAGOS` has exactly the 4 `Planet` fields from Task 1's new type — no `size`/`dayStartTimestamp`/`currentHour`.
  - [ ] `addPlanet`'s name-uniqueness rejection and `getPlanetNoiseMap` priming behavior are unchanged from before this task.
  - [ ] `setPlanetSize`/`setDayStartTimestamp`/`setCurrentHour` are not exported from the store.

  **Verification:**
  - [ ] `npx vitest run src/stores/planetStore.test.ts` — the `setPlanetSize`, `setCurrentHour`, and `setDayStartTimestamp` describe-blocks removed in full; `addPlanet`'s existing coverage (rejection + noise-map priming) still passing unmodified.
  - [ ] `npm run build:types` — this file's own errors from Task 1 are now resolved; other known-pending files (`worldTransition.ts`, `PlanetView.tsx`, `TransportBar.test.tsx`) still expected to error.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/stores/planetStore.ts`, `src/stores/planetStore.test.ts`

  **Estimated scope:** S (1 file, several related deletions)

- [x] **Task 10: `src/stores/localeStore.ts` (+ test) — `DEFAULT_LOCALE` gains `dayStartTimestamp`**

  **Description:** Compute `DEFAULT_LOCALE.dayStartTimestamp` once at module load, via the same formula `buildLocale` uses: `Date.now() - (Math.abs(x % 24) / 24) * DAY_DURATION_MS`, using `DEFAULT_LOCALE.coordinates` (`{ x: 12, y: 68 }`).

  **Acceptance criteria:**
  - [ ] `DEFAULT_LOCALE.dayStartTimestamp` is present and satisfies `Locale`'s now-required field.
  - [ ] `computeLocaleHour(DEFAULT_LOCALE.dayStartTimestamp)` immediately after module load equals `Math.abs(12 % 24) === 12` (within test-execution tolerance).
  - [ ] No other field on `DEFAULT_LOCALE` changes.

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts` — any test asserting `DEFAULT_LOCALE`'s full shape updated to include the new field; new assertion for the hour-at-load value.
  - [ ] `npm run build:types` — this file's own errors from Task 2 are now resolved.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 2, Task 3.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** XS (1 field, computed once at module scope)

- [x] **Task 11: `TransportBar.tsx` (+ test) — "Planet:" → "Attenuation Style:" label**

  **Description:** Change the `<VisuallyHidden>Planet: </VisuallyHidden>` label to `<VisuallyHidden>Attenuation Style: </VisuallyHidden>`, per spec §4. Class name (`transport-bar__planet`) and JS variable name (`planetName`) stay unchanged — internal identifiers, not user-facing text. `TEST_PLANET` fixture in the test file drops `size`/`dayStartTimestamp`/`currentHour` to match Task 1's new `Planet` type.

  **Acceptance criteria:**
  - [ ] The rendered accessible label text is "Attenuation Style: {name}", not "Planet: {name}".
  - [ ] `transport-bar__planet` class name and `planetName` variable name are unchanged.
  - [ ] `TEST_PLANET` fixture compiles against the new `Planet` type with no excess-property error.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/TransportBar.test.tsx` — the "labels each metadata field with real text" test's `['.transport-bar__planet', 'Planet', 'Glaxos']` row updated to `'Attenuation Style'`; all other tests passing unmodified.
  - [ ] `npm run build:types` — this file's own errors from Task 1 are now resolved.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/TransportBar.tsx`, `src/components/panels/screen/TransportBar.test.tsx`

  **Estimated scope:** XS (1 label string + 1 test fixture)

### Checkpoint: Stores + copy consumers complete

- [x] `npx vitest run src/stores/planetStore.test.ts src/stores/localeStore.test.ts src/components/panels/screen/TransportBar.test.tsx` — all passing (83 tests).
- [x] `npm run build:types` — confirmed remaining errors are isolated to `worldTransition.ts`/`PlanetView.tsx`/`LocaleView.tsx` (Task 12/13) plus `factoryPlacementSystem.test.ts`'s still-inline `Locale` fixtures (pre-existing, outside this phase) — nothing else.
- [x] `npm run lint` clean (repo-wide).
- [ ] Review with human before proceeding to `worldTransition.ts` — same gate SECTOR_SETTINGS.md's plan used before its own orchestration-core task.

---

### Phase 3: Orchestration core + world-time view wiring (parallel siblings)

- [x] **Task 12: `src/systems/worldTransition.ts` (+ test) — time-formula inversion + AS recolor call**

  **Description:** `buildPlanet` drops `dayStartTimestamp`/`size`/`currentHour` entirely; `buildLocale` stamps `dayStartTimestamp` from its own `coordinates.x`; `retransmitPlanetOnly` calls the new `recolorFactoriesForAttenuationStyle(oldLocaleId, newPlanet.id, newPlanet.name)` for the re-parented locale, and — critically — does **not** touch that locale's `dayStartTimestamp` in any way (only ever `setLocaleData(oldLocaleId, { planetId: newPlanet.id })`, a partial patch). `retransmitCoordsOnly`/`retransmitBoth` need no code change — both already call `buildLocale`, which now stamps the field as a direct consequence.

  **Acceptance criteria:**
  - [ ] `buildLocale`'s output, immediately after construction, satisfies `computeLocaleHour(locale.dayStartTimestamp) ≈ Math.abs(x % 24)` for both a positive and a negative `x`.
  - [ ] `retransmitPlanetOnly` leaves the preserved locale's `dayStartTimestamp` byte-identical before/after the call.
  - [ ] `retransmitPlanetOnly` calls `recolorFactoriesForAttenuationStyle` exactly once, with the preserved locale's id and the **new** planet's id/name — spy/mock-verified, not inferred from side effects.
  - [ ] `retransmitCoordsOnly`/`retransmitBoth` never call `recolorFactoriesForAttenuationStyle`.
  - [ ] After `retransmitPlanetOnly`, the preserved locale's `actors` array has the same length, same `id`s in the same order, and same `position`/`scaleX`/`scaleY` as before — only `config.hueShift`/`config.satShift` may differ.
  - [ ] `retransmitWorld({})` (neither field set) remains a true no-op — unchanged from SECTOR_SETTINGS.md's own existing guarantee, not weakened by this task.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldTransition.test.ts` — the 4 new coverage points from spec §5 passing, plus every pre-existing branch test (SECTOR_SETTINGS.md's own suite) still passing unmodified — confirmed by the spec's own grep finding that this file has zero references to any deleted symbol, so no *structural* rewrite of the existing branch tests is expected.
  - [ ] `npm run build:types` — this file's own errors from Tasks 1/2/3/4 are now resolved.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1, Task 2, Task 3, Task 5, Task 9.

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** M (1 file, 2 construction helpers + 1 branch function touched — the phase's second-largest task, and the one flagged in the spec as easiest to get backwards)

- [x] **Task 13: `PlanetView.tsx` + `LocaleView.tsx` — collapse to one hour computation**

  **Description:** `PlanetView.tsx`'s per-second tick reads the current locale's own `dayStartTimestamp` (not the planet's), computes the hour via `computeLocaleHour`, and writes that single value to both local component state and `uiStore.activeLocaleLocalTime` — no second `computeLocalTime` pass. `LocaleView.tsx` drops its own `computeLocalTime` call; its prop is renamed `currentHour` → `localTime` (the one identifier rename in this phase beyond deletions, justified in spec §1.1 — the value's meaning genuinely changed) and passes straight through to `OceanScene`. These two files are one vertical slice — `PlanetView` calls `LocaleView` with the renamed prop in the same edit, so they land together, not sequentially.

  **Acceptance criteria:**
  - [ ] `PlanetView.tsx` no longer imports or calls `computePlanetHour`/`computeLocalTime`.
  - [ ] The per-second tick computes `computeLocaleHour` exactly once per tick, and that single value feeds both `LocaleView`'s prop and `uiStore.setActiveLocaleLocalTime`.
  - [ ] `LocaleView`'s prop is named `localTime`, not `currentHour`; the component no longer calls `computeLocalTime`.
  - [ ] `setInterval(tick, 1000)` remains a wall-clock UI display tick, not routed through BeatClock/Transport — confirmed as the correct, pre-existing pattern for this kind of display-only timer (not the musical-timing case CLAUDE.md's guardrail governs).

  **Verification:**
  - [ ] Per spec §5, no automated test file exists today for either component (confirmed by direct inspection — no `PlanetView.test.tsx`/`LocaleView.test.tsx`) — this task does not add one, consistent with the spec's own scope (it names no such file in §2). Verification here is the manual check below, not an automated suite.
  - [ ] `npm run build:types` — this file's own errors from Task 2/3 are now resolved; the project should be **fully clean** for the first time this phase (confirm no error remains anywhere).
  - [ ] `npm run lint` clean.
  - [ ] **Manual check:** load the app fresh and confirm the World Time readout matches `abs(x % 24)` hours, `00` minutes for the default locale's coordinates (`x = 12` → `12:00`).

  **Dependencies:** Task 2, Task 3, Task 10.

  **Files:** `src/components/panels/screen/worldView/PlanetView.tsx`, `src/components/panels/screen/worldView/LocaleView.tsx`

  **Estimated scope:** S (2 tightly-coupled files, no test files to update)

### Checkpoint: Orchestration + view wiring complete

- [x] `npx vitest run src/systems/worldTransition.test.ts` passing (27 tests).
- [x] `npm run build:types` — fully clean project-wide (confirmed zero errors, including the 4 pre-existing inline `Locale` fixtures in `factoryPlacementSystem.test.ts` closed out as part of reaching this).
- [x] `npm run lint`, `npm test` — fully clean (repo-wide lint clean; 100/100 test files, 1397/1397 tests passing).
- [ ] **Manual check (per spec §5)** — not yet done, requires a human (or a launched dev server) to visually confirm: retransmit a new Attenuation Style (planet-name field only) and confirm the World Time display does **not** jump, while the factory skyline visibly recolors (same buildings, same layout, different hue); retransmit new coordinates only and confirm the World Time display *does* jump to the new coordinate's `abs(x % 24)` hour while factory colors on the new locale reflect the *unchanged* AS.
- [ ] Review with human before proceeding — this is the phase's actual engineering core (both mechanisms now converge and are observable together for the first time); worth a close look, mirroring SECTOR_SETTINGS.md's own gate before its UI layer.

---

### Phase 4: Docs

- [x] **Task 14: `docs/BUILDING_DESIGN.md` — AS-seed follow-up note**

  **Description:** Add a follow-up note to the "seeded by the actor ID and horizontal position" line (Overview) and the "Deterministic Randomness" bullet: factory color also depends on the active AS's own seed now, not only the locale's — per roadmap §10.1's own Docs callout.

  **Acceptance criteria:**
  - [x] Both named locations gain a short, accurate note about the AS-seeded color component — no rewrite of the surrounding prose.
  - [x] The note doesn't overstate scope — explicitly notes placement/count/variant/greebles remain locale-only, only color gained the second input.

  **Verification:**
  - [x] Manual review — spot-checked the note's claims directly against `factoryPlacementSystem.ts` (`deriveAsColorShift`/`recolorFactoriesForAttenuationStyle` both confirmed present and matching the note's description).

  **Dependencies:** Task 5.

  **Files:** `docs/BUILDING_DESIGN.md`

  **Estimated scope:** XS (docs only, 2 short additions)

### Checkpoint: Complete

- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (1397/1397 tests; build's chunk-size warning is pre-existing, unrelated to this feature).
- [ ] All acceptance criteria across all 14 tasks met, including both manual checks (Phase 3's checkpoint) confirmed by a human — **the Phase 3 manual visual check itself is still outstanding**, requires a human or a launched dev server.
- [x] `docs/BUILDING_DESIGN.md` reflects the shipped mechanism, spot-checked against source.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Tasks 1–4 leave the project in a deliberately broken `build:types` state until Phase 2/3 land | Low — expected, not a defect | Called out explicitly in every affected task's verification steps, with the specific expected-error file set named each time; matches SECTOR_SETTINGS.md's own precedent for a breaking foundation change |
| Task 5 (`factoryPlacementSystem.ts`) is the single highest-complexity task, and the codebase's only genuinely new coupling (`factoryPlacementSystem.ts` gaining a `usePlanetStore` dependency it never had) | Medium | Given its own explicit human-review gate at the end of Phase 1, before anything is built on top of it — mirrors how SECTOR_SETTINGS.md's plan gated its own riskiest task |
| Task 12's retransmit-branch time inversion is the single easiest thing in this phase to get backwards (spec's own explicit warning) | Medium | Task 12's acceptance criteria assert the preserved locale's `dayStartTimestamp` is byte-identical, not just "close enough" — a naive port that recalculates it would fail this assertion immediately, not silently |
| `PlanetView.tsx`/`LocaleView.tsx` (Task 13) have no automated test coverage today, and this phase doesn't add any | Low–Medium | Flagged explicitly in Task 13 rather than silently skipped; the Phase 3 checkpoint's manual check is the compensating verification, matching the spec's own §5 treatment (a manual check, not a gap this phase is scoped to close) |
| The AS-seeded color shift ranges (`±30`/`±20`) are a first-pass default with no spec-mandated value | Low | Confirmed via the Phase 3 checkpoint's manual check; adjustable in Task 5 in isolation if a bad roll reads as invisible or overwhelming — no other task depends on the exact numbers |

## Open Questions

None remaining beyond what's already deferred by design: §7 item 1 (`PLANET_NAME_PRESETS`' four replacement names) stays an explicit TBD per the intent doc's own scope boundary — no task in this plan invents them, and a follow-up task can add them later without touching anything built here. §7 item 2 (AS shift magnitude) and §7 item 3 (`Planet.locales` staleness) are both resolved above under Architecture Decisions — the former validated at a checkpoint rather than gated, the latter left untouched as a confirmed pre-existing, unrelated gap.
