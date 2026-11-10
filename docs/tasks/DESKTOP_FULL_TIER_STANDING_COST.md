# Implementation Plan: The Desktop Crackles at Full — the Graph's Standing Cost at Every Tier

Source spec: [docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md](../specs/DESKTOP_FULL_TIER_STANDING_COST.md). Source
intent: [docs/intent/desktop-full-tier-standing-cost.md](../intent/desktop-full-tier-standing-cost.md). Backlog slot:
this is backlog [67](../todo/backlog.md#67-audio-the-desktop-crackles-at-full--the-graphs-standing-cost-leaves-no-headroom)'s
own fix (spec §7 Q7), plan.md Stage 1. Docs branch `docs/intent-desktop-full-tier-67` (the intent, the spec, this
file); build branch `perf/desktop-full-tier-standing-cost` off `main` once the docs merge, else off the docs branch.

Commands: `npx vitest run <path>`, `npm test`, `npm run build:types`, `npm run lint`, `npm run build`,
`npm run build && npx vite preview --port 4173`, `npm run perf:audio`, `npm run perf:audio-handlers`,
`npm run perf:audio-census` (T2, new).

(The planning skill's default output paths `tasks/plan.md` / `tasks/todo.md` are overridden by the repo convention
`docs/tasks/<SPEC>.md`, per CLAUDE.md "Authority and precedence".)

## Overview

Three gated phases and a docs tail, in backlog 27's shape. **Phase A** builds one measurement tool (a census of the
graph by call site, with a unit-tested tally) and one harness fix (a forced GC before `perf:audio`'s census line), then
runs the instruments on W1 (`ez84fjmr:93:-146?theme=wreck`) and W2 (`bravo:-150:90`) at Full: the handler breakdown,
the two censuses, and eight ablation A/Bs on throwaway builds (B1–B8); it ends in one dated section of
`scratchy-audio-phones.md` with a decision table for **Gate A**, where Crawford picks the cuts. **Phase B** lands the
inaudible cuts Gate A keeps, in its order: docked and muted robots' voices released (G1), a native bus filter and no
composite out Gain (G2a), Tone's effect wrapper bypassed under the cells (G3), Full at `playback` (G4, if taken), and
the leaner synth layer (G2b) only on Gate A's word; each a RED test, the build, a same-session desktop A/B at Full and
a crossing check, kept or dropped on its number. It ends at **Gate B**, Crawford's ear at full 4K with his Chrome
open. Only on a miss, **Phase B2** builds the audible candidates one at a time (k-rate bus filter, a lower Phaser stage
ceiling, the AutoWah's rolloff, native pedals), each heard by Crawford and taken or left, Gate B run again after each
yes. **Phase C** pins the passing build's figure. Docs last. Every task names its **Proof** (TASK_TEMPLATE.md): RED
tests where behaviour changes, a run for every measurement, a listen where the ear is the proof, a Read for records and
docs. No file-text tests, no docs guards (CLAUDE.md, 2026-10-23). One commit per task; throwaway ablation builds are
never committed.

## Architecture Decisions

- **The census by call site needs no source patch** (spec assumption 7). `audio-census.mjs` opens the world with the
  shared `withPoweredWorld` helper (`scripts/perf/powered-world.mjs:21`) and, before navigation, installs a wrapper
  over `BaseAudioContext.prototype`'s `create*` methods and the node constructors through
  `Page.addScriptToEvaluateOnNewDocument`; each creation records `{ type, stack }` on a page global, read back after
  the warm-up with `Runtime.evaluate`. Stack frames are resolved against the served build's source maps
  (`vite build --sourcemap` to the scratchpad, served beside stock), so a frame reads `reserveVoice (AudioEngine.ts)`
  rather than a minified name. The pure part (`audio-census-lib.mjs`) picks the first frame outside `node_modules`
  (or the top Tone frame when none), tallies class × frame, and formats the table with totals and the attributed share.
- **The ablations are 120 s, three rounds, the stock drift re-measured first**, as backlog 27's T6 (its OQ8): eight
  pieces × two worlds × three rounds × two arms is 96 runs. The **crest bucket** (the highest 15 s mean) is recorded
  beside the mean for every run, because W1 clicks at the crest, and the ablation table reports both.
- **Every ablation is a named edit, never committed**, built from the stock commit with one `src/` edit to the
  scratchpad, `src/` restored and `git status --porcelain src` empty before the next, each diff kept beside the runs.
- **G1 widens the ledger, it does not add a second one.** `createStandingBy` (`src/engine/audioEngine/standingBy.ts`)
  already releases after the last note, refuses `reserveVoice` while released, and rebuilds on admission; `reconcile`
  (`src/systems/audioBudgetSystem.ts`) today pushes `arrivalOrder.filter(not sounding)`, the *eligible* robots over the
  cap. G1 pushes every robot outside the sounding set that G1 covers: the eligible-over-cap as before, plus the muted
  (docked or by the user). **Solo-silenced robots are not released in this phase** (spec §7 Q1, recommendation
  adopted pending Crawford at T0): one solo would stand eleven down and un-solo would rebuild eleven in one tick; T11
  measures that burst with the crossing recipe and records it, and solo joins G1 in a later task only if it reads clean.
  The docs' "standing by" keeps its name; ROBOT_LIFECYCLE.md rule 6 is rewritten at T27.
- **G1's admission passes the tick's time to the sends.** `updateRobotSends(robotId, sends, time?)`
  (`AudioEngine.ts:1185`) already takes a `time`; `reReserveVoice`'s prime of the sends is given the Transport callback's
  time so `rampOrSet` schedules from it, not from `now()` — the Tone warning backlog 27's H2 record left unfixed goes
  with it.
- **G2a builds the bus filter on Tone's own raw context, behind the same helpers.** `busFilter.ts` gains a builder that
  returns a native `BiquadFilterNode` from `Tone.getContext().rawContext.createBiquadFilter()` when it exists, else
  today's `Tone.Filter` (headless, or a mocked Tone) with one `devWarn`. `updateRobotBusFilter` writes `frequency` and
  `Q` through `rampOrSet` (a native `AudioParam` has `setValueAtTime` and `linearRampToValueAtTime`; `rampOrSet`'s
  fallback branch covers a param with no `rampTo`) and assigns `type`. `getRobotModulationTarget('bus.frequency')`
  (`AudioEngine.ts:966`) returns the native `frequency` param; `connectAdditively` (`lfoShared.ts:110`) sets
  `override = false` on it (an expando on a native param, harmless) and re-asserts `value`; a native param sums its
  connected inputs onto its intrinsic value, which is what the Tone Signal did with `override` off. **G5's k-rate** is
  then one assignment on the same node, reachable without touching Tone (spec G5).
- **G2a drops the composite `out` Gain by letting the layers connect to the panner directly.** `CompositeVoice.output`
  is a `Tone.Gain` built at unity and never written (`compositeVoice.ts:186`; no caller passes `outputGain`). T13 gives
  the composite a `connect(destination)` that connects each layer Gain, and `reserveVoice` calls it instead of
  `composite.output.connect(panner)`; `set({ outputGain })` is removed with its field (unused). The headless count pin
  (`AudioEngine.test.ts:4724–4754`, `gain: layers + 7`) becomes `layers + 6`, and a Filter is no longer a Tone
  construction.
- **G3 reaches Tone's `effectSend` and `effectReturn`, not the inner node.** On every Tone `Effect` the subclass wires
  `effectSend → inner → effectReturn` and the base wires `input → _dryWet.a`, `effectReturn → _dryWet.b`,
  `_dryWet → output` (`effect/Effect.js:17–35`); both Gains are `protected` on the `.d.ts`, read through a cast in
  `bypassCell.ts`. A cell wired `in → effectSend` and `effectReturn → wet` leaves `input`, the CrossFade and `output`
  with no path to the destination, so they stop rendering; `StereoEffect`'s split and merge sit inside the send/return
  pair and keep working. `connectEffect` / `disconnectEffect` (`bypassCell.ts:307, 327`) make and drop the same two
  edges on the new endpoints; `rebuildPhaser` goes through them. An effect whose instance has no `effectSend` (a mock,
  or a Tone that moved) falls back to today's edges with a `devWarn`; no `tonePatches.ts` wrapper is needed.
- **G4 is one constant and its two tests** (`LOAD_PLAYBACK_BELOW` above 1, `src/constants/index.ts:66`), taken only if
  Crawford says so at Gate A on B8's crest underruns (spec §7 Q3). `?latency=interactive` stays the way back.
- **G2b is planned as a stub, built only on Gate A's word** (spec §7 Q2). T18 names its slices; if Gate A keeps it the
  slices are expanded into tasks under a Checkpoint of their own before any is built, and if Gate A spins it off they
  become the brief of a new spec under the next free number. Nothing in Phase B depends on it.
- **The audible listens are not threshold cuts.** Each Phase B2 task builds its trade for every tier, A/Bs it for its
  number, and then Crawford hears it against the base on his desktop; his yes lands it, his no reverts the commit and
  records the price. No `LOAD_*_MIN` constant is added in this plan.
- **Gate B's protocol is written down before it runs** (T19), so the listen is the same both times: the branch's and
  `main`'s production builds served on two ports, full screen on the 4K, his Chrome open, W1 with `&debug`, five minutes,
  the overlay read at 1:00, 3:00 and 5:00, his words verbatim; then a quarter-size window if full screen missed.
- **Order.** T0 first so the docs point at the plan from the first commit. T1 → T2, T3 (tooling) → Checkpoint A1 → T4,
  T5 in either order → T6 → T7 (the ablations share the stock build and the noise band) → T8 → **Gate A**. Phase B in
  Gate A's order, by default G1 (T9 → T10 → T11), G2a (T12 → T13 → T14), G3 (T15 → T16), G4 (T17), G2b (T18, only if
  kept) → Checkpoint B → T19 → T20 **Gate B**. Phase B2 only on a miss: T21 → T22 → T23 → T24, each followed by T20
  again. Then T25 (the pin) → T26, T27 (docs) → Checkpoint: Complete.

## Dependency Graph

```
T0 (docs slot)
   │
T1 (audio-census-lib + tests) ──► T2 (audio-census runner; perf:audio-census)
                                        │
T3 (forced GC before perf:audio's census line) ──┤
                                        │
                              Checkpoint A1 (the tools work on one W1 smoke run)
                                        │
                         ┌──────────────┼──────────────┐
                   T4 (breakdown)  T5 (censuses)   T6 (noise band; ablations B1–B4)
                         │              │              │
                         │              │          T7 (ablations B5–B8)
                         └──────────────┴──────────────┘
                                        │
                           T8 (Phase A section + decision table)
                                        │
                              Gate A — Crawford picks the cuts
                                        │
          G1: T9 → T10 → T11    G2a: T12 → T13 → T14    G3: T15 → T16    G4: T17    G2b: T18 (stub)
                                        │
                              Checkpoint B (every kept cut in; Light unchanged)
                                        │
                         T19 (the listen, prepared) → T20 (the listen, recorded) → Gate B
                                        │
                ┌──────────── clean ────┴──── miss ─────────────┐
                │                                               │
                │     Phase B2: T21 (k-rate) → T20 → T22 (Phaser stages) → T20 → T23 (AutoWah rolloff) → T20
                │               → T24 (native pedals: its own spec if reached)
                │                                               │
                └───────────────────────┬───────────────────────┘
                                        │
                              T25 (the pin: PERFORMANCE.md row, spec §8)
                                        │
                   T26 (AUDIO_SYSTEM.md, ROBOT_LIFECYCLE.md, PERFORMANCE.md) → T27 (backlog 67, plan.md, spec §8)
                                        │
                              Checkpoint: Complete
```

## Task List

### Phase 0: The slot

- [x] **Task 0: `docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md`, `docs/todo/plan.md`, `docs/todo/backlog.md` — the pointers** (2026-11-06)

  **Description:** The spec's **Status** line links this plan and records where approval stands; plan.md's Stage 1 line
  for 67 gains the plan link (one sentence, the stage's wording kept); backlog 67's last update gains the plan link.
  Crawford's answers to spec §7 Q1–Q4 are recorded on the spec's Status line when he gives them (T0 is re-touched then,
  not a new task). Nothing else changes.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] The three files link to each other as above; no number is assigned (spec §7 Q7).

  **Verification:**
  - [ ] Manual read; `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md`, `docs/todo/plan.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (docs only)

---

### Phase A1: The tools

- [x] **Task 1: `scripts/perf/audio-census-lib.mjs` — the call-site tally** (2026-11-06)

  **As built (2026-11-06).** "The top Tone frame" is read as the outermost one, the Tone class nearest whatever called
  into Tone (a Phaser's CrossFade Gain goes to `Phaser (tone)`, not to the Gain wrapper), named by its file. Each maker
  row carries `attributed` beside `byType` (`[class, count]` pairs). T2 extended the lib (see there).

  **Description:** The pure part of the census by call site. Given an array of `{ type, stack }` records (the node class
  and the creation stack as text) and an optional frame resolver (source-map lookup, supplied by the runner), it picks
  each record's **maker**: the first frame outside `node_modules` (resolved through the resolver when one is given), or
  the topmost Tone frame when every frame is Tone's (so Tone's own plumbing is attributed to the Tone class that made
  it, e.g. `Signal`, `LFO`, `Effect`); tallies class × maker and maker totals; sorts makers by count; and formats the
  table (`census by maker (1812): reserveVoice 540 — Gain 288 · ConstantSource 228 · … ; buildGlobalFxChain …`) with
  the share of all records attributed to a frame outside `node_modules`. The `audio-handlers-lib.mjs` shape.

  **Proof:** RED test — `scripts/perf/audio-census-lib.test.mjs`: a fixture of six records across two app frames and
  one Tone-only stack tallies to the expected table; the Tone-only record is attributed to its top Tone class; an
  empty input formats an empty table with total 0, not NaN; a frame the resolver cannot map keeps its raw location.

  **Acceptance criteria:**
  - [ ] `tallyByMaker(records, resolve?)` returns `{ total, makers: [{ maker, count, byType }], attributedShare }`,
        makers sorted by count descending, ties by name.
  - [ ] `pickMaker(stackText, resolve?)` returns the first non-`node_modules` frame (resolved when a resolver is given),
        else the top Tone frame's class name, else `'unknown'`.
  - [ ] `formatCensusByMaker(tally)` prints one line per maker with its classes largest first, and a header with the
        total and the attributed share as a percentage.

  **Verification:**
  - [ ] `npx vitest run scripts/perf/audio-census-lib.test.mjs` passes (the vitest include covers `scripts/**/*.test.mjs`).
  - [ ] `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `scripts/perf/audio-census-lib.mjs`, `scripts/perf/audio-census-lib.test.mjs`

  **Estimated scope:** S (one module and its test)

- [x] **Task 2: `scripts/perf/audio-census.mjs` — the runner, and `perf:audio-census`** (2026-11-06)

  **As built (2026-11-06).** The hook holds each node by a `WeakRef`; the census counts the nodes still alive after a
  forced GC in the open realtime context (the page makes 3 627 nodes in 7 contexts by 8 s; 1 798 are alive), so it
  reads the live graph, not every creation. `withPoweredWorld` gained an optional `beforeNavigate` (the helper stays
  shared). Readable makers took three lib changes, each RED first: the resolver is called as `resolve(frame, caller)`,
  since a minified bundle keeps a renamed function's original name at the call to it (the runner trusts it only on an
  exact entry whose generated text is the frame's own minified name, so `recordByEngineKey`'s `valueOf` parameter does
  not name a callback); V8's `[as alias]` is preferred (`Object.Jce [as createCompositeVoice]`); an anonymous app frame
  takes the nearest named frame out in the same file (`primeLfoBank`'s `forEach` arrows). W1 at Full on a sourcemapped
  build of `main`'s `src/` at `6149d912`: hooked 1 798 against CDP's 1 799 (the context's AudioDestination), 99.6 %
  made outside `node_modules`; makers `buildGlobalFxChain` 570, `createCompositeVoice` 534, `reserveVoice` 204,
  `primeLfoBank` 196, `buildPhaser` 76, `_start (tonePatches.ts)` 68, `buildSendGains` 60, `createLayerGain` 24,
  `buildCell` 20, `linkTarget` 19. A build without maps runs, with minified makers and a note.

  **Description:** Opens one world as `perf:audio` does (`withPoweredWorld`, `powered-world.mjs:21`, with `Page` in its
  `domains`), after installing through `Page.addScriptToEvaluateOnNewDocument` a wrapper that patches
  `BaseAudioContext.prototype.create*` (`createGain`, `createConstantSource`, `createBiquadFilter`, `createOscillator`,
  `createDelay`, `createWaveShaper`, `createStereoPanner`, `createChannelSplitter`, `createChannelMerger`,
  `createConvolver`, `createDynamicsCompressor`, `createAnalyser`, `createBufferSource`, `createIIRFilter`) and the
  node constructors (`new GainNode(ctx)` and the rest, as standardized-audio-context uses either) to push
  `{ type, stack: new Error().stack }` onto `window.__audioCensus`. After the warm-up it reads the array with
  `Runtime.evaluate` (`returnByValue`), builds a frame resolver from the served build's `.map` files (fetched from the
  same `--url`), tallies with T1 and prints the table, plus the plain by-class census for comparison. `--world`, `--url`,
  `--warmup`, `--json`, `--chrome`, `--port`, `--help` as the sibling scripts. `package.json` gains `perf:audio-census`.

  **Proof:** a run — `npm run perf:audio-census -- --world "ez84fjmr:93:-146?theme=wreck&load=full"` against a
  `vite build --sourcemap` served from the scratchpad prints a table whose total is within a few percent of
  `perf:audio`'s census line on the same build, with `reserveVoice`, `buildGlobalFxChain`, `primeLfoBank` and
  `buildCell` among the makers. Tooling plumbing: no unit test (the backlog 30/31 precedent); the pure part is T1's.

  **Acceptance criteria:**
  - [ ] The run prints the by-maker table and the by-class census for the same moment; the pin check aborts a wrong world.
  - [ ] A build served without source maps still runs, with minified frames and a one-line note.
  - [ ] Chrome is closed after the run (orphaned Chrome 0 before and after).
  - [ ] `perf:audio`'s behaviour is unchanged: one smoke run reads as before (the helper is shared, not forked).

  **Verification:**
  - [ ] The run above, its output kept in the scratchpad and quoted in the commit.
  - [ ] `npm run lint` clean.

  **Dependencies:** Task 1.

  **Files:** `scripts/perf/audio-census.mjs`, `package.json`

  **Estimated scope:** S (one runner on the shared helper, one script line)

- [x] **Task 3: `scripts/perf/audio-load.mjs` — a forced GC before the census line** (2026-11-06)

  **As built (2026-11-06).** The premise did not hold. On W1 the GC removes 38 nodes at Full (1 837 → 1 799) and 80 at
  Light (1 864 → 1 784), not about 500; the GC'd read is stable (1 799 in two runs) where the un-GC'd one wanders
  (1 803, 1 837). The gap between the census and the nodes that render is live nodes that do not render (Checkpoint
  A1's trace: 971 of 1 257 Gains and 331 of 332 ConstantSources render), for T5 to attribute. The GC lowers the first
  bucket's heap (29.9 MB against 35.8 MB at Full), so a short run's heap trend reads larger; nodes and events read the
  same.

  **Description:** Before printing `census after warm-up`, the runner calls `HeapProfiler.collectGarbage` (enabling the
  domain first) and waits a beat, so the disposed spawn-time voices (`storeVoice` disposes them at `loadInstruments`,
  spec survey) and other collectable wrappers are not counted as live. A `--no-gc` flag keeps today's read. The census
  formatter (`formatCensus`, `audio-load-lib.mjs`) is untouched.

  **Proof:** a run — two census reads a few seconds apart on W1 agree to within a handful of nodes with the GC, where
  before the first read sat about 500 nodes above the second on backlog 27's worlds (the 1 793 census against the
  about 1 390 that render). No unit test: the change is CDP plumbing.

  **Acceptance criteria:**
  - [ ] The census line reads after a forced GC by default; `--no-gc` restores the previous behaviour; `--help` says so.
  - [ ] The long-run columns (`nodes`, `heap`, `events`) are unaffected.

  **Verification:**
  - [ ] The run above quoted in the commit.
  - [ ] `npx vitest run scripts/perf/audio-load-lib.test.mjs` passes unchanged; `npm run lint` clean.

  **Dependencies:** None.

  **Files:** `scripts/perf/audio-load.mjs`

  **Estimated scope:** XS (one runner)

### Checkpoint A1: The tools work
- [x] `npm run build:types`, `npm run lint`, `npm test` clean (13 576 tests in 354 files pass; the run exits 1 on
      vitest's `Timeout calling "onTaskUpdate"` worker error, backlog 66, not a test failure). (2026-11-06)
- [x] One smoke run each of `perf:audio` (with the GC), `perf:audio-handlers` and `perf:audio-census` on W1 at Full
      against a sourcemapped build, orphaned Chrome 0 before and after; the census totals agree (1 799, 1 799 and
      1 798 hooked; the trace's Render spans the whole 8 s window). (2026-11-06)
- [x] Reviewed with human before the runs (Crawford's "go" for Phase A2). (2026-11-06)

---

### Phase A2: The runs

- [x] **Task 4: The handler breakdown — W1 and W2 at Full** (2026-11-06)

  **As built (2026-11-06).** Seven traces for six: `h-w2-3` lost data (buffer peak 90 %, Render 7.8 s of the 8) and
  was re-run as `h-w2-3b`. The stock is `ce9c5779`, whose `src/` is `main`'s `6149d912`. Full renders about 1 458 nodes
  a quantum on W1 and 1 384 on W2, beside Light's about 1 390 / 1 410; every ConstantSource but one renders, the dark
  effects' included. The traces' shares and node counts are the readings; a traced Render's length is not (T7).

  **Description:** `npm run perf:audio-handlers` on the stock production build (`main`'s `src/` at the build branch's
  base commit, named), 8 s traces, three per world interleaved W1 W2 W1 W2 W1 W2, foreground, one run at a time,
  orphaned Chrome 0 before and after every run. Recorded as §1 of a new dated section in `scratchy-audio-phones.md`,
  "Backlog 67, the decomposition at Full": the per-class table per world (share median and spread, instances, per
  instance), the rendering node count against the census, and the reading (the Convolver's share per world, the biquad
  count under the twelve live bus links against Light's 15, shares read as ordering only).

  **Proof:** a run — six runs, each covering its whole window (no data lost). Read — the section.

  **Acceptance criteria:**
  - [ ] Six tables in the record, with the stock commit, Chrome version and run labels.
  - [ ] The count of rendering nodes per quantum at Full on each world is stated beside Light's about 1 390 / 1 410.

  **Verification:**
  - [ ] The runs' outputs kept in the scratchpad and quoted; the section read.

  **Dependencies:** Checkpoint A1.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 5: The two censuses — by class and by maker, W1 and W2 at Full** (2026-11-06)

  **As built (2026-11-06).** 99.6 % of the live nodes are attributed to a named maker, against the 90 % criterion. The
  spec's static tally was low: a voice is about 70–73 nodes, not 45. §2's first reading put the census's
  `_start (tonePatches.ts)` row on the voices' notes; T6's commit corrected it. That row is every started Tone source:
  the bank's LFOs 24, the lit cells' LFOs and the Shifter's oscillator 20, the sounding layers' notes 24. So the voices
  are 846 / 872 nodes, the chain 713 and the bank 239 / 243.

  **Description:** `perf:audio`'s census line (with T3's GC) once per world on the stock build, and
  `perf:audio-census` once per world on a sourcemapped build of the same commit served beside it. Recorded as §2: the
  by-class line per world beside Light's; the by-maker table per world; the spec's static tally (a three-layer voice at
  45 nodes, twelve voices at 540, the bank at about 120, the effects' Tone plumbing at about 120) checked against the
  measured attribution, each difference named; the attributed share against the spec's 90 % criterion. Where the
  attribution falls short the record says which classes are unattributed.

  **Proof:** a run — four runs. Read — the section.

  **Acceptance criteria:**
  - [ ] The record states, per world, how many Gains and ConstantSources `reserveVoice` makes (and under it the Tone
        classes), how many `buildGlobalFxChain` and the cells, how many `primeLfoBank`, and the attributed share.
  - [ ] The spec's assumption-1 node arithmetic is confirmed or corrected with the measured counts.

  **Verification:**
  - [ ] The runs' outputs kept and quoted; the section read.

  **Dependencies:** Checkpoint A1.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 6: The noise band and ablations B1–B4 — W1 and W2 at Full** (2026-11-06)

  **As built (2026-11-06).** 60 runs, not 54: the noise band took twelve, each copy run paired with its own same-round
  stock run. B1 is the ledger fed every robot outside the sounding set, B2 `reserveVoice` refusing every robot, B3
  Light's two 0.8 tiers at Full, B4 `writeCellMix` forced dark. One extra 8 s handler trace on B4 (W1), taken between
  T6 and T7, found every ConstantSource still rendering with every effect dark. B4 therefore prices lit against dark,
  and the dark effects' standing Signals became a row of their own in §5. The six lit effects against the offline list
  moved to §5, which names them.

  **Description:** `npm run perf:audio`, 120 s, 15 s buckets, the stock build on one port against a byte-identical copy
  on another for the **noise band** (three rounds), then four variants each one `src/` edit on the stock commit, built to
  the scratchpad and served on its own port, three interleaved rounds against same-session stock per world, order
  alternating by round; `src/` restored and `git status --porcelain src` empty after each build; each diff kept beside
  the runs. **Delta** = variant mean − same-round stock mean; the **crest bucket** recorded beside. The variants
  (spec §1.2): **B1** every muted robot's voice released (the ledger fed every robot outside the sounding set, the
  backlog 27 A2 edit's shape); **B2** every robot's voice refused (`reserveVoice` returns false; the floor at Full);
  **B3** the twelve `bus.frequency` links suspended and the four drift LFOs stopped (Light's two 0.8 tiers forced at
  Full); **B4** every effect dark (`writeCellMix` forced to 0, Width to 0.5). Recorded as §3 with the method, the
  census per variant, the table and the reading (the standing voice's price per docked robot at Full; the sounding
  robot's price by subtraction from B2; the LFO extras; the six lit effects against the offline list).

  **Proof:** a run — 6 + 48 runs, every one exit 0, orphaned Chrome 0 before and after. Read — the section.

  **Acceptance criteria:**
  - [ ] The noise band per world is stated; every delta carries its three rounds and median; a delta inside the band
        or straddling zero reads "below noise".
  - [ ] The per-docked-robot and per-sounding-robot prices at Full are stated with their derivation, trough and crest.
  - [ ] Nothing of any variant is committed; the tree is clean after the task.

  **Verification:**
  - [ ] The runs' outputs and the aggregate JSON kept; the section read; `git status` clean.

  **Dependencies:** Checkpoint A1.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS as a diff (a record); the longest task in hours

- [x] **Task 7: Ablations B5–B8 — W1 and W2 at Full** (2026-11-07)

  **As built (2026-11-07).**
  - **B5 bypasses every cell**, not one lit and one dark: a dark cell is unwired, so the dark arm had nothing to
    measure. Each cell reaches `effectSend` / `effectReturn`, and a `StereoEffect` (Chorus, Phaser, Tremolo) its
    `_split` / `_merge`. `wireCells` changes too, so T15's "`wireCells` is unchanged" does not hold (§5 asks Gate A to
    amend T15).
  - **B6k reaches the native biquad's `automationRate` only through standardized-audio-context's private
    `_nativeAudioContext`**, so G5's T21 must say how it reaches the param.
  - **B6's census is −14 a robot** (Gain −10, ConstantSource −4). With T13's `out` Gain, G2a is −15 a robot, against
    the spec's −7 and T12's "Gains × 2".
  - After the runs: three more 8 s traces on W1 (B5 twice, the stock once between them) and backlog 27's lit probe at
    Full for §5.
  - Tooling: `97901a1a`, before T4, made `perf:audio` read the overlay again at the end of a run; B8's underruns are
    read there, at the end of a run, not in the crest bucket.
  - The commit also added a note to §3 that a traced Render's length is not a price.

  **Description:** As T6, same stock build, same noise band, four more variants: **B5** Tone's `Effect` plumbing bypassed
  on one lit cell (the Phaser, or W1's largest lit pedal) and one dark cell (`cell.in → effectSend`, `effectReturn →
  cell.wet`); **B6** the bus filter replaced by a native `BiquadFilterNode` on every robot, and **B6k** the same with
  `frequency.automationRate = 'k-rate'` (two builds); **B7** the composite `out` Gain removed and the layer Gains
  connected to the Panner; **B8** `LOAD_PLAYBACK_BELOW` raised above 1 (Full at `playback`), its crest's underrun
  count read from the overlay beside the mean. Recorded as §4 with the per-effect plumbing price (B5 ÷ cells
  bypassed, times twelve as an estimate), the wrapper's and the a-rate price per robot, one standing Gain's price (B7
  ÷ 12), and B8's buffer effect. Then **the sum**: B1 + B2 (its floor) + B3 + B4 against the stock mean, overlaps
  named (B1 is part of B2; B4's branches overlap B2's rooms), and the assumption-1 arithmetic confirmed or corrected
  with numbers.

  **Proof:** a run — 60 runs (five builds), every one exit 0, orphaned Chrome 0. Read — the section.

  **Acceptance criteria:**
  - [ ] Every delta with its rounds and median; the derived per-unit prices stated as estimates where they are.
  - [ ] The sum table says how much of the stock mean and of the crest the parts explain, on both worlds.
  - [ ] Nothing committed; the tree clean.

  **Verification:**
  - [ ] The runs' outputs and aggregate kept; the section read; `git status` clean.

  **Dependencies:** Task 6 (the stock build and the noise band).

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS as a diff (a record); long in hours

- [x] **Task 8: The decision table for Gate A** (2026-11-07)

  **As built (2026-11-07).** Inaudible and audible rows sit in two tables. Three rows were added: the dark effects'
  standing Signals (unpriced; a B9 ablation proposed), the floor's unpriced remainder (0.08–0.12 of the mean) and the
  boot double build (hygiene). The lit effects come from the running app: W1 AutoWah, Vibrato, Width, Distortion,
  BitCrusher and Chorus; W2 AutoWah, Vibrato, Width and Chorus. The Phaser is dark on both. §5 closes with Gate A's
  questions, the spec's Q1–Q3 and the runs' own.

  **Description:** §5 of the record: one row per piece (G1–G8 and anything the census surfaced), its price on W1 and W2
  (trough, crest, mean, census), the cut it implies with the files it touches (spec §2), whether it is audible, what it
  would take to build (the task numbers below), and the agent's recommendation and order. A short paragraph states
  whether the spec's assumption 1 held. Nothing is decided here.

  **Proof:** Read — Crawford reads it at Gate A.

  **Acceptance criteria:**
  - [ ] Every G1–G8 row present, priced or marked "not priced: <why>".
  - [ ] The table names the inaudible rows and the audible rows apart.

  **Verification:**
  - [ ] The section read.

  **Dependencies:** Tasks 4, 5, 6, 7.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

### Gate A: Crawford picks the cuts
- [x] Crawford reads §1–§5 of the record and says, per row: keep (Phase B, in what order), listen-only (Phase B2),
      drop, or spin off (G2b). (2026-11-07: G1, G2a's bus filter, G4 and G3 are built, in that order, then heard at
      Gate B; T13 is dropped; G5–G8 stay in Phase B2, for a Gate B miss only; the B9 ablation is added as Task 16b.
      The record's §5 closes with the decisions.)
- [x] Spec §7 Q1 (solo in G1), Q2 (G2b here or its own phase) and Q3 (G4) answered and written on the spec's Status
      line (T0 re-touched); G2b's slices (T18) expanded into tasks here if kept. (2026-11-07: Q1 muted robots only;
      Q2 later, as roadmap 69; Q3 yes.)
- [x] The build branch `perf/desktop-full-tier-standing-cost` is cut; the docs branch's PR is Crawford's. (Cut
      2026-11-06 off the docs branch, both unpushed.)

---

### Phase B: The inaudible cuts (Gate A's order: G1, G2a, G4, G3, then B9)

Run order: T9, T11, T12, T14, T17, T17b, T15, T16, T16b. T13 is dropped and T18 is spun off (Gate A, 2026-11-07); T10
is dropped and T17b added (Crawford, 2026-11-07). The code tasks are built; the A/B runs (T11, T14, T16, T16b) were put
off ("can we put this off and come back to it later?", 2026-11-07) and run in one sitting on 2026-11-10 (record §6–§9,
branch `perf/desktop-full-tier-ab-runs`).

- [x] **Task 9: `standingBy.ts`, `audioBudgetSystem.ts` — muted robots stand down (G1)** (2026-11-07, 135d09f9)

  **As built (2026-11-07).** `reconcile` pushes the robots over the budget in arrival order, then every `'mute'` robot in
  roster order; solo-silenced robots are never pushed (Q1). The engine needed no change: its ledger does not ask why a
  robot stands by, and its 23 standing-by tests already pin the four engine behaviours the Proof lists, so no engine test
  was added (it would have passed first). Two pre-existing budget tests asserted the old rule ("never names a muted
  robot", "names nobody at Full, mutes and all") and were rewritten to the new one, so "every pre-existing H2 test passes
  unmodified" could not hold for those two. Comments that stated the old rule were corrected in `standingBy.ts`,
  `AudioEngine.ts` and `robotSystems.ts` (`landOnActive` said a docked robot's voice stays reserved across dock cycles).

  **Description:** `reconcile` computes the stand-down list as every robot in the roster outside the sounding set
  whose `audioMode` is `'mute'`, plus the eligible robots over the cap it pushes today, and hands it to
  `AudioEngine.setStandingByRobots`; solo-silenced robots (an `audioMode` other than `'solo'` while another robot
  solos) are excluded in this task (Architecture Decisions). The ledger's rules are unchanged in shape: a stand-down
  waits for the last note's end plus release plus the margin; `reserveVoice` is refused while released; `admit`
  rebuilds a released robot the tick it enters the sounding set (an undocked robot's `landOnActive` unmute reaches the
  signature; a user unmute likewise). `setSoundingRobots(null)` and `stopAudioBudget` rebuild everyone released.
  The card's "disabled" state for a muted robot is unchanged (no UI change).

  **Proof:** RED test — `src/systems/audioBudgetSystem.test.ts`: with twelve robots and the Full dial, docking one
  (its `audioMode` set to `'mute'`) pushes it to `setStandingByRobots` on the next reconcile where today nothing is
  pushed at Full; undocking it removes it from the push and the robot appears in `setSoundingRobots`' admitted set;
  with one robot soloed, the eleven others are not pushed. `src/engine/AudioEngine.test.ts`: a robot stood down with a
  note still scheduled keeps its voice until the note's end plus release plus margin, then has none; `reserveVoice` on
  it returns false meanwhile; `setSoundingRobots` admitting it rebuilds a voice and returns its id; `null` rebuilds all.

  **Acceptance criteria:**
  - [ ] At Full, a docked robot's voice is released after its last note rings out and rebuilt the tick it is admitted
        after undocking, its links primed before any trigger (`primeRebuilt`).
  - [ ] A user mute releases the same way; a user unmute with a free slot is admitted and rebuilt within a measure; with
        the set full it stands by as today.
  - [ ] Solo-silenced robots keep their voices (this task); mute, solo and `triggerWithCap` otherwise unchanged; every
        pre-existing H2 test passes unmodified.

  **Verification:**
  - [ ] `npx vitest run src/systems/audioBudgetSystem.test.ts src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/systems/audioBudgetSystem.test.ts`, `src/engine/AudioEngine.ts`
  (doc comments on `setStandingByRobots` / `setSoundingRobots`), `src/engine/AudioEngine.test.ts`

  **Estimated scope:** S (the rule moves one filter; tests carry the weight)

- [x] **Task 10: `audioBudgetSystem.ts`, `AudioEngine.ts` — an admitted robot's sends take the tick's time (G1)** (2026-11-07, dropped)

  **Dropped (Crawford, 2026-11-07: option (a)).** An admitted robot's sends keep their 50 ms fade from `now()`, and
  Tone's once-per-page warning on an admission ("Events scheduled inside of scheduled callbacks should use the passed in
  scheduling time") is expected: T11 notes it rather than counting it against G1, and T26 documents it.

  **Why it was held: the task's premise does not hold.** (1) The reconcile runs from a store subscription
  inside the BeatClock's 16n Transport callback, and `subscribeToMeasure` hands its listeners no time
  (`docs/BEAT_CLOCK.md`), so there is no tick time to pass on. (2) `updateRobotSends`' `time` glides one 16n tick from
  that time (`rampOrSet` → `getTickSeconds`), so a timed prime would fade an admitted robot's sends in over about 125 ms
  at 120 bpm, not 50 ms, against the second acceptance line. (3) A room an admission relights (W1's Double room, fed by
  one robot, goes dark under G1 when that robot docks) makes its own untimed ramps and LFO starts in `writeCellMix` inside
  the same callback, so the once-per-page Tone warning would stay. What is heard today is the 50 ms send fade from
  `now()`, which the note's MIN_LEAD mostly covers. Options: (a) drop T10 and record the warning as expected; (b) a fresh
  voice's sends and manual pan set at once, no ramp: no fade, but the room warning stays; (c) thread the tick's time from
  BeatClock through the budget and the engine to the cells: larger, and it changes what measure listeners receive.

  **Description:** The admission path (`setSoundingRobots` → `admit` → `rebuildVoice` → `reReserveVoice`, then
  `primeRebuilt`) runs inside the budget's Transport callback; `reReserveVoice` primes the fresh voice's sends with
  `updateRobotSends(robotId, levels)` and `rampOrSet` ramps from `now()`, which Tone warns about and which fades an
  admitted robot's sends in over its first 50 ms (backlog 27's H2 record). The reconcile passes the callback's time
  through to `reReserveVoice`'s prime so the sends are set at the tick's time (`updateRobotSends`' existing `time`
  parameter, `AudioEngine.ts:1185`); outside a callback (a UI rebuild) the time is omitted as today.

  **Proof:** RED test — `src/engine/AudioEngine.test.ts`: `reReserveVoice(robotId, robot, time)` primes the sends with
  `setValueAtTime`/`rampTo` carrying `time`; without `time` the call is as today. `src/systems/audioBudgetSystem.test.ts`:
  the reconcile's admission passes the tick's time.

  **Acceptance criteria:**
  - [ ] No "Events scheduled inside of scheduled callbacks" warning is logged on an admission (checked in T11's run).
  - [ ] An admitted robot's sends are at their stored level by its first note.

  **Verification:**
  - [ ] `npx vitest run src/engine/AudioEngine.test.ts src/systems/audioBudgetSystem.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 9.

  **Files:** `src/systems/audioBudgetSystem.ts`, `src/engine/AudioEngine.ts`, their tests

  **Estimated scope:** XS (one parameter threaded through)

- [x] **Task 11: G1's A/B and crossings** (runs 2026-11-10; kept, Crawford 2026-11-10)

  **As run (2026-11-10, record §6).** The noise band was 0.021 on the mean, 0.033 on the crest and 0.041 on the trough.
  G1 against base: −0.074 / −0.064 on the mean, −0.144 / −0.146 on the trough, and the crest below noise / −0.042. The
  census is 1 799 → 1 119, B1's to the node. Underruns at the end of a run: 2 in every g1 run against base's 2–78.
  Crossings: admission and stand-down ×1.000 in all runs with no gap; the eleven-robot burst ×1.000, with 42 ms on the
  main thread; cold and warm onsets identical (12.13 ms, the measurement's offset).
  - **The probe was rebuilt.** Backlog 27's `probe-crossing.mjs` and the T11 probe of DARK_EFFECT_BYPASS were gone with
    their scratchpads, so a new one was written from spec §8.2's recipe, against each arm's own `src/` through Vite (the
    record's §6 has its path).
  - **Every arm was built from its own `git worktree`**, so `src/` was never checked out over the working tree. The plan
    had said `git checkout <c> -- src`.
  - **One bar missed, in the right direction.** "Light inside the band": Light fell 0.055 on both worlds, because G1
    stands the muted robots down at Light too.
  - **Max lag:** one W2 run read 26 ms against base's 21 ms. This sitting's max lags run 13–45 ms across arms, so it is
    noted as noise.
  - **The probe logged no Tone warning,** because it has no Transport callback. The app's runs logged the expected one.

  **Description:** The build branch against its base (the stock build), same session, three interleaved rounds, W1 and
  W2 at Full, 120 s, plus one Light run per world per arm; the noise band first. Then the crossing recipe (the
  real-time-context recorder of DARK_EFFECT_BYPASS.md §5 step 2, backlog 27's `probe-crossing.mjs` shape against the
  branch's source): a docked robot's stand-down, an undocked robot's admission and its first note's onset against a
  warm voice, three runs each; and, for the record only, an un-solo readmitting eleven robots in one tick (the
  measurement spec §7 Q1 asks for). Recorded as §6: kept or dropped by spec §1.5 step 3's bar. The console's Tone
  warning on an admission is expected (T10 dropped) and noted; any other warning is a finding.

  **Proof:** a run — the A/B, the Light runs and the crossings; the console clean apart from the expected warning. Read
  — the section.

  **Acceptance criteria:**
  - [ ] Delta on W1 at least B1's price less the band; the crest bucket does not rise; `max lag` inside the base's
        spread; the Light runs inside the band.
  - [x] Stand-down and admission ≤ ×1.6 with no gap; the first note's onset within one render quantum of the warm
        voice's; the eleven-robot burst recorded with its ratio and main-thread time.
  - [ ] Crawford's keep or drop recorded with the numbers.

  **Verification:**
  - [x] Runs kept and quoted; the section read.

  **Dependencies:** Task 9.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 12: `busFilter.ts`, `AudioEngine.ts`, `lfoShared.ts` — a native bus filter (G2a)** (2026-11-07, a0bc52db)

  **As built (2026-11-07).** `buildBusFilter(context, options)` takes the raw context and the Filter constructor from
  `AudioEngine.ts`, so `busFilter.ts` keeps no runtime Tone import (RobotScreen and companyOptions read its resolvers);
  a WeakSet marks the biquads it made (`isNativeBusFilter`). The biquad connects on through `Tone.connect`, to the
  destination when no chain exists yet. Deviations: a live edit glides through its own `glideBusFilter`
  (`cancelAndHoldAtTime`, else cancel and pin the present value, then a linear ramp from `Tone.now()`; nothing non-finite
  written), not through `rampOrSet`'s fallback, which assigns, so a cutoff edit would have jumped; `lfoShared.ts` is
  unchanged (B6 ran the links on the native param with `connectAdditively` as it is, and its test pins `override = false`
  on a Param-like target); the headless count pin is unchanged, since the mocked raw context has no `createBiquadFilter`
  and headless keeps the Tone.Filter; six engine cases with a fake biquad pin the native path instead.

  **Description:** `busFilter.ts` gains `buildBusFilter({ frequency, Q, type })` returning a native `BiquadFilterNode`
  from `Tone.getContext().rawContext.createBiquadFilter()` when the context has it, else today's `Tone.Filter` (or the
  stub) with one `devWarn`. `reserveVoice` uses it; the bus Gain connects into it and it connects to the chain entry
  (Tone's `connect` accepts a native node; a native node's `connect` accepts a Tone node's input through
  `Tone.connect`); `disposeVoiceNodes` disconnects and drops it. `updateRobotBusFilter` writes `frequency` and `Q` via
  `rampOrSet` (its fallback branch when the param has no `rampTo`: `cancelScheduledValues`, `setValueAtTime`,
  `linearRampToValueAtTime`) and assigns `type`. `getRobotModulationTarget('bus.frequency')` returns the native
  `frequency` param; `connectAdditively` treats a destination without `override` as a native param. The headless count
  pin in `AudioEngine.test.ts` loses its Tone `filter` construction and gains a `createBiquadFilter` count where the
  mocked context offers one.

  **Proof:** RED test — `src/engine/audioEngine/busFilter.test.ts`: `buildBusFilter` returns the context's biquad with
  the three fields applied, falls back to the Tone constructor with a warning when the raw context lacks it.
  `src/engine/AudioEngine.test.ts`: a reservation builds no Tone Filter when the context has a biquad; `updateRobotBusFilter`
  schedules on the native param; `getRobotModulationTarget('bus.frequency')` is the native `frequency`;
  `src/engine/lfoShared.test.ts` (or `lfoEngine.test.ts`): `connectAdditively` onto a param with no `override` connects and
  re-asserts the value.

  **Acceptance criteria:**
  - [ ] Every bus filter is native in a real browser (checked by T14's census: 14 fewer nodes a reserved robot, 10 Gains
        and 4 ConstantSources, as B6 measured).
  - [ ] Frequency, Q and type edits and swells land on the native node with the same ramps; the `bus.frequency` link
        drives it; `disposeRobotLinks` disconnects the link Gain from it.
  - [ ] Headless tests, the stub path and a mocked Tone keep working; every pre-existing bus-filter test passes.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/busFilter.test.ts src/engine/AudioEngine.test.ts src/engine/lfoShared.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A.

  **Files:** `src/engine/audioEngine/busFilter.ts`, `busFilter.test.ts`, `src/engine/AudioEngine.ts`,
  `AudioEngine.test.ts`, `src/engine/lfoShared.ts` (+ its test)

  **Estimated scope:** M (five files; the node changes class, the helpers keep their names)

- [ ] **Task 13: `compositeVoice.ts`, `AudioEngine.ts` — no composite `out` Gain (G2a)** — dropped at Gate A

  **Dropped at Gate A (Crawford, 2026-11-07).** B7 priced the `out` Gain below noise on both worlds (under 0.001 a
  robot), so it is not built. The text below is kept as written.

  **Description:** `createCompositeVoice` no longer builds the unity `out` Gain. Each layer Gain is kept as the layer's
  output; the composite exposes `connect(destination)` (connects every layer Gain) and `disconnect()`; `reserveVoice`
  calls `composite.connect(panner)`; `set({ outputGain })` and the `outputGain` field go (no caller). `disposeVoiceNodes`
  disposes the layer Gains through the composite's `dispose` as today. The count pin becomes `gain: layers + 6`.

  **Proof:** RED test — `src/engine/audioEngine/compositeVoice.test.ts`: the composite builds `layers` Gains and no
  output Gain; `connect(dest)` connects each layer Gain to `dest`. `src/engine/AudioEngine.test.ts`: the pinned counts
  read `layers + 6` Gains.

  **Acceptance criteria:**
  - [ ] Layer gain and detune link targets, `set({ layers })`, the gain-0 layer rebuild (`applyLayersStructural`) and
        the swell writes are unchanged; every pre-existing composite test passes with the count pins updated.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/compositeVoice.test.ts src/engine/AudioEngine.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 12 (shares `reserveVoice`'s wiring block).

  **Files:** `src/engine/audioEngine/compositeVoice.ts`, `compositeVoice.test.ts`, `src/engine/AudioEngine.ts`,
  `AudioEngine.test.ts`

  **Estimated scope:** S (four files; one node fewer per robot)

- [x] **Task 14: G2a's A/B and census** (runs 2026-11-10; kept, Crawford 2026-11-10)

  **As run (2026-11-10, record §7).** −0.031 / −0.018 on the mean and −0.055 / −0.032 on the crest: the first cut that
  reaches the crest. The census fell 37 / 56: W2 is exactly four robots × 14, and W1 is two robots plus notes in flight.
  Light moved −0.015 / −0.006, inside the band.

  **Description:** As T11: the branch at T12 against the branch at T11, three rounds, W1 and W2 at Full, 120 s, one
  Light run per arm, the census line per arm (the expected drop: B6's 14 nodes a reserved robot, 10 Gains and 4
  ConstantSources; after G1 only the robots holding a voice at the census mark have a filter to lose), the stock noise
  band. No crossing (nothing connects at run time that did not before). Recorded as §7, with Crawford's keep or drop.

  **Proof:** a run. Read — the section.

  **Acceptance criteria:**
  - [x] The census falls by 14 a reserved robot; the delta reads against B6's price after G1 (§5's estimate: about
        0.014 on W1, 0.021 on W2) less the band; the crest does not rise; Light inside the band.

  **Verification:**
  - [x] Runs kept and quoted; the section read.

  **Dependencies:** Task 12.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 15: `bypassCell.ts` — the cells reach the effect's send and return (G3)** (2026-11-07, 7901cfd5)

  **As built (2026-11-07).** One `effectEnds(key, effect)` picks `effectSend` / `effectReturn` (an `Effect`, the
  widener's `MidSideEffect`) or `_split` / `_merge` (a `StereoEffect`) from the effect itself, so the cell records
  nothing: a light, its darken, `wireCells`, a room branch and the Phaser swap all reach the same pair. Every one of the
  ten effects in Tone 15.1.22 has a pair; the Chorus's feedback loop sits between its Split and Merge. The fallback warns
  once per key. Two `globalFx.test.ts` cases asserted no devWarn at all; that file's fake effects carry no pair, so they
  now filter out the fallback's warning (`failureWarnings`) and still assert that nothing failed. Every other
  pre-existing cell and crossing test passes unmodified, on the fallback edges.

  **Description:** `connectEffect(key, cell, effect)` connects `cell.in → effect.effectSend` and `effect.effectReturn →
  cell.wet` when the effect exposes both (read through a cast; `protected` on the `.d.ts`), else today's `cell.in →
  effect → cell.wet` with one `devWarn` naming the effect; `disconnectEffect` drops the same pair it made (the cell
  records which shape it used); `buildBranch`'s room branches and `rebuildPhaser`'s swap go through the same two
  functions, and so does `wireCells` (amended at Gate A: B5 had to change it too, since it wires the lit cells' effects
  itself). A `StereoEffect` (the Chorus, Phaser and Tremolo) has no `effectSend` / `effectReturn`; its `_split` and
  `_merge` stand in their place, read through the same cast. The effect's `input`, `_dryWet` and `output` are left
  unconnected on purpose and keep their `wet: 1` pin.

  **Proof:** RED test — `src/engine/audioEngine/bypassCell.test.ts`: with a mocked effect exposing `effectSend` and
  `effectReturn`, `connectEffect` connects `in → effectSend` and `effectReturn → wet` and nothing to the effect itself;
  `disconnectEffect` disconnects exactly those; a mock without them gets today's edges and a warning; the Phaser rebuild
  path (`globalFx.test.ts`) uses the new shape; the lit-count (`getConnectedEffectCount`) and the crossing's LFO stop
  and start are unchanged.

  **Acceptance criteria:**
  - [ ] Every lit effect in a real browser renders through its inner nodes only (T16's breakdown: fewer rendering Gains
        and no CrossFade Panners/WaveShapers for the twelve effects).
  - [ ] The ten effects sound the same at any Mix (the law is the cell's, unchanged); the Width cell's effect is covered.
  - [ ] Pre-existing cell and crossing tests pass unmodified but for the edge endpoints.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/bypassCell.test.ts src/engine/audioEngine/globalFx.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A.

  **Files:** `src/engine/audioEngine/bypassCell.ts`, `bypassCell.test.ts`, `src/engine/audioEngine/globalFx.test.ts`

  **Estimated scope:** S (one module's two functions; three files)

- [x] **Task 16: G3's A/B and crossings** (runs 2026-11-10; kept, Crawford 2026-11-10)

  **As run (2026-11-10, record §8).** Arm A was the branch at T17 (f1ffd3d1), so G4 has no A/B of its own in this
  sitting; B8 stays its price.
  - **The A/B:** −0.020 / −0.018 on the mean. Each is at the band, and both agree with B5 × 5 / 4 lit effects (0.025 /
    0.020). The crest is below noise.
  - **The trace:** rendering Gains −23 / −20, WaveShapers −5 / −4.
  - **The crossings:** the Phaser ×0.80–0.88, the Chorus ×0.97–1.01, by Mix and by the Double room's feed, no gap. A
    first pass had the Chorus lit at its build default when the room was fed, so the probe now zeroes it first.

  **Description:** As T11: the branch against its previous cut, three rounds, W1 and W2 at Full, one Light run per arm,
  the breakdown once per arm (the rendering count), and the crossing recipe on a Phaser light and darken and a Chorus
  (Double room) light and darken, three runs each, ≤ ×1.6, no gap. Recorded as §8 with Crawford's keep or drop.

  **Proof:** a run. Read — the section.

  **Acceptance criteria:**
  - [x] The delta reads against B5's price × the cells bypassed less the band; the crest does not rise; Light inside
        the band; the crossings pass.

  **Verification:**
  - [x] Runs kept and quoted; the section read.

  **Dependencies:** Task 15.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 16b: Ablation B9 — the dark effects' standing Signals (added at Gate A)** (2026-11-10)

  **As run (2026-11-10, record §9).**
  - **The price:** −0.026 / −0.022 on the mean, −0.055 / −0.028 on the crest.
  - **The census** fell 163 / 196.
  - **The trace:** rendering ConstantSources 185 → 159 and 204 → 176.
  - **Deviation:** "dark" means the effect's own Mix is 0. A first variant pruned every effect unconnected at 3 s,
    which took W1's Chorus, a branch whose room was momentarily unfed.
  - **Recommendation:** a spec after Gate B (the next free number, 72); Crawford's call.

  **Description:** Added at Gate A (Crawford, 2026-11-07) to price §5's "dark Signals" row before any spec is written.
  A variant build (scratch only, nothing committed) takes every dark effect out of the graph after boot (its links
  first, then the effect disposed), so its Signals' ConstantSources stop rendering. The variant against the branch at
  T16 (every Phase B cut in), same session, three interleaved rounds, W1 and W2 at Full, 120 s, the census line per
  arm, and one 8 s handler trace per arm for the rendering ConstantSource count. No effect is lit during a run, so the
  variant needs no rebuild path. Recorded as §9: the price, the census, the trace, and whether the fix is worth a spec
  (it would take the next free number).

  **Proof:** a run. Read — the section.

  **Acceptance criteria:**
  - [x] The trace's rendering ConstantSources fall by the dark effects' Signals; the delta and its rounds recorded
        against the band.

  **Verification:**
  - [x] Runs kept and quoted; the section read.

  **Dependencies:** Task 16.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 17: `src/constants/index.ts` — Full at `playback` (G4; taken at Gate A, 2026-11-07)** (2026-11-07, f1ffd3d1)

  **As built (2026-11-07).** `LOAD_PLAYBACK_BELOW = Infinity`, above the whole dial. Fifteen decision-J and boot-hint
  tests were updated, none deleted, and the `?latency=interactive` way back has its own case. One consequence for
  Crawford: the Audio Load readout (`describeLimits`) now ends "latency: Playback (applies on next load)" at every
  position, Full included, so the clause no longer tells positions apart. Crawford dropped it (2026-11-07): Task 17b.

  **Description:** `LOAD_PLAYBACK_BELOW` moves from 0.61 to a value above 1, so `latencyForLoad(1)` is `'playback'` and
  `resolveBootLatencyHint` installs it at Full with no `?latency=`; an explicit `?latency=interactive` still wins. The
  constant's comment names this spec and the way back.

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: `latencyForLoad(1)` is `'playback'`, `(0.6)` and `(0.2)` still
  are; `src/engine/audioContextSetup.test.ts`: the boot hint at Full with no override is `playback`; `?latency=interactive`
  overrides it. The decision-J tests updated, not deleted.

  **Acceptance criteria:**
  - [ ] Every tier boots at `playback` unless `?latency=` says otherwise; the overlay's `latency` line reads it.
  - [ ] B8's A/B (T7) stands as the measurement; no second run unless the build has moved.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts src/engine/audioContextSetup.test.ts` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Gate A (Crawford's yes).

  **Files:** `src/constants/index.ts`, `src/utils/audioBudget.test.ts`, `src/engine/audioContextSetup.test.ts`

  **Estimated scope:** XS (one constant, two tests)

- [x] **Task 17b: `audioBudget.ts`, `settings.ts` — the readout drops its latency clause (added 2026-11-07)** (2026-11-07)

  **As built (2026-11-07).** As described. The four readout tests that pinned `latencyHint: 'interactive'` only to keep
  the clause out now read the dial as it is; the clause's own case became "never names the latency, at either hint".
  Nine tests went RED first. The full suite's one failure, `sceneToOrbiterLocal.test.tsx`, was a timeout beside backlog
  66's: it passes alone in 1.4 s.

  **Description:** With every position at `playback` (T17), the Audio Load readout's last clause, "latency: Playback
  (applies on next load)", reads the same at every position and no longer tells them apart. Crawford's call
  (2026-11-07): drop it. `describeLimits` ends at what is off, and the `settings.quality.limits.latency` content entry
  goes with the clause (the content test fails on an unread key). `LoadLimits.latencyHint`, `latencyForLoad`, the boot
  path, `?latency=` and the `?debug` overlay's `latency` line are unchanged.

  **Proof:** RED test — `src/utils/audioBudget.test.ts`: `describeLimits` at Light, Standard and Full ends at what is
  off, and no dial position names latency; `AudioLoadPanel.test.tsx`: the rendered readout never says "latency".

  **Acceptance criteria:**
  - [ ] The readout reads "Up to 12 robots · 16 notes · all LFOs and drift" at Full and names no latency at any
        position.
  - [ ] The latency hint, the boot path and `?latency=` are untouched.

  **Verification:**
  - [ ] `npx vitest run src/utils/audioBudget.test.ts src/components/panels/screen/console/AudioLoadPanel.test.tsx
        src/content` passes.
  - [ ] `npm run build:types`, `npm run lint` clean.

  **Dependencies:** Task 17.

  **Files:** `src/utils/audioBudget.ts`, `src/content/copy/settings.ts`, `src/utils/audioBudget.test.ts`,
  `src/components/panels/screen/console/AudioLoadPanel.test.tsx`

  **Estimated scope:** XS (one clause and its copy)

- [x] **Task 18: The leaner synth layer (G2b) — a stub, expanded only on Gate A's word** (2026-11-07, spun off)

  **Spun off at Gate A (Crawford, 2026-11-07: "later").** Roadmap
  [69](../todo/roadmap.md#69-the-leaner-synth-layer-robot-voices-on-native-nodes) carries the four slices below and
  the record's §2–§5 as its brief. Nothing of it is built here.

  **Description:** Not built as written. If Gate A keeps G2b, this stub is replaced by its slices as tasks under a
  checkpoint of their own, each RED-tested: **(a)** a native layer behind `createCompositeVoice`'s `LayerRecord`
  surface (an `OscillatorNode` per note with type, detune, phase and pulse width; a native Gain envelope with the stored
  ADSR and curves; portamento as a frequency ramp), chosen by a builder the composite calls, the Tone layer kept behind
  the same interface for headless; **(b)** the live-update `set({ layers })`, the layer gain and detune link targets on
  the native nodes, the swell writes on ADSR, `applyOscDetune` / `applyOscFieldViaSet` on the new shape; **(c)** the
  articulation (`src/engine/articulation.ts`) and `triggerWithCap`'s note path on the native layer; **(d)** the A/B and
  census (expected: 7 fewer nodes a layer), and the listen (spec §5.3: a few robots, branch against base, "nothing
  changed" in Crawford's words). If Gate A spins it off, these four slices and T5–T7's numbers become the brief of a
  new spec under the next free number.

  **Proof:** none here (a stub). Each slice names its RED test when expanded.

  **Acceptance criteria:**
  - [x] Gate A's decision on G2b is recorded on this task: expanded, spun off, or dropped.

  **Dependencies:** Gate A.

  **Files:** `src/engine/audioEngine/compositeVoice.ts` and its test, `src/engine/AudioEngine.ts`, `src/engine/articulation.ts`
  (when expanded)

  **Estimated scope:** L as a whole — to be broken into S/M slices before any is built

### Checkpoint B: The inaudible cuts are in
- [x] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean (any pre-existing unrelated failure
      named). 2026-11-10 on main 5ca8679f's code: types and build clean; lint 0 errors, 4 warnings; 350 files and 13 515
      tests pass, and the exit 1 is only backlog 66's `onTaskUpdate` timeout.
- [x] Every kept cut's A/B and crossing recorded; every dropped cut reverted with its price in the table. (Record
      §6–§8; Crawford kept G1, G2a and G3 on 2026-11-10, so nothing is reverted.)
- [x] One Light run per world reads inside the band against the branch's base (Light did not move the wrong way).
      Light fell 0.055 at G1 and stayed inside the band at G2a and G3 (record §6–§8).
- [x] Reviewed with human before the listen. (The listen ran first, at Crawford's word; he reviewed and kept all three
      cuts after it, on 2026-11-10.)

---

### Gate B: Crawford's ear at full 4K

- [x] **Task 19: The listen, prepared**

  **Description:** The branch's and `main`'s production builds served on two ports (`vite preview`, or the LAN as
  backlog 27's sittings did), the links written out (W1 with `&debug` and `&load=full` on each), and a section in the
  record ("Backlog 67, Gate B") with the protocol (spec §1.6: the 4K monitor, full screen, his Chrome open as on
  2026-11-05, hands off five minutes, the overlay read at 1:00, 3:00 and 5:00, his words verbatim; then `main`; then a
  quarter window if full screen missed; then a Standard and a Light minute) and an empty table to fill.

  **As run (2026-11-10):** prepared in conversation, not ahead in the record. The cuts were already on `main` (PR #607),
  so the pair was the dev server on the branch (5173) against a2a400c1's production build (4181). The protocol and its
  deviations are in record §10.

  **Proof:** Read — the section and the links.

  **Acceptance criteria:**
  - [x] Both builds answer on their ports with the pinned world; the table is ready.

  **Verification:**
  - [ ] Manual read.

  **Dependencies:** Checkpoint B.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

- [x] **Task 20: The listen, recorded (Gate B)**

  **Description:** Crawford runs the protocol; the agent records his words verbatim and the overlay readings
  (`clock`, `underruns`, `sounding`, `fx in`) at the three marks for each run, and the verdict: **pass** (W1 clean by
  ear for five minutes at full screen with his Chrome open; Standard and Light unchanged) → T25; **miss** → Phase B2,
  one candidate at a time, this task re-run after each yes. The quarter-window reading is recorded either way.

  **As run (2026-11-10): pass** (record §10).
  - On W1 at Full, full screen on the 4K, there were 2 underruns, both at power-on, over six minutes with the cuts in,
    against 16 spread through five minutes on a2a400c1. Neither build was heard to click.
  - On Polar Low, the count was 2 against 3 at three minutes.
  - The overlay was read at the end only, so `underruns` is the only reading.
  - His Chrome open was not confirmed.
  - The Standard and Light minute was skipped at Crawford's call, with the reason given in §10.
  - There was no quarter window, because full screen did not miss.

  **Proof:** the listen — Crawford's ear. Read — the section.

  **Acceptance criteria:**
  - [x] The verdict and every reading in the record, the builds named by commit.

  **Verification:**
  - [ ] Manual read.

  **Dependencies:** Task 19.

  **Files:** `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS (a record)

---

### Phase B2: Only on a Gate B miss — the audible candidates, heard one at a time

- [ ] **Task 21: `busFilter.ts` — the bus filter's frequency at k-rate (G5)**

  **Description:** `buildBusFilter` sets `frequency.automationRate = 'k-rate'` on the native node when the property
  exists (read back to confirm). One A/B as T14 (B6 against B6k's price), then **the listen**: Crawford hears W1 and
  W2 at Full against the base, a few minutes each, attending to swept filters under the bank's lanes; his yes keeps
  it at every tier, his no reverts the commit and records the price.

  **Proof:** RED test — `busFilter.test.ts`: the rate is set when the param exposes it and skipped when not.
  The listen.

  **Acceptance criteria:**
  - [ ] The delta reads against B6k − B6 less the band; the crossing is not involved.
  - [ ] Crawford's words and verdict in the record.

  **Verification:**
  - [ ] `npx vitest run src/engine/audioEngine/busFilter.test.ts`; `npm run build:types`, `npm run lint` clean.
  - [ ] The A/B run and the listen recorded.

  **Dependencies:** Task 20 (a miss); Task 12.

  **Files:** `src/engine/audioEngine/busFilter.ts`, `busFilter.test.ts`, `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS

- [ ] **Task 22: `src/data/bands/classic.ts`, `aspects.ts` — the Phaser's seeded stage ceiling (G6a)**

  **Description:** The band table's `phaser.stages` ceiling lowers (12 → 8 is the proposal; about 3.1 ‰ a stage) in
  Classic and in any aspect column that moves it; a world already seeded above the new ceiling is dealt again only by
  its own re-roll, as any band change (pre-v1). If the Stages slider's top becomes unreachable by any seed, the slider's
  range stays and nothing dims (the user may still set 12). One A/B on W1 (does W1 seed a Phaser above 8? the record
  says), then **the listen** on a world that does.

  **Proof:** RED test — `src/data/bands/classic.test.ts` (and the aspects test): the ceiling reads 8. The listen.

  **Acceptance criteria:**
  - [ ] The band ceiling is 8 (or Crawford's number); existing band tests pass with the value updated.
  - [ ] Crawford's verdict in the record.

  **Verification:**
  - [ ] `npx vitest run src/data/bands/classic.test.ts src/data/bands/aspects.test.ts` passes; types, lint clean.

  **Dependencies:** Task 20 (a miss after T21).

  **Files:** `src/data/bands/classic.ts`, `src/data/bands/aspects.ts`, their tests, `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS

- [ ] **Task 23: `tonePatches.ts`, `globalFx.ts` — the AutoWah's rolloff (G6b)**

  **Description:** A `tonePatches.ts` wrapper sets the AutoWah's bandpass rolloff to −24 (or −12) through its
  private `_bandpass` when present, feature-detected, a `devWarn`ed no-op on a Tone that moved, applied where the AutoWah
  is built (`buildGlobalFxChain`); documented as deletable at the Tone upgrade. One A/B, then **the listen** on a world
  whose AutoWah is lit.

  **Proof:** RED test — `src/engine/tonePatches.test.ts`: the patch sets the rolloff on a mock exposing `_bandpass` and
  returns false on one that does not. The listen.

  **Acceptance criteria:**
  - [ ] The rolloff is −24 on a real AutoWah (read back under `?debug` or in the test's mock); Crawford's verdict recorded.

  **Verification:**
  - [ ] `npx vitest run src/engine/tonePatches.test.ts src/engine/audioEngine/globalFx.test.ts`; types, lint clean.

  **Dependencies:** Task 20 (a miss after T22).

  **Files:** `src/engine/tonePatches.ts`, `tonePatches.test.ts`, `src/engine/audioEngine/globalFx.ts`,
  `docs/todo/scratchy-audio-phones.md`

  **Estimated scope:** XS

- [ ] **Task 24: Native Phaser and AutoWah at k-rate (G6c) — its own spec if reached**

  **Description:** Not built here. If T21–T23 are heard and W1 still clicks, the two pedals rebuilt on native biquads
  with k-rate frequency (−37 % / −35 % by the probe's estimate) are a build of their own: a new spec under the next
  free number with this record's numbers as its brief, and this work closes on its numbers (spec §1.6), the quarter-
  window reading saying how much is the raster side.

  **Proof:** Read — the closing section of the record.

  **Acceptance criteria:**
  - [ ] The closing section states the floor and the crest at Full on W1 and W2 after every kept cut, the audible
        verdicts, and what remains; a backlog item is written for the raster side if the quarter window was clean.

  **Dependencies:** Task 20 (a miss after T23).

  **Files:** `docs/todo/scratchy-audio-phones.md`, `docs/todo/backlog.md`

  **Estimated scope:** XS (a record)

---

### Phase C: The pin

- [ ] **Task 25: `docs/PERFORMANCE.md`, the spec §8 — the regression line**

  **Description:** Gate B's passing build, `npm run perf:audio` on W1 at Full, 120 s, three rounds in one sitting
  beside a byte-identical copy (the noise band): the mean capacity and the crest bucket, with the commit, go in
  PERFORMANCE.md's running table (a new dated row under the audio series) and in the spec's §8 "As built", with the
  rule: a later change that reads above the pin by more than that sitting's band on a same-session A/B against the
  pinned commit is a regression to explain in its PR.

  **Proof:** a run. Read — the row and §8.

  **Acceptance criteria:**
  - [ ] The row names the world, the tier, the commit, the mean, the crest and the band.

  **Verification:**
  - [ ] Runs kept and quoted; manual read.

  **Dependencies:** Task 20 (a pass).

  **Files:** `docs/PERFORMANCE.md`, `docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md`

  **Estimated scope:** XS (docs)

---

### Phase D: Docs

- [ ] **Task 26: `docs/AUDIO_SYSTEM.md`, `docs/ROBOT_LIFECYCLE.md`, `docs/PERFORMANCE.md` — document the shipped behaviour**

  **Part brought forward (Crawford, 2026-11-07, before Phase B's code merged).** The statements that code made false
  are corrected: AUDIO_SYSTEM.md's who-stands-by rule (muted robots, the expected admission warning), the latency hint
  (the pure core and "Latency is a load-time decision") and the cells' edges (G3); ROBOT_LIFECYCLE.md rule 6, the
  standing-by paragraph and the power-on pass; POLYPHONY_GUIDE.md's stand-by line. T26 keeps the rest: the native bus
  filter in "Signal Graph", the measured prices, PERFORMANCE.md's census docs and pin row, and a re-check of these
  against the shipped source.

  **Description:** AUDIO_SYSTEM.md "Signal Graph": the per-robot bus after G2a (no composite out Gain; a native bus
  filter) and, if G2b shipped, the layer's shape; "Audio Load Budget": who stands down (muted robots at every tier, solo
  per Q1) and the admission path; "Global Pedals"/"The bypass cells": the cell reaches `effectSend`/`effectReturn`
  (G3); the latency hint if G4 shipped, and a readout that no longer names it (T17b); an admission's Tone warning,
  expected (T10 dropped). ROBOT_LIFECYCLE.md rule 6 and the "Standing-by robots keep the whole
  lifecycle" paragraph: a docked robot's voice is released after its last note and rebuilt the tick it is admitted
  after undocking; the melody stays registered. PERFORMANCE.md: `perf:audio-census` (flags, the source-map note, first
  use), the forced GC before the census line, the pin row (T25). Every named identifier spot-checked against the
  shipped source.

  **Proof:** Read — human review. No test file.

  **Acceptance criteria:**
  - [ ] Every documented name and behaviour matches the shipped code; dropped cuts are not documented as shipped.

  **Verification:**
  - [ ] Manual review against source; `npm run lint` clean.

  **Dependencies:** Task 25.

  **Files:** `docs/AUDIO_SYSTEM.md`, `docs/ROBOT_LIFECYCLE.md`, `docs/PERFORMANCE.md`

  **Estimated scope:** XS (docs only)

- [ ] **Task 27: `docs/todo/backlog.md`, `docs/todo/plan.md`, the spec §8 — the Built line and the archive**

  **Description:** Backlog 67 gets its **Built** line (the cuts kept, Gate B's verdict and date, the pin, the PR) and
  moves to the archive at merge with its links rebased; plan.md's Stage 1 line is deleted; backlog 68's note gains one
  sentence on what the lean graph left for it; the spec's §8 "As built" lists where the shipped cuts differ from §1.3's
  shapes and the Gate B record; if G2b or the native pedals were spun off, their new number and intent pointer are
  written in the roadmap or backlog.

  **Proof:** Read — human review.

  **Acceptance criteria:**
  - [ ] The three todo files agree on 67's state; the counter in the backlog header is right.

  **Verification:**
  - [ ] Manual read; `npm run lint` clean.

  **Dependencies:** Task 26.

  **Files:** `docs/todo/backlog.md`, `docs/todo/archive/backlog-archive.md`, `docs/todo/plan.md`,
  `docs/specs/DESKTOP_FULL_TIER_STANDING_COST.md`

  **Estimated scope:** XS (docs only)

### Checkpoint: Complete
- [ ] `npm run build:types`, `npm run lint`, `npm test`, `npm run build` all clean.
- [ ] Every kept cut has its RED test, its A/B and (where it has one) its crossing in the record; every dropped cut its
      price.
- [ ] Gate B passed (or the closing section states why not and what was spun off); the pin recorded.
- [ ] Docs reflect the shipped code — every documented name spot-checked.
- [ ] Any outstanding manual check flagged here, never silently skipped.
- [ ] Ready for Crawford's PR.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| The floor arithmetic (spec assumption 1) is wrong and the docked voices are not the standing floor's bulk at Full | Medium | T6's B1 and B2 price it directly before any cut; T8 says whether it held; Gate A re-orders on the numbers |
| An admitted robot's first note is late or clicks (a rebuild inside the live graph) | High | H2 measured the same path at ×1.000 and on-time onset; T11 re-measures with the docked case; the sends keep their 50 ms fade from `now()` (T10 dropped) |
| Solo stands eleven robots down and un-solo rebuilds eleven at once | Medium | Solo-silenced robots are excluded in T9; T11 measures the burst anyway, for the record; solo joins G1 only on a clean reading |
| A native bus filter breaks a path that assumed a Tone node (`rampTo`, `dispose`, the link's `override`) | Medium | T12's RED tests cover the write paths and the link; the stub and Tone fallbacks stay; T14's census confirms the node count |
| `effectSend`/`effectReturn` are `protected` and could move in a Tone release | Low | T15 feature-detects and falls back to today's edges with a `devWarn`; backlog 34 (the Tone upgrade) names it |
| The ablation sitting is noisy (backlog 27's T15 saw bands of 0.1 with Chrome open) | Medium | The noise band is measured first in every sitting; nothing but VS Code open for the A/Bs; a delta under the band is "below noise", not a result |
| The call-site census misattributes Tone plumbing to whichever app frame called into Tone | Low | That is the intended attribution (the maker is the app function); the top Tone frame is recorded beside it in the JSON so a second reading is possible |
| Gate B passes at a quarter window but not full screen, and the audible listens are exhausted | Medium | Spec §1.6: the work closes on its numbers, and the raster remainder becomes a backlog item with the two readings; no robot cap is proposed |
| G2b is kept and balloons | High | T18 is a stub by design; it is expanded into S/M slices under its own checkpoint before a line is written, or spun off |

## Open Questions

1. **Solo in G1** (spec §7 Q1). **Resolved for planning** (Architecture Decisions): muted robots only; solo-silenced
   keep their voices; T11 measures the un-solo burst for the record. Crawford confirms or changes at T0/Gate A.
2. **G2b here or its own phase** (spec §7 Q2). **Open** — Gate A, on T6/T7's per-sounding-robot price at the crest;
   T18 is the stub either way.
3. **Full at `playback`** (spec §7 Q3). **Open** — Gate A, on B8's crest underruns; T17 built only on a yes.
4. **The listen's length and condition** (spec §7 Q4). **Resolved for planning**: five minutes, full screen, his Chrome
   open, W1; a quarter window on a miss; a Standard and a Light minute. Crawford may shorten or add at T19.
5. **W2** (spec §7 Q5). **Resolved for planning**: `bravo:-150:90`; a third world only on Gate A's ask.
6. **The census's build** (spec §7 Q6). **Resolved**: a `vite build --sourcemap` throwaway served beside stock.
7. **Numbering** (spec §7 Q7). **Resolved**: backlog 67's own fix; spin-offs take the next free number.
8. **The pin's home** (spec §7 Q8). **Resolved for planning**: PERFORMANCE.md's running table, one row, and spec §8.
