# Test Removal Candidates

An audit of the Vitest suite, taken 2026-11-07 on `perf/desktop-full-tier-standing-cost` (HEAD 2f1ebe9d).
It lists tests that look removable and says why, grouped by how confident the case is. It is a
proposal, not a plan: nothing here has been removed. Each group names the files, the count, and
the rule it falls under so a removal can be picked file by file.

Not one of CLAUDE.md's Reference docs. When a group is acted on, tick it here or delete the group.

Counts, line anchors and timings were re-checked on 2026-11-07 against `tests/pruning` (HEAD 17a462fd,
after PR #607 merged) with a second full run on an otherwise idle checkout. The tables below are from
that re-run; where the original run differed in a way that matters (the one failure), the text says so.
A third full run the same day, paired with every slow file run alone, feeds section 5 and showed
that a file's time inside a full run is three to six times its time alone. Every per-file and
per-test duration in this doc is a full-run figure unless it says "alone": it ranks, and it
overstates the test's own cost by that factor.

## The suite at a glance

| Measure | Value |
| --- | --- |
| Test files | 354 (347 under `src/`, 7 under `scripts/perf/`) |
| Lines of test code | 140,411 |
| `it()` / `it.each()` / `test()` openers in source | 10,711 |
| Test cases run (after `it.each` expansion) | 13,607 |
| Result of the re-run | 13,607 passed, 0 failed (the original run and the third run each had the 1.12 timeout) |
| Sum of per-file run time | 1,142 s, about 19 minutes of worker time (1,260 s in the third run) |
| Largest file | `src/engine/AudioEngine.test.ts`, 6,600 lines, 395 `it()`s, 130 s in a full run, 38.6 s alone |

For scale: the production source under `src/` is tested at roughly 2.5 lines of test per line of
code in the heavy areas, and five files alone (`AudioEngine`, `globalFx`, `spawnSystem`,
`sessionDiff`, `OffScreen`) hold 23,500 lines.

The original run was taken while another session worked in the same checkout; the re-run was not,
and its per-file times came out within 15 % of the first. Relative order between files is reliable;
absolute numbers are not the tests' cost (see the alone column in section 5).

## How the candidates were found

Every test file was scanned for title and body patterns, then the flagged ones were read.
The patterns, and the rules in CLAUDE.md they answer to:

- **A constant equal to itself.** `expect(DAY_DURATION_MS).toBe(6 * 60 * 1000)`. It fails only when
  someone edits the constant, which is the change they meant to make.
- **A compile-time check run at runtime.** Titles saying "compile-time check via build:types" or
  "type-checks". `tsc --noEmit` already enforces these on every `npm run build:types`.
- **A history guard.** "no longer has", "never carries", "was removed", "does not modify". It asserts
  the absence of something deleted in a merged phase. Once the branch is merged the test has done
  its work; afterwards it only pins the past.
- **A compatibility pin.** "as before", "unchanged", "no existing behaviour changes", "today sound".
  The pre-v1 rule says no keep-existing-sound constraints get written into docs; the same applies
  to tests.
- **A configuration that cannot ship.** Tests that mock an `as const` switch table to a value it
  never has in production.
- **A test of the test.** "mutation check", "sanity check", "the mock really turns every piece off",
  and files that test test helpers.
- **A migration oracle.** A recorded output from a commit before a refactor, kept to prove parity.
  Parity is proved when the PR merges.
- **Duplicate coverage.** The same behaviour tested at two or more layers, or the same `it()` title
  in many files.
- **Flaky under load.** The one failure of the original run; it passed the re-run at 5.2 s, right at
  the timeout, and failed the third run. The house rule is to remove flaky tests, not chase them.

Counts below are from `grep` over `it(`, `it.each(` and `test(` openers unless a line says it was
counted by hand. An `it.each` counts once, however many cases it expands to.

## 1. Whole files to remove (high confidence)

Thirty files, 4,087 lines and 314 `it()` openers (the per-group figures below, summed). Each is a
clean cut: the file has no behaviour left to protect, or protects something the type checker,
ESLint or a merged PR already settled. The exceptions are named where they fall: two `describe`
blocks in `types/globalAudio.test.ts` (1.1) and the six `computeLocaleHour` tests in
`constants/time.test.ts` (1.2) are the only unit tests of production functions and stay; one case
each in `Robot.integration.test.tsx` (1.6) and `robotSendsParity.test.ts` (1.8) is the only test
of a behaviour and moves before its file goes.

### 1.1 `src/types/*.test.ts` — nine files, 1,255 lines, 134 `it()`s

Every test here but one block is one of: a compile-time check ("an ADSREnvelope with only a, d, s, r
still type-checks"), a literal array compared with a literal copy ("is exactly a, b, c, d in order",
"has exactly 7 members"), or a history guard ("no longer lists the global delay or reverb wet",
"never carries the removed volume or pulseWidth targets", "rejects a lfoSettings field at the
type level"). Eight of the nine files exercise no function. The ninth, `globalAudio.test.ts`, does:
18 of its 49 cases call `isSyncedRateKey` (line 25) or `withGlobalAudioDefaults` (the `describe`
from line 263 to the end). Those are the only unit tests of either function anywhere in the suite
(`sessionDiff.test.ts` names `withGlobalAudioDefaults` once, in a comment), and both are live in
production: `withGlobalAudioDefaults` fills a loaded save at `sessionDiff.ts:523` and a decoded
link at `worldDiffCodec.ts:316`, and `isSyncedRateKey` picks the synced-rate row in
`AudioRigDrawer.tsx:259`. Move those two blocks beside the function (a `utils` or
`types/globalAudio.defaults.test.ts` home) before the file goes.

| File | Lines | Note |
| --- | --- | --- |
| `types/globalAudio.test.ts` | 418 | 31 cases compare defaults with literal copies ("remains JSON-serializable" is a one-line `JSON.stringify` that cannot fail on a plain object literal); the other 18 test `isSyncedRateKey` and `withGlobalAudioDefaults` and stay, relocated |
| `types/lfo.test.ts` | 164 | 9 history guards; "matches ROBOT_DATA_GRID.md's options exactly" is a doc-parity pin |
| `types/audioSwell.test.ts` | 159 | 8 history guards |
| `types/controls.test.ts` | 140 | "has exactly 13 entries" plus type checks |
| `types/performance.test.ts` | 125 | Constants and type checks |
| `types/articulation.test.ts` | 110 | Constants and type checks |
| `types/Company.test.ts` | 90 | Type checks and three "rejects ... at the type level" guards |
| `types/traits.test.ts` | 28 | "has exactly 8 entries" |
| `types/Robot.test.ts` | 21 | "is exactly Docked / Undocking / Active / Recalled" |

Besides the two `globalAudio` function blocks above, the one thing worth keeping is the cross-module
invariant "does not overlap with ROBOT_LFO_TARGET_IDS" (`lfo.test.ts` line 104), which could move
beside `engine/lfoEngine.test.ts`.

### 1.2 `src/constants/*.test.ts` — four files, 221 lines, 28 `it()`s

- `constants/time.test.ts`: "DAY_DURATION_MS is a flat 6 minutes", "takes exactly one parameter"
  and the "has no measure-count day constant" absence guard go. The `computeLocaleHour` wrap-around
  tests (six of them) are real and are the function's only direct tests
  (`utils/localeHelpers.test.ts` never calls it; `localeStore.test.ts` and
  `worldTransition.test.ts` reach it indirectly). `computeLocaleHour` lives in `constants/time.ts`,
  so the simplest move is none: keep the file at those six tests rather than relocate them.
- `constants/accentColors.test.ts`: its headline test, "matches docs/reference/accent-colors.css
  byte-for-byte", compares `ACCENT_COLORS` with a hand-transcribed copy of the CSS file. That is a
  file-text test with the file inlined. The rest are "has exactly 21 keys", "includes emerald and
  indigo", "excludes black".
- `constants/deckCamera.test.ts`: "holds a followed robot for 20 s" is `expect(FOLLOW_MS).toBe(20000)`.
- `constants/sends.test.ts`: three constant-equals-itself checks.

### 1.3 The `bevel0` family — four files, 450 lines, 26 `it()`s, plus 24 `it()`s inside other files

`WORLD_GEM` in `src/components/actors/material/worldGemMaterial.ts` is an `as const` object with
every switch `true`. These four files `vi.mock` it to all-`false` and assert that nothing gem-like
renders (13, 4, 6 and 3 openers, in the order listed below). That configuration cannot occur in a
build; the only way to reach it is the mock. One test in each file is literally titled "the mock
really turns every piece off".

- `components/actors/Factory.bevel0.test.tsx`
- `components/actors/scenery/Scenery.bevel0.test.tsx`
- `components/actors/scenery/pipeBridges.bevel0.test.tsx`
- `components/panels/screen/worldView/TerrainLayer.bevel0.test.tsx`

The same pattern lives inside the ring and hairline tests, reached not by `vi.mock` but by
`withSwitch` in `material/ringTestHelpers.ts`, which writes a `false` into the `as const` object and
restores it after. Its forms: "with the switch off there is no ring" (nine copies: containers, crane,
dome, scaffold, tank, vent, wall, wreck and `TerrainLayer.ring`), "without its ring(s) the markup is
exactly the switched-off X" (six copies: containers, crane, dome, scaffold, vent, wreck), the
hairline switch-off cases in `membersHairline.test.tsx` and `othersHairline.test.tsx` ("with the
members/others switch off nothing carries the 1.5 px hairline" as an `it.each` in each file, plus
"is a rect even with the members switch off", "with the members switch off the dome has no arc
path" and "with the others switch off the pipe bridges draw no stroke either"; five), and the
"another switch does not touch it" cases ("the other switches do not remove it" in
`TerrainLayer.ring`, "the others switch does not touch these members" and "the mass switch does not
remove the hairlines, nor the members switch the rings" in `membersHairline`, "the members switch
does not touch it" in `othersHairline`; four). Twenty-four `it()`s in all. The two tests under
`greebles/rooftopRings.test.tsx`'s "without ctx.light every renderer is exactly as before" look
similar but touch no switch: they pass a context without a light, which the renderer does accept
(`light?` on `GreebleRendererContext`), so they belong with group 4, not here. If the switches are
kept as developer toggles, one test that a switch works is enough; if they are never flipped, the
switches themselves are cruft and the tests go with them.

### 1.4 `src/systems/lifecycleSim.ts` and its test — 712 test lines, 48 `it()`s, 24 s

`lifecycleSim.ts` holds three measurement harnesses from Phase 43: the drain sim from Task 2
("measure the drain before flattening it", `runDrainSim`), and the loop and readiness sims from
Task 15 (`runLoopSim`, `runReadinessSim`, the `COOLDOWN_CANDIDATES` table). Nothing in production
imports it; the two mentions in `src/constants/index.ts` and `src/systems/robotSystems.ts` are
comments. Five test files do import its `SIM_SEED_COORDS` grid, though: `jobCoverage.test.ts`,
`midgroundSilhouettes.test.tsx`, `stations.test.ts`, `workSites.test.ts` and
`Scenery.bevel0.test.tsx` (itself in 1.3). Its own test contains the single slowest case in the
suite: "over the full grid at 20, 110 and 200 BPM for 10 minutes" at 17.4 s. That case does assert
something (every row has zero robots charging while visible); the report print is behind the
`LIFECYCLE_SIM_REPORT` env var. The decisions the harnesses informed (flat drain of 6, the cooldown
rule) shipped in roadmap 48 and Phase 43 and are recorded in `docs/ROBOT_LIFECYCLE.md`.

Removing the module is a code change, so it is Crawford's call, and it needs `SIM_SEED_COORDS`
moved to a test-utils home first (the four live importers break otherwise). The test file alone
is a safe first step.

### 1.5 Tests of test helpers — three files, 266 lines, 32 `it()`s

- `components/actors/scenery/sceneryTestHelpers.test.ts` tests `assertNinetyFortyFive`, a helper
  used by 29 other test files.
- `components/actors/material/ringTestHelpers.test.tsx` tests `worldGemTraces` and `withSwitch`.
- `testUtils/seededDraws.test.ts` tests the noise-map stubs.

A helper that misbehaves fails the tests that use it. These files test the scaffolding, not the
building.

### 1.6 One-off proofs that outlived their task — five files, 432 lines

- `components/ui/controls/cabinetWallGeometry.verify.test.ts` (162 lines): "empirical verification
  against the real gsap library, not just algebra". It proves GSAP composes `scaleY` before
  `skewX`. That is a property of GSAP, settled once during design.
- `components/ui/controls/CabinetryCascade.test.tsx` (98 lines): "the end-to-end proof the whole
  plan exists for" (OBLIQUE_CABINETRY_MEMOIZATION, archived). The same cascade is asserted again
  in `AudioRigEffectPanel.test.tsx` ("re-render cascade regression ... the end-to-end test this
  whole plan exists for") and per control in group 3.3. One cascade test is worth keeping; three
  are not.
- `data/sliderOrientation.test.ts` (53 lines): "no slider schema is vertical any more". A history
  guard for POST_SYNC_TOGGLE_LAYOUT_UPDATE walking every schema to assert `'horizontal'`.
- `components/robot/Robot.noLabel.test.tsx` (61 lines, 2 `it()`s): "a selected robot in the world
  has no text label". A history guard.
- `components/robot/Robot.integration.test.tsx` (58 lines, 1 `it()`): fold into `Robot.test.tsx`,
  do not drop. Its one case ("registers orbiters-world-<id> on mount and kills it on unmount") is
  the only test that the robot's orbiter timeline leaves `timelineMap` on unmount; `Robot.test.tsx`
  mentions orbiters once, in a canvas-overflow title, and never asserts on the map. Killing
  timelines on unmount is a CLAUDE.md checklist item, so the assertion keeps a home.

### 1.7 Tests of third-party libraries — two files, 294 lines

- `engine/audioEngine/numericDuration.test.ts` (25 lines): "a number and its string agree" asserts
  Tone's `Time` parsing. Its header says it runs against the real Tone on purpose, so that a Tone
  upgrade that stopped reading a bare numeric string as seconds would fail here rather than
  silently shorten every rest and staccato. That is still a library test, but the reason is stated,
  so it is Crawford's call rather than a clean cut.
- `engine/audioEngine/chainCycleSearch.test.ts` (269 lines): imports `createDetectCycles` from
  `standardized-audio-context`'s build output and measures how many expansions it performs. It
  documents why the bypass-cell cuts exist, which is valuable, but the place for that is
  `docs/AUDIO_SYSTEM.md` (and the memory note already records it). A library's internal cost is
  not this repo's behaviour, and the import path into `build/es2019/factories/` breaks on any
  dependency bump.

### 1.8 Migration parity oracles — one file plus five `it()`s elsewhere

- `systems/robotSendsParity.test.ts` (373 lines, 11 `it()`s): "Robot sends parity (roadmap 55
  oracle, recorded at 608c5b92)". Roadmap 55 merged as PR #570. The oracle has been honoured, but
  it is not all oracle. Part (b) replays the send-priming order through six paths (spawn,
  `reRegisterAllRobotsAudio`, `AudioEngine.reReserveVoice`, `applySessionPayload`, a decoded share
  link, `tickAudioSwells`) against recorded call sequences. Five of the six have a behaviour test
  of their own elsewhere (`spawnSystem.test.ts` for spawn and re-register, `sessionDiff.test.ts`
  and `worldDiffCodec.test.ts` for the save and link paths, `audioSwells.test.ts` for the swell
  write). The sixth does not: nothing in `AudioEngine.test.ts` checks that a re-reserved voice is
  handed the robot's stored sends. Move that one case (line 261) into `AudioEngine.test.ts` beside
  the other `reReserveVoice` blocks, then the file is a clean delete.
- `utils/globalAudioSeed.test.ts` lines 2262 to about 2380, the `describe` "seed oracle (pre-Sync
  output, do not regenerate)": five tests, four pinning the full `generateGlobalAudioSettings` and
  `generateLfoBankSettings` outputs for `"oracle-alpha"` and `"oracle-theta"` as 40-line literal
  objects, plus one that the pin is stable across a fresh noise map. Every loading change since
  has had to re-record them (the inline "Global Modulation T7: ..." comments say so). They are a
  keep-existing-sound pin.
- `utils/colorUtils.test.ts` line 200: "reproduces the exact pre-refactor output of traitColors.ts's
  private hexToRgb + rgbToHsl (parity oracle)". The refactor merged.
- `components/actors/factoryVariants.test.ts` line 50: "pins one known-seed output as a regression
  snapshot". The determinism test above it ("identical inputs produce byte-identical output") is
  the real check; the pin just stores one answer.

### 1.9 Negative-space pins on removed UI — scattered, about 10 `it()`s

Examples: "never renders a Reset Melody button — removed entirely" (three copies in
`PingControlsDrawer.test.tsx`), "no longer exports a VOLUME_LFO_TARGET" (`robotOptionsConfig.test.ts`),
"Drift removed from every global-chain effect panel" (a whole `describe` in
`AudioRigEffectPanel.test.tsx`), "no setEffectEnabled/setGlobalBypassEnabled" (a `describe` in
`audioStore.test.ts`), "has no measure-count day constant" (`constants/time.test.ts`). A full list
is one grep away:

```
grep -rnE "^\s*(it|test)\(.*(no longer|was removed|never carries|removed entirely|does not modify)" src --include="*.test.*"
```

That grep returns 75 lines today. It matches `it()` titles only, so the two `describe`-level
examples above (`AudioRigEffectPanel.test.tsx` line 675, `audioStore.test.ts` line 503) are not in
it and need their own look. Not all 75 are pure history (some guard a real invariant in passing),
so this is a read-and-pick list rather than a block delete.

### 1.10 Compile-time checks run at runtime — 19 titled `it()`s, 4 of them outside `src/types/`

Titles containing "compile-time check", "type-checks", "at the type level", "is a compile error"
match 19 tests. Fifteen are in `src/types/` and go with 1.1. The other four are one each in
`components/robot/AudioSettingSection.test.tsx`, `data/bands/classic.test.ts`,
`data/robotSendLoadingRanges.test.ts` and `data/robotSends.test.ts`. Beyond the titles,
`@ts-expect-error` directives sit inside ordinary tests in `data/bands/resolveBands.test.ts` (27
lines), `AudioSettingSection.test.tsx` (16) and `utils/describeWorld.test.ts` (4). The directives
themselves are the test; a runtime `it()` wrapped around them adds a case to the count and nothing
to the proof. If the type-level checks are wanted, a `*.test-d.ts` file under `vitest --typecheck`
is the right home and costs no runtime.

### 1.11 `src/components/ui/controls/helpOnLabels.test.tsx` — 84 lines, 7 `it()`s

Cross-control checks ("Button never shows a ?", "a radio option never takes the ?") that mostly
repeat each control's own test file. Two of the seven have no other home: `Button.test.tsx` does
not check the "?" at all, and `TempoSyncToggle.test.tsx` has no help assertion of any kind. The
LfoLink case is already covered by `LfoLink.test.tsx` ("keeps two label rows, Lane then Depth, each
with its own help", line 201). Move the Button and TempoSyncToggle checks into those controls' own
files first, then remove.

### 1.12 The flaky one — `src/animation/jobMoves/sceneToOrbiterLocal.test.tsx`

"round-trips through the real transform chain within 0.01 u — 50 gems × 4 scale pairs × 4 corners"
failed the original run with a timeout at 6.3 s against Vitest's 5 s default (`vitest.config.ts`
sets none); it renders 800 real gems. It passed the re-run at 5.2 s, right on the line, which is the
definition the house rule uses for flaky, and timed out again in the third full run the same day
(the one that produced section 5's table). Either cut the sample to 5 gems or remove the test. The
other nine tests in the file are fast (under 80 ms) and fine.

A second one surfaced on 2026-11-07 while timing the eight group-2 files together:
`src/systems/audioSwells.test.ts` "interpolates and returns to exactly baseValue on completion,
removing the swell" (the `robot pool — ramp lifecycle and write path` block) failed once with
"expected true to be false" (a volume swell still in the pool after the falling phase), then passed
three runs in a row alone. It takes 21 ms, so it is not a timeout; by the house rule it is removed,
not chased.

## 2. Statistical tests the Even Seeded Draws series made redundant (medium confidence)

The Even Seeded Draws series (`docs/tasks/EVEN_SEEDED_DRAWS.md`; the switches are T4 to T17,
merged 2026-11-02) replaced the bell-curved seeded picks with even ones and left its own proofs in
five files: `systems/robotFieldDerivation.test.ts`, the three `systems/spawnSystem.even*.test.ts`
files and `utils/globalAudioSeed.evenDraws.test.ts`, plus the T16 block at the end of
`systems/audioSwells.test.ts`. Those are **not** the candidates. They are the only runtime check of
the spec's §6 criteria, the plan's mutation checks caught reverted draws through them, and they
are cheap where it shows: the five files sum to 7 to 13 s of test time across two runs on
2026-11-07, four fifths of it in `robotFieldDerivation.test.ts`, whose slowest case (3.4 s) is a
themes-58 T6 detune test rather than the series'. (Their 3,000-style and
400-world samples are built at module scope, so each file also costs 4 to 10 s of *collect* time
that no per-test figure records. The three `spawnSystem.even*` files were one file until T9 split
them to run in parallel, because the sample took 28 s to build in one worker; merging them back
undoes that, so the "merge after group 2" idea is withdrawn from 3.7.)

The candidates are the older statistical tests in the two parent files, written between August
and October 2026 (the melody shapes, Robot Articulation T5, Global Colour T5, Classic Band Retune,
Global Modulation T7) against the bell-curved draw. Each now has a stronger twin in the series'
files: a bigger sample, a tighter tolerance, or a distribution check where the old test counted.
The spawn path delegates to the derive functions (`spawnSystem.ts` lines 275, 287, 339 and 440),
so an old spawn-side test and its new derive-side twin exercise one implementation.

Timings are from a run of these eight files alone on an idle machine, 2026-11-07; line numbers
are from the same checkout.

### 2.1 `utils/globalAudioSeed.test.ts` — 9 `it()`s, about 10 s

| Remove (line, title) | Time | Twin in `globalAudioSeed.evenDraws.test.ts` |
| --- | --- | --- |
| 581 "lights at most one node in any world, over 3000 styles" | 3.7 s | 273 "guard: each colour character is 25 % of styles (+/-3 points), and no style lights two nodes" |
| 598 "realises the target shares over 3000 hold-out styles, within 3 points" | 3.1 s | 273, the same guard |
| 2055 "seeds Sync for ~66% of Attenuation Styles (±10 points)", 200 styles | small | 286 "guard: the Delay seeds Sync in 66 % of styles (+/-3 points)", 3,000 styles |
| 1509 "seeds a lit ... target for roughly 2-in-3 targets", 50 styles, 0.55 to 0.80 | small | 402 "each target is quiet in 34 % of styles (+/-3 points)" |
| 1404 "lane a ... leans heavily toward sine", 100 styles, above 0.35 | small | 359 "lane a's shape takes sine at its first-pick odds, 53.3 % (+/-3 points)" |
| 1416 "rateDrift/depthDrift lie within the documented ±0.7 window", 20 styles | small | 324 "each lane is the even draws at its own dataIds: shape, rate, both drifts, Sync mode and note", 300 styles. The band and the 0.01 grid ride on that pin; the share test at 348 alone would not catch one stray value |
| 1383 "rates are multiples of 0.05 and never 0", 20 styles | small | 324, the same pin (the 0.05 grid is in the expected bank); 330 holds the shares, not the grid |
| 811 "fills every band: each field takes many distinct values" (AutoWah, Phaser) | small | 229 "guard: every modulation pedal value is still the even draw at its own dataId" |
| 1282 "fills the bands: each wide field takes many distinct values" (Chorus, Tremolo, Vibrato) | small | 229, the same guard |

### 2.2 `systems/spawnSystem.test.ts` — 12 `it()`s (14 cases), about 5 s under load

| Remove (line, title) | Time | Twin |
| --- | --- | --- |
| 376 "about 12 % of robots glide, 15 % shape their attack, 15 % shape their release, 20 % carry an accent filter", 400 robots | small | `spawnSystem.evenDraws.test.ts` 81 (glide 12.5 % ±2), `robotFieldDerivation.test.ts` 88 (attack 15.5 %, release 15 %, ±2) and 287 (accent 20 % ±2) |
| 587 "about 15 % of robots seed a lit bus.frequency link", 0.10 to 0.20 | small | `spawnSystem.evenLinks.test.ts` 82 "the bus for 13.5 % (+/-2)" |
| 784 "seeds a lit ... target for roughly 20-40% of targets across 50 robots" | small | `spawnSystem.evenLinks.test.ts` 82 "each layer target is lit for 25 % of robots (+/-2 points)" |
| 896 "reaches the widened reverb band on the real draw ... over 400 offsets" | small | `robotFieldDerivation.test.ts` 346 "each depth reaches every 1 % step of its band" |
| 985 "leaves a sizeable share of a large fleet with no delay at all (a loose statistical bound)", 0.1 to 0.3 | small | `robotFieldDerivation.test.ts` 339 "the Delay is off for 25 % of robots (+/-2 points)" |
| 1573 "seeds rhythmicMotifLength.active at roughly an 85% chance across many spawns", 500 store spawns | 0.7 s | `robotFieldDerivation.test.ts` 202 "Motif Length and Note Variance are each off for 15 % of robots (+/-2 points)" |
| 1617 "seeds noteVariance.active at roughly an 85% chance across many spawns", 500 store spawns | 0.8 s | 202, the same guard |
| 1598 "reaches rhythmicMotifLength.value: 0 (the off state) through the single consolidated draw", 500 store spawns | about 1.8 s under load | A migration oracle (its comment: "Old two-draw implementation could never produce value: 0"). `robotFieldDerivation.test.ts` 229 "each melody field is the even draw at its own dataId" asserts `toEqual(seedToggleValue(...))` over 120 robots, and `seedToggleValue`'s off branch returns `{ active: false, value: 0 }` (`robotFieldDerivation.ts` 79); 202 holds the off share |
| 1639 "reaches noteVariance.value: 0 (the off state) through the single consolidated draw", 500 store spawns | about 1.8 s under load | 229 and 202, the same pair |
| 2937 `it.each` "spreads %s across the band: at least 20 distinct values ... both halves used" (3 cases) | small | `spawnSystem.evenCopies.test.ts` 68 "dynamics, rests and accents fill their bands: each outer tenth holds its even share" |
| 2953 "the three fields are drawn independently: few robots share one value across all three" | small | `spawnSystem.evenCopies.test.ts` 99 "the baseline path: each draw is the even draw at its own dataId and the spawn count" (three dataIds, so independent by construction); 93 correlates rests and accents with master volume, not with each other |
| 3322 "takes the copy branch ... at roughly the same ~30% rate spawnRobot itself uses" | small | `spawnSystem.evenCopies.test.ts` 86 "30 % of robots after the first are copies (+/-3 points)" |

### 2.3 One policy call

`globalAudioSeed.test.ts` line 559, "never seeds a colour Mix above 0.2, and a lit one never below
0.1, over 3000 styles" (3.5 s), pins literal numbers from Crawford's Checkpoint B listen
(2026-10-21). Its own comment says it holds the seeder to the listen, not to the table.
`globalAudioSeed.evenDraws.test.ts` line 216 checks a lit Mix is the even draw through the table's
band, so the table is already guarded. By the pre-v1 rule a literal pin on today's sound goes, but
this one was written on purpose, so it is a question for Crawford, not a clean cut.

### 2.4 Not candidates, because nothing duplicates them

In `globalAudioSeed.test.ts`: the pedal lit shares and independence (lines 704 to 724), the Phaser
and LFO-pedal Sync odds (871, 1146, 1167, 1172), the motion-pedal shares under the cap (1102,
1107), the lane-access block (1544 to 1567) and humanize (1812 to 1824). In `spawnSystem.test.ts`:
the effect-room sends (1020, 1122). In `audioSwells.test.ts`: the four T16 cases (from line 2021).
And the series' five files themselves, as above.

### 2.5 Shrinking samples, where the tolerance allows it

The swell case "starts a global swell on 12.5 ± 1.5 % of ticks at Frequency 2 (300 styles × 400
measures)" (4.4 s) runs 120,000 ticks; at 10,000 the tolerance is still four standard deviations,
so 100 styles × 100 measures keeps the proof and drops most of the time. The 3,000-style share
tests at ±3 points cannot shrink to a few hundred styles: at 300 the same tolerance is about one
standard deviation and the test becomes flaky, which the house rule then removes. Cut a sample
only after checking the tolerance against it.

## 3. Duplicate coverage (medium confidence, needs a read before cutting)

Reviewed 2026-11-07 against `17a462fd` by reading what each "duplicate" asserts on, not just its
titles. Two of the seven groups did not survive that read (3.1 and 3.2 are withdrawn as cuts),
one became a clean block delete with a relocation (3.4), and one turned out to remove nothing
(3.7). The reasoning is kept under each heading so the next reader does not redo it.

### 3.1 `RobotScreen.test.tsx` — WITHDRAWN: the screen block is not a duplicate of the section tests

The block `describe('RobotScreen — each section reaches the robot as before (moved from
RobotOptionsTab)')` (lines 557 to 1897, 115 `it()`s, 1,340 lines) looked like a re-test of the
five section components, each of which has its own file (`AudioSettingSection.test.tsx`, 122
`it()`s; `PingControlsDrawer.test.tsx`, 55; `PingContourDrawer.test.tsx`, 36;
`SignatureArrayDrawer.test.tsx`, 40; `BusFilterDrawer.test.tsx`, 30).

It is not. The block stubs the sections (`levelsStub`, `filterStub`, `stubDynamics`) and tests the
screen's own layer: deriving each value from the robot, wiring each handler to its `apply*` action
(twenty distinct actions, `applySend` 17 times, `applyRests` and `applyAccents` 7 each), cancelling
a swell before the write, reading the latest robot rather than the first render's, the memo key,
and the live pan readout path. The five section files never reference an `apply*` action (four of
them zero times, `SignatureArrayDrawer.test.tsx` once). Cutting the block to "one mount-and-reach
check per section" would remove the only coverage of the handler wiring.

What remains: a read for the few `it()`s that assert a section internal rather than the wiring,
and the timing. The file ran at 11.6 s alone on an idle machine against 32 s in the loaded run,
so its cost is smaller than the table in section 5 suggests.

### 3.2 Tempo Sync — WITHDRAWN as a layer cut; a read of the panel block only

`utils/tempoSync.test.ts` (130 `it()`s), `stores/audioStore.tempoSync.test.ts` (136 `it()`s, 1,653
lines, 24 s), `components/ui/controls/TempoSyncSlider.test.tsx` and `TempoSyncToggle.test.tsx`,
and the tempo sync blocks in `AudioRigEffectPanel.test.tsx` (lines 1137 to 2085, about 950
lines): "Delay Time Tempo Sync" (34 cases), "Phaser Rate Tempo Sync" (33) and a `describe.each`
"$key Rate Tempo Sync (Global Pedals T11)" over chorus, tremolo and vibrato (14 `it()`s, 42
cases). The first draft counted two blocks and 78 `it()`s; it is three blocks, 79 `it()`s and 109
cases over five tempo rows.

The first draft said each layer re-derives the note table. It does not. The store file asserts
only on store state (59 times), `lfoEngine.setBankRate` (34) and the delay and phaser pushes, and
never on a literal note value; the panel blocks assert on the two thumbs, the toggle and the
stored effect. The literal note strings in those files are fixtures, not re-derived expectations.
The layer split the draft asked for already exists, and no pair of files shares a single `it()`
title. The only question left is whether 109 panel tests on five tempo rows is more than five rows
need, which is a read of those blocks, not a structural cut.

### 3.3 The per-control memo trio — 51 `it()`s across 23 files

"is a React.memo-wrapped component" (24 copies) asserts `$$typeof === Symbol.for('react.memo')`,
an implementation detail; "does not re-execute its render body on a re-render with identical
props" (13 copies) and "does re-execute its render body when a real prop changes" (14 copies) are
the behaviour. Keep the behaviour pair where the control is actually hot (the sliders,
`CabinetBox`), drop the `$$typeof` check everywhere, and drop the pair on `Button`, `TextInput`,
`Stepper` where a re-render costs nothing.

One caveat the first draft left out: ten of the 23 files carry only the `$$typeof` check and no
behaviour pair (the five robot section files, `DualLabel`, `HelpPopover`, `LfoLink`,
`SectionTabs`, `TempoSyncSlider`). Dropping it there leaves those components with no memo test at
all. That is the right call for a shape check, but the removal accepts it knowingly rather than
assuming the pair exists everywhere.

### 3.4 `AudioEngine.test.ts` repeats `globalFx.test.ts` — 10 `it()`s plus the six priming blocks

`describe('AudioEngine - Global FX Chain')` (lines 2457 to 2582, 10 `it()`s) tests `setGlobalReverb`,
`setGlobalDelay`, `setGlobalLimiter`, `setGlobalEQ`, `setGlobalFilterLPF`, `setGlobalCompressor`
through the engine facade. The facade is a re-export: `AudioEngine.ts` lists the `globalFx`
functions unchanged, so the two files call the very same code. `globalFx.test.ts` covers five of
the six at far greater depth (18 cases mention `setGlobalReverb`, 13 `setGlobalEQ`, 12
`setGlobalFilterLPF`) and already covers the not-started no-op the facade block repeats.

The exception is `setGlobalCompressor`: `globalFx.test.ts` never mentions it, so the one case at
line 2542 ("updates threshold and ratio on the master compressor") is the only test of that
setter anywhere. Move it into `globalFx.test.ts` first, then the block is a clean delete. Two of
the block's ten cases are not setter tests at all: a `reserveVoice` bus-wiring check (worth a look
before it goes) and a "no longer exports setEffectBypass/setGlobalBypass" history guard that
belongs to group 1.9.

The six `AudioEngine.start — primes the ... (T3/T4/T5/T6)` blocks (lines 3195 to 3651; 8, 3, 7, 3,
2 and 2 `it()`s) each prove one pedal family primes from state; one table-driven test over all the
families would do. Line numbers here are six higher than the first draft's: the backlog 67 merge
added to the file above them. Re-grep before cutting by line.

### 3.5 Data config tests re-walk the same shapes — 571 `it()`s across 20 files in `src/data/`

"remains JSON-serializable" appears 11 times; a per-schema shape check in the form "is a
horizontal linear slider, 0-100 %, whole steps, in the audioRig.* namespace" (the wording varies); "has all N params, matching GLOBAL_CHAIN_GRID.md exactly" is a doc-parity pin;
"every schema label equals its concept's CONTENT entry" (three copies, in `audioRigConfig`,
`robotOptionsConfig` and `sessionConfig`) is a handful of spot checks that cannot fail: every
config builds its labels by spreading `labels(key)` (37, 70 and 7 spreads in the three configs)
and the ESLint literal guard forbids any other way to set one. The first draft credited
`src/content/content.test.ts` with enforcing this; it does not — that file checks help coverage
and key referencing, not label equality. The redundancy is structural, which is a stronger reason
to cut than another test covering it would be. `robotOptionsConfig.test.ts`
(109 `it()`s) and `audioRigConfig.test.ts` (134 `it()`s) are the heaviest. A single structural
walk per config (closed-set `type`, serialisable, every `id` resolves to a content key) plus the
handful of genuine range tests ("Density uses the real RHYTHMIC_DENSITY_MIN/MAX") would replace
most of these.

### 3.6 Per-renderer repeats — 13 `it()`s

"mutation check: dropping the depth cap multiply changes the fill, so the cap really is applied"
is copy-pasted into thirteen scenery renderer tests. A mutation check belongs in a mutation run
(the TDD workflow already has mutation gates), not the suite. The paired "no NaN attributes and
every edge is 90/45, across 50 seeds" (11 copies) is a real property check and stays.

### 3.7 Two files on one subject, where one would do — a tidy-up, not a removal

None of these pairs shares a single `it()` title (checked pair by pair). Merging them moves tests
between files and deletes nothing, so this group does not serve the audit's goal; it is kept as a
note for whoever is in those files anyway. The two pairs marked "fine as is" need no action.

| Pair | Suggestion |
| --- | --- |
| `audioStore.test.ts` + `audioStore.tempoSync.test.ts` (1,653 lines each) | Keep apart: 3.2 found no overlap to remove, and a 3,300-line file helps nobody |
| `globalAudioSeed.test.ts` + `globalAudioSeed.evenDraws.test.ts` | Keep apart: the second is mock-free and builds its 3,000-style sample at module scope; the overlap is removed from the first (2.1) |
| `spawnSystem.test.ts` + three `spawnSystem.even*.test.ts` | Keep apart: T9 split them to run in parallel (28 s to build in one worker); the overlap is removed from the first (2.2) |
| `aspectDeal.test.ts` + `aspectDeal.widened.test.ts` | Merge; "widened" was a task name, not a subject |
| `powerController.test.ts` + `powerController.world.test.ts` | Fine as is: unit vs integration |
| `workLoop.test.ts` + `workLoop.integration.test.ts` | Fine as is |
| `RadioButton.test.tsx` + `RadioButton.face.test.tsx` | Merge, 8 `it()`s |
| `PowerRockerSwitch.test.tsx` + `PowerRockerSwitch.light.test.tsx` | Merge, 13 `it()`s |
| `SettingsScreen.test.tsx` + `SettingsScreen.panels.test.tsx` | Merge, 5 `it()`s |
| `Factory.test.ts` + `Factory.test.tsx` | Rename the first to `factoryVariants.selection.test.ts` or merge into `factoryVariants.test.ts`; it tests variant selection, not the component |

## 4. Compatibility pins (lower confidence, a policy call)

150 `it()`s are titled with "as before", "unchanged", "unaffected", "existing behaviour" or
"no existing" (51 without "unchanged"; "today sound" matches nothing). Heaviest:
`SliderLinear.test.tsx` (8), `melodyGenerator.test.ts` (7), `globalAudioSeed.test.ts` (6),
`AudioEngine.test.ts` (6), `SliderCenteredZero.test.tsx` (6), `CabinetBox.test.tsx` (6).

The title is not the test. All 150 were read (2026-11-07, `tests/pruning`) and they sort into
four piles:

- **Behaviour tests whose title happens to say "unchanged", about 95.** Nearly the whole
  "unchanged" set: "leaves startStep, length, and octave unchanged on every event", "passes an
  in-range value through unchanged", "survives a JSON round trip unchanged", "returns the base
  unchanged at contrast 0", "leaves eq3 swells unaffected by the HPF/LPF clamps". Each asserts
  that an input the function must not touch comes out intact. Not candidates. "unchanged" is the
  word that pulls these in, so a grep that includes it is three parts noise.
- **Default-value tests with an old-fashioned title, about 23.** "is not disabled by default — no
  existing behavior changes" (five controls), "renders with no inline style when the prop is
  omitted — existing consumers unaffected" (four drawers), "omitting boxSize ..." (RadioButton,
  Toggle), the CabinetBox `delay` and `skipMountAnimation` defaults, SliderLinear's three
  `formatValue`-absent cases, the Button and RadioButton cabinet-appearance defaults, the three
  "'horizontal' (default) ... unchanged from before orientation existed" (orientation is a live
  prop through `useAutoSliderOrientation`, so these test a current default, not history). Keep;
  retitle when the file is next touched.
