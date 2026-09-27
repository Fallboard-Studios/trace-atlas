# Intent: Robot Systems Engine (Roadmap Phase 7)

Confirmed via `/interview-me` on `main`, 2026-08-26. Covers
[Roadmap Phase 7](../todo/roadmap.md#7-robot-systems-engine) — building the pure Battery,
Docking, and Job domain models and state machines, and retiring the dynamic spawn/despawn/
persistence machinery they replace.

This doc is **wider than the roadmap's own bullet list**. The roadmap's Removal section names only
"the current Robot Options console tab (robot count min/max slider, auto-spawn toggle)" and the
`persists` field — but that tab was already dropped in Phase 3 (see [UI_SHELL.md](../UI_SHELL.md)
§Console Navigation). What's actually still live and needs retiring is the *machinery* behind it:
`locale.settings`' spawn fields, `spawnSystem.ts`'s scheduler and min/max "bounce" logic,
`removeSystem.ts`'s exit animation, `persists` itself (field, toggle, and the power-cycle functions
that key off it), and `RobotsTab.tsx`'s manual "+ New Robot" button. All of it was deliberate test
scaffolding kept alive through Phases 4–6 while this phase's real replacement didn't exist yet.

## Outcome

`src/types/Robot.ts` gains Battery, Docking, and Job types; `src/systems/robotSystems.ts` holds the
pure logic. The old dynamic-roster machinery is removed in the same phase, not left dangling.

- **Roster:** Locale load spawns exactly **12 robots once** (`MAX_ROBOTS` stays 12, but as a fixed
  roster size, not a ceiling a scheduler bounces against). **2–4 robots (seeded)** start `Active`;
  the remaining 8–10 start `Docked`, each with a seeded (varied, sub-100%) starting battery level so
  the docked robots don't all finish recharging in lockstep.
- **Docking state machine:** `Docked | Docking | Departing | Active`, following the existing
  `RobotState` const-object pattern (`Robot.ts:14-21`). Purely battery-driven — Job never gates a
  transition. `Docking`/`Departing` are real, held states lasting **up to one measure** (not a fixed
  full measure — the hold is "until the next measure boundary" from whenever the threshold was
  actually crossed), landing on `Active`/`Docked` at that boundary.
- **Battery system:** `currentEnergy`/starting energy tracked per robot, evaluated once per measure
  via BeatClock (`scheduleRepeat`/`subscribeToMeasure` — never `setInterval`):
  - While `Active`: drains **2%/measure base**, plus a **per-job surcharge** — Job 1 +1% (3% total),
    Job 2 +3% (5% total), Job 3 +5% (7% total), Job 4 +7% (9% total).
  - While `Docked`: recharges flat **5%/measure**, same rate for every robot.
  - **≤10%** triggers recall (`Active` → `Departing`). **100%** triggers redeploy-eligible
    (`Docked` → `Docking`).
  - At spawn, starting battery levels are **seeded**, not `Math.random`, using the same
    `getSeededVal`/noise-map pattern every other spawn-time attribute already uses.
- **Landing effects:** the moment a robot lands on `Active` or `Docked` (i.e. `Docking`→`Active` or
  `Departing`→`Docked`), its voice/melody is hard mute/unmuted — reusing the *existing*
  `AudioEngine.reserveVoice`/`releaseVoice` + `registerRobotMelody`/`unregisterRobotMelody` calls
  `spawnSystem.ts`/`removeSystem.ts` already make. **No new AudioEngine capability** — no gain ramp,
  no timed crossfade.
- **Pitch drift:** every time a robot lands on `Docked`, **25% of its melody events (rounded, floor
  of 1)** get a seeded `noteIndex` re-roll, through the same seeded generation path
  `melodyGenerator.ts`/`spawnSystem.ts` already use. `startStep`, `length`, and `octave` are
  untouched — rhythm never changes, only pitch. This is recurring (every dock cycle), not a
  one-time spawn effect, so a robot's pitch identity drifts gradually over a session.
- **Job system:** assigned automatically the moment a robot lands on `Active` (including the 2–4
  robots that start `Active` at spawn) via a **deterministic, seeded affinity-scoring function**
  over the robot's existing melodic attributes (octave range, rhythmic density, motif length, note
  variance) against four job profiles (adapted from the reviewed Gemini draft — see Constraint for
  what was cut):
  1. Volatile Vent Extraction — low register, tight/dense rhythm, low note variance
  2. High-Altitude Acoustic Surveying — high register, sparse rhythm, high/unrestricted variance
  3. Structural Integrity Inspection — wide octave span, mid-length motifs, balanced density
  4. Substation Fluid Monitoring — mid register, default/mid density and variance
  Assignment is roster-balanced (sorted by affinity score, skipping jobs already at their per-type
  cap) so all four profiles stay represented rather than collapsing onto whichever job scores
  highest for every robot. Job is **pure data/scoring** — no world position, no per-job visual
  behavior, no coupling to specific factories or depth layers.
