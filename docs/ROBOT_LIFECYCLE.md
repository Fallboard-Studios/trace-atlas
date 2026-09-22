# Robot Lifecycle Specification

Source of truth: [`src/systems/robotSystems.ts`](../src/systems/robotSystems.ts).

Robot Lifecycle (Roadmap Phase 7) replaces the dynamic spawn/despawn/persistence machinery that
existed through Phases 4–6 as test scaffolding. A locale's roster is now created once, in full, at
locale load — every robot cycles between `Docked` and `Active` for the rest of the session, driven
purely by its own battery level. Nothing is ever removed from the roster.

## Core Principles

1. **Fixed roster, created once**: every locale spawns exactly `MAX_ROBOTS` (12) robots at load — no dynamic spawn scheduler, no manual spawn action, no removal.
2. **Battery-driven, not job-driven**: the `Docked ↔ Active` cycle is governed purely by battery level. Job assignment happens as a side effect of going `Active`, not a precondition for it.
3. **Measure-quantized transitions**: every state change is evaluated once per measure via BeatClock — never `setTimeout`/`setInterval`.
4. **Orthogonal to `RobotState`**: `Robot.docking` is a second state machine, independent of the existing `Robot.state` (`Idle`/`Moving`/`Selected`/`Interacting`/`Leaving`), which continues to govern in-world wandering/interaction behavior for whichever robots are currently `Active`.
5. **Off-screen and muted-by-default while Docked, but overridable**: a `Docked` robot sits at a position outside the world bounds (reusing `spawnSystem.ts`'s `generateSpawnPosition`, the same off-viewBox placement used for spawn/entrance) and has `audioMode: 'mute'` — the *same* field Robot Options' Audio Mode toggle writes to (`RobotAudioTab.tsx`). Its `AudioEngine` voice stays reserved and its melody stays registered the whole time, exactly like an `Active` robot's — mute is enforced only at `scheduleNote()`'s `audioMode === 'mute'` check, so a user can flip a Docked robot's Audio Mode back to `none` in Robot Options and genuinely hear it, without anything in the lifecycle system fighting that override.

## Data Structures

```typescript
// src/types/Robot.ts
const DockingState = {
  Docked: 'docked',
  Docking: 'docking',
  Departing: 'departing',
  Active: 'active',
} as const;
type DockingState = (typeof DockingState)[keyof typeof DockingState];

const JobType = {
  VentExtraction: 'ventExtraction',
  AcousticSurvey: 'acousticSurvey',
  StructuralInspection: 'structuralInspection',
  FluidMonitoring: 'fluidMonitoring',
} as const;
type JobType = (typeof JobType)[keyof typeof JobType];
```

Fields added to `Robot`:

```typescript
docking: DockingState;
/** Measure at which a Docking/Departing hold ends. Undefined when docking is Docked or Active. */
dockingHoldUntilMeasure?: number;
/** 0-100. Drains while Active, recharges while Docked. Seeded at spawn. */
batteryLevel: number;
/** Assigned automatically when a robot lands on Active. Undefined while Docked/Docking/Departing. */
job?: { type: JobType; assignedAtMeasure: number };
```

`Robot.persists` — the old power-cycle-survival flag — is gone. Every robot survives a power cycle
now; there is nothing left for a robot to "persist" against.

## The Docking State Machine

```
        battery ≥ 100%                    battery ≤ 10%
Docked ─────────────────▶ Docking ──────────────────────▶ (nothing — Docking only exits forward)
  ▲                          │
  │                          │ hold elapses (up to 1 measure)
  │                          ▼
  └────────── Departing ◀── Active
       hold elapses            battery ≤ 10%
       (up to 1 measure)
```

- **`Docked` → `Docking`**: triggered the measure a `Docked` robot's battery reaches
  `BATTERY_FULL_THRESHOLD` (100). Not an immediate jump to `Active` — `Docking` is a real held
  state.
- **`Active` → `Departing`**: triggered the measure an `Active` robot's battery reaches
  `BATTERY_CRITICAL_THRESHOLD` (10) or below. Unlike `Docking`, this transition is *not* silent:
  `beginDeparting` sends the robot visibly swimming off-screen the instant it fires (see below) —
  it heads off-screen before it freezes, rather than freezing wherever its last idle motion left
  it.
  - **Invariant — never zero `Active` robots**: before honoring a critical-battery trigger,
    `tickRobotLifecycle` re-reads the locale's current roster (not the stale per-tick snapshot, so
    an earlier robot's departure *this same tick* is already reflected) and checks whether any
    *other* robot is currently `Active`. If not — this is the last one standing — the transition is
    skipped and the robot stays `Active` regardless of battery, which keeps draining and floors at
    0 (visually reflected by the existing battery-dim overlay, see `ROBOT_DESIGN.md`). It is
    re-evaluated every subsequent tick, so the moment any other robot lands back on `Active` (via
    `landOnActive`), this robot's very next tick sees `stillActiveElsewhere = true` and departs
    normally — no separate "release" signal needed, just the same check re-run. When two robots
    cross critical in the same tick, iteration order means the first is allowed to depart and the
    second is held, since the roster read for the second reflects the first's just-applied update.
- **The hold**: `dockingHoldUntilMeasure` is set to `measure + 1` at the moment of triggering. The
  robot lands (`Docking` → `Active`, `Departing` → `Docked`) the first measure tick at or after
  that value — "up to one measure," not always a full one: a threshold crossed right after a
  measure boundary waits nearly a full measure, one crossed right before it lands almost
  immediately. The exit swim's own duration is independent of this — it's a fire-and-forget visual
  cue, not what governs the actual `Docked` landing.
- **Landing effects** (`landOnActive`/`landOnDocked` in `robotSystems.ts`) are where
  audio/position/job authoritatively change — the `Docking` hold itself is silent/invisible
  (still off-screen and muted throughout), but the `Departing` hold is not, per the exit swim above.

## Battery

Evaluated once per measure by `tickRobotLifecycle(localeId, measure)`, called from a
`subscribeToMeasure` callback registered by `startRobotLifecycle`/`stopRobotLifecycle`:

| State | Per-measure change |
|---|---|
| `Active`, no job | `-BATTERY_DRAIN_BASE` (2%) |
| `Active`, with job | `-(BATTERY_DRAIN_BASE + JOB_BATTERY_DRAIN_SURCHARGE[job.type])` |
| `Docked` | `+BATTERY_RECHARGE_RATE` (5%), capped at 100 |

```typescript
// src/constants/index.ts
BATTERY_DRAIN_BASE = 2;
JOB_BATTERY_DRAIN_SURCHARGE = {
  ventExtraction: 1,        // 3% total while Active
  acousticSurvey: 3,        // 5% total
  structuralInspection: 5,  // 7% total
  fluidMonitoring: 7,       // 9% total
};
BATTERY_RECHARGE_RATE = 5;
BATTERY_CRITICAL_THRESHOLD = 10;
BATTERY_FULL_THRESHOLD = 100;
```

Battery never goes below 0 or above 100 (clamped both in the tick math and again at the
`localeStore.ts` `updateRobot` boundary, matching every other clamped robot field).

## Landing Effects

**`landOnActive(localeId, robotId)`** — called when a `Docking` robot's hold elapses:
1. Sets `docking: Active`, clears `dockingHoldUntilMeasure`, sets `audioMode: 'none'`.
2. Calls `assignJob` (see below).
3. Calls `handleRobotIdle` to restart wandering — `Robot.tsx` only calls this once, on mount, so a
   robot that was idle-guarded while `Docked` (see below) needs this explicit restart.

Voice reservation and melody registration are **not** done here — every robot gets both once, at
spawn (`spawnSystem.ts`'s `spawnRobot`), regardless of docking state, and they stay put across
dock cycles. `audioMode` is the only thing that changes.

**`landOnDocked(localeId, robotId)`** — called when a `Departing` robot's hold elapses:
1. Sets `docking: Docked`, clears `dockingHoldUntilMeasure`, sets `audioMode: 'mute'`.
2. Repositions off-screen via `generateSpawnPosition`, seeded by a per-robot `dockCycleCounters`
   counter (module state in `robotSystems.ts`, mirroring `idleSystem.ts`'s `idleMoveCounters` and
   `spawnSystem.ts`'s `spawnCounters`) so successive dock cycles sample different noise-map rows.
   This is the *authoritative* store position — the robot's actual visual position at this instant
   is wherever `beginDeparting`'s exit swim (below) has carried it to, which is a different,
   independently-computed off-screen point; the two don't need to match, since "off-screen" is all
   that matters and nothing re-syncs the GSAP transform from the store afterward.
3. Re-rolls pitch drift (see below) and re-registers the drifted melody with `AudioEngine` — so a
   manual mute override plays the post-drift pitches, not whatever was registered before docking.
4. Sets `state: Idle`, clears `destination` — `beginDeparting` left `state: Moving` for the exit
   swim; settling back to `Idle` here is what lets a later `landOnActive`'s `handleRobotIdle` call
   proceed (it requires `state === Idle`, and would otherwise no-op silently).

No voice is released and no melody is unregistered — muting is `audioMode` alone.

## Exit and Entrance Swims

The visible "head off-screen, then later come back" motion is stitched together from two existing
mechanisms, not a new animation system:

- **Exit** (`Active` → `Departing`): `beginDeparting` (`robotSystems.ts`) calls
  `idleSystem.ts`'s `pickExitDestination(robot.position)` — straight down, plus offset, the same
  shape of helper `spawnSystem.ts`'s `generateSpawnPosition` uses for the entrance side — then
  `swimAnimation.ts`'s `createSwimTimeline` directly, setting `state: Moving` and the computed
  `destination`/`direction` in the store alongside the docking fields. `direction` is left as the
  robot's current facing (not recomputed from the exit) since a straight-down exit has no
  horizontal component to flip toward. No `onComplete` callback — the swim is fire-and-forget,
  decoupled from the measure-quantized hold (see above).
- **Entrance** (`Docking` → `Active`): needs no new code. `landOnActive` already calls
  `handleRobotIdle` (`idleSystem.ts`), which was always going to animate from the robot's current
  position to a new on-screen destination — since that current position is now genuinely
  off-screen (thanks to the exit swim actually having sent it there), this reads as a natural
  "swim back on-screen" for free, the same way a brand-new spawn's first `handleRobotIdle` call
  already does.

### Bottom-only, always

Every robot enters and exits exclusively via the bottom of the world view — never the sides or
top — for every entrance/exit, not just docking-driven ones:

- `spawnSystem.ts`'s `generateSpawnPosition` spawns straight below the bottom edge only. This is
  what every robot's initial off-screen position uses at locale load (Active or Docked), and what
  `landOnDocked` reuses to reposition a robot once it's actually docked — so a robot's resting dock
  spot is always south, never to the sides or above.
- `idleSystem.ts`'s `pickExitDestination` exits straight down from the robot's current position —
  no nearest-edge logic anymore.
- `handleRobotIdle` takes an optional `{ isReturning: true }`, passed by both `Robot.tsx`'s mount
  effect (locale load) and `landOnActive` (a dock-cycle return) — either way, the robot is
  surfacing from its south-only spawn/dock spot, so its first on-screen destination is confined to
  the bottom half of the world view (`BOTTOM_HALF_Y_RANGE`) rather than jumping anywhere on the
  map. Ordinary re-picks after that (`handleRobotArrival`'s delayed re-call, interaction recovery)
  omit the flag and range freely.
- Independently, any robot below `BATTERY_LOWER_THIRD_THRESHOLD` (15%) has its idle wandering
  confined to the lower third of the world view (`LOWER_THIRD_Y_RANGE`), re-evaluated on every
  `handleRobotIdle` call from its live `batteryLevel` — so by the time it actually crosses
  `BATTERY_CRITICAL_THRESHOLD` and departs, it's already near the bottom, keeping the exit swim
  short. `isReturning` takes precedence over this when both would apply (not a real case in
  practice — a robot's battery is 100% the instant it lands `Active`).

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

## Job Assignment

`scoreJobAffinities(robot): Record<JobType, number>` is a pure, deterministic function over a
robot's already-seeded melodic attributes — no new randomness, since the *inputs* were seeded at
spawn and the scoring itself is plain arithmetic:

| Job | Favors |
|---|---|
| **Vent Extraction** | low register, dense rhythm, short/tight motif, low note variance |
| **Acoustic Survey** | high register, sparse rhythm, long/scattered motif, high/unrestricted variance |
| **Structural Inspection** | wide octave span, mid-length motif (4–8), balanced density |
| **Fluid Monitoring** | mid register, density and variance near their defaults |

`assignJob(localeId, robotId)` sorts the four types by score for the deploying robot, skips any
type already at `JOB_MAX_ROBOTS_PER_TYPE` (3) active assignments in that locale, and writes the
first available type plus `assignedAtMeasure: getCurrentMeasure()`. At the fixed 12-robot roster,
4 types × cap 3 = 12, so the cap only matters transiently — never permanently starves a profile.
Job is pure data: no world position, no per-job visual behavior, no factory/depth-layer coupling.

## Roster Creation

`spawnInitialRoster(localeId)` (`spawnSystem.ts`) creates exactly `MAX_ROBOTS` robots once, at
locale load:

- A seeded count within `[INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]` (2–4) start
  `Active` at full battery.
- The rest start `Docked`, each with an independently seeded, varied starting battery (0–99) so
  they don't all finish recharging in lockstep.
- Does **not** assign jobs — `worldTransition.ts`'s `initializeLocale` does that for the
  initially-`Active` robots immediately after, to avoid an import cycle: `robotSystems.ts` already
  imports `generateSpawnPosition` from `spawnSystem.ts`, so `spawnSystem.ts` never imports back
  from `robotSystems.ts`.
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
kept or backfilled with tests; see roadmap Phase 19.)

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
power-on, which re-registers **every** robot in the locale (not filtered by docking, and not the
retired `persists`) — every robot keeps its voice/melody reserved regardless of docking state, so
this pass now covers all of them, not a filtered subset. This release-then-reserve pass predates
this phase; `AudioEngine.killAll()` itself does not touch the `compositeVoices` map (confirmed by
reading it — it only cancels/resets the Transport and calls `resetBeatClock()`), so voices are not
actually known to be invalidated by a power cycle. The re-registration may be unnecessary defensive
work carried over as-is rather than a behavior this phase verified is required — not changed here,
since removing it would be a separate, unverified change. `audioMode` (unaffected by the power
cycle either way, since it lives in `useLocaleStore`, not `AudioEngine`) is what keeps Docked
robots silent afterward, exactly as before the outage.

## Testing Notes

The current tests (`robotSystems.test.ts`, plus updated coverage in `idleSystem.test.ts`,
`spawnSystem.test.ts`, `worldTransition.test.ts`) cover:
- battery drain math for all four job types plus the no-job case, and recharge math, both clamped
- threshold-triggered `Docking`/`Departing` entry with the hold, not an immediate landing
- hold-elapsed landing on `Active`/`Docked`
- `landOnActive`/`landOnDocked` setting `audioMode` (not touching voice reservation/melody registration), plus their position, job, and idle-restart side effects
- `beginDeparting` starting an exit swim (`pickExitDestination`/`createSwimTimeline` called with an off-screen destination) and setting `state: Moving` the instant Departing begins, and `landOnDocked` settling `state` back to `Idle` so a later entrance swim isn't blocked by `handleRobotIdle`'s own guard
- `idleSystem.ts`'s `pickExitDestination` always exiting straight down, genuinely outside the world bounds
- `spawnSystem.ts`'s `generateSpawnPosition` only ever spawning below the bottom edge
- `pickDestination`'s `yRange` parameter, and `handleRobotIdle` selecting the lower-third range below `BATTERY_LOWER_THIRD_THRESHOLD`, the bottom-half range for `{ isReturning: true }`, and `isReturning` taking precedence when both would apply
- `beginDeparting` preserving the robot's current facing direction on exit, rather than recomputing one from a now-nonexistent horizontal component
- `landOnDocked` re-registering the drifted melody with `AudioEngine` so a manual mute override plays the post-drift pitches
- `scoreJobAffinities` determinism and each profile scoring highest for a robot matching its description
- `assignJob` respecting `JOB_MAX_ROBOTS_PER_TYPE`
- `startRobotLifecycle`/`stopRobotLifecycle` idempotency
- the `idleSystem.ts` docking guard
- `spawnInitialRoster`'s active/docked split, seeded battery variation, its determinism across identical coordinates, and that every robot (Docked included) has a reserved voice/registered melody with `audioMode` matching its docking state
- the never-zero-`Active` invariant: a sole `Active` robot at/below critical battery stays `Active` (including floored at exactly 0) instead of departing; it departs on a later tick once another robot has landed back on `Active`; and when two robots cross critical in the same tick, only one departs while the other is held
