# Implementation Plan: LFO Integration (Roadmap Phase 0)

Source spec: [docs/specs/LFO_INTEGRATION.md](../docs/specs/LFO_INTEGRATION.md). Source intent: [docs/intent/lfo-integration.md](../docs/intent/lfo-integration.md).

## Overview

Wire real Tone.js LFO modulation onto every grid-flagged target (13 per-robot, 9 global-chain), extend seed generation to cover the entire global FX chain from the planet noise map, and close a latent multi-planet bug (`currentPlanetId`) that the seeding work depends on. No UI this phase — verification is unit tests plus a temporary dev-only audible check.

## Architecture Decisions

- **`currentPlanetId` lands first, standalone.** It has zero behavioral risk today (one planet exists in practice) but is a hard dependency for `globalAudioSeed.ts`'s trigger point — sequencing it first means the risky/novel work (seeding, LFO signal-chaining) builds on a stable, already-merged foundation rather than a moving one.
- **Types/config before engine before integration.** `lfo.ts` and `lfoConfig.ts` have no runtime dependencies and can be fully unit-specified before `lfoEngine.ts` exists, which itself can be built and unit-tested against mocked `Signal`/`Param` objects before `AudioEngine.ts` exposes real ones. This means `lfoEngine.ts`'s core lifecycle (start/stop/sync, getters/setters, lazy instantiation) is de-risked independently of the trickier `AudioEngine.ts` surgery.
- **`AudioEngine.ts` exposure is two independent tasks, not one.** Per-robot-voice signals and the global FX chain are genuinely separate subsystems in the existing code (composite voices vs. the module-scoped FX chain built in `loadInstruments`) — splitting avoids a single task touching both.
- **Global effect seed ranges are decided now, not during implementation.** The table in Task 5 resolves the spec's Open Question #3 directly by adopting the ranges already documented as comments in `globalAudio.ts` (already sane, already in the codebase) and assigning log/linear scale from `GLOBAL_CHAIN_GRID.md`'s existing UI column — no ad hoc invention during coding.
- **Phase and BINARY-width are documented divergences, not blockers.** Per spec §7.1, Phase has no Tone.js `Signal` (needs a polling fallback) and Interval only applies to `'pulse'` layers. Both are handled inside Task 11's acceptance criteria rather than treated as unknowns to resolve later.

## Dependency Graph

```
Task 1 (currentPlanetId + selectCurrentPlanet)
    │
    ├── Task 2 (consumer refactor, batch A)
    ├── Task 3 (consumer refactor, batch B)
    │
    └── Task 6 (audioStore wiring) ←── Task 5 (globalAudioSeed.ts) ←── Task 4 (seed range table)

Task 7 (types/lfo.ts) ──→ Task 8 (data/lfoConfig.ts)
                                │
                                ├──→ Task 9 (AudioEngine: robot-voice signal exposure)
                                ├──→ Task 10 (AudioEngine: global-chain signal exposure)
                                │
                                └──→ Task 11 (lfoEngine.ts core lifecycle, mocked signals)
                                        │
                                        └──→ Task 12 (lfoEngine connect/disconnect, real signals — needs 9 & 10)

Task 8 ──→ Task 13 (spawnSystem.ts robot-level LfoSettings generation)

Tasks 6, 12, 13 ──→ Task 14 (dev-only audible check hook)
                            │
                            └──→ Task 15 (docs/AUDIO_SYSTEM.md LFO section)
```

## Task List

### Phase 1: Planet identity foundation

- [ ] **Task 1: Add `currentPlanetId` to `planetStore`**

  **Description:** Add a `currentPlanetId: string` field (default `DEFAULT_PELAGOS.id`), a `setCurrentPlanetId(id: string): void` action, and an exported `selectCurrentPlanet(state: PlanetStore): Planet | undefined` selector to `planetStore.ts`, per spec §4/§7.2.

  **Acceptance criteria:**
  - [ ] `PlanetStore` interface has `currentPlanetId` and `setCurrentPlanetId`.
  - [ ] `selectCurrentPlanet` is exported and returns `planets.find(p => p.id === state.currentPlanetId)`.
  - [ ] Default state has `currentPlanetId: 'pelagos'` (matches `DEFAULT_PELAGOS.id`).

  **Verification:**
  - [ ] `npm test -- planetStore` passes, including a new test asserting `selectCurrentPlanet` returns the right planet after `setCurrentPlanetId`.
  - [ ] `npm run build:types` clean.

  **Dependencies:** None.

  **Files:** `src/stores/planetStore.ts`, `src/stores/planetStore.test.ts`

  **Estimated scope:** XS (1 file + its test)

- [ ] **Task 2: Refactor `planets[0]` consumers — batch A**

  **Description:** Replace `usePlanetStore((s) => s.planets[0]?.currentLocaleId ?? '')` and equivalent one-off `planets[0]` reads with `selectCurrentPlanet(s)` in this batch of files. Selector swap only — no other logic changes (spec §3).

  **Acceptance criteria:**
  - [ ] No remaining `planets[0]` reference in any file in this batch.
  - [ ] Each file uses `selectCurrentPlanet` (or the equivalent `.getState()` call for non-hook contexts).
  - [ ] No behavior change — app still resolves the same locale/planet as before (only one planet exists today).

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, confirm the world/robots/transport bar still render and respond identically to before the change.

  **Dependencies:** Task 1.

  **Files:** `src/App.tsx`, `src/components/robot/Robot.tsx`, `src/components/actors/Factory.tsx`, `src/utils/localeHelpers.ts`, `src/engine/harmonySystem.ts` (comment only)

  **Estimated scope:** S (5 files, mechanical one-line swaps)

