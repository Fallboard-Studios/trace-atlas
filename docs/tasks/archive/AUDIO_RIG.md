# Implementation Plan: Audio Rig (Roadmap Phase 4)

Source spec: [docs/specs/AUDIO_RIG.md](../specs/AUDIO_RIG.md). Source intent: [docs/intent/audio-rig.md](../intent/audio-rig.md).

## Overview

Turn the Audio Rig hub tile from a placeholder into a live console: data-drive all 7 global effect blocks from `GLOBAL_CHAIN_GRID.md`, wire every control through to the already-built `AudioEngine`/`lfoEngine` surface (not just Zustand), add real per-effect and rig-wide bypass with visual+functional disabling, and seed global LFO settings (including `active`) per planet so a freshly loaded planet can already be audibly modulating. Verification is unit tests plus a manual/audible check at the end — the same two-tier pattern `LFO_INTEGRATION_PLAN.md` used.

## Architecture Decisions

- **Foundations before wiring before UI, same ordering principle as the LFO Integration plan.** `audioRigConfig.ts` (pure data), the 4 primitive `disabled` prop additions, and `generateGlobalLfoSettings` (pure function) share no dependencies on each other or on anything new — they're Phase 1, buildable and independently testable in any order or in parallel. `audioStore.ts`'s extension is Phase 2, depending only on Phase 1's seed function. The drawer is Phase 4, the last thing that needs everything below it finished.
- **`audioStore.ts`'s extension is two tasks, not one.** The non-LFO half (`setGlobalAudio` pushing to `AudioEngine`, `setEffectEnabled`, `setGlobalBypassEnabled`) needs nothing this plan hasn't already got — it's wiring against setters that have existed since Phase 0. The `globalLfo` half (state slice, `setGlobalLfo`, planet-sync seeding+connecting) needs `generateGlobalLfoSettings` to exist first. Splitting means the first half can start immediately without waiting on the seed function, mirroring how the LFO plan split `AudioEngine.ts`'s two getters (Tasks 9/10) by subsystem rather than bundling them.
- **The seeded-active-LFO transport gap gets its own task, not a footnote.** Spec §7.2 flags that `lfoEngine.start()` no-ops before the transport runs, so a planet seeded with `active: true` targets would connect but stay silent until something re-triggers `start()` post-transport-start. `AudioEngine.start()` already reads a Zustand store directly in its own body (`useLocaleStore.getState().setLocaleData(...)`), so Task 9 adds the same pattern for `useAudioStore.getState().globalLfo` — resolved here, not left for implementation to improvise.
- **`generateGlobalLfoSettings`'s `active` seeding probability is decided now, not left at the spec's placeholder.** Spec §7.3 flagged `activeT >= 0.5` (a flat 50/50 per target) as unconfirmed, noting 9 independent coin-flips at 50% would load most planets with several concurrently-modulating effects. Resolved here the same way the LFO plan's Task 4 resolved its own open seed-range question during planning: **`activeT >= 0.8`** (a 20% per-target chance), so a typical planet seeds roughly 1–2 active LFOs out of 9, not 4–5 — enough to make "already modulating on load" a real, noticeable, occasional event rather than the default state of every planet. Documented in Task 6's acceptance criteria, not silently chosen mid-implementation.
- **The drawer splits into "bypass + params" and "nested LFO," not one task.** Both touch the same 3 files (`AudioRigDrawer.tsx`/`.css`/`.test.tsx`), so this isn't a dependency split — it's an acceptance-criteria split. Bundling "7 accordions render + both bypass levels disable correctly + all 9 LFO accordions wire correctly" into one task's criteria would blow past the "3 or fewer bullet points" sizing guideline; splitting means each task has a tight, independently-verifiable criteria list, and the first half is a complete, demoable slice (a working bypass-capable rig with no modulation yet) before the second half lands.
- **Doc fixes land last, but aren't blocked on everything.** `roadmap.md`'s stale-framing fix has no code dependency at all and could technically move earlier; it's sequenced last because it's a wrap-up note about the whole phase, not because anything requires it. `AUDIO_SYSTEM.md`'s fix genuinely does depend on Task 8/9 (it's documenting behavior that doesn't exist until then).

