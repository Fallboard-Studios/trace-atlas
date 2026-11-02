# Implementation Plan: Even Seeded Draws

Spec: [docs/specs/EVEN_SEEDED_DRAWS.md](../specs/EVEN_SEEDED_DRAWS.md). Backlog slot:
[47](../todo/backlog.md#47-audio-seeded-draws-are-welded-and-centre-heavy--even-draws-first) (the world and visual draws
are [46](../todo/backlog.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement),
on their own branch later). Build branch: `fix/even-seeded-draws` off `main` at `56962ebe`. Step 0 of refining the
themes and aspects. The bands get tuned only after this ships and Classic has been heard on it.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`. The measuring
harness (spec §5.2) is a temporary `src/utils/zzSpread.test.ts`, run as
`ZZ_OUT=<scratch>/spread.json npx vitest run src/utils/zzSpread.test.ts` and deleted before every commit.

The planning skill's default output paths (`tasks/plan.md`, `tasks/todo.md`) are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".

## Overview

Every audio draw named in spec §1.3 moves from `getSeededVal` to an even draw (`getUniformSeededVal`), or to the new
centred draw (`getCentredSeededVal`) for the EQ bands, the two detunes and the robot LFO detune depth, with its dataId
and offset unchanged. Every
share edge compared against one of those draws is reset to its intended share (spec §1.4).

The tasks go outside in, one generator at a time, and **every commit leaves the suite green**:

- Phase 1 builds the two draw functions and a test helper that lets the existing stub-driven tests steer them (T1–T3),
  behind T0's before-measurements.
- Phase 2 switches the robot generators (T4–T9).
- Phase 3 switches the global half (T10–T15).
- Phase 4 switches swells and pitch drift (T16–T17).
- T18 re-measures.
- Checkpoint D is Crawford's listen of Classic. Any narrowing he asks for becomes its own task (N1, N2, …) before the
  docs (T19–T21).

Each task names its **Proof** (TASK_TEMPLATE.md):

- a RED test for every task that changes behaviour (T1–T17);
- a run for T0 and T18;
- a Read for T19–T21.

One commit per task, with subjects `even-draws T<n>: …`. RED first, then green. Every new test is mutation-checked:
put the old draw back and see the test fail, then restore it. No docs guards and no source scans (CLAUDE.md,
2026-10-23).

## Architecture Decisions

- **The call site changes its function name, nothing else.** `getUniformSeededVal` gains `min` and `max` (defaults 0
  and 1, so every existing caller is unchanged), so `getSeededVal(noiseMap, id, offset, min, max)` becomes
  `getUniformSeededVal(noiseMap, id, offset, min, max)`. The dataId and offset stay the draw's identity (spec §3
  "Always").
- **`getCentredSeededVal` is the mean of two even draws**, `dataId` and `${dataId}.centre`, at the same offset (spec
  §1.2). A triangle, not a sum of more draws: it matches today's robot spread at the 5th–95th percentile (0.16–0.84),
  and it's two hashes, not three.
- **`getSeededVal` itself does not change** (spec §3 "Never"). Terrain, placement and every backlog-46 draw still use
  it, and the smooth walks need it.
- **Tests steer the even draws through tagged noise maps (T3).**
  - *The problem (found by the probe below):* five test files force outcomes with constant noise stubs. In
    `audioSwells.test.ts`, `ALWAYS_MIN = () => -1` means "every draw at its min"; `noiseMapForDataIds` gives one raw
    value per dataId. `spawnSystem.test.ts`, `sessionDiff.test.ts` and `powerController.world.test.ts` do the same.
    The even draw hashes its three samples, so a constant stub lands every draw at one arbitrary position and steers
    nothing.
  - *The fix:* T3 moves those helpers into `src/testUtils/seededDraws.ts`. A stub map built there carries a tag. A
    vi.mock factory from the same file wraps `getUniformSeededVal` and `getCentredSeededVal` so that a tagged map
    steers them as it steers `getSeededVal`: raw −1 to the band's min, 0 to its middle, 1 to its max, per dataId where
    the map names one. An untagged (real) map passes through to the real draw.
  - *The payoff:* each converted test keeps its stub calls and its intent, and changes only its imports and its
    vi.mock line. Rejected: injecting a draw function into every generator, which is a refactor of every generator's
    signature for the tests' sake.
- **`sampleField` loses its `uniform` flag.** After T10 every global loading key draws even, so the flag has no false
  case left. T10 deletes it rather than flipping its default. The EQ keys take the centred draw through a small key
  set inside `sampleField`, not through a second flag.
- **A share edge moves in the same commit as the draw it is compared against.** If the edge moved alone, or the draw
  moved alone, the realised share would jump. Together, the share stays as heard (the fitted rows of spec §1.4) or
  becomes the written number (the written rows). Each task's share test is a guard: it passes before the change and
  after.
- **Both robot paths change together.** `spawnRobot` duplicates the copy chance, copy source, dynamics, rests, accents
  and master volume draws that `generateRobotAudioBaseline` makes (spawnSystem.ts). T9 changes both, and the existing
  parity tests (spawn and replay agree) must stay green unmodified. Every other robot draw lives in a shared function
  (`deriveEnvelopeFields`, `deriveMelodyFields`, `deriveVoiceFields`, `generateAudioAttributes`,
  `generateRobotLfoLinks`, `generateCompositionSeed`), so one change covers both paths.
- **A test that pins a bell-era value is updated to the new behaviour in the task whose switch breaks it, never
  deleted.** That covers a fixed seeded number, a realised share, a distinct count, a calibration set, or a scenario
  that relied on a world happening to seed a trait. Each task runs the full suite before committing and repairs what its
  own switch breaks. The probe below predicts which files those are. A scenario test that needs a trait seeds it
  explicitly ([[parity-test-fixture-non-default-values]]): it never searches for a seed that happens to have it.
- **Distribution tests run the real generators** over seeded noise maps (`createNoise2D(alea(\`${x}:${y}\`))` for the
  locale, `getAttenuationStyleNoiseMap` with an evict per style for the style map), as the harness does. They assert
  shares, spreads and correlations within a tolerance sized to the sample: about 400 worlds × 12 robots, ±2 points on
  a share, |r| < 0.1 on the named welded pairs.
- **The no-noise-map fallback** (`spawnRobot`'s `(_x, _y) => 0` stand-in) no longer lands mid-band, because the even
  draw hashes three zeros to one fixed position. It is still a valid in-band robot. T7 and T9 assert that, not the
  midpoint.

## The probe (2026-11-01, during planning)

`getSeededVal`'s body was swapped for the even draw for one full-suite run, then reverted (the source is unchanged).
That over-reaches the plan, because it also moves the world draws and, through `getUniformSeededVal`'s inner samples,
the draws that are already even. The result: 197 failures in 19 files out of 13,244 tests. They sort like this:

| File | Fails | Belongs to |
|---|---|---|
| `src/systems/audioSwells.test.ts` | 142 | T16 (constant-stub tests, through T3) |
| `src/utils/globalAudioSeed.test.ts` | 11 | T10–T14 (the colour shares over hold-out styles, a Phaser note at the seed tempo, a field read byte for byte) |
| `src/systems/spawnSystem.test.ts` | 10 | T4–T9 (the articulation shares; the "noise −1 is a glider with the accent bandpass" / "noise +1 is the plain robot" stubs, through T3), and probe artifacts on names and colours |
| `src/utils/sessionDiff.test.ts` | 4 | T16 (a save mid-swell) |
| `src/utils/seedBaseline.test.ts` | 3 | T13 (a fixture that needs a seeded Sync on lane b) |
| `src/systems/robotSystems.test.ts` | 1 | T17 ("re-rolls ~25 % of melody noteIndex values") |
| `src/systems/worldTransition.test.ts` | 1 | T13 or T14 (a theme pick pushes each lane and global link it moves) |
| `src/utils/worldDiffCodec.test.ts` | 1 | T11 (a Free Delay over a seeded Sync) |
| `src/systems/powerController.world.test.ts` | 1 | T16 (paused world swells) |
| `getSeededVal.test.ts` (5), `robotSendsParity.test.ts` (7), `stations`, `terrainProfile`, `factoryPlacementSystem` (2), `midgroundSilhouettes` (2), `workSites`, `sceneToOrbiterLocal`, `CompanyCrudControls`, `sessionStore` (2) | 23 | Not this plan. They come from changing `getSeededVal` itself, or the already-even sends and stations, or the world draws (backlog 46). |

## Dependency Graph

```
T0 (before-measurements: spreads, shares, timing)
 │
T1 (getUniformSeededVal min/max) ── T2 (getCentredSeededVal) ── T3 (steered-draw test helper)
                                                                    │
 ┌──────────────────────────────────────────────────────────────────┼─────────────────────────────┐
 │                                                                  │                             │
T4 envelope ── T5 melody ── T6 voice ── T7 audio attributes   T10 sampleField + EQ          T16 swells
  ── T8 robot LFO links ── T9 copy + performance + volume      ── T11 colour + Delay Sync     ── T17 pitch drift
           │                                                   ── T12 BPM ── T13 LFO Bank
   Checkpoint A (robots)                                       ── T14 global LFO links
                                                               ── T15 pacing
                                                                    │
                                                            Checkpoint B (global)
                                                                    │
                    T18 after-measurements (after T9, T15, T17) ── Checkpoint C (code complete)
                                                                    │
                                            Checkpoint D (Crawford's listen) ── N1… (narrowing, if asked)
                                                                    │
                                    T19 PROCEDURAL_GENERATION ── T20 AUDIO_SYSTEM + grids ── T21 backlog + plan.md
```

Phases 2, 3 and 4 touch different source files and could run in any order after T3. They run in the numbered order
so the robots, which are the most heard, reach a checkpoint first. Inside a phase the tasks are sequential, because
they share a source file and a test file.

## Task List

### Phase 1: The draws and the test helper

- [x] **Task 0: Before-measurements — spreads, shares and timing on `main`**

  **Description:** Record the `zzSpread` harness's before-table: distinct counts, outer-tenth shares, the correlated
  pairs and the share of every §1.4 edge. The measurements of 2026-11-01 (spec §1.1, run on `main` at `56962ebe`)
  are that table, so this copies them into the record rather than measuring again. Also add a timing case to the
  harness that times `generateRobotRosterBaseline(noiseMap, 12)` and `generateWorldSeedBaseline(identity)`: median of
  200 runs each after a warm-up, on the desktop. Record both numbers.

  **Proof:** Run — the harness's output, copied into the record. No test file is committed (the harness is deleted
  before the commit).

  **Acceptance criteria:**
  - [x] The record holds the before-table and the two timings.
  - [x] The commit contains only this plan's record.

  **Verification:**
  - [x] `git status` shows no `zz*` file staged.

  **Dependencies:** None.

  **Files:** `docs/tasks/EVEN_SEEDED_DRAWS.md` (the record)

  **Estimated scope:** XS (a run and a record)

- [x] **Task 1: getSeededVal.ts — `getUniformSeededVal` takes a band**

  **Description:** Add `min = 0, max = 1` to `getUniformSeededVal`, mapping its `[0, 1)` draw linearly onto the band.
  The defaults keep every existing caller identical: stations, sends, the deal, the pedals, humanize and the LFO
  lanes.

  **Proof:** RED test — `src/utils/getSeededVal.test.ts`: with a band, the draw lands in `[min, max)` and equals
  `min + t × (max − min)` for the unbanded `t` at the same dataId and offset. This fails before the change, because
  the extra arguments are ignored.

  **Acceptance criteria:**
  - [x] `getUniformSeededVal(map, id, off, min, max)` returns `min + getUniformSeededVal(map, id, off) × (max − min)`.
  - [x] Called without a band, it returns exactly what it returns today. The existing cases pass unmodified.

  **Verification:**
  - [x] `npx vitest run src/utils/getSeededVal.test.ts` passes, and the full suite stays green (no caller moved).
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/utils/getSeededVal.ts`, `src/utils/getSeededVal.test.ts`

  **Estimated scope:** XS

- [x] **Task 2: getSeededVal.ts — `getCentredSeededVal`**

  **Description:** New export: the mean of `getUniformSeededVal(map, dataId, offset)` and
  `getUniformSeededVal(map, \`${dataId}.centre\`, offset)`, mapped onto `[min, max]` (spec §1.2). No caller yet; T6, T7
  and T10 use it.

  **Proof:** RED test — `src/utils/getSeededVal.test.ts`: over 3,000 seeded maps the draw stays in the band, its
  median is within 2 % of the middle, each outer tenth holds 1–3.5 % of draws (a triangle gives 2 %), and the
  middle fifth holds 30–42 % (a triangle gives 36 %). It also equals the mean of the two named even draws. Fails
  before the change, because the function doesn't exist.

  **Acceptance criteria:**
  - [x] It returns `min + ((a + b) / 2) × (max − min)` for the two named even draws `a` and `b`.
  - [x] Its spread over seeded maps is the triangle above.

  **Verification:**
  - [x] `npx vitest run src/utils/getSeededVal.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/utils/getSeededVal.ts`, `src/utils/getSeededVal.test.ts`

  **Estimated scope:** XS

- [ ] **Task 3: src/testUtils/seededDraws.ts — stub maps that steer every draw**

  **Description:** A test-only module (Architecture Decisions, "Tests steer the even draws"):
  - `constantNoiseMap(raw)` and `noiseMapForDataIds(mapping, fallback = 0)` move here from `audioSwells.test.ts`,
    with the same names and arguments. Each now also carries a tag naming its raw values.
  - `steerSeededDraws(actual)` is the body for a test file's `vi.mock('…/getSeededVal', …)` factory. It returns
    `actual` with `getUniformSeededVal` and `getCentredSeededVal` wrapped, so a tagged map yields `(raw + 1) / 2` of
    the band for the dataId (by name, else the fallback), and anything else calls the real function. `getSeededVal`
    needs no wrapper: a tagged map still is a function returning `raw`.

  The wrappers are `vi.fn`s, so a file that spies on a draw today (spawnSystem.test.ts, globalAudioSeed.test.ts) keeps
  its spy. No production code changes, and no existing test converts yet: each conversion lands with the switch that
  needs it.

  **Proof:** RED test — `src/testUtils/seededDraws.test.ts`, with the factory mocking `@/utils/getSeededVal`:
  - `constantNoiseMap(-1)`, `(0)` and `(1)` drive `getSeededVal`, `getUniformSeededVal` and `getCentredSeededVal` to
    min, middle and max of a band.
  - `noiseMapForDataIds({ a: -1 }, 1)` gives dataId `a` its min and every other dataId its max.
  - A real seeded map gives exactly the real functions' values.

  Fails before the change: the module doesn't exist.

  **Acceptance criteria:**
  - [ ] The three cases above hold.
  - [ ] Nothing outside `src/testUtils/` and its test changes.

  **Verification:**
  - [ ] `npx vitest run src/testUtils/seededDraws.test.ts` passes; full suite green.
  - [ ] `npm run build:types`, `npm run lint` clean. If the lint rules for test files reject a non-test module under
    `src/testUtils/`, follow `worldLinkFixtures.ts`'s precedent there.

  **Dependencies:** Task 2.

  **Files:** `src/testUtils/seededDraws.ts`, `src/testUtils/seededDraws.test.ts`

  **Estimated scope:** S

### Checkpoint 0: The draws
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean. Nothing that sounds has moved yet.

---

### Phase 2: The robots (locale map)

Every task here: over about 400 seeded worlds × 12 robots, run the generator it changes. The RED test is a spread
that today's draw cannot reach. The share guard is a test that passes before and after. A stub-driven test this switch
breaks moves onto T3's helper in the same commit. For `spawnSystem.test.ts`, that means `deterministicNoiseMap`
(`() => -1`) and its +1 sibling become `constantNoiseMap(-1)` / `(1)`, and its existing `getSeededVal` mock adopts
`steerSeededDraws`.

- [ ] **Task 4: robotFieldDerivation.ts — the envelope draws even, the shaped shares as heard**

  **Description:** In `deriveEnvelopeFields` and `seedCurve`, switch the four stages and each curve's `.shaped` and
  `.which` draws to `getUniformSeededVal`. In `classic.ts`, set `robot.shapedAttack.lit` 0.21 → **0.155** and
  `robot.shapedRelease.lit` 0.275 → **0.15** (spec §1.4), and rewrite their comments: the edge is the share.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts` (create it if absent; otherwise the envelope block
  of `spawnSystem.test.ts`). Under Classic, a linear robot's attack, decay, sustain and release each put 8–12 % of
  robots in each outer tenth of their band (today about 1–3 %). Decay and sustain correlate under 0.1 with each other
  and with the other stages. Each non-linear curve is drawn by at least 15 % of shaped robots. Guard: the shaped shares
  are 15.5 ± 2 % and 15 ± 2 %.

  **Acceptance criteria:**
  - [ ] Every envelope draw is even, with dataIds and offsets unchanged.
  - [ ] The shaped shares stay as heard; the stages fill their bands.

  **Verification:**
  - [ ] The new test passes, the full suite is green after repairing what this switch breaks (expected: the
    articulation-share and noise ±1 cases in `spawnSystem.test.ts`), and the mutation check passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/robotFieldDerivation.ts`, `src/data/bands/classic.ts`, the test file,
  `src/systems/spawnSystem.test.ts` (repairs)

  **Estimated scope:** M (two sources, one new test, the first conversion onto T3)

- [ ] **Task 5: robotFieldDerivation.ts — the melody fields draw even**

  **Description:** In `deriveMelodyFields`, switch density, the two toggles' `.active` and pitch repeat. The
  toggles' `offShare` stays 0.15 and now realises 15 % (spec decision 5).

  **Proof:** RED test: density and pitch repeat fill their bands (8–12 % per outer tenth). Motif Length and Note
  Variance are each off for 15 ± 2 % of robots (today about 5 %). The on values spread across 1–8 with each value
  between 9 and 16 % of on robots. Density correlates under 0.1 with sustain and with the glider roll (the welded pairs
  of spec §1.1).

  **Acceptance criteria:**
  - [ ] Every melody draw is even.
  - [ ] The off shares are 15 %.

  **Verification:** As Task 4.

  **Dependencies:** Task 4 (same file and test file).

  **Files:** `src/systems/robotFieldDerivation.ts`, its test, plus repairs.

  **Estimated scope:** S

- [ ] **Task 6: robotFieldDerivation.ts — the voice draws even, layer detune centred, the accent share as heard**

  **Description:** In `deriveVoiceFields`, the accent roll, both cutoffs, Q, filter type, the waveform pick and each
  layer's quiet roll, waveform, gain and phase switch to even. The layer detune switches to `getCentredSeededVal`. In
  `classic.ts`, `robot.accentFilterFreq.lit` 0.27 → **0.2**. `ACCENT_BANDPASS_SHARE` (0.4) and `robot.layerGain.lit`
  (0.5) stay as written (spec §1.4).

  **Proof:** RED test: under Classic each waveform is the base of 20 ± 2 % of robots (today sine and pulse are about
  6.5 % each). Both cutoffs fill their bands. The layer detune's median is within 0.1 cent of 0, with 1–3.5 % of
  layers in each outer tenth and more than 1,000 distinct values. Guards: the accent share is 20 ± 2 %, bandpass is
  40 ± 3 % of accent robots, and each of layers 1 and 2 is quiet for 50 ± 3 % of robots.

  **Acceptance criteria:**
  - [ ] Every voice draw is even except the layer detune, which is centred.
  - [ ] The accent share stays as heard.

  **Verification:** As Task 4.

  **Dependencies:** Task 5.

  **Files:** `src/systems/robotFieldDerivation.ts`, `src/data/bands/classic.ts`, its test, plus repairs.

  **Estimated scope:** S–M

- [ ] **Task 7: spawnSystem.ts — `generateAudioAttributes`: glide, register, phase and pulse width even, detune centred**

  **Description:** Switch the glider roll, portamento time, register, phase and pulse width to even, and the robot
  detune to centred. In `classic.ts`, `robot.portamento.lit` 0.23 → **0.125**. The comments on the glider share and the
  articulation block (spawnSystem.ts "ROBOT ARTICULATION") are rewritten: the edge is the share.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: every register in `OCTAVE_REGISTERS` seeds its even share ± 3
  points. The glide time fills its band. The detune's median is 0, it reaches ±4 or more in 1–5 % of robots, and every
  whole cent from −5 to 5 occurs. Guard: 12.5 ± 2 % of robots glide. Fallback: `generateAudioAttributes` over a
  constant-zero map still returns in-band values.

  **Acceptance criteria:**
  - [ ] The six draws switch as described.
  - [ ] The glider share stays as heard.
  - [ ] The fallback robot is in band.

  **Verification:** As Task 4.

  **Dependencies:** Task 6 (the classic.ts edits run in sequence).

  **Files:** `src/systems/spawnSystem.ts`, `src/data/bands/classic.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S–M

- [ ] **Task 8: spawnSystem.ts — the robot LFO links draw even, the detune depths centred, the on-shares as fitted**

  **Description:** In `generateRobotLfoLinks`, switch each target's quiet roll and lane to even. Switch each target's
  depth to even too, except the three `layerN.detune` targets. Their depth draws centred and folded to peak at the
  window's floor: `min + |getCentredSeededVal(map, id, offset, -1, 1)| × (max − min)` (spec §1.2 and decision 3: the
  robot LFO detune depth stays close to no detune). In `classic.ts`,
  `robot.lfoGainDepth.lit` and `robot.lfoDetuneDepth.lit` 0.3 → **0.25**, and `robot.lfoBusDepth.lit` 0.2 → **0.135**
  (spec §1.4). Rewrite their comment: the edge is the share. The lane's roster-aware tally is unchanged.

  **Proof:** RED test: each lit gain and bus link's depth fills its window (8–12 % per outer tenth). Each lit detune
  link's depth peaks at the floor: its median is 3.6 ± 0.4 %, 15–23 % of lit detune links land at 1.9 % or less, at
  most 2.5 % land above 9.1 %, and every whole percent from 1 to 10 occurs. The on-rolls of the seven
  targets correlate under 0.1 with each other and with the envelope draws (today decay ↔ the layer-0 gain roll is 1.0).
  Guards: each layer target is on for 25 ± 2 % of robots, and the bus for 13.5 ± 2 %.

  **Acceptance criteria:**
  - [ ] Every LFO-link draw is even, except the detune depths, which are centred and folded to the floor.
  - [ ] The on-shares are as fitted.

  **Verification:** As Task 4.

  **Dependencies:** Task 7 (and Task 2, the centred draw).

  **Files:** `src/systems/spawnSystem.ts`, `src/data/bands/classic.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S

- [ ] **Task 9: spawnSystem.ts — copy, performance, volume and the melody seed draw even, in both paths**

  **Description:** Switch the copy chance and copy source, dynamics, rests, accents, master volume and
  `robot.compositionSeed` (`generateCompositionSeed`) in both `generateRobotAudioBaseline` and `spawnRobot`. The copy
  edge stays 0.30 and now realises 30 % (decision 5).

  **Proof:** RED test: dynamics, rests and accents fill their bands (8–12 % per outer tenth; today dynamics is 0.6 %
  in total). The melody seed takes more than 4,700 distinct values over 4,800 robots (today about 730). A copied robot
  is 30 ± 3 % of robots after the first. Rests and the accent roll correlate under 0.1 with master volume. Fallback:
  `spawnRobot` with no noise map still spawns an in-band robot.

  **Acceptance criteria:**
  - [ ] Every listed draw is even in both paths.
  - [ ] The existing spawn-versus-replay parity tests pass unmodified.

  **Verification:** As Task 4, plus `npx vitest run src/systems/robotSendsParity.test.ts src/utils/sessionDiff.test.ts`
  green.

  **Dependencies:** Task 8.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, plus repairs.

  **Estimated scope:** M (two paths, parity to hold)

### Checkpoint A: The robots
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] The harness's robot section (re-run on the branch, not committed): zero robot key pairs above 0.3, every robot
  key above 30,000 distinct values over 36,000 draws, and every §1.4 robot edge at its share.
- [ ] Reviewed with Crawford before Phase 3. A quick listen to one world is optional here; the real listen is
  Checkpoint D.

---

### Phase 3: The global half (style map)

- [ ] **Task 10: globalAudioSeed.ts — `sampleField` always even, the EQ centred**

  **Description:** `sampleField` drops its `uniform` parameter and always draws with `getUniformSeededVal`, except the
  three `eq3` keys, which draw with `getCentredSeededVal`. Every call site's `true` argument goes. This moves the
  compressor, EQ, both filters, delay, reverb, limiter and the three colour nodes' value draws. The modulation pedals
  were already even and don't move. The file's existing `getSeededVal` mock adopts `steerSeededDraws` if a case needs
  steering.

  **Proof:** RED test — `src/utils/globalAudioSeed.test.ts`: over 3,000 styles, each moved key has more than 2,500
  distinct values (today 3–498, `compressor.knee` 3), and each linear non-EQ key puts 8–12 % of worlds in each outer
  tenth. The EQ keys have a median within 0.2 dB of 0 and 1–3.5 % per outer tenth. The welded set (EQ low, mid and
  high, master filter Q, delay time, compressor attack) correlates under 0.1 pairwise. Guard: every modulation pedal
  value is identical to before for 20 fixed styles (they were already even).

  **Acceptance criteria:**
  - [ ] Every global loading key is drawn even, and the EQ bands are centred.
  - [ ] The pedal values are unchanged.

  **Verification:** As Task 4 (expected repairs: the "field with no declared step, byte for byte" case).

  **Dependencies:** Task 3.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`, plus repairs.

  **Estimated scope:** S–M

- [ ] **Task 11: globalAudioSeed.ts — the colour character and the Delay Sync draw even**

  **Description:** Switch `globalAudio.colour.character`, `globalAudio.delay.syncMode` and `globalAudio.delay.syncNote`
  to even. `COLOUR_CHARACTER_BANDS` becomes **[0.25, 0.5, 0.75, 1]**, and its fitting comment is rewritten.
  `DELAY_SYNC_ODDS` stays 0.66.

  **Proof:** RED test: over 3,000 styles the Delay Sync note draw takes more than 2,500 distinct values (today 192).
  Guards: each colour character is 25 ± 3 % of worlds with no world lighting two nodes, and Delay Sync is 66 ± 3 %.
  Mutation: put the fitted bands back with the even draw, and the guard fails (clean about 31 %).

  **Acceptance criteria:**
  - [ ] Three draws are even.
  - [ ] The colour edges are nominal, and both shares are as targeted.

  **Verification:** As Task 4 (expected repairs: the colour hold-out share case in globalAudioSeed.test.ts, and
  `worldDiffCodec.test.ts`'s Free Delay over a seeded Sync).

  **Dependencies:** Task 10.

  **Files:** `src/utils/globalAudioSeed.ts`, its test, `src/utils/worldDiffCodec.test.ts` (repair)

  **Estimated scope:** S

- [ ] **Task 12: bpmSeed.ts — the tempo draws even**

  **Description:** `generateAttenuationStyleBpm` switches to `getUniformSeededVal` within the theme's `bpm` band.

  **Proof:** RED test — `src/utils/bpmSeed.test.ts`: over 3,000 styles under Classic, every whole tempo from 41 to 99
  occurs, and each outer tenth of 40–100 holds 8–12 % of worlds. The existing distinct-values test is updated to the
  new count.

  **Acceptance criteria:**
  - [ ] The tempo is even within the band.
  - [ ] Every theme's band is still respected.

  **Verification:** As Task 4. The Sync-note tests that read the seed tempo (Delay, Phaser, the LFO Bank; the probe
  hit "a Phaser note at the style tempo") stay green or are repaired.

  **Dependencies:** Task 11.

  **Files:** `src/utils/bpmSeed.ts`, `src/utils/bpmSeed.test.ts`, plus repairs.

  **Estimated scope:** XS–S

- [ ] **Task 13: globalAudioSeed.ts — the LFO Bank draws even, the Sync shares as targeted**

  **Description:** In `generateLfoBankSettings`, switch each lane's rate, shape, both drifts, Sync mode and Sync note.
  `LFO_BANK_SYNC_ODDS` becomes **{ a: 0.75, b: 0.66, c: 0.33, d: 0.25 }**, the FREE_SYNC_TOGGLE targets, and its
  calibration comment is rewritten.

  **Proof:** RED test: each lane's rate and both drifts take more than 2,500 distinct values over 3,000 styles (today
  `b.rateDrift`, `c.rateDrift` and `d.depthDrift` take 3). Guard: Sync is a 75 / b 66 / c 33 / d 25 ± 3 %.

  **Acceptance criteria:**
  - [ ] Every LFO Bank draw is even.
  - [ ] The Sync shares are on target.

  **Verification:** As Task 4 (expected repairs: `seedBaseline.test.ts`'s fixture that needs a seeded Sync on lane b,
  re-pinned to a seed that has it and asserted as a precondition; possibly `worldTransition.test.ts`'s theme-pick lane
  case, pinning its style by id).

  **Dependencies:** Task 12.

  **Files:** `src/utils/globalAudioSeed.ts`, its test, `src/utils/seedBaseline.test.ts`,
  `src/systems/worldTransition.test.ts` (repairs)

  **Estimated scope:** S–M

- [ ] **Task 14: globalAudioSeed.ts — the global LFO links draw even**

  **Description:** In `generateGlobalLfoLinks`, switch each target's quiet roll and depth. `LFO_QUIET_THRESHOLD` stays
  0.34.

  **Proof:** RED test: each of the seven targets is quiet in 34 ± 3 % of worlds (today `hpf.Q` is never quiet, and
  `eq3.high` is 27 %). Each depth takes more than 2,500 distinct values (today the EQ low and high depths take 3).

  **Acceptance criteria:**
  - [ ] The quiet and depth draws are even.
  - [ ] Every target is quiet at its written share.

  **Verification:** As Task 4.

  **Dependencies:** Task 13.

  **Files:** `src/utils/globalAudioSeed.ts`, its test, plus repairs.

  **Estimated scope:** S

- [ ] **Task 15: globalAudioSeed.ts — ping variance, swell frequency and swell duration draw even**

  **Description:** Switch `generatePingVarianceAutomation`, `generateSwellFrequency` and `generateSwellDuration`. Each
  keeps its own step grid.

  **Proof:** RED test: over 3,000 styles, ping variance reaches every step of its grid inside the seed range (today it
  takes 3 values), and swell frequency and duration each reach both ends of their seed range in at least 5 % of
  worlds.

  **Acceptance criteria:**
  - [ ] The three pacing draws are even and still on their grids.

  **Verification:** As Task 4.

  **Dependencies:** Task 14.

  **Files:** `src/utils/globalAudioSeed.ts`, its test, plus repairs.

  **Estimated scope:** XS–S

### Checkpoint B: The global half
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] The harness's global section: zero plain-era pairs above 0.3, every key above 2,500 distinct values over 3,000
  styles, and every §1.4 global edge at its share.
- [ ] `generateWorldSeedBaseline` still round-trips: an untouched world's link is still the bare triple (the existing
  seedBaseline and sessionShareUtils tests green).
- [ ] Reviewed with Crawford.

---

### Phase 4: Swells and drift

- [ ] **Task 16: audioSwells.ts — every per-measure roll draws even**

  **Description:** Switch the two triggers, both target picks, the direction tiebreak, the peaks, the rise/fall split,
  the company chance, pick, attribute and direction. `frequencyToPerTickChance` and `SWELL_COMPANY_CHANCE` (0.15) are
  unchanged and now realise their numbers (decision 5). `audioSwells.test.ts` drops its local `constantNoiseMap`,
  `ALWAYS_MIN/MID/MAX` and `noiseMapForDataIds` definitions for T3's, and adds the `steerSeededDraws` mock. Its 142 stub-driven
  cases then pass as written. Any that still fail are a real behaviour change, handled one by one.

  **Proof:** RED test — `src/systems/audioSwells.test.ts`, through the module's exported tick with the store seeded the
  way its existing cases seed it, over real seeded style maps:
  - At Frequency 2, over 300 styles × 400 measures, the global trigger starts a swell on 12.5 ± 1.5 % of eligible
    ticks (today about 4 %).
  - With the robot trigger passed, the company path is taken 15 ± 2 % of the time (today about 4 %).
  - The target pick reaches every eligible target.

  Pin any style a case needs with its own id (the worldTransition gotcha: the style noise map is cached by id alone).

  **Acceptance criteria:**
  - [ ] Every swell roll is even.
  - [ ] The trigger and company shares are their written numbers.
  - [ ] The stub-driven cases pass through T3 unmodified in intent.

  **Verification:** As Task 4 (expected repairs: `sessionDiff.test.ts`'s four mid-swell saves and
  `powerController.world.test.ts`'s paused-swells case, both onto T3's maps). No documented-flaky swell test is
  investigated; if one surfaces, it is reported to Crawford, not chased ([[worldtransition-swell-clear-test-flaky]]).

  **Dependencies:** Task 3. Runs after Task 15 in the numbered order.

  **Files:** `src/systems/audioSwells.ts`, `src/systems/audioSwells.test.ts`, `src/utils/sessionDiff.test.ts`,
  `src/systems/powerController.world.test.ts`

  **Estimated scope:** M (the busiest test file of the set, but the conversion is the helper swap)

- [ ] **Task 17: robotSystems.ts — the docked pitch drift draws even**

  **Description:** The `robot.pitchDrift` rand passed to `reRollMelodyPitches` switches to `getUniformSeededVal` with
  the same offsets (`dockCycleCount × 100 + callIndex`).

  **Proof:** RED test — `src/systems/robotSystems.test.ts`: over many dock cycles across seeded worlds, the rand
  values handed to the re-roll (captured through an injected or spied `reRollMelodyPitches`) put 8–12 % in each outer
  tenth of [0, 1), and consecutive calls correlate under 0.1. Replay determinism holds: the same world and cycle give
  the same pitches. The existing "re-rolls ~25 % of melody noteIndex values" case is updated if its share moves (it
  measured the bell).

  **Acceptance criteria:**
  - [ ] The drift draw is even, and a replay repeats.

  **Verification:** As Task 4.

  **Dependencies:** Task 16.

  **Files:** `src/systems/robotSystems.ts`, `src/systems/robotSystems.test.ts`

  **Estimated scope:** S

- [ ] **Task 18: After-measurements — spreads, shares and timing on the branch**

  **Description:** Re-run the harness and the timing case on the branch head. Record the after-table beside T0's
  before-table, and the two timings beside T0's. If either timing grows past 16 ms, stop and ask Crawford (spec §5.3:
  memoising `precomputeDataX` is the first fix, and an "Ask first"). Then delete the harness.

  **Proof:** Run — recorded.

  **Acceptance criteria:**
  - [ ] Both tables and both timings are recorded.
  - [ ] No in-scope call site still uses `getSeededVal`: a grep over spec §1.3's files, recorded here as a check, not
    a test.
  - [ ] The harness is gone.

  **Verification:**
  - [ ] `git status` is clean of `zz*` files.

  **Dependencies:** Tasks 9, 15, 17.

  **Files:** `docs/tasks/EVEN_SEEDED_DRAWS.md` (the record)

  **Estimated scope:** XS

### Checkpoint C: Code complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] The T18 record meets spec §6's measurable criteria.

### Checkpoint D: Crawford's listen (spec §5.4)
- [ ] Classic on even draws, across a few worlds (a fresh Roll or two, and a link), with `?debug` open for swells
  and underruns. Things to listen for:
  - the fuller waveform and register mix;
  - copied robots at 30 %;
  - Motif Length and Note Variance off at 15 %;
  - swells at their promised rate;
  - an Audio Rig that varies per world, with the EQ near flat.
- [ ] Each narrowing he asks for becomes a task (N1, N2, …): a Classic band edit in `classic.ts` with a RED guard on
  the band's new edges, one commit each. A swell-rate problem goes back to spec §7 Q1's option (b) as its own task.
- [ ] He passes Classic.

---

### Phase 5: Docs

- [ ] **Task 19: PROCEDURAL_GENERATION.md — audio draws are even**

  **Description:**
  - "Sampling Values": `getUniformSeededVal` takes a band; `getCentredSeededVal` and when to use it.
  - "Gotchas": why a plain draw is welded and coarse, and that it is now for smooth walks and the backlog-46 draws
    only.
  - The Call Sites and Robot Articulation dataId rows that say "bell" or record a fitted threshold.
  - A line on `src/testUtils/seededDraws.ts`: how tests steer a draw.

  Spot-check every name against the shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] The doc matches the shipped functions and the dataIds, and no row still calls an audio draw bell-curved.

  **Verification:** Manual review against source; `npm run lint` clean.

  **Dependencies:** Checkpoint D.

  **Files:** `docs/PROCEDURAL_GENERATION.md`

  **Estimated scope:** XS

- [ ] **Task 20: AUDIO_SYSTEM.md and the grids — a band's edges are reached, a lit is its share**

  **Description:** AUDIO_SYSTEM.md "The band table": the draws inside a band are even (the EQ and detunes centred),
  so a band's edges are reached and a `lit` or edge is the realised share. Also update the grids that carry the same
  numbers (`docs/reference/GLOBAL_CHAIN_GRID.md`, `docs/reference/ROBOT_DATA_GRID.md`): the lit values of §1.4, the
  colour edges, the LFO Bank odds, and any narrowing from Checkpoint D.

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] Every number in those docs matches `classic.ts` and `globalAudioSeed.ts` as shipped.

  **Verification:** Manual review against source.

  **Dependencies:** Task 19.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/reference/GLOBAL_CHAIN_GRID.md`, `docs/reference/ROBOT_DATA_GRID.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 21: backlog 47 and plan.md — the record**

  **Description:** Mark backlog 47 built on this branch, with a pointer to this plan's record (it moves to the archive
  at the merge, per the usual convention). Add plan.md's line for the themes-and-aspects refinement, with 47 as its
  first step and the refinement's next step after the merge (the interview and character sheets).

  **Proof:** Read.

  **Acceptance criteria:**
  - [ ] Both files say what shipped and what is next, with links that resolve.

  **Verification:** Manual review.

  **Dependencies:** Task 20.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`

  **Estimated scope:** XS

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion met; Checkpoint D passed.
- [ ] Docs match the shipped code.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Stub-driven tests stop steering once their draws are even: 142 swell cases and the spawn noise ±1 cases | High | T3's tagged maps and `steerSeededDraws` keep their stub calls working. Each conversion lands with its switch. The probe sized it. |
| A switch breaks pinned tests (seeded numbers, a world that happened to seed a trait) | Medium | The probe table maps each to its task. Each task repairs only what its own switch breaks, updating to the new behaviour. Scenario tests seed the trait they need rather than searching for a seed. |
| A threshold moves without its draw, or the reverse, and a share jumps | Medium | The Architecture Decisions put both in one commit. Each task has a share guard that passes before and after. |
| The two robot paths drift (`spawnRobot` versus `generateRobotAudioBaseline`) | High (saves and links would diff wrongly) | Both change in T9. The existing parity tests must pass unmodified. |
| The even draw costs about four hashes per draw, and baselines regenerate on the deal, `rederiveLoading`, the session diff and Keep's check | Medium | T0 and T18 time both generators. Past 16 ms the build stops for Crawford before any cache. |
| More swells at low Frequency bring back desktop pops (backlog 39) | Medium | Checkpoint D listens with `?debug` open. Option (b), recalibrating the formula, is the fallback task. |
| The no-noise-map fallback robot no longer sits mid-band | Low | T7 and T9 assert it is still in band. |
| A swell test is documented-flaky | Low | Reported, never chased. |
| A seed-dependent case in `worldTransition.test.ts` has an unpinned random style name | Medium | Pin the style with its own id, as F11 did. |

## Open Questions

1. Spec §7 Q1–Q3: **Resolved** (Crawford, 2026-11-01). Swells come as promised, copy is 30 %, and Motif Length off
   and Note Variance off are 15 % each.
2. Does "any detuning" also cover the robot LFO detune depth, Vibrato depth or the frequency shifter? **Resolved**
   (Crawford, 2026-11-01): the robot LFO detune depth stays close to no detune, so its depth draws centred and folded
   to peak at the window's 1 % floor (T8). Vibrato and the shifter stay even.

## Record

(Filled in as the build goes: T0's before-table and timings, each task's deviations, T18's after-table.)

### T0: before-measurements (`main` at `56962ebe`)

The spread run is the 2026-11-01 harness run behind spec §1.1, copied here, not re-run: Classic, 3,000 worlds
(locale maps from random coordinates) × 12 robots at offsets 0–11, 3,000 style maps at offset 0, and 300 style maps ×
400 measures for the swell rolls. Every value is the draw as `[0, 1]` before its band is applied. "Outer" is the share
in the bottom tenth plus the top tenth (20 % if even). The even column is `getUniformSeededVal` at the same dataId and
offset, for comparison.

**Robots (48 keys, 36,000 draws each).**

| | Plain (today) | Even |
|---|---|---|
| Distinct values per key | 3,186–5,627, except `robot.lfo.layer1.gain.depth` 580 and `robot.noteVariance.active` 1,342 | 35,286–35,403 |
| Outer share per key | 0.3–8.0 % (`attackCurve.shaped` 0.3, `lfo.layer2.gain.quiet` 0.3, `dynamics` 0.6, `filterFreq` 1.5, `lfo.bus.frequency.quiet` 1.5) | 19.6–20.5 % |
| 5th–95th percentile | 0.12–0.19 to 0.81–0.88 | 0.05–0.95 |
| Key pairs with \|r\| > 0.3 / > 0.9, of 1,128 | 621 / 217 | 0 / 0 |

**Global (68 keys on the plain draw today, 3,000 draws each).**

| | Plain (today) | Even |
|---|---|---|
| Distinct values per key | 3 on 10 keys (`compressor.knee`, `chebyshev.order`, `pingVarianceAutomation`, `lfoBank.b.rateDrift`, `lfoBank.c.rateDrift`, `lfoBank.c.syncMode`, `lfoBank.d.depthDrift`, `globalLfo.eq3.low.depth`, `globalLfo.eq3.high.depth`, `globalLfo.hpf.Q.quiet`); 24–64 on 13; 148–498 on the other 45 | 2,966–2,999 |
| Outer share per key | 0 % on 47 keys; 1.2–9.5 % on 10; 14.5–17.4 % on 11 (`bpm`, the LPF and HPF frequencies, lane a's shape, rate drift and sync note, lane b's depth drift, lane c's shape and depth drift, the `lpf.Q` and `hpf.frequency` link depths) | 18.4–21.5 % |
| Key pairs with \|r\| > 0.3 / > 0.9, of 2,278 | 1,294 / 640 | 0 / 0 |

**Edge shares (the share of draws under the edge, today).**

| Edge | Value | Realises |
|---|---|---|
| `robot.copyChance` | 0.3 | 19.2 % |
| `robot.audio.portamento.glider` | 0.23 | 13.1 % |
| `robot.audio.attackCurve.shaped` | 0.21 | 16.8 % |
| `robot.audio.releaseCurve.shaped` | 0.275 | 15.5 % |
| `robot.audio.filter.accent` | 0.27 | 20.2 % |
| `robot.audio.filter.type` (`ACCENT_BANDPASS_SHARE`) | 0.4 | 36.7 % |
| `robot.rhythmicMotifLength.active` / `robot.noteVariance.active` | 0.15 | 4.6 / 5.3 % |
| robot LFO gain and detune quiet (lit = the rest) | 0.7 | 73.3–80.8 % quiet (lit 19.2–26.7 %) |
| robot LFO bus quiet | 0.8 | 83.9 % quiet (lit 16.1 %) |
| `DELAY_SYNC_ODDS` | 0.66 | 67.4 % |
| `LFO_BANK_SYNC_ODDS` a / b / c / d | 0.6 / 0.62 / 0.33 / 0.33 | 74.3 / 64.6 / 33.1 / 23.7 % |
| global `LFO_QUIET_THRESHOLD` per target | 0.34 | 26.6–33.7 %, `hpf.Q` 0 % |
| `COLOUR_CHARACTER_BANDS` | 0.3065 / 0.5 / 0.6935 / 1 | 25.4 / 25.0 / 25.5 / 24.1 % |
| swell trigger, global / robot, at 0.125 | 0.125 | 4.4 / 3.2 % |
| swell trigger, global / robot, at 0.25 | 0.25 | 9.9 / 13.3 % |
| swell trigger, global / robot, at 0.5 | 0.5 | 50.0 / 49.8 % |
| `SWELL_COMPANY_CHANCE` | 0.15 | 3.9 % |

**Timings** (the harness's timing case, run 2026-11-01 on the desktop, three runs; median of 200 runs each after 20
warm-up runs, a different world each run):

| Generator | Median |
|---|---|
| `generateRobotRosterBaseline(noiseMap, 12)` | 1.55 ms (1.545–1.552) |
| `generateWorldSeedBaseline({ theme: 'classic' })` | 0.71 ms (0.707–0.714) |
