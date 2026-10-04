# Robot Visual Design Guide

## Overview

Robots are single unified SVG entities whose visual appearance (shape, color, detail) is derived entirely from `audioAttributes` — never stored separately. This keeps `Robot` fully serializable for Zustand while visuals stay a pure function of audio data, computed live at render time in [robotVisualHelpers.ts](../src/components/robot/robotVisualHelpers.ts).

**Related references:**
- [Audio System Guide](AUDIO_SYSTEM.md) — AudioEngine, layered voices
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

Body scale, roundness and detail are computed live from the robot's current `audioAttributes.adsr`
(Roadmap Phase 36) — no spawn-time snapshot. `bodyShapeFromAdsr(adsr)` (`robotVisualHelpers.ts`)
normalises by `BODY_NORMALISER` (`{ attack: 5, sustain: 1, release: 5 }`, matching the seeded
generation range — edits past it clamp): `scale ≈ 0.25 + (1 − attack/5) × 0.75`, `roundness =
sustain`, `detail = release/5` (all 0..1). `calculateBodyScale(octaveRange, bodyShape.scale)` then
folds in the register step (0.7/1.0/1.3 from `calculateScale`) and an attack-driven bias, floored
at `BODY_SCALE_MIN` (0.735 — 1.5× the pre-Phase-36 floor of 0.49). `RobotBody.tsx` passes the
result as the shape's single `scale` prop; each shape centre-scales its root about (48,36) instead
of growing from the origin.

`shapeParamsFromAudio()` separately derives `torsoAspect` from `octaveRange` (plus `MicroVariants`
— `stripes`/`smooth`/`spikes` — from waveform and fast-attack envelopes), blended 70% ADSR-driven /
30% register-driven in `RobotBody.tsx`. `ShapeParams` itself is `{ torsoAspect }` — nothing else.

## Greebles & Lights

- **Greeble count**: `calculateGreebleCount(filterFreq, detailLevel, waveform, adsr)`, weighting filter-derived detail (60%), explicit detail (25%), and sustain (15%), with a small bonus for sawtooth/square waveforms. Capped at 16. Computed live; not yet drawn on any shape — Roadmap Phase 37 (Robot Greebles) owns rendering it.
- **Lamp**: every shape renders one always-visible `g.lamp` (outside `.details`, present at every detail level), identity-coloured (see "Non-audio layers" below), lit by `calculateLampIntensity(layers, detail)` — averaged audible-layer gain (muted layers excluded from the average, not counted as zero) blended 60/40 with detail, floored at `LAMP_MIN` (0.4) so a quiet, short-release robot still shows a carrier. `RobotBody.tsx` composes the final `lampOpacity` with battery dim outside the audio memo, the same split `dimOpacity` already uses.

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

## Non-audio layers

Two documented exceptions to "visuals map strictly to audio attributes":

1. **Identity colour.** `Robot.identityColor` (one of the 18 `ROBOT_IDENTITY_COLOR_NAMES` hues,
   seeded at spawn) drives exactly two SVG elements on every shape — the window glass and the
   lamp — nothing else on the body. Both derive their fills from `identityGlass(hex)`
   (`robotVisualHelpers.ts`), which returns `{ glass, sheen }`: `glass` is the identity hex
   itself, `sheen` is the same hue lightened (+20, capped 95). The window's `g.window` group and
   the lamp's `g.lamp` group each render `glass`/`sheen` directly; neither is touched by
   `generateColors()`'s ADSR/waveform mapping, and neither is affected by day/night
   (`lightnessMultiplier`, above, never reaches them) — though both are still dimmed by battery
   (`dimOpacity`/`lampOpacity`), and the lamp additionally tracks live audible-layer gain
   (`calculateLampIntensity`).
2. **The greeble set (Roadmap Phase 37).** `Robot.greebles` (`{ kind, slot }[]`) is drawn once at
   spawn (`generateGreebles`, `spawnSystem.ts`) from a count in `GREEBLE_COUNT_RANGE` (2..5), then
   that many independent kind/slot draws with no robot ever repeating a slot — seeded hardware,
   not audio-derived. `kind` indexes `RobotGreebles.tsx`'s fixed vocabulary of `KIND_COUNT` parts
   (panel/tank/dish/antenna/decal, one or two SVG elements each); `slot` indexes the current
   shape's `GREEBLE_SLOTS` table (`greebleSlots.ts`, `SLOT_COUNT` entries per shape, hand-measured
   to clear the window, lamp, vent and the reserved layer-socket fixtures), so a waveform change
   re-slots the same parts onto the new outline without touching robot data. Parts draw only from
   `colors.accent`, `colors.shadow` and the hardware greys — never `identityColor`, never
   `primary` — so this is a **shape/placement** exception, not a colour one. `RobotBody` builds
   `<RobotGreebles>` outside its audio memo and hides it only on the 64px selection card
   (`hideGreebles`); the detail avatar and in-world robots always show parts.

Both are the same class of exception as the two brightness overlays above: narrower than, and
layered on top of, the shape/color identity mapping — never a replacement for it. Everything else
on the body — primary/secondary/accent/highlight/shadow fills, rivets, vents — stays derived from
ADSR + waveform.

## Data Flow

`audioAttributes` (`adsr`, `waveform`, `filterFreq`, `layers`) is fully serializable and lives on `Robot` in Zustand (see [src/types/Robot.ts](../src/types/Robot.ts)). Visual props are recomputed from this data at render time — never construct Tone.js objects, and never store computed shape/color props back in state.

`filterFreq` is audible as well as visible: it is the cutoff of the robot's per-voice bus low-pass (`AudioEngine.reserveVoice`'s `filterFreq` parameter — see AUDIO_SYSTEM.md "Signal Graph"), so the detail level and greeble count it drives correspond to a real difference in timbre. Until 2026-09-30 that bus filter was a fixed 1,200 Hz and the mapping was visual-only.

## Forbidden Patterns

- Storing computed colors, shape props, or greeble counts in Zustand — recompute from `audioAttributes` at render time.
- Adding a static/fixed color palette to the **body** — body colours must stay derived from ADSR + waveform; the only non-audio colour is `identityColor`, confined to the window glass and lamp (see "Non-audio layers").
- Making greeble count, kind or placement depend on anything other than the seed (audio, battery, time, or a user edit) — the seeded `Robot.greebles` set is the only non-audio shape exception, confined to the vocabulary's own slots (see "Non-audio layers").
- Constructing Tone.js objects for visual-only purposes.