## Dependency Graph

```
Task 1 (audioRigConfig.ts)                         ─┐
Task 2 (SliderLinear disabled)                       │
Task 3 (SliderLog disabled)                          ├──→ Task 10 (Drawer: bypass + params)
Task 4 (SliderCenteredZero disabled)                 │            │
Task 5 (Toggle disabled)                            ─┘            │
Task 6 (generateGlobalLfoSettings)                                │
    │                                                              │
    ├──→ Task 8 (audioStore: globalLfo + setGlobalLfo + seeding)   │
    │            │                                                 │
    │            ├──→ Task 9 (AudioEngine.start() LFO retrigger)   │
    │            │                                                 │
    │            └─────────────────────────→ Task 11 (Drawer: nested LFO accordions)
    │                                                 │
Task 7 (audioStore: setGlobalAudio/enable/bypass) ────┘
    │
    └──────────────────────────────────────────────→ Task 10

Task 11 ──→ Task 12 (ConsolePanel wiring)
                    │
                    ├──→ Task 13 (roadmap.md doc-fix)
Task 9 ─────────────┴──→ Task 14 (AUDIO_SYSTEM.md doc-fix)
```

## Task List

### Phase 1: Independent foundations

- [x] **Task 1: `src/data/audioRigConfig.ts` — effect block schemas** — done

  **Description:** Define `AudioRigEffectBlock`/`AudioRigParamSchema` and the `AUDIO_RIG_CONFIG` array covering all 7 effects (Compressor, EQ3, Filter LPF, Filter HPF, Chorus, Delay, Reverb), per spec §4. Every `loreLabel`/`humanLabel`/unit/min/max/default traces to a specific `GLOBAL_CHAIN_GRID.md` row — no invented copy. The 9 grid-flagged rows carry `lfoTarget`/`lfoAccordion`.

  **Acceptance criteria:**
  - [x] All 7 effects present, each with an `accordion` schema, an `enabledSchema`, and every param row the grid lists for that effect (24 params total).
  - [x] Every param's `schema.type` matches the grid's UI column (`SLIDER` → `sliderLinear`, `SLIDER (Logarithmic)` → `sliderLog`, `SLIDER (Center-Zero)` → `sliderCenteredZero`, `STEPPER` → `stepper`).
  - [x] Exactly the 9 grid-flagged (`LFO?: X`) rows carry a `lfoTarget` that's a valid `GlobalLfoTargetId`, plus an `lfoAccordion` schema.
  - [x] Param `schema.id`s match `GlobalAudioSettings`' own field paths (e.g. `'filterLPF.frequency'`, not the `lpf.frequency` short form).

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts` — 35/35 passing, every row spot-checked against `GLOBAL_CHAIN_GRID.md` (label/unit/range/default), not just a count assertion. Includes an explicit check that `reverb.dampening` is NOT LFO-flagged despite being a log-scaled Hz field like the LFO-flagged filter frequencies (easy to miscopy).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** M (1 new file, 7×~3-4 params each, but pure data)

- [x] **Task 2: `SliderLinear` — add `disabled` prop** — done

  **Description:** Add optional `disabled?: boolean` (default `false`), passed through to Radix `Slider.Root`'s own `disabled` prop. Purely additive.

  **Acceptance criteria:**
  - [x] `disabled` prop threads to `Slider.Root disabled={disabled}`.
  - [x] Omitting the prop behaves exactly as before (default `false`).
  - [x] A disabled slider doesn't call `onChange` on interaction attempts.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx` — 8/8 passing (5 prior unchanged + 3 new: default-not-disabled, data-disabled/tabindex when disabled, onChange doesn't fire on a disabled keyboard step attempt).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/SliderLinear.tsx`, `src/components/ui/controls/SliderLinear.test.tsx`

  **Estimated scope:** XS

- [x] **Task 3: `SliderLog` — add `disabled` prop** — done

  **Description:** Same as Task 2, for `SliderLog`.

  **Acceptance criteria:**
  - [x] `disabled` prop threads to `Slider.Root disabled={disabled}`.
  - [x] Omitting the prop behaves exactly as before.
  - [x] A disabled slider doesn't call `onChange` on interaction attempts.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderLog.test.tsx` — 13/13 passing (10 prior unchanged + 3 new, same shape as Task 2).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/SliderLog.tsx`, `src/components/ui/controls/SliderLog.test.tsx`

  **Estimated scope:** XS

- [x] **Task 4: `SliderCenteredZero` — add `disabled` prop** — done

  **Description:** Same as Task 2, for `SliderCenteredZero`. Its custom zero-anchored fill (`sliderCenteredZeroMath.ts`) is untouched — only the `disabled` passthrough is new.

  **Acceptance criteria:**
  - [x] `disabled` prop threads to `Slider.Root disabled={disabled}`.
  - [x] Omitting the prop behaves exactly as before, including the existing zero-anchored fill rendering.
  - [x] A disabled slider doesn't call `onChange` on interaction attempts.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/SliderCenteredZero.test.tsx` — 14/14 passing (9 prior unchanged + 5 new, including an explicit check that the zero-anchored fill's computed left/width are unaffected by `disabled`).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/SliderCenteredZero.tsx`, `src/components/ui/controls/SliderCenteredZero.test.tsx`

  **Estimated scope:** XS

- [x] **Task 5: `Toggle` — add `disabled` prop** — done

  **Description:** Add optional `disabled?: boolean` (default `false`), passed through to Radix `Switch.Root`'s own `disabled` prop.

  **Acceptance criteria:**
  - [x] `disabled` prop threads to `Switch.Root disabled={disabled}`.
  - [x] Omitting the prop behaves exactly as before.
  - [x] A disabled toggle doesn't call `onChange` on interaction attempts.

  **Verification:**
  - [x] `npx vitest run src/components/ui/controls/Toggle.test.tsx` — 11/11 passing (8 prior unchanged + 3 new). Radix `Switch.Root` renders as a native `<button>` with the `disabled` HTML attribute spread directly — verified via `.disabled` on the element rather than a jest-dom matcher (`@testing-library/jest-dom` is installed but not registered anywhere in this codebase's test setup; not wired in here either, to avoid an unrelated setup change).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/components/ui/controls/Toggle.tsx`, `src/components/ui/controls/Toggle.test.tsx`

  **Estimated scope:** XS

