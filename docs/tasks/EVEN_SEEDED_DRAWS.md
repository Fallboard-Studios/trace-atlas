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

- [x] **Task 3: src/testUtils/seededDraws.ts — stub maps that steer every draw**

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
  - [x] The three cases above hold.
  - [x] Nothing outside `src/testUtils/` and its test changes.

  **Verification:**
  - [x] `npx vitest run src/testUtils/seededDraws.test.ts` passes; full suite green.
  - [x] `npm run build:types`, `npm run lint` clean. If the lint rules for test files reject a non-test module under
    `src/testUtils/`, follow `worldLinkFixtures.ts`'s precedent there.

  **Dependencies:** Task 2.

  **Files:** `src/testUtils/seededDraws.ts`, `src/testUtils/seededDraws.test.ts`

  **Estimated scope:** S

### Checkpoint 0: The draws
- [x] `npm run build:types`, `npm run lint`, `npm test` clean. Nothing that sounds has moved yet.

---

### Phase 2: The robots (locale map)

Every task here: over about 400 seeded worlds × 12 robots, run the generator it changes. The RED test is a spread
that today's draw cannot reach. The share guard is a test that passes before and after. A stub-driven test this switch
breaks moves onto T3's helper in the same commit. For `spawnSystem.test.ts`, that means `deterministicNoiseMap`
(`() => -1`) and its +1 sibling become `constantNoiseMap(-1)` / `(1)`, and its existing `getSeededVal` mock adopts
`steerSeededDraws`.

- [x] **Task 4: robotFieldDerivation.ts — the envelope draws even, the shaped shares as heard**

  **Description:** In `deriveEnvelopeFields` and `seedCurve`, switch the four stages and each curve's `.shaped` and
  `.which` draws to `getUniformSeededVal`. In `classic.ts`, set `robot.shapedAttack.lit` 0.21 → **0.155** and
  `robot.shapedRelease.lit` 0.275 → **0.15** (spec §1.4), and rewrite their comments: the edge is the share.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts` (create it if absent; otherwise the envelope block
  of `spawnSystem.test.ts`). Under Classic, a linear robot's attack, decay, sustain and release each put 8–12 % of
  robots in each outer tenth of their band (today about 1–3 %). Decay and sustain correlate under 0.1 with each other
  and with the other stages. Each non-linear curve is drawn by at least 15 % of shaped robots. Guard: the shaped shares
  are 15.5 ± 2 % and 15 ± 2 %.

  **Acceptance criteria:**
  - [x] Every envelope draw is even, with dataIds and offsets unchanged.
  - [x] The shaped shares stay as heard; the stages fill their bands.

  **Verification:**
  - [x] The new test passes, the full suite is green after repairing what this switch breaks (expected: the
    articulation-share and noise ±1 cases in `spawnSystem.test.ts`), and the mutation check passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/systems/robotFieldDerivation.ts`, `src/data/bands/classic.ts`, the test file,
  `src/systems/spawnSystem.test.ts` (repairs)

  **Estimated scope:** M (two sources, one new test, the first conversion onto T3)

- [x] **Task 5: robotFieldDerivation.ts — the melody fields draw even**

  **Description:** In `deriveMelodyFields`, switch density, the two toggles' `.active` and pitch repeat. The
  toggles' `offShare` stays 0.15 and now realises 15 % (spec decision 5).

  **Proof:** RED test: density and pitch repeat fill their bands (8–12 % per outer tenth). Motif Length and Note
  Variance are each off for 15 ± 2 % of robots (today about 5 %). The on values spread across 1–8 with each value
  between 9 and 16 % of on robots. Density correlates under 0.1 with sustain and with the glider roll (the welded pairs
  of spec §1.1).

  **Acceptance criteria:**
  - [x] Every melody draw is even.
  - [x] The off shares are 15 %.

  **Verification:** As Task 4.

  **Dependencies:** Task 4 (same file and test file).

  **Files:** `src/systems/robotFieldDerivation.ts`, its test, plus repairs.

  **Estimated scope:** S

