# Phase Spec: Free | Sync Toggle (beat-synced Delay Time and LFO Rate)

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test`
> - Dev server: `npm run dev`

Source of intent: [docs/intent/free-sync-toggle.md](../intent/free-sync-toggle.md) (confirmed via a six-question `interview-me` pass, 2026-09-30). Branch `feature/free-sync-toggle`, off `main` at the Content Layer merge (PR #518). No roadmap slot yet — §6 proposes one.

Prior art this phase leans on: the "off via parameter" pattern (LFO rate 0 = off, no separate flag — `src/types/lfo.ts` `LFO_RATE_MIN`); `SliderLogSchema`'s `steps`/`formatValue` (a fixed allowed-value list on an existing slider, `docs/specs/AUTOMATION_FREQUENCY_DURATION_SPLIT.md` §1.6); the loading-range-vs-full-range split for seeding (`src/data/globalAudioLoadingRanges.ts`); and the diff-on-a-regenerated-baseline session model (`docs/specs/SESSION_STORAGE.md` §1.2), which is what makes "old sessions sound the same" cheap.

Survey basis (2026-09-30, against the current tree):

- **BPM already has one owner.** `audioStore.bpm` → `setBPM` → `AudioEngine.setBPM` → `Transport.bpm.value` (instant, no ramp — see that function's own comment). `beatClock.ts` only *reads* Transport position (`BEATS_PER_MEASURE = 4`). The Tempo slider runs 20–200 BPM (`BPM_SCHEMA`); seeded locale BPM is 40–100 (`LOCALE_BPM_SEED_RANGE`). Nothing new has to be linked; `Tone.LFO.sync()` stays un-called (lfoEngine.ts `start()` comment, `docs/AUDIO_SYSTEM.md`).
- **LFO rate reaches the engine from exactly four places**, all as a plain Hz float: `audioStore.setGlobalLfo`, `robotOptionsActions.applyLayerLfo`, `AudioEngine.start()`'s global priming loop, and `lfoDebug.ts`. Five more sites *read* `rate` for an on/off decision or display: the same three apply paths' `rate > 0` branches, `Lfo.tsx` (`isActive` class, `rateDisplay`), `audioDiagnostics.ts` (`globalLfosOn`). Serialisers: `sessionShareUtils.ts` (`{ s, r, d }`), `sessionDiff.ts` (deepEqual against baseline). Seeders: `globalAudioSeed.generateGlobalLfoSettings` (loading band 1–4 Hz, 34% quiet) and `spawnSystem.generateRobotLfoSettings` (full 0–20 Hz, 50% quiet).
- **Delay Time reaches the engine from one place** (`globalFx.setGlobalDelay`, via `audioStore`'s `GLOBAL_SETTER.delay` and `applyGlobalAudioToEngine`). The node is built with `maxDelay: 10`; the slider is 0–10 s step 0.001; the loading range is 0.05–0.5 s. `docs/reference/GLOBAL_CHAIN_GRID.md`'s delay row ("0–1 s, maxDelay: 1") is stale.
- **The LFO UI is one primitive.** `Lfo.tsx` builds its own Rate `SliderLinearSchema` in a `useMemo`; it is rendered by `LfoTargetGroup` (store-free, memoised) for the 3 global panels (`AudioRigLfoGroup` in `AudioRigDrawer.tsx`) and the 3 oscillator-layer panels (`SignatureArrayDrawer.tsx`), and by `AudioSettingSection.tsx` (hand-composed, via `useLfoTargetGroup`) for Volume. Company options reuse all of these (`CompanyOptionsSection.tsx`), broadcasting one changed field per edit through `diffCompoundField` (shallow `Object.is` per key of *next* only).
- **Delay's panel renders through the generic `paramRow` loop** in `AudioRigEffectPanel` — only `compressor` has a hand-composed branch today.
- **Seeded robot LFOs never reach the engine at spawn.** Only `applyLayerLfo` (a user edit) and the global priming loop call `lfoEngine.setLfoRate`; nothing primes `robot.lfoSettings`. Pre-existing, outside this phase, but it bounds what the tempo re-apply (§1.6) can touch — see §7.
- **`SliderLinearSchema` has no `formatValue`/`steps`**; `SliderLogSchema` has both. `CONTROL_SCHEMA_TYPES` is pinned at 14 by `controls.test.ts`.

ASSUMPTIONS I'm making, beyond what the intent doc already resolved (correct now or I'll proceed with these):

1. **Data shape is "optional `sync` field, absent = Free"** on both `LfoSettings` and `DelaySettings` — not a discriminated union. Zero migration for sessions and share links, and the existing `rate`/`delayTime` numbers stay where they are. The cost — `rate`/`delayTime` are *dead* while `sync` is present — is paid for by one rule: **nothing outside the two resolver helpers (§1.3) and the Free-mode slider may read `rate` or `delayTime` directly.** The survey above is the complete migration list.
2. **4/4 is assumed** for all note-value math (`beatClock.ts`'s `BEATS_PER_MEASURE = 4`; the Transport's time signature is never changed anywhere). One bar = 4 beats; a quarter note = 1 beat.
3. **The allowed set at a tempo = every note value whose derived value lies inside the control's full UI range**: Delay `[0, 10]` s (the real `maxDelay`), LFO `[0, 20]` Hz (`LFO_RATE_MIN/MAX`). One rule covers both the "hide divisions over maxDelay" requirement and the LFO's top end (1/32 triplet at 200 BPM is 40 Hz, over the cap). Multi-bar entries fall out of Delay's list naturally at any tempo above 24 BPM, so no separate "LFO-only" flag is needed on the list — but the 2- and 4-bar entries are still *defined* as straight-only (§1.2).
4. **Sync mode reuses `SliderLinear` with the slider value = index into the allowed list**, via a new optional `formatValue` on `SliderLinearSchema` (mirrors `SliderLogSchema`'s existing field). No 15th schema type; `CONTROL_SCHEMA_TYPES` stays at 14.
5. **The toggle is the existing `Toggle` primitive with facade content** (the `children` path Header's Mute already uses), showing the *current* mode's lore word — Float or Anchored. On = Sync. It sits at the end of the slider's row, which is what "beside the label" means once the slider's own `DualLabel` is at the row's start.
6. **The seed-time tempo is the locale's own seeded BPM** (`generateLocaleBpm(localeId, x, y)` — pure, from coordinates), never the live `audioStore.bpm`. That keeps every seeder deterministic from `{attenuationStyleName, coordinates}` alone, which Session Storage's baseline replay depends on (`generateRobotRosterBaseline` must reproduce spawn exactly).
7. **The seeded Sync draw does not change the existing quiet rolls.** A target that rolls quiet is `'off'` in Sync mode exactly as it is `rate: 0` in Free mode; the 34%/50% odds and their `getSeededVal` keys are untouched, so an existing world's *audible* on/off pattern survives this phase.
8. **Drift stays attached to synced LFOs** behind one module constant in `lfoDrift.ts` (`RATE_DRIFT_APPLIES_TO_SYNCED = true`) plus a per-key `tempoLocked` flag the three apply paths set. Flipping the constant to `false` zeroes rate-drift for locked keys and nothing else.
9. **A seeded or user-set Free value is kept, unchanged, when the toggle goes to Sync** (it is simply ignored), and **overwritten with the equivalent** when the toggle comes back to Free. The "keep the equivalent seconds/Hz" rule in the intent is about what the user *hears*, and this is the cheapest way to honour it without a second stored number.
10. **New copy goes in `src/content/copy/ui.ts`** (the control is shared, not feature-owned — same reasoning as `ui.lfo.*`). The toggle's own human/lore name is new wording and is listed in §7 for Crawford's veto; Float/Anchored are confirmed.

---

## 1. Overview & Claude Explanation

Delay Time and every LFO Rate get a Free | Sync toggle. Free is today's behaviour: a seconds or Hz number that ignores tempo. Sync replaces the number with a note value — a division (1/32 … 4 bars) plus a modifier (straight, dotted, triplet), or Off for an LFO — stored as exactly that pair, never as derived seconds/Hz. A pure resolver turns the pair into seconds or Hz from `audioStore.bpm`; the engine keeps receiving plain floats and never learns about note values. When the tempo changes, one re-apply pass pushes fresh floats for every synced value that already has a live node. The slider is the same slider in both modes: in Sync its stops become the note values currently allowed at this tempo, and its readout shows the note name. Seeding rolls Free/Sync 50/50 per stored target and, on Sync, draws from the note values that land inside the existing loading range at the locale's seeded tempo. Old sessions and links carry no `sync` field, so they load Free and sound identical.

### 1.1 Data shape

```ts
// src/data/noteValues.ts
export type NoteDivision = '1/32' | '1/16' | '1/8' | '1/4' | '1/2' | '1' | '2' | '4'; // '1'..'4' are bars
export type NoteModifier = 'straight' | 'dotted' | 'triplet';
export interface NoteValue { division: NoteDivision; modifier: NoteModifier }

