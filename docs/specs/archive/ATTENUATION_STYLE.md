# Phase Spec: Attenuation Style (Roadmap Phase 10.1)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/attenuation-style.md](../intent/attenuation-style.md) (confirmed via `/interview-me`, 2026-08-28). Source of scope: [docs/todo/roadmap.md § 10.1](../todo/roadmap.md#101-attenuation-style-single-planet-reskin) (inserted out of sequence, deliberately not renumbering later phases). Prior art: [docs/specs/SECTOR_SETTINGS.md](SECTOR_SETTINGS.md) (the `retransmitWorld` four-branch structure this phase inverts one branch of, and the `worldTransition.ts` orchestration this phase extends rather than replaces), [docs/specs/LOCALE_SEED_DECOUPLING.md](LOCALE_SEED_DECOUPLING.md) (why a locale's generated content — factory placement/count/variant included — is already a pure function of its own `(x, y)`, independent of planet identity; this phase adds a *second*, deliberately separate AS-keyed input on top, it does not touch that guarantee), [docs/BUILDING_DESIGN.md](../BUILDING_DESIGN.md) (the existing per-factory hue/sat-shift color model this phase layers onto), [docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md).

---

## 1. Overview & Claude Explanation

Read literally, the roadmap entry is mostly a find-and-replace: "planet" becomes "Attenuation Style (AS)" in a handful of user-facing strings. Direct inspection of the actual call chains shows two pieces of this are real engineering, not copy-editing — both already scoped precisely by the intent doc, neither discovered fresh here, but worth walking through with file:line grounding since the mechanism isn't obvious from the roadmap prose alone.

### 1.1 World Time moves from Planet to Locale

Today, [src/types/planet.ts](../../src/types/planet.ts) carries `size: PlanetSize`, `dayStartTimestamp: number`, and `currentHour?: number`. [src/constants/time.ts](../../src/constants/time.ts)'s `computePlanetHour(dayStartTimestamp, size)` derives a 0–24 float from wall-clock elapsed time divided by a size-keyed `PLANET_DURATION_MS` table (3/6/9 minutes). [src/components/panels/screen/worldView/PlanetView.tsx](../../src/components/panels/screen/worldView/PlanetView.tsx) calls `computePlanetHour` once a second to get a **planet-wide** hour, then [LocaleView.tsx](../../src/components/panels/screen/worldView/LocaleView.tsx) applies a **per-locale longitude offset** on top via `computeLocalTime(planetHour, locale.coordinates.x)` (`offsetHours = x / 15`) before handing the result to `OceanScene`. `PlanetView`'s own tick separately recomputes `computeLocalTime` a second time to write `uiStore.activeLocaleLocalTime` — the value `Factory.tsx` and `RobotBody.tsx` actually read for day/night tinting. Two call sites, two redundant computations of what is, since only one locale is ever mounted at once (`currentLocaleId`), the same number.

Per the intent doc, this collapses to one step: `dayStartTimestamp` moves onto `Locale` ([src/types/locale.ts](../../src/types/locale.ts)), computed once at locale-build time directly from that locale's own `coordinates.x` — `Date.now() - (Math.abs(x % 24) / 24) * DAY_DURATION_MS`, with `DAY_DURATION_MS` a new fixed `6 * 60_000` constant replacing the three-entry `PLANET_DURATION_MS` table. A locale's hour is now `computeLocaleHour(locale.dayStartTimestamp)` — no size parameter (there's only one duration now), and no second `computeLocalTime` offset step, because the x-dependency is already baked into `dayStartTimestamp` at construction. `computeLocalTime`'s longitude-offset composition is retired outright, not preserved — there is no persistent, cross-locale clock left to offset from. `PlanetView.tsx` reads the *current locale's* `dayStartTimestamp` (not the planet's) on its per-second tick, and writes that single computed value both into local component state (fed to `LocaleView`) and into `uiStore.activeLocaleLocalTime` — one computation, one number, two consumers, matching what was already true in spirit but not in code.