- [x] **Task 6: robotFieldDerivation.ts — the voice draws even, layer detune centred, the accent share as heard**

  **Description:** In `deriveVoiceFields`, the accent roll, both cutoffs, Q, filter type, the waveform pick and each
  layer's quiet roll, waveform, gain and phase switch to even. The layer detune switches to `getCentredSeededVal`. In
  `classic.ts`, `robot.accentFilterFreq.lit` 0.27 → **0.2**. `ACCENT_BANDPASS_SHARE` (0.4) and `robot.layerGain.lit`
  (0.5) stay as written (spec §1.4).

  **Proof:** RED test: under Classic each waveform is the base of 20 ± 2 % of robots (today sine and pulse are about
  6.5 % each). Both cutoffs fill their bands. The layer detune's median is within 0.1 cent of 0, with 1–3.5 % of
  layers in each outer tenth and more than 1,000 distinct values. Guards: the accent share is 20 ± 2 %, bandpass is
  40 ± 3 % of accent robots, and each of layers 1 and 2 is quiet for 50 ± 3 % of robots.

  **Acceptance criteria:**
  - [x] Every voice draw is even except the layer detune, which is centred.
  - [x] The accent share stays as heard.

  **Verification:** As Task 4.

  **Dependencies:** Task 5.

  **Files:** `src/systems/robotFieldDerivation.ts`, `src/data/bands/classic.ts`, its test, plus repairs.

  **Estimated scope:** S–M

- [x] **Task 7: spawnSystem.ts — `generateAudioAttributes`: glide, register, phase and pulse width even, detune centred**

  **Description:** Switch the glider roll, portamento time, register, phase and pulse width to even, and the robot
  detune to centred. In `classic.ts`, `robot.portamento.lit` 0.23 → **0.125**. The comments on the glider share and the
  articulation block (spawnSystem.ts "ROBOT ARTICULATION") are rewritten: the edge is the share.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: every register in `OCTAVE_REGISTERS` seeds its even share ± 3
  points. The glide time fills its band. The detune's median is 0, it reaches ±4 or more in 1–5 % of robots, and every
  whole cent from −5 to 5 occurs. Guard: 12.5 ± 2 % of robots glide. Fallback: `generateAudioAttributes` over a
  constant-zero map still returns in-band values.

  **Acceptance criteria:**
  - [x] The six draws switch as described.
  - [x] The glider share stays as heard.
  - [x] The fallback robot is in band.

  **Verification:** As Task 4.

  **Dependencies:** Task 6 (the classic.ts edits run in sequence).

  **Files:** `src/systems/spawnSystem.ts`, `src/data/bands/classic.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S–M

- [x] **Task 8: spawnSystem.ts — the robot LFO links draw even, the detune depths centred, the on-shares as fitted**

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

  **Amended while building (Crawford, 2026-11-01):** the depth is stored as a whole percent, and rounding the fold
  gives the 1 % floor half a bucket, so the fold is floored onto the grid instead (spec §1.2, "Amended at T8"). The
  detune proof became: 1 % is the commonest depth (17–21 % of lit detune links), each percent rarer than the one
  below, the median is 3 %, at most 2.5 % sit at 10 %, and every whole percent from 1 to 10 occurs.

  **Acceptance criteria:**
  - [x] Every LFO-link draw is even, except the detune depths, which are centred and folded to the floor.
  - [x] The on-shares are as fitted.

  **Verification:** As Task 4.

  **Dependencies:** Task 7 (and Task 2, the centred draw).

  **Files:** `src/systems/spawnSystem.ts`, `src/data/bands/classic.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S

- [x] **Task 9: spawnSystem.ts — copy, performance, volume and the melody seed draw even, in both paths**

  **Description:** Switch the copy chance and copy source, dynamics, rests, accents, master volume and
  `robot.compositionSeed` (`generateCompositionSeed`) in both `generateRobotAudioBaseline` and `spawnRobot`. The copy
  edge stays 0.30 and now realises 30 % (decision 5).

  **Proof:** RED test: dynamics, rests and accents fill their bands (8–12 % per outer tenth; today dynamics is 0.6 %
  in total). The melody seed takes more than 4,700 distinct values over 4,800 robots (today about 730). A copied robot
  is 30 ± 3 % of robots after the first. Rests and the accent roll correlate under 0.1 with master volume. Fallback:
  `spawnRobot` with no noise map still spawns an in-band robot.

  **Acceptance criteria:**
  - [x] Every listed draw is even in both paths.
  - [x] The existing spawn-versus-replay parity tests pass unmodified.

  **Verification:** As Task 4, plus `npx vitest run src/systems/robotSendsParity.test.ts src/utils/sessionDiff.test.ts`
  green.

  **Dependencies:** Task 8.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, plus repairs.

  **Estimated scope:** M (two paths, parity to hold)