// src/types/lfo.ts
export type LfoSync = NoteValue | 'off';
export interface LfoSettings {
  shape: LfoShape;
  /** Hz. Meaningful only while `sync` is absent (Free). Read it through resolveLfoRateHz(), never directly. */
  rate: number;
  depth: number;
  /** Present = Sync (Anchored). 'off' is the Sync-mode equivalent of rate 0. Absent = Free (Float). */
  sync?: LfoSync;
}

// src/types/globalAudio.ts
export interface DelaySettings {
  /** seconds (0 - 10). Meaningful only while `sync` is absent. Read it through resolveDelayTimeSeconds(). */
  delayTime: number;
  feedback: number;
  wet: number;
  /** Present = Sync. No 'off' — a delay always has a time. */
  sync?: NoteValue;
}
```

Both remain JSON-serialisable plain objects. `DEFAULT_LFO_SETTINGS`, `DEFAULT_GLOBAL_AUDIO_SETTINGS`, `NEUTRAL_LFO_VALUE` and `CompanyOptionsSection`'s `DISABLED_AUDIO_SETTING.volumeLfo` carry no `sync` field (Free), unchanged. `LfoValue` (controls.ts) stays an alias of `LfoSettings`, so the UI's value type picks the field up for free.

### 1.2 The note-value table and the conversion

`src/data/noteValues.ts` is pure data + pure math, no Tone, no store, no content import:

| division | whole-note fraction | beats (4/4) | modifiers defined |
|---|---|---|---|
| `1/32` | 1/32 | 0.125 | straight, dotted, triplet |
| `1/16` | 1/16 | 0.25 | straight, dotted, triplet |
| `1/8` | 1/8 | 0.5 | straight, dotted, triplet |
| `1/4` | 1/4 | 1 | straight, dotted, triplet |
| `1/2` | 1/2 | 2 | straight, dotted, triplet |
| `1` (1 bar) | 1 | 4 | straight, dotted, triplet |
| `2` (2 bars) | 2 | 8 | straight only |
| `4` (4 bars) | 4 | 16 | straight only |

Modifier factor: straight ×1, dotted ×1.5, triplet ×2⁄3. `NOTE_VALUES` is the 20-entry list above **sorted ascending by beats** (so 1/4 triplet at 0.667 sorts before 1/8 dotted at 0.75), built once at module load and asserted sorted by a test.

```ts
export function noteValueBeats(nv: NoteValue): number;                 // beats, 4/4
export function noteValueSeconds(nv: NoteValue, bpm: number): number;  // beats * 60 / bpm
export function noteValueHz(nv: NoteValue, bpm: number): number;       // 1 / seconds
export function noteValueEquals(a: NoteValue, b: NoteValue): boolean;