- **Removed in this phase:** `spawnSystem.ts`'s `startSpawnScheduler`/`stopSpawnScheduler`/the
  min/max "bounce" branch in `spawnRobot`; `locale.settings.{maxRobots,minRobots,autoSpawn,
  spawnFrequency}` (`types/locale.ts`, `worldTransition.ts`'s `buildLocale`); `persists`
  (`Robot.ts` field, `RobotMetaTab.tsx`'s toggle, `removeNonPersistentRobots`/
  `reRegisterAllRobotsAudio` in `spawnSystem.ts`); `removeRobotWithExit`'s exit-animation path in
  `removeSystem.ts` (no robot is ever removed from the roster anymore — docking replaces removal);
  `RobotsTab.tsx`'s "+ New Robot" button and its `spawnRobot` call site.

## User

Crawford (solo dev), for hands-on testing of the robot lifecycle as its own system — this needs to
be genuinely exercisable (watchable, listenable) before Phase 8 (Robot Selection UI) and Phase 9
(Robot Options UI) build real controls on top of it.

## Why now

The old min/max/auto-spawn/`persists` machinery was always temporary: it existed so Phases 4–6 had
*something* resembling a robot roster to test against while the real lifecycle wasn't built yet.
Phase 7 is the point where that's no longer true, so the scaffolding comes out in the same phase its
replacement goes in, rather than accumulating as dead-but-load-bearing code for Phase 8/9 to inherit.

## Success

- `Robot.ts` defines `Battery`, `DockingState` (or equivalent naming — TBD in the spec), and `Job`
  types, following the existing `RobotState`/`AudioAttributes` conventions (const-object + derived
  union type, JSON-serializable, no runtime-only values).
- `src/systems/robotSystems.ts` exports pure functions for: per-measure battery drain/recharge,
  threshold-triggered `Docking`/`Departing` transitions with the up-to-one-measure hold, landing
  effects (mute/unmute wiring), job affinity scoring + roster-balanced assignment, and the
  docked-pitch-drift re-roll — all measure-driven via BeatClock, none using `setTimeout`/
  `setInterval`/`Math.random`.
- Locale load produces exactly 12 robots: 2–4 seeded `Active` (each with a Job already assigned),
  the rest `Docked` with varied seeded starting battery.
- Watching a locale for several minutes shows robots cycling: `Active` robots' battery visibly
  drains, they eventually recall to `Docked` (silently, after an up-to-one-measure hold), and
  previously `Docked` robots redeploy to `Active` (audibly, same hold) once recharged — with roughly
  the job-appropriate mix of jobs represented across the currently-active robots.
- A robot that docks and later redeploys plays a melody with the same rhythm but ~25% different
  pitches than before it docked.
- `spawnSystem.ts`, `removeSystem.ts`, `types/locale.ts`, `worldTransition.ts`, `RobotMetaTab.tsx`,
  and `RobotsTab.tsx` no longer reference the removed scheduler/min-max/`persists`/exit-animation
  code — confirmed by `npm run build:types` and `npm run lint` passing clean, plus a grep for
  `persists`/`autoSpawn`/`minRobots`/`maxRobots`/`startSpawnScheduler` returning nothing outside
  this phase's own new code (or `MAX_ROBOTS`, which survives as the fixed roster-size constant).
- `docs/UI_SHELL.md`'s "Planned Replacement" point on `robotOptions` is folded in per the roadmap's
  Docs bullet, and the new `docs/ROBOT_LIFECYCLE.md` documents the three state machines and
  `robotSystems.ts`'s API, added to CLAUDE.md's reference doc list.

## Constraint

- No new `AudioEngine` capability — mute/unmute reuses the existing `reserveVoice`/`releaseVoice` +
  `registerRobotMelody`/`unregisterRobotMelody` calls verbatim. No gain ramp, no timed crossfade.
- No world-position or factory coupling for Job — no depth-layer field, no anchoring to specific
  `Actor`/factory instances, no robot movement toward a job site. The factory/world side of Gemini's
  draft (Layer 1/2/3 depth, factory-anchored job sites) is explicitly deferred to a future
  factory-world overhaul, expected after this roadmap completes.
- All recurring timing goes through BeatClock (`scheduleRepeat`/`subscribeToMeasure`), matching
  `docs/BEAT_CLOCK.md`'s own "factory production cycle" precedent for non-audio, measure-based game
  logic — never `setTimeout`/`setInterval`/`requestAnimationFrame`.
- All seeded values (starting battery, active/docked split, job scoring, pitch re-roll) go through
  `getSeededVal`/the locale noise map, matching every other spawn-time attribute — never
  `Math.random` or `crypto.randomUUID()`-style non-determinism.
- Existing `RobotState` (`Idle`/`Moving`/`Selected`/`Interacting`/`Leaving`) is untouched — Docking
  is a second, orthogonal state machine layered alongside it, not a replacement. In-world idle
  movement/interaction behavior for `Active` robots is unchanged by this phase.

## Out of scope

- Job-specific visual behaviors (sonar rings, laser inspection checks, gauge SVGs) and any GSAP
  timeline work beyond what already exists for swim/interaction animation.
- Factory-anchored job positions, depth-layer movement, and any change to `factoryPlacementSystem.ts`
  or `BUILDING_DESIGN.md`'s systems — deferred to the future factory-world overhaul.
- Audio crossfades or any new `AudioEngine` gain/ramp API.
- Robot Selection cards, Battery/Job/Docking status badges, and the Robot Options drawers that read
  this data (Phase 8, Phase 9) — this phase only produces the data and transitions those UIs will
  read.
- Session Storage's override-reapplication logic (Phase 12) — this phase doesn't touch persistence
  beyond removing the `persists` field itself.
