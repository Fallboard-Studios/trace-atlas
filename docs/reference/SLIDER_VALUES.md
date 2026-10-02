# Slider Values

Every slider-controlled attribute in the Global Audio Rig view (`AudioRigDrawer.tsx`) and the
Robot Detail view (`RobotOptionsTab.tsx` — `AudioSettingSection`, `PingControlsDrawer`,
`PingContourDrawer`, `SignatureArrayDrawer`). Sources: `src/data/audioRigConfig.ts`,
`src/data/robotOptionsConfig.ts`, `src/components/ui/controls/LfoLink.tsx` for the schema/UI
columns; `src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioLoadingRanges.ts`,
`src/utils/globalAudioSeed.ts`, `src/systems/spawnSystem.ts`, `src/utils/localeBpmSeed.ts` for the
Load Min/Max columns (what a fresh seed/spawn can actually generate the attribute at, distinct
from the Min/Max the slider itself lets you drag to).

Excludes `RobotDisplaySection`'s Battery readout — a read-only `SliderLinear` display, not a
control the user drags. LFO Link Depth gets one row covering every linkable field (6 robot
targets + 7 global targets, `docs/tasks/LFO_BANK.md`), rather than one row per `lfoTarget` — Lane
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
| Frequency | Log | Hz | 20 | 20000 | — | 20 | 500 |
| Resonance (Q) | Log | — | 0.1 | 20 | — | 0.1 | 5 |

### Delay

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Time | Linear | s | 0 | 10 | 0.001 | 0.05 | 0.5 |
| Feedback | Linear | — | 0 | 0.95 | 0.01 | 0 | 0.4 |
| Mix | Linear | — | 0 | 1 | 0.01 | 0¹ | 0.3 |

¹ Mix (`delay.wet`) has a ~25% seeded chance of loading at exactly `0` instead of a sampled value
in `[0, 0.3]` (`DELAY_QUIET_THRESHOLD`, `globalAudioSeed.ts`) — the one global effect a fresh
Attenuation Style can load silent.

### Reverb

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Decay | Log | s | 0.1 | 10 | — | 0.5 | 4 |
| Pre-Delay | Linear | s | 0 | 1 | 0.01 | 0 | 0.1 |
| Mix | Linear | — | 0 | 1 | 0.01 | 0.1 | 0.4 |

### Compressor

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Threshold | Linear | dB | -60 | 0 | 1² | -55 | -45 |
| Ratio | Linear | — | 1 | 20 | 1 | 10 | 20 |
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
| Automatic Effects | Linear | % | 0 | 100 | 1 | 33 | 66⁴ |

³ Sourced from the *locale's* own seed (`LOCALE_BPM_SEED_RANGE`, `localeBpmSeed.ts`), not the
Attenuation Style — and explicitly `Math.round()`-ed before storage, so this one is correctly
step-aligned.
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
| Attack | Log | s | 0 | 10 | — | 0 | 5 |
| Decay | Log | s | 0 | 10 | — | 0 | 5 |
| Sustain | Linear | % | 0 | 100 | 1⁶ | 0 | 100 |
| Release | Log | s | 0 | 10 | — | 0 | 5 |

⁶ No `step` in the schema — defaults to `1`. Stored as a `0..1` fraction, seeded continuously and
displayed ×100 with no rounding, same class as Density/Pitch Repeat/Volume above.

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

Every field marked `Has LFO: Yes` / `LFO?: X` (6 robot targets + 7 global targets,
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

⁶ No `step` on Depth's *schema* — defaults to `1`. Like Compressor Threshold/Knee above, though,
the *generation* side now declares its own step independently of the UI schema: a mirrored
`LFO_DEPTH_STEP = 1` local to each of `globalAudioSeed.ts` and `spawnSystem.ts`, quantized against
`LFO_DEPTH_MIN` — Depth is a whole percent in both the global-chain and robot-level cases.
¹² **Robot-link Depth splits by field** — `spawnSystem.ts`'s `generateRobotLfoLinks` draws Gain
from `ROBOT_LFO_GAIN_DEPTH_SEED_RANGE` (`1`–`60`) and Detune from
`ROBOT_LFO_DETUNE_DEPTH_SEED_RANGE` (`1`–`10`), both sharing the same `ROBOT_LFO_DEPTH_SEED_MIN`
floor of `1`. The floor of `1`, not `0`, is deliberate on every field (robot and global alike): a
lit target (one that didn't roll quiet) is never seeded silently inaudible — a user may still drag
Depth to `0` by hand.
¹³ **Global-link Depth splits by group**, not one flat window — `globalAudioSeed.ts`'s
`generateGlobalLfoLinks` draws `eq3.*` targets from `GLOBAL_LFO_EQ_DEPTH_SEED_RANGE` (`5`–`30`),
`lpf.frequency`/`hpf.frequency` from `GLOBAL_LFO_FILTER_FREQUENCY_DEPTH_SEED_RANGE` (`5`–`60`),
and `lpf.Q`/`hpf.Q` from `GLOBAL_LFO_FILTER_Q_DEPTH_SEED_RANGE` (`5`–`40`), all three sharing the
`GLOBAL_LFO_DEPTH_SEED_MIN` floor of `5`. All five ranges quantize to `LFO_DEPTH_STEP` at
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
| Rate | Linear | Hz | 0 | 20 | 0.05 | lane a: 0.1, b: 0.4, c: 1.5, d: 4 | lane a: 0.4, b: 1.5, c: 4, d: 8 |
| Rate Drift | Centered Zero | % | -100 | 100 | —¹⁴ | -70 | 70 |
| Depth Drift | Centered Zero | % | -100 | 100 | —¹⁴ | -70 | 70 |

¹³ Shape is a weighted rotating-queue pick (`pickShape`, `src/utils/lfoShapeDraw.ts`, 2026-10-02),
not a loading-vs-full range split like the numeric fields above — all 4 shapes are reachable from a
fresh seed. Lane a draws first against the full queue `[sine, triangle, sawtooth, square]`, weighted
front-to-back `[1, 0.5, 0.25, 0.125]` (sine 53%/triangle 27%/sawtooth 13%/square 7% on lane a); the
picked shape moves to the back of the queue before the next lane draws, so a shape can repeat across
a world's 4 lanes, just less likely each time it's reused. Scoped to shape only — Rate/Rate
Drift/Depth Drift below are unaffected and stay keyed to lane, not shape.
¹⁴ `SliderCenteredZero` still has no numeric `step` field in its *schema* — the UI slider's own
granularity is unchanged. The *generation* side now rounds anyway: each lane's `rateDrift`/
`depthDrift` (`generateLfoBankSettings`, `globalAudioSeed.ts`) quantizes to a whole hundredth in
this field's `-1..1` stored-fraction space (1% = `0.01`) within the `±0.7` `LFO_BANK_DRIFT_SEED_RANGE`
loading window — the same `±70%`/`±0.7` figure the 4-group Drift design this replaced also used.

Since `SliderCenteredZero` never had a numeric step to compare against, there's no "off the
slider's own grid" concern the way a `SliderLinear` field has — the whole-percent rounding above is
purely a generation-side choice, not driven by any UI step this field lacks.
