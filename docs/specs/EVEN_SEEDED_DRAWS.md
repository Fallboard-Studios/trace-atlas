# Spec: Even Seeded Draws — every audio value a world seeds is an even, independent draw

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`
> - The measurement (§5.2): a temporary `src/utils/zzSpread.test.ts` run as
>   `ZZ_OUT=<scratch>/spread.json npx vitest run src/utils/zzSpread.test.ts`, deleted before every commit

**Status:** spec written 2026-11-01, for Crawford's review. The first step (step 0) of refining the themes and aspects:
the draws get fixed before any band is tuned, because every band so far was heard through the draws described below.
Recorded as backlog [47](../todo/archive/backlog-archive.md#47-audio-seeded-draws-are-welded-and-centre-heavy--even-draws-first) on
branch `fix/even-seeded-draws`. The world and visual draws have the same problem and are backlog
[46](../todo/archive/backlog-archive.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement), on
their own branch, because they may need their own tuning. Plan:
[docs/tasks/EVEN_SEEDED_DRAWS.md](../tasks/EVEN_SEEDED_DRAWS.md).

Crawford's decisions (2026-11-01):

1. Every **audio** draw goes even, and the world and visual draws are backlogged (46).
2. Switch first, then listen to Classic as written, and narrow only what sounds wrong. The old spread was an
   accident, not a choice.
3. Even everywhere, except the centred set: the EQ bands, panning and any detuning stay centred (Crawford,
   2026-11-01, on this spec). Those draw from the centred draw (§1.2), and any other band that should sit in the middle
   gets narrower.
4. Overlap rule for the refinement that follows: the aspect wins (today's replace rule). Not this spec's concern.
   "Any detuning" (Crawford, 2026-11-01, asked to clarify): the robot LFO detune depth stays close to no detune, so it
   joins the centred set, folded to peak at its floor (§1.2). Vibrato and the frequency shifter are not in it and stay
   even.
5. §7's three questions are answered as recommended (Crawford, 2026-11-01): swells come as the Frequency control
   promises, copied robots at 30 %, Motif Length off and Note Variance off at 15 % each.

---

## 1. Overview

### 1.1 What is wrong today

`getSeededVal(noiseMap, dataId, offset, min, max)` ([getSeededVal.ts](../../src/utils/getSeededVal.ts)) samples the
world's simplex noise at `(alea(dataId)(), offset)` and maps `[-1, 1]` linearly onto the band. Simplex noise is a
smooth landscape, and every key's x is a hash in `[0, 1]`, so every key reads the same small, smooth patch of one
field. Measured on Classic over 3,000 worlds × 12 robots and 3,000 Attenuation Styles (2026-11-01):

- **Welded keys.** Keys whose hashes land close together read nearly the same value. Of 1,128 robot key pairs, 621
  correlate above 0.3 and 217 above 0.9. Examples: decay ↔ the layer-0 gain LFO's on/off (r 1.0), accent filter ↔
  master volume (1.0), glider ↔ rhythmic density (0.999), sustain ↔ density (0.996). Of 2,278 global key pairs
  (everything still on the plain draw), 1,294 correlate above 0.3 and 640 above 0.9. For example, EQ low, mid and
  high, the master filter's Q, the delay time and the compressor attack all move as one (r 1.0). Under the even draw,
  zero pairs reach 0.3 in either set.
- **Coarse.** Each global key reads offset 0 only, and the noise there depends on a handful of lattice gradients, so a
  key takes a few dozen to a few hundred values across all worlds. Some take only 3: `compressor.knee`,
  `chebyshev.order`, `pingVarianceAutomation`, `lfoBank.b.rateDrift`, `lfoBank.c.rateDrift`, `lfoBank.c.syncMode`,
  `lfoBank.d.depthDrift`, `globalLfo.eq3.low.depth`, `globalLfo.eq3.high.depth`, `globalLfo.hpf.Q.quiet` (never
  quiet in 3,000 worlds). Robots read offsets 0–11 and fare better: about 3,500–5,600 distinct values per key over
  36,000 robots (`robot.noteVariance.active` 1,342; the melody seed, `robot.compositionSeed`, 5,464).
- **Centre-heavy.** The outer tenth at each end of a band together get 0–8 % of robot draws instead of 20 %
  (`robot.dynamics` 0.6 %, `robot.audio.filterFreq` 1.5 %). Most plain global keys get 0 %.
- **Thresholds don't mean their numbers.** A share edge compared against a plain draw realises something else (table
  in §1.4). Some were fitted to the bell, and some were never fitted and silently realise a third of what they say.

The even draw, `getUniformSeededVal` (three samples at offset + 0, 137.42 and 911.77, hashed through `alea()`), is
already in use for the modulation pedals, the robot sends, humanize, the LFO lanes, the stations and the aspect deal.
On the same runs it gives about 2,990 of 3,000 distinct values per global key and about 35,000 of 36,000 per robot key,
with every tenth of the band at 9.7–10.9 %.

### 1.2 What changes

Every in-scope draw (§1.3) moves from `getSeededVal` to `getUniformSeededVal` **with the same dataId and the same
offset**, so a draw stays named and placed exactly as before and only its distribution changes. `getUniformSeededVal`
gains the `min` / `max` parameters `getSeededVal` has (defaults 0 and 1) so a call site changes only its function
name. Every threshold compared against an in-scope draw is reset per §1.4. Code comments that record bell-curve
calibrations are rewritten to say the edge is the share.

**The centred set.** The values whose centre is neutral keep a middle lean, without the welding or the coarseness:

| Field | Band | Where |
|---|---|---|
| `eq3.low`, `eq3.mid`, `eq3.high` | ±6 dB | globalAudioSeed.ts (`sampleField`) |
| `robot.audio.detune` | ±5 cents | spawnSystem.ts |
| `robot.audio.layer.detune` | ±2 cents | robotFieldDerivation.ts |
| `robot.lfo.layer0/1/2.detune.depth` | the `robot.lfoDetuneDepth` window, 1–10 %, **folded to peak at the floor** (below) | spawnSystem.ts (`generateRobotLfoLinks`); only the depth of a lit link, not its on-roll or lane |

They use a new `getCentredSeededVal(noiseMap, dataId, offset, min, max)` in getSeededVal.ts: the mean of two
independent even draws (`dataId` and `${dataId}.centre`, same offset), mapped onto the band. That is a triangle
peaking at the band's middle. Its 5th–95th percentile spans 0.16–0.84 of the band, about what today's draw gives the
robots (0.15–0.85), and each outer tenth gets about 2 % of draws. It has thousands of values and no welding.

The LFO detune depth has no negative side: its neutral is the window's floor, 1 %, the smallest audible wobble (the
never-zero floor). So its draw is the centred draw over −1 to 1, folded:
`min + |getCentredSeededVal(map, id, offset, -1, 1)| × (max − min)`. That is the same triangle, peaking at "no
detune". Over 1–10 % the mode is 1 %, the median about 3.6 %, about 19 % of lit links land at 1.9 % or less, and about
1 % land above 9.1 %. No new function: one line at the call site.

**Amended at T8 (Crawford, 2026-11-01): floored onto the whole-percent grid.** A depth is stored as a whole percent,
and rounding the folded value gives the 1 % floor only half a bucket (raw 1–1.5): 1 % would hold 10.8 % of lit detune
links and 2 % would be the commonest (19.8 %). So the fold lands on the grid with a floor instead:
`min + min(max − min, floor(|getCentredSeededVal(map, id, offset, -1, 1)| × (max − min + 1)))`. Over 1–10 %, 1 % is
the commonest depth (about 19 % of lit detune links), each percent above it rarer (17, 15, 13 … %), 10 % the rarest
(about 1 %), and the median is 3 %. It lives in spawnSystem.ts as `detuneLinkDepth`.

Panning needs nothing: no pan is seeded, and every robot spawns at centre on Auto (spawnSystem.ts, ROBOT_PAN.md
§1.1). The per-note velocity draws already use `performanceRoll`, apart from a noise fallback with no note position,
which is out of scope.

### 1.3 Scope: the audio draws

In scope, every plain `getSeededVal` call that seeds sound:

| File | Draws |
|---|---|
| [robotFieldDerivation.ts](../../src/systems/robotFieldDerivation.ts) | the envelope (four stages, both curves' `.shaped` and `.which`), the melody fields (density, the two toggles' `.active`, pitch repeat), the voice (accent roll, cutoff, Q, filter type, the waveform pick, each layer's quiet roll, gain, detune and phase), and the Reverb and Delay sends (`deriveSendFields`: both depths and both quiet rolls; added at T9a, Crawford, 2026-11-02) |
| [spawnSystem.ts](../../src/systems/spawnSystem.ts) | portamento (glider roll and time), register, phase, detune, pulse width, the robot LFO links (quiet, lane, depth), copy chance and copy source, dynamics, rests, accents, master volume, `robot.compositionSeed`, in **both** paths: `generateRobotAudioBaseline` and `spawnRobot`'s own copy |
| [globalAudioSeed.ts](../../src/utils/globalAudioSeed.ts) | every `sampleField` still on the plain draw (compressor, EQ, both filters, delay, reverb, limiter, the three colour nodes): `sampleField` loses its `uniform` flag and always draws even. Also delay sync mode and note, the colour character, ping variance, swell frequency and duration, the LFO Bank (rate, shape, both drifts, sync mode and note per lane), and the global LFO links (quiet, depth) |
| [bpmSeed.ts](../../src/utils/bpmSeed.ts) | the tempo |
| [audioSwells.ts](../../src/systems/audioSwells.ts) | every per-measure roll: the triggers, the target picks, the direction tiebreak, the peaks, the rise/fall split, the company chance, pick, attribute and direction |
| [robotSystems.ts](../../src/systems/robotSystems.ts) | `robot.pitchDrift`, the docked melody re-roll |

Out of scope (backlog 46): names, identity colours, gem seeds, ids, company count, size, membership and colour, spawn
positions, the roster's active count and docked batteries (`lifecycleSim.ts` and `spawnSystem.ts`'s copy), factory
placement, districts, terrain, light shafts, locale temperature. Some of those are smooth walks on purpose (terrain, the
temperature steps) and 46 sorts which.

### 1.4 Thresholds

Rule: **an edge becomes its intended share.** Where a comment or spec names a target the edge was fitted to, the edge
becomes the target. Where a number was written and never fitted, the written number is the intent and stays, so it
starts to mean what it says.

| Edge | Today | Realises today | Becomes | Why |
|---|---|---|---|---|
| `robot.portamento` lit | 0.23 | 13.1 % | **0.125** | fitted to "about 1.5 in 12" |
| `robot.shapedAttack` lit | 0.21 | 16.8 % | **0.155** | fitted to 15.5 % |
| `robot.shapedRelease` lit | 0.275 | 15.5 % | **0.15** | fitted to 15.3 % |
| `robot.accentFilterFreq` lit | 0.27 | 20.2 % | **0.2** | fitted to "about 2.4 in 12" |
| robot LFO gain / detune lit | 0.3 | 19–27 % (mean 22.6) | **0.25** | fitted to "25 % on" |
| robot LFO bus lit | 0.2 | 16.1 % | **0.135** | fitted to 13.6 % |
| `LFO_BANK_SYNC_ODDS` a / b / c / d | 0.6 / 0.62 / 0.33 / 0.33 | 74 / 65 / 33 / 24 % | **0.75 / 0.66 / 0.33 / 0.25** | fitted to FREE_SYNC_TOGGLE's targets |
| `COLOUR_CHARACTER_BANDS` | 0.3065 / 0.5 / 0.6935 / 1 | 25 / 25 / 26 / 24 % | **0.25 / 0.5 / 0.75 / 1** | fitted to 25 % each |
| `ACCENT_BANDPASS_SHARE` | 0.4 | 36.7 % | 0.4 | written coin |
| `robot.layerGain` lit | 0.5 | (coin) | 0.5 | written coin |
| `DELAY_SYNC_ODDS` | 0.66 | 67.4 % | 0.66 | written, already true |
| global `LFO_QUIET_THRESHOLD` | 0.34 | 0–34 % (hpf.Q 0 %) | 0.34 | written "~34 %" |
| motif / variance `offShare` | 0.15 | 4.6 / 5.3 % | 0.15 | written "15 %", **audible**: robots with Motif Length or Note Variance off triple |
| `robot.copyChance` edge | 0.30 | 19.2 % | 0.30 | written, never fitted, **audible**: more copied robots |
| `delaySend` lit (quiet under 1 − lit) | 0.75 | 17–18 % quiet | 0.75 | written "about a quarter of the fleet draws no delay", never fitted, **audible**: robots with no delay 17 % → 25 % (T9a) |
| swell trigger (`frequency / 16`) | 0.125–0.5 | 3–4 % at 0.125, 10–13 % at 0.25, 50 % at 0.5 | unchanged formula | **audible**, Open Question 1 |
| `SWELL_COMPANY_CHANCE` | 0.15 | 3.9 % | 0.15 | written placeholder |

Theme and aspect `lit` values (themes.ts, aspects.ts) are placeholders, re-tuned in the refinement that follows, and
are not reset here.

### 1.5 What Crawford will hear

Every world and every share link sounds different (pre-v1, no keep-the-sound constraint). A saved session keeps its
edits, while its unedited values move with the new baseline. Under Classic:

- Bands fill. Sine and pulse waves go from about 6.5 % of robots each to 20 %, the extreme registers come up, and
  dynamics, rests and accents spread across their whole bands instead of sitting mid-band. This overrides
  ROBOT_PERFORMANCE assumption 13's wanted middle lean, per decision 3.
- Robot traits stop travelling in pairs: a glider is no longer always a sparse robot.
- The Audio Rig stops moving as one block. The EQ, filters, delay and compressor vary independently from world to
  world. The three EQ bands, the detunes and a lit detune LFO's depth still sit near neutral (the centred set), each on
  its own draw.
- The minority traits keep their heard shares, per §1.4.
- Four written shares start to mean what they say: Motif Length off and Note Variance off (5 % → 15 % of robots
  each), copied robots (19 % → 30 %), robots with no delay send (17 % → 25 %) and company swells (4 % → 15 %).
- Swells start more often at low Frequency settings (Open Question 1).

---

## 2. Target File Structure

```text
src/utils/getSeededVal.ts            getUniformSeededVal gains min/max; new getCentredSeededVal
src/systems/robotFieldDerivation.ts  draws -> even
src/systems/spawnSystem.ts           draws -> even (both paths), threshold comments
src/utils/globalAudioSeed.ts         draws -> even, sampleField loses `uniform`, LFO_BANK_SYNC_ODDS, COLOUR_CHARACTER_BANDS
src/utils/bpmSeed.ts                 draw -> even
src/systems/audioSwells.ts           draws -> even
src/systems/robotSystems.ts          pitchDrift -> even
src/data/bands/classic.ts            the lit edges of §1.4 and their comments
(+ each file's colocated tests)
docs/PROCEDURAL_GENERATION.md        Sampling Values + Gotchas: audio draws are even; getSeededVal is for walks and the
                                     backlog-46 draws
docs/AUDIO_SYSTEM.md                 the band table: a band's edges are reached, a lit is the share
docs/todo/backlog.md                 46, 47
```

---

## 3. Boundaries

- **Always:** keep every dataId and offset as it is; change both robot paths together (`generateRobotAudioBaseline`
  and `spawnRobot`); one commit per task, RED first for every behaviour task.
- **Ask first:** changing a band's numbers (that is the listen's job, after this ships); a cache or any other
  performance change, unless §5.3's measure calls for it; anything in backlog 46's list.
- **Never:** change `getSeededVal` itself (terrain, placement and the world draws still use it); tune themes or aspects
  here; assert on source or doc text.

---

## 4. Code Style

```ts
// before
const rests = Math.round(getSeededVal(noiseMap, 'robot.rests', spawnCount, restsBand.min, restsBand.max));
// after - same dataId, same offset, same band
const rests = Math.round(getUniformSeededVal(noiseMap, 'robot.rests', spawnCount, restsBand.min, restsBand.max));
```

---

## 5. Testing & Verification

### 5.1 Tests (exercise code, never text)

- `getUniformSeededVal` with `min` / `max` lands in `[min, max)`, and with defaults is unchanged (the existing
  stations, sends and deal values don't move).
- `getCentredSeededVal` lands in `[min, max)`, its median is the band's middle, and each outer tenth gets about 2 %.
- Per generator, over N seeded worlds (the generators themselves, imported and run): every even field reaches both
  outer tenths of its band at roughly 10 % each, every centred field sits as above, and no two of a generator's fields
  correlate above 0.15.
- Each §1.4 edge realises its share within a tolerance over N worlds.
- Live spawn and the baseline replay still agree (the existing parity tests, re-run).
- Existing tests that pin bell-era numbers (realised shares, distinct counts, calibration sets, fixed seeded values)
  are updated to the new behaviour, never deleted to get green.

### 5.2 The measurement

The `zzSpread` harness re-runs on the branch head. Before and after tables go into the plan's record: distinct counts,
outer-tenth shares, correlated pairs and threshold shares.

### 5.3 Cost

`getUniformSeededVal` hashes four times where `getSeededVal` hashes once. Time `generateRobotRosterBaseline` (12
robots) and `generateWorldSeedBaseline` before and after, because the deal, `rederiveLoading`, the session diff and
Keep's dirty check regenerate them. Recorded, not gated, unless one grows past a frame (16 ms) on the desktop, in which
case memoising `precomputeDataX` is the first fix (Ask first).

### 5.4 Crawford's checkpoints

1. Listen to Classic on even draws across a few worlds, with the `?debug` overlay open for swells and underruns.
2. Narrow only what sounds wrong, as Classic band edits on this branch, one task each.

---

## 6. Success Criteria

- No in-scope call site uses `getSeededVal`. Tests prove the even fields fill their bands, the centred set leans to
  its middle, and every field is independent.
- Every §1.4 edge realises its share.
- The full suite, lint, types and build are green.
- The harness's after-table is recorded.
- Crawford has listened to Classic and passed it, with any narrowing he asked for.

---

## 7. Open Questions

Answered 2026-11-01, all three as recommended (decision 5). Kept for the record:

1. **Swell rate.** The trigger chance per tick is `Frequency / 16`, so the Frequency control promises about
   *Frequency* swell starts a measure, up to the concurrency cap. Today it delivers about a third of that at the low
   end (0.125 fires 3–4 %). Even draws make it true. The options:
   - (a) Keep the formula and let swells come as promised. **Recommended:** the control then means what it says.
     Swells were tied to desktop pops (backlog 39), so this is the first thing to watch at checkpoint 1.
   - (b) Recalibrate the formula to keep today's heard rate.
2. **Copy chance.** 30 % as written, or keep the heard ~20 %? Recommended: 30 % as written, judged at the listen.
3. **Motif / variance off.** 15 % as written, or keep the heard ~5 %? Recommended: 15 % as written, judged at the
   listen.
