# Intent: Robot Jobs and Charging Stations

Confirmed via `interview-me` on 2026-10-06 (five questions, every guess confirmed, restate confirmed
"correct"), ahead of a `spec-driven-development` pass. Built on the idea one-pager
[docs/ideas/robot-jobs-and-stations.md](../ideas/robot-jobs-and-stations.md) (idea-refine, same
day). Roadmap Phase 43. Sequenced after World View Districts (Phase 42) D1 + D2.

> **Shipped (J2, 2026-10-08).** Stations, the work loop, recall and turn-back and the card states
> behave as this intent describes, with one move (`hover-pulse`) for every job until J3. Two
> changes came from the sketches, both Crawford's: **orbiter count no longer drives job speed**
> (every job lasts 6–10 s, set by the tempo at job start), so "More orbiters finish faster" below
> is superseded; and the station is his own gem design, not a placeholder. Checkpoint C passed
> 2026-10-08; Crawford's Pixel listen is still open. As built:
> [docs/ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md).

## Outcome

Each world reads as a working colony. Robots exit 2–3 seeded floating gem charging stations, go
where buildings need them, and their orbiters visibly do one of six jobs — replacing the random
wandering of `idleSystem.ts` and the bottom-only exit/entry of `robotSystems.ts`.

## Behavior

- **Stations:** 2–3 per world, static, floating, gem art style, seeded from the locale noise map like
  the rest of the world. Capacity 6 each, with slot lights showing occupancy. A robot enters and
  exits through the halo ripple (`useHaloMotion`'s `decorateArc` — its first caller) and is
  invisible while charging. It exits the station it entered. A locale's initially Active robots
  start by exiting a station.
- **Buildings call robots (lazy readiness):** a host building is ready when no robot holds it and
  its cooldown since last served has elapsed. Cooldown scales with the number of available hosts.
  One robot per building. Nothing is scheduled; readiness is checked when a robot asks.
- **Job choice:** when a robot leaves a station or finishes a job it goes to the nearest ready
  building hosting its current job. If none is ready it switches to a job no other robot holds
  (repeats only once every job is taken), weighted by how many ready buildings host each job. If
  nothing is ready it bobs in place and asks again shortly after. The job sticks until the robot
  charges, unless it has to switch for lack of a ready building.
- **Working:** at the building the robot bobs while its orbiters detach and play the job's moves at
  the building's work anchors, then reattach. More orbiters finish faster (job time ≈ 5 s − the
  job's work rate × orbiter count) — density driving speed is deliberate. A density change mid-job
  does not interrupt it; after reattaching, the orbiters catch up to the current count once.
- **Six jobs from five moves:** Vent Extraction, Acoustic Survey, Structural Inspection, Fluid
  Monitoring (existing), Salvage and Maintenance (new); moves `hover-pulse`, `trace`, `ring`,
  `carry`, `fan`. Each robot's `gemSeed` varies its take on a move, so company members that look
  alike still work differently.
- **Low battery:** the measure tick recalls the robot as today. It finishes the current job, then
  swims to the nearest station with a free slot. It is muted on the tick as today (it may finish
  silently). If it lands Active again before reaching the station, it turns back to work.
- **Battery and replay:** battery stays on the measure tick with one flat drain rate for every
  Active robot; the job leaves the World Clock replay, which stays exact for battery, docking and
  pitch drift. On-screen robot count and audio persistence stay as they are today.
- **Animation time:** animations run at their own wall-clock speed and never touch the music —
  nothing looks silly at 20 or 200 BPM.
- **Depth:** a second moving robot layer behind the midground lets background buildings host jobs.
  A robot switches layers only where it overlaps no midground building, and draws at 0.75 scale in
  the back. Bubbles sit between the two robot layers.
- **Cards** show more states (lifecycle and activity). The detail avatar keeps its orbiters
  attached. Clicking a robot behaves as today.
- **Unchanged:** pitch drift on docking; the never-zero-Active invariant; the Audio Load Budget;
  the battery dim overlay; robot identity and the gem body.

## Style / constraint

- Success: Crawford can tell what each robot is doing at a glance across a few live worlds; no long
  waits for a free building; no pops at stations or layer switches.
- Audio wins: no new Pixel dropouts is the hard line. `perf:idle` per branch as in Phases 39/40; a
  miss stops and reports, a small residual is accepted only by Crawford's explicit call, a large
  one means redesign. If the depth layers (J4) fail on the Pixel, fall back to "background
  buildings don't host".
- No Visual Mapping guardrail change. GSAP timelines trigger semantic state only, never
  `AudioEngine`. State stays JSON-serializable; timelines and DOM live outside Zustand.
- Shape: a motion-sketch gate first (five moves on two host types, a station enter/exit with a
  placeholder gem station until Crawford's own design arrives; the spec pins behaviour, slot count
  and a shape budget, the sketch supplies the geometry), then four branches — **J1** lifecycle and
  world (flat drain, renamed states, job out of replay, dead code out, host lists, `workAnchors`,
  the ≥3 jobs × ≥4 hosts guarantee, station placement, the readiness sim), **J2** stations and the
  loop with one move plus the card states, **J3** all moves and all six jobs, **J4** depth layers.

## Out of scope

- Time of day in job choice (the hour is wall-clock, measures follow tempo).
- Per-job or per-orbiter battery drain.
- Lifecycle light colours (low-power red, charging yellow, full-power).
- Visible building calls (seeded call schedules with lights).
- A colony economy (work leaving marks that accumulate).
- Job animations on cards or the detail avatar.
- Persisting or replaying job, position, station or cooldowns.
- Power-cycle polish — a separate pass; for now a power cycle kills the work, swim and station
  animations.
- Travel between locales ("destinations" are the world at one pair of coordinates).
- The districts' `dock` pad family (dropped; stations replace it).

## Known implementation note (not yet spec'd)

- The cooldown formula, the waiting retry delay and the job-time constants — pinned by the
  readiness sim and the sketch.
- The station's geometry — Crawford's drawing, via the sketch.
