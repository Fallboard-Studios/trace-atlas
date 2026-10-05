# Gem Polygon Robots

Refined 2026-10-04 via the idea-refine skill, from Crawford's outline and two sketches (a bevel-ring
gem reference, and a three-panel graph-paper build order). Supersedes the direction in
[robot-visual-rework.md](robot-visual-rework.md): this is a near-complete departure from the four
hand-drawn shapes, not another improvement pass on them. Crawford's stated reasons (2026-10-04): the
current robots don't match the Oblique Cabinetry UI, the 12 aren't distinct enough, they're lifeless
as rigid sprites — and the aesthetic itself is being explored, not fixed. Shipped work that carries
forward: `identityColor` and `generateColors`' highlight/shadow derivation (Phase 35), the lamp and
lit-socket intensity helpers (Phases 36, 38), `greebles`' seeded-and-permanent data pattern (Phase 37).

## Problem Statement

How might we make each of the 12 robots read as an unmistakable, card-coloured individual built from
seeded low-poly gem polygons — while its sound stays legible on its body and its motion stays
GSAP-clean?

## The design, in one paragraph

A robot is a stack of polygons on a canvas 64×64 to 128×64 (width seeded per robot; everything scales
horizontally with it). Bottom: a near-black **Backing** polygon (~25×25, centred, no bevel). Top:
the **Top** polygon (~32×32, centred, highest z) carrying two lights and four **boundary lines**.
Behind it, two **Mid** polygons (20–24 wide × 34–36 tall), one hanging off each side of the canvas
centre, each with two boundary lines; the Top polygon's seeded notch is where a Mid tucks in.
Four **Orbiters** (24×16) in the corners, one boundary line each. Every polygon except the Backing
has the **bevel ring** gem effect: an inset copy of the outline, one trapezoid facet per edge, flat
centre face. Polygons are 8–12 sided with every angle a multiple of 15°, at most 4 right angles,
≤2 concave corners on Top/Mids, ≤4 on orbiters, Backing convex; Top/Mids never symmetric. Boundary
lines live on the *inner* polygon, right angles and 45° only, may cross.

## Recommended Direction

Three decisions were made in the session and are the frame for everything below:

1. **The identity guardrail is inverted, not patched.** `identityColor` becomes the body — the Top
   polygon and the orbiters take the card colour. The current rule ("body fills stay
   ADSR/waveform-derived; identity only on glass/lamp/sockets") is rewritten in ROBOT_DESIGN.md,
   CLAUDE.md and `.github/copilot-instructions.md`. Audio moves into geometry, bevel, the Mids,
   lights and motion.
2. **No pop-in/out on an edit still holds — except for orbiters.** Geometry, side counts, notches,
   boundary-line counts and canvas width are seeded and permanent. Audio edits only drive continuous
   things (depth, tone, lit state, motion). Orbiters alone may enter and leave, animated.
3. **One world light.** A single light direction for every robot; each facet's tone is a function of
   its edge's outward normal (top-left lit, bottom-right shaded), derived from the host polygon's
   colour the way `generateColors` already derives `highlight`/`shadow`. Day/night rotates that
   model's lightness (replacing `lightnessMultiplier`); battery lowers bevel contrast (replacing
   `dimOpacity`). Both existing non-audio overlays survive, re-expressed in facet terms.

Built in this order, as separate branches:

**Branch A — the skeleton (seeded body, audio light).** A `bevel(polygon, d)` helper, a seeded
polygon generator (chamfered rectangle + 0–2 notches, angles snapped to 15°), the composition, and
the three render contexts (world, 96 px avatar, 64 px card). Audio touches only what it touches
today: the two lights, Mid lit state, overall scale from `octaveRange`. Exit gate is a *sketch*
judgement, like Phase 37's: does this read better than the current robots at 1×, 96 px and 64 px, and
does it match the UI? If no, stop here — nothing below is worth building on it.

**Branch B — the robot is its signal chain.** Top = `layers[0]`. Mid left / Mid right = the two
non-base layers (Coaxial, Harmonic) — exactly two Mids because there are exactly two. A Mid's colour
is *audio*: its layer's waveform hue, lit by gain, dark at gain 0 (the Phase 38 `socketLitOpacity`
idea, promoted from a socket to a whole polygon). Orbiters = active LFO lane links from
`Robot.lfoLinks` (6 targets, 4 corners — see Open Questions). ADSR drives continuous dials only:
attack → bevel depth *d*, sustain → facet contrast, release → boundary-line brightness.

