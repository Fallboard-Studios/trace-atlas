# Phase Spec: Output Headroom — No Clipping Out of the Box

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Level gate (§5.2): `npm run perf:level` against a served build (`npm run build && npx vite preview --port 4173`)
> - Audio-thread cost (§5.3): `npm run perf:audio`, same build, same sitting
> - Phone gate (§5.4): the `?debug` HUD on the Pixel 8, Full, 3:00 hands off

Source of intent: [docs/intent/output-headroom.md](../intent/output-headroom.md) (confirmed 2026-10-23 via
`interview-me`, five questions, every guess confirmed). Roadmap
[54](../todo/roadmap.md#54-output-headroom-no-clipping-out-of-the-box), Stage 1 of [plan.md](../todo/plan.md): built
alone, first, on its own branch off `main`. Backlog 23 is decided here (not built; §7) and nothing else rides along.

Survey basis (2026-10-23, against `main` at `5307a0cf`; every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:182`) constructs the Compressor at
  `:183` (`threshold −18, ratio 6, attack 0.003, release 0.15`; Tone's default `knee 30` is kept) and the Limiter at
  `:233` (`threshold −12`), both overwritten by the store's seeded values once the chain exists; `_masterGain` at `:398`
  is the last `Gain` made. `wireGlobalFxChain` (`:481`) builds the dry chain from one `chainNodes` array ending
  `nodeSpan(_globalCompressor), cellSpan('stereoWidener'), nodeSpan(_globalLimiter)`, connects the last span's tail to
  `_masterGain` (`:513`), which goes `toDestination`, then joins the five rooms' returns at the Compressor's input
  (Natural Decay) or the Width cell's `in` (Controlled Decay) (`:530`). `disconnectAllFxNodes` (`:412`) is a literal
  list ending `_globalCompressor, ...cellNodes('stereoWidener'), _globalLimiter, _masterGain`, walked backwards.
  `getToneCtor` (`toneHelpers.ts:33`) resolves every optional constructor by name and returns `undefined` headless.
- **Where a robot's level is set.** `reserveVoice` takes the robot's `masterVolume` slider position (0..1) through
  `volumePositionToGain` (`volumeTaper.ts:17`: 0 is silence, 1 is exactly unity, a 40 dB exponential taper between) as
  the initial value of its bus `Gain` (`AudioEngine.ts:822`, and `:893` on the stub-bus fallback path);
  `updateRobotMasterVolume` (`:1126`) ramps the same gain to `volumePositionToGain(masterVolume)` over
  `VOLUME_RAMP_SECONDS`. Three write sites, one function. The bus is `composite.output → panner → busGain
  → busFilter`, and the five room sends tap off the bus filter, **after** the bus gain
  (`docs/AUDIO_SYSTEM.md` Signal Graph), so the bus gain scales a robot's dry and wet contributions alike. Fresh
  robots seed `masterVolume` in `[0.65, 0.85]` (`spawnSystem.ts:170`), about −14 to −6 dB through the taper.
- **The master slider cannot boost.** `MASTER_VOLUME_SCHEMA` (`Header.tsx:31`) is 0–100 %, and
  `setMasterVolume` (`globalFx.ts:690`) clamps to `[0, 1]` on a `Gain` whose unity is 1. The header slider can
  only cut; what "makes up" a quieter world is the device's own volume.
- **The taps and the HUD.** `attachOutputTaps` (`:634`) builds two native `AnalyserNode`s (fftSize 32768) only under
  `?debug`: `pre` on the EQ3's output (`connectTap(_globalEQ, …)`, `:629`) and `master` on `_masterGain`'s (`:630`).
  `audioDiagnostics.ts:292` reads both every 500 ms through `measureLevel` (peak and RMS of the window); `hudLines.ts:86`
  prints `out <peak> rms <rms>  pre <peak>  fin <ok|NaN!>` in dB (`peakToDb`, `audioHealth.ts:374`). `pre` therefore
  reads **after** the robot bus gains and the EQ, and `out` reads **after** the master volume slider.
- **The measurements this spec answers to** (roadmap 54, taken on `feature/robot-effect-sends` at `0de3fc06`, world
  `56c2t2t8` at (−116, −2), fresh, headless Chrome, 150 HUD readings a side): `out` peaks +2.2 to +3.4 dB, above 0 dBFS
  in 11–22 % of readings; `pre` peaks +12 to +13 dB, mean +1.6 to +2.3 dB; the EQ in that world boosts +3.5 / +3.5 /
  +1.9 dB and the twelve robots sit at Volume 0.70–0.81. With the three effect-room Returns at 0 the clip rate was the
  same, so the rooms added in 50.7 are not the cause. Not measured on `main`; §5.2's first run is that measurement.
- **Why the output is hotter than the fleet.** Web Audio's `DynamicsCompressorNode` (what `Tone.Compressor` and
  `Tone.Limiter` both wrap) applies a fixed **makeup gain** that depends only on its curve: the gain that would bring a
  0 dBFS input back towards full scale, raised to the 0.6 power. Ignoring the knee, that is about
  `0.6 × (|T| − |T| / R)` dB for threshold `T` and ratio `R`: **+18 dB** at the seeded band's deep end (−36 dB, 6:1)
  and **+5.4 dB** at its shallow end (−18 dB, 2:1), a 12.6 dB spread, which is the "about 11 dB" loudness swing the
  Classic Band Retune found between seeds (roadmap archive `:2455`). The makeup is static, so a transient that passes
  during the attack time (3–50 ms seeded) is lifted by the full makeup, uncompressed. `Tone.Limiter`
  (`node_modules/tone/build/esm/component/dynamics/Limiter.js:28–31`) is the same node at `ratio 20, attack 0.003,
  release 0.01`, with the default `knee 30`, so at the seeded −3 to −1 dB its knee starts 15 dB lower and it is a soft
  compressor from about −16 dB up, not a ceiling; at −17 dB (Crawford's session) its makeup alone is about +10 dB.
  Nothing in the chain today bounds the output at all: the browser's own hard clip at ±1.0 is the only ceiling.
- **Tone 15.1.22 has the ceiling node.** `Tone.WaveShaper` (`signal/WaveShaper.d.ts`) wraps the native
  `WaveShaperNode`: a curve over the input range [−1, 1] (inputs beyond it are clamped to the curve's ends by the
  node), `oversample` settable, and `Tone.Gain` is already required by the chain. Neither needs a new dependency.
- **The harness.** `scripts/perf/audio-load.mjs` is the CDP template: a fresh Chrome per run, `Page.navigate`, click
  `button[aria-label="Power on"]`, warm-up, then poll `WebAudio.getRealtimeData` and
  `document.querySelector('.audio-debug-hud')?.textContent` every 500 ms; its pure parsing lives in
  `audio-load-lib.mjs` with a `.test.mjs` beside it. Its `--world name:x:y` builds `?seed=&x=&y=`, which the app
  stopped reading on 2026-09-28 (`docs/PERFORMANCE.md:52`): a world is pinned by a `?session=` share link
  (`sessionShareUtils.ts:494`), which also carries global-audio and robot overrides, so a "pushed hot" variant of a
  world is just another link.

**Assumptions** (each a veto point; the plan's T0 confirms them with Crawford before T1):

1. **Two fixed pieces, no third.** A constant **headroom trim** on every robot's bus gain, and a **soft ceiling** at
   the end of the chain. The seeded Compressor and Limiter are left as they are: same ranges, same setters, same
   drawer rows. Nothing new is stored, seeded, saved, shared or shown (intent).
2. **The trim is on the robot bus, not a node at the chain entry.** *A deviation from the intent's wording ("a fixed
   trim into the chain") with the outcome it asked for; Crawford confirms at T0.* The rooms are fed from each bus
   ahead of the chain entry and rejoin after it, so a `Gain` at the entry would trim the dry fleet and leave five room
   returns untrimmed: every world's dry/room balance would move by the trim, up to 12 dB wetter. A constant folded
   into the bus gain trims each robot's dry and sends equally, so every balance in the graph (dry to room, room to
   room, Compressor to returns) stays what the seed and the user set; only the level moves. Mechanism: one helper,
   `robotBusGain(position) = volumePositionToGain(position) × HEADROOM_TRIM_GAIN`, used at the bus gain's two write
   sites; `volumePositionToGain` itself is untouched (the master slider shares it and must keep unity at 1).
3. **`HEADROOM_TRIM_DB` is −12 dB** (gain ≈ 0.251), the figure the +12 to +13 dB `pre` peaks ask for. Not seeded,
   not a setting, one exported constant in `headroom.ts`. *As decided at T7 (Crawford, 2026-10-23):* the spec first
   tuned it until `pre` peaked at or under −6 dBFS on every gated world; at −12 dB D1, D4 and D5 still peaked at +1.8,
   +2.9 and −3.6 dB, and the 2 dB steps would have landed near −22 dB, about twice the intent's "roughly 6–10 dB"
   quieter. −12 dB is held and `pre` is recorded, not gated: `pre` above 0 clips nothing in a float chain, and the
   ceiling bounds what leaves.
4. **The ceiling is a `Tone.WaveShaper` soft clipper, after the Limiter and before `_masterGain`.** Its curve is the
   identity up to a knee `CEILING_KNEE` (start 0.7, about −3 dBFS) and a `tanh` saturation above it that never reaches
   1.0 (`softCeilingCurve`, §1.2): a true ceiling with no makeup gain and no release time, bit-exact below the knee so
   a signal that never reaches it is untouched, and odd-symmetric so it adds no DC. `oversample: 'none'` to start
   (the phone pays per sample, and the shaper only works on peaks); `'2x'` is the fallback if Checkpoint A hears
   aliasing on the loudest peaks. Position: after the Limiter so the user's Limiter and its makeup are inside the
   ceiling; before `_masterGain` so the master slider stays the last stage and the `out` tap reads the ceiling's
   output. Rejected: a compensated `Tone.Limiter` as the ceiling (20:1 still passes attack overshoot, its knee is
   30 dB wide, and its makeup would have to be cancelled by a value the browser computes but does not expose).
5. **The Compressor's makeup gain is not compensated in this phase.** It is why deep-seeded worlds are loud (survey),
   and a compensating `Gain` would need the browser's exact curve, which the spec does not normatively fix. The trim
   lowers what reaches it, the ceiling bounds what leaves it, and if Checkpoint A hears a deep world pumping against
   the ceiling the remedy is a narrower seeded Compressor band (an intent-sanctioned spec tuning), recorded in
   `GLOBAL_AUDIO_LOADING_RANGES` and `GLOBAL_CHAIN_GRID.md`, not a new node.
6. **"Quieter" means the device makes it up.** The intent said the header slider makes up the lost level; the header
   slider tops out at unity (survey), so it cannot. The master gain is not given headroom above 1 (that would be a
   boost into the ceiling the user can reach by accident). Crawford confirms at T0 that a quieter default, made up on
   the device, is still the answer.
7. **Headless and failure paths, as every node before.** The ceiling is built behind `getToneCtor('WaveShaper')`;
   absent or throwing, the chain runs Limiter → masterGain as today with one `devWarn`. The trim is a number and has
   no failure path.
8. **The gate is a number and the sign-off is an ear.** §5.2's probe is the gate (`out` never above 0 dBFS); Crawford's
   desktop listen (Checkpoint A) and the Pixel (Checkpoint B, §5.4) sign off. The probe is checked in under
   `scripts/perf/` with its pure parsing unit-tested, like `audio-load.mjs`.
9. **Backlog 23 is not built**, and its text gains one line: multiband is worth trying only if the single Compressor
   sounds wrong once it is off safety duty (intent). Plan.md's Stage 1 line for 23 is rewritten to say it was
   interviewed and deferred.
10. **No docs guards, no source scans** (CLAUDE.md "Tests exercise code, not text"). The tests in §5.1 import what they
    check.

---

## 1. Overview & Claude Explanation

The fleet's sum arrives at the chain some 12 dB too hot, and nothing after it is a ceiling: the Compressor and the
Limiter both add fixed makeup gain, and the only thing stopping the output is the browser clipping at full scale. This
phase pulls every robot's bus down by one constant so the sum sits below 0 dBFS with room for the EQ, and ends the
chain with a shaper that cannot output a sample at or above full scale. Both are constants in the engine. The seeded
dynamics stay the user's; they just stop being the last line.

### 1.1 The chain after this phase

```text
Per robot:  composite.output → panner → busGain (= taper(Volume) × TRIM) → busFilter ─┬─ dry ──► entry cut
                                                                                      └─ five sends ──► rooms ──► returns ─┐
Global dry chain:                                                                                                          │
  entry cut → EQ3 → LPF → HPF → filter cut → [AutoWah] → [Phaser] → [Tremolo] → [Vibrato] →                                │
      Compressor → [StereoWidener] → Limiter → ceiling (WaveShaper) → masterGain → Destination                             │
  Natural Decay:    returns rejoin at the Compressor's input  ◄───────────────────────────────────────────────────────────┤
  Controlled Decay: returns rejoin at the Width cell's input  ◄───────────────────────────────────────────────────────────┘
  `?debug` taps:    pre = EQ3 output (post-trim, post-EQ)      out = masterGain output (post-ceiling, post-slider)
```

### 1.2 The two constants and the curve

```ts
// src/engine/audioEngine/headroom.ts
import { volumePositionToGain } from './volumeTaper';

/** Fixed trim on every robot bus, so twelve robots at the seeded Volumes sum below 0 dBFS with room for the EQ.
 *  Tuned once by `npm run perf:level` (docs/specs/OUTPUT_HEADROOM.md §5.2); not seeded, not a setting. */
export const HEADROOM_TRIM_DB = -12;
export const HEADROOM_TRIM_GAIN = 10 ** (HEADROOM_TRIM_DB / 20);

/** A robot's live bus gain for a Volume slider position: the shared taper, then the trim. The master slider uses
 *  the taper alone and keeps unity at 1. */
export function robotBusGain(position: number): number {
  return volumePositionToGain(position) * HEADROOM_TRIM_GAIN;
}

/** Below the knee the ceiling is the identity; above it a tanh that approaches, and never reaches, full scale. */
export const CEILING_KNEE = 0.7;
export const CEILING_CURVE_LENGTH = 4097; // odd, so index (n−1)/2 is exactly x = 0

export function softCeiling(x: number, knee: number = CEILING_KNEE): number {
  const a = Math.abs(x);
  if (a <= knee) return x;
  const room = 1 - knee;
  return Math.sign(x) * (knee + room * Math.tanh((a - knee) / room));
}

export function softCeilingCurve(length: number = CEILING_CURVE_LENGTH, knee: number = CEILING_KNEE): Float32Array {
  const curve = new Float32Array(length);
  for (let i = 0; i < length; i++) curve[i] = softCeiling((2 * i) / (length - 1) - 1, knee);
  return curve;
}
```

With `knee 0.7`, an input of 1.0 leaves at 0.93 (−0.65 dBFS) and the node clamps any larger input to that value, so
the output never reaches full scale. The linear region is exact under the node's linear interpolation whatever the
curve length.

### 1.3 Where the engine changes

- `globalFx.ts`: a module-scope `_ceiling: Tone.WaveShaper | null`, built in `buildGlobalFxChain` from
  `getToneCtor('WaveShaper')` with `{ curve: softCeilingCurve(), oversample: 'none' }`; `nodeSpan(_ceiling)` after
  `nodeSpan(_globalLimiter)` in `chainNodes`; listed between `_globalLimiter` and `_masterGain` in
  `disconnectAllFxNodes`. The taps, the join, the cells, every setter: untouched.
- `AudioEngine.ts`: `reserveVoice`'s initial bus gain (both the real and the stub-bus path) and
  `updateRobotMasterVolume`'s ramp target call `robotBusGain(masterVolume)` instead of
  `volumePositionToGain(masterVolume)`; the taper import leaves the file. Nothing else reads the bus gain.

---

## 2. Target File Structure

```text
src/engine/audioEngine/
├── headroom.ts                     NEW   HEADROOM_TRIM_DB/GAIN, robotBusGain, CEILING_KNEE, softCeiling, softCeilingCurve
├── headroom.test.ts                NEW   the curve's and the trim's properties (§5.1)
├── globalFx.ts                     EDIT  the ceiling node: build, chain slot, disconnect list
├── globalFx.test.ts                EDIT  chain-order tests gain the ceiling; absent-constructor case
├── globalFx.headless.test.ts       EDIT  `WaveShaper: undefined` in the headless mock
src/engine/
├── AudioEngine.ts                  EDIT  three bus-gain write sites call robotBusGain
├── AudioEngine.test.ts             EDIT  bus gain = taper × trim at reserve and on a Volume edit
scripts/perf/
├── output-level.mjs                NEW   the level probe (§5.2), CDP plumbing mirrored from audio-load.mjs
├── output-level-lib.mjs            NEW   parseOutputFromHud, summarizeLevels, pure
├── output-level-lib.test.mjs       NEW
package.json                        EDIT  "perf:level": "node scripts/perf/output-level.mjs"
docs/
├── AUDIO_SYSTEM.md                 EDIT  Signal Graph diagram + a "Headroom" paragraph; the API list is unchanged
├── reference/GLOBAL_CHAIN_GRID.md  EDIT  chain order gains "→ ceiling"; a footnote for the trim
├── PERFORMANCE.md                  EDIT  "Output level series — npm run perf:level" + the gate table (§5.2)
├── todo/roadmap.md                 EDIT  54 as-built, Open list closed
├── todo/backlog.md                 EDIT  23's one-line note (assumption 9)
├── todo/plan.md                    EDIT  Stage 1 lines
├── todo/scratchy-audio-phones.md   EDIT  the Pixel section (§5.4)
```

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. No change to `volumeTaper.ts`, `globalAudioSeed.ts`, the seed or loading ranges
  (unless assumption 5's remedy is invoked at Checkpoint A, then only `GLOBAL_AUDIO_LOADING_RANGES`'s two Compressor
  rows and the grid), `audioStore.ts`, `sessionDiff.ts`, `sessionShareUtils.ts`, `audioRigConfig.ts`, `src/content/`,
  or anything under `src/components/` beyond none at all. The HUD line does not change.
- **CLAUDE.md:** the ceiling and the trim are engine nodes and constants; no synth in a component, no timeline, nothing
  in Zustand, no AudioParam write from a GSAP callback. The bus-gain ramp is `rampOrSet` as today (a de-click on the
  audio clock, not musical timing).
- **No new dependency.** `Tone.WaveShaper` and `Tone.Gain` ship with Tone 15.1.22.
- **The probe runs only against a served build**, foreground, one Chrome at a time, orphan check before and after
  (`docs/PERFORMANCE.md` "Measurement hygiene"). It never commits a world: links go in the docs table.
- **Pre-v1:** every world gets quieter by design; no compatibility shim, no off-by-default.

---

## 4. Code Style & Architecture Conventions

The ceiling follows the Limiter's own construction and guard, verbatim in shape:

```ts
// src/engine/audioEngine/globalFx.ts, inside buildGlobalFxChain(), after the Limiter
const WaveShaperCtor = getToneCtor<Tone.WaveShaper>('WaveShaper');
if (WaveShaperCtor) {
  try {
    // The output ceiling (docs/specs/OUTPUT_HEADROOM.md §1.2): identity below CEILING_KNEE, a tanh above it that never
    // reaches full scale. The last stage before the master gain, so the user's Limiter and its makeup sit inside it.
    _ceiling = new WaveShaperCtor({ curve: softCeilingCurve(), oversample: 'none' });
  } catch (err) {
    _ceiling = null;
    devWarn('[AudioEngine] the output ceiling could not be constructed; the chain runs without it', err);
  }
}
```

- Module-scope `_ceiling` beside `_globalLimiter`, reset to `null` where the other nodes are.
- Constants exported from `headroom.ts` in SCREAMING_CASE with a one-paragraph comment each, the house style of
  `OUTPUT_TAP_SIZE` and `VOLUME_TAPER_DB_RANGE`.
- Pure functions (`softCeiling`, `softCeilingCurve`, `robotBusGain`) take every tunable as a defaulted parameter so the
  tests can pin properties without the constants.
- The probe script mirrors `audio-load.mjs`: `parseArgs`, a `HELP` block, the fresh-profile Chrome, `--url` for the
  served build; pure parsing in the `-lib.mjs`.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first, one task each)

- `headroom.test.ts`: `softCeiling` is the identity for `|x| ≤ knee`; strictly increasing on [−1, 1]; odd
  (`f(−x) = −f(x)`); continuous at the knee (`f(knee) === knee`, `f(knee + ε) − knee < ε`); `|f(x)| < 1` for every
  `x` in [−1, 1] and `f(1) ≈ knee + (1 − knee)·tanh(1)`. `softCeilingCurve` has `length` entries, `curve[(n−1)/2] === 0`,
  ends at `±f(1)`, and is a `Float32Array`. `robotBusGain(1) === HEADROOM_TRIM_GAIN`, `robotBusGain(0) === 0`, and
  `robotBusGain(p) === volumePositionToGain(p) × HEADROOM_TRIM_GAIN` for a few positions. `HEADROOM_TRIM_GAIN`
  equals `10 ** (HEADROOM_TRIM_DB / 20)` and is below 1.
- `globalFx.test.ts` (the `vi.mock('tone')` factory gains a `WaveShaper` spy with `connect`/`disconnect`/
  `toDestination`, toggled absent by a flag like `toneFlags.phaserAbsent`): the dry-chain order test at `:4706` and
  its Controlled twin assert `Limiter → ceiling → masterGain`; the constructor receives a `curve` of
  `CEILING_CURVE_LENGTH` and `oversample: 'none'`; `disconnectAllFxNodes`' order test at `:533` includes the ceiling
  between master and Limiter; with the constructor absent the chain wires `Limiter → masterGain` and warns once; a
  throwing constructor does the same; the `out` tap still hangs off `_masterGain` (`:4954`'s neighbour).
- `globalFx.headless.test.ts`: `WaveShaper: undefined` added to the mock; the existing "builds and rewires both ways
  without throwing" covers it.
- `AudioEngine.test.ts`: `reserveVoice` with `masterVolume: 0.8` sets the bus gain to `robotBusGain(0.8)`, not
  `volumePositionToGain(0.8)`; `updateRobotMasterVolume(id, 1)` ramps to `HEADROOM_TRIM_GAIN`, not 1. Fixtures use a
  non-default Volume (the parity-fixture rule).
- `output-level-lib.test.mjs`: `parseOutputFromHud` reads `out 1.2dB rms -14.0dB  pre -5.1dB  fin ok` into numbers,
  returns `null` for `-` and `-Infinity` for `-inf`; `summarizeLevels` gives per-tap max, mean, and the fraction of
  readings at or above 0 dB.

### 5.2 The level gate — `npm run perf:level`

The probe loads one `?session=` link per variant in a fresh Chrome, powers on, waits a warm-up (default 8 s), then
reads the HUD's output line every 500 ms for `--seconds` (default 120, 240 readings) and prints per tap: peak max, peak
mean, RMS mean, and the share of readings at or above 0 dBFS. Flags: `--url <served build with ?session=…>` (one
or more, comma-separated, run in turn), `--seconds`, `--warmup`, `--json`, `--chrome`, `--port`, `--help`. It records
the HUD's `fin` token and fails the run on `NaN!`.

**Variants** (the links are built from the live stores on the dev server, T3's recipe, and pasted into the PERFORMANCE.md
table so the gate is reproducible; the master slider at 100 % in every one). A link never carries robot Volume
(`masterVolume` is not in a session payload), so H1 and H2 run with the probe's `--robot-volume-full`, which sets every
robot to 100 % through the All Probes form before the warm-up (§7, 2026-10-23):

| Variant | World | Settings |
|---|---|---|
| D1–D5 | `56c2t2t8` (−116, −2), `charlie` (200, −30), `alpha` (12, 68), `delta` (5, −180), `bravo` (−150, 90) | fresh, seeded defaults |
| H1 | `56c2t2t8` | every robot Volume 100 %, EQ low/mid/high +12 dB, Limiter threshold 0 dB |
| H2 | `bravo` | the same hand push |

**Gate, each run 120 s after warm-up, three runs for D1 (the measured world) and one for the rest:**

| Reading | Threshold |
|---|---|
| `out` peak max, every variant | ≤ −0.5 dBFS (the ceiling's own top is −0.65; a reading above it means the ceiling is not last) |
| `out` readings ≥ 0 dBFS, every variant | 0 of N |
| `pre` peak max, D1–D5 | recorded, not gated (assumption 3, as decided at T7; it was ≤ −6 dBFS, the trim's tuning target) |
| `pre` peak max, H1–H2 | recorded, not gated (the hand push is the ceiling's test, not the trim's) |
| `fin` | `ok` throughout |

**Order of runs.** (1) `main`, D1 and D5, before any code: the "is it new" measurement the roadmap asked for, three
runs of D1. (2) The branch with the trim alone (ceiling constructor absent via a one-line local edit, not committed):
`pre` drops by the trim; `out` still over 0 on D1 says the ceiling is needed, not optional. (3) The branch complete:
the table above. (4) ~~If `pre` misses on any of D1–D5, step `HEADROOM_TRIM_DB` by 2 dB and re-run (3)~~ (dropped at
T7, assumption 3); the value and the table go in PERFORMANCE.md with the commit hash and the links.

### 5.3 Audio-thread cost, desktop

`npm run perf:audio` on D5 (`bravo`, the heavy world; `--url` with its link, 240 s), `main` against the branch in the
same sitting, interleaved. Recorded, gated loosely: the branch's overall mean capacity within +0.02 of `main`'s (a
`WaveShaper` at `oversample: 'none'` is one table lookup per sample; a rise beyond that points at `'2x'` having been
left on, or at something else).

### 5.4 Phone gate — Checkpoint B

Pixel 8, Full, 3:00 hands off, the `?debug` HUD, `bravo`'s D5 link: `main` first in the same sitting, then the branch,
HUD `underruns` at 3:00 written down for both, plus Crawford's word on whether the loudest moments crunch. Passes when
the branch's count is within the baseline's band and the crunch is gone. A miss on underruns is bisected by the one
node this phase adds: ceiling absent (local edit) on the phone.

### 5.5 Checkpoints

- **Checkpoint A** (after T8, before the docs): Crawford listens on the desktop to D1 and H1 with the full chain,
  and to the ceiling's knee (0.7 against 0.6 and 0.8 by a local edit) if the loudest peaks sound coloured. Any of
  assumption 4's `'2x'`, assumption 5's narrower Compressor band, or a different knee is decided here and recorded.
- **Checkpoint B:** §5.4.
- **Verification steps** for every task: `npm run build:types`, `npm run lint`, `npx vitest run <file>`, then the full
  `npm test` before the PR.

---

## 6. Git & Workflow Context

- **Branch:** `feature/output-headroom` off `main` at or after `5307a0cf`. Nothing else on it; an investigation that
  wanders beyond this phase goes in the backlog and waits (the finish-the-branch rule).
- **Commits:** one per task, short imperative sentences; the intent, this spec and the plan committed first, together.
- **PR:** Crawford opens it; the description links this spec's §5.2 table in PERFORMANCE.md and the §5.4 Pixel section.
- **Roadmap:** 54 stays the number; its entry gains an as-built paragraph and its four Open items close (the 50.7
  question is moot since PR #570; the −17 dB Limiter question is answered by assumption 6's T0; the `main` measurement
  is §5.2 step 1; the probe is `scripts/perf/output-level.mjs`).

---

## 7. Open Questions

**T0, 2026-10-23: Crawford confirmed all five as written** ("for phase 0 your assumptions are fine"). The trim goes
on the robot bus; a quieter default is made up on the device; knee and oversample are Checkpoint A's; the deep
Compressor band narrows only if Checkpoint A hears it; backlog 23 is deferred, not built.

1. **Assumption 2's placement** (bus, not chain entry) is a wording deviation from the intent with the intent's outcome.
   Crawford's yes at T0, or the chain-entry `Gain` plus five matching return trims instead.
2. **Assumption 6:** the header slider cannot make up the lost level; the device does. Still fine?
3. **The knee and the oversample** are Checkpoint A's by ear; the spec starts at 0.7 and `'none'`.
4. **Assumption 5:** whether a deep-seeded Compressor band (−36 dB, 6:1, about +18 dB makeup) is narrowed in this phase
   or left for a listen after merge. The spec's default is: only if Checkpoint A hears it.
5. **Backlog 23** stays open, deferred, one line added (assumption 9). No build.

**T3, 2026-10-23: H1 and H2's robot Volume push.** A `?session=` link cannot carry it (`masterVolume` is excluded from
the payload by design) and the production build exposes no store. Crawford chose the probe pushing it through the app's
own controls (`--robot-volume-full`: All Probes → Levels → Volume, End key), over accepting the EQ and Limiter push
alone or running H on the dev server. Checked in PERFORMANCE.md "Output level series".

**T7, 2026-10-23: the gate stopped on an `out` miss, and two answers.** H1 on the complete build read `out` +2.7 dB,
40 of 239 readings at or over 0 dBFS, the same as the build without the ceiling: the ceiling had no curve. Tone
15.1.22's `WaveShaper` takes its curve as `mapping` (or through the `curve` setter) and ignores a `curve` option, and
a native `WaveShaperNode` with no curve passes its input unchanged; the T5 mock accepted the wrong name (the plan's
risk table named it). (1) Crawford: fix it as T5.1, test first, then re-run T7 in full. (2) `pre` missed −6 dBFS on
D1, D4 and D5 at −12 dB; Crawford took the recommendation to hold −12 dB and record `pre` rather than gate it
(assumption 3 rewritten, §5.2's row changed) rather than step the trim toward −22 dB.