- [ ] **Task 6: `src/utils/globalAudioSeed.ts` — `generateGlobalLfoSettings`**

  **Description:** Implement `generateGlobalLfoSettings(planetId, planetName): Record<GlobalLfoTargetId, LfoSettings & { active: boolean }>`, sampling the planet noise map via `getSeededVal`, one call per field per target (`rate`/`depth`/`shape`/`active`), dot-namespaced as `` `globalLfo.${target}.${field}` ``. Reuses `LFO_RATE_MIN/MAX`, `LFO_DEPTH_MIN/MAX`, `LFO_SHAPES` from `src/types/lfo.ts` — no new range table. `active` resolves `activeT >= 0.8` per this plan's Architecture Decisions (≈20% chance per target, not the spec's 50% placeholder).

  **Acceptance criteria:**
  - [ ] Returns a fully-populated record for all 9 `GlobalLfoTargetId`s.
  - [ ] Same `(planetId, planetName)` input always produces identical output (determinism).
  - [ ] `rate`/`depth` stay within `LFO_RATE_MIN/MAX`/`LFO_DEPTH_MIN/MAX`; `shape` is always a valid `LfoShape`.
  - [ ] `active` uses the `>= 0.8` threshold; across a sample of differently-seeded planets, `active` is `true` for roughly 1-in-5 targets, not roughly half.

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts` — determinism, bounds, threshold behavior (statistical spot-check across several seeded planets, matching `globalAudioSeed.test.ts`'s existing non-degeneracy style).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** M (1 modified file + test, 9-target mapping)

### Checkpoint: Independent foundations
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean — full suite 62 files, 766/766 passing.
- [x] `audioRigConfig.ts`'s data is spot-checked against `GLOBAL_CHAIN_GRID.md` by a human, not just by its own test.
- [x] Review with human before proceeding.

---

### Phase 2: Store wiring

- [ ] **Task 7: `audioStore.ts` — push `setGlobalAudio` to `AudioEngine`, add bypass actions**

  **Description:** Add the `GLOBAL_SETTER`/`BYPASS_KEY` maps from spec §4. Extend `setGlobalAudio` to call the matching `AudioEngine.setGlobal*` setter after updating state. Add `setEffectEnabled(effect, enabled)` (updates state, calls `AudioEngine.setEffectBypass(BYPASS_KEY[effect], enabled)`) and `setGlobalBypassEnabled(bypass)` (updates state, calls `AudioEngine.setGlobalBypass(bypass)`). Per spec §3: `EffectKey` naming stays `GlobalAudioSettings`' own field names throughout — only `BYPASS_KEY`'s values use the `'lpf'`/`'hpf'` short form, matching `BYPASS_EFFECT_KEYS`'s existing convention.

  **Acceptance criteria:**
  - [ ] `setGlobalAudio(effect, partial)` updates `globalAudio` state **and** calls the matching `GLOBAL_SETTER[effect]` with `partial`.
  - [ ] `setEffectEnabled(effect, enabled)` updates that effect's `enabled` field and calls `AudioEngine.setEffectBypass` with the correct short-form key.
  - [ ] `setGlobalBypassEnabled(bypass)` updates `globalBypass` and calls `AudioEngine.setGlobalBypass(bypass)`.
  - [ ] No behavior change to `regenerateGlobalAudioFromSeed` — it keeps its own existing inline calls.

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts` — extend the existing `vi.mock('../engine/AudioEngine', ...)` to also stub `setEffectBypass`/`setGlobalBypass` (already partially mocked) and assert each new action's call-through.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S

