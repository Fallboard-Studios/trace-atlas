# Intent: Robot Performance — Dynamics, Rests, Accents, Humanize

> **Status: built 2026-10-16** on `feature/palette-performance`, PR pending (spec [ROBOT_PERFORMANCE.md](../specs/ROBOT_PERFORMANCE.md),
> plan [ROBOT_PERFORMANCE.md](../tasks/ROBOT_PERFORMANCE.md), guard test `src/docs/robotPerformanceDocs.test.ts`). All four outcomes
> below were built as confirmed and Crawford's listen verdict was "it all sounds good"; the "as built" deltas are in
> [roadmap item 50.5](../todo/roadmap.md#505-robot-performance-dynamics-rests-accents-humanize). Three to know first: Rests and
> Accents live on the Composition section's own Articulation panel (the plan's PHRASING panel was no longer on any screen); the
> per-note rolls hash the robot's seed (`performanceRoll`) because `compositionSeed` is a 0–1 fraction and the spec's
> `seed + position` offset made a unison move together (found at Checkpoint D, fixed in T20); and the Pixel A/B (T18) was not run,
> so the phone gate is open, not passed.

Confirmed via `interview-me` on 2026-10-15 (9 questions; three corrections folded in, see
"What changed from the backlog" below), ahead of a `spec-driven-development` pass. Grew out of
backlog item 21 (now archived: [backlog-archive.md](../todo/archive/backlog-archive.md#21-audio-palette-trials-robot-dynamics-gate-length-humanize-and-rests))
and becomes the next sub-phase of the Audio Palette series, roadmap 50
([roadmap.md](../todo/roadmap.md#50-audio-palette-new-attributes-without-new-libraries)), proposed
number **50.5**. The roadmap entry and the backlog close-out are the spec pass's job.

## Outcome

Four new performance controls, all **trigger-time arithmetic or melody-generation data**, so the
phase adds **zero audio nodes** and no budget cost. Built in this order, one branch, one commit and
one listen checkpoint each:

1. **Dynamics** — per robot. Widens or flattens the velocity variance every note already gets
   (`computeNoteVelocitySeeded`, `src/engine/AudioEngine.ts:474`: a fixed 15 % chance of a ±25 %
   offset, `VELOCITY_VARIANCE_RATE` / `VELOCITY_VARIANCE_AMOUNT`, `:81–83`). The slider's neutral
   position reproduces today's sound exactly.
2. **Rests** — per robot. A seeded chance per melody event that the note **ends early and leaves
   silence** before the next onset; higher = more notes cut, and cut shorter. Not a skip: the event
   stays in the melody and still sounds.
3. **Accents** — per robot. Seeded articulation marks per melody event from the five classical
   kinds, each a velocity × length pair applied when the note is scheduled:

   | Mark | Velocity | Length |
   |---|---|---|
   | accent (>) | up | unchanged |
   | marcato (^) | up, harder | slightly shorter |
   | staccato (.) | unchanged | about half |
   | staccatissimo (▾) | unchanged | very short |
   | tenuto (—) | a little up | full, minimal gap |

   Higher = more events marked **and more kinds in play**. The classical accent's "onset then taper"
   is velocity-only here: the ADSR is shared per robot, so a per-note contour is not cheap.
4. **Humanize** — global. A seeded per-note timing offset of a few ms, inside `MIN_LEAD`, scaled by
   one fleet-wide slider. Built last, and the only one Crawford is not certain of ("like 95 %"):
   if it cannot be heard, it is dropped, not shipped off-by-default.

- **User:** Crawford, composing the fleet. These are not rare accents the way 50.1's were: every
  robot plays with its own dynamics, phrasing and articulation, and the fleet sounds *performed*
  rather than sequenced.
- **Why now:** 50.1–50.4 are merged (PR #558 last), the robot section tabs and the Fleet Params
  tabs exist, and the series' remaining per-robot ideas are exactly these. Pre-v1, so seeded
  defaults may change every world's sound (roadmap 50's standing rule).
- **Success:** on a fresh world each robot audibly differs in loudness swing, in how much air sits
  between its notes, and in how it strikes them; Dynamics at neutral is byte-identical to today;
  every mark and rest replays with the melody; the Pixel A/B is flat (it should be, with no nodes).

## Behavior

- **Rests and Accents are baked into the melody, not rolled at playback.** The melody generator
  (`generateMelodyForRobot`, `src/engine/melodyGenerator.ts:410`, shared by `spawnSystem.ts` and
  `regenerateMelody.ts`) seeds a rest and a mark per `MelodyEvent` (`src/types/Robot.ts:107`); a
  slider change regenerates them the way Density, Motif Length and Pitch Repeat already redraw
  their part of the melody. The reason, confirmed in the interview: a pattern that re-rolls every
  loop sounds like noise; one that repeats with the melody sounds like phrasing.
- **Rests and Accents stack.** A rest is phrasing (the line breathes); a staccato is how one note is
  struck inside a running phrase. A robot with both high gets choppy, which is what those settings
  mean. Neither replaces the other.
- **Dynamics is applied at trigger time**, in `scheduleNote` / `computeNoteVelocitySeeded`, as a
  per-robot scale on the variance width and/or rate. It composes with the existing motif-group
  accent (`GROUP_ACCENT_MULTIPLIER = 1.25`, `AudioEngine.ts:92`, applied via `accentMultiplier` in
  `processMelodyStep`, `:1195`) and with the new marks: mark velocity rides on top of dynamics
  variance, it does not replace it.
- **Humanize is applied at trigger time** to the schedule time in `processMelodyStep`
  (`time + MIN_LEAD`, `:1194`): an offset seeded off the note index, never a random draw, so a
  replay plays the same early/late pattern. The offset never pushes a note earlier than `MIN_LEAD`
  allows.
- **Sections.** Dynamics in **Levels** beside Volume and Pan (`ROBOT_SECTIONS_CONFIG` id `volume`,
  `src/data/robotSubsectionConfig.ts:57`). Rests and Accents in **Composition** beside Density /
  Motif Length / Pitch Repeat (id `melody`, `:63`). Humanize in **Fleet Params → Pacing** beside
  Tempo (`fleet.pacing.*`, `src/data/audioRigConfig.ts:402`).
- **Seeded fleet-wide, varied, not minority traits.** Every robot draws its own Dynamics, Rests and
  Accents value at spawn (`spawnSystem.ts`, beside the other audio draws, with
  `getUniformSeededVal` for anything band-like, per [PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md)).
  Humanize is seeded small in `globalAudioSeed.ts` with a row in `GLOBAL_AUDIO_LOADING_RANGES`.
  Crawford: "aside from the humanity, these are pretty important", so the default world uses them.
- **Persistence and companies, like every field since v1.** Per-robot fields join
  `RobotAudioOverrideDiff` and the share link, absent = seeded; Humanize joins `GlobalAudioSettings`
  and the payload's `globalAudio`. Companies broadcast the three per-robot fields the way Volume
  does (`useCompanyOptions`), broadcast-not-link.
- **Unchanged:** melodies still store note indices 0..7; the playback loop stays on the `16n`
  transport tick; nothing reaches the robot's body.

## Style / constraint

- Existing primitives only: `SliderLinear` schemas beside `DENSITY_SCHEMA` / `VOLUME_SCHEMA` /
  the Pacing tempo schema. Each control gets a help popover and holds its largest-content size.
- Content layer: lore names in the [copy-tone-guide](../reference/copy-tone-guide.md)'s voice for
  the four controls, in `src/content/copy/probe.ts` and `fleet.ts`; placeholders are acceptable
  as in 50.1, flagged as such.
- Every velocity, duration and time write lives in `AudioEngine` on the transport tick, never in a
  GSAP callback. State stays JSON-serialisable: numbers on `AudioAttributes` / `MelodyEvent` /
  `GlobalAudioSettings`.
- Replayability first (roadmap 50's shared constraint): every rest, mark and humanize offset is a
  pure function of seed and note position. **Caveat worth knowing before the spec:** today's
  velocity counter (`robotNoteIndex`, a live per-robot `Map` advanced per scheduled note) is *not*
  measure-derived, so "replays like velocity does" is weaker than the backlog claims. Marks and
  rests avoid this by living on the melody; Humanize and Dynamics should key off the event's
  position (step + measure) rather than a live counter, or accept velocity's existing looseness
  knowingly.
- Audio Load Budget: no new nodes, pinned by the construction-count test. One Pixel A/B at the
  end, expected flat; if not, the offender ships behind a `LOAD_*_MIN` or not at all.

## Out of scope

- **Per-note skipping** (the backlog's original "rests"): rejected, it is the opposite of Density.
- **A gate-length multiplier applied to every note**: rejected; the always-on version became the
  per-event, seeded Rests.
- **Per-robot Humanize**: global only; twelve timing sliders for a few ms is too much UI.
- **Accent *placement* patterns** (downbeat, backbeat, every third step): rejected; accents are
  marks on events, not a grid pattern.
- **Per-note envelope contours** for a true tapered accent: too costly with a shared ADSR.
- **Any new Tone node**, and any change to the Envelope or Source sections.
- **Any visual sign on the gem** (Visual Mapping guardrail).
- **Treating this as a trial**: Crawford is certain of Dynamics, Rests and Accents; only Humanize
  carries a "drop if inaudible" clause.

## What changed from the backlog (so item 21 is not re-read as the brief)

- "Trials, short branches, drop what doesn't earn its slider" → one real phase; three of four
  are wanted outright.
- "Rests = seeded skip chance" → rests shorten notes and leave silence; skipping is out.
- "Gate length = per-robot multiplier on every note" → folded into Rests as a seeded per-event
  chance; Gate as a control is gone.
- "Accents as a possible second step" → in scope, own slider, the five classical marks.
- Humanize moved from "per robot or global, undecided" → global, Pacing.

## Known implementation notes (not yet spec'd)

- **Data shape on `MelodyEvent`:** two optional fields, e.g. `rest?: number` (fraction of the
  length kept, or a cut length) and `mark?: 'accent' | 'marcato' | 'staccato' | 'staccatissimo' |
  'tenuto'`; absent = plain. Pitch Repeat's `MelodyEvent` field is the precedent. The spec fixes
  the velocity and length table per mark and how a rest and a staccato combine on one event
  (lean: the shorter wins, they do not multiply).
- **How Dynamics maps to the two constants:** rate only, width only, or both; and whether neutral
  sits mid-slider (so the slider can also flatten below today) or at zero. The spec decides;
  the interview fixed only that neutral = today exactly.
- **Accents slider semantics:** one value drives both coverage (fraction of events marked) and
  vocabulary (how many of the five kinds are reachable), in what order the kinds unlock, and
  whether tenuto counts as "mild" or "strong". Spec.
- **Humanize range:** a few ms; the spec picks the max (lean: ±10 ms) and confirms the
  `MIN_LEAD` floor. Seed source for the global draw is `deriveAttenuationStyleSeed`, like Tempo.
- **Rests × Density:** a rest shortens, Density adds or removes events; confirm in the spec that a
  high-Rests melody still has the same event count as its low-Rests twin.
- Roadmap: add 50.5 under roadmap 50 and move backlog 21 to the archive with a pointer here.
- Verify every file:line above against the tree before building; citations were checked on
  2026-10-15 against `main` at `2ec52f2f`.
