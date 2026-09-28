# Phase Spec: World Clock — Deterministic Lifecycle Replay

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/world-clock-deterministic-lifecycle-replay.md](../intent/world-clock-deterministic-lifecycle-replay.md), confirmed via `interview-me` 2026-09-28 (revised same day — see the intent doc's "What changed from the first pass"). Roadmap: [Phase 20.5](../todo/roadmap.md#205-world-clock-deterministic-lifecycle-replay). Status: not yet implemented — Specify phase, pending Crawford's review before Plan. **Revision note: this spec's first draft scoped melody out; this version brings dock-triggered melody pitch drift into scope and confirms position/movement out, per the intent doc's revision. §7 still has open items needing sign-off before Plan.**

---

## 1. Overview & Claude Explanation

Robot battery/docking/job *and* dock-triggered melody pitch drift (`docs/ROBOT_LIFECYCLE.md`) become replayable: given a roster's seeded spawn state and a target elapsed-measures count, a new pure function reproduces the exact `batteryLevel`/`docking`/`dockingHoldUntilMeasure`/`job`/`melody` a real measure-by-measure `tickRobotLifecycle` run would have produced — with zero BeatClock subscription, zero store writes, zero AudioEngine/GSAP side effects. A new `Locale.createdAtMeasure: number` field (stamped once, same pattern as `dayStartTimestamp`) makes "elapsed measures since roster creation" computable as `getCurrentMeasure() - locale.createdAtMeasure`. **Replay always fully re-simulates from the locale's creation measure forward — it never resumes from a mid-simulation checkpoint** — which is what makes melody drift replayable without any new persisted counter: the per-robot dock-cycle count that seeds each pitch reroll falls out of the replay loop by counting `Departing`→`Docked` landings in order. A short, non-blocking audit pass records which other timing-dependent systems (LFO drift, audio swells, ping-variance automation) are already measure-quantized and safe.

**On-screen position/movement stays out of scope — confirmed intentional, not a gap** (§1.2). **No consumer wires this in during this phase** — Session Storage's `SessionPayload`, Phase 21's share links, and Phase 32's scrubber all stay untouched. Verification is a headless prove-it test (N real ticks vs. one replay call converge on identical state), not a manual browser check — there is nothing to click yet.

### 1.1 What's actually being extracted

`robotSystems.ts`'s `tickRobotLifecycle` is store-coupled: every measure, for every robot, it reads/writes `useLocaleStore.getState()` directly, and its two "landing" effects — `landOnActive`/`landOnDocked` (called via `beginDeparting`/`beginDocking` → the hold-measure check) — trigger real side effects: `createSwimTimeline` (GSAP), `handleRobotIdle` (idle/wandering restart), `AudioEngine.registerRobotMelody`, and `reRollMelodyPitches` (dock-cycle-seeded melody pitch drift, keyed today by the module-global `dockCycleCounters` map and `generateSpawnPosition`, keyed by that same counter, for the robot's off-screen dock position).

**The pure extraction reproduces `docking`/`batteryLevel`/`dockingHoldUntilMeasure`/`job`/`melody` — not `position`/`audioMode`/`state`/`destination`/`direction`.** Melody drift is in scope because it's dock-cycle-seeded, cumulative, audible state — exactly the kind of thing "share exactly what you're hearing" (this phase's motivating use case) needs. Position stays out because it isn't a snapshot-style value at all: a `Docked` robot's position is always off-viewBox/invisible regardless of *which* off-screen point `generateSpawnPosition` picked, and `Active` wandering is continuous GSAP animation, not discrete per-measure state. The one real coupling found between battery and movement — `idleSystem.ts:130`, low battery biases wander-destination Y-range — is one-way (battery → movement, never the reverse) and doesn't affect anything this phase replays; verified directly, not assumed, that battery drain itself has zero dependency on position/movement/distance (the only site that ever writes `batteryLevel` is `tickRobotLifecycle`, a flat per-measure rate).

### 1.2 Existing precedents this design reuses

