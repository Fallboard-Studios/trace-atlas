# Phase Spec: Free | Sync Toggle (beat-synced LFO Bank lanes and Delay Time)

> **Rewritten 2026-10-02 against the LFO Bank.** The 2026-09-30 version of this spec (one toggle per LFO target across global chain, robots and companies) is in git history; it targeted the per-target `Lfo.tsx`/`lfoDrift.ts` world that `docs/tasks/LFO_BANK.md` deleted. This version is the re-scope Crawford confirmed on 2026-10-02 (top section of the intent doc).

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`

Source of intent: [docs/intent/free-sync-toggle.md](../intent/free-sync-toggle.md) — the dated "Re-scope after the LFO Bank" section wins wherever the older body conflicts. Branch `feature/sync-toggle`, off `main` at `07da4a73` (PR #521, the LFO Bank merge). Roadmap slot: **Phase 33** (§6).

Survey basis (2026-10-02, against the current tree):

- **LFO rate lives on four lanes only.** `BankLfoSettings { shape, rate, rateDrift, depthDrift }` per lane `'a'|'b'|'c'|'d'` (`src/types/lfo.ts`); a modulated field stores only `LfoLink { lane, depth }`. Lane rate reaches the engine from exactly two places: `audioStore.setLfoBank` → `lfoEngine.setBankRate` (`audioStore.ts:394`) and `AudioEngine.start()` → `lfoEngine.primeLfoBank(lfoBank)` (`AudioEngine.ts:512`), which reads `laneSettings.rate` directly. One more site reads `rate` for an on/off decision: `audioDiagnostics.readBankRunning` (`lane.rate > 0`). Serialisers: `sessionDiff.ts` (captures `lfoBank` whole, spreading each lane; restores via `setLfoBank` per lane when the context is running, else `setState`) and `sessionShareUtils.ts` (`CompactBankLfoSettings { s, r, rd, dd }` under `lb`). Seeder: `generateLfoBankSettings(asId, asName)` (`globalAudioSeed.ts:289`) — per-lane log-spaced bands `LFO_BANK_RATE_BANDS` (a 0.1–0.4, b 0.4–1.5, c 1.5–4, d 4–8 Hz). UI: `LfoBankLanePanel.tsx` renders the lane's Rate as a plain `SliderLinear` from `LFO_BANK_LANE_SCHEMAS[lane].rate` (`audioRigConfig.ts:215`, 0–20 Hz step 0.05).
- **The four lanes are app-lifetime.** `primeLfoBank` builds them once; `setBankRate` before priming just records the value (`bankSettings`), so a rate push is always safe — no "does a node exist" guard is needed anywhere in this phase.
- **Delay Time reaches the engine from one function**, `globalFx.setGlobalDelay` (no-op until the node exists), called through `audioStore`'s module-scope `GLOBAL_SETTER.delay` (`audioStore.ts:50`, fed the raw `partial` from `setGlobalAudio`) and `applyGlobalAudioToEngine(globalAudio)` (`audioStore.ts:64`; callers: `regenerateGlobalAudioFromSeed`, `AudioEngine.start()`, `sessionDiff.applySessionPayload`). The node is built with `maxDelay: 10`; the slider is 0–10 s step 0.001; the loading range is 0.05–0.5 s. Audio Swells write `delay.wet` only, via `setGlobalAudio('delay', { wet })`. The Delay panel renders through `AudioRigEffectPanel`'s generic `paramRow` loop (`AudioRigDrawer.tsx:279`), which casts the effect to `Record<string, number>`.
- **BPM is locale-seeded today.** `generateLocaleBpm(localeId, x, y)` (`src/utils/localeBpmSeed.ts`, locale noise map, `[40, 100]` integer) → `audioStore.regenerateBpmFromSeed(localeId, coords)` → `setBPM`. Called from `worldTransition.ts`'s `retransmitCoordsOnly` (:167) and `retransmitBoth` (:279), and once at `audioStore` module load (`syncBpmToCurrentLocale`, :466). Attenuation-Style-only retransmits deliberately leave it alone (`docs/AUDIO_SYSTEM.md` "BPM / Tempo"). Sessions and share links always carry `bpm` and apply it after the world rebuild (`sessionDiff.ts:469`).
- **`SliderLinearSchema` has no `formatValue`**; `SliderLogSchema` has `formatValue` and `steps` (Automation Rate uses both). `CONTROL_SCHEMA_TYPES` is pinned at 14 by `controls.test.ts`. `Toggle` accepts facade `children` (Click Track uses a text facade, `PingControlsDrawer.tsx:116`).

ASSUMPTIONS I'm making beyond the intent's decisions (correct now or I'll proceed with these):

1. **Data shape is an optional `sync` field, absent = Free**, on `BankLfoSettings` and `DelaySettings`. The Free number (`rate` / `delayTime`) stays stored underneath and is ignored while `sync` is present. Zero migration: every existing session, share link and default loads Free. **Nothing outside the resolvers (§1.3) and the Free-mode slider may read `rate` or `delayTime` for audio or on/off decisions.**
2. **4/4 for all note math** (`beatClock.ts`'s `BEATS_PER_MEASURE = 4`; the time signature is never changed). One bar = 4 beats.
3. **Allowed set at a tempo** = every note value whose derived value lies inside the control's full UI range: lanes `[LFO_RATE_MIN, LFO_RATE_MAX]` Hz (0–20), Delay `[0, 10]` s. The seeder's band restriction (§1.7) is a further filter on top, seed-only.
4. **Sync mode reuses `SliderLinear`** with value = index into the allowed list, via a new optional `formatValue` on `SliderLinearSchema` (mirrors `SliderLogSchema`'s). No 15th schema type.
5. **Mode changes and note-value conversion live in the store**, not the component: the store owns `bpm` and both settings objects, and both consumers (lane panel, Delay panel) already write straight to it. The new `TempoSyncSlider` composition stays store-free and tempo-free.
6. **Removing `sync` is never a spread.** `setLfoBank`/`setGlobalAudio` merge partials, so a partial cannot delete a key. Sync → Free goes through dedicated whole-object replacements (§1.5); the session-restore path switches from per-lane `setLfoBank` merge to the same replacement (otherwise a Free lane in a loaded session would keep the live lane's stale `sync` — a real bug the spread would introduce).
7. **Sync → Free never freezes a running lane.** The equivalent Hz is quantised to the slider's 0.05 step with a floor of one step (0.05), so a slow note at a slow tempo (4 bars at 20 BPM ≈ 0.021 Hz) can't round to 0 and stop the lane.
8. **Drift keeps applying to synced lanes**, behind one constant in `utils/tempoSync.ts` (`RATE_DRIFT_APPLIES_TO_SYNCED = true`). When `false`, the resolver hands the engine `rateDrift: 0` for a synced lane. The engine never learns about sync.
9. **Untrusted `sync` values are dropped, not trusted.** `isNoteValue` guards the resolvers (an unrecognised `sync` resolves as Free) and `applySessionPayload` strips an invalid `sync` from lanes and Delay before it reaches state — the same boundary-backfill shape the LFO Bank code review established (`backfillLfoBank`).
10. **Seed odds are thresholds on one seeded draw** (`t < odds` ⇒ Sync), the codebase's existing convention (`DELAY_QUIET_THRESHOLD`, `LFO_QUIET_THRESHOLD`). `getSeededVal` samples simplex noise, which is not uniform, so a measured-share test (§5) checks the real odds; if one lands outside tolerance, the plan calibrates that threshold constant, never the target.
11. **The toggle's facade text is the current mode's lore word** — "Float" at rest, "Anchored" popped — with the human pair (Free / Sync) as its accessible name. Click Track's facade uses its human word; this one uses lore because Float/Anchored are the confirmed names for the two states.

---

## 1. Overview & Claude Explanation

Five toggles: one on each LFO Bank lane's Rate and one on Delay Time. Free is today's behaviour, a Hz or seconds number that ignores tempo. Sync replaces the number with a note value (a division from 1/32 to 4 bars plus a straight/dotted/triplet modifier) stored as exactly that pair. Pure resolvers turn the pair into Hz or seconds from `audioStore.bpm`; the engine keeps receiving plain floats. A tempo change pushes fresh floats for every synced value and leaves Free ones alone. The slider is the same slider in both modes: in Sync its stops are the note values allowed at this tempo and its readout shows the note name. BPM itself moves from locale seeding to Attenuation Style seeding, so the seed tempo for every Sync draw is a pure function of the Attenuation Style. On load, lane a is synced 75% of the time, b 66%, c 33%, d 25%, Delay 66%; a synced lane draws a note from its own rate band at the seed tempo.

### 1.1 Data shape

```ts
// src/data/noteValues.ts
export type NoteDivision = '1/32' | '1/16' | '1/8' | '1/4' | '1/2' | '1' | '2' | '4'; // '1'..'4' are bars
export type NoteModifier = 'straight' | 'dotted' | 'triplet';
export interface NoteValue { division: NoteDivision; modifier: NoteModifier }

