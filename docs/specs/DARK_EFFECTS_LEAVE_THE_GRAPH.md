# Phase Spec: Dark Effects Leave the Graph — a dark effect does not exist

> **Execution Commands**
> - Type check: `npm run build:types` (`tsc --noEmit`)
> - Lint: `npm run lint`
> - Focused tests: `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/globalFx.headless.test.ts src/engine/AudioEngine.test.ts`
> - Unit tests: `npm test`
> - Build check: `npm run build`
> - Dev server: `npm run dev`
> - The A/B (§5.3): `npm run build && npx vite preview --port 4173` for the branch, `main`'s build on another port, then
>   `npm run perf:audio -- --worlds "ez84fjmr:93:-146?theme=wreck&load=full,bravo:-150:90?load=full" --rot <n> --seconds 120 --bucket 15`
>   (hygiene: [PERFORMANCE.md](../PERFORMANCE.md) "Measurement hygiene")
> - The census: `npm run perf:audio-census -- --world "ez84fjmr:93:-146?theme=wreck&load=full"` (and `bravo:-150:90?load=full`,
>   and each world with `load=light`)

**Status:** spec written 2026-11-10 from the confirmed intent
[docs/intent/dark-effects-leave-the-graph.md](../intent/dark-effects-leave-the-graph.md) (interview 2026-11-10, five
questions, every guess taken). Open questions Q1 and Q2 answered by Crawford the same day (§7, both at their
defaults); spec approved for planning the same day. Plan:
[docs/tasks/DARK_EFFECTS_LEAVE_THE_GRAPH.md](../tasks/DARK_EFFECTS_LEAVE_THE_GRAPH.md) (2026-11-10, seventeen tasks
in five phases). **Built** 2026-11-10 on `perf/dark-effects-leave-the-graph`, the runs and Crawford's ear passed:
§8, "As built". Backlog
[72](../todo/backlog.md#72-audio-dark-effects-leave-the-graph--their-standing-signals-go-b9), 67's B9, first item of
plan.md's Stage 1. The evidence is the ablation in the backlog 67 record
([scratchy-audio-phones.md](../todo/scratchy-audio-phones.md), the second §9, "B9 (T16b)"); the cell model it changes
is [DARK_EFFECT_BYPASS.md](DARK_EFFECT_BYPASS.md)'s, and the hold-off it extends is
[LIGHT_TIER_STANDING_COST.md](LIGHT_TIER_STANDING_COST.md)'s H1.

Written for: Crawford, and the agent that plans and builds it.

---

## 0. Scope check

One capability: the ten bypass-cell effects get a lifetime (built at a light, torn down when dark at their own level).
Every acceptance criterion below is one behaviour of that lifetime or the proof that it costs nothing audible. No
capability map.

---

## 1. Overview & Claude Explanation

### 1.1 Today

`buildGlobalFxChain()` (`src/engine/audioEngine/globalFx.ts`) constructs all ten effects at their defaults, pinned
fully wet, and puts each in a bypass cell (`bypassCell.ts`: five chain cells, five room branches). A dark cell
(`writeCellMix` to a target of 0) ramps to dry and then disconnects the effect's two edges on Tone's context timer, and
since backlog 27's H3a it stops the effect's own LFOs. But the effect object stays built, and its Tone Signals keep
rendering: each is a ConstantSource the audio thread runs every quantum whether or not anything hears it.

The ablation disposed every effect whose own Mix was 0, 3 s after power-on. At Full against the build with 67's kept
cuts, the mean fell **−0.026** on W1 (`ez84fjmr:93:-146`, Wreck) and **−0.022** on W2 (`bravo:-150:90`), W1's crest
**−0.055**; the census fell **−163** nodes on W1 and **−196** on W2, the rendering ConstantSources **−26** and **−28**.
At Light every effect is held dark (H1), so the saving there is all ten effects, not three to five.

The engine is built once a session (`loadInstruments`, guarded by `instrumentsLoaded`). A world change or reseed
(`audioStore.ts`) and a save's load (`sessionDiff.ts`) do not rebuild the chain: they push every setter again through
`applyGlobalAudioToEngine`, so a world change is a set of Mix writes like any other.

### 1.2 The rule

An effect exists only between its cell's first light and the teardown after it goes dark at its own level.

- **Built at a light, never before.** `buildGlobalFxChain()` builds the rooms and the cells with no effect in them and
  constructs none of the ten. The first `writeCellMix` that lights a cell (a target above 0) builds the effect from its
  settings mirror (§1.4), puts it in the cell (`setCellEffect`: LFOs recorded and stopped), then takes today's path:
  connect under the zero wet gain (LFOs started), ramp to the law.
- **Dark at its own level** (the predicate the teardown reads, `darkAtOwnLevel`):
  - a chain cell (AutoWah, Phaser, Tremolo, Vibrato, Width) whose target is 0: a Mix of 0, or Width at exactly 0.5;
  - a room branch whose own depth is 0 or whose room's Return is 0. The Colour trio's depths are their Mixes (the Colour
    Return is never written and stays 1); the Chorus and the Shifter are pinned at depth 1, so their Mix is the Double
    and Shimmer Return;
  - every cell while the effects hold-off has it, since `setEffectsHeldOff(true)` writes each cell's level to 0 (Width
    0.5) through `writeCellMix`.
  
  **Not** dark at its own level: a branch whose room is only unfed (no reserved robot sends into it). Its depth and
  Return stand, it lights again the moment a robot feeds the room, and the rooms' feed flips all the time as robots
  reserve and release voices. It disconnects as today and keeps its effect.