/** Entries whose derived value lies inside [min, max] at `bpm`, in NOTE_VALUES order. */
export function allowedNoteValues(bpm: number, range: { min: number; max: number }, unit: 'seconds' | 'hz'): NoteValue[];
/** The allowed entry closest (in the given unit) to `value`; never undefined when `allowed` is non-empty. */
export function nearestNoteValue(value: number, bpm: number, allowed: readonly NoteValue[], unit: 'seconds' | 'hz'): NoteValue;
```

Worked values at 60 BPM: 1/4 = 1 s = 1 Hz; 1/8 dotted = 0.75 s; 1/4 triplet = 0.667 s; 1 bar = 4 s = 0.25 Hz; 4 bars = 16 s = 0.0625 Hz; 1/32 = 0.125 s = 8 Hz. These are the fixture numbers §5's tests pin.

Two exported constants give the two controls their full ranges: `DELAY_TIME_RANGE_SECONDS = { min: 0, max: 10 }` (lives in `globalAudio.ts` next to `DelaySettings`, and `globalFx.ts`'s `maxDelay: 10` comment points at it) and the existing `LFO_RATE_MIN/MAX`.

### 1.3 Resolvers — the only readers of `rate` / `delayTime`

`src/utils/tempoSync.ts` (pure, no Tone, no store):

```ts
/** Hz the engine should run at. Free: rate. Sync 'off': 0. Sync note: noteValueHz, clamped into
 *  [LFO_RATE_MIN, LFO_RATE_MAX] — a tempo change that pushes a note past the cap clamps rather than disconnects. */
