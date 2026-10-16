# Implementation Plan: Global Modulation Pedal — AutoWah and Phaser on the Global Chain

Spec: [docs/specs/GLOBAL_MODULATION_COLOUR.md](../specs/GLOBAL_MODULATION_COLOUR.md). Intent:
[docs/intent/global-modulation-pedal.md](../intent/global-modulation-pedal.md). Roadmap **50.4**. Branch
`feature/palette-modulation` (a proposed name; Crawford creates it), off `main` at `03cc6881` or later.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf`; the phone gate is the `?debug` HUD on the Pixel (spec §5).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo
convention `docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status (2026-10-15): BUILT on `feature/palette-modulation`, PR pending.** T1–T13, T14 (partial), T16 and T17
> committed; T0 (the re-baseline) and T15b (no threshold needed) were not done. T14 is one Full 3:00 Pixel run with both pedals at
> full Mix and 12 stages ("some underruns", no distortion, no count, no baseline); Crawford closed it and Task 16 on that
> evidence, with Stages left a slider. Checkpoints A and B passed (B partly); Checkpoint C's by-hand check was not reported. The
> guard test `src/docs/globalModulationDocs.test.ts` is fully green. What shipped differs from the tasks below in three ways: the
> bands are Crawford's recommended ranges (Mix 0.2–0.5 and 0.15–0.4, no longer under the 0.25 ceiling; Stages seed 4–12), every
> seeded draw is uniform, and a failed Phaser rebuild keeps the old node. The roadmap's 50.4 "As built" and the spec's §7 answers
> and §8 are the record; the task text below is the plan as written. Earlier status, for the record:
> **NOT STARTED (2026-10-15).** The spec was written but not yet approved; its veto points (spec §7) were the Stages rebuild vs a
> seeded-only Stages, the Phaser's seeded Sync odds, the lit bands and the shared 0.25 ceiling, the Rate range, the slot order,
> presets clean and the lore words.

## Overview

Seventeen tasks in five phases, plus a device task that runs first. **Phase 0** re-baselines the Pixel on
current `main`, because 50.3's re-baseline never ran and the chain has changed twice since the series
baseline. **Phase 1** is data and engine, nothing visible: the two settings blocks and their ranges, the
Phaser's tempo-sync helpers, the two nodes in the chain slot with their setters (the Phaser's stages rebuild
is its own task, early, because it is the one risky piece), the store rail with the Free | Sync actions, and
the seeded lit draws — audible from a fresh seed at Checkpoint A with no UI. **Phase 2** is the Modulation
tab as one vertical slice: content, rig blocks, the tab, then the Phaser's `TempoSyncSlider` row, usable at
Checkpoint B. **Phase 3** makes old payloads load with defaults and drops a bad `phaser.sync`. **Phase 4** is
the guard test, the phone A/B, the conditional threshold and Crawford's listen (where the bands and the
Stages veto are settled). **Phase 5** is docs. Every task leaves types, lint and the suite green; RED first;
one commit per task; the mutation harness at the named gates.

## Architecture Decisions

- **Types, presets, fixtures and placeholders in one commit (T1).** `GlobalAudioSettings` gaining two
  required keys breaks every full literal and `EffectKey`-indexed record: `transmissionPresets.ts` (three),
  `AudioEngine.test.ts`'s fixture, the two seed oracles and `GLOBAL_SETTER`. 50.3's T1 learned this the
  hard way (spec §8 of GLOBAL_COLOUR.md). T1 carries the presets, the fixture, default blocks in the
  seeder's return literal, default blocks in both oracles, and `GLOBAL_SETTER` no-op placeholders, so the
  tree compiles; T6 replaces the placeholders and T7 replaces the seeder's literals with draws.
- **The grid rows are documentation (T2), not parsed.** The 50.3 plan assumed the range tests parse
  `GLOBAL_CHAIN_GRID.md`; they compare hard-coded tables (GLOBAL_COLOUR.md §8). T2 still writes the thirteen
  rows beside the tables so the guard test (T13) finds them, but nothing in T2 is red on a grid typo.
- **Tempo-sync helpers before the engine (T3 before T6).** `resolvePhaserRateHz` and friends are pure and
  mutation-gated; the store needs them and nothing else does, so they land first and alone.
- **AutoWah (T4) before Phaser (T5), Phaser's rebuild inside T5.** T4 is the plain copy of a colour setter and
  establishes the Tone mocks for both pedals; T5 adds the constructor-only `stages` rebuild,
  `_lastControlledDecay`, `_phaserLive` and the dispose path. It is the riskiest task and it is fifth, not
  twelfth: if the rebuild cannot be made clean, the Stages veto is decided before the tab is built.
- **Store before the seeder (T6 before T7).** The seeder's values reach the engine only through
  `applyGlobalAudioToEngine`, so Checkpoint A can be heard.
- **Two independent lit draws and a sync pair (T7), calibrated by measurement.** The edges are a starting
  point; the calibration test pins realised shares over 3 000 styles and proves independence. T16 moves the
  targets and T7's test moves with them. Colour's draw is pinned unchanged by the same test.
