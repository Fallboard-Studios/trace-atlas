# Phase Spec: Dark-Effect Bypass — a Dark Global Effect Leaves the Signal Path

> **Execution Commands**
> - Build check: `npm run build`
> - Type check: `npm run build:types` (`tsc -p tsconfig.app.json --noEmit`)
> - Lint: `npm run lint`
> - Unit tests: `npm test` (single file: `npx vitest run <path>`)
> - Dev server: `npm run dev`
> - Desktop audio-thread check (§5): `npm run perf:audio` against a served build, and the raw-Tone dark-cost probe (§5)
> - Phone gate (§5): the `?debug` HUD on the Pixel 8, the three links of round 2, Full, 3:00 hands off

Source of intent: [docs/intent/dark-effect-bypass.md](../intent/dark-effect-bypass.md) (confirmed 2026-10-19 via
`interview-me`, five questions, every guess confirmed). Part of **Global Pedals** (proposed roadmap 50.6,
[GLOBAL_PEDALS.md](GLOBAL_PEDALS.md)): its T14 phone gate missed on 2026-10-19, round 2 traced the miss to the
*presence* of the global effects rather than their Mix, and Crawford chose to take every dark global effect out of the
signal path ([docs/todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md), "Global Pedals (roadmap 50.6) on
the Pixel"). Built on `feature/pedals` ahead of T16 and T17; T14 is re-run on it (§6). Assumption 16 proposes it ships
inside 50.6 rather than under a number of its own.

Survey basis (2026-10-19, against `feature/pedals` at `47ce45d3`; every citation below was read, not recalled):

- **The chain today.** `buildGlobalFxChain` (`src/engine/audioEngine/globalFx.ts:173`) constructs every node behind
  `getToneCtor`, each Colour and Modulation node at `wet: 0`, the widener at `width: 0.5`, the Chorus and Tremolo
  `start()`ed, the Vibrato's LFO started by its own constructor; then `wireGlobalFxChain(false)`. `wireGlobalFxChain`
  (`:416–490`) records `_lastControlledDecay`, calls `disconnectAllFxNodes` (`:351`, a literal node list walked
  downstream-first), builds the dry chain from one array `[_entryCut, EQ, LPF, HPF, _filterCut, Distortion, Chebyshev,
  BitCrusher, AutoWah, Phaser, Chorus, Tremolo, Vibrato, FrequencyShifter, Compressor, StereoWidener, Limiter]`
  filtered by presence, connects the last to `_masterGain`, joins the rooms' returns at
  `join = (controlledDecay ? _globalStereoWidener : _globalCompressor) ?? _globalLimiter ?? _globalCompressor`, and
  re-attaches the `?debug` output taps. `getGlobalChainEntry` (`:492`) is the entry cut; every robot bus connects into
  it (`AudioEngine.test.ts:1843`). **Every one of the ten effects is in the chain in both Decay Modes, lit or dark.**
- **The cycle-search cuts** (`CHAIN_CUT_OPTIONS`, `buildChainCut`, `:139–150`; GLOBAL_PEDALS.md §8): two zero-delay
  `Tone.Delay` nodes, one at the chain's entry and one between the HPF and the Distortion, because
  `standardized-audio-context` 25.3.77 runs `detectCycles` on every `connect` and `disconnect`, walks every downstream
  path with no memo, and stops only at a node with a `delayTime` (`chainCycleSearch.test.ts` pins both facts against
  the library's real `createDetectCycles`). Each Tone `Effect` is a dry/wet diamond, the stereo ones split again, so
  the path count multiplies per stage; a Decay flip with the pedals present measures 3–4 ms.
- **The ten setters** (`setGlobalDistortion :730`, `setGlobalChebyshev :743`, `setGlobalBitCrusher :756`,
  `setGlobalAutoWah :771`, `setGlobalPhaser :824`, `setGlobalChorus :969`, `setGlobalTremolo :991`,
  `setGlobalVibrato :1010`, `setGlobalFrequencyShifter :1030`, `setGlobalStereoWidener :1045`): each clamps through
  `clampIfGiven` / `clampColour`, is null-guarded and try/caught, and writes the Mix as
  `rampOrSet(node.wet, colourWetGain(wet), COLOUR_RAMP_SECONDS)` (`COLOUR_RAMP_SECONDS = 0.05`, `colourWetGain = mix²`),
  the Width as `rampOrSet(node.width, width, …)` untapered. The Phaser keeps a mirror (`_phaserLive`, `_phaserStages`)
  and `rebuildPhaser` (`:799`) builds a new node at a Stages change, swaps it in, disposes the old one and calls
  `wireGlobalFxChain(_lastControlledDecay)`.
- **The Spread duck** (`:902–967`, GLOBAL_PEDALS.md §8): a lit Chorus or Tremolo ramps its Mix to dry over
  `SPREAD_DUCK_SECONDS` (0.02), writes the Spread from `Tone.getContext().setTimeout` after
  `lookAhead + SPREAD_DUCK_SECONDS + SPREAD_WRITE_MARGIN_SECONDS` (0.01), and ramps back to `_spreadWetGain`; a drag
  re-arms the one timer; a re-sent Spread is a no-op (`_spreadTarget`); `resetSpreadDucks` runs at every build. This
  is the precedent for a parameter write that must wait the lookahead out, and for a per-effect mirror.
- **How a Mix reaches the engine.** The drawer's sliders are `sliderLinear` rows `min: 0, max: 1, step: 0.01`
  (`src/data/audioRigConfig.ts:133–221`, Width at `:264`), so the grid holds exactly `0` and exactly `0.5`
  (`50 * 0.01 === 0.5` in JavaScript). `audioStore`'s `GLOBAL_SETTER` routes `setGlobalAudio(effect, partial)` to the
  setter (`src/stores/audioStore.ts:94–155`); `applyGlobalAudioToEngine` (`:172`) re-sends every block whole at boot
  (`AudioEngine.ts:619–629`, after `buildGlobalFxChain()` at `:290`), on a seed, a session restore and a share link.
  A dark effect is seeded as the literal `wet: 0` (`src/utils/globalAudioSeed.ts:310–369`); Width is seeded in
  0.4–0.65 and never dark (`:372`). `sessionDiff.ts` quantises the Compressor, EQ, filters, rooms and Limiter
  (`:212–248`) and leaves the ten blocks' values as stored, so a `0` survives a save. None of the ten is an LFO or swell
  target (`getGlobalModulationTarget :1099` names EQ and filters only; the pedal and colour docs guards pin it).
- **Tone 15.1.22, read from `build/esm`.** `Effect` (`effect/Effect.js:17–43`): `input` (Gain) fans to
  `_dryWet.a` and `effectSend`; `effectReturn` → `_dryWet.b`; `output = _dryWet`, a `CrossFade`; `wet` is
  `_dryWet.fade`. `CrossFade` (`component/channel/CrossFade.js`) feeds a constant 1 through a `StereoPanner` whose
  `pan` is `2·fade − 1` (`GainToAudio`) and splits it into the two gains, so **a = cos(fade·π/2), b = sin(fade·π/2)**:
  equal power. `StereoWidener` (`effect/StereoWidener.js:13–14`): `Mid *= 2(1 − width)`, `Side *= 2·width`, so
  0.5 is unity; it extends `MidSideEffect` → `Effect` and has its own `wet`, left at 1. The browser does not skip a
  connected node whose output is faded to zero; it does skip (after tail time) a node whose inputs are disconnected
  and silent, and it never processes a node with no path to the destination.
- **The measurements this spec answers to** (intent, and `scratchy-audio-phones.md`). Pixel 8, Full, 3:00, hands
  off, seed-`alpha` baseline: `main d29ac778` 36 (run 1) and 94 (run B, stayed clean through drawer browsing to 4:00);
  branch `f0ddc8eb` with every new pedal dark 380 and a hands-off runaway from about 2:50 (run A); with the Chorus alone
  lit 360 and the same collapse (C1); the six-lit worst case 92 at 3:00 then a runaway after drawer browsing. Desktop,
  raw Tone 15 in headless Chrome, 30 s OfflineContext, 5 interleaved rounds, medians, in ‰ of one core (extra ms per
  audio second), dark in chain / dark disconnected: Phaser (10 st) 57 / 5.5, AutoWah 32 / 3.8, shifter 23 / 4.5,
  Chorus 19 / 5.0, Tremolo 17 / 7.6, Width 14 / 4.4, BitCrusher 13 / 6.4, Vibrato 11 / 3.3, Chebyshev 7 / 0.7,
  Distortion 6 / 0; **all ten 213 / 48**. The residual 48 is the effects' own LFOs, constant signals and the
  BitCrusher's worklet, which run while the nodes exist. Probe files: §5.

**Assumptions** (each a veto point; the plan's T0 confirms them with Crawford before T1):

1. **Dark is exact.** A Mix effect is dark when its stored `wet` is exactly `0`; the Width stage is dark when its
   stored `width` is exactly `0.5`. No threshold, no Active toggle (the house rule from the LFO and Layer toggle
   removals). The value tested is the clamped slider position the setter receives, before the taper.
2. **Mechanism: a bypass cell around each of the ten effects, on a fixed topology.** Each effect sits in its own
   cell: `in` (Gain) → `dry` (Gain) → `cut` (zero-delay `Tone.Delay`), and `in` → *effect* → `wet` (Gain) → `cut`.
   The chain connects cell to cell (`prev.cut → next.in`); the cell's four nodes and its fixed edges are always
   present. **The effect's two edges (`in → effect`, `effect → wet`) exist only while it is lit.** The effect's own
   `wet` is pinned at `1` and the Mix law moves to the cell's gains: `dry.gain = cos(w·π/2)`,
   `wet.gain = sin(w·π/2)` with `w = colourWetGain(mix)`, which is Tone's `CrossFade` law exactly, so a lit effect
   sounds as it does today (from Mix 0.04 up; below that Tone's law has a −56 dB wet floor the cell does not: §8.1). The alternative, splicing the effect in and out of a single-path chain while it passes
   dry at `wet 0` (the intent's "local splice" or a whole-chain rewire), is rejected: every such swap adds or removes
   a path carrying the full signal, and the render thread can see the half-swapped graph for one quantum whenever a
   quantum boundary falls inside the main thread's two or more calls (Tone's cycle search runs between them). That is
   a gap or a doubling, timing-dependent, and it cannot be ramped. In the cell, **every graph mutation adds or removes
   a path whose gain is zero**, so a crossing is inaudible by construction, and the measurement in §5 confirms rather
   than decides. Cost: three Gains and one Delay per cell, forty trivial nodes; the probe prices them (§5).
3. **The cell's cut bounds every cycle search.** With a `cut` at each cell's output, a connect anywhere in the chain
   stops at the next cut, so power-on, a crossing, a Decay flip and a Phaser rebuild each cost a walk over one cell,
   whatever is lit. Without it, each lit cell is one more diamond: two lit is ×4 on today's downstream walk and ten
   hand-lit is ×1024, which `chainCycleSearch.test.ts` shows is seconds. The existing entry and post-filter cuts stay
   (the bus and LFO-link connects still stop at them).
4. **Crossing protocol, per cell, through the one setter.** *Light* (a Mix from `0` to non-zero; Width from `0.5` to
   anything else): cancel a pending darken; if the effect is disconnected, connect `in → effect` and `effect → wet`
   now (the `wet` gain is `0`, so the new path is silent); then ramp `dry` / `wet` to the law over
   `COLOUR_RAMP_SECONDS`. *Darken* (to exactly `0` / `0.5`): ramp `dry` / `wet` to `1` / `0` over
   `COLOUR_RAMP_SECONDS` (Width's own `width` ramps to `0.5` concurrently, as today), then arm the cell's one
   `Tone.getContext().setTimeout` for `lookAhead + COLOUR_RAMP_SECONDS + BYPASS_DISCONNECT_MARGIN_SECONDS` (0.01);
   when it fires and the cell is still dark, disconnect the two effect edges (both ends, so the effect has no input
   and no path to the destination). Ramps start `lookAhead` ahead of the audio thread and a disconnect does not, so
   the wait is the Spread duck's, extended by the ramp. A re-light before the timer fires cancels it and ramps up on
   the still-connected effect; a drag across `0` arms at most one timer per cell; a re-sent equal value is a no-op.
   This is a parameter de-click on the audio clock, not musical timing (CLAUDE.md's rule is not engaged, as
   recorded for the Spread duck). A whole-block apply (boot, seed, restore, share) lights the lit cells
   synchronously, before any note is scheduled.
5. **Width's cell crossfades linearly, not equal-power.** At `0.5` the widener is unity, so during its crossing the
   two paths carry identical signals; an equal-power fade of two identical signals peaks at +3 dB midway. Width's
   cell uses `dry = 1 − f`, `wet = f`, with `f` ramped between `0` and `1`; the sum is constant. When lit it rests at
   `f = 1`, so Width's sound is the widener's alone, as today.
6. **The rooms' Controlled-Decay join stays at the Width cell's `in`, lit or dark.** The intent said the returns
   would move to the Limiter while Width is out; the cell makes that rewire unnecessary: a dark Width cell passes the
   returns through `dry` at unity, which is the Limiter route by another name, and the widener itself is out of the
   graph (the saving the join move was for). Natural Decay joins at the Compressor's input, unchanged. **A
   deviation from the intent's wording with the same outcome; Crawford confirms at T0.**
7. **The Phaser rebuild is local to its cell.** `rebuildPhaser` builds the new node at `wet: 1` from the mirror,
   disconnects the old one's two edges if lit, connects the new one's if lit, disposes the old node, and no longer
   rewires the chain. A pending darken timer is keyed by the cell, not the node, so it finds the current effect.
8. **The Spread duck rides the cell's Mix.** `writeSpread` ducks by ramping the cell's gains to dry and back (the
   effect's `wet` is pinned), with its timing unchanged. A duck never darkens: the cell stays connected. A darken that
   arrives mid-duck sets the duck's return level to dry; the darken timer then disconnects. `_spreadWetGain` becomes
   the cell's Mix target, shared by both mechanisms.
9. **At build, every cell is dark**: effects constructed as today (LFOs started), none connected. `AudioEngine.start`
   then applies the seeded `globalAudio` and the lit ones connect. A world with nothing lit never has any of the ten
   in the graph; today's build-then-apply order is unchanged.
10. **Disconnect only, no teardown.** A dark effect stays constructed; its LFOs and signals run; the BitCrusher's
    worklet stays registered. The remaining ~48 ‰ is the next lever, not this one (intent).
11. **Nothing stored changes.** `GlobalAudioSettings`, the seed draws and odds, the two-lit cap, `sessionDiff`, the
    share codec, the drawer, every label: untouched. The cells are module state in `globalFx.ts`
    (`_cells: Record<BypassKey, Cell>`), never in Zustand. `BypassKey` is the ten effect keys.
12. **Headless and failure paths.** Cells need `Gain` and `Delay` constructors; both are already required by the
    chain (returns, master, cuts). With either absent, or a cell's construction throwing, that effect is left out of
    the chain with one `devWarn` and its setter still no-ops safely (today an absent *effect* is skipped the same
    way). An effect whose own constructor fails leaves an empty cell wired dry, so the chain never breaks.
13. **One HUD token, no UI.** The `?debug` overlay's fx line (`src/components/debug/hudLines.ts:46`) gains
    ` · fx in 2/10`: how many of the ten are connected. It is the only way to confirm on the phone that a world is
    running the graph it should, and the HUD is diagnostics, not the drawer. Nothing in `ScreenViewport` changes.
14. **Cost ceiling.** The cells' own price is bounded by the probe: all ten dark, in cells, ≤ 70 ‰ on the desktop
    (today 213; 48 is the floor the effects' running LFOs set, and 40 trivial nodes should add under ~20). If the
    cells measure above that, assumption 3's cuts are the first suspect and are re-priced alone.
15. **Timing constants.** `COLOUR_RAMP_SECONDS` (0.05) is the crossing's ramp, as it is today's Mix ramp;
    `BYPASS_DISCONNECT_MARGIN_SECONDS = 0.01` is new and sits beside `SPREAD_WRITE_MARGIN_SECONDS`.
16. **Roadmap: inside 50.6.** The pedals cannot ship without this, and it lands in the same PR, so it is a section of
    roadmap 50.6's entry and of GLOBAL_PEDALS.md's §8 as-built, with this spec linked, not a 50.7. T17 writes it.
17. **Docs guards are re-pinned, not loosened.** `globalPedalsDocs.test.ts:151–152` pin the `chainNodes` array and
    the `join` line by regex; both lines change shape and the regexes are rewritten to the new lines (the Width cell
    between the Compressor's and the Limiter's; the join `controlledDecay ? widthCell.in : _globalCompressor`).

---

## 1. Overview & Claude Explanation

The Pixel's audio thread was paying for ten effects that were silent. Tone's `Effect` runs its wet path behind a
crossfade at any Mix, and a connected node is processed whether or not anything hears it. This phase puts each effect
in a small fixed cell and connects the effect itself only while it is lit. The chain's shape never changes; only two
edges per cell appear and disappear, and both are silent at the moment they do.

### 1.1 The cell

```text
                 ┌─ dry (Gain, cos) ──────────────────────┐
prev.cut ─► in ──┤                                        ├─► cut (Delay 0) ─► next.in
                 └─ [effect (wet pinned 1)] ─► wet (Gain, sin) ┘
                     ▲ these two edges exist only while lit
```

```ts
// src/engine/audioEngine/globalFx.ts
type BypassKey = 'distortion' | 'chebyshev' | 'bitCrusher' | 'autoWah' | 'phaser'
  | 'chorus' | 'tremolo' | 'vibrato' | 'frequencyShifter' | 'stereoWidener';

type Cell = {
  in: Tone.Gain; dry: Tone.Gain; wet: Tone.Gain; cut: Tone.Delay;
  effect: Tone.ToneAudioNode | null;   // the Phaser's is replaced by rebuildPhaser
  connected: boolean;                  // the two effect edges are present
  mix: number;                         // the law's input: colourWetGain(wet), or Width's f (0 | 1)
  darken: number | null;               // the pending Tone.getContext().setTimeout id
};
const _cells: Partial<Record<BypassKey, Cell>> = {};
const BYPASS_DISCONNECT_MARGIN_SECONDS = 0.01;

/** Tone's CrossFade law (component/channel/CrossFade.js: a constant through a StereoPanner at pan 2·fade − 1). */
export function cellGains(w: number): { dry: number; wet: number } {
  return { dry: Math.cos(w * Math.PI / 2), wet: Math.sin(w * Math.PI / 2) };
}
/** Width's cell: identical signals on both paths at 0.5, so a linear fade keeps the sum constant. */
export function widthCellGains(f: number): { dry: number; wet: number } {
  return { dry: 1 - f, wet: f };
}
```

### 1.2 The crossing

```ts
/** A Mix write for a cell: light it if it was dark, ramp the law, or ramp to dry and arm the disconnect. */
function writeCellMix(key: BypassKey, mix: number): void {
  const cell = _cells[key];
  if (!cell?.effect) return;
  const w = key === 'stereoWidener' ? (mix === 0.5 ? 0 : 1) : colourWetGain(mix);
  if (w === cell.mix && (w > 0) === cell.connected && cell.darken === null) return;   // re-sent: nothing to do
  cell.mix = w;
  const context = Tone.getContext();
  if (w > 0) {
    if (cell.darken !== null) { context.clearTimeout(cell.darken); cell.darken = null; }
    if (!cell.connected) connectEffect(cell);            // the wet gain is 0: a silent path appears
    rampCell(cell, w, COLOUR_RAMP_SECONDS);
    return;
  }
  rampCell(cell, 0, COLOUR_RAMP_SECONDS);                // dry 1, wet 0
  if (cell.darken !== null) context.clearTimeout(cell.darken);
  cell.darken = context.setTimeout(() => {
    cell.darken = null;
    if (cell.mix === 0 && cell.connected) disconnectEffect(cell);   // the wet gain is 0: a silent path goes
  }, context.lookAhead + COLOUR_RAMP_SECONDS + BYPASS_DISCONNECT_MARGIN_SECONDS);
}
```

`connectEffect` is `cell.in.connect(effect); effect.connect(cell.wet)`; `disconnectEffect` is
`cell.in.disconnect(effect); effect.disconnect(cell.wet)` (Tone's `disconnect(destination)`), both try/caught with a
`devWarn`. `rampCell` writes the two gains through `rampOrSet` with the key's law. The ten setters replace their
`rampOrSet(node.wet, colourWetGain(wet), …)` line with `writeCellMix(key, wet)`; `setGlobalStereoWidener` ramps
`node.width` as today *and* calls `writeCellMix('stereoWidener', width)`. The Spread pair's `writeSpreadPedalWet`
records the cell's Mix target and, outside a duck, calls `rampCell`; `finishSpreadDuck` ramps back to it.

### 1.3 The chain

`buildGlobalFxChain` builds each effect as today, at `wet: 1` instead of `0` (the widener's `wet` was already 1), then
`buildCell(key, effect)` for each of the ten; a failed cell leaves `_cells[key]` undefined and the effect unwired.
`wireGlobalFxChain(controlledDecay)` keeps its shape:

```ts
const chainNodes = [
  _entryCut, _globalEQ, _globalLPF, _globalHPF, _filterCut,
  ...cellSpan('distortion'), ...cellSpan('chebyshev'), ...cellSpan('bitCrusher'),
  ...cellSpan('autoWah'), ...cellSpan('phaser'),
  ...cellSpan('chorus'), ...cellSpan('tremolo'), ...cellSpan('vibrato'), ...cellSpan('frequencyShifter'),
  _globalCompressor, ...cellSpan('stereoWidener'), _globalLimiter,
].filter(Boolean);
// cellSpan(key) → [cell.in, cell.cut] (the chain enters at `in` and leaves at `cut`), or [] for an absent cell.
// After the chain loop, each present cell's fixed edges: in → dry → cut, wet → cut, and in → effect → wet when
// cell.connected, so a Decay flip or a rebuild restores exactly what was lit.
const join = (controlledDecay ? _cells.stereoWidener?.in : _globalCompressor) ?? _globalLimiter ?? _globalCompressor;
```

`disconnectAllFxNodes` lists every cell's four nodes in chain position, still walked downstream-first. The join
falls back to the Limiter when the Width cell is absent, as it does today without a widener.

### 1.4 What does not change

The store, `applyGlobalAudioToEngine`, `GLOBAL_SETTER`, `reapplyTempoSyncedValues`, every `*Settings` type and
default, the seeder and its oracles, `sessionDiff`, the share codec, the drawer, the content layer, the load budget,
the entry cut and `getGlobalChainEntry`, the rooms and their sends and returns, the output taps. The Phaser's mirror
and `buildPhaser` stay; only `rebuildPhaser`'s tail changes (assumption 7).

### 1.5 Why this and not a threshold

T15b (`LOAD_PEDAL_MIN`, a Mix floor under the Audio Load Budget) assumed a lit pedal was the cost. Run A showed a
dark pedal costs the same as a lit one, so a floor on Mix would have changed nothing; it is dropped (the plan's status
line records it). Teardown (dispose at dark, rebuild at light) would reach 0 ‰ but adds construction and a Phaser-style
rebuild at every lighting; it stays the next lever.

---

## 2. Target File Structure

```text
src/
├── engine/
│   ├── audioEngine/globalFx.ts            Cell, _cells, cellGains, widthCellGains, writeCellMix, connect/disconnectEffect,
│   │                                      rampCell, buildCell, cellSpan; ten setters call writeCellMix; rebuildPhaser local;
│   │                                      wire/disconnect lists carry the cells; join at the Width cell's in
│   ├── audioEngine/globalFx.test.ts       chain-order cases re-pinned to cells; new: law, membership, protocol, timer, duck
│   ├── audioEngine/globalFx.headless.test.ts   no Gain / no Delay: effects left out, setters no-op
│   ├── audioEngine/chainCycleSearch.test.ts    one more case: a chain of cells costs one cell's walk per connect
│   ├── AudioEngine.ts                     re-exports unchanged; nothing else
│   ├── AudioEngine.test.ts                widener case (:2650) and priming fixture re-pinned to the cell
│   └── audioDiagnostics.ts                `fxConnected` (0–10) in the snapshot, read from globalFx
├── components/debug/hudLines.ts (+ test)  the fx line's ` · fx in n/10` token
└── docs/globalPedalsDocs.test.ts          :151–152 regexes rewritten to the cell lines
docs/
├── intent/dark-effect-bypass.md           the intent (committed 47ce45d3)
├── specs/DARK_EFFECT_BYPASS.md            this file
├── tasks/DARK_EFFECT_BYPASS.md            the plan (next phase)
├── specs/GLOBAL_PEDALS.md                 §8 as-built entry pointing here (T17)
├── AUDIO_SYSTEM.md                        Signal Graph: the cells, the dark rule, the join (T17)
├── reference/GLOBAL_CHAIN_GRID.md         chain-order line: a cell per effect, dark effects out (T17)
├── todo/roadmap.md                        50.6 entry: the bypass as part of it (T17)
├── todo/backlog.md                        27 resolved by this; a new note: EQ/filters at neutral stay in (out of scope)
└── todo/scratchy-audio-phones.md          round 3: the three re-runs with counts (T14 re-run)
```

Not touched: `src/types/`, `src/data/`, `src/utils/globalAudioSeed.ts`, `src/utils/sessionDiff.ts`,
`src/stores/audioStore.ts`, `src/content/`, `src/components/panels/`.

---

## 3. Implementation Boundaries & Constraints

- **Strict scope:** the files above. No change to any `*Settings` type, default, seed draw, odds, cap, stored JSON,
  share code, drawer row or copy string. No new dependency.
- **The ten, and only the ten.** EQ3, the LPF and the HPF stay in the chain at neutral: they are cheap built-ins and
  LFO targets that would flap through neutral (intent, out of scope; a backlog note). The Compressor and Limiter are
  the Output stage and stay. The rooms are untouched.
- **Every graph mutation is silent at the moment it happens** (assumption 2). No connect or disconnect of a path
  whose gain is non-zero, in either direction, ever. A reviewer can check this by inspection of `connectEffect` /
  `disconnectEffect`'s call sites.
- **Every AudioParam write and every graph edit lives in `globalFx.ts`**, reached through the `AudioEngine.setGlobal*`
  setters from `audioStore` actions or `applyGlobalAudioToEngine`, never from a GSAP callback or a React effect
  (Strict Separation). The darken timer is `Tone.getContext().setTimeout`, the audio-clock timer the Spread duck and
  `scheduleVoiceRelease` already use; never `setTimeout` / `requestAnimationFrame`.
- **State stays JSON-serialisable:** `_cells`, the timers and the nodes are module state in `globalFx.ts`.
- **Zero display strings in components or configs.** The HUD token is a diagnostics overlay, outside the content layer
  as the rest of `hudLines.ts` is; it adds no `src/content/` entry and no drawer text.
- **Nothing reaches the robot's body** (Visual Mapping guardrail) and nothing changes the seed (Replayability).
- **No "keep existing worlds the same" constraint** (pre-v1 rule), and none is needed: a lit effect's sound is
  unchanged by construction (the law is Tone's), which §5 proves by render, not by promise.
- **Guardrails untouched:** the cycle-search cuts are extended, not removed; `chainCycleSearch.test.ts` keeps its
  cases and gains one.
- **Protected paths:** `.env*`, `node_modules/`, build output.

---

## 4. Code Style & Architecture Conventions

```ts
// src/engine/audioEngine/globalFx.ts — a Mix setter after the change: one line moves, the rest is as it was
export function setGlobalVibrato(params: Partial<Omit<VibratoSettings, 'sync'>>): void {
  const vibrato = _cells.vibrato?.effect as Tone.Vibrato | null | undefined;
  if (!vibrato) return;
  try {
    const rate = clampIfGiven('vibrato.rate', params.rate);
    const depth = clampIfGiven('vibrato.depth', params.depth);
    const wet = clampIfGiven('vibrato.wet', params.wet);
    if (rate !== undefined) rampOrSet(vibrato.frequency, rate, COLOUR_RAMP_SECONDS);
    if (depth !== undefined) rampOrSet(vibrato.depth, depth, COLOUR_RAMP_SECONDS);
    if (wet !== undefined) writeCellMix('vibrato', wet);   // was: rampOrSet(vibrato.wet, colourWetGain(wet), …)
  } catch (err) {
    devWarn('[AudioEngine] setGlobalVibrato failed', err);
  }
}
```

- The `_global<Effect>` module variables may stay as aliases of `_cells[key].effect` for the setters' readability, or
  the setters read the cell; one way, chosen at T1 and kept.
- Names: `Cell`, `BypassKey`, `cellGains`, `widthCellGains`, `writeCellMix`, `connectEffect`, `disconnectEffect`,
  `rampCell`, `buildCell`, `cellSpan`, `BYPASS_DISCONNECT_MARGIN_SECONDS`. "Lit" / "dark" are the seeder's words and
  stay the words here; "connected" is the graph fact.
- Comments cite this spec by assumption number where a choice is not obvious from the code: the pinned `wet: 1`, the
  silent-path rule, Width's linear fade, the per-cell cut, the join at the dark Width cell, the timer's wait.
- Tests colocated; TDD per task (RED first); one commit per task; the mutation harness on `cellGains`,
  `widthCellGains`, `writeCellMix`'s branches and the timer; Prettier on touched files.

---

## 5. Testing & Verification Requirements

**Unit (Vitest), over the existing Tone mocks** (`globalFx.test.ts`'s connect/disconnect spies and its
`Tone.getContext().setTimeout` fake, `:246–257`):

- **Law:** `cellGains(0) = {1, 0}`, `cellGains(1) = {0, 1}`, `cellGains(0.5) = {√½, √½}` (equal power: `dry² + wet² = 1`
  at every `w`); `widthCellGains(f) = {1 − f, f}`; every effect is constructed at `wet: 1`, the widener at `width: 0.5`.
- **Build is dark:** after `buildGlobalFxChain`, no effect has an edge from any `in` or to any `wet`; ten cells, each
  with three Gains and one Delay (`CHAIN_CUT_OPTIONS`), twelve Delays in all; `in → dry → cut` and `wet → cut` present.
- **Chain order, both Decay Modes:** entry cut → EQ3 → LPF → HPF → filter cut → the nine cells (`in`, `cut` pairs) →
  Compressor → Width cell → Limiter → masterGain; Natural joins both returns at the Compressor; Controlled joins at
  the Width cell's `in`, lit or dark; with no Width cell the Controlled join falls back to the Limiter.
- **Protocol:** a Mix `0 → 0.3` connects `in → effect` and `effect → wet` exactly once and ramps the gains to
  `cellGains(colourWetGain(0.3))`; a second `0.3` does nothing; `0.3 → 0` ramps to `{1, 0}`, arms one timer at
  `lookAhead + 0.05 + 0.01`, and disconnects both edges only when it fires; `0.3 → 0 → 0.2` before the timer fires
  cancels it, disconnects nothing, ramps up; a drag `0 → 0.1 → 0 → 0.1 → 0` leaves one pending timer and one
  disconnect; a fire after a re-light disconnects nothing. Width: `0.5 → 0.7` connects and ramps `f` to `1` with
  `width` to `0.7`; `0.7 → 0.5` ramps `f` to `0` and `width` to `0.5`, then disconnects; `0.5` re-sent does nothing.
  Exactness: `0.001` lights, `0.499` and `0.501` light Width, `-0` is dark.
- **Phaser rebuild:** a Stages change on a lit Phaser disconnects the old node's two edges, connects the new one's,
  disposes the old, and calls no chain rewire; on a dark Phaser it connects nothing; a pending darken timer fires on
  the new node; the chain-order and Decay-mode cases at `:1369–1403` are re-pinned to this.
- **Spread duck on the cell:** a lit Chorus's Spread write ramps the cell to dry and back, never disconnects; a
  darken mid-duck leaves the return level dry and the darken timer disconnects; the twenty existing duck cases are
  re-pinned to the cell's gains with their timings unchanged.
- **Whole-block apply:** `applyGlobalAudioToEngine` with two lit pedals connects exactly those two cells; a second
  apply of the same block connects nothing more and arms no timer (the re-sent rule, which the Spread skip needed for
  the same reason).
- **Failure paths:** no `Gain` constructor → no cells, chain wires EQ → … → Compressor → Limiter, every setter no-ops
  without a warning; a cell's `Delay` throwing → that effect left out with one `devWarn`; an effect constructor
  throwing → an empty cell wired dry; `connect` throwing inside `connectEffect` → `devWarn`, `connected` stays false.
- **Diagnostics:** `audioDiagnostics` reports `fxConnected`; `buildHudLines` renders ` · fx in 2/10`.
- **Cycle search:** `chainCycleSearch.test.ts` gains a case: a chain of ten lit fake cells (each a diamond with a delay
  at its output) costs the connect into the first one the walk of one cell, not 2¹⁰.
- **Guards:** `globalPedalsDocs.test.ts` re-pinned (assumption 17); `globalColourDocs` / `globalModulationDocs` still
  green (they pin no chain line); `content.test.ts` and lint clean.

**Verification steps (every task):** `npm run build:types`, `npm run lint`, `npm test`, `npm run build`, all clean
(the four T17 living-docs cases stay RED until T17, as today). Mutation harness on the pure helpers and the protocol.

**Desktop, headless Chrome (before the phone):**

1. **Lit sound unchanged, by render.** For each of the nine Mix effects at Mix `0.3` and `1`, an offline render of a
   test tone through Tone's own node at `wet = colourWetGain(mix)` against the same node pinned at `wet 1` inside a
   cell at `cellGains(colourWetGain(mix))`: sample difference ≤ 1e-5 peak after the first 0.2 s (the LFO phases are
   aligned by constructing both at the same offline time). Width at `0.7` through a cell at `f = 1` against the bare
   widener: the same bound.
2. **Crossings are inaudible, in a real-time context.** The Spread-duck recipe (GLOBAL_PEDALS.md §8: a native
   `AudioContext` under `Tone.setContext(new Tone.Context(…))`, a `ScriptProcessor` recorder, lookAhead 0.1,
   `--autoplay-policy=no-user-gesture-required`, metric = peak |second difference| in the 150 ms after the event over
   the steady state's). For each of the ten, light from dark at Mix `0.3` (Width `0.7`) and darken back, three runs
   each: **≤ ×1.6** (the bar the Spread duck met: ×1.3 / ×1.6), and no run of ≥ 64 consecutive near-zero samples
   while the tone sounds (no gap). Control: the same ramp with no graph change, ×1.
3. **Dark cost.** The raw-Tone probe re-run with the cell topology: all ten dark in cells **≤ 70 ‰** (assumption 14;
   today 213 in chain, 48 bare-disconnected); a single empty cell priced on its own; recorded per effect in the table
   in `scratchy-audio-phones.md`. Then `npm run perf:audio` on the seed-`alpha` baseline link, `main` against the
   branch served side by side, 240 s: render capacity mean and peak recorded, branch ≤ `main`.
4. **Main thread.** Power-on and a Decay flip over CDP (the hang-probe recipe from the Checkpoint A fix) with two
   pedals lit: power-on no slower than today's ~2 s; a flip ≤ today's 3–4 ms; one crossing ≤ 2 ms.

Probe files from the 2026-10-19 session (the scratchpad is per session, so the paths are absolute):
`C:/Users/Crawford/AppData/Local/Temp/claude/c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7/bb9d9e9b-9766-49d7-acec-219284e93504/scratchpad/dark-cost/`
(`index.html`, `probe.js`, a `node_modules` junction; serve with `npx vite <dir> --port 5199` from the repo) and
`…/scratchpad/dark-cost-drive.mjs` (`node dark-cost-drive.mjs http://localhost:5199/ 5 out.json`); results in
`…/scratchpad/dark-cost-5r.json`; the phone session payloads in `…/scratchpad/pedal-links.txt` and
`…/scratchpad/phone-gate-urls.txt`; a `main d29ac778` worktree at `…/scratchpad/main-d29ac778`. If the folder is gone,
the probe is rebuilt from GLOBAL_PEDALS.md §8's recipes (half a task).

**Phone gate (T14 re-run; Crawford's device, Pixel 8, `?debug`, Full, hands off to 3:00 then watched to 4:00; a fresh
page per run; `main` and the branch served side by side on the LAN as before, both rebuilt):**

1. **Run A again:** the seed-`alpha` baseline link, every new pedal dark. **Pass:** the HUD count at 3:00 within 25 %
   of a `main` run in the same sitting, and the count not accelerating between 3:00 and 4:00 (no runaway). `fx in`
   reads `0/10` (the baseline payload predates Width, so Width restores at `0.5`).
2. **An ordinary seeded world with two pedals lit** (found by cycling seeds with the HUD's seed readout; `fx in` reads
   `2/10` or `3/10` with Width): the same pass.
3. **The six-lit worst case** (set by hand: all six Modulation pedals at Mix 1, Phaser 12 stages, Width 1): only has
   to not run away hands-off; the count is recorded and not gated (intent).
4. A Standard run of 1 is recorded alongside, as T0/T14 did.

All counts, Crawford's words and the `fx in` readings go in `scratchy-audio-phones.md` as round 3, with the desktop
numbers above. On a miss, the lever is assumption 10's teardown, as its own intent.

**Manual listen (Crawford, desktop, before the phone):** each of the ten dragged from dark up and back down, slowly
and quickly, with a sustained chord sounding, including a wiggle across 0; Width 0.5 → 0 → 1 → 0.5 with a lit Delay
playing under Controlled Decay (the fold must still take the rooms' tails); a Natural ↔ Controlled flip with Width dark
and lit; a Phaser Stages change while lit and while dark; a Spread drag on a lit Chorus (still goes dry for ~0.25 s
while dragging, as recorded); save, reload and a share link with two lit pedals, `fx in` matching before and after;
an old `?session=` link.

---

## 6. Git & Workflow Context

- **Branch:** `feature/pedals` (Crawford's name for the Global Pedals build), on top of `47ce45d3` (the intent and the
  T14-miss records). This is the Global Pedals plan's inserted phase between T15 and T16: after it, T14 is re-run
  (the phone gate above), then T16 (Crawford's desktop listen, now including the list in §5) and T17 (docs).
- Plan file: `docs/tasks/DARK_EFFECT_BYPASS.md` (the next phase, `planning-and-task-breakdown`); the Global Pedals
  plan's status line already points here.
- One commit per task, RED first, imperative subject, no conventional-commit prefix, the session's co-author line.
  Commits only when Crawford says so; he creates PRs and merges.
- The two preview servers from 2026-10-19 (`:4173` main, `:4174` branch) are stale once the bypass builds; kill them
  before serving the re-run (the memory notes stale previews held ports before).
- Repo index is LF; `docs/` working copies are mixed. This spec is CRLF to match GLOBAL_PEDALS.md and the intent;
  existing files are edited in their own endings.

---

## 7. Open Questions & Risks

1. **The cell (assumption 2) is a larger change than the intent's two options.** It replaces a single-path chain with
   ten four-node cells and pins every effect's `wet` at 1. The case for it is that a splice or a whole-chain rewire
   cannot be made inaudible by timing, only made unlikely to click, while the cell is silent at every mutation. The
   case against is churn: most chain-order tests in `globalFx.test.ts` are re-pinned (listed in §5) and the Spread
   duck is rewritten onto the cell's gains. **Crawford's call at T0.** If he prefers the minimal splice, §5's
   real-time crossing probe becomes the deciding measurement and the spec is amended before T1. **Answered
   2026-10-19: Crawford chose the cell ("Cell for sure. Quality is paramount."); the plan is
   [docs/tasks/DARK_EFFECT_BYPASS.md](../tasks/DARK_EFFECT_BYPASS.md).**
2. **Forty extra nodes on the phone (assumptions 3, 14).** Each is trivial, but the phone has not seen them; the
   desktop probe prices them first (ceiling 70 ‰), and the per-cell cut is the one to drop if the cells are dear,
   accepting a bigger walk per crossing instead.
3. **The join no longer moves (assumption 6).** The intent's "rooms join at the Limiter while Width is out" becomes
   "rooms join at the dark Width cell, which is unity". Same sound, less code, one wording change for Crawford to
   confirm.
4. **A fresh world always lights Width.** The seeder draws Width in 0.4–0.65 and never `0.5` (`globalAudioSeed.ts:372`),
   so every seeded world keeps the widener connected (14 ‰ dark today, its lit price after this). Run A's link is a
   `main` payload and restores Width at `0.5`, so it does not show this. Whether a fresh seed should land on exactly
   `0.5` some share of the time is a seeding question for another spec; recorded here so the phone numbers are read
   with it in mind.
5. **The AutoWah starts cold when lit.** Its envelope follower sees nothing while disconnected, so the first tens of
   milliseconds after lighting sweep from the base frequency. The Mix ramps from 0 over the same time, so it should be
   inaudible; the real-time probe includes the AutoWah.
6. **A gap in the mock.** The unit tests prove edges and timings against spies; they cannot prove silence at a
   mutation. §5's desktop renders are the proof, and they are gated before the phone, not after.
7. **The timer's wait on a slow phone.** `lookAhead + 0.06` on a phone running `?latency=playback` is still well under
   a second; a disconnect that lands late only delays the saving, never clicks (the path is already silent). No risk
   to sound, a small one to the measurement if the phone is thrashing.
8. **Backlog 27** ("Phone Playback Underruns at Light Load, `main` Included") named the five `main` effects' presence
   as its first candidate. This phase is that fix; T17 closes the item with the counts.

---

## 8. As built

*(The plan's docs task, T15, completes this section, and GLOBAL_PEDALS.md §8 gets a pointer here. The desktop proofs
below are written as each one runs.)*

### 8.1 Lit sound unchanged, by offline render (T10, 2026-10-20) — PASS

**Recipe.** Raw Tone 15.1.22 in headless Chrome, served with `npx vite <site> --port 5199` from the repo (the site
folder holds `index.html`, `probe.js` and a `node_modules` junction to the repo's), driven over CDP by `drive.mjs`
(`node drive.mjs http://localhost:5199/ 1 out.json`; the 2026-10-19 dark-cost driver, unchanged). Probe files:
`C:/Users/Crawford/AppData/Local/Temp/claude/c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7/5bf05dc0-cd58-45f6-9633-c813096c5fe6/scratchpad/t10/`
(`site/probe.js`, `drive.mjs`, `table.cjs`, `run2.json`, `run3.json`). Each comparison is two renders, each in its own
fresh `OfflineContext` (2 s, 48 kHz, stereo) with every node built at offline time 0, so the LFO phases align:
**A**, the pre-cell build: Tone's bare node at `wet = colourWetGain(mix)`; **B**, the branch's build: the same node at
`wet 1` inside a cell (`in` → `dry` → `cut`, `in` → effect → `wet` → `cut`, `cut` a zero-delay `Tone.Delay` at
`CHAIN_CUT_OPTIONS`) at `cellGains(colourWetGain(mix))`. Source: a 440 Hz and a 1 kHz sine, different per side
(L 0.5 / 0.25, R 0.25 / 0.5) so the Spread, mid/side and widener paths see a stereo signal. Constructions are
`buildGlobalFxChain`'s at `DEFAULT_GLOBAL_AUDIO_SETTINGS`, except the FrequencyShifter at 120 Hz (its default 0 Hz is a
near-identity). The BitCrusher's worklet is awaited (`workletsAreReady()`) before each render. Metric: peak |A − B|
over both channels after the first 0.2 s. Beside it, the **effect share** (peak |A − a dry render|), so an identity
cannot pass because the effect did nothing, and two **controls** per effect that must miss: the wrong Mix (Tone at
0.3 against a cell at 0.5) and the wrong law (Width's linear law on a Mix effect at 0.3). Two runs, bit-identical.

| Effect | Mix 0.3 | Mix 1 | Effect share at 0.3 | Control: cell at 0.5 | Control: linear law |
|---|---|---|---|---|---|
| Distortion | 6.0e-8 | 2.3e-20 | 4.0e-2 | 4.9e-2 | 7.7e-2 |
| Chebyshev | 1.2e-7 | 0 | 1.7e-1 | 3.2e-1 | 1.2e-1 |
| BitCrusher | 1.2e-7 | 1.9e-19 | 9.8e-2 | 1.3e-1 | 9.8e-2 |
| AutoWah | 1.2e-7 | 0 | 1.1e-1 | 1.6e-1 | 9.9e-2 |
| Phaser (10 stages) | 1.8e-7 | 0 | 2.1e-1 | 3.6e-1 | 1.2e-1 |
| Chorus | 1.2e-7 | 0 | 1.1e-1 | 2.3e-1 | 9.6e-2 |
| Tremolo | 6.0e-8 | 0 | 7.1e-2 | 8.6e-2 | 8.8e-2 |
| Vibrato | 1.2e-7 | 0 | 1.1e-1 | 2.0e-1 | 8.9e-2 |
| FrequencyShifter | 1.2e-7 | 0 | 1.1e-1 | 2.2e-1 | 8.7e-2 |

Width 0.7 through a cell at `f = 1` against the bare widener: **0** (effect share 3.0e-1; control, a cell holding a
widener at 0.6: 1.5e-1). Width dark (the dry path of a cell at `f = 0`, widener unconnected) against the bare widener
at 0.5: **1.2e-7**, which confirms the widener is unity at 0.5 (assumption 5). Every lit difference is at most
1.8e-7, about one float32 step at these levels, against the 1e-5 bound; every control misses it by four orders or more.

**Finding: Tone's own law has a floor near 0, and the cell does not.** Tone's `CrossFade` turns `fade` into the
panner's `pan` through `GainToAudio`, a 1024-point `WaveShaper` of `|x|·2 − 1`. The curve's linear interpolation
flattens the kink at 0: every fade below 1/1023 reads the two equal points either side of it, so Tone's wet gain
never falls below `sin(π/2 · 1/1023)` = **1.535e-3 (−56.3 dB)**. That covers Mix 0, and Mix 0.01 to 0.03 too, since
`w = mix²` ≤ 9e-4 there and the slider steps by 0.01. So before the cells a "dark" effect was never fully dry: its
wet path sounded 56 dB down. The cell's dark is exactly dry, and its low Mixes follow `sin(w·π/2)`. Measured on the
same probe (peak |A − B|; the cell is always the quieter wet):

| Effect | Mix 0 (dark cell) | Mix 0.01 | Mix 0.03 | Mix 0.04 |
|---|---|---|---|---|
| Distortion | 5.2e-4 | 4.6e-4 | 4.1e-5 | 6.0e-8 |
| Chebyshev | 1.7e-3 | 1.5e-3 | 1.4e-4 | 6.0e-8 |
| BitCrusher | 1.2e-3 | 1.0e-3 | 9.1e-5 | 6.0e-8 |
| AutoWah | 1.3e-3 | 1.2e-3 | 1.0e-4 | 6.0e-8 |
| Phaser | 2.3e-3 | 2.1e-3 | 1.8e-4 | 7.5e-8 |
| Chorus | 1.2e-3 | 1.0e-3 | 9.1e-5 | 6.0e-8 |
| Tremolo | 8.6e-4 | 7.7e-4 | 6.8e-5 | 6.0e-8 |
| Vibrato | 1.2e-3 | 1.0e-3 | 9.1e-5 | 6.0e-8 |
| FrequencyShifter | 1.2e-3 | 1.0e-3 | 9.2e-5 | 6.0e-8 |

Each row matches the prediction `(1.535e-3 − sin(w·π/2)) × the effect's fully-wet peak` to within 0.3 % (computed by
`table.cjs`), and Mix 0.04 (`w` = 1.6e-3, above the floor) is back to an identity. The largest, the Phaser at Mix 0,
is 2.3e-3 against a 0.75-peak tone: 50 dB under the signal, a wet residue that is now gone rather than a change to
anything heard. So assumption 2's "Tone's `CrossFade` law exactly" (§1.1) holds from Mix 0.04 up. Below that, the
cell follows the formula Tone's law approximates.

### 8.2 Crossings are inaudible, in a real-time context (T11, 2026-10-20) — PASS

**Recipe.** The repo's own `src/engine/audioEngine/globalFx.ts`, imported by the probe page through Vite (the `@` alias
and `server.fs.allow` on the repo; one Tone instance, because the site's `node_modules` junction resolves to the
repo's), so the code measured is the shipped protocol: `buildGlobalFxChain`, the setters, `writeCellMix`'s `rampTo`
calls and its `Tone.getContext().setTimeout` disconnect. Tone runs on a native `AudioContext` (48 kHz, `baseLatency`
0.01) via `Tone.setContext(new Tone.Context(raw))`, `lookAhead` 0.1, in headless Chrome with
`--autoplay-policy=no-user-gesture-required`. Source: a sustained 440 Hz + 1 kHz stereo pair (L 0.065 / 0.035,
R 0.035 / 0.065, about −20 dBFS peak, under the Compressor's −18 dB threshold) into `getGlobalChainEntry()`, so it
passes the whole chain. The FrequencyShifter's shift is 120 Hz, as in §8.1. **Recorder:** an `AudioWorkletNode` on
Tone's Destination, posting 4 096-frame chunks stamped with `currentFrame`, so every sample sits on the context's own
timeline. This replaces the Spread probe's `ScriptProcessor`, whose chunks carry only an approximate time. The
context's `setTimeout` is wrapped to stamp each fire with `currentTime`, so the disconnect is located exactly.
**Metric** (the Spread-duck recipe): the peak |second difference| over both channels in the transition window,
divided by the steady state's. The window runs from 20 ms before the call (a light connects at the call) to 150 ms
after the later of the ramp's end (call + lookAhead + 50 ms) and the disconnect's fire. The steady state is the
larger of the 400 ms before the call and the 400 ms after the window, because a lit effect has its own, larger,
second difference. **Gap:** a run of ≥ 64 consecutive samples under −80 dBFS on either channel while the tone sounds.
Per effect and run: light (Mix 0.3; Width 0.7), a lit ramp up to 0.6 and back (controls: the same ramps with no graph
change), darken (0; Width 0.5), and a **wiggle** across 0 (0.1, 0, 0.1, 0 at 20 ms steps, a fast drag). Events are
1.2 s apart (the wiggle 1.4 s), three runs in one 212 s recording. After each event the probe reads
`getConnectedEffectCount()`: 1 after every light and 0 after every darken and wiggle, in all three runs, so each graph
change happened. Probe files:
`C:/Users/Crawford/AppData/Local/Temp/claude/c--Code-Fallboard-Studios-The-Still-Echo-pelagos-7/5bf05dc0-cd58-45f6-9633-c813096c5fe6/scratchpad/t11/`
(`site/probe.js`, `site/recorder-worklet.js`, `site/vite.config.mjs`, `drive.mjs`, `summary.cjs`, `final.json`; serve
with `npx vite <site> --port 5199` from the repo, then `node drive.mjs http://localhost:5199/ 3 out.json`).

| Effect | Light (runs 1 / 2 / 3) | Darken | Wiggle across 0 | Control: lit ramps |
|---|---|---|---|---|
| Distortion | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.01 / 1.01 / 1.01 | ×1.00 |
| Chebyshev | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 |
| BitCrusher | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.14 / 1.12 / 1.15 | ×1.00 |
| AutoWah | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 |
| Phaser | ×1.15 / 1.00 / 1.00 | ×1.00 / 1.19 / 1.19 | ×1.00 / 1.00 / 1.00 | ×0.52–0.99 |
| Chorus | ×0.99 / 0.99 / 0.99 | ×0.99 / 1.00 / 0.99 | ×1.01 / 1.01 / 1.00 | ×0.96–1.00 |
| Tremolo | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 |
| Vibrato | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 |
| FrequencyShifter | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.01 / 1.01 / 1.01 | ×1.00 |
| Width | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 / 1.00 / 1.00 | ×1.00 |

Worst of the 90 gated rows: **×1.19** (the Phaser's darken, runs 2 and 3), against the ×1.6 bar. No gap anywhere in
the recording. The darken's disconnect fired 160–219 ms after the call, after the ramp had ended on the audio thread
(call + 150 ms). Every wiggle armed exactly one disconnect, after its last step. The Phaser's light/darken spread
(×1.00–1.19) and its lit-ramp control dipping to ×0.52 are its own sweep moving the steady-state reference between
windows, not the crossing. **Control, a bare connect of a full-level path** (the two-tone straight to the
Destination): ×13.2 / 25.0 / 13.8 on connect and ×12.6 / 23.7 / 13.2 on disconnect. An earlier identical run gave
×3.98–26.8, depending on the sine's phase at the switch. So the metric sees a real click, and the cell's crossings
show none.

**Finding, not gated (T7's path):** a **lit** Phaser's Stages change clicks. It is the one connect made at the lit
gains (the same-Mix node swap; see Checkpoint A's inspection): 10 → 4 measured ×2.0–54.7 and 4 → 10 ×6.4–8.0 over six
changes each across two sessions, typically ×6–8. A dark Phaser's Stages change touches no edge. (Each Stages change
also fires 14 of Tone's own context timers, from disposing the old node.) The pre-cell build rewired the whole chain
on this change instead, which was not measured here. The fix, if wanted, is the Spread duck's pattern: ramp the cell to
dry, swap after lookAhead + the ramp + a margin, then ramp back. That pattern measured ×1.3 / ×1.6 (GLOBAL_PEDALS.md
§8).

**Fixed (Crawford: "fix the phaser stage click first", 2026-10-20): the Stages duck.** `writePhaserStages` in
`globalFx.ts`: while the Phaser's cell is connected, or a duck is already pending, a Stages change ramps the cell to
dry over `SPREAD_DUCK_SECONDS` (20 ms). It then arms one `Tone.getContext().setTimeout` at lookAhead + 20 ms +
`SPREAD_WRITE_MARGIN_SECONDS` (the Spread duck's timings and reasoning) and returns. `finishPhaserDuck` builds the
pending count at the bottom of the duck, with the wet gain at 0, so the T7 swap is now silent like every other
connect. It skips the build when a drag came back to the live count, then ramps the cell back to `cell.mix` over
20 ms. Every step of a drag re-arms the one timer, so only the last count is built. A Mix write during the duck is
recorded, not ramped (`writeCellMix(…, !_phaserDuck)`), and the duck returns to it. Other fields go to the live node
at once and into the mirror the new node is built from. A dark Phaser is still rebuilt at once. `setGlobalPhaser` now
handles Stages *before* the Mix, so a dark Phaser lit in the same call lights the new node rather than ducking the
old one. A re-sent count the duck is already heading for does nothing, and `buildGlobalFxChain` cancels a pending
duck (`resetPhaserDuck`). **Cost:** a lit Phaser goes dry for about 0.15 s on a Stages change (lookAhead + 20 ms +
10 ms, then 20 ms back), and stays dry through a Stages drag until it stops, as the Spread does. **Re-measured** on the
same probe (`t11/duck.json`, 3 runs): lit 10 → 4 **×0.82 / 0.91 / 0.90**, 4 → 10 **×0.92 / 0.93 / 0.93**. No gap. The
90 gated crossings are unchanged (worst ×1.16), and the bare-connect control clicked at ×14.9–37.0 in the same
recording. **Tests:** 17 new unit cases written first: 16 RED, plus the chain-rebuild cancel, which was green by
construction until a duck existed. 19 existing cases that changed Stages on a lit Phaser were re-pinned to fire the
duck's timer, and their gain assertions now include the duck's two ramps: 17 in `globalFx.test.ts`, two
seed-dependent ones in `AudioEngine.test.ts`, which fire only the timers the Stages call arms. Two more failed only
because an unconsumed one-shot constructor throw leaked from an un-fired lit case; they pass unchanged. **Mutation gate:**
17 mutants, all killed. M2 ("a pending duck does not keep the duck path") first survived. An 18th case killed it: a
darken firing inside the duck, then a second Stages change, must keep one duck, so the last count wins.

### 8.3 Dark cost and render capacity (T12, 2026-10-20) — PASS

Full tables, recipe and files in `docs/todo/scratchy-audio-phones.md`, "Dark-Effect Bypass, desktop after — T12".
**(a)** The 2026-10-19 offline dark-cost probe, extended with the cell exactly as `buildGlobalFxChain` builds it:
all ten dark in cells **38.3 ‰** (rounds 35.1–39.6) against assumption 14's ≤ 70. Same-sitting references: the old
build's ten inline 150.6 and the ten disconnected 32.4. The sitting ran about 0.7× the 2026-10-19 one (213 / 48), so
about 54 ‰ on that scale, still a pass. Each effect dark in its cell costs 1.0 (Distortion, Chebyshev) to 5.4 ‰
(BitCrusher), about what disconnecting alone cost. One empty cell costs 0.5 ‰ and ten cost 4.8, so assumption 14's
"40 trivial nodes should add under ~20" holds with room to spare. The rest is the effects' running LFOs, signals and
worklet; only assumption 10's teardown would reach it. **(b)** `npm run perf:audio`, T0's link and recipe, three
interleaved rounds: branch `1421c023` mean **0.431** / peak window **0.502** against `main` `d29ac778` **0.460** /
**0.580**. That is below `main` in every round on both, where T0's branch was 0.624 / 0.752. `main` reproduced T0
(0.455 / 0.570). The branch now beats `main` because `main`'s own five dark effects still run inline at wet 0.
