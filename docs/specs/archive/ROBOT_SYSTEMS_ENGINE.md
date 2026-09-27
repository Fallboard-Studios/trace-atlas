# Phase Spec: Robot Systems Engine (Roadmap Phase 7)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/robot-systems-engine.md](../intent/robot-systems-engine.md)
(confirmed via `/interview-me`). Source of scope: [docs/todo/roadmap.md § 7](../todo/roadmap.md#7-robot-systems-engine).
Prior art / current architecture: [docs/BEAT_CLOCK.md](../BEAT_CLOCK.md),
[docs/MELODY_SYSTEM.md](../MELODY_SYSTEM.md), [docs/reference/ROBOT_DATA_GRID.md](../reference/ROBOT_DATA_GRID.md),
[docs/UI_SHELL.md](../UI_SHELL.md).

---

## 1. Overview & Claude Explanation

This phase replaces the dynamic spawn/despawn/persistence machinery — kept alive through Phases
4–6 purely as test scaffolding — with the real, permanent Battery/Docking/Job lifecycle. **The
scope is deliberately wider than the roadmap's own bullet list**: the roadmap's Removal section
names only "the current Robot Options console tab (robot count min/max slider, auto-spawn toggle)"
and the `persists` field, but that tab was already dropped in Phase 3
([docs/UI_SHELL.md](../UI_SHELL.md) § Console Navigation). What's actually still live and gets
retired here is the machinery behind it: `locale.settings`' spawn fields, `spawnSystem.ts`'s
scheduler and min/max "bounce" logic, `removeSystem.ts`'s exit-and-remove path, `persists` itself
(field, toggle, and the power-cycle functions keyed off it), and `RobotsTab.tsx`'s manual
"+ New Robot" button. Confirmed during intake: all of it goes in this same phase, not left
dangling for Phase 8/9 to inherit.

**Roster.** Locale load now spawns exactly **12 robots once** (`MAX_ROBOTS` stays `12`, but as a
fixed roster size, not a ceiling a scheduler bounces against). A seeded count of **2–4** starts
`Active` (with a job already assigned); the remaining 8–10 start `Docked`, each with a seeded,
varied sub-100% starting battery level so they don't all finish recharging in lockstep.

**Docking.** A second state machine, `Docked | Docking | Departing | Active`, following the exact
`RobotState` const-object pattern (`Robot.ts:14-21`) and layered orthogonally alongside it —
`RobotState` (`Idle`/`Moving`/`Selected`/`Interacting`/`Leaving`) is untouched; it still governs
in-world idle/interaction behavior for whichever robots are currently `Active`. Docking is purely
battery-driven — Job never gates a transition. `Docking`/`Departing` are real, held states lasting
**up to one measure** (until the next measure boundary from whenever the threshold was actually
crossed, not always a full measure), landing on `Active`/`Docked` at that boundary.

**Battery.** Evaluated once per measure via BeatClock (`subscribeToMeasure` — never
`setTimeout`/`setInterval`). While `Active`: drains **2%/measure base**, plus a per-job surcharge
(Job 1 +1% → 3% total, Job 2 +3% → 5%, Job 3 +5% → 7%, Job 4 +7% → 9%). While `Docked`: recharges
flat **5%/measure**, same rate for every robot. **≤10%** triggers recall (`Active`→`Departing`).
**100%** triggers redeploy-eligible (`Docked`→`Docking`). Starting battery at spawn is seeded via
`getSeededVal`, never `Math.random`.

**Landing effects.** The instant a robot lands on `Active` (`Docking`→`Active`) or `Docked`
(`Departing`→`Docked`), its voice/melody is hard mute/unmuted, reusing the exact
`AudioEngine.reserveVoice`/`releaseVoice` + `registerRobotMelody`/`unregisterRobotMelody` calls
`spawnSystem.ts` already makes — no gain ramp, no timed crossfade. Landing on `Active` also
(re)starts its idle wander via the *existing* `handleRobotIdle` (today only called once, from
`Robot.tsx`'s mount effect) and triggers job assignment (see below). Landing on `Docked` snaps
`position` to an off-screen coordinate (reusing `generateSpawnPosition`'s existing
just-outside-the-viewBox placement — no new position logic) and applies the pitch-drift re-roll.

**Pitch drift.** Every time a robot lands on `Docked`, **25% of its melody events (rounded, floor
of 1)** get a seeded `noteIndex` re-roll. `startStep`, `length`, and `octave` are untouched —
rhythm never changes, only pitch. Recurring every dock cycle, not a one-time spawn effect.

**Job.** Assigned automatically the moment a robot lands on `Active` (including the 2–4 that start
`Active` at spawn) via a deterministic, seeded affinity-scoring function over the robot's existing
melodic attributes (`octaveRange`, `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`)
against four profiles (adapted from the reviewed design draft — world-position/visual elements cut,
see § 3):

1. **Vent Extraction** — low register, tight/dense rhythm, low note variance.
2. **Acoustic Survey** — high register, sparse rhythm, high/unrestricted variance.
3. **Structural Inspection** — wide octave span, mid-length motifs, balanced density.
4. **Fluid Monitoring** — mid register, default/mid density and variance.

Assignment sorts the four profiles by affinity score for the deploying robot and skips any profile
already at its per-type cap (`JOB_MAX_ROBOTS_PER_TYPE = 3` — at the fixed 12-robot roster this
means all four profiles necessarily stay represented once fully deployed, since 4×3 = 12). Job is
**pure data/scoring** — no world position, no per-job visual behavior, no coupling to specific
factories or depth layers.

**Idle/collision gating.** `idleSystem.ts`'s `handleRobotIdle` and `collisionSystem.ts`'s
`canInteract` currently key only on `RobotState`, with no awareness of docking. Both need a
`docking === DockingState.Active` guard added, otherwise a `Docked` (muted, off-screen) robot could
still wander via `handleRobotIdle` away from its dock coordinate, or get flagged into an audible
`triggerInteraction` by `collisionSystem`'s ticker (which iterates every robot in the store, not
just rendered ones). This is the one place existing systems code needs a real behavioral change,
not just new code — everything else is additive.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── Robot.ts                       # MODIFIED — new DockingState const-object (matching
│                                       #   RobotState's pattern) + JobType const-object; Robot
│                                       #   gains `docking: DockingState`, `dockingHoldUntilMeasure?:
│                                       #   number`, `batteryLevel: number` (0-100), `job?: { type:
│                                       #   JobType; assignedAtMeasure: number }`; `persists?:
│                                       #   boolean` field REMOVED
├── constants/
│   └── index.ts                       # MODIFIED — new constants: INITIAL_ACTIVE_ROBOTS_MIN/MAX
│                                       #   (2/4), BATTERY_DRAIN_BASE (2), JOB_BATTERY_DRAIN_SURCHARGE
│                                       #   (Record<JobType, number>), BATTERY_RECHARGE_RATE (5),
│                                       #   BATTERY_CRITICAL_THRESHOLD (10), BATTERY_FULL_THRESHOLD
│                                       #   (100), DOCKED_PITCH_DRIFT_RATIO (0.25),
│                                       #   JOB_MAX_ROBOTS_PER_TYPE (3); MAX_ROBOTS's doc comment
│                                       #   updated from "ceiling" to "fixed roster size"
├── engine/
│   ├── melodyGenerator.ts             # MODIFIED — new exported `reRollMelodyPitches(melody,
│                                       #   ratio, opts)` helper (see § 4); reuses
│                                       #   `pickRandomIndices`/`pickWeightedIndex`, both already
│                                       #   exported — no change to `generateMelodyForRobot` itself
│   └── melodyGenerator.test.ts        # MODIFIED — new describe block for `reRollMelodyPitches`
├── systems/
│   ├── robotSystems.ts                # NEW — the phase's core deliverable. Exports:
│                                       #   `startRobotLifecycle(localeId)` /
│                                       #   `stopRobotLifecycle()` (measure-subscription
│                                       #   start/stop, mirrors startSpawnScheduler/
│                                       #   stopSpawnScheduler's module-singleton pattern —
│                                       #   replaces both); `tickRobotLifecycle(localeId,
│                                       #   measure)` (pure per-measure step, exported
│                                       #   separately so tests can call it directly without a
│                                       #   real BeatClock); `scoreJobAffinities(robot)` (pure,
│                                       #   returns `Record<JobType, number>`); `assignJob(
│                                       #   localeId, robotId)` (roster-balanced pick + store
│                                       #   write); `landOnActive`/`landOnDocked` (mute/unmute +
│                                       #   idle-restart + pitch-drift + position wiring)
│   ├── robotSystems.test.ts           # NEW — see § 5
│   ├── spawnSystem.ts                 # MODIFIED — `startSpawnScheduler`/`stopSpawnScheduler`/
│                                       #   `SPAWN_INTERVAL_MIN/MAX` and the min/max "bounce"
│                                       #   branch in `spawnRobot` REMOVED; `spawnRobot` (renamed
│                                       #   `createRobot`? — see § 7 open question) gains
│                                       #   `docking`/`batteryLevel` params instead of always
│                                       #   defaulting to Idle/Docked; `persists: false` field
│                                       #   REMOVED from the constructed `Robot`; new exported
│                                       #   `spawnInitialRoster(localeId)` loops 12x, seeding the
│                                       #   2–4-active/rest-docked split; `reRegisterAllRobotsAudio`/
│                                       #   `removeNonPersistentRobots` REMOVED (no more power-cycle
│                                       #   removal — docking replaces it)
│   ├── spawnSystem.test.ts            # MODIFIED — scheduler/min-max tests removed; new coverage
│                                       #   for `spawnInitialRoster`'s active/docked split and
│                                       #   seeded battery levels
│   ├── removeSystem.ts                # MODIFIED — `removeRobotWithExit` and its exit-animation
│                                       #   helpers REMOVED (no robot is ever removed from the
│                                       #   roster anymore; `pickExitDestination`'s "nearest edge"
│                                       #   logic is NOT reused for Departing→Docked — see § 7 open
│                                       #   question on whether it should be)
│   ├── removeSystem.test.ts           # MODIFIED — exit-animation tests removed
│   ├── idleSystem.ts                  # MODIFIED — `handleRobotIdle`'s early-return guard gains
│                                       #   `|| robot.docking !== DockingState.Active`
│   ├── idleSystem.test.ts             # MODIFIED — new test asserting a Docked robot's
│                                       #   `handleRobotIdle` call is a no-op
│   ├── collisionSystem.ts             # MODIFIED — `canInteract`'s `validState` check gains
│                                       #   `&& robot.docking === DockingState.Active`
│   ├── collisionSystem.test.ts        # MODIFIED — new test asserting a Docked robot is excluded
│                                       #   from `canInteract` regardless of `RobotState`
│   └── worldTransition.ts             # MODIFIED — `initializeLocale`'s `spawnRobot(localeId);
│                                       #   spawnRobot(localeId);` pair replaced with
│                                       #   `spawnInitialRoster(localeId)`;
│                                       #   `stopSpawnScheduler()`/`startSpawnScheduler(localeId)`
│                                       #   calls replaced with `stopRobotLifecycle()`/
│                                       #   `startRobotLifecycle(localeId)`; `buildLocale`'s
│                                       #   `settings` object drops `maxRobots`/`minRobots`/
│                                       #   `autoSpawn`/`spawnFrequency`
│   └── worldTransition.test.ts        # MODIFIED — assertions updated for the new init/lifecycle
│                                       #   calls and trimmed `settings` shape
├── types/
│   └── locale.ts                      # MODIFIED — `LocaleSettings` drops `maxRobots`/`minRobots`/
│                                       #   `autoSpawn`/`spawnFrequency`
├── constants/
│   └── index.ts                       # (see above)
├── stores/
│   ├── localeStore.ts                 # MODIFIED — `updateRobot`'s clamp block gains a
│                                       #   `batteryLevel` clamp (0-100); no clamp needed for
│                                       #   `docking`/`job` (not user-editable via any control
│                                       #   until Phase 9)
│   └── localeStore.test.ts            # MODIFIED — new coverage for the `batteryLevel` clamp
└── components/panels/screen/console/
    ├── RobotMetaTab.tsx                # MODIFIED — Persist `Switch.Root` control and its
    │                                    #   `togglePersists`/`currentPersists` state REMOVED;
    │                                    #   `performCopyFromTarget`/`undoCopy`'s optional-field
    │                                    #   copy list drops `persists`; the `Age` row and Copy
    │                                    #   Robot control are otherwise untouched
    ├── RobotMetaTab.test.tsx           # MODIFIED — Persist-toggle test removed
    ├── RobotsTab.tsx                   # MODIFIED — "+ New Robot" `Button`/`NEW_ROBOT_SCHEMA`/
    │                                    #   `handleNewRobot` REMOVED — the tab becomes a
    │                                    #   read-only list (`spawnRobot`/`spawnInitialRoster` is
    │                                    #   never called from UI once the roster is fixed at 12)
    └── RobotsTab.test.tsx              # MODIFIED — "+ New Robot" test removed
docs/
├── ROBOT_LIFECYCLE.md                  # NEW — documents the three state machines and
│                                        #   robotSystems.ts's API, in MELODY_SYSTEM.md's style
├── UI_SHELL.md                         # MODIFIED — the `robotOptions` "Planned Replacement"
│                                        #   point folded in per roadmap § 7 Docs; "+ New Robot"
│                                        #   reference in § Console Navigation updated to reflect
│                                        #   its removal
└── todo/roadmap.md                  # MODIFIED — § 7's bullets marked resolved
CLAUDE.md                               # MODIFIED — docs/ROBOT_LIFECYCLE.md added to the
                                         #   reference doc list
```

**Confirmed NOT touched:** `src/engine/AudioEngine.ts` (no new capability — every call this phase
makes already exists on its public surface), `src/engine/beatClock.ts` (consumed as-is via
`subscribeToMeasure`, no signature change), `src/systems/interactionSystem.ts` (its own
`triggerInteraction` doesn't need a docking guard — `collisionSystem.ts`'s `canInteract` gate is
the single choke point everything already funnels through), `src/components/robot/Robot.tsx` /
`src/components/panels/screen/worldView/OceanScene.tsx` (no render-tree filtering — "off-screen"
is achieved entirely through `position`, matching the existing spawn/exit off-screen pattern, not
a new conditional-render mechanism), `src/data/`, any UI beyond the two files listed above (Robot
Selection cards, Battery/Job/Docking status badges, and the Robot Options drawers are Phase 8/9).

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build
  assets.
* **No new `AudioEngine` capability.** Landing effects reuse `reserveVoice`/`releaseVoice` +
  `registerRobotMelody`/`unregisterRobotMelody` verbatim, the same call shape `spawnSystem.ts`
  already uses. No gain ramp, no timed crossfade, no new method on `AudioEngine`'s public surface.
* **No world-position or factory coupling for Job.** No depth-layer field on `Robot`, no anchoring
  to specific `Actor`/factory instances, no robot movement toward a job site. The four job profiles
  are scoring inputs/outputs only — `type` and `assignedAtMeasure`, nothing else.
* **All recurring timing goes through BeatClock** (`subscribeToMeasure`), matching
  `docs/BEAT_CLOCK.md`'s own "factory production cycle" precedent for non-audio, measure-based game
  logic — never `setTimeout`/`setInterval`/`requestAnimationFrame`.
* **All seeded values go through `getSeededVal`/the locale noise map** — starting battery, the
  active/docked split, job affinity scoring inputs (already-stored robot attributes, so no new
  seeding needed there), and the pitch re-roll's note selection and "which events change" pick.
  Never `Math.random`, matching every other spawn-time attribute in `spawnSystem.ts`.
* **`RobotState` is untouched.** Docking is a second, orthogonal state machine layered alongside
  it, not a replacement. `Robot.state` continues to mean exactly what it means today; do not
  overload it or fold Docking into it.
* **`docking`/`batteryLevel`/`job` stay JSON-serializable.** Plain string enums, numbers, and plain
  objects — no class instances, no functions — consistent with CLAUDE.md's state-serializability
  rule.
* **The `idleSystem.ts`/`collisionSystem.ts` guards are the only behavioral change to
  pre-existing, currently-shipping systems.** Everything else in this phase is either new
  (`robotSystems.ts`) or a straight removal (scheduler, `persists`, exit-animation, "+ New Robot").
  Resist the temptation to "improve" unrelated logic in the files these two guards touch.
* **This phase does not wire Battery/Docking/Job into any UI.** `RobotMetaTab.tsx`/`RobotsTab.tsx`
  are touched only to remove the retired `persists` toggle and "+ New Robot" button — not to add
  any new display of battery/docking/job state. That's Phase 8 (Robot Selection cards) and Phase 9
  (Robot Options drawers).

---

## 4. Code Style & Architecture Conventions

**`types/Robot.ts` — new const-object state machines, matching `RobotState`'s exact shape:**

```typescript
export const DockingState = {
  Docked: 'docked',
  Docking: 'docking',
  Departing: 'departing',
  Active: 'active',
} as const;
export type DockingState = (typeof DockingState)[keyof typeof DockingState];

export const JobType = {
  VentExtraction: 'ventExtraction',
  AcousticSurvey: 'acousticSurvey',
  StructuralInspection: 'structuralInspection',
  FluidMonitoring: 'fluidMonitoring',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];
```

**`types/Robot.ts` — `Robot` interface additions/removals:**

```typescript
// ADDED
docking: DockingState;
/** Measure at which a Docking/Departing hold ends and the robot lands on
 *  Active/Docked. Undefined when docking === Docked | Active (no hold in
 *  progress). Set by robotSystems.ts on threshold crossing. */
dockingHoldUntilMeasure?: number;
/** 0-100. Drains while Active, recharges while Docked. Seeded at spawn. */
batteryLevel: number;
job?: { type: JobType; assignedAtMeasure: number };

// REMOVED
persists?: boolean;
```

**`robotSystems.ts` — per-measure tick (called from a `subscribeToMeasure` callback registered by
`startRobotLifecycle`):**

```typescript
export function tickRobotLifecycle(localeId: string, measure: number): void {
  const robots = useLocaleStore.getState().getLocaleById(localeId)?.robots ?? [];
  for (const robot of robots) {
    if (robot.docking === DockingState.Active) {
      const surcharge = robot.job ? JOB_BATTERY_DRAIN_SURCHARGE[robot.job.type] : 0;
      const next = Math.max(0, robot.batteryLevel - (BATTERY_DRAIN_BASE + surcharge));
      useLocaleStore.getState().updateRobot(localeId, robot.id, { batteryLevel: next });
      if (next <= BATTERY_CRITICAL_THRESHOLD) beginDeparting(localeId, robot.id, measure);
    } else if (robot.docking === DockingState.Docked) {
      const next = Math.min(100, robot.batteryLevel + BATTERY_RECHARGE_RATE);
      useLocaleStore.getState().updateRobot(localeId, robot.id, { batteryLevel: next });
      if (next >= BATTERY_FULL_THRESHOLD) beginDocking(localeId, robot.id, measure);
    } else if (
      (robot.docking === DockingState.Docking || robot.docking === DockingState.Departing) &&
      robot.dockingHoldUntilMeasure !== undefined &&
      measure >= robot.dockingHoldUntilMeasure
    ) {
      if (robot.docking === DockingState.Docking) landOnActive(localeId, robot.id);
      else landOnDocked(localeId, robot.id);
    }
  }
}
```

`beginDocking`/`beginDeparting` set `docking` to the transitional state and
`dockingHoldUntilMeasure` to `measure + 1` (landing at the *next* measure boundary — this is what
gives the "up to one measure" hold; a threshold crossed right before a boundary lands almost
immediately, one crossed right after waits nearly a full measure).

**`robotSystems.ts` — landing effects:**

```typescript
function landOnActive(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;
  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Active,
    dockingHoldUntilMeasure: undefined,
  });
  const layers = (robot.audioAttributes as { layers?: OscillatorLayer[] })?.layers;
  if (Array.isArray(layers) && layers.length > 0) {
    AudioEngine.reserveVoice(robotId, layers, robot.audioAttributes.phase, robot.audioAttributes.detune, layers[0]?.pulseWidth);
  }
  AudioEngine.registerRobotMelody(robotId, robot.melody);
  assignJob(localeId, robotId);
  handleRobotIdle(localeId, robotId); // restart wandering — Robot.tsx only calls this on mount
}

