# Implementation Plan: Free | Sync Toggle

> **Rewritten 2026-10-02 against the LFO Bank.** The 2026-09-30 17-task per-target plan is in git history. This plan implements the rewritten spec.

Source spec: [docs/specs/FREE_SYNC_TOGGLE.md](../specs/FREE_SYNC_TOGGLE.md). Source intent: [docs/intent/free-sync-toggle.md](../intent/free-sync-toggle.md) (the 2026-10-02 re-scope section). Branch `feature/sync-toggle`, off `main` at `07da4a73`. Roadmap slot: Phase 33 (added in Task 15).

> Process note: `planning-and-task-breakdown` asks for `tasks/plan.md` + `tasks/todo.md`. This repo keeps both in one file under `docs/tasks/` (every sibling here), and that convention wins (CLAUDE.md "Authority and precedence"). Execution follows the house rhythm: RED test first, one commit per task, mutation-check at the named gates, stop and report at every checkpoint.

## Overview

Five Free | Sync (Float | Anchored) toggles — one per LFO Bank lane, one on Delay Time — storing a synced value as a note division + modifier and deriving Hz/seconds from `audioStore.bpm` through pure resolvers; plus the structural move of BPM seeding from the locale to the Attenuation Style. Fifteen tasks in six phases: pure foundations and the BPM move (1–4), then the lane path end to end from store to panel (5–10) so a synced lane is audible and usable at Checkpoint B, then the same for Delay (11–12), then seeding and persistence (13–14), then docs (15). The data shape is additive (optional `sync`), so the tree is green and old sessions load Free at every commit.

## Architecture Decisions

- **Foundations have no importers when they land** (Tasks 1–2). Their tests are the oracle for every later task; nothing re-derives the math.
- **The seed oracle is captured before any seeder changes** (Task 3). Without it, "Free values are byte-identical" is unprovable.
- **BPM moves early and alone** (Task 4). It is the one structural change outside the toggle, it changes every unsaved world's tempo, and every later seeding task depends on `generateAttenuationStyleBpm`. Landing it first lets Crawford hear it at Checkpoint A before anything else moves.
- **Vertical slices: lanes first, then Delay.** Lanes are four of the five toggles and carry the new composition, so the lane slice (5–10) builds and proves `TempoSyncSlider`; the Delay slice (11–12) then reuses it.
- **The store owns conversions** (spec assumption 5). `TempoSyncSlider` stays store-free and tempo-free; `LfoBankLanePanel` and the Delay branch already write straight to the store.
- **`lfoEngine.ts` is not touched.** Lanes are app-lifetime and `setBankRate` is safe before priming, so the re-apply needs no node guard and the engine never learns about sync.
- **Whole-object replacement for Sync → Free** (spec assumption 6). The session-restore branch moves to it in Task 5, not later, because the bug it prevents appears the moment `sync` exists in state.

## Dependency Graph

```
Task 1 (noteValues)                 Task 3 (seed oracle — before 13)
   │
   └─→ Task 2 (types.sync + utils/tempoSync)
            │
Task 4 (BPM → Attenuation Style)      none in code; ordered after 1–3 so Checkpoint A reviews it with them
   ── Checkpoint A ──
Task 5 (lane store→engine, replace + mode actions, restore path)   ← 2
   └─→ Task 6 (setBPM re-apply: lanes)                             ← 5
Task 7 (content + formatNoteValue)                                 ← 1
Task 8 (SliderLinearSchema.formatValue)                            none
   └─→ Task 9 (TempoSyncSlider)                                    ← 7, 8
            └─→ Task 10 (LfoBankLanePanel)                         ← 5, 9
   ── Checkpoint B (lane slice, manual) ──
Task 11 (delay store→engine + re-apply line)                       ← 2, 6
   └─→ Task 12 (Delay panel branch)                                ← 9, 11
   ── Checkpoint C (delay slice, manual) ──
Task 13 (seeding: lane + Delay Sync rolls)                         ← 2, 3, 4
Task 14 (share codec + restore sanitisers)                         ← 2, 5
   ── Checkpoint D ──
Task 15 (docs, roadmap)                                            ← all
   ── Checkpoint E (final) ──
```