- [x] **Task 9a: robotFieldDerivation.ts — the Reverb and Delay sends draw even** (added 2026-11-02: Crawford put
  them in scope at Checkpoint A, spec §1.3)

  **Description:** In `deriveSendFields`, switch `robot.send.reverb`, `robot.send.delay` and their two `.quiet` rolls
  to `getUniformSeededVal`, dataIds and offsets unchanged. `generateRobotSends` (spawn and baseline) and the deal's
  Distance re-derivation all go through it. The Delay's `lit` stays 0.75 (a written "about a quarter" with no delay)
  and now realises 25 % quiet, up from about 17 % (spec §1.4). Rewrite `generateRobotSends`' "keep the bell draws"
  comment.

  **Proof:** RED test — `src/systems/robotFieldDerivation.test.ts`, over 1,000 worlds × 12 robots: the Delay is off
  for 25 ± 2 % of robots and the Reverb never (Classic's lit 1). Each depth reaches every 1 % step of its band, and its
  bottom and top fifths each hold 15–25 % of the robots carrying it (the sends sit on a 1 % grid, so a fifth is the
  even 20 % give or take a grid step: 19 / 21 % for the Reverb, 18.3 / 21.7 % for the Delay). The two depths, the Delay
  roll and the envelope's decay correlate under 0.1. Each send is `composeSends` of the four even draws at their own
  dataIds and offset.

  **Acceptance criteria:**
  - [x] The four Reverb and Delay draws are even; the three effect room sends are unchanged.
  - [x] A quarter of robots carry no delay.

  **Verification:** As Task 4, plus `robotSendsParity.test.ts` and `sessionDiff.test.ts` green.

  **Dependencies:** Task 9.

  **Files:** `src/systems/robotFieldDerivation.ts`, `src/systems/spawnSystem.ts` (comment), its test, plus repairs.

  **Estimated scope:** S

### Checkpoint A: The robots
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (13,311 tests, 351 files, at `1f4a328d`; 13,315 after T9a).
- [x] The harness's robot section (re-run on the branch, not committed): zero robot key pairs above 0.3, every robot
  key above 30,000 distinct values over 36,000 draws, and every §1.4 robot edge at its share. Figures in the record,
  "Checkpoint A: the live robot draws".
- [ ] Reviewed with Crawford before Phase 3. A quick listen to one world is optional here; the real listen is
  Checkpoint D.

---

### Phase 3: The global half (style map)

- [x] **Task 10: globalAudioSeed.ts — `sampleField` always even, the EQ centred**

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
  - [x] Every global loading key is drawn even, and the EQ bands are centred.
  - [x] The pedal values are unchanged.

  **Verification:** As Task 4 (expected repairs: the "field with no declared step, byte for byte" case).

  **Dependencies:** Task 3.

  **Files:** `src/utils/globalAudioSeed.ts`, `src/utils/globalAudioSeed.test.ts`, plus repairs.

  **Estimated scope:** S–M

- [x] **Task 11: globalAudioSeed.ts — the colour character and the Delay Sync draw even**

  **Description:** Switch `globalAudio.colour.character`, `globalAudio.delay.syncMode` and `globalAudio.delay.syncNote`
  to even. `COLOUR_CHARACTER_BANDS` becomes **[0.25, 0.5, 0.75, 1]**, and its fitting comment is rewritten.
  `DELAY_SYNC_ODDS` stays 0.66.

  **Proof:** RED test: over 3,000 styles the Delay Sync note draw takes more than 2,500 distinct values (today 192).
  Guards: each colour character is 25 ± 3 % of worlds with no world lighting two nodes, and Delay Sync is 66 ± 3 %.
  Mutation: put the fitted bands back with the even draw, and the guard fails (clean about 31 %).

  **Acceptance criteria:**
  - [x] Three draws are even.
  - [x] The colour edges are nominal, and both shares are as targeted.

  **Verification:** As Task 4 (expected repairs: the colour hold-out share case in globalAudioSeed.test.ts, and
  `worldDiffCodec.test.ts`'s Free Delay over a seeded Sync).

  **Dependencies:** Task 10.

  **Files:** `src/utils/globalAudioSeed.ts`, its test, `src/utils/worldDiffCodec.test.ts` (repair)

  **Estimated scope:** S

- [x] **Task 12: bpmSeed.ts — the tempo draws even**

  **Description:** `generateAttenuationStyleBpm` switches to `getUniformSeededVal` within the theme's `bpm` band.

  **Proof:** RED test — `src/utils/bpmSeed.test.ts`: over 3,000 styles under Classic, every whole tempo from 41 to 99
  occurs, and each outer tenth of 40–100 holds 8–12 % of worlds. The existing distinct-values test is updated to the
  new count.

  **Acceptance criteria:**
  - [x] The tempo is even within the band.
  - [x] Every theme's band is still respected.

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

The harness is not in the tree: it was moved out before T1's commit, because `npm run lint` fails on its `node:fs`
import and a full `npm test` writes `zz-spread.json` and `zz-time.json` to the repo root. T18 puts it back as
`src/utils/zzSpread.test.ts` (the T0 version, with the timing case, is kept outside the repo) and deletes it again
before its commit.

### T1–T3: deviations

- T1, T2: none.
- T3: the helper is imported inside the `vi.mock` factory (`await import('@/testUtils/seededDraws')`), not at the top
  of the test file, because `vi.mock` is hoisted above the imports. The module's header gives the factory to copy.
- T3: `noiseMapForDataIds` keys its x by `alea(dataId)()` itself instead of importing `precomputeDataX`, so the helper
  never imports the module it mocks. The test checks that `getSeededVal` still finds a named dataId through it.

### Phase 2: deviations

- T4: the new test is `src/systems/robotFieldDerivation.test.ts` (it did not exist): 400 worlds × 12 robots of
  `deriveEnvelopeFields` under `CLASSIC`, no mocks. Its curve case ("every non-linear curve is drawn by at least 15 % of
  shaped robots") draws 2,000 worlds × 12 instead. In the 4,800-robot sample, about 730 robots shape each stage, so one
  curve's share varies by about 1.4 points around its even 16.7 %, and cosine came out at 14.9 %. The threshold stayed;
  the sample grew to about 3,700 shaped robots (0.6 points). A fifth case pins each stage and curve roll to the even
  draw at its own dataId and offset.
- T4: the repairs were the seven failures the switch broke, all in `spawnSystem.test.ts`. The file's `getSeededVal` mock
  adopted `steerSeededDraws`. The noise ±1 cases now use `constantNoiseMap`. The curve clamp and the two envelope-body
  cases dropped their `getSeededVal` mock juggling for `noiseMapForDataIds` stubs. The two Classic parity pins
  (`PARITY_ROSTER`, `PARITY_TIERS`) were re-captured from the generator; only their `adsr` lines moved. Tier robot 3
  lost its shaped attack, but robot 4 now shapes its release, so the three still cover a shaped stage, the bandpass
  accent and an exclusive send. `resolveBands.test.ts`'s Classic literal took the two new `lit` values.
- Mutation check (T4): each of the six envelope draws put back on `getSeededVal`, the `.which` row moved, and each old
  `lit` (0.21, 0.275) restored — 9 of 9 killed.
- T5: the density-vs-glider-roll case reads the glider roll as the plain draw `generateAudioAttributes` still makes
  (it moves at T7). Before the switch, the two were r = 0.998. Repairs: the deal pass's Mechanical case computes its
  expected density and pitch repeat with the even draw, and the parity pins took the new melody values (the three
  spawned robots' densities went 50 / 50 / 77 → 82 / 82 / 98). The copied-baseline deal case had searched its world for
  two indices that draw apart; under the even draw both drew 57. It now steers the density draw by index (index / 12
  of the band) through the file's `getUniformSeededVal` spy and restores the steering wrapper with `mockReset()`.
- Mutation check (T5): each of the four draws put back on `getSeededVal`, and the Motif Length dataId renamed — 5 of
  5 killed.
- T6: the voice cases draw 1,000 worlds × 12 robots, not 400 × 12. Only about a fifth of robots carry the accent filter,
  and at 4,800 robots the accent cutoff's ±2-point tenths and the bandpass ±3 points were under 2 standard deviations
  of their shares. At 12,000, every tolerance is at least 3.
- T6: the plan's "more than 1,000 distinct values" for the layer detune cannot hold: the field is rounded to a whole
  cent over ±2, so it takes five values. The case asserts the rest (median 0; −2 and +2 each 1–3.5 % of layers; every
  whole cent from −2 to 2 occurs), and the pin case proves the centred draw underneath: each layer's detune is the
  rounded `getCentredSeededVal` at its dataId and offset.
- T6: the bandpass guard did **not** pass before the switch. 46.8 % of accent robots were bandpass, not T0's 36.7 %:
  T0's figure is the share of all type rolls under 0.4, while among accent robots the welded draw dragged the type roll
  low with the accent roll. On the even draw the written 0.4 is the share. The accent and layer-quiet guards passed
  both ways.
- T6 repairs, all in `spawnSystem.test.ts`. A new `forceSeededDraws` / `restoreSeededDraws` pair forces a dataId
  whichever draw makes it, plain or even. The glider + accent fixture, the Hollow bus-filter case and the
  top-of-weight clamp moved onto it, so they survive T7 and T9 unchanged. The waveform parity case now computes
  `Math.floor` of the even draw. The parity pins were re-captured. Under the 0.2 accent edge, tier robots 3 and 28 were
  no longer accent robots, so the tiers were re-picked from the same 29-robot roster: 4 (bounce release, shimmer), 11
  (ripple attack, lowpass accent, grit) and 16 (bandpass accent, double). `resolveBands.test.ts` took `lit: 0.2`.
- Mutation check (T6): the seven voice draws and the waveform pick put back on `getSeededVal`; the layer detune made
  even, and plain; `ACCENT_BANDPASS_SHARE` 0.4 → 0.45; the old accent `lit` 0.27 restored — 12 of 12 killed. The
  detune-plain mutant dies only on the pin case: a plain draw is also roughly centred.
- T7: the distribution cases live in a new mock-free `src/systems/spawnSystem.evenDraws.test.ts`, not in
  `spawnSystem.test.ts`, whose draw spies and forced draws could leak into a distribution. It draws 2,000 worlds × 12
  robots (about 3,000 gliders); building the sample takes about 9 s.
- T7: the detune criterion "reaches ±4 or more in 1–5 % of robots" is read per side. The detune is `Math.round` of the
  centred draw over ±5, so +4 starts at a raw 3.5: 4.5 % of robots per side, 9 % both sides together (the plan's range
  fits the raw outer tenth, 2 % per side, not the rounded value). The 24,000-robot sample puts 5 % more than 3
  standard deviations above 4.5 %.
- T7 repairs: only the three parity pins (the `forceSeededDraws` fixtures held). Robot 2's master volume moved too
  (0.74 → 0.79): it carries a register bias, and T7 moved its register. The spawned robots' glides went 0 / 0 / 0 →
  0.18 / 0.18 / 0.14. `resolveBands.test.ts` took `lit: 0.125`.
- Mutation check (T7): the five even draws put back on `getSeededVal`; the detune made even, and plain; the old glider
  `lit` 0.23 restored — 8 of 8 killed.
- T8 decision (Crawford, 2026-11-01): the detune depth is floored onto the whole-percent grid, not rounded (spec
  §1.2, "Amended at T8"). Measured beforehand over 2 million folded draws: rounded, 1 % held 10.8 % and 2 % was the
  commonest at 19.8 %; floored, 1 % holds about 19 %. The fold lives in `detuneLinkDepth`, wrapped in the existing
  whole-percent quantize so a theme with a fractional floor would still land on the grid.
- T8: the cases draw 5,000 worlds × 12 robots, because only 13.5 % carry a lit bus link: its depth tenths (about 9 %
  each on the grid) then sit at least 3 standard deviations inside 8–12 %. The envelope correlations use the first
  12,000 robots, built at describe scope. Built inside the test, they outran the 5 s timeout under the full parallel
  run. The file's sample now takes about 17 s to build.
- T8: the share guard did **not** pass before the switch for every target (`layer0.gain` was lit for 22.4 %), in line
  with T0's 19.2–26.7 %. It passes after.
- T8 repairs: only the two roster parity pins; the tier robots kept their tiers. `resolveBands.test.ts` took the three
  new `lit` values.
- Mutation check (T8): the quiet roll, the lane and the gain/bus depth put back on `getSeededVal`; the detune depth
  rounded instead of floored, drawn even instead of centred, and not folded at all; each old `lit` (0.3, 0.3, 0.2)
  restored — 9 of 9 killed.
- T9: the cases live in `src/systems/spawnSystem.evenCopies.test.ts`. With T7–T9 in one file the samples took 28 s
  to build, so T9 split it into one file per task, run in parallel: `spawnSystem.evenDraws.test.ts` (T7),
  `spawnSystem.evenLinks.test.ts` (T8), `spawnSystem.evenCopies.test.ts` (T9). The shared `outerTenths` and
  `correlation` moved to `src/testUtils/spread.ts`, which `robotFieldDerivation.test.ts` uses too.
- T9: the band cases read the fresh (non-copy) robots of 1,000 rosters, about 8,700, so each performance field's outer
  tenth (9–11 % on its integer grid) sits at least 3 standard deviations inside 8–12 %. The melody seed and master
  volume exist only on the spawn path, so 400 locales × 12 go through `spawnRobot`, with the engine's voice and melody
  registration stubbed (jsdom has no audio graph); no draw is stubbed.
- T9 repairs, all in `spawnSystem.test.ts`. Every site that forced the copy roll through a `getSeededVal` mock (nine
  of them) moved onto `forceSeededDraws`, including the ones that still passed. A forcing the switch had turned into a
  no-op would otherwise have left them passing on whatever the natural roll gave. `ForcedDraw` now also takes the
  offset (the copied-baseline deal case steers its density by index). The pan case and the two performance call
  counts read the even draw's spy. The parity pins were re-captured. No robot of the 29-robot tiers roster was a
  bandpass accent any more, so the roster grew to 51, which leaves robots 0–28 unchanged (a roster's earlier robots
  never depend on its length), and the tiers are now 4, 11 and 50. `robotSendsParity.test.ts` and
  `sessionDiff.test.ts` pass unmodified.
- Mutation check (T9): each of the twelve switched draws put back on `getSeededVal`, in each path separately; the
  copy edge moved to 0.25 — 13 of 13 killed, after one fix. The master volume mutant first **survived**: the
  correlation case passes on the plain draw too. The spawn-path pin case now also pins master volume (the even draw
  plus the register bias, clamped, on the 1 % grid) over three locales. The T7 and T8 cases were spot-checked in their
  new files: a T7 and a T8 mutant each still killed.
- T9a (added at Checkpoint A; Crawford: "yes on the sends", 2026-11-02): spec §1.3 and §1.4 name the sends now. The
  Delay's written quarter stays, so robots with no delay go from about 17 % to 25 % (spec §1.5). The band case measures
  fifths, not tenths: on the sends' 1 % grid an even Delay draw puts 8.3 / 11.7 % in its tenths, too near 8–12 % to
  hold, and 18.3 / 21.7 % in its fifths. The bell draw failed all four cases before the switch: 17.3 % without a delay,
  the Reverb's 10 % floor never reached, and the Reverb depth welded to the Delay roll (r = 0.63).
- T9a: two fixtures pinned the old send values and said never to re-record them: `robotSendsParity.test.ts`
  (roadmap 55's oracle) and `spawnSystem.test.ts`' "seeds, value for value, the Reverb and Delay sends the branch base
  seeds" (Robot Effect Sends T1). Crawford chose to re-record them once. The oracle was captured by a temporary copy
  whose final assertions printed instead of compared, every precondition kept: `SEEDED_SENDS` and the spawn,
  re-register, session-restore, share-restore and swell primes changed, and the hand-set `RE_RESERVE_PRIMES` came out
  unchanged, as it must. Both headers now name this as the one re-recording.
- T9a repairs, all in `spawnSystem.test.ts`: the send cases that forced or counted `getSeededVal` moved to
  `forceSeededDraws` and the even draw's spy, the ±1 cases to `constantNoiseMap`, and the two Classic parity pins were
  re-captured (the tiers stayed 4, 11 and 50). The effect-sends block's `afterEach` had put the raw even draw back,
  dropping the steering wrapper for every later test in the file; it now restores through `restoreSeededDraws`.
- Mutation check (T9a): each of the four draws put back on `getSeededVal`, and the Delay `lit` 0.75 → 0.8 — 5 of 5
  killed, after one fix. The Reverb quiet roll first **survived**. It is equivalent under Classic, whose Reverb `lit`
  of 1 never rolls quiet, so the pin case now also derives the sends under a Reverb row lit at 0.5.
- For Crawford, not changed: the top-level `pulseWidth` that `generateAudioAttributes` seeds (`robot.audio.pulseWidth`)
  looks unread. `AudioAttributes` no longer types it (Robot.ts calls it deprecated), and `reserveVoice` takes
  `layers[0]?.pulseWidth`. T7 switched it as the plan says.
- Answered at Checkpoint A (now T9a): `deriveSendFields`' reverb and delay draws (`robot.send.reverb`, `.delay` and their
  `.quiet` rolls) were plain `getSeededVal` and not in spec §1.3; Crawford put them in scope, built as T9a.

### Checkpoint A: the live robot draws (`1f4a328d`, 2026-11-02)

The T0 harness samples the draw functions at each dataId, so after Phase 2 its even column would only repeat T0's.
Checkpoint A ran a different temporary harness instead (deleted; not committed). It wraps `getSeededVal`,
`getUniformSeededVal` and `getCentredSeededVal`, records each draw the live code makes per robot (which function, and
the value as a fraction of its band), and runs `generateRobotAudioBaseline(noise, i, [])` over 3,000 worlds × 12
(locale maps from random coordinates, as T0's). Master volume and the melody seed are drawn only by `spawnRobot`, so
1,000 locales × 12 spawns recorded those.

| | Live, at `1f4a328d` |
|---|---|
| Draw the code makes | even for every robot audio key; centred for `robot.audio.detune`, `robot.audio.layer.detune` and the three `robot.lfo.layerN.detune.depth`; no robot audio key on the plain draw. The sends (`robot.send.*`) are out of this plan and still plain |
| Distinct values, keys drawn for every robot (36,000 draws) | 35,972–36,000 |
| Distinct values, conditional keys (`filterQ`, `filter.type`, `.which`, `portamento`, LFO lane and depth) | all but at most 4 of their 4,620–9,089 draws |
| Outer share (bottom + top tenth) | 18.9–21.6 % on the even keys; 3.6–4.1 % on the centred ones (a triangle gives 4 %) |
| Key pairs with \|r\| > 0.3 / > 0.1, of 1,363 | 0 / 0 (largest 0.078, over 1,245 robots) |

| Edge | Value | Realises |
|---|---|---|
| `robot.copyChance` | 0.3 | 30.31 % |
| `robot.audio.portamento.glider` | 0.125 | 12.83 % |
| `robot.audio.attackCurve.shaped` / `releaseCurve.shaped` | 0.155 / 0.15 | 15.26 / 15.18 % |
| `robot.audio.filter.accent` | 0.2 | 19.64 % |
| `robot.audio.filter.type` (of accent robots) | 0.4 | 40.71 % |
| `robot.rhythmicMotifLength.active` / `robot.noteVariance.active` | 0.15 | 14.89 / 14.86 % |
| robot LFO layer targets, quiet | 0.75 | 74.75–75.31 % (lit 24.7–25.3 %) |
| robot LFO bus, quiet | 0.865 | 86.58 % (lit 13.4 %) |

### Phase 3: deviations

- Started 2026-11-02 at Crawford's word ("implement each task in phase 3"); Checkpoint A's review line is taken as
  passed by that.
- The seed oracle (`globalAudioSeed.test.ts`, "seed oracle (pre-Sync output, do not regenerate)") pins every value
  both seeders give two fixed styles, and its header said never to re-record it. Crawford chose to re-record it once,
  for Phase 3 (2026-11-02): each task copies the values its switch moved from the seeder's output, in its own commit,
  and the header names Phase 3 as the one re-recording.
- T10: the distribution cases live in a new mock-free `src/utils/globalAudioSeed.evenDraws.test.ts`, as T7's did, not
  in `globalAudioSeed.test.ts`, whose draw spies and forced Sync picks could leak into a distribution. 3,000 styles take
  about 1 s to build.
- T10: "more than 2,500 distinct values" holds only for the seven keys with no step, and every one of those is a log
  field, so their outer tenths are tenths of the draw (the value's position on the log scale), not of the value. The
  linear keys are all stepped, on grids of 3 to 41 values (the limiter's −3 dB alone is a quarter of its band), so a
  value-tenth cannot hold 10 %. Each stepped key's grid values are held to their even share instead (the width of the
  band that rounds to the value, over the band), within 4 standard deviations because about 150 values are tested at
  once. The delay time, on a 451-value 1 ms grid, takes the tenths as written. A pin case proves the draw underneath:
  each moved key is the even draw (the EQ the centred draw) at its own dataId, through its band and onto its grid, and
  a lit colour node's Mix likewise. The pedal guard pins the pedals' value keys to the even draw, which they already
  were, so it passed before the switch and after.
- T10: before the switch, the EQ low and mid correlated at r = 1.000 and `compressor.attack` took 192 distinct values
  over 3,000 styles.
- T10 repairs, all in `globalAudioSeed.test.ts`: the file's mock spies on `getCentredSeededVal` too, and two draw-set
  cases ("no longer draws the wet fields…", "reads exactly the new colour and pedal seed keys…") read every draw
  through `drawnDataIds()` (plain, even and centred), the second setting the pedals' keys aside by prefix. The
  no-declared-step case now expects the unquantized even draw through the LPF band (and its new value, 3368.34…). The
  oracle's two global-settings expectations took the moved values; their pedal blocks came out identical.
- Mutation check (T10): every field back on `getSeededVal`; the EQ drawn even; `eq3.high` alone even; every field
  centred; every non-pedal field plain; the limiter alone plain; the AutoWah's fields plain — 7 of 7 killed.
- T10 full suite: 13,322 passed; the one failure was `sceneToOrbiterLocal`'s round-trip timing out at 5 s under the
  parallel run (known slow; 10 of 10 pass alone).
- T11: the Delay Sync note's draw is not visible in the output (the note takes a handful of values per tempo), so its
  "more than 2,500 distinct values" is proven by a pin instead: over 300 styles the Delay seeds Sync exactly when the
  even mode draw is under 0.66, on the note `pickSeedNoteValue` picks from the even note draw at the style's tempo. The
  colour character is pinned the same way (400 styles). Both share guards passed before the switch and after.
- T11 repairs, all in `globalAudioSeed.test.ts`: "queries globalAudio.delay.syncMode and .syncNote" reads every draw;
  "when no band has a note…" had relied on `delay-sync-sample-1` happening to roll Sync, which it no longer does, so it
  now seeds the Sync explicitly (the mode draw forced to 0) and restores the draw after. The oracle took the moved
  character (alpha crush → fold, theta fold → clean) and Delay Sync (alpha now Sync on 1/8; theta's note 1/16 →
  dotted 1/16). `worldDiffCodec.test.ts`'s Free Delay case needed no repair: its style still seeds Sync.
- Mutation check (T11): each of the three draws put back on `getSeededVal`; the fitted colour edges restored;
  `DELAY_SYNC_ODDS` 0.66 → 0.7 — 5 of 5 killed. Full suite: 13,327 passed.
- T12: the outer-tenth case did **not** fail before the switch. A whole tempo rounds the draw, so the bottom tenth of
  40–100 (40–45) holds the draws from 40 to 45.5, 9.17 % of an even draw, and the top tenth (94–100) 10.83 %; the case
  holds each to that share within 3 standard deviations, and the bell draw (about 7 % per tenth, T0's 14.5 % outer)
  landed inside. The RED came from the other two cases: 41 BPM never occurred over 3,000 styles on the plain draw, and
  the pin (the tempo is the rounded even draw at `globalAudio.bpm` over the band, 300 styles). The existing "at least
  10 distinct tempos over 30 styles" case was kept as it was: it still holds and still guards a degenerate key.
- T12 repairs: the tempo-draw count case in `globalAudioSeed.test.ts` reads every draw. The oracle's tempos moved
  (alpha 74 → 78, theta 58 → 85), so four Sync notes snapped to them moved: alpha's Phaser (dotted 1/8 → 1/4), theta's
  Tremolo and Delay (→ triplet 1/4) and theta's bank lane c (triplet 1/8 → 1/8). No other value moved.
- Mutation check (T12): the plain draw restored; `Math.floor` for `Math.round`; a fixed 40–100 band for the theme's;
  the dataId renamed to the bare `bpm` — 4 of 4 killed. Full suite: 13,330 passed.