// src/types/lfo.ts
export interface BankLfoSettings {
  shape: LfoShape;
  /** Hz, LFO_RATE_MIN..LFO_RATE_MAX. The Free value — read it through resolveLaneRateHz(), never directly. */
  rate: number;
  rateDrift: number;
  depthDrift: number;
  /** Present = Sync (Anchored). Absent = Free (Float). */
  sync?: NoteValue;
}

// src/types/globalAudio.ts
export interface DelaySettings {
  /** seconds, 0..10. The Free value — read it through resolveDelayTimeSeconds(), never directly. */
  delayTime: number;
  feedback: number;
  wet: number;
  /** Present = Sync (Anchored). Absent = Free (Float). */
  sync?: NoteValue;
}
export const DELAY_TIME_RANGE_SECONDS = { min: 0, max: 10 } as const; // globalFx.ts's maxDelay: 10 points here
```

`DEFAULT_BANK_LFO` and `DEFAULT_GLOBAL_AUDIO_SETTINGS` carry no `sync` (Free), unchanged. Both stay plain JSON.

### 1.2 The note-value table and the conversion

`src/data/noteValues.ts` — pure data and math; no Tone, store or content import.

| division | beats (4/4) | modifiers |
|---|---|---|
| `1/32` | 0.125 | straight, dotted, triplet |
| `1/16` | 0.25 | straight, dotted, triplet |
| `1/8` | 0.5 | straight, dotted, triplet |
| `1/4` | 1 | straight, dotted, triplet |
| `1/2` | 2 | straight, dotted, triplet |
| `1` (1 bar) | 4 | straight, dotted, triplet |
| `2` (2 bars) | 8 | straight only |
| `4` (4 bars) | 16 | straight only |

Modifier factor: straight ×1, dotted ×1.5, triplet ×2⁄3. `NOTE_VALUES` is these 20 entries **sorted ascending by beats** (1/4 triplet 0.667 before 1/8 dotted 0.75), built once at module load.

```ts
export function noteValueBeats(nv: NoteValue): number;
export function noteValueSeconds(nv: NoteValue, bpm: number): number;  // beats * 60 / bpm
export function noteValueHz(nv: NoteValue, bpm: number): number;       // 1 / seconds
export function noteValueEquals(a: NoteValue, b: NoteValue): boolean;
export function isNoteValue(x: unknown): x is NoteValue;               // a real NOTE_VALUES member, nothing else
/** Entries whose derived value lies inside [min, max] at `bpm`, in NOTE_VALUES order. */
export function allowedNoteValues(bpm: number, range: { min: number; max: number }, unit: 'seconds' | 'hz'): NoteValue[];
/** The allowed entry closest (in `unit`) to `value`; the first/last entry for out-of-range input. */
export function nearestNoteValue(value: number, bpm: number, allowed: readonly NoteValue[], unit: 'seconds' | 'hz'): NoteValue;
```

Fixtures at 60 BPM: 1/4 = 1 s = 1 Hz; 1/8 dotted = 0.75 s; 1/4 triplet = 0.6667 s; 1 bar = 4 s = 0.25 Hz; 4 bars = 16 s = 0.0625 Hz; 1/32 = 0.125 s = 8 Hz.

Lane lists run slowest → fastest in **Hz** (the Free slider's direction); Delay's list runs shortest → longest in **seconds**. Both come from `allowedNoteValues`, the lane list reversed (NOTE_VALUES is ascending by beats, i.e. descending in Hz).

### 1.3 Resolvers — the only readers of `rate` / `delayTime`

`src/utils/tempoSync.ts` (pure; no Tone, no store):

```ts
export const RATE_DRIFT_APPLIES_TO_SYNCED = true;