Parallelisable: 1 ‖ 3; 7 ‖ 8 ‖ 5–6; 13 ‖ 14.

## Task List

### Phase 1: Foundation and the BPM move

- [x] **Task 1: `src/data/noteValues.ts` — note-value table and math**

  **Description:** `NoteDivision`/`NoteModifier`/`NoteValue`; the 20-entry `NOTE_VALUES` sorted ascending by beats at module load (spec §1.2); `noteValueBeats`, `noteValueSeconds`, `noteValueHz`, `noteValueEquals`, `isNoteValue`, `allowedNoteValues`, `nearestNoteValue`. No Tone, store or content import. Nothing imports it yet.

  **Acceptance criteria:**
  - [ ] 20 entries, no duplicates, strictly ascending beats; 1/4 triplet before 1/8 dotted; `'2'`/`'4'` straight-only.
  - [ ] Spec §1.2's 60 BPM fixtures (±1e-9); at 120 BPM seconds halve. `allowedNoteValues(60,{0,10},'seconds')` includes 2 bars, excludes 4 bars; `allowedNoteValues(200,{0,20},'hz')` excludes 1/32 triplet; `nearestNoteValue(0.3, 60, …, 'seconds')` = 1/8 triplet (0.333 s); out-of-range → first/last.
  - [ ] `isNoteValue` accepts every `NOTE_VALUES` entry and rejects `{division:'1/3',modifier:'straight'}`, `{division:'2',modifier:'dotted'}`, `'off'`, `null`, `undefined`, a string.

  **Verification:** `npx vitest run src/data/noteValues.test.ts` (RED first per function); `npm run build:types`.
  **Dependencies:** None. **Files:** `src/data/noteValues.ts`, `.test.ts`. **Scope:** S.

