# Intent: Global Modulation Pedal — AutoWah and Phaser on the Global Chain

Confirmed via `interview-me` on 2026-10-15 (6 questions; two guesses overturned — "a few controls each"
became every parameter exposed, and "two more sub-tabs in Colour" became a tab of their own), ahead of a
`spec-driven-development` pass. Roadmap item 50.4
([docs/todo/roadmap.md](../todo/roadmap.md#504-global-modulation-pedal-autowah-or-phaser)), the last
sub-phase of the Audio Palette series (roadmap 50), after Global Colour (50.3) merged to `main` (PR #557,
`03cc6881`). Both pedals ship, per the 2026-10-14 decision recorded under 50.4.

## Outcome

A new section tab on Fleet Params, between Colour and Output, with two global effects as its sub-tabs:
**AutoWah** (`Tone.AutoWah`, an envelope follower sweeping a bandpass to the fleet's own dynamics) and
**Phaser** (`Tone.Phaser`, a stack of allpass notches swept by its own LFO). Each is a single node on the
dry chain after the Colour nodes and before the Compressor, with every parameter on screen and a lore
name. A fresh world has a one-in-three chance of each pedal being lit, quietly; by hand, either can be
pushed hard.

- **User:** Crawford, composing a world — motion in the fleet's transmission to go with Colour's grain,
  and the full parameter set because the point of the series is options.
- **Why now:** 50.3 is merged, `wireGlobalFxChain` is still the one wiring point, and this is the last
  step of the series before backlog 22's auditions.
- **Success:** A lit world sounds swept or wah'd as a hint, not a wash, and worlds differ in which; a hand
  edit can take either pedal to its loudest; Phaser's rate can be anchored to a note value and follows a
  tempo change; the settings survive a session save, reload and share link; the Pixel A/B at Full and
  Standard shows no rise in underruns.

## Behavior

- **Two nodes, one instance each, on the dry chain, after Colour.** Order: EQ3 → LPF → HPF → Distortion →
  Chebyshev → Bit Crusher → **AutoWah → Phaser** → Compressor → Limiter. The Reverb and Delay returns
  rejoin at the Compressor or Limiter as since 50.2, so the rooms' tails are never swept, in both Decay
  Modes. Pedalboard order: the wah and the phaser hear the coloured signal, so the sweep rides the
  harmonics the drive added. The order of the two among themselves is a spec listening call; wah before
  phaser is the starting point.
- **Every parameter exposed.** Phaser: Rate (`frequency`, with a Free | Sync toggle), Octaves, Base
  Frequency, Stages, Q, Mix (`wet`). AutoWah: Base Frequency, Octaves, Sensitivity, Q, Gain, Follower,
  Mix (`wet`). Each pedal keeps its own Mix; there is no shared pedal mix. "Off" is a pedal's Mix at zero.
- **Phaser's Rate takes the Free | Sync treatment** (roadmap 33, [FREE_SYNC_TOGGLE.md](../specs/FREE_SYNC_TOGGLE.md)):
  Free is a Hz slider; Sync is a note value resolved to Hz at the current tempo through
  `utils/tempoSync.ts`, re-applied when the tempo changes, the way a Bank lane and the Delay already do.
  The stored shape follows the lane's: a `rate` plus an optional `sync` note value. AutoWah has no clock and
  gets no toggle. The Phaser's LFO phase is wall-clock, the LFO Bank's accepted class (backlog 17).
- **Seeded independently of Colour, one-in-three each.** The pedals do not join Colour's single character
  draw and do not change it. Each pedal has its own draw: lit about 33 % of fresh worlds, independent of
  the other pedal and of Colour, so about one world in nine has both pedals and just under half have
  neither. A lit pedal seeds its Mix in a low band; a dark pedal seeds Mix 0 but still draws its shape
  values, so switching it on by hand lands somewhere seeded rather than at a default.
- **The Mix is tapered and capped like Colour's, for now.** The stored Mix is the slider position; the
  node gets it squared (`colourWetGain` or a sibling), and no seeded Mix is above the Colour ceiling
  (`COLOUR_LOAD_MIX_MAX`, 0.25). "Correct for now" (Crawford): the bands and the ceiling are tuned by ear
  at a checkpoint, as Colour's were at T14, and may rise if a lit phaser reads too faint.
- **Stages' ceiling is the gate's.** Each stage is two allpass filters (left and right), so the slider's
  maximum is whatever the Pixel A/B allows; Tone's default is 10.
- **Saved.** Both settings live on `GlobalAudioSettings` and travel whole in the session payload and the
  share link. A payload saved before this phase lacks them and loads dry through `withGlobalAudioDefaults`,
  no encoding change. Presets stay clean (every pedal Mix 0).
- **Seeded like the other global fields.** New draws in `globalAudioSeed.ts`, rows in
  `GLOBAL_AUDIO_SEED_RANGES` / `GLOBAL_AUDIO_LOADING_RANGES`, mirrored in `GLOBAL_CHAIN_GRID.md` and the
  themes idea.

## Style / constraint

- **UI:** a new `FleetParamsGroup` between Colour and Output, with an intro and two sub-tabs, rendered
  through the existing `AUDIO_RIG_CONFIG` block → `AudioRigEffectPanel` path. **No new trait:** the tab
  uses the existing `spectral` trait, because both pedals are filters in motion, the EQ-and-filter family
  that trait already owns. Existing primitives only (`TempoSyncSlider` / `TempoSyncToggle` for the Phaser
  rate); a help popover per control; lore names in the copy-tone-guide's voice in `src/content/copy/fleet.ts`,
  placeholders until the copy pass, never a literal in a component.
- **Nodes:** two single instances on the global chain, nothing per robot. Every AudioParam write stays in
  `globalFx.ts` setters called from `audioStore`, never from a GSAP callback (Strict Separation). State
  stays JSON-serialisable; nodes live in the engine.
- **The phone gate stands.** Measured the Audio Palette way: same `?session=` world, A/B against the branch
  base on the Pixel via the `?debug` HUD, Standard and Full, plus `npm run perf`. The series baseline was
  recorded before Sends and Colour changed the chain and 50.3's T0 re-baseline was not run, so re-baseline
  on current `main` first. Phaser at maximum stages with both pedals at full Mix is the run that proves the
  cost. If underruns rise, the feature ships behind a new `LOAD_*_MIN` Effects Limit threshold (stages
  first) or not at all.
- Nothing reaches the robot's body (Visual Mapping guardrail).
- Pre-v1: every fresh world's sound changes by design; no "keep existing worlds the same" constraint.

## Out of scope

- **LFO Bank or swell targets on any pedal parameter** — later, not in this sub-phase.
- **Per-robot sends into the pedals** — the Colour-sends idea's shape; its own interview and spec.
- **A new trait or accent.**
- **Any change to Colour's seeding or its one-character draw.**
- **Backlog 22's other pedals** (Chorus, Tremolo, Vibrato, FrequencyShifter, StereoWidener, PingPong,
  Freeverb, JCReverb).
- **Holding existing worlds to their current sound.**

## Known implementation notes (not yet spec'd)

- **Phaser `stages` is construction-only.** Verified 2026-10-15 in `node_modules/tone/build/esm/effect/Phaser.js`:
  `stages` builds the allpass arrays in the constructor (`_makeFilters`) and has no setter. A Stages slider
  therefore means rebuilding the Phaser node and re-running `wireGlobalFxChain` on change (with the
  dry-chain rewire that already exists for the Decay flip), or a Stages control that is stepped and rare.
  The spec decides; the interview confirmed Stages on screen, so rebuild is the default answer. Rebuilding
  mid-sound is a click risk — the spec should set a short ramp of the old node's `wet` to 0 before the swap.
- **The rail every global field runs on**, verified for 50.3 on `main` `afdcb2d8` and unchanged in shape at
  `03cc6881`: `GlobalAudioSettings` + `DEFAULT_GLOBAL_AUDIO_SETTINGS` + `withGlobalAudioDefaults`
  (`src/types/globalAudio.ts`); `GlobalAudioSeedFieldKey` + `GLOBAL_AUDIO_SEED_RANGES` /
  `GLOBAL_AUDIO_LOADING_RANGES`; `sampleField` draws in `src/utils/globalAudioSeed.ts` (keyed by `dataId`,
  so a new draw moves no existing oracle value); `AudioRigEffectKey` + a block in `AUDIO_RIG_CONFIG`
  (`src/data/audioRigConfig.ts`); `GLOBAL_SETTER` and `applyGlobalAudioToEngine` in
  `src/stores/audioStore.ts`; a `setGlobalX` in `src/engine/audioEngine/globalFx.ts` with the
  colour-style clamp of every incoming value (share links are untrusted); `AUDIO_RIG_EFFECT_TRAIT` in
  `AudioRigDrawer.tsx`; `FLEET_PARAMS_SUBSECTIONS` in `navActions.ts`. A new section tab also touches
  `FleetParamsGroup` (`uiStore.ts`), `SECTIONS` in `FleetParamsScreen.tsx` and `FLEET_PARAMS_GROUP_CONTENT`.
- **Chain slot.** `wireGlobalFxChain` (`globalFx.ts:234`) builds the dry chain from one `chainNodes`
  array; the two nodes slot in between `_globalBitCrusher` and `_globalCompressor` once and both Decay
  orderings get them. `disconnectAllFxNodes` must list them too, and construction must be guarded with
  `getToneCtor` for headless tests.
- **Free | Sync rail.** `resolveLaneRateHz`, `laneToSync`, `laneToFree`, `allowedLaneNoteValues` in
  `src/utils/tempoSync.ts`; `setDelaySyncMode` in `audioStore.ts:410` is the single-field precedent (the
  Delay's time), closer to the Phaser's one rate than the Bank's per-lane actions. Whatever re-applies the
  Delay on a tempo change must also re-apply the Phaser.
- **Tone facts** (15.1.22, from the `.d.ts`): `AutoWah` — `baseFrequency` (Hz), `octaves`, `sensitivity`
  (dB, normal range −40 to 0), `Q` (Signal, default 2), `gain` (Signal, dB), `follower` (Time, the
  envelope's attack/release), `wet`. `Phaser` — `frequency` (Signal, Hz, the LFO rate), `octaves`,
  `baseFrequency` (Hz), `stages` (constructor only, default 10), `Q` (Signal), `wet`. Defaults in the
  class docs: Phaser `frequency: 15, octaves: 5, baseFrequency: 1000`.
- **Seeding the two lit rolls.** Two new `dataId` draws, each thresholded at a third, fitted the way the
  Colour character edges were (measured over many styles, not nominal) since the draw is bell-curved and
  discrete. The seed oracle amendments follow the 50.3 pattern: derive by hand from the raw draws, check by
  reproducing the old numbers.
- **Effects Limit, if needed.** `effectsLoadToLimits` (`src/utils/audioBudget.ts`) is where a
  `LOAD_PEDAL_*_MIN` would join the existing thresholds, with the HUD's tier line and `describeLimits`
  reading it. Only if the A/B asks for it.
- Verify every file:line against the tree before building.