export function resolveLfoRateHz(settings: LfoSettings, bpm: number): number;
/** True when the LFO is requested — the replacement for every `rate > 0` read. */
export function isLfoOn(settings: LfoSettings): boolean;   // sync === undefined ? rate > 0 : sync !== 'off'
/** Seconds the delay node should use, clamped into DELAY_TIME_RANGE_SECONDS. */
export function resolveDelayTimeSeconds(delay: DelaySettings, bpm: number): number;
/** DelaySettings with delayTime replaced by the resolved seconds — what AudioEngine.setGlobalDelay receives. */
export function resolveDelayForEngine(delay: DelaySettings, bpm: number): DelaySettings;
```

Migration of every surveyed site (this list *is* the task plan's checklist):

| site | today | after |
|---|---|---|
| `audioStore.setGlobalLfo` | `setLfoRate(target, value.rate)`; `if (value.rate > 0)` | `setLfoRate(target, resolveLfoRateHz(value, get().bpm))`; `setLfoTempoLocked(target, value.sync !== undefined)`; `if (isLfoOn(value))` |
| `robotOptionsActions.applyLayerLfo` | same shape | same shape, `useAudioStore.getState().bpm`, with `robot.id` |
| `AudioEngine.start()` priming loop | same shape | same shape (it already dynamic-imports `useAudioStore`) |
| `audioStore` `GLOBAL_SETTER.delay` + `applyGlobalAudioToEngine` | `AudioEngine.setGlobalDelay(delay)` | `AudioEngine.setGlobalDelay(resolveDelayForEngine(delay, bpm))` — `GLOBAL_SETTER.delay` becomes a small wrapper since the table is built at module scope |
| `audioDiagnostics.globalLfosOn` | `l.rate > 0` | `isLfoOn(l)` |
| `Lfo.tsx` | `value.rate` for display + `isActive` | §1.4 |
| `lfoDebug.ts` | `setLfoRate(…, 3, …)` | unchanged — it bypasses state on purpose |

`lfoEngine.ts` keeps its "rate is a plain Hz float, no Transport involvement" contract. It gains two small things: `setLfoTempoLocked(target, locked, robotId?)` (forwards to `lfoDrift`'s per-key flag, §1.9) and `hasLfo(target, robotId?): boolean` (true when `activeLfos` has a node — used by §1.6 so a re-apply never *constructs* nodes).

### 1.4 UI — the toggle and the stepped slider

**`SliderLinearSchema` gains `formatValue?: (value: number) => string`**, identical in meaning to `SliderLogSchema.formatValue`: when present it replaces the `formatDisplayValue(displayValue) + unit` readout entirely. `SliderLinear.tsx`'s `valueLabel` is the only change (one ternary). Because `useEasedControlValue` eases the displayed value between integers, every `formatValue` this phase writes rounds its argument first.

**New composition component `src/components/ui/controls/TempoSyncSlider.tsx`** (+ `.css`, + test) — a composition like `LfoTargetGroup`, not a 15th schema primitive:

```ts
interface TempoSyncSliderProps {
  /** The Free-mode schema exactly as today (min/max/step/unit/labels). Sync mode derives its own from it. */
  schema: SliderLinearSchema;
  freeValue: number;
  /** undefined = Free. For an LFO, 'off' is a legal Sync value; for Delay it never is. */
  syncValue: NoteValue | 'off' | undefined;
  /** The allowed list at the current tempo (allowedNoteValues(...)), optionally with 'off' prepended by the caller. */
  allowed: readonly (NoteValue | 'off')[];
  onFreeChange: (value: number) => void;
  onSyncChange: (value: NoteValue | 'off') => void;
  /** Toggle flipped. The caller performs the §1.5 conversion — this component stays store-free and tempo-free. */
  onModeChange: (sync: boolean) => void;
  disabled?: boolean;
  heldOffDisplay?: boolean;   // Lfo.tsx's existing heldOff: readout shows 0 / nothing, never the real value
  swelling?: boolean;
}
```

Rendering: a flex row (`.sc-tempo-sync`) holding one `SliderLinear` (flex: 1) and one `Toggle`. In Free mode the slider is the given schema and value, unchanged. In Sync mode the slider's schema is `{ ...schema, id: schema.id + '.sync', min: 0, max: allowed.length - 1, step: 1, unit: undefined, formatValue: (i) => formatNoteValueOrOff(allowed[Math.round(i)]) }`, value is the index of `syncValue` in `allowed` — or, when `syncValue` is not in `allowed` (a tempo change pushed it out), the index of the clamped entry: the last entry for a too-long value, the first for a too-short one (or `'off'` if present). The display clamps; state is never written on render — raising the tempo back restores the original note. The toggle: `schema = { id: schema.id + '.mode', type: 'toggle', ...labels('ui.tempoSync') }`, `value = syncValue !== undefined`, facade children = the current mode's `DualLabel` from `options('ui.tempoSync')` (`free` → Free / Float, `sync` → Sync / Anchored), so the box reads "Float" at rest and "Anchored" when popped.

**`Lfo.tsx`** replaces its Rate `SliderLinear` with `TempoSyncSlider`, so it needs the tempo: a new required `bpm: number` prop, threaded through `LfoTargetGroup` (new required prop, forwarded untouched) and `AudioSettingSection`. The five callers subscribe with `useAudioStore((s) => s.bpm)` and pass it: `AudioRigLfoGroup`, `SignatureArrayDrawer`, `AudioSettingSection`'s two parents (`RobotOptionsTab`, `CompanyOptionsSection`). `allowed` = `['off', ...allowedNoteValues(bpm, { min: LFO_RATE_MIN, max: LFO_RATE_MAX }, 'hz')]`, memoised on `bpm`. `isActive` and `rateDisplay` move to `isLfoOn(value)` / `resolveLfoRateHz(value, bpm)` (Free) or the index (Sync). `Lfo.test.tsx`'s Rate assertions get a `bpm={60}` prop and a new Sync-mode block.

**Delay** gets a hand-composed branch in `AudioRigEffectPanel` beside the existing `compressor` one: `delayTime` renders through `TempoSyncSlider` (allowed = `allowedNoteValues(bpm, DELAY_TIME_RANGE_SECONDS, 'seconds')`, no `'off'`), `feedback`/`wet` through `paramRow` as today. Its `onSyncChange`/`onModeChange` go through `setGlobalAudio('delay', { sync })` so the store's existing `delay` setter path (now resolving, §1.3) pushes the node.

**`formatNoteValue`** lives in `src/utils/formatNoteValue.ts` (content-backed, so it is *not* in `data/noteValues.ts`): `"1/8"`, `"1/8 dotted"`, `"1/4 triplet"`, `"1 bar"`, `"2 bars"`, `"Off"` — every word from content (§1.10); the digits and the slash are data.

### 1.5 Mode transitions (the caller-side conversion)

Both directions are pure functions in `tempoSync.ts`, called by the owning setter path (`Lfo.tsx` → its `onChange`; the Delay branch → `setGlobalAudio`):

- **Free → Sync:** `sync = nearestNoteValue(current, bpm, allowed, unit)`; for an LFO whose `rate` is 0, `sync = 'off'`. `rate`/`delayTime` are left as they were (assumption 9). If the nearest value would exceed the cap, `nearestNoteValue` already returns the longest allowed entry because the list is pre-filtered.
- **Sync → Free:** `rate = quantizeToStep(resolveLfoRateHz(settings, bpm), LFO_RATE_MIN, RATE_STEP)` (`'off'` → 0); `delayTime = quantizeToStep(resolveDelayTimeSeconds(delay, bpm), 0, 0.001)`; then the `sync` key is **deleted** (not set to `undefined` — the object must stay clean for `deepEqual`, JSON and the wire).

### 1.6 Tempo change — the re-apply pass

`audioStore.setBPM` becomes: `set({ bpm }); AudioEngine.setBPM(bpm); reapplyTempoSyncedValues(bpm);`. `reapplyTempoSyncedValues` (in `src/systems/tempoSync.ts`, the side-effecting sibling of the pure `utils` one) does nothing unless `AudioEngine.isInitialized()` (new one-line getter over the existing `initialized` flag — `start()` primes everything from state anyway). Otherwise it:

1. Calls `AudioEngine.setGlobalDelay(resolveDelayForEngine(globalAudio.delay, bpm))` when `delay.sync` is present.
2. For each global target whose `globalLfo[target].sync` is present and `lfoEngine.hasLfo(target)`: `setLfoRate(target, resolveLfoRateHz(...))`.
3. For each robot in the active locale, each `lfoSettings[target]` with `sync` present and `hasLfo(target, robot.id)`: same, with `robot.id`.

It never connects, disconnects, starts, stops or constructs. `setLfoRate` already calls `refreshRateDriftGain`, so drift swing bounds follow. The Tempo slider fires `setBPM` continuously during a drag (see `AudioEngine.setBPM`'s comment); each tick is at most ~7 + 12×13 cheap `frequency.value` writes, and in practice far fewer because untouched robot LFOs have no node (§7).

Free values are never touched by this pass — that is the whole point of the toggle.

### 1.7 Seeding

One rule for all three seeders: **roll Free/Sync 50/50 per stored target; on Sync draw uniformly from `allowedNoteValues(seedBpm, loadingRange, unit)`; keep the existing quiet roll.** `seedBpm` is a new parameter on each generator, supplied by the caller as `generateLocaleBpm(localeId, x, y)` (assumption 6).

| seeder | new `getSeededVal` keys | Sync draw band | Sync result |
|---|---|---|---|
| `generateGlobalAudioSettings(asId, asName, seedBpm)` — Delay | `globalAudio.delay.syncMode`, `globalAudio.delay.syncIndex` | `GLOBAL_AUDIO_LOADING_RANGES['delay.delayTime']` (0.05–0.5 s) | `delay.sync = allowed[floor(t * allowed.length)]`; `delayTime` still sampled as today (it is the Free value kept under assumption 9) |
| `generateGlobalLfoSettings(asId, asName, seedBpm)` | `globalLfo.${target}.syncMode`, `globalLfo.${target}.syncIndex` | `[LFO_RATE_LOADING_MIN, LFO_RATE_LOADING_MAX]` (1–4 Hz) | quiet → `sync: 'off'`; else `sync = allowed[…]` |
| `generateRobotLfoSettings(noiseMap, offset, seedBpm)` | `robot.lfo.${target}.syncMode`, `robot.lfo.${target}.syncIndex` | `[LFO_RATE_MIN, LFO_RATE_MAX]` (0–20 Hz, i.e. the full list) | same |

Existing keys (`.rate`, `.depth`, `.shape`, `.quiet`) and their order of evaluation are untouched, so a world's Free values and quiet pattern are byte-identical to today when the coin lands Free. If `allowed` is empty at `seedBpm` (cannot happen for 40–100 BPM with these bands — a test proves it across the whole `LOCALE_BPM_SEED_RANGE`), the seeder falls back to Free.

Callers that must thread `seedBpm`: `audioStore.regenerateGlobalAudioFromSeed` / `regenerateGlobalLfoFromSeed` (read the active locale from `localeStore` and compute `generateLocaleBpm`), `spawnSystem.spawnRobot` and `generateRobotRosterBaseline` (both already hold the locale's noise map and coordinates), `sessionDiff.buildSessionPayload`'s baseline replay (through `generateRobotRosterBaseline`). §7 flags the boot-order question this raises.

### 1.8 Persistence, sharing, companies

- **Sessions (`SessionPayload`, version stays 1):** `globalAudio.delay.sync` rides inside the full `globalAudio` object; `globalLfo[target].sync` rides inside each full `LfoSettings`; robot `lfoSettings` diffs are `deepEqual` per target, so a changed `sync` is captured and an absent one isn't. `sessionDiff.ts`'s delay normalisation spreads `...toCapture.delay`, so `sync` survives it. **Old payloads have no `sync` anywhere → Free.** No migration code.
- **Share links (`sessionShareUtils.ts`):** `CompactLfoSettings` gains `y?: string` — a compact code: division token (`32`, `16`, `8`, `4`, `2`, `1b`, `2b`, `4b`) + modifier suffix (`` / `d` / `t`), or `off`. `globalAudio` travels whole (`g`), so Delay needs nothing. Absent `y` → Free. Round-trip test for every list entry plus `off`.
- **Company broadcast:** the one-changed-field semantics stay, but `diffCompoundField` must learn that a key present in `prev` and absent in `next` is a change (today it only iterates `next`'s keys, so Sync → Free would broadcast `{}`). It returns `{ sync: undefined }` for that case and the three merge sites (`handleLayerLfoFieldChange`, the volume-LFO handler, the snapshot patch) strip an `undefined` `sync` after spreading. `CompanyOptionsSnapshot.volumeLfo` / `.lfoSettings` need no type change (`LfoSettings` already carries it).
- **World Clock replay / melody generation:** untouched — neither reads LFO rate or delay time.

### 1.9 Drift and synced LFOs

`lfoDrift.ts` gains `export const RATE_DRIFT_APPLIES_TO_SYNCED = true;` and a `tempoLocked` boolean on each `driftLinks` entry (default false), set through a new `setTempoLocked(key, locked)` that `lfoEngine.setLfoTempoLocked` forwards to. `refreshRateDriftGain` computes `link.rateDriftGain.gain.value = (link.tempoLocked && !RATE_DRIFT_APPLIES_TO_SYNCED) ? 0 : globalRateDriftByGroup[link.group] * swing.max`. With the constant `true` the audible behaviour is identical to today; flipping it is the "one obvious switch" the intent asks for. Depth drift is untouched either way (it doesn't move the LFO off the grid). The stale "LFO_RATE_MIN is 0.1" comment in `attachDrift` gets corrected in passing since the function is being edited.

### 1.10 Content

New entries in `src/content/copy/ui.ts` (wording in §7 for veto; Float/Anchored confirmed):

```ts
'ui.tempoSync': {
  human: 'Tempo Sync', lore: 'Anchoring',
  options: { free: { human: 'Free', lore: 'Float' }, sync: { human: 'Sync', lore: 'Anchored' } },
},
'ui.noteValue.off':      { human: 'Off' },
'ui.noteValue.fraction': { human: 'Fraction', template: '1/{n}' },
'ui.noteValue.bar':      { human: '1 bar' },
'ui.noteValue.bars':     { human: 'Bars', template: '{n} bars' },
'ui.noteValue.modifier': { human: 'Modifier', options: { dotted: { human: 'dotted' }, triplet: { human: 'triplet' } } },
'ui.noteValue.modified': { human: 'Modified note', template: '{note} {modifier}' },
```

Straight has no suffix by rule, not by an empty string (content requires a non-empty `human`). Every key is referenced from `formatNoteValue.ts` or `TempoSyncSlider.tsx`, satisfying `content.test.ts`'s "every key referenced" assertion; no literal copy appears in a component or data file, satisfying the ESLint rule.

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── noteValues.ts                       NEW  — NoteDivision/NoteModifier/NoteValue, NOTE_VALUES, beats/seconds/Hz math, allowedNoteValues, nearestNoteValue
│   ├── noteValues.test.ts                  NEW
│   ├── audioRigConfig.ts                   (no change expected — delay schema stays the Free schema)
│   └── lfoConfig.ts                        (no change — defaults stay Free)
├── types/
│   ├── lfo.ts                              + LfoSync, LfoSettings.sync
│   ├── globalAudio.ts                      + DelaySettings.sync, DELAY_TIME_RANGE_SECONDS
│   └── controls.ts                         + SliderLinearSchema.formatValue
├── utils/
│   ├── tempoSync.ts                        NEW  — resolveLfoRateHz, isLfoOn, resolveDelayTimeSeconds, resolveDelayForEngine, toSync/toFree conversions (pure)
│   ├── tempoSync.test.ts                   NEW
│   ├── formatNoteValue.ts                  NEW  — content-backed readout
│   ├── formatNoteValue.test.ts             NEW
│   ├── globalAudioSeed.ts                  + seedBpm param, Delay + global-LFO Sync rolls
│   ├── globalAudioSeed.test.ts             + determinism/band/fallback cases
│   ├── sessionShareUtils.ts                + CompactLfoSettings.y codec
│   ├── sessionShareUtils.test.ts           + round-trip
│   └── sessionDiff.ts                      (baseline replay threads seedBpm; no diff-logic change)
├── systems/
│   ├── tempoSync.ts                        NEW  — reapplyTempoSyncedValues (side-effecting)
│   ├── tempoSync.test.ts                   NEW
│   ├── spawnSystem.ts                      + seedBpm param on generateRobotLfoSettings / generateRobotRosterBaseline / spawnRobot
│   ├── spawnSystem.test.ts                 + cases
│   ├── robotOptionsActions.ts              applyLayerLfo → resolver + tempoLocked
│   └── companyOptions.ts                   diffCompoundField detects removed keys
├── stores/
│   └── audioStore.ts                       setBPM re-apply; setGlobalLfo + GLOBAL_SETTER.delay + applyGlobalAudioToEngine resolve; seedBpm to regenerate*
├── engine/
│   ├── lfoEngine.ts                        + setLfoTempoLocked, hasLfo
│   ├── lfoDrift.ts                         + RATE_DRIFT_APPLIES_TO_SYNCED, tempoLocked per link
│   ├── AudioEngine.ts                      + isInitialized(); priming loop → resolver
│   ├── audioEngine/globalFx.ts             comment only (maxDelay ↔ DELAY_TIME_RANGE_SECONDS)
│   └── audioDiagnostics.ts                 isLfoOn
├── components/
│   ├── ui/controls/
│   │   ├── TempoSyncSlider.tsx / .css / .test.tsx   NEW composition
│   │   ├── SliderLinear.tsx                formatValue readout
│   │   ├── Lfo.tsx / Lfo.test.tsx          Rate row → TempoSyncSlider; bpm prop
│   │   ├── LfoTargetGroup.tsx              bpm prop forwarded
│   │   └── useLfoTargetGroup.ts            (no change — NEUTRAL stays Free)
│   ├── panels/screen/console/AudioRigDrawer.tsx     bpm into AudioRigLfoGroup; delay hand-composed branch
│   ├── robot/SignatureArrayDrawer.tsx               bpm prop
│   ├── robot/AudioSettingSection.tsx                bpm prop
│   ├── panels/screen/console/RobotOptionsTab.tsx    bpm subscription
│   └── company/CompanyOptionsSection.tsx            bpm subscription; strip undefined sync on merge
├── content/copy/ui.ts                      §1.10 entries
docs/
├── AUDIO_SYSTEM.md                         LFO section: rate is Hz at the engine; Sync resolves above it; drift switch
├── reference/GLOBAL_CHAIN_GRID.md          delay row corrected to 0–10 s / maxDelay 10; Sync note
├── reference/ROBOT_DATA_GRID.md            LFO Rate row: Sync note
├── COMPONENT_LIBRARY.md                    TempoSyncSlider composition; SliderLinear formatValue
├── SESSION_STORAGE.md                      optional sync fields, absent = Free
├── COMPANIES.md                            removed-key diff semantics
├── todo/roadmap.md                         new phase entry
└── specs/FREE_SYNC_TOGGLE.md               this file
```

