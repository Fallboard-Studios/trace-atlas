# Slider Values

Every slider-controlled attribute in the Global Audio Rig view (`AudioRigDrawer.tsx`) and the
Robot Detail view (`RobotScreen.tsx` — `AudioSettingSection`, `PingControlsDrawer`,
`PingContourDrawer`, `SignatureArrayDrawer`). Sources: `src/data/audioRigConfig.ts`,
`src/data/robotOptionsConfig.ts`, `src/components/ui/controls/LfoLink.tsx` for the schema/UI
columns; `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioLoadingRanges.ts`,
`src/utils/globalAudioSeed.ts`, `src/systems/spawnSystem.ts`, `src/utils/bpmSeed.ts` for the
Load Min/Max columns (what a fresh seed/spawn can actually generate the attribute at, distinct
from the Min/Max the slider itself lets you drag to).

Excludes `RobotDisplaySection`'s Battery readout — a read-only `SliderLinear` display, not a
control the user drags. LFO Link Depth gets one row covering every linkable field (7 robot
targets + 7 global targets, `docs/tasks/LFO_BANK.md`, `docs/specs/ROBOT_ARTICULATION.md`), rather than one row per `lfoTarget` — Lane
is a picker with no numeric range, so it has no row here. The LFO Bank's own 4 lanes (Shape, Rate,
Rate Drift, Depth Drift — one row per lane, since each lane seeds its own rate band) replace what
used to be one shared Rate/Depth/Shape row plus a separate 4-drift-group section — see the two LFO
sections at the bottom.

**Step column note:** only `SliderLinear` has a real numeric `step` in its schema (`src/types/
controls.ts`) — when the config omits it, `SliderLinear.tsx` defaults to `step={1}` (confirmed in
source, not assumed). `SliderLog` and `SliderCenteredZero` have **no `step` field in the type at
all** — their granularity comes from the voxel-track's fixed box count against a log/zero-anchored
curve, not a flat numeric increment. Both cases are marked `—` below, with a note where relevant.

**Load Min/Max column note:** this is the range a *seeded/spawned* value can land in, sampled via
`getSeededVal`/`scaleUnitValue` as a continuous float across that range. As of
`SEEDED_SLIDER_VALUE_QUANTIZATION` and a follow-up integer-rounding pass, every field with a real,
declared numeric `step` — on the *generation* side, `GLOBAL_AUDIO_SEED_RANGES`/`quantizeToStep`
call sites, not necessarily the UI schema (see Compressor/Limiter below) — is now quantized onto
that field's own grid at generation time (`quantizeToStep`, `src/utils/math.ts`): EQ3, Delay
Time/Feedback/Wet, Reverb Pre-Delay/Wet, Compressor Ratio/Threshold/Knee, Limiter Threshold, LFO
Rate and Depth (both global-chain and robot-level), Rate Drift/Depth Drift (all 4 groups),
Signature Array Gain, Signature Array Detune (all 3 oscillators), Automatic Effects (Ping Variance
Automation), and Volume — rounded to a whole dB/Hz/percent/cent as appropriate to each field's own
unit. Fields that only fall back to `SliderLinear`'s *implicit* default step of `1` with no
generation-side step declared either (marked `⁶` below — Density, Pitch Repeat, Sustain) remain
**not** covered — they still seed a continuous float with no rounding. BPM, Motif Length, Note
Variance, Octave Range, and the integer-floored Phase were already correctly aligned before this
pass, for unrelated reasons noted at each row.

---

## Global Audio Rig View

### 3-Band EQ

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Low | Centered Zero | dB | -12 | 12 | .5 | -6 | 6 |
| Mid | Centered Zero | dB | -12 | 12 | .5 | -6 | 6 |
| High | Centered Zero | dB | -12 | 12 | .5 | -6 | 6 |

### Low-Pass Filter

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Frequency | Log | Hz | 20 | 20000 | — | 2000 | 20000 |
| Resonance (Q) | Log | — | 0.1 | 20 | — | 0.1 | 5 |

