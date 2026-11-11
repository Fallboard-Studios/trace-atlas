# Implementation Plan: Company Families — Part B of No Silence and Company Families

Source spec: [docs/specs/NO_SILENCE_AND_COMPANY_FAMILIES.md](../specs/NO_SILENCE_AND_COMPANY_FAMILIES.md), Part B
(§1.9–§1.11, §5.7, §7.3–§7.5). Source intent:
[docs/intent/no-silence-and-company-families.md](../intent/no-silence-and-company-families.md). Backlog
[73](../todo/backlog.md#73-robots-a-seeded-company-is-a-family).

**Status:** plan written 2026-11-11, overnight at Crawford's request, from his answers to B1–B11. **Not started, and
not to be started before Part A's Gate B passes** (spec §0). It is built on **its own branch from `main`, after
Part A merges** (Crawford, 2026-11-11). B12–B15 answered at Gate A: every default stands.

## Overview

Every seeded company becomes a family: its lowest-index member founds it, and the others inherit the founder's voice,
onset pattern (note lengths included) and five sends, while keeping their own notes, volume, battery size and start.
A quarter of members move one or two onsets in the measure. Nine tasks in four phases:

1. **The rhythm stream** (Tasks 1–3). Onsets and durations get their own seeded stream, keyed on a rhythm seed and the
   two rhythm settings; a pure `moveOnsets`; spawn and `regenerateMelody` build both streams. Every world's melodies
   change once, at Task 3. No families yet.
2. **Families** (Tasks 4–6). Membership drawn before spawn with the two-freelancer cap; members inherit at spawn and
   the baselines mirror it; the deal derives a member from its founder.
3. **Docs** (Task 7).
4. **Gate C** (Task 8): Crawford's ear. Then the records (Task 9).

## Architecture Decisions

- **Two streams, one order** (spec §1.11, assumption 1). `generateMelodyForRobot` gains `rhythmRand`, defaulting to
  `rand`. Onsets and each event's duration draw from `rhythmRand`, in the positions they draw from today, so a caller
  that passes one stream gets today's melody bit for bit (Task 1 is parity for every existing caller). The duration
  is one draw per event (`pickDurationForGap`), so a founder's and a member's duration draws stay aligned even when a
  member's onset moves.
- **The rhythm seed lives on the robot** (spec assumption 6): `Robot.lineage?: { founderIndex, rhythmSeed,
  movedOnsets }`, members only. An original reads its composition seed as its rhythm seed and its own roster index as
  its founder. A robot moved by hand keeps its lineage (B15's default).
- **Membership is a pure function of the noise map** over roster indices (spec §1.11), run by `spawnInitialRoster`
  before any spawn, and turned into ids by `spawnInitialCompanies` and `generateCompanyRosterBaseline`. The draws stay
  plain `getSeededVal` (spec assumption 7); only their timing moves.
- **Spawn and its baseline land together** (Task 5). Splitting them would leave an untouched world saving overrides
  between commits, and the suite red.
- **The performance stream follows the rhythm seed** (B12's default) and lands with Task 3, where an original's rhythm
  seed equals its composition seed, so originals keep their rests and accents; members first exist at Task 5.
- **No import edges added.** `spawnSystem.ts` already imports the melody generator; `aspectDeal.ts` already reads the
  robots it deals.

## Dependency Graph

```
Task 1 (rhythmRand)    Task 2 (moveOnsets)
        └───────┬───────────┘
        Task 3 (spawn + regenerate build both streams; every melody changes)
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

- [ ] **Task 1: `melodyGenerator.ts` — `buildSeededRhythm` and `generateMelodyForRobot`'s `rhythmRand`**

  **Description:** `buildSeededRhythm(rhythmSeed, { rhythmicDensity, rhythmicMotifLength })` beside
  `buildSeededComposition`: an `alea` stream keyed on the seed and the two rhythm settings only (B7).
  `GenerateMelodyForRobotOptions.rhythmRand?`, defaulting to `rand`: `buildMotifOnsets` and every
  `pickDurationForGap` draw from it, in today's positions. No caller passes it yet.

  **Proof:** RED test — `src/engine/melodyGenerator.test.ts`: cases 1 and 2.

  **Acceptance criteria:**
  - [ ] `buildSeededRhythm` gives the same stream for a note-variance, octave or pitch-repeat change and a different
        one for a density, motif or seed change.
  - [ ] One rhythm stream with two different composition streams gives the same `startStep`s and lengths and
        different notes (on a seed where the notes do differ).
  - [ ] With no `rhythmRand`, every existing melody test passes unmodified (parity).
  - [ ] Mutants, killed: the rhythm key including note variance; durations left on `rand`.

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyGenerator.test.ts src/engine/regenerateMelody.test.ts src/systems/spawnSystem.test.ts`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate B of Part A.

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (one function, one option threaded through two call sites)

- [ ] **Task 2: `melodyGenerator.ts` — `moveOnsets`, applied in the measure**

  **Description:** A pure `moveOnsets(onsets, count, subdivisions, rand)`: moves `count` onset occurrences, each one
  step to a free neighbour (B13's default: if neither neighbour is free, skip it and try the next occurrence), and
  returns them sorted. `GenerateMelodyForRobotOptions.onsetMoves?: { count; rand }` applies it after `buildMotifOnsets`
  and before the pitch-lock plan and the durations.

  **Proof:** RED test — `src/engine/melodyGenerator.test.ts`: case 3, and a melody built with a move.

  **Acceptance criteria:**
  - [ ] Exactly `count` occurrences move, each by one step, never onto another onset or off the measure; the onset
        count and the sort order hold; count 0 returns the input unchanged; the same stream gives the same moves.
  - [ ] A motif-tiled melody with a move still builds (the pitch-lock plan copes with an onset off its cell grid), and
        its event count is unchanged.
  - [ ] Mutant, killed: a two-step move allowed.

  **Verification:**
  - [ ] `npx vitest run src/engine/melodyGenerator.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None (beside Task 1).

  **Files:** `src/engine/melodyGenerator.ts`, `src/engine/melodyGenerator.test.ts`

  **Estimated scope:** S (one pure function, one option)

- [ ] **Task 3: spawn and `regenerateMelody` build both streams — every world's melodies change**

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
  - [ ] Spawn and regenerate agree for an original and for a hand-built robot with a lineage (moved onsets included).
  - [ ] A note-variance or octave edit leaves the onsets and lengths as they were; a density or motif edit moves them
        (B7).
  - [ ] An original's rests and accents are unchanged by this task (its rhythm seed is its composition seed).
  - [ ] The full suite runs before this commit: any test pinned to a spawned melody's exact notes or onsets is
        re-pinned in this commit, old → new named in the message.

  **Verification:**
  - [ ] `npm test` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1 and 2.

  **Files:** `src/types/Robot.ts`, `src/systems/spawnSystem.ts`, `src/engine/regenerateMelody.ts`, their tests, and
  any test re-pinned

  **Estimated scope:** M (two call sites; the blast radius is the pinned melodies)

### Checkpoint: the rhythm stream
- [ ] `npm run build:types`, `npm run lint`, `npm test` clean.
- [ ] Every world's melodies changed once and nothing else did: no session, link or lifecycle test moved except the
      re-pins named in Task 3.
- [ ] Reviewed with human before Phase 2 (a listen: originals only, every melody new).

---

### Phase 2: Families

- [ ] **Task 4: `spawnSystem.ts` — `generateCompanyMembership`, with two freelancers at least**

  **Description:** `FREELANCERS_MIN = 2` in `src/constants/index.ts`. A pure `generateCompanyMembership(noiseMap):
  number[][]` from `spawnInitialCompanies`' draws in their order, over roster indices, with B4's cap and B14's
  default (a company that cannot reach `COMPANY_SIZE_MIN` is not made). `spawnInitialCompanies` and
  `generateCompanyRosterBaseline` turn it into ids. Then a Run: how many of the 121 grid worlds the cap changes.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`: case 5. Run — the count of worlds the cap touches,
  recorded in this file's Results.

  **Acceptance criteria:**
  - [ ] On every grid world the cap does not touch, the membership equals today's (computed by the test from the
        retired path's draws, not by calling the new function).
  - [ ] No world has fewer than two freelancers or a company under three; repeatable.
  - [ ] The session tests pass: an untouched world still saves `{}`.
  - [ ] Mutant, killed: the cap at one freelancer.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts src/systems/aspectDeal.test.ts`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 3.

  **Files:** `src/constants/index.ts`, `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`

  **Estimated scope:** S

- [ ] **Task 5: members inherit at spawn, the baselines mirror it, and the copy roll goes**

  **Description:** `spawnInitialRoster` computes the membership first and passes each member its founder (the
  company's lowest index, B6). `spawnRobot` copies the founder's inherited fields (spec §1.9) and its five sends from
  the store, sets `lineage` (founder's index, founder's composition seed as rhythm seed, `movedOnsets` from one even
  draw at `'robot.onsetMoves'`: < 0.75 none, < 0.875 one, else two), and draws everything else as an original. The
  copy roll (`'robot.copyChance'`, `'robot.copySource'`) goes from `spawnRobot` and `generateRobotAudioBaseline`.
  `generateRobotRosterBaseline` gives a member its founder's baseline with its own name and volume.
  Between this task and Task 6, `initializeLocale`'s `applyAspectDeal` still re-derives a dealt member from its own
  index, live and in the baseline alike, so the session diff stays `{}` but a dealt member differs from its founder
  until Task 6. This task's grid cases therefore check `spawnInitialRoster`'s output before the deal.

  **Proof:** RED test — `src/systems/spawnSystem.test.ts`, `src/utils/sessionDiff.test.ts`: cases 6, 7, 9 and 10.

  **Acceptance criteria:**
  - [ ] Over the grid: every member's inherited fields and sends equal its founder's; its onsets and lengths equal the
        founder's when `movedOnsets` is 0, and differ in exactly that many onsets otherwise; its notes are its own;
        founders and freelancers carry no lineage.
  - [ ] The `'robot.onsetMoves'` shares over the grid's members land within sampling error of 75 / 12.5 / 12.5 %.
  - [ ] No spawn draws `'robot.copyChance'` or `'robot.copySource'` (a spy on the draw).
  - [ ] An untouched world saves `robotOverrides: {}` on every grid world; a member moved by hand keeps its lineage,
        and its melody does not change.
  - [ ] `buildSimRoster` still matches spawn (`lifecycleSim.test.ts` passes unmodified).
  - [ ] Mutants, killed: the founder taken as the highest index; the sends left fresh.

  **Verification:**
  - [ ] `npm test` passes (spawn changes every world's roster).
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.test.ts`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M (spawn and its baseline in one commit)

- [ ] **Task 6: `aspectDeal.ts` — a member is dealt from its founder**

  **Description:** `applyAspectDeal`, `applyDealToBaselines` and `rederiveLoading` derive a robot's dealt fields from
  `lineage.founderIndex` when it has one. In the live deal the founder is dealt first (lower index), and a member's
  LFO lanes are the founder's.

  **Proof:** RED test — `src/systems/aspectDeal.test.ts`: case 8.

  **Acceptance criteria:**
  - [ ] After `applyAspectDeal`, and after an aspect change through `rederiveLoading`, every member's dealt fields
        equal its founder's.
  - [ ] An untouched dealt world still saves `{}`; a member moved by hand and then re-dealt takes its new company's
        pick, derived from its own lineage (B15's default; the 2026-11-01 rule).
  - [ ] Mutant, killed: the deal by own index.

  **Verification:**
  - [ ] `npx vitest run src/systems/aspectDeal.test.ts src/systems/aspectDeal.widened.test.ts src/systems/spawnSystem.test.ts src/utils/sessionDiff.test.ts`
        passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/systems/aspectDeal.ts`, `src/systems/aspectDeal.test.ts`

  **Estimated scope:** S

### Checkpoint: built
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean.
- [ ] Every case of spec §5.7 passes and was written RED first; each mutant named, killed, in a commit.
- [ ] Reviewed with human before the docs.

---

### Phase 3: Docs

- [ ] **Task 7: the docs — COMPANIES.md, MELODY_SYSTEM.md, PROCEDURAL_GENERATION.md**

  **Description:** COMPANIES.md: a seeded company is a family, the founder, what members share and keep, the
  two-freelancer floor, the deal by founder, moves by hand. MELODY_SYSTEM.md: the rhythm stream, durations with it,
  the moved onsets, B7's side effect, the performance stream on the rhythm seed. PROCEDURAL_GENERATION.md:
  `'robot.onsetMoves'` (even), the two retired keys, membership drawn before spawn. Every identifier checked against
  the shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No sentence describes the 30 % copy roll as live.
  - [ ] Every name and number matches the shipped source and this file's Results.

  **Verification:**
  - [ ] Manual review.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `docs/COMPANIES.md`, `docs/MELODY_SYSTEM.md`, `docs/PROCEDURAL_GENERATION.md`

  **Estimated scope:** S

### Phase 4: Gate C

- [ ] **Task 8: Gate C — Crawford's ear**

  **Description:** On the built branch in a browser: a world with three companies. Does a company read as a section and
  not as one louder robot; do the moved onsets read as a part and not a mistake; do shared rests and accents (B12)
  suit a section. The agent's part is a list of grid worlds with three companies, from the tests' membership.

  **Proof:** Ear — Crawford's. No test file.

  **Acceptance criteria:**
  - [ ] His words are recorded in the spec's "As built" and here; B12–B15 are answered or left at their defaults by
        his word.
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
| A moved onset breaks the pitch-lock plan's cell assumptions | Medium | Task 2's second criterion builds a motif-tiled melody with a move and checks the event count. |
| Spawn and baseline disagree for a frame of history, and a world saves overrides | High | Task 5 lands both in one commit, with the `{}` check over every grid world. |
| The cap changes membership in some worlds unexpectedly | Low | Task 4 measures how many and records it; the remaining worlds are checked against today's membership. |
| A member's references to the founder's records get mutated by a later edit | Low | Every edit replaces the record (spec §1.10); Task 5's hand-moved case and the session tests exercise edits. |
| A robot moved by hand is re-dealt from the wrong index | Medium | Task 6's second criterion; B15 is asked again at Gate C. |

## Open Questions

From the spec's §7.5. **All answered by Crawford on 2026-11-11: every default stands.** Gate C still hears them.

1. **B12. Rests and accents in a company.** **Resolved: shared** (the rhythm seed's performance stream).
2. **B13. How far a moved onset moves.** **Resolved: one step** to a free neighbour.
3. **B14. The two-freelancer cap when a company cannot reach three.** **Resolved: not made**; Task 4 measures how many worlds it touches.
4. **B15. A robot moved by hand into another company.** **Resolved: keeps its own lineage.**
5. **The branch.** **Resolved: its own, from `main` after Part A merges.**

## Results

Filled in by Tasks 4 and 8.

### The cap (Task 4)

*Not yet measured.*

### Gate C (Task 8)

*Not yet heard.*