- **Behaviour tests with a history title, about 20.** "a throw while priming the bank does not
  fail start() — existing behavior (beat clock) still runs" is error isolation; melodyGenerator's
  "leaves the existing R-extra-onset-per-repeat and overshoot-trim branches unaffected" is a case
  the tail pass must leave alone; `LfoBankLanePanel`'s "drift held-off behaviour is as before" is
  the held-off rendering; `robotSystems.test.ts`'s two "unaffected by whatever is in the live
  store" prime the store with a stranger and prove the function never reads it ("imports neither"
  in the title is a figure of speech, not a source scan); `globalAudioSeed.test.ts` 382 pins a
  rounding regression to one value and 624 the drawn dataId set. Keep.
- **Already listed in another group, 7.** The six ring "without its rings the markup is exactly
  the switched-off X" and tank's "(as before)" are 1.3. Don't count them twice.

The pins with nothing behind them, found by reading `describe` titles and bodies rather than
the grep, are two:

- `ContentPane.test.tsx` 53, "renders ConsolePanel unchanged — this task does not touch its own
  dispatch logic" (Task 8 AC3): asserts that a stubbed child renders. Cut.
- `Factory.test.tsx` 321, the `describe` "regression guard (documents pre-fix behavior; tightened
  by Task 4)": its own comment says it is the baseline for Task 4's spy, which sits in the next
  `describe` and merged (FACTORY_LIGHTING_RERENDER, archived). What it checks, that fills follow
  the local time, is also checked at line 182. Cut.

