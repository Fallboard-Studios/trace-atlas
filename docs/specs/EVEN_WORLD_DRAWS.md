# Spec: Even World Draws — every world and visual pick is an even, independent draw

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`; one file: `npx vitest run <path>`
> - Dev server: `npm run dev`
> - The measurement (§5.2): a temporary `src/utils/zzWorldSpread.test.ts`, run as
>   `npx vitest run src/utils/zzWorldSpread.test.ts`, writing its JSON to the session scratchpad, deleted before every
>   commit

**Status:** shipped 2026-11-11 on branch `fix/even-world-draws`; Crawford passed both looks and called it done (spec
written and approved the same day). Backlog
[46](../todo/archive/backlog-archive.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement),
archived; the record is the plan's (T7: the after-table and timings). Intent: [docs/intent/even-world-draws.md](../intent/even-world-draws.md).
This is the visual half of backlog 47, Even Seeded Draws ([spec](EVEN_SEEDED_DRAWS.md), merged PR #596, 2026-11-02),
which moved every audio draw and left these for their own branch in case they needed different tuning. Plan: to be
[docs/tasks/EVEN_WORLD_DRAWS.md](../tasks/EVEN_WORLD_DRAWS.md) (approved the same day, decision 4).

Crawford's decisions (2026-11-11, the interview):

1. Every world and visual **pick** goes even, the ids included. Saved sessions losing their robot and company
   overrides when their world regenerates is accepted (pre-v1, no keep-existing constraint; the preset links of backlog
   45 are re-pasted at launch).
2. The two **smooth walks** stay on the plain draw: the terrain profile and both temperature draws (§1.4).
3. The gate is a measured after-table plus Crawford's look at a few fresh worlds. No side-by-side of old and new: the
   old spread was an accident, not a reference. Any tuning he asks for is its own task, after the look.
4. §7's two questions, answered 2026-11-11 as recommended: the four neutral-middle bands draw **even** (Q1), and both
   dead workarounds, the derelict re-hash and `ACCENT_PAIR_OFFSET`, are **removed** (Q2). Plan:
   [docs/tasks/EVEN_WORLD_DRAWS.md](../tasks/EVEN_WORLD_DRAWS.md).

---

## 1. Overview

### 1.1 What is wrong today

`getSeededVal(noiseMap, dataId, offset, min, max)` ([getSeededVal.ts](../../src/utils/getSeededVal.ts)) samples the
world's simplex noise at `(alea(dataId)(), offset)`. Every key's x is a hash in `[0, 1]`, so every key reads the same
small, smooth patch of one field, and the draw is bell-curved. 47's spec §1.1 measured the audio side; the world and
visual keys were measured on 2026-11-11 over 3,000 locale maps (`createNoise2D(alea(\`${x}:${y}\`))`, x and y in
−200..200) and 3,000 Attenuation Style maps, each key drawn at the offsets its generator uses:

- **Welded keys.** Of 66 pairs among the twelve per-index keys (the eight robot keys at offsets 0–11 and factory id,
  factory scale, scenery id and the derelict roll at 0–9), 37 correlate above 0.3. Of 325 pairs among all 26 locale
  keys read at one offset, 180 correlate above 0.3 and 74 above 0.9. Named: a robot's adjective and the scenery ids
  move as one (r 1.0), a robot's adjective and its spawn y (0.995), its identity colour and its spawn y (0.984), its
  id and the derelict roll (0.969), **its adjective and its identity colour (0.962)**, its noun and its gem seed
  (0.881); factory id and factory scale (1.0); on the style map, the factory and scenery sat shifts (0.995). Under the
  even draw, zero pairs reach 0.3 in any set.
- **Coarse at offset 0.** `roster.activeCount`, `company.count` and `atmos.shaft.count` each take 192 distinct values
  across 3,000 worlds; `atmos.shaft.dir` 500. The per-index keys take 2,100–5,650 of 36,000 (robots) or 470–4,700 of
  30,000 (placement); `factory.scale` 469.
- **Centre-heavy.** Each outer tenth of a band gets 0–4 % of draws instead of 10 % (`atmos.shaft.w` 0.5 %,
  `factory.as.hueShift` 0.2 %, so a ±30 hue band realises about ±15). For the list picks that means the first and
  last options rarely come up:
  - identity colour: the 18 hues at 0.9–9.3 % of robots each instead of 5.6 %, the two end hues 0.9 % each;
    for companies two hues never came up in 9,000 draws;
  - robot adjectives: Iron 1.6 %, Tidal 1.7 %, the middle six 12–16 %; robot nouns: Drifter 3.7 %, Pilot 3.4 %;
  - company adjectives: Null 0.2 %, Solar 0.2 %; company nouns: Collective 3.0 %, Syndicate 3.0 %;
  - the accent primary (at its 0.37 offset): 16 of the 18 hues, two never, two at 17–18 %.
- **Shares don't mean their numbers.** Worlds start with 2 / 3 / 4 Active robots 19.7 / 60.3 / 20.0 % of the time
  instead of a third each. Light shafts come 3 / 4 / 5 at 40.9 / 17.3 / 41.8 %. The derelict roll's raw compare
  against 0.25 fires 14.4 %; the `alea(String(rawRoll))()` re-hash in `districts.ts` is what lifts it to 24.9 %.
  `company.count`, `company.size`, the accent coin and the shaft direction sit at 0.5 and happen to be right.

The even draw, `getUniformSeededVal` (three samples at offset + 0, 137.42 and 911.77, hashed through `alea()`,
in use since 47 for every audio draw and for the district, stations and coverage picks), gives on the same runs
about 2,970 of 3,000 distinct values per offset-0 key and 35,000 of 36,000 per robot key, every tenth at 9.2–10.9 %,
every list option at its even share (hues 5.5–5.8 %, adjectives 9.3–10.4 %), Active counts 33.5 / 33.3 / 33.2 %,
shafts 33.1 / 33.6 / 33.2 %, the derelict roll 25.2 % with or without the re-hash, and no correlated pair.

### 1.2 What changes

Every in-scope draw (§1.3) moves from `getSeededVal` to `getUniformSeededVal` **with the same dataId and the same
offset**, so a draw stays named and placed exactly as before and only its distribution changes (47's rule). No new
draw function; `getSeededVal` itself does not change (the walks need it). The written shares then mean what they say:
the derelict ratio 0.25, the accent coin 0.5, the company count even over 2–3, the sizes over 3–4, the Active count
over 2–4, the shaft count over 3–5.

Two workarounds exist only because the plain draw was bell-curved or coarse, and become dead once their draws are
even. This spec proposes removing both; Crawford decides (§7 Q2):

- the derelict roll's re-hash, `alea(String(rawRoll))()` in `districts.ts`'s `rollDerelict`: the even draw realises
  25.2 % without it;
- `ACCENT_PAIR_OFFSET` (0.37) in `factoryPlacementSystem.ts`'s `deriveAsAccentPair`, a non-integer offset that dodged
  the offset-0 collapse: the even draw at offset 0 reaches all 18 hues at 4.6–6.7 %.

### 1.3 Scope: the picks

| File | Draws |
|---|---|
| [spawnSystem.ts](../../src/systems/spawnSystem.ts) | `generateRobotName` (`robot.name.adj`, `robot.name.noun`), `generateRobotIdentityColor` (`robot.identityColor`), `generateGemSeed` (`robot.gem.seed`), `generateRobotId` (`robot.id`), `generateSpawnPosition` (`spawn.pos.x`, `spawn.pos.y`), `generateCompanyName` (`company.name.adj`, `company.name.noun`), `generateCompanyId` (`company.id`), `generateCompanyIdentityColor` (`company.identityColor` and `company.identityColor.retryN`), `generateCompanyMembership` (`company.count`, `company.size`, `company.member`), `spawnInitialRoster` (`roster.activeCount`, `roster.dockedBattery`) |
| [lifecycleSim.ts](../../src/systems/lifecycleSim.ts) | `buildSimRoster` (`roster.activeCount`, `roster.dockedBattery`), the sim's copy of spawn's two draws, changed in the same task |
| [factoryPlacementSystem.ts](../../src/systems/factoryPlacementSystem.ts) | `generateFactoryId` (`factory.id`), `deriveAsColorShiftFor` (`factory.as.hueShift`, `factory.as.satShift`, `scenery.as.hueShift`, `scenery.as.satShift`), `deriveAsAccentPair` (`factory.as.accentPrimary`), `pickAccentTargetFor` (`factory.as.accentPick`, `scenery.as.accentPick`), the centre-row `factory.spacing` multiplier |
| [districts.ts](../../src/systems/districts.ts) | `placeDistrict`: `rollDerelict` (`actor.derelict`), `placeScenery` (`scenery.id`), the factory `factory.scale` |
| [LightShafts.tsx](../../src/components/panels/screen/worldView/LightShafts.tsx) | `atmos.shaft.count`, `atmos.shaft.dir` (offset 0), `atmos.shaft.x`, `atmos.shaft.w`, `atmos.shaft.depth` (per shaft) |

The style-map draws (`*.as.*`) read the Attenuation Style's noise map, so they move per style, not per locale; the
rest read the locale map. The no-noise-map fallbacks (`spawnInitialRoster`'s `alea` stand-ins, `factory.spacing`'s
`Math.random`) are unchanged.

### 1.4 Out of scope: the walks

| File | Draws | Why they stay plain |
|---|---|---|
| [terrainProfile.ts](../../src/systems/terrainProfile.ts) | `terrain.ridge.run`, `terrain.ridge.step`, `terrain.ground.run`, `terrain.ground.step` at the step index | consecutive indices sit one apart in the noise, so the ridge and the ground trend rather than jitter: the skyline wanted |
| [localeTemperature.ts](../../src/utils/localeTemperature.ts) | `locale.temperature` at the continuous hour | sampled along the hour so it drifts |
| [localeTemperatureStep.ts](../../src/utils/localeTemperatureStep.ts) | `locale.temperatureStep` at the half-hour slot | the smoothness across slots gives the temperature its wander |

Also out of scope: the scenery per-instance parameters (`sceneryParams.ts`) and the work sites (`workSites.ts`),
which draw from their own `Alea` streams and have no bell; `pickDistrict`, the stations and the coverage top-ups,
already even.

### 1.5 Thresholds and bands

No band or ratio changes in this spec (decision 3: nothing is tuned before the look). Every compare against an
in-scope draw is a written number that was never fitted to the bell, and starts to mean what it says:

| Edge | Today realises | Becomes |
|---|---|---|
| `DERELICT_RATIO` 0.25 (raw, before the re-hash) | 14.4 % | 25 % |
| the accent coin 0.5 | 50.1 % | 50 % |
| `INITIAL_ACTIVE_ROBOTS` 2 / 3 / 4 | 19.7 / 60.3 / 20.0 % | a third each |
| `SHAFT_COUNT` 3 / 4 / 5 | 40.9 / 17.3 / 41.8 % | a third each |
| `INITIAL_COMPANIES` 2 / 3, `COMPANY_SIZE` 3 / 4 | about 50 / 50 | 50 / 50 |

Four bands are neutral at their middle: the two colour shifts (hue ±30, sat ±20), `factory.scale` (0.9–1.1) and the
`factory.spacing` multiplier (0.8–1.2). 47 put the neutral-centred audio values on `getCentredSeededVal`. This spec
proposes even for all four, per decision 3, with the centred draw as the one-line fallback if the look finds the tints
or the jitter too strong; Crawford decides (§7 Q1).

### 1.6 What Crawford will see

Every world and every share link looks different, once. A saved session keeps its global and loading edits; its robot
and company overrides no longer find their ids and fall away (decision 1).

- **Names and colours fill their lists.** Iron, Tidal, Null and Solar robots and companies appear as often as the
  rest; every hue is as common as every other; a robot's adjective no longer predicts its colour, nor its noun its gem.
- **Rosters vary.** Two, three or four robots start Active a third of the time each (today three, 60 %); the docked
  batteries spread over 0–99.
- **Companies.** Still two or three of three or four, but which robots they take moves in every world, so every
  world's families change.
- **The skyline.** Factory scales and centre-row spacing spread across their bands; a quarter of derelict-capable
  actors are derelict as today, now without the re-hash; the Attenuation Style's accent primary reaches all 18 hues,
  its hue and sat tints reach their edges (today about half the band), and the factory and scenery tints stop moving
  together.
- **The light.** Three, four or five shafts a third of the time each, their widths reaching 50 and 160.
- **Determinism holds.** The same coordinates replay the same roster, companies, placement and shafts; the session
  diff and the world link round-trip.

---

## 2. Target File Structure

```text
src/systems/spawnSystem.ts                                  the §1.3 draws -> even
src/systems/lifecycleSim.ts                                 buildSimRoster -> even (with spawnInitialRoster)
src/systems/factoryPlacementSystem.ts                       draws -> even; ACCENT_PAIR_OFFSET removed if Q2 says so
src/systems/districts.ts                                    draws -> even; the derelict re-hash removed if Q2 says so
src/components/panels/screen/worldView/LightShafts.tsx      draws -> even
(+ each file's colocated tests: spawnSystem*.test.ts, lifecycleSim.test.ts, factoryPlacementSystem.test.ts,
   districts.test.ts, LightShafts.test.tsx, and any other test the switch breaks)
docs/PROCEDURAL_GENERATION.md    Sampling Values, Call Sites, Gotchas: the plain draw is for the three walks only;
                                 the company.count row; the dataId tables
docs/BUILDING_DESIGN.md          the accent pair (ACCENT_PAIR_OFFSET), the derelict roll, factory.spacing
docs/ROBOT_LIFECYCLE.md          the seeded roster; the no-silence table re-measured (§5.3)
docs/COMPANIES.md                seeded spawn-time generation
docs/todo/backlog.md, plan.md    46's status, then the archive
```

---

## 3. Boundaries

- **Always:** keep every dataId and offset as it is (the one exception is Q2's `ACCENT_PAIR_OFFSET`, if Crawford
  takes it); change spawn's and the sim's roster draws together; one commit per task, RED first for every behaviour
  task; run the full suite before each commit, and the lifecycle sim table after the roster task.
- **Ask first:** changing any band, ratio or count (that is the look's job, after this ships); any change to the
  shape of an id (`<kind>-<index>-<seed in base 36>`); a cache or other performance change unless §5.4's measure
  calls for it; moving a draw that is not in §1.3.
- **Never:** change `getSeededVal` or add a draw function; touch the three walks; keep a plain draw for continuity
  with saved sessions; assert on source or doc text; delete a test to get green.

---

## 4. Code Style

```ts
// before
const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getSeededVal(noiseMap, 'robot.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
// after - same dataId, same offset, same band
const index = Math.min(ROBOT_IDENTITY_COLOR_NAMES.length - 1, Math.floor(getUniformSeededVal(noiseMap, 'robot.identityColor', offset, 0, ROBOT_IDENTITY_COLOR_NAMES.length)));
```

The clamps stay: `getUniformSeededVal` returns `[min, max)`, so they no longer fire, but they are the documented guard
against a broken CSS variable and cost nothing. Comments that explain a bell-era workaround (the derelict re-hash,
the accent-pair offset, "the noise sampler can return exactly max") are rewritten or removed with the code they
describe.

---

## 5. Testing & Verification

### 5.1 Tests (exercise code, never text)

- Per generator, over N seeded locale maps (the generators themselves, imported and run; about 400 worlds × 12 robots
  for the robot keys, 3,000 maps for an offset-0 key): every list pick reaches every option at its even share within
  a tolerance sized to the sample (±2 points on a tenth, ±1.5 on an 18-way hue), every continuous pick puts 8–12 % in
  each outer tenth, and the named welded pairs of §1.1 correlate under 0.1.
- The written shares of §1.5 realise within ±3 points: the derelict ratio, the Active count split, the shaft count
  split.
- The style-map picks the same way over N styles (`getAttenuationStyleNoiseMap` with an evict per style, as the
  harness does): the accent primary reaches all 18 hues.
- Spawn and replay still agree: `spawnInitialRoster` matches `generateRobotRosterBaseline` plus
  `generateCompanyRosterBaseline`, and `buildSimRoster`'s Active count and docked batteries equal spawn's for the same
  map (the existing parity and families tests, re-run unmodified).
- Existing tests that pin a plain-era seeded value (a name, a colour, an id suffix, a membership, a shaft count, a
  derelict flag) are updated to the new behaviour, never deleted. A scenario test that needs a trait seeds it
  explicitly rather than searching for a world that happens to have it.
- Tests steer the even draws through `src/testUtils/seededDraws.ts` (47's T3): a tagged stub map drives
  `getUniformSeededVal` to a band's min, middle or max per dataId. A test that today forces an outcome with a
  constant noise map (`() => -1`) converts to `constantNoiseMap(-1)` with the `steerSeededDraws` mock.

### 5.2 The measurement

The `zzWorldSpread` harness (§1.1's numbers are its before-table) re-runs on the branch head once every §1.3 site has
moved. The after-table goes into the plan's record beside the before-table: distinct counts, outer-tenth and bucket
shares, the realised ratios, and the correlated-pair counts. The harness is deleted before every commit.

### 5.3 The lifecycle sim

`roster.activeCount` and `roster.dockedBattery` feed `lifecycleSim.ts`, whose 121-grid table in ROBOT_LIFECYCLE.md
("Both, shipped: none silent, 118 / 121 worlds with a stay, 0.81 stays per 1,000 measures …") was measured on the
plain roster. The no-silence guarantee is structural (the last Active robot stays up), so `lifecycleSim.test.ts`'s
grid case ("no world has a silent measure") must still pass unmodified. The stay figures move; the roster task re-runs
the table and updates the doc row, and reports the before and after. If any world goes silent, stop and report: that
is a finding, not a number to re-pin.

### 5.4 Cost

`getUniformSeededVal` hashes four times where `getSeededVal` hashes once. The spawn-time draws run once per world;
`generateCompanyMembership` runs again for the session diff and `generateCompanyRosterBaseline`; `placeDistrict` runs
per placement; `LightShafts` draws on every render while the shafts are visible (count and direction plus three per
shaft, up to 17 draws). Time `spawnInitialRoster` plus `placeDistrict` for one world and one `LightShafts` render
before and after. Recorded, not gated, unless one grows past a frame (16 ms), in which case memoising the shaft
geometry per locale is the first fix (Ask first).

### 5.5 Crawford's checkpoints

1. After the robots and companies move: a look at the roster, the names and the colours across a few fresh worlds
   (a Scan or two, and a link).
2. After placement and the shafts move: a look at the skyline and the light across the same kind of sample, by day.
3. Any tuning he asks for becomes its own task on the branch (a band, a ratio, or a centred draw for one of §1.5's
   four), after the look.

---

## 6. Success Criteria

- No §1.3 call site uses `getSeededVal`; the three walks of §1.4 still do. Tests prove every pick fills its range,
  every list option comes up at its even share, the §1.5 shares realise, and the named welded pairs are independent.
- The lifecycle grid still has no silent world; the stay figures are re-measured and recorded.
- The full suite, lint, types and build are green; the harness's after-table is recorded; the §5.4 timings are
  recorded.
- The docs in §2 describe the shipped draws, and no doc still calls a world pick bell-curved or describes a removed
  workaround.
- Crawford has looked at fresh worlds and passed them, with any tuning he asked for.

---

## 7. Open Questions

Answered 2026-11-11, both as recommended (decision 4). Kept for the record:

1. **Even or centred for the four neutral-middle bands** (hue ±30, sat ±20, `factory.scale` 0.9–1.1,
   `factory.spacing` 0.8–1.2)? **Recommended: even, all four**, per decision 3 (switch, look, then narrow). Today the
   hue tint realises about ±15 of its ±30, so even tints will read stronger; if the look says so, the centred draw is
   a one-line change per band, as its own task. The alternative is centred from the start, 47's rule for the EQ and
   detunes; it keeps the tints near today's look and gives up decision 3's clean "look first".
2. **Remove the two dead workarounds** (the derelict re-hash and `ACCENT_PAIR_OFFSET`)? **Recommended: yes, both**,
   in the task that moves each draw. Removing the offset moves the accent primary from offset 0.37 to 0, the one
   departure from "same offset" in this spec; nothing is kept for continuity, so the only cost is the rule's
   exception, named here. The alternative keeps both as harmless dead code.
3. **The ids.** Decision 1 accepts the change. One detail for the plan: `generateRobotId` embeds `spawnCount`, so
   uniqueness within a world is structural and does not depend on the draw; the even draw only changes the suffix.
   Nothing to decide, recorded so the plan does not re-ask.
