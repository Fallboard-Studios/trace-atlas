# Phase Spec: BPM Control (Audio Rig)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/bpm-control.md](../intent/bpm-control.md) (confirmed via `/interview-me`, 2026-09-01), plus two decisions confirmed directly with the user during Specify itself — the seeded BPM range (§1.2) and the drawer control's lore/human labels (§1.5), both explicitly left open by the intent doc's "Out of scope" section. Prior art reused directly rather than re-derived: `src/utils/globalAudioSeed.ts` (the per-seed-source pure-generator-function convention, e.g. `generatePingVarianceAutomation`), `src/utils/noiseMaps.ts`'s `getLocaleNoiseMap` (locale-coordinate-derived seeding, per [docs/specs/LOCALE_SEED_DECOUPLING.md](LOCALE_SEED_DECOUPLING.md)), `AudioEngine.ts`'s `updateRobotMasterVolume` (the existing `rampTo`-with-fallback pattern this spec reuses verbatim for `setBPM`), and `AudioRigDrawer.tsx`'s `PING_VARIANCE_AUTOMATION_SCHEMA` row (the bare, non-per-effect `SliderLinear` master-row precedent this spec's new control follows).

---

## 1. Overview & Claude Explanation

`audioStore.bpm` (currently a hardcoded `60` that never changes) becomes a real, locale-seeded value: every time a fresh `Locale` is built from new coordinates (a coords-only retransmit, a full retransmit, or the app's very first locale at module load), a new BPM is drawn — via `getSeededVal` against that locale's own noise map — from a fixed `[40, 100]` range, and pushed into both `audioStore.bpm` and `Tone.Transport` (via the existing `AudioEngine.setBPM`). The Audio Rig drawer gains a new bare `SliderLinear` control, alongside `PING_VARIANCE_AUTOMATION_SCHEMA`'s existing master-row control, letting the operator freely retune BPM across a wider `[20, 200]` range at any time — every drag goes through the same `audioStore.setBPM` → `AudioEngine.setBPM` path already wired to `TransportBar.tsx`'s live BPM readout, so no display code needs to change. `AudioEngine.setBPM` itself gains a short ramp (mirroring `updateRobotMasterVolume`'s existing `rampTo`-with-fallback shape) so repeated calls while dragging don't zipper.

This is **not** the same value as `locale.settings.bpm` (consumed by `Factory.tsx`/`BubbleStream.tsx` for production-cadence math, still hardcoded to `60` in both `worldTransition.ts`'s `buildLocale` and `localeStore.ts`'s `DEFAULT_LOCALE`) — that field is explicitly out of scope and untouched by this spec. Both fields happen to share the name "bpm" and the coincidental default value `60`; nothing else connects them.

### 1.1 What's reused vs. what's new

Reused, unchanged: `getLocaleNoiseMap`/`getSeededVal` (the exact locale-coordinate-keyed seeding mechanism `factory.id` and every other per-locale seeded field already use), `audioStore.setBPM` (already does the state-write + `AudioEngine.setBPM` delegation this feature needs — no new store action wraps it for the *manual override* path), `AudioRigDrawer.tsx`'s `audio-rig-drawer__master-row` class and bare-`SliderLinear`-outside-any-accordion placement (`PING_VARIANCE_AUTOMATION_SCHEMA`'s own row), and `TransportBar.tsx`'s existing `bpm` readout (already subscribed to `audioStore.bpm` — see [TransportBar.tsx:29](../../src/components/panels/screen/TransportBar.tsx#L29) — needs no change at all).

New: `src/utils/localeBpmSeed.ts` (one pure generator function, mirroring `globalAudioSeed.ts`'s shape but keyed by locale coordinates instead of Attenuation Style), a new `audioStore.regenerateBpmFromSeed(localeId, coordinates)` action (the *seeding* path — distinct from `setBPM`, the *manual override* path, though the former calls the latter internally), a module-load sync in `audioStore.ts` mirroring `syncGlobalAudioToCurrentAttenuationStyle`'s existing shape, two new call sites in `worldTransition.ts`, a short ramp added to `AudioEngine.setBPM`, and one new bare schema + drawer row.

### 1.2 Seeded range: `[40, 100]`, integer

Confirmed directly with the user (2026-09-01) — a slower/contemplative range fitting the ambient ocean soundscape, with the current hardcoded default (`60`) sitting mid-range rather than at an edge. `getSeededVal`'s `min`/`max` params handle the range directly (`getSeededVal(noiseMap, 'locale.bpm', 0, 40, 100)`); the result is rounded to the nearest integer (`Math.round`) before being returned, since BPM display/precision was resolved to integer-only, matching `SliderLinear`'s existing `step: 1` convention for every other integer-only control in this drawer (e.g. `PING_VARIANCE_AUTOMATION_SCHEMA`'s `step: 1`).

```typescript
// src/utils/localeBpmSeed.ts
export const LOCALE_BPM_SEED_RANGE = { min: 40, max: 100 };

export function generateLocaleBpm(localeId: string, x: number, y: number): number {
  const noiseMap = getLocaleNoiseMap(localeId, x, y);
  const raw = getSeededVal(noiseMap, 'locale.bpm', 0, LOCALE_BPM_SEED_RANGE.min, LOCALE_BPM_SEED_RANGE.max);
  return Math.round(raw);
}
```

This is a **fixed** range regardless of coordinates — there is no per-x/y range-shifting, no log scale (BPM has no `0` edge case to dodge, unlike `SliderLog`'s attack/decay/release). Same "bounded/legible default, freely draggable afterward" convention every other seeded Rig field already follows (`DELAY_ENABLED_THRESHOLD`, `PING_VARIANCE_AUTOMATION_SEED_RANGE`) — the drawer's own drag range is wider (§1.4).

### 1.3 Where seeding happens — mirrors `dayStartTimestamp`'s "only two places" shape, not a store subscription

Unlike `globalAudio`'s Attenuation-Style-keyed reseeding (a `useAttenuationStyleStore.subscribe` that fires on every `currentAttenuationStyleId` change), BPM must reseed **only** when a locale is actually rebuilt from new coordinates — not when `retransmitAttenuationStyleOnly` re-parents the existing, unchanged locale onto a new Attenuation Style (intent doc: "no override carryover" is scoped explicitly to *coordinate* changes). A subscription keyed on `currentAttenuationStyleId` would incorrectly reseed on an Attenuation-Style-only retransmit (which *does* change `currentAttenuationStyleId`, via `finalizeAttenuationStyleTransition`, even though the locale itself is preserved). A subscription keyed on `currentLocaleId` is closer but has to special-case "same locale, re-parented" (`retransmitAttenuationStyleOnly` also calls `setCurrentLocale`, just with the *same* `oldLocaleId`) vs. "genuinely new locale" (`retransmitCoordsOnly`/`retransmitBoth`, both of which call `buildLocale`) — indistinguishable from a subscription's before/after diff alone without extra bookkeeping.

Instead, this spec follows `dayStartTimestamp`'s own established pattern (`worldTransition.ts`'s `buildLocale` doc comment: "computed once, directly ... This is the ONLY place a fresh dayStartTimestamp gets produced"): reseed BPM **explicitly, at the exact two call sites that build a genuinely new locale** — `retransmitCoordsOnly` and `retransmitBoth` — plus one **module-load** call in `audioStore.ts` for the locale that's current when the app boots (mirroring `dayStartTimestamp`'s own second construction site, `localeStore.ts`'s `DEFAULT_LOCALE`, and `globalAudio`'s own `syncGlobalAudioToCurrentAttenuationStyle()` immediate module-load call). `retransmitAttenuationStyleOnly` is deliberately **not** touched — the existing locale (and whatever BPM the operator had already dialed in) survives untouched, exactly like every other robot/actor/edit on that locale.

The module-load sync lives in `audioStore.ts` itself (not `localeStore.ts`) specifically to avoid widening the existing `localeStore.ts` ⇄ `AudioEngine.ts` import cycle (`localeStore.ts` already imports `AudioEngine`, which already imports `useLocaleStore` back — a pre-existing cycle this spec does not touch). `audioStore.ts` importing `useLocaleStore` is a clean new one-directional edge (`localeStore.ts` does not import `audioStore.ts`, and neither `AudioEngine.ts` nor any of `audioStore.ts`'s other existing imports import it either — verified by search, no new cycle introduced), and `audioStore.ts` already imports `useAttenuationStyleStore` for the exact same "what's the current locale" lookup `TransportBar.tsx` performs (`selectCurrentAttenuationStyle(state)?.currentLocaleId`).

### 1.4 Manual override: wider `[20, 200]` drag range, existing `setBPM` path unchanged

The drawer's `SliderLinear` uses a `[20, 200]` full range (step `1`) — wider than the `[40, 100]` seed band, same "seed narrow, drag wide" shape `PING_VARIANCE_AUTOMATION_SCHEMA` already established (seeds into `[33, 66]`, drags across the full `[0, 100]`). `20`–`200` is a conventional DAW-tempo span comfortably containing the seed band on both sides. Dragging calls `audioStore.setBPM(value)` directly — the exact same action `TransportBar.tsx` already reads from and `audioStore.test.ts` already covers — no new store action wraps the manual-override path; `regenerateBpmFromSeed` (§1.3) is additive, used only by the two seeding call sites.

### 1.5 Drawer labels: `RESONANCE CADENCE` / `Tempo`

Confirmed directly with the user (2026-09-01) — lore label `RESONANCE CADENCE` (matching the console's in-world naming convention, e.g. `PING VARIANCE AUTOMATION`), human label `Tempo`, unit `BPM`.

### 1.6 `setBPM` gains a short ramp — mirrors `updateRobotMasterVolume` exactly

> **Reverted post-launch** ([docs/tasks/BPM_CONTROL.md](../tasks/BPM_CONTROL.md)'s second Post-launch fix section) — this section is a historical record of the original design, not the shipped behavior. The `updateRobotMasterVolume` precedent doesn't actually transfer to BPM (not a continuously-summed audio signal, nothing for a ramp to protect against), and the ramp was actively harmful: the Tempo slider's continuous `onChange` fires faster than any short ramp can complete, so each call cancelled and restarted the previous ramp, leaving the tempo never actually settled during a drag — reported by the user as an audibly unstable, "wishy-washy" beat with no locatable downbeat. `setBPM` is back to the plain instant assignment described in this section's own first sentence below.

`AudioEngine.setBPM` currently does an instant `transport.bpm.value = bpm` assignment. Per the intent doc's flagged assumption (constraint section), this spec adds a short `rampTo` — reusing the identical guarded-fallback shape `updateRobotMasterVolume` already uses for `busGain.gain` ([AudioEngine.ts:942-949](../../src/engine/AudioEngine.ts#L942-L949)), not a new idiom:

```typescript
const BPM_RAMP_SECONDS = 0.05; // same magnitude as VOLUME_RAMP_SECONDS — short enough to be
                                 // inaudible as a discrete jump, long enough to avoid a zipper
                                 // click when setBPM is called repeatedly during a drag.

setBPM(bpm: number): void {
  if (!initialized) return;
  const transport = _transport ?? Tone.getTransport();
  try {
    const bpmParam = transport.bpm as unknown as { rampTo?: (value: number, rampTime: number) => void; value: number };
    if (typeof bpmParam.rampTo === 'function') {
      bpmParam.rampTo(bpm, BPM_RAMP_SECONDS);
    } else {
      bpmParam.value = bpm;
    }
  } catch (err) { devWarn('[AudioEngine] setBPM failed', err); }
},
```

One function, one behavior for both callers (the seed-time set and every manual drag tick) — no separate "instant" path, matching `updateRobotMasterVolume`'s own unconditional-ramp shape rather than branching on caller intent.

---

## 2. Target File Structure

```text
src/
├── utils/
│   ├── localeBpmSeed.ts           # NEW — generateLocaleBpm(localeId, x, y), LOCALE_BPM_SEED_RANGE
│   └── localeBpmSeed.test.ts      # NEW
├── stores/
│   ├── audioStore.ts              # MODIFIED — new regenerateBpmFromSeed(localeId, coordinates)
│   │                                 #   action; new module-load syncBpmToCurrentLocale() call;
│   │                                 #   new imports (useLocaleStore, generateLocaleBpm).
│   │                                 #   setBPM itself is UNCHANGED in this file — the ramp
│   │                                 #   lives entirely in AudioEngine.setBPM (§1.6)
│   └── audioStore.test.ts         # MODIFIED
├── engine/
│   ├── AudioEngine.ts              # MODIFIED — setBPM gains the rampTo-with-fallback shape
│   │                                 #   (§1.6); new BPM_RAMP_SECONDS constant
│   └── AudioEngine.test.ts         # MODIFIED
├── systems/
│   ├── worldTransition.ts          # MODIFIED — retransmitCoordsOnly/retransmitBoth each call
│   │                                 #   useAudioStore.getState().regenerateBpmFromSeed(...)
│   │                                 #   right after buildLocale/addLocale; new useAudioStore
│   │                                 #   import. retransmitAttenuationStyleOnly UNTOUCHED.
│   └── worldTransition.test.ts     # MODIFIED
├── data/
│   ├── audioRigConfig.ts           # MODIFIED — new BPM_SCHEMA (SliderLinearSchema, 20-200,
│   │                                 #   step 1, unit 'BPM'), exported as a bare schema
│   │                                 #   alongside PING_VARIANCE_AUTOMATION_SCHEMA
│   └── audioRigConfig.test.ts      # MODIFIED
└── components/panels/screen/console/
    ├── AudioRigDrawer.tsx          # MODIFIED — bare SliderLinear rendered in its own
    │                                 #   master-row div, after the Ping Variance Automation
    │                                 #   row, wired to audioStore's bpm/setBPM directly
    └── AudioRigDrawer.test.tsx     # MODIFIED

docs/
└── AUDIO_SYSTEM.md   # MODIFIED — new short subsection noting audioStore.bpm is now
                        # locale-seeded + live-adjustable, cross-referencing this spec;
                        # explicit one-line disambiguation from locale.settings.bpm
```

**Explicitly not touched, and why:** `src/components/panels/screen/TransportBar.tsx` (already reads `audioStore.bpm` live — §1.1, no change needed). `src/systems/worldTransition.ts`'s `buildLocale`/`DEFAULT_LOCALE` (`localeStore.ts`) construction of `settings: { bpm: 60 }` — that's `locale.settings.bpm`, the unrelated Factory/BubbleStream field this spec does not touch, does not rename, and does not attempt to reconcile with the new seeded value (per the intent doc's explicit "Out of scope"). `src/components/actors/Factory.tsx`/`BubbleStream.tsx` — consumers of `locale.settings.bpm` only, untouched. `src/components/ui/controls/*` — no new primitive; `SliderLinear` is reused as-is. `src/types/locale.ts` — no new field; the seeded BPM is never stored on the `Locale` object itself, only computed on demand by `generateLocaleBpm` and pushed into `audioStore.bpm` (mirrors `globalAudio` never being stored on `AttenuationStyle` either). `docs/COMPONENT_LIBRARY.md` — no UI primitive touched or added.

No new dependency. No file is renamed. No file is newly created except `localeBpmSeed.ts`/its test.

---

## 3. Implementation Boundaries & Constraints

* **Strict Scope:** Touch ONLY the files listed in §2 unless explicitly directed otherwise.
* **Protected Paths:** Never modify or delete files in `.env*`, `node_modules/`, or public build assets.
* **Reuse existing primitives — no new UI component.** The slider is `SliderLinear` (`src/components/ui/controls/SliderLinear.tsx`), the same primitive `PING_VARIANCE_AUTOMATION_SCHEMA` already uses. No new `ControlSchema` variant.
* **`Math.random()` stays banned.** `generateLocaleBpm` must use `getSeededVal` against the *locale* noise map (`getLocaleNoiseMap`, not `getAttenuationStyleNoiseMap` — this field is locale-scoped, not Attenuation-Style-scoped), exactly like every other seeded field in this codebase.
* **Never store the seeded BPM on the `Locale` object.** `Locale`/`LocaleSettings` (`src/types/locale.ts`) gain no new field. `generateLocaleBpm` is a pure function called fresh at each of the two seeding sites (§1.3), the same "recompute, don't cache on the domain object" shape `generateGlobalAudioSettings` already uses for `AttenuationStyle`.
* **`locale.settings.bpm` is a different field — do not touch, rename, or read from it.** It stays hardcoded at `60` in both `buildLocale` and `DEFAULT_LOCALE`, feeding only `Factory.tsx`/`BubbleStream.tsx` production-cadence math. This spec's new `audioStore.bpm` seeding must not read, write, or reference `locale.settings.bpm` anywhere.
* **`retransmitAttenuationStyleOnly` must not call `regenerateBpmFromSeed`.** Its whole point (§1.3) is that BPM survives an Attenuation-Style-only retransmit untouched, exactly like every other robot/actor/edit on the preserved locale.
* **Scheduling/timing stays on the `AudioEngine`/`Transport` path — no `setTimeout`/`setInterval`/`requestAnimationFrame`/`queueMicrotask` anywhere touched by this spec**, per CLAUDE.md's non-negotiable rule. The new `rampTo` call is Tone-native (a `Tone.Param` method), not a JS timer.
* **`setBPM`'s ramp is unconditional, not caller-gated.** Do not add an `instant?: boolean` parameter or a second code path — one function, one behavior, matching `updateRobotMasterVolume`'s existing shape (§1.6).
* **The drawer slider's full range (`[20, 200]`) must stay wider than the seed range (`[40, 100]`)** — the operator can drag beyond what any locale would ever seed, same convention `PING_VARIANCE_AUTOMATION_SCHEMA` already established.
* **No changes to `docs/COMPONENT_LIBRARY.md`** — no UI primitive is touched or added.

---

## 4. Code Style & Architecture Conventions

**`src/utils/localeBpmSeed.ts`** (new file, mirrors `globalAudioSeed.ts`'s shape):

```typescript
import { getLocaleNoiseMap } from './noiseMaps';
import { getSeededVal } from './getSeededVal';

/**
 * BPM's own seeded-default range — [40, 100] as integer BPM, a slower/
 * contemplative band fitting the ambient ocean soundscape, confirmed
 * directly with the user. docs/specs/BPM_CONTROL.md §1.2. Freely draggable
 * across the wider [20, 200] Audio Rig slider range afterward (§1.4).
 */
export const LOCALE_BPM_SEED_RANGE = { min: 40, max: 100 };

/**
 * Generate the deterministic audio BPM for a locale, sampled from that
 * locale's own noise map (getLocaleNoiseMap — coordinate-derived, no
 * Attenuation Style dependency, per LOCALE_SEED_DECOUPLING.md). Rounded to
 * the nearest integer — BPM precision is integer-only (docs/specs/
 * BPM_CONTROL.md §1.2). A pure function: never stored on the Locale object
 * itself, called fresh at each of the two seeding call sites
 * (docs/specs/BPM_CONTROL.md §1.3).
 */
export function generateLocaleBpm(localeId: string, x: number, y: number): number {
  const noiseMap = getLocaleNoiseMap(localeId, x, y);
  const raw = getSeededVal(noiseMap, 'locale.bpm', 0, LOCALE_BPM_SEED_RANGE.min, LOCALE_BPM_SEED_RANGE.max);
  return Math.round(raw);
}
```

**`src/stores/audioStore.ts`** (diff shape):

```typescript
import { useLocaleStore } from './localeStore';
import { generateLocaleBpm } from '../utils/localeBpmSeed';

export interface AudioStore {
  // ...existing fields unchanged...
  /**
   * Reseed `bpm` for the given (newly built) locale — draws a fresh value
   * via generateLocaleBpm and pushes it through the existing setBPM action
   * (state write + AudioEngine.setBPM). Called only from worldTransition.ts's
   * retransmitCoordsOnly/retransmitBoth (docs/specs/BPM_CONTROL.md §1.3) —
   * NOT from retransmitAttenuationStyleOnly, and NOT a subscription.
   */
  regenerateBpmFromSeed: (localeId: string, coordinates: { x: number; y: number }) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  // ...existing fields unchanged...

  regenerateBpmFromSeed: (localeId, coordinates) => {
    get().setBPM(generateLocaleBpm(localeId, coordinates.x, coordinates.y));
  },

  // ...existing actions unchanged...
}));

// ========================================
// LOCALE BPM SYNC (module load only — see docs/specs/BPM_CONTROL.md §1.3)
// ========================================
// Seeds audioStore.bpm for whichever locale is current at app boot. Every
// LATER reseed is triggered explicitly by worldTransition.ts, not by a
// subscription here — unlike syncGlobalAudioToCurrentAttenuationStyle above,
// this deliberately does NOT re-run on every currentAttenuationStyleId
// change, since retransmitAttenuationStyleOnly must leave BPM untouched.
function syncBpmToCurrentLocale(): void {
  const attenuationStyle = selectCurrentAttenuationStyle(useAttenuationStyleStore.getState());
  const localeId = attenuationStyle?.currentLocaleId;
  const locale = localeId ? useLocaleStore.getState().getLocaleById(localeId) : undefined;
  if (!locale) return;
  useAudioStore.getState().regenerateBpmFromSeed(locale.id, locale.coordinates);
}

syncBpmToCurrentLocale();
```

Placed after the existing `syncGlobalAudioToCurrentAttenuationStyle()`/`useAttenuationStyleStore.subscribe(...)` block at the bottom of the file — a separate, unrelated sync, not folded into the existing subscription (§1.3 explains why this one is call-site-triggered instead of subscription-driven).

**`src/engine/AudioEngine.ts`** — see §1.6 for the full `setBPM` diff (add `BPM_RAMP_SECONDS` near `VOLUME_RAMP_SECONDS`, same file).

**`src/systems/worldTransition.ts`** (diff shape — both locale-building branches):

```typescript
import { useAudioStore } from '../stores/audioStore';

function retransmitCoordsOnly(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, coordinates: { x: number; y: number }): void {
  const newLocale = buildLocale(oldAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(oldAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id);
  useAttenuationStyleStore.getState().setCurrentLocale(oldAttenuationStyle.id, newLocale.id);
  useAudioStore.getState().regenerateBpmFromSeed(newLocale.id, coordinates); // NEW
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);
}

function retransmitBoth(oldAttenuationStyle: AttenuationStyle, oldLocaleId: string | undefined, attenuationStyleName: string, coordinates: { x: number; y: number }): void {
  const newAttenuationStyle = createNewAttenuationStyle(attenuationStyleName);

  const newLocale = buildLocale(newAttenuationStyle.id, coordinates);
  useLocaleStore.getState().addLocale(newAttenuationStyle.id, newLocale);
  initializeLocale(newLocale.id);
  useAttenuationStyleStore.getState().setCurrentLocale(newAttenuationStyle.id, newLocale.id);
  useAudioStore.getState().regenerateBpmFromSeed(newLocale.id, coordinates); // NEW
  if (oldLocaleId) useLocaleStore.getState().removeLocale(oldLocaleId);

  finalizeAttenuationStyleTransition(newAttenuationStyle, oldAttenuationStyle);
}
```

`retransmitAttenuationStyleOnly` gets no equivalent call — deliberately (§1.3).

**`src/data/audioRigConfig.ts`** (new bare schema, same shape as `PING_VARIANCE_AUTOMATION_SCHEMA`):

```typescript
export const BPM_SCHEMA: SliderLinearSchema = {
  id: 'audioRig.bpm',
  type: 'sliderLinear',
  loreLabel: 'RESONANCE CADENCE',
  humanLabel: 'Tempo',
  min: 20,
  max: 200,
  step: 1,
  unit: 'BPM',
};
```

**`src/components/panels/screen/console/AudioRigDrawer.tsx`** (diff — new master-row after the existing Ping Variance Automation row, before the closing `</div>`):

```typescript
const bpm = useAudioStore((s) => s.bpm);
const setBPM = useAudioStore((s) => s.setBPM);

// ...inside the returned JSX, after the Ping Variance Automation
// audio-rig-drawer__master-row block:
<div className="audio-rig-drawer__master-row">
  <SliderLinear
    schema={BPM_SCHEMA}
    value={bpm}
    onChange={setBPM}
    disabled={rigDisabled}
  />
</div>
```

No `* 100`/`/ 100` conversion needed — unlike `pingVarianceAutomation`'s fraction-to-percent split, `audioStore.bpm` is already stored in the same units (`BPM`) the slider displays, so `value`/`onChange` bind directly. `disabled={rigDisabled}` matches every other Rig-wide control's existing disabled behavior under the master Bypass toggle (§7 flags this as worth double-checking, same as `PING-VARIANCE-AUTOMATION.md` §7 flagged for its own control).

* **Naming Conventions:** `generateLocaleBpm`, `LOCALE_BPM_SEED_RANGE`, `regenerateBpmFromSeed`, `syncBpmToCurrentLocale`, `BPM_SCHEMA`, `BPM_RAMP_SECONDS` — same `verbNoun`/`SCREAMING_SNAKE_CASE` conventions the surrounding files already use.
* **Formatting:** Matches each touched file's existing style exactly — no reformatting beyond the lines actually changing.

---

## 5. Testing & Verification Requirements

* **Framework:** Vitest + React Testing Library.
* **Test File Location:** Colocate, matching every file in §2.
* **`localeBpmSeed.test.ts` (new):**
  1. Determinism — same `(localeId, x, y)` → same value.
  2. Range — sampled across many coordinate pairs, every result falls in `[40, 100]` and is an integer (`Number.isInteger`).
  3. Two different coordinate pairs (same `localeId` argument reused, since `getLocaleNoiseMap` caches by `localeId`) produce different noise maps and can produce different values — a source-scan/behavioral check that it's genuinely `getLocaleNoiseMap`/`getSeededVal`-driven, not `getAttenuationStyleNoiseMap`.
* **`audioStore.test.ts` (modified):**
  1. `regenerateBpmFromSeed(localeId, coordinates)` calls `setBPM` with `generateLocaleBpm(localeId, coordinates.x, coordinates.y)`'s exact result (assert via the existing `AudioEngine.setBPM` mock, same pattern the existing `setBPM` test already uses).
  2. The module-load `syncBpmToCurrentLocale()` seeds `bpm` into `[40, 100]` for the store's default state (current Attenuation Style's `currentLocaleId` → `DEFAULT_LOCALE_ID` → `DEFAULT_LOCALE`'s coordinates) — a fresh-module-import test, same shape `audioStore.test.ts` likely already uses (if any) to assert `regenerateGlobalAudioFromSeed`'s own module-load call.
* **`AudioEngine.test.ts` (modified) — new `describe('setBPM', ...)` block (no existing coverage today):**
  1. When the mocked transport's `bpm` exposes a `rampTo` function, `setBPM(x)` calls `rampTo(x, BPM_RAMP_SECONDS)`, not a direct `.value` assignment.
  2. When the mocked transport's `bpm` is a plain `{ value }` object (no `rampTo`), `setBPM(x)` falls back to `bpm.value = x` — mirrors `updateRobotMasterVolume`'s own existing fallback test, if one exists; otherwise this is new coverage establishing that pattern for `setBPM` too.
  3. `setBPM` remains a no-op (no throw, no call into the transport) when `!initialized` — regression guard for the existing early-return.
* **`worldTransition.test.ts` (modified):**
  1. `retransmitCoordsOnly` (coords changed, Attenuation Style preserved) calls `useAudioStore.getState().regenerateBpmFromSeed` with the new locale's id/coordinates — mock `audioStore` the same way this file already mocks its other cross-store dependencies.
  2. `retransmitBoth` — same assertion.
  3. `retransmitAttenuationStyleOnly` (Attenuation Style changed, coordinates preserved) does **NOT** call `regenerateBpmFromSeed` — the regression guard for §1.3's core "no override carryover only on coordinate change" behavior; pair with an assertion that `audioStore.bpm` is literally unchanged across that retransmit if a live store (not a mock) is used elsewhere in this file's existing test setup.
* **`audioRigConfig.test.ts` (modified):** `BPM_SCHEMA` is a valid `SliderLinearSchema` (`min: 20, max: 200, step: 1, unit: 'BPM'`), and — if this file has a "every schema id is unique"/"every drawer-referenced schema is exported" style assertion — that it's included.
* **`AudioRigDrawer.test.tsx` (modified) — new coverage:**
  1. Renders the new slider with `value = bpm` (no scaling, unlike Ping Variance Automation).
  2. Dragging it calls `setBPM(value)` directly.
  3. It's disabled when `globalBypass` is true, same as the Ping Variance Automation row.
  4. It renders once, outside any `AccordionContainer`, in its own `audio-rig-drawer__master-row` (a DOM-structure assertion, guarding §2's "bare control" placement) — and check whether this file's existing test suite already asserts an exact count of `audio-rig-drawer__master-row` divs that this addition could break incidentally (the exact same risk `PING-VARIANCE-AUTOMATION.md` §7 flagged for its own addition).
* **`AUDIO_SYSTEM.md` doc change:** no automated test; verify by reading — the new subsection must clearly disambiguate `audioStore.bpm` (seeded, live, drives `Tone.Transport`) from `locale.settings.bpm` (static `60`, Factory/BubbleStream cadence only), and cross-reference this spec.
* **Verification Steps:**
  1. `npm run build:types` — zero TypeScript errors.
  2. `npm run lint` — zero ESLint errors.
  3. `npm test` — all new and existing tests pass.
  4. `npm run build` — production bundle builds cleanly.
* **Manual check (not automated):** retransmit coordinates-only (Sector Settings) several times and confirm the Audio Rig's Tempo slider jumps to a new value each time, always within `40`–`100` immediately after a retransmit; drag it to an extreme (e.g. `190`) then retransmit Attenuation-Style-only (name change, same coordinates) and confirm the dragged value survives untouched; drag it to an extreme, then retransmit coordinates-only and confirm the drag is discarded in favor of a freshly seeded value; drag the slider while a melody is audibly playing and confirm no audible click/zipper on each step.

---

## 6. Git & Workflow Context

* **Git Handling:** Human operator handles all branch creation, staging, commits, and merges manually.
* **Branch Convention:** `feature/bpm-slider` is the active branch and already reflects this spec's scope — no rename or fresh branch needed.
* **Commit Pattern:** No enforced conventional-commit format — short, imperative, descriptive sentences. Suggested grouping, each independently reviewable: (1) `localeBpmSeed.ts` (+ test) — the pure seeded-generator function, no wiring yet; (2) `AudioEngine.ts` (+ test) — the `setBPM` ramp, independent of everything else; (3) `audioStore.ts` (+ test) — `regenerateBpmFromSeed` and the module-load sync; (4) `worldTransition.ts` (+ test) — the two `retransmitCoordsOnly`/`retransmitBoth` call sites; (5) `audioRigConfig.ts` + `AudioRigDrawer.tsx` (+ tests) — the new slider; (6) `docs/AUDIO_SYSTEM.md` last.

---

## 7. Open Questions & Risks

Resolved during Specify (confirmed directly against the intent doc, not left open):

- ~~Is BPM stored on `Locale`/`LocaleSettings`?~~ **Resolved: no** — computed on demand by a pure function, never cached on the domain object, mirroring `globalAudio`'s relationship to `AttenuationStyle` (§1.3, §3).
- ~~Does `retransmitAttenuationStyleOnly` reseed BPM?~~ **Resolved: no** — intent doc's "no override carryover" is scoped to coordinate changes only (§1.3).
- ~~Does the manual-override slider get its own store action, separate from `setBPM`?~~ **Resolved: no** — `setBPM` already does exactly what the drag path needs; only the *seeding* path gets a new action (`regenerateBpmFromSeed`), which itself calls `setBPM` internally (§1.4).

Resolved via direct user confirmation (2026-09-01, same session):

- ~~Seeded range and precision?~~ **Resolved: `[40, 100]`, integer** — §1.2.
- ~~Drawer control labels?~~ **Resolved: lore `RESONANCE CADENCE`, human `Tempo`** — §1.5.

Still open — flag for Plan/Tasks, not blocking this spec:

1. **The drawer slider's full range (`[20, 200]`) and the ramp duration (`BPM_RAMP_SECONDS = 0.05`, matching `VOLUME_RAMP_SECONDS`) are this spec's own engineering defaults, not separately confirmed with the user** — unlike the seed range and labels (which were explicitly asked about), these were chosen by precedent/convention. Low risk, but worth a quick sanity check during Implement/manual review since they're audible/feel decisions, not just plumbing.
2. **Whether `disabled={rigDisabled}` (gating BPM under the master Bypass toggle) is the right call musically** — Bypass silences the global FX chain; BPM/tempo affects every robot voice's timing, not just the FX chain. This spec follows `PING_VARIANCE_AUTOMATION_SCHEMA`'s existing precedent (every Rig-wide master-row control is bypass-gated, no exceptions) for consistency rather than re-litigating it, but flagging here since — unlike Ping Variance Automation, which at least modulates audio *through* effects some of the time — tempo has no structural relationship to the FX chain at all. Easy to flip later if it reads wrong in practice (single prop change, no data-model impact).
3. **`AudioRigDrawer.test.tsx`'s existing test suite may already assert an exact list/count of `audio-rig-drawer__master-row` divs** — same risk `PING-VARIANCE-AUTOMATION.md` §7 flagged for its own addition; Plan/Implement should check before this spec's new row lands.