- **`tickRobotLifecycle`'s own "measure passed in, not read from BeatClock" pattern** (`robotSystems.ts:78-82`) — already written to be testable without a real transport; the pure step function below is the same idea taken further (no store, no module-global counter either).
- **Phase 31's `spawnSystem.ts` extraction shape** (`generateRobotAudioBaseline`, pure/additive, zero store import) — the model for extracting `stepRobotLifecycle`/`replayLifecycle` as new, additive pure functions in `robotSystems.ts`, with `tickRobotLifecycle` itself refactored to call them rather than reimplementing the same arithmetic twice.
- **`reRollMelodyPitches` is already pure** (`melodyGenerator.ts:599` — takes `(melody, ratio, { noteVariance, rand })`, no store/side effects) — reused directly by the pure step function, not reimplemented.
- **`dayStartTimestamp`'s stamping pattern** (`worldTransition.ts`'s `buildLocale`) — the model for `createdAtMeasure`: computed once, at locale construction, never recomputed.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── locale.ts                         MODIFIED — add `createdAtMeasure: number` to `Locale`,
│                                          doc-commented the same way as the adjacent
│                                          `dayStartTimestamp` (§7 item 1 — NOT the same field as
│                                          the existing `currentMeasure`, which is unrelated/dead)
├── systems/
│   ├── worldTransition.ts                MODIFIED — `buildLocale` stamps `createdAtMeasure` via
│   │                                     `getCurrentMeasure()` at the same point it stamps
│   │                                     `dayStartTimestamp`
│   ├── worldTransition.test.ts           MODIFIED — new case(s) per §5.2
│   ├── robotSystems.ts                   MODIFIED — extract `RobotLifecycleSnapshot` type,
│   │                                     `stepRobotLifecycle(roster, measure, noiseMap)`, and
│   │                                     `replayLifecycle(roster, fromMeasure, toMeasure, noiseMap)`;
│   │                                     `tickRobotLifecycle` refactored to call
│   │                                     `stepRobotLifecycle` for the battery/docking/job/melody
│   │                                     arithmetic, then apply its own landing side effects
│   │                                     (swim timeline, idle restart, position, AudioEngine)
│   │                                     exactly where the transition says one landed
│   └── robotSystems.test.ts              MODIFIED — new cases per §5.2, including the prove-it
│                                          replay-vs-realtime test
docs/
├── todo/backlog.md                       MODIFIED — new entry for the audit findings (§4.5),
│                                          non-blocking, per intent doc's "informational only"
└── ROBOT_LIFECYCLE.md                    MODIFIED — documents the new pure step/replay functions
                                           and exactly which fields replay does/doesn't reproduce
```

No new dependency. No new type file — `RobotLifecycleSnapshot` lives in `robotSystems.ts` itself, colocated with its only consumer, matching this codebase's existing preference for a dedicated type file only when a concern is shared across multiple modules (session.ts, lfo.ts, audioSwell.ts all qualify; this doesn't).

---

## 3. Implementation Boundaries & Constraints

Non-negotiable, from `CLAUDE.md` (re-checked for this change):

- **Measure-quantized, no `setTimeout`/`setInterval`.** Unchanged — `stepRobotLifecycle`/`replayLifecycle` take a measure count as a plain parameter; nothing here introduces a timer of any kind, headless replay is a synchronous loop.
- **GSAP timelines only trigger semantic state changes, never call AudioEngine directly.** Unchanged and, if anything, reinforced: the pure step function calls neither GSAP nor AudioEngine at all — `tickRobotLifecycle`'s own landing-effect calls (`createSwimTimeline`, `AudioEngine.registerRobotMelody`, `generateSpawnPosition`) stay exactly where they are today, now conditioned on `stepRobotLifecycle`'s transition result rather than reimplemented.
- **State stays JSON-serializable.** `RobotLifecycleSnapshot` is a plain data shape (subset of `Robot`'s own fields, plus one new `dockCycleCount` counter) — no runtime objects.
- **No Tone synths in components.** N/A — nothing here touches audio directly.
- **Melody *base* generation untouched.** Phase 31's seed formula (`compositionSeed` + attributes → `generateMelodyForRobot`) is not touched by this phase — only the drift layer `reRollMelodyPitches` applies on top of it at each dock cycle.

**Ask first** (per `CLAUDE.md`): none anticipated — no new dependency, no architecture change beyond the extraction itself.
**Never:** let `stepRobotLifecycle`/`replayLifecycle` read `useLocaleStore`, call `getCurrentMeasure()` internally (measure is always a parameter), call AudioEngine/GSAP/`generateSpawnPosition` themselves, or diverge from `tickRobotLifecycle`'s/`landOnDocked`'s real arithmetic (this is an extraction, not a parallel reimplementation).

---

## 4. Code Style & Architecture Conventions

### 4.1 `Locale.createdAtMeasure` (`src/types/locale.ts`)

```typescript
export interface Locale {
  // ...existing fields...
  /** Wall-clock timestamp this locale's in-world day began... */
  dayStartTimestamp: number;
  /** BeatClock measure this locale's roster was created at (getCurrentMeasure() at build time,
   *  same stamping point as dayStartTimestamp) -- elapsed measures for lifecycle replay purposes
   *  is always `getCurrentMeasure() - createdAtMeasure`, never separately tracked. NOT the same
   *  field as the pre-existing `currentMeasure` below, which is unrelated legacy state that is
   *  never incremented by the real tick system (see §7 item 1) -- do not conflate the two. */
  createdAtMeasure: number;
  robots: Robot[];
  actors: Actor[];
  companies: Company[];
  currentMeasure: number;
  // ...
}
```

### 4.2 The pure step/replay functions (`src/systems/robotSystems.ts`)

```typescript
/** The subset of Robot fields a lifecycle replay reads or writes -- deliberately narrower than
 *  Robot itself. Includes the fields scoreJobAffinities needs (read-only, never written by
 *  replay) alongside the fields a tick/dock-cycle actually transitions. */
