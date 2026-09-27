# Implementation Plan: Sector Settings (Roadmap Phase 5)

Source spec: [docs/specs/SECTOR_SETTINGS.md](../specs/SECTOR_SETTINGS.md). Source intent: [docs/intent/sector-settings.md](../intent/sector-settings.md). Depends on [Locale Seed Decoupling](LOCALE_SEED_DECOUPLING.md) having already shipped (it has).

## Overview

Replace `ConsolePanel.tsx`'s `settings` stub with a live console panel that lets an operator reseed the planet and/or jump to new plot coordinates via one shared Retransmit action. The real engineering weight is a new `src/systems/worldTransition.ts` orchestration module and four small, independently-fixable gaps it depends on (a hardcoded-locale bug in `placeFactories`, `OceanScene`'s mount-only spawn effect, `removeLocale`'s missing `AudioEngine` cleanup, and the spawn-scheduler singleton ordering) — none of which were true before this phase touches them. Four fully independent leaf fixes land first, `worldTransition.ts` converges on them, then the drawer and its `ConsolePanel` wiring land last.

## Architecture Decisions

Resolving spec §7's five open questions before any task is written:

- **§7.1 (renumbered from the spec's "still open" #1) — `initializeLocale`'s "only if empty" guard is sufficient, confirmed as a standing invariant.** Every `Locale` this phase creates comes from `buildLocale()`, which always constructs `robots: []`/`actors: []` — the guard's precondition holds for every call site this spec adds. Documented directly in `initializeLocale`'s own doc comment (already present in the spec's code sketch) as a contract future callers must honor: pass a locale that's actually empty if you want its setup to run.
- **§7.2 — `removeLocale`'s cleanup extension is accepted as-is, no gating needed.** Grepped directly (spec §7, finding carried from Locale Seed Decoupling's own discovery): `removeLocale` has zero production call sites today. Extending it to release robots' `AudioEngine` state can't regress any existing caller because none exists — this is purely additive risk-wise.
- **§7.3 — Retransmit button stays always-clickable; the no-op is the mechanism, not a disabled state.** No correctness stakes either way (`retransmitWorld({})` is a safe no-op), and a disabled-state calculation is one more piece of derived UI state to keep in sync with two text inputs for zero functional benefit. If this reads as confusing in practice, it's a fast-follow, not a blocker.
- **§7.4 — `buildPlanet`'s hardcoded `size: 'medium'` is accepted for this phase.** Sector Settings' confirmed scope (intent doc) has no planet-size field; adding one would be new scope not asked for. Matches `DEFAULT_PELAGOS`'s own default.
- **§7.5 — `Planet.locales` never being appended to after creation is a pre-existing gap, still not fixed at the source — but the one place it was ever load-bearing is now closed.** Post-review finding: `removePlanet`'s eviction cascade *does* evict the preserved locale's noise map in the planet-only branch (it's still listed under the old planet's `locales`), and `AudioEngine.computeNoteVelocitySeeded()`'s non-throwing `tryGetLocaleNoiseMap` lookup would see a real gap (falling back to `Math.random()`) until the next scheduled spawn tick rebuilt it — not "harmless," just narrow and self-correcting. Fixed by re-warming the noise map explicitly, immediately after `removePlanet`, in `retransmitPlanetOnly` — asserted directly by `worldTransition.test.ts`. `Planet.locales` itself remains unfixed (nothing else reads it) — flagged so a future feature doesn't trust it as accurate.
- **Independent leaf fixes land before `worldTransition.ts`, which lands before the drawer** — the same foundation-before-wiring-before-UI ordering the prior two plans used. `sectorSettingsConfig.ts`, `factoryPlacementSystem.ts`'s parameterization, `localeStore.ts`'s `removeLocale` extension, and `CoordsInput.tsx`'s integer enforcement share no dependencies on each other — buildable and testable in any order or in parallel. `worldTransition.ts` needs the `placeFactories`/`removeLocale` fixes to exist first (it calls both). `OceanScene.tsx`'s refactor and `SectorSettingsDrawer.tsx` both depend only on `worldTransition.ts` (specifically `initializeLocale` for the former, `retransmitWorld` for the latter) — not on each other, so they're parallel siblings, not sequential.

## Dependency Graph

```
Task 1 (sectorSettingsConfig.ts)            ─────────────────────────────────────┐
Task 2 (factoryPlacementSystem.ts)          ─┐                                    │
Task 3 (localeStore.ts removeLocale)        ─┼──→ Task 5 (worldTransition.ts) ──┬─┤
Task 4 (CoordsInput.tsx)                    ─────────────────────────────────────┼─┼──→ Task 7 (SectorSettingsDrawer.tsx)
                                                                                   │ │            │
                                                                                   │ └────────────→│
                                            Task 6 (OceanScene.tsx) ←──────────────┘               │
                                                                                                     ▼
                                                                                          Task 8 (ConsolePanel.tsx)
                                                                                                     │
                                                                                                     ▼
                                                                                          Task 9 (UI_SHELL.md)
```

Tasks 1–4 have no edges between them. Tasks 6 and 7 both depend only on Task 5 — not on each other — so they're parallelizable siblings once Task 5 lands.

## Task List

### Phase 1: Independent foundations (parallel)

- [ ] **Task 1: `src/data/sectorSettingsConfig.ts` — schemas and presets**

  **Description:** Define `PLANET_NAME_SCHEMA`/`COORDS_SCHEMA`/`RETRANSMIT_SCHEMA`/`STATUS_HEADER_SCHEMA` and the `PLANET_NAME_PRESETS`/`COORDINATE_PRESETS` arrays, exactly per spec §4's code sketch (4 entries each, including the `{ x: 0, y: 0 }` "Null Basin" preset).

  **Acceptance criteria:**
  - [ ] All 4 schemas present with `loreLabel`/`humanLabel` populated (no bare `id`-only schema).
  - [ ] `PLANET_NAME_PRESETS` and `COORDINATE_PRESETS` each have exactly the 4 entries from spec §4, including `{ label: 'Null Basin', value: { x: 0, y: 0 } }`.
  - [ ] `SectorPreset<T>` is exported and generically typed — no duplicated interface for the two preset arrays.

  **Verification:**
  - [ ] `npx vitest run src/data/sectorSettingsConfig.test.ts` passing.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/sectorSettingsConfig.ts`, `src/data/sectorSettingsConfig.test.ts`

  **Estimated scope:** XS (pure data, 1 new file + test)

- [ ] **Task 2: `src/systems/factoryPlacementSystem.ts` — parameterize `placeFactories`**

  **Description:** Change `placeFactories(): Actor[]` to `placeFactories(localeId: string): Actor[]`, replacing the hardcoded `setLocaleData(DEFAULT_LOCALE_ID, { actors })` write with `setLocaleData(localeId, { actors })`. This is a standalone bug fix (spec §1, finding #1) — the caller-side update (`OceanScene.tsx`) lands in Task 6, not here, since `OceanScene.tsx` itself is being refactored to call `initializeLocale` there instead of `placeFactories` directly.

  **Acceptance criteria:**
  - [ ] `placeFactories` takes a required `localeId` parameter; no reference to `DEFAULT_LOCALE_ID` remains inside the function body.
  - [ ] Existing internal placement logic (row categorization, collision avoidance, etc.) is otherwise unchanged.

  **Verification:**
  - [ ] `npx vitest run src/systems/factoryPlacementSystem.test.ts` — updated to pass an explicit locale id at every call site, all passing.
  - [ ] `npm run build:types` — **expected to show one error** at `OceanScene.tsx`'s still-unparameterized call site until Task 6 lands; confirm it's the only error introduced by this task.
  - [ ] `npm run lint` clean for the modified files themselves.

  **Dependencies:** None.

  **Files:** `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`

  **Estimated scope:** S (1 file, signature + one internal reference)

- [ ] **Task 3: `src/stores/localeStore.ts` — `removeLocale` releases robot audio state**

  **Description:** Extend `removeLocale` to loop the locale's own `robots` array through `AudioEngine.releaseVoice`/`unregisterRobotMelody`, exactly matching `removeRobot`'s existing `try/catch` + `swallow(err, ...)` pattern, before deleting the locale record — per spec §4's code sketch.

  **Acceptance criteria:**
  - [ ] Every robot in the removed locale gets both `AudioEngine.releaseVoice(robot.id)` and `AudioEngine.unregisterRobotMelody(robot.id)` called, each independently wrapped so one throwing doesn't block the other or the removal itself.
  - [ ] Removing a locale with zero robots is a no-op for this new loop (no errors, no calls).
  - [ ] `evictLocaleNoiseMap`/the actual state deletion still happen exactly as before — this task is additive to `removeLocale`, not a rewrite of it.

  **Verification:**
  - [ ] `npx vitest run src/stores/localeStore.test.ts` — new coverage added (mock `AudioEngine` the same way `removeRobot`'s existing tests already do), all passing.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/localeStore.ts`, `src/stores/localeStore.test.ts`

  **Estimated scope:** S (1 file, one function extended)

- [ ] **Task 4: `src/components/ui/controls/CoordsInput.tsx` — integer enforcement**

  **Description:** `handleX`/`handleY` round any parsed numeric value to the nearest integer (`Math.round`) before calling `onChange`, per spec §4/§3 — coordinates are integers system-wide now that the seed derivation no longer needs float precision (Locale Seed Decoupling).

  **Acceptance criteria:**
  - [ ] Entering a decimal (e.g. `"12.7"`) results in `onChange` receiving the rounded integer (`13`), not the raw decimal.
  - [ ] Entering an already-integer value passes through unchanged.
  - [ ] Existing blank-string/NaN guards are unmodified in behavior.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/CoordsInput.test.tsx` — new rounding assertions added, all existing assertions still pass.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/CoordsInput.tsx`, `src/components/ui/controls/CoordsInput.test.tsx`

  **Estimated scope:** XS (2-line change in 2 functions)

### Checkpoint: Foundations complete
- [ ] `npm test` — Tasks 1/3/4's new/modified suites pass; Task 2's `build:types` error is the only expected failure, isolated to `OceanScene.tsx`.
- [ ] `npm run lint` clean across all four modified/new file pairs.
- [ ] Review with human before proceeding to `worldTransition.ts`.

---

### Phase 2: Orchestration core

- [ ] **Task 5: `src/systems/worldTransition.ts` — `initializeLocale` + `retransmitWorld`**

  **Description:** Implement both exported functions exactly per spec §4's code sketch: `initializeLocale(localeId)` (guarded factory placement + 2 initial robots + scheduler restart, idempotent) and `retransmitWorld(input)` (the 4-branch preservation model — no-op / coords-only-preserves-planet / planet-only-preserves-locale / both-changed-full-reset — per spec §1's Architecture Decisions). Includes the `buildPlanet`/`buildLocale` construction helpers.

  **Acceptance criteria:**
  - [ ] `retransmitWorld({})` (neither field set) makes zero store mutations and zero `AudioEngine`/`selectRobot` calls.
  - [ ] Coordinates-only branch never calls `setCurrentPlanetId` — Audio Rig/global LFO state is provably untouched (assert `audioStore`'s `globalAudio`/`globalLfo` are unchanged after the call).
  - [ ] Planet-only branch preserves the **same** `Locale.id` (not a new one) with the **same** `robots`/`actors` contents, only its `planetId` field updated; `initializeLocale`/`removeLocale` are **not** called for it.
  - [ ] Both-changed branch produces a new planet and new locale; the old locale's robots get `AudioEngine.releaseVoice`/`unregisterRobotMelody` (via `removeLocale`'s Task 3 extension) before discard.
  - [ ] Every branch that calls `initializeLocale` calls `stopSpawnScheduler` before `startSpawnScheduler` (module-singleton ordering, spec §1 finding #4).
  - [ ] `initializeLocale` on an already-populated locale (non-zero `robots`/`actors`) makes zero `placeFactories`/`spawnRobot` calls but still restarts the scheduler.
  - [ ] Any branch that actually runs clears `uiStore.selectedRobotId`; `activeHubTile` is never touched by any branch.

  **Verification:**
  - [ ] `npx vitest run src/systems/worldTransition.test.ts` — all 8 coverage points from spec §5 passing (one block per branch, plus the scheduler-ordering and idempotence assertions).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2 (`placeFactories(localeId)` must exist), Task 3 (`removeLocale`'s cleanup extension must exist).

  **Files:** `src/systems/worldTransition.ts`, `src/systems/worldTransition.test.ts`

  **Estimated scope:** M (1 new file with 4 functions, but the branching logic is the phase's real complexity — budget accordingly)

### Checkpoint: Orchestration core complete
- [ ] `npx vitest run src/systems/worldTransition.test.ts src/systems/factoryPlacementSystem.test.ts src/stores/localeStore.test.ts` all passing.
- [ ] `npm run build:types` — still shows the one expected `OceanScene.tsx` error from Task 2, nothing new.
- [ ] Review with human before proceeding — this is the phase's actual engineering core; worth a close look before building UI on top of it.

---

### Phase 3: Consumer wiring (parallel siblings once Task 5 lands)

- [ ] **Task 6: `src/components/panels/screen/worldView/OceanScene.tsx` — call `initializeLocale`**

  **Description:** Replace the mount effect's inline `placeFactories()` (no-arg) / 2×`spawnRobot` / `startSpawnScheduler` sequence with a single `initializeLocale(localeId)` call. This resolves the "locale only changes via user menu" gap the effect's own comment already anticipated (spec §1, finding #2) — the effect itself stays mount-only (it's still correct that *this component* only needs to run its setup once per mount), but the setup logic it delegates to is no longer duplicated.

  **Acceptance criteria:**
  - [ ] The effect body calls `initializeLocale(localeId)` instead of inlining `placeFactories`/`spawnRobot`×2/`startSpawnScheduler`.
  - [ ] Observable behavior is unchanged for the existing mount-only path: factories placed once, exactly 2 robots spawned, scheduler started — this is a refactor, not a behavior change.
  - [ ] The effect's cleanup (`stopSpawnScheduler`) and its `[]` dependency array / eslint-disable comment are untouched — only the body's setup calls change.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/OceanScene.test.tsx` — updated to assert against `initializeLocale`'s effects rather than the three inline calls directly; all passing.
  - [ ] `npm run build:types` — the Task 2-introduced error at this file is now resolved.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/worldView/OceanScene.tsx`, `src/components/panels/screen/worldView/OceanScene.test.tsx`

  **Estimated scope:** S (1 file, effect body simplified to one call)

- [ ] **Task 7: `SectorSettingsDrawer.tsx` — the console panel itself**

  **Description:** Build the drawer: a status header (current planet name + locale coordinates) above a Planet Calibration section (`TextInput` pre-populated with the current planet name, promoted/random preset buttons) and a Plot Tuning section (`CoordsInput` pre-populated with current coordinates, its own promoted/random preset buttons), with one shared Retransmit `Button` at the bottom calling `retransmitWorld` with only the field(s) the user actually edited.

  **Acceptance criteria:**
  - [ ] Both input fields show the *current* planet name / coordinates on mount, not blank values.
  - [ ] Clicking any promoted or random preset button populates only its own field(s) — **zero calls to `retransmitWorld`** (spec §5 — presets are pure field-fillers, never an implicit submit).
  - [ ] Clicking Retransmit calls `retransmitWorld` with exactly the field(s) that differ from the pre-populated values — omitting a field the user didn't touch, not passing its unchanged value.
  - [ ] Every visible label traces to `sectorSettingsConfig.ts` — zero hardcoded display strings in the component itself.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` — all assertions from spec §5 passing.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 5.

  **Files:** `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `SectorSettingsDrawer.css`, `SectorSettingsDrawer.test.tsx`

  **Estimated scope:** M (1 new component, 2 sub-sections, but built entirely on existing Phase 1 primitives)

### Checkpoint: Consumer wiring complete
- [ ] `npx vitest run src/components/panels/screen/worldView/OceanScene.test.tsx src/components/panels/screen/console/SectorSettingsDrawer.test.tsx` passing.
- [ ] `npm run build:types` — fully clean project-wide for the first time this phase.
- [ ] Manual check (per spec §5): retransmit a new planet name in the dev server and confirm the World View visibly changes while Audio Rig values also change; retransmit coordinates only and confirm Audio Rig state is untouched.
- [ ] Review with human before final integration.

---

### Phase 4: Integration and docs

- [ ] **Task 8: `ConsolePanel.tsx` — wire the `settings` tile**

  **Description:** Replace `TILE_CONTENT.settings`'s placeholder `<div className="console-panel__stub">Settings</div>` with `<SectorSettingsDrawer />`, following `AudioRigDrawer`'s exact Phase 4 precedent in the same file.

  **Acceptance criteria:**
  - [ ] `TILE_CONTENT.settings` renders `SectorSettingsDrawer`, no stub `<div>` remains.
  - [ ] No other `TILE_CONTENT` entry (`robots`, `audioRig`) is touched.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/ConsolePanel.test.tsx` — the settings-stub assertion replaced with one confirming `SectorSettingsDrawer` renders; all passing.
  - [ ] `npm run build:types`, `npm run lint`, `npm run build` all clean.

  **Dependencies:** Task 7.

  **Files:** `src/components/panels/screen/console/ConsolePanel.tsx`, `src/components/panels/screen/console/ConsolePanel.test.tsx`

  **Estimated scope:** XS (1-line render change + 1 test update)

- [ ] **Task 9: `docs/UI_SHELL.md` — mark `settings` shipped**

  **Description:** Update `settings`'s status from "Stub only" to shipped, matching how `audioRig`'s entry was updated when Phase 4 landed.

  **Acceptance criteria:**
  - [ ] `settings` no longer appears under "Stub only" / "Still planned."
  - [ ] The updated line names `SectorSettingsDrawer` the way the existing `audioRig` line names `AudioRigDrawer`.
  - [ ] No other part of `UI_SHELL.md` is reworded.

  **Verification:**
  - [ ] Manual review — confirm the diff touches only this one status line, spot-checked against the actually-shipped Task 8.

  **Dependencies:** Task 8.

  **Files:** `docs/UI_SHELL.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 9 tasks met, including the manual check (Task 7's checkpoint) confirmed by a human.
- [ ] `docs/UI_SHELL.md` reflects the shipped behavior, spot-checked against source.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 2 leaves the project in a deliberately broken `build:types` state until Task 6 lands | Low — expected, not a defect | Called out explicitly in both tasks' verification steps; matches Locale Seed Decoupling's own precedent for a breaking foundation change |
| `worldTransition.ts` (Task 5) is the single highest-complexity file in this phase — a 4-branch function with real state-mutation ordering constraints | Medium | Given its own Checkpoint and explicit human review before any UI is built on top of it, mirroring how `AUDIO_RIG.md`'s plan gated its own riskiest task |
| `removePlanet`'s noise-map eviction cascade evicting a just-reparented locale's noise map | Low — fixed, not just documented | Was flagged as "harmless" pre-review; turned out to be a real narrow gap (`AudioEngine`'s non-throwing lookup path). Closed with an explicit re-warm in `retransmitPlanetOnly`, asserted by `worldTransition.test.ts` — see Architecture Decisions §7.5 |
| `OceanScene.tsx` refactor (Task 6) touches an already-shipped, working component | Low | Scoped to exactly the 3-call-sequence replacement per spec §2; existing test suite is the regression guard, same pattern used for every other already-shipped-file touch in this project's history |

## Open Questions

None remaining — all five items in spec §7 are resolved above: §7.1 (initializeLocale guard sufficiency) and §7.2 (removeLocale's zero existing callers) → confirmed as standing invariants, no gating task; §7.3 (button disable state) → always-clickable, Task 7's own acceptance criteria; §7.4 (hardcoded planet size) → accepted, Task 5; §7.5 (`Planet.locales` staleness) → the array itself stays unfixed at the source, but a code-review pass found its one load-bearing consequence (a real, if narrow, noise-map gap in the planet-only retransmit branch) was not actually harmless — fixed with an explicit re-warm rather than left to self-heal.