function landOnDocked(localeId: string, robotId: string): void {
  const robot = useLocaleStore.getState().getRobotById(localeId, robotId);
  if (!robot) return;
  const noiseMap = /* getLocaleNoiseMap(localeId, ...) — same pattern as spawnSystem.ts */;
  const dockPosition = generateSpawnPosition(noiseMap, dockPositionOffsetFor(robot));
  const rerolled = reRollMelodyPitches(robot.melody, DOCKED_PITCH_DRIFT_RATIO, { noteVariance: robot.noteVariance, rand: /* seeded */ });
  useLocaleStore.getState().updateRobot(localeId, robotId, {
    docking: DockingState.Docked,
    dockingHoldUntilMeasure: undefined,
    position: dockPosition,
    melody: rerolled,
  });
  AudioEngine.releaseVoice(robotId);
  AudioEngine.unregisterRobotMelody(robotId);
}
```

**`melodyGenerator.ts` — new `reRollMelodyPitches` (reuses existing exports, no new selection
logic invented):**

```typescript
/**
 * Re-roll a seeded ratio of a melody's note pitches, leaving rhythm untouched.
 * `startStep`/`length`/`octave` are never modified — only `noteIndex`.
 */
export function reRollMelodyPitches(
  melody: MelodyEvent[],
  ratio: number,
  opts: { noteVariance?: ToggleValue; rand: () => number },
): MelodyEvent[] {
  const count = Math.max(1, Math.round(melody.length * ratio));
  const indices = pickRandomIndices(melody, count, opts.rand); // already exported (line 124)
  const changeSet = new Set(indices);
  return melody.map((event, i) => {
    if (!changeSet.has(i)) return event;
    const noteIndex = opts.noteVariance?.active
      ? pickWeightedIndex(opts.rand) // already exported (line 480)
      : Math.floor(opts.rand() * 8);
    return { ...event, noteIndex };
  });
}
```

**`collisionSystem.ts` — `canInteract`'s new guard:**

```typescript
// BEFORE
const validState = robot.state === RobotState.Idle || robot.state === RobotState.Moving;