- **The Tone mocks are inline per test file** (`AudioEngine.test.ts:11`, `globalFx.test.ts:10`): T4 adds
  `AutoWah` (with `Q`, `gain`, `wet` as `{ value, rampTo }` and plain `baseFrequency`/`octaves`/`sensitivity`/
  `follower`); T5 adds `Phaser` (with `frequency`, `Q`, `wet` as Signals, plain `octaves`/`baseFrequency`, a
  `dispose` spy, and a record of the `stages` it was constructed with) plus a variant whose constructor throws.
- **The Modulation tab is a vertical slice (T8–T11)** and nothing in it is reachable until T10 wires the
  group; T11 adds the Phaser's sync row on top because `AudioRigDrawer.tsx` already has a `delay` branch and
  the new branch is a separate, testable change. T8 (content) is independent and may land beside Phase 1.
- **No new trait (spec assumption 11):** `traits.ts`, `traitColors.ts` and their tests are not touched.
- **Persistence changes only on the way in (T12).** `withGlobalAudioDefaults` already fills missing blocks
  once T1 adds them to the defaults; T12 only extends the Delay's `sync` sanitiser to the Phaser and proves
  the old-payload and round-trip cases. Nothing is encoded or versioned.
- **The Effects Limit threshold is conditional (T15b)** and fixed in shape by spec assumption 15.
- **Order.** T0 first (device, independent). T1 → T2 → T3 → T4 → T5 → T6 → T7 → Checkpoint A. T8 any time
  after T1. T9 after T2 + T8. T10 after T6 + T9. T11 after T10 → Checkpoint B. T12 after T1 → Checkpoint C
  (needs T11 too). T13 after C. T14 (A/B) after C and T0. T15b only if T14 says so. T16 after T14. T17 last.

## Dependency Graph

```
T0 re-baseline on main (STOP, device) ──────────────────────────────────────────────────────┐
                                                                                             │
T1 types + defaults + range const + presets + fixture + placeholders                         │
 ├─► T2 seed keys + both range tables + grid rows                                            │
 │    └─► T4 AutoWah node + setter ─► T5 Phaser node + setter + stages rebuild               │
 ├─► T3 tempo-sync helpers ───────────────────────────────┐                                  │
 │                                                        └─► T6 store rail ─► T7 lit draws + sync + oracles + calibration
 │                                                                   │                       │
 ├─► T8 content ─┐                                           Checkpoint A                   │
 │               └─► T9 rig blocks + effect key + trait map ─► T10 the Modulation tab ─► T11 Phaser sync row ─► Checkpoint B
 └─► T12 phaser.sync sanitiser + restore/decode tests ──────────────────────────────────────┘ │
                                                                       Checkpoint C          │
                                                                            │                │
                              T13 docs/symbol guard ─► T14 phone A/B (STOP) ◄───────────────┘
                                                              │
                                                    T15b threshold (only if T14 rises) ─► T14 again
                                                              │
                                                    T16 Crawford's listen + tuning + Stages veto (STOP)
                                                              │
                                                    T17 docs ─► Complete
```

