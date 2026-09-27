# Implementation Plan: LFO Modulation Engine — Stacked LFO Drift (Roadmap Phase 10.2)

Source spec: [docs/specs/LFO_DRIFT.md](../specs/LFO_DRIFT.md). Source intent: [docs/intent/lfo-drift.md](../intent/lfo-drift.md).

## Overview

Add one global, planet-seeded "Drift" control (Rate Drift, Depth Drift — both bipolar) to the Audio Rig drawer, backed by a fixed pool of 8 shared hidden secondary oscillators in `lfoEngine.ts` that subtly wander every currently-connected primary `Tone.LFO`'s own rate/depth. No per-target state, no new UI primitive, no changes to Robot Options or Company Options.

## Architecture Decisions

- **Seed plumbing lands first, standalone.** `lfoDrift`'s type, seed ranges, and generation are pure data/config work with no dependency on the engine mechanism that will eventually consume them — building and testing them first (against `DEFAULT_GLOBAL_AUDIO_SETTINGS`/determinism assertions only) de-risks the seeding half independently of the trickier Web Audio graph work.
- **The drift engine mechanism splits into a structural task and a functional task, both against `lfoEngine.ts`.** Task 4 builds the pool, the deterministic bucket assignment, and the connect/disconnect lifecycle wired into the existing `connectLfoTarget`/`disconnectLfoTarget` choke points — entirely inert (Gains stay at `0`, nothing audible changes). Task 5 adds the actual swing math, the Depth-Drift silence guard, and the two new public setters that make the feature do something. This mirrors how the Phase 0 plan split `lfoEngine.ts` work by sub-concern (its Task 11 core lifecycle vs. Task 12 real signal wiring) rather than landing one large, hard-to-review change.
- **UI schema work is independent of the engine and can run in parallel.** `audioRigConfig.ts`'s new exports only need `types/controls.ts` (unchanged, already exists) — nothing about the drift pool or seeding blocks it.
- **`audioStore.ts` wiring is the single integration point.** It's the only task that depends on both the seeding half (Task 1, for the `lfoDrift` type) and the engine half (Task 5, for the setters it calls) — sequencing it after both means it never has to stub or guess at either side's final shape.
- **Docs land last**, once the shipped API is real and spot-checkable against source, matching the Phase 0 plan's own Task 15 precedent.

## Dependency Graph

```
Task 1 (types/globalAudio.ts: lfoDrift field)
    │
    ├──→ Task 2 (seed range + loading range tables)
    │         │
    │         └──→ Task 3 (globalAudioSeed.ts: sample the 2 new fields)
    │
    └──→ Task 7 (audioStore.ts wiring) ←── Task 5 ←── Task 4 (lfoEngine.ts: pool + attach/detach)
                    │
Task 6 (audioRigConfig.ts: new schemas — no dependencies, parallel to 1-5)
    │
    └──→ Task 8 (AudioRigDrawer.tsx) ←── Task 7

Task 3, Task 8 ──→ Task 9 (docs/AUDIO_SYSTEM.md)
```

## Task List

### Phase 1: Seed plumbing

