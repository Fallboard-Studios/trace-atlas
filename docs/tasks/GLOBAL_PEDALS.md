# Implementation Plan: Global Pedals — Chorus, Tremolo, Vibrato, Frequency Shifter and Stereo Width

Spec: [docs/specs/GLOBAL_PEDALS.md](../specs/GLOBAL_PEDALS.md). Intent:
[docs/intent/global-pedals.md](../intent/global-pedals.md). Proposed roadmap **50.6**; backlog item 22.
Build branch `feature/palette-pedals` (a proposed name; Crawford creates it), off `main` at `4a9b3fec` or
later. **These three docs were written on `perf/per-mover-layers` (docs only, no source changes there,
Crawford 2026-10-17); they travel to the build branch when it is cut.**

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf`; the phone gate is the `?debug` HUD on the Pixel (spec §5).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status (2026-10-18): T1–T13 BUILT on `feature/pedals`** (Crawford's branch name; this plan says
> `feature/palette-pedals` throughout), Checkpoints A–C passed, the five-axis review's follow-ups applied. Open:
> T0 and T14 (the Pixel, Crawford's device), T15b only on a miss, T16, T17.
>
> **Update (2026-10-19): T0 and T14 ran, and T14 MISSED** (docs/todo/scratchy-audio-phones.md, "Global Pedals (roadmap
> 50.6) on the Pixel"). The cause is the dark effects still processing, not the lit ones, so T15b would not help and is
> dropped. In its place comes the **Dark-Effect Bypass**: intent confirmed at
> [docs/intent/dark-effect-bypass.md](../intent/dark-effect-bypass.md); its spec and tasks come next. It lands before
> T16 and T17, and T14 is re-run on it.
>
> **Update (2026-10-20): the Dark-Effect Bypass is BUILT** ([plan](DARK_EFFECT_BYPASS.md), T0–T15;
> [spec §8](../specs/DARK_EFFECT_BYPASS.md)). Checkpoint B, Crawford's desktop listen, passed. T14 was re-run on it
> (phone rounds 3 and 4) and **passed with a caveat** by Crawford's call. The caveat: a run late in a sitting collapses
> on the Pixel whatever the build, `main` included, which is backlog 27. ~~Next: T16 (Crawford's listen), then T17.~~
> **T16 passed (2026-10-20, "it sounds fine"; nothing moved). ~~Next: T17.~~**
>
> **Update (2026-10-21): T17 done; the plan is complete.** The branch review's follow-ups passed Crawford's check on
> desktop and phone ("it all sounds good on desktop and the phone"). The docs are written (spec §8, "What T17 wrote") and
> `src/docs/globalPedalsDocs.test.ts` is green. Left: Crawford opens the PR from `feature/pedals`.
>
> *(Original status, 2026-10-17:)* The spec is written and awaiting Crawford's approval; its veto points
> (spec §7) are the slot order (since answered: the Vibrato is stereo, so only the shifter's sideband leak on
> panned voices is open), the cap mechanism (sequential or pick-two), the
> nominal odds, the lit bands (the shifter's ±2–20 Hz above all), always-running LFOs, the widener taking the
> Controlled-Decay join, `sliderCenteredZero` for the shift, presets clean, lore words and the roadmap number.

## Overview

Seventeen tasks in five phases, plus a device task that runs first. **Phase 0** re-baselines the Pixel on
current `main`, because neither 50.3's nor 50.4's re-baseline ran and the chain has changed three times
since the series baseline. **Phase 1** is data and engine, nothing visible: the five settings blocks and
their ranges, the generic Free | Sync rail with the Phaser migrated onto it, the five nodes with their
setters (the widener's join move is its own task, because it is the one change to existing wiring), the
store rail, and the seeded rolls with the two-of-six cap — audible from a fresh seed at Checkpoint A with no
UI. **Phase 2** is the sub-tabs as one vertical slice: content, rig blocks and nav lists, then the drawer's
generalised synced-rate branch, usable at Checkpoint B. **Phase 3** makes old payloads load with defaults
and drops a bad `sync` on any synced block. **Phase 4** is the guard test, the phone gate done in full, the
conditional threshold and Crawford's listen (where the bands and the order veto are settled). **Phase 5** is
docs, the roadmap 50.6 entry and the backlog 22 rewrite. Every task leaves types, lint and the suite green;
RED first; one commit per task; the mutation harness at the named gates.

## Architecture Decisions

- **Types, presets, fixtures and placeholders in one commit (T1).** `GlobalAudioSettings` gaining five
  required keys breaks every full literal and `EffectKey`-indexed record: `transmissionPresets.ts` (three),
  `AudioEngine.test.ts`'s fixture, the two seed oracles and `GLOBAL_SETTER`. 50.3 and 50.4 both learned this;
  T1 carries the presets, the fixture, default blocks in the seeder's return literal, default blocks in both
  oracles and `GLOBAL_SETTER` no-op placeholders, so the tree compiles; T7 replaces the placeholders and T8
  replaces the seeder's literals with draws.
- **The grid rows are documentation (T2), not parsed by the range tests.** T2 writes the sixteen rows beside
  the tables so the guard test (T13) finds them; nothing in T2 is red on a grid typo.
- **The generic rail lands with the Phaser as its first client (T3), before any new node.** The four
  generic helpers are pure and mutation-gated; the Phaser's four helpers become wrappers in the same commit
  and their existing tests must pass unchanged — that is the proof the generalisation is faithful, and it
  happens before three new callers exist.
- **Nodes land in pairs by Tone family (T4 the two `StereoEffect` LFO pedals, T5 the two plain `Effect`s),
  then the widener alone (T6).** T4 establishes the `start()` expectation and the Signal-vs-plain-setter split
  for a `StereoEffect`; T5 covers the plain `Effect`s (first thought mono; the Vibrato is stereo and only the
  shifter's sine branch is downmixed, spec §8) and the signed `shift`; T6 moves the Controlled-Decay join,
  the only change to wiring that exists today, with its own chain-order test in both modes.
- **Store before the seeder (T7 before T8).** The seeder's values reach the engine only through
  `applyGlobalAudioToEngine`, so Checkpoint A can be heard.
- **The cap is sequential and the AutoWah / Phaser draws are not touched (T8).** The oracles for those two
  stay byte-identical, which the existing `toStrictEqual` proves. The four new rolls are read on every style
  and the cap is applied after the roll, so the draw set is total. The calibration test pins **measured**
  shares, recorded in its comment at the task, not nominal ones.
- **The drawer's Phaser branch is generalised, not copied (T11).** One `SYNCED_RATE_BLOCKS` set and one
  branch for four blocks; the Phaser's existing drawer tests keep passing.
- **The sanitiser is generalised the same way (T12).** `sanitizeSyncedRate` over four keys; the Phaser's
  existing sessionDiff tests keep passing.
- **The phone gate is three steps and all three are recorded (T0, T14).** Counts at start and end, both
  tiers, or the task is not done. Bisect only on a miss.
- **One listen settles the bands and the order (T16), as 50.4's T16 did.** T8 ships placeholder bands; T16
  moves them and the calibration targets move with them.

## Dependency Graph

```
T0 re-baseline on main (STOP, device) ─────────────────────────────────────────────────────────┐
                                                                                                │