Borderline: `RobotGem.test.tsx` 564, "motion: false output is unchanged (DOM order and class
list) except the halo, which the amendment removes from cards entirely", pins the gem's child
order as a literal list. That order is the layer stack ROBOT_DESIGN.md names, so the test has a
reason; retitle rather than cut.

What the grep misses and should have found: titles ending "(regression guard, cut feature)" in
`SessionListItem.test.tsx` (three), `SessionsPanel.test.tsx` and `sessionStore.test.ts` pin the
absence of the cut autosave, Primary Save and Update features. They are history guards of the
1.9 kind and belong on that list; `sessionStore.test.ts` 17, "has no viewingUnsavedHistory field
or setViewingUnsavedHistory action", is the pure form.

```
grep -rnE "^\s*(it|test|describe)\(.*(as before|unaffected|existing (behavior|behaviour)|no existing|regression guard|cut feature|this task)" src --include="*.test.*"
```

Net: this group removes two tests, not 150. It is the smallest group in the document; fold the
two cuts and the cut-feature guards into the 1.9 sweep rather than giving it a PR.

## 5. Slow files worth a look even if nothing is wrong with them

Not removal candidates on their own, but the time they cost is where a smaller suite would feel
different day to day.

Two measurements per file, both 2026-11-07 on `tests/pruning` (HEAD 17a462fd). **Full run** is the
file's duration inside a third full `npm test` (13,607 cases, 1,260 s of worker time, one failure:
the 1.12 timeout again). **Alone** is the same file run by itself on the idle machine. The full-run
number is three to six times the alone number for every file: Vitest's workers share the CPU, so a
file's full-run duration measures contention, not the tests. The ranking is roughly the same either
way, but a per-case cost should be read from the Alone column. `ms/test` is Alone divided by cases.
The first draft's `ms/test` column (329 for `AudioEngine`, 581 for `SignatureArrayDrawer`, 855 for
`svgElementExtent`) was full-run time per case and overstated every file by that factor.

