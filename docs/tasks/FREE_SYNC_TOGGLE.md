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

- [x] **Task 7: Content entries + `src/utils/formatNoteValue.ts`**

  **Description:** Spec §1.9 entries in `src/content/copy/ui.ts`; `formatNoteValue(nv)` reading every word through `labels`/`options`/`fill`.

  **Acceptance criteria:** `"1/8"`, `"1/8 dotted"`, `"1/4 triplet"`, `"1 bar"`, `"1 bar dotted"`, `"2 bars"`, `"4 bars"` — asserted against `CONTENT`, never a second literal; no trailing space on straight; `content.test.ts` green (if the "every key referenced" guard trips on `ui.tempoSync` before Task 9 references it, move that entry to Task 9 and say so in the commit).

  **As built:** **`ui.tempoSync` moved to Task 9**, as this criterion allowed — nothing outside `src/content/` references it until `TempoSyncSlider` does, so adding it here would fail the "every key referenced" guard. Task 7 adds the five `ui.noteValue.*` keys only; Task 9 must add `ui.tempoSync` (spec §1.9) with the component that reads it. The helpers are the live `CONTENT`/`fill`/`optionsRecord`; the digit is the only data (`'1/8'.slice(2)`). Tests build every expected string from `CONTENT` pieces (never a retyped word) and, to prove the formatter reads content rather than hardcodes it, swap each content field for a sentinel and assert the output follows (singular bar, plural template, fraction template, both modifier words, the modified-note template's order, and that straight never touches that template). Also asserts all 20 `NOTE_VALUES` read distinct, trimmed, no-`undefined`/`{}`/doubled-space. **Mutation check run:** using the raw modifier key (`dotted`/`triplet`) as the word, which any literal-based test would pass, turned the sentinel test red. Full suite 202 files / 4354 tests green.
  **Verification:** `npx vitest run src/utils/formatNoteValue.test.ts src/content` (RED first); `npm run lint`.
  **Dependencies:** 1. **Files:** `src/content/copy/ui.ts`, `src/utils/formatNoteValue.ts`, `.test.ts`. **Scope:** S.

- [x] **Task 8: `SliderLinearSchema.formatValue` + readout**

  **Description:** Optional field (doc comment mirroring `SliderLogSchema.formatValue`) and one ternary in `SliderLinear.tsx`'s `valueLabel` (shared by the interactive and `readOnly` branches).

  **Acceptance criteria:** with `formatValue` the readout is its return and no unit is appended; without it, unchanged; `controls.test.ts` still pins 14 types.

  **As built:** Mirrors `SliderLog.tsx` line for line: `schema.formatValue ? schema.formatValue(displayValue) : `${formatDisplayValue(displayValue)}${schema.unit ?? ''}``. `formatValue` receives the **eased display value, unrounded** (fractional mid-ease), so Task 9's Sync formatter must `Math.round` its argument — the schema doc comment says so. 12 tests: name instead of index, no unit even when the schema carries one, readOnly branch, absent-formatValue regression (with and without unit), unrounded argument, prop-driven change, live keyboard step (`onChange` gets the index, never the text), `aria-valuenow/min/max` stay numeric, an empty-string return renders empty, readout slot/class unchanged horizontal and vertical, memo contract holds for an identical schema. **Mutation check run:** appending the unit to `formatValue`'s output turned 2 tests red. **Not done, on purpose (scope):** the thumb has no `aria-valuetext`, so a screen reader hears the index ("5") rather than the note ("1/8 dotted") in Sync mode. That is an a11y gap in the shipped feature, not in this task's one-ternary scope — see Open Questions for the proposed follow-up.
  **Verification:** `npx vitest run src/components/ui/controls/SliderLinear.test.tsx src/types` (RED first).
  **Dependencies:** None. **Files:** `src/types/controls.ts`, `SliderLinear.tsx`, `SliderLinear.test.tsx`. **Scope:** XS.

- [x] **Task 9: `TempoSyncSlider` composition**

  **Description:** `src/components/ui/controls/TempoSyncSlider.tsx` + `.css` + `.test.tsx` per spec §1.4's prop contract: slider + `Toggle` row, Sync schema memoised on `[schema, allowed]`, clamped display index with no write on render, facade = current mode's lore word, `memo`-wrapped.

  **Acceptance criteria:** spec §5 `TempoSyncSlider` list in full (Free schema/readout; Sync max/step/readout/no unit; clamped index with no callback on render or re-render; toggle → `onModeChange` only, facade text from `CONTENT`; Sync arrow key → `onSyncChange(NoteValue)`, never `onFreeChange`).

  **As built:** `ui.tempoSync` added to `src/content/copy/ui.ts` here, as Task 7 deferred. 46 tests (the spec §5 list plus edges). Four things the spec did not spell out, each found by a RED test:
  - **The slider is keyed per mode** (`key={synced ? 'sync' : 'free'}`). `SliderLinear` eases any external value change over 250 ms, and a Free value (1.5 Hz) and a Sync index (3) are different spaces: without the key, flipping the toggle swept the thumb from 1.5 to 3 and the readout flashed the notes in between (RED: `aria-valuenow` read `1.5` right after the switch). Remounting lands on the value at once. A tempo change *within* Sync still eases, which is wanted.
  - **A range is never zero-width.** The Sync schema's `max` is `Math.max(1, allowed.length - 1)`: with one stop (or none) Radix divides by `max - min` and positions the thumb at NaN (jsdom throws a CSS parse error, a browser would silently misplace it). A list with fewer than two stops renders the slider *disabled* (nothing to choose between) and leaves the toggle usable so the lane can still go Free. Unreachable at 20–200 BPM with the real lists (they are 10+ stops), so this is insurance; the spec's `max = allowed.length - 1` still holds for every real list.
  - **The clamped index is the stop nearest in beats**, not "first/last by list direction": lane lists run slow → fast and Delay lists short → long, and this component knows neither. Nearest-in-beats gives the right end for both (tested with both orientations and with the real `allowedLaneNoteValues(200)` / `allowedDelayNoteValues(20)` lists). **Mutation check run:** returning 0 for any note outside the list turned 5 tests red.
  - **The toggle's accessible name is "Tempo Sync" in both modes** (spec §1.4's `labels('ui.tempoSync')`); the state is `aria-checked`, and the facade shows the lore word (Float / Anchored, assumption 11). Spec assumption 11's phrase "the human pair (Free / Sync) as its accessible name" reads as the two states, which a switch announces through `aria-checked`; a name that changes with state would be announced as a different control. Say if the intent was otherwise.

  Also: handlers are stable (`latest`-ref pattern, as `LfoLink`), so the slider's `onChange` identity survives re-renders and routes to the newest callbacks; the Sync schema is memoised on `[schema, allowed]` only (a note change does not rebuild it). **Known gap, unchanged from Task 8:** the thumb still has no `aria-valuetext`, so a screen reader hears the index in Sync mode — folded into Task 10 by Crawford (2026-10-02). Crawford also confirmed the toggle's "Tempo Sync" accessible name.
  **Verification:** `npx vitest run src/components/ui/controls/TempoSyncSlider.test.tsx` (RED first); `npm run lint`, `npm run build:types`. Full suite 203 files / 4412 tests; the two failures under the parallel run (`audioStore.test.ts` 5 s timeout, `worldTransition` swell-clear) are the recorded flakes and both pass alone.
  **Dependencies:** 7, 8. **Files:** the three new files. **Scope:** M.

