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
3. **Battery-driven, not job-driven**: every Active robot drains at its own rate, the flat base divided by its seeded battery size, whatever it is doing, and charges the same way (see "Battery size"). The job, the site, the station and the position are live visual state; nothing in the lifecycle reads them.
4. **Measure-quantized transitions**: every docking change is evaluated once per measure via BeatClock — never `setTimeout`/`setInterval`. This is what makes battery, docking and pitch drift headlessly replayable — see "Deterministic Replay" below.
5. **One seam to the visuals**: the tick writes docking, battery and melody, then calls `onLifecycleChange(localeId, robotId, to)` for the transitions that have a visual consequence. It never starts a swim, writes a position or picks a job itself.
6. **The dock mutes; Solo beats it**: a robot in its station (`Docked`, or `Undocking` on its way out) is silent because of its docking state (`isDockMuted` in `src/utils/robotAudibility.ts`), never because of its `audioMode`. `audioMode` is the user's alone (Robot Options' and the company screen's Audio Mode: Off, Mute, Solo, Highlight), and nothing in the lifecycle writes it, so a Solo, Mute or Highlight survives every dock and undock (Crawford, 2026-11-11; until then the landings wrote `'mute'` and `'none'` over it). A soloed robot is heard even in its station; Off and Highlight never make a docked robot heard, and a highlighted robot in its station highlights nothing. The melody stays registered the whole time, exactly like an `Active` robot's. The `AudioEngine` voice does not: the Audio Load budget stands every muted robot by — muted by the user, or by the dock unless soloed — so the voice is released after its last note and rebuilt when the budget admits the robot again (backlog 67's G1, [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). The rule is enforced at the note trigger (`isRobotAudible` in `triggerWithCap`).
7. **Animation never touches audio**: every work-loop timeline callback calls only work-loop functions or store writes, never `AudioEngine` (the Strict Separation guardrail). Animation speed doesn't follow the music, except that a job's length is read from the tempo when it starts (`jobDuration(bpm)`).
8. **A pause freezes measures; the day runs**: the power rocker pauses the world rather than tearing it down (`docs/specs/OFF_SCREEN.md` assumption 5; [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#power-is-a-pause)). The AudioContext is suspended, so the measure tick, and with it battery drain and recharge, the transition hold, pitch drift and the harmony, stop where they are and continue from there on resume — a replay by elapsed measures is unaffected, since no measure elapsed. The work loop's clock is shifted by the paused span and its `'world'` timelines are paused in place, so every robot is where it was and every site cooldown means what it did. The in-world day is wall clock (`DAY_DURATION_MS` from `dayStartTimestamp`) and is never gated: the light moves on while the tablet is off, and a world resumed after ten minutes resumes into a later hour.

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
/** 0-100, fractional. Drains while Active, recharges while Docked. Seeded at spawn. */
batteryLevel: number;
/** Divides both the drain and the charge. Seeded at spawn, never edited, shown or saved. */
batterySize?: number;
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
  `BATTERY_CRITICAL_THRESHOLD` (10) or below **while another robot is `Active`**. `beginRecall`
  writes the docking state and hold, then calls `onLifecycleChange(…, 'recalled')` (see "Recall"
  below).
  - **The last Active robot stays up** ([backlog 60](todo/archive/backlog-archive.md#60-audio-cover-the-silence-when-every-active-robot-is-charging),
    [spec](specs/NO_SILENCE_AND_COMPANY_FAMILIES.md) §1.2; 2026-11-11). A robot at or below critical
    with no other robot `Active` stays `Active` — a **stay** — and drains on to the floor of 0 until
    another lands on `Active`. So the fleet is never silent: a roster with an `Active` robot before a
    tick has one after it. The rule reads docking only, never `audioMode` (a muted last robot stays
    too) and never the Audio Load budget. A staying robot's docking doesn't change, so no landing
    effect and no seam call fire, and the work loop keeps it working. The step mutates its working
    roster in order, so roster order decides two cases: a robot landing on `Active` earlier in the
    roster relieves a staying one the same measure, one later in the roster the next measure; and of
    two robots crossing critical in one measure with no third `Active`, the earlier is recalled and
    the later stays. (From 2026-10-12 to 2026-11-11 there was no such guard, and the fleet went silent
    in 3.39 % of measures across 79 of 121 worlds; the original guard is `beb6abc0`.)
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
[ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#job-timeline). The same timeline carries the job's decoration:
one `.robot__work` group in the robot's row, made when the job starts and removed when it ends or is killed
(animation only, nothing here changes) — [Job decorations](ANIMATION_SYSTEM.md#job-decorations).

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
switch point clear of every midground silhouette, where the robot's row is written (`layer`; no
re-mount) under a 1 s dissolve; a ready site whose leg has no such point sits out that decision (it is offered as
not ready). Stations are front-row, except that a robot exits into the back row. `layer` is live
visual state like `activity`. The mechanics are in
[ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#layer-switch).

**No body.** A robot with no mounted body gets keyed, target-less timelines of the same length
(travel time, `jobDuration`, the wait, the arc), so `stopWorkLoop` can still kill them.

**Pause.** `pauseWorkLoop()` / `resumeWorkLoop()` (`docs/specs/OFF_SCREEN.md` assumption 4) freeze and
release the loop's clock without stopping the loop: `now()` is the base clock (`gsap.ticker.time`, or the
injected `now`) less every paused span, and while paused it returns the moment the pause began. So a
`readyAt` stamped before a pause is honoured after it as if no time had passed, two pauses accumulate,
and `startWorkLoop` / `stopWorkLoop` reset the offset. Only the clock: the loop's own timelines pause
through their `'world'` scope in `timelineMap`, which `powerController.pause()` drives beside this call
([ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#timeline-registry)). The `gsap.ticker` follow listener keeps
running through a pause and copies a frozen body's position, a no-op. Both are idempotent and no-ops with
no loop running.

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

**A turn-back can't happen on its own.** From a critical recall back to Active takes at least 16
measures (the smallest battery, size 0.67: the hold, 14 measures of recharge, and the undocking
hold; a size-1 robot takes 20), longer than any robot's swim home at any tempo — the loop sim
measures 0 turn-backs at 20, 110 and 200 BPM. The only real path is
a **hidden tab**: the browser slows GSAP, but the Transport keeps ticking, so the lifecycle runs
ahead of the visuals. Because every decision reads `docking`, the visuals converge however far
behind they fall. `workLoop.integration.test.ts` drives both turn-back cases at 200 BPM by running
the Transport ahead of GSAP.

## Battery

Evaluated once per measure by `tickRobotLifecycle(localeId, measure)`, called from a
`subscribeToMeasure` callback registered by `startRobotLifecycle`/`stopRobotLifecycle`:

| State | Per-measure change |
|---|---|
| `Active` | `-BATTERY_DRAIN_ACTIVE / batterySize` (6 ÷ size), whatever its job or activity, floored at 0 |
| `Docked` | `+BATTERY_RECHARGE_RATE / batterySize` (5 ÷ size), capped at 100 |
| `Undocking`, `Recalled` | none (the hold) |

```typescript
// src/constants/index.ts
BATTERY_DRAIN_ACTIVE = 6;      // the base; the robot's size divides it
BATTERY_RECHARGE_RATE = 5;     // the base; the robot's size divides it
BATTERY_CRITICAL_THRESHOLD = 10;
BATTERY_FULL_THRESHOLD = 100;
DEFAULT_BATTERY_SIZE = 1;      // a robot or snapshot with no size: the base rates
BATTERY_SIZE_MIN = 0.67;       // Gate A's band (Crawford, 2026-11-11)
BATTERY_SIZE_MAX = 1.5;
```

The battery is a plain fractional number: `localeStore.ts`'s `updateRobot` clamps it to 0–100 (and
drops a `NaN`) but no longer truncates it, so the live tick and the replay hold the same value
between measures. Spawn's start batteries stay whole; only the tick makes fractions. The readouts
round it.

### Battery size

Every robot draws one seeded `Robot.batterySize` at spawn — `generateBatterySize(noiseMap,
spawnCount)` in `spawnSystem.ts`, an even draw (`getUniformSeededVal`) at `'robot.batterySize'` on
`[BATTERY_SIZE_MIN, BATTERY_SIZE_MAX)` — and the step divides both its drain and its charge by it:
a big battery is a long shift and a long charge, a small one a short shift and a short charge, and
every robot keeps about the same share of airtime (44.4–45.9 % heard, measured). It is a seeded fact,
not a control: never edited, never shown, never saved in a session (regenerated from the world seed),
never inherited on the copy path. Absent, it reads as `DEFAULT_BATTERY_SIZE`, so hand-built test
robots keep the base rates.

**Cycle lengths are whole measures, so there are fifteen, not a continuum.** A shift always starts at
exactly 100 and transitions are checked once a measure, so a robot that needs *n* Active measures to
reach critical then needs ⌈1.2·*n*⌉ Docked ones (the size divides both rates, so it cancels), plus the
two one-measure holds. On 0.67–1.5, *n* runs from 11 to 23, so a cycle runs from 27 measures to 53.
Where 1.2·*n* is a whole number (*n* = 15 or 20) the charge lands on 100 or a hair under, depending on
the size's low bits, and a hair under costs one more measure: deterministic, the same in the live tick
and the replay. That is fifteen lengths (Crawford accepted it at Gate A, spec open question A2).
Robots of one length stay in step until a stay moves one: measured over the grid, the median world
has 3 robots sharing a length and the worst 5. The fleet as a whole no longer loops: before battery
size every robot's cycle was 35 measures and every world repeated every 35.

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
Crawford accepted on 2026-10-07.

Since battery size and the stay-up rule (2026-11-11) the same three base drains, on sized robots on
the 0.67–1.5 band, measure:

| Base drain | Mean Active | p10 | p90 |
|---|---|---|---|
| flat 5 | 5.71 | 3 | 8 |
| **flat 6 (shipped)** | **5.10** | **3** | **7** |
| flat 7 | 4.66 | 2 | 7 |

The mean barely moves and the spread narrows (p10–p90 3–7 against 2–8). `lifecycleSim.test.ts` pins
these rows, so a change that moves them has to say so.

## Landing Effects

**`landOnActive(localeId, robotId)`** — called when an `Undocking` robot's hold elapses:
1. Sets `docking: Active` and clears `dockingHoldUntilMeasure`. Leaving the station unmutes it; its
   `audioMode` is the user's and is left alone.
2. Calls `onLifecycleChange(localeId, robotId, 'active')`.

Voice reservation and melody registration are **not** done here — every robot gets both once, at
spawn (`spawnSystem.ts`'s `spawnRobot`), regardless of docking state, and they stay put across
dock cycles. The docking state is the only thing that changes.

**`landOnDocked(localeId, robotId, driftedMelody)`** — called when a `Recalled` robot's hold
elapses:
1. Advances the robot's dock-cycle count (`dockCycles.ts`'s `recordDockLanding`).
2. Sets `docking: Docked`, clears `dockingHoldUntilMeasure`, stores `driftedMelody`. Docking mutes
   it; its `audioMode` is left alone.
3. Re-registers the drifted melody with `AudioEngine`, so a robot soloed in its station plays the
   post-drift pitches. The caller, `tickRobotLifecycle`, computes the drift via
   `stepRobotLifecycle` and passes it in.
4. Calls `onLifecycleChange(localeId, robotId, 'docked')`. **No position write** here — position is
   the work loop's.

No voice is released and no melody is unregistered here — the dock's mute is the docking state
alone, and the Audio Load budget releases the voice (rule 6).

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
that moment. Elapsed measures for replay purposes is always
`getCurrentMeasure() - locale.createdAtMeasure`; no per-measure counter is stored on the locale
(the old per-measure mirror on the locale was removed with the One Day Clock phase, roadmap 48).

**`RobotLifecycleSnapshot`** (`robotSystems.ts`) — the subset of `Robot` a replay reads or writes,
deliberately narrower than `Robot`: `id`, `docking`, `batteryLevel`, `dockingHoldUntilMeasure`,
`melody`, `dockCycleCount`, `noteVariance` (pitch drift reads it), `batterySize` (both rates read
it; `toLifecycleSnapshot` carries it, and absent it reads as 1). Phase 43 dropped `job`,
`octaveRange`, `rhythmicDensity` and `rhythmicMotifLength`, which only fed job scoring.
`dockCycleCount` is carried as part of the snapshot (not a side channel) — the replay-side
equivalent of `dockCycles.ts`'s live counter, which `tickRobotLifecycle` reads when it builds each
snapshot, so the two stay numerically in sync.

**`stepRobotLifecycle(roster, measure, noiseMap, drain = activeDrain): RobotLifecycleSnapshot[]`**
(`robotSystems.ts`) — one measure's worth of transition for an entire roster, pure. Mirrors
`tickRobotLifecycle`'s battery/docking arithmetic exactly
(mutates a local working array in roster order, so within-measure ordering effects match a real
tick bit for bit — the stay-up rule reads that working array, which is the one place the step reads
joint roster state), plus a `Recalled`→`Docked` landing's pitch drift
(`reRollMelodyPitches`/`DOCKED_PITCH_DRIFT_RATIO`, seeded identically to the live path:
`getUniformSeededVal(noiseMap, 'robot.pitchDrift', dockCycleCount * 100 + callIndex, 0, 1)` using the
post-increment `dockCycleCount`). `drain` is a `DrainRule` (`(snapshot) => number`) returning the
base drain, before the robot's size divides it, defaulting to `activeDrain` (`BATTERY_DRAIN_ACTIVE`
for every Active robot); only the drain sim passes another.
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

- **Drain sim** (`runDrainSim`, Task 2) — the tables above.
- **Cover sim** (`createCoverTally` / `runCoverSim` / `formatCoverReport`, no-silence Tasks 1, 2 and 9)
  — steps each world's roster through the real step and counts, per measure, the robots sounding
  (`Active` or `Recalled`), silent measures, stays (a robot `Active` at or below critical after a
  tick) and their lengths, each robot's cycle length (the commonest gap between its landings on
  `Active`) and its heard share. `buildSimRoster(noiseMap, band?)` takes a battery-size band
  (`[min, max]`, the shipped one by default, or `'flat'` for no size), and `runCoverSim({ rows })`
  returns one row per band. Over 6,000 measures a world
  ([docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md](tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md),
  Results):

  | Row | Silent measures | Worlds with a stay | Stays / 1,000 measures | Stay length (median, p90, longest) | Sounding (mean, p10–p90) | Cycle lengths |
  |---|---|---|---|---|---|---|
  | Neither (before 2026-11-11) | 3.39 % in 79 / 121 worlds | — | — | — | 5.49, 2–9 | 35 only |
  | Size only (0.67–1.5) | 0.15 % in 108 / 121 worlds | — | — | — | 5.41, 3–8 | 27–53 |
  | Rule only | none | 92 / 121 | 0.13 | 2, 4, 9 | 5.49, 2–9 | 35 only |
  | **Both, shipped (0.67–1.5)** | **none** | **118 / 121** | **0.81** | **2, 5, 9** | **5.41, 3–8** | **27–53 (15)** |

  Each half alone leaves something: size alone makes silence rarer but longer and spreads it to more
  worlds; the rule alone fires about once per world and the fleet goes back to looping every 35
  measures. Together a robot is in a stay 0.20 % of measures. An always-on case pins zero silent
  measures over the grid at 2,000 measures.
- **Loop sim** (`runLoopSim` / `runReadinessSim`, Task 15) — the work loop's decisions (site
  choice, site cooldown, swims, job durations, station arcs) in seconds, interleaved with lifecycle
  measures at a given BPM, over each world's real work sites and stations. It pinned the site
  cooldown at 0.4/3/30 (Task 15), then, re-run at 20, 110 and 200 BPM once jobs became
  `jobDuration(bpm)` (6–10 s), at **0.3/2/30** (Task 16b). Results and method:
  [docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md), Tasks 15, 16b and 20.
  Two findings belong here: no turn-backs at any tempo (see "Turn-back"), and at 200 BPM a robot
  can still be visibly heading home up to ~17 s after it has landed on `Docked`. Re-run on sized
  robots on 0.67–1.5 with the stay-up rule (2026-11-11, `runReadinessSim`'s `band`): up to 10.0 s
  at 20 BPM, 20.3 s at 110 and 19.1 s at 200, with 0 robots charging while visible and 0 turn-backs
  at every tempo.

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
- Every robot draws its battery size (`generateBatterySize`, see "Battery size") at its spawn
  count, which is its roster index.
- `spawnRobot(localeId, { docking, batteryLevel })` sets `activity` from `docking` (Active →
  `'exiting'`, else `'charging'`) and places the robot at `generateSpawnPosition` (below the bottom
  edge). That position only stands for a lone `spawnRobot` call: `spawnInitialRoster` then runs
  `placeRosterAtStations`, which moves every robot to its station's port (see "Charging
  Stations").
- No job is assigned at load. A robot takes its first job at its first site.
- `spawnRobot`'s `AudioEngine.reserveVoice`/`registerRobotMelody` calls are **unconditional** —
  every robot gets a voice and a registered melody at spawn regardless of docking state.
  `audioMode` starts at `'none'` for every robot; a robot created `Docked` is muted by its docking
  state from the very first tick (rule 6).

## Audibility and the Audio Load Budget

Whether a robot is *heard* is now two independent things. **Eligibility** (`isRobotAudible` in `src/utils/robotAudibility.ts`) reads the user's `audioMode` and the robot's docking: Mute always silences; under any Solo only the soloed robots are heard, in their station or not; otherwise a robot in its station is silent (rule 6). **The Audio Load budget** ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)) then caps how many *eligible* robots may sound at once (2–12 by the Robot Load slider; all 12 at Full — the separate Effects Load slider doesn't affect this cap): `audioBudgetSystem` admits them first come, first served, and one that is eligible but over the cap **stands by** — silent, shown as "Standing by" on its card, otherwise unchanged.

Standing-by robots keep the whole lifecycle: they work, drain, dock, recharge, drift pitch and keep their registered melody. Only the sound stops: the note trigger is gated (`triggerWithCap`), and the voice is released after the last note and rebuilt on admission ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). So the battery cycle is what supplies the turnover — a robot docking frees its slot for the earliest waiter within a measure or two. An explicit unmute of a robot when the set is full does not jump the queue (it shows "Standing by" until a slot frees); a soloed robot always sounds. The lifecycle code itself is untouched — the budget system only reads `audioMode` and `docking` through a signature and writes nothing back to a robot.

The robot card shows all three side by side: `{docking} · {activity} · {audibility}` (spec §1.11).

## Mounts and the Power Cycle

`startRobotLifecycle(localeId)`/`stopRobotLifecycle()` are a module-singleton pair (one active
`subscribeToMeasure` unsubscribe function at a time), mirroring the retired
`startSpawnScheduler`/`stopSpawnScheduler`'s exact pattern. `worldTransition.ts`'s
`startLocaleSystems` — the START half of `initializeLocale`, run when its `startSystems` option is
true and by `powerController.powerOnSequence()` for a world built while the tablet was off — calls
`stopRobotLifecycle(); startRobotLifecycle(localeId);`, then `stopWorkLoop(); startWorkLoop(localeId);`,
then the swells' pair, unconditionally, and writes the world state `'running'`. The unconditional
stop first is what lets a repeat start (a second cold start, a retransmit) re-subscribe: without
`stopRobotLifecycle()` nulling the module's `lifecycleUnsubscribe` reference, a later
`startRobotLifecycle()` would see it as "already running" and never resubscribe.

**Power-off is a pause, not a teardown** (`docs/specs/OFF_SCREEN.md` §1.2; the order and the three
states are in [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#power-is-a-pause)). `powerController.pause()` freezes
the work loop's clock, pauses every `'world'` timeline and suspends the AudioContext; the lifecycle
subscription stands with its tick frozen, no timeline is killed, no site is released, no voice goes.
`resume()` undoes it in reverse, and the measure tick continues from the measure it was in.
`AudioEngine.killAll()` is no longer called by anything in the app. A world **change** is the teardown:
`removeLocale` releases each robot's voice, `initializeLocale(..., { startSystems: isPoweredOn })`
rebuilds, and with the tablet off it holds the systems and writes `'cold'`, so the next flip is a
`start`. `stopWorkLoop` (a world change, `startLocaleSystems`) kills every `work-*`, `swim-*`,
`bob-wait-*`, `station-*` and `dissolve-*` timeline and clears the site state. A job in progress is
first run to its end without its callback, so the orbiters are back on their docks and the bob at
rest before they're unlocked. The robot keeps whatever `activity` it had; the next start decides
what follows.

**Mounts.** `Robot.tsx`'s mount (a `useGSAP` layout effect) calls `onRobotMounted(localeId, robotId)`:

- **With the loop running** for that locale, the loop **adopts** the robot: its legs are dropped
  (a job finished silently), any site it held is released with no cooldown, and then it is hidden
  in its station (Docked or Undocking), exits it (`'exiting'`, or `'charging'` but Active), or is
  shown at full size and decides from where its body is.
- **With no loop yet** (a power-on mounts the scene before `initializeLocale` starts the loop), it
  only hides — Docked and Undocking robots at their port, `'exiting'` and `'charging'` ones in
  place — so nothing shows for a frame. `startWorkLoop` then adopts every robot with a mounted body.

`powerController.ts`'s `start()` — the cold path only; a resume starts nothing — calls
`spawnSystem.ts`'s `reRegisterAllRobotsAudio(localeId)`, which re-registers **every** robot in the
locale (not filtered by docking): every melody, and every voice the Audio Load budget has not stood
by. `reserveVoice` refuses a robot standing by (over the cap, or muted or docked since backlog 67's
G1), and that robot gets its voice back when the budget admits it
([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). `AudioEngine.killAll()` itself does not touch the
`compositeVoices` map (it only cancels/resets the Transport and calls `resetBeatClock()`), and
nothing calls it now, so voices are not invalidated by a power cycle; the re-registration is
defensive work carried over as-is rather than a verified requirement. The docking state (unaffected
by the power cycle, since it lives in `useLocaleStore`, not `AudioEngine`) is what keeps Docked
robots silent afterward.

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

## Testing Notes

`robotSystems.test.ts`, `workLoop.test.ts`, `workLoop.integration.test.ts`, `lifecycleSim.test.ts`,
`siteChoice.test.ts`, `stations.test.ts`, `spawnSystem.test.ts`, `worldTransition.test.ts` and `powerController.test.ts`
cover:
- the base drain for every Active robot whatever its job (mutation-checked: a re-introduced job surcharge breaks the prove-it test), both rates divided by the robot's battery size (a size of 0.85 is recalled on its 13th Active measure and starts Undocking on its 16th Docked one, 1.15 on its 18th and 22nd; mutation-checked: a size that divides the drain but not the charge), recharge math, both clamped; the store keeping a fractional battery
- threshold-triggered `Undocking`/`Recalled` entry with the hold, not an immediate landing; hold-elapsed landing on `Active`/`Docked`
- `landOnActive`/`landOnDocked` leaving every `audioMode` (Off, Mute, Solo, Highlight) as it was and not touching voice reservation/melody registration, writing no position, job or swim themselves, and calling `onLifecycleChange` with the right `to`; the `./workLoop` import as the tick's only route to visuals
- `landOnDocked` re-registering the drifted melody with `AudioEngine` so a robot soloed in its station plays the post-drift pitches
- the dock's mute and Solo beating it (`robotAudibility.test.ts`, `audioBudgetSystem.test.ts`, `AudioEngine.test.ts`, the roster tile and the World view's count): a Solo and a Mute each survive a dock cycle
- the stay-up rule: a sole `Active` robot at/below critical stays with no hold and no seam call, drains on to 0, and is relieved the same tick by a robot landing earlier in the roster and the next tick by one later; of two crossing critical together with no third `Active` the earlier goes and the later stays, with a third both go; beside only a `Recalled` or `Undocking` robot it stays; a muted last robot stays; over every grid world the Active count never reaches zero (mutation-checked: a robot that relieves itself, `Recalled` counted as `Active`, the pre-tick roster read)
- `stepRobotLifecycle`/`replayLifecycle` (the injected `DrainRule`, pitch drift matching the live seed formula, no cross-robot seed collision, compounding drift, the no-op case, `fromMeasure` excluded) and the prove-it test: a real 12-robot roster, every robot a different battery size, run for N real ticks and separately replayed, asserted identical field for field, through a stay and its relief, with a drained battery that never floored, charged ones that never capped and fractional ones (mutation-checked against the pre-drift melody, a job surcharge, a snapshot without the size and a store that truncates)
- the work loop: one robot per site, the cooldown, the job sticking until no ready site hosts it, recall in each activity, both turn-backs, adoption on mount and on start, settling, the body-less timelines, stop finishing a job silently, and callbacks that never touch `AudioEngine` (spy); every mutant run in Tasks 22–24 is killed
- the two robot rows (J4; plus `layerSwitch.test.ts` and `midgroundSilhouettes.test.tsx`): front → back and back → front legs, the switch point's clear run, the skip with no switch point, the 0.75 row scale, the dissolve copy in both directions and every interruption of it (stop, recall, a dropped leg's re-mount, an overlapping fade), exits into the back row, and `stations.test.ts`' guards that no station box or exiting robot overlaps a midground silhouette (0 of 284 over the grid). The J1–J3 loop tests run with `backHosts: false`
- the real tick into the real loop at 20/110/200 BPM: exit → transit → working → recall → the job finishes at full length → returning → entering → charging (hidden, slot lit) → undock → exit → working, plus the two hidden-tab turn-backs at 200 BPM (removing the returning turn-back fails that case)
- `spawnInitialRoster`'s active/docked split, seeded battery variation, every robot's battery size inside the band and filling it evenly (mutation-checked: a plain draw), determinism, every robot at its station's port with the right `activity`, one store write, and every robot (Docked included) holding a reserved voice/registered melody, every one with `audioMode: 'none'`
- `startRobotLifecycle`/`stopRobotLifecycle` and `startWorkLoop`/`stopWorkLoop` idempotency; `pauseWorkLoop`/`resumeWorkLoop` (a cooldown stamped before a pause is unexpired after it, two pauses accumulate, a start resets); `powerController.test.ts`'s pause and resume orders, the cold path, `markHeardWorld` once, and the fade awaited before either path
- `types/Robot.test.ts`: the deleted files are gone and no file in `src/` names a deleted identifier (below)
- `lifecycleSim.ts`: the sim roster matching the real spawn path (battery size included), determinism, no store/BeatClock (and no GSAP for the loop sim), the pinned drain rows, the cover tally on hand-built rosters, the cover sim against its own count world by world, zero silent measures over the grid, the band option, and the loop sim's hand-worked timelines for each work-loop branch

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