**Branch C — motion carries audio.** Orbiter speed wobbles ±5% so they run a little ahead then a
little behind the body (Crawford's Q5); wobble amplitude ← that link's LFO depth, each orbiter's
wobble phase ← oscillator `phase`, and `detune` sets the wobble rate — the first design where phase
and detune are visible at all. The Top polygon gets a slow idle bob. All GSAP child tweens inside
the robot `<g>` (GSAP keeps the root transform, `Robot.tsx` unchanged in that respect), registered
in `timelineMap`, never calling AudioEngine. Absorbs and retires
[layer-pods-and-follow-through.md](layer-pods-and-follow-through.md).

Held as a question for the Branch A sketch gate, not decided: **waveform as angle dialect** (sine →
150°/165° chamfers, square → 90°/45° steps, triangle → 60°/120°, sawtooth → asymmetric wedges). It
would keep "shape maps to audio" alive in a new form, at the cost of a waveform edit regenerating
the polygon. Decide only after seeing whether a sine-dialect polygon actually *reads* rounder at 1×.

## Key Assumptions to Validate

- [ ] The gem-polygon look matches the Oblique Cabinetry console better than the current robots.
      Test: Branch A sketch (`docs/sketches/`), judged by eye at 1×, 96 px and 64 px, before any
      audio mapping is built. The parametric hull failed exactly this test after 18 commits —
      this time the gate comes first.
- [ ] 12 seeded polygons under the 15°/8–12-side/≤4-right-angle rules are distinct enough from each
      other at 64 px. Test: render all 12 from one seed side by side in the sketch; if two are
      confusable, the generator needs more seeded variety (notch position, side count spread), not
      more rules.
- [ ] The "concave corners" rule can be met by a chamfered rectangle + notches without breaking
      the edge-touch rule. Test: generator unit test asserting every canvas edge has ≥1 touch point
      and angle counts, across a few thousand seeds.
- [ ] Facet tone from a single light direction reads as depth, not pattern, on a 32 px polygon.
      Test: same sketch; compare against the hand-hatched sketch which lit two opposite corners.
- [ ] 48 repeating child tweens (12 × 4 orbiters) plus bobs do not regress idle paint. Test:
      `npm run perf` A/B on the same session, foreground, one call at a time, no orphaned Chrome
      (docs/PERFORMANCE.md). This gates Branch C only.
- [ ] Most seeds actually have linked LFO lanes and nonzero non-base layers, or Branch B is quiet.
      Test: count across the fixed roster for a few seeds before building B.

## MVP Scope

Branch A only, behind the sketch gate:

- `polygon.ts`: seeded generator under the rules; `bevel()`; facet tone from edge normal.
- `RobotGem.tsx` (or similar) replacing the four shape files, `RobotGreebles.tsx`,
  `RobotLayerSockets.tsx` and `greebleSlots.ts`; `RobotBody.tsx` keeps its audio-memo /
  non-audio split and its three callers unchanged.
- `Robot` data: canvas width, polygon seeds/notch choices, boundary-line layouts — seeded and
  permanent on the `greebles` pattern (spawn-time dataIds, never edited, never diffed into a
  session). `greebles` itself is removed.
- Lights, Mid lit state and scale wired as today; day/night and battery re-expressed as facet
  lightness and contrast.
- Guardrail rewritten in the three places it lives; ROBOT_DESIGN.md rewritten; the three
  `src/docs/robot*Docs.test.ts` files and the shape/greeble/slot tests replaced, not patched.

Out of MVP: everything in Branches B and C, the angle-dialect question.

## Not Doing (and Why)

- **Canvas width as an audio dial** — it's the only continuous geometry parameter, which makes it
  tempting, but widening re-lays-out every polygon. Width is seeded per robot, permanent.
- **Audio meaning for boundary lines** — count-based and decorative. Seeded; coloured as a darker
  tone of the host polygon's own colour (Crawford's Q3 answered: nothing to decide per robot).
- **Keeping the four waveform shape families as separate renderers** — one generator, one
  component. Whether waveform still shapes geometry is the held angle-dialect question, not a
  reason to keep four files.
- **Full facet triangulation** — the reference is a bevel ring with a flat face; full facets would
  destroy the flat face the lights and boundary lines sit on, and cost nodes ×12.
- **Hand-placed slot tables per shape** (the Phase 37/38 approach) — slots and socket positions
  were per-shape measurements; a generated polygon has no fixed outline to measure against, so
  lights and lines are placed relative to the inner polygon instead.
- **The Backing polygon as anything but dark** — it is the connecting piece and mostly hidden;
  Crawford's Q2 answered: a fixed near-black from the world palette's neutrals, not per robot.

## Open Questions

- **Six LFO targets, four corners.** Cap at four with a fixed target order (first four linked
  targets shown), or make orbiters = non-base layers (only two) and drop the corners to two? Decide
  before Branch B; A doesn't care.
- **Where exactly do the two Top-polygon lights sit** on a generated polygon — on the inner face,
  at seeded vertices, or at fixed positions regardless of shape? The current lamp is a fixed point
  per shape; a generator needs a rule.
- **Does the Mid polygon's colour (waveform hue) clash with the identity-coloured Top?** Branch B
  risk — may need the Mid to take a tone of identity instead and carry its layer only through lit
  state. Settle in the Branch B sketch, not now.
- **Angle dialect** — held, as above.
- **What happens to `identityGlass` / the window** — the window was the identity carrier; with
  identity on the body it has no job. Probably removed; confirm at the interview.
