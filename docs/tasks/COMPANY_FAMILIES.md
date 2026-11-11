# Implementation Plan: Company Families — Part B of No Silence and Company Families

Source spec: [docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md](../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md), Part B
(§1.9–§1.11, §5.7, §7.3–§7.6). Source intent:
[docs/intent/no-silence-and-company-families.md](../intent/no-silence-and-company-families.md). Backlog
[73](../todo/backlog.md#73-robots-a-seeded-company-is-a-family).

**Status:** plan written 2026-11-11, overnight at Crawford's request, from his answers to B1–B11. Building on
`feature/company-families` from `main` after Part A merged (PR #623). B12–B15 answered at Gate A: every default
stands. **Phase 1 (Tasks 1–3) built 2026-11-11; at its checkpoint Crawford revised the rhythm (spec §7.6, B16–B19):
the same settings in one world make the same rhythm, and the moved onsets go. Tasks 3a and 3b reworked Phase 1 to
that (built 2026-11-11; 3a's coincidence Run shown to Crawford and accepted). Stopped at the rhythm-stream
checkpoint; Crawford listened ("sounds good") and the checkpoint passed. Task 4 built 2026-11-11 (the cap touches 34
of 121 grid worlds); Tasks 5 and 6 built the same day. Phase 2 is built, and the "built" checkpoint passed
(Crawford: "sounds good"). Task 7 (the docs) written 2026-11-11 and waiting for Crawford's read; then Task 8
(Gate C).**

## Overview

Every seeded company becomes a family: its lowest-index member founds it, and the others inherit the founder's voice,
rhythm settings and five sends, while keeping their own notes, volume, battery size and start. A rhythm belongs to
the world and the rhythm settings (B16), so a member plays its founder's onsets and note lengths exactly, and any robot
set to the same settings joins them. Eleven tasks in four phases:

1. **The rhythm stream** (Tasks 1–3, then 3a–3b). Onsets and durations get their own seeded stream. As first built
   (Tasks 1–3) it was keyed on a rhythm seed on the robot, with a pure `moveOnsets` for a quarter of members; the
   revision keys it on the world and the rhythm shape (Task 3a) and cuts the moved onsets (Task 3b). Every world's
   melodies change at Task 3 and again at Task 3a. No families yet.
2. **Families** (Tasks 4–6). Membership drawn before spawn with the two-freelancer cap; members inherit at spawn and
   the baselines mirror it; the deal derives a member from its founder.
3. **Docs** (Task 7).
4. **Gate C** (Task 8): Crawford's ear. Then the records (Task 9).

## Architecture Decisions

- **Two streams, one order** (spec §1.11, assumption 1). `generateMelodyForRobot` gains `rhythmRand`, defaulting to
  `rand`. Onsets and each event's duration draw from `rhythmRand`, in the positions they draw from today, so a caller
  that passes one stream gets today's melody bit for bit (Task 1 is parity for every existing caller).
- **The rhythm is the world's and the shape's** (B16, B17, B19; Task 3a). `buildSeededRhythm(worldKey, attrs)` keys on
  the world's coordinates and the rhythm shape (onsets per cell and motif length, or onsets per measure), which one
  exported function computes for the key and the generator alike. Nothing per robot is in it. *Superseded:* the first
  build's rhythm seed on the robot (Tasks 1 and 3).
- **The lineage is the founder's index only** (spec assumption 6, Task 3a): `Robot.lineage?: { founderIndex }`,
  members only, read by the deal (Task 6). A robot moved by hand keeps its lineage (B15).
- **One recipe** (Task 3): `composeRobotMelody` in `regenerateMelody.ts`, which spawn and `regenerateMelody` both call,
  so they agree by construction. It takes the world key; `regenerateMelody` and spawn find it from the locale's
  coordinates (the locale id when the locale is not in the store, as in a unit test with a mocked store).
- **Membership is a pure function of the noise map** over roster indices (spec §1.11), run by `spawnInitialRoster`
  before any spawn, and turned into ids by `spawnInitialCompanies` and `generateCompanyRosterBaseline`. The draws stay
  plain `getSeededVal` (spec assumption 7); only their timing moves.
- **Spawn and its baseline land together** (Task 5). Splitting them would leave an untouched world saving overrides
  between commits, and the suite red.
- **The performance stream follows the rhythm** (B19, Task 3a): keyed on the world key and the shape, so robots that
  share a rhythm and the same Rests and Accents values rest and accent together. *Superseded:* the rhythm seed (Task 3).
- **One import edge added** (Task 3): `spawnSystem.ts` imports `composeRobotMelody` from `regenerateMelody.ts`, which
  reaches nothing spawn did not already import. `aspectDeal.ts` already reads the robots it deals.

## Dependency Graph

```
Task 1 (rhythmRand)    Task 2 (moveOnsets)
        └───────┬───────────┘
        Task 3 (spawn + regenerate build both streams; every melody changes)
                │
        Task 3a (the rhythm on the world and the shape; every melody changes again)
                │
        Task 3b (the moved onsets removed)
                │
        Task 4 (membership + the cap)
                │
        Task 5 (members inherit; baselines mirror; copy roll retired)
                │
        Task 6 (the deal by founder)
                │
        Checkpoint: built
                │
        Task 7 (docs) ── Task 8 (Gate C: ear) ── Task 9 (records)
```

## Task List

Every task names its **Proof**: **RED test** for behaviour, **Run** for a measurement, **Ear** for Crawford's listen,
**Read** for docs. No file-text tests (CLAUDE.md). Case numbers are the spec's §5.7. One commit per task.

### Phase 1: The rhythm stream

- [x] **Task 1: `melodyGenerator.ts` — `buildSeededRhythm` and `generateMelodyForRobot`'s `rhythmRand`**

  **Description:** `buildSeededRhythm(rhythmSeed, { rhythmicDensity, rhythmicMotifLength })` beside
  `buildSeededComposition`: an `alea` stream keyed on the seed and the two rhythm settings only (B7).
  `GenerateMelodyForRobotOptions.rhythmRand?`, defaulting to `rand`: `buildMotifOnsets` and every
  `pickDurationForGap` draw from it, in today's positions. No caller passes it yet.

  **Proof:** RED test — `src/engine/melodyGenerator.test.ts`: cases 1 and 2.

  **Acceptance criteria:**
  - [x] `buildSeededRhythm` gives the same stream for a note-variance, octave or pitch-repeat change and a different
        one for a density, motif or seed change.
  - [x] One rhythm stream with two different composition streams gives the same `startStep`s and lengths and
        different notes (on a seed where the notes do differ).
  - [x] With no `rhythmRand`, every existing melody test passes unmodified (parity).
  - [x] Mutants, killed: the rhythm key including note variance; durations left on `rand`.

  **As built:** two literal parity pins (free, and tiled with Pitch Repeat) captured from the generator before the
  change. One extra mutant, killed: tiled onsets left on `rand`. The note-variance mutant showed that two rhythm seeds
  can share a tiled pattern by chance (a 4-step cell with two onsets has six), so the "onsets follow the rhythm
  stream" case compares six seeds.

  **Verification:**
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts src/engine/regenerateMelody.test.ts src/systems/spawnSystem.test.ts`
        passes (454).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; 4 warnings, none in these files).

  **Dependencies:** Gate B of Part A.

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (one function, one option threaded through two call sites)

- [x] **Task 2: `melodyGenerator.ts` — `moveOnsets`, applied in the measure** *(removed by Task 3b, B18)*

  **Description:** A pure `moveOnsets(onsets, count, subdivisions, rand)`: moves `count` onset occurrences, each one
  step to a free neighbour (B13's default: if neither neighbour is free, skip it and try the next occurrence), and
  returns them sorted. `GenerateMelodyForRobotOptions.onsetMoves?: { count; rand }` applies it after `buildMotifOnsets`
  and before the pitch-lock plan and the durations.

  **Proof:** RED test — `src/engine/melodyGenerator.test.ts`: case 3, and a melody built with a move.

  **Acceptance criteria:**
  - [x] Exactly `count` occurrences move, each by one step, never onto another onset or off the measure; the onset
        count and the sort order hold; count 0 returns the input unchanged; the same stream gives the same moves.
  - [x] A motif-tiled melody with a move still builds (the pitch-lock plan copes with an onset off its cell grid), and
        its event count is unchanged.
  - [x] Mutant, killed: a two-step move allowed.

  **As built:** a move never lands on a step another onset started on, not only on one occupied now, so every move
  reads as one step from its own onset and a count past what can move moves what can (`[0, 1, 2, 3]` with two moves
  gives `[0, 1, 2, 4]`). The occurrences are tried in a seeded order; one draw picks the side when both are free. The
  pitch-lock plan needed no change: it locks only positions that have an onset in the first cell, so a locked note
  always finds its base note. The melody cases run full and half Pitch Repeat and check each duration fits its moved
  gap. The two-step mutant failed 6 tests.

  **Verification:**
  - [x] `npx vitest run src/engine/melodyGenerator.test.ts` passes (170).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; the same 4 warnings).

  **Dependencies:** None (beside Task 1).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (one pure function, one option)

- [x] **Task 3: spawn and `regenerateMelody` build both streams — every world's melodies change** *(the rhythm seed,
  the moves and the performance stream on the rhythm seed reworked by Task 3a)*

  **Description:** `Robot.lineage?` in `src/types/Robot.ts` (doc comment in `gemSeed`'s manner; nothing sets it
  yet). `spawnRobot` and `regenerateMelody` build the rhythm stream from `lineage?.rhythmSeed ?? compositionSeed`
  with the robot's density and motif, the composition stream as today, `onsetMoves` from `lineage?.movedOnsets` with
  an `alea` stream on the composition seed and `onsetMoves`, and the performance stream on the rhythm seed.
  **This is the commit where every world's melodies change.**

  **Proof:** RED test — `src/engine/regenerateMelody.test.ts` and `src/systems/spawnSystem.test.ts`: case 4 (an
  untouched spawned robot's `regenerateMelody` reproduces its spawn melody), and a spawned robot's onsets equal
  `generateMelodyForRobot` driven by `buildSeededRhythm` on its seed (fails while spawn still draws onsets from the
  composition stream).

  **Acceptance criteria:**
  - [x] Spawn and regenerate agree for an original and for a hand-built robot with a lineage (moved onsets included).
  - [x] A note-variance or octave edit leaves the onsets and lengths as they were; a density or motif edit moves them
        (B7).
  - [x] An original's rests and accents are unchanged by this task (its rhythm seed is its composition seed).
  - [x] The full suite runs before this commit: any test pinned to a spawned melody's exact notes or onsets is
        re-pinned in this commit, old → new named in the message.

  **As built:** one recipe, `composeRobotMelody(robot)` in `regenerateMelody.ts`, builds a melody from a robot's
  stored fields (the rhythm, composition, move and performance streams); `regenerateMelody` and `spawnRobot` both call
  it, so spawn and regenerate agree by construction, lineage or not (spawn imports it from `regenerateMelody.ts`, an
  import edge the architecture note did not foresee; it reaches nothing new, as spawn already imports the engine and
  the locale store). It lives there rather than in `melodyGenerator.ts` so its call to `generateMelodyForRobot` crosses
  a module, where `robotOptionsActions.test.ts`' and `regenerateMelody.test.ts`' spies on that export still see it.
  The move stream is `alea(`${compositionSeed}:onsetMoves`)`. The RED cases: B7 edits (free and tiled), a lineage
  robot's rhythm, notes, shared stamps and moves, and every robot of two spawned rosters playing `buildSeededRhythm` on
  its own seed. Mutants, killed: the performance stream on the robot's own seed; the move stream on the rhythm seed;
  the rhythm stream on the robot's own seed; the rhythm stream left off (12 tests). Re-pins, each a rebuild of a
  spawned or regenerated melody from one stream, given the rhythm stream: `spawnSystem.test.ts` (the Phase 31
  mechanism pin; "every robot of a real roster…"; "rests and accents at their seeded values…"),
  `regenerateMelody.test.ts` ("with rests and accents absent…"), `sessionDiff.test.ts` (the NORMALIZED-value restore;
  the Robot Performance T15 round trip). No test outside those melody rebuilds moved.

  **Verification:**
  - [x] `npm test` passes (351 files; 13,763 passed, 2 skipped; 227 s).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; the same 4 warnings).

  **Dependencies:** Tasks 1 and 2.

  **Files:** `src/types/Robot.ts`, `src/systems/spawnSystem.ts`, `src/engine/regenerateMelody.ts`, their tests, and
  any test re-pinned

  **Estimated scope:** M (two call sites; the blast radius is the pinned melodies)

- [x] **Task 3a: the rhythm on the world and the shape — every world's melodies change again**

  **Description:** Spec §1.11 as revised (B16, B17, B19). In `melodyGenerator.ts`, an exported `rhythmShape(density,
  motif, subdivisions?)` (the motif length and onsets per cell with tiling on, the onsets per measure with it off),
  used by `generateMelodyForRobot` for its onset counts and by `buildSeededRhythm(worldKey, attrs)` for its key, which
  drops the rhythm seed and keys on the world key and the shape. In `regenerateMelody.ts`, `composeRobotMelody(robot,
  worldKey)` builds the rhythm stream from the world key and the performance stream from the world key and the shape,
  and a `melodyWorldKey(localeId)` gives `${x}:${y}` from the locale's coordinates, or the locale id when the store
  has no such locale; `regenerateMelody` and `spawnRobot` both use it. `Robot.lineage` shrinks to
  `{ founderIndex }`; the recipe stops reading it. `onsetMoves` is no longer passed (Task 3b removes it).
  **This is the commit where every world's melodies change again.**

  **Proof:** RED test — `src/engine/melodyGenerator.test.ts` (case 1 as revised, rewriting Task 1's key cases),
  `src/engine/regenerateMelody.test.ts` (case 3, rewriting Task 3's lineage cases) and `src/systems/spawnSystem.test.ts`
  (every spawned robot's onsets and lengths are `buildSeededRhythm` on its world's coordinates). Run — over the 121
  grid worlds, how many have two or more robots sharing a rhythm shape (before families, so every match is a
  coincidence), recorded in this file's Results.

  **Acceptance criteria:**
  - [x] Two densities with the same onset count give the same stream; a motif length changed while tiling is off gives
        the same stream; an onset count, motif length, tiling or world change gives a different one; note variance,
        pitch repeat and octave never enter it.
  - [x] In one world, robots with different composition seeds and one shape play the same onsets and lengths and,
        with the same Rests and Accents, the same stamps; their notes are their own. Another world plays a different
        rhythm. A robot edited to another's density and motif plays its rhythm.
  - [x] A Rests edit still only adds or removes rests (the four-draw contract holds on the new key).
  - [x] Spawn and regenerate still agree on every robot of a spawned roster; the session and link tests pass.
  - [x] Mutants, killed: the key on the raw density; the key without the world; the performance stream on the robot's
        own seed.
  - [x] Every test that pins a melody built the Task 3 way is re-pinned in this commit, old → new named in the message.

  **As built:** `rhythmShape` returns `{ cellLength, onsets }` (`cellLength` null with tiling off); a private
  `rhythmKey` joins the world key, `cell<n>` or `free`, and the onset count, and `buildSeededRhythm` and
  `buildSeededPerformance` both take `(worldKey, { rhythmicDensity, rhythmicMotifLength })` and hash that key with
  their own tag. `generateMelodyForRobot` takes its onset counts from `rhythmShape` (Task 1's parity pins still pass,
  so one-stream callers are unchanged). `melodyWorldKey(localeId)` and `composeRobotMelody(robot, worldKey)` live in
  `regenerateMelody.ts`. The nested-rests case shows a lighter Rests value rests on a subset of a heavier one between
  two robots of one rhythm. Mutants, killed: the key on the raw density (3 tests); the key without the world (7); the
  performance stream on the robot's own seed (2); and an extra, spawn passing the locale id instead of the world key
  (7). Rewritten, not re-pinned: Task 1's `buildSeededRhythm` cases and the `buildSeededPerformance` suite (new
  signature), Task 3's lineage cases (now case 3). Re-pinned: the six Task 3 melody rebuilds (`spawnSystem.test.ts`
  ×3, `sessionDiff.test.ts` ×2, `regenerateMelody.test.ts` ×1) now take the world key; two `applyPerformanceMarks`
  cases take the new builder; and `regenerateMelody.test.ts`' "two robots with different compositionSeeds are stamped
  differently", which B19 makes false, became "the same robot in two worlds is stamped differently". The Run is in
  Results: 66 % of robots share a rhythm by coincidence; Crawford accepted it.

  **Verification:**
  - [x] `npm test` passes (351 files; 13,772 passed, 2 skipped; 227 s).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; the same 4 warnings).

  **Dependencies:** Task 3.

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/regenerateMelody.ts`, `src/systems/spawnSystem.ts`,
  `src/types/Robot.ts`, their tests, and any test re-pinned

  **Estimated scope:** M (one key, one recipe; the blast radius is the pinned melodies again)

- [x] **Task 3b: the moved onsets removed**

  **Description:** B18. `moveOnsets`, `GenerateMelodyForRobotOptions.onsetMoves` and their tests (Task 2's) go from
  `melodyGenerator.ts` and its test file. Nothing calls them after Task 3a.

  **Proof:** none: the task only deletes (CLAUDE.md). The suite, types and lint passing show nothing used them; stated
  in the commit.

  **Acceptance criteria:**
  - [x] No `moveOnsets` or `onsetMoves` left in `src/`.

  **As built:** 221 lines removed, all of them Task 2's (45 in the generator, its 176 in the test file; 23 tests).

  **Verification:**
  - [x] `npm test` passes (351 files; 13,749 passed, 2 skipped; 237 s); `npm run build:types`, `npm run lint` clean
        (lint: 0 errors; the same 4 warnings).

  **Dependencies:** Task 3a.

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** XS

### Checkpoint: the rhythm stream
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (Task 3's run).
- [x] Every world's melodies changed once and nothing else did: no session, link or lifecycle test moved except the
      re-pins named in Task 3 (the two session tests that moved rebuild a restored melody).
- [x] Reviewed with human (2026-11-11): Crawford revised the rhythm before listening (spec §7.6); Tasks 3a–3b added.
- [x] After Task 3b: `npm run build:types`, `npm run lint`, `npm test` clean; nothing moved but Task 3a's re-pins.
- [x] Reviewed with human before Phase 2 (a listen: originals only, every melody new; robots sharing a shape play
      together, and an edit to another robot's density and motif joins its rhythm). Crawford, 2026-11-11: "sounds
      good".

---

### Phase 2: Families

- [x] **Task 4: `spawnSystem.ts` — `generateCompanyMembership`, with two freelancers at least**

  **Description:** `FREELANCERS_MIN = 2` in `src/constants/index.ts`. A pure `generateCompanyMembership(noiseMap):
  number[][]` from `spawnInitialCompanies`' draws in their order, over roster indices, with B4's cap and B14's
  default (a company that cannot reach `COMPANY_SIZE_MIN` is not made). `spawnInitialCompanies` and
  `generateCompanyRosterBaseline` turn it into ids. Then a Run: how many of the 121 grid worlds the cap changes.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: case 5. Run — the count of worlds the cap touches,
  recorded in this file's Results.

  **Acceptance criteria:**
  - [x] On every grid world the cap does not touch, the membership equals today's (computed by the test from the
        retired path's draws, not by calling the new function).
  - [x] No world has fewer than two freelancers or a company under three; repeatable.
  - [x] The session tests pass: an untouched world still saves `{}`.
  - [x] Mutant, killed: the cap at one freelancer.

  **As built:** `generateCompanyMembership(noiseMap, rosterSize = MAX_ROBOTS)`: the roster size is a parameter
  because `generateCompanyRosterBaseline` is called with id lists of other lengths (16 in the band-table tests, 10 in
  its purity test). Each company lists its members in draw order, so the founder (Task 5) is the minimum, not the
  first. `generateCompanyRosterBaseline` maps the indices to ids, and `spawnInitialCompanies` now makes its companies
  from that baseline, so the live and the replayed membership agree by construction; its `alea` fallback went with
  the old loop (it ran only with no locale, where the pool was empty). The touched-world case checks that the earlier
  companies are today's and the last is a prefix of today's or gone; a smaller roster (5 robots: at most one company
  of three; 4: none) and a larger one (16: never capped) are covered. Mutants, killed: the cap at one freelancer (4
  tests); the "not made" guard removed (2). The Run is in Results.

  **Verification:**
  - [x] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/systems/aspectDeal.test.ts`
        passes (with `aspectDeal.widened.test.ts`: 694). `npm test` passes too (351 files; 13,758 passed, 2 skipped;
        228 s), run because world (0, 0) is one the cap touches.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3b.

  **Files:** `src/constants/index.ts`, `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S

- [x] **Task 5: members inherit at spawn, the baselines mirror it, and the copy roll goes**

  **Description:** `spawnInitialRoster` computes the membership first and passes each member its founder (the
  company's lowest index, B6). `spawnRobot` copies the founder's inherited fields (spec §1.9) and its five sends from
  the store, sets `lineage: { founderIndex }`, and draws everything else as an original; no new draw (B18 cut
  `'robot.onsetMoves'`). The member's rhythm is the founder's because its density and motif are (B16). The copy
  roll (`'robot.copyChance'`, `'robot.copySource'`) goes from `spawnRobot` and `generateRobotAudioBaseline`.
  `generateRobotRosterBaseline` gives a member its founder's baseline with its own name and volume.
  Between this task and Task 6, `initializeLocale`'s `applyAspectDeal` still re-derives a dealt member from its own
  index, live and in the baseline alike, so the session diff stays `{}` but a dealt member differs from its founder
  until Task 6. This task's grid cases therefore check `spawnInitialRoster`'s output before the deal.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`, `src/utils/sessionDiff.test.ts`: cases 6, 7, 9 and 10.

  **Acceptance criteria:**
  - [x] Over the grid: every member's inherited fields and sends equal its founder's; its onsets and lengths equal the
        founder's exactly; its notes are its own in most members; founders and freelancers carry no lineage.
  - [x] No spawn draws `'robot.copyChance'` or `'robot.copySource'` (a spy on the draw).
  - [x] An untouched world saves `robotOverrides: {}` on every grid world; a member moved by hand keeps its lineage,
        and its melody does not change.
  - [x] `buildSimRoster` still matches spawn (`lifecycleSim.test.ts` passes unmodified).
  - [x] Mutants, killed: the founder taken as the highest index; the sends left fresh.

  **As built:** `spawnRobot(localeId, { …, founderIndex })` reads the founder from the store at that index and takes
  the copy branch's fields plus the five sends; with no robot there it spawns an original. `companyFounders(membership)`
  (member index → founder, the lowest index) is the one reading of the membership for `spawnInitialRoster` and
  `generateRobotRosterBaseline`, whose private `memberBaseline` is the founder's baseline with the member's own name and
  volume. `generateRobotAudioBaseline` is now an original's only. Cases 6, 7 and the hand move are in a new file,
  `src/systems/spawnSystem.families.test.ts` (its grid spawns 121 rosters, so it runs beside the big file in parallel);
  case 9's grid half is in `sessionDiff.test.ts` (1.7 s). A consequence the plan did not name: a roster baseline of
  any length now draws companies over that length, so a run of robots spawned alone (always originals) matches the
  chain of original baselines, not `generateRobotRosterBaseline`; three tests that compared the two were re-aimed to
  the chain. Mutants, killed: the founder as the highest index (328 tests); the sends left fresh at spawn (26) and in
  the baseline (28); extras: no lineage set (10); `spawnInitialRoster` passing no founders (42).

  Re-aimed, named in the commit: the copy-branch tests in `spawnSystem.test.ts` became member tests (spawned with
  `founderIndex`, or a real roster's membership); the B5 send cases were inverted (a member takes its founder's
  sends), and three copy-branch twins of roster cases were removed (a real roster now holds members, and those cases
  gained a "the roster has members" precondition); the deal tests that used a copy now use a
  member and still expect its own index (Task 6 flips them), and two deal loops skip members where the interim deal
  splits them from their founder. Re-pinned from the generator: the Classic parity roster's robot 1 and the three
  spawned robots' 1 and 2 (copies of robot 0 before, originals now), and the tiers (robot 4 now an original, robot 11 a
  member, so its tiers moved to originals 13 and 14; robot 50 one LFO lane). Value pins that recorded each index's own
  send draw (`generateRobotSends` parity, `robotSendsParity` (a)) now read the draw itself; no recording changed. The
  send-parity (b) cases expect each member's row to be its founder's recorded row, and the swell case sets robot 11 (a
  member) back to its own recorded sends first. `spawnSystem.evenCopies.test.ts` lost its 30 % copy-share case, and its
  two path cases read membership and the original chain.

  **Verification:**
  - [x] `npm test` passes (352 files; 13,768 passed, 2 skipped; 263 s).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; the same 4 warnings).

  **Dependencies:** Task 4.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M (spawn and its baseline in one commit)

- [x] **Task 6: `aspectDeal.ts` — a member is dealt from its founder**

  **Description:** `applyAspectDeal`, `applyDealToBaselines` and `rederiveLoading` derive a robot's dealt fields from
  `lineage.founderIndex` when it has one. In the live deal the founder is dealt first (lower index), and a member's
  LFO lanes are the founder's.

  **Proof:** RED test — `src/systems/aspectDeal.test.ts`: case 8.

  **Acceptance criteria:**
  - [x] After `applyAspectDeal`, and after an aspect change through `rederiveLoading`, every member's dealt fields
        equal its founder's.
  - [x] An untouched dealt world still saves `{}`; a member moved by hand and then re-dealt takes its new company's
        pick, derived from its own lineage (B15's default; the 2026-11-01 rule).
  - [x] Mutant, killed: the deal by own index.

  **As built:** a private `dealIndex(robot, i)` (`lineage.founderIndex ?? i`) serves `applyAspectDeal` and
  `rederiveLoading`'s `drawn`; `applyDealToBaselines`, whose baselines carry no lineage, reads the seeded membership
  (`companyFounders(generateCompanyMembership(noiseMap, robotIds.length))`), the same founders spawn set. The Motion
  lane tally is the one before the founder (`priorLanesOf(…, at)`), so a member's links are its founder's. Case 8 in
  `aspectDeal.test.ts`, every family dealt two picks: members equal founders (dealt fields and the regenerated rhythm)
  after `applyAspectDeal` on 31 grid worlds and after `rederiveLoading` on 12; the live deal equals
  `generateDealtRosterBaseline` robot for robot on 8 (a guard: it passed before the change too, both sides dealing by
  own index); and B15: a member of world (-200, 80) moved into a company dealt another pick takes that pick, its Melody
  fields `deriveMelodyFields` at its founder's index. Flipped from Task 5's interim (named in the commit): the deal
  cases in `spawnSystem.test.ts` and `aspectDeal.widened.test.ts` that expected every robot at its own index now expect
  the deal index, the two Task 5 member cases now expect the founder's index, and Task 5's two member skips are gone.
  Mutants, killed: the deal by own index everywhere (15 tests), and separately in the baseline (24), live (29) and the
  re-derive (20); extras: the lane tally at the member's own index, live (4) and in the baseline (3).

  **Verification:**
  - [x] `npx vitest run src/systems/aspectDeal.test.ts src/systems/aspectDeal.widened.test.ts src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts`
        passes (with `spawnSystem.families.test.ts`: 708). `npm test` passes (352 files; 13,772 passed, 2 skipped; 257 s).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; the same 4 warnings).

  **Dependencies:** Task 5.

  **Files:** `src/systems/aspectDeal.ts`, `src/systems/aspectDeal.test.ts`

  **Estimated scope:** S

### Checkpoint: built
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean (2026-11-11, after Task 6; the build to a
      scratch out dir).
- [x] Every case of spec §5.7 passes; each mutant named, killed, in a commit. Written RED first: cases 1–8 and the
      hand move of 9. Not RED, by their nature: case 9's `{}` over the grid and Task 6's live-versus-baseline case
      (guards: both sides moved together, so they passed before the change), and case 10 (`lifecycleSim.test.ts`
      passing unmodified). The nine §5.7 mutants: the rhythm key with note variance and durations on the composition
      stream (Task 1), the raw density, no world and the performance stream on the robot's seed (Task 3a), the cap at
      one freelancer (Task 4), the founder as the highest index and the sends left fresh (Task 5), the deal by own
      index (Task 6).
- [x] Reviewed with human before the docs. Crawford, 2026-11-11: "sounds good".

---

### Phase 3: Docs

- [x] **Task 7: the docs — COMPANIES.md, MELODY_SYSTEM.md, PROCEDURAL_GENERATION.md**

  **Description:** COMPANIES.md: a seeded company is a family, the founder, what members share and keep, the
  two-freelancer floor, the deal by founder, moves by hand, joining a rhythm by matching settings. MELODY_SYSTEM.md:
  the rhythm shape and stream on the world key, durations with it, B7's side effect, the performance stream on the
  world key and shape, `composeRobotMelody` as the one recipe. PROCEDURAL_GENERATION.md: the two retired keys,
  membership drawn before spawn. Every identifier checked against the shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [x] No sentence describes the 30 % copy roll as live (the two left name it retired; no other top-level doc
        mentions it).
  - [x] Every name and number matches the shipped source and this file's Results.

  **As built:** COMPANIES.md: the membership drawn first (`generateCompanyMembership`, `FREELANCERS_MIN`, the 34
  touched worlds), a new section "A seeded company is a family" (the founder, `companyFounders`, what a member
  inherits and keeps, the rhythm following from the settings, `Robot.lineage`, the baselines, joining a rhythm by
  hand, the 66 % coincidence), the deal by deal index (the paragraph that said a copy re-derives from its own index is
  gone), and two Forbidden Patterns lines. MELODY_SYSTEM.md: `rhythmRand` in the options, `rhythmShape` in the rhythm
  model, a new section "The rhythm stream (Company Families)" (the shape, the stream and its world key,
  `composeRobotMelody`, B7, the coincidences), the performance stream on the world key and shape, the spawn example
  rewritten around `composeRobotMelody`, the `shouldCopy` mentions replaced, and the testing notes. PROCEDURAL_GENERATION.md:
  the call-site rows (spawn: membership, the copy draws gone; melody: the three streams) and a "Company Families
  dataIds" table (the two retired keys; the company draws made earlier, unchanged). Two stale claims found while
  checking and corrected in passing: PROCEDURAL_GENERATION.md said `Math.random()` remained as spawn's no-noise-map
  melody fallback (spawn's fallback is `alea`), and MELODY_SYSTEM.md called the four Melody draws `getSeededVal`
  (they are `getUniformSeededVal`).

  **Verification:**
  - [ ] Manual review (Crawford's read).
  - [x] `npm run build:types`, `npm run lint` clean (lint: 0 errors; the same 4 warnings).

  **Dependencies:** Task 6.

  **Files:** `docs/COMPANIES.md`, `docs/MELODY_SYSTEM.md`, `docs/PROCEDURAL_GENERATION.md`

  **Estimated scope:** S

### Phase 4: Gate C

- [ ] **Task 8: Gate C — Crawford's ear**

  **Description:** On the built branch in a browser: a world with three companies. Does a company read as a section and
  not as one louder robot; do shared rests and accents (B19) suit a section; does setting a freelancer's density and
  motif to a company's make it join the section. The agent's part is a list of grid worlds with three companies, from
  the tests' membership.

  **Proof:** Ear — Crawford's. No test file.

  **Acceptance criteria:**
  - [ ] His words are recorded in the spec's "As built" and here; B14–B19 stand or change by his word.
  - [ ] If it fails: stop, report what he heard, offer options. Nothing is re-tuned to pass.

  **Dependencies:** Task 7.

  **Files:** `docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md`, this file

  **Estimated scope:** XS for the agent

- [ ] **Task 9: the records — backlog 73, plan.md, the spec's "As built"**

  **Description:** Backlog 73's status; plan.md's Stage 3 line; the spec's Part B "As built" (differences from §1.11,
  the mutants and their commits, the Run). Archive 73 if Crawford calls it done.

  **Proof:** Read. No test file.

  **Dependencies:** Task 8.

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md`

  **Estimated scope:** XS

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Task 3 changes every melody and many tests pin exact notes or onsets | Medium | The full suite runs before its commit; each re-pin is named old → new; nothing else is allowed to move (the checkpoint). |
| Durations on the rhythm stream change the draw order for one-stream callers | High | `rhythmRand` defaults to `rand` and draws in today's positions, so Task 1 is parity: every existing melody test passes unmodified. |
| Task 3a changes every melody a second time | Medium | As Task 3: the full suite first, each re-pin named old → new, nothing else allowed to move. |
| Coincidental matches make worlds sound more unison than intended | Low | B16 accepts them; Task 3a's Run counts them before families exist; Gate C hears a real world. |
| The world key differs between spawn and an edit, so an edit reshuffles a rhythm | High | One `melodyWorldKey(localeId)` serves both; Task 3a's spawn-then-regenerate case covers every robot of a roster. |
| Spawn and baseline disagree for a frame of history, and a world saves overrides | High | Task 5 lands both in one commit, with the `{}` check over every grid world. |
| The cap changes membership in some worlds unexpectedly | Low | Task 4 measures how many and records it; the remaining worlds are checked against today's membership. |
| A member's references to the founder's records get mutated by a later edit | Low | Every edit replaces the record (spec §1.10); Task 5's hand-moved case and the session tests exercise edits. |
| A robot moved by hand is re-dealt from the wrong index | Medium | Task 6's second criterion; B15 is asked again at Gate C. |

## Open Questions

From the spec's §7.5. **All answered by Crawford on 2026-11-11: every default stands.** Gate C still hears them.

1. **B12. Rests and accents in a company.** **Resolved: shared** (since B19, on the world key and the rhythm shape).
2. **B13. How far a moved onset moves.** **Resolved: one step** to a free neighbour. *Moot since B18: cut.*
3. **B14. The two-freelancer cap when a company cannot reach three.** **Resolved: not made**; Task 4 measures how many worlds it touches.
4. **B15. A robot moved by hand into another company.** **Resolved: keeps its own lineage.**
5. **The branch.** **Resolved: its own, from `main` after Part A merges.**
6. **B16–B19, the rhythm revised** (spec §7.6). **All answered yes on 2026-11-11:** the rhythm is the world's and the
   settings'; keyed on the shape, not the raw density; the moved onsets cut; the world in the key, and rests and
   accents shared by a rhythm.

## Results

Filled in by Tasks 3a, 4 and 8.

### Coincidental rhythms (Task 3a)

Measured 2026-11-11 on Task 3a's build (uncommitted), before families: `spawnInitialRoster` on each of the 121
`SIM_SEED_COORDS` worlds (1,452 robots, before the aspect deal), grouping robots by rhythm shape. A throwaway test,
not committed.

| | World key (B16–B19, as built) | Per-robot seed (Task 3's design, for comparison) |
|---|---|---|
| Worlds with two or more robots on one rhythm | 121 of 121 | 63 of 121 |
| Robots sharing a rhythm with another | 66 % | 14 % |
| Robots sharing, per world: median / max | 8 / 12 | 2 / — |
| Largest group | 9 robots | — |

Why so many: rhythms are thin. Median density is 17 % (p10 4, p90 65), so 914 of 1,452 robots (63 %) play one onset
per motif cell, and those shapes have few patterns (a 1-step cell with one onset is every step, identical under any
key). Only 50 shapes occur over the whole grid. World (40, 0) is the plainest case: twelve robots, four rhythms (shapes
5/1 ×4, 6/5 ×2, 8/1 ×3, free/2 ×3). The comparison column re-keys the same rosters on each robot's own seed; its
share counts identical onsets and lengths. The agent's estimate when B16 was put to Crawford ("roughly one world in
six" with a coincidental pair) was wrong by a wide margin. Stopped for Crawford before committing Task 3a, with four
options (accept; key on the company; a visible Pattern setting in the key; back to the per-robot seed). **Crawford,
2026-11-11: accept ("option 1, this sounds fine").** B16 stands as answered.

### The cap (Task 4)

Measured 2026-11-11 on Task 4's build: `generateCompanyMembership` against today's uncapped loop on each of the 121
`SIM_SEED_COORDS` worlds. A throwaway test, not committed.

| | Today (no cap) | With the cap (B4, B14) |
|---|---|---|
| Worlds with 2 / 3 companies | 50 / 71 | 68 / 53 |
| Worlds with 0 / 1 freelancers | 12 / 22 | 0 / 0 |
| Worlds with 2 / 3 / 4 / 5 / 6 freelancers | 31 / 6 / 11 / 25 / 14 | 47 / 6 / 29 / 25 / 14 |

**The cap touches 34 of 121 worlds**: in 18 the third company is not made (sizes 4-4-4 or 4-4-3 today), in 16 it is
cut from 4 to 3 (3-4-4 or 4-3-4 today). In every touched world the first two companies are today's. World (0, 0) is
one of the 18. With the cap, the members that inherit (company members less founders) number 4 to 7 a world, mean
5.95, median 6, as spec §1.9 expects.

### Gate C (Task 8)

*Not yet heard.*