export interface RobotLifecycleSnapshot {
  id: string;
  docking: DockingState;
  batteryLevel: number;
  dockingHoldUntilMeasure?: number;
  job?: { type: JobType; assignedAtMeasure: number };
  melody: MelodyEvent[];
  /** How many times this robot has landed on Docked so far -- the replay-derived equivalent of
   *  the live dockCycleCounters module map, threaded as part of the snapshot itself (not a side
   *  channel) so stepRobotLifecycle stays a pure function of its own input. Starts at 0. */
  dockCycleCount: number;
  octaveRange: [number, number];
  rhythmicDensity?: number;
  rhythmicMotifLength?: Robot['rhythmicMotifLength'];
  noteVariance?: Robot['noteVariance'];
}

/** One measure's worth of battery/docking/job/melody-drift transition for an entire roster, pure
 *  -- mirrors tickRobotLifecycle's per-robot logic (BATTERY_DRAIN_BASE/JOB_BATTERY_DRAIN_SURCHARGE/
 *  BATTERY_RECHARGE_RATE/BATTERY_CRITICAL_THRESHOLD/BATTERY_FULL_THRESHOLD, the "never zero
 *  Active" invariant, assignJob's balancing) and landOnDocked's melody-drift step
 *  (reRollMelodyPitches/DOCKED_PITCH_DRIFT_RATIO, seeded by dockCycleCount the same way
 *  dockCycleCounters seeds it live) exactly, reusing the same constants/functions -- never a
 *  second copy of the arithmetic. `noiseMap` is required (not optional the way landOnDocked's
 *  alea fallback is live) -- replay always has a real spawned locale's noise map available; see
 *  §7 item 2. Mutates a local working array as it iterates (matching tickRobotLifecycle's own
 *  "re-read fresh, not the stale snapshot" invariant check), in roster array order, so
 *  within-measure ordering effects match a real tick bit for bit. Does NOT call
 *  createSwimTimeline, handleRobotIdle, AudioEngine.*, or generateSpawnPosition -- a robot that
 *  transitions Docking->Active or Active->Departing->Docked during this step has its
 *  docking/batteryLevel/dockingHoldUntilMeasure/job/melody/dockCycleCount fields resolved;
 *  position/audioMode/state/destination/direction are the caller's concern (tick calls the
 *  existing landing effects when it detects a transition happened; replay does not). */
export function stepRobotLifecycle(roster: RobotLifecycleSnapshot[], measure: number, noiseMap: NoiseFunction2D): RobotLifecycleSnapshot[];

/** Replays fromMeasure+1 .. toMeasure inclusive via stepRobotLifecycle, in a tight loop -- zero
 *  side effects, zero store access. toMeasure < fromMeasure + 1 is a no-op (returns roster
 *  unchanged). Always called with fromMeasure = the locale's own createdAtMeasure in practice
 *  (per the "always replay from creation" decision, §1) -- the function itself doesn't enforce
 *  that, callers do. The one caller-facing entry point for headless lifecycle replay. */
