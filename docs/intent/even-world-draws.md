# Intent: Even World Draws — every world and visual pick fills its range, the smooth walks stay

Confirmed via `interview-me` on 2026-11-11 (four questions, every guess confirmed), ahead of a `spec-driven-development`
pass. Backlog [46](../todo/backlog.md#46-world-seeded-draws-are-welded-and-centre-heavy-names-colours-gems-companies-placement),
plan.md Stage 4; the visual half of backlog 47 (Even Seeded Draws,
[docs/specs/EVEN_SEEDED_DRAWS.md](../specs/EVEN_SEEDED_DRAWS.md), merged PR #596), held back on 2026-11-01 for its own
branch in case the visuals needed different tuning. Branch: `fix/even-world-draws`.

## Outcome

Every world-level pick the plain `getSeededVal` still makes moves to the even draw, `getUniformSeededVal`, with its
dataId and offset unchanged, so each pick fills its range independently of every other, the way the audio draws have
since 47. The two smooth walks keep the plain draw. Every world's names, colours, gems, companies and layout move once.

## Behavior

- **Who it is for.** Crawford, looking at worlds: the fleet's names and colours, the gem bodies, the companies, the
  skyline and the light.
- **Why now.** Stage 4 opens with it, and 47 proved the switch on the audio side: same dataId, same offset, function
  name only, then a measured table and a listen.

### The picks (go even)

- **Robots** (`spawnSystem.ts`): name (`robot.name.adj`, `robot.name.noun`), identity colour (`robot.identityColor`),
  gem seed (`robot.gem.seed`), id (`robot.id`), spawn position (`spawn.pos.x`, `spawn.pos.y`).
- **Companies** (`spawnSystem.ts`): name (`company.name.adj`, `company.name.noun`), id (`company.id`), identity colour
  and its collision retries (`company.identityColor`, `company.identityColor.retryN`), count, size and membership
  (`company.count`, `company.size`, `company.member`, in `generateCompanyMembership`).
- **The roster** (`spawnSystem.ts` `spawnInitialRoster` and `lifecycleSim.ts` `buildSimRoster`, together):
  `roster.activeCount`, `roster.dockedBattery`.
- **Placement** (`factoryPlacementSystem.ts`, `districts.ts`): factory id (`factory.id`), scale (`factory.scale`),
  centre-row spacing (`factory.spacing`), scenery id (`scenery.id`), the derelict roll (`actor.derelict`), and on the
  Attenuation Style's map the hue and sat shifts (`factory.as.hueShift`, `factory.as.satShift`, `scenery.as.*`), the
  accent pair (`factory.as.accentPrimary`) and the accent pick (`factory.as.accentPick`, `scenery.as.accentPick`).
- **Light shafts** (`LightShafts.tsx`): count and direction (`atmos.shaft.count`, `atmos.shaft.dir`, both at offset 0,
  so today they take very few values across all worlds), and each shaft's `atmos.shaft.x`, `.w`, `.depth`.
- Written shares start to mean what they say, as in 47: the derelict ratio (0.25), the accent coin (0.5), the company
  count over 2–3, the sizes over 3–4, the active count over 2–4, the shaft count over 3–5.

### The walks (stay plain)

- **Terrain** (`terrainProfile.ts`): run length and step height per step index. Consecutive indices sit one apart in
  the noise, so the ridge and the ground trend rather than jitter. That is the skyline wanted.
- **Temperature** (`localeTemperature.ts`, `localeTemperatureStep.ts`): the initial value sampled at the continuous
  hour, and the per-half-hour step whose smoothness across slots gives the temperature its wander.

### What moves, and what is accepted

- Robot and company ids change in every world, so a saved named session's robot and company overrides stop matching
  when its world regenerates. Accepted (pre-v1, no keep-existing constraint): the ids only need to be deterministic
  and unique, and the three preset links (backlog 45) get re-pasted at launch anyway.
- Company membership moves in every world, so every world's families change with it.
- Nothing is kept for continuity: the old spread was an accident, not a reference.

## Style / constraint

- **The call site changes its function name, nothing else** (47's rule, spec §3 "Always"): same dataId, same offset,
  same band. `getSeededVal` itself does not change; the walks need it.
- **Shared draws move together**: the roster's two draws in spawn and in the lifecycle sim, the factory and scenery
  shift namespaces, the id shape (`<kind>-<index>-<seed in base 36>`) in all three id generators.
- **The gate is a look, the table is the proof.** A measured after-table (distinct counts per key, outer-tenth shares,
  no pair of picks correlated), then Crawford looks at a few fresh worlds. Any tuning he asks for is its own task on the
  branch, after the look, never before.
- **Tests exercise code, not text** (CLAUDE.md): distribution tests run the real generators over seeded maps; tests
  that pin plain-era seeded values are updated to the new behaviour, never deleted to get green.
- **Determinism holds**: the same coordinates still replay the same roster, companies and placement; the session diff
  and the world link round-trip.

## Out of scope

- **Any band or ratio tuning before the look** (the derelict ratio, the shaft count, the company count and sizes).
- **The terrain and temperature walks.**
- **A side-by-side of old and new worlds.** Fresh worlds only.
- **Keeping saved sessions' overrides alive across the id change.** Considered, rejected.
- **Changing `getSeededVal`** or adding a new draw function.
- **Scenery per-instance parameters** (`sceneryParams.ts`) and **work sites** (`workSites.ts`): they draw from their
  own `Alea` streams, not the noise map, and have no bell.

## Known implementation notes (not yet spec'd)

- **Two workarounds become dead once their draws are even**, to propose for removal in the spec (Crawford's say-so,
  not unasked): the derelict roll's `alea(String(rawRoll))()` re-hash in `districts.ts`, which flattened the bell, and
  `ACCENT_PAIR_OFFSET` (0.37) in `factoryPlacementSystem.ts`, a non-integer offset that dodged the offset-0 collapse.
  Its "spread guard" test (`factoryPlacementSystem.test.ts`) keeps its threshold.
- **Even or centred, a spec question:** four bands are neutral at their middle, the hue shift (±30), the sat shift
  (±20), the factory scale (0.9–1.1) and the spacing multiplier (0.8–1.2). 47's rule put neutral-centred audio values
  (EQ, detune) on `getCentredSeededVal`. The interview settled "every pick goes even"; the spec names which of these
  four, if any, should lean to the middle instead, for Crawford's decision.
- **Expected test fallout**, from 47's probe (which swapped `getSeededVal`'s body for one full run): the
  factoryPlacementSystem, midgroundSilhouettes, workSites, sceneToOrbiterLocal, CompanyCrudControls, sessionStore and
  stations tests pinned seeded values. Some of those will have come from the terrain walk moving in the probe and will
  not fail here.
- **The measurement** reuses 47's temporary `zzSpread`-style harness (deleted before every commit): N seeded locale
  maps, the generators run as shipped, distinct counts, outer-tenth shares and pairwise correlation.
- **Docs that record the plain draw**: PROCEDURAL_GENERATION.md ("Sampling Values", "Call Sites", the Gotchas and the
  `company.count` row), BUILDING_DESIGN.md (placement), ROBOT_LIFECYCLE.md (the seeded roster), COMPANIES.md (seeded
  spawn-time generation).