Not touched: `beatClock.ts`, `Tone.LFO.sync`, `lfoEngine`'s rate contract, every lore/human label that exists today, `ReverbSettings`/`CompressorSettings`, probe envelope times, Phrase Length.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface, not a drive-by.
- **Engine stays Hz/seconds-only.** `lfoEngine.ts` and `globalFx.ts` never import `noteValues.ts` or read `sync`. The resolvers run in the store/system layer. `Tone.LFO.sync()` and Tone time strings are not used (intent).
- **No direct `rate`/`delayTime` reads** outside `tempoSync.ts`'s resolvers and the Free-mode slider path. A reviewer greps `\.rate\b` and `delayTime` at Checkpoint D; anything new must be in the §1.3 table.
- **State stays JSON-serialisable.** `sync` is a plain object or the string `'off'`. Deleting the key, never `undefined`-ing it, on Sync → Free.
- **No timers for anything musical.** The re-apply pass is synchronous inside `setBPM`.
- **Primitives:** `SliderLinear` gets one optional schema field and one ternary; `Toggle` is used as-is through its existing `children` path; `CONTROL_SCHEMA_TYPES` stays 14. `TempoSyncSlider` is a composition, like `LfoTargetGroup`, and stays store-free (tempo and allowed list arrive as props).
- **Content:** every new word in `src/content/copy/ui.ts`; the ESLint rule and `content.test.ts` stay green with no exemptions added.
- **Seed determinism:** new `getSeededVal` keys only; existing keys and their draw order unchanged. `seedBpm` is always the pure `generateLocaleBpm` value.
- **Backward compatibility is structural, not coded:** no payload version bump, no migration function. A test loads a hand-written version-1 payload with no `sync` fields and asserts the resolved Hz/seconds equal the stored numbers.
- **Protected paths:** never `.env*`, `node_modules/`, build output.

