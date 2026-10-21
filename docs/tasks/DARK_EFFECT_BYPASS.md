# Implementation Plan: Dark-Effect Bypass — a Dark Global Effect Leaves the Signal Path

Spec: [docs/specs/DARK_EFFECT_BYPASS.md](../specs/DARK_EFFECT_BYPASS.md). Intent:
[docs/intent/dark-effect-bypass.md](../intent/dark-effect-bypass.md). Part of roadmap **50.6 Global Pedals**
([the pedals' plan](GLOBAL_PEDALS.md)): this is the phase inserted between its T15 and T16 after T14 missed. Build
branch `feature/pedals`, on top of `47ce45d3`. **Crawford chose the cell mechanism (spec assumption 2) on 2026-10-19:
"Cell for sure. Quality is paramount."**

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run dev`, `npm run perf:audio`; the desktop probes run in headless Chrome from the session scratchpad (spec §5);
the phone gate is the `?debug` HUD on the Pixel (spec §5).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

> **Status (2026-10-20): COMPLETE.** T0–T15 committed on `feature/pedals`. Checkpoints A and B passed (Crawford,
> Checkpoint B: "ok, everything passed"). T14 **passed with a caveat** by Crawford's call: fresh-phone runs read about
> `main`'s level, and the late-sitting collapse also hits `main` (backlog 27, still open). Back to
> [GLOBAL_PEDALS.md](GLOBAL_PEDALS.md) T16 (Crawford's listen) and T17 (the docs for all of 50.6, describing the cells).

## Overview

Each of the ten global effects (Distortion, Chebyshev, BitCrusher, AutoWah, Phaser, Chorus, Tremolo, Vibrato,
FrequencyShifter, StereoWidener) gets a fixed four-node **bypass cell** in `src/engine/audioEngine/globalFx.ts`:
`in` → `dry` → `cut`, and `in` → effect → `wet` → `cut`. The effect's own `wet` is pinned at 1 and the Mix law moves to
the cell's two gains as Tone's own equal-power law, so a lit effect sounds exactly as today. The effect's two edges
exist only while it is lit; they are made and broken only while the `wet` gain is zero, so every crossing is inaudible
by construction. A dark effect then has no input and no path to the destination, and the browser stops processing it.
The work is: pure helpers → the topology (sound unchanged) → the crossing protocol, one effect at a time by Tone family
→ the Phaser rebuild and the diagnostics → four desktop proofs in headless Chrome → Crawford's listen → the phone
re-run → docs. Every task is RED first, mutation-checked, one commit, suite / types / lint / build green.

## Architecture Decisions

- **Pure law first (T1).** `cellGains` and `widthCellGains` are exported, tested against Tone's `CrossFade` law by
  value (`dry² + wet² = 1`, the ends, the midpoint) and mutation-gated before any node exists. The constant and the
  types land with them so later tasks only wire.
- **The topology lands transparent (T2), then the law moves (T3–T6).** T2 builds every cell with its effect
  *connected* and the cell at `dry 0 / wet 1`, while each effect keeps writing its own `wet` as today: the graph has
  its final shape and the sound is byte-identical, so the big re-pin of the chain-order tests happens once, against a
  build whose sound nothing can have changed. T3 then introduces the protocol on one effect; T4–T6 migrate the rest by
  Tone family. **Every commit leaves the app sounding right.**
- **One effect carries the whole protocol (T3: the Vibrato).** It is the plainest `Effect` (one LFO, no Spread, no
  rebuild). The light / darken / timer / re-sent / drag cases are written once there, in full, and T4–T6 add only what
  differs (the Spread duck, Width's linear law, the Phaser's rebuild).
- **The Spread duck is re-pointed, not rewritten (T5).** `writeSpread` / `finishSpreadDuck` keep their timing and
  structure; the two ramps they issue move from `node.wet` to the cell's gains, and `_spreadWetGain` becomes the
  cell's Mix target. The twenty duck cases are re-pinned to assert the cell's gains.
- **Width is its own law and its own task (T6).** Linear, not equal power (spec assumption 5), the `width` ramp
  concurrent with the fade, the Controlled-Decay join at its `in` lit or dark (assumption 6).
- **The Phaser rebuild stops rewiring the chain (T7).** Once its cell exists, the rebuild swaps the effect inside the
  cell; the three "re-wires the chain" cases become "touches only its cell".
- **Proofs before ears, ears before the phone (T10–T13, then Checkpoint B, then T14).** The unit tests prove edges
  and timings; they cannot prove silence at a mutation. The desktop renders and the real-time crossing probe are the
  proof, gated to numbers (spec §5), and a miss **stops** with options rather than a retune.
- **The probes live in the scratchpad, their numbers in the docs.** As the Spread-duck and dark-cost probes did: no
  probe code enters the repo; results, recipes and the probe's location go in spec §8 and
  `scratchy-audio-phones.md`.
- **Docs for the whole of 50.6 stay with the pedals' T17.** This plan's T15 writes only what is this phase's own
  (spec §8, the two plans' status lines, backlog 27, the HUD line in `AUDIO_OUTPUT_DIAGNOSTIC`'s successor if any);
  AUDIO_SYSTEM's Signal Graph, the grid's chain line and the roadmap entry are T17's, which now describe the cells.

## Dependency Graph

```
T0 desktop baselines before the build (perf:audio main vs branch; power-on + Decay flip over CDP) ─────────┐
                                                                                                          │
T1 cellGains / widthCellGains / BypassKey / Cell / BYPASS_DISCONNECT_MARGIN_SECONDS (pure)                │
 └─► T2 ten cells, transparent; chain through cells; join at the Width cell; failure paths; re-pins       │
      ├─► T3 the protocol on the Vibrato: writeCellMix, rampCell, connect/disconnectEffect, the timer      │
      │    ├─► T4 the six plain Mix effects migrate (Distortion, Chebyshev, BitCrusher, AutoWah, Phaser, shifter)
      │    │    └─► T7 the Phaser rebuild is local to its cell                                             │
      │    ├─► T5 Chorus + Tremolo migrate; the Spread duck rides the cell                                 │
      │    ├─► T6 Width: linear law, concurrent width ramp, join lit or dark                               │
      │    └─► T9 fxConnected in the diagnostics; the HUD token                                            │
      └─► T8 chainCycleSearch: a chain of cells costs one cell per connect                                 │
                                                                                                          │
                      Checkpoint A: all automated (after T1–T9)                                            │
                                                                                                          │
T10 lit sound unchanged, by offline render (needs T4–T6)                                                  │
T11 crossings inaudible, real-time probe (needs T4–T6)         — STOP on a miss                           │
T12 dark cost ≤ 70 ‰; perf:audio A/B (needs T6)                — STOP on a miss ◄──────────────────────────┘
T13 main thread: power-on, Decay flip, one crossing over CDP (needs T7) — compared with T0
                      Checkpoint B: Crawford's desktop listen — STOP
T14 phone gate re-run, round 3 (Crawford's device) — STOP
T15 this phase's docs: spec §8, both plans' status lines, backlog 27, memory
 └─► back to GLOBAL_PEDALS.md T16 (listen) and T17 (docs for all of 50.6)
```

T4, T5 and T6 are independent of each other after T3 and may run in any order; T8 needs only T2; T9 needs T3. T10,
T11 and T12 are independent of each other once T6 is in and may be interleaved in one headless-Chrome session; T13
needs T7.

---

## Phase 0: Before the build

### Task 0: Desktop baselines before the build

**Description:** The "before" numbers spec §5 steps 3 and 4 compare against, taken on the current tree so the cells
are measured against a known state. (a) `npm run perf:audio` on the seed-`alpha` baseline link (round 2's run A
payload, every new pedal dark), `main d29ac778` and `feature/pedals` served side by side (the `@page` form), 240 s,
one foreground run each, interleaved: render-capacity mean and peak per build. (b) Power-on time and a Decay flip's
main-thread time on the branch over CDP, with the headless hang-probe recipe from GLOBAL_PEDALS.md §8 (two pedals
lit). (c) Confirm the 2026-10-19 dark-cost probe folder still exists at the path in spec §5; if not, note that T12
rebuilds it. Kill the stale preview servers on `:4173` / `:4174` first and rebuild both.

**Acceptance criteria:**
- [x] A dated "Dark-Effect Bypass, desktop baselines" paragraph in `docs/todo/scratchy-audio-phones.md` with the two
  builds' hashes, the perf:audio means and peaks, the power-on and flip times, and whether the probe folder exists.
- [x] Measurement hygiene as `docs/PERFORMANCE.md` records it: foreground, one call at a time, no orphaned Chrome
  before or after (checked and stated).

**Verification:** the paragraph exists and every number in it came from a run in this task.

**Dependencies:** None. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (measurement, no code).

---

## Phase 1: The cell

### Task 1: The pure parts — `cellGains`, `widthCellGains`, `BypassKey`, `Cell`, the margin constant

**Description:** `globalFx.ts` gains `export function cellGains(w)` (`{ dry: cos(w·π/2), wet: sin(w·π/2) }`),
`export function widthCellGains(f)` (`{ dry: 1 − f, wet: f }`), the `BypassKey` union of the ten effect keys, the
`Cell` type (spec §1.1), an empty `_cells: Partial<Record<BypassKey, Cell>>` and
`BYPASS_DISCONNECT_MARGIN_SECONDS = 0.01` beside `SPREAD_WRITE_MARGIN_SECONDS`. Nothing uses them yet. The comment on
`cellGains` cites Tone's `CrossFade.js` (a constant through a `StereoPanner` at pan `2·fade − 1`) and assumption 2.

**Acceptance criteria:**
- [x] `cellGains(0)` is `{1, 0}`, `cellGains(1)` is `{0, 1}` (within 1e-12), `cellGains(0.5)` is `{√½, √½}`, and for
  `w` in 0, 0.1, …, 1 `dry² + wet²` is 1 within 1e-12; `dry` falls and `wet` rises strictly with `w`.
- [x] `widthCellGains(f)` sums to exactly 1 for every `f` in 0, 0.25, 0.5, 0.75, 1, and `widthCellGains(0)` is
  `{1, 0}`, `widthCellGains(1)` is `{0, 1}`.
- [x] `BYPASS_DISCONNECT_MARGIN_SECONDS` is exported and equals 0.01; the mutation gate kills a swapped `cos`/`sin`,
  a `π/4`, a `1 + f`, and a changed margin.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts`; `npm run build:types`.

**Dependencies:** None. **Files:** `src/engine/audioEngine/globalFx.ts`, `globalFx.test.ts`. **Scope:** S.

**As built (2026-10-19):** the empty `_cells` record moved to T2, its first consumer, because `noUnusedLocals` fails `build:types` on an unused module constant. `BypassKey` and `Cell` are exported for the same reason. Mutation gate: eight mutants, all killed (the plan's four plus a linear wet, a linear dry, Width wet `1 - f`, Width equal power).

---

### Task 2: Ten cells built transparent; the chain runs through them; the join moves; failure paths

**Description:** `buildGlobalFxChain` calls a new `buildCell(key, effect)` for each of the ten after constructing the
effect as today (`wet: 0` for now, so each effect still carries its own Mix): three `Gain`s (`in`, `dry` at gain 0,
`wet` at gain 1) and one `Delay` built through `buildChainCut`, the fixed edges `in → dry → cut`, `wet → cut`, and the
effect **connected** (`in → effect → wet`, `connected: true`, `mix: 1`). `cellSpan(key)` returns `[cell.in, cell.cut]`
or `[]`; `wireGlobalFxChain`'s `chainNodes` is rewritten with the nine `cellSpan`s between the filter cut and the
Compressor and Width's between the Compressor and the Limiter; after the chain loop each cell's fixed edges and, when
`connected`, its effect edges are re-made; `join = (controlledDecay ? _cells.stereoWidener?.in : _globalCompressor)
?? _globalLimiter ?? _globalCompressor`; `disconnectAllFxNodes` lists every cell's four nodes in chain position,
still walked downstream-first. Failure paths: no `Gain` or no `Delay` constructor → no cells, the ten effects left out
of the chain, one `devWarn`; a cell constructor throwing → that effect left out, one `devWarn`; an effect constructor
failing → an empty cell wired dry (`effect: null`). The `_global<Effect>` variables stay as aliases of
`_cells[key].effect` so the setters are untouched in this task. Re-pins in the same commit: the Gain mocks in
`globalFx.test.ts` and `AudioEngine.test.ts` gain `gain: { value, rampTo }`; `filterCutOf` becomes the second Delay
(index 1) and `AudioEngine.test.ts:1848`'s entry cut the first (index 0); the chain-order cases (`globalFx.test.ts`
`:554–635`, `:910–1015`, `:1539–1737`, `:2291–2536`, the two full-chain lines at `:2292` / `:2373`) assert
`prev.cut → cell.in` and the cells' internal edges; "constructs exactly two zero-delay Delay nodes" becomes twelve;
`globalPedalsDocs.test.ts:151–152`'s regexes are rewritten to the new `chainNodes` and `join` lines
(assumption 17); the headless test gains "no Gain / no Delay → no cells, every setter no-ops".

**Acceptance criteria:**
- [x] After `buildGlobalFxChain`: ten cells, thirty Gains for them plus the rooms' and master's, twelve Delays all at
  `CHAIN_CUT_OPTIONS`; each cell has `in → dry`, `dry → cut`, `wet → cut`, `in → effect`, `effect → wet`, and the
  effect has no other edge; `dry.gain` is 0 and `wet.gain` is 1.
- [x] Chain order in both Decay Modes: entry cut → EQ3 → LPF → HPF → filter cut → nine `[in, cut]` pairs in effect
  order → Compressor → Width `[in, cut]` → Limiter → masterGain → Destination; Natural joins both returns at the
  Compressor; Controlled at the Width cell's `in`; with no Width cell, Controlled falls back to the Limiter; a Decay
  flip disconnects and reconnects every cell node exactly once; the output taps survive a rewire as before.
- [x] Failure paths as described, each with its `devWarn` count; `getGlobalChainEntry` still returns the entry cut;
  the robot bus still connects into it; `npm test`, `npm run build:types`, `npm run lint` green (the four T17
  living-docs cases excepted, as today).

**Verification:** `npx vitest run src/engine/audioEngine src/engine/AudioEngine.test.ts src/docs`; `npm run build`;
`npm run dev` and a listen that a lit seed sounds as before (the cells are transparent).

**Dependencies:** T1. **Files:** `globalFx.ts`, `globalFx.test.ts`, `globalFx.headless.test.ts`,
`src/engine/AudioEngine.test.ts`, `src/docs/globalPedalsDocs.test.ts`. **Scope:** M (one concern, many re-pins).

**As built (2026-10-19):** the chain list holds `{ head, tail }` spans (`nodeSpan` / `cellSpan`), so the loop connects `prev.tail → next.head` and never shorts a cell's `in → cut`; the docs regex pins `cellSpan('…')` / `nodeSpan(…)`. `disconnectAllFxNodes` drops five nodes per cell (`in, dry, effect, wet, cut`), not four, so every rewire re-makes every edge from nothing; still downstream first. The cells are built in one pass after the ten effects and before the returns and master (the master stays the last Gain). An *absent* effect constructor gets no cell (skipped, as before); a *throwing* one gets the empty dry cell; a failed cell releases its effect (`dispose`). No Gain or Delay constructor: the ten effects are built, released and left out, with one `devWarn` only if any effect existed (none in the fully headless env). The `_global<Effect>` names are re-assigned from `cellEffect(key)` after the cells are built, so a left-out effect's setter no-ops; `rebuildPhaser` also sets `_cells.phaser.effect`. The cell's `cut` is built directly from `CHAIN_CUT_OPTIONS` in `buildCell`'s own try (not `buildChainCut`, whose warning names a cycle-search cut). `filterCutOf` is Delay index 1; `AudioEngine.test.ts`'s entry-cut lookups use `.at(-12)` (the first of a build's twelve). **Deviation:** `AudioEngine.test.ts`'s Gain mock is unchanged: giving it `rampTo` turned the robot-bus writes into ramps and broke five unrelated bus/send cases; T2 needs nothing from it, so the change waits for T4's priming case. Its `sendGains()` helper now also requires the Gain to feed a room (the cells' dry Gains are built at 0 too). Mutation gate (scratchpad `t2/mut.sh`): 24 mutants, 22 killed after adding the Limiter-absent case for "last is head"; 2 equivalent until T3 (`connected: true` and wiring on `cell.effect` alone, since every built effect is connected in T2): T3's dark-build cases must kill them. The listen (`npm run dev`, a lit seed sounds as before) is Crawford's.

---

### Task 3: The crossing protocol, on the Vibrato

**Description:** `writeCellMix(key, mix)`, `rampCell(cell, w, seconds)`, `connectEffect(cell)`,
`disconnectEffect(cell)` (spec §1.2), plus the build change for this one effect: the Vibrato is constructed at
`wet: 1` and its cell at `dry 1 / wet 0`, **disconnected** (`connected: false`, `mix: 0`), so a fresh build is dark
(assumption 9). `setGlobalVibrato`'s `wet` line becomes `writeCellMix('vibrato', wet)`. The protocol: light → cancel a
pending darken, connect if disconnected, ramp to `cellGains(colourWetGain(mix))` over `COLOUR_RAMP_SECONDS`; darken →
ramp to `{1, 0}`, arm the cell's one `Tone.getContext().setTimeout` at `lookAhead + COLOUR_RAMP_SECONDS +
BYPASS_DISCONNECT_MARGIN_SECONDS`, disconnect both edges on fire if still dark; a re-sent equal value with no pending
timer does nothing. `wireGlobalFxChain` re-makes the effect edges only when `connected` (T2 already does).

**Acceptance criteria:**
- [x] Build: the Vibrato has `wet.value` 1 and no edge from `in` or to `wet`; the other nine cells are unchanged
  (still transparent). `0 → 0.3`: `in.connect(effect)` and `effect.connect(wet)` exactly once, then
  `dry.gain.rampTo(cos(0.09·π/2), 0.05)` and `wet.gain.rampTo(sin(0.09·π/2), 0.05)`; `0.3` again: no call at all;
  `0.3 → 0`: ramps to 1 / 0, one timer at `0.1 + 0.05 + 0.01` (lookAhead 0.1), **no** disconnect yet; firing it:
  `in.disconnect(effect)` and `effect.disconnect(wet)` once each.
- [x] `0.3 → 0 → 0.2` before the fire: the timer is cleared, nothing disconnects, the gains ramp up, `connect` is not
  called again; `0 → 0.1 → 0 → 0.1 → 0` leaves exactly one pending timer and, after firing, one disconnect pair; a
  fire after a re-light disconnects nothing; `lookAhead` 0.03 gives a timer at 0.09.
- [x] Edges: `0.001` lights; `-0` is dark; `NaN` is ignored (no connect, no ramp); `2` clamps to 1 and lights at
  `{0, 1}`; a `connect` that throws → `devWarn`, `connected` stays false, the next light retries; no node → no-op.
  Mutation gate: a missing `clearTimeout`, a disconnect without the `mix === 0` check, a swapped connect order, a
  ramp of the wrong gain, a dropped margin — all killed.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts`; `npm run build:types`; `npm run dev`:
a seeded world with the Vibrato lit sounds as before, a Vibrato dragged up from 0 and back down has no click.

**Dependencies:** T2. **Files:** `globalFx.ts`, `globalFx.test.ts`. **Scope:** M.

**As built (2026-10-19):** `BUILT_DARK` (a `ReadonlySet<BypassKey>` beside `_cells`, `['vibrato']` for now) decides which effects `buildCell` builds dark (dry 1 / wet 0, `connected: false`, `mix: 0`); T4–T6 grow it until it is all ten and can go. `connectEffect` / `disconnectEffect` take `(key, cell, effect)` so the warning names the effect and the effect is the non-null one `writeCellMix` already checked. **Deviations from spec §1.2:** (1) the re-sent rule is `w === cell.mix && (cell.darken !== null || w > 0 === cell.connected)`, so a re-sent 0 while the disconnect is pending is a no-op (the spec's version re-ramped and re-armed); (2) a light whose `connect` throws returns before ramping (the spec ramped anyway, which would have pulled the dry gain down to cos(w) with nothing on the wet path) and `cell.mix` is set only after a successful connect; (3) a failed disconnect leaves `connected` true, so a later light only ramps and a re-sent 0 re-arms the disconnect (a retry, tested); (4) **added:** `buildGlobalFxChain` cancels every old cell's pending disconnect before dropping the cells, as `resetSpreadDucks` does for the Spread. Test helper: `cellOf` falls back to `cellByBuildOrder` (cells in chain order, three Gains each before the returns and master, cuts last) for an effect that was never connected, since a dark effect has no edge to its cell; the T2 cases split into dark / transparent via a test-side `BUILT_DARK`. Mutation gate (scratchpad `t3/mut.sh`, session e3af2385): 37 mutants, 36 killed, including T2's two equivalents (`connected: true`, wiring on `cell.effect` alone). 1 equivalent: dropping `cell.darken = null` after the light path's `clearTimeout` (a cleared id is never read while lit: the rule's `connected` half returns first, the next darken overwrites it, Tone never reuses ids); kept for the `Cell.darken` invariant. Suite 13 240 pass / 5 fail (the four T17 living-docs cases + `audioSwells` "ramp lifecycle", which passes alone: parallel-load timing); types, lint (4 old warnings), `vite build` clean. Prettier: the source's new lines are formatted; the test file's new cases follow the file's prevailing 120-column style, as HEAD's (660 flagged lines at HEAD). The listen (`npm run dev`: a lit Vibrato sounds as before, a drag from 0 and back has no click) is Crawford's.

---

### Task 4: The six plain Mix effects migrate; a whole-block apply is idempotent

**Description:** Distortion, Chebyshev, BitCrusher, AutoWah, Phaser and FrequencyShifter are built at `wet: 1` with
dark cells, and their setters' `wet` line becomes `writeCellMix(key, wet)`. The Phaser's mirror keeps `_phaserLive.wet`
(the rebuild still reads it in T7) and `buildPhaser` passes `wet: 1`. Their existing "ramps the tapered wet" cases are
re-pinned to the cell's gains; each gains one light / darken / re-sent triple (the full protocol is T3's). A new
`applyGlobalAudioToEngine` case in `AudioEngine.test.ts`'s priming describe: a fixture with two lit effects connects
exactly those two cells; applying the same fixture again calls no `connect`, arms no timer and ramps nothing (the
re-sent rule). The `_global<Effect>` aliases stay or go, one way, in this commit (spec §4).

**Acceptance criteria:**
- [x] Each of the six is built at `wet.value` 1, disconnected; its setter at Mix 0.3 connects once and ramps the cell
  to `cellGains(0.09)`, at 0 ramps to `{1, 0}` and arms the timer, re-sent does nothing; `colourWetGain` is still
  the taper (`0.5` → `w 0.25`).
- [x] Priming: `AudioEngine.start()` with a fixture of two lit effects leaves exactly those two connected and the
  other eight not; the second apply is silent (no connect, no timer, no ramp); a fixture with every Mix 0 connects
  nothing.
- [x] The BitCrusher's absent-constructor and the AutoWah's / Phaser's absent-constructor cases still wire the chain
  around an empty cell; the Phaser's Stages change still works (rebuild + chain rewire, until T7).

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/AudioEngine.test.ts`;
`npm run build:types`; `npm run lint`.

**Dependencies:** T3. **Files:** `globalFx.ts`, `globalFx.test.ts`, `AudioEngine.test.ts`. **Scope:** M.

**As built (2026-10-19):** `BUILT_DARK` now holds seven keys (the six + the Vibrato); the Chorus, the Tremolo and the widener are still built transparent until T5 / T6. The six constructors and `buildPhaser` pass `wet: 1`; the six setters' Mix line is `writeCellMix(key, wet)`. **The `_global<Effect>` aliases stay** (spec §4's one-way choice): the setters keep reading them. **Two bugs found and fixed in this task:** (1) `setGlobalPhaser` returned early after a Stages rebuild ("nothing left to write"), which would have dropped a Mix sent in the same call now that the Mix lives in the cell: the `writeCellMix('phaser', wet)` line moved *before* the rebuild's early return, so the rebuild wires the new node in as lit or dark as that left the cell; (2) the darken timer's callback disconnected the effect it was armed on, so a Stages change while a darken was pending would have tried to disconnect the disposed node and left the new one connected while dark: the callback now reads `cell.effect` at the fire. Both have cases (a Mix of 1 / of 0 in the same call as a Stages change; a Stages change while a darken is pending). **Deviation:** the priming case checks the seven cell-carried effects (two lit connected, five dark not), not "the other eight": the Chorus and Tremolo stay transparent until T5. `AudioEngine.test.ts`'s Gain mock still has no `rampTo` (T2's finding stands); "the second apply ramps nothing" is proved by sentinel values on the two lit cells' gains plus no `connect` and no `setTimeout`. Test helpers: `lawDry` / `lawWet` moved to the top level; `mixRampsOf(effect)` reads each cell ramp back as the tapered Mix `w` (so the old "0.16 / 0.0625 / 0.25" assertions keep their numbers); `tenEffects()` reports a hidden constructor as `undefined` (an instance from an earlier build was miscounting the build-order lookup). Existing cases that wired a pedal into its cell now light it first. Mutation gate (scratchpad `t4/mut.sh`, session e3af2385, with `AudioEngine.test.ts` in the run): 21 mutants, 21 killed (six built at the old wet, six left out of `BUILT_DARK`, six setters writing the node, the Phaser Mix after the rebuild return, the armed-effect disconnect, no re-sent rule); the second-apply priming case was checked on its own against "no re-sent rule" (fails: 10 timers armed vs 5). **Follow-up (80f1fb1b):** the re-pinned `AudioEngine.test.ts` AutoWah routing case asserted "connected exactly once", which failed in T5's full-suite run: when the random world seed lights the AutoWah and gives the Phaser a Stages count other than ten, `start()`'s rebuild rewires the lit AutoWah again. It now asserts one target only (its cell's wet gain).

---

### Task 5: Chorus and Tremolo migrate; the Spread duck rides the cell

**Description:** Both are built at `wet: 1` with dark cells. `writeSpreadPedalWet(pedal, node, wet)` becomes the
cell's Mix write: it records `_spreadWetGain[pedal] = colourWetGain(wet)` as today and, outside a duck, calls
`writeCellMix(pedal, wet)` (so lighting and darkening work through the same protocol); inside a duck it records only.
`writeSpread`'s duck ramp and `finishSpreadDuck`'s return ramp move from `node.wet` to `rampCell(cell, 0 | target,
SPREAD_DUCK_SECONDS)`; `resetSpreadDucks` also resets the cells' targets. A duck never disconnects (the cell stays
connected). A darken arriving mid-duck: the return level becomes dry, the darken timer is armed, and when both fire the
effect is disconnected and the Spread written (inaudibly, on a dark effect). The twenty duck cases are re-pinned to
the cell's gains with their timings unchanged.

**Acceptance criteria:**
- [x] A lit Chorus's Spread write ramps the cell to `{1, 0}` over 0.02, writes the Spread after `lookAhead + 0.02 +
  0.01`, ramps back to `cellGains(target)`; no `disconnect` is called anywhere in a duck; a dry pedal writes at once;
  a re-sent Spread does nothing; a drag re-arms the one duck timer — all as the existing cases say, now on the cell.
- [x] Mix 0.3 → Spread drag → Mix 0 during the duck: the duck's return level is dry, the darken timer is armed, and
  after both fire the effect is disconnected exactly once and `node.spread` holds the last value; Mix 0 → Spread
  write: written at once, no connect.
- [x] The Tremolo mirrors every case; `rampChorusSweep` is untouched; the Chorus and Tremolo are still `start()`ed.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts`; `npm run build:types`; `npm run dev`:
a lit Chorus Spread drag still goes dry for ~0.25 s and returns; a Chorus darkened and re-lit has no click.

**Dependencies:** T3. **Files:** `globalFx.ts`, `globalFx.test.ts`. **Scope:** M.

**As built (2026-10-19):** `BUILT_DARK` holds nine keys (all but the widener, T6); the Chorus and Tremolo are built at `wet: 1` and still `start()`ed; `rampChorusSweep` is untouched. **Deviations from the description:** (1) `_spreadWetGain` is **gone**: it would have duplicated `cell.mix` (always `colourWetGain(wet)` after a successful write), so `finishSpreadDuck` ramps back to `cell.mix` and `resetSpreadDucks` only clears the timers and Spread targets (the cells are rebuilt fresh). (2) "Inside a duck it records only" was not enough: a darken mid-duck must still arm the disconnect (bullet 2), and a re-light mid-duck must cancel it, or reconnect if it already fired. So `writeCellMix` gained a third argument, `ramp = true`; `writeSpreadPedalWet(pedal, wet)` is `writeCellMix(pedal, wet, !_spreadDuck[pedal])`: inside a duck the protocol runs (connect, darken timer, re-sent rule) with the gains left to the duck. A reconnect mid-duck is silent because the duck holds the wet gain at 0. (3) **Stricter than today:** the "write at once" test is now `!cell.connected` (out of the signal path), not "Mix is 0", so a pedal still connected while its 50 ms darken ramp runs is ducked rather than having its LFOs swapped mid-ramp. (4) `AudioEngine.test.ts`'s "routes each public setter" case re-pinned: it runs the pending context timers (this file's pattern) instead of relying on "Mix 0 then the Spread lands at once", and checks the Tremolo was wired into its cell. New cases per pedal: the light / re-sent / darken triple; dry and disconnected pedals written at once with no connect; a duck never disconnects; Mix 0 mid-duck (dry return, darken armed, one disconnect, last Spread), in either timer order; Mix 0 then 0.5 mid-duck (darken cancelled); re-lit mid-duck after the darken fired (reconnect, no ramp until the duck returns); a darkening pedal is ducked; **a duck on the rebuilt pedal is not taken by the old duck timer**, added because the gate found `resetSpreadDucks`' `clearTimeout` untested (a pre-existing Global Pedals gap: left to fire, the old timer writes the new duck's Spread to the old node). Mutation gate (scratchpad `t5/mut.sh`, session e3af2385): 18 mutants, 17 killed in the run, the 18th (`clearTimeout` dropped) killed by that new case (180 vs 70).

---

### Task 6: Width — the linear law, the concurrent `width` ramp, the join lit or dark

**Description:** The widener is built at `width: 0.5`, its cell dark. `setGlobalStereoWidener` ramps `node.width`
as today **and** calls `writeCellMix('stereoWidener', width)`, where the Width branch maps `0.5 → f 0` and anything
else `→ f 1` and ramps with `widthCellGains`, not `cellGains` (assumption 5). Lighting connects first (silent) then
ramps `f` to 1 and `width` to the target concurrently; darkening ramps `f` to 0 and `width` to 0.5 concurrently and
arms the timer. The Controlled-Decay join stays at the cell's `in` whether or not the widener is connected
(assumption 6): the returns are never touched by a Width crossing.

**Acceptance criteria:**
- [x] `0.5 → 0.7`: connect once, `dry.gain.rampTo(0, 0.05)`, `wet.gain.rampTo(1, 0.05)`, `width.rampTo(0.7, 0.05)`;
  `0.7 → 0.5`: `dry → 1`, `wet → 0`, `width → 0.5`, one timer, disconnect on fire; `0.5` re-sent: nothing;
  `0.499` and `0.501` light; `0.7 → 0.9` (already lit) ramps `width` only, no cell ramp (f already 1).
- [x] Under Controlled Decay both returns connect to the Width cell's `in` and only there, with Width dark and with
  Width lit; a Width crossing calls no `connect` or `disconnect` on either return; under Natural the join is the
  Compressor as before.
- [x] The widener's `wet` is never written; `widthCellGains` is used (a mutant swapping in `cellGains` fails on the
  `{0, 1}` target).

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/AudioEngine.test.ts`;
`npm run dev`: Width 0.5 → 0 → 1 → 0.5 under Controlled Decay with a lit Delay — the fold still takes the tails,
and the return to 0.5 has no click.

**Dependencies:** T3. **Files:** `globalFx.ts`, `globalFx.test.ts`, `AudioEngine.test.ts` (the `:2650` widener
case). **Scope:** S.

**As built (2026-10-19):** all ten cells are now built dark, so T2's transparent mode is **deleted**: `BUILT_DARK` is
gone and `buildCell` always builds dry 1 / wet 0, unconnected, `mix` 0 (T2's "transparent cell" case went with it; the
dark case now runs for all ten and took over its cut-membership check). `writeCellMix` maps the widener's width to
`f = width === 0.5 ? 0 : 1`; `rampCell(key, cell, w, seconds)` now takes the key and picks `widthCellGains` for the
widener, `cellGains` otherwise (the Spread duck passes its pedal). `setGlobalStereoWidener` calls
`writeCellMix('stereoWidener', width)` first and then ramps `width`, so a reconnect happens before any ramp. The join
already sat at the Width cell's `in` from T2; T6 adds the lit / dark / crossing cases. **Deviations:** (1) "`0.5`
re-sent: nothing" holds for the cell (no connect, no gain ramp, no new timer), but the `width` Signal is still ramped
to 0.5, as every other parameter write is re-sent; it is harmless on a widener already at 0.5. (2) Re-pins: the
Decay-flip edge case now lights the Vibrato and Width first (so its lit branch still runs, two lit and eight dark), and
"wires Compressor -> StereoWidener cell -> Limiter" lights the widener first. (3) The AudioEngine case is new, beside
the `:2650` one: a lit widener connects into a cell Gain and its `wet` stays 1 (it does not count connects, because
start()'s random seed may already have lit it). Mutation gate (session dfcccfcc scratchpad `t6/mut.sh`): 12 mutants,
11 killed; 1 **equivalent**: the Spread duck's ramp down on Width's law (at 0 both laws give `{1, 0}`).

---

### Task 7: The Phaser rebuild is local to its cell

**Description:** `rebuildPhaser(stages)` builds the fresh node from the mirror at `wet: 1`; if the cell is connected it
disconnects the old node's two edges and connects the new one's (the `wet` gain keeps its value, so the swap is a
silent-path swap at the same Mix — a brief wet-path discontinuity is the same one the rebuild has today and is
accepted); sets `cell.effect` and `_globalPhaser`; disposes the old node; and **no longer calls `wireGlobalFxChain`**.
A pending darken timer reads `cell.effect` at fire time (it is keyed by the cell, assumption 7). The three
"re-wires the chain" cases (`globalFx.test.ts:1369–1403`) become "touches only its cell".

**Acceptance criteria:**
- [x] A Stages change on a lit Phaser: old `in.disconnect(old)`, `old.disconnect(wet)`, new `in.connect(new)`,
  `new.connect(wet)`, `old.dispose()`, and **no** `disconnect` or `connect` on any other node (the AutoWah's cut,
  the Chorus's `in`, the returns, masterGain all untouched).
- [x] On a dark Phaser the new node is constructed and nothing is connected; a darken timer armed before the rebuild
  disconnects the **new** node when it fires; a rebuild whose constructor throws keeps the old node connected as
  today; disposing the old node throwing still leaves the new one wired.
- [x] Boot still builds the Phaser twice (default 10, then the seeded count) and ends with one connected Phaser when
  lit; `_lastControlledDecay` is still recorded by `wireGlobalFxChain` for the Decay flip.

**Verification:** `npx vitest run src/engine/audioEngine/globalFx.test.ts`; `npm run dev`: a lit Phaser's Stages
slider at 4 → 12 while a chord sounds.

**Dependencies:** T4. **Files:** `globalFx.ts`, `globalFx.test.ts`. **Scope:** S.

**As built (2026-10-19):** `rebuildPhaser` swaps the node inside its cell with the T3 helpers: while the cell is
connected, `disconnectEffect('phaser', cell, old)` then `connectEffect('phaser', cell, fresh)`; `cell.connected` is
reset to false between the two, so a failed drop of the old edges still counts them gone (the old node is released
next) and a failed connect of the new one leaves the cell dry and unconnected, which the next Mix write (even the same
Mix re-sent) repairs. The cell's gains are not ramped. It no longer calls `wireGlobalFxChain`. **Deviations:** (1)
`_lastControlledDecay` is **deleted**, not kept: the rebuild was its only reader (a Decay flip passes its mode in), and
an unread module `let` fails `build:types` under `noUnusedLocals`. (2) The three "re-wires the chain" cases became
"touches neither return under Controlled (Width dark and lit)", "touches neither return under Natural after a flip
back", and "a Decay flip after the rebuild wires the new node, not the replaced one"; the "connects the new node exactly
once and leaves the AutoWah and Compressor wired once each" case folded into the lit swap case (exactly four edge calls
across every node any build made, the AutoWah and Chorus lit beside it), and the taps case now asserts the taps are not
touched at all. (3) Added beyond the criteria: a rebuild on a Phaser already darkened and disconnected touches no edge;
the old-edge drop failing; the new connect failing; both failing. (4) The boot criterion is proved in
`AudioEngine.test.ts` by a lit Stages change through the public setter (every replaced Phaser was disconnected from each
target it had fed), not at `start()` itself, whose world seed is random; the existing "ten stages, then at most once
more" case is unchanged. A stale comment in the T4 AutoWah case (start()'s rebuild re-wiring a lit AutoWah) was
reworded. Mutation gate (session 4051f83e scratchpad `t7/mut.sh`): 9 mutants, 9 killed (rewire again, no old
disconnect, connect when dark, disconnect when dark, no `connected` reset, effect not swapped, no connect, connect
before disconnect, dispose before disconnect).

---

### Task 8: The cycle search over a chain of cells

**Description:** One case in `chainCycleSearch.test.ts`: ten fake cells in series, each a split-and-rejoin diamond
with a `delayTime` node at its output (the `cut`), the first fed by a source. A connect into the first cell's `in`
expands the nodes of one cell and no more; a connect into the sixth does the same; and the same chain **without** the
cuts expands over 2¹⁰ — the before-and-after the cell's cut buys (assumption 3).

**Acceptance criteria:**
- [x] The with-cuts walk from the first cell visits fewer than 16 nodes; from the sixth likewise; the without-cuts
  walk from the first visits more than 2¹⁰.
- [x] The three existing cases are unchanged and green; the file's header comment names the cells as a third thing
  the cuts protect.

**Verification:** `npx vitest run src/engine/audioEngine/chainCycleSearch.test.ts`.

**Dependencies:** T2. **Files:** `chainCycleSearch.test.ts`. **Scope:** XS.

**As built (2026-10-19):** seven cases in a `describe('a chain of ten bypass cells')`, over two new helpers:
`bypassCell(prefix, lit, withCut)` (`in` → `dry` → `cut`, and while lit `in` → effect → `wet` → `cut`, the effect itself
one split-and-rejoin stage for Tone's own dry and wet paths) and `cellChain(count, lit, withCut)` (cut → next `in`, the
last into a destination). Numbers: a lit cell walked from its `in` costs exactly **9** expansions, from the first cell,
the sixth and the last alike; a crossing's `in → effect` edge walks 7 and its `effect → wet` edge 1; ten dark cells cost
2. Without the cells' cuts, ten lit cells cost over **3¹⁰** (three paths per lit cell; the plan's 2¹⁰ floor is
implied), and ten dark cells stay linear at exactly 31: only a lit cell multiplies the walk. **Deviations:** the file had
**four** existing cases, not three, all unchanged and green; the header comment gains a paragraph naming the cells. Being
a test of library behaviour with no product code, it was green on its first run; its RED is the mutation gate on the
cell model (session 4051f83e scratchpad `t8/mut.sh`): 6 mutants, 6 killed (cells never cut, always cut, lit built dark,
not chained, effect a single node, dry path not ending at the cut). The "effect a single node" mutant first
**survived**, which is why the 9 is pinned exactly and the uncut floor raised to 3¹⁰.

---

### Task 9: `fxConnected` in the diagnostics and the HUD token

**Description:** `globalFx.ts` exports `getConnectedEffectCount(): number` (cells with `connected`), re-exported on
`AudioEngine`; `audioDiagnostics.ts`'s snapshot gains `fxConnected: number` (NaN before the chain exists);
`hudLines.ts`'s budget line gains a final ` · fx in 2/10` token (`count(fxConnected)/10`, a dash when unknown), so the
phone's screenshot shows which graph it is running (assumption 13). No content entry: the HUD is outside the content
layer like the rest of its lines.

**Acceptance criteria:**
- [x] `getConnectedEffectCount()` is 0 after a dark build, 2 after lighting two, 1 after one darken timer fires,
  0 before `buildGlobalFxChain`; the snapshot carries it; the budget line reads
  `load 20%·fx 100% · sounding 4/4 · standing by 2 · poly 3/8 · fx in 2/10` and `… · fx in -/10` when unknown.
- [x] The existing budget-line cases are updated for the suffix and nothing else on the HUD moves (the line-order
  cases at `hudLines.test.ts:217` and `:262` still pass).

**Verification:** `npx vitest run src/components/debug src/engine/audioDiagnostics.test.ts
src/engine/audioEngine/globalFx.test.ts`; `npm run dev` with `?debug`: the token changes as a Mix crosses 0.

**Dependencies:** T3. **Files:** `globalFx.ts`, `AudioEngine.ts`, `audioDiagnostics.ts` (+ test), `hudLines.ts`
(+ test). **Scope:** M (six small edits).

**As built (2026-10-20):** `getConnectedEffectCount()` counts `cell.connected` over the live cells (a darkening effect
counts until its disconnect fires), re-exported on `AudioEngine`; the snapshot's `fxConnected` is
`getGlobalChainEntry() ? getConnectedEffectCount() : NaN` (the diagnostics read `globalFx` directly, as they already did
for the taps), NaN in the pre-sample snapshot too; the budget line's denominator is a named `BYPASS_EFFECT_COUNT = 10`.
Cases beyond the criteria: a re-sent Mix counts once, a relight before the timer stays 1, Width by its own law, all ten
→ 10 → 0, an absent Vibrato leaves 9, a failed connect is not counted, a lit Phaser keeps its count across a Stages
rebuild, a chain rebuild returns to 0. Mutation gate (session 4cc90206 scratchpad `t9/mut.sh`): 11 mutants, 11 killed.
The mutant counting `connected || darken !== null` first **survived**; it is not equivalent (a darkening Phaser whose
Stages rebuild cannot connect the fresh node is out of the path with its timer still armed), and the case for it now
kills it. `AudioDebugHud.test.tsx`'s fixture also gained the field (the type check found it). Prettier: only the three
lines that already ran over the width grew. **Not done:** the `npm run dev` `?debug` look (left for Checkpoint A).

---

### Checkpoint A: All automated

- [x] `npm test` green except the four T17 living-docs cases and the known `sceneToOrbiterLocal` timeout;
  `npm run build:types`, `npm run lint`, `npm run build` clean; Prettier on every touched file.
- [x] Every task's mutation gate recorded in its commit message or this plan (killed / equivalent, by name).
- [x] By inspection: `connectEffect` / `disconnectEffect` are called only from `writeCellMix`'s light branch, the
  darken timer, `wireGlobalFxChain`'s re-make and `rebuildPhaser` — and in every call site the cell's `wet` gain is
  at 0 or the swap is a same-Mix node swap (T7). Stated in the checkpoint report.
- [x] `npm run dev`: a fresh seed with two pedals lit sounds as it did; each of the ten dragged across 0 by hand,
  no click heard by the agent's own check (Crawford's listen is Checkpoint B).

**Passed (2026-10-20):** Crawford ran the npm commands and dragged the sliders on the desktop app: everything ran as
expected, no clicks. The T9 `?debug` look was folded into this run. **Inspection, as found:** `connectEffect` is called
at `writeCellMix`'s light branch (only for an unconnected cell, whose `wet` is 0: built dark, or its darken timer fired
after the ramp to 0, or an earlier connect failed before any ramp) and in `rebuildPhaser` (a same-Mix node swap);
`disconnectEffect` in the darken timer (Mix 0, fired after the ramp) and in `rebuildPhaser`. `wireGlobalFxChain`'s
re-make calls neither: it calls `wireCell`, which re-makes a connected cell's two edges directly, with the whole chain,
at the lit gains, as the Decay flip did before the cells. **One gap, on a failure path only:** when a lit Phaser's
Stages rebuild cannot connect the fresh node, `rebuildPhaser` leaves the cell unconnected with its gains still at the
lit law. The next Mix write then connects the effect with `wet` above 0 (the one call that breaks the rule). Until
then the Phaser's output is the dry path at `cos(w·π/2)`, a level drop, not the "stays dry" its comment says. It only
happens if Tone refuses a connect. **Fixed at Crawford's word ("do it first"), 2c7bf1f6:** on that failure the
input-less `wet` gain is set to 0 at once (silent), `dry` ramps to 1 over 50 ms and the Mix is 0, so the next Mix write
lights it from wet 0 like any dark cell; a pending darken stays armed and no-ops. 5 new cases (incl. a Mix of 0 after
the drop is a no-op, which is what makes `mix = 0` observable); 7 mutants, 7 killed. Suite 13 328 pass / 6 fail = the
4 T17 cases, the `sceneToOrbiterLocal` timeout, and `audioSwells` "ramp lifecycle" (passes alone, 120/120, as at T3).
Now every `connectEffect` call happens with `wet` at 0, except the T7 same-Mix swap.

---

## Phase 2: Desktop proofs (headless Chrome, scratchpad probes)

### Task 10: Lit sound unchanged, by offline render

**Description:** Spec §5 step 1. A scratchpad probe (raw Tone 15 in headless Chrome, `OfflineContext`): for each of
the nine Mix effects at Mix 0.3 and 1, render a test tone (a 440 Hz sine plus a 1 kHz sine, 2 s) through Tone's node
at `wet = colourWetGain(mix)` and through the same node pinned at `wet 1` inside a cell at
`cellGains(colourWetGain(mix))`, both constructed at the same offline time so LFO phases align; Width at 0.7 through a
cell at `f 1` against the bare widener. Compare sample by sample after the first 0.2 s.

**Acceptance criteria:**
- [x] Peak absolute difference ≤ 1e-5 for every effect at both Mixes and for Width; the BitCrusher's worklet is
  awaited before rendering.
- [x] The probe's location, recipe and a per-effect table of peak differences are written into spec §8 (As built).

**Verification:** the table; a deliberate control (cell at `cellGains(colourWetGain(0.5))` against Tone at `wet 0.3`)
shows a large difference, proving the comparison sees anything.

**Dependencies:** T4, T5, T6. **Files:** `docs/specs/DARK_EFFECT_BYPASS.md` (§8); the probe in the scratchpad.
**Scope:** S (measurement).

**As built (2026-10-20): PASS.** Spec §8.1 has the recipe, the probe's absolute path and the tables. Every lit
difference is ≤ 1.8e-7 (Mix 0.3 and 1, all nine; Width 0.7 is 0); two runs bit-identical. **Controls, beyond the
plan's one:** for every effect, the plan's wrong-Mix control (4.9e-2 to 3.6e-1) and a wrong-law control (Width's
linear law on a Mix effect, 7.7e-2 to 1.2e-1). Both miss by four orders or more, so the comparison sees a wrong
Mix and the wrong law. Also an effect-share column, so no effect passes by doing nothing. **Edge cases added:** Mix 0
(dark cell vs Tone at wet 0), Mix 0.01 / 0.03 / 0.04, and Width dark vs the bare widener at 0.5 (1.2e-7). **Finding,
not in the plan:** Tone's `CrossFade` has a wet floor of `sin(π/2 · 1/1023)` = 1.535e-3 (−56 dB) for every fade below
1/1023 (a `GainToAudio` WaveShaper interpolating across the kink at 0). So the pre-cell build was never fully dry at
Mix 0, or at 0.01 to 0.03. The cell is exactly dry there and quieter by up to 2.3e-3 peak (the Phaser at Mix 0,
50 dB under the tone). Each such row matches the floor prediction to 0.3 %. Spec §1.1's "exactly" now carries that
qualifier. No code change. The `cellGains` doc comment in `globalFx.ts` ("sounds exactly as the bare effect at wet w")
has the same overstatement and was left for Crawford's call.

---

### Task 11: Crossings are inaudible, in a real-time context — **STOP on a miss**

**Description:** Spec §5 step 2, the Spread-duck recipe: a native `AudioContext` under
`Tone.setContext(new Tone.Context(…))`, a `ScriptProcessor` recorder, lookAhead 0.1, Chrome launched with
`--autoplay-policy=no-user-gesture-required`; a sustained two-tone signal through the full cell chain; for each of the
ten, light from dark (Mix 0.3; Width 0.7) and darken back, three runs each; metric = peak |second difference| in the
150 ms after the event divided by the steady state's. Controls: the same ramps with no graph change (expect ×1), and a
bare `connect` of a full-level path (expect a clear click, proving the metric sees one).

**Acceptance criteria:**
- [x] Every effect, both directions, every run: **≤ ×1.6**, and no run of ≥ 64 consecutive samples under −80 dBFS
  while the tone sounds (no gap); the controls behave as expected.
- [x] The per-effect, per-direction table (three runs) is written into spec §8 with the recipe.
- [x] **A miss stops the plan:** the report names the effect and direction, the measured ratio, and the options
  (a longer margin; a disconnect of the input edge only, leaving the output edge; a different ramp) with a
  recommendation. No constant is retuned to pass without Crawford's call. *(No miss.)*

**Verification:** the table; the two controls.

**Dependencies:** T4, T5, T6. **Files:** `docs/specs/DARK_EFFECT_BYPASS.md` (§8); the probe in the scratchpad.
**Scope:** S (measurement).

**As built (2026-10-20): PASS.** Spec §8.2 has the recipe, the probe's absolute path and the table. Worst of 90
gated rows (ten effects × light / darken / wiggle × three runs) is ×1.19, the Phaser's darken; no gap; no constant
touched. **Beyond the plan:** (1) the probe drives the repo's real `globalFx.ts` through Vite, not a copy of the
protocol, so the measured code is the shipped code; (2) an AudioWorklet recorder stamped with `currentFrame` replaces
the `ScriptProcessor`, and the context's `setTimeout` is wrapped to stamp each disconnect, so the windows are placed
exactly; (3) **edge case added:** a wiggle across 0 (0.1, 0, 0.1, 0 at 20 ms steps), which must arm exactly one
disconnect after the last step (it did, every run); (4) `getConnectedEffectCount()` read after every event proves
each graph change happened (1 lit / 0 dark, all runs). Controls: the lit ramps ×0.52–1.00; the bare full-level
connect ×13–25 (×4–27 over two sessions). **Finding, not gated:** a **lit** Phaser's Stages change clicks
(×2.0–54.7, typically ×6–8). It is the one connect at lit gains (T7's same-Mix swap). The pre-cell whole-chain rewire
was not measured. A Spread-style duck is the obvious fix; that is Crawford's call, and it is not built.

**T11 follow-up, the Stages duck (Crawford: "fix the phaser stage click first", 2026-10-20):** built in
`globalFx.ts` (`writePhaserStages` / `finishPhaserDuck` / `resetPhaserDuck`). A lit Stages change ramps the cell to
dry, swaps at the bottom of the duck with the wet gain at 0, and ramps back; a dark one rebuilds at once. Real-time
re-measure: lit Stages changes ×0.82–0.93 (were ×2.0–54.7); crossings unchanged (worst ×1.16). Cost: a lit Phaser is
dry for about 0.15 s per Stages change, and through a Stages drag. 17 new cases plus 1 from the gate; 19 existing
lit-Stages cases re-pinned to fire the duck's timer; 17 mutants killed. Details in spec §8.2.

---

### Task 12: Dark cost ≤ 70 ‰ and the `perf:audio` A/B — **STOP on a miss**

**Description:** Spec §5 step 3. (a) The 2026-10-19 dark-cost probe (or its rebuild from GLOBAL_PEDALS.md §8's recipes)
extended with a cell topology: all ten dark in cells; one empty cell alone; each effect dark in its cell; five
interleaved rounds, medians, ‰ of one core. (b) `npm run perf:audio` on the seed-`alpha` baseline link, `main` against
the branch side by side as in T0, 240 s each, interleaved once more.

**Acceptance criteria:**
- [x] All ten dark in cells **≤ 70 ‰** (assumption 14); the empty cell's own price and each effect's dark-in-cell
  price recorded beside the existing 213 / 48 table in `scratchy-audio-phones.md`.
- [x] `perf:audio`: the branch's render-capacity mean and peak ≤ `main`'s on the same link, same sitting (T0's
  before-numbers alongside).
- [x] **A miss stops the plan** with the per-node breakdown and options (drop the per-cell cut, accepting a longer
  walk per crossing; or accept and record), recommendation included. *(No miss.)*

**Verification:** the tables; measurement hygiene stated as in T0.

**Dependencies:** T6 (all ten in cells). **Files:** `docs/todo/scratchy-audio-phones.md`,
`docs/specs/DARK_EFFECT_BYPASS.md` (§8). **Scope:** S (measurement).

**As built (2026-10-20): PASS on both gates.** Details in spec §8.3 and the new T12 section of
`scratchy-audio-phones.md`. (a) All ten dark in cells **38.3 ‰** (≤ 70). Per effect 1.0–5.4 ‰, one empty cell 0.5,
ten empty cells 4.8. The same-sitting reference rows (ten inline 150.6, ten disconnected 32.4) show the probe still
sees the cost. This sitting ran about 0.7× the 2026-10-19 one, so about 54 ‰ on that scale, still a pass. (b)
`perf:audio`, three interleaved rounds on T0's link: branch `1421c023` **0.431 / 0.502** (mean / peak window) against
`main` **0.460 / 0.580**, branch lower in every round; T0's branch was 0.624 / 0.752. **Deviations:** the 213 / 48
table lives in `docs/intent/dark-effect-bypass.md`, not in `scratchy-audio-phones.md`, so the new section repeats it
beside the cell column. `perf:audio` ran one world per foreground call (T0 ran two) to stay under the tool's 10-minute
limit, and reused T0's `main` build (`main` is still `d29ac778`). Orphaned Chrome 0 before and after every call.

---

### Task 13: Main thread — power-on, a Decay flip, one crossing

**Description:** Spec §5 step 4, with T0's recipe: on the branch, two pedals lit, power-on wall time and unresponsive
time; a Decay flip's main-thread time; one Mix crossing's (light and darken) main-thread time, measured as the longest
task around the slider write over CDP.

**Acceptance criteria:**
- [x] Power-on no slower than T0's figure; a Decay flip ≤ T0's; one crossing ≤ 2 ms; recorded beside T0's paragraph.
- [x] If a figure is worse than T0's, it is stated with the number and the suspected cause (the per-cell cut is the
  first candidate for a slower flip; a slower power-on points at the ten extra Delay constructions). *(None worse.)*

**Verification:** the paragraph.

**Dependencies:** T7. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (measurement).

**As built (2026-10-20): PASS on all three.** The new T13 section of `scratchy-audio-phones.md` has the tables. Branch
`75f1a5d1`, three interleaved rounds against T0's build `47ce45d3` re-run in the same sitting, using T0's probe and
two-lit world. Power-on 815–1 144 ms (mean 952) against 899–1 375 (mean 1 096) in the same sitting and 1 166–1 385 at
T0, 0 ms unresponsive. Decay flip 1.8–2.1 ms against 1.6–2.5 and T0's 2–3. The crossing (Vibrato 0 → 0.3 → 0): light
write task ≤ 0.75 ms (pre-cell 0.31–0.43), darken write ≤ 0.43 ms, and the disconnect callback ≤ 0.5 ms of its own,
firing 167–198 ms after the write; `fx in` 2 → 3 → 2. **Beyond the plan:** (1) the "before" was re-run in the same
sitting from a scratchpad worktree, rather than compared across sessions with T0's table; (2) the crossing is measured
from a CDP trace, with each Tone context timer labelled by the write that armed it, so the disconnect is timed on its
own. The ticker task it runs in (up to 7.94 ms) is the ticker's own work: a window with no write has 8.8–9.7 ms tasks.
The plan's "longest task around the slider write" is therefore background noise on this page (3.9–60.3 ms in either
build), and the gate is read on the write's task and the callback. The dark Phaser's Stages change was 16.4–19.7 ms
against 18.1–22.8 (not gated).

---

### Checkpoint B: Crawford's desktop listen — **STOP**

Spec §5's manual list, on `npm run dev` with `?debug` so the `fx in` token is visible:

- [x] Each of the ten dragged from dark up and back down, slowly and quickly, with a sustained chord sounding,
  including a wiggle across 0: no click, gap or level jump; `fx in` follows.
- [x] Width 0.5 → 0 → 1 → 0.5 under Controlled Decay with a lit Delay: the fold still takes the rooms' tails; the
  return to 0.5 is clean.
- [x] A Natural ↔ Controlled flip with Width dark and with Width lit; a Phaser Stages change while lit and while dark.
- [x] A Spread drag on a lit Chorus still goes dry for ~0.25 s and returns (unchanged, recorded).
- [x] Save, reload and a share link with two lit pedals: `fx in` matches before and after; an old `?session=` link
  loads with `fx in 0/10` or `1/10` (Width).
- [x] Crawford's words recorded in this plan's status line; a complaint routes to a fix task before T14.

**Passed (2026-10-20):** Crawford ran the list on the desktop: "ok, everything passed". No complaint, so no fix task.
This covers the lit Phaser's ~0.15 s dry duck per Stages change (the T11 follow-up), which was on the Stages item.

---

## Phase 3: The phone

### Task 14: Phone gate re-run — round 3 — **STOP for Crawford**

**Description:** Spec §5's phone gate. Both builds rebuilt and served side by side on the LAN (`main d29ac778` from
the worktree, the branch from `dist/`), the links page regenerated, stale previews killed. Pixel 8, `?debug`, Full,
hands off to 3:00 then watched to 4:00, a fresh page per run: (1) run A again (the seed-`alpha` baseline link, every
new pedal dark, `fx in 0/10`); (2) an ordinary seeded world with two pedals lit (found by cycling seeds; `fx in`
2/10 or 3/10); (3) the six-lit worst case by hand (all six Modulation pedals at Mix 1, Phaser 12 stages, Width 1); (4)
a Standard run of (1). A `main` run of (1) in the same sitting is the comparison.

**Acceptance criteria:**
- [x] A dated "round 3" section in `scratchy-audio-phones.md`: both hashes, every run's start → end count, the
  `fx in` reading, the 4:00 count, Crawford's words.
- [x] **Pass:** (1) and (2) each within 25 % of the same-sitting `main` count at 3:00 and not accelerating between
  3:00 and 4:00; (3) does not run away hands-off (its count is recorded, not gated). *(Passed with a caveat, by
  Crawford's call; see below.)*
- [x] **A miss** names the run, the count and the next lever (assumption 10's teardown, as its own intent), by
  Crawford's call. Nothing is claimed that was not counted. *(Round 3's misses are named below; round 4 moved them
  off this phase.)*

**Verification:** Crawford's runs.

**Dependencies:** Checkpoint B. **Files:** `docs/todo/scratchy-audio-phones.md`. **Scope:** XS (device).

**As run (2026-10-20): MISS, awaiting Crawford's call.** Round 3 is in `scratchy-audio-phones.md`. Counts at 3:00 /
4:00:
- `main` 48 / 75.
- (1) 31 / 54: pass, on its second attempt. The first attempt, on a hot phone, ran away from 2:30 (about 2 000 at 3:00, 11 642 at 4:00).
- (2) 259 / 1 600 with `fx in` 4/10: miss, 5.4× `main`, took off at 3:30.
- (3) 172 / 957 with 7/10: miss, ran away from about 3:30.
- (4) Standard 48 / 67.

The dark case is fixed; the lit effects' own cost is what is left. Assumption 10's teardown removes only dark effects, so
it does not reach (2) or (3).

**Round 4 (same day) changes that reading.** A desktop pricing of lit effects came first, then a phone A/B of Phaser
stages 10 against 4 in a four-lit world. In the order 10, 4, 4, 10, then `main`'s baseline last, the first two runs
were fine (59 and 53 at 3:00). The last three all collapsed between about 3:00 and 3:50, **`main` included** (26 at
3:00, out at 4:13). The runaways follow a run's place in the sitting, not the build, so round 3's misses on (2) and (3)
cannot be pinned on the lit effects. Stage count showed no signal. Both rounds are in `scratchy-audio-phones.md`. How
to read T14 now is Crawford's call.

**Decision (Crawford, 2026-10-20): T14 PASSES with a caveat.** On every fresh-phone run the bypass builds read about
`main`'s level: the dark baseline 31 at 3:00 against `main`'s 48 in round 3, and four lit 59 and 53 in round 4.
**The caveat:** a run late in a sitting collapses on the Pixel whatever the build, `main` included, and once it starts
it does not recover. That is backlog 27's open subject, not this phase's. A sine-only page carried 700 oscillators
on the same hot phone before underruns climbed, so the phone's audio path still worked. Heat against accumulated state
is not yet separated. The next step is recorded in backlog 27: a desktop long run, looking for load that grows during
a run. The Phaser stages seed range stays as it is.

---

## Phase 4: This phase's docs

### Task 15: Spec §8, both plans' status lines, backlog 27, the memory

**Description:** Spec §8 "As built" gets the full account (the cell as built, every deviation from §1, the four
proofs' tables or pointers to them, the phone's round 3, the probe locations); spec §7 carries its answers.
`GLOBAL_PEDALS.md` (the spec) §8 gains one entry pointing here; `GLOBAL_PEDALS.md` (the plan) status line records the
bypass built and T14 re-run; this plan's status line is final. `docs/todo/backlog.md` item 27 ("Phone Playback
Underruns at Light Load, `main` Included") is closed by appending its resolution with the counts, and a new one-line
note records that EQ3 and the two filters at neutral stay in the chain and why (spec §3). The memory file is updated.
AUDIO_SYSTEM's Signal Graph, the grid's chain-order line and the roadmap 50.6 entry are **not** written here: they are
GLOBAL_PEDALS.md T17's and now describe the cells.

**Acceptance criteria:**
- [x] Spec §8 names: the cell's four nodes and the pinned `wet`, the law and where Tone's was read, the per-cell cut,
  the join at the dark Width cell, the Spread duck on the cell, the local Phaser rebuild, the HUD token, and each
  proof's numbers; §7 Q1 carries "cell, Crawford 2026-10-19".
- [x] `git diff docs/todo/backlog.md` shows every pre-existing line byte-identical (append-only, CRLF).
- [x] `src/docs/globalPedalsDocs.test.ts` unchanged in outcome (its four living-docs cases remain T17's).

**Verification:** `git diff --stat docs`; a read-through against the code (verify-roadmap-against-code).

**Dependencies:** T14. **Files:** `docs/specs/DARK_EFFECT_BYPASS.md`, `docs/specs/GLOBAL_PEDALS.md`,
`docs/tasks/GLOBAL_PEDALS.md`, `docs/tasks/DARK_EFFECT_BYPASS.md`, `docs/todo/backlog.md`. **Scope:** S (docs only).

**As built (2026-10-20).** Spec §8 now runs §8.0 (the cell as built, plus twelve numbered deviations from §1, each
traced to the task that recorded it), §8.1–8.3 as written, §8.4 (T13), §8.5 (the phone, passed with a caveat) and
§8.6 (every probe's absolute path). §7 Q3 and Q8 carry their answers; Q1 already did. GLOBAL_PEDALS.md (the spec) §8
gains the bypass entry, and its plan gains a status update. Every function and variable named was checked against
`globalFx.ts`, `hudLines.ts` and `audioDiagnostics.ts`, and the three deleted names (`BUILT_DARK`, `_spreadWetGain`,
`_lastControlledDecay`) are absent from `src/`. The backlog is 31 lines added, none changed, CRLF. `src/docs` is
1557 pass / 4 fail, the four T17 cases, unchanged.

**Deviation:** backlog 27 is **not closed**. The bypass removed the dark-effect cost it named, but its subject, `main`
underrunning on the phone, stands, and round 4 added the late-sitting collapse. So the appended update records the
counts and the next step (a desktop long run for load that grows during a run), and the item stays open. Backlog 28 is
the EQ3 and filters note.

---

### Checkpoint: Complete

- [x] T1–T15 committed, one per task, on `feature/pedals`; Checkpoints A and B passed; T14 recorded as pass or
  routed. *(T14 passed with a caveat.)*
- [x] Spec §5's criteria each met with a number, or a miss recorded with Crawford's decision.
- [x] Hand back to GLOBAL_PEDALS.md T16 (Crawford's listen, now including this plan's Checkpoint B list) and T17
  (docs for all of 50.6, describing the cells).

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The forty cell nodes cost more on the phone than the probe predicts | High (the whole point) | T12's 70 ‰ ceiling before the phone; the per-cell cut is the first thing to re-price alone; a miss stops |
| A crossing still clicks (a quantum sees a non-silent mutation we did not foresee) | High | T11 measures every effect both ways with a click control; the fix space is listed in the task; T3's design keeps every mutation on a zero gain |
| The chain-order re-pin (T2) hides a wiring mistake behind rewritten expectations | Medium | T2 is transparent by design, so `npm run dev` must sound identical; the two full-chain-line cases are rewritten node by node, not loosened; T10 later proves the lit sound by render |
| The Spread duck and the darken timer interleave badly | Medium | T5's mid-duck darken case and the "never disconnects in a duck" assertion; both timers are per cell |
| A pending darken fires on a disposed Phaser | Low | T7: keyed by cell, reads `cell.effect` at fire; a case for it |
| Index-based mock lookups (`filterCutOf`, `at(-2)`) silently pick the wrong Delay once twelve exist | Medium | T2 fixes both to explicit indices and asserts the picked node feeds the Distortion cell's `in` / is fed by the robot bus |
| T12's `perf:audio` is noisy between sittings | Low | A/B in one sitting, interleaved, T0's before-numbers alongside; hygiene per PERFORMANCE.md |
| The scratchpad probe folder is gone | Low | T0 checks; the recipes in GLOBAL_PEDALS.md §8 rebuild it in half a task |

## Open Questions

- **Spec Q3 (join wording):** the plan assumes Crawford's "cell for sure" accepts the join staying at the dark Width
  cell (assumption 6); T6 builds it that way and T15 records it. Say so if not.
- **Spec Q4 (a fresh seed never lands Width at exactly 0.5):** not this plan's work; recorded for reading the phone
  numbers; a seeding question for later.
- **Roadmap (assumption 16):** inside 50.6, written by T17. Say so if a 50.7 is wanted instead.
- **Width's cell at T2:** built transparent at `dry 0 / wet 1` like the others, so a Width of 0.5 passes through the
  widener until T6 — identical sound, since 0.5 is unity.