T1 types + defaults + PEDAL_RATE consts + presets + fixture + placeholders                       │
 ├─► T2 seed keys + both range tables + grid rows                                               │
 │    ├─► T4 Chorus + Tremolo nodes and setters                                                 │
 │    ├─► T5 Vibrato + FrequencyShifter nodes and setters                                       │
 │    └─► T6 StereoWidener node, setter, the Controlled join moves                              │
 ├─► T3 generic SyncedRate rail, Phaser wrappers ─┐                                             │
 │                                                └─► T7 store rail ─► T8 rolls + cap + sync + sign + 16 draws + oracles + calibration
 │                                                        (needs T4–T6)          │              │
 ├─► T9 content ─┐                                                        Checkpoint A          │
 │               └─► T10 rig blocks + effect keys + trait map + nav lists ─► T11 synced-rate drawer branch ─► Checkpoint B
 └─► T12 sanitizeSyncedRate + restore/decode tests ───────────────────────────────────────────┘  │
                                                                          Checkpoint C           │
                                                                               │                 │
                                   T13 docs/symbol guard ─► T14 phone gate (STOP) ◄──────────────┘
                                                                  │
                                                        T15b LOAD_PEDALS_MIN (only if T14 misses) ─► T14 again
                                                                  │
                                                        T16 Crawford's listen + tuning + order veto (STOP)
                                                                  │
                                                        T17 docs + roadmap 50.6 + backlog 22 ─► Complete
```

T9 is independent of everything but T1 and may run in a parallel session; never share a file in one commit
(`fleet.ts` is T9's). T4, T5 and T6 are independent of each other and may run in any order after T2.

## Phase 0: The device baseline

### Task 0: Re-baseline the Pixel on current `main` — **STOP for Crawford**

**Description:** The series baseline in `docs/todo/scratchy-audio-phones.md` ("Baseline for the Audio Palette
series") was measured on `ca2b6868`, before Sends, Colour, Modulation and Performance changed the chain;
50.3's and 50.4's re-baselines were planned and not run. Run the same world (`?debug&session=` + the recorded
payload: seed `alpha`, camera 0/50, defaults) on `main` at `4a9b3fec` or later: Pixel 8, Chrome, the Vite
preview build, **Full 3:00** and **Standard 3:00**, and record the HUD `underruns` start → end for each.

**Acceptance criteria:**
- [ ] A new dated section in `scratchy-audio-phones.md` with the commit hash, both runs and both counts.
- [ ] The 2026-10-13 section is marked retired and points at the new one.

**Verification:** Crawford's runs; the numbers are written by whoever runs them. No code.

**Dependencies:** None. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (gated on a device).

---

## Phase 1: Data and engine (nothing visible)

### Task 1: Types, defaults, `PEDAL_RATE_RANGE_HZ`, presets, fixture, placeholders

**Description:** `src/types/globalAudio.ts` gains `ChorusSettings`, `TremoloSettings`, `VibratoSettings`,
`FrequencyShifterSettings` and `StereoWidenerSettings` (spec §1.1, each `sync?: NoteValue` documented like
the Phaser's), the five keys on `GlobalAudioSettings` (four after `phaser`, `stereoWidener` after them and
before `limiter`), `PEDAL_RATE_RANGE_HZ` / `PEDAL_RATE_STEP_HZ` as re-exports of the Phaser constants, and
assumption 10's defaults in `DEFAULT_GLOBAL_AUDIO_SETTINGS`. The same commit adds the five default blocks to
each of the three `TRANSMISSION_PRESETS`, to `AudioEngine.test.ts`'s fixture, to the seeder's return literal
(as plain defaults, replaced by draws in T8), to both oracles in `globalAudioSeed.test.ts` (as defaults, by
hand), and five no-op entries to `GLOBAL_SETTER` with a `// T7` comment, so the tree compiles.

**Acceptance criteria:**
- [ ] `DEFAULT_GLOBAL_AUDIO_SETTINGS` carries the five blocks at Tone's defaults with `wet: 0` and
  `width: 0.5`, and no `sync` key on any of them.