---

## 4. Code Style & Architecture Conventions

The pure resolver — the one place `rate` is allowed to be read for audio:

```ts
// src/utils/tempoSync.ts
import { LFO_RATE_MIN, LFO_RATE_MAX, type LfoSettings } from '@/types/lfo';
import { noteValueHz } from '@/data/noteValues';
import { clamp } from '@/engine/lfoShared';

/** Hz the engine should run at — Free: the stored rate; Sync: derived from the note at `bpm`, clamped
 *  into the LFO's own full range so a tempo change past the cap clamps rather than disconnects. */
export function resolveLfoRateHz(settings: LfoSettings, bpm: number): number {
  if (settings.sync === undefined) return settings.rate;
  if (settings.sync === 'off') return 0;
  return clamp(noteValueHz(settings.sync, bpm), LFO_RATE_MIN, LFO_RATE_MAX);
}
```

The apply path, after migration — same three-line shape in all three places:

```ts
// src/stores/audioStore.ts
setGlobalLfo: (target, value) => {
  set((state) => ({ globalLfo: { ...state.globalLfo, [target]: value } }));
  const hz = resolveLfoRateHz(value, get().bpm);
  lfoEngine.setLfoShape(target, value.shape);
  lfoEngine.setLfoRate(target, hz);
  lfoEngine.setLfoDepth(target, value.depth);
  lfoEngine.setLfoTempoLocked(target, value.sync !== undefined);
  if (isLfoOn(value)) {
    if (lfoEngine.connectLfoTarget(target)) lfoEngine.start(target);
  } else {
    lfoEngine.disconnectLfoTarget(target);
    lfoEngine.stop(target);
  }
},
```

