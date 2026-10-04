# Intent: Robot Live Visuals

Confirmed via `interview-me` on 2026-10-03, ahead of a `spec-driven-development` pass. Branch 1
of three in [docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md)
(live visuals → greebles → layer markers); branch `feature/robot-rework`. The interview changed
the one-pager in one way recorded below: identity colour comes onto the body in *this* branch,
not later, so the guardrail amendment lands here.

## Outcome

Every Robot Options slider visibly lands on the robot's body, and each robot carries its card
colour on its window glass and a lamp, in the existing flat art style. The four hand-drawn
shapes (`RobotSleek` / `RobotAngular` / `RobotOrganic` / `RobotIndustrial`,
`src/components/robot/`) stay; nothing about their outlines changes. Anyone can match a robot in
the world to its card across twelve of them at a glance, and robots are no longer too small.

## Behavior

- **Edits reach the body.** The spawn-frozen `audioAttributes.visualAudioMap` (written once in
  `spawnSystem.ts`, preferred by `RobotBody.tsx` for body scale/roundness/detail and never
  refreshed) is deleted, along with `robotVisualMapper.ts` and the `layerVisuals` placeholder.
  The same formulas are computed live from `audioAttributes.adsr` and the live layers array in
  `robotVisualHelpers.ts`. Dragging attack, sustain or release changes the body's size, width,
  shading or detail; muting a layer (gain → 0) dims the lamp.
