# Implementation Plan: Even World Draws

Source spec: [docs/specs/EVEN_WORLD_DRAWS.md](../specs/EVEN_WORLD_DRAWS.md). Source intent:
[docs/intent/even-world-draws.md](../intent/even-world-draws.md). Backlog slot:
[46](../todo/backlog.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement), plan.md
Stage 4. Build branch: `fix/even-world-draws` off `main` at `fe0c9166`. The visual half of backlog 47
([docs/tasks/EVEN_SEEDED_DRAWS.md](EVEN_SEEDED_DRAWS.md)), whose plan shape this follows.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`. The measuring
harness (spec §5.2) is a temporary `src/utils/zzWorldSpread.test.ts`, run as `npx vitest run src/utils/zzWorldSpread.test.ts`
(it writes its JSON to the session scratchpad; no environment variable), deleted before every commit. The lifecycle
report (spec §5.3) is the repo's own switch: `$env:LIFECYCLE_SIM_REPORT='1'; npx vitest run src/systems/lifecycleSim.test.ts`
(`it.runIf(process.env.LIFECYCLE_SIM_REPORT)` in that file), so that one command carries an environment variable on
purpose.

The planning skill's default output paths (`tasks/plan.md`, `tasks/todo.md`) are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".

## Overview

Every world and visual pick in five files (spec §1.3) moves from `getSeededVal` to `getUniformSeededVal` with its
dataId and offset unchanged, and two bell-era workarounds go (spec decision 4). The three smooth walks (spec §1.4) do
not move. The tasks go one generator at a time, robots first because they are the most looked at, and **every commit
leaves the suite green**:

- Phase 0 records the timing baseline (T0).
- Phase 1 switches the robots, the companies and the roster (T1–T3), then Crawford's first look.
- Phase 2 switches placement and the light shafts (T4–T6), then his second look and the station decision.
- Phase 3 re-measures (T7); any tuning he asks for lands as N1, N2, … before the docs.
- Phase 4 is the docs (T8–T10).

Each task names its **Proof** (TASK_TEMPLATE.md): a RED test for every task that changes behaviour (T1–T6), a run for
T0 and T7, a Read for T8–T10. One commit per task, subjects `even-world T<n>: …`. RED first, then green, and every new
test is mutation-checked: put the plain draw back and see the test fail, then restore it. No docs guards and no source
scans (CLAUDE.md, 2026-10-23).

## Architecture Decisions

- **The call site changes its function name, nothing else.** `getUniformSeededVal` already takes `min` / `max` (47's
  T1), so `getSeededVal(noiseMap, id, offset, min, max)` becomes `getUniformSeededVal(noiseMap, id, offset, min, max)`.
  The dataId and offset stay the draw's identity (spec §3 "Always"), with one exception, next.
- **`ACCENT_PAIR_OFFSET` goes and the accent primary draws at offset 0** (spec decision 4, Q2). The constant existed
  only to dodge the offset-0 collapse (spec §1.1: 192 values at offset 0, 14 of 18 hues); the even draw at offset 0
  reaches all 18 hues at 4.6–6.7 %. This is the one departure from "same offset", recorded in the spec.
- **The derelict re-hash goes** (Q2). `alea(String(rawRoll))()` in `districts.ts`'s `rollDerelict` lifted a 14.4 %
  raw share to 24.9 %; the even draw realises 25.2 % on its own, so the compare becomes `draw < ratio` directly.
- **Spawn's and the sim's roster draws move in one task** (T3). `spawnInitialRoster` and `buildSimRoster` make the same
  two draws (`roster.activeCount`, `roster.dockedBattery`); ROBOT_LIFECYCLE.md says the sim matches spawn robot for
  robot, and `lifecycleSim.test.ts`'s grid cases prove the no-silence rule on the sim. Both move, or neither.
- **The light shafts' seeded geometry becomes one exported pure function** in `LightShafts.tsx`
  (`seedLightShafts(noiseMap): { dir, shafts: { x, w, depth }[] }`), and the component calls it. The distribution test
  (spec §5.1) then runs 3,000 maps without 3,000 renders. It is a small extraction for testability, not a cache and not
  a performance change (spec §3 "Ask first" is about those); the render tests stay as they are.
- **The live UI name rolls keep their fake noise map.** `CompanyCrudControls.tsx`'s `suggestCompanyName` and
  `sessionStore.ts`'s `nextSaveName` call `generateCompanyName(() => Math.random() * 2 - 1, 0)`. Under the even draw
  that map is sampled three times per word and hashed, which is still a fair random name, so the production code does
  not change. The two tests that steer it through a `Math.random` mock change their lever (T2): six samples per name
  instead of two, and a "coincidental" name is computed from the same constant map rather than written as index 0.
- **Tests steer the even draws through `src/testUtils/seededDraws.ts`** (47's T3): a `constantNoiseMap(-1)` or
  `noiseMapForDataIds` stub drives `getUniformSeededVal` to a band's min, middle or max once the file mocks
  `getSeededVal` with `steerSeededDraws`. `spawnSystem.test.ts` and `robotSendsParity.test.ts` already do; a file that
  spies on `getSeededVal` by module namespace (`districts.test.ts`, `factoryPlacementSystem.test.ts`) moves its spy to
  `getUniformSeededVal`.
- **A test that pins a plain-era value is updated to the new behaviour in the task whose switch breaks it, never
  deleted.** A fixed id, name or membership, a captured parity roster, a recorded oracle row's id column, a plot picked
  because it happened to have a trait: each is re-captured from the shipped code, or re-seeded explicitly
  ([[parity-test-fixture-non-default-values]]). The probe below says which task owns which. The one deletion is the
  test whose subject is removed by decision: "samples the primary at a fixed non-integer offset" goes with
  `ACCENT_PAIR_OFFSET`, replaced by a test of what replaces it.
- **The station overlap is a decision, not a re-pin** (Risks; Checkpoint B). The probe shows one grid world where a
  station box overlaps a midground silhouette after the switch. `stations.test.ts` says the property "is not
  guaranteed by placement; it holds over the grid (measured 2026-10-08)". Crawford decides at Checkpoint B whether
  stations gain the silhouettes as an obstacle (a `stations.ts` change, Ask first), or the look is fine and the test
  pins the measured count. T5 does not touch `stations.ts`.

## The probe (2026-11-11, during planning)

The five files' plain draws were switched to the even draw in the working tree, the full suite run once, and the files
reverted (`git checkout`; nothing committed). Of 13,864 tests, 24 fail in 10 files. The first attempt also rewrote
three import paths and failed 47 files to load; that run is discarded. The real fallout:

| File | Fails | Cause | Owner |
|---|---|---|---|
| `src/systems/robotSendsParity.test.ts` | 6 | the (b) oracle rows are keyed `[id, sends]`; the ids move, the sends do not | T1 |
| `src/systems/spawnSystem.test.ts` | 6 | `generateCompanyMembership … exactly today's` ×3 (the `todaysMembership` helper re-draws with `getSeededVal`); `PARITY_TIERS` and the three spawned ids (re-captured at every even-draws switch, by their own comment); "some are stamped" at plot (7, 11), whose members changed with the membership | T1 (ids), T2 (the rest) |
| `src/stores/sessionStore.test.ts` | 1 | `nextSaveName` steered by two `Math.random` values; six now | T2 |
| `src/components/company/CompanyCrudControls.test.tsx` | 1 | the coincidental name written as `ADJECTIVES[0] COMPANY_NOUNS[0]` | T2 |
| `src/utils/sessionDiff.test.ts` | 1 | "the last eligible pair: a send" landed on `gritSend` not `shimmerSend`: the eligible pairs follow the membership | T2 |
| `src/systems/factoryPlacementSystem.test.ts` | 5 | the `factory.spacing` spy; the non-integer-offset test; `preLean`'s own `getSeededVal` re-draw of the AS shift (×2); the rowless fallback test bounding the AS contribution by ±30 (82.6 with the lean) | T4 |
| `src/systems/districts.test.ts` | 1 | the `actor.derelict` spy | T5 |
| `src/systems/stations.test.ts` | 1 | station 2 at (−160, −120) overlaps a midground silhouette | T5 → Checkpoint B |
| `src/systems/jobCoverage.test.ts` | 1 | "top-ups … only in districts whose recipes fall short": `dense` now needs one somewhere on the grid; the coverage guarantee itself (the case before it) passes | T5 |
| `src/systems/workSites.test.ts` | 1 | searches the grid for two hosts sharing an id at different x; even ids rarely collide | T5 |

