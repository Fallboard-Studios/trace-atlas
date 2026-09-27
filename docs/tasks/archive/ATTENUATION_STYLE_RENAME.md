# Implementation Plan: Attenuation Style Internal Rename (Roadmap Phase 10.4)

Source spec: [docs/specs/ATTENUATION_STYLE_RENAME.md](../specs/ATTENUATION_STYLE_RENAME.md). Source
intent: [docs/intent/attenuation-style-rename.md](../intent/attenuation-style-rename.md). No hard
dependency on any unshipped phase — this is a rename over already-shipped Phase 10.1 code.

## Overview

A pure identifier/copy rename across 52 `src/` files and ~8 live-reference `docs/` files, reversing
10.1's own "no internal renames" constraint. No behavior changes anywhere — the existing test suite
is the safety net, expected to pass with renamed-but-otherwise-identical assertions throughout.
Dependency order follows the natural import graph: types → seed/noise utils → stores → systems →
components, with comment-only files free to land any time since they carry no compile dependency.

## Architecture Decisions

Resolving spec §7's open items before any task is written:

- **§7 item 1 (`sectorSettings.planetName` schema id string) — no task renames it.** Recommended
  default from the spec: leave it as-is (a UI schema key, not a code identifier with external
  contract weight). A follow-up task can rename it later if it ever proves worth it; not part of
  this plan.
- **§7 item 2 (test-description prose sweep) — folded into each task that already touches that
  file.** No separate task — updating an `it('shows the planet name', ...)` string to match its own
  now-renamed assertion is part of the same diff, not independent work.