- [x] **Task 10: `LfoBankLanePanel` renders Rate through `TempoSyncSlider`**

  **Description:** Spec §1.4 lane paragraph: subscribe to `sync` and `bpm`, memoise `allowedLaneNoteValues(bpm)`, wire the three callbacks (stable — `useCallback` per lane, matching the memo precedent in `AudioRigEffectPanel`). Shape and drift rows untouched.

  **Folded in (Crawford, 2026-10-02): the Sync-mode screen-reader gap found in Task 8.** In Sync mode the Radix thumb exposes only the numeric index (`aria-valuenow`), so a screen reader announces "5" instead of "1/8 dotted". Do this **first**, as its own RED → GREEN slice, before the panel wiring: `SliderLinear`'s `Slider.Thumb` gains `aria-valuetext={schema.formatValue?.(displayValue)}` (absent when there is no `formatValue`, so every existing slider's markup is unchanged); `aria-valuenow/min/max` stay numeric. `TempoSyncSlider` needs no change of its own — its Sync schema already carries `formatValue`, so Sync mode gets the note name and Free mode gets nothing. Delay (Task 12) inherits it for free. It sits in this task rather than Task 8/9 because Task 10 is the first one a user (and a screen reader) can reach; it does mean this task's commit spans three layers (`SliderLinear`, then the lane panel), so a revert of the panel wiring should keep the `SliderLinear` change.

  **Acceptance criteria:** composition renders for each lane; toggle calls `setLfoBankLaneSyncMode(lane, true/false)`; Sync readout at a known index changes with mocked `bpm`; Free edits still call `setLfoBank(lane, { rate })`; drift held-off behaviour unchanged.
  - [ ] `SliderLinear`: a schema with `formatValue` puts its return on the thumb as `aria-valuetext`, equal to the visible readout, and it follows a live keyboard step; a schema without `formatValue` renders no `aria-valuetext` attribute at all; `aria-valuenow` stays the numeric value; the `readOnly` branch is unchanged (it has no thumb).
  - [ ] `TempoSyncSlider`: Sync mode's thumb reads the note name (`"1/8 dotted"`, from `formatNoteValue`), Free mode's has no `aria-valuetext`, and the toggle flip swaps between them.
  - [ ] `LfoBankLanePanel`: in Sync the lane's thumb announces the note at the mocked `bpm`.
  **As built:** Three slices, RED first each time.
  - **`SliderLinear` `aria-valuetext`** (+13 tests). `formatValue` is now called **once** per render and the result feeds both the visible readout and the thumb's `aria-valuetext`, so what is seen and what is heard cannot disagree (a test pins the single call). Absent attribute, not an empty one, when the schema has no `formatValue`; the `readOnly` branch has no thumb and carries none. **Mutation check run:** `aria-valuetext={formattedValue ?? String(displayValue)}` turned both "absent" guards red. The `TempoSyncSlider` a11y assertions (+6) were proven by removing the `SliderLinear` change and watching 5 of them fail.
  - **`TempoSyncSlider` hardening** (+4 tests, not in the plan): an unrecognised stored `syncValue` (`{division:'1/3'…}`, a string, `null`, `0`, `{}`) now renders as **Free** — unchecked switch, number on the slider, steps write `onFreeChange`. The resolvers already treat it as Free (spec assumption 9), so without this the panel would have shown Anchored over audio that was running Free, until Task 14's restore-boundary sanitiser exists; `null` in particular counted as "synced" under the old `!== undefined` check. Done in the component, not the panel, so Delay (Task 12) inherits it. Validated once at the top (`isNoteValue`), so every later use sees a real note or `undefined`.
  - **`LfoBankLanePanel`** (+20 tests, 11 → 31). Subscribes to `sync` and `bpm`, `useMemo`s `allowedLaneNoteValues(bpm)`, and three `useCallback` handlers keyed on `[lane, store action]`. Tested against the **real store** with only `lfoEngine` mocked, so a wrong wiring shows as wrong state: Free edit writes `rate` and no `sync` key; a Sync step writes the next note, leaves `rate` untouched and pushes that note's Hz; the toggle writes the nearest note at 60 and at 120 BPM; Anchored → Float deletes the key (`'sync' in lane === false`) and lands on 1.35; a round trip leaves no key; shape/drifts survive a flip; the other three lanes are untouched; all four lanes render and flip independently; the toggle and Rate stay enabled while drift is held off. **Mutation check run:** writing `rate` instead of `sync` from the Sync handler and forcing the mode handler to `true` turned 4 tests red.
  - **Plan wording corrected:** "Sync readout at a known index changes with mocked `bpm`" is not quite true for lanes — lane lists run slow → fast from 0 Hz, so a note's index **does not move** with tempo; only the fast end shrinks. What does change with `bpm` is the slider's `max` and, for a stored fast note, the clamp: 1/32 triplet is 12 Hz at 60 BPM and 40 Hz at 200, so it shows the fastest allowed stop at 200 and the note again at 60, with nothing written to the store. That is what the test asserts.
  - **Not covered, on purpose:** that `TempoSyncSlider` bails out of re-rendering on a drift edit (the handlers are stable by construction, but there is no render-count test at the panel level). **Manual only:** the row's look — the toggle beside the voxel track at the panel's real widths — is Checkpoint B's.
  Full suite 203 files / 4456 tests; the one failure under the parallel run is the recorded `audioStore.test.ts` 5 s timeout (the `filterLPF/filterHPF` case), which passes alone.

  **Verification:** `npx vitest run src/components/ui/controls/SliderLinear.test.tsx src/components/ui/controls/TempoSyncSlider.test.tsx src/components/panels/screen/console/LfoBankLanePanel.test.tsx` (RED first for each); `npm run build:types`, `npm run lint`. **Mutation check:** have `SliderLinear` set `aria-valuetext` unconditionally (to `''` or the numeric text) and watch the "absent without `formatValue`" case go red.
  **Dependencies:** 5, 9. **Files:** `SliderLinear.tsx`, `SliderLinear.test.tsx`, `TempoSyncSlider.test.tsx` (assertions only), `LfoBankLanePanel.tsx`, `.test.tsx`. **Scope:** S–M.