- [x] **Task 2: Optional `sync` on `BankLfoSettings`/`DelaySettings`; `src/utils/tempoSync.ts`**

  **Description:** Add `sync?: NoteValue` to both types and `DELAY_TIME_RANGE_SECONDS` to `globalAudio.ts` (point `globalFx.ts`'s `maxDelay: 10` comment at it). Create `tempoSync.ts` with everything in spec §1.3 plus `pickSeedNoteValue` (§1.7) and `RATE_DRIFT_APPLIES_TO_SYNCED = true`. Defaults untouched.

  **Acceptance criteria:**
  - [ ] Resolvers: spec §5 `tempoSync.test.ts` list in full (Free pass-through, invalid `sync` = Free, clamps, `isLaneRunning` table, `resolveLaneForEngine` strips `sync`).
  - [ ] Conversions: `laneToSync` (0 Hz → slowest; 1.5 Hz at 60 → 1/4 triplet, `rate` kept); `laneToFree` (1/8 dotted at 60 → 1.35, no `sync` key; 4 bars at 20 BPM → 0.05, never 0); `delayToSync`/`delayToFree` pair.
  - [ ] `pickSeedNoteValue`: first non-empty band wins, `undefined` when all empty, result inside its band.

  **Verification:** `npx vitest run src/utils/tempoSync.test.ts` (RED first); `npm run build:types`, `npm run lint`. **Mutation check:** make `resolveLaneRateHz` ignore `isNoteValue` and watch the invalid-sync case go red.
  **Dependencies:** 1. **Files:** `src/types/lfo.ts`, `src/types/globalAudio.ts`, `src/engine/audioEngine/globalFx.ts` (comment), `src/utils/tempoSync.ts`, `.test.ts`. **Scope:** M.

- [x] **Task 3: Capture the seed oracle before any seeder change**

  **Description:** Pin the current full output of `generateLfoBankSettings` and `generateGlobalAudioSettings` for two fixed Attenuation Style names (not used by neighbouring tests) as inline `toEqual` objects. Written GREEN against today's code. Each test's comment says regenerating these expectations is a spec violation (§1.7/§5), not a fix — Task 13 may only *add* `sync` keys to them.

  **Acceptance criteria:** four complete-object assertions; comment present.

  **As built:** Attenuation Styles `oracle-alpha` (audible Delay) and `oracle-theta` (quiet Delay, `wet` forced to 0), so both sides of the neighbouring quiet roll are pinned. The assertions are `toStrictEqual`, not `toEqual`: `toEqual` ignores a key set to `undefined`, so a stray `sync: undefined` would have passed and broken "a Free result carries no `sync` key". For Task 13: a Sync landing adds a `sync` object to these expectations; a Free landing must leave them byte-identical, with no `sync` key at all.
  **Verification:** `npx vitest run src/utils/globalAudioSeed.test.ts`.
  **Dependencies:** None (must precede 13). **Files:** `src/utils/globalAudioSeed.test.ts`. **Scope:** XS.

- [x] **Task 4: BPM seeds from the Attenuation Style, reseeds on AS change only**

  **Description:** Spec §1.7 "BPM". New `src/utils/bpmSeed.ts` (`BPM_SEED_RANGE`, `generateAttenuationStyleBpm(id, name)`, key `'globalAudio.bpm'` on the AS noise map — see "As built") and its test (ported from `localeBpmSeed.test.ts`, source-scan guard flipped, plus a ≥10-distinct-values-over-30-names check); delete `localeBpmSeed.ts`/`.test.ts`. `regenerateBpmFromSeed(attenuationStyleId, attenuationStyleName)`; called **first** inside `syncGlobalAudioToCurrentAttenuationStyle`; delete `syncBpmToCurrentLocale` and both `worldTransition.ts` calls (their comments go too). Fix the comment mentions in `audioRigConfig.ts` (`BPM_SCHEMA`) and `localeTemperature.ts`.

  **Acceptance criteria:**
  - [ ] Integer in [40, 100]; deterministic incl. across an evicted map; ≥10 distinct values over 30 names; reads `getAttenuationStyleNoiseMap`, never `getLocaleNoiseMap`.
  - [ ] AS change → `bpm` reseeded, and before `globalAudio` (order asserted); coordinates-only retransmit leaves a hand-set `bpm`; both-changed retransmit reseeds; `applySessionPayload` with `payload.bpm` ends on the payload value.
  - [ ] `grep -rn "generateLocaleBpm\|localeBpmSeed\|syncBpmToCurrentLocale" src` returns nothing.

  **As built:** The spec's bare key `'bpm'` at offset 0 hit the low-variety artifact the risk table predicted: measured over 300 styles it gave **9 distinct tempos (50–90)**, and two unrelated names collided on 89 in the 30-name test. Candidates measured the same way: `globalAudio.bpm` 36 distinct (42–98), `audio.bpm` 39 (46–94), `bpm`@1 44 (48–92), `bpm`@0.5 18, `globalAudio.tempo` 3. Chose **`'globalAudio.bpm'` at offset 0** — widest spread, and dot-namespaced like its neighbours. Spec §1.7 corrected to match. Two follow-ons: (1) `worldTransition.ts` keeps a bare side-effect `import '../stores/audioStore'` (comment says why) because it relied on audioStore's AS subscription and its only other audioStore use was the deleted calls; (2) the old `sessionDiff.test.ts` "older payload lacks bpm" case asserted a reseed that a coordinates-only retransmit no longer does, so it now asserts the carried-forward value survives, with a new case covering the AS-switch reseed; the round-trip case's wipe payload now strips `bpm` and switches style so the restore override is non-coincidental. **Known edge:** a both-changed retransmit whose new name case-insensitively collides with the *current* style reuses the same id, so the AS subscription sees no change and a hand-dragged tempo survives (old behaviour reseeded unconditionally). Not worth a special case; noted.

  **Verification:** `npx vitest run src/utils/bpmSeed.test.ts src/stores/audioStore.test.ts src/systems/worldTransition.test.ts src/utils/sessionDiff.test.ts` (RED first for each behaviour change); `npm run build:types`, `npm run lint`; `npm run dev` boots, Tempo slider shows a seeded value.
  **Dependencies:** None in code; lands after 1–3 so Checkpoint A reviews it with the foundations. **Files:** `src/utils/bpmSeed.ts` + test (new), `localeBpmSeed.ts` + test (deleted), `src/stores/audioStore.ts` + test, `src/systems/worldTransition.ts` + test, `src/utils/sessionDiff.test.ts`, two comment-only files. **Scope:** M (wide but mechanical; the logic is one moved call).

### Checkpoint A: Foundations + BPM
- [ ] `npm test`, `npm run lint`, `npm run build:types` clean.
- [ ] `noteValues`/`tempoSync` still have no importers outside their own tests.
- [ ] Manual (Crawford): an Attenuation Style switch changes the tempo; a coordinates move keeps it, including a hand-dragged one; a saved session loads at its own tempo.
- [ ] Review with Crawford before proceeding.

---

### Phase 2: Lane slice — synced lanes audible and editable

- [x] **Task 5: Lane store → engine: resolve on push; `replaceLfoBankLane`; `setLfoBankLaneSyncMode`; priming; diagnostics; restore path**

  **Description:** Spec §1.3 table rows for lanes and §1.5. `setLfoBank` pushes the resolved rate when `rate` or `sync` is in the partial, and `rateDrift` via `resolveLaneForEngine`. New `replaceLfoBankLane(lane, settings)` (whole write + full push) and `setLfoBankLaneSyncMode(lane, synced)` (`laneToSync`/`laneToFree` → replace). `AudioEngine.start()` primes with `resolveLfoBankForEngine(lfoBank, bpm)`. `audioDiagnostics.readBankRunning` → `isLaneRunning`. `sessionDiff.applySessionPayload`'s running-context branch uses `replaceLfoBankLane` instead of the per-lane `setLfoBank` merge.

  **Acceptance criteria:**
  - [ ] `setLfoBank(lane, { sync: 1/4 })` at bpm 120 → `setBankRate(lane, 2)`; `{ shape }` alone → no rate push; Free behaviour matches today's tests.
  - [ ] Mode round trip leaves `'sync' in lane === false`; `replaceLfoBankLane` with a Free lane over a synced one leaves no `sync`.
  - [ ] `start()` primes a synced lane at its resolved Hz; `readBankRunning` counts a synced `rate: 0` lane as running.
  - [ ] Restoring a session whose lane is Free over a live synced lane leaves no `sync`.

  **As built:** `setLfoBank` reads the *merged* lane back from the store and resolves it, so a Free-rate edit on an already-synced lane re-sends the synced Hz (tested), and `{ sync: undefined }` / an unrecognised `sync` resolves Free instead of pushing NaN. The rate push fires on `partial.rate !== undefined || 'sync' in partial` (not a bare `'rate' in partial`: a `{ rate: undefined }` partial would merge `undefined` over the rate). `rateDrift` goes through `resolveLaneForEngine(...).rateDrift` but is pushed only when `rateDrift` is in the partial — no mode change goes through `setLfoBank`, so when `RATE_DRIFT_APPLIES_TO_SYNCED` is flipped to `false` the Free↔Sync switch still re-sends drift correctly via `replaceLfoBankLane`'s full push. `replaceLfoBankLane` guards `undefined` like `setLfoBank`. `AudioEngine.ts` gains a static import of `tempoSync` (pure, no cycle). Existing `sessionDiff.test.ts` tests that pinned the per-lane `setLfoBank` merge now spy `replaceLfoBankLane` and assert `setLfoBank` is *not* used in the running branch. Engine-side assertions seed a distinct `lfoEngine` rate first (its module state outlives each test), so a missing push can't pass by coincidence. **Mutation check run:** reverting the restore branch to `setLfoBank` turned 4 tests red, including the engine playing the stale synced 1.6 Hz instead of the Free 1.5. Not yet covered by design: `sanitizeLaneSync` (Task 14), so a corrupt `sync` still reaches state from a restore and merely *resolves* Free.

  **Verification:** `npx vitest run src/stores/audioStore.test.ts src/engine/AudioEngine.test.ts src/engine/audioDiagnostics.test.ts src/utils/sessionDiff.test.ts` (RED first). **Mutation check:** revert the restore branch to `setLfoBank` and watch the stale-`sync` case go red.
  **Dependencies:** 2. **Files:** `audioStore.ts`, `AudioEngine.ts`, `audioDiagnostics.ts`, `sessionDiff.ts` + their tests. **Scope:** M.

- [x] **Task 6: `setBPM` re-applies synced lanes**

  **Description:** Spec §1.6 step 1. `setBPM` = `set` → `AudioEngine.setBPM` → `reapplyTempoSyncedValues(get())`, a module function that pushes `setBankRate` for every lane with `sync`. (Task 11 adds the Delay line.)

  **Acceptance criteria:** call order asserted; synced lanes re-pushed at the new resolved Hz; Free lanes never touched; safe before audio start (no throw, no AudioEngine-initialised check needed).

  **As built:** The filter is `isNoteValue(lane.sync)`, not a bare "`sync` present": an unrecognised `sync` resolves Free everywhere else (spec assumption 9), so it is not re-pushed here either — a Free value never moves with tempo. Every tempo path goes through the one `setBPM` action, so the Attenuation Style reseed (`regenerateBpmFromSeed`) re-applies too (tested). 13 tests: one tick, resolved-not-stored Hz, Free untouched (no rate/shape/drift push), mixed bank, all four lanes, state → transport → lanes order (asserted by call order *and* by reading `bpm` inside the transport call), 20 Hz clamp, slow-note floor (4 bars at 20 BPM pushes ~0.021, never 0), invalid sync, a three-tick drag, lane state unchanged, the AS reseed path, safe pre-start. **Mutation check run:** dropping the `isNoteValue` filter turned 6 tests red, including "never touches a Free lane" and the invalid-sync case. **Known flake, pre-existing:** under a full parallel `npm test`, one random test in `audioStore.test.ts` times out at the 5 s default (each test re-imports the store after `vi.resetModules()`; the file takes ~18 s loaded vs ~5 s alone). Reproduced on the Task 5 commit with this change stashed, so not introduced here; the file passes on its own.
  **Verification:** `npx vitest run src/stores/audioStore.test.ts` (RED first). **Mutation check:** drop the `sync` filter and watch the "Free untouched" case go red.
  **Dependencies:** 5. **Files:** `audioStore.ts`, `audioStore.test.ts`. **Scope:** S.

- [ ] **Task 7: Content entries + `src/utils/formatNoteValue.ts`**

  **Description:** Spec §1.9 entries in `src/content/copy/ui.ts`; `formatNoteValue(nv)` reading every word through `labels`/`options`/`fill`.

  **Acceptance criteria:** `"1/8"`, `"1/8 dotted"`, `"1/4 triplet"`, `"1 bar"`, `"1 bar dotted"`, `"2 bars"`, `"4 bars"` — asserted against `CONTENT`, never a second literal; no trailing space on straight; `content.test.ts` green (if the "every key referenced" guard trips on `ui.tempoSync` before Task 9 references it, move that entry to Task 9 and say so in the commit).
  **Verification:** `npx vitest run src/utils/formatNoteValue.test.ts src/content` (RED first); `npm run lint`.
  **Dependencies:** 1. **Files:** `src/content/copy/ui.ts`, `src/utils/formatNoteValue.ts`, `.test.ts`. **Scope:** S.

- [ ] **Task 8: `SliderLinearSchema.formatValue` + readout**

  **Description:** Optional field (doc comment mirroring `SliderLogSchema.formatValue`) and one ternary in `SliderLinear.tsx`'s `valueLabel` (shared by the interactive and `readOnly` branches).

  **Acceptance criteria:** with `formatValue` the readout is its return and no unit is appended; without it, unchanged; `controls.test.ts` still pins 14 types.
  **Verification:** `npx vitest run src/components/ui/controls/SliderLinear.test.tsx src/types` (RED first).
  **Dependencies:** None. **Files:** `src/types/controls.ts`, `SliderLinear.tsx`, `SliderLinear.test.tsx`. **Scope:** XS.

- [ ] **Task 9: `TempoSyncSlider` composition**

  **Description:** `src/components/ui/controls/TempoSyncSlider.tsx` + `.css` + `.test.tsx` per spec §1.4's prop contract: slider + `Toggle` row, Sync schema memoised on `[schema, allowed]`, clamped display index with no write on render, facade = current mode's lore word, `memo`-wrapped.

  **Acceptance criteria:** spec §5 `TempoSyncSlider` list in full (Free schema/readout; Sync max/step/readout/no unit; clamped index with no callback on render or re-render; toggle → `onModeChange` only, facade text from `CONTENT`; Sync arrow key → `onSyncChange(NoteValue)`, never `onFreeChange`).
  **Verification:** `npx vitest run src/components/ui/controls/TempoSyncSlider.test.tsx` (RED first); `npm run lint`, `npm run build:types`.
  **Dependencies:** 7, 8. **Files:** the three new files. **Scope:** M.

- [ ] **Task 10: `LfoBankLanePanel` renders Rate through `TempoSyncSlider`**

  **Description:** Spec §1.4 lane paragraph: subscribe to `sync` and `bpm`, memoise `allowedLaneNoteValues(bpm)`, wire the three callbacks (stable — `useCallback` per lane, matching the memo precedent in `AudioRigEffectPanel`). Shape and drift rows untouched.

  **Acceptance criteria:** composition renders for each lane; toggle calls `setLfoBankLaneSyncMode(lane, true/false)`; Sync readout at a known index changes with mocked `bpm`; Free edits still call `setLfoBank(lane, { rate })`; drift held-off behaviour unchanged.
  **Verification:** `npx vitest run src/components/panels/screen/console/LfoBankLanePanel.test.tsx` (RED first); `npm run build:types`, `npm run lint`.
  **Dependencies:** 5, 9. **Files:** `LfoBankLanePanel.tsx`, `.test.tsx`. **Scope:** S.

### Checkpoint B: Lane slice
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual (Crawford): flip a lane to Anchored, drag Tempo, hear its linked targets follow while a Float lane holds; Anchored → Float doesn't audibly jump; keyboard reaches the toggle and steps note values; the toggle's look in the panel (facade word veto, spec assumption 11).
- [ ] Review with Crawford before proceeding.

---

### Phase 3: Delay slice

- [ ] **Task 11: Delay store → engine; `setDelaySyncMode`; re-apply line**

  **Description:** Spec §1.3 delay rows and §1.5–1.6. `GLOBAL_SETTER.delay` becomes a wrapper that resolves when the partial carries `delayTime` or `sync` (reading the store lazily at call time) and forwards anything else untouched. `applyGlobalAudioToEngine(globalAudio, bpm)` resolves Delay; update its three callers (`regenerateGlobalAudioFromSeed`, `AudioEngine.start()`, `sessionDiff.applySessionPayload`). New `setDelaySyncMode(synced)` (whole `delay` write + push). `reapplyTempoSyncedValues` gains the Delay line.

  **Acceptance criteria:**
  - [ ] `setGlobalAudio('delay', { sync: 1/4 })` at 60 → `setGlobalDelay` with `delayTime: 1`; `{ delayTime: 0.3 }` with no `sync` → 0.3; `{ wet: 0.4 }` → forwarded as `{ wet: 0.4 }` exactly (swell path, spec §7 risk 4).
  - [ ] `applyGlobalAudioToEngine` pushes a resolved `delayTime` and no `sync`; mode round trip leaves no `sync` key; `setBPM` re-pushes a synced Delay and not a Free one.
  - [ ] `audioStore.ts` still imports cleanly (module-scope table builds; `npm run dev` boots with no console error).

  **Verification:** `npx vitest run src/stores/audioStore.test.ts src/engine/AudioEngine.test.ts src/utils/sessionDiff.test.ts` (RED first); `npm run build:types`, `npm run lint`.
  **Dependencies:** 2, 6. **Files:** `audioStore.ts`, `AudioEngine.ts`, `sessionDiff.ts` + tests. **Scope:** M.

- [ ] **Task 12: Delay hand-composed branch in `AudioRigEffectPanel`**

  **Description:** Spec §1.4 Delay paragraph: a `block.key === 'delay'` branch beside `compressor`; `delayTime` through `TempoSyncSlider` with `allowedDelayNoteValues(bpm)`; `feedback`/`wet` via `paramRow`; `sync`/`bpm` via their own conditional selectors (not by widening the `Record<string, number>` cast).

  **Acceptance criteria:** delay block = one `TempoSyncSlider` + two plain rows; other blocks unchanged; toggle → `setDelaySyncMode`; Sync change → `setGlobalAudio('delay', { sync })`; a non-delay panel's re-render count on a `bpm` change is unchanged (selector returns a stable value off-delay).
  **Verification:** `npx vitest run src/components/panels/screen/console/AudioRigEffectPanel.test.tsx` (RED first); `npm run build:types`, `npm run lint`.
  **Dependencies:** 9, 11. **Files:** `AudioRigDrawer.tsx`, `AudioRigEffectPanel.test.tsx`. **Scope:** S.

### Checkpoint C: Delay slice
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual (Crawford): Delay at 1/4 at 60 BPM → Tempo to 20 → readout clamps to the longest allowed note and the delay stops lengthening at 10 s; Anchored → Float keeps the heard time; an Audio Swell on Delay Amount still rides smoothly.
- [ ] Review with Crawford before proceeding.

---

### Phase 4: Seeding and persistence

- [ ] **Task 13: Seeded Sync rolls for lanes and Delay**

  **Description:** Spec §1.7 "Sync draws". `LFO_BANK_SYNC_ODDS` (a 0.75, b 0.66, c 0.33, d 0.25) and `DELAY_SYNC_ODDS` (0.66) in `globalAudioSeed.ts`; new keys `lfoBank.${lane}.syncMode/.syncNote` and `globalAudio.delay.syncMode/.syncNote`; candidate-band order own → next faster → next slower → outward; `seedBpm = generateAttenuationStyleBpm(id, name)` inside each seeder; existing keys and order untouched.

  **Acceptance criteria:**
  - [ ] Task 3's oracle passes with only `sync` keys added.
  - [ ] Determinism; every band non-empty for every integer BPM 40–100; every Sync draw inside its candidate band at the seed BPM; Delay draws inside 0.05–0.5 s.
  - [ ] Measured Sync share over 200 names within ±10 points of 75/66/33/25/66 %. If one misses, calibrate that constant (comment records the measured raw share), never the target — and report it at the checkpoint.

  **Verification:** `npx vitest run src/utils/globalAudioSeed.test.ts src/stores/audioStore.test.ts` (RED first); `npm run build:types`, `npm run lint`.
  **Dependencies:** 2, 3, 4. **Files:** `globalAudioSeed.ts`, `globalAudioSeed.test.ts`. **Scope:** M.

- [ ] **Task 14: Share-link `y` codec; restore-boundary sanitisers**

  **Description:** Spec §1.8. `CompactBankLfoSettings.y` encode/decode (unparseable → no `sync`). `sanitizeLaneSync`/`sanitizeDelaySync` in `sessionDiff.ts` beside `backfillLfoBank`, applied once in `applySessionPayload`.

  **Acceptance criteria:** spec §5 Persistence list in full (every entry round-trips; absent/garbage `y` → no key; mixed payload round-trips `toEqual`; `delay.sync` through `g`; invalid lane/delay `sync` applies as Free; no-`sync` v2 payload resolves to stored numbers).
  **Verification:** `npx vitest run src/utils/sessionShareUtils.test.ts src/utils/sessionDiff.test.ts` (RED first). **Mutation check:** remove the delay sanitiser and watch the invalid-delay case go red.
  **Dependencies:** 2, 5. **Files:** `sessionShareUtils.ts`, `sessionDiff.ts` + tests. **Scope:** S.

### Checkpoint D: Seeded worlds carry Sync, and it persists
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] Manual: a few fresh Attenuation Styles show the expected mix (slow lanes mostly Anchored, fast mostly Float, Delay mostly Anchored); save + reload and a share link both restore every toggle and note.
- [ ] Review with Crawford before proceeding.