### High-Pass Filter

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Frequency | Log | Hz | 20 | 20000 | — | 20 | 120 |
| Resonance (Q) | Log | — | 0.1 | 20 | — | 0.1 | 5 |

### Delay

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Time¹⁶ | Linear | s | 0 | 10 | 0.001 | 0.05 | 0.5 |
| Feedback | Linear | — | 0 | 0.95 | 0.01 | 0 | 0.4 |
| Amount¹ | Linear | — | 0 | 1 | 0.01 | — | — |

¹ Amount (`delay.wet`, labelled "Delay Amount") is the Delay room's **return level** since Robot Sends (roadmap
50.2), not a mix: how loud the whole room is, as heard from every robot; `0` silences it. It is not seeded any
more (every world loads `1`, and the old ~25 % quiet roll, `DELAY_QUIET_THRESHOLD`, was deleted from
`globalAudioSeed.ts`), so it has no load range. The old `[0, 0.3]` band and its quiet roll moved to each robot's own
Delay send, see Robot Detail View → Audio Setting.
¹⁶ Time has a **Free | Sync** mode (`docs/specs/FREE_SYNC_TOGGLE.md`). The row above is Free. In Sync
the same slider steps through note values instead (`allowedDelayNoteValues(bpm)`, `tempoSync.ts` —
the `NOTE_VALUES` entries, `src/data/noteValues.ts`, whose duration at the current tempo falls inside
`0–10` s, shortest to longest; the readout is the note's name, no unit), so Min/Max/Step above don't
apply. A fresh seed rolls Sync with `DELAY_SYNC_ODDS` (`globalAudioSeed.ts`, 66%) and draws the note
from the Load range `0.05–0.5` s at the style's tempo; the Free `delayTime` is still sampled as in the
row, and kept underneath.

### Reverb

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Decay | Log | s | 0.1 | 10 | — | 0.5 | 4 |
| Pre-Delay | Linear | s | 0 | 0.25 | 0.01 | 0 | 0.1 |
| Amount²² | Linear | — | 0 | 1 | 0.01 | — | — |

²² Amount (`reverb.wet`, labelled "Reverb Amount") is the Reverb room's **return level**, as Delay's above: not
seeded (every world loads `1`), no load range. The old band, now `[0.1, 0.6]` (widened from `[0.1, 0.4]` by the Classic
Band Retune), seeds each robot's own Reverb send.

### Compressor

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Threshold | Linear | dB | -60 | 0 | 1² | -36 | -18 |
| Ratio | Linear | — | 1 | 20 | 1 | 2 | 6 |
| Attack | Log | s | 0.001 | 0.2 | — | 0.003 | 0.05 |
| Release | Log | s | 0.01 | 1 | — | 0.05 | 0.3 |
| Knee | Linear | dB | 0 | 40 | 1² | 1 | 15 |
| Decay Mode | Radio, not a slider | — | — | — | — | — | — |

² No `step` in the *schema* — `SliderLinear.tsx`'s default of `1` applies, same as before. Unlike
most no-schema-step fields, though, the *generation* side (`GLOBAL_AUDIO_SEED_RANGES['compressor.
threshold']`/`['compressor.knee']`, `src/data/globalAudioSeedRanges.ts`) now declares its own
`step: 1` independently of the UI schema — `sampleField` (`globalAudioSeed.ts`) quantizes against
it, so both Threshold and Knee's seeded load value is a whole dB now, matching the slider's
implicit step by coincidence of both being `1`.

### Limiter

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Threshold | Linear | dB | -20 | 0 | 1² | -3 | -1 |

² No `step` in the *schema* — defaults to `1`. Same as Compressor Threshold/Knee above: `GLOBAL_
AUDIO_SEED_RANGES['limiter.threshold']` declares its own `step: 1` on the generation side, so the
seeded load value is a whole dB now.

### Transport & Composition

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Tempo | Linear | BPM | 20 | 200 | 1 | 40 | 100³ |
| Humanize | Linear | ms | 0 | 20 | 1 | 2²⁴ | 6²⁴ |
| Automatic Effects | Linear | % | 0 | 100 | 1 | 33 | 66⁴ |

²⁴ Robot Performance (roadmap 50.5): `audioStore.humanize`, whole milliseconds (`HUMANIZE_MIN_MS`–`HUMANIZE_MAX_MS`,
`HUMANIZE_SCHEMA`). Seeded once per session by `generateHumanize` over `HUMANIZE_SEED_RANGE` (2–6) with a **uniform** draw
(`getUniformSeededVal`) quantised to 1 ms, so it is step-aligned, then carried forward across Attenuation Style switches like
the swell fields. `setHumanize` truncates to whole ms and pushes `AudioEngine.setHumanize`.

³ Sourced from the *Attenuation Style's* own seed (`BPM_SEED_RANGE`, `generateAttenuationStyleBpm`,
`bpmSeed.ts`), not the locale — it moved off the locale with the Free | Sync toggle
(`docs/specs/FREE_SYNC_TOGGLE.md` §1.7), so it reseeds on an Attenuation Style change and a
coordinates-only move leaves it alone. Explicitly `Math.round()`-ed before storage, so this one is
correctly step-aligned.
⁴ Sampled once as a continuous fraction (`PING_VARIANCE_AUTOMATION_SEED_RANGE`,
`globalAudioSeed.ts`), then quantized in percent-space (`quantizeToStep(raw * 100, 0, 1) / 100`)
before being converted back to a fraction — always lands on a whole percent now, matching the
slider's own `step: 1`.