- [ ] `withGlobalAudioDefaults({})` returns all five blocks; a partial with a present block keeps it untouched
  (no deep merge); `PEDAL_RATE_RANGE_HZ` is `PHASER_RATE_RANGE_HZ` by identity.
- [ ] Every preset's `globalAudio` has the five blocks at their defaults; `npm run build:types`, `npm run lint`
  and the full suite are green.

**Verification:** `npx vitest run src/types/globalAudio.test.ts src/data/transmissionPresets.test.ts
src/utils/globalAudioSeed.test.ts src/engine/AudioEngine.test.ts`; `npm run build:types`.

**Dependencies:** None. **Files:** `src/types/globalAudio.ts`, `.test.ts`, `src/data/transmissionPresets.ts`
(+ test), `src/utils/globalAudioSeed.ts`, `.test.ts`, `src/engine/AudioEngine.test.ts`,
`src/stores/audioStore.ts`. **Scope:** M (mechanical).

---

### Task 2: Seed field keys, both range tables, the grid rows

**Description:** `GlobalAudioSeedFieldKey` gains the sixteen keys of spec §1.1. `GLOBAL_AUDIO_SEED_RANGES`
gains assumption 5's full ranges (`frequencyShifter.shift` signed −1000–1000, stepped fields with their
step); `GLOBAL_AUDIO_LOADING_RANGES` gains assumption 6's lit bands (the shifter's `shift` row is the
magnitude band 2–20 with a comment that the sign is a separate draw; the widener's band 0.4–0.65 with a
comment that 0 is hand-only). `docs/reference/GLOBAL_CHAIN_GRID.md` gains sixteen rows in the
`| <effect> | \`<setter>()\` | <param> | …` shape the guard test matches — the four motion blocks' rows after
the Phaser rows, the Width row after the Compressor rows — with the Tone name beside each where it differs
(`rate` → `frequency`, `shift` → `frequency`), and the chain-order line becomes "… → Phaser → Chorus →
Tremolo → Vibrato → FrequencyShifter → Compressor → StereoWidener → Limiter" with a footnote ⁵.

**Acceptance criteria:**
- [ ] Both range tests list every new key, each loading range inside its full range except
  `frequencyShifter.shift` (magnitude band inside the signed full range, asserted explicitly), every stepped
  field's loading edges on the step; `stereoWidener.width` loading minimum > 0.
- [ ] The row-count guard in `globalAudioSeed.test.ts` is extended for the four new Mix rows and the shift
  magnitude row, with its rationale updated.
- [ ] The grid has sixteen new rows and the new chain-order text; `npm run lint` and the suite are green.

**Verification:** `npx vitest run src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts
src/utils/globalAudioSeed.test.ts`.

**Dependencies:** T1. **Files:** `src/data/globalAudioSeedRanges.ts`, `.test.ts`,
`src/data/globalAudioLoadingRanges.ts`, `.test.ts`, `docs/reference/GLOBAL_CHAIN_GRID.md`. **Scope:** S.

---

### Task 3: The generic `SyncedRate` rail; the Phaser's helpers become wrappers

**Description:** `src/utils/tempoSync.ts` gains `SyncedRate`, `resolveSyncedRateHz(field, bpm, range)`,
`allowedRateNoteValues(bpm, range)`, `syncedRateToSync(field, bpm, range)` and `syncedRateToFree(field, bpm,
range, step)` (spec §1.5). `resolvePhaserRateHz`, `allowedPhaserNoteValues`, `phaserToSync` and `phaserToFree`
become one-line wrappers over them with `PHASER_RATE_RANGE_HZ` / `PHASER_RATE_STEP_HZ`. Not one existing
Phaser test changes.

**Acceptance criteria:**
- [ ] The generic four tested on a `ChorusSettings`-shaped object: Free → `rate`; Sync → the note's Hz at `bpm`
  clamped into the range; invalid `sync` → `rate`; the allowed list non-empty, inside the range, ascending in
  Hz; `toSync` snaps to the nearest allowed note and keeps `rate`, a synced input returns a copy on the same
  note; `toFree` carries no `sync` key, `rate` is the heard Hz quantised to `step` and floored at `range.min`;
  a Free input returns an equal copy; every other field of the object is preserved.
- [ ] The existing Phaser helper tests pass unchanged (the wrappers are faithful). **Mutation:** make a wrapper
  pass the Delay's range and a Phaser test must fail.
- [ ] `isNoteValue` is the only `sync` read, as the file's header rule says.

**Verification:** `npx vitest run src/utils/tempoSync.test.ts`; mutation harness on `tempoSync.ts`.

**Dependencies:** T1. **Files:** `src/utils/tempoSync.ts`, `.test.ts`. **Scope:** S.

---

### Task 4: The Chorus and Tremolo nodes and setters

**Description:** `globalFx.ts` constructs `_globalChorus` behind `getToneCtor('Chorus')` and `_globalTremolo`
behind `getToneCtor('Tremolo')` at Tone's defaults with `wet: 0`, **calls `start()` on each** (spec
assumption 4), adds both to `chainNodes` after `_globalPhaser` and to `disconnectAllFxNodes`' list, and gains
`setGlobalChorus` and `setGlobalTremolo` (spec §1.3, the §4 example): `rate` → `node.frequency` ramp,
`feedback` / `depth` Signals ramped, `delayTime` / `depth` (Chorus) / `spread` plain writes, `wet` →
`colourWetGain` ramp, every value through `clampIfGiven`, null-guarded and try/caught. `AudioEngine.ts`
re-exports both.

**Acceptance criteria:**
- [ ] `buildGlobalFxChain` constructs exactly one Chorus and one Tremolo (constructor counts) and `start()` is
  called once on each; with either ctor missing the chain still wires.