---

### Phase 5: Docs

- [ ] **Task 15: Docs and roadmap**

  **Description:** Every doc in spec §2's `docs/` list: `AUDIO_SYSTEM.md` (BPM / Tempo rewritten for AS seeding; LFO Bank section gains Sync, resolvers, drift switch), `PROCEDURAL_GENERATION.md`, `DUPLICATE_VALUE_AUDIT.md` item 1, `GLOBAL_CHAIN_GRID.md` delay row (0–1 → 0–10, Sync note), `SLIDER_VALUES.md`, `COMPONENT_LIBRARY.md`, `SESSION_STORAGE.md`, a dated superseded-note atop `specs/archive/BPM_CONTROL.md` §1.3, `todo/roadmap.md` Phase 33 (Not Doing per spec §6). Tick this file's boxes. Repo-wide RED-first grep for stale claims before editing (`generateLocaleBpm`, "locale-seeded", "seeded per locale", "0–1 s").

  **Acceptance criteria:** every doc claim names a file and function that exist; the grep returns only historical spec/task records.
  **Verification:** `npm test` (content guard), `npm run lint`; read-through by Crawford.
  **Dependencies:** all. **Files:** the docs listed. **Scope:** M (docs only).

### Checkpoint E: Complete
- [ ] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [ ] `grep -rn "\.rate\b\|\.delayTime\b" src --include=*.ts --include=*.tsx | grep -v "\.test\."` — every hit is a resolver, the Free-mode slider wiring, a seeder, a serialiser, or the engine's own Hz copy. Anything else is a miss.
- [ ] Spec §5 manual list on the final build, including the Pixel listen at Light.
- [ ] Crawford's final review.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A consumer still reads `rate`/`delayTime` directly | High (wrong audio in Sync) | Spec §1.3's table is the checklist; Checkpoint E grep. |
| A seeder change perturbs Free values | High (every world sounds different) | Task 3 oracle captured first; Task 13 may only add `sync` keys. |
| Partial-merge leaves a stale `sync` | High (Free lane stuck synced after a load) | Whole-object replacement for every Sync → Free path; Task 5 mutation check. |
| Simplex draw doesn't give the stated odds | Med | Task 13 measured-share test; calibrate the constant. |
| BPM's new key has the offset-0 low-variety artifact | Med (similar tempos everywhere) | Task 4 distinct-values check; if it fails, pick a different key/offset and say so. |
| Delay wrapper slows or alters the swell path | Med | Key check only on `{ wet }`; Task 11 exact-forward test. |
| `GLOBAL_SETTER` wrapper throws at import | Med | Lazy store read; Task 11 `npm run dev` boot check. |
| Fractional eased index in the Sync readout | Low | `formatValue` rounds; Task 9 asserts readout at integer index. |
| Facade word veto after Task 9 | Low | String/option swap in one component; Checkpoint B asks. |

## Open Questions

- None blocking. Spec assumption 11 (lore word on the toggle facade) is put to Crawford at Checkpoint B.