- [ ] **Task 3: Refactor `planets[0]` consumers — batch B**

  **Description:** Same as Task 2, for the remaining consumer files.

  **Acceptance criteria:**
  - [ ] No remaining `planets[0]` reference in any file in this batch.
  - [ ] Each file uses `selectCurrentPlanet`.
  - [ ] No behavior change.

  **Verification:**
  - [ ] `npm run build:types` clean.
  - [ ] `npm run lint` clean.
  - [ ] Manual check: Robot Options / Robot Oscillators tabs and the robot list still open and reflect the correct robot data.

  **Dependencies:** Task 1.

  **Files:** `src/components/panels/screen/RobotList.tsx`, `src/components/panels/screen/TransportBar.tsx`, `src/components/panels/screen/worldView/OceanScene.tsx`, `src/components/panels/screen/console/RobotOscillatorsTab.tsx`, `src/components/panels/screen/console/RobotOptionsTab.tsx`

  **Estimated scope:** S (5 files, mechanical one-line swaps)

### Checkpoint: Planet identity foundation
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] No `planets[0]` references remain anywhere in `src/` (grep confirms zero matches).
- [ ] App behavior is unchanged when manually exercised.
- [ ] Review with human before proceeding.

---

### Phase 2: Global effect seed generation

- [x] **Task 4: Per-field seed range table for `GlobalAudioSettings`** — done

  **Description:** Produce the (min, max, scale) table for all 24 fields across the 7 global effects, resolving spec §7.3. Adopt the ranges already documented as comments in `globalAudio.ts`; assign `log`/`linear` scale by cross-referencing `GLOBAL_CHAIN_GRID.md`'s UI column (`SLIDER (Logarithmic)` → log, everything else → linear; `EQ`'s Center-Zero stays linear around 0).

  **Deviation from plan, resolved before implementing:** `GlobalAudioSettings.filter` was a single `FilterSettings` field, but `AudioEngine.ts` has always built two independent Tone filter nodes (`_globalLPF`/`_globalHPF`) with separate setters (`setGlobalFilterLPF`/`setGlobalFilterHPF`), matching this table's own LPF/HPF split below and `GLOBAL_CHAIN_GRID.md`. The type never got updated to match. Fixed as part of this task (zero consumer blast radius — nothing in `src/` read `.filter`): `filter` → `filterLPF` + `filterHPF` in `src/types/globalAudio.ts` and `DEFAULT_GLOBAL_AUDIO_SETTINGS`, TDD'd in `src/types/globalAudio.test.ts`. Field count is 24, not the ~29 originally estimated (the plan's original estimate treated `filter` as a bigger group than it actually is).

  **Table (ship as a comment block or co-located const in `globalAudioSeed.ts`, per Task 5):**

  | Effect | Field | Min | Max | Scale |
  |---|---|---|---|---|
  | Compressor | threshold (dB) | -60 | 0 | linear |
  | Compressor | ratio | 1 | 20 | linear |
  | Compressor | attack (s) | 0.001 | 1 | log |
  | Compressor | release (s) | 0.01 | 1 | log |
  | Compressor | knee (dB) | 0 | 40 | linear |
  | EQ3 | low (dB) | -12 | 12 | linear (center-zero) |
  | EQ3 | mid (dB) | -12 | 12 | linear (center-zero) |
  | EQ3 | high (dB) | -12 | 12 | linear (center-zero) |
  | Filter (LPF) | frequency (Hz) | 20 | 20000 | log |
  | Filter (LPF) | Q | 0.1 | 20 | log |
  | Filter (HPF) | frequency (Hz) | 20 | 20000 | log |
  | Filter (HPF) | Q | 0.1 | 20 | log |
  | Chorus | rate (Hz) | 0.1 | 10 | linear |
  | Chorus | depth | 0 | 1 | linear |
  | Chorus | delayTime (ms) | 2 | 20 | linear |
  | Chorus | feedback | 0 | 1 | linear |
  | Chorus | wet | 0 | 1 | linear |
  | Delay | delayTime (s) | 0 | 1 | linear |
  | Delay | feedback | 0 | 0.95 | linear |
  | Delay | wet | 0 | 1 | linear |
  | Reverb | decay (s) | 0.1 | 10 | log |
  | Reverb | preDelay (s) | 0 | 0.5 | linear |
  | Reverb | dampening (Hz) | 100 | 8000 | log |
  | Reverb | wet | 0 | 1 | linear |

  **Acceptance criteria:**
  - [x] Every field in `GlobalAudioSettings` (excluding `enabled`, `globalBypass`, `type`) has an entry.
  - [x] Each entry's min/max matches the existing doc comment in `src/types/globalAudio.ts` exactly (no silent range changes).
  - [x] Each entry's scale matches `GLOBAL_CHAIN_GRID.md`'s UI column.

  **Verification:**
  - [x] Promoted from "manual review, no test" to real TDD'd code, per explicit request: RED tests written first in `globalAudioSeedRanges.test.ts` (module didn't exist), then `globalAudioSeedRanges.ts` implemented to GREEN. 6/6 tests pass, including cross-checking every `DEFAULT_GLOBAL_AUDIO_SETTINGS` value falls within its own range (inclusive) and that EQ3's center-zero fields are explicitly linear, not log.
  - [x] `npm run build:types`, `npm run lint`, full suite (30 files, 445/445) all clean.

  **Dependencies:** None (pure research/documentation task; can run any time before Task 5).

  **Files:** `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioSeedRanges.test.ts`, `src/types/globalAudio.ts` (filterLPF/filterHPF split), `src/types/globalAudio.test.ts` (new).

  **Estimated scope:** S (ended up as code + the filter-split fix, not the originally-planned "no code")