// AFTER
const validState =
  (robot.state === RobotState.Idle || robot.state === RobotState.Moving) &&
  robot.docking === DockingState.Active;
```

**`idleSystem.ts` — `handleRobotIdle`'s new guard:**

```typescript
// BEFORE
if (!robot || robot.state !== RobotState.Idle) {

// AFTER
if (!robot || robot.state !== RobotState.Idle || robot.docking !== DockingState.Active) {
```

* **Naming Conventions:** `robotSystems.ts` follows the existing systems-file section-banner
  convention (`// ====...====` blocks: IMPORTS / TYPES / CONSTANTS / MODULE STATE / EXPORTS) seen
  in `spawnSystem.ts`/`idleSystem.ts`. Exported pure functions are verbs (`tickRobotLifecycle`,
  `scoreJobAffinities`, `assignJob`), matching `handleRobotIdle`/`triggerInteraction`'s style.
* **Formatting:** Match each touched file's existing comment-banner style; no new convention.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (see § 2 for exact files).
* **`robotSystems.test.ts` (new):**
  1. `tickRobotLifecycle` drains an `Active` robot's `batteryLevel` by exactly `BATTERY_DRAIN_BASE
     + JOB_BATTERY_DRAIN_SURCHARGE[job.type]` per call, for each of the four job types.
  2. `tickRobotLifecycle` recharges a `Docked` robot's `batteryLevel` by exactly
     `BATTERY_RECHARGE_RATE` per call, clamped at 100.
  3. An `Active` robot whose battery crosses `BATTERY_CRITICAL_THRESHOLD` transitions to
     `Departing` with `dockingHoldUntilMeasure` set to the next measure — not immediately to
     `Docked`.
  4. A `Docked` robot whose battery reaches `BATTERY_FULL_THRESHOLD` transitions to `Docking` with
     `dockingHoldUntilMeasure` set to the next measure — not immediately to `Active`.
  5. A `Docking`/`Departing` robot whose `dockingHoldUntilMeasure` has been reached lands on
     `Active`/`Docked` respectively, and `dockingHoldUntilMeasure` clears.
  6. Landing on `Active` calls `AudioEngine.reserveVoice`/`registerRobotMelody`, assigns a `job`,
     and results in `handleRobotIdle` being invoked (spy/mock).
  7. Landing on `Docked` calls `AudioEngine.releaseVoice`/`unregisterRobotMelody`, repositions
     off-screen, and re-rolls ~25% of `melody`'s `noteIndex` values while leaving `startStep`/
     `length`/`octave` unchanged on every event.
  8. `scoreJobAffinities` is deterministic — same robot attributes in, same scores out — and each
     of the four profiles scores highest for a robot whose attributes match its description (e.g. a
     low-register, dense, low-variance robot scores highest on Vent Extraction).
  9. `assignJob` respects `JOB_MAX_ROBOTS_PER_TYPE` — once a job type has 3 active assignments, a
     newly-landing robot that would otherwise score highest on that type is assigned its
     next-best available type instead.
* **`melodyGenerator.test.ts` (new `reRollMelodyPitches` block):**
  1. Given a fixed seed, exactly `Math.round(melody.length * 0.25)` events (floor 1) have a
     different `noteIndex` than the input; all others are byte-identical.
  2. `startStep`/`length`/`octave` are unchanged on every event, including the re-rolled ones.
  3. `noteVariance.active: false` produces unweighted `noteIndex` picks (`Math.floor(rand()*8)`
     range); `active: true` produces picks that respect `pickWeightedIndex`'s distribution.
* **`idleSystem.test.ts` (new):** `handleRobotIdle` is a no-op (no store update, no timeline) when
  `robot.docking !== DockingState.Active`, regardless of `robot.state`.
* **`collisionSystem.test.ts` (new):** `canInteract` returns `false` for a `Docked` robot even when
  `robot.state === RobotState.Idle`.
* **`spawnSystem.test.ts` (rewritten):** scheduler/min-max/bounce tests removed; new coverage
  asserts `spawnInitialRoster` produces exactly 12 robots, with the active count seeded within
  `[INITIAL_ACTIVE_ROBOTS_MIN, INITIAL_ACTIVE_ROBOTS_MAX]` and every `Docked` robot's `batteryLevel`
  seeded (not all identical, not all 100).
* **`removeSystem.test.ts`:** exit-animation tests removed (file may end up empty/deleted — see § 7).
* **`worldTransition.test.ts`:** assertions updated for `spawnInitialRoster`/
  `startRobotLifecycle`/`stopRobotLifecycle` call sites and the trimmed `LocaleSettings` shape.
* **`localeStore.test.ts`:** new coverage for `updateRobot`'s `batteryLevel` clamp (0-100).
* **`RobotMetaTab.test.tsx`/`RobotsTab.test.tsx`:** Persist-toggle and "+ New Robot" tests removed.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (catches any leftover `persists`/`onsetCount`-
     style stale reference to removed fields).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
  5. Manual check (`npm run dev`): load a fresh locale, confirm exactly 12 robots exist in the
     store (`useLocaleStore.getState()`), 2–4 visibly `Active`/audible, the rest silent; watch for
     several minutes and confirm at least one `Active`→`Departing`→`Docked` or `Docked`→`Docking`→
     `Active` cycle occurs and audibly/visibly matches expectations (mute on dock, unmute + wander
     on redeploy).

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges
  manually.
* **Branch Convention:** `feature/robot-systems-engine`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences, roughly: (1) `Robot.ts`/`constants/index.ts` type + constant additions, (2)
  `melodyGenerator.ts`'s `reRollMelodyPitches` + test, (3) `robotSystems.ts` + test (the core
  deliverable), (4) `spawnSystem.ts`/`removeSystem.ts` retirement + `worldTransition.ts` rewiring +
  their tests, (5) `idleSystem.ts`/`collisionSystem.ts` docking guards + tests, (6)
  `localeStore.ts` clamp + test, (7) `RobotMetaTab.tsx`/`RobotsTab.tsx` removals + tests, (8) doc
  updates (`ROBOT_LIFECYCLE.md`, `UI_SHELL.md`, `CLAUDE.md`, `roadmap.md`) last.

---

## 7. Open Questions & Risks

Carried forward from Specify — resolve in the Plan/Tasks phase before implementation, not silently
during coding:

1. **Exact new-field naming.** `docking`/`batteryLevel`/`job` (§ 4) are proposed, not mandated —
   confirmed during intake that the *shapes* (const-object state machine matching `RobotState`;
   plain 0-100 number for battery; `{ type, assignedAtMeasure }` for job) are right, but the exact
   field names weren't asked about directly. Low risk, but pick during Plan.
2. **Departing→Docked visual transition.** § 1/§ 2 propose an instant position snap (no exit
   animation), matching the confirmed "hard mute, no fade" simplicity for audio. But
   `removeSystem.ts`'s existing `pickExitDestination`/GSAP swim-to-edge logic is being deleted
   wholesale rather than repurposed — it *could* be adapted for Departing→Docked at low cost (it's
   reuse of existing GSAP code, not new animation work) to give docking a visible "swim off" moment
   symmetric with the "swim on" entrance that `handleRobotIdle` already gives Docking→Active for
   free. This asymmetry (animated entrance, snapped exit) wasn't explicitly discussed during
   intake — confirm the simpler instant-snap default, or ask for the exit animation to be reused,
   during Plan.
3. **`spawnSystem.ts` naming after scope changes.** The file keeps creating robots (now via
   `spawnInitialRoster`/an internal per-robot constructor) but loses "spawn" in the dynamic-timer
   sense entirely. § 2 proposes keeping the filename and renaming the per-robot function
   `spawnRobot` → `createRobot` internally; renaming the file itself (e.g. to `rosterSystem.ts`) is
   a bigger diff for no behavior change — default to keeping the filename unless Plan decides
   otherwise.
4. **`removeSystem.ts`'s fate.** With `removeRobotWithExit` gone and no other exported function,
   the file (and its test) may end up empty. Decide during Plan whether to delete both files
   outright or leave an empty/near-empty file as a placeholder for a future "robot actually leaves
   the roster" mechanic (none is planned, but Session Storage/Phase 12 or a later phase could
   introduce one). Default: delete both files — nothing in this repo's convention keeps empty
   scaffold files around (see `verify-roadmap-against-code` project convention of not leaving dead
   code for a future phase to inherit).
5. **`docs/ROBOT_LIFECYCLE.md`'s exact content** is scoped (state machines + `robotSystems.ts`
   API, MELODY_SYSTEM.md's style) but not drafted here — write it during/after implementation once
   the real API surface is final, per the roadmap's own Docs-bullet convention.
6. **Dock position seeding.** § 4's `dockPositionOffsetFor(robot)` needs a concrete seed-offset
   scheme (e.g. reuse `spawnCount`-equivalent per-robot index, or a dedicated `'dock.pos'` dataId
   keyed by robot index) — not fully specified here; finalize during implementation, following the
   exact pattern `generateSpawnPosition`'s existing callers already use.