- **§7 item 3 (`docs/COMPANIES.md`'s "planet-only retransmit" prose) — included in Task 17's docs
  sweep**, since it's in the same file as other confirmed doc updates.
- **Comment-only files (category 3) are Phase 1 leaves, not gated behind anything.** They carry zero
  compile dependency — confirmed by direct inspection, no renamed symbol is imported or referenced
  by name in any of them, only prose mentions "planet."

## Dependency Graph

```
Task 1  (types/attenuationStyle.ts)  ──┬──────────────┬───────────────────────┐
Task 2  (types/locale.ts)            ──┼───┬──────────┼────┬──────────────────┤
Task 3  (utils/seedUtils.ts)         ──┘   │          │    │                  │
Task 4  (comment-only sweep, 9 files)  (independent — no dependents)          │
                                            ▼          │    │                 │
                                    Task 5 (noiseMaps.ts)   │                 │
                                            │          │    │                 │
                                            ▼          ▼    │                 │
                                    Task 6 (getSeededVal.ts) │                 │
                                            │               │                 │
                                            ▼               │                 │
                              Task 7 (attenuationStyleStore.ts) ───────────────┤
                                            │                                 │
                                            ▼                                 │
                              Task 8 (localeStore.ts) ←── Task 2              │
                                            │                                 │
                              ┌─────────────┼──────────────┐                  │
                              ▼             ▼              ▼                  │
                     Task 9 (audioStore/  Task 10          Task 11            │
                     globalAudioSeed)     (factoryPlacement (worldTransition) │
                                          System.ts)         ↑                │
                                            └────────────────┘                │
                                                          │                   │
                              ┌───────────────┬───────────┼─────────┐         │
                              ▼               ▼           ▼         ▼         │
                     Task 12 (Attenuation  Task 14    Task 15    Task 16 ─────┘
                     StyleView.tsx)        (Transport (SectorSet  (mechanical
                              │            Bar.tsx)   tingsDraw   cascades)
                              ▼                        er.tsx +
                     Task 13 (WorldView.tsx)            sectorSettingsConfig.ts)
                                            │
                                            ▼
                                    Task 17 (docs sweep)
```

Tasks 1–4 share no edges (independent fan-out). Task 5 depends on Task 3 (imports its renamed
exports); Task 6 depends on Task 5 (imports `getGlobalAttenuationStyleSeedOverride` indirectly via
the same seedUtils rename Task 3 already did — Task 6 is really just Task 3's cascade, sequenced
after Task 5 only for commit-grouping clarity, not a real compile dependency). Task 7 depends on
Tasks 1, 3, 5. Task 8 depends on Tasks 2 and 7. Tasks 9, 10, 11 each depend on Task 7 (and Task 10/11
additionally on Task 8, since both read `locale.attenuationStyleId`); Task 11 additionally depends
on Task 10 (calls `recolorFactoriesForAttenuationStyle` with the new param names). Tasks 12–16 depend
on Task 7 at minimum; Task 13 depends on Task 12; Task 15 depends on Task 11 (the `RetransmitInput`
field rename). Task 17 (docs) is sequenced last so it can describe confirmed-shipped identifiers
rather than in-flight ones.

## Task List

### Phase 1: Independent foundations (parallel, 4-way fan-out)

- [x] **Task 1: `src/types/planet.ts` → `src/types/attenuationStyle.ts` (+ `types/index.ts` barrel)**

  **Description:** Rename the file; `Planet` → `AttenuationStyle`; delete `PlanetState` outright
  (confirmed dead — `planetStore.ts` never imports it). Update `types/index.ts`'s
  `export * from './planet.ts'` to point at the renamed file.

  **Acceptance criteria:**
  - [x] `src/types/attenuationStyle.ts` exists; `src/types/planet.ts` does not.
  - [x] `AttenuationStyle` has the same 4 fields `Planet` had (`id`, `name`, `locales`,
    `currentLocaleId?`).
  - [x] `PlanetState` is not exported from anywhere.

  **Verification:**
  - [x] `npm run build:types` — expected errors at every remaining importer of `Planet`/`./planet`
    until later tasks land; confirm no error outside that expected set.
  - [x] `npm run lint` clean for this file.

  **Dependencies:** None. **Files:** `src/types/planet.ts` (renamed), `src/types/index.ts`.
  **Estimated scope:** XS.

- [x] **Task 2: `src/types/locale.ts` — `planetId` → `attenuationStyleId`**

  **Description:** Rename `Locale.planetId` to `Locale.attenuationStyleId` and
  `LocaleState.addLocale`'s first param to match. No type change (still `string`).

  **Acceptance criteria:**
  - [x] `Locale.attenuationStyleId: string` present; `Locale.planetId` gone.
  - [x] `LocaleState.addLocale`'s signature reads `(attenuationStyleId: string, locale: Locale) =>
    void`.

  **Verification:**
  - [x] `npm run build:types` — expected errors at `localeStore.ts`, `worldTransition.ts`,
    `factoryPlacementSystem.ts`, and any inline `Locale` test fixtures until their own tasks land.
  - [x] `npm run lint` clean for this file.

  **Dependencies:** None. **Files:** `src/types/locale.ts`. **Estimated scope:** XS.

- [x] **Task 3: `src/utils/seedUtils.ts` (+ test) — full rename, including the debug global**

  **Description:** `derivePlanetSeed` → `deriveAttenuationStyleSeed`;
  `setGlobalPlanetSeedOverride`/`getGlobalPlanetSeedOverride` →
  `setGlobalAttenuationStyleSeedOverride`/`getGlobalAttenuationStyleSeedOverride`;
  `generateRandomPlanetName`/`resolveDefaultPlanetName` →
  `generateRandomAttenuationStyleName`/`resolveDefaultAttenuationStyleName`; the module-level
  `GLOBAL_PLANET_SEED_OVERRIDE` variable and `window.__GLOBAL_PLANET_SEED__` boot-read →
  `GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE`/`window.__GLOBAL_ATTENUATION_STYLE_SEED__`. The `?seed=`
  URL param name itself is untouched. Per spec §4.

  **Acceptance criteria:**
  - [x] No export or module-level identifier in this file contains "Planet."
  - [x] `window.__GLOBAL_ATTENUATION_STYLE_SEED__` is read at boot; `__GLOBAL_PLANET_SEED__` is not
    referenced anywhere in the file.
  - [x] `?seed=` query-param handling is byte-identical to before.

  **Verification:**
  - [x] `npx vitest run src/utils/seedUtils.test.ts` — all renamed-identifier assertions passing,
    same coverage as before.
  - [x] `npm run build:types` — expected errors at `noiseMaps.ts`, `getSeededVal.ts`,
    `planetStore.ts`, `main.tsx` until their own tasks land.
  - [x] `npm run lint` clean.

  **Dependencies:** None. **Files:** `src/utils/seedUtils.ts`, `src/utils/seedUtils.test.ts`.
  **Estimated scope:** S — small file, but the one externally-breaking change (debug global rename),
  worth its own isolated commit per spec §6.

- [x] **Task 4: Comment-only prose sweep (9 files, zero identifier changes)**

  **Description:** Update "planet" → "Attenuation Style"/"AS" in prose comments only, per spec §1.1
  category 3 — no code/logic changes, no renamed identifiers referenced. Files:
  `src/components/robot/RobotBody.tsx`, `src/components/panels/screen/worldView/LocaleView.tsx`,
  `src/utils/realWorldGradient.ts`, `src/data/globalAudioLoadingRanges.ts`,
  `src/data/globalAudioSeedRanges.ts`, `src/engine/AudioEngine.ts`, `src/engine/lfoDrift.ts`,
  `src/engine/harmonySystem.ts`, `src/systems/spawnSystem.ts`. `RobotBody.tsx`/`LocaleView.tsx`
  additionally update their "written by PlanetView" / "see PlanetView.tsx" comments once Task 12
  lands the component rename — if this task runs before Task 12, leave those two specific mentions
  for a follow-up touch-up rather than referencing a file that doesn't exist yet under its new name.

  **Acceptance criteria:**
  - [x] Each file's prose no longer says "planet" where the Attenuation Style concept is meant.
  - [x] Zero logic/JSX diff in any of the 9 files — `git diff` touches only comment lines.

  **Verification:**
  - [x] Manual review — diff-only-comments check per file.
  - [x] `npx vitest run src/engine/AudioEngine.test.ts src/engine/harmonySystem.test.ts` unaffected
    (no assertion references comment text).

  **Dependencies:** None (soft-follows Task 12 for the two `PlanetView`-by-name mentions, not a
  compile dependency). **Files:** the 9 listed above. **Estimated scope:** S (9 files, comments only).

### Checkpoint: Foundations complete

- [x] `npx vitest run src/utils/seedUtils.test.ts` passing.
- [x] `npm run build:types` — confirm remaining errors are isolated to the expected-pending set
  named in Tasks 1–3's own verification steps, nothing else.
- [x] `npm run lint` clean for every file touched so far.
- [ ] Review with human before proceeding to the store rename.

---

### Phase 2: Seed/noise utils + stores (mostly sequential — each depends on the last)

- [x] **Task 5: `src/utils/noiseMaps.ts` (+ test) — full rename**

  **Description:** `getPlanetNoiseMap`/`evictPlanetNoiseMap` →
  `getAttenuationStyleNoiseMap`/`evictAttenuationStyleNoiseMap`; internal `planetMaps` Map variable
  → `attenuationStyleMaps`; import `deriveAttenuationStyleSeed`/
  `getGlobalAttenuationStyleSeedOverride` from the now-renamed `seedUtils.ts`. Per spec §4.

  **Acceptance criteria:**
  - [x] No export/internal variable in this file contains "Planet."
  - [x] `getLocaleNoiseMap`/`tryGetLocaleNoiseMap`/`evictLocaleNoiseMap` are otherwise byte-identical
    (locale-map logic is untouched by this phase).

  **Verification:**
  - [x] `npx vitest run src/utils/noiseMaps.test.ts` — all passing, same coverage.
  - [x] `npm run build:types` — expected errors at `planetStore.ts`, `factoryPlacementSystem.ts`,
    `globalAudioSeed.ts` until their tasks land.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 3. **Files:** `src/utils/noiseMaps.ts`, `src/utils/noiseMaps.test.ts`.
  **Estimated scope:** S.

- [x] **Task 6: `src/utils/getSeededVal.ts` — import cascade**

  **Description:** `import { getGlobalPlanetSeedOverride } from './seedUtils'` →
  `getGlobalAttenuationStyleSeedOverride`; one call-site update. No logic change.

  **Acceptance criteria:**
  - [x] File compiles against Task 3's renamed export; `getSeededVal`/`precomputeDataX` behavior
    byte-identical.

  **Verification:**
  - [x] `npm run build:types` — this file's own error from Task 3 resolved.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 3, Task 5 (sequenced after for commit-grouping clarity per spec §6; no
  actual compile dependency on Task 5). **Files:** `src/utils/getSeededVal.ts`.
  **Estimated scope:** XS.

- [x] **Task 7: `src/stores/planetStore.ts` → `src/stores/attenuationStyleStore.ts` (+ test) — full
  rename**

  **Description:** The phase's highest identifier-density file. `PlanetStore` →
  `AttenuationStyleStore`; `usePlanetStore` → `useAttenuationStyleStore`; `selectCurrentPlanet` →
  `selectCurrentAttenuationStyle`; `addPlanet`/`removePlanet` →
  `addAttenuationStyle`/`removeAttenuationStyle`; `currentPlanetId`/`setCurrentPlanetId` →
  `currentAttenuationStyleId`/`setCurrentAttenuationStyleId`; `planets` state field →
  `attenuationStyles`; `DEFAULT_PLANET_NAME` → `DEFAULT_ATTENUATION_STYLE_NAME`. `DEFAULT_PELAGOS`
  keeps its own name (type becomes `AttenuationStyle`). Per spec §4's full code sketch — budget the
  most review attention here, mirroring 10.1's own riskiest-task gate.

  **Acceptance criteria:**
  - [x] No export, local variable, or devWarn string in this file contains "Planet" (excluding
    `DEFAULT_PELAGOS`'s own name and its `'pelagos'` literal id).
  - [x] `addAttenuationStyle`'s name-uniqueness rejection and noise-map-priming behavior are
    unchanged from before this task.
  - [x] `removeAttenuationStyle`'s locale-noise-map eviction cascade is unchanged.

  **Verification:**
  - [x] `npx vitest run src/stores/attenuationStyleStore.test.ts` — all passing, same coverage
    (name-uniqueness rejection, noise-map priming, eviction cascade).
  - [x] `npm run build:types` — expected errors at every remaining importer (`localeStore.ts`,
    `worldTransition.ts`, `factoryPlacementSystem.ts`, `audioStore.ts`, every component in Phase 4)
    until their own tasks land.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 1, Task 3, Task 5. **Files:** `src/stores/planetStore.ts` (renamed),
  `src/stores/planetStore.test.ts` (renamed). **Estimated scope:** M — the phase's real complexity
  concentration, same designation 10.1's own spec gave its riskiest file.

- [x] **Task 8: `src/stores/localeStore.ts` (+ test) — `planetId` → `attenuationStyleId`**

  **Description:** `DEFAULT_LOCALE.planetId` → `.attenuationStyleId`; `addLocale`'s param and its
  spread into the stored `Locale` object follow; the `import { DEFAULT_LOCALE_ID } from
  './planetStore'` import path follows Task 7's file rename.

  **Acceptance criteria:**
  - [x] `DEFAULT_LOCALE.attenuationStyleId === 'pelagos'` (value unchanged, key renamed).
  - [x] `addLocale(attenuationStyleId, locale)` — param renamed, behavior unchanged.

  **Verification:**
  - [x] `npx vitest run src/stores/localeStore.test.ts` — fixture assertions updated to the new key
    name, same values, all passing.
  - [x] `npm run build:types` — this file's own errors from Tasks 2/7 resolved.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 2, Task 7. **Files:** `src/stores/localeStore.ts`,
  `src/stores/localeStore.test.ts`. **Estimated scope:** XS.

### Checkpoint: Stores complete

- [x] `npx vitest run src/utils/noiseMaps.test.ts src/stores/attenuationStyleStore.test.ts src/stores/localeStore.test.ts` — all passing.
- [x] `npm run build:types` — confirm remaining errors are isolated to Phase 3/4's own known-pending
  files, nothing else.
- [x] `npm run lint` clean (repo-wide).
- [ ] Review with human before proceeding to `worldTransition.ts`.

---

### Phase 3: Systems (audio seed, factory placement, orchestration core)

- [x] **Task 9: `src/stores/audioStore.ts` (+ test) and `src/utils/globalAudioSeed.ts` (+ test) —
  planet-sync rename**

  **Description:** `generateGlobalAudioSettings`/`generateGlobalLfoSettings`'s own `(planetId,
  planetName)` params → `(attenuationStyleId, attenuationStyleName)`; `getPlanetNoiseMap` call sites
  → `getAttenuationStyleNoiseMap`. In `audioStore.ts`: `regenerateGlobalAudioFromSeed`/
  `regenerateGlobalLfoFromSeed`'s own params rename to match;
  `syncGlobalAudioToCurrentPlanet` → `syncGlobalAudioToCurrentAttenuationStyle`; the
  `usePlanetStore.subscribe`/`selectCurrentPlanet` import and call → `useAttenuationStyleStore`/
  `selectCurrentAttenuationStyle`; the `state.currentPlanetId !== prevState.currentPlanetId` guard →
  `currentAttenuationStyleId`. Per spec §4.

  **Acceptance criteria:**
  - [x] Neither file exports or references an identifier containing "Planet."
  - [x] The subscription still fires exactly once per Attenuation Style switch, and exactly once at
    module load (unchanged trigger semantics).
  - [x] `generateGlobalAudioSettings`/`generateGlobalLfoSettings`'s sampled output values are
    byte-identical for the same `(id, name)` pair as before this task (pure rename, no seed-derivation
    change).

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts src/stores/audioStore.test.ts` — all
    passing, same coverage, same numeric outputs where tests assert determinism.
  - [x] `npm run build:types` — this file's own errors from Task 7 resolved.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 7. **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`,
  `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`. **Estimated scope:** S.

- [x] **Task 10: `src/systems/factoryPlacementSystem.ts` (+ test) — param + call-site rename**

  **Description:** `recolorFactoriesForAttenuationStyle`'s own `(localeId, planetId, planetName)`
  params → `(localeId, attenuationStyleId, attenuationStyleName)`; `placeFactories`'s internal
  `usePlanetStore.getState().planets.find(...)` → `useAttenuationStyleStore.getState()
  .attenuationStyles.find(...)`, reading `locale.attenuationStyleId` (Task 2/8's renamed field);
  `getPlanetNoiseMap` call → `getAttenuationStyleNoiseMap`. `deriveAsColorShift`, the AS shift range
  constants, and all placement/scale/spacing logic are untouched — this is a signature-level diff
  only, per spec §4.

  **Acceptance criteria:**
  - [x] `recolorFactoriesForAttenuationStyle`'s exported signature uses the new param names; its
    behavior (only `hueShift`/`satShift` change, everything else round-trips) is unchanged.
  - [x] `placeFactories`'s exported signature is still exactly `(localeId: string): Actor[]` —
    unchanged, per 10.1's own original constraint, still true here.
  - [x] `placeFactories` still falls back to a zero `asShift` (not a crash) when the locale's
    `attenuationStyleId` doesn't resolve to any entry in the store.

  **Verification:**
  - [x] `npx vitest run src/systems/factoryPlacementSystem.test.ts` — all 6 of 10.1's original
    coverage points (§5 of `ATTENUATION_STYLE.md`) still passing under the renamed fixtures/params.
  - [x] `npm run build:types` — this file's own errors from Tasks 2/5/7/8 resolved.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 2, Task 5, Task 7, Task 8. **Files:**
  `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`.
  **Estimated scope:** S.

- [x] **Task 11: `src/systems/worldTransition.ts` (+ test) — full rename, the phase's largest file**

  **Description:** `RetransmitInput.planetName` → `.attenuationStyleName`; `buildPlanet` →
  `buildAttenuationStyle`; `createNewPlanet` → `createNewAttenuationStyle`;
  `finalizePlanetTransition` → `finalizeAttenuationStyleTransition`; `retransmitPlanetOnly` →
  `retransmitAttenuationStyleOnly`; the `'planetOnly'` mode tag → `'attenuationStyleOnly'`;
  `oldPlanet`/`newPlanet` locals throughout → `oldAttenuationStyle`/`newAttenuationStyle`;
  `buildLocale`'s constructed object uses `attenuationStyleId` (Task 2's field); every
  `usePlanetStore`/`selectCurrentPlanet` call → `useAttenuationStyleStore`/
  `selectCurrentAttenuationStyle`. `recolorFactoriesForAttenuationStyle` call site passes the
  renamed-but-positionally-identical args. Per spec §4's full code sketch — the phase's second-most
  scrutiny-worthy task after Task 7.

  **Acceptance criteria:**
  - [x] No exported or internal identifier in this file contains "Planet" (aside from doc-comment
    references to `docs/specs/ATTENUATION_STYLE.md`'s own historical section numbers, which stay).
  - [x] `retransmitWorld({})` (neither field set) remains a true no-op — unchanged guarantee.
  - [x] `retransmitAttenuationStyleOnly` still leaves the preserved locale's `dayStartTimestamp`
    byte-identical before/after (10.1's own inversion guarantee, untouched by this rename).
  - [x] `retransmitAttenuationStyleOnly` still calls `recolorFactoriesForAttenuationStyle` exactly
    once, with the preserved locale's id and the new Attenuation Style's id/name.

  **Verification:**
  - [x] `npx vitest run src/systems/worldTransition.test.ts` — every one of 10.1's own branch tests
    (SECTOR_SETTINGS.md's original suite, plus 10.1's own additions) passing under renamed
    identifiers/fixture keys, with zero new assertions.
  - [x] `npm run build:types` — this file's own errors from Tasks 1/2/7/8/10 resolved.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 1, Task 2, Task 7, Task 8, Task 10. **Files:**
  `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`. **Estimated scope:** M —
  same designation 10.1's own spec gave this file, for the same reason (most branches, easiest to
  get subtly wrong).

### Checkpoint: Systems complete

- [x] `npx vitest run src/utils/globalAudioSeed.test.ts src/stores/audioStore.test.ts src/systems/factoryPlacementSystem.test.ts src/systems/worldTransition.test.ts` — all passing.
- [x] `npm run build:types` — confirm remaining errors are isolated to Phase 4's own known-pending
  component files, nothing else.
- [x] `npm run lint` clean (repo-wide).
- [ ] Review with human before proceeding to the component layer — this phase's actual engineering
  core (store + orchestration renames converge here), mirroring 10.1's own gate before its UI layer.

---

### Phase 4: Components + mechanical cascades (parallel siblings once Phase 3 lands)

- [x] **Task 12: `PlanetView.tsx` → `AttenuationStyleView.tsx` (+ `.css`) — full rename**

  **Description:** Rename both files; `PlanetViewProps.planetId` → `AttenuationStyleViewProps
  .attenuationStyleId`; `usePlanetStore` → `useAttenuationStyleStore`; `.planet-view` CSS class →
  `.attenuation-style-view`. `computeLocaleHour`/`dayStartTimestamp` logic (10.1's own mechanism) is
  completely untouched — this task only renames the AS-facing surface. Per spec §4.

  **Acceptance criteria:**
  - [x] `src/components/panels/screen/worldView/AttenuationStyleView.tsx`+`.css` exist; `PlanetView
    .tsx`+`.css` do not.
  - [x] The per-second tick/`computeLocaleHour`/`uiStore.setActiveLocaleLocalTime` behavior is
    byte-identical to before this task.

  **Verification:**
  - [x] `npm run build:types` — this file's own errors from Task 7 resolved; new errors expected at
    `WorldView.tsx` (Task 13) until it lands.
  - [x] `npm run lint` clean.
  - [x] No automated test exists for this component today (confirmed by 10.1's own spec) — this
    task doesn't add one; the Phase 4 checkpoint's manual check covers it.

  **Dependencies:** Task 7. **Files:**
  `src/components/panels/screen/worldView/PlanetView.tsx`(renamed)+`.css`(renamed).
  **Estimated scope:** S.

- [x] **Task 13: `WorldView.tsx` (+ test) — import + prop rename**

  **Description:** `import PlanetView from '.../PlanetView'` →
  `import AttenuationStyleView from '.../AttenuationStyleView'`; `usePlanetStore` →
  `useAttenuationStyleStore`; `currentPlanetId` local → `currentAttenuationStyleId`; JSX
  `<PlanetView planetId={...} />` → `<AttenuationStyleView attenuationStyleId={...} />`.

  **Acceptance criteria:**
  - [x] Renders `AttenuationStyleView`, not `PlanetView`; prop name matches Task 12's renamed prop.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/worldView/WorldView.test.tsx` — import path
    updated, all passing.
  - [x] `npm run build:types` clean for this file.
  - [x] `npm run lint` clean.

  **Dependencies:** Task 12. **Files:**
  `src/components/panels/screen/worldView/WorldView.tsx`,
  `src/components/panels/screen/worldView/WorldView.test.tsx`. **Estimated scope:** XS.

- [x] **Task 14: `TransportBar.tsx` (+ `.css` + test) — import + local var + CSS class rename**

  **Description:** `usePlanetStore`/`selectCurrentPlanet` → `useAttenuationStyleStore`/
  `selectCurrentAttenuationStyle`; `planetName` local → `attenuationStyleName`;
  `.transport-bar__planet` → `.transport-bar__attenuation-style`. The rendered
  `<VisuallyHidden>Attenuation Style: </VisuallyHidden>` copy is already correct from 10.1 —
  untouched here.

  **Acceptance criteria:**
  - [x] CSS class rename applied consistently in both `.tsx` and `.css`.
  - [x] Rendered output (label text, displayed name) is pixel-identical to before this task.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/TransportBar.test.tsx` — selector updated to
    `.transport-bar__attenuation-style`, all passing.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7. **Files:** `src/components/panels/screen/TransportBar.tsx`,
  `TransportBar.css`, `TransportBar.test.tsx`. **Estimated scope:** XS.

- [x] **Task 15: `SectorSettingsDrawer.tsx` (+ test) and `data/sectorSettingsConfig.ts` (+ test) —
  config constant + import rename**

  **Description:** `PLANET_NAME_SCHEMA`/`PLANET_NAME_PRESETS` → `ATTENUATION_STYLE_SCHEMA`/
  `ATTENUATION_STYLE_PRESETS` (string *values* inside — including the schema's `id:
  'sectorSettings.planetName'` — unchanged per spec §7 item 1); `usePlanetStore`/
  `selectCurrentPlanet` import cascade; any `retransmitWorld({ planetName: ... })` call site →
  `{ attenuationStyleName: ... }` (following Task 11's `RetransmitInput` rename).

  **Acceptance criteria:**
  - [x] `ATTENUATION_STYLE_PRESETS` still has exactly 4 entries, values unchanged
    (Kryndara/Vessport Null/Halcyon Drift/The Rusting).
  - [x] Every `retransmitWorld` call site in this component passes `attenuationStyleName`, not
    `planetName`.

  **Verification:**
  - [x] `npx vitest run src/data/sectorSettingsConfig.test.ts src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` — import names updated, `retransmitWorldMock` assertions updated to the new key, all passing.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 7, Task 11. **Files:** `src/data/sectorSettingsConfig.ts`(+test),
  `src/components/panels/screen/console/SectorSettingsDrawer.tsx`(+test). **Estimated scope:** S.

- [x] **Task 16: Mechanical import/call-site cascades (7 files, batched)**

  **Description:** `App.tsx`, `Factory.tsx`, `Robot.tsx`, `OceanScene.tsx`(+test),
  `localeHelpers.ts`(+test), `main.tsx` — each swaps `usePlanetStore`/`selectCurrentPlanet` (or
  `setGlobalPlanetSeedOverride` for `main.tsx`) for its renamed equivalent, one import + one call
  site each, per spec §4's diff pattern. Zero logic change in any of the 7.

  **Acceptance criteria:**
  - [x] All 7 files compile against Task 7/3's renamed exports.
  - [x] `git diff` for each file touches only the import line and the identifier at its call site(s).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/worldView/OceanScene.test.tsx src/utils/localeHelpers.test.ts` — passing.
  - [x] `npm run build:types` — should be **fully clean project-wide** after this task, the first
    point in the plan where that's true (confirm zero errors anywhere).
  - [x] `npm run lint` clean (repo-wide).

  **Dependencies:** Task 3, Task 7. **Files:** `src/App.tsx`, `src/components/actors/Factory.tsx`,
  `src/components/robot/Robot.tsx`,
  `src/components/panels/screen/worldView/OceanScene.tsx`(+test),
  `src/utils/localeHelpers.ts`(+test), `src/main.tsx`. **Estimated scope:** S (7 files, one-line
  diffs each).

### Checkpoint: Components + cascades complete

- [x] `npx vitest run` (full suite) — 100% passing, same test count as before this phase (renamed,
  not added/removed).
- [x] `npm run build:types` — fully clean project-wide, confirmed zero errors anywhere.
- [x] `npm run lint` clean (repo-wide).
- [x] `git grep -in planet -- src/` sweep (per spec §5's verification step 5) — confirm every
  remaining hit is either `DEFAULT_PELAGOS`'s own literal `'pelagos'` id, a `dataId` string (none
  exist per spec §1), or prose explicitly narrating the historical rename.
- [ ] **Manual check:** `npm run dev`, confirm `?seed=` still reproduces a session deterministically;
  confirm `window.__GLOBAL_ATTENUATION_STYLE_SEED__` (not the old name) is what a boot override
  would set; retransmit a new Attenuation Style and confirm behavior is pixel/audio-identical to
  before this phase (same recolor, same World Time behavior, same Global Audio Rig reseed). Not run
  this session — no browser/dev-server environment exercised; needs a human with the app open.
- [ ] Review with human before proceeding to docs.

---

### Phase 5: Docs

- [x] **Task 17: Live reference doc sweep**

  **Description:** Update identifier references (not just "planet seed" prose, already done this
  session for the not-yet-shipped Phase 11/12 docs) in: `docs/PROCEDURAL_GENERATION.md`
  (`derivePlanetSeed`/`getPlanetNoiseMap`/`evictPlanetNoiseMap` code samples and prose),
  `docs/AUDIO_SYSTEM.md` (§ Seeding's `generateGlobalAudioSettings(planetId, planetName)`/
  `generateGlobalLfoSettings(planetId, planetName)` signatures, "planet-sync," "planet load/change,"
  "a fresh planet" — the phase's densest doc edit), `docs/CONTRIBUTION_GUIDE.md` (line 37's
  `planetStore` description), `docs/BUILDING_DESIGN.md` and `docs/COMPANIES.md` (sweep for any
  residual identifier mention — both already say "Attenuation Style" in prose per 10.1's own Task 14
  and this session's earlier pass; confirm no stale identifier slipped through, including
  `COMPANIES.md`'s "planet-only retransmit" phrasing per spec §7 item 3), `docs/UI_SHELL.md` and
  `docs/HARMONY_SYSTEM.md` (confirm already-AS-aware from this session's earlier pass; sweep for any
  remaining identifier), `CLAUDE.md` (sweep Key Terms/guardrail prose).

  **Acceptance criteria:**
  - [x] `git grep -in planet -- docs/*.md` (root-level live reference docs only, not
    `docs/specs`/`docs/tasks`/`docs/intent`) returns nothing outside `DEFAULT_PELAGOS`-equivalent
    proper-noun mentions.
  - [x] Every code sample in these docs uses the renamed identifiers exactly as shipped in Phases
    1–4 — spot-checked against the actual source, not just internally consistent.

  **Verification:**
  - [x] Manual review — spot-check each doc's claims directly against the shipped source, same
    verification style 10.1's own Task 14 used.

  **Dependencies:** Tasks 1–16 (describes what actually shipped). **Files:**
  `docs/PROCEDURAL_GENERATION.md`, `docs/AUDIO_SYSTEM.md`, `docs/CONTRIBUTION_GUIDE.md`,
  `docs/BUILDING_DESIGN.md`, `docs/COMPANIES.md`, `docs/UI_SHELL.md`, `docs/HARMONY_SYSTEM.md`,
  `CLAUDE.md`. **Estimated scope:** M (8 files, prose + code-sample edits, no code changes).

### Checkpoint: Complete

- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 17 tasks met.
- [ ] Manual check from Phase 4's checkpoint reconfirmed after docs land (no code changed since,
  but worth a final sanity pass before calling this phase done) — still outstanding, same reason.
- [ ] Ready for human review / PR.

## Deviations From the Plan as Written

Implemented sequentially per the phase/task structure above, with three real deviations discovered
mid-implementation — each the same shape of underestimate 10.1's own plan hit and pulled forward for
the same reason (a renamed export used by a file the plan hadn't listed as depending on it):

- **Tasks 5+6 landed as one commit.** `noiseMaps.test.ts` imports `getSeededVal.ts` directly, so
  Task 5 alone couldn't reach green without Task 6 — the plan's own dependency graph called this a
  "commit-grouping convenience, not a real compile dependency," which turned out to be wrong at the
  test-runtime level even though it was right at the `build:types` level.
- **Tasks 7+8 pulled in a slice of Task 16 early.** `localeStore.ts` (Task 8) transitively imports
  `AudioEngine.ts` → `localeHelpers.ts` → the old `planetStore.ts`, so Task 8's own test couldn't run
  at all — not just fail to type-check — without also fixing `localeHelpers.ts`. Landed together,
  plus 5 test files (`AudioEngine.test.ts`, `idleSystem.test.ts`, `interactionSystem.test.ts`,
  `robotSystems.test.ts`, `spawnSystem.test.ts`) whose only reference to the old store was a bare
  `DEFAULT_LOCALE_ID` import path — present in the spec's own §2 file tree, but never assigned to a
  numbered task in this plan. Fixed as a pure import-path correction, zero identifier semantics.
- **A `git grep` sweep after Task 16 turned up 5 more genuine gaps** the per-task diffs missed:
  `TransportBar.tsx`'s `planetHour`/`planetMinute` locals (never about AS identity, just misnamed),
  `AudioEngine.test.ts`'s `planetMod` local + a stale "planet-sync" comment, `spawnSystem.test.ts`'s
  `planet1`/`planet2` locals, `globalAudioSeed.test.ts`'s prose describing Task 9's renamed params by
  their old names, and `types/locale.ts`'s "Moved here from Planet" comment. All fixed before the
  Task 12-16 commit landed — see that commit message for the full list.

No task needed rework once its own file compiled/tested green — every deviation was scope the
original file list under-counted, not a wrong rename that had to be undone.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 7 (`attenuationStyleStore.ts`) is the single highest identifier-density file in the whole rename | Medium | Explicit human-review gate at the end of Phase 2, before anything downstream is built on top of it — mirrors 10.1's own gate for its own riskiest task |
| Task 11 (`worldTransition.ts`) has the most branches and the most historical doc-comment cross-references to get right | Medium | Task 11's acceptance criteria re-assert 10.1's own byte-identical `dayStartTimestamp` and exactly-once-`recolorFactoriesForAttenuationStyle` guarantees, not just "compiles" — a rename that accidentally drops a call would fail these immediately |
| The historical-docs boundary (spec §3) is broader than 10.1's own spec anticipated (11 files, not 3) | Low | Enumerated explicitly in spec §3 rather than left as a vague "use judgment" rule; Task 17 only touches the confirmed live-reference set |
| A missed call site of any renamed export | Low | `npm run build:types` is the primary safety net at every single task's own verification step — a size-52-file rename is exactly the case TypeScript's compiler is best at catching mechanically |
| Accidentally changing behavior while renaming (e.g. reordering a store update, dropping a param) | Low–Medium | Every task's acceptance criteria explicitly restate the pre-existing behavioral guarantee (not just the new name), and the full existing test suite must pass with zero new assertions — a new assertion needed to pass is treated as a red flag, not a fix (spec §3) |

## Open Questions

None remaining beyond spec §7's own already-resolved items (schema id string left as-is; test-prose
sweep folded into each task; `COMPANIES.md` phrasing included in Task 17) — see Architecture
Decisions above.
