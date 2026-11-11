# Intent: No Silence and Company Families — the last robot stays up, every battery its own size, a company is a family

Confirmed via `idea-refine` on 2026-11-10 (four framing questions, three convergence questions, then two calls of
Crawford's own: battery variance, and its continuous form), ahead of a `spec-driven-development` pass. Backlog
[60](../todo/backlog.md#60-audio-cover-the-silence-when-every-active-robot-is-charging), first item of plan.md's
Stage 3, widened by Crawford to the robots that inherit at spawn. Two stages, each with its own spec; Stage 2's is
written after Stage 1 has been heard.

The numbers below come from scratch probes run in the session, not from repo code: the 121 coordinates of
`SIM_SEED_COORDS` (`src/systems/lifecycleSim.ts`), each world's roster as `spawnInitialRoster` seeds it, and
`stepRobotLifecycle`'s battery arithmetic copied by hand (it reproduces [ROBOT_LIFECYCLE.md](../ROBOT_LIFECYCLE.md)'s
mean of 5.14 Active). The spec's first task re-runs them in `lifecycleSim.ts`.

## Outcome

The fleet is never silent and stops repeating itself, and then a seeded company sounds like a section.

- **Stage 1 (backlog 60).** The last Active robot stays up until another arrives: the guard `beb6abc0` added and
  `b27c8e9d` removed, back in `stepRobotLifecycle` (`src/systems/robotSystems.ts`). And every robot draws one seeded
  **battery size** that scales its drain and its charge together, so life cycles differ in length instead of being
  35 measures for all twelve.
- **Stage 2.** Every seeded company is a founder plus inheritors that share its voice, its onset pattern, its battery
  size and its start. The 30% copy roll in `spawnRobot` (`src/systems/spawnSystem.ts`) goes.

## Behavior

- **Who it is for: the listener who powers on and never opens Probes** (the session's working assumption, stated at
  its start). So a silence is met inside the first cycle, and kinship has to be audible without the UI.

### Today, measured

- **The silence is a fixture of the world, not an accident.** Every robot's cycle is exactly 35 measures (15 Active,
  1 Recalled, 18 Docked, 1 Undocking), so the fleet's on/off pattern is set at spawn and repeats every 35 measures.
  79 of 121 worlds go silent at the same point of every cycle: one measure in 48 of them, two in 19, three to eight
  in 12. The other 42 never do.
- **Why there.** The hole sits just before the 2–4 robots that started Active come back. Docked start batteries are
  one `getSeededVal` sample each, which is bell-curved (p10 17, p90 80), so no docked robot starts low enough to cover
  the end of the cycle.
- **Inheriting today** is the `shouldCopy` branch: a copy takes the source's voice (`audioAttributes`), octave range,
  density, motif length, note variance, pitch repeat, the three performance sliders and the LFO links, and draws a
  fresh `compositionSeed`. So it shares the density and none of the onset pattern. About 3.4 copies per world; a copy
  is in its source's company 67 times in 412, and their first Active measures are a median 6 apart (17 is the
  furthest two can be).

### Stage 1: the cover and battery size

- **Never silent.** Crawford's call, and it reverses 2026-10-12's "a little silence is good for the ear".
- **The last robot stays up.** An Active robot at or below critical battery is recalled only if another robot is
  Active. Otherwise it stays Active, its battery draining to a floor of 0, and is recalled on the first measure
  another robot is Active. It keeps working on screen, since its docking never left Active.
- **It is the last robot, never its company** (Crawford, over the whole family staying). One dimmed robot is
  preferred to three.
- **Battery size.** One seeded number per robot, drawn at spawn, that divides both its drain and its charge. A big
  battery means long shifts and long breaks; a small one, short shifts and short breaks. Every robot keeps the same
  share of airtime. Continuous, not stepped (Crawford, over whole-number sizes and over separate drain and charge
  draws).
- **The fleet stops looping.** With the sketch's range of 0.8–1.25, cycle lengths run from 31 to 44 measures and
  each robot is heard 45–46% of the time.
