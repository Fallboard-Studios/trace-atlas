# Phase Spec: Sector Settings (Roadmap Phase 5)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/sector-settings.md](../intent/sector-settings.md) (confirmed via `/interview-me`, amended with the integer-coordinates decision). Source of scope: [docs/todo/roadmap.md § 5](../todo/roadmap.md#5-sector-settings). Prerequisite already shipped: [docs/specs/LOCALE_SEED_DECOUPLING.md](LOCALE_SEED_DECOUPLING.md) / [docs/tasks/LOCALE_SEED_DECOUPLING.md](../tasks/LOCALE_SEED_DECOUPLING.md) — locale-generated content is now provably independent of planet identity, which is the only reason this phase's core guarantee is achievable at all. Prior art: [docs/COMPONENT_LIBRARY.md](../COMPONENT_LIBRARY.md) (`TextInput`/`CoordsInput`/`Button`/`DualLabel` contracts), [docs/specs/AUDIO_RIG.md](AUDIO_RIG.md) (the `ConsolePanel` tile-replacement pattern this follows), [docs/UI_SHELL.md](../UI_SHELL.md), [docs/PROCEDURAL_GENERATION.md](../PROCEDURAL_GENERATION.md).

---

## 1. Overview & Claude Explanation

Roadmap Phase 5's own text describes this as "populate data configs, build a layout" — two bullets. That framing undersells the phase the same way Phase 4's roadmap text turned out to be stale about Audio Rig being "just" a presentational scaffold (see `AUDIO_RIG.md` §7.1). Direct inspection of the current codebase shows retransmit isn't a thin UI action wired onto existing plumbing — it's the **first real caller** of the entire planet/locale-switching API surface. `usePlanetStore.addPlanet`/`removePlanet`/`setCurrentPlanetId`/`setCurrentLocale` and `useLocaleStore.addLocale`/`removeLocale` have **zero call sites anywhere in the app today** outside their own store definitions (confirmed by grep) — every planet/locale this app has ever shown a user has been the single hardcoded default. This spec is as much about making that dormant API surface actually work end-to-end for the first time as it is about the config file and drawer the roadmap names.

`src/data/sectorSettingsConfig.ts` defines `ControlSchema` data plus static preset lists for two panels — **Planet Calibration** (a `TextInput` for the planet name, which doubles as the seed) and **Plot Tuning** (a `CoordsInput` for locale X/Y, now integers per the confirmed intent amendment) — each with a promoted/random preset list. `SectorSettingsDrawer.tsx` renders a status header (active plot coordinates + planet name) above both panels and **one shared retransmit `Button`**, replacing `ConsolePanel.tsx`'s literal placeholder `TILE_CONTENT.settings` entry, the same file/pattern `AudioRigDrawer` replaced `TILE_CONTENT.audioRig` in Phase 4.

The actual engineering weight is in a new orchestration module, `src/systems/worldTransition.ts`, that the retransmit button calls. Four things had to be true before this could work correctly, none of them true today, discovered by reading the actual call chain rather than assumed from the roadmap:

1. **`placeFactories()` hardcodes `DEFAULT_LOCALE_ID`.** `factoryPlacementSystem.ts` takes no locale argument and writes its result via `useLocaleStore.getState().setLocaleData(DEFAULT_LOCALE_ID, { actors })` unconditionally. A second locale — which this phase is the first to ever create — would never get factories placed, or would silently corrupt the default locale's actors if it still exists. This is a **blocking bug**, not an enhancement; it's fixed here by parameterizing `placeFactories(localeId)` and updating its one call site.
2. **`OceanScene.tsx`'s initial-spawn effect is mount-only by design**, with a comment reading *"Intentionally mount-only: localeId is stable (locale only changes via user menu) and re-running would double-spawn robots/factories"* — the original author already anticipated a "user menu" that would someday change the locale. This phase **is** that user menu. Rather than making the effect itself react to `localeId` (risking the exact double-spawn the comment warns about) or duplicating its setup logic inline in the retransmit path, this spec extracts a small shared `initializeLocale(localeId)` helper (guarded factory placement + 2 initial `spawnRobot` calls + `startSpawnScheduler`) that both `OceanScene`'s mount effect and `worldTransition.ts` call — one source of truth for "what does it mean to bring a locale online," not two.
3. **`removeLocale` doesn't release robots' `AudioEngine` state.** `removeRobot` calls `AudioEngine.releaseVoice`/`unregisterRobotMelody` per robot before removing it; `removeLocale` just evicts the noise map and deletes the record — leaving every robot that was in a discarded locale with a permanently-reserved voice and a registered melody nothing will ever unregister. `removeLocale` gets extended to loop its own robots through the same cleanup, so any future caller (not just this one) gets this for free.
4. **`startSpawnScheduler`'s module-level singleton guard.** It no-ops if a schedule is already running — silently continuing to schedule the *old* locale unless `stopSpawnScheduler()` runs first. `worldTransition.ts`'s teardown step must call it before start-up begins for the new locale.

