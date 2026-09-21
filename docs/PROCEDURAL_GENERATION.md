# Procedural Generation & Seeded Determinism

Source of truth: [`src/utils/seedUtils.ts`](../src/utils/seedUtils.ts) · [`src/utils/noiseMaps.ts`](../src/utils/noiseMaps.ts) · [`src/utils/getSeededVal.ts`](../src/utils/getSeededVal.ts)

**Related docs:** [MELODY_SYSTEM.md](MELODY_SYSTEM.md) · [ROBOT_DESIGN.md](ROBOT_DESIGN.md) · [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md)

## What It Is

Trace Atlas replaces `Math.random()` with a deterministic noise-based sampler almost everywhere game logic needs randomness. The guarantee: **the same Attenuation Style name + the same locale coordinates always produce the same world** — same robot names, spawn positions, audio attributes, melodies, and idle/interaction behavior. Nothing about the generated world is persisted beyond the seed inputs themselves.

An **Attenuation Style noise map** is seeded from the Attenuation Style's own name and used for genuinely Attenuation-Style-level generation — the global Audio Rig chain, global LFOs (see [AUDIO_SYSTEM.md](AUDIO_SYSTEM.md)), and the additive AS-seeded factory color shift (`deriveAsColorShift()` — see [BUILDING_DESIGN.md](BUILDING_DESIGN.md)). A **locale noise map** per locale is seeded independently, derived directly from that locale's own `(x, y)` coordinates — **not** from the Attenuation Style at all. Individual values (a robot's attack time, a spawn X position, an idle target) are then sampled from the relevant locale's noise map via a stable string key. World time (`dayStartTimestamp`) lives on `Locale` too, computed directly from a locale's own `x` coordinate — not seed-derived, and not an Attenuation-Style-level value at all (see [docs/specs/ATTENUATION_STYLE.md](specs/ATTENUATION_STYLE.md)).

**Not covered here:** factory/building variant selection (`selectVariantFromSeed` in `src/components/actors/factoryVariants.ts`) is a separate, self-contained deterministic mechanism — it seeds its own `Alea(actorId)` PRNG per call and never touches the noise-map registry described below. See [BUILDING_DESIGN.md](BUILDING_DESIGN.md) for that system.

## Seed Derivation (`seedUtils.ts`)

```typescript
deriveAttenuationStyleSeed(name: string): string   // lowercase, strip non a-z0-9 — "Pelagos 7!" → "pelagos7"
```

### Global seed override

A debug/testing escape hatch: setting `window.__GLOBAL_ATTENUATION_STYLE_SEED__` before load, passing `?seed=` in the URL, or calling `setGlobalAttenuationStyleSeedOverride(seed)` forces **every** Attenuation Style seed and **every** `precomputeDataX` key to be derived from one shared override string, for reproducible screenshots/tests/bug repros. `getGlobalAttenuationStyleSeedOverride()` reads the current override (`null` if unset).

**`?seed=` alone does not pin the whole world.** It fixes the *Attenuation Style* noise map (global Audio Rig, global LFOs, audio swells, AS-level factory placement) and is folded into the locale map's key (`${seed}:${x}:${y}`), but the default locale's coordinates are still random on every page load — so robots, BPM, temperature, idle/interaction behaviour and the time-of-day phase (`dayStartTimestamp`, derived from `x`) all differ between loads.

### Locale coordinate override (`?x=` / `?y=`)

To reproduce a whole world, pin the coordinates as well: `?seed=foo&x=12&y=-68`.

```typescript
parseCoordinateParam(raw: string | null | undefined): number | null   // integers only: "12", "-68"; anything else → null
getLocaleCoordinateOverride(): { x: number | null; y: number | null }  // null = axis not overridden
setLocaleCoordinateOverride({ x, y }): void                            // mainly for tests / pre-import setup
```

- Read from the URL at `seedUtils.ts` module load (browser only), the same way `?seed=` is. `localeStore.ts` then builds the default locale from `override.x ?? randomCoordinate()` (and likewise `y`) — once, at its own module load, so the override must be set **before** `localeStore` is imported.
- **Each axis is independent.** `?x=5` pins `x` and leaves `y` random; a non-integer or non-numeric value is ignored (that axis stays random). Also independent of `?seed=` — either can be used alone.
- **Boot-time only.** Sector Settings' "Random" coordinate button still calls `randomCoordinate()` ungated, and any locale added later takes its coordinates from the user, not from these params.
- **What pinning both still doesn't guarantee:** `Math.random()` remains only as the no-noise-map fallback in `spawnSystem.ts` (melody rand), `idleSystem.ts`, and `interactionSystem.ts`, in `factoryPlacementSystem.ts`'s default `scale` parameter (overridden by the seeded value on the normal path), and in UI-only rolls (`CompanyCrudControls.tsx`, `realWorldGradient.ts`). Simplex-seeded values are fully reproducible; live behaviour that depends on wall-clock time (`dayStartTimestamp` is `Date.now()`-relative, so the *hour* is reproducible but the timestamp is not) and on user/scheduler timing is not. Treat a pinned world as "same generated content", not "same audio sample-for-sample".

## Noise Map Registry (`noiseMaps.ts`)

Two module-scoped `Map`s — **non-serializable, never put these or their contents in Zustand**:

```typescript
getAttenuationStyleNoiseMap(attenuationStyleId: string, attenuationStyleName: string): NoiseFunction2D
getLocaleNoiseMap(localeId: string, x: number, y: number): NoiseFunction2D
tryGetLocaleNoiseMap(localeId: string): NoiseFunction2D | null   // non-throwing; null if not yet registered
evictAttenuationStyleNoiseMap(attenuationStyleId: string): void
evictLocaleNoiseMap(localeId: string): void
```

- **Attenuation Style map:** `createNoise2D(alea(deriveAttenuationStyleSeed(attenuationStyleName)))`, cached by `attenuationStyleId`.
- **Locale map:** `(x, y)` are concatenated into a single string key (`` `${x}:${y}` ``, or `` `${seed}:${x}:${y}` `` when a global seed override is set, the same way `deriveAttenuationStyleSeed` folds it in) and that string seeds `createNoise2D(alea(...))` directly, cached by `localeId`. **Two locales with identical `(x, y)` — regardless of which Attenuation Style either one is on — get identical noise maps.** This is a deliberate design guarantee, not an accident: `x` and `y` are two independent inputs at the UI layer (Sector Settings' coordinate entry), but they collapse into exactly one seed value here, never two separate dimensions sampled through a noise function. This also structurally eliminates the coordinate "dead zone" bug the old Attenuation-Style-sampled derivation had (simplex noise degenerating toward zero at lattice-aligned points like `(0,0)`) — there's no simplex sampling left in the derivation step to collapse. See [docs/specs/LOCALE_SEED_DECOUPLING.md](specs/LOCALE_SEED_DECOUPLING.md) for the full rationale.
- **Lifecycle:** `attenuationStyleStore.ts` and `localeStore.ts` prime the default Attenuation Style/locale's maps eagerly at module scope (so they exist before first render) and again inside `addAttenuationStyle`/`addLocale`. `removeAttenuationStyle`/`removeLocale` call the matching `evict*` function; `removeAttenuationStyle` also evicts every locale map belonging to that Attenuation Style.
- `tryGetLocaleNoiseMap` exists specifically for hot-path callers (`AudioEngine`) that must not throw or block if a locale hasn't been registered yet.

## Sampling Values (`getSeededVal.ts`)

```typescript
precomputeDataX(dataId: string): number
getSeededVal(noiseMap: NoiseFunction2D, dataId: string, offset?: number, min?: number, max?: number): number
```

- `precomputeDataX(dataId)` turns a stable string key into a deterministic float via `alea(dataId)()`. **Hot-path callers must call this once at module scope and cache the result** — repeated calls do string hashing and are measurably slower than `Math.random()`, which matters on the audio scheduling path. `AudioEngine.ts`'s `VELOCITY_ROLL_X`/`VELOCITY_VARIANCE_X` (computed once at import) are the canonical example.
- `getSeededVal(noiseMap, dataId, offset, min, max)` is the general-purpose sampler for everything else: it calls `precomputeDataX` internally, samples `noiseMap(x, offset)` (simplex noise, `[-1, 1]`), and rescales to `[min, max]` (defaults `0..1`).
- `dataId` is a stable, human-readable, dot-namespaced key — conventionally the state path it fills (e.g. `'robot.audio.attack'`, `'spawn.pos.x'`). Renaming a `dataId` string changes the seed for every world that used it — treat renames as breaking changes to world generation.
- `offset` is what makes repeated calls with the same `dataId` diverge — typically a spawn count, robot index, or per-call counter (e.g. melody generation uses `spawnCount * 100 + melodyCallIndex++`).

## Call Sites

| Module | Uses it for |
|---|---|
| `spawnSystem.ts` | Robot ID (`generateRobotId()`, replacing `crypto.randomUUID()`), robot name (adjective/noun pick), spawn edge/position, full `AudioAttributes` (ADSR, octave register, filter frequency, waveform, oscillator layers, phase/detune/pulse width), copy-vs-generate-fresh chance, copy source pick, rhythmic density, motif length active/value, note variance active/value, master volume, and the injected `rand` function passed to `generateMelodyForRobot`; also company count/size/membership and company ID/name (`generateCompanyId()`/`generateCompanyName()`) via `spawnInitialCompanies()` — see [COMPANIES.md](COMPANIES.md) |
| `factoryPlacementSystem.ts` | Factory Actor ID (`generateFactoryId()`, replacing `crypto.randomUUID()`), per-factory scale (0.9–1.1), and center-row spacing jitter (0.8–1.2) — see [BUILDING_DESIGN.md](BUILDING_DESIGN.md) |
| `idleSystem.ts` | `pickDestination()` — idle wander target `x`/`y`, keyed by `spawnIndex` and move count |
| `interactionSystem.ts` | Melody event index selection for each robot's interaction sound pick |
| `melodyGenerator.ts` | Never imports `noiseMaps`/`getSeededVal` directly — takes an injectable `rand: () => number` (defaults to `Math.random`). `spawnSystem.ts` wires `getSeededVal(noiseMap, 'melody.rand', ...)` in as that function so melody generation stays seeded without coupling the generator to the noise-map registry |
| `AudioEngine.ts` | `computeNoteVelocitySeeded()` — per-note velocity variance, sampling `tryGetLocaleNoiseMap()` at precomputed `VELOCITY_ROLL_X`/`VELOCITY_VARIANCE_X` positions with a per-robot note counter (mod 97) as the offset |

If a noise map isn't available yet (locale not registered, or no `noiseMap` passed), every caller above falls back to `Math.random()` rather than throwing.

## Gotchas

- Don't call `getSeededVal`/`precomputeDataX` inside a per-note audio callback without precomputing the `dataId` → x-value first (see `precomputeDataX`'s hot-path warning above).
- Don't rename a `dataId` string casually — it's a de facto seed key, not just a debug label.
- Don't store a `NoiseFunction2D` (or anything derived from the registry) in Zustand — it's a closure, not serializable.
- `getLocaleNoiseMap` silently creates-and-caches on first call; there's no way to "re-seed" an existing locale without evicting it first.
- **`offset=0` (the default) can silently collapse a single-value field's variety if its `dataId` happens to hash near a simplex lattice vertex.** `simplex-noise`'s `createNoise2D` evaluates to exactly `0` at `(0, 0)` for every possible seed, and stays degenerate near it — the same failure mode already called out above for the old Attenuation-Style-sampled locale derivation, but it can recur for *any* `dataId` string whose `precomputeDataX()` hash lands close to an integer coordinate, not just locale coordinates. Concretely hit this while building (and later cutting — see [CONSOLE_THEMING.md](CONSOLE_THEMING.md)) the Console Theming phase's now-removed `consoleTheme.ts`: `'ui.theme.background.hue'` hashed to `x≈0.0083`, and sampled at the usual `offset=0`, 50 random Attenuation Styles collapsed to only 3–4 distinct hues instead of a full spread. Fixed there (while the module still existed) with a fixed non-zero, non-integer offset rather than changing this function's own default. If a new single-value `dataId` ever shows suspiciously low variety across many seeds, check `precomputeDataX(dataId)` for a near-zero (or otherwise near-integer) result before assuming the noise itself is at fault.
