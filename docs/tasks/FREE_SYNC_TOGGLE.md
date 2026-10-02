# Implementation Plan: Free | Sync Toggle

> **Stale against the LFO Bank (2026-10-01) — re-plan before executing any task below.** Every LFO-side task here (at least 1, 4, 5, 9, 12, 13, 15, 16 by name) targets the per-target `lfoEngine.ts`/`Lfo.tsx`/`LfoTargetGroup` surface `docs/tasks/LFO_BANK.md` deleted and replaced with 4 shared lanes (`lfoBank.<lane>.rate`) and per-field `LfoLink`s (`lane`/`depth`, no `rate` of their own). Re-scope the LFO half of this plan to one `sync` flag per lane (wired into `LfoBankLanePanel`, four lanes total) rather than per-field; the Delay Time tasks are untouched by the Bank and can proceed as planned. See the dated note atop `docs/specs/FREE_SYNC_TOGGLE.md`.

Source spec: [docs/specs/FREE_SYNC_TOGGLE.md](../specs/FREE_SYNC_TOGGLE.md). Source intent: [docs/intent/free-sync-toggle.md](../intent/free-sync-toggle.md). Roadmap slot: Phase 33 (added in Task 17).

> Process note: the `planning-and-task-breakdown` skill asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house TDD rhythm: RED test first, one commit per task, mutation-check at the gates named below, stop and report at every checkpoint.

> **Spec §7 item 4 resolved during planning (2026-09-30):** `localeStore`'s initial state already holds `DEFAULT_LOCALE` (`'pelagos-default'`), and `audioStore.ts` imports `localeStore` before its own module-load `syncGlobalAudioToCurrentAttenuationStyle()` runs — so a locale is guaranteed whenever the global seeders run, and `seedBpm` can always be `generateLocaleBpm(locale.id, x, y)`. No fallback tempo, no deferred re-seed. Task 17 amends the spec to say so.

## Overview

Add a per-target Free | Sync (Float | Anchored) toggle to Delay Time and every LFO Rate, storing synced values as a note division + modifier and deriving seconds/Hz from `audioStore.bpm` through pure resolvers, so tempo changes carry synced values and leave Free ones alone. Seventeen tasks in six phases, foundations first: pure data and resolvers (1–3), then the store→engine apply paths so a synced value is *audibly* correct before any UI exists (4–6), then seeding (7–8), then the UI (9–14), then persistence and company broadcast (15–16), then docs (17). The data shape is additive (optional `sync`), so the tree stays green and every old session loads Free at every commit.

## Architecture Decisions