- **Each half alone is not enough, measured:**
  - battery size with no rule: silence becomes rarer and wider, 0.19% of measures but in 103 of 121 worlds at some
    point (against 3.4% of measures in 79 worlds today);
  - the rule with no battery size: it fires once per world in 92 of 121 worlds, for 1–9 measures (two in 48 of
    them), inside the first 70 measures, and never again in 2,000. The hold moves that robot's schedule so the hole
    stays covered, and the fleet goes back to looping.
- **Together, measured over 6,000 measures per world:** no silent measure in any world; a robot is on empty 0.13% of
  measures, about one hold per 1,700 measures per world, typically two measures (p90 four, longest ten). Robots
  sounding (Active or Recalled): mean 5.4 against 5.5 flat, p10–p90 3–8 against 2–9.
- **Unchanged:** the thresholds (critical 10, full 100), the one-measure holds, pitch drift on every dock, `audioMode`
  on landing, the Audio Load Budget, the work loop, the day clock.

### Stage 2: families

- **A seeded company is a family** (Crawford): one founder plus inheritors. A Freelance robot is always an original.
  With 2–3 companies of 3–4, 4 to 9 robots inherit, against about 3.4 copies today.
- **A member inherits** what today's copy takes, the voice included (Crawford: same voice, over a register spread and
  over an own voice), and four things more: the founder's onset pattern, its battery size, its company and its start.
