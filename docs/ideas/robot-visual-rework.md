# Robot Visual Rework (series)

Decided 2026-10-03 after a context pass on branch `feature/robot-rework`. A sequenced series of
three branches that improve the **existing four hand-drawn robot shapes** rather than replace
them. Supersedes the robot half of the earlier world-visuals series
(world-palette-pull → parametric-robot-hull → layer-pods-and-follow-through): branch 1 of that
series shipped (roadmap Phase 35); branches 2 and 3 are set aside, see below.

## Decision: the parametric hull is set aside

The parametric hull (`feature/robot-v2`, unmerged, 18 commits) was built end to end and
reviewed by eye. Crawford's verdict: the design didn't match the rest of the app. The branch
stays unmerged and is not to be revived. The existing aesthetic — flat fills, a simple
highlight/shadow, rivets, a window, a vent — is "pretty simple but that's ok, it leaves room for
some flexibility." The four shapes in `src/components/robot/` (`RobotSleek`, `RobotAngular`,
`RobotOrganic`, `RobotIndustrial`) are the base; propellers and struts are already gone
(`b4368e80`).

Decisions from the hull interview that still hold and carry forward: families stay
recognizable; nothing jagged or waveform-themed on a silhouette; greebles are a vocabulary of
recognizable parts placed inside the outline and hidden at thumbnail scale; the once-a-second
day/night lightness step is the only "sunlight"; pods carry audio meaning, never decoration.
Decisions that do **not** carry forward on this branch: the identity-color carve-out on
window/lamp/rim (CLAUDE.md's guardrail is unamended on `main`; re-decide at the lamp if wanted).

## Problem Statement

How might we make each robot read as a distinct, audio-driven individual — and make every
Robot Options edit visibly land on the body — using only the shapes and style we already have?

## What's already computed and never drawn

`RobotBody.tsx` and `robotVisualHelpers.ts` produce a lot of signal that no shape component
reads. In order of cost to hook up:

| Signal | Where it dies | Branch |
|---|---|---|
| `colors.secondary` | typed into every shape's props, never read; shapes shade with a fixed grey `#a9adb0` and black | 1 |
| `shapeParams.appendageLength` | was the propeller/strut multiplier; propellers deleted | 1 (delete) |
| `lightsProps` (intensity, hue) | computed by `robotVisualMapper`, destructured out of `RobotBody`, never passed | 1 |
| `microVariants` (stripes/smooth/spikes) | passed, never read; mostly duplicates waveform | later, if at all |
| greeble count / size / placement bias / persistence | passed, never read | 2 |
| `visualAudioMap.layerVisuals` | a placeholder since 2026-04-02 (colour undefined, offset zero); only consumer was the deleted `AudioVisualInspector` | 1 (delete), 3 (replace) |

## The freshness bug underneath (prerequisite)

`audioAttributes.visualAudioMap` is written once in `spawnSystem.ts` and never refreshed.
`RobotBody.tsx` *prefers* it for body scale/roundness/detail and greeble count, so editing
attack, sustain or release in Robot Options never reaches those values; only the live fallbacks
(`shapeParamsFromAudio`, `calculateGreebleCount`) respond. Same bug class the hull branch found
for octave edits. Every branch below builds on live values, so branch 1 deletes the snapshot,
the mapper and `layerVisuals`, and computes the same formulas from the live envelope.

## The three branches

1. **Live visuals** (roadmap Phase 36): the prerequisite above; `secondary` and a darkened
   `primary` replace the fixed grey/black highlight and shadow; a lamp on all four shapes driven
   by `lightsProps` intensity, composed with the existing battery dim; `appendageLength` deleted.
   No sketch needed — wiring existing values into existing shapes. Small, one sitting.
2. **Greebles** (roadmap Phase 37): a small part vocabulary in the current flat style, a
   deterministic placement inside each shape's interior region (placement source must be audio
   fields — phase/detune/cutoff — not a seed, to stay inside the visuals-map-to-audio guardrail),
   count from filter cutoff, hidden at thumbnail scale. Persistence (a duration) is dropped or
   becomes a GSAP fade later. Static HTML sketch gate before React, as the hull did. Medium.
3. **Layer markers** (roadmap Phase 38): one marker per audible Coaxial/Harmonic layer
   (`layers[1..]`, `gain > 0`), read live from the layers array — sized by gain, placed by
   phase, tinted by that layer's waveform hue. Gain to zero removes it (the shipped mute rule).
   Spawn odds: ~half the robots get one, a quarter two, a quarter none. The static form of
   [layer-pods-and-follow-through.md](layer-pods-and-follow-through.md); orbits and swim
   trailing are a later motion branch on top. Depends on branch 1. Small to medium.

## Not Doing (and Why)

- Reviving any part of the parametric hull — rejected by eye; see above.
- `microVariants` — the only non-redundant bit is fast-attack → stripes; park until greebles
  exist and see whether a stripe part covers it.
- Identity colour on the body — not re-decided here; the guardrail stands until the lamp task
  raises it.
- Pod motion (orbits, trailing, lean) — after the markers exist, as its own branch.

## Pipeline

Per branch: intent (`interview-me`) → spec (`spec-driven-development`) → task plan
(`planning-and-task-breakdown`) → TDD, one commit per task → `code-review-and-quality` → docs
(ROBOT_DESIGN.md rewrite lands with branch 1; AUDIO_SYSTEM.md's `visualAudioMap` mention and the
`Robot.ts` type comment go with it).