T8 is independent of everything but T1 and may run in a parallel session; never share a file in one commit
(`fleet.ts` is T8's).

## Phase 0: The device baseline

### Task 0: Re-baseline the Pixel on current `main` — **STOP for Crawford**

**Description:** The series baseline in `docs/todo/scratchy-audio-phones.md` ("Baseline for the Audio Palette
series") was measured on `ca2b6868`, before Sends moved the rooms and before Colour added three nodes; 50.3's
re-baseline was planned and not run. Run the same world (`?debug&session=` + the recorded payload: seed `alpha`,
camera 0/50, defaults) on `main` at `03cc6881` or later: Pixel 8, Chrome, the Vite preview build, **Full 3:00**
and **Standard 3:00**, and record the HUD `underruns` start → end for each.

**Acceptance criteria:**
- [ ] A new dated section in `scratchy-audio-phones.md` with the commit hash, both runs and both counts.
- [ ] The 2026-10-13 section is marked retired and points at the new one.

**Verification:** Crawford's runs; the numbers are written by whoever runs them. No code.

**Dependencies:** None. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (gated on a device).

---

## Phase 1: Data and engine (nothing visible)

### Task 1: Types, defaults, `PHASER_RATE_RANGE_HZ`, presets, fixture, placeholders

**Description:** `src/types/globalAudio.ts` gains `AutoWahSettings` and `PhaserSettings` (spec §1.1, the
Phaser's `sync?: NoteValue` documented like the Delay's), the two keys on `GlobalAudioSettings` between
`bitCrusher` and `limiter`, `PHASER_RATE_RANGE_HZ = { min: 0.05, max: 10 }` beside
`DELAY_TIME_RANGE_SECONDS`, and assumption 10's defaults (Tone's, `wet` 0, no `sync` key).
`withGlobalAudioDefaults` is unchanged in code and gains tests for the new blocks. So the tree compiles:
`transmissionPresets.ts`'s three literals and `AudioEngine.test.ts`'s full fixture gain the default blocks;
`generateGlobalAudioSettings` returns the two default blocks as literals (T7 replaces them with draws); both
seed oracles gain the same two default blocks by hand; `GLOBAL_SETTER` gains `autoWah` and `phaser` no-op
placeholders with a `// T6` comment.

**Acceptance criteria:**
- [ ] `DEFAULT_GLOBAL_AUDIO_SETTINGS.autoWah` and `.phaser` match assumption 10, `wet` 0, and
  `'sync' in DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser` is false.
- [ ] `withGlobalAudioDefaults({})` carries both blocks; a partial with `phaser` present and `autoWah` absent
  keeps the given `phaser` byte-for-byte (including a `sync` key) and fills `autoWah`.
- [ ] Every transmission preset's `globalAudio` has both blocks at the defaults; every existing test passes
  with only the fixture and oracle literals extended.
- [ ] `npm run build:types` clean.

**Verification:** `npx vitest run src/types/globalAudio.test.ts src/data src/utils/globalAudioSeed.test.ts`,
`npm run build:types`, `npm run lint`.

**Dependencies:** None. **Files:** `src/types/globalAudio.ts`, `.test.ts`, `src/data/transmissionPresets.ts`,
`src/utils/globalAudioSeed.ts` (+ `.test.ts` oracles), `src/stores/audioStore.ts`, `src/engine/AudioEngine.test.ts`
(fixture). **Scope:** M (mechanical; one logical change).

---

### Task 2: Seed field keys, both range tables, the grid rows

**Description:** `GlobalAudioSeedFieldKey` gains the thirteen keys of spec §1.1. `GLOBAL_AUDIO_SEED_RANGES` gains
assumption 5's full ranges (`sliderLog` fields with `scale: 'log'`, stepped fields with their step);
`GLOBAL_AUDIO_LOADING_RANGES` gains assumption 6's lit bands, both `wet` rows capped at `COLOUR_LOAD_MIX_MAX`
with a comment that the pedals share Colour's ceiling (assumption 9). `docs/reference/GLOBAL_CHAIN_GRID.md` gains
thirteen rows after the BitCrusher rows in the `| <effect> | \`<setter>()\` | <param> | …` shape the guard test
matches, with the Tone name in the Param column where it differs (`phaser.rate` → `frequency`), and the
chain-order line gains "→ AutoWah → Phaser" with a Modulation footnote.

**Acceptance criteria:**
- [ ] Both range tests list every new key, each loading range inside its full range, every stepped field's
  loading edges on the step; `phaser.stages` loading 4–8 within full 1–12; both `wet` loading maxima equal
  `COLOUR_LOAD_MIX_MAX`.
- [ ] The row-count guard in `globalAudioSeed.test.ts` (which excludes the colour Mix rows) is extended to
  exclude the two pedal Mix rows for the same reason, or its rationale is updated.
- [ ] The grid has thirteen new rows and the new chain-order text; `npm run lint` and the suite are green.

**Verification:** `npx vitest run src/data/globalAudioSeedRanges.test.ts src/data/globalAudioLoadingRanges.test.ts
src/utils/globalAudioSeed.test.ts`.

**Dependencies:** T1. **Files:** `src/data/globalAudioSeedRanges.ts`, `.test.ts`,
`src/data/globalAudioLoadingRanges.ts`, `.test.ts`, `docs/reference/GLOBAL_CHAIN_GRID.md`. **Scope:** S.

---

### Task 3: The Phaser's tempo-sync helpers

**Description:** `src/utils/tempoSync.ts` gains `resolvePhaserRateHz(phaser, bpm)`, `allowedPhaserNoteValues(bpm)`,
`phaserToSync(phaser, bpm)` and `phaserToFree(phaser, bpm)` (spec §1.5), mirroring the Delay trio over
`PHASER_RATE_RANGE_HZ` in Hz, slowest → fastest like the lane list, quantised to 0.05 and floored at the range
minimum on the way back to Free.

**Acceptance criteria:**
- [ ] `resolvePhaserRateHz`: Free → `rate`; Sync → the note's Hz at `bpm`, clamped into the range; an invalid
  `sync` → `rate`.
- [ ] `allowedPhaserNoteValues(60)` is non-empty, every entry resolves inside the range, and the list is
  ascending in Hz.
- [ ] `phaserToSync` snaps to the nearest allowed note and keeps `rate`; a synced Phaser is returned as a copy
  on the same note. `phaserToFree` of a synced Phaser carries no `sync` key and `rate` equals the heard Hz
  quantised to 0.05 (never below 0.05); of a Free one returns an equal copy. **Mutation:** drop the floor and a
  slow note at 40 BPM must fail the test.

**Verification:** `npx vitest run src/utils/tempoSync.test.ts`; mutation harness on `tempoSync.ts`.

**Dependencies:** T1. **Files:** `src/utils/tempoSync.ts`, `.test.ts`. **Scope:** S.

---

### Task 4: The AutoWah node and setter

**Description:** `globalFx.ts` constructs `_globalAutoWah` behind `getToneCtor('AutoWah')` at Tone's defaults
with `wet: 0`, adds it to `chainNodes` after `_globalBitCrusher` and to `disconnectAllFxNodes`' list, and gains
`setGlobalAutoWah(params)` (spec §1.3): plain writes for `baseFrequency`, `octaves`, `sensitivity`, `follower`;
`rampOrSet` for `Q`, `gain`; `wet` through `colourWetGain`; every value through `clampColour`; non-finite ignored.
`AudioEngine.ts` re-exports it. Both test files' Tone mocks gain `AutoWah`.

**Acceptance criteria:**
- [ ] `buildGlobalFxChain` constructs exactly one `AutoWah`; `wireGlobalFxChain(false)` and `(true)` connect
  BitCrusher → AutoWah → Compressor and the returns still join after it; a missing ctor leaves the chain whole.
- [ ] The setter writes each of the seven fields the right way (plain vs `rampTo`), squares `wet`, clamps an
  out-of-range `sensitivity` to −40, ignores `NaN`, and no-ops with no node.
- [ ] `AudioEngine.setGlobalAutoWah` is a function.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/AudioEngine.test.ts`.

**Dependencies:** T2. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`, `src/engine/AudioEngine.ts`,
`.test.ts`. **Scope:** S.

---

### Task 5: The Phaser node, setter and stages rebuild

**Description:** `globalFx.ts` gains `_globalPhaser`, `_phaserStages`, `_phaserLive` (the last-written non-sync
fields) and `_lastControlledDecay` (recorded at the top of `wireGlobalFxChain`); `buildPhaser(ctor, live, wet)`
constructs at the stored values; the Phaser joins `chainNodes` after the AutoWah and the disconnect list;
`setGlobalPhaser(params)` (spec §1.3 and §4): `rate` → `rampOrSet(node.frequency)`, `Q` → ramp, `octaves` /
`baseFrequency` plain, `wet` squared, and a **rounded `stages` that differs from `_phaserStages` →
`rebuildPhaser(stages)`**: dispose the old node, construct the new one from `_phaserLive` at the tapered `wet`,
`wireGlobalFxChain(_lastControlledDecay)`, then apply the rest of the edit. A constructor failure `devWarn`s and
leaves the slot empty. `AudioEngine.ts` re-exports it. Mocks gain `Phaser` (records `stages`, has `dispose`) and
a throwing variant.

**Acceptance criteria:**
- [ ] Exactly one `Phaser` is constructed at boot; both Decay orderings connect AutoWah → Phaser → Compressor.
- [ ] `setGlobalPhaser({ stages: 6 })` on a 10-stage node disposes the old, constructs one with `stages: 6`
  and the last-written `octaves`/`baseFrequency`/`Q`/`rate` and the tapered `wet`, and re-wires in the mode
  last passed to `wireGlobalFxChain` (test: wire `true`, then rebuild, assert the returns join at the Limiter).
  `setGlobalPhaser({ stages: 10 })` on a 10-stage node constructs nothing. `stages: 6.4` rounds to 6.
- [ ] A throwing `Phaser` ctor leaves the chain whole and the setter a no-op; the AutoWah is unaffected.
- [ ] Every other field writes the right way; `wet` squared; `rate` clamped to the range; `NaN` ignored.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/AudioEngine.test.ts`;
`npm run dev` smoke: a Stages drag in the console (`AudioEngine.setGlobalPhaser({ stages: n })`) rebuilds without
a thrown error — the *sound* of the rebuild is judged at T16.

**Dependencies:** T4. **Files:** `src/engine/audioEngine/globalFx.ts`, `.test.ts`, `src/engine/AudioEngine.ts`,
`.test.ts`. **Scope:** M.

---

### Task 6: The store rail — setters, resolved Phaser, `setPhaserSyncMode`, tempo re-apply

**Description:** `audioStore.ts` replaces T1's placeholders: `GLOBAL_SETTER.autoWah = AudioEngine.setGlobalAutoWah`,
`GLOBAL_SETTER.phaser = setGlobalPhaserResolved` (reads `globalAudio.phaser` and `bpm` after the merge, strips
`sync`, resolves `rate` — the `setGlobalDelayResolved` shape); `applyGlobalAudioToEngine` pushes `autoWah` then
the resolved `phaser` after `bitCrusher`; new action `setPhaserSyncMode(synced)` using T3's conversions;
`reapplyTempoSyncedValues` re-pushes a synced Phaser's rate.

**Acceptance criteria:**
- [ ] `setGlobalAudio('autoWah', { wet: 0.5 })` reaches `AudioEngine.setGlobalAutoWah` with `{ wet: 0.5 }`.
- [ ] `setGlobalAudio('phaser', { sync: '1n' })` stores the key and calls `AudioEngine.setGlobalPhaser` with
  a numeric `rate` equal to `resolvePhaserRateHz` at the store's `bpm` and **no `sync` property**.
- [ ] `setPhaserSyncMode(true)` then `(false)` round-trips through T3's helpers and pushes a resolved rate each
  time; `setBPM(120)` re-pushes a synced Phaser's rate and does not call the setter for a Free one;
  `applyGlobalAudioToEngine` pushes both blocks with the Phaser resolved.

**Verification:** `npx vitest run src/stores/audioStore.test.ts`.

**Dependencies:** T3, T5. **Files:** `src/stores/audioStore.ts`, `.test.ts`. **Scope:** S.

---

### Task 7: The lit draws, the sync pair, thirteen value draws, the oracles by hand, calibration

**Description:** `globalAudioSeed.ts` gains `PEDAL_LIT_EDGE` (two edges, nominal 0.333), `PHASER_SYNC_ODDS`
(nominal 0.5), and the four roll keys and thirteen `sampleField` draws of spec §1.2, all read on every style; a
dark pedal's `wet` is forced to 0; a lit Phaser under the sync odds carries a `sync` from `pickSeedNoteValue`
over the lit `rate` band, a dark or Free one no key. The two oracles' T1 default blocks are replaced **by hand**
with values derived from the raw draws (the 50.3 method: run the same formula on the old band to prove the
derivation), every other value byte-identical. The edges and odds are then **fitted by measurement** over
20 000 styles and the fitted values written back with the fit recorded in the comment, as
`COLOUR_CHARACTER_BANDS`' is.

**Acceptance criteria:**
- [ ] Determinism: the same style gives the same blocks.
- [ ] Calibration over 3 000 held-out styles: AutoWah lit 33 ± 3 %; Phaser lit 33 ± 3 %; both lit within ±3
  points of the product of the two shares; a lit Phaser synced within ±5 points of `PHASER_SYNC_ODDS`; a dark
  Phaser never synced; Colour's four character shares unchanged from the existing test's pins.
- [ ] A dark pedal has `wet === 0` and every other field inside its loading band; a lit pedal's `wet` is inside
  its band and ≤ `COLOUR_LOAD_MIX_MAX`; `stages` is an integer on every style; a `sync` is always in
  `allowedPhaserNoteValues(bpm)`.
- [ ] Both oracles pass with only the two pedal blocks changed from T1's literals.

**Verification:** `npx vitest run src/utils/globalAudioSeed.test.ts`; mutation harness on `globalAudioSeed.ts`.

**Dependencies:** T2, T6. **Files:** `src/utils/globalAudioSeed.ts`, `.test.ts`. **Scope:** S.

---

### Checkpoint A: Data and engine
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Proves: both nodes sit in the slot in both Decay Modes (T4, T5); a Stages change rebuilds and re-wires
  (T5); the store reaches them and a synced rate follows the tempo (T6); a fresh world lights each pedal about a
  third of the time (T7); old presets and fixtures still load (T1).
- [ ] **Manual (Crawford, `npm run dev`):** cycle a few seeds (the HUD's first line shows the seed): some worlds
  sweep, some wah, a few do both, about half do neither; nothing clicks on power-on or a Decay flip. There is no
  UI yet — this is a listen, not a tuning pass; T16 tunes.
- [ ] Reviewed with Crawford before Phase 2.

---

## Phase 2: The Modulation tab (one vertical slice)

### Task 8: Content entries

**Description:** `src/content/copy/fleet.ts` gains `fleet.modulation` (group: human, lore, intro with a lore
line, lore description and an HTML human description covering both pedals, their Mix and the Phaser's Free |
Sync Rate, like `fleet.colour`), `fleet.autoWah` and `fleet.phaser` (heading entries), and the thirteen parameter
entries of spec §1.7 with `help.human` and units (`Hz`, `dB`, `s`, `oct`) — assumption 16's placeholder words.

**Acceptance criteria:**
- [ ] Every new key is present with both voices; the content test's "every key is read" guard takes the same
  one-commit self-cleaning exemption 50.3 used (T8 → T9), named in the test.
- [ ] `fleet.phaser.rate`'s help explains Free and Sync in the voice of `fleet.delay.time`'s.

**Verification:** `npx vitest run src/content`; `npm run lint`.

**Dependencies:** None (T1 for the branch). **Files:** `src/content/copy/fleet.ts`, `src/content/content.test.ts`
(exemption). **Scope:** S.

---

### Task 9: Rig blocks, effect key, trait map

**Description:** `AudioRigEffectKey` gains `autoWah | phaser`; two `AUDIO_RIG_CONFIG` blocks after `bitCrusher`
and before `delay` with the params, types, ranges and steps of spec assumption 5 (the `rate` row a
`sliderLinear` over `PHASER_RATE_RANGE_HZ`, step 0.05); no `lfoTarget` on any row. `AUDIO_RIG_EFFECT_TRAIT` maps
both to `'spectral'`. The nav guard "every block in exactly one group" takes 50.3's one-commit exemption
(T9 → T10).

**Acceptance criteria:**
- [ ] `audioRigConfig.test.ts`: twelve blocks in grid order; 41 ids; each pedal param's type, min, max, step
  and content key; no `lfoTarget` on any pedal row.
- [ ] Both keys resolve to `'spectral'` in the trait map.
- [ ] T8's content exemption is removed (every key is now read).

**Verification:** `npx vitest run src/data/audioRigConfig.test.ts src/content src/components/panels/screen/nav`.

**Dependencies:** T2, T8. **Files:** `src/data/audioRigConfig.ts`, `.test.ts`,
`src/components/panels/screen/console/AudioRigDrawer.tsx`, `src/content/content.test.ts`,
`src/components/panels/screen/nav/navActions.test.ts` (exemption). **Scope:** S.

---

### Task 10: The Modulation section tab

**Description:** `FleetParamsGroup` gains `'modulation'` between `'colour'` and `'output'`; `SECTIONS` gains
`['modulation', 'spectral']`; `SUB_TABBED` gains it; `FLEET_PARAMS_SUBSECTIONS.modulation = [autoWah, phaser]`;
`FLEET_PARAMS_GROUP_CONTENT.modulation = 'fleet.modulation'`. `DEFAULT_FLEET_PARAMS_SECTION` stays `'lfoBank'`.
The nav exemption from T9 is removed. The AutoWah block renders through the existing `paramRow` path; the
Phaser block renders its six rows plainly for now (T11 swaps the rate row).

**Acceptance criteria:**
- [ ] `FleetParamsScreen.test.tsx`: seven groups in order, Modulation between Colour and Output, its trigger in
  the `spectral` colour, on both shells; the Modulation group has two sub-tabs, AutoWah first.
- [ ] `navActions.test.ts`: breadcrumb "Modulation / Phaser"; a leftover sub-tab from another group reads as
  Modulation's first.
- [ ] `uiStore.test.ts`: `setFleetParamsSection('modulation')` is accepted; the nav tree parser accepts it.
- [ ] Every "?" opens its help; keyboard reaches both sub-tabs and every slider.

**Verification:** `npx vitest run src/components/panels/screen src/stores/uiStore.test.ts`; `npm run dev`.

**Dependencies:** T6, T9. **Files:** `src/stores/uiStore.ts`, `.test.ts`,
`src/components/panels/screen/screens/FleetParamsScreen.tsx`, `.test.tsx`,
`src/components/panels/screen/nav/navActions.ts`, `.test.ts`. **Scope:** M.

---

### Task 11: The Phaser's Rate row through `TempoSyncSlider`

**Description:** `AudioRigEffectPanel` gains a `block.key === 'phaser'` branch (spec §1.6): the `rate` row is a
`TempoSyncSlider` with `freeValue = effect.rate`, `syncValue = globalAudio.phaser.sync`, `allowed =
allowedPhaserNoteValues(bpm)` memoised on `bpm`, `onFreeChange` the field setter, `onSyncChange` writing `{ sync }`
through `setGlobalAudio('phaser', …)`, `onModeChange = setPhaserSyncMode`; every other row through `paramRow`.
The store selectors follow the Delay's pattern (`isDelay`-style guards so non-Phaser blocks subscribe to nothing
new).

**Acceptance criteria:**
- [ ] The Phaser block renders one `TempoSyncSlider` and five plain rows; the AutoWah block renders seven plain
  rows and no toggle.
- [ ] Flipping the toggle calls `setPhaserSyncMode`; picking a note calls `setGlobalAudio('phaser', { sync })`;
  dragging in Free calls the `rate` field setter.
- [ ] A Delay block's render count does not change when `globalAudio.phaser.sync` changes.

**Verification:** `npx vitest run src/components/panels/screen/console`; `npm run dev`: Free → Sync → Free, a
Tempo change with Sync on moves the sweep.

**Dependencies:** T10. **Files:** `src/components/panels/screen/console/AudioRigDrawer.tsx`, `.test.tsx`.
**Scope:** S.

---

### Checkpoint B: The tab, end to end
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] **Manual (Crawford, desk and phone shells):** Fleet Params shows seven tabs; Modulation sits between Colour
  and Output in the spectral colour; AutoWah has seven sliders, Phaser six with the Free | Sync toggle under Rate;
  every "?" opens; a Stages drag at mid Mix is heard (first impression only — T16 decides); the seven-slider
  column is usable on the phone shell.
- [ ] Reviewed with Crawford before Phase 3.

---

## Phase 3: Persistence

### Task 12: Old payloads load with defaults; a bad `phaser.sync` is dropped

**Description:** `sessionDiff.ts`'s Delay `sync` sanitiser is extended to `globalAudio.phaser.sync` (an invalid
value is deleted, never written as `undefined`); `withGlobalAudioDefaults` already fills missing blocks at both
call sites (T1), so this task is proof plus the sanitiser.

**Acceptance criteria:**
- [ ] `sessionDiff.test.ts`: a version-2 payload without `autoWah` / `phaser` restores with the defaults and
  `applyGlobalAudioToEngine` receives both blocks; a payload with `phaser.sync: '2n'` round-trips; one with
  `phaser.sync: 'bogus'` restores with no `sync` key and `rate` kept.
- [ ] `sessionShareUtils.test.ts`: the recorded 50.2 baseline link decodes with both pedals at `wet` 0; a link
  written with a synced Phaser decodes with the same `sync`; the compact size of a default world is unchanged.

**Verification:** `npx vitest run src/utils/sessionDiff.test.ts src/utils/sessionShareUtils.test.ts`.

**Dependencies:** T1. **Files:** `src/utils/sessionDiff.ts`, `.test.ts`, `src/utils/sessionShareUtils.test.ts`.
**Scope:** S.

---

### Checkpoint C: The whole feature, automated
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Save → reload → share link → load, with one pedal lit and the Phaser synced, by hand in `npm run dev`;
  an old `?session=` link loads both dry.

---

## Phase 4: Guard, gate, listen

### Task 13: The docs/symbol guard test

**Description:** `src/docs/globalModulationDocs.test.ts`, the `globalColourDocs.test.ts` pattern: a gem-folder and
`RobotBody` source scan for `autoWah` / `phaser` reads (comments excluded, with the self-test), a "never a
modulation or swell target" check over `GlobalLfoTargetId` and the swell pools, a declared-symbol table (the
spec's names: `AutoWahSettings`, `PhaserSettings`, `PHASER_RATE_RANGE_HZ`, `PEDAL_LIT_EDGE`, `PHASER_SYNC_ODDS`,
`resolvePhaserRateHz`, `phaserToSync`, `setGlobalAutoWah`, `setGlobalPhaser`, `setPhaserSyncMode`, the two
effect keys and the group id) with the rename self-test, the thirteen-field coverage check over both range
tables, and the grid-row check after the BitCrusher rows. The living-docs cases (`AUDIO_SYSTEM.md`,
`SESSION_STORAGE.md`, `FREE_SYNC_TOGGLE.md` naming the fields) are **expected red until T17** and say so.

**Acceptance criteria:**
- [ ] Every non-docs case green; each self-test proves its check can fail.
- [ ] The docs cases fail with a message naming the missing doc and field.

**Verification:** `npx vitest run src/docs/globalModulationDocs.test.ts`.

**Dependencies:** Checkpoint C. **Files:** `src/docs/globalModulationDocs.test.ts`. **Scope:** S.

---

### Task 14: Phone gate — **STOP for Crawford**

**Description:** Spec §5. Against T0's baseline, same world, same lengths, on this branch: (a) the seeded pedals;
(b) Phaser alone at full Mix, 12 stages; (c) both at full Mix, 12 stages. Each at **Full 3:00** and **Standard
3:00** with the HUD `underruns` recorded, plus `npm run perf` before and after on the desktop. Everything into
`scratchy-audio-phones.md` as counts, with the world named.

**Acceptance criteria:**
- [ ] Full: 0 underruns in every run; Standard: no more than T0's count.
- [ ] `npm run perf`: no long-task regression against `PERFORMANCE.md`'s table.
- [ ] A rise in (b) or (c) only → the Stages ceiling drops in both range tables and the rig block, and the run
  repeats; a rise that persists at the lowered ceiling → T15b, then this task again; a rise at (a) → the pedal is
  withdrawn. Recorded either way.

**Verification:** Crawford's runs; numbers written by whoever runs them.

**Dependencies:** T0, Checkpoint C. **Files:** `docs/todo/scratchy-audio-phones.md` (and the two range tables plus
`audioRigConfig.ts` if the ceiling drops). **Scope:** XS (device).

---

### Task 15b (conditional): `LOAD_PEDAL_MIN`

**Description:** Only if T14 asks. Spec assumption 15: `LOAD_PEDAL_MIN` in `constants/index.ts`, `pedalsEnabled` on
`EffectsLoadLimits` from `effectsLoadToLimits`, `globalFx.setPedalsEnabled(enabled)` that holds the Phaser's
`wet` at 0 while disabled (the AutoWah too if the first measurement is not enough), re-applying the stored `wet`
when re-enabled, called from `audioBudgetSystem.applyLfoTiers`; the HUD tier line names it; stored settings
untouched.

**Acceptance criteria:**
- [ ] `effectsLoadToLimits(LOAD_PEDAL_MIN - 0.01).pedalsEnabled` is false and at the threshold true.
- [ ] With pedals disabled, `setGlobalPhaser({ wet: 0.8 })` leaves the node's `wet` at 0 and re-enabling ramps it
  to `colourWetGain(0.8)`.
- [ ] The tier line reads "pedals off" below the threshold; `describeLimits` includes it.

**Verification:** `npx vitest run src/utils/audioBudget.test.ts src/systems src/engine/audioEngine/globalFx.test.ts
src/components/debug`; then T14 again.

**Dependencies:** T14 (a rise). **Files:** `src/constants/index.ts`, `src/utils/audioBudget.ts`, `.test.ts`,
`src/systems/audioBudgetSystem.ts`, `src/engine/audioEngine/globalFx.ts`, `src/components/debug/hudLines.ts`.
**Scope:** M (six files — split the HUD line into its own commit if the task runs long).

---

### Task 16: Crawford's listen, band tuning and the Stages veto — **STOP**

**Description:** Spec §5's manual listen and §7's open items. A wah world, a phaser world, a both world and a
neither world; each pedal 0 → full by hand; **Stages dragged 1 → 12 at mid Mix while the fleet plays** — if it
ticks audibly, Stages becomes seeded-only (the slider row and its content key go, the field stays seeded and
saved) in this task; the lit bands (assumption 6), the shared ceiling (9) and `PHASER_SYNC_ODDS` (8) moved to
what Crawford hears, with T7's calibration test and the oracles amended by hand to match; slot order (3) kept
or swapped in `chainNodes` (one line) with the stereo note in §7 item 7 in mind.

**Acceptance criteria:**
- [ ] Each changed band, edge or odds has a test pinning it and a comment naming this task and the date.
- [ ] If Stages becomes seeded-only: the rig block loses the row, `audioRigConfig.test.ts` and the drawer test
  move with it, and `setGlobalPhaser` keeps the rebuild path (a restore of a different `stages` still rebuilds).
- [ ] The suite is green after every change in this task.

**Verification:** Crawford's ears; `npm test` after each edit.

**Dependencies:** T14. **Files:** `src/utils/globalAudioSeed.ts`, `.test.ts`, `src/data/globalAudioLoadingRanges.ts`,
`.test.ts`, `src/engine/audioEngine/globalFx.ts` (slot order); conditionally `audioRigConfig.ts` and the drawer.
**Scope:** S–M.

---

## Phase 5: Docs

### Task 17: Docs

**Description:** `docs/AUDIO_SYSTEM.md` (Signal Graph gains the two nodes and a Modulation paragraph: the rebuild,
the shared taper, the wall-clock LFO as the accepted class), `docs/specs/FREE_SYNC_TOGGLE.md` (one line: the
Phaser's Rate is the third synced field, with the Phaser trio named), `docs/SESSION_STORAGE.md` (absent pedal
blocks load as defaults; `phaser.sync` sanitised), `docs/ideas/themes.md` (one sentence on the lit edges and
bands), `docs/reference/GLOBAL_CHAIN_GRID.md` (prose only; rows landed in T2), `docs/todo/roadmap.md` (50.4 status
line and an "As built" section recording every T16 change), `docs/todo/backlog.md` item 22 (neither pedal moves
there), this plan's status block, and the spec's §7 answers and §8 "As Built". T13's docs cases go green.

**Acceptance criteria:**
- [ ] `npx vitest run src/docs/globalModulationDocs.test.ts` fully green.
- [ ] Every doc edited in its own line endings; new docs CRLF.
- [ ] Roadmap 50.4 says what shipped, including the Stages decision and the measured lit shares.

**Verification:** the guard test; a read-through against the tree.

**Dependencies:** T16. **Files:** the docs above. **Scope:** M (docs only).

---

### Checkpoint: Complete
- [ ] All acceptance criteria met; `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Phone counts and the listen recorded, not paraphrased.
- [ ] Crawford opens the PR from `feature/palette-modulation`.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The Stages rebuild ticks audibly on a drag | Med | T5 lands it fifth so it is heard at Checkpoint A; T16 holds the veto (seeded-only Stages) with the rebuild path kept for restores |
| A rebuild re-wires in the wrong Decay Mode | Med | `_lastControlledDecay` recorded in `wireGlobalFxChain`; T5's test wires Controlled, rebuilds, asserts the join |
| Twelve stages × two channels cost the Pixel underruns | High | T0 baseline; T14 run (b) isolates the Phaser at full; the ceiling drops before any threshold; T15b holds its wet at 0 on lighter loads |
| Two bell-curved lit draws defeat nominal edges or are correlated | Med | T7 fits by measurement over 20 000 styles and tests independence on 3 000 held out |
| A synced Phaser is pushed with `sync` leaking to the engine | Low | T6's test asserts no `sync` property reaches `setGlobalPhaser` |
| A stale `TempoSyncSlider` `allowed` list after a tempo change | Low | T11 memoises on `bpm`, the Delay's pattern |
| Seven sliders overflow the phone shell | Low | Checkpoint B's phone look; the column scrolls; no new container (layout decision 10) |
| `GlobalAudioSettings` gaining keys breaks literals across the tree | Med | T1 carries presets, fixture, oracles and setter placeholders in one commit (50.3's lesson) |
| The stereo split at the Phaser changes the sound of the Compressor stage | Low | Listening item at Checkpoint A; wah-first order keeps the mono node ahead of the split |

## Open Questions
- Spec §7: the Stages rebuild (T5 builds it, T16 decides), seeded Sync odds (T7 nominal 0.5, T16 moves it), bands
  and ceiling (T7/T16), rate range (T1 constant; one-row change), slot order (T4/T5 wah first; T16 may swap),
  presets (T1 defaults clean), lore words (T8 placeholders, T17 copy pass).