- [x] **Task 5: `src/utils/globalAudioSeed.ts` — `generateGlobalAudioSettings`** — done

  **Description:** Implement `generateGlobalAudioSettings(planetId: string, planetName: string): GlobalAudioSettings`, sampling `getPlanetNoiseMap(planetId, planetName)` directly via `getSeededVal` for every field in Task 4's table (log-scaled fields sample in log space then exponentiate back into range). `enabled` is not seeded — set per spec §3 (see Task 6 for the "force true" override point). `dataId` keys are dot-namespaced (e.g. `'globalAudio.eq3.low'`), per `PROCEDURAL_GENERATION.md` convention.

  **Implementation note:** the log/linear scaling logic is its own exported pure function, `scaleUnitValue(t, range)` — `getSeededVal` owns the seeded-noise-to-`[0,1]` draw, `scaleUnitValue` owns range + log/linear mapping, kept separately testable. This let the "log vs. linear" acceptance criterion below be proven deterministically (exact geometric-vs-arithmetic-mean math at `t=0.5`) instead of via statistical distribution sampling.

  **Acceptance criteria:**
  - [x] `generateGlobalAudioSettings(planetId, planetName)` returns a fully-populated `GlobalAudioSettings`.
  - [x] Same `(planetId, planetName)` input always produces identical output (determinism) — tested both against the cached noise map and after an explicit `evictPlanetNoiseMap` forces a fresh one.
  - [x] Different planet names produce different values for at least one field (non-degenerate).
  - [x] Log-scaled fields produce a log-distributed (geometric) spread, not a linear (arithmetic) one — proven exactly via `scaleUnitValue`, not statistically.
  - [x] All values fall within Task 4's documented min/max per field.

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts` — 11/11 passing.
  - [x] `npm run build:types`, `npm run lint` clean (one import-order fix needed).
  - [x] Full suite: 31 files, 456/456 passing (+11 from before).

  **Dependencies:** Task 4.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** M (1 new file + test, 24-field mapping)

- [x] **Task 6: Wire seeded global audio into `audioStore` on planet change** — done

  **Description:** Call `generateGlobalAudioSettings` wherever `setCurrentPlanetId` fires (or equivalently, whenever the active planet resolves), and replace `audioStore`'s `globalAudio` with the result — with every effect's `enabled` forced `true` per spec §3/§6. Replaces `DEFAULT_GLOBAL_AUDIO_SETTINGS` as the live source for the current planet.

  **Implementation notes:**
  - `regenerateGlobalAudioFromSeed(planetId, planetName)` is the explicit action; a module-scope `usePlanetStore.subscribe(...)` in `audioStore.ts` calls it once at import time (covers "app init") and again on every future `currentPlanetId` change (covers "any future planet switch"), mirroring `planetStore.ts`'s own module-scope noise-map priming. This means no future planet-switch call site has to remember to also call the regenerate action — the same class of "forgot to update every call site" bug this whole task list has been closing elsewhere (`planets[0]`, `filter`/`filterLPF`/`filterHPF`).
  - `AudioEngine.setEffectBypass(effect, true)` is called for all 7 effects alongside the `setGlobal*` setters — `setGlobal*` alone already writes live values directly regardless of any bypass state, but calling `setEffectBypass` too keeps AudioEngine's own enable/bypass bookkeeping consistent for a future disable-then-re-enable flow.
  - Found and fixed a real test-mock staleness issue along the way: `audioStore.test.ts`'s existing `vi.mock('../engine/AudioEngine', ...)` only stubbed `setBPM` — harmless before, but this task's module-scope side effect now calls 8 more `AudioEngine` methods at import time, which would throw against the old mock. Expanded the mock to match the module's real dependency surface rather than working around it.

  **Acceptance criteria:**
  - [x] `audioStore` gains an action (e.g. `regenerateGlobalAudioFromSeed(planetId, planetName)`) that calls `generateGlobalAudioSettings` and forces every effect's `enabled: true` before writing to `globalAudio`.
  - [x] The action is invoked at the same point `setCurrentPlanetId` is called (app init and any future planet switch) — via the module-scope subscription above.
  - [x] `AudioEngine`'s existing `setGlobal*` setters are called with the new values so the live Tone FX chain actually updates (not just the Zustand snapshot).

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` — 11/11 passing, including determinism, non-degeneracy across planets, forced-`enabled`, `setEffectBypass` coverage for all 7 effects, the no-planet-matches edge case (no throw, no change), and the same-value-no-redundant-recompute edge case.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full suite: 31 files, 466/466 passing (+10 from before) — including files that transitively import `audioStore.ts`.
  - [x] `npm run build` — production bundle builds cleanly with the new module-scope side effect.
  - [ ] Manual/audible check — deferred to Task 14 as originally planned (no speakers exercised yet, just the Tone node graph via mocked/headless tests).

  **Dependencies:** Task 1, Task 5.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (1 file + test)

### Checkpoint: Global effect seed generation
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Global FX settings visibly/audibly vary by planet seed; all 7 effects are on.
- [ ] Review with human before proceeding.

---

### Phase 3: LFO types, config, and engine core