| File | Full run | Alone | Cases | ms/test | What is slow |
| --- | --- | --- | --- | --- | --- |
| `engine/AudioEngine.test.ts` | 126 s | 38.6 s | 395 | 98 | Each case builds Tone mocks; see 3.4 |
| `screens/OffScreen.test.tsx` | 108 s | 16.5 s | 195 | 85 | Full screen mounts under the scene wash; 22 top-level `describe`s. Fourth alone, second under load: it suffers most from contention |
| `engine/audioEngine/globalFx.test.ts` | 67 s | 22.2 s | 468 | 47 | The 6,326-line file. The cost is the `beforeEach` at line 458: `vi.resetModules()` and a dynamic import per case. The ten "warns and does not throw when the node throws" are one per setter, each with its own `built()` and node; foldable into one `it.each`, which tidies but saves no time |
| `console/AudioRigEffectPanel.test.tsx` | 66 s | 10.6 s | 284 | 37 | The tempo sync blocks (lines 1137 to 2085) are three, not one: Delay Time (34 cases), Phaser Rate (33) and a `describe.each` over chorus, tremolo and vibrato (14 `it()`s, 42 cases), 109 cases on five tempo rows. The question in 3.2 is whether five rows need 109 panel tests, a read of those blocks |
| `robot/AudioSettingSection.test.tsx` | 65 s | 10.7 s | 164 | 65 | Not a duplicate of the screen test (3.1); cost is the mounts (162 `render()`s) |
| `utils/globalAudioSeed.test.ts` | 63 s | 18.3 s | 179 | 102 | The three 3,000-style colour tests are the three slowest cases in the file (2.1 removes two of them, 2.3 is the third) |
| `screens/RobotScreen.test.tsx` | 40 s | 9.5 s | 238 | 40 | The block is wiring coverage, not a duplicate (3.1) |
| `utils/svgElementExtent.test.tsx` | 33 s | 7.1 s | 33 | 215 | The highest per-case cost in the table. Each rooftop case renders 5 sizes × 60 seeds × shaded or not = 600 React trees; each scenery case 40 seeds × derelict or not × day or night = 160. Sampling 10 seeds keeps the parity proof and cuts the file to about a sixth; the seeds pick geometry branches in the renderers, so a smaller sample sees fewer of them |
| `systems/spawnSystem.test.ts` | 30 s | 7.7 s | 272 | 28 | The four 500-store-spawn tests at lines 1573 to 1639 are the four slowest cases in the file; all four are now in 2.2, about 5 s of full-run time. The rest is the store path per spawn |
| `robot/SignatureArrayDrawer.test.tsx` | 29 s | 4.9 s | 40 | 123 | Each mount is three layers of Type radios (five `CabinetBox` options each), sliders and `LfoLink` lane radios; 123 ms per mount is the drawer's size, not an anomaly |
| `systems/lifecycleSim.test.ts` | 28 s | 7.0 s | 48 | 146 | Group 1.4; the readiness sim over the full grid is the single slowest case in the suite |
| `screens/FleetParamsScreen.test.tsx` | 25 s | 5.2 s | 101 | 51 | Missing from the first draft; it sits above the next four rows under load. Twelve top-level `describe`s mounting the screen (52 `render()`s); nothing structural to cut |
| `stores/audioStore.tempoSync.test.ts` | 24 s | 6.6 s | 152 | 43 | Asserts store state and engine pushes, not note math; nothing to cut (3.2) |
| `animation/jobMoves/buildJobTimeline.test.ts` | 24 s | 4.6 s | 41 | 112 | Real GSAP timelines at 20, 110 and 200 BPM; "every job lasts jobDuration(bpm) with 0–4 orbiters" is the one slow case |
| `stations/stationGem.test.ts` | 23 s | 5.3 s | 30 | 177 | Three tests carry most of the file: the two titled "at every dial corner" (lines 248 and 370) and "every face is the edge-dropping offset of its outline" (306) |
| the eleven `animation/jobMoves/decor/*.test.ts*` | 49 s together | 20.3 s | 375 | 54 | Ten `.test.ts` plus `jobDecor.test.tsx`. Seven files carry all the time (5 to 9 s each under load); `decorTier`, `frames`, `polyline` and `smooth` total 0.4 s. Eight files loop `for (const bpm of [20, 110, 200])`. The five "leaves the orbiters, the body and the bob exactly where they are without it" (fluid, inspection, salvage, survey, vent; maintenance has none) are the same body against a different job, one `it.each` in `buildJobTimeline.test.ts` would do; a tidy, no saving. The Alone figure ran the folder as one set, so its eleven files still shared workers |

