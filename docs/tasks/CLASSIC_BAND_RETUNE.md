# Implementation Plan: Classic Band Retune — the seed bands a fresh world rolls within, before Robot Effect Sends

> **Status (2026-10-21):** T0 done — the three decisions in §3 are answered (1 = B, 2 = not deliberate, 3 = keep 4–12), so
> every task is unblocked. Building on `feature/classic-band-retune`, branched off `main` at `a12ee21c`; the plan was
> written against `0b087fec` (the Global Pedals merge, PR #565), and `main` has since gained only docs. The listen
> (Checkpoint B) is Crawford's; stop there.

**No spec of its own.** This is a tuning pass over existing fields: the rows table in §2 is the whole change. It
precedes Robot Effect Sends ([intent](../intent/robot-effect-sends.md), proposed roadmap 50.7), whose room bands will be
written against the Classic this plan produces, and it is the "Classic" column the themes idea
([docs/ideas/themes.md](../ideas/themes.md)) will later copy. Where a row comes from: the Tone.js inventory
([docs/reference/TONE_EFFECTS_INVENTORY.md](../reference/TONE_EFFECTS_INVENTORY.md)) and the 2026-10-20 review of its
numbers, which Crawford accepted ("we're going to try your proposal").

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`, `npm run dev`.
No phone gate: nothing here changes the node count, and a lit effect costs the same at any Mix.

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## 1. Why these rows

One law shapes most of them. A Mix slider is stored as its position, squared at the node (`colourWetGain`,
`globalFx.ts`), and the bypass cell's wet gain is `sin(π/2 · mix²)` (DARK_EFFECT_BYPASS.md §1.1). So the wet layer sits
at −48 dB for a slider of 0.05, −29 dB at 0.15, −20 dB at 0.25, −14 dB at 0.35, −8 dB at 0.5. The slider's bottom third
is near silence. Every lit Mix band today starts in that third, so a "lit" effect seeded at its floor is inaudible on a
phone speaker and "lit in a third of worlds" is really "audibly lit in a sixth". The ceilings came from Crawford's
listens (50.3 T14, 50.4 T16, 50.6 T16) and stay; the floors rise.

The other rows are single-cause: the HPF band removes the fundamentals of every robot below octave 5; the AutoWah's
sensitivity band saturates its follower; the Chorus's delay band is a flanger's; Vibrato below full wet is a chorus; the
Compressor band has no makeup gain behind it; the preDelay range disagrees between the grid and the code; Tremolo beats
against the 16th grid when Free.

## 2. The rows

Bands are seed bands (`GLOBAL_AUDIO_LOADING_RANGES`, `src/data/globalAudioLoadingRanges.ts`) unless the row says "full
range". Everything not listed is unchanged.

| # | field | now | proposed | gated by | reason |
|---|---|---|---|---|---|
| 1 | `vibrato.wet` | 0.2–0.5 | 0.85–1 | — | a vibrato below full wet is a chorus; Crawford confirmed Vibrato stays an insert as a true vibrato (sends interview, 2026-10-21) |
| 2 | `vibrato.depth` | 0.05–0.3 | 0.03–0.12 | — | at full wet the old depths are a siren; 0.12 of a 5 ms line is ±0.6 ms |
| 3 | `distortion.wet` | 0.1–0.25 | A: 0.2–0.25 · B: 0.2–0.3 | **Decision 1** | floor −36 dB today |
| 4 | `chebyshev.wet`, `bitCrusher.wet` | 0.05–0.15 | A: 0.2–0.25 · B: 0.25–0.35 | **Decision 1** | −48 to −29 dB today: two of the four Colour characters seed an effect nobody can hear |
| 5 | `autoWah.wet` | 0.2–0.5 | 0.35–0.5 | — | floor to ≈ −14 dB, ceiling kept |
| 6 | `phaser.wet` | 0.15–0.4 | 0.3–0.4 | — | floor to ≈ −17 dB, ceiling kept |
| 7 | `chorus.wet` | 0.15–0.4 | 0.3–0.4 | — | as 6 |
| 8 | `tremolo.wet` | 0.2–0.5 | 0.35–0.5 | — | as 5 |
| 9 | `frequencyShifter.wet` | 0.1–0.3 | 0.25–0.35 | — | floor to ≈ −20 dB; the ceiling moves by 0.05 only so the band is not a point (flag at the listen) |
| 10 | `filterHPF.frequency` | 20–500 | 20–120 | — | C4 is 262 Hz; octave-1..3 robots exist. Full range and the LFO swing (from `GLOBAL_AUDIO_SEED_RANGES`) unchanged |
| 11 | `autoWah.sensitivity` | −40 to −10 | −20 to −5 | — | Tone boosts the follower by −sensitivity dB; at −40 on a fleet near 0 dBFS the filter sits open and never sweeps |
| 12 | `chorus.delayTime` | 2–8 ms | 6–15 ms | — | under 5 ms with feedback is a flanger; chorus is 10–20 ms. Full range 1–20 kept so a flanger stays reachable by hand |
| 13 | Tremolo Sync odds | `PEDAL_SYNC_ODDS` 0.5 (shared) | 0.75 for Tremolo, 0.5 for Phaser, Chorus, Vibrato | — | a Free tremolo beats against the 16th grid; the others don't care. Uniform draws: no refit, only the measured figure |
| 14 | `reverb.preDelay` **full range** | 0–1 s (code) / 0–0.5 s (grid) | 0–0.25 s in both | — | resolves the discrepancy; a 1 s pre-delay is a slapback. Seed band 0–0.1 unchanged. The setter gains a clamp (T4) |
| 15 | per-robot Reverb send band (`'reverb.wet'` row, read by `generateRobotSends`) | 0.1–0.4 | 0.1–0.6 | — | more contrast between a dry probe and a wet one. Taste; the listen can veto |
| 16 | `compressor.threshold` / `compressor.ratio` | −55 to −45 / 10–20 | if unintended: −36 to −18 / 2–6 | **Decision 2** | no makeup gain: a −50 dB threshold at 15:1 pins the fleet's sustained level near −47 dBFS, only transients escape the 3–50 ms attack, and the Limiter at −3 dB never acts. Attack, release and knee unchanged |

**Withdrawn:** Phaser `stages` seed 4–12 → 4–8. The reason was phone cost, and the Dark-Effect Bypass round 4 found no
signal between 10 and 4 stages (DARK_EFFECT_BYPASS.md §8.5). Nothing moves unless Crawford wants fewer stages for the
sound.

**Defaults are untouched** (`DEFAULT_GLOBAL_AUDIO_SETTINGS`: every Mix 0, Vibrato depth 0.1). A dark world sounds as it
does today. The three transmission presets (`src/data/transmissionPresets.ts`) are dry and their preDelays are 0.03–0.06,
inside the new full range.

## 3. Decisions needed from Crawford (T0)

Record the answer in this file, then build. If an answer is blank, stop and ask; do not pick for him.

**Decision 1 — the colour ceiling.** `COLOUR_LOAD_MIX_MAX` is 0.25 (Crawford, 2026-10-15, "don't allow any of the new
color mixes to exceed .25 on load"; `globalAudioLoadingRanges.ts:26`, pinned at `globalAudioLoadingRanges.test.ts:143`).
Rows 3–4 either stop at it (A) or it rises to 0.35 (B). Recommendation: **B**. The sends phase re-homes these three
Mixes inside the Colour room, where only the robots with a Grit send hear them, so the ceiling that protected the whole
fleet on the Pixel is about to stop meaning that. Answer: **B** (Crawford, 2026-10-21) — `COLOUR_LOAD_MIX_MAX` rises to 0.35;
rows 3–4 take their B values.

**Decision 2 — the Compressor band.** Was −55 to −45 dB at 10–20:1 a deliberate pumping-pad choice when the loading
ranges were set, or did it land there? If deliberate, row 16 is dropped. If not, or if he does not remember, T6 measures
first (an offline render, the DARK_EFFECT_BYPASS.md §8.1 method: the same seeded world with the band's values against
threshold 0 dB, compared by RMS and peak), records the numbers here, and he decides on them. Answer: **Not deliberate**
(Crawford, 2026-10-21) — row 16 stays in. T6 still measures first and stops for his go on the numbers before moving the
bands to −36 to −18 dB / 2–6:1.

**Decision 3 — Phaser stages.** Withdrawn above unless he wants fewer stages for the sound. Answer: **Keep 4–12** (Crawford, 2026-10-21) — the
withdrawal stands; no row added.

## 4. What the rows touch

- **The tables.** `src/data/globalAudioLoadingRanges.ts` (every seed band; its header comments cite the T14/T16 numbers
  and must be rewritten with the new ones and this plan's date); `src/data/globalAudioLoadingRanges.test.ts` (pins the
  values); `src/data/globalAudioSeedRanges.ts` and `src/data/audioRigConfig.ts` for row 14 (the rig schema's min/max
  must equal the seed range: `audioRigConfig.test.ts:289/334/459` pin the match); `src/types/globalAudio.ts` doc comment
  `preDelay` "(0 - 1)".
- **The seeder.** `src/utils/globalAudioSeed.ts:174` `PEDAL_SYNC_ODDS` becomes per pedal for row 13 (a `Record` keyed
  `'phaser' | 'chorus' | 'tremolo' | 'vibrato'`); its readers at `:239` (Phaser) and `:258` (motion pedals).
  `generateRobotSends` reads the `'reverb.wet'` row unchanged for row 15.
- **The seed tests.** `src/utils/globalAudioSeed.test.ts`: `:603` and `:983` pin `PEDAL_SYNC_ODDS` to 0.5; `:775` and
  `:1043` hold each lit pedal's sync share within 5 points of it (per pedal after row 13); the comment at `:996` records
  the measured sync shares (49.82 / 50.88 / 49.73 %) and must carry the new Tremolo figure. No test pins an exact seeded
  value of any field this plan moves (checked 2026-10-21: the only exact oracles are `delay.wet = 1`, dark Mixes `= 0`,
  and an integer `compressor.threshold`), so band moves pass the in-band assertions as they are.
  `src/systems/spawnSystem.test.ts:745–762` pin the Reverb send band 0.1–0.4 and the `() => 1` oracle `reverbSend: 0.4`
  (row 15).
- **The setter.** `setGlobalReverb` (`globalFx.ts:724`) forwards `decay` and `preDelay` to the IR flush with no clamp; the
  colour and pedal setters clamp into the field's full range because a share link is untrusted input. Row 14 adds the same
  clamp (T4).
- **The docs guards.** `src/docs/globalPedalsDocs.test.ts:139` and `:203` match `/export const PEDAL_SYNC_ODDS = /`, and
  `src/docs/globalModulationDocs.test.ts:124` matches `modeT < PEDAL_SYNC_ODDS`; both regexes change with row 13. No
  guard pins a band value as a string (checked).
- **The living docs.** `docs/reference/GLOBAL_CHAIN_GRID.md` (rows 22, 25, 27, 29, 32, 36, 42, 44, 48, 52, 54, 55, 57,
  62, 64, 65 and footnotes ², ³, ⁴, ⁵, which quote the bands in prose); `docs/AUDIO_SYSTEM.md:264` and `:271` (Colour
  and Modulation bands) and the "Sends and returns" paragraph ("Reverb in 0.1–0.4"); `docs/ideas/themes.md:26–28`;
  `docs/reference/TONE_EFFECTS_INVENTORY.md` (the seedMin/seedMax columns and its Discrepancies item 1). The three specs
  keep their history: append one dated "Retuned (Classic Band Retune, 2026-10-xx)" line to the as-built notes of
  `GLOBAL_COLOUR.md` (near `:457`), `GLOBAL_MODULATION_COLOUR.md` (near `:589`) and `GLOBAL_PEDALS.md` (near `:612`);
  do not rewrite their assumptions.

## 5. Tasks

Every task is RED first where there is a behaviour to pin, one commit, suite / types / lint green before the next.
Mutation gates only where there is logic (T3's per-pedal lookup, T4's clamp); a band table has no mutants worth killing
beyond the pinned values. Edit with the Edit tool, not shell scripts (CRLF files).

### Task 0: Decisions — **STOP for Crawford**

**Description:** Get the three answers in §3 into this file. T1, T3, T4, T5 may proceed while waiting; T2 and T6 wait.

### Task 1: The undisputed band moves (rows 1, 2, 5–12)

**Description:** Pin the new values in `globalAudioLoadingRanges.test.ts` (RED), move the twelve bands in
`globalAudioLoadingRanges.ts`, rewrite the header comments that cite the old numbers, update the grid rows and the
footnote prose for these fields, and the inventory's columns.

**Acceptance criteria:**
- [ ] The table test pins every row in §2 marked "—" except 13–15, by value.
- [ ] `globalAudioSeed.test.ts` passes unchanged (in-band assertions only); a 2 000-style sweep in the test's existing
  calibration shape shows every lit Vibrato with `wet` in 0.85–1 and `depth` in 0.03–0.12, every lit AutoWah `wet` ≥ 0.35,
  every seeded HPF cutoff ≤ 120 Hz.
- [ ] GLOBAL_CHAIN_GRID.md's Loading Range column matches the table for these rows (the grid is the source of truth;
  update it in the same commit).

**Verification:** `npx vitest run src/data/globalAudioLoadingRanges.test.ts src/utils/globalAudioSeed.test.ts
src/docs`; `npm run build:types`.

**Dependencies:** none. **Files:** `globalAudioLoadingRanges.ts`, its test, `GLOBAL_CHAIN_GRID.md`,
`TONE_EFFECTS_INVENTORY.md`. **Scope:** S.

### Task 2: Colour bands (rows 3–4) — after Decision 1

**Description:** Under A, move the three colour Mix bands inside the 0.25 ceiling. Under B, raise `COLOUR_LOAD_MIX_MAX`
to 0.35 and move them to the B values. Either way: the table test, the ceiling test at `:143`, the
`globalAudioLoadingRanges.ts` T14 comment, `AUDIO_SYSTEM.md:264`, the grid rows and footnote ³, and the themes idea
line 26.

**Acceptance criteria:**
- [ ] `COLOUR_LOAD_MIX_MAX` equals the decided ceiling and no colour band's `max` exceeds it (a test holds both).
- [ ] A lit Distortion, Chebyshev or BitCrusher seeds `wet` inside its new band; dark ones still seed 0 (existing tests).

**Verification:** as T1. **Dependencies:** T0 Decision 1. **Scope:** S.

### Task 3: Tremolo Sync odds (row 13)

**Description:** `PEDAL_SYNC_ODDS` becomes `Record<'phaser' | 'chorus' | 'tremolo' | 'vibrato', number>` with Tremolo at
0.75 and the others at 0.5; the two readers index it; the pinned values at `:603`/`:983` and the share tests at
`:775`/`:1043` go per pedal; the docs-guard regexes follow the new declaration; the measured figure at `:996` is
re-measured the way the `PEDAL_LIT_EDGE` comment describes (20 000 styles, a temporary harness in the scratchpad, never
committed) and recorded; the grid footnote ⁵ ("about half") names Tremolo's three quarters.

**Acceptance criteria:**
- [ ] RED: a test that a lit Tremolo seeds Sync in 75 % of worlds within 5 points fails before the change and passes after.
- [ ] Phaser, Chorus and Vibrato sync shares are unchanged within the existing tolerance; a dark pedal is never synced.
- [ ] Mutation gate: swapping Tremolo's odds for the Phaser's, and indexing the wrong pedal, are both caught.

**Verification:** `npx vitest run src/utils/globalAudioSeed.test.ts src/docs`. **Dependencies:** none. **Files:**
`globalAudioSeed.ts`, its test, `globalPedalsDocs.test.ts`, `globalModulationDocs.test.ts`, `GLOBAL_CHAIN_GRID.md`.
**Scope:** S.

### Task 4: Reverb preDelay full range and the setter clamp (row 14)

**Description:** `GLOBAL_AUDIO_SEED_RANGES['reverb.preDelay']` and the rig schema both become 0–0.25; the type comment
follows; `setGlobalReverb` clamps `decay` into 0.1–10 and `preDelay` into 0–0.25 and ignores a non-finite value, as
`clampColour` does for the colour setters; the grid row 62 and the inventory's Discrepancies item 1 are resolved.

**Acceptance criteria:**
- [ ] RED: `setGlobalReverb({ preDelay: 0.9 })` reaches the IR flush as 0.25; `({ preDelay: NaN })` leaves the pending IR
  unchanged; `({ decay: 50 })` reaches it as 10.
- [ ] `audioRigConfig.test.ts`'s range parity holds; a saved session carrying `preDelay: 0.6` loads and sounds at 0.25.
- [ ] Mutation gate: a dropped clamp, a swapped min/max and a `>=` for `>` are caught.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/data/audioRigConfig.test.ts`.
**Dependencies:** none. **Files:** `globalAudioSeedRanges.ts`, `audioRigConfig.ts`, `types/globalAudio.ts`, `globalFx.ts`
and its test, `GLOBAL_CHAIN_GRID.md`, `TONE_EFFECTS_INVENTORY.md`. **Scope:** S.

### Task 5: Reverb send band (row 15)

**Description:** The `'reverb.wet'` row of the loading table becomes 0.1–0.6; `spawnSystem.test.ts:745–762` pin the new
band and the `() => 1` oracle becomes `reverbSend: 0.6`; the AUDIO_SYSTEM.md sends paragraph and grid footnote ² follow.
(The Robot Effect Sends phase will move this row into a per-robot send table; this task only changes the value.)

**Acceptance criteria:**
- [ ] RED: the band pin fails at 0.4 and passes at 0.6; sends stay on the 1 % grid.

**Verification:** `npx vitest run src/systems/spawnSystem.test.ts src/data/globalAudioLoadingRanges.test.ts`.
**Dependencies:** none. **Scope:** XS.

### Task 6: Compressor (row 16) — after Decision 2

**Description:** If Decision 2 says "deliberate", record that and skip. If it says "measure": a headless-Chrome offline
render in the scratchpad (DARK_EFFECT_BYPASS.md §8.1's method and tooling notes), one seeded world with a lit, busy
fleet, rendered twice, the band's worst case (threshold −55, ratio 20, attack 0.003, release 0.3, knee 1) against
threshold 0 dB, compared by RMS and peak in dB; record both numbers and the limiter's gain reduction here, then
**STOP for Crawford**. If he says "retune": pin and move the two bands (−36 to −18, 2–6), grid rows 64–65, inventory.

**Acceptance criteria:**
- [ ] The measurement (if run) is recorded in §7 with the probe's command line and the world's `?session=` payload name.
- [ ] If retuned: the table test pins the new bands; seeded `threshold` is still an integer.

**Verification:** as T1. **Dependencies:** T0 Decision 2. **Scope:** S, or M with the probe.

### Task 7: The docs sweep

**Description:** Everything in §4 "The living docs" not already touched by T1–T6: the three specs' dated "Retuned"
lines, the themes idea lines 26–28, the loading table's header comments as a whole, the inventory's section 1 law note,
and a one-paragraph entry in `docs/todo/roadmap.md` under the Audio Palette series header (50) saying the Classic
bands were retuned on this date and pointing at this file. The sends intent already cites this plan.

**Acceptance criteria:**
- [ ] `npm test` green including `src/docs`; `npm run build:types`; `npm run lint`; `npm run build`.
- [ ] A grep for each old band string (`0.05–0.15`, `0.2–0.5`, `0.15–0.4`, `2–8 ms`, `20–500`, `−40 to −10`, `0–1 s`
  for preDelay) finds only history (specs' as-built notes, the inventory's dated law note) and no live claim.

**Dependencies:** T1–T6. **Scope:** S.

### Checkpoint A: Automated

`npm test`, `npm run build:types`, `npm run lint`, `npm run build` all green on the branch; one commit per task.

### Checkpoint B: Crawford's listen — **STOP**

Desktop, then the Pixel if he wants: a handful of fresh Attenuation Styles, listening for (a) a lit Chebyshev or
BitCrusher world that is now audible, (b) a lit Vibrato that reads as vibrato and not chorus, (c) the AutoWah sweeping
rather than sitting open, (d) the Chorus reading as chorus, (e) a bass robot keeping its low end with the new HPF band,
(f) the Shifter's narrow band, (g) if retuned, the Compressor. Anything he vetoes reverts in one commit per row, with the
grid and the table moved together. Record his words in §7.

### Checkpoint: Complete

The branch is his to PR. The sends spec (`spec-driven-development` on `docs/intent/robot-effect-sends.md`) starts from
the merged tables.

## 6. Risks

- **A raised floor makes an existing saved world louder? No.** Seeds only; saved sessions and share links restore their
  own values (`withGlobalAudioDefaults`, the setters). Only fresh worlds change, which is pre-v1 policy.
- **Row 13's re-measurement.** The sync draws are uniform, so 0.75 should realise within a point; if the held-out set
  disagrees by more than 5 points, the draw key is not uniform and that is a bug to find, not a tolerance to widen.
- **Row 14's clamp reaches a session that saved `preDelay` 0.6.** It loads at 0.25 and the slider shows 0.25; accepted.
- **Decision 2 measured on the wrong world.** Use a world with a lit AutoWah and two or three loud robots, not a dark
  one; the compressor's behaviour depends on the input level, which is the whole question.

## 7. As built

**T1 (2026-10-21), the undisputed band moves.** Ten seed bands moved (rows 1, 2 and 5–12 are ten fields, not the
"twelve" the T1 description says): `vibrato.wet` 0.85–1, `vibrato.depth` 0.03–0.12, `autoWah.wet` 0.35–0.5, `phaser.wet`
0.3–0.4, `chorus.wet` 0.3–0.4, `tremolo.wet` 0.35–0.5, `frequencyShifter.wet` 0.25–0.35, `filterHPF.frequency` 20–120,
`autoWah.sensitivity` −20 to −5, `chorus.delayTime` 6–15. Changed: the table and its header comments, its test (the
by-value pins plus the audible-floor, vibrato, HPF-below-C4, sensitivity, chorus-length and shifter-band tests), the
seed test's literal-number sweeps (3 000 styles), `GLOBAL_CHAIN_GRID.md` (ten rows and footnote ⁴) and the inventory's
ten seedMin/seedMax cells.

Two departures from the plan as written:
- **The seed oracles do pin moved fields.** §4 said no test pins an exact seeded value of a field this plan moves; the
  two `seed oracle` cases in `globalAudioSeed.test.ts` do (HPF frequency, AutoWah sensitivity, Phaser, AutoWah, Chorus and
  Tremolo wets, Chorus delayTime, Vibrato depth), so the T1 criterion "`globalAudioSeed.test.ts` passes unchanged" did not
  hold. They were amended by hand, not re-recorded, as that file's own header describes: the raw draws read, the new band
  formula applied and the value quantised onto the grid; the old bands run over the same draws reproduced every old oracle
  value, which is the check. The derivation is a dated note above the oracle `describe`. **T2 and T4 will move more
  oracle values** (the colour wets, and none for T4), and T3 moves none (Sync odds draw from keys the oracle already
  holds, but check Tremolo: its `syncMode` t 0.0794 stays under both 0.5 and 0.75).
- **The "reaches both ends of the band" wah test** asserted `< 0.24` and `> 0.46`; it now asserts `< 0.38` and `> 0.47`
  for the 0.35–0.5 band.

Verification: `npm test` 379 files / 13 404 tests, `npm run build:types`, `npm run lint` (0 errors; 4 existing warnings in
`gemShape.tsx`).

**T2 (2026-10-21), colour bands, Decision 1 = B.** `COLOUR_LOAD_MIX_MAX` 0.25 → 0.35; `distortion.wet` 0.2–0.3,
`chebyshev.wet` and `bitCrusher.wet` 0.25–0.35 (the last two are written as the constant, so the ceiling and their tops
cannot drift apart; the table test pins them by literal value). Tests: the ceiling is held at 0.35 by value and no band
tops out above it; no lit colour floor is below −24.5 dB; Chebyshev and Bit Crusher share one band; the seeder sweep
(3 000 styles) holds every colour Mix to ≤ 0.35 and every lit one to its floor. Docs: grid rows 25/27/29 and footnote ³,
the inventory's three cells and the ceiling note, `AUDIO_SYSTEM.md:264`, `themes.md:26`, the table's comments. The two
seed oracles moved by hand again (alpha `bitCrusher.wet` 0.13 → 0.33, theta `chebyshev.wet` 0.08 → 0.28), derived in a
dated note above them.
- **A reversal to flag:** Global Colour T14 had Crawford's "keep those ones lower" (Chebyshev and Bit Crusher below
  Distortion). Row 4 as accepted puts them *above* Distortion (0.25–0.35 against 0.2–0.3), so the old "gentler than
  Distortion" test was replaced, not kept. Say so at the listen if it should be the other way round.
- **Float noise at the top edge.** A seed on the 0.35 edge is `35 * 0.01 = 0.35000000000000003`, one ulp over the
  ceiling; the in-band assertions take `+ 1e-9`, as the pedal ones already do. The seeder's arithmetic is unchanged.

Verification: `npm test` 379 files / 13 405 tests, types clean, lint 0 errors.