The Sync-mode schema derivation inside `TempoSyncSlider` — note `useMemo` keyed on the inputs, matching every other primitive's stable-schema rule:

```tsx
const syncSchema: SliderLinearSchema = useMemo(
  () => ({
    ...schema,
    id: `${schema.id}.sync`,
    min: 0,
    max: Math.max(0, allowed.length - 1),
    step: 1,
    unit: undefined,
    formatValue: (i) => formatNoteValueOrOff(allowed[Math.round(i)]),
  }),
  [schema, allowed],
);
```

Conventions: named exports, plain function components wrapped in `memo`, co-located CSS, section-banner comments (`// ===== IMPORTS =====`) as in `globalAudioSeed.ts`, doc comments that say *why* and name the spec section. New seeded keys are dot-namespaced like their neighbours (`globalLfo.${target}.syncMode`).

---

## 5. Testing & Verification Requirements

Framework: Vitest + Testing Library, co-located. House TDD rhythm: RED first, one commit per task, mutation-check at gates.

**`noteValues.test.ts`** — 20 entries; sorted ascending by beats; 2/4 bars straight-only; the 60 BPM fixture values (§1.2); `allowedNoteValues(60, {0,10}, 'seconds')` excludes 4 bars and includes 2 bars; `allowedNoteValues(200, {0,20}, 'hz')` excludes 1/32 triplet; `nearestNoteValue(0.3, 60, …, 'seconds')` is 1/4 triplet; `nearestNoteValue` with an over-cap input returns the last allowed entry.

**`tempoSync.test.ts` (utils)** — Free passes `rate` through untouched (including 0 and 20); `'off'` → 0; 1/4 at 60 → 1 Hz, at 120 → 2 Hz; clamping at 200 BPM for 1/32 triplet; `isLfoOn` truth table (4 cases); `resolveDelayTimeSeconds` clamps 2 bars at 20 BPM (24 s) to 10; `resolveDelayForEngine` leaves `feedback`/`wet` alone; Free→Sync of 0.3 s at 60 → 1/4 triplet, of rate 0 → `'off'`; Sync→Free of 1/8 dotted at 60 → `rate: 1.35` (quantised to 0.05) **and no `sync` key** (`'sync' in result === false`).

**`tempoSync.test.ts` (systems)** — with `AudioEngine.isInitialized()` mocked false: no engine call. Mocked true: a synced global target with `hasLfo` true gets exactly one `setLfoRate` with the resolved Hz; a synced target with `hasLfo` false gets none; a Free target gets none; a robot target is called with `robot.id`; Delay with `sync` → one `setGlobalDelay` with resolved seconds; Delay without → none. Mutation check: delete the `hasLfo` guard and watch the "no construct" case go red.

**Seeding** — for every BPM in `LOCALE_BPM_SEED_RANGE` (40..100): `allowed` is non-empty for all three bands; same inputs → identical output twice (determinism); over a sample of 50 Attenuation Style names the Sync share of targets is within [30%, 70%]; every Sync draw's derived value lies inside its band at `seedBpm`; a quiet target in Sync mode is `'off'`; **the Free-mode values and quiet pattern for a fixed name are byte-identical to the pre-phase output** — there is no snapshot fixture today (`globalAudioSeed.test.ts`'s `readFileSync` only reads its own source for a mirrored-constant check), so the first seeding task captures the current `generateGlobalAudioSettings`/`generateGlobalLfoSettings`/`generateRobotLfoSettings` output for two fixed names as inline expected objects *before* any seeder changes, and those become the oracle. `generateRobotRosterBaseline` reproduces `spawnRobot`'s `lfoSettings` including `sync` (the parity test seeds a non-default `sync` so it can't pass by coincidence — see the World Clock lesson in `docs/specs/WORLD_CLOCK_DETERMINISTIC_LIFECYCLE_REPLAY.md`).

**UI** — `TempoSyncSlider.test.tsx`: Free renders the given schema's min/max/step and readout with unit; Sync renders `max = allowed.length - 1`, `step = 1`, readout `"1/8 dotted"` for that index, no unit; a `syncValue` absent from `allowed` displays the clamped index without calling any `onChange`; toggle click calls `onModeChange` only; arrow key in Sync calls `onSyncChange` with a `NoteValue` (or `'off'` at index 0 when present) and never `onFreeChange`. `Lfo.test.tsx`: existing cases pass with `bpm={60}`; `isActive` follows `isLfoOn` (a Sync `'off'` LFO is inactive; a Sync 1/4 is active); `onChange` on mode flip delivers a complete `LfoValue` with/without `sync`. `SliderLinear.test.tsx`: `formatValue` replaces the readout; absent → unchanged readout. `AudioRigDrawer` test: the delay block renders a `TempoSyncSlider` for `delayTime` and plain rows for `feedback`/`wet`.