- [ ] `wireGlobalFxChain(false)` and `(true)` both connect Phaser → Chorus → Tremolo → … → Compressor, and the
  returns still join at the Compressor / Limiter (connection-order assertion); `disconnectAllFxNodes` drops
  both.
- [ ] Each setter: Signals ramped (`frequency`, `feedback`, Tremolo `depth`), plain fields set (`delayTime`,
  Chorus `depth`, `spread`), `wet` squared, out-of-range clamped into the full range, NaN ignored, no-op without
  a node. **Mutation:** remove the `start()` and the constructor test must fail; remove the taper and the
  `wet` test must fail.

**Verification:** `npx vitest run src/engine/AudioEngine.test.ts src/engine/audioEngine/globalFx.test.ts`.

**Dependencies:** T2. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`, `src/engine/AudioEngine.ts`,
`.test.ts`. **Scope:** S.

---

### Task 5: The Vibrato and FrequencyShifter nodes and setters

**Description:** `globalFx.ts` constructs `_globalVibrato` behind `getToneCtor('Vibrato')` (Tone's `maxDelay`
default, `wet: 0`; **no `start()` — the constructor starts it**, and the test pins that nothing calls
`start` on it) and `_globalFrequencyShifter` behind `getToneCtor('FrequencyShifter')` (`frequency: 0`,
`wet: 0`), adds both to `chainNodes` after `_globalTremolo` and to the disconnect list, and gains
`setGlobalVibrato` (`rate` → `frequency` ramp, `depth` ramp, `wet` tapered ramp) and
`setGlobalFrequencyShifter` (`shift` → `frequency` ramp, signed clamp, `wet` tapered ramp). `AudioEngine.ts`
re-exports both.

**Acceptance criteria:**
- [ ] `buildGlobalFxChain` constructs exactly one of each; the chain in both modes reads … Tremolo → Vibrato →
  FrequencyShifter → Compressor …; with either ctor missing the chain still wires.
- [ ] `setGlobalFrequencyShifter({ shift: -3000 })` ramps `frequency` to −1000 and `{ shift: 12 }` to 12 (a
  signed clamp, not an absolute one). **Mutation:** clamp with `Math.abs` and the negative case must fail.
- [ ] `setGlobalVibrato` ramps `frequency` and `depth`, squares `wet`, clamps, ignores NaN, no-ops without a
  node.

**Verification:** `npx vitest run src/engine/AudioEngine.test.ts src/engine/audioEngine/globalFx.test.ts`.

**Dependencies:** T2. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`, `src/engine/AudioEngine.ts`,
`.test.ts`. **Scope:** S.

---

### Task 6: The StereoWidener node, its setter, and the Controlled-Decay join moves

**Description:** `globalFx.ts` constructs `_globalStereoWidener` behind `getToneCtor('StereoWidener')`
(`width: 0.5`, `wet: 1`), places it in `chainNodes` **between `_globalCompressor` and `_globalLimiter`**, adds it
to the disconnect list, and changes the join line (`globalFx.ts:336`) to `join = (controlledDecay ?
(_globalStereoWidener ?? _globalLimiter) : _globalCompressor) ?? _globalLimiter ?? _globalCompressor` (spec
assumption 2). `setGlobalStereoWidener({ width })` ramps `node.width` with **no taper**. `AudioEngine.ts`
re-exports it.

**Acceptance criteria:**
- [ ] In both modes the chain reads … Compressor → StereoWidener → Limiter → master; under Natural the returns
  join at the Compressor (unchanged); **under Controlled the returns join at the widener**, not the Limiter;
  with the widener ctor missing the Controlled join falls back to the Limiter as today. **Mutation:** leave the
  join line unchanged and the Controlled case must fail.
- [ ] A Decay flip after a `width` change keeps the width (the node is not rebuilt).
- [ ] `setGlobalStereoWidener({ width: 0.3 })` ramps to 0.3 (not 0.09); clamps 0–1; NaN ignored; no-op without a
  node.

**Verification:** `npx vitest run src/engine/AudioEngine.test.ts src/engine/audioEngine/globalFx.test.ts`.

