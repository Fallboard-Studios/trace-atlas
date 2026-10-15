# Intent: Global Colour — Distortion, Chebyshev and BitCrusher on the Global Chain

Confirmed via `interview-me` on 2026-10-14 (6 questions; one guess overturned — one saturator became
both, and 50.4's "one of the two" became both as well), ahead of a `spec-driven-development` pass.
Roadmap item 50.3 ([docs/todo/roadmap.md](../todo/roadmap.md#503-global-colour-saturation-and-bitcrusher)),
part of the Audio Palette series (roadmap 50), after Robot Articulation (50.1) and Robot Sends (50.2),
both merged to `main`.

**Status (2026-10-15): built** on `feature/palette-colour` (spec [GLOBAL_COLOUR.md](../specs/GLOBAL_COLOUR.md), plan
[GLOBAL_COLOUR.md](../tasks/GLOBAL_COLOUR.md), roadmap 50.3 "As built"). Three things below were changed by Crawford after the
interview and are recorded in the spec's §7 answers and §8: **the Mix is tapered** (squared at the node), **no seeded Mix is
above 0.25** and Chebyshev and Bit Crusher seed lower than Distortion, and **at most one effect is on per world**, so
"a few light two" under "Seeded on, subtly" is superseded.

## Outcome

A new **Colour** section tab on Fleet Params, beside Output, with three global effects as its sub-tabs:
**Distortion** (`Tone.Distortion`, a smooth overdrive), **Chebyshev** (`Tone.Chebyshev`, a harmonic
waveshaper with an integer order) and **BitCrusher** (`Tone.BitCrusher`, bit-depth reduction). Each is a
single node on the dry chain, between the filters and the Compressor, with its own amount and mix sliders
and a lore name. A fresh world sounds a little degraded in one character; by hand, any of the three can be
pushed hard.

- **User:** Crawford, composing a world — giving the fleet's whole transmission a grain. Anyone who wants
  options: "I want variety and user options" (Crawford, 2026-10-14) is why all three ship rather than one.
- **Why now:** 50.1 and 50.2 are merged, `wireGlobalFxChain` is the one wiring point, and this is the next
  step of the series.
- **Success:** A fresh world carries a little grit in one character, and worlds differ from each other in
  which; a hand edit can take any node to its loudest; the settings survive a session save, reload and
  share link; the Pixel A/B at Full and Standard stays clean.

## Behavior

- **Three nodes, one instance each, on the dry chain.** Order: EQ3 → LPF → HPF → *Colour* → Compressor →
  Limiter. The Reverb and Delay rooms are parallel to the dry chain since 50.2 and rejoin at the Compressor
  or Limiter, so the colour nodes hear the dry signal only, never the echoes, in both Decay Modes. The
  order of the three among themselves is a spec decision (listening call).
- **Seeded on, subtly — "let's hear it, but just a little."** Each node has its own quiet roll, tuned so
  that most fresh worlds light one node at a low level, a few light two, and a share are fully clean. Three
  low effects stacked would smear, so a world has one character: a warm world, a strange-harmonic world, a
  crushed world, or a clean one. The exact odds and the low bands are a spec-and-listening call; each
  node's "off" is its own mix at zero (and for Chebyshev, order 1 is also no change).
- **Each node keeps its own Amount and Mix.** Distortion: amount 0–1 and `wet`. Chebyshev: integer order
  and `wet`. BitCrusher: `bits` (1–16; stepped or continuous is a spec call) and `wet`. No shared Colour
  mix.
- **No oversampling, no control for it.** `oversample` stays at `none` on both waveshapers. It is the one
  part of the roadmap entry flagged as not cheap, and the gate is meant to stay a formality. If the desktop
  listen finds harsh aliasing at high Chebyshev orders, revisit as a fixed internal setting, never a slider.
- **Saved.** The three settings live on `GlobalAudioSettings`, so they travel whole in the session payload
  and the share link like every other global field. A payload saved before this phase lacks them and must
  load with defaults rather than crash (there is no field-level default merge today; the spec places one).
- **Seeded like the other global fields.** New draws in `globalAudioSeed.ts`, rows in
  `GLOBAL_AUDIO_SEED_RANGES` / `GLOBAL_AUDIO_LOADING_RANGES`, mirrored in `GLOBAL_CHAIN_GRID.md` and the
  themes idea.

## Style / constraint

- **UI:** a new `FleetParamsGroup` (`colour`) with its own trait colour, intro and three sub-tabs, rendered
  through the existing `AUDIO_RIG_CONFIG` block → `AudioRigEffectPanel` path. Existing primitives only;
  a help popover per control; lore names in the copy-tone-guide's voice in `src/content/copy/fleet.ts`,
  never a literal in a component. "Degraded transmission" is the on-brand frame.
- **Nodes:** three single instances on the global chain, nothing per robot. Every AudioParam write stays in
  `globalFx.ts` setters called from `audioStore`, never from a GSAP callback (Strict Separation). State
  stays JSON-serialisable; nodes live in the engine.
- **The phone gate stands.** Measured the Audio Palette way: same `?session=` world, A/B against the branch
  base on the Pixel via the `?debug` HUD, Standard and Full, plus `npm run perf`. **The series baseline is
  stale** — recorded on `main` `ca2b6868` before Sends changed the chain — so re-baseline on current `main`
  first. BitCrusher is Tone's only AudioWorklet effect and the first worklet in the app, so it is the node
  to watch; if underruns rise, the feature ships behind a new `LOAD_*_MIN` Effects Limit threshold (the
  worklet first) or not at all.
- Nothing reaches the robot's body (Visual Mapping guardrail).
- Pre-v1: every fresh world's sound changes by design; no "keep existing worlds the same" constraint.

## Out of scope

- **LFO Bank or swell targets on any colour parameter** — the roadmap's "later, not in this sub-phase".
- **AutoWah and Phaser** — they stay in 50.4, which now ships **both** rather than choosing one (Crawford,
  2026-10-14: "both of the other two"); the 50.4 roadmap text is updated with the spec.
- **An oversampling control**, or any non-`none` oversampling.
- **Per-robot colour** of any kind — twelve instances on a phone.
- **Holding existing worlds to their current sound.**

## Known implementation note (not yet spec'd)

- **The rail every global field runs on**, verified 2026-10-14 on `main` `afdcb2d8`: `GlobalAudioSettings`
  + `DEFAULT_GLOBAL_AUDIO_SETTINGS` (`src/types/globalAudio.ts`); `GlobalAudioSeedFieldKey` +
  `GLOBAL_AUDIO_SEED_RANGES` / `GLOBAL_AUDIO_LOADING_RANGES`; `sampleField` draws in
  `src/utils/globalAudioSeed.ts` (keyed by `dataId`, so a new draw moves no existing oracle value);
  `AudioRigEffectKey` + a block in `AUDIO_RIG_CONFIG` (`src/data/audioRigConfig.ts`); `GLOBAL_SETTER` and
  `applyGlobalAudioToEngine` in `src/stores/audioStore.ts`; a `setGlobalX` in
  `src/engine/audioEngine/globalFx.ts`; `AUDIO_RIG_EFFECT_TRAIT` in `AudioRigDrawer.tsx`;
  `FLEET_PARAMS_SUBSECTIONS` in `navActions.ts`. `SelectedFleetParamsEffect` is
  `AudioRigEffectKey | …`, so each new effect key is a sub-tab automatically. A new section tab also
  touches `FleetParamsGroup` (`uiStore.ts`), `SECTIONS` in `FleetParamsScreen.tsx`,
  `FLEET_PARAMS_GROUP_CONTENT`, and the trait colour.
- **Chain slot.** `wireGlobalFxChain` (`globalFx.ts:167`) builds the dry chain from one `chainNodes`
  array, so the three nodes slot in between `_globalHPF` and `_globalCompressor` once and both Decay
  orderings get them. `disconnectAllFxNodes` must list them too, and construction must be guarded with
  `getToneCtor` for headless tests (BitCrusher's worklet will not construct there).
- **Tone facts** (15.1.22): `Distortion` — `distortion` 0–1, `oversample`, `wet`; `Chebyshev` — `order`
  integer (1 = no change; odd and even orders sound different), `oversample`, `wet`; `BitCrusher` — `bits`
  Param 1–16, `wet`, implemented as an `AudioWorklet`.
- **Default merge for old payloads.** `applyGlobalAudioToEngine` dereferences every effect key directly;
  `isValidCompactSessionPayload` checks only that `g` is an object. The spec decides where a missing colour
  key falls back to `DEFAULT_GLOBAL_AUDIO_SETTINGS` (restore and share decode).
- **Effects Limit, if needed.** `effectsLoadToLimits` (`src/utils/audioBudget.ts:78`) is the one place a
  `LOAD_COLOUR_*_MIN` would join `LOAD_BUS_FILTER_LFOS_MIN`, with the HUD's tier line and
  `describeLimits` reading it. Only if the A/B asks for it.
- Verify every file:line against the tree before building.