Green in the probe, so no repair expected: `lifecycleSim.test.ts` (both grid cases, the no-silence guarantee
included), `LightShafts.test.tsx`, `spawnSystem.families.test.ts`, `worldLinkBoot.test.ts`, every aspect-deal and
session file not named above.

## Dependency Graph

```
T0 (timing baseline)
 │
T1 robot identity ── T2 companies ── T3 roster (spawn + sim, the cover-sim table)
                                        │
                                 Checkpoint A (Crawford's look 1: roster, names, colours)
                                        │
T4 factoryPlacementSystem ── T5 districts ── T6 LightShafts
                                        │
                                 Checkpoint B (look 2: skyline and light; the station decision)
                                        │
                        T7 after-measurements + timings ── Checkpoint C ── N1… (tuning, if asked)
                                        │
                     T8 PROCEDURAL_GENERATION ── T9 BUILDING_DESIGN + ROBOT_LIFECYCLE + COMPANIES ── T10 backlog + plan.md
```

Phases 1 and 2 touch different source files and could run in either order after T0. They run in the numbered order
so the robots, which are the most looked at, reach a checkpoint first. Inside a phase the tasks are sequential
because they share test files.

## Task List

### Phase 0: The baseline

- [x] **Task 0: Timing baseline on the branch base**

  **Description:** Spec §5.4. A temporary `src/utils/zzWorldTiming.test.ts` times, after a warm-up, the median of 200
  runs of (a) `spawnInitialRoster` plus `placeDistrict` for one registered locale and (b) `seedLightShafts`' future
  equivalent, which before T6 is the component's render over a registered locale (one `render(<LightShafts />)`).
  Record both medians here under "T0: timings (before)". The before-table of spreads is spec §1.1 and is not measured
  again. Delete the harness before the commit.

  **Proof:** Run — the numbers, copied into this record. No test file is committed.

  **Acceptance criteria:**
  - [ ] The record holds the two timings.
  - [ ] The commit contains only this plan's record.

  **Verification:**
  - [ ] `git status` shows no `zz*` file staged.

  **Dependencies:** None.

  **Files:** `docs/tasks/EVEN_WORLD_DRAWS.md` (the record)

  **Estimated scope:** XS (a run and a record)