- [x] **Task 7: `src/types/lfo.ts`** — done

  **Description:** Define `LfoShape` (`'triangle' | 'sine' | 'square' | 'sawtooth'`), `RobotLfoTargetId` (13 values: `'volume'`, and `'layer{0,1,2}.{gain,detune,phase,pulseWidth}'`), `GlobalLfoTargetId` (9 values: `'eq3.low'`, `'eq3.mid'`, `'eq3.high'`, `'lpf.frequency'`, `'lpf.Q'`, `'hpf.frequency'`, `'hpf.Q'`, `'chorus.delayTime'`, `'delay.delayTime'`), and `LfoSettings { shape: LfoShape; rate: number; depth: number }` (rate 0.1–10 Hz, depth 0–100%, per `ROBOT_DATA_GRID.md`'s LFO MODULE rows).

  **Implementation note:** each union type is paired with a `readonly` const array (`LFO_SHAPES`, `ROBOT_LFO_TARGET_IDS`, `GLOBAL_LFO_TARGET_IDS`) so the "matches the grids exactly" acceptance criterion is genuinely runtime-testable rather than needing a new compile-time type-testing pattern this codebase doesn't otherwise use — and the arrays are what Task 8's `lfoConfig.ts` will iterate over to build `DEFAULT_LFO_SETTINGS`. Rate/depth bounds are also exported as named constants (`LFO_RATE_MIN/MAX`, `LFO_DEPTH_MIN/MAX`), not just documented in comments, so Task 8/11 have something to import instead of re-hardcoding.

  **Acceptance criteria:**
  - [x] All three target-id union types match the grids exactly (13 + 9 members).
  - [x] `LfoSettings` fields and bounds are documented in comments citing `ROBOT_DATA_GRID.md`.
  - [x] No `any` types.

  **Verification:**
  - [x] `npx vitest run src/types/lfo.test.ts` — 11/11 passing (exact membership, no duplicates, no cross-set overlap, bounds match the grid, a valid `LfoSettings` object type-checks).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full suite: 33 files, 484/484 passing (+11 from before).

  **Dependencies:** None.

  **Files:** `src/types/lfo.ts`, `src/types/lfo.test.ts`

  **Estimated scope:** XS (1 file, types only)

- [x] **Task 8: `src/data/lfoConfig.ts`** — done

  **Description:** Default `LfoSettings` per target id (both robot and global), following the `globalAudio.ts` `DEFAULT_*` const pattern. Also extend `src/types/layeredAudio.ts` if `OscillatorLayer`/voice-descriptor types need a modulation-input field to type-check against `lfoEngine.ts`'s connect signatures (spec §2).

  **`layeredAudio.ts` decision — left untouched, deliberately.** No field was added. `connectLfoTarget` (Task 12) resolves what to connect to via `AudioEngine.getRobotModulationTarget(robotId, target)` (Task 9) — a live-Signal lookup by robot id + target id against the already-constructed composite voice, not by reading anything off the spawn-time `OscillatorLayer` descriptor. Nothing in the connect path needs the descriptor to carry LFO state. Adding a speculative field now, before Task 9–12 prove it's actually needed, would violate incremental-implementation's Rule 0 (don't build for hypothetical requirements). If Task 9/11/12 later reveal a real need, it'll come with a concrete signature to satisfy, not a guess.

  **Implementation notes:**
  - `makeDefaultLfoSettings()` returns `{ shape: 'sine', rate: LFO_RATE_MIN, depth: LFO_DEPTH_MIN }` for every target — depth pinned to 0 (inert until a human or Task 13's seeded generation sets a real value), rate pinned to `LFO_RATE_MIN` rather than an arbitrary "typical" pick, both importing Task 7's constants directly rather than re-hardcoding.
  - Each of the 22 targets gets its **own** settings object, not a shared reference — `lfoEngine.ts`'s setters (Task 11) will mutate these in place, so sharing one object across targets would have been a real, easy-to-miss bug (mutating one target's rate would've silently mutated all 22). Verified with an explicit mutation-isolation test.

  **Acceptance criteria:**
  - [x] `DEFAULT_LFO_SETTINGS: Record<RobotLfoTargetId | GlobalLfoTargetId, LfoSettings>` covers all 22 targets.
  - [x] No magic numbers — every default cites its source range from Task 7.
  - [x] `layeredAudio.ts` changes (if any) are additive/optional fields — no existing `OscillatorLayer` consumer breaks. *(No changes made — see decision above.)*

  **Verification:**
  - [x] `npx vitest run src/data/lfoConfig.test.ts` — 7/7 passing: exact 22-key coverage, valid shape/rate/depth bounds for every entry, rate/depth exactly match Task 7's `MIN` constants (not just "within bounds"), per-target object isolation, JSON-serializability.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full suite: 34 files, 491/491 passing (+7 from before) — no `layeredAudio`-dependent test needed updating, since the file wasn't touched.

  **Dependencies:** Task 7.

  **Files:** `src/data/lfoConfig.ts`, `src/data/lfoConfig.test.ts`

  **Estimated scope:** S (2 files)

- [x] **Task 9: `AudioEngine.ts` — expose robot-voice modulation targets** — done

  **Description:** Add `getRobotModulationTarget(robotId: string, target: RobotLfoTargetId): Tone.Signal<any> | Tone.Param<any> | null` to `AudioEngine`, returning the live `Signal`/`Param` for Gain and Detune, and `null` for Phase/pulseWidth-on-square (handled at the `lfoEngine` layer per Task 12, not here — this function only returns real connectable signals, never a polling proxy).

  **Implementation notes:**
  - `CompositeVoice` gained a new `layers` field exposing per-layer `{ synth, gainNode, layer }` — previously fully closure-private inside `createCompositeVoice`, with no way for anything outside it to reach a layer's live synth/gain nodes. This wasn't explicitly called out in the plan text, but is the necessary plumbing the task's whole premise requires — `layerNodes` already existed in exactly the needed shape inside the closure, so this was a one-line additive change (new interface field + appending `layers: layerNodes` to the existing return statement), not a restructure.
  - `'volume'` (the 13th `RobotLfoTargetId`, the composite voice's overall output gain) isn't mentioned in the task's acceptance criteria list, but the function signature takes the full `RobotLfoTargetId` union, so it needed real handling too — resolved to `voice.output.gain`, tested explicitly.
  - The existing `AudioEngine.test.ts` mock for `Tone.Synth` ignored its constructor entirely (always returned the same flat `oscillator: { detune: { value: 0 } }`, no `width`). Made it parameter-aware — `width` only appears when `oscillator.type === 'pulse'` — so the pulse-vs-square branch is genuinely exercised rather than trivially passing against an always-present mock field. Verified this change alone didn't break any of the file's other 57 pre-existing tests before adding new ones.
  - **Follow-up cleanup:** the initial implementation repeated `Tone.Signal<any> | Tone.Param<any>` at 5 call sites (10 `no-explicit-any` lint warnings). Checked first whether a real non-`any` type existed — Tone's actual generic bound, `UnitName`, is defined in `tone/build/esm/core/type/Units.d.ts` and is **not re-exported from the public `tone` package**, so importing it would mean depending on an unsupported, version-fragile internal path; `any` is genuinely correct here, not a shortcut, since the function returns signals of different concrete unit types (gain, cents, audioRange) depending on the branch. Refactored to a single module-scope `ModulationTarget` type alias with one documented `eslint-disable-next-line`, used at every call site instead of repeating the union — `any` now exists at exactly one declaration site instead of ten. `npm run lint` is now 0 errors, 0 warnings. `ModulationTarget` is directly reusable by Task 10's `getGlobalModulationTarget`, which needs the identical return type.

  **Acceptance criteria:**
  - [x] Returns the composite voice's per-layer `Tone.Gain.gain` for `'layerN.gain'` targets.
  - [x] Returns the synth's `oscillator.detune` for `'layerN.detune'` targets.
  - [x] Returns `null` (not throw) for `'layerN.phase'` and for `'layerN.pulseWidth'` when that layer's type isn't `'pulse'`.
  - [x] Returns the `PulseOscillator.width` signal for `'layerN.pulseWidth'` when the layer type is `'pulse'`.
  - [x] Returns `null` for an unreserved/missing `robotId` — never throws.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` — 65/65 passing (8 new + 57 pre-existing, all still green). New cases cover every branch above plus `'volume'` and an out-of-range layer index.
  - [x] `npm run build:types` clean. `npm run lint` — 0 errors, 0 warnings (after the `ModulationTarget` refactor above).
  - [x] Full suite: 34 files, 499/499 passing (+8). `npm run build` clean.

  **Dependencies:** Task 7.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** M (1 file, several new branches; well-isolated by existing composite-voice structure)

- [x] **Task 10: `AudioEngine.ts` — expose global-chain modulation targets** — done

  **Description:** Add `getGlobalModulationTarget(target: GlobalLfoTargetId): ModulationTarget | null` to `AudioEngine`, returning the live nodes already constructed in `loadInstruments` for the 9 global-chain `Has LFO` fields. Reuse Task 9's `ModulationTarget` type alias (already defined module-scope in `AudioEngine.ts`) rather than re-writing `Tone.Signal<any> | Tone.Param<any>` here — that repetition is exactly what Task 9's follow-up cleanup eliminated.

  **Real finding — `'chorus.delayTime'` is NOT connectable, verified against Tone's own `.d.ts`, not assumed.** `GLOBAL_CHAIN_GRID.md` flags it `LFO: X`, but `Tone.Chorus.delayTime` is a plain `get/set` number (`Chorus.d.ts`: `get delayTime(): Milliseconds`), not a `Signal`/`Param` — Chorus already runs its own internal LFO on delayTime, so Tone.js exposes no connectable Signal for it at all. Checked every other target's real type too, not just this one: `EQ3.low/mid/high: Param<"decibels">`, `Filter.frequency: Signal<"frequency">`/`Filter.Q: Signal<"positive">` (both LPF and HPF, separate instances), `FeedbackDelay.delayTime: Param<"time">` — all 8 of those are genuinely connectable. `getGlobalModulationTarget('chorus.delayTime', …)` returns `null` unconditionally, documented in the function's own comment, not silently dropped. This is the same class of grid-says-yes-but-Tone.js-says-no finding as Task 9's Phase caveat (spec §7.1) — now two confirmed cases, not one.

  **Acceptance criteria:**
  - [x] Returns the correct live signal for all 9 `GlobalLfoTargetId` values (EQ3 low/mid/high, LPF freq/Q, HPF freq/Q, Chorus delayTime, Delay delayTime) — 8 real, 1 (`chorus.delayTime`) structurally `null` per the finding above.
  - [x] Returns `null` (not throw) before `AudioEngine.start()` has constructed the FX chain.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` — 72/72 passing (7 new + 65 pre-existing). New cases cover every target both pre- and post-`start()`, the `chorus.delayTime` null case explicitly, and that LPF/HPF resolve to genuinely distinct `Filter` instances (not the same node read twice).
  - [x] `npm run build:types`, `npm run lint` clean — 0 errors, 0 warnings (reusing `ModulationTarget` meant zero new `any` warnings this time).
  - [x] Full suite: 34 files, 506/506 passing (+7). `npm run build` clean.

  **Dependencies:** Task 7.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (same file as Task 9 — sequence after it to avoid merge overlap, but independent in principle)

### Checkpoint: Engine foundations
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] `AudioEngine`'s two new getters are covered by tests for every target id.
- [ ] Review with human before proceeding.

---

### Phase 4: LFO engine lifecycle and connection

- [x] **Task 11: `src/engine/lfoEngine.ts` — core lifecycle** — done

  **Description:** Implement `getLfoSettings`, `setLfoRate`, `setLfoDepth`, `setLfoShape`, and transport-gated `start`/`stop` for a per-target `Tone.LFO`, with lazy instantiation (no node created until first use). Unit-test against a mocked `Signal`-like object — this task does not depend on `AudioEngine`'s real exposure.

  **Real findings, verified against Tone.js's actual `.d.ts` before designing — not assumed:**
  - `Tone.LFO.sync()`'s own doc comment states it syncs "the frequency to the bpm of the transport" (its example shows a note-division rate string like `"8n"`) — calling it would tempo-couple the rate, directly violating the confirmed intent that rate stays free-running Hz. **`sync()` is deliberately never called.** `start()`/`stop()` gate by checking `Tone.getTransport().state === 'started'` directly instead.
  - `Tone.LFO` has no `depth` property — only `amplitude: Param<"normalRange">` (0–1). `setLfoDepth`'s 0–100% maps to `amplitude.value = depth / 100`.

  **Multi-robot key design (not fully pinned down by the plan text, resolved here):** `DEFAULT_LFO_SETTINGS` (Task 8) is a flat `Record<target, LfoSettings>` — one entry per target id, not per robot. But robot-scoped targets need one *live* LFO per robot (12 robots could each be modulating their own `layer0.gain` independently), so every function takes an optional `robotId?: string`; the internal instance key is `` `${robotId}:${target}` `` when provided, or the bare target id for global-chain targets (no robot). `getLfoSettings` falls back to `DEFAULT_LFO_SETTINGS[target]` per-instance, so each robot starts from the same default and diverges independently once set.

  **Implementation notes:**
  - `start()`/`stop()` deliberately never lazily construct a node — only setters (and, later, Task 12's `connectLfoTarget`) do, matching the acceptance criterion's literal "setter or connect" wording. Calling `start()`/`stop()` before anything has been set for a target is a safe no-op.
  - **Debugging note worth recording:** the first test-writing pass used absolute `toHaveBeenCalledTimes(N)` assertions and grabbed `mock.results[0]` for inspecting constructed instances — both wrong for this codebase's established Tone-mock pattern, where `vi.resetModules()` gives `lfoEngine.ts` a fresh module instance per test but does **not** reset the hoisted `tone` mock's own call history (`AudioEngine.test.ts` already documents this exact constraint and works around it with `.at(-2)`/`.at(-1)`). Caught immediately by the RED→GREEN cycle itself (9 failures on first run, not silently passing wrong), then fixed by asserting call-count *deltas* around each action and reading `mock.results.at(-1)` for the most-recently-constructed instance.

  **Acceptance criteria:**
  - [x] No `Tone.LFO` is constructed until a setter or connect is first called for a given target.
  - [x] `setLfoRate`/`setLfoDepth`/`setLfoShape` update both the live node (if instantiated) and the persisted `LfoSettings`.
  - [x] Rate is a plain Hz value — no BeatClock/Transport import for the rate itself.
  - [x] `start`/`stop` are gated by the transport per spec §3 (confirmed intent's "transport gates start/stop only").

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` — 22/22 passing: lazy instantiation (module load, settings-only reads, first-setter-triggers, reuse-across-setters), settings persistence, rate/depth clamping at both bounds, per-robot instance isolation (including the global-vs-robot-scoped-same-target-id collision check), and transport gating for both `start` and `stop`.
  - [x] `npm run build:types`, `npm run lint` clean — 0 errors, 0 warnings.
  - [x] Full suite: 35 files, 528/528 passing (+22). `npm run build` clean.

  **Dependencies:** Task 8.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** M (1 new file, core lifecycle logic)

- [x] **Task 12: `connectLfoTarget`/`disconnectLfoTarget` — real signal wiring** — done

  **Description:** Implement `connectLfoTarget`/`disconnectLfoTarget` against `AudioEngine.getRobotModulationTarget`/`getGlobalModulationTarget`. Handle the two documented divergences from spec §7.1 explicitly: Phase uses a manual polling fallback (re-`.set()` each LFO-internal tick, not `.connect()`); pulseWidth on a non-`'pulse'` layer is a documented no-op, not a throw.

  **Scheduling mechanism — resolved before implementing, not assumed:** the phase-polling fallback needs *some* periodic trigger, but CLAUDE.md forbids raw JS timers for this class of work. Used `beatClock.ts`'s existing sanctioned `scheduleRepeat`/`cancelSchedule` (Transport-driven, already the app's established wrapper for exactly this kind of recurring work) rather than `Tone.getTransport().scheduleRepeat` directly or any `setInterval`/`requestAnimationFrame`. Polling interval is `'16n'`, matching BeatClock's own internal tick granularity.

  **Phase-modulation math — a deliberate, documented simplification, not hidden:** with no live Signal to drive, the fallback needs its own waveform generator. It modulates around a fixed `PHASE_CENTER_DEGREES = 180` (the midpoint of the 0–360° range `ROBOT_DATA_GRID.md` documents for Phase) rather than the layer's own current phase value at connect time — reading a robot's live `audioAttributes` from inside `lfoEngine.ts` would mean reaching into `useLocaleStore` directly, which stays `AudioEngine`/store territory architecturally. Depth scales the swing from that center (`±depth% × 180°`); shape drives a small local `waveformUnit()` sine/triangle/square/sawtooth generator, since Tone.LFO's own audio-rate output isn't readable from the main thread without an analyser node. Flagged as a Phase-0 engine-scope simplification to revisit once real UI/audible testing (Task 14) shows what "center" should actually mean.

  **Implementation notes:**
  - `connectLfoTarget` still calls `getOrCreateLfo` for phase targets (constructing/reusing the `Tone.LFO` node for rate/depth/shape bookkeeping) even though that node is never actually `.connect()`-ed anywhere — keeps `getLfoSettings`/`setLfoRate` etc. behaving identically for phase as for every other target; only the *connection* mechanism differs.
  - **Follow-up fix (found while implementing Task 14, applied here since it's this task's code):** `getOrCreateLfo` only ever passed `rate` to `new Tone.LFO(...)`, leaving `min`/`max` at Tone's own defaults (`min: 0, max: 1` — verified directly in `LFO.getDefaults()`, not assumed). Every connected LFO was therefore scoped to a 0–1 output range regardless of target — modulating `eq3.low` (±12 dB) or `layer.detune` (±50 cents) by only 0–1 units is functionally inaudible, silently defeating the entire point of connecting. Fixed by resolving each target's real range at connect time (`resolveLfoOutputRange`) and setting `lfo.min`/`lfo.max` before `.connect()`: robot fields (`volume`/`gain`/`detune`/`pulseWidth`) from a small `ROBOT_LFO_FIELD_RANGE` table per `ROBOT_DATA_GRID.md`; global-chain targets by reusing Task 4/5's `GLOBAL_AUDIO_SEED_RANGES` rather than a second table, translating the `lpf.`/`hpf.` short-form target ids to the `filterLPF.`/`filterHPF.` keys that table actually uses. 6 new tests, TDD'd, covering every field-range case plus both filter-key translations.

  **Verification (updated):** `npx vitest run src/engine/lfoEngine.test.ts` — 42/42 passing (36 prior + 6 new for the range fix). `npm run build:types`, `npm run lint` clean.
  - `updateVoiceLayerParams`'s partial-merge-by-index contract (verified by reading `AudioEngine.ts`'s `set()` implementation directly, not assumed) means a sparse `Partial<OscillatorLayer>[]` with only the target index populated leaves every other layer — and every other field of the target layer — untouched. Explicitly tested.
  - `connectLfoTarget`'s `signal` variable relies on TypeScript inferring `AudioEngine`'s own return type rather than redeclaring the `any`-containing union locally — avoided introducing a second `any` site outside the one `ModulationTarget` alias Task 9 already established.
  - Test-only: shares captured `scheduleRepeat` callbacks between the hoisted mock factory and test bodies via `vi.hoisted()`, since the real `scheduleRepeat` only actually fires once a real transport runs — tests manually invoke the captured callback to simulate ticks, per the acceptance criterion's own "e.g. via fake timers/mocked LFO ticks" wording.

  **Acceptance criteria:**
  - [x] `connectLfoTarget` on a Gain/Detune/global-chain/pulse-width-on-pulse-layer target calls the real `.connect()`.
  - [x] `connectLfoTarget('layerN.phase', …)` uses the polling fallback and is covered by a test asserting the fallback actually mutates phase over time (e.g. via fake timers/mocked LFO ticks).
  - [x] `connectLfoTarget` on pulseWidth for a non-`'pulse'` layer no-ops and returns `false` (not throw).
  - [x] `disconnectLfoTarget` cleanly reverses `connectLfoTarget` for every case above, including canceling the phase-polling fallback.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` — 36/36 passing (14 new + 22 from Task 11), all green on the first GREEN attempt. Covers every branch above plus: missing-robotId on both the Signal and phase paths, idempotent re-connect, and the sparse-array layer-isolation case.
  - [x] `npm run build:types`, `npm run lint` clean — 0 errors, 0 warnings.
  - [x] Full suite: 35 files, 542/542 passing (+14). `npm run build` clean.

  **Dependencies:** Task 9, Task 10, Task 11.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** M (extends Task 11's file; the phase-polling fallback is the highest-risk logic in this whole plan)

- [x] **Task 13: `spawnSystem.ts` — robot-level `LfoSettings` generation** — done

  **Description:** Generate `LfoSettings` for each of a robot's 13 targets at spawn time, via `getSeededVal` against the locale noise map, matching the existing pattern used for the rest of `AudioAttributes`.

  **Implementation notes:**
  - Added `Robot.lfoSettings?: Record<RobotLfoTargetId, LfoSettings>` (`types/Robot.ts`) — a new field, not nested under `AudioAttributes`, since LFO is a modulation layer on top of a robot's audio attributes, not itself one.
  - `generateRobotLfoSettings(noiseMap, offset)` mirrors `generateAudioAttributes`'s existing shape exactly. Each of the 13 targets gets its own dot-namespaced dataId (`` `robot.lfo.${target}.rate` `` etc.) — since the target name is baked into the dataId string itself, a single shared `offset` naturally yields distinct per-target values, unlike the oscillator-layer loop nearby which needs a `layerOffset = offset * 10 + i` multiplier (only necessary when multiple items share one dataId string).
  - Wired into `spawnRobot` alongside `audioAttributes`: generated fresh in the normal branch, and — per the confirmed intent ("LFO attributes should be generated in the same way that its parent effect is generated, seed-wise") — **copied wholesale in the `shouldCopy` branch**, same as `audioAttributes` itself, rather than re-generated. Verified with a test that spawns enough robots to make at least one copy virtually certain (P(zero copies) ≈ 0.7²⁹ ≈ 0.00002) and confirms a shared `lfoSettings` object reference exists among them, not just look-alike values.

  **Acceptance criteria:**
  - [x] Every spawned robot has `LfoSettings` for all 13 `RobotLfoTargetId` values.
  - [x] Same locale seed + spawn index → identical `LfoSettings` every time (determinism, matching existing `spawnSystem.test.ts` assertions for other attributes) — tested against a real `createNoise2D(alea(seed))` map, not just a mock.
  - [x] `dataId` keys follow the `'robot.lfo.<target>.<field>'` dot-namespaced convention.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts` — 25/25 passing (7 new: 5 for the pure generator function, 1 integration check that a spawned robot's `lfoSettings` covers all 13 targets, 1 copy-inheritance check; all 18 pre-existing tests unaffected).
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full suite: 35 files, 548/548 passing (+7). `npm run build` clean.

  **Dependencies:** Task 8.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/types/Robot.ts`

  **Estimated scope:** S (extends an existing, well-understood generation path)

### Checkpoint: LFO engine complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every target id (13 robot + 9 global) has a passing connect/disconnect test.
- [ ] Review with human before proceeding.

---

### Phase 5: Audible verification and docs

- [x] **Task 14: Temporary dev-only audible check hook** — done, fully verified

  **Description:** Add a `DEV_TUNING`-gated hook (e.g. exposed on `window` only in dev builds, per the existing `Debug Tools` pattern in `AUDIO_SYSTEM.md`) that connects one robot-layer target and one global-chain target to an active LFO, so the seeded/connected chain can be confirmed by ear. Explicitly not real UI (spec §3).

  **Discovered this task's real premise was broken, and fixed it as a prerequisite (see Task 12's updated entry):** before writing the hook, checked whether `connectLfoTarget` would actually produce audible modulation — it wouldn't have. Every LFO was constructed with Tone's default `min:0/max:1` output range regardless of target, so even a "successful" connection to e.g. an EQ band would only swing it by 0–1 dB out of a ±12 dB range. Fixed in `lfoEngine.ts` (range-scaling, TDD'd, 6 new tests) before building this hook on top of it — otherwise Task 14 would have "succeeded" at connecting while still producing no audible effect.

  **Implementation:** new `src/engine/lfoDebug.ts` (per the plan's own suggestion, kept out of `lfoEngine.ts`'s and `AudioEngine.ts`'s public surface). Exposes `window.__lfoDebug.audition()` / `.stop()`, gated by `if (DEV_TUNING && typeof window !== 'undefined')`. `audition()` starts `AudioEngine`, finds the first robot in the active locale, connects+starts `layer0.detune` (3 Hz, 100% depth — an audible pitch wobble) and `eq3.low` (0.5 Hz, 100% depth — a slow tonal sweep across the mix), and returns a descriptive string. Imported once from `main.tsx` purely for its registration side effect — not from any component or store, matching the "not real UI" requirement literally.

  **Acceptance criteria:**
  - [x] Hook only exists when `DEV_TUNING` is true (stripped from production builds, matching existing `DEV_TUNING`-gated code elsewhere) — verified two ways: a unit test flipping a mocked `DEV_TUNING` to `false` and confirming `window.__lfoDebug` never gets set, *and* directly grepping the built `dist/assets/*.js` for `lfoDebug`/`__lfoDebug`/`auditionLfo` after `npm run build` — zero matches, confirming genuine dead-code elimination, not just a runtime guard that happens to be false.
  - [x] Connecting an LFO to a robot's Detune (or Gain) and a global EQ band is audibly confirmable in `npm run dev` — **confirmed by the user, listening in the running app**: "I hear the LFO effects!"
  - [x] No component or store references this hook — it's a standalone dev utility, not wired into any UI. Only `main.tsx` imports it, for the registration side effect only (never calls `audition()`/`stop()` itself).

  **Verification:**
  - [x] `npx vitest run src/engine/lfoDebug.test.ts` — 8/8 passing: DEV_TUNING gating (both directions), connect+start on both targets, audible rate/depth/shape values (not left at defaults), the no-robot-in-locale case (message + no throw), and `stop()` reversing both targets.
  - [x] `npm run build:types`, `npm run lint` clean. Full suite: 36 files, 562/562 passing (+8, plus Task 12's +6). `npm run build` clean — 1168 modules.
  - [x] `grep -c "lfoDebug\|__lfoDebug\|auditionLfo" dist/assets/*.js` → `0`. Confirmed stripped, not assumed.
  - [x] Manual/audible check — confirmed by the user: "I hear the LFO effects!"

  **Dependencies:** Task 6, Task 12, Task 13.

  **Files:** `src/engine/lfoDebug.ts`, `src/engine/lfoDebug.test.ts`, `src/main.tsx` (dev-gated import), plus Task 12's `src/engine/lfoEngine.ts`/`.test.ts` follow-up fix.

  **Estimated scope:** S

- [x] **Task 15: `docs/AUDIO_SYSTEM.md` — "LFO Modulation" section** — done

  **Description:** Document `lfoEngine.ts`'s final API (mirroring the existing "AudioEngine API" section's style), the 22 target ids, the Phase-polling and BINARY-pulseWidth divergences from spec §7.1, and how global/robot LFO settings are seeded.

  **Note on this being a docs-only task:** per the test-driven-development skill's own scope ("When NOT to use: ... documentation updates... that have no behavioral impact"), no RED/GREEN cycle applied here — verification was a direct spot-check of every documented signature against the shipped source (`lfoEngine.ts`'s full current body, `AudioEngine.ts`'s `getRobotModulationTarget`/`getGlobalModulationTarget`/`ModulationTarget` grepped directly) rather than a re-derivation from memory, per the task's own stated verification method.

  **Placement:** new `## LFO Modulation` section inserted after `## Signal Graph` (readers already understand the per-robot bus + global FX chain before learning how LFO taps into both) and before `## Note Resolution Pipeline`. "Related references" at the top gets a self-link (`#lfo-modulation`) rather than a separate-file link, since this phase documents LFO inline rather than in its own guide.

  **Acceptance criteria:**
  - [x] New "LFO Modulation" section added, cross-linked from the existing "Related references" list at the top of the doc.
  - [x] Documents the Phase/pulseWidth divergences explicitly (not glossed over) — plus a third, related divergence surfaced by the same verification pass: `chorus.delayTime` is also never connectable (`Tone.Chorus.delayTime` is a plain number, not a Signal), documented alongside the other two rather than only mentioning the two the task text names.
  - [x] Documents the global-chain seed-from-planet-map behavior added in Phase 2 — and draws the distinction the task text doesn't spell out but the doc needs to be honest about: seeded global-chain *effect values* (Task 4-6) vs. **not** seeded global-chain *LFO settings* (out of scope this phase, falls back to `DEFAULT_LFO_SETTINGS` like any unconfigured target).

  **Verification:**
  - [x] Manual review — every documented function signature spot-checked against the actual source, not reconstructed from memory.
  - [x] `npm run build:types`, `npm run lint`, full suite (36 files, 562/562 — unchanged, as expected for a docs-only change), `npm run build` all clean.

  **Dependencies:** Task 14.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] All acceptance criteria across all 15 tasks are met — including Task 14's audible check, confirmed by the user directly in the running app ("I hear the LFO effects!").
- [x] `docs/AUDIO_SYSTEM.md` reflects the shipped API — every signature spot-checked against source, not reconstructed from memory.
- [ ] Ready for human review / PR — code is uncommitted, per the standing policy for this task list (commit only when explicitly told).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Phase-modulation polling fallback (Task 12) is genuinely novel — no existing pattern in the codebase to copy | Medium — could blow past a single session, could introduce timing bugs | Isolated to one task with explicit acceptance criteria; built after the simpler connect paths (Gain/Detune/global) are proven, so the pattern is validated before the hard case |
| `AudioEngine.ts` is already a large, intricate file (1000+ lines) — Tasks 9/10 add more surface | Medium — merge/readability risk | Split into two tasks by subsystem (robot voices vs. global chain) rather than one large task; both are additive getters, not restructuring |
| Up to 156 possible concurrent `Tone.LFO` nodes if every target were bound at once | Low this phase (no UI to trigger mass binding) but real once Phase 9 (Robot Options UI) lands | Lazy instantiation (Task 11) means the ceiling is never approached without deliberate testing; revisit sizing when UI work begins |
| Seed range table (Task 4) silently drifts from Tone.js's actual internal clamping if Tone.js version changes | Low | Table is checked into the plan/code as an explicit, reviewable artifact, not buried in logic — a version bump review can diff it directly |

## Open Questions

None remaining from the spec — all four items in spec §7 are resolved into concrete tasks above (Task 12 for §7.1, Task 1–3 for §7.2, Task 4 for §7.3, and the Risks table above for §7.4's instance ceiling, deferred by design to when UI lands).