/** Hz the lane should run at. Free (or an invalid sync): rate. Sync: noteValueHz, clamped into [LFO_RATE_MIN, LFO_RATE_MAX]. */
export function resolveLaneRateHz(lane: BankLfoSettings, bpm: number): number;
/** True when the lane is moving — replaces readBankRunning's `rate > 0`. A synced lane is always running. */
export function isLaneRunning(lane: BankLfoSettings): boolean;
/** The engine-facing copy: rate resolved, sync stripped, rateDrift zeroed for a synced lane iff the constant is false. */
export function resolveLaneForEngine(lane: BankLfoSettings, bpm: number, driftApplies?: boolean): BankLfoSettings; // 3rd arg defaults to the constant; exists so the off branch is testable
export function resolveLfoBankForEngine(bank: Record<LfoLaneId, BankLfoSettings>, bpm: number): Record<LfoLaneId, BankLfoSettings>;

/** Seconds the delay node should use: Free → delayTime; Sync → noteValueSeconds clamped into DELAY_TIME_RANGE_SECONDS. */
export function resolveDelayTimeSeconds(delay: DelaySettings, bpm: number): number;

/** The two allowed lists the UI and the conversions share. */
export function allowedLaneNoteValues(bpm: number): NoteValue[];   // slow → fast
export function allowedDelayNoteValues(bpm: number): NoteValue[];  // short → long

