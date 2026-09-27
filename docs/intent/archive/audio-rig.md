# Intent: Audio Rig (Roadmap Phase 4)

Confirmed via `/interview-me` on `main`, 2026-08-22. This is the "why" behind Phase 4's
scope in [docs/todo/roadmap.md](../todo/roadmap.md#4-audio-rig) — read that first
for the file-level deliverables; this doc resolves the decisions its prose left open,
and corrects one place where that prose is now stale (see Why now).

## Outcome

A fully **live** Audio Rig console, not a presentational scaffold:

- `src/data/audioRigConfig.ts` holds `ControlSchema` data for all 7 global effect blocks
  (Compressor, 3-Band EQ, Low-Pass Filter, High-Pass Filter, Chorus, Delay, Reverb),
  sourced field-for-field from
  [GLOBAL_CHAIN_GRID.md](../reference/GLOBAL_CHAIN_GRID.md) — exact lore label, human
  label, unit/range, default, UI control type, and LFO flag.
- `AudioRigDrawer.tsx` renders 7 `AccordionContainer` instances (in the grid's order),
  mapping over those schemas with the existing 13 UI primitives
  (`src/components/ui/controls/`), replacing the current placeholder `<div>` in
  `ConsolePanel.tsx`'s `TILE_CONTENT.audioRig` entry.
- Every control is wired live through `src/stores/audioStore.ts` to the real Tone.js FX
  chain already built in `src/engine/audioEngine/globalFx.ts`
  (`setGlobalCompressor`/`EQ`/`FilterLPF`/`FilterHPF`/`Chorus`/`Delay`/`Reverb`,
  `setGlobalBypass`, `setEffectBypass`) — dragging a control audibly changes the effect.
- Each of the 7 accordions gets its own `enabled`-bound bypass toggle in its header;
  one rig-wide toggle above all 7 binds to `GlobalAudioSettings.globalBypass`. Either
  kind of bypass, switched off, visually **and** functionally disables (`disabled` prop)
  that scope's other controls — not just silences audio while leaving them interactive.
- The 9 params `GLOBAL_CHAIN_GRID.md` flags `LFO?: X` (`eq3.low/mid/high`,
  `filterLPF.frequency/Q`, `filterHPF.frequency/Q`, `chorus.delayTime`,
  `delay.delayTime` — matching `src/types/lfo.ts`'s `GlobalLfoTargetId` 1:1) each get
  their `Lfo` primitive tucked into its own nested `AccordionContainer` inside the
  parent effect's accordion, wired live to `src/engine/lfoEngine.ts`
  (`setLfoRate`/`setLfoDepth`/`setLfoShape`/`connectLfoTarget`/`disconnectLfoTarget`) —
  flipping "active" really connects/disconnects modulation.
- New: global LFO settings are seeded per planet, not left at
  `DEFAULT_LFO_SETTINGS`. A new function mirrors
  `globalAudioSeed.ts`'s `generateGlobalAudioSettings(planetId, planetName)` pattern —
  per-field `getSeededVal` sampling off the planet noise map — producing a deterministic
  `{ shape, rate, depth, active }` per `GlobalLfoTargetId`, using the existing single
  global bounds (`LFO_RATE_MIN/MAX`, `LFO_DEPTH_MIN/MAX`, `LFO_SHAPES`). Unlike the
  robot-level precedent (`generateRobotLfoSettings`, where `active`/connected is a
  runtime UI concern never part of the generated data), **`active` is seeded here too**
  — a freshly loaded planet can already have real, audible LFO modulation running
  before the user touches anything.

## User

Crawford, exercising the real console and hearing real, seed-varied audio — including
possibly-already-modulating LFOs — from the moment a planet loads.

## Why now

The engine-side surface this phase needs (`AudioEngine.setGlobal*`/bypass, `lfoEngine`)
was already built in Phase 0 (LFO Integration) and is sitting unused. Roadmap Phase 4's
own "About" text is stale on two counts, confirmed by reading the current code rather
than assumed: it frames the phase as leaving "clean parameter IDs ready for Web Audio
setter bindings in subsequent phases" (that Web Audio side already exists —
`src/engine/audioEngine/globalFx.ts`, `src/stores/audioStore.ts`), and it never mentions
LFO seeding at all. A `roadmap.md`-wide grep for "LFO" confirms no other phase claims
global LFO seeding either — the only prior reference is `AUDIO_SYSTEM.md`'s own doc
comment marking it "out of scope... until a later phase's UI or seeding work sets
them," and Phase 4 is exactly that later phase.

## Success

- Every param control audibly/immediately changes its Tone.js effect on interaction.
- Per-effect and rig-wide bypass toggles visually and functionally disable their scope
  when off.
- Every LFO accordion shows seeded (not `DEFAULT_LFO_SETTINGS`-inert) shape/rate/depth/
  active values on load; targets seeded `active: true` are genuinely modulating audio
  on load, not just displaying as active; toggling active genuinely connects/
  disconnects.
- `audioRigConfig.ts`'s data traces field-for-field to `GLOBAL_CHAIN_GRID.md` — no
  invented labels, ranges, or defaults.
- The new global-LFO seeding function is deterministic (same planet → identical
  settings) and covered by unit tests, matching `globalAudioSeed.test.ts`'s existing
  pattern.

## Constraint

Stays inside the repo's existing non-negotiable guardrails ([CLAUDE.md](../../CLAUDE.md)):

- No Tone/synth construction in components — `AudioRigDrawer.tsx` never imports Tone;
  every engine call routes through `AudioEngine`/`lfoEngine`.
- State stays serializable and in Zustand — `audioStore`'s `setGlobalAudio` action is
  extended so it also pushes to the matching `AudioEngine` setter, mirroring the
  inline-call pattern `regenerateGlobalAudioFromSeed` already uses; live `Tone.LFO`/FX
  node instances themselves stay runtime-only, never entering Zustand.
- Seeding follows the existing `getSeededVal`/noise-map registry conventions
  (`precomputeDataX`, stable dot-namespaced `dataId` keys).

## Out of scope (this phase)

- Robot-level audio/LFO wiring — Phase 9's territory.
- Session Storage persistence of any Audio Rig or LFO edits made through this drawer —
  Phase 12's territory; edits made this phase don't yet survive a reload.
- Seeding the global effects' base `enabled` flags — still pinned `true` per Phase 0's
  own scope; this phase adds real bypass *toggles*, but doesn't change what a fresh
  seed generates for `enabled`.