---

## Robot Detail View

### Audio Setting

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Volume | Linear | % | 0 | 100 | 1 | 65⁵ | 85⁵ |
| Pan | Centered-zero | — | -100 | 100 | 1 | — | — |
| Reverb | Linear | % | 0 | 100 | 1 | 10²³ | 60²³ |
| Delay | Linear | % | 0 | 100 | 1 | 0²³ | 30²³ |
| Grit | Linear | % | 0 | 100 | 1 | 40²³ | 80²³ |
| Shimmer | Linear | % | 0 | 100 | 1 | 20²³ | 50²³ |
| Double | Linear | % | 0 | 100 | 1 | 30²³ | 60²³ |
| Dynamics | Linear | — | 0 | 100 | 1 | 25²⁵ | 75²⁵ |

²⁵ Robot Performance (roadmap 50.5): Dynamics, Rests and Accents are stored as the integer the slider shows
(`Robot.dynamics` / `rests` / `accents`, `PERFORMANCE_MIN`–`PERFORMANCE_MAX`, no conversion), seeded at spawn by plain draws
over `DYNAMICS_SEED_RANGE` (25–75), `RESTS_SEED_RANGE` (10–60) and `ACCENTS_SEED_RANGE` (20–80) and `Math.round`-ed, so all
three are step-aligned. `DEFAULT_DYNAMICS` is 50 (the pre-50.5 sound), `DEFAULT_RESTS` / `DEFAULT_ACCENTS` are 0; the seeds
never land on the defaults, so every fresh robot has some of each. None is a swell attribute.

²³ Reverb, Delay, Grit, Shimmer and Double are the robot's five **sends** into the shared rooms (Robot Sends, roadmap
50.2; Robot Effect Sends, roadmap 50.7), stored as `0..1` fractions (`Robot.reverbSend` / `delaySend` / `gritSend` /
`shimmerSend` / `doubleSend`) and displayed ×`SEND_DISPLAY_SCALE`. Seeded by `generateRobotSends` (`spawnSystem.ts`)
from one table, `ROBOT_SEND_LOADING_RANGES` (`src/data/robotSendLoadingRanges.ts`): a band and a `lit` share per send,
quantized in percent-space like Volume. Reverb is `0.1`–`0.6` on every robot (widened from `0.1`–`0.4` by the Classic
Band Retune, 2026-10-21). Delay is `0`–`0.3` and rolls under 1 − its `lit` share (`0.25`), landing exactly `0`, a robot
with no repeats at all, for about 17–18 % of robots, not a quarter, because the roll's noise sample is bell-curved.
Grit (`0.21`), Shimmer (`0.16`) and Double (`0.19`) are uniform rolls in that order, and a fresh robot carries at most
one of the three (`EXCLUSIVE_SEND_FIELDS`); the rest seed exactly `0`. All five are robot swell attributes (live only
while the send is above `0`).

