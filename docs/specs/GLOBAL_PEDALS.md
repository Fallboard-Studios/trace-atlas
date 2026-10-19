# Phase Spec: Global Pedals — Chorus, Tremolo, Vibrato, Frequency Shifter and Stereo Width on the Global Chain

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (§5): `npm run perf`
> - Phone gate (§5): the `?debug` HUD on the Pixel, seed `alpha`, Standard and Full

Source of intent: [docs/intent/global-pedals.md](../intent/global-pedals.md) (confirmed 2026-10-17, six
questions; one guess overturned — "all eight in one pass" became the five dry-chain pedals now and the two
room type radios later). Backlog item 22
([backlog.md](../todo/backlog.md#22-audio-palette-trials-more-global-pedals-to-audition)); proposed roadmap
slot **50.6**, the sixth sub-phase of the Audio Palette series (assumption 17). 50.1–50.5 are merged (`main`
at `4a9b3fec`, PRs #555–#559), so the chain already carries the send/return rooms, the three Colour nodes and
the two 50.4 pedals this spec builds after. **This branch (`perf/per-mover-layers`) carries roadmap 53's build
in another session: the intent, this spec and the plan are written here, and nothing else is** (Crawford,
2026-10-17). The build gets its own branch off `main` (§6).

Survey basis (2026-10-17, against `perf/per-mover-layers` at `6e3b07cb`, which carries `main` `4a9b3fec`;
every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:132`) constructs every node
  behind `getToneCtor` (`:140–150`), then `wireGlobalFxChain(false)`. `wireGlobalFxChain` (`:293`) records
  `_lastControlledDecay` (`:46`, added by 50.4 for the Phaser rebuild), calls `disconnectAllFxNodes` (`:241`,
  a literal node list), builds the dry chain from one array `[EQ, LPF, HPF, Distortion, Chebyshev,
  BitCrusher, AutoWah, Phaser, Compressor, Limiter]` (`:297–308`), connects the last to `_masterGain`
  (`:323`), then joins the rooms' returns at `join = controlledDecay ? _globalLimiter : _globalCompressor`
  (`:336–342`). The dry chain is identical in both Decay Modes. From the Phaser onward it is stereo.
- **50.4's helpers, all reusable.** `COLOUR_RAMP_SECONDS = 0.05` (`:71`); `colourWetGain(mix) = mix²`
  (`:79`); `clampColour(key, value)` (`:86`) clamps into `GLOBAL_AUDIO_SEED_RANGES[key]`, keyed by
  `GlobalAudioSeedFieldKey` so any new key works unchanged; `clampIfGiven` (`:111`); `rampOrSet` (`:117`,
  `value: unknown`). The Phaser's `_phaserStages` / `_phaserLive` mirror and `buildPhaser` (`:43–44`, `:99`)
  are the rebuild machinery; nothing here needs a rebuild. The seven setters `setGlobalDistortion` …
  `setGlobalPhaser` (`:600+`) are the shape to copy; `AudioEngine.ts:52–53` / `:1465–1466` re-export the
  pedal pair.
- **How a global field flows.** `GlobalAudioSettings` (`src/types/globalAudio.ts:145`),
  `DEFAULT_GLOBAL_AUDIO_SETTINGS` (`:168`), `withGlobalAudioDefaults` (`:193`, whole blocks, never
  deep-merged), `PHASER_RATE_RANGE_HZ = { 0.05, 10 }` and `PHASER_RATE_STEP_HZ = 0.05` (`:95–97`) →
  `GLOBAL_SETTER` (`src/stores/audioStore.ts:102`, `phaser: setGlobalPhaserResolved` at `:114`),
  `applyGlobalAudioToEngine` (`:131`), `reapplyTempoSyncedValues` (`:157`), `setPhaserSyncMode` (`:464`) →
  `AudioRigEffectKey` (`src/data/audioRigConfig.ts:30`) and the twelve `AUDIO_RIG_CONFIG` blocks
  (`autoWah` `:156`, `phaser` `:169`, `delay` `:181`, `compressor` `:204`, `limiter` `:215`);
  `audioRigConfig.test.ts:310–321` pins "twelve blocks" and "13 pedal params", `:392` unique ids.
- **The Free | Sync rail for one rate.** `PhaserSettings.sync?: NoteValue` (present = Sync, absent = Free,
  never `sync: undefined`); `resolvePhaserRateHz` (`src/utils/tempoSync.ts:117`), `allowedPhaserNoteValues`
  (`:139`, `allowedNoteValues(bpm, PHASER_RATE_RANGE_HZ, 'hz').reverse()`), `phaserToSync` / `phaserToFree`
  (`:200` / `:212`, `quantizeClean` at the step); the Delay trio at `:106` / `:133` / `:171` / `:186`;
  `pickSeedNoteValue` (`:228`). The drawer's `block.key === 'phaser'` branch (`AudioRigDrawer.tsx:344–`)
  renders the rate row through `TempoSyncSlider`; the Delay branch at `:321`. `sanitizePhaserSync`
  (`src/utils/sessionDiff.ts:91`, applied at `:550`) drops a bad note value on restore.
- **Seeding.** `generateGlobalAudioSettings` (`src/utils/globalAudioSeed.ts:172`); `sampleField(noiseMap,
  key, uniform = false)` (`:57`); the pedal rolls `autoWahLit` / `phaserLit` / `phaserSyncModeT` /
  `phaserSyncNoteT` are **uniform** draws under `PEDAL_LIT_EDGE = { autoWah: 1/3, phaser: 1/3 }` and
  `PHASER_SYNC_ODDS = 0.5` (`:139–145`, `:196–199`); the oracles in `globalAudioSeed.test.ts:167+` are
  amended by hand. `GLOBAL_AUDIO_LOADING_RANGES` (`src/data/globalAudioLoadingRanges.ts`) carries the 50.4
  bands at `:70–86`; `COLOUR_LOAD_MIX_MAX = 0.25` (`:26`) is Colour's ceiling only.
- **Tabs.** `FleetParamsGroup` is seven ids (`uiStore.ts:22`); `SECTIONS` (`FleetParamsScreen.tsx:24–31`,
  `['modulation', 'spectral']` at `:30`, `['output', 'output']` at `:31`); `SUB_TABBED` (`:107`) already
  lists `modulation` and `output`; `FLEET_PARAMS_SUBSECTIONS.modulation = [autoWah, phaser]` and
  `.output = [compressor, limiter]` (`navActions.ts:98–105`); `FLEET_PARAMS_GROUP_CONTENT` (`:124–125`);
  `AUDIO_RIG_EFFECT_TRAIT` (`AudioRigDrawer.tsx:56`). No section tab is added by this phase.
- **Content.** `fleet.modulation` (`src/content/copy/fleet.ts:280`), `fleet.phaser` (`:334`, the heading
  shape), `fleet.output` (`:370`), `fleet.compressor` / `fleet.limiter` (`:388` / `:427`). Control types:
  `sliderLinear`, `sliderLog`, `sliderCenteredZero` (`src/types/controls.ts:68/:84/:204`).
- **Load budget.** `effectsLoadToLimits` (`src/utils/audioBudget.ts:78`) returns three booleans;
  `tiersLine` (`src/components/debug/hudLines.ts:62`) prints them. **Docs guard.**
  `src/docs/globalModulationDocs.test.ts` (gem scan `:50`, no-target `:78`, declared symbols `:102`, range
  and grid rows `:163`, living docs `:211`) is the pattern; the grid is `docs/reference/GLOBAL_CHAIN_GRID.md`
  (chain-order line `:3`, Phaser rows `:37–42`, Modulation footnote ⁴ `:62`); `docs/ideas/themes.md:27` is
  the themes sentence.
- **Tone 15.1.22, read from `build/esm/effect/*.js` and `.d.ts`.** `Chorus extends StereoFeedbackEffect`:
  two internal `LFO`s (right at `spread` degrees from left) on two delay lines; `frequency` is the left
  LFO's frequency Signal (the right follows it); `delayTime` (ms), `depth`, `spread`, `type` are plain
  setters (`depth` and `delayTime` recompute the LFOs' min/max); `feedback` is a Signal (`StereoFeedbackEffect`),
  a Chorus with feedback is Tone's flanger; **`start()` / `stop()` must be called — the constructor does not
  start the LFOs.** Defaults `{ frequency: 1.5, delayTime: 3.5, depth: 0.7, type: 'sine', spread: 180,
  feedback: 0 }`. `Tremolo extends StereoEffect`: two LFOs on two amplitude Gains, phase inverted per
  channel; `frequency` and `depth` are Signals fanned to both LFOs; `spread`, `type` plain setters; **`start()`
  required.** Defaults `{ frequency: 10, depth: 0.5, spread: 180 }`. `Vibrato extends Effect`, which is
  **not** mono: `Effect` is gains and a crossfade, and the one LFO moves one `Delay` that delays left and right
  alike, so the stereo image passes through. `maxDelay` is constructor-only (default 0.005 s — the Depth
  ceiling); `frequency` and `depth` are the LFO's frequency and amplitude Signals; **the constructor starts
  the LFO.** Defaults `{ frequency: 5, depth: 0.1 }`. `FrequencyShifter extends Effect`: `frequency` a
  Signal, signed, ±sampleRate/2, default 0; single-sideband ring modulation, aliases towards the top (the
  global LPF is upstream). It is **half mono**: its sine branch reaches the output through `Add.addend`, an
  AudioParam, which the browser downmixes, while its cosine branch stays stereo. A centred voice shifts
  cleanly; a panned one leaks the other sideband and a copy into the far channel (measured in §8). `StereoWidener extends MidSideEffect`: `width` a Signal 0–1, default 0.5 = unity
  (`Mid *= 2(1−width)`, `Side *= 2·width`); it has a `wet` like every Effect, held at 1.

ASSUMPTIONS I'm making beyond the intent's decisions (correct now or I'll proceed with these):

1. **Field names.** `chorus: { rate, delayTime, depth, spread, feedback, wet, sync? }`, `tremolo: { rate,
   depth, spread, wet, sync? }`, `vibrato: { rate, depth, wet, sync? }`, `frequencyShifter: { shift, wet }`,
   `stereoWidener: { width }`. `rate` rather than Tone's `frequency` so every Free | Sync pair is `rate` +
   `sync`, as the Phaser's; `shift` rather than `frequency` because a signed Hz offset is not a rate. The
   grid's Param column records the Tone name beside each.
2. **Chain slots.** `chainNodes` becomes `[…, AutoWah, Phaser, Chorus, Tremolo, Vibrato, FrequencyShifter,
   Compressor, StereoWidener, Limiter]`. The four motion pedals sit after the Phaser and before the
   Compressor, so the rooms' returns rejoin after them in both Decay Modes. **The widener sits between the
   Compressor and the Limiter**, and the Controlled-Decay join moves from the Limiter to the widener: `join =
   controlledDecay ? (_globalStereoWidener ?? _globalLimiter) : _globalCompressor`. Under Natural the returns
   join at the Compressor and flow through the widener anyway. So the widener is the one node that hears
   the rooms in both modes, and Width 0 folds everything.
3. **Order inside the motion slot: Chorus → Tremolo → Vibrato → FrequencyShifter.** Chorus first because it
   is the only stereo-feedback node and the Phaser hands it a stereo signal; the shifter last because
   ring-modulating a tremolo'd, chorused signal is the "strange" the backlog wants, while a chorus of a
   ring-modulated signal just smears aliasing. A listening item in §7. *(Corrected 2026-10-18, review: this
   assumption first said the Vibrato and the shifter were mono `Effect`s that sum the chain. The Vibrato is
   fully stereo; only the shifter's sine branch is downmixed — see §1 above and §8.)* **Veto point:** if the
   shifter's sideband leak on panned voices (Robot Pan) sounds wrong rather than strange on a lit world,
   the choices are a lower lit share for the shifter or a centred-only band — not a slot swap, since the
   leak is in the node, wherever it sits.
4. **The LFOs run always.** Chorus and Tremolo are `start()`ed once at construction (the Phaser's LFOs
   already run always; Vibrato starts itself). A dark pedal is Mix 0, not a stopped LFO. Simplest, no
   start/stop state; the cost of three idle LFOs is the gate's to measure. Never `sync()` a pedal LFO to the
   transport: Sync is the resolved-Hz treatment.
5. **Full ranges (UI = full; every slider horizontal).** Chorus: `rate` 0.05–10 Hz step 0.05
   `sliderLinear` (the `TempoSyncSlider` takes a linear schema); `delayTime` 1–20 ms step 0.5; `depth` 0–1
   step 0.01; `spread` 0–180° step 5; `feedback` 0–0.9 step 0.01; `wet` 0–1 step 0.01. Tremolo: `rate`
   0.05–10 step 0.05; `depth` 0–1; `spread` 0–180; `wet` 0–1. Vibrato: `rate` 0.05–10 step 0.05; `depth`
   0–1 (at `maxDelay` 0.005 s, Tone's default, kept); `wet` 0–1. FrequencyShifter: `shift` −1000–+1000 Hz
   step 1 `sliderCenteredZero`; `wet` 0–1. StereoWidener: `width` 0–1 step 0.01 `sliderLinear`. One shared
   `PEDAL_RATE_RANGE_HZ = PHASER_RATE_RANGE_HZ` and `PEDAL_RATE_STEP_HZ = PHASER_RATE_STEP_HZ` (the Phaser's
   constants are re-exported under the generic names, not duplicated).
6. **Loading bands when a pedal is lit (placeholders, tuned by ear at a checkpoint, as 50.4's were at
   T16).** Chorus: `rate` 0.2–2, `delayTime` 2–8, `depth` 0.3–0.7, `spread` 90–180, `feedback` 0–0.2, `wet`
   0.15–0.4. Tremolo: `rate` 0.5–6, `depth` 0.3–0.7, `spread` 90–180, `wet` 0.2–0.5. Vibrato: `rate` 2–7,
   `depth` 0.05–0.3, `wet` 0.2–0.5. FrequencyShifter: `shift` ±(2–20) Hz, the sign a separate uniform draw
   (`globalAudio.frequencyShifter.sign`), never inside ±2, `wet` 0.1–0.3. StereoWidener: `width` 0.4–0.65
   (never near 0: the mono fold is a hand setting only). A **dark** pedal seeds `wet = 0` and every other
   field from its band, so a hand nudge of Mix hears a seeded pedal. The widener has no dark state.
7. **Lit odds and the two-of-six cap: a sequential roll in chain order.** The AutoWah and Phaser rolls are
   untouched (their draws and oracles stay byte-identical). Then, in chain order, each new pedal rolls its
   own uniform draw under `PEDAL_LIT_EDGE.<pedal>` — nominal `chorus` 0.25, `tremolo` 0.25, `vibrato` 0.25,
   `frequencyShifter` 0.15 — **and is forced dark if two Modulation pedals are already lit** (`MAX_LIT_PEDALS
   = 2`, counting AutoWah and Phaser). Every roll key is read on every style, lit or capped or not, so the
   draw set never depends on the outcome. The realised shares are lower than nominal (about 11 % of worlds
   arrive with both 50.4 pedals lit and light nothing more); the calibration test pins the **measured**
   shares, and a theme that wants more lit moves the edges or the cap. **Veto point:** the pick-two-of-six
   alternative gives every pedal equal standing but moves the AutoWah and Phaser oracles; not proposed.
8. **Each lit LFO pedal seeds Sync about half the time**, the Phaser's `PHASER_SYNC_ODDS` generalised to
   `PEDAL_SYNC_ODDS = 0.5` (the Phaser's constant becomes an alias of it): per pedal a `syncMode` and a
   `syncNote` uniform draw, the note picked through `pickSeedNoteValue` over the lit `rate` band. A dark
   pedal is seeded Free (no `sync` key).
9. **Mix taper is Colour's, by the same function.** Every `wet` passes through `colourWetGain` (squared) in
   the setters; the seeded Mix bands are each pedal's own (assumption 6), no shared ceiling, as 50.4 settled.
10. **Defaults (`DEFAULT_GLOBAL_AUDIO_SETTINGS`) and the three transmission presets: Tone's defaults with
    `wet` 0, Width 0.5.** `chorus { rate: 1.5, delayTime: 3.5, depth: 0.7, spread: 180, feedback: 0, wet: 0 }`,
    `tremolo { rate: 10, depth: 0.5, spread: 180, wet: 0 }`, `vibrato { rate: 5, depth: 0.1, wet: 0 }`,
    `frequencyShifter { shift: 0, wet: 0 }`, `stereoWidener { width: 0.5 }`. Presets stay clean.
11. **Sub-tabs, no new section tab.** `FLEET_PARAMS_SUBSECTIONS.modulation` becomes `[autoWah, phaser,
    chorus, tremolo, vibrato, frequencyShifter]` (chain order); `.output` becomes `[compressor,
    stereoWidener, limiter]` (chain order, the widener between the two). Each is an `AUDIO_RIG_CONFIG` block
    rendered by the existing block → `AudioRigEffectPanel` path; the widener block has one slider. Six
    sub-tabs on Modulation is a wide row on the phone shell; `SectionTabs` already scrolls, and layout
    decision 10 (existing primitives) holds. `FleetParamsGroup`, `SECTIONS`, `SUB_TABBED`, `Trait` and
    `TRAIT_COLORS` are untouched; `AUDIO_RIG_EFFECT_TRAIT` maps the four to `spectral` and the widener to
    `output`.
12. **The Free | Sync rail is generalised, and the Phaser migrates onto it.** `tempoSync.ts` gains a
    `SyncedRate = { rate: number; sync?: NoteValue }` shape and four generic helpers —
    `resolveSyncedRateHz(field, bpm, range)`, `allowedRateNoteValues(bpm, range)`,
    `syncedRateToSync(field, bpm, range)`, `syncedRateToFree(field, bpm, range, step)` — and the four Phaser
    helpers become one-line wrappers over them (kept exported; nothing else moves). Store: one
    `setGlobalRateResolved(key)` factory produces `GLOBAL_SETTER.chorus / .tremolo / .vibrato` the way
    `setGlobalPhaserResolved` works (strip `sync`, resolve `rate` at `bpm`); `setPhaserSyncMode(synced)`
    becomes `setPedalSyncMode(key, synced)` with the Phaser's action kept as a wrapper;
    `reapplyTempoSyncedValues` re-pushes every synced pedal. Drawer: the `block.key === 'phaser'` branch
    becomes a `SYNCED_RATE_BLOCKS.has(block.key)` branch rendering the `rate` row through `TempoSyncSlider`.
13. **Old payloads load with defaults, by the existing helper, and a bad `sync` is dropped.**
    `withGlobalAudioDefaults` fills the five missing blocks at both call sites unchanged;
    `sanitizePhaserSync` becomes `sanitizeSyncedRate` applied to the four synced blocks. Payload `version`
    stays 2; nothing new is encoded.
14. **Clamping.** Every setter clamps through `clampColour` keyed by the new field keys and ignores a
    non-finite value; `shift` is clamped signed; `width` is clamped 0–1.
15. **No Effects Limit threshold unless the A/B asks.** If it does: `LOAD_PEDALS_MIN` in
    `constants/index.ts`, a fourth boolean `pedalsEnabled` on `EffectsLoadLimits`,
    `globalFx.setPedalsEnabled(false)` holding the three LFO pedals' `wet` at 0 first (the LFOs are the
    cost) and the shifter's second; the widener is never limited. Stored settings are never touched by a
    tier; the HUD's tier line gains `pedals`.
16. **Lore words are placeholders** for the copy pass, in the grid's capitals style for headings: Chorus →
    human "Chorus", lore "Twin Current"; Tremolo → "Tremolo", "Pulse Fade"; Vibrato → "Vibrato", "Line Waver";
    FrequencyShifter → "Shifter", "Band Slip"; StereoWidener → "Width", "Spread". Each `wet` is "Mix", each
    `rate` is "Rate", `delayTime` is "Delay", `shift` is "Shift", `width` is "Width".
17. **Roadmap and backlog edits land in the docs task.** The roadmap gains **50.6 Global Pedals** after 50.5
    (status + as-built, the series' shape); backlog 22 is rewritten to hold only the two room type radios,
    with the stale `globalFx.ts:144` cite fixed and the Freeverb / JCReverb "cheaper" claim corrected to
    Tone 15's worklet warning. Both files are edited append-only in their own line endings (backlog CRLF,
    roadmap LF).

---

## 1. Overview & Claude Explanation

Five single-instance Tone 15 effects join the global chain. Four are motion: `Tone.Chorus` (two LFO-swept
delay lines, a flanger with feedback), `Tone.Tremolo` (LFO-swept amplitude, inverted per channel),
`Tone.Vibrato` (an LFO-swept short delay, pitch wobble) and `Tone.FrequencyShifter` (single-sideband ring
modulation, every partial moved by the same Hz). They sit on the dry chain after the Phaser and before the
Compressor, so the rooms' tails stay clean, and each becomes a sub-tab of the existing Modulation tab. The
fifth, `Tone.StereoWidener`, is a mid/side stage between the Compressor and the Limiter — after the returns'
join in both Decay Modes — and becomes a Width sub-tab of Output, where Width 0 is a mono fold for a phone
speaker. Every parameter is a slider; the three LFO rates carry Free | Sync on the Phaser's rail,
generalised. A fresh world lights each motion pedal with its own odds, capped at two lit Modulation pedals
in all, quietly; by hand any pedal goes to full. Every value is a plain number (plus optional note values)
on `GlobalAudioSettings`, seeded through the loading-range rail, saved and shared whole, written to the
nodes only through `globalFx.ts` setters. No LFO or swell targets, nothing per robot, nothing on the gem.

### 1.1 Data shape

```ts
// src/types/globalAudio.ts
export interface ChorusSettings {
  rate: number;        // Hz, PEDAL_RATE_RANGE_HZ — Tone `frequency`; the Free value, read through resolveSyncedRateHz()
  delayTime: number;   // ms, 1–20 — the delay lines' centre
  depth: number;       // 0–1 — how far the LFOs move the delay
  spread: number;      // degrees, 0–180 — right LFO's phase offset from left
  feedback: number;    // 0–0.9 — Tone `feedback` Signal; above 0 the chorus is a flanger
  wet: number;         // 0–1, slider position; the node gets colourWetGain(wet)
  sync?: NoteValue;    // present = Sync. Never `sync: undefined`. docs/specs/FREE_SYNC_TOGGLE.md §1.1
}
export interface TremoloSettings { rate: number; depth: number; spread: number; wet: number; sync?: NoteValue; }
export interface VibratoSettings { rate: number; depth: number; wet: number; sync?: NoteValue; }
export interface FrequencyShifterSettings {
  shift: number;       // Hz, −1000–+1000, signed — Tone `frequency`
  wet: number;
}
export interface StereoWidenerSettings {
  width: number;       // 0–1 — Tone `width` Signal; 0.5 is unity, 0 is mono, 1 is all side
}

export interface GlobalAudioSettings {
  …
  phaser: PhaserSettings;
  /** Motion pedals, in chain order after the Phaser (docs/specs/GLOBAL_PEDALS.md §1.3). */
  chorus: ChorusSettings;
  tremolo: TremoloSettings;
  vibrato: VibratoSettings;
  frequencyShifter: FrequencyShifterSettings;
  /** Width stage between the Compressor and the Limiter, after the rooms' join (§1.3). */
  stereoWidener: StereoWidenerSettings;
  limiter: LimiterSettings;
}
export const PEDAL_RATE_RANGE_HZ = PHASER_RATE_RANGE_HZ;   // one range for every synced pedal rate
export const PEDAL_RATE_STEP_HZ = PHASER_RATE_STEP_HZ;
// DEFAULT_GLOBAL_AUDIO_SETTINGS gains assumption 10's five blocks. withGlobalAudioDefaults is unchanged.
```

`GlobalAudioSeedFieldKey` gains sixteen keys — `chorus.rate`, `chorus.delayTime`, `chorus.depth`,
`chorus.spread`, `chorus.feedback`, `chorus.wet`, `tremolo.rate`, `tremolo.depth`, `tremolo.spread`,
`tremolo.wet`, `vibrato.rate`, `vibrato.depth`, `vibrato.wet`, `frequencyShifter.shift`,
`frequencyShifter.wet`, `stereoWidener.width` — with rows in both range tables (assumptions 5 and 6; the
grid is the source of truth and both files transcribe it). `AudioRigEffectKey` gains the five block keys.

### 1.2 Seeding — `globalAudioSeed.ts`

```ts
export const PEDAL_LIT_EDGE: Record<'autoWah' | 'phaser' | 'chorus' | 'tremolo' | 'vibrato' | 'frequencyShifter', number> =
  { autoWah: 1 / 3, phaser: 1 / 3, chorus: 0.25, tremolo: 0.25, vibrato: 0.25, frequencyShifter: 0.15 };
export const MAX_LIT_PEDALS = 2;                      // across all six Modulation pedals (§ assumption 7)
export const PEDAL_SYNC_ODDS = 0.5;                   // PHASER_SYNC_ODDS stays exported as an alias
const MOTION_PEDALS = ['chorus', 'tremolo', 'vibrato', 'frequencyShifter'] as const;   // chain order

// after the existing autoWahLit / phaserLit rolls:
let lit = (autoWahLit ? 1 : 0) + (phaserLit ? 1 : 0);
const pedalLit = {} as Record<MotionPedal, boolean>;
for (const pedal of MOTION_PEDALS) {
  const roll = getUniformSeededVal(noiseMap, `globalAudio.${pedal}.lit`);   // read on every style
  const wants = roll < PEDAL_LIT_EDGE[pedal];
  pedalLit[pedal] = wants && lit < MAX_LIT_PEDALS;
  if (pedalLit[pedal]) lit += 1;
}
// per LFO pedal: syncMode and syncNote uniform draws, as the Phaser's (globalAudioSeed.ts:198–199);
// sync only when lit and syncModeT < PEDAL_SYNC_ODDS, the note from pickSeedNoteValue over the lit rate band.
// frequencyShifter: `globalAudio.frequencyShifter.sign` uniform draw → shift = sign × sampleField('frequencyShifter.shift', true).
// stereoWidener: width = sampleField('stereoWidener.width', true); no roll.
```

- **All sixteen field keys, the four lit rolls, the three sync pairs and the sign draw are read on every
  style**, lit, dark or capped, so the draw set never depends on the outcome and the oracle stays total.
- Every new draw is uniform (`sampleField(…, true)`, `getUniformSeededVal`), as 50.4 settled; every
  pre-existing field keeps its draw. The AutoWah, Phaser and Colour draws and keys are untouched.
- The two seed oracles (`globalAudioSeed.test.ts`) are amended **by hand**: five new blocks added to each,
  every existing value byte-identical. Never re-recorded.
- `GLOBAL_AUDIO_LOADING_RANGES` gains sixteen rows (the shifter's `shift` row is the magnitude band 2–20);
  `GLOBAL_CHAIN_GRID.md` gains sixteen rows and a footnote ⁵; `themes.md` gets one sentence on the new
  edges and the cap.

### 1.3 Engine — `globalFx.ts`

```ts
let _globalChorus: Tone.Chorus | null = null;
let _globalTremolo: Tone.Tremolo | null = null;
let _globalVibrato: Tone.Vibrato | null = null;
let _globalFrequencyShifter: Tone.FrequencyShifter | null = null;
let _globalStereoWidener: Tone.StereoWidener | null = null;

// buildGlobalFxChain, after the Phaser: each behind getToneCtor, wet 0 (width 0.5), Chorus and Tremolo .start()ed.
// wireGlobalFxChain:
const chainNodes = [_globalEQ, _globalLPF, _globalHPF, _globalDistortion, _globalChebyshev, _globalBitCrusher,
                    _globalAutoWah, _globalPhaser, _globalChorus, _globalTremolo, _globalVibrato, _globalFrequencyShifter,
                    _globalCompressor, _globalStereoWidener, _globalLimiter].filter(Boolean) …
const join = (controlledDecay ? (_globalStereoWidener ?? _globalLimiter) : _globalCompressor) ?? _globalLimiter ?? _globalCompressor;
```

- All five join `disconnectAllFxNodes`' list. An absent node (headless) is skipped by `filter(Boolean)` and
  the `??` chain, so the widener-less join falls back to the Limiter as today.
- **`setGlobalChorus(params: Partial<Omit<ChorusSettings, 'sync'>>)`** (the store resolves `rate` first):
  `rate` → `rampOrSet(node.frequency, …)`; `feedback` → `rampOrSet(node.feedback, …)`; `delayTime`, `depth`,
  `spread` → plain writes; `wet` → `rampOrSet(node.wet, colourWetGain(v), COLOUR_RAMP_SECONDS)`.
- **`setGlobalTremolo`**: `rate` → `node.frequency` ramp; `depth` → `node.depth` ramp; `spread` plain; `wet`
  tapered ramp. **`setGlobalVibrato`**: `rate` → `node.frequency` ramp; `depth` → `node.depth` ramp; `wet`
  tapered ramp. **`setGlobalFrequencyShifter`**: `shift` → `rampOrSet(node.frequency, …)`; `wet` tapered
  ramp. **`setGlobalStereoWidener`**: `width` → `rampOrSet(node.width, v, COLOUR_RAMP_SECONDS)`, no taper
  (0.5 must stay unity).
- Every value through `clampColour`; every setter null-guarded and try/caught like `setGlobalPhaser`; a
  constructor failure `devWarn`s and leaves the slot empty. No rebuild anywhere: nothing here is
  constructor-only except Vibrato's `maxDelay`, which is not exposed.
- `getGlobalModulationTarget` is unchanged (no pedal target). `AudioEngine.ts` re-exports the five setters
  beside `setGlobalPhaser`.

### 1.4 Store — `audioStore.ts`

- `GLOBAL_SETTER` gains `chorus`, `tremolo`, `vibrato` → `setGlobalRateResolved('chorus')` etc. (the
  `setGlobalPhaserResolved` shape generalised: read the block and `bpm` after the merge, strip `sync`, resolve
  `rate` through `resolveSyncedRateHz`), `frequencyShifter: AudioEngine.setGlobalFrequencyShifter`,
  `stereoWidener: AudioEngine.setGlobalStereoWidener`. `setGlobalPhaserResolved` becomes the factory's
  `'phaser'` instance.
- `applyGlobalAudioToEngine` pushes the five blocks after `phaser`, in chain order, rates resolved.
- `setPedalSyncMode(key: SyncedRateKey, synced: boolean)`: `syncedRateToSync` / `syncedRateToFree` at `bpm`,
  `set`, then push the resolved rate. `setPhaserSyncMode(synced)` stays as `setPedalSyncMode('phaser', synced)`.
- `reapplyTempoSyncedValues` loops `SYNCED_RATE_KEYS = ['phaser', 'chorus', 'tremolo', 'vibrato']` and
  re-pushes each block whose `sync` is a note value.
- `cancelSwellForGlobalField` is untouched (no pedal swell targets).

### 1.5 Tempo-sync helpers — `tempoSync.ts`

`SyncedRate = { rate: number; sync?: NoteValue }`. `resolveSyncedRateHz(field, bpm, range)` (Free or invalid
sync → `rate`; Sync → the note's Hz clamped into `range`); `allowedRateNoteValues(bpm, range)` =
`allowedNoteValues(bpm, range, 'hz').reverse()` (slowest → fastest); `syncedRateToSync<T extends SyncedRate>(field,
bpm, range): T` / `syncedRateToFree(field, bpm, range, step)` — whole new objects, a Free result carries no
`sync` key, Free → Sync snaps `rate` to the nearest allowed note, Sync → Free keeps the resolved Hz quantised
to `step` and floored at `range.min`. `resolvePhaserRateHz`, `allowedPhaserNoteValues`, `phaserToSync`,
`phaserToFree` become one-line wrappers with `PHASER_RATE_RANGE_HZ` / `PHASER_RATE_STEP_HZ`; their tests stay
green unchanged, which is the proof the generalisation is faithful.

### 1.6 UI — the sub-tabs

- `FLEET_PARAMS_SUBSECTIONS.modulation` gains `chorus`, `tremolo`, `vibrato`, `frequencyShifter` after
  `phaser`; `.output` gains `stereoWidener` between `compressor` and `limiter`. `FleetParamsScreen` needs no
  change beyond its tests (`SUB_TABBED` already lists both groups).
- Five `AUDIO_RIG_CONFIG` blocks: the four motion blocks after `phaser` and before `delay`, the widener
  block between `compressor` and `limiter`, `panelSchema(key, content, 'column')`, params in §1.1 order with
  assumption 5's types and ranges; no `lfoTarget` on any row. `AUDIO_RIG_EFFECT_TRAIT` maps the four to
  `spectral`, the widener to `output`.
- `AudioRigDrawer`'s `block.key === 'phaser'` branch becomes `SYNCED_RATE_BLOCKS.has(block.key)` for the
  four synced blocks: the `rate` row is a `TempoSyncSlider` (`freeValue = effect.rate`, `syncValue =
  globalAudio[key].sync`, `allowed = allowedRateNoteValues(bpm, PEDAL_RATE_RANGE_HZ)` memoised on `bpm`,
  `onModeChange = (synced) => setPedalSyncMode(key, synced)`, `onSyncChange` writes `{ sync }` through
  `setGlobalAudio(key, …)`); every other row goes through `paramRow`. The shifter's `shift` row is a
  `sliderCenteredZero`; the widener block is one `sliderLinear` row.
- `Trait`, `TRAIT_COLORS`, `FleetParamsGroup`, `SECTIONS` are untouched.

### 1.7 Content — `src/content/copy/fleet.ts`

New entries, placeholders in the copy-tone-guide's two voices (assumption 16): five heading entries
(`fleet.chorus`, `fleet.tremolo`, `fleet.vibrato`, `fleet.frequencyShifter`, `fleet.stereoWidener`) and
sixteen parameter entries with `help.human` and units where they apply (`Hz`, `ms`, `°`): `fleet.chorus.rate`
(its help explains Free and Sync the way `fleet.phaser.rate` does), `.delay`, `.depth`, `.spread`,
`.feedback`, `.mix`; `fleet.tremolo.rate`, `.depth`, `.spread`, `.mix`; `fleet.vibrato.rate`, `.depth`,
`.mix`; `fleet.frequencyShifter.shift`, `.mix`; `fleet.stereoWidener.width` (its help says 0 is mono for a
phone speaker, 0.5 is as recorded). `fleet.modulation`'s intro gains a sentence naming the four new pedals;
`fleet.output`'s intro gains one naming Width. `content.test.ts` and the ESLint rule keep literals out of
components.

### 1.8 Persistence and sharing

Nothing new is encoded: `globalAudio` already travels whole, `sync` is a string key already present on the
Delay and the Phaser. `withGlobalAudioDefaults` fills the five missing blocks at both call sites unchanged.
`sanitizePhaserSync` becomes `sanitizeSyncedRate` and `applySessionPayload` applies it to the four synced
blocks (an invalid note value is deleted, never written as `undefined`). `TRANSMISSION_PRESETS` gain the five
default blocks. `isValidCompactSessionPayload` stays shallow.

### 1.9 Load budget

No change unless §5's A/B shows a rise at Full or Standard. If it does, assumption 15's shape is built as a
conditional task, measured again, and recorded in `scratchy-audio-phones.md`.

---

## 2. Target File Structure

```text
src/
├── types/
│   └── globalAudio.ts                 five XSettings, PEDAL_RATE_RANGE_HZ / STEP, five keys, defaults (+ test)
├── data/
│   ├── globalAudioSeedRanges.ts       16 GlobalAudioSeedFieldKey rows (full ranges) (+ test)
│   ├── globalAudioLoadingRanges.ts    16 loading rows (+ test)
│   ├── audioRigConfig.ts              AudioRigEffectKey + five blocks (+ test: 17 blocks, 29 pedal params, no lfoTarget)
│   └── transmissionPresets.ts         five default blocks per preset
├── utils/
│   ├── tempoSync.ts                   SyncedRate + four generic helpers; Phaser helpers become wrappers (+ test)
│   ├── globalAudioSeed.ts             PEDAL_LIT_EDGE ×6, MAX_LIT_PEDALS, PEDAL_SYNC_ODDS, rolls, 16 draws (+ test: oracles by hand, calibration)
│   ├── sessionDiff.ts                 sanitizeSyncedRate on four blocks (+ test)
│   └── sessionShareUtils.test.ts      old link decodes with the five blocks at defaults
├── engine/
│   ├── audioEngine/globalFx.ts        five nodes, chain slots, widener join, disconnect list, five setters
│   └── AudioEngine.ts                 re-exports (+ test: node counts, chain order in both modes, join at the widener)
├── stores/
│   └── audioStore.ts                  GLOBAL_SETTER, setGlobalRateResolved factory, setPedalSyncMode, reapplyTempoSyncedValues, apply
├── components/panels/screen/
│   ├── screens/FleetParamsScreen.test.tsx   six Modulation sub-tabs, three Output sub-tabs
│   ├── nav/navActions.ts              FLEET_PARAMS_SUBSECTIONS (+ test)
│   └── console/AudioRigDrawer.tsx     AUDIO_RIG_EFFECT_TRAIT, SYNCED_RATE_BLOCKS branch (+ test)
├── content/copy/fleet.ts              five headings, sixteen params, two intro sentences
└── docs/globalPedalsDocs.test.ts      guard: symbols declared where the docs say, no gem read, no target, grid rows, living docs
docs/
├── intent/global-pedals.md            the intent
├── specs/GLOBAL_PEDALS.md             this file
├── tasks/GLOBAL_PEDALS.md             the plan (next phase)
├── reference/GLOBAL_CHAIN_GRID.md     chain-order line, 16 rows, footnote ⁵
├── AUDIO_SYSTEM.md                    Signal Graph + the pedals and the Width stage, the moved Controlled join
├── specs/FREE_SYNC_TOGGLE.md          one line: three more synced rates on the generic rail
├── SESSION_STORAGE.md                 one line: absent pedal keys load as defaults; four synced blocks sanitised
├── ideas/themes.md                    one sentence on the edges and the cap
├── todo/roadmap.md                    50.6 entry (status + as-built)
├── todo/backlog.md                    22 rewritten to the two room type radios, cites fixed
└── todo/scratchy-audio-phones.md      re-baseline + the 50.6 A/B
```

Conditional (only if the A/B asks): `src/constants/index.ts` (`LOAD_PEDALS_MIN`), `src/utils/audioBudget.ts`,
`src/systems/audioBudgetSystem.ts`, `src/components/debug/hudLines.ts`, `globalFx.setPedalsEnabled`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. Nothing per robot: no `Robot`, `CompanyOptionsSnapshot`,
  `RobotAudioOverrideDiff`, `spawnSystem.ts`, `AudioEngine.reserveVoice` or share codec key changes.
- **Five nodes, one instance each, on the global chain.** No per-robot pedal, no Bank or swell target on any
  pedal field, no new trait or section tab, no change to AutoWah's, Phaser's or Colour's draws beyond the cap
  reading their results, no room type radio, no new dependency.
- **Every AudioParam write lives in `globalFx.ts`**, called from `audioStore` actions,
  `applyGlobalAudioToEngine` or `reapplyTempoSyncedValues`, never from a GSAP callback or a React effect
  (Strict Separation).
- **State stays JSON-serialisable:** sixteen numbers and three optional note-value strings on
  `GlobalAudioSettings`; nodes are module state in `globalFx.ts`.
- **Zero display strings in components or configs** — every label, heading, unit and help line is a
  `src/content/` entry read through `labels()` / `introProps()`.
- **Replayability:** every lit roll, sync roll, sign draw and value comes from the seeded draws under
  `globalAudio.*` keys. The three LFO pedals' phases are wall-clock, the accepted class (backlog 17);
  nothing else is.
- **Nothing reaches the robot's body** (Visual Mapping guardrail) — the guard test scans the gem folder.
- **No "keep existing worlds the same" constraint** (pre-v1 rule). The seed oracles are amended by hand to
  add keys, and only to add keys.
- **This branch is docs-only for this phase.** No source file changes on `perf/per-mover-layers`.
- **Protected paths:** `.env*`, `node_modules/`, build output.

---

## 4. Code Style & Architecture Conventions

```ts
// src/engine/audioEngine/globalFx.ts — a pedal setter: Signals ramp, plain fields write, Mix tapered
export function setGlobalTremolo(params: Partial<Omit<TremoloSettings, 'sync'>>): void {
  const node = _globalTremolo;
  if (!node) return;
  try {
    const rate = clampIfGiven('tremolo.rate', params.rate);
    if (rate !== undefined) rampOrSet(node.frequency, rate, COLOUR_RAMP_SECONDS);
    const depth = clampIfGiven('tremolo.depth', params.depth);
    if (depth !== undefined) rampOrSet(node.depth, depth, COLOUR_RAMP_SECONDS);
    const spread = clampIfGiven('tremolo.spread', params.spread);
    if (spread !== undefined) node.spread = spread;
    const wet = clampIfGiven('tremolo.wet', params.wet);
    if (wet !== undefined) rampOrSet(node.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalTremolo failed', err);
  }
}
```

```ts
// src/utils/tempoSync.ts — the generic rail, with the Phaser as its first client
export function resolveSyncedRateHz(field: SyncedRate, bpm: number, range: { min: number; max: number }): number {
  if (!isNoteValue(field.sync)) return field.rate;
  return clamp(noteValueHz(field.sync, bpm), range.min, range.max);
}
export function resolvePhaserRateHz(phaser: PhaserSettings, bpm: number): number {
  return resolveSyncedRateHz(phaser, bpm, PHASER_RATE_RANGE_HZ);
}
```

- Names: settings interfaces `XSettings`; keys camelCase (`chorus`, `frequencyShifter`, `stereoWidener`);
  seed keys `block.field`; content keys `fleet.<block>.<param>`; constants `PEDAL_*` in the module that owns
  them.
- Comments cite this spec by section where a choice is not obvious from the code (the widener join, the
  always-running LFOs, the sequential cap, the hand-amended oracle, the shifter's downmixed sine branch).
- Tests colocated; TDD per task; one commit per task; the mutation harness run on each pure module.

---

## 5. Testing & Verification Requirements

**Unit (Vitest), per area:**

- `globalAudio.test.ts`: defaults carry the five blocks (`wet 0`, `width 0.5`); `withGlobalAudioDefaults`
  fills any missing block and leaves present ones untouched; a Free default has no `sync` key;
  `PEDAL_RATE_RANGE_HZ` is the Phaser's.
- Range tests: sixteen new rows in each table, loading inside full, every key in both; the shifter's loading
  row is a magnitude band inside the signed full range; the widener's loading band excludes 0.
- `tempoSync.test.ts`: the four generic helpers (Free / Sync / invalid sync; allowed list inside the range,
  slowest first; `toSync` snaps and keeps `rate`; `toFree` keeps the heard Hz, quantised, floored, no `sync`
  key); the existing Phaser tests pass unchanged against the wrappers.
- `globalAudioSeed.test.ts`: the two oracles with five blocks added by hand and nothing else moved (the
  existing `toStrictEqual` proves it); determinism; **calibration** over 3 000 styles: AutoWah and Phaser
  shares unchanged (33 ± 3 %); each motion pedal's **measured** lit share pinned within ±3 points of the
  value recorded in the test's comment (derived once, at the task); no style with more than
  `MAX_LIT_PEDALS` lit; the shifter's share the lowest; a lit LFO pedal synced within ±5 points of
  `PEDAL_SYNC_ODDS`, a dark one never; a dark pedal has `wet === 0` and a lit pedal's `wet` inside its band;
  `shift` never inside ±2 Hz and both signs present; `width` inside 0.4–0.65; Colour's shares unchanged.
- `audioRigConfig.test.ts`: seventeen blocks in grid order (the four motion blocks after Phaser and before
  Delay; the widener between Compressor and Limiter), 29 pedal param ids in all; each block's params, types,
  ranges and steps; `shift` is `sliderCenteredZero`; no `lfoTarget` on any pedal row.
- `AudioEngine.test.ts`: `buildGlobalFxChain` constructs exactly one of each (constructor counts) and calls
  `start()` on the Chorus and the Tremolo; `wireGlobalFxChain` in both modes places the four between Phaser
  and Compressor and the widener between Compressor and Limiter (connection-order assertion); under
  Controlled the returns join at the widener, under Natural at the Compressor; with the widener ctor missing
  the Controlled join falls back to the Limiter; with any ctor missing the chain still wires and its setter
  no-ops.
- `globalFx` setter tests: each setter writes its fields (Signals ramped, plain fields set, `wet` squared,
  `width` not squared), clamps (`shift` signed), ignores NaN, no-ops without a node.
- `audioStore.test.ts`: `setGlobalAudio('chorus', { sync })` reaches the engine with `rate` resolved and no
  `sync`; `setPedalSyncMode` converts both ways for each synced key and `setPhaserSyncMode` still works;
  `setBPM` re-pushes every synced pedal and leaves Free ones alone; `applyGlobalAudioToEngine` pushes all
  five blocks.
- `navActions` / `FleetParamsScreen` / `AudioRigDrawer` tests: six Modulation sub-tabs in chain order and
  three Output sub-tabs with Width in the middle, on both shells; breadcrumbs "Modulation / Chorus" and
  "Output / Width"; each synced block renders a `TempoSyncSlider` on its rate row and plain rows elsewhere;
  the shifter block renders a centred-zero slider; the widener block renders one row.
- `sessionDiff.test.ts` / `sessionShareUtils.test.ts`: a version-2 payload without the new keys restores and
  decodes with the defaults; a payload with a synced Chorus round-trips; an invalid `tremolo.sync` is
  dropped on restore and the Phaser's sanitiser still works.
- Presets test: every preset's `globalAudio` has the five blocks at their defaults.
- `src/docs/globalPedalsDocs.test.ts`: the named symbols are declared where this spec says; no file under
  the gem folder reads any of the five keys; none is a modulation or swell target; the grid has a row for
  every one of the sixteen fields, with its setter, in chain order (motion rows after the Phaser rows, the
  Width row after the Compressor rows); the living docs name them.
- `content.test.ts` and lint: no literal strings.

**Verification steps (every task):** `npm run build:types`, `npm run lint`, `npm test`, `npm run build`, all
clean. Mutation harness on `tempoSync.ts`, `globalAudioSeed.ts`, `globalAudio.ts`, the setters and
`audioBudget.ts` (if touched).

**Manual listen (Crawford, desktop):** a world per lit pedal, a capped world (two lit, a third wanted) and a
neither world, found by cycling seeds with the HUD's seed readout; each pedal from 0 to full by hand with no
click; **Width dragged 0.5 → 0 → 1 while a lit Delay plays — the fold must take the delay's stereo tail with
it**; each synced Rate Free → Sync → Free, then a Tempo change with Sync on; a Natural ↔ Controlled flip
keeps every pedal and the Width fold in both modes; the shifter at ±5 Hz and at ±500 Hz, on a world with
hard-panned robots as well as a centred one (assumption 3's sideband-leak veto); save, reload and share-link round trips
including a synced Chorus; an old `?session=` link loads with all five at defaults; keyboard and every "?".

**Phone gate (the series' "without distortion", done in full this time):**

1. **Re-baseline first.** Crawford's seed-`alpha` world (camera 0/50, all defaults) on current `main` (the
   50.5 chain), Pixel 8, `?debug`, Full 3:00 and Standard 3:00, HUD `underruns` at start and end recorded in
   `scratchy-audio-phones.md`. 50.3's and 50.4's T0 never ran, so this is the first measured baseline since
   Sends.
2. **One worst-case run on the branch**, same world, same lengths: all seven Modulation pedals at full Mix,
   the Phaser at 12 stages, Width at 1. Underrun counts at Full and at Standard, plus the desktop
   `npm run perf` before and after.
3. **Pass:** zero underruns at Full and no more than the re-baseline at Standard. **Bisect only on a miss:**
   the three LFO pedals one at a time at full Mix, then the shifter; a pedal that raises the count ships
   behind assumption 15's threshold and is measured again, or is withdrawn to backlog 22 as "tried, no".
   Recorded either way, with counts.

---

## 6. Git & Workflow Context

- **Docs on `perf/per-mover-layers`** (intent, this spec, the plan), by Crawford's instruction; no source
  changes there. **The build on `feature/palette-pedals` off `main`** (name is a proposal; Crawford creates
  branches, PRs and merges). The docs are carried over or cherry-picked when the build branch is cut.
- One commit per task, RED first, imperative subject, no conventional-commit prefix. Co-author line per the
  session reminder.
- Docs, the roadmap 50.6 entry and the backlog 22 rewrite land in the final docs task, which turns the
  guard test's docs cases green.
- Repo index is LF; `docs/` working copies are mixed. This spec and the intent are CRLF to match their
  siblings; edit existing files in their own endings (backlog CRLF, roadmap LF).

---

## 7. Open Questions & Risks

1. **The shifter on panned voices (assumption 3):** the Vibrato keeps the stereo image (it was first
   written down as mono; corrected 2026-10-18), so the slot order no longer has a mono question. The open
   item is the shifter: on a hard-panned voice it leaks its other sideband at a third of the wanted one and
   puts a quarter-level copy in the far channel. The desktop listen on a panned world decides whether that
   is the backlog's "strange" or a fault; the levers are its lit share and its band.
2. **The cap (assumption 7):** sequential in chain order (AutoWah and Phaser keep first claim, oracles
   untouched) or a pick of up to two from six (equal standing, oracles move)? Sequential is proposed.
3. **Odds (assumption 7):** 0.25 / 0.25 / 0.25 / 0.15 nominal, measured lower under the cap. The
   calibration test pins whatever the measurement gives; a theme is the lever afterwards.
4. **Lit bands (assumption 6)** are placeholders for the listen, as 50.4's were. The shifter's ±2–20 Hz
   is the one most likely to move: a few Hz is a slow beating, twenty is already inharmonic.
5. **Always-running LFOs (assumption 4):** three idle LFOs cost something; if the worst-case run misses and
   the bisect blames an idle LFO, the alternative is `stop()` at Mix 0 and `start()` on the first non-zero
   Mix, inside the setter.
6. **Widener join (assumption 2):** moving the Controlled-Decay join from the Limiter to the widener is the
   one change to existing wiring. The AudioEngine chain-order test pins it in both modes.
7. **`sliderCenteredZero` for `shift`:** the primitive exists for the robot's detune; its first global use.
   If it needs a different step at the extremes, a `sliderLinear` with a signed range is the fallback.
8. **Presets (assumption 10):** clean, unless Crawford wants a preset with a pedal.
9. **Lore words (assumption 16)** are placeholders until Crawford's copy pass.
10. **Phone cost:** two LFOs and two delay lines with feedback for the Chorus; two LFOs and two Gains for
    the Tremolo; one LFO and one delay for the Vibrato; a sine/cosine pair, two multipliers and a Hilbert
    approximation for the shifter; four Gains for the widener. Cheap by inspection; the gate decides.
11. **Roadmap number (assumption 17):** 50.6, under the series umbrella, rather than a new top-level entry.
    The file's last top-level entry is 52 on this branch and 53 is the per-mover layers phase, so a top-level entry would be 54.

---

## 8. As built

*(Started 2026-10-18 during Phase 1; the docs task, T17, completes this section.)*

- **The cycle-search cuts (a fix found at Checkpoint A, approved by Crawford 2026-10-18).** After T8 the app hung on
  power-on: the Power button kept flashing and the main thread never returned. Cause: Tone's `standardized-audio-context`
  runs `detectCycles` on every `connect` and `disconnect`, enumerating every simple path downstream of the destination
  (no memoising) and stopping only at a node with a `delayTime`. Each Tone effect has a dry and a wet path and the
  stereo and mid/side ones split again, so the path count multiplies per stage. Measured in headless Chrome over CDP
  (power-on, then a Decay flip, a Phaser Stages change and linking all seven global LFOs): `main`'s chain powered on in
  2.8-4.8 s with 1.5-3 s unresponsive; each new node alone multiplied that (Chorus x2, Tremolo x3, Vibrato x2, shifter
  x2, widener x12), so all five came to an estimated ~14 minutes. **Fix, in `globalFx.ts`:** two zero-delay `Tone.Delay`
  nodes (`CHAIN_CUT_OPTIONS`, `maxDelay` 0.01 s) in the dry chain, one at its entry (`getGlobalChainEntry()` returns it;
  every robot bus connects into it) and one between the High-Pass Filter and the Distortion (where the global LFO targets
  end), and `disconnectAllFxNodes` walks the chain downstream-first. Neither cut is in a cycle, so a delay of 0 passes the
  sound unchanged. Result with all five pedals: power-on about 2 s with no unresponsive time, a Decay flip 3-4 ms, a Phaser
  Stages change about 40 ms, linking all seven global LFOs 1 ms (an entry cut alone left a Decay flip at 2.6 s and the
  seven links at 8.1 s). The chain-order line is therefore entry cut -> EQ3 -> LPF -> HPF -> filter cut -> Distortion ->
  ...; with no `Delay` constructor (headless) the chain enters at the EQ3 as before. The two nodes are on T14's phone
  gate like everything else.
- **The Vibrato is stereo; the shifter is half mono (found in the 2026-10-18 review, measured the same day).** §1 and
  assumption 3 first said both were mono `Effect`s that sum the chain. Tone's `Effect` is gains and a crossfade, and the
  Vibrato is one LFO on one `Delay`, so it delays left and right alike. The shifter's sine branch is negated into
  `Add.addend`, an AudioParam, so that branch is downmixed to mono (`0.5·(L+R)`) while the cosine branch stays stereo.
  Measured with an offline Tone render in headless Chrome (a 440 Hz sine on the LEFT channel only, each node at wet 1,
  amplitude per tone by Goertzel): Chorus, Tremolo and Vibrato leave the right channel at exactly 0; the shifter at
  +100 Hz gives left 540 Hz 0.75 and 340 Hz 0.25 (the sideband it should cancel), right 540 Hz 0.25 and 340 Hz 0.25.
  With the same sine on both channels it is clean: 540 Hz 1.0, 340 Hz 0.003. So a centred voice shifts as designed and
  a panned one (Robot Pan) leaks; the veto in assumption 3 and §7 Q1 was rewritten around that. No code changed.
- **The Phaser's wrappers are gone (2026-10-18 review).** §1.4, §1.5 and T3/T7/T8 kept `resolvePhaserRateHz`,
  `allowedPhaserNoteValues`, `phaserToSync`, `phaserToFree`, `setPhaserSyncMode` and the `PHASER_SYNC_ODDS` alias as
  one-line wrappers so the Phaser's existing tests could prove the generic rail faithful. With that proved and no caller
  left outside tests, all six were deleted: the Phaser calls `resolveSyncedRateHz` / `allowedRateNoteValues` /
  `syncedRateToSync` / `syncedRateToFree` over `PEDAL_RATE_RANGE_HZ` like the other three, the drawer and the tests call
  `setPedalSyncMode('phaser', …)`, and the seeder's Phaser roll reads `PEDAL_SYNC_ODDS`. The Phaser's own test cases were
  kept and now drive the generic helpers on a `PhaserSettings` object.
- **One name for the shared rate range (2026-10-18 review).** Assumption 5 made `PEDAL_RATE_RANGE_HZ` /
  `PEDAL_RATE_STEP_HZ` re-exports of the Phaser's `PHASER_RATE_RANGE_HZ` / `PHASER_RATE_STEP_HZ`, so the same constant
  had two names and the Phaser's rig row used the old one beside three rows using the new. The values (0.05–10 Hz,
  step 0.05) are now declared once as `PEDAL_RATE_*` in `src/types/globalAudio.ts` and the `PHASER_RATE_*` names are
  gone from `src`.
- **The Chorus's Delay and Depth ramp; they no longer click (2026-10-18 review, measured 2026-10-19).** §1.3 wrote
  `delayTime` and `depth` through Tone's plain setters. Those write each LFO's range as an instant Signal step
  (`Scale._setRange`), which jumps the delay's read position. Offline render, a 440 Hz sine through a wet Chorus, metric
  = the peak second difference in the 150 ms after a change divided by the steady state's (1 = smooth): one 0.5 ms Delay
  step x217, one 0.01 Depth step x13, a 5° Spread step x65-81 at every timing tried; the ramped Rate and Tremolo Depth
  (controls) x1; Tremolo Spread x1 at four of five timings and x8.9 at one. `rampChorusSweep` in `globalFx.ts` now ramps
  the same range (centre d, deviation d·depth) on both LFOs' Scale Signals (`_add`, `_mult`) over `COLOUR_RAMP_SECONDS`,
  measured x1 for both the Delay and the Depth step, and keeps Tone's stored fields in step; when those Tone internals
  are missing it falls back to Tone's setters. Tone floors the range at 0; Depth is clamped to 0–1 first, so the floor
  could never bite and was left out (an equivalent mutant). Both Spreads still write through Tone's `phase` setter,
  which restarts the LFOs (see §7).
- **A tripwire for the cuts (2026-10-18 review).** The cuts depend on two facts about `standardized-audio-context`
  (25.3.77 under Tone 15.1.22): `detectCycles` walks every path with no memo, and stops at any node with a `delayTime`.
  `src/engine/audioEngine/chainCycleSearch.test.ts` drives the library's real `createDetectCycles` over fake
  split-and-rejoin graphs and pins both (ten stages cost over 2^10 expansions; a connect into a delay node expands
  none; a mid-chain cut bounds the walk), so an upgrade that changes either fails the suite instead of hanging power-on.
  Mutation-checked by breaking the library's delay guard (two cases fail). If it fails, re-measure power-on before
  keeping or removing the cuts.