/** Mode conversions (§1.5) — return whole new objects; Free results carry no `sync` key at all. */
export function laneToSync(lane: BankLfoSettings, bpm: number): BankLfoSettings;
export function laneToFree(lane: BankLfoSettings, bpm: number): BankLfoSettings;
export function delayToSync(delay: DelaySettings, bpm: number): DelaySettings;
export function delayToFree(delay: DelaySettings, bpm: number): DelaySettings;
```

Migration of every surveyed site (this list is the plan's checklist):

| site | today | after |
|---|---|---|
| `audioStore.setLfoBank` | `if (partial.rate !== undefined) setBankRate(lane, partial.rate)` | `if ('rate' in partial \|\| 'sync' in partial) setBankRate(lane, resolveLaneRateHz(next, bpm))`; `rateDrift` pushed through `resolveLaneForEngine` |
| `AudioEngine.start()` | `primeLfoBank(lfoBank)` | `primeLfoBank(resolveLfoBankForEngine(lfoBank, bpm))` |
| `audioDiagnostics.readBankRunning` | `lane.rate > 0` | `isLaneRunning(lane)` |
| `audioStore` delay setter | `GLOBAL_SETTER.delay = AudioEngine.setGlobalDelay` (raw partial) | partial with `delayTime` or `sync` → push `{ delayTime: resolveDelayTimeSeconds(merged, bpm) }` plus the partial's other keys; partial without either (a swell's `{ wet }`) → forwarded as today |
| `applyGlobalAudioToEngine(globalAudio)` | pushes `globalAudio.delay` raw | gains a `bpm` parameter; pushes `{ ...delay, delayTime: resolveDelayTimeSeconds(delay, bpm) }` with `sync` stripped. All three callers pass `bpm` |
| `LfoBankLanePanel` | `rate` → `SliderLinear` | §1.4 |
| `AudioRigEffectPanel` delay block | generic `paramRow` | §1.4 |

The delay setter wrapper reads the store lazily at call time (it runs only from inside `setGlobalAudio`), so `GLOBAL_SETTER` still builds at module scope without touching `useAudioStore` during import — the import-order hazard `AudioEngine.start()`'s dynamic-import comment documents.

### 1.4 UI — the toggle and the stepped slider

**`SliderLinearSchema.formatValue?: (value: number) => string`**, same meaning as `SliderLogSchema.formatValue`: when present it replaces the `formatDisplayValue(displayValue) + unit` readout. `SliderLinear.tsx`'s `valueLabel` is the only change. `useEasedControlValue` eases between integers, so every `formatValue` this phase writes rounds its argument first.

**New composition `src/components/ui/controls/TempoSyncSlider.tsx`** (+ `.css`, + test) — a composition like `LfoLink`, not a 15th primitive; store-free and tempo-free:

```ts
interface TempoSyncSliderProps {
  /** The Free-mode schema as today (id/labels/min/max/step/unit). Sync mode derives its own from it. */
  schema: SliderLinearSchema;
  freeValue: number;
  /** undefined = Free. */
  syncValue: NoteValue | undefined;
  /** The allowed list at the current tempo, in slider order (caller supplies allowedLaneNoteValues / allowedDelayNoteValues). */
  allowed: readonly NoteValue[];
  onFreeChange: (value: number) => void;
  onSyncChange: (value: NoteValue) => void;
  /** Toggle flipped — the caller's store action performs the §1.5 conversion. */
  onModeChange: (sync: boolean) => void;
  disabled?: boolean;
  swelling?: boolean;
}
```

Rendering: a flex row (`.sc-tempo-sync`) holding one `SliderLinear` (flex 1) and one `Toggle`. Free: the given schema and `freeValue`, unchanged. Sync: `{ ...schema, id: `${schema.id}.sync`, min: 0, max: allowed.length - 1, step: 1, unit: undefined, formatValue: (i) => formatNoteValue(allowed[Math.round(i)]) }` (memoised on `[schema, allowed]`), value = index of `syncValue` in `allowed`, or — when a tempo change has pushed it out — the clamped index (last entry if it is now too long/slow, first if too short/fast). Display-only: nothing is written on render, and moving the tempo back restores the stored note. Toggle: `schema = { id: `${schema.id}.mode`, type: 'toggle', ...labels('ui.tempoSync') }`, `value = syncValue !== undefined`, facade children = the current mode's lore word from `options('ui.tempoSync')` (assumption 11). Memoised like every other primitive.

**`LfoBankLanePanel`** subscribes to `s.lfoBank[lane].sync` and `s.bpm`, memoises `allowedLaneNoteValues(bpm)`, and replaces its Rate `SliderLinear` with `TempoSyncSlider`: `onFreeChange` → `setLfoBank(lane, { rate })`, `onSyncChange` → `setLfoBank(lane, { sync })`, `onModeChange` → `setLfoBankLaneSyncMode(lane, on)`. Shape and both drift rows are untouched.

**Delay** gets a hand-composed branch in `AudioRigEffectPanel` beside the `compressor` one: `delayTime` through `TempoSyncSlider` (`allowedDelayNoteValues(bpm)`), `feedback`/`wet` through `paramRow` as today. It subscribes to `s.globalAudio.delay.sync` and `s.bpm` with their own selectors (only when `effectKey === 'delay'`, the same unconditional-hook/conditional-selector shape `compressorBeforeDelay` already uses) rather than widening the `Record<string, number>` cast. `onFreeChange` → the existing `fieldOnChange.delayTime`; `onSyncChange` → `setGlobalAudio('delay', { sync })`; `onModeChange` → `setDelaySyncMode(on)`.

**`formatNoteValue(nv)`** in `src/utils/formatNoteValue.ts` (content-backed, so not in `data/noteValues.ts`): `"1/8"`, `"1/8 dotted"`, `"1/4 triplet"`, `"1 bar"`, `"1 bar dotted"`, `"2 bars"`, `"4 bars"` — every word from content (§1.9); the digits and slash are data.

### 1.5 Mode transitions

Store actions, each one whole-object replacement plus one engine push:

- **`setLfoBankLaneSyncMode(lane, synced)`** — Free → Sync: `laneToSync` sets `sync = nearestNoteValue(rate, bpm, allowedLaneNoteValues(bpm), 'hz')`; `rate` kept as it was. A lane at 0 Hz snaps to the slowest allowed note. Sync → Free: `laneToFree` sets `rate = max(0.05, quantizeToStep(resolveLaneRateHz(lane, bpm), LFO_RATE_MIN, 0.05))` (assumption 7) and **deletes** `sync`. Both then `replaceLfoBankLane(lane, next)`.
- **`replaceLfoBankLane(lane, settings)`** — writes the lane whole (no merge) and pushes shape, resolved rate, drifts to `lfoEngine`. Also used by `sessionDiff.applySessionPayload`'s running-context branch in place of the per-lane `setLfoBank` merge (assumption 6).
- **`setDelaySyncMode(synced)`** — Free → Sync: `delayToSync` sets `sync = nearestNoteValue(delayTime, bpm, allowedDelayNoteValues(bpm), 'seconds')`. Sync → Free: `delayToFree` sets `delayTime = quantizeToStep(resolveDelayTimeSeconds(delay, bpm), 0, 0.001)` and deletes `sync`. Writes `globalAudio.delay` whole; pushes the resolved `delayTime`.

Sync → Free keeps what the user hears; Free → Sync moves to the nearest grid note.

### 1.6 Tempo change — the re-apply

`audioStore.setBPM` becomes `set({ bpm }); AudioEngine.setBPM(bpm); reapplyTempoSyncedValues(get());`. `reapplyTempoSyncedValues` (module function in `audioStore.ts`):

1. For each lane whose `sync` is present: `lfoEngine.setBankRate(lane, resolveLaneRateHz(lane, bpm))`.
2. If `globalAudio.delay.sync` is present: `AudioEngine.setGlobalDelay({ delayTime: resolveDelayTimeSeconds(delay, bpm) })`.

Both calls are safe before audio starts (lanes record the value; the delay setter no-ops without a node), so no initialised-check is needed. Free values are never touched. The Tempo slider fires `setBPM` continuously during a drag; each tick is at most five cheap `.value` writes. Synchronous — no timers.

### 1.7 BPM moves to the Attenuation Style; seeding

**BPM.** `src/utils/localeBpmSeed.ts` is replaced by `src/utils/bpmSeed.ts`: `BPM_SEED_RANGE = { min: 40, max: 100 }` and `generateAttenuationStyleBpm(attenuationStyleId, attenuationStyleName)` — `getSeededVal(getAttenuationStyleNoiseMap(id, name), 'globalAudio.bpm', 0, 40, 100)`, rounded to an integer. (The data key is `'globalAudio.bpm'`, not the bare `'bpm'` this spec first named: the bare key measured 9 distinct tempos over 300 styles, `'globalAudio.bpm'` 36 — the offset-0 artifact of risk 2. Task 4 "As built" has the numbers.) `regenerateBpmFromSeed(attenuationStyleId, attenuationStyleName)` takes the Attenuation Style instead of the locale. `syncGlobalAudioToCurrentAttenuationStyle` reseeds BPM **first** (so the globalAudio push that follows resolves at the new tempo), then globalAudio, lfoBank and globalLfoLinks as today. `syncBpmToCurrentLocale` and both `worldTransition.ts` reseed calls are deleted. Net effect: BPM reseeds on every Attenuation Style change (AS-only and both-changed retransmits, via the existing subscription) and never on a coordinates-only retransmit. A hand-dragged tempo is reset by an Attenuation Style switch (as Audio Rig edits already are) and kept across a coordinate move. Session/share loads are unaffected: `payload.bpm` is applied after the rebuild and still wins.

**Sync draws.** One pure helper in `utils/tempoSync.ts`:

```ts
/** Uniform pick over the first non-empty candidate band at `bpm`, or undefined if every band is empty. */
export function pickSeedNoteValue(t: number, bpm: number, bands: readonly { min: number; max: number }[], unit: 'seconds' | 'hz'): NoteValue | undefined;
```

`seedBpm` is always `generateAttenuationStyleBpm(id, name)` — pure, computed inside each seeder, nothing threaded.

| seeder | new `getSeededVal` keys | Sync odds (`t < odds`) | candidate bands, in order | on Sync |
|---|---|---|---|---|
| `generateLfoBankSettings` | `lfoBank.${lane}.syncMode`, `lfoBank.${lane}.syncNote` | `LFO_BANK_SYNC_ODDS` a 0.75, b 0.66, c 0.33, d 0.25 | own lane's `LFO_BANK_RATE_BANDS` entry, then next faster lane's, then next slower, widening outward the same way | `sync = pick`; `rate` still sampled exactly as today (the kept Free value) |
| `generateGlobalAudioSettings` — Delay | `globalAudio.delay.syncMode`, `globalAudio.delay.syncNote` | `DELAY_SYNC_ODDS` 0.66 | `GLOBAL_AUDIO_LOADING_RANGES['delay.delayTime']` (0.05–0.5 s) only | `delay.sync = pick`; `delayTime` still sampled as today |

If `pickSeedNoteValue` returns `undefined`, the target stays Free. At today's 40–100 seed range every lane band and the Delay band is non-empty at every integer BPM (a test proves it), so the fallback is insurance against a future retune. Existing keys and their order are untouched: with the coin landing Free, a world's seeded values are byte-identical to today's.

### 1.8 Persistence and sharing

- **Sessions (`SessionPayload`, version stays 2):** `lfoBank` is captured whole by spreading each lane, so `sync` rides along; `globalAudio` is captured whole and the delay normalisation spreads `...toCapture.delay`, so `delay.sync` survives. Absent anywhere → Free. No migration.
- **Restore boundary (`sessionDiff.applySessionPayload`):** `sanitizeLaneSync`/`sanitizeDelaySync` drop any `sync` that fails `isNoteValue`, next to the existing `backfillLfoBank` (assumption 9). Lanes restore through `replaceLfoBankLane` (running context) or the existing whole `setState` (not running).
- **Share links (`sessionShareUtils.ts`):** `CompactBankLfoSettings.y?: string`, a compact code — division token (`32`, `16`, `8`, `4`, `2`, `1b`, `2b`, `4b`) + modifier suffix (none / `d` / `t`). Absent or unparseable `y` → no `sync` key. Delay travels inside `g` whole and needs no codec change (the restore-boundary sanitiser covers a malformed one).

### 1.9 Content

New entries in `src/content/copy/ui.ts` (wording confirmed 2026-10-02):

```ts
'ui.tempoSync': {
  human: 'Tempo Sync', lore: 'Anchoring',
  options: { free: { human: 'Free', lore: 'Float' }, sync: { human: 'Sync', lore: 'Anchored' } },
},
'ui.noteValue.fraction': { human: 'Fraction', template: '1/{n}' },
'ui.noteValue.bar':      { human: '1 bar' },
'ui.noteValue.bars':     { human: 'Bars', template: '{n} bars' },
'ui.noteValue.modifier': { human: 'Modifier', options: { dotted: { human: 'dotted' }, triplet: { human: 'triplet' } } },
'ui.noteValue.modified': { human: 'Modified note', template: '{note} {modifier}' },
```

Straight has no suffix by rule. Every key is referenced from `formatNoteValue.ts` or `TempoSyncSlider.tsx`, keeping `content.test.ts` and the ESLint literal guard green with no exemptions. `ContentEntry` (`src/content/types.ts`) already carries `human`, optional `lore`, `template` and `options`, so no type change is needed.

---

## 2. Target File Structure

```text
src/
├── data/
│   ├── noteValues.ts / .test.ts            NEW  — table, math, isNoteValue, allowed/nearest
│   └── audioRigConfig.ts                   lane Rate step + Delay Time min/max/step read the shared LFO_RATE_STEP / DELAY_TIME_* constants (Task 2); comment (BPM_SCHEMA's LOCALE_BPM_SEED_RANGE mention) in Task 4
├── types/
│   ├── lfo.ts                              + BankLfoSettings.sync
│   ├── globalAudio.ts                      + DelaySettings.sync, DELAY_TIME_RANGE_SECONDS
│   └── controls.ts                         + SliderLinearSchema.formatValue
├── utils/
│   ├── tempoSync.ts / .test.ts             NEW  — resolvers, allowed lists, conversions, pickSeedNoteValue, RATE_DRIFT_APPLIES_TO_SYNCED
│   ├── formatNoteValue.ts / .test.ts       NEW
│   ├── bpmSeed.ts / .test.ts               NEW  — replaces localeBpmSeed.ts / .test.ts (deleted)
│   ├── localeTemperature.ts                comment only (cites generateLocaleBpm)
│   ├── globalAudioSeed.ts / .test.ts       + lane and Delay Sync rolls; seed oracle
│   ├── sessionShareUtils.ts / .test.ts     + `y` codec
│   └── sessionDiff.ts / .test.ts           sanitisers; lanes restore via replaceLfoBankLane; applyGlobalAudioToEngine bpm arg
├── stores/
│   └── audioStore.ts / .test.ts            BPM on the AS-sync; setBPM re-apply; setLfoBank/delay resolve; replaceLfoBankLane; setLfoBankLaneSyncMode; setDelaySyncMode
├── systems/
│   └── worldTransition.ts / .test.ts       both regenerateBpmFromSeed calls removed
├── engine/
│   ├── AudioEngine.ts                      primeLfoBank(resolveLfoBankForEngine(...)); applyGlobalAudioToEngine bpm arg
│   ├── audioEngine/globalFx.ts             comment only (maxDelay ↔ DELAY_TIME_RANGE_SECONDS)
│   └── audioDiagnostics.ts                 isLaneRunning
├── components/
│   ├── ui/controls/TempoSyncSlider.tsx / .css / .test.tsx   NEW composition
│   ├── ui/controls/SliderLinear.tsx / .test.tsx             formatValue readout
│   └── panels/screen/console/
│       ├── LfoBankLanePanel.tsx / .test.tsx                 Rate → TempoSyncSlider
│       └── AudioRigDrawer.tsx, AudioRigEffectPanel.test.tsx  delay hand-composed branch
└── content/copy/ui.ts                      §1.9
docs/
├── AUDIO_SYSTEM.md                         BPM / Tempo rewritten (AS-seeded); LFO Bank section: Sync on lanes, resolvers, drift switch
├── PROCEDURAL_GENERATION.md                BPM moves from the locale-seeded list to the AS-seeded list
├── DUPLICATE_VALUE_AUDIT.md                item 1's description of where bpm seeds from
├── reference/GLOBAL_CHAIN_GRID.md          delay row: full range corrected from the stale "seconds, 0–1" to 0–10 (maxDelay 10); Sync note
├── reference/SLIDER_VALUES.md              lane Rate + Delay Time rows: Sync mode and seed odds
├── COMPONENT_LIBRARY.md                    TempoSyncSlider composition; SliderLinear formatValue
├── SESSION_STORAGE.md                      optional sync fields, absent = Free, sanitised on restore
├── todo/roadmap.md                         Phase 33 entry
└── specs/archive/BPM_CONTROL.md            dated superseded-note atop §1.3 (not a rewrite)
```

Not touched: `lfoEngine.ts` (its rate contract stays Hz-only; it gains nothing), `beatClock.ts`, `Tone.LFO.sync`, robot/company/link code, every existing label, Reverb/Compressor/probe envelope times.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files in §2. Anything else is a conflict to surface.
- **Engine stays Hz/seconds-only.** `lfoEngine.ts` and `globalFx.ts` never import `noteValues.ts` or read `sync`. Tone time strings and `Tone.LFO.sync()` are not used.
- **No direct `rate`/`delayTime` reads** outside `tempoSync.ts`, the Free-mode slider wiring, the seeders and the serialisers. Checkpoint E greps for it.
- **JSON-serialisable state.** `sync` is a plain object; Sync → Free deletes the key, never sets `undefined`.
- **No timers for anything musical.** The re-apply is synchronous inside `setBPM`.
- **Primitives:** `SliderLinear` gains one optional schema field and one ternary; `Toggle` is used as-is via `children`; `CONTROL_SCHEMA_TYPES` stays 14.
- **Content:** every new word in `src/content/copy/ui.ts`; no guard exemptions.
- **Seed determinism:** new `getSeededVal` keys only; existing keys and draw order unchanged. BPM's new key reads the Attenuation Style map.
- **Backward compatibility is structural:** no payload version bump, no migration function.
- **Ask first:** any change to `lfoEngine.ts`, any new dependency, any change to the Tempo slider's 20–200 range or the 40–100 seed band.
- **Never:** `.env*`, `node_modules/`, build output; relaxing a CLAUDE.md guardrail.

---

## 4. Code Style & Architecture Conventions

The resolver — the one sanctioned reader of a lane's `rate` for audio:

```ts
// src/utils/tempoSync.ts
import { LFO_RATE_MIN, LFO_RATE_MAX, type BankLfoSettings } from '@/types/lfo';
import { isNoteValue, noteValueHz } from '@/data/noteValues';
// clamp is a local Math.min/Math.max helper, not engine/lfoShared's — that file imports Tone.

/** Hz the lane should run at — Free (or an unrecognised sync): the stored rate; Sync: derived from the
 *  note at `bpm`, clamped into the lane's full range so a tempo change past the cap clamps, never stops. */
export function resolveLaneRateHz(lane: BankLfoSettings, bpm: number): number {
  if (!isNoteValue(lane.sync)) return lane.rate;
  return clamp(noteValueHz(lane.sync, bpm), LFO_RATE_MIN, LFO_RATE_MAX);
}
```

A store action after migration — read state once, resolve, push:

```ts
// src/stores/audioStore.ts
setLfoBankLaneSyncMode: (lane, synced) => {
  const { lfoBank, bpm } = get();
  const next = synced ? laneToSync(lfoBank[lane], bpm) : laneToFree(lfoBank[lane], bpm);
  get().replaceLfoBankLane(lane, next);
},
```

Conventions: named exports, `memo`-wrapped function components, co-located CSS and tests, section-banner comments (`// ===== IMPORTS =====`) as in `globalAudioSeed.ts`, doc comments that say *why* and cite this spec's section. New seed keys are dot-namespaced like their neighbours.

---

## 5. Testing & Verification Requirements

Vitest + Testing Library, co-located. House rhythm: RED first, one commit per task, mutation-check at the named gates.

- **`noteValues.test.ts`** — 20 entries, no duplicates, strictly ascending beats; 2/4 bars straight-only; the §1.2 fixtures; `allowedNoteValues(60, {0,10}, 'seconds')` includes 2 bars, excludes 4 bars; `allowedNoteValues(200, {0,20}, 'hz')` excludes 1/32 triplet; `nearestNoteValue(0.3, 60, …, 'seconds')` is 1/8 triplet (0.333 s); out-of-range input returns first/last; `isNoteValue` rejects `{division:'1/3',…}`, `'off'`, `null`, a string.
- **`tempoSync.test.ts`** — Free passes `rate`/`delayTime` through (incl. 0 and 20); an invalid `sync` resolves as Free; 1/4 at 60 → 1 Hz, at 120 → 2 Hz; 1/32 triplet at 200 clamps to 20; 2 bars at 20 BPM (24 s) clamps to 10; `isLaneRunning` truth table (Free 0 false, Free >0 true, Sync true even with `rate: 0`); `resolveLaneForEngine` strips `sync` and leaves drifts alone while the constant is `true`; `laneToSync` of 0 Hz → slowest allowed note; of 1.5 Hz at 60 → 1/4 triplet with `rate` kept; `laneToFree` of 1/8 dotted at 60 → `rate: 1.35` and `'sync' in result === false`; `laneToFree` of 4 bars at 20 BPM → `rate: 0.05` (never 0); delay pair likewise (0.3 s at 60 → 1/8 triplet; back → 0.333, no `sync` key); `pickSeedNoteValue` falls through an empty first band to the second, returns `undefined` when all are empty, and every result lies in the band it came from.
- **BPM (`bpmSeed.test.ts`, `audioStore.test.ts`, `worldTransition.test.ts`)** — integer in [40, 100] over 30 Attenuation Style names; deterministic incl. across an evicted noise map; at least 10 distinct values over 30 names (guards the known offset-0 sampling artifact); source-scan guard flipped (uses `getAttenuationStyleNoiseMap`, not `getLocaleNoiseMap`, no `Math.random`). An Attenuation Style change reseeds `bpm` before `globalAudio`; a coordinates-only retransmit leaves a hand-set `bpm` untouched; a both-changed retransmit reseeds it; `applySessionPayload` with `payload.bpm` still ends on the payload's value.
- **Store → engine** — `setLfoBank(lane, { sync: 1/4 })` at bpm 120 calls `setBankRate(lane, 2)`; `setLfoBank(lane, { shape })` calls no rate push; `setLfoBankLaneSyncMode` round trip leaves no `sync` key; `replaceLfoBankLane` with a Free lane over a synced one leaves no `sync`; `setGlobalAudio('delay', { sync: 1/4 })` at 60 reaches `setGlobalDelay` with `delayTime: 1`; `setGlobalAudio('delay', { wet: 0.4 })` forwards `{ wet: 0.4 }` unchanged (swell path); `applyGlobalAudioToEngine` resolves a synced delay; `setBPM(90)` writes state, calls `AudioEngine.setBPM(90)`, then re-pushes every synced lane and a synced delay and nothing Free; `AudioEngine.start()` primes with resolved rates; `readBankRunning` counts a synced 0-rate lane as running. **Mutation check:** revert the session-restore branch to per-lane `setLfoBank` and watch the stale-`sync` test go red.
- **Seeding** — the seed oracle (current `generateLfoBankSettings` + `generateGlobalAudioSettings` output for two fixed Attenuation Style names, captured as inline objects **before** any seeder change) stays green with only `sync` keys added; determinism; every lane band and the Delay band non-empty for every integer BPM 40–100; every Sync draw lies inside its candidate band at the seed BPM; Delay never seeds outside 0.05–0.5 s; **measured odds over 200 names** within ±10 points of 75/66/33/25/66 % (assumption 10 — calibrate the constant, not the target, if one misses).
- **UI** — `SliderLinear`: `formatValue` replaces the readout and drops the unit; absent → unchanged. `TempoSyncSlider`: Free renders the given min/max/step/unit; Sync renders `max = allowed.length - 1`, `step = 1`, readout `"1/8 dotted"`, no unit; a `syncValue` missing from `allowed` displays the clamped index with no callback fired on render or re-render; toggle click → `onModeChange` only, facade reads Float/Anchored from `CONTENT`; arrow key in Sync → `onSyncChange` with a `NoteValue`, never `onFreeChange`. `LfoBankLanePanel`: renders the composition; toggle calls `setLfoBankLaneSyncMode`; Sync readout depends on mocked `bpm`. `AudioRigEffectPanel`: the delay block renders one `TempoSyncSlider` + two plain rows; other blocks unchanged; a swell tick on `delay.wet` still re-renders only as today.
- **Persistence** — every `NOTE_VALUES` entry round-trips through `y`; absent/garbage `y` decodes to no `sync` key; a mixed Free/Sync payload round-trips `toEqual`; `delay.sync` round-trips through `g`; a payload with an invalid lane or delay `sync` applies as Free; a v2 payload with no `sync` anywhere resolves to its stored numbers at any bpm.
- **Content** — `content.test.ts` green unchanged.
- **Lint/type/build** clean at every checkpoint.

**Manual (Crawford, final checkpoint):** an Anchored lane follows a Tempo drag while a Float lane holds; Delay at 1/4 at 60 BPM → Tempo to 20 → readout clamps and the delay stops lengthening at 10 s; Float ↔ Anchored round trip doesn't audibly jump; an Attenuation Style switch changes tempo, a coordinates move doesn't; a pre-branch session loads with every toggle on Float and its own tempo; keyboard reaches the toggle and steps note values; Pixel listen at Light.

---

## 6. Git & Workflow Context

- Branch `feature/sync-toggle`, off `main` at `07da4a73`. The older `feature/free-sync-toggle` branch (local + remote) holds only the superseded per-target docs, already on `main` via PR #519 — leave it alone unless Crawford asks.
- One commit per task, imperative subject, body cites the spec section, co-author trailer. Crawford merges.
- Roadmap: **Phase 33 — Free | Sync Toggle** in `docs/todo/roadmap.md` (32 is the last numbered entry). "Not Doing": probe envelope times (later follow-up), Reverb/Compressor times, drift amounts, Phrase Length, per-target or per-robot sync, an Off step, multi-bar dotted/triplet, the pre-existing Attenuation-Style-switch lane re-prime gap (roadmap 17.2.8's follow-up — §7 item 3).
- Docs land in the last task.

---

## 7. Open Questions & Risks

**For Crawford — none blocking.** All wording and odds are confirmed. Assumption 11 (lore word on the toggle facade, unlike Click Track's human word) is the one judgment call to veto at the UI checkpoint.

**Risks:**

1. **Every unsaved world gets a new tempo.** BPM's seed source changes, so the tempo for a given Attenuation Style + coordinates differs from today. Saved sessions and share links carry `bpm` and are unaffected. Intended; recorded in the roadmap entry.
2. **Simplex odds.** `getSeededVal` is not uniform; a `t < 0.75` threshold may not mean 75 %. The measured-odds test catches it; calibration is a constant change. The same artifact can collapse variety for a single key across names (LFO Bank memory, `lfoBank.*.shape` finding) — the BPM distinct-values test guards that for the new `bpm` key.
3. **Pre-existing: an Attenuation Style switch doesn't re-push `lfoBank` to the running engine** (`regenerateLfoBankFromSeed` is data-only; roadmap 17.2.8 follow-up). This phase doesn't fix or worsen it: BPM reseeds first, so the `setBPM` re-apply pushes the *old* lanes at the new tempo, matching what the engine is actually playing. Synced and Free lanes are equally stale until the gap is fixed.
4. **`setGlobalAudio('delay', …)` gains a branch.** Swells call it ~8–9×/s with `{ wet }`; the branch must stay a key check, never a resolve, on that path. Covered by the swell-path test.
5. **Session restore change (assumption 6)** touches the LFO Bank code review's fixed path; its existing tests stay green and gain the stale-`sync` case.
6. **Perf:** `allowedLaneNoteValues` / `allowedDelayNoteValues` are 20-entry filters memoised on `bpm`; the Tempo drag already re-renders these rows.