Pan has no seed range, so no load range: a spawned robot is Auto at `0`. It is stored as a `-1..1` fraction
(`Robot.pan`, `PAN_MIN`/`PAN_MAX`) and displayed ×`PAN_DISPLAY_SCALE`, with no rounding step beyond the slider's
own `1`. While Auto is on the slider is a read-only readout of the engine's position-follow pan (`-0.5..0.5`,
so `-50..50` on screen); only with Auto off does it take the full `-100..100`.

⁵ Stored as a `0..1` fraction (`Robot.masterVolume`), seeded from `MASTER_VOLUME_MIN`/`MAX`
(`0.65`–`0.85`, `spawnSystem.ts`), then quantized in percent-space
(`quantizeToStep(raw * 100, 0, VOLUME_STEP_PERCENT) / 100`) before being converted back to a
fraction — same fix as Automatic Effects above, always lands on a whole percent now.

### Melody — Phrasing

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Density | Linear | % | 0 | 100 | 1⁶ | 0 | 100 |
| Motif Length | Linear | — | 0 | 8 | 1 | 0 | 8⁷ |
| Pitch Repeat | Linear | % | 0 | 100 | 1⁶ | 0 | 100 |
| Rests | Linear | — | 0 | 100 | 1 | 10²⁵ | 60²⁵ |
| Accents | Linear | — | 0 | 100 | 1 | 20²⁵ | 80²⁵ |

⁶ No `step` in the schema — defaults to `1`; both Density and Pitch Repeat seed a continuous float
across their full displayed range with no rounding.
⁷ Integer-valued by construction (`seedToggleValue`, `spawnSystem.ts`: `0` for "off," otherwise an
integer `1`–`8`) — correctly step-aligned, unlike Density/Pitch Repeat above.

### Melody — Frequency

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Octave Range Min | Linear | — | 1 | 7 | 1 | 1 | 7⁸ |
| Octave Range Max | Linear | — | 1 | 7 | 1 | 1 | 7⁸ |
| Note Variance | Linear | — | 0 | 8 | 1 | 0 | 8⁷ |

⁸ Selected as one of 5 fixed integer register tuples (`OCTAVE_REGISTERS`, `spawnSystem.ts`), never
a continuous draw — correctly step-aligned.
⁷ Same `seedToggleValue` mechanism as Motif Length above — correctly step-aligned.

### Ping Contour (shared ADSR envelope)

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Attack | Log | s | 0 | 2 | — | 0 | 2¹⁸ |
| Decay | Log | s | 0 | 2 | — | 0 | 2 |
| Sustain | Linear | % | 0 | 100 | 1⁶ | 0 | 100 |
| Release | Log | s | 0 | 2 | — | 0 | 2¹⁸ |
| Portamento | Log | s | 0 | 2 | — | 0 | 0.2¹⁹ |

⁶ No `step` in the schema — defaults to `1`. Stored as a `0..1` fraction, seeded continuously and
displayed ×100 with no rounding, same class as Density/Pitch Repeat/Volume above.
¹⁸ All three times share `ENVELOPE_TIME_MAX_SECONDS` (2 s) as the slider max and the top of the seed range, so a
seeded value is always one the slider can show. A stage with a non-linear shape (Attack Shape / Release Shape, below the
sliders) is seeded short from the same noise sample: `SHAPED_ATTACK_RANGE` 0.03–0.25 s and `SHAPED_RELEASE_RANGE`
0.15–0.8 s, so the shape finishes inside a 0.15 s note and can be heard. Decay has no shape.
¹⁹ Most robots load at exactly `0` (no glide). About 1.5 in 12 are gliders (`GLIDER_THRESHOLD`), seeded in
`PORTAMENTO_SEED_RANGE` 0.05–0.20 s and quantized to `0.01` (`PORTAMENTO_STEP`). The ceiling is 0.2 s because a longer
glide never lands on 16th notes; the slider still goes to 2 s, where it is a smear.