**Persistence** — `sessionShareUtils.test.ts`: every `NOTE_VALUES` entry and `'off'` round-trips through `y`; absent `y` decodes to no `sync` key. `sessionDiff.test.ts`: a robot whose only change is `sync` on one target diffs to exactly that target; a version-1 payload fixture with no `sync` anywhere applies and resolves to its stored numbers. `companyOptions.test.ts`: `diffCompoundField({ …, sync: {…} }, { … })` returns `{ sync: undefined }`; the merge site strips it.

**Content** — `content.test.ts` unchanged and green (every new key referenced; no literal in components/data).

**Lint/type/build** — `npm run lint`, `npm run build:types`, `npm run build` clean at every checkpoint.

**Checkpoint E (manual, Crawford):** flip a global EQ LFO to Anchored, drag Tempo, hear the rate follow; flip a robot layer LFO to Anchored while a sibling stays Float, drag Tempo, hear one move and one hold; set Delay to 1/4 at 60 BPM, drag Tempo to 20, confirm the readout clamps to the longest allowed entry and the delay audibly stops lengthening at 10 s; load a session saved before this branch and confirm every toggle reads Float; open a company with mixed members and confirm a Sync→Free broadcast actually lands on every member.

---

## 6. Git & Workflow Context

- Branch `feature/free-sync-toggle` (already checked out), off `main` at 1330e880.
- One commit per task, imperative subject, body citing the spec section, co-author trailer per the session reminder. Crawford merges.
- Roadmap: add **Phase 33 — Free | Sync Toggle** to `docs/todo/roadmap.md` (31 and 32 are the last entries), pointing at the intent and this spec; "Not Doing" lists probe envelopes (later follow-up), Reverb/Compressor times, Drift, Sustain, Phrase Length, the 1 s cap.
- Docs land in the last task, with the `GLOBAL_CHAIN_GRID.md` delay-row correction done then too (a correction note, not a rewrite).

---

## 7. Open Questions & Risks

**Needs Crawford (wording — veto column is yours):**

1. The toggle's own name for the accessible label and the `DualLabel` row when it has no facade: proposed human **"Tempo Sync"**, lore **"Anchoring"** (§1.10). Float / Anchored themselves are confirmed.
2. Readout word choices: "1/8 dotted", "1/4 triplet", "1 bar", "2 bars", "Off". Alternatives ("1/8." / "1/8T") are shorter but less legible on the voxel readout; I've gone legible.
3. Should 2 bars and 4 bars take dotted/triplet too? Spec says straight-only (a "4 bars dotted" = 6 bars reads as noise). Say the word and the table grows by four rows.

**Needs a decision during planning, not from Crawford:**

4. **Boot ordering for `seedBpm`.** `audioStore.ts` runs two module-load syncs back to back: `syncGlobalAudioToCurrentAttenuationStyle()` (seeds globalAudio + globalLfo from the Attenuation Style alone) and then `syncBpmToCurrentLocale()`, which looks the current locale up in `localeStore` and **returns early if there is none yet**. So the locale may or may not exist when the global seed runs, and the AS-switch subscription re-seeds global audio without touching bpm (`retransmitAttenuationStyleOnly` must leave bpm alone — `docs/specs/archive/BPM_CONTROL.md` §1.3). The spec's rule is that `seedBpm` for the global seeders is **the current locale's `generateLocaleBpm`** (pure, from its coordinates), looked up the same way `syncBpmToCurrentLocale` does. The plan's first task must establish whether a locale is guaranteed at `audioStore` module-load time (the AS store primes `'pelagos'` at module scope — check `localeStore` does likewise). If it is, nothing more is needed. If it isn't, the options are (a) re-run the global seed once the locale is known, or (b) seed from a fixed reference tempo — which contradicts the confirmed "at the seeded tempo" intent and must not be chosen silently.
5. **`GLOBAL_SETTER` is built at module scope** from `AudioEngine.setGlobal*` references; wrapping `delay` with a resolver that reads `get().bpm` means the wrapper must be defined inside `create()` or read the store lazily. Small, but it is the kind of thing that throws at import time (see `AudioEngine.start()`'s dynamic-import comment for the precedent).

**Risks:**

6. **Seeded robot LFOs don't reach the engine at spawn today** (survey). The re-apply pass honours that via `hasLfo`, so it is *consistent*, but a user may expect a freshly loaded Anchored robot LFO to follow tempo and find it silent until touched — which is exactly today's behaviour for Float too. Record it in the roadmap entry as a pre-existing gap, not a regression; fixing it is its own phase.
7. **`diffCompoundField` change is behavioural for every compound field**, not just LFOs (ADSR, toggles). Returning `{ key: undefined }` for a removed key is inert for fields that never remove keys, and the test suite for `companyOptions` covers the existing shapes; still, it's the one change outside the LFO/Delay surface and gets its own commit.
8. **Audio Load Budget** reads `heldOffLfoKeys` and request state via `isLfoOn`-equivalent logic in `lfoEngine` (`rate > 0` on the engine's own Hz copy) — unaffected, because the engine only ever sees resolved Hz. Worth one assertion in the systems test: a Sync `'off'` target is never requested.
9. **Share-link size:** `y` adds ≤ 4 bytes per synced LFO; negligible against the existing budget.
10. **Perf:** `allowedNoteValues` is called per render of every mounted `Lfo`/Delay row when `bpm` changes; it's a 20-entry filter, memoised on `bpm`. The Tempo drag already re-renders those rows today.
