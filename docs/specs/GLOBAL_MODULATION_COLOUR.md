# Phase Spec: Global Modulation Pedal — AutoWah and Phaser on the Global Chain

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (§5): `npm run perf`
> - Phone gate (§5): the `?debug` HUD on the Pixel, seed `alpha`, Standard and Full

Source of intent: [docs/intent/global-modulation-pedal.md](../intent/global-modulation-pedal.md) (confirmed
2026-10-15, six questions; two guesses overturned — "a few controls each" became every parameter, and "two
more Colour sub-tabs" became a tab of their own). Roadmap slot: **50.4**
([roadmap.md](../todo/roadmap.md#504-global-modulation-pedal-autowah-or-phaser)); its original text is
superseded wherever this spec differs (both pedals ship; neither moves to backlog 22). Branch:
`feature/palette-modulation`, off `main` (name is a proposal; Crawford creates it). 50.1–50.3 are merged
(`main` at `03cc6881`), so the chain already carries the send/return rooms and the three Colour nodes this
spec builds after.

Survey basis (2026-10-15, against `main` at `03cc6881`; every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:95`) constructs every node
  behind `getToneCtor` (`:103–111`), the three Colour nodes dry with `oversample: 'none'` (`:139–157`), then
  calls `wireGlobalFxChain(false)`. `wireGlobalFxChain` (`:233`) calls `disconnectAllFxNodes` (`:184`, a
  literal node list), builds the dry chain from one array `[EQ, LPF, HPF, Distortion, Chebyshev, BitCrusher,
  Compressor, Limiter]` (`:236–245`), joins the rooms' returns at the Compressor (Natural) or Limiter
  (Controlled) (`:277–282`), then `connectTapsIfWanted()`. The dry chain is identical in both Decay Modes.
  `wireGlobalFxChain` takes the mode as an argument and does not remember it; `audioStore.setCompressorBeforeDelay`
  (`audioStore.ts:417`) is its only caller after boot.
- **Colour's helpers, all reusable.** `COLOUR_RAMP_SECONDS = 0.05` (`globalFx.ts:57`); `colourWetGain(mix) =
  mix²` (`:65`); `clampColour(key, value)` clamps into `GLOBAL_AUDIO_SEED_RANGES[key]` and returns `undefined`
  for a non-finite value (`:72`), keyed by `GlobalAudioSeedFieldKey` so any new field key works unchanged;
  `rampOrSet` (`:80`). The three colour setters (`:537–574`) are the shape to copy.
- **How a global field flows.** `GlobalAudioSettings` + `DEFAULT_GLOBAL_AUDIO_SETTINGS` +
  `withGlobalAudioDefaults` (`src/types/globalAudio.ts:101/:121/:143`) → `GLOBAL_SETTER`
  (`src/stores/audioStore.ts:82`) and `applyGlobalAudioToEngine` (`:109`) → `AudioEngine.setGlobalX`
  re-exported from `globalFx.ts` (`AudioEngine.ts:46–48`, `:1335–1337`). `AudioRigEffectKey`
  (`src/data/audioRigConfig.ts:29`) names the ten blocks of `AUDIO_RIG_CONFIG`; `audioRigConfig.test.ts:406`
  pins 28 param ids.
- **The Free | Sync rail (roadmap 33).** `DelaySettings.sync?: NoteValue` (`globalAudio.ts:34`; present =
  Sync, absent = Free, never `sync: undefined`). `resolveDelayTimeSeconds`, `allowedDelayNoteValues`,
  `delayToSync` / `delayToFree` (`src/utils/tempoSync.ts:103/:123/:135+`), `nearestNoteValue`,
  `pickSeedNoteValue`. The store: `setGlobalDelayResolved` strips `sync` and resolves at `bpm` before the
  engine (`audioStore.ts:54–67`), `GLOBAL_SETTER.delay` points at it, `setDelaySyncMode` (`:410`) flips the
  mode, and `reapplyTempoSyncedValues` (`:130`) re-pushes every synced lane and the Delay on a tempo change.
  The drawer renders the Delay's time through `TempoSyncSlider` (`AudioRigDrawer.tsx:316–325`, props at
  `TempoSyncSlider.tsx` — `schema: SliderLinearSchema`, `freeValue`, `syncValue`, `allowed`, `onFreeChange`,
  `onSyncChange`, `onModeChange`, `swelling`) in a `block.key === 'delay'` branch (`:309`). Seeding draws
  `globalAudio.delay.syncMode` under `DELAY_SYNC_ODDS = 0.66` and `globalAudio.delay.syncNote`
  (`globalAudioSeed.ts:76/:144–154`).
- **Seeding.** `generateGlobalAudioSettings` (`globalAudioSeed.ts:141`) draws every field with
  `sampleField(noiseMap, key)`; draws are keyed by `dataId`, so adding a draw moves no existing value, and the
  oracles (`globalAudioSeed.test.ts`) are amended by hand, never re-recorded. Colour's one-character draw
  (`COLOUR_CHARACTERS`, `COLOUR_CHARACTER_BANDS = [0.3065, 0.5, 0.6935, 1]`, `pickColourCharacter`, `:85–117`)
  shows that the single draw is bell-curved and discrete, so a threshold's realised share is measured, not
  nominal. All seven colour keys are read on every style, lit or not (`:156–162`). `COLOUR_LOAD_MIX_MAX = 0.25`
  (`globalAudioLoadingRanges.ts:26`).
- **Tabs.** `FleetParamsGroup` = six ids (`uiStore.ts:21`); `SECTIONS` with a trait per group
  (`FleetParamsScreen.tsx:23–29`, `['colour', 'colour']` at `:28`), `SUB_TABBED` (`:98`), `subTabItems` renders
  `AudioRigEffectPanel` for any `AudioRigEffectKey` (`:85–93`); `FLEET_PARAMS_SUBSECTIONS` (`navActions.ts:74`,
  `colour:` at `:92`) and `FLEET_PARAMS_GROUP_CONTENT` (`:113`). `FleetParamsScreen.test.tsx:100` pins "the
  six groups in order, Colour between Time & Space and Output"; `:437` pins the phone shell's sixth tab.
  `AUDIO_RIG_EFFECT_TRAIT` (`AudioRigDrawer.tsx:56`). `Trait` has eight ids (`traits.ts:8`, test pins 8);
  `spectral` is EQ & Filters' trait.
- **Persistence.** `globalAudio` travels whole; `withGlobalAudioDefaults` is applied at `sessionDiff.ts:530`
  and `sessionShareUtils.ts:381`. `sessionDiff.ts` has a Delay sanitiser for a bad `sync` (the one that used
  to throw on an empty `globalAudio`, SESSION_STORAGE.md §Global Colour). `TRANSMISSION_PRESETS`
  (`transmissionPresets.ts:65/:182/:315`) carry full literals.
- **Load budget.** `effectsLoadToLimits` (`audioBudget.ts:78`) returns three booleans from `LOAD_*_MIN`
  (`constants/index.ts:44–54`); `tiersLine` (`hudLines.ts:62`) prints them.
- **Docs guard.** `src/docs/globalColourDocs.test.ts` is the pattern: a gem-folder source scan, a "never a
  modulation or swell target" check, a declared-symbol table, and a grid-row check that matches
  `| <effect> | \`<setter>()\` | <param>` lines after the HPF rows (`:144–157`).
- **Tone 15.1.22, read from `build/esm/effect/*.js`.** `AutoWah extends Effect` (mono): `baseFrequency`,
  `octaves`, `follower` and `sensitivity` are plain setters (`_setSweepRange` recomputes a `ScaleExp`'s
  min/max, capped at Nyquist; `follower` sets `Follower.smoothing`, a plain setter that retunes a lowpass;
  `sensitivity` sets an input `Gain` to `1 / dbToGain(dB)`, so lower dB = more sensitive); `Q` and `gain` are
  read-only *Signals* (the bandpass Q and the peaking gain in dB); `wet` is the Effect crossfade. Defaults
  `{ baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.2 }`. `Phaser extends
  StereoEffect`: two internal `LFO`s (left, right at phase 180°) started in the constructor — wall-clock —
  driving `stages` allpass biquads per side built once in the constructor by `_makeFilters`; **`stages` has no
  setter**; `frequency` is the left LFO's frequency Signal (read-only, the right follows it); `Q` a Signal
  shared by every biquad; `octaves` and `baseFrequency` plain setters that move the LFOs' min/max; `wet` the
  crossfade. Defaults `{ frequency: 0.5, octaves: 3, stages: 10, Q: 10, baseFrequency: 350 }`.
- **Copy.** `fleet.colour` (`src/content/copy/fleet.ts:220`) is the group-entry shape (human, lore, intro with
  lore line, lore description, HTML human description); `fleet.distortion` the heading shape; `fleet.delay.time`
  a parameter entry whose help already explains Free and Sync.

ASSUMPTIONS I'm making beyond the intent's decisions (correct now or I'll proceed with these):

1. **Field names.** `GlobalAudioSettings.autoWah: { baseFrequency, octaves, sensitivity, Q, gain, follower,
   wet }` and `phaser: { rate, octaves, baseFrequency, stages, Q, wet, sync? }`. `rate` rather than Tone's
   `frequency` so the Phaser's Free | Sync pair is `rate` + `sync`, the LFO Bank lane's names, and the
   conversions read the same. The grid's Param column records the Tone name beside each.
2. **Stages is a slider and the node is rebuilt.** Tone's `stages` is constructor-only (survey), so
   `setGlobalPhaser({ stages })` disposes the Phaser and constructs a new one with the stored parameters, then
   re-runs `wireGlobalFxChain` in the current Decay Mode (`globalFx.ts` remembers the last mode in a module
   variable; today nothing does). The slider is stepped (integer, assumption 5), so a drag fires a handful of
   rebuilds, each a dozen biquads: cheap. A rebuild can tick; the new node is constructed at the stored tapered
   `wet` so there is no fade, and the desktop listen (§5) decides whether that is acceptable. **Veto point:**
   if it clicks audibly, Stages becomes seeded-only (no slider) rather than a crossfaded double node.
3. **Signal order inside the slot: AutoWah → Phaser.** Wah first so its envelope follower reads the coloured
   signal's dynamics directly rather than a signal already smeared by notches; the phaser then sweeps the
   wah's output. A listening item in §7. Both between `_globalBitCrusher` and `_globalCompressor` in
   `chainNodes`, so both Decay Modes get them from the one array.
4. **The rooms stay dry and unswept.** Reverb and Delay rejoin after the slot, as for Colour. From the Phaser
   onward the dry chain is stereo (`StereoEffect`); the Compressor and Limiter are stereo-safe Web Audio
   nodes and the master gain is a plain `Gain`, so nothing downstream changes.
5. **Full ranges (UI = full; every slider horizontal).** AutoWah: `baseFrequency` 50–1000 Hz `sliderLog`;
   `octaves` 1–8 step 0.5; `sensitivity` −40–0 dB step 1; `Q` 0.5–10 `sliderLog`; `gain` 0–20 dB step 0.5;
   `follower` 0.01–1 s `sliderLog`; `wet` 0–1 step 0.01. Phaser: `rate` 0.05–10 Hz step 0.05 `sliderLinear`
   (the `TempoSyncSlider` takes a linear schema; 0 is excluded because a stopped phaser is a fixed notch, not
   "off" — Mix 0 is off); `octaves` 0.5–6 step 0.5; `baseFrequency` 50–2000 Hz `sliderLog`; `stages` 1–12
   step 1 (**the ceiling is the gate's**, §5); `Q` 0.5–20 `sliderLog`; `wet` 0–1 step 0.01.
6. **Loading bands when a pedal is lit (placeholders, tuned by ear at a checkpoint).** AutoWah:
   `baseFrequency` 80–400, `octaves` 3–6, `sensitivity` −24 to −6, `Q` 1–4, `gain` 0–6, `follower` 0.1–0.4,
   `wet` 0.10–`COLOUR_LOAD_MIX_MAX`. Phaser: `rate` 0.1–1, `octaves` 2–4, `baseFrequency` 200–800, `stages`
   4–8, `Q` 2–10, `wet` 0.10–`COLOUR_LOAD_MIX_MAX`. A **dark** pedal seeds `wet = 0` and every other field
   from the same band, so a hand nudge of Mix hears a seeded pedal, not a default one.
7. **Two independent lit draws at one third each.** `globalAudio.autoWah.lit` and `globalAudio.phaser.lit`,
   each lit when the draw is under its edge. The edges (`PEDAL_LIT_EDGE`, one per pedal) are **fitted by
   measurement** the way `COLOUR_CHARACTER_BANDS` were — the nominal 0.333 is the starting point — so the
   realised share over many styles is 33 ± 3 %. Independence falls out of two draw keys.
8. **A lit Phaser seeds Sync about half the time.** A third draw pair, `globalAudio.phaser.syncMode` under
   `PHASER_SYNC_ODDS` (nominal 0.5, measured) and `globalAudio.phaser.syncNote` through `pickSeedNoteValue`
   over `allowedPhaserNoteValues(bpm)` restricted to the lit `rate` band. A dark Phaser is seeded Free (no
   `sync` key), like a Free lane. **Veto point:** always Free, or the Delay's two-thirds.
9. **Mix taper and ceiling are Colour's, by the same function.** Both `wet`s pass through `colourWetGain`
   (squared) in the setters, and no seeded pedal Mix is above `COLOUR_LOAD_MIX_MAX`. The function and
   constant keep their names; a comment records that the pedals share them. "Correct for now" (Crawford):
   the bands and the ceiling may rise after the listen.
10. **Defaults (`DEFAULT_GLOBAL_AUDIO_SETTINGS`) and the three transmission presets: Tone's defaults with
    `wet` 0.** `autoWah { baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.2, wet: 0 }`,
    `phaser { rate: 0.5, octaves: 3, baseFrequency: 350, stages: 10, Q: 10, wet: 0 }`. Presets stay clean.
11. **Tab: `FleetParamsGroup` gains `'modulation'` between `'colour'` and `'output'`, trait `spectral`.**
    No new trait (Crawford). `SECTIONS` gains `['modulation', 'spectral']`; the "six groups" tests become
    seven. Sub-tabs in chain order: AutoWah, Phaser.
12. **Phaser Rate takes the Delay's rail, generalised, not the lane's.** New `resolvePhaserRateHz(phaser,
    bpm)`, `allowedPhaserNoteValues(bpm)` (slowest → fastest in Hz over assumption 5's range, like the lane
    list), `phaserToSync` / `phaserToFree` in `tempoSync.ts`, mirroring the Delay trio. Store:
    `setGlobalPhaserResolved` strips `sync` and resolves `rate` (the `setGlobalDelayResolved` shape),
    `GLOBAL_SETTER.phaser` points at it, `setPhaserSyncMode(synced)` flips the mode, and
    `reapplyTempoSyncedValues` re-pushes a synced Phaser on a tempo change. Drawer: a `block.key === 'phaser'`
    branch renders the `rate` row through `TempoSyncSlider`, every other row through `paramRow`.
13. **Old payloads load with defaults, by the existing helper, and a bad `sync` is dropped.**
    `withGlobalAudioDefaults` fills a missing `autoWah` / `phaser` block; the Delay's `sync` sanitiser in
    `sessionDiff.ts` gains the Phaser (an invalid note value is removed, never written as `undefined`).
    Payload `version` stays 2.
14. **Clamping.** Every setter clamps through `clampColour` (keyed by the new field keys; the function is
    renamed `clampSeedField` only if the plan finds the old name misleading — not required) and ignores a
    non-finite value; `stages` is rounded before the rebuild check.
15. **No Effects Limit threshold unless the A/B asks.** If it does: `LOAD_PEDAL_MIN` in `constants/index.ts`,
    a fourth boolean `pedalsEnabled` on `EffectsLoadLimits`, `globalFx.setPedalsEnabled(false)` holding the
    Phaser's `wet` at 0 first (stages are the cost) and the AutoWah's second if that is not enough. Stored
    settings are never touched by a tier.
16. **Lore words are placeholders.** Tab human "Modulation" / lore "Mesh Drift"; AutoWah → human "Auto Wah",
    lore "Pressure Sweep"; Phaser → human "Phaser", lore "Phase Lag"; each `wet` is "Mix"; `rate` is "Rate";
    `follower` is "Follow"; `sensitivity` is "Sensitivity"; `gain` is "Peak"; `stages` is "Stages". Headings
    in the grid's capitals style.
17. **The roadmap 50.4 paragraph gets a status line and an "As built" section in the docs task**, nothing
    else of the roadmap changes.

---

## 1. Overview & Claude Explanation

Two single-instance modulation pedals join the global dry chain after the Colour slot and before the
Compressor: `Tone.AutoWah`, an envelope follower sweeping a bandpass to the fleet's own dynamics, and
`Tone.Phaser`, a stack of allpass notches swept by its own wall-clock LFO. Every parameter of each is a
slider on a new **Modulation** section tab of Fleet Params, in the `spectral` trait, with the Phaser's Rate
carrying the Free | Sync toggle. A fresh world lights each pedal independently about a third of the time,
quietly; by hand either goes to full. Every parameter is a plain number (plus the Phaser's optional note
value) on `GlobalAudioSettings`, seeded through the loading-range rail, saved and shared whole, and written to
the nodes only through `globalFx.ts` setters. No LFO or swell targets, nothing per robot, nothing on the gem.

### 1.1 Data shape

```ts
// src/types/globalAudio.ts
export interface AutoWahSettings {
  baseFrequency: number;  // Hz, 50–1000 — the filter at the bottom of the sweep
  octaves: number;        // 1–8 — how far above baseFrequency a loud note opens it
  sensitivity: number;    // dB, −40–0 — lower = more sensitive (Tone boosts the follower's input)
  Q: number;              // 0.5–10 — Tone `Q` Signal
  gain: number;           // dB, 0–20 — Tone `gain` Signal, the peaking filter's boost
  follower: number;       // s, 0.01–1 — the envelope follower's smoothing
  wet: number;            // 0–1, slider position; the node gets colourWetGain(wet)
}
export interface PhaserSettings {
  rate: number;           // Hz, 0.05–10 — Tone `frequency`; the Free value. Read through resolvePhaserRateHz().
  octaves: number;        // 0.5–6
  baseFrequency: number;  // Hz, 50–2000
  stages: number;         // 1–12 integer — constructor-only in Tone; a change rebuilds the node (§1.3)
  Q: number;              // 0.5–20 — Tone `Q` Signal
  wet: number;            // 0–1, slider position; the node gets colourWetGain(wet)
  /** Present = Sync: `rate` is ignored and the LFO runs at this note value's Hz at the current tempo.
   *  Absent = Free. Never `sync: undefined`. docs/specs/FREE_SYNC_TOGGLE.md §1.1. */
  sync?: NoteValue;
}

export interface GlobalAudioSettings {
  …
  bitCrusher: BitCrusherSettings;
  /** Modulation slot, in chain order after Colour (docs/specs/GLOBAL_MODULATION_COLOUR.md §1.3). */
  autoWah: AutoWahSettings;
  phaser: PhaserSettings;
  limiter: LimiterSettings;
}
// DEFAULT_GLOBAL_AUDIO_SETTINGS gains assumption 10's two blocks. withGlobalAudioDefaults is unchanged in
// shape and fills them when absent.
```

`GlobalAudioSeedFieldKey` gains thirteen keys — `autoWah.baseFrequency`, `autoWah.octaves`,
`autoWah.sensitivity`, `autoWah.Q`, `autoWah.gain`, `autoWah.follower`, `autoWah.wet`, `phaser.rate`,
`phaser.octaves`, `phaser.baseFrequency`, `phaser.stages`, `phaser.Q`, `phaser.wet` — with rows in both range
tables (assumptions 5 and 6; the grid is the source of truth and both files transcribe it).
`AudioRigEffectKey` gains `autoWah | phaser`. `PHASER_RATE_RANGE_HZ = { min: 0.05, max: 10 }` lives in
`globalAudio.ts` beside `DELAY_TIME_RANGE_SECONDS`.

### 1.2 Seeding — `globalAudioSeed.ts`

```ts
const wahLit    = getSeededVal(noiseMap, 'globalAudio.autoWah.lit', 0, 0, 1) < PEDAL_LIT_EDGE.autoWah;
const phaserLit = getSeededVal(noiseMap, 'globalAudio.phaser.lit',  0, 0, 1) < PEDAL_LIT_EDGE.phaser;
const phaserSyncModeT = getSeededVal(noiseMap, 'globalAudio.phaser.syncMode', 0, 0, 1);
const phaserSyncNoteT = getSeededVal(noiseMap, 'globalAudio.phaser.syncNote', 0, 0, 1);
const phaserSync = phaserLit && phaserSyncModeT < PHASER_SYNC_ODDS
  ? pickSeedNoteValue(phaserSyncNoteT, bpm, [GLOBAL_AUDIO_LOADING_RANGES['phaser.rate']], 'hz')
  : undefined;
…
autoWah: { baseFrequency: sampleField(noiseMap, 'autoWah.baseFrequency'), …,
           wet: wahLit ? sampleField(noiseMap, 'autoWah.wet') : 0 },
phaser:  { rate: sampleField(noiseMap, 'phaser.rate'), …, stages: sampleField(noiseMap, 'phaser.stages'),
           wet: phaserLit ? sampleField(noiseMap, 'phaser.wet') : 0,
           ...(phaserSync !== undefined && { sync: phaserSync }) },
```

- `PEDAL_LIT_EDGE: Record<'autoWah' | 'phaser', number>` and `PHASER_SYNC_ODDS` are exported constants
  whose values are **set by measurement** (§5 calibration test), starting from 0.333 and 0.5. The comment
  block records the fit the way `COLOUR_CHARACTER_BANDS`' does.
- **All thirteen field keys and all four roll keys are read on every style**, lit or not, so the draw set
  never depends on the outcome and the oracle stays total.
- Colour's character draw and its keys are untouched: `pickColourCharacter` and `COLOUR_*` do not change.
- The two seed oracles are amended **by hand**: the two new blocks are added to each, every existing value
  stays byte-identical. Never re-recorded.
- `GLOBAL_AUDIO_LOADING_RANGES` gains thirteen rows; `docs/reference/GLOBAL_CHAIN_GRID.md` gains thirteen
  rows and a Modulation footnote in the chain-order line; `docs/ideas/themes.md` gets one sentence that a
  theme can move the two lit edges and the bands.

### 1.3 Engine — `globalFx.ts`

```ts
let _globalAutoWah: Tone.AutoWah | null = null;
let _globalPhaser:  Tone.Phaser  | null = null;
let _lastControlledDecay = false;   // the mode wireGlobalFxChain was last called with; a Phaser rebuild re-wires in it

// buildGlobalFxChain, after the BitCrusher:
const AutoWahCtor = getToneCtor<Tone.AutoWah>('AutoWah');
const PhaserCtor  = getToneCtor<Tone.Phaser>('Phaser');
if (AutoWahCtor) _globalAutoWah = new AutoWahCtor({ baseFrequency: 100, octaves: 6, sensitivity: 0, Q: 2, gain: 2, follower: 0.2, wet: 0 });
if (PhaserCtor)  _globalPhaser  = buildPhaser(PhaserCtor, DEFAULT_GLOBAL_AUDIO_SETTINGS.phaser, 0);

// wireGlobalFxChain: records _lastControlledDecay = controlledDecay, then
const chainNodes = [_globalEQ, _globalLPF, _globalHPF, _globalDistortion, _globalChebyshev, _globalBitCrusher,
                    _globalAutoWah, _globalPhaser, _globalCompressor, _globalLimiter].filter(Boolean) …
```

- Both join `disconnectAllFxNodes`' list. An absent node (headless) is skipped by `filter(Boolean)`.
- **`setGlobalAutoWah(params: Partial<AutoWahSettings>)`**: `baseFrequency`, `octaves`, `sensitivity`,
  `follower` → plain property writes; `Q`, `gain` → `rampOrSet(node.Q | node.gain, v, COLOUR_RAMP_SECONDS)`;
  `wet` → `rampOrSet(node.wet, colourWetGain(v), COLOUR_RAMP_SECONDS)`. Every value through `clampColour`.
- **`setGlobalPhaser(params: Partial<Omit<PhaserSettings, 'sync'>>)`** (the store resolves `rate` first,
  §1.4): `rate` → `rampOrSet(node.frequency, …)`; `Q` → `rampOrSet(node.Q, …)`; `octaves`, `baseFrequency` →
  plain writes; `wet` → `rampOrSet(node.wet, colourWetGain(v), …)`. **`stages`**: if `Math.round(v)` differs
  from the live node's stage count (kept in a module variable `_phaserStages`, since Tone does not expose it),
  `rebuildPhaser(stages)`: dispose the old node, construct a new one with `_phaserStages = stages` and the
  **last-written values of every other field** (kept in a module-level `_phaserLive` mirror so the rebuild
  needs no store read), `wet` already at its tapered value, then `wireGlobalFxChain(_lastControlledDecay)`.
  The rebuild is synchronous; the chain is never left open. Headless: `PhaserCtor` absent → no node, no
  rebuild, setter no-ops.
- Both setters null-guarded and try/caught like `setGlobalLimiter`; a Phaser constructor failure `devWarn`s
  and leaves the slot empty.
- `getGlobalModulationTarget` is unchanged (no pedal target).
- `AudioEngine.ts` re-exports `setGlobalAutoWah` and `setGlobalPhaser` beside the colour three.

### 1.4 Store — `audioStore.ts`

- `GLOBAL_SETTER` gains `autoWah: AudioEngine.setGlobalAutoWah` and `phaser: setGlobalPhaserResolved`, where
  `setGlobalPhaserResolved(edit)` reads `globalAudio.phaser` and `bpm` after the merge and calls
  `AudioEngine.setGlobalPhaser({ ...rest, rate: resolvePhaserRateHz(globalAudio.phaser, bpm) })` with `sync`
  stripped — the `setGlobalDelayResolved` shape (`:54–67`).
- `applyGlobalAudioToEngine(globalAudio, bpm)` pushes `autoWah` after `bitCrusher`, then `phaser` with `sync`
  stripped and `rate` resolved.
- `setPhaserSyncMode(synced: boolean)`: `phaserToSync` / `phaserToFree` at `bpm`, `set`, then push the
  resolved rate — the `setDelaySyncMode` shape (`:410`).
- `reapplyTempoSyncedValues` adds: `if (isNoteValue(phaser.sync)) AudioEngine.setGlobalPhaser({ rate:
  resolvePhaserRateHz(phaser, state.bpm) })`.
- `cancelSwellForGlobalField` is untouched (no pedal swell targets).

### 1.5 Tempo-sync helpers — `tempoSync.ts`

`resolvePhaserRateHz(phaser, bpm)` (Free or invalid sync → `rate`; Sync → the note's Hz clamped into
`PHASER_RATE_RANGE_HZ`); `allowedPhaserNoteValues(bpm)` = `allowedNoteValues(bpm, PHASER_RATE_RANGE_HZ,
'hz').reverse()` (slowest → fastest, the Free slider's direction, as the lane list); `phaserToSync` /
`phaserToFree` mirror `delayToSync` / `delayToFree` — whole new objects, a Free result carries no `sync` key,
Free → Sync snaps `rate` to the nearest allowed note, Sync → Free keeps the resolved Hz quantised to 0.05 and
floored at `PHASER_RATE_RANGE_HZ.min`.

### 1.6 UI — the Modulation tab

- `FleetParamsGroup` gains `'modulation'` between `'colour'` and `'output'`; `SECTIONS` gains
  `['modulation', 'spectral']`; `SUB_TABBED` gains it; `FLEET_PARAMS_SUBSECTIONS.modulation = [autoWah,
  phaser]`; `FLEET_PARAMS_GROUP_CONTENT.modulation = 'fleet.modulation'`. `DEFAULT_FLEET_PARAMS_SECTION`
  stays `'lfoBank'`. `useNavTree.ts`'s group parser picks the new id up from the type.
- Two `AUDIO_RIG_CONFIG` blocks after `bitCrusher` and before `delay`, `panelSchema(key, content, 'column')`,
  params in the order of §1.1 with assumption 5's types and ranges; no `lfoTarget` on any row.
  `AUDIO_RIG_EFFECT_TRAIT` maps both to `'spectral'`.
- `AudioRigEffectPanel` gains a `block.key === 'phaser'` branch: the `rate` row is a `TempoSyncSlider`
  (`schema` = the block's `rate` sliderLinear schema, `freeValue = effect.rate`, `syncValue =
  globalAudio.phaser.sync`, `allowed = allowedPhaserNoteValues(bpm)` memoised on `bpm`, `onModeChange =
  setPhaserSyncMode`, `onSyncChange` writes `{ sync }` through `setGlobalAudio('phaser', …)`), and every other
  row goes through `paramRow`. The AutoWah block needs no branch. Seven sliders is a tall column on the
  phone shell; the layout stays the plain column (layout decision 10: existing primitives, no new container).
- `Trait` and `TRAIT_COLORS` are untouched.

### 1.7 Content — `src/content/copy/fleet.ts`

New entries, placeholders in the copy-tone-guide's two voices (assumption 16): `fleet.modulation` (group:
human, lore, intro with an HTML human description covering both pedals and the Free | Sync Rate, like
`fleet.colour`), `fleet.autoWah` / `fleet.phaser` (heading entries), and thirteen parameter entries with
`help.human` and units where they apply (`Hz`, `dB`, `s`, `oct`): `fleet.autoWah.baseFrequency`,
`.octaves`, `.sensitivity`, `.q`, `.gain`, `.follower`, `.mix`; `fleet.phaser.rate` (its help explains Free
and Sync the way `fleet.delay.time` does), `.octaves`, `.baseFrequency`, `.stages`, `.q`, `.mix`.
`content.test.ts` and the ESLint rule keep literals out of components.

### 1.8 Persistence and sharing

Nothing new is encoded: `globalAudio` already travels whole, `sync` is a string key already present on the
Delay. `withGlobalAudioDefaults` fills missing blocks at both call sites unchanged. The `sessionDiff.ts` Delay
`sync` sanitiser is extended to `phaser.sync` (an invalid value is deleted). `TRANSMISSION_PRESETS` gain the
two default blocks. `isValidCompactSessionPayload` stays shallow.

### 1.9 Load budget

No change unless §5's A/B shows a rise at Full or Standard. If it does, assumption 15's shape is built as a
conditional task, measured again, and recorded in `scratchy-audio-phones.md`.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── globalAudio.ts                 AutoWahSettings, PhaserSettings, PHASER_RATE_RANGE_HZ, two keys, defaults (+ test)
├── data/
│   ├── globalAudioSeedRanges.ts       13 GlobalAudioSeedFieldKey rows (full ranges) (+ test)
│   ├── globalAudioLoadingRanges.ts    13 loading rows (+ test)
│   ├── audioRigConfig.ts              AudioRigEffectKey + two blocks (+ test: 12 blocks, 41 ids, params, no lfoTarget)
│   └── transmissionPresets.ts         two default blocks per preset
├── utils/
│   ├── tempoSync.ts                   resolvePhaserRateHz, allowedPhaserNoteValues, phaserToSync/Free (+ test)
│   ├── globalAudioSeed.ts             PEDAL_LIT_EDGE, PHASER_SYNC_ODDS, four rolls, 13 draws (+ test: oracles by hand, calibration)
│   ├── sessionDiff.ts                 phaser.sync sanitiser (+ test)
│   └── sessionShareUtils.test.ts      old link decodes with both pedals dry
├── engine/
│   ├── audioEngine/globalFx.ts        two nodes, chain slot, disconnect list, _lastControlledDecay, two setters, rebuildPhaser
│   └── AudioEngine.ts                 re-exports (+ test: node counts, chain order, rebuild on stages)
├── stores/
│   ├── audioStore.ts                  GLOBAL_SETTER, setGlobalPhaserResolved, setPhaserSyncMode, reapplyTempoSyncedValues, apply
│   └── uiStore.ts                     FleetParamsGroup 'modulation'
├── components/panels/screen/
│   ├── screens/FleetParamsScreen.tsx  SECTIONS, SUB_TABBED (+ test: seven groups)
│   ├── nav/navActions.ts              FLEET_PARAMS_SUBSECTIONS, FLEET_PARAMS_GROUP_CONTENT (+ test)
│   └── console/AudioRigDrawer.tsx     AUDIO_RIG_EFFECT_TRAIT, phaser branch with TempoSyncSlider (+ test)
├── content/copy/fleet.ts              fleet.modulation.*, fleet.autoWah.*, fleet.phaser.*
└── docs/globalModulationDocs.test.ts  guard: symbols declared where the docs say, no gem read, no target, grid rows
docs/
├── specs/GLOBAL_MODULATION_COLOUR.md  this file
├── tasks/GLOBAL_MODULATION_COLOUR.md  the plan (next phase)
├── reference/GLOBAL_CHAIN_GRID.md     chain-order line, 13 rows, Modulation footnote
├── AUDIO_SYSTEM.md                    Signal Graph + a Modulation paragraph
├── specs/FREE_SYNC_TOGGLE.md          one line: the Phaser's Rate is the third synced field
├── SESSION_STORAGE.md                 one line: absent pedal keys load as defaults; phaser.sync sanitised
├── ideas/themes.md                    one sentence on the lit edges and bands
├── todo/roadmap.md                    50.4 status + as-built
└── todo/scratchy-audio-phones.md      re-baseline + the 50.4 A/B
```

Conditional (only if the A/B asks): `src/constants/index.ts` (`LOAD_PEDAL_MIN`), `src/utils/audioBudget.ts`,
`src/systems/audioBudgetSystem.ts`, `src/components/debug/hudLines.ts`, `globalFx.setPedalsEnabled`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. Nothing per robot: no `Robot`, `CompanyOptionsSnapshot`,
  `RobotAudioOverrideDiff`, `spawnSystem.ts`, `AudioEngine.reserveVoice` or share codec key changes.
- **Two nodes, one instance each, on the global chain.** No per-robot pedal, no Bank or swell target on any
  pedal field, no new trait, no change to Colour's draw or bands, no backlog-22 pedal, no new dependency.
- **Every AudioParam write lives in `globalFx.ts`**, called from `audioStore` actions,
  `applyGlobalAudioToEngine` or `reapplyTempoSyncedValues`, never from a GSAP callback or a React effect
  (Strict Separation). The Phaser rebuild is a setter's work, synchronous, inside `globalFx.ts`.
- **State stays JSON-serialisable:** thirteen numbers and one optional note-value string on
  `GlobalAudioSettings`; nodes and the `_phaserLive` mirror are module state in `globalFx.ts`.
- **Zero display strings in components or configs** — every label, heading, unit and help line is a
  `src/content/` entry read through `labels()` / `introProps()`.
- **Replayability:** every lit roll, sync roll and value comes from `getSeededVal` under `globalAudio.*`
  keys. The Phaser's LFO phase is wall-clock, the accepted class (backlog 17); nothing else is.
- **Nothing reaches the robot's body** (Visual Mapping guardrail) — the guard test scans the gem folder.
- **No "keep existing worlds the same" constraint** (pre-v1 rule). The seed oracles are amended by hand to
  add keys, and only to add keys.
- **Protected paths:** `.env*`, `node_modules/`, build output.

---

## 4. Code Style & Architecture Conventions

```ts
// src/engine/audioEngine/globalFx.ts — the Phaser setter: Signals ramp, plain fields write, stages rebuild
export function setGlobalPhaser(params: Partial<Omit<PhaserSettings, 'sync'>>): void {
  const phaser = _globalPhaser;
  if (!phaser) return;
  try {
    const stages = params.stages === undefined ? undefined : clampColour('phaser.stages', Math.round(params.stages));
    if (stages !== undefined && stages !== _phaserStages) {
      rebuildPhaser(stages);                       // disposes, reconstructs from _phaserLive, re-wires (§1.3)
      return setGlobalPhaser({ ...params, stages: undefined });
    }
    const rate = params.rate === undefined ? undefined : clampColour('phaser.rate', params.rate);
    if (rate !== undefined) rampOrSet(phaser.frequency, rate, COLOUR_RAMP_SECONDS);
    const wet = params.wet === undefined ? undefined : clampColour('phaser.wet', params.wet);
    if (wet !== undefined) rampOrSet(phaser.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
    …
  } catch (err) {
    devWarn('[AudioEngine] setGlobalPhaser failed', err);
  }
}
```

```ts
// src/data/audioRigConfig.ts — a block is schema + content keys, never a string
{
  key: 'phaser',
  panel: panelSchema('phaser', 'fleet.phaser', 'column'),
  params: [
    { field: 'rate',   schema: { id: 'phaser.rate',   type: 'sliderLinear', ...labels('fleet.phaser.rate'),   min: PHASER_RATE_RANGE_HZ.min, max: PHASER_RATE_RANGE_HZ.max, step: 0.05, orientation: 'horizontal' } },
    { field: 'stages', schema: { id: 'phaser.stages', type: 'sliderLinear', ...labels('fleet.phaser.stages'), min: 1, max: 12, step: 1, orientation: 'horizontal' } },
    …
    { field: 'wet',    schema: { id: 'phaser.wet',    type: 'sliderLinear', ...labels('fleet.phaser.mix'),    min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
  ],
},
```

- Names: settings interfaces `XSettings`; keys camelCase (`autoWah`, `phaser`); seed keys `block.field`;
  content keys `fleet.<block>.<param>`; constants `PEDAL_*` / `PHASER_*` in the module that owns them.
- Comments cite this spec by section where a choice is not obvious from the code (the rebuild, the shared
  taper, the measured edges, the hand-amended oracle).
- Tests colocated; TDD per task; one commit per task; the mutation harness run on each pure module.

---

## 5. Testing & Verification Requirements

**Unit (Vitest), per area:**

- `globalAudio.test.ts`: defaults carry both blocks at `wet 0`; `withGlobalAudioDefaults` fills a missing
  `autoWah` / `phaser` and leaves present ones untouched; a Free default has no `sync` key.
- Range tests: thirteen new rows in each table, loading inside full, every key in both.
- `tempoSync.test.ts`: `resolvePhaserRateHz` Free / Sync / invalid sync; `allowedPhaserNoteValues` is inside
  the range and slowest-first; `phaserToSync` snaps and keeps `rate`; `phaserToFree` keeps the heard Hz,
  quantised, floored at the minimum, and carries no `sync` key.
- `globalAudioSeed.test.ts`: the two oracles with both blocks added by hand and nothing else moved (the
  existing `toStrictEqual` proves it); determinism; **calibration** over 3 000 styles: each pedal lit
  33 ± 3 %, the two lit outcomes independent (the both-lit share within ±3 points of the product), a lit
  Phaser synced within ±5 points of `PHASER_SYNC_ODDS`, a dark Phaser never synced; a dark pedal has `wet === 0`
  and a lit pedal's `wet` inside its band and ≤ `COLOUR_LOAD_MIX_MAX`; `stages` an integer on every seed;
  Colour's character shares unchanged.
- `audioRigConfig.test.ts`: twelve blocks in grid order, 41 ids; each pedal block's params, types, ranges
  and steps; no `lfoTarget` on any pedal row.
- `AudioEngine.test.ts`: `buildGlobalFxChain` constructs exactly one AutoWah and one Phaser (constructor
  count); `wireGlobalFxChain` in both modes places them between BitCrusher and Compressor (connection-order
  assertion) with the returns joining after; `setGlobalPhaser({ stages })` with a new count disposes the old
  node, constructs one with `stages` and the last-written fields, and re-wires in the **last** Decay Mode;
  the same count rebuilds nothing; with a missing `Phaser` ctor the chain still wires and the setter no-ops.
- `globalFx` setter tests: each setter writes its fields (Signals ramped, plain fields set, `wet` squared),
  clamps, ignores NaN, no-ops without a node.
- `audioStore.test.ts`: `setGlobalAudio('phaser', { sync })` reaches the engine with `rate` resolved and no
  `sync`; `setPhaserSyncMode` converts both ways; `setBPM` re-pushes a synced Phaser and leaves a Free one
  alone; `applyGlobalAudioToEngine` pushes both blocks.
- `uiStore` / `navActions` / `FleetParamsScreen` / `AudioRigDrawer` tests: seven groups in order,
  Modulation between Colour and Output in the `spectral` colour, on both shells; its two sub-tabs; breadcrumb
  "Modulation / Phaser"; the Phaser block renders a `TempoSyncSlider` on its rate row and plain rows elsewhere;
  the AutoWah block renders seven plain rows.
- `sessionDiff.test.ts` / `sessionShareUtils.test.ts`: a version-2 payload without the pedal keys restores
  and decodes with the defaults; a payload with a synced Phaser round-trips; an invalid `phaser.sync` is
  dropped on restore.
- Presets test: every preset's `globalAudio` has both blocks at `wet 0`.
- `src/docs/globalModulationDocs.test.ts`: the named symbols are declared where this spec says; no file under
  the gem folder reads `autoWah` or `phaser`; neither is a modulation or swell target; the grid has a row for
  every one of the thirteen fields, with its setter, after the BitCrusher rows; the living docs name them.
- `content.test.ts` and lint: no literal strings.

**Verification steps (every task):** `npm run build:types`, `npm run lint`, `npm test`, `npm run build`, all
clean. Mutation harness on `tempoSync.ts`, `globalAudioSeed.ts`, `globalAudio.ts`, the setters and
`audioBudget.ts` (if touched).

**Manual listen (Crawford, desktop):** a wah world, a phaser world, a both world and a neither world, found
by cycling seeds with the HUD's seed readout; each pedal from 0 to full by hand with no click; **Stages
dragged 1 → 12 at mid Mix while the fleet plays — the rebuild tick is the assumption-2 veto point**; Rate
Free → Sync → Free, then a Tempo change with Sync on (the sweep follows); Natural and Controlled Decay flips
keep both pedals and a Stages change after a Controlled flip re-wires Controlled; save, reload and share-link
round trips including a synced Phaser; an old `?session=` link loads with both dry; keyboard and every "?".

**Phone gate (the series' "without distortion"):**

1. **Re-baseline first.** Crawford's seed-`alpha` world on current `main` (the Colour chain), Pixel 8,
   `?debug`, Full 3:00 and Standard 3:00, underrun counts recorded in `scratchy-audio-phones.md`. 50.3's T0
   re-baseline never ran, so this is the first measured baseline since Sends.
2. **A/B on the branch**, same world, same lengths: (a) the seeded pedals; (b) Phaser alone at full Mix,
   12 stages; (c) both at full Mix, 12 stages. Underrun counts at Full and at Standard, plus the desktop
   `npm run perf` before and after.
3. **Pass:** zero underruns at Full in every run and no more than the re-baseline at Standard. A rise in (b)
   or (c) only → the Stages ceiling drops (assumption 5) and the run repeats; a rise at the ceiling that
   passes → assumption 15's threshold is built and measured again; a rise at (a) → the pedal is withdrawn.
   Recorded either way, with counts.

---

## 6. Git & Workflow Context

- Branch `feature/palette-modulation` off `main`; Crawford creates branches, PRs and merges.
- One commit per task, RED first, imperative subject, no conventional-commit prefix. Co-author line per the
  session reminder.
- Docs and the roadmap's as-built paragraph land in the final docs task, which turns the guard test's docs
  cases green.
- Repo index is LF; `docs/` working copies are mixed. New docs are written CRLF to match their siblings;
  edit existing files in their own endings.

---

## 7. Open Questions & Risks

**Answers (2026-10-15, after the build and the Pixel run):**

1. **Stages rebuild:** the slider stays; Crawford closed Task 16 without asking for seeded-only. No audible-tick finding is recorded.
2. **Phaser seeded Sync:** about half of lit Phasers (`PHASER_SYNC_ODDS` 0.5, measured 50.2 %), a dark Phaser always Free.
3. **Lit bands and ceiling:** retuned to Crawford's recommended ranges at T16 (see §8); the pedal Mix no longer shares 0.25.
4. **Rate range:** 0.05–10 Hz linear, kept (the seeded band is 0.1–2.5).
5. **Slot order:** wah before phaser, kept.
6. **Unswept rooms:** kept, tails stay clean.
7. **Stereo from the Phaser onward:** as specified; one more reason wah stays first.
8. **Presets:** clean.
9. **Lore words:** still placeholders for the copy pass.
10. **Phone cost:** the gate was run once (both pedals, 12 stages, Full 3:00): some underruns, no distortion, no baseline. Closed by Crawford.

The original questions follow, as written.


1. **Stages rebuild (assumption 2):** keep the slider and accept a possible tick on drag, or make Stages
   seeded-only? Decided by the desktop listen. A crossfaded double node is not proposed.
2. **Phaser seeded Sync (assumption 8):** about half of lit Phasers, always Free, or the Delay's two-thirds?
3. **Lit bands (assumption 6)** and the shared 0.25 ceiling (assumption 9) are placeholders for the listen;
   the calibration test pins whatever Crawford settles on. A lit Phaser at 0.01–0.06 tapered wet may be too
   faint to read as a sweep; the ceiling is the knob.
4. **Rate range (assumption 5):** 0.05–10 Hz linear. A wider or log range is a one-row change but
   `TempoSyncSlider` takes a linear schema today.
5. **Slot order (assumption 3):** wah before phaser. If the listen prefers the phaser's notches being wah'd,
   swap the two in `chainNodes`; one line.
6. **Unswept rooms (assumption 4):** tails stay clean, as for Colour; a second join point is not proposed.
7. **Stereo from the Phaser onward:** `StereoEffect` splits the dry chain into two channels at the Phaser;
   downstream nodes are stereo-safe. The AutoWah before it is mono, so a swapped order (item 5) would mean a
   mono wah summing the Phaser's stereo — a reason to keep wah first.
8. **Presets (assumption 10):** clean, unless Crawford wants a preset with a pedal.
9. **Lore words (assumption 16)** are placeholders until Crawford's copy pass.
10. **Phone cost:** `stages` × 2 biquads plus two LFOs for the Phaser; a Follower, a −48 dB bandpass (four
    biquads), a peaking filter and a ScaleExp for the AutoWah. Cheap by inspection; the gate decides.

---

## 8. As Built

The roadmap's 50.4 "As built" ([roadmap.md](../todo/roadmap.md)) is the full record. In short, against this spec:

- **Uniform draws throughout** (§1.2): all four roll draws and all thirteen value draws use `getUniformSeededVal`; `sampleField`
  takes a third `uniform` parameter, and every pre-existing field keeps the plain draw. `PEDAL_LIT_EDGE` is the nominal 1/3 on both
  pedals (no fitting), measured 33.07 % and 33.30 % lit, 11.22 % both (product 11.01 %), independent of Colour.
- **Bands (assumption 6) retuned at T16:** AutoWah baseFrequency 50–250, octaves 2.5–5, sensitivity −40 to −10, Q 2–6, gain 2–6,
  follower 0.1–0.4 (unchanged), Mix 0.3–0.7; Phaser rate 0.1–2.5, octaves 2–5, baseFrequency 200–800, stages 4–12, Q 1–10, Mix
  0.25–0.6. **Assumption 9 is overturned for the Mix ceiling:** the pedals no longer share `COLOUR_LOAD_MIX_MAX`; they keep the
  taper (`colourWetGain`).
- **A failed Phaser rebuild keeps the old node** (§1.3 said the slot would be left empty); a boot-time constructor failure still
  leaves it empty. Boot builds the Phaser twice.
- **T0 and T15b were not done.** Task 14 ran once, partially (see the answers in §7), and Crawford closed it.
- **The guard test** is `src/docs/globalModulationDocs.test.ts` (T13): the gem scan, the no-target checks, the declared-symbol table,
  the thirteen range rows and grid rows, and the three living-doc cases that were red until Task 17.
- **Docs:** `AUDIO_SYSTEM.md` (the chain, the two setters, a Modulation paragraph), `SESSION_STORAGE.md`, `FREE_SYNC_TOGGLE.md`,
  `themes.md` and `GLOBAL_CHAIN_GRID.md` (rows and footnote).