### Source — Filter (the robot bus filter)

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Cutoff | Log | Hz | 20 | 20000 | — | 400²⁰ | 8000²⁰ |
| Resonance | Log | Q | 0.1 | 20 | — | 1²¹ | 8²¹ |

²⁰ Seeded in two tiers (`generateAudioAttributes`): a common robot draws `OPEN_FILTER_FREQ_RANGE` 2000–8000 Hz, an
accent robot (`FILTER_ACCENT_THRESHOLD`, about 2.4 in 12) draws `ACCENT_FILTER_FREQ_RANGE` 400–2500 Hz, so the seeded
span is 400–8000 Hz. Not quantized: the slider has no step.
²¹ A common robot loads at `ROBOT_BUS_FILTER_Q` (1); an accent robot draws `ACCENT_FILTER_Q_RANGE` 3–8 quantized to
`0.1` (`FILTER_Q_STEP`). The Type radio has no range: lowpass for a common robot, bandpass for 40 % of accent robots
(`ACCENT_BANDPASS_SHARE`), never highpass.

### Source — Baseline (Layer 1)

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Baseline Gain | Linear | — | 0 | 2 | 0.01 | 0.2 | 1.2¹³ |
| Baseline Detune | Centered Zero | cents | -50 | 50 | —¹⁵ | -2 | 2 |
| Baseline Phase | Linear | degrees | 0 | 360 | 1⁶ | 0 | 360⁹ |
| Baseline Interval | Linear | — | 0 | 1 | 0.01 | — | —¹⁰ |

### Source — Coaxial (Layer 2)

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Coaxial Gain | Linear | — | 0 | 2 | 0.01 | 0¹¹ | 1.2¹³ |
| Coaxial Detune | Centered Zero | cents | -50 | 50 | —¹⁵ | -2 | 2 |
| Coaxial Phase | Linear | degrees | 0 | 360 | 1⁶ | 0 | 360⁹ |
| Coaxial Interval | Linear | — | 0 | 1 | 0.01 | — | —¹⁰ |

### Source — Harmonic (Layer 3)

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Harmonic Gain | Linear | — | 0 | 2 | 0.01 | 0¹¹ | 1.2¹³ |
| Harmonic Detune | Centered Zero | cents | -50 | 50 | —¹⁵ | -2 | 2 |
| Harmonic Phase | Linear | degrees | 0 | 360 | 1⁶ | 0 | 360⁹ |
| Harmonic Interval | Linear | — | 0 | 1 | 0.01 | — | —¹⁰ |

⁶ No `step` in the schema — defaults to `1`.
⁹ `Math.floor(getSeededVal(..., 0, 361)) || 0` — floored to an integer, so this one is
step-aligned; the `361` (not `360`) upper bound on the draw is a minor asymmetry but `Math.floor`
never actually produces `361` itself.
¹⁰ `pulseWidth` is never seeded per-layer at spawn (`spawnSystem.ts`'s `layerWave` object has no
`pulseWidth` field) — `SignatureArrayDrawer.tsx` falls back to a hardcoded `0.5` for every layer
until a user drags it (`layer.pulseWidth ?? 0.5`). `0.5` happens to be exactly on the `0.01` step
grid, so this isn't a live instance of the load-vs-step bug, just worth knowing it's never actually
seeded.
¹⁵ No numeric `step` in `SliderCenteredZero`'s *schema*, same as every other Centered Zero field —
but the *generation* side now rounds anyway: `spawnSystem.ts`'s per-layer `detune` draw is
quantized to a whole cent (`DETUNE_STEP = 1`), for all 3 layers (Baseline/Coaxial/Harmonic) alike.
¹¹ Coaxial/Harmonic each have a real ~50% chance (`LAYER_QUIET_THRESHOLD`) of loading at exactly
`0` (muted) instead of a sampled value in `[0.2, 1.2]` — Baseline (Layer 1) never mutes and always
samples the full `[0.2, 1.2]` range.
¹³ Quantized onto a `0.01` grid at generation time (`LAYER_GAIN_STEP`, `spawnSystem.ts`) — a muted
layer's `0` is never passed through this quantization, so it stays the literal `0` in every case.

