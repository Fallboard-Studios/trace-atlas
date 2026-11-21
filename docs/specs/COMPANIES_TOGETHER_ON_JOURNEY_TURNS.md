# Phase Spec: Companies Together — a company leaves as one, and comings and goings land on the journey's turns

> **Execution Commands**
>
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/engine/melodyJourney.test.ts src/systems/shiftPlan.test.ts src/systems/robotSystems.test.ts src/systems/lifecycleSim.test.ts src/systems/spawnSystem.test.ts src/systems/stationFadeSystem.test.ts src/systems/workLoop.integration.test.ts`
> - Sim reports: `LIFECYCLE_SIM_REPORT=1 npx vitest run src/systems/lifecycleSim.test.ts`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-20 from the confirmed intent
[docs/intent/companies-together-on-journey-turns.md](../intent/companies-together-on-journey-turns.md)
(`interview-me`, 2026-11-20, and Crawford's nine answers of the same day to its open items). Roadmap
[94](../todo/roadmap.md#94-companies-together-a-company-leaves-as-one-and-comings-and-goings-land-on-the-journeys-turns).
**Approved by Crawford on 2026-11-20** with no change, so §7.2's defaults stand except Q3, which still waits for his
yes. **Plan written the same day:**
[docs/tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md](../tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md), thirty tasks in
five phases, awaiting his approval. The plan departs from §1.8 and §2 in one way: the new step is built as a new
function beside `stepRobotLifecycle`, which stays until the removals task, so today's rows can be run at any point
before then (not only "first", as §3 and §5.3 word it).

**Built 2026-11-20** on `feature/companies-together` without Gate A or Gate B (Crawford away, at his word): see §8, "As
built".

**Where the facts come from.** Everything marked **(code)** was read on 2026-11-20 on `docs/companies-together-intent`,
which sat on `feature/journey-dynamics` (roadmap 93; both reached main on 2026-11-20 with PR #657). Numbers marked **(measured)** are from
[ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md) or the intent's scratch probe. Every new number in this spec is a **first
cut**: none is measured, and Gate A (§5.4) exists to measure them before anything is heard.

---

## 0. Scope check

One capability: when a robot comes and goes is decided by its group and its journey instead of by its own battery.
The plan of a shift, the battery that follows it, the pace that scales with tempo and the exit that is heard to end
together are faces of that one change. None can be judged alone: a planned exit with no shared ending still goes quiet
one robot at a time, and a shared ending needs the plan to know the exit ahead. So no capability map. The build is
staged and gated instead (§5.4): the numbers first, on a pure step and its sims, then the wiring and the ear.

---

## 1. Overview & Claude Explanation

### 1.1 Today (code)

- **The battery decides, robot by robot.** `stepRobotLifecycle` (`src/systems/robotSystems.ts`) drains an `Active`
  robot by `BATTERY_DRAIN_ACTIVE` (6) ÷ its `batterySize` each measure and recalls it at
  `BATTERY_CRITICAL_THRESHOLD` (10); it charges a `Docked` one by `BATTERY_RECHARGE_RATE` (5) ÷ size and undocks it
  at 100. Each hold is one measure (`dockingHoldUntilMeasure = measure + 1`). The step reads nothing but the roster
  and the measure.
- **Every robot has its own battery.** `spawnRobot` draws `batterySize` per robot at its spawn count
  (`generateBatterySize`, `src/systems/spawnSystem.ts`), company members included, and `spawnInitialRoster` starts
  roster indices 0 to n−1 `Active` (n = 2, 3 or 4, `'roster.activeCount'`) and the rest `Docked` on a per-robot draw
  (`'roster.dockedBattery'`). So a company's members have different cycle lengths (27 to 53 measures, **measured**)
  and different starts.
- **The last robot stays up.** A robot at or below critical is recalled only while another robot is `Active`, read
  on the step's working array in roster order.
- **Everything is counted in measures**, so the pace follows the tempo: a shift is 11 to 23 measures at any tempo,
  44 to 92 seconds at 60 BPM and 13 to 28 seconds at 200. The tempo slider runs 20 to 200 BPM (`SIM_LOOP_BPMS`'
  comment, `lifecycleSim.ts`); Classic worlds seed 40 to 100 (`src/data/bands/classic.ts`). 4/4 throughout
  (`BEATS_PER_MEASURE`).
- **A recalled robot is heard all the way home** (backlog 84). On `'recalled'` the work loop sends it home at once
  from a swim or a wait, or after its job or exit arc ends (`onLifecycleChange`, `src/systems/workLoop.ts`). At the
  port it is `'entering'` and holds, still playing; the station fade system (`src/systems/stationFadeSystem.ts`, a
  `'16n'` repeat) starts its volume ramp and entry arc so both end on the next bar line, at once with half a measure
  or more left (`STATION_FADE_MIN_STEPS`, 8 sixteenths) and after a hold otherwise. The trip from recall to silence
  runs up to about 22 seconds at 20, 110 and 200 BPM (**measured**: the loop sim's longest "Docked and visible" plus
  the one-measure hold).
- **The journey has turns** (`src/engine/melodyJourney.ts`). A journey is a seeded list of pairs keyed by
  `journeyKey(worldKey, scope)`; pair *i* ends on its **turning measure**, and `pairAt` keeps each key's turning
  measures in a private memo (`turnsByKeyAndTime`). Turns are at most `JOURNEY_TIME_MAX` (16) measures apart; a drop
  takes one. A company's members share `` `${worldKey}:${companyId}:journey` ``; since Journey Dynamics a freelancer
  travels on `` `${worldKey}:fleet:journey` ``. The engine reads the journey on the music clock's absolute measure
  (`positionAt(time).measure`, `melodyRegistry.ts`), the number `getCurrentMeasure()` hands the lifecycle tick.
- **Nothing in the lifecycle reads the journey or the tempo**, and nothing about docking or the battery is saved in
  a session or carried on a link (`src/types/session.ts`).
- **The battery is seen** in the roster tile and robot screen readouts and in the body's dimming
  (`computeBatteryDimOpacity`: tiers at 50, 25 and 12 %, `src/components/robot/robotVisualHelpers.ts`).

### 1.2 The shape of it

A **group** is a company, or one freelancer. Each group's moves are planned ahead on its journey's turns:

1. When a group comes out, its **exit turn** is drawn: a turning measure of its journey, far enough ahead for its
   pace, likelier the bigger the move that ends there.
2. When it has gone home, its **entrance turn** is drawn the same way.
3. The battery is a gauge that runs to empty at the exit and to full at the entrance.
4. Each member is recalled a fixed **lead** before the exit turn, swims home, waits at its station's port still
   playing, and fades out over the exit turn's own measure, so the company's sound ends on one bar line.
5. A group is recalled only while a robot outside it is `Active`; otherwise the whole group stays.

The step stays a pure function of the roster, the measure and now a small environment (the tempo and the world's
key). It reads the journey; it never writes it.

### 1.3 Groups

- A robot with a `companyId` belongs to that company's group. Any company counts, seeded or made by hand (§7.1 A1).
- A robot with no `companyId` is a group of one.
- **A group's journey is its company's, whatever each member's Journey setting says** (Crawford, 2026-11-20): the
  company key for a company, the fleet key for a freelancer. `Robot.journey` goes on deciding what a robot plays and
  nothing else.
- **A group's battery size** is the `batterySize` of its member earliest in the roster (the founder, for a seeded
  company). Every robot keeps drawing its own; only that one is read.
- **A group's draws** come from `` alea(`${worldKey}:${companyId}:shifts`) `` for a company and
  `` alea(`${worldKey}:${compositionSeed}:shifts`) `` for a freelancer, four draws a turn of the group's journey,
  taken whether used or not and memoised as the journey's shares are. So a decision about turn *i* is the same
  whenever it is asked, and two freelancers on the fleet's turns decide for themselves.

### 1.4 Reading the journey's turns

`melodyJourney.ts` gains one pure read, `journeyTurns(key, fromMeasure, toMeasure)`: the turning measures of `key`'s
journey in that range at `JOURNEY_TIME_MAX`, each with:

- `measure`: the turning measure;
- `index`: the pair's index, which the group's draws are read by;
- `move`: how far the pair travelled, `|share[i].intensity − share[i−1].intensity|`, from 0 to 2 (the first pair
  from home). It is read from the shares, which a group shares, never from one robot's scaled pairs;
- `drop`: whether the pair is a drop.

A **move's weight** is 1 for a drop, else `min(1, move)`: a move across half the journey's range or more weighs 1.

### 1.5 Pace: the numbers are for 60 BPM

Every length below is written in bars at `SHIFT_REFERENCE_BPM` (60, where a bar is 4 seconds) and multiplied by
`bpm ÷ 60` at the live tempo, then rounded (Crawford, 2026-11-20). A group's window for a phase:

| | Least | Most |
|---|---|---|
| Out | `max(SHIFT_MIN_BARS, round(SHIFT_OUT_BASE_BARS × size × bpm ÷ 60))` | `max(least + JOURNEY_TIME_MAX, round(SHIFT_OUT_MAX_BARS × bpm ÷ 60))` |
| Home | `max(SHIFT_MIN_BARS, round(SHIFT_HOME_BASE_BARS × size × bpm ÷ 60))` | `max(least + JOURNEY_TIME_MAX, round(SHIFT_HOME_MAX_BARS × bpm ÷ 60))` |

`SHIFT_OUT_BASE_BARS` 15 and `SHIFT_HOME_BASE_BARS` 20 are today's size-1 robot (15 measures out, 20 from recall to
`Active` again); `SHIFT_OUT_MAX_BARS` 40 and `SHIFT_HOME_MAX_BARS` 50 are Crawford's stuck limits; `SHIFT_MIN_BARS` 8
is his floor. The "most" is never less than 16 measures past the "least", so a window always holds a turn. For a
size-1 group:

| Tempo | A bar | Out, least to most | Home, least to most | Least out in seconds |
|---|---|---|---|---|
| 20 BPM | 12 s | 8 to 24 bars | 8 to 24 bars | 96 |
| 40 BPM | 6 s | 10 to 27 | 13 to 33 | 60 |
| 60 BPM | 4 s | 15 to 40 | 20 to 50 | 60 |
| 100 BPM | 2.4 s | 25 to 67 | 33 to 83 | 60 |
| 200 BPM | 1.2 s | 50 to 133 | 67 to 167 | 60 |

The wait for a turn inside the window is in bars and does not scale, so a fast world's shifts come out a little
shorter in seconds than a slow one's (§5.5 puts a number on it). At 20 BPM the floor and the window's width stretch
the shift, as agreed.

### 1.6 Planning an exit

Drawn on the tick a group's first member lands `Active` at measure `A`, for every member at once.

- **Candidates:** the group's turns `T` with `A + least ≤ T ≤ A + most`, in order.
- **The walk:** at each candidate the group leaves if its leave draw is under
  `SHIFT_LEAVE_ODDS_MIN + (SHIFT_LEAVE_ODDS_MAX − SHIFT_LEAVE_ODDS_MIN) × weight` (0.35 after the smallest move, 0.95
  after a big one, always after a drop). The last candidate is taken if none before it was.
- **Together or not:** at the chosen turn the exit is a **group exit** if the together draw is under
  `GROUP_EXIT_ODDS_MIN + (GROUP_EXIT_ODDS_MAX − GROUP_EXIT_ODDS_MIN) × weight` (0.5 after the smallest move, 0.95 at a
  weight of 1), and always after a drop. That is Crawford's "never worse than a coin flip, near certain after a big
  move". Because the walk also favours big moves, group exits should be well over half; the sim says how many.
- **A group exit:** every member's exit turn is `T`.
- **A drifting exit:** the members, in an order drawn on that turn, take the turns from `T` on, one each. The first
  leaves on `T`.
- A freelancer's exit is the same walk on the fleet's turns with its own draws; "together" does not apply.

A robot's **exit turn** is the measure it fades over: it is last heard on the turn's own bar, arriving, and its
sound ends on the bar line after (§7.2 Q1).

### 1.7 Planning an entrance

Drawn on the tick after which no member of the group is `Active` or `Recalled`, at measure `D`.

- **Candidates:** the group's turns `T` with `D + least ≤ T ≤ D + most` (the home window), in order.
- **The walk:** the group comes out on a candidate when its enter draw is under `SHIFT_ENTER_ODDS` (0.5); the last
  candidate is taken if none before it was. The size of the move is not read (the intent asks nothing of an
  entrance but a turn).
- **Together or staggered:** together when the together draw is under `ENTRANCE_TOGETHER_ODDS` (0.7). Otherwise the
  members, in a drawn order, land `ENTRANCE_STAGGER_BARS` (2, one chord change) apart from `T` on, so a company of
  four is all in within six bars (§7.2 Q2).
- A robot lands `Active` on its entrance measure and is heard from that bar.

### 1.8 The step

`stepRobotLifecycle(roster, measure, env)` keeps its shape: one pass over a working copy in roster order, pure, no
store, no clock. `env` is `{ bpm, worldKey }`. Per robot, with `lead = ceil(RECALL_LEAD_SECONDS ÷ the bar's seconds)`
(§1.11):

| Docking | When | Becomes |
|---|---|---|
| `Docked` | `measure ≥ entrance − 1` | `Undocking`, hold until its entrance |
| `Undocking` | `measure ≥ hold` | `Active`; if it is its group's first, the exit is drawn (§1.6) |
| `Active` | `measure ≥ exit turn − lead`, and a robot outside its group is `Active` | `Recalled`, hold until `exit turn + 1` |
| `Active` | the same, and none is | a stay (§1.9) |
| `Recalled` | `measure ≥ hold` | `Docked`; if it is its group's last, the entrance is drawn (§1.7) |

Then the battery moves (§1.10). The four docking states, `dockingHoldUntilMeasure`, the landing effects, the seam
and the order of a tick's store writes are as today; only when a transition fires changes. Each robot carries the
measure of its own next move (§4), so a transition reads the robot and nothing else. The step never reads
`activity`, `audioMode` or the Audio Load budget.

### 1.9 The stay: never silent, and the group whole

- A member reaching its recall measure while no robot outside its group is `Active` is not recalled. Every member of
  its group still `Active` loses its exit turn: the group **stays**, whole (Crawford, 2026-11-20).
- On a later tick, once a robot outside the group is `Active` (any robot: one freelancer is enough, §7.1 A2), the
  staying members all take the first turn `T` of their journey with `T − lead > measure`, together.
- So a roster with an `Active` robot before a tick has one after it, as today, and the fleet is never silent: a
  `Recalled` robot is still heard, and the last `Active` group is never recalled. Roster order decides ties as it
  does today: of two groups due in one measure with nobody else out, the earlier in the roster goes and the later
  stays.
- A stay may pass the "most out" limit. Never silent wins.

### 1.10 The battery is a gauge

Each measure, for a robot with a known next move, the level steps a straight line to its target:
`level += (target − level) ÷ (target measure − measure + 1)`.

| Robot | Target | At |
|---|---|---|
| Out (`Active` or `Recalled`) with an exit turn | `BATTERY_CRITICAL_THRESHOLD` (10) | the bar line after its exit turn |
| Home (`Docked` or `Undocking`) with an entrance | `BATTERY_FULL_THRESHOLD` (100) | its entrance |
| Staying, and after its stay until it docks | loses `BATTERY_EASE_SHARE` (⅛) of its level each measure | never reaches 0 |
| Home with no entrance yet (§1.14) | gains ⅛ of what is missing each measure | never reaches 100 |

So the battery falls on every measure a robot is out and rises on every measure it is home, lands on 10 as the
robot's sound ends and on 100 as it comes out, and never jumps or sits still. It moves through the two holds, where
today it pauses. The readouts, the dimming tiers and the store's 0 to 100 clamp are untouched. The drain and the
charge rate no longer exist as rates (§7.2 Q3).

### 1.11 Ending together: the lead, the door and the fade

- **The lead.** `RECALL_LEAD_SECONDS` is 24: the longest trip home on record (22 seconds, §1.1) and a little over. In
  bars it is 2 at 20 BPM, 6 at 60, 10 at 100 and 20 at 200. Every member of a group exit is recalled on the same
  measure, `exit turn − lead`. The lead is a constant turned into bars by the tempo, never a robot's own trip: no
  wall-clock swim time enters the docking state.
- **The trip.** Unchanged: the work loop sends each member home as it does today.
- **The door.** A member that reaches its port early waits there, `'entering'`, visible, at its regular volume,
  until the exit turn (Crawford, 2026-11-20: "gathering" is fine to see). Today's hold is under half a measure; this
  one can be several bars at a fast tempo.
- **The fade.** A `Recalled` robot's fade ends on the bar line of its `dockingHoldUntilMeasure`, the one after its
  exit turn. For a member already at its port the station fade system starts it on the exit turn's bar line, over
  the whole measure; for one that arrives during that bar with half a measure or more left, at once, over what is
  left. The members' ramps and arcs end on one bar line, where each becomes `'charging'` and the tick lands it on
  `Docked`.
- **A late member** (it reaches its port with under half a measure left, or after the bar line) is `Docked` by then
  and takes today's rule: the next bar line. Its sound ends a bar or more after its mates'. The loop sim counts
  these (§5.3).
- A soloed robot gets the arc and no fade, as today. A turn-back needs no new rule: an entrance is never less than
  `SHIFT_MIN_BARS` after an exit, so the only path is still the hidden tab.

### 1.12 A tempo change

The tick hands the live tempo in. A robot's next move is stored with the tempo it was last scaled at; when the two
differ, the bars still to go are multiplied by `new ÷ old`, and the move becomes the first turn of its group's
journey at or after that, never nearer than the lead allows. A robot already `Recalled` or `Undocking` keeps its
hold. Members with one move keep one move. So a tempo change sets the pace from that bar on, the seconds still to
go are kept, and nothing lurches (§7.1 A5). The gauge re-aims by itself.

### 1.13 The start of a world

`spawnInitialRoster` starts groups, not roster indices:

- each group starts out when its even draw (`'roster.groupStartsOut'`, at its earliest member's roster index) is
  under `SHIFT_START_OUT_ODDS` (0.45); if no group does, the one earliest in the roster does;
- a group starting out has every member `Active` at 100, its exit drawn as if it came out on the world's first
  measure;
- a group starting home has every member `Docked` at its own `'roster.dockedBattery'` draw, as today, and one
  entrance: the first turn at or after `round(u × SHIFT_HOME_MAX_BARS × bpm ÷ 60)` measures in, `u` its even draw at
  `'roster.groupFirstEntrance'`.

`'roster.activeCount'` and `INITIAL_ACTIVE_ROBOTS_MIN` / `MAX` are no longer read (§7.2 Q3). `lifecycleSim.ts`'s
`buildSimRoster` makes the same draws, with the membership `generateCompanyMembership` gives.

### 1.14 A robot out of step

Company edits happen while the world runs, and a hand-built test robot has no plan. One rule covers both: **a robot
with no next move takes its group's, and failing that the nearest turn.**

- `Active` with no exit turn, a mate with one it can still make: the mate's. No such mate: it is treated as staying
  (§1.9), so it takes the first turn the lead allows once a robot outside its group is `Active`.
- `Docked` with no entrance, a mate home with one: the mate's. Its group out: it waits, charging by the ease rule,
  and is given its entrance when the group's is drawn. Its whole group home with none: the entrance is drawn now.
- A robot moved to another group drops its next move unless it is `Recalled` or `Undocking`, and the rule above
  applies on the next tick.

### 1.15 What does not change

- The docking states, the holds' field, `landOnActive` / `landOnDocked`, the seam and its three calls.
- The work loop: sites, jobs, stations, the swim home, turn-backs. It reads `docking` as it does today.
- Audibility, Monitor Mode, the Audio Load budget, voice release and rebuild.
- The journey, the melody, company membership, the shared rhythm, every setting and every control.
- Sessions and links: nothing new is saved. A loaded world starts from §1.13.
- The pause: a suspended context stops the measure tick, so every plan stands still with it.
- The in-world day: wall clock, as CLAUDE.md's Melody Logic guardrail requires. Measures still count the fleet's
  lifecycle; the tempo now scales how many.

---

## 2. Target File Structure

```text
src/engine/
├── melodyJourney.ts              # + journeyTurns(key, from, to): measure, index, move, drop (§1.4). Reads the memo
│                                 #   pairAt keeps; draws nothing new.
└── melodyJourney.test.ts
src/systems/
├── shiftPlan.ts                  # NEW, pure (§1.3 to §1.7, §1.12): groupOf, the group's journey key and draws, the
│                                 #   windows at a tempo, planExit, planEntrance, rescale, recallLeadBars
├── shiftPlan.test.ts             # NEW
├── robotSystems.ts               # stepRobotLifecycle(roster, measure, env): §1.8 to §1.10, §1.14; the snapshot's new
│                                 #   fields; tickRobotLifecycle hands in bpm and the world's key and writes the new
│                                 #   fields; replayLifecycle takes env. DrainRule and activeDrain go (Q3).
├── robotSystems.test.ts
├── spawnSystem.ts                # spawnInitialRoster starts groups (§1.13)
├── spawnSystem.test.ts
├── stationFadeSystem.ts          # a Recalled robot's fade ends on its hold's bar line; it waits at the port (§1.11)
├── stationFadeSystem.test.ts
├── lifecycleSim.ts               # buildSimRoster with groups; the cover sim's new columns at five tempos; the loop
│                                 #   sim's late members and door waits (§5.3). The drain sim goes (Q3).
├── lifecycleSim.test.ts
└── workLoop.integration.test.ts  # a company recalled together, the door, one bar line
src/types/Robot.ts                # the robot's next-move fields (§4), live lifecycle state like docking
src/constants/index.ts            # §4's constants; the two rates and the two initial-Active bounds go (Q3)

docs/ROBOT_LIFECYCLE.md           # principle 3, the docking machine, Battery, Roster Creation, the sims
docs/MELODY_SYSTEM.md             # journeyTurns, and that the lifecycle reads the journey
docs/COMPANIES.md                 # a company comes and goes as one
docs/PROCEDURAL_GENERATION.md     # the two new dataIds, the retired one, the ':shifts' streams
docs/BEAT_CLOCK.md                # only if the fade's bar-line arithmetic adds a reader
CLAUDE.md                         # the ROBOT_LIFECYCLE.md line under Reference docs
docs/todo/roadmap.md, plan.md     # entry 94; archive after the merge
docs/specs/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md   # an "As built" section
docs/tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md   # the plan, from TASK_TEMPLATE.md, once this is approved
```

`workLoop.ts`, `robotAudibility.ts`, `audioBudgetSystem.ts`, `AudioEngine.ts`, `melodyDevelopment.ts`,
`melodyRegistry.ts`, the company store, every component and every content file are untouched. If the help copy for
the battery (`src/content/copy/probe.ts`) reads wrongly once the battery is a gauge, changing it is a copy task with
no test.

---

## 3. Implementation Boundaries & Constraints

**Always**

- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). A task with no
  behaviour (docs, a deletion) gets no test and names its proof.
- The docking machine stays measure-quantized on BeatClock and pure: `stepRobotLifecycle` imports no store, no
  clock, no GSAP and no Tone. `shiftPlan.ts` and `journeyTurns` are pure.
- Every new piece of state is plain JSON on the robot. Nothing is saved, linked or shown.
- The live tick and `replayLifecycle` produce the same roster field for field, new fields included, at one tempo.
- Run today's sim rows before the step changes: they cannot be measured afterwards (§5.3).
- A pinned sim row is re-pinned in the commit that moves it, and the commit says so.
- Focused tests per task; the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**

- Any change to `melodyJourney.ts` beyond the one read, or to how a journey is drawn.
- Reading `activity`, a position or a swim time in the docking machine.
- A group or plan record in the store beside the robots (this spec keeps the state on the robot, §4).
- Any new control, readout or content string.
- Deleting the drain machinery before Q3 is answered.

**Never**

- `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask` for any of this timing.
- A wall clock in the docking cycle (turned down by Crawford, 2026-11-20).
- Audio scheduling from a GSAP callback; the fade stays the fade system's, a transport callback.
- A write to `audioMode`, to a robot's Journey setting or to a company from the lifecycle.
- A file-text test, a docs guard or a source scan.
- A "keep the existing sound" clause in any doc (pre-v1 rule).

---

## 4. Code Style & Architecture Conventions

The state, as it would read in `src/types/Robot.ts` (names provisional; the plan pins them):

```typescript
/** The measure this robot next lands Active on: its group's entrance turn, or a staggered bar after it (spec §1.7).
 *  Set while it is home. Live lifecycle state like `docking`: replayed, never saved, linked or shown. */
entersAtMeasure?: number;
/** The turning measure this robot fades over (spec §1.6); its sound ends on the bar line after. Set while it is
 *  out. Absent on an Active robot: it is staying (spec §1.9). */
exitsAtMeasure?: number;
/** The tempo the two measures above were last scaled at (spec §1.12). */
shiftBpm?: number;
```

The same three join `RobotLifecycleSnapshot`, with what the step needs to find a group: `companyId` and
`compositionSeed`. The environment and the reads, as they would look in `shiftPlan.ts`:

```typescript
/** What a lifecycle step is told about the world (spec §1.8). */
export interface ShiftEnv {
  bpm: number;
  /** worldKeyOf(coordinates): the key the journeys are drawn from. */
  worldKey: string;
}

/** A length written for SHIFT_REFERENCE_BPM, in bars at `bpm` (spec §1.5). */
export function paceBars(barsAtReference: number, bpm: number): number {
  return Math.round((barsAtReference * bpm) / SHIFT_REFERENCE_BPM);
}

/** How many measures before its exit turn a robot is recalled (spec §1.11). */
export function recallLeadBars(bpm: number): number {
  return Math.ceil(RECALL_LEAD_SECONDS / ((BEATS_PER_MEASURE * 60) / bpm));
}
```

The constants, beside the battery's in `src/constants/index.ts`, every value a first cut for Gate A:

```typescript
export const SHIFT_REFERENCE_BPM = 60;
export const SHIFT_OUT_BASE_BARS = 15;
export const SHIFT_HOME_BASE_BARS = 20;
export const SHIFT_OUT_MAX_BARS = 40;   // Crawford, 2026-11-20
export const SHIFT_HOME_MAX_BARS = 50;  // Crawford, 2026-11-20
export const SHIFT_MIN_BARS = 8;        // Crawford, 2026-11-20
export const SHIFT_LEAVE_ODDS_MIN = 0.35;
export const SHIFT_LEAVE_ODDS_MAX = 0.95;
export const GROUP_EXIT_ODDS_MIN = 0.5; // "never worse than a coin flip"
export const GROUP_EXIT_ODDS_MAX = 0.95;
export const SHIFT_ENTER_ODDS = 0.5;
export const ENTRANCE_TOGETHER_ODDS = 0.7;
export const ENTRANCE_STAGGER_BARS = 2;
export const RECALL_LEAD_SECONDS = 24;
export const BATTERY_EASE_SHARE = 0.125;
export const SHIFT_START_OUT_ODDS = 0.45;
```

- Names follow the neighbours': `journeyTurns` beside `journeyShares`; `shiftPlan.ts` beside `siteChoice.ts`, pure
  with its own test file; the `SHIFT_*` constants beside `BATTERY_*`.
- The group's draws follow the journey's pattern: a fixed number of draws per turn, taken whether used or not,
  memoised per key, so a decision does not depend on what was asked first.
- Roster draws go through `getUniformSeededVal` (the even draw), never the plain one.
- The step stays one function over a working array in roster order; group work (a draw for every member) happens
  inside that pass, on the tick the first or last member lands.
- Each new function's doc comment names the spec section it implements.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest)

**`melodyJourney.test.ts`** — `journeyTurns` returns the measures `journeyAt` turns on, in order, for a range
that starts and ends mid-pair; `move` is the shares' distance, the first pair's from home; a drop is flagged and
its turn is one measure after the turn before; the same key gives the same turns whichever range is asked first; a
range with no turn is empty. Mutants: the move read from a robot's scaled pairs; the pair before a drop flagged.

**`shiftPlan.test.ts`** — the windows at 20, 40, 60, 100 and 200 BPM for sizes 0.67, 1 and 1.5 (§1.5's table, the
floor and the 16-measure width); a window always holds a candidate; the exit walk takes the first candidate whose
draw is under its odds and the last when none is; a drop always leaves and always leaves together; a group exit
gives every member one turn and a drifting one gives successive turns in the drawn order; the entrance walk and its
stagger of 2 bars; a freelancer reads the fleet's turns with its own draws; a member on Own or Fleet still reads its
company's turns; `recallLeadBars` at the five tempos; the rescale keeps one move for members that had one and never
lands nearer than the lead. Mutants: the weight ignored; the window's width dropped; the group's size read from a
later member; the draws keyed on the journey alone.

**`robotSystems.test.ts`** — each row of §1.8's table, on hand-built rosters; the exit drawn once, on the first
member's landing, for a staggered company; the entrance drawn when the last member docks, not the first; the stay
(a lone group is not recalled, every member loses its exit turn, relief the same tick from earlier in the roster and
the next tick from later, all leave together on the first turn the lead allows; two groups due together with no
third; a group beside only a `Recalled` robot stays); the gauge (10 on the bar line after the exit turn, 100 on the
entrance, strictly falling while out and through `Recalled`, strictly rising while home and through `Undocking`, the
ease in a stay never reaching 0); §1.14's cases; the tick writing the new fields and firing the landing effects
where a transition happened; the seam still the tick's only route to visuals. **The prove-it:** a real 12-robot
roster with two companies run for N real ticks and replayed once, identical field for field, through a group exit,
a drifting exit, a stay and its relief. Mutants: the recall without the outside-`Active` check; the stay holding
one robot; the gauge aimed at the exit turn itself; the hold left at one measure.

**`spawnSystem.test.ts`** — a starting-out group is whole and at 100; a starting-home group shares one entrance;
at least one group starts out in every grid world; the two draws are even over 3,000 worlds; the sim roster matches
the real spawn. Mutants: the start by roster index; the plain draw.

**`stationFadeSystem.test.ts`** — a `Recalled` robot `'entering'` with its hold two or more bars ahead gets
nothing; on the bar line of its last bar it gets the fade and the arc over the whole measure; arriving in that bar
with 8 or more sixteenths left it gets both over what is left; with fewer, nothing until it is `Docked`, then
today's rule; a `Docked` robot keeps today's rule at every step; a Solo gets the arc only. Mutants: the hold
ignored (today's code); the fade started a bar early.

**`workLoop.integration.test.ts`** — the real tick into the real loop and the real fade system at 60 and 200 BPM:
a company of three recalled on one measure from a swim, a job and a wait; each reaches its port and waits; all
three become `'charging'` on one bar line; the turn-back cases still pass.

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm run build`, `npm test` green at each checkpoint.

### 5.3 Runs (the proof; not tests)

Over the 121-coordinate grid, 2,000 measures a world, at 20, 40, 60, 100 and 200 BPM. **Today's rows are run
first, on today's step, and written into the plan's Results.**

- **Cover sim**, per tempo: silent measures; robots sounding (mean, p10 to p90); **apart share** (of the measures a
  company has any member sounding, the share where not all its members are); **group exits** (company exits where
  every member docks on one measure, over all company exits); **on a turn** (exits and first entrances that land on
  a turn of the group's journey); time out and time home in bars and in seconds (median, p90, longest); stays per
  1,000 measures and their lengths; each robot's heard share.
- **Loop sim** at 20, 110 and 200 BPM on the built step: late members per exit; the wait at the door in seconds
  (median, p90, longest); turn-backs; robots charging while visible.
- **In the browser**, `?debug` on: a company's exit watched end to end, the roster tiles' batteries reading 10 as
  the bodies go in, and a tempo drag from 60 to 200 and back with no robot changing state on the drag.

### 5.4 Gates (stop)

- **Gate A, the numbers.** After the pure step and the sims, before any wiring. Crawford reads §5.3's cover table
  beside today's rows and keeps or moves §4's constants. Nothing is heard yet.
- **Gate B, his eye and ear.** On the wired build, three worlds: one with three companies ((−200, 80) has three of
  three), one at 40 BPM, one at 160 BPM or more. He judges: does a company read as a group; do exits feel placed;
  the last bar (Q1); the gathering at the door and whether it runs too long at a fast tempo; a staggered entrance
  (Q2); the battery readouts through a shift, a stay and a tempo change. What he moves is recorded in "As built".

### 5.5 Success criteria

First cuts; Gate A may move any of them.

- No silent measure in any grid world at any of the five tempos (a test, always on, at 2,000 measures).
- Every planned exit turn and every group's entrance turn is a turning measure of the group's journey (a test).
- Apart share at or under 20 % at every tempo, against today's row.
- Group exits at or over 75 % of company exits.
- The median time out in seconds at 40, 100 and 200 BPM within a third of 60 BPM's; 20 BPM reported, not held to it.
- No time out past its "most" except in a stay; no time home past its "most".
- Robots sounding: a mean from 4.5 to 6 at every tempo. Outside it is a stop and report, not a failure.
- Late members under 5 % of company-member exits at each loop-sim tempo.
- A battery never moves the wrong way and never repeats a value while a robot is out or home (a test).
- Live tick and replay identical (the prove-it).
- Gate B passed, its answers recorded; the docs of §2 updated; roadmap 94 archived after the merge.

---

## 6. Git & Workflow Context

- This spec, the intent, the plan and roadmap 94 merged on 2026-11-20 (PR #657) from `docs/companies-together-intent`.
  That branch was cut from `feature/journey-dynamics`, so roadmap 93 reached main with them.
- The build branch is `feature/companies-together`, from `main`.
- The plan goes to `docs/tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md` from `docs/tasks/TASK_TEMPLATE.md`, after
  Crawford approves this spec. Suggested order: today's rows; `journeyTurns`; `shiftPlan.ts`; the step and its
  prove-it; the sims and Gate A; the tick, the spawn and the fade system; Gate B; the docs.
- One commit per task, message in the repo's voice, ending with the session's attribution line. Crawford opens and
  merges the PR.

---

## 7. Assumptions and Open Questions

### 7.1 Assumptions (what this spec filled in; each is Claude's, not Crawford's)

- **A1. Any company is a group**, one made by hand in the session included. The intent says "a company" and names
  no exception.
- **A2. Any robot outside the group relieves a stay**, a single freelancer included. "Until someone else arrives"
  named nobody in particular.
- **A3. The mechanism is the plan, not the armed battery.** "The battery paces itself" needs the exit known ahead,
  so the exit is drawn at the entrance and the battery follows it. The step keeps state (it is not a function of the
  measure alone) so that a tempo change bends the pace from that bar on instead of re-reading the whole session.
- **A4. Big moves are favoured twice:** in the walk that picks the exit turn and in the chance that the exit is
  together. Crawford asked for the second. The first is what makes exits "feel placed" and group exits the norm; if
  the sim shows the second alone is enough, the walk's odds become flat.
- **A5. A tempo change keeps the seconds still to go** and snaps to the next turn. The alternative, letting plans
  stand in bars, leaves a group planned at 200 BPM out for many minutes after a drop to 20.
- **A6. The lead is one constant for every robot.** Robots near their station wait at the door for most of it. A
  lead per robot, from its own distance, would shorten the wait and is left out: it puts wall-clock times into when
  a robot sets off, and Crawford has said the gathering is fine. Gate B looks at it.
- **A7. The replay reads one tempo for the whole span**, as the journey's settings are read as if they had always
  held. Nothing calls `replayLifecycle` in the app today.
- **A8. The cover sim stays docking-only** (backlog 84's A6): it counts `Active` and `Recalled` as sounding, which
  now covers the whole trip home, so it no longer under-counts by much.
- **A9. The fade system reads `docking` and the hold.** It is a transport callback that already reads the robots;
  the docking machine still reads nothing visual.
- **A10. No phone or perf gate.** The step does a little more work once a measure and nothing per frame; the turns
  are memoised.
- **A11. The battery's ease share, the start odds and the entrance odds** are numbers nobody asked for. They are in
  §4 with the rest for Gate A.

### 7.2 Open questions

- **Q1. The last bar.** As written, a company is last heard on the turn's own bar, fading through the bar it
  arrives on. The other reading fades through the bar before, so the sound ends exactly as the turn comes and the
  arrival is never heard. Default: the turn's own bar; Gate B hears it.
- **Q2. A staggered entrance's spacing.** As written, members come in one chord change (2 bars) apart, so the
  company is whole within six bars. The other reading puts each on a later turn, about eight bars apart, which
  leaves the first member alone for longer. Default: 2 bars.
- **Q3. The drain machinery goes?** With a gauge, these are read by nothing: `BATTERY_DRAIN_ACTIVE`,
  `BATTERY_RECHARGE_RATE`, `DrainRule`, `activeDrain`, the drain sim (`runDrainSim`, `DRAIN_CANDIDATES`, `flatDrain`,
  `formatDrainReport`) with its pinned rows, `'roster.activeCount'` and `INITIAL_ACTIVE_ROBOTS_MIN` / `MAX`. Proposed:
  delete them in a task of their own. Not done without Crawford's word.
- **Q4. The success numbers.** 20 % apart, 75 % group exits, a third on the seconds, 5 % late. Are those the right
  bars to hold the sim to, or does he want to see today's rows first and set them at Gate A?
- **Q5. `Robot.batterySize` on a company's other members** is drawn and never read. Keep drawing it (the default:
  no spawn change, and a robot made freelance later has one), or draw it for the founder alone?
- **Q6. CLAUDE.md.** Its ROBOT_LIFECYCLE.md line describes "a seeded battery size that divides drain and recharge,
  the stay-up rule that keeps the last Active robot out". This spec rewrites that line in the docs task. Confirming,
  because the file's guardrails are his.

---

## 8. As built

Built 2026-11-20 on `feature/companies-together`, Tasks 1 to 26 and 28 to 29 of
[the plan](../tasks/COMPANIES_TOGETHER_ON_JOURNEY_TURNS.md), at Crawford's word to build the whole plan without
pausing while he was away. The plan's Results holds every measured number.

### 8.1 What the gates moved

**Nothing.** Gate A and Gate B were not held: he was away. Every constant of §4 ships at its first cut, with the value
§4 gives: `SHIFT_REFERENCE_BPM` 60, `SHIFT_OUT_BASE_BARS` 15, `SHIFT_HOME_BASE_BARS` 20, `SHIFT_OUT_MAX_BARS` 40,
`SHIFT_HOME_MAX_BARS` 50, `SHIFT_MIN_BARS` 8, `RECALL_LEAD_SECONDS` 24, `SHIFT_LEAVE_ODDS_MIN` / `MAX` 0.35 / 0.95,
`GROUP_EXIT_ODDS_MIN` / `MAX` 0.5 / 0.95, `SHIFT_ENTER_ODDS` 0.5, `ENTRANCE_TOGETHER_ODDS` 0.7,
`ENTRANCE_STAGGER_BARS` 2, `BATTERY_EASE_SHARE` 0.125, `SHIFT_START_OUT_ODDS` 0.45. The questions of §7.2 stand at
their defaults; Q3 (the removals) and Q6 (CLAUDE.md, §8.4) wait for his yes.

### 8.2 §5.5, criterion by criterion

| Criterion | As measured |
|---|---|
| No silent measure, any grid world, any of five tempos | Met (always-on test at 60 BPM over the grid; six worlds at the others; the report at all five). |
| Every exit turn and group entrance on a turn | Met: 100 % at all five tempos (always-on test). |
| Apart share at or under 20 % | **Missed at 20 BPM (25.1 %) and 40 BPM (20.4 %)**; met at 60, 100, 200 (15.9, 11.2, 6.3 %). Today 91.9 %. |
| Group exits at or over 75 % | Met: 82.2–85.4 %. Today 4.2 %. |
| Median time out within a third of 60 BPM's at 40, 100, 200 | Met: 114, 89 and 76 s against 100 s. 20 BPM: 180 s. |
| No time out past its most but in a stay; no time home past its most | Home met. Out not separable from the report's row (it holds drift and stays); its p90 is over the most only at 20 BPM. |
| Robots sounding, a mean of 4.5 to 6 | Met: 5.29–5.85. |
| Late members under 5 % | Met: 0 of 1,320 / 2,812 / 3,124 member exits at 20 / 110 / 200 BPM. |
| A battery never moves the wrong way or repeats | Met (a test over 600 measures at three tempos). |
| Live tick and replay identical | Met (the prove-it, through a stay, its relief, a group exit and a drifting exit). |
| Gate B passed; docs updated; archived after the merge | Gate B not held; docs updated (Tasks 28, 29); the archive waits for the merge. |

### 8.3 Where the build departed from this spec

- **New beside old** (the plan's architecture decision): the step is a new function, `stepShiftLifecycle(roster,
  measure, env)`, with its own snapshot type `ShiftLifecycleSnapshot`; `stepRobotLifecycle`, `DrainRule`,
  `activeDrain`, the drain sim and `buildSimRoster`'s roster-index start stay, read by the sims' "today" rows only,
  until the removals (Q3). `ShiftEnv` lives in `shiftPlan.ts`. `replayLifecycle` takes the shift step's `env` in
  place of a drain rule.
- **The recall is decided per group, not robot by robot:** the first member due is recalled with every other member
  due on that measure, in one pass, so two interleaved groups due together with no third out are never split (the
  earlier goes whole, the later stays whole). §1.8's row reads robot by robot; §1.9 asks for the group whole.
- **"Has stayed until it docks"** (§1.10) is read as "out and at or under 10": the state has no flag for a past stay.
- **A robot moved to another group** (§1.14) has no group record to compare against, so two tests stand in for it: a
  `Docked` robot's entrance is dropped while a mate is out and it carries no exit (a staggered member always carries
  the group's), and an `Active` robot's exit turn is dropped when no mate shares it, it is no turn of the group's
  journey, and a mate is out on one of its own. An exit that happens to fall on a turn of the new group's journey is
  kept.
- **The rescale's least:** an exit is never nearer than the lead + 1 and an entrance never nearer than 2, so nothing
  changes docking on the tick of a tempo change (§1.12 says "never nearer than the lead allows").
- **The start's first entrance** is never under 1 measure in (`max(1, round(u × …))`).
- **The tempo at spawn** is handed to `spawnInitialRoster` by `initializeLocale` (`{ bpm }`), not read in
  `spawnSystem.ts`, which gains no import of the audio store.
- **The group's draws** are used in the order leave (or enter), together, order, and one spare.
- **The roster start's tests** are in a new `spawnSystem.rosterStart.test.ts` (the old file mocks the seeded draws
  module-wide); `runLoopSim` gained a `door` option and `runReadinessSim` a `step` option, for Task 19's run.
- **The integration harness** cannot time an entry arc started late in a run (GSAP's global timeline is paused and
  stepped by hand, and such an arc completes on its first frame), so Task 25's case reads the bar line from the fade
  the engine is handed.

From the review of 2026-11-21 (the plan's Results), each fix at Crawford's word:

- **A tempo change scales an aim** (§1.12, §4): each move carries an unsnapped aim after a change (`entersAim`,
  `exitsAim` on the robot, live state like the moves); `rescaleAim` scales it by new ÷ old, keeping the seconds to go
  exactly, and the move is the turn at or after it (`turnAtOrAfter`). §1.12's "the bars still to go, rounded, then
  the first turn" scaled the snapped turn, so every tick of a slider drag snapped forward again: an exit 20 bars off
  sat at about 115 after a drag from 60 to 200 BPM and back. `rescaleMove` stays, as one change's composition.
- **A whole-roster company** (§1.9): when one company holds every robot, the step groups each member alone, so the
  last `Active` robot stays and each member's entrance is drawn when it docks (Crawford: "last robot stays"). §1.9's
  "the last `Active` group is never recalled" held such a company out for ever.
- **A big company's stagger** (§1.7): `ENTRANCE_STAGGER_BARS` narrows to `floor(out least ÷ (members − 1))` bars
  (together at 0), so the last member is out by the out window's least. And the entrance (§1.8, §1.14) waits until
  every member is `Docked`: a member still `Undocking` keeps the group's exit and goes in on it. A company of five or
  more at a slow tempo otherwise split for a whole shift (one of eight at 20 BPM: apart for runs of 41–79 measures).
  Spawn's companies of three and four never reach either rule, so the sims' rows are unchanged (re-run 2026-11-21).
- **A locale with no coordinates** is not handled: `Locale.coordinates` is required and nothing makes one without,
  so the tick's fallback to (0, 0) and the Task 21 criterion that asked for it went.

### 8.4 Waiting for Crawford

- **Gate A**: the numbers in the plan's Results, with three things to weigh: the apart share at 20 and 40 BPM, the
  stays, and the wait at the door (a median of 16–18 s).
- **Gate B**: the listening list in the plan's Results.
- **Q3, the removals** (the plan's Task 27): not done.
- **Q6, CLAUDE.md's ROBOT_LIFECYCLE.md line.** Not changed. The proposed wording, for his yes:

  > - `docs/ROBOT_LIFECYCLE.md`: The two robot state machines — docking (on the measure tick: the fixed 12-robot
  >   roster started by groups, each company or freelancer coming and going on its journey's turns by a plan drawn
  >   ahead at a pace scaled by the tempo, a company recalled together and ending on one bar line, the battery a gauge
  >   that follows the plan, the last group out staying whole, the transition hold, replay) and activity (the work loop
  >   on wall-clock time: work sites, charging stations, recall, the wait at the port and turn-back), and what a
  >   power-off pause freezes (the measures and the loop's clock) and leaves running (the day).