- [x] **Task 1: `types/globalAudio.ts` — add `lfoDrift`**

  **Description:** Add `lfoDrift: { rateDrift: number; depthDrift: number }` to `GlobalAudioSettings`, and `lfoDrift: { rateDrift: 0, depthDrift: 0 }` to `DEFAULT_GLOBAL_AUDIO_SETTINGS`, per spec §4.

  **Acceptance criteria:**
  - [x] `GlobalAudioSettings.lfoDrift` exists with both fields typed `number`.
  - [x] `DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift` is `{ rateDrift: 0, depthDrift: 0 }`.
  - [x] No existing consumer of `GlobalAudioSettings`/`DEFAULT_GLOBAL_AUDIO_SETTINGS` breaks (a new required field on an interface can break any object-literal consumer that isn't spreading the default).

  **Verification:**
  - [x] `npm run build:types` clean — this is what surfaces any literal `GlobalAudioSettings` object elsewhere in `src/` that doesn't yet include `lfoDrift`.
  - [x] `npx vitest run src/types/globalAudio.test.ts` (if the file exists) passes with a new assertion that `DEFAULT_GLOBAL_AUDIO_SETTINGS.lfoDrift` is present and zeroed.

  **Dependencies:** None.

  **Files:** `src/types/globalAudio.ts`, `src/types/globalAudio.test.ts` (if it exists)

  **Estimated scope:** XS (1 file, an interface field + a default value)

- [x] **Task 2: Seed range + loading range tables**

  **Description:** Add `'lfoDrift.rateDrift'`/`'lfoDrift.depthDrift'` to `GlobalAudioSeedFieldKey`, with `{ min: -1, max: 1, scale: 'linear' }` entries in `GLOBAL_AUDIO_SEED_RANGES`, and a narrower loading-window pair in `GLOBAL_AUDIO_LOADING_RANGES` (spec §7 proposes `-0.4..0.4` as a first-pass default — not sourced from `GLOBAL_CHAIN_GRID.md`, which predates this feature and has no Drift row; confirm or adjust during this task, don't treat it as settled).

  **Acceptance criteria:**
  - [x] `GlobalAudioSeedFieldKey` includes both new keys.
  - [x] `GLOBAL_AUDIO_SEED_RANGES` has both keys at the full `-1..1` bipolar range.
  - [x] `GLOBAL_AUDIO_LOADING_RANGES` has both keys at a narrower sub-window inside `-1..1`.
  - [x] Both `Record<GlobalAudioSeedFieldKey, ...>` tables type-check as exhaustive (TypeScript itself enforces this once the union is extended — a missing entry in either table is a compile error, not a runtime surprise).

  **Verification:**
  - [x] `npm run build:types` clean.
  - [x] `npx vitest run src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts` (whichever exist) pass, extended with assertions covering the 2 new keys' bounds.

  **Dependencies:** None (does not require Task 1 — `GlobalAudioSeedFieldKey` is its own string-literal union, not derived from `GlobalAudioSettings`'s keys).

  **Files:** `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioSeedRanges.test.ts`, `src/data/globalAudioLoadingRanges.ts`, `src/data/globalAudioLoadingRanges.test.ts`

  **Estimated scope:** S (2 files + tests, table entries only)

- [x] **Task 3: `globalAudioSeed.ts` — sample `lfoDrift`**

  **Description:** In `generateGlobalAudioSettings`, add a `lfoDrift: { rateDrift: sampleField(noiseMap, 'lfoDrift.rateDrift'), depthDrift: sampleField(noiseMap, 'lfoDrift.depthDrift') }` block, using the existing `sampleField` helper unchanged.

  **Acceptance criteria:**
  - [x] `generateGlobalAudioSettings(planetId, planetName)`'s return value includes a fully-populated `lfoDrift`.
  - [x] Same `(planetId, planetName)` input always produces identical `lfoDrift` output (determinism, matching every other field's existing coverage).
  - [x] Different planet names produce different `lfoDrift` values (non-degenerate).
  - [x] Both values fall within the Task 2 loading range on every call.

  **Verification:**
  - [x] `npx vitest run src/utils/globalAudioSeed.test.ts` passes, including new determinism/non-degeneracy/bounds assertions for `lfoDrift`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1, Task 2.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`

  **Estimated scope:** S (one new block in an existing function)

### Checkpoint: Seed plumbing
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] `generateGlobalAudioSettings` for two different planet names produces two different, in-range `lfoDrift` pairs.
- [ ] Review with human before proceeding.

---

### Phase 2: Drift engine core

- [x] **Task 4: `lfoEngine.ts` — drift oscillator pool + connect/disconnect lifecycle (structural, inert)**

  **Description:** Add the fixed pool of 8 shared secondary `Tone.LFO`s (lazy construction, evenly-spread fixed phase offsets, `0.03`Hz), the deterministic `alea()`-based bucket assignment per instance key, and `attachDrift`/`detachDrift` wired into the existing `connectLfoTarget`/`disconnectLfoTarget` — creating per-primary rate-drift and depth-drift `Gain` nodes and connecting them through the `Signal.override`-safe pattern `connectLfoTarget` already uses for its own connections. Both Gains stay at `0` this task — no swing math yet, nothing audible changes. Per spec §3, `layerN.phase` targets (no live Signal) are explicitly excluded — `attachDrift` is never called from that branch.

  **Acceptance criteria:**
  - [x] No pool oscillator is constructed until the first successful `connectLfoTarget` call for any target.
  - [x] The pool never exceeds 8 oscillators regardless of how many primaries connect.
  - [x] The same instance key always maps to the same pool bucket across repeated calls within a session.
  - [x] A successfully-connected primary gets its own rate-drift and depth-drift `Gain` nodes, both initialized to `0` and connected to its `frequency`/`amplitude` via the override-disable-then-restore sequence.
  - [x] `disconnectLfoTarget` tears down a primary's drift link entirely (both Gains disconnected, the link removed) without disposing the shared pool oscillators.
  - [x] `connectLfoTarget('layerN.phase', …)` does not create a drift link.
  - [x] Every existing `lfoEngine.test.ts` test still passes unmodified — this task adds behavior, it doesn't change any existing primary-to-target connection behavior.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` passes, including new coverage for lazy pool construction, bucket determinism (same key → same bucket, a representative spread of keys → not all landing on one bucket), Gain creation/connection on connect, teardown on disconnect, and the phase-target exclusion.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual/no-op check: with this task alone shipped, the app's audible behavior is unchanged (both drift Gains are always `0`).

  **Dependencies:** None (does not require Phase 1 — the pool mechanism itself has no dependency on `GlobalAudioSettings` or seeding).

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** M (1 file, new pool/lifecycle logic, no swing math yet)

- [x] **Task 5: `lfoEngine.ts` — swing math, silence guard, and global setters (functional)**

  **Description:** Add `refreshRateDriftGain`/`refreshDepthDriftGain` (using `centeredSwingFromRange` against `{LFO_RATE_MIN, LFO_RATE_MAX}` and `{0, 1}` respectively), the Depth Drift silence guard (disconnect — not zero — the depth-drift Gain whenever a primary's own depth is `0`; reconnect when depth rises above `0`), and the exported `setGlobalRateDrift`/`setGlobalDepthDrift` functions that update module-scope state and refresh every linked primary. Wire `refreshRateDriftGain`/`refreshDepthDriftGain` into the existing `setLfoRate`/`setLfoDepth` so a primary's own rate/depth changes keep its swing current.

  **Acceptance criteria:**
  - [x] A primary's rate-drift swing is bounded by its own current rate's distance to `LFO_RATE_MIN`/`LFO_RATE_MAX` — a primary near either edge gets a smaller swing than one at the domain's midpoint, for the same global `rateDrift` value.
  - [x] `setGlobalRateDrift`/`setGlobalDepthDrift` update every currently-linked primary's corresponding Gain, and are safe no-ops with zero primaries connected.
  - [x] A primary with depth `0` has its depth-drift Gain disconnected (not merely zeroed); raising that primary's depth above `0` reconnects it and immediately reflects the current global `depthDrift` value.
  - [x] `setLfoRate`/`setLfoDepth` on a target with no drift link yet (never connected) do not throw and do not create a drift link as a side effect.

  **Verification:**
  - [x] `npx vitest run src/engine/lfoEngine.test.ts` passes, including the swing-bound assertion, the silence-guard connect/disconnect assertion (both directions), `setGlobalRateDrift`/`setGlobalDepthDrift` reaching every linked primary, and the no-link-yet no-throw case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoEngine.test.ts`

  **Estimated scope:** M (extends Task 4's file with the highest-risk logic in this plan — the silence guard and the swing math)

### Checkpoint: Drift engine core
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [x] A test-level check confirms: connect a primary, call `setGlobalRateDrift(1)`, its rate-drift Gain is nonzero; set that primary's own depth to `0`, its depth-drift Gain is disconnected even with `setGlobalDepthDrift(1)` active.
- [ ] Review with human before proceeding.

---

### Phase 3: UI schema (parallelizable with Phase 2)

- [x] **Task 6: `audioRigConfig.ts` — Drift accordion schemas**

  **Description:** Add `LFO_DRIFT_ACCORDION`, `LFO_RATE_DRIFT_SCHEMA`, `LFO_DEPTH_DRIFT_SCHEMA` as standalone exports (both sliders `SliderCenteredZeroSchema`, `-100..100`, unit `'%'`), following `DECAY_MODE_SCHEMA`'s existing "global chain-level, not nested inside any effect block" precedent. Not added to `AUDIO_RIG_CONFIG`'s array.

  **Acceptance criteria:**
  - [x] `LFO_DRIFT_ACCORDION` is a valid `AccordionSchema`.
  - [x] `LFO_RATE_DRIFT_SCHEMA`/`LFO_DEPTH_DRIFT_SCHEMA` are both `sliderCenteredZero` schemas with `min: -100, max: 100, unit: '%'`.
  - [x] None of the three new exports are added to `AUDIO_RIG_CONFIG`'s array (it isn't the right shape — `AudioRigEffectBlock` requires a matching `GlobalAudioSettings` effect key, which `lfoDrift` is not).

  **Verification:**
  - [x] `npx vitest run src/data/audioRigConfig.test.ts` passes, including new direct assertions on the three schemas' shape/bounds; the file's existing closed-set coverage assertion over `AUDIO_RIG_CONFIG`'s own params is unaffected.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/data/audioRigConfig.ts`, `src/data/audioRigConfig.test.ts`

  **Estimated scope:** XS (3 small const exports)

### Checkpoint: UI schema
- [x] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Review with human before proceeding (can happen in parallel with the Phase 2 checkpoint).

---

### Phase 4: Store and drawer wiring

- [x] **Task 7: `audioStore.ts` — wire `lfoDrift`**

  **Description:** Extend `EffectKey`'s `Exclude` to also exclude `'lfoDrift'`; add a bespoke `setGlobalLfoDrift` action (shaped like the existing `setCompressorBeforeDelay`, not routed through `GLOBAL_SETTER`) that updates `globalAudio.lfoDrift` in the store and calls `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift`; extend `applyGlobalAudioToEngine` to push `globalAudio.lfoDrift` through those same two engine setters.

  **Acceptance criteria:**
  - [x] `EffectKey` no longer includes `lfoDrift` — `GLOBAL_SETTER`/`BYPASS_KEY`'s `Record<EffectKey, …>` literals still type-check without an `lfoDrift` entry.
  - [x] `setGlobalLfoDrift({ rateDrift: x })` updates `globalAudio.lfoDrift.rateDrift` in the store and calls `lfoEngine.setGlobalRateDrift(x)`; same for `depthDrift`/`setGlobalDepthDrift`. Passing only one field leaves the other field's stored value and engine setter untouched.
  - [x] `applyGlobalAudioToEngine(globalAudio)` calls both `lfoEngine.setGlobalRateDrift`/`setGlobalDepthDrift` with `globalAudio.lfoDrift`'s current values, alongside its existing per-effect calls.

  **Verification:**
  - [x] `npx vitest run src/stores/audioStore.test.ts` passes, including new coverage for `setGlobalLfoDrift` (both fields, independently and together) and `applyGlobalAudioToEngine`'s new calls (spy on `lfoEngine`).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (the `lfoDrift` type), Task 5 (the engine setters this calls must exist).

  **Files:** `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`

  **Estimated scope:** S (1 file, one new action + one extended function)

- [x] **Task 8: `AudioRigDrawer.tsx` — render the Drift accordion**

  **Description:** Add a new accordion section, sibling to the existing `AUDIO_RIG_CONFIG.map(...)` block (not nested inside any effect's own accordion), rendering `LFO_RATE_DRIFT_SCHEMA`/`LFO_DEPTH_DRIFT_SCHEMA` via `SliderCenteredZero`, wired to `globalAudio.lfoDrift`/`setGlobalLfoDrift` with the existing `%`-to-fraction conversion (`value * 100` / `v / 100`) matching how Depth's own UI-to-engine mapping already works elsewhere in this file. Disabled whenever `globalBypass` is on, matching every other block.

  **Acceptance criteria:**
  - [x] The Drift accordion renders with two `SliderCenteredZero` controls, both showing the current `globalAudio.lfoDrift` values as a `-100..100` percent.
  - [x] Dragging either slider calls `setGlobalLfoDrift` with the dragged value divided by 100.
  - [x] The accordion's controls are `disabled` when `globalAudio.globalBypass` is `true`, matching `rigDisabled`'s existing use across every other block.

  **Verification:**
  - [x] `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx` passes, including new coverage for the Drift accordion's presence, its value display, its `onChange` → `setGlobalLfoDrift` wiring (with the `/100` conversion asserted explicitly, not just "called"), and the `rigDisabled` case.
  - [x] `npm run build:types`, `npm run lint` clean.
  - [ ] Manual check: `npm run dev`, open the Audio Rig, confirm a "Drift" accordion appears with Rate Drift / Depth Drift sliders that move and persist.

  **Dependencies:** Task 6, Task 7.

  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/components/panels/screen/console/AudioRigDrawer.test.tsx`

  **Estimated scope:** S (1 file, one new JSX block following an existing pattern)

### Checkpoint: Feature complete
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Manual/audible check (spec §5): a freshly-seeded planet's Drift accordion starts at a nonzero-but-modest position; raising Depth Drift on an already-audible LFO makes its modulation audibly wander rather than loop identically; setting that same target's own Depth to `0` and raising Depth Drift produces no sound from it.
- [ ] Review with human before proceeding.

---

### Phase 5: Docs

- [ ] **Task 9: `docs/AUDIO_SYSTEM.md` — extend "LFO Modulation"**

  **Description:** Extend the existing "LFO Modulation" section with the shared-pool signal graph (8 phase-offset secondary LFOs → per-primary rate/depth Gain attenuators → each active primary's `frequency`/`amplitude`), the swing math, the Depth Drift silence guard, and the new `setGlobalRateDrift`/`setGlobalDepthDrift`/`setGlobalLfoDrift` API — spot-checked against the shipped source, not reconstructed from memory, matching the Phase 0 plan's own Task 15 verification method.

  **Acceptance criteria:**
  - [ ] The signal graph, swing math, and silence guard are documented in prose, cross-linked from the doc's existing "Related references" list if applicable.
  - [ ] Every documented function signature (`setGlobalRateDrift`, `setGlobalDepthDrift`, `setGlobalLfoDrift`) matches the actual shipped source exactly.

  **Verification:**
  - [ ] Manual review — every documented signature spot-checked directly against `lfoEngine.ts`/`audioStore.ts`'s final shipped code.
  - [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (docs-only change, no behavioral impact expected).

  **Dependencies:** Task 3, Task 8 (documents the final shipped shape of both halves).

  **Files:** `docs/AUDIO_SYSTEM.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] All acceptance criteria across all 9 tasks are met.
- [ ] `docs/AUDIO_SYSTEM.md` reflects the shipped API.
- [ ] Ready for human review / PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The `Signal.override`/`Param`-reset bug (spec §1.4) is easy to reproduce if Task 4's connections don't reuse `connectLfoTarget`'s existing fix exactly | High if missed — a filter/EQ target could step to an invalid value the instant drift attaches | Task 4's acceptance criteria explicitly requires the override-disable-then-restore sequence; test coverage asserts the destination's value survives the connection, not just that `.connect()` was called |
| The Depth Drift silence guard (Task 5) is the highest-risk logic in this plan — a bug here directly violates a confirmed, deliberate design decision | Medium — a "silenced" LFO briefly audible from global drift alone would be a real, confirmed-against-intent regression | Isolated to its own acceptance criteria and test cases (both directions: depth drops to 0 mid-session, depth rises from 0 mid-session), not folded silently into a broader "drift works" test |
| `GLOBAL_AUDIO_LOADING_RANGES`'s new `-0.4..0.4` window (Task 2) is a first-pass default with no `GLOBAL_CHAIN_GRID.md` row to source from | Low-medium — could ship inaudible or overbearing on some planets | Flagged explicitly in the spec and this plan; the Phase 4 checkpoint's manual/audible check is the place to catch and adjust it before merge |
| Pool size of 8 (Tasks 4-5) is the interview's own confirmed number, not independently re-derived | Low | If Implement finds it audibly insufficient or unnecessarily costly, that's a number to revisit with the user, not change unilaterally (spec §7) |

## Open Questions

Carried forward from spec §7, not blocking this plan:

1. **`GLOBAL_AUDIO_LOADING_RANGES`'s exact loading window** (Task 2) — confirm or adjust during the Phase 4 manual/audible check, not before.
2. **`layerN.phase` targets stay excluded from drift** (Task 4) — whether this exclusion is permanent or a later phase's job is not decided here.
3. **The pre-existing robot-level LFO priming gap** (spec §1.5) is out of scope for every task above — noted so Task 4/5's test assumptions don't accidentally depend on it being fixed.
