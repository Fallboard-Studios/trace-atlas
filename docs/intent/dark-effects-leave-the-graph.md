# Intent: Dark Effects Leave the Graph — a dark effect does not exist

Confirmed via `interview-me` on 2026-11-10 (5 questions, each guess taken), ahead of a `spec-driven-development` pass.
Backlog [72](../todo/backlog.md#72-audio-dark-effects-leave-the-graph--their-standing-signals-go-b9), 67's B9, first
item of plan.md's Stage 1. Its evidence is the ablation in the backlog 67 record
([scratchy-audio-phones.md](../todo/scratchy-audio-phones.md), the second §9, "B9 (T16b)").

## Outcome

An effect whose bypass cell is dark is not in the audio graph at all: not built while dark, torn down after it darkens,
rebuilt when it lights. Its Tone Signals (a rendering ConstantSource each) and the rest of its nodes stop costing the
audio thread anything. The ablation priced this at about −0.02 of the mean at Full (−163 nodes on W1, −196 on W2);
with the Light tier's hold-off included, the saving there is larger. The change lives in the engine
(`src/engine/audioEngine/globalFx.ts`, `bypassCell.ts`, `holdOffs.ts`); nothing the listener sees or hears changes.

## Behavior

- **Who it is for: phones and weaker desktops.** Crawford's desktop already passed 67's Gate B at full 4K without it.
  This lowers the floor for the machines that need it, most of all at Light, where phones live.
- **"Dark" is the cell's state, whatever darkened it.** All ten bypass cells are covered, each by its own dark rule:
  - the five chain cells (AutoWah, Phaser, Tremolo, Vibrato, Width) at a Mix of 0, Width at 0.5, its unity;
  - the five room branches (Distortion, Chebyshev, BitCrusher in Grit; Frequency Shifter in Shimmer; Chorus in
    Double) at a depth of 0;
  - every cell while the Light tier's effects hold-off has it (`setEffectsHeldOff`, H1), which writes each cell dark
    through the same `writeCellMix` crossing.
- **A branch whose room is unfed is not dark.** It keeps its depth and lights again when its room is fed. The
  ablation's first cut got this wrong and pruned W1's Chorus; the rule is the cell's Mix or depth, never the room's
  feed.
- **Never built while dark, including at world build.** A world whose Phaser is dealt a Mix of 0 never constructs a
  Phaser. Nothing is built to be thrown away; the ablation's "build everything, dispose at 3 s" was a test shape, not
  the design.
- **Torn down a short while after a darken.** About a second after the darken's disconnect, so a Mix slider dragged
  through 0 does not build and dispose on every crossing. A light before the teardown finds the effect still there
  and just lights it.
- **Rebuilt silently when it lights.** Built from the effect's current settings, connected under its cell's zero wet,
  then lit through the normal crossing, the way `rebuildPhaser` already swaps a Phaser inside its cell. The rebuilt
  effect sounds exactly as it would have had it never left.
- **Lifting the hold-off may rebuild up to ten effects at once.** Crawford accepts that burst on the main thread. No
  staggering up front; only if measurement shows it causes a problem.
- **World changes and a save's load go through the same rule.** A world built or re-dealt builds only its lit effects.

## Style / constraint

- **The sound does not change.** Every crossing is as silent as it is today; a click or a gap at a light, a hold-off
  lift or a world change is the one thing that stops it shipping.
- **Proof, and the bar it clears:**
  - a desktop A/B of W1 (`ez84fjmr:93:-146`, Wreck) and W2 (`bravo:-150:90`) at Full against `main`, with the census
    (`perf:audio-census`) showing the node drop;
  - a Light-tier census showing every held-off effect gone;
  - the crossing recipe (the backlog 67 record's second §8, `DARK_EFFECT_BYPASS.md` §8.2) clean on a light, a hold-off
    lift and a world change;
  - Crawford's ear.
- **It ships even if the mean delta lands inside the noise band.** The census proves the nodes are gone, and nodes
  doing work nobody hears are cruft. Only an audible click or a crossing gap stops it. No Pixel listen gates it.
- **Architecture holds.** AudioEngine owns the effects and their lifetimes; runtime nodes stay out of state; no
  `setTimeout`/`setInterval` for anything on the audio path (the ablation waited on Tone's context timer).

## Out of scope

- **The Reverb and Delay rooms themselves**, the EQ3, the LPF and HPF, and the Limiter. They are not bypass cells.
- **Global LFOs.** `GLOBAL_LFO_TARGET_IDS` reaches only the EQ3, LPF and HPF, so no LFO can target an effect that is
  gone; the backlog entry's question about it is moot. The global modulation pedal is itself one of the ten effects,
  not something aimed at them.
- **Roadmap [69](../todo/roadmap.md#69-the-leaner-synth-layer-robot-voices-on-native-nodes)** (the leaner synth layer)
  and **backlog [68](../todo/backlog.md#68-audio-automatic-tier-choice-for-weaker-desktops-revisit-with-the-lean-graph)**
  (automatic tier choice). Separate items.
- **Any UI change**, including the `?debug` overlay's readouts.
- **A Pixel listen as a gate.**

## Known implementation notes (not yet spec'd)

- **Where an absent effect's settings live.** Every setter must accept a write while its effect is gone and keep it
  for the rebuild, the way `_phaserLive` mirrors the Phaser today. The spec names the mirror per effect and which
  writes (the store's whole-block applies, swells, a synced Rate resolved to Hz) land there.
- **The teardown's clock and wait.** "About a second" is the interview's figure; the spec picks the clock (Tone's
  context, so a power-off pause freezes it with the world) and what cancels a pending teardown.
- **The effects' own LFOs.** The Phaser and Vibrato start theirs in the constructor; the Chorus and Tremolo are
  started by the cell at each light (H3a). A rebuild must leave each in the state its cell expects.
- **The Phaser's Stages duck** (`writePhaserStages`) and the Chorus/Tremolo Spread duck: what a duck in flight does
  when its effect is torn down, and that a Stages edit on an absent Phaser only updates the mirror.
- **The BitCrusher's worklet** registers its processor on a promise (the constructor itself is synchronous); the spec
  says what a light does while a rebuilt BitCrusher's processor is still pending.
- **`wireGlobalFxChain`** (a Decay flip re-wires the cells as they are) and the `?debug` output taps, with absent
  effects in the chain.
