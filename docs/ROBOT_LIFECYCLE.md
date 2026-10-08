# Robot Lifecycle Specification

Source of truth: [`src/systems/robotSystems.ts`](../src/systems/robotSystems.ts) (battery and docking),
[`src/systems/lifecycleVisuals.ts`](../src/systems/lifecycleVisuals.ts) (what a transition looks like).

Robot Lifecycle (Roadmap Phase 7) replaces the dynamic spawn/despawn/persistence machinery that
existed through Phases 4–6 as test scaffolding. A locale's roster is now created once, in full, at
locale load — every robot cycles between `Docked` and `Active` for the rest of the session, driven
purely by its own battery level. Nothing is ever removed from the roster.

Robot Jobs and Stations (Roadmap Phase 43, [spec](specs/ROBOT_JOBS_AND_STATIONS.md)) changes the
lifecycle underneath today's visuals in its first branch, J1: the states are renamed, the drain is
flat, the job leaves the replay, and every visual consequence of a transition goes through one seam,
`onLifecycleChange`. Until J2 lands, that seam is a **legacy adapter** that keeps the pre-Phase-43
visuals exactly (exit swim, wandering, the off-screen dock spot). J2 re-points the seam at the work
loop (charging stations, work sites) and this document is rewritten again then.

## Core Principles

1. **Fixed roster, created once**: every locale spawns exactly `MAX_ROBOTS` (12) robots at load — no dynamic spawn scheduler, no manual spawn action, no removal.
2. **Battery-driven, not job-driven**: the `Docked ↔ Active` cycle is governed purely by battery level, and every Active robot drains at the same flat rate whatever it is doing. The job is live visual state, written as a side effect of going `Active` (today, by the legacy adapter); nothing in the lifecycle reads it.
3. **Measure-quantized transitions**: every state change is evaluated once per measure via BeatClock — never `setTimeout`/`setInterval`. This determinism is what makes the whole cycle (battery/docking, plus the pitch drift below) headlessly replayable — see "Deterministic Replay" below.
4. **One seam to the visuals**: the tick writes docking, battery, audio mode and melody, then calls `onLifecycleChange(localeId, robotId, to)` for the transitions that have a visual consequence. It never starts a swim, writes a position or picks a job itself.
5. **Orthogonal to `RobotState`** (until J2): `Robot.docking` is a second state machine, independent of `Robot.state` (`Idle`/`Moving`/`Selected`/`Interacting`/`Leaving`), which still governs in-world wandering for whichever robots are `Active`. J2 replaces `state` with `Robot.activity`.
6. **Off-screen and muted-by-default while Docked, but overridable**: a `Docked` robot sits at a position outside the world bounds and has `audioMode: 'mute'` — the *same* field Robot Options' Audio Mode toggle writes to. Its `AudioEngine` voice stays reserved and its melody stays registered the whole time, exactly like an `Active` robot's — mute is enforced only at `scheduleNote()`'s `audioMode === 'mute'` check, so a user can flip a Docked robot's Audio Mode back to `none` in Robot Options and genuinely hear it, without anything in the lifecycle system fighting that override.

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

/** The work loop's live visual state (J2 adds the Robot.activity field; the type is already here). */
type RobotActivity = 'charging' | 'exiting' | 'transit' | 'working' | 'waiting' | 'returning' | 'entering';
```

The names were inverted before Phase 43: `Docking` meant *leaving* the dock and `Departing` meant
*going back to it*. They are now `Undocking` and `Recalled`; the transitions and holds are unchanged.

Fields on `Robot`:

```typescript
docking: DockingState;
/** Measure at which an Undocking/Recalled hold ends. Undefined when docking is Docked or Active. */
dockingHoldUntilMeasure?: number;
/** 0-100. Drains while Active, recharges while Docked. Seeded at spawn. */
batteryLevel: number;
/** The bare job type. Live visual state: never replayed, never persisted. Written when a robot lands
 *  on Active and left, stale, while it is Docked. */