---

### Phase 1: Robots, companies and the roster (locale map)

Every task here runs the generator it changes over seeded locale maps (`createNoise2D(alea(\`${x}:${y}\`))`, the
`simNoiseMap` helper in `lifecycleSim.ts`), about 400 maps × 12 robots for a per-robot key and 3,000 maps for an
offset-0 key. The RED test is a spread today's draw cannot reach. A pinned value this switch breaks is re-captured or
re-seeded in the same commit (the probe table).

- [x] **Task 1: spawnSystem.ts — a robot's name, identity colour, gem seed, id and spawn position draw even**

  **Description:** In `generateRobotName`, `generateRobotIdentityColor`, `generateGemSeed`, `generateRobotId` and
  `generateSpawnPosition`, switch the seven draws (`robot.name.adj`, `robot.name.noun`, `robot.identityColor`,
  `robot.gem.seed`, `robot.id`, `spawn.pos.x`, `spawn.pos.y`). The clamps stay (spec §4). Rewrite the comments that
  say "the noise sampler can return exactly max" and the id comment's "own row in the noise map".

  **Proof:** RED test — new `src/systems/spawnSystem.evenWorld.test.ts` (the `spawnSystem.even*.test.ts` pattern),
  over 400 maps × 12 robots through `generateRobotRosterBaseline` and `spawnRobot`: each of the ten adjectives and ten
  nouns names 10 ± 2 % of robots (today Iron 1.6 %, Tidal 1.7 %, Drifter 3.7 %, Pilot 3.4 %); each of the 18 hues is
  5.6 ± 1.5 % of robots (today the end hues 0.9 %); the gem seed takes more than 4,700 distinct values over 4,800
  robots; the spawn x and y each put 8–12 % in each outer tenth; the adjective index correlates under 0.1 with the hue
  index, and the noun index under 0.1 with the gem seed (today 0.962 and 0.881). The id keeps its shape
  (`robot-<spawnCount>-<8 base-36 chars>`) and the existing determinism cases pass unmodified.

  **Acceptance criteria:**
  - [ ] The seven draws are even, with dataIds and offsets unchanged.
  - [ ] The existing id-shape and same-coordinates determinism tests pass unmodified.
  - [ ] `robotSendsParity.test.ts`'s (b) rows: the id column is re-captured from the shipped code and **every send
    value is byte-identical to the recording**, asserted in the re-capture commit (the sends did not move, only the
    ids), with the file's header noting the second deliberate re-capture after T9a's.
  - [ ] `spawnSystem.test.ts`'s three spawned ids (the "ids, master volumes, densities and glides" case) are
    re-captured; the volumes, densities and glides are unchanged.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.evenWorld.test.ts src/systems/spawnSystem.test.ts src/systems/robotSendsParity.test.ts`
    passes; the full suite is green; the mutation check passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 0.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.evenWorld.test.ts`, `src/systems/spawnSystem.test.ts`,
  `src/systems/robotSendsParity.test.ts`

  **Estimated scope:** M (one source, one new test, two repairs with a parity claim to prove)

