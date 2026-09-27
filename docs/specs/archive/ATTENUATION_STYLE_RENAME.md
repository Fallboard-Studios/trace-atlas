# Phase Spec: Attenuation Style Internal Rename (Roadmap Phase 10.4)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/attenuation-style-rename.md](../intent/attenuation-style-rename.md)
(confirmed via direct conversation, 2026-08-29). Source of scope:
[docs/todo/roadmap.md § 10.4](../todo/roadmap.md#104-attenuation-style-internal-rename)
(inserted out of sequence, deliberately not renumbering later phases). Reverses
[docs/specs/ATTENUATION_STYLE.md](ATTENUATION_STYLE.md) §1.3/§3's explicit "no internal renames"
constraint — that spec is left untouched as the historical record of what was decided then; this
spec is the follow-up that decides differently now.

---

## 1. Overview & Claude Explanation

This is a pure identifier/copy rename, not a behavior change. Every exported type, function, store,
component, file, CSS class, and doc reference that uses "Planet" to mean the Attenuation Style (AS)
concept gets renamed to say so, spelled out in full (`AttenuationStyle`, no `AS` abbreviation in
code identifiers). Direct grep confirms zero `getSeededVal`/`precomputeDataX` `dataId` string
literals anywhere in `src/` contain "planet" — every `dataId` (e.g. `'factory.scale'`,
`'globalAudio.delay.enabled'`, `'lfoDrift.eq3.rateDrift'`) is already planet/AS-agnostic. This means
the rename **cannot** change any generated world's seed or determinism, by construction — there is
no `dataId` to accidentally touch.

Blast radius, confirmed by direct grep against this session's working tree: **52 `src/` files**
(~1,020 case-insensitive "planet" occurrences) and **~10 live-reference `docs/` files**. The
historical-docs boundary (§3) is broader than 10.1's own spec anticipated — grep turns up "planet"
identifier references not just in `docs/specs/ATTENUATION_STYLE.md`/`SECTOR_SETTINGS.md`/
`LOCALE_SEED_DECOUPLING.md` (10.1's own list) but in `docs/specs/AUDIO_RIG.md`, `AUDIO_RIG_V2.md`,
`LAYOUT.md`, `LFO_INTEGRATION.md`, `ROBOT_SELECTION.md`, `docs/intent/phase-2-layout.md`,
`sector-settings.md`, `locale-seed-decoupling.md`, and `docs/tasks/AUDIO_RIG.md`,
`LFO_INTEGRATION_PLAN.md` — every one of these documents a *different*, already-shipped phase that
happened to touch `usePlanetStore`/`planetId`/etc. at the time. §3 generalizes the boundary rather
than hand-listing every file.

### 1.1 Categorizing the 52 `src/` files

Not every file needs the same treatment. Four categories, in descending order of risk:

1. **Definition sites (rename the identifier itself)** — `types/planet.ts`, `types/locale.ts`
   (the `planetId` field), `stores/planetStore.ts`, `utils/seedUtils.ts`, `utils/noiseMaps.ts`,
   `systems/worldTransition.ts`, `systems/factoryPlacementSystem.ts` (the
   `recolorFactoriesForAttenuationStyle`/`placeFactories` internals), `utils/globalAudioSeed.ts`,
   `stores/audioStore.ts` (the planet-sync subscription), `data/sectorSettingsConfig.ts`,
   `components/panels/screen/worldView/PlanetView.tsx`+`.css`,
   `components/panels/screen/TransportBar.tsx`+`.css`, `main.tsx`. Full before/after in §4.
2. **Mechanical import/call-site cascades** — files that only `import { usePlanetStore,
   selectCurrentPlanet } from '.../planetStore'` (or similar) and call it; the rename is
   find-and-replace with zero logic change: `src/App.tsx`, `src/components/actors/Factory.tsx`,
   `src/components/robot/Robot.tsx`, `src/components/panels/screen/worldView/OceanScene.tsx`,
   `src/components/panels/screen/worldView/WorldView.tsx`,
   `src/components/panels/screen/console/SectorSettingsDrawer.tsx`, `src/utils/localeHelpers.ts`,
   `src/utils/getSeededVal.ts`, `src/types/index.ts` (barrel `export * from './planet.ts'` — file
   itself renames to `attenuationStyle.ts`), `src/stores/localeStore.ts` (imports
   `DEFAULT_LOCALE_ID` from the renamed store file; also has its own `planetId` field usage, see §4).
3. **Comment/prose-only mentions (no identifier changes needed in the file itself)** —
   `src/components/robot/RobotBody.tsx`, `src/components/panels/screen/worldView/LocaleView.tsx`,
   `src/utils/realWorldGradient.ts`, `src/data/globalAudioLoadingRanges.ts`,
   `src/data/globalAudioSeedRanges.ts`, `src/engine/AudioEngine.ts`, `src/engine/lfoDrift.ts`,
   `src/engine/harmonySystem.ts`, `src/systems/spawnSystem.ts` — update prose ("planet" → "AS"/
   "Attenuation Style") for accuracy; no code changes ride along.
4. **Test files** — every `.test.ts(x)` sibling of a file in categories 1–2 cascades the same
   rename into its own imports, mocks, fixtures (e.g. `TEST_PLANET`, `DEFAULT_PELAGOS` references),
   and `it(...)`/`describe(...)` description strings: `planetStore.test.ts` (→
   `attenuationStyleStore.test.ts`), `worldTransition.test.ts`, `factoryPlacementSystem.test.ts`,
   `localeStore.test.ts`, `sectorSettingsConfig.test.ts`, `TransportBar.test.tsx`,
   `SectorSettingsDrawer.test.tsx`, `WorldView.test.tsx`, `OceanScene.test.tsx`, `seedUtils.test.ts`,
   `noiseMaps.test.ts`, `globalAudioSeed.test.ts`, `audioStore.test.ts`, `AudioEngine.test.ts`,
   `idleSystem.test.ts`, `interactionSystem.test.ts`, `robotSystems.test.ts`, `spawnSystem.test.ts`,
   `localeHelpers.test.ts`. No new assertions — same behavior, renamed identifiers.

### 1.2 The one behavioral-adjacent decision: `Locale.planetId`

`Locale.planetId` → `Locale.attenuationStyleId` is a field rename, not a type change (still
`string`) — but it's the one rename that touches genuine cross-store plumbing:
`worldTransition.ts`'s `buildLocale`/`retransmitPlanetOnly` (both construct/patch this field),
`factoryPlacementSystem.ts`'s `placeFactories` (reads `locale.planetId` to resolve the AS noise
map), and `localeStore.ts`'s `DEFAULT_LOCALE`/`addLocale`. All call sites are within this phase's
own file list (§2) — confirmed by grep, no external caller reads `.planetId` directly.

### 1.3 `DEFAULT_PELAGOS`

Stays exactly as named, per the intent doc's explicit Constraint — it is the game's own proper-noun
default instance ("Pelagos"), not an instance of the generic concept being renamed. Only its
*type* changes, from `Planet` to `AttenuationStyle`; the constant name, its `id: 'pelagos'` literal,
and `DEFAULT_LOCALE_ID = 'pelagos-default'` are all untouched.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── attenuationStyle.ts   # RENAMED from planet.ts — Planet → AttenuationStyle;
│   │                          #   PlanetState deleted outright (dead — planetStore.ts never
│   │                          #   imports it, defines its own separate PlanetStore interface)
│   ├── locale.ts              # MODIFIED — Locale.planetId → Locale.attenuationStyleId;
│   │                          #   LocaleState.addLocale's planetId param → attenuationStyleId
│   └── index.ts                # MODIFIED — barrel re-export path updated to ./attenuationStyle.ts
├── stores/
│   ├── attenuationStyleStore.ts       # RENAMED from planetStore.ts — full rename, §4
│   ├── attenuationStyleStore.test.ts  # RENAMED from planetStore.test.ts
│   ├── localeStore.ts                  # MODIFIED — planetId field/param → attenuationStyleId;
│   │                                    #   import of DEFAULT_LOCALE_ID follows the store rename
│   ├── localeStore.test.ts             # MODIFIED — fixtures follow the field rename
│   ├── audioStore.ts                   # MODIFIED — regenerateGlobalAudioFromSeed/
│   │                                    #   regenerateGlobalLfoFromSeed(planetId, planetName) params
│   │                                    #   → (attenuationStyleId, attenuationStyleName);
│   │                                    #   syncGlobalAudioToCurrentPlanet →
│   │                                    #   syncGlobalAudioToCurrentAttenuationStyle;
│   │                                    #   usePlanetStore import/subscribe → useAttenuationStyleStore
│   └── audioStore.test.ts              # MODIFIED — mocks/fixtures follow
├── utils/
│   ├── seedUtils.ts        # MODIFIED — full rename, §4
│   ├── seedUtils.test.ts   # MODIFIED — follows
│   ├── noiseMaps.ts        # MODIFIED — full rename, §4
│   ├── noiseMaps.test.ts   # MODIFIED — follows
│   ├── globalAudioSeed.ts  # MODIFIED — generateGlobalAudioSettings/generateGlobalLfoSettings
│   │                        #   params (planetId, planetName) → (attenuationStyleId,
│   │                        #   attenuationStyleName); doc comments' "planet"/"a fresh planet" → AS
│   ├── globalAudioSeed.test.ts  # MODIFIED — call-site param names/fixtures follow
│   ├── getSeededVal.ts     # MODIFIED — import getGlobalPlanetSeedOverride → rename follows seedUtils
│   ├── localeHelpers.ts    # MODIFIED — import/call cascade (category 2)
│   ├── localeHelpers.test.ts    # MODIFIED — follows
│   ├── realWorldGradient.ts     # MODIFIED — comment only ("deterministic planet/locale content")
│   ├── globalAudioLoadingRanges.ts  # MODIFIED — comment only ("a fresh planet is allowed...")
│   └── globalAudioSeedRanges.ts     # MODIFIED — comment only ("the planet noise map")
├── data/
│   ├── sectorSettingsConfig.ts       # MODIFIED — full rename, §4
│   ├── sectorSettingsConfig.test.ts  # MODIFIED — follows
├── systems/
│   ├── worldTransition.ts       # MODIFIED — full rename, §4 (the phase's largest single file)
│   ├── worldTransition.test.ts  # MODIFIED — follows
│   ├── factoryPlacementSystem.ts       # MODIFIED — recolorFactoriesForAttenuationStyle's own
│   │                                    #   (planetId, planetName) params → (attenuationStyleId,
│   │                                    #   attenuationStyleName); placeFactories' internal
│   │                                    #   usePlanetStore/getPlanetNoiseMap calls follow the
│   │                                    #   store/util renames; locale.planetId read →
│   │                                    #   locale.attenuationStyleId
│   ├── factoryPlacementSystem.test.ts  # MODIFIED — fixtures (inline Locale objects with
│   │                                    #   planetId:) follow the field rename
│   ├── spawnSystem.ts           # MODIFIED — comment only ("seeds some effects' LFOs already-on
│   │                              #   per planet")
│   ├── spawnSystem.test.ts, idleSystem.test.ts, interactionSystem.test.ts,
│   │   robotSystems.test.ts     # MODIFIED — fixture/mock identifier follow-through only
├── engine/
│   ├── AudioEngine.ts       # MODIFIED — comment only ("Planet-sync's", "planet-sync")
│   ├── AudioEngine.test.ts  # MODIFIED — mock identifier follow-through
│   ├── lfoDrift.ts          # MODIFIED — comment only ("not seeded per-planet")
│   └── harmonySystem.ts     # MODIFIED — comment only (already AS-aware post-10.1; sweep for any
│                              #   residual "planet" wording)
├── components/
│   ├── panels/screen/
│   │   ├── TransportBar.tsx        # MODIFIED — usePlanetStore/selectCurrentPlanet import +
│   │   │                            #   planetName local var → attenuationStyleName;
│   │   │                            #   .transport-bar__planet → .transport-bar__attenuation-style
│   │   ├── TransportBar.css        # MODIFIED — class rename follows
│   │   ├── TransportBar.test.tsx   # MODIFIED — fixture/selector follow
│   │   ├── worldView/
│   │   │   ├── AttenuationStyleView.tsx  # RENAMED from PlanetView.tsx — full rename, §4
│   │   │   ├── AttenuationStyleView.css  # RENAMED from PlanetView.css —
│   │   │   │                              #   .planet-view → .attenuation-style-view
│   │   │   ├── WorldView.tsx             # MODIFIED — import path + usePlanetStore cascade
│   │   │   ├── WorldView.test.tsx        # MODIFIED — import path follows
│   │   │   ├── OceanScene.tsx            # MODIFIED — import/call cascade (category 2)
│   │   │   ├── OceanScene.test.tsx       # MODIFIED — follows
│   │   │   └── LocaleView.tsx            # MODIFIED — comment only (references "PlanetView.tsx"
│   │   │                                  #   by name — update to AttenuationStyleView.tsx)
│   │   └── console/
│   │       ├── SectorSettingsDrawer.tsx       # MODIFIED — import cascade; own doc comment sweep
│   │       │                                   #   for residual "planet" wording
│   │       └── SectorSettingsDrawer.test.tsx  # MODIFIED — fixture/mock follow
│   ├── actors/Factory.tsx    # MODIFIED — import/call cascade (category 2)
│   └── robot/
│       ├── Robot.tsx         # MODIFIED — import/call cascade (category 2)
│       └── RobotBody.tsx     # MODIFIED — comment only ("written by PlanetView every second" →
│                               #   "written by AttenuationStyleView every second")
├── App.tsx               # MODIFIED — import/call cascade (category 2)
└── main.tsx               # MODIFIED — setGlobalPlanetSeedOverride import/call →
                             #   setGlobalAttenuationStyleSeedOverride
docs/
├── PROCEDURAL_GENERATION.md  # MODIFIED — derivePlanetSeed/getPlanetNoiseMap/evictPlanetNoiseMap
│                              #   code samples and prose follow the rename; already partially
│                              #   updated this session (planetInitialHour removed) — this phase
│                              #   finishes the identifier pass
├── AUDIO_SYSTEM.md           # MODIFIED — generateGlobalAudioSettings(planetId, planetName)/
│                              #   generateGlobalLfoSettings(planetId, planetName) signatures in
│                              #   prose, "planet-sync"/"planet load/change"/"a fresh planet" → AS
│                              #   equivalents (§1.1's "Seeding" section, the phase's densest doc edit)
├── CONTRIBUTION_GUIDE.md     # MODIFIED — line 37's "`planetStore` — planet-level state" →
│                              #   "`attenuationStyleStore` — Attenuation-Style-level state";
│                              #   `usePlanetStore` selector mention → `useAttenuationStyleStore`
├── BUILDING_DESIGN.md        # MODIFIED — sweep for any residual `getPlanetNoiseMap`/`planetId`
│                              #   identifier mentions (prose already says "Attenuation Style" per
│                              #   10.1's Task 14; confirm no stale identifier slipped through)
├── COMPANIES.md              # MODIFIED — sweep for "planet-only retransmit" style phrasing that
│                              #   names the old identifier directly (concept-level "planet-only
│                              #   retransmit" prose can stay if it doesn't name a renamed symbol)
├── UI_SHELL.md                # MODIFIED — sweep (already AS-aware post this session's earlier pass)
├── HARMONY_SYSTEM.md          # MODIFIED — sweep (already AS-aware post this session's earlier pass)
├── CLAUDE.md                  # MODIFIED — no reference-doc list change; sweep Key Terms/guardrail
│                              #   prose for any "planetStore"/"Planet" mention that should say AS
└── specs/ATTENUATION_STYLE_RENAME.md  # this file
```

No new dependency. File renames: `types/planet.ts` → `types/attenuationStyle.ts`,
`stores/planetStore.ts`(+`.test.ts`) → `stores/attenuationStyleStore.ts`(+`.test.ts`),
`components/.../PlanetView.tsx`+`.css` → `AttenuationStyleView.tsx`+`.css`.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless a grep pass surfaces a genuinely missed
  call site — if so, add it to this list rather than silently expanding scope undocumented.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **This phase deliberately reverses 10.1's own no-rename constraint.** Do not treat
  [docs/specs/ATTENUATION_STYLE.md](ATTENUATION_STYLE.md) §1.3/§3 as still binding for the
  identifiers it named — that spec documents a past decision, not a present one.
* **`DEFAULT_PELAGOS` keeps its own name** (§1.3) — only its type changes, `Planet` →
  `AttenuationStyle`. Its literal `id: 'pelagos'` and `DEFAULT_LOCALE_ID = 'pelagos-default'` are
  untouched.
* **`PlanetState` is deleted, not renamed** — confirmed dead (never imported by `planetStore.ts`,
  which defines its own separate `PlanetStore` interface).
* **`PLANET_NAME_PRESETS`' four string values are unchanged, only the constant name renames** to
  `ATTENUATION_STYLE_PRESETS` — Kryndara/Vessport Null/Halcyon Drift/The Rusting stay exactly as
  they are; that content TBD is 10.1's own open item (§7 of its spec), unrelated to this identifier
  rename.
* **No behavior changes anywhere.** Every function's logic, every component's render output, every
  store's state shape (field renames aside) is identical before and after. The existing test suite
  is the verification: after the rename, it should pass with renamed-but-otherwise-unchanged
  assertions — a test needing a *new* assertion to pass is a sign the rename accidentally changed
  behavior, and must be investigated before merging, not fixed by adding the assertion.
* **`window.__GLOBAL_PLANET_SEED__` → `window.__GLOBAL_ATTENUATION_STYLE_SEED__`**, end to end
  (`seedUtils.ts`'s boot-read, any doc mentioning it). The `?seed=` URL query param name itself is
  untouched — it never said "planet." This is a deliberate breaking change to the debug-override
  surface, confirmed acceptable for a solo-dev project (per the intent doc's explicit decision).
* **Historical-docs boundary, generalized beyond 10.1's own three-file list** (confirmed by grep,
  §1): every doc under `docs/specs/`, `docs/tasks/`, and `docs/intent/` that documents an
  **already-shipped** phase — not just the Attenuation Style/Sector Settings/Locale Seed Decoupling
  ones 10.1 named, but also `AUDIO_RIG.md`, `AUDIO_RIG_V2.md`, `LAYOUT.md`, `LFO_INTEGRATION.md`,
  `ROBOT_SELECTION.md`, `phase-2-layout.md`, `sector-settings.md`,
  `locale-seed-decoupling.md`, `tasks/AUDIO_RIG.md`, `tasks/LFO_INTEGRATION_PLAN.md`, and this
  roadmap's own `## 10.1`/`## 10.2`/`## 10.3` sections and every numbered phase before them — **stay
  untouched**. They're records of what was actually decided/built at the time, including
  identifiers that have since been renamed. Only:
  - **Live reference docs** — the `docs/*.md` files directly under `docs/` that CLAUDE.md's
    reference-doc list points at, meant to describe current behavior at all times (already the
    precedent: 10.1 itself updated `BUILDING_DESIGN.md`/`CONTRIBUTION_GUIDE.md` as direct
    knock-on fixes) — get their identifier references updated to match.
  - **Not-yet-shipped roadmap sections** (`## 11`, `## 12`, and this phase's own new `## 10.4`) —
    already updated this session for Phase 11/12's "planet seed" → "AS seed" wording; no further
    change needed here.
  - **`docs/intent/attenuation-style-rename.md` and this spec** — living documents for *this*
    phase, obviously current.
* **Docs that mix historical narration with a still-current code sample** (none identified in this
  pass — confirmed by direct inspection that every `docs/specs/*`/`docs/tasks/*`/`docs/intent/*`
  file touching a renamed identifier is purely narrating what shipped, not itself a live contract)
  — flag to the human immediately if implementation finds one, rather than guessing which half to
  update.

---

## 4. Code Style & Architecture Conventions

**`types/attenuationStyle.ts`** (renamed from `types/planet.ts`, `PlanetState` deleted):

```typescript
export interface AttenuationStyle {
  id: string;
  name: string;
  locales: string[];
  currentLocaleId?: string;
}
```

**`types/locale.ts`** (diff — field rename only):

```typescript
export interface Locale {
  id: string;
  attenuationStyleId: string;  // was planetId
  name: string;
  coordinates: LocaleCoordinates;
  dayStartTimestamp: number;
  robots: Robot[];
  actors: Actor[];
  companies: Company[];
  settings: LocaleSettings;
  currentMeasure: number;
}

export interface LocaleState {
  locales: Record<string, Locale>;
  addLocale: (attenuationStyleId: string, locale: Locale) => void;  // was planetId
  // ...rest unchanged
}
```

**`stores/attenuationStyleStore.ts`** (renamed from `stores/planetStore.ts` — full rename):

```typescript
import { create } from 'zustand';

import type { AttenuationStyle } from '../types/attenuationStyle';
import { resolveDefaultAttenuationStyleName } from '../utils/seedUtils';
import { getAttenuationStyleNoiseMap, evictAttenuationStyleNoiseMap, evictLocaleNoiseMap } from '../utils/noiseMaps';
import { devWarn } from '../utils/helpers';

export const DEFAULT_LOCALE_ID = 'pelagos-default';

export const DEFAULT_ATTENUATION_STYLE_NAME = resolveDefaultAttenuationStyleName();

export const DEFAULT_PELAGOS: AttenuationStyle = {
  id: 'pelagos',
  name: DEFAULT_ATTENUATION_STYLE_NAME,
  locales: [DEFAULT_LOCALE_ID],
  currentLocaleId: DEFAULT_LOCALE_ID,
};

getAttenuationStyleNoiseMap('pelagos', DEFAULT_ATTENUATION_STYLE_NAME);

export interface AttenuationStyleStore {
  attenuationStyles: AttenuationStyle[];
  currentAttenuationStyleId: string;
  addAttenuationStyle: (attenuationStyle: AttenuationStyle) => boolean;
  removeAttenuationStyle: (attenuationStyleId: string) => void;
  setCurrentLocale: (attenuationStyleId: string, localeId: string) => void;
  setCurrentAttenuationStyleId: (attenuationStyleId: string) => void;
}

export function selectCurrentAttenuationStyle(state: AttenuationStyleStore): AttenuationStyle | undefined {
  return state.attenuationStyles.find((p) => p.id === state.currentAttenuationStyleId);
}

export const useAttenuationStyleStore = create<AttenuationStyleStore>((set) => ({
  attenuationStyles: [DEFAULT_PELAGOS],
  currentAttenuationStyleId: DEFAULT_PELAGOS.id,

  addAttenuationStyle: (attenuationStyle) => {
    let added = false;
    set((state) => {
      const nameTaken = state.attenuationStyles.some(
        (p) => p.name.toLowerCase() === attenuationStyle.name.toLowerCase()
      );
      if (nameTaken) {
        devWarn(
          `[attenuationStyleStore] addAttenuationStyle: name "${attenuationStyle.name}" is already taken. Not added.`
        );
        return state;
      }
      added = true;
      getAttenuationStyleNoiseMap(attenuationStyle.id, attenuationStyle.name);
      return { attenuationStyles: [...state.attenuationStyles, attenuationStyle] };
    });
    return added;
  },

  removeAttenuationStyle: (attenuationStyleId) =>
    set((state) => {
      const attenuationStyle = state.attenuationStyles.find((p) => p.id === attenuationStyleId);
      if (attenuationStyle) {
        attenuationStyle.locales.forEach((localeId) => evictLocaleNoiseMap(localeId));
        evictAttenuationStyleNoiseMap(attenuationStyleId);
      }
      return { attenuationStyles: state.attenuationStyles.filter((p) => p.id !== attenuationStyleId) };
    }),

  setCurrentLocale: (attenuationStyleId, localeId) =>
    set((state) => ({
      attenuationStyles: state.attenuationStyles.map((p) =>
        p.id === attenuationStyleId ? { ...p, currentLocaleId: localeId } : p
      ),
    })),

  setCurrentAttenuationStyleId: (attenuationStyleId) => set({ currentAttenuationStyleId: attenuationStyleId }),
}));

export default useAttenuationStyleStore;
```

Note the `planets`/`planet` local variable names throughout the original also become
`attenuationStyles`/`attenuationStyle` — this is the file with the highest identifier-density in the
whole rename; budget the most review attention here, mirroring how 10.1's own spec flagged its
riskiest file.

**`utils/seedUtils.ts`** (full rename — every export and the module-level override):

```typescript
export function deriveAttenuationStyleSeed(name: string): string {
  if (GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE) return GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE;
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

let GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE: string | null = null;

if (typeof window !== 'undefined') {
  const bootOverride = (globalThis as unknown as { __GLOBAL_ATTENUATION_STYLE_SEED__?: string }).__GLOBAL_ATTENUATION_STYLE_SEED__ ?? null;
  const qsOverride = new URLSearchParams(window.location.search).get('seed');  // ?seed= unchanged
  const initial = (typeof bootOverride === 'string' && bootOverride) ? bootOverride : qsOverride;
  if (initial) {
    GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE = String(initial).toLowerCase().replace(/[^a-z0-9]/g, '');
  }
}

export function setGlobalAttenuationStyleSeedOverride(seed: string | null): void {
  GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE = seed
    ? seed.toLowerCase().replace(/[^a-z0-9]/g, '')
    : null;
}

export function getGlobalAttenuationStyleSeedOverride(): string | null {
  return GLOBAL_ATTENUATION_STYLE_SEED_OVERRIDE;
}

export function generateRandomAttenuationStyleName(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function resolveDefaultAttenuationStyleName(): string {
  const override = getGlobalAttenuationStyleSeedOverride();
  return override ?? generateRandomAttenuationStyleName();
}
```

**`utils/noiseMaps.ts`** (full rename):

```typescript
import { deriveAttenuationStyleSeed, getGlobalAttenuationStyleSeedOverride } from './seedUtils';

const attenuationStyleMaps = new Map<string, NoiseFunction2D>();
const localeMaps = new Map<string, NoiseFunction2D>();

export function getAttenuationStyleNoiseMap(attenuationStyleId: string, attenuationStyleName: string): NoiseFunction2D {
  if (!attenuationStyleMaps.has(attenuationStyleId)) {
    const seed = deriveAttenuationStyleSeed(attenuationStyleName);
    attenuationStyleMaps.set(attenuationStyleId, createNoise2D(alea(seed)));
  }
  return attenuationStyleMaps.get(attenuationStyleId)!;
}

export function getLocaleNoiseMap(localeId: string, x: number, y: number): NoiseFunction2D {
  if (!localeMaps.has(localeId)) {
    const global = getGlobalAttenuationStyleSeedOverride();
    const key = global ? `${global}:${x}:${y}` : `${x}:${y}`;
    localeMaps.set(localeId, createNoise2D(alea(key)));
  }
  return localeMaps.get(localeId)!;
}

export function tryGetLocaleNoiseMap(localeId: string): NoiseFunction2D | null {
  return localeMaps.get(localeId) ?? null;
}

export function evictAttenuationStyleNoiseMap(attenuationStyleId: string): void {
  attenuationStyleMaps.delete(attenuationStyleId);
}

export function evictLocaleNoiseMap(localeId: string): void {
  localeMaps.delete(localeId);
}
```

The internal `Map` variable name (`planetMaps` → `attenuationStyleMaps`) changes too — it's a
private module-scope variable, zero external callers, purely cosmetic but included for consistency
since this file is otherwise fully renamed.

**`systems/worldTransition.ts`** (full rename — every construction helper, the retransmit branches,
and `RetransmitInput`):

```typescript
export interface RetransmitInput {
  /** Present only if the user edited the Attenuation Style name field. */
  attenuationStyleName?: string;
  coordinates?: { x: number; y: number };
}

/** Construct a fresh AttenuationStyle. */
function buildAttenuationStyle(name: string): AttenuationStyle {
  return { id: crypto.randomUUID(), name, locales: [] };
}

function buildLocale(attenuationStyleId: string, coordinates: { x: number; y: number }): Locale {
  return {
    id: crypto.randomUUID(),
    attenuationStyleId,
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

type RetransmitAction =
  | { mode: 'noop' }
  | { mode: 'coordsOnly'; coordinates: { x: number; y: number } }
  | { mode: 'attenuationStyleOnly'; attenuationStyleName: string }
  | { mode: 'both'; attenuationStyleName: string; coordinates: { x: number; y: number } };

function resolveRetransmitAction(input: RetransmitInput): RetransmitAction {
  const { attenuationStyleName, coordinates } = input;
  if (!attenuationStyleName && !coordinates) return { mode: 'noop' };
  if (coordinates && !attenuationStyleName) return { mode: 'coordsOnly', coordinates };
  if (attenuationStyleName && !coordinates) return { mode: 'attenuationStyleOnly', attenuationStyleName };
  return { mode: 'both', attenuationStyleName: attenuationStyleName!, coordinates: coordinates! };
}

function retransmitCoordsOnly(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, coordinates: { x: number; y: number }): void {
  const newLocale = buildLocale(oldAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(oldAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id);
  useAttenuationStyleStore.getState().setCurrentLocale(oldAttenuationStyle.id, newLocale.id);
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
}

function createNewAttenuationStyle(attenuationStyleName: string): AttenuationStyle {
  const newAttenuationStyle = buildAttenuationStyle(attenuationStyleName);
  useAttenuationStyleStore.getState().addAttenuationStyle(newAttenuationStyle);
  return newAttenuationStyle;
}

function finalizeAttenuationStyleTransition(newAttenuationStyle: AttenuationStyle, oldAttenuationStyle: AttenuationStyle): void {
  useAttenuationStyleStore.getState().setCurrentAttenuationStyleId(newAttenuationStyle.id);
  useAttenuationStyleStore.getState().removeAttenuationStyle(oldAttenuationStyle.id);
}

function retransmitAttenuationStyleOnly(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, attenuationStyleName: string): void {
  const newAttenuationStyle = createNewAttenuationStyle(attenuationStyleName);
  let preservedCoords: { x: number; y: number } | undefined;

  if (oldLocaleId) {
    preservedCoords = useLocaleStore.getState().getLocaleById(oldLocaleId)?.coordinates;
    useLocaleStore.getState().setLocaleData(oldLocaleId, { attenuationStyleId: newAttenuationStyle.id });
    useAttenuationStyleStore.getState().setCurrentLocale(newAttenuationStyle.id, oldLocaleId);
    recolorFactoriesForAttenuationStyle(oldLocaleId, newAttenuationStyle.id, newAttenuationStyle.name);
  }

  finalizeAttenuationStyleTransition(newAttenuationStyle, oldAttenuationStyle);
  if (oldLocaleId && preservedCoords) getLocaleNoiseMap(oldLocaleId, preservedCoords.x, preservedCoords.y);
}

function retransmitBoth(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, attenuationStyleName: string, coordinates: { x: number; y: number }): void {
  const newAttenuationStyle = createNewAttenuationStyle(attenuationStyleName);
  const newLocale = buildLocale(newAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(newAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id);
  useAttenuationStyleStore.getState().setCurrentLocale(newAttenuationStyle.id, newLocale.id);
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
  finalizeAttenuationStyleTransition(newAttenuationStyle, oldAttenuationStyle);
}

export function retransmitWorld(input: RetransmitInput): void {
  const action = resolveRetransmitAction(input);
  if (action.mode === 'noop') return;

  useUIStore.getState().selectRobot(null);
  const oldAttenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!oldAttenuationStyle) return;
  const oldLocaleId = oldAttenuationStyle.currentLocaleId;

  switch (action.mode) {
    case 'coordsOnly':
      retransmitCoordsOnly(oldAttenuationStyle, oldLocaleId, action.coordinates);
      break;
    case 'attenuationStyleOnly':
      retransmitAttenuationStyleOnly(oldAttenuationStyle, oldLocaleId, action.attenuationStyleName);
      break;
    case 'both':
      retransmitBoth(oldAttenuationStyle, oldLocaleId, action.attenuationStyleName, action.coordinates);
      break;
  }
}
```

`initializeLocale` is unchanged — it never references anything being renamed. Every doc-comment in
this file referencing `docs/specs/ATTENUATION_STYLE.md §1.1/§3` keeps that reference (historical,
correct); comments describing *today's* mechanism in "planet" terms (e.g. "Planet changed,
coordinates preserved") get their prose updated to "Attenuation Style changed" for consistency, same
edit motion as the identifiers around them.

**`systems/factoryPlacementSystem.ts`** (signature-level diff only — logic unchanged):

```typescript
import { usePlanetStore } from '...'; // → import { useAttenuationStyleStore } from '...'
// ...
const attenuationStyle = locale
  ? useAttenuationStyleStore.getState().attenuationStyles.find((p) => p.id === locale.attenuationStyleId)
  : undefined;
const asNoiseMap = attenuationStyle ? getAttenuationStyleNoiseMap(attenuationStyle.id, attenuationStyle.name) : null;

// ...

export function recolorFactoriesForAttenuationStyle(
  localeId: string,
  attenuationStyleId: string,   // was planetId
  attenuationStyleName: string, // was planetName
): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;
  const asNoiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  // ...rest unchanged (deriveAsColorShift, DEFAULT_FACTORY_ROW logic, etc.)
}
```

**`utils/globalAudioSeed.ts`** (params rename on both exported generators; internal sampling logic
unchanged):

```typescript
export function generateGlobalAudioSettings(attenuationStyleId: string, attenuationStyleName: string): GlobalAudioSettings {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  // ...rest unchanged
}

export function generateGlobalLfoSettings(
  attenuationStyleId: string,
  attenuationStyleName: string,
): Record<GlobalLfoTargetId, LfoSettings & { active: boolean }> {
  const noiseMap = getAttenuationStyleNoiseMap(attenuationStyleId, attenuationStyleName);
  // ...rest unchanged
}
```

**`stores/audioStore.ts`** (the planet-sync subscription, renamed):

```typescript
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from './attenuationStyleStore';

// ...AudioStore interface: regenerateGlobalAudioFromSeed/regenerateGlobalLfoFromSeed's own
// (planetId, planetName) params → (attenuationStyleId, attenuationStyleName), body unchanged
// beyond the param names threading through to generateGlobalAudioSettings/generateGlobalLfoSettings.

function syncGlobalAudioToCurrentAttenuationStyle(): void {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  if (!attenuationStyle) return;
  useAudioStore.getState().regenerateGlobalAudioFromSeed(attenuationStyle.id, attenuationStyle.name);
  useAudioStore.getState().regenerateGlobalLfoFromSeed(attenuationStyle.id, attenuationStyle.name);
}
syncGlobalAudioToCurrentAttenuationStyle();
useAttenuationStyleStore.subscribe((state, prevState) => {
  if (state.currentAttenuationStyleId !== prevState.currentAttenuationStyleId) {
    syncGlobalAudioToCurrentAttenuationStyle();
  }
});
```

**`data/sectorSettingsConfig.ts`** (constant renames; string values and every other schema
untouched):

```typescript
export const ATTENUATION_STYLE_SCHEMA: TextInputSchema = {
  id: 'sectorSettings.planetName',  // unchanged — a UI schema id string, not a renamed identifier;
                                      // no external contract depends on it changing, so leave it
                                      // rather than manufacture churn (confirm during Task review)
  type: 'textInput',
  loreLabel: 'ATTENUATION SEED',
  humanLabel: 'Attenuation Style',
  placeholder: 'Enter a new attenuation style…',
  maxLength: 128,
};

export const ATTENUATION_STYLE_PRESETS: SectorPreset<string>[] = [
  { label: 'Kryndara', value: 'Kryndara' },
  { label: 'Vessport Null', value: 'Vessport Null' },
  { label: 'Halcyon Drift', value: 'Halcyon Drift' },
  { label: 'The Rusting', value: 'The Rusting' },
];
```

Flagged inline: `id: 'sectorSettings.planetName'` is a schema id string, not a code identifier —
it's read by `ControlSchema` consumers keyed by the string itself, not by any symbol named
`PLANET_NAME_SCHEMA`. Renaming it is optional polish, not required for the "no ambiguous internal
name" goal (nothing else in the codebase reads this string and assumes it means something else).
Leaving it as `sectorSettings.planetName` is the recommended default — confirm during Tasks review
rather than deciding unilaterally here, since it's genuinely a judgment call either way.

**`components/panels/screen/worldView/AttenuationStyleView.tsx`** (renamed from `PlanetView.tsx`):

```typescript
import { useAttenuationStyleStore } from '@/stores/attenuationStyleStore';
import './AttenuationStyleView.css';

interface AttenuationStyleViewProps {
  attenuationStyleId: string;  // was planetId
}

function AttenuationStyleView({ attenuationStyleId }: AttenuationStyleViewProps) {
  const attenuationStyle = useAttenuationStyleStore((s) => s.attenuationStyles.find((p) => p.id === attenuationStyleId));
  const localeId = attenuationStyle?.currentLocaleId ?? '';
  // ...rest of the component body unchanged (computeLocaleHour/dayStartTimestamp logic
  // untouched by this phase — that's 10.1's mechanism, not this rename's concern)

  if (!attenuationStyle) return null;

  return (
    <div className="attenuation-style-view">
      <LocaleView localeId={localeId} localTime={currentHour} />
    </div>
  );
}

export default AttenuationStyleView;
```

```css
/* AttenuationStyleView.css */
.attenuation-style-view {
  width: 100%;
  height: 100%;
}
```

**`components/panels/screen/TransportBar.tsx`** (import + local var + CSS class rename; the
`<VisuallyHidden>` copy is already correct from 10.1, untouched here):

```typescript
import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '../../../stores/attenuationStyleStore';
// ...
const attenuationStyleName = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.name ?? '—');
const localeId = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId ?? '');
// ...
<span className="transport-bar__attenuation-style">
  <VisuallyHidden>Attenuation Style: </VisuallyHidden>
  {attenuationStyleName}
</span>
```

**`main.tsx`** (one import + one call):

```typescript
import { setGlobalAttenuationStyleSeedOverride } from './utils/seedUtils'
// ...
if (seedParam) {
  setGlobalAttenuationStyleSeedOverride(seedParam);
  // eslint-disable-next-line no-console
  console.info('[seedUtils] global seed override set:', seedParam);
}
```

**Category-2 mechanical cascades** (`App.tsx`, `Factory.tsx`, `Robot.tsx`, `OceanScene.tsx`,
`localeHelpers.ts`, `getSeededVal.ts`, `WorldView.tsx`, `SectorSettingsDrawer.tsx`) all follow the
same substitution, no logic change:

```diff
- import { usePlanetStore, selectCurrentPlanet } from '.../planetStore';
+ import { useAttenuationStyleStore, selectCurrentAttenuationStyle } from '.../attenuationStyleStore';
- const localeId = usePlanetStore((s) => selectCurrentPlanet(s)?.currentLocaleId ?? '');
+ const localeId = useAttenuationStyleStore((s) => selectCurrentAttenuationStyle(s)?.currentLocaleId ?? '');
```

`WorldView.tsx` additionally updates its `import PlanetView from '.../PlanetView'` to
`import AttenuationStyleView from '.../AttenuationStyleView'` and the JSX tag/prop
(`<PlanetView planetId={...} />` → `<AttenuationStyleView attenuationStyleId={...} />`).

* **Naming Conventions:** Full `AttenuationStyle` in every identifier — no `AS` abbreviation in code
  (per the human's explicit choice). Prose in comments/docs may still say "AS" colloquially where
  the existing style already does (matches 10.1's own doc conventions), but exported symbols never
  abbreviate.
* **Formatting:** Matches each touched file's existing style exactly — this is a rename pass, not a
  reformatting pass; don't reflow lines beyond what the longer identifier length forces.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library, unchanged.
* **No new test assertions anywhere.** Every existing test's *behavior* coverage carries over
  unchanged; only identifiers in imports, mocks, fixtures, and description strings are renamed. A
  test that needs new assertion logic to pass post-rename indicates an accidental behavior change —
  stop and investigate rather than patching the test.
* **`attenuationStyleStore.test.ts`** (renamed from `planetStore.test.ts`): every `describe`/`it`
  block's own identifiers/fixtures follow the store rename; existing coverage (name-uniqueness
  rejection, noise-map priming, `removeAttenuationStyle`'s eviction cascade) unchanged in substance.
* **`worldTransition.test.ts`**: `RetransmitInput`'s `planetName` fixture key → `attenuationStyleName`
  throughout every test case (the existing `Kryndara`/`Halcyon Drift`/etc. fixture *values* stay —
  only the object key changes); mode-tag assertions (`'planetOnly'` → `'attenuationStyleOnly'`) if
  any test asserts on the internal `RetransmitAction` shape directly.
* **`factoryPlacementSystem.test.ts`**: inline `Locale` fixture objects' `planetId:` key →
  `attenuationStyleId:`; `recolorFactoriesForAttenuationStyle` call-site param names in test
  descriptions/comments follow.
* **`localeStore.test.ts`**: `DEFAULT_LOCALE.planetId` → `.attenuationStyleId`; any test asserting
  the full shape of `DEFAULT_LOCALE` updates the key name only, not the value (`'pelagos'` stays).
* **`sectorSettingsConfig.test.ts`**: `PLANET_NAME_SCHEMA`/`PLANET_NAME_PRESETS` import names →
  `ATTENUATION_STYLE_SCHEMA`/`ATTENUATION_STYLE_PRESETS`; label-text assertions unchanged (10.1
  already set the correct copy).
* **`TransportBar.test.tsx`**: `TEST_PLANET` fixture import/usage → `TEST_ATTENUATION_STYLE` (or
  equivalent); the `'.transport-bar__attenuation-style'` selector replaces
  `'.transport-bar__planet'` in the "labels each metadata field" test.
* **`SectorSettingsDrawer.test.tsx`**: mock imports (`usePlanetStore`/`selectCurrentPlanet` →
  `useAttenuationStyleStore`/`selectCurrentAttenuationStyle`) and any `retransmitWorldMock`
  assertion keyed on `planetName` → `attenuationStyleName` (e.g. `{ attenuationStyleName:
  'Kryndara' }`).
* **`globalAudioSeed.test.ts`**: every `generateGlobalAudioSettings('seed-test-planet', 'Nova')` /
  `generateGlobalLfoSettings(...)` call-site — the string literal test-fixture *values*
  (`'seed-test-planet'`, `'Nova'`, etc.) are free-form test data and don't need to change in
  content, only in what the positional params are understood to mean (still `(id, name)`, now
  named `attenuationStyleId`/`attenuationStyleName` at the definition site).
* **`audioStore.test.ts`**: the existing "preserves globalBypass... across a reseed" test's own
  prose ("a planet switch") can stay conceptually accurate or get swept to "an Attenuation Style
  switch" — cosmetic, not required for correctness.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors. This is the primary safety net for a rename of
     this size: every missed call site of a renamed export surfaces here immediately.
  2. `npm run lint` — zero ESLint errors (including any `import/no-unresolved` for the two file
     renames).
  3. `npm test` — all tests pass, same count as before this phase (renamed, not added/removed,
     barring the `PlanetState`-deletion cleanup which removes zero tests since nothing tested it).
  4. `npm run build` — production bundle builds cleanly.
  5. `git grep -in planet -- src/ | grep -viE "dataId|pelagos"` (or equivalent) returns nothing
     outside comments explicitly narrating the historical rename itself — the closest thing this
     phase has to an automated "did we get everything" check, run as a final sweep after all tasks
     land, not per-task.
* **Manual check (not automated):** load the app fresh (`npm run dev`), confirm `?seed=` still
  produces a reproducible session; open browser devtools and confirm
  `window.__GLOBAL_ATTENUATION_STYLE_SEED__` (not the old name) is what a boot-time override would
  set; retransmit a new Attenuation Style and confirm behavior is pixel-identical to pre-rename
  (same recolor, same World Time behavior, same Global Audio Rig reseed) — this phase changes zero
  visible or audible behavior, so "looks/sounds exactly the same" is the actual success bar for the
  manual pass.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** Continue on `feature/stacked-lfo` or cut a new branch — human's call at
  Task-start time; not decided here.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive
  sentences. Suggested grouping, each independently reviewable, mirroring 10.1's own commit
  sequencing but sized for this phase's fan-out:
  1. Types (`types/attenuationStyle.ts` rename + `types/locale.ts` field + `types/index.ts` barrel)
  2. `seedUtils.ts` + `seedUtils.test.ts` (the debug-global rename, isolated since it's the one
     externally-breaking change)
  3. `noiseMaps.ts` + `noiseMaps.test.ts`
  4. `stores/attenuationStyleStore.ts` (rename) + `.test.ts`
  5. `stores/localeStore.ts` + `.test.ts` (the `planetId` field rename)
  6. `stores/audioStore.ts` + `.test.ts` (planet-sync rename) + `utils/globalAudioSeed.ts` +
     `.test.ts` (params rename — grouped since they're the same conceptual surface)
  7. `systems/worldTransition.ts` + `.test.ts` (the phase's largest single file)
  8. `systems/factoryPlacementSystem.ts` + `.test.ts`
  9. Components: `PlanetView.tsx`→`AttenuationStyleView.tsx`(+`.css`), `WorldView.tsx`(+`.test.tsx`),
     `TransportBar.tsx`(+`.css`+`.test.tsx`), `SectorSettingsDrawer.tsx`(+`.test.tsx`)
  10. Category-2 mechanical cascades (`App.tsx`, `Factory.tsx`, `Robot.tsx`, `OceanScene.tsx`(+test),
      `localeHelpers.ts`(+test), `getSeededVal.ts`, `main.tsx`) — batched, since each is a one-line
      import/call diff
  11. Category-3 comment-only sweeps (`RobotBody.tsx`, `LocaleView.tsx`, `realWorldGradient.ts`,
      `globalAudioLoadingRanges.ts`, `globalAudioSeedRanges.ts`, `AudioEngine.ts`(+test),
      `lfoDrift.ts`, `harmonySystem.ts`, `spawnSystem.ts`, and the remaining test-fixture-only files)
  12. Docs (`PROCEDURAL_GENERATION.md`, `AUDIO_SYSTEM.md`, `CONTRIBUTION_GUIDE.md`,
      `BUILDING_DESIGN.md`, `COMPANIES.md`, `UI_SHELL.md`, `HARMONY_SYSTEM.md`, `CLAUDE.md` sweep)

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc and code):

- ~~Is the historical-docs exclusion list just the three files 10.1 named?~~ **Resolved: no** —
  broadened to a general rule (§3) after grep surfaced 8 more historical spec/task/intent docs and
  roadmap's own earlier phase sections referencing soon-to-be-renamed identifiers.
- ~~Does `Locale.planetId` renaming risk missing a call site?~~ **Resolved: confirmed narrow** — all
  three readers/writers (`worldTransition.ts`, `factoryPlacementSystem.ts`, `localeStore.ts`) are
  already in this phase's own file list; no external caller reads `.planetId` directly (§1.2).

Still open — flag for Tasks/implementation, not blocking this spec:

1. **`sectorSettingsConfig.ts`'s schema `id: 'sectorSettings.planetName'` string** — rename to
   `'sectorSettings.attenuationStyleName'` for full consistency, or leave as-is since it's a UI
   schema key with no external contract riding on its exact spelling? §4 recommends leaving it;
   confirm during Tasks rather than deciding unilaterally here.
2. **Whether to also sweep `it(...)`/`describe(...)` prose strings that say "planet" but don't touch
   any renamed identifier** (e.g. a test titled "shows the planet name" where the underlying
   assertion now reads `attenuationStyleName`) — cosmetic-only, zero functional risk either way;
   default to updating them for consistency since the mechanical diff is already touching that
   line, but not worth a blocking decision if a few slip through.
3. **`docs/COMPANIES.md`'s "a planet-only retransmit" phrasing** — this describes the *concept*
   (an Attenuation-Style-only retransmit) using "planet" as a stand-in word, not naming any code
   identifier directly. Recommend sweeping to "an Attenuation-Style-only retransmit" for consistency
   with the rest of this phase's docs work, but it's not load-bearing the way an identifier mention
   would be.