---

## LFO Link Depth — applies to every linkable Gain/Detune/EQ/filter field

Every field marked `Has LFO: Yes` / `LFO?: X` (7 robot targets + 7 global targets,
`docs/tasks/LFO_BANK.md`) gets an identical `LfoLink` component instance
(`src/components/ui/controls/LfoLink.tsx`), reused verbatim regardless of which attribute it's
linked to. Lane is a `RadioButton` (5 options: Off + 4 lanes) with no numeric range — this table
only covers Depth, the one numeric control `LfoLink` renders. One row per field *group*, not one
per target — Shape/Rate/Rate Drift/Depth Drift all moved to the lane itself (next section).
**Every group gets its own load ceiling** (Crawford's own load-value tuning pass, 2026-10-02) —
there is no longer a single flat window shared across fields:

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Depth (Global chain — EQ) | Linear | % | 0 | 100 | 1⁶ | 5¹³ | 30¹³ |
| Depth (Global chain — LPF/HPF frequency) | Linear | % | 0 | 100 | 1⁶ | 5¹³ | 60¹³ |
| Depth (Global chain — LPF/HPF Q) | Linear | % | 0 | 100 | 1⁶ | 5¹³ | 40¹³ |
| Depth (Robot — Gain) | Linear | % | 0 | 100 | 1⁶ | 1¹² | 60¹² |
| Depth (Robot — Detune) | Linear | % | 0 | 100 | 1⁶ | 1¹² | 10¹² |
| Depth (Robot — Bus filter cutoff) | Linear | % | 0 | 100 | 1⁶ | 1¹² | 40¹² |

⁶ No `step` on Depth's *schema* — defaults to `1`. Like Compressor Threshold/Knee above, though,
the *generation* side now declares its own step independently of the UI schema: a mirrored
`LFO_DEPTH_STEP = 1` local to each of `globalAudioSeed.ts` and `spawnSystem.ts`, quantized against
`LFO_DEPTH_MIN` — Depth is a whole percent in both the global-chain and robot-level cases.
¹² **Robot-link Depth splits by field** — `spawnSystem.ts`'s `generateRobotLfoLinks` draws Gain
from `ROBOT_LFO_GAIN_DEPTH_SEED_RANGE` (`1`–`60`) and Detune from
`ROBOT_LFO_DETUNE_DEPTH_SEED_RANGE` (`1`–`10`) and the bus cutoff from `ROBOT_LFO_BUS_DEPTH_SEED_RANGE` (`1`–`40`),
all sharing the same `ROBOT_LFO_DEPTH_SEED_MIN` floor of `1`. The floor of `1`, not `0`, is deliberate on every field (robot and global alike): a
lit target (one that didn't roll quiet) is never seeded silently inaudible — a user may still drag
Depth to `0` by hand.
¹³ **Global-link Depth splits by group**, not one flat window — `globalAudioSeed.ts`'s
`generateGlobalLfoLinks` draws `eq3.*` targets from `GLOBAL_LFO_EQ_DEPTH_SEED_RANGE` (`5`–`30`),
`lpf.frequency`/`hpf.frequency` from `GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE` (`5`–`60`),
and `lpf.Q`/`hpf.Q` from `GLOBAL_LFO_FILTER_Q_DEPTH_SEED_RANGE` (`5`–`40`), all three sharing the
`GLOBAL_LFO_DEPTH_SEED_MIN` floor of `5`. All six ranges quantize to `LFO_DEPTH_STEP` at
generation time.

## LFO Bank — Shape, Rate, Rate Drift, Depth Drift (one row per lane)

`src/data/audioRigConfig.ts`'s `LFO_BANK_LANE_SCHEMAS` — the 4 shared lanes (`a`–`d`, user-facing
names Core/Companion/Accent/Overtone LFO) each get their own `RadioButton` (Shape) + `SliderLinear`
(Rate) + 2 `SliderCenteredZero`s (Rate Drift, Depth Drift), rendered in `LfoBankLanePanel`. Unlike
the old per-target design this replaced, **Rate's loading band differs per lane** — the four bands
are fixed, adjacent, and log-spaced, slow-to-fast by lane letter:

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Shape | Radio (triangle/sine/square/sawtooth) | — | — | — | — | all 4, front-weighted¹³ | all 4, front-weighted¹³ |
| Rate¹⁷ | Linear | Hz | 0 | 20 | 0.05 | lane a: 0.1, b: 0.4, c: 1.5, d: 4 | lane a: 0.4, b: 1.5, c: 4, d: 8 |
| Rate Drift | Centered Zero | % | -100 | 100 | —¹⁴ | -70 | 70 |
| Depth Drift | Centered Zero | % | -100 | 100 | —¹⁴ | -70 | 70 |

¹³ Shape is a weighted rotating-queue pick (`pickShape`, `src/utils/lfoShapeDraw.ts`, 2026-10-02),
not a loading-vs-full range split like the numeric fields above — all 4 shapes are reachable from a
fresh seed. Lane a draws first against the full queue `[sine, triangle, sawtooth, square]`, weighted
front-to-back `[1, 0.5, 0.25, 0.125]` (sine 53%/triangle 27%/sawtooth 13%/square 7% on lane a); the
picked shape moves to the back of the queue before the next lane draws, so a shape can repeat across
a world's 4 lanes, just less likely each time it's reused. Scoped to shape only — Rate/Rate
Drift/Depth Drift below are unaffected and stay keyed to lane, not shape.
¹⁷ Rate has a **Free | Sync** mode (`docs/specs/FREE_SYNC_TOGGLE.md`). The row above is Free. In Sync
the same slider steps through note values instead (`allowedLaneNoteValues(bpm)`, `tempoSync.ts` — the
`NOTE_VALUES` entries, `src/data/noteValues.ts`, whose rate at the current tempo falls inside `0–20`
Hz, slowest to fastest; the readout is the note's name, no unit), so Min/Max/Step above don't apply.
A fresh seed rolls Sync per lane with `LFO_BANK_SYNC_ODDS` (`globalAudioSeed.ts`; targets a 75%, b 66%,
c 33%, d 25% — the constants are calibrated per lane because a simplex draw isn't uniform) and draws
the note from the lane's own Load band at the style's tempo, falling back to the neighbouring bands
only if a band holds no note at that tempo. The Free `rate` is still sampled as in the row, and kept
underneath.
¹⁴ `SliderCenteredZero` still has no numeric `step` field in its *schema* — the UI slider's own
granularity is unchanged. The *generation* side now rounds anyway: each lane's `rateDrift`/
`depthDrift` (`generateLfoBankSettings`, `globalAudioSeed.ts`) quantizes to a whole hundredth in
this field's `-1..1` stored-fraction space (1% = `0.01`) within the `±0.7` `LFO_BANK_DRIFT_SEED_RANGE`
loading window — the same `±70%`/`±0.7` figure the 4-group Drift design this replaced also used.

Since `SliderCenteredZero` never had a numeric step to compare against, there's no "off the
slider's own grid" concern the way a `SliderLinear` field has — the whole-percent rounding above is
purely a generation-side choice, not driven by any UI step this field lacks.