Below the table, at 20 to 22 s under load (4 to 7 s alone), sit `stores/audioStore.test.ts`,
`systems/audioSwells.test.ts` and `systems/workLoop.test.ts`. They are the same size as the
`stationGem` row and are left out only because section 6 already names `workLoop` as large for a
reason and nothing structural stood out in the other two.

## 6. What this audit did not flag

So the list is not read as "everything":

- The renderer geometry tests (`renderers/*.test.tsx`, the `.ring` files' placement and shading
  cases, `rooftopGreebles`, the hairline files) check real invariants (90/45 edges, no NaN,
  facets inside the ring) and stay, less the switch-off cases in 1.3.
- `workLoop.test.ts`, `worldTransition.test.ts`, `sessionDiff.test.ts`, `worldDiffCodec.test.ts`,
  `melodyGenerator.test.ts`, `harmonySystem.test.ts`, `beatClock.test.ts` are large because the
  behaviour is large. Nothing structural stood out beyond the history-guard titles in 1.9.
- `src/content/content.test.ts` is the content guard CLAUDE.md names; it stays.
- `scripts/perf/*.test.mjs` (301 `it()`s over 7 files) test the perf harness's parsing libraries.
  They are cheap and the harness is live (backlog 67). Kept out of the list.
- `OceanScene.clicks.test.tsx` is the one stylesheet-reading test ESLint allows by name.
- The roughly 450 `describe` and 185 `it()` titles that cite a phase, task or doc are not a problem in
  themselves. They are a problem only where the title is the whole reason the test exists (1.9,
  4). Ninety of them cite a doc under an `archive/` folder.

