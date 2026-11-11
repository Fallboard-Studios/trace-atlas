# Phase Spec: No Silence and Company Families — the last robot stays up, every battery its own size, a company is a family

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/systems/robotSystems.test.ts src/systems/lifecycleSim.test.ts src/systems/spawnSystem.test.ts src/stores/localeStore.test.ts src/systems/workLoop.integration.test.ts`
> - The sim reports: the same `lifecycleSim.test.ts` run with `LIFECYCLE_SIM_REPORT=1` set (PowerShell:
>   `$env:LIFECYCLE_SIM_REPORT = '1'; npx vitest run src/systems/lifecycleSim.test.ts`)
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`

**Status:** spec written 2026-11-10 from the confirmed intent
[docs/intent/no-silence-and-company-families.md](../intent/no-silence-and-company-families.md) (`idea-refine`,
2026-11-10). Crawford asked for the plan the same day, with the assumptions of §7.1 standing at their defaults and
open questions A1–A5 unanswered. Plan, Part A only:
[docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md](../tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md) (2026-11-10, seventeen
tasks in five phases). **Part A built and heard on 2026-11-11** (§8, As built): Gate A answered
(0.67–1.5), Gate B passed. **Part B
specified 2026-11-11** from Crawford's answers to B1–B11 (§7.3), early at his request, and planned in
[docs/tasks/COMPANY_FAMILIES.md](../tasks/COMPANY_FAMILIES.md); it is built only after Gate B (§0). **Part B's rhythm
revised 2026-11-11** after its Phase 1 was built (B16–B19, §7.6): a rhythm is the world's and the rhythm settings',
not a robot's, so the same settings in one world play the same rhythm; the moved onsets are cut. Backlog
[60](../todo/backlog.md#60-audio-cover-the-silence-when-every-active-robot-is-charging), first item of
[plan.md](../todo/plan.md)'s Stage 3.

**Where the numbers come from.** Three sources, marked where it matters:

- **(code)** read in the repo while writing this spec.
- **(arithmetic)** one robot's cycle worked through a hand copy of `stepRobotLifecycle`'s arithmetic in this session.
  Not repo code; the cover sim's cycle-length column (§1.5) replaces it.
- **(probe)** the intent's fleet numbers, from scratch probes in the idea-refine session. Not repo code. The cover sim
  re-measures every one of them before it is written into a doc, and where a re-measured number differs, the
  re-measured number is the record.

---

## 0. Scope check

The intent bundles two capabilities that ship and are verified apart, and it fixed their order (Crawford, 2026-11-10).

| Module id | Responsibility | Depends on |
|---|---|---|
| `no-silence` | Stage 1, backlog 60. The last Active robot stays up until another arrives; every robot draws one seeded battery size; the battery goes fractional; a sim shows no silent measure. Part A: §1.1–§1.8. | — |
| `company-families` | Stage 2, backlog 73. A seeded company is a founder plus inheritors that share its voice, onset pattern and sends; each keeps its own battery size and start (B2). Part B: §1.9–§1.11. | `no-silence`: the stay-up rule, so a company's lifecycles drifting together can never silence the fleet |

Build order: `no-silence` → Crawford listens (Gate B, §5.5) → `company-families`.

The intent gives each stage its own spec and has Stage 2's written after Stage 1 has been heard. Crawford asked for one
spec file, so this is it, in two parts, and the gate is kept for the build: Part B was to be completed after the
listen, but on 2026-11-11 Crawford answered its questions (§7.3) at Checkpoint B and asked for it to be specified
and planned overnight. It is completed in place (§1.9–§1.11, §5.7, §7.4–§7.5) and approved on its own; nothing in
it is built until Gate B passes.

---

## 1. Overview & Claude Explanation

### Part A — `no-silence` (Stage 1)

### 1.1 Today

`stepRobotLifecycle` (`src/systems/robotSystems.ts`) is the one place battery and docking are computed. The live tick
(`tickRobotLifecycle`) and the headless `replayLifecycle` both run it. Each robot decides alone (code):

- Active: the battery drops by `BATTERY_DRAIN_ACTIVE` (6) a measure, and at or below `BATTERY_CRITICAL_THRESHOLD`
  (10) the robot is Recalled.
- Docked: it rises by `BATTERY_RECHARGE_RATE` (5) a measure, and at `BATTERY_FULL_THRESHOLD` (100) the robot starts
  Undocking.
- Recalled and Undocking each last one measure (`dockingHoldUntilMeasure`, the transition hold).

So every robot's cycle is exactly 35 measures: 15 Active, 1 Recalled, 18 Docked, 1 Undocking (arithmetic). The fleet's
on/off pattern is set at spawn and repeats every 35 measures.

- 79 of the 121 sim worlds go silent at the same point of every cycle: for one measure in 48 of them, two in 19, three
  to eight in 12. The other 42 never do (probe).
- The hole sits just before the 2–4 robots that started Active come back. The docked robots' start batteries are one
  plain `getSeededVal` sample each (`roster.dockedBattery`, code), which bunches in the middle (p10 17, p90 80, probe),
  so no docked robot starts low enough to cover the end of the first shift.
- A guard against this existed: `beb6abc0` (2026-08-26) kept the last Active robot up, and `b27c8e9d` (2026-10-12)
  removed it on Crawford's "a little silence is good for the ear". The intent reverses that call: never silent.

Three terms, used the same way from here on:

- **Sounding:** a robot whose docking is Active or Recalled. The dock mutes a robot only once it is Docked, so a
  Recalled robot is heard for its one-measure hold. (Since 2026-11-11 the dock's mute is the docking state itself,
  `isDockMuted`, not an `audioMode` write; see the plan's Task 10a.)
- **Silent measure:** a tick after which no robot is sounding.
- **Stay:** the run of measures a robot spends Active at or below critical because no other robot is Active. The
  intent calls this a hold. This spec keeps "hold" for the one-measure transition hold.

### 1.2 The last robot stays up

In `stepRobotLifecycle`, an Active robot whose battery is at or below critical after its drain is recalled only if
another robot in the working roster is Active at that moment:

```typescript
working.some((r) => r.id !== robot.id && r.docking === DockingState.Active)
```

This is the removed guard's condition as `b27c8e9d` deleted it.

- **Otherwise it stays Active.** Its battery keeps draining every measure and floors at 0 (the existing
  `Math.max(0, …)`). The check runs again every measure.
- **It is recalled on the first measure the check finds another Active robot.** The step mutates its working array in
  roster order, so that is the same measure when the robot landing on Active sits earlier in the roster, and the next
  measure when it sits later.
- **Two robots crossing critical in one tick, with no third Active:** the earlier in roster order is recalled (the
  later is still Active when the earlier is checked) and the later stays.
- **Only Active counts.** A Recalled or Undocking robot does not relieve the last one.
- **The rule reads `docking` and nothing else.** Not `audioMode`, not the sounding set, not volume. A listener who
  mutes the last robot gets the silence they asked for.

**What this guarantees.** A roster with at least one Active robot before a tick has at least one after it: the last
Active robot checked in a tick can leave only while another is still Active. Every roster starts with 2–4 Active robots
(`INITIAL_ACTIVE_ROBOTS_MIN`), so there is never a silent measure. This follows from the rule, not from sampling; the
sim (§1.5) confirms it and measures what it costs.

**What else moves: nothing in the live path.**

- `tickRobotLifecycle` compares each robot's docking before and after the step. A staying robot's docking does not
  change, so no seam call fires and no landing effect runs. Its battery write goes through like any Active robot's.
- The work loop reads `docking` at every decision, so a staying robot keeps choosing sites and working.
- The Audio Load Budget is untouched. Its cap never drops below two sounding robots (`LOAD_AUDIBLE_ROBOTS_MIN`), and
  docked robots are muted and outside the set, so a lone Active robot is inside the cap. The one exception is a
  listener who has soloed docked robots, and then those robots are the ones sounding.

### 1.3 Battery size

One seeded number per robot, drawn at spawn, that divides both its drain and its charge. A big battery means long
shifts and long charges; a small one, short shifts and short charges. Every robot keeps about the same share of
airtime.

- **A field.** `Robot.batterySize?: number` and `RobotLifecycleSnapshot.batterySize?: number`. Absent reads as
  `DEFAULT_BATTERY_SIZE` (1), which is today's rates, so the two dozen test files that build robots by hand keep
  today's arithmetic. Spawn always sets it.
- **The draw.** A pure `generateBatterySize(noiseMap, spawnCount)` in `spawnSystem.ts`: one `getUniformSeededVal` at
  `'robot.batterySize'`, offset the spawn count, on `[BATTERY_SIZE_MIN, BATTERY_SIZE_MAX)`. An even draw, because a
  plain sample would bunch the sizes in the middle. `spawnRobot` calls it; its no-noise-map fallback is an `alea` draw
  into the same band, like its neighbours'.
- **Where it applies.** The step divides both rates by the robot's size: `drain(robot) / size` and
  `BATTERY_RECHARGE_RATE / size`. `DrainRule` keeps its signature and now names the base drain, before the size
  divides it. No recharge hook is added: with the size on the snapshot, a sim sets sizes through its roster.
- **Carried.** `toLifecycleSnapshot` passes it to the step. `buildSimRoster` (`lifecycleSim.ts`) sets it through the
  same `generateBatterySize`, so the sim roster still matches spawn robot for robot.
- **A seeded fact, not a control.** Not editable, not shown (assumption 9), not saved in a session (the override diff
  names its fields one by one and never read battery state), not on the world link. It is drawn when a world's roster
  is built; a theme or aspect change, which re-derives in place, leaves it alone.

**What one robot's cycle becomes** on the sketch's band, 0.8–1.25 (arithmetic). A cycle is the Active measures, the
Recalled hold, the Docked measures and the Undocking hold. "Heard" is the Active measures plus the Recalled hold, over
the cycle.

| Size | Active | Docked | Cycle | Heard |
|---|---|---|---|---|
| 0.80–0.867 | 13 | 16 | 31 | 45.2 % |
| 0.867–0.933 | 14 | 17 | 33 | 45.5 % |
| 0.933–1.00 | 15 | 18 or 19 | 35 or 36 | 45.7 % or 44.4 % |
| 1.00–1.067 | 16 | 20 | 38 | 44.7 % |
| 1.067–1.133 | 17 | 21 | 40 | 45.0 % |
| 1.133–1.20 | 18 | 22 | 42 | 45.2 % |
| 1.20–1.25 | 19 | 23 | 44 | 45.5 % |

Four things the table shows that the intent did not have:

1. **A continuous size gives eight cycle lengths, not a continuum.** A shift always starts from exactly 100 and
   transitions are checked once a measure, so a robot's cycle is a whole number of measures, the same every time.
   Twelve robots over eight lengths means at least five of them share a length with another, and two robots of one
   length stay in step with each other until a stay moves one. The intent turned down whole-number sizes for this
   reason (three lengths); the continuous size makes it eight and does not remove it. Open question A2.
2. **The fleet as a whole still stops looping.** Its pattern repeats only when every robot's cycle lines up again: two
   robots at 31 and 44 measures do so every 1,364 measures, and each further length in a world makes it rarer.
3. **The 35-or-36 split is floating point.** After 15 Active measures the charge needs exactly 18 steps to reach 100.
   In floating point the sum lands on 100 or a hair under, depending on the size's low bits, and a hair under costs a
   19th measure. It is deterministic: the live tick and the replay run the same additions and divisions in the same
   order, and those are exact-rounded on every engine. Accepted as it is (assumption 5).
4. **A recalled robot is Active again sooner at the small end:** 18 measures after the recall, against 20 today. That
   matters to turn-backs (§1.6). After a stay that reached 0 a robot is Docked for 16 to 25 measures.

**The two halves together** on that band, over 6,000 measures a world (probe): no silent measure in any world; a robot
is in a stay 0.13 % of measures, about one stay per 1,700 measures per world, typically two measures long (p90 four,
longest ten); robots sounding average 5.4 against 5.5 today, p10–p90 3–8 against 2–9.

**Each half alone is not enough** (probe):

- Battery size with no rule: silence becomes rarer and wider, 0.19 % of measures but in 103 of 121 worlds at some
  point, against 3.4 % of measures in 79 worlds today.
- The rule with no battery size: it fires once per world in 92 of 121 worlds, for 1–9 measures, inside the first 70
  measures, and never again in 2,000. The stay moves that robot's schedule so the hole stays covered, and the fleet
  goes back to looping every 35 measures.

### 1.4 The battery is fractional end to end

With a fractional rate the live tick and the replay must hold the same number between measures.

- **`localeStore.updateRobot` stops truncating `batteryLevel`** (`src/stores/localeStore.ts`). Today it applies
  `Math.trunc`; the tick writes through it and reads the value back next measure, while the replay never truncates, so
  the two would drift apart. The 0–100 clamp stays, and a `NaN` is dropped as `pan`'s is.
- **Spawn's start batteries stay whole numbers** (`Math.floor` in `spawnInitialRoster` and `buildSimRoster`). Only the
  tick produces fractions.
- **The readouts already round:** `RobotScreen.tsx` (two places) and `RosterTile.tsx`. No change.
- **`computeBatteryDimOpacity` compares against thresholds.** No change.
- **`deckCamera.pick` is unchanged** (assumption 6). It ranks on the stored value and breaks an exact tie by distance.
  Today robots that left together hold equal batteries for a whole shift; with sizes that is rare, so the tie-break
  seldom applies.

### 1.5 The cover sim: measure first

`lifecycleSim.ts` gains a cover sim beside the drain sim: real seeded rosters (`buildSimRoster`), the real
`stepRobotLifecycle`, the 121-coordinate grid, no store, no BeatClock. It takes the size band as an option, so
candidate bands run without touching the constants. Per configuration it reports:

- silent measures: their share of all measures, and how many of the 121 worlds have at least one;
- stays: how many worlds have one, stays per 1,000 measures per world, their length (median, p90, longest), and the
  share of measures with a robot in a stay;
- robots sounding per measure: mean, p10, p90;
- cycle lengths: shortest, longest, how many distinct lengths across the grid, and per world the largest group of
  robots sharing one length (finding 1 of §1.3, made visible);
- the share of the cycle each robot is heard: lowest and highest;
- for today's row only, the five worlds with the longest silence and the measure each begins. Gate B listens there.

Four configurations, each measured by the real step:

| Row | Rule | Sizes | Measured |
|---|---|---|---|
| Today | off | all 1 | on today's code, before anything changes |
| Size only | off | drawn | after battery size lands, before the rule does |
| Rule only | on | all 1 | after the rule lands, on a roster with its sizes set to 1 |
| Both | on | drawn | after the rule lands, once per candidate band |

That order, size before the rule, is what lets all four be measured with no switch inside the step that only a sim
reads (assumption 7). The plan owns the slicing and may differ, provided each row comes from the real step.

**Gate A: the band.** The sim's table goes to Crawford with three candidate bands, and he picks
`BATTERY_SIZE_MIN` / `BATTERY_SIZE_MAX`. The one-robot facts are known already (arithmetic):

| Band | Distinct cycle lengths | Cycles | Active shift | Recall to Active again, shortest |
|---|---|---|---|---|
| 0.9–1.1 | 5 | 33–40 | 14–17 | 19 measures |
| 0.8–1.25 (the sketch's) | 8 | 31–44 | 13–19 | 18 measures |
| 0.67–1.5 | 15 | 27–53 | 11–23 | 16 measures |

The fleet numbers for each (stays, robots sounding, sharing per world) are the sim's to supply. Every candidate has
zero silent measures by the rule; the choice is about variety against how different the robots' shifts become.

**Pinned after the gate** (`lifecycleSim.test.ts`): zero silent measures in every world over the grid at `SIM_MEASURES`
(2,000) with the shipped band, and the drain sim's three flat rows re-measured (today 5.70, 5.14, 4.60), since the rule
and the sizes both move them. The 6,000-measure run stays behind `LIFECYCLE_SIM_REPORT`, so the suite's run time moves
by seconds, not minutes.

### 1.6 The loop sim and turn-backs

[ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md) says a turn-back cannot happen on its own, because a recalled robot takes
20 measures to be Active again, longer than any swim home; the loop sim measures 0. A small battery is back in 18
(§1.3). At 200 BPM a measure is 1.2 s, so that is 21.6 s against today's 24 s, and the doc has a robot still heading
home up to about 17 s after it lands on Docked.

`runReadinessSim` runs the real step on `buildSimRoster`'s rosters, so it picks up the rule and the sizes with no edit
of its own. It is re-run at 20, 110 and 200 BPM with the shipped band:

- `chargingWhileVisible` stays 0 (pinned today, stays pinned).
- Turn-backs are recorded, whatever they are. A turn-back is a supported path, covered at 200 BPM by
  `workLoop.integration.test.ts`, so a count above 0 is reported at Gate A and written into ROBOT_LIFECYCLE.md as
  measured. It does not stop the work.

### 1.7 What a stay looks like

A staying robot is at 10 % or below, where `computeBatteryDimOpacity` gives 0.1 (its 12 % tier). Today that is the
look of a robot on its way home. Under the rule the robot carrying the music works on at 0.1 for the length of the
stay: typically two measures (probe), which is 4 s at 120 BPM and 24 s at 20 BPM. The longest probe stay, ten measures,
is two minutes at 20 BPM.

No new look, state or copy is specified (assumption 8): the card reads Active with the battery at 0 %. The intent
records Crawford preferring "one dimmed robot" to three. Whether nearly invisible is the right dim is open question A3,
judged at Gate B in the same sitting as the listen.

### 1.8 What does not change

- The thresholds (critical 10, full 100), the base rates (6 and 5), the one-measure holds.
- Pitch drift on every dock, `audioMode` on landing, the `onLifecycleChange` seam, the dock-cycle count.
- Spawn's start state: 2–4 robots Active at 100, the rest Docked on their `roster.dockedBattery` draw.
- The work loop, the Audio Load Budget, the deck camera, the day clock, every component and all copy.
- Sessions and world links: no battery state and no size in either.

### Part B — `company-families` (Stage 2)

Specified 2026-11-11 from Crawford's answers (§7.3); planned in
[docs/tasks/COMPANY_FAMILIES.md](../tasks/COMPANY_FAMILIES.md); built only after Gate B.

### 1.9 Decided (Crawford, 2026-11-10 from the intent; revised 2026-11-11 by B1–B11)

- **A seeded company is a family:** one founder plus inheritors. A Freelance robot is always an original. The 30 %
  copy roll goes from `spawnRobot` and from `generateRobotAudioBaseline` (`robot.copyChance`, `robot.copySource`).
  At least two robots are freelancers (B4), so at most ten are in companies and between 4 and 7 robots inherit
  (members less founders), against about 3.4 copies a world today (probe).
- **The founder is the company's lowest roster index** (B6), the member that spawns first.
- **A member inherits what today's copy takes** (code): `audioAttributes` (the voice), `octaveRange`,
  `rhythmicDensity`, `rhythmicMotifLength`, `noteVariance`, `pitchRepeat`, `dynamics`, `rests`, `accents` and
  `lfoLinks`. **And its five sends** (B5: reverb, delay, grit, shimmer, double), so a section sits in one space. The
  founder's onset pattern and note lengths come with the inherited density and motif (B16). Its own: id, name,
  colour, gem, composition seed (so its notes),
  volume, pan, **battery size and start** (B2). *Revised:* the 2026-11-10 decision had members inherit the battery
  size and start roughly together; Crawford reversed it on 2026-11-11 because robots now have different lifecycles,
  and he would rather a company line up organically for the time being.
- **Rhythm is the settings' (B16, 2026-11-11):** in one world, any two robots whose rhythm settings give the same
  shape (§1.11) play the same onsets and note lengths, so every member plays the founder's rhythm exactly, and a user
  can make any robot join a rhythm by matching its settings, or leave it by changing them. The notes are always the
  robot's own. Nothing shares pitches: melodies keep storing note indices. *Superseded:* "75 % exact, 25 % with one
  or two onsets moved" (2026-11-10, and B1, B13) — the moved onsets are cut (B18).
- **A company drifts in and out of step.** Its members keep their own battery sizes and start states, so they line up
  now and then and part again; companies and freelancers drift against each other. *Superseded:* "they start roughly
  together" and "companies fray slowly" (2026-11-10) no longer apply.
- **Fewer distinct voices, accepted:** from about 8.6 a world to between 5 and 8 (12 less the 4–7 inheritors).
- **The start state is today's** (B3): a seeded 2–4 robots Active at full battery, the rest Docked at seeded levels.
- **The deal derives a member's dealt fields from its founder's spawn index** (B8), so an aspect change keeps a
  company one voice.
- **The Robot Load cap stays first come, first served** (B9): at a low cap a company sounds as a partial section.
- **No Pixel underrun gate** (B10).
- **A robot moved by hand keeps what it rolled** (the 2026-11-01 rule in [COMPANIES.md](../COMPANIES.md)).
- **Recorded as backlog 73** on the shared counter, placed before backlog 45; backlog 60 closes with Part A (B11).
- **Proof:** Crawford's ear (Gate C, §5.7), starting with a world of three companies, that a company reads as a section
  and not as one louder robot; and an untweaked dealt world still saves as `robotOverrides: {}`.

### 1.10 What the code makes necessary (code)

- **Rhythm needs its own stream.** `buildSeededComposition` (`src/engine/melodyGenerator.ts`) builds one stream keyed
  on the composition seed, density, motif length, note variance, pitch repeat and octave range, and both onsets and
  pitches draw from it. Members can share onsets only if rhythm draws from a stream keyed on what they share.
- **Membership must be known before the robots spawn.** `initializeLocale` (`src/systems/worldTransition.ts`) runs
  `spawnInitialRoster`, then `spawnInitialCompanies`, then `applyAspectDeal`. Companies draw their members from a
  shrinking pool of the roster that already exists. The membership draws (`company.count`, `company.size`,
  `company.member`) read only the noise map and pool positions, so they can run over roster indices first.
- **The baselines mirror spawn.** `generateRobotAudioBaseline`, `generateRobotRosterBaseline` and
  `generateCompanyRosterBaseline` replay spawn for the session diff. They must replay whatever spawn becomes, or an
  untweaked world stops saving as `robotOverrides: {}`.
- **The deal would split a company.** `deriveFamilyFields` (`src/systems/aspectDeal.ts`) re-derives a dealt robot's
  fields from that robot's own spawn index, live and in the baseline. Members would have to derive from the founder's.
- **The Robot Load cap is first come, first served.** At a cap of two, a company of four sounds as two.
- **`buildSimRoster` mirrors the start state,** and takes only `noteVariance` from the roster baseline, so it follows
  families through the baseline and needs nothing else (B3 keeps the start).
- **Sequencing.** Stage 2 changes every world's melodies, so it lands before backlog
  [45](../todo/backlog.md#45-off-screen-crawfords-three-preset-links), the last change meant to touch generation.

Found while specifying, 2026-11-11 (code):

- **Onsets come first in the stream; durations do not.** `generateMelodyForRobot` draws every onset at once
  (`buildMotifOnsets`), then the pitch-lock plan, the starting octave, and per event the octave jump, the note and the
  duration (`pickDurationForGap`), all from one `rand`. So onsets split off cleanly; a shared rhythm that includes
  note lengths needs the durations moved onto the rhythm stream too.
- **Rests and accents have their own stream already:** `buildSeededPerformance(compositionSeed)`, four draws per event,
  keyed on the seed alone. On a member's own seed a section would rest and accent apart (open question B12).
- **Today's copies share references** (`audioAttributes`, `octaveRange`, `rhythmicMotifLength`, `noteVariance`,
  `lfoLinks`); nothing mutates them in place (every edit replaces the record). Members may do the same.
- **The roster index is the spawn index** (`spawnInitialRoster` spawns 0–11 in order), and the deal, the baselines and
  the session diff all index robots that way.
- **Company draws are plain `getSeededVal`** (`company.count`, `company.size`, `company.member`), noted in backlog 46,
  and stay plain here: Part B only reorders when they run.

### 1.11 How it works (specified 2026-11-11; the rhythm revised the same day, B16–B19)

- **Membership first.** A pure `generateCompanyMembership(noiseMap)` returns each seeded company's member roster
  indices, from the same draws in the same order as `spawnInitialCompanies` makes them today, over roster indices
  instead of live ids, with B4's cap: a company's size is at most the pool less `FREELANCERS_MIN` (2), and a company
  that cannot reach `COMPANY_SIZE_MIN` is not made (open question B14). `spawnInitialRoster` calls it before it spawns;
  `spawnInitialCompanies` and `generateCompanyRosterBaseline` turn its indices into ids. A world the cap does not
  touch keeps today's companies exactly.
- **A lineage on the robot.** `Robot.lineage?: { founderIndex: number }`, set at spawn on members only. Absent means
  an original: its own index founds it. It plays no part in the melody (the rhythm follows the settings, B16); the
  deal reads it (below). Seeded, never edited, never shown, never diffed into a session (regenerated from the world
  seed), and kept when a robot is moved by hand (the 2026-11-01 rule; open question B15). *Revised:* the first build
  also carried a `rhythmSeed` and `movedOnsets`; both go with B16 and B18.
- **Spawn.** `spawnRobot` takes an optional founder: a member copies the founder's inherited fields (§1.9) from the
  store, which already holds the founder, and its sends; and draws its own composition seed, name, colour, gem,
  volume and battery size. The copy roll and its two dataIds are retired. No other draw is added.
- **The rhythm shape.** What a robot's density and motif make of a measure: with tiling on, the motif length and the
  onsets per cell (`max(1, round(density / 100 × length))`); with tiling off, the onsets in the measure
  (`max(1, round(density / 100 × 16))`). One function computes it for the generator and for the key, so they cannot
  disagree. Two densities that round to the same count have the same shape (B17), and an inert motif length (tiling
  off) is not part of it.
- **The rhythm stream.** `buildSeededRhythm(worldKey, { rhythmicDensity, rhythmicMotifLength })` keys a second stream
  on the world and the rhythm shape only (B16, B17, B7). The world key is the world's coordinates, `${x}:${y}`, the
  same input its noise map hashes, so a world reloaded from a save or a link plays the rhythms it had (B19's choice:
  without it every world would share one set of rhythms). `generateMelodyForRobot` draws the onsets and every
  duration from it, and the pitch-lock plan, octaves and notes from the composition stream. So in one world the same
  shape is the same rhythm, whoever plays it: a member, whose density and motif are inherited, plays its founder's
  rhythm exactly; two freelancers that draw the same shape play together too (B16 accepts it; the plan measures how
  often); a user who sets a robot's density and motif to match another's makes it join that rhythm. `regenerateMelody`
  and spawn build the melody with one recipe, so an edit reproduces spawn's melody exactly ("no first-edit ratchet"
  holds). Every world's melodies change once (§1.10, sequencing).
- **Rests and accents** draw from a performance stream on the world key and the rhythm shape, not on the robot's seed
  (B19, revising B12's "the rhythm seed"): robots that share a rhythm and the same Rests and Accents values rest and
  accent together, and differing values give nested subsets (the stream's four draws per event are unchanged, so a
  slider still only adds or removes stamps). A rhythm edit reshuffles the stamps along with the onsets.
- **No moved onsets** (B18). The 25 % of members that moved one or two onsets is cut, with `moveOnsets`, the
  generator's `onsetMoves` option and the `'robot.onsetMoves'` draw.
- **The deal.** `applyAspectDeal`, `applyDealToBaselines` and `rederiveLoading` derive a robot's dealt fields from
  `lineage.founderIndex` when it has one, its own index otherwise; the founder is dealt first (lower index), and its
  LFO lanes are a member's lanes.
- **The baselines.** `generateRobotRosterBaseline` uses the membership: a member's baseline is its founder's, with its
  own name and volume (the sends now included). `generateRobotAudioBaseline` loses the copy roll. An untouched world
  still diffs to `robotOverrides: {}`.
- **What does not change:** the lifecycle, the stay-up rule, battery sizes, the start state, the Audio Load Budget,
  the work loop, the deck camera, the session payload's shape and the world link.

---

## 2. Target File Structure

Part A only. Part B's list is written when Part B is completed.

```text
src/constants/index.ts              # BATTERY_SIZE_MIN / BATTERY_SIZE_MAX (Gate A's pick), DEFAULT_BATTERY_SIZE
src/types/Robot.ts                  # Robot.batterySize?
src/systems/robotSystems.ts         # stepRobotLifecycle: the stay-up rule, both rates divided by the size;
                                    #   RobotLifecycleSnapshot.batterySize?; toLifecycleSnapshot carries it;
                                    #   the step's and DrainRule's doc comments
src/systems/robotSystems.test.ts    # the rule, the size, the prove-it with a stay and fractional batteries
src/systems/spawnSystem.ts          # generateBatterySize; spawnRobot draws it
src/systems/spawnSystem.test.ts     # every spawned robot has a size in the band; the draw is even and repeatable
src/stores/localeStore.ts           # updateRobot: batteryLevel clamped, not truncated; NaN dropped
src/stores/localeStore.test.ts
src/systems/lifecycleSim.ts         # buildSimRoster carries the size; the cover sim and its report
src/systems/lifecycleSim.test.ts    # parity with spawn; no silent measure over the grid; the drain rows re-pinned

docs/ROBOT_LIFECYCLE.md             # principle 3; "No keep-one-playing guard" becomes the stay-up rule; the battery
                                    #   table and battery size; "Why 6" re-measured; the turn-back paragraph as
                                    #   measured; the replay snapshot; the cover sim; roster creation; testing notes
docs/PROCEDURAL_GENERATION.md       # the new even key, 'robot.batterySize'
docs/todo/backlog.md, docs/todo/plan.md        # 60's status
docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md  # the status line, the gates' decisions, an "As built" section
docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md  # the plan, once this spec is approved
```

`workLoop.ts`, `audioBudgetSystem.ts`, `AudioEngine`, `deckCamera.ts`, `sessionDiff.ts`, the link code, `src/content/`
and every component are untouched.

Part B (written 2026-11-11; the rhythm revised the same day, B16–B19):

```text
src/constants/index.ts              # FREELANCERS_MIN (2)
src/types/Robot.ts                  # Robot.lineage? { founderIndex }
src/engine/melodyGenerator.ts       # the rhythm shape; buildSeededRhythm on the world key and the shape;
                                    #   generateMelodyForRobot's rhythmRand (onsets + durations)
src/engine/melodyGenerator.test.ts
src/engine/regenerateMelody.ts      # composeRobotMelody, the one recipe spawn and regenerate share; the world key;
                                    #   the performance stream on the world key and the shape
src/engine/regenerateMelody.test.ts
src/systems/spawnSystem.ts          # generateCompanyMembership; spawnInitialRoster passes the founder; spawnRobot
                                    #   inherits; the copy roll retired; the baselines
src/systems/spawnSystem.test.ts
src/systems/aspectDeal.ts           # deal by lineage.founderIndex
src/systems/aspectDeal.test.ts      # (or spawnSystem.test.ts's deal blocks, where the deal cases live today)
src/utils/sessionDiff.test.ts       # an untouched world still saves {} across the grid

docs/COMPANIES.md                   # a seeded company is a family; the founder; what members share; moves by hand
docs/MELODY_SYSTEM.md               # the rhythm shape and stream on the world key, B7's side effect, matching by hand
docs/PROCEDURAL_GENERATION.md       # copyChance / copySource retired; membership drawn before spawn
docs/todo/backlog.md, docs/todo/plan.md        # 73's status
```

`sessionDiff.ts`'s code is untouched (it reads the baselines); `workLoop.ts`, the lifecycle, `audioBudgetSystem.ts`,
`AudioEngine`, the link code, `src/content/` and every component are untouched.

---

## 3. Implementation Boundaries & Constraints

**Always**
- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). Each case in §5.1
  fails on today's code for the reason it names.
- The lifecycle stays a pure function of seed and measures. The rule and the size live in `stepRobotLifecycle`, and
  the live tick and `replayLifecycle` run that one step.
- Every seeded value comes from the locale noise map. The size is an even draw (`getUniformSeededVal`).
- Every (probe) number is re-measured by the cover sim before it goes into ROBOT_LIFECYCLE.md.
- State stays JSON-serialisable.
- Before committing a change to the snapshot's shape, the step's behaviour or `updateRobot`, run every test file that
  builds on them, not only the task's named files. The full suite runs at each checkpoint.

**Ask first**
- Changing the thresholds, the base rates, the one-measure holds, or spawn's start state.
- Any new look, state or copy for a staying robot, or showing battery size anywhere (content layer if so).
- Any change to `deckCamera.pick`, `audioBudgetSystem.ts` or `workLoop.ts`.
- CLAUDE.md's one-line summary of ROBOT_LIFECYCLE.md, which says "flat drain/recharge" and will be stale. Its edit is
  Crawford's.
- Building anything in Part B before Gate B passes (specifying and planning it early was Crawford's call, 2026-11-11).

**Never**
- `setTimeout`, `setInterval`, `requestAnimationFrame`, `queueMicrotask` or `Math.random` in the lifecycle.
- Read `audioMode`, the sounding set or anything else audible in the rule.
- Make battery size a control.
- Re-tune a gate to pass it. A gate that misses stops and reports.
- A file-text test (source, doc or CSS read as text). A docs-only task has no RED test; its proof is a read, named on
  the task's Proof line and in the commit.
- A "keep the existing sound" or compatibility clause in any doc (the pre-v1 rule).

---

## 4. Code Style & Architecture Conventions

The step's two changed branches, as they would read in `robotSystems.ts` (names provisional; the plan pins them):

```typescript
for (const robot of working) {
  // One seeded number divides both rates: a big battery is a long shift and a long charge (spec §1.3).
  const size = robot.batterySize ?? DEFAULT_BATTERY_SIZE;
  if (robot.docking === DockingState.Active) {
    robot.batteryLevel = Math.max(0, robot.batteryLevel - drain(robot) / size);
    if (robot.batteryLevel <= BATTERY_CRITICAL_THRESHOLD) {
      // The last robot stays up (spec §1.2): recalled only while another robot is Active. `working` is mutated
      // in roster order, so of two robots crossing critical together the earlier goes and the later stays.
      const anotherActive = working.some((r) => r.id !== robot.id && r.docking === DockingState.Active);
      if (anotherActive) {
        robot.docking = DockingState.Recalled;
        robot.dockingHoldUntilMeasure = measure + 1;
      }
    }
  } else if (robot.docking === DockingState.Docked) {
    robot.batteryLevel = Math.min(100, robot.batteryLevel + BATTERY_RECHARGE_RATE / size);
    // ... the Undocking trigger, as today
  }
  // ... the hold-elapsed landings, as today
}
```

And the draw, in `spawnSystem.ts`:

```typescript
/** A robot's battery size (spec §1.3): one even draw per robot. Pure, so lifecycleSim.ts's roster shares it. */
export function generateBatterySize(noiseMap: NoiseFunction2D, spawnCount: number): number {
  return getUniformSeededVal(noiseMap, 'robot.batterySize', spawnCount, BATTERY_SIZE_MIN, BATTERY_SIZE_MAX);
}
```

- Names follow the neighbours': `generateBatterySize` beside `generateGemSeed` and `generateCompositionSeed`; the
  constants beside `BATTERY_DRAIN_ACTIVE`; the cover sim's functions beside `runDrainSim` and `formatDrainReport`.
- Comments as dense as the module's, each new function's doc comment naming the spec section it implements.
  `stepRobotLifecycle`'s own doc comment is rewritten: it says today that the guard is gone.
- The sim stays pure: no store, no BeatClock, no GSAP, as its tests already check.

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest)

The rule, on `stepRobotLifecycle` and through `tickRobotLifecycle` (`robotSystems.test.ts`):

1. A sole Active robot at or below critical stays Active: no hold is set and the seam is not called with
   `'recalled'`. (The two "recalled like any other" cases flip.)
2. While it stays, its battery drains every measure and floors at 0. (The "recalled too, not held at the floor" case
   flips.)
3. It is recalled the measure another robot is Active: the same tick when the robot landing on Active is earlier in
   the roster, the next tick when it is later. Two cases.
4. Two robots crossing critical in one tick with no third Active: the earlier is recalled, the later stays. With a
   third robot Active, both are recalled. (The two "both depart" cases flip.)
5. A robot at critical beside only a Recalled robot, or only an Undocking one, stays.
6. A muted last robot (`audioMode: 'mute'`) still stays, through the tick.
7. Over a real seeded roster the Active count never reaches zero. (`activeCountsOverTime`'s "it may reach zero" case in
   `lifecycleSim.test.ts` flips.)

Battery size:

8. An Active robot of size *s* drains by `BATTERY_DRAIN_ACTIVE / s` and a Docked one charges by
   `BATTERY_RECHARGE_RATE / s`. A snapshot with no size uses today's rates.
9. An injected `DrainRule`'s value is divided by the size too.
10. Different sizes, different shift and charge lengths, counted through real steps from a full battery, beside a
    second Active robot so the recall is not a stay: size 0.85 is recalled on its 13th Active measure and starts
    Undocking on its 16th Docked one; size 1.15 on its 18th and its 22nd.
11. Every robot `spawnInitialRoster` makes carries a size inside the band; a world gives the same sizes twice; over the
    grid's robots the sizes spread evenly across the band (the outer tenths each get their share, as the Even Seeded
    Draws cases check).
12. The tick drains a robot by its own size: `toLifecycleSnapshot` carries the field.
13. `updateRobot` keeps a fractional battery (42.9 stays 42.9), still clamps to 0–100, and drops a `NaN`. (The
    "truncates a fractional value" case flips.)
14. The prove-it: N real ticks against one `replayLifecycle`, identical field for field, on a roster whose sizes are
    set, differ from each other and differ from 1, so parity cannot pass on defaults. The run contains a stay (a sole
    Active robot crosses critical, drains on, and is recalled when another lands), and asserts that at least one
    battery in the result is not a whole number.
15. `buildSimRoster` matches `spawnInitialRoster` robot for robot on battery size too.

The cover sim (`lifecycleSim.test.ts`):

16. On hand-built rosters it counts a silent measure, counts a stay and its length, and counts a Recalled robot as
    sounding.
17. Over the grid at `SIM_MEASURES` with the shipped band: zero silent measures in every world.
18. The drain sim's flat rows, re-pinned to their re-measured means.
19. Deterministic, and touching no store and no BeatClock, as the drain sim's cases check.

**Mutants** (each checked by hand and named in its task's commit):

- drop `r.id !== robot.id`, so a robot relieves itself (case 1);
- count Recalled as Active in the rule (case 5);
- read the pre-tick `roster` in the rule, not `working` (case 4);
- divide the drain but not the charge (cases 8 and 10);
- put `Math.trunc` back in `updateRobot` (cases 13 and 14);
- drop `batterySize` from `toLifecycleSnapshot` (cases 12 and 14);
- draw the size with a plain `getSeededVal` (case 11's spread).

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test` and `npm run build`, all clean at each checkpoint.

### 5.3 Runs (the proof; not tests)

- **The cover sim's four rows** (§1.5), 6,000 measures a world, each beside the intent's probe number. A difference is
  reported, not smoothed over.
- **The candidate bands** for Gate A.
- **The loop sim** at 20, 110 and 200 BPM with the shipped band (§1.6).

### 5.4 Gate A: the band (stop and report)

After the runs. The table, the three candidates, the turn-back count and finding 1 of §1.3 as the sim shows it per
world. Crawford picks the band; the pick is written into §7 and the constants.

### 5.5 Gate B: Crawford's ear (stop)

On the built branch, in a browser:

- a long listen with no silence;
- a listen at one of today's five worst worlds, at the measure its silence used to begin, against `main`;
- the fleet without its 35-measure loop sounds at least as good;
- a look at a staying robot (open question A3).

Passing Gate B closes Part A and opens Part B's questions.

### 5.6 Done when (Part A)

- Every case in §5.1 passes and was written RED first; every mutant in §5.1 is killed.
- The cover sim shows zero silent measures in all 121 worlds with the shipped band, and that is pinned.
- The prove-it passes with a stay and fractional batteries in its run.
- The loop sim shows no robot charging while visible, and its turn-back count is recorded.
- The checks of §5.2 are clean.
- ROBOT_LIFECYCLE.md and PROCEDURAL_GENERATION.md describe what shipped, every number in them re-measured.
- Gates A and B are passed, their decisions written into this spec.

### 5.7 Part B: tests, proof and Gate C

RED first, in the plan's tasks:

1. `buildSeededRhythm` keys on the world and the rhythm shape only: a note-variance, octave or pitch-repeat change
   leaves it the same stream (B7), and so do two densities with the same onset count and a motif length changed while
   tiling is off (B17); an onset-count, motif-length, tiling or world change does not.
2. `generateMelodyForRobot` with one rhythm stream and two different composition streams gives the same `startStep`s
   and lengths and different notes; with no `rhythmRand` it behaves as it is passed one built from the same seed.
3. In one world, two robots with different composition seeds and the same rhythm shape get the same onsets, lengths,
   and (with the same Rests and Accents values) the same stamps, and their own notes; in another world, a different
   rhythm. A robot set by hand to another's density and motif plays its rhythm.
4. `regenerateMelody` on an untouched spawned robot, original or member, reproduces its spawn melody exactly.
5. `generateCompanyMembership` matches today's `spawnInitialCompanies` membership on every grid world the cap does not
   touch; never leaves fewer than two freelancers; never makes a company under three; is repeatable.
6. Over the grid: every member's inherited fields and sends equal its founder's; its onsets and lengths equal the
   founder's exactly; its notes differ from the founder's in most members; freelancers and founders have no lineage.
7. No spawn reads `'robot.copyChance'` or `'robot.copySource'` (spied draws, not a source scan).
8. The deal: after `applyAspectDeal` and after `rederiveLoading`, every member's dealt fields equal its founder's.
9. An untouched world saves `robotOverrides: {}` on every grid world; a hand-moved member keeps its lineage.
10. `buildSimRoster` still matches spawn on battery, docking, note variance and size.

**Mutants** (each named in its task's commit): the rhythm key including note variance; the rhythm key on the raw
density instead of the onset count; the rhythm key without the world; durations left on the composition stream; the
performance stream on the robot's own seed; the founder taken as the highest index; the sends left fresh; the deal by
own index; the cap at one freelancer.

**Gate C: Crawford's ear (stop).** In a browser on the built branch: a world with three companies; does a company read
as a section and not as one louder robot; do rests and accents together (B19) suit a section; and, by hand, does
setting a freelancer's density and motif to a company's make it join the section. If it fails, stop and report;
nothing is re-tuned to pass.

---

## 6. Git & Workflow Context

- The intent and this spec are uncommitted on `feature/no-silence-for-now`. Committing them is Crawford's.
- Next is the plan, `docs/tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md`, for Part A only, once this spec is approved.
- The build continues on the same branch, one commit per task, nothing pushed. Crawford opens the PR.
- Two gates stop for Crawford: A (the band, after the sim) and B (the ear, after the build).
- After the merge: backlog 60's record is brought up to date. It archives only once its fade-on-arcs note has a home
  (open question A4; answered: backlog 74) and Stage 2's record is settled (open question B11; answered: backlog 73).
- Part B's plan is [docs/tasks/COMPANY_FAMILIES.md](../tasks/COMPANY_FAMILIES.md) (written 2026-11-11). Which branch
  builds it: **its own branch from `main` after this one merges** (Crawford, 2026-11-11).

---

## 7. Assumptions and Open Questions

### 7.1 Assumptions (Part A)

Each is the default this spec is written to. Crawford's word changes any of them.

1. **The rule's condition is the removed guard's, unchanged:** another robot is Active. The one variation the intent
   measured, letting a robot that lands next measure relieve the last one a measure early, is not taken (its stays are
   a measure shorter; it relies on the Recalled measure being heard).
2. **Battery size is a field** on `Robot` and on the snapshot, optional, absent meaning 1.
3. **The draw is even and linear** on `[min, max)`, at `'robot.batterySize'`, offset the spawn count.
4. **The step divides both rates.** `DrainRule` returns the base drain. No recharge hook.
5. **The battery is a plain floating-point number.** Spawn's start batteries stay whole. The 35-or-36 split of §1.3 is
   accepted and nothing rounds it away.
6. **`deckCamera.pick` is unchanged.** The alternative, ranking on the rounded percent the readouts show so ties keep
   happening, is not taken.
7. **No switch inside the step that only a sim reads.** The four rows come from the build order (§1.5).
8. **A stay has no new look, state or copy.**
9. **Battery size is not shown** on the robot screen or anywhere else.
10. **The base rates and thresholds stay** at 6, 5, 10 and 100.
11. **The Audio Load Budget is unchanged,** and its floor of two keeps a lone Active robot inside the cap.
12. **The pinned grid run is 2,000 measures.** The 6,000-measure run is report-only.

### 7.2 Open questions, Part A

None blocks the plan: A1 is a gate inside it, and the rest have a default.

- **A1. The size's band.** 0.8–1.25 was the sketch's, not a decision. Decided at Gate A from the sim's table.
  **Answered (Crawford, 2026-11-11, Gate A): 0.67–1.5**, the widest band run: fifteen cycle lengths (27–53), at most
  five robots in step in any world (median 3), a stay in 0.20 % of measures, recall to Active again in 16 measures at
  the shortest, no silence and no turn-back (the plan's Gate A summary).
- **A2. Eight cycle lengths, not a continuum** (§1.3, finding 1). Robots that share a length stay in step until a stay
  moves one, and at least five of the twelve always share. Default: accept it, and let Gate A's per-world column show
  how much sharing there is. The other lever is a wider band (15 lengths at 0.67–1.5), which also makes shifts range
  from 11 to 23 measures. **Answered (2026-11-11): accept**, on the picked band's fifteen lengths.
- **A3. A staying robot at 0.1 opacity.** Default: leave it, and judge it at Gate B. **Answered (Gate B, 2026-11-11):
  left as it is.**
- **A4. Backlog 60's fade on station arcs.** Not in the intent. It needs its own item or a cut before 60 archives.
  **Answered (Crawford, 2026-11-11): its own item,** backlog 74; nothing else holds 60 open.
- **A5. CLAUDE.md's "flat drain/recharge".** Reword it when the docs task lands, or leave it: Crawford's file.
  **Answered (Crawford, 2026-11-11): reworded** to name the battery size and the stay-up rule.

### 7.3 Open questions, Part B

All eleven **answered by Crawford on 2026-11-11**, at Checkpoint B of Part A and before Gate B (he chose to answer
early so Part B could be planned overnight; it is still built only after Gate B). Two answers reverse §1.9: B2 and its
follow-up.

- **B1. Where the 25 %'s moved onset sits:** in the measure, or in the motif cell, where it repeats.
  **Answered: in the measure.** The move happens once a measure; a motif repeats around it unchanged. *Superseded
  2026-11-11 by B18: the moved onsets are cut.*
- **B2. "Roughly together":** the same measure, or a measure apart so an entrance builds.
  **Answered: neither — keep today's start.** Robots now have different lifecycles, and Crawford would rather a
  company line up organically for the time being. **Follow-up, answered: a member draws its own battery size**, as
  every robot does since Part A. A company shares a voice, a rhythm and its sends, and drifts in and out of step.
  This reverses §1.9's "its battery size … and its start", "they start roughly together" and "companies fray slowly".
- **B3. Which robots start Active,** now that a company starts together. Today it is roster indices 0 to n−1, a
  seeded 2–4, at full battery. **Answered: keep today's seeded 2–4.**
- **B4. Company sizes:** 2–3 companies of 3–4 as today, or different now that size decides how many robots inherit.
  **Answered: keep 2–3 companies of 3–4, but at least two freelancers** (at most ten robots in companies).
- **B5. What stays fresh for a member.** Today a copy draws its own id, name, colour, gem, composition seed, volume,
  sends and pan. **Answered: a member also takes the founder's five sends** (reverb, delay, grit, shimmer, double),
  so a section sits in one space. Id, name, colour, gem, composition seed (its notes), volume and pan stay its own.
- **B6. Which member is the founder.** Proposed: the lowest roster index in the company, so it spawns first.
  **Answered: the lowest roster index.**
- **B7. The rhythm stream's side effect:** a note-variance or octave edit would stop reshuffling any robot's rhythm,
  which it does today. **Answered: accept.**
- **B8. The deal:** members derive their dealt fields from the founder's spawn index. **Answered: yes, from the
  founder's.**
- **B9. The Robot Load cap:** a company of four at a low cap is a section of two. Accept, or admit by company.
  **Answered: accept.**
- **B10. The Pixel underrun A/B** for three or four robots hitting every onset together: proposed as a gate in the
  idea-refine session, not confirmed. **Answered: no gate.**
- **B11. Where Stage 2 is recorded:** its own number on the shared counter, placed before backlog 45, or kept under 60.
  **Answered: its own number, before backlog 45;** backlog 60 closes with Part A.

### 7.4 Assumptions (Part B, 2026-11-11)

Each is the default §1.11 is written to. Crawford's word changes any of them.

1. **Durations are part of the rhythm.** A member plays the founder's note lengths as well as its onsets, so the
   durations move to the rhythm stream with the onsets.
2. **The pitch-lock plan (Pitch Repeat) stays on the composition stream:** which onsets repeat a pitch is a pitch
   matter, the member's own.
3. **A member's start battery and Active slot are today's** (B3), drawn by roster index as now.
4. **Members share references to the founder's records** (`audioAttributes`, `lfoLinks` and the rest) as today's
   copies do; nothing mutates them in place.
5. **A member's volume stays its own** (B5 named the sends only), drawn as today from its inherited octave range.
6. **The lineage is a field on the robot**, not derived from the company, because a robot moved by hand keeps what it
   rolled: since B16, only the founder it is dealt from.
7. **The company draws stay plain `getSeededVal`** (backlog 46 owns making them even); Part B only runs them first.
8. ~~**The shares of the moved-onset roll are 75 / 12.5 / 12.5 %**~~ *Gone with the moved onsets (B18).*

### 7.5 Open questions, Part B (new, 2026-11-11)

Found while specifying. **All four answered by Crawford on 2026-11-11 at Gate A: every default stands.** Gate C
still hears them.

- **B12. Rests and accents in a company.** Shared (the performance stream on the rhythm seed, so a section rests and
  accents together) or each member's own (its composition seed, as today). Default: **shared**. **Answered: shared.**
  *Revised by B19: still shared, but on the world key and the rhythm shape, as there is no rhythm seed.*
- **B13. How far a moved onset moves.** One step to a free neighbour (it reads as a push or a pull on the beat), or to
  any free step in the measure (it reads as a new note). Default: **one step**; if neither neighbour is free, that
  occurrence is skipped and the next one tried. **Answered: agreed.** *Superseded by B18: the moved onsets are cut
  (built as Task 2, `7bdc5aff`, then removed).*
- **B14. The two-freelancer cap.** When the pool left for a company is under three, the company is not made (two
  companies instead of three in some worlds), or it is made smaller than three. Default: **not made**. The plan
  measures how many grid worlds the cap touches. **Answered: not made.**
- **B15. A robot moved by hand into another company.** It keeps its own lineage, so it keeps the rhythm it rolled and
  is dealt from its old founder (the 2026-11-01 rule), or it joins its new company's family. Default: **keeps its
  own**. **Answered: keeps its own.** *Since B16 the rhythm follows its settings, which a move does not change; the
  lineage decides only which founder it is dealt from.*

### 7.6 The rhythm revised (Crawford, 2026-11-11, after Phase 1 was built)

Phase 1 was built as first specified (a rhythm seed on the robot, the founder's composition seed for a member). On
hearing that matching density and motif alone would not match a rhythm, because the rhythm also hung on a per-robot
seed, Crawford asked for the settings to decide it: the same composition settings should make the same rhythm, so a
user could make any robot appear to inherit by setting it right, and the 25 % with moved onsets could go. Also noted:
a similar seed never gives a similar rhythm (the stream is a hash), so "close" settings or seeds do not sound close;
only the same shape does. Four questions, **all answered yes on 2026-11-11**:

- **B16. The rhythm is the world's and the settings', not the robot's.** In one world, the same rhythm settings play
  the same onsets and lengths; a member matches its founder because it inherits the settings; any robot set to them
  joins; two freelancers that draw the same shape play together. **Answered: yes.** *Measured after (Task 3a's Run,
  [COMPANY_FAMILIES.md](../tasks/COMPANY_FAMILIES.md) Results): before families, 66 % of robots share a rhythm with
  another in their world, in all 121 grid worlds, against 14 % on a per-robot seed; the estimate it was answered on
  ("roughly one world in six") was wrong. Crawford, shown it: **accepted** ("this sounds fine").*
- **B17. The key is the shape, not the raw density:** the onset count per cell (tiling on) or per measure (tiling off)
  and the motif length, so densities that round to the same count match and a user need not hit the exact slider
  value. **Answered: yes.**
- **B18. Cut the moved onsets,** with `moveOnsets` and the generator's `onsetMoves` option (built as Task 2), rather than
  leave them unused. **Answered: yes.**
- **B19. Key on the world as well,** the coordinates its noise map hashes, so worlds do not all share one set of
  rhythms; and **rests and accents shared** by robots that share a rhythm (the performance stream on the world key and
  the shape). **Answered: yes, both.**

---

## 8. As built (Part A)

Built 2026-11-10/11 on `feature/no-silence-for-now`, one commit per task: T1 `da8d5b52`, T2 `da9416d0`, T3's row
`f1991143`, T4 `b665a138`, T5 `20ea1cd3`, T6 `8394603c`, T7 `3438dda4`, T8 `2fa38ec3`, T9 `90566d9c`, T10 `e391c379`,
T10a `986ed2f8` (inserted, below), T11 `ec0be658`, T12 `ba8737b6`, T13 `c208f726`, Checkpoint C `f889ac6b`, T14
`1ca16f0c`, T15 `4c5488e2`, T16 (this section). The runs and the Gate A summary are in the plan's Results
([tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md](../tasks/NO_SILENCE_AND_COMPANY_FAMILIES.md)); the shipped design is in
[ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md), "The Docking State Machine", "Battery size" and "Headless Sims".

**The names §4 left provisional.** `generateBatterySize(noiseMap, spawnCount, min = BATTERY_SIZE_MIN, max =
BATTERY_SIZE_MAX)`, `DEFAULT_BATTERY_SIZE`, `BATTERY_SIZE_MIN` / `BATTERY_SIZE_MAX` as §4 named them; the rule's local is
`anotherActive`. The cover sim is `createCoverTally(startRoster)` (`observe` / `result`), `runCoverSim({ coords,
measures, rows })` returning one `CoverSimRow` per `CoverSimRowSpec` (`{ label, band? }`), and `formatCoverReport(rows)`.
A band is a `SimBand`: `[min, max]` or `'flat'`. `buildSimRoster(noiseMap, band?)` and `runReadinessSim({ …, band })`
take one.

**Where it differs from §1.**

| Where | Built | Why |
|---|---|---|
| §1.3, the band | 0.67–1.5, Crawford's pick at Gate A (A1), not the sketch's 0.8–1.25: fifteen cycle lengths (27–53), at most five robots in step in a world. A2 accepted. | The Gate A summary: the bands differ little in what is heard, and the widest loops least. |
| §1.3, the probe's stays | On 0.67–1.5 a robot is in a stay 0.20 % of measures, 0.81 stays per 1,000 measures a world, length 2 (p90 5, longest 9). On 0.8–1.25 it was 0.18 %, not the probe's 0.13 %. | The probe was a hand copy; the cover sim is the record. Same kind, about a third more frequent. |
| §1.5, the cover sim's API | `runCoverSim` takes `rows` and returns a list (Task 9), where §1.5 had one row a call. | Task 10 and Task 13 needed four bands in one report. |
| §1.5, the worst worlds | With the rule no world goes silent, so `runCoverSim`'s worst-world list is always empty and its cap and order have no real-step test (Task 12). Kept as Task 3's record. | Only silence fills it. Removing it is Crawford's call. |
| §5.1, the Task 2 cover cases | The invariants case and the cross-check needed a silent world; Task 12 re-aimed them at stays (the cross-check counts stays and stay measures over every world). | The rule removes silence everywhere, and no companion robot can give a world one. |
| §5.1, case 7 | Runs every grid world at `SIM_MEASURES` on the shipped drain and band, not one roster. | The same cost as one long run, and it covers the worlds that went silent. |
| §1.6, the loop sim | A report-only case runs the shipped cooldown on each band at 20, 110 and 200 BPM. 0 turn-backs and 0 robots charging while visible everywhere. | Task 13 needed the loop sim per band. |
| Not in §1: Task 10a | Solo survives the dock cycle and beats the dock: the dock mutes by docking state (`isDockMuted`), never by writing `audioMode`. | Crawford found Solo lost at every landing (a bug on `main` since `ac85091b`) and wanted it fixed here to test this branch. Plan, Task 10a. |

**The seven mutants of §5.1**, each killed, named in its commit: drop `r.id !== robot.id` (T12, `ba8737b6`); count
Recalled as Active (T12); read the pre-tick `roster` (T12); divide the drain but not the charge (T5, `20ea1cd3`); put
`Math.trunc` back in `updateRobot` (T4, `b665a138`, and T6, `8394603c`); drop `batterySize` from `toLifecycleSnapshot`
(T6); draw the size with a plain `getSeededVal` (T7, `3438dda4`).

**The runs** (6,000 measures a world, 121 worlds; the plan's Results):
- **Today** (T3): silent 3.39 % of measures in 79 worlds, every cycle 35 measures; every probe number confirmed.
- **Size only** (T10): 0.15–0.37 % of measures silent depending on the band, in 100–108 worlds, the longest silence 11–13
  measures; the `'flat'` row reproduced today's exactly.
- **The rule, with and without size** (T13): no silent measure on any row. Rule only: a stay in 92 worlds (the probe's
  number), length 2, 4, 9.
- **The drain rows** on the shipped band: 5.71, 5.10, 4.66 (pinned; 5.70, 5.14, 4.60 before battery size).

**Gate A** answered 2026-11-11 (A1, A2 above). **Gate B passed** the same day (§5.5; plan Task 17): Crawford, "ok
passes, sounds good". A3 left at its default (a staying robot keeps the 0.1 opacity). Part A is complete. A4 and A5 were
settled the same day: the fade on station arcs moved to backlog 74, and CLAUDE.md's line was reworded.