- [x] **Task 2: spawnSystem.ts — a company's name, id, identity colour and membership draw even**

  **Description:** In `generateCompanyName`, `generateCompanyId`, `generateCompanyIdentityColor` (attempt 0 and every
  retry dataId) and `generateCompanyMembership` (`company.count`, `company.size`, `company.member`), switch the draws.
  The collision-retry loop is unchanged. Rewrite the membership comment ("plain getSeededVal").

  **Proof:** RED test — `spawnSystem.evenWorld.test.ts`, over 3,000 maps through `generateCompanyMembership` and
  `generateCompanyRosterBaseline`: Null and Solar each name 10 ± 2 % of companies (today 0.2 %) and Collective and
  Syndicate 12.5 ± 2 % (today 3.0 %); every one of the 18 hues is some company's colour at 5.6 ± 1.5 % (today two
  never); two companies 50 ± 3 % of worlds and three the rest; size 3 and 4 at 50 ± 3 % each of first draws; every
  roster index is a member in 40–60 % of worlds (no index favoured). Spawn and the baseline still agree:
  `spawnInitialCompanies` produces `generateCompanyRosterBaseline`'s companies (the existing case, unmodified).

  **Acceptance criteria:**
  - [ ] The eight draws are even; the retry loop and the cap (`FREELANCERS_MIN`, `COMPANY_SIZE_MIN`) are untouched.
  - [ ] `spawnSystem.test.ts`: the `todaysMembership` helper draws even (so "exactly today's" means today's code);
    `PARITY_TIERS` and its roster indices are re-captured per that block's own comment; the "some are stamped" case
    picks a plot whose roster stamps both a rest and a mark and asserts that as a precondition.
  - [ ] `sessionStore.test.ts` "skips a suggestion that names a save": the `Math.random` mock yields 0 for the first
    six calls (one name) then 0.99; `suggestionAt(r)` is unchanged and the precondition still holds.
  - [ ] `CompanyCrudControls.test.tsx`: the coincidental name is `generateCompanyName(() => -1, 0)`, computed, not
    `ADJECTIVES[0] COMPANY_NOUNS[0]`; the guard case still proves what its comment says.
  - [ ] `sessionDiff.test.ts` "a re-deal keeps the swell riding a send": the precondition that the forced target is a
    send no Distance pick moves is re-established (a different `audioSwell.target.robot` steer, or a stated
    precondition on the new eligible pair), not weakened.
  - [ ] `spawnSystem.families.test.ts` passes unmodified (green in the probe); if the members-per-world range moves,
    re-pin it from the shipped grid with the range stated.

  **Verification:**
  - [ ] `npx vitest run src/systems/spawnSystem.evenWorld.test.ts src/systems/spawnSystem.test.ts src/systems/spawnSystem.families.test.ts src/stores/sessionStore.test.ts src/components/company/CompanyCrudControls.test.tsx src/utils/sessionDiff.test.ts`
    passes; full suite green; mutation check passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (same source and test files).

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/spawnSystem.evenWorld.test.ts`, `src/systems/spawnSystem.test.ts`,
  `src/stores/sessionStore.test.ts`, `src/components/company/CompanyCrudControls.test.tsx`, `src/utils/sessionDiff.test.ts`

  **Estimated scope:** M (one source, five test files to repair, each a fixture change)

- [x] **Task 3: spawnSystem.ts + lifecycleSim.ts — the roster's Active count and docked batteries draw even, and the cover-sim table is re-run**

  **Description:** Switch `roster.activeCount` and `roster.dockedBattery` in `spawnInitialRoster` and in
  `buildSimRoster`, in one commit. The `alea` fallbacks for a missing map stay. Then run the lifecycle report
  (Commands) and record the new "Both, shipped" row beside the old one under "T3: the cover-sim table"; the
  ROBOT_LIFECYCLE.md row itself is updated in T9. If any world has a silent measure, stop and report to Crawford
  (spec §5.3): that is a finding, not a number to re-pin.

  **Proof:** RED test — `src/systems/lifecycleSim.test.ts` (it already imports `buildSimRoster` and `simNoiseMap`):
  over 3,000 maps, two, three and four Active robots each start 33 ± 3 % of worlds (today 19.7 / 60.3 / 20.0 %); the
  docked batteries put 8–12 % in each outer tenth of 0–99 and take more than 2,500 distinct values; `buildSimRoster`'s
  docking and battery per index equal `spawnInitialRoster`'s for the same map (through `generateRobotRosterBaseline`'s
  companion, the way the sim's header promises). Guards, unmodified: "the Active count never reaches zero (case 7)"
  and "no world has a silent measure (case 17)" over the grid.

  **Acceptance criteria:**
  - [ ] Both files' two draws are even; the fallbacks are unchanged.
  - [ ] The two grid guards pass unmodified.
  - [ ] The report's new row is recorded here with the old row beside it.

  **Verification:**
  - [ ] `npx vitest run src/systems/lifecycleSim.test.ts src/systems/spawnSystem.test.ts` passes; full suite green;
    mutation check passes.
  - [ ] The report ran; its row is in the record.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/systems/spawnSystem.ts`, `src/systems/lifecycleSim.ts`, `src/systems/lifecycleSim.test.ts`,
  `docs/tasks/EVEN_WORLD_DRAWS.md` (the record)

  **Estimated scope:** S

### Checkpoint A: Robots, companies and the roster
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (note the count): types and lint clean; 13,878 passed,
  2 skipped, 1 failed of 13,881, the failure the documented `audioSwells` flake ("interpolates and returns to exactly
  baseValue"), 171/171 with the file alone.
- [ ] The harness's locale section re-run on the branch (not committed): every robot and company key above 2,500
  distinct values per 3,000 draws, zero pairs above 0.3, the list shares even. Figures in the record. **Not run at
  Checkpoint A**: Crawford passed the checkpoint on his look; T1–T3's committed spread tests cover the list shares,
  distinct counts and the named pairs, and T7 re-measures every key.
- [x] **Crawford's look 1** (spec §5.5): the roster, the names and the colours across a few fresh worlds (a Scan or two,
  and a link). Passed 2026-11-11 ("I like it"); nothing to narrow.

---

### Phase 2: Placement and the light (locale and style maps)

- [x] **Task 4: factoryPlacementSystem.ts — ids, spacing, the style shifts, the accent pair and pick draw even; `ACCENT_PAIR_OFFSET` goes**

  **Description:** Switch `generateFactoryId` (`factory.id`), the `spreadXs` centre-row `factory.spacing` multiplier,
  `deriveAsColorShiftFor` (both namespaces' `.as.hueShift` and `.as.satShift`), `pickAccentTargetFor` (`.as.accentPick`)
  and `deriveAsAccentPair` (`factory.as.accentPrimary`), the last at offset 0 with `ACCENT_PAIR_OFFSET` and its
  comment deleted (decision 4, Q2). The `Math.random` fallback in `spreadXs` stays. Rewrite the "same getSeededVal
  pattern" comment on `deriveAsColorShiftFor` and the spread guard's "change ACCENT_PAIR_OFFSET" comment.

  **Proof:** RED test — `src/systems/factoryPlacementSystem.test.ts`, over 3,000 style maps
  (`getAttenuationStyleNoiseMap` with an evict per style): the accent primary reaches all 18 hues at 5.6 ± 1.5 % (today
  16 of 18, two at 17–18 %); the hue shift puts 8–12 % of draws in each outer tenth of ±30 (today 0.2 %) and the sat
  shift likewise over ±20; the factory and scenery sat shifts at one index correlate under 0.1 (today 0.995); the
  accent pick is the primary for 50 ± 3 %; over 400 locale maps `factory.id` takes more than 3,900 distinct suffixes
  and `factory.spacing` fills 0.8–1.2.

  **Acceptance criteria:**
  - [ ] The six draws are even; the primary draws at offset 0; `ACCENT_PAIR_OFFSET` no longer exists.
  - [ ] Repairs, per the probe: the `factory.spacing` spy and `preLean`'s two re-draws move to `getUniformSeededVal`;
    the non-integer-offset test is replaced by "draws `factory.as.accentPrimary` once, at offset 0, through the even
    draw"; the rowless-fallback test isolates the local component by subtracting the exact AS contribution
    (`deriveAsColorShift(map, 0)`), not a ±30 bound; the spread guard keeps its threshold and loses its offset note.
  - [ ] The fixture-name preconditions ("two different styles draw different pairs", "pair B's primary is not pair
    A's") still hold, or a fixture name is swapped as those tests' own comments instruct.

  **Verification:**
  - [ ] `npx vitest run src/systems/factoryPlacementSystem.test.ts` passes; full suite green; mutation check passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Checkpoint A.

  **Files:** `src/systems/factoryPlacementSystem.ts`, `src/systems/factoryPlacementSystem.test.ts`

  **Estimated scope:** M (one source, one busy test file, one deletion by decision)

- [x] **Task 5: districts.ts — factory scale, scenery ids and the derelict roll draw even; the re-hash goes**

  **Description:** In `placeDistrict`, switch `factory.scale`, `scenery.id` and `actor.derelict`; `rollDerelict`
  compares the even draw against the ratio directly, its `alea(String(rawRoll))()` line and the comment explaining it
  deleted (decision 4, Q2).

  **Proof:** RED test — `src/systems/districts.test.ts`: over 200 `dense` placements the derelict share of
  derelict-capable actors is 25 ± 3 % (the existing 20-seed 0.15–0.35 case tightens to this, since the share no longer
  depends on a re-hash); `factory.scale` puts 8–12 % of factories in each outer tenth of 0.9–1.1 and correlates under
  0.1 with the factory id's draw (today 1.0); `scenery.id` takes more than 3,900 distinct suffixes over 4,000 scenery
  actors.

  **Acceptance criteria:**
  - [ ] The three draws are even; the re-hash is gone; row overrides (`derelict: 0` / `1`) still mark none / all.
  - [ ] Repairs, per the probe: the `actor.derelict` spy moves to `getUniformSeededVal`; `jobCoverage.test.ts`'s
    "only in districts whose recipes fall short" is re-pinned from the shipped grid **after** confirming the coverage
    guarantee case before it still passes; `workSites.test.ts`'s "two hosts sharing an id" builds its pair explicitly
    (two hand-built host actors with one id at different x) instead of searching the grid.
  - [ ] `stations.test.ts`'s overlap case is **not** re-pinned here: its failure (station 2 at (−160, −120)) is
    recorded for Checkpoint B's decision, and the suite is left red on that one case only if Crawford's decision is
    still pending at the commit, stated in the commit message. Prefer to reach Checkpoint B in the same session.
  - (`workSites.test.ts`'s repair landed in T4, whose `factory.id` switch broke it; see "T4: as built".)

  **Verification:**
  - [ ] `npx vitest run src/systems/districts.test.ts src/systems/jobCoverage.test.ts src/systems/workSites.test.ts src/systems/stations.test.ts`;
    full suite green apart from the station case if pending; mutation check passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 4.

  **Files:** `src/systems/districts.ts`, `src/systems/districts.test.ts`, `src/systems/jobCoverage.test.ts`,
  `src/systems/workSites.test.ts`

  **Estimated scope:** M

- [ ] **Task 6: LightShafts.tsx — the shafts' count, direction and geometry draw even, through one pure function**

  **Description:** Extract the five draws into an exported `seedLightShafts(noiseMap)` returning `{ dir, shafts }`
  (Architecture Decisions), switch them to even, and have the component call it. Rewrite the count comment's
  "same clamp pattern as pickDistrict" to say both are even.

  **Proof:** RED test — `src/components/panels/screen/worldView/LightShafts.test.tsx`: over 3,000 maps,
  `seedLightShafts` gives 3, 4 and 5 shafts each 33 ± 3 % of worlds (today 40.9 / 17.3 / 41.8 %) and each direction
  50 ± 3 %; the widths put 8–12 % in each outer tenth of 50–160 (today 0.5 %) and the depths likewise over 420–760.
  The existing render cases (3–5 polygons, one vertical and one 45° edge, the gradient, the omit threshold) pass
  unmodified.

  **Acceptance criteria:**
  - [ ] The five draws are even and live in `seedLightShafts`; the component renders what it returns.
  - [ ] The render tests pass unmodified.

  **Verification:**
  - [ ] `npx vitest run src/components/panels/screen/worldView/LightShafts.test.tsx` passes; full suite green;
    mutation check passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 5.

  **Files:** `src/components/panels/screen/worldView/LightShafts.tsx`, `src/components/panels/screen/worldView/LightShafts.test.tsx`

  **Estimated scope:** S

### Checkpoint B: Placement and the light
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` clean, apart from the station case if its
  decision is still open.
- [ ] The harness's placement, shaft and style sections re-run on the branch: every key above 2,500 distinct values,
  zero pairs above 0.3, the derelict and accent shares at their numbers. Figures in the record.
- [ ] **Crawford's look 2** (spec §5.5): the skyline and the light across a few fresh worlds, by day.
- [ ] **The station decision.** Shown: the world at (−160, −120), where station 2's box overlaps a midground
  silhouette. Options: (a) stations gain the midground silhouettes as an obstacle in `stations.ts` (a placement-rule
  change, its own task, Ask first); (b) the look is fine, and the test pins the measured overlap count over the grid
  with the world named. Recommended: look first, then (a) if a silhouette visibly draws through the station's back
  fragment, else (b).

---

### Phase 3: Measure

- [ ] **Task 7: After-measurements, timings and the plain-draw check**

  **Description:** Re-run the `zzWorldSpread` harness and the T0 timing harness on the branch head. Record the
  after-table beside spec §1.1's before-table (distinct counts, outer tenths, bucket shares, realised ratios, pair
  counts) and the two timings beside T0's. If either timing grew by more than 16 ms over T0's, stop and ask Crawford
  (spec §5.4; "growth" is his reading, T0's record). Grep
  the five §1.3 files for `getSeededVal(` and record that only `getSeededVal.ts`, the three walks and the
  `getUniformSeededVal` wrapper call it, as a check, not a test. Delete both harnesses.

  **Proof:** Run — recorded.

  **Acceptance criteria:**
  - [ ] The after-table and both timings are in the record.
  - [ ] No §1.3 call site uses the plain draw; the three walks still do.
  - [ ] The harnesses are gone.

  **Verification:**
  - [ ] `git status` is clean of `zz*` files.

  **Dependencies:** Task 6.

  **Files:** `docs/tasks/EVEN_WORLD_DRAWS.md` (the record)

  **Estimated scope:** XS

### Checkpoint C: Code complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean, the station case included (its
  decision made and, if (a), its task N0 built).
- [ ] The T7 record meets spec §6's measurable criteria.
- [ ] Any narrowing from the two looks becomes a task (N1, N2, …): a band, ratio or count change, or a
  `getCentredSeededVal` for one of spec §1.5's four bands, each with a RED guard on the new edge, one commit each.

---

### Phase 4: Docs

- [ ] **Task 8: PROCEDURAL_GENERATION.md — the world picks are even; the plain draw is for the three walks**

  **Description:** "Sampling Values": when to use each draw, with the plain draw named for `terrainProfile.ts`,
  `localeTemperature.ts` and `localeTemperatureStep.ts` only. "Call Sites": every row for a §1.3 draw says even; the
  `company.count / size / member` row loses "plain draws"; the Gotchas lose the `ACCENT_PAIR_OFFSET` collapse guard and
  gain one line on why it went. Spot-check every name against the shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] No row calls a world pick bell-curved, and no row describes a removed workaround.

  **Verification:**
  - [ ] Manual review against source; `npm run lint` clean.

  **Dependencies:** Checkpoint C.

  **Files:** `docs/PROCEDURAL_GENERATION.md`

  **Estimated scope:** XS

- [ ] **Task 9: BUILDING_DESIGN.md, ROBOT_LIFECYCLE.md, COMPANIES.md — placement, the roster table, seeded companies**

  **Description:** BUILDING_DESIGN.md: the accent pair's offset note (step 1 of the lean) and the derelict roll's
  re-hash go; `factory.spacing` and `factory.scale` are even. ROBOT_LIFECYCLE.md: the seeded roster (2–4 Active a
  third each, batteries 0–99 even) and the cover-sim table's "Both, shipped" row replaced by T3's recorded row, the old
  row kept as history with its date. COMPANIES.md: the seeded spawn-time generation sentence says even. Spot-check
  every number against T3's record and the source.

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] Every number matches the record and the shipped code.

  **Verification:**
  - [ ] Manual review; `npm run lint` clean.

  **Dependencies:** Task 8.

  **Files:** `docs/BUILDING_DESIGN.md`, `docs/ROBOT_LIFECYCLE.md`, `docs/COMPANIES.md`

  **Estimated scope:** S (docs only)

- [ ] **Task 10: backlog 46 and plan.md — the record, then the archive**

  **Description:** Backlog 46's status line says built and passed, with the branch and the commit; plan.md's Stage 4
  line stays until the merge. After Crawford's merge, 46 moves whole to `archive/backlog-archive.md` under a Closed
  line (the archive conventions: links rebased, no stub, inbound links repointed), its plan.md line is deleted, and the
  spec's Status line says shipped. The second half is its own commit on a docs branch off `main` after the merge.

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] Before the merge: the status line. After: the archive entry, no dangling `backlog.md#46-` link in `docs/`.

  **Verification:**
  - [ ] A grep over `docs/` for the old anchor finds nothing after the archive commit.

  **Dependencies:** Task 9 (status); Crawford's merge (archive).

  **Files:** `docs/todo/backlog.md`, `docs/todo/plan.md`, `docs/todo/archive/backlog-archive.md`,
  `docs/specs/EVEN_WORLD_DRAWS.md`

  **Estimated scope:** XS

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every automated acceptance criterion above is met; the T3 and T7 records are in this file.
- [ ] Docs reflect the shipped draws, every name spot-checked against source.
- [ ] Both looks done and passed, the station decision made; anything not looked at this session is flagged here.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| A station overlaps a midground silhouette on a grid world after placement moves (probe: (−160, −120), station 2) | Medium: a silhouette may draw between the station's back fragment and the robots | Not re-pinned; Checkpoint B's decision, with option (a) a placement-rule task (Ask first) |
| The no-silence guarantee was measured on the plain roster | High if silence returns | The rule is structural; the probe shows both grid guards green; T3 re-runs the report and stops on any silence |
| `robotSendsParity.test.ts` says NEVER RE-RECORD | Medium: a re-capture could hide a send regression | T1 re-captures the id column only and asserts every send value equals the old recording |
| The live UI name rolls (`Math.random` as a noise map) steered by two mocked values | Low | The lever becomes six samples per name; the production call sites do not change |
| A test passes by picking a world that happens to have a trait (plot (7, 11)'s stamps, the id-collision pair, the swell's eligible pair) | Medium: silent coverage loss | Each re-seeds explicitly and asserts the precondition ([[parity-test-fixture-non-default-values]]) |
| `getUniformSeededVal` hashes four times per draw; `LightShafts` draws on every render while visible | Low | T0 and T7 time it; 16 ms is the Ask-first line; the shaft geometry is already one pure function if a memo is ever wanted |
| Saved sessions lose their robot and company overrides when their world regenerates | Accepted (spec decision 1) | Nothing; the preset links are re-pasted at launch |
| The even tints read stronger than today (hue realised about ±15 of ±30) | Low: a look item | Checkpoint B's look; a centred draw per band is a one-line N-task |

## Open Questions

1. Even or centred for the four neutral-middle bands. **Resolved** (spec decision 4): even, all four; a centred draw
   is an N-task if a look asks for it.
2. Remove the derelict re-hash and `ACCENT_PAIR_OFFSET`. **Resolved** (spec decision 4): both go, in T5 and T4.
3. The station overlap at (−160, −120). **Open** — Crawford, at Checkpoint B, after seeing the world.

## Record

### T0: timings (before)

2026-11-11, branch base `83af2b15`, jsdom under Vitest, one locale at (17, −23), hour 12, median of 200 runs after
20 warm-up runs, two runs of the harness:

| Measure | Run 1 | Run 2 |
|---|---|---|
| (a) `spawnInitialRoster` + `placeDistrict` (the locale's robots, actors and companies cleared before each run) | 16.88 ms | 16.84 ms |
| (b) one `render(<LightShafts />)` plus unmount | 0.585 ms | 0.580 ms |

(a) already sits above 16 ms on the plain draw (jsdom, store writes and melody registration included), so spec §5.4's
"grows past a frame (16 ms)" is ambiguous for it: growth by 16 ms, or crossing 16 ms. **Crawford, 2026-11-11: growth.**
T7 stops and asks only if a timing grows by more than 16 ms over this baseline (he does not care much about a span this
short).

### T1–T2: as built

- **T1** went as planned. `NOUNS` is exported for the test (the adjective list already was).
- **T2, the member case:** the plan's "every roster index is a member in 40–60 % of worlds" cannot hold: a 12-robot
  world puts about 8 robots in companies, so the mean share is 67 %. The case asserts what the plan meant, no index
  favoured: every index within 4 points of the mean over all twelve (plain draw: index 0 at 35 % against a 67 % mean).
- **T2, count and size:** their shares were already right on the plain draw (spec §1.1), so the RED for them is a joint
  case, the four (count, first size) pairs at 25 ± 3 % each (plain: 2:3 at 30.7 %). Either draw alone put back on the
  plain draw passes every case: with two outcomes split at the middle and everything else even, a lone plain count or
  size is fair and unwelded. Recorded as equivalent mutants; both switches stay (spec §1.3).
- **T2, `PARITY_TIERS`:** robots 4 and 50 became company members, and no original in the 51-robot roster pairs a shaped
  release with Shimmer. The tiers are now five originals: 7 (step attack, Shimmer), 13 (lowpass accent, Grit; one LFO
  lane moved), 14 (ripple attack and step release, Grit; unchanged), 16 (bandpass accent, Double), 28 (the one glider).
  The case asserts each is an original first.
- **T2, the stamped plot:** (7, 11) lost its rests under the new membership; (1, 1) stamps rests on 7 robots and marks
  on 9. The swell in `sessionDiff.test.ts` lands on Grit now (was Shimmer); the precondition asserts it against
  `ASPECT_FAMILIES.distance.keys`.

### T3: the cover-sim table

2026-11-11, the repo's report (`LIFECYCLE_SIM_REPORT`), the 121-world grid at 6,000 measures a world. ROBOT_LIFECYCLE.md's
columns; T9 replaces its row with the new one and keeps the old as history.

| Row | Silent measures | Worlds with a stay | Stays / 1,000 measures | Stay length (median, p90, longest) | Sounding (mean, p10–p90) | Cycle lengths |
|---|---|---|---|---|---|---|
| Both, shipped (0.67–1.5), plain roster draws (ROBOT_LIFECYCLE.md today) | none | 118 / 121 | 0.81 | 2, 5, 9 | 5.41, 3–8 | 27–53 (15) |
| **Both, shipped (0.67–1.5), even roster draws (T3)** | **none (0 / 121 worlds)** | **114 / 121** | **0.75** | **2, 5, 10** | **5.41, 3–8** | **27–53 (15)** |

No world has a silent measure, so no stop (spec §5.3). The report's other rows on the even draws, for the record: flat
0 / 121 silent, stays in 42 / 121; 0.9–1.1 in 98 / 121; 0.8–1.25 in 102 / 121; all with no silence.

As built: the plan's "the docked batteries take more than 2,500 distinct values" cannot hold, since a battery is a
whole number 0–99; the case asserts every whole value from 0 to 99 occurs, with the outer tenths. The plan's existing
parity case (one plot, (40, −80)) draws the same Active count on both draws, so a spawn-only revert of the count
survived it; a second parity case over 30 grid worlds (every Active count among them) kills it.

### T4: as built

- **The file steers its draws** through `steerSeededDraws` (`vi.mock`), so the spacing and accent-primary call checks
  read `getUniformSeededVal`'s calls and `pickAccentTarget`'s threshold case uses `constantNoiseMap` (min, just under
  0.5, exactly 0.5, max); a real map passes through to the real draw. A clamp case pins the primary's band ends to the
  first and last accent hue.
- **The accent pick's 50 % share passes on the plain draw too** (a bell centred on 0.5 still splits evenly), so the
  pick reverted alone survived. Added: the factory and scenery picks at one index agree in 50 ± 3 % of styles, and each
  is uncorrelated with its family's hue shift; that kills it.
- **`recolor-lean-beta` drew pair A swapped** (31.1 / 40.8 against 40.8 / 31.1), so every factory stayed on a hue of
  A and "off the old one" found none. Style B is now `recolor-lean-c` / `recolor-lean-gamma` (185.8 / 198.1; the map is
  seeded by the name and cached by the id), and the precondition asserts the two pairs share no hue, not only that the
  primaries differ.
- **The rowless fallback test** now asserts the exact fold (`foldBodyShift` of the fallback row's local shift, the
  style's `deriveAsColorShift(map, 0)` and its accent pick for factory 0), not a ±30 bound. A fallback row of 0 instead
  of 1 survives it: `dense` rows 0 and 1 are both `['Skyscraper']`, so the fixture cannot tell them apart. That gap
  predates T4 (the ±30 bound had it too); a fallback district of `habitat` is killed.
- **`workSites.test.ts`'s "two hosts sharing an id" moved here from T5**: `factory.id` going even is what broke it
  (the full suite's only failure after the switch). It now clones a grid host to a second x with the same id, with
  the precondition that the clone still hosts; keying the site cache by id fails it.
- Mutants killed: each of the six draws put back on the plain draw, the primary at offset 0.37.

### T5: as built

- **The sample** is 200 real `dense` placements, placed once on first use: 8,013 derelict-capable actors (factories
  and tank/dome/scaffold scenery; `DERELICT_CAPABLE_KINDS` is exported for the test), over 5,000 factories and 2,000
  scenery. The plan's "more than 3,900 distinct over 4,000 scenery" is asserted as its ratio, more than 97.5 %
  distinct over every scenery actor placed (plain draw: 76.9 %).
- **The derelict share case is not a RED**: the old plain draw plus re-hash already realised about 25 %. The RED is the
  call check (now on the even draw), and the share case kills the plain draw without the re-hash; it also asserts no
  non-capable actor is ever derelict.
- **The scale/id correlation case passes before the switch**: T4 made `factory.id` even, which already broke the 1.0
  correlation. It stays as a guard; the scale's outer tenths (plain: 3.7 %) are its RED.
- **`jobCoverage.test.ts`'s "only in districts whose recipes fall short" passes** after the switch, so it is not
  re-pinned; the probe's failure came from the T4 and T5 draws together, and T4 alone did not fail it either.
- **The station case is open**: `stations.test.ts` fails on world (−160, −120), station 2 (box from x 551), as the
  probe said. It is the full suite's only failure (13,888 passed, 2 skipped, 1 failed of 13,891); Checkpoint B's
  decision.
- Mutants killed: the derelict roll on the plain draw with and without the re-hash, the capable-kind check dropped,
  `scenery.id` and `factory.scale` on the plain draw.

### Checkpoint A / B: the harness sections

Checkpoint A: passed by Crawford's look, 2026-11-11; the harness section was not run (see the checkpoint). His answers
the same day: the 16 ms line is growth (T0's record), and the `audioSwells` flake is removed (its own commit).

Checkpoint B: (to be recorded)

### T7: after-measurements and timings

(to be recorded beside spec §1.1)