Audio Rig's global effects and global LFOs need **no new code at all** — `audioStore.ts` already subscribes to `usePlanetStore`'s `currentPlanetId` and re-seeds both on any change (`syncGlobalAudioToCurrentPlanet`, wired near the bottom of the file). Calling `setCurrentPlanetId` is sufficient; this spec explicitly does not duplicate that wiring.

**Edits the user made to whichever half of the world didn't change are preserved, not reset** — a refinement confirmed after the first draft of this spec. `retransmitWorld` has four branches, not one:

- **Coordinates changed, planet unchanged:** `currentPlanetId` never changes, so any Audio Rig/global LFO edits the user made survive untouched — there's no new code for this, it's a direct consequence of `audioStore`'s existing planet-sync subscription only firing on a `currentPlanetId` change. A new locale is created at the new coordinates via `initializeLocale`; the old locale is released via `removeLocale` (cleaned up per Fix #3).
- **Planet changed, coordinates unchanged:** a genuinely new planet is created (fresh seed, fresh Audio Rig/LFO state — nothing to preserve for a planet that didn't exist a moment ago) — but the **current locale is re-parented onto it unchanged**, not discarded and regenerated: same `Locale` record, same robots, same actors, any edits already made survive. This only works because Locale Seed Decoupling already made locale-generated content a pure function of `(x, y)`, independent of which planet owns it — there is genuinely nothing to regenerate. The old planet record is discarded via `removePlanet`.
- **Both changed:** a full reset — neither preservation rule's precondition holds, so nothing survives. Fresh planet, fresh locale.
- **Neither changed:** a true no-op. Under the two rules above, this is both preservation conditions holding simultaneously, so retransmit does nothing rather than silently reproducing an identical-looking world (a correction from this spec's first draft, which treated this as "harmless to regenerate anyway").

One consequence worth stating plainly: this preserves literal locale continuity (the same `Locale` record, same robot objects) when only the planet changes, but does **not** attempt literal robot continuity across a *coordinates* change — a new locale there means a genuinely new roster. Robot IDs are `crypto.randomUUID()` today (deterministic IDs are Phase 6's job, not yet built), so that new roster's objects are structurally new regardless of whether their generated content happens to match something seen before.

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── sectorSettingsConfig.ts        # NEW — ControlSchema data + promoted/random preset lists for both panels
│   └── sectorSettingsConfig.test.ts   # NEW — schema shape + preset list coverage
├── systems/
│   ├── worldTransition.ts             # NEW — retransmitWorld({ planetName?, coordinates? }); orchestrates
│   │                                   #   create/discard planet+locale, cleanup, and locale bring-up
│   ├── worldTransition.test.ts        # NEW — the real coverage: planet-only vs. coords-only vs. both,
│   │                                   #   decoupling guarantee exercised end-to-end, cleanup verified
│   ├── factoryPlacementSystem.ts      # MODIFIED — placeFactories(localeId: string): Actor[]; drops the
│   │                                   #   DEFAULT_LOCALE_ID hardcode
│   ├── factoryPlacementSystem.test.ts # MODIFIED — update call sites for the new required argument
│   └── spawnSystem.ts                 # Untouched — startSpawnScheduler/stopSpawnScheduler/spawnRobot are
│                                       #   called by initializeLocale, not modified themselves
├── stores/
│   ├── localeStore.ts                 # MODIFIED — removeLocale releases each robot's AudioEngine voice/
│   │                                   #   melody before removing the record (mirrors removeRobot's own cleanup)
│   └── localeStore.test.ts            # MODIFIED — new coverage for removeLocale's cleanup
├── components/
│   ├── ui/controls/
│   │   ├── CoordsInput.tsx            # MODIFIED — reject/round non-integer entry (see § 3)
│   │   └── CoordsInput.test.tsx       # MODIFIED — integer-enforcement coverage
│   └── panels/screen/
│       ├── worldView/
│       │   ├── OceanScene.tsx         # MODIFIED — mount effect calls the new initializeLocale(localeId)
│       │   │                          #   helper instead of inlining factory placement + spawn + scheduler
│       │   └── OceanScene.test.tsx    # MODIFIED — update for the refactor, behavior unchanged
│       └── console/
│           ├── SectorSettingsDrawer.tsx      # NEW
│           ├── SectorSettingsDrawer.css      # NEW
│           ├── SectorSettingsDrawer.test.tsx # NEW
│           ├── ConsolePanel.tsx              # MODIFIED — TILE_CONTENT.settings renders <SectorSettingsDrawer />
│           └── ConsolePanel.test.tsx         # MODIFIED — replace the settings-stub assertion
docs/
└── UI_SHELL.md                        # MODIFIED — settings goes from "Stub only" to shipped, matching how
                                        #   audioRig's entry was updated in Phase 4
```

No new dependency.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in § 2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Zero Hardcoded Strings:** Every label, unit, and preset value in `sectorSettingsConfig.ts` — `SectorSettingsDrawer.tsx` renders zero raw display strings itself, matching every other drawer's rule.
* **`worldTransition.ts` is the only caller of the planet/locale-switching API this phase adds.** Don't scatter `addPlanet`/`removePlanet`/`addLocale`/`removeLocale`/`setCurrentPlanetId`/`setCurrentLocale` calls across the drawer component itself — the drawer calls exactly one function, `retransmitWorld(...)`, and that function owns the entire sequencing (teardown → create → bring-up).
* **Audio Rig re-seeding is not this phase's to wire.** `audioStore.ts`'s existing `usePlanetStore.subscribe` already re-seeds `globalAudio`/`globalLfo` on any `currentPlanetId` change — `worldTransition.ts` must call `setCurrentPlanetId` (which triggers it) and must **not** call `regenerateGlobalAudioFromSeed`/`regenerateGlobalLfoFromSeed` directly itself; doing so would be redundant and risks a double-seed if the subscription semantics ever change.
* **`placeFactories(localeId)`'s parameterization is additive-in-spirit but breaking-in-signature** — its one call site (`OceanScene.tsx`) must be updated in the same commit/task, not left mismatched. No other file calls it (confirmed by grep).
* **`initializeLocale(localeId)` guards against double-spawn exactly the way the original `OceanScene` comment worried about** — factory placement only runs if the locale has zero actors (matching the guard the effect already had for factories specifically), and this same "only if empty" guard extends to the robot roster (only spawn the 2 initial robots if the locale has zero robots) so calling it a second time on an already-populated locale is a safe no-op, not a double-spawn.
* **`removeLocale`'s new robot-cleanup loop calls exactly the same two `AudioEngine` methods `removeRobot` already calls**, in the same order, wrapped in the same `try/catch`-and-`swallow` pattern `removeRobot` uses (see `localeStore.ts`'s existing `removeRobot` for the exact shape) — don't invent a different cleanup sequence for the same underlying resource.
* **Coordinates are integers, system-wide** (confirmed in the intent doc's amendment) — `CoordsInput.tsx`'s `handleX`/`handleY` round (not silently truncate in a way that surprises a typed decimal — round to nearest integer, e.g. `Math.round`) any parsed value before calling `onChange`. `LocaleCoordinates.x`/`y` stay typed `number` (TypeScript has no native integer type) — the constraint is enforced at every write path, not in the type system.
* **`worldTransition.ts` clears `uiStore.selectedRobotId`** (a previously-selected robot may not exist in the fresh roster) but **does not touch `activeHubTile`** — the user stays on the Settings tile and sees the status header update in place, per the intent doc's Success criteria.
* **No Session Storage wiring** — a retransmitted-away world is genuinely discarded this phase; nothing here persists across reload (Phase 12's job).
* **No changes to `spawnSystem.ts`, `idleSystem.ts`, or `interactionSystem.ts`** beyond what Locale Seed Decoupling already shipped — `initializeLocale` calls their existing exported functions (`spawnRobot`, `startSpawnScheduler`, `stopSpawnScheduler`) as-is.

---

## 4. Code Style & Architecture Conventions

**`sectorSettingsConfig.ts`** groups each panel's schemas and preset list together, mirroring `audioRigConfig.ts`'s one-record-per-concern shape:

```typescript
// src/data/sectorSettingsConfig.ts
import type { TextInputSchema, CoordsInputSchema, ButtonSchema, DualLabelSchema } from '@/types/controls';

export interface SectorPreset<T> {
  label: string;      // human-facing preset button label
  value: T;
}

export const PLANET_NAME_SCHEMA: TextInputSchema = {
  id: 'sectorSettings.planetName',
  type: 'textInput',
  loreLabel: 'CALIBRATION SEED',
  humanLabel: 'Planet Name',
  placeholder: 'Enter a new planet name…',
};

export const COORDS_SCHEMA: CoordsInputSchema = {
  id: 'sectorSettings.coordinates',
  type: 'coordsInput',
  loreLabel: 'PLOT VECTOR',
  humanLabel: 'Coordinates',
};

export const RETRANSMIT_SCHEMA: ButtonSchema = {
  id: 'sectorSettings.retransmit',
  type: 'button',
  loreLabel: 'RETRANSMIT',
  humanLabel: 'Retransmit',
};

export const STATUS_HEADER_SCHEMA: DualLabelSchema = {
  id: 'sectorSettings.status',
  type: 'dualLabel',
  loreLabel: 'ACTIVE TRANSMISSION',
  humanLabel: 'Current Sector',
};

/** Hand-curated, lore-flavored planet name presets — static data, not user-saved
 *  favorites. Clicking one ONLY populates the Planet Name field — it does not
 *  call retransmitWorld itself; the user still has to press Retransmit. */
export const PLANET_NAME_PRESETS: SectorPreset<string>[] = [
  { label: 'Kryndara', value: 'Kryndara' },
  { label: 'Vessport Null', value: 'Vessport Null' },
  { label: 'Halcyon Drift', value: 'Halcyon Drift' },
  { label: 'The Rusting', value: 'The Rusting' },
];

/** Hand-curated, interesting coordinate-pair presets. Same click behavior —
 *  populates the X/Y fields only. */
export const COORDINATE_PRESETS: SectorPreset<{ x: number; y: number }>[] = [
  { label: 'The Trench', value: { x: -42, y: 108 } },
  { label: 'Shallow Reach', value: { x: 7, y: 3 } },
  { label: 'Far Shoal', value: { x: 219, y: -64 } },
  { label: 'Null Basin', value: { x: 0, y: 0 } },
];
```

**`worldTransition.ts`** is the orchestration core — one exported function, sequenced teardown-then-bring-up:

```typescript
// src/systems/worldTransition.ts
import { usePlanetStore, selectCurrentPlanet } from '@/stores/planetStore';
import { useLocaleStore } from '@/stores/localeStore';
import { useUIStore } from '@/stores/uiStore';
import { placeFactories } from './factoryPlacementSystem';
import { spawnRobot, startSpawnScheduler, stopSpawnScheduler } from './spawnSystem';
import { derivePlanetSeed, planetInitialHour } from '@/utils/seedUtils';
import { PLANET_DURATION_MS } from '@/constants/time';
import type { Planet, PlanetSize } from '@/types/planet';
import type { Locale } from '@/types/locale';

export interface RetransmitInput {
  /** Present only if the user edited the planet name field. */
  planetName?: string;
  /** Present only if the user edited the X/Y fields (already rounded to integers by CoordsInput). */
  coordinates?: { x: number; y: number };
}

/** Construct a fresh Planet, mirroring planetStore.ts's own DEFAULT_PELAGOS/
 *  addPlanet construction (dayStartTimestamp via planetInitialHour, size
 *  defaulted — Sector Settings doesn't expose planet size as a field). */
function buildPlanet(name: string): Planet {
  const seed = derivePlanetSeed(name);
  const initialHour = planetInitialHour(seed);
  const size: PlanetSize = 'medium';
  return {
    id: crypto.randomUUID(),
    name,
    size,
    locales: [],
    dayStartTimestamp: Date.now() - (initialHour / 24) * PLANET_DURATION_MS[size],
    currentHour: 0,
  };
}

/** Construct a fresh, empty Locale at the given coordinates — robots/actors
 *  populate via initializeLocale, not here. */
function buildLocale(planetId: string, coordinates: { x: number; y: number }): Locale {
  return {
    id: crypto.randomUUID(),
    planetId,
    name: `Plot ${coordinates.x}, ${coordinates.y}`,
    coordinates,
    robots: [],
    actors: [],
    settings: { bpm: 60, maxRobots: 12, minRobots: 2, autoSpawn: true, spawnFrequency: 4 },
    currentMeasure: 0,
  };
}

/** Bring a locale online: guarded factory placement + 2 initial robots + spawn
 *  scheduler restart. Idempotent — safe to call on an already-populated locale
 *  (matches the double-spawn guard OceanScene's own mount effect already had
 *  for factories; extended here to robots too). Shared by OceanScene's mount
 *  effect and worldTransition so "what does bringing a locale online mean" has
 *  exactly one implementation. */
export function initializeLocale(localeId: string): void {
  const locale = useLocaleStore.getState().getLocaleById(localeId);
  if (!locale) return;

  if (locale.actors.length === 0) placeFactories(localeId);
  if (locale.robots.length === 0) {
    spawnRobot(localeId);
    spawnRobot(localeId);
  }

  stopSpawnScheduler();
  startSpawnScheduler(localeId);
}

/** The Sector Settings retransmit action — four branches, per § 1's preservation
 *  rules. `input`'s two fields are each present only if the user actually
 *  edited that panel; absence means "preserve as-is," not "reset to default." */
export function retransmitWorld(input: RetransmitInput): void {
  const { planetName, coordinates } = input;
  if (!planetName && !coordinates) return; // neither changed — true no-op

  useUIStore.getState().selectRobot(null);
  const oldPlanet = selectCurrentPlanet(usePlanetStore.getState());
  if (!oldPlanet) return;
  const oldLocaleId = oldPlanet.currentLocaleId;

  if (coordinates && !planetName) {
    // Coordinates changed, planet preserved: never touch currentPlanetId, so
    // audioStore's planet-sync subscription never fires — any Audio Rig/LFO
    // edits on the current planet survive untouched, with no new code needed.
    const newLocale = buildLocale(oldPlanet.id, coordinates);
    useLocaleStore.getState().addLocale(oldPlanet.id, newLocale);
    initializeLocale(newLocale.id);
    usePlanetStore.getState().setCurrentLocale(oldPlanet.id, newLocale.id);
    if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
    return;
  }

  // planetName is set here (both-changed or planet-only branches).
  const newPlanet = buildPlanet(planetName!);
  usePlanetStore.getState().addPlanet(newPlanet);

  if (!coordinates && oldLocaleId) {
    // Planet changed, coordinates preserved: re-parent the EXISTING locale
    // onto the new planet unchanged — same robots/actors/edits, no
    // regeneration. Locale Seed Decoupling is what makes this correct: the
    // locale's generated content is a pure function of (x, y), independent
    // of which planet owns it, so there is genuinely nothing to regenerate.
    useLocaleStore.getState().setLocaleData(oldLocaleId, { planetId: newPlanet.id });
    usePlanetStore.getState().setCurrentLocale(newPlanet.id, oldLocaleId);
  } else {
    // Both changed: full reset, nothing eligible for preservation.
    const newLocale = buildLocale(newPlanet.id, coordinates!);
    useLocaleStore.getState().addLocale(newPlanet.id, newLocale);
    initializeLocale(newLocale.id);
    usePlanetStore.getState().setCurrentLocale(newPlanet.id, newLocale.id);
    if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
  }

  // Triggers audioStore's existing usePlanetStore.subscribe — reseeds
  // globalAudio/globalLfo from the new planet's own seed. Do not call
  // regenerateGlobalAudioFromSeed/regenerateGlobalLfoFromSeed directly here.
  usePlanetStore.getState().setCurrentPlanetId(newPlanet.id);

  // removePlanet's cascade evicts noise maps for every locale it still lists
  // as its own — harmless even for a just-reparented locale, since the
  // decoupled noise map is a pure function of (x, y) and rebuilds identically
  // the next time anything calls getLocaleNoiseMap for it.
  usePlanetStore.getState().removePlanet(oldPlanet.id);
}
```

> **Superseded by review, see § 7 item 5's update:** this sketch's "harmless, rebuilds the next time anything needs it" framing turned out to leave a real (if narrow) gap for `AudioEngine`'s non-throwing lookup path. The shipped `worldTransition.ts` re-warms the noise map explicitly right after `removePlanet`, in the extracted `retransmitPlanetOnly` function, rather than relying on the next spawn tick to close it.

**`CoordsInput.tsx`'s integer enforcement** (small addition to `handleX`/`handleY`, no structural change):

```typescript
function handleX(raw: string) {
  if (raw.trim() === '') return;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) return;
  onChange({ ...value, x: Math.round(parsed) });
}
```

**`localeStore.ts`'s `removeLocale` extension** mirrors `removeRobot`'s own existing cleanup exactly:

```typescript
removeLocale: (localeId) => {
  const existing = get().locales[localeId];
  if (existing) {
    for (const robot of existing.robots) {
      try {
        AudioEngine.releaseVoice(robot.id);
      } catch (err) {
        if (DEV_TUNING) swallow(err, 'AudioEngine.releaseVoice');
      }
      try {
        AudioEngine.unregisterRobotMelody(robot.id);
      } catch (err) {
        if (DEV_TUNING) swallow(err, 'AudioEngine.unregisterRobotMelody');
      }
    }
  }
  set((state) => {
    const next = { ...state.locales };
    delete next[localeId];
    return { locales: next };
  });
  evictLocaleNoiseMap(localeId);
},
```

* **Naming Conventions:** `worldTransition.ts` sits flat in `src/systems/`, matching `spawnSystem.ts`/`idleSystem.ts`/`interactionSystem.ts`'s existing flat placement. `retransmitWorld`/`initializeLocale` are verb-first, matching the codebase's existing function-naming convention.
* **Formatting:** Plain named function component export for `SectorSettingsDrawer` (not `React.FC`), co-located `SectorSettingsDrawer.css`, zero inline style objects.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate (`worldTransition.ts` → `.test.ts`, `SectorSettingsDrawer.tsx` → `.test.tsx`).
* **`worldTransition.test.ts` — the coverage that actually matters, one block per branch:**
  1. **Neither field changed:** `retransmitWorld({})` is a true no-op — `usePlanetStore`/`useLocaleStore` state is byte-identical before and after (same planet id, same locale id, same robots array reference even), no `AudioEngine` calls, no `selectRobot` call.
  2. **Coordinates changed, planet unchanged (preservation + the decoupling guarantee, exercised end-to-end for the first time):** `currentPlanetId` is unchanged after the call — confirms Audio Rig/LFO edits would survive, since `audioStore`'s subscription only fires on that change. The new locale's generated content at the new coordinates matches what those same coordinates would produce on any other planet (the decoupling guarantee, sampled via `getSeededVal`). The old locale's robots get `AudioEngine.releaseVoice`/`unregisterRobotMelody` (spy/mock `AudioEngine`) before being discarded.
  3. **Planet changed, coordinates unchanged (the re-parenting guarantee):** the locale object surviving the call has the **same `id`** as before (not a new one), same `robots`/`actors` arrays (reference or deep-equal, not regenerated), with only its `planetId` field updated to the new planet's id. `initializeLocale`/`removeLocale` are **not** called for this locale at all (spy and assert zero calls) — this is the assertion that actually proves preservation, not just "the values happen to match."
  4. **Both changed (full reset):** new planet, new locale, old planet discarded (`removePlanet` called), old locale's robots released before discard, `initializeLocale` called for the new locale.
  5. `stopSpawnScheduler` is called before `startSpawnScheduler` in any branch that calls `initializeLocale` (verifies the module-singleton ordering constraint from § 1/§ 3).
  6. Any branch that creates a new locale ends up with factories placed and exactly 2 initial robots — via `initializeLocale`, not duplicated inline logic.
  7. Any branch that actually changes something clears `uiStore.selectedRobotId`; `uiStore.activeHubTile` is never touched by any branch, including the no-op.
  8. Calling `initializeLocale` twice on the same (now-populated) locale is a no-op the second time (idempotence guard).
* **`factoryPlacementSystem.test.ts` (modified):** `placeFactories(localeId)` writes to the given locale, not a hardcoded default; existing assertions updated to pass an explicit locale id.
* **`localeStore.test.ts` (modified):** `removeLocale` calls `AudioEngine.releaseVoice`/`unregisterRobotMelody` for every robot the locale had, mocked the same way `removeRobot`'s existing tests already mock `AudioEngine`.
* **`CoordsInput.test.tsx` (modified):** entering a decimal (`"12.7"`) rounds to the nearest integer before `onChange` fires; entering an already-integer value passes through unchanged; existing blank/NaN-guard tests unmodified.
* **`OceanScene.test.tsx` (modified):** the refactor to call `initializeLocale` produces the same observable behavior as before (factories placed once, 2 robots spawned, scheduler started) — a refactor, not a behavior change, so existing assertions should mostly survive with call-target updates only.
* **`sectorSettingsConfig.test.ts` (new):** every schema resolves a real accessible name (`humanLabel` present); `PLANET_NAME_PRESETS`/`COORDINATE_PRESETS` each have their 4 confirmed entries with the right shape.
* **`SectorSettingsDrawer.test.tsx` (new):** renders the status header reflecting current planet/coordinates; both input fields are pre-populated with current values on mount (not blank); clicking retransmit calls `retransmitWorld` with only the field(s) actually edited; clicking any promoted-preset or random-preset button (both panels) populates only the relevant input field(s) and calls `retransmitWorld` **zero times** — confirms presets are pure field-fillers, never an implicit submit, and the user must still press Retransmit separately.
* **`ConsolePanel.test.tsx` (modified):** replace the settings-stub assertion with one confirming `SectorSettingsDrawer` (or its status header) renders instead.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** retransmit a new planet name in the running app and confirm the World View visibly changes (different factory layout, different robots) while the Audio Rig's seeded effect/LFO values also visibly change; retransmit coordinates only and confirm the same planet's Audio Rig state is untouched.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/sector-settings`.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences, roughly one commit per file group in § 2 (config+test, the four discovered fixes each as their own commit since they're independently reviewable bug fixes, `worldTransition.ts`+test, drawer+test, `ConsolePanel` wiring, docs last).

---

## 7. Open Questions & Risks

Resolved during Specify review (confirmed directly, not left open):

- ~~Does a coordinates-only retransmit reuse the current planet, or always create a fresh planet+locale together?~~ **Resolved**: reuse — and, further refined, the preserved half's *edits* survive too, not just its identity. § 1/§ 4 now specify the full four-branch model (coords-only preserves the planet incl. its edits; planet-only re-parents the existing locale incl. its edits; both-changed is a full reset; neither-changed is a true no-op).
- ~~Should `OceanScene.tsx`'s own mount effect be refactored to call `initializeLocale` too?~~ **Resolved: yes** — confirmed; § 2/§ 4 reflect it.
- ~~Promoted preset list contents~~ **Resolved**: real (if placeholder-flavor) data now lives directly in § 4's `sectorSettingsConfig.ts` sketch — `PLANET_NAME_PRESETS`/`COORDINATE_PRESETS`, 4 entries each. Note `COORDINATE_PRESETS` deliberately includes `{ x: 0, y: 0 }` ("Null Basin") — the single worst-case coordinate from the pre-decoupling dead-zone bug, now safe to offer as a normal preset rather than something to avoid.

Still open — resolve in the Plan/Tasks phase before implementation:

1. **`initializeLocale`'s "only if empty" guard assumes a freshly-created locale always starts with zero actors/robots.** True for every path this spec creates (a `Locale` object built fresh for `addLocale`), but worth an explicit acceptance-criterion check during Tasks so a future caller passing a partially-populated locale doesn't silently skip needed setup.
2. **`removeLocale`'s extended cleanup changes its behavior for every existing caller, not just `worldTransition.ts`.** Grepped directly: `removeLocale`/`addLocale` are called only from `localeStore.test.ts` today — zero production call sites (matching finding #1's pattern for the rest of this API surface) — so this is a safe, low-risk extension today, but flag it as a behavior change to the function itself, not scoped narrowly to this feature's own new call site.
3. **Should the Retransmit button disable itself when neither field has been edited from its pre-populated value, or stay always-clickable and rely on the no-op?** Not resolved here — a UI-polish decision with no correctness stakes either way (the no-op is safe to trigger repeatedly), left to Plan/Tasks or a fast-follow rather than blocking this spec.
4. **`buildPlanet`'s hardcoded `size: 'medium'`.** Sector Settings' confirmed scope has no planet-size field (§4's `sectorSettingsConfig.ts` only covers name/seed and coordinates) — `'medium'` is a reasonable default matching `DEFAULT_PELAGOS`'s own, but confirm during Tasks whether a future phase (or this one) should expose size as a third Planet Calibration field, or whether it stays fixed indefinitely.
5. **`Planet.locales: string[]` is never appended-to after creation, by any existing setter — a pre-existing gap, not one this spec introduces.** Grepped directly: it's read in exactly one place in production code (`removePlanet`'s noise-map eviction cascade) and nowhere else. `newPlanet.locales` stays `[]` forever for any planet this spec creates — semantically stale, but no longer a *correctness* risk (see the update below): the one place its staleness used to matter is now handled explicitly rather than relied upon to be harmless. Still not fixed at the source (no code reads `Planet.locales` for anything else) — flagged so a future feature reading it for a real purpose doesn't get silently wrong data.

   **Update, post-review:** the "harmless, self-healing" framing this item and §4's code sketch originally relied on turned out to be a real, if narrow, correctness gap — `removePlanet`'s eviction *would* leave `AudioEngine.computeNoteVelocitySeeded()`'s non-throwing `tryGetLocaleNoiseMap` lookup returning `null` (falling back to `Math.random()`) for the preserved locale's still-alive robots, until the next scheduled spawn tick happened to rebuild the cache — self-correcting, but not immediate, and not asserted by this spec's own test suite. Fixed in `retransmitPlanetOnly` (the shipped code's name for this branch, extracted during the same pass): an explicit `getLocaleNoiseMap(oldLocaleId, ...)` re-warm now runs immediately after `removePlanet`, so the eviction-then-rebuild happens synchronously within one `retransmitWorld` call, not across an unbounded wait. `worldTransition.test.ts` asserts this directly (`tryGetLocaleNoiseMap` is non-null immediately after a planet-only retransmit, and matches the decoupling guarantee). `Planet.locales`' own staleness remains unfixed at the source — this closes the one place it was ever load-bearing, not the underlying array.
