# Robot Lifecycle Specification

Source of truth: [`src/systems/robotSystems.ts`](../src/systems/robotSystems.ts) (battery and docking,
on the measure tick) and [`src/systems/workLoop.ts`](../src/systems/workLoop.ts) (what a robot is
doing on screen, on wall-clock time: work sites, charging stations, recall and turn-back).

Robot Lifecycle (Roadmap Phase 7) replaced the dynamic spawn/despawn/persistence machinery that
existed through Phases 4–6 as test scaffolding. A locale's roster is created once, in full, at
locale load. Every robot cycles between `Docked` and `Active` for the rest of the session, driven
purely by its own battery level. Nothing is ever removed from the roster.

Robot Jobs and Stations (Roadmap Phase 43, [spec](specs/ROBOT_JOBS_AND_STATIONS.md)) split what a
robot *is* from what it *looks like it's doing*. J1 renamed the docking states, made the drain flat,
took the job out of the replay and routed every visual consequence of a transition through one seam,
`onLifecycleChange`. J2 points that seam at the **work loop**: robots exit seeded charging stations,
go to buildings that are ready for their job, work there, and swim back into a station when the
tick recalls them. The random wandering and the off-screen dock spot are gone (see "Removed in
Phase 43" at the end). J3 added the remaining job moves
([ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#job-moves)) and J4 the second robot row, so background
buildings host work too ([ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#layer-switch)); neither changes
either state machine.

## Core Principles

1. **Fixed roster, created once**: every locale spawns exactly `MAX_ROBOTS` (12) robots at load — no dynamic spawn scheduler, no manual spawn action, no removal.
2. **Two state machines, two clocks**: `Robot.docking` (Docked/Undocking/Active/Recalled) is battery-driven and ticks once per measure. `Robot.activity` (charging/exiting/transit/working/waiting/returning/entering) is the work loop's and runs on wall-clock GSAP time. The docking machine never reads `activity`; the work loop reads `docking` at every decision.
3. **Battery-driven, not job-driven**: every Active robot drains at the same flat rate whatever it is doing. The job, the site, the station and the position are live visual state; nothing in the lifecycle reads them.
4. **Measure-quantized transitions**: every docking change is evaluated once per measure via BeatClock — never `setTimeout`/`setInterval`. This is what makes battery, docking and pitch drift headlessly replayable — see "Deterministic Replay" below.
5. **One seam to the visuals**: the tick writes docking, battery, audio mode and melody, then calls `onLifecycleChange(localeId, robotId, to)` for the transitions that have a visual consequence. It never starts a swim, writes a position or picks a job itself.
6. **Muted by default while Docked, but overridable**: a `Docked` robot is hidden inside its station and has `audioMode: 'mute'` — the *same* field Robot Options' Audio Mode toggle writes to. Its `AudioEngine` voice stays reserved and its melody stays registered the whole time, exactly like an `Active` robot's — mute is enforced only at `scheduleNote()`'s `audioMode === 'mute'` check, so a user can flip a Docked robot's Audio Mode back to `none` in Robot Options and genuinely hear it, without anything in the lifecycle system fighting that override.
7. **Animation never touches audio**: every work-loop timeline callback calls only work-loop functions or store writes, never `AudioEngine` (the Strict Separation guardrail). Animation speed doesn't follow the music, except that a job's length is read from the tempo when it starts (`jobDuration(bpm)`).

## Data Structures

```typescript
// src/types/Robot.ts
const DockingState = {
  Docked: 'docked',
  Undocking: 'undocking',
  Active: 'active',
  Recalled: 'recalled',
} as const;
type DockingState = (typeof DockingState)[keyof typeof DockingState];

const JobType = {
  VentExtraction: 'ventExtraction',
  AcousticSurvey: 'acousticSurvey',
  StructuralInspection: 'structuralInspection',
  FluidMonitoring: 'fluidMonitoring',
  Salvage: 'salvage',
  Maintenance: 'maintenance',
} as const;
type JobType = (typeof JobType)[keyof typeof JobType];

/** The work loop's live visual state. */
type RobotActivity = 'charging' | 'exiting' | 'transit' | 'working' | 'waiting' | 'returning' | 'entering';
```

The docking names were inverted before Phase 43: `Docking` meant *leaving* the dock and `Departing`
meant *going back to it*. They are now `Undocking` and `Recalled`; the transitions and holds are
unchanged.

Fields on `Robot`:

```typescript
docking: DockingState;
/** Measure at which an Undocking/Recalled hold ends. Undefined when docking is Docked or Active. */
dockingHoldUntilMeasure?: number;
/** 0-100. Drains while Active, recharges while Docked. Seeded at spawn. */
batteryLevel: number;
/** Taken with a site (chooseNextSite) and kept across sites until none ready hosts it. Undefined
 *  until the first site; stale while charging. */
job?: JobType;
/** Set at spawn from docking (Docked → 'charging', Active → 'exiting'), the work loop's after that. */
activity: RobotActivity;
/** The station the robot is in, heading to, or last left. Assigned at locale load. */
stationId?: string;
/** The actor id of the work site the robot holds (heading to or working at). */
siteId?: string;
/** The gem canvas's top-left in the scene. Written by the work loop on every leg's arrival. */
position: Vec2;
```

All of these are plain JSON. None of `job`, `activity`, `stationId`, `siteId` or `position` is
replayed or saved in a session (see [SESSION_STORAGE.md](SESSION_STORAGE.md)). Timelines, site
cooldowns and DOM refs live outside the store.

## The Docking State Machine

```
        battery ≥ 100%
Docked ─────────────────▶ Undocking
  ▲                          │
  │                          │ hold elapses (up to 1 measure)
  │                          ▼
  └─────────── Recalled ◀── Active
       hold elapses            battery ≤ 10%
       (up to 1 measure)
```

- **`Docked` → `Undocking`**: triggered the measure a `Docked` robot's battery reaches
  `BATTERY_FULL_THRESHOLD` (100). Not an immediate jump to `Active` — `Undocking` is a real held
  state, and a silent one: `beginUndocking` writes the hold only and calls no seam. The robot stays
  hidden in its station.
- **`Active` → `Recalled`**: triggered the measure an `Active` robot's battery reaches
  `BATTERY_CRITICAL_THRESHOLD` (10) or below. `beginRecall` writes the docking state and hold, then
  calls `onLifecycleChange(…, 'recalled')` (see "Recall" below).
  - **Invariant — never zero `Active` robots**: before honoring a critical-battery trigger, the
    step checks whether any *other* robot is currently `Active`, reading the working roster as
    already updated this measure (not the stale pre-tick snapshot, so an earlier robot's recall
    *this same tick* is already reflected). If not — this is the last one standing — the
    transition is skipped and the robot stays `Active` regardless of battery, which keeps draining
    and floors at 0 (visually reflected by the existing battery-dim overlay, see `ROBOT_DESIGN.md`).
    It is re-evaluated every subsequent tick, so the moment any other robot lands back on `Active`,
    this robot's very next tick sees `stillActiveElsewhere = true` and is recalled normally — no
    separate "release" signal needed, just the same check re-run. When two robots cross critical
    in the same tick, iteration order means the first is recalled and the second is held.
- **The hold**: `dockingHoldUntilMeasure` is set to `measure + 1` at the moment of triggering. The
  robot lands (`Undocking` → `Active`, `Recalled` → `Docked`) the first measure tick at or after
  that value — "up to one measure," not always a full one: a threshold crossed right after a
  measure boundary waits nearly a full measure, one crossed right before it lands almost
  immediately. No visual's duration governs a landing: a recalled robot can land on `Docked` while
  it is still swimming home, and the work loop simply finishes the trip.
- **Landing effects** (`landOnActive`/`landOnDocked` in `robotSystems.ts`) are where audio and
  docking authoritatively change; each then calls the seam.

## The Activity State Machine

`Robot.activity` is the work loop's ([`workLoop.ts`](../src/systems/workLoop.ts)), on wall-clock
time. Every arrow is the end of a GSAP leg (or a seam call that cuts one short), and every decision
reads `docking`:

```
             ┌──────────────────────────────────────────────┐
             ▼                                              │
'charging' ──(Active)──▶ 'exiting' ──▶ next() ──▶ 'transit' ──▶ 'working' ──┐
   ▲                                    │  ▲                               │
   │                                    │  └──── 'waiting' ◀──(no site)────┤ next()
   │                                    │                                  │
'entering' ◀── 'returning' ◀──(not Active)──────────────────────────────────┘
```

| Activity | What the robot is doing | Ends when |
|---|---|---|
| `'charging'` | Hidden at its station's port (`autoAlpha: 0`), its slot lit | the seam's `'active'` (it exits) |
| `'exiting'` | The exit arc: appearing out of the port | the arc ends → `next()` |
| `'transit'` | Swimming to a site's `park`, holding the site | arrival → `'working'` |
| `'working'` | Its job timeline: bob, orbiters detach, work, reattach | the timeline ends → release → `next()` |
| `'waiting'` | No ready site: one finite bob of `WAIT_RETRY_SECONDS` (2 s) | the bob ends → `next()` |
| `'returning'` | Swimming to a station port, its slot reserved | arrival → `'entering'` |
| `'entering'` | The entry arc: vanishing into the port | the arc ends → `'charging'` (or `'exiting'`, see "Turn-back") |

A robot appears and disappears only at a station port. There's no off-screen spot any more.

## The Visual Seam

`onLifecycleChange(localeId, robotId, to: LifecycleChange)` (`workLoop.ts`;
`LifecycleChange = 'recalled' | 'active' | 'docked'`) is the only way the tick reaches anything
visual. `robotSystems.ts` imports it from `./workLoop`, and `robotSystems.test.ts` pins that import
as the tick's only route to visuals. It is called after the transition's own store writes have
landed. `Undocking` has no visual consequence and no call. A call for a locale other than the
running loop's, or with no loop running, does nothing.

The tick is a BeatClock subscriber, not a GSAP callback, so calling into animation code from it is
allowed (Strict Separation forbids the reverse: GSAP callbacks calling `AudioEngine`).

| `to` | What the work loop does |
|---|---|
| `'recalled'` | In `'transit'` or `'waiting'`: the swim or bob is killed, the site released with no cooldown, and the robot heads home now. In `'working'` or `'exiting'`: nothing — the leg finishes and its `next()` sends the robot home. |
| `'active'` | In `'charging'`: it exits. In `'returning'`: the swim home is killed and it goes back to work (turn-back). In `'entering'`: nothing — the arc finishes, then turns it back at the port. |
| `'docked'` | Nothing. The robot is already returning, entering or charging, and the entry ends in `'charging'` on its own. |

## The Work Loop

`startWorkLoop(localeId, { now?, rand? })` / `stopWorkLoop()` are an idempotent singleton pair,
like the lifecycle's. `now` defaults to `gsap.ticker.time` and `rand` to
`` Alea(`${localeId}:work`) ``. A start derives the world's eligible work sites once
(`isWorkSiteEligible` + `getWorkSite`, keyed by actor id — unique within any one world) and the
world's stations (`getStations`).

`next(robotId)` is the decision point, called as each leg ends:

- `'returning'` or `'entering'`: nothing — the leg in flight decides.
- `'charging'`: exit if `docking` is Active, else nothing.
- Otherwise, if `docking` isn't Active: home (`returnToStation`).
- Otherwise `chooseNextSite` (`siteChoice.ts`): keep the robot's job at the nearest ready site that
  hosts it; if none, switch to a job no other robot holds (`heldJobs`), weighted by its ready-site
  count, at its nearest ready site; if nothing is ready, `null` → `'waiting'`.

A site is **ready** when nobody holds it and its rest has run out. Leaving a site after working
there sets `readyAt = now + siteCooldown(n)`, where `n` is the world's eligible site count: `n` ×
`COOLDOWN_PER_SITE` (0.3 s), clamped to `COOLDOWN_MIN` (2 s) .. `COOLDOWN_MAX` (30 s). More
buildings, longer rest, so work spreads; few buildings, short rest, so robots don't starve. The
three values were pinned by the readiness sim below. One robot per site. The site state (`Map<siteId, { heldBy?, readyAt }>`) is module state, never Zustand: an
`Actor` write would re-render every factory layer. `getSiteState(siteId)` reads it, for tests and
diagnostics. `stopWorkLoop` clears it.

**A job.** In `'transit'` the robot swims to the site's `park` (`createSwimTimeline`, keyed
`swim-${id}`). On arrival `position` is written and it goes `'working'`: `buildJobTimeline` locks
its orbiters (`getOrbiterWork(id).lock()`), runs one `work-${id}` timeline lasting exactly
`jobDuration(bpm)` (10 s at 20 BPM down to 6 s at 200 BPM, the live tempo read at job start), and
in its `onComplete` unlocks them, releases the site with the cooldown and calls `next()`. The job
picks its moves (`JOB_MOVES`): Vent Extraction gathers and pulses, Acoustic Survey fans then rings,
Structural Inspection traces the outline, Fluid Monitoring traces the pipe then pulses at the valve,
Salvage carries and Maintenance rings with a spark flicker. The timeline itself is in
[ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#job-timeline).

**Coordinates.** Station ports and site `park`s are robot **centres**; `position` is the gem
canvas's top-left. `robotCentre(robot, gem)` / `positionForCentre(centre, gem)`
(`animation/jobMoves/sceneToOrbiterLocal.ts`) are the only conversion. Body scale doesn't move
the centre (`g.gem` scales about it), so neither takes a scale.

**Settling.** A leg cut short mid-swim or mid-bob leaves the body ahead of the store's `position`
(the last leg's destination). Before the next leg starts, the body's GSAP `x`/`y` is written back
to `position` if it is more than 0.01 u off.

**Two robot rows** (J4). With `backHosts` (`BACK_HOSTS_ENABLED`, true), background buildings host
too, and a robot working at one is drawn in the back robot row, behind the midground, at
`BACK_LAYER_SCALE` (0.75); `Robot.layer` says which row. A leg into the other row splits at a
switch point clear of every midground silhouette, where the robot re-mounts in its new row under a
1 s dissolve; a ready site whose leg has no such point sits out that decision (it is offered as
not ready). Stations are front-row, except that a robot exits into the back row. `layer` is live
visual state like `activity`. The mechanics are in
[ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#layer-switch).

**No body.** A robot with no mounted body gets keyed, target-less timelines of the same length
(travel time, `jobDuration`, the wait, the arc), so `stopWorkLoop` can still kill them.

**Every callback is guarded by run identity**: a leg that ends after a stop or a restart writes
nothing.

## Charging Stations

Each world has 2–3 seeded stations (`getStations(localeId)`, `src/systems/stations.ts`; placement
and the art are in [BUILDING_DESIGN.md](BUILDING_DESIGN.md#robot-jobs--hosts-work-sites-coverage-phase-43) and spec §1.6), each holding
`STATION_CAPACITY` (6) robots. A station is not state: it is derived from the seed on demand.

- **At load**, `spawnInitialRoster` ends with `placeRosterAtStations`: `assignStationsAtLoad` gives
  every robot a station by roster index modulo station count (it throws rather than overfill;
  6 × ≥ 2 ≥ 12 always fits), and one `setLocaleData` write puts every robot at its port, Docked ones
  `'charging'` and Active ones `'exiting'`. So a fresh world opens with its Active robots leaving
  their stations.
- **Going home**, a robot picks `nearestFreeStation` from its centre: the nearest station whose
  occupancy (robots with that `stationId` and activity `'returning' | 'entering' | 'charging'`) is
  below capacity, ties to the earlier station. The slot is reserved by writing `stationId` and
  `'returning'`, and frees itself when the activity changes. Every station full can't happen with
  12 robots; if it ever did, the robot would wait and ask again.
- **Entering** (`'entering'`), the robot vanishes into the port over `STATION_ARC_SECONDS` (1 s):
  scale 1 → `STATION_PORT_SCALE` (0.15) and opacity 1 → 0. Its halo ripple runs inward and the
  station's ripple (`playStationRipple`) plays beside it. It is then `'charging'`: hidden, `visibility: hidden`, out of
  the raster.
- **Exiting** (`'exiting'`), the reverse: it appears at the port (scale 0.15 → 1, opacity 0 → 1),
  ripples outward, then `next()`. A robot exits through the station it last entered, in the back
  robot row (J4): hidden, moved there, then the arc plays between the station's back plate and the
  rest of it, ending at the row's 0.75.
- **Reduced motion**: both arcs are a `STATION_REDUCED_ARC_SECONDS` (0.3 s) fade in place, with no
  scale and no station ripple.
- **Slot lights** are the occupancy display: a station lights one slot per robot with its
  `stationId` and activity `'charging'`, in the robot's identity colour, back to front in roster
  order. The selector key is `chargingColorsKey` (`stationOccupancy.ts`), so only a change to that
  station's lit set re-renders it.

The arcs, eases and timeline keys are in [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#station-arcs).

### Recall

The measure tick recalls a robot (`'recalled'`). What happens depends on what it is doing:

- **Working**: the job runs to its full length (the orbiters reattach and the bob ends at rest),
  then the job's own `next()` sees `docking` isn't Active and sends it home. The site gets its
  normal cooldown. It is muted from the tick, so it may finish silently.
- **In transit or waiting**: the swim or bob is killed and the robot heads home at once. It never
  worked at the site it held, so the site is released with **no cooldown** (`readyAt = now`).
- **Exiting**: the arc finishes, and its `next()` sends it straight back.

There is no "recall pending" flag. `docking` is the flag: every decision reads it.

### Turn-back

If a robot lands on `Active` again before it is inside its station, it turns back to work:

- **Returning**: the swim home is killed and the robot decides again from where its body is. The
  slot frees with the activity.
- **Entering**: killing the arc mid-way would pop the robot back to full size, so the arc
  finishes. Its end sees `docking` Active and plays the exit arc from where the entry left it.
  The robot never becomes `'charging'`.

**A turn-back can't happen on its own.** From a critical recall back to Active takes 20 measures
(the hold, 18 measures of recharge at 5 per measure from ≤ 10, and the undocking hold), longer
than any robot's swim home at any tempo — the loop sim measures 0 turn-backs. The only real path is
a **hidden tab**: the browser slows GSAP, but the Transport keeps ticking, so the lifecycle runs
ahead of the visuals. Because every decision reads `docking`, the visuals converge however far
behind they fall. `workLoop.integration.test.ts` drives both turn-back cases at 200 BPM by running
the Transport ahead of GSAP.

## Battery

Evaluated once per measure by `tickRobotLifecycle(localeId, measure)`, called from a
`subscribeToMeasure` callback registered by `startRobotLifecycle`/`stopRobotLifecycle`:

| State | Per-measure change |
|---|---|
| `Active` | `-BATTERY_DRAIN_ACTIVE` (6), whatever its job or activity |
| `Docked` | `+BATTERY_RECHARGE_RATE` (5), capped at 100 |
| `Undocking`, `Recalled` | none (the hold) |

```typescript
// src/constants/index.ts
BATTERY_DRAIN_ACTIVE = 6;
BATTERY_RECHARGE_RATE = 5;
BATTERY_CRITICAL_THRESHOLD = 10;
BATTERY_FULL_THRESHOLD = 100;
```

Battery never goes below 0 or above 100 (clamped both in the tick math and again at the
`localeStore.ts` `updateRobot` boundary, matching every other clamped robot field).

### Why 6 — the drain sim (Phase 43 Task 2)

Before Phase 43 an Active robot drained `BATTERY_DRAIN_BASE` (2) plus a per-job surcharge (vent
extraction 1, acoustic survey 3, structural inspection 5, fluid monitoring 7). The job is live
visual state now and can't feed a replayed number, so the drain went flat. The value was measured,
not guessed: `stepRobotLifecycle` takes an injectable `DrainRule`, and `lifecycleSim.ts`'s
`runDrainSim` replays real seeded rosters on the districts 121-coordinate grid for 2000 measures
each under the old rule and three flat candidates. Pooled Active count per measure:

| Drain | Mean Active | p10 | p90 |
|---|---|---|---|
| per-job surcharge (retired) | 5.05 | 3 | 7 |
| flat 5 | 5.70 | 2 | 9 |
| **flat 6 (shipped)** | **5.14** | **2** | **8** |
| flat 7 | 4.60 | 1 | 8 |

Flat 6's mean is closest to the old rule's. Its spread is wider (p10–p90 2–8 against 3–7), which
Crawford accepted on 2026-10-07. `lifecycleSim.test.ts` pins the flat rows, so narrowing the
snapshot again can't move them silently.

## Landing Effects

**`landOnActive(localeId, robotId)`** — called when an `Undocking` robot's hold elapses:
1. Sets `docking: Active`, clears `dockingHoldUntilMeasure`, sets `audioMode: 'none'`.
2. Calls `onLifecycleChange(localeId, robotId, 'active')`.

Voice reservation and melody registration are **not** done here — every robot gets both once, at
spawn (`spawnSystem.ts`'s `spawnRobot`), regardless of docking state, and they stay put across
dock cycles. `audioMode` is the only thing that changes.

**`landOnDocked(localeId, robotId, driftedMelody)`** — called when a `Recalled` robot's hold
elapses:
1. Advances the robot's dock-cycle count (`dockCycles.ts`'s `recordDockLanding`).
2. Sets `docking: Docked`, clears `dockingHoldUntilMeasure`, stores `driftedMelody`, sets
   `audioMode: 'mute'`.
3. Re-registers the drifted melody with `AudioEngine`, so a manual mute override plays the
   post-drift pitches. The caller, `tickRobotLifecycle`, computes the drift via
   `stepRobotLifecycle` and passes it in.
4. Calls `onLifecycleChange(localeId, robotId, 'docked')`. **No position write** here — position is
   the work loop's.

No voice is released and no melody is unregistered — muting is `audioMode` alone.

**The dock-cycle count** lives in `src/systems/dockCycles.ts` (`getDockCycleCount` /
`recordDockLanding`). Its one reader is pitch drift: `tickRobotLifecycle` threads it into each
replay snapshot. Live state only — never replayed or persisted.

## Pitch Drift

Every time a robot lands on `Docked`, `DOCKED_PITCH_DRIFT_RATIO` (25%) of its melody events get a
seeded `noteIndex` re-roll via `melodyGenerator.ts`'s `reRollMelodyPitches`:

```typescript
export function reRollMelodyPitches(
  melody: MelodyEvent[],
  ratio: number,
  opts: { noteVariance?: ToggleValue; rand: () => number },
): MelodyEvent[]
```

`startStep`, `length`, and `octave` are never touched — only pitch drifts, never rhythm. The
number of events changed is `Math.max(1, Math.round(melody.length * ratio))` — floored at 1, so a
short melody always changes at least one note. Reuses `melodyGenerator.ts`'s existing
`pickRandomIndices` (which events change) and `pickWeightedIndex` (the new pitch, when the
robot's `noteVariance` is active) — no new selection logic. This is recurring, not a one-time
spawn effect: a robot's pitch identity drifts gradually over many dock cycles across a session.

## Deterministic Replay (Roadmap Phase 20.5 — World Clock)

Battery, docking and pitch drift are replayable headlessly — given a roster's seeded spawn state and
a target elapsed-measures count, the exact end state a real measure-by-measure run would have
produced can be computed in a tight loop, with zero BeatClock subscription and zero
AudioEngine/GSAP side effects. This is the same "store the recipe, not the derived state" principle
melody's own base generation already follows (roadmap Phase 31). **Nothing the work loop owns is
replayed** (Phase 43): job, activity, station, site, position and robot row (`layer`) are live visual state on
wall-clock time, and nothing the replay computes reads them.

**`Locale.createdAtMeasure: number`** (`types/locale.ts`) — stamped once, at the same point
`dayStartTimestamp` is (`worldTransition.ts`'s `buildLocale`), reading `getCurrentMeasure()` at
that moment. **Not** the pre-existing `Locale.currentMeasure` field, which is unrelated legacy
state never incremented by the real tick system (its only use is a mount-time no-op self-write in
`App.tsx` to force a re-render). Elapsed measures for replay purposes is always
`getCurrentMeasure() - locale.createdAtMeasure`.

**`RobotLifecycleSnapshot`** (`robotSystems.ts`) — the subset of `Robot` a replay reads or writes,
deliberately narrower than `Robot`: `id`, `docking`, `batteryLevel`, `dockingHoldUntilMeasure`,
`melody`, `dockCycleCount`, `noteVariance` (pitch drift reads it). Phase 43 dropped `job`,
`octaveRange`, `rhythmicDensity` and `rhythmicMotifLength`, which only fed job scoring.
`dockCycleCount` is carried as part of the snapshot (not a side channel) — the replay-side
equivalent of `dockCycles.ts`'s live counter, which `tickRobotLifecycle` reads when it builds each
snapshot, so the two stay numerically in sync.

**`stepRobotLifecycle(roster, measure, noiseMap, drain = activeDrain): RobotLifecycleSnapshot[]`**
(`robotSystems.ts`) — one measure's worth of transition for an entire roster, pure. Mirrors
`tickRobotLifecycle`'s battery/docking arithmetic and the never-zero-`Active` invariant exactly
(mutates a local working array in roster order, so within-measure ordering effects match a real
tick bit for bit), plus a `Recalled`→`Docked` landing's pitch drift
(`reRollMelodyPitches`/`DOCKED_PITCH_DRIFT_RATIO`, seeded identically to the live path:
`getSeededVal(noiseMap, 'robot.pitchDrift', dockCycleCount * 100 + callIndex, 0, 1)` using the
post-increment `dockCycleCount`). `drain` is a `DrainRule` (`(snapshot) => number`), defaulting to
`activeDrain` (`BATTERY_DRAIN_ACTIVE` for every Active robot); only the drain sim passes another.
`noiseMap` is required — replay only ever runs against an already-spawned locale, which always has
one.

**`replayLifecycle(roster, fromMeasure, toMeasure, noiseMap, drain = activeDrain)`**
(`robotSystems.ts`) — calls `stepRobotLifecycle` once per measure from `fromMeasure + 1` through
`toMeasure` inclusive; a no-op if `toMeasure < fromMeasure + 1`. The one caller-facing entry point
for headless replay. In practice always called with `fromMeasure` = the locale's own
`createdAtMeasure` — replay always fully re-simulates from roster creation, never resumes from a
mid-point checkpoint, which is what lets pitch drift (and its own `dockCycleCount` sequencing) fall
out of the replay loop for free instead of needing separately-persisted history.

**What replay does *not* reproduce, and why that's fine:** on-screen position, motion, the job and
the activity are not measure-snapshot state — there's no "position at elapsed measure N" to replay
*to*. A replayed world would hand the work loop a roster whose `docking` is correct, and the loop
converges on it the same way it does after a hidden tab: Docked and Undocking robots are hidden in
their station, Active ones decide from where they are.

**No consumer wires this in yet.** Session Storage's `SessionPayload`, the shareable link (roadmap
Phase 21), and a future configuration scrubber (roadmap Phase 32) are all real candidates, but none
of them call `replayLifecycle` today — this phase is the foundation, proven by a dedicated test
(`robotSystems.test.ts`'s "prove-it: replay matches realtime") that N real ticks and one
`replayLifecycle` call converge on identical state, not a live UI feature.

A short, non-blocking audit of other timing-dependent systems (audio swells, LFO drift, ping
variance) — whether they're similarly replayable — is recorded in `docs/todo/backlog.md` item 17.
Short version: audio swells' trigger/target logic is already measure-seeded and safe the same way
robot lifecycle is; LFO phase is genuinely not (a real, continuous, wall-clock-driven oscillator,
by design) and would need a different, not-yet-built primitive if a future phase ever needs it.

## Headless Sims (`lifecycleSim.ts`, Phase 43)

`src/systems/lifecycleSim.ts` is pure: real seeded rosters (`buildSimRoster`, matching
`spawnInitialRoster` robot for robot), the real `stepRobotLifecycle`, no store, no BeatClock, no
GSAP. It runs over `SIM_SEED_COORDS`, the districts tests' 121-coordinate grid.

- **Drain sim** (`runDrainSim`, Task 2) — the table above.
- **Loop sim** (`runLoopSim` / `runReadinessSim`, Task 15) — the work loop's decisions (site
  choice, site cooldown, swims, job durations, station arcs) in seconds, interleaved with lifecycle
  measures at a given BPM, over each world's real work sites and stations. It pinned the site
  cooldown at 0.4/3/30 (Task 15), then, re-run at 20, 110 and 200 BPM once jobs became
  `jobDuration(bpm)` (6–10 s), at **0.3/2/30** (Task 16b). Results and method:
  [docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md), Tasks 15, 16b and 20.
  Two findings belong here: no turn-backs at any tempo (see "Turn-back"), and at 200 BPM a robot
  can still be visibly heading home up to ~17 s after it has landed on `Docked`.

The sim models the loop; it doesn't run `workLoop.ts`. The real loop under the real tick is
covered by `workLoop.integration.test.ts`.

Set `LIFECYCLE_SIM_REPORT=1` to print either report from `npx vitest run src/systems/lifecycleSim.test.ts`.

## Roster Creation

`spawnInitialRoster(localeId)` (`spawnSystem.ts`) creates exactly `MAX_ROBOTS` robots once, at
locale load:

- A seeded count within `[INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]` (2–4) start
  `Active` at full battery.
- The rest start `Docked`, each with an independently seeded, varied starting battery (0–99) so
  they don't all finish recharging in lockstep.
- `spawnRobot(localeId, { docking, batteryLevel })` sets `activity` from `docking` (Active →
  `'exiting'`, else `'charging'`) and places the robot at `generateSpawnPosition` (below the bottom
  edge). That position only stands for a lone `spawnRobot` call: `spawnInitialRoster` then runs
  `placeRosterAtStations`, which moves every robot to its station's port (see "Charging
  Stations").
- No job is assigned at load. A robot takes its first job at its first site.
- `spawnRobot`'s `AudioEngine.reserveVoice`/`registerRobotMelody` calls are **unconditional** —
  every robot gets a voice and a registered melody at spawn regardless of docking state.
  `audioMode` is set to `'mute'` when created `Docked` and `'none'` when created `Active`, so
  muting is consistent from the very first tick, not just after a robot's first dock/undock cycle.

## Audibility and the Audio Load Budget

Whether a robot is *heard* is now two independent things. **`audioMode`** (mute / solo, `isRobotAudible` in `src/utils/robotAudibility.ts`, unchanged) is the lifecycle's and the user's switch: `landOnDocked` mutes, `landOnActive` unmutes, and a user can override either. **The Audio Load budget** ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)) then caps how many *eligible* robots may sound at once (2–12 by the Robot Load slider; all 12 at Full — the separate Effects Load slider doesn't affect this cap): `audioBudgetSystem` admits them first come, first served, and one that is eligible but over the cap **stands by** — silent, shown as "Standing by" on its card, otherwise unchanged.

Standing-by robots keep the whole lifecycle: they work, drain, dock, recharge, drift pitch and keep their reserved voice and registered melody; only the note trigger is gated (`triggerWithCap`). So the battery cycle is what supplies the turnover — a robot docking (`audioMode: 'mute'`) frees its slot for the earliest waiter within a measure or two. An explicit unmute of a docked robot when the set is full does not jump the queue (it shows "Standing by" until a slot frees); a soloed robot always sounds. The lifecycle code itself is untouched — the budget system only reads `audioMode` and `docking` through a signature and writes nothing back to a robot.

The robot card shows all three side by side: `{docking} · {activity} · {audibility}` (spec §1.11).

## Mounts and the Power Cycle

`startRobotLifecycle(localeId)`/`stopRobotLifecycle()` are a module-singleton pair (one active
`subscribeToMeasure` unsubscribe function at a time), mirroring the retired
`startSpawnScheduler`/`stopSpawnScheduler`'s exact pattern. `worldTransition.ts`'s
`initializeLocale` calls `stopRobotLifecycle(); startRobotLifecycle(localeId);` and then
`stopWorkLoop(); startWorkLoop(localeId);` unconditionally on every call — this is what makes a
power cycle work, not just a locale swap: `AudioEngine.killAll()` (called on power-off, via
`powerController.ts`) triggers `resetBeatClock()` internally, which silently clears every
`subscribeToMeasure` listener. Without `stopRobotLifecycle()` running first to null out the
module's `lifecycleUnsubscribe` reference, a later `startRobotLifecycle()` would see it as "already
running" and never resubscribe — permanently killing the tick after the first power cycle.

Both power-off paths in `powerController.ts` call `stopRobotLifecycle()`, then `stopWorkLoop()`,
then `AudioEngine.killAll()`. `stopWorkLoop` kills every `work-*`, `swim-*`, `bob-wait-*` and
`station-*` timeline and clears the site state. A job in progress is first run to its end without
its callback, so the orbiters are back on their docks and the bob at rest before they're unlocked.
The robot keeps whatever `activity` it had; the next start decides what follows.

**Mounts.** `Robot.tsx`'s mount (a `useGSAP` layout effect) calls `onRobotMounted(localeId, robotId)`:

- **With the loop running** for that locale, the loop **adopts** the robot: its legs are dropped
  (a job finished silently), any site it held is released with no cooldown, and then it is hidden
  in its station (Docked or Undocking), exits it (`'exiting'`, or `'charging'` but Active), or is
  shown at full size and decides from where its body is.
- **With no loop yet** (a power-on mounts the scene before `initializeLocale` starts the loop), it
  only hides — Docked and Undocking robots at their port, `'exiting'` and `'charging'` ones in
  place — so nothing shows for a frame. `startWorkLoop` then adopts every robot with a mounted body.

`powerController.ts`'s `start()` calls `spawnSystem.ts`'s `reRegisterAllRobotsAudio(localeId)` on
power-on, which re-registers **every** robot in the locale (not filtered by docking) — every robot
keeps its voice/melody reserved regardless of docking state, so this pass covers all of them.
`AudioEngine.killAll()` itself does not touch the `compositeVoices` map (it only cancels/resets the
Transport and calls `resetBeatClock()`), so voices are not actually known to be invalidated by a
power cycle; the re-registration may be unnecessary defensive work carried over as-is rather than a
verified requirement. `audioMode` (unaffected by the power cycle, since it lives in
`useLocaleStore`, not `AudioEngine`) is what keeps Docked robots silent afterward.

## Known gaps

- ~~**Exiting robots draw in the front robot group**~~: closed by Phase 43 Task 34b (J4). An
  exiting robot is moved to the back robot row (`robots-back`, over the station's L4 and under
  L3) while hidden at the port, and its arc plays there at `BACK_LAYER_SCALE`.
- **A few background parks sit below the roof** (spec §7 Q6, raised in J1, still open). A park is
  `PARK_CLEARANCE` above the roof, clamped to `WORLD_MARGIN`, so the tallest background factories
  park lower. Measured over the 121-seed grid (2026-10-08): 10 of 1 523 eligible background sites,
  in 7 worlds, park below where they should (up to 52 units below the roof top), and in 4–7 of them,
  depending on body size, the robot overlaps the building. It can't clip: the back row draws over
  every background building, so the robot works in front of the facade's top instead of above
  the roof. The spec's options are to drop such sites or park them beside the building.
- **The orbiters' Size tween isn't stopped by the lock.** A Size edit mid-job would fight the pulse
  on `scale`.
- **The station ignores daylight**: the robots dim at night, the station doesn't. No spec rule asks
  for it.
- `Robot.lastInteractionMeasure` has had no writer since Task 6 deleted `interactionSystem.ts`.

## Testing Notes

`robotSystems.test.ts`, `workLoop.test.ts`, `workLoop.integration.test.ts`, `lifecycleSim.test.ts`,
`siteChoice.test.ts`, `stations.test.ts`, `spawnSystem.test.ts`, `worldTransition.test.ts` and `powerController.test.ts`
cover:
- the flat drain for every Active robot whatever its job (mutation-checked: a re-introduced job surcharge breaks the prove-it test), recharge math, both clamped
- threshold-triggered `Undocking`/`Recalled` entry with the hold, not an immediate landing; hold-elapsed landing on `Active`/`Docked`
- `landOnActive`/`landOnDocked` setting `audioMode` (not touching voice reservation/melody registration), writing no position, job or swim themselves, and calling `onLifecycleChange` with the right `to`; the `./workLoop` import as the tick's only route to visuals
- `landOnDocked` re-registering the drifted melody with `AudioEngine` so a manual mute override plays the post-drift pitches
- the never-zero-`Active` invariant: a sole `Active` robot at/below critical battery stays `Active` (including floored at exactly 0) instead of being recalled; it is recalled on a later tick once another robot has landed back on `Active`; and when two robots cross critical in the same tick, only one is recalled while the other is held
- `stepRobotLifecycle`/`replayLifecycle` (the injected `DrainRule`, pitch drift matching the live seed formula, no cross-robot seed collision, compounding drift, the no-op case, `fromMeasure` excluded) and the prove-it test: a real 12-robot roster run for N real ticks and separately replayed, asserted identical field for field (mutation-checked against a broken invariant guard, the pre-drift melody and a job surcharge)
- the work loop: one robot per site, the cooldown, the job sticking until no ready site hosts it, recall in each activity, both turn-backs, adoption on mount and on start, settling, the body-less timelines, stop finishing a job silently, and callbacks that never touch `AudioEngine` (spy); every mutant run in Tasks 22–24 is killed
- the two robot rows (J4; plus `layerSwitch.test.ts` and `midgroundSilhouettes.test.tsx`): front → back and back → front legs, the switch point's clear run, the skip with no switch point, the 0.75 row scale, the dissolve copy in both directions and every interruption of it (stop, recall, a dropped leg's re-mount, an overlapping fade), exits into the back row, and `stations.test.ts`' guards that no station box or exiting robot overlaps a midground silhouette (0 of 284 over the grid). The J1–J3 loop tests run with `backHosts: false`
- the real tick into the real loop at 20/110/200 BPM: exit → transit → working → recall → the job finishes at full length → returning → entering → charging (hidden, slot lit) → undock → exit → working, plus the two hidden-tab turn-backs at 200 BPM (removing the returning turn-back fails that case)
- `spawnInitialRoster`'s active/docked split, seeded battery variation, determinism, every robot at its station's port with the right `activity`, one store write, and every robot (Docked included) holding a reserved voice/registered melody with `audioMode` matching its docking state
- `startRobotLifecycle`/`stopRobotLifecycle` and `startWorkLoop`/`stopWorkLoop` idempotency, and the power-off order
- `types/Robot.test.ts`: the deleted files are gone and no file in `src/` names a deleted identifier (below)
- `lifecycleSim.ts`: the sim roster matching the real spawn path, determinism, no store/BeatClock (and no GSAP for the loop sim), the pinned flat-drain rows, and the loop sim's hand-worked timelines for each work-loop branch

## Removed in Phase 43

History, so an old reference can be traced. None of this exists in `src/` any more; `types/Robot.test.ts` guards it.

- **The legacy adapter** (`lifecycleVisuals.ts`, J1): the seam's first target, which kept the
  pre-Phase-43 visuals. On `'recalled'` it swam the robot straight down off-screen
  (`pickExitDestination` + `createSwimTimeline`); on `'docked'` it wrote an off-screen dock spot
  from `generateSpawnPosition`, seeded by the dock-cycle count; on `'active'` it ran `assignJob`
  then `handleRobotIdle(…, { isReturning: true })`. Deleted at Task 24.
- **Idle wandering** (`idleSystem.ts`): `handleRobotIdle` picked a random on-screen destination
  (`pickDestination`, the `'idle.target.*'` noise keys) and swam there, forever. Its bottom-only
  rules confined a returning robot to `BOTTOM_HALF_Y_RANGE` and a robot below
  `BATTERY_LOWER_THIRD_THRESHOLD` (15 %) to `LOWER_THIRD_Y_RANGE`, so exits stayed short. Replaced
  by the work loop.
- **`RobotState`** (`Robot.state`: Idle/Moving/Selected/Interacting/Leaving), `Robot.destination`
  and `Robot.direction`: the wandering's state. Replaced by `Robot.activity`.
- **Job affinity scoring**: `scoreJobAffinities` scored the original four jobs from a robot's
  seeded melodic attributes (register, density, motif length, variance), and `assignJob` gave each
  newly Active robot its best job not already held by `JOB_MAX_ROBOTS_PER_TYPE` (3) others. Salvage
  and Maintenance were never chosen. Replaced by `chooseNextSite`: jobs follow which buildings are
  ready.
- **Per-job battery surcharges** and the job in the replay snapshot (J1, above).
- `interactionSystem.ts` and the factory production fields (J1 Task 6); `collisionSystem.ts` went
  earlier, in roadmap Phase 19.