- [x] **Task 8: `audioStore.ts` — `globalLfo` state, `setGlobalLfo`, and seeded planet-sync** — done, plan corrected mid-task

  **Description:** Add `globalLfo: Record<GlobalLfoTargetId, LfoSettings & { active: boolean }>` to `AudioStore`, defaulting from `DEFAULT_LFO_SETTINGS` (with `active: false`) until first seeded. Add `setGlobalLfo(target, value)` per spec §4 — updates state, always calls `lfoEngine.setLfoShape`/`setLfoRate`/`setLfoDepth`, and calls `connectLfoTarget`/`disconnectLfoTarget` (+`stop` when deactivating) based on `value.active`. Extend the existing `usePlanetStore.subscribe`-driven sync (`syncGlobalAudioToCurrentPlanet`) to also call `generateGlobalLfoSettings` and write the result into `globalLfo`.

  **Deviation from plan, found via the Phase 2 checkpoint's full suite run, not assumed:** the original plan (and the spec's own §4 snippet) had planet-sync also directly call `lfoEngine.setLfoShape`/`setLfoRate`/`setLfoDepth` + `connectLfoTarget` for every seeded target, mirroring `regenerateGlobalAudioFromSeed`'s inline-call style. This is unsafe — planet-sync runs at module load / on every planet switch, **before any user gesture**, and `lfoEngine`'s setters unconditionally construct a real `Tone.LFO` node (`getOrCreateLfo` → `new Tone.LFO(...)`) on first call for a target, with no headless/no-context guard the way `AudioEngine`'s own `setGlobal*` methods have. `TransportBar.test.tsx` (imports the real, unmocked `audioStore` module) failed with `param must be an AudioParam` the instant this ran. Fixed by making `regenerateGlobalLfoFromSeed` **data-only** — it writes `globalLfo` state and touches nothing in `lfoEngine`. All lfoEngine priming/connecting moves entirely into Task 9's `AudioEngine.start()`, the only point guaranteed to run after `Tone.start()` succeeds. `setGlobalLfo` (the interactive path) is unaffected and needed no change — the Audio Rig drawer is only reachable after power-on, by which point `AudioEngine.start()` has already resolved (`powerController.start()` awaits it before `uiStore.setPowerOn()`).

  **Acceptance criteria:**
  - [x] `globalLfo` is present in `AudioStore`'s initial state, JSON-serializable.
  - [x] `setGlobalLfo` calls `setLfoShape`/`setLfoRate`/`setLfoDepth` unconditionally, and `connectLfoTarget`+`start` only when `active: true` (and only if `connectLfoTarget` itself returns `true`) / `disconnectLfoTarget`+`stop` only when `active: false`.
  - [x] Planet-sync seeds `globalLfo` for the current planet at module load and on every future planet change, alongside the existing `globalAudio` seeding.
  - [x] ~~Planet-sync calls `connectLfoTarget` for every target seeded `active: true`~~ — superseded by the deviation above: planet-sync calls **no** `lfoEngine` method at all; connecting active-seeded targets is Task 9's job.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` — 26/26 passing. Mocked `lfoEngine` (`setLfoShape`/`setLfoRate`/`setLfoDepth`/`connectLfoTarget`/`disconnectLfoTarget`/`start`/`stop`) alongside the existing `AudioEngine` mock; covers `setGlobalLfo`'s branches (including connect-fails-so-no-start) and an explicit "planet-sync touches no lfoEngine method" regression guard. Noted: the `lfoEngine` mock's call history persists across `vi.resetModules()` (same quirk `LFO_INTEGRATION_PLAN.md`'s Task 11 documented for the Tone mock) — the planet-sync describe block clears mocks in `beforeEach`.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full suite re-run after the fix: `TransportBar.test.tsx` (previously failing) now passes — 62 files, 781/781.

  **Dependencies:** Task 6.

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** M (extends Task 7's file — sequence after it to avoid merge overlap)

### Checkpoint: Store wiring
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `audioStore`'s full new action surface (`setGlobalAudio` push-through, `setEffectEnabled`, `setGlobalBypassEnabled`, `setGlobalLfo`) is covered by tests, mocked against both `AudioEngine` and `lfoEngine`.
- [x] Review with human before proceeding.

---

### Phase 3: Engine lifecycle fix

- [x] **Task 9: `AudioEngine.start()` — prime, connect, and start seeded global LFOs** — done

  **Description (expanded per Task 8's deviation above — this task now owns all of the lfoEngine priming/connecting planet-sync used to do):** After `transport.start()` succeeds, read `useAudioStore.getState().globalLfo` and, for every `GlobalLfoTargetId`: call `lfoEngine.setLfoShape`/`setLfoRate`/`setLfoDepth` (priming lfoEngine's own settings from the seeded state — this is now the *first* time any of them touch lfoEngine at all), then if `active: true`, call `connectLfoTarget` and, only if that returns `true`, `start`. This is the one point guaranteed to run after `Tone.start()` has succeeded, so it's the only safe place to construct the underlying `Tone.LFO` nodes.

  **Real finding, fixed before landing:** a static top-level `import { useAudioStore } from '../stores/audioStore'` in `AudioEngine.ts` broke immediately — `audioStore.ts`'s `GLOBAL_SETTER` (Task 7) reads `AudioEngine.setGlobalCompressor` etc. eagerly at its own module scope, so importing `audioStore.ts` from partway through `AudioEngine.ts`'s own module evaluation handed it a not-yet-fully-formed `AudioEngine` export — threw `Cannot read properties of undefined (reading 'setGlobalCompressor')`. `lfoEngine.ts`'s existing (pre-Task-9) circular import of `AudioEngine` never hit this because it only reads off `AudioEngine` inside function bodies, never at module scope. Fixed with a dynamic `await import('../stores/audioStore')` inside `start()` instead — defers `audioStore.ts`'s evaluation to when `start()` actually runs, by which point the real app has already loaded it through a non-cyclic path (confirmed by a Vite build note: `audioStore.ts` is also statically imported by `TransportBar.tsx`/`powerController.ts`, so the dynamic import is purely an ordering fix, not a code-split).

  **Acceptance criteria:**
  - [x] Every one of the 9 `GlobalLfoTargetId`s gets `setLfoShape`/`setLfoRate`/`setLfoDepth` called with its current `useAudioStore.getState().globalLfo` values, after `transport.start()`, inside `AudioEngine.start()`.
  - [x] Every target with `active: true` additionally gets `connectLfoTarget` called, and `start` only if `connectLfoTarget` returned `true`.
  - [x] No target with `active: false` gets `connectLfoTarget` or `start` called.
  - [x] `AudioEngine.start()`'s existing behavior (instrument loading, beat clock init, reverb-ready wait, `useLocaleStore` measure subscription) is unchanged.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` — 77/77 passing (72 prior unchanged + 5 new). Mocked `../lfoEngine` (module-relative, resolves to the same file `audioStore.ts`'s `'../engine/lfoEngine'` import does) and drove `useAudioStore.setState({ globalLfo: <9-target fixture> })` directly, with a mix of active/inactive targets and one active target (`eq3.mid`) whose `connectLfoTarget` mock returns `false`, to prove `start` is conditioned on a real connect.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [x] Full suite: 62 files, 786/786. `npm run build` clean.
  - [ ] Manual/audible check (paired with Task 12's, not required standalone): a planet seeded with at least one `active: true` global LFO is audibly modulating immediately after pressing power-on, with no control touched. *(Deferred to Task 12 — no UI to power on through yet.)*

  **Dependencies:** Task 8.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

### Checkpoint: Engine lifecycle
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean — full suite 62 files, 786/786.
- [x] Review with human before proceeding. Human noted a general dislike of dynamic imports but accepted the `AudioEngine.start()` dynamic import (line ~497) as the right call for this specific circular-import fix.

---

### Phase 4: Drawer UI

- [x] **Task 10: `AudioRigDrawer.tsx` — 7 accordions, params, bypass (no LFO nesting yet)** — done, one upstream fix along the way

  **Description:** Build `AudioRigDrawer` per spec §4: maps `AUDIO_RIG_CONFIG` to 7 `AccordionContainer`s via `renderParamControl`'s dispatcher (`sliderLinear`/`sliderLog`/`sliderCenteredZero`/`stepper`), each effect's bypass `Toggle` rendered as a sibling row above its `AccordionContainer` (not inside it — spec §3, `AccordionContainer` itself is not modified), plus one rig-wide bypass `Toggle` above all 7. Wires every control to `audioStore`'s `setGlobalAudio`/`setEffectEnabled`/`setGlobalBypassEnabled`. Implements the disabled cascade: effect bypass off → that effect's params disabled; rig-wide bypass on → every effect's own bypass toggle also disabled. No `Lfo` rendering yet — `param.lfoTarget`/`lfoAccordion` are ignored this task.

  **Real findings, both fixed before/while landing:**
  - **Task 1 fix (its own commit):** every effect's `enabledSchema.humanLabel` was the literal string `'Enabled'` — all 7 bypass toggles resolved to the identical accessible name via `resolveAccessibleName`, indistinguishable to a screen reader (and to `getByRole` in this task's own tests). Changed to `` `${effect name} Enabled` `` per block.
  - **Test-fixture bug, caught by the RED→GREEN cycle itself, not the component:** `DEFAULT_GLOBAL_AUDIO_SETTINGS.compressor.enabled` is `false` (only `reverb` defaults `true` — see `src/types/globalAudio.ts`). Three tests initially assumed `compressor.enabled: true` out of the box; fixed the test fixtures, not the component, which was already disabling correctly per the real default.

  **Acceptance criteria:**
  - [x] Renders all 7 accordions with `AUDIO_RIG_CONFIG`'s labels, zero hardcoded display strings.
  - [x] Dragging/toggling a param control calls `setGlobalAudio(block.key, { [field]: value })` with the right effect/field/value.
  - [x] Toggling an effect's own bypass calls `setEffectEnabled` and disables that effect's other param controls (`disabled` prop, from Tasks 2–5).
  - [x] Toggling the rig-wide bypass calls `setGlobalBypassEnabled` and disables all 7 effects' own bypass toggles.
  - [x] Bypass `Toggle`s are labeled per their real polarity (spec §3) — the rig-wide one reads as "Bypass" (ON = silenced), not inverted to match `enabled`'s "ON = audible" polarity.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` — 10/10 passing, covers every bullet above (uses the real `useAudioStore`, no mocking — `AudioEngine`'s `setGlobal*`/`setEffectBypass`/`setGlobalBypass` are all documented no-ops before `buildGlobalFxChain()` has run, so this is safe headless, matching `RobotsTab.test.tsx`'s simpler real-store pattern rather than `audioStore.test.ts`'s mocked one).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2, Task 3, Task 4, Task 5, Task 7.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.css`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`, plus `src/data/audioRigConfig.ts`/`.test.ts` (the Task 1 label fix)

  **Estimated scope:** M (3 files, but the bulk of this phase's UI logic)

- [x] **Task 11: `AudioRigDrawer.tsx` — nested LFO accordions** — done

  **Description:** Extend Task 10's drawer: for every param with `lfoTarget`/`lfoAccordion` set, nest an `AccordionContainer` (the `lfoAccordion` schema) inside that param's row, containing an `Lfo` primitive bound to `globalLfo[param.lfoTarget]`, wired to `setGlobalLfo`. Per spec §3/§7.5: the `Lfo` control is **not** included in the disabled cascade — it stays interactive even when its parent effect is bypassed.

  **Implementation note:** `AccordionContainer` renders its content with Radix's `forceMount` (always in the DOM, visually collapsed via CSS height), so nested `Lfo` controls are queryable in tests without simulating an open click — confirmed directly from `AccordionContainer.tsx`, not assumed.

  **Acceptance criteria:**
  - [x] All 9 `GlobalLfoTargetId`-flagged params render a nested LFO accordion; the other 15 params don't.
  - [x] Each `Lfo`'s value reflects `globalLfo[target]` (seeded shape/rate/depth/active from Task 8, not `DEFAULT_LFO_SETTINGS`).
  - [x] Changing any of `Lfo`'s shape/rate/depth/active calls `setGlobalLfo(target, updatedValue)`.
  - [x] The nested `Lfo` control remains interactive when its parent effect's bypass is off (deliberate, per spec §7.5 — not a bug to fix here).

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` — 15/15 passing (10 prior unchanged + 5 new). `lfoEngine` mocked in this test file too (same reason as `AudioEngine.test.ts`/`audioStore.test.ts` — `setGlobalLfo`'s real implementation constructs a live `Tone.LFO` on first call).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 10, Task 8.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.css`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (extends Task 10's file)

### Checkpoint: Drawer
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean — full suite 63 files, 802/802.
- [x] Every one of the 24 params and 9 LFO accordions has a passing render+interaction test.
- [x] Review with human before proceeding.

---

### Phase 5: Integration

- [x] **Task 12: Wire `AudioRigDrawer` into `ConsolePanel`** — done, manual/audible check deferred to human

  **Description:** Replace `ConsolePanel.tsx`'s `TILE_CONTENT.audioRig` stub `<div>` with `<AudioRigDrawer />`. Update the existing `ConsolePanel.test.tsx` "renders the carried-forward stub content for audioRig" test to assert the drawer renders instead.

  **Test note:** `AudioRigDrawer` is mocked in `ConsolePanel.test.tsx` (a simple `data-testid` stub), matching the file's existing `RobotsTab`/`RobotEditorTab` convention — it has its own full test suite, and this file's own stated scope is ConsolePanel's tile switch, not re-testing tile content.

  **Acceptance criteria:**
  - [x] Selecting the `audioRig` hub tile renders `AudioRigDrawer`, not the stub.
  - [x] Back navigation from the `audioRig` tile still returns to the hub grid (unchanged behavior).
  - [x] No other `TILE_CONTENT` entry changes.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/ConsolePanel.test.tsx` — 8/8 passing (updated stub test + unchanged back-navigation test).
  - [x] `npm run build:types`, `npm run lint`, full suite (63 files, 802/802), `npm run build` all clean.
  - [ ] Manual/audible check: `npm run dev`, power on, open the Audio Rig tile, confirm at least one slider drag is audible, one per-effect bypass audibly silences that effect, the rig-wide bypass audibly silences everything, and (pairing with Task 9's check) a planet seeded with an active LFO is already modulating on load. **Not run this session — no browser/audio-capable environment available; needs a human with speakers.**

  **Dependencies:** Task 11.

  **Files:** `src/components/panels/screen/console/ConsolePanel.tsx`, `src/components/panels/screen/console/ConsolePanel.test.tsx`

  **Estimated scope:** XS

### Checkpoint: Integration complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Full manual/audible check (Task 12) confirmed by a human, not just by tests.
- [ ] Review with human before proceeding.

---

### Phase 6: Docs

- [x] **Task 13: `docs/todo/roadmap.md` — Phase 4 doc-fix** — done

  **Description:** Rewrite Phase 4's "About" paragraph: remove the stale "leaving clean parameter IDs ready for Web Audio setter bindings in subsequent phases" framing (that Web Audio side already existed before this phase started) and add a sentence covering the net-new global LFO seeding this phase added, per spec §7.1.

  **Acceptance criteria:**
  - [x] No remaining claim that Web Audio wiring is deferred to a later phase.
  - [x] Global LFO seeding (`generateGlobalLfoSettings`, seeded `active`) is mentioned.
  - [x] Roadmap's "Create"/"About" structure and surrounding phases are otherwise untouched.

  **Verification:**
  - [x] Manual review — read the updated paragraph against what actually shipped (Tasks 1–12), not against the original spec's plan.

  **Dependencies:** Task 12 (describes the finished phase).

  **Files:** `docs/todo/roadmap.md`

  **Estimated scope:** XS (docs only)

- [x] **Task 14: `docs/AUDIO_SYSTEM.md` — correct the LFO seeding claim** — done

  **Description:** Update the "LFO Modulation § Seeding" section's line stating global-chain `LfoSettings` are "not seed-generated... out of scope for this phase" — they now are, per Task 6/8/9.

  **Acceptance criteria:**
  - [x] The "not seed-generated" claim for global-chain `LfoSettings` is corrected to describe `generateGlobalLfoSettings` and the `active`-seeding behavior.
  - [x] The existing robot-level seeding description (unchanged this phase) is left as-is.

  **Verification:**
  - [x] Manual review — every claim spot-checked against the shipped source (`globalAudioSeed.ts`, `audioStore.ts`), not reconstructed from memory, matching `LFO_INTEGRATION_PLAN.md`'s Task 15 verification style.

  **Dependencies:** Task 9.

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 14 tasks are met, including the manual/audible checks (Tasks 9, 12) confirmed by a human.
- [ ] Both docs (`roadmap.md`, `AUDIO_SYSTEM.md`) reflect the shipped behavior, spot-checked against source.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| `audioStore.ts` becomes a large single file across Tasks 7/8/9's combined surface | Medium — merge/readability risk | Split into two sequential tasks by concern (non-LFO vs. LFO), same pattern `LFO_INTEGRATION_PLAN.md` used for `AudioEngine.ts`'s two getters |
| `AudioRigDrawer.tsx` is the first component this codebase renders from a config array this large (7 effects × up to 5 params × conditional nested accordions) | Medium — could reveal the dispatcher pattern doesn't scale cleanly | Task 10 ships without LFO nesting first, proving the base dispatcher/bypass-cascade pattern before Task 11 adds the more complex nested case |
| `activeT >= 0.8` (Task 6) is a judgment call, not derived from any spec/grid value | Low | Documented with explicit rationale in Architecture Decisions; easy to tune later since it's one constant in one function, not scattered logic |
| Four already-shipped Phase 1 primitives (Tasks 2–5) get touched — regression risk to Phase 1's own shipped behavior | Low | Each task is purely additive (`disabled` prop, defaults `false`), one task per file, existing tests must stay green unmodified |

## Open Questions

None remaining from the spec — all five items in spec §7 are resolved: §7.1 (roadmap wording) → Task 13; §7.2 (transport retrigger seam) → Task 9; §7.3 (active threshold) → Task 6's Architecture Decision; §7.4 (dispatcher exhaustiveness) and §7.5 (LFO controls excluded from disabled cascade) → confirmed as this phase's scope boundaries, not tasks, per the spec's own framing.
