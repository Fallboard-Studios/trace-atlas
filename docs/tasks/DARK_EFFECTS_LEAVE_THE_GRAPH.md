# Implementation Plan: Dark Effects Leave the Graph

Source spec: [docs/specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md](../specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md). Source intent:
[docs/intent/dark-effects-leave-the-graph.md](../intent/dark-effects-leave-the-graph.md). Backlog
[72](../todo/backlog.md#72-audio-dark-effects-leave-the-graph--their-standing-signals-go-b9), first line of plan.md's
Stage 1.

Written for: Crawford, and the agent that builds it.

## Overview

The ten bypass-cell effects get a lifetime: built at their cell's first light, torn down `DARK_TEARDOWN_SECONDS` after
they go dark at their own level, rebuilt from a settings mirror at the next light (spec §1.2–§1.7). Five phases:

1. **The cell's lifetime in `bypassCell.ts`** (Tasks 1–5). Driven in `bypassCell.test.ts` with stub effects and the
   hand-fired context timer. Nothing in the app registers an effect yet, and a cell with no registration behaves as
   today, so these tasks change nothing the app does.
2. **`globalFx.ts` registers its effects** (Tasks 6–10), a few keys per task, each with its mirror and builder. The
   chain still constructs every effect at build, so the app now tears dark effects down and rebuilds them, while the
   suite's many build-time reads of an effect keep working.
3. **Nothing built at chain build** (Task 11) and **the boot order** (Task 12). Task 11 is the switch the spec
   describes, and the one large test rewrite.
4. **The proof** (Tasks 13–16): the censuses, the A/B, the crossing probe, Crawford's ear. Runs, not tests.
5. **Docs** (Task 17).

## Architecture Decisions

- **One registration per key, in `bypassCell.ts`.** `registerEffect(key, { build, whenReady?, onTeardown? })`:
  `build()` returns a fresh effect from that key's mirror (pinned fully wet) or throws; `whenReady(node)` (the
  BitCrusher only, spec §7 Q1) resolves when the node's path exists; `onTeardown()` lets `globalFx.ts` fold what it
  holds for the key (the Phaser's `_phaserDuckStages`). `buildGlobalFxChain()` registers the keys after `clearCells()`,
  which drops every registration with the cells.
- **A cell with no registration is never torn down and never built at a light.** It cannot come back, so it keeps
  today's behaviour exactly: Phase 1 lands product-neutral, Phase 2 moves one group of keys at a time, and a headless
  chain (no constructor, no registration) is untouched.
- **Setters read the cell, not an alias.** Each of the ten `_global<Effect>` aliases goes when its key registers
  (Tasks 6–10); a setter reads `cellEffect(key)` at the start of the call (`before`) and again after its `writeMix` /
  `setRoomReturn`. It writes ramps and plain values only when the node it finds afterwards is `before` and not null
  (spec §1.4: a node built during the call takes none of its writes; an absent one takes none at all).
- **The mirrors are `_phaserLive`'s shape**: a `type <Effect>Live`, a `default<Effect>Live()` from
  `DEFAULT_GLOBAL_AUDIO_SETTINGS`, reset by `buildGlobalFxChain()`, written before the Mix. `_phaserStages` joins the
  Phaser's; `_spreadTarget` stays the Chorus's and Tremolo's Spread record.
- **The order is risk-first inside the cell.** The teardown and its re-send checks (Tasks 2–3) are the new state
  machine and the likeliest place for a silent leak (an effect never torn down) or a lost effect (torn down when it
  must not be), so they come before any key registers.
- **Task 11 is one commit.** The suite must be green at every commit, and making the build lazy breaks every case that
  reads an effect straight after `buildGlobalFxChain()` (about 170 instance reads in `globalFx.test.ts`, plus
  `AudioEngine.test.ts`'s chain blocks). The task first lists the failing titles with the JSON reporter, then rewrites
  each case to light its effect first through a shared test helper, or to assert its absence. Nothing else changes in
  that commit.
- **The crossing probe stays in the scratchpad**, rebuilt from the backlog 67 record's recipe (its second §8, the G1
  section's "The crossings": a Vite page importing the arm's `src/`, a recorder worklet, `drive.mjs`), as 67 did. It is
  not committed to `scripts/perf/` unless Crawford asks.

## Dependency Graph

```
Task 1 (build at a light)
   │
Task 2 (teardown) ── Task 3 (re-send + Return checks) ── Task 4 (duck cancel)
   │
Task 5 (deferred light, whenReady) ─────────────────────────┐
   │                                                          │
Checkpoint A                                                  │
   │                                                          │
Task 6 (colour trio + AutoWah) ── Task 7 (Phaser) ── Task 8 (Chorus, Tremolo, Vibrato, Shifter) ── Task 9 (Width)
   │                                                          │
   └──────────────── Task 10 (BitCrusher readiness: needs 5 + 6)
   │
Checkpoint B
   │
Task 11 (nothing built at chain build) ── Task 12 (boot order)
   │
Checkpoint C
   │
Task 13 (censuses) ── Task 14 (A/B) ── Task 15 (crossings) ── Task 16 (Crawford's ear)
   │
Task 17 (docs) ── Checkpoint Complete
```

Tasks 6–9 touch disjoint setters but one test file and one module, so they run in order, not in parallel.

## Task List

Every task names its **Proof**: **RED test** for behaviour, **Run** for a measurement, **Ear** for Crawford's listen,
**Read** for docs. Only a RED-test task lists a `*.test.ts`. No file-text tests (CLAUDE.md). Every RED task also runs
its mutant by hand where the spec names one (§5.1), and names it in the commit.

### Phase 1: The cell's lifetime (`bypassCell.ts`, no product change)

- [x] **Task 1: `bypassCell.ts` — a registered cell builds its absent effect at a light**

  **Description:** `registerEffect(key, { build })` and the registry, cleared by `clearCells()`. `writeCellMix` stops
  returning early for a cell with no effect: when the target is above 0 and the key is registered, it calls `build()`,
  puts the node in the cell (`setCellEffect`: LFOs recorded and stopped), then takes today's connect and ramp. A throw
  warns once per key, leaves the cell dry and unconnected, and returns before `cell.mix` is recorded, so the next light
  tries again. An unregistered cell with no effect still returns early (today's empty-cell rule). Spec §1.2, §4.

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: a room branch built with a null effect and a
  registered stub builder, its room fed, lights on a depth write: `build` called once, the stub connected under a wet
  gain of 0 and then ramped; a second light builds nothing; a throwing builder warns once over two lights and leaves
  the cell dry each time.

  **Acceptance criteria:**
  - [x] A light on a registered, empty cell builds once, connects silently and ramps; a lit cell builds nothing more.
  - [x] A failed build is one warning per key, a dry unconnected cell, no recorded target, and a retry at the next light.
  - [x] An unregistered empty cell ignores the write, as today; every existing test passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `src/engine/audioEngine/bypassCell.test.ts`

  **Estimated scope:** S (one module, one test file)

- [x] **Task 2: `bypassCell.ts` — the teardown after a darken**

  **Description:** `Cell.teardown` (a context timer id or null), `DARK_TEARDOWN_SECONDS = 1`, and `darkAtOwnLevel(key,
  cell)`: a chain cell whose target is 0, or a branch whose depth is 0 or whose room's Return is 0; never a branch whose
  room is only unfed. The darken's fire, after its disconnect, arms the teardown when the cell is registered, dark at
  its own level, unconnected and holding an effect. The teardown's fire re-checks all four, disposes the effect
  (`disposeQuietly`), sets `effect` null, empties `lfos` and calls the registration's `onTeardown`. A light cancels a
  pending teardown and finds the effect still there. `clearCells()` cancels pending teardowns. Spec §1.2, §1.3.

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: a lit registered branch darkened by its depth:
  the first fire disconnects and arms one timer of `DARK_TEARDOWN_SECONDS`; the second disposes the stub and calls
  `onTeardown`; a light between the two fires cancels it and builds nothing; a branch darkened only by `setRoomFed(false)`
  arms no teardown; `clearCells()` clears a pending one.

  **Acceptance criteria:**
  - [x] Dark at its own level and out of the path for `DARK_TEARDOWN_SECONDS`: the effect is disposed and the cell empty.
  - [x] A light in the wait keeps the same node; an unfed room alone never tears a branch down.
  - [x] An unregistered cell is never torn down; every existing test passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] Mutant: tear down on an unfed room (spec §5.1, case 7) fails the unfed-room case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `src/engine/audioEngine/bypassCell.test.ts`

  **Estimated scope:** S

- [x] **Task 3: `bypassCell.ts` — the teardown check on every write**

  **Description:** `checkTeardown(key, cell)` arms or cancels by the same four conditions, and runs at the end of every
  `writeCellMix` (the re-send path included, where today it returns before anything) and for each of its branches in
  `setRoomReturn`, whether or not the room's liveness flipped. A write that leaves the cell disconnected but no longer
  dark at its own level (a Return raised while the room is unfed) cancels a pending teardown. The hold-off writing 0 to
  a branch of an unfed room is this path. Spec §1.2 "Checked on every write".

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: with the room unfed and the branch already
  disconnected, a depth written to 0 arms the teardown; on a pinned branch, `setRoomReturn(room, 0)` arms it and
  `setRoomReturn(room, 0.5)` before the fire cancels it; both fail on Task 2's code.

  **Acceptance criteria:**
  - [x] A re-sent dark write that makes a disconnected cell dark at its own level arms its teardown.
  - [x] `setRoomReturn` arms or cancels each branch's teardown even when the room's liveness does not flip.
  - [x] A pending teardown is cancelled by any write after which the cell is no longer dark at its own level.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] Mutant: drop the re-send check (spec §5.1, case 8) fails the unfed-room depth case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `src/engine/audioEngine/bypassCell.test.ts`

  **Estimated scope:** S