- **Rhythm** (Crawford's own mix): 75% of members play the founder's onsets exactly, 25% play them with one or two
  onsets moved. The notes are always the member's own.
- **They start roughly together** (Crawford's words) and, sharing a battery size, keep one cycle length. Companies
  and freelancers drift against each other.
- **Companies fray slowly, and that is accepted.** Each time the last-robot rule holds a member, that member moves
  off its company's schedule by the length of the hold. In an earlier sketch (families on their own cycle lengths)
  the median member was still on its founder's entrance after 6,000 measures, and one entrance in ten was five or
  more measures away.
- **Fewer distinct voices, and that is accepted with "same voice":** from about 8.6 per world to between 3 and 8
  (three in a world of three companies of four).

## Style / constraint

- **The lifecycle stays a pure function of seed and measures.** The rule lives in `stepRobotLifecycle`, which the live
  tick and `replayLifecycle` both run, and it reads the roster's docking in roster order as the removed guard did.
  Battery size comes from the locale noise map through an even draw (`getUniformSeededVal`; a plain `getSeededVal`
  sample would bunch the sizes in the middle). No timers, no `Math.random`.
- **The rule reads `docking`, never audibility.** A listener who mutes the last robot gets the silence they asked
  for, and the Audio Load Budget stays a cap and nothing else.
- **Battery size is a seeded fact, not a control.**
- **Stage 2 shares a seed or a pattern, never pitches.** Melodies keep storing note indices.
- **Proof, Stage 1:**
  - tests written RED first for the rule (a sole Active robot at critical stays; it goes the measure another is
    Active; two crossing critical together) and for battery size (different sizes, different shift and break
    lengths);
  - the prove-it replay test (N real ticks against one `replayLifecycle`) with a hold and fractional batteries in the
    run;
  - `lifecycleSim.ts` showing no silent measure in any of the 121 worlds, and its pinned rows re-measured;
  - Crawford's ear: no silence on a long listen, and the fleet without its 35-measure loop sounds at least as good.
- **Proof, Stage 2:**
  - Crawford's ear, starting with a world of three companies of four: a company reads as a section, not as one
    louder robot;
  - three or four robots now hit every onset together, so an underrun A/B on the Pixel (proposed in the session, not
    yet confirmed as a gate);
  - an untweaked dealt world still saves as `robotOverrides: {}`.

## Out of scope

- **The relay** (the fullest docked company leaves early to meet the last one). Considered and measured; Crawford
  chose the stay-up rule.
- **The whole company staying up**, and any floor above one robot (backlog 60's first shape, "min 1 stays, max 3" by
  tier).
- **Separate drain and charge draws** (some robots heard 54% of the time, others 37%) and **whole-number sizes** (three
  cycle lengths only, so same-size robots never drift apart).
- **Fixing the spawn batteries** so the hole never exists. The rule covers it.
- **A register spread, a member that answers the founder's rests, a "call up now" button.** Offered, not chosen.
- **Re-syncing a robot on a Move.** A robot moved by hand keeps what it rolled (the 2026-11-01 rule in
  [COMPANIES.md](../COMPANIES.md)).
- **Backlog 60's fade on station arcs.** Not part of this intent. It needs a home, or a cut, before 60 archives.
- **Backlog [7](../todo/backlog.md#7-audio-tagged-chord-progressions-seeded-mood-chain--tag-filter)** (chord
  progressions). Still post-launch.

## Known implementation notes (not yet spec'd)

Stage 1:

- **The rule's exact condition.** As removed: `working.some((r) => r.id !== robot.id && r.docking === Active)`, so of
  two robots crossing critical in one tick the earlier in roster order goes and the later stays. Letting a robot that
  lands next measure relieve the last one a measure early is the one variation measured (holds a measure shorter;
  on a flat fleet it fires in 79 worlds, not 92).
- **The battery must be fractional end to end.** `localeStore.updateRobot` truncates `batteryLevel` to a whole number
  (`src/stores/localeStore.ts`), the live tick writes through it and reads it back next measure, and the replay
  never truncates, so with a fractional rate the two would disagree. The readouts already round (`RobotScreen.tsx`,
  `RosterTile.tsx`); `deckCamera.ts` breaks a lowest-battery tie by equality.
- **Recharge has no hook.** Drain goes through `DrainRule`; recharge is `BATTERY_RECHARGE_RATE` inline.
- **The size's range** (0.8–1.25 was the sketch's, not a decision), **where it lives** (a field on `Robot` and on
  `RobotLifecycleSnapshot`, or derived from the spawn index; Stage 2's inheritance is simpler with a field), and
  **whether the robot screen shows it** (content layer if so).
- **A held robot's look.** At 12% or below `computeBatteryDimOpacity` gives 0.1, so the robot carrying the music is
  nearly invisible for the length of the hold.
- **Turn-backs.** ROBOT_LIFECYCLE.md's "a turn-back can't happen on its own" rests on a recall taking 20 measures to
  come back. A small battery comes back sooner (17 at 0.8); the loop sim says whether that still clears every swim
  home.
- **Docs and pins that move:** ROBOT_LIFECYCLE.md (the flat-rate principle, "No keep-one-playing guard", the battery
  table, "Why 6"), and `lifecycleSim.test.ts`'s flat rows.

Stage 2:

- **The rhythm needs its own stream.** `buildSeededComposition` keys one stream on the seed plus every attribute, so
  members can only share onsets if rhythm is keyed on what they share. A side effect to decide: a note-variance or
  octave edit would stop reshuffling any robot's rhythm, which it does today.
- **Where the 25%'s moved onset sits:** in the measure, or in the motif cell, where it repeats.
- **"Roughly together":** the same measure, or a measure apart so an entrance builds.
- **The aspect deal.** `aspectDeal.ts` re-derives a dealt family's fields from each robot's own `spawnIndex`, which
  would split a company; members would have to derive from the founder's.
- **Spawn order and the mirrors.** `spawnInitialCompanies` runs after `spawnInitialRoster` and draws members from a
  shrinking pool; a family needs its membership known when its robots spawn. `generateRobotAudioBaseline` and
  `generateCompanyRosterBaseline` must mirror whatever spawn does.
- **What stays fresh for a member.** Today a copy still draws its own name, colour, gem, volume and sends.
- **Which robots start Active** (today a seeded 2–4 at full battery), now that a company starts together.
- **Company sizes:** 2–3 companies of 3–4 as today, or different now that size decides how many robots inherit.
- **The Robot Load cap.** A company of four fills a low cap, first come first served, so the section and its handover
  shrink to the cap.
- **Sequencing.** It changes every world's melodies, so it lands before backlog
  [45](../todo/backlog.md#45-off-screen-crawfords-three-preset-links), the last change meant to touch generation.