**Dependencies:** T2. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`, `src/engine/AudioEngine.ts`,
`.test.ts`. **Scope:** S.

---

### Task 7: The store rail — the resolved-rate factory, `setPedalSyncMode`, tempo re-apply, apply

**Description:** `audioStore.ts` gains `SYNCED_RATE_KEYS = ['phaser', 'chorus', 'tremolo', 'vibrato']` and a
`setGlobalRateResolved(key)` factory (the `setGlobalPhaserResolved` body generalised: read the block and `bpm`
after the merge, strip `sync`, resolve `rate` through `resolveSyncedRateHz` with `PEDAL_RATE_RANGE_HZ`, call
the engine setter). `GLOBAL_SETTER`'s five placeholders become the factory's instances for the three LFO
pedals and the direct engine setters for the shifter and the widener; `phaser` becomes the factory's
`'phaser'` instance. `setPedalSyncMode(key, synced)` replaces `setPhaserSyncMode`'s body, which stays as a
wrapper. `reapplyTempoSyncedValues` loops `SYNCED_RATE_KEYS`. `applyGlobalAudioToEngine` pushes the five
blocks after `phaser`, in chain order.

**Acceptance criteria:**
- [ ] `setGlobalAudio('chorus', { sync: '4n' })` reaches `AudioEngine.setGlobalChorus` with `rate` resolved
  at the store's `bpm` and **no `sync` property**; the same for `tremolo` and `vibrato`; `phaser` still
  behaves as before (its existing tests pass).
- [ ] `setPedalSyncMode('tremolo', true)` then `(false)` converts both ways, the stored `rate` snapping then
  keeping the heard Hz; `setPhaserSyncMode` still works.
- [ ] `setBPM` re-pushes every synced pedal and leaves Free ones alone (one engine call per synced block, none
  for Free); `applyGlobalAudioToEngine` calls all five new setters with the stored values, rates resolved.
  **Mutation:** drop `chorus` from `SYNCED_RATE_KEYS` and the `setBPM` test must fail.

**Verification:** `npx vitest run src/stores/audioStore.test.ts`.

**Dependencies:** T3, T4, T5, T6. **Files:** `src/stores/audioStore.ts`, `.test.ts`. **Scope:** S.

---

### Task 8: The lit rolls, the two-of-six cap, three sync pairs, the sign draw, sixteen value draws, the oracles by hand, calibration

**Description:** `globalAudioSeed.ts` widens `PEDAL_LIT_EDGE` to six keys (nominal 0.25 / 0.25 / 0.25 / 0.15 for
the new four), adds `MAX_LIT_PEDALS = 2`, `PEDAL_SYNC_ODDS = 0.5` (with `PHASER_SYNC_ODDS` kept as an alias),
`MOTION_PEDALS` in chain order, the sequential roll of spec §1.2 (every roll key read on every style, the cap
applied after the roll, counting the AutoWah and Phaser results), a `syncMode` / `syncNote` uniform pair per
LFO pedal (sync only when lit), the `frequencyShifter.sign` draw, and sixteen `sampleField(…, true)` value
draws replacing T1's literal defaults; a dark pedal keeps `wet: 0`. The two oracles are amended **by hand**
from the raw draws (the 50.3 / 50.4 method: derive, then reproduce the old numbers) — every pre-existing value
byte-identical. The calibration test measures the realised shares over 3 000 styles and records them in a
comment.

**Acceptance criteria:**
- [ ] Both oracles pass with the five blocks' hand-derived values and nothing else moved (the existing
  `toStrictEqual`); the AutoWah and Phaser values in both oracles are unchanged from T1.
- [ ] Calibration over 3 000 styles: AutoWah and Phaser lit shares unchanged (33 ± 3 %); each motion pedal's
  measured share within ±3 points of the figure in the test's comment; **no style has more than two
  Modulation pedals lit**; the shifter's share is the lowest of the four; a lit LFO pedal is synced within ±5
  points of `PEDAL_SYNC_ODDS`, a dark one never; a dark pedal has `wet === 0`, a lit pedal's `wet` is inside
  its band; `shift` is never inside ±2 Hz and both signs occur; `width` is inside 0.4–0.65; Colour's character
  shares unchanged. **Mutation:** remove the cap and the two-max assertion must fail; stop reading a capped
  pedal's roll key and the determinism/oracle test must fail.
- [ ] `generateGlobalAudioSettings` is deterministic per style (same input, `toStrictEqual`).

**Verification:** `npx vitest run src/utils/globalAudioSeed.test.ts`; mutation harness on `globalAudioSeed.ts`.

**Dependencies:** T7. **Files:** `src/utils/globalAudioSeed.ts`, `.test.ts`. **Scope:** S (one file pair, but
the hand-derivation is slow; keep it alone in its commit).

---

### Checkpoint A: Data and engine
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Proves: five nodes in their slots in both Decay Modes and the Controlled join at the widener (T4–T6); the
  Chorus and Tremolo LFOs started (T4); the store reaches every node and a synced rate follows the tempo (T7);
  a fresh world lights the pedals under the cap (T8); old presets and fixtures still load (T1).
- [ ] **Manual (Crawford, `npm run dev`):** cycle a few seeds (the HUD's first line shows the seed): some worlds
  shimmer, some pulse, some wobble, the odd one rings; never more than two pedals at once by ear; nothing clicks
  on power-on or a Decay flip; the stereo image is as before (width 0.5). There is no UI yet — this is a
  listen, not a tuning pass; T16 tunes.
- [ ] Reviewed with Crawford before Phase 2.

---

## Phase 2: The sub-tabs (one vertical slice)

### Task 9: Content entries

**Description:** `src/content/copy/fleet.ts` gains five heading entries and sixteen parameter entries (spec
§1.7, assumption 16's placeholder lore words), each parameter with `help.human` and a unit where one applies;
the rate helps explain Free and Sync the way `fleet.phaser.rate` does; the width help says 0 is mono for a
phone speaker and 0.5 is as recorded. `fleet.modulation`'s and `fleet.output`'s intros each gain one sentence.

**Acceptance criteria:**
- [ ] `content.test.ts` passes (every key well-formed, no duplicate, no orphan); `npm run lint` passes the
  no-literal rule.
- [ ] Every key the T10 blocks will reference exists: `fleet.chorus`, `.rate`, `.delay`, `.depth`, `.spread`,
  `.feedback`, `.mix`; `fleet.tremolo`, `.rate`, `.depth`, `.spread`, `.mix`; `fleet.vibrato`, `.rate`,
  `.depth`, `.mix`; `fleet.frequencyShifter`, `.shift`, `.mix`; `fleet.stereoWidener`, `.width`.

**Verification:** `npx vitest run src/content/content.test.ts`; `npm run lint`.

**Dependencies:** T1. **Files:** `src/content/copy/fleet.ts`. **Scope:** XS. May run in parallel with T2–T8.

---

### Task 10: Rig blocks, effect keys, trait map, nav sub-tab lists

**Description:** `AudioRigEffectKey` gains the five keys; `AUDIO_RIG_CONFIG` gains the four motion blocks after
`phaser` and before `delay` and the `stereoWidener` block between `compressor` and `limiter`, `panelSchema(key,
content, 'column')`, params in spec §1.1 order with assumption 5's types, ranges and steps (`rate` rows
`sliderLinear` over `PEDAL_RATE_RANGE_HZ` / `PEDAL_RATE_STEP_HZ`; `shift` a `sliderCenteredZero`), no
`lfoTarget`. `AUDIO_RIG_EFFECT_TRAIT` maps the four to `spectral` and the widener to `output`.
`FLEET_PARAMS_SUBSECTIONS.modulation` gains the four after `phaser`; `.output` gains `stereoWidener` between
`compressor` and `limiter`.

**Acceptance criteria:**
- [ ] `audioRigConfig.test.ts`: seventeen blocks in grid order; the five blocks' params, types, ranges and
  steps; 29 pedal param ids in all (13 + 16); every id unique; no `lfoTarget` on any pedal row; `shift` is
  `sliderCenteredZero`.
- [ ] `navActions.test.ts`: Modulation lists six sub-tabs in chain order, Output three with Width in the
  middle; `FleetParamsScreen.test.tsx`: both shells render them and the breadcrumbs read "Modulation / Chorus"
  and "Output / Width" (placeholder words via content).
- [ ] The drawer renders every new block through `paramRow` (the rate rows as plain sliders until T11).

**Verification:** `npx vitest run src/data/audioRigConfig.test.ts src/components/panels/screen/nav/navActions.test.ts
src/components/panels/screen/screens/FleetParamsScreen.test.tsx src/components/panels/screen/console/AudioRigDrawer.test.tsx`.

**Dependencies:** T1, T9. **Files:** `src/data/audioRigConfig.ts`, `.test.ts`,
`src/components/panels/screen/nav/navActions.ts`, `.test.ts`, `src/components/panels/screen/console/AudioRigDrawer.tsx`,
plus the screen test. **Scope:** M.

---

### Task 11: The synced-rate rows through `TempoSyncSlider` — the Phaser branch generalised

**Description:** `AudioRigDrawer.tsx`'s `block.key === 'phaser'` branch (`:344`) becomes
`SYNCED_RATE_BLOCKS.has(block.key)` over the four synced keys: the `rate` row is a `TempoSyncSlider`
(`freeValue = effect.rate`, `syncValue = globalAudio[key].sync`, `allowed = allowedRateNoteValues(bpm,
PEDAL_RATE_RANGE_HZ)` memoised on `bpm` — one list for all four, since they share the range —
`onModeChange = (synced) => setPedalSyncMode(key, synced)`, `onSyncChange` writes `{ sync }` through
`setGlobalAudio(key, …)`), every other row through `paramRow`.

**Acceptance criteria:**
- [ ] Each of the Chorus, Tremolo and Vibrato blocks renders a `TempoSyncSlider` on its rate row and plain
  rows elsewhere; the Phaser block still does (its existing tests pass unchanged).
- [ ] Toggling Sync on the Tremolo row calls `setPedalSyncMode('tremolo', true)`; picking a note writes
  `{ sync }` for `tremolo` only; the Phaser's state is untouched. **Mutation:** hard-code `'phaser'` in the
  branch and the Tremolo case must fail.
- [ ] The `allowed` list is computed once per `bpm`, not per block render (memo assertion).

**Verification:** `npx vitest run src/components/panels/screen/console/AudioRigDrawer.test.tsx`.

**Dependencies:** T7, T10. **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `.test.tsx`.
**Scope:** S.

---

### Checkpoint B: The sub-tabs, end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] **Manual (Crawford, desk and phone shells):** Modulation shows six sub-tabs and Output three; every
  slider moves its node; each pedal 0 → full with no click; Width 0.5 → 0 → 1 while a lit Delay plays — the
  delay's tail folds and spreads with it; each synced Rate Free → Sync → Free, then a Tempo change with Sync on
  (the motion follows); the shifter at ±5 Hz and at ±500 Hz; six sub-tabs fit or scroll on the phone shell;
  keyboard and every "?".
- [ ] Reviewed with Crawford before Phase 3.

---

## Phase 3: Persistence

### Task 12: Old payloads load with defaults; a bad `sync` is dropped on any synced block

**Description:** `sessionDiff.ts`'s `sanitizePhaserSync` becomes `sanitizeSyncedRate<T extends SyncedRate>(block)`
and `applySessionPayload` applies it to the four synced blocks after `withGlobalAudioDefaults`. Tests prove a
version-2 payload without the five keys restores with the defaults, a payload with a synced Chorus
round-trips, an invalid `tremolo.sync` is removed (never written as `undefined`), the Phaser case still
works, and `sessionShareUtils` decodes an old link with the five blocks at defaults.

**Acceptance criteria:**
- [ ] Restore of a payload without the five blocks yields them at `DEFAULT_GLOBAL_AUDIO_SETTINGS` values and
  does not throw; a present block is kept whole.
- [ ] `{ tremolo: { …, sync: 'nope' } }` restores without a `sync` key (`'sync' in block` is false); a valid
  note round-trips on each of the four. **Mutation:** apply the sanitiser to the Phaser only and the Tremolo
  case must fail.
- [ ] `decodeSessionShare` of a link encoded before this phase yields the five default blocks.

**Verification:** `npx vitest run src/utils/sessionDiff.test.ts src/utils/sessionShareUtils.test.ts`.

**Dependencies:** T1, T3. **Files:** `src/utils/sessionDiff.ts`, `.test.ts`, `src/utils/sessionShareUtils.test.ts`.
**Scope:** S.

---

### Checkpoint C: The whole feature, automated
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean; mutation harness run on
  `tempoSync.ts`, `globalAudioSeed.ts`, `globalAudio.ts` and the five setters, results noted in the commit.
- [ ] **By hand:** save a session with a synced Chorus and Width 0.2, reload, share-link round trip; an old
  `?session=` link loads with the five blocks at defaults.

---

## Phase 4: Guard, gate, listen

### Task 13: The docs/symbol guard test

**Description:** `src/docs/globalPedalsDocs.test.ts`, on the `globalModulationDocs.test.ts` pattern: the gem
folder and `RobotBody` read none of the five keys (with the self-check that a planted read is caught); no
LFO or swell target id begins with any of the five keys; a declared-symbol table (`PEDAL_RATE_RANGE_HZ`,
`MAX_LIT_PEDALS`, `PEDAL_SYNC_ODDS`, `resolveSyncedRateHz`, `setGlobalChorus` … `setGlobalStereoWidener`,
`sanitizeSyncedRate`, `SYNCED_RATE_KEYS`) with the rename self-check; both range tables and the grid cover all
sixteen fields, the motion rows after the Phaser rows and the Width row after the Compressor rows, each with
its setter; the living docs (`AUDIO_SYSTEM.md`, `SESSION_STORAGE.md`, `FREE_SYNC_TOGGLE.md`, `themes.md`)
name the pedals — these last cases are **red until T17** and say so in their titles.

**Acceptance criteria:**
- [ ] Every case except the living-docs ones is green at this task; each check has its "the check itself can
  fail" twin.
- [ ] The table of declared symbols fails on a rename of any one of them.

**Verification:** `npx vitest run src/docs/globalPedalsDocs.test.ts` (living-docs cases expected red until T17).

**Dependencies:** T1–T12. **Files:** `src/docs/globalPedalsDocs.test.ts`. **Scope:** S.

---

### Task 14: Phone gate — **STOP for Crawford**

**Description:** Spec §5's three steps, in full and recorded. Against T0's baseline: on the branch, the same
world (`?debug&session=` payload), Pixel 8, the preview build, **one worst-case run** — all six Modulation
pedals at full Mix, the Phaser at 12 stages, Width at 1 — Full 3:00 and Standard 3:00, HUD `underruns` start →
end for each; `npm run perf` on the desktop before and after. **Bisect only on a miss:** Chorus, Tremolo,
Vibrato one at a time at full Mix, then the shifter, same lengths, counts recorded.

**Acceptance criteria:**
- [ ] A dated section in `scratchy-audio-phones.md` with the branch hash, the world, every run's start → end
  counts at both tiers, and the `npm run perf` figures.
- [ ] Pass = zero underruns at Full and no more than T0's count at Standard. A miss names the pedal(s) the
  bisect blamed and routes to T15b (threshold) or to T17 (withdrawn to backlog 22 as "tried, no"), by
  Crawford's call.

**Verification:** Crawford's runs; nothing is claimed that was not counted.

**Dependencies:** T0, Checkpoint C. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (device).

---

### Task 15b (conditional): `LOAD_PEDALS_MIN`

**Description:** Only if T14 misses and Crawford keeps the pedal. `LOAD_PEDALS_MIN` in `src/constants/index.ts`
beside `LOAD_FILTER_LFOS_MIN`; `EffectsLoadLimits` gains `pedalsEnabled`; `effectsLoadToLimits` sets it;
`audioBudgetSystem` calls `globalFx.setPedalsEnabled(enabled)`, which holds the three LFO pedals' `wet` at 0
first (the blamed one first) and the shifter's second, restoring the stored tapered `wet` when re-enabled;
the widener is never limited; `tiersLine` prints `pedals`. Stored settings are never touched.

**Acceptance criteria:**
- [ ] `effectsLoadToLimits(LOAD_PEDALS_MIN - 0.01).pedalsEnabled` is false and `(LOAD_PEDALS_MIN)` true;
  `describeLimits` / the HUD line name it.
- [ ] `setPedalsEnabled(false)` ramps the limited pedals' `wet` to 0 and leaves the store and the widener alone;
  `(true)` restores `colourWetGain(stored wet)`; a setter call while disabled updates the mirror, not the node.
- [ ] T14 is run again and recorded.

**Verification:** `npx vitest run src/utils/audioBudget.test.ts src/engine/audioEngine/globalFx.test.ts
src/components/debug/hudLines.test.ts`; T14 again.

**Dependencies:** T14 (miss). **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts` (+ test),
`src/systems/audioBudgetSystem.ts`, `src/engine/audioEngine/globalFx.ts` (+ test),
`src/components/debug/hudLines.ts` (+ test). **Scope:** M.