- [x] **Task 4: `bypassCell.ts` — a teardown cancels its key's pending duck**

  **Description:** The teardown's fire clears the key's duck (`_ducks[key]`: its timer cancelled, its `apply` dropped)
  before disposing, and calls `onTeardown` after, so `globalFx.ts` can fold a pending change into its mirror (Task 7).
  Spec §1.5.

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: a registered chain cell with a duck re-armed
  past its darken (a stub `apply` spy) reaches its teardown: the duck's timer is cleared, `apply` never runs, and
  `isDucked(key)` is false.

  **Acceptance criteria:**
  - [x] A teardown leaves no duck pending for its key and never runs the dropped `apply`.
  - [x] A duck on a cell that is not torn down runs as today.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] Mutant: drop the duck cancel (spec §5.1, case 12) fails the case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 2.

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `src/engine/audioEngine/bypassCell.test.ts`

  **Estimated scope:** XS

- [x] **Task 5: `bypassCell.ts` — a light waits for an effect that is not ready**

  **Description:** A registration with `whenReady(node)` (Q1, the BitCrusher's): a light that builds the node records
  the target, keeps the cell dry and unconnected, and sets a pending-light marker; when `whenReady` resolves, if the
  cell still targets above 0, it connects (wet 0) and ramps from 0 to the target. A darken before then clears the
  marker, so the resolve does nothing; the teardown check treats a pending light as not dark. A node already ready
  (resolved before the light) lights in the same call. Spec §1.7.

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: a stub registration whose `whenReady` returns a
  promise the test resolves by hand: no connect before the resolve, connect and ramp after it; a depth of 0 written
  before the resolve leaves the cell unconnected after it.

  **Acceptance criteria:**
  - [x] An unready effect is never connected before its readiness resolves, and lights from wet 0 after it.
  - [x] A darken before readiness cancels the pending light.
  - [x] A registration without `whenReady` lights in the same call, as Task 1.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 1 (and Task 3's check, which a pending light must pass).

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `src/engine/audioEngine/bypassCell.test.ts`

  **Estimated scope:** S

### Checkpoint A: The cell's lifetime
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (the known `onTaskUpdate` exit noted, backlog 66).
- [x] No existing test was edited in Tasks 1–5: nothing in the app registers an effect, so its behaviour is unchanged.
- [x] Reviewed with Crawford before Phase 2.

**Status (2026-11-10):** Phase 1 committed (86898863..422f1f84); Checkpoint A passed (full suite: the two known
flakes, sceneToOrbiterLocal and an audioSwells ramp case, failed under load and passed alone; the onTaskUpdate exit
noted). Next: Task 6, in a fresh session.

---

### Phase 2: `globalFx.ts` registers its effects (still built at chain build)

- [x] **Task 6: `globalFx.ts` — the colour trio and the AutoWah leave and come back**

  **Description:** Mirrors for the Distortion (`amount`), Chebyshev (`order`), BitCrusher (`bits`) and AutoWah (its six
  non-Mix fields); a builder per key from its mirror, pinned wet 1 (`oversample: 'none'` on the two shapers, the
  BitCrusher in its try/catch); `registerEffect` for the four in `buildGlobalFxChain()`. Their setters record first,
  read the cell for `before` / after, and write only a node that was there before the call; the four `_global*` aliases
  go. The chain still constructs the four at build. Existing cases that fire the timers after a darken and then read
  the node are updated to the teardown, each named in the commit. Spec §1.4, §5.1 cases 2–5 and 10.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: the Distortion darkened (Mix 0) and its timers
  fired is disposed; `setGlobalDistortion({ amount })` while absent writes no node; Mix 0.4 then builds a second
  Distortion constructed with that amount; a call that lights an absent AutoWah with a new Q constructs it at that Q and
  never calls its `Q.rampTo`; `setEffectsHeldOff(true)` then the fires tears all four down and the lift rebuilds those
  at a Mix above 0 (the branches with their Colour room fed).

  **Acceptance criteria:**
  - [x] The four are torn down when dark at their own level and rebuilt at a light with every value written while absent.
  - [x] A setter call that builds its node writes nothing further to it; an absent node is never written.
  - [x] The hold-off tears them down and its lift rebuilds them; every other existing case passes unmodified.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/globalFx.test.ts src/engine/audioEngine/bypassCell.test.ts` passes.
  - [x] Mutant: skip the mirror write on an absent effect (spec §5.1, case 3) fails the amount case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1–4.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** M (one module and its large test file; four setters)

- [x] **Task 7: `globalFx.ts` — the Phaser leaves and comes back**

  **Description:** `_phaserLive` and `_phaserStages` become the Phaser's mirror and builder (`buildPhaser` at the
  mirror's stages). `writePhaserStages` on an absent Phaser records the count only (no rebuild, no duck); a present
  Phaser, lit or in its wait, rebuilds as today (`rebuildPhaser`, now reading and writing the cell, not the alias).
  `onTeardown` folds a pending `_phaserDuckStages` into the mirror's stages. The `_globalPhaser` alias goes. Spec §1.4,
  §1.5, §5.1 cases 11–12.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: a torn-down Phaser given Stages 6 constructs
  nothing, and the next light constructs one Phaser at 6 stages; a Phaser torn down with a Stages duck pending is
  rebuilt at that duck's count; a present dark Phaser given Stages rebuilds as today.

  **Acceptance criteria:**
  - [x] Stages on an absent Phaser are mirror-only; the next light builds at that count.
  - [x] A teardown with a pending Stages duck keeps the duck's count.
  - [x] The Stages duck and the dark rebuild of a present Phaser are unchanged.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6 (the registration pattern), Task 4.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** S

- [x] **Task 8: `globalFx.ts` — the Chorus, Tremolo, Vibrato and Shifter leave and come back**

  **Description:** Mirrors for the four pedals' non-Mix fields (the Chorus's Delay in ms and Depth as written, Rate in
  Hz as resolved, Feedback; the Tremolo's Rate and Depth; the Vibrato's Rate and Depth; the Shifter's shift), with
  `_spreadTarget` as the Chorus's and Tremolo's Spread. Builders construct from them (the Chorus's Delay in ms, as its
  constructor takes it today; only `rampChorusSweep`'s LFO range works in seconds) and `start()` the Chorus and the
  Tremolo after construction, as the chain does today. The Chorus and
  Shifter are torn down at a Return of 0 (spec §7 assumption 3). The four aliases go. Spec §1.4, §5.1 case 12.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: the Double room fed, the Chorus's Return written to
  0 and the timers fired disposes it; Spread, Delay and Rate written while absent reach the Chorus built at the next
  Return above 0, which is `start()`ed; a Chorus torn down with a Spread duck pending is rebuilt at that Spread; the
  Shifter with its room unfed and its Return above 0 is never torn down.

  **Acceptance criteria:**
  - [x] Each of the four is torn down when dark at its own level and rebuilt with every value written while absent.
  - [x] A rebuilt Chorus or Tremolo is started and carries the last Spread, a pending duck's included.
  - [x] An unfed Shimmer or Double room with its Return above 0 keeps its effect.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6, Task 4.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** M (four setters)

- [x] **Task 9: `globalFx.ts` — Width leaves at 0.5 and comes back at 0.5**

  **Description:** The widener's builder constructs at width 0.5 (unity) whatever its mirror holds; `setGlobalStereoWidener`
  records the width, writes the Mix (which lights and may build), then ramps `width` to the written value on the node
  it finds after, built in this call or not: the one setter that writes a node it just built (spec §1.4, assumption 5
  of DARK_EFFECT_BYPASS.md kept). The alias goes. Spec §5.1 case 9.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: Width 0.5 and the timers fired disposes the widener;
  Width 0.7 then constructs one at width 0.5 and ramps its `width` to 0.7 over `COLOUR_RAMP_SECONDS`.

  **Acceptance criteria:**
  - [x] A widener built at a light is constructed at 0.5 and ramps to the written width.
  - [x] Width at exactly 0.5 tears it down after the wait.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] Mutant: build Width at the mirror's width (spec §5.1, case 9) fails the case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 6.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** XS

  **As built (18a2c8fb):** the width ramp is in the widener's builder, not the setter. The hold-off's lift lights Width
  through `writeCellMix` without the setter, so a widener torn down while held would have come back at 0.5 and stayed at
  unity. The builder constructs at 0.5 and ramps to the mirror's width, which covers every light (spec §1.4, "its width
  ramps from there as the cell lights"); the setter ramps only a widener present before the call, as the other nine
  setters write only a node present before theirs. A test case covers the lift.

- [x] **Task 10: `globalFx.ts` — the BitCrusher lights once its worklet exists**

  **Description:** The BitCrusher's registration gains `whenReady(node)`: it resolves once the wrapper's worklet node
  exists (Tone makes it in the `then` of `addAudioWorkletModule`; the field is read through a cast, as `effectEnds`
  reads Tone's protected fields), checked after `Tone.getContext().workletsAreReady()`. The exact field and its
  fallback (no field: treat as ready, warned once) are pinned test-first against Tone 15's `BitCrusher` source in
  `node_modules`. Spec §1.7, §7 Q1, §5.1 case 14.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: the crusher mock built without its worklet field
  and a context whose `workletsAreReady()` the test resolves by hand: a Mix written to 0.5 leaves the cell
  unconnected; after the worklet field is set and the promise resolves, it connects and ramps.

  **Acceptance criteria:**
  - [x] A BitCrusher built at a light connects only once its worklet node exists.
  - [x] A darken before that leaves it unconnected; a crusher with no worklet field warns once and lights at once.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine/globalFx.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 5 and 6.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** S

### Checkpoint B: Every effect has a lifetime
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (the known `onTaskUpdate` exit noted).
- [x] No `_global<Effect>` alias is left for the ten; every setter reads its cell.
- [ ] Optional early listen, at Crawford's word: the dev server, W1, a Mix dragged through 0 and back after a second.
- [x] Reviewed with Crawford before Phase 3.

**Status (2026-11-10):** Phase 2 committed (b7f61474..1cec48f4); Checkpoint B passed (full suite 13602 tests in 350
files green, the onTaskUpdate exit noted; reviewed by Crawford; the optional listen not taken). Two notes for Task 11:
Task 9 is as built below, and a BitCrusher light now waits on its worklet check, which settles a few microtasks later
even when the node exists, so the test helper that lights an effect must `await flush()` for the crusher (Task 10's
commit names the existing cases that gained one). Next: Task 11, in a fresh session.

---

### Phase 3: Nothing built at chain build

- [x] **Task 11: `globalFx.ts` — the chain constructs no effect**

  **Description:** `buildGlobalFxChain()` builds the three rooms and the ten cells with a null effect and registers the
  ten builders; it constructs none of the ten (the `effects` table keeps the constructors only to decide which keys get
  a cell). Measure the fallout first: run `globalFx.test.ts`, `AudioEngine.test.ts` and `globalFx.headless.test.ts` with
  the JSON reporter and list the failing titles in the commit. Then add one test helper that lights an effect by its
  setter's Mix (or Return) and returns its node, and rewrite each failing case to light first, or to assert that the
  effect is absent where that is the point. No behaviour change beyond the lazy build. Spec §1.2, §5.1 cases 1 and 16.

  **Proof:** RED test — `src/engine/audioEngine/globalFx.test.ts`: `buildGlobalFxChain()` calls none of the ten
  constructors, yet every cell exists and the chain wires dry; a Decay flip with every effect absent wires every cell
  dry and, after one light, reconnects only that one.

  **Acceptance criteria:**
  - [x] The chain build constructs none of the ten effects; every cell and room exists and the chain is whole.
  - [x] Every rewritten case still proves what it proved, against a lit effect; the list of rewrites is in the commit.
  - [x] A Decay flip with absent effects wires dry and reconnects the lit ones.

  **Verification:**
  - [x] `npx vitest run src/engine/audioEngine src/engine/AudioEngine.test.ts` passes.
  - [x] Mutant: build at chain build again (spec §5.1, case 1) fails the case.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 6–10.

  **Files:** `src/engine/audioEngine/globalFx.ts`, `src/engine/audioEngine/globalFx.test.ts`,
  `src/engine/audioEngine/globalFx.headless.test.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** L (one product line, a large mechanical test rewrite; one commit by necessity, see Architecture
  Decisions)

  **As built (647d9686):** 297 cases failed (globalFx.test.ts 286, AudioEngine.test.ts 11, the headless file none);
  the commit lists them by group. Besides `lightUp` (the light helper this task names), the setter groups use
  `darkInWait`: lit, darkened and its disconnect fired, so the effect sits present and unconnected inside its teardown
  wait, the state every build left all ten in before, and their cases read as before. Constructor-throws cases now throw
  at the light. Two AudioEngine.test.ts cases that the lazy build made seed-dependent (one AutoWah, one widener at
  start) now read the seed, and two that would have passed vacuously (`disconnect()` with no argument, the ceiling's
  one feeder) light every effect first.

- [x] **Task 12: `AudioEngine.ts` — the rooms learn they are fed after the first push**

  **Description:** In `loadInstruments`, the `setRoomFed` loop over `ROOM_KEYS` moves after
  `applyGlobalAudioToEngine(globalAudio, bpm)`, so no effect is built before the seeded values are in. Check what sits
  between the two today (the dynamic import, `primeLfoBank`, the link loop) and keep their order otherwise. Spec §1.6,
  §7 Q2, §5.1 case 15.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: a robot feeding the Double room is reserved before `start()`,
  and the seeded Chorus Return is 0: after `start()` no Chorus has been constructed; with a seeded Return of 0.4 one
  Chorus is constructed, after the push, at the seeded settings.

  **Acceptance criteria:**
  - [x] No effect is constructed before `applyGlobalAudioToEngine` at start.
  - [x] A fed room whose seeded Return is 0 builds no branch; one above 0 builds it once, at the seeded values.

  **Verification:**
  - [x] `npx vitest run src/engine/AudioEngine.test.ts` passes.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 11.

  **Files:** `src/engine/AudioEngine.ts`, `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S

  **As built (06f8bbb0):** moving the loop was not enough. `loadInstruments`' post-load pass re-reserves every robot, a
  replaced voice unfeeds its rooms (`storeVoice`), and a lone feeder's set goes empty and back, so `setRoomFeeder` told
  the room it was fed before the push and its branch was built at the defaults (at a seeded Return of 0, built to be
  torn down). So a feeder flip updates its set only until `start()` has told the rooms (`roomsTold`), and `start()`
  tells each where its set stands once, after the push's `try` (a failed push still leaves the rooms told). The cases
  run with one feeder and with two, and assert that the post-load pass ran over the roster: the older
  `primedRosterThenStart` helper writes its roster to a locale the engine never reads, so its cases do not reach that
  pass. Mutants: telling the rooms right after the chain build fails all four; dropping the `roomsTold` check fails the
  two one-feeder cases.

### Checkpoint C: The build
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (the known `onTaskUpdate` exit noted).
- [x] Every spec §5.1 case is covered by a named test, and the six mutants were each checked and named in a commit.
- [x] Reviewed with Crawford before the runs.

**Status (2026-11-10):** Phase 3 committed (647d9686, 06f8bbb0). Full suite 13609 of 13610 green in 350 files: the one
failure was the known `sceneToOrbiterLocal` round-trip timing out at 5.7 s under the parallel run (10 of 10 alone), with
the known `onTaskUpdate` exit; lint has the four existing scenery warnings only; types and the build clean. The six
mutants are named in the T2, T3, T4, T6, T9 and T11 commits. Checkpoint C passed: reviewed by Crawford, who listened in the
dev server to effects lit and darkened ("everything sounds good"). Next: Task 13, in a fresh session.

---

### Phase 4: The proof (runs; measurement hygiene per PERFORMANCE.md, one harness call at a time, foreground)

- [x] **Task 13: The censuses, Full and Light**

  **Description:** Production builds of `main` and the branch on two `vite preview` ports. `perf:audio-census` and
  `perf:audio-handlers` (8 s) on W1 and W2 at `load=full`, then at `load=light` (read after the hold's wait has run).
  Record a "Backlog 72" section in `docs/todo/scratchy-audio-phones.md`: node counts by class, rendering
  ConstantSources, each build named by commit. Spec §5.3.

  **Proof:** Run — recorded in the record.

  **Acceptance criteria:**
  - [x] Full: the node drop is near the ablation's −163 / −196 and the rendering ConstantSources near −26 / −28, or the
        difference is explained.
  - [x] Light: none of the ten effects' nodes remain.

  **Verification:**
  - [x] The record's tables, commits named; no orphaned Chrome before or after.

  **As run (2026-11-10):** record "Backlog 72" §1. Full: −307 / −251 nodes and −46 / −36 rendering ConstantSources,
  larger than the ablation's because the branch also never builds the unfed rooms' Shifter (both worlds) and Chorus
  (W1), which the ablation kept at a Mix above 0. Light: no node of the ten left on either world.

  **Dependencies:** Checkpoint C.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** S (runs and a record section)

- [x] **Task 14: The A/B at Full**

  **Description:** `perf:audio` on W1 and W2 at Full, same session, interleaved, `main` against the branch, the
  rotation and seconds of the execution commands. Deltas and noise bands recorded beside 67's. It ships even if the
  deltas sit inside the band (spec §5.3). If W1's Full mean moves, PERFORMANCE.md's running table gets the new row.

  **Proof:** Run — recorded in the record.

  **Acceptance criteria:**
  - [x] Mean, crest and trough deltas on W1 and W2, with their bands, in the record.

  **Verification:**
  - [x] The record's table, commits named.

  **As run (2026-11-10):** record "Backlog 72" §2. 18 runs, three arms a round (main, the branch, main's byte copy),
  rotated. The mean fell −0.050 / −0.032 against main and −0.047 / −0.032 against its copy, in every round, about twice
  B9's ablation. Two of main's W1 runs stalled (56 and 99 underruns; the copy never did), so W1's band is taken from the
  unstalled round. The W1 mean moved, so PERFORMANCE.md's pin section has the backlog 72 rows.

  **Dependencies:** Task 13.

  **Files:** `docs/todo/scratchy-audio-phones.md`, `docs/PERFORMANCE.md` (if the pin moves)

  **Estimated scope:** S

- [x] **Task 15: The crossings**

  **Description:** The crossing probe rebuilt in the scratchpad from the backlog 67 record's recipe (the G1 section's
  "The crossings": the Vite page on the branch's `src/`, the 440 Hz + 1 kHz stereo pair into `getGlobalChainEntry()`,
  the recorder worklet, the context timer stamped, the peak second-difference ratio, gap ≥ 64 samples under 10⁻⁴).
  Three runs each of: a Phaser light from absent (after the wait); a light inside the wait; a Chorus light from absent
  by its room's feed; a Width light from absent; a BitCrusher's first light in a fresh context; a hold-off lift with at
  least three effects to build; a world change (an `applyGlobalAudioToEngine` push) that lights one effect and darkens
  another; the control and the abrupt step. Spec §5.3.

  **Proof:** Run — recorded in the record, with the main-thread time of each build.

  **Acceptance criteria:**
  - [x] Every event's ratio is at or under ×1.6 with no gap, or the failure is reported to Crawford before anything else.

  **Verification:**
  - [x] The record's table, three runs each, the probe's location named.

  **As run (2026-11-10):** record "Backlog 72" §3. Every event is at or under ×1.107 with no gap, over three runs; the
  checks read around each call confirm each light really built from absent (and the inside-the-wait light kept its
  node). Builds cost 3–25 ms of main thread; the hold-off lift's six, 60–62 ms. One deviation: the abrupt step ran
  twice on the `t72` page and twice on each of the three BitCrusher pages (eight in all), not three times.

  **Dependencies:** Checkpoint C.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** M (the probe's rebuild and seven events)

- [x] **Task 16: Crawford's ear**

  **Description:** Crawford's desktop, W1 at Full with `?debug`: a hand drag of a Mix through 0 and back (before and
  after the wait), the Audio Load dial down to Light and back (the hold-off and its lift), and a world change. Any
  click or gap stops the ship (intent). His words go in the record verbatim.

  **Proof:** Ear — Crawford's.

  **Acceptance criteria:**
  - [x] Crawford hears no click or gap on any of the three.

  **Verification:**
  - [x] His verdict in the record.

  **As run (2026-11-10):** record "Backlog 72" §4. On his dev server (5b914870's code): "it all sounds fine, did all
  three things". Pass.

  **Status (2026-11-10):** Phase 4 done (T13 5b16a3ee, T14 a41fca0e, T15 34b3bcff, T16 here). Next: Task 17, the docs,
  in a fresh session.

  **Dependencies:** Tasks 13–15.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS

---

### Phase 5: Docs

- [x] **Task 17: The docs, the spec's As built, backlog 72**

  **Description:** `docs/AUDIO_SYSTEM.md`: "The bypass cells" says a dark effect is not built and when it is torn down
  and rebuilt; the Phaser's "Boot builds the Phaser twice" line is corrected; the effects-tiers paragraph says a hold
  tears the effects down. The spec gets an "As built" section (each deviation, the mutants, the run results by
  reference). Backlog 72's status line says built. Every name spot-checked against the shipped source.

  **Proof:** Read — Crawford's review. No test file.

  **Acceptance criteria:**
  - [x] Every documented name and behaviour matches the shipped code.

  **Verification:**
  - [x] Manual read; every identifier grepped in `src/`.
  - [x] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Tasks 1–16.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/specs/DARK_EFFECTS_LEAVE_THE_GRAPH.md`, `docs/todo/backlog.md`

  **Estimated scope:** S (docs only)

  **As built (2026-11-10):** AUDIO_SYSTEM.md: **The bypass cells** gains "A dark effect is not built" (the registration,
  dark at its own level, the teardown, the mirrors, where the build lands) and the backlog 72 measurements; the Phaser's
  "Boot builds the Phaser twice" line now says boot builds none and a seeded lit one is built once at its seeded count;
  the effects tiers paragraph says a hold tears the ten down and the lift builds them; and four lines the build made
  stale are corrected (the Colour setters' "no-op when its node was not built", the BitCrusher's worklet, the rooms'
  feed told by `start()` after the push, the LFOs recorded by `setCellEffect`). The spec gains §8, "As built", and a
  status line; backlog 72's status and plan.md's line say built. Every identifier named was grepped in `src/` (45, all
  present); types clean, lint the four existing scenery warnings.

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (the known `onTaskUpdate` exit noted).
- [ ] Every automated acceptance criterion met; the six mutants named in their commits.
- [ ] The runs recorded (Tasks 13–15) and Crawford's ear passed (Task 16), or any not done flagged here, never skipped.
- [ ] Docs match the shipped code.
- [ ] Ready for Crawford's PR. Archiving backlog 72 and the plan.md line wait for the merge.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| An effect is never torn down: a dark path the checks miss (a re-send, a Return with no liveness flip, the hold-off on an unfed room) | Medium: the saving silently shrinks | Task 3's re-send and Return cases; Task 13's Light census must show zero effect nodes, which no missed path survives |
| An effect is torn down when it must not be (an unfed room's branch), so a robot's send goes unheard until a rebuild | High: audible | Task 2's unfed-room case and mutant; a branch's light always builds, so the worst case is a rebuild, never a silent send |
| A setter writes a disposed node (a stale alias, a captured node in a duck's `apply`) | High: a throw, or a write that is lost | The aliases go (Tasks 6–10); setters read the cell per call; Task 4 drops the duck with its node |
| A rebuilt effect does not sound as it did (a mirror field missed, or a unit slip such as the Chorus's Delay, ms at construction but seconds in its LFO range) | High: the sound changes | Each of Tasks 6–9 tests every non-Mix field written while absent reaching the rebuilt node; Task 15's crossings and Task 16's ear |
| Task 11's test rewrite weakens a case (lights the effect and so stops testing the dark build it meant to test) | Medium | The failing titles are listed first; each rewrite is named in the commit; the build-time cases assert absence rather than being dropped |
| The hold-off lift's burst of up to ten builds stalls the main thread long enough to underrun | Medium on a phone | Task 15 records each build's main-thread time; staggering is an "ask first" change (spec §3), reopened only by a measured problem |
| The BitCrusher's readiness field differs from Tone 15's source | Low | Task 10 pins it test-first against `node_modules/tone`, with a warned fallback that lights at once |
| `fireTimeouts()` in existing tests now also fires teardowns, so cases that darken and then read the node fail outside the task that registered their key | Low | Each of Tasks 6–9 updates only its own keys' cases and names them; Checkpoint B runs the whole suite |

## Open Questions

1. **The BitCrusher's first light** (spec §7 Q1). **Resolved** (Crawford, 2026-11-10): defer it until the worklet node
   exists (Tasks 5 and 10).
2. **The boot order** (spec §7 Q2). **Resolved** (Crawford, 2026-11-10): the room-feed sync moves after the first push
   (Task 12).
3. **Where the crossing probe lives.** **Default:** the scratchpad, as in backlog 67 (Architecture Decisions). Crawford
   may ask for it in `scripts/perf/`; that is a tooling task of its own, test-first for its pure part.
