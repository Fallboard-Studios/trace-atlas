# Phase Spec: Global Colour — Distortion, Chebyshev and BitCrusher on the Global Chain

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Main-thread check (§5): `npm run perf`
> - Phone gate (§5): the `?debug` HUD on the Pixel, seed `alpha`, Standard and Full

Source of intent: [docs/intent/global-colour.md](../intent/global-colour.md) (confirmed 2026-10-14, six
questions; one guess overturned — one saturator became both, and 50.4's "one of the two" became both).
Roadmap slot: **50.3** ([roadmap.md](../todo/roadmap.md#503-global-colour-saturation-and-bitcrusher)); its
text is superseded wherever this spec differs (notably: all three nodes ship, oversampling is never exposed,
and the seeded default is a per-world *character*, not a flat band). Branch: `feature/palette-colour`, off
`main` (name is a proposal; Crawford creates it). 50.1 and 50.2 are merged, so the chain already has the
send/return rooms this spec builds beside.

Survey basis (2026-10-14, against `main` at `afdcb2d8`; every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:57`) constructs
  Compressor, Reverb, FeedbackDelay, EQ3, LPF, HPF, Limiter, the two return gains and `masterGain`, every
  optional node behind `getToneCtor` (`toneHelpers.ts:33`), then calls `wireGlobalFxChain(false)` (`:114`).
  `wireGlobalFxChain` (`:167`) calls `disconnectAllFxNodes` (`:123`, a literal node list), builds the dry
  chain from one array `[_globalEQ, _globalLPF, _globalHPF, _globalCompressor, _globalLimiter]`
  (`:170`), connects the rooms' returns to the Compressor (Natural) or the Limiter (Controlled) (`:201`),
  then `connectTapsIfWanted()`. The dry chain is identical in both Decay Modes; only the join moves.
- **How a global field flows.** `GlobalAudioSettings` + `DEFAULT_GLOBAL_AUDIO_SETTINGS`
  (`src/types/globalAudio.ts:77/:93`) → `GLOBAL_SETTER` and `applyGlobalAudioToEngine`
  (`src/stores/audioStore.ts:82–114`, every effect key dereferenced directly) → a `setGlobalX` in
  `globalFx.ts` (`setGlobalLimiter` `:487` is the minimal shape; `setGlobalReverb` `:410` shows a
  `wet` write). `AudioRigEffectKey` (`src/data/audioRigConfig.ts:29`) names the seven blocks of
  `AUDIO_RIG_CONFIG` (`:65`), each `{ key, panel, params }` rendered by `AudioRigEffectPanel`
  (`AudioRigDrawer.tsx:183`) with its trait from `AUDIO_RIG_EFFECT_TRAIT` (`:57`).
  `audioRigConfig.test.ts:49` pins "one block per effect, in GLOBAL_CHAIN_GRID.md row order".
- **Seeding.** `generateGlobalAudioSettings` (`src/utils/globalAudioSeed.ts:95`) draws every field with
  `sampleField(noiseMap, key)` (`:51`): `getSeededVal(noiseMap, 'globalAudio.<key>', 0, 0, 1)` scaled
  into `GLOBAL_AUDIO_LOADING_RANGES[key]` on `GLOBAL_AUDIO_SEED_RANGES[key].scale`, quantised to the full
  range's `step`. Draws are keyed by `dataId`, so adding a draw moves no existing value — the Sends
  oracle amendment (`globalAudioSeed.test.ts:841–855`) is the precedent: hand-add keys, never re-record.
  The seed-time rolls that pick a mode (`DELAY_SYNC_ODDS` `:76`, `LFO_QUIET_THRESHOLD` `:162`) are
  one `getSeededVal` under a threshold; the Sends work measured that one draw is bell-curved, so a nominal
  threshold does not give its nominal share (`docs/AUDIO_SYSTEM.md` §Sends: 0.25 → ~17–18 %).
- **Tabs.** `FleetParamsGroup` (`src/stores/uiStore.ts:19`, five ids, `DEFAULT_FLEET_PARAMS_SECTION =
  'lfoBank'` `:142`); `SECTIONS` with a trait per group (`FleetParamsScreen.tsx:23–27`), `SUB_TABBED`
  (`:96`), `subTabItems` rendering `AudioRigEffectPanel` for any `AudioRigEffectKey` (`:83–93`);
  `FLEET_PARAMS_SUBSECTIONS` and `FLEET_PARAMS_GROUP_CONTENT` (`navActions.ts:78–113`);
  `SelectedFleetParamsEffect = AudioRigEffectKey | …` (`uiStore.ts:39`). `FleetParamsScreen.test.tsx:99`
  pins "the five groups in order, each trigger in its trait colour".
- **Traits.** `Trait` is seven ids (`src/types/traits.ts:7`), `TRAIT_IDS` pinned at exactly 7
  (`traits.test.ts:5`), `TRAIT_COLORS` (`src/utils/traitColors.ts:44`) with a comment recording which
  accent hues are free: tangerine, yellow and red (`:30–34`).
- **Persistence.** `SessionPayload.globalAudio: GlobalAudioSettings` whole (`src/types/session.ts:74`),
  compact `g` whole (`sessionShareUtils.ts:320/:378`), validated only as "is an object" (`:354`).
  `applySessionPayload` (`sessionDiff.ts:528`) spreads `payload.globalAudio` and calls
  `applyGlobalAudioToEngine`. A legacy-field stripper already exists at `:470` (`delete
  globalAudio.lfoDrift`). `TRANSMISSION_PRESETS` (`src/data/transmissionPresets.ts:404`) carry three full
  `GlobalAudioSettings` literals (`:41`, `:160`, `:290`), read by `OffScreen.tsx`.
- **Load budget.** `effectsLoadToLimits` (`src/utils/audioBudget.ts:78`) returns three booleans;
  `audioBudgetSystem.applyLfoTiers` (`:103`) acts on them; the HUD tier line is in
  `src/components/debug/hudLines.ts`.
- **Tone 15.1.22.** `Distortion` — `distortion` 0–1 (a plain setter that rebuilds a WaveShaper map),
  `oversample`, `wet` (an `Effect` crossfade Signal). `Chebyshev` — `order` integer (plain setter,
  rebuilds the map; Tone documents 1–100; 1 = no change; odd and even orders differ), `oversample`,
  `wet`. `BitCrusher` — `bits` a `Param` 1–16, `wet`; implemented as a `ToneAudioWorklet`
  (`BitCrusher.worklet.js`): the node constructs synchronously, registers its processor through
  `context.addAudioWorkletModule`, and connects `input → worklet → output` in `onReady`. The first
  worklet in this app.
- **Copy.** Group entries `fleet.eqFilters` / `fleet.timeSpace` / `fleet.output` (`src/content/copy/fleet.ts:68/:165/:218`)
  carry `human`, `lore` and an `intro` with a lore line, a lore description and an HTML human description.
  Effect entries carry `heading` (`fleet.limiter` `:275`); parameter entries carry `unit` and `help`.

ASSUMPTIONS I'm making beyond the intent's six decisions (correct now or I'll proceed with these):

1. **A single seeded *character* draw, not three independent quiet rolls.** The intent's outcome is "most
   worlds light one node, a few light two, a share stay clean". Three independent rolls cannot deliver
   it: at any per-node odds `p` the one-node share is `3p(1−p)²`, which peaks at 44 % (`p = ⅓`) with
   30 % clean and 22 % two-node. One draw, `globalAudio.colour.character`, split into weighted bands
   (clean / Distortion / Chebyshev / BitCrusher / three two-node pairs) gives the shape asked for and is
   calibrated by measurement. The intent's words ("each node has its own quiet roll") are superseded by
   this mechanism; the outcome is unchanged. §1.2.
2. **Target shares: clean 25 %, one node 60 % (20 % each), two nodes 15 % (5 % per pair), three nodes
   never.** Placeholders for Crawford's listen; the band edges are set by measuring the draw over seeds
   (§5), not by nominal fractions.
3. **Signal order inside the slot: Distortion → Chebyshev → BitCrusher.** Saturate, fold, then crush, so
   the crusher's staircase is the last thing applied and is not smeared by a shaper after it. Between HPF
   and Compressor in `chainNodes`, so both Decay Modes get it from the one array. §1.3.
4. **The rooms stay uncoloured.** Reverb and Delay are fed from each robot's bus and rejoin at the
   Compressor or Limiter, after the colour slot, so a crushed world has clean tails. That is what "before
   the Decay stage" means today and it keeps the 50.2 topology untouched. A listening item in §7.
5. **Field names.** `GlobalAudioSettings.distortion: { amount, wet }`, `chebyshev: { order, wet }`,
   `bitCrusher: { bits, wet }`. `amount` rather than Tone's `distortion.distortion` for readability; the
   grid's Param column records the Tone name beside it.
6. **Ranges (full / UI).** `distortion.amount` 0–1 step 0.01; `chebyshev.order` 1–8 step 1 (Tone allows
   100; above ~8 it is noise, not colour); `bitCrusher.bits` 1–16 step 1 (**stepped** — a bit depth is an
   integer by concept, and the integer steps are the sound); every `wet` 0–1 step 0.01.
7. **Loading bands when a node is lit (placeholders, tuned by ear):** `distortion.amount` 0.1–0.35,
   `distortion.wet` 0.25–0.5; `chebyshev.order` 2–5, `chebyshev.wet` 0.15–0.4; `bitCrusher.bits` 6–10,
   `bitCrusher.wet` 0.15–0.4. An **unlit** node seeds `wet = 0` and its shape parameter from the same band
   anyway, so a hand nudge of Mix hears something at once rather than an inert default.
8. **Defaults (`DEFAULT_GLOBAL_AUDIO_SETTINGS`) and the three transmission presets: every `wet` 0,
   `amount` 0.3, `order` 2, `bits` 8.** The presets are hand-written worlds, not seeds; they stay clean
   unless Crawford wants colour on one.
9. **Trait: an eighth, `colour`, red + tangerine.** The three freed hues are red, tangerine and yellow;
   red/tangerine reads hot beside Output's burnt orange/orange without clashing (both pairs are warm, but
   the Colour tab sits next to Output in the chain, so a related family is honest). Known history: tangerine and
   yellow were dropped from Seed as "too intense once actually seen" (`traitColors.ts:28`), so this pair is
   checked in the app before the task that lands it. `TRAIT_IDS` becomes
   8 and its test moves with it. Veto point: reuse `output` instead (then the tabs share a colour and the
   "each trigger in its trait colour" test needs no new trait).
10. **Tab order: Pacing, LFO Bank, EQ & Filters, Time & Space, Colour, Output.** Chain order; the
    intent said "beside Output" and this puts it on the chain side of it.
11. **Old payloads load with defaults, by one helper.** `withGlobalAudioDefaults(partial)` in
    `src/types/globalAudio.ts` fills any missing effect key from `DEFAULT_GLOBAL_AUDIO_SETTINGS`, called
    in `applySessionPayload` and `fromCompactSessionPayload`. Payload `version` stays 2: an absent key is a
    default, which is the convention every field since v1 follows.
12. **No Effects Limit threshold unless the A/B asks for one.** If it does, the shape is fixed now:
    `LOAD_COLOUR_MIN` in `constants/index.ts`, a fourth boolean `colourEnabled` on `EffectsLoadLimits`,
    and `globalFx.setColourEnabled(false)` that holds the BitCrusher's `wet` at 0 (the worklet is the
    suspect; the two WaveShapers stay). Stored settings are never touched by the tier, as with the LFO
    tiers.
13. **Edits ramp.** `wet` and `bits` are Signals/Params and take `rampOrSet(…, 0.05)`; `amount` and
    `order` are plain setters that rebuild a 1024-point map synchronously (cheap) and are set directly.
    Nothing is LFO-able this phase; `amount` and `order` can never be (not Signals).
14. **Lore words are placeholders.** Tab "Colour" / lore "Signal Grain"; Distortion → human "Drive",
    lore "Carrier Bleed"; Chebyshev → human "Harmonics", lore "Overtone Fold"; BitCrusher → human "Bit
    Crush", lore "Quantise Loss"; each node's `wet` is "Mix". Headings in the grid's capitals style.
15. **The 50.4 roadmap text changes with this phase's docs task**, to "ships both", and nothing else of
    50.4 is touched.

---

## 1. Overview & Claude Explanation

Three single-instance colour effects join the global dry chain between the High-Pass Filter and the
Compressor: `Tone.Distortion`, `Tone.Chebyshev` and `Tone.BitCrusher`, in that order, each with its own
shape parameter and its own `wet` mix, each a block on a new **Colour** section tab of Fleet Params. A
fresh world draws one colour *character* from its seed — clean, one node lit low, or rarely two — so
worlds differ from each other in grain and none is more than a little degraded. By hand any node goes to
full. Every parameter is a plain number on `GlobalAudioSettings`, seeded through the same loading-range
rail as every other global field, saved and shared whole, and written to the nodes only through
`globalFx.ts` setters. No oversampling, no LFO or swell targets, nothing per robot, nothing on the gem.

### 1.1 Data shape

```ts
// src/types/globalAudio.ts
export interface DistortionSettings { amount: number; wet: number }   // amount 0–1 (Tone `distortion`)
export interface ChebyshevSettings  { order: number;  wet: number }   // order 1–8 integer
export interface BitCrusherSettings { bits: number;   wet: number }   // bits 1–16 integer

export interface GlobalAudioSettings {
  …
  filterHPF: FilterSettings;
  /** Colour slot, in chain order (docs/specs/GLOBAL_COLOUR.md §1.3). */
  distortion: DistortionSettings;
  chebyshev: ChebyshevSettings;
  bitCrusher: BitCrusherSettings;
  limiter: LimiterSettings;
}
// DEFAULT_GLOBAL_AUDIO_SETTINGS gains: distortion { amount: 0.3, wet: 0 }, chebyshev { order: 2, wet: 0 },
// bitCrusher { bits: 8, wet: 0 }.

/** Any effect key a payload lacks is the default: a session or share link saved before a block existed loads
 *  with that block dry, never crashing applyGlobalAudioToEngine. */
export function withGlobalAudioDefaults(partial: Partial<GlobalAudioSettings>): GlobalAudioSettings;
```

`GlobalAudioSeedFieldKey` (`globalAudioSeedRanges.ts`) gains six keys — `distortion.amount`,
`distortion.wet`, `chebyshev.order`, `chebyshev.wet`, `bitCrusher.bits`, `bitCrusher.wet` — with rows in
both range tables (assumptions 6 and 7; the grid is the source of truth and both files transcribe it).
`AudioRigEffectKey` gains `distortion | chebyshev | bitCrusher`.

### 1.2 Seeding — `globalAudioSeed.ts`

One draw picks the character; six `sampleField` draws supply values; the character decides which `wet`s
survive:

```ts
const t = getSeededVal(noiseMap, 'globalAudio.colour.character', 0, 0, 1);
const character = pickColourCharacter(t);   // one of COLOUR_CHARACTERS, by COLOUR_CHARACTER_BANDS
const lit = COLOUR_CHARACTER_NODES[character]; // e.g. 'crush' → ['bitCrusher'], 'clean' → []
distortion: { amount: sampleField(noiseMap, 'distortion.amount'),
              wet: lit.includes('distortion') ? sampleField(noiseMap, 'distortion.wet') : 0 },
…
```

- `COLOUR_CHARACTERS = ['clean', 'drive', 'fold', 'crush', 'driveFold', 'driveCrush', 'foldCrush']`.
  `COLOUR_CHARACTER_BANDS` are cumulative upper edges on `t`, **set by measurement** (§5 calibration
  test) so the realised shares over many seeds land on assumption 2's targets within ±3 points. Nominal
  edges (0.25 / 0.45 / 0.65 / 0.85 / 0.90 / 0.95 / 1) are the starting point, not the answer.
- The shape parameter of an unlit node is still drawn (assumption 7) so every draw key is read on every
  seed and the oracle stays total.
- No existing key or draw order changes. The two seed oracles (`globalAudioSeed.test.ts`) are amended **by
  hand**: the three new blocks are added to each, every existing value stays byte-identical, and the
  comment block records the amendment the way the Sends one does. Never re-recorded.
- `GLOBAL_AUDIO_LOADING_RANGES` gains six rows; `docs/reference/GLOBAL_CHAIN_GRID.md` gains six rows plus
  a Colour paragraph in the chain-order line; `docs/ideas/themes.md` gets one sentence that a theme can
  swap the character bands and the lit bands.

### 1.3 Engine — `globalFx.ts`

```ts
let _globalDistortion: Tone.Distortion | null = null;
let _globalChebyshev:  Tone.Chebyshev  | null = null;
let _globalBitCrusher: Tone.BitCrusher | null = null;

// buildGlobalFxChain, after the filters:
const DistortionCtor = getToneCtor<Tone.Distortion>('Distortion');  // etc.
if (DistortionCtor) _globalDistortion = new DistortionCtor({ distortion: 0.3, oversample: 'none', wet: 0 });
if (ChebyshevCtor)  _globalChebyshev  = new ChebyshevCtor({ order: 2, oversample: 'none', wet: 0 });
if (BitCrusherCtor) { try { _globalBitCrusher = new BitCrusherCtor({ bits: 8, wet: 0 }); } catch { _globalBitCrusher = null; } }

// wireGlobalFxChain:
const chainNodes = [_globalEQ, _globalLPF, _globalHPF, _globalDistortion, _globalChebyshev, _globalBitCrusher,
                    _globalCompressor, _globalLimiter].filter(Boolean) …
```

- The three join `disconnectAllFxNodes`' list. An absent node (headless, or a worklet that fails to
  construct) is simply skipped by the existing `filter(Boolean)`, so the chain never breaks.
- `oversample` is set to `'none'` explicitly on both shapers and never read from state.
- Setters: `setGlobalDistortion({ amount?, wet? })`, `setGlobalChebyshev({ order?, wet? })`,
  `setGlobalBitCrusher({ bits?, wet? })`, each null-guarded and try/caught like `setGlobalLimiter`.
  `amount` → `node.distortion = v`; `order` → `node.order = Math.round(v)`; `wet` → `rampOrSet(node.wet,
  v, 0.05)`; `bits` → `rampOrSet(node.bits, v, 0.05)`.
- **Worklet readiness.** `Tone.BitCrusher` constructs synchronously and wires its processor on
  `addAudioWorkletModule`'s promise. Until then its wet path is open (no sound through it) and its dry path
  is intact, so at `wet = 0` nothing changes and at `wet > 0` the crushed share is briefly absent — a
  fraction of a second at boot, before the first note. Nothing waits on it; `AudioEngine.start` is not
  changed. If a browser refuses worklets, the constructor throws and the slot is skipped.
- `getGlobalModulationTarget` is unchanged (no colour target).

### 1.4 Store — `audioStore.ts`

`GLOBAL_SETTER` gains the three setters; `applyGlobalAudioToEngine` pushes the three blocks after the
filters. `EffectKey` follows `GlobalAudioSettings` automatically. `cancelSwellForGlobalField` is untouched
(no colour swell targets).

### 1.5 UI — the Colour tab

- `FleetParamsGroup` gains `'colour'` between `'timeSpace'` and `'output'`; `SECTIONS` in
  `FleetParamsScreen.tsx` gains `['colour', 'colour']`; `SUB_TABBED` gains it; `FLEET_PARAMS_SUBSECTIONS.colour
  = [distortion, chebyshev, bitCrusher]`; `FLEET_PARAMS_GROUP_CONTENT.colour = 'fleet.colour'`.
  `DEFAULT_FLEET_PARAMS_SECTION` stays `'lfoBank'`.
- Three `AUDIO_RIG_CONFIG` blocks, in grid order after `filterHPF` and before `compressor`:
  Distortion (Drive `sliderLinear` 0–1 step 0.01; Mix `sliderLinear` 0–1 step 0.01), Chebyshev (Harmonics
  `sliderLinear` 1–8 step 1; Mix), BitCrusher (Bit Crush `sliderLinear` 1–16 step 1; Mix). No `lfoTarget`
  on any row. `AUDIO_RIG_EFFECT_TRAIT` maps all three to `'colour'`. `AudioRigEffectPanel` renders them
  with no special-casing (it has `isFilterBlock` / `isDelay` branches; none is needed here).
- `Trait` gains `'colour'`; `TRAIT_COLORS.colour = [ACCENT_COLORS.red, ACCENT_COLORS.tangerine]`
  (assumption 9). Any `Record<Trait, …>` elsewhere is found by the compiler.
- Breadcrumb and nav tree pick the new group up from `FLEET_PARAMS_SUBSECTIONS` / `FLEET_PARAMS_GROUP_CONTENT`
  as they do the others. (There is no `asFleetParamsGroup` parser despite a comment naming one in `uiStore.ts:16`;
  nothing parses a group id from outside the store.)

### 1.6 Content — `src/content/copy/fleet.ts`

New entries, all placeholders in the copy-tone-guide's two voices (assumption 14): `fleet.colour`
(group: human, lore, intro with an HTML human description covering the three effects, like
`fleet.eqFilters`), `fleet.distortion` / `fleet.chebyshev` / `fleet.bitCrusher` (heading entries), and the
six parameter entries with `help.human`: `fleet.distortion.drive`, `fleet.distortion.mix`,
`fleet.chebyshev.harmonics`, `fleet.chebyshev.mix`, `fleet.bitCrusher.bits` (unit `bits`),
`fleet.bitCrusher.mix`. The "degraded transmission" frame carries the lore. `src/content/content.test.ts`
and the ESLint rule keep literals out of components.

### 1.7 Persistence and sharing

Nothing new is encoded: `globalAudio` already travels whole. The only change is defaulting on the way in
(assumption 11): `applySessionPayload` and `fromCompactSessionPayload` pass `globalAudio` through
`withGlobalAudioDefaults`. `isValidCompactSessionPayload` is unchanged. `TRANSMISSION_PRESETS` gain the
three default blocks (assumption 8) so they type-check and load clean. `computeSessionDiff`'s global
swell-base capture (`applyGlobalSwellBasesToAudio`) is untouched (no colour swell targets).

### 1.8 Load budget

No change unless §5's A/B shows a rise at Full or Standard. If it does, assumption 12's shape is built as
a conditional task, measured again, and recorded in `scratchy-audio-phones.md`.

---

## 2. Target File Structure

```text
src/
├── types/
│   ├── globalAudio.ts                 three settings interfaces, three keys, defaults, withGlobalAudioDefaults
│   └── traits.ts                      'colour' trait (+ traits.test.ts: 8)
├── data/
│   ├── globalAudioSeedRanges.ts       six GlobalAudioSeedFieldKey rows (full ranges)
│   ├── globalAudioLoadingRanges.ts    six loading rows
│   ├── audioRigConfig.ts              AudioRigEffectKey + three blocks (+ test: grid order, params)
│   └── transmissionPresets.ts         three default colour blocks per preset
├── utils/
│   ├── globalAudioSeed.ts             character draw, COLOUR_CHARACTER_*, six sampleField draws (+ test: oracles by hand, calibration)
│   ├── traitColors.ts                 TRAIT_COLORS.colour
│   ├── sessionDiff.ts                 withGlobalAudioDefaults at restore (+ test)
│   └── sessionShareUtils.ts           withGlobalAudioDefaults at decode (+ test)
├── engine/audioEngine/
│   └── globalFx.ts                    three nodes, chain slot, disconnect list, three setters (+ AudioEngine.test: global node count)
├── stores/
│   ├── audioStore.ts                  GLOBAL_SETTER, applyGlobalAudioToEngine
│   └── uiStore.ts                     FleetParamsGroup 'colour'
├── components/panels/screen/
│   ├── screens/FleetParamsScreen.tsx  SECTIONS, SUB_TABBED (+ test: six groups)
│   ├── nav/navActions.ts              FLEET_PARAMS_SUBSECTIONS, FLEET_PARAMS_GROUP_CONTENT (+ test)
│   └── console/AudioRigDrawer.tsx     AUDIO_RIG_EFFECT_TRAIT
├── content/copy/fleet.ts              fleet.colour.*, fleet.distortion.*, fleet.chebyshev.*, fleet.bitCrusher.*
└── docs/globalColourDocs.test.ts      guard: symbols declared where the docs say, no gem read, docs name the fields
docs/
├── specs/GLOBAL_COLOUR.md             this file
├── tasks/GLOBAL_COLOUR.md             the plan (next phase)
├── reference/GLOBAL_CHAIN_GRID.md     chain-order line, six rows, Colour note
├── AUDIO_SYSTEM.md                    Signal Graph + a Colour paragraph
├── SESSION_STORAGE.md                 one line: absent colour keys load as defaults
├── ideas/themes.md                    one sentence on the character bands
├── todo/roadmap.md                    50.3 status + as-built; 50.4 "ships both"
└── todo/scratchy-audio-phones.md      re-baseline + the 50.3 A/B
```

Conditional (only if the A/B asks): `src/constants/index.ts` (`LOAD_COLOUR_MIN`), `src/utils/audioBudget.ts`,
`src/systems/audioBudgetSystem.ts`, `src/components/debug/hudLines.ts`, `globalFx.setColourEnabled`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. Nothing per robot: no `Robot`, `CompanyOptionsSnapshot`,
  `RobotAudioOverrideDiff`, `spawnSystem.ts`, `AudioEngine.reserveVoice` or share codec key changes.
- **Three nodes, one instance each, on the global chain.** No fourth node, no per-robot colour, no
  `oversample` other than `'none'`, no `PitchShift`, no new dependency.
- **Every AudioParam write lives in `globalFx.ts`**, called from `audioStore` actions or
  `applyGlobalAudioToEngine`, never from a GSAP callback or a React effect (Strict Separation).
- **State stays JSON-serialisable:** six numbers on `GlobalAudioSettings`; nodes are module state in
  `globalFx.ts`.
- **Zero display strings in components or configs** — every label, heading and help line is a
  `src/content/` entry read through `labels()` / `introProps()`.
- **Replayability:** the character and every value come from `getSeededVal` under `globalAudio.*` keys;
  no wall-clock, no randomness.
- **Nothing reaches the robot's body** (Visual Mapping guardrail) — the guard test scans the gem folder.
- **No "keep existing worlds the same" constraint** (pre-v1 rule). The seed oracles are amended by hand
  to add keys, and only to add keys.
- **Protected paths:** `.env*`, `node_modules/`, build output.

---

## 4. Code Style & Architecture Conventions

```ts
// src/engine/audioEngine/globalFx.ts — one setter per block, the Limiter's shape
export function setGlobalBitCrusher(params: Partial<BitCrusherSettings>): void {
  const crusher = _globalBitCrusher;
  if (!crusher) return;
  try {
    if (params.bits !== undefined) rampOrSet(crusher.bits, params.bits, COLOUR_RAMP_SECONDS);
    if (params.wet !== undefined) rampOrSet(crusher.wet, params.wet, COLOUR_RAMP_SECONDS);
  } catch (err) {
    devWarn('[AudioEngine] setGlobalBitCrusher failed', err);
  }
}
```

```ts
// src/data/audioRigConfig.ts — a block is schema + content keys, never a string
{
  key: 'bitCrusher',
  panel: panelSchema('bitCrusher', 'fleet.bitCrusher', 'column'),
  params: [
    { field: 'bits', schema: { id: 'bitCrusher.bits', type: 'sliderLinear', ...labels('fleet.bitCrusher.bits'), min: 1, max: 16, step: 1, orientation: 'horizontal' } },
    { field: 'wet',  schema: { id: 'bitCrusher.wet',  type: 'sliderLinear', ...labels('fleet.bitCrusher.mix'),  min: 0, max: 1, step: 0.01, orientation: 'horizontal' } },
  ],
},
```

- Names: settings interfaces `XSettings`; keys camelCase (`bitCrusher`); seed keys `block.field`; content
  keys `fleet.<block>.<param>`; constants `COLOUR_*` in the module that owns them (`COLOUR_CHARACTERS`,
  `COLOUR_CHARACTER_BANDS` in `globalAudioSeed.ts`; `COLOUR_RAMP_SECONDS` in `globalFx.ts`).
- Comments cite this spec by section where a choice is not obvious from the code (the character draw, the
  worklet note, the hand-amended oracle).
- Tests colocated; TDD per task; one commit per task; the mutation harness run on each pure module.

---

## 5. Testing & Verification Requirements

**Unit (Vitest), per area:**

- `globalAudio.test.ts`: defaults carry the three blocks at `wet 0`; `withGlobalAudioDefaults` fills any
  missing block (and only missing blocks), leaves present ones untouched, and ignores unknown keys.
- `globalAudioSeedRanges` / `globalAudioLoadingRanges` tests: six new rows, loading inside full, every
  key in both tables.
- `globalAudioSeed.test.ts`: the two oracles with the three blocks added by hand and nothing else moved
  (the existing `toStrictEqual` proves it); determinism (same seed, same character); **calibration**:
  over 3 000 Attenuation Styles the realised share of each character is within ±3 points of assumption 2
  and the three-node combination never occurs; an unlit node has `wet === 0` and a lit node's `wet` is
  inside its loading band; `order` and `bits` are integers on every seed.
- `audioRigConfig.test.ts`: ten blocks in grid order; each colour block's params, ranges and steps; no
  `lfoTarget` on any colour row.
- `AudioEngine.test.ts`: `buildGlobalFxChain` constructs exactly one Distortion, one Chebyshev and one
  BitCrusher (constructor-count, the 50.1 pattern), `oversample: 'none'` on both shapers; with a missing
  `BitCrusher` ctor the chain still wires; `wireGlobalFxChain` in both modes places the three between HPF
  and Compressor (connection-order assertion on the mocked nodes) and the returns still join after them.
- `globalFx` setter tests: each setter writes its two fields, no-ops without a node, rounds `order`.
- `audioStore.test.ts`: `setGlobalAudio('bitCrusher', { wet })` reaches the setter;
  `applyGlobalAudioToEngine` pushes all three blocks.
- `uiStore` / `navActions` / `FleetParamsScreen` tests: six groups in order with the new trait colour;
  Colour's three sub-tabs; breadcrumb reads "Colour › Bit Crush".
- `traits.test.ts`: 8 ids; `traitColors.test.ts`: the new pair.
- `sessionDiff.test.ts` / `sessionShareUtils.test.ts`: a version-2 payload without colour keys restores
  and decodes with the defaults and `applyGlobalAudioToEngine` receives full blocks; a payload with them
  round-trips.
- `transmissionPresets.test.ts` (or the existing preset test): every preset's `globalAudio` has the
  three blocks.
- `src/docs/globalColourDocs.test.ts`: the named symbols are declared where this spec says; no file under
  the gem folder reads `distortion`, `chebyshev` or `bitCrusher`; the living docs name the six fields.
- `content.test.ts` and lint: no literal strings.

**Verification steps (every task):** `npm run build:types`, `npm run lint`, `npm test`, `npm run build`,
all clean. Mutation harness on `globalAudioSeed.ts`, `globalAudio.ts`, the setters and `audioBudget.ts`
(if touched).

**Manual listen (Crawford, desktop):** a seeded clean world, a drive world, a fold world, a crush world
and a two-node world, found by cycling seeds with the HUD's seed readout; each node from 0 to full by
hand with no click; Chebyshev orders 1–8 at mid wet for aliasing harshness (assumption 6's cap);
Natural and Controlled Decay flips keep the colour; save, reload and share-link round trips; an old
`?session=` link (the 50.2 baseline payload, which lacks the keys) loads dry; keyboard and every "?".

**Phone gate (the series' "without distortion"):**

1. **Re-baseline first.** Crawford's seed-`alpha` world on current `main` (the Sends chain), Pixel 8,
   `?debug`, Full 3:00 and Standard 3:00, underrun counts recorded in `scratchy-audio-phones.md`. The
   2026-10-13 baseline predates 50.2's chain change and is retired.
2. **A/B on the branch**, same world, same lengths: (a) the seeded character; (b) BitCrusher alone at
   full wet, 4 bits; (c) all three at full wet. Underrun counts at Full and at Standard, plus the desktop
   `npm run perf` before and after.
3. **Pass:** zero underruns at Full in every run and no more than the re-baseline at Standard. Any rise
   → assumption 12's threshold is built and measured again (BitCrusher first) or the node is withdrawn;
   recorded either way. The report records counts, not "sounded fine".

---

## 6. Git & Workflow Context

- Branch `feature/palette-colour` off `main`; Crawford creates branches, PRs and merges.
- One commit per task, RED first, imperative subject, no conventional-commit prefix. Co-author line per
  the session reminder.
- Docs and the roadmap's as-built paragraph land in the final docs task, which turns the guard test's
  docs cases green.
- Repo index is LF; `docs/` working copies are mixed. New docs are written CRLF to match their siblings
  (`docs/intent`, `docs/specs`); edit existing files in their own endings.

---

## 7. Open Questions & Risks

1. **Trait (assumption 9):** a new `colour` trait in red/tangerine, or reuse `output`? Veto point.
2. **Character shares (assumption 2)** and **lit bands (assumption 7)** are placeholders for the listen;
   the calibration test pins whatever Crawford settles on.
3. **Chebyshev cap at 8 (assumption 6):** if the desktop listen finds high orders harsh at `oversample:
   'none'`, the cap drops rather than oversampling coming back.
4. **Uncoloured tails (assumption 4):** a crushed world's reverb and delay stay clean. If that reads wrong
   in the listen, the alternative is a second join point after the colour slot, which is a 50.2 topology
   change and would need its own A/B; not proposed here.
5. **The worklet.** First `AudioWorklet` in the app: a brief dry-only window at boot, a possible
   construction failure on an old browser (handled), and the one node the phone might object to. The A/B
   isolates it (§5 step 2b). If it fails the gate even behind a threshold, BitCrusher is withdrawn and the
   other two ship.
6. **Presets (assumption 8):** clean, unless Crawford wants a preset with colour.
7. **Lore words (assumption 14)** are placeholders until Crawford's copy pass.
8. **Not re-encoded, but check:** a share link's size is unchanged (`g` was already whole); the
   `isValidCompactSessionPayload` guard stays shallow on purpose.

### Answers (2026-10-15)

1. **Trait:** a new `colour` trait, red + tangerine. Crawford said he was open to trying other colours; the spec's pair was
   kept at Checkpoint B. Swapping it is one line in `traitColors.ts` and the pinned pair in its test.
2. **Character shares and lit bands:** changed at T14, all Crawford's. The shares are now **clean 25 %, and drive, fold and crush
   about 25 % each, with no pairs** ("only at most one gets turned on per world"). The lit Mix bands are **Distortion 0.10–0.25
   and Chebyshev and Bit Crusher 0.05–0.15**, under a hard ceiling: no seeded Mix above 0.25 on load ("keep those ones lower"
   for the other two). Mix itself is tapered (squared at the node) after the first Pixel listen.
3. **Chebyshev cap at 8:** kept. No harshness finding was reported from the listen, so high orders at mid Mix were not checked.
4. **Uncoloured tails:** kept; the question was not raised, and no second join point was built.
5. **The worklet:** one Pixel Full 3:00 run was clean by his word (no clipping, no underruns, verbal). The T0 re-baseline, a
   Standard run, the HUD numbers and `npm run perf` were not recorded, and which world was used is not known, so the worklet
   question is consistent with a pass but not proven. BitCrusher ships and no `LOAD_COLOUR_MIN` was built.
6. **Presets:** clean.
7. **Lore words:** still placeholders for the copy pass.
8. **Not re-encoded, but check:** confirmed. A share link's size is unchanged; the guard stays shallow; missing blocks default on
   the way in.

---

## 8. As Built (deltas from §1–§7)

- **Grid rows landed with the range tables (T2), but the range tests do not parse the grid.** `globalAudioSeedRanges.test.ts` and
  `globalAudioLoadingRanges.test.ts` compare against hard-coded tables, so the six grid rows are documentation, and the Effect
  Label and Param Label columns are placeholders.
- **T1 needed more than the spec said:** `GLOBAL_SETTER` no-op placeholders in `audioStore.ts` (replaced at T4) and default blocks
  in the seeder and both seed oracles, so the tree compiled. The loading-range row-count guard in `globalAudioSeed.test.ts`
  excludes the three colour Mix rows.
- **Setters clamp and ignore non-finite values** (beyond §1.3), because a share link is untrusted and an `order` of 1e9 stalls the
  shaper-map build. A BitCrusher constructor failure `devWarn`s.
- **The seeder reads all seven colour keys on every style** (the §1.2 snippet read `wet` only when lit), so the draw set never
  depends on the character.
- **The character draw is bell-curved and discrete,** so the band edges were fitted by measurement (gap midpoints nearest the
  cumulative targets), at T5 for seven characters and again at T14 for four; see `COLOUR_CHARACTER_BANDS`' comment.
- **Mix is tapered** (`colourWetGain`, squared), **seeded Mix is capped at 0.25** (`COLOUR_LOAD_MIX_MAX`) with Chebyshev and Bit
  Crusher lower, and **the pair characters are gone** (all T14, Crawford's calls). The seed oracles were hand-amended at T1 and
  T5 and three times at T14, never re-recorded.
- **Copy:** the bit-depth slider is "Bit Depth", not "Bit Crush". Breadcrumb separators are " / ".
- **Tests changed that the plan expected to stay put:** the nav guard "every block in exactly one group" and the content guard
  "every key is read" each took a self-cleaning exemption for one commit (T8 to T9); the share tests' stand-in `globalAudio: {}`
  became a full default set because an empty one no longer round-trips (T10).
- **T12 was partial and T13b was not built** (see answer 5). Per-robot colour sends were raised by Crawford after the listen and
  are not part of this phase.
- **Retuned (Classic Band Retune, 2026-10-21):** the three lit Mix bands moved (Distortion 0.2–0.3, Chebyshev and Bit Crusher 0.25–0.35) and `COLOUR_LOAD_MIX_MAX` rose from 0.25 to 0.35 (Crawford, Decision 1 = B), because the bottom third of a squared slider is near silence (a wet layer of −48 dB at 0.05). This reverses T14's "keep those ones lower": Chebyshev and Bit Crusher now seed above Distortion. See [CLASSIC_BAND_RETUNE.md](../tasks/CLASSIC_BAND_RETUNE.md); the assumptions above are not rewritten.
- **Amended after the listen (Classic Band Retune, Checkpoint B, 2026-10-21):** Crawford found the retuned colour bands far too strong ("much more subtle"). All three lit Mix bands are now one shared 0.1–0.2 (a wet layer of −36 to −24 dB), and COLOUR_LOAD_MIX_MAX is back at 0.25, so the line above is superseded: Chebyshev and Bit Crusher no longer seed above Distortion.