---

### Task 16: Crawford's listen, band tuning and the order veto — **STOP**

**Description:** The spec §5 manual listen, on the desk: a world per lit pedal, a capped world, a neither
world; **a lit shifter on a world with hard-panned robots as well as a centred one — the shifter leaks its
other sideband on a panned voice (spec assumption 3 and §8, corrected 2026-10-18: the Vibrato is stereo, so
there is no mono collapse to swap away from); if the leak sounds wrong rather than strange, lower the
shifter's lit edge or narrow its band**; the shifter's seeded band judged at its edges (±2 and ±20 Hz);
each pedal's lit Mix band judged for "a hint, not a wash". Whatever Crawford settles on is written into
`GLOBAL_AUDIO_LOADING_RANGES`, the grid rows and T8's calibration targets, and the oracles are re-derived by
hand for any band that moved.

**Acceptance criteria:**
- [x] The shifter-on-panned-voices question is answered; if the edge or band moved, it is in the files below.
- [x] Every band Crawford moved is in both range files, the grid and the calibration test, and the oracles
  pass with the re-derived values. *(None moved.)*
- [x] The findings are recorded in the spec's §7 as answers, with the numbers.

**Passed (2026-10-20):** Crawford: "i'm happy with passing T16, it sounds fine." No band, edge or share moved, so no
code, range file, grid row or calibration target changed. Spec §7 Q1 (the shifter on panned voices: not a fault)
and Q4 (the lit bands stand) carry the answer. His reply did not itemise the listen list. This plan's Checkpoint B
list had already passed under the Dark-Effect Bypass ("ok, everything passed").