**The retransmit branch that recalculates time inverts**, per the intent doc's own explicit warning against writing the new branch by analogy to today's structure. Today, only `retransmitPlanetOnly` ([src/systems/worldTransition.ts:168](../../src/systems/worldTransition.ts#L168)) produces a new `dayStartTimestamp` (via `buildPlanet`), and `retransmitCoordsOnly` never touches it. Under this phase it's the reverse: `dayStartTimestamp` is now a `Locale` field, so only the branches that build a fresh `Locale` — `retransmitCoordsOnly` and `retransmitBoth`, both of which already call `buildLocale` — produce a new one (for free, as a direct consequence of `buildLocale` now stamping it in). `retransmitPlanetOnly` re-parents the *existing* locale onto the new planet, per its own established preservation rule (§1 of SECTOR_SETTINGS.md) — untouched by this phase — and since `dayStartTimestamp` now lives on that same preserved `Locale` record, leaving it alone is not new code to write, it is simply *not writing* the recalculation that used to live in `buildPlanet`. The risk this phase's own intent doc flags is real: a naive port would keep the recalculation on the planet-only branch by habit. It must not.

`Planet.dayStartTimestamp`, `PlanetSize`, `Planet.size`, `setPlanetSize`, and `planetInitialHour` ([src/utils/seedUtils.ts:86](../../src/utils/seedUtils.ts#L86), the letter-average algorithm) are deleted outright, per the intent doc's Constraint section — all dead once a locale's initial hour is x-derived rather than seed-derived.

`Planet.currentHour`/`setCurrentHour` are not named in that list, but confirmed dead by direct inspection — `setCurrentHour` has zero production call sites, and `harmonySystem.ts`'s own doc comment claiming it reads `selectCurrentPlanet(...)?.currentHour` is itself stale: the function it actually calls, `getCurrentHour()` in `beatClock.ts`, derives an unrelated measure-based hour for melody-palette selection, nothing to do with `Planet.currentHour` at all. **Per direct confirmation, this phase deletes both anyway** — leaving a dead field/setter pair on `Planet` right next to the one that's being removed for real reasons reads as an oversight, not a deliberate line, once World Time has moved off `Planet` entirely. Deleting it has two direct, necessary knock-on fixes, not scope creep: `harmonySystem.ts`'s stale doc comment (already wrong today) gets corrected to name the actual source (`beatClock.ts`'s `getCurrentHour()`) rather than left pointing at a symbol that no longer exists at all, and [docs/CONTRIBUTION_GUIDE.md:37](../CONTRIBUTION_GUIDE.md)'s "`planetStore` — planet-level state (`currentHour`, `currentLocaleId`, planet list)" line — already imprecise, about to become flatly false — drops `currentHour`.

### 1.2 Factory recolor is new coupling, not a rename

Today a factory's color has exactly one seeded input: [src/systems/factoryPlacementSystem.ts](../../src/systems/factoryPlacementSystem.ts)'s `createFactory` calls `selectVariantFromSeed(id, position.x, row, availableTypes)` ([src/components/actors/factoryVariants.ts:201](../../src/components/actors/factoryVariants.ts#L201)), which draws `hueShift`/`satShift` from the variant's own `colorRanges` using a PRNG seeded purely by the factory's own `id` — itself deterministically derived from the **locale's** noise map (`generateFactoryId`). `Factory.tsx` reads `actor.config.hueShift`/`satShift` (persisted at spawn, not recomputed) and applies them via `shiftHSL`/`applyColorShift` on top of `VARIANT_CONF[variant].colors` (a static per-variant base HSL from `colorTheme.json`), with day/night lightness layered on separately. None of this samples `getPlanetNoiseMap` — an AS/planet change touches zero factory state today, confirmed by `retransmitPlanetOnly`'s existing behavior (re-parents the locale, its `actors` array untouched).

This phase adds a **second, independent, additive** color input sourced from the AS's own noise map — layered on top of the existing locale-seeded shift, never replacing it, and deliberately not touched by `selectVariantFromSeed` itself (which also drives `variant`/`scale`/greeble selection — folding the AS seed into that same PRNG stream would risk cascading into variant/greeble changes too, which the intent doc explicitly rules out: only color changes, not placement, count, id, variant, or greebles). Concretely: a new `deriveAsColorShift(noiseMap, index)` samples `getSeededVal` against the **planet's** (AS's) noise map, keyed by each factory's position in the locale's actor array — the same `getSeededVal(noiseMap, dataId, offset, min, max)` pattern every other seeded field in this file already uses. `createFactory` gains an additive `asShift: ColorShift = { hueShift: 0, satShift: 0 }` parameter (default preserves every existing caller's behavior unchanged, including direct test calls), summed into the stored `hueShift`/`satShift` alongside the existing locale-derived draw. `placeFactories(localeId)` resolves the locale's own `planetId` and looks up that planet's noise map internally — the same pattern it already uses one line above for the locale noise map — so its exported signature does not change; this does add a new `usePlanetStore` import to a file that previously only depended on `useLocaleStore` (flagged explicitly in §3, not a hidden coupling).

The "recolor an existing locale's factories in place" requirement — new, since nothing today makes factory appearance react to a planet swap at all — is a new exported `recolorFactoriesForAttenuationStyle(localeId, planetId, planetName)`. It **re-derives** each factory's locale-seeded local shift by calling `selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes)` again (a pure function of stable, never-changing inputs — the same recomputation `Factory.tsx` already does every render for `variant`/`scale`, reused here rather than invented fresh), discards its `hueShift`/`satShift` output as before, and adds a **freshly-sampled** `deriveAsColorShift` against the *new* AS's noise map. This is deliberately not "subtract the old AS delta, add the new one" — re-deriving the local component from scratch each time avoids any float round-trip drift across repeated AS changes, and is idempotent: recoloring twice with the same AS yields the same result both times. Only `actor.config.hueShift`/`satShift` change in the returned actor; `id`/`position`/`scaleX`/`scaleY`/`rotation`/`config.row`/`rooftopGreeble`/`facadeGreeble`/`beltCourseCount`/`purpose`/`isOffline`/`offlineSince` are all preserved via spread — satisfying "position/count/id untouched" exactly.

Called from `retransmitPlanetOnly` (mechanically the same function — an AS-only retransmit is, under the hood, still "build a fresh Planet record, discard the old one," per the intent doc's own "nothing about the underlying data model needs to change" framing), immediately after the existing locale is re-parented onto the new planet and before that old planet is discarded.

### 1.3 What's explicitly a rename, and what stays exactly as-is

Per the intent doc's Constraint section, internal identifiers are **not** renamed: `Planet`, `PlanetSize` (well — deleted, not renamed, see above), `usePlanetStore`, `planetStore.ts`, `derivePlanetSeed`, `getPlanetNoiseMap`, `RetransmitInput.planetName`, the `?seed=`/`window.__GLOBAL_PLANET_SEED__` debug override, and `generateRandomPlanetName()` (keeps producing the same 8-char string, just no longer implying a place name). This spec extends that same no-rename posture to every internal symbol in `worldTransition.ts` this phase touches (`buildPlanet`, `retransmitPlanetOnly`, `createNewPlanet`, `finalizePlanetTransition`) and to `sectorSettingsConfig.ts`'s existing schema/preset constant names (`PLANET_NAME_SCHEMA`, `PLANET_NAME_PRESETS`) — only their **string values** change, not their identifiers. `PlanetView.tsx`/`LocaleView.tsx`/`TransportBar.tsx` keep their file and component names too — this stays a UI/copy reskin at the code-identifier level, exactly as small a diff as the intent doc calls for.

What *is* real user-facing copy, per the roadmap's explicit list: `PLANET_NAME_SCHEMA`'s `loreLabel`/`humanLabel`/`placeholder` (`sectorSettingsConfig.ts`), `PLANET_NAME_PRESETS`' four entries, and `TransportBar.tsx`'s `<VisuallyHidden>Planet: </VisuallyHidden>` label. This spec proposes concrete replacement copy for the schema labels and the TransportBar label (§4) but leaves the four preset *names* (replacements for Kryndara/Vessport Null/Halcyon Drift/The Rusting) as an open TBD, per the intent doc's own explicit Out-of-scope line — "left as a TBD for implementation time, not decided here." Not re-decided here either.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── planet.ts        # MODIFIED — delete PlanetSize, Planet.size, Planet.dayStartTimestamp,
│   │                     #   Planet.currentHour, PlanetState.setPlanetSize,
│   │                     #   PlanetState.setDayStartTimestamp, PlanetState.setCurrentHour
│   └── locale.ts         # MODIFIED — Locale gains dayStartTimestamp: number. No new LocaleState
│                          #   setter — setLocaleData already carries it when needed.
├── constants/
│   ├── time.ts           # MODIFIED — PLANET_DURATION_MS → DAY_DURATION_MS (flat 6*60_000, no size
│   │                     #   keying). computePlanetHour → computeLocaleHour(dayStartTimestamp), no
│   │                     #   size param. computeLocalTime deleted outright (not preserved).
│   ├── time.test.ts      # MODIFIED — update for the renamed/reshaped exports
│   └── index.ts          # MODIFIED — barrel re-export + doc comment updated to DAY_DURATION_MS/
│                          #   computeLocaleHour (no current importers of the barrel form, confirmed
│                          #   by grep — kept in sync anyway so the module still compiles)
├── utils/
│   └── seedUtils.ts       # MODIFIED — delete planetInitialHour; derivePlanetSeed/override machinery
│                          #   untouched
│   └── seedUtils.test.ts  # MODIFIED — remove planetInitialHour coverage
├── stores/
│   ├── planetStore.ts     # MODIFIED — delete makeDayStartTimestamp, DEFAULT_PELAGOS.size/
│   │                       #   dayStartTimestamp/currentHour, addPlanet's dayStartTimestamp
│   │                       #   recompute block, setPlanetSize/setDayStartTimestamp/setCurrentHour
│   │                       #   actions
│   ├── planetStore.test.ts # MODIFIED — remove the setPlanetSize, setCurrentHour, and
│   │                        #   setDayStartTimestamp describe-blocks (three, all tied to actions
│   │                        #   deleted above)
│   ├── localeStore.ts      # MODIFIED — DEFAULT_LOCALE gains dayStartTimestamp, computed once at
│   │                       #   module load via the same x-derived formula buildLocale uses
│   └── localeStore.test.ts # MODIFIED — DEFAULT_LOCALE fixture / any locale fixtures gain the field
├── systems/
│   ├── worldTransition.ts       # MODIFIED — buildPlanet drops dayStartTimestamp/PlanetSize; buildLocale
│   │                             #   stamps dayStartTimestamp from x; retransmitPlanetOnly calls the new
│   │                             #   recolorFactoriesForAttenuationStyle for the re-parented locale
│   ├── worldTransition.test.ts  # MODIFIED — new coverage per §5; existing branch tests need no
│   │                             #   structural changes (confirmed by grep: this file has zero
│   │                             #   references to any field/function being deleted)
│   ├── factoryPlacementSystem.ts       # MODIFIED — new deriveAsColorShift (private) + exported
│   │                                    #   recolorFactoriesForAttenuationStyle; createFactory gains an
│   │                                    #   additive asShift param; placeFactories resolves the locale's
│   │                                    #   own planet internally (new usePlanetStore/getPlanetNoiseMap
│   │                                    #   dependency — signature itself unchanged)
│   └── factoryPlacementSystem.test.ts  # MODIFIED — AS-shift coverage per §5
├── engine/
│   └── harmonySystem.ts   # MODIFIED — doc-comment only; the stale "Hour is now derived from
│                            #   the world time-of-day (driven by planet size), provided by
│                            #   selectCurrentPlanet(...)?.currentHour" comment is corrected to
│                            #   name the actual source (beatClock.ts's getCurrentHour(), unrelated
│                            #   to Planet/Locale entirely) — a necessary fix once currentHour no
│                            #   longer exists to point at, not a functional change (harmonySystem.ts
│                            #   already didn't read that field). No test change needed —
│                            #   harmonySystem.test.ts's own local `currentHour` variable is an
│                            #   unrelated beatClock mock, not this field.
├── components/
│   └── panels/screen/
│       ├── TransportBar.tsx        # MODIFIED — VisuallyHidden label text only ("Planet: " →
│       │                            #   "Attenuation Style: "); class names/variable names unchanged
│       ├── TransportBar.test.tsx   # MODIFIED — TEST_PLANET fixture drops size/dayStartTimestamp/
│       │                            #   currentHour; label-text assertion updated
│       ├── worldView/
│       │   ├── PlanetView.tsx      # MODIFIED — per-second tick reads the current Locale's
│       │   │                        #   dayStartTimestamp (not the Planet's), computes hour via
│       │   │                        #   computeLocaleHour, writes the single result to both local
│       │   │                        #   state and uiStore.activeLocaleLocalTime — no second
│       │   │                        #   computeLocalTime pass
│       │   └── LocaleView.tsx      # MODIFIED — drops its own computeLocalTime call; its hour prop
│       │                            #   (renamed currentHour → localTime, matching what it now IS)
│       │                            #   passes straight through to OceanScene
│       └── console/
│           ├── SectorSettingsDrawer.tsx  # MODIFIED — doc-comment wording only ("Planet Calibration"
│           │                              #   → "Attenuation Style"); no JSX/logic change, since no
│           │                              #   literal "Planet Calibration" string is actually rendered
│           └── (SectorSettingsDrawer.test.tsx — untouched; no behavior change)
data/
└── sectorSettingsConfig.ts  # MODIFIED — PLANET_NAME_SCHEMA's loreLabel/humanLabel/placeholder get
│                              #   AS-flavored copy; PLANET_NAME_PRESETS' 4 values stay TBD (§7),
│                              #   structurally unchanged (still 4 SectorPreset<string> entries)
└── sectorSettingsConfig.test.ts  # MODIFIED — label-text assertions updated; preset-count assertion
                                   #   unchanged
docs/
├── BUILDING_DESIGN.md   # MODIFIED — the "seeded by the actor ID and horizontal position" line
│                          #   (Overview, and the "Deterministic Randomness" bullet) gains a follow-up
│                          #   note: color also depends on the active AS's own seed, not only the
│                          #   locale's — per roadmap §10.1's own Docs callout
├── CONTRIBUTION_GUIDE.md  # MODIFIED — one line: "`planetStore` — planet-level state (`currentHour`,
│                            #   `currentLocaleId`, planet list)" drops `currentHour` — necessary once
│                            #   the field it names no longer exists, not a scope expansion
└── specs/ATTENUATION_STYLE.md  # this file
```

No new dependency. No file is renamed.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **No internal renames.** Per §1.3 — `Planet`, `usePlanetStore`, `planetStore.ts`, `derivePlanetSeed`, `getPlanetNoiseMap`, `RetransmitInput.planetName`, `generateRandomPlanetName`, `buildPlanet`, `retransmitPlanetOnly`, `PLANET_NAME_SCHEMA`, `PLANET_NAME_PRESETS`, component/file names (`PlanetView.tsx`, `TransportBar.tsx`, etc.) all keep their current identifiers. Only `PlanetSize`/`Planet.size`/`Planet.dayStartTimestamp`/`setPlanetSize`/`setDayStartTimestamp`/`planetInitialHour`/`PLANET_DURATION_MS`/`computePlanetHour`/`computeLocalTime` are deleted outright, per the intent doc's own explicit list — deletion, not renaming.
* **`Planet.currentHour`/`setCurrentHour` are deleted too**, per direct confirmation — not named in the intent doc's own list, but confirmed dead (§1.1) and removed in the same pass as `dayStartTimestamp`/`size` rather than left as an orphaned dead pair beside them. Its two knock-on fixes (`harmonySystem.ts`'s stale doc comment, `docs/CONTRIBUTION_GUIDE.md`'s now-inaccurate line) are in scope as direct, necessary consequences of the deletion — not independent scope expansion.
* **The AS-seeded factory color pass is strictly additive, never a replacement of the locale-seeded shift.** `deriveAsColorShift`'s output is summed with `selectVariantFromSeed`'s existing `hueShift`/`satShift`, never substituted for it. It must not influence `variant`, `scale`, `frontCornerX`, greeble selection, or belt-course count — those stay driven exclusively by `selectVariantFromSeed(actor.id, ...)`'s own existing PRNG stream, untouched by this phase.
* **`recolorFactoriesForAttenuationStyle` only ever changes `actor.config.hueShift`/`satShift`.** Every other field on every `Actor` it touches — `id`, `position`, `scaleX`/`scaleY`, `rotation`, `isActive`, `cooldownRemaining`, and every other `config` key — must round-trip unchanged (spread, not reconstructed).
* **`recolorFactoriesForAttenuationStyle` is called from exactly one place: `retransmitPlanetOnly`, for the locale being re-parented (`oldLocaleId`).** Never called from `placeFactories`/`initializeLocale`'s own fresh-spawn path — that path folds the *current* AS's shift in at creation time via `createFactory`'s new `asShift` parameter instead, a different code path for a different moment (spawn vs. recolor-in-place).
* **`placeFactories(localeId)`'s exported signature does not change** — it resolves the locale's own planet internally (mirroring how it already resolves the locale's own coordinates for the locale noise map one line above), so no call site (`initializeLocale`, any test) needs updating for a new required argument. This does add a new `usePlanetStore`/`getPlanetNoiseMap` dependency to `factoryPlacementSystem.ts`, previously locale-only — a genuine new coupling, not hidden from this list.
* **The retransmit-branch time-recalculation inversion (§1.1) is the single easiest thing to get backwards.** `buildLocale` must stamp `dayStartTimestamp`; `retransmitPlanetOnly` must not touch the preserved locale's `dayStartTimestamp` in any way, including indirectly via a full-object rebuild — it only ever calls `setLocaleData(oldLocaleId, { planetId: newPlanet.id })`, a partial patch that can't touch a field it doesn't mention.
* **Coordinates are integers system-wide, already enforced by `CoordsInput.tsx` (SECTOR_SETTINGS.md §3).** This phase's `abs(x % 24)` formula depends on that holding — it is not re-validated here, only relied upon; if `CoordsInput`'s integer enforcement is ever relaxed, this formula's "zero minutes, exactly" guarantee breaks silently.
* **No Session Storage wiring** — nothing here persists across reload (Phase 12's job, not yet built); a retransmitted-away AS or coordinate is genuinely discarded on reload today, same as every other retransmit branch.
* **`docs/CONSOLE_THEMING.md` and `docs/SESSION_STORAGE.md` are explicitly out of scope**, per the intent doc — both describe "planet seed" as a design concept for phases not yet built; their terminology updates when those phases are actually implemented, not now (the intent doc leaves its own Forward Note for that).

---

## 4. Code Style & Architecture Conventions

**`constants/time.ts`** — full replacement:

```typescript
// src/constants/time.ts

/** Fixed real-world duration of one in-world day, universal — replaces the
 *  old three-entry (small/medium/large) PLANET_DURATION_MS table now that
 *  PlanetSize no longer exists. */
export const DAY_DURATION_MS = 6 * 60_000;

/**
 * Derive a locale's current in-world hour (float, 0-24) directly from its
 * own dayStartTimestamp. Pure function — no store read required. Replaces
 * computePlanetHour (no size parameter — there is only one duration now)
 * and folds in what computeLocalTime's longitude-offset composition used to
 * do separately: the x-dependency is already baked into dayStartTimestamp
 * at locale-build time (see worldTransition.ts's buildLocale), so there is
 * no second offset step left to apply.
 */
export function computeLocaleHour(dayStartTimestamp: number): number {
  const elapsed = Date.now() - dayStartTimestamp;
  return (elapsed / DAY_DURATION_MS) * 24 % 24;
}
```

**`types/locale.ts`** (diff — one new field, no new setter):

```typescript
export interface Locale {
  id: string;
  planetId: string;
  name: string;
  coordinates: LocaleCoordinates;
  /** Wall-clock timestamp this locale's in-world day began. Computed once at
   *  build time from the locale's own x coordinate — see
   *  docs/specs/ATTENUATION_STYLE.md §1.1. Moved here from Planet. */
  dayStartTimestamp: number;
  robots: Robot[];
  actors: Actor[];
  companies: Company[];
  settings: LocaleSettings;
  currentMeasure: number;
}
```

**`types/planet.ts`** (diff):

```typescript
export interface Planet {
  id: string;
  name: string;
  locales: string[];
  currentLocaleId?: string;
}

export interface PlanetState {
  planets: Planet[];
  addPlanet: (p: Planet) => void;
  removePlanet: (planetId: string) => void;
  setCurrentLocale: (planetId: string, localeId: string) => void;
}
```

`PlanetSize` is deleted, not replaced. `size`, `dayStartTimestamp`, `currentHour`, `setPlanetSize`, `setDayStartTimestamp`, `setCurrentHour` are all gone from both interfaces — `currentHour`/`setCurrentHour` weren't named in the intent doc's own list, but confirmed dead (§1.1) and removed alongside the rest per direct confirmation, rather than left as an orphaned dead pair.

**`systems/worldTransition.ts`** (the two changed construction helpers, and the one changed branch):

```typescript
/** Construct a fresh Planet — no dayStartTimestamp/size/currentHour anymore;
 *  dayStartTimestamp moved to Locale, the rest were deleted outright. */
function buildPlanet(name: string): Planet {
  return {
    id: crypto.randomUUID(),
    name,
    locales: [],
  };
}

/** Construct a fresh, empty Locale at the given coordinates. dayStartTimestamp
 *  is computed here, once, directly from x — no seed, no shared clock. This
 *  is the ONLY place a fresh dayStartTimestamp gets produced; retransmitPlanetOnly
 *  deliberately never calls this for its preserved locale. */
function buildLocale(planetId: string, coordinates: { x: number; y: number }): Locale {
  return {
    id: crypto.randomUUID(),
    planetId,
    name: `Plot ${coordinates.x}, ${coordinates.y}`,
    coordinates,
    dayStartTimestamp: Date.now() - (Math.abs(coordinates.x % 24) / 24) * DAY_DURATION_MS,
    robots: [],
    actors: [],
    companies: [],
    settings: { bpm: 60 },
    currentMeasure: 0,
  };
}

/** Planet changed, coordinates preserved: re-parent the EXISTING locale onto
 *  the new planet unchanged — same robots/actors/edits/dayStartTimestamp, no
 *  regeneration. dayStartTimestamp is NOT recalculated here — inverted from
 *  today's behavior, see docs/specs/ATTENUATION_STYLE.md §1.1. Factory colors
 *  DO change — recolorFactoriesForAttenuationStyle is new coupling, not a
 *  preservation exception; see §1.2. */
function retransmitPlanetOnly(oldPlanet: Planet, oldLocaleId: string | undefined, planetName: string): void {
  const newPlanet = createNewPlanet(planetName);
  let preservedCoords: { x: number; y: number } | undefined;

  if (oldLocaleId) {
    preservedCoords = useLocaleStore.getState().getLocaleById(oldLocaleId)?.coordinates;
    useLocaleStore.getState().setLocaleData(oldLocaleId, { planetId: newPlanet.id });
    usePlanetStore.getState().setCurrentLocale(newPlanet.id, oldLocaleId);
    recolorFactoriesForAttenuationStyle(oldLocaleId, newPlanet.id, newPlanet.name);
  }

  finalizePlanetTransition(newPlanet, oldPlanet);
  if (oldLocaleId && preservedCoords) getLocaleNoiseMap(oldLocaleId, preservedCoords.x, preservedCoords.y);
}
```

`retransmitCoordsOnly`/`retransmitBoth` need no code change — both already call `buildLocale`, which now stamps `dayStartTimestamp` as a direct consequence.

**`systems/factoryPlacementSystem.ts`** (new pieces, alongside the existing `generateFactoryId`/`createFactory`/`placeFactories`):

```typescript
import { getLocaleNoiseMap, getPlanetNoiseMap } from '../utils/noiseMaps';
import { usePlanetStore } from '../stores/planetStore';
import type { ColorShift } from '../utils/colorUtils';

/** Moderate, bounded range for the AS-seeded color component — same order of
 *  magnitude as the widest per-variant colorRanges (Skyscraper's ±120 hue is
 *  an outlier; most variants sit in the ±15-60 range) so a fresh AS visibly
 *  recolors the skyline without a single roll being able to wash it out
 *  entirely. Flagged as a first-pass default, not re-derived from the intent
 *  doc (which left the exact mechanism open) — see §7. */
const AS_FACTORY_HUE_SHIFT_RANGE: [number, number] = [-30, 30];
const AS_FACTORY_SAT_SHIFT_RANGE: [number, number] = [-20, 20];

/** AS-seeded color delta for one factory, additive on top of its existing
 *  locale-seeded hueShift/satShift — never a replacement. Sampled from the
 *  ACTIVE PLANET's (AS's) own noise map, keyed by the factory's position in
 *  the locale's actor array (the same getSeededVal(noiseMap, dataId, offset,
 *  min, max) pattern every other seeded field in this file already uses). */
function deriveAsColorShift(noiseMap: NoiseFunction2D, index: number): ColorShift {
  return {
    hueShift: getSeededVal(noiseMap, 'factory.as.hueShift', index, ...AS_FACTORY_HUE_SHIFT_RANGE),
    satShift: getSeededVal(noiseMap, 'factory.as.satShift', index, ...AS_FACTORY_SAT_SHIFT_RANGE),
  };
}

export function createFactory(
  position: { x: number; y: number },
  row = 0,
  scale: number = 0.9 + Math.random() * 0.2,
  id: string = crypto.randomUUID(),
  asShift: ColorShift = { hueShift: 0, satShift: 0 },
): Actor {
  const availableTypes = getRowConfig(row)?.availableFactoryTypes;
  const { hueShift, satShift, rooftopGreeble, facadeGreeble, beltCourseCount, purpose } =
    selectVariantFromSeed(id, position.x, row, availableTypes);

  return {
    id,
    type: ActorType.FACTORY,
    position: { x: Math.round(position.x), y: Math.round(position.y) },
    scaleX: scale,
    scaleY: scale,
    rotation: 0,
    isActive: true,
    cooldownRemaining: PRODUCTION_INTERVAL,
    config: {
      productionInterval: PRODUCTION_INTERVAL,
      row,
      hueShift: hueShift + asShift.hueShift,
      satShift: satShift + asShift.satShift,
      rooftopGreeble,
      facadeGreeble,
      beltCourseCount,
      purpose,
    },
  };
}

export function placeFactories(localeId: string): Actor[] {
  const actors: Actor[] = [];
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  const noiseMap = locale ? getLocaleNoiseMap(localeId, locale.coordinates.x, locale.coordinates.y) : null;
  // NEW — resolve the locale's own planet internally, mirroring the locale
  // noise map lookup one line above. placeFactories' exported signature is
  // unchanged; this is a new usePlanetStore dependency, not a new parameter.
  const planet = locale ? usePlanetStore.getState().planets.find((p) => p.id === locale.planetId) : undefined;
  const asNoiseMap = planet ? getPlanetNoiseMap(planet.id, planet.name) : null;
  let factoryIndex = 0;

  function nextFactory(position: { x: number; y: number }, row: number): Actor {
    const index = factoryIndex++;
    const id = noiseMap
      ? generateFactoryId(noiseMap, index)
      : `factory-${index}-${alea(`${localeId}:factory:${index}:id`)().toString(36).slice(2, 10)}`;
    const scale = noiseMap
      ? getSeededVal(noiseMap, 'factory.scale', index, 0.9, 1.1)
      : 0.9 + alea(`${localeId}:factory:${index}:scale`)() * 0.2;
    const asShift = asNoiseMap ? deriveAsColorShift(asNoiseMap, index) : { hueShift: 0, satShift: 0 };
    return createFactory(position, row, scale, id, asShift);
  }

  // ...FACTORY_ROWS.forEach(...) unchanged below this point...
}

/**
 * Recolor an existing locale's factories in place for a new Attenuation
 * Style — position/count/id/variant/scale/greebles/purpose are all
 * untouched; only each factory's stored hueShift/satShift change. Re-derives
 * each factory's locale-seeded LOCAL shift from scratch (same inputs
 * Factory.tsx's own render already recomputes) rather than trying to
 * subtract out the previous AS delta, so repeated AS changes never
 * accumulate drift. Called only from retransmitPlanetOnly (§1.2/§3) — never
 * from placeFactories' own fresh-spawn path, which folds the current AS's
 * shift in at creation time instead.
 */
export function recolorFactoriesForAttenuationStyle(localeId: string, planetId: string, planetName: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const asNoiseMap = getPlanetNoiseMap(planetId, planetName);

  let factoryIndex = 0;
  const nextActors = locale.actors.map((actor) => {
    if (actor.type !== ActorType.FACTORY) return actor;
    const index = factoryIndex++;
    // ?? 1 matches Factory.tsx's own render-time default exactly (not
    // createFactory's ?? 0 spawn-time default) — this must reproduce what's
    // actually rendered, and every real spawned factory always has
    // config.row set regardless, so the two defaults never actually diverge
    // in practice.
    const row = actor.config?.row ?? 1;
    const availableTypes = getRowConfig(row)?.availableFactoryTypes;
    const { hueShift: localHue, satShift: localSat } = selectVariantFromSeed(actor.id, actor.position.x, row, availableTypes);
    const asShift = deriveAsColorShift(asNoiseMap, index);
    return {
      ...actor,
      config: {
        ...actor.config,
        hueShift: localHue + asShift.hueShift,
        satShift: localSat + asShift.satShift,
      },
    };
  });

  useLocaleStore.getState().setLocaleData(localeId, { actors: nextActors });
}
```

**`components/panels/screen/worldView/PlanetView.tsx`** (full replacement — one computation, two consumers):

```typescript
function PlanetView({ planetId }: PlanetViewProps) {
  const planet = usePlanetStore((s) => s.planets.find((p) => p.id === planetId));
  const localeId = planet?.currentLocaleId ?? '';

  const [currentHour, setCurrentHour] = useState(() => {
    const locale = useLocaleStore.getState().locales[localeId];
    return locale ? computeLocaleHour(locale.dayStartTimestamp) : 0;
  });

  useEffect(() => {
    const tick = () => {
      const locale = useLocaleStore.getState().locales[localeId];
      if (!locale) return;
      const hour = computeLocaleHour(locale.dayStartTimestamp);
      setCurrentHour(hour);
      // No second computeLocalTime pass — hour already IS this locale's own
      // local time, computed directly from its own dayStartTimestamp.
      useUIStore.getState().setActiveLocaleLocalTime(hour);
    };

    tick();
    const id = setInterval(tick, 1000); // wall-clock UI display tick, not musical timing
    return () => clearInterval(id);
  }, [localeId]);

  if (!planet) return null;

  return (
    <div className="planet-view">
      <LocaleView localeId={localeId} localTime={currentHour} />
    </div>
  );
}
```

**`components/panels/screen/worldView/LocaleView.tsx`** (prop renamed to match what it now is; `computeLocalTime` call dropped):

```typescript
interface LocaleViewProps {
  localeId: string;
  localTime: number; // was currentHour — computeLocalTime's offset step is retired, this IS the final value
}

function LocaleView({ localeId, localTime }: LocaleViewProps) {
  const locale = useLocaleStore((s) => s.locales[localeId]);
  if (!locale) return null;

  return (
    <div className="locale-view">
      <OceanScene localTime={localTime} />
    </div>
  );
}
```

**`engine/harmonySystem.ts`** (doc comment only — no functional change, `getCurrentHour()` was already the real source):

```typescript
// Exactly 8 note-name strings (no octave digit) per hour-equivalent.
// Octave is determined per-robot at spawn time; melody events store note index + octave separately.
// Hour is derived from beatClock.ts's own measure-based getCurrentHour() (see
// import above) — a 96-measure day cycle, unrelated to Planet/Locale world
// time entirely. (Previously this comment claimed the hour came from
// selectCurrentPlanet(usePlanetStore.getState())?.currentHour — already
// inaccurate before this phase; currentHour itself is deleted as of
// docs/specs/ATTENUATION_STYLE.md.)
export type EighthNotes = [string, string, string, string, string, string, string, string];
```

**`components/panels/screen/TransportBar.tsx`** (one line):

```typescript
<span className="transport-bar__planet">
  <VisuallyHidden>Attenuation Style: </VisuallyHidden>
  {planetName}
</span>
```

Class name (`transport-bar__planet`) and JS variable name (`planetName`) are unchanged — internal identifiers, not user-facing text, per §1.3.

**`data/sectorSettingsConfig.ts`** (label copy only — identifiers unchanged):

```typescript
export const PLANET_NAME_SCHEMA: TextInputSchema = {
  id: 'sectorSettings.planetName',
  type: 'textInput',
  loreLabel: 'ATTENUATION SEED', // was 'CALIBRATION SEED'
  humanLabel: 'Attenuation Style', // was 'Planet Name'
  placeholder: 'Enter a new attenuation style…', // was 'Enter a new planet name…'
  maxLength: 128,
};
```

`PLANET_NAME_PRESETS`' four `label`/`value` pairs are **not** changed by this spec — they stay the current Kryndara/Vessport Null/Halcyon Drift/The Rusting placeholders, structurally unchanged (still 4 `SectorPreset<string>` entries), pending real AS-flavored replacement copy at Tasks/implementation time (§7). Do not invent final names here.

* **Naming Conventions:** No new files, no renamed files/exports beyond the `LocaleViewProps.currentHour → localTime` rename (justified in §1.1 — the value it carries genuinely changed meaning, from a shared planet-wide hour to an already-resolved local time).
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in § 2.
* **`constants/time.test.ts` (modified):** `computeLocaleHour(dayStartTimestamp)` returns `0` at `dayStartTimestamp = Date.now()`; returns `~12` at `dayStartTimestamp = Date.now() - DAY_DURATION_MS/2`; wraps correctly past 24. `DAY_DURATION_MS` equals `360000`. No `computePlanetHour`/`computeLocalTime`/`PLANET_DURATION_MS` exports remain (a type-level or explicit "not exported" assertion).
* **`seedUtils.test.ts` (modified):** remove `planetInitialHour` coverage; `derivePlanetSeed`/override tests unchanged.
* **`worldTransition.test.ts` (modified) — new coverage, existing branch tests need no structural change:**
  1. `buildLocale` (exercised indirectly via `retransmitCoordsOnly`/`retransmitBoth`) stamps a `dayStartTimestamp` such that `computeLocaleHour` on it immediately after creation equals `Math.abs(x % 24)` (within a tight tolerance for test execution time), for both a positive and a negative `x`.
  2. `retransmitPlanetOnly` does **not** change the preserved locale's `dayStartTimestamp` — assert byte-identical before/after.
  3. `retransmitPlanetOnly` calls `recolorFactoriesForAttenuationStyle` exactly once, with the preserved locale's id and the *new* planet's id/name (spy/mock). `retransmitCoordsOnly`/`retransmitBoth` never call it.
  4. A locale's `actors` array after `retransmitPlanetOnly` has the same length, same `id`s in the same order, and same `position`/`scaleX`/`scaleY` as before — only `config.hueShift`/`config.satShift` may differ.
* **`factoryPlacementSystem.test.ts` (modified):**
  1. `createFactory` with no `asShift` argument produces the same `hueShift`/`satShift` as before this phase (regression — default preserves existing behavior).
  2. `createFactory` with a supplied `asShift` sums it into the stored `hueShift`/`satShift` (not a replacement).
  3. `placeFactories` seeds distinct `asShift` values per factory when the locale's planet has a real noise map, and falls back to a zero shift (not a crash) if the locale's `planetId` doesn't resolve to any planet in the store.
  4. `recolorFactoriesForAttenuationStyle`: given a locale with existing factories, recoloring with a *different* AS noise map changes `hueShift`/`satShift` on every factory but changes nothing else (`id`/`position`/`scaleX`/`scaleY`/`row`/`rooftopGreeble`/`facadeGreeble`/`beltCourseCount`/`purpose` all byte-identical before/after — the assertion that actually proves "in place").
  5. `recolorFactoriesForAttenuationStyle` is idempotent under repeated calls with the *same* AS (same noise map in, same output out — no drift).
  6. Calling `recolorFactoriesForAttenuationStyle` on a locale with zero factories, or a nonexistent locale id, is a safe no-op.
* **`planetStore.test.ts` (modified):** remove the `setPlanetSize`, `setCurrentHour`, and `setDayStartTimestamp` describe-blocks in full (all three actions deleted). `addPlanet`'s remaining behavior (name-uniqueness rejection, noise-map priming) keeps its existing coverage unchanged.
* **`harmonySystem.test.ts`:** no change — its local `currentHour` variable mocks `beatClock.getCurrentHour()` and is unrelated to `Planet.currentHour`; confirm this explicitly during Tasks so it isn't mistakenly "fixed" as if it were the same symbol.
* **`localeStore.test.ts` (modified):** `DEFAULT_LOCALE` fixture (and any locale fixtures constructed inline) gain a `dayStartTimestamp`; any test asserting the full shape of `DEFAULT_LOCALE` updates accordingly.
* **`TransportBar.test.tsx` (modified):** `TEST_PLANET` fixture drops `size`/`dayStartTimestamp`; the "labels each metadata field with real text" test's `['.transport-bar__planet', 'Planet', 'Glaxos']` row updates its expected label substring to `'Attenuation Style'`.
* **`sectorSettingsConfig.test.ts` (modified):** `PLANET_NAME_SCHEMA.humanLabel`/`placeholder` assertions (if any exist beyond generic "has a humanLabel" checks) updated to the new copy; preset-count assertions (still 4 entries) unchanged.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors (this is the step most likely to surface a missed call site for any deleted field/function — `Planet.size`/`dayStartTimestamp`/`setPlanetSize`/`setDayStartTimestamp`/`PlanetSize`/`PLANET_DURATION_MS`/`computePlanetHour`/`computeLocalTime`/`planetInitialHour`).
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** load the app fresh and confirm the World Time readout matches `abs(x % 24)` hours, `00` minutes for the default locale's coordinates; retransmit a new Attenuation Style (planet-name field only) and confirm the World Time display does **not** jump, while the factory skyline visibly recolors (same buildings, same layout, different hue); retransmit new coordinates only and confirm the World Time display *does* jump to the new coordinate's `abs(x % 24)` hour while factory colors on the new locale reflect the *unchanged* AS.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/attenuation-style` (already the active branch).
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) types + constants (`planet.ts`/`locale.ts`/`time.ts`/`time.test.ts`/`seedUtils.ts`), (2) stores (`planetStore.ts`/`localeStore.ts` + their tests), (3) `worldTransition.ts` + test (the time-formula inversion), (4) `factoryPlacementSystem.ts` + test (the AS-recolor mechanism — the largest single change, worth its own commit), (5) `PlanetView.tsx`/`LocaleView.tsx` (the call-chain collapse), (6) `TransportBar.tsx`/`sectorSettingsConfig.ts` copy changes + their tests, (7) `BUILDING_DESIGN.md` doc update last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code, not left open):

- ~~Does the retransmit branch inversion risk being written by analogy to today's structure?~~ **Addressed directly**: §1.1/§3 both flag it explicitly, and §5's worldTransition.test.ts coverage (#2) asserts the preserved locale's `dayStartTimestamp` is byte-identical, not just "close enough."
- ~~What exactly does "recolor factories in place" mean mechanically — replace the local shift, or add to it?~~ **Resolved: additive, never a replacement** — §1.2 walks through why (folding the AS seed into `selectVariantFromSeed`'s own PRNG stream would cascade into variant/greeble selection, which must not change).
- ~~Does `Planet.currentHour`/`setCurrentHour` need to go too, since world time is moving off Planet entirely?~~ **Resolved: yes, per explicit confirmation** — confirmed dead by direct grep (zero production call sites, one stale doc comment claiming otherwise), not named in the intent doc's own deletion list, but deleted anyway rather than left as an orphaned dead pair beside `dayStartTimestamp`/`size`. Two knock-on doc fixes (`harmonySystem.ts`'s stale comment, `docs/CONTRIBUTION_GUIDE.md`'s now-inaccurate line) came along as direct, necessary consequences — see §1.1/§2/§3.

Still open — flag for Tasks/implementation, not blocking this spec:

1. **The four `PLANET_NAME_PRESETS` values are TBD, per the intent doc's own explicit Out-of-scope line.** This spec proposes schema *label* copy (§4) but deliberately does not invent replacement preset names — Kryndara/Vessport Null/Halcyon Drift/The Rusting stay as placeholders until a Tasks-time (or later) decision.
2. **`AS_FACTORY_HUE_SHIFT_RANGE`/`AS_FACTORY_SAT_SHIFT_RANGE` (`[-30, 30]`/`[-20, 20]`) are a first-pass default, not specified by the intent doc.** The intent doc says only that an AS change must visibly recolor existing factories — it doesn't bound the magnitude. Confirm these read as a real, legible shift (matching CONSOLE_THEMING.md's own "bounded and legible" philosophy for seed-driven chrome) during manual verification; adjust before merge if a bad roll either does nothing visible or overwhelms the variant's own base palette.
3. **`Planet.locales: string[]` remains a stale, never-appended-to array** (SECTOR_SETTINGS.md §7 item 5's own finding) — this phase's `buildPlanet` still initializes it to `[]` and nothing here changes that. Unrelated to this phase's own correctness (confirmed: `removePlanet`'s noise-map eviction cascade is the only reader, and this phase doesn't touch `removePlanet`), noted only for continuity with the earlier finding.