job?: JobType;
```

`Robot.persists` — the old power-cycle-survival flag — is gone. Every robot survives a power cycle
now; there is nothing left for a robot to "persist" against.

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
  state, and a silent one: `beginUndocking` writes the hold only and calls no seam.
- **`Active` → `Recalled`**: triggered the measure an `Active` robot's battery reaches
  `BATTERY_CRITICAL_THRESHOLD` (10) or below. `beginRecall` writes the docking state and hold, then
  calls `onLifecycleChange(…, 'recalled')`. Today the legacy adapter answers with the exit swim (see
  below).
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
  immediately. No visual's duration governs a landing.
- **Landing effects** (`landOnActive`/`landOnDocked` in `robotSystems.ts`) are where audio and
  docking authoritatively change; each then calls the seam.

## Battery

Evaluated once per measure by `tickRobotLifecycle(localeId, measure)`, called from a
`subscribeToMeasure` callback registered by `startRobotLifecycle`/`stopRobotLifecycle`:

| State | Per-measure change |
|---|---|
| `Active` | `-BATTERY_DRAIN_ACTIVE` (6), whatever its job |
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
   the seam's.

No voice is released and no melody is unregistered — muting is `audioMode` alone.

## The Visual Seam (Phase 43)

`onLifecycleChange(localeId, robotId, to: 'recalled' | 'active' | 'docked')`
(`lifecycleVisuals.ts`) is the only way the tick reaches anything visual. It is called after the
transition's own store writes have landed. `Undocking` has no visual consequence and no call.

The tick is a BeatClock subscriber, not a GSAP callback, so calling into animation code from it is
allowed (Strict Separation forbids the reverse: GSAP callbacks calling `AudioEngine`).

**J1's legacy adapter** keeps the pre-Phase-43 behaviour, moved verbatim out of `robotSystems.ts`:

| `to` | What the adapter does |
|---|---|
| `'recalled'` | The exit swim: `idleSystem.ts`'s `pickExitDestination(robot.position)` (straight down, off-screen) and `swimAnimation.ts`'s `createSwimTimeline`, with `state: Moving` and the `destination` written to the store. Facing is kept, not recomputed (a straight-down exit has no horizontal component). Fire-and-forget: no `onComplete`, nothing waits for it. |
| `'active'` | `assignJob` (below), then `handleRobotIdle(…, { isReturning: true })` to restart wandering. `Robot.tsx` only calls `handleRobotIdle` once, on mount, so a robot that stayed mounted while Docked needs this restart. |
| `'docked'` | The off-screen dock spot: `spawnSystem.ts`'s `generateSpawnPosition(noiseMap, dockCycle)`, seeded by the count `landOnDocked` just advanced, so successive dock cycles sample different noise rows. Also `state: Idle` and `destination: null`, so the next `'active'` restart isn't blocked by `handleRobotIdle`'s `state === Idle` guard. |

The dock spot and the exit swim's end point are computed independently; both are simply off-screen,
and nothing re-syncs the GSAP transform from the store afterward.

**The dock-cycle count** lives in `src/systems/dockCycles.ts` (`getDockCycleCount` /
`recordDockLanding`): one counter, two readers. `landOnDocked` advances it and the replay snapshot
threads it into pitch drift; the adapter reads it to seed the dock spot. Live state only — never
replayed or persisted.

J2 (plan Task 24) re-points the seam at the work loop and deletes the adapter, `idleSystem.ts`,
`RobotState`, `destination`, `direction`, `scoreJobAffinities`/`assignJob`,
`JOB_MAX_ROBOTS_PER_TYPE` and `BATTERY_LOWER_THIRD_THRESHOLD`.

## Exit and Entrance Swims (legacy adapter, until J2)

The visible "head off-screen, then later come back" motion is stitched together from two existing
mechanisms, not a new animation system:

- **Exit** (`Active` → `Recalled`): the adapter's `'recalled'` branch, above.
- **Entrance** (`Undocking` → `Active`): the adapter's `'active'` branch calls `handleRobotIdle`,
  which animates from the robot's current position to a new on-screen destination — since that
  current position is genuinely off-screen, this reads as a natural "swim back on-screen", the same
  way a brand-new spawn's first `handleRobotIdle` call already does.

### Bottom-only, always

Every robot enters and exits exclusively via the bottom of the world view — never the sides or
top — for every entrance/exit, not just docking-driven ones:

- `spawnSystem.ts`'s `generateSpawnPosition` spawns straight below the bottom edge only. This is
  what every robot's initial off-screen position uses at locale load (Active or Docked), and what
  the adapter reuses for the dock spot — so a robot's resting dock spot is always south.
- `idleSystem.ts`'s `pickExitDestination` exits straight down from the robot's current position.
- `handleRobotIdle` takes an optional `{ isReturning: true }`, passed by both `Robot.tsx`'s mount
  effect (locale load) and the adapter's `'active'` branch — either way, the robot is surfacing from
  its south-only spawn/dock spot, so its first on-screen destination is confined to the bottom half
  of the world view (`BOTTOM_HALF_Y_RANGE`). Ordinary re-picks after that omit the flag and range
  freely.
- Independently, any robot below `BATTERY_LOWER_THIRD_THRESHOLD` (15%) has its idle wandering
  confined to the lower third of the world view (`LOWER_THIRD_Y_RANGE`), re-evaluated on every
  `handleRobotIdle` call from its live `batteryLevel` — so by the time it crosses
  `BATTERY_CRITICAL_THRESHOLD` and is recalled, it's already near the bottom, keeping the exit swim
  short. `isReturning` takes precedence when both would apply.

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
melody's own base generation already follows (roadmap Phase 31). **The job is not replayed** (Phase
43): it is live visual state, and nothing the replay computes reads it.

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

**What replay does *not* reproduce, and why that's fine:** on-screen position, motion and the job
are not measure-snapshot state — there's no "position at elapsed measure N" to replay *to*. The one
coupling between battery and movement (`idleSystem.ts`'s wander-Y-range bias below
`BATTERY_LOWER_THIRD_THRESHOLD`) is one-way and irrelevant to anything replay computes.

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
- **Loop sim** (`runLoopSim` / `runReadinessSim`, Task 15) — the J2 work loop's decisions (site
  choice, site cooldown, swims, job durations, station arcs) in seconds, interleaved with lifecycle
  measures at a given BPM, over each world's real work sites and stations. It pinned the site
  cooldown at 0.4/3/30 (Task 15), then, re-run at 20, 110 and 200 BPM once jobs became
  `jobDuration(bpm)` (6–10 s), at **0.3/2/30** (Task 16b); it also measures the hand-off between
  the lifecycle and the visuals. Results and method:
  [docs/tasks/ROBOT_JOBS_AND_STATIONS.md](tasks/ROBOT_JOBS_AND_STATIONS.md), Tasks 15 and 16b. Two findings belong here: with recharge at 5 per measure the shortest Docked stay is
  about 20 measures, longer than any robot's walk home, so a robot is never made Active again
  before it is back in its station (no turn-backs) at either tempo; and at 200 BPM a robot can
  still be visibly heading home up to ~17 s after it has landed on `Docked`.

Set `LIFECYCLE_SIM_REPORT=1` to print either report from `npx vitest run src/systems/lifecycleSim.test.ts`.

## Job Assignment (legacy adapter, until J2)

The job no longer affects battery (above) and is never replayed. Until the J2 work loop chooses jobs
by which buildings are ready, the legacy adapter keeps the pre-Phase-43 scorer, moved into
`lifecycleVisuals.ts`.

`scoreJobAffinities(robot)` is a pure, deterministic function over a robot's already-seeded melodic
attributes — no new randomness, since the *inputs* were seeded at spawn and the scoring itself is
plain arithmetic. It scores only the original four jobs; **Salvage and Maintenance are never chosen
until the work loop lands**:

| Job | Favors |
|---|---|
| **Vent Extraction** | low register, dense rhythm, short/tight motif, low note variance |
| **Acoustic Survey** | high register, sparse rhythm, long/scattered motif, high/unrestricted variance |
| **Structural Inspection** | wide octave span, mid-length motif (4–8), balanced density |
| **Fluid Monitoring** | mid register, density and variance near their defaults |

`assignJob(localeId, robotId)` sorts the four types by score for the deploying robot, skips any
type already held by `JOB_MAX_ROBOTS_PER_TYPE` (3) other Active robots in that locale, and writes
the first available type as the bare `job`. At the fixed 12-robot roster, 4 types × cap 3 = 12, so
the cap only matters transiently. The job is pure data here: no world position, no per-job visual
behavior.

## Roster Creation

`spawnInitialRoster(localeId)` (`spawnSystem.ts`) creates exactly `MAX_ROBOTS` robots once, at
locale load:

- A seeded count within `[INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]` (2–4) start
  `Active` at full battery.
- The rest start `Docked`, each with an independently seeded, varied starting battery (0–99) so
  they don't all finish recharging in lockstep.
- Does **not** assign jobs — `worldTransition.ts`'s `initializeLocale` does that for the
  initially-`Active` robots immediately after, calling `assignJob` from `lifecycleVisuals.ts`.
  `lifecycleVisuals.ts` imports `generateSpawnPosition` from `spawnSystem.ts`, so `spawnSystem.ts`
  never imports back from it.
- `spawnRobot(localeId, { docking, batteryLevel })`'s `AudioEngine.reserveVoice`/
  `registerRobotMelody` calls are **unconditional** — every robot gets a voice and a registered
  melody at spawn regardless of docking state. `audioMode` is set to `'mute'` when created `Docked`
  and `'none'` when created `Active`, so muting is consistent from the very first tick, not just
  after a robot's first dock/undock cycle.

## Audibility and the Audio Load Budget

Whether a robot is *heard* is now two independent things. **`audioMode`** (mute / solo, `isRobotAudible` in `src/utils/robotAudibility.ts`, unchanged) is the lifecycle's and the user's switch: `landOnDocked` mutes, `landOnActive` unmutes, and a user can override either. **The Audio Load budget** ([AUDIO_SYSTEM.md](AUDIO_SYSTEM.md#audio-load-budget)) then caps how many *eligible* robots may sound at once (2–12 by the Robot Load slider; all 12 at Full — the separate Effects Load slider doesn't affect this cap): `audioBudgetSystem` admits them first come, first served, and one that is eligible but over the cap **stands by** — silent, shown as "Standing by" on its card, otherwise unchanged.

Standing-by robots keep the whole lifecycle: they swim, drain, dock, recharge, drift pitch and keep their reserved voice and registered melody; only the note trigger is gated (`triggerWithCap`). So the battery cycle is what supplies the turnover — a robot docking (`audioMode: 'mute'`) frees its slot for the earliest waiter within a measure or two. An explicit unmute of a docked robot when the set is full does not jump the queue (it shows "Standing by" until a slot frees); a soloed robot always sounds. The lifecycle code itself is untouched — the budget system only reads `audioMode` and `docking` through a signature and writes nothing back to a robot.

## Existing-System Guards

One already-shipping system needed a `docking === Active` guard added, since it was not
originally docking-aware:

- **`idleSystem.ts`'s `handleRobotIdle`**: early-returns for a non-`Active` robot, so a `Docked`
  robot never wanders off its off-screen position.

(`collisionSystem.ts` also gained the same guard at the time, but the module was unused —
`startCollisionDetection` was never called from anywhere — and was removed outright rather than
kept or backfilled with tests; see roadmap Phase 19. `interactionSystem.ts`, also uncalled, was
deleted in Phase 43 Task 6.)

## Power Cycle Integration

`startRobotLifecycle(localeId)`/`stopRobotLifecycle()` are a module-singleton pair (one active
`subscribeToMeasure` unsubscribe function at a time), mirroring the retired
`startSpawnScheduler`/`stopSpawnScheduler`'s exact pattern. `worldTransition.ts`'s
`initializeLocale` calls `stopRobotLifecycle(); startRobotLifecycle(localeId);` unconditionally on
every call — this is what makes a power cycle work, not just a locale swap:
`AudioEngine.killAll()` (called on power-off, via `powerController.ts`) triggers `resetBeatClock()`
internally, which silently clears every `subscribeToMeasure` listener. Without
`stopRobotLifecycle()` running first to null out the module's `lifecycleUnsubscribe` reference, a
later `startRobotLifecycle()` would see it as "already running" and never resubscribe — permanently
killing the tick after the first power cycle.

`powerController.ts`'s `start()` calls `spawnSystem.ts`'s `reRegisterAllRobotsAudio(localeId)` on
power-on, which re-registers **every** robot in the locale (not filtered by docking) — every robot
keeps its voice/melody reserved regardless of docking state, so this pass covers all of them.
`AudioEngine.killAll()` itself does not touch the `compositeVoices` map (it only cancels/resets the
Transport and calls `resetBeatClock()`), so voices are not actually known to be invalidated by a
power cycle; the re-registration may be unnecessary defensive work carried over as-is rather than a
verified requirement. `audioMode` (unaffected by the power cycle, since it lives in
`useLocaleStore`, not `AudioEngine`) is what keeps Docked robots silent afterward.

## Testing Notes

The current tests (`robotSystems.test.ts`, `lifecycleVisuals.test.ts`, `lifecycleSim.test.ts`, plus
coverage in `idleSystem.test.ts`, `spawnSystem.test.ts`, `worldTransition.test.ts`) cover:
- the flat drain for every Active robot whatever its job (mutation-checked: a re-introduced job surcharge breaks the prove-it test), recharge math, both clamped
- threshold-triggered `Undocking`/`Recalled` entry with the hold, not an immediate landing
- hold-elapsed landing on `Active`/`Docked`
- `landOnActive`/`landOnDocked` setting `audioMode` (not touching voice reservation/melody registration), writing no position, job or swim themselves, and calling `onLifecycleChange` with the right `to` (mutation-checked: dropping the call from `landOnDocked` fails a test)
- the legacy adapter's parity with the pre-Phase-43 behaviour — the exit swim (`pickExitDestination`/`createSwimTimeline` with an off-screen destination, `state: Moving`, facing preserved), the dock spot seeded by the dock-cycle count with `state` settled back to `Idle`, and the job + idle restart on `'active'` — moved from `robotSystems.test.ts` with their assertions unchanged, plus an end-to-end test through the real tick
- `idleSystem.ts`'s `pickExitDestination` always exiting straight down, genuinely outside the world bounds
- `spawnSystem.ts`'s `generateSpawnPosition` only ever spawning below the bottom edge
- `pickDestination`'s `yRange` parameter, and `handleRobotIdle` selecting the lower-third range below `BATTERY_LOWER_THIRD_THRESHOLD`, the bottom-half range for `{ isReturning: true }`, and `isReturning` taking precedence when both would apply
- `landOnDocked` re-registering the drifted melody with `AudioEngine` so a manual mute override plays the post-drift pitches
- `scoreJobAffinities` determinism and each profile scoring highest for a robot matching its description; `assignJob` respecting `JOB_MAX_ROBOTS_PER_TYPE` and writing the bare job type
- `startRobotLifecycle`/`stopRobotLifecycle` idempotency
- the `idleSystem.ts` docking guard
- `spawnInitialRoster`'s active/docked split, seeded battery variation, its determinism across identical coordinates, and that every robot (Docked included) has a reserved voice/registered melody with `audioMode` matching its docking state
- the never-zero-`Active` invariant: a sole `Active` robot at/below critical battery stays `Active` (including floored at exactly 0) instead of being recalled; it is recalled on a later tick once another robot has landed back on `Active`; and when two robots cross critical in the same tick, only one is recalled while the other is held
- `stepRobotLifecycle`'s own battery/docking/pitch-drift arithmetic in isolation (no store, no BeatClock), the injected `DrainRule` (called only for Active robots, with the pre-drain snapshot) and `replayLifecycle` forwarding it
- `stepRobotLifecycle`'s pitch drift matching `landOnDocked`'s live seed formula (checked against an independently-computed expected result, never by comparing the function to itself), no cross-robot seed collision, and a robot's second dock cycle compounding on its first rather than re-drifting the original melody
- `replayLifecycle`'s no-op case, parity with a hand-rolled loop, and that `fromMeasure` itself is excluded (not re-replayed)
- the prove-it test: a real 12-robot roster with a contrived (not left to chance) starting state exercising both the invariant and a dock-triggered drift, run for N real ticks via `tickRobotLifecycle` and separately replayed via `replayLifecycle` from the same starting snapshot — asserted identical, field-for-field, for all 12 robots; mutation-checked against a broken invariant guard, against `tickRobotLifecycle` wiring the wrong (pre-drift) melody into `landOnDocked`, and against a re-introduced job surcharge
- a dedicated multi-measure integration test driving a full `Active`→`Recalled`→`Docked` cycle across four real ticks with hand-computed expected battery values at each step, alongside a companion robot proving the invariant/landing effects don't cross-contaminate
- `lifecycleSim.ts`: the sim roster matching the real spawn path, determinism, no store/BeatClock (and no GSAP for the loop sim), the pinned flat-drain rows, and the loop sim's hand-worked timelines for each work-loop branch