- **Foundations before consumers.** `noteValues.ts` and the resolvers land with no importers (Tasks 1–2), so their tests are the oracle every later task compares against, never a second copy of the math.
- **The seed oracle is captured *before* any seeder changes (Task 3).** There is no snapshot fixture today; without this, "Free output is byte-identical" is unprovable.
- **Store→engine paths migrate before the UI (Phase 2 before Phase 4).** A synced value can be set from a test or the devtools store and heard correct before a single component changes; the UI then only has to produce the right state.
- **Engine additions are two tiny methods (`hasLfo`, `setLfoTempoLocked`) and one drift constant.** The engine never learns what a note value is.
- **Conversions on toggle live with the component that owns the value** (`Lfo.tsx` for LFOs, the Delay branch for Delay) using pure helpers from `utils/tempoSync.ts` — `TempoSyncSlider` stays store-free and tempo-free.
- **`bpm` is threaded as a prop**, never read inside a primitive or composition (COMPONENT_LIBRARY's stateless rule). Five callers subscribe.
- **Company broadcast's removed-key fix is its own task (16)** because it changes `diffCompoundField` for every compound field, not just LFOs.
- **Seeded robot LFOs not reaching the engine at spawn is out of scope** (spec §7.6, Crawford's own follow-up). Task 6's re-apply honours it via `hasLfo`; nothing here primes robots.

## Dependency Graph

```
Task 1 (noteValues: table + math)
    │
    └──→ Task 2 (types: sync fields; utils/tempoSync resolvers + conversions)      Task 3 (seed oracle capture — independent, must precede 7/8)
              │
   ── Checkpoint A ──
              │
Task 4 (lfoEngine hasLfo/setLfoTempoLocked; lfoDrift switch)                      ← 2
    │
    └──→ Task 5 (apply paths: setGlobalLfo, applyLayerLfo, start() priming, delay setter, diagnostics)   ← 2, 4
              │
              └──→ Task 6 (systems/tempoSync reapply + setBPM hook)              ← 4, 5
   ── Checkpoint B ──
Task 7 (global seeders + store callers thread seedBpm)                            ← 1, 2, 3
Task 8 (robot seeder + spawn/baseline/sessionDiff thread seedBpm)                 ← 1, 2, 3
   ── Checkpoint C ──
Task 9  (content entries + formatNoteValue)                                       ← 1
Task 10 (SliderLinearSchema.formatValue + readout)                                 none
Task 11 (TempoSyncSlider composition)                                             ← 9, 10
Task 12 (Lfo.tsx → TempoSyncSlider; bpm prop; LfoTargetGroup forwards)           ← 2, 11
Task 13 (five callers thread bpm)                                                 ← 12
Task 14 (Delay hand-composed branch)                                              ← 5, 11
   ── Checkpoint D (manual UI walk) ──
Task 15 (share-link codec; version-1 payload fixture test)                        ← 2
Task 16 (diffCompoundField removed key + merge-site strip)                        ← 2
Task 17 (docs, roadmap, spec amendment, grid correction)                          ← all
   ── Checkpoint E ──
```

Parallelisable: 1 ‖ 3; 7 ‖ 8; 9 ‖ 10; 15 ‖ 16 (both can start after Checkpoint A if a second session is free).

## Task List

### Phase 1: Foundation — pure data and resolvers, no consumers

- [ ] **Task 1: `src/data/noteValues.ts` — the note-value table and its math**

  **Description:** Create `NoteDivision`/`NoteModifier`/`NoteValue`, the 20-entry `NOTE_VALUES` list (spec §1.2: six divisions × three modifiers, plus 2 and 4 bars straight-only), sorted ascending by beats at module load, and the pure functions `noteValueBeats`, `noteValueSeconds`, `noteValueHz`, `noteValueEquals`, `allowedNoteValues`, `nearestNoteValue`. No Tone, no store, no content import. Nothing imports it yet.

  **Acceptance criteria:**
  - [ ] `NOTE_VALUES` has exactly 20 entries, no duplicates (`noteValueEquals`), strictly ascending `noteValueBeats`; 1/4 triplet precedes 1/8 dotted; `'2'`/`'4'` appear only with `modifier: 'straight'`.
  - [ ] At 60 BPM: 1/4 → 1 s / 1 Hz; 1/8 dotted → 0.75 s; 1/4 triplet → 0.6667 s (±1e-9); 1 bar → 4 s / 0.25 Hz; 4 bars → 16 s / 0.0625 Hz; 1/32 → 0.125 s / 8 Hz. At 120 BPM every seconds value halves.
  - [ ] `allowedNoteValues(60, {min:0,max:10}, 'seconds')` includes 2 bars and excludes 4 bars; `allowedNoteValues(200, {min:0,max:20}, 'hz')` excludes 1/32 triplet; results preserve `NOTE_VALUES` order.
  - [ ] `nearestNoteValue(0.3, 60, allowed, 'seconds')` is 1/4 triplet; an input above every allowed entry returns the last entry; below every entry returns the first.

  **Verification:**
  - [ ] `npx vitest run src/data/noteValues.test.ts` passes (RED first per function).
  - [ ] `npm run build:types` clean.

  **Dependencies:** None.
  **Files:** `src/data/noteValues.ts`, `src/data/noteValues.test.ts`.
  **Scope:** S.

- [ ] **Task 2: Optional `sync` on the two settings types; `src/utils/tempoSync.ts` resolvers and conversions**

  **Description:** Add `LfoSync = NoteValue | 'off'` and `LfoSettings.sync?` to `src/types/lfo.ts`; `DelaySettings.sync?: NoteValue` and `DELAY_TIME_RANGE_SECONDS = { min: 0, max: 10 }` to `src/types/globalAudio.ts` (point `globalFx.ts`'s `maxDelay: 10` comment at it — comment only). Create `src/utils/tempoSync.ts` with `resolveLfoRateHz`, `isLfoOn`, `resolveDelayTimeSeconds`, `resolveDelayForEngine`, plus the two conversion helpers `lfoToSync(settings, bpm, allowed)` / `lfoToFree(settings, bpm)` and `delayToSync`/`delayToFree` (spec §1.5). Defaults (`DEFAULT_LFO_SETTINGS`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, `NEUTRAL_LFO_VALUE`) stay Free — no edits. `lfoEngine.ts`'s own `LfoSettings` copies tolerate the extra optional field unchanged.

  **Acceptance criteria:**
  - [ ] `resolveLfoRateHz`: Free passes `rate` through (0 and 20 included); `'off'` → 0; 1/4 at 60 → 1, at 120 → 2; 1/32 triplet at 200 clamps to `LFO_RATE_MAX`. `isLfoOn` truth table: Free/0 false, Free/>0 true, Sync/'off' false, Sync/note true (even when `rate` is 0).
  - [ ] `resolveDelayTimeSeconds`: Free passes through; 2 bars at 20 BPM (24 s) clamps to 10. `resolveDelayForEngine` returns `feedback`/`wet` untouched and `delayTime` resolved.
  - [ ] `lfoToSync` of `rate: 0` → `sync: 'off'`; of 1.5 Hz at 60 with the LFO allowed list → `sync` = 1/4 triplet; `rate` left as it was. `lfoToFree` of 1/8 dotted at 60 → `rate: 1.35` (quantised to `RATE_STEP` 0.05) and `'sync' in result === false` (key deleted, not `undefined`). Same pair of assertions for `delayToSync` (0.3 s at 60 → 1/4 triplet) / `delayToFree` (quantised to 0.001).
  - [ ] Both types still satisfy their existing tests; a `LfoSettings` literal without `sync` compiles unchanged.

  **Verification:**
  - [ ] `npx vitest run src/utils/tempoSync.test.ts src/types` passes (RED first).
  - [ ] `npm run build:types` and `npm run lint` clean. Mutation check: flip the `'off'` branch to return `rate` and watch the truth-table case go red.

  **Dependencies:** Task 1.
  **Files:** `src/types/lfo.ts`, `src/types/globalAudio.ts`, `src/engine/audioEngine/globalFx.ts` (comment), `src/utils/tempoSync.ts`, `src/utils/tempoSync.test.ts`.
  **Scope:** M.

- [ ] **Task 3: Capture the seed oracle — current seeder output for two fixed names, before any seeder changes**

  **Description:** Add tests that pin the *current* full output of `generateGlobalAudioSettings`, `generateGlobalLfoSettings` (two fixed Attenuation Style names) and `generateRobotLfoSettings` (a fixed locale noise map at two offsets) as inline expected objects. These are deliberately written GREEN against today's code: they are the "Free values and quiet pattern are byte-identical" oracle Tasks 7–8 must keep passing once the seeders change. Record in each test's comment that regenerating these expectations is a spec violation, not a fix.

  **Acceptance criteria:**
  - [ ] Four `toEqual` assertions on complete objects (not spot fields), using names/offsets that are not already used by neighbouring tests.
  - [ ] The test file comment states the rule above and cites spec §1.7 / §5.

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts src/systems/spawnSystem.test.ts` passes.

  **Dependencies:** None (must land before Task 7 or 8 starts).
  **Files:** `src/utils/globalAudioSeed.test.ts`, `src/systems/spawnSystem.test.ts`.
  **Scope:** S.

### Checkpoint A: Foundation
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] `grep -rn "noteValues\|tempoSync" src --include=*.ts --include=*.tsx | grep -v "^src/data/noteValues\|^src/utils/tempoSync"` returns nothing (still additive).
- [ ] Review with Crawford before proceeding.

---

### Phase 2: Store → engine — a synced value is audibly correct with no UI

- [ ] **Task 4: `lfoEngine.hasLfo` / `setLfoTempoLocked`; `lfoDrift` tempo-lock switch**

  **Description:** In `lfoEngine.ts` add `hasLfo(target, robotId?)` (true iff `activeLfos` has the key — never constructs) and `setLfoTempoLocked(target, locked, robotId?)` forwarding to a new `lfoDrift.setTempoLocked(key, locked)`. In `lfoDrift.ts` add `export const RATE_DRIFT_APPLIES_TO_SYNCED = true`, a `tempoLocked` boolean on each `driftLinks` entry (default false, set by `setTempoLocked`, remembered even if called before `attachDrift` for that key), and the gate in `refreshRateDriftGain` (spec §1.9). Correct the stale "LFO_RATE_MIN is 0.1" comment in `attachDrift` while there. The engine's rate contract and doc comment are unchanged.

  **Acceptance criteria:**
  - [ ] `hasLfo` is false before any setter and true after `setLfoRate`; it never changes `activeLfos.size`.
  - [ ] With `RATE_DRIFT_APPLIES_TO_SYNCED` true, `refreshRateDriftGain` output for a locked key equals that of an unlocked key (existing drift tests unchanged). With it mocked false (`vi.spyOn`/module mock), a locked key's `rateDriftGain.gain.value` is 0 and an unlocked key's is unchanged; depth drift unaffected either way.
  - [ ] `setTempoLocked` before `attachDrift` still applies once the link exists.

  **Verification:**
  - [ ] `npx vitest run src/engine/lfoEngine.test.ts src/engine/lfoDrift.test.ts` passes (RED first).
  - [ ] `npm run build:types` clean.

  **Dependencies:** Task 2.
  **Files:** `src/engine/lfoEngine.ts`, `src/engine/lfoDrift.ts`, their tests.
  **Scope:** S.

- [ ] **Task 5: Migrate every apply path to the resolvers**

  **Description:** Spec §1.3's table, verbatim: `audioStore.setGlobalLfo`, `robotOptionsActions.applyLayerLfo`, `AudioEngine.start()`'s global priming loop (add `isInitialized()` getter over the existing flag in the same edit), `audioDiagnostics.globalLfosOn`, and the Delay path — `GLOBAL_SETTER.delay` becomes a lazy wrapper `(p) => AudioEngine.setGlobalDelay(resolveDelayForEngine({ ...get().globalAudio.delay, ...p }, get().bpm))` defined where `get` is in scope (spec §7.5), and `applyGlobalAudioToEngine` takes `bpm` (or reads the store) and resolves likewise. Each LFO path also calls `setLfoTempoLocked`. `lfoDebug.ts` untouched.

  **Acceptance criteria:**
  - [ ] `setGlobalLfo` with `{ sync: {1/4} }` at bpm 120 calls `lfoEngine.setLfoRate(target, 2)`, `setLfoTempoLocked(target, true)`, and connects; with `{ sync: 'off', rate: 5 }` it disconnects and never connects (the `rate: 5` is ignored). Free behaviour byte-identical to today's tests.
  - [ ] `applyLayerLfo` mirrors the above with `robot.id`.
  - [ ] `AudioEngine.start()` priming: a seeded global `sync` target connects at its resolved Hz; `isInitialized()` is false before `start()` and true after.
  - [ ] `setGlobalAudio('delay', { sync: {1/4} })` at bpm 60 reaches `AudioEngine.setGlobalDelay` with `delayTime: 1`; `{ delayTime: 0.3 }` with no `sync` reaches it as 0.3. No import-time throw (the GLOBAL_SETTER table still builds at module scope).
  - [ ] `audioDiagnostics.globalLfosOn` counts a Sync note target as on and a Sync `'off'` target as off.
  - [ ] `grep -rn "\.rate\b" src --include=*.ts --include=*.tsx | grep -v "\.test\.\|rateDrift\|rateSchema\|frequency\|lfoDebug\|tempoSync.ts\|content/\|audioRigConfig\|seed\|spawnSystem\|sessionShare\|Lfo.tsx"` returns nothing — only the Task 12 (Lfo.tsx) and Task 15 (share) sites remain.

  **Verification:**
  - [ ] `npx vitest run src/stores/audioStore.test.ts src/systems/robotOptionsActions.test.ts src/engine/AudioEngine.test.ts src/engine/audioDiagnostics.test.ts` passes (RED first for each path).
  - [ ] `npm run build:types`, `npm run lint` clean; `npm run dev` boots with no console error (module-scope table).

  **Dependencies:** Tasks 2, 4.
  **Files:** `src/stores/audioStore.ts`, `src/systems/robotOptionsActions.ts`, `src/engine/AudioEngine.ts`, `src/engine/audioDiagnostics.ts`, plus their tests.
  **Scope:** M.

- [ ] **Task 6: `src/systems/tempoSync.ts` — the tempo-change re-apply, hooked into `setBPM`**

  **Description:** Implement `reapplyTempoSyncedValues(bpm)` exactly per spec §1.6 (no-op unless `AudioEngine.isInitialized()`; Delay when `sync` present; each synced global target with `hasLfo`; each synced robot target with `hasLfo`, over the active locale's robots; never connect/disconnect/start/stop/construct) and call it at the end of `audioStore.setBPM`.

  **Acceptance criteria:**
  - [ ] Not initialised → zero engine calls. Initialised: synced global + `hasLfo` → exactly one `setLfoRate` with the resolved Hz; synced + no node → none; Free → none; robot case called with `robot.id`; Delay with `sync` → one `setGlobalDelay` with resolved seconds, without → none; `connectLfoTarget`/`start`/`stop` never called.
  - [ ] `setBPM(90)` writes state, calls `AudioEngine.setBPM(90)`, then the re-apply — in that order.
  - [ ] A Sync `'off'` target is never requested (spec §7.8).

  **Verification:**
  - [ ] `npx vitest run src/systems/tempoSync.test.ts src/stores/audioStore.test.ts` passes (RED first). Mutation check: delete the `hasLfo` guard and watch the "no node → none" case go red.

  **Dependencies:** Tasks 4, 5.
  **Files:** `src/systems/tempoSync.ts`, `src/systems/tempoSync.test.ts`, `src/stores/audioStore.ts`.
  **Scope:** S.

### Checkpoint B: Synced values audible with no UI
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] Manual (Crawford or agent via devtools): in `npm run dev`, start audio, `useAudioStore.getState().setGlobalLfo('eq3.mid', { shape:'sine', depth:40, rate:0, sync:{division:'1/4',modifier:'straight'} })`, then drag Tempo — the modulation rate audibly follows. `setBPM` back and forth leaves a Free target's rate untouched.
- [ ] Review with Crawford before proceeding.

---

### Phase 3: Seeding

- [ ] **Task 7: Global seeders — `seedBpm` parameter, Delay + global-LFO Sync rolls, store callers**

  **Description:** `generateGlobalAudioSettings(asId, asName, seedBpm)` and `generateGlobalLfoSettings(asId, asName, seedBpm)` per spec §1.7: new `getSeededVal` keys (`…syncMode`, `…syncIndex`), 50/50 per target, Sync draw uniform over `allowedNoteValues(seedBpm, band, unit)`, existing keys/order/quiet rolls untouched, empty-band fallback to Free. `audioStore.regenerateGlobalAudioFromSeed`/`regenerateGlobalLfoFromSeed` resolve `seedBpm` from the current locale via `generateLocaleBpm` (the same lookup `syncBpmToCurrentLocale` already does; locale guaranteed — see the planning note at the top). Update `applySessionPayload`'s callers only if they pass through these (they don't today — verify, don't assume).

  **Acceptance criteria:**
  - [ ] Task 3's oracle tests still pass with the new parameter supplied (`seedBpm` from the fixture locale), proving Free values and the quiet pattern are byte-identical; the new `sync` fields are the only diff.
  - [ ] Determinism: identical inputs → `toEqual` twice. Over 50 names, Sync share per target ∈ [30%, 70%]; every Sync draw's `noteValueSeconds`/`Hz` at `seedBpm` lies inside its band; a quiet target in Sync mode is `'off'`; Delay never seeds `'off'`.
  - [ ] For every integer BPM in `LOCALE_BPM_SEED_RANGE` (40–100) both bands are non-empty.
  - [ ] The store's AS-sync at module load still runs without error (locale present); `regenerateGlobalLfoFromSeed` remains data-only (no `lfoEngine` call).

  **Verification:**
  - [ ] `npx vitest run src/utils/globalAudioSeed.test.ts src/stores/audioStore.test.ts` passes (RED first for each new behaviour).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2, 3.
  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`, `src/stores/audioStore.ts`, `src/stores/audioStore.test.ts`.
  **Scope:** M.

- [ ] **Task 8: Robot seeder — `seedBpm` through `generateRobotLfoSettings`, `spawnRobot`, `generateRobotRosterBaseline`, `sessionDiff`**

  **Description:** Same rolls as Task 7 on `generateRobotLfoSettings(noiseMap, offset, seedBpm)` with the full-range band; thread `seedBpm = generateLocaleBpm(locale.id, x, y)` from `spawnRobot`, the copy-a-sibling branch (copied wholesale — no new draw), `generateRobotRosterBaseline`, and `sessionDiff.buildSessionPayload`'s replay.

  **Acceptance criteria:**
  - [ ] Task 3's robot oracle passes unchanged apart from `sync` fields; quiet → `'off'`; Sync draws inside [0, 20] Hz at `seedBpm`.
  - [ ] Baseline parity: `generateRobotRosterBaseline` reproduces `spawnRobot`'s `lfoSettings` **including a Sync entry** for a roster where at least one target seeds Sync (the test asserts a non-`undefined` `sync` is present in the compared object — the World Clock parity-fixture lesson).
  - [ ] A copied robot's `lfoSettings` equals its source's, `sync` included.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1, 2, 3.
  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/utils/sessionDiff.ts`, `src/utils/sessionDiff.test.ts`.
  **Scope:** M.

### Checkpoint C: Seeded worlds carry Sync values
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] Manual: `npm run dev`, start audio, inspect `useAudioStore.getState().globalLfo` and `globalAudio.delay` — some entries carry `sync`; drag Tempo and hear the synced global ones follow (robot ones won't until Crawford's priming fix — expected).
- [ ] Review with Crawford before proceeding.

---

### Phase 4: UI

- [ ] **Task 9: Content entries + `src/utils/formatNoteValue.ts`**

  **Description:** Add the §1.10 entries to `src/content/copy/ui.ts` (proposed wording; Crawford's veto applies to `ui.tempoSync`'s own human/lore and the readout words — change the strings, not the keys, if vetoed). Create `formatNoteValue(nv)` and `formatNoteValueOrOff(nv | 'off')` reading every word through `labels`/`options`/`fill`.

  **Acceptance criteria:**
  - [ ] `"1/8"`, `"1/8 dotted"`, `"1/4 triplet"`, `"1 bar"`, `"2 bars"`, `"4 bars"`, `"Off"` — asserted against `CONTENT` entries, never against a second literal.
  - [ ] Straight has no suffix (no trailing space).
  - [ ] `content.test.ts` green: every new key referenced (the formatter references all but `ui.tempoSync`, which Task 11 references — so this task's commit may legitimately leave `ui.tempoSync` unreferenced; if the guard fails on it, add the entry in Task 11 instead and say so in the commit).

  **Verification:**
  - [ ] `npx vitest run src/utils/formatNoteValue.test.ts src/content` passes (RED first).
  - [ ] `npm run lint` clean (no literal copy outside `src/content`).

  **Dependencies:** Task 1.
  **Files:** `src/content/copy/ui.ts`, `src/utils/formatNoteValue.ts`, `src/utils/formatNoteValue.test.ts`.
  **Scope:** S.

- [ ] **Task 10: `SliderLinearSchema.formatValue` + readout**

  **Description:** Add `formatValue?: (value: number) => string` to `SliderLinearSchema` (doc comment mirroring `SliderLogSchema.formatValue`'s) and the one ternary in `SliderLinear.tsx`'s `valueLabel` (both the interactive and `readOnly` branches share it already). `CONTROL_SCHEMA_TYPES` untouched.

  **Acceptance criteria:**
  - [ ] With `formatValue`, the readout text is its return value and `schema.unit` is not appended; without it, the readout is unchanged (existing tests).
  - [ ] `controls.test.ts`'s "exactly 14 entries" still passes.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/SliderLinear.test.tsx src/types/controls.test.ts` passes (RED first).

  **Dependencies:** None.
  **Files:** `src/types/controls.ts`, `src/components/ui/controls/SliderLinear.tsx`, `src/components/ui/controls/SliderLinear.test.tsx`.
  **Scope:** XS.

- [ ] **Task 11: `TempoSyncSlider` composition**

  **Description:** `src/components/ui/controls/TempoSyncSlider.tsx` + `.css` + `.test.tsx` exactly per spec §1.4's prop contract and rendering rules: flex row of one `SliderLinear` and one `Toggle` (facade children = current mode's `DualLabel` from `options('ui.tempoSync')`); Free renders the given schema; Sync renders the derived index schema (`useMemo` on `[schema, allowed]`), value = index of `syncValue` or the clamped index when absent (display only — no `onChange` on render); `heldOffDisplay` mirrors `Lfo.tsx`'s existing held-off readout behaviour. Memoised like every other primitive.

  **Acceptance criteria:**
  - [ ] Free: slider min/max/step/unit from the given schema; readout with unit; arrow key → `onFreeChange` only.
  - [ ] Sync: `max = allowed.length - 1`, `step = 1`, readout `"1/8 dotted"` at that index, no unit; arrow key → `onSyncChange` with the `NoteValue` (or `'off'` at index 0 when present) and never `onFreeChange`.
  - [ ] `syncValue` absent from `allowed` → the clamped index is displayed and no `onChange`/`onSyncChange` fires during render or on re-render.
  - [ ] Toggle click → `onModeChange(true/false)` only; the facade reads Float at rest and Anchored when popped (text from `CONTENT`).
  - [ ] Root carries `isActive`-style class hooks consistent with `Lfo.tsx` (whatever `Lfo.tsx` needs in Task 12 — keep it minimal).

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/TempoSyncSlider.test.tsx` passes (RED first).
  - [ ] `npm run lint`, `npm run build:types` clean.

  **Dependencies:** Tasks 9, 10.
  **Files:** `TempoSyncSlider.tsx`, `TempoSyncSlider.css`, `TempoSyncSlider.test.tsx` (all under `src/components/ui/controls/`).
  **Scope:** M.

- [ ] **Task 12: `Lfo.tsx` renders its Rate through `TempoSyncSlider`; `bpm` prop; `LfoTargetGroup` forwards it**

  **Description:** Replace the Rate `SliderLinear` with `TempoSyncSlider`; add required `bpm: number` to `LfoProps` and `LfoTargetGroupProps` (forwarded untouched); compute `allowed = ['off', ...allowedNoteValues(bpm, {LFO_RATE_MIN..MAX}, 'hz')]` memoised on `bpm`; `isActive` → `isLfoOn(value)`; held-off readout preserved; `onModeChange` performs `lfoToSync`/`lfoToFree` (Task 2) and emits a complete `LfoValue`; `onSyncChange` emits `{ ...value, sync }`. Update `Lfo.test.tsx` and `LfoTargetGroup.test.tsx` to pass `bpm={60}`; callers do not compile until Task 13 — run only the two test files here and accept the type break for one commit **or** pass a temporary `bpm={60}` at the callers in this same commit (preferred: do the latter and let Task 13 replace the literal with the subscription).

  **Acceptance criteria:**
  - [ ] Existing `Lfo.test.tsx` cases pass with `bpm={60}`.
  - [ ] `isActive` follows `isLfoOn`: Sync `'off'` inactive; Sync 1/4 active even with `rate: 0`.
  - [ ] Mode flip from Free `rate: 1.5` at 60 → `onChange` called once with `sync` = 1/4 triplet and `rate: 1.5` kept; flip back → `onChange` with `rate: 1.5` and no `sync` key.
  - [ ] Sync arrow key → `onChange` with a complete `LfoValue` whose `sync` changed and nothing else.

  **Verification:**
  - [ ] `npx vitest run src/components/ui/controls/Lfo.test.tsx src/components/ui/controls/LfoTargetGroup.test.tsx` passes (RED first).
  - [ ] `npm run build:types` clean at the end of the commit.

  **Dependencies:** Tasks 2, 11.
  **Files:** `Lfo.tsx`, `Lfo.test.tsx`, `LfoTargetGroup.tsx`, `LfoTargetGroup.test.tsx` (+ the temporary literal at callers if chosen).
  **Scope:** M.

- [ ] **Task 13: Thread `bpm` from the five callers**

  **Description:** `AudioRigLfoGroup` (in `AudioRigDrawer.tsx`), `SignatureArrayDrawer.tsx`, `AudioSettingSection.tsx` (new prop, forwarded to its `Lfo`), `RobotOptionsTab.tsx` and `CompanyOptionsSection.tsx` subscribe `useAudioStore((s) => s.bpm)` and pass it down, replacing any Task 12 literal. Company broadcast of an LFO edit already goes through `handleLayerLfoFieldChange`/the volume handler with the full `LfoValue`, so a `sync` change broadcasts like any other field (the removed-key case is Task 16).

  **Acceptance criteria:**
  - [ ] Each of the five components' tests renders with a mocked store `bpm` and the rendered `Lfo` receives it (assert on the Sync readout at a known index, which depends on `bpm`).
  - [ ] A Tempo change re-renders only LFO rows (sanity via existing memoisation tests — no new re-render regressions in `AudioRigEffectPanel.test.tsx`).

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console src/components/robot src/components/company` passes.
  - [ ] `npm run build:types`, `npm run lint` clean; no `bpm={60}` literal remains outside tests (`grep -rn "bpm={60}" src --include=*.tsx | grep -v test`).

  **Dependencies:** Task 12.
  **Files:** `AudioRigDrawer.tsx`, `SignatureArrayDrawer.tsx`, `AudioSettingSection.tsx`, `RobotOptionsTab.tsx`, `CompanyOptionsSection.tsx` (+ tests as needed).
  **Scope:** M (5 files, mechanical).

- [ ] **Task 14: Delay — hand-composed branch in `AudioRigEffectPanel`**

  **Description:** Add a `block.key === 'delay'` branch beside the `compressor` one: `delayTime` through `TempoSyncSlider` (`allowed = allowedNoteValues(bpm, DELAY_TIME_RANGE_SECONDS, 'seconds')`, no `'off'`), `feedback`/`wet` through `paramRow`. `onModeChange` → `delayToSync`/`delayToFree` then `setGlobalAudio('delay', …)`; `onSyncChange` → `setGlobalAudio('delay', { sync })`; `onFreeChange` → the existing `fieldOnChange.delayTime`. Swell flag for `delayTime` passed as today.

  **Acceptance criteria:**
  - [ ] The delay block renders one `TempoSyncSlider` and two plain rows; `eq3`/`reverb` blocks unchanged.
  - [ ] Toggling to Sync with `delayTime: 0.3` at bpm 60 stores `sync` = 1/4 triplet; a tempo drag to 20 BPM shows the clamped readout and the stored `sync` is unchanged.
  - [ ] Toggling back stores `delayTime` = resolved seconds (quantised) and no `sync` key.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` passes (RED first).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5, 11.
  **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`.
  **Scope:** S.

### Checkpoint D: UI complete — manual walk
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] `grep -rn "\.rate\b\|\.delayTime\b" src --include=*.ts --include=*.tsx | grep -v "\.test\."` — every hit is in spec §1.3's table, `tempoSync.ts`, a seeder, `sessionShareUtils.ts`, `sessionDiff.ts`'s normalisation, or content/config labels. Anything else is a miss.
- [ ] Manual, Crawford: flip an EQ LFO to Anchored, drag Tempo, hear it follow; flip one robot layer LFO to Anchored (then nudge it so it connects — the priming gap) with a sibling on Float, drag Tempo, hear one move and one hold; Delay 1/4 at 60 → Tempo to 20 → readout clamps, delay stops lengthening at 10 s; keyboard: Tab reaches the toggle and the slider, arrows step note values; reduced-motion unaffected (no new animation).
- [ ] Review with Crawford before proceeding.

---

### Phase 5: Persistence and companies

- [ ] **Task 15: Share-link codec for `sync`; version-1 payload fixture test**

  **Description:** `CompactLfoSettings.y?: string` with the §1.8 code (`32|16|8|4|2|1b|2b|4b` + `''|d|t`, or `off`); encode/decode in `toCompactLfoSettings`/`fromCompactLfoSettings`; absent → no `sync` key. Add a `sessionDiff` test applying a hand-written version-1 `SessionPayload` with no `sync` anywhere and asserting resolved Hz/seconds equal the stored numbers (no code change expected there — the test is the backward-compat proof).

  **Acceptance criteria:**
  - [ ] Every `NOTE_VALUES` entry and `'off'` round-trips; absent `y` decodes to an object with no `sync` key; a full payload with mixed Free/Sync entries round-trips `toEqual`.
  - [ ] The version-1 fixture applies without error and every LFO/Delay resolves to its stored number at any bpm.
  - [ ] `globalAudio.delay.sync` survives the share round-trip through `g` with no codec change.

  **Verification:**
  - [ ] `npx vitest run src/utils/sessionShareUtils.test.ts src/utils/sessionDiff.test.ts` passes (RED first for the codec).

  **Dependencies:** Task 2.
  **Files:** `src/utils/sessionShareUtils.ts`, `src/utils/sessionShareUtils.test.ts`, `src/utils/sessionDiff.test.ts`.
  **Scope:** S.

- [ ] **Task 16: `diffCompoundField` detects a removed key; merge sites strip `undefined`**

  **Description:** `diffCompoundField(prev, next)` returns `{ [key]: undefined }` for a key present in `prev` and absent in `next` (checked after the existing changed-key scan, still "first difference wins"). In `CompanyOptionsSection.tsx`'s `handleLayerLfoFieldChange`, the volume-LFO handler, and `patchSnapshot`'s LFO merges, strip an `undefined` `sync` after spreading so no member or snapshot ever stores `sync: undefined`.

  **Acceptance criteria:**
  - [ ] `diffCompoundField({shape,rate,depth,sync:{…}}, {shape,rate,depth})` → `{ sync: undefined }`; existing cases unchanged; a changed key still wins over a removed one when both occur (document the order in a test).
  - [ ] Broadcasting Sync→Free to two members leaves neither with a `sync` key (`'sync' in m.lfoSettings[target] === false`) and the snapshot likewise.
  - [ ] ADSR/toggle compound fields' existing tests unchanged.

  **Verification:**
  - [ ] `npx vitest run src/systems/companyOptions.test.ts src/components/company/CompanyOptionsSection.test.tsx` passes (RED first). Mutation check: remove the strip and watch the `'sync' in` assertion go red.

  **Dependencies:** Task 2.
  **Files:** `src/systems/companyOptions.ts`, `src/systems/companyOptions.test.ts`, `src/components/company/CompanyOptionsSection.tsx`, `CompanyOptionsSection.test.tsx`.
  **Scope:** S.

---

### Phase 6: Docs

- [ ] **Task 17: Docs, roadmap entry, spec amendment, grid correction**

  **Description:** `docs/AUDIO_SYSTEM.md` LFO section (rate is Hz at the engine; Sync resolves above it in `utils/tempoSync.ts`; the drift switch; `hasLfo`/`setLfoTempoLocked`); `docs/reference/GLOBAL_CHAIN_GRID.md` delay row corrected to 0–10 s / `maxDelay: 10` with a Sync note; `docs/reference/ROBOT_DATA_GRID.md` LFO Rate row Sync note; `docs/COMPONENT_LIBRARY.md` (`TempoSyncSlider` composition, `SliderLinearSchema.formatValue`); `docs/SESSION_STORAGE.md` (optional `sync`, absent = Free, no version bump); `docs/COMPANIES.md` (removed-key diff); `docs/todo/roadmap.md` Phase 33 entry with "Not Doing" per spec §6 and the seeded-robot-LFO priming gap recorded as a pre-existing follow-up; spec §7 item 4 marked resolved per this plan's note; tick this file's boxes.

  **Acceptance criteria:**
  - [ ] Every doc claim names a file that exists and a function that exists (verify-roadmap-against-code rule).
  - [ ] No stale "free-running Hz" sentence remains that contradicts Sync.

  **Verification:**
  - [ ] `npm test` (content guard unaffected), `npm run lint`.
  - [ ] Read-through by Crawford.

  **Dependencies:** All.
  **Files:** the docs listed; `docs/specs/FREE_SYNC_TOGGLE.md`; this file.
  **Scope:** M (docs only).

### Checkpoint E: Complete
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Spec §5's Checkpoint E list done on the final build: EQ LFO follows tempo; mixed robot LFOs move/hold; Delay clamps at 10 s; a pre-branch session loads with every toggle on Float; a mixed-member company Sync→Free broadcast lands on every member.
- [ ] Crawford's final review and wording vetoes applied (spec §7 items 1–3).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A consumer still reads `rate`/`delayTime` directly after migration | High (silent wrong audio in Sync) | Task 5's grep criterion and Checkpoint D's grep; the resolver is the only sanctioned reader. |
| Seeder change perturbs Free output | High (every world sounds different) | Task 3's oracle captured first; Tasks 7–8 must keep it green with only `sync` fields added. |
| `GLOBAL_SETTER` lazy wrapper throws at import | Med | Task 5 verifies `npm run dev` boots; wrapper reads the store lazily, never at module scope. |
| `useEasedControlValue` shows fractional indices mid-ease | Low (cosmetic) | `formatValue` rounds; Task 11 asserts readout at integer index. |
| `bpm` prop threading breaks memoisation | Low | `bpm` is a primitive; memo bail-outs unaffected. Task 13 checks the existing re-render tests. |
| Seeded robot LFOs don't run at spawn (pre-existing) | Med (expectation) | Out of scope by Crawford's decision; Checkpoint D's manual step nudges the robot LFO to connect; roadmap records the gap. |
| `diffCompoundField` change affects ADSR/toggle fields | Low | Own task (16) with the existing compound-field tests as regression. |
| Wording veto arrives after Task 9 | Low | Only strings in `ui.ts` change; keys and tests (which read `CONTENT`) are unaffected. |

## Open Questions

- Spec §7 items 1–3 (toggle name, readout words, modifiers on multi-bar) — Crawford's wording vetoes. They don't block any task: Task 9 lands the proposed words and a veto is a one-file string edit.
- Spec §7 item 4 — resolved (see the note at the top).
- Spec §7 item 5 — resolved by Task 5's lazy-wrapper shape; the `npm run dev` boot check is the proof.