**Verification:** `npm test`; Crawford's ears.

**Dependencies:** T14. **Files:** `src/data/globalAudioLoadingRanges.ts`, `src/utils/globalAudioSeed.ts`, `.test.ts`,
`docs/reference/GLOBAL_CHAIN_GRID.md`,
`docs/specs/GLOBAL_PEDALS.md`. **Scope:** S–M, by what moves.

---

## Phase 5: Docs

### Task 17: Docs, the roadmap 50.6 entry, the backlog 22 rewrite

**Description:** `docs/AUDIO_SYSTEM.md` (Signal Graph: the four motion pedals after the Phaser, the Width
stage after the Compressor, the moved Controlled join, the five setters, one paragraph on the always-running
LFOs and the shifter's downmixed sine branch); `docs/specs/FREE_SYNC_TOGGLE.md` (one line: three more synced rates on the generic
rail); `docs/SESSION_STORAGE.md` (one line: absent pedal keys load as defaults; four synced blocks sanitised);
`docs/ideas/themes.md` (one sentence on the new edges and the cap); `docs/reference/GLOBAL_CHAIN_GRID.md`
footnote ⁵ if T2's was a stub; `docs/todo/roadmap.md` gains **50.6 Global Pedals** after 50.5 (the series'
shape: the original paragraph, status, "As built" with every deviation); `docs/todo/backlog.md` item 22 is
rewritten to hold only the two room type radios (PingPongDelay on the Delay row, Freeverb / JCReverb on the
Reverb row), with the `globalFx.ts:144` cite corrected and the "cheaper per sample" claim replaced by Tone
15's AudioWorklet warning, plus any pedal withdrawn at T14 under "tried, no". Both todo files edited
append-only in their own endings (backlog CRLF, roadmap LF). Spec §8 "As built" written.

