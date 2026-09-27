# Intent: Locale Seed Decoupling (pulled forward from Roadmap Phase 6)

Confirmed via `/interview-me` on `main`, 2026-08-25. Discovered as a hard prerequisite while
interviewing [Sector Settings' intent](sector-settings.md) (Roadmap Phase 5): Sector Settings'
retransmit action can't deliver what it promises on today's architecture. This doc is deliberately
narrower than [Roadmap Phase 6](../todo/roadmap.md#6-robot-melody--seed-engine) — it carves out
only the seeding-architecture slice ("update robot spawning rules so attributes come from
planet-agnostic lat/long coords seed," generalized to *all* locale-derived content, not just robot
spawn attributes). Phase 6's melody rhythm-engine overhaul (density-as-%, motif length range
change, note variance toggle) and robot ID determinism are untouched by this doc and stay in
Phase 6's original slot.

## Outcome

`src/utils/noiseMaps.ts`'s locale noise map stops being derived from the planet's noise map at
all. Today ([current `getLocaleNoiseMap`](../../src/utils/noiseMaps.ts)):

```
locale seed = alea(round(rescale(planetNoiseMap(x, y), -1..1 -> 0..129599)))
```

— which makes locale content planet-coupled (the same coordinates produce different content
on different planets) and is the root cause of the coordinate dead-zone bug (simplex noise
collapses to near-identical, sometimes exactly-zero, gradients at "clean" lattice-aligned
points like `(0,0)`, `(0.5,0.5)`, `(1,1)` — verified against 8 different `alea` seeds in
Roadmap Phase 5's Known Issue).

New: the locale seed derives directly from the locale's own `(x, y)` coordinates — a string
hash (`alea` over a stable `"x:y"`-style key, the same string-seeding approach
`derivePlanetSeed` already uses successfully for planet names) rather than a simplex-noise
*sample* at a point. This removes the planet noise map from the derivation chain entirely
(fixing the coupling) and sidesteps simplex's lattice-alignment degeneracy at the same time
(fixing the dead zone) — one mechanism change resolves both problems, it isn't two fixes
bolted together. `getLocaleNoiseMap`'s signature drops its `planetId`/`planetName` parameters;
its only callers are `localeStore.ts`'s module-scope priming call and `addLocale()`, both of
which currently pass those two args through from `planetStore`/the locale being added — both
call sites update to drop them.

**No other file needs to change.** `spawnSystem.ts`, `idleSystem.ts`, `interactionSystem.ts`,
and `AudioEngine.ts` all consume the locale noise map exclusively through
`tryGetLocaleNoiseMap(localeId)` — a plain lookup by locale ID, never touching `planetId` — so
every one of them inherits the decoupled, dead-zone-free behavior automatically once
`noiseMaps.ts` changes. This is a single-module fix with a wide correctness payoff, not a
sprawling refactor.

`localeStore.ts`'s `DEFAULT_LOCALE.coordinates` currently sits at a hand-picked
"verified-safe" point (`{ x: 12.3456, y: 67.891 }`) specifically to dodge the dead zone under
the *old* derivation — once the new derivation structurally can't collapse, that workaround
stops being load-bearing (worth a follow-up doc/code comment cleanup, not required for
correctness).

## User

Crawford, and indirectly every future Sector Settings user — this is invisible plumbing that
makes that feature's core promise (retransmit a new planet, locale content at unchanged
coordinates doesn't silently drift) actually true rather than aspirational.

## Why now

Sector Settings' Plot Tuning panel is exactly the feature that makes both bugs user-facing for
the first time: free-form X/Y entry means users will naturally type round numbers (`0`, `5`,
`10.5`) — precisely the coordinate class the dead zone hits — and Planet Calibration's retransmit
is exactly the action that would otherwise silently reshuffle every locale's content on a
planet-only reseed, when the confirmed intent for that feature requires it not to. Building the
UI first and discovering this live (per Phase 5's own "Known Issue" callout) is the thing being
avoided by sequencing this doc first.

## Success

- Two locales with identical `(x, y)` on two *different* planets produce byte-identical
  `getSeededVal` output for every `dataId` sampled against them — the coupling is gone, not just
  reduced.
- No coordinate produces a collapsed/low-entropy result — spot-check `(0,0)`, `(0.5,0.5)`,
  `(1,1)`, `(3.7,-8.2)` (Phase 5's own documented worst cases) each still yield 8/8 distinct
  values across 8 different seed inputs, matching what only high-precision points achieved
  before.
- `spawnSystem.ts`/`idleSystem.ts`/`interactionSystem.ts`/`AudioEngine.ts` need zero code
  changes — existing tests for all four pass unmodified, proving the consumer surface really is
  isolated from this change.
- `getLocaleNoiseMap`'s new signature has no `planetId`/`planetName` parameters; both call sites
  in `localeStore.ts` compile and pass only `(localeId, x, y)`.
- `docs/PROCEDURAL_GENERATION.md`'s two-tier model description and its existing "Planned
  change (not yet implemented)" callout on the Locale map bullet are resolved to describe the
  new, single-tier-for-locales reality.

## Constraint

- The planet noise map (`getPlanetNoiseMap`) is untouched and stays planet-seeded — it's still
  the correct source for genuinely planet-level (not per-locale) generation: `planetInitialHour`,
  and Phase 4's `generateGlobalAudioSettings`/`generateGlobalLfoSettings` (the global Audio Rig
  chain and global LFOs are deliberately planet-wide, not per-locale, and this doc doesn't
  change that).
- `getGlobalPlanetSeedOverride()`'s debug escape hatch (`?seed=`, `window.__GLOBAL_PLANET_SEED__`)
  keeps working the same way — it still needs to fold into whatever string gets hashed for the
  locale seed, exactly as it does today for the intermediate integer.
- Purely a seeding-mechanism change — no `Locale`/`Robot`/store type shapes change, no new
  Zustand state, nothing to persist (Session Storage is still Phase 12, untouched by this).

## Out of scope

- Phase 6's melody rhythm-engine overhaul (density-as-%, 1–8 motif length + toggle, note
  variance toggle, the `RHYTHMIC_MOTIF_LENGTH_MAX` constant change) — unrelated behavior change,
  stays in Phase 6.
- Robot IDs becoming deterministic (needed for Phase 12's override-reapply-by-ID) — not required
  by this doc or by Sector Settings.
- Sector Settings' own UI/data work (`sectorSettingsConfig.ts`, `SectorSettingsDrawer.tsx`,
  retransmit wiring, presets) — see [sector-settings.md](sector-settings.md), which depends on
  this doc but isn't part of it.