- **Release drives the detail cliff.** The vent / panel-line / warning-stripe group that appears
  above a detail threshold is driven by release time (which has a slider), not the filter cutoff
  (seeded at spawn, audible through the per-voice low-pass, but with no control anywhere — the
  docs' "cutoff drives detail" claim was never true in practice because the snapshot won). Cutoff
  stays reserved for greeble count in branch 2.
- **Shading is tinted from the robot's own colours.** The fixed grey `#a9adb0` highlight and black
  shadow on every shape are replaced by a lightened and a darkened version of the robot's own
  hue, so attack (saturation) and sustain (luminance) edits show in the shading. `colors.secondary`
  (generated, typed into every shape's props, never read) is the natural source but is generated
  *darker* than primary, so the highlight must be a lightened derivation, not secondary as-is;
  exact derivation is a spec decision.
- **The window glass and a lamp carry the identity colour.** `Robot.identityColor` (the seeded
  `ROBOT_IDENTITY_COLOR_NAMES` pick, `src/constants/accentColors.ts`) replaces the fixed cyan
  `#78cce2` / `#b3e5f2` window on all four shapes — the window is the main carrier, since a lamp
  alone is a few pixels at world scale — and tints a lamp. No rim stroke: it would fight the flat
  style on hand-drawn hulls.
- **One lamp on all four shapes, at every detail level.** It replaces the green `#39ff14` status
  lights on Organic and Industrial (today behind the detail cliff) and is added to Sleek and
  Angular, which have none. An identity carrier that disappears when release is short would defeat
  the purpose. Lamp brightness is driven by the live intensity value (today's
  `lightsProps.intensity` blend of averaged audible-layer gain and detail, recomputed live),
  multiplied with the existing battery dim so a dead battery still kills it.
- **Robots get bigger.** Crawford: "they're all currently too small — increase the minimum size
  they could be by 50%." Today the overall body scale is `calculateScale(octaveRange)`
  (0.7 / 1.0 / 1.3 by register) × `(1 + scaleBias)`. The bias comes from the snapshot's
  `scale = 0.25 + (1 − attack/2) × 0.75` via `(scale − 0.5) × 0.6`, so it spans −0.3..0.3 and the
  real floor is 0.7 × 0.7 = **0.49** (the spec survey corrected an earlier 0.42 estimate). The new
  floor is at least **0.735**. Whether the whole range shifts up or only the floor is clamped is a
  spec decision, checked by eye. Note the normaliser mismatch the survey found: attack is seeded
  0..5 s but normalised by 2 s, so every robot with attack above about 2.7 s already sits at the
  floor — likely why "they're all too small".
- **`appendageLength` is deleted.** It was the propeller/strut multiplier; the propellers are gone
  (`b4368e80`).
- **Battery dim and day/night keep working as today.** The window + lamp group stays the
  battery-dimmed group; `lightnessMultiplier` keeps scaling the body colours in `RobotBody.tsx`.
- **The card and detail-section avatars show the same body.** `RobotSelectionCard` and
  `RobotDisplaySection` render `RobotBody` with `ignoreDaylight` and pick up every change above
  for free; the window colour on the avatar now matches the card chrome around it.

## Style / constraint

- **Guardrail amendment, narrow, one commit.** `identityColor` becomes a documented
  **non-audio identity layer** confined to window glass and the lamp — the same class of exception
  as the day/night and battery overlays. Four places change together: CLAUDE.md line 49
  ("Robot visuals (shape/color) must map strictly to audio attributes…"), its mirror at
  `.github/copilot-instructions.md` line 43, `docs/ROBOT_DESIGN.md`'s "never add a static/fixed
  color palette" forbidden pattern, and the `identityColor` comment in `src/types/Robot.ts`
  ("UI chrome only, never the SVG body" — also still says "13 hues"; count it). Everything else on
  the body stays audio-driven.
- **Existing art style, untouched.** Flat fills, simple highlight/shadow, rivets, window, vent.
  No new outline geometry, no gradients, no filters.
- **Pure wiring, no sketch gate.** Every value already exists; this branch connects it. Visual
  sign-off is by eye in the running app at the end, not a static sketch first.
- **Composition point stays.** `RobotBody.tsx` keeps owning the audio→props memo (the backlog
  item 22 split — lighting tick outside the memo — must survive), day/night and battery. Shapes
  stay stateless.
- State stays JSON-serializable; no computed visual props stored. Deleting `visualAudioMap` from
  `AudioAttributes` must not break session restore or share links — grep says only
  `RobotBody.tsx`, `robotVisualMapper.ts`, `spawnSystem.ts` and `src/types/Robot.ts` touch it, so
  nothing persisted reads it; the spec confirms.

## Out of scope

- **Greebles** (branch 2) and **layer markers** (branch 3) — this branch deletes the placeholder
  they replace, nothing more.
- **Any motion** — no lamp breathe, no idle drift, no pod orbits.
- **A rim stroke** — rejected; fights the flat style.
- **`microVariants`** — parked; the only non-redundant bit (fast attack → stripes) waits for the
  greeble vocabulary.
- **Robot card chrome** — already consumes `identityColor`; untouched.
- **A cutoff slider** — cutoff stays seeded and uneditable.
- **Changing what `generateColors` does** — base hue per waveform, ADSR offsets, attack →
  saturation, sustain → luminance all stay as they are; only consumers change.

## Known implementation note (not yet spec'd)

- The live formulas: body scale ← attack, roundness ← sustain, detail ← release, each normalised
  by `ADSR_MAX` (`spawnSystem.ts` line 58: attack 2, decay 2, sustain 1, release 5) — move the
  constant and the three mappings into `robotVisualHelpers.ts`; `RobotBody.tsx`'s current 70/30
  blend of ADSR-driven and register-driven `torsoAspect` is kept unless the spec finds a reason not
  to.
- Live intensity: averaged gain over audible layers (`gain !== 0`, the `spawnSystem.ts` rule)
  blended with detail, as the mapper does today, but recomputed inside the memo.
- Lamp placement per shape is hand-chosen in the spec (a position that reads on each silhouette
  at the 160-unit card viewBox and at world scale).
- Highlight/shadow derivation: lighten/darken of `primary` vs. a lightened `secondary` — pick
  one in the spec, with the day/night `applyLightnessMultiplier` still applied after.
- Tests to migrate or delete: `robotVisualMapper.test.ts` (goes with the mapper),
  `robotShapeVariants.test.tsx` (passes `appendageLength`), `RobotBody.test.tsx`,
  `robotVisualHelpers.test.ts` / `.greeble.test.ts`, `spawnSystem.test.ts` (asserts on the
  snapshot).
- Docs: `docs/ROBOT_DESIGN.md` rewrite ("preferred source" and "lightsProps is unwired" both become
  false); `docs/AUDIO_SYSTEM.md`'s `visualAudioMap` mention; roadmap Phase 36 entry
  (`docs/todo/roadmap.md`; 36 is free on `main`).
