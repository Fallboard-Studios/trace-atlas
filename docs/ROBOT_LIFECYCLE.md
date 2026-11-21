# Robot Lifecycle Specification

Source of truth: [`src/systems/robotSystems.ts`](../src/systems/robotSystems.ts) (battery and docking,
on the measure tick) and [`src/systems/workLoop.ts`](../src/systems/workLoop.ts) (what a robot is
doing on screen, on wall-clock time: work sites, charging stations, recall and turn-back).

Robot Lifecycle (Roadmap Phase 7) replaced the dynamic spawn/despawn/persistence machinery that
existed through Phases 4–6 as test scaffolding. A locale's roster is created once, in full, at
locale load. Every robot cycles between `Docked` and `Active` for the rest of the session, driven
by its group's plan on its journey's turns (roadmap 94, below). Nothing is ever removed from the roster.

Companies Together (Roadmap 94, [spec](specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md),
[plan](tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md)) moved when a robot comes and goes from its own
battery to its **group** (a company, or one freelancer): each group's exit and entrance are planned on
turning measures of its journey, ahead, at a pace written for 60 BPM and scaled by the tempo; a
company is recalled together and waits at its ports so its sound ends on one bar line; the battery is
a gauge that follows the plan. Until 2026-11-20 a robot was recalled when its own battery reached 10
and undocked when it reached 100, each member of a company on its own cycle.

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
2. **Two state machines, two clocks**: `Robot.docking` (Docked/Undocking/Active/Recalled) is plan-driven and ticks once per measure. `Robot.activity` (charging/exiting/transit/working/waiting/returning/entering) is the work loop's and runs on wall-clock GSAP time. The docking machine never reads `activity`; the work loop reads `docking` at every decision. One exception, outside both machines: audibility reads whether the robot is in its station from `activity` (rule 6, backlog 84), because the lifecycle can land a robot on `Docked` while it is still on its way in (a late member, below).
3. **The plan decides; the battery is a gauge** (roadmap 94): a group's exit turn and entrance are drawn on its journey's turns when it comes out and when it is home (see "The plan"), and the docking machine moves on them. The battery follows: it falls in a straight line to 10 on the bar line after the exit turn and rises to 100 on the entrance (see "Battery"). It is never the cause of a recall or an undocking. The job, the site, the station and the position are live visual state; nothing in the lifecycle reads them.
4. **Measure-quantized transitions**: every docking change is evaluated once per measure via BeatClock — never `setTimeout`/`setInterval`. The step reads the tempo and the world's key, both handed in, and nothing else outside the roster. This is what makes the battery, the plans and the docking headlessly replayable — see "Deterministic Replay" below.
5. **One seam to the visuals**: the tick writes docking and battery, then calls `onLifecycleChange(localeId, robotId, to)` for the transitions that have a visual consequence. It never starts a swim, writes a position or picks a job itself.
6. **The dock mutes; Solo beats it**: a robot in its station (`Docked`, or `Undocking` on its way out, and `'charging'`) is silent because of where it is (`isDockMuted(docking, activity)` in `src/utils/robotAudibility.ts`), never because of its `audioMode`. The silence begins at `'charging'`, not at the `Docked` landing: a recalled robot is heard all the way home, through the swim and its station fade, and a `Docked` robot that is `'returning'` or `'entering'` still sounds (backlog 84, [specs/PLAY_UNTIL_IN_THE_STATION.md](specs/PLAY_UNTIL_IN_THE_STATION.md) §1.3; `activity` is a required parameter, so no reader can leave it out). `audioMode` is the user's alone (Robot Options' and the company screen's Monitor Mode: Auto, Mute, Solo, Highlight; Auto is `'none'`), and nothing in the lifecycle writes it, so a Solo, Mute or Highlight survives every dock and undock (Crawford, 2026-11-11; until then the landings wrote `'mute'` and `'none'` over it). A soloed robot is heard even in its station; Auto and Highlight never make a robot in its station heard. A Highlight counts only while its robot is heard: one in its station, silenced by another robot's Solo, or standing by is not in the live Highlight set the Audio Load budget pushes, so it dips nobody (backlog 81, [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). The melody stays registered the whole time, exactly like an `Active` robot's. The `AudioEngine` voice does not: the Audio Load budget stands every muted robot by — muted by the user, or by the dock unless soloed — so the voice is released after its last note and rebuilt when the budget admits the robot again (backlog 67's G1, [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). The rule is enforced at the note trigger (`isRobotAudible` in `triggerWithCap`).
7. **Animation never touches audio**: every work-loop timeline callback calls only work-loop functions or store writes, never `AudioEngine` (the Strict Separation guardrail). Animation speed doesn't follow the music, except that a job's length is read from the tempo when it starts (`jobDuration(bpm)`).
8. **A pause freezes measures; the day runs**: the power rocker pauses the world rather than tearing it down (`docs/specs/OFF_SCREEN.md` assumption 5; [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#power-is-a-pause)). The AudioContext is suspended, so the measure tick, and with it every group's plan, the battery gauge, the transition hold, the harmony and the melody journey, stop where they are and continue from there on resume — a replay by elapsed measures is unaffected, since no measure elapsed. The work loop's clock is shifted by the paused span and its `'world'` timelines are paused in place, so every robot is where it was and every site cooldown means what it did. The in-world day is wall clock (`DAY_DURATION_MS` from `dayStartTimestamp`) and is never gated: the light moves on while the tablet is off, and a world resumed after ten minutes resumes into a later hour.

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
/** 0-100, fractional. A gauge (roadmap 94): falls while out, rises while home. Seeded at spawn. */
batteryLevel: number;
/** Seeded at spawn, never edited, shown or saved. Only the group's earliest member's is read: it scales the group's
 *  windows (see "The plan"). */
batterySize?: number;
/** The measure this robot next lands Active on: its group's entrance, or a staggered bar after it. Set while home. */
entersAtMeasure?: number;
/** The turning measure this robot fades over; its sound ends on the bar line after. Set while out; absent on an
 *  Active robot means it is staying. */
exitsAtMeasure?: number;
/** The tempo the two above were last scaled at. */
shiftBpm?: number;
/** Where the entrance and the exit turn aim, unsnapped, after a tempo change; absent: the move itself. */
entersAim?: number;
exitsAim?: number;
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
replayed or saved in a session (see [SESSION_STORAGE.md](SESSION_STORAGE.md)). The five move
fields are live lifecycle state like `docking`: replayed, never saved, linked or shown; a loaded
world starts again from "Roster Creation". Timelines, site cooldowns and DOM refs live outside the
store.

## The Docking State Machine

```
        measure ≥ entrance − 1
Docked ─────────────────────▶ Undocking
  ▲                              │
  │                              │ hold: the entrance
  │                              ▼
  └─────────── Recalled ◀────── Active
   hold: the bar line     measure ≥ exit turn − lead,
   after the exit turn    and a robot outside the group is Active
```

The step is `stepShiftLifecycle(roster, measure, env)` (`robotSystems.ts`, roadmap 94), `env` the
tempo and the world's key; one pass over a working copy in roster order, pure. A robot moves at most
one state a tick.

- **`Docked` → `Undocking`**: the measure before a `Docked` robot's entrance (`entersAtMeasure`),
  holding until the entrance. `Undocking` is a real held state, and a silent one: `beginUndocking`
  writes the hold only and calls no seam. The robot stays hidden in its station.
- **`Undocking` → `Active`**: on its hold, the entrance. If no member of its group carries an exit
  turn, it is the group's first out and the **exit is drawn** for every member, those still home
  included (`planExit`, see "The plan").
- **`Active` → `Recalled`**: the lead before its exit turn (`exitsAtMeasure − recallLeadBars(bpm)`),
  **while a robot outside its group is `Active`**; then every `Active` member of its group due on
  that measure is recalled in the same pass, each held until the bar line after its own exit turn.
  `beginRecall` writes the docking state and hold, then calls `onLifecycleChange(…, 'recalled')` (see
  "Recall" below).
  - **The stay: the last group out stays up, whole** (roadmap 94, spec §1.9; before it, the last
    *robot*, [backlog 60](todo/archive/backlog-archive.md#60-audio-cover-the-silence-when-every-active-robot-is-charging)).
    A member due for recall with no robot outside its group `Active` is not recalled, and every
    `Active` member of its group loses its exit turn: the group **stays**, whole. Once a robot
    outside the group is `Active` (one freelancer is enough), the staying members all take the first
    turn of their journey the lead allows, together. So the fleet is never silent: a roster with an
    `Active` robot before a tick has one after it. The rule reads docking only, never `audioMode` (a
    muted last group stays too) and never the Audio Load budget. A staying robot's docking doesn't
    change, so no landing effect and no seam call fire, and the work loop keeps it working. Roster
    order decides two cases: relief landing earlier in the roster gives the new exit the same
    measure, later in the roster the next; and of two groups due on one measure with no third
    `Active`, the earlier in the roster is recalled whole and the later stays whole.
  - **A company that is the whole roster** (every robot in one company; the roster board allows it)
    has no robot outside it to relieve a stay, so it would never leave. The step then groups each
    member alone (`lifecycleGroupOf`): the last `Active` robot stays, the rule before roadmap 94, and
    each member's entrance is drawn when it docks; its journey and draws stay the company's
    (Crawford, 2026-11-21: "last robot stays").
- **`Recalled` → `Docked`**: on its hold. If every member of its group is now `Docked`, it is the
  group's last home and the **entrance is drawn** for every member, and the exit turns are spent
  (`planEntrance`). A member still `Undocking` (the last of a stagger) is not home: it keeps the
  group's exit, lands `Active`, is recalled on it, and the entrance waits for it. A `Docked` robot
  with no entrance likewise waits until every mate is `Docked`.
- **The holds**: an `Undocking` robot's is its entrance; a `Recalled` robot's is the bar line after its
  exit turn, so its sound can end there (see "Recall"). A move that is overdue (a hand-built robot, a
  tempo change on a slow world) holds until the next measure, never fires twice in one tick. No
  visual's duration governs a landing: a late member can land on `Docked` while it is still on its
  way in, and the work loop simply finishes the trip.
- **A tempo change** (spec §1.12): at the top of the step, a robot whose `shiftBpm` differs from the
  live tempo has each move's **aim** rescaled (`rescaleAim`): the measures from now to the aim (the
  move itself until a first change) times new ÷ old, unrounded, so the seconds still to go are kept
  exactly; the move is then the first turn of its group's journey at or after the rounded aim
  (`turnAtOrAfter`), an exit never nearer than the lead + 1 and an entrance never nearer than 2, so
  nothing changes docking on the tick of the change. Scaling the aim and not the snapped turn means
  a slider drag, a tick at each tempo, snaps once: scaling the turn snapped forward at every tick
  and pushed an exit 20 bars off to about 115 over a drag from 60 to 200 BPM and back (review
  2026-11-21). A robot taking a mate's move takes its aim too. A `Recalled` or `Undocking` robot
  keeps its hold.
- **A robot out of step** (spec §1.14: company edits, hand-built robots): an `Active` robot with no
  exit turn takes the earliest a mate can still make, else the stay's rule; a `Docked` robot with no
  entrance waits while its group is out, takes a home mate's, or with its whole group home and none,
  draws the group's now. A move brought from another group is dropped: a `Docked` robot's entrance
  while a mate is out and it carries no exit (a staggered member always carries the group's), and an
  `Active` robot's exit turn that no mate shares and that is no turn of the group's journey, while a
  mate is out on an exit of its own.
- **Landing effects** (`landOnActive`/`landOnDocked` in `robotSystems.ts`) are where audio and
  docking authoritatively change; each then calls the seam.

### The plan (roadmap 94)

The arithmetic is [`src/systems/shiftPlan.ts`](../src/systems/shiftPlan.ts), pure and knowing no
roster shape beyond what it is handed:

- **A group** is a company (`companyId`) or one robot alone (`groupIdOf`). Its journey is its
  company's journey key, whatever each member's own Journey setting says, or the fleet's for a
  freelancer (`groupJourneyKey`). Its size is the `batterySize` of its member earliest in the roster
  (`groupSize`). Its draws are four per turn of its journey, from `${worldKey}:${companyId}:shifts` or
  `${worldKey}:${compositionSeed}:shifts`, memoised, so a turn's draws never depend on what was asked
  first (`groupDraws`).
- **The turns** are `journeyTurns(key, from, to)` in `melodyJourney.ts`: each turning measure at
  `JOURNEY_TIME_MAX`, its pair index, its move (the shares' distance, 0 to 2) and whether it is a
  drop. A turn's **weight** is 1 for a drop, else its move up to 1.
- **The pace** (`shiftWindow`): lengths are written in bars at `SHIFT_REFERENCE_BPM` (60) and scaled
  by bpm ÷ 60. Out: at least `SHIFT_OUT_BASE_BARS` (12) × size, at most `SHIFT_OUT_MAX_BARS` (32);
  home: at least `SHIFT_HOME_BASE_BARS` (16) × size, at most `SHIFT_HOME_MAX_BARS` (40); never under
  `SHIFT_MIN_BARS` (8), and the most never under 16 past the least. (The four were 15, 40, 20 and 50
  until 2026-11-21, when Crawford's ear took 20 % off.) A size-1 group:

  | Tempo | Out, bars | Home, bars | The lead, bars |
  |---|---|---|---|
  | 20 BPM | 8–24 | 8–24 | 2 |
  | 40 BPM | 8–24 | 11–27 | 4 |
  | 60 BPM | 12–32 | 16–40 | 6 |
  | 100 BPM | 20–53 | 27–67 | 10 |
  | 200 BPM | 40–107 | 53–133 | 20 |

- **The exit** (`planExit`), drawn when a group's first member lands `Active`: the turns in its out
  window walked in order, leaving on one when its leave draw is under `SHIFT_LEAVE_ODDS_MIN` (0.35)
  plus up to `SHIFT_LEAVE_ODDS_MAX` (0.95) by weight (always on a drop), the last if none; at the
  chosen turn a **group exit** (every member on it) under `GROUP_EXIT_ODDS_MIN` (0.5) plus up to
  `GROUP_EXIT_ODDS_MAX` (0.95) by weight (always after a drop), else a **drifting exit**: the
  members, in a drawn order, on the turns from it on, one each.
- **The entrance** (`planEntrance`), drawn when a group's last member lands `Docked`: the turns in
  its home window walked at `SHIFT_ENTER_ODDS` (0.5) whatever the move, the last if none; together
  under `ENTRANCE_TOGETHER_ODDS` (0.7), else the members in a drawn order `ENTRANCE_STAGGER_BARS`
  (2) apart from the turn on. A big company's stagger narrows so its last member is out by its out
  window's least (`floor(least ÷ (members − 1))` bars apart, together at 0): a company of five or
  more at a slow tempo otherwise had a member still coming out when its mates were home again
  (review 2026-11-21). Spawn's companies of three and four always get the full 2 bars.
- **The lead** (`recallLeadBars`): `RECALL_LEAD_SECONDS` (24) in bars at the tempo, rounded up.

Every number above is spec §4's first cut; Gate A was not held (the plan's Results).

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
| `'entering'` | At the port, still playing: a hold of under half a measure, then the entry arc over the station fade, ending on the bar line (see "Charging Stations") | the arc ends → `'charging'`; the seam's `'active'` turns it back (see "Turn-back") |

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
| `'active'` | In `'charging'`: it exits. In `'returning'`: the swim home is killed and it goes back to work (turn-back). In `'entering'`: it turns back at the port — at once while it holds there, else the entry arc reverses from where it is and the robot goes back to work when the reverse ends (`turnBackAtPort`). |
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
- **Entering** (`'entering'`, backlog 84): on arrival the robot **holds** at the port, visible at full
  size and still playing, its slot held. The station fade system
  ([`stationFadeSystem.ts`](../src/systems/stationFadeSystem.ts)), a `'16n'` repeat started and stopped
  with the work loop, decides on the next sixteenth. A **`Recalled`** robot waits at the port, still
  playing, until the last bar of its hold (roadmap 94: the hold is the bar line after its exit turn,
  so its last bar is the exit turn's own); from then on, and for a `Docked` or `Undocking` robot: with
  `STATION_FADE_MIN_STEPS` (8, half a measure, inclusive) or more sixteenths left to the bar line, the
  robot goes in at once; with fewer, it holds until the bar-line tick and takes the whole next
  measure. So the members of a company recalled together fade over one bar and go in on one bar line;
  a member arriving with under half a measure left (a **late member**) is a bar behind. Either way the system starts the robot's
  volume ramp to 0 (`AudioEngine.scheduleStationFade`, none for a soloed robot) and the entry arc
  (`enterOnBar(robotId, seconds)`) over the same seconds plus the lead until the tick's audio is heard
  (`AudioEngine.secondsUntilHeard`), so the body is gone when the ramp is heard to end on the bar line. The arc vanishes
  the robot into the port: scale 1 → `STATION_PORT_SCALE` (0.15) and opacity 1 → 0, its halo ripple
  running inward and the station's ripple (`playStationRipple`) beside it, all over the fade's length
  (half a measure to a whole one). It is then `'charging'`: hidden, `visibility: hidden`, out of the
  raster, and dock-muted.
- **Exiting** (`'exiting'`), the reverse: it appears at the port (scale 0.15 → 1, opacity 0 → 1),
  ripples outward, then `next()`. A robot exits through the station it last entered, in the back
  robot row (J4): hidden, moved there, then the arc plays between the station's back plate and the
  rest of it, ending at the row's 0.75.
- **Reduced motion**: both arcs are a fade in place, with no scale and no station ripple: the exit
  over `STATION_REDUCED_ARC_SECONDS` (0.3 s), the entry over the station fade's whole length (a fade
  is not a motion; spec assumption A4).
- **Slot lights** are the occupancy display: a station lights one slot per robot with its
  `stationId` and activity `'charging'`, in the robot's identity colour, back to front in roster
  order. The selector key is `chargingColorsKey` (`stationOccupancy.ts`), so only a change to that
  station's lit set re-renders it.

The arcs, eases and timeline keys are in [ANIMATION_SYSTEM.md](ANIMATION_SYSTEM.md#station-arcs).

### Recall

The measure tick recalls a robot (`'recalled'`) the lead before its exit turn: `RECALL_LEAD_SECONDS`
(24) in bars at the tempo, a little over the longest trip home on record, so the members of a company
reach their ports before the exit turn's bar and wait there (roadmap 94; a median of 16–18 s and up to
24 s at the door in the loop sim, at every tempo). What happens depends on what it is doing:

- **Working**: the job runs to its full length (the orbiters reattach and the bob ends at rest),
  then the job's own `next()` sees `docking` isn't Active and sends it home. The site gets its
  normal cooldown. It is heard throughout, and on the swim home, until it is in its station (rule 6).
- **In transit or waiting**: the swim or bob is killed and the robot heads home at once. It never
  worked at the site it held, so the site is released with **no cooldown** (`readyAt = now`).
- **Exiting**: the arc finishes, and its `next()` sends it straight back.

There is no "recall pending" flag. `docking` is the flag: every decision reads it.

### Turn-back

If a robot lands on `Active` again before it is inside its station, it turns back to work:

- **Returning**: the swim home is killed and the robot decides again from where its body is. The
  slot frees with the activity.
- **Entering** (`turnBackAtPort`, backlog 84): holding at the port, it goes back to work at once.
  Mid-arc, the arc's `'charging'` end is unhooked and the arc reverses from where it is, so the robot
  grows back the way it went; when the reverse reaches its start, the reversed arc is killed and the
  robot goes back to work. The robot never becomes `'charging'`. Its volume comes back on its own:
  `landOnActive` cancels the station fade (see "Landing Effects"). The arc's own end keeps an
  `Active` guard (exit again) for a landing that skipped the seam.

**A turn-back can't happen on its own.** From a recall back to Active takes the lead, the exit turn's
bar and a home window of at least `SHIFT_MIN_BARS` (8) bars, longer than any robot's trip home at any
tempo — the loop sim measures 0 turn-backs at 20, 110 and 200 BPM on the shift step. The only real
path is
a **hidden tab**: the browser slows GSAP, but the Transport keeps ticking, so the lifecycle runs
ahead of the visuals. Because every decision reads `docking`, the visuals converge however far
behind they fall. `workLoop.integration.test.ts` drives both turn-back cases at 200 BPM by running
the Transport ahead of GSAP.

## Battery

Evaluated once per measure by `tickRobotLifecycle(localeId, measure)`, called from a
`subscribeToMeasure` callback registered by `startRobotLifecycle`/`stopRobotLifecycle`. Since roadmap
94 the battery is a **gauge** (spec §1.10): it follows the plan and never causes a move. After the
transitions, each robot's level steps a straight line to its target, read as the robot stood at the
top of the tick (so a robot landing this tick finishes its phase on its target):

| Robot (its docking at the top of the tick) | Each measure |
|---|---|
| Out (`Active` or `Recalled`) with an exit turn, above 10 | a straight line to `BATTERY_CRITICAL_THRESHOLD` (10) on the bar line after the exit turn |
| Out with no exit turn (a stay), or at or under 10 (it has stayed) | loses `BATTERY_EASE_SHARE` (⅛) of its level; never reaches 0 |
| Home (`Docked` or `Undocking`) with an entrance | a straight line to `BATTERY_FULL_THRESHOLD` (100) on the entrance |
| Home with no entrance yet | gains ⅛ of what is missing; never reaches 100 |

So the battery falls on every measure a robot is out and rises on every measure it is home, holds
included, reads 10 as its sound ends and 100 as it comes out, and never jumps or sits still. A tempo
change re-aims it by itself, as the moves are rescaled.

```typescript
// src/constants/index.ts
BATTERY_CRITICAL_THRESHOLD = 10;  // the gauge's empty, on the bar line after the exit turn
BATTERY_FULL_THRESHOLD = 100;     // the gauge's full, on the entrance
BATTERY_EASE_SHARE = 0.125;       // a stay's fall and a waiting robot's rise, a share a measure
DEFAULT_BATTERY_SIZE = 1;         // a robot or snapshot with no size
BATTERY_SIZE_MIN = 0.67;          // Gate A's band (Crawford, 2026-11-11)
BATTERY_SIZE_MAX = 1.5;
BATTERY_DRAIN_ACTIVE = 6;         // today's step only (stepRobotLifecycle), kept for the sims until the removals
BATTERY_RECHARGE_RATE = 5;        // the same
```

The battery is a plain fractional number: `localeStore.ts`'s `updateRobot` clamps it to 0–100 (and
drops a `NaN`) but does not truncate it, so the live tick and the replay hold the same value
between measures. Spawn's start batteries stay whole; only the tick makes fractions. The readouts
round it, and the body's dimming tiers read it as before.

### Battery size

Every robot draws one seeded `Robot.batterySize` at spawn — `generateBatterySize(noiseMap,
spawnCount)` in `spawnSystem.ts`, an even draw (`getUniformSeededVal`) at `'robot.batterySize'` on
`[BATTERY_SIZE_MIN, BATTERY_SIZE_MAX)`. Since roadmap 94 only one size per group is read, its member
earliest in the roster's (the founder, for a seeded company): it multiplies the least of the group's
out and home windows, so a big battery is a long least shift and a long least charge. Every robot
keeps drawing its own (spec Q5's default), so a robot made freelance later has one. It is a seeded
fact, not a control: never edited, never shown, never saved in a session (regenerated from the world
seed), never inherited on the copy path. Absent, it reads as `DEFAULT_BATTERY_SIZE`.

Before roadmap 94 the size divided both the drain and the charge of each robot, every member of a
company on its own cycle of 27 to 53 measures (fifteen whole-measure lengths on the 0.67–1.5 band).
Today's step, `stepRobotLifecycle`, still does that, for the sims' "today" rows, until the removals
(the plan's Task 27, on Crawford's yes).

### Why 6 — the drain sim (Phase 43 Task 2)

History: the rule the tick ran until roadmap 94, kept because `stepRobotLifecycle` and its sims are
still in the code.

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
2. Calls `AudioEngine.cancelStationFade(robotId)` (backlog 84): a robot turning back mid-fade, or
   exiting after one, sounds at its regular volume again, its bus ramping back over
   `STATION_FADE_RECOVER_SECONDS` (0.5 s). A no-op with no fade recorded. `landOnDocked` does not call it.
3. Calls `onLifecycleChange(localeId, robotId, 'active')`.

Voice reservation and melody registration are **not** done here — every robot gets both once, at
spawn (`spawnSystem.ts`'s `spawnRobot`), regardless of docking state, and they stay put across
dock cycles. The docking state is the only thing that changes.

**`landOnDocked(localeId, robotId)`** — called when a `Recalled` robot's hold elapses:
1. Sets `docking: Docked` and clears `dockingHoldUntilMeasure`. Docking mutes it; its `audioMode`
   is left alone.
2. Calls `onLifecycleChange(localeId, robotId, 'docked')`. **No position write** here — position is
   the work loop's.

No voice is released, no melody is unregistered and no melody is written here — the dock's mute is
the docking state alone, and the Audio Load budget releases the voice (rule 6).

**No melody changes at a docking.** Docking pitch drift (a re-roll of a quarter of a robot's notes
at every `Docked` landing, with the dock-cycle count it read) was removed by roadmap 92, the melody
journey ([specs/MELODY_JOURNEY.md](specs/MELODY_JOURNEY.md) §1.11): it ignored the robot's Note
Variance set, any composition edit wiped it, and it happened while the robot was silent. A robot's
melody now develops on its journey, measure by measure, whether it is docked or not, and that is a
pure function of the measure ([MELODY_SYSTEM.md](MELODY_SYSTEM.md#the-melody-journey-roadmap-92)),
so the lifecycle has no part in it.

## Deterministic Replay (Roadmap Phase 20.5 — World Clock)

Battery, plans and docking are replayable headlessly — given a roster's seeded spawn state, a tempo and
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

**`ShiftLifecycleSnapshot`** (`robotSystems.ts`, roadmap 94) — the subset of `Robot` a replay reads
or writes, deliberately narrower than `Robot`: `id`, `docking`, `batteryLevel`,
`dockingHoldUntilMeasure`, `batterySize`, the group (`companyId`, `compositionSeed`) and the five
move fields (`entersAtMeasure`, `exitsAtMeasure`, `shiftBpm`, `entersAim`, `exitsAim`). `toLifecycleSnapshot` builds it from a live
robot. It extends `RobotLifecycleSnapshot`, today's step's (`id`, `docking`, `batteryLevel`,
`dockingHoldUntilMeasure`, `batterySize`). Phase 43 dropped `job`, `octaveRange`, `rhythmicDensity`
and `rhythmicMotifLength`, which only fed job scoring; roadmap 92 dropped `melody`, `dockCycleCount`
and `noteVariance` with pitch drift.

**`stepShiftLifecycle(roster, measure, env): ShiftLifecycleSnapshot[]`** (`robotSystems.ts`) — one
measure's worth of transition for an entire roster, pure: "The Docking State Machine" and "Battery"
above. `env` is `{ bpm, worldKey }`. It mutates a local working array in roster order, so
within-measure ordering effects match a real tick bit for bit — the stay and the group draws read
that working array. It takes no noise map: its draws are the groups' own streams, read by turn.

**`stepRobotLifecycle(roster, measure, drain = activeDrain)`** — today's battery step, which the tick
ran until roadmap 94: the drain and charge divided by the robot's size, recall at 10, undock at 100,
holds of one measure. Kept for the sims' "today" rows until the removals (the plan's Task 27).

**`replayLifecycle(roster, fromMeasure, toMeasure, env)`** (`robotSystems.ts`) — calls
`stepShiftLifecycle` once per measure from `fromMeasure + 1` through `toMeasure` inclusive, at one
tempo for the whole span (spec §7.1 A7); a no-op if `toMeasure < fromMeasure + 1`. The one
caller-facing entry point for headless replay. In practice always called with `fromMeasure` = the locale's own
`createdAtMeasure` — replay always fully re-simulates from roster creation, never resumes from a
mid-point checkpoint. The melody needs no replay: the melody of any measure is worked out from the
home melody, the robot's journey settings and the measure
([MELODY_SYSTEM.md](MELODY_SYSTEM.md#the-melody-journey-roadmap-92)).

**What replay does *not* reproduce, and why that's fine:** on-screen position, motion, the job and
the activity are not measure-snapshot state — there's no "position at elapsed measure N" to replay
*to*. A replayed world would hand the work loop a roster whose `docking` is correct, and the loop
converges on it the same way it does after a hidden tab: Docked and Undocking robots are hidden in
their station, Active ones decide from where they are.

**No consumer wires this in yet.** Session Storage's `SessionPayload`, the shareable link (roadmap
Phase 21), and a future configuration scrubber (roadmap Phase 32) are all real candidates, but none
of them call `replayLifecycle` today — this phase is the foundation, proven by a dedicated test
(`robotSystems.test.ts`'s "prove-it: replay matches realtime on the shift step") that N real ticks
and one `replayLifecycle` call converge on identical state, field for field, the moves included,
through a stay and its relief, a group exit and a drifting exit — not a live UI feature.

A short, non-blocking audit of other timing-dependent systems (audio swells, LFO drift, ping
variance) — whether they're similarly replayable — is recorded in `docs/todo/backlog.md` item 17.
Short version: audio swells' trigger/target logic is already measure-seeded and safe the same way
robot lifecycle is; LFO phase is genuinely not (a real, continuous, wall-clock-driven oscillator,
by design) and would need a different, not-yet-built primitive if a future phase ever needs it.

## Headless Sims (`lifecycleSim.ts`, Phase 43)

`src/systems/lifecycleSim.ts` is pure: real seeded rosters, the real steps, no store, no BeatClock,
no GSAP. It runs over `SIM_SEED_COORDS`, the districts tests' 121-coordinate grid. Two rosters:
`buildShiftSimRoster(noiseMap, env)` is `generateRosterStart`'s start (matching `spawnInitialRoster`
robot for robot since roadmap 94) for `stepShiftLifecycle`; `buildSimRoster(noiseMap, band?)` is the
roster-index start today's `stepRobotLifecycle` ran on, each robot carrying its group too.

- **Shift cover sim** (`runShiftCoverSim` / `formatShiftCoverReport`, roadmap 94 Task 17) — each
  world on either step at a tempo, through the cover tally and a **group tally**
  (`createGroupTally`: each company's apart share, its group exits, each exit and group entrance on
  a turn or not, every group's time out and home). Always on: the shift step has no silent measure
  over the grid at 60 BPM for 2,000 measures, and every exit and group entrance lands on a turn. The
  report (`LIFECYCLE_SIM_REPORT`) at 20, 40, 60, 100 and 200 BPM, both steps, is in
  [the plan's Results](tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md#results). In short, the shift step
  against today's: never silent at any tempo (as today); group exits 82–85 % of company exits
  (today 4 %); apart share 6–25 %, falling with tempo (today 92 %); robots sounding 5.3–5.9 (today
  5.4); exits and group entrances 100 % on a turn (today 14–15 %); stays far commoner, 17–46 robot-stays
  per 1,000 measures a world (today 0.96), since groups move as blocks; heard share 37–57 % (today
  44–46 %).

- **Drain sim** (`runDrainSim`, Task 2) — today's step, the tables above.
- **Cover sim** (`createCoverTally` / `runCoverSim` / `formatCoverReport`, no-silence Tasks 1, 2 and 9)
  — today's step, until the removals: steps each world's roster through the real step and counts, per measure, the robots sounding
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
  | Both, shipped (0.67–1.5), plain roster draws (2026-11-11, before Even World Draws) | none | 118 / 121 | 0.81 | 2, 5, 9 | 5.41, 3–8 | 27–53 (15) |
  | **Both, shipped (0.67–1.5), even roster draws** | **none** | **114 / 121** | **0.75** | **2, 5, 10** | **5.41, 3–8** | **27–53 (15)** |

  Each half alone leaves something: size alone makes silence rarer but longer and spreads it to more
  worlds; the rule alone fires about once per world and the fleet goes back to looping every 35
  measures. Together a robot is in a stay 0.18 % of measures (0.20 % on the plain roster draws). An
  always-on case pins zero silent measures over the grid at 2,000 measures. The first four rows were
  measured with the roster's Active count and docked batteries on the plain draw; the last is the
  shipped roster since Even World Draws ([docs/tasks/EVEN_WORLD_DRAWS.md](tasks/EVEN_WORLD_DRAWS.md),
  T3), which starts 2, 3 or 4 robots Active a third of the time each. The rule is structural, so no
  world went silent on either.
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
  at every tempo. Since roadmap 94, `runLoopSim`'s `door` option models the wait at the port (a
  `Recalled` robot goes in on its hold's bar line; under half a measure before it, or `Docked`
  already, it is late) and counts member exits, late members and door waits;
  `runReadinessSim({ step: 'shift' })` runs it on the shift step (`formatDoorReport`). Over the grid
  for 10 minutes at 20, 110 and 200 BPM: 0 late members of 1,320, 2,812 and 3,124 member exits; door
  waits a median of 16.0, 17.1 and 18.2 s, up to 23.6 s; 0 turn-backs, 0 robots charging while
  visible, and none visible while `Docked`.

The sim models the loop; it doesn't run `workLoop.ts`. The real loop under the real tick is
covered by `workLoop.integration.test.ts`.

Set `LIFECYCLE_SIM_REPORT=1` to print either report from `npx vitest run src/systems/lifecycleSim.test.ts`.

## Roster Creation

`spawnInitialRoster(localeId, { bpm })` (`spawnSystem.ts`) creates exactly `MAX_ROBOTS` robots once,
at locale load. Since roadmap 94 a world starts **by groups**, not roster indices
(`generateRosterStart(noiseMap, { bpm, worldKey, startMeasure })`, pure, spec §1.13), at the tempo
`initializeLocale` hands in (the audio store's), the world's key and the locale's
`createdAtMeasure`:

- The groups are `generateCompanyMembership`'s companies and each freelancer alone. Each starts out
  when its even draw at its earliest member's roster index (`'roster.groupStartsOut'`) is under
  `SHIFT_START_OUT_ODDS` (0.45); if none does, the group earliest in the roster does. So at least
  one group starts out in every world.
- A group starting out is whole, every member `Active` at full battery, its exit drawn by `planExit`
  as if it came out on the start measure.
- A group starting home is whole too, every member `Docked` at its own varied starting battery (an
  even draw per robot, `'roster.dockedBattery'`, offset = roster index, 0–99), and shares one
  entrance: the first turn of its journey at or after `max(1, round(u × SHIFT_HOME_MAX_BARS × bpm ÷
  60))` measures in, `u` its even draw at `'roster.groupFirstEntrance'` (`rosterGroupDraws`).
- `placeRosterAtStations` writes each robot's first move (`entersAtMeasure` or `exitsAtMeasure`, and
  `shiftBpm`) in its one store write for the placement. If the tempo changes before the first tick,
  the tick rescales the moves.
- `lifecycleSim.ts`'s `buildShiftSimRoster` makes the same start, so the sims replay spawn's roster.
  With no noise map (no locale), the roster-index start stays on its alea fallbacks
  (`'roster.activeCount'` and `INITIAL_ACTIVE_ROBOTS_MIN` / `MAX`, read nowhere else since roadmap
  94).
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

Whether a robot is *heard* is now two independent things. **Eligibility** (`isRobotAudible` in `src/utils/robotAudibility.ts`) reads the user's `audioMode`, the robot's docking and its `activity`: Mute always silences; under any Solo only the soloed robots are heard, in their station or not; otherwise a robot in its station (`Docked` or `Undocking`, and `'charging'`) is silent (rule 6). On the way in, the volume does not cut at `'charging'`: the station fade system ramps the robot's bus to 0 over the entry arc, ending on the bar line where `'charging'` is written (see "Charging Stations"; the engine's side is [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). A homebound `Docked` robot keeps its budget slot and its voice until `'charging'`; only then is it stood by. **The Audio Load budget** ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)) then caps how many *eligible* robots may sound at once (2–12 by the Robot Load slider; all 12 at Full — the separate Effects Load slider doesn't affect this cap): `audioBudgetSystem` admits them first come, first served, ranked Solo, then Highlight, then Auto, and one that is eligible but over the cap **stands by** — silent, its card's mode light dim, otherwise unchanged.

Standing-by robots keep the whole lifecycle: they work, dock and undock on their group's plan, and keep their registered melody. Only the sound stops: the note trigger is gated (`triggerWithCap`), and the voice is released after the last note and rebuilt on admission ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)). So the shift cycle is what supplies the turnover — a robot docking frees its slot for the earliest waiter within a measure or two. An explicit unmute of a robot when the set is full does not jump the queue (its light stays dim until a slot frees); a soloed robot evicts the newest Auto robot, else the newest Highlight, and waits only when every slot holds a Solo; a highlighted robot evicts the newest Auto robot only. The lifecycle code itself is untouched — the budget system only reads `audioMode` and `docking` through a signature and writes nothing back to a robot.

The robot's cards show its own Monitor Mode, never an audibility word ([specs/MONITOR_MODE_TRUSTWORTHY.md](specs/MONITOR_MODE_TRUSTWORTHY.md) §1.5–1.6, backlog 81): the Status is the mode word (Auto, Solo, Mute, Highlight) in every state, led by a small light in the mode's colour (Auto green, Solo yellow, Mute red, Highlight blue). The light is lit only while the robot is heard, `isRobotEmitting` (eligible and in the sounding set), and dim for any silence: in its station, under another robot's Solo, standing by, or muted. The roster tile reads `{status} · {job} · {dockingState} · {activity}`; the robot screen's Status well comes first, and its phone band reads `{status} · {job} · {dockingState} · {activity} · {battery}`.

## Mounts and the Power Cycle

`startRobotLifecycle(localeId)`/`stopRobotLifecycle()` are a module-singleton pair (one active
`subscribeToMeasure` unsubscribe function at a time), mirroring the retired
`startSpawnScheduler`/`stopSpawnScheduler`'s exact pattern. `worldTransition.ts`'s
`startLocaleSystems` — the START half of `initializeLocale`, run when its `startSystems` option is
true and by `powerController.powerOnSequence()` for a world built while the tablet was off — calls
`stopRobotLifecycle(); startRobotLifecycle(localeId);`, then `stopWorkLoop(); startWorkLoop(localeId);`,
then the station fade system's pair (`stopStationFades(); startStationFades(localeId);`, backlog 84), then the swells'
pair, unconditionally, and writes the world state `'running'`. The unconditional
stop first is what lets a repeat start (a second cold start, a retransmit) re-subscribe: without
`stopRobotLifecycle()` nulling the module's `lifecycleUnsubscribe` reference, a later
`startRobotLifecycle()` would see it as "already running" and never resubscribe.

**Power-off is a pause, not a teardown** (`docs/specs/OFF_SCREEN.md` §1.2; the order and the three
states are in [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#power-is-a-pause)). `powerController.pause()` freezes
the work loop's clock, pauses every `'world'` timeline and suspends the AudioContext; the lifecycle
subscription stands with its tick frozen, no timeline is killed, no site is released, no voice goes.
A station fade pauses with the context (its ramp is automation on the context's clock), and its arc
with the world timelines, which `resumeWorldTimelines` resumes in the direction each was going, so a
turn-back's reversed arc carries on backwards (spec assumption A5).
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
- **The station fade after a power cycle** (backlog 84; figures in
  [tasks/PLAY_UNTIL_IN_THE_STATION.md](tasks/PLAY_UNTIL_IN_THE_STATION.md#checkpoint-b--gate-crawfords-eye-and-ear-spec-54-stop)):
  the world timelines resume before the context clock runs again, so the entry arc gets ahead of
  its fade (0.1–0.3 s, measured headless). The arc already runs on past the fade's end by the lead
  from the context clock to the tick's time plus the output latency (`AudioEngine.secondsUntilHeard`),
  which covers a small skew; a larger one writes `'charging'` early, so a quiet last note (8–16% of
  the robot's level) is skipped. The order is `powerOnSequence`'s, not this feature's alone.

## Testing Notes

`robotSystems.test.ts`, `shiftPlan.test.ts`, `melodyJourney.test.ts`, `stationFadeSystem.test.ts`,
`workLoop.test.ts`, `workLoop.integration.test.ts`, `lifecycleSim.test.ts`, `siteChoice.test.ts`,
`stations.test.ts`, `spawnSystem.test.ts`, `spawnSystem.rosterStart.test.ts`, `worldTransition.test.ts`
and `powerController.test.ts` cover:
- the plan (roadmap 94, every named mutant killed; the commits name them): `journeyTurns`' measures, moves and drops; the windows at five tempos, the floor, the 16-measure width and the lead; a group's key, size and draws (a member's own Journey setting never read, turn *i*'s draws the same whichever is asked first); the exit walk, together or drifting at the weight's odds, a drop always leaving together; the entrance walk at flat odds, together or 2 bars apart, a big company's stagger narrowed to its out window's least; the rescale, and the aim it scales keeping the seconds to go across a run of changes
- the shift step: each transition on its measure; the exit drawn on the first member's landing, the entrance on the last member's docking; the stay (a group whole, relief earlier and later in the roster, two groups due with no third, never zero `Active` over hand-built worlds stepped 500 measures); the gauge (10 on the bar line after the exit turn, 100 on the entrance, falling every measure out and rising every measure home, a stay's ease never reaching 0); a tempo change (nothing changes docking on its tick, a Recalled or Undocking robot keeps its hold, the gauge bends without a jump, a slow drag up and back landing on the turn its kept seconds call for, through the step and through the live tick); a robot out of step (a mate's move and its aim, a moved robot's dropped, twelve robots with no fields reaching a plan within one home window); a straggler still `Undocking` when its mates dock keeping the group's exit while the entrance waits for it; a company that is the whole roster coming and going robot by robot, and one of all but one robot still staying whole
- the tick writing what the step gives at the store's tempo and the locale's key, a company recalled on one tick with the seam once per member, and never `audioMode`; the prove-it (N real ticks and one replay identical field for field through a stay, its relief, a group exit and a drifting exit; mutation-checked: each field left out of the tick's snapshot)
- the station fade waiting for a `Recalled` robot's hold (nothing two bars ahead, the whole last bar from its bar line, a late arrival a bar behind) and, in the integration test, a company of three recalled from out in the world at 60 and 200 BPM whose fades all end on the hold's bar line
- today's step (`stepRobotLifecycle`, until the removals): the base drain for every Active robot whatever its job, both rates divided by the robot's battery size, recharge math, both clamped; the store keeping a fractional battery
- hold-elapsed landing on `Active`/`Docked`
- `landOnActive`/`landOnDocked` leaving every `audioMode` (Auto, Mute, Solo, Highlight) as it was and not touching voice reservation/melody registration, writing no position, job or swim themselves, and calling `onLifecycleChange` with the right `to`; the `./workLoop` import as the tick's only route to visuals
- a `Docked` landing leaving the melody alone, stored and registered (the same array, no `registerRobotMelody` call), through two whole dock cycles, and a Click Track robot still registered as the click track after one (roadmap 92 Task 8)
- the dock's mute and Solo beating it (`robotAudibility.test.ts`, `audioBudgetSystem.test.ts`, `AudioEngine.test.ts`, the roster tile and the World view's count): a Solo and a Mute each survive a dock cycle
- today's step's stay-up rule (until the removals): a sole `Active` robot at/below critical stays with no hold and no seam call, drains on to 0, and is relieved the same tick by a robot landing earlier in the roster and the next tick by one later; of two crossing critical together with no third `Active` the earlier goes and the later stays, with a third both go; beside only a `Recalled` or `Undocking` robot it stays; a muted last robot stays; over every grid world the Active count never reaches zero (mutation-checked: a robot that relieves itself, `Recalled` counted as `Active`, the pre-tick roster read)
- `stepRobotLifecycle`/`replayLifecycle` (the injected `DrainRule`, a hand-written loop matched, the no-op case, `fromMeasure` excluded) and the prove-it test: a real 12-robot roster, every robot a different battery size, run for N real ticks and separately replayed, asserted identical field for field, through a stay and its relief, with a drained battery that never floored, charged ones that never capped and fractional ones (mutation-checked against a job surcharge, a snapshot without the size and a store that truncates; its check of the pre-drift melody went with pitch drift, roadmap 92)
- the work loop: one robot per site, the cooldown, the job sticking until no ready site hosts it, recall in each activity, both turn-backs, adoption on mount and on start, settling, the body-less timelines, stop finishing a job silently, and callbacks that never touch `AudioEngine` (spy); every mutant run in Tasks 22–24 is killed
- the two robot rows (J4; plus `layerSwitch.test.ts` and `midgroundSilhouettes.test.tsx`): front → back and back → front legs, the switch point's clear run, the skip with no switch point, the 0.75 row scale, the dissolve copy in both directions and every interruption of it (stop, recall, a dropped leg's re-mount, an overlapping fade), exits into the back row, and `stations.test.ts`' guards that no station box or exiting robot overlaps a midground silhouette (0 of 284 over the grid). The J1–J3 loop tests run with `backHosts: false`
- the real tick into the real loop at 20/110/200 BPM: exit → transit → working → recall → the job finishes at full length → returning → entering → charging (hidden, slot lit) → undock → exit → working, plus the two hidden-tab turn-backs at 200 BPM (removing the returning turn-back fails that case; the entering one now turns back from the port with no `'exiting'` and no `'charging'`). Since backlog 84 the integration test runs the real station fade system: a partial `beatClock` mock captures its `'16n'` callback and the simulated Transport runs it at every sixteenth it crosses, the lifecycle tick first on a bar line
- the station fade (backlog 84): `stationFadeSystem.test.ts` (the half-measure rule at steps 1, 5, 9 and 10–16, the fade and the arc started once per entry with the same seconds, the tick's own length, Solo getting the arc only and a Solo mid-fade cancelled once, a re-entry started again, the edges with no position or tick length, stop and restart; mutants at the boundary, a fade every tick, the Solo check and the set never cleared all killed); `workLoop.test.ts` (`enterOnBar` over the given seconds with the halo, the ripple and reduced motion, its no-op cases including a finished earlier arc not counting as running; the hold at the port; the turn-back in the hold and mid-arc, a power-off during the reverse, a re-recall during it; the `AudioEngine` pin through a hold, an `enterOnBar` and a charge); `robotAudibility.test.ts` and the budget's tests for the silence beginning at `'charging'`; `robotSystems.test.ts` for `landOnActive`'s cancel
- `spawnInitialRoster`'s start by groups (`generateRosterStart`: each group whole, out or home, at least one out in every grid world, both group draws even; mutation-checked: the start by roster index, a centred draw), seeded battery variation, every robot's battery size inside the band and filling it evenly (mutation-checked: a plain draw), determinism, every robot at its station's port with the right `activity`, one store write, and every robot (Docked included) holding a reserved voice/registered melody, every one with `audioMode: 'none'`
- `startRobotLifecycle`/`stopRobotLifecycle` and `startWorkLoop`/`stopWorkLoop` idempotency; `pauseWorkLoop`/`resumeWorkLoop` (a cooldown stamped before a pause is unexpired after it, two pauses accumulate, a start resets); `powerController.test.ts`'s pause and resume orders, the cold path, `markHeardWorld` once, and the fade awaited before either path
- `types/Robot.test.ts`: the deleted files are gone and no file in `src/` names a deleted identifier (below)
- `lifecycleSim.ts`: the sim roster matching the real spawn path (battery size included), its Active count a third each of 2, 3 and 4 and its docked batteries filling 0–99 over 3,000 worlds (mutation-checked: either draw back on the plain draw), determinism, no store/BeatClock (and no GSAP for the loop sim), the pinned drain rows, the cover tally on hand-built rosters, the cover sim against its own count world by world, zero silent measures over the grid, the band option, and the loop sim's hand-worked timelines for each work-loop branch

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
