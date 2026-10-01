# Slider Values

Every slider-controlled attribute in the Global Audio Rig view (`AudioRigDrawer.tsx`) and the
Robot Detail view (`RobotOptionsTab.tsx` — `AudioSettingSection`, `PingControlsDrawer`,
`PingContourDrawer`, `SignatureArrayDrawer`). Sources: `src/data/audioRigConfig.ts`,
`src/data/robotOptionsConfig.ts`, `src/components/ui/controls/Lfo.tsx` for the schema/UI columns;
`src/data/globalAudioSeedRanges.ts`, `src/data/globalAudioLoadingRanges.ts`,
`src/utils/globalAudioSeed.ts`, `src/systems/spawnSystem.ts`, `src/utils/localeBpmSeed.ts` for the
Load Min/Max columns (what a fresh seed/spawn can actually generate the attribute at, distinct
from the Min/Max the slider itself lets you drag to).

Excludes `RobotDisplaySection`'s Battery readout — a read-only `SliderLinear` display, not a
control the user drags. LFO Rate/Depth/Shape and Rate Drift/Depth Drift each get one row
covering every attribute they modulate, per request, rather than one row per `lfoTarget` (13 robot
targets + 7 global targets) or per drift group (4 groups) — see the two LFO sections at the bottom.

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

## LFO Modulation (Rate/Depth/Shape) — applies to every LFO-enabled slider above

Every slider marked `lfoTarget` in `audioRigConfig.ts`/`robotOptionsConfig.ts` (all of 3-Band EQ,
Low-Pass/High-Pass Filter, and every Signature Array layer's Gain/Detune/Phase —
9 robot targets + 7 global targets total; Volume and Interval/pulse-width lost their LFO target,
docs/specs/LFO_LOAD_FIX.md) gets an identical `Lfo` component instance
(`src/components/ui/controls/Lfo.tsx`), reused verbatim regardless of which attribute it's
modulating. One row per field, not one per target:

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min (Global chain) | Load Max (Global chain) | Load Min (Robot) | Load Max (Robot) |
|---|---|---|---|---|---|---|---|---|---|
| Rate | Linear | Hz | 0 | 20 | 0.05 | 1 | 4 | 0 | 20¹² |
| Depth | Linear | % | 0 | 100 | 1⁶ | 20 | 50 | 0 | 100¹² |

⁶ No `step` on Depth's *schema* (`Lfo.tsx`'s `depthSchema`) — defaults to `1`. Like Compressor
Threshold/Knee above, though, the *generation* side now declares its own step independently of the
UI schema: a mirrored `LFO_DEPTH_STEP = 1` local to each of `globalAudioSeed.ts` and
`spawnSystem.ts`, quantized against `LFO_DEPTH_MIN` — Depth is a whole percent now in both the
global-chain and robot-level cases.
¹² **Robot-level LFO Rate/Depth sample the entire full/UI range with no narrower loading
sub-window at all** (`spawnSystem.ts`'s `generateRobotLfoSettings` uses `LFO_RATE_MIN`/`MAX` and
`LFO_DEPTH_MIN`/`MAX` directly) — unlike every global-chain field, which has its own narrower
`GLOBAL_AUDIO_LOADING_RANGES`/`LFO_RATE_LOADING_MIN`/`MAX` window. Both Rate (`0.05` step) and
Depth (`1` step, whole percent) are now quantized in both cases, via mirrored step constants local
to each of `globalAudioSeed.ts` and `spawnSystem.ts`. This was the exact mechanism behind the
originally reported bug: a robot's per-target Rate could seed anywhere in `[0, 10]` continuously
against a `0.25` step (e.g. `4.236`) — now fixed for both Rate and Depth at generation time; the
global-chain window is narrower (`[20, 50]` vs. the robot-level `[0, 100]` for Depth) but that only
ever affected how far off-grid an unrounded value could land, not whether it's rounded now.

## LFO Drift (Rate Drift / Depth Drift) — applies to all 4 drift groups

`src/data/audioRigConfig.ts`'s `LFO_DRIFT_GROUPS` — EQ, Low-Pass, High-Pass, and Robot Drift each
get an identical `Rate Drift`/`Depth Drift` `SliderCenteredZero` pair, same min/max/load range in
every group:

| Human Label | Slider Type | Value Type | Min | Max | Step | Load Min | Load Max |
|---|---|---|---|---|---|---|---|
| Rate Drift | Centered Zero | % | -100 | 100 | —¹⁴ | -70 | 70 |
| Depth Drift | Centered Zero | % | -100 | 100 | —¹⁴ | -70 | 70 |

¹⁴ `SliderCenteredZero` still has no numeric `step` field in its *schema* — the UI slider's own
granularity is unchanged. The *generation* side now rounds anyway: `GLOBAL_AUDIO_SEED_RANGES`'s
8 `lfoDrift.*` entries (one `rateDrift`/`depthDrift` pair per group, `globalAudioSeedRanges.ts`)
each declare `step: 0.01` — a whole percent in this field's `-1..1` stored-fraction space (1% =
`0.01`) — and `sampleField` quantizes against it the same way it does every other stepped field.

Since `SliderCenteredZero` never had a numeric step to compare against, there's no "off the
slider's own grid" concern the way a `SliderLinear` field has — the whole-percent rounding above is
purely a generation-side choice, not driven by any UI step this field lacks.
