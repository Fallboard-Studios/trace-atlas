# Parametric Robot Hull

Refined 2026-10-02 via the idea-refine skill. Second of three sequenced branches:
world-palette-pull → parametric-robot-hull → layer-pods-and-follow-through.

## Problem Statement

How might we replace four hand-drawn propeller submarines with robots that have no right angles,
rim highlights and shadows, a window, a few vents, dimming lights and one identity-colored piece,
while every audio edit still shows and the robot card thumbnail still reads at 40 px?

## Recommended Direction

One `RobotHull` component generated from parameters, replacing `RobotSleek` / `RobotAngular` /
`RobotOrganic` / `RobotIndustrial`. Four preset **bundles** keyed by base-layer waveform keep
sine / square / triangle / sawtooth recognizable as families (Crawford's call, 2026-10-02: the
families survive). The hull is a superellipse path; the bundle sets exponent and asymmetry, and
continuous audio inputs modulate within the bundle. Highlights and shadows are two gradient
strokes along the rim, computed from the same path — not hand-drawn paths per shape.

The identity color (`Robot.identityColor`, a seeded `ACCENT_COLORS` pick) lives on the window
glass, the one or two lights, and a thin rim stroke. Battery dim and day/night keep working as
today because the lamp group and `lightnessMultiplier` stay where they are.

Propellers and the `.propeller` rotation tween in `src/animation/swimAnimation.ts` are deleted.

### Guardrail amendment (required, same commit)

CLAUDE.md's "Robot visuals (shape/color) must map strictly to audio attributes" and
ROBOT_DESIGN.md's "never add a static/fixed color palette" both get a narrow, explicit carve-out:
`identityColor` is a documented **non-audio identity layer**, confined to window glass, lights
and rim — the same class of exception as the existing day/night and battery brightness overlays.
The `identityColor` comment in `src/types/Robot.ts` ("UI chrome only, never the SVG body") is
updated in the same commit. Everything else on the body stays audio-driven.

### Proposed mapping table (approve at spec stage)

| Visual | Driver |
|---|---|
| Family bundle | base layer waveform |
| Hull size | octave register |
| Hull aspect | sustain |
| Hull exponent within family | attack |
| Greeble and vent count | filterFreq, gated by `detailLevel` at thumbnail scale |
| Rim highlight width | release |
| Light count (1 or 2) | masterVolume above a threshold |
| Light breathe period | transport BPM |
| Window glass, lights, rim color | identityColor (non-audio identity layer) |
| Lamp brightness | battery, as today |

### Design for the 40 px read

Three things must read at thumbnail scale (RobotSelectionCard avatar): hull shape, the
identity-colored lamp, and (once the pods branch lands) whether pods are present. Vents, greebles
and panel lines only appear above a scale threshold — `detailLevel` already gates this.

## Key Assumptions to Validate

- [ ] A superellipse plus two rim strokes reads as "robot", not "pebble", at both world scale and
      40 px. Test: a static HTML sketch of the four bundles **before any React work**.
- [ ] Four bundles still look like one art style. Same sketch.
- [ ] Deleting the four shape components does not break the thumbnail, `AudioVisualInspector`
      (`src/components/debug/`) or `RobotDisplaySection`. Grep every importer; run the suite.
- [ ] The guardrail amendment stays narrow — CLAUDE.md, ROBOT_DESIGN.md and the Robot.ts comment
      change together.

## MVP Scope

- `RobotHull` component, the four bundles, the mapping table above.
- Rim highlight/shadow strokes, identity-colored lamp and rim.
- Propeller removal from the SVGs and from `swimAnimation.ts`.
- The guardrail amendment; ROBOT_DESIGN.md rewritten.
- No pods, no new motion beyond removing the propeller spin.

## Not Doing (and Why)

- Pods and follow-through motion — the layer-pods-and-follow-through branch.
- A sunlight / caustic effect — Crawford confirmed the once-a-second day/night lightness step is
  the only "sunlight" that exists or is wanted.
- Making `identityColor` audio-derived — rejected: card colors would change on every audio edit.
- Changing the robot card chrome — out of scope; it already consumes `identityColor`.
- A single continuous hull with no families — Crawford wants the four families recognizable.

## Open Questions

- Does the light breathe period re-key when BPM changes, or is BPM fixed per Attenuation Style
  for the life of a locale (`src/utils/bpmSeed.ts`)? If fixed, the timeline is built once at
  mount.
- Which of greeble count / vent count / panel lines is the first to drop out as scale shrinks?