## 7. Suggested order

1. Groups 1.1 to 1.8 and 1.12 in one PR: whole files, about 4,000 lines, with four relocations
   done first so the PR stays delete-only afterwards: the `isSyncedRateKey` and
   `withGlobalAudioDefaults` blocks out of `types/globalAudio.test.ts` (1.1), the orbiter-timeline
   case out of `Robot.integration.test.tsx` into `Robot.test.tsx` (1.6), the re-reserve sends case
   out of `robotSendsParity.test.ts` into `AudioEngine.test.ts` (1.8), and the Button and
   TempoSyncToggle help checks out of `helpOnLabels.test.tsx` if 1.11 rides along.
   `constants/time.test.ts` (1.2) is trimmed to its six `computeLocaleHour` tests, not deleted. For
   1.4 that means the test file only; the `lifecycleSim.ts` module stays until its
   `SIM_SEED_COORDS` importers have a new home. `numericDuration.test.ts` (1.7) is a judgement
   call, not a given. Proof is `npm test` green and `npm run build:types` still catching the type
   cases.
2. Group 2 as a second PR: the two tables in 2.1 and 2.2, delete-only, with the 2.3 question put
   to Crawford first so its answer rides along. The series' own files are untouched.
3. Group 3.4 as its own small PR: move the compressor test into `globalFx.test.ts`, delete the
   Global FX Chain block, fold the six priming blocks into one table. 3.1 and 3.2 are withdrawn
   as cuts and need no PR.
4. Groups 1.9, 3.3, 3.5, 3.6 and 4 as a sweep, file by file, when touching those files anyway.
   3.7 is a file tidy-up that removes no tests; do it only if already in the file.

Each PR is a delete-only change, so by the house rule it carries no RED test; its proof line is
the green run and the before/after counts from the table at the top.