- **Torn down a while after.** When a cell is dark at its own level, out of the signal path (not `connected`), and holds
  an effect, a teardown is armed on Tone's context timer, `DARK_TEARDOWN_SECONDS` (1 s) out. At its fire, if all three
  still hold, the effect is disposed, the cell's `effect` set to null and its `lfos` emptied, and the `_global<Effect>`
  alias nulled. A darken arms it from the disconnect's fire, so the wait is counted from the moment the effect left the
  path.
- **Checked on every write, not only at a disconnect.** A cell that is already disconnected can become dark at its own
  level without a crossing: a Colour Mix or a Return written to 0 while the room is unfed (`writeCellMix` sees a
  re-send and returns; `setRoomReturn` sees no change of liveness and does not sync), or the hold-off reaching a branch
  of an unfed room. So every Mix, depth and Return write ends with the teardown check for the cells it touched, and
  `setRoomReturn` checks each of its room's branches whether or not the room's liveness flipped.
- **A light or a write that ends the condition cancels a pending teardown.** A light in the wait finds the effect still
  there and lights it as today, nothing built. A write that leaves the cell disconnected but no longer dark at its own
  level (a Return raised while the room is unfed) cancels it too. The fire re-checks all three conditions regardless.
- **A failed build is a dry cell.** If the constructor throws, the cell warns once per key, stays dry and unconnected,
  and the write returns before recording the target, so the next light tries again (the `connectEffect` failure rule).

### 1.3 Why a wait, and why the timer it uses

A Mix slider dragged through 0 (or the hold-off flickering with the budget) must not construct and dispose an effect
on every crossing; one second outlasts a drag's pass through 0 and the time a darken takes to disconnect (lookAhead
plus 0.06 s; +288–349 ms measured in the backlog 67 record's second §8). The wait
runs on Tone's context timer (`Tone.getContext().setTimeout`, the darken's own), so it is on the audio clock: a
power-off pause suspends the context and the wait freezes with the world, and `clearCells()` cancels it with the
cell's other timers. No `setTimeout` or `setInterval` touches it.

### 1.4 The settings mirrors

A setter must accept a write while its effect is gone and keep it for the build, so each of the ten effects gets a
mirror of its last clamped values, the way `_phaserLive` (with `_phaserStages`) mirrors the Phaser today.

- **One mirror per effect, module state in `globalFx.ts`**, reset to `DEFAULT_GLOBAL_AUDIO_SETTINGS` by
  `buildGlobalFxChain()`. It holds exactly the fields its setter writes to the node (not the Mix, which `holdOffs.ts`
  already records as `_lastMix`, nor the Chorus and Shifter Returns, which the room records).
- **Every setter records first,** before `writeMix` or `setRoomReturn`, so an effect a write lights is built from values
  that include that write. This generalises `setGlobalPhaser`'s rule.
- **A node built during the call takes no further writes from it.** It came up at the mirror's values, so the setter's
  ramps and plain writes run only against a node that existed before the call (the Phaser's `rebuilt` return,
  generalised). A setter whose effect is absent and stays absent writes nothing to any node.