export function replayLifecycle(roster: RobotLifecycleSnapshot[], fromMeasure: number, toMeasure: number, noiseMap: NoiseFunction2D): RobotLifecycleSnapshot[];
```

`tickRobotLifecycle` itself is refactored to build a `RobotLifecycleSnapshot[]` from the live roster (reading each robot's current `dockCycleCount` from... — **open question, §7 item 4**: the live path has no field to read this from today, only the module-global `dockCycleCounters` map), call `stepRobotLifecycle(snapshot, measure, noiseMap)` once, then diff the result against the pre-tick snapshot per robot: for any robot whose `docking` changed, call the appropriate existing landing effect (`landOnActive`/`landOnDocked`/`beginDeparting`/`beginDocking`) exactly as today — **except `landOnDocked` must stop calling `reRollMelodyPitches` itself**, since `stepRobotLifecycle` already computed the drifted melody; `landOnDocked` instead takes the already-drifted melody as a parameter and only handles position/`audioMode`/`AudioEngine.registerRobotMelody`. This keeps `tickRobotLifecycle`'s own observable behavior byte-for-byte identical (§5.2's parity requirement) while its arithmetic now lives in one place.

### 4.3 `buildLocale` stamping (`src/systems/worldTransition.ts`)

```typescript
function buildLocale(attenuationStyleId: string, coordinates: { x: number; y: number }): Locale {
  return {
    id: generateUUID(),
    attenuationStyleId,
    name: `Plot ${coordinates.x}, ${coordinates.y}`,
    coordinates,
    dayStartTimestamp: Date.now() - (Math.abs(coordinates.x % 24) / 24) * DAY_DURATION_MS,
    createdAtMeasure: getCurrentMeasure(),
    robots: [],
    actors: [],
    companies: [],
    currentMeasure: 0,
  };
}
```

Requires importing `getCurrentMeasure` from `../engine/beatClock` into `worldTransition.ts` (not currently imported there).

### 4.4 Why position/movement stays out (no code change required)

`idleSystem.ts:130`'s `robot.batteryLevel < BATTERY_LOWER_THIRD_THRESHOLD` check is the only coupling found between battery and movement, confirmed by direct search — one-way, read-only, purely a visual bias on wander-destination Y-range. It requires no "untying": `handleRobotIdle` isn't called by replay at all (§1.1), so this coupling simply never executes during a headless replay, exactly like every other `handleRobotIdle` call site. A `Docked` robot's own position (`generateSpawnPosition`, seeded by the same dock-cycle count as melody drift) also stays uncomputed by replay — only `landOnDocked`'s real, live call computes it, unchanged.

### 4.5 Audit pass (non-blocking, informational)

Trace `src/systems/audioSwells.ts` (LFO-driven parameter automation), `src/engine/lfoEngine.ts` (drift), and the ping-variance-automation mechanic (`docs/todo/roadmap.md` item referencing it) for any real-time/unseeded-random dependency, per `CLAUDE.md`'s existing no-`setInterval`-for-musical-timing guardrail. Record findings — safe vs. not, with the specific line/mechanism — as a new `docs/todo/backlog.md` entry. Does not block Plan/Task work on §4.1-4.2; can run in parallel or after.

---

## 5. Testing & Verification Requirements

### 5.1 Framework and location

Vitest, co-located `*.test.ts`, unchanged. `robotSystems.test.ts` already mocks `createSwimTimeline`/`handleRobotIdle`/`beatClock` for exactly the reason §1.1 describes (real GSAP/SVG side effects) — the new pure functions need no such mocking themselves, since they call none of those (including `generateSpawnPosition`, now also excluded from the pure path).

### 5.2 New/changed tests

- **`robotSystems.test.ts` — `stepRobotLifecycle`:** battery drains by `BATTERY_DRAIN_BASE` (+ job surcharge) for an `Active` robot, recharges by `BATTERY_RECHARGE_RATE` for a `Docked` one, floored/capped at 0/100; an `Active` robot at/under `BATTERY_CRITICAL_THRESHOLD` transitions to `Departing` with `dockingHoldUntilMeasure = measure + 1`, *unless* it's the only `Active` robot in the roster (invariant preserved, battery still floors at 0); a `Docked` robot at/over `BATTERY_FULL_THRESHOLD` transitions to `Docking`; a `Docking`/`Departing` robot whose hold measure has elapsed lands on `Active`/`Docked` respectively, `job` assigned via the same balancing rule `assignJob` uses today (capped at `JOB_MAX_ROBOTS_PER_TYPE` per type among other `Active` robots in the roster). **A `Departing`→`Docked` landing increments `dockCycleCount` by exactly 1 and drifts `melody` via the same `reRollMelodyPitches`/`DOCKED_PITCH_DRIFT_RATIO` rule `landOnDocked` uses live, seeded identically (same `getSeededVal(noiseMap, 'robot.pitchDrift', dockCycleCount * 100 + callIndex, 0, 1)` formula).** A landing transition never sets `position`/`audioMode` — regression guard for §1.1's scope boundary.
- **`robotSystems.test.ts` — `replayLifecycle`:** replaying 0 measures (or `toMeasure < fromMeasure + 1`) returns the roster unchanged; replaying N measures produces the same result as calling `stepRobotLifecycle` N times in a loop by hand (a direct unit check of the loop itself, independent of the realtime-parity test below); two robots that each dock exactly once during replay, at different measures, end up with *different* drifted melodies (regression guard that `dockCycleCount`/seed aren't accidentally shared/collided across robots).
- **`robotSystems.test.ts` — prove-it: replay matches realtime.** The load-bearing test: build a real 12-robot roster (matching `MAX_ROBOTS`) via the existing spawn helpers, run `tickRobotLifecycle` for N real measures (N large enough to exercise multiple full `Docked`→`Docking`→`Active`→`Departing` cycles for at least one robot, and to exercise the "never zero Active" invariant at least once — construct a battery/docking starting state that forces it, don't rely on chance), capture the resulting `docking`/`batteryLevel`/`dockingHoldUntilMeasure`/`job`/`melody` for every robot; separately, from the *same* starting snapshot (`dockCycleCount: 0` for every robot), call `replayLifecycle` for the same N measures; assert the two per-robot results are identical field-for-field, melody arrays included. This is the one test that proves the extraction in §4.2 didn't drift from the real tick/landing logic.
- **`robotSystems.test.ts` — `tickRobotLifecycle` parity (regression):** every existing test in this file must still pass unmodified — the refactor changes *how* the tick computes its result, not *what* it computes or which side effects fire when (same `createSwimTimeline`/`handleRobotIdle`/`AudioEngine.registerRobotMelody`/`generateSpawnPosition` calls, same arguments, same conditions, as today, including the exact same drifted-melody content landing on `AudioEngine.registerRobotMelody`).
- **`worldTransition.test.ts`:** `buildLocale`'s `createdAtMeasure` reads the mocked `getCurrentMeasure()` at construction time (this file already mocks `beatClock`, per its existing `vi.mock('../engine/beatClock', ...)` block — extend the mock's `getCurrentMeasure` return value across relevant cases rather than assuming the existing `0` stub is always right).

### 5.3 Success criteria

1. `stepRobotLifecycle`/`replayLifecycle` are pure: no `useLocaleStore`, no `getCurrentMeasure()` call internally, no AudioEngine/GSAP/`generateSpawnPosition`/`handleRobotIdle` call, verified by both a code-level check (no matching import) and the fact that calling them in a test file with none of those mocked still passes.
2. The prove-it test (§5.2) passes: N real ticks and one `replayLifecycle` call converge on identical `docking`/`batteryLevel`/`dockingHoldUntilMeasure`/`job`/`melody` for all 12 robots, including at least one "never zero Active" invariant trigger and at least one dock-triggered melody drift.
3. `tickRobotLifecycle`'s own existing test suite passes unmodified — the refactor is behavior-preserving for the real, live tick path.
4. `npm run build:types`, `npm run lint`, `npm test` (full suite), `npm run build` all clean.
5. No manual/live-browser check required for this phase (per intent doc's explicit constraint) — the prove-it test is the verification.

### 5.4 Verification order

`npm run build:types` → `npm run lint` → `npm test` → `npm run build`.

---

## 6. Documentation & Git/Workflow Context

- **Docs to update:** `docs/ROBOT_LIFECYCLE.md` — document `stepRobotLifecycle`/`replayLifecycle` and, prominently, exactly which fields replay does and doesn't reproduce (§1.1). `docs/todo/backlog.md` — the audit findings entry (§4.5). `docs/todo/roadmap.md` Phase 20.5 — mark done once shipped, following the citation style of other completed phases.
- **Branch:** new branch off `main` (or continues wherever Crawford wants it) — name left for the Plan phase, following the existing `feature/[phase-slug]` convention.
- **Commits:** one per task, tests with their code; attribution per this session's rules. **PR:** references this spec; reviewed by another contributor per `CLAUDE.md`.
- **Sequencing:** independent of Session Storage/the Session Autosave Removal work just shipped; touches only `robotSystems.ts`, `worldTransition.ts`, `types/locale.ts`, and docs — no overlap with any in-flight branch.

---

## 7. Open Questions & Risks

Four items need Crawford's explicit confirmation before Plan — two carried forward from the first draft, two new from bringing melody drift into scope.

1. **`Locale.currentMeasure` already exists and looks related, but isn't — it's dead/vestigial state.** Read directly: `types/locale.ts:22` declares it with no doc comment (unlike the well-documented `dayStartTimestamp` two lines above), `worldTransition.ts`'s `buildLocale` initializes it to `0`, and its only other reference in `src/` is `App.tsx:28-35` — a mount-only `useEffect` that reads `locale.currentMeasure` and writes that *exact same value* back via `setLocaleData`, purely to force a store-subscription re-render, not to track anything. **Nothing in `robotSystems.ts`/`beatClock.ts` ever increments it.** This spec proposes adding a *new*, distinctly-named `createdAtMeasure` field rather than touching or reusing `currentMeasure`. **Confirm this reading, or say `currentMeasure` should be cleaned up/repurposed as part of this phase instead.**
2. **`stepRobotLifecycle` requires a real, non-null `noiseMap`** — the live `landOnDocked` defensively falls back to `alea(...)` seeding when a locale has no noise map (an edge case that, per `getLocaleNoiseMap`'s own contract, may not be reachable in practice for an already-spawned locale). This spec proposes the pure function simply doesn't support that fallback — replay is only ever called against a real, already-spawned locale, which always has one. **Confirm this is an acceptable simplification, or say the alea fallback needs to be preserved in the pure path too** (would require threading `localeId`/`robotId` into the pure function purely for that fallback seed, adding surface area for a case this spec believes is unreachable).
3. **The prove-it test needs a contrived starting state to reliably exercise both the "never zero Active" invariant and at least one dock-triggered melody drift** — not left to chance. E.g., start 11 of 12 robots `Docked` with the 12th `Active` at low battery (forces the invariant), and at least one other robot `Docking`/`Departing` with a near-elapsed hold (forces a landing, and therefore a drift, within the test's measure window). Flagged so the eventual task's acceptance criteria are concrete about *how* both get exercised.
4. **`tickRobotLifecycle`'s live path has no per-robot field to read `dockCycleCount` from today** — only the module-global `dockCycleCounters` map, which this spec doesn't propose removing (still needed for the live path's own bookkeeping, since `Robot` itself doesn't carry this field and adding it there is a larger change — a new persisted field on every robot, not just the replay snapshot). §4.2 proposes `tickRobotLifecycle` reads the live count from `dockCycleCounters` (unchanged) when building its `RobotLifecycleSnapshot`, keeping the module map as the live path's own source of truth and the snapshot field as replay's equivalent. **Confirm this dual-bookkeeping (module map for live, snapshot field for replay) is acceptable, or say `dockCycleCount` should move onto `Robot` itself** (would let `tickRobotLifecycle` and replay share one exact mechanism, at the cost of a new field on every robot and a `Robot`-shape migration concern for already-spawned rosters — likely out of proportion to this phase's own scope).
5. **Risk:** `tickRobotLifecycle`'s refactor (§4.2) is the one place a subtle bug could silently break real gameplay while every new test still passes — mitigated by §5.2's explicit requirement that the *entire existing* `robotSystems.test.ts` suite passes unmodified, the same behavior-preservation bar Phase 31's `spawnSystem.ts` extraction was held to.
6. **Risk:** splitting `landOnDocked` so melody drift happens in `stepRobotLifecycle` but position/`audioMode`/`AudioEngine.registerRobotMelody` still happen in the live landing-effect function (§4.2) means `landOnDocked`'s signature changes (takes an already-drifted melody rather than computing it) — a larger diff to that function than a pure "extract and call" would be. Mitigated the same way as risk 5: full existing test-suite parity is the bar, not just the new tests passing.
