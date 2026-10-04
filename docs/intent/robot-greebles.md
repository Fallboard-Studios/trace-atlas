# Intent: Robot Greebles (seeded, permanent hardware)

Written 2026-10-03 from Crawford's direct decisions, no interview needed — ahead of a sketch gate
and a `spec-driven-development` pass. Branch 2 of three in
[docs/ideas/robot-visual-rework.md](../ideas/robot-visual-rework.md) (live visuals → greebles →
layer markers). Depends on branch 1 ([robot-live-visuals.md](robot-live-visuals.md)) reaching its
visual checkpoint: the window and lamp positions decide where parts can go.

**This intent supersedes the greeble decisions in the set-aside hull record** (count from cutoff,
later decay; audio-derived placement). Crawford, 2026-10-03: "I don't want greebles to pop in/out
like that, it's not natural nor lore friendly. Instead, they can just have a seeded amount that are
permanent. I'm ok with them scaling, and I'm ok with them moving as necessary if the robot changes
shape."

## Outcome

Every robot carries a small, fixed set of recognisable hardware parts — panels, tanks, radars,
stickers and the like, in the existing flat style — placed inside its silhouette at spawn and
never added to or removed from afterward. The set is what makes two robots of the same shape and
similar colour tell apart. Parts ride the body: they scale with it and move with it when an audio
edit changes the body's shape, but no edit changes *which* parts a robot has.

## Behavior

- **Seeded count and seeded parts, permanent.** A robot's greeble set — how many, which part
  types, and where — is drawn once at spawn from the noise map with its own dataId(s), the same
  treatment as `identityColor` and `compositionSeed` (`spawnSystem.ts`: own dataId, offset =
  spawn index, never user-edited, never inherited on the copy path). It is stored on the robot as
  plain serialisable numbers, so a reload or a share link regenerates the identical set. No
  Robot Options edit, no battery state, no time of day adds or removes a part.
- **Parts ride the body.** Positions are expressed in the shape's 96×72 body space, inside the
  same `scale(torsoAspect,1)` group as the hull, so a sustain or register edit that widens or
  shrinks the body stretches and scales the parts with it. That is the only motion a greeble has.
- **Inside the silhouette, clear of the fixtures.** Parts never poke outside the outline and never
  overlap the window, the lamp, the vent or the rivets. Each shape gets a hand-measured interior
  region (or a few) that seeded positions are mapped into.
- **A vocabulary, not noise.** A small set of part types (order of five), each hand-drawn once in
  the current style — flat fills, the existing rivet/vent greys plus the robot's own `accent` and
  `shadow` colours — so a part reads as *a thing* at world scale. No part carries the identity
  colour.
- **Hidden at thumbnail scale.** Not rendered in the 64 px card avatar; rendered in the 96 px
  detail avatar and in the world. `RobotBody` gains a rendering-context prop for this, the same
  pattern as `ignoreDaylight`.
- **The release cliff keeps its job.** The existing `.details` group (vent, panel lines, warning
  stripes) stays as branch 1 leaves it; greebles are a separate, always-present layer. (Whether
  the vent later becomes a vocabulary part is a sketch-stage question, not a requirement.)
- **The audio-driven greeble helpers go.** `calculateGreebleCount`, `calculateGreebleSize`,
  `calculateGreeblePersistence`, `calculateGreeblePlacementBias` and `calculateDetailLevel`'s
  only remaining caller are deleted with their tests, along with the never-read greeble props on
  the shapes and in `RobotBody`'s memo. Persistence (a duration) has no meaning for a permanent
  part and is dropped without replacement.

## Style / constraint

- **Guardrail amendment, second carve-out, one commit.** CLAUDE.md's Visual Mapping line (as
  amended by branch 1 for `identityColor`) gains a second documented non-audio layer: the seeded
  greeble set, confined to hardware parts inside the silhouette. The same four places change
  together as in branch 1: `CLAUDE.md`, `.github/copilot-instructions.md`, `docs/ROBOT_DESIGN.md`
  ("Identity layer" becomes "Non-audio layers": identity colour + greeble set), and the comment on
  the new `Robot` fields. Everything that is *not* a greeble or the window/lamp stays audio-driven.
- **Sketch first, by eye.** A static HTML sketch in `docs/sketches/` showing the vocabulary on all
  four shapes at world scale and at the 96 px avatar scale, with several seeded sets per shape,
  before any React work. Crawford picks and tunes the parts there.
- **Seeding conventions.** New dataIds follow `docs/PROCEDURAL_GENERATION.md` (a single-value
  dataId uses a fixed non-zero, non-integer offset; renaming a dataId is a breaking change to every
  world). Adding dataIds changes nothing already seeded.
- **State stays JSON-serialisable.** Part positions are numbers on the robot, never DOM or
  computed props. No GSAP, no `requestAnimationFrame`, no timers.
- **Perf.** Twelve robots × a handful of parts is a bounded element count; the idle-paint lesson
  from the hull (element count, not geometry, drives paint) means the vocabulary should favour
  one element per part. `npm run perf` before/after is the exit gate if the sketch's part count
  exceeds about six per robot.

## Out of scope

- **Parts that appear or disappear on any edit, battery or time** — rejected by Crawford; see the
  quote above.
- **Audio-driven count, size, placement or part choice** — superseded. The only audio influence is
  indirect: the body's own scale and aspect.
- **Identity colour on parts** — the carve-out stays confined to window glass and lamp.
- **Layer markers** — branch 3; they read `layers[1..]` live and are a different thing.
- **Motion** — no wobble, no sway; parts are bolted on.
- **Changing the four outlines, the window, the lamp, the vent or the rivets.**

## Assumptions to confirm at the spec (not decided by Crawford yet)

1. **Count range** — something like 2..6 per robot, seeded uniformly. Tune in the sketch.
2. **Storage shape** — a `greebles: Array<{ kind: number; slot: number }>` on `Robot`, with the
   per-shape slot → position table living in code, not on the robot — so a later redesign of a
   shape's interior moves every robot's parts without a data migration. Alternative: store raw
   normalised positions. The slot model is the recommendation.
3. **Which shape's slots a robot uses** follows the robot's *current* shape (waveform), so
   changing the Baseline waveform in Robot Options re-slots the same parts onto the new outline.
   Parts persist; their coordinates follow the hull.
4. **Detail avatar shows parts; card avatar hides them** — Crawford's earlier guess, unconfirmed.
5. **Vocabulary of about five**: panel seam, small tank, radar dish, antenna stub, sticker/decal.
   The sketch decides.