- **A builder per key constructs from the mirror**, pinned fully wet, as `buildGlobalFxChain` constructs today: the
  Chorus and Tremolo `start()`ed after construction (Tone does not start them; the cell then stops and starts them), the
  Phaser at the mirror's stages (`buildPhaser`), the Distortion and Chebyshev at `oversample: 'none'`, the BitCrusher in
  its try/catch. Constructor options take every field Tone accepts there; the rest is written straight after
  construction, before the connect, while the effect is out of the path.
- **Width is built at 0.5**, its unity, whatever the mirror holds, and its `width` ramps from there as the cell lights:
  today's order (DARK_EFFECT_BYPASS.md assumption 5, the cell first, the width ramp concurrent), kept so a light from
  absent sounds as a light from built.
- **The Chorus's Spread target** (`_spreadTarget`) is the mirror's Spread: a built Chorus or Tremolo comes up at it, and
  `resetSpreadTargets()` stays with the chain build.
- **The Phaser's Stages** on an absent Phaser are recorded in the mirror only (`writePhaserStages` neither rebuilds nor
  ducks); the next light builds at that count. A present Phaser, lit or in its wait, rebuilds as today. Boot then builds
  the Phaser once at its seeded count, where today it builds the default 10 and then the seeded count.

### 1.5 Ducks, the hold-off, the rooms and the chain wiring

- **A teardown cancels its key's pending duck.** A duck's change (a Spread, a Stages count) is already in the mirror, so
  the rebuilt node carries it. A pending Phaser duck's `_phaserDuckStages` becomes the mirror's stages. A duck only runs
  on a connected cell and a darken outlasts it (a duck's timer is lookAhead plus 0.03 s, a darken's lookAhead plus
0.06 s), so this is a
  guard against a drag that keeps re-arming the duck, not the common path.
- **The hold-off needs no change of its own.** `holdOffs.ts` darkens and lifts through `writeCellMix`, so a hold
  tears every effect down a second after its disconnect, and a lift builds every cell that lights at its recorded Mix:
  up to ten constructions in one task, accepted (intent), not staggered. A branch of an unfed room is not built by a
  lift; it is built when its room is fed.
- **Rooms:** `syncRoom`, `setRoomFed` and `setRoomReturn` keep their crossings; the build and the teardown ride on
  `writeCellMix` and the checks of §1.2. `roomNodes` and `cellNodes` already skip a null effect.
- **The chain wiring is unchanged.** `wireCells()` makes an effect's edges only for a connected cell with an effect, and
  `disconnectAllFxNodes()` filters nulls, so a Decay flip with absent effects wires every cell dry. The `?debug` output
  taps sit on the pre-master and master nodes, never on an effect.
- **The `?debug` HUD's `fx in n/10`** keeps counting connected cells (`getConnectedEffectCount`). No new token.

### 1.6 Boot order

`loadInstruments` today tells each new room whether it is fed (`setRoomFed`) right after `buildGlobalFxChain()`, before
`applyGlobalAudioToEngine` pushes the seeded values. With the Chorus and Shifter pinned at depth 1 and every Return at
its default 1, a fed room would light and so build its branch at default settings, and a world whose Return is 0 would
tear it down a second later: built to be thrown away. So **the room-feed sync moves after the first push**: the rooms
learn they are fed only once the seeded Returns, depths and Mixes are in the mirrors and the cells. No effect is
constructed before that push.

### 1.7 The BitCrusher's worklet

