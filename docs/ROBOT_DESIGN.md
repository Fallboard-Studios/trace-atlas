# Robot Visual Design Guide

## Overview

Robots are single unified SVG entities whose visual appearance (shape, color, detail) is derived entirely from `audioAttributes` — never stored separately. This keeps `Robot` fully serializable for Zustand while visuals stay a pure function of audio data, computed at render time in [robotVisualHelpers.ts](../src/components/robot/robotVisualHelpers.ts) and [robotVisualMapper.ts](../src/components/robot/robotVisualMapper.ts).

**Related references:**
- [Audio System Guide](AUDIO_SYSTEM.md) — AudioEngine, layered voices, `visualAudioMap`
- [Animation System Guide](ANIMATION_SYSTEM.md) — GSAP timeline patterns for robot motion

## Shape Components

Four SVG variants live in `src/components/robot/`: `RobotSleek.tsx`, `RobotAngular.tsx`, `RobotOrganic.tsx`, `RobotIndustrial.tsx`. Selection is by oscillator `waveform` via `selectRobotShape()`:

| Waveform | Shape |
|---|---|
| `sine` | RobotSleek |
| `square` | RobotAngular |
| `triangle` | RobotOrganic |
| `sawtooth` | RobotIndustrial |
| `pulse` / unknown | RobotSleek (default) |

## Color Mapping

`generateColors(adsr, waveform)` in `robotVisualHelpers.ts` computes HSL colors directly — there is no static color-palette table:

- **Hue**: each waveform has a `BASE_HUE` (sine 210°, square 24°, triangle 280°, sawtooth 140°, pulse 60°), offset by `hueOffset(adsr)` — a small deterministic shift from the decay/release and attack/sustain ratios. Secondary/accent hues are +14°/−22° from primary.
- **Saturation**: from `adsr.attack` — faster attack → higher saturation (30–100%).
- **Luminance**: from `adsr.sustain` — higher sustain → higher luminance (20–72%).

## Shape Parameters

Two complementary sources feed body geometry, composed together in `RobotBody.tsx`:

1. **Spawn-time (`audioAttributes.visualAudioMap.shapeParams`)** — computed once in `spawnSystem.ts` directly from the robot's one shared ADSR envelope (`audioAttributes.adsr`), normalized by the `ADSR_MAX` mapping constant: `scale ≈ 0.25 + (1 − attack/ADSR_MAX.attack) × 0.75`, `roundness ≈ sustain/ADSR_MAX.sustain`, `detail ≈ release/ADSR_MAX.release` (all 0..1). Roadmap Phase 9 collapsed per-layer ADSR overrides down to this single shared envelope — there's nothing left to average across layers. This is the preferred source, converted to component props via `mapVisualAudioToProps()`.
2. **Live (`shapeParamsFromAudio()`)** — derives `torsoAspect`, `appendageLength`, and `scaleBias` from `octaveRange`, `filterFreq`, and waveform/ADSR, plus `MicroVariants` (`stripes`/`smooth`/`spikes`) keyed off waveform and fast-attack envelopes.

## Greebles & Lights

- **Greeble count**: prefers `mapped.greebleProps.count` (≈ `detail × 6`, from `visualAudioMap`); falls back to `calculateGreebleCount(filterFreq, detailLevel, waveform, adsr)`, which weights filter-derived detail (60%), explicit detail (25%), and sustain (15%), with a small bonus for sawtooth/square waveforms. Capped at 16.
- **Light intensity**: blends `averagedGain × 0.6 + detail × 0.4`; light hue derives from scale (`200 − scale × 120`). Computed by `mapVisualAudioToProps()` but not currently passed to any shape component — `lightsProps` is unwired output, not a rendered element.

## Non-Audio Brightness Overlays

Two things dim a robot's rendering for reasons that are **not** audio attributes. Both are a
distinct, narrower layer than the shape/color identity mapping above — they scale brightness on
top of it, they never replace it — so they don't relax the "visuals map strictly to audio
attributes" guardrail, they extend the one existing precedent for it:

- **Day/night** (`RobotBody.tsx`): `lightnessMultiplier`, a sine curve over the active locale's
  local time, scales the whole body's HSL lightness via `applyLightnessMultiplier()`.
- **Battery dim** (`RobotBody.tsx` + `robotVisualHelpers.ts`'s `computeBatteryDimOpacity()`): a
  battery-level step function (thresholds in `src/constants/index.ts`:
  `BATTERY_DIM_THRESHOLD_LOW/MID/CRITICAL`) that dims only each shape component's window/viewport
  and status-light elements (the hardcoded blue "Window"/"Viewport" ellipses/polygons/rects and
  green "Status light" circles/rects in `RobotSleek.tsx`/`RobotAngular.tsx`/`RobotOrganic.tsx`/
  `RobotIndustrial.tsx` — those elements use fixed hex fills, not `colors`, which is why day/night
  doesn't touch them either). Passed down as a `dimOpacity` prop, wrapping the target elements in a
  `<g opacity={dimOpacity}>`. Body hue/shape/greeble-count are untouched by battery level.

**`ignoreDaylight` (Roadmap Phase 8)**: `RobotBody`'s optional `ignoreDaylight?: boolean` prop
fixes the day/night `lightnessMultiplier` at a neutral `1` instead of deriving it from
`uiStore.activeLocaleLocalTime` — used by `RobotSelectionCard`'s avatar thumbnail
(`src/components/selection/`) so a card's appearance stays consistent regardless of the active
locale's time of day. This is a rendering-context override only: it doesn't touch what
`audioAttributes` produce, doesn't affect battery dim (a separate, non-audio signal — still fully
active on an `ignoreDaylight` thumbnail), and in-world `Robot.tsx` instances don't pass it, so
their day/night behavior is unchanged.

## Data Flow

`audioAttributes` (`adsr`, `waveform`, `filterFreq`, `layers`, `visualAudioMap`) is fully serializable and lives on `Robot` in Zustand (see [src/types/Robot.ts](../src/types/Robot.ts)). Visual props are recomputed from this data at render time — never construct Tone.js objects, and never store computed shape/color props back in state.

`filterFreq` is audible as well as visible: it is the cutoff of the robot's per-voice bus low-pass (`AudioEngine.reserveVoice`'s `filterFreq` parameter — see AUDIO_SYSTEM.md "Signal Graph"), so the detail level and greeble count it drives correspond to a real difference in timbre. Until 2026-09-30 that bus filter was a fixed 1,200 Hz and the mapping was visual-only.

`AudioVisualInspector.tsx` (`src/components/debug/`) exposes the live mapping for debugging.

## Forbidden Patterns

- Storing computed colors, shape props, or greeble counts in Zustand — recompute from `audioAttributes` at render time.
- Adding a static/fixed color palette — colors must stay derived from ADSR + waveform.
- Constructing Tone.js objects for visual-only purposes.