**Acceptance criteria:**
- [x] `src/docs/globalPedalsDocs.test.ts` is fully green (the living-docs cases turn).
- [x] The roadmap entry and the backlog rewrite are present, and `git diff` shows every pre-existing line of
  both todo files byte-identical. (The backlog "rewrite" is an update appended inside item 22, since a rewrite
  in place would change pre-existing lines; spec §8, "What T17 wrote".)
- [x] Spec §7 carries its answers and §8 its deltas; this plan's status line is updated.

**As built (2026-10-21):** `globalPedalsDocs.test.ts` 171/171; `git diff --stat docs/todo` 110 insertions, 0 deletions.
Full suite 13 392 pass / 1 fail, the known `sceneToOrbiterLocal` timeout; `build:types` clean, lint 0 errors (the 4 old
warnings), `npm run build` clean. Finding: a fresh seed lands Width on exactly 0.5 in 4.36 % of worlds (spec §8).

**Verification:** `npx vitest run src/docs/globalPedalsDocs.test.ts`; `git diff --stat docs/todo`.

**Dependencies:** T16. **Files:** the docs listed. **Scope:** M (docs only).

---

### Checkpoint: Complete
- [x] All acceptance criteria met; `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean
  (`npm test` apart from the known `sceneToOrbiterLocal` timeout).
- [x] Phone counts and the listen recorded, not paraphrased.
- [ ] Crawford opens the PR from `feature/pedals` (the branch as built; this plan proposed `feature/palette-pedals`).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Three always-running LFOs plus a shifter cost the Pixel underruns | High | T0 baseline; T14 worst-case run with counts; bisect names the pedal; T15b holds the blamed pedal's wet at 0 on lighter loads; withdrawal is an outcome, not a failure |
| The shifter leaks its other sideband on panned voices (its sine branch is downmixed; the Vibrato, first thought mono, is stereo — measured 2026-10-18, spec §8) | Med | T16's panned-world listen; the levers are the shifter's lit edge and band |
| Moving the Controlled-Decay join breaks the rooms' return path | Med | T6 is its own task with the join asserted in both modes and the ctor-missing fallback pinned |
| A Chorus or Tremolo constructed but never started is silent motion with a lit Mix | Med | T4 pins the `start()` call by constructor spy; the Vibrato test pins the opposite |
| The sequential cap starves the shifter (rolled last, lowest odds) to near zero | Low | T8's calibration records the measured share; T16 or a theme raises the edge; the order is the spec's |
| Generalising the Phaser's rail changes its behaviour | Med | T3, T7, T11, T12 each require the Phaser's existing tests to pass unchanged, with a mutation that proves the wrapper is live |
| `GlobalAudioSettings` gaining five keys breaks literals across the tree | Med | T1 carries presets, fixture, oracles and setter placeholders in one commit (50.3's and 50.4's lesson) |
| `sliderCenteredZero` behaves oddly for a ±1000 Hz range | Low | T10 pins the type; the fallback (spec §7.7) is a signed `sliderLinear`, one row |
| Six sub-tabs overflow the phone shell | Low | Checkpoint B's phone look; `SectionTabs` scrolls; no new container (layout decision 10) |
| The hand-amended oracles hide a moved value | Low | The existing `toStrictEqual` over every pre-existing key; T8 and T16 re-derive only the moved blocks |

## Open Questions
- Spec §7: the shifter on panned voices (T16; the slot order stays as built), cap mechanism (T8 sequential), nominal odds (T8),
  lit bands and the shifter's ±2–20 Hz (T8 placeholders, T16 moves), always-running LFOs (T4; T15b or a
  stop-at-Mix-0 variant only if T14 blames an idle LFO), the widener join (T6), `sliderCenteredZero` for
  `shift` (T10), presets clean (T1), lore words (T9 placeholders, T17 copy pass), roadmap number 50.6 (T17).