`Tone.BitCrusher` constructs synchronously but makes its AudioWorkletNode in the `then` of
`context.addAudioWorkletModule` (Tone caches the module's promise per context), so the crushed path is silent until a
later microtask, and on a context's first BitCrusher until the module has loaded. Today that gap only happens at boot.
Built at a light, a BitCrusher's first light in a session could be mid-music: the wet ramp would start on a silent path
and the crush would arrive part-way up it as a step.

So **a BitCrusher lights only once its worklet node exists.** Its light records the target, keeps the cell dry and
unconnected, and connects and ramps when the node is there; a darken before then cancels the pending light. How the
readiness is read (the wrapper's worklet field through a cast, as `effectEnds` reads Tone's protected fields, after the
context's `workletsAreReady()`) is the plan's to pin, test-first. The other nine are ready at construction.

### 1.8 What does not change

- The sound. A lit effect is the same node at the same settings in the same cell; every crossing is today's crossing.
- The cell model, the two gain laws, the chord-split ramps, the duck, the rooms and their feed, the send table, the
  Reverb and Delay rooms, the EQ3, the filters, the Compressor, the Limiter and the ceiling.
- `holdOffs.ts`'s API and its `_lastMix` record, the budget's tiers, `audioStore`, saves, share links, the seed and
  every UI surface.
- Global LFOs: `GLOBAL_LFO_TARGET_IDS` reaches only the EQ3, LPF and HPF (`getGlobalModulationTarget`), so no link can
  point at an effect that is gone.

---

## 2. Target File Structure

```text
src/engine/audioEngine/
├── bypassCell.ts            # the cell's lifetime: a builder hook per key; the build at a light; darkAtOwnLevel;
│                            #   the teardown timer (Cell.teardown, DARK_TEARDOWN_SECONDS), armed, cancelled and checked
│                            #   per §1.2; setRoomReturn checks its branches; cancelDuck; clearCells cancels teardowns;
│                            #   the BitCrusher's deferred light (§1.7) if the plan puts it here
├── bypassCell.test.ts       # the lifetime, against stub effects and a fake context timer
├── globalFx.ts              # no effect constructed in buildGlobalFxChain; ten mirrors and ten builders; every setter
│                            #   records first and writes only a node that existed before the call; Width at 0.5;
│                            #   writePhaserStages / rebuildPhaser for an absent Phaser; the aliases follow the cells
├── globalFx.test.ts         # construction counts, mirrors, rebuild values, Width, Phaser stages, Spread, ducks
└── globalFx.headless.test.ts   # a chain with no constructors still builds and wires dry
src/engine/AudioEngine.ts    # loadInstruments: the room-feed sync after the first push (§1.6)
src/engine/AudioEngine.test.ts

docs/AUDIO_SYSTEM.md         # The bypass cells: dark effects are not built; the Phaser's "boot builds it twice" line;
                             #   the effects tiers paragraph (a hold tears the effects down)
docs/todo/scratchy-audio-phones.md   # a "Backlog 72" section: the A/B, the censuses, the crossings, the ear
docs/PERFORMANCE.md          # the running table's W1 Full row, if the A/B moves it (Phase C's pin from 67)
docs/todo/backlog.md, docs/todo/plan.md   # 72's status; archive after the merge
docs/specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md   # an "As built" section
```

`holdOffs.ts`, `audioBudgetSystem.ts`, `audioStore.ts` and every component are untouched.

---

## 3. Implementation Boundaries & Constraints

**Always**
- RED first for every behaviour, one commit per task, the suite green at each (Crawford's TDD rule). Each lifetime rule
  in §1.2 is a test that fails on today's code.
- Every node and every AudioParam write stays in `globalFx.ts` and `bypassCell.ts`; the effects' lifetimes are module
  state, never Zustand.
- Every timer is Tone's context timer; every graph edit happens while the cell's wet gain is 0.
- Run the focused tests per task, the full suite, `build:types`, `lint` and `build` at each checkpoint.

**Ask first**
- Anything that changes how `AudioEngine` schedules, or touches `holdOffs.ts`'s API or the budget's tiers.
- Staggering the hold-off lift's builds (the intent accepts the burst; only a measured problem reopens it).
- A change to `tonePatches.ts` or any reach into Tone beyond reading a protected field through a cast.
- A second effect on the deferred-light path of §1.7.

**Never**
- Construct an effect at chain build, or for a cell that is not lighting.
- Tear down a branch whose only reason to be dark is an unfed room.
- Write to a node that is not in its cell, or to a disposed one.
- `setTimeout`, `setInterval`, `requestAnimationFrame` or `queueMicrotask` for the wait.
- A file-text test (source, doc or CSS read as text). A task with no behaviour (a doc, the record) has no RED test; its
  proof is a read or a run, named in the commit.
- Pre-v1 rule: no "keep existing sound" or compatibility clause goes into the docs; the sound is unchanged because the
  same node lights in the same cell, not because a clause says so.

---

## 4. Code Style & Architecture Conventions

The light and the darken's fire, as they would read in `bypassCell.ts` (names provisional; the plan pins them):

```typescript
/** Set by globalFx.ts for each key it can build: a fresh effect from that key's mirror, pinned fully wet, or null when
 *  Tone has no constructor for it. A throw is a failed build (§1.2). */
const _builders: Partial<Record<BypassKey, () => Tone.ToneAudioNode | null>> = {};

export function writeCellMix(key: BypassKey, mix: number): void {
  const cell = _cells[key];
  if (!cell) return;
  if (cell.room !== null) cell.depth = mix;
  const w = cellTarget(key, cell, mix);
  if (w > 0) {
    cancelDarken(cell);
    cancelTeardown(cell);
    // An absent effect is built here and only here: the cell is lighting, its wet gain is 0.
    if (!cell.effect && !buildEffect(key, cell)) return; // warned once; the cell stays dry; the next light tries again
    if (!cell.connected && !connectEffect(key, cell, cell.effect!)) return;
    // ... the ramp, as today
    return;
  }
  // ... the darken, as today; its fire disconnects, then checkTeardown(key, cell)
  checkTeardown(key, cell); // a re-sent dark write on a disconnected cell can still make it dark at its own level
}

/** Arm the teardown when the cell is dark at its own level, out of the path and holding an effect; cancel it when not. */
function checkTeardown(key: BypassKey, cell: Cell): void { /* ... */ }
```

- Names follow the neighbours': `buildEffect` beside `connectEffect` / `disconnectEffect`, `teardown` beside `darken` on
  the `Cell`, `DARK_TEARDOWN_SECONDS` beside `BYPASS_DISCONNECT_MARGIN_SECONDS`.
- The mirrors follow `_phaserLive`: a `type <Effect>Live`, a `default<Effect>Live()`, reset in `buildGlobalFxChain`.
- Comments as dense as the module's: each new function's doc comment names the spec section it implements.
- Headless-safe: a missing constructor is a key with no builder, and its cell stays dry (today's empty-cell rule).

---

## 5. Testing & Verification Requirements

### 5.1 Unit tests (RED first; Vitest, the existing Tone mocks and fake context timer)

1. `buildGlobalFxChain()` constructs none of the ten effects; the ten cells and three rooms exist; the chain wires dry.
2. A Mix write above 0 to a chain cell constructs its effect once, pinned wet 1, at the mirror's values (a field written
   while absent included), connects it and ramps. A second light while lit constructs nothing.
3. A setter on an absent effect writes no node; the values reach the node built at the next light.
4. A setter call that lights its effect writes no ramp or plain value to the node it just built.
5. A darken disconnects as today; `DARK_TEARDOWN_SECONDS` after the disconnect the effect is disposed, the cell's
   `effect` is null and its `lfos` empty; the setter then writes no node.
6. A light inside the wait cancels the teardown and constructs nothing.
7. A branch of an unfed room with depth and Return above 0 is disconnected and never torn down; feeding the room lights
   the same node.
8. A Colour Mix written to 0, or a Shimmer or Double Return written to 0, while the room is unfed arms the teardown
   (the re-send path); a Return raised again before the fire cancels it.
9. Width: built at 0.5 on a light from absent, the width ramping to the written value; dark at exactly 0.5 tears it
   down.
10. The hold-off: holding tears down every built effect after the wait; lifting builds each cell that lights at its
    recorded Mix and not the branches of unfed rooms.
11. The Phaser: a Stages write on an absent Phaser constructs nothing and the next light builds at that count; a
    present dark Phaser rebuilds as today.
12. A teardown cancels a pending duck; the rebuilt Chorus or Tremolo carries the Spread, the rebuilt Phaser the Stages.
13. A constructor that throws on a light: one warning, the cell dry and unconnected, the next light tries again.
14. The BitCrusher: a light before its worklet node exists leaves the cell dry and unconnected, then connects and ramps
    once it exists; a darken before then cancels the pending light.
15. `loadInstruments`: no effect is constructed before `applyGlobalAudioToEngine`; a fed Double room with a seeded
    Return of 0 builds no Chorus.
16. A Decay flip with absent effects wires every cell dry and reconnects the lit ones.
17. `clearCells()` cancels pending teardowns.

**Mutants** (each checked by hand, named in its task's commit): build at chain build again (case 1); drop the re-send
check (case 8); tear down on an unfed room (case 7); skip the mirror write on an absent effect (case 3); build Width at
the mirror's width (case 9); drop the teardown's duck cancel (case 12).

### 5.2 Checks

`npm run build:types`, `npm run lint`, `npm test`, `npm run build`, all clean at each checkpoint. The full run's known
`[vitest-worker] Timeout calling "onTaskUpdate"` exit (backlog 66) is noted, not chased.

### 5.3 Runs (the proof; not tests)

- **The census, Full:** W1 and W2 at `load=full`, the branch against `main`: the node drop near the ablation's −163 and
  −196, and the rendering ConstantSources near −26 and −28 (`perf:audio-handlers`, 8 s).
- **The census, Light:** W1 and W2 at `load=light`, the branch against `main`: none of the ten effects' nodes left once
  the hold's wait has run.
- **The A/B:** `perf:audio` on W1 and W2 at Full, same-session and interleaved, production builds, PERFORMANCE.md's
  hygiene. The deltas are recorded. **The work ships even if they land inside the noise band**: the census is the proof
  that the nodes are gone (intent).
- **The crossings:** the probe of the backlog 67 record's second §8 ("The crossings", the bar ≤ ×1.6, no gap), three
  runs each, on: a light from absent (the Phaser, Mix 0 → 0.3, after the wait); a light inside the wait; a Chorus light
  from absent by its room's feed; a Width light from absent; a BitCrusher's first light in a session; a hold-off lift
  with several effects to build; a world change that lights one effect and darkens another.
- **Crawford's ear:** W1 at Full on his desktop with `?debug`, with a hand drag of a Mix through 0 and back, a
  hold-off lift (the Audio Load dial down to Light and back) and a world change. Any click or gap stops the ship.

---

## 6. Git & Workflow Context

- The intent and this spec ride `docs/dark-effects-intent`, stacked on `docs/archive-backlog-71` (neither pushed).
- The build goes on `perf/dark-effects-leave-the-graph`, off `main` once the docs branch merges (or stacked on it, at
  Crawford's word, as backlog 71's modules were).
- One commit per task, the spec and backlog 72's status line kept current, checkpoints stop for Crawford.
- After the merge: backlog 72 archives (the conventions in `docs/todo/archive/`), its plan.md line goes, and this
  spec's status line says built.

---

## 7. Assumptions and Open Questions

Each assumption below is the default the spec is written to. Crawford's word changes any of them.

1. **The wait is 1 s** (`DARK_TEARDOWN_SECONDS`), on Tone's context timer, counted from the disconnect's fire (or from
   the write, for a cell already disconnected).
2. **Dark at its own level** is §1.2's predicate: a chain cell's target 0, a branch's depth 0 or Return 0, the hold-off
   included; an unfed room alone never tears a branch down.
3. **The Chorus and Shifter are torn down at a Return of 0**, since their Return is their Mix (the ablation kept the
   Shifter at a Return above 0 with its room unfed, and that is this rule).
4. **One mirror per effect**, reset at chain build; setters record first; a node built during a call takes none of its
   writes (§1.4).
5. **Width is built at 0.5** and ramps to its width as it lights (§1.4).
6. **A teardown cancels the key's pending duck**, whose change is already in the mirror (§1.5).
7. **An absent Phaser's Stages are mirror-only**; a present one rebuilds as today (§1.4).
8. **A failed build is a dry cell**, warned once per key, retried at the next light (§1.2).
9. **The hold-off lift builds in one task**, not staggered (intent).
10. **The room-feed sync moves after the first push** in `loadInstruments` (§1.6).

**Answered by Crawford, 2026-11-10:**

- **Q1. The BitCrusher's first light (§1.7): defer.** Its light waits until its worklet node exists, so its wet ramp
  never starts on a silent path. It is the only one of the ten that needs this: it is the app's one AudioWorklet effect,
  and Tone makes the worklet node asynchronously, while the other nine are native nodes (WaveShapers, biquads, delays,
  gains, oscillators) whose whole path exists when the constructor returns.
- **Q2. The boot order (§1.6): move it.** The room-feed sync runs after the first push, so no effect is built before
  the seeded values are in.

---

## 8. As built

Built 2026-11-10 on `perf/dark-effects-leave-the-graph`, one commit per task (T1 86898863 to T12 06f8bbb0), the runs
and the ear recorded in [todo/scratchy-audio-phones.md](../todo/scratchy-audio-phones.md), "Backlog 72", §1–§4. The
plan's tasks carry the detail ([tasks/DARK_EFFECTS_LEAVE_THE_GRAPH.md](../tasks/DARK_EFFECTS_LEAVE_THE_GRAPH.md)); the
shipped design is in [AUDIO_SYSTEM.md](../AUDIO_SYSTEM.md), **The bypass cells**.

**The names §4 left provisional.** The builders are registrations, not a bare table:
`registerEffect(key, { build, whenReady?, onTeardown? })` (an `EffectRegistration`), dropped with the cells by
`clearCells()`. `buildEffect`, `darkAtOwnLevel`, `teardownDue`, `checkTeardown`, `cancelTeardown`, `Cell.teardown`,
`DARK_TEARDOWN_SECONDS` and `cancelDuck` are as §4 named them. The deferred light (§1.7) is in `bypassCell.ts`:
`Cell.pendingLight`, set by a light on an unready node, and `watchReady`, which connects and ramps from wet 0 when the
registration's `whenReady` settles.

**Where it differs from §1.**

| Where | Built | Why |
|---|---|---|
| §1.4, Width | The widener's builder ramps its width from 0.5 to the mirror's; the setter ramps only a widener present before the call (T9, 18a2c8fb). | The hold-off's lift lights Width through `writeCellMix` without the setter, so a ramp in the setter would leave a widener torn down while held at unity after the lift. |
| §1.4, the setters | Most setters write their node's fields before their Mix write, to the node the cell held at the start of the call; only the Phaser reads its node before and writes after, if it is still the same node. | Equivalent to §1.4's rule (a node built in the call takes none of its writes) for every setter whose call cannot swap its node. |
| §1.6, the boot order | Moving the `setRoomFed` loop after the push was not enough. `AudioEngine.ts` gained `roomsTold`: until `start()` has pushed and told the rooms, a feeder flip only updates its set (T12, 06f8bbb0). | `loadInstruments`' post-load pass re-reserves every robot; a replaced voice unfeeds its rooms, and a lone feeder's set went empty and back, which told the room it was fed before the push. |
| §1.7, the readiness | `bitCrusherReady` awaits the context's `workletsAreReady()` and then checks `_bitCrusherWorklet._worklet` (Tone 15.1.22, read through a cast). No wrapper: ready, warned once. A disposed wrapper resolves. A failed load, or one with no node, rejects: the cell warns once and lights anyway (T10, 1cec48f4). | §1.7 left the field to the plan. |
| §1.2, the fire | The teardown's fire checks four conditions, not three: the key is also registered, so a cell that cannot come back is never emptied. | A headless chain, or a key with no constructor, keeps today's cell. |

Task 11 (647d9686) rewrote 297 cases that read an effect straight after `buildGlobalFxChain()` (286 in
`globalFx.test.ts`, 11 in `AudioEngine.test.ts`), each named in the commit: they now light their effect first, or sit
it in its teardown wait (`darkInWait`), or assert its absence. Lazy builds made two `AudioEngine.test.ts` start cases
seed-dependent; they read the seed.

**The six mutants of §5.1**, each killed, named in its commit: build at chain build again (T11, 647d9686); drop the
re-send check (T3, 1532fc51); tear down on an unfed room (T2, 2079716d, and again in T8, 75116ec5); skip the mirror
write on an absent effect (T6, b7f61474); build Width at the mirror's width (T9, 18a2c8fb); drop the teardown's duck
cancel (T4, 8eeedc58, and again in T7, fd5711be).

**The runs** (record "Backlog 72"):
- **The census** (§1): at Full, −307 nodes on W1 and −251 on W2, the rendering ConstantSources −46 and −36. Larger than
  the ablation's −163 / −196 because a Shifter whose room is unfed is never built on either world, nor W1's Chorus,
  where the ablation kept both at a Mix above 0. At Light no node of the ten is left on either world.
- **The A/B** (§2): the mean fell −0.050 on W1 and −0.032 on W2 against `main`, in every round and beyond every band,
  about twice the ablation's. PERFORMANCE.md's pin section has the backlog 72 rows.
- **The crossings** (§3): every event at or under ×1.107 with no gap, three runs each. A build costs 3–25 ms of main
  thread; the hold-off lift's six, 60–62 ms. The abrupt-step control ran twice per page, not three times.
- **Crawford's ear** (§4): "it all sounds fine, did all three things".