### Checkpoint B: Lane slice — PASSED (Crawford, 2026-10-02)
- [x] `npm test`, `npm run lint`, `npm run build:types`, `npm run build` clean.
- [x] Manual (Crawford): flip a lane to Anchored, drag Tempo, hear its linked targets follow while a Float lane holds; Anchored → Float doesn't audibly jump; keyboard reaches the toggle and steps note values; the toggle's look in the panel (facade word veto, spec assumption 11). No vetoes raised.
- [x] Review with Crawford before proceeding.

---

### Phase 3: Delay slice

- [x] **Task 11: Delay store → engine; `setDelaySyncMode`; re-apply line**

  **Description:** Spec §1.3 delay rows and §1.5–1.6. `GLOBAL_SETTER.delay` becomes a wrapper that resolves when the partial carries `delayTime` or `sync` (reading the store lazily at call time) and forwards anything else untouched. `applyGlobalAudioToEngine(globalAudio, bpm)` resolves Delay; update its three callers (`regenerateGlobalAudioFromSeed`, `AudioEngine.start()`, `sessionDiff.applySessionPayload`). New `setDelaySyncMode(synced)` (whole `delay` write + push). `reapplyTempoSyncedValues` gains the Delay line.

  **Acceptance criteria:**
  - [ ] `setGlobalAudio('delay', { sync: 1/4 })` at 60 → `setGlobalDelay` with `delayTime: 1`; `{ delayTime: 0.3 }` with no `sync` → 0.3; `{ wet: 0.4 }` → forwarded as `{ wet: 0.4 }` exactly (swell path, spec §7 risk 4).
  - [ ] `applyGlobalAudioToEngine` pushes a resolved `delayTime` and no `sync`; mode round trip leaves no `sync` key; `setBPM` re-pushes a synced Delay and not a Free one.
  - [ ] `audioStore.ts` still imports cleanly (module-scope table builds; `npm run dev` boots with no console error).
  **As built:** RED first (32 new tests failing, every Free-path passthrough test already green), then GREEN. +45 tests: 37 in `audioStore.test.ts`, 3 in `AudioEngine.test.ts`, 5 in `sessionDiff.test.ts`.
  - **`setGlobalDelayResolved`** (a module function in `audioStore.ts`, wired as `GLOBAL_SETTER.delay`). A partial with `delayTime` or `sync` in it pushes `{ ...rest, delayTime: resolveDelayTimeSeconds(storedDelay, bpm) }` with `sync` stripped; anything else is forwarded as the very same partial. It resolves from the **stored** (already merged) delay, so a Free `delayTime` edit on a synced Delay re-sends the synced seconds, the same shape as lanes' `setLfoBank`. An explicit `sync: undefined` resolves as Free. Reads `useAudioStore` lazily, so the module-scope table still builds.
  - **`applyGlobalAudioToEngine(globalAudio, bpm)`** takes the tempo as a required parameter and pushes `{ ...delay, delayTime: resolved }` with `sync` stripped; the input is not mutated. Callers: `regenerateGlobalAudioFromSeed` (store bpm, already the new Attenuation Style's because BPM reseeds first), `AudioEngine.start()` (the `bpm` it already destructured), `applySessionPayload` (**`payload.bpm ?? live bpm`** — the payload's own tempo, so a synced Delay is never pushed at the old world's tempo before `setBPM(payload.bpm)` lands; the later `setBPM` re-push is then a no-op in value).
  - **`setDelaySyncMode(synced)`**: `delayToSync`/`delayToFree` on the stored delay, one whole `globalAudio.delay` write, one `setGlobalDelay({ delayTime })` push. Nothing else on the engine moves.
  - **`reapplyTempoSyncedValues`** gains the Delay line (and its `Pick` gains `globalAudio`); a Free Delay is never pushed.
  - **Edge cases pinned:** the Audio Swell's `{ wet }` and a `{ feedback }` edit stay byte-for-byte (no `delayTime` added) on a synced Delay; 4 bars at 40 BPM (24 s) pushes 10, and moving the tempo back restores the note's own seconds because the clamp is never written to state; Sync → Free stores the **quantised** seconds and pushes that same number (1/4 triplet at 70 BPM → 0.571), and from a clamped note stores 10, not 24; Free → Sync from 0 s lands on the shortest allowed note and from 10 s at 40 BPM on the longest; already-Sync keeps its note, already-Free is a no-op write; the state stays JSON-clean in both modes and a round trip leaves no `sync` key.
  - **Seeded-Delay wiring tested ahead of Task 13:** `regenerateGlobalAudioFromSeed` is exercised with the seed generator mocked to emit a synced Delay, so the `get().bpm` argument is proven now, not discovered when Task 13 starts seeding Sync. **Mutation checks run:** removing the swell passthrough turned 3 tests red; making the re-apply push unconditionally turned "never touches a Free Delay" red.
  Full suite 203 files / 4501 tests; the one failure under the parallel run is the recorded `worldTransition` swell-clear flake, which passes alone (43/43). `npm run build:types` and `npm run lint` clean. Manual: `npm run dev` boot not run (no browser in this session) — the module-scope table is exercised by every `audioStore.test.ts` import.

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

- None blocking. The lore word on the toggle facade (spec assumption 11) is put to Crawford at Checkpoint B.
- **A11y gap found in Task 8 — RESOLVED 2026-10-02 (Crawford): folded into Task 10.** In Sync mode the Radix thumb exposed only the numeric index, so a screen reader announced "5" instead of the note name. Fix: `aria-valuetext` on `SliderLinear`'s thumb from the same `formatValue`; see Task 10's "Folded in" paragraph.
- **Spec assumption 11 (toggle accessible name) — RESOLVED 2026-10-02 (Crawford):** the switch is named "Tempo Sync" in both modes; Free/Sync is announced through `aria-checked`, and the facade shows the lore word. Not a Checkpoint B veto item any more except for the Float/Anchored facade wording itself.
- **Not done, on purpose:** `SliderLog` has the same `formatValue` and the same missing `aria-valuetext` (Automation Rate uses it). Out of this feature's scope; flagged for a separate a11y follow-up.
